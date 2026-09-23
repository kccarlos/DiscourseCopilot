import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isDatabaseCompatibilityError,
  isMissingRuntimeResponse,
  isRuntimeDisconnectedError
} from '../src/popup/runtime-state.mjs';

test('detects an absent background response without rejecting valid failures', () => {
  assert.equal(isMissingRuntimeResponse(undefined), true);
  assert.equal(isMissingRuntimeResponse(null), true);
  assert.equal(isMissingRuntimeResponse({ success: false }), false);
});

test('recognizes Chrome message-channel disconnect errors', () => {
  assert.equal(
    isRuntimeDisconnectedError(new Error('Could not establish connection. Receiving end does not exist.')),
    true
  );
  assert.equal(
    isRuntimeDisconnectedError(new Error('A listener indicated an asynchronous response, but the message channel closed.')),
    true
  );
  assert.equal(isRuntimeDisconnectedError(new Error('IndexedDB is unavailable')), false);
});

test('recognizes stale extension and blocked database errors', () => {
  assert.equal(
    isDatabaseCompatibilityError(
      new Error('The requested version (2) is less than the existing version (3).')
    ),
    true
  );
  assert.equal(
    isDatabaseCompatibilityError(new Error('Summary history database upgrade is blocked')),
    true
  );
  assert.equal(isDatabaseCompatibilityError(new Error('IndexedDB is unavailable')), false);
});
