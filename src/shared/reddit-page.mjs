// Recognizing a Reddit post from its address. Unlike Discourse and WordPress,
// Reddit needs nothing from the document: every host that serves Reddit
// (www, old, new, np, m, sh) is the one site, and a post's id is in the URL.
//
// Reddit ids are base36 ("1wv40pf"). The rest of the extension keys topics by
// a positive whole number, so a post's topic id is that id read as a base36
// number and written in decimal; redditIdFromTopicId() turns it back. Ids stay
// below 36^10, inside what a JavaScript number holds exactly.

import { SITE_TYPE } from './site-types.mjs';

export const REDDIT_SITE_URL = 'https://www.reddit.com';

const REDDIT_HOSTS = new Set([
  'reddit.com',
  'www.reddit.com',
  'old.reddit.com',
  'new.reddit.com',
  'np.reddit.com',
  'm.reddit.com',
  'sh.reddit.com'
]);
const REDDIT_ID_PATTERN = /^[a-z0-9]{1,10}$/;

export function isRedditHostname(hostname) {
  return REDDIT_HOSTS.has(String(hostname || '').toLowerCase());
}

/** "1wv40pf" -> "<decimal>", or null when it is not a Reddit id. */
export function topicIdFromRedditId(redditId) {
  const id = String(redditId ?? '').toLowerCase();
  if (!REDDIT_ID_PATTERN.test(id)) {
    return null;
  }
  const value = Number.parseInt(id, 36);
  return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

/** The inverse of topicIdFromRedditId(); null for anything else. */
export function redditIdFromTopicId(topicId) {
  const text = String(topicId ?? '').trim();
  if (!/^[1-9]\d{0,15}$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isSafeInteger(value) ? value.toString(36) : null;
}

function parse(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && isRedditHostname(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The post a Reddit address shows, ignoring slug, comment permalink, query
 * and hash: /r/<sub>/comments/<id>/..., /user/<name>/comments/<id>/... or
 * /comments/<id>. Null on a listing, a profile or a non-Reddit address.
 */
export function redditPostFromUrl(value) {
  const url = parse(value);
  if (!url) {
    return null;
  }
  const segments = url.pathname.split('/').filter(Boolean);
  // /comments/<id>, or /r|u|user/<name>/comments/<id>: the prefix is checked by
  // position, since a subreddit or user can itself be called "comments".
  const at =
    segments[0]?.toLowerCase() === 'comments'
      ? 0
      : ['r', 'u', 'user'].includes(segments[0]?.toLowerCase()) && segments[2]?.toLowerCase() === 'comments'
        ? 2
        : -1;
  if (at < 0) {
    return null;
  }
  const redditId = String(segments[at + 1] || '').toLowerCase();
  const topicId = topicIdFromRedditId(redditId);
  return topicId ? { redditId, topicId, subreddit: at === 2 && segments[0].toLowerCase() === 'r' ? segments[1] : '' } : null;
}

/** The page state fields for a Reddit address, or null when it is not Reddit. */
export function redditPageFromUrl(value) {
  const url = parse(value);
  if (!url) {
    return null;
  }
  const post = redditPostFromUrl(url.href);
  return {
    siteType: SITE_TYPE.REDDIT,
    siteUrl: REDDIT_SITE_URL,
    basePath: '',
    forumName: 'Reddit',
    postId: post ? post.topicId : null,
    redditId: post ? post.redditId : null
  };
}
