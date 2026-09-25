// Background gating: nothing reads a forum the user has not enabled.
// Summaries and chat fail fast with an actionable error; Agent research
// waits for the user (WAITING_USER_ACTION) and Continue works once access
// is granted — also when access is removed while a task runs.
import assert from 'node:assert/strict';
import test from 'node:test';

import { TaskService } from '../src/background/task-service.mjs';
import { AgentActivityStore } from '../src/background/agent-activity-store.mjs';
import { createTopicExecutors } from '../src/background/topic-executors.mjs';
import { FORUM_ACCESS_REQUIRED_TEXT, createAgentExecutor } from '../src/background/agent-executor.mjs';
import { ForumRequestGovernor } from '../src/background/forum-tools.mjs';
import { JobQueue } from '../src/background/job-queue.mjs';
import { readConfig } from '../src/shared/config-state.mjs';
import { FORUM_ACCESS_ERROR_CODE } from '../src/shared/forum-access.mjs';
import { AGENT_ACTIVITY_STATUS } from '../src/shared/agent-activity.mjs';
import { TASK_STATUS, createTaskRecord } from '../src/shared/task-record.mjs';

const SITE = 'https://forum.example.com';

function fakeDb() {
  const activities = new Map();
  const tasks = new Map();
  const sessions = new Map();
  return {
    activities,
    sessions,
    async open() {},
    async cleanupStaleChats() {},
    async cleanupTasks() {},
    async cleanupAgentActivities() {},
    async prune() {},
    setRetention() {},
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
    },
    async get(key) {
      return sessions.get(key) || null;
    },
    async save(session) {
      sessions.set(session.topicKey, { ...session });
    }
  };
}

const alarms = {
  async get() {},
  create() {},
  async clear() {
    return true;
  }
};

test('enqueue refuses a forum that is not enabled, before queuing anything', async () => {
  const db = fakeDb();
  const broadcast = () => {};
  let access = false;
  const agentActivities = new AgentActivityStore({ db, broadcast });
  const service = new TaskService({
    db,
    agentActivities,
    broadcast,
    alarms,
    readConfig: async () => readConfig({}),
    hasForumAccess: async siteUrl => {
      assert.equal(siteUrl, SITE);
      return access;
    }
  });
  service.start(() => new Promise(() => {}));
  const request = { taskType: 'agent', siteUrl: `${SITE}/`, question: 'What changed?', provider: 'openai', settings: {} };
  await assert.rejects(service.enqueue(request), error => {
    assert.equal(error.code, FORUM_ACCESS_ERROR_CODE);
    assert.equal(error.message, 'Allow DiscourseCopilot on forum.example.com in the side panel, then try again.');
    return true;
  });
  assert.equal(service.list().length, 0);
  assert.equal(db.activities.size, 0, 'no Agent activity for a refused request');

  access = true;
  const task = await service.enqueue(request);
  assert.equal(service.list().length, 1);
  assert.ok([TASK_STATUS.QUEUED, TASK_STATUS.RUNNING].includes(task.status));
});

function topicExecutors({ access, fetchTopicContent }) {
  return createTopicExecutors({
    aiService: {
      async generateSummary() {
        return 'summary';
      }
    },
    db: fakeDb(),
    broadcast: () => {},
    getTaskConfiguration: async () => ({ provider: 'openai', settings: { model: 'm' }, limits: {} }),
    fetchTopicContent,
    hasForumAccess: async () => access()
  });
}

const summaryTask = createTaskRecord({ id: 's1', type: 'summary', topicId: '7', siteUrl: SITE });
const noopReport = async () => {};

test('a summary for a forum without access fails fast with the actionable error', async () => {
  let fetched = 0;
  const { executeSummaryTask } = topicExecutors({
    access: () => false,
    fetchTopicContent: async () => {
      fetched++;
    }
  });
  await assert.rejects(
    executeSummaryTask(summaryTask, { signal: new AbortController().signal, report: noopReport }),
    error => error.code === FORUM_ACCESS_ERROR_CODE && /Allow DiscourseCopilot on forum\.example\.com/.test(error.message)
  );
  assert.equal(fetched, 0, 'the forum is never requested');
});

test('access removed while reading turns the refused request into the access error', async () => {
  let granted = true;
  const { executeSummaryTask } = topicExecutors({
    access: () => granted,
    fetchTopicContent: async () => {
      granted = false;
      throw new TypeError('Failed to fetch');
    }
  });
  await assert.rejects(
    executeSummaryTask(summaryTask, { signal: new AbortController().signal, report: noopReport }),
    error => error.code === FORUM_ACCESS_ERROR_CODE
  );

  // A network error with access still granted stays what it is.
  const { executeSummaryTask: other } = topicExecutors({
    access: () => true,
    fetchTopicContent: async () => {
      throw new TypeError('Failed to fetch');
    }
  });
  await assert.rejects(
    other(summaryTask, { signal: new AbortController().signal, report: noopReport }),
    error => error instanceof TypeError
  );
});

test('an Agent run waits for access, then Continue finishes it', async () => {
  const db = fakeDb();
  const activities = new AgentActivityStore({ db, broadcast: () => {} });
  let granted = false;
  const requests = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    requests.push(String(url));
    return new Response(JSON.stringify({ posts: [], topics: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    const execute = createAgentExecutor({
      aiService: {
        async generateAgentAnswer() {
          return 'answer';
        }
      },
      activities,
      broadcast: () => {},
      getTaskConfiguration: async () => ({
        provider: 'openai',
        settings: { model: 'm' },
        forumName: 'Example',
        limits: { research: { searchQueries: 1, searchPages: 1, topicsRead: 1 } }
      }),
      governor: new ForumRequestGovernor({ minIntervalMs: 0 }),
      hasForumAccess: async () => granted
    });
    const transitions = [];
    const queue = new JobQueue({
      execute,
      onTransition: async task => {
        transitions.push({ ...task });
      }
    });
    await queue.enqueue(
      createTaskRecord({
        id: 'a1',
        type: 'agent',
        siteUrl: SITE,
        agentRunId: 'a1',
        question: 'How do I reset my password?'
      })
    );
    await queue.waitForIdle();

    const waiting = queue.list().find(task => task.id === 'a1');
    assert.equal(waiting.status, TASK_STATUS.WAITING_USER_ACTION);
    assert.equal(waiting.statusText, FORUM_ACCESS_REQUIRED_TEXT);
    assert.match(waiting.error, /Allow DiscourseCopilot on forum\.example\.com/);
    const activity = await activities.get('a1');
    assert.equal(activity.status, AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION);
    assert.equal(activity.error.code, FORUM_ACCESS_ERROR_CODE);
    assert.equal(activity.completedAt, 0, 'a waiting run stays open');
    assert.deepEqual(requests, [], 'nothing was fetched without access');

    // Continue without granting: still waiting.
    await queue.resume('a1');
    await queue.waitForIdle();
    assert.equal(queue.list().find(task => task.id === 'a1').status, TASK_STATUS.WAITING_USER_ACTION);

    granted = true;
    await queue.resume('a1');
    await queue.waitForIdle();
    const done = queue.list().find(task => task.id === 'a1');
    assert.equal(done.status, TASK_STATUS.COMPLETED);
    assert.ok(
      requests.some(url => url.startsWith(`${SITE}/search.json`)),
      requests.join(',')
    );
    assert.equal((await activities.get('a1')).status, AGENT_ACTIVITY_STATUS.COMPLETED);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('access removed during Agent research waits instead of failing', async () => {
  const db = fakeDb();
  const activities = new AgentActivityStore({ db, broadcast: () => {} });
  let granted = true;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    granted = false;
    throw new TypeError('Failed to fetch');
  };
  try {
    const execute = createAgentExecutor({
      aiService: {
        async generateAgentAnswer() {
          return 'answer';
        }
      },
      activities,
      broadcast: () => {},
      getTaskConfiguration: async () => ({ provider: 'openai', settings: {}, limits: {} }),
      governor: new ForumRequestGovernor({ minIntervalMs: 0 }),
      hasForumAccess: async () => granted
    });
    const queue = new JobQueue({ execute });
    await queue.enqueue(createTaskRecord({ id: 'a2', type: 'agent', siteUrl: SITE, agentRunId: 'a2', question: 'Q?' }));
    await queue.waitForIdle();
    const task = queue.list().find(item => item.id === 'a2');
    assert.equal(task.status, TASK_STATUS.WAITING_USER_ACTION);
    assert.equal((await activities.get('a2')).error.code, FORUM_ACCESS_ERROR_CODE);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
