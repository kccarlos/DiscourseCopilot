// Reading a Hacker News item and its nested comment tree from HTML, cache
// reuse, multi-page morelink pagination, and the Hacker News Agent tools
// (Algolia story/comment search, /newest listing, read_topic).
import assert from 'node:assert/strict';
import test from 'node:test';

import { executeAgentTool, firstPostExcerpt, topicIdFromArgument } from '../src/background/agent-tools.mjs';
import { ForumRequestGovernor } from '../src/background/forum-tools.mjs';
import {
  BLOCKS_PER_PAGE,
  HACKERNEWS_FETCH_CONFIG,
  HackerNewsToolClient,
  createHackerNewsFetcher,
  parseItemPage,
  parseStoryList
} from '../src/background/sites/hackernews.mjs';
import { createDefaultSiteRegistry } from '../src/background/sites/index.mjs';
import { agentToolsFor, buildAgentSystemPrompt } from '../src/services/agent-prompt.mjs';
import { parseForumContent } from '../src/services/ai-errors.mjs';
import { HACKERNEWS_SITE_URL } from '../src/shared/hackernews-page.mjs';

const ITEM_ID = '41234567';

function renderCommentRow({ id, indent = 0, author = `user_${id}`, age = '2026-10-14T18:00:00 1792000800', body = `Body of ${id}` }) {
  return `<tr class="athing comtr" id="${id}"><td><table border="0"><tr><td class="ind" indent="${indent}"><img src="s.gif" height="1" width="${indent * 40}"></td><td valign="top" class="votelinks"><center><a id="up_${id}" href="vote?id=${id}&amp;how=up"><div class="votearrow" title="upvote"></div></a></center></td><td class="default"><div style="margin-top:2px; margin-bottom:-10px;"><span class="comhead"><a href="user?id=${author}" class="hnuser">${author}</a> <span class="age" title="${age}"><a href="item?id=${id}">1 hour ago</a></span></span></div><br><div class="comment"><div class="commtext c00">${body}<div class="reply"><p><font size="1"><u><a href="reply?id=${id}&amp;goto=item%3Fid%3D${ITEM_ID}%23${id}" rel="nofollow">reply</a></u></font></p></div></div></div></td></tr></table></td></tr>`;
}

function renderItemHtml({
  id = ITEM_ID,
  title = 'Show HN: Fast SQLite Queue',
  href = 'https://example.com/sqlite-queue',
  score = 142,
  author = 'alice',
  age = '2026-10-14T17:46:05 1792000000',
  commentCount = 4,
  toptext = 'We built a zero-dependency queue on SQLite WAL.',
  comments = [],
  morePage = null
} = {}) {
  const countText = commentCount === 0 ? 'discuss' : `${commentCount}&nbsp;comments`;
  const moreHtml = morePage
    ? `<tr class="morespace" style="height:10px"></tr><tr><td colspan="2"></td><td class="title"><a href="item?id=${id}&amp;p=${morePage}" class="morelink" rel="next">More</a></td></tr>`
    : '';
  return `<!DOCTYPE html><html lang="en" op="item"><head><title>${title} | Hacker News</title></head><body><table id="hnmain"><tr><td bgcolor="#ff6600"><table border="0" style="padding:2px"><tr><td style="width:18px;padding-right:4px"><a href="https://news.ycombinator.com"><img src="y18.svg" width="18" height="18"></a></td><td><span class="pagetop"><b class="hnname"><a href="news">Hacker News</a></b></span></td></tr></table></td></tr><tr><td><table class="fatitem" border="0"><tr class="athing submission" id="${id}"><td align="right" valign="top" class="title"><span class="rank"></span></td><td valign="top" class="votelinks"></td><td class="title"><span class="titleline"><a href="${href}">${title}</a></span></td></tr><tr><td colspan="2"></td><td class="subtext"><span class="subline"><span class="score" id="score_${id}">${score} points</span> by <a href="user?id=${author}" class="hnuser">${author}</a> <span class="age" title="${age}"><a href="item?id=${id}">2 hours ago</a></span> | <a href="item?id=${id}">${countText}</a></span></td></tr>${toptext ? `<tr><td colspan="2"></td><td><div class="toptext">${toptext}</div></td></tr>` : ''}</table><br><br><table border="0" class="comment-tree">${comments.join('\n')}${moreHtml}</table></td></tr></table></body></html>`;
}

const NEWEST_HTML = `<!DOCTYPE html><html><body><table>
<tr class="athing submission" id="41234567"><td class="title"><span class="rank">1.</span></td><td class="votelinks"></td><td class="title"><span class="titleline"><a href="https://example.com/sqlite-queue">Show HN: Fast SQLite Queue</a></span></td></tr>
<tr><td colspan="2"></td><td class="subtext"><span class="subline"><span class="score" id="score_41234567">142 points</span> by <a href="user?id=alice" class="hnuser">alice</a> <span class="age" title="2026-10-14T17:46:05 1792000000"><a href="item?id=41234567">2 hours ago</a></span> | <a href="item?id=41234567">4&nbsp;comments</a></span></td></tr>
<tr class="athing submission" id="41234500"><td class="title"><span class="rank">2.</span></td><td class="votelinks"></td><td class="title"><span class="titleline"><a href="item?id=41234500">Ask HN: Best local LLM setup?</a></span></td></tr>
<tr><td colspan="2"></td><td class="subtext"><span class="subline"><span class="score" id="score_41234500">15 points</span> by <a href="user?id=bob" class="hnuser">bob</a> <span class="age" title="2026-10-14T16:10:00 1791994200"><a href="item?id=41234500">3 hours ago</a></span> | <a href="item?id=41234500">discuss</a></span></td></tr>
</table></body></html>`;

test('parseItemPage reconstructs parent-child reply relationships from indent levels and never cites skipped dead/flagged ancestors', () => {
  const html = renderItemHtml({
    comments: [
      renderCommentRow({ id: '101', indent: 0, author: 'carol', body: 'Top level comment<p>Second paragraph' }),
      renderCommentRow({ id: '102', indent: 1, author: 'dave', body: 'Reply to carol' }),
      renderCommentRow({ id: '103', indent: 2, author: 'erin', body: 'Nested reply to dave' }),
      renderCommentRow({ id: '104', indent: 1, author: 'frank', body: '[flagged]' }),
      renderCommentRow({ id: '105', indent: 2, author: 'grace', body: 'Child under flagged 104 attaches to 101' }),
      renderCommentRow({ id: '106', indent: 0, author: 'heidi', body: '[dead]' }),
      renderCommentRow({ id: '107', indent: 1, author: 'ivan', body: 'Child under dead top-level 106 has null parent' })
    ],
    morePage: 2
  });

  const parsed = parseItemPage(html);
  assert.equal(parsed.post.id, ITEM_ID);
  assert.equal(parsed.post.title, 'Show HN: Fast SQLite Queue');
  assert.equal(parsed.post.link, 'https://example.com/sqlite-queue');
  assert.equal(parsed.post.score, 142);
  assert.equal(parsed.post.author, 'alice');
  assert.equal(parsed.post.when, '2026-10-14 17:46 UTC');
  assert.equal(parsed.post.commentCount, 4);
  assert.equal(parsed.post.text, 'We built a zero-dependency queue on SQLite WAL.');
  assert.equal(parsed.nextPath, `/item?id=${ITEM_ID}&p=2`);

  assert.deepEqual(
    parsed.comments.map(c => ({ id: c.id, parent: c.parentCommentId })),
    [
      { id: '101', parent: null },
      { id: '102', parent: '101' },
      { id: '103', parent: '102' },
      { id: '105', parent: '101' },
      { id: '107', parent: null }
    ]
  );
  assert.equal(parsed.comments[0].body, 'Top level comment\n\nSecond paragraph');
  assert.doesNotMatch(parsed.comments[0].body, /reply$/i);
});

test('parses a comment permalink item page (/item?id=9224) without matching navbar logo or body text "50 comments" / "discuss", and invalidates cache when replies change', async () => {
  const buildPermalinkHtml = (
    replies = [renderCommentRow({ id: '9225', indent: 0, author: 'bob', body: 'Child reply under permalink' })]
  ) =>
    `<!DOCTYPE html><html lang="en" op="item"><head><title>New comment | Hacker News</title></head><body><table id="hnmain"><tr><td bgcolor="#ff6600"><table border="0"><tr><td><a href="https://news.ycombinator.com"><img src="y18.svg" width="18" height="18"></a></td></tr></table></td></tr><tr><td><table class="fatitem" border="0"><tr class="athing" id="9224"><td class="ind"></td><td valign="top" class="votelinks"></td><td class="default"><div style="margin-top:2px; margin-bottom:-10px;"><span class="comhead"><a href="user?id=pg" class="hnuser">pg</a> <span class="age" title="2026-10-14T19:00:00 1792004400"><a href="item?id=9224">1 hour ago</a></span> <span class="navs">| <a href="item?id=9220">parent</a> <span class="onstory"> | on: <a href="item?id=9220">Show HN: Fast SQLite Queue</a></span></span></span></div><br><div class="comment"><div class="commtext c00">Permalink root comment text mentioning 50 comments and 99 points to discuss.<div class="reply"><p><font size="1"><u><a href="reply?id=9224">reply</a></u></font></p></div></div></div></td></tr></table><br><br><table border="0" class="comment-tree">${replies.join('\n')}</table></td></tr></table></body></html>`;

  const parsed = parseItemPage(buildPermalinkHtml());
  assert.equal(parsed.post.id, '9224');
  assert.equal(parsed.post.title, 'Comment on: Show HN: Fast SQLite Queue');
  assert.equal(parsed.post.link, '');
  assert.equal(parsed.post.author, 'pg');
  assert.equal(parsed.post.score, null, 'body text "99 points" does not leak into score');
  assert.equal(parsed.post.commentCount, null, 'body text "50 comments" / "discuss" does not leak into commentCount');
  assert.equal(parsed.post.text, 'Permalink root comment text mentioning 50 comments and 99 points to discuss.');
  assert.equal(parsed.comments.length, 1);
  assert.equal(parsed.comments[0].id, '9225');

  let currentHtml = buildPermalinkHtml();
  let calls = 0;
  const fetcher = createHackerNewsFetcher({
    fetchImpl: async () => {
      calls++;
      return new Response(currentHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
  });
  const first = await fetcher(HACKERNEWS_SITE_URL, '9224');
  assert.equal(first.totalPosts, 2);
  assert.match(first.content, /^Post: Comment on: Show HN: Fast SQLite Queue/);

  const second = await fetcher(HACKERNEWS_SITE_URL, '9224', () => {}, undefined, {
    cachedPages: first.rawPages,
    knownTotalPosts: first.totalPosts
  });
  assert.equal(second.unchanged, true);
  assert.equal(calls, 2);

  // When a new reply arrives on the comment permalink, cache is invalidated.
  currentHtml = buildPermalinkHtml([
    renderCommentRow({ id: '9225', indent: 0, author: 'bob', body: 'Child reply under permalink' }),
    renderCommentRow({ id: '9226', indent: 1, author: 'carol', body: 'Second reply' })
  ]);
  const third = await fetcher(HACKERNEWS_SITE_URL, '9224', () => {}, undefined, {
    cachedPages: first.rawPages,
    knownTotalPosts: first.totalPosts
  });
  assert.equal(third.unchanged, false);
  assert.equal(third.totalPosts, 3);
});

test('topicIdFromArgument extracts Hacker News item ids and JSON_HEADERS omits Cache-Control preflight trigger', () => {
  assert.equal(topicIdFromArgument('https://news.ycombinator.com/item?id=41234567'), '41234567');
  assert.equal(topicIdFromArgument('item?id=41234567&p=2'), '41234567');
  assert.deepEqual(HACKERNEWS_FETCH_CONFIG.JSON_HEADERS, { Accept: 'application/json' });
});

test('fetchTopicContent reads multi-page threads, formats blocks for parseForumContent and firstPostExcerpt, and reuses cache when commentCount is unchanged', async () => {
  const requests = [];
  let currentCommentCount = 3;
  const page1Comments = [
    renderCommentRow({ id: '101', indent: 0, author: 'carol', body: 'First page comment' }),
    renderCommentRow({ id: '102', indent: 1, author: 'dave', body: 'Reply on page 1' })
  ];
  const page2Comments = [renderCommentRow({ id: '103', indent: 2, author: 'erin', body: 'Continued nested reply on page 2' })];

  const fetchImpl = async url => {
    const parsed = new URL(url);
    requests.push(`${parsed.pathname}${parsed.search}`);
    if (parsed.searchParams.get('p') === '2') {
      return new Response(renderItemHtml({ commentCount: currentCommentCount, comments: page2Comments, morePage: null }), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    return new Response(renderItemHtml({ commentCount: currentCommentCount, comments: page1Comments, morePage: 2 }), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  };

  const fetcher = createHackerNewsFetcher({ fetchImpl });
  const initial = await fetcher(HACKERNEWS_SITE_URL, ITEM_ID);

  assert.deepEqual(requests, [`/item?id=${ITEM_ID}`, `/item?id=${ITEM_ID}&p=2`]);
  assert.equal(initial.totalPosts, 4);
  assert.equal(initial.unchanged, false);
  assert.equal(BLOCKS_PER_PAGE, 100);
  assert.match(initial.content, /^Post: Show HN: Fast SQLite Queue\nURL: https:\/\/news\.ycombinator\.com\/item\?id=41234567/);
  assert.match(initial.content, /Comment 102 · dave · 2026-10-14 18:00 UTC · reply to comment 101\nReply on page 1/);
  assert.match(initial.content, /Comment 103 · erin · 2026-10-14 18:00 UTC · reply to comment 102\nContinued nested reply on page 2/);

  const { op, comments } = parseForumContent(initial.content);
  assert.match(op, /^Post: Show HN: Fast SQLite Queue/);
  assert.equal(comments.length, 3);
  assert.equal(firstPostExcerpt(initial.content), 'We built a zero-dependency queue on SQLite WAL.');

  // Second read with unchanged commentCount reuses cachedPages after only fetching page 1.
  requests.length = 0;
  const cached = await fetcher(HACKERNEWS_SITE_URL, ITEM_ID, () => {}, undefined, {
    cachedPages: initial.rawPages,
    knownTotalPosts: initial.totalPosts
  });
  assert.equal(cached.unchanged, true);
  assert.equal(cached.newPosts, 0);
  assert.equal(cached.content, initial.content);
  assert.deepEqual(requests, [`/item?id=${ITEM_ID}`]);

  // Third read after commentCount grows re-fetches all pages.
  requests.length = 0;
  currentCommentCount = 5;
  const updated = await fetcher(HACKERNEWS_SITE_URL, ITEM_ID, () => {}, undefined, {
    cachedPages: initial.rawPages,
    knownTotalPosts: initial.totalPosts
  });
  assert.equal(updated.unchanged, false);
  assert.deepEqual(requests, [`/item?id=${ITEM_ID}`, `/item?id=${ITEM_ID}&p=2`]);
});

test('missing item ("No such item.") and bad inputs fail cleanly', async () => {
  const fetchImpl = async () => new Response('No such item.', { status: 200, headers: { 'Content-Type': 'text/html' } });
  const fetcher = createHackerNewsFetcher({ fetchImpl });
  await assert.rejects(fetcher(HACKERNEWS_SITE_URL, ITEM_ID), error => error.status === 404 && error.retryable === false);
  await assert.rejects(fetcher(HACKERNEWS_SITE_URL, 'not-an-id'), /valid Hacker News item ID/);
  await assert.rejects(fetcher('not a url', ITEM_ID), /valid site URL/);
});

test('Agent tools and prompt on Hacker News: search_forum, search_comments, list_latest, and read_topic', async () => {
  const names = agentToolsFor('hackernews').map(tool => tool.name);
  assert.deepEqual(names, ['search_forum', 'search_comments', 'list_latest', 'read_topic', 'saved_summaries', 'final_answer']);

  const prompt = buildAgentSystemPrompt({
    forumName: 'Hacker News',
    siteUrl: HACKERNEWS_SITE_URL,
    siteType: 'hackernews',
    budget: { maxSteps: 8, maxTopicReads: 3, maxCharsPerRead: 6000 }
  });
  assert.match(prompt, /Hacker News stories and nested comment threads/);
  assert.doesNotMatch(prompt, /Discourse/);

  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push({ url: String(url), origin: parsed.origin, path: `${parsed.pathname}${parsed.search}`, options });
    if (parsed.origin === 'https://hn.algolia.com') {
      const tags = parsed.searchParams.get('tags');
      if (tags === 'story') {
        return new Response(
          JSON.stringify({
            nbPages: 2,
            hits: [
              {
                objectID: ITEM_ID,
                title: 'Show HN: Fast SQLite Queue',
                author: 'alice',
                points: 142,
                num_comments: 4,
                created_at: '2026-10-14T17:46:05Z',
                url: 'https://example.com/sqlite-queue'
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (tags === 'comment') {
        return new Response(
          JSON.stringify({
            nbHits: 12,
            nbPages: 2,
            hits: [
              {
                objectID: '41234999',
                story_id: Number(ITEM_ID),
                story_title: 'Show HN: Fast SQLite Queue',
                author: 'dave',
                created_at: '2026-10-14T18:00:00Z',
                comment_text: 'We switched from Redis to <i>SQLite</i> WAL and cut tail latency.'
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
    if (parsed.pathname === '/newest') {
      return new Response(NEWEST_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (parsed.pathname === '/item') {
      return new Response(
        renderItemHtml({
          comments: [renderCommentRow({ id: '41234999', indent: 0, author: 'dave', body: 'We switched from Redis to SQLite WAL.' })],
          morePage: null
        }),
        { status: 200, headers: { 'Content-Type': 'text/html' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };

  const registry = createDefaultSiteRegistry({ fetchImpl });
  assert.equal(registry.get('hackernews').label, 'Hacker News');
  const toolClient = new HackerNewsToolClient({
    siteUrl: HACKERNEWS_SITE_URL,
    fetchImpl,
    governor: new ForumRequestGovernor({ minIntervalMs: 0 })
  });
  const ctx = {
    siteUrl: HACKERNEWS_SITE_URL,
    siteType: 'hackernews',
    toolClient,
    budget: { maxTopicReads: 3, maxCharsPerRead: 6000 },
    sources: [],
    turnReads: new Set(),
    savedSummaries: { list: async () => [], get: async () => null }
  };
  const run = (tool, args) => executeAgentTool({ tool, arguments: args }, ctx);

  const searchRes = await run('search_forum', { query: 'sqlite queue', sort: 'new' });
  assert.equal(searchRes.resultCount, 1);
  assert.match(searchRes.observation, /- id 41234567: Show HN: Fast SQLite Queue — 5 posts, last activity 2026-10-14/);
  assert.match(searchRes.observation, /more on page 2/);
  assert.equal(requests[0].path, '/api/v1/search_by_date?query=sqlite+queue&tags=story&page=0&hitsPerPage=20');

  const commentRes = await run('search_comments', { query: 'SQLite WAL' });
  assert.equal(commentRes.resultCount, 1);
  assert.match(
    commentRes.observation,
    /- comment 41234999 on post 41234567 "Show HN: Fast SQLite Queue" · dave · 2026-10-14 18:00 UTC\n {2}We switched from Redis to SQLite WAL and cut tail latency\./
  );
  assert.equal(requests[1].path, '/api/v1/search?query=SQLite+WAL&tags=comment&page=0&hitsPerPage=10');

  const latestRes = await run('list_latest', {});
  assert.equal(latestRes.resultCount, 2);
  assert.match(latestRes.observation, /- id 41234567: Show HN: Fast SQLite Queue — 5 posts/);
  assert.match(latestRes.observation, /- id 41234500: Ask HN: Best local LLM setup\? — 1 post/);
  assert.equal(parseStoryList(NEWEST_HTML).stories.length, 2);

  const readRes = await run('read_topic', { topic_id: ITEM_ID, query: 'Redis' });
  assert.equal(readRes.sourceId, 'S1');
  assert.match(readRes.observation, /Showing: 1 matching post for "Redis"/);
  assert.match(readRes.observation, /We switched from Redis to SQLite WAL\./);
  assert.equal(ctx.sources[0].url, `${HACKERNEWS_SITE_URL}/item?id=${ITEM_ID}`);
  assert.equal(ctx.sources[0].topicKey, `news.ycombinator.com/t/${ITEM_ID}`);
  assert.equal(ctx.sources[0].excerpt, 'We built a zero-dependency queue on SQLite WAL.');
});
