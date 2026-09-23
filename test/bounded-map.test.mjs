import assert from 'node:assert/strict';
import test from 'node:test';

import { mapWithConcurrency } from '../src/shared/bounded-map.mjs';

test('maps concurrently while retaining input order and respecting the limit', async () => {
  let active = 0;
  let peak = 0;
  const completed = [];

  const result = await mapWithConcurrency([30, 5, 15, 1], 2, async delay => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, delay));
    completed.push(delay);
    active--;
    return delay * 2;
  });

  assert.deepEqual(result, [60, 10, 30, 2]);
  assert.equal(peak, 2);
  assert.notDeepEqual(completed, [30, 5, 15, 1]);
});

test('uses one worker for invalid limits and stops scheduling after failure', async () => {
  const started = [];

  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 0, async value => {
      started.push(value);
      if (value === 2) throw new Error('stop');
      return value;
    }),
    /stop/
  );

  assert.deepEqual(started, [1, 2]);
});
