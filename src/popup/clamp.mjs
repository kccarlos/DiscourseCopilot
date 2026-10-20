// Long rendered content (a summary, an earlier answer) is cut off with a soft
// fade and a "Show all" / "Show less" button, so the reading view stays short.
// The element keeps its own content (renderMarkdown replaces its children at
// will); the button is a sibling placed right after it.
import { t } from '../shared/i18n.mjs';
import { createIcon } from './icons.mjs';

// Summary: clamp to this share of the viewport once it is longer.
export const SUMMARY_CLAMP_VIEWPORT_SHARE = 0.6;
// Earlier answers and chat replies: clamp to this height once longer than it
// by SLACK (a clamp that hides two lines is just noise).
export const ANSWER_CLAMP_PX = 180;
export const CLAMP_SLACK_PX = 64;

const states = new WeakMap();
let uid = 0;

function limitOf(state) {
  return Math.round(typeof state.limit === 'function' ? state.limit() : state.limit);
}

function createToggle(element, state) {
  if (!element.id) {
    element.id = `clamp-content-${++uid}`;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'clamp-toggle';
  button.setAttribute('aria-controls', element.id);
  const label = document.createElement('span');
  label.className = 'clamp-toggle-label';
  button.append(label, createIcon('chevron'));
  button.addEventListener('click', () => {
    setExpanded(element, !state.expanded);
  });
  return button;
}

function renderToggle(state) {
  state.toggle.setAttribute('aria-expanded', String(state.expanded));
  state.toggle.querySelector('.clamp-toggle-label').textContent = t(state.expanded ? 'clamp.showLess' : 'clamp.showAll');
}

// Measures and applies the clamp. A closed <details> has no height, so this
// also runs from a ResizeObserver when the content becomes visible or changes.
function evaluate(element) {
  const state = states.get(element);
  if (!state) {
    return;
  }
  const limit = limitOf(state);
  const tooLong = state.enabled && element.scrollHeight > limit + CLAMP_SLACK_PX;
  element.classList.toggle('is-clamped', tooLong && !state.expanded);
  element.classList.toggle('is-clamp-expanded', tooLong && state.expanded);
  element.style.setProperty('--clamp-height', `${limit}px`);
  if (tooLong) {
    if (!state.toggle.isConnected) {
      element.after(state.toggle);
    }
    renderToggle(state);
  } else {
    state.toggle.remove();
  }
}

/**
 * Keeps `element` clamped while it is longer than its limit.
 * @param {HTMLElement} element
 * @param {object} options
 * @param {boolean} options.enabled false while the content streams in, or for
 *   the newest answer, which is always shown in full
 * @param {number|(() => number)} options.limit clamped height in pixels
 * @param {boolean} [options.expanded] initial "Show all" state (the element remembers it after that)
 * @param {(expanded: boolean) => void} [options.onToggle]
 */
export function setClamp(element, { enabled, limit, expanded, onToggle }) {
  listen();
  let state = states.get(element);
  if (!state) {
    state = { expanded: Boolean(expanded), toggle: null, observer: null };
    state.toggle = createToggle(element, state);
    states.set(element, state);
    element.dataset.clamp = 'true';
    if (typeof ResizeObserver === 'function') {
      state.observer = new ResizeObserver(() => evaluate(element));
      state.observer.observe(element);
    }
  }
  state.enabled = enabled;
  state.limit = limit;
  state.onToggle = onToggle;
  evaluate(element);
}

/** Re-measures every clamped element under `root` (after it was opened or the window resized). */
export function refreshClamps(root = document) {
  for (const element of root.querySelectorAll('[data-clamp]')) {
    evaluate(element);
  }
}

export function setExpanded(element, expanded) {
  const state = states.get(element);
  if (!state || state.expanded === expanded) {
    return;
  }
  state.expanded = expanded;
  evaluate(element);
  state.onToggle?.(expanded);
}

/** The collapsed clamped block containing `node`, if any. */
export function collapsedClampOf(node) {
  return node?.closest?.('.is-clamped') || null;
}

/** Expands the clamped block around `node` (a citation or a link that took focus). */
export function expandClampAround(node) {
  const element = collapsedClampOf(node);
  if (element) {
    setExpanded(element, true);
  }
  return Boolean(element);
}

/** Drops the clamp and its button (the content is streaming, or was replaced). */
export function clearClamp(element) {
  if (states.has(element)) {
    setClamp(element, { enabled: false, limit: 0 });
  }
}

let listening = false;

// Installed with the first clamp (the module is also imported where there is no document).
function listen() {
  if (listening) {
    return;
  }
  listening = true;
  // Keyboard users reaching a link under the fade expand the block first.
  document.addEventListener('focusin', event => {
    const element = collapsedClampOf(event.target);
    if (element && element !== event.target && !event.target.classList?.contains('clamp-toggle')) {
      setExpanded(element, true);
    }
  });
  window.addEventListener('resize', () => refreshClamps());
}
