import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscourseCopilotConstants } from '../src/shared/constants.js';
import {
  buildModelChoices,
  isLatestRequest,
  normalizeProviderSettings,
  validateProviderSettings
} from '../src/settings/settings-helpers.mjs';

const configs = DiscourseCopilotConstants.PROVIDER_CONFIGS;

test('normalizes hosted and local provider form values', () => {
  assert.deepEqual(
    normalizeProviderSettings('openai', { apiKey: '  secret  ', model: ' gpt-test ' }),
    { apiKey: 'secret', model: 'gpt-test' }
  );
  assert.deepEqual(
    normalizeProviderSettings('ollama', {
      url: ' http://localhost:11434/// ',
      model: ' llama3.2 '
    }),
    { url: 'http://localhost:11434', model: 'llama3.2' }
  );
});

test('requires an API key and model for hosted providers', () => {
  const result = validateProviderSettings(
    'anthropic',
    { apiKey: ' ', model: ' ' },
    configs
  );

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, [
    'Anthropic API key is required.',
    'Anthropic model is required.'
  ]);
});

test('requires a valid HTTP server URL and model for local providers', () => {
  const invalidProtocol = validateProviderSettings(
    'ollama',
    { url: 'file:///tmp/ollama', model: 'llama3.2' },
    configs
  );
  const malformed = validateProviderSettings(
    'lmstudio',
    { url: 'not a URL', model: '' },
    configs
  );

  assert.deepEqual(invalidProtocol.errors, [
    'Ollama (Local) server URL must use http or https.'
  ]);
  assert.deepEqual(malformed.errors, [
    'LM Studio (Local) server URL is not valid.',
    'LM Studio (Local) model is required.'
  ]);
});

test('accepts every configured provider with complete values', () => {
  for (const provider of Object.keys(configs)) {
    const values = ['ollama', 'lmstudio'].includes(provider)
      ? { url: 'http://localhost:1234/', model: 'custom-model' }
      : { apiKey: 'test-key', model: 'custom-model' };
    const result = validateProviderSettings(provider, values, configs);

    assert.equal(result.valid, true, `${provider}: ${result.errors.join(' ')}`);
    assert.equal(result.settings.model, 'custom-model');
  }
});

test('rejects an unknown provider', () => {
  const result = validateProviderSettings(
    'missing',
    { apiKey: 'key', model: 'model' },
    configs
  );

  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['Choose a supported AI provider.']);
});

test('preserves a saved custom model when model discovery fails or omits it', () => {
  const choices = buildModelChoices(
    [
      { id: 'known-model', name: 'Known Model' },
      { id: 'known-model', name: 'Duplicate' },
      { id: '', name: 'Invalid' }
    ],
    'private/custom-model'
  );
  const failureChoices = buildModelChoices([], 'private/custom-model');

  assert.deepEqual(
    choices.map(({ id, name }) => ({ id, name })),
    [
      { id: 'private/custom-model', name: 'private/custom-model (saved/custom)' },
      { id: 'known-model', name: 'Known Model' }
    ]
  );
  assert.deepEqual(failureChoices, [
    {
      id: 'private/custom-model',
      name: 'private/custom-model (saved/custom)'
    }
  ]);
});

test('identifies stale model-loading responses', () => {
  const requestIds = { openai: 4, anthropic: 2 };

  assert.equal(isLatestRequest(requestIds, 'openai', 4), true);
  assert.equal(isLatestRequest(requestIds, 'openai', 3), false);
  assert.equal(isLatestRequest(requestIds, 'anthropic', 4), false);
});
