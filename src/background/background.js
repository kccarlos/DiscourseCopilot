// Service worker entry: builds the task service and its executors, then
// registers every Chrome listener (each exactly once, at startup, so a
// suspended worker is woken by the events it needs).
import { AIService } from '../services/ai-service.js';
import { topicSessionDatabase } from '../shared/topic-session-db.mjs';
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
import {
  forumOriginPattern,
  hasForumAccess,
  injectForumContentScript,
  originFromPattern,
  subscribeForumAccess,
  syncForumContentScripts
} from '../shared/forum-access.mjs';

const { MESSAGES, SESSION_KEYS } = DiscourseCopilotConstants;
const MAX_ACTION_CLICKED_TABS = 50;
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
const taskService = new TaskService({
  db: topicSessionDatabase,
  agentActivities,
  broadcast,
  hasForumAccess: siteUrl => hasForumAccess(siteUrl)
});
const getTaskConfiguration = task => taskService.getTaskConfiguration(task);

const { executeSummaryTask, executeChatTask } = createTopicExecutors({
  aiService,
  db: topicSessionDatabase,
  broadcast,
  getTaskConfiguration,
  fetchTopicContent: createTopicFetcher(),
  hasForumAccess: siteUrl => hasForumAccess(siteUrl)
});
const executeAgentTask = createAgentExecutor({
  aiService,
  activities: agentActivities,
  broadcast,
  getTaskConfiguration,
  governor: new ForumRequestGovernor({ minIntervalMs: 750 }),
  hasForumAccess: siteUrl => hasForumAccess(siteUrl)
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

// Forum access: the content script runs only on forums the user enabled.
// Registrations are serialized (registerContentScripts rejects a duplicate
// ID) and re-synced whenever the worker starts — that covers install,
// update and browser startup — and whenever access changes.
let contentScriptSync = Promise.resolve();
function syncContentScripts() {
  contentScriptSync = contentScriptSync
    .catch(() => {})
    .then(() => syncForumContentScripts())
    .catch(error => {
      console.warn('Background: Unable to sync the forum content script:', error);
    });
  return contentScriptSync;
}
void syncContentScripts();
subscribeForumAccess(({ type, origins }) => {
  void syncContentScripts().then(() => (type === 'added'
    // Show the launcher in tabs already open on a newly enabled forum.
    ? injectForumContentScript(origins)
    : undefined));
});

// Browser start: make sure the registration matches the granted forums.
chrome.runtime.onStartup?.addListener(() => {
  void syncContentScripts();
});

// Updating from 2.0 (which had access to all sites): Chrome may keep that grant as the
// wildcard optional patterns. Nothing in 2.1 ever asks for them, so drop
// them; forums are then enabled one at a time. No gesture is needed to
// remove a permission.
async function dropLegacyWildcardAccess() {
  const wildcards = ['https://*/*', 'http://*/*'];
  const held = [];
  for (const origin of wildcards) {
    if (await chrome.permissions.contains({ origins: [origin] })) {
      held.push(origin);
    }
  }
  if (held.length) {
    await chrome.permissions.remove({ origins: held });
  }
}

// First install: open the settings page in welcome mode so setup starts right away.
chrome.runtime.onInstalled?.addListener(details => {
  if (details?.reason === 'update') {
    void dropLegacyWildcardAccess()
      .catch(error => console.warn('Background: Unable to drop legacy site access:', error))
      .then(() => syncContentScripts());
  }
  if (details?.reason !== 'install') {
    return;
  }
  const optionsPage = chrome.runtime.getManifest?.().options_page || 'src/settings/settings.html';
  Promise.resolve(chrome.tabs.create({ url: `${chrome.runtime.getURL(optionsPage)}?welcome=1` }))
    .catch(error => {
      console.warn('Background: Unable to open the welcome page:', error);
    });
});

// Clicking the toolbar icon grants activeTab for that tab, which lets the
// side panel read its URL and check whether it is a Discourse forum before
// the user enabled it. (sidePanel.setPanelBehavior({openPanelOnActionClick})
// would skip this listener, so the panel is opened here instead.)
async function rememberActionClick(tabId) {
  const storage = chrome.storage?.session;
  if (!Number.isInteger(tabId) || !storage) {
    return;
  }
  const key = SESSION_KEYS.ACTION_CLICKED_TABS;
  const stored = (await storage.get(key))?.[key];
  const tabs = (Array.isArray(stored) ? stored : []).filter(id => id !== tabId);
  await storage.set({ [key]: [...tabs, tabId].slice(-MAX_ACTION_CLICKED_TABS) });
}

chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ windowId: tab.windowId });
  void rememberActionClick(tab.id)
    .catch(() => {})
    .then(() => broadcast({ action: MESSAGES.ACTION_CLICKED, tabId: tab.id }));
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

  // Side panel: the user just enabled a forum. Register the content script
  // and inject it into the forum's open tabs before the panel re-checks the
  // page (permissions.onAdded does the same; both are idempotent).
  [MESSAGES.SYNC_FORUM_ACCESS]: respondAsync(async request => {
    const granted = await hasForumAccess(request.siteUrl);
    await syncContentScripts();
    const origin = originFromPattern(forumOriginPattern(request.siteUrl));
    const injected = granted && origin ? await injectForumContentScript([origin]) : 0;
    return { granted, injected };
  }),

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
