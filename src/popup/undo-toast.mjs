// The side panel's Undo toast (#undoToast): what was just deleted and an
// Undo button, for UNDO_WINDOW_MS. The text is announced through the
// panel's announce() helper; the window pauses while the pointer or focus
// is on the toast, and Ctrl/Cmd+Z undoes too (outside text fields).
import { UndoSlot } from './undo-slot.mjs';
import { announce } from './status-line.mjs';

function isEditable(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'));
}

export class UndoToast {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.element #undoToast
   * @param {(error: Error) => void} [deps.onError] an undo failed
   * @param {object} [deps.slotOptions] UndoSlot options (window, timers)
   */
  constructor({ element, onError = () => {}, slotOptions = {} }) {
    this.element = element;
    this.text = element.querySelector('[data-part="undo-text"]');
    this.button = element.querySelector('[data-part="undo-button"]');
    this.onError = onError;
    this.slot = new UndoSlot({
      ...slotOptions,
      onChange: pending => this.render(pending)
    });
  }

  mount() {
    this.button.addEventListener('click', () => {
      void this.undo();
    });
    this.element.addEventListener('pointerenter', () => this.slot.pause());
    this.element.addEventListener('pointerleave', () => {
      if (!this.element.contains(document.activeElement)) this.slot.resume();
    });
    this.element.addEventListener('focusin', () => this.slot.pause());
    this.element.addEventListener('focusout', event => {
      if (!this.element.contains(event.relatedTarget)) this.slot.resume();
    });
    document.addEventListener('keydown', event => {
      if (
        this.slot.pending
        && (event.ctrlKey || event.metaKey)
        && !event.shiftKey
        && event.key.toLowerCase() === 'z'
        && !isEditable(event.target)
      ) {
        event.preventDefault();
        void this.undo();
      }
    });
  }

  get pending() {
    return this.slot.pending;
  }

  /**
   * Shows the toast for a deletion that already happened.
   * @param {{ message: string, undo: () => Promise<void>|void, expire?: () => void }} action
   */
  offer(action) {
    return this.slot.offer(action);
  }

  async undo() {
    try {
      return await this.slot.undo();
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  render(pending) {
    const show = Boolean(pending);
    // Undo is about to disappear; don't leave focus on a hidden button.
    const hadFocus = !show && this.element.contains(document.activeElement);
    this.element.classList.toggle('hidden', !show);
    if (show) {
      announce(this.text, pending.message);
    } else if (hadFocus) {
      document.activeElement.blur();
    }
  }
}
