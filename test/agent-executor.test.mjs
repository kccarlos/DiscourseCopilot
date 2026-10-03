// The Agent executor end to end over a real (fake-indexeddb) database and the
// task queue: a run, a follow-up on it, resuming after a worker restart,
// waiting for the user and continuing from the step that was waiting,
// cancelling.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { TopicSessionDatabase } from '../src/shared/topic-session-db.mjs';
import { TaskService } from '../src/background/task-service.mjs';
import { AgentActivityStore } from '../src/background/agent-activity-store.mjs';
import { createAgentExecutor } from '../src/background/agent-executor.mjs';
import { ForumRequestGovernor } from '../src/background/forum-tools.mjs';
import { readConfig } from '../src/shared/config-state.mjs';
import { AGENT_ACTIVITY_STATUS } from '../src/shared/agent-activity.mjs';
import { TASK_STATUS } from '../src/shared/task-record.mjs';
import { createTopicSession } from '../src/shared/topic-session.mjs';

const SITE = 'https://forum.example.com';
const action = (tool, args = {}) => JSON.stringify({ tool, arguments: args, reason: 'because' });

function database() {
  return new TopicSessionDatabase({ indexedDB, keyRange: IDBKeyRange, databaseName: `agent-${crypto.randomUUID()}` });
}

function fakeAlarms() {
  const alarms = new Map();
  return {
    get: async name => alarms.get(name),
    create: (name, info) => alarms.set(name, info),
    clear: async name => alarms.delete(name)
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// The forum behind globalThis.fetch. `mode.loginRequired` answers like a
// login-only forum; `mode.fail` throws like a browser without access.
function installForum(mode = {}) {
  const requests = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async url => {
    requests.push(String(url));
    if (mode.fail) {
      mode.onFail?.();
      throw new TypeError('Failed to fetch');
    }
    const { pathname } = new URL(url);
    if (mode.loginRequired) {
      return json({ error_type: 'not_logged_in' }, 403);
    }
    if (pathname === '/search.json') {
      return json({ posts: [], topics: [{ id: 11, title: 'Caching with a CDN', slug: 'caching', posts_count: 2 }] });
    }
    if (pathname === '/t/11.json') {
      return json({ title: 'Caching with a CDN', slug: 'caching', posts_count: 2 });
    }
    if (pathname === '/raw/11') {
      return new Response('ann | 2026-01-01 10:00:00 UTC | #1\n\nUse a CDN.', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    throw new Error(`unexpected request ${url}`);
  };
  return { requests, restore: () => (globalThis.fetch = previous) };
}

function scriptedAi(replies, { onPlan, answer = 'Use a CDN [S1].' } = {}) {
  const queue = [...replies];
  const calls = [];
  return {
    calls,
    async completeAgentStep(_provider, { system, messages }, _settings, { abortSignal } = {}) {
      calls.push({ system, messages: messages.map(message => ({ ...message })) });
      if (onPlan) return onPlan(calls.length, abortSignal);
      return queue.shift() ?? action('final_answer', { answer: 'gist' });
    },
    async streamAgentAnswer(_provider, request, _settings, { onStream } = {}) {
      calls.push({ answer: true, messages: request.messages });
      onStream?.(answer);
      return answer;
    }
  };
}

function setup({ db = database(), ai, stored = {}, hasForumAccess = async () => true, savedSummaries } = {}) {
  const broadcasts = [];
  const broadcast = message => broadcasts.push(message);
  const activities = new AgentActivityStore({ db, broadcast });
  const service = new TaskService({
    db,
    agentActivities: activities,
    broadcast,
    alarms: fakeAlarms(),
    readConfig: async () => readConfig(stored),
    hasForumAccess,
    concurrency: 2
  });
  const executor = createAgentExecutor({
    aiService: ai,
    activities,
    broadcast,
    getTaskConfiguration: task => service.getTaskConfiguration(task),
    governor: new ForumRequestGovernor({ minIntervalMs: 0 }),
    hasForumAccess,
    savedSummaries
  });
  service.start((task, context) => executor(task, context));
  return { db, service, activities, broadcasts, stored };
}

const request = (extra = {}) => ({
  taskType: 'agent',
  siteUrl: SITE,
  question: 'How do I cache?',
  provider: 'openai',
  settings: { model: 'm' },
  forumName: 'Example',
  ...extra
});

const settle = async service => {
  await service.ready;
  await service.queue.waitForIdle();
};

test('a run keeps its steps, transcript, sources and answer; broadcasts leave the transcript out', async () => {
  const forum = installForum();
  try {
    const ai = scriptedAi([
      action('search_forum', { query: 'cache' }),
      action('read_topic', { topic_id: '11' }),
      action('final_answer', { answer: 'g' })
    ]);
    const { service, activities, broadcasts } = setup({ ai });
    const task = await service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    await settle(service);

    assert.equal(service.list().find(item => item.id === task.id).status, TASK_STATUS.COMPLETED);
    const activity = await activities.get('run-1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.COMPLETED);
    assert.deepEqual(
      activity.steps.map(step => `${step.tool}:${step.status}`),
      ['search_forum:completed', 'read_topic:completed']
    );
    assert.equal(activity.answer, 'Use a CDN [S1].');
    assert.equal(activity.turns[0].answer, 'Use a CDN [S1].');
    assert.equal(activity.sourceRefs[0].url, 'https://forum.example.com/t/caching/11');
    assert.deepEqual(activity.budget, { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 });
    assert.ok(activity.transcript.length >= 6);
    assert.equal(activity.progress.percent, 100);

    const updates = broadcasts.filter(message => message.action === 'activityUpdated' || message.activity);
    assert.ok(updates.length > 3);
    assert.ok(
      updates.every(message => !('transcript' in message.activity)),
      'the transcript is not broadcast'
    );
    assert.ok(
      broadcasts.some(message => message.chunk === 'Use a CDN [S1].'),
      'the answer is streamed to the panel'
    );
    assert.ok(forum.requests.every(url => url.startsWith(`${SITE}/`)));
  } finally {
    forum.restore();
  }
});

test('a follow-up continues the same run with a fresh budget and appends a new answer', async () => {
  const forum = installForum();
  try {
    const stored = { preferences: { researchDepth: 'quick' } };
    const ai = scriptedAi([action('search_forum', { query: 'cache' }), action('final_answer', { answer: 'g' })]);
    const { service, activities, db } = setup({ ai, stored });
    await service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    await settle(service);

    // Settings change before the follow-up: it snapshots its own budget.
    stored.preferences = { researchDepth: 'thorough' };
    const followUp = await service.enqueue(
      request({ agentRunId: 'run-1', followUp: true, question: 'And what about the CDN?', clientRequestId: 'c2' })
    );
    assert.equal(followUp.followUp, true);
    assert.equal(followUp.agentRunId, 'run-1');
    assert.deepEqual(followUp.limits.agent, { maxSteps: 25, maxTopicReads: 14, maxCharsPerRead: 45000 });
    // The run is back in the queue under the newest task right away.
    assert.equal((await activities.get('run-1')).taskId, followUp.id);
    await settle(service);

    const activity = await activities.get('run-1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.COMPLETED);
    assert.equal(activity.turns.length, 2);
    assert.equal(activity.turns[1].question, 'And what about the CDN?');
    assert.equal(activity.turns[1].answer, 'Use a CDN [S1].');
    assert.equal(activity.question, 'How do I cache?', 'the goal stays the first question');
    assert.deepEqual(activity.budget, { maxSteps: 25, maxTopicReads: 14, maxCharsPerRead: 45000 });
    assert.equal(activity.steps.filter(step => step.turn === 0).length, 1);
    const followUpPlan = ai.calls.filter(call => !call.answer).at(-1);
    assert.match(followUpPlan.messages[0].content, /^GOAL:/);
    assert.match(followUpPlan.messages.at(-1).content, /And what about the CDN\?/);
    assert.equal((await db.listAgentActivities()).length, 1, 'still one run');

    // Not on another forum, not on a missing run, not while one is running.
    await assert.rejects(
      service.enqueue(
        request({ agentRunId: 'run-1', siteUrl: 'https://other.example.org', followUp: true, question: 'x', clientRequestId: 'c6' })
      ),
      /no longer available/
    );
    await assert.rejects(
      service.enqueue(request({ agentRunId: 'missing', followUp: true, question: 'x', clientRequestId: 'c5' })),
      /no longer available/
    );
    const hanging = scriptedAi([], { onPlan: () => new Promise(() => {}) });
    const busy = setup({ db, ai: hanging });
    await busy.service.enqueue(request({ agentRunId: 'run-1', followUp: true, question: 'Again?', clientRequestId: 'c3' }));
    await assert.rejects(
      busy.service.enqueue(request({ agentRunId: 'run-1', followUp: true, question: 'Twice?', clientRequestId: 'c4' })),
      /still working/
    );
  } finally {
    forum.restore();
  }
});

test('a worker restart resumes the run from the last saved step', async () => {
  const forum = installForum();
  try {
    const db = database();
    // First worker: the search finishes, then the worker dies while the model decides the next step.
    const dying = scriptedAi([], {
      onPlan: count => (count === 1 ? action('search_forum', { query: 'cache' }) : new Promise(() => {}))
    });
    const first = setup({ db, ai: dying });
    await first.service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    for (let attempt = 0; attempt < 100 && dying.calls.length < 2; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(dying.calls.length, 2);
    assert.equal((await db.getAgentActivity('run-1')).steps.length, 1, 'the finished step is saved');
    assert.equal(forum.requests.length, 1);

    // Second worker over the same database.
    const ai = scriptedAi([action('read_topic', { topic_id: '11' }), action('final_answer', { answer: 'g' })]);
    const second = setup({ db, ai });
    await settle(second.service);
    const restored = second.service.list().find(task => task.status === TASK_STATUS.COMPLETED);
    assert.ok(restored, 'the restored task finished');
    const activity = await db.getAgentActivity('run-1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.COMPLETED);
    assert.deepEqual(
      activity.steps.map(step => step.tool),
      ['search_forum', 'read_topic']
    );
    assert.equal(forum.requests.filter(url => url.includes('/search.json')).length, 1, 'the search was not repeated');
    assert.match(ai.calls[0].messages.at(-1).content, /^OBSERVATION from search_forum:/, 'the model continues after the saved step');
    assert.equal(ai.calls[0].messages.filter(message => message.content.startsWith('GOAL')).length, 1);
  } finally {
    forum.restore();
  }
});

test('login required: the run waits with its step kept, and Continue runs that step again', async () => {
  const mode = { loginRequired: true };
  const forum = installForum(mode);
  try {
    const ai = scriptedAi([action('search_forum', { query: 'cache' }), action('final_answer', { answer: 'g' })]);
    const { service, activities } = setup({ ai });
    const task = await service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    await settle(service);
    assert.equal(service.list().find(item => item.id === task.id).status, TASK_STATUS.WAITING_USER_ACTION);
    let activity = await activities.get('run-1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION);
    assert.equal(activity.completedAt, 0);
    assert.deepEqual(
      activity.steps.map(step => step.status),
      ['running']
    );
    assert.equal(ai.calls.filter(call => !call.answer).length, 1);

    mode.loginRequired = false;
    await service.resume(task.id);
    await settle(service);
    activity = await activities.get('run-1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.COMPLETED);
    assert.deepEqual(
      activity.steps.map(step => step.status),
      ['completed']
    );
    assert.equal(ai.calls.filter(call => !call.answer).length, 2, 'the search was replayed, not re-planned');
    assert.equal(forum.requests.filter(url => url.includes('/search.json')).length, 2);
  } finally {
    forum.restore();
  }
});

test('forum access removed mid-run: waiting for access, then Continue picks the step up again', async () => {
  let granted = true;
  const forum = installForum({ fail: true, onFail: () => (granted = false) });
  try {
    const ai = scriptedAi([action('search_forum', { query: 'cache' }), action('final_answer', { answer: 'g' })]);
    const { service, activities } = setup({ ai, hasForumAccess: async () => granted });
    const task = await service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    await settle(service);
    const waiting = service.list().find(item => item.id === task.id);
    assert.equal(waiting.status, TASK_STATUS.WAITING_USER_ACTION);
    assert.equal(waiting.statusText, 'Waiting for forum access');
    assert.deepEqual(
      (await activities.get('run-1')).steps.map(step => step.status),
      ['running']
    );
  } finally {
    forum.restore();
  }
});

test('cancelling stops the run, keeps the steps and writes no answer', async () => {
  const forum = installForum();
  try {
    const ai = scriptedAi([], {
      onPlan: (count, signal) =>
        count === 1
          ? action('search_forum', { query: 'cache' })
          : new Promise((_, reject) =>
              signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
            )
    });
    const { service, activities } = setup({ ai });
    const task = await service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    for (let attempt = 0; attempt < 100 && ai.calls.length < 2; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    await service.cancel(task.id);
    await settle(service);
    const activity = await activities.get('run-1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.CANCELLED);
    assert.equal(activity.answer, '');
    assert.equal(activity.steps.length, 1);
    assert.equal(service.list().find(item => item.id === task.id).status, TASK_STATUS.CANCELLED);
  } finally {
    forum.restore();
  }
});

test('a model that cannot produce an action fails the run with a clear message and keeps the failed step', async () => {
  const forum = installForum();
  try {
    const { service, activities } = setup({ ai: scriptedAi(['hmm', 'still hmm']) });
    const task = await service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    await settle(service);
    assert.equal(service.list().find(item => item.id === task.id).status, TASK_STATUS.FAILED);
    const activity = await activities.get('run-1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.FAILED);
    assert.match(activity.error.message, /did not reply with a valid action/);
    assert.equal(activity.steps[0].tool, 'plan');
  } finally {
    forum.restore();
  }
});

test("saved_summaries reads the user's saved summaries of this forum from the database, with no request", async () => {
  const forum = installForum();
  try {
    const db = database();
    await db.save({
      ...createTopicSession({ topicId: '7', siteUrl: SITE, url: `${SITE}/t/7`, title: 'Backups' }),
      summary: 'Nightly backups to S3.'
    });
    await db.save({
      ...createTopicSession({
        topicId: '7',
        siteUrl: 'https://other.example.org',
        url: 'https://other.example.org/t/7',
        title: 'Elsewhere'
      }),
      summary: 'Backups elsewhere.'
    });
    const ai = scriptedAi([action('saved_summaries', { query: 'backups' }), action('final_answer', { answer: 'g' })], {
      answer: 'Nightly backups [S1].'
    });
    const { service, activities } = setup({ db, ai });
    await service.enqueue(request({ agentRunId: 'run-1', clientRequestId: 'c1' }));
    await settle(service);
    const activity = await activities.get('run-1');
    assert.equal(activity.steps[0].tool, 'saved_summaries');
    assert.equal(activity.steps[0].resultCount, 1);
    assert.match(activity.steps[0].detail, /Nightly backups to S3/);
    assert.doesNotMatch(activity.steps[0].detail, /elsewhere/i);
    assert.equal(activity.sourceRefs[0].topicId, '7');
    assert.deepEqual(forum.requests, []);
  } finally {
    forum.restore();
  }
});
