// The one-time "enjoying it?" card in the side panel: after the user's fifth
// completed summary it asks, once, for a store rating or a GitHub star.
//
// Stored shape (chrome.storage.local "starPrompt"):
//   { summaries: number, shownAt: number, dismissedAt: number }
// `summaries` is counted by the background when a summary task completes.
// `shownAt` is set the first time a panel shows the card; after that no
// panel shows it again, so it appears in one panel session only.

export const STAR_PROMPT_KEY = 'starPrompt';
export const STAR_PROMPT_THRESHOLD = 5;

export const GITHUB_REPO_URL = 'https://github.com/kccarlos/DiscourseCopilot';
export const STORE_REVIEWS_URL = 'https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac/reviews';

/** @returns {{ summaries: number, shownAt: number, dismissedAt: number }} */
export function normalizeStarPrompt(value) {
  const count = n => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  return {
    summaries: count(value?.summaries),
    shownAt: count(value?.shownAt),
    dismissedAt: count(value?.dismissedAt)
  };
}

export function shouldShowStarPrompt(value) {
  const state = normalizeStarPrompt(value);
  return state.summaries >= STAR_PROMPT_THRESHOLD && !state.shownAt && !state.dismissedAt;
}

export async function readStarPrompt(storageArea) {
  const stored = await storageArea.get(STAR_PROMPT_KEY);
  return normalizeStarPrompt(stored?.[STAR_PROMPT_KEY]);
}

async function updateStarPrompt(storageArea, update) {
  const next = update(await readStarPrompt(storageArea));
  await storageArea.set({ [STAR_PROMPT_KEY]: next });
  return next;
}

// Counting stops at the threshold: nothing reads a higher number.
export function recordSummaryCompleted(storageArea) {
  return updateStarPrompt(storageArea, state =>
    state.summaries >= STAR_PROMPT_THRESHOLD ? state : { ...state, summaries: state.summaries + 1 }
  );
}

export function markStarPromptShown(storageArea, now = Date.now()) {
  return updateStarPrompt(storageArea, state => (state.shownAt ? state : { ...state, shownAt: now }));
}

export function dismissStarPrompt(storageArea, now = Date.now()) {
  return updateStarPrompt(storageArea, state => (state.dismissedAt ? state : { ...state, dismissedAt: now }));
}
