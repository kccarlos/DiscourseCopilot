import {
  abortableDelay,
  fetchWithRateLimitRetry,
  parseRetryAfter
} from '../shared/rate-limit-retry.mjs';
import {
  isSameForumUrl,
  normalizeSiteUrl
} from '../shared/forum-site.mjs';
import {
  FORUM_RESPONSE_KIND,
  classifyForumResponse,
  forumAccessMessage,
  readForumResponse
} from '../shared/forum-response.mjs';

export const FORUM_TOOL_LIMITS = Object.freeze({
  maxQueryChars: 240,
  maxSearchPage: 3,
  maxPostIds: 20,
  maxRawPage: 20,
  maxExcerptChars: 5000,
  maxPostChars: 16000,
  maxRawChars: 30000
});

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function positiveId(value, fieldName) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+$/.test(normalized) || Number(normalized) <= 0) {
    throw new ForumToolError(
      'INVALID_ARGUMENT',
      `${fieldName} must be a positive numeric ID`,
      { retryable: false }
    );
  }
  return normalized;
}

function boundedPage(value, fieldName, max) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > max) {
    throw new ForumToolError(
      'INVALID_ARGUMENT',
      `${fieldName} must be an integer between 1 and ${max}`,
      { retryable: false }
    );
  }
  return page;
}

function requireSiteUrl(siteUrl) {
  const normalized = normalizeSiteUrl(siteUrl);
  if (!normalized) {
    throw new ForumToolError(
      'INVALID_ARGUMENT',
      'A valid forum site URL is required',
      { retryable: false }
    );
  }
  return normalized;
}

// Paths are appended to the site URL so subfolder installs keep their base
// path; `new URL('/path', origin)` would drop it.
function requestUrl(siteUrl, path, params = {}) {
  const url = new URL(`${requireSiteUrl(siteUrl)}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function topicPath(topicId, slug = '') {
  const normalizedId = positiveId(topicId, 'topicId');
  const normalizedSlug = cleanText(slug, 180)
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-');
  return normalizedSlug
    ? `/t/${encodeURIComponent(normalizedSlug)}/${normalizedId}`
    : `/t/${normalizedId}`;
}

export function buildTopicUrl({ siteUrl, topicId, slug = '', postId = '' } = {}) {
  const url = new URL(`${requireSiteUrl(siteUrl)}${topicPath(topicId, slug)}`);
  const normalizedPostId = postId ? positiveId(postId, 'postId') : '';
  if (normalizedPostId) {
    url.hash = `post_${normalizedPostId}`;
  }
  return url.toString();
}

// Strict: same origin and base path as the forum; no www folding and no
// default forum.
export function isAllowedForumUrl(value, siteUrl) {
  return isSameForumUrl(value, siteUrl);
}

export class ForumToolError extends Error {
  constructor(code, message, {
    status = 0,
    retryable = true,
    needsUserAction = false,
    retryAfterMs = 0
  } = {}) {
    super(message);
    this.name = 'ForumToolError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.needsUserAction = needsUserAction;
    this.retryAfterMs = retryAfterMs;
  }
}

export class ForumRequestGovernor {
  constructor({
    minIntervalMs = 750,
    now = () => Date.now(),
    wait = abortableDelay
  } = {}) {
    this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    this.now = now;
    this.wait = wait;
    this.lastRequestAt = 0;
    this.tail = Promise.resolve();
  }

  async beforeRequest(signal) {
    let release;
    const previous = this.tail;
    this.tail = new Promise(resolve => {
      release = resolve;
    });
    try {
      await previous;
      const elapsed = this.now() - this.lastRequestAt;
      const remaining = Math.max(0, this.minIntervalMs - elapsed);
      if (remaining > 0) {
        await this.wait(remaining, signal);
      }
      this.lastRequestAt = this.now();
    } finally {
      release();
    }
  }
}

function normalizePost(post, fallbackTopicId = '') {
  if (!post || typeof post !== 'object') {
    return null;
  }
  const topicId = String(post.topic_id || fallbackTopicId || '').trim();
  if (!/^\d+$/.test(topicId)) {
    return null;
  }
  const postId = String(post.id || '').trim();
  return {
    postId: /^\d+$/.test(postId) ? postId : '',
    topicId,
    postNumber: Number.isInteger(post.post_number) && post.post_number > 0
      ? post.post_number
      : null,
    topicSlug: cleanText(post.topic_slug, 180),
    topicTitle: cleanText(post.topic_title || post.title, 500),
    username: cleanText(post.username || post.name, 120),
    createdAt: cleanText(post.created_at, 80),
    excerpt: cleanText(post.blurb || post.excerpt || post.cooked || post.raw, FORUM_TOOL_LIMITS.maxExcerptChars),
    text: cleanText(post.raw || post.cooked || post.blurb || post.excerpt, FORUM_TOOL_LIMITS.maxPostChars)
  };
}

function normalizeSearchResponse(data) {
  const posts = Array.isArray(data?.posts)
    ? data.posts.map(post => normalizePost(post)).filter(Boolean)
    : [];
  const topics = Array.isArray(data?.topics)
    ? data.topics.map(topic => normalizePost({
        ...topic,
        topic_id: topic.id || topic.topic_id,
        topic_title: topic.title,
        topic_slug: topic.slug,
        blurb: topic.excerpt || topic.blurb
      })).filter(Boolean)
    : [];
  return {
    more: data?.more_results === true,
    hits: [...posts, ...topics]
  };
}

function normalizeTopic(data, topicId) {
  return {
    topicId,
    title: cleanText(data?.title, 500) || `Discourse topic ${topicId}`,
    slug: cleanText(data?.slug, 180),
    postsCount: Number.isInteger(data?.posts_count) ? data.posts_count : null,
    createdAt: cleanText(data?.created_at, 80),
    lastPostedAt: cleanText(data?.last_posted_at, 80),
    category: cleanText(data?.category_name, 160),
    tags: Array.isArray(data?.tags)
      ? data.tags.map(tag => cleanText(tag, 80)).filter(Boolean).slice(0, 20)
      : []
  };
}

function normalizePostsResponse(data, topicId) {
  const posts = Array.isArray(data?.post_stream?.posts)
    ? data.post_stream.posts
    : Array.isArray(data?.posts)
      ? data.posts
      : [];
  return {
    topicId,
    posts: posts.map(post => normalizePost(post, topicId)).filter(Boolean)
  };
}

export class ForumToolClient {
  constructor({
    siteUrl,
    fetchImpl = globalThis.fetch,
    signal,
    governor = new ForumRequestGovernor(),
    onEvent = () => {}
  } = {}) {
    // Every request URL is built from this site URL; callers (and the model)
    // only ever supply IDs and search text.
    this.siteUrl = requireSiteUrl(siteUrl);
    this.fetchImpl = fetchImpl;
    this.signal = signal;
    this.governor = governor;
    this.onEvent = onEvent;
  }

  async request(toolName, url, { parse = 'json', signal = this.signal } = {}) {
    if (!isAllowedForumUrl(url, this.siteUrl)) {
      throw new ForumToolError(
        'INVALID_URL',
        'Forum tools may only access the authorized forum',
        { retryable: false }
      );
    }
    await this.governor.beforeRequest(signal);
    const startedAt = Date.now();
    this.onEvent({ type: 'start', toolName, url });

    try {
      const response = await fetchWithRateLimitRetry(
        url,
        {
          credentials: 'include',
          signal,
          headers: {
            Accept: parse === 'json' ? 'application/json' : 'text/plain',
            'Cache-Control': 'no-cache'
          }
        },
        {
          fetchImpl: this.fetchImpl,
          signal,
          onRetry: retry => {
            this.onEvent({ type: 'retry', toolName, retry });
          }
        }
      );

      const snapshot = await readForumResponse(response);
      const kind = classifyForumResponse(snapshot, this.siteUrl, { expect: parse });
      if (kind === FORUM_RESPONSE_KIND.LOGIN_REQUIRED || kind === FORUM_RESPONSE_KIND.CHALLENGE) {
        throw new ForumToolError(
          'USER_ACTION_REQUIRED',
          forumAccessMessage(kind, this.siteUrl),
          {
            status: response.status,
            retryable: false,
            needsUserAction: true
          }
        );
      }
      if (!response.ok) {
        const retryAfterMs = parseRetryAfter(
          response.headers?.get?.('Retry-After')
        ) || 0;
        throw new ForumToolError(
          response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
          `Forum request failed with HTTP ${response.status}`,
          {
            status: response.status,
            retryable: response.status === 429 || response.status >= 500,
            retryAfterMs
          }
        );
      }

      let result;
      if (parse === 'json') {
        try {
          result = JSON.parse(snapshot.body);
        } catch {
          throw new ForumToolError(
            'INVALID_RESPONSE',
            'The forum returned an unexpected response.'
          );
        }
      } else {
        result = snapshot.body;
      }
      this.onEvent({
        type: 'complete',
        toolName,
        durationMs: Date.now() - startedAt
      });
      return result;
    } catch (error) {
      this.onEvent({
        type: 'error',
        toolName,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  async searchForum({ query, page = 1 } = {}) {
    const normalizedQuery = cleanText(query, FORUM_TOOL_LIMITS.maxQueryChars);
    if (!normalizedQuery) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A search query is required', {
        retryable: false
      });
    }
    const normalizedPage = boundedPage(page, 'page', FORUM_TOOL_LIMITS.maxSearchPage);
    const data = await this.request(
      'searchForum',
      requestUrl(this.siteUrl, '/search.json', { q: normalizedQuery, page: normalizedPage })
    );
    return {
      query: normalizedQuery,
      page: normalizedPage,
      ...normalizeSearchResponse(data)
    };
  }

  async getTopic({ topicId } = {}) {
    const normalizedTopicId = positiveId(topicId, 'topicId');
    const data = await this.request(
      'getTopic',
      requestUrl(this.siteUrl, `/t/${normalizedTopicId}.json`)
    );
    return normalizeTopic(data, normalizedTopicId);
  }

  async getPosts({ topicId, postIds = [] } = {}) {
    const normalizedTopicId = positiveId(topicId, 'topicId');
    if (
      !Array.isArray(postIds)
      || postIds.length < 1
      || postIds.length > FORUM_TOOL_LIMITS.maxPostIds
    ) {
      throw new ForumToolError(
        'INVALID_ARGUMENT',
        `postIds must contain between 1 and ${FORUM_TOOL_LIMITS.maxPostIds} IDs`,
        { retryable: false }
      );
    }
    const normalizedPostIds = [...new Set(postIds.map(postId => positiveId(postId, 'postId')))];
    const url = new URL(requestUrl(this.siteUrl, `/t/${normalizedTopicId}/posts.json`));
    for (const postId of normalizedPostIds) {
      url.searchParams.append('post_ids[]', postId);
    }
    const data = await this.request('getPosts', url.toString());
    return normalizePostsResponse(data, normalizedTopicId);
  }

  async getRawPage({ topicId, page = 1 } = {}) {
    const normalizedTopicId = positiveId(topicId, 'topicId');
    const normalizedPage = boundedPage(page, 'page', FORUM_TOOL_LIMITS.maxRawPage);
    const content = await this.request(
      'getRawPage',
      requestUrl(this.siteUrl, `/raw/${normalizedTopicId}`, { page: normalizedPage }),
      { parse: 'text' }
    );
    return {
      topicId: normalizedTopicId,
      page: normalizedPage,
      content: cleanText(content, FORUM_TOOL_LIMITS.maxRawChars)
    };
  }
}
