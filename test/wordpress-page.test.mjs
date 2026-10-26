// Recognizing a WordPress page, from the content script's side and from the
// side panel's probe, and how that page flows into the panel's context and
// the tasks queued from it.
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEnqueueRequest } from '../src/background/task-service.mjs';
import { getTopicContext } from '../src/popup/conversation-state.mjs';
import { derivePageGuidance } from '../src/popup/page-guidance.mjs';
import { pageStateFromProbe, probeDiscoursePage } from '../src/popup/page-probe.mjs';
import { createTaskRecord } from '../src/shared/task-record.mjs';
import { normalizeSiteType, siteTypeSupportsAgent } from '../src/shared/site-types.mjs';
import { collectWordPressFacts, wordPressPageFromFacts } from '../src/shared/wordpress-page.mjs';

const SITE = 'https://www.doctorofcredit.com';
const POST_URL = `${SITE}/chase-sapphire-freedom-cards-get-10x-with-paze-checkout-through-2026-united-newegg-shoprite-dunkin-etc/`;
const POST_FACTS = {
  restRoot: `${SITE}/wp-json/`,
  shortlink: `${SITE}/?p=258086`,
  bodyClass: 'post-template-default single single-post postid-258086 single-format-standard',
  siteName: ' Doctor Of Credit '
};

const element = attributes => ({ getAttribute: name => attributes[name] ?? null });

// A document with the given elements, as the probe and the collector query it.
function withDocument(elements, bodyClass, run) {
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = {
    querySelector: selector => elements[selector] || null,
    getElementById: () => null,
    body: { className: bodyClass }
  };
  globalThis.window = { location: { href: POST_URL } };
  try {
    return run();
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
  }
}

const wordpressElements = {
  'link[rel="https://api.w.org/"]': element({ href: POST_FACTS.restRoot }),
  'link[rel="shortlink"]': element({ href: POST_FACTS.shortlink }),
  'meta[property="og:site_name"]': element({ content: ' Doctor Of Credit ' })
};

test('a post page: site, post id and name come from the document, not the slug URL', () => {
  assert.deepEqual(wordPressPageFromFacts(POST_FACTS, POST_URL), {
    basePath: '',
    siteUrl: SITE,
    postId: '258086',
    forumName: 'Doctor Of Credit'
  });
});

test('the post id falls back to the body class, and a page uses page-id', () => {
  assert.equal(wordPressPageFromFacts({ ...POST_FACTS, shortlink: '' }, POST_URL).postId, '258086');
  assert.equal(wordPressPageFromFacts({ ...POST_FACTS, shortlink: '', bodyClass: 'page page-id-12' }, POST_URL).postId, '12');
  assert.equal(wordPressPageFromFacts({ ...POST_FACTS, shortlink: `${SITE}/?p=abc`, bodyClass: 'single' }, POST_URL).postId, null);
});

test('a home or archive page is the site without a post', () => {
  const home = wordPressPageFromFacts({ restRoot: POST_FACTS.restRoot, bodyClass: 'home blog', shortlink: '' }, `${SITE}/`);
  assert.equal(home.siteUrl, SITE);
  assert.equal(home.postId, null);
});

test('a WordPress in a subfolder keeps its base path', () => {
  const state = wordPressPageFromFacts(
    { restRoot: 'https://example.com/blog/wp-json/', shortlink: 'https://example.com/blog/?p=9', bodyClass: '' },
    'https://example.com/blog/hello/'
  );
  assert.equal(state.siteUrl, 'https://example.com/blog');
  assert.equal(state.basePath, '/blog');
  assert.equal(state.postId, '9');
});

test('pages without a readable REST root are not WordPress sites here', () => {
  assert.equal(wordPressPageFromFacts({}, POST_URL), null);
  assert.equal(wordPressPageFromFacts(undefined, POST_URL), null);
  assert.equal(
    wordPressPageFromFacts({ restRoot: 'https://example.com/?rest_route=/' }, 'https://example.com/a/'),
    null,
    'plain permalinks'
  );
  assert.equal(wordPressPageFromFacts({ restRoot: 'https://other.example/wp-json/' }, POST_URL), null, 'another origin');
  assert.equal(wordPressPageFromFacts({ restRoot: `${SITE}/wp-json/?x=1` }, POST_URL), null);
  assert.equal(wordPressPageFromFacts({ restRoot: `${SITE}/not-the-api/` }, POST_URL), null);
});

test('the content script and the probe read the same facts', () => {
  const collected = withDocument(wordpressElements, POST_FACTS.bodyClass, () => collectWordPressFacts(globalThis.document));
  assert.deepEqual(collected, { ...POST_FACTS, siteName: ' Doctor Of Credit ' });
  const probed = withDocument(wordpressElements, POST_FACTS.bodyClass, probeDiscoursePage);
  assert.equal(probed.isDiscourse, false);
  assert.deepEqual(probed.wordpress, { ...POST_FACTS, siteName: 'Doctor Of Credit' });
});

test('the probe turns a WordPress post into page state for the panel', () => {
  const probed = withDocument(wordpressElements, POST_FACTS.bodyClass, probeDiscoursePage);
  const pageState = pageStateFromProbe(probed);
  assert.equal(pageState.isSupportedSite, true);
  assert.equal(pageState.siteType, 'wordpress');
  assert.equal(pageState.detectedBy, 'probe');
  assert.equal(pageState.topicId, '258086');
  assert.equal(pageState.topicKey, 'www.doctorofcredit.com/t/258086');
  assert.equal(pageState.forumName, 'Doctor Of Credit');

  const notWordPress = withDocument({}, '', probeDiscoursePage);
  assert.deepEqual(pageStateFromProbe(notWordPress), { url: POST_URL, isSupportedSite: false, detectedBy: 'probe' });
});

test('the panel context for a WordPress post: a topic, readable, no Agent yet', () => {
  const probed = withDocument(wordpressElements, POST_FACTS.bodyClass, probeDiscoursePage);
  const pageState = pageStateFromProbe(probed);
  const context = getTopicContext({ id: 3, url: POST_URL, title: 'Chase 10x - Doctor Of Credit' }, pageState, { forumAccess: false });
  assert.equal(context.isSupportedSite, true);
  assert.equal(context.siteType, 'wordpress');
  assert.equal(context.supportsAgent, false);
  assert.equal(context.isForumTopic, true);
  assert.equal(context.postId, '258086');
  assert.equal(context.siteUrl, SITE);
  assert.equal(context.forumAccess, 'missing');

  // The same post at another address (a stale answer from the previous page) is ignored.
  const other = getTopicContext({ id: 3, url: `${SITE}/another-post/` }, pageState);
  assert.equal(other.isSupportedSite, false);
  // A query string or hash on the same post still describes it.
  assert.equal(getTopicContext({ id: 3, url: `${POST_URL}?utm=1#comments` }, pageState).postId, '258086');
});

test('a WordPress home page is the site without a topic', () => {
  const pageState = {
    url: `${SITE}/`,
    isSupportedSite: true,
    siteType: 'wordpress',
    isForumPage: true,
    siteUrl: SITE,
    forumName: 'Doctor Of Credit',
    topicId: null
  };
  const context = getTopicContext({ id: 3, url: `${SITE}/` }, pageState);
  assert.equal(context.isSupportedSite, true);
  assert.equal(context.isForumTopic, false);
  assert.equal(context.topicKey, '');
});

test('the access card names the site type', () => {
  const probed = withDocument(wordpressElements, POST_FACTS.bodyClass, probeDiscoursePage);
  const context = getTopicContext({ id: 3, url: POST_URL, title: 'x' }, pageStateFromProbe(probed), { forumAccess: false });
  assert.equal(derivePageGuidance(context).card.eyebrow, 'WordPress site found');
});

test('site types: unknown ones are Discourse, and only Discourse has Agent tools so far', () => {
  assert.equal(normalizeSiteType('wordpress'), 'wordpress');
  assert.equal(normalizeSiteType('flarum'), 'discourse');
  assert.equal(normalizeSiteType(undefined), 'discourse');
  assert.equal(siteTypeSupportsAgent('discourse'), true);
  assert.equal(siteTypeSupportsAgent('wordpress'), false);
});

test('a task keeps the site type it was queued with; old tasks are Discourse', () => {
  const base = { id: 't1', type: 'summary', topicId: '258086', siteUrl: SITE };
  assert.equal(createTaskRecord({ ...base, siteType: 'wordpress' }).siteType, 'wordpress');
  assert.equal(createTaskRecord(base).siteType, 'discourse');
  assert.equal(createTaskRecord({ ...base, siteType: 'nope' }).siteType, 'discourse');
  const validated = validateEnqueueRequest({ taskType: 'summary', topicId: '258086', siteUrl: SITE, siteType: 'wordpress' });
  assert.equal(validated.siteType, 'wordpress');
  assert.equal(validated.topicKey, 'www.doctorofcredit.com/t/258086');
});
