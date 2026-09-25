// Agent runs as the side panel sees them: the stored activities, fresher
// queue status merged in, which run the topic view shows (inline panel or
// pill), and the viewer's marks (opened, dismissed, deleted). The selection
// helpers are pure; AgentRuns holds the panel's copy and writes the marks.
import { DiscourseCopilotLogger } from '../shared/logger.js';
import {
  agentActivityFromTask,
  isAgentActivityExpired,
  isAgentActivityTerminal,
  mergeAgentActivityMarks
} from '../shared/agent-activity.mjs';
import { TASK_TYPE, isTerminalTaskStatus } from '../shared/task-record.mjs';
import { normalizeSiteUrl } from '../shared/forum-site.mjs';
import { topicSessionDatabase } from '../shared/topic-session-db.mjs';

export const AGENT_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

// The inline Agent panel and pill follow runs from the last day, or less
// when history is kept for a shorter time than that.
export function agentRecentWindowMs(retention) {
  const agentMs = retention?.agentMs;
  return Number.isFinite(agentMs) || agentMs === Infinity
    ? Math.min(AGENT_RECENT_WINDOW_MS, agentMs)
    : AGENT_RECENT_WINDOW_MS;
}

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

// Saved lists finished answers until they expire under the history setting
// (`windowMs` = retention; the same rule cleanup applies), and kept ones
// until unkept.
export function selectSavedAgentActivities(activities = [], {
  now = Date.now(),
  windowMs = AGENT_RECENT_WINDOW_MS
} = {}) {
  return activities.filter(activity =>
    activity?.status === 'completed'
    && (activity.kept === true || !isAgentActivityExpired(
      { ...activity, retainedFrom: activity.retainedFrom || agentRunTime(activity) },
      windowMs,
      now
    ))
  );
}

const runIdOf = value => String(value?.agentRunId || value?.activityId || value?.id || '');

export class AgentRuns {
  /**
   * @param {object} deps
   * @param {object} deps.tasks TaskRegistry
   * @param {() => boolean} deps.isPersistent whether IndexedDB is usable
   * @param {object} [deps.db]
   */
  constructor({ tasks, isPersistent, db = topicSessionDatabase }) {
    this.tasks = tasks;
    this.isPersistent = isPersistent;
    this.db = db;
    this.activities = new Map();
    // Streamed answer text per task ID.
    this.streams = new Map();
    // The run the inline panel follows on each forum (siteUrl → run ID).
    this.currentRuns = new Map();
    // Runs deleted in this panel: a late broadcast must not bring them back.
    this.deletedRunIds = new Set();
    this.openMarks = new Set();
  }

  async load() {
    const activities = await this.db.listAgentActivities();
    this.activities = new Map(activities.map(activity => [activity.activityId, activity]));
  }

  // Stored activities with fresher queue status merged in, plus unfinished
  // runs whose activity has not been broadcast yet. A finished run always
  // has its activity written by the worker; without one it was deleted,
  // expired or pruned, and its task (listed for days) must not rebuild it.
  records() {
    const records = [...this.activities.values()].map(activity =>
      mergeAgentRunState(activity, this.tasks.findAgentTask(activity))
    );
    const known = new Set(records.map(record => record.agentRunId));
    for (const task of this.tasks.values()) {
      const runId = task.agentRunId || task.id;
      if (
        task.type !== TASK_TYPE.AGENT
        || isTerminalTaskStatus(task.status)
        || known.has(runId)
        || this.deletedRunIds.has(runId)
      ) {
        continue;
      }
      const activity = this.fromTask(task);
      if (activity) {
        records.push(mergeAgentRunState(activity, task));
      }
    }
    return records;
  }

  record(activityId) {
    if (!activityId) {
      return null;
    }
    return this.records().find(record => record.activityId === activityId) || null;
  }

  fromTask(task) {
    try {
      return agentActivityFromTask(task, { withTimestamps: true });
    } catch {
      return null;
    }
  }

  // Shows a just-queued run right away; the worker's activity replaces it.
  trackQueuedTask(task) {
    const activity = this.fromTask(task);
    if (!activity) {
      return null;
    }
    if (!this.activities.has(activity.activityId)) {
      this.activities.set(activity.activityId, activity);
    }
    if (activity.siteUrl) {
      this.currentRuns.set(activity.siteUrl, activity.activityId);
    }
    return activity;
  }

  // Merges freshly listed activities, keeping this panel's open/dismiss marks.
  absorb(activities) {
    for (const activity of activities) {
      this.activities.set(
        activity.activityId,
        mergeAgentActivityMarks(activity, this.activities.get(activity.activityId))
      );
    }
  }

  // A broadcast activity; returns the previous copy, or undefined when the
  // run was deleted here (a late broadcast must not bring it back).
  update(activity) {
    if (this.deletedRunIds.has(runIdOf(activity))) {
      return undefined;
    }
    const previous = this.activities.get(activity.activityId);
    // A broadcast can predate this panel's own open/dismiss write; keep the marks.
    this.activities.set(activity.activityId, mergeAgentActivityMarks(activity, previous));
    if (isAgentActivityTerminal(activity.status)) {
      this.streams.delete(activity.taskId);
    }
    return previous || null;
  }

  async get(value) {
    const activityId = value?.activityId || value?.agentRunId;
    if (!activityId) {
      return null;
    }
    const cached = this.activities.get(String(activityId));
    if (cached) {
      return cached;
    }
    if (!this.isPersistent()) {
      return null;
    }
    const activity = await this.db.getAgentActivity(activityId);
    if (activity) {
      this.activities.set(activity.activityId, activity);
    }
    return activity;
  }

  async markOpened(activity, { force = false } = {}) {
    if (!activity?.activityId || (!force && !isAgentAnswerUnopened(activity))) {
      return;
    }
    const activityId = activity.activityId;
    if (this.openMarks.has(activityId) && !force) {
      return;
    }
    const lastOpenedAt = Date.now();
    const cached = this.activities.get(activityId);
    if (cached) {
      this.activities.set(activityId, { ...cached, lastOpenedAt });
    }
    if (!this.isPersistent()) {
      return;
    }
    this.openMarks.add(activityId);
    try {
      const saved = await this.db.markAgentActivity(activityId, { lastOpenedAt });
      if (saved && this.activities.has(activityId)) {
        this.activities.set(activityId, {
          ...this.activities.get(activityId),
          lastOpenedAt: saved.lastOpenedAt
        });
      }
    } catch (error) {
      DiscourseCopilotLogger.warn('Popup: Unable to record that an Agent answer was opened:', error);
    } finally {
      this.openMarks.delete(activityId);
    }
  }

  // Hides a run from the topic view (the record stays in Activity).
  async dismiss(activity) {
    const now = Date.now();
    const marks = {
      dismissedAt: now,
      // A dismissed answer has been seen; it should not pull Activity to Tasks.
      lastOpenedAt: isAgentActivityTerminal(activity.status) ? now : 0
    };
    const cached = this.activities.get(activity.activityId) || activity;
    this.activities.set(activity.activityId, {
      ...cached,
      dismissedAt: now,
      lastOpenedAt: Math.max(cached.lastOpenedAt || 0, marks.lastOpenedAt)
    });
    if (this.currentRuns.get(activity.siteUrl) === activity.activityId) {
      this.currentRuns.delete(activity.siteUrl);
    }
    if (!this.isPersistent()) {
      return;
    }
    try {
      await this.db.markAgentActivity(activity.activityId, marks);
    } catch (error) {
      DiscourseCopilotLogger.warn('Popup: Unable to save the dismissed Agent answer:', error);
    }
  }

  async setKept(activityId, kept) {
    const saved = await this.db.setAgentActivityKept(activityId, kept);
    this.activities.set(saved.activityId, saved);
    return saved;
  }

  // Deletes a run's stored activity and returns the copy restore() puts back.
  async remove(activity) {
    const cached = this.activities.get(activity.activityId);
    const stored = await this.db.takeAgentActivity(activity.activityId);
    this.deletedRunIds.add(runIdOf(activity));
    this.activities.delete(activity.activityId);
    return stored || cached || activity;
  }

  async restore(copy) {
    const restored = await this.db.restoreAgentActivity(copy);
    this.deletedRunIds.delete(runIdOf(copy));
    this.activities.set(restored.activityId, restored);
    return restored;
  }
}
