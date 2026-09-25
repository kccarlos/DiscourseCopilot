import assert from 'node:assert/strict';
import test from 'node:test';

import { UNDO_WINDOW_MS, UndoSlot } from '../src/popup/undo-slot.mjs';

// A manual clock: timers fire only when advance() passes their deadline.
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (callback, delay) => {
      const id = nextId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimer: id => timers.delete(id),
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    get pendingTimers() {
      return timers.size;
    }
  };
}

function slotWith(clock, changes = []) {
  return new UndoSlot({
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    now: clock.now,
    onChange: pending => changes.push(pending)
  });
}

function action(log, name) {
  return {
    message: `Deleted ${name}`,
    undo: async () => { log.push(`undo ${name}`); },
    expire: () => { log.push(`expire ${name}`); }
  };
}

test('the undo window is 8 seconds', () => {
  assert.equal(UNDO_WINDOW_MS, 8000);
});

test('undo within the window restores once and ends the offer', async () => {
  const clock = fakeClock();
  const changes = [];
  const log = [];
  const slot = slotWith(clock, changes);
  const id = slot.offer(action(log, 'A'));
  assert.deepEqual(slot.pending, { id, message: 'Deleted A' });
  clock.advance(7999);
  assert.equal(await slot.undo(), true);
  assert.equal(await slot.undo(), false, 'a second undo does nothing');
  assert.deepEqual(log, ['undo A']);
  assert.equal(slot.pending, null);
  assert.equal(clock.pendingTimers, 0);
  clock.advance(10000);
  assert.deepEqual(log, ['undo A'], 'no expiry after an undo');
  assert.deepEqual(changes, [{ id, message: 'Deleted A' }, null]);
});

test('the window ends after 8 seconds; undo afterwards is a no-op', async () => {
  const clock = fakeClock();
  const log = [];
  const slot = slotWith(clock);
  slot.offer(action(log, 'A'));
  clock.advance(8000);
  assert.deepEqual(log, ['expire A']);
  assert.equal(slot.pending, null);
  assert.equal(await slot.undo(), false);
  assert.deepEqual(log, ['expire A']);
});

test('a second delete ends the first offer; undo only restores the latest', async () => {
  const clock = fakeClock();
  const log = [];
  const slot = slotWith(clock);
  const first = slot.offer(action(log, 'A'));
  clock.advance(3000);
  const second = slot.offer(action(log, 'B'));
  assert.deepEqual(log, ['expire A']);
  assert.equal(await slot.undo(first), false, 'a stale Undo (e.g. an old button) is ignored');
  clock.advance(7000);
  assert.equal(slot.pending.id, second, 'the new offer has its own full window');
  assert.equal(await slot.undo(second), true);
  assert.deepEqual(log, ['expire A', 'undo B']);
});

test('pausing keeps the offer open; resuming continues with the time left', () => {
  const clock = fakeClock();
  const log = [];
  const slot = slotWith(clock);
  slot.offer(action(log, 'A'));
  clock.advance(5000);
  slot.pause();
  assert.equal(slot.paused, true);
  clock.advance(60000);
  assert.deepEqual(log, [], 'no expiry while paused (focus or pointer on the toast)');
  slot.resume();
  clock.advance(2999);
  assert.deepEqual(log, []);
  clock.advance(1);
  assert.deepEqual(log, ['expire A']);
});

test('a failing undo still ends the offer and reports the error', async () => {
  const clock = fakeClock();
  const slot = slotWith(clock);
  slot.offer({ message: 'Deleted A', undo: async () => { throw new Error('disk full'); } });
  await assert.rejects(slot.undo(), /disk full/);
  assert.equal(slot.pending, null);
  assert.equal(clock.pendingTimers, 0);
});
