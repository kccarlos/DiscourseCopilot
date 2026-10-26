// The Agent's tools on a WordPress site: the shared tools (search_forum,
// list_latest, read_topic) answered from the REST API, search_comments, the
// site-specific prompt, and the guarantees that hold on every site (links
// built from the run's site, recoverable errors).
import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentToolError, executeAgentTool, isRecoverableToolError } from '../src/background/agent-tools.mjs';
import { ForumRequestGovernor, ForumToolError } from '../src/background/forum-tools.mjs';
import { WordPressToolClient } from '../src/background/wordpress-tools.mjs';
import { agentToolsFor, buildAgentSystemPrompt } from '../src/services/agent-prompt.mjs';

const SITE = 'https://www.doctorofcredit.com';
const POSTS = [
  {
    id: 101,
    title: 'Chase 10x &#038; Paze',
    link: `${SITE}/chase-10x/`,
    date_gmt: '2026-05-14T16:00:00',
    excerpt: '<p>Chase is offering 10x.</p>'
  },
  { id: 102, title: 'Amex Offers', link: `${SITE}/amex-offers/`, date_gmt: '2026-05-10T09:30:00', excerpt: '<p>New offers.</p>' }
];

function comment(id, post, text, extra = {}) {
  return {
    id,
    post,
    parent: 0,
    author_name: `user${id}`,
    date_gmt: '2026-05-14T17:05:00',
    content: { rendered: `<p>${text}</p>` },
    ...extra
  };
}

function fakeSite({ commentCount = 230 } = {}) {
  const requests = [];
  const json = (body, headers = {}, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const fetchImpl = async url => {
    const parsed = new URL(url);
    const q = parsed.searchParams;
    requests.push(`${parsed.pathname}?${q}`);
    const { pathname } = parsed;
    if (pathname === '/wp-json/wp/v2/categories') {
      return q.get('search') === 'nothing' ? json([]) : json([{ id: 7, name: 'Chase', slug: 'chase' }]);
    }
    if (pathname === '/wp-json/wp/v2/posts' && q.get('include')) {
      return json(
        POSTS.filter(post => q.get('include').split(',').includes(String(post.id))).map(({ id, title }) => ({
          id,
          title: { rendered: title }
        }))
      );
    }
    if (pathname === '/wp-json/wp/v2/posts') {
      return json(
        POSTS.map(post => ({ ...post, title: { rendered: post.title }, excerpt: { rendered: post.excerpt } })),
        {
          'X-WP-Total': '2',
          'X-WP-TotalPages': q.get('page') === '3' ? '3' : '5'
        }
      );
    }
    const one = /^\/wp-json\/wp\/v2\/posts\/(\d+)$/.exec(pathname);
    if (one) {
      return Number(one[1]) === 101
        ? json({
            id: 101,
            title: { rendered: 'Chase 10x &#038; Paze' },
            link: `${SITE}/chase-10x/`,
            date_gmt: '2026-05-14T16:00:00',
            modified_gmt: '2026-05-15T08:00:00',
            content: { rendered: '<p>Chase is offering 10x.</p>' }
          })
        : json({ code: 'rest_post_invalid_id' }, {}, 404);
    }
    if (pathname === '/wp-json/wp/v2/comments' && q.get('search')) {
      return json([comment(5001, 101, 'Got <b>approved</b> instantly &#8211; no DP'), comment(5002, 102, 'Approved after a week')], {
        'X-WP-Total': '41',
        'X-WP-TotalPages': '5'
      });
    }
    if (pathname === '/wp-json/wp/v2/comments') {
      const page = Number(q.get('page') || 1);
      const perPage = Number(q.get('per_page'));
      const pages = Math.max(1, Math.ceil(commentCount / 100));
      if (page > pages) return json({ code: 'rest_post_invalid_page_number' }, {}, 400);
      const from = (page - 1) * perPage;
      const items = Array.from({ length: Math.max(0, Math.min(perPage, commentCount - from)) }, (_, i) =>
        comment(9000 + from + i, 101, `Comment text ${from + i + 1}`)
      );
      return json(items, { 'X-WP-Total': String(commentCount), 'X-WP-TotalPages': String(pages) });
    }
    return json({}, {}, 404);
  };
  return { fetchImpl, requests };
}

function setup(options = {}) {
  const site = fakeSite(options);
  const toolClient = new WordPressToolClient({
    siteUrl: SITE,
    fetchImpl: site.fetchImpl,
    governor: new ForumRequestGovernor({ minIntervalMs: 0 })
  });
  const ctx = {
    siteUrl: SITE,
    siteType: 'wordpress',
    toolClient,
    budget: { maxTopicReads: 3, maxCharsPerRead: 6000 },
    sources: [],
    turnReads: new Set(),
    savedSummaries: { list: async () => [], get: async () => null }
  };
  return { site, ctx };
}

const run = (tool, args, ctx) => executeAgentTool({ tool, arguments: args }, ctx);

test('the WordPress tool set adds search_comments and keeps the shared tool names', () => {
  const names = agentToolsFor('wordpress').map(tool => tool.name);
  assert.deepEqual(names, ['search_forum', 'search_comments', 'list_latest', 'read_topic', 'saved_summaries', 'final_answer']);
  assert.ok(!agentToolsFor('discourse').some(tool => tool.name === 'search_comments'));
  assert.ok(
    agentToolsFor('wordpress').every(tool => tool.name === 'final_answer' || tool.name === 'saved_summaries' || tool.description.length > 0)
  );
  assert.match(agentToolsFor('wordpress').find(tool => tool.name === 'read_topic').description, /Example: \{"tool": "read_topic"/);
});

test('the WordPress system prompt talks about posts and comments, not Discourse', () => {
  const prompt = buildAgentSystemPrompt({
    forumName: 'Doctor Of Credit',
    siteUrl: SITE,
    siteType: 'wordpress',
    budget: { maxSteps: 8, maxTopicReads: 3, maxCharsPerRead: 6000 }
  });
  assert.match(prompt, /a WordPress site: articles \(posts\) with reader comments/);
  assert.match(prompt, /search_comments:/);
  assert.doesNotMatch(prompt, /Discourse/);
  const discourse = buildAgentSystemPrompt({
    forumName: 'F',
    siteUrl: SITE,
    budget: { maxSteps: 8, maxTopicReads: 3, maxCharsPerRead: 6000 }
  });
  assert.match(discourse, /Discourse forum/);
  assert.doesNotMatch(discourse, /search_comments/);
});

test('search_forum searches posts with date and category filters', async () => {
  const { site, ctx } = setup();
  const result = await run('search_forum', { query: 'paze', category: 'chase', after: '2026-01-01', before: '2026-06-30' }, ctx);
  assert.equal(result.resultCount, 2);
  assert.match(result.observation, /- id 101: Chase 10x & Paze/);
  assert.match(result.observation, /Chase is offering 10x\./);
  assert.match(result.observation, /more on page 2/);
  const search = site.requests.find(entry => entry.startsWith('/wp-json/wp/v2/posts?search='));
  assert.match(search, /categories=7/);
  assert.match(search, /after=2026-01-01T00%3A00%3A00/);
  assert.match(search, /before=2026-06-30T00%3A00%3A00/);
});

test('bad filters are recoverable errors the model sees', async () => {
  const { ctx } = setup();
  await assert.rejects(run('search_forum', { query: 'x', after: 'last year' }, ctx), error => {
    assert.ok(error instanceof ForumToolError);
    assert.equal(error.code, 'INVALID_ARGUMENT');
    assert.equal(isRecoverableToolError(error), true);
    return true;
  });
  await assert.rejects(run('search_forum', { query: 'x', category: 'nothing' }, ctx), /No category matches/);
});

test('search_comments lists comments with their posts and points to read_topic', async () => {
  const { site, ctx } = setup();
  const result = await run('search_comments', { query: 'approved', after: '2026-05-01' }, ctx);
  assert.equal(result.resultCount, 2);
  assert.match(result.observation, /2 comments of 41 matching, newest first; more on page 2/);
  assert.match(result.observation, /comment 5001 on post 101 "Chase 10x & Paze" · user5001/);
  assert.match(result.observation, /Got approved instantly – no DP/);
  assert.match(result.observation, /read_topic a post/);
  assert.equal(ctx.sources.length, 0, 'excerpts are not citable sources');
  assert.equal(site.requests.filter(entry => entry.includes('include=')).length, 1, 'post titles come in one request');
  ctx.sources.push({ topicId: '101', sourceId: 'S1' });
  assert.match((await run('search_comments', { query: 'approved' }, ctx)).observation, /\[post already read as S1\]/);
});

test('search_comments is unknown on Discourse', async () => {
  await assert.rejects(
    run('search_comments', { query: 'x' }, { ...setup().ctx, siteType: 'discourse' }),
    error => error instanceof AgentToolError && error.code === 'UNKNOWN_TOOL'
  );
});

test('list_latest lists the newest posts', async () => {
  const { ctx } = setup();
  const result = await run('list_latest', {}, ctx);
  assert.equal(result.resultCount, 2);
  assert.match(result.observation, /- id 102: Amex Offers/);
});

test('read_topic reads the article and the opening and newest comments of a long thread, and registers the post link', async () => {
  const { ctx } = setup({ commentCount: 230 });
  const result = await run('read_topic', { topic_id: '101' }, ctx);
  assert.match(result.observation, /^\[S1\] Topic 101: Chase 10x & Paze/);
  assert.match(result.observation, /231 posts/);
  assert.match(result.observation, /Article: Chase 10x & Paze/);
  assert.match(result.observation, /Comment 9000 · user9000/);
  assert.match(result.observation, /middle of the topic .* is omitted; pass page=2 to 2/);
  assert.match(result.observation, /Comment text 230/);
  assert.equal(ctx.sources[0].url, `${SITE}/chase-10x/`);
  assert.equal(ctx.sources[0].topicKey, 'www.doctorofcredit.com/t/101');
  assert.match(ctx.sources[0].excerpt, /Chase is offering 10x\./);

  const second = await run('read_topic', { topic_id: '101', page: '2' }, ctx);
  assert.match(second.observation, /Showing: page 2 of 3/);
  assert.match(second.observation, /Comment text 101/);
  assert.doesNotMatch(second.observation, /Article:/);
});

test('a post with few comments is read whole; a missing post is an error the model can recover from', async () => {
  const { ctx } = setup({ commentCount: 2 });
  const result = await run('read_topic', { topic_id: '101' }, ctx);
  assert.match(result.observation, /Showing: all posts/);
  assert.match(result.observation, /Comment text 2/);
  await assert.rejects(run('read_topic', { topic_id: '999' }, ctx), error => {
    assert.equal(error.code, 'NOT_FOUND');
    assert.equal(isRecoverableToolError(error), true);
    return true;
  });
});

test('closed comments read as a post without comments; comment search says it is unavailable', async () => {
  const { site, ctx } = setup({ commentCount: 5 });
  const original = site.fetchImpl;
  const blocked = new WordPressToolClient({
    siteUrl: SITE,
    governor: new ForumRequestGovernor({ minIntervalMs: 0 }),
    fetchImpl: async url =>
      new URL(url).pathname === '/wp-json/wp/v2/comments'
        ? new Response(JSON.stringify({ code: 'rest_forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
        : original(url)
  });
  const read = await run('read_topic', { topic_id: '101' }, { ...ctx, toolClient: blocked });
  assert.match(read.observation, /Article: Chase 10x/);
  assert.doesNotMatch(read.observation, /Comment \d+ ·/);
  await assert.rejects(run('search_comments', { query: 'x' }, { ...ctx, toolClient: blocked }), error => {
    assert.equal(error.code, 'COMMENTS_UNAVAILABLE');
    assert.equal(isRecoverableToolError(error), true);
    return true;
  });
});

test('comment hits survive a failed title lookup; a missing total header falls back to the first page', async () => {
  const { site, ctx } = setup({ commentCount: 3 });
  const original = site.fetchImpl;
  const client = new WordPressToolClient({
    siteUrl: SITE,
    governor: new ForumRequestGovernor({ minIntervalMs: 0 }),
    fetchImpl: async url => {
      const parsed = new URL(url);
      if (parsed.pathname === '/wp-json/wp/v2/posts' && parsed.searchParams.get('include')) return new Response('{}', { status: 500 });
      const response = await original(url);
      if (parsed.pathname === '/wp-json/wp/v2/comments' && !parsed.searchParams.get('search')) {
        // Same body, without the X-WP-* headers.
        return Object.defineProperty(
          new Response(await response.text(), { status: 200, headers: { 'Content-Type': 'application/json' } }),
          'url',
          { value: String(url) }
        );
      }
      return response;
    }
  });
  const hits = await run('search_comments', { query: 'approved' }, { ...ctx, toolClient: client });
  assert.match(hits.observation, /on post 101 "Post 101"/);
  assert.equal((await client.getTopic({ topicId: '101' })).postsCount, 4);
});

test("a source link outside the run's site is replaced by one built from the site", async () => {
  const { ctx } = setup({ commentCount: 1 });
  const original = ctx.toolClient.getTopic.bind(ctx.toolClient);
  ctx.toolClient.getTopic = async options => ({ ...(await original(options)), url: 'https://evil.example/phish' });
  await run('read_topic', { topic_id: '101' }, ctx);
  assert.equal(ctx.sources[0].url, `${SITE}/?p=101`);
});

test("the client only talks to the run's site", async () => {
  const { site, ctx } = setup({ commentCount: 1 });
  await run('read_topic', { topic_id: '101' }, ctx);
  await run('search_comments', { query: 'x' }, ctx);
  assert.ok(site.requests.length > 0);
  assert.throws(() => new WordPressToolClient({ siteUrl: '' }), /valid forum site URL/);
});

test('reading a topic after its saved summary turns the source into a page source with a link', async () => {
  const { ctx } = setup({ commentCount: 1 });
  ctx.sources.push({ sourceId: 'S1', topicId: '101', evidenceType: 'summary', url: '', excerpt: 'x' });
  await run('read_topic', { topic_id: '101' }, ctx);
  assert.equal(ctx.sources.length, 1);
  assert.equal(ctx.sources[0].evidenceType, 'topic');
  assert.equal(ctx.sources[0].url, `${SITE}/chase-10x/`);
});
