import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { AIService } from '../src/services/ai-service.js';
import { FULL_PROMPTS, MINIMAL_PROMPTS } from '../src/services/prompts.js';

test('minimal prompt selection is call-local and does not mutate the service', () => {
  const service = new AIService();

  assert.equal(service.getPrompt('system', true), MINIMAL_PROMPTS.system);
  assert.equal(service.getPrompt('system'), FULL_PROMPTS.system);
  assert.equal(Object.hasOwn(service, 'useMinimalPrompts'), false);
});

test('already-aborted summaries stop before provider setup', async () => {
  const service = new AIService();
  const controller = new AbortController();
  const reason = new Error('Navigated to a different post');
  reason.name = 'AbortError';
  controller.abort(reason);

  await assert.rejects(
    service.generateSummary(
      'unsupported-provider',
      'Valid post content',
      {},
      { abortSignal: controller.signal }
    ),
    error => error === reason
  );
});

test('already-aborted follow-ups stop before context or provider setup', async () => {
  const service = new AIService();
  const controller = new AbortController();
  controller.abort('Post changed');

  await assert.rejects(
    service.streamFollowUp(
      'unsupported-provider',
      {},
      {},
      { abortSignal: controller.signal }
    ),
    error => error.name === 'AbortError' && error.message === 'Post changed'
  );
});

test('every AI SDK text request receives the operation abort signal', async () => {
  const servicesDir = new URL('../src/services/', import.meta.url);
  const files = (await readdir(servicesDir)).filter(name => /\.m?js$/.test(name));
  const sources = await Promise.all(files.map(name => readFile(new URL(name, servicesDir), 'utf8')));
  const calls = sources.flatMap(source => [
    ...source.matchAll(/\b(?:generateText|streamText)\(\{([\s\S]*?)\n\s*\}\);/g)
  ]);

  // Single pass (stream + text), each retry request, final assembly
  // (stream + text), and the shared chat/Agent answer stream.
  assert.ok(calls.length >= 6, `expected to inspect every AI SDK request path (found ${calls.length})`);
  for (const [index, call] of calls.entries()) {
    assert.match(
      call[1],
      /\babortSignal\b/,
      `AI SDK request ${index + 1} must receive abortSignal`
    );
  }
});
