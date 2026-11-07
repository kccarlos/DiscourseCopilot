// Recognizing a Hacker News item or listing from its address.
// Item ids on news.ycombinator.com are already positive decimal integers in the
// `?id=<id>` query parameter, so they serve directly as the extension's topicId.

import { SITE_TYPE } from './site-types.mjs';

export const HACKERNEWS_SITE_URL = 'https://news.ycombinator.com';

const ITEM_ID_PATTERN = /^[1-9]\d{0,11}$/;

export function isHackerNewsHostname(hostname) {
  return String(hostname || '').toLowerCase() === 'news.ycombinator.com';
}

function parse(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' && isHackerNewsHostname(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

/**
 * The item a Hacker News address shows (`/item?id=<positive_integer>`), or null
 * on a listing, user profile or non-Hacker News address.
 */
export function hackerNewsItemFromUrl(value) {
  const url = parse(value);
  if (url?.pathname !== '/item') {
    return null;
  }
  const id = String(url.searchParams.get('id') || '').trim();
  return ITEM_ID_PATTERN.test(id) ? { itemId: id, topicId: id } : null;
}

/** The page state fields for a Hacker News address, or null when not Hacker News. */
export function hackerNewsPageFromUrl(value) {
  const url = parse(value);
  if (!url) {
    return null;
  }
  const item = hackerNewsItemFromUrl(url.href);
  return {
    siteType: SITE_TYPE.HACKERNEWS,
    siteUrl: HACKERNEWS_SITE_URL,
    basePath: '',
    forumName: 'Hacker News',
    postId: item ? item.topicId : null
  };
}
