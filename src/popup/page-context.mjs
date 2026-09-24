// Which page the side panel is about: follows the active tab, asks its
// content script what it shows (forum, topic), and hands each new context to
// the panel. Only the latest request wins when tabs change quickly.
//
// What the panel can see depends on access (no "tabs" permission):
//   enabled forum       content script answers; URL and title visible
//   toolbar icon click  activeTab: URL visible, probeDiscoursePage() runs
//   anything else       Chrome hides the URL → context.pageHidden
// A page on an enabled forum whose content script is missing (a tab opened
// before the grant or install) gets it injected here.
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { DiscourseCopilotLogger } from '../shared/logger.js';
import {
  FORUM_CONTENT_SCRIPT_FILE,
  hasForumAccess
} from '../shared/forum-access.mjs';
import { getTopicContext } from './conversation-state.mjs';
import { pageStateFromProbe, probeDiscoursePage } from './page-probe.mjs';

const { MESSAGES, SESSION_KEYS } = DiscourseCopilotConstants;

function isWebUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

export class PageContextController {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state; this controller writes state.pageContext
   * @param {(context: object, change: {previous: object|null, pendingMetadata: object|undefined}) => Promise<void>} deps.onContext
   */
  constructor({ state, onContext }) {
    this.state = state;
    this.onContext = onContext;
    this.revision = 0;
    // Title/URL for a topic opened from Activity until its tab reports them.
    this.pendingTopicMetadata = new Map();
  }

  mount() {
    chrome.tabs.onActivated.addListener(() => {
      this.refresh();
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading') {
        // activeTab ends when the tab moves to another site, so a toolbar
        // click no longer says anything about the next page. (Same-site
        // navigations keep activeTab and the URL stays visible anyway.)
        void this.forgetActionClick(tabId);
      }
      if (
        tabId === this.state.pageContext?.tabId
        && (changeInfo.url || changeInfo.title || changeInfo.status === 'complete')
      ) {
        void this.apply(tab);
      }
    });
  }

  // The content script of the shown tab reported a navigation.
  handlePageChanged(sender) {
    if (sender.tab?.id === this.state.pageContext?.tabId) {
      this.refresh();
    }
  }

  async refresh() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await this.apply(tab || {});
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Error checking current page:', error);
      await this.apply({});
    }
  }

  // The toolbar icon was clicked on this tab (background.js records it).
  async wasActionClicked(tabId) {
    const storage = chrome.storage?.session;
    if (!Number.isInteger(tabId) || !storage) {
      return false;
    }
    try {
      const key = SESSION_KEYS.ACTION_CLICKED_TABS;
      const tabs = (await storage.get(key))?.[key];
      return Array.isArray(tabs) && tabs.includes(tabId);
    } catch {
      return false;
    }
  }

  async forgetActionClick(tabId) {
    const storage = chrome.storage?.session;
    if (!storage) {
      return;
    }
    try {
      const key = SESSION_KEYS.ACTION_CLICKED_TABS;
      const tabs = (await storage.get(key))?.[key];
      if (Array.isArray(tabs) && tabs.includes(tabId)) {
        await storage.set({ [key]: tabs.filter(id => id !== tabId) });
      }
    } catch {
      // Best effort: the record only picks "not a forum" over "not checked".
    }
  }

  // Page state without a content-script answer: inject the content script
  // on an enabled forum, otherwise probe the page once (needs activeTab).
  async probePageState(tab) {
    const scripting = chrome.scripting;
    if (!Number.isInteger(tab?.id) || !isWebUrl(tab.url) || !scripting?.executeScript) {
      return null;
    }
    const target = { tabId: tab.id };
    if (await hasForumAccess(tab.url)) {
      try {
        await scripting.executeScript({ target, files: [FORUM_CONTENT_SCRIPT_FILE] });
        const state = await this.queryPageState(tab);
        if (state) {
          return state;
        }
      } catch {
        // Fall through to the probe.
      }
    }
    try {
      const [injection] = await scripting.executeScript({ target, func: probeDiscoursePage });
      return pageStateFromProbe(injection?.result);
    } catch {
      // No access to this tab (no toolbar click yet) or a restricted page.
      return null;
    }
  }

  async queryPageState(tab) {
    if (!Number.isInteger(tab?.id)) {
      return null;
    }
    try {
      const state = await chrome.tabs.sendMessage(tab.id, { action: MESSAGES.GET_POST_ID });
      return state && typeof state === 'object' ? state : null;
    } catch {
      // Restricted pages and tabs opened before install have no content script.
      return null;
    }
  }

  async apply(tab, { siteUrlHint = '' } = {}) {
    if (!tab?.url && tab?.pendingUrl) {
      // A tab that is still loading only reports where it is going.
      tab = { ...tab, url: tab.pendingUrl };
    }
    const revision = ++this.revision;
    const pageState = await this.queryPageState(tab) || await this.probePageState(tab);
    const actionChecked = !tab?.url && await this.wasActionClicked(tab?.id);
    if (revision !== this.revision) {
      return;
    }
    let context = getTopicContext(tab, pageState, { siteUrlHint, actionChecked });
    if (context.siteUrl && !(await hasForumAccess(context.siteUrl))) {
      context = getTopicContext(tab, pageState, { siteUrlHint, actionChecked, forumAccess: false });
    }
    if (revision !== this.revision) {
      return;
    }
    const pendingMetadata = this.pendingTopicMetadata.get(context.topicKey);
    if (pendingMetadata) {
      context.title = pendingMetadata.title;
      context.url = pendingMetadata.url;
    }
    const previous = this.state.pageContext;
    this.state.pageContext = context;
    await this.onContext(context, { previous, pendingMetadata });
  }

  expectMetadata({ topicKey, title, url }) {
    this.pendingTopicMetadata.set(topicKey, { title, url });
  }

  forgetMetadata(topicKey) {
    this.pendingTopicMetadata.delete(topicKey);
  }
}
