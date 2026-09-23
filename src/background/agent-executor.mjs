// Executor for Agent tasks: researches a forum with the forum tools, writes
// an answer, and keeps the task's activity record (progress, sources,
// answer, outcome) up to date for the side panel.
import {
  AGENT_ACTIVITY_RETENTION_MS,
  AGENT_ACTIVITY_STATUS,
  agentActivityExpiry,
  agentActivityFromTask
} from '../shared/agent-activity.mjs';
import { TASK_STATUS } from '../shared/task-record.mjs';
import { normalizeSiteUrl } from '../shared/forum-site.mjs';
import { isAbortError } from '../shared/rate-limit-retry.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { ForumToolClient } from './forum-tools.mjs';
import { isAgentUserActionError, runAgentTask } from './agent-runner.mjs';

const { MESSAGES } = DiscourseCopilotConstants;

const LOGIN_REQUIRED_TEXT = 'Forum login or verification is required';

export function agentActivityError(error, fallbackCode = 'AGENT_ERROR') {
  return {
    code: error?.code || fallbackCode,
    message: String(error?.message || error || 'Agent task failed').slice(0, 1000),
    retryable: error?.retryable !== false,
    needsUserAction: error?.needsUserAction === true,
    retryAfterAt: error?.retryAfterMs
      ? Date.now() + Math.max(0, error.retryAfterMs)
      : 0
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
    statusText: cancelled
      ? 'Cancelled'
      : needsUserAction
        ? LOGIN_REQUIRED_TEXT
        : 'Failed',
    error: cancelled ? null : agentActivityError(error),
    // A run waiting for the user stays open and never expires on its own.
    completedAt: finished ? now : 0,
    expiresAt: finished ? now + AGENT_ACTIVITY_RETENTION_MS : 0
  };
}

/**
 * @param {object} deps
 * @param {object} deps.aiService AIService
 * @param {object} deps.activities AgentActivityStore
 * @param {(message: object) => void} deps.broadcast
 * @param {(task: object) => Promise<object>} deps.getTaskConfiguration
 * @param {object} deps.governor ForumRequestGovernor shared by all Agent runs
 */
export function createAgentExecutor({
  aiService,
  activities,
  broadcast,
  getTaskConfiguration,
  governor
}) {
  return async function executeAgentTask(task, { signal, report }) {
    let activity = await activities.get(task.agentRunId || task.id);
    if (!activity) {
      activity = await activities.create(agentActivityFromTask(task));
    }

    // A restarted task whose answer was already written is done.
    if (activity.status === AGENT_ACTIVITY_STATUS.COMPLETED && activity.answer) {
      activities.announce(activity);
      return;
    }

    activity = await activities.update(activity, {
      status: AGENT_ACTIVITY_STATUS.RUNNING,
      phase: 'starting',
      statusText: 'Starting forum research…',
      error: null,
      startedAt: activity.startedAt || Date.now()
    }, { prune: false });

    const updateActivity = async (patch, { durable = true } = {}) => {
      activity = await activities.update(activity, patch, { prune: durable });
      return activity;
    };

    try {
      const siteUrl = normalizeSiteUrl(task.siteUrl);
      if (!siteUrl) {
        throw Object.assign(
          new Error('This Agent task has no forum site. Ask again from the forum page.'),
          { retryable: false }
        );
      }
      const toolClient = new ForumToolClient({ siteUrl, signal, governor });

      const configuration = await getTaskConfiguration(task);
      const result = await runAgentTask({
        question: activity.question,
        systemPrompt: configuration.systemPrompt,
        responseLanguage: configuration.responseLanguage,
        forumName: configuration.forumName,
        signal,
        toolClient,
        generateAnswer: ({
          question,
          sources,
          systemPrompt,
          responseLanguage,
          forumName,
          signal: answerSignal,
          onProgress,
          onStream
        }) => aiService.generateAgentAnswer(
          configuration.provider,
          { question, sources, systemPrompt, responseLanguage, forumName },
          configuration.settings,
          { abortSignal: answerSignal, onProgress, onStream }
        ),
        onProgress: async (patch, durable = false) => {
          await report(patch, { durable });
          await updateActivity({
            phase: patch.phase,
            statusText: patch.statusText,
            progress: patch.progress
          }, { durable: durable || patch.phase === 'generating' }).catch(() => {});
        },
        onActivityPatch: async (patch, durable = true) => {
          await updateActivity(patch, { durable });
        },
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
      activity = await updateActivity({
        ...result,
        status: AGENT_ACTIVITY_STATUS.COMPLETED,
        phase: 'completed',
        statusText: result.answerStatus === 'no_results'
          ? 'No matching discussions found'
          : 'Completed',
        answer: result.answer,
        completedAt,
        expiresAt: agentActivityExpiry(activity, completedAt),
        progress: {
          percent: 100,
          completedSteps: activity.progress?.totalSteps || null,
          totalSteps: activity.progress?.totalSteps || null,
          sourceCount: result.sourceRefs.length,
          etaMs: 0
        },
        error: null
      }, { durable: true });
      await report({
        phase: 'completed',
        statusText: activity.statusText,
        progress: activity.progress
      }, { durable: true });
    } catch (error) {
      const cancelled = isAbortError(error) || signal.aborted;
      const needsUserAction = !cancelled && (
        isAgentUserActionError(error) || error?.needsUserAction === true
      );
      await updateActivity(agentFailurePatch(error, { cancelled, needsUserAction }), { durable: true });
      if (needsUserAction) {
        throw Object.assign(error, {
          taskStatus: TASK_STATUS.WAITING_USER_ACTION,
          statusText: LOGIN_REQUIRED_TEXT
        });
      }
      throw error;
    }
  };
}
