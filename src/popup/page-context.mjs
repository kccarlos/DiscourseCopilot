// Which page the side panel is about: follows the active tab, asks its
// content script what it shows (forum, topic), and hands each new context to
// the panel. Only the latest request wins when tabs change quickly.
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { getTopicContext } from './conversation-state.mjs';

const { MESSAGES } = DiscourseCopilotConstants;

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
    const pageState = await this.queryPageState(tab);
    if (revision !== this.revision) {
      return;
    }
    const context = getTopicContext(tab, pageState, { siteUrlHint });
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
