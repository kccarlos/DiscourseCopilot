// The "What's new" card at the top of the side panel: after an update that
// brings a new note, the next panel shows it until the user closes it.
//
// Stored shape (chrome.storage.local "whatsNew"):
//   { pending: string, seen: string }
// Both hold note ids. The background sets `pending` when the extension is
// updated (onInstalled reason "update") and the current note has not been
// seen; a fresh install marks the note as seen, since the welcome tab
// already introduces everything. Closing the card marks it seen.
//
// WHATS_NEW_NOTE names the note in the locales (popup.whatsNew.*). Change it
// together with the text for the next release that should announce itself;
// leave it unchanged for releases (patches) that shouldn't.

export const WHATS_NEW_KEY = 'whatsNew';
export const WHATS_NEW_NOTE = 'sites-2026-10';

/** @returns {{ pending: string, seen: string }} */
export function normalizeWhatsNew(value) {
  const id = v => (typeof v === 'string' ? v : '');
  return { pending: id(value?.pending), seen: id(value?.seen) };
}

export function shouldShowWhatsNew(value, note = WHATS_NEW_NOTE) {
  const state = normalizeWhatsNew(value);
  return state.pending === note && state.seen !== note;
}

export async function readWhatsNew(storageArea) {
  const stored = await storageArea.get(WHATS_NEW_KEY);
  return normalizeWhatsNew(stored?.[WHATS_NEW_KEY]);
}

async function updateWhatsNew(storageArea, update) {
  const current = await readWhatsNew(storageArea);
  const next = update(current);
  if (next.pending !== current.pending || next.seen !== current.seen) {
    await storageArea.set({ [WHATS_NEW_KEY]: next });
  }
  return next;
}

// Called from runtime.onInstalled with its `reason`. Other reasons (a Chrome
// update, a shared module update) change nothing.
export function recordInstallEvent(storageArea, reason, note = WHATS_NEW_NOTE) {
  return updateWhatsNew(storageArea, state => {
    if (reason === 'install') return { pending: '', seen: note };
    if (reason === 'update' && state.seen !== note) return { ...state, pending: note };
    return state;
  });
}

export function dismissWhatsNew(storageArea, note = WHATS_NEW_NOTE) {
  return updateWhatsNew(storageArea, () => ({ pending: '', seen: note }));
}
