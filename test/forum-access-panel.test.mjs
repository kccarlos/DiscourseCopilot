// The side panel and settings page around forum access: page checks before
// access (probe, URL heuristics, hidden pages), the Allow access card, the
// controls it locks, and the settings list of enabled forums.
import assert from 'node:assert/strict';
import test from 'node:test';

import { getTopicContext } from '../src/popup/conversation-state.mjs';
import { pageStateFromProbe, probeDiscoursePage } from '../src/popup/page-probe.mjs';
import { forumAccessDeniedText } from '../src/popup/forum-access-card.mjs';
import { deriveTopicControls } from '../src/popup/topic-controls.mjs';
import { resolveIdleStatus } from '../src/popup/ui-state.mjs';
import {
  FORUM_ACCESS_EMPTY_TEXT,
  buildForumAccessRows,
  customServerPatterns,
  describeSavedCount
} from '../src/settings/forum-access-section.mjs';

const TOPIC_URL = 'https://community.openai.com/t/some-topic/12345/3';

function withDocument(elements, run) {
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = {
    querySelector: selector => elements[selector] || null,
    getElementById: id => elements[`#${id}`] || null
  };
  globalThis.window = { location: { href: TOPIC_URL } };
  try {
    return run();
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
  }
}

const meta = content => ({ getAttribute: name => (name === 'content' ? content : null) });

// ---------- probing a page without access ----------

test('the probe detects Discourse from server-rendered tags', () => {
  const found = withDocument(
    {
      'meta[name="generator"]': meta('Discourse 3.4.0 - https://github.com/discourse/discourse'),
      'meta[property="og:site_name"]': meta(' OpenAI Developer Community ')
    },
    probeDiscoursePage
  );
  assert.deepEqual(found, {
    url: TOPIC_URL,
    isDiscourse: true,
    basePath: '',
    forumName: 'OpenAI Developer Community'
  });
  const subfolder = withDocument(
    {
      '#data-discourse-setup': { dataset: { baseUri: '/forum' } }
    },
    probeDiscoursePage
  );
  assert.equal(subfolder.isDiscourse, true);
  assert.equal(subfolder.basePath, '/forum');
  const other = withDocument({ 'meta[name="generator"]': meta('WordPress 6.5') }, probeDiscoursePage);
  assert.equal(other.isDiscourse, false);
});

test('a probe result becomes page state; the forum is marked as needing access', () => {
  const pageState = pageStateFromProbe({
    url: TOPIC_URL,
    isDiscourse: true,
    basePath: '',
    forumName: 'OpenAI Developer Community'
  });
  assert.equal(pageState.detectedBy, 'probe');
  assert.equal(pageState.siteUrl, 'https://community.openai.com');
  assert.equal(pageState.topicId, '12345');

  const context = getTopicContext({ id: 4, url: TOPIC_URL, title: 'Some topic - OpenAI Developer Community' }, pageState, {
    forumAccess: false
  });
  assert.equal(context.isDiscourse, true);
  assert.equal(context.detectedBy, 'probe');
  assert.equal(context.forumAccess, 'missing');
  assert.equal(context.topicKey, 'community.openai.com/t/12345');
  assert.equal(context.pageHidden, false);

  assert.deepEqual(pageStateFromProbe({ url: 'https://example.com/', isDiscourse: false }), {
    url: 'https://example.com/',
    isDiscourse: false,
    detectedBy: 'probe'
  });
  assert.equal(pageStateFromProbe(null), null);
  assert.equal(pageStateFromProbe({ isDiscourse: true }), null);
});

test('a hidden URL means "not checked yet" until the toolbar icon was clicked', () => {
  const hidden = getTopicContext({ id: 9 }, null);
  assert.equal(hidden.pageHidden, true);
  assert.equal(hidden.siteUrl, '');
  assert.equal(hidden.forumAccess, '');
  const clicked = getTopicContext({ id: 9 }, null, { actionChecked: true });
  assert.equal(clicked.pageHidden, false, 'a restricted page (new tab, chrome://) after a click');
  assert.equal(getTopicContext({}, null).pageHidden, false, 'no tab at all');
});

// ---------- the Allow access card (page-guidance.test.mjs covers every state) ----------

test('the denied notice names both clicks', () => {
  assert.equal(forumAccessDeniedText(), 'Chrome didn’t grant access. Click Allow access and choose Allow in Chrome’s prompt.');
});

test('without access nothing that reads the forum can start', () => {
  const base = {
    operationKind: '',
    backgroundAvailable: true,
    configReady: true,
    hasTopic: false,
    hasForumPage: false,
    hasSummary: true,
    hasSource: true,
    historyLength: 1,
    isHydrating: false,
    activeSummaryTask: null,
    hasActiveChatTask: false,
    activeTopicTaskCount: 0,
    agentRequestPending: false,
    hasChatQuestion: true,
    hasAgentQuestion: true,
    chatEditSaving: false,
    agentSearchLabel: 'Search this forum'
  };
  const locked = deriveTopicControls({ ...base, forumAccessMissing: true });
  assert.equal(locked.summarize.disabled, true);
  assert.equal(locked.agentLaunch.disabled, true);
  assert.equal(locked.sendChat.disabled, true);
  assert.equal(locked.copySummary.disabled, false, 'saved history stays usable');
  const open = deriveTopicControls({ ...base, hasTopic: true, hasForumPage: true });
  assert.equal(open.summarize.disabled, false);
  assert.equal(open.sendChat.disabled, false);
});

test('idle status defers to the page guidance', () => {
  assert.equal(resolveIdleStatus({ isForumTopic: false, isDiscourse: false, accessPending: true }), null);
  assert.equal(resolveIdleStatus({ isForumTopic: false, isDiscourse: true, guidanceShown: true }), null);
  assert.ok(resolveIdleStatus({ isForumTopic: false, isDiscourse: false }));
});

// ---------- settings list ----------

test('the settings list names forums from saved history and counts saved items', () => {
  const rows = buildForumAccessRows(
    ['https://community.openai.com', 'https://meta.discourse.org'],
    [
      { siteUrl: 'https://meta.discourse.org', forumName: 'meta.discourse.org' },
      { siteUrl: 'https://meta.discourse.org', forumName: 'Discourse Meta' },
      { siteUrl: 'https://meta.discourse.org/sub', forumName: '' },
      { siteUrl: 'https://other.example', forumName: 'Other' }
    ]
  );
  assert.deepEqual(rows, [
    { origin: 'https://community.openai.com', host: 'community.openai.com', name: '', savedCount: 0 },
    { origin: 'https://meta.discourse.org', host: 'meta.discourse.org', name: 'Discourse Meta', savedCount: 3 }
  ]);
  assert.equal(describeSavedCount(0), '');
  assert.equal(describeSavedCount(1), '1 saved item');
  assert.equal(describeSavedCount(3), '3 saved items');
  assert.match(FORUM_ACCESS_EMPTY_TEXT, /click Allow access in the side panel/);
  assert.deepEqual(customServerPatterns(['http://192.168.1.20:11434', '', 'http://localhost:1234']), [
    'http://192.168.1.20/*',
    'http://localhost/*'
  ]);
});
