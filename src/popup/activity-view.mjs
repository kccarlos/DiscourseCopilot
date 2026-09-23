// The Activity screen (#savedView): the Tasks and Saved tabs, grouped by
// forum with an optional forum filter, and the Agent answer detail view.
// It also owns navigation between the topic view and this screen.
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { TASK_STATUS, TASK_TYPE } from '../shared/task-record.mjs';
import { siteUrlFromPageUrl } from '../shared/forum-site.mjs';
import { topicSessionDatabase } from './topic-session-db.mjs';
import {
  cleanTopicTitle,
  getDefaultActivityTab,
  groupByForum,
  partitionTasks,
  selectSavedAgentActivities
} from './ui-state.mjs';
import { applyForumHue, createForumAvatar } from './forum-ui.mjs';
import { openForumTarget } from './forum-tabs.mjs';
import {
  createAgentTaskCard,
  createSavedAgentCard,
  createSavedTopicCard,
  createTopicTaskCard
} from './activity-cards.mjs';

const $ = id => document.getElementById(id);

function emptyMessage(className, text) {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

export class ActivityView {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (pageContext, session,
   *   savedViewOpen, agentDetailOpen, persistenceAvailable)
   * @param {object} deps.tasks TaskRegistry
   * @param {object} deps.forums ForumDirectory
   * @param {object} deps.sessions SessionStore
   * @param {object} deps.agent AgentController
   * @param {object} deps.hooks cancelTask, isCurrentTopic, showCurrentTopic,
   *   showCreatedTab, expectTopicMetadata, forgetTopicMetadata,
   *   resetCurrentSession
   */
  constructor({ state, tasks, forums, sessions, agent, hooks }) {
    this.state = state;
    this.tasks = tasks;
    this.forums = forums;
    this.sessions = sessions;
    this.agent = agent;
    this.hooks = hooks;
    this.activityTab = 'tasks';
    this.savedEntries = [];
    this.savedItems = [];
    this.forumGroupState = new Map();
    this.forumFilter = '';
    this.forumFilterSignature = '';
    this.detailReturnsToTopic = false;
  }

  // Forum records the Saved tab knows about (for forum names).
  get savedRecords() {
    return this.savedEntries;
  }

  mount() {
    $('savedBtn').addEventListener('click', () => {
      this.show();
    });
    $('closeSavedBtn').addEventListener('click', () => {
      this.hide();
    });
    $('tasksTab').addEventListener('click', () => {
      this.selectTab('tasks');
    });
    $('summariesTab').addEventListener('click', () => {
      this.selectTab('saved');
    });
    document.querySelector('.tab-list').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return;
      }
      event.preventDefault();
      const nextTab = this.activityTab === 'tasks' ? 'saved' : 'tasks';
      this.selectTab(nextTab);
      $(nextTab === 'tasks' ? 'tasksTab' : 'summariesTab').focus();
    });
    $('closeAgentDetailBtn').addEventListener('click', () => {
      this.hideAgentDetail();
    });
  }

  // ---------- Navigation ----------

  async show() {
    this.state.savedViewOpen = true;
    this.state.agentDetailOpen = false;
    $('agentDetailView').classList.add('hidden');
    document.querySelector('.tab-list')?.classList.remove('hidden');
    $('topicView').classList.add('hidden');
    $('savedView').classList.remove('hidden');
    this.selectTab(getDefaultActivityTab(this.tasks.values(), this.agent.runRecords()));
    this.renderTaskList();
    await this.loadSavedList();
  }

  hide() {
    this.state.savedViewOpen = false;
    this.hideAgentDetail();
    $('savedView').classList.add('hidden');
    $('topicView').classList.remove('hidden');
  }

  // The page changed: "This forum" and the current-topic markers follow it.
  refreshForPageChange() {
    if (this.state.savedViewOpen && !this.state.agentDetailOpen) {
      this.renderTaskList();
      void this.loadSavedList();
    }
  }

  selectTab(tab) {
    this.activityTab = tab === 'saved' ? 'saved' : 'tasks';
    const showingTasks = this.activityTab === 'tasks';
    const tasksTab = $('tasksTab');
    const summariesTab = $('summariesTab');
    tasksTab.classList.toggle('active', showingTasks);
    summariesTab.classList.toggle('active', !showingTasks);
    tasksTab.setAttribute('aria-selected', String(showingTasks));
    summariesTab.setAttribute('aria-selected', String(!showingTasks));
    tasksTab.tabIndex = showingTasks ? 0 : -1;
    summariesTab.tabIndex = showingTasks ? -1 : 0;
    $('tasksPanel').classList.toggle('hidden', !showingTasks);
    $('summariesPanel').classList.toggle('hidden', showingTasks);
  }

  showSavedStatus(message, type = 'info') {
    const status = $('savedStatus');
    // Unhide before writing so the live region announces the new text.
    status.className = `status ${type}`;
    status.textContent = message;
  }

  async openAgentActivity(value) {
    try {
      const stored = await this.agent.getRecord(value);
      if (!stored) {
        this.agent.report('Agent answer is no longer available', 'warning');
        return;
      }
      const activity = this.agent.runRecord(stored.activityId) || stored;
      // Opened from the topic view (pill, panel): Back returns there.
      this.detailReturnsToTopic = !this.state.savedViewOpen;
      $('closeAgentDetailBtn').setAttribute(
        'aria-label',
        this.detailReturnsToTopic ? 'Back to current page' : 'Back to Activity'
      );
      this.state.savedViewOpen = true;
      this.state.agentDetailOpen = true;
      $('topicView').classList.add('hidden');
      $('savedView').classList.remove('hidden');
      // The detail view has its own back button to Activity.
      $('savedViewHeader').classList.add('hidden');
      $('savedStatus').classList.add('hidden');
      document.querySelector('.tab-list').classList.add('hidden');
      $('forumFilter').classList.add('hidden');
      this.forumFilterSignature = '';
      $('tasksPanel').classList.add('hidden');
      $('summariesPanel').classList.add('hidden');
      $('agentDetailView').classList.remove('hidden');
      this.agent.showDetail(activity);
      $('agentDetailHeading').focus({ preventScroll: true });
      window.scrollTo(0, 0);
      this.agent.markOpened(activity, { force: true });
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to open Agent activity:', error);
      this.agent.report(`Unable to open Agent answer: ${error.message}`, 'error');
    }
  }

  hideAgentDetail() {
    if (this.state.agentDetailOpen && this.detailReturnsToTopic) {
      this.detailReturnsToTopic = false;
      this.hide();
      this.agent.renderPanel();
      return;
    }
    this.detailReturnsToTopic = false;
    this.state.agentDetailOpen = false;
    this.agent.clearDetail();
    $('agentDetailView')?.classList.add('hidden');
    $('savedViewHeader')?.classList.remove('hidden');
    document.querySelector('.tab-list')?.classList.remove('hidden');
    if (this.state.savedViewOpen) {
      this.selectTab(this.activityTab);
      this.renderTaskList();
      void this.loadSavedList();
    }
  }

  // ---------- Lists ----------

  async loadSavedList() {
    const list = $('savedList');
    list.replaceChildren();
    $('savedStatus').classList.add('hidden');

    if (!this.state.persistenceAvailable) {
      this.showSavedStatus('Saved summaries are unavailable in this browser context', 'warning');
      return;
    }

    list.appendChild(emptyMessage('saved-empty', 'Loading saved summaries…'));

    try {
      const [entries, agentActivities] = await Promise.all([
        topicSessionDatabase.list(),
        topicSessionDatabase.listAgentActivities()
      ]);
      if (!this.state.savedViewOpen) {
        return;
      }
      this.agent.absorb(agentActivities);
      const savedItems = [
        ...entries.map(entry => ({
          kind: 'topic',
          entry,
          siteUrl: entry.siteUrl,
          forumName: entry.forumName,
          updatedAt: entry.updatedAt
        })),
        ...selectSavedAgentActivities(agentActivities).map(activity => ({
          kind: 'agent',
          activity,
          siteUrl: activity.siteUrl,
          forumName: activity.forumName,
          updatedAt: activity.updatedAt
        }))
      ].sort((left, right) => right.updatedAt - left.updatedAt);
      this.savedEntries = entries;
      this.savedItems = savedItems;
      this.forums.refresh();
      this.renderForumFilter();
      $('savedCount').textContent = String(savedItems.length);
      list.replaceChildren();
      if (!savedItems.length) {
        list.appendChild(emptyMessage(
          'saved-empty',
          'No saved items yet. Keep a summary or Agent answer to find it here.'
        ));
        return;
      }

      this.renderForumGroups(list, savedItems, 'saved', item => item.kind === 'agent'
        ? this.createSavedAgentCard(item.activity)
        : this.createSavedTopicCard(item.entry));
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to list saved summaries:', error);
      list.replaceChildren();
      this.showSavedStatus('Unable to load saved summaries', 'error');
    }
  }

  renderTaskList() {
    const activeList = $('activeTaskList');
    const recentList = $('taskList');
    // Progress updates rebuild the lists; keep keyboard focus on its control.
    const focusKey = document.activeElement?.dataset?.focusKey || '';
    activeList.replaceChildren();
    recentList.replaceChildren();
    const { active, recent } = partitionTasks(this.tasks.values());
    $('taskCount').textContent = String(active.length);
    $('recentTaskCount').textContent = String(recent.length);
    this.forums.refresh();
    this.renderForumFilter();

    if (!active.length) {
      activeList.appendChild(emptyMessage(
        'task-empty',
        'Nothing is running right now. New summaries and questions will appear here.'
      ));
    }

    const queuedIds = active
      .filter(task => task.status === TASK_STATUS.QUEUED)
      .sort((left, right) => left.createdAt - right.createdAt)
      .map(task => task.id);
    this.renderForumGroups(activeList, active, 'active', task =>
      this.createTaskCard(task, queuedIds.indexOf(task.id) + 1));
    this.renderForumGroups(recentList, recent, 'recent', task =>
      this.createTaskCard(task, 0));
    $('recentTasks').classList.toggle('hidden', !recent.length);
    if (focusKey) {
      document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
    }
  }

  isForumGroupExpanded(listKey, group, groupCount) {
    if (this.forumFilter) {
      return true;
    }
    const stored = this.forumGroupState.get(`${listKey}:${group.siteUrl}`);
    return typeof stored === 'boolean'
      ? stored
      : group.isCurrent || groupCount <= 3;
  }

  renderForumGroups(container, items, listKey, createCard) {
    const filter = this.forumFilter;
    const visible = filter
      ? items.filter(item => item.siteUrl === filter)
      : items;
    const groups = groupByForum(visible, this.state.pageContext?.siteUrl, {
      names: this.forums.names
    });
    if (filter && items.length && !visible.length) {
      container.appendChild(emptyMessage('saved-empty', `Nothing from ${this.forums.label(filter)} here.`));
      return;
    }

    groups.forEach((group, index) => {
      const section = document.createElement('section');
      section.className = 'forum-group';
      section.classList.toggle('current', group.isCurrent);
      const bodyId = `forum-group-${listKey}-${index}`;
      const expanded = this.isForumGroupExpanded(listKey, group, groups.length);
      const forumName = group.siteUrl ? this.forums.label(group.siteUrl, group.forumName) : group.forumName;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'forum-group-toggle';
      toggle.dataset.focusKey = `${listKey}:${group.siteUrl}`;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-controls', bodyId);
      toggle.setAttribute(
        'aria-label',
        `${forumName}${group.isCurrent ? ', this forum' : ''}, ${group.items.length} item${group.items.length === 1 ? '' : 's'}`
      );

      const copy = document.createElement('span');
      copy.className = 'forum-group-copy';
      const name = document.createElement('strong');
      name.textContent = forumName;
      copy.appendChild(name);
      if (group.hostname && group.hostname !== forumName) {
        const host = document.createElement('span');
        host.className = 'forum-group-host';
        host.textContent = group.hostname;
        copy.appendChild(host);
      }
      toggle.append(createForumAvatar(group.siteUrl, forumName, group.isCurrent), copy);
      if (group.isCurrent) {
        const badge = document.createElement('span');
        badge.className = 'forum-current-badge';
        badge.textContent = 'This forum';
        toggle.appendChild(badge);
      }
      const count = document.createElement('span');
      count.className = 'count-badge';
      count.textContent = String(group.items.length);
      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.setAttribute('aria-hidden', 'true');
      toggle.append(count, chevron);

      const body = document.createElement('div');
      body.id = bodyId;
      body.className = 'forum-group-items';
      body.hidden = !expanded;
      for (const item of group.items) {
        body.appendChild(createCard(item));
      }
      toggle.addEventListener('click', () => {
        const next = toggle.getAttribute('aria-expanded') !== 'true';
        this.forumGroupState.set(`${listKey}:${group.siteUrl}`, next);
        toggle.setAttribute('aria-expanded', String(next));
        body.hidden = !next;
      });
      section.append(toggle, body);
      container.appendChild(section);
    });
  }

  renderForumFilter() {
    const container = $('forumFilter');
    const records = [
      ...this.tasks.values().map(task => ({
        siteUrl: task.siteUrl,
        forumName: task.forumName,
        updatedAt: task.updatedAt || task.createdAt
      })),
      ...this.savedItems
    ].filter(record => record.siteUrl);
    const groups = groupByForum(records, this.state.pageContext?.siteUrl, {
      names: this.forums.names
    });
    if (this.forumFilter && !groups.some(group => group.siteUrl === this.forumFilter)) {
      this.forumFilter = '';
    }
    const options = groups.length >= 2
      ? [
          { siteUrl: '', label: 'All' },
          ...groups.map(group => ({
            siteUrl: group.siteUrl,
            label: this.forums.label(group.siteUrl, group.forumName)
          }))
        ]
      : [];
    const signature = JSON.stringify([this.forumFilter, options]);
    if (signature === this.forumFilterSignature) {
      return;
    }
    this.forumFilterSignature = signature;
    container.replaceChildren();
    container.classList.toggle('hidden', !options.length);
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'forum-filter-chip';
      button.dataset.focusKey = `filter:${option.siteUrl}`;
      button.setAttribute('aria-pressed', String(option.siteUrl === this.forumFilter));
      if (option.siteUrl) {
        applyForumHue(button, option.siteUrl);
        const dot = document.createElement('span');
        dot.className = 'forum-filter-dot';
        dot.setAttribute('aria-hidden', 'true');
        button.appendChild(dot);
      }
      button.append(option.label);
      button.addEventListener('click', () => {
        this.forumFilter = option.siteUrl;
        this.renderTaskList();
        void this.loadSavedList();
        container.querySelector(`[data-focus-key="${CSS.escape(`filter:${option.siteUrl}`)}"]`)?.focus();
      });
      container.appendChild(button);
    }
  }

  // ---------- Cards ----------

  createTaskCard(task, queuePosition) {
    const cancel = taskId => void this.hooks.cancelTask(taskId);
    if (task.type === TASK_TYPE.AGENT) {
      return createAgentTaskCard(task, {
        queuePosition,
        activity: this.agent.activities.get(task.agentRunId || task.id),
        onOpen: value => void this.openAgentActivity(value),
        onResume: taskId => void this.agent.resumeTask(taskId),
        onRetry: value => void this.agent.retryTask(value),
        onCancel: cancel
      });
    }
    return createTopicTaskCard(task, {
      queuePosition,
      forumName: this.forums.label(task.siteUrl, task.forumName),
      isCurrentTopic: this.hooks.isCurrentTopic(task.topicKey),
      onOpen: value => void this.openSavedTopic(value),
      onCancel: cancel
    });
  }

  createSavedTopicCard(entry) {
    return createSavedTopicCard(entry, {
      forumName: this.forums.label(entry.siteUrl, entry.forumName),
      isCurrent: this.hooks.isCurrentTopic(entry.topicKey),
      hasActiveTasks: this.tasks.activeForTopic(entry.topicKey).length > 0,
      onOpen: value => void this.openSavedTopic(value),
      onKeep: (value, button) => void this.setSavedSessionKept(value, value.kept !== true, button),
      onDelete: value => void this.deleteSavedTopic(value)
    });
  }

  createSavedAgentCard(activity) {
    return createSavedAgentCard(activity, {
      onOpen: value => void this.openAgentActivity(value),
      onKeep: (value, button) => void this.agent.setKept(value, value.kept !== true, button),
      onDelete: value => void this.agent.deleteActivity(value)
    });
  }

  // ---------- Saved topic actions ----------

  async setSavedSessionKept(entry, kept, button) {
    const previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = kept ? 'Keeping…' : 'Updating…';
    try {
      const session = await topicSessionDatabase.setKept(entry.topicKey, kept);
      this.sessions.cache(session);
      if (this.hooks.isCurrentTopic(session.topicKey)) {
        this.state.session = session;
      }
      await this.loadSavedList();
    } catch (error) {
      button.disabled = false;
      button.textContent = previousLabel;
      DiscourseCopilotLogger.error('Popup: Unable to update saved session retention:', error);
      this.showSavedStatus(`Unable to update retention: ${error.message}`, 'error');
    }
  }

  async openSavedTopic(entry) {
    if (!entry?.topicKey || !entry.url) {
      this.showSavedStatus('This saved item has no forum link', 'error');
      return;
    }
    if (this.hooks.isCurrentTopic(entry.topicKey)) {
      this.hide();
      this.hooks.showCurrentTopic();
      return;
    }

    this.showSavedStatus('Opening the forum topic…', 'loading');
    this.hooks.expectTopicMetadata(entry);
    try {
      const siteUrl = entry.siteUrl || siteUrlFromPageUrl(entry.url);
      const createdTab = await openForumTarget({
        siteUrl,
        url: entry.url,
        topicKey: entry.topicKey
      });
      this.hide();
      if (createdTab) {
        // The new tab has no committed URL yet; show the topic right away.
        await this.hooks.showCreatedTab({ ...createdTab, url: entry.url, title: entry.title }, siteUrl);
      } else {
        // An existing tab keeps its own title and URL.
        this.hooks.forgetTopicMetadata(entry.topicKey);
      }
    } catch (error) {
      this.hooks.forgetTopicMetadata(entry.topicKey);
      DiscourseCopilotLogger.error('Popup: Unable to open saved topic:', error);
      this.showSavedStatus(`Unable to open post: ${error.message}`, 'error');
    }
  }

  async deleteSavedTopic(entry) {
    const title = cleanTopicTitle(entry.title, this.forums.label(entry.siteUrl, entry.forumName));
    if (!window.confirm(`Delete the saved summary and chat for “${title}”?`)) {
      return;
    }

    try {
      await topicSessionDatabase.delete(entry.topicKey);
      this.sessions.forget(entry.topicKey);
      if (this.hooks.isCurrentTopic(entry.topicKey)) {
        this.hooks.resetCurrentSession();
      }
      await this.loadSavedList();
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to delete saved summary:', error);
      this.showSavedStatus(`Unable to delete: ${error.message}`, 'error');
    }
  }
}
