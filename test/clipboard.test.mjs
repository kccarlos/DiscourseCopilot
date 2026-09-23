import assert from 'node:assert/strict';
import test from 'node:test';

import {
  setPostCopyAvailability,
  writeClipboardText
} from '../src/popup/clipboard.mjs';

test('enables full-post copying when the fetched content is ready', () => {
  const button = { disabled: true };
  const fullPost = 'Fetched full post';

  const storedContent = setPostCopyAvailability(button, fullPost);

  assert.equal(button.disabled, false);
  assert.equal(storedContent, fullPost);
});

test('disables full-post copying while no fetched content is available', () => {
  const button = { disabled: false };

  const storedContent = setPostCopyAvailability(button, '');

  assert.equal(button.disabled, true);
  assert.equal(storedContent, '');
});

test('writes the complete post text without changing it', async () => {
  const fullPost = 'Original post\n\nReply with 中文 and emoji 🚀\n';
  const writes = [];
  const clipboard = {
    async writeText(text) {
      writes.push(text);
    }
  };

  await writeClipboardText(fullPost, clipboard);

  assert.deepEqual(writes, [fullPost]);
});

test('waits for the clipboard write to complete', async () => {
  let finishWrite;
  let settled = false;
  const clipboard = {
    writeText() {
      return new Promise((resolve) => {
        finishWrite = resolve;
      });
    }
  };

  const copyPromise = writeClipboardText('post', clipboard).then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);

  finishWrite();
  await copyPromise;
  assert.equal(settled, true);
});

test('reports when clipboard access is unavailable', async () => {
  await assert.rejects(
    writeClipboardText('post', null),
    /Clipboard access is unavailable/
  );
});

test('rejects non-string clipboard content', async () => {
  await assert.rejects(
    writeClipboardText(null, { writeText() {} }),
    /Clipboard text must be a string/
  );
});
