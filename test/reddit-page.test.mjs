// Recognizing a Reddit post from its address, from the content script's side
// and from the side panel's probe, and how it flows into the panel's context.
import assert from 'node:assert/strict';
import test from 'node:test';

import { getTopicContext } from '../src/popup/conversation-state.mjs';
import { derivePageGuidance } from '../src/popup/page-guidance.mjs';
import { pageStateFromProbe } from '../src/popup/page-probe.mjs';
import { buildTopicKey } from '../src/shared/forum-site.mjs';
import {
  REDDIT_SITE_URL,
  redditIdFromTopicId,
  redditPageFromUrl,
  redditPostFromUrl,
  topicIdFromRedditId
} from '../src/shared/reddit-page.mjs';
import { SITE_TYPE, siteTypeSupportsAgent } from '../src/shared/site-types.mjs';

const POST_URL = 'https://www.reddit.com/r/CreditCards/comments/1wv40pf/do_not_use_amazon_credit_card_points_at_checkout/';

test('a Reddit id is a topic id and back, for every length Reddit uses', () => {
  for (const id of ['1', 'z', '1wv40pf', '1xe3sek', 'zzzzzzzzzz']) {
    const topicId = topicIdFromRedditId(id);
    assert.match(topicId, /^[1-9]\d*$/);
    assert.equal(redditIdFromTopicId(topicId), id);
    assert.ok(buildTopicKey(REDDIT_SITE_URL, topicId), 'the extension keys the post like any topic');
  }
  assert.equal(topicIdFromRedditId('not an id'), null);
  assert.equal(topicIdFromRedditId('0'), null);
  assert.equal(topicIdFromRedditId('12345678901'), null);
  assert.equal(redditIdFromTopicId('0'), null);
  assert.equal(redditIdFromTopicId('abc'), null);
});

test('a post is recognized on every Reddit host and address shape', () => {
  const expected = topicIdFromRedditId('1wv40pf');
  for (const url of [
    POST_URL,
    'https://old.reddit.com/r/CreditCards/comments/1wv40pf/slug/',
    'https://sh.reddit.com/r/CreditCards/comments/1wv40pf/slug/?utm_source=share',
    'https://www.reddit.com/r/CreditCards/comments/1wv40pf/slug/pbabc12/',
    'https://www.reddit.com/r/CreditCards/comments/1WV40PF/',
    'https://www.reddit.com/comments/1wv40pf',
    'https://reddit.com/user/someone/comments/1wv40pf/slug/#anchor'
  ]) {
    assert.equal(redditPostFromUrl(url)?.topicId, expected, url);
  }
  assert.equal(redditPostFromUrl(POST_URL).subreddit, 'CreditCards');
  assert.equal(redditPostFromUrl(POST_URL).redditId, '1wv40pf');
});

test('listings, profiles, search and other sites are not posts', () => {
  for (const url of [
    'https://www.reddit.com/r/churning/',
    'https://www.reddit.com/r/churning/search/?q=chase',
    'https://www.reddit.com/user/someone/',
    'https://www.reddit.com/r/churning/comments/',
    'https://www.reddit.com/r/churning/wiki/comments/1wv40pf',
    'https://example.com/r/churning/comments/1wv40pf/x/',
    'https://notreddit.com/comments/1wv40pf',
    'http://www.reddit.com/comments/1wv40pf',
    'not a url'
  ]) {
    assert.equal(redditPostFromUrl(url), null, url);
  }
  assert.equal(redditPageFromUrl('https://example.com/comments/1wv40pf'), null);
});

test('every Reddit host reads the same site, so one grant and one topic key cover them all', () => {
  for (const host of ['www', 'old', 'sh', 'np', 'm']) {
    const page = redditPageFromUrl(`https://${host}.reddit.com/r/churning/comments/1xe3sek/q/`);
    assert.equal(page.siteUrl, REDDIT_SITE_URL);
    assert.equal(page.siteType, SITE_TYPE.REDDIT);
    assert.equal(page.postId, topicIdFromRedditId('1xe3sek'));
  }
  const listing = redditPageFromUrl('https://old.reddit.com/r/churning/');
  assert.equal(listing.siteUrl, REDDIT_SITE_URL);
  assert.equal(listing.postId, null);
});

test('the probe turns a Reddit tab into page state, post or listing', () => {
  const post = pageStateFromProbe({ url: POST_URL, isDiscourse: false, basePath: '', forumName: '', wordpress: {} });
  assert.equal(post.isSupportedSite, true);
  assert.equal(post.siteType, SITE_TYPE.REDDIT);
  assert.equal(post.isForumTopic, true);
  assert.equal(post.siteUrl, REDDIT_SITE_URL);
  assert.equal(post.topicKey, buildTopicKey(REDDIT_SITE_URL, topicIdFromRedditId('1wv40pf')));
  assert.equal(post.detectedBy, 'probe');

  const listing = pageStateFromProbe({ url: 'https://www.reddit.com/r/churning/', isDiscourse: false, wordpress: {} });
  assert.equal(listing.isSupportedSite, true);
  assert.equal(listing.isForumTopic, false);
  assert.equal(listing.topicKey, '');
});

test('the panel context for a Reddit post, with and without access', () => {
  const pageState = pageStateFromProbe({ url: POST_URL, isDiscourse: false, wordpress: {} });
  const context = getTopicContext({ id: 7, url: POST_URL, title: 'x' }, pageState);
  assert.equal(context.isSupportedSite, true);
  assert.equal(context.siteType, SITE_TYPE.REDDIT);
  assert.equal(context.supportsAgent, false, 'the Agent is not offered on Reddit');
  assert.equal(siteTypeSupportsAgent(SITE_TYPE.REDDIT), false);
  assert.equal(context.isForumTopic, true);
  assert.equal(context.postId, topicIdFromRedditId('1wv40pf'));
  assert.equal(context.forumAccess, 'granted');

  // The same post on another host or a comment permalink is the same page.
  const old = getTopicContext({ id: 7, url: 'https://www.reddit.com/r/CreditCards/comments/1wv40pf/x/pb1/' }, pageState);
  assert.equal(old.isForumTopic, true);
  // A different post is not described by this state.
  const other = getTopicContext({ id: 7, url: 'https://www.reddit.com/r/CreditCards/comments/1xe3sek/x/' }, pageState);
  assert.notEqual(other.postId, context.postId);

  const missing = getTopicContext({ id: 7, url: POST_URL }, pageState, { forumAccess: false });
  assert.equal(missing.forumAccess, 'missing');
  const guidance = derivePageGuidance(missing);
  assert.equal(guidance.state, 'allow');
  assert.equal(guidance.siteUrl, REDDIT_SITE_URL);
});
