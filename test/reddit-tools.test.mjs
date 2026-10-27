// The Agent's tools on Reddit: search_forum / search_comments answered from the
// search markup Reddit renders (cut down from a live logged-in sample),
// list_latest from /new.json, read_topic from the thread, the Reddit prompt,
// and the guarantees that hold on every site.
import assert from 'node:assert/strict';
import test from 'node:test';

import { executeAgentTool } from '../src/background/agent-tools.mjs';
import { ForumRequestGovernor } from '../src/background/forum-tools.mjs';
import { RedditToolClient } from '../src/background/reddit-tools.mjs';
import { agentToolsFor, buildAgentSystemPrompt } from '../src/services/agent-prompt.mjs';
import { parseCommentSearch, parsePostSearch } from '../src/shared/reddit-search.mjs';
import { REDDIT_SITE_URL, topicIdFromRedditId } from '../src/shared/reddit-page.mjs';

const attr = value => JSON.stringify(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function commentUnit({ commentId, postId, title, author, text, postDate, date, position = 0 }) {
  const context = attr({
    action_info: { position, relative_position: position, type: 'post' },
    comment: { id: `t1_${commentId}`, parent_id: 't1_19rist51j70ys', post_id: `t3_${postId}` },
    post: { id: `t3_${postId}`, nsfw: false, spoiler: false, title },
    subreddit: { id: 't5_2vrf0', name: 'churning', nsfw: false, quarantined: false }
  });
  return `<div data-testid="search-sdui-comment-unit"> <search-telemetry-tracker data-faceplate-tracking-context="${context}" click-events="search/click/comment"><a rpl="" href="/r/churning/comments/${postId}/thread_slug/" rel="noopener nofollow ugc"> <faceplate-screen-reader-content><span>${title}</span></faceplate-screen-reader-content></a></search-telemetry-tracker> <div> <div> <faceplate-hovercard label="r/churning"> <a rpl="" href="/r/churning/">r/churning </a> <div slot="content"> <faceplate-partial src="/svc/shreddit/community-hover-card/churning" loading="programmatic"></faceplate-partial> </div> </faceplate-hovercard> <span>·</span><faceplate-timeago ts="${postDate}" short=""></faceplate-timeago> </div> <h2 dir="auto"> ${title} </h2> <div data-testid="search-comment-content"> <div> <div> <faceplate-hovercard data-id="user-hover-card" label="${author} details" mouse-only=""> <a rpl="" href="#">${author}</a> <div slot="content"> <faceplate-partial src="/svc/shreddit/user-hover-card/${author}?commentId=t1_${commentId}" loading="programmatic"></faceplate-partial> </div> </faceplate-hovercard> <span>·</span><faceplate-timeago ts="${date}" short=""></faceplate-timeago> </div> <search-telemetry-tracker data-faceplate-tracking-context="${context}" click-events="search/click/comment"><a rpl="" aria-labelledby="comment-content-t3_${postId}" href="/r/churning/comments/${postId}/thread_slug/${commentId}/" rel="noopener nofollow ugc"></a> <shreddit-stop-propagation> <span id="comment-content-t3_${postId}"><div id="search-comment-t1_${commentId}-post-rtjson-content" dir="auto"> ${text} </div></span> </shreddit-stop-propagation> <div></div></search-telemetry-tracker> <p> <span><faceplate-number number="1" pretty=""></faceplate-number> vote</span> </p> </div> </div> </div> </div>`;
}

function postUnit({ postId, title, author, date, comments, votes = 0, position = 0 }) {
  const context = attr({
    action_info: { position, relative_position: position, type: 'post' },
    post: { id: `t3_${postId}`, nsfw: false, spoiler: false, title },
    profile: { id: 't2_10rpcm', name: author },
    subreddit: { id: 't5_2vrf0', name: 'churning', nsfw: false, quarantined: false }
  });
  return `<div data-testid="search-post-unit"> <div> <ac-gql-mutate operation="ExposeVariant" trigger="click"></ac-gql-mutate> <search-telemetry-tracker data-faceplate-tracking-context="${context}" click-events="search/click/post"><h2> <a data-testid="post-title" href="/r/churning/comments/${postId}/post_slug/" aria-label="${title}"> <faceplate-screen-reader-content>${title}</faceplate-screen-reader-content> </a> </h2></search-telemetry-tracker> <div data-testid="sdui-post-unit"> <span> <faceplate-hovercard label="r/churning"> <a href="/r/churning/"><span>r/churning</span></a> </faceplate-hovercard> <span>·</span><faceplate-timeago format="narrow" ts="${date}"></faceplate-timeago></span> <a data-testid="post-title-text" id="search-post-title-t3_${postId}" href="/r/churning/comments/${postId}/post_slug/"> ${title} </a> <div data-testid="search-counter-row"> <span><faceplate-number number="${votes}" pretty=""></faceplate-number> votes</span><span>·</span><span><faceplate-number number="${comments}" pretty=""></faceplate-number> comments</span> </div> </div> </div>`;
}

const NEXT_COMMENTS = '/svc/shreddit/r/churning/search/?q=chase&type=comments&sort=new&cursor=eyJhIjoxfQ%3D%3D';
const nextPartial = path =>
  `<faceplate-partial loading="lazy" src="${path.replaceAll('&', '&amp;')}"> <div role="article"><div></div></div> </faceplate-partial>`;

const COMMENT_PAGES = [
  `${commentUnit({
    commentId: '19rpct7w91u3p',
    postId: '1xbi2hl',
    title: 'Question Thread - October 21, 2026',
    author: 'grantwwu',
    text: `<p> I&#39;m confused, in your DP you didn&#39;t mention any Chase business cards? <a rpl="" href="https://www.reddit.com/r/churning/comments/1wp7pig/comment/phfzccl/" rel="noopener nofollow ugc" target="_blank">https://www.reddit.com/r/churning/comments/1wp7pig/comment/phfzccl/</a> </p>`,
    postDate: '2026-10-21T09:01:08.902000+0000',
    date: '2026-10-26T23:13:42.054000+0000'
  })}${commentUnit({
    commentId: '19rpb6ke6q9xg',
    postId: '1xfrmnu',
    title: 'Question Thread - October 26, 2026',
    author: 'someone_else',
    text: '<p> Chase approved me for a <strong>Sapphire</strong> today.</p><p>Second paragraph.</p>',
    postDate: '2026-10-26T09:00:00.000000+0000',
    date: '2026-10-26T22:50:00.000000+0000',
    position: 1
  })}${nextPartial(NEXT_COMMENTS)}`,
  commentUnit({
    commentId: '19rp0000aaaaa',
    postId: '1xfrmnu',
    title: 'Question Thread - October 26, 2026',
    author: 'third',
    text: '<p>Last one.</p>',
    postDate: '2026-10-26T09:00:00.000000+0000',
    date: '2026-10-26T20:00:00.000000+0000'
  })
];

const POST_PAGE = `${postUnit({
  postId: '1x1o0he',
  title: 'A Site for Making the most of you Premium Card hotel benefits - CreditStays.com',
  author: 'dsbtwins',
  date: '2026-10-09T15:14:53.111000+0000',
  comments: 14
})}${postUnit({ postId: '1wwm548', title: 'Japan on a Budget: A Guide', author: 'qwertymnbvcxzlk', date: '2026-10-01T12:00:00.000000+0000', comments: 3, votes: 40, position: 1 })}`;

const THREAD_POST = {
  kind: 't3',
  data: {
    id: '1xbi2hl',
    title: 'Question Thread - October 21, 2026',
    subreddit_name_prefixed: 'r/churning',
    author: 'AutoModerator',
    created_utc: 1792000000,
    score: 5,
    is_self: true,
    selftext: 'Ask your questions here.',
    permalink: '/r/churning/comments/1xbi2hl/question_thread_october_21_2026/',
    num_comments: 1
  }
};

function fakeReddit({ searchStatus = 200 } = {}) {
  const requests = [];
  const html = body => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'x-ratelimit-remaining': '80.0' }
    });
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    requests.push({ url: String(url), path: `${parsed.pathname}${parsed.search}`, options });
    if (parsed.pathname.startsWith('/svc/shreddit/')) {
      if (searchStatus !== 200) {
        return new Response('<body class=theme-beta>blocked</body>', { status: searchStatus, headers: { 'Content-Type': 'text/html' } });
      }
      const type = parsed.searchParams.get('type');
      if (type === 'posts') return html(POST_PAGE);
      return html(COMMENT_PAGES[parsed.searchParams.get('cursor') ? 1 : 0]);
    }
    if (parsed.pathname === '/r/churning/new.json') {
      return json({
        data: {
          children: [
            {
              kind: 't3',
              data: {
                id: '1xfrmnu',
                title: 'Question Thread - October 26, 2026',
                subreddit_name_prefixed: 'r/churning',
                selftext: 'Ask here',
                num_comments: 40,
                created_utc: 1792000000,
                permalink: '/r/churning/comments/1xfrmnu/question_thread_october_26_2026/'
              }
            }
          ]
        }
      });
    }
    if (/^\/comments\/[a-z0-9]+\.json$/.test(parsed.pathname)) {
      return json([
        { kind: 'Listing', data: { children: [THREAD_POST] } },
        {
          kind: 'Listing',
          data: {
            children: [
              {
                kind: 't1',
                data: {
                  id: 'c1',
                  parent_id: 't3_1xbi2hl',
                  author: 'grantwwu',
                  created_utc: 1792000100,
                  score: 2,
                  body: 'First comment',
                  replies: ''
                }
              }
            ]
          }
        }
      ]);
    }
    return json({}, 404);
  };
  return { fetchImpl, requests };
}

function setup(options = {}) {
  const site = fakeReddit(options);
  const toolClient = new RedditToolClient({
    siteUrl: REDDIT_SITE_URL,
    fetchImpl: site.fetchImpl,
    governor: new ForumRequestGovernor({ minIntervalMs: 0 })
  });
  const ctx = {
    siteUrl: REDDIT_SITE_URL,
    siteType: 'reddit',
    toolClient,
    budget: { maxTopicReads: 3, maxCharsPerRead: 6000 },
    sources: [],
    turnReads: new Set(),
    savedSummaries: { list: async () => [], get: async () => null }
  };
  return { site, ctx };
}

const run = (tool, args, ctx) => executeAgentTool({ tool, arguments: args }, ctx);

test('comment search markup is read into ids, authors, dates, text and the next page', () => {
  const first = parseCommentSearch(COMMENT_PAGES[0]);
  assert.equal(first.items.length, 2);
  assert.deepEqual(
    { ...first.items[0], text: undefined },
    {
      commentId: '19rpct7w91u3p',
      postRedditId: '1xbi2hl',
      postTitle: 'Question Thread - October 21, 2026',
      subreddit: 'churning',
      author: 'grantwwu',
      date: '2026-10-26 23:13 UTC',
      text: undefined,
      url: '/r/churning/comments/1xbi2hl/thread_slug/19rpct7w91u3p/'
    }
  );
  assert.match(first.items[0].text, /^I'm confused, in your DP you didn't mention any Chase business cards\?/);
  assert.match(first.items[1].text, /Sapphire.*\n?.*Second paragraph/s);
  assert.equal(first.nextUrl, NEXT_COMMENTS, 'the cursor link is unescaped and kept as a site path');
  assert.equal(parseCommentSearch(COMMENT_PAGES[1]).nextUrl, '');
  assert.deepEqual(parseCommentSearch('<html>nothing here</html>'), { items: [], nextUrl: '' });
});

test('post search markup is read into ids, titles, counts and links', () => {
  const { items, nextUrl } = parsePostSearch(POST_PAGE);
  assert.equal(nextUrl, '');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    redditId: '1x1o0he',
    title: 'A Site for Making the most of you Premium Card hotel benefits - CreditStays.com',
    subreddit: 'churning',
    author: 'dsbtwins',
    date: '2026-10-09 15:14 UTC',
    commentCount: 14,
    score: 0,
    url: '/r/churning/comments/1x1o0he/post_slug/'
  });
  assert.equal(items[1].score, 40);
});

test('the Reddit tool set and prompt', () => {
  const names = agentToolsFor('reddit').map(tool => tool.name);
  assert.deepEqual(names, ['search_forum', 'search_comments', 'list_latest', 'read_topic', 'saved_summaries', 'final_answer']);
  assert.ok(
    agentToolsFor('reddit')
      .find(tool => tool.name === 'search_forum')
      .parameters.some(parameter => parameter.name === 'subreddit')
  );
  const prompt = buildAgentSystemPrompt({
    forumName: 'Reddit',
    siteUrl: REDDIT_SITE_URL,
    siteType: 'reddit',
    budget: { maxSteps: 8, maxTopicReads: 3, maxCharsPerRead: 6000 }
  });
  assert.match(prompt, /subreddit communities of posts with comment threads/);
  assert.match(prompt, /subreddit \(optional\):/);
  assert.doesNotMatch(prompt, /Discourse/);
});

test('search_comments searches a subreddit, follows the cursor for page 2 and keeps the first page cached', async () => {
  const { site, ctx } = setup();
  const one = await run('search_comments', { query: 'chase', subreddit: 'r/churning', sort: 'new' }, ctx);
  assert.equal(one.resultCount, 2);
  assert.match(one.observation, /comment 19rpct7w91u3p on post \d+ "Question Thread - October 21, 2026" · grantwwu · 2026-10-26 23:13 UTC/);
  assert.match(one.observation, /more on page 2/);
  assert.match(one.observation, /untrusted site content/);
  const first = site.requests[0];
  assert.equal(first.path, '/svc/shreddit/r/churning/search/?q=chase&type=comments&sort=new');
  assert.equal(first.options.credentials, 'include');

  const two = await run('search_comments', { query: 'chase', subreddit: 'churning', sort: 'new', page: '2' }, ctx);
  assert.equal(two.resultCount, 1);
  assert.equal(site.requests.length, 2, 'page 1 was not fetched again');
  assert.equal(site.requests[1].path, NEXT_COMMENTS);
  assert.doesNotMatch(two.observation, /more on page/);

  const three = await run('search_comments', { query: 'chase', subreddit: 'churning', sort: 'new', page: '3' }, ctx);
  assert.equal(three.resultCount, 0);
  assert.equal(site.requests.length, 2);
});

test('search_forum lists posts with ids, counts and absolute links, then read_topic gives a Reddit source', async () => {
  const { site, ctx } = setup();
  const result = await run('search_forum', { query: 'hotel benefits', subreddit: 'churning' }, ctx);
  assert.equal(result.resultCount, 2);
  const id = topicIdFromRedditId('1x1o0he');
  assert.match(result.observation, new RegExp(`id ${id}`));
  assert.match(result.observation, /CreditStays\.com/);
  assert.equal(site.requests[0].path, '/svc/shreddit/r/churning/search/?q=hotel+benefits&type=posts&sort=relevance');

  const read = await run('read_topic', { topic_id: String(topicIdFromRedditId('1xbi2hl')) }, ctx);
  assert.match(read.observation, /^\[S1\] Topic \d+: Question Thread - October 21, 2026/);
  assert.match(read.observation, /First comment/);
  assert.equal(ctx.sources[0].url, `${REDDIT_SITE_URL}/r/churning/comments/1xbi2hl/question_thread_october_21_2026/`);
  assert.equal(ctx.sources[0].topicKey, `www.reddit.com/t/${topicIdFromRedditId('1xbi2hl')}`);
  assert.match(ctx.sources[0].excerpt, /^Ask your questions here\./);
});

test("list_latest lists a subreddit's newest posts from /new.json", async () => {
  const { site, ctx } = setup();
  const result = await run('list_latest', { subreddit: 'churning' }, ctx);
  assert.equal(result.resultCount, 1);
  assert.match(result.observation, /Question Thread - October 26, 2026/);
  assert.match(site.requests[0].path, /^\/r\/churning\/new\.json\?/);
});

test('bad arguments and a logged-out Reddit come back as errors the model or the user can act on', async () => {
  const { ctx } = setup();
  await assert.rejects(() => run('search_forum', { query: 'x', subreddit: '../evil' }, ctx), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(() => run('read_topic', { topic_id: 'abc' }, ctx), { code: 'INVALID_ARGUMENT' });

  const blocked = setup({ searchStatus: 403 });
  await assert.rejects(
    () => run('search_comments', { query: 'chase', subreddit: 'churning' }, blocked.ctx),
    error => {
      assert.equal(error.needsUserAction, true, 'a 403 means the user has to log in');
      return true;
    }
  );
});

test('the client only talks to Reddit', async () => {
  const { site, ctx } = setup();
  await run('search_forum', { query: 'chase', subreddit: 'churning' }, ctx);
  await run('list_latest', { subreddit: 'churning' }, ctx);
  assert.ok(site.requests.every(request => request.url.startsWith(`${REDDIT_SITE_URL}/`)));
});

test('a login page served with status 200 is a login problem, not an empty search', async () => {
  const toolClient = new RedditToolClient({
    siteUrl: REDDIT_SITE_URL,
    fetchImpl: async () => {
      const response = new Response('<html>Log in</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      Object.defineProperty(response, 'redirected', { value: true });
      Object.defineProperty(response, 'url', { value: `${REDDIT_SITE_URL}/login/` });
      return response;
    },
    governor: new ForumRequestGovernor({ minIntervalMs: 0 })
  });
  await assert.rejects(
    () => toolClient.searchComments({ query: 'chase', subreddit: 'churning' }),
    error => error.needsUserAction === true
  );
});
