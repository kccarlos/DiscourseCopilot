import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  const sourceUrl = new URL('../src/services/ai-service.js', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const calls = [
    ...source.matchAll(/\b(?:generateText|streamText)\(\{([\s\S]*?)\n\s*\}\);/g)
  ];

  assert.ok(calls.length >= 7, 'expected to inspect every AI SDK request path');
  for (const [index, call] of calls.entries()) {
    assert.match(
      call[1],
      /\babortSignal\b/,
      `AI SDK request ${index + 1} must receive abortSignal`
    );
  }
});
