import test from 'node:test';
import assert from 'node:assert/strict';

import { partitionTasks, resolveIdleStatus, shouldRederiveStatus } from '../src/popup/ui-state.mjs';
import {
  cleanTopicTitle,
  collectForumNames,
  forumAccentHue,
  forumHostname,
  forumInitial,
  groupByForum,
  resolveForumName
} from '../src/popup/forum-names.mjs';
import {
  getDefaultActivityTab,
  isAgentAnswerUnopened,
  mergeAgentRunState,
  selectAgentRunView,
  selectSavedAgentActivities
} from '../src/popup/agent-runs.mjs';
import { describeAgentProgress } from '../src/popup/agent-answer-view.mjs';
import { linkifyCitations } from '../src/popup/markdown.mjs';
import { getChatCountLabel } from '../src/popup/chat-view.mjs';
import { getSummaryActionLabel } from '../src/popup/topic-controls.mjs';

const HOUR = 60 * 60 * 1000;

test('summary action labels describe the current state without trailing ellipses', () => {
  assert.equal(getSummaryActionLabel(), 'Create summary');
  assert.equal(getSummaryActionLabel({ hasSummary: true }), 'Check for new replies');
  assert.equal(getSummaryActionLabel({ isHydrating: true }), 'Loading saved summary');
  assert.equal(getSummaryActionLabel({ taskStatus: 'queued', taskPhase: 'queued' }), 'Summary queued');
  assert.equal(getSummaryActionLabel({ taskStatus: 'running', taskPhase: 'fetching' }), 'Reading replies');
  assert.equal(getSummaryActionLabel({ taskStatus: 'running', taskPhase: 'generating' }), 'Creating summary');
  assert.equal(getSummaryActionLabel({ isSubmitting: true }), 'Starting summary');
});

test('tasks are split into active and recent with active work first', () => {
  const tasks = [
    { id: 'old', status: 'completed', createdAt: 100 },
    { id: 'queued', status: 'queued', createdAt: 200 },
    { id: 'failed', status: 'failed', createdAt: 300 },
    { id: 'running', status: 'running', createdAt: 400 }
  ];

  assert.deepEqual(
    partitionTasks(tasks).active.map(task => task.id),
    ['running', 'queued']
  );
  assert.deepEqual(
    partitionTasks(tasks).recent.map(task => task.id),
    ['failed', 'old']
  );
});

test('activity opens tasks only when unfinished work needs attention', () => {
  assert.equal(getDefaultActivityTab([]), 'saved');
  assert.equal(getDefaultActivityTab([{ status: 'completed' }]), 'saved');
  assert.equal(getDefaultActivityTab([{ status: 'running' }]), 'tasks');
  const now = 10 * HOUR;
  const unopened = { status: 'completed', completedAt: now - HOUR, lastOpenedAt: 0 };
  assert.equal(getDefaultActivityTab([], [unopened], { now }), 'tasks');
  assert.equal(getDefaultActivityTab([], [{ ...unopened, lastOpenedAt: now - 30 * 60000 }], { now }), 'saved');
  assert.equal(getDefaultActivityTab([], [{ ...unopened, dismissedAt: now }], { now }), 'saved');
  assert.equal(getDefaultActivityTab([], [{ ...unopened, completedAt: now - 30 * HOUR }], { now: now + 30 * HOUR }), 'saved');
  assert.equal(getDefaultActivityTab([], [{ status: 'cancelled', completedAt: now }], { now }), 'saved');
});

test('an answer is unopened until viewed after it finished', () => {
  assert.equal(isAgentAnswerUnopened({ status: 'completed', completedAt: 5, lastOpenedAt: 4 }), true);
  assert.equal(isAgentAnswerUnopened({ status: 'completed', completedAt: 5, lastOpenedAt: 5 }), false);
  assert.equal(isAgentAnswerUnopened({ status: 'failed', completedAt: 5 }), true);
  assert.equal(isAgentAnswerUnopened({ status: 'running', completedAt: 0 }), false);
});

const FORUM_A = 'https://www.uscardforum.com';
const FORUM_B = 'https://meta.discourse.org';

function run(id, overrides = {}) {
  return {
    activityId: id,
    siteUrl: FORUM_A,
    status: 'completed',
    createdAt: 1000,
    updatedAt: 2000,
    completedAt: 2000,
    lastOpenedAt: 0,
    dismissedAt: 0,
    ...overrides
  };
}

test('the inline Agent panel shows the latest undismissed run for the current forum', () => {
  const now = 3000;
  const older = run('older', { createdAt: 500 });
  const newer = run('newer', { createdAt: 900 });
  const otherForum = run('other', { siteUrl: FORUM_B, createdAt: 1500 });
  assert.deepEqual(selectAgentRunView([older, newer, otherForum], `${FORUM_A}/`, { now }), { mode: 'panel', activity: newer, kind: '' });
  assert.equal(selectAgentRunView([older, newer], FORUM_A, { now, preferredId: 'older' }).activity, older);
  assert.equal(selectAgentRunView([older, { ...newer, dismissedAt: 2500 }], FORUM_A, { now }).activity, older);
  // Finished runs age out after a day; running ones never do.
  const later = 2000 + 25 * HOUR;
  assert.equal(selectAgentRunView([newer], FORUM_A, { now: later }).mode, 'none');
  assert.equal(selectAgentRunView([run('live', { status: 'running', completedAt: 0 })], FORUM_A, { now: later }).mode, 'panel');
  assert.equal(selectAgentRunView([run('gone', { status: 'expired' })], FORUM_A, { now }).mode, 'none');
});

test('other forums surface as a pill only while their run needs attention', () => {
  const now = 3000;
  assert.deepEqual(selectAgentRunView([run('ready')], FORUM_B, { now }), { mode: 'pill', activity: run('ready'), kind: 'ready' });
  assert.equal(selectAgentRunView([run('seen', { lastOpenedAt: 2500 })], FORUM_B, { now }).mode, 'none');
  assert.equal(selectAgentRunView([run('live', { status: 'running', completedAt: 0 })], FORUM_B, { now }).kind, 'running');
  assert.equal(selectAgentRunView([run('login', { status: 'waiting_user_action', completedAt: 0 })], '', { now }).kind, 'waiting');
  assert.equal(selectAgentRunView([run('broke', { status: 'failed' })], FORUM_B, { now }).kind, 'failed');
  assert.equal(selectAgentRunView([run('stopped', { status: 'cancelled' })], FORUM_B, { now }).mode, 'none');
  assert.equal(selectAgentRunView([run('hidden', { dismissedAt: 2500 })], FORUM_B, { now }).mode, 'none');
});

test('queue status fills in until the Agent activity settles', () => {
  const activity = run('a', { status: 'queued', completedAt: 0, statusText: 'Waiting…', progress: null });
  const merged = mergeAgentRunState(activity, {
    status: 'running',
    statusText: 'Searching…',
    progress: { percent: 10 }
  });
  assert.equal(merged.status, 'running');
  assert.equal(merged.statusText, 'Searching…');
  assert.deepEqual(merged.progress, { percent: 10 });

  const cancelled = mergeAgentRunState({ ...activity, status: 'running' }, { status: 'cancelled', updatedAt: 4000 });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.completedAt, 4000);
  assert.equal(mergeAgentRunState({ ...activity, status: 'running' }, { status: 'failed', error: 'Boom' }).error.message, 'Boom');

  const settled = run('b');
  assert.equal(mergeAgentRunState(settled, { status: 'running' }), settled);
  assert.equal(mergeAgentRunState(settled, null), settled);
});

test('saved lists completed answers from the last day and kept ones', () => {
  const now = 2000 + 30 * HOUR;
  const recent = run('recent', { completedAt: now - HOUR });
  const old = run('old');
  const kept = run('kept', { kept: true });
  const failed = run('failed', { status: 'failed', completedAt: now });
  assert.deepEqual(
    selectSavedAgentActivities([recent, old, kept, failed], { now }).map(item => item.activityId),
    ['recent', 'kept']
  );
});

test('agent progress summarizes searches and the current step', () => {
  assert.deepEqual(describeAgentProgress({ status: 'queued' }), {
    label: 'Queued · waiting for an available worker…',
    percent: null
  });
  assert.deepEqual(
    describeAgentProgress({
      status: 'running',
      phase: 'fetching_metadata',
      statusText: 'Checking discussion 4 of 7…',
      searchQueries: [{ query: 'a' }, { query: 'b' }],
      progress: { percent: 55 }
    }),
    { label: 'Searched 2 queries · checking discussion 4 of 7…', percent: 55 }
  );
  assert.deepEqual(
    describeAgentProgress({
      status: 'running',
      phase: 'generating',
      statusText: 'Writing an answer from 3 sources…',
      searchQueries: [{ query: 'a' }],
      progress: { percent: 80 }
    }),
    { label: 'Searched 1 query · writing an answer from 3 sources…', percent: null }
  );
  assert.equal(describeAgentProgress({ status: 'running' }).label, 'Starting forum research…');
});

test('citations become source links outside links and code', () => {
  const link = id => `<a href="#" class="agent-citation" data-citation="${id}" aria-label="Source ${id}">${id}</a>`;
  assert.equal(
    linkifyCitations('<p>Most common [S1][S2], see [S1, S9].</p>', ['S1', 'S2']),
    `<p>Most common ${link('S1')}${link('S2')}, see ${link('S1')} [S9].</p>`
  );
  assert.equal(
    linkifyCitations('<p><code>[S1]</code> <a href="https://x">[S1]</a> [S7]</p>', ['S1']),
    '<p><code>[S1]</code> <a href="https://x">[S1]</a> [S7]</p>'
  );
  assert.equal(linkifyCitations('<p>[S1]</p>', []), '<p>[S1]</p>');
  assert.equal(linkifyCitations('', ['S1']), '');
});

test('chat count uses clear singular and plural labels', () => {
  assert.equal(getChatCountLabel([]), 'Start a conversation');
  assert.equal(getChatCountLabel([{ role: 'assistant' }]), 'Start a conversation');
  assert.equal(getChatCountLabel([{ role: 'user' }]), '1 question asked');
  assert.equal(getChatCountLabel([{ role: 'user' }, { role: 'assistant' }, { role: 'user' }]), '2 questions asked');
});

test('resolves forum names, preferring real names over hostname fallbacks', () => {
  const site = 'https://meta.discourse.org';
  assert.equal(forumHostname(site), 'meta.discourse.org');
  assert.equal(resolveForumName(site, '', 'meta.discourse.org', 'Discourse Meta'), 'Discourse Meta');
  assert.equal(resolveForumName(site, 'Own name', 'Discourse Meta'), 'Own name');
  assert.equal(resolveForumName(site, '', 'META.discourse.org'), 'meta.discourse.org');
  assert.equal(resolveForumName('not a url'), '');

  const names = collectForumNames([
    { siteUrl: site, forumName: 'meta.discourse.org' },
    { siteUrl: site, forumName: 'Discourse Meta' },
    { siteUrl: 'https://www.uscardforum.com', forumName: '' },
    { siteUrl: '', forumName: 'Orphan' }
  ]);
  assert.deepEqual([...names], [[site, 'Discourse Meta']]);
});

test('derives a stable accent hue and initial per forum', () => {
  const hue = forumAccentHue('https://meta.discourse.org');
  assert.equal(Number.isInteger(hue), true);
  assert.ok(hue >= 0 && hue < 360);
  assert.equal(forumAccentHue('https://meta.discourse.org/'), hue);
  assert.notEqual(forumAccentHue('https://www.uscardforum.com'), hue);
  assert.equal(forumAccentHue(''), null);
  assert.equal(forumInitial('  discourse Meta'), 'D');
  assert.equal(forumInitial('美卡论坛'), '美');
  assert.equal(forumInitial(''), '?');
});

test('cleans Discourse category and forum suffixes from topic titles', () => {
  const forum = 'US Card Forum';
  assert.equal(
    cleanTopicTitle('Chase Sapphire Reserve retention offer 2026 - Credit Cards - US Card Forum', forum),
    'Chase Sapphire Reserve retention offer 2026'
  );
  assert.equal(cleanTopicTitle('Amex Platinum refresh - US Card Forum', forum), 'Amex Platinum refresh');
  assert.equal(cleanTopicTitle('Amex – Chase — us card forum', forum), 'Amex');
  assert.equal(cleanTopicTitle('Pre-approval tips - Credit Cards', forum), 'Pre-approval tips - Credit Cards');
  assert.equal(cleanTopicTitle('US Card Forum', forum), 'US Card Forum');
  assert.equal(cleanTopicTitle(' Plain title ', ''), 'Plain title');
  assert.equal(cleanTopicTitle(undefined, forum), '');
});

test('groups activity by forum with the current forum first', () => {
  const a = 'https://www.uscardforum.com';
  const b = 'https://meta.discourse.org';
  const c = 'https://community.openai.com';
  const groups = groupByForum(
    [
      { id: 1, siteUrl: b, forumName: 'meta.discourse.org', updatedAt: 50 },
      { id: 2, siteUrl: a, forumName: 'US Card Forum', updatedAt: 10 },
      { id: 3, siteUrl: c, updatedAt: 90 },
      { id: 4, siteUrl: '', updatedAt: 999 },
      { id: 5, siteUrl: `${b}/`, forumName: 'Discourse Meta', createdAt: 20 },
      { id: 6, siteUrl: a, updatedAt: 30 }
    ],
    `${a}/`,
    { names: new Map([[c, 'OpenAI Developer Community']]) }
  );

  assert.deepEqual(
    groups.map(group => group.siteUrl),
    [a, c, b, '']
  );
  assert.deepEqual(
    groups.map(group => group.isCurrent),
    [true, false, false, false]
  );
  assert.deepEqual(
    groups[0].items.map(item => item.id),
    [2, 6]
  );
  assert.equal(groups[0].latestAt, 30);
  assert.equal(groups[1].forumName, 'OpenAI Developer Community');
  assert.equal(groups[2].forumName, 'Discourse Meta');
  assert.equal(groups[2].hostname, 'meta.discourse.org');
  assert.equal(groups[3].forumName, 'Unknown forum');
  assert.equal(groups[3].hue, null);
  assert.equal(groups[0].hue, forumAccentHue(a));
  assert.deepEqual(groupByForum([], a), []);
  assert.equal(
    groupByForum([{ siteUrl: b }], '').every(group => !group.isCurrent),
    true
  );
});

test('idle status stays out of the way of the setup card', () => {
  assert.equal(resolveIdleStatus({ isForumTopic: true, isDiscourse: true, needsSetup: true }), null);
  assert.equal(resolveIdleStatus({ needsSetup: true }), null);
  assert.equal(resolveIdleStatus({ isForumTopic: true, isDiscourse: true }), null);
  assert.deepEqual(resolveIdleStatus({}), {
    message: 'Open a Discourse forum topic to get started',
    type: 'info'
  });
  assert.deepEqual(resolveIdleStatus({ isDiscourse: true }), {
    message: 'Ask the forum to search across discussions',
    type: 'info'
  });
  assert.equal(resolveIdleStatus({ isDiscourse: true, agentPanelShown: true }), null);
});

test('quiet re-renders re-derive the status when provider validity changes', () => {
  assert.equal(shouldRederiveStatus({ announce: true }), true);
  // First render: nothing to compare against, and nothing announced.
  assert.equal(shouldRederiveStatus({ settingsValid: false }), false);
  // Configured in the setup card or in the settings tab (storage.onChanged).
  assert.equal(shouldRederiveStatus({ settingsValid: true, previousSettingsValid: false }), true);
  // Key removed in settings while the panel is open.
  assert.equal(shouldRederiveStatus({ settingsValid: false, previousSettingsValid: true }), true);
  // An unrelated setting (e.g. response language) changed.
  assert.equal(shouldRederiveStatus({ settingsValid: true, previousSettingsValid: true, statusKind: 'idle' }), false);
  // A stale "configure a provider" message never outlives a valid setup.
  assert.equal(shouldRederiveStatus({ settingsValid: true, previousSettingsValid: true, statusKind: 'setup' }), true);
  assert.equal(shouldRederiveStatus({ settingsValid: false, previousSettingsValid: false, statusKind: 'setup' }), false);
});
