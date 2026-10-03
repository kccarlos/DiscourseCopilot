// Executor for Agent tasks: runs the agent loop (agent-loop.mjs) for a
// question or a follow-up and keeps the task's activity record (steps,
// transcript, sources, answers, outcome) up to date for the side panel. The
// record is what makes a run resumable: after a worker restart, or after the
// user allows forum access, the same task continues from the last saved step.
import {
  AGENT_ACTIVITY_STATUS,
  agentActivityFromTask,
  agentTurnsOf,
  currentAgentTurnIndex,
  settleRunningAgentSteps
} from '../shared/agent-activity.mjs';
import { TASK_STATUS } from '../shared/task-record.mjs';
import { normalizeSiteUrl } from '../shared/forum-site.mjs';
import { isAbortError } from '../shared/rate-limit-retry.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { FORUM_ACCESS_ERROR_CODE, forumAccessMessage, isForumAccessError } from '../shared/forum-access.mjs';
import { clampAgentBudget } from '../shared/preferences.mjs';
import { ForumToolClient, ForumToolError } from './forum-tools.mjs';
import { runAgentLoop } from './agent-loop.mjs';

const { MESSAGES } = DiscourseCopilotConstants;

const LOGIN_REQUIRED_TEXT = 'Forum login or verification is required';
export const FORUM_ACCESS_REQUIRED_TEXT = 'Waiting for forum access';

// The run waits (WAITING_USER_ACTION) until the user enables the forum and
// chooses Continue.
function forumAccessToolError(siteUrl) {
  return new ForumToolError(FORUM_ACCESS_ERROR_CODE, forumAccessMessage(siteUrl), {
    retryable: false,
    needsUserAction: true
  });
}

export function isAgentUserActionError(error) {
  return error instanceof ForumToolError && error.needsUserAction === true;
}

function waitingStatusText(error) {
  return isForumAccessError(error) ? FORUM_ACCESS_REQUIRED_TEXT : LOGIN_REQUIRED_TEXT;
}

export function agentActivityError(error, fallbackCode = 'AGENT_ERROR') {
  return {
    code: error?.code || fallbackCode,
    message: String(error?.message || error || 'Agent task failed').slice(0, 1000),
    retryable: error?.retryable !== false,
    needsUserAction: error?.needsUserAction === true,
    retryAfterAt: error?.retryAfterMs ? Date.now() + Math.max(0, error.retryAfterMs) : 0
  };
}

// The activity patch for a run that ended without an answer.
export function agentFailurePatch(error, { cancelled, needsUserAction }, now = Date.now()) {
  const finished = cancelled || !needsUserAction;
  return {
    status: cancelled
      ? AGENT_ACTIVITY_STATUS.CANCELLED
      : needsUserAction
        ? AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION
        : AGENT_ACTIVITY_STATUS.FAILED,
    phase: cancelled ? 'cancelled' : needsUserAction ? 'waiting_user_action' : 'failed',
    statusText: cancelled ? 'Cancelled' : needsUserAction ? waitingStatusText(error) : 'Failed',
    error: cancelled ? null : agentActivityError(error),
    // A run waiting for the user stays open and never expires on its own.
    // Retention counts from retainedFrom; the database derives expiresAt
    // from it with the current history setting.
    completedAt: finished ? now : 0,
    retainedFrom: finished ? now : 0
  };
}

/**
 * @param {object} deps
 * @param {object} deps.aiService AIService
 * @param {object} deps.activities AgentActivityStore
 * @param {(message: object) => void} deps.broadcast
 * @param {(task: object) => Promise<object>} deps.getTaskConfiguration
 * @param {object} deps.governor ForumRequestGovernor shared by all Agent runs
 * @param {(siteUrl: string) => Promise<boolean>} [deps.hasForumAccess] whether the
 *   user enabled the forum (forum-access.mjs)
 * @param {{list: Function, get: Function}} [deps.savedSummaries] the saved-summary
 *   store the saved_summaries tool reads (default: the history database)
 */
export function createAgentExecutor({
  aiService,
  activities,
  broadcast,
  getTaskConfiguration,
  governor,
  hasForumAccess = async () => true,
  savedSummaries = {
    list: () => activities.db.list(),
    get: topicKey => activities.db.get(topicKey)
  }
}) {
  return async function executeAgentTask(task, { signal, report }) {
    let activity = await activities.get(task.agentRunId || task.id);
    if (!activity) {
      activity = await activities.create(agentActivityFromTask(task));
    }

    // A restarted task whose answer was already written is done.
    const turn = agentTurnsOf(activity)[currentAgentTurnIndex(activity)];
    if (activity.status === AGENT_ACTIVITY_STATUS.COMPLETED && turn?.answer) {
      activities.announce(activity);
      return;
    }

    activity = await activities.update(
      activity,
      {
        status: AGENT_ACTIVITY_STATUS.RUNNING,
        phase: activity.steps.length ? 'resuming' : 'starting',
        statusText: activity.steps.length ? 'Continuing…' : 'Starting forum research…',
        error: null,
        startedAt: activity.startedAt || Date.now()
      },
      { prune: false }
    );

    const updateActivity = async (patch, { durable = true } = {}) => {
      activity = await activities.update(activity, patch, { prune: durable });
      return activity;
    };

    try {
      const siteUrl = normalizeSiteUrl(task.siteUrl);
      if (!siteUrl) {
        throw Object.assign(new Error('This Agent task has no forum site. Ask again from the forum page.'), { retryable: false });
      }
      if (!(await hasForumAccess(siteUrl))) {
        throw forumAccessToolError(siteUrl);
      }
      const toolClient = new ForumToolClient({ siteUrl, signal, governor });

      const configuration = await getTaskConfiguration(task);
      const result = await runAgentLoop({
        activity,
        // Snapshotted when the task was queued (task-service.mjs); each
        // follow-up is its own task, so it carries a fresh budget.
        budget: clampAgentBudget(configuration.limits?.agent),
        forumName: configuration.forumName,
        responseLanguage: configuration.responseLanguage,
        customInstructions: configuration.systemPrompt,
        signal,
        toolClient,
        savedSummaries,
        save: async (patch, options) => {
          await updateActivity(patch, options);
        },
        planAction: (system, messages) =>
          aiService.completeAgentStep(configuration.provider, { system, messages }, configuration.settings, { abortSignal: signal }),
        writeAnswer: ({ system, messages, onStream }) =>
          aiService.streamAgentAnswer(configuration.provider, { system, messages }, configuration.settings, {
            abortSignal: signal,
            onStream
          }),
        report: patch => report(patch, { durable: false }),
        onStream: chunk => {
          broadcast({
            action: MESSAGES.TASK_STREAM,
            taskId: task.id,
            agentRunId: activity.agentRunId,
            type: task.type,
            chunk
          });
        }
      });

      const completedAt = Date.now();
      activity = await updateActivity(
        {
          ...result.patch,
          status: AGENT_ACTIVITY_STATUS.COMPLETED,
          phase: 'completed',
          statusText: result.outOfBudget ? 'Completed at the step limit' : 'Completed',
          completedAt,
          retainedFrom: completedAt,
          progress: {
            percent: 100,
            completedSteps: result.patch.steps.filter(step => step.turn === currentAgentTurnIndex(activity)).length,
            totalSteps: result.patch.budget.maxSteps,
            sourceCount: result.patch.sourceRefs.length,
            etaMs: 0
          },
          error: null
        },
        { durable: true }
      );
      await report(
        {
          phase: 'completed',
          statusText: activity.statusText,
          progress: activity.progress
        },
        { durable: true }
      );
    } catch (caught) {
      const cancelled = isAbortError(caught) || signal.aborted;
      // Access removed while the run was researching: the browser refuses
      // the forum requests. Wait for the user instead of failing.
      const error =
        !cancelled && !isForumAccessError(caught) && task.siteUrl && !(await hasForumAccess(task.siteUrl))
          ? forumAccessToolError(task.siteUrl)
          : caught;
      const needsUserAction = !cancelled && (isAgentUserActionError(error) || error?.needsUserAction === true);
      const failure = agentFailurePatch(error, { cancelled, needsUserAction });
      await updateActivity(
        // A run that ends shows its busy step as stopped or failed; one that
        // waits keeps it, to run it again on Continue.
        needsUserAction
          ? failure
          : {
              ...failure,
              steps: settleRunningAgentSteps(activity.steps, { status: cancelled ? 'stopped' : 'failed', error: failure.error?.message })
            },
        { durable: true }
      );
      if (needsUserAction) {
        throw Object.assign(error, {
          taskStatus: TASK_STATUS.WAITING_USER_ACTION,
          statusText: waitingStatusText(error)
        });
      }
      throw error;
    }
  };
}
