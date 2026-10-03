import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MAX_SAVED_TOPICS,
  DEFAULT_PREFERENCES,
  DEFAULT_AGENT_BUDGET,
  DEFAULT_RETENTION_MS,
  HISTORY_RETENTION_OPTIONS,
  MAX_TASK_RETENTION_MS,
  PREFERENCE_RANGES,
  AGENT_BUDGET_PRESETS,
  defaultPreferences,
  formatExpiresIn,
  normalizePreferences,
  normalizeTaskLimits,
  preferencesEqual,
  clampAgentBudget,
  resolveAgentBudget,
  resolveRetention,
  resolveTopicPageLimit,
  retentionEqual,
  snapshotTaskLimits,
  validatePreferences
} from '../src/shared/preferences.mjs';
import { MAX_AGENT_STEPS } from '../src/shared/agent-activity.mjs';

const DAY = 24 * 60 * 60 * 1000;

// ---------- normalization / migration ----------

test('missing or garbage preferences normalize to the defaults', () => {
  for (const value of [undefined, null, 'x', 42, [], {}]) {
    assert.deepEqual(normalizePreferences(value), {
      researchDepth: 'balanced',
      customBudget: { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 },
      topicPageMode: 'all',
      topicPageLimit: 20,
      historyRetention: '1d',
      maxSavedTopics: 40,
      showForumButton: true
    });
  }
  assert.deepEqual(defaultPreferences(), normalizePreferences(DEFAULT_PREFERENCES));
});

test('partial (older) preferences keep what they have and fill in the rest', () => {
  const migrated = normalizePreferences({ historyRetention: '7d', customBudget: { maxTopicReads: 9 } });
  assert.equal(migrated.historyRetention, '7d');
  assert.equal(migrated.researchDepth, 'balanced');
  assert.deepEqual(migrated.customBudget, { maxSteps: 15, maxTopicReads: 9, maxCharsPerRead: 30000 });
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
    customBudget: { maxSteps: 99, maxTopicReads: 0, maxCharsPerRead: '7000.6' },
    topicPageLimit: -5,
    historyRetention: '2y',
    maxSavedTopics: 5000
  });
  assert.equal(normalized.researchDepth, 'balanced');
  assert.deepEqual(normalized.customBudget, { maxSteps: 40, maxTopicReads: 1, maxCharsPerRead: 7001 });
  assert.equal(normalized.topicPageLimit, 1);
  assert.equal(normalized.historyRetention, '1d');
  assert.equal(normalized.maxSavedTopics, 200);
  assert.equal(normalizePreferences({ topicPageLimit: '' }).topicPageLimit, 20, 'empty → default');
  assert.equal(preferencesEqual({}, DEFAULT_PREFERENCES), true);
});

test('the forum button is shown by default and only a boolean turns it off', () => {
  assert.equal(DEFAULT_PREFERENCES.showForumButton, true);
  assert.equal(normalizePreferences({}).showForumButton, true, 'older stored preferences keep the button');
  assert.equal(normalizePreferences({ showForumButton: false }).showForumButton, false);
  assert.equal(normalizePreferences({ showForumButton: true }).showForumButton, true);
  for (const junk of ['false', 0, null, 'no']) {
    assert.equal(normalizePreferences({ showForumButton: junk }).showForumButton, true, `${junk} falls back to the default`);
  }
  assert.equal(validatePreferences({ ...defaultPreferences(), showForumButton: false }).preferences.showForumButton, false);
  assert.equal(preferencesEqual({ showForumButton: false }, DEFAULT_PREFERENCES), false);
});

test('retention and saved-topic defaults come from the preferences', () => {
  assert.equal(DEFAULT_RETENTION_MS, resolveRetention(undefined).chatMs);
  assert.equal(DEFAULT_MAX_SAVED_TOPICS, resolveRetention(undefined).maxSavedTopics);
  assert.equal(DEFAULT_AGENT_BUDGET.maxTopicReads, resolveAgentBudget(undefined).maxTopicReads);
  assert.equal(DEFAULT_AGENT_BUDGET.maxSteps, resolveAgentBudget(undefined).maxSteps);
});

// ---------- validation ----------

test('validation reports per-field errors without clamping', () => {
  const invalid = validatePreferences({
    ...defaultPreferences(),
    researchDepth: 'custom',
    customBudget: { maxSteps: '0', maxTopicReads: '2', maxCharsPerRead: 'lots' },
    topicPageMode: 'limit',
    topicPageLimit: '101',
    maxSavedTopics: '9'
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.preferences, null);
  assert.deepEqual(Object.keys(invalid.fieldErrors).sort(), ['maxCharsPerRead', 'maxSavedTopics', 'maxSteps', 'topicPageLimit']);
  assert.match(invalid.fieldErrors.topicPageLimit, /from 1 to 100/);
  assert.equal(invalid.errors.length, 4);

  assert.equal(
    validatePreferences({ ...defaultPreferences(), topicPageMode: 'limit', topicPageLimit: '2.5' }).fieldErrors.topicPageLimit
      !== undefined,
    true
  );
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

test('custom budget fields are only validated while Custom is chosen', () => {
  const draft = {
    ...defaultPreferences(),
    researchDepth: 'quick',
    customBudget: { maxSteps: '', maxTopicReads: 'x', maxCharsPerRead: 99 }
  };
  assert.equal(validatePreferences(draft).valid, true);
  assert.equal(validatePreferences({ ...draft, researchDepth: 'custom' }).valid, false);
});

test('valid string input validates to normalized numbers', () => {
  const result = validatePreferences({
    ...defaultPreferences(),
    researchDepth: 'custom',
    customBudget: { maxSteps: '20', maxTopicReads: '12', maxCharsPerRead: ' 40000 ' },
    topicPageMode: 'limit',
    topicPageLimit: '50'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.preferences.customBudget, { maxSteps: 20, maxTopicReads: 12, maxCharsPerRead: 40000 });
  assert.equal(result.preferences.topicPageLimit, 50);
  assert.equal(resolveTopicPageLimit(result.preferences), 50);
});

// ---------- effective values ----------

test('resolveAgentBudget maps presets and custom values', () => {
  assert.deepEqual(resolveAgentBudget({}), { depth: 'balanced', maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 });
  assert.deepEqual(resolveAgentBudget({ researchDepth: 'quick' }), {
    depth: 'quick',
    maxSteps: 6,
    maxTopicReads: 3,
    maxCharsPerRead: 12000
  });
  assert.deepEqual(resolveAgentBudget({ researchDepth: 'thorough' }), {
    depth: 'thorough',
    maxSteps: 25,
    maxTopicReads: 14,
    maxCharsPerRead: 45000
  });
  const custom = resolveAgentBudget({ researchDepth: 'custom', customBudget: { maxSteps: 12, maxTopicReads: 5, maxCharsPerRead: 20000 } });
  assert.deepEqual(custom, { depth: 'custom', maxSteps: 12, maxTopicReads: 5, maxCharsPerRead: 20000 });
  // Custom values are remembered while a preset is active, but not applied.
  assert.equal(
    resolveAgentBudget({ researchDepth: 'quick', customBudget: { maxSteps: 40, maxTopicReads: 20, maxCharsPerRead: 60000 } }).maxTopicReads,
    3
  );
});

test('the presets and the largest budget fit the hard caps', () => {
  for (const preset of Object.values(AGENT_BUDGET_PRESETS)) {
    for (const [field, value] of Object.entries(preset)) {
      assert.ok(value >= PREFERENCE_RANGES[field].min && value <= PREFERENCE_RANGES[field].max, field);
    }
  }
  // A few follow-ups at the largest budget still fit the stored step limit.
  assert.ok(PREFERENCE_RANGES.maxSteps.max * 5 <= MAX_AGENT_STEPS);
  assert.deepEqual(clampAgentBudget({ maxSteps: 500, maxTopicReads: -3, maxCharsPerRead: 1 }), {
    maxSteps: 40,
    maxTopicReads: 1,
    maxCharsPerRead: 5000
  });
  assert.deepEqual(clampAgentBudget(undefined), DEFAULT_AGENT_BUDGET);
});

test('stored research settings from before the agent become an equivalent budget', () => {
  // Old custom limits: 2 queries × 2 pages, 7 discussions → 4 + 7 + 2 steps.
  const migrated = normalizePreferences({
    researchDepth: 'custom',
    customResearch: { searchQueries: 2, searchPages: 2, topicsRead: 7 }
  });
  assert.equal(migrated.researchDepth, 'custom', 'the chosen depth is kept');
  assert.deepEqual(migrated.customBudget, { maxSteps: 13, maxTopicReads: 7, maxCharsPerRead: 30000 });
  assert.equal('customResearch' in migrated, false);
  assert.deepEqual(resolveAgentBudget(migrated), { depth: 'custom', maxSteps: 13, maxTopicReads: 7, maxCharsPerRead: 30000 });
  // Old presets keep their names; a new customBudget wins over leftover old limits.
  assert.equal(normalizePreferences({ researchDepth: 'thorough', customResearch: { topicsRead: 10 } }).researchDepth, 'thorough');
  assert.equal(normalizePreferences({ customResearch: { topicsRead: 3 }, customBudget: { maxSteps: 9 } }).customBudget.maxSteps, 9);
  // Out-of-range old values are clamped before the conversion.
  assert.equal(
    normalizePreferences({ customResearch: { searchQueries: 99, searchPages: 99, topicsRead: 99 } }).customBudget.maxSteps,
    26,
    'the old maximum: 4 × 3 searches + 12 reads + 2'
  );
});

test('resolveTopicPageLimit and resolveRetention', () => {
  assert.equal(resolveTopicPageLimit({ topicPageMode: 'limit', topicPageLimit: 7 }), 7);
  assert.equal(resolveTopicPageLimit({ topicPageMode: 'limit', topicPageLimit: 500 }), 100);
  assert.equal(resolveTopicPageLimit(undefined), null);

  const oneDay = resolveRetention({});
  assert.deepEqual(oneDay, {
    historyRetention: '1d',
    label: '1 day',
    forever: false,
    chatMs: DAY,
    agentMs: DAY,
    taskMs: DAY,
    maxSavedTopics: 40
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
  assert.deepEqual(
    HISTORY_RETENTION_OPTIONS.map(option => option.value),
    ['1d', '3d', '7d', '30d', 'forever']
  );
});

// ---------- per-task snapshot ----------

test('snapshotTaskLimits takes only what each task type uses', () => {
  const preferences = { researchDepth: 'thorough', topicPageMode: 'limit', topicPageLimit: 5 };
  assert.deepEqual(snapshotTaskLimits('agent', preferences), { agent: { maxSteps: 25, maxTopicReads: 14, maxCharsPerRead: 45000 } });
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
  assert.deepEqual(normalizeTaskLimits('agent', { agent: { maxSteps: 99, maxTopicReads: 4, maxCharsPerRead: 100 } }), {
    agent: { maxSteps: 40, maxTopicReads: 4, maxCharsPerRead: 5000 }
  });
  // A task queued before the agent still carries research limits.
  assert.deepEqual(normalizeTaskLimits('agent', { research: { searchQueries: 3, searchPages: 1, topicsRead: 6, rawFallbacks: 3 } }), {
    agent: { maxSteps: 11, maxTopicReads: 6, maxCharsPerRead: 30000 }
  });
  assert.equal(normalizeTaskLimits('agent', { research: 'junk' }), null);
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
