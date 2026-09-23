import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PREFERENCES,
  HISTORY_RETENTION_OPTIONS,
  MAX_TASK_RETENTION_MS,
  PREFERENCE_RANGES,
  RESEARCH_PRESETS,
  defaultPreferences,
  formatExpiresIn,
  normalizePreferences,
  normalizeTaskLimits,
  preferencesEqual,
  researchRequestBudget,
  resolveResearchLimits,
  resolveRetention,
  resolveTopicPageLimit,
  retentionEqual,
  snapshotTaskLimits,
  validatePreferences
} from '../src/shared/preferences.mjs';
import { FORUM_TOOL_LIMITS } from '../src/background/forum-tools.mjs';
import { MAX_AGENT_SEARCH_QUERIES, MAX_AGENT_TOOL_CALLS } from '../src/shared/agent-activity.mjs';
import { AGENT_CONTEXT_LIMITS } from '../src/services/agent-context.mjs';

const DAY = 24 * 60 * 60 * 1000;

// ---------- normalization / migration ----------

test('missing or garbage preferences normalize to the defaults', () => {
  for (const value of [undefined, null, 'x', 42, [], {}]) {
    assert.deepEqual(normalizePreferences(value), {
      researchDepth: 'balanced',
      customResearch: { searchQueries: 3, searchPages: 1, topicsRead: 6 },
      topicPageMode: 'all',
      topicPageLimit: 20,
      historyRetention: '1d',
      maxSavedTopics: 40
    });
  }
  assert.deepEqual(defaultPreferences(), normalizePreferences(DEFAULT_PREFERENCES));
});

test('partial (older) preferences keep what they have and fill in the rest', () => {
  const migrated = normalizePreferences({ historyRetention: '7d', customResearch: { topicsRead: 9 } });
  assert.equal(migrated.historyRetention, '7d');
  assert.equal(migrated.researchDepth, 'balanced');
  assert.deepEqual(migrated.customResearch, { searchQueries: 3, searchPages: 1, topicsRead: 9 });
  assert.equal(migrated.topicPageLimit, 20);
  assert.equal(migrated.topicPageMode, 'all');
});

test('by default every page of a topic is read', () => {
  assert.equal(DEFAULT_PREFERENCES.topicPageMode, 'all');
  assert.equal(defaultPreferences().topicPageMode, 'all');
  assert.equal(resolveTopicPageLimit(undefined), null);
  assert.equal(resolveTopicPageLimit({}), null);
  assert.equal(resolveTopicPageLimit(defaultPreferences()), null);
});

test('older preferences with a page limit but no mode read as every page, keeping the number', () => {
  // Before topicPageMode existed, topicPageLimit (20) was written on every
  // save, so a stored number is not a choice the user made.
  const migrated = normalizePreferences({ researchDepth: 'quick', topicPageLimit: 35 });
  assert.equal(migrated.topicPageMode, 'all');
  assert.equal(migrated.topicPageLimit, 35, 'offered when the user picks a limit');
  assert.equal(resolveTopicPageLimit({ topicPageLimit: 35 }), null);
  assert.equal(normalizePreferences({ topicPageMode: 'some' }).topicPageMode, 'all', 'unknown mode → default');
});

test('switching between every page and a limit', () => {
  const all = normalizePreferences({ topicPageMode: 'all', topicPageLimit: 7 });
  assert.equal(resolveTopicPageLimit(all), null);
  const limited = normalizePreferences({ ...all, topicPageMode: 'limit' });
  assert.equal(resolveTopicPageLimit(limited), 7, 'the remembered limit applies');
  assert.equal(resolveTopicPageLimit({ ...limited, topicPageMode: 'all' }), null);
  assert.equal(resolveTopicPageLimit({ topicPageMode: 'limit' }), 20, 'limit mode defaults to 20 pages');
  assert.equal(preferencesEqual(all, limited), false);
});

test('stored numbers are clamped and rounded; unknown enums fall back', () => {
  const normalized = normalizePreferences({
    researchDepth: 'extreme',
    customResearch: { searchQueries: 99, searchPages: 0, topicsRead: '7.6' },
    topicPageLimit: -5,
    historyRetention: '2y',
    maxSavedTopics: 5000
  });
  assert.equal(normalized.researchDepth, 'balanced');
  assert.deepEqual(normalized.customResearch, { searchQueries: 4, searchPages: 1, topicsRead: 8 });
  assert.equal(normalized.topicPageLimit, 1);
  assert.equal(normalized.historyRetention, '1d');
  assert.equal(normalized.maxSavedTopics, 200);
  assert.equal(normalizePreferences({ topicPageLimit: '' }).topicPageLimit, 20, 'empty → default');
  assert.equal(preferencesEqual({}, DEFAULT_PREFERENCES), true);
});

// ---------- validation ----------

test('validation reports per-field errors without clamping', () => {
  const invalid = validatePreferences({
    ...defaultPreferences(),
    researchDepth: 'custom',
    customResearch: { searchQueries: '0', searchPages: '2', topicsRead: 'lots' },
    topicPageMode: 'limit',
    topicPageLimit: '101',
    maxSavedTopics: '9'
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.preferences, null);
  assert.deepEqual(Object.keys(invalid.fieldErrors).sort(),
    ['maxSavedTopics', 'searchQueries', 'topicPageLimit', 'topicsRead']);
  assert.match(invalid.fieldErrors.topicPageLimit, /from 1 to 100/);
  assert.equal(invalid.errors.length, 4);

  assert.equal(validatePreferences({ ...defaultPreferences(), topicPageMode: 'limit', topicPageLimit: '2.5' }).fieldErrors.topicPageLimit !== undefined, true);
});

test('the page limit is only validated while a limit is chosen', () => {
  const draft = { ...defaultPreferences(), topicPageMode: 'all', topicPageLimit: '500' };
  const all = validatePreferences(draft);
  assert.equal(all.valid, true);
  assert.equal(all.preferences.topicPageMode, 'all');
  assert.equal(all.preferences.topicPageLimit, 100, 'the remembered value is still kept in range');
  const limit = validatePreferences({ ...draft, topicPageMode: 'limit' });
  assert.equal(limit.valid, false);
  assert.match(limit.fieldErrors.topicPageLimit, /Pages read per topic must be a whole number from 1 to 100/);
});

test('custom research fields are only validated while Custom is chosen', () => {
  const draft = {
    ...defaultPreferences(),
    researchDepth: 'quick',
    customResearch: { searchQueries: '', searchPages: 'x', topicsRead: 99 }
  };
  assert.equal(validatePreferences(draft).valid, true);
  assert.equal(validatePreferences({ ...draft, researchDepth: 'custom' }).valid, false);
});

test('valid string input validates to normalized numbers', () => {
  const result = validatePreferences({
    ...defaultPreferences(),
    researchDepth: 'custom',
    customResearch: { searchQueries: '2', searchPages: '3', topicsRead: ' 12 ' },
    topicPageMode: 'limit',
    topicPageLimit: '50'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.preferences.customResearch, { searchQueries: 2, searchPages: 3, topicsRead: 12 });
  assert.equal(result.preferences.topicPageLimit, 50);
  assert.equal(resolveTopicPageLimit(result.preferences), 50);
});

// ---------- effective values ----------

test('resolveResearchLimits maps presets and custom values', () => {
  assert.deepEqual(resolveResearchLimits({}), {
    depth: 'balanced', searchQueries: 3, searchPages: 1, topicsRead: 6, rawFallbacks: 3
  });
  assert.deepEqual(resolveResearchLimits({ researchDepth: 'quick' }), {
    depth: 'quick', searchQueries: 1, searchPages: 1, topicsRead: 3, rawFallbacks: 2
  });
  assert.equal(resolveResearchLimits({ researchDepth: 'thorough' }).searchPages, 2);
  const custom = resolveResearchLimits({
    researchDepth: 'custom',
    customResearch: { searchQueries: 2, searchPages: 3, topicsRead: 11 }
  });
  assert.deepEqual(custom, { depth: 'custom', searchQueries: 2, searchPages: 3, topicsRead: 11, rawFallbacks: 6 });
  // Custom values are remembered while a preset is active, but not applied.
  assert.equal(resolveResearchLimits({
    researchDepth: 'quick',
    customResearch: { searchQueries: 4, searchPages: 3, topicsRead: 12 }
  }).topicsRead, 3);
});

test('the largest research budget fits the hard caps', () => {
  const max = {
    searchQueries: PREFERENCE_RANGES.searchQueries.max,
    searchPages: PREFERENCE_RANGES.searchPages.max,
    topicsRead: PREFERENCE_RANGES.topicsRead.max
  };
  assert.ok(max.searchPages <= FORUM_TOOL_LIMITS.maxSearchPage);
  assert.ok(max.searchQueries * max.searchPages <= MAX_AGENT_SEARCH_QUERIES);
  // search calls + (metadata + posts + raw fallback) per discussion.
  assert.ok(max.searchQueries * max.searchPages + max.topicsRead * 3 <= MAX_AGENT_TOOL_CALLS);
  assert.ok(max.topicsRead <= AGENT_CONTEXT_LIMITS.maxSourceCount);
  for (const preset of Object.values(RESEARCH_PRESETS)) {
    for (const [field, value] of Object.entries(preset)) {
      assert.ok(value >= PREFERENCE_RANGES[field].min && value <= PREFERENCE_RANGES[field].max);
    }
  }
  assert.equal(researchRequestBudget(resolveResearchLimits({})), 15);
});

test('resolveTopicPageLimit and resolveRetention', () => {
  assert.equal(resolveTopicPageLimit({ topicPageMode: 'limit', topicPageLimit: 7 }), 7);
  assert.equal(resolveTopicPageLimit({ topicPageMode: 'limit', topicPageLimit: 500 }), 100);
  assert.equal(resolveTopicPageLimit(undefined), null);

  const oneDay = resolveRetention({});
  assert.deepEqual(oneDay, {
    historyRetention: '1d', label: '1 day', forever: false,
    chatMs: DAY, agentMs: DAY, taskMs: DAY, maxSavedTopics: 40
  });
  const month = resolveRetention({ historyRetention: '30d', maxSavedTopics: 80 });
  assert.equal(month.chatMs, 30 * DAY);
  assert.equal(month.taskMs, MAX_TASK_RETENTION_MS, 'task list entries never outlive a week');
  assert.equal(month.maxSavedTopics, 80);
  const forever = resolveRetention({ historyRetention: 'forever' });
  assert.equal(forever.forever, true);
  assert.equal(forever.chatMs, Infinity);
  assert.equal(forever.taskMs, MAX_TASK_RETENTION_MS);
  assert.equal(retentionEqual(oneDay, resolveRetention({})), true);
  assert.equal(retentionEqual(oneDay, month), false);
  assert.deepEqual(HISTORY_RETENTION_OPTIONS.map(option => option.value), ['1d', '3d', '7d', '30d', 'forever']);
});

// ---------- per-task snapshot ----------

test('snapshotTaskLimits takes only what each task type uses', () => {
  const preferences = { researchDepth: 'thorough', topicPageMode: 'limit', topicPageLimit: 5 };
  assert.deepEqual(snapshotTaskLimits('agent', preferences), {
    research: { searchQueries: 4, searchPages: 2, topicsRead: 10, rawFallbacks: 5 }
  });
  assert.deepEqual(snapshotTaskLimits('summary', preferences), { topicPageLimit: 5 });
  assert.deepEqual(snapshotTaskLimits('chat', preferences), { topicPageLimit: 5 });
  assert.deepEqual(snapshotTaskLimits('other', preferences), {});
  // Every page (the default) is captured as null.
  assert.deepEqual(snapshotTaskLimits('summary', {}), { topicPageLimit: null });
  assert.deepEqual(snapshotTaskLimits('chat', { topicPageMode: 'all', topicPageLimit: 5 }), { topicPageLimit: null });
});

test('normalizeTaskLimits keeps snapshots in range and ignores records without them', () => {
  assert.equal(normalizeTaskLimits('agent', undefined), null);
  assert.equal(normalizeTaskLimits('summary', {}), null);
  assert.deepEqual(normalizeTaskLimits('summary', { topicPageLimit: 999 }), { topicPageLimit: 100 });
  // null is "every page", not a missing snapshot (and never clamped to 1).
  assert.deepEqual(normalizeTaskLimits('summary', { topicPageLimit: null }), { topicPageLimit: null });
  assert.deepEqual(normalizeTaskLimits('chat', { topicPageLimit: null }), { topicPageLimit: null });
  assert.deepEqual(normalizeTaskLimits('agent', {
    research: { searchQueries: 9, searchPages: 2, topicsRead: 4, rawFallbacks: 50 }
  }), { research: { searchQueries: 4, searchPages: 2, topicsRead: 4, rawFallbacks: 4 } });
});

// ---------- labels ----------

test('formatExpiresIn uses hours up to two days, then days', () => {
  const now = 1_000_000;
  assert.equal(formatExpiresIn(0, now), '');
  assert.equal(formatExpiresIn(now - 1, now), '');
  assert.equal(formatExpiresIn(now + 90 * 60 * 1000, now), 'expires in 2h');
  assert.equal(formatExpiresIn(now + 2 * DAY, now), 'expires in 48h');
  assert.equal(formatExpiresIn(now + 29.5 * DAY, now), 'expires in 30d');
});
