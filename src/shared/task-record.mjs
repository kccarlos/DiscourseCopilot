import { normalizeForumContextLimit } from './chat-context-limit.mjs';
import { normalizeTaskLimits } from './preferences.mjs';
import {
  buildTopicKey,
  forumDisplayName,
  normalizeSiteUrl,
  siteUrlFromPageUrl
} from './forum-site.mjs';

export const TASK_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_TASK_RECORDS = 100;

export const TASK_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING_USER_ACTION: 'waiting_user_action',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const TASK_TYPE = Object.freeze({
  SUMMARY: 'summary',
  CHAT: 'chat',
  AGENT: 'agent'
});

const VALID_STATUSES = new Set(Object.values(TASK_STATUS));
const VALID_TYPES = new Set(Object.values(TASK_TYPE));

export function isTerminalTaskStatus(status) {
  return status === TASK_STATUS.COMPLETED
    || status === TASK_STATUS.FAILED
    || status === TASK_STATUS.CANCELLED;
}

export function isActiveTaskStatus(status) {
  return status === TASK_STATUS.QUEUED || status === TASK_STATUS.RUNNING;
}

function stringValue(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function timestamp(value, fallback = 0) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function taskSiteUrl(value) {
  // Older records only stored the topic URL; derive its root-install site.
  return normalizeSiteUrl(value?.siteUrl)
    || siteUrlFromPageUrl(stringValue(value?.url, 2000));
}

export function createTaskRecord(value, now = Date.now()) {
  const id = stringValue(value?.id, 120);
  const topicId = stringValue(value?.topicId, 120);
  const type = VALID_TYPES.has(value?.type) ? value.type : null;
  const agentRunId = stringValue(value?.agentRunId, 120) || id;
  if (!id || !type || (type !== TASK_TYPE.AGENT && !topicId)) {
    throw new Error(type === TASK_TYPE.AGENT
      ? 'Task ID and supported task type are required'
      : 'Task ID, topic ID, and supported task type are required');
  }
  const siteUrl = taskSiteUrl(value);
  const topicKey = type === TASK_TYPE.AGENT ? '' : buildTopicKey(siteUrl, topicId);
  if (type !== TASK_TYPE.AGENT && !topicKey) {
    throw new Error('A valid forum site URL and topic ID are required');
  }

  return {
    id,
    type,
    topicId: topicId || null,
    siteUrl,
    topicKey,
    resourceKey: type === TASK_TYPE.AGENT
      ? `agent:${agentRunId}`
      : `topic:${topicKey}`,
    agentRunId: type === TASK_TYPE.AGENT ? agentRunId : '',
    clientRequestId: type === TASK_TYPE.AGENT
      ? stringValue(value.clientRequestId, 120)
      : '',
    retryOf: type === TASK_TYPE.AGENT
      ? stringValue(value.retryOf, 120)
      : '',
    // Agent records always carry a display name; topic work keeps only the
    // name the page reported so a hostname fallback never masks a real name.
    forumName: type === TASK_TYPE.AGENT
      ? (siteUrl ? forumDisplayName(siteUrl, value.forumName) : '')
      : stringValue(value.forumName, 120),
    title: stringValue(value.title, 500)
      || (type === TASK_TYPE.AGENT
        ? stringValue(value.question, 160) || 'Ask the forum'
        : `Topic ${topicId}`),
    url: stringValue(value.url, 2000),
    question: type === TASK_TYPE.CHAT || type === TASK_TYPE.AGENT
      ? stringValue(value.question, type === TASK_TYPE.AGENT ? 4000 : 2000)
      : '',
    ...(type === TASK_TYPE.CHAT
      ? { maxPostChars: normalizeForumContextLimit(value.maxPostChars) }
      : {}),
    // The research / page limits snapshotted when the task was queued (see
    // snapshotTaskLimits); null on records that predate them.
    limits: normalizeTaskLimits(type, value.limits),
    provider: stringValue(value.provider, 80),
    model: stringValue(value.model, 300),
    status: TASK_STATUS.QUEUED,
    phase: 'queued',
    statusText: 'Waiting for an available worker…',
    progress: null,
    error: '',
    createdAt: now,
    updatedAt: now,
    startedAt: 0,
    completedAt: 0
  };
}

export function normalizeTaskRecord(value, now = Date.now()) {
  const base = createTaskRecord(value, timestamp(value?.createdAt, now));
  const status = VALID_STATUSES.has(value.status)
    ? value.status
    : TASK_STATUS.QUEUED;
  const progress = value.progress && typeof value.progress === 'object'
    ? {
        percent: Number.isFinite(value.progress.percent)
          ? Math.max(0, Math.min(100, value.progress.percent))
          : null,
        currentPage: Number.isFinite(value.progress.currentPage)
          ? Math.max(0, value.progress.currentPage)
          : null,
        totalPages: Number.isFinite(value.progress.totalPages)
          ? Math.max(0, value.progress.totalPages)
          : null,
        totalPosts: Number.isFinite(value.progress.totalPosts)
          ? Math.max(0, value.progress.totalPosts)
          : null,
        processedPosts: Number.isFinite(value.progress.processedPosts)
          ? Math.max(0, value.progress.processedPosts)
          : null,
        // The topic's real size when the page limit cut the read short.
        truncatedFromPosts: Number.isFinite(value.progress.truncatedFromPosts)
          ? Math.max(0, value.progress.truncatedFromPosts)
          : null,
        etaMs: Number.isFinite(value.progress.etaMs)
          ? Math.max(0, value.progress.etaMs)
          : null,
        rateLimited: value.progress.rateLimited === true,
        retryPage: Number.isInteger(value.progress.retryPage)
          ? Math.max(0, value.progress.retryPage)
          : null,
        retryAttempt: Number.isInteger(value.progress.retryAttempt)
          ? Math.max(0, value.progress.retryAttempt)
          : null,
        maxRetries: Number.isInteger(value.progress.maxRetries)
          ? Math.max(0, value.progress.maxRetries)
          : null,
        retryAfterMs: Number.isFinite(value.progress.retryAfterMs)
          ? Math.max(0, value.progress.retryAfterMs)
          : null,
        completedSteps: Number.isFinite(value.progress.completedSteps)
          ? Math.max(0, value.progress.completedSteps)
          : null,
        totalSteps: Number.isFinite(value.progress.totalSteps)
          ? Math.max(0, value.progress.totalSteps)
          : null,
        sourceCount: Number.isFinite(value.progress.sourceCount)
          ? Math.max(0, value.progress.sourceCount)
          : null
      }
    : null;

  return {
    ...base,
    status,
    phase: stringValue(value.phase, 80) || base.phase,
    statusText: stringValue(value.statusText, 500) || base.statusText,
    progress,
    error: stringValue(value.error, 1000),
    createdAt: timestamp(value.createdAt, base.createdAt),
    updatedAt: timestamp(value.updatedAt, base.updatedAt),
    startedAt: timestamp(value.startedAt),
    completedAt: timestamp(value.completedAt)
  };
}
