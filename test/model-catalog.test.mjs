import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscourseCopilotConstants } from '../src/shared/constants.js';
import {
  MODEL_LIST_TIMEOUT_MS,
  ModelCatalog,
  ModelListError,
  buildModelListRequest,
  findOfferedModel,
  isChatModelId,
  isModelOffered,
  normalizeModelList,
  orderModelChoices,
  pickDefaultModel
} from '../src/shared/model-catalog.mjs';
import { ConfigStore, readConfig } from '../src/shared/config-state.mjs';
import * as catalogModule from '../src/shared/model-catalog.mjs';

const { PROVIDER_CONFIGS: configs } = DiscourseCopilotConstants;

// ---------- Fixtures: trimmed-down answers of each provider's list endpoint ----------

const FIXTURES = {
  openrouter: {
    data: [
      { id: 'openai/gpt-6-luna', name: 'OpenAI: GPT-6 Luna', created: 1790100786, architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] } },
      { id: 'google/gemini-3.1-flash-image', name: 'Nano Banana 2', created: 1788000000, architecture: { input_modalities: ['text', 'image'], output_modalities: ['image', 'text'] } },
      { id: 'black-forest-labs/flux-3', created: 1789000000, architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
      { id: 'openai/text-embedding-4', created: 1787000000, architecture: { input_modalities: ['text'], output_modalities: ['embeddings'] } },
      { id: 'deepseek/deepseek-v4.1-flash', created: 1789021285, architecture: { input_modalities: ['text'], output_modalities: ['text'] } }
    ]
  },
  openai: {
    object: 'list',
    data: [
      { id: 'gpt-4o-mini', object: 'model', created: 1721172741, owned_by: 'system' },
      { id: 'gpt-6-luna', object: 'model', created: 1790100786, owned_by: 'system' },
      { id: 'text-embedding-3-small', object: 'model', created: 1705948997 },
      { id: 'gpt-realtime-mini', object: 'model', created: 1759000000 },
      { id: 'gpt-image-2', object: 'model', created: 1760000000 },
      { id: 'whisper-1', object: 'model', created: 1677532384 },
      { id: 'tts-1-hd', object: 'model', created: 1699046015 },
      { id: 'o4-mini', object: 'model', created: 1744000000 },
      { id: 'dall-e-3', object: 'model', created: 1698785189 },
      { id: 'gpt-3.5-turbo-instruct', object: 'model', created: 1692901427 },
      { id: 'omni-moderation-latest', object: 'model', created: 1731689265 }
    ]
  },
  anthropic: {
    data: [
      { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-09-22T00:00:00Z' },
      { type: 'model', id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', created_at: '2026-06-30T00:00:00Z' },
      { type: 'model', id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5', created_at: '2025-10-15T00:00:00Z' }
    ],
    has_more: false
  },
  groq: {
    object: 'list',
    data: [
      { id: 'openai/gpt-oss-120b', object: 'model', created: 1754408224, active: true },
      { id: 'openai/gpt-oss-20b', object: 'model', created: 1754407957, active: true },
      { id: 'whisper-large-v3-turbo', object: 'model', created: 1728413088, active: true },
      { id: 'meta-llama/llama-guard-4-12b', object: 'model', created: 1746743847, active: true },
      { id: 'llama-3.1-8b-instant', object: 'model', created: 1693721698, active: false }
    ]
  },
  gemini: {
    models: [
      { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
      { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.8-live', supportedGenerationMethods: ['bidiGenerateContent'] },
      { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] }
    ]
  },
  ollama: {
    models: [
      { name: 'qwen3:8b', model: 'qwen3:8b', modified_at: '2026-09-01T10:00:00Z' },
      { name: 'nomic-embed-text:latest', model: 'nomic-embed-text:latest', modified_at: '2026-09-02T10:00:00Z' },
      { name: 'llama3.2:latest', model: 'llama3.2:latest', modified_at: '2026-08-01T10:00:00Z' }
    ]
  },
  xai: {
    data: [
      { id: 'grok-4.7', object: 'model', created: 1790000000 },
      { id: 'grok-4.3', object: 'model', created: 1777000000 },
      { id: 'grok-imagine-image', object: 'model', created: 1780000000 }
    ]
  },
  deepseek: { object: 'list', data: [{ id: 'deepseek-flash', object: 'model' }, { id: 'deepseek-v4-pro', object: 'model' }] },
  lmstudio: {
    object: 'list',
    data: [
      { id: 'qwen3-8b', object: 'model' },
      { id: 'text-embedding-nomic-embed-text-v1.5', object: 'model' }
    ]
  }
};

const ids = models => models.map(model => model.id);

// ---------- Normalization ----------

test('normalizeModelList keeps chat models only, newest first where dated', () => {
  assert.deepEqual(ids(normalizeModelList('openrouter', FIXTURES.openrouter)), ['openai/gpt-6-luna', 'deepseek/deepseek-v4.1-flash']);
  assert.deepEqual(ids(normalizeModelList('openai', FIXTURES.openai)), ['gpt-6-luna', 'o4-mini', 'gpt-4o-mini']);
  assert.deepEqual(ids(normalizeModelList('anthropic', FIXTURES.anthropic)), ['claude-opus-5-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']);
  assert.deepEqual(normalizeModelList('anthropic', FIXTURES.anthropic)[0].name, 'Claude Opus 5.5');
  assert.deepEqual(ids(normalizeModelList('groq', FIXTURES.groq)), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
  assert.deepEqual(ids(normalizeModelList('gemini', FIXTURES.gemini)), ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  assert.deepEqual(ids(normalizeModelList('ollama', FIXTURES.ollama)), ['qwen3:8b', 'llama3.2:latest']);
  assert.deepEqual(ids(normalizeModelList('xai', FIXTURES.xai)), ['grok-4.7', 'grok-4.3']);
  assert.deepEqual(ids(normalizeModelList('deepseek', FIXTURES.deepseek)), ['deepseek-flash', 'deepseek-v4-pro']);
  assert.deepEqual(ids(normalizeModelList('lmstudio', FIXTURES.lmstudio)), ['qwen3-8b']);
});

test('normalizeModelList tolerates malformed answers and duplicates', () => {
  for (const provider of Object.keys(configs)) {
    assert.deepEqual(normalizeModelList(provider, null), []);
    assert.deepEqual(normalizeModelList(provider, { data: 'x', models: 7 }), []);
  }
  assert.deepEqual(ids(normalizeModelList('deepseek', { data: [{ id: ' a ' }, { id: 'a' }, {}, { id: 3 }] })), ['a']);
});

test('isChatModelId rejects speech, image, embedding and moderation models', () => {
  for (const id of ['gpt-6-luna', 'gemini-3.5-flash-lite', 'claude-haiku-4-5', 'llama3.2:latest', 'olive-7b', 'imagination-2']) {
    assert.equal(isChatModelId(id), true, id);
  }
  for (const id of ['', 'text-embedding-3-small', 'nomic-embed-text', 'gpt-4o-mini-tts', 'whisper-1', 'gpt-image-2',
    'gpt-realtime', 'gemini-3.8-live', 'llama-guard-4-12b', 'omni-moderation-latest', 'dall-e-3', 'sora-2']) {
    assert.equal(isChatModelId(id), false, id);
  }
});

// ---------- Requests ----------

test('buildModelListRequest: one list endpoint per provider, keys only in headers', () => {
  const key = 'sk-SECRET';
  const request = provider => buildModelListRequest(provider, { apiKey: key }, configs);
  assert.equal(request('openrouter').url, 'https://openrouter.ai/api/v1/models');
  assert.equal(request('openai').url, 'https://api.openai.com/v1/models');
  assert.equal(request('openai').headers.Authorization, `Bearer ${key}`);
  assert.equal(request('groq').url, 'https://api.groq.com/openai/v1/models');
  assert.equal(request('xai').url, 'https://api.x.ai/v1/models');
  assert.equal(request('deepseek').url, 'https://api.deepseek.com/v1/models');
  assert.equal(request('anthropic').url, 'https://api.anthropic.com/v1/models?limit=1000');
  assert.equal(request('anthropic').headers['x-api-key'], key);
  assert.equal(request('anthropic').headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(request('gemini').url, 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
  assert.equal(request('gemini').headers['x-goog-api-key'], key);
  for (const provider of ['openrouter', 'openai', 'anthropic', 'groq', 'gemini', 'xai', 'deepseek']) {
    assert.equal(request(provider).url.includes(key), false, provider);
  }
  assert.deepEqual(buildModelListRequest('openrouter', {}, configs).headers, {});
  assert.equal(buildModelListRequest('ollama', { url: 'http://box:11434/' }, configs).url, 'http://box:11434/api/tags');
  assert.equal(buildModelListRequest('ollama', {}, configs).url, 'http://localhost:11434/api/tags');
  assert.equal(buildModelListRequest('lmstudio', { url: 'http://localhost:1234' }, configs).url, 'http://localhost:1234/v1/models');
  assert.throws(() => buildModelListRequest('nope', {}, configs), ModelListError);
});

// ---------- Picking a default ----------

test('pickDefaultModel takes the first curated model the provider offers', () => {
  const pick = provider => pickDefaultModel(provider, normalizeModelList(provider, FIXTURES[provider]));
  assert.equal(pick('openrouter'), 'openai/gpt-6-luna');
  assert.equal(pick('openai'), 'gpt-6-luna');
  // The alias is kept although the list has only the dated snapshot.
  assert.equal(pick('anthropic'), 'claude-haiku-4-5');
  assert.equal(pick('groq'), 'openai/gpt-oss-20b');
  assert.equal(pick('gemini'), 'gemini-3.5-flash-lite');
  // Ollama: the installed tag.
  assert.equal(pick('ollama'), 'llama3.2:latest');
  assert.equal(pick('xai'), 'grok-4.3');
  assert.equal(pick('deepseek'), 'deepseek-flash');
  // Nothing curated installed: the only chat model.
  assert.equal(pick('lmstudio'), 'qwen3-8b');
});

test('pickDefaultModel falls back through the curated list, then a small/fast model, then the first', () => {
  assert.equal(pickDefaultModel('openai', ['gpt-6-sol', 'gpt-5.4-mini', 'gpt-5.6-luna']), 'gpt-5.6-luna');
  assert.equal(pickDefaultModel('anthropic', ['claude-opus-5-5', 'claude-sonnet-5']), 'claude-sonnet-5');
  // No curated model left: the first small/fast-looking one that isn't a preview.
  assert.equal(pickDefaultModel('gemini', ['gemini-9-pro', 'gemini-9-flash-preview', 'gemini-9-flash', 'gemini-9-flash-lite']), 'gemini-9-flash');
  assert.equal(pickDefaultModel('openrouter', ['~vendor/fast-latest', 'vendor/big-model', 'vendor/tiny-mini:free', 'vendor/tiny-mini']), 'vendor/tiny-mini');
  assert.equal(pickDefaultModel('xai', ['grok-9', 'grok-9-fast']), 'grok-9-fast');
  // Nothing small: the first usable one.
  assert.equal(pickDefaultModel('deepseek', ['deepseek-vision-exp', 'deepseek-v9', 'deepseek-v9-pro']), 'deepseek-v9');
  // Only unusual ids: still something from the list.
  assert.equal(pickDefaultModel('deepseek', ['deepseek-v9-preview']), 'deepseek-v9-preview');
  // Ollama tags don't count as variants.
  assert.equal(pickDefaultModel('ollama', ['mistral:7b', 'phi4-mini:latest']), 'phi4-mini:latest');
  assert.equal(pickDefaultModel('ollama', ['mistral:7b']), 'mistral:7b');
});

test('pickDefaultModel without a list returns the curated default', () => {
  for (const provider of Object.keys(configs)) {
    assert.equal(pickDefaultModel(provider, []), configs[provider].defaultModel);
    assert.equal(pickDefaultModel(provider, undefined), configs[provider].defaultModel);
  }
  assert.equal(pickDefaultModel('unknown', []), '');
  assert.equal(pickDefaultModel('x', ['b'], { x: { defaultModel: 'a' } }), 'b');
});

test('findOfferedModel matches aliases, dated snapshots and Ollama tags', () => {
  assert.equal(findOfferedModel('anthropic', 'claude-haiku-4-5', ['claude-haiku-4-5-20251001']), 'claude-haiku-4-5-20251001');
  assert.equal(findOfferedModel('anthropic', 'claude-haiku-4-5-20251001', ['claude-haiku-4-5']), 'claude-haiku-4-5');
  assert.equal(findOfferedModel('anthropic', 'claude-haiku-4', ['claude-haiku-4-5-20251001']), '');
  assert.equal(findOfferedModel('ollama', 'llama3.2', ['llama3.2:latest']), 'llama3.2:latest');
  assert.equal(findOfferedModel('ollama', 'llama3.2', ['llama3.2:1b']), 'llama3.2:1b');
  assert.equal(findOfferedModel('ollama', 'llama3.2:latest', ['llama3.2']), 'llama3.2');
  assert.equal(findOfferedModel('ollama', 'llama3.2:3b', ['llama3.2:1b']), '');
  assert.equal(findOfferedModel('ollama', 'llama3', ['llama3.2:latest']), '');
  assert.equal(findOfferedModel('openai', 'gpt-4o-mini', [{ id: 'gpt-4o-mini' }]), 'gpt-4o-mini');
  assert.equal(isModelOffered('openai', 'gpt-4o-mini', ['gpt-6-luna']), false);
  assert.equal(isModelOffered('openai', '', ['gpt-6-luna']), false);
});

test('orderModelChoices puts offered recommended models first, labelled', () => {
  const choices = orderModelChoices('anthropic', normalizeModelList('anthropic', FIXTURES.anthropic));
  assert.deepEqual(choices.map(choice => [choice.id, choice.name, choice.recommended]), [
    ['claude-haiku-4-5', 'Recommended', true],
    ['claude-sonnet-5', 'Recommended', true],
    ['claude-opus-5-5', 'Recommended', true]
  ]);
  const openai = orderModelChoices('openai', normalizeModelList('openai', FIXTURES.openai));
  assert.deepEqual(openai.map(choice => choice.id), ['gpt-6-luna', 'o4-mini', 'gpt-4o-mini']);
  assert.deepEqual(openai.map(choice => choice.recommended), [true, false, false]);
  assert.deepEqual(orderModelChoices('openai', null), []);
});

// ---------- Fetching and caching ----------

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function catalogWith(handler, options = {}) {
  const calls = [];
  let time = 1000;
  const catalog = new ModelCatalog({
    storage: null,
    now: () => time,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init, calls.length);
    },
    ...options
  });
  return { catalog, calls, advance: ms => { time += ms; } };
}

test('list() fetches, normalizes and caches per provider and key', async () => {
  const { catalog, calls, advance } = catalogWith(() => jsonResponse(FIXTURES.openai));
  const first = await catalog.list('openai', { apiKey: 'sk-a' });
  assert.deepEqual(ids(first.models), ['gpt-6-luna', 'o4-mini', 'gpt-4o-mini']);
  assert.equal(first.fromCache, false);
  assert.equal(calls[0].init.method, 'GET');
  assert.ok(calls[0].init.signal instanceof AbortSignal);

  const second = await catalog.list('openai', { apiKey: 'sk-a' });
  assert.equal(second.fromCache, true);
  assert.equal(calls.length, 1);

  // Another key is another cache entry.
  await catalog.list('openai', { apiKey: 'sk-b' });
  assert.equal(calls.length, 2);

  // force skips the cache; clear() and the TTL expire it.
  await catalog.list('openai', { apiKey: 'sk-a' }, { force: true });
  assert.equal(calls.length, 3);
  advance(1);
  catalog.clear('openai');
  advance(1);
  await catalog.list('openai', { apiKey: 'sk-a' });
  assert.equal(calls.length, 4);
  advance(10 * 60 * 1000);
  await catalog.list('openai', { apiKey: 'sk-a' });
  assert.equal(calls.length, 5);
});

test('the cache stores no API key', async () => {
  const written = [];
  const storage = {
    async get() { return {}; },
    async set(values) { written.push(values); }
  };
  const { catalog } = catalogWith(() => jsonResponse(FIXTURES.anthropic), { storage });
  await catalog.list('anthropic', { apiKey: 'sk-ant-SECRET' });
  assert.equal(written.length, 1);
  const serialized = JSON.stringify(written);
  assert.equal(serialized.includes('SECRET'), false);
  assert.match(Object.keys(written[0])[0], /^modelCatalog:anthropic:[0-9a-f]{32}$/);
});

test('concurrent list() calls share one request', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { catalog, calls } = catalogWith(async () => { await gate; return jsonResponse(FIXTURES.groq); });
  const both = Promise.all([catalog.list('groq', { apiKey: 'k' }), catalog.list('groq', { apiKey: 'k' })]);
  await new Promise(resolve => setTimeout(resolve, 0));
  release();
  const [a, b] = await both;
  assert.equal(calls.length, 1);
  assert.deepEqual(ids(a.models), ids(b.models));
});

test('failures reject with a ModelListError that names the provider, not the key', async () => {
  const unauthorized = catalogWith(() => jsonResponse({ error: { message: 'Invalid API key sk-SECRET' } }, 401));
  await assert.rejects(unauthorized.catalog.list('openai', { apiKey: 'sk-SECRET' }), error => {
    assert.ok(error instanceof ModelListError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'OpenAI returned HTTP 401.');
    return true;
  });

  const offline = catalogWith(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(offline.catalog.list('gemini', { apiKey: 'AIza-SECRET' }), error => {
    assert.equal(error.status, 0);
    assert.equal(error.message, 'Couldn\'t reach Google Gemini.');
    assert.equal(error.message.includes('SECRET'), false);
    return true;
  });

  const garbled = catalogWith(() => new Response('<html>', { status: 200 }));
  await assert.rejects(garbled.catalog.list('xai', { apiKey: 'k' }), /couldn't be read/);

  // Hosted providers need a key (OpenRouter's list is public).
  const noKey = catalogWith(() => jsonResponse(FIXTURES.openrouter));
  await assert.rejects(noKey.catalog.list('openai', { apiKey: ' ' }), /Enter a OpenAI API key/);
  assert.equal(noKey.calls.length, 0);
  assert.deepEqual(ids((await noKey.catalog.list('openrouter', {})).models), ['openai/gpt-6-luna', 'deepseek/deepseek-v4.1-flash']);

  await assert.rejects(noKey.catalog.list('nope', {}), ModelListError);

  // A failure isn't cached.
  let fail = true;
  const flaky = catalogWith(() => (fail ? jsonResponse({}, 500) : jsonResponse(FIXTURES.deepseek)));
  await assert.rejects(flaky.catalog.list('deepseek', { apiKey: 'k' }), /HTTP 500/);
  fail = false;
  assert.deepEqual(ids((await flaky.catalog.list('deepseek', { apiKey: 'k' })).models), ['deepseek-flash', 'deepseek-v4-pro']);
});

test('a slow provider times out', async () => {
  assert.equal(MODEL_LIST_TIMEOUT_MS, 8000);
  const { catalog } = catalogWith((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }), { timeoutMs: 20 });
  await assert.rejects(catalog.list('ollama', { url: 'http://localhost:11434' }), /didn't answer in time/);
});

test('the caller can abort a fetch', async () => {
  const { catalog } = catalogWith((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const controller = new AbortController();
  const pending = catalog.list('lmstudio', { url: 'http://localhost:1234' }, { signal: controller.signal });
  const reason = new Error('provider changed');
  controller.abort(reason);
  await assert.rejects(pending, error => error === reason);
});

test('without chrome.storage.session the cache lives in memory', async () => {
  const { catalog, calls } = catalogWith(() => jsonResponse(FIXTURES.deepseek), { storage: undefined });
  await catalog.list('deepseek', { apiKey: 'k' });
  await catalog.list('deepseek', { apiKey: 'k' });
  assert.equal(calls.length, 1);
});

// ---------- Saved models (never replaced automatically) ----------

test('readConfig records which providers have a saved model', () => {
  const config = readConfig({ selectedProvider: 'openai', openaiApiKey: 'k', openaiModel: 'gpt-4o-mini', anthropicModel: '' });
  assert.equal(config.savedModels.openai, true);
  assert.equal(config.savedModels.anthropic, false);
  assert.equal(config.savedModels.ollama, false);
  assert.equal(config.providers.anthropic.model, 'claude-haiku-4-5');
});

test('local writes keep unsaved models unsaved; save() marks the model saved', async () => {
  const values = { selectedProvider: 'openai', openaiApiKey: 'k', openaiModel: 'gpt-4o-mini' };
  const storageArea = {
    async get() { return { ...values }; },
    async set(entries) { Object.assign(values, entries); },
    async remove() {}
  };
  const store = new ConfigStore({ storageArea, onChanged: null, testConnection: async () => true });
  await store.load();
  await store.setFavorites([{ provider: 'openai', model: 'gpt-4o-mini' }]);
  assert.equal(store.config.savedModels.openai, true);
  assert.equal(store.config.savedModels.anthropic, false);
  store.selectProvider('anthropic');
  store.updateField('anthropic', 'apiKey', 'ak');
  store.updateField('anthropic', 'model', 'claude-sonnet-5');
  const saved = await store.save('anthropic');
  assert.equal(saved.ok, true);
  assert.equal(store.config.savedModels.anthropic, true);
  assert.equal(values.anthropicModel, 'claude-sonnet-5');
});

test('modelMissingText names the provider', () => {
  const { modelMissingText } = catalogModule;
  assert.equal(modelMissingText('openai'), 'This model is no longer offered by OpenAI. Choose another.');
  assert.equal(modelMissingText('ollama'), 'This model isn\'t available on your Ollama server. Choose another.');
});
