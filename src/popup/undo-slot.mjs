// The one action that can still be undone (pure; timers are injected).
// Deletes in the side panel remove the record at once and offer Undo for
// UNDO_WINDOW_MS with a copy that restore() puts back. A new offer ends the
// previous one (its copy is dropped), and the window can be paused while
// the viewer is on the Undo control.
//
//   offer() ──▶ pending ──undo()──▶ restored (undo callback runs once)
//                  │  ▲
//          pause() │  │ resume()
//                  ▼  │
//                paused
//                  │
//   window ends, or another offer() ──▶ expired (expire callback runs once)

export const UNDO_WINDOW_MS = 8000;

export class UndoSlot {
  /**
   * @param {object} [options]
   * @param {number} [options.windowMs]
   * @param {(entry: object|null) => void} [options.onChange] the pending entry changed
   * @param {Function} [options.setTimer] setTimeout-compatible
   * @param {Function} [options.clearTimer] clearTimeout-compatible
   * @param {() => number} [options.now]
   */
  constructor({
    windowMs = UNDO_WINDOW_MS,
    onChange = () => {},
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = timer => clearTimeout(timer),
    now = () => Date.now()
  } = {}) {
    this.windowMs = windowMs;
    this.onChange = onChange;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.now = now;
    this.entry = null;
    this.timer = null;
    this.deadline = 0;
    this.remaining = 0;
    this.sequence = 0;
  }

  // { id, message } of the pending action, or null.
  get pending() {
    return this.entry ? { id: this.entry.id, message: this.entry.message } : null;
  }

  get paused() {
    return Boolean(this.entry) && this.timer === null;
  }

  /**
   * @param {object} action
   * @param {string} action.message what happened ("Deleted …")
   * @param {() => (void|Promise<void>)} action.undo puts the item back
   * @param {() => void} [action.expire] the window ended without Undo
   * @returns {number} the entry ID
   */
  offer({ message, undo, expire = () => {} }) {
    this.finish();
    this.entry = { id: ++this.sequence, message, undo, expire };
    this.start(this.windowMs);
    this.onChange(this.pending);
    return this.entry.id;
  }

  // Runs the pending undo (only the entry `id`, when given). Resolves to
  // whether anything was undone.
  async undo(id = this.entry?.id) {
    const entry = this.entry;
    if (!entry || entry.id !== id) {
      return false;
    }
    this.stop();
    this.entry = null;
    this.onChange(null);
    await entry.undo();
    return true;
  }

  pause() {
    if (!this.entry || this.timer === null) {
      return;
    }
    this.remaining = Math.max(0, this.deadline - this.now());
    this.stop();
  }

  resume() {
    if (!this.entry || this.timer !== null) {
      return;
    }
    this.start(this.remaining);
  }

  // Ends the pending entry now, as if its window had run out.
  finish() {
    const entry = this.entry;
    if (!entry) {
      return;
    }
    this.stop();
    this.entry = null;
    entry.expire();
    this.onChange(null);
  }

  start(delay) {
    this.deadline = this.now() + delay;
    this.remaining = delay;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.finish();
    }, delay);
  }

  stop() {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
