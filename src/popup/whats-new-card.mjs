// The "What's new" card after an update (shared/whats-new.mjs has the rule):
// shown at the top of the topic view in every panel until it is closed.
import { WHATS_NEW_KEY, dismissWhatsNew, readWhatsNew, shouldShowWhatsNew } from '../shared/whats-new.mjs';
import { DiscourseCopilotLogger } from '../shared/logger.js';

export class WhatsNewCard {
  /**
   * @param {object} options
   * @param {HTMLElement} options.element the #whatsNew card
   * @param {object} [options.storage] chrome.storage.local
   */
  constructor({ element, storage = globalThis.chrome?.storage?.local }) {
    this.element = element;
    this.storage = storage;
  }

  mount() {
    if (!this.element || !this.storage) return;
    this.element.addEventListener('click', event => {
      if (event.target.closest('[data-whats-new-action]')) this.dismiss();
    });
    // Closing it in another panel hides it here too.
    globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes[WHATS_NEW_KEY]) void this.refresh();
    });
    void this.refresh();
  }

  async refresh() {
    try {
      const show = shouldShowWhatsNew(await readWhatsNew(this.storage));
      this.element.classList.toggle('hidden', !show);
    } catch (error) {
      DiscourseCopilotLogger.warn("Popup: Unable to read the What's new state:", error);
    }
  }

  dismiss() {
    this.element.classList.add('hidden');
    dismissWhatsNew(this.storage).catch(error => {
      DiscourseCopilotLogger.warn("Popup: Unable to save the What's new dismissal:", error);
    });
  }
}
