// Reading a Reddit post and its comments through the .json endpoints, against
// a fake Reddit shaped like the responses a logged-in Chrome got in a live
// probe (/comments/<id>.json = [post listing, comment listing], raw_json=1,
// "more" stubs expanded by /api/morechildren, ratelimit headers).
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnqueueRequest } from '../src/background/task-service.mjs';
import { createDefaultSiteRegistry } from '../src/background/sites/index.mjs';
import {
  BLOCKS_PER_PAGE,
  cleanText,
  createCommentTree,
  createRedditFetcher,
  formatComment,
  formatPost
} from '../src/background/sites/reddit.mjs';
import { parseForumContent } from '../src/services/ai-errors.mjs';
import { REDDIT_SITE_URL, topicIdFromRedditId } from '../src/shared/reddit-page.mjs';
import { createTaskRecord } from '../src/shared/task-record.mjs';

const REDDIT_ID = '1wv40pf';
const TOPIC_ID = topicIdFromRedditId(REDDIT_ID);

const t1 = (id, parent, extra = {}) => ({
  kind: 't1',
  data: {
    id,
    parent_id: parent,
    author: `user_${id}`,
    created_utc: 1792000000 + id.length,
    score: 3,
    body: `Body of ${id}`,
    replies: '',
    ...extra
  }
});
const withReplies = (comment, replies) => ({
  ...comment,
  data: { ...comment.data, replies: { kind: 'Listing', data: { children: replies } } }
});
const more = (children, parent = `t3_${REDDIT_ID}`) => ({ kind: 'more', data: { count: children.length, parent_id: parent, children } });

const POST = {
  kind: 't3',
  data: {
    id: REDDIT_ID,
    title: 'DO NOT use Amazon points & stuff',
    subreddit_name_prefixed: 'r/CreditCards',
    author: 'op_user',
    created_utc: 1792000000,
    score: 120,
    is_self: true,
    selftext: 'Line one\n\n\n\n\nLine two',
    permalink: `/r/CreditCards/comments/${REDDIT_ID}/slug/`,
    num_comments: 5,
    link_flair_text: 'Rewards'
  }
};

function listing(children) {
  return { kind: 'Listing', data: { children } };
}

// A fake Reddit. `thread` is the first response; `moreById` answers morechildren.
function fakeReddit({ thread, moreBatches = [], continues = {}, status = 200 } = {}) {
  const state = { requests: [], morePosts: [] };
  const json = (body, code = 200) =>
    new Response(JSON.stringify(body), {
      status: code,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'x-ratelimit-remaining': '80.0' }
    });
  const fetchImpl = async (url, options = {}) => {
    state.requests.push({ url: String(url), options });
    const parsed = new URL(url);
    if (status !== 200) {
      return new Response('<body class=theme-beta>blocked</body>', { status, headers: { 'Content-Type': 'text/html' } });
    }
    if (parsed.pathname === '/api/morechildren.json') {
      state.morePosts.push(parsed.searchParams.get('children').split(','));
      return json({ json: { errors: [], data: { things: moreBatches.shift() || [] } } });
    }
    const continued = /^\/comments\/[a-z0-9]+\/_\/([a-z0-9]+)\.json$/.exec(parsed.pathname);
    if (continued) {
      return json([listing([POST]), listing(continues[continued[1]] || [])]);
    }
    if (/^\/comments\/[a-z0-9]+\.json$/.test(parsed.pathname)) {
      return json([listing([POST]), listing(thread)]);
    }
    return json({}, 404);
  };
  return { state, fetchImpl };
}

const read = (site, options = {}, progress = []) =>
  createRedditFetcher({ fetchImpl: site.fetchImpl })(REDDIT_SITE_URL, TOPIC_ID, update => progress.push(update), undefined, options);

test('reads the post and a nested thread in conversation order, replies named by parent', async () => {
  const thread = [
    withReplies(t1('a1', `t3_${REDDIT_ID}`), [withReplies(t1('b1', 't1_a1'), [t1('c1', 't1_b1')]), t1('b2', 't1_a1')]),
    t1('a2', `t3_${REDDIT_ID}`, { body: 'Second top level\n\n\n\n\nstill one comment' })
  ];
  const site = fakeReddit({ thread });
  const progress = [];
  const result = await read(site, {}, progress);

  assert.equal(result.totalPosts, 6, 'the post counts as the opening block');
  assert.equal(result.truncated, false);
  assert.equal(result.rawPages.length, 1);
  assert.match(
    result.content,
    /^Post: DO NOT use Amazon points & stuff\nURL: https:\/\/www\.reddit\.com\/r\/CreditCards\/comments\/1wv40pf\/slug\/\nr\/CreditCards · u\/op_user · .* UTC · score 120 · flair: Rewards\n\nLine one\n\nLine two/
  );
  const ids = [...result.content.matchAll(/^Comment (\w+) · /gm)].map(match => match[1]);
  assert.deepEqual(ids, ['a1', 'b1', 'c1', 'b2', 'a2']);
  assert.match(result.content, /Comment c1 · u\/user_c1 · .* · score 3 · reply to comment b1\nBody of c1/);
  assert.doesNotMatch(result.content.split('Comment a1')[0].split('Post:')[1], /reply to/);

  const { op, comments } = parseForumContent(result.content);
  assert.match(op, /^Post: /);
  assert.equal(comments.length, 5, 'blank runs inside a comment never split it');
  assert.equal(progress.at(-1).percent, 100);
});

test('requests stay on reddit.com, send the browser session, and ask for JSON', async () => {
  const site = fakeReddit({ thread: [t1('a1', `t3_${REDDIT_ID}`)] });
  await read(site);
  assert.equal(site.state.requests.length, 1);
  const [request] = site.state.requests;
  const url = new URL(request.url);
  assert.equal(url.origin, REDDIT_SITE_URL);
  assert.equal(url.pathname, `/comments/${REDDIT_ID}.json`);
  assert.equal(url.searchParams.get('raw_json'), '1');
  assert.equal(request.options.credentials, 'include');
});

test('hidden branches are expanded 100 ids at a time, and what they hold is placed under its parent', async () => {
  const hiddenIds = Array.from({ length: 150 }, (_, index) => `h${index}`);
  const thread = [withReplies(t1('a1', `t3_${REDDIT_ID}`), [more(hiddenIds.slice(0, 2), 't1_a1')]), more(hiddenIds.slice(2))];
  const first = hiddenIds.slice(0, 100).map(id => t1(id, id === 'h0' || id === 'h1' ? 't1_a1' : `t3_${REDDIT_ID}`));
  // The second batch also reveals one more stub that points at a new id.
  const second = [...hiddenIds.slice(100).map(id => t1(id, `t3_${REDDIT_ID}`)), t1('deep', 't1_h120'), more(['late'], 't1_deep')];
  const third = [t1('late', 't1_deep')];
  const site = fakeReddit({ thread, moreBatches: [first, second, third] });
  const result = await read(site);

  assert.equal(site.state.morePosts[0].length, 100);
  assert.equal(site.state.morePosts.length, 3);
  assert.deepEqual(site.state.morePosts[2], ['late']);
  assert.equal(result.totalPosts, 1 + 1 + 150 + 2, 'post, a1, 150 hidden, deep and late');
  assert.equal(result.content.match(/^Comment /gm).length, 153);
  assert.match(result.content, /Comment h0 · .* · reply to comment a1/);
  assert.match(result.content, /Comment late · .* · reply to comment deep/);
  const lines = result.content.split('\n').filter(line => /^Comment (deep|late|h120) /.test(line));
  assert.deepEqual(
    lines.map(line => line.split(' ')[1]),
    ['h120', 'deep', 'late'],
    'a reply follows the comment it answers'
  );
  assert.equal(new URL(site.state.requests[1].url).searchParams.get('link_id'), `t3_${REDDIT_ID}`);
});

test('ids Reddit will not return do not loop the read', async () => {
  const thread = [more(['gone1', 'gone2'])];
  const site = fakeReddit({ thread, moreBatches: [[], [], []] });
  const result = await read(site);
  assert.equal(site.state.morePosts.length, 1);
  assert.equal(result.totalPosts, 1);
  assert.match(result.content, /^Post: /);
});

test('a "continue this thread" stub is read from that comment\'s own page', async () => {
  const thread = [withReplies(t1('a1', `t3_${REDDIT_ID}`), [{ kind: 'more', data: { count: 0, parent_id: 't1_a1', children: [] } }])];
  const site = fakeReddit({ thread, continues: { a1: [withReplies(t1('a1', `t3_${REDDIT_ID}`), [t1('deep1', 't1_a1')])] } });
  const result = await read(site);
  assert.match(site.state.requests[1].url, new RegExp(`/comments/${REDDIT_ID}/_/a1\\.json`));
  assert.match(result.content, /Comment deep1 · .* reply to comment a1/);
  assert.equal(result.totalPosts, 3);
});

test('a long thread is paged 100 blocks to a page and honors the page limit', async () => {
  const thread = Array.from({ length: 250 }, (_, index) => t1(`c${index}`, `t3_${REDDIT_ID}`));
  const full = await read(fakeReddit({ thread }));
  assert.equal(full.totalPosts, 251);
  assert.deepEqual(
    full.rawPages.map(entry => entry.page),
    [1, 2, 3]
  );
  assert.equal(BLOCKS_PER_PAGE, 100);
  assert.equal(parseForumContent(full.content).comments.length, 250);

  const limited = await read(fakeReddit({ thread }), { maxPages: 2 });
  assert.equal(limited.truncated, true);
  assert.equal(limited.rawPages.length, 2);
  assert.equal(limited.coveredPosts, 200);
  assert.equal(limited.totalPosts, 251);
});

test('a logged-out read asks the user to log in instead of failing opaquely', async () => {
  const site = fakeReddit({ thread: [], status: 403 });
  await assert.rejects(read(site), error => {
    assert.equal(error.code, 'FORUM_ACCESS_DENIED');
    assert.equal(error.needsUserAction, true);
    assert.match(error.message, /www\.reddit\.com/);
    return true;
  });
});

test('a post that does not exist is final', async () => {
  const fetchImpl = async () =>
    new Response('{"message":"Not Found","error":404}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(createRedditFetcher({ fetchImpl })(REDDIT_SITE_URL, TOPIC_ID), error => error.retryable === false);
});

test('bad identities never reach the network', async () => {
  const site = fakeReddit({ thread: [] });
  await assert.rejects(createRedditFetcher({ fetchImpl: site.fetchImpl })(REDDIT_SITE_URL, 'abc'), /valid Reddit post ID/);
  await assert.rejects(createRedditFetcher({ fetchImpl: site.fetchImpl })('not a url', TOPIC_ID), /valid site URL/);
  assert.equal(site.state.requests.length, 0);
});

test('formatting: deleted authors, link posts, and blank-run collapsing', () => {
  assert.equal(cleanText('a\r\n\r\n\r\n\r\nb  '), 'a\n\nb');
  assert.match(formatComment({ id: 'x', author: null, body: '[deleted]' }), /^Comment x · u\/\[deleted\]\n\[deleted\]$/);
  const link = formatPost({ title: 'T', is_self: false, url_overridden_by_dest: 'https://example.com/a', selftext: '', author: 'u1' });
  assert.match(link, /Link: https:\/\/example\.com\/a/);
  assert.match(link, /\(no text\)$/);
});

test('the comment tree keeps each comment once and lists its ids', () => {
  const tree = createCommentTree('t3_p');
  tree.add([t1('a', 't3_p'), t1('a', 't3_p'), more(['b', 'a'])], 't3_p');
  assert.deepEqual([...tree.pendingIds], ['b']);
  assert.equal(tree.ordered().length, 1);
});

test('the registry and task flow carry Reddit alongside the other sites', () => {
  const registry = createDefaultSiteRegistry();
  assert.deepEqual(registry.types, ['discourse', 'wordpress', 'reddit']);
  assert.equal(registry.get('reddit').label, 'Reddit');
  assert.equal(registry.forTask({ siteType: 'reddit' }).type, 'reddit');
  assert.equal(registry.forTask({}).type, 'discourse', 'tasks without a site type still read as Discourse');
  assert.throws(() => registry.get('reddit').createToolClient({}), /not available on Reddit/);

  const request = { taskType: 'summary', topicId: TOPIC_ID, siteUrl: REDDIT_SITE_URL, siteType: 'reddit' };
  const validated = validateEnqueueRequest(request);
  assert.equal(validated.siteType, 'reddit');
  assert.equal(validated.topicKey, `www.reddit.com/t/${TOPIC_ID}`);
  assert.equal(
    createTaskRecord({ id: 't1', type: 'summary', topicId: TOPIC_ID, siteUrl: REDDIT_SITE_URL, siteType: 'reddit' }).siteType,
    'reddit'
  );
});
