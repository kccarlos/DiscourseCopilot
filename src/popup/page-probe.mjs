// Checking a page before the user enabled DiscourseCopilot on it.
//
// The content script only runs on forums the user enabled. For any other
// page the side panel can run probeDiscoursePage() once with
// chrome.scripting.executeScript — allowed after the user clicked the
// toolbar icon on that tab (activeTab). Its result becomes the same page
// state the content script reports, marked detectedBy: 'probe'.
import { extractForumTopicId } from '../shared/topic-route.mjs';
import { buildTopicKey, forumDisplayName, normalizeBasePath, siteUrlFromPageUrl } from '../shared/forum-site.mjs';
import { SITE_TYPE } from '../shared/site-types.mjs';
import { wordPressPageFromFacts } from '../shared/wordpress-page.mjs';

/**
 * Runs in the page (serialized by executeScript): must not reference
 * anything outside its own body. Mirrors detectDiscoursePage() in
 * content.js: tags every Discourse page renders server-side. It also reads
 * the facts shared/wordpress-page.mjs recognizes a WordPress page from
 * (collectWordPressFacts() in the content script reads the same ones).
 */
export function probeDiscoursePage() {
  const metaContent = selector => {
    const content = document.querySelector(selector)?.getAttribute('content');
    return typeof content === 'string' ? content.trim() : '';
  };
  const generator = metaContent('meta[name="generator"]');
  const baseUriMeta = document.querySelector('meta[name="discourse-base-uri"]');
  const setup = document.getElementById('data-discourse-setup');
  const attributeOf = (selector, name) => document.querySelector(selector)?.getAttribute(name) || '';
  return {
    url: window.location.href,
    isDiscourse: /\bDiscourse\b/i.test(generator) || Boolean(baseUriMeta) || Boolean(setup),
    basePath: setup?.dataset?.baseUri || baseUriMeta?.getAttribute('content') || '',
    forumName: metaContent('meta[property="og:site_name"]'),
    wordpress: {
      restRoot: attributeOf('link[rel="https://api.w.org/"]', 'href'),
      shortlink: attributeOf('link[rel="shortlink"]', 'href'),
      bodyClass: document.body?.className || '',
      siteName: metaContent('meta[property="og:site_name"]')
    }
  };
}

/** A probe result as content-script page state (null when unusable). */
export function pageStateFromProbe(result) {
  if (!result || typeof result !== 'object' || typeof result.url !== 'string') {
    return null;
  }
  if (result.isDiscourse !== true) {
    const wordpress = wordPressPageFromFacts(result.wordpress, result.url);
    if (wordpress) {
      return {
        url: result.url,
        isSupportedSite: true,
        siteType: SITE_TYPE.WORDPRESS,
        isForumPage: true,
        isForumTopic: Boolean(wordpress.postId),
        postId: wordpress.postId,
        topicId: wordpress.postId,
        siteUrl: wordpress.siteUrl,
        basePath: wordpress.basePath,
        forumName: forumDisplayName(wordpress.siteUrl, wordpress.forumName),
        topicKey: wordpress.postId ? buildTopicKey(wordpress.siteUrl, wordpress.postId) : '',
        detectedBy: 'probe'
      };
    }
    return { url: result.url, isSupportedSite: false, detectedBy: 'probe' };
  }
  const basePath = normalizeBasePath(result.basePath);
  const siteUrl = siteUrlFromPageUrl(result.url, basePath);
  const topicId = siteUrl ? extractForumTopicId(result.url, basePath) : null;
  const postId = buildTopicKey(siteUrl, topicId) ? topicId : null;
  return {
    url: result.url,
    isSupportedSite: true,
    siteType: SITE_TYPE.DISCOURSE,
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
