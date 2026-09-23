import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveTopicControls, deriveTopicHelper } from '../src/popup/topic-controls.mjs';
import { OperationTracker } from '../src/popup/operations.mjs';
import { TaskRegistry } from '../src/popup/task-registry.mjs';
import { openForumTarget } from '../src/popup/forum-tabs.mjs';
import { ForumDirectory } from '../src/popup/forum-ui.mjs';
import { formatRelativeTime } from '../src/popup/ui-state.mjs';
import { answerExcerpt } from '../src/popup/activity-cards.mjs';
import { exportHostLabel } from '../src/popup/summary-view.mjs';

// ---------- topic controls ----------

const idleTopic = {
  operationKind: '',
  backgroundAvailable: true,
  configReady: true,
  hasTopic: true,
  hasForumPage: true,
  hasSummary: false,
  hasSource: false,
  historyLength: 0,
  isHydrating: false,
  activeSummaryTask: null,
  hasActiveChatTask: false,
  activeTopicTaskCount: 0,
  agentRequestPending: false,
  hasChatQuestion: false,
  hasAgentQuestion: false,
  chatEditSaving: false,
  agentSearchLabel: 'Search Meta'
};

test('an idle topic can be summarized and the forum asked', () => {
  const controls = deriveTopicControls(idleTopic);
  assert.equal(controls.summarize.disabled, false);
  assert.equal(controls.summarize.label, 'Create summary');
  assert.equal(controls.summarize.busy, false);
  assert.equal(controls.agentLaunch.disabled, false);
  assert.equal(controls.sendAgent.disabled, true, 'no question yet');
  assert.equal(controls.sendAgent.label, 'Search Meta');
  assert.equal(controls.chatInput.disabled, true, 'no summary to chat about');
  assert.equal(controls.copySummary.disabled, true);
  assert.equal(controls.clearChat.disabled, true);
});

test('setup, a missing background or a missing topic disable topic actions', () => {
  assert.equal(deriveTopicControls({ ...idleTopic, configReady: false }).summarize.disabled, true);
  assert.equal(deriveTopicControls({ ...idleTopic, configReady: false }).agentLaunch.disabled, true);
  assert.equal(deriveTopicControls({ ...idleTopic, backgroundAvailable: false }).summarize.disabled, true);
  assert.equal(deriveTopicControls({ ...idleTopic, backgroundAvailable: false }).agentInput.disabled, true);
  const forumHome = deriveTopicControls({ ...idleTopic, hasTopic: false });
  assert.equal(forumHome.summarize.disabled, true);
  assert.equal(forumHome.agentLaunch.disabled, false);
  assert.equal(deriveTopicControls({ ...idleTopic, hasForumPage: false }).agentLaunch.disabled, true);
  assert.equal(deriveTopicControls({ ...idleTopic, isHydrating: true }).summarize.label, 'Loading saved summary');
});

test('a running summary task locks the button and names its phase', () => {
  const controls = deriveTopicControls({
    ...idleTopic,
    activeSummaryTask: { status: 'running', phase: 'fetching' },
    activeTopicTaskCount: 1
  });
  assert.equal(controls.summarize.disabled, true);
  assert.equal(controls.summarize.label, 'Reading replies');
  assert.equal(controls.summarize.busy, true);
});

test('submitting a request marks the matching control busy and locks the rest', () => {
  const summary = deriveTopicControls({ ...idleTopic, operationKind: 'summary' });
  assert.equal(summary.summarize.label, 'Starting summary');
  assert.equal(summary.summarize.busy, true);
  assert.equal(summary.agentLaunch.disabled, true);

  const agent = deriveTopicControls({ ...idleTopic, operationKind: 'agent', hasAgentQuestion: true });
  assert.equal(agent.agentInput.disabled, true);
  assert.equal(agent.sendAgent.label, 'Starting…');
  assert.equal(agent.sendAgent.busy, true);
  assert.equal(agent.agentLaunch.busy, true);

  const chat = deriveTopicControls({ ...idleTopic, operationKind: 'chat', hasSummary: true, hasChatQuestion: true });
  assert.equal(chat.sendChat.disabled, true);
  assert.equal(chat.sendChat.label, 'Starting');
  assert.equal(chat.chatInput.disabled, true);
  assert.equal(chat.contextLimit.disabled, true);
});

test('chat controls follow the summary, question, running tasks and edit saves', () => {
  const ready = deriveTopicControls({ ...idleTopic, hasSummary: true, hasSource: true, hasChatQuestion: true, historyLength: 2 });
  assert.equal(ready.sendChat.disabled, false);
  assert.equal(ready.clearChat.disabled, false);
  assert.equal(ready.chatEdit.disabled, false);
  assert.equal(ready.chatEdit.title, 'Edit this message and remove later replies');
  assert.equal(ready.copyPost.disabled, false);
  assert.equal(ready.contextLimit.title, 'Choose how much forum discussion text accompanies each question');

  const chatRunning = deriveTopicControls({
    ...idleTopic, hasSummary: true, historyLength: 2, hasActiveChatTask: true, activeTopicTaskCount: 1
  });
  assert.equal(chatRunning.contextLimit.disabled, true);
  assert.equal(chatRunning.contextLimit.title, 'The context limit is locked while a chat response is running');
  assert.equal(chatRunning.clearChat.disabled, true);
  assert.equal(chatRunning.chatEdit.disabled, true);
  assert.equal(chatRunning.chatEdit.title, 'Wait for the current chat task to finish before editing');

  const saving = deriveTopicControls({ ...idleTopic, hasSummary: true, hasChatQuestion: true, chatEditSaving: true });
  assert.equal(saving.sendChat.disabled, true);
  assert.equal(saving.chatEdit.disabled, true);
});

test('the topic helper line explains the next step', () => {
  const topic = { isForumTopic: true, isDiscourse: true, siteUrl: 'https://meta.example', forumName: 'Meta' };
  const home = { isForumTopic: false, isDiscourse: true, siteUrl: 'https://meta.example', forumName: 'Meta' };
  assert.equal(deriveTopicHelper({ pageContext: null, configReady: false }), 'Finish setup below, then open any Discourse topic.');
  assert.equal(deriveTopicHelper({ pageContext: home, configReady: false }), 'Finish setup below to ask this forum.');
  assert.equal(deriveTopicHelper({ pageContext: home, configReady: true }), 'Search across Meta discussions with Agent mode.');
  assert.equal(deriveTopicHelper({ pageContext: null, configReady: true }), 'Open a Discourse forum topic to get started.');
  assert.equal(deriveTopicHelper({ pageContext: topic, configReady: false }), 'Finish setup below to create a summary.');
  assert.equal(deriveTopicHelper({ pageContext: topic, configReady: true, summaryRunning: true }), 'Your summary is running safely in the background.');
  assert.equal(deriveTopicHelper({ pageContext: topic, configReady: true, hasSummary: true }), 'Your saved summary and conversation are ready.');
  assert.equal(deriveTopicHelper({ pageContext: topic, configReady: true }), 'Read every reply and create a focused overview.');
});

// ---------- operations ----------

function createTracker() {
  const context = { pageKey: '1:t/1', isForumTopic: true, isDiscourse: true, postId: '1', topicKey: 't/1', siteUrl: 'https://f.example', forumName: 'F' };
  const events = [];
  const tracker = new OperationTracker({
    getPageKey: () => context.pageKey,
    onChange: () => events.push('change'),
    onCancel: () => events.push('cancel')
  });
  return { tracker, context, events };
}

test('an operation snapshots the page and settings and allows one at a time', () => {
  const { tracker, context, events } = createTracker();
  const operation = tracker.begin('summary', context, { provider: 'openai', settings: { model: 'm' } });
  assert.equal(operation.kind, 'summary');
  assert.equal(operation.pageKey, '1:t/1');
  assert.equal(operation.topicKey, 't/1');
  assert.equal(operation.provider, 'openai');
  assert.equal(tracker.kind, 'summary');
  assert.equal(tracker.busy, true);
  assert.equal(tracker.begin('chat', context), null, 'one at a time');
  assert.equal(tracker.isCurrent(operation), true);
  tracker.finish(operation);
  assert.equal(tracker.busy, false);
  assert.deepEqual(events, ['change', 'change']);
});

test('topic operations need a topic; Agent operations a forum page', () => {
  const { tracker, context } = createTracker();
  assert.equal(tracker.begin('summary', { ...context, isForumTopic: false }), null);
  assert.equal(tracker.begin('agent', { ...context, isDiscourse: false }), null);
  const agent = tracker.begin('agent', { ...context, isForumTopic: false });
  assert.equal(agent.pageKey, null, 'Agent questions survive navigation');
});

test('navigating away or cancelling makes an operation stale', () => {
  const { tracker, context, events } = createTracker();
  const operation = tracker.begin('chat', context);
  context.pageKey = '1:t/2';
  assert.equal(tracker.isCurrent(operation), false);
  tracker.finish(operation);
  assert.equal(tracker.busy, true, 'a stale finish does not end the active one');
  tracker.cancel();
  assert.equal(tracker.busy, false);
  assert.deepEqual(events.slice(-2), ['cancel', 'change']);
  context.pageKey = '1:t/1';
  assert.equal(tracker.isCurrent(operation), false, 'cancelled operations stay stale');
});

// ---------- task registry ----------

test('the registry answers topic and Agent queries', () => {
  const registry = new TaskRegistry({ sendMessage: async () => ({}) });
  registry.replaceAll([
    { id: 'a', type: 'summary', topicKey: 't/1', status: 'running', createdAt: 2 },
    { id: 'b', type: 'chat', topicKey: 't/1', status: 'queued', createdAt: 1 },
    { id: 'c', type: 'chat', topicKey: 't/1', status: 'completed', createdAt: 0 },
    { id: 'd', type: 'agent', agentRunId: 'run-d', clientRequestId: 'req-d', status: 'waiting_user_action', createdAt: 3 },
    { id: 'e', type: 'agent', agentRunId: '', clientRequestId: '', status: 'failed', createdAt: 4 }
  ]);
  assert.deepEqual(registry.activeForTopic('t/1').map(task => task.id), ['b', 'a']);
  assert.deepEqual(registry.activeForTopic(''), []);
  assert.equal(registry.activeForTopicOfType('summary', 't/1').id, 'a');
  assert.equal(registry.activeForTopicOfType('chat', 't/2'), null);
  assert.equal(registry.findAgentTask({ activityId: 'run-d' }).id, 'd');
  assert.equal(registry.findAgentTask({ agentRunId: 'e' }).id, 'e', 'run ID falls back to the task ID');
  assert.equal(registry.findUnfinishedAgentTask('run-d').id, 'd');
  assert.equal(registry.findUnfinishedAgentTask('e'), null);
  assert.equal(registry.isAgentRequestPending('req-d'), true);
  assert.equal(registry.isAgentRequestPending('other'), false);
  assert.equal(registry.hasActiveTasks(), true);
});

test('enqueue returns the task, null without a background, or throws its error', async () => {
  const sent = [];
  let reply;
  const registry = new TaskRegistry({ sendMessage: async message => { sent.push(message); return reply; } });
  reply = { success: true, task: { id: 't1', status: 'completed' } };
  assert.equal((await registry.enqueue({ taskType: 'summary' }, 'fallback')).id, 't1');
  assert.equal(sent[0].action, 'enqueueTask');
  assert.equal(sent[0].taskType, 'summary');
  assert.equal(registry.values().length, 1);

  reply = undefined;
  assert.equal(await registry.enqueue({}, 'fallback'), null);
  reply = { success: false, error: 'queue full' };
  await assert.rejects(registry.enqueue({}, 'fallback'), /queue full/);
  reply = { success: true };
  await assert.rejects(registry.enqueue({}, 'fallback'), /fallback/);
});

test('cancel and resume return the updated task or throw', async () => {
  let reply;
  const registry = new TaskRegistry({ sendMessage: async () => reply });
  reply = { success: true, task: { id: 'x' } };
  assert.equal((await registry.cancel('x')).id, 'x');
  reply = { success: true };
  assert.equal(await registry.resume('x'), null);
  reply = undefined;
  await assert.rejects(registry.cancel('x'), /Unable to cancel task/);
  await assert.rejects(registry.resume('x'), /Unable to resume Agent task/);
});

test('the heartbeat runs only while tasks are active', () => {
  const sent = [];
  const registry = new TaskRegistry({ sendMessage: async message => { sent.push(message.action); } });
  registry.updateHeartbeat();
  assert.equal(registry.heartbeatTimer, null);
  registry.set({ id: 'a', status: 'running' });
  registry.updateHeartbeat();
  registry.updateHeartbeat();
  assert.notEqual(registry.heartbeatTimer, null);
  assert.deepEqual(sent, ['taskHeartbeat'], 'one immediate heartbeat');
  registry.set({ id: 'a', status: 'completed' });
  registry.updateHeartbeat();
  assert.equal(registry.heartbeatTimer, null);
});

// ---------- forum tabs ----------

function fakeTabs(existing = [], active = { id: 1, index: 4 }) {
  const calls = [];
  return {
    calls,
    tabs: {
      async query(query) {
        calls.push(['query', query]);
        return query.active ? [active] : existing;
      },
      async update(id, props) { calls.push(['update', id, props]); },
      async create(props) { calls.push(['create', props]); return { id: 99, ...props }; }
    },
    windows: { async update(id, props) { calls.push(['focus', id, props]); } }
  };
}

test('openForumTarget focuses a tab already on the topic', async () => {
  const fake = fakeTabs([{ id: 5, windowId: 2, url: 'https://f.example/t/slug/7/3' }]);
  const created = await openForumTarget(
    { siteUrl: 'https://f.example', url: 'https://f.example/t/slug/7/9', topicKey: 'f.example/t/7', navigateExisting: true },
    fake
  );
  assert.equal(created, null);
  assert.deepEqual(fake.calls[0], ['query', { url: 'https://f.example/*' }]);
  assert.deepEqual(fake.calls[1], ['update', 5, { url: 'https://f.example/t/slug/7/9', active: true }]);
  assert.deepEqual(fake.calls[2], ['focus', 2, { focused: true }]);
});

test('openForumTarget opens a new tab next to the current one otherwise', async () => {
  const fake = fakeTabs([{ id: 5, windowId: 2, url: 'https://f.example/t/other/8' }]);
  const created = await openForumTarget({ siteUrl: 'https://f.example', url: 'https://f.example/t/x/7', topicKey: 'f.example/t/7' }, fake);
  assert.deepEqual(created, { id: 99, url: 'https://f.example/t/x/7', active: true, index: 5 });
  const forumOnly = fakeTabs([{ id: 6, url: 'https://f.example/latest' }]);
  assert.equal(await openForumTarget({ siteUrl: 'https://f.example' }, forumOnly), null);
  assert.deepEqual(forumOnly.calls[1], ['update', 6, { active: true }]);
});

// ---------- forum names ----------

test('the forum directory prefers reported names over hostnames', () => {
  let context = { siteUrl: 'https://f.example', forumName: 'Friendly Forum' };
  const directory = new ForumDirectory({
    getPageContext: () => context,
    getRecords: () => [{ siteUrl: 'https://other.example', forumName: 'Other Place' }]
  });
  directory.refresh();
  assert.equal(directory.label('https://f.example'), 'Friendly Forum');
  assert.equal(directory.label('https://other.example'), 'Other Place');
  assert.equal(directory.label('https://unknown.example'), 'unknown.example');
  assert.equal(directory.label(''), 'Unknown forum');
  assert.equal(directory.currentLabel(), 'Friendly Forum');
  assert.equal(directory.reportedName(), 'Friendly Forum');
  context = { siteUrl: 'https://f.example', forumName: 'f.example' };
  assert.equal(directory.reportedName(), '', 'a hostname fallback is not a reported name');
  context = null;
  assert.equal(directory.currentLabel(), '');
});

// ---------- small helpers ----------

test('formatRelativeTime rounds down to minutes, hours and days', () => {
  const now = 10 * 24 * 3600000;
  assert.equal(formatRelativeTime(now - 30000, now), 'just now');
  assert.equal(formatRelativeTime(now - 5 * 60000, now), '5m ago');
  assert.equal(formatRelativeTime(now - 3 * 3600000, now), '3h ago');
  assert.equal(formatRelativeTime(now - 2 * 24 * 3600000, now), '2d ago');
  assert.equal(formatRelativeTime(now + 60000, now), 'just now');
});

test('answerExcerpt strips markdown and tidies punctuation', () => {
  assert.equal(answerExcerpt('## Title\n\nUse **caching** , see [S1] .'), 'Title Use caching, see S1.');
  assert.equal(answerExcerpt('x'.repeat(300)).length, 240);
  assert.equal(answerExcerpt(undefined), '');
});

test('exportHostLabel makes a file-name-safe forum label', () => {
  assert.equal(exportHostLabel('https://meta.discourse.org'), 'meta.discourse.org');
  assert.equal(exportHostLabel('https://forum.example.com/community'), 'forum.example.com');
  assert.equal(exportHostLabel(''), 'forum');
});
