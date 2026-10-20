// First-install page. Chrome opens the side panel only in response to a
// user action, so the install handler opens this tab and its one button
// opens the side panel (where setup happens), then closes the tab.
import { localizeDocument, t } from '../shared/i18n.mjs';

localizeDocument(document);

const button = document.getElementById('openPanel');
const status = document.getElementById('status');

button.addEventListener('click', async () => {
  button.disabled = true;
  status.removeAttribute('data-type');
  try {
    const tab = await chrome.tabs.getCurrent();
    await chrome.sidePanel.open({ windowId: tab.windowId });
    status.textContent = t('welcome.opened');
    // The panel belongs to the window, so it stays open when this tab goes.
    await chrome.tabs.remove(tab.id);
  } catch (error) {
    console.warn('Welcome: Unable to open the side panel:', error);
    status.dataset.type = 'error';
    status.textContent = t('welcome.openFailed');
    button.disabled = false;
  }
});
