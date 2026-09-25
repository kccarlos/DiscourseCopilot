// Agent research in the side panel. This controller composes the pieces
// and owns what spans them:
//
//   agent-runs         the runs the panel knows about, run selection, marks
//   agent-panel        inline answer panel and pill on the topic view
//   agent-composer     the question composer
//   agent-requests     Continue / Retry (with the forum access request)
//   agent-answer-view  renders one run (inline panel and detail view)
//
// Here: background broadcasts, the Activity detail view, the answer actions
// (stop, copy, keep, dismiss, delete with Undo, …) and the screen-reader
// announcements when a run finishes.
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { AGENT_ACTIVITY_STATUS } from '../shared/agent-activity.mjs';
import { isForumAccessError } from '../shared/forum-access.mjs';
import { resolveRetention } from '../shared/preferences.mjs';
import { retentionCopy } from './ui-state.mjs';
import { writeClipboardText } from './clipboard.mjs';
import { openForumTarget } from './forum-tabs.mjs';
import { announce } from './status-line.mjs';
import { AgentAnswerView } from './agent-answer-view.mjs';
import { AgentRuns } from './agent-runs.mjs';
import { AgentPanel } from './agent-panel.mjs';
import { AgentComposer } from './agent-composer.mjs';
import { AgentRequests } from './agent-requests.mjs';

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
   * @param {object} deps.undo UndoToast
   * @param {object} deps.nav the Activity screen (showSavedStatus, openAgentActivity,
   *   hideAgentDetail, renderTaskList, loadSavedList, focusSavedItem); bound after construction
   * @param {object} deps.hooks updateControls, beginOperation, promptSetup,
   *   dismissSetupSuccess, cancelTask, onTaskChanged, handleBackgroundError,
   *   markBackgroundUnavailable
   */
  constructor({ state, tasks, forums, config, operations, status, markdown, undo, nav, hooks }) {
    this.state = state;
    this.tasks = tasks;
    this.forums = forums;
    this.config = config;
    this.status = status;
    this.undo = undo;
    this.nav = nav;
    this.hooks = hooks;
    this.announcedStates = new Set();
    this.detailActivity = null;
    this.runs = new AgentRuns({ tasks, isPersistent: () => state.persistenceAvailable });
    this.view = new AgentAnswerView({
      forums,
      markdown,
      getRetentionCopy: () => retentionCopy(this.retention),
      getStream: taskId => this.runs.streams.get(taskId),
      findTask: activity => this.tasks.findAgentTask(activity)
    });
    this.panel = new AgentPanel({
      state,
      runs: this.runs,
      forums,
      view: this.view,
      getRetention: () => this.retention
    });
    this.composer = new AgentComposer({
      state,
      tasks,
      forums,
      config,
      operations,
      status,
      hooks,
      onToggle: () => this.renderPanel(),
      onQueued: task => {
        this.runs.trackQueuedTask(task);
        this.composer.hide();
        this.panel.focus();
      }
    });
    this.requests = new AgentRequests({
      tasks,
      config,
      runs: this.runs,
      hooks,
      report: (message, type, root) => this.report(message, type, root),
      onRetryQueued: () => {
        if (this.state.savedViewOpen) {
          this.nav.showSavedStatus('Agent retry queued.', 'info');
          if (this.state.agentDetailOpen) {
            this.nav.hideAgentDetail();
          }
          this.nav.renderTaskList();
        } else {
          this.renderPanel();
          this.panel.focus();
        }
      }
    });
  }

  // The effective history retention, always from the configuration model.
  get retention() {
    return resolveRetention(this.config?.config?.preferences);
  }

  // The panel's Agent activities by ID (forum names, Activity cards).
  get activities() {
    return this.runs.activities;
  }

  // ---------- Setup ----------

  mount() {
    this.composer.mount();
    const template = $('agentAnswerTemplate');
    for (const root of this.answerRoots()) {
      root.querySelector('[data-agent-body]').appendChild(template.content.cloneNode(true));
      root.addEventListener('click', event => {
        this.handleRootClick(event, root);
      });
    }
    this.panel.details.addEventListener('toggle', () => {
      if (this.panel.details.open) {
        const activity = this.runRecord(this.panel.root.dataset.activityId);
        if (activity) {
          void this.markOpened(activity);
        }
      }
    });
    $('agentPill').addEventListener('click', () => {
      const activity = this.runRecord(this.panel.pillActivityId);
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
      await this.runs.load();
    } catch (error) {
      if (this.hooks.handleBackgroundError(error)) {
        return;
      }
      DiscourseCopilotLogger.warn('Popup: Agent activity history is unavailable:', error);
    }
  }

  answerRoots() {
    return [this.panel.root, $('agentDetailView')];
  }

  // ---------- Runs (see agent-runs.mjs) ----------

  runRecords() {
    return this.runs.records();
  }

  runRecord(activityId) {
    return this.runs.record(activityId);
  }

  absorb(activities) {
    this.runs.absorb(activities);
  }

  getRecord(value) {
    return this.runs.get(value);
  }

  markOpened(activity, options) {
    return this.runs.markOpened(activity, options);
  }

  // ---------- Topic view (see agent-panel.mjs, agent-composer.mjs) ----------

  renderPanel() {
    return this.panel.render({ composerOpen: this.composer.open });
  }

  searchLabel(forumName) {
    return this.composer.searchLabel(forumName);
  }

  renderComposerCopy(forumName, isForumTopic) {
    this.composer.renderCopy(forumName, isForumTopic);
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
    const previous = this.runs.update(activity);
    if (previous === undefined) {
      return; // deleted in this panel
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
    const content = (this.runs.streams.get(message.taskId) || '') + message.chunk;
    this.runs.streams.set(message.taskId, content);
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
      [AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION]: isForumAccessError(activity.error)
        ? `Research on ${forumName} is waiting for you to allow access to the forum`
        : `${forumName} needs you to log in before research can continue`
    }[activity.status];
    if (!message) {
      return;
    }
    this.announcedStates.add(key);
    announce($('agentAnnouncer'), message);
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
    $('agentDetailMeta').textContent = [this.forums.label(activity.siteUrl, activity.forumName), this.view.statusSummary(activity)]
      .filter(Boolean)
      .join(' · ');
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
        this.composer.show({ question: activity.question });
        return;
      case 'ask-another':
        this.composer.show();
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
        await this.deleteActivity(activity, { from: root.id === 'agentPanel' ? 'panel' : 'detail' });
        return;
      default:
    }
  }

  resumeTask(taskId, options) {
    return this.requests.resumeTask(taskId, options);
  }

  retryTask(value, options) {
    return this.requests.retryTask(value, options);
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

  async dismissRun(activity) {
    const saved = this.runs.dismiss(activity);
    this.renderPanel();
    $('agentLaunchBtn').focus({ preventScroll: true });
    await saved;
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
      const saved = await this.runs.setKept(target.activityId, kept);
      this.refreshDetail(saved.activityId);
      this.renderPanel();
      if (this.state.savedViewOpen) {
        await this.nav.loadSavedList();
      }
    } catch (error) {
      this.report(`Unable to update Agent retention: ${error.message}`, 'error', button?.closest('#agentPanel, #agentDetailView') || null);
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
      }
    }
  }

  // Deletes the answer at once and offers Undo (see undo-toast.mjs). `from`
  // says where the Delete button was, for where focus goes next: 'panel'
  // (the inline panel), 'detail' (the detail view) or 'saved' (a Saved card,
  // whose view focuses its neighbour through `afterDelete`).
  async deleteActivity(activity = this.detailActivity, { from = 'detail', afterDelete = null } = {}) {
    if (!activity || !this.state.persistenceAvailable) {
      return;
    }
    if (this.tasks.findUnfinishedAgentTask(activity.agentRunId)) {
      this.report('Stop the running Agent task before deleting its activity.', 'warning');
      return;
    }
    let copy;
    try {
      copy = await this.runs.remove(activity);
    } catch (error) {
      this.report(`Unable to delete Agent activity: ${error.message}`, 'error');
      return;
    }
    if (this.state.agentDetailOpen) {
      this.nav.hideAgentDetail();
    }
    this.renderPanel();
    if (this.state.savedViewOpen) {
      await this.nav.loadSavedList();
    }
    if (afterDelete) {
      afterDelete();
    } else if (this.state.savedViewOpen) {
      this.nav.focusSavedItem();
    } else if (from === 'panel' || from === 'detail') {
      $('agentLaunchBtn').focus({ preventScroll: true });
    }
    this.undo.offer({
      message: `Deleted the Agent answer for “${activity.title}”`,
      undo: () => this.restoreActivity(copy)
    });
  }

  async restoreActivity(copy) {
    const restored = await this.runs.restore(copy);
    this.renderPanel();
    if (this.state.savedViewOpen && !this.state.agentDetailOpen) {
      await this.nav.loadSavedList();
      this.nav.focusSavedItem(`agent:${restored.activityId}`);
    } else if (!this.state.savedViewOpen) {
      this.panel.focus();
    }
    announce($('agentAnnouncer'), `Restored the Agent answer for “${restored.title}”`);
  }
}
