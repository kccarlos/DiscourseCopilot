// Agent research in the side panel: the runs the panel knows about, the
// inline answer panel and the pill on the topic view, the question composer,
// the answer actions (stop, continue, retry, keep, delete, …) and the
// screen-reader announcements when a run finishes.
import { DiscourseCopilotLogger } from '../shared/logger.js';
import {
  AGENT_ACTIVITY_STATUS,
  agentActivityFromTask,
  isAgentActivityTerminal,
  mergeAgentActivityMarks
} from '../shared/agent-activity.mjs';
import { TASK_TYPE } from '../shared/task-record.mjs';
import { normalizeAgentQuestion } from '../services/agent-context.mjs';
import { topicSessionDatabase } from './topic-session-db.mjs';
import { resolveRetention } from '../shared/preferences.mjs';
import {
  agentRecentWindowMs,
  isAgentAnswerUnopened,
  mergeAgentRunState,
  retentionCopy,
  selectAgentRunView
} from './ui-state.mjs';
import { writeClipboardText } from './clipboard.mjs';
import { applyForumHue, createForumChip } from './forum-ui.mjs';
import { openForumTarget } from './forum-tabs.mjs';
import { announce } from './status-line.mjs';
import { AgentAnswerView } from './agent-answer-view.mjs';

const $ = id => document.getElementById(id);

export class AgentController {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (pageContext, savedViewOpen, agentDetailOpen, persistenceAvailable)
   * @param {object} deps.tasks TaskRegistry
   * @param {object} deps.forums ForumDirectory
   * @param {object} deps.config ConfigStore
   * @param {object} deps.operations OperationTracker
   * @param {object} deps.status StatusLine
   * @param {object} deps.markdown MarkdownScheduler
   * @param {object} deps.nav the Activity screen (showSavedStatus, openAgentActivity,
   *   hideAgentDetail, renderTaskList, loadSavedList); bound after construction
   * @param {object} deps.hooks updateControls, beginOperation, promptSetup,
   *   dismissSetupSuccess, cancelTask, onTaskChanged, handleBackgroundError,
   *   markBackgroundUnavailable
   */
  constructor({ state, tasks, forums, config, operations, status, markdown, nav, hooks }) {
    this.state = state;
    this.tasks = tasks;
    this.forums = forums;
    this.config = config;
    this.operations = operations;
    this.status = status;
    this.nav = nav;
    this.hooks = hooks;
    this.activities = new Map();
    // Streamed answer text per task ID.
    this.streams = new Map();
    // The run the inline panel follows on each forum (siteUrl → run ID).
    this.currentRuns = new Map();
    this.composerOpen = false;
    this.pillActivityId = '';
    this.announcedStates = new Set();
    this.openMarks = new Set();
    this.detailActivity = null;
    this.view = new AgentAnswerView({
      forums,
      markdown,
      getRetentionCopy: () => retentionCopy(this.retention),
      getStream: taskId => this.streams.get(taskId),
      findTask: activity => this.tasks.findAgentTask(activity)
    });
  }

  // The effective history retention, always from the configuration model.
  get retention() {
    return resolveRetention(this.config?.config?.preferences);
  }

  // ---------- Setup ----------

  mount() {
    $('agentLaunchBtn').addEventListener('click', () => {
      this.showComposer();
    });
    $('agentCloseBtn').addEventListener('click', () => {
      this.hideComposer();
    });
    $('agentForm').addEventListener('submit', event => {
      event.preventDefault();
      void this.sendQuestion();
    });
    $('agentInput').addEventListener('input', () => {
      this.hooks.updateControls();
    });
    for (const suggestion of document.querySelectorAll('[data-agent-question]')) {
      suggestion.addEventListener('click', () => {
        const input = $('agentInput');
        input.value = suggestion.dataset.agentQuestion || '';
        input.focus();
        this.hooks.updateControls();
      });
    }

    const template = $('agentAnswerTemplate');
    for (const root of this.answerRoots()) {
      root.querySelector('[data-agent-body]').appendChild(template.content.cloneNode(true));
      root.addEventListener('click', event => {
        this.handleRootClick(event, root);
      });
    }
    this.panelDetails().addEventListener('toggle', () => {
      if (this.panelDetails().open) {
        const activity = this.runRecord(this.panelRoot().dataset.activityId);
        if (activity) {
          this.markOpened(activity);
        }
      }
    });
    $('agentPill').addEventListener('click', () => {
      const activity = this.runRecord(this.pillActivityId);
      if (activity) {
        void this.nav.openAgentActivity(activity);
      }
    });
  }

  async load() {
    if (!this.state.persistenceAvailable) {
      return;
    }
    try {
      const activities = await topicSessionDatabase.listAgentActivities();
      this.activities = new Map(activities.map(activity => [activity.activityId, activity]));
    } catch (error) {
      if (this.hooks.handleBackgroundError(error)) {
        return;
      }
      DiscourseCopilotLogger.warn('Popup: Agent activity history is unavailable:', error);
    }
  }

  panelRoot() {
    return $('agentPanel');
  }

  panelDetails() {
    return this.panelRoot().querySelector('.agent-panel-details');
  }

  answerRoots() {
    return [this.panelRoot(), $('agentDetailView')];
  }

  isTopicViewVisible() {
    return !$('topicView').classList.contains('hidden');
  }

  // ---------- Runs ----------

  // Agent runs as the panel sees them: stored activities with fresher queue
  // status merged in, plus runs whose activity has not been broadcast yet.
  runRecords() {
    const records = [...this.activities.values()].map(activity =>
      mergeAgentRunState(activity, this.tasks.findAgentTask(activity))
    );
    const known = new Set(records.map(record => record.agentRunId));
    for (const task of this.tasks.values()) {
      if (task.type !== TASK_TYPE.AGENT || known.has(task.agentRunId || task.id)) {
        continue;
      }
      const activity = this.activityFromTask(task);
      if (activity) {
        records.push(mergeAgentRunState(activity, task));
      }
    }
    return records;
  }

  runRecord(activityId) {
    if (!activityId) {
      return null;
    }
    return this.runRecords().find(record => record.activityId === activityId) || null;
  }

  activityFromTask(task) {
    try {
      return agentActivityFromTask(task, { withTimestamps: true });
    } catch {
      return null;
    }
  }

  // Shows a just-queued run right away; the worker's activity replaces it.
  trackQueuedTask(task) {
    const activity = this.activityFromTask(task);
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

  async getRecord(value) {
    const activityId = value?.activityId || value?.agentRunId;
    if (!activityId) {
      return null;
    }
    const cached = this.activities.get(String(activityId));
    if (cached) {
      return cached;
    }
    if (!this.state.persistenceAvailable) {
      return null;
    }
    const activity = await topicSessionDatabase.getAgentActivity(activityId);
    if (activity) {
      this.activities.set(activity.activityId, activity);
    }
    return activity;
  }

  // ---------- Broadcasts ----------

  handleTaskUpdated(task) {
    // The panel only ever shows the current forum's run; other forums get a pill.
    this.renderPanel();
    this.refreshDetail(task.agentRunId || task.id);
    if (this.state.savedViewOpen && !this.state.agentDetailOpen) {
      this.nav.renderTaskList();
    }
  }

  handleActivityUpdated(activity) {
    if (!activity?.activityId) {
      return;
    }
    const previous = this.activities.get(activity.activityId);
    // A broadcast can predate this panel's own open/dismiss write; keep the marks.
    this.activities.set(activity.activityId, mergeAgentActivityMarks(activity, previous));
    if (isAgentActivityTerminal(activity.status)) {
      this.streams.delete(activity.taskId);
    }
    if (previous && previous.status !== activity.status) {
      this.announceState(activity);
    }
    this.renderPanel();
    this.refreshDetail(activity.activityId);
    if (this.state.savedViewOpen && !this.state.agentDetailOpen) {
      this.nav.renderTaskList();
      void this.nav.loadSavedList();
    }
  }

  handleStream(message) {
    const content = (this.streams.get(message.taskId) || '') + message.chunk;
    this.streams.set(message.taskId, content);
    this.view.renderStream(this.answerRoots(), message.taskId, content);
  }

  announceState(activity) {
    const key = `${activity.activityId}:${activity.status}`;
    if (this.announcedStates.has(key)) {
      return;
    }
    const onThisForum = activity.siteUrl && activity.siteUrl === this.state.pageContext?.siteUrl;
    const forumName = this.forums.label(activity.siteUrl, activity.forumName);
    const message = {
      [AGENT_ACTIVITY_STATUS.COMPLETED]: onThisForum ? 'Answer ready' : `Answer ready from ${forumName}`,
      [AGENT_ACTIVITY_STATUS.FAILED]: `Research on ${forumName} failed`,
      [AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION]: `${forumName} needs you to log in before research can continue`
    }[activity.status];
    if (!message) {
      return;
    }
    this.announcedStates.add(key);
    announce($('agentAnnouncer'), message);
  }

  // ---------- Inline panel and pill ----------

  renderPanel() {
    const panel = this.panelRoot();
    const pill = $('agentPill');
    const siteUrl = this.state.pageContext?.siteUrl || '';
    const view = selectAgentRunView(this.runRecords(), siteUrl, {
      preferredId: this.currentRuns.get(siteUrl) || '',
      windowMs: agentRecentWindowMs(this.retention)
    });

    const showPanel = view.mode === 'panel' && !this.composerOpen;
    panel.classList.toggle('hidden', !showPanel);
    $('topicView').classList.toggle('has-agent-panel', view.mode === 'panel');
    if (showPanel) {
      if (panel.dataset.activityId !== view.activity.activityId) {
        // Answers already read on an earlier visit start collapsed.
        this.panelDetails().open = !isAgentActivityTerminal(view.activity.status)
          || isAgentAnswerUnopened(view.activity);
      }
      this.renderPanelHeader(view.activity);
      this.view.render(panel, view.activity, { mode: 'inline' });
      if (this.panelDetails().open && this.isTopicViewVisible()) {
        this.markOpened(view.activity);
      }
    } else if (view.mode !== 'panel') {
      delete panel.dataset.activityId;
      delete panel.dataset.taskId;
    }

    this.pillActivityId = view.mode === 'pill' ? view.activity.activityId : '';
    pill.classList.toggle('hidden', view.mode !== 'pill');
    if (view.mode === 'pill') {
      const forumName = this.forums.label(view.activity.siteUrl, view.activity.forumName);
      const text = {
        running: `Researching on ${forumName}…`,
        waiting: `${forumName} needs you to log in`,
        ready: `Answer ready from ${forumName}`,
        failed: `Research on ${forumName} failed`
      }[view.kind];
      $('agentPillText').textContent = text;
      pill.dataset.kind = view.kind;
      pill.setAttribute('aria-label', `${text}. View answer`);
      applyForumHue(pill, view.activity.siteUrl);
    }
    return view;
  }

  renderPanelHeader(activity) {
    const panel = this.panelRoot();
    const question = this.view.part(panel, 'question');
    question.textContent = activity.question || activity.title;
    question.title = activity.question || activity.title;
    const forumName = this.forums.label(activity.siteUrl, activity.forumName);
    const forumSlot = this.view.part(panel, 'forum');
    if (forumSlot.textContent !== forumName) {
      forumSlot.replaceChildren(createForumChip(activity.siteUrl, forumName));
    }
    this.view.part(panel, 'meta').textContent = this.view.statusSummary(activity);
  }

  focusPanel() {
    const panel = this.panelRoot();
    if (panel.classList.contains('hidden')) {
      return;
    }
    this.panelDetails().open = true;
    panel.querySelector('.agent-panel-summary').focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Detail view (inside the Activity screen) ----------

  showDetail(activity) {
    this.detailActivity = activity;
    this.renderDetail(activity);
  }

  clearDetail() {
    this.detailActivity = null;
  }

  renderDetail(activity) {
    $('agentDetailHeading').textContent = activity.title;
    $('agentDetailMeta').textContent = [
      this.forums.label(activity.siteUrl, activity.forumName),
      this.view.statusSummary(activity)
    ].filter(Boolean).join(' · ');
    this.view.render($('agentDetailView'), activity, { mode: 'detail' });
  }

  refreshDetail(activityId) {
    if (!this.state.agentDetailOpen || this.detailActivity?.activityId !== activityId) {
      return;
    }
    const activity = this.runRecord(activityId);
    if (activity) {
      this.detailActivity = activity;
      this.renderDetail(activity);
    }
  }

  // ---------- Composer ----------

  searchLabel(forumName = this.forums.currentLabel()) {
    return forumName ? `Search ${forumName}` : 'Search this forum';
  }

  // Composer copy names the forum being searched; the topic suggestion only
  // makes sense while a topic is open.
  renderComposerCopy(forumName, isForumTopic) {
    $('agentComposerHeading').textContent = this.searchLabel(forumName);
    $('agentInput').placeholder = forumName
      ? `Ask a question about ${forumName}…`
      : 'Ask a question about this forum…';
    $('agentTopicSuggestion').classList.toggle('hidden', !isForumTopic);
  }

  showComposer({ question = '' } = {}) {
    if (!this.state.pageContext?.isDiscourse) {
      this.status.show('Open a Discourse forum page to ask the forum', 'warning');
      return;
    }
    // The composer takes the answer panel's place until it is sent or closed.
    this.composerOpen = true;
    this.renderPanel();
    $('agentComposer').classList.remove('hidden');
    const input = $('agentInput');
    if (question) {
      input.value = question;
    }
    input.focus();
    this.hooks.updateControls();
  }

  hideComposer() {
    this.composerOpen = false;
    $('agentComposer').classList.add('hidden');
    this.renderPanel();
    this.hooks.updateControls();
  }

  async sendQuestion() {
    const question = normalizeAgentQuestion($('agentInput').value);
    if (!question) {
      return;
    }
    if (!this.config.isReady()) {
      this.hooks.promptSetup();
      return;
    }

    this.hooks.dismissSetupSuccess();
    const operation = this.hooks.beginOperation('agent');
    if (!operation) {
      return;
    }

    try {
      this.status.show('Submitting Agent research task…', 'loading');
      const task = await this.tasks.enqueue({
        taskType: TASK_TYPE.AGENT,
        agentRunId: operation.id,
        clientRequestId: operation.id,
        title: question,
        question,
        siteUrl: operation.siteUrl,
        forumName: operation.forumName,
        provider: operation.provider,
        settings: operation.settings,
        systemPrompt: operation.systemPrompt,
        responseLanguage: operation.responseLanguage
      }, 'Unable to queue Agent research');
      if (!task) {
        this.hooks.markBackgroundUnavailable();
        return;
      }
      this.trackQueuedTask(task);
      $('agentInput').value = '';
      this.status.hide();
      this.hideComposer();
      this.focusPanel();
    } catch (error) {
      if (this.hooks.handleBackgroundError(error)) {
        return;
      }
      DiscourseCopilotLogger.error('Popup: Error queueing Agent task:', error);
      this.status.show(`Error: ${error.message}`, 'error');
    } finally {
      this.operations.finish(operation);
    }
  }

  // ---------- Answer actions ----------

  handleRootClick(event, root) {
    const citation = event.target.closest('.agent-citation');
    if (citation && root.contains(citation)) {
      event.preventDefault();
      this.view.focusSource(root, citation.dataset.citation);
      return;
    }
    const button = event.target.closest('[data-agent-action]');
    if (!button || !root.contains(button) || button.disabled) {
      return;
    }
    const activity = this.runRecord(root.dataset.activityId);
    if (!activity) {
      return;
    }
    void this.runAction(button.dataset.agentAction, activity, root, button);
  }

  async runAction(action, activity, root, button) {
    const task = this.tasks.findAgentTask(activity);
    switch (action) {
      case 'stop':
        if (task) {
          button.disabled = true;
          button.textContent = 'Stopping…';
          await this.hooks.cancelTask(task.id, { root });
        }
        return;
      case 'continue':
        if (task) {
          await this.resumeTask(task.id, { root });
        } else {
          this.view.setActionStatus(root, 'This run is no longer waiting. Ask again to start a new one.', 'warning');
        }
        return;
      case 'login':
        await this.openForumTab(activity.siteUrl, root);
        return;
      case 'retry':
        await this.retryTask(activity, { root });
        return;
      case 'ask-again':
        this.showComposer({ question: activity.question });
        return;
      case 'ask-another':
        this.showComposer();
        return;
      case 'copy':
        await this.copyAnswer(activity, button);
        return;
      case 'keep':
        await this.setKept(activity, activity.kept !== true, button);
        return;
      case 'open-activity':
        await this.nav.openAgentActivity(activity);
        return;
      case 'dismiss':
        await this.dismissRun(activity);
        return;
      case 'delete':
        await this.deleteActivity(activity);
        return;
      default:
    }
  }

  async copyAnswer(activity, button) {
    try {
      await writeClipboardText(activity.answer);
      button.textContent = 'Copied';
      setTimeout(() => {
        if (button.isConnected) {
          button.textContent = 'Copy answer';
        }
      }, 1600);
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Clipboard error:', error);
      const root = button.closest('#agentPanel, #agentDetailView');
      if (root) {
        this.view.setActionStatus(root, `Unable to copy: ${error.message}`, 'error');
      }
    }
  }

  async openForumTab(siteUrl, root = null) {
    if (!siteUrl) {
      return;
    }
    try {
      await openForumTarget({ siteUrl });
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to open forum tab:', error);
      if (root) {
        this.view.setActionStatus(root, `Unable to open the forum: ${error.message}`, 'error');
      }
    }
  }

  // Shows a message where the user is looking: the answer view it came
  // from, the Activity screen, or the topic view's status line.
  report(message, type = 'info', root = null) {
    if (root && !root.classList.contains('hidden')) {
      this.view.setActionStatus(root, message, type);
    } else if (this.state.savedViewOpen) {
      this.nav.showSavedStatus(message, type);
    } else {
      this.status.show(message, type);
    }
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
    if (!this.state.persistenceAvailable) {
      return;
    }
    this.openMarks.add(activityId);
    try {
      const saved = await topicSessionDatabase.markAgentActivity(activityId, { lastOpenedAt });
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

  async dismissRun(activity) {
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
    this.renderPanel();
    $('agentLaunchBtn').focus({ preventScroll: true });
    if (!this.state.persistenceAvailable) {
      return;
    }
    try {
      await topicSessionDatabase.markAgentActivity(activity.activityId, marks);
    } catch (error) {
      DiscourseCopilotLogger.warn('Popup: Unable to save the dismissed Agent answer:', error);
    }
  }

  async resumeTask(taskId, { root = null } = {}) {
    try {
      const task = await this.tasks.resume(taskId);
      if (task) {
        this.hooks.onTaskChanged(task);
      }
    } catch (error) {
      this.report(`Unable to resume Agent task: ${error.message}`, 'error', root);
    }
  }

  async retryTask(value, { root = null } = {}) {
    const activity = value?.activityType === 'agent'
      ? value
      : await this.getRecord(value);
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
      this.trackQueuedTask(task);
      if (this.state.savedViewOpen) {
        this.nav.showSavedStatus('Agent retry queued.', 'info');
        if (this.state.agentDetailOpen) {
          this.nav.hideAgentDetail();
        }
        this.nav.renderTaskList();
      } else {
        this.renderPanel();
        this.focusPanel();
      }
    } catch (error) {
      this.report(`Unable to retry Agent task: ${error.message}`, 'error', root);
    }
  }

  async setKept(activity, kept, button = null) {
    const target = activity || this.detailActivity;
    if (!target || !this.state.persistenceAvailable) {
      return;
    }
    if (button) {
      button.disabled = true;
    }
    try {
      const saved = await topicSessionDatabase.setAgentActivityKept(target.activityId, kept);
      this.activities.set(saved.activityId, saved);
      this.refreshDetail(saved.activityId);
      this.renderPanel();
      if (this.state.savedViewOpen) {
        await this.nav.loadSavedList();
      }
    } catch (error) {
      this.report(
        `Unable to update Agent retention: ${error.message}`,
        'error',
        button?.closest('#agentPanel, #agentDetailView') || null
      );
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
      }
    }
  }

  async deleteActivity(activity = this.detailActivity) {
    if (!activity || !this.state.persistenceAvailable) {
      return;
    }
    if (this.tasks.findUnfinishedAgentTask(activity.agentRunId)) {
      this.report('Stop the running Agent task before deleting its activity.', 'warning');
      return;
    }
    if (!window.confirm(`Delete the Agent answer for “${activity.title}”?`)) {
      return;
    }
    try {
      await topicSessionDatabase.deleteAgentActivity(activity.activityId);
      this.activities.delete(activity.activityId);
      if (this.state.agentDetailOpen) {
        this.nav.hideAgentDetail();
      }
      this.renderPanel();
      if (this.state.savedViewOpen) {
        await this.nav.loadSavedList();
      }
    } catch (error) {
      this.report(`Unable to delete Agent activity: ${error.message}`, 'error');
    }
  }
}
