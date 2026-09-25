// User preferences that tune how much work the extension does and how long it
// remembers things: Ask-the-forum research depth, how many raw pages of a
// topic are read, and history retention. Pure functions only; the persisted
// copy lives in the configuration model (config-state.mjs), which normalizes
// it with normalizePreferences() on every read.
//
// Stored shape (chrome.storage.local "preferences"):
//   {
//     researchDepth: 'quick' | 'balanced' | 'thorough' | 'custom',
//     customResearch: { searchQueries, searchPages, topicsRead },
//     topicPageMode: 'all' | 'limit',  // read every page (default) or only the first ones
//     topicPageLimit: number,          // raw pages of 100 posts per topic, used in 'limit'
//                                      // mode and remembered while 'all' is chosen
//     historyRetention: '1d' | '3d' | '7d' | '30d' | 'forever',
//     maxSavedTopics: number
//   }
//
// Consumers never read these fields directly; they ask for the effective
// values with resolveResearchLimits(), resolveTopicPageLimit() and
// resolveRetention(), so a preset, a custom value or a missing key all
// resolve in exactly one place. resolveTopicPageLimit() returns the page
// limit, or null for "every page" (the default).
//
// Older stored preferences have a topicPageLimit but no topicPageMode. They
// read as 'all': normalizePreferences() wrote topicPageLimit (then 20) on
// every save, so a stored number says nothing about whether the user chose a
// limit. The number is kept as the value offered when they pick a limit.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Discourse's raw endpoint serves 100 posts per page.
export const POSTS_PER_RAW_PAGE = 100;

// Hard bounds. The research maxima are also the forum tools' safety caps:
// deriveSearchQueries() yields at most 4 distinct queries and the search tool
// accepts result pages 1–3 (FORUM_TOOL_LIMITS.maxSearchPage).
export const PREFERENCE_RANGES = Object.freeze({
  searchQueries: Object.freeze({ min: 1, max: 4 }),
  searchPages: Object.freeze({ min: 1, max: 3 }),
  topicsRead: Object.freeze({ min: 1, max: 12 }),
  topicPageLimit: Object.freeze({ min: 1, max: 100 }),
  maxSavedTopics: Object.freeze({ min: 10, max: 200 })
});

export const RESEARCH_PRESETS = Object.freeze({
  quick: Object.freeze({ searchQueries: 1, searchPages: 1, topicsRead: 3 }),
  balanced: Object.freeze({ searchQueries: 3, searchPages: 1, topicsRead: 6 }),
  thorough: Object.freeze({ searchQueries: 4, searchPages: 2, topicsRead: 10 })
});

export const RESEARCH_DEPTHS = Object.freeze(['quick', 'balanced', 'thorough', 'custom']);

// 'all': read every page of a topic. 'limit': read only the first
// topicPageLimit pages.
export const TOPIC_PAGE_MODES = Object.freeze(['all', 'limit']);

export const HISTORY_RETENTION_OPTIONS = Object.freeze(
  [
    { value: '1d', label: '1 day', ms: DAY_MS },
    { value: '3d', label: '3 days', ms: 3 * DAY_MS },
    { value: '7d', label: '7 days', ms: 7 * DAY_MS },
    { value: '30d', label: '30 days', ms: 30 * DAY_MS },
    { value: 'forever', label: 'Until I delete them', ms: Infinity }
  ].map(option => Object.freeze(option))
);

const RETENTION_BY_VALUE = new Map(HISTORY_RETENTION_OPTIONS.map(option => [option.value, option]));

// Finished entries in the Tasks tab are status lines, not saved content:
// they follow the history setting but never outlive a week.
export const MAX_TASK_RETENTION_MS = 7 * DAY_MS;

export const DEFAULT_PREFERENCES = Object.freeze({
  researchDepth: 'balanced',
  customResearch: RESEARCH_PRESETS.balanced,
  // Every page of a topic is read. When the user opts into a limit, it
  // starts at 20 pages (the first 2,000 posts).
  topicPageMode: 'all',
  topicPageLimit: 20,
  historyRetention: '1d',
  maxSavedTopics: 40
});

export const PREFERENCE_FIELDS = Object.freeze(['searchQueries', 'searchPages', 'topicsRead', 'topicPageLimit', 'maxSavedTopics']);

function clampInteger(value, { min, max }, fallback) {
  const number = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeResearch(value, fallback = RESEARCH_PRESETS.balanced) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    searchQueries: clampInteger(raw.searchQueries, PREFERENCE_RANGES.searchQueries, fallback.searchQueries),
    searchPages: clampInteger(raw.searchPages, PREFERENCE_RANGES.searchPages, fallback.searchPages),
    topicsRead: clampInteger(raw.topicsRead, PREFERENCE_RANGES.topicsRead, fallback.topicsRead)
  };
}

/**
 * Stored (or missing, or older) preferences → a complete, in-range object.
 * Missing keys take their defaults; out-of-range numbers are clamped;
 * unknown enum values fall back to the default. Never throws.
 */
export function normalizePreferences(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    researchDepth: RESEARCH_DEPTHS.includes(raw.researchDepth) ? raw.researchDepth : DEFAULT_PREFERENCES.researchDepth,
    customResearch: normalizeResearch(raw.customResearch, DEFAULT_PREFERENCES.customResearch),
    topicPageMode: TOPIC_PAGE_MODES.includes(raw.topicPageMode) ? raw.topicPageMode : DEFAULT_PREFERENCES.topicPageMode,
    topicPageLimit: clampInteger(raw.topicPageLimit, PREFERENCE_RANGES.topicPageLimit, DEFAULT_PREFERENCES.topicPageLimit),
    historyRetention: RETENTION_BY_VALUE.has(raw.historyRetention) ? raw.historyRetention : DEFAULT_PREFERENCES.historyRetention,
    maxSavedTopics: clampInteger(raw.maxSavedTopics, PREFERENCE_RANGES.maxSavedTopics, DEFAULT_PREFERENCES.maxSavedTopics)
  };
}

export function defaultPreferences() {
  return normalizePreferences(DEFAULT_PREFERENCES);
}

export function preferencesEqual(left, right) {
  return JSON.stringify(normalizePreferences(left)) === JSON.stringify(normalizePreferences(right));
}

const FIELD_LABELS = Object.freeze({
  searchQueries: 'Search queries',
  searchPages: 'Result pages per search',
  topicsRead: 'Discussions read',
  topicPageLimit: 'Pages read per topic',
  maxSavedTopics: 'Saved topics'
});

function checkInteger(value, range) {
  const textValue = typeof value === 'number' ? String(value) : String(value ?? '').trim();
  if (!/^\d+$/.test(textValue)) {
    return false;
  }
  const number = Number(textValue);
  return number >= range.min && number <= range.max;
}

/**
 * Validates preferences being edited (values may be strings straight from
 * inputs). Unlike normalizePreferences(), nothing is clamped: an
 * out-of-range or non-numeric entry is an error the user must fix.
 * Custom research fields are only checked while the custom depth is chosen.
 * @returns {{ valid: boolean, errors: string[], fieldErrors: Record<string, string>,
 *   preferences: ReturnType<typeof normalizePreferences> | null }}
 */
export function validatePreferences(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const fieldErrors = {};
  const check = (field, fieldValue) => {
    const range = PREFERENCE_RANGES[field];
    if (!checkInteger(fieldValue, range)) {
      fieldErrors[field] = `${FIELD_LABELS[field]} must be a whole number from ${range.min} to ${range.max}.`;
    }
  };
  if (raw.researchDepth === 'custom') {
    check('searchQueries', raw.customResearch?.searchQueries);
    check('searchPages', raw.customResearch?.searchPages);
    check('topicsRead', raw.customResearch?.topicsRead);
  }
  // The page limit only matters (and is only checked) when a limit is chosen.
  if (raw.topicPageMode === 'limit') {
    check('topicPageLimit', raw.topicPageLimit);
  }
  check('maxSavedTopics', raw.maxSavedTopics);
  const errors = Object.values(fieldErrors);
  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
    preferences: errors.length ? null : normalizePreferences(raw)
  };
}

// ---------- Effective values ----------

/**
 * The Agent's research budget for one run.
 * @returns {{ depth: string, searchQueries: number, searchPages: number,
 *   topicsRead: number, rawFallbacks: number }}
 */
export function resolveResearchLimits(value) {
  const preferences = normalizePreferences(value);
  const research = preferences.researchDepth === 'custom' ? preferences.customResearch : RESEARCH_PRESETS[preferences.researchDepth];
  return {
    depth: preferences.researchDepth,
    ...research,
    // Discussions without a matching post are read from their first raw
    // page; at most half of them (rounded up), so one run stays light.
    rawFallbacks: Math.ceil(research.topicsRead / 2)
  };
}

// The most forum requests one research run can make (search + topic
// metadata + posts or raw fallback). Used for the settings help text.
export function researchRequestBudget(limits) {
  return limits.searchQueries * limits.searchPages + limits.topicsRead * 2;
}

/**
 * The most raw pages read per topic, or null to read every page.
 * @returns {number|null}
 */
export function resolveTopicPageLimit(value) {
  const preferences = normalizePreferences(value);
  return preferences.topicPageMode === 'limit' ? preferences.topicPageLimit : null;
}

/**
 * How long unkept history lasts. `Infinity` means no time limit (items are
 * then only removed by the saved-topics limit or by the user).
 * @returns {{ historyRetention: string, label: string, forever: boolean,
 *   chatMs: number, agentMs: number, taskMs: number, maxSavedTopics: number }}
 */
export function resolveRetention(value) {
  const preferences = normalizePreferences(value);
  const option = RETENTION_BY_VALUE.get(preferences.historyRetention);
  return {
    historyRetention: option.value,
    label: option.label,
    forever: !Number.isFinite(option.ms),
    chatMs: option.ms,
    agentMs: option.ms,
    taskMs: Math.min(option.ms, MAX_TASK_RETENTION_MS),
    maxSavedTopics: preferences.maxSavedTopics
  };
}

export function retentionEqual(left, right) {
  return (
    Boolean(left && right)
    && left.chatMs === right.chatMs
    && left.agentMs === right.agentMs
    && left.taskMs === right.taskMs
    && left.maxSavedTopics === right.maxSavedTopics
  );
}

// ---------- Per-task snapshot ----------

/**
 * The limits a task runs with, taken once when it is queued. A queued or
 * running task keeps these even if the preferences change; only tasks queued
 * afterwards use the new values.
 */
export function snapshotTaskLimits(type, preferences) {
  if (type === 'agent') {
    const { searchQueries, searchPages, topicsRead, rawFallbacks } = resolveResearchLimits(preferences);
    return { research: { searchQueries, searchPages, topicsRead, rawFallbacks } };
  }
  if (type === 'summary' || type === 'chat') {
    // null = read every page.
    return { topicPageLimit: resolveTopicPageLimit(preferences) };
  }
  return {};
}

// A persisted task's limits (null when the record predates them).
export function normalizeTaskLimits(type, value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (type === 'agent') {
    if (!value.research || typeof value.research !== 'object') return null;
    const research = normalizeResearch(value.research, RESEARCH_PRESETS.balanced);
    return {
      research: {
        ...research,
        rawFallbacks: clampInteger(value.research.rawFallbacks, { min: 0, max: research.topicsRead }, Math.ceil(research.topicsRead / 2))
      }
    };
  }
  if (type === 'summary' || type === 'chat') {
    // undefined: the record predates limits. null: every page.
    if (value.topicPageLimit === undefined) return null;
    if (value.topicPageLimit === null) return { topicPageLimit: null };
    return {
      topicPageLimit: clampInteger(value.topicPageLimit, PREFERENCE_RANGES.topicPageLimit, DEFAULT_PREFERENCES.topicPageLimit)
    };
  }
  return null;
}

// ---------- Labels ----------

export function describeRetention(retention) {
  return retention?.forever ? 'no time limit' : retention?.label || '1 day';
}

// "expires in 5h" / "expires in 3d"; '' when there is nothing to show.
export function formatExpiresIn(expiresAt, now = Date.now()) {
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return '';
  }
  const remaining = expiresAt - now;
  if (remaining <= 0) {
    return '';
  }
  const hours = Math.ceil(remaining / HOUR_MS);
  if (hours <= 48) {
    return `expires in ${hours}h`;
  }
  return `expires in ${Math.ceil(remaining / DAY_MS)}d`;
}

export function formatPostCount(pages) {
  return (pages * POSTS_PER_RAW_PAGE).toLocaleString('en-US');
}
