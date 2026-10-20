// The "show the DiscourseCopilot button on forum pages" preference, kept out
// of preferences.mjs so the content script (injected into every allowed forum
// page) doesn't bundle the interface strings that module imports.

export const DEFAULT_SHOW_FORUM_BUTTON = true;

/** Stored (or missing) preferences → whether to show the in-page button. */
export function readShowForumButton(value) {
  const stored = value && typeof value === 'object' && !Array.isArray(value) ? value.showForumButton : undefined;
  return typeof stored === 'boolean' ? stored : DEFAULT_SHOW_FORUM_BUTTON;
}
