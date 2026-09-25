import { TASK_STATUS, isTerminalTaskStatus } from './task-record.mjs';
import { buildTopicKey, forumDisplayName, isSameForumUrl, normalizeSiteUrl, siteUrlFromPageUrl } from './forum-site.mjs';

// Default retention (the "1 day" history setting); the effective value comes
// from resolveRetention(preferences).agentMs.
export const AGENT_ACTIVITY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_AGENT_ACTIVITIES = 100;
// Sized for the largest research budget in preferences.mjs: 4 queries × 3
// result pages, and 12 discussions × (metadata + posts + raw fallback).
export const MAX_AGENT_SEARCH_QUERIES = 12;
export const MAX_AGENT_TOOL_CALLS = 60;
export const MAX_AGENT_SOURCES = 16;
export const MAX_AGENT_ANSWER_CHARS = 120000;

export const AGENT_ACTIVITY_STATUS = Object.freeze({
  QUEUED: TASK_STATUS.QUEUED,
  RUNNING: TASK_STATUS.RUNNING,
  WAITING_USER_ACTION: TASK_STATUS.WAITING_USER_ACTION,
  COMPLETED: TASK_STATUS.COMPLETED,
  FAILED: TASK_STATUS.FAILED,
  CANCELLED: TASK_STATUS.CANCELLED,
  EXPIRED: 'expired'
});

const VALID_STATUSES = new Set(Object.values(AGENT_ACTIVITY_STATUS));

function text(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function timestamp(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? String(number) : '';
}

function normalizeProgress(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    percent: Number.isFinite(value.percent) ? Math.max(0, Math.min(100, value.percent)) : null,
    completedSteps: Number.isFinite(value.completedSteps) ? Math.max(0, value.completedSteps) : null,
    totalSteps: Number.isFinite(value.totalSteps) ? Math.max(0, value.totalSteps) : null,
    sourceCount: Number.isFinite(value.sourceCount) ? Math.max(0, value.sourceCount) : null,
    currentPage: Number.isFinite(value.currentPage) ? Math.max(0, value.currentPage) : null,
    totalPages: Number.isFinite(value.totalPages) ? Math.max(0, value.totalPages) : null,
    etaMs: Number.isFinite(value.etaMs) ? Math.max(0, value.etaMs) : null,
    rateLimited: value.rateLimited === true,
    retryAfterMs: Number.isFinite(value.retryAfterMs) ? Math.max(0, value.retryAfterMs) : null
  };
}

function normalizeError(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const message = text(value, 1000);
    return message
      ? {
          code: 'AGENT_ERROR',
          message,
          retryable: true,
          needsUserAction: false,
          retryAfterAt: 0
        }
      : null;
  }

  const message = text(value.message, 1000);
  if (!message) {
    return null;
  }
  return {
    code: text(value.code, 80) || 'AGENT_ERROR',
    message,
    retryable: value.retryable !== false,
    needsUserAction: value.needsUserAction === true,
    retryAfterAt: timestamp(value.retryAfterAt)
  };
}

function normalizeSearchQuery(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const query = text(value.query, 240);
  if (!query) {
    return null;
  }
  return {
    query,
    page: Number.isInteger(value.page) && value.page > 0 ? value.page : 1,
    resultCount: Number.isFinite(value.resultCount) ? Math.max(0, value.resultCount) : null,
    startedAt: timestamp(value.startedAt),
    completedAt: timestamp(value.completedAt)
  };
}

function normalizeToolCall(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const name = text(value.name, 80);
  if (!name) {
    return null;
  }
  const argumentSummary =
    value.argumentSummary && typeof value.argumentSummary === 'object'
      ? Object.fromEntries(
          Object.entries(value.argumentSummary)
            .slice(0, 12)
            .map(([key, entry]) => [text(key, 80), text(entry, 240)])
            .filter(([key]) => key)
        )
      : {};
  return {
    callId: text(value.callId, 120),
    name,
    argumentSummary,
    status: text(value.status, 40) || 'completed',
    startedAt: timestamp(value.startedAt),
    completedAt: timestamp(value.completedAt),
    resultCount: Number.isFinite(value.resultCount) ? Math.max(0, value.resultCount) : null,
    error: text(value.error, 500)
  };
}

function normalizeSource(value, index, activitySiteUrl = '') {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const topicId = positiveInteger(value.topicId);
  if (!topicId) {
    return null;
  }
  const postId = positiveInteger(value.postId);
  const requestedSourceId = text(value.sourceId, 20);
  const sourceId = /^S\d+$/.test(requestedSourceId) ? requestedSourceId : `S${index + 1}`;
  const url = text(value.url, 2000);
  // Older sources had no site URL; their stored link was built for a root
  // install, so it identifies the forum.
  const siteUrl = normalizeSiteUrl(value.siteUrl) || activitySiteUrl || siteUrlFromPageUrl(url);
  const source = {
    sourceId,
    topicId,
    siteUrl,
    topicKey: buildTopicKey(siteUrl, topicId),
    title: text(value.title, 500) || `Topic ${topicId}`,
    // Links are only kept when they point at the source's own forum.
    url: siteUrl && isSameForumUrl(url, siteUrl) ? url : '',
    postNumber: Number.isInteger(value.postNumber) && value.postNumber > 0 ? value.postNumber : null,
    excerpt: text(value.excerpt, 5000),
    evidenceType: text(value.evidenceType, 40) || 'post',
    retrievedAt: timestamp(value.retrievedAt)
  };
  if (postId) {
    source.postId = postId;
  }
  return source;
}

export function isAgentActivityTerminal(status) {
  return (
    status === AGENT_ACTIVITY_STATUS.COMPLETED
    || status === AGENT_ACTIVITY_STATUS.FAILED
    || status === AGENT_ACTIVITY_STATUS.CANCELLED
    || status === AGENT_ACTIVITY_STATUS.EXPIRED
    || isTerminalTaskStatus(status)
  );
}

export function createAgentActivity(value, now = Date.now()) {
  const activityId = text(value?.activityId || value?.agentRunId || value?.taskId, 120);
  const taskId = text(value?.taskId, 120);
  const agentRunId = text(value?.agentRunId || activityId, 120);
  const question = text(value?.question, 4000);
  if (!activityId || !taskId || !agentRunId || !question) {
    throw new Error('Agent activity ID, task ID, run ID, and question are required');
  }

  const siteUrl = normalizeSiteUrl(value?.siteUrl);
  const completedAt = timestamp(value?.completedAt);
  const terminal = isAgentActivityTerminal(value?.status);
  const legacyExpiresAt = timestamp(value?.expiresAt);
  // When the retention period starts: completion, or the moment the run was
  // unkept. Records from before this field existed derive it from their
  // expiry under the old fixed one-day retention.
  const retainedFrom = timestamp(
    value?.retainedFrom,
    legacyExpiresAt > AGENT_ACTIVITY_RETENTION_MS ? legacyExpiresAt - AGENT_ACTIVITY_RETENTION_MS : completedAt
  );
  return {
    schemaVersion: 1,
    activityId,
    activityType: 'agent',
    taskId,
    agentRunId,
    title: text(value?.title, 500) || question.slice(0, 120),
    question,
    siteUrl,
    forumName: siteUrl ? forumDisplayName(siteUrl, value?.forumName) : '',
    searchQueries: [],
    toolCalls: [],
    sourceRefs: [],
    answer: '',
    answerStatus: 'pending',
    status: AGENT_ACTIVITY_STATUS.QUEUED,
    phase: 'queued',
    statusText: 'Waiting for an available worker…',
    progress: null,
    error: null,
    provider: text(value?.provider, 80),
    model: text(value?.model, 300),
    createdAt: timestamp(value?.createdAt, now),
    updatedAt: timestamp(value?.updatedAt, now),
    startedAt: timestamp(value?.startedAt),
    completedAt,
    retainedFrom,
    // Informational copy of agentActivityExpiry() under the retention that
    // was in force when the record was last saved; cleanup and labels always
    // recompute it from retainedFrom and the current retention.
    expiresAt: timestamp(value?.expiresAt, terminal && retainedFrom > 0 ? retainedFrom + AGENT_ACTIVITY_RETENTION_MS : 0),
    kept: value?.kept === true,
    retryOf: text(value?.retryOf, 120),
    lastOpenedAt: timestamp(value?.lastOpenedAt),
    dismissedAt: timestamp(value?.dismissedAt)
  };
}

// The activity record a queued Agent task starts with. `withTimestamps`
// carries the task's own timestamps (the side panel's optimistic copy).
export function agentActivityFromTask(task, { withTimestamps = false } = {}) {
  const runId = task?.agentRunId || task?.id;
  return createAgentActivity({
    activityId: runId,
    taskId: task?.id,
    agentRunId: runId,
    title: task?.title,
    question: task?.question || task?.title,
    siteUrl: task?.siteUrl,
    forumName: task?.forumName,
    provider: task?.provider,
    model: task?.model,
    retryOf: task?.retryOf,
    ...(withTimestamps ? { createdAt: task?.createdAt, updatedAt: task?.updatedAt } : {})
  });
}

/**
 * When an activity expires under a retention period (0 = never): kept runs,
 * unfinished runs (including those waiting for the user) and "no time limit"
 * never expire; others expire `retentionMs` after retainedFrom.
 */
export function agentActivityExpiry(activity, retentionMs = AGENT_ACTIVITY_RETENTION_MS) {
  if (!activity || activity.kept || !isAgentActivityTerminal(activity.status)) {
    return 0;
  }
  if (!Number.isFinite(retentionMs)) {
    return 0;
  }
  const from = timestamp(activity.retainedFrom) || timestamp(activity.completedAt);
  return from > 0 ? from + Math.max(0, retentionMs) : 0;
}

export function isAgentActivityExpired(activity, retentionMs, now = Date.now()) {
  const expiresAt = agentActivityExpiry(activity, retentionMs);
  return expiresAt > 0 && expiresAt <= now;
}

export function normalizeAgentActivity(value, now = Date.now()) {
  const base = createAgentActivity(value, timestamp(value?.createdAt, now));
  const status = VALID_STATUSES.has(value?.status) ? value.status : base.status;
  const searchQueries = Array.isArray(value?.searchQueries)
    ? value.searchQueries.map(normalizeSearchQuery).filter(Boolean).slice(0, MAX_AGENT_SEARCH_QUERIES)
    : [];
  const toolCalls = Array.isArray(value?.toolCalls)
    ? value.toolCalls.map(normalizeToolCall).filter(Boolean).slice(0, MAX_AGENT_TOOL_CALLS)
    : [];
  const sourceRefs = Array.isArray(value?.sourceRefs)
    ? value.sourceRefs
        .map((source, index) => normalizeSource(source, index, base.siteUrl))
        .filter(Boolean)
        .slice(0, MAX_AGENT_SOURCES)
    : [];

  return {
    ...base,
    schemaVersion: Number.isInteger(value?.schemaVersion) && value.schemaVersion > 0 ? value.schemaVersion : base.schemaVersion,
    title: text(value?.title, 500) || base.title,
    question: text(value?.question, 4000) || base.question,
    searchQueries,
    toolCalls,
    sourceRefs,
    answer: text(value?.answer, MAX_AGENT_ANSWER_CHARS),
    answerStatus: text(value?.answerStatus, 40) || base.answerStatus,
    status,
    phase: text(value?.phase, 80) || base.phase,
    statusText: text(value?.statusText, 500) || base.statusText,
    progress: normalizeProgress(value?.progress),
    error: normalizeError(value?.error),
    provider: text(value?.provider, 80),
    model: text(value?.model, 300),
    createdAt: timestamp(value?.createdAt, base.createdAt),
    updatedAt: timestamp(value?.updatedAt, base.updatedAt),
    startedAt: timestamp(value?.startedAt),
    completedAt: timestamp(value?.completedAt),
    retainedFrom: base.retainedFrom,
    expiresAt: timestamp(value?.expiresAt, base.expiresAt),
    kept: value?.kept === true,
    retryOf: text(value?.retryOf, 120),
    lastOpenedAt: timestamp(value?.lastOpenedAt),
    dismissedAt: timestamp(value?.dismissedAt)
  };
}

// Viewer marks are written by the side panel while the background may still be
// saving its own snapshot of the same run; they only ever move forward.
export function mergeAgentActivityMarks(activity, stored) {
  if (!stored) {
    return activity;
  }
  return {
    ...activity,
    lastOpenedAt: Math.max(activity.lastOpenedAt || 0, timestamp(stored.lastOpenedAt)),
    dismissedAt: Math.max(activity.dismissedAt || 0, timestamp(stored.dismissedAt))
  };
}

export function buildAgentActivityIndexEntry(value) {
  const activity = normalizeAgentActivity(value);
  return {
    activityId: activity.activityId,
    activityType: activity.activityType,
    taskId: activity.taskId,
    agentRunId: activity.agentRunId,
    title: activity.title,
    question: activity.question,
    siteUrl: activity.siteUrl,
    forumName: activity.forumName,
    status: activity.status,
    answerStatus: activity.answerStatus,
    answerExcerpt: activity.answer
      .replace(/[#*_>`~[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?;:])/g, '$1')
      .trim()
      .slice(0, 240),
    sourceCount: activity.sourceRefs.length,
    kept: activity.kept,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    completedAt: activity.completedAt,
    retainedFrom: activity.retainedFrom,
    expiresAt: activity.expiresAt,
    lastOpenedAt: activity.lastOpenedAt,
    dismissedAt: activity.dismissedAt
  };
}
