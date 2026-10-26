// The side panel's page guidance: one state (and one card) per page, and how
// provider setup and forum access combine into the "Get started" checklist.
import assert from 'node:assert/strict';
import test from 'node:test';

import { getTopicContext } from '../src/popup/conversation-state.mjs';
import { pageStateFromProbe } from '../src/popup/page-probe.mjs';
import {
  ACCESS_DENIED_TEXT,
  ACCESS_FOOTNOTE,
  EXAMPLE_FORUMS,
  GUIDANCE_STATE,
  derivePageGuidance,
  splitEmphasis
} from '../src/popup/page-guidance.mjs';

const OAI = 'https://community.openai.com';
const TOPIC_URL = `${OAI}/t/rate-limits-explained/4242`;
const HOME_URL = `${OAI}/latest`;
const FORUM = 'OpenAI Developer Community';

const probe = url => pageStateFromProbe({ url, isDiscourse: true, basePath: '', forumName: FORUM });
const contexts = {
  unchecked: getTopicContext({ id: 1 }, null),
  notForum: getTopicContext({ id: 1, url: 'https://example.com/', title: 'Example' }, null),
  restricted: getTopicContext({ id: 1 }, null, { actionChecked: true }),
  allowTopic: getTopicContext({ id: 1, url: TOPIC_URL, title: 'Rate limits' }, probe(TOPIC_URL), { forumAccess: false }),
  allowHome: getTopicContext({ id: 1, url: HOME_URL, title: 'Latest' }, probe(HOME_URL), { forumAccess: false }),
  maybe: getTopicContext({ id: 1, url: TOPIC_URL, title: 'Rate limits' }, null, { forumAccess: false }),
  home: getTopicContext({ id: 1, url: HOME_URL, title: 'Latest' }, probe(HOME_URL)),
  topic: getTopicContext({ id: 1, url: TOPIC_URL, title: 'Rate limits' }, probe(TOPIC_URL))
};

test('each page gets exactly one state', () => {
  assert.equal(derivePageGuidance(null).state, GUIDANCE_STATE.LOADING);
  assert.equal(derivePageGuidance(contexts.unchecked).state, GUIDANCE_STATE.UNCHECKED);
  assert.equal(derivePageGuidance(contexts.notForum).state, GUIDANCE_STATE.NOT_FORUM);
  assert.equal(derivePageGuidance(contexts.restricted).state, GUIDANCE_STATE.NOT_FORUM, 'clicked, still hidden');
  assert.equal(derivePageGuidance(contexts.allowTopic).state, GUIDANCE_STATE.ALLOW);
  assert.equal(derivePageGuidance(contexts.allowHome).state, GUIDANCE_STATE.ALLOW);
  assert.equal(derivePageGuidance(contexts.maybe).state, GUIDANCE_STATE.MAYBE);
  assert.equal(derivePageGuidance(contexts.home).state, GUIDANCE_STATE.FORUM_HOME);
  assert.equal(derivePageGuidance(contexts.topic).state, GUIDANCE_STATE.TOPIC);
});

test('a page Chrome hides asks for the toolbar icon, with the pin tip', () => {
  const view = derivePageGuidance(contexts.unchecked);
  assert.equal(view.card.title, 'Check this page');
  assert.match(view.card.text, /Click the \*\*DiscourseCopilot\*\* icon in your toolbar/);
  assert.match(view.card.tip, /pin DiscourseCopilot from the puzzle-piece menu/);
  assert.equal(view.card.button, '');
  assert.equal(view.primary, 'none');
  assert.equal(view.showHero, false);
  assert.equal(view.showWelcome, false);
});

test('a page that is not a forum explains Discourse and offers two examples, no actions', () => {
  const view = derivePageGuidance(contexts.notForum);
  assert.equal(view.card.title, 'This page isn’t a Discourse forum');
  assert.match(view.card.text, /forums built with Discourse/);
  assert.deepEqual(view.card.links, [
    { label: 'meta.discourse.org', href: 'https://meta.discourse.org/' },
    { label: 'community.openai.com', href: 'https://community.openai.com/' }
  ]);
  assert.equal(view.card.links.length, EXAMPLE_FORUMS.length);
  assert.equal(view.card.button, '');
  assert.equal(view.showHero, false, 'no page-title hero, no disabled actions');
  assert.equal(view.primary, 'none');
});

test('a Discourse topic without access: allow card with a 3-step guide ending in Create summary', () => {
  const view = derivePageGuidance(contexts.allowTopic, { forumName: FORUM });
  assert.equal(view.card.title, `Allow DiscourseCopilot on ${FORUM}`);
  assert.match(view.card.text, /read topics and search this forum using your current login/);
  assert.deepEqual(view.card.steps, [
    'Click **Allow access** below.',
    'Chrome asks for permission. Choose **Allow**.',
    'Then click **Create summary**.'
  ]);
  assert.equal(view.card.button, 'Allow access to community.openai.com');
  assert.equal(view.card.footnote, ACCESS_FOOTNOTE);
  assert.equal(view.card.notice, '');
  assert.equal(view.card.nextStep, false);
  assert.equal(view.primary, 'access');
  assert.equal(view.checklist, null);
  assert.equal(view.showHero, false);
  assert.equal(view.showWelcome, false);
});

test('a forum home page without access ends the guide with opening a topic or asking', () => {
  const view = derivePageGuidance(contexts.allowHome);
  assert.equal(view.card.title, `Allow DiscourseCopilot on ${FORUM}`, 'falls back to the reported forum name');
  assert.equal(view.card.steps[2], 'Then open a topic, or ask the forum a question.');
});

test('the forum name falls back to the host', () => {
  const context = { ...contexts.allowTopic, forumName: '' };
  assert.equal(derivePageGuidance(context).card.title, 'Allow DiscourseCopilot on community.openai.com');
});

test('a topic URL that could not be checked asks "Is this a Discourse forum?" with the same button', () => {
  const view = derivePageGuidance(contexts.maybe);
  assert.equal(view.card.title, 'Is this a Discourse forum?');
  assert.match(view.card.text, /couldn’t check community\.openai\.com yet/);
  assert.equal(view.card.steps[2], 'If it’s a Discourse forum, click **Create summary**.');
  assert.equal(view.card.button, 'Allow access to community.openai.com');
  assert.equal(view.primary, 'access');
});

test('after a refusal the card says how to allow it', () => {
  const view = derivePageGuidance(contexts.allowTopic, { accessDenied: true });
  assert.equal(view.card.notice, ACCESS_DENIED_TEXT);
  assert.match(view.card.notice, /choose \*\*Allow\*\* in Chrome’s prompt/);
  assert.equal(derivePageGuidance(contexts.notForum, { accessDenied: true }).card.notice, '');
});

test('an enabled forum home page leads with Ask the forum', () => {
  const view = derivePageGuidance(contexts.home, { forumName: FORUM });
  assert.equal(view.card, null);
  assert.deepEqual(view.hero, { eyebrow: 'Discourse forum', title: `You’re on ${FORUM}` });
  assert.equal(view.primary, 'ask');
  assert.equal(view.showHero, true);
  assert.equal(view.showWelcome, false);
});

test('an enabled topic keeps the normal view with the welcome panel', () => {
  const view = derivePageGuidance(contexts.topic);
  assert.equal(view.card, null);
  assert.equal(view.hero, null);
  assert.equal(view.primary, 'summary');
  assert.equal(view.showHero, true);
  assert.equal(view.showWelcome, true);
});

test('setup comes first: provider setup is the primary action on every page', () => {
  for (const context of Object.values(contexts)) {
    assert.equal(derivePageGuidance(context, { providerReady: false }).primary, 'setup');
  }
  assert.equal(derivePageGuidance(null, { providerReady: false }).primary, 'setup');
});

test('setup and access both pending: a 2-step checklist with the access card as the next step', () => {
  const view = derivePageGuidance(contexts.allowTopic, { providerReady: false });
  assert.deepEqual(view.checklist, {
    step: 1,
    total: 2,
    label: 'Step 1 of 2: Connect an AI provider',
    items: [
      { label: 'Connect an AI provider', status: 'current' },
      { label: 'Allow access to community.openai.com', status: 'next' }
    ]
  });
  assert.equal(view.card.nextStep, true);
  assert.equal(view.card.eyebrow, 'Step 2 of 2 · Next');
  assert.equal(view.card.button, 'Allow access to community.openai.com', 'still usable');
  assert.equal(derivePageGuidance(contexts.maybe, { providerReady: false }).checklist.step, 1);
});

test('right after setup the checklist moves to step 2 and access becomes the primary action', () => {
  const view = derivePageGuidance(contexts.allowTopic, { providerReady: true, setupShowsSuccess: true });
  assert.equal(view.checklist.step, 2);
  assert.equal(view.checklist.label, 'Step 2 of 2: Allow access to this forum');
  assert.deepEqual(
    view.checklist.items.map(item => item.status),
    ['done', 'current']
  );
  assert.equal(view.card.nextStep, false);
  assert.equal(view.primary, 'access');
});

test('no checklist when only one thing is pending', () => {
  assert.equal(derivePageGuidance(contexts.allowTopic).checklist, null, 'access only');
  assert.equal(derivePageGuidance(contexts.topic, { providerReady: false }).checklist, null, 'setup only');
  assert.equal(derivePageGuidance(contexts.notForum, { providerReady: false }).checklist, null);
  assert.equal(derivePageGuidance(contexts.unchecked, { providerReady: false }).checklist, null);
});

test('the key changes with the state and the forum, not with other re-renders', () => {
  const first = derivePageGuidance(contexts.allowTopic).key;
  assert.equal(derivePageGuidance(contexts.allowTopic, { accessDenied: true }).key, first);
  assert.equal(derivePageGuidance(contexts.allowHome).key, first, 'same forum, same state');
  assert.notEqual(derivePageGuidance(contexts.topic).key, first);
  assert.notEqual(derivePageGuidance(contexts.maybe).key, first);
});

test('**bold** runs split for DOM rendering', () => {
  assert.deepEqual(splitEmphasis('Click **Allow access** below.'), [
    { text: 'Click ', strong: false },
    { text: 'Allow access', strong: true },
    { text: ' below.', strong: false }
  ]);
  assert.deepEqual(splitEmphasis('plain'), [{ text: 'plain', strong: false }]);
  assert.deepEqual(splitEmphasis(''), []);
});

test('step 2 after setup names the step on the card too', () => {
  assert.equal(derivePageGuidance(contexts.allowTopic, { setupShowsSuccess: true }).card.eyebrow, 'Step 2 of 2');
  assert.equal(derivePageGuidance(contexts.allowTopic).card.eyebrow, 'Discourse forum found');
});
