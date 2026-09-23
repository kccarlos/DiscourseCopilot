import test from 'node:test';
import assert from 'node:assert/strict';

import {
  abortableDelay,
  calculateRateLimitDelay,
  fetchWithRateLimitRetry,
  formatRetryDelay,
  parseRetryAfter
} from '../src/shared/rate-limit-retry.mjs';

function response(status, retryAfter = null) {
  return {
    status,
    headers: {
      get(name) {
        return name === 'Retry-After' ? retryAfter : null;
      }
    }
  };
}

test('parses Retry-After seconds and HTTP dates', () => {
  const now = Date.parse('2026-07-30T20:00:00Z');
  assert.equal(parseRetryAfter('2.5', now), 2500);
  assert.equal(
    parseRetryAfter('Thu, 30 Jul 2026 20:00:08 GMT', now),
    8000
  );
  assert.equal(parseRetryAfter('later', now), null);
});

test('uses bounded exponential backoff without Retry-After', () => {
  assert.equal(calculateRateLimitDelay({ retryAttempt: 1 }), 2000);
  assert.equal(calculateRateLimitDelay({ retryAttempt: 3 }), 8000);
  assert.equal(calculateRateLimitDelay({ retryAttempt: 10 }), 60000);
});

test('formats retry countdowns for the progress UI', () => {
  assert.equal(formatRetryDelay(2500), '3s');
  assert.equal(formatRetryDelay(65000), '1m 05s');
});

test('retries HTTP 429 using Retry-After before returning success', async () => {
  const responses = [response(429, '3'), response(200)];
  const waits = [];
  const retries = [];

  const result = await fetchWithRateLimitRetry('https://example.test', {}, {
    fetchImpl: async () => responses.shift(),
    wait: async milliseconds => waits.push(milliseconds),
    onRetry: event => retries.push(event)
  });

  assert.equal(result.status, 200);
  assert.deepEqual(waits, [3000]);
  assert.deepEqual(retries, [{
    retryAttempt: 1,
    maxRetries: 6,
    delayMs: 3000,
    status: 429
  }]);
});

test('returns the final 429 after the retry budget is exhausted', async () => {
  let requests = 0;
  const result = await fetchWithRateLimitRetry('https://example.test', {}, {
    fetchImpl: async () => {
      requests++;
      return response(429);
    },
    maxRetries: 2,
    wait: async () => {}
  });

  assert.equal(result.status, 429);
  assert.equal(requests, 3);
});

test('rate-limit waits remain cancellable', async () => {
  const controller = new AbortController();
  const waiting = abortableDelay(60000, controller.signal);
  controller.abort();
  await assert.rejects(waiting, error => error.name === 'AbortError');
});
