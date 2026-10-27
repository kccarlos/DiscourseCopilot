// The agent's window onto Reddit: the same client shape as ForumToolClient
// (forum-tools.mjs), answered from the user's logged-in Reddit session.
// A post plays the part of a topic and its comments the part of replies, so
// the agent's read_topic works unchanged; search_forum and search_comments
// read Reddit's own search pages (the .json search endpoints refuse every
// request now, so the HTML the site renders for its search box is parsed),
// and list_latest uses /new.json. Every URL is built from the run's site URL;
// the model supplies only search text, a subreddit name and a page number.
import { ForumRequestGovernor, FORUM_TOOL_LIMITS, ForumToolError } from './forum-tools.mjs';
import { createRedditFetcher, createRedditApi } from './sites/reddit.mjs';
import { parseCommentSearch, parsePostSearch } from '../shared/reddit-search.mjs';
import { redditIdFromTopicId, topicIdFromRedditId } from '../shared/reddit-page.mjs';
import { fetchWithRateLimitRetry } from '../shared/rate-limit-retry.mjs';
import { normalizeSiteUrl } from '../shared/forum-site.mjs';
import {
  FORUM_RESPONSE_KIND,
  classifyForumResponse,
  forumAccessError,
  isChallengeBody,
  isLoginRedirect,
  readForumResponse
} from '../shared/forum-response.mjs';
import { t } from '../shared/i18n.mjs';

const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{2,21}$/;
const SORTS = new Set(['relevance', 'new', 'top']);
const SEARCH_HEADERS = Object.freeze({ Accept: 'text/html', 'Cache-Control': 'no-cache' });

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function pageNumber(value) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > FORUM_TOOL_LIMITS.maxSearchPage) {
    throw new ForumToolError('INVALID_ARGUMENT', `page must be an integer between 1 and ${FORUM_TOOL_LIMITS.maxSearchPage}`, {
      retryable: false
    });
  }
  return page;
}

function subredditName(value) {
  const name = cleanText(String(value ?? ''), 60).replace(/^\/?r\//i, '');
  if (!name) return '';
  if (!SUBREDDIT_PATTERN.test(name)) {
    throw new ForumToolError('INVALID_ARGUMENT', 'subreddit must be a name like churning (letters, digits, underscore)', {
      retryable: false
    });
  }
  return name;
}

function positiveId(value, fieldName) {
  const normalized = String(value ?? '').trim();
  if (!redditIdFromTopicId(normalized)) {
    throw new ForumToolError('INVALID_ARGUMENT', `${fieldName} must be a positive numeric ID`, { retryable: false });
  }
  return normalized;
}

function oneLine(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Post: title\nURL: ...\nr/sub · u/author · 2026-10-14 17:46 UTC · ..." as written by formatPost().
function postFacts(content) {
  const head = String(content ?? '').split(/\n\n/)[0];
  const title = /^Post: (.*)$/m.exec(head)?.[1] || '';
  const url = /^URL: (\S+)$/m.exec(head)?.[1] || '';
  const when = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)/.exec(head)?.[1] || '';
  const subreddit = /(?:^|\n)(r\/\w+) ·/.exec(head)?.[1] || '';
  return { title, url, when, subreddit };
}

export class RedditToolClient {
  constructor({ siteUrl, fetchImpl, signal, governor = new ForumRequestGovernor(), onEvent = () => {} } = {}) {
    const normalized = normalizeSiteUrl(siteUrl);
    if (!normalized) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A valid forum site URL is required', { retryable: false });
    }
    this.siteUrl = normalized;
    this.fetchImpl = fetchImpl;
    this.signal = signal;
    this.governor = governor;
    this.onEvent = onEvent;
    this.api = createRedditApi({ fetchImpl });
    this.readTopic = createRedditFetcher({ fetchImpl });
    // Whole-thread reads by topic id, shared by getTopic and getRawPage.
    this.threads = new Map();
    // Search result pages by request, so page 3 does not repeat pages 1 and 2.
    this.searches = new Map();
  }

  // Paces the request, reports it, and turns failures into the errors the
  // agent loop understands.
  async call(toolName, run) {
    await this.governor.beforeRequest(this.signal);
    const startedAt = Date.now();
    this.onEvent({ type: 'start', toolName });
    try {
      const result = await run({ signal: this.signal });
      this.onEvent({ type: 'complete', toolName, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      this.onEvent({ type: 'error', toolName, durationMs: Date.now() - startedAt, error: error?.message || String(error) });
      if (error instanceof ForumToolError || error?.name === 'AbortError') {
        throw error;
      }
      const status = Number(error?.status) || 0;
      if (status === 404) {
        throw new ForumToolError('NOT_FOUND', 'Nothing was found for that id or request on Reddit.', { status, retryable: false });
      }
      if (error?.needsUserAction) {
        throw new ForumToolError('USER_ACTION_REQUIRED', error.message, { status, retryable: false, needsUserAction: true });
      }
      throw new ForumToolError(status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR', error?.message || 'The Reddit request failed.', {
        status,
        retryable: status === 429 || status >= 500
      });
    }
  }

  absolute(path) {
    return String(path || '').startsWith('/') ? `${this.siteUrl}${path}` : '';
  }

  // One page of Reddit's search markup; `path` is a site path (query included).
  async fetchSearchHtml(toolName, path) {
    return this.call(toolName, async options => {
      const response = await fetchWithRateLimitRetry(
        `${this.siteUrl}${path}`,
        { credentials: 'include', signal: options.signal, headers: SEARCH_HEADERS },
        this.fetchImpl ? { fetchImpl: this.fetchImpl, signal: options.signal } : { signal: options.signal }
      );
      const snapshot = await readForumResponse(response);
      const ok = snapshot.status >= 200 && snapshot.status < 300;
      if (!ok) {
        const kind = classifyForumResponse(snapshot, this.siteUrl, { expect: 'json' });
        if (kind === FORUM_RESPONSE_KIND.LOGIN_REQUIRED || kind === FORUM_RESPONSE_KIND.CHALLENGE) {
          throw forumAccessError(kind, this.siteUrl, { status: snapshot.status });
        }
        throw Object.assign(new Error(t('forumResponse.httpError', { status: snapshot.status })), { status: snapshot.status });
      }
      // A logged-out session can be sent to the login page or a challenge with status 200.
      if (!snapshot.body.includes('data-testid="search-')) {
        if (isLoginRedirect(snapshot, this.siteUrl)) {
          throw forumAccessError(FORUM_RESPONSE_KIND.LOGIN_REQUIRED, this.siteUrl, { status: snapshot.status });
        }
        if (isChallengeBody(snapshot.body)) {
          throw forumAccessError(FORUM_RESPONSE_KIND.CHALLENGE, this.siteUrl, { status: snapshot.status });
        }
      }
      return snapshot.body;
    });
  }

  // Search pages 1..page for the request, following the cursor each page
  // hands out; returns the requested page's parsed results.
  async search(toolName, { query, subreddit, kind, sort, page }) {
    const key = [kind, subreddit, sort, query].join('\u0000');
    const pages = this.searches.get(key) || [];
    this.searches.set(key, pages);
    const scope = subreddit ? `/svc/shreddit/r/${subreddit}/search/` : '/svc/shreddit/search/';
    const parse = kind === 'comments' ? parseCommentSearch : parsePostSearch;
    while (pages.length < page) {
      const previous = pages[pages.length - 1];
      if (previous && !previous.nextUrl) {
        return { items: [], more: false, page };
      }
      const path = previous?.nextUrl || `${scope}?${new URLSearchParams({ q: query, type: kind, sort }).toString()}`;
      const html = await this.fetchSearchHtml(toolName, path);
      pages.push(parse(html));
    }
    const result = pages[page - 1];
    return { items: result.items, more: Boolean(result.nextUrl), page };
  }

  // Posts matching `query`, in a subreddit when one is given.
  async searchForum({ query, page = 1, subreddit = '', sort = 'relevance', category = '' } = {}) {
    const text = cleanText(query, FORUM_TOOL_LIMITS.maxQueryChars);
    if (!text) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A search query is required', { retryable: false });
    }
    const number = pageNumber(page);
    const sub = subredditName(subreddit || category);
    const order = SORTS.has(sort) ? sort : 'relevance';
    const { items, more } = await this.search('searchForum', { query: text, subreddit: sub, kind: 'posts', sort: order, page: number });
    return {
      query: text,
      page: number,
      more,
      topicSummaries: items.map(post => ({
        topicId: topicIdFromRedditId(post.redditId),
        title: oneLine(post.title) || `Post ${post.redditId}`,
        slug: '',
        url: this.absolute(post.url),
        postsCount: Number.isInteger(post.commentCount) ? post.commentCount + 1 : null,
        lastPostedAt: post.date || '',
        excerpt: oneLine([post.subreddit && `r/${post.subreddit}`, post.author && `u/${post.author}`].filter(Boolean).join(' · '))
      }))
    };
  }

  // Comments matching `query`, each with the post it belongs to.
  async searchComments({ query, page = 1, subreddit = '', sort = 'relevance' } = {}) {
    const text = cleanText(query, FORUM_TOOL_LIMITS.maxQueryChars);
    if (!text) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A search query is required', { retryable: false });
    }
    const number = pageNumber(page);
    const sub = subredditName(subreddit);
    const order = SORTS.has(sort) ? sort : 'relevance';
    const { items, more } = await this.search('searchComments', {
      query: text,
      subreddit: sub,
      kind: 'comments',
      sort: order,
      page: number
    });
    return {
      query: text,
      page: number,
      total: null,
      more,
      comments: items.map(comment => ({
        commentId: comment.commentId,
        postId: topicIdFromRedditId(comment.postRedditId),
        postTitle: oneLine(comment.postTitle) || `Post ${comment.postRedditId}`,
        author: comment.author || '[deleted]',
        date: comment.date || '',
        replyTo: '',
        text: oneLine(comment.text).slice(0, 500)
      }))
    };
  }

  // The newest posts of a subreddit (or of Reddit's front page when none is given).
  async listLatest({ subreddit = '' } = {}) {
    const sub = subredditName(subreddit);
    const data = await this.call('listLatest', options =>
      this.api.requestJson(
        this.siteUrl,
        `${sub ? `/r/${sub}` : ''}/new.json?raw_json=1&limit=${FORUM_TOOL_LIMITS.maxLatestTopics}`,
        options
      )
    );
    const posts = (data?.data?.children || []).map(child => child?.data).filter(post => post?.id);
    return {
      topics: posts
        .map(post => ({
          topicId: topicIdFromRedditId(post.id),
          title: oneLine(post.title) || `Post ${post.id}`,
          slug: '',
          url: post.permalink ? `${this.siteUrl}${post.permalink}` : '',
          postsCount: Number.isInteger(post.num_comments) ? post.num_comments + 1 : null,
          lastPostedAt: Number.isFinite(post.created_utc)
            ? `${new Date(post.created_utc * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`
            : '',
          excerpt: oneLine([post.subreddit_name_prefixed, post.selftext].filter(Boolean).join(' · ')).slice(0, 300)
        }))
        .filter(topic => topic.topicId)
        .slice(0, FORUM_TOOL_LIMITS.maxLatestTopics)
    };
  }

  // The whole post and its comments, read once per run.
  async thread(topicId) {
    const id = positiveId(topicId, 'topicId');
    if (!this.threads.has(id)) {
      const result = await this.call('getTopic', options =>
        this.readTopic(this.siteUrl, id, () => {}, options.signal, { maxPages: FORUM_TOOL_LIMITS.maxRawPage })
      );
      this.threads.set(id, result);
    }
    return this.threads.get(id);
  }

  async getTopic({ topicId } = {}) {
    const id = positiveId(topicId, 'topicId');
    const result = await this.thread(id);
    const facts = postFacts(result.rawPages[0]?.content);
    return {
      topicId: id,
      title: facts.title || `Post ${id}`,
      slug: '',
      url: facts.url,
      postsCount: result.totalPosts,
      totalPages: Math.max(1, result.rawPages.length),
      createdAt: facts.when,
      lastPostedAt: '',
      category: facts.subreddit,
      tags: []
    };
  }

  // Page 1: the post and the first comments; later pages: 100 comments each.
  async getRawPage({ topicId, page = 1, maxChars = FORUM_TOOL_LIMITS.maxRawChars } = {}) {
    const id = positiveId(topicId, 'topicId');
    const number = Number(page ?? 1);
    if (!Number.isInteger(number) || number < 1 || number > FORUM_TOOL_LIMITS.maxRawPage) {
      throw new ForumToolError('INVALID_ARGUMENT', `page must be an integer between 1 and ${FORUM_TOOL_LIMITS.maxRawPage}`, {
        retryable: false
      });
    }
    const keep = Math.max(1, Math.min(FORUM_TOOL_LIMITS.maxRawPageChars, Math.floor(Number(maxChars)) || FORUM_TOOL_LIMITS.maxRawChars));
    const result = await this.thread(id);
    return { topicId: id, page: number, content: cleanText(result.rawPages.find(entry => entry.page === number)?.content || '', keep) };
  }
}
