// The side panel's Agent run store: deleting a run with Undo, and runs
// derived from queue tasks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { AgentRuns, selectAgentRunView } from '../src/popup/agent-runs.mjs';
import { TaskRegistry } from '../src/popup/task-registry.mjs';
import { TopicSessionDatabase } from '../src/shared/topic-session-db.mjs';
import { AGENT_ACTIVITY_STATUS, normalizeAgentActivity } from '../src/shared/agent-activity.mjs';

const SITE = 'https://forum.example.com';
const NOW = Date.now();

function completedRun(id) {
  return normalizeAgentActivity({
    activityId: id,
    taskId: `task-${id}`,
    agentRunId: id,
    question: `Question ${id}`,
    siteUrl: SITE,
    status: AGENT_ACTIVITY_STATUS.COMPLETED,
    createdAt: NOW - 5000,
    completedAt: NOW - 1000,
    answer: 'An answer.'
  }, NOW);
}

// The finished queue task stays in the panel's task list for days.
function finishedTask(id) {
  return {
    id: `task-${id}`,
    type: 'agent',
    agentRunId: id,
    title: `Question ${id}`,
    question: `Question ${id}`,
    siteUrl: SITE,
    status: 'completed',
    createdAt: NOW - 5000,
    updatedAt: NOW - 1000,
    completedAt: NOW - 1000
  };
}

async function setup(ids = ['run-1']) {
  const db = new TopicSessionDatabase({
    indexedDB,
    keyRange: IDBKeyRange,
    databaseName: `agent-runs-${crypto.randomUUID()}`
  });
  const tasks = new TaskRegistry({ sendMessage: async () => ({}) });
  for (const id of ids) {
    await db.saveAgentActivity(completedRun(id));
    tasks.set(finishedTask(id));
  }
  const runs = new AgentRuns({ tasks, isPersistent: () => true, db });
  await runs.load();
  return { db, tasks, runs };
}

test('a deleted run does not come back from its finished task or a late broadcast', async () => {
  const { db, runs } = await setup();
  assert.equal(selectAgentRunView(runs.records(), SITE).mode, 'panel');

  const copy = await runs.remove(runs.record('run-1'));
  assert.equal(copy.answer, 'An answer.');
  assert.equal(await db.getAgentActivity('run-1'), null, 'deleted from IndexedDB at once');
  assert.deepEqual(runs.records(), [], 'no run rebuilt from the task still listed');
  assert.equal(selectAgentRunView(runs.records(), SITE).mode, 'none', 'no empty inline panel');

  assert.equal(runs.update(completedRun('run-1')), undefined, 'broadcast ignored');
  assert.equal(runs.activities.has('run-1'), false);
});

test('a finished task without an activity (deleted, expired or pruned) is no run', async () => {
  const { db, tasks, runs } = await setup();
  await runs.remove(runs.record('run-1'));
  // A new panel: nothing remembered, the task still listed.
  const fresh = new AgentRuns({ tasks, isPersistent: () => true, db });
  await fresh.load();
  assert.deepEqual(fresh.records(), []);
  // An unfinished task whose activity wasn't broadcast yet still shows.
  tasks.set({ ...finishedTask('run-2'), status: 'running', completedAt: 0 });
  assert.deepEqual(fresh.records().map(record => [record.activityId, record.status]), [['run-2', 'running']]);
});

test('restore() puts the run back once, in IndexedDB and in the panel', async () => {
  const { db, runs } = await setup(['run-1', 'run-2']);
  const copy = await runs.remove(runs.record('run-1'));
  const restored = await runs.restore(copy);
  assert.equal(restored.activityId, 'run-1');
  assert.equal((await db.getAgentActivity('run-1')).answer, 'An answer.');
  assert.deepEqual(runs.records().map(record => record.activityId).sort(), ['run-1', 'run-2']);
  // Broadcasts reach it again.
  assert.notEqual(runs.update({ ...completedRun('run-1'), lastOpenedAt: NOW }), undefined);
  assert.equal(runs.records().filter(record => record.activityId === 'run-1').length, 1, 'not duplicated');
});
