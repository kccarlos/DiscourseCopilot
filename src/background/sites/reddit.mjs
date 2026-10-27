// The Reddit site adapter: reads a post and its whole comment tree through
// Reddit's .json endpoints with the user's own Reddit login (anonymous
// requests are refused by Reddit, so a logged-out user gets the usual "log in
// to the site" message). The Agent's tools are in ../reddit-tools.mjs.
//
// A post is read like a topic: the post is the opening block and the comments
// are the replies, in conversation order (each comment followed by its
// replies), 100 blocks to a page. The text is shaped like Discourse's: blocks
// separated by blank lines (ai-errors.mjs splits the opening post from the
// replies on three newlines), so comment text never holds three newlines.
//
// Reddit returns the tree with "more" stubs where it cut it off. A stub with
// ids is expanded through /api/morechildren (100 ids a call); a "continue
// this thread" stub (no ids) is expanded by reading that comment's own page.
import { calculateFetchProgress } from '../../shared/fetch-progress.mjs';
import { fetchWithRateLimitRetry } from '../../shared/rate-limit-retry.mjs';
import { normalizeRawPages } from '../../shared/topic-session.mjs';
import { normalizeSiteUrl } from '../../shared/forum-site.mjs';
import { FORUM_RESPONSE_KIND, classifyForumResponse, forumAccessError, readForumResponse } from '../../shared/forum-response.mjs';
import { redditIdFromTopicId } from '../../shared/reddit-page.mjs';
import { SITE_TYPE } from '../../shared/site-types.mjs';
import { t } from '../../shared/i18n.mjs';
import { RedditToolClient } from '../reddit-tools.mjs';
import { buildContentResult, createRateLimitProgress } from '../topic-fetcher.mjs';

export const REDDIT_SITE_TYPE = SITE_TYPE.REDDIT;

// Blocks per page of the saved content (the extension's posts-per-page).
export const BLOCKS_PER_PAGE = 100;
const MORE_CHILDREN_BATCH = 100;
// Bounds on the extra requests a huge thread can cost.
const MAX_MORE_REQUESTS = 60;
const MAX_CONTINUE_REQUESTS = 20;

export const REDDIT_FETCH_CONFIG = Object.freeze({
  HEADERS: Object.freeze({ Accept: 'application/json', 'Cache-Control': 'no-cache' })
});

function requireSiteUrl(siteUrl) {
  const normalized = normalizeSiteUrl(siteUrl);
  if (!normalized) {
    throw new Error('A valid site URL is required');
  }
  return normalized;
}

function requireRedditId(topicId) {
  const id = redditIdFromTopicId(topicId);
  if (!id) {
    throw new Error('A valid Reddit post ID is required');
  }
  return id;
}

// 1750000000 -> "2025-06-15 15:06 UTC"
export function timestamp(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? `${new Date(value * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
}

// Reddit markdown with &amp; style entities decoded by raw_json=1; blocks are
// split on three newlines, so runs of blank lines collapse to one.
export function cleanText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function joinBlocks(blocks) {
  return `${blocks.join('\n\n\n')}\n`;
}

/** The post as the opening block. */
export function formatPost(post, siteUrl = 'https://www.reddit.com') {
  const flair = cleanText(post.link_flair_text);
  const header = [
    `Post: ${cleanText(post.title) || '(untitled)'}`,
    post.permalink ? `URL: ${siteUrl}${post.permalink}` : '',
    [
      post.subreddit_name_prefixed || (post.subreddit ? `r/${post.subreddit}` : ''),
      `u/${post.author || '[deleted]'}`,
      timestamp(post.created_utc),
      Number.isFinite(post.score) ? `score ${post.score}` : '',
      flair ? `flair: ${flair}` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    !post.is_self && post.url_overridden_by_dest ? `Link: ${post.url_overridden_by_dest}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  return `${header}\n\n${cleanText(post.selftext) || '(no text)'}`;
}

/** One comment as a reply. Replies name the comment they answer by its id. */
export function formatComment(comment, parentCommentId = null) {
  const when = timestamp(comment.created_utc);
  const score = Number.isFinite(comment.score) ? ` · score ${comment.score}` : '';
  const replyTo = parentCommentId ? ` · reply to comment ${parentCommentId}` : '';
  return `Comment ${comment.id} · u/${comment.author || '[deleted]'}${when ? ` · ${when}` : ''}${score}${replyTo}\n${cleanText(comment.body) || '(no text)'}`;
}

/**
 * The tree a read builds up: comments by id, who replies to whom, and the
 * "more" stubs still to expand. Anything Reddit sends twice is kept once.
 */
export function createCommentTree(rootFullname) {
  const comments = new Map();
  const children = new Map();
  const pendingIds = new Set();
  const continueFor = new Set();

  const addChild = (parentFullname, id) => {
    const list = children.get(parentFullname) || [];
    if (!list.includes(id)) {
      list.push(id);
    }
    children.set(parentFullname, list);
  };

  function add(things, parentFullname) {
    for (const thing of Array.isArray(things) ? things : []) {
      if (thing?.kind === 't1' && thing.data?.id) {
        const data = thing.data;
        if (!comments.has(data.id)) {
          comments.set(data.id, data);
          addChild(data.parent_id || parentFullname, data.id);
        }
        pendingIds.delete(data.id);
        const replies = data.replies?.data?.children;
        if (replies) {
          add(replies, `t1_${data.id}`);
        }
      } else if (thing?.kind === 'more') {
        const ids = Array.isArray(thing.data?.children) ? thing.data.children : [];
        if (ids.length) {
          for (const id of ids) {
            if (!comments.has(id)) {
              pendingIds.add(id);
            }
          }
        } else if (thing.data?.parent_id && thing.data.parent_id !== rootFullname) {
          continueFor.add(thing.data.parent_id.replace(/^t1_/, ''));
        }
      }
    }
  }

  // Conversation order: every comment followed by its replies.
  function ordered() {
    const out = [];
    const seen = new Set();
    const walk = (parentFullname, parentCommentId) => {
      for (const id of children.get(parentFullname) || []) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ comment: comments.get(id), parentCommentId });
        walk(`t1_${id}`, id);
      }
    };
    walk(rootFullname, null);
    // A comment whose parent never came back (filtered, or past the request
    // budget) is kept at the top level rather than dropped.
    for (const id of comments.keys()) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push({ comment: comments.get(id), parentCommentId: null });
        walk(`t1_${id}`, id);
      }
    }
    return out;
  }

  return { add, ordered, comments, pendingIds, continueFor };
}

export function createRedditApi({ fetchImpl, config = REDDIT_FETCH_CONFIG } = {}) {
  const retryOptions = extra => (fetchImpl ? { fetchImpl, ...extra } : extra);

  async function requestJson(siteUrl, path, { signal, onRetry }) {
    const response = await fetchWithRateLimitRetry(
      `${siteUrl}${path}`,
      { credentials: 'include', signal, headers: config.HEADERS },
      retryOptions({ signal, onRetry })
    );
    const snapshot = await readForumResponse(response);
    const kind = classifyForumResponse(snapshot, siteUrl, { expect: 'json' });
    if (kind === FORUM_RESPONSE_KIND.LOGIN_REQUIRED || kind === FORUM_RESPONSE_KIND.CHALLENGE || kind === FORUM_RESPONSE_KIND.NOT_FOUND) {
      throw forumAccessError(kind, siteUrl, { status: snapshot.status });
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

  const threadPath = (redditId, commentId = null) =>
    `/comments/${redditId}${commentId ? `/_/${commentId}` : ''}.json?raw_json=1&limit=500&depth=10&sort=confidence`;

  const fetchThread = (siteUrl, redditId, options) => requestJson(siteUrl, threadPath(redditId), options);
  const fetchCommentThread = (siteUrl, redditId, commentId, options) => requestJson(siteUrl, threadPath(redditId, commentId), options);
  const fetchMoreChildren = (siteUrl, redditId, ids, options) =>
    requestJson(
      siteUrl,
      `/api/morechildren.json?api_type=json&raw_json=1&sort=confidence&link_id=t3_${redditId}&children=${ids.join(',')}`,
      options
    );

  return { requestJson, fetchThread, fetchCommentThread, fetchMoreChildren };
}

export function createRedditFetcher({ fetchImpl, config = REDDIT_FETCH_CONFIG } = {}) {
  const api = createRedditApi({ fetchImpl, config });

  /**
   * Same contract as the Discourse adapter's fetchTopicContent. `topicId` is
   * the post's id as the extension keys it (shared/reddit-page.mjs);
   * `totalPosts` counts the post plus its comments.
   */
  return async function fetchTopicContent(siteUrl, topicId, onProgress = () => {}, signal, { maxPages } = {}) {
    const site = requireSiteUrl(siteUrl);
    const redditId = requireRedditId(topicId);
    const limit = Number.isInteger(Number(maxPages)) && Number(maxPages) > 0 ? Number(maxPages) : null;
    const startedAt = Date.now();
    let requests = 0;
    const progressFor = (expectedComments, read) =>
      calculateFetchProgress({
        currentPage: read,
        totalPages: Math.max(1, Math.ceil((expectedComments + 1) / BLOCKS_PER_PAGE)),
        totalPosts: expectedComments + 1,
        pageSize: BLOCKS_PER_PAGE,
        averageRequestMs: requests ? (Date.now() - startedAt) / requests : 0,
        concurrency: 1
      });
    let expected = 0;
    const retryProgress = retry => onProgress(createRateLimitProgress(progressFor(expected, 0), retry));
    const options = { signal, onRetry: retryProgress };
    const step = () => {
      requests++;
      onProgress(progressFor(expected, Math.min(requests, Math.ceil((expected + 1) / BLOCKS_PER_PAGE))));
    };

    const thread = await api.fetchThread(site, redditId, options);
    step();
    const post = thread?.[0]?.data?.children?.[0]?.data;
    if (!post || !Array.isArray(thread?.[1]?.data?.children)) {
      throw Object.assign(new Error(t('forumResponse.postNotFound')), { status: 404, retryable: false });
    }
    expected = Number.isInteger(post.num_comments) ? post.num_comments : 0;

    const tree = createCommentTree(`t3_${redditId}`);
    tree.add(thread[1].data.children, `t3_${redditId}`);

    // Hidden branches, 100 ids at a time, and "continue this thread" pages.
    // What either brings back can hold more stubs, so go on until none is left
    // or the request budget is spent.
    let moreRequests = 0;
    let continueRequests = 0;
    const continued = new Set();
    for (;;) {
      if (tree.pendingIds.size && moreRequests < MAX_MORE_REQUESTS) {
        const ids = [...tree.pendingIds].slice(0, MORE_CHILDREN_BATCH);
        const result = await api.fetchMoreChildren(site, redditId, ids, options);
        step();
        moreRequests++;
        tree.add(result?.json?.data?.things, `t3_${redditId}`);
        for (const id of ids) {
          // Ids Reddit would not return (removed, spam-filtered) must not loop.
          tree.pendingIds.delete(id);
        }
        continue;
      }
      const commentId = [...tree.continueFor].find(id => !continued.has(id));
      if (commentId && continueRequests < MAX_CONTINUE_REQUESTS) {
        continued.add(commentId);
        const sub = await api.fetchCommentThread(site, redditId, commentId, options);
        step();
        continueRequests++;
        const top = sub?.[1]?.data?.children?.[0]?.data;
        if (top?.replies?.data?.children) {
          tree.add(top.replies.data.children, `t1_${commentId}`);
        }
        continue;
      }
      break;
    }

    const blocks = [
      formatPost(post, site),
      ...tree.ordered().map(({ comment, parentCommentId }) => formatComment(comment, parentCommentId))
    ];
    const totalPosts = blocks.length;
    const pageCount = Math.max(1, Math.ceil(totalPosts / BLOCKS_PER_PAGE));
    const pagesToKeep = limit === null ? pageCount : Math.min(pageCount, limit);
    const truncated = pageCount > pagesToKeep;
    const pages = normalizeRawPages(
      Array.from({ length: pagesToKeep }, (_, index) => ({
        page: index + 1,
        content: joinBlocks(blocks.slice(index * BLOCKS_PER_PAGE, (index + 1) * BLOCKS_PER_PAGE))
      }))
    );
    const coveredPosts = truncated ? pagesToKeep * BLOCKS_PER_PAGE : totalPosts;
    onProgress({
      ...progressFor(Math.max(expected, totalPosts - 1), pagesToKeep),
      ...(truncated ? { truncatedFromPosts: totalPosts } : {})
    });

    return buildContentResult(
      pages,
      { totalPosts },
      { truncated, coveredPosts, unchanged: false, newPosts: null, networkPagesFetched: requests }
    );
  };
}

/**
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] replaces fetch (tests)
 */
export function createRedditSiteAdapter({ fetchImpl } = {}) {
  return Object.freeze({
    type: REDDIT_SITE_TYPE,
    label: 'Reddit',
    fetchTopicContent: createRedditFetcher({ fetchImpl }),
    createToolClient: ({ siteUrl, signal, governor }) => new RedditToolClient({ siteUrl, signal, governor, fetchImpl })
  });
}
