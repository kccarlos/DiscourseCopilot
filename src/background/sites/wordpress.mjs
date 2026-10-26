// The WordPress site adapter: reads a post or page and its comments through
// WordPress's public REST API (/wp-json/wp/v2), so it works on any WordPress
// site that leaves the comments endpoint open (Doctor of Credit does).
//
// A post is read like a topic: the article is the opening post and the
// comments are the replies, 100 to a page, oldest first. Page 1 holds the
// article followed by the first 100 comments, so the page numbers, the 100
// per page and the "replies = posts - 1" arithmetic the rest of the
// extension relies on all hold. The text is shaped like Discourse's: one
// block per post, blocks separated by blank lines (ai-errors.mjs splits the
// opening post from the replies on three newlines).
import { calculateFetchProgress } from '../../shared/fetch-progress.mjs';
import { mapWithConcurrency } from '../../shared/bounded-map.mjs';
import { fetchWithRateLimitRetry } from '../../shared/rate-limit-retry.mjs';
import { normalizeRawPages } from '../../shared/topic-session.mjs';
import { normalizeSiteUrl } from '../../shared/forum-site.mjs';
import { FORUM_RESPONSE_KIND, classifyForumResponse, forumAccessError, readForumResponse } from '../../shared/forum-response.mjs';
import { decodeEntities, htmlToText } from '../../shared/html-text.mjs';
import { SITE_TYPE } from '../../shared/site-types.mjs';
import { t } from '../../shared/i18n.mjs';
import { buildContentResult, createRateLimitProgress } from '../topic-fetcher.mjs';

export const WORDPRESS_SITE_TYPE = SITE_TYPE.WORDPRESS;

// WordPress caps per_page at 100 on every collection.
export const COMMENTS_PER_PAGE = 100;

export const WORDPRESS_FETCH_CONFIG = Object.freeze({
  MAX_CONCURRENT_REQUESTS: 2,
  HEADERS: Object.freeze({
    Accept: 'application/json',
    'Cache-Control': 'no-cache'
  })
});

const POST_ID_PATTERN = /^[1-9]\d{0,11}$/;
const ARTICLE_FIELDS = 'id,title,link,date_gmt,modified_gmt,content';
const COMMENT_FIELDS = 'id,parent,author_name,date_gmt,content';
const UPDATED_LINE = /^Updated: (.+)$/m;

function requireSiteUrl(siteUrl) {
  const normalized = normalizeSiteUrl(siteUrl);
  if (!normalized) {
    throw new Error('A valid site URL is required');
  }
  return normalized;
}

function requirePostId(postId) {
  const id = String(postId ?? '').trim();
  if (!POST_ID_PATTERN.test(id)) {
    throw new Error('A valid WordPress post ID is required');
  }
  return id;
}

function restUrl(siteUrl, path, params = {}) {
  const url = new URL(`${siteUrl}/wp-json${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

// "2026-05-14T17:02:05" (GMT) -> "2026-05-14 17:02 UTC"
function timestamp(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(value || ''));
  return match ? `${match[1]} ${match[2]} UTC` : '';
}

function oneLine(value) {
  return decodeEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The article as the opening post. `Updated:` lets a later read tell it changed. */
export function formatArticle(article) {
  const header = [
    `Article: ${oneLine(article.title?.rendered) || '(untitled)'}`,
    article.link ? `URL: ${article.link}` : '',
    timestamp(article.date_gmt) ? `Published: ${timestamp(article.date_gmt)}` : '',
    `Updated: ${timestamp(article.modified_gmt) || 'unknown'}`
  ]
    .filter(Boolean)
    .join('\n');
  return `${header}\n\n${htmlToText(article.content?.rendered) || '(no text)'}`;
}

/** One comment as a reply. Replies name the comment they answer by its id. */
export function formatComment(comment) {
  const author = oneLine(comment.author_name) || 'anonymous';
  const when = timestamp(comment.date_gmt);
  const replyTo = Number.isInteger(comment.parent) && comment.parent > 0 ? ` · reply to comment ${comment.parent}` : '';
  return `Comment ${comment.id} · ${author}${when ? ` · ${when}` : ''}${replyTo}\n${htmlToText(comment.content?.rendered) || '(no text)'}`;
}

// Blocks are separated by two blank lines; a trailing newline keeps the next
// page's first block apart when pages are joined with a blank line.
function joinBlocks(blocks) {
  return `${blocks.join('\n\n\n')}\n`;
}

export function createWordPressFetcher({ fetchImpl, config = WORDPRESS_FETCH_CONFIG } = {}) {
  const retryOptions = extra => (fetchImpl ? { fetchImpl, ...extra } : extra);

  // One REST GET. Access problems (login, a challenge page, a missing post)
  // throw the same user-actionable errors as the Discourse reader.
  async function requestJson(siteUrl, url, { signal, onRetry, allowNotFound = false }) {
    const requestStartedAt = Date.now();
    const response = await fetchWithRateLimitRetry(
      url,
      { credentials: 'include', signal, headers: config.HEADERS },
      retryOptions({ signal, onRetry })
    );
    const headers = response.headers;
    const snapshot = await readForumResponse(response);
    const kind = classifyForumResponse(snapshot, siteUrl, { expect: 'json' });
    if (kind === FORUM_RESPONSE_KIND.NOT_FOUND && allowNotFound) {
      return null;
    }
    if (kind === FORUM_RESPONSE_KIND.LOGIN_REQUIRED || kind === FORUM_RESPONSE_KIND.CHALLENGE || kind === FORUM_RESPONSE_KIND.NOT_FOUND) {
      throw forumAccessError(kind, siteUrl, { status: snapshot.status });
    }
    if (kind === FORUM_RESPONSE_KIND.HTTP_ERROR) {
      throw Object.assign(new Error(t('forumResponse.httpError', { status: snapshot.status })), { status: snapshot.status });
    }
    let data = [];
    if (kind === FORUM_RESPONSE_KIND.OK) {
      try {
        data = JSON.parse(snapshot.body);
      } catch {
        throw new Error(t('forumResponse.httpError', { status: snapshot.status }));
      }
    }
    const count = name => {
      const value = Number(headers?.get?.(name));
      return Number.isInteger(value) && value >= 0 ? value : null;
    };
    return { data, total: count('X-WP-Total'), totalPages: count('X-WP-TotalPages'), requestMs: Date.now() - requestStartedAt };
  }

  // A post, or (for a WordPress "page") the page with that id.
  async function fetchArticle(siteUrl, postId, options) {
    const fields = { _fields: ARTICLE_FIELDS };
    const post = await requestJson(siteUrl, restUrl(siteUrl, `/wp/v2/posts/${postId}`, fields), { ...options, allowNotFound: true });
    if (post) {
      return post.data;
    }
    return (await requestJson(siteUrl, restUrl(siteUrl, `/wp/v2/pages/${postId}`, fields), options)).data;
  }

  async function fetchCommentPage(siteUrl, postId, page, options) {
    const result = await requestJson(
      siteUrl,
      restUrl(siteUrl, '/wp/v2/comments', {
        post: postId,
        per_page: COMMENTS_PER_PAGE,
        page,
        order: 'asc',
        orderby: 'date_gmt',
        _fields: COMMENT_FIELDS
      }),
      options
    );
    return { ...result, comments: Array.isArray(result.data) ? result.data : [] };
  }

  /**
   * Same contract as the Discourse adapter's fetchTopicContent. `postId` is the
   * WordPress post id; `knownTotalPosts` and the result's `totalPosts` count
   * the article plus its comments.
   */
  return async function fetchTopicContent(
    siteUrl,
    postId,
    onProgress = () => {},
    signal,
    { cachedPages = [], knownTotalPosts = null, maxPages } = {}
  ) {
    const site = requireSiteUrl(siteUrl);
    const id = requirePostId(postId);
    const limit = Number.isInteger(Number(maxPages)) && Number(maxPages) > 0 ? Number(maxPages) : null;
    const retryProgress = retry =>
      onProgress(
        createRateLimitProgress(
          { currentPage: 0, totalPages: null, totalPosts: null, processedPosts: null, percent: null, etaMs: null },
          retry
        )
      );

    // The article and the first comment page are always read: the first holds
    // the article's edit time (posts here are updated in place), the second
    // the comment count that sizes everything else.
    const [article, first] = await Promise.all([
      fetchArticle(site, id, { signal, onRetry: retryProgress }),
      fetchCommentPage(site, id, 1, { signal, onRetry: retryProgress })
    ]);

    const totalComments = first.total ?? first.comments.length;
    const commentPages = Math.max(1, first.totalPages ?? Math.ceil(totalComments / COMMENTS_PER_PAGE));
    const pagesToRead = limit === null ? commentPages : Math.min(commentPages, limit);
    const truncated = commentPages > pagesToRead;
    const coveredComments = truncated ? Math.min(totalComments, pagesToRead * COMMENTS_PER_PAGE) : totalComments;
    const totalPosts = totalComments + 1;
    const coveredPosts = coveredComments + 1;

    // Under a page limit the counts are compared within it, like topic reads:
    // comments past the limit neither change what is read nor trigger a
    // re-read. Without one, fewer comments than before means deletions.
    const cached = normalizeRawPages(cachedPages);
    const cachedByPage = new Map(cached.map(entry => [entry.page, entry]));
    const knownComments = Number.isInteger(knownTotalPosts) && knownTotalPosts >= 1 ? knownTotalPosts - 1 : null;
    const knownCovered = knownComments === null ? null : truncated ? Math.min(knownComments, coveredComments) : knownComments;
    const articleUnchanged = UPDATED_LINE.exec(cachedByPage.get(1)?.content ?? '')?.[1] === (timestamp(article.modified_gmt) || 'unknown');
    const haveEveryPage = Array.from({ length: pagesToRead }, (_, index) => cachedByPage.has(index + 1)).every(Boolean);
    const unchanged = knownCovered === coveredComments && articleUnchanged && haveEveryPage;

    const pageOne = { page: 1, content: joinBlocks([formatArticle(article), ...first.comments.map(formatComment)]) };
    const progressAt = (currentPage, averageRequestMs) => ({
      ...calculateFetchProgress({
        currentPage,
        totalPages: pagesToRead,
        totalPosts: coveredPosts,
        pageSize: COMMENTS_PER_PAGE,
        averageRequestMs,
        concurrency: config.MAX_CONCURRENT_REQUESTS
      }),
      ...(truncated ? { truncatedFromPosts: totalPosts } : {})
    });
    const coverage = { truncated, coveredPosts };

    if (unchanged) {
      onProgress(progressAt(pagesToRead, 0));
      return buildContentResult(
        [pageOne, ...cached.filter(entry => entry.page > 1 && entry.page <= pagesToRead)],
        { totalPosts },
        {
          ...coverage,
          unchanged: true,
          newPosts: 0,
          networkPagesFetched: 1
        }
      );
    }

    // Pages that were full last time cannot have gained comments. Page 1 was
    // just read, and a page the cache lacks is read like a new one.
    const firstPageWithNewComments =
      knownCovered !== null && knownCovered <= coveredComments ? Math.floor(knownCovered / COMMENTS_PER_PAGE) + 1 : 1;
    const reusable = [];
    const toFetch = [];
    for (let page = 2; page <= pagesToRead; page++) {
      const entry = cachedByPage.get(page);
      (entry && page < firstPageWithNewComments ? reusable : toFetch).push(page);
    }
    const reusedPages = reusable.map(page => cachedByPage.get(page));

    let completedPages = 1 + reusedPages.length;
    let networkPagesFetched = 1;
    let completedRequestMs = first.requestMs;
    onProgress(progressAt(completedPages, completedRequestMs));
    const fetched = await mapWithConcurrency(toFetch, config.MAX_CONCURRENT_REQUESTS, async page => {
      const result = await fetchCommentPage(site, id, page, {
        signal,
        onRetry: retry =>
          onProgress(createRateLimitProgress(progressAt(completedPages, completedRequestMs / networkPagesFetched), retry, page))
      });
      completedPages++;
      networkPagesFetched++;
      completedRequestMs += result.requestMs;
      onProgress(progressAt(completedPages, completedRequestMs / networkPagesFetched));
      return { page, content: joinBlocks(result.comments.map(formatComment)) };
    });

    return buildContentResult(
      normalizeRawPages([pageOne, ...reusedPages, ...fetched]),
      { totalPosts },
      {
        ...coverage,
        unchanged: false,
        newPosts: knownCovered === null ? null : Math.max(0, coveredComments - knownCovered),
        networkPagesFetched
      }
    );
  };
}

/**
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] replaces fetch (tests)
 */
export function createWordPressSiteAdapter({ fetchImpl } = {}) {
  return Object.freeze({
    type: WORDPRESS_SITE_TYPE,
    label: 'WordPress',
    fetchTopicContent: createWordPressFetcher({ fetchImpl }),
    // The Agent's WordPress tools arrive with their own change; until then a
    // WordPress run is refused where the question is asked (page-context.supportsAgent).
    createToolClient: () => {
      throw Object.assign(new Error('Agent research is not available on WordPress sites yet'), { retryable: false });
    }
  });
}
