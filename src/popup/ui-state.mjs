import { normalizeSiteUrl, parseSiteUrl } from '../shared/forum-site.mjs';
import { isTerminalTaskStatus } from '../shared/task-record.mjs';

export function getSummaryActionLabel({
  taskStatus = '',
  taskPhase = '',
  isSubmitting = false,
  hasSummary = false,
  isHydrating = false
} = {}) {
  if (taskStatus === 'queued') return 'Summary queued';
  if (taskStatus && taskPhase === 'fetching') return 'Reading replies';
  if (taskStatus) return 'Creating summary';
  if (isSubmitting) return 'Starting summary';
  if (hasSummary) return 'Check for new replies';
  if (isHydrating) return 'Loading saved summary';
  return 'Create summary';
}

export function partitionTasks(tasks = []) {
  const sorted = [...tasks].sort((left, right) => {
    const leftTerminal = isTerminalTaskStatus(left.status) ? 1 : 0;
    const rightTerminal = isTerminalTaskStatus(right.status) ? 1 : 0;
    return leftTerminal - rightTerminal || Number(right.createdAt || 0) - Number(left.createdAt || 0);
  });

  return {
    active: sorted.filter(task => !isTerminalTaskStatus(task.status)),
    recent: sorted.filter(task => isTerminalTaskStatus(task.status))
  };
}

export const AGENT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const AGENT_ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_user_action']);
const AGENT_SETTLED_STATUSES = new Set([
  'waiting_user_action',
  'completed',
  'failed',
  'cancelled',
  'expired'
]);

function agentRunTime(activity) {
  return Number(activity?.completedAt || activity?.updatedAt || activity?.createdAt || 0);
}

function isRecentAgentRun(activity, now, windowMs) {
  return AGENT_ACTIVE_STATUSES.has(activity?.status)
    || now - agentRunTime(activity) <= windowMs;
}

// A finished run counts as unopened until its answer is viewed after it ended.
export function isAgentAnswerUnopened(activity = {}) {
  const completedAt = Number(activity.completedAt || 0);
  return (activity.status === 'completed' || activity.status === 'failed')
    && completedAt > 0
    && Number(activity.lastOpenedAt || 0) < completedAt;
}

export function getDefaultActivityTab(tasks = [], activities = [], {
  now = Date.now(),
  windowMs = AGENT_RECENT_WINDOW_MS
} = {}) {
  if (tasks.some(task => !isTerminalTaskStatus(task.status))) {
    return 'tasks';
  }
  return activities.some(activity =>
    isAgentAnswerUnopened(activity)
    && !activity.dismissedAt
    && isRecentAgentRun(activity, now, windowMs)
  )
    ? 'tasks'
    : 'saved';
}

// The activity record is authoritative once a run settles; before that the
// queue's task status is fresher (only the worker writes the activity).
export function mergeAgentRunState(activity, task = null) {
  if (!activity || !task || AGENT_SETTLED_STATUSES.has(activity.status)) {
    return activity;
  }
  const merged = {
    ...activity,
    status: task.status || activity.status,
    statusText: activity.status === 'queued' && task.statusText
      ? task.statusText
      : activity.statusText || task.statusText || '',
    progress: activity.progress || task.progress || null
  };
  if (task.status === 'failed' && !activity.error) {
    merged.error = { message: task.error || 'Agent research failed.' };
  }
  if (isTerminalTaskStatus(task.status) && !merged.completedAt) {
    merged.completedAt = Number(task.completedAt || task.updatedAt || 0);
  }
  return merged;
}

function agentPillKind(activity) {
  if (activity.status === 'queued' || activity.status === 'running') return 'running';
  if (activity.status === 'waiting_user_action') return 'waiting';
  if (isAgentAnswerUnopened(activity)) {
    return activity.status === 'completed' ? 'ready' : 'failed';
  }
  return '';
}

// Chooses what the topic view shows for Agent research: the latest recent,
// undismissed run on the current forum as an inline panel, otherwise a pill
// pointing at a run on another forum that still needs attention.
export function selectAgentRunView(activities = [], currentSiteUrl = '', {
  now = Date.now(),
  preferredId = '',
  windowMs = AGENT_RECENT_WINDOW_MS
} = {}) {
  const current = normalizeSiteUrl(currentSiteUrl);
  const candidates = activities
    .filter(activity =>
      activity?.activityId
      && !activity.dismissedAt
      && activity.status !== 'expired'
      && isRecentAgentRun(activity, now, windowMs)
    )
    .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));

  if (current) {
    const own = candidates.filter(activity => normalizeSiteUrl(activity.siteUrl) === current);
    const activity = own.find(candidate => candidate.activityId === preferredId) || own[0];
    if (activity) {
      return { mode: 'panel', activity, kind: '' };
    }
  }

  for (const activity of candidates) {
    const siteUrl = normalizeSiteUrl(activity.siteUrl);
    const kind = siteUrl && siteUrl !== current ? agentPillKind(activity) : '';
    if (kind) {
      return { mode: 'pill', activity, kind };
    }
  }
  return { mode: 'none', activity: null, kind: '' };
}

// Saved lists finished answers for a day, and kept ones until unkept.
export function selectSavedAgentActivities(activities = [], {
  now = Date.now(),
  windowMs = AGENT_RECENT_WINDOW_MS
} = {}) {
  return activities.filter(activity =>
    activity?.status === 'completed'
    && (activity.kept === true || now - agentRunTime(activity) <= windowMs)
  );
}

function trimEllipsis(value) {
  return String(value || '').trim().replace(/(\.\.\.|…)$/u, '').trim();
}

export function describeAgentProgress(activity = {}) {
  if (activity.status === 'queued') {
    return { label: 'Queued · waiting for an available worker…', percent: null };
  }
  const parts = [];
  const searches = Array.isArray(activity.searchQueries) ? activity.searchQueries.length : 0;
  if (searches) {
    parts.push(`Searched ${searches} ${searches === 1 ? 'query' : 'queries'}`);
  }
  const step = trimEllipsis(activity.statusText) || 'Starting forum research';
  parts.push(parts.length ? step.charAt(0).toLocaleLowerCase() + step.slice(1) : step);
  const percent = Number.isFinite(activity.progress?.percent) && activity.phase !== 'generating'
    ? activity.progress.percent
    : null;
  return { label: `${parts.join(' · ')}…`, percent };
}

const CITATION_PATTERN = /\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g;
const CITATION_SKIP_TAG = /^<(\/?)(a|code|pre)\b/i;

// Turns [S1] and [S1, S2] in sanitized answer HTML into in-panel source links.
// Text inside links and code is left alone, as are unknown source IDs.
export function linkifyCitations(html, sourceIds = []) {
  const known = new Set(sourceIds);
  if (!html || !known.size) {
    return html || '';
  }
  let skipDepth = 0;
  return html.split(/(<[^>]*>)/).map(chunk => {
    if (chunk.startsWith('<')) {
      const tag = CITATION_SKIP_TAG.exec(chunk);
      if (tag) {
        skipDepth = Math.max(0, skipDepth + (tag[1] ? -1 : 1));
      }
      return chunk;
    }
    if (skipDepth) {
      return chunk;
    }
    return chunk.replace(CITATION_PATTERN, (match, ids) => {
      const list = ids.split(/\s*[,;]\s*/);
      if (!list.some(id => known.has(id))) {
        return match;
      }
      // Known sources become chips; an unknown ID keeps its brackets as text.
      return list.map(id => known.has(id)
        ? `<a href="#" class="agent-citation" data-citation="${id}" aria-label="Source ${id}">${id}</a>`
        : `[${id}]`).join(' ');
    });
  }).join('');
}

export function getChatCountLabel(history = []) {
  const questionCount = history.filter(message => message.role === 'user').length;
  if (!questionCount) return 'Start a conversation';
  return `${questionCount} ${questionCount === 1 ? 'question' : 'questions'} asked`;
}

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

// The status line shown when nothing is running. While setup is needed the
// setup card is the call to action, so no status competes with it.
export function resolveIdleStatus({
  isForumTopic = false,
  isDiscourse = false,
  needsSetup = false,
  agentPanelShown = false
} = {}) {
  if (needsSetup) {
    return null;
  }
  if (!isForumTopic && isDiscourse) {
    return agentPanelShown
      ? null
      : { message: 'Ask the forum to search across discussions', type: 'info' };
  }
  if (!isForumTopic) {
    return { message: 'Open a Discourse forum topic to get started', type: 'info' };
  }
  return null;
}

// Quiet re-renders (settings changes, session reloads) normally leave the
// status line alone, but a change in whether the provider is usable must
// re-derive it, and a "set up your provider" message must not outlive setup.
export function shouldRederiveStatus({
  announce = false,
  settingsValid = false,
  previousSettingsValid,
  statusKind = ''
} = {}) {
  if (announce) {
    return true;
  }
  if (previousSettingsValid !== undefined && previousSettingsValid !== settingsValid) {
    return true;
  }
  return statusKind === 'setup' && settingsValid;
}

// "just now", "5m ago", "3h ago", "2d ago".
export function formatRelativeTime(timestamp, now = Date.now()) {
  const elapsed = Math.max(0, now - Number(timestamp || 0));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
