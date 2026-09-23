// Service worker entry: builds the task service and its executors, then
// registers every Chrome listener (each exactly once, at startup, so a
// suspended worker is woken by the events it needs).
import { AIService } from '../services/ai-service.js';
import { topicSessionDatabase } from '../popup/topic-session-db.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { TASK_TYPE } from '../shared/task-record.mjs';
import { ConfigStore } from '../shared/config-state.mjs';
import { resolveRetention } from '../shared/preferences.mjs';
import { ForumRequestGovernor } from './forum-tools.mjs';
import { AgentActivityStore } from './agent-activity-store.mjs';
import { TaskService } from './task-service.mjs';
import { createTopicFetcher } from './topic-fetcher.mjs';
import { createTopicExecutors } from './topic-executors.mjs';
import { createAgentExecutor } from './agent-executor.mjs';
import { createMessageRouter, respondAsync } from './message-router.mjs';

const { MESSAGES } = DiscourseCopilotConstants;
const SIDE_PANEL_PATH = 'src/popup/popup.html';

// Sends to every open extension view; nobody listening is fine.
function broadcast(message) {
  try {
    const delivery = chrome.runtime.sendMessage(message);
    delivery?.catch?.(() => {});
  } catch {
    // No extension view is currently listening.
  }
}

const aiService = new AIService();
const agentActivities = new AgentActivityStore({ db: topicSessionDatabase, broadcast });
const taskService = new TaskService({ db: topicSessionDatabase, agentActivities, broadcast });
const getTaskConfiguration = task => taskService.getTaskConfiguration(task);

const { executeSummaryTask, executeChatTask } = createTopicExecutors({
  aiService,
  db: topicSessionDatabase,
  broadcast,
  getTaskConfiguration,
  fetchTopicContent: createTopicFetcher()
});
const executeAgentTask = createAgentExecutor({
  aiService,
  activities: agentActivities,
  broadcast,
  getTaskConfiguration,
  governor: new ForumRequestGovernor({ minIntervalMs: 750 })
});

const EXECUTORS = {
  [TASK_TYPE.SUMMARY]: executeSummaryTask,
  [TASK_TYPE.CHAT]: executeChatTask,
  [TASK_TYPE.AGENT]: executeAgentTask
};

taskService.start((task, context) => {
  const execute = EXECUTORS[task.type];
  if (!execute) {
    throw new Error(`Unsupported task type: ${task.type}`);
  }
  return execute(task, context);
});

chrome.alarms.onAlarm.addListener(alarm => taskService.handleAlarm(alarm));

// Saved preferences changed (settings page, another window): apply a new
// history retention right away — the database removes what it no longer
// keeps. Research depth and the page limit need nothing here: every task
// reads them from the preferences when it is queued.
const configStore = new ConfigStore({
  reloadDelayMs: 250,
  onError: error => console.warn('Background: Unable to reload preferences:', error)
});
configStore.subscribe(event => {
  if (event.type !== 'loaded') {
    return;
  }
  void taskService.ready
    .then(() => taskService.applyRetention(resolveRetention(configStore.config.preferences)))
    .catch(error => {
      console.warn('Background: Unable to apply history retention:', error);
    });
});

// First install: open the settings page in welcome mode so setup starts right away.
chrome.runtime.onInstalled?.addListener(details => {
  if (details?.reason !== 'install') {
    return;
  }
  const optionsPage = chrome.runtime.getManifest?.().options_page || 'src/settings/settings.html';
  Promise.resolve(chrome.tabs.create({ url: `${chrome.runtime.getURL(optionsPage)}?welcome=1` }))
    .catch(error => {
      console.warn('Background: Unable to open the welcome page:', error);
    });
});

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onMessage.addListener(createMessageRouter({
  // Content script: enable the side panel on forum pages.
  [MESSAGES.PAGE_CHANGED]: (request, sender, sendResponse) => {
    if (!sender.tab?.id) {
      return undefined;
    }
    return respondAsync(() => chrome.sidePanel.setOptions({
      tabId: sender.tab.id,
      path: SIDE_PANEL_PATH,
      enabled: request.isDiscourse === true
        || request.isForumPage === true
        || Boolean(request.postId)
    }))(request, sender, sendResponse);
  },

  // Content script: the in-page launcher button.
  [MESSAGES.OPEN_SIDE_PANEL]: (request, sender, sendResponse) => {
    if (!sender.tab?.id) {
      sendResponse({ success: false, error: 'No forum tab is available' });
      return false;
    }
    return respondAsync(() => chrome.sidePanel.open({ tabId: sender.tab.id }))(
      request, sender, sendResponse
    );
  },

  // Side panel: task queue.
  [MESSAGES.ENQUEUE_TASK]: respondAsync(async request => ({
    task: await taskService.enqueue(request)
  })),
  [MESSAGES.CANCEL_TASK]: respondAsync(async request => ({
    task: await taskService.cancel(request.taskId)
  })),
  [MESSAGES.RESUME_TASK]: respondAsync(async request => ({
    task: await taskService.resume(request.taskId)
  })),
  [MESSAGES.LIST_TASKS]: respondAsync(async () => {
    await taskService.ready;
    return { tasks: taskService.list() };
  }),
  [MESSAGES.TASK_HEARTBEAT]: respondAsync(async () => {
    await taskService.ready;
    return { activeTasks: taskService.activeTaskCount() };
  })
}));
