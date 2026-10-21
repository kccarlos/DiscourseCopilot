import { t } from './i18n.mjs';

export const FORUM_CONTEXT_LIMIT = Object.freeze({
  min: 5000,
  max: 1000000,
  step: 5000,
  default: 30000
});

export function normalizeForumContextLimit(value, fallback = FORUM_CONTEXT_LIMIT.default) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return normalizeForumContextLimit(fallback, FORUM_CONTEXT_LIMIT.default);
  }

  const clamped = Math.min(FORUM_CONTEXT_LIMIT.max, Math.max(FORUM_CONTEXT_LIMIT.min, numericValue));
  return Math.round(clamped / FORUM_CONTEXT_LIMIT.step) * FORUM_CONTEXT_LIMIT.step;
}

export function formatForumContextLimit(value) {
  return t('chatContext.characters', { count: normalizeForumContextLimit(value).toLocaleString() });
}

// The limit as a short chip label: 5k, 300k, 1M.
export function formatForumContextLimitShort(value) {
  const limit = normalizeForumContextLimit(value);
  return limit >= 1000000 ? `${limit / 1000000}M` : `${Math.round(limit / 1000)}k`;
}
