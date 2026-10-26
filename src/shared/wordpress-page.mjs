// Recognizing a WordPress page from facts read off the document. The content
// script and the side panel's one-off probe both collect the same facts (the
// probe runs serialized in the page, so it cannot import this file) and this
// module turns them into the page state, so the rules live in one place.
//
// Every WordPress page advertises its REST root in
// <link rel="https://api.w.org/" href=".../wp-json/">, and a single post or
// page names its id in <link rel="shortlink" href=".../?p=ID"> and in the
// <body> class (postid-ID, or page-id-ID for a page). The id is read from the
// page because WordPress URLs are slugs, not ids.

import { normalizeBasePath, siteUrlFromPageUrl } from './forum-site.mjs';

const REST_ROOT_SUFFIX = '/wp-json';
const POST_ID_PATTERN = /^[1-9]\d{0,11}$/;

/** The selectors a document is read with; both collectors use them. */
export const WORDPRESS_FACT_SELECTORS = Object.freeze({
  restRoot: 'link[rel="https://api.w.org/"]',
  shortlink: 'link[rel="shortlink"]',
  siteName: 'meta[property="og:site_name"]'
});

// "https://example.com/blog/wp-json/" -> "/blog"; null when it is not a pretty
// REST root (plain-permalink sites answer at ?rest_route=, which isn't read).
function basePathFromRestRoot(restRoot, pageUrl) {
  let root;
  let page;
  try {
    root = new URL(restRoot, pageUrl);
    page = new URL(pageUrl);
  } catch {
    return null;
  }
  if (root.origin !== page.origin || root.search || root.hash) {
    return null;
  }
  const path = root.pathname.replace(/\/+$/, '');
  if (!path.endsWith(REST_ROOT_SUFFIX)) {
    return null;
  }
  const basePath = path.slice(0, -REST_ROOT_SUFFIX.length);
  return basePath === normalizeBasePath(basePath) ? basePath : null;
}

function postIdFromFacts({ shortlink = '', bodyClass = '' }, pageUrl) {
  try {
    const id = new URL(shortlink, pageUrl).searchParams.get('p');
    if (POST_ID_PATTERN.test(id || '')) {
      return id;
    }
  } catch {
    // No usable shortlink: fall through to the body class.
  }
  const match = /(?:^|\s)(?:postid|page-id)-(\d+)(?:\s|$)/.exec(bodyClass);
  return match && POST_ID_PATTERN.test(match[1]) ? match[1] : null;
}

/**
 * @param {{ restRoot?: string, shortlink?: string, bodyClass?: string, siteName?: string }} facts
 * @param {string} pageUrl
 * @returns {{ basePath: string, siteUrl: string, postId: string|null, forumName: string }|null}
 *   null when the page is not a WordPress page with a readable REST root
 */
export function wordPressPageFromFacts(facts, pageUrl) {
  if (!facts?.restRoot) {
    return null;
  }
  const basePath = basePathFromRestRoot(facts.restRoot, pageUrl);
  if (basePath === null) {
    return null;
  }
  const siteUrl = siteUrlFromPageUrl(pageUrl, basePath);
  if (!siteUrl) {
    return null;
  }
  return {
    basePath,
    siteUrl,
    postId: postIdFromFacts(facts, pageUrl),
    forumName: typeof facts.siteName === 'string' ? facts.siteName.trim() : ''
  };
}

/** Reads the facts off a document (the content script's side). */
export function collectWordPressFacts(doc) {
  const read = (selector, name) => doc.querySelector(selector)?.getAttribute(name) || '';
  return {
    restRoot: read(WORDPRESS_FACT_SELECTORS.restRoot, 'href'),
    shortlink: read(WORDPRESS_FACT_SELECTORS.shortlink, 'href'),
    bodyClass: doc.body?.className || '',
    siteName: read(WORDPRESS_FACT_SELECTORS.siteName, 'content')
  };
}
