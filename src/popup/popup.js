// Side panel entry: builds the panel's modules, wires them together, and
// owns what spans them — reacting to page changes, routing background
// broadcasts, background availability, and the panel-wide render
// (updateUI: header, setup state, controls, Agent panel, idle status).
//
//   page-context      active tab → page context
//   topic-controller  the topic session: switch, restore, reload, render
//   forum-ui          forum names, forum bar, forum accents
//   provider-header   model switcher (active provider · model), setup state
//   setup-card        first-run setup (draft/test/save through ConfigStore)
//   summary-view      summary card, reading progress, topic task status
//   chat-view         follow-up chat and the forum context limit
//   agent-*           Agent runs, inline panel, pill, composer, answers
//   activity-view     Activity screen (tasks, saved items, Agent detail)
//   task-registry     the panel's copy of the task queue + requests to it
//   session-store     topic sessions cached and saved to IndexedDB
//   operations        the one request being submitted
//   topic-controls    button/input state derived from all of the above
//   page-guidance     one guidance card per page state (not checked, not a
//                     forum, allow access, forum home, topic)
//   forum-access-card renders that card, the "Get started" checklist and
//                     the Allow access request
//   background-link   reaching the background worker, restart banner
//   undo-toast        Undo for deletes (saved summaries, Agent answers)
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { subscribeForumAccess } from '../shared/forum-access.mjs';
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { ConfigStore } from '../shared/config-state.mjs';
import { resolveRetention, retentionEqual } from '../shared/preferences.mjs';
import { TASK_TYPE } from '../shared/task-record.mjs';
import { normalizeAgentQuestion } from '../services/agent-context.mjs';
import { topicSessionDatabase } from '../shared/topic-session-db.mjs';
import { resolveIdleStatus, shouldRederiveStatus } from './ui-state.mjs';
import { SetupCard } from './setup-card.mjs';
import { MarkdownScheduler } from './markdown.mjs';
import { StatusLine } from './status-line.mjs';
import { ForumBar, ForumDirectory } from './forum-ui.mjs';
import { TaskRegistry } from './task-registry.mjs';
import { OperationTracker } from './operations.mjs';
import { SessionStore } from './session-store.mjs';
import { PageContextController } from './page-context.mjs';
import { ProviderHeader } from './provider-header.mjs';
import { SummaryView } from './summary-view.mjs';
import { TopicController } from './topic-controller.mjs';
import { ChatView } from './chat-view.mjs';
import { AgentController } from './agent-controller.mjs';
import { ActivityView } from './activity-view.mjs';
import { ForumAccessCard } from './forum-access-card.mjs';
import { BackgroundLink } from './background-link.mjs';
import { UndoToast } from './undo-toast.mjs';
import { GUIDANCE_STATE, derivePageGuidance } from './page-guidance.mjs';
import {
  applyTopicControls,
  deriveTopicControls,
  deriveTopicHelper
} from './topic-controls.mjs';

const { MESSAGES } = DiscourseCopilotConstants;
// Storage changes arrive in bursts (one per key); reload settings once.
const SETTINGS_RELOAD_DELAY_MS = 50;

const $ = id => document.getElementById(id);

class DiscourseCopilotPopup {
  constructor() {
    // Panel state read across modules. Writers: pageContext
    // (PageContextController), session and isHydratingSession
    // (TopicController), the availability flags (this file), savedViewOpen
    // and agentDetailOpen (ActivityView).
    const state = {
      pageContext: null,
      session: null,
      backgroundAvailable: true,
      persistenceAvailable: true,
      isHydratingSession: false,
      savedViewOpen: false,
      agentDetailOpen: false
    };
    this.state = state;
    this.started = false;
    // Whether the provider was usable at the last render (undefined before the first).
    this.lastSettingsValid = undefined;
    // Streamed summary/chat text per task ID.
    this.topicStreams = new Map();

    this.config = new ConfigStore({
      reloadDelayMs: SETTINGS_RELOAD_DELAY_MS,
      onError: error => DiscourseCopilotLogger.error('Popup: Error loading provider settings:', error)
    });
    this.status = new StatusLine($('status'));
    this.tasks = new TaskRegistry({
      // A request for a forum that isn't enabled (e.g. access was removed
      // in Settings): re-check the page so its Allow access card shows.
      onForumAccessMissing: () => void this.page.refresh()
    });
    this.background = new BackgroundLink({
      state,
      tasks: this.tasks,
      status: this.status,
      onUnavailable: () => this.updateControls()
    });
    this.undo = new UndoToast({
      element: $('undoToast'),
      onError: error => {
        DiscourseCopilotLogger.error('Popup: Unable to undo:', error);
        const message = `Unable to undo: ${error.message}`;
        if (state.savedViewOpen) {
          this.activity.showSavedStatus(message, 'error');
        } else {
          this.status.show(message, 'error');
        }
      }
    });
    this.accessCard = new ForumAccessCard({
      onGranted: siteUrl => this.handleForumAccessGranted(siteUrl),
      onDenied: () => this.updateUI({ announce: false })
    });
    this.forums = new ForumDirectory({
      getPageContext: () => state.pageContext,
      getRecords: () => [
        ...this.tasks.values(),
        ...this.agent.activities.values(),
        ...this.activity.savedRecords
      ]
    });
    this.markdown = new MarkdownScheduler({
      isNearBottom: () => this.chat.isNearBottom(),
      scrollToBottom: () => this.chat.scrollToBottom()
    });
    this.operations = new OperationTracker({
      getPageKey: () => state.pageContext?.pageKey,
      onChange: () => this.updateControls(),
      onCancel: () => this.markdown.cancel()
    });
    this.sessions = new SessionStore({
      isPersistent: () => state.persistenceAvailable,
      onSaveError: session => {
        if (state.session?.topicKey === session.topicKey) {
          this.status.show('Changes are available now but could not be saved', 'warning');
        }
      }
    });
    this.page = new PageContextController({
      state,
      onContext: (context, change) => this.handlePageContext(context, change)
    });
    this.forumBar = new ForumBar({ forums: this.forums });
    this.setupCard = new SetupCard({
      config: this.config,
      getPageContext: () => state.pageContext,
      onSaved: () => this.updateUI({ announce: false }),
      onStateChange: () => this.updateUI(),
      openSettings: () => chrome.runtime.openOptionsPage()
    });
    this.header = new ProviderHeader({
      config: this.config,
      status: this.status,
      setupCard: this.setupCard,
      openSettings: () => chrome.runtime.openOptionsPage(),
      onSetupJump: () => {
        if (state.savedViewOpen) {
          this.activity.hide();
        }
        this.setupCard.focus();
      }
    });

    // Callbacks the views use to reach the rest of the panel.
    const hooks = {
      updateControls: () => this.updateControls(),
      beginOperation: kind => this.beginOperation(kind),
      cancelActiveOperation: () => this.operations.cancel(),
      promptSetup: () => this.promptSetup(),
      dismissSetupSuccess: () => this.setupCard.dismissSuccess(),
      markBackgroundUnavailable: error => this.background.markUnavailable(error),
      handleBackgroundError: error => this.background.handleError(error),
      reloadCurrentSession: () => this.topic.reload(),
      renderTaskState: task => this.topic.renderTaskState(task),
      persistSession: () => this.topic.persist(),
      cancelTask: (taskId, options) => this.cancelTask(taskId, options),
      onTaskChanged: task => this.handleTaskUpdated(task)
    };
    const shared = {
      state,
      tasks: this.tasks,
      config: this.config,
      status: this.status,
      markdown: this.markdown,
      operations: this.operations
    };
    this.summary = new SummaryView({ ...shared, streams: this.topicStreams, hooks });
    this.chat = new ChatView({ ...shared, streams: this.topicStreams, hooks });
    this.topic = new TopicController({
      state,
      sessions: this.sessions,
      forums: this.forums,
      status: this.status,
      summary: this.summary,
      chat: this.chat,
      streams: this.topicStreams,
      hooks: {
        updateUI: options => this.updateUI(options),
        updateControls: () => this.updateControls()
      }
    });
    this.agent = new AgentController({
      ...shared,
      forums: this.forums,
      undo: this.undo,
      hooks,
      // The Activity screen is created next; these resolve at call time.
      nav: {
        showSavedStatus: (message, type) => this.activity.showSavedStatus(message, type),
        openAgentActivity: value => this.activity.openAgentActivity(value),
        hideAgentDetail: () => this.activity.hideAgentDetail(),
        renderTaskList: () => this.activity.renderTaskList(),
        loadSavedList: () => this.activity.loadSavedList(),
        focusSavedItem: (key, index) => this.activity.focusSavedItem(key, index)
      }
    });
    this.activity = new ActivityView({
      state,
      tasks: this.tasks,
      forums: this.forums,
      sessions: this.sessions,
      agent: this.agent,
      config: this.config,
      undo: this.undo,
      hooks: {
        cancelTask: taskId => this.cancelTask(taskId),
        isCurrentTopic: topicKey => this.topic.isCurrentTopic(topicKey),
        showCurrentTopic: () => {
          this.topic.render();
          this.updateUI();
        },
        showCreatedTab: (tab, siteUrl) => this.page.apply(tab, { siteUrlHint: siteUrl }),
        expectTopicMetadata: entry => this.page.expectMetadata(entry),
        forgetTopicMetadata: topicKey => this.page.forgetMetadata(topicKey),
        resetCurrentSession: () => this.topic.reset(),
        reloadCurrentSession: () => this.topic.reload()
      }
    });
  }

  async init() {
    this.mount();
    this.listen();
    await Promise.all([
      this.loadConfig(),
      this.initializePersistence(),
      this.background.loadTasks(),
      this.agent.load()
    ]);
    this.started = true;
    await this.page.refresh();
    if (this.state.persistenceAvailable) {
      topicSessionDatabase.cleanupStaleChats().catch(error => {
        DiscourseCopilotLogger.warn('Popup: Unable to clean stale chats:', error);
      });
    }
  }

  mount() {
    this.forumBar.mount();
    this.header.mount();
    this.setupCard.mount();
    this.accessCard.mount();
    this.activity.mount();
    this.summary.mount();
    this.agent.mount();
    this.chat.mount();
    this.page.mount();
    this.background.mount();
    this.undo.mount();
  }

  listen() {
    chrome.runtime.onMessage.addListener((message, sender) => {
      switch (message.action) {
        case MESSAGES.TASK_UPDATED:
          this.handleTaskUpdated(message.task);
          break;
        case MESSAGES.ACTIVITY_UPDATED:
          this.agent.handleActivityUpdated(message.activity);
          break;
        case MESSAGES.TASK_STREAM:
          this.handleTaskStream(message);
          break;
        case MESSAGES.SESSION_UPDATED:
          void this.handleSessionUpdated(message.topicKey);
          break;
        case MESSAGES.PAGE_CHANGED:
          this.page.handlePageChanged(sender);
          break;
        case MESSAGES.ACTION_CLICKED:
          // The toolbar icon was clicked: activeTab now lets the panel check
          // a page it could not see.
          if (this.started) {
            void this.page.refresh();
          }
          break;
        default:
      }
    });
    // A forum was enabled or removed (here, in Settings, or another window).
    subscribeForumAccess(() => {
      if (this.started) {
        void this.page.refresh();
      }
    });
    // Settings changed here or in another extension page.
    this.config.subscribe(event => {
      if (event.type === 'operation') {
        return;
      }
      this.chat.syncContextLimit(this.config.config.forumContextLimit);
      this.applyPreferences();
      if (this.started) {
        this.updateUI({ announce: false });
      }
    });
  }

  // Applies the saved preferences that shape what this panel shows: the
  // history retention (lazy chat expiry in this page's database copy, the
  // Saved tab's window and every "expires in…"/Keep label). Research depth
  // and the page limit are applied by the background when a task is queued.
  applyPreferences() {
    const retention = resolveRetention(this.config.config.preferences);
    if (retentionEqual(retention, this.appliedRetention)) {
      return;
    }
    this.appliedRetention = retention;
    topicSessionDatabase.setRetention(retention);
    this.activity.applyRetention();
    if (this.started) {
      this.agent.renderPanel?.();
    }
  }

  // ---------- Loading ----------

  async loadConfig() {
    try {
      await this.config.load();
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Error loading provider settings:', error);
    }
    this.applyPreferences();
  }

  async initializePersistence() {
    try {
      await topicSessionDatabase.open();
    } catch (error) {
      this.state.persistenceAvailable = false;
      if (!this.background.handleError(error)) {
        DiscourseCopilotLogger.error('Popup: Summary history is unavailable:', error);
      }
    }
  }

  // ---------- Page ----------

  async handlePageContext(context, { previous, pendingMetadata }) {
    const contextChanged = context.pageKey !== previous?.pageKey;
    // undefined on the first page, so the first render is not a "switch".
    const previousSiteUrl = previous ? previous.siteUrl || '' : undefined;

    const forumName = this.forumBar.render(context, previousSiteUrl);
    this.agent.renderComposerCopy(forumName, Boolean(context.isForumTopic));

    if (contextChanged) {
      if (previousSiteUrl !== undefined) {
        this.setupCard.dismissSuccess();
      }
      this.operations.cancel();
      await this.topic.open(context);
      if (pendingMetadata && context.pageKey === this.state.pageContext?.pageKey) {
        this.page.forgetMetadata(context.topicKey);
      }
      this.activity.refreshForPageChange();
    } else {
      this.topic.refreshDetails(context);
    }
    this.updateUI({ announce: contextChanged });
  }

  // Access to a forum was just granted: the background registers the
  // content script and injects it into the forum's open tabs, then the page
  // is checked again and the normal view replaces the Allow access card.
  async handleForumAccessGranted(siteUrl) {
    const hadFocus = $('pageGuide').contains(document.activeElement);
    this.status.show(`DiscourseCopilot can now read ${this.forums.label(siteUrl)}`, 'success', { kind: 'access' });
    try {
      await chrome.runtime.sendMessage({ action: MESSAGES.SYNC_FORUM_ACCESS, siteUrl });
    } catch (error) {
      DiscourseCopilotLogger.warn('Popup: Unable to set up the enabled forum:', error);
    }
    await this.page.refresh();
    // The button that had focus is gone; continue with the next action.
    if (hadFocus && $('pageGuide').classList.contains('hidden')) {
      [$('summarizeBtn'), $('agentLaunchBtn'), $('setupHeading')]
        .find(element => element && !element.disabled && element.offsetParent !== null)
        ?.focus({ preventScroll: true });
    }
  }

  // ---------- Background broadcasts ----------

  handleTaskUpdated(task) {
    if (!task?.id) {
      return;
    }
    this.tasks.set(task);
    if (task.type === TASK_TYPE.AGENT) {
      this.agent.handleTaskUpdated(task);
      this.tasks.updateHeartbeat();
      return;
    }
    this.topic.handleTaskUpdated(task);
    if (this.state.savedViewOpen) {
      this.activity.renderTaskList();
    }
    this.tasks.updateHeartbeat();
  }

  handleTaskStream(message) {
    if (!message?.taskId || typeof message.chunk !== 'string') {
      return;
    }
    if (message.type === TASK_TYPE.AGENT) {
      this.agent.handleStream(message);
    } else {
      this.topic.handleStream(message);
    }
  }

  async handleSessionUpdated(topicKey) {
    if (this.topic.isCurrentTopic(topicKey)) {
      await this.topic.reload();
    }
    if (this.state.savedViewOpen) {
      await this.activity.loadSavedList();
    }
  }

  async cancelTask(taskId, { root = null } = {}) {
    try {
      const task = await this.tasks.cancel(taskId);
      if (task) {
        this.handleTaskUpdated(task);
      }
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to cancel task:', error);
      this.agent.report(`Unable to terminate task: ${error.message}`, 'error', root);
    }
  }

  // ---------- Operations ----------

  // Starts a request with the page and configuration as they are now.
  beginOperation(kind) {
    const { config } = this.config;
    return this.operations.begin(kind, this.state.pageContext, {
      provider: config.provider,
      settings: this.config.activeSettings,
      systemPrompt: config.systemPrompt,
      responseLanguage: config.responseLanguage,
      forumContextLimit: this.chat.forumContextLimit
    });
  }

  // Shown when a task is attempted before setup is finished.
  promptSetup() {
    this.status.show('Finish setting up an AI provider first', 'warning', { kind: 'setup' });
    this.setupCard.focus();
  }

  // ---------- Rendering ----------

  updateUI({ announce = true } = {}) {
    const { state } = this;
    this.header.render();
    this.chat.renderContextControl();
    const settingsValid = this.config.isReady();
    const previousSettingsValid = this.lastSettingsValid;
    this.lastSettingsValid = settingsValid;
    this.header.renderSetupState();

    const guidance = this.renderGuidance();
    this.updateControls();
    this.background.renderRecovery();
    // Agent state lives in its panel, so it survives re-renders and tab switches.
    const agentView = this.agent.renderPanel();

    // Quiet re-renders keep the status line, unless provider setup changed
    // what it should say (e.g. a stale "configure a provider" warning).
    if (
      this.operations.busy
      || !shouldRederiveStatus({
        announce,
        settingsValid,
        previousSettingsValid,
        statusKind: this.status.visibleKind
      })
    ) {
      return;
    }

    if (!state.backgroundAvailable) {
      this.status.hide();
      return;
    }

    const activeTask = this.tasks.activeForTopic(state.pageContext?.topicKey)[0];
    if (activeTask) {
      this.topic.renderTaskState(activeTask);
      return;
    }

    const idleStatus = resolveIdleStatus({
      isForumTopic: Boolean(state.pageContext?.isForumTopic),
      isDiscourse: Boolean(state.pageContext?.isDiscourse),
      // The setup success message already says what to do next.
      needsSetup: !settingsValid || this.setupCard.showsSuccess,
      // The page guidance (card or forum hero) already says what to do.
      guidanceShown: guidance.state !== GUIDANCE_STATE.TOPIC,
      agentPanelShown: agentView.mode === 'panel'
    });
    if (idleStatus) {
      this.status.show(idleStatus.message, idleStatus.type, { kind: 'idle' });
    } else {
      this.status.hide();
    }
  }

  // One guidance card per page state (page-guidance.mjs). The hero shows
  // only on a forum (its topic or home page); #topicView's data-guidance
  // lets the stylesheet hide what the state doesn't need (hero, welcome
  // panel, the summary button off-topic).
  renderGuidance() {
    const context = this.state.pageContext;
    const siteUrl = context?.siteUrl || '';
    const guidance = derivePageGuidance(context, {
      providerReady: this.config.isReady(),
      setupShowsSuccess: this.setupCard.showsSuccess,
      forumName: siteUrl ? this.forums.label(siteUrl, context.forumName) : '',
      accessDenied: this.accessCard.isDenied(siteUrl)
    });
    this.accessCard.render(guidance);
    const topicView = $('topicView');
    topicView.dataset.guidance = guidance.state;
    topicView.dataset.primary = guidance.primary;
    if (guidance.hero) {
      $('heroEyebrow').textContent = guidance.hero.eyebrow;
      $('currentPageTitle').textContent = guidance.hero.title;
    }
    $('setupEyebrow').textContent = guidance.checklist ? 'Step 1 of 2' : 'First-time setup';
    return guidance;
  }

  updateControls() {
    const { pageContext, session } = this.state;
    const accessReady = pageContext?.forumAccess !== 'missing';
    const topicKey = pageContext?.topicKey;
    const configReady = this.config.isReady();
    const activeSummaryTask = this.tasks.activeForTopicOfType(TASK_TYPE.SUMMARY, topicKey);
    const operation = this.operations.active;
    const controls = deriveTopicControls({
      operationKind: this.operations.kind,
      backgroundAvailable: this.state.backgroundAvailable,
      configReady,
      hasTopic: Boolean(pageContext?.isForumTopic) && accessReady,
      hasForumPage: Boolean(pageContext?.isDiscourse) && accessReady,
      forumAccessMissing: !accessReady,
      hasSummary: Boolean(session?.summary),
      hasSource: Boolean(session?.source),
      historyLength: session?.history?.length || 0,
      isHydrating: this.state.isHydratingSession,
      activeSummaryTask,
      hasActiveChatTask: Boolean(this.tasks.activeForTopicOfType(TASK_TYPE.CHAT, topicKey)),
      activeTopicTaskCount: this.tasks.activeForTopic(topicKey).length,
      agentRequestPending: operation ? this.tasks.isAgentRequestPending(operation.id) : false,
      hasChatQuestion: this.chat.hasQuestion,
      hasAgentQuestion: Boolean(normalizeAgentQuestion($('agentInput')?.value || '')),
      chatEditSaving: this.chat.isSavingEdit,
      agentSearchLabel: this.agent.searchLabel()
    });
    applyTopicControls(controls, deriveTopicHelper({
      pageContext,
      configReady,
      summaryRunning: Boolean(activeSummaryTask),
      hasSummary: Boolean(session?.summary)
    }));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new DiscourseCopilotPopup().init();
});
