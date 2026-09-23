import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { TopicSessionDatabase } from '../src/popup/topic-session-db.mjs';
import {
  CHAT_RETENTION_MS,
  createTopicSession
} from '../src/popup/topic-session.mjs';
import { buildTopicKey } from '../src/shared/forum-site.mjs';
import {
  TASK_RETENTION_MS,
  TASK_STATUS,
  createTaskRecord
} from '../src/shared/task-record.mjs';
import {
  AGENT_ACTIVITY_STATUS,
  createAgentActivity,
  normalizeAgentActivity
} from '../src/shared/agent-activity.mjs';

function createDatabase(name, options = {}) {
  return new TopicSessionDatabase({
    indexedDB,
    keyRange: IDBKeyRange,
    databaseName: name,
    ...options
  });
}

const USC_SITE = 'https://www.uscardforum.com';

function key(topicId, siteUrl = USC_SITE) {
  return buildTopicKey(siteUrl, topicId);
}

function savedSession(topicId, updatedAt) {
  return {
    ...createTopicSession({
      topicId,
      url: `https://www.uscardforum.com/t/topic-${topicId}/${topicId}`,
      title: `Topic ${topicId}`
    }, 1),
    source: `source ${topicId}`,
    rawPages: [{ page: 1, content: `source ${topicId}` }],
    summary: `summary ${topicId}`,
    history: [
      { role: 'user', content: `question ${topicId}` },
      { role: 'assistant', content: `answer ${topicId}` }
    ],
    totalPosts: 3,
    summaryPostCount: 3,
    updatedAt,
    summaryUpdatedAt: updatedAt,
    chatUpdatedAt: updatedAt
  };
}

test('persists heavy session data and lists only lightweight metadata', async () => {
  const database = createDatabase(`topic-session-${crypto.randomUUID()}`, {
    now: () => 1000
  });
  await database.save(savedSession('123', 1000));

  const restored = await database.get(key('123'));
  const entries = await database.list();

  assert.equal(restored.source, 'source 123');
  assert.deepEqual(restored.rawPages, [{ page: 1, content: 'source 123' }]);
  assert.equal(restored.history.length, 2);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].topicId, '123');
  assert.equal(entries[0].historyCount, 2);
  assert.equal('source' in entries[0], false);
});

test('automatically clears stale chat but keeps the summary record', async () => {
  let now = 1000;
  const database = createDatabase(`topic-expiry-${crypto.randomUUID()}`, {
    now: () => now
  });
  await database.save(savedSession('123', now));

  now += CHAT_RETENTION_MS + 1;
  const restored = await database.get(key('123'));
  const [entry] = await database.list();

  assert.deepEqual(restored.history, []);
  assert.equal(restored.summary, 'summary 123');
  assert.equal(restored.source, 'source 123');
  assert.equal(entry.historyCount, 0);
});

test('keeps a saved session and its chat beyond the retention window', async () => {
  let now = 1000;
  const database = createDatabase(`topic-keep-${crypto.randomUUID()}`, {
    now: () => now
  });
  await database.save(savedSession('123', now));
  const kept = await database.setKept(key('123'), true);

  assert.equal(kept.kept, true);
  now += CHAT_RETENTION_MS + 1;
  assert.equal(await database.cleanupStaleChats(), 0);

  const restored = await database.get(key('123'));
  const [entry] = await database.list();
  assert.equal(restored.history.length, 2);
  assert.equal(restored.kept, true);
  assert.equal(entry.kept, true);

  const unkept = await database.setKept(key('123'), false);
  assert.deepEqual(unkept.history, []);
  assert.equal(await database.cleanupStaleChats(), 0);
});

test('prunes the least recently updated summaries and deletes both stores', async () => {
  const database = createDatabase(`topic-prune-${crypto.randomUUID()}`, {
    maxSavedTopics: 2
  });

  await database.save(savedSession('1', 100));
  await database.save(savedSession('2', 200));
  await database.save(savedSession('3', 300));

  assert.deepEqual(
    (await database.list()).map(entry => entry.topicId),
    ['3', '2']
  );
  assert.equal(await database.get(key('1')), null);
  assert.equal((await database.get(key('2'))).summary, 'summary 2');
});

test('kept sessions are exempt from saved-summary pruning', async () => {
  const database = createDatabase(`topic-keep-prune-${crypto.randomUUID()}`, {
    maxSavedTopics: 1
  });

  await database.save({ ...savedSession('1', 100), kept: true });
  await database.save(savedSession('2', 200));

  assert.deepEqual(
    (await database.list()).map(entry => entry.topicId),
    ['1']
  );
  assert.equal((await database.get(key('1'))).kept, true);
  assert.equal(await database.get(key('2')), null);
});

test('deletes a saved topic and its history index together', async () => {
  const database = createDatabase(`topic-delete-${crypto.randomUUID()}`);
  await database.save(savedSession('123', 1000));
  await database.delete(key('123'));

  assert.equal(await database.get(key('123')), null);
  assert.deepEqual(await database.list(), []);
});

test('hides cache-only sessions from history while counting them for pruning', async () => {
  const database = createDatabase(`cache-only-${crypto.randomUUID()}`, {
    maxSavedTopics: 1,
    now: () => 1000
  });
  const cacheOnly = {
    ...createTopicSession({
      topicId: '10',
      url: 'https://www.uscardforum.com/t/cache/10',
      title: 'Cache only'
    }, 1),
    source: 'fetched source',
    rawPages: [{ page: 1, content: 'fetched source' }],
    updatedAt: 200
  };
  await database.save(savedSession('11', 100));
  await database.save(cacheOnly);

  assert.deepEqual(await database.list(), []);
  assert.equal((await database.get(key('10'))).source, 'fetched source');
  assert.equal(await database.get(key('11')), null);
});

test('persists task progress separately without storing runtime credentials', async () => {
  const database = createDatabase(`task-store-${crypto.randomUUID()}`, {
    now: () => 1000
  });
  const task = {
    ...createTaskRecord({
      id: 'task-1',
      type: 'summary',
      topicId: '123',
      siteUrl: USC_SITE,
      provider: 'openrouter',
      model: 'test/model'
    }, 100),
    status: TASK_STATUS.RUNNING,
    phase: 'fetching',
    progress: { percent: 50, currentPage: 2, totalPages: 4 },
    settings: { apiKey: 'not-persisted' }
  };

  await database.saveTask(task);
  const restored = await database.getTask('task-1');

  assert.equal(restored.status, TASK_STATUS.RUNNING);
  assert.equal(restored.progress.percent, 50);
  assert.equal('settings' in restored, false);
  assert.equal(JSON.stringify(restored).includes('not-persisted'), false);
});

test('cleans terminal task records after one day but preserves queued work', async () => {
  let now = 1000;
  const database = createDatabase(`task-cleanup-${crypto.randomUUID()}`, {
    now: () => now
  });
  const completed = {
    ...createTaskRecord({
      id: 'done',
      type: 'summary',
      topicId: '1',
      siteUrl: USC_SITE
    }, now),
    status: TASK_STATUS.COMPLETED,
    completedAt: now,
    updatedAt: now
  };
  const queued = createTaskRecord({
    id: 'queued',
    type: 'summary',
    topicId: '2',
    siteUrl: USC_SITE
  }, now);
  await database.saveTask(completed);
  await database.saveTask(queued);

  now += TASK_RETENTION_MS + 1;
  assert.equal(await database.cleanupTasks(), 1);
  assert.equal(await database.getTask('done'), null);
  assert.equal((await database.getTask('queued')).status, TASK_STATUS.QUEUED);
});

test('persists, indexes, keeps, and expires Agent activities independently', async () => {
  let now = 1000;
  const database = createDatabase(`agent-activities-${crypto.randomUUID()}`, {
    now: () => now,
    agentActivityRetentionMs: 100,
    maxAgentActivities: 10
  });
  const activity = normalizeAgentActivity({
    activityId: 'activity-1',
    taskId: 'task-1',
    agentRunId: 'run-1',
    question: 'What changed?',
    status: AGENT_ACTIVITY_STATUS.COMPLETED,
    completedAt: now,
    expiresAt: now + 100,
    answer: 'The answer is [S1].',
    sourceRefs: [{
      sourceId: 'S1',
      topicId: '123',
      title: 'A topic',
      url: 'https://www.uscardforum.com/t/a-topic/123'
    }]
  }, now);

  await database.saveAgentActivity(activity);
  const restored = await database.getAgentActivity('activity-1');
  const [index] = await database.listAgentActivityIndex();
  assert.equal(restored.answer, 'The answer is [S1].');
  assert.equal(index.sourceCount, 1);
  assert.equal(index.answerExcerpt, 'The answer is S1.');

  await database.setAgentActivityKept('activity-1', true);
  now += 1000;
  assert.equal(await database.cleanupAgentActivities(), 0);
  assert.equal((await database.getAgentActivity('activity-1')).kept, true);

  await database.setAgentActivityKept('activity-1', false);
  now += 101;
  assert.equal(await database.cleanupAgentActivities(), 1);
  assert.equal(await database.getAgentActivity('activity-1'), null);
});

test('viewer marks on Agent activities survive later background snapshots', async () => {
  const database = createDatabase(`agent-marks-${crypto.randomUUID()}`, { now: () => 1000 });
  const running = createAgentActivity({
    activityId: 'run-1',
    taskId: 'task-1',
    question: 'What changed?',
    siteUrl: USC_SITE
  }, 1000);
  await database.saveAgentActivity(running);

  assert.equal(await database.markAgentActivity('missing', { dismissedAt: 5 }), null);
  const marked = await database.markAgentActivity('run-1', { dismissedAt: 1500 });
  assert.equal(marked.dismissedAt, 1500);
  assert.equal(marked.question, 'What changed?');

  // The worker saves its own copy, which has never seen the viewer's marks.
  const saved = await database.saveAgentActivity({
    ...running,
    status: AGENT_ACTIVITY_STATUS.COMPLETED,
    answer: 'Done',
    lastOpenedAt: 1200
  });
  assert.equal(saved.dismissedAt, 1500);
  assert.equal(saved.lastOpenedAt, 1200);
  const restored = await database.getAgentActivity('run-1');
  assert.equal(restored.answer, 'Done');
  assert.equal(restored.dismissedAt, 1500);

  await database.markAgentActivity('run-1', { lastOpenedAt: 900 });
  assert.equal((await database.getAgentActivity('run-1')).lastOpenedAt, 1200);
  const [index] = await database.listAgentActivityIndex();
  assert.equal(index.dismissedAt, 1500);
});

test('closes an open connection when a newer database version is requested', async () => {
  const name = `topic-session-versionchange-${crypto.randomUUID()}`;
  const database = createDatabase(name);
  await database.open();

  await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 5);
    request.onupgradeneeded = () => {};
    request.onblocked = () => reject(new Error('database upgrade remained blocked'));
    request.onerror = () => reject(request.error || new Error('database upgrade failed'));
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
});

test('stores equal topic IDs from different forums as distinct sessions', async () => {
  const database = createDatabase(`topic-collision-${crypto.randomUUID()}`, {
    now: () => 1000
  });
  await database.save({
    ...createTopicSession({
      topicId: '123',
      siteUrl: 'https://community.openai.com',
      url: 'https://community.openai.com/t/openai-topic/123',
      title: 'OpenAI topic'
    }, 1),
    summary: 'openai summary',
    updatedAt: 200
  });
  await database.save({
    ...createTopicSession({
      topicId: '123',
      siteUrl: USC_SITE,
      url: 'https://www.uscardforum.com/t/usc-topic/123',
      title: 'USC topic'
    }, 1),
    summary: 'usc summary',
    updatedAt: 100
  });

  const entries = await database.list();
  assert.deepEqual(
    entries.map(entry => entry.topicKey),
    ['community.openai.com/t/123', 'www.uscardforum.com/t/123']
  );
  assert.equal(entries[0].siteUrl, 'https://community.openai.com');
  assert.equal(
    (await database.get('community.openai.com/t/123')).summary,
    'openai summary'
  );
  assert.equal((await database.get(key('123'))).summary, 'usc summary');

  await database.delete(key('123'));
  assert.equal(await database.get(key('123')), null);
  assert.equal(
    (await database.get('community.openai.com/t/123')).title,
    'OpenAI topic'
  );
});

test('migrates version 3 topic stores keyed by topic ID to topic keys', async () => {
  const name = `topic-migration-${crypto.randomUUID()}`;
  await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onupgradeneeded = () => {
      const database = request.result;
      const sessions = database.createObjectStore('topicSessions', { keyPath: 'topicId' });
      sessions.createIndex('chatUpdatedAt', 'chatUpdatedAt');
      database.createObjectStore('topicIndex', { keyPath: 'topicId' });
      const tasks = database.createObjectStore('tasks', { keyPath: 'id' });
      tasks.createIndex('status', 'status');
      tasks.createIndex('updatedAt', 'updatedAt');
      sessions.put({
        topicId: '123',
        url: 'https://www.uscardforum.com/t/legacy/123',
        title: 'Legacy topic',
        summary: 'legacy summary',
        updatedAt: 50
      });
      sessions.put({ topicId: '456', url: 'not a url', summary: 'orphan' });
      database.createObjectStore('agentActivities', { keyPath: 'activityId' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });

  const database = createDatabase(name, { now: () => 1000 });
  const migrated = await database.get(key('123'));
  const entries = await database.list();

  assert.equal(migrated.summary, 'legacy summary');
  assert.equal(migrated.siteUrl, USC_SITE);
  assert.deepEqual(entries.map(entry => entry.topicKey), [key('123')]);
  assert.equal(await database.get('456'), null);

  await database.save(savedSession('789', 2000));
  assert.equal((await database.get(key('789'))).summary, 'summary 789');
});

test('round-trips forum names through the session and index stores', async () => {
  const database = createDatabase(`topic-session-${crypto.randomUUID()}`, {
    now: () => 1000
  });
  await database.save({ ...savedSession('123', 1000), forumName: 'US Card Forum' });

  const restored = await database.get(key('123'));
  const [entry] = await database.list();

  assert.equal(restored.forumName, 'US Card Forum');
  assert.equal(entry.forumName, 'US Card Forum');
});
