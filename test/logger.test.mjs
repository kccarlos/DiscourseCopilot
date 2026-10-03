import assert from 'node:assert/strict';
import test from 'node:test';
import { DiscourseCopilotLogger } from '../src/shared/logger.js';

function captureConsole(method, run) {
  const original = console[method];
  const calls = [];
  console[method] = (...args) => calls.push(args);
  try {
    run();
  } finally {
    console[method] = original;
  }
  return calls;
}

test('trace logs stay silent outside development builds', () => {
  assert.deepEqual(
    captureConsole('log', () => DiscourseCopilotLogger.log('AI Service: trace')),
    []
  );
});

test('warnings and errors are always printed with the prefix', () => {
  assert.deepEqual(
    captureConsole('warn', () => DiscourseCopilotLogger.warn('careful', 1)),
    [['[DiscourseCopilot WARN] careful', 1]]
  );
  assert.deepEqual(
    captureConsole('error', () => DiscourseCopilotLogger.error('broken')),
    [['[DiscourseCopilot ERROR] broken']]
  );
});
