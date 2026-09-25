// Continue and Retry for Agent runs. Both read the forum again, so they
// first make sure it is enabled: the permission request has to start inside
// the click (no awaits before it); a forum that already is enabled resolves
// at once, without a prompt.
import { TASK_TYPE } from '../shared/task-record.mjs';
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

  async retryGrantedTask(value, { root = null } = {}) {
    const activity = value?.activityType === 'agent'
      ? value
      : await this.runs.get(value);
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
      const task = await this.tasks.enqueue({
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
      }, 'Unable to retry Agent task');
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
