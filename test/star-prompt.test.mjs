import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STAR_PROMPT_KEY,
  dismissStarPrompt,
  markStarPromptShown,
  normalizeStarPrompt,
  readStarPrompt,
  recordSummaryCompleted,
  shouldShowStarPrompt
} from '../src/shared/star-prompt.mjs';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(values) {
      Object.assign(data, values);
    }
  };
}

test('normalizes missing and malformed state', () => {
  assert.deepEqual(normalizeStarPrompt(undefined), { summaries: 0, shownAt: 0, dismissedAt: 0 });
  assert.deepEqual(normalizeStarPrompt({ summaries: 'x', shownAt: -1, dismissedAt: 2.7 }), { summaries: 0, shownAt: 0, dismissedAt: 2 });
});

test('shows after the fifth summary, until it has been shown or dismissed', async () => {
  const storage = memoryStorage();
  for (let i = 0; i < 4; i++) await recordSummaryCompleted(storage);
  assert.equal(shouldShowStarPrompt(await readStarPrompt(storage)), false);
  await recordSummaryCompleted(storage);
  assert.equal(shouldShowStarPrompt(storage.data[STAR_PROMPT_KEY]), true);
  await markStarPromptShown(storage, 1000);
  assert.equal(shouldShowStarPrompt(storage.data[STAR_PROMPT_KEY]), false);
  assert.equal(shouldShowStarPrompt({ summaries: 9, dismissedAt: 5 }), false);
});

test('counting stops at the threshold and timestamps are kept once set', async () => {
  const storage = memoryStorage({ [STAR_PROMPT_KEY]: { summaries: 5 } });
  await recordSummaryCompleted(storage);
  assert.equal(storage.data[STAR_PROMPT_KEY].summaries, 5);
  await markStarPromptShown(storage, 10);
  await markStarPromptShown(storage, 20);
  await dismissStarPrompt(storage, 30);
  await dismissStarPrompt(storage, 40);
  assert.deepEqual(storage.data[STAR_PROMPT_KEY], { summaries: 5, shownAt: 10, dismissedAt: 30 });
});
