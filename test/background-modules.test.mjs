import assert from 'node:assert/strict';
import test from 'node:test';

import { createMessageRouter, respondAsync } from '../src/background/message-router.mjs';
import { TASK_WAKE_ALARM, TaskService, validateEnqueueRequest } from '../src/background/task-service.mjs';
import {
  buildContentResult,
  createRateLimitProgress,
  createTopicFetcher,
  formatFetchTaskStatus
} from '../src/background/topic-fetcher.mjs';
import { agentActivityError, agentFailurePatch } from '../src/background/agent-executor.mjs';
import { AgentActivityStore } from '../src/background/agent-activity-store.mjs';
import { readConfig } from '../src/shared/config-state.mjs';
import { AGENT_ACTIVITY_RETENTION_MS, agentActivityExpiry, agentActivityFromTask } from '../src/shared/agent-activity.mjs';
import { isAbortError } from '../src/shared/rate-limit-retry.mjs';

// ---------- message router ----------

test('the router dispatches by action and ignores unknown or inherited actions', () => {
  const calls = [];
  const listener = createMessageRouter({
    ping: (request, sender, sendResponse) => {
      calls.push([request.action, sender.id]);
      sendResponse('pong');
      return false;
    }
  });
  let response;
  assert.equal(
    listener({ action: 'ping' }, { id: 's' }, value => {
      response = value;
    }),
    false
  );
  assert.equal(response, 'pong');
  assert.equal(
    listener({ action: 'nope' }, {}, () => {}),
    undefined
  );
  assert.equal(
    listener({ action: 'toString' }, {}, () => {}),
    undefined
  );
  assert.equal(
    listener(undefined, {}, () => {}),
    undefined
  );
  assert.deepEqual(calls, [['ping', 's']]);
});

test('respondAsync keeps the channel open and wraps results and errors', async () => {
  const ok = respondAsync(async request => ({ echo: request.value }));
  const fails = respondAsync(() => {
    throw new Error('bad request');
  });
  const empty = respondAsync(async () => undefined);
  const answer = handler =>
    new Promise(resolve => {
      assert.equal(handler({ value: 7 }, {}, resolve), true);
    });
  assert.deepEqual(await answer(ok), { success: true, echo: 7 });
  assert.deepEqual(await answer(fails), { success: false, error: 'bad request' });
  assert.deepEqual(await answer(empty), { success: true });
});

// ---------- enqueue validation ----------

test('validateEnqueueRequest accepts each task type and derives the topic key', () => {
  assert.deepEqual(validateEnqueueRequest({ taskType: 'summary', topicId: '5', siteUrl: 'https://forum.example.com/' }), {
    type: 'summary',
    siteUrl: 'https://forum.example.com',
    topicKey: 'forum.example.com/t/5'
  });
  assert.equal(
    validateEnqueueRequest({ taskType: 'chat', topicId: '5', siteUrl: 'https://f.example', question: 'Why?' }).topicKey,
    'f.example/t/5'
  );
  assert.deepEqual(validateEnqueueRequest({ taskType: 'agent', siteUrl: 'https://f.example', question: 'What?' }), {
    type: 'agent',
    siteUrl: 'https://f.example',
    topicKey: ''
  });
});

test('validateEnqueueRequest rejects incomplete requests with user-facing messages', () => {
  const site = 'https://f.example';
  assert.throws(() => validateEnqueueRequest({ taskType: 'other' }), /Unsupported task type/);
  assert.throws(() => validateEnqueueRequest(undefined), /Unsupported task type/);
  assert.throws(() => validateEnqueueRequest({ taskType: 'summary', siteUrl: site }), /A forum topic is required/);
  assert.throws(() => validateEnqueueRequest({ taskType: 'summary', topicId: '5' }), /valid forum site URL/);
  assert.throws(() => validateEnqueueRequest({ taskType: 'summary', topicId: 'abc', siteUrl: site }), /valid forum topic/);
  assert.throws(() => validateEnqueueRequest({ taskType: 'chat', topicId: '5', siteUrl: site, question: ' ' }), /follow-up question/);
  assert.throws(() => validateEnqueueRequest({ taskType: 'agent', siteUrl: site }), /Agent question/);
});

// ---------- task service ----------

function createFakeDb() {
  const activities = new Map();
  const tasks = new Map();
  return {
    activities,
    tasks,
    async open() {},
    async cleanupStaleChats() {},
    async cleanupTasks() {},
    async cleanupAgentActivities() {},
    async prune() {},
    setRetention(retention) {
      this.retention = retention;
    },
    async listTasks() {
      return [...tasks.values()];
    },
    async saveTask(task) {
      tasks.set(task.id, { ...task });
    },
    async getAgentActivity(id) {
      return activities.get(id) || null;
    },
    async saveAgentActivity(activity) {
      activities.set(activity.activityId, { ...activity });
      return { ...activity };
    },
    async deleteAgentActivity(id) {
      activities.delete(id);
    }
  };
}

function createFakeAlarms() {
  const alarms = new Map();
  return {
    alarms,
    async get(name) {
      return alarms.get(name);
    },
    create(name, info) {
      alarms.set(name, { name, ...info });
    },
    async clear(name) {
      return alarms.delete(name);
    }
  };
}

function createService({ execute = () => new Promise(() => {}), readConfig: read } = {}) {
  const db = createFakeDb();
  const alarms = createFakeAlarms();
  const messages = [];
  const broadcast = message => messages.push(message);
  const agentActivities = new AgentActivityStore({ db, broadcast });
  const service = new TaskService({
    db,
    agentActivities,
    broadcast,
    alarms,
    readConfig: read || (async () => readConfig({}))
  });
  service.start(execute);
  return { service, db, alarms, messages };
}

test('enqueue keeps provider settings in memory only and broadcasts the task', async () => {
  const { service, db, alarms, messages } = createService();
  const task = await service.enqueue({
    taskType: 'summary',
    topicId: '9',
    siteUrl: 'https://f.example',
    title: 'T',
    provider: 'openai',
    settings: { apiKey: 'secret', model: 'gpt-x' },
    systemPrompt: 'P',
    responseLanguage: 'ja'
  });
  assert.ok(['queued', 'running'].includes(task.status), task.status);
  assert.equal(task.model, 'gpt-x');
  assert.ok(!JSON.stringify([...db.tasks.values()]).includes('secret'), 'API keys are never persisted');
  assert.ok(messages.some(message => message.action === 'taskUpdated' && message.task.id === task.id));
  assert.ok(alarms.alarms.has(TASK_WAKE_ALARM), 'an active task schedules the wake-up alarm');
  assert.equal(service.activeTaskCount(), 1);
  const configuration = await service.getTaskConfiguration(task);
  assert.equal(configuration.provider, 'openai');
  assert.deepEqual(configuration.settings, { apiKey: 'secret', model: 'gpt-x' });
  assert.equal(configuration.systemPrompt, 'P');
  assert.equal(configuration.responseLanguage, 'ja');
  assert.equal(configuration.forumName, 'f.example');
});

test('a repeated summary request joins the active task; Agent requests dedupe by client ID', async () => {
  const { service } = createService();
  const first = await service.enqueue({ taskType: 'summary', topicId: '9', siteUrl: 'https://f.example' });
  const again = await service.enqueue({ taskType: 'summary', topicId: '9', siteUrl: 'https://f.example' });
  assert.equal(again.id, first.id);
  const agent = await service.enqueue({ taskType: 'agent', siteUrl: 'https://f.example', question: 'Q?', clientRequestId: 'c1' });
  const agentAgain = await service.enqueue({ taskType: 'agent', siteUrl: 'https://f.example', question: 'Q?', clientRequestId: 'c1' });
  assert.equal(agentAgain.id, agent.id);
});

test('an Agent task starts with an activity record that cancelling marks cancelled', async () => {
  const { service, db, messages } = createService();
  service.queue.concurrency = 0; // keep it queued
  const task = await service.enqueue({
    taskType: 'agent',
    siteUrl: 'https://f.example',
    question: 'How?',
    agentRunId: 'run-1',
    forumName: 'F'
  });
  assert.equal(task.agentRunId, 'run-1');
  assert.equal(db.activities.get('run-1').question, 'How?');
  assert.equal(db.activities.get('run-1').status, 'queued');
  const cancelled = await service.cancel(task.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(db.activities.get('run-1').status, 'cancelled');
  assert.ok(messages.some(message => message.action === 'activityUpdated' && message.activity.status === 'cancelled'));
});

test('a failed enqueue removes the Agent activity it created', async () => {
  const { service, db } = createService();
  service.queue.maxQueued = 0;
  service.queue.concurrency = 0;
  await assert.rejects(
    service.enqueue({ taskType: 'agent', siteUrl: 'https://f.example', question: 'Q', agentRunId: 'run-x' }),
    /queue is full/
  );
  assert.equal(db.activities.has('run-x'), false);
});

test('after a restart, task configuration falls back to the saved configuration', async () => {
  const { service } = createService({
    readConfig: async () =>
      readConfig({
        selectedProvider: 'anthropic',
        anthropicApiKey: 'ak',
        openaiApiKey: 'ok',
        systemPrompt: 'S',
        responseLanguage: 'fr'
      })
  });
  await service.ready;
  const restored = { id: 'old', type: 'summary', siteUrl: 'https://f.example', provider: 'openai', model: 'gpt-task', forumName: '' };
  assert.deepEqual(await service.getTaskConfiguration(restored), {
    provider: 'openai',
    settings: { apiKey: 'ok', model: 'gpt-task' },
    systemPrompt: 'S',
    responseLanguage: 'fr',
    forumName: 'f.example',
    // A record from before limits existed uses the saved preferences
    // (by default every page: null).
    limits: { topicPageLimit: null }
  });
  const noProvider = await service.getTaskConfiguration({ id: 'old2', siteUrl: 'https://f.example' });
  assert.equal(noProvider.provider, 'anthropic');
  assert.deepEqual(noProvider.settings, { apiKey: 'ak', model: 'claude-haiku-4-5' });
});

test('runtime settings without a response language use the saved one', async () => {
  const { service } = createService({ readConfig: async () => readConfig({ responseLanguage: 'de' }) });
  const task = await service.enqueue({
    taskType: 'agent',
    siteUrl: 'https://f.example',
    question: 'Q',
    provider: 'openai',
    settings: { apiKey: 'k', model: 'm' }
  });
  assert.equal((await service.getTaskConfiguration(task)).responseLanguage, 'de');
});

test('the executor runs tasks and the alarm is cleared when nothing is active', async () => {
  let release;
  const { service, alarms } = createService({
    execute: () =>
      new Promise(resolve => {
        release = resolve;
      })
  });
  const task = await service.enqueue({ taskType: 'summary', topicId: '1', siteUrl: 'https://f.example' });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(typeof release, 'function', 'executor started');
  release();
  await service.queue.waitForIdle();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(service.list().find(item => item.id === task.id).status, 'completed');
  assert.equal(alarms.alarms.has(TASK_WAKE_ALARM), false);
});

test('handleAlarm ignores other alarms', async () => {
  const { service } = createService();
  await service.ready;
  service.handleAlarm({ name: 'something-else' });
  service.handleAlarm({ name: TASK_WAKE_ALARM });
});

// ---------- topic fetcher ----------

test('formatFetchTaskStatus describes reading, page and rate-limit progress', () => {
  assert.equal(formatFetchTaskStatus({ totalPosts: 41, processedPosts: 11 }), 'Read 10 of 40 replies');
  assert.equal(formatFetchTaskStatus({ currentPage: 3 }), 'Read response page 3');
  assert.equal(
    formatFetchTaskStatus({ rateLimited: true, retryPage: 2, retryAfterMs: 5000, retryAttempt: 1, maxRetries: 6 }),
    'Forum rate limit reached. Retrying page 2 in 5s (retry 1 of 6)'
  );
});

test('createRateLimitProgress adds the retry delay to the ETA', () => {
  const retry = { retryAttempt: 2, maxRetries: 6, delayMs: 3000 };
  assert.deepEqual(createRateLimitProgress({ percent: 10, etaMs: 1000 }, retry, 4), {
    percent: 10,
    etaMs: 4000,
    rateLimited: true,
    retryPage: 4,
    retryAttempt: 2,
    maxRetries: 6,
    retryAfterMs: 3000
  });
  assert.equal(createRateLimitProgress({ etaMs: null }, retry).etaMs, 3000);
  assert.equal(createRateLimitProgress({ etaMs: null }, retry).retryPage, null);
});

test('buildContentResult joins pages', () => {
  assert.deepEqual(
    buildContentResult(
      [
        { page: 1, content: 'a' },
        { page: 2, content: 'b' }
      ],
      { totalPosts: 3 },
      { unchanged: false }
    ),
    {
      content: 'a\n\nb',
      rawPages: [
        { page: 1, content: 'a' },
        { page: 2, content: 'b' }
      ],
      pagesFetched: 2,
      totalPosts: 3,
      truncated: false,
      coveredPosts: 3,
      unchanged: false
    }
  );
});

function response(status, body, contentType = 'text/plain') {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: false,
    url: '',
    headers: { get: name => (name === 'Content-Type' ? contentType : null) },
    text: async () => body
  };
}

test('the topic fetcher reads every page of a topic with a known size', async () => {
  const requests = [];
  const fetchTopicContent = createTopicFetcher({
    fetchImpl: async url => {
      requests.push(url);
      if (url.endsWith('.json')) {
        return response(200, JSON.stringify({ posts_count: 150 }), 'application/json');
      }
      return response(200, `page ${new URL(url).searchParams.get('page')}`);
    }
  });
  const progress = [];
  const result = await fetchTopicContent('https://f.example', '7', update => progress.push(update));
  assert.equal(requests[0], 'https://f.example/t/7.json');
  assert.equal(result.content, 'page 1\n\npage 2');
  assert.equal(result.totalPosts, 150);
  assert.equal(result.networkPagesFetched, 2);
  assert.equal(result.unchanged, false);
  assert.equal(result.newPosts, null);
  assert.equal(progress.at(-1).percent, 100);
});

test('the topic fetcher reuses cached pages when nothing changed', async () => {
  const requests = [];
  const fetchTopicContent = createTopicFetcher({
    fetchImpl: async url => {
      requests.push(url);
      return response(200, JSON.stringify({ posts_count: 50 }), 'application/json');
    }
  });
  const result = await fetchTopicContent('https://f.example', '7', () => {}, undefined, {
    cachedPages: [{ page: 1, content: 'cached' }],
    knownTotalPosts: 50
  });
  assert.deepEqual(requests, ['https://f.example/t/7.json']);
  assert.equal(result.unchanged, true);
  assert.equal(result.content, 'cached');
  assert.equal(result.newPosts, 0);
});

test('without a topic size the fetcher reads until an empty page', async () => {
  const fetchTopicContent = createTopicFetcher({
    wait: async () => {},
    fetchImpl: async url => {
      if (url.endsWith('.json')) return response(500, 'oops');
      const page = Number(new URL(url).searchParams.get('page'));
      return response(200, page <= 2 ? `p${page}` : '');
    }
  });
  const result = await fetchTopicContent('https://f.example', '7');
  assert.equal(result.content, 'p1\n\np2');
  assert.equal(result.totalPosts, null);
  assert.equal(result.networkPagesFetched, 2);
});

test('a login wall is reported as a user-actionable error', async () => {
  const fetchTopicContent = createTopicFetcher({ fetchImpl: async () => response(403, '') });
  await assert.rejects(fetchTopicContent('https://f.example', '7'), error => error.needsUserAction === true);
  await assert.rejects(fetchTopicContent('https://f.example', ''), /Post ID is required/);
});

// ---------- agent activity helpers ----------

test('agentActivityFromTask builds the initial activity for a queued Agent task', () => {
  const task = {
    id: 't1',
    agentRunId: 'run-1',
    title: '',
    question: 'Why?',
    siteUrl: 'https://f.example/',
    forumName: 'F',
    provider: 'openai',
    model: 'm',
    retryOf: 'run-0',
    createdAt: 10,
    updatedAt: 20
  };
  const activity = agentActivityFromTask(task, { withTimestamps: true });
  assert.equal(activity.activityId, 'run-1');
  assert.equal(activity.taskId, 't1');
  assert.equal(activity.title, 'Why?');
  assert.equal(activity.siteUrl, 'https://f.example');
  assert.equal(activity.retryOf, 'run-0');
  assert.equal(activity.createdAt, 10);
  assert.equal(activity.status, 'queued');
  assert.notEqual(agentActivityFromTask(task).createdAt, 10);
  assert.equal(agentActivityFromTask({ id: 't2', title: 'Only a title' }).question, 'Only a title');
  assert.equal(agentActivityFromTask({ id: 't3', question: 'Q' }).activityId, 't3');
});

test('agentActivityExpiry keeps kept and unfinished answers, else counts from retainedFrom', () => {
  const done = { status: 'completed', completedAt: 1000, retainedFrom: 1000 };
  assert.equal(agentActivityExpiry({ ...done, kept: true }), 0);
  assert.equal(agentActivityExpiry(done), 1000 + AGENT_ACTIVITY_RETENTION_MS);
  assert.equal(agentActivityExpiry(done, 5000), 6000);
  assert.equal(agentActivityExpiry(done, Infinity), 0, 'no time limit');
  assert.equal(agentActivityExpiry({ ...done, retainedFrom: 3000 }, 5000), 8000, 'unkept later');
  assert.equal(agentActivityExpiry({ status: 'waiting_user_action', completedAt: 0 }, 5000), 0);
  assert.equal(agentActivityExpiry({ status: 'running' }, 5000), 0);
});

test('agentFailurePatch distinguishes cancelled, waiting and failed runs', () => {
  const now = 5000;
  const cancelled = agentFailurePatch(new Error('x'), { cancelled: true, needsUserAction: false }, now);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.error, null);
  assert.equal(cancelled.completedAt, now);
  assert.equal(cancelled.retainedFrom, now);
  assert.equal(agentActivityExpiry({ ...cancelled }), now + AGENT_ACTIVITY_RETENTION_MS);

  const waiting = agentFailurePatch(new Error('login'), { cancelled: false, needsUserAction: true }, now);
  assert.equal(waiting.status, 'waiting_user_action');
  assert.equal(waiting.statusText, 'Forum login or verification is required');
  assert.equal(waiting.completedAt, 0);
  assert.equal(waiting.retainedFrom, 0);
  assert.equal(agentActivityExpiry({ ...waiting }), 0);

  const failed = agentFailurePatch(
    Object.assign(new Error('boom'), { code: 'X', retryable: false }),
    { cancelled: false, needsUserAction: false },
    now
  );
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'X');
  assert.equal(failed.error.retryable, false);
});

test('agentActivityError normalizes any thrown value', () => {
  assert.deepEqual(agentActivityError('plain'), {
    code: 'AGENT_ERROR',
    message: 'plain',
    retryable: true,
    needsUserAction: false,
    retryAfterAt: 0
  });
  assert.ok(agentActivityError({ message: 'slow', retryAfterMs: 1000 }).retryAfterAt > Date.now());
});

test('AgentActivityStore saves updates in order and broadcasts each', async () => {
  const db = createFakeDb();
  const messages = [];
  const store = new AgentActivityStore({ db, broadcast: message => messages.push(message) });
  const activity = agentActivityFromTask({ id: 't', question: 'Q' });
  await store.create(activity);
  assert.equal(messages.length, 0, 'create does not broadcast');
  const [a, b] = await Promise.all([store.update(activity, { statusText: 'one' }), store.update(activity, { statusText: 'two' })]);
  assert.equal(a.statusText, 'one');
  assert.equal(b.statusText, 'two');
  assert.equal(db.activities.get('t').statusText, 'two');
  assert.deepEqual(
    messages.map(message => message.activity.statusText),
    ['one', 'two']
  );
  await store.markCancelled({ id: 't' });
  assert.equal(db.activities.get('t').status, 'cancelled');
  const count = messages.length;
  await store.markCancelled({ id: 't' });
  assert.equal(messages.length, count, 'already cancelled');
});

test('isAbortError recognizes abort errors', () => {
  assert.equal(isAbortError(Object.assign(new Error('x'), { name: 'AbortError' })), true);
  assert.equal(isAbortError(new Error('This operation was aborted')), true);
  assert.equal(isAbortError(new Error('Operation cancelled')), true);
  assert.equal(isAbortError(new Error('other')), false);
  assert.equal(isAbortError(null), false);
});
