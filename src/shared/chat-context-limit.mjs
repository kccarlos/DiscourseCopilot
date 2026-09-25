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
  return `${normalizeForumContextLimit(value).toLocaleString()} characters`;
}
