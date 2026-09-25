// Reads a Discourse topic's raw posts page by page, reusing cached pages
// when the post count shows nothing changed, and reporting progress (with
// rate-limit retries) as it goes.
//
// Page limit: `maxPages` null (the default) reads every page of a topic
// whose size is known. A number reads at most that many raw pages (100 posts
// each), always the first ones. A topic whose size is unknown (no pagination
// metadata) is always capped at MAX_UNKNOWN_TOPIC_PAGES as a safety net.
// Whenever a limit cuts the read short the result says so (`truncated`,
// `coveredPosts` of `totalPosts`); the summary and the progress line report
// it instead of implying every reply was read.
import { calculateFetchProgress, getTopicPagination } from '../shared/fetch-progress.mjs';
import { mapWithConcurrency } from '../shared/bounded-map.mjs';
import { abortableDelay, fetchWithRateLimitRetry, formatRetryDelay, isAbortError } from '../shared/rate-limit-retry.mjs';
import { normalizeRawPages, planTopicPageRequests } from '../shared/topic-session.mjs';
import { buildRawPageUrl, buildTopicJsonUrl } from '../shared/forum-site.mjs';
import { POSTS_PER_RAW_PAGE } from '../shared/preferences.mjs';
import {
  FORUM_RESPONSE_KIND,
  MAX_UNKNOWN_TOPIC_PAGES,
  classifyForumResponse,
  collectRawPages,
  forumAccessError,
  rawPageContent,
  readForumResponse
} from '../shared/forum-response.mjs';

// Forum page-fetch settings (distinct from DiscourseCopilotConstants.API_CONFIG,
// which holds the AI request headers).
export const FORUM_FETCH_CONFIG = Object.freeze({
  REQUEST_DELAY: 1000,
  MAX_CONCURRENT_REQUESTS: 4,
  HEADERS: Object.freeze({
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'no-cache'
  })
});

// The task status line for a fetch progress update.
export function formatFetchTaskStatus(progress) {
  if (progress.rateLimited) {
    const page = progress.retryPage ? ` page ${progress.retryPage}` : '';
    return `Forum rate limit reached. Retrying${page} in ${formatRetryDelay(progress.retryAfterMs)} (retry ${progress.retryAttempt} of ${progress.maxRetries})`;
  }
  if (progress.totalPosts && progress.processedPosts) {
    const read = `Read ${Math.max(0, progress.processedPosts - 1)} of ${Math.max(0, progress.totalPosts - 1)} replies`;
    return progress.truncatedFromPosts ? `${read} (page limit; the topic has ${Math.max(0, progress.truncatedFromPosts - 1)})` : read;
  }
  return `Read response page ${progress.currentPage}`;
}

export function createRateLimitProgress(progress, retry, page = null) {
  return {
    ...progress,
    rateLimited: true,
    retryPage: Number.isInteger(page) ? page : null,
    retryAttempt: retry.retryAttempt,
    maxRetries: retry.maxRetries,
    retryAfterMs: retry.delayMs,
    etaMs: Number.isFinite(progress.etaMs) ? progress.etaMs + retry.delayMs : retry.delayMs
  };
}

export function buildContentResult(rawPages, pagination, extra = {}) {
  return {
    content: rawPages.map(entry => entry.content).join('\n\n'),
    rawPages,
    pagesFetched: rawPages.length,
    totalPosts: pagination?.totalPosts ?? null,
    truncated: false,
    coveredPosts: pagination?.totalPosts ?? null,
    ...extra
  };
}

// A page limit, or null for every page (null, undefined or anything that is
// not a positive whole number: the task snapshot always carries a valid
// limit when the user chose one).
function normalizeMaxPages(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * The part of a known-size topic within the page limit (all of it when
 * `maxPages` is null).
 * @returns {{ totalPages: number, coveredPosts: number, truncated: boolean }}
 */
export function limitTopicPagination(pagination, maxPages) {
  const limit = normalizeMaxPages(maxPages);
  if (limit === null) {
    return { totalPages: pagination.totalPages, truncated: false, coveredPosts: pagination.totalPosts };
  }
  const totalPages = Math.min(pagination.totalPages, limit);
  const truncated = pagination.totalPages > limit;
  return {
    totalPages,
    truncated,
    coveredPosts: truncated
      ? Math.min(pagination.totalPosts, totalPages * (pagination.pageSize || POSTS_PER_RAW_PAGE))
      : pagination.totalPosts
  };
}

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetchImpl] defaults to the global fetch at call time
 * @param {object} [options.config] FORUM_FETCH_CONFIG overrides (tests)
 * @param {(ms: number, signal?: AbortSignal) => Promise<void>} [options.wait]
 */
export function createTopicFetcher({ fetchImpl, config = FORUM_FETCH_CONFIG, wait = abortableDelay } = {}) {
  const retryOptions = extra => (fetchImpl ? { fetchImpl, ...extra } : extra);

  // Returns pagination, or null when the topic size is genuinely unknown
  // (network error, server error, or JSON without post counts). Access
  // failures throw a user-actionable error instead of falling back.
  async function fetchTopicPagination(siteUrl, postId, signal, onProgress) {
    let snapshot;
    try {
      const response = await fetchWithRateLimitRetry(
        buildTopicJsonUrl(siteUrl, postId),
        {
          credentials: 'include',
          signal,
          headers: {
            ...config.HEADERS,
            Accept: 'application/json'
          }
        },
        retryOptions({
          signal,
          onRetry: retry =>
            onProgress?.(
              createRateLimitProgress(
                {
                  currentPage: 0,
                  totalPages: null,
                  totalPosts: null,
                  processedPosts: null,
                  percent: null,
                  etaMs: null
                },
                retry
              )
            )
        })
      );
      snapshot = await readForumResponse(response);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      console.warn('Background: Unable to determine topic size:', error);
      return null;
    }

    const kind = classifyForumResponse(snapshot, siteUrl, { expect: 'json' });
    if (kind === FORUM_RESPONSE_KIND.LOGIN_REQUIRED || kind === FORUM_RESPONSE_KIND.CHALLENGE || kind === FORUM_RESPONSE_KIND.NOT_FOUND) {
      throw forumAccessError(kind, siteUrl, { status: snapshot.status });
    }
    if (kind !== FORUM_RESPONSE_KIND.OK) {
      console.warn(`Background: Unable to determine topic size (HTTP ${snapshot.status})`);
      return null;
    }
    try {
      return getTopicPagination(JSON.parse(snapshot.body));
    } catch {
      return null;
    }
  }

  async function fetchRawPage(siteUrl, postId, page, signal, onRetry) {
    const requestStartedAt = Date.now();
    const response = await fetchWithRateLimitRetry(
      buildRawPageUrl(siteUrl, postId, page),
      {
        credentials: 'include',
        signal,
        headers: config.HEADERS
      },
      retryOptions({ signal, onRetry })
    );

    return {
      page,
      content: rawPageContent(await readForumResponse(response), siteUrl),
      requestMs: Date.now() - requestStartedAt
    };
  }

  async function fetchKnownTopicPages({ siteUrl, postId, pagination, cachedPages, knownTotalPosts, maxPages, onProgress, signal }) {
    const limited = limitTopicPagination(pagination, maxPages);
    // Post counts are compared within the limit: replies added past it don't
    // change what is read, so they don't trigger a re-read either.
    const withinLimit = count => (Number.isInteger(count) && count > 0 ? Math.min(count, limited.coveredPosts) : count);
    const requestPlan = planTopicPageRequests({
      cachedPages: normalizeRawPages(cachedPages),
      knownTotalPosts: withinLimit(knownTotalPosts),
      currentTotalPosts: limited.coveredPosts,
      totalPages: limited.totalPages
    });
    const coverage = {
      truncated: limited.truncated,
      coveredPosts: limited.coveredPosts
    };
    const progressAt = (currentPage, averageRequestMs) => ({
      ...calculateFetchProgress({
        currentPage,
        totalPages: limited.totalPages,
        totalPosts: limited.coveredPosts,
        pageSize: pagination.pageSize,
        averageRequestMs,
        concurrency: config.MAX_CONCURRENT_REQUESTS
      }),
      ...(limited.truncated ? { truncatedFromPosts: pagination.totalPosts } : {})
    });

    if (requestPlan.unchanged) {
      onProgress(progressAt(limited.totalPages, 0));
      return buildContentResult(requestPlan.reusablePages, pagination, {
        ...coverage,
        unchanged: true,
        newPosts: 0,
        networkPagesFetched: 0
      });
    }

    const reusablePages = requestPlan.reusablePages;
    let completedPages = reusablePages.length;
    let completedRequestMs = 0;
    let networkPagesFetched = 0;

    const fetchedPages = await mapWithConcurrency(requestPlan.pagesToFetch, config.MAX_CONCURRENT_REQUESTS, async page => {
      const result = await fetchRawPage(siteUrl, postId, page, signal, retry => {
        const progress = progressAt(completedPages, networkPagesFetched ? completedRequestMs / networkPagesFetched : 0);
        onProgress(createRateLimitProgress(progress, retry, page));
      });
      completedPages++;
      networkPagesFetched++;
      completedRequestMs += result.requestMs;
      onProgress(progressAt(completedPages, completedRequestMs / networkPagesFetched));
      return { page: result.page, content: result.content };
    });

    return buildContentResult(normalizeRawPages([...reusablePages, ...fetchedPages]), pagination, {
      ...coverage,
      unchanged: false,
      // New posts that were actually read (within the page limit).
      newPosts: Number.isInteger(knownTotalPosts) ? Math.max(0, limited.coveredPosts - withinLimit(knownTotalPosts)) : null,
      networkPagesFetched
    });
  }

  async function fetchUnknownTopicPages(siteUrl, postId, onProgress, signal, maxPages) {
    // The safety cap applies even when every page is requested.
    const limit = normalizeMaxPages(maxPages);
    const pageLimit = limit === null ? MAX_UNKNOWN_TOPIC_PAGES : Math.min(limit, MAX_UNKNOWN_TOPIC_PAGES);
    let totalRequestMs = 0;
    let pagesRead = 0;
    const progressAt = averageRequestMs =>
      calculateFetchProgress({
        currentPage: pagesRead,
        totalPages: null,
        totalPosts: null,
        pageSize: null,
        averageRequestMs,
        requestDelayMs: config.REQUEST_DELAY
      });

    try {
      const { rawPages, truncated } = await collectRawPages({
        maxPages: pageLimit,
        fetchPage: async page => {
          const result = await fetchRawPage(siteUrl, postId, page, signal, retry => {
            onProgress(createRateLimitProgress(progressAt(pagesRead ? totalRequestMs / pagesRead : 0), retry, page));
          });
          totalRequestMs += result.requestMs;
          return result.content;
        },
        onPage: pages => {
          pagesRead = pages.length;
          onProgress(progressAt(totalRequestMs / pagesRead));
        },
        betweenPages: () => wait(config.REQUEST_DELAY, signal)
      });

      if (truncated) {
        console.warn(`Background: Stopped reading topic ${postId} after ${pageLimit} pages`);
      }
      return buildContentResult(rawPages, null, {
        // The topic's size is unknown: it may continue past the last page read.
        truncated,
        coveredPosts: null,
        unchanged: false,
        newPosts: null,
        networkPagesFetched: rawPages.length
      });
    } catch (error) {
      console.error(`Background: Error fetching raw pages for post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * @param {object} [options]
   * @param {number|null} [options.maxPages] page limit (the task's
   *   topicPageLimit); null or omitted reads every page
   * @returns {Promise<{content: string, rawPages: Array, pagesFetched: number,
   *   totalPosts: number|null, truncated: boolean, coveredPosts: number|null,
   *   unchanged: boolean, newPosts: number|null, networkPagesFetched: number}>}
   */
  return async function fetchTopicContent(
    siteUrl,
    postId,
    onProgress = () => {},
    signal,
    { cachedPages = [], knownTotalPosts = null, maxPages } = {}
  ) {
    if (!postId) {
      throw new Error('Post ID is required');
    }
    // Validate before any request so a bad identity never reaches the network.
    buildTopicJsonUrl(siteUrl, postId);

    const pagination = await fetchTopicPagination(siteUrl, postId, signal, onProgress);
    if (pagination) {
      return fetchKnownTopicPages({
        siteUrl,
        postId,
        pagination,
        cachedPages,
        knownTotalPosts,
        maxPages,
        onProgress,
        signal
      });
    }
    return fetchUnknownTopicPages(siteUrl, postId, onProgress, signal, maxPages);
  };
}
