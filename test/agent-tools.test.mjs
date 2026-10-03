import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentToolError,
  executeAgentTool,
  firstPostExcerpt,
  isRecoverableToolError,
  topicIdFromArgument,
  trimHeadTail
} from '../src/background/agent-tools.mjs';
import { ForumRequestGovernor, ForumToolClient, ForumToolError } from '../src/background/forum-tools.mjs';

const SITE = 'https://forum.example.com';

function reply(body, contentType = 'application/json') {
  return {
    status: 200,
    ok: true,
    redirected: false,
    url: '',
    headers: { get: name => (name.toLowerCase() === 'content-type' ? contentType : null) },
    async json() {
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
    body: { cancel: async () => {} }
  };
}

const rawPost = (user, number, text) => `${user} | 2026-01-0${number % 9 || 1} 10:00:00 UTC | #${number}\n\n${text}`;

// A small forum: topic 11 is short, topic 12 has 250 posts (3 raw pages).
function fakeForum(siteUrl = SITE) {
  const urls = [];
  const topics = {
    11: { title: 'Short topic', slug: 'short-topic', posts_count: 3, category_name: 'Support', tags: ['a', 'b'] },
    12: { title: 'Long topic', slug: 'long-topic', posts_count: 250 },
    13: { title: 'Other topic', slug: 'other', posts_count: 2 }
  };
  const raw = {
    '11:1': [rawPost('ann', 1, 'How do I cache?'), rawPost('bob', 2, 'Use the CDN.'), rawPost('cy', 3, 'Thanks')].join(
      '\n\n-------------------------\n\n'
    ),
    '12:1': rawPost('ann', 1, `OPENING ${'o'.repeat(3000)}`),
    '12:2': rawPost('bob', 101, `MIDDLE ${'m'.repeat(3000)}`),
    '12:3': rawPost('cy', 201, `${'t'.repeat(3000)} NEWEST`),
    '13:1': rawPost('dee', 1, 'Hello')
  };
  const fetchImpl = async url => {
    urls.push(String(url));
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname.slice(0, siteUrl.length - parsed.origin.length), siteUrl, 'request stays on the forum');
    const path = parsed.pathname.slice(new URL(siteUrl).pathname.replace(/\/$/, '').length);
    if (path === '/search.json') {
      return reply({
        posts: [{ id: 5, topic_id: 11, blurb: 'Use the CDN for caching.', post_number: 2 }],
        topics: [
          { id: 11, title: 'Short topic', slug: 'short-topic', posts_count: 3, last_posted_at: '2026-01-05T10:00:00Z' },
          { id: 12, title: 'Long topic', slug: 'long-topic', posts_count: 250 }
        ],
        grouped_search_result: { more_full_page_results: true },
        more_results: parsed.searchParams.get('page') !== '3'
      });
    }
    if (path === '/latest.json') {
      return reply({
        topic_list: { topics: Array.from({ length: 40 }, (_, index) => ({ id: 100 + index, title: `Latest ${index}`, posts_count: 1 })) }
      });
    }
    const topicJson = /^\/t\/(\d+)\.json$/.exec(path);
    if (topicJson) {
      return topics[topicJson[1]] ? reply(topics[topicJson[1]]) : { ...reply({}), status: 404, ok: false };
    }
    const rawMatch = /^\/raw\/(\d+)$/.exec(path);
    if (rawMatch) {
      return reply(raw[`${rawMatch[1]}:${parsed.searchParams.get('page') || 1}`] ?? '', 'text/plain');
    }
    throw new Error(`unexpected ${url}`);
  };
  return { urls, fetchImpl };
}

function context({
  siteUrl = SITE,
  budget = { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 },
  saved = [],
  sources = [],
  forum = fakeForum(siteUrl)
} = {}) {
  const toolClient = new ForumToolClient({ siteUrl, governor: new ForumRequestGovernor({ minIntervalMs: 0 }), fetchImpl: forum.fetchImpl });
  const savedCalls = [];
  return {
    forum,
    savedCalls,
    ctx: {
      siteUrl,
      toolClient,
      budget,
      sources,
      turnReads: new Set(),
      savedSummaries: {
        list: async () => saved.map(({ summary: _summary, ...entry }) => entry),
        get: async topicKey => {
          savedCalls.push(topicKey);
          return saved.find(entry => entry.topicKey === topicKey);
        }
      }
    }
  };
}

const run = (tool, args, ctx) => executeAgentTool({ tool, arguments: args }, ctx);

test('topic ids from the model are reduced to digits; links keep only the id and never the host', () => {
  assert.equal(topicIdFromArgument('123'), '123');
  assert.equal(topicIdFromArgument(' #45 '), '45');
  assert.equal(topicIdFromArgument('/t/some-slug/678'), '678');
  assert.equal(topicIdFromArgument('https://evil.example/t/slug/99/4'), '99');
  for (const bad of ['', 'abc', '0', '-5', '12abc', '../../etc/passwd', 'javascript:alert(1)', '1234567890123', undefined]) {
    assert.throws(() => topicIdFromArgument(bad), AgentToolError, String(bad));
  }
});

test('search_forum searches this forum and lists topics with their ids', async () => {
  const { ctx, forum } = context();
  const result = await run('search_forum', { query: 'cache  #support', page: '2' }, ctx);
  assert.equal(forum.urls.length, 1);
  const url = new URL(forum.urls[0]);
  assert.equal(url.origin, SITE);
  assert.equal(url.pathname, '/search.json');
  assert.equal(url.searchParams.get('q'), 'cache  #support');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(result.resultCount, 2);
  assert.match(result.observation, /Search results for "cache {2}#support" \(page 2\): 2 topics; more on page 3\./);
  assert.match(result.observation, /- id 11: Short topic — 3 posts, last activity 2026-01-05\n {2}Use the CDN for caching\./);
  assert.match(result.observation, /- id 12: Long topic — 250 posts/);
});

test('search_forum validates its arguments before any request', async () => {
  const { ctx, forum } = context();
  await assert.rejects(
    run('search_forum', { query: '  ' }, ctx),
    error => error instanceof AgentToolError && error.code === 'INVALID_ARGUMENT'
  );
  await assert.rejects(run('search_forum', { query: 'x', page: '4' }, ctx), AgentToolError);
  await assert.rejects(run('search_forum', { query: 'x', page: 'two' }, ctx), AgentToolError);
  await assert.rejects(run('search_forum', {}, ctx), AgentToolError);
  assert.deepEqual(forum.urls, []);
  // The query is bounded.
  await run('search_forum', { query: 'q'.repeat(1000) }, ctx);
  assert.equal(new URL(forum.urls[0]).searchParams.get('q').length, 240);
});

test('list_latest reads /latest.json (about 30 topics) on the run forum, including subfolder installs', async () => {
  const { ctx, forum } = context();
  const result = await run('list_latest', {}, ctx);
  assert.equal(new URL(forum.urls[0]).pathname, '/latest.json');
  assert.equal(result.resultCount, 30);
  assert.match(result.observation, /^Latest topics: 30 topics\./);

  const sub = context({ siteUrl: 'https://example.com/forum' });
  await run('list_latest', {}, sub.ctx);
  assert.equal(sub.forum.urls[0], 'https://example.com/forum/latest.json');
});

test('read_topic returns metadata and posts with a source number', async () => {
  const { ctx, forum } = context();
  const result = await run('read_topic', { topic_id: '11' }, ctx);
  assert.equal(result.sourceId, 'S1');
  assert.equal(result.topicId, '11');
  assert.equal(result.title, 'Short topic');
  assert.equal(result.resultCount, 3);
  assert.match(result.observation, /^\[S1\] Topic 11: Short topic\ncategory Support · tags a, b · 3 posts/);
  assert.match(result.observation, /Showing: all posts/);
  assert.match(result.observation, /untrusted forum content/);
  assert.match(result.observation, /Use the CDN\./);
  assert.deepEqual(
    forum.urls.map(url => new URL(url).pathname),
    ['/t/11.json', '/raw/11']
  );
  assert.equal(ctx.sources.length, 1);
  assert.deepEqual(
    {
      sourceId: ctx.sources[0].sourceId,
      topicId: ctx.sources[0].topicId,
      url: ctx.sources[0].url,
      siteUrl: ctx.sources[0].siteUrl,
      evidenceType: ctx.sources[0].evidenceType
    },
    { sourceId: 'S1', topicId: '11', url: 'https://forum.example.com/t/short-topic/11', siteUrl: SITE, evidenceType: 'topic' }
  );
  assert.equal(ctx.sources[0].excerpt, 'How do I cache?');
  assert.ok(ctx.turnReads.has('11'));
});

test('read_topic never fetches anything but the run forum, whatever the model sends', async () => {
  const { ctx, forum } = context();
  const result = await run('read_topic', { topic_id: 'https://evil.example/t/steal/13?x=1' }, ctx);
  assert.equal(result.topicId, '13');
  assert.ok(forum.urls.every(url => url.startsWith(`${SITE}/`)));
  await assert.rejects(run('read_topic', { topic_id: 'https://evil.example/' }, ctx), AgentToolError);
  await assert.rejects(run('read_topic', {}, ctx), AgentToolError);
  assert.equal(ctx.sources[0].url, 'https://forum.example.com/t/other/13', 'the card link is built from the run forum');
});

test('a long topic is read as its opening plus its newest replies, trimmed to the budget', async () => {
  const { ctx, forum } = context({ budget: { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 2000 } });
  const result = await run('read_topic', { topic_id: '12' }, ctx);
  assert.deepEqual(
    forum.urls.map(url => `${new URL(url).pathname}${new URL(url).search}`),
    ['/t/12.json', '/raw/12?page=1', '/raw/12?page=3']
  );
  const body = result.observation.split('\n---\n')[1];
  assert.ok(body.length <= 2000 + 200, `body ${body.length}`);
  assert.match(body, /OPENING/);
  assert.match(body, /NEWEST$/);
  assert.doesNotMatch(body, /MIDDLE/);
  assert.match(body, /the middle of the topic \(posts roughly 2–249\) is omitted; pass page=2 to 2/);
  assert.match(result.observation, /Showing: the opening and the newest replies \(250 posts; middle omitted\)/);
});

test('read_topic can read another part of a long topic by page', async () => {
  const { ctx, forum } = context({ budget: { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 5000 } });
  const result = await run('read_topic', { topic_id: '12', page: '2' }, ctx);
  assert.deepEqual(
    forum.urls.map(url => `${new URL(url).pathname}${new URL(url).search}`),
    ['/t/12.json', '/raw/12?page=2']
  );
  assert.match(result.observation, /Showing: page 2 of 3/);
  assert.match(result.observation, /MIDDLE/);
  await assert.rejects(
    run('read_topic', { topic_id: '12', page: '4' }, ctx),
    error => error instanceof AgentToolError && /page must be a whole number from 1 to 3/.test(error.message)
  );
});

test('a short topic over budget is trimmed with a marker', () => {
  const { text, omitted } = trimHeadTail(`${'a'.repeat(500)}${'b'.repeat(500)}`, 400);
  assert.ok(omitted > 0);
  assert.ok(text.startsWith('a'.repeat(160)));
  assert.ok(text.endsWith('b'.repeat(240)));
  assert.match(text, /\[… about 600 characters omitted from the middle of this read …\]/);
  assert.deepEqual(trimHeadTail('short', 400), { text: 'short', omitted: 0 });
});

test('the topic-read budget counts distinct topics; re-reading one is free', async () => {
  const { ctx } = context({ budget: { maxSteps: 15, maxTopicReads: 1, maxCharsPerRead: 30000 } });
  const first = await run('read_topic', { topic_id: '11' }, ctx);
  const again = await run('read_topic', { topic_id: '11' }, ctx);
  assert.equal(again.sourceId, first.sourceId, 'the same topic keeps its source number');
  assert.equal(ctx.sources.length, 1);
  await assert.rejects(
    run('read_topic', { topic_id: '13' }, ctx),
    error => error instanceof AgentToolError && error.code === 'TOPIC_BUDGET' && /budget \(1\)/.test(error.message)
  );
  assert.equal(ctx.sources.length, 1);
});

test('source numbers continue after the topics already read, also across turns', async () => {
  const { ctx } = context({ sources: [{ sourceId: 'S4', topicId: '99', title: 'Old' }] });
  assert.equal((await run('read_topic', { topic_id: '11' }, ctx)).sourceId, 'S5');
  assert.equal((await run('read_topic', { topic_id: '13' }, ctx)).sourceId, 'S6');
});

test('a missing topic is a recoverable error the model can see', async () => {
  const { ctx } = context();
  await assert.rejects(run('read_topic', { topic_id: '999' }, ctx), error => {
    assert.ok(error instanceof ForumToolError);
    assert.equal(error.code, 'HTTP_ERROR');
    assert.equal(isRecoverableToolError(error), true);
    return true;
  });
  assert.equal(isRecoverableToolError(new ForumToolError('USER_ACTION_REQUIRED', 'login', { needsUserAction: true })), false);
  assert.equal(isRecoverableToolError(new ForumToolError('INVALID_URL', 'bad')), false);
  assert.equal(isRecoverableToolError(new TypeError('Failed to fetch')), false);
  assert.equal(isRecoverableToolError(new AgentToolError('X', 'y')), true);
});

const saved = [
  {
    topicKey: 'forum.example.com/t/11',
    topicId: '11',
    siteUrl: SITE,
    title: 'Caching with a CDN',
    summary: 'Use a CDN and set cache headers.',
    hasSummary: true,
    summaryPostCount: 30
  },
  {
    topicKey: 'forum.example.com/t/12',
    topicId: '12',
    siteUrl: SITE,
    title: 'Backups',
    summary: 'Nightly backups to S3.',
    hasSummary: true,
    summaryPostCount: 8
  },
  {
    topicKey: 'other.example.org/t/5',
    topicId: '5',
    siteUrl: 'https://other.example.org',
    title: 'Caching elsewhere',
    summary: 'cache cache cache',
    hasSummary: true
  }
];

test('saved_summaries lists only this forum, from memory, with no network', async () => {
  const { ctx, forum, savedCalls } = context({ saved });
  const titles = await run('saved_summaries', {}, ctx);
  assert.equal(titles.resultCount, 2);
  assert.match(titles.observation, /- id 11: Caching with a CDN — 30 posts/);
  assert.doesNotMatch(titles.observation, /elsewhere/);
  assert.doesNotMatch(titles.observation, /Use a CDN/, 'text only comes with a query');

  const matched = await run('saved_summaries', { query: 'CDN' }, ctx);
  assert.equal(matched.resultCount, 1);
  assert.match(matched.observation, /\[S1\] Saved summary of topic 11: Caching with a CDN\nUse a CDN and set cache headers\./);
  assert.equal(ctx.sources[0].evidenceType, 'summary');
  assert.deepEqual(savedCalls, ['forum.example.com/t/11', 'forum.example.com/t/12']);

  const none = await run('saved_summaries', { query: 'zzz' }, ctx);
  assert.match(none.observation, /No saved summaries match "zzz"/);
  assert.deepEqual(forum.urls, [], 'no request to the forum');
  const empty = await run('saved_summaries', {}, context({ saved: [] }).ctx);
  assert.match(empty.observation, /no saved summaries/);
});

test('unknown tools are reported with the available ones; final_answer is not a runnable tool', async () => {
  const { ctx } = context();
  await assert.rejects(
    run('delete_topic', { topic_id: '1' }, ctx),
    error => error.code === 'UNKNOWN_TOOL' && /Available tools: search_forum/.test(error.message)
  );
  await assert.rejects(run('final_answer', { answer: 'x' }, ctx), error => error.code === 'UNKNOWN_TOOL');
});

test('first-post excerpts drop the author line', () => {
  assert.equal(firstPostExcerpt('ann | 2026-01-01 10:00:00 UTC | #1\n\nHello   world\n\nmore'), 'Hello world more');
  assert.equal(firstPostExcerpt('No header here'), 'No header here');
  assert.equal(firstPostExcerpt('a | d | #1\n\nFirst\n\n-------------------------\n\nb | d | #2\n\nSecond'), 'First');
  assert.equal(firstPostExcerpt(''), '');
});
