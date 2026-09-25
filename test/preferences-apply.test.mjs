// The preferences reach every consumer: task limits are snapshotted at
// enqueue (and survive a restart), the Agent and the topic fetcher honor
// them, and history retention drives cleanup and the side panel's labels.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { TopicSessionDatabase } from '../src/shared/topic-session-db.mjs';
import { createTopicSession } from '../src/shared/topic-session.mjs';
import { TaskService } from '../src/background/task-service.mjs';
import { AgentActivityStore } from '../src/background/agent-activity-store.mjs';
import { effectiveResearchLimits, runAgentTask } from '../src/background/agent-runner.mjs';
import { createTopicFetcher, formatFetchTaskStatus, limitTopicPagination } from '../src/background/topic-fetcher.mjs';
import { createTopicExecutors } from '../src/background/topic-executors.mjs';
import { readConfig } from '../src/shared/config-state.mjs';
import { AGENT_ACTIVITY_STATUS, normalizeAgentActivity } from '../src/shared/agent-activity.mjs';
import { TASK_STATUS, createTaskRecord } from '../src/shared/task-record.mjs';
import { resolveRetention } from '../src/shared/preferences.mjs';
import { MAX_UNKNOWN_TOPIC_PAGES } from '../src/shared/forum-response.mjs';
import { describeSummaryCoverage, describeSummarizedReplies, retentionCopy } from '../src/popup/ui-state.mjs';
import { agentRecentWindowMs, selectSavedAgentActivities } from '../src/popup/agent-runs.mjs';

const DAY = 24 * 60 * 60 * 1000;
const SITE = 'https://forum.example.com';

function database(options = {}) {
  return new TopicSessionDatabase({
    indexedDB,
    keyRange: IDBKeyRange,
    databaseName: `prefs-${crypto.randomUUID()}`,
    ...options
  });
}

function fakeAlarms() {
  const alarms = new Map();
  return {
    async get(name) {
      return alarms.get(name);
    },
    create(name, info) {
      alarms.set(name, info);
    },
    async clear(name) {
      return alarms.delete(name);
    }
  };
}

// A task service over a real (fake-indexeddb) database whose saved
// preferences can be changed between calls.
function serviceFor(db, stored, execute = () => new Promise(() => {})) {
  const broadcast = () => {};
  const service = new TaskService({
    db,
    agentActivities: new AgentActivityStore({ db, broadcast }),
    broadcast,
    alarms: fakeAlarms(),
    readConfig: async () => readConfig(stored),
    concurrency: 1
  });
  service.start(execute);
  return service;
}

// ---------- snapshot at enqueue ----------

test('queued and running tasks keep the limits they were queued with; new tasks use new values', async () => {
  const db = database();
  const stored = { preferences: { researchDepth: 'quick', topicPageMode: 'limit', topicPageLimit: 5 } };
  const service = serviceFor(db, stored);
  await service.ready;

  const running = await service.enqueue({
    taskType: 'summary',
    siteUrl: SITE,
    topicId: '1',
    provider: 'openai',
    settings: { model: 'm' }
  });
  const queuedAgent = await service.enqueue({
    taskType: 'agent',
    siteUrl: SITE,
    question: 'Q?',
    provider: 'openai',
    settings: { model: 'm' }
  });
  assert.deepEqual(running.limits, { topicPageLimit: 5 });
  assert.deepEqual(queuedAgent.limits.research, { searchQueries: 1, searchPages: 1, topicsRead: 3, rawFallbacks: 2 });

  // The user saves new preferences while those tasks are queued/running.
  stored.preferences = { researchDepth: 'thorough', topicPageMode: 'limit', topicPageLimit: 50 };

  assert.deepEqual((await service.getTaskConfiguration(running)).limits, { topicPageLimit: 5 });
  assert.equal((await service.getTaskConfiguration(queuedAgent)).limits.research.topicsRead, 3);

  const later = await service.enqueue({
    taskType: 'summary',
    siteUrl: SITE,
    topicId: '2',
    provider: 'openai',
    settings: { model: 'm' }
  });
  assert.deepEqual((await service.getTaskConfiguration(later)).limits, { topicPageLimit: 50 });

  // Switching to every page: tasks queued before keep their limit.
  stored.preferences = { ...stored.preferences, topicPageMode: 'all' };
  const unlimited = await service.enqueue({
    taskType: 'summary',
    siteUrl: SITE,
    topicId: '3',
    provider: 'openai',
    settings: { model: 'm' }
  });
  assert.deepEqual(unlimited.limits, { topicPageLimit: null });
  assert.deepEqual((await service.getTaskConfiguration(unlimited)).limits, { topicPageLimit: null });
  assert.deepEqual((await service.getTaskConfiguration(later)).limits, { topicPageLimit: 50 });

  // The snapshot is persisted with the task and survives a worker restart.
  const restarted = serviceFor(db, stored);
  await restarted.ready;
  const restored = restarted.list().find(task => task.id === queuedAgent.id);
  assert.equal(restored.status, TASK_STATUS.QUEUED);
  assert.equal((await restarted.getTaskConfiguration(restored)).limits.research.searchQueries, 1);
  // "Every page" survives the restart too (null is not a missing snapshot).
  const restoredUnlimited = restarted.list().find(task => task.id === unlimited.id);
  stored.preferences = { ...stored.preferences, topicPageMode: 'limit', topicPageLimit: 4 };
  assert.deepEqual((await restarted.getTaskConfiguration(restoredUnlimited)).limits, { topicPageLimit: null });
});

// ---------- retention ----------

function chatSession(topicId, chatUpdatedAt, kept = false) {
  return {
    ...createTopicSession({ topicId, siteUrl: SITE, url: `${SITE}/t/x/${topicId}` }, 1),
    summary: 'summary',
    history: [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' }
    ],
    kept,
    updatedAt: chatUpdatedAt,
    chatUpdatedAt
  };
}

function finishedActivity(id, completedAt, extra = {}) {
  return normalizeAgentActivity(
    {
      activityId: id,
      taskId: id,
      agentRunId: id,
      question: 'Q',
      siteUrl: SITE,
      status: AGENT_ACTIVITY_STATUS.COMPLETED,
      completedAt,
      retainedFrom: completedAt,
      answer: 'A',
      ...extra
    },
    completedAt
  );
}

test('changing retention re-runs cleanup with the new value (chats, answers, tasks)', async () => {
  let now = 10 * DAY;
  const db = database({ now: () => now });
  await db.open();
  await db.save(chatSession('1', now - 2 * DAY), { prune: false });
  await db.save(chatSession('2', now - 5 * DAY, true), { prune: false });
  await db.saveAgentActivity(finishedActivity('old', now - 2 * DAY), { prune: false });
  await db.saveAgentActivity(finishedActivity('new', now - 1000), { prune: false });
  await db.saveAgentActivity(finishedActivity('kept', now - 9 * DAY, { kept: true }), { prune: false });
  const doneTask = {
    ...createTaskRecord({ id: 't', type: 'summary', topicId: '1', siteUrl: SITE }, 1),
    status: TASK_STATUS.COMPLETED,
    completedAt: now - 2 * DAY
  };
  await db.saveTask(doneTask, { prune: false });

  const stored = { preferences: { historyRetention: '3d' } };
  const service = serviceFor(db, stored);
  await service.ready;
  // 3 days: nothing is old enough yet.
  assert.equal((await db.get('forum.example.com/t/1')).history.length, 2);
  assert.ok(await db.getAgentActivity('old'));
  assert.ok(await db.getTask('t'));

  // Shortened to 1 day: applied at once.
  assert.equal(await service.applyRetention(resolveRetention({ historyRetention: '1d' })), true);
  assert.equal((await db.get('forum.example.com/t/1')).history.length, 0, 'unkept chat expired');
  assert.equal((await db.get('forum.example.com/t/2')).history.length, 2, 'kept chat never expires');
  assert.equal(await db.getAgentActivity('old'), null);
  assert.ok(await db.getAgentActivity('new'));
  assert.ok(await db.getAgentActivity('kept'));
  assert.equal(await db.getTask('t'), null);
  // Same value again: nothing to do.
  assert.equal(await service.applyRetention(resolveRetention({ historyRetention: '1d' })), false);

  // No time limit: nothing expires, however old.
  await service.applyRetention(resolveRetention({ historyRetention: 'forever' }));
  now += 365 * DAY;
  assert.equal(await db.cleanupAgentActivities(), 0);
  assert.equal(await db.cleanupStaleChats(), 0);
  assert.ok(await db.getAgentActivity('new'));
});

test('startup cleanup uses the saved retention, not the one-day default', async () => {
  const now = 10 * DAY;
  const db = database({ now: () => now });
  await db.open();
  await db.saveAgentActivity(finishedActivity('two-days', now - 2 * DAY), { prune: false });
  const service = serviceFor(db, { preferences: { historyRetention: '7d' } });
  await service.ready;
  assert.ok(await db.getAgentActivity('two-days'));
  assert.equal(db.agentActivityRetentionMs, 7 * DAY);
});

test('unkeeping starts a fresh retention period; saved expiresAt follows the setting', async () => {
  let now = 10 * DAY;
  const db = database({ now: () => now, agentActivityRetentionMs: 3 * DAY });
  await db.saveAgentActivity(finishedActivity('a', now - 5 * DAY, { kept: true }));
  const unkept = await db.setAgentActivityKept('a', false);
  assert.equal(unkept.retainedFrom, now);
  assert.equal(unkept.expiresAt, now + 3 * DAY);
  now += 2 * DAY;
  assert.equal(await db.cleanupAgentActivities(), 0);
  now += 2 * DAY;
  assert.equal(await db.cleanupAgentActivities(), 1);
});

test('the saved-topics limit prunes the oldest unkept topics', async () => {
  const db = database();
  db.setRetention(resolveRetention({ maxSavedTopics: 10 }));
  for (let index = 1; index <= 12; index++) {
    await db.save({ ...chatSession(String(index), index), kept: index === 1 });
  }
  const entries = await db.list();
  assert.equal(entries.length, 10);
  assert.ok(
    entries.some(entry => entry.topicId === '1'),
    'kept topic survives'
  );
  assert.ok(!entries.some(entry => entry.topicId === '2'));
});

test('side panel helpers follow the retention', () => {
  const week = resolveRetention({ historyRetention: '7d' });
  const now = 30 * DAY;
  const activities = [
    { activityId: 'a', status: 'completed', completedAt: now - 3 * DAY },
    { activityId: 'b', status: 'completed', completedAt: now - 9 * DAY }
  ];
  assert.deepEqual(
    selectSavedAgentActivities(activities, { now, windowMs: week.agentMs }).map(a => a.activityId),
    ['a']
  );
  assert.equal(selectSavedAgentActivities(activities, { now, windowMs: Infinity }).length, 2);
  // Unkept later: listed until retention after the unkeep, like cleanup.
  const unkept = [{ activityId: 'c', status: 'completed', completedAt: now - 9 * DAY, retainedFrom: now - DAY }];
  assert.equal(selectSavedAgentActivities(unkept, { now, windowMs: week.agentMs }).length, 1);
  assert.equal(agentRecentWindowMs(week), DAY);
  assert.equal(agentRecentWindowMs(resolveRetention({ historyRetention: 'forever' })), DAY);
  assert.match(retentionCopy(week).savedIntro, /expire after 7 days/);
  assert.match(retentionCopy(week).keepAnswer, /beyond 7 days/);
  assert.match(retentionCopy(resolveRetention({ historyRetention: 'forever' })).savedIntro, /until you delete them/);
});

// ---------- Agent research limits ----------

function toolClient(calls, { hitsPerPage = 2, more = true, withPosts = true } = {}) {
  let next = 100;
  return {
    siteUrl: SITE,
    async searchForum({ query, page }) {
      calls.push(['search', query, page]);
      return {
        more,
        hits: Array.from({ length: hitsPerPage }, () => {
          next++;
          return { topicId: String(next), postId: withPosts ? String(next * 10) : '', topicTitle: `T ${next}`, excerpt: 'x' };
        })
      };
    },
    async getTopic({ topicId }) {
      calls.push(['topic', topicId]);
      return { topicId, title: `T ${topicId}`, slug: 't' };
    },
    async getPosts({ topicId, postIds }) {
      calls.push(['posts', topicId]);
      return { posts: [{ postId: postIds[0], text: 'evidence' }] };
    },
    async getRawPage({ topicId }) {
      calls.push(['raw', topicId]);
      return { content: 'raw evidence' };
    }
  };
}

async function runWith(limits, options) {
  const calls = [];
  const progress = [];
  await runAgentTask({
    question: 'How do referral bonuses work for business cards?',
    toolClient: toolClient(calls, options),
    generateAnswer: async () => 'answer',
    onProgress: patch => progress.push(patch),
    limits
  });
  return { calls, progress };
}

test('the Agent honors the research limits it was given', async () => {
  const { calls, progress } = await runWith({ searchQueries: 2, searchPages: 3, topicsRead: 4, rawFallbacks: 2 });
  const searches = calls.filter(call => call[0] === 'search');
  assert.equal(searches.length, 6);
  assert.deepEqual(
    searches.map(call => call[2]),
    [1, 2, 3, 1, 2, 3]
  );
  assert.equal(calls.filter(call => call[0] === 'topic').length, 4);
  assert.equal(progress.at(-1).progress.totalSteps, 2 * 3 + 4 + 4);

  const quick = await runWith({ searchQueries: 1, searchPages: 1, topicsRead: 3 });
  assert.equal(quick.calls.filter(call => call[0] === 'search').length, 1);
  assert.equal(quick.calls.filter(call => call[0] === 'topic').length, 2, 'only as many as were found');
});

test('the Agent stops paging a search with no more results and caps raw fallbacks', async () => {
  const { calls } = await runWith(
    { searchQueries: 1, searchPages: 3, topicsRead: 6, rawFallbacks: 1 },
    { more: false, hitsPerPage: 6, withPosts: false }
  );
  assert.equal(calls.filter(call => call[0] === 'search').length, 1);
  assert.equal(calls.filter(call => call[0] === 'raw').length, 1);
});

test('research limits are clamped to the hard caps', () => {
  assert.deepEqual(effectiveResearchLimits({ searchQueries: 50, searchPages: 50, topicsRead: 50, rawFallbacks: 50 }), {
    searchQueries: 4,
    searchPages: 3,
    topicsRead: 12,
    rawFallbacks: 12
  });
  assert.deepEqual(effectiveResearchLimits(undefined), { searchQueries: 3, searchPages: 1, topicsRead: 6, rawFallbacks: 3 });
});

// ---------- topic page limit ----------

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

function topicFetcher(postsCount, requests, rawPageCount = 40) {
  return createTopicFetcher({
    wait: async () => {},
    fetchImpl: async url => {
      requests.push(url);
      if (url.endsWith('.json')) {
        return postsCount === null ? response(500, 'no') : response(200, JSON.stringify({ posts_count: postsCount }), 'application/json');
      }
      const page = Number(new URL(url).searchParams.get('page'));
      return response(200, page <= rawPageCount ? `page ${page}` : '');
    }
  });
}

test('a topic longer than the page limit is read from its first pages and says so', async () => {
  const requests = [];
  const progress = [];
  const result = await topicFetcher(1234, requests)(SITE, '7', update => progress.push(update), undefined, { maxPages: 5 });
  assert.equal(requests.filter(url => url.includes('/raw/')).length, 5);
  assert.equal(result.pagesFetched, 5);
  assert.equal(result.truncated, true);
  assert.equal(result.coveredPosts, 500);
  assert.equal(result.totalPosts, 1234);
  assert.equal(progress.at(-1).truncatedFromPosts, 1234);
  assert.equal(progress.at(-1).percent, 100);
  assert.equal(formatFetchTaskStatus(progress.at(-1)), 'Read 499 of 499 replies (page limit; the topic has 1233)');
});

test('replies past the page limit do not trigger a re-read', async () => {
  const requests = [];
  const cached = Array.from({ length: 5 }, (_, index) => ({ page: index + 1, content: `page ${index + 1}` }));
  const result = await topicFetcher(1500, requests)(SITE, '7', () => {}, undefined, {
    maxPages: 5,
    cachedPages: cached,
    knownTotalPosts: 1234
  });
  assert.equal(result.unchanged, true);
  assert.equal(result.newPosts, 0);
  assert.equal(requests.filter(url => url.includes('/raw/')).length, 0);
});

test('a topic within the limit is read in full', async () => {
  const requests = [];
  const result = await topicFetcher(250, requests)(SITE, '7', () => {}, undefined, { maxPages: 5 });
  assert.equal(result.truncated, false);
  assert.equal(result.coveredPosts, 250);
  assert.equal(result.pagesFetched, 3);
  assert.deepEqual(limitTopicPagination({ totalPosts: 250, totalPages: 3, pageSize: 100 }, 2), {
    totalPages: 2,
    truncated: true,
    coveredPosts: 200
  });
});

test('by default (every page) a long known-size topic is read in full', async () => {
  const requests = [];
  const progress = [];
  // 150 pages of 100 posts.
  const result = await topicFetcher(14950, requests, 150)(SITE, '7', update => progress.push(update), undefined, { maxPages: null });
  assert.equal(requests.filter(url => url.includes('/raw/')).length, 150);
  assert.equal(result.pagesFetched, 150);
  assert.equal(result.truncated, false);
  assert.equal(result.coveredPosts, 14950);
  assert.equal(result.totalPosts, 14950);
  assert.equal(progress.at(-1).truncatedFromPosts, undefined);
  assert.equal(formatFetchTaskStatus(progress.at(-1)), 'Read 14949 of 14949 replies');
  // Omitted (an older caller) also means every page.
  const omitted = await topicFetcher(14950, [], 150)(SITE, '7', () => {}, undefined, {});
  assert.equal(omitted.pagesFetched, 150);
  assert.equal(omitted.truncated, false);
  assert.deepEqual(limitTopicPagination({ totalPosts: 14950, totalPages: 150, pageSize: 100 }, null), {
    totalPages: 150,
    truncated: false,
    coveredPosts: 14950
  });
});

test('switching from a limit to every page reads the rest of a topic', async () => {
  const requests = [];
  const cached = Array.from({ length: 5 }, (_, index) => ({ page: index + 1, content: `page ${index + 1}` }));
  // Summarized earlier with a 5-page limit; the stored count is the full one.
  const result = await topicFetcher(1234, requests)(SITE, '7', () => {}, undefined, {
    maxPages: null,
    cachedPages: cached,
    knownTotalPosts: 1234
  });
  assert.equal(result.unchanged, false, 'not reported as already up to date');
  assert.equal(result.pagesFetched, 13);
  assert.equal(result.truncated, false);
  assert.equal(result.coveredPosts, 1234);
});

test('an unknown-size topic keeps the safety cap even when reading every page', async () => {
  const requests = [];
  const result = await topicFetcher(null, requests, MAX_UNKNOWN_TOPIC_PAGES + 50)(SITE, '7', () => {}, undefined, { maxPages: null });
  assert.equal(result.pagesFetched, MAX_UNKNOWN_TOPIC_PAGES);
  assert.equal(requests.filter(url => url.includes('/raw/')).length, MAX_UNKNOWN_TOPIC_PAGES);
  assert.equal(result.truncated, true, 'the cap is reported honestly');
  assert.equal(result.coveredPosts, null);
  const coverage = describeSummaryCoverage({ summaryTruncated: true, summaryPagesRead: result.pagesFetched });
  assert.equal(coverage.text, `first ${MAX_UNKNOWN_TOPIC_PAGES} pages of replies`);
  assert.doesNotMatch(coverage.note, /Settings/, 'no settings advice: the safety cap is not a setting');

  // A shorter unknown-size topic is read to its end and not truncated.
  const short = await topicFetcher(null, [], 7)(SITE, '7', () => {}, undefined, { maxPages: null });
  assert.equal(short.pagesFetched, 7);
  assert.equal(short.truncated, false);
});

test('an unknown-size topic stops at the page limit', async () => {
  const requests = [];
  const result = await topicFetcher(null, requests)(SITE, '7', () => {}, undefined, { maxPages: 3 });
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.truncated, true);
  assert.equal(result.coveredPosts, null);
});

test('the summary executor uses the task’s page limit and records the truncation', async () => {
  const db = database();
  const fetched = [];
  const { executeSummaryTask } = createTopicExecutors({
    aiService: { generateSummary: async () => 'A summary' },
    db,
    broadcast: () => {},
    getTaskConfiguration: async task => ({ provider: 'openai', settings: { model: 'm' }, limits: task.limits }),
    fetchTopicContent: async (_siteUrl, _topicId, _onProgress, _signal, options) => {
      fetched.push(options.maxPages);
      return {
        content: 'c',
        rawPages: [{ page: 1, content: 'c' }],
        pagesFetched: 2,
        totalPosts: 900,
        truncated: true,
        coveredPosts: 200,
        unchanged: false,
        newPosts: null
      };
    }
  });
  const task = createTaskRecord({ id: 's', type: 'summary', topicId: '7', siteUrl: SITE, limits: { topicPageLimit: 2 } });
  await executeSummaryTask(task, { signal: new AbortController().signal, report: async () => {} });
  assert.deepEqual(fetched, [2]);
  const session = await db.get(task.topicKey);
  assert.equal(session.summaryTruncated, true);
  assert.equal(session.summaryCoveredPosts, 200);
  assert.equal(session.summaryPostCount, 900);
  assert.equal(describeSummaryCoverage(session).text, 'first 199 of 899 replies');
  assert.match(describeSummaryCoverage(session).note, /Page limit reached/);
  const [entry] = await db.list();
  assert.equal(describeSummarizedReplies(entry), 'first 199 of 899 replies summarized');
  assert.equal(describeSummarizedReplies({ summaryPostCount: 11 }), '10 replies summarized');
});

test('the summary executor passes "every page" through and records no truncation', async () => {
  const db = database();
  const fetched = [];
  const { executeSummaryTask } = createTopicExecutors({
    aiService: { generateSummary: async () => 'A summary' },
    db,
    broadcast: () => {},
    getTaskConfiguration: async task => ({ provider: 'openai', settings: { model: 'm' }, limits: task.limits }),
    fetchTopicContent: async (_siteUrl, _topicId, _onProgress, _signal, options) => {
      fetched.push(options.maxPages);
      return {
        content: 'c',
        rawPages: [{ page: 1, content: 'c' }],
        pagesFetched: 10,
        totalPosts: 900,
        truncated: false,
        coveredPosts: 900,
        unchanged: false,
        newPosts: null
      };
    }
  });
  const task = createTaskRecord({ id: 's2', type: 'summary', topicId: '8', siteUrl: SITE, limits: { topicPageLimit: null } });
  assert.deepEqual(task.limits, { topicPageLimit: null });
  await executeSummaryTask(task, { signal: new AbortController().signal, report: async () => {} });
  assert.deepEqual(fetched, [null]);
  const session = await db.get(task.topicKey);
  assert.equal(session.summaryTruncated, false);
  assert.equal(session.summaryCoveredPosts, null);
  assert.deepEqual(describeSummaryCoverage(session), { truncated: false, text: '899 replies', note: '' });
});
