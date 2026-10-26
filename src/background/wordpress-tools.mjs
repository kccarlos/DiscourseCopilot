// The agent's window onto a WordPress site: the same client shape as
// ForumToolClient (forum-tools.mjs), answered from the public REST API. A post
// plays the part of a topic and its comments the part of replies, so the
// agent's read_topic and search_forum tools work unchanged; searchComments is
// the one tool a WordPress site adds. Every URL is built from the run's site
// URL; the model only supplies search text, ids and dates.
import { ForumRequestGovernor, FORUM_TOOL_LIMITS, ForumToolError } from './forum-tools.mjs';
import {
  COMMENTS_PER_PAGE,
  createWordPressApi,
  formatArticle,
  formatComment,
  joinBlocks,
  oneLine,
  restUrl,
  timestamp
} from './sites/wordpress.mjs';
import { normalizeSiteUrl } from '../shared/forum-site.mjs';
import { decodeEntities, htmlToText } from '../shared/html-text.mjs';

const LIST_FIELDS = 'id,title,link,date_gmt,excerpt';
const POSTS_PER_SEARCH = 20;
const COMMENTS_PER_SEARCH = 10;
const EXCERPT_CHARS = 300;
const COMMENT_SNIPPET_CHARS = 500;

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function positiveId(value, fieldName) {
  const normalized = String(value ?? '').trim();
  if (!/^[1-9]\d{0,11}$/.test(normalized)) {
    throw new ForumToolError('INVALID_ARGUMENT', `${fieldName} must be a positive numeric ID`, { retryable: false });
  }
  return normalized;
}

// "2026-03-01" -> the start of that day, the form the REST filters take.
function dateFilter(value, name) {
  const text = cleanText(String(value ?? ''), 40);
  if (!text) {
    return '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match || Number.isNaN(Date.parse(`${match[0]}T00:00:00Z`))) {
    throw new ForumToolError('INVALID_ARGUMENT', `${name} must be a date like 2026-03-01`, { retryable: false });
  }
  return `${match[0]}T00:00:00`;
}

function summarizePosts(posts) {
  return (Array.isArray(posts) ? posts : [])
    .map(post => {
      const topicId = String(post?.id ?? '');
      if (!/^[1-9]\d*$/.test(topicId)) {
        return null;
      }
      return {
        topicId,
        title: oneLine(post.title?.rendered) || `Post ${topicId}`,
        slug: '',
        url: cleanText(post.link, 600),
        postsCount: null,
        lastPostedAt: timestamp(post.date_gmt),
        excerpt: htmlToText(post.excerpt?.rendered).replace(/\s+/g, ' ').slice(0, EXCERPT_CHARS)
      };
    })
    .filter(Boolean);
}

export class WordPressToolClient {
  constructor({ siteUrl, fetchImpl, signal, governor = new ForumRequestGovernor(), onEvent = () => {} } = {}) {
    const normalized = normalizeSiteUrl(siteUrl);
    if (!normalized) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A valid forum site URL is required', { retryable: false });
    }
    this.siteUrl = normalized;
    this.signal = signal;
    this.governor = governor;
    this.onEvent = onEvent;
    this.api = createWordPressApi({ fetchImpl });
    // Articles read for getTopic, reused by the page-1 read that follows.
    this.articles = new Map();
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
      if (error?.needsUserAction) {
        throw new ForumToolError('USER_ACTION_REQUIRED', error.message, { status, retryable: false, needsUserAction: true });
      }
      throw new ForumToolError(status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR', error?.message || 'The site request failed.', {
        status,
        retryable: status === 429 || status >= 500
      });
    }
  }

  get(toolName, path, params, { allowNotFound = false } = {}) {
    return this.call(toolName, options =>
      this.api.requestJson(this.siteUrl, restUrl(this.siteUrl, path, params), { ...options, allowNotFound })
    );
  }

  // The id of the category a name or slug refers to.
  async categoryId(name) {
    const wanted = cleanText(name, 80);
    const { data } = await this.get('searchForum', '/wp/v2/categories', { search: wanted, per_page: 10, _fields: 'id,name,slug' });
    const categories = Array.isArray(data) ? data : [];
    const lower = wanted.toLowerCase();
    const match =
      categories.find(c => decodeEntities(c.name).toLowerCase() === lower || String(c.slug).toLowerCase() === lower) || categories[0];
    if (!match) {
      throw new ForumToolError('INVALID_ARGUMENT', `No category matches "${wanted}". Search without category, or try another name.`, {
        retryable: false
      });
    }
    return String(match.id);
  }

  // Posts matching `query`, optionally within a category and a date range.
  async searchForum({ query, page = 1, category = '', after = '', before = '' } = {}) {
    const text = cleanText(query, FORUM_TOOL_LIMITS.maxQueryChars);
    if (!text) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A search query is required', { retryable: false });
    }
    const pageNumber = Number(page ?? 1);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > FORUM_TOOL_LIMITS.maxSearchPage) {
      throw new ForumToolError('INVALID_ARGUMENT', `page must be an integer between 1 and ${FORUM_TOOL_LIMITS.maxSearchPage}`, {
        retryable: false
      });
    }
    const params = { search: text, per_page: POSTS_PER_SEARCH, page: pageNumber, _fields: LIST_FIELDS };
    const afterDate = dateFilter(after, 'after');
    const beforeDate = dateFilter(before, 'before');
    if (afterDate) params.after = afterDate;
    if (beforeDate) params.before = beforeDate;
    if (cleanText(category, 80)) params.categories = await this.categoryId(category);
    const { data, totalPages } = await this.get('searchForum', '/wp/v2/posts', params);
    return { query: text, page: pageNumber, more: totalPages !== null && pageNumber < totalPages, topicSummaries: summarizePosts(data) };
  }

  // Comments matching `query`, newest first, each with the post it belongs
  // to. The site's comment search is slow (seconds), so few come back.
  async searchComments({ query, page = 1, after = '', before = '' } = {}) {
    const text = cleanText(query, FORUM_TOOL_LIMITS.maxQueryChars);
    if (!text) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A search query is required', { retryable: false });
    }
    const pageNumber = Number(page ?? 1);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > FORUM_TOOL_LIMITS.maxSearchPage) {
      throw new ForumToolError('INVALID_ARGUMENT', `page must be an integer between 1 and ${FORUM_TOOL_LIMITS.maxSearchPage}`, {
        retryable: false
      });
    }
    const params = {
      search: text,
      per_page: COMMENTS_PER_SEARCH,
      page: pageNumber,
      order: 'desc',
      orderby: 'date_gmt',
      _fields: 'id,post,parent,author_name,date_gmt,content'
    };
    const afterDate = dateFilter(after, 'after');
    const beforeDate = dateFilter(before, 'before');
    if (afterDate) params.after = afterDate;
    if (beforeDate) params.before = beforeDate;
    const { data, total, totalPages } = await this.get('searchComments', '/wp/v2/comments', params);
    const found = (Array.isArray(data) ? data : []).filter(comment => Number.isInteger(comment?.id) && Number.isInteger(comment?.post));

    // Comments only carry their post's id; one request names the posts.
    const postIds = [...new Set(found.map(comment => comment.post))];
    const titles = new Map();
    if (postIds.length) {
      const posts = await this.get('searchComments', '/wp/v2/posts', {
        include: postIds.join(','),
        per_page: postIds.length,
        _fields: 'id,title'
      });
      for (const post of Array.isArray(posts.data) ? posts.data : []) {
        titles.set(post.id, oneLine(post.title?.rendered));
      }
    }
    return {
      query: text,
      page: pageNumber,
      total,
      more: totalPages !== null && pageNumber < totalPages,
      comments: found.map(comment => ({
        commentId: String(comment.id),
        postId: String(comment.post),
        postTitle: titles.get(comment.post) || `Post ${comment.post}`,
        author: oneLine(comment.author_name) || 'anonymous',
        date: timestamp(comment.date_gmt),
        replyTo: Number.isInteger(comment.parent) && comment.parent > 0 ? String(comment.parent) : '',
        text: htmlToText(comment.content?.rendered).replace(/\s+/g, ' ').slice(0, COMMENT_SNIPPET_CHARS)
      }))
    };
  }

  // The newest posts (about 30).
  async listLatest() {
    const { data } = await this.get('listLatest', '/wp/v2/posts', {
      per_page: FORUM_TOOL_LIMITS.maxLatestTopics,
      orderby: 'date',
      order: 'desc',
      _fields: LIST_FIELDS
    });
    return { topics: summarizePosts(data).slice(0, FORUM_TOOL_LIMITS.maxLatestTopics) };
  }

  async article(topicId) {
    const id = positiveId(topicId, 'topicId');
    if (!this.articles.has(id)) {
      this.articles.set(id, await this.call('getTopic', options => this.api.fetchArticle(this.siteUrl, id, options)));
    }
    return this.articles.get(id);
  }

  // A post's facts. `postsCount` is the article plus its comments; the post's
  // pages are the comment pages (page 1 also carries the article).
  async getTopic({ topicId } = {}) {
    const id = positiveId(topicId, 'topicId');
    const article = await this.article(id);
    const { total } = await this.get('getTopic', '/wp/v2/comments', { post: id, per_page: 1, _fields: 'id' });
    const comments = total ?? 0;
    return {
      topicId: id,
      title: oneLine(article.title?.rendered) || `Post ${id}`,
      slug: '',
      url: cleanText(article.link, 600),
      postsCount: comments + 1,
      totalPages: Math.max(1, Math.ceil(comments / COMMENTS_PER_PAGE)),
      createdAt: timestamp(article.date_gmt),
      lastPostedAt: timestamp(article.modified_gmt),
      category: '',
      tags: []
    };
  }

  // Page 1: the article and the first 100 comments; later pages: 100 comments each.
  async getRawPage({ topicId, page = 1, maxChars = FORUM_TOOL_LIMITS.maxRawChars } = {}) {
    const id = positiveId(topicId, 'topicId');
    const pageNumber = Number(page ?? 1);
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > FORUM_TOOL_LIMITS.maxRawPage) {
      throw new ForumToolError('INVALID_ARGUMENT', `page must be an integer between 1 and ${FORUM_TOOL_LIMITS.maxRawPage}`, {
        retryable: false
      });
    }
    const keep = Math.max(1, Math.min(FORUM_TOOL_LIMITS.maxRawPageChars, Math.floor(Number(maxChars)) || FORUM_TOOL_LIMITS.maxRawChars));
    const blocks = [];
    if (pageNumber === 1) {
      blocks.push(formatArticle(await this.article(id)));
    }
    let comments = [];
    try {
      comments = (await this.call('getRawPage', options => this.api.fetchCommentPage(this.siteUrl, id, pageNumber, options))).comments;
    } catch (error) {
      // WordPress answers 400 for a page past the last one.
      if (!(pageNumber > 1 && error?.status === 400)) {
        throw error;
      }
    }
    blocks.push(...comments.map(formatComment));
    return { topicId: id, page: pageNumber, content: cleanText(blocks.length ? joinBlocks(blocks) : '', keep) };
  }
}
