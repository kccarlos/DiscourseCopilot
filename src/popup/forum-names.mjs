// Forum identity as plain data: hostnames, the names forums are known by,
// their accent hue and initial, topic titles without the forum suffix, and
// Activity items grouped by forum. forum-ui.mjs renders these.
import { normalizeSiteUrl, parseSiteUrl } from '../shared/forum-site.mjs';

export function forumHostname(siteUrl) {
  const site = parseSiteUrl(siteUrl);
  return site ? new URL(site.origin).hostname : '';
}

function isRealForumName(name, hostname) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return Boolean(trimmed) && trimmed.toLowerCase() !== hostname.toLowerCase();
}

// Records fall back to the hostname when a forum did not report its name, so
// a hostname candidate never wins over a name from a sibling record.
export function resolveForumName(siteUrl, ...candidates) {
  const hostname = forumHostname(siteUrl);
  const name = candidates.find(candidate => isRealForumName(candidate, hostname));
  return name ? name.trim().slice(0, 120) : hostname;
}

export function collectForumNames(records = []) {
  const names = new Map();
  for (const record of records) {
    const siteUrl = normalizeSiteUrl(record?.siteUrl);
    if (
      siteUrl
      && !names.has(siteUrl)
      && isRealForumName(record.forumName, forumHostname(siteUrl))
    ) {
      names.set(siteUrl, record.forumName.trim().slice(0, 120));
    }
  }
  return names;
}

// Stable 0–359 hue per forum so its chip keeps one color everywhere.
export function forumAccentHue(siteUrl) {
  const key = normalizeSiteUrl(siteUrl);
  if (!key) {
    return null;
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

export function forumInitial(name) {
  const match = String(name || '').match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase() : '?';
}

const TITLE_SEPARATOR = /\s+[-–—|]\s+/g;

// Discourse tab titles end with " - <category> - <site>" or " - <site>".
export function cleanTopicTitle(title, forumName) {
  const text = typeof title === 'string' ? title.trim() : '';
  const forum = typeof forumName === 'string' ? forumName.trim().toLowerCase() : '';
  if (!text || !forum) {
    return text;
  }
  const separators = [...text.matchAll(TITLE_SEPARATOR)];
  const last = separators.at(-1);
  if (!last || text.slice(last.index + last[0].length).trim().toLowerCase() !== forum) {
    return text;
  }
  const cut = separators.length >= 2 ? separators.at(-2).index : last.index;
  return text.slice(0, cut).trim() || text;
}

function itemTime(item) {
  return Number(item?.updatedAt || item?.createdAt || 0);
}

// Groups Activity items by forum: the current forum first, then the others by
// most recent activity, and items without a known forum last.
export function groupByForum(items = [], currentSiteUrl = '', { names = null } = {}) {
  const current = normalizeSiteUrl(currentSiteUrl);
  const groups = new Map();
  for (const item of items) {
    const siteUrl = normalizeSiteUrl(item?.siteUrl);
    if (!groups.has(siteUrl)) {
      groups.set(siteUrl, { siteUrl, items: [], latestAt: 0 });
    }
    const group = groups.get(siteUrl);
    group.items.push(item);
    group.latestAt = Math.max(group.latestAt, itemTime(item));
  }

  return [...groups.values()]
    .map(group => {
      const hostname = forumHostname(group.siteUrl);
      return {
        ...group,
        hostname,
        forumName: group.siteUrl
          ? resolveForumName(
              group.siteUrl,
              ...group.items.map(item => item.forumName),
              names?.get(group.siteUrl)
            )
          : 'Unknown forum',
        hue: forumAccentHue(group.siteUrl),
        isCurrent: Boolean(current) && group.siteUrl === current
      };
    })
    .sort((left, right) =>
      Number(right.isCurrent) - Number(left.isCurrent)
      || Number(Boolean(right.siteUrl)) - Number(Boolean(left.siteUrl))
      || right.latestAt - left.latestAt
    );
}
