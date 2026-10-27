import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WHATS_NEW_KEY,
  WHATS_NEW_NOTE,
  dismissWhatsNew,
  normalizeWhatsNew,
  readWhatsNew,
  recordInstallEvent,
  shouldShowWhatsNew
} from '../src/shared/whats-new.mjs';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    writes: 0,
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(values) {
      this.writes++;
      Object.assign(data, values);
    }
  };
}

test('normalizes missing and malformed state', () => {
  assert.deepEqual(normalizeWhatsNew(undefined), { pending: '', seen: '' });
  assert.deepEqual(normalizeWhatsNew({ pending: 3, seen: null }), { pending: '', seen: '' });
});

test('an update from a version without the key shows the note until it is closed', async () => {
  const storage = memoryStorage();
  await recordInstallEvent(storage, 'update');
  assert.equal(shouldShowWhatsNew(await readWhatsNew(storage)), true);
  await dismissWhatsNew(storage);
  assert.deepEqual(storage.data[WHATS_NEW_KEY], { pending: '', seen: WHATS_NEW_NOTE });
  assert.equal(shouldShowWhatsNew(storage.data[WHATS_NEW_KEY]), false);
  // Later updates (or a reload in developer mode) with the same note stay quiet.
  await recordInstallEvent(storage, 'update');
  assert.equal(shouldShowWhatsNew(await readWhatsNew(storage)), false);
});

test('a fresh install does not show the current note', async () => {
  const storage = memoryStorage();
  await recordInstallEvent(storage, 'install');
  assert.equal(shouldShowWhatsNew(await readWhatsNew(storage)), false);
  await recordInstallEvent(storage, 'update');
  assert.equal(shouldShowWhatsNew(await readWhatsNew(storage)), false);
});

test('a newer note shows again after an update', async () => {
  const storage = memoryStorage({ [WHATS_NEW_KEY]: { pending: '', seen: 'older-note' } });
  await recordInstallEvent(storage, 'update');
  assert.equal(shouldShowWhatsNew(await readWhatsNew(storage)), true);
  assert.equal(shouldShowWhatsNew(await readWhatsNew(storage), 'another-note'), false);
});

test('other install reasons change nothing', async () => {
  const storage = memoryStorage();
  await recordInstallEvent(storage, 'chrome_update');
  await recordInstallEvent(storage, 'shared_module_update');
  assert.equal(storage.writes, 0);
});
