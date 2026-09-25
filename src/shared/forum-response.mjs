// Pure helpers for classifying forum HTTP responses.
//
// Discourse answers anonymous requests on login_required sites differently
// by format: JSON/XHR requests get 403 `{"error_type":"not_logged_in"}`,
// while plain GETs such as /raw/:topic_id are redirected to /login (or
// /session/sso, /auth/<provider>), which then serves a 200 HTML page.
// Private topics produce 403 (invalid_access) or 404.

import { parseSiteUrl } from './forum-site.mjs';

// Discourse's raw endpoint serves 100 posts per page, so this bounds an
// unknown-size fetch at 10,000 posts.
export const MAX_UNKNOWN_TOPIC_PAGES = 100;

const LOGIN_PATHS = ['/login', '/session/sso', '/auth/', '/signup'];

export const FORUM_RESPONSE_KIND = Object.freeze({
  OK: 'ok',
  EMPTY: 'empty',
  LOGIN_REQUIRED: 'login_required',
  CHALLENGE: 'challenge',
  NOT_FOUND: 'not_found',
  HTTP_ERROR: 'http_error'
});

export function isChallengeBody(value) {
  const body = String(value || '').toLowerCase();
  return (
    body.includes('cf-chl-') || body.includes('cloudflare') || body.includes('checking your browser') || body.includes('just a moment')
  );
}

export function looksLikeHtml(body, contentType = '') {
  if (/\btext\/html\b/i.test(String(contentType || ''))) {
    return true;
  }
  return /^\s*<(!doctype\s+html|html[\s>])/i.test(String(body || ''));
}

function forumHost(siteUrl) {
  const site = parseSiteUrl(siteUrl);
  return site ? new URL(site.origin).host : 'the forum';
}

export function isLoginRedirect({ redirected = false, url = '' } = {}, siteUrl = '') {
  if (!redirected) {
    return false;
  }
  let finalUrl;
  try {
    finalUrl = new URL(url);
  } catch {
    // A redirect whose destination is unknown cannot be trusted as content.
    return true;
  }
  const site = parseSiteUrl(siteUrl);
  if (!site || finalUrl.origin !== site.origin) {
    // Redirected off the forum (e.g. an SSO provider).
    return true;
  }
  const path = finalUrl.pathname.slice(site.basePath.length) || '/';
  return LOGIN_PATHS.some(prefix => path === prefix.replace(/\/$/, '') || path.startsWith(prefix));
}

function isNotLoggedInJson(body) {
  try {
    return JSON.parse(String(body || ''))?.error_type === 'not_logged_in';
  } catch {
    return false;
  }
}

// Classifies a forum response. `expect` is 'json' or 'text'; a successful
// text response (e.g. /raw/) that is HTML is never forum content.
export function classifyForumResponse(
  { status = 0, redirected = false, url = '', contentType = '', body = '' } = {},
  siteUrl = '',
  { expect = 'text' } = {}
) {
  const ok = status >= 200 && status < 300;
  if (isLoginRedirect({ redirected, url }, siteUrl)) {
    return FORUM_RESPONSE_KIND.LOGIN_REQUIRED;
  }
  if (!ok) {
    if (isChallengeBody(body)) {
      return FORUM_RESPONSE_KIND.CHALLENGE;
    }
    if (status === 401 || status === 403 || isNotLoggedInJson(body)) {
      return FORUM_RESPONSE_KIND.LOGIN_REQUIRED;
    }
    if (status === 404) {
      return FORUM_RESPONSE_KIND.NOT_FOUND;
    }
    return FORUM_RESPONSE_KIND.HTTP_ERROR;
  }
  if (!String(body || '').trim()) {
    return FORUM_RESPONSE_KIND.EMPTY;
  }
  if (expect === 'text' ? looksLikeHtml(body, contentType) : looksLikeHtml(body)) {
    return isChallengeBody(body) ? FORUM_RESPONSE_KIND.CHALLENGE : FORUM_RESPONSE_KIND.LOGIN_REQUIRED;
  }
  return FORUM_RESPONSE_KIND.OK;
}

export function forumAccessMessage(kind, siteUrl = '') {
  const host = forumHost(siteUrl);
  if (kind === FORUM_RESPONSE_KIND.CHALLENGE) {
    return `The forum requires verification. Open ${host} in this browser, complete any check, and try again.`;
  }
  if (kind === FORUM_RESPONSE_KIND.NOT_FOUND) {
    return `The topic was not found. It may be private or deleted; if it is private, log in to ${host} in this browser and try again.`;
  }
  return `This forum requires you to be logged in (or the topic is private). Log in to ${host} in this browser and try again.`;
}

export function forumAccessError(kind, siteUrl = '', { status = 0 } = {}) {
  return Object.assign(new Error(forumAccessMessage(kind, siteUrl)), {
    code: kind === FORUM_RESPONSE_KIND.CHALLENGE ? 'USER_ACTION_REQUIRED' : 'FORUM_ACCESS_DENIED',
    status,
    retryable: false,
    needsUserAction: true
  });
}

// Returns raw page text ('' past the last page) or throws when a /raw/
// response is not forum content (login redirect, HTML, or an error status).
export function rawPageContent(snapshot, siteUrl = '') {
  const kind = classifyForumResponse(snapshot, siteUrl, { expect: 'text' });
  if (kind === FORUM_RESPONSE_KIND.OK) {
    return snapshot.body;
  }
  if (kind === FORUM_RESPONSE_KIND.EMPTY) {
    return '';
  }
  if (kind === FORUM_RESPONSE_KIND.HTTP_ERROR) {
    throw Object.assign(new Error(`Forum request failed with HTTP ${snapshot.status}`), {
      status: snapshot.status
    });
  }
  throw forumAccessError(kind, siteUrl, { status: snapshot.status });
}

// Reads raw pages until an empty page, stopping after `maxPages` so a forum
// that never returns an empty page cannot loop forever.
export async function collectRawPages({ fetchPage, maxPages = MAX_UNKNOWN_TOPIC_PAGES, onPage = () => {}, betweenPages = async () => {} }) {
  const rawPages = [];
  for (let page = 1; page <= maxPages; page++) {
    const content = await fetchPage(page);
    if (!String(content || '').trim()) {
      return { rawPages, truncated: false };
    }
    rawPages.push({ page, content });
    await onPage(rawPages);
    if (page < maxPages) {
      await betweenPages();
    }
  }
  return { rawPages, truncated: true };
}

// Reads the fields classifyForumResponse needs from a fetch Response.
export async function readForumResponse(response) {
  let body = '';
  try {
    body = await response.text();
  } catch {
    // The status is sufficient when the body cannot be read.
  }
  return {
    status: response.status,
    redirected: response.redirected === true,
    url: typeof response.url === 'string' ? response.url : '',
    contentType: response.headers?.get?.('Content-Type') || '',
    body
  };
}
