import { extractForumTopicId } from '../shared/topic-route.mjs';
import {
  buildTopicKey,
  forumDisplayName,
  isSameForumUrl,
  normalizeBasePath,
  normalizeSiteUrl,
  parseSiteUrl,
  siteUrlFromPageUrl
} from '../shared/forum-site.mjs';

function pageOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

function pageLocation(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '';
  }
}

// A content-script answer is trusted only when it describes the tab's current
// URL; during navigation the previous document may still answer.
function describesTab(pageState, tabUrl) {
  if (!tabUrl || typeof pageState.url !== 'string' || !pageState.url) {
    return true;
  }
  if (pageState.isDiscourse !== true) {
    return pageLocation(pageState.url) === pageLocation(tabUrl);
  }
  // Discourse rewrites the post number while scrolling, so compare topics.
  const site = parseSiteUrl(pageState.siteUrl);
  return (
    pageOrigin(pageState.url) === pageOrigin(tabUrl)
    && extractForumTopicId(tabUrl, site?.basePath || '') === (pageState.topicId ? String(pageState.topicId) : null)
  );
}

function contextFromPageState(pageState, tabUrl) {
  if (!pageState || typeof pageState !== 'object' || !describesTab(pageState, tabUrl)) {
    return null;
  }
  const site = parseSiteUrl(pageState.siteUrl);
  if (pageState.isDiscourse !== true || !site) {
    return {
      isDiscourse: false,
      siteUrl: '',
      forumName: '',
      topicId: null,
      detectedBy: pageState.detectedBy === 'probe' ? 'probe' : 'content'
    };
  }
  const siteUrl = normalizeSiteUrl(pageState.siteUrl);
  const topicId = pageState.topicId ? String(pageState.topicId) : extractForumTopicId(tabUrl || pageState.url, site.basePath);
  return {
    isDiscourse: true,
    siteUrl,
    forumName: forumDisplayName(siteUrl, pageState.forumName),
    topicId: buildTopicKey(siteUrl, topicId) ? topicId : null,
    detectedBy: pageState.detectedBy === 'probe' ? 'probe' : 'content'
  };
}

function contextFromUrl(tabUrl, siteUrlHint = '') {
  const hint = parseSiteUrl(siteUrlHint);
  const basePath = hint && pageOrigin(tabUrl) === hint.origin ? normalizeBasePath(hint.basePath) : '';
  const topicId = extractForumTopicId(tabUrl, basePath);
  const siteUrl = topicId ? siteUrlFromPageUrl(tabUrl, basePath) : '';
  return {
    isDiscourse: false,
    siteUrl,
    forumName: siteUrl ? forumDisplayName(siteUrl) : '',
    topicId: siteUrl ? topicId : null,
    detectedBy: 'url'
  };
}

// pageState is the content script's getPostId answer (preferred), or the
// panel's one-off probe of a forum not enabled yet (detectedBy 'probe').
// Without either (restricted pages, no access to the page) a root-path
// /t/.../id URL is treated as a possible topic whose forum is unconfirmed.
//
// Options:
// - forumAccess: whether the extension may read the forum (forum-access.mjs);
//   false marks the context `forumAccess: 'missing'` (the panel then offers
//   "Allow access to {host}"). Omitted means granted.
// - actionChecked: the toolbar icon was clicked on this tab. Without the
//   "tabs" permission Chrome hides the URL of pages the extension has no
//   access to; after a click (activeTab) a still-hidden URL means a page
//   Chrome never lets extensions read (new tab, chrome://…), so the page is
//   "not a forum" rather than "not checked yet".
export function getTopicContext(tab = {}, pageState = null, { siteUrlHint = '', forumAccess = true, actionChecked = false } = {}) {
  const tabId = tab.id ?? null;
  const url = tab.url || (typeof pageState?.url === 'string' ? pageState.url : '');
  const detected = contextFromPageState(pageState, tab.url || '') || contextFromUrl(url, siteUrlHint);
  const topicKey = detected.topicId ? buildTopicKey(detected.siteUrl, detected.topicId) : '';

  return {
    tabId,
    url,
    title: tab.title || (url ? 'Unknown page' : ''),
    isDiscourse: detected.isDiscourse,
    detectedBy: detected.detectedBy,
    siteUrl: detected.siteUrl,
    forumName: detected.forumName,
    postId: topicKey ? detected.topicId : null,
    topicKey,
    isForumTopic: Boolean(topicKey),
    // '' (no forum) | 'granted' | 'missing'
    forumAccess: detected.siteUrl ? (forumAccess === false ? 'missing' : 'granted') : '',
    // Chrome hid the page from the extension; clicking the toolbar icon
    // lets the panel check it.
    pageHidden: !url && tabId !== null && !actionChecked,
    pageKey: `${tabId ?? 'none'}:${topicKey || 'none'}`
  };
}

// The topic a page URL shows, ignoring slug, post number, query and hash.
export function topicKeyFromUrl(url, siteUrl) {
  const site = parseSiteUrl(siteUrl);
  if (!site || !isSameForumUrl(url, siteUrl)) {
    return '';
  }
  const topicId = extractForumTopicId(url, site.basePath);
  return topicId ? buildTopicKey(siteUrl, topicId) : '';
}

// Picks the tab to reuse for a forum target: one already showing the topic,
// or (without a topic) any tab on the forum. The active tab wins ties.
export function findTabForForumTarget(tabs, { siteUrl = '', topicKey = '' } = {}) {
  const matches = (Array.isArray(tabs) ? tabs : []).filter(
    tab => Number.isInteger(tab?.id) && (topicKey ? topicKeyFromUrl(tab.url, siteUrl) === topicKey : isSameForumUrl(tab.url, siteUrl))
  );
  return matches.find(tab => tab.active) || matches[0] || null;
}

export function normalizeChatQuestion(value, maxLength = 2000) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

export function appendChatMessage(history, role, content, maxMessages = 100) {
  const safeHistory = Array.isArray(history) ? history : [];
  const message = {
    role,
    content: typeof content === 'string' ? content : ''
  };

  return [...safeHistory, message].slice(-maxMessages);
}

export function prepareChatEdit(history, messageIndex) {
  const safeHistory = Array.isArray(history) ? history : [];
  if (
    !Number.isInteger(messageIndex)
    || messageIndex < 0
    || messageIndex >= safeHistory.length
    || safeHistory[messageIndex]?.role !== 'user'
  ) {
    return null;
  }

  const editedMessage = safeHistory[messageIndex];
  const removed = safeHistory.slice(messageIndex);
  return {
    prompt: typeof editedMessage.content === 'string' ? editedMessage.content : '',
    history: safeHistory.slice(0, messageIndex).map(message => ({ ...message })),
    removedTaskIds: [...new Set(removed.map(message => (typeof message?.taskId === 'string' ? message.taskId : '')).filter(Boolean))]
  };
}
