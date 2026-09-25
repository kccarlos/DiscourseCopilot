import { buildTopicKey, buildTopicUrl, normalizeSiteUrl, siteUrlFromPageUrl } from './forum-site.mjs';

export const CHAT_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_SAVED_TOPICS = 40;
export const MAX_SAVED_CHAT_MESSAGES = 100;

const CHAT_ROLES = new Set(['user', 'assistant']);

function finiteTimestamp(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveIntegerOrNull(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function canonicalizeTopicUrl(value, topicId, siteUrl = '') {
  try {
    const url = new URL(value);
    if (!url.hostname || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
      throw new Error('Unsupported topic host');
    }
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return buildTopicUrl(siteUrl, topicId);
  }
}

function sessionSiteUrl(value) {
  // Sessions saved before siteUrl existed only know their topic URL.
  return normalizeSiteUrl(value?.siteUrl) || siteUrlFromPageUrl(trimmedString(value?.url));
}

export function normalizeRawPages(pages) {
  if (!Array.isArray(pages)) {
    return [];
  }

  const byPage = new Map();
  for (const entry of pages) {
    const page = Number(entry?.page);
    if (Number.isInteger(page) && page > 0 && typeof entry.content === 'string') {
      byPage.set(page, { page, content: entry.content });
    }
  }
  return [...byPage.values()].sort((left, right) => left.page - right.page);
}

export function normalizeSavedHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(message => message && CHAT_ROLES.has(message.role))
    .map(message => ({
      role: message.role,
      content: typeof message.content === 'string' ? message.content.slice(0, 20000) : '',
      ...(trimmedString(message.taskId) ? { taskId: trimmedString(message.taskId).slice(0, 120) } : {}),
      ...(finiteTimestamp(message.createdAt) ? { createdAt: finiteTimestamp(message.createdAt) } : {})
    }))
    .filter(message => message.content.trim())
    .slice(-MAX_SAVED_CHAT_MESSAGES);
}

export function createTopicSession({ topicId, siteUrl, url, title, forumName }, now = Date.now()) {
  const normalizedTopicId = String(topicId || '');
  const normalizedSiteUrl = sessionSiteUrl({ siteUrl, url });
  return {
    topicId: normalizedTopicId,
    siteUrl: normalizedSiteUrl,
    topicKey: buildTopicKey(normalizedSiteUrl, normalizedTopicId),
    url: canonicalizeTopicUrl(url, normalizedTopicId, normalizedSiteUrl),
    title: trimmedString(title) || `Topic ${normalizedTopicId}`,
    forumName: trimmedString(forumName).slice(0, 120),
    source: '',
    rawPages: [],
    summary: '',
    history: [],
    kept: false,
    totalPosts: null,
    summaryPostCount: null,
    // Page-limit coverage: the cached source (latest read) and the summary.
    sourceTruncated: false,
    coveredPosts: null,
    summaryTruncated: false,
    summaryCoveredPosts: null,
    summaryPagesRead: 0,
    pagesFetched: 0,
    provider: '',
    model: '',
    createdAt: now,
    updatedAt: now,
    summaryUpdatedAt: 0,
    chatUpdatedAt: 0,
    lastCheckedAt: 0,
    lastAccessedAt: now
  };
}

export function normalizeTopicSession(value, now = Date.now()) {
  const topicId = trimmedString(value?.topicId);
  const siteUrl = sessionSiteUrl(value);
  const topicKey = buildTopicKey(siteUrl, topicId);
  if (!topicKey) {
    return null;
  }

  const createdAt = finiteTimestamp(value.createdAt, now);
  return {
    topicId,
    siteUrl,
    topicKey,
    url: canonicalizeTopicUrl(value.url, topicId, siteUrl),
    title: trimmedString(value.title) || `Topic ${topicId}`,
    forumName: trimmedString(value.forumName).slice(0, 120),
    source: typeof value.source === 'string' ? value.source : '',
    rawPages: normalizeRawPages(value.rawPages),
    summary: typeof value.summary === 'string' ? value.summary : '',
    history: normalizeSavedHistory(value.history),
    kept: value.kept === true,
    totalPosts: Number.isInteger(value.totalPosts) && value.totalPosts > 0 ? value.totalPosts : null,
    summaryPostCount: Number.isInteger(value.summaryPostCount) && value.summaryPostCount > 0 ? value.summaryPostCount : null,
    sourceTruncated: value.sourceTruncated === true,
    coveredPosts: positiveIntegerOrNull(value.coveredPosts),
    summaryTruncated: value.summaryTruncated === true,
    summaryCoveredPosts: positiveIntegerOrNull(value.summaryCoveredPosts),
    summaryPagesRead: Number.isInteger(value.summaryPagesRead) && value.summaryPagesRead >= 0 ? value.summaryPagesRead : 0,
    pagesFetched: Number.isInteger(value.pagesFetched) && value.pagesFetched >= 0 ? value.pagesFetched : 0,
    provider: trimmedString(value.provider),
    model: trimmedString(value.model),
    createdAt,
    updatedAt: finiteTimestamp(value.updatedAt, createdAt),
    summaryUpdatedAt: finiteTimestamp(value.summaryUpdatedAt),
    chatUpdatedAt: finiteTimestamp(value.chatUpdatedAt),
    lastCheckedAt: finiteTimestamp(value.lastCheckedAt),
    lastAccessedAt: finiteTimestamp(value.lastAccessedAt, createdAt)
  };
}

export function isChatExpired(session, now = Date.now(), retentionMs = CHAT_RETENTION_MS) {
  return Boolean(session?.history?.length && !session.kept && session.chatUpdatedAt > 0 && now - session.chatUpdatedAt >= retentionMs);
}

export function expireChatHistory(value, now = Date.now(), retentionMs = CHAT_RETENTION_MS) {
  const session = normalizeTopicSession(value, now);
  if (!session || !isChatExpired(session, now, retentionMs)) {
    return { session, expired: false };
  }

  return {
    session: {
      ...session,
      history: [],
      chatUpdatedAt: 0
    },
    expired: true
  };
}

export function buildTopicIndexEntry(value) {
  const session = normalizeTopicSession(value);
  if (!session) {
    return null;
  }

  return {
    topicKey: session.topicKey,
    topicId: session.topicId,
    siteUrl: session.siteUrl,
    url: session.url,
    title: session.title,
    forumName: session.forumName,
    hasSummary: Boolean(session.summary),
    kept: session.kept,
    summaryExcerpt: session.summary
      .replace(/[#*_>`~[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180),
    totalPosts: session.totalPosts,
    summaryPostCount: session.summaryPostCount,
    summaryTruncated: session.summaryTruncated,
    summaryCoveredPosts: session.summaryCoveredPosts,
    historyCount: session.history.length,
    provider: session.provider,
    model: session.model,
    updatedAt: session.updatedAt,
    summaryUpdatedAt: session.summaryUpdatedAt,
    chatUpdatedAt: session.chatUpdatedAt,
    lastAccessedAt: session.lastAccessedAt
  };
}

export function getRefreshPlan({ cachedPages, knownTotalPosts, currentTotalPosts }) {
  const pages = normalizeRawPages(cachedPages);
  const knownCount = Number.isInteger(knownTotalPosts) && knownTotalPosts > 0 ? knownTotalPosts : 0;
  const currentCount = Number.isInteger(currentTotalPosts) && currentTotalPosts > 0 ? currentTotalPosts : 0;

  if (!pages.length || !knownCount || !currentCount) {
    return { unchanged: false, reusablePages: [], firstPageToFetch: 1 };
  }

  if (currentCount === knownCount) {
    return {
      unchanged: true,
      reusablePages: pages,
      firstPageToFetch: null
    };
  }

  if (currentCount < knownCount) {
    return { unchanged: false, reusablePages: [], firstPageToFetch: 1 };
  }

  const firstPageToFetch = Math.floor(knownCount / 100) + 1;
  return {
    unchanged: false,
    reusablePages: pages.filter(entry => entry.page < firstPageToFetch),
    firstPageToFetch
  };
}

export function planTopicPageRequests({ cachedPages, knownTotalPosts, currentTotalPosts, totalPages }) {
  const pageCount = Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 0;
  const normalizedCache = normalizeRawPages(cachedPages);
  const cacheByPage = new Map(normalizedCache.map(entry => [entry.page, entry]));
  const hasCompleteCache = pageCount > 0 && Array.from({ length: pageCount }, (_, index) => index + 1).every(page => cacheByPage.has(page));
  const refresh = getRefreshPlan({
    cachedPages: normalizedCache,
    knownTotalPosts,
    currentTotalPosts
  });

  if (refresh.unchanged && hasCompleteCache) {
    return {
      unchanged: true,
      reusablePages: normalizedCache.slice(0, pageCount),
      pagesToFetch: []
    };
  }

  const reusablePages = !refresh.unchanged ? refresh.reusablePages : [];
  const firstPage = reusablePages.length ? refresh.firstPageToFetch : 1;
  return {
    unchanged: false,
    reusablePages,
    pagesToFetch: Array.from({ length: Math.max(0, pageCount - firstPage + 1) }, (_, index) => firstPage + index)
  };
}
