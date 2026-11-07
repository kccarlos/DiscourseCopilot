// The Hacker News site adapter and Agent tool client.
//
// Reads an item page (https://news.ycombinator.com/item?id=<id>) and its
// nested comment table into the same block format as Reddit and WordPress
// (opening Post: block followed by Comment <id> blocks in conversation order,
// separated by \n\n\n, 100 blocks per page). Agent search uses the public
// Algolia HN Search API (hn.algolia.com/api/v1), while list_latest and
// read_topic read news.ycombinator.com directly.
import { calculateFetchProgress } from '../../shared/fetch-progress.mjs';
import { fetchWithRateLimitRetry } from '../../shared/rate-limit-retry.mjs';
import { normalizeRawPages } from '../../shared/topic-session.mjs';
import { normalizeSiteUrl } from '../../shared/forum-site.mjs';
import { FORUM_RESPONSE_KIND, classifyForumResponse, forumAccessError, readForumResponse } from '../../shared/forum-response.mjs';
import { decodeEntities, htmlToText } from '../../shared/html-text.mjs';
import { HACKERNEWS_SITE_URL } from '../../shared/hackernews-page.mjs';
import { SITE_TYPE } from '../../shared/site-types.mjs';
import { t } from '../../shared/i18n.mjs';
import { ForumRequestGovernor, FORUM_TOOL_LIMITS, ForumToolError } from '../forum-tools.mjs';
import { buildContentResult, createRateLimitProgress } from '../topic-fetcher.mjs';

export const HACKERNEWS_SITE_TYPE = SITE_TYPE.HACKERNEWS;
export const BLOCKS_PER_PAGE = 100;
// shortcut: cap item pagination at 10 HTML pages; raise if multi-thousand-comment threads need full history
export const MAX_ITEM_PAGES = 10;

const ALGOLIA_BASE_URL = 'https://hn.algolia.com/api/v1';
const ITEM_ID_PATTERN = /^[1-9]\d{0,11}$/;
const EXPECTED_COMMENTS_LINE = /\b(\d+) comments\b/;
const HN_PAGE_MARKER = /\bid=["']?hnmain["']?|\bclass=["'][^"']*\bathing\b|No such item\./i;
const SORTS = new Set(['relevance', 'new']);

export const HACKERNEWS_FETCH_CONFIG = Object.freeze({
  HTML_HEADERS: Object.freeze({ Accept: 'text/html', 'Cache-Control': 'no-cache' }),
  JSON_HEADERS: Object.freeze({ Accept: 'application/json' })
});

function requireSiteUrl(siteUrl) {
  const normalized = normalizeSiteUrl(siteUrl);
  if (!normalized) {
    throw new Error('A valid site URL is required');
  }
  return normalized;
}

function requireItemId(topicId) {
  const id = String(topicId ?? '').trim();
  if (!ITEM_ID_PATTERN.test(id)) {
    throw new Error('A valid Hacker News item ID is required');
  }
  return id;
}

// "2026-10-14T17:46:05 1792000000" or "2026-10-14T17:46:05Z" -> "2026-10-14 17:46 UTC"
export function timestamp(value) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(raw);
  if (match) {
    return `${match[1]} ${match[2]} UTC`;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
}

export function oneLine(value) {
  return decodeEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function joinBlocks(blocks) {
  return `${blocks.join('\n\n\n')}\n`;
}

export function formatPost(post, siteUrl = HACKERNEWS_SITE_URL) {
  const header = [
    `Post: ${cleanText(post.title) || '(untitled)'}`,
    post.id ? `URL: ${siteUrl}/item?id=${post.id}` : '',
    [
      post.author ? `by ${post.author}` : '',
      Number.isInteger(post.commentCount) ? `${post.commentCount} comments` : '',
      post.when || '',
      Number.isFinite(post.score) ? `score ${post.score}` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    post.link ? `Link: ${post.link}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  return `${header}\n\n${cleanText(post.text) || (post.link ? `Link: ${post.link}` : '(no text)')}`;
}

export function formatComment(comment, parentCommentId = comment?.parentCommentId ?? null) {
  const when = comment.when || '';
  const replyTo = parentCommentId ? ` · reply to comment ${parentCommentId}` : '';
  return `Comment ${comment.id} · ${comment.author || '[deleted]'}${when ? ` · ${when}` : ''}${replyTo}\n${cleanText(comment.body) || '(no text)'}`;
}

function extractAge(fragment) {
  const match = /<span\b[^>]*\bclass=["'][^"']*\bage\b[^"']*["']([^>]*)>([\s\S]*?)<\/span>/i.exec(fragment);
  if (!match) return '';
  const titleAttr = /\btitle=["']([^"']+)["']/i.exec(match[1])?.[1] || '';
  return timestamp(titleAttr) || oneLine(match[2].replace(/<[^>]*>/g, ''));
}

function extractCommtext(fragment) {
  const commtextOpen = /<(?:div|span)\b[^>]*\bclass=["'][^"']*\bcommtext\b[^"']*["'][^>]*>/i.exec(fragment);
  if (!commtextOpen) return '';
  const bodyStart = commtextOpen.index + commtextOpen[0].length;
  const tdEnd = fragment.indexOf('</td>', bodyStart);
  const rawBody = fragment
    .slice(bodyStart, tdEnd === -1 ? undefined : tdEnd)
    .replace(/<div\b[^>]*\bclass=["'][^"']*\breply\b[^"']*["'][^>]*>[\s\S]*?<\/div\s*>/gi, '');
  return htmlToText(rawBody);
}

function parseStoryBlock(block) {
  const trMatch = /<tr\b(?=[^>]*\bclass=["'][^"']*\bathing\b)(?![^>]*\bcomtr\b)([^>]*)>/i.exec(block);
  if (!trMatch) return null;
  const id = /\bid=["']?(\d+)["']?/i.exec(trMatch[1])?.[1] || '';
  if (!ITEM_ID_PATTERN.test(id)) return null;
  const itemBlock = block.slice(trMatch.index);

  const titlelineMatch = /<span\b[^>]*\bclass=["'][^"']*\btitleline\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(itemBlock);
  const linkMatch = titlelineMatch ? /<a\b([^>]*)>([\s\S]*?)<\/a>/i.exec(titlelineMatch[1]) : null;
  const onstoryMatch = !titlelineMatch
    ? /<span\b[^>]*\bclass=["']?[^"'>]*\bonstory\b[^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i.exec(itemBlock)
    : null;
  const title = linkMatch
    ? oneLine(linkMatch[2].replace(/<[^>]*>/g, ''))
    : onstoryMatch
      ? `Comment on: ${oneLine(onstoryMatch[1].replace(/<[^>]*>/g, ''))}`
      : '';
  const rawHref = linkMatch ? decodeEntities(/\bhref=["']([^"']*)["']/i.exec(linkMatch[1])?.[1] || '').trim() : '';
  const link = /^https?:\/\//i.test(rawHref) ? rawHref : '';

  const subtext = /<td\b[^>]*\bclass=["']?[^"'>]*\bsubtext\b[^"'>]*["']?[^>]*>([\s\S]*?)<\/td>/i.exec(itemBlock)?.[1] || '';
  const scoreMatch = /<span\b[^>]*\bclass=["']?[^"'>]*\bscore\b[^"'>]*["']?[^>]*>\s*(-?\d+)\s+points?\b/i.exec(subtext);
  const score = scoreMatch ? Number(scoreMatch[1]) : null;
  const authorMatch = /<a\b[^>]*\bclass=["'][^"']*\bhnuser\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(itemBlock);
  const author = authorMatch ? oneLine(authorMatch[1].replace(/<[^>]*>/g, '')) : '';
  const when = extractAge(itemBlock);

  const commentsMatch = /(\d+)\s*(?:&nbsp;|\u00a0|\s)*comments?\b/i.exec(subtext);
  const commentCount = commentsMatch ? Number(commentsMatch[1]) : /\bdiscuss\b/i.test(subtext) ? 0 : null;

  const toptextMatch = /<(?:div|td)\b[^>]*\bclass=["'][^"']*\btoptext\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|td)\s*>/i.exec(itemBlock);
  const text = toptextMatch ? htmlToText(toptextMatch[1]) : extractCommtext(itemBlock);

  return { id, title, link, score, author, when, commentCount, text };
}

function nextMorelinkPath(html, itemId = '') {
  for (const match of String(html ?? '').matchAll(/<a\b(?=[^>]*\bclass=["'][^"']*\bmorelink\b)[^>]*>/gi)) {
    const rawHref = decodeEntities(/\bhref=["']([^"']*)["']/i.exec(match[0])?.[1] || '').trim();
    if (!rawHref) continue;
    const normalized = rawHref.startsWith('/') ? rawHref : `/${rawHref}`;
    if (!itemId || new RegExp(`^/item\\?id=${itemId}&p=\\d+$`).test(normalized)) {
      return normalized;
    }
  }
  return '';
}

/**
 * Parses a Hacker News `/item?id=<id>` HTML page into the opening story,
 * the comments on that page (with `parentCommentId` reconstructed from
 * `td.ind[indent]`), and an optional `nextPath` (`morelink`).
 */
export function parseItemPage(html, indentStack = []) {
  const source = String(html ?? '');
  if (/^\s*No such item\.\s*$/i.test(source) || />No such item\.</i.test(source)) {
    return { post: null, comments: [], nextPath: '' };
  }
  const commentTreeAt = source.search(/<table\b[^>]*\bclass=["'][^"']*\bcomment-tree\b/i);
  const firstComtrAt = source.search(/<tr\b(?=[^>]*\bclass=["'][^"']*\bcomtr\b)/i);
  const headerEnd = commentTreeAt !== -1 ? commentTreeAt : firstComtrAt !== -1 ? firstComtrAt : source.length;
  const post = parseStoryBlock(source.slice(0, headerEnd));

  const comments = [];
  const comtrRegex = /<tr\b(?=[^>]*\bclass=["'][^"']*\bcomtr\b)([^>]*)>/gi;
  const starts = [];
  for (let match = comtrRegex.exec(source); match !== null; match = comtrRegex.exec(source)) {
    starts.push({ index: match.index, attrs: match[1] });
  }
  for (let i = 0; i < starts.length; i++) {
    const { index, attrs } = starts[i];
    const end = starts[i + 1]?.index ?? source.length;
    const unit = source.slice(index, end);
    const id = /\bid=["']?(\d+)["']?/i.exec(attrs)?.[1] || '';
    if (!ITEM_ID_PATTERN.test(id)) continue;

    const indentAttr = /<td\b[^>]*\bclass=["'][^"']*\bind\b[^"']*["'][^>]*\bindent=["']?(\d+)["']?/i.exec(unit)?.[1];
    const widthAttr =
      indentAttr === undefined
        ? /<td\b[^>]*\bclass=["'][^"']*\bind\b[\s\S]*?<img\b[^>]*\bwidth=["']?(\d+)["']?/i.exec(unit)?.[1]
        : undefined;
    const indent = indentAttr !== undefined ? Number(indentAttr) : widthAttr !== undefined ? Math.round(Number(widthAttr) / 40) : 0;

    const body = extractCommtext(unit);
    if (!body || body === '[dead]' || body === '[flagged]') {
      indentStack.length = indent + 1;
      indentStack[indent] = indent > 0 ? indentStack[indent - 1] || null : null;
      continue;
    }

    const parentCommentId = indent > 0 ? indentStack[indent - 1] || null : null;
    indentStack.length = indent + 1;
    indentStack[indent] = id;

    const authorMatch = /<a\b[^>]*\bclass=["'][^"']*\bhnuser\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(unit);
    const author = authorMatch ? oneLine(authorMatch[1].replace(/<[^>]*>/g, '')) : '';
    const when = extractAge(unit);

    comments.push({
      id,
      author: author || '[deleted]',
      when,
      body,
      indent,
      parentCommentId
    });
  }

  return {
    post,
    comments,
    nextPath: nextMorelinkPath(source, post?.id || '')
  };
}

/** Parses a Hacker News story listing page (`/newest`, `/`, etc.). */
export function parseStoryList(html) {
  const source = String(html ?? '');
  const rowRegex = /<tr\b(?=[^>]*\bclass=["'][^"']*\bathing\b)(?![^>]*\bcomtr\b)[^>]*>/gi;
  const starts = [];
  for (let match = rowRegex.exec(source); match !== null; match = rowRegex.exec(source)) {
    starts.push(match.index);
  }
  const stories = [];
  for (let i = 0; i < starts.length; i++) {
    const block = source.slice(starts[i], starts[i + 1] ?? source.length);
    const story = parseStoryBlock(block);
    if (story?.id && story.title) {
      stories.push(story);
    }
  }
  return { stories, nextPath: nextMorelinkPath(source) };
}

export function createHackerNewsApi({ fetchImpl, config = HACKERNEWS_FETCH_CONFIG } = {}) {
  const retryOptions = extra => (fetchImpl ? { fetchImpl, ...extra } : extra);

  async function requestHtml(siteUrl, path, { signal, onRetry } = {}) {
    const response = await fetchWithRateLimitRetry(
      `${siteUrl}${path}`,
      { credentials: 'include', signal, headers: config.HTML_HEADERS },
      retryOptions({ signal, onRetry })
    );
    const snapshot = await readForumResponse(response);
    const kind = classifyForumResponse(snapshot, siteUrl, { expect: 'html', htmlMarker: HN_PAGE_MARKER });
    if (kind === FORUM_RESPONSE_KIND.LOGIN_REQUIRED || kind === FORUM_RESPONSE_KIND.CHALLENGE || kind === FORUM_RESPONSE_KIND.NOT_FOUND) {
      throw forumAccessError(kind, siteUrl, { status: snapshot.status });
    }
    if (kind !== FORUM_RESPONSE_KIND.OK) {
      throw Object.assign(new Error(t('forumResponse.httpError', { status: snapshot.status })), { status: snapshot.status });
    }
    return snapshot.body;
  }

  async function requestAlgoliaJson(endpoint, params, { signal, onRetry } = {}) {
    const url = new URL(`${ALGOLIA_BASE_URL}/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetchWithRateLimitRetry(
      url.toString(),
      { signal, headers: config.JSON_HEADERS },
      retryOptions({ signal, onRetry })
    );
    const snapshot = await readForumResponse(response);
    const kind = classifyForumResponse(snapshot, ALGOLIA_BASE_URL, { expect: 'json' });
    if (kind === FORUM_RESPONSE_KIND.CHALLENGE) {
      throw forumAccessError(kind, HACKERNEWS_SITE_URL, { status: snapshot.status });
    }
    if (kind !== FORUM_RESPONSE_KIND.OK) {
      throw Object.assign(new Error(t('forumResponse.httpError', { status: snapshot.status })), { status: snapshot.status });
    }
    try {
      return JSON.parse(snapshot.body);
    } catch {
      throw new Error(t('forumResponse.httpError', { status: snapshot.status }));
    }
  }

  return { requestHtml, requestAlgoliaJson };
}

export function createHackerNewsFetcher({ fetchImpl, config = HACKERNEWS_FETCH_CONFIG } = {}) {
  const api = createHackerNewsApi({ fetchImpl, config });

  return async function fetchTopicContent(
    siteUrl,
    topicId,
    onProgress = () => {},
    signal,
    { cachedPages = [], knownTotalPosts = null, maxPages } = {}
  ) {
    const site = requireSiteUrl(siteUrl);
    const itemId = requireItemId(topicId);
    const limit = Number.isInteger(Number(maxPages)) && Number(maxPages) > 0 ? Number(maxPages) : null;
    const startedAt = Date.now();
    let requests = 0;
    let expected = 0;
    const progressFor = (expectedComments, read) =>
      calculateFetchProgress({
        currentPage: read,
        totalPages: Math.max(1, Math.ceil((expectedComments + 1) / BLOCKS_PER_PAGE)),
        totalPosts: expectedComments + 1,
        pageSize: BLOCKS_PER_PAGE,
        averageRequestMs: requests ? (Date.now() - startedAt) / requests : 0,
        concurrency: 1
      });
    const retryProgress = retry => onProgress(createRateLimitProgress(progressFor(expected, 0), retry));
    const options = { signal, onRetry: retryProgress };
    const step = () => {
      requests++;
      onProgress(progressFor(expected, Math.min(requests, Math.max(1, Math.ceil((expected + 1) / BLOCKS_PER_PAGE)))));
    };

    const indentStack = [];
    const firstHtml = await api.requestHtml(site, `/item?id=${itemId}`, options);
    step();
    const firstParsed = parseItemPage(firstHtml, indentStack);
    if (!firstParsed.post) {
      throw Object.assign(new Error(t('forumResponse.postNotFound')), { status: 404, retryable: false });
    }
    const post = firstParsed.post;
    expected = Number.isInteger(post.commentCount) ? post.commentCount : firstParsed.comments.length;

    // Reuse cached pages when the cache is complete and the story's comment count has not changed.
    const cached = normalizeRawPages(cachedPages);
    const cachedByPage = new Map(cached.map(entry => [entry.page, entry]));
    const hasKnownPosts = Number.isInteger(knownTotalPosts) && knownTotalPosts >= 1;
    if (hasKnownPosts && cached.length > 0 && (Number.isInteger(post.commentCount) || !firstParsed.nextPath)) {
      const expectedPages = Math.max(1, Math.ceil(knownTotalPosts / BLOCKS_PER_PAGE));
      const pagesNeeded = limit === null ? expectedPages : Math.min(expectedPages, limit);
      const haveEveryPage = Array.from({ length: pagesNeeded }, (_, index) => cachedByPage.has(index + 1)).every(Boolean);
      const openingHeader = (cachedByPage.get(1)?.content ?? '').split('\n\n')[0] || '';
      const cachedExpectedMatch = EXPECTED_COMMENTS_LINE.exec(openingHeader);
      const cachedExpected = cachedExpectedMatch ? Number(cachedExpectedMatch[1]) : knownTotalPosts - 1;
      const unchangedCount =
        expected === cachedExpected && (Boolean(firstParsed.nextPath) || firstParsed.comments.length + 1 === knownTotalPosts);
      if (haveEveryPage && unchangedCount) {
        const truncated = expectedPages > pagesNeeded;
        const coveredPosts = truncated ? pagesNeeded * BLOCKS_PER_PAGE : knownTotalPosts;
        const reusablePages = cached.filter(entry => entry.page <= pagesNeeded);
        onProgress({
          ...progressFor(Math.max(expected, knownTotalPosts - 1), pagesNeeded),
          ...(truncated ? { truncatedFromPosts: knownTotalPosts } : {})
        });
        return buildContentResult(
          reusablePages,
          { totalPosts: knownTotalPosts },
          {
            truncated,
            coveredPosts,
            unchanged: true,
            newPosts: 0,
            networkPagesFetched: requests
          }
        );
      }
    }

    const allComments = [...firstParsed.comments];
    const seenIds = new Set(allComments.map(c => c.id));
    let nextPath = firstParsed.nextPath;
    while (nextPath && requests < MAX_ITEM_PAGES) {
      const html = await api.requestHtml(site, nextPath, options);
      step();
      const parsed = parseItemPage(html, indentStack);
      for (const comment of parsed.comments) {
        if (!seenIds.has(comment.id)) {
          seenIds.add(comment.id);
          allComments.push(comment);
        }
      }
      nextPath = parsed.nextPath && parsed.nextPath !== nextPath ? parsed.nextPath : '';
    }

    const blocks = [formatPost(post, site), ...allComments.map(comment => formatComment(comment, comment.parentCommentId))];
    const totalPosts = blocks.length;
    const pageCount = Math.max(1, Math.ceil(totalPosts / BLOCKS_PER_PAGE));
    const pagesToKeep = limit === null ? pageCount : Math.min(pageCount, limit);
    const truncated = pageCount > pagesToKeep || Boolean(nextPath);
    const pages = normalizeRawPages(
      Array.from({ length: pagesToKeep }, (_, index) => ({
        page: index + 1,
        content: joinBlocks(blocks.slice(index * BLOCKS_PER_PAGE, (index + 1) * BLOCKS_PER_PAGE))
      }))
    );
    const coveredPosts = pageCount > pagesToKeep ? pagesToKeep * BLOCKS_PER_PAGE : totalPosts;
    onProgress({
      ...progressFor(Math.max(expected, totalPosts - 1), pagesToKeep),
      ...(truncated ? { truncatedFromPosts: Math.max(totalPosts, expected + 1) } : {})
    });

    const previousCovered = hasKnownPosts ? (limit === null ? knownTotalPosts : Math.min(knownTotalPosts, limit * BLOCKS_PER_PAGE)) : null;

    return buildContentResult(
      pages,
      { totalPosts },
      {
        truncated,
        coveredPosts,
        unchanged: false,
        newPosts: previousCovered === null ? null : Math.max(0, coveredPosts - previousCovered),
        networkPagesFetched: requests
      }
    );
  };
}

function pageNumber(value, maxPage = FORUM_TOOL_LIMITS.maxSearchPage) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > maxPage) {
    throw new ForumToolError('INVALID_ARGUMENT', `page must be an integer between 1 and ${maxPage}`, {
      retryable: false
    });
  }
  return page;
}

function positiveId(value, fieldName) {
  const normalized = String(value ?? '').trim();
  if (!ITEM_ID_PATTERN.test(normalized)) {
    throw new ForumToolError('INVALID_ARGUMENT', `${fieldName} must be a positive numeric ID`, { retryable: false });
  }
  return normalized;
}

function postFacts(content) {
  const head = String(content ?? '').split(/\n\n/)[0];
  const title = /^Post: (.*)$/m.exec(head)?.[1] || '';
  const url = /^URL: (\S+)$/m.exec(head)?.[1] || '';
  const when = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC)/.exec(head)?.[1] || '';
  return { title, url, when };
}

export class HackerNewsToolClient {
  constructor({ siteUrl = HACKERNEWS_SITE_URL, fetchImpl, signal, governor = new ForumRequestGovernor(), onEvent = () => {} } = {}) {
    const normalized = normalizeSiteUrl(siteUrl);
    if (!normalized) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A valid forum site URL is required', { retryable: false });
    }
    this.siteUrl = normalized;
    this.fetchImpl = fetchImpl;
    this.signal = signal;
    this.governor = governor;
    this.onEvent = onEvent;
    this.api = createHackerNewsApi({ fetchImpl });
    this.readTopic = createHackerNewsFetcher({ fetchImpl });
    this.threads = new Map();
  }

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
        throw new ForumToolError('NOT_FOUND', 'Nothing was found for that id or request on Hacker News.', { status, retryable: false });
      }
      if (error?.needsUserAction) {
        throw new ForumToolError('USER_ACTION_REQUIRED', error.message, { status, retryable: false, needsUserAction: true });
      }
      throw new ForumToolError(status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR', error?.message || 'The Hacker News request failed.', {
        status,
        retryable: status === 429 || status >= 500
      });
    }
  }

  async algoliaSearch(toolName, { query, page = 1, sort = 'relevance', tags, hitsPerPage }) {
    const text = typeof query === 'string' ? query.trim().slice(0, FORUM_TOOL_LIMITS.maxQueryChars) : '';
    if (!text) {
      throw new ForumToolError('INVALID_ARGUMENT', 'A search query is required', { retryable: false });
    }
    const number = pageNumber(page);
    const endpoint = SORTS.has(sort) && sort === 'new' ? 'search_by_date' : 'search';
    const data = await this.call(toolName, options =>
      this.api.requestAlgoliaJson(endpoint, { query: text, tags, page: number - 1, hitsPerPage }, options)
    );
    const hits = Array.isArray(data?.hits) ? data.hits : [];
    const nbPages = Number(data?.nbPages) || 0;
    return { text, number, more: number < nbPages, hits, total: Number.isInteger(data?.nbHits) ? data.nbHits : null };
  }

  async searchForum({ query, page = 1, sort = 'relevance' } = {}) {
    const { text, number, more, hits } = await this.algoliaSearch('searchForum', {
      query,
      page,
      sort,
      tags: 'story',
      hitsPerPage: 20
    });
    return {
      query: text,
      page: number,
      more,
      topicSummaries: hits
        .map(hit => {
          const topicId = String(hit?.objectID ?? '').trim();
          if (!ITEM_ID_PATTERN.test(topicId)) return null;
          const excerptParts = [
            hit.author && `by ${hit.author}`,
            Number.isFinite(hit.points) && `${hit.points} points`,
            hit.url || '',
            hit.story_text && htmlToText(hit.story_text)
          ].filter(Boolean);
          return {
            topicId,
            title: oneLine(hit.title || hit.story_title) || `Post ${topicId}`,
            slug: '',
            url: `${this.siteUrl}/item?id=${topicId}`,
            postsCount: Number.isInteger(hit.num_comments) ? hit.num_comments + 1 : null,
            lastPostedAt: timestamp(hit.created_at),
            excerpt: oneLine(excerptParts.join(' · ')).slice(0, 300)
          };
        })
        .filter(Boolean)
    };
  }

  async searchComments({ query, page = 1, sort = 'relevance' } = {}) {
    const { text, number, more, hits, total } = await this.algoliaSearch('searchComments', {
      query,
      page,
      sort,
      tags: 'comment',
      hitsPerPage: 10
    });
    return {
      query: text,
      page: number,
      total,
      more,
      comments: hits
        .map(hit => {
          const commentId = String(hit?.objectID ?? '').trim();
          const postId = String(hit?.story_id ?? '').trim();
          if (!ITEM_ID_PATTERN.test(commentId) || !ITEM_ID_PATTERN.test(postId)) return null;
          return {
            commentId,
            postId,
            postTitle: oneLine(hit.story_title) || `Post ${postId}`,
            author: oneLine(hit.author) || '[deleted]',
            date: timestamp(hit.created_at),
            replyTo: hit.parent_id && String(hit.parent_id) !== postId ? String(hit.parent_id) : '',
            text: oneLine(htmlToText(hit.comment_text)).slice(0, 500)
          };
        })
        .filter(Boolean)
    };
  }

  async listLatest() {
    const html = await this.call('listLatest', options => this.api.requestHtml(this.siteUrl, '/newest', options));
    const { stories } = parseStoryList(html);
    return {
      topics: stories
        .map(story => ({
          topicId: story.id,
          title: oneLine(story.title) || `Post ${story.id}`,
          slug: '',
          url: `${this.siteUrl}/item?id=${story.id}`,
          postsCount: Number.isInteger(story.commentCount) ? story.commentCount + 1 : null,
          lastPostedAt: story.when || '',
          excerpt: oneLine(
            [story.author && `by ${story.author}`, Number.isFinite(story.score) && `${story.score} points`, story.link]
              .filter(Boolean)
              .join(' · ')
          ).slice(0, 300)
        }))
        .slice(0, FORUM_TOOL_LIMITS.maxLatestTopics)
    };
  }

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
      url: facts.url || `${this.siteUrl}/item?id=${id}`,
      postsCount: result.totalPosts,
      totalPages: Math.max(1, result.rawPages.length),
      createdAt: facts.when,
      lastPostedAt: '',
      category: '',
      tags: []
    };
  }

  async getRawPage({ topicId, page = 1, maxChars = FORUM_TOOL_LIMITS.maxRawChars } = {}) {
    const id = positiveId(topicId, 'topicId');
    const number = pageNumber(page, FORUM_TOOL_LIMITS.maxRawPage);
    const keep = Math.max(1, Math.min(FORUM_TOOL_LIMITS.maxRawPageChars, Math.floor(Number(maxChars)) || FORUM_TOOL_LIMITS.maxRawChars));
    const result = await this.thread(id);
    const content = result.rawPages.find(entry => entry.page === number)?.content || '';
    return { topicId: id, page: number, content: content.trim().slice(0, keep) };
  }
}

/**
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] replaces fetch (tests)
 */
export function createHackerNewsSiteAdapter({ fetchImpl } = {}) {
  return Object.freeze({
    type: HACKERNEWS_SITE_TYPE,
    label: 'Hacker News',
    fetchTopicContent: createHackerNewsFetcher({ fetchImpl }),
    createToolClient: ({ siteUrl, signal, governor }) => new HackerNewsToolClient({ siteUrl, signal, governor, fetchImpl })
  });
}
