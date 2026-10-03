import { TASK_STATUS, isTerminalTaskStatus } from './task-record.mjs';
import { buildTopicKey, forumDisplayName, isSameForumUrl, normalizeSiteUrl, siteUrlFromPageUrl } from './forum-site.mjs';

// Default retention (the "1 day" history setting); the effective value comes
// from resolveRetention(preferences).agentMs.
export const AGENT_ACTIVITY_RETENTION_MS = 24 * 60 * 60 * 1000;
export const MAX_AGENT_ACTIVITIES = 100;
// Sized for the largest agent budget in preferences.mjs (40 steps per
// question) over a handful of follow-ups.
export const MAX_AGENT_STEPS = 200;
export const MAX_AGENT_TURNS = 10;
// Topics the agent read, shown as source cards and cited as [S#].
export const MAX_AGENT_SOURCES = 60;
export const MAX_AGENT_ANSWER_CHARS = 120000;
// The saved transcript (what the model has seen) is what a restart or a
// follow-up continues from; older observations are trimmed to stay under this.
export const MAX_AGENT_TRANSCRIPT_CHARS = 240000;
export const MAX_AGENT_TRANSCRIPT_MESSAGES = 400;
// Legacy records (the fixed research pipeline) kept their searches here.
const MAX_LEGACY_SEARCHES = 12;
const MAX_LEGACY_TOOL_CALLS = 60;

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

function normalizeStep(value, index) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const tool = text(value.tool, 60);
  if (!tool) {
    return null;
  }
  const args =
    value.args && typeof value.args === 'object'
      ? Object.fromEntries(
          Object.entries(value.args)
            .slice(0, 8)
            .map(([key, entry]) => [text(key, 60), text(typeof entry === 'string' ? entry : String(entry ?? ''), 240)])
            .filter(([key]) => key)
        )
      : {};
  // 'running': chosen, not finished (run again after a restart). 'stopped':
  // the run ended while it was running.
  const status = ['running', 'completed', 'failed', 'stopped'].includes(value.status) ? value.status : 'completed';
  const step = {
    id: text(value.id, 40) || `step-${index + 1}`,
    turn: Number.isInteger(value.turn) && value.turn >= 0 ? value.turn : 0,
    tool,
    args,
    reason: text(value.reason, 400),
    status,
    // What the observation said, trimmed; the full text is in the transcript.
    detail: text(value.detail, 1500),
    title: text(value.title, 300),
    resultCount: Number.isFinite(value.resultCount) ? Math.max(0, value.resultCount) : null,
    error: text(value.error, 500),
    startedAt: timestamp(value.startedAt),
    completedAt: timestamp(value.completedAt)
  };
  const topicId = positiveInteger(value.topicId);
  if (topicId) {
    step.topicId = topicId;
  }
  const sourceId = text(value.sourceId, 20);
  if (/^S\d+$/.test(sourceId)) {
    step.sourceId = sourceId;
  }
  return step;
}

function normalizeTurn(value, index) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const turn = {
    id: text(value.id, 120) || `turn-${index + 1}`,
    question: text(value.question, 4000),
    answer: text(value.answer, MAX_AGENT_ANSWER_CHARS),
    startedAt: timestamp(value.startedAt),
    completedAt: timestamp(value.completedAt)
  };
  // The run stopped at its step budget and answered with what it had.
  if (value.outOfBudget === true) {
    turn.outOfBudget = true;
  }
  // Where this turn's messages start in the transcript (so a follow-up that
  // failed can be asked again from a clean state).
  if (Number.isInteger(value.transcriptStart) && value.transcriptStart >= 0) {
    turn.transcriptStart = value.transcriptStart;
  }
  return turn;
}

function normalizeTranscript(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(message => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
    .slice(-MAX_AGENT_TRANSCRIPT_MESSAGES)
    .map(message => ({ role: message.role, content: message.content.slice(0, MAX_AGENT_TRANSCRIPT_CHARS) }));
}

function normalizeBudget(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const number = entry => (Number.isInteger(entry) && entry > 0 ? entry : 0);
  const budget = {
    maxSteps: number(value.maxSteps),
    maxTopicReads: number(value.maxTopicReads),
    maxCharsPerRead: number(value.maxCharsPerRead)
  };
  return budget.maxSteps ? budget : null;
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
    schemaVersion: 2,
    activityId,
    activityType: 'agent',
    taskId,
    agentRunId,
    title: text(value?.title, 500) || question.slice(0, 120),
    question,
    siteUrl,
    forumName: siteUrl ? forumDisplayName(siteUrl, value?.forumName) : '',
    // The agent's work: one entry per tool call, the conversation with the
    // model (for resuming and follow-ups), the question and answer of each
    // turn (the first question and each follow-up) and the budget in force.
    steps: [],
    transcript: [],
    turns: [],
    budget: null,
    // Legacy runs (the fixed research pipeline) keep their searches here.
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
    ? value.searchQueries.map(normalizeSearchQuery).filter(Boolean).slice(0, MAX_LEGACY_SEARCHES)
    : [];
  const toolCalls = Array.isArray(value?.toolCalls)
    ? value.toolCalls.map(normalizeToolCall).filter(Boolean).slice(0, MAX_LEGACY_TOOL_CALLS)
    : [];
  const steps = Array.isArray(value?.steps) ? value.steps.map(normalizeStep).filter(Boolean).slice(0, MAX_AGENT_STEPS) : [];
  const turns = Array.isArray(value?.turns) ? value.turns.map(normalizeTurn).filter(Boolean).slice(0, MAX_AGENT_TURNS) : [];
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
    steps,
    transcript: normalizeTranscript(value?.transcript),
    turns,
    budget: normalizeBudget(value?.budget),
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
    stepCount: activity.steps.length || activity.searchQueries.length,
    followUpCount: Math.max(0, activity.turns.length - 1),
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

// ---------- Steps, turns and the transcript ----------

function countText(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function quoted(value, maxLength = 70) {
  const compact = text(value, 400).replace(/\s+/g, ' ');
  return compact.length > maxLength ? `“${compact.slice(0, maxLength - 1).trimEnd()}…”` : `“${compact}”`;
}

/**
 * One step as the panel shows it: a label ("Searched “rate limit”") and the
 * outcome ("12 results"). The same words appear in the live list, the
 * detail view and the fixtures, so they live here.
 * @returns {{ label: string, meta: string }}
 */
export function describeAgentStep(step = {}) {
  const running = step.status === 'running';
  const stopped = step.status === 'stopped';
  const failed = step.status === 'failed';
  const args = step.args || {};
  const count = Number.isFinite(step.resultCount) ? step.resultCount : null;
  const outcome = (label, meta = '') => ({ label, meta: count === null ? '' : meta });
  switch (step.tool) {
    case 'search_forum': {
      const query = quoted(args.query || '');
      const page = Number(args.page) > 1 ? ` (page ${Number(args.page)})` : '';
      if (running) return { label: `Searching ${query}${page}…`, meta: '' };
      if (stopped) return { label: `Search for ${query}${page}`, meta: 'stopped' };
      if (failed) return { label: `Search failed for ${query}${page}`, meta: '' };
      return outcome(`Searched ${query}${page}`, countText(count ?? 0, 'result'));
    }
    case 'list_latest':
      if (running) return { label: 'Listing latest topics…', meta: '' };
      if (stopped) return { label: 'Listing latest topics', meta: 'stopped' };
      if (failed) return { label: 'Could not list latest topics', meta: '' };
      return outcome('Listed latest topics', countText(count ?? 0, 'topic'));
    case 'read_topic': {
      const title = step.title ? quoted(step.title) : `topic ${text(args.topic_id, 20)}`.trim();
      if (running) return { label: `Reading ${title}…`, meta: '' };
      if (stopped) return { label: `Reading ${title}`, meta: 'stopped' };
      if (failed) return { label: `Could not read ${title}`, meta: '' };
      return outcome(`Read ${title}`, `(${countText(count ?? 0, 'post')})`);
    }
    case 'plan':
      return { label: 'The model did not reply with a valid action', meta: '' };
    case 'saved_summaries': {
      const query = args.query ? ` for ${quoted(args.query, 40)}` : '';
      if (running) return { label: `Checking your saved summaries${query}…`, meta: '' };
      if (stopped) return { label: `Checking your saved summaries${query}`, meta: 'stopped' };
      if (failed) return { label: 'Could not check your saved summaries', meta: '' };
      return outcome(`Checked your saved summaries${query}`, `${count ?? 0} found`);
    }
    default:
      return {
        label: running ? `Running ${step.tool}…` : failed ? `${step.tool} failed` : `Ran ${step.tool}`,
        meta: stopped ? 'stopped' : ''
      };
  }
}

// "Searched “x” · 12 results", "Read “Title” (42 posts)".
export function agentStepText(step) {
  const { label, meta } = describeAgentStep(step);
  if (!meta) return label;
  return meta.startsWith('(') ? `${label} ${meta}` : `${label} · ${meta}`;
}

// Steps for a run: the saved ones, or, for a legacy run (the fixed research
// pipeline, which recorded only its searches), one step per search.
export function agentStepsOf(activity) {
  if (activity?.steps?.length) {
    return activity.steps;
  }
  return (activity?.searchQueries || []).map((search, index) => ({
    id: `legacy-${index + 1}`,
    turn: 0,
    tool: 'search_forum',
    args: { query: search.query, ...(search.page > 1 ? { page: String(search.page) } : {}) },
    reason: '',
    status: 'completed',
    detail: '',
    title: '',
    resultCount: search.resultCount,
    error: '',
    startedAt: search.startedAt,
    completedAt: search.completedAt
  }));
}

// The question/answer pairs of a run. Runs from before follow-ups have no
// turns; their one question and answer stand in.
export function agentTurnsOf(activity) {
  if (activity?.turns?.length) {
    return activity.turns;
  }
  return [
    {
      id: activity?.taskId || 'turn-1',
      question: activity?.question || '',
      answer: activity?.answer || '',
      startedAt: activity?.startedAt || 0,
      completedAt: activity?.completedAt || 0
    }
  ];
}

// Index of the turn the run is working on (the last one).
export function currentAgentTurnIndex(activity) {
  return Math.max(0, agentTurnsOf(activity).length - 1);
}

// A run that ends while a step is still running (cancelled, failed) shows
// that step as stopped or failed instead of busy.
export function settleRunningAgentSteps(steps = [], { status = 'stopped', error = '', now = Date.now() } = {}) {
  return steps.map(step =>
    step.status === 'running' ? { ...step, status, error: status === 'failed' ? text(error, 500) : step.error, completedAt: now } : step
  );
}

// A follow-up starts a new turn on the same run: the run goes back to
// queued, keeps its steps, transcript and sources, and the newest task owns
// it (the panel matches streamed text by task ID). A follow-up that never got
// an answer (it failed or was stopped) is replaced, not stacked: its steps
// and messages are dropped first.
export function appendAgentTurn(activity, { taskId, question, now = Date.now() }) {
  const turns = agentTurnsOf(activity).map(turn => ({ ...turn }));
  let steps = activity.steps || [];
  let transcript = activity.transcript || [];
  const lastIndex = turns.length - 1;
  if (lastIndex > 0 && !turns[lastIndex].answer) {
    const dropped = turns.pop();
    steps = steps.filter(step => step.turn < lastIndex);
    if (dropped.startedAt > 0 && Number.isInteger(dropped.transcriptStart)) {
      transcript = transcript.slice(0, dropped.transcriptStart);
    }
  }
  turns.push({ id: taskId, question: text(question, 4000), answer: '', startedAt: 0, completedAt: 0 });
  return {
    ...activity,
    steps,
    transcript,
    turns: turns.slice(-MAX_AGENT_TURNS),
    taskId,
    status: AGENT_ACTIVITY_STATUS.QUEUED,
    phase: 'queued',
    statusText: 'Waiting for an available worker…',
    error: null,
    progress: null,
    completedAt: 0,
    retainedFrom: 0,
    updatedAt: now
  };
}

/**
 * Keeps a transcript under `maxChars` by trimming the oldest observations
 * (user messages after the first one) first, then the oldest assistant
 * messages. The goal (first message) and the newest messages stay whole.
 */
export function compactAgentTranscript(transcript, maxChars = MAX_AGENT_TRANSCRIPT_CHARS) {
  const messages = transcript.map(message => ({ ...message }));
  const total = () => messages.reduce((sum, message) => sum + message.content.length, 0);
  const KEEP = 1500;
  const TRIMMED = '\n[…trimmed to save space…]';
  for (const role of ['user', 'assistant']) {
    for (let index = 1; index < messages.length - 2 && total() > maxChars; index++) {
      const message = messages[index];
      if (message.role === role && message.content.length > KEEP + TRIMMED.length) {
        message.content = message.content.slice(0, KEEP) + TRIMMED;
      }
    }
  }
  return messages;
}
