// The one-time "Enjoying DiscourseCopilot?" card (shared/star-prompt.mjs has
// the rule): shown under the summary once the fifth summary has completed,
// and only in the first panel that shows it. Rating, starring or closing it
// dismisses it for good.
import { STAR_PROMPT_KEY, dismissStarPrompt, markStarPromptShown, readStarPrompt, shouldShowStarPrompt } from '../shared/star-prompt.mjs';
import { DiscourseCopilotLogger } from '../shared/logger.js';

export class StarPromptCard {
  /**
   * @param {object} options
   * @param {HTMLElement} options.element the #starPrompt card
   * @param {object} [options.storage] chrome.storage.local
   */
  constructor({ element, storage = globalThis.chrome?.storage?.local }) {
    this.element = element;
    this.storage = storage;
  }

  mount() {
    if (!this.element || !this.storage) return;
    this.element.addEventListener('click', event => {
      if (event.target.closest('[data-star-action]')) this.dismiss();
    });
    // The fifth summary can complete while the panel is open.
    globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes[STAR_PROMPT_KEY]) void this.refresh();
    });
    void this.refresh();
  }

  async refresh() {
    try {
      if (!this.element.classList.contains('hidden')) return;
      if (!shouldShowStarPrompt(await readStarPrompt(this.storage))) return;
      this.element.classList.remove('hidden');
      await markStarPromptShown(this.storage);
    } catch (error) {
      DiscourseCopilotLogger.warn('Popup: Unable to read the star prompt state:', error);
    }
  }

  dismiss() {
    this.element.classList.add('hidden');
    dismissStarPrompt(this.storage).catch(error => {
      DiscourseCopilotLogger.warn('Popup: Unable to save the star prompt dismissal:', error);
    });
  }
}
