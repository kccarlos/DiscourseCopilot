import assert from 'node:assert/strict';
import test from 'node:test';

import { JobQueue } from '../src/background/job-queue.mjs';
import {
  TASK_STATUS,
  createTaskRecord
} from '../src/shared/task-record.mjs';

function task(id, topicId = id, now = 1) {
  return createTaskRecord({
    id,
    type: 'summary',
    topicId,
    title: `Topic ${topicId}`,
    url: `https://www.uscardforum.com/t/topic/${topicId}`
  }, now);
}

test('caps global concurrency and serializes jobs for the same topic', async () => {
  let active = 0;
  let peak = 0;
  const sameTopicActive = new Set();
  const violations = [];
  const releases = new Map();

  const queue = new JobQueue({
    concurrency: 2,
    execute: async record => {
      active++;
      peak = Math.max(peak, active);
      if (sameTopicActive.has(record.resourceKey)) {
        violations.push(record.id);
      }
      sameTopicActive.add(record.resourceKey);
      await new Promise(resolve => releases.set(record.id, resolve));
      sameTopicActive.delete(record.resourceKey);
      active--;
    }
  });

  await queue.enqueue(task('a1', '101'));
  await queue.enqueue(task('a2', '101'));
  await queue.enqueue(task('b1', '102'));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(peak, 2);
  assert.deepEqual(violations, []);
  assert.equal(queue.get('a1').status, TASK_STATUS.RUNNING);
  assert.equal(queue.get('a2').status, TASK_STATUS.QUEUED);
  assert.equal(queue.get('b1').status, TASK_STATUS.RUNNING);

  releases.get('a1')();
  releases.get('b1')();
  await new Promise(resolve => setImmediate(resolve));
  releases.get('a2')();
  await queue.waitForIdle();

  assert.equal(queue.get('a2').status, TASK_STATUS.COMPLETED);
});

test('cancels queued and running work with durable terminal states', async () => {
  const transitions = [];
  const queue = new JobQueue({
    concurrency: 1,
    execute: async (_record, { signal }) => {
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
    onTransition: async record => transitions.push({ ...record })
  });

  await queue.enqueue(task('running', '201'));
  await queue.enqueue(task('queued', '202'));
  await new Promise(resolve => setImmediate(resolve));
  await queue.cancel('queued');
  await queue.cancel('running');
  await queue.waitForIdle();

  assert.equal(queue.get('queued').status, TASK_STATUS.CANCELLED);
  assert.equal(queue.get('running').status, TASK_STATUS.CANCELLED);
  assert.equal(
    transitions.some(record =>
      record.id === 'running' && record.status === TASK_STATUS.CANCELLED
    ),
    true
  );
});

test('restores unfinished work as queued after an extension restart', async () => {
  const executed = [];
  const queue = new JobQueue({
    execute: async record => executed.push(record.id)
  });
  const interrupted = {
    ...task('resume', '301'),
    status: TASK_STATUS.RUNNING,
    phase: 'generating'
  };

  await queue.restore([interrupted]);
  await queue.waitForIdle();

  assert.deepEqual(executed, ['resume']);
  assert.equal(queue.get('resume').status, TASK_STATUS.COMPLETED);
});

test('releases a worker slot if a durable start transition fails', async () => {
  let transitions = 0;
  const queue = new JobQueue({
    execute: async () => {
      throw new Error('executor should not run');
    },
    onTransition: async record => {
      transitions++;
      if (record.status === TASK_STATUS.RUNNING) {
        throw new Error('database unavailable');
      }
    }
  });

  await queue.enqueue(task('fails-to-start', '401'));
  await queue.waitForIdle();

  assert.equal(queue.running.size, 0);
  assert.equal(queue.get('fails-to-start').status, TASK_STATUS.FAILED);
  assert.ok(transitions >= 2);
});

test('holds Agent work for user action and resumes it explicitly', async () => {
  let executions = 0;
  const queue = new JobQueue({
    execute: async () => {
      executions++;
      if (executions === 1) {
        return {
          status: TASK_STATUS.WAITING_USER_ACTION,
          phase: 'forum_verification',
          statusText: 'Forum verification is required'
        };
      }
    }
  });
  const agent = createTaskRecord({
    id: 'agent-waiting',
    type: 'agent',
    agentRunId: 'run-waiting',
    question: 'Find a forum answer'
  });

  await queue.enqueue(agent);
  await queue.waitForIdle();

  assert.equal(queue.get(agent.id).status, TASK_STATUS.WAITING_USER_ACTION);
  assert.equal(queue.get(agent.id).completedAt, 0);
  assert.equal(queue.get(agent.id).phase, 'forum_verification');

  await queue.resume(agent.id);
  await queue.waitForIdle();

  assert.equal(executions, 2);
  assert.equal(queue.get(agent.id).status, TASK_STATUS.COMPLETED);
});

test('does not automatically retry waiting-for-user-action work after restore', async () => {
  let executed = false;
  const queue = new JobQueue({
    execute: async () => {
      executed = true;
    }
  });
  const waiting = {
    ...createTaskRecord({
      id: 'restored-waiting',
      type: 'agent',
      agentRunId: 'restored-run',
      question: 'Find a forum answer'
    }),
    status: TASK_STATUS.WAITING_USER_ACTION,
    phase: 'forum_verification',
    statusText: 'Forum verification is required'
  };

  await queue.restore([waiting]);
  await queue.waitForIdle();

  assert.equal(executed, false);
  assert.equal(queue.get(waiting.id).status, TASK_STATUS.WAITING_USER_ACTION);
});
