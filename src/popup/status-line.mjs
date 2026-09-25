// The side panel's status line (#status, a polite live region) and the
// helper used by the other screen-reader announcers.

// Clears then sets the text so screen readers announce a repeated message.
export function announce(element, message, delayMs = 50) {
  if (!element) return;
  element.textContent = '';
  setTimeout(() => {
    element.textContent = message;
  }, delayMs);
}

export class StatusLine {
  constructor(element) {
    this.element = element;
  }

  // `kind` tells quiet re-renders what the message is about: 'idle' page
  // hints, 'setup' provider warnings, or anything else ('transient').
  show(message, type = 'loading', { kind = 'transient' } = {}) {
    const status = this.element;
    if (status.textContent === message && status.dataset.kind === kind && status.className === `status ${type}`) {
      // Re-renders repeat the same status; don't make screen readers repeat it.
      return;
    }
    // Unhide before writing so the live region announces the new text.
    status.className = `status ${type}`;
    status.dataset.kind = kind;
    status.textContent = message;
  }

  hide() {
    this.element.classList.add('hidden');
  }

  // The kind of the message on screen ('' while hidden).
  get visibleKind() {
    return this.element.classList.contains('hidden') ? '' : this.element.dataset.kind;
  }
}
