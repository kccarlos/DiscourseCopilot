import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscourseCopilotConstants } from '../src/shared/constants.js';
import {
  PROVIDER_LINKS,
  RECOMMENDED_PROVIDERS,
  buildConnectionTest,
  classifyConnectionFailure,
  defaultLocalUrl,
  describeSavedConfiguration,
  defaultProviderSettings,
  runConnectionTest,
  setupSuccessMessage,
  samplingOptions,
  suggestSetupModels,
  validateProviderSettings
} from '../src/shared/provider-setup.mjs';

const configs = DiscourseCopilotConstants.PROVIDER_CONFIGS;

test('every provider has a key or download link and recommended providers exist', () => {
  for (const provider of Object.keys(configs)) {
    assert.match(PROVIDER_LINKS[provider]?.url || '', /^https:\/\//, provider);
  }
  for (const provider of RECOMMENDED_PROVIDERS) {
    assert.ok(configs[provider], provider);
  }
  assert.equal(PROVIDER_LINKS.ollama.kind, 'download');
  assert.equal(PROVIDER_LINKS.openrouter.kind, 'key');
});

test('validation reports errors per field for inline display', () => {
  const hosted = validateProviderSettings('openai', { apiKey: ' ', model: '' }, configs);
  assert.equal(hosted.valid, false);
  assert.deepEqual(Object.keys(hosted.fieldErrors).sort(), ['apiKey', 'model']);
  assert.equal(hosted.fieldErrors.apiKey, 'OpenAI API key is required.');

  const local = validateProviderSettings('ollama', { url: 'ftp://x', model: 'llama3.2' }, configs);
  assert.deepEqual(local.fieldErrors, { url: 'Ollama (Local) server URL must use http or https.' });

  const unknown = validateProviderSettings('nope', {}, configs);
  assert.deepEqual(unknown.fieldErrors, { provider: 'Choose a supported AI provider.' });
});

test('defaultProviderSettings gives hosted providers an empty key and local ones their URL', () => {
  assert.deepEqual(defaultProviderSettings('openrouter', configs), { apiKey: '', model: 'moonshotai/kimi-k2' });
  assert.deepEqual(defaultProviderSettings('ollama', configs), { url: 'http://localhost:11434', model: 'llama3.2' });
  assert.deepEqual(defaultProviderSettings('nope', configs), {});
  assert.equal(validateProviderSettings('openrouter', defaultProviderSettings('openrouter', configs), configs).valid, false);
  assert.equal(validateProviderSettings('ollama', defaultProviderSettings('ollama', configs), configs).valid, true);
});

test('local providers default to their server URL without the /v1 suffix', () => {
  assert.equal(defaultLocalUrl('ollama', configs), 'http://localhost:11434');
  assert.equal(defaultLocalUrl('lmstudio', configs), 'http://localhost:1234');
});

test('model suggestions start with the default and add that provider’s favorites', () => {
  const favorites = [
    { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },
    { provider: 'openai', model: 'gpt-5' },
    { provider: 'openrouter', model: 'moonshotai/kimi-k2' }
  ];
  assert.deepEqual(suggestSetupModels('openrouter', favorites, configs), [
    'moonshotai/kimi-k2',
    'anthropic/claude-sonnet-4.5'
  ]);
  assert.deepEqual(suggestSetupModels('anthropic', null, configs), [
    'claude-sonnet-5',
    'claude-haiku-4-5',
    'claude-opus-5-5'
  ]);
  assert.equal(configs.anthropic.defaultModel, 'claude-sonnet-5');
});

test('Anthropic requests leave sampling parameters to the model', () => {
  assert.deepEqual(samplingOptions({ provider: 'anthropic.messages', modelId: 'claude-sonnet-5' }, 0.7), { maxOutputTokens: 16000 });
  assert.deepEqual(samplingOptions({ provider: 'openai.chat', modelId: 'gpt-4o-mini' }, 0.7), { temperature: 0.7 });
  assert.deepEqual(samplingOptions({ provider: 'openrouter' }, 0.3), { temperature: 0.3 });
  assert.deepEqual(samplingOptions(null, 0.5), { temperature: 0.5 });
});

test('connection tests use each provider’s cheapest request shape', () => {
  const openrouter = buildConnectionTest('openrouter', { apiKey: 'k', model: 'm' }, configs, { TITLE: 'DiscourseCopilot' });
  assert.equal(openrouter.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(openrouter.options.headers.Authorization, 'Bearer k');
  assert.equal(openrouter.options.headers['X-Title'], 'DiscourseCopilot');
  assert.equal('HTTP-Referer' in openrouter.options.headers, false, 'no "undefined" referer header');

  const anthropic = buildConnectionTest('anthropic', { apiKey: 'k', model: 'claude' }, configs);
  assert.equal(anthropic.options.headers['x-api-key'], 'k');
  assert.equal(JSON.parse(anthropic.options.body).max_tokens, 1);

  const ollama = buildConnectionTest('ollama', { url: 'http://localhost:11434', model: 'llama3.2' }, configs);
  assert.deepEqual([ollama.url, ollama.options.method], ['http://localhost:11434/api/tags', 'GET']);

  const gemini = buildConnectionTest('gemini', { apiKey: 'a b', model: 'gemini-x' }, configs);
  assert.match(gemini.url, /models\/gemini-x:generateContent\?key=a%20b$/);
});

test('runConnectionTest resolves on success and reports status and body on failure', async () => {
  const calls = [];
  const ok = async (url, options) => {
    calls.push([url, options.method]);
    return { ok: true, status: 200, text: async () => '' };
  };
  assert.equal(await runConnectionTest('openai', { apiKey: 'k', model: 'm' }, configs, { fetchImpl: ok }), true);
  assert.deepEqual(calls, [['https://api.openai.com/v1/chat/completions', 'POST']]);

  const unauthorized = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"Invalid API key"}}' });
  await assert.rejects(
    runConnectionTest('openai', { apiKey: 'k', model: 'm' }, configs, { fetchImpl: unauthorized }),
    error => error.status === 401 && /Invalid API key/.test(error.body) && /^HTTP 401/.test(error.message)
  );

  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(
    runConnectionTest('ollama', { url: 'http://localhost:11434', model: 'x' }, configs, { fetchImpl: offline }),
    error => error.status === 0 && error.message === 'Failed to fetch'
  );
});

test('connection failures map to the field the user should fix', () => {
  const badKey = classifyConnectionFailure('openrouter', { status: 401, body: '{"error":{"message":"No auth credentials found"}}' }, configs);
  assert.equal(badKey.field, 'apiKey');
  assert.match(badKey.message, /didn't accept this API key.*No auth credentials found/);

  assert.equal(classifyConnectionFailure('openai', { status: 404, body: 'model not found' }, configs).field, 'model');
  assert.equal(classifyConnectionFailure('anthropic', { status: 400, body: '{"error":{"message":"model: claude-x"}}' }, configs).field, 'model');
  assert.equal(classifyConnectionFailure('openai', { status: 400, body: 'bad request' }, configs).field, null);
  assert.equal(classifyConnectionFailure('openai', { status: 402, body: '' }, configs).field, 'apiKey');
  assert.equal(classifyConnectionFailure('openai', { status: 500, body: '' }, configs).message, 'OpenAI returned an error (HTTP 500).');

  const offlineLocal = classifyConnectionFailure('ollama', { status: 0 }, configs);
  assert.equal(offlineLocal.field, 'url');
  assert.match(offlineLocal.message, /Can't reach Ollama/);
  assert.match(classifyConnectionFailure('ollama', { status: 403 }, configs).message, /OLLAMA_ORIGINS=chrome-extension:\/\/\*/);
  assert.doesNotMatch(classifyConnectionFailure('lmstudio', { status: 403 }, configs).message, /OLLAMA_ORIGINS/);
  assert.equal(classifyConnectionFailure('openai', { status: 0 }, configs).field, null);
});

test('the settings header only claims a saved configuration when it is usable', () => {
  assert.deepEqual(
    describeSavedConfiguration('openrouter', { apiKey: '', model: 'moonshotai/kimi-k2' }, configs),
    { valid: false, label: 'Status', text: 'Not set up yet — add an API key' }
  );
  assert.equal(
    describeSavedConfiguration('ollama', { url: '', model: 'llama3.2' }, configs).text,
    'Not set up yet — add a server URL'
  );
  assert.deepEqual(
    describeSavedConfiguration('openai', { apiKey: 'k', model: ' gpt-4o-mini ' }, configs),
    { valid: true, label: 'Currently saved', text: 'OpenAI · gpt-4o-mini' }
  );
});

test('setup success copy adapts to the current page', () => {
  assert.equal(setupSuccessMessage({ isForumTopic: true, isDiscourse: true }), 'You’re set — press Create summary above.');
  assert.match(setupSuccessMessage({ isDiscourse: true }), /Ask the forum above/);
  assert.equal(setupSuccessMessage(null), 'You’re set. Open a topic on any Discourse forum to get started.');
  assert.equal(setupSuccessMessage({ pageHidden: true }), 'You’re set. Next, click the DiscourseCopilot icon in your toolbar on a Discourse forum.');
  assert.equal(setupSuccessMessage({ isForumTopic: true, isDiscourse: true, forumAccess: 'missing' }), 'You’re set. Next, allow access to this forum below.');
});
