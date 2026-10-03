// User preferences that tune how much work the extension does and how long it
// remembers things: the Ask-the-forum agent's budget, how many raw pages of a
// topic are read, and history retention; plus whether forum pages show the
// DiscourseCopilot button. Pure functions only; the persisted
// copy lives in the configuration model (config-state.mjs), which normalizes
// it with normalizePreferences() on every read.
//
// Stored shape (chrome.storage.local "preferences"):
//   {
//     researchDepth: 'quick' | 'balanced' | 'thorough' | 'custom',
//     customBudget: { maxSteps, maxTopicReads, maxCharsPerRead },
//     topicPageMode: 'all' | 'limit',  // read every page (default) or only the first ones
//     topicPageLimit: number,          // raw pages of 100 posts per topic, used in 'limit'
//                                      // mode and remembered while 'all' is chosen
//     historyRetention: '1d' | '3d' | '7d' | '30d' | 'forever',
//     maxSavedTopics: number,
//     showForumButton: boolean         // the in-page launcher button on forum pages (default true)
//   }
//
// Consumers never read these fields directly; they ask for the effective
// values with resolveAgentBudget(), resolveTopicPageLimit() and
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

// Hard bounds. The agent maxima are also its safety caps (the loop clamps
// whatever a task carries to these ranges).
export const PREFERENCE_RANGES = Object.freeze({
  maxSteps: Object.freeze({ min: 3, max: 40 }),
  maxTopicReads: Object.freeze({ min: 1, max: 20 }),
  maxCharsPerRead: Object.freeze({ min: 5000, max: 60000 }),
  topicPageLimit: Object.freeze({ min: 1, max: 100 }),
  maxSavedTopics: Object.freeze({ min: 10, max: 200 })
});

// The agent's budget per question (and per follow-up): tool calls, distinct
// topics read, and characters taken from one read.
export const AGENT_BUDGET_PRESETS = Object.freeze({
  quick: Object.freeze({ maxSteps: 6, maxTopicReads: 3, maxCharsPerRead: 12000 }),
  balanced: Object.freeze({ maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 }),
  thorough: Object.freeze({ maxSteps: 25, maxTopicReads: 14, maxCharsPerRead: 45000 })
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
  customBudget: AGENT_BUDGET_PRESETS.balanced,
  // Every page of a topic is read. When the user opts into a limit, it
  // starts at 20 pages (the first 2,000 posts).
  topicPageMode: 'all',
  topicPageLimit: 20,
  historyRetention: '1d',
  maxSavedTopics: 40,
  // The floating launcher the content script adds to forum pages.
  showForumButton: true
});

// The user-tunable defaults, derived once here so no other module repeats
// them (task records, topic sessions and the Agent import these).
const DEFAULT_RETENTION_OPTION = RETENTION_BY_VALUE.get(DEFAULT_PREFERENCES.historyRetention);
export const DEFAULT_RETENTION_MS = DEFAULT_RETENTION_OPTION.ms;
export const DEFAULT_MAX_SAVED_TOPICS = DEFAULT_PREFERENCES.maxSavedTopics;
// The agent's budget when a caller passes none (the Balanced preset).
export const DEFAULT_AGENT_BUDGET = AGENT_BUDGET_PRESETS.balanced;

export const PREFERENCE_FIELDS = Object.freeze(['maxSteps', 'maxTopicReads', 'maxCharsPerRead', 'topicPageLimit', 'maxSavedTopics']);

function clampInteger(value, { min, max }, fallback) {
  const number = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeBudget(value, fallback = AGENT_BUDGET_PRESETS.balanced) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    maxSteps: clampInteger(raw.maxSteps, PREFERENCE_RANGES.maxSteps, fallback.maxSteps),
    maxTopicReads: clampInteger(raw.maxTopicReads, PREFERENCE_RANGES.maxTopicReads, fallback.maxTopicReads),
    maxCharsPerRead: clampInteger(raw.maxCharsPerRead, PREFERENCE_RANGES.maxCharsPerRead, fallback.maxCharsPerRead)
  };
}

// Before the agent, "Ask the forum" ran a fixed pipeline with its own limits
// ({ searchQueries, searchPages, topicsRead }). Those carry over as an
// equivalent budget: the same topic reads, and one step per search request,
// per topic read, plus a couple for the answer.
function budgetFromLegacyResearch(value) {
  const raw = value && typeof value === 'object' ? value : null;
  if (!raw) {
    return null;
  }
  const searches = clampInteger(raw.searchQueries, { min: 1, max: 4 }, 3) * clampInteger(raw.searchPages, { min: 1, max: 3 }, 1);
  const topics = clampInteger(raw.topicsRead, { min: 1, max: 12 }, 6);
  return normalizeBudget({ maxSteps: searches + topics + 2, maxTopicReads: topics }, AGENT_BUDGET_PRESETS.balanced);
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
    customBudget: normalizeBudget(
      raw.customBudget && typeof raw.customBudget === 'object' ? raw.customBudget : budgetFromLegacyResearch(raw.customResearch),
      DEFAULT_PREFERENCES.customBudget
    ),
    topicPageMode: TOPIC_PAGE_MODES.includes(raw.topicPageMode) ? raw.topicPageMode : DEFAULT_PREFERENCES.topicPageMode,
    topicPageLimit: clampInteger(raw.topicPageLimit, PREFERENCE_RANGES.topicPageLimit, DEFAULT_PREFERENCES.topicPageLimit),
    historyRetention: RETENTION_BY_VALUE.has(raw.historyRetention) ? raw.historyRetention : DEFAULT_PREFERENCES.historyRetention,
    maxSavedTopics: clampInteger(raw.maxSavedTopics, PREFERENCE_RANGES.maxSavedTopics, DEFAULT_PREFERENCES.maxSavedTopics),
    showForumButton: typeof raw.showForumButton === 'boolean' ? raw.showForumButton : DEFAULT_PREFERENCES.showForumButton
  };
}

export function defaultPreferences() {
  return normalizePreferences(DEFAULT_PREFERENCES);
}

export function preferencesEqual(left, right) {
  return JSON.stringify(normalizePreferences(left)) === JSON.stringify(normalizePreferences(right));
}

const FIELD_LABELS = Object.freeze({
  maxSteps: 'Steps per question',
  maxTopicReads: 'Topics read',
  maxCharsPerRead: 'Characters per read',
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
 * Custom budget fields are only checked while the custom depth is chosen.
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
    check('maxSteps', raw.customBudget?.maxSteps);
    check('maxTopicReads', raw.customBudget?.maxTopicReads);
    check('maxCharsPerRead', raw.customBudget?.maxCharsPerRead);
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
 * The agent's budget for one question (or follow-up).
 * @returns {{ depth: string, maxSteps: number, maxTopicReads: number, maxCharsPerRead: number }}
 */
export function resolveAgentBudget(value) {
  const preferences = normalizePreferences(value);
  const budget = preferences.researchDepth === 'custom' ? preferences.customBudget : AGENT_BUDGET_PRESETS[preferences.researchDepth];
  return { depth: preferences.researchDepth, ...budget };
}

// Clamps a budget (a task's snapshot, a caller's value) to the hard ranges.
export function clampAgentBudget(value) {
  return normalizeBudget(value, DEFAULT_AGENT_BUDGET);
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
    const { maxSteps, maxTopicReads, maxCharsPerRead } = resolveAgentBudget(preferences);
    return { agent: { maxSteps, maxTopicReads, maxCharsPerRead } };
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
    // Tasks queued before the agent carry the old research limits.
    const budget = value.agent && typeof value.agent === 'object' ? value.agent : budgetFromLegacyResearch(value.research);
    return budget ? { agent: normalizeBudget(budget, AGENT_BUDGET_PRESETS.balanced) } : null;
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
