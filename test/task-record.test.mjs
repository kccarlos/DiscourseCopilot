import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TASK_STATUS,
  createTaskRecord,
  isTerminalTaskStatus,
  normalizeTaskRecord
} from '../src/shared/task-record.mjs';

test('creates a serializable task record without provider credentials', () => {
  const task = createTaskRecord({
    id: 'task-1',
    type: 'summary',
    topicId: '123',
    title: 'Topic',
    url: 'https://www.uscardforum.com/t/topic/123',
    provider: 'openrouter',
    model: 'test/model',
    settings: { apiKey: 'must-not-persist' }
  }, 100);

  assert.equal(task.siteUrl, 'https://www.uscardforum.com');
  assert.equal(task.topicKey, 'www.uscardforum.com/t/123');
  assert.equal(task.resourceKey, 'topic:www.uscardforum.com/t/123');
  assert.equal(task.status, TASK_STATUS.QUEUED);
  assert.equal('settings' in task, false);
  assert.equal('maxPostChars' in task, false);
  assert.equal(JSON.stringify(task).includes('must-not-persist'), false);
});

test('snapshots a bounded forum context limit in chat task records', () => {
  const task = createTaskRecord({
    id: 'task-context',
    type: 'chat',
    topicId: '123',
    siteUrl: 'https://community.openai.com',
    question: 'What changed?',
    maxPostChars: 45000
  }, 100);
  const restored = normalizeTaskRecord({
    ...task,
    maxPostChars: 1999999
  }, 200);

  assert.equal(task.maxPostChars, 45000);
  assert.equal(restored.maxPostChars, 1000000);
});

test('normalizes bounded progress and terminal status', () => {
  const task = normalizeTaskRecord({
    ...createTaskRecord({
      id: 'task-1',
      type: 'chat',
      topicId: '123',
      siteUrl: 'https://community.openai.com',
      question: 'What changed?'
    }, 100),
    status: TASK_STATUS.COMPLETED,
    progress: {
      percent: 120,
      etaMs: -5,
      rateLimited: true,
      retryPage: 3,
      retryAttempt: 2,
      maxRetries: 6,
      retryAfterMs: 8000
    }
  }, 200);

  assert.equal(task.progress.percent, 100);
  assert.equal(task.progress.etaMs, 0);
  assert.deepEqual(
    {
      rateLimited: task.progress.rateLimited,
      retryPage: task.progress.retryPage,
      retryAttempt: task.progress.retryAttempt,
      maxRetries: task.progress.maxRetries,
      retryAfterMs: task.progress.retryAfterMs
    },
    {
      rateLimited: true,
      retryPage: 3,
      retryAttempt: 2,
      maxRetries: 6,
      retryAfterMs: 8000
    }
  );
  assert.equal(isTerminalTaskStatus(task.status), true);
  assert.equal(isTerminalTaskStatus(TASK_STATUS.RUNNING), false);
});

test('keys topic work by forum so equal topic IDs on different forums never collide', () => {
  const openai = createTaskRecord({
    id: 'openai',
    type: 'summary',
    topicId: '123',
    siteUrl: 'https://community.openai.com'
  }, 100);
  const usc = createTaskRecord({
    id: 'usc',
    type: 'summary',
    topicId: '123',
    siteUrl: 'https://www.uscardforum.com'
  }, 100);
  const subfolder = createTaskRecord({
    id: 'subfolder',
    type: 'chat',
    topicId: '123',
    siteUrl: 'https://example.com/forum/',
    question: 'Why?'
  }, 100);

  assert.notEqual(openai.resourceKey, usc.resourceKey);
  assert.equal(openai.resourceKey, 'topic:community.openai.com/t/123');
  assert.equal(subfolder.siteUrl, 'https://example.com/forum');
  assert.equal(subfolder.resourceKey, 'topic:example.com/forum/t/123');
  assert.equal(openai.title, 'Topic 123');
});

test('requires a valid forum site for topic tasks and keeps it on Agent tasks', () => {
  assert.throws(() => createTaskRecord({ id: 'x', type: 'summary', topicId: '123' }));
  assert.throws(() => createTaskRecord({
    id: 'x',
    type: 'summary',
    topicId: '123',
    siteUrl: 'http://example.com'
  }));
  const agent = createTaskRecord({
    id: 'agent',
    type: 'agent',
    question: 'Find answers',
    siteUrl: 'https://community.openai.com'
  }, 100);
  assert.equal(agent.siteUrl, 'https://community.openai.com');
  assert.equal(agent.topicKey, '');
  assert.equal(agent.resourceKey, 'agent:agent');
});

test('persists the reported forum name on summary and chat tasks', () => {
  const summary = createTaskRecord({
    id: 'summary-forum',
    type: 'summary',
    topicId: '123',
    siteUrl: 'https://meta.discourse.org',
    forumName: ' Discourse Meta '
  }, 100);
  const chat = normalizeTaskRecord({
    id: 'chat-forum',
    type: 'chat',
    topicId: '123',
    siteUrl: 'https://meta.discourse.org',
    question: 'Why?',
    forumName: 'Discourse Meta',
    status: TASK_STATUS.COMPLETED
  }, 100);
  const unnamed = createTaskRecord({
    id: 'summary-unnamed',
    type: 'summary',
    topicId: '123',
    siteUrl: 'https://meta.discourse.org'
  }, 100);

  assert.equal(summary.forumName, 'Discourse Meta');
  assert.equal(chat.forumName, 'Discourse Meta');
  // Topic work never invents a hostname name; display code falls back later.
  assert.equal(unnamed.forumName, '');
});
