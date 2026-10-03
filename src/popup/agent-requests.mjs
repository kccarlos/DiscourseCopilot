// Continue and Retry for Agent runs. Both read the forum again, so they
// first make sure it is enabled: the permission request has to start inside
// the click (no awaits before it); a forum that already is enabled resolves
// at once, without a prompt.
import { TASK_TYPE } from '../shared/task-record.mjs';
import { agentTurnsOf, currentAgentTurnIndex } from '../shared/agent-activity.mjs';
import { normalizeAgentQuestion } from '../services/agent-context.mjs';
import { forumAccessHost, requestForumAccess } from '../shared/forum-access.mjs';
import { forumAccessDeniedText } from './forum-access-card.mjs';

export class AgentRequests {
  /**
   * @param {object} deps
   * @param {object} deps.tasks TaskRegistry
   * @param {object} deps.config ConfigStore
   * @param {object} deps.runs AgentRuns
   * @param {object} deps.hooks onTaskChanged
   * @param {(message: string, type: string, root: HTMLElement|null) => void} deps.report
   * @param {(task: object) => void} deps.onRetryQueued
   */
  constructor({ tasks, config, runs, hooks, report, onRetryQueued }) {
    this.tasks = tasks;
    this.config = config;
    this.runs = runs;
    this.hooks = hooks;
    this.report = report;
    this.onRetryQueued = onRetryQueued;
  }

  withForumAccess(siteUrl, root, run) {
    if (!siteUrl) {
      return run();
    }
    const granted = requestForumAccess(siteUrl);
    return (async () => {
      if (!(await granted)) {
        this.report(forumAccessDeniedText(forumAccessHost(siteUrl)), 'warning', root);
        return undefined;
      }
      // A new grant reaches the background and this panel through
      // permissions.onAdded (content script registration, page re-check).
      return run();
    })();
  }

  resumeTask(taskId, { root = null } = {}) {
    const task = this.tasks.values().find(item => item.id === taskId);
    return this.withForumAccess(task?.siteUrl, root, () => this.resumeGrantedTask(taskId, { root }));
  }

  retryTask(value, { root = null } = {}) {
    return this.withForumAccess(value?.siteUrl, root, () => this.retryGrantedTask(value, { root }));
  }

  async resumeGrantedTask(taskId, { root = null } = {}) {
    try {
      const task = await this.tasks.resume(taskId);
      if (task) {
        this.hooks.onTaskChanged(task);
      }
    } catch (error) {
      this.report(`Unable to resume Agent task: ${error.message}`, 'error', root);
    }
  }

  // A follow-up question on a finished run: the same run, the same forum
  // (never the forum in the current tab), a fresh budget.
  askFollowUp(activity, question, { root = null } = {}) {
    return this.withForumAccess(activity?.siteUrl, root, () => this.askGrantedFollowUp(activity, question, { root }));
  }

  async askGrantedFollowUp(activity, rawQuestion, { root = null } = {}) {
    const question = normalizeAgentQuestion(rawQuestion);
    if (!question || !activity?.agentRunId) {
      return false;
    }
    if (!this.config.isReady()) {
      this.report('Finish setting up an AI provider first', 'warning', root);
      return false;
    }
    const { config } = this.config;
    try {
      const task = await this.tasks.enqueue(
        {
          taskType: TASK_TYPE.AGENT,
          agentRunId: activity.agentRunId,
          followUp: true,
          clientRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: question,
          question,
          siteUrl: activity.siteUrl,
          forumName: activity.forumName,
          provider: config.provider,
          settings: this.config.activeSettings,
          systemPrompt: config.systemPrompt,
          responseLanguage: config.responseLanguage
        },
        'Unable to ask the follow-up'
      );
      if (!task) {
        throw new Error('Unable to ask the follow-up');
      }
      this.runs.currentRuns.set(activity.siteUrl, activity.activityId);
      this.hooks.onTaskChanged(task);
      return true;
    } catch (error) {
      this.report(`Unable to ask the follow-up: ${error.message}`, 'error', root);
      return false;
    }
  }

  async retryGrantedTask(value, { root = null } = {}) {
    const activity = value?.activityType === 'agent' ? value : await this.runs.get(value);
    // A follow-up that failed or was stopped is asked again on its run
    // (the question and answer before it stay).
    const lastIndex = currentAgentTurnIndex(activity || {});
    if (activity && lastIndex > 0 && !agentTurnsOf(activity)[lastIndex].answer) {
      await this.askGrantedFollowUp(activity, agentTurnsOf(activity)[lastIndex].question, { root });
      return;
    }
    const question = activity?.question || value?.question;
    if (!question) {
      this.report('The Agent question is unavailable', 'error', root);
      return;
    }
    if (!this.config.isReady()) {
      this.report('Finish setting up an AI provider first', 'warning', root);
      return;
    }
    // A retry researches the forum the original question was asked on, not
    // the forum in the current tab.
    const siteUrl = activity?.siteUrl || value?.siteUrl || '';
    if (!siteUrl) {
      this.report('The forum for this Agent question is unknown. Ask again from the forum page.', 'error', root);
      return;
    }
    const retryId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { config } = this.config;
    try {
      const task = await this.tasks.enqueue(
        {
          taskType: TASK_TYPE.AGENT,
          clientRequestId: retryId,
          retryOf: activity?.agentRunId || value?.agentRunId || '',
          title: question,
          question,
          siteUrl,
          forumName: activity?.forumName || value?.forumName || '',
          provider: config.provider,
          settings: this.config.activeSettings,
          systemPrompt: config.systemPrompt,
          responseLanguage: config.responseLanguage
        },
        'Unable to retry Agent task'
      );
      if (!task) {
        throw new Error('Unable to retry Agent task');
      }
      this.runs.trackQueuedTask(task);
      this.onRetryQueued(task);
    } catch (error) {
      this.report(`Unable to retry Agent task: ${error.message}`, 'error', root);
    }
  }
}
