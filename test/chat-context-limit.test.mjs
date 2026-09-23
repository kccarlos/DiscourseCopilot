import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORUM_CONTEXT_LIMIT,
  formatForumContextLimit,
  normalizeForumContextLimit
} from '../src/shared/chat-context-limit.mjs';

test('normalizes forum context limits to the supported slider range', () => {
  assert.equal(FORUM_CONTEXT_LIMIT.max, 1000000);
  assert.equal(normalizeForumContextLimit(undefined), FORUM_CONTEXT_LIMIT.default);
  assert.equal(normalizeForumContextLimit('45000'), 45000);
  assert.equal(normalizeForumContextLimit(27499), 25000);
  assert.equal(normalizeForumContextLimit(27500), 30000);
  assert.equal(normalizeForumContextLimit(-1), FORUM_CONTEXT_LIMIT.min);
  assert.equal(normalizeForumContextLimit(999999), FORUM_CONTEXT_LIMIT.max);
});

test('formats the normalized forum context limit for the popup', () => {
  assert.equal(formatForumContextLimit(45000), '45,000 characters');
  assert.equal(formatForumContextLimit(1000000), '1,000,000 characters');
});
