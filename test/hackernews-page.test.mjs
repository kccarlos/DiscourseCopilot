// Recognizing a Hacker News item or listing from its address, how the probe
// and content script turn it into page state, and how conversation-state
// matches tabs on news.ycombinator.com.
import assert from 'node:assert/strict';
import test from 'node:test';

import { findTabForForumTarget, getTopicContext, topicKeyFromUrl } from '../src/popup/conversation-state.mjs';
import { derivePageGuidance } from '../src/popup/page-guidance.mjs';
import { pageStateFromProbe } from '../src/popup/page-probe.mjs';
import { buildTopicKey } from '../src/shared/forum-site.mjs';
import { HACKERNEWS_SITE_URL, hackerNewsItemFromUrl, hackerNewsPageFromUrl, isHackerNewsHostname } from '../src/shared/hackernews-page.mjs';
import { SITE_TYPE, siteTypeSupportsAgent } from '../src/shared/site-types.mjs';

const ITEM_URL = 'https://news.ycombinator.com/item?id=41234567';

test('recognizes Hacker News hostnames and valid item URLs', () => {
  assert.equal(isHackerNewsHostname('news.ycombinator.com'), true);
  assert.equal(isHackerNewsHostname('NEWS.YCOMBINATOR.COM'), true);
  assert.equal(isHackerNewsHostname('ycombinator.com'), false);
  assert.equal(isHackerNewsHostname(''), false);

  assert.deepEqual(hackerNewsItemFromUrl(ITEM_URL), { itemId: '41234567', topicId: '41234567' });
  assert.deepEqual(hackerNewsItemFromUrl('https://news.ycombinator.com/item?id=41234567&p=2#41234999'), {
    itemId: '41234567',
    topicId: '41234567'
  });
});

test('listings, user pages, and invalid item ids return null from hackerNewsItemFromUrl', () => {
  for (const url of [
    'https://news.ycombinator.com/',
    'https://news.ycombinator.com/newest',
    'https://news.ycombinator.com/ask',
    'https://news.ycombinator.com/user?id=pg',
    'https://news.ycombinator.com/item',
    'https://news.ycombinator.com/item?id=0',
    'https://news.ycombinator.com/item?id=-5',
    'https://news.ycombinator.com/item?id=abc',
    'http://news.ycombinator.com/item?id=41234567',
    'https://example.com/item?id=41234567',
    'not a url'
  ]) {
    assert.equal(hackerNewsItemFromUrl(url), null, url);
  }
  assert.equal(hackerNewsPageFromUrl('https://example.com/item?id=41234567'), null);
});

test('hackerNewsPageFromUrl and pageStateFromProbe handle both item pages and listings', () => {
  const itemPage = hackerNewsPageFromUrl(ITEM_URL);
  assert.deepEqual(itemPage, {
    siteType: SITE_TYPE.HACKERNEWS,
    siteUrl: HACKERNEWS_SITE_URL,
    basePath: '',
    forumName: 'Hacker News',
    postId: '41234567'
  });

  const listingPage = hackerNewsPageFromUrl('https://news.ycombinator.com/newest');
  assert.equal(listingPage.siteType, SITE_TYPE.HACKERNEWS);
  assert.equal(listingPage.siteUrl, HACKERNEWS_SITE_URL);
  assert.equal(listingPage.postId, null);

  const probedItem = pageStateFromProbe({ url: ITEM_URL, isDiscourse: false, basePath: '', forumName: '', wordpress: {} });
  assert.equal(probedItem.isSupportedSite, true);
  assert.equal(probedItem.siteType, SITE_TYPE.HACKERNEWS);
  assert.equal(probedItem.isForumTopic, true);
  assert.equal(probedItem.siteUrl, HACKERNEWS_SITE_URL);
  assert.equal(probedItem.topicKey, buildTopicKey(HACKERNEWS_SITE_URL, '41234567'));
  assert.equal(probedItem.detectedBy, 'probe');

  const probedListing = pageStateFromProbe({
    url: 'https://news.ycombinator.com/newest',
    isDiscourse: false,
    wordpress: {}
  });
  assert.equal(probedListing.isSupportedSite, true);
  assert.equal(probedListing.isForumTopic, false);
  assert.equal(probedListing.topicKey, '');
});

test('panel context, tab matching, and page guidance for Hacker News', () => {
  const pageState = pageStateFromProbe({ url: ITEM_URL, isDiscourse: false, wordpress: {} });
  const context = getTopicContext({ id: 9, url: ITEM_URL, title: 'Show HN' }, pageState);
  assert.equal(context.isSupportedSite, true);
  assert.equal(context.siteType, SITE_TYPE.HACKERNEWS);
  assert.equal(context.supportsAgent, true);
  assert.equal(siteTypeSupportsAgent(SITE_TYPE.HACKERNEWS), true);
  assert.equal(context.isForumTopic, true);
  assert.equal(context.postId, '41234567');
  assert.equal(context.forumAccess, 'granted');

  // Page 2 of the same item is still the same item tab.
  const pageTwo = getTopicContext({ id: 9, url: `${ITEM_URL}&p=2` }, pageState);
  assert.equal(pageTwo.isForumTopic, true);
  assert.equal(pageTwo.postId, '41234567');

  // Navigating to a different item invalidates the old pageState's item id.
  const otherItem = getTopicContext({ id: 9, url: 'https://news.ycombinator.com/item?id=99999999' }, pageState);
  assert.notEqual(otherItem.postId, '41234567');

  // topicKeyFromUrl and findTabForForumTarget match Hacker News item tabs by ?id=.
  const topicKey = buildTopicKey(HACKERNEWS_SITE_URL, '41234567');
  assert.equal(topicKeyFromUrl(`${ITEM_URL}&p=2`, HACKERNEWS_SITE_URL), topicKey);
  const matchedTab = findTabForForumTarget(
    [
      { id: 1, url: 'https://news.ycombinator.com/item?id=11111111', active: true },
      { id: 2, url: 'https://news.ycombinator.com/item?id=41234567&p=2', active: false }
    ],
    { siteUrl: HACKERNEWS_SITE_URL, topicKey, url: ITEM_URL }
  );
  assert.equal(matchedTab?.id, 2);

  // Page guidance uses Hacker News strings when access is missing or on home page.
  const missing = getTopicContext({ id: 9, url: ITEM_URL }, pageState, { forumAccess: false });
  const allowGuidance = derivePageGuidance(missing);
  assert.equal(allowGuidance.state, 'allow');
  assert.equal(allowGuidance.card.eyebrow, 'Hacker News found');
  assert.match(allowGuidance.card.text, /Hacker News/);

  const homeState = pageStateFromProbe({ url: 'https://news.ycombinator.com/', isDiscourse: false, wordpress: {} });
  const homeContext = getTopicContext({ id: 9, url: 'https://news.ycombinator.com/' }, homeState);
  const homeGuidance = derivePageGuidance(homeContext);
  assert.equal(homeGuidance.state, 'forum-home');
  assert.equal(homeGuidance.hero.eyebrow, 'Hacker News');

  // Navigating from a Hacker News listing page to a non-forum URL invalidates the cached homeState.
  const leftSite = getTopicContext({ id: 9, url: 'https://example.com/' }, homeState);
  assert.equal(leftSite.isSupportedSite, false);
  assert.equal(derivePageGuidance(leftSite).state, 'not-forum');
});
