// Reading focus: the topic view has three result cards (summary, topic chat,
// Ask the forum answer). When the user starts something in one, that card
// opens and the others fold to their header line; when a running result
// finishes it takes the focus only if the user hasn't touched another card
// since starting it, so the view never jumps away from what is being read or
// typed. Anyone can still open or close any card by hand.
//
// A card counts as touched by a pointer press, a key press or typing inside
// it. Programmatic focus (the chat box regaining focus after a send, the
// panel's own focus() calls) is not an interaction.

export const FOCUS_CARD = { SUMMARY: 'summary', CHAT: 'chat', AGENT: 'agent' };

const MAX_LOG = 24;

export class ReadingFocus {
  /**
   * @param {object} deps
   * @param {() => Record<string, HTMLDetailsElement|null>} deps.cards the
   *   <details> of each card, by FOCUS_CARD value
   * @param {() => boolean} deps.isTopicViewVisible
   */
  constructor({ cards, isTopicViewVisible }) {
    this.cards = cards;
    this.isTopicViewVisible = isTopicViewVisible;
    // Sequence numbers order starts and interactions without clocks.
    this.seq = 0;
    this.pending = new Map();
    this.touches = [];
  }

  mount(root = document) {
    for (const type of ['pointerdown', 'keydown', 'input']) {
      root.addEventListener(type, event => this.touch(this.cardOf(event.target)), true);
    }
  }

  cardOf(node) {
    if (!(node instanceof Node)) {
      return null;
    }
    for (const [name, details] of Object.entries(this.cards())) {
      // The Agent card's <details> sits inside #agentPanel, which also holds its dismiss button.
      const scope = details?.closest('#agentPanel') || details;
      if (scope?.contains(node)) {
        return name;
      }
    }
    return null;
  }

  touch(card) {
    if (!card) {
      return;
    }
    this.touches.push({ seq: ++this.seq, card });
    if (this.touches.length > MAX_LOG) {
      this.touches.shift();
    }
  }

  // The user began something in `card` (sent a question, asked the forum,
  // created a summary): open it, fold the rest, bring it into view.
  start(card) {
    this.pending.set(card, ++this.seq);
    this.activate(card);
  }

  // A result for `card` is ready.
  finish(card) {
    if (!this.pending.has(card)) {
      return false;
    }
    const since = this.pending.get(card);
    this.pending.delete(card);
    if (this.touchedElsewhere(card, since)) {
      return false;
    }
    this.activate(card);
    return true;
  }

  // Whether a running `card` may still open itself (e.g. a summary that is
  // streaming in) without undoing a choice the user made since it started.
  mayExpand(card) {
    return this.pending.has(card) && !this.touchedElsewhere(card, this.pending.get(card));
  }

  touchedElsewhere(card, since) {
    if (this.touches.some(touch => touch.seq > since && touch.card !== card)) {
      return true;
    }
    // Something else holds the keyboard focus (e.g. a half-typed question).
    const active = this.cardOf(document.activeElement);
    return Boolean(active && active !== card);
  }

  // The page changed: runs started on the old page no longer matter here.
  reset() {
    this.pending.clear();
  }

  activate(card) {
    const cards = this.cards();
    const target = cards[card];
    if (!target || !this.isTopicViewVisible()) {
      return;
    }
    for (const [name, details] of Object.entries(cards)) {
      if (name !== card && details && !details.closest('.hidden')) {
        details.open = false;
      }
    }
    target.open = true;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      (target.closest('#agentPanel') || target).scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }
}
