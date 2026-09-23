// Opening forum pages from the side panel without piling up tabs.
import { findTabForForumTarget } from './conversation-state.mjs';

/**
 * Focuses a tab already showing the target (a topic, or any page of the
 * forum when no topic is given); otherwise opens it in a new tab next to the
 * current one. Never navigates away from the page being read. With
 * `navigateExisting`, a matching tab is also moved to `url` (e.g. a specific
 * post of the topic it already shows).
 * @returns {Promise<object|null>} the newly created tab, or null when an
 *   existing tab was focused
 */
export async function openForumTarget(
  { siteUrl, url = '', topicKey = '', navigateExisting = false },
  { tabs = chrome.tabs, windows = chrome.windows } = {}
) {
  let candidates = [];
  try {
    candidates = await tabs.query({ url: `${siteUrl}/*` });
  } catch {
    // An unusual site URL is not a valid match pattern; open a new tab.
  }
  const existing = findTabForForumTarget(candidates, { siteUrl, topicKey });
  if (existing) {
    await tabs.update(
      existing.id,
      navigateExisting && url && existing.url !== url ? { url, active: true } : { active: true }
    );
    if (Number.isInteger(existing.windowId) && windows?.update) {
      try {
        await windows.update(existing.windowId, { focused: true });
      } catch {
        // Focusing another window is best effort.
      }
    }
    return null;
  }
  const [activeTab] = await tabs.query({ active: true, currentWindow: true });
  const createProperties = { url: url || siteUrl, active: true };
  if (Number.isInteger(activeTab?.index)) {
    createProperties.index = activeTab.index + 1;
  }
  return tabs.create(createProperties);
}
