// Reading a WordPress post and its comments through the REST API, against a
// fake site shaped like the responses doctorofcredit.com gave in a live probe
// (post 258086: 205 comments, X-WP-Total / X-WP-TotalPages, 100 per page,
// oldest first, `parent` for replies, entities such as &#038; in titles).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultSiteRegistry } from '../src/background/sites/index.mjs';
import { COMMENTS_PER_PAGE, createWordPressFetcher, formatArticle, formatComment } from '../src/background/sites/wordpress.mjs';
import { parseForumContent } from '../src/services/ai-errors.mjs';

const SITE = 'https://www.doctorofcredit.com';
const POST_ID = '258086';

function comment(index, extra = {}) {
  return {
    id: 2322000 + index,
    parent: 0,
    author_name: `user${index}`,
    date_gmt: `2026-05-14T17:${String(index % 60).padStart(2, '0')}:05`,
    content: { rendered: `<p>Comment number ${index} &#8230; DP?</p>` },
    ...extra
  };
}

// A fake site. `state.comments` and `state.modified` can change between reads.
function fakeSite({ commentCount = 205, modified = '2026-10-25T11:50:59', pages = {} } = {}) {
  const state = {
    modified,
    comments: Array.from({ length: commentCount }, (_, index) => comment(index + 1)),
    requests: [],
    respond: null
  };
  const json = (body, headers = {}, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=UTF-8', ...headers } });
  const fetchImpl = async (url, options = {}) => {
    state.requests.push({ url: String(url), options });
    if (state.respond) {
      const custom = state.respond(String(url));
      if (custom) return custom;
    }
    const parsed = new URL(url);
    const post = /^\/wp-json\/wp\/v2\/(posts|pages)\/(\d+)$/.exec(parsed.pathname);
    if (post) {
      if (post[1] === 'posts' && post[2] === POST_ID) {
        return json({
          id: Number(POST_ID),
          title: { rendered: '(Update) Chase Sapphire &#038; Freedom Cards Get 10x With Paze' },
          link: `${SITE}/chase-sapphire-freedom/`,
          date_gmt: '2026-05-14T16:00:00',
          modified_gmt: state.modified,
          content: { rendered: '<p>Chase is offering <strong>10x</strong>.</p><ul><li>United</li><li>Dunkin</li></ul>' }
        });
      }
      if (post[1] === 'pages' && pages[post[2]]) {
        return json({
          id: Number(post[2]),
          title: { rendered: 'About' },
          link: `${SITE}/about/`,
          modified_gmt: state.modified,
          content: { rendered: '<p>About us</p>' }
        });
      }
      return json({ code: 'rest_post_invalid_id', message: 'Invalid post ID.' }, {}, 404);
    }
    if (parsed.pathname === '/wp-json/wp/v2/comments') {
      const page = Number(parsed.searchParams.get('page'));
      const perPage = Number(parsed.searchParams.get('per_page'));
      const total = state.comments.length;
      const totalPages = Math.ceil(total / perPage);
      if (page > Math.max(totalPages, 1)) {
        return json({ code: 'rest_post_invalid_page_number' }, {}, 400);
      }
      return json(state.comments.slice((page - 1) * perPage, page * perPage), {
        'X-WP-Total': String(total),
        'X-WP-TotalPages': String(totalPages)
      });
    }
    return json({ code: 'rest_no_route' }, {}, 404);
  };
  return { state, fetchImpl, commentRequests: () => state.requests.filter(request => request.url.includes('/comments')) };
}

const read = (site, options = {}, progress = []) =>
  createWordPressFetcher({ fetchImpl: site.fetchImpl })(SITE, POST_ID, update => progress.push(update), undefined, options);

test('reads the article and every comment: 205 comments are three pages of the article plus 100, 100, 5', async () => {
  const site = fakeSite();
  const progress = [];
  const result = await read(site, {}, progress);

  assert.equal(result.rawPages.length, 3);
  assert.deepEqual(
    result.rawPages.map(entry => entry.page),
    [1, 2, 3]
  );
  assert.equal(result.totalPosts, 206, 'the article counts as the opening post');
  assert.equal(result.coveredPosts, 206);
  assert.equal(result.truncated, false);
  assert.equal(result.unchanged, false);
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.networkPagesFetched, 3);
  assert.match(result.content, /^Article: \(Update\) Chase Sapphire & Freedom Cards Get 10x With Paze\n/);
  assert.match(result.content, /Updated: 2026-10-25 11:50 UTC/);
  assert.match(result.content, /Chase is offering 10x\.\n\n- United\n- Dunkin/);
  assert.match(result.content, /Comment 2322001 · user1 · 2026-05-14 17:01 UTC\nComment number 1 … DP\?/);
  assert.match(result.content, /Comment 2322205 · user205/);
  assert.equal(result.content.match(/^Comment \d+ /gm).length, 205);

  // Progress counts replies the way topics do: posts read minus the article.
  const last = progress.at(-1);
  assert.equal(last.percent, 100);
  assert.equal(last.totalPages, 3);
  assert.equal(last.totalPosts, 206);
});

test('requests stay on the site, ask for oldest-first pages of 100, and send the browser session', async () => {
  const site = fakeSite();
  await read(site);
  const urls = site.state.requests.map(request => new URL(request.url));
  assert.ok(urls.every(url => url.origin === SITE));
  const pageUrls = urls.filter(url => url.pathname.endsWith('/comments'));
  assert.deepEqual(pageUrls.map(url => url.searchParams.get('page')).sort(), ['1', '2', '3']);
  for (const url of pageUrls) {
    assert.equal(url.searchParams.get('post'), POST_ID);
    assert.equal(url.searchParams.get('per_page'), '100');
    assert.equal(url.searchParams.get('order'), 'asc');
  }
  assert.ok(site.state.requests.every(request => request.options.credentials === 'include'));
});

test('the opening post and the replies split where the summary code splits them', async () => {
  const site = fakeSite({ commentCount: 250 });
  const { content } = await read(site);
  const { op, comments } = parseForumContent(content);
  assert.match(op, /^Article: /);
  assert.doesNotMatch(op, /Comment \d+ ·/);
  assert.equal(comments.length, 250, 'one section per comment, including across page boundaries');
  assert.ok(comments.every(section => /^Comment \d+ · /.test(section)));
});

test('replies name the comment they answer, and empty or odd comments still read', () => {
  assert.equal(
    formatComment({
      id: 7,
      parent: 5,
      author_name: 'ctr42 \n',
      date_gmt: '2026-05-28T23:48:53',
      content: { rendered: '<p>Confirmed per card</p>' }
    }),
    'Comment 7 · ctr42 · 2026-05-28 23:48 UTC · reply to comment 5\nConfirmed per card'
  );
  assert.equal(formatComment({ id: 8, parent: 0, author_name: '', content: { rendered: '' } }), 'Comment 8 · anonymous\n(no text)');
  assert.match(
    formatArticle({ title: { rendered: '' }, modified_gmt: '', content: { rendered: '<p>x</p>' } }),
    /^Article: \(untitled\)\nUpdated: unknown\n\nx$/
  );
});

test('an article with no comments is one page', async () => {
  const site = fakeSite({ commentCount: 0 });
  const result = await read(site);
  assert.equal(result.rawPages.length, 1);
  assert.equal(result.totalPosts, 1);
  assert.equal(result.coveredPosts, 1);
  assert.equal(result.truncated, false);
});

test('nothing new: only the article and the first comment page are read again', async () => {
  const site = fakeSite();
  const first = await read(site);
  site.state.requests.length = 0;
  const again = await read(site, { cachedPages: first.rawPages, knownTotalPosts: first.totalPosts });
  assert.equal(again.unchanged, true);
  assert.equal(again.newPosts, 0);
  assert.equal(again.rawPages.length, 3);
  assert.equal(again.content, first.content);
  assert.equal(site.state.requests.length, 2);
});

test('new comments re-read only the pages that can have changed', async () => {
  const site = fakeSite({ commentCount: 205 });
  const first = await read(site);
  site.state.comments.push(...Array.from({ length: 10 }, (_, index) => comment(206 + index)));
  site.state.requests.length = 0;
  const again = await read(site, { cachedPages: first.rawPages, knownTotalPosts: first.totalPosts });

  assert.equal(again.unchanged, false);
  assert.equal(again.newPosts, 10);
  assert.equal(again.totalPosts, 216);
  assert.equal(again.content.match(/^Comment \d+ /gm).length, 215);
  const pages = site.commentRequests().map(request => new URL(request.url).searchParams.get('page'));
  assert.deepEqual(pages.sort(), ['1', '3'], 'page 2 was full and is reused');
});

test('a page that was exactly full gains its next page, not a re-read', async () => {
  const site = fakeSite({ commentCount: 100 });
  const first = await read(site);
  assert.equal(first.rawPages.length, 1);
  site.state.comments.push(comment(101));
  site.state.requests.length = 0;
  const again = await read(site, { cachedPages: first.rawPages, knownTotalPosts: first.totalPosts });
  assert.equal(again.rawPages.length, 2);
  assert.deepEqual(
    site
      .commentRequests()
      .map(request => new URL(request.url).searchParams.get('page'))
      .sort(),
    ['1', '2']
  );
});

test('an updated article is read again even when the comment count is the same', async () => {
  const site = fakeSite();
  const first = await read(site);
  site.state.modified = '2026-10-26T09:00:00';
  const again = await read(site, { cachedPages: first.rawPages, knownTotalPosts: first.totalPosts });
  assert.equal(again.unchanged, false);
  assert.equal(again.newPosts, 0);
  assert.match(again.content, /Updated: 2026-10-26 09:00 UTC/);
  assert.doesNotMatch(again.content, /Updated: 2026-10-25/);
});

test('fewer comments than before (deletions) re-read everything', async () => {
  const site = fakeSite();
  const first = await read(site);
  site.state.comments.splice(0, 120);
  site.state.requests.length = 0;
  const again = await read(site, { cachedPages: first.rawPages, knownTotalPosts: first.totalPosts });
  assert.equal(again.unchanged, false);
  assert.equal(again.content.match(/^Comment \d+ /gm).length, 85);
  assert.equal(again.rawPages.length, 1);
});

test('a page limit reads the first pages and says what was left out', async () => {
  const site = fakeSite();
  const result = await read(site, { maxPages: 2 });
  assert.equal(result.rawPages.length, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.totalPosts, 206);
  assert.equal(result.coveredPosts, 201, 'the article and the first 200 comments');
  assert.equal(result.content.match(/^Comment \d+ /gm).length, 200);
  assert.ok(!site.state.requests.some(request => new URL(request.url).searchParams.get('page') === '3'));

  // Comments past the limit neither change what is read nor trigger a re-read.
  site.state.comments.push(comment(206));
  site.state.requests.length = 0;
  const again = await read(site, { maxPages: 2, cachedPages: result.rawPages, knownTotalPosts: result.totalPosts });
  assert.equal(again.unchanged, true);
});

test('a WordPress page (not a post) is read through the pages endpoint', async () => {
  const site = fakeSite({ commentCount: 1, pages: { 77: true } });
  site.state.comments.forEach(entry => {
    entry.post = 77;
  });
  const result = await createWordPressFetcher({ fetchImpl: site.fetchImpl })(SITE, '77');
  assert.match(result.content, /^Article: About\n/);
  assert.equal(result.totalPosts, 2);
});

test('a missing post, a login wall and a verification page are user-actionable errors', async () => {
  const site = fakeSite();
  const missing = createWordPressFetcher({ fetchImpl: site.fetchImpl });
  await assert.rejects(missing(SITE, '999'), error => error.needsUserAction === true && error.code === 'FORUM_ACCESS_DENIED');

  site.state.respond = () =>
    new Response(JSON.stringify({ code: 'rest_forbidden' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(read(site), error => error.needsUserAction === true && error.code === 'FORUM_ACCESS_DENIED');

  site.state.respond = () =>
    new Response('<html><head><title>Just a moment...</title></head><body>Checking your browser <!-- cf-chl- --></body></html>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' }
    });
  await assert.rejects(read(site), error => error.needsUserAction === true && error.code === 'USER_ACTION_REQUIRED');

  site.state.respond = () => new Response('oops', { status: 500 });
  await assert.rejects(read(site), error => error.status === 500 && /HTTP 500/.test(error.message));
});

test('bad identities fail before any request', async () => {
  const site = fakeSite();
  const fetcher = createWordPressFetcher({ fetchImpl: site.fetchImpl });
  await assert.rejects(fetcher('not a url', POST_ID), /valid site URL/);
  await assert.rejects(fetcher(SITE, 'abc'), /valid WordPress post ID/);
  await assert.rejects(fetcher(SITE, '12/../3'), /valid WordPress post ID/);
  await assert.rejects(fetcher(SITE, ''), /valid WordPress post ID/);
  assert.equal(site.state.requests.length, 0);
});

test('the registry hands WordPress tasks to this reader and refuses Agent runs there for now', async () => {
  const sites = createDefaultSiteRegistry({ fetchImpl: fakeSite({ commentCount: 3 }).fetchImpl });
  const adapter = sites.forTask({ siteType: 'wordpress' });
  assert.equal(adapter.label, 'WordPress');
  const result = await adapter.fetchTopicContent(SITE, POST_ID, () => {}, undefined, {});
  assert.equal(result.totalPosts, 4);
  assert.throws(() => adapter.createToolClient({ siteUrl: SITE }), /not available on WordPress sites yet/);
  assert.equal(COMMENTS_PER_PAGE, 100);
});
