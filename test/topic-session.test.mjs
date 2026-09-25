import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_RETENTION_MS,
  buildTopicIndexEntry,
  createTopicSession,
  expireChatHistory,
  getRefreshPlan,
  normalizeRawPages,
  normalizeSavedHistory,
  planTopicPageRequests
} from '../src/shared/topic-session.mjs';

test('creates a normalized topic-linked session and canonical URL', () => {
  const session = createTopicSession(
    {
      topicId: '123',
      url: 'https://www.uscardforum.com/t/example/123?tracking=1#reply',
      title: ' Example topic '
    },
    1000
  );

  assert.equal(session.topicId, '123');
  assert.equal(session.url, 'https://www.uscardforum.com/t/example/123');
  assert.equal(session.title, 'Example topic');
  assert.equal(session.kept, false);
  assert.equal(session.createdAt, 1000);
  assert.equal(session.siteUrl, 'https://www.uscardforum.com');
  assert.equal(session.topicKey, 'www.uscardforum.com/t/123');
});

test('uses the forum site for fallback URLs and neutral fallback titles', () => {
  const session = createTopicSession(
    {
      topicId: '42',
      siteUrl: 'https://example.com/forum',
      url: 'not a url'
    },
    1000
  );

  assert.equal(session.url, 'https://example.com/forum/t/42');
  assert.equal(session.title, 'Topic 42');
  assert.equal(session.topicKey, 'example.com/forum/t/42');
  assert.equal(buildTopicIndexEntry(session).topicKey, 'example.com/forum/t/42');
  assert.equal(buildTopicIndexEntry(session).siteUrl, 'https://example.com/forum');
  assert.equal(createTopicSession({ topicId: '42', url: '' }).url, '');
});

test('normalizes cached pages by number and keeps the latest duplicate', () => {
  assert.deepEqual(
    normalizeRawPages([
      { page: 2, content: 'old' },
      { page: 1, content: 'first' },
      { page: 2, content: 'latest' },
      { page: 0, content: 'invalid' }
    ]),
    [
      { page: 1, content: 'first' },
      { page: 2, content: 'latest' }
    ]
  );
});

test('keeps saved chat history larger than the bounded provider context', () => {
  const history = Array.from({ length: 120 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `message-${index}`
  }));

  const saved = normalizeSavedHistory(history);
  assert.equal(saved.length, 100);
  assert.equal(saved[0].content, 'message-20');
  assert.equal(saved.at(-1).content, 'message-119');
});

test('expires chat after one day while retaining summary and source', () => {
  const now = CHAT_RETENTION_MS + 5000;
  const { session, expired } = expireChatHistory(
    {
      ...createTopicSession(
        {
          topicId: '123',
          url: 'https://www.uscardforum.com/t/example/123',
          title: 'Topic'
        },
        1
      ),
      source: 'full post',
      summary: 'saved summary',
      history: [{ role: 'user', content: 'question' }],
      chatUpdatedAt: 1
    },
    now
  );

  assert.equal(expired, true);
  assert.deepEqual(session.history, []);
  assert.equal(session.source, 'full post');
  assert.equal(session.summary, 'saved summary');
});

test('kept sessions preserve chat history beyond one day', () => {
  const now = CHAT_RETENTION_MS + 5000;
  const { session, expired } = expireChatHistory(
    {
      ...createTopicSession(
        {
          topicId: '123',
          url: 'https://www.uscardforum.com/t/example/123',
          title: 'Topic'
        },
        1
      ),
      summary: 'saved summary',
      history: [{ role: 'user', content: 'question' }],
      chatUpdatedAt: 1,
      kept: true
    },
    now
  );

  assert.equal(expired, false);
  assert.equal(session.kept, true);
  assert.equal(session.history.length, 1);
});

test('builds a lightweight history index without copying full source', () => {
  const entry = buildTopicIndexEntry({
    ...createTopicSession(
      {
        topicId: '123',
        url: 'https://www.uscardforum.com/t/example/123',
        title: 'Topic'
      },
      1
    ),
    source: 'x'.repeat(50000),
    summary: '# A useful **summary**',
    history: [{ role: 'user', content: 'question' }]
  });

  assert.equal(entry.topicId, '123');
  assert.equal(entry.hasSummary, true);
  assert.equal(entry.kept, false);
  assert.equal(entry.summaryExcerpt, 'A useful summary');
  assert.equal('source' in entry, false);
  assert.equal(entry.historyCount, 1);
});

test('indexes cache-only sessions for pruning without showing them as summaries', () => {
  const entry = buildTopicIndexEntry(
    createTopicSession(
      {
        topicId: '123',
        url: 'https://www.uscardforum.com/t/example/123',
        title: 'Topic'
      },
      1
    )
  );

  assert.equal(entry.hasSummary, false);
  assert.equal(entry.summaryExcerpt, '');
});

test('plans no network work for an unchanged complete cache', () => {
  assert.deepEqual(
    getRefreshPlan({
      cachedPages: [
        { page: 1, content: 'one' },
        { page: 2, content: 'two' }
      ],
      knownTotalPosts: 150,
      currentTotalPosts: 150
    }),
    {
      unchanged: true,
      reusablePages: [
        { page: 1, content: 'one' },
        { page: 2, content: 'two' }
      ],
      firstPageToFetch: null
    }
  );
});

test('reuses only immutable full pages when replies were added', () => {
  const plan = getRefreshPlan({
    cachedPages: [
      { page: 1, content: 'one' },
      { page: 2, content: 'old boundary' }
    ],
    knownTotalPosts: 150,
    currentTotalPosts: 205
  });

  assert.equal(plan.unchanged, false);
  assert.equal(plan.firstPageToFetch, 2);
  assert.deepEqual(plan.reusablePages, [{ page: 1, content: 'one' }]);
});

test('refreshes from page one if posts were deleted or cache metadata is missing', () => {
  assert.equal(
    getRefreshPlan({
      cachedPages: [{ page: 1, content: 'one' }],
      knownTotalPosts: 100,
      currentTotalPosts: 90
    }).firstPageToFetch,
    1
  );

  assert.equal(
    getRefreshPlan({
      cachedPages: [],
      knownTotalPosts: 100,
      currentTotalPosts: 101
    }).firstPageToFetch,
    1
  );
});

test('plans only boundary and new raw pages for incremental refresh', () => {
  assert.deepEqual(
    planTopicPageRequests({
      cachedPages: [
        { page: 1, content: 'one' },
        { page: 2, content: 'old boundary' }
      ],
      knownTotalPosts: 150,
      currentTotalPosts: 205,
      totalPages: 3
    }),
    {
      unchanged: false,
      reusablePages: [{ page: 1, content: 'one' }],
      pagesToFetch: [2, 3]
    }
  );
});

test('refetches all pages when an unchanged cache is incomplete', () => {
  assert.deepEqual(
    planTopicPageRequests({
      cachedPages: [{ page: 1, content: 'one' }],
      knownTotalPosts: 150,
      currentTotalPosts: 150,
      totalPages: 2
    }),
    {
      unchanged: false,
      reusablePages: [],
      pagesToFetch: [1, 2]
    }
  );
});

test('persists an optional forum name on sessions and index entries', () => {
  const session = createTopicSession(
    {
      topicId: '301122',
      siteUrl: 'https://meta.discourse.org',
      url: 'https://meta.discourse.org/t/chat/301122',
      title: 'Chat',
      forumName: ' Discourse Meta '
    },
    1000
  );
  assert.equal(session.forumName, 'Discourse Meta');

  const entry = buildTopicIndexEntry({ ...session, summary: 'Summary' });
  assert.equal(entry.forumName, 'Discourse Meta');

  // Sessions saved before forum names existed stay valid.
  const { forumName: _omitted, ...legacy } = session;
  assert.equal(buildTopicIndexEntry(legacy).forumName, '');
});
