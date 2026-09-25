// Single source of truth for Discourse forum identity.
//
// A forum is identified by its site URL: origin plus optional base path
// (subfolder installs such as https://example.com/forum). Topic identity is
// the topic key, which is stable across page URLs and unique across forums.

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
const BASE_PATH_PATTERN = /^(\/[A-Za-z0-9._~-]+)*$/;

function parseUrl(value) {
  try {
    return value instanceof URL ? new URL(value.href) : new URL(String(value));
  } catch {
    return null;
  }
}

function isAllowedProtocol(url) {
  return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname));
}

function positiveTopicId(value) {
  const normalized = String(value ?? '').trim();
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? normalized : '';
}

export function normalizeBasePath(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (!BASE_PATH_PATTERN.test(withSlash)) {
    return '';
  }
  const segments = withSlash.split('/').slice(1);
  return segments.some(segment => segment === '.' || segment === '..') ? '' : withSlash;
}

export function hasBasePathPrefix(pathname, basePath) {
  if (!basePath) {
    return true;
  }
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function buildSiteUrl(origin, basePath = '') {
  const url = parseUrl(origin);
  if (!url || !url.hostname || !isAllowedProtocol(url)) {
    return '';
  }
  return `${url.origin}${normalizeBasePath(basePath)}`;
}

export function parseSiteUrl(siteUrl) {
  if (typeof siteUrl !== 'string' || !siteUrl.trim()) {
    return null;
  }
  const url = parseUrl(siteUrl.trim());
  if (!url || !url.hostname || !isAllowedProtocol(url) || url.username || url.password || url.search || url.hash) {
    return null;
  }
  const rawPath = url.pathname.replace(/\/+$/, '');
  const basePath = normalizeBasePath(rawPath);
  if (basePath !== rawPath) {
    return null;
  }
  return { origin: url.origin, basePath };
}

export function normalizeSiteUrl(siteUrl) {
  const site = parseSiteUrl(siteUrl);
  return site ? `${site.origin}${site.basePath}` : '';
}

export function siteUrlFromPageUrl(value, basePath = '') {
  const url = parseUrl(value);
  if (!url) {
    return '';
  }
  const normalizedBasePath = normalizeBasePath(basePath);
  if (!hasBasePathPrefix(url.pathname, normalizedBasePath)) {
    return '';
  }
  return buildSiteUrl(url.origin, normalizedBasePath);
}

export function buildTopicKey(siteUrl, topicId) {
  const site = parseSiteUrl(siteUrl);
  const normalizedTopicId = positiveTopicId(topicId);
  if (!site || !normalizedTopicId) {
    return '';
  }
  // URL.host is already lowercase and omits default ports.
  return `${new URL(site.origin).host}${site.basePath}/t/${normalizedTopicId}`;
}

export function buildTopicUrl(siteUrl, topicId) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const normalizedTopicId = positiveTopicId(topicId);
  return normalizedSiteUrl && normalizedTopicId ? `${normalizedSiteUrl}/t/${normalizedTopicId}` : '';
}

function requireSiteUrl(siteUrl) {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  if (!normalizedSiteUrl) {
    throw new Error('A valid forum site URL is required');
  }
  return normalizedSiteUrl;
}

function requireTopicId(topicId) {
  const normalizedTopicId = positiveTopicId(topicId);
  if (!normalizedTopicId) {
    throw new Error('A valid forum topic ID is required');
  }
  return normalizedTopicId;
}

export function buildTopicJsonUrl(siteUrl, topicId) {
  return `${requireSiteUrl(siteUrl)}/t/${requireTopicId(topicId)}.json`;
}

export function buildRawPageUrl(siteUrl, topicId, page = 1) {
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error('A valid raw page number is required');
  }
  return `${requireSiteUrl(siteUrl)}/raw/${requireTopicId(topicId)}?page=${pageNumber}`;
}

export function isSameForumUrl(value, siteUrl) {
  const site = parseSiteUrl(siteUrl);
  const url = parseUrl(value);
  if (!site || !url) {
    return false;
  }
  return url.origin === site.origin && hasBasePathPrefix(url.pathname, site.basePath);
}

export function forumDisplayName(siteUrl, name) {
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 120) : '';
  if (trimmed) {
    return trimmed;
  }
  const site = parseSiteUrl(siteUrl);
  return site ? new URL(site.origin).hostname : '';
}
