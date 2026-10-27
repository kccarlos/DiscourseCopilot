// Parsers for the search markup Reddit renders at /svc/shreddit/r/<sub>/search/
// (the .json search endpoints refuse every request now). The service worker has
// no DOM, so the units are cut out and read with patterns. Each result card
// carries a data-faceplate-tracking-context attribute holding JSON with the
// post, comment, author and subreddit ids, which is far steadier than the
// surrounding layout, so the ids and titles come from there and only the
// comment text, dates and counts come from the markup.
import { decodeEntities, htmlToText } from './html-text.mjs';

const COMMENT_UNIT = 'data-testid="search-sdui-comment-unit"';
const POST_UNIT = 'data-testid="search-post-unit"';
const COMMENT_BODY = 'data-testid="search-comment-content"';
const MAX_UNITS = 25;

function splitUnits(html, marker) {
  const text = String(html ?? '');
  const starts = [];
  for (let at = text.indexOf(marker); at !== -1 && starts.length < MAX_UNITS; at = text.indexOf(marker, at + marker.length)) {
    starts.push(at);
  }
  return starts.map((start, index) => text.slice(start, starts[index + 1] ?? text.length));
}

function trackingContext(unit) {
  const raw = /data-faceplate-tracking-context="([^"]*)"/.exec(unit)?.[1];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeEntities(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function stripPrefix(id, prefix) {
  const value = String(id ?? '');
  return value.startsWith(prefix) ? value.slice(prefix.length) : '';
}

// "2026-10-21T09:01:08.902000+0000" -> "2026-10-21 09:01 UTC"
function formatTimestamp(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(value ?? ''));
  return match ? `${match[1]} ${match[2]} UTC` : '';
}

function timestampFrom(text, from = 0) {
  return formatTimestamp(/<faceplate-timeago\b[^>]*\bts="([^"]*)"/.exec(text.slice(from))?.[1]);
}

function nextPageUrl(html) {
  for (const match of String(html ?? '').matchAll(/<faceplate-partial\b[^>]*\bsrc="([^"]*)"/g)) {
    const url = decodeEntities(match[1]);
    if (url.startsWith('/svc/shreddit/') && /[?&]cursor=/.test(url)) return url;
  }
  return '';
}

function countBefore(unit, word) {
  const match = new RegExp(`<faceplate-number\\b[^>]*\\bnumber="(\\d+)"[^>]*></faceplate-number>\\s*${word}`).exec(unit);
  return match ? Number(match[1]) : null;
}

function commentText(unit) {
  const start = unit.search(/<div id="search-comment-[^"]*-post-rtjson-content"/);
  if (start === -1) return '';
  const end = unit.indexOf('</shreddit-stop-propagation>', start);
  return htmlToText(unit.slice(start, end === -1 ? undefined : end))
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Comment hits: [{commentId, postRedditId, postTitle, subreddit, author, date, text, url}] and the next page's path. */
export function parseCommentSearch(html) {
  const items = [];
  for (const unit of splitUnits(html, COMMENT_UNIT)) {
    const context = trackingContext(unit);
    const commentId = stripPrefix(context.comment?.id, 't1_');
    const postRedditId = stripPrefix(context.post?.id, 't3_');
    if (!commentId || !postRedditId) continue;
    const bodyAt = unit.indexOf(COMMENT_BODY);
    const link = /href="(\/r\/[^"]*\/comments\/[^"/]+\/[^"/]*\/[^"/]+\/)"/.exec(unit)?.[1] || '';
    items.push({
      commentId,
      postRedditId,
      postTitle: String(context.post?.title || ''),
      subreddit: String(context.subreddit?.name || ''),
      author: /label="([^"]+) details"/.exec(unit.slice(Math.max(bodyAt, 0)))?.[1] || '',
      date: bodyAt === -1 ? '' : timestampFrom(unit, bodyAt) || timestampFrom(unit),
      text: commentText(unit),
      url: link
    });
  }
  return { items, nextUrl: nextPageUrl(html) };
}

/** Post hits: [{redditId, title, subreddit, author, date, commentCount, score, url}] and the next page's path. */
export function parsePostSearch(html) {
  const items = [];
  for (const unit of splitUnits(html, POST_UNIT)) {
    const context = trackingContext(unit);
    const redditId = stripPrefix(context.post?.id, 't3_');
    if (!redditId) continue;
    items.push({
      redditId,
      title: String(context.post?.title || ''),
      subreddit: String(context.subreddit?.name || ''),
      author: String(context.profile?.name || ''),
      date: timestampFrom(unit),
      commentCount: countBefore(unit, 'comments?'),
      score: countBefore(unit, 'votes?'),
      url: /data-testid="post-title"\s+href="([^"]+)"/.exec(unit)?.[1] || ''
    });
  }
  return { items, nextUrl: nextPageUrl(html) };
}
