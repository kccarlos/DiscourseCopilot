// What the side panel tells the user about the page in the active tab (pure).
// One state per page, one card per state:
//
//   loading          no page yet                       hero "Loading page…"
//   unchecked        Chrome hides the page             "Check this page" (click the toolbar icon)
//   not-forum        not a Discourse forum             "This page isn't a Discourse forum" + examples
//   allow            Discourse forum, no access        "Allow DiscourseCopilot on {forum}" + Allow button
//   maybe            /t/slug/id URL, not checkable     "Is this a Discourse forum?" + Allow button
//   forum-home       enabled forum, not a topic        hero "You're on {forum}" + Ask the forum
//   topic            enabled forum topic               hero with Create summary / Ask the forum
//
// Provider setup comes first: while it is pending the setup card is the
// primary action, and on a forum without access a "Get started" checklist
// marks the access card as step 2.
import { forumAccessHost } from '../shared/forum-access.mjs';
import { t } from '../shared/i18n.mjs';

export const GUIDANCE_STATE = Object.freeze({
  LOADING: 'loading',
  UNCHECKED: 'unchecked',
  NOT_FORUM: 'not-forum',
  ALLOW: 'allow',
  MAYBE: 'maybe',
  FORUM_HOME: 'forum-home',
  TOPIC: 'topic'
});

// Well-known public Discourse forums offered on pages that aren't one.
export const EXAMPLE_FORUMS = Object.freeze([
  Object.freeze({ label: 'meta.discourse.org', href: 'https://meta.discourse.org/' }),
  Object.freeze({ label: 'community.openai.com', href: 'https://community.openai.com/' })
]);

export const ACCESS_FOOTNOTE = t('guide.footnote');
export const ACCESS_DENIED_TEXT = t('guide.accessDenied');

// Text with **bold** runs → [{ text, strong }] for DOM rendering without HTML.
export function splitEmphasis(text) {
  return String(text || '')
    .split('**')
    .map((part, index) => ({ text: part, strong: index % 2 === 1 }))
    .filter(part => part.text);
}

function pageState(context) {
  if (!context) return GUIDANCE_STATE.LOADING;
  if (context.pageHidden) return GUIDANCE_STATE.UNCHECKED;
  if (!context.siteUrl) return GUIDANCE_STATE.NOT_FORUM;
  if (context.forumAccess === 'missing') {
    return context.isDiscourse ? GUIDANCE_STATE.ALLOW : GUIDANCE_STATE.MAYBE;
  }
  return context.isForumTopic ? GUIDANCE_STATE.TOPIC : GUIDANCE_STATE.FORUM_HOME;
}

function accessCard(state, context, { forumName, host, nextStep }) {
  const finalStep = context.isForumTopic ? t('guide.access.finalTopic') : t('guide.access.finalForum');
  const maybe = state === GUIDANCE_STATE.MAYBE;
  return {
    eyebrow: nextStep ? t('guide.step2Next') : maybe ? t('guide.maybeEyebrow') : t('guide.foundEyebrow'),
    title: maybe ? t('guide.maybeTitle') : t('guide.allowTitle', { forum: forumName }),
    text: maybe ? t('guide.maybeText', { host }) : t('guide.allowText'),
    steps: [
      t('guide.access.step1'),
      t('guide.access.step2'),
      maybe ? (context.isForumTopic ? t('guide.access.maybeTopic') : t('guide.access.maybeForum')) : finalStep
    ],
    button: t('guide.allowButton', { host }),
    links: [],
    tip: '',
    footnote: ACCESS_FOOTNOTE
  };
}

/**
 * @param {object|null} context page context (conversation-state getTopicContext)
 * @param {object} [options]
 * @param {boolean} [options.providerReady] an AI provider is set up
 * @param {boolean} [options.setupShowsSuccess] the setup card shows "You're set"
 * @param {string} [options.forumName] the forum's display name, when known
 * @param {boolean} [options.accessDenied] Chrome just refused access to this forum
 * @returns {{
 *   state: string, key: string, siteUrl: string, host: string, forumName: string,
 *   primary: 'setup'|'access'|'ask'|'summary'|'none',
 *   card: null|{ eyebrow: string, title: string, text: string, steps: string[],
 *     button: string, links: {label: string, href: string}[], tip: string,
 *     footnote: string, notice: string, nextStep: boolean },
 *   hero: null|{ eyebrow: string, title: string },
 *   checklist: null|{ step: number, total: number, label: string,
 *     items: {label: string, status: 'done'|'current'|'next'}[] },
 *   showHero: boolean, showWelcome: boolean
 * }}
 */
export function derivePageGuidance(
  context,
  { providerReady = true, setupShowsSuccess = false, forumName = '', accessDenied = false } = {}
) {
  const state = pageState(context);
  const siteUrl = context?.siteUrl || '';
  const host = siteUrl ? forumAccessHost(siteUrl) : '';
  const name = forumName || context?.forumName || host;
  const needsAccess = state === GUIDANCE_STATE.ALLOW || state === GUIDANCE_STATE.MAYBE;

  let card = null;
  let hero = null;
  if (state === GUIDANCE_STATE.UNCHECKED) {
    card = {
      eyebrow: t('guide.currentPage'),
      title: t('guide.unchecked.title'),
      text: t('guide.unchecked.text'),
      steps: [],
      button: '',
      links: [],
      tip: t('guide.unchecked.tip'),
      footnote: ''
    };
  } else if (state === GUIDANCE_STATE.NOT_FORUM) {
    card = {
      eyebrow: t('guide.currentPage'),
      title: t('guide.notForum.title'),
      text: t('guide.notForum.text'),
      steps: [],
      button: '',
      links: EXAMPLE_FORUMS.map(link => ({ ...link })),
      tip: '',
      footnote: ''
    };
  } else if (needsAccess) {
    card = accessCard(state, context, { forumName: name, host, nextStep: !providerReady });
  } else if (state === GUIDANCE_STATE.FORUM_HOME) {
    // The helper line comes from deriveTopicHelper (topic-controls.mjs).
    hero = { eyebrow: t('guide.hero.eyebrow'), title: t('guide.hero.title', { forum: name }) };
  }
  if (card) {
    card.nextStep = needsAccess && !providerReady;
    if (needsAccess && providerReady && setupShowsSuccess) {
      card.eyebrow = t('guide.step2');
    }
    card.notice = needsAccess && accessDenied ? ACCESS_DENIED_TEXT : '';
  }

  let checklist = null;
  if (needsAccess && (!providerReady || setupShowsSuccess)) {
    const accessLabel = t('guide.allowButton', { host });
    checklist = providerReady
      ? {
          step: 2,
          total: 2,
          label: t('guide.checklist.step2'),
          items: [
            { label: t('guide.connectProvider'), status: 'done' },
            { label: accessLabel, status: 'current' }
          ]
        }
      : {
          step: 1,
          total: 2,
          label: t('guide.checklist.step1'),
          items: [
            { label: t('guide.connectProvider'), status: 'current' },
            { label: accessLabel, status: 'next' }
          ]
        };
  }

  let primary = 'none';
  if (!providerReady) primary = 'setup';
  else if (needsAccess) primary = 'access';
  else if (state === GUIDANCE_STATE.FORUM_HOME) primary = 'ask';
  else if (state === GUIDANCE_STATE.TOPIC) primary = 'summary';

  return {
    state,
    key: `${state}:${siteUrl}`,
    siteUrl,
    host,
    forumName: name,
    primary,
    card,
    hero,
    checklist,
    showHero: state === GUIDANCE_STATE.LOADING || state === GUIDANCE_STATE.FORUM_HOME || state === GUIDANCE_STATE.TOPIC,
    showWelcome: state === GUIDANCE_STATE.TOPIC
  };
}
