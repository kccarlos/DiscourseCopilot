// Checking a page before the user enabled DiscourseCopilot on it.
//
// The content script only runs on forums the user enabled. For any other
// page the side panel can run probeDiscoursePage() once with
// chrome.scripting.executeScript — allowed after the user clicked the
// toolbar icon on that tab (activeTab). Its result becomes the same page
// state the content script reports, marked detectedBy: 'probe'.
import { extractForumTopicId } from '../shared/topic-route.mjs';
import {
  buildTopicKey,
  forumDisplayName,
  normalizeBasePath,
  siteUrlFromPageUrl
} from '../shared/forum-site.mjs';

/**
 * Runs in the page (serialized by executeScript): must not reference
 * anything outside its own body. Mirrors detectDiscoursePage() in
 * content.js: tags every Discourse page renders server-side.
 */
export function probeDiscoursePage() {
  const metaContent = selector => {
    const content = document.querySelector(selector)?.getAttribute('content');
    return typeof content === 'string' ? content.trim() : '';
  };
  const generator = metaContent('meta[name="generator"]');
  const baseUriMeta = document.querySelector('meta[name="discourse-base-uri"]');
  const setup = document.getElementById('data-discourse-setup');
  return {
    url: window.location.href,
    isDiscourse: /\bDiscourse\b/i.test(generator) || Boolean(baseUriMeta) || Boolean(setup),
    basePath: setup?.dataset?.baseUri || baseUriMeta?.getAttribute('content') || '',
    forumName: metaContent('meta[property="og:site_name"]')
  };
}

/** A probe result as content-script page state (null when unusable). */
export function pageStateFromProbe(result) {
  if (!result || typeof result !== 'object' || typeof result.url !== 'string') {
    return null;
  }
  if (result.isDiscourse !== true) {
    return { url: result.url, isDiscourse: false, detectedBy: 'probe' };
  }
  const basePath = normalizeBasePath(result.basePath);
  const siteUrl = siteUrlFromPageUrl(result.url, basePath);
  const topicId = siteUrl ? extractForumTopicId(result.url, basePath) : null;
  const postId = buildTopicKey(siteUrl, topicId) ? topicId : null;
  return {
    url: result.url,
    isDiscourse: true,
    isForumPage: Boolean(siteUrl),
    isForumTopic: Boolean(postId),
    postId,
    topicId: postId,
    siteUrl,
    basePath: siteUrl ? basePath : '',
    forumName: siteUrl ? forumDisplayName(siteUrl, result.forumName) : '',
    topicKey: postId ? buildTopicKey(siteUrl, postId) : '',
    detectedBy: 'probe'
  };
}
