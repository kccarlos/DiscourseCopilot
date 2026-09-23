import { hasBasePathPrefix, normalizeBasePath } from '../shared/forum-site.mjs';

// URL-only helpers cannot know whether a site runs Discourse; callers must
// combine these with page detection before treating a page as a forum.
export function extractForumTopicId(value, basePath = '') {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }
    const normalizedBasePath = normalizeBasePath(basePath);
    if (!hasBasePathPrefix(url.pathname, normalizedBasePath)) {
      return null;
    }
    const segments = url.pathname
      .slice(normalizedBasePath.length)
      .split('/')
      .filter(Boolean);
    if (segments[0] !== 't') {
      return null;
    }
    if (/^\d+$/.test(segments[1] || '')) {
      return segments[1];
    }
    return /^\d+$/.test(segments[2] || '') ? segments[2] : null;
  } catch {
    return null;
  }
}
