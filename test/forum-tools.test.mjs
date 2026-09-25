import assert from 'node:assert/strict';
import test from 'node:test';

import { ForumRequestGovernor, ForumToolClient, ForumToolError, buildTopicUrl, isAllowedForumUrl } from '../src/background/forum-tools.mjs';

const SITE = 'https://community.openai.com';

function response({ status = 200, body = {}, contentType = 'application/json', redirected = false, url = '' } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected,
    url,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? contentType : null;
      }
    },
    async json() {
      if (typeof body === 'string') {
        throw new Error('not json');
      }
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
    body: { cancel: async () => {} }
  };
}

function client(fetchImpl, siteUrl = SITE) {
  return new ForumToolClient({
    siteUrl,
    governor: new ForumRequestGovernor({ minIntervalMs: 0 }),
    fetchImpl
  });
}

test('builds validated forum topic links and rejects external URLs', () => {
  assert.equal(
    buildTopicUrl({ siteUrl: SITE, topicId: '123', slug: 'Referral bonuses', postId: '456' }),
    'https://community.openai.com/t/Referral-bonuses/123#post_456'
  );
  assert.equal(buildTopicUrl({ siteUrl: 'https://example.com/forum', topicId: '123' }), 'https://example.com/forum/t/123');
  assert.throws(
    () => buildTopicUrl({ siteUrl: SITE, topicId: 'not-a-number' }),
    error => error instanceof ForumToolError && error.code === 'INVALID_ARGUMENT'
  );
  assert.throws(
    () => buildTopicUrl({ topicId: '123' }),
    error => error instanceof ForumToolError && error.code === 'INVALID_ARGUMENT'
  );
});

test('allows only URLs on the exact forum origin and base path', () => {
  assert.equal(isAllowedForumUrl('https://community.openai.com/t/123', SITE), true);
  assert.equal(isAllowedForumUrl('https://evil.com/t/123', SITE), false);
  assert.equal(isAllowedForumUrl('https://community.openai.com.evil.com/t/123', SITE), false);
  assert.equal(isAllowedForumUrl('https://evilcommunity.openai.com/t/123', SITE), false);
  assert.equal(isAllowedForumUrl('http://community.openai.com/t/123', SITE), false);
  assert.equal(isAllowedForumUrl('https://www.example.com/t/1', 'https://example.com'), false);
  assert.equal(isAllowedForumUrl('https://example.com/t/1', 'https://www.example.com'), false);

  const subfolder = 'https://example.com/forum';
  assert.equal(isAllowedForumUrl('https://example.com/forum/t/1', subfolder), true);
  assert.equal(isAllowedForumUrl('https://example.com/t/1', subfolder), false);
  assert.equal(isAllowedForumUrl('https://example.com/forumx/t/1', subfolder), false);

  assert.equal(isAllowedForumUrl('https://community.openai.com/t/123'), false);
  assert.equal(isAllowedForumUrl('https://community.openai.com/t/123', ''), false);
});

test('requires a valid forum site URL to construct a tool client', () => {
  for (const siteUrl of [undefined, '', 'not a url', 'http://example.com', 'https://example.com/forum?x=1']) {
    assert.throws(
      () => new ForumToolClient({ siteUrl }),
      error => error instanceof ForumToolError && error.code === 'INVALID_ARGUMENT',
      String(siteUrl)
    );
  }
  assert.equal(new ForumToolClient({ siteUrl: 'https://example.com/forum/' }).siteUrl, 'https://example.com/forum');
});

test('keeps the subfolder base path on every tool request URL', async () => {
  const urls = [];
  const forum = client(async url => {
    urls.push(url);
    return url.includes('/raw/')
      ? response({ body: 'alice | 2024 | #1\n\nHello', contentType: 'text/plain' })
      : response({ body: { posts: [], topics: [] } });
  }, 'https://example.com/forum');

  await forum.searchForum({ query: 'hello' });
  await forum.getTopic({ topicId: '12' });
  await forum.getPosts({ topicId: '12', postIds: ['34'] });
  await forum.getRawPage({ topicId: '12', page: 2 });

  assert.deepEqual(
    urls.map(url => {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    }),
    [
      'https://example.com/forum/search.json',
      'https://example.com/forum/t/12.json',
      'https://example.com/forum/t/12/posts.json',
      'https://example.com/forum/raw/12'
    ]
  );
  assert.equal(new URL(urls[2]).searchParams.get('post_ids[]'), '34');
  assert.equal(new URL(urls[3]).searchParams.get('page'), '2');
});

test('treats a raw page redirected to the login page as a login requirement', async () => {
  const forum = client(async () =>
    response({
      body: '<!DOCTYPE html><html><body>Log in</body></html>',
      contentType: 'text/html',
      redirected: true,
      url: `${SITE}/login`
    })
  );

  await assert.rejects(
    () => forum.getRawPage({ topicId: '12' }),
    error =>
      error instanceof ForumToolError
      && error.code === 'USER_ACTION_REQUIRED'
      && error.needsUserAction === true
      && /log in to community\.openai\.com/i.test(error.message)
  );
});

test('reports a not_logged_in JSON 403 as a login requirement', async () => {
  const forum = client(async () =>
    response({
      status: 403,
      body: { error_type: 'not_logged_in', errors: ['You need to be logged in'] }
    })
  );

  await assert.rejects(
    () => forum.searchForum({ query: 'hello' }),
    error => error instanceof ForumToolError && error.needsUserAction === true && /logged in/.test(error.message)
  );
});

test('requires explicit post IDs instead of allowing an unbounded post fetch', async () => {
  const forum = client(async () => response({ body: {} }));

  await assert.rejects(
    () => forum.getPosts({ topicId: '123', postIds: [] }),
    error => error instanceof ForumToolError && error.code === 'INVALID_ARGUMENT'
  );
});

test('searches and normalizes forum results with bounded request access', async () => {
  const requests = [];
  const forum = client(async (url, options) => {
    requests.push({ url, options });
    return response({
      body: {
        more_results: true,
        posts: [
          {
            id: 456,
            topic_id: 123,
            post_number: 4,
            topic_slug: 'referral-bonuses',
            topic_title: 'Referral bonuses',
            raw: 'A useful data point'
          }
        ]
      }
    });
  });

  const result = await forum.searchForum({ query: 'referral bonus', page: 1 });
  const requestUrl = new URL(requests[0].url);

  assert.equal(requestUrl.origin, 'https://community.openai.com');
  assert.equal(requestUrl.pathname, '/search.json');
  assert.equal(requestUrl.searchParams.get('q'), 'referral bonus');
  assert.equal(requestUrl.searchParams.get('page'), '1');
  assert.equal(requests[0].options.credentials, 'include');
  assert.equal(result.more, true);
  assert.deepEqual(result.hits[0], {
    postId: '456',
    topicId: '123',
    postNumber: 4,
    topicSlug: 'referral-bonuses',
    topicTitle: 'Referral bonuses',
    username: '',
    createdAt: '',
    excerpt: 'A useful data point',
    text: 'A useful data point'
  });
});

test('surfaces Cloudflare or authentication responses as user-action requirements', async () => {
  const forum = client(async () =>
    response({
      status: 403,
      body: 'Just a moment... cloudflare verification'
    })
  );

  await assert.rejects(
    () => forum.getTopic({ topicId: '123' }),
    error => error instanceof ForumToolError && error.code === 'USER_ACTION_REQUIRED' && error.needsUserAction === true
  );
});

test('recognizes a successful HTML challenge page returned where JSON was expected', async () => {
  const forum = client(async () =>
    response({
      status: 200,
      contentType: 'text/html',
      body: '<html><title>Just a moment...</title><body>Cloudflare</body></html>'
    })
  );

  await assert.rejects(
    () => forum.getTopic({ topicId: '123' }),
    error => error instanceof ForumToolError && error.code === 'USER_ACTION_REQUIRED' && error.needsUserAction === true
  );
});
