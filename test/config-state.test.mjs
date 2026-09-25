import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscourseCopilotConstants } from '../src/shared/constants.js';
import {
  CONFIG_STATUS,
  CONFIG_STORAGE_KEYS,
  ConfigStore,
  OPERATION_PHASE,
  RESETTABLE_STORAGE_KEYS,
  buildActiveModelWrite,
  buildConfigurationWrite,
  deriveConfigStatus,
  loadConfig,
  providerSettingsOf,
  readConfig
} from '../src/shared/config-state.mjs';
import { ConnectionTestError } from '../src/shared/provider-setup.mjs';
import { defaultPreferences } from '../src/shared/preferences.mjs';

// chrome.storage.local + chrome.storage.onChanged, firing change events the
// way Chrome does (asynchronously, only for keys that were present).
function createFakeStorage(initialValues = {}) {
  const values = { ...initialValues };
  const writes = [];
  const removals = [];
  const listeners = new Set();
  const fire = changes => {
    if (!Object.keys(changes).length) return;
    queueMicrotask(() => {
      for (const listener of listeners) listener(changes, 'local');
    });
  };
  return {
    values,
    writes,
    removals,
    listeners,
    area: {
      async get(keys) {
        const list = keys == null ? Object.keys(values) : [].concat(keys);
        return Object.fromEntries(list.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]]));
      },
      async set(update) {
        writes.push({ ...update });
        const changes = {};
        for (const [key, value] of Object.entries(update)) {
          changes[key] = { oldValue: values[key], newValue: value };
        }
        Object.assign(values, update);
        fire(changes);
      },
      async remove(keys) {
        removals.push([].concat(keys));
        const changes = {};
        for (const key of [].concat(keys)) {
          if (Object.hasOwn(values, key)) {
            changes[key] = { oldValue: values[key] };
            delete values[key];
          }
        }
        fire(changes);
      }
    },
    onChanged: {
      addListener(listener) {
        listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      }
    },
    // Simulates another extension page writing storage.
    externalSet(update) {
      Object.assign(values, update);
      fire(Object.fromEntries(Object.keys(update).map(key => [key, { newValue: update[key] }])));
    }
  };
}

function createStore(storage, options = {}) {
  return new ConfigStore({
    storageArea: storage.area,
    onChanged: storage.onChanged,
    reloadDelayMs: 0,
    onError: error => {
      throw error;
    },
    ...options
  });
}

const settle = () => new Promise(resolve => setTimeout(resolve, 5));

// ---------- readConfig ----------

test('reads defaults for a fresh install', () => {
  const config = readConfig({});
  assert.equal(config.provider, 'openrouter');
  assert.equal(config.providerChoice, '');
  assert.deepEqual(config.providers.openrouter, { apiKey: '', model: 'openai/gpt-6-luna' });
  assert.deepEqual(config.providers.ollama, { url: 'http://localhost:11434', model: 'llama3.2' });
  assert.deepEqual(config.providers.lmstudio, { url: 'http://localhost:1234', model: 'local-model' });
  assert.deepEqual(config.favorites, []);
  assert.equal(config.systemPrompt, '');
  assert.equal(config.responseLanguage, 'auto');
  assert.equal(config.forumContextLimit, 30000);
  assert.deepEqual(Object.keys(config.providers), Object.keys(DiscourseCopilotConstants.PROVIDER_CONFIGS));
});

test('reads stored provider settings over defaults and ignores empty or non-string values', () => {
  const config = readConfig({
    selectedProvider: 'openai',
    openaiApiKey: 'sk-1',
    openaiModel: '',
    anthropicModel: 42,
    ollamaUrl: 'http://box:11434'
  });
  assert.equal(config.provider, 'openai');
  assert.deepEqual(config.providers.openai, { apiKey: 'sk-1', model: 'gpt-6-luna' });
  assert.deepEqual(config.providers.anthropic, { apiKey: '', model: 'claude-haiku-4-5' });
  assert.deepEqual(config.providers.ollama, { url: 'http://box:11434', model: 'llama3.2' });
});

test('keeps the legacy OpenRouter API key as a fallback only', () => {
  assert.equal(readConfig({ apiKey: 'legacy-key' }).providers.openrouter.apiKey, 'legacy-key');
  assert.equal(readConfig({ apiKey: 'legacy-key', openrouterApiKey: 'new-key' }).providers.openrouter.apiKey, 'new-key');
  assert.equal(readConfig({ apiKey: 'legacy-key' }).providers.openai.apiKey, '');
});

test('falls back to OpenRouter for an unsupported stored provider but remembers the choice', () => {
  const config = readConfig({ selectedProvider: 'missing' });
  assert.equal(config.provider, 'openrouter');
  assert.equal(config.providerChoice, 'missing');
});

test('normalizes favorites, response language and the forum context limit', () => {
  const config = readConfig({
    favoriteModels: [
      { provider: 'openrouter', model: 'model-a' },
      { provider: 'openrouter', model: 'model-a' },
      { provider: 'unknown', model: 'model-b' }
    ],
    responseLanguage: 'xx',
    forumContextLimit: 1999999,
    systemPrompt: 'Be brief.'
  });
  assert.deepEqual(config.favorites, [{ provider: 'openrouter', model: 'model-a' }]);
  assert.equal(config.responseLanguage, 'auto');
  assert.equal(config.forumContextLimit, 1000000);
  assert.equal(config.systemPrompt, 'Be brief.');
  assert.equal(readConfig({ responseLanguage: 'zh-Hans' }).responseLanguage, 'zh-Hans');
  assert.equal(readConfig({ forumContextLimit: 45000 }).forumContextLimit, 45000);
});

test('providerSettingsOf returns a copy, or {} for an unknown provider', () => {
  const config = readConfig({ openaiApiKey: 'k' });
  const settings = providerSettingsOf(config, 'openai');
  settings.apiKey = 'changed';
  assert.equal(config.providers.openai.apiKey, 'k');
  assert.deepEqual(providerSettingsOf(config, 'missing'), {});
  assert.deepEqual(providerSettingsOf(config), config.providers.openrouter);
});

// ---------- deriveConfigStatus ----------

test('a fresh install is unconfigured', () => {
  const status = deriveConfigStatus(readConfig({}));
  assert.equal(status.status, CONFIG_STATUS.UNCONFIGURED);
  assert.equal(status.ready, false);
  assert.equal(status.provider, 'openrouter');
  assert.equal(status.providerName, 'OpenRouter');
  assert.deepEqual(Object.keys(status.fieldErrors), ['apiKey']);
});

test('a chosen provider without a key is incomplete with a field error', () => {
  const status = deriveConfigStatus(readConfig({ selectedProvider: 'anthropic' }));
  assert.equal(status.status, CONFIG_STATUS.INCOMPLETE);
  assert.equal(status.fieldErrors.apiKey, 'Anthropic API key is required.');
  assert.equal(status.model, 'claude-haiku-4-5');
});

test('a local provider with an invalid URL is incomplete on the url field', () => {
  const status = deriveConfigStatus(readConfig({ selectedProvider: 'ollama', ollamaUrl: 'ftp://box' }));
  assert.equal(status.status, CONFIG_STATUS.INCOMPLETE);
  assert.match(status.fieldErrors.url, /must use http or https/);
  const emptyUrl = deriveConfigStatus({
    ...readConfig({ selectedProvider: 'ollama' }),
    providers: { ollama: { url: '', model: 'llama3.2' } }
  });
  assert.equal(emptyUrl.status, CONFIG_STATUS.INCOMPLETE);
  assert.match(emptyUrl.fieldErrors.url, /server URL is required/);
});

test('a local provider is ready with its defaults once chosen', () => {
  const status = deriveConfigStatus(readConfig({ selectedProvider: 'lmstudio' }));
  assert.equal(status.status, CONFIG_STATUS.READY);
  assert.equal(status.model, 'local-model');
  assert.deepEqual(status.errors, []);
});

test('a legacy-only OpenRouter key is ready without an explicit provider choice', () => {
  const status = deriveConfigStatus(readConfig({ apiKey: 'legacy-key' }));
  assert.equal(status.status, CONFIG_STATUS.READY);
  assert.equal(status.provider, 'openrouter');
});

test('a hosted provider with key and model is ready', () => {
  const status = deriveConfigStatus(
    readConfig({
      selectedProvider: 'openai',
      openaiApiKey: 'sk',
      openaiModel: 'gpt-x'
    })
  );
  assert.equal(status.status, CONFIG_STATUS.READY);
  assert.equal(status.providerName, 'OpenAI');
  assert.equal(status.model, 'gpt-x');
});

// ---------- write builders ----------

test('buildConfigurationWrite writes provider, fields and prompt in one object', () => {
  assert.deepEqual(buildConfigurationWrite('openai', { apiKey: 'secret', model: 'gpt-custom' }, { systemPrompt: 'Custom prompt' }), {
    selectedProvider: 'openai',
    systemPrompt: 'Custom prompt',
    openaiApiKey: 'secret',
    openaiModel: 'gpt-custom'
  });
  assert.equal(buildConfigurationWrite('openai', { apiKey: 'k', model: 'm' }, { responseLanguage: 'ja' }).responseLanguage, 'ja');
  assert.equal(buildConfigurationWrite('openai', { apiKey: 'k', model: 'm' }, { responseLanguage: 'nope' }).responseLanguage, 'auto');
  assert.deepEqual(buildConfigurationWrite('ollama', { url: 'http://x', model: 'm' }), {
    selectedProvider: 'ollama',
    systemPrompt: '',
    ollamaUrl: 'http://x',
    ollamaModel: 'm'
  });
  assert.throws(() => buildConfigurationWrite('missing', {}), /Unsupported provider: missing/);
});

test('buildActiveModelWrite trims the model and rejects bad input', () => {
  assert.deepEqual(buildActiveModelWrite('anthropic', ' claude-favorite '), {
    selectedProvider: 'anthropic',
    anthropicModel: 'claude-favorite'
  });
  assert.throws(() => buildActiveModelWrite('anthropic', '  '), /supported provider and model/);
  assert.throws(() => buildActiveModelWrite('missing', 'm'), /supported provider and model/);
});

test('reset covers every live key and the legacy extensionSettings key', () => {
  assert.ok(RESETTABLE_STORAGE_KEYS.includes('extensionSettings'));
  assert.ok(!CONFIG_STORAGE_KEYS.includes('extensionSettings'), 'legacy key is not read as config');
  for (const key of Object.values(DiscourseCopilotConstants.STORAGE_KEYS)) {
    assert.ok(RESETTABLE_STORAGE_KEYS.includes(key), key);
  }
});

test('loadConfig reads the configuration in a single storage call', async () => {
  const storage = createFakeStorage({ selectedProvider: 'groq', groqApiKey: 'g' });
  let calls = 0;
  const area = {
    get: async keys => {
      calls += 1;
      return storage.area.get(keys);
    }
  };
  const config = await loadConfig(area);
  assert.equal(calls, 1);
  assert.equal(config.provider, 'groq');
  assert.equal(config.providers.groq.apiKey, 'g');
});

// ---------- ConfigStore: persisted state ----------

test('load() reads storage, derives status and notifies subscribers', async () => {
  const storage = createFakeStorage({ selectedProvider: 'openai', openaiApiKey: 'sk' });
  const store = createStore(storage);
  const events = [];
  store.subscribe(event => events.push(event.type));
  assert.equal(store.status.status, CONFIG_STATUS.UNCONFIGURED, 'defaults before load');
  await store.load();
  assert.equal(store.status.status, CONFIG_STATUS.READY);
  assert.equal(store.isReady(), true);
  assert.deepEqual(store.activeSettings, { apiKey: 'sk', model: 'gpt-6-luna' });
  assert.deepEqual(events, ['loaded']);
});

test('subscribers are told about external storage changes and can unsubscribe', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage);
  await store.load();
  const seen = [];
  const unsubscribe = store.subscribe((event, current) => seen.push([event.type, current.status.status]));
  assert.equal(storage.listeners.size, 1, 'watching starts with the first subscriber');

  storage.externalSet({ selectedProvider: 'openai' });
  await settle();
  storage.externalSet({ openaiApiKey: 'sk' });
  await settle();
  assert.deepEqual(seen, [
    ['loaded', 'incomplete'],
    ['loaded', 'ready']
  ]);

  unsubscribe();
  assert.equal(storage.listeners.size, 0, 'watching stops with the last subscriber');
  storage.externalSet({ openaiApiKey: '' });
  await settle();
  assert.equal(seen.length, 2);
});

test('storage changes to unrelated keys or other areas do not reload', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage);
  let loads = 0;
  store.subscribe(event => {
    if (event.type === 'loaded') loads += 1;
  });
  storage.externalSet({ somethingElse: 1 });
  for (const listener of storage.listeners) listener({ selectedProvider: {} }, 'sync');
  await settle();
  assert.equal(loads, 0);
});

test('bursts of external changes reload once after the debounce', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage, { reloadDelayMs: 20 });
  let loads = 0;
  store.subscribe(event => {
    if (event.type === 'loaded') loads += 1;
  });
  storage.externalSet({ selectedProvider: 'openai' });
  storage.externalSet({ openaiApiKey: 'a' });
  storage.externalSet({ openaiModel: 'b' });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(loads, 1);
  assert.equal(store.status.status, CONFIG_STATUS.READY);
});

test('a store without chrome.storage.onChanged still loads (background worker)', async () => {
  const storage = createFakeStorage({ selectedProvider: 'openai', openaiApiKey: 'sk' });
  const store = new ConfigStore({ storageArea: storage.area, onChanged: undefined });
  store.subscribe(() => {});
  await store.load();
  assert.equal(store.isReady(), true);
});

test('setActiveModel switches provider and model atomically and updates status', async () => {
  const storage = createFakeStorage({ selectedProvider: 'openai', openaiApiKey: 'sk', anthropicApiKey: 'ak' });
  const store = createStore(storage);
  await store.load();
  const events = [];
  store.subscribe(event => events.push(event.type));
  await store.setActiveModel('anthropic', ' claude-favorite ');
  assert.deepEqual(storage.writes.at(-1), { selectedProvider: 'anthropic', anthropicModel: 'claude-favorite' });
  assert.equal(store.config.provider, 'anthropic');
  assert.equal(store.status.model, 'claude-favorite');
  assert.equal(store.status.ready, true);
  assert.equal(events[0], 'active-model');
  await assert.rejects(store.setActiveModel('missing', 'x'), /supported provider/);
});

test('setFavorites persists a normalized list', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage);
  const favorites = await store.setFavorites([
    { provider: 'openai', model: ' gpt-favorite ' },
    { provider: 'openai', model: 'gpt-favorite' },
    { provider: 'missing', model: 'invalid' }
  ]);
  assert.deepEqual(favorites, [{ provider: 'openai', model: 'gpt-favorite' }]);
  assert.deepEqual(storage.values.favoriteModels, favorites);
  assert.deepEqual(store.config.favorites, favorites);
});

test('setForumContextLimit persists a normalized value', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage);
  assert.equal(await store.setForumContextLimit(1999999), 1000000);
  assert.equal(storage.values.forumContextLimit, 1000000);
  assert.equal(store.config.forumContextLimit, 1000000);
});

test('local writes keep unrelated persisted values', async () => {
  const storage = createFakeStorage({
    selectedProvider: 'openai',
    openaiApiKey: 'sk',
    systemPrompt: 'P',
    responseLanguage: 'ja',
    forumContextLimit: 45000
  });
  const store = createStore(storage);
  await store.load();
  await store.setFavorites([{ provider: 'openai', model: 'm' }]);
  assert.equal(store.config.systemPrompt, 'P');
  assert.equal(store.config.responseLanguage, 'ja');
  assert.equal(store.config.forumContextLimit, 45000);
  assert.equal(store.config.providerChoice, 'openai');
  assert.equal(store.activeSettings.apiKey, 'sk');
});

// ---------- ConfigStore: draft ----------

test('the draft starts from persisted settings and edits never touch storage', async () => {
  const storage = createFakeStorage({ selectedProvider: 'openai', openaiApiKey: 'sk', openaiModel: 'gpt-x' });
  const store = createStore(storage);
  await store.load();
  assert.equal(store.selectProvider('openai'), true);
  assert.deepEqual(store.draftSettings(), { apiKey: 'sk', model: 'gpt-x' });
  store.updateField('openai', 'model', 'gpt-y');
  store.updateField('openai', 'bogus', 'x');
  assert.deepEqual(store.draftSettings('openai'), { apiKey: 'sk', model: 'gpt-y' });
  assert.equal(store.config.providers.openai.model, 'gpt-x');
  assert.equal(storage.writes.length, 0);
  assert.equal(store.selectProvider('missing'), false);
  assert.equal(store.draft.provider, 'openai');
});

test('drafts are kept per provider while switching', async () => {
  const store = createStore(createFakeStorage({}));
  store.selectProvider('openai');
  store.updateField('openai', 'apiKey', 'typed');
  store.selectProvider('ollama');
  assert.deepEqual(store.draftSettings(), { url: 'http://localhost:11434', model: 'llama3.2' });
  store.selectProvider('openai');
  assert.equal(store.draftSettings().apiKey, 'typed');
  store.discardDraft();
  assert.equal(store.draftSettings('openai').apiKey, '');
});

test('validateDraft reports field errors for the draft', () => {
  const store = createStore(createFakeStorage({}));
  store.selectProvider('ollama');
  store.updateField('ollama', 'url', 'not a url');
  store.updateField('ollama', 'model', ' ');
  const validation = store.validateDraft();
  assert.equal(validation.valid, false);
  assert.deepEqual(Object.keys(validation.fieldErrors).sort(), ['model', 'url']);
});

// ---------- ConfigStore: test() ----------

test('test(): invalid draft → invalid, without a network call', async () => {
  let calls = 0;
  const store = createStore(createFakeStorage({}), {
    testConnection: async () => {
      calls += 1;
    }
  });
  store.selectProvider('openai');
  const result = await store.test();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid');
  assert.equal(store.operation.phase, OPERATION_PHASE.INVALID);
  assert.equal(calls, 0);
});

test('test(): testing → passed with normalized settings and API headers', async () => {
  const calls = [];
  const phases = [];
  const store = createStore(createFakeStorage({}), {
    apiHeaders: { TITLE: 'T' },
    testConnection: async (...args) => {
      calls.push(args);
    }
  });
  store.subscribe(event => {
    if (event.type === 'operation') phases.push(event.operation.phase);
  });
  store.selectProvider('openai');
  store.updateField('openai', 'apiKey', ' sk ');
  const result = await store.test();
  assert.equal(result.ok, true);
  assert.deepEqual(phases, ['testing', 'passed']);
  assert.equal(calls[0][0], 'openai');
  assert.deepEqual(calls[0][1], { apiKey: 'sk', model: 'gpt-6-luna' });
  assert.deepEqual(calls[0][3], { apiHeaders: { TITLE: 'T' } });
});

test('test(): testing → failed with a classified failure', async () => {
  const store = createStore(createFakeStorage({}), {
    testConnection: async () => {
      throw new ConnectionTestError('HTTP 401', { status: 401 });
    }
  });
  store.selectProvider('openai');
  store.updateField('openai', 'apiKey', 'bad');
  const result = await store.test();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'failed');
  assert.equal(result.failure.field, 'apiKey');
  assert.equal(result.error.message, 'HTTP 401');
  assert.equal(store.operation.phase, OPERATION_PHASE.FAILED);
});

test('operations refuse to start while another is running', async () => {
  let release;
  const store = createStore(createFakeStorage({}), {
    testConnection: () =>
      new Promise(resolve => {
        release = resolve;
      })
  });
  store.selectProvider('lmstudio');
  const first = store.test();
  assert.equal(store.busy, true);
  assert.deepEqual(await store.save(), { ok: false, reason: 'busy' });
  assert.deepEqual(await store.test(), { ok: false, reason: 'busy' });
  assert.deepEqual(await store.reset(), { ok: false, reason: 'busy' });
  release();
  assert.equal((await first).ok, true);
  assert.equal(store.busy, false);
});

// ---------- ConfigStore: save() ----------

test('save(): invalid draft → invalid and nothing is written', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage);
  store.selectProvider('anthropic');
  const result = await store.save();
  assert.equal(result.reason, 'invalid');
  assert.equal(result.validation.fieldErrors.apiKey, 'Anthropic API key is required.');
  assert.equal(storage.writes.length, 0);
});

test('save(): saving → saved writes atomically and the status becomes ready', async () => {
  const storage = createFakeStorage({ systemPrompt: 'Keep me', responseLanguage: 'ja' });
  const store = createStore(storage);
  await store.load();
  const phases = [];
  const events = [];
  store.subscribe(event => {
    events.push(event.type);
    if (event.type === 'operation') phases.push(event.operation.phase);
  });
  store.selectProvider('openai');
  store.updateField('openai', 'apiKey', ' secret ');
  store.updateField('openai', 'model', 'gpt-custom');
  const result = await store.save();
  assert.equal(result.ok, true);
  assert.deepEqual(phases, ['saving', 'saved']);
  assert.ok(events.includes('saved'));
  assert.equal(storage.writes.length, 1);
  assert.deepEqual(storage.writes[0], {
    selectedProvider: 'openai',
    systemPrompt: 'Keep me',
    responseLanguage: 'ja',
    openaiApiKey: 'secret',
    openaiModel: 'gpt-custom',
    // Saving also writes the (normalized) preferences, migrating installs
    // that never stored them.
    preferences: defaultPreferences()
  });
  assert.equal(store.status.status, CONFIG_STATUS.READY);
  assert.equal(store.config.providerChoice, 'openai');
  assert.deepEqual(store.draftSettings('openai'), { apiKey: 'secret', model: 'gpt-custom' });
});

test('save(): a drafted system prompt and response language are saved with the provider', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage);
  store.selectProvider('lmstudio');
  store.updateDraft({ systemPrompt: 'Answer tersely.', responseLanguage: 'zh-Hans' });
  await store.save();
  assert.equal(storage.values.systemPrompt, 'Answer tersely.');
  assert.equal(storage.values.responseLanguage, 'zh-Hans');
  assert.equal(store.config.systemPrompt, 'Answer tersely.');
});

test('save(): a storage failure → error and the persisted snapshot is unchanged', async () => {
  const storage = createFakeStorage({});
  storage.area.set = async () => {
    throw new Error('quota');
  };
  const store = createStore(storage);
  store.selectProvider('lmstudio');
  const result = await store.save();
  assert.equal(result.reason, 'error');
  assert.equal(result.error.message, 'quota');
  assert.equal(store.operation.phase, OPERATION_PHASE.ERROR);
  assert.equal(store.status.status, CONFIG_STATUS.UNCONFIGURED);
});

test('the storage echo of a save reloads the same configuration', async () => {
  const storage = createFakeStorage({});
  const store = createStore(storage);
  const statuses = [];
  store.subscribe((event, current) => statuses.push(`${event.type}:${current.status.status}`));
  store.selectProvider('ollama');
  await store.save();
  await settle();
  assert.deepEqual(statuses, ['operation:unconfigured', 'saved:ready', 'operation:ready', 'loaded:ready']);
});

// ---------- ConfigStore: reset() ----------

test('reset(): removes live and legacy keys and returns to unconfigured', async () => {
  const storage = createFakeStorage({
    selectedProvider: 'openai',
    openaiApiKey: 'sk',
    apiKey: 'legacy',
    extensionSettings: { old: true },
    favoriteModels: [{ provider: 'openai', model: 'm' }],
    forumContextLimit: 45000,
    unrelated: 'keep'
  });
  const store = createStore(storage);
  await store.load();
  store.selectProvider('openai');
  store.updateField('openai', 'apiKey', 'draft');
  const phases = [];
  store.subscribe(event => {
    if (event.type === 'operation') phases.push(event.operation.phase);
  });
  const result = await store.reset();
  assert.equal(result.ok, true);
  assert.deepEqual(phases, ['resetting', 'idle']);
  assert.deepEqual(storage.values, { unrelated: 'keep' });
  assert.equal(store.status.status, CONFIG_STATUS.UNCONFIGURED);
  assert.deepEqual(store.config.favorites, []);
  assert.equal(store.config.forumContextLimit, 30000);
  assert.equal(store.draft.provider, '');
  assert.equal(store.draftSettings('openai').apiKey, '', 'draft discarded');
});

test('reset(): a storage failure → error', async () => {
  const storage = createFakeStorage({ selectedProvider: 'openai' });
  storage.area.remove = async () => {
    throw new Error('nope');
  };
  const store = createStore(storage);
  await store.load();
  const result = await store.reset();
  assert.equal(result.reason, 'error');
  assert.equal(store.operation.phase, OPERATION_PHASE.ERROR);
  assert.equal(store.config.providerChoice, 'openai');
});

test('an external removal of the key moves ready → incomplete', async () => {
  const storage = createFakeStorage({ selectedProvider: 'openai', openaiApiKey: 'sk' });
  const store = createStore(storage);
  await store.load();
  store.subscribe(() => {});
  await storage.area.remove('openaiApiKey');
  await settle();
  assert.equal(store.status.status, CONFIG_STATUS.INCOMPLETE);
  assert.ok(store.status.fieldErrors.apiKey);
});

// ---------- preferences section ----------

test('readConfig normalizes the preferences section (migration for missing keys)', () => {
  assert.deepEqual(readConfig({}).preferences, defaultPreferences());
  const config = readConfig({ preferences: { researchDepth: 'quick', topicPageLimit: 500 } });
  assert.equal(config.preferences.researchDepth, 'quick');
  assert.equal(config.preferences.topicPageLimit, 100);
  assert.equal(config.preferences.topicPageMode, 'all', 'a stored limit without a mode reads as every page');
  assert.equal(config.preferences.historyRetention, '1d');
  assert.ok(CONFIG_STORAGE_KEYS.includes('preferences'));
  assert.ok(RESETTABLE_STORAGE_KEYS.includes('preferences'));
});

test('preference draft edits never touch storage until save()', async () => {
  const storage = createFakeStorage({ selectedProvider: 'ollama' });
  const store = createStore(storage);
  await store.load();
  store.selectProvider('ollama');
  store.updatePreferences({ researchDepth: 'custom', customResearch: { topicsRead: '9' } });
  store.updatePreferences({ historyRetention: '7d' });
  assert.equal(storage.writes.length, 0);
  assert.equal(store.config.preferences.historyRetention, '1d');
  assert.equal(store.draftPreferences.customResearch.topicsRead, '9');
  assert.equal(store.draftPreferences.customResearch.searchQueries, 3, 'merged, not replaced');

  const result = await store.save();
  assert.equal(result.ok, true);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.values.preferences.historyRetention, '7d');
  assert.equal(storage.values.preferences.customResearch.topicsRead, 9);
  assert.equal(store.config.preferences.researchDepth, 'custom');
  assert.equal(store.draft.preferences, undefined, 'draft follows the saved values again');
});

test('save(): invalid preferences → invalid with field errors and nothing is written', async () => {
  const storage = createFakeStorage({ selectedProvider: 'ollama' });
  const store = createStore(storage);
  await store.load();
  store.selectProvider('ollama');
  store.updatePreferences({ topicPageMode: 'limit', topicPageLimit: '0' });
  store.updateDraft({ forumContextLimit: '12' });
  const result = await store.save();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid');
  assert.equal(store.operation.phase, OPERATION_PHASE.INVALID);
  assert.ok(result.validation.fieldErrors.topicPageLimit);
  assert.ok(result.validation.fieldErrors.forumContextLimit);
  assert.equal(storage.writes.length, 0);
  // test() only checks the provider.
  assert.equal(store.validateDraft().valid, true);
});

test('save(): a bad page limit does not block saving "every page"', async () => {
  const storage = createFakeStorage({ selectedProvider: 'ollama' });
  const store = createStore(storage);
  await store.load();
  store.selectProvider('ollama');
  store.updatePreferences({ topicPageMode: 'limit', topicPageLimit: '0' });
  assert.ok(store.validatePreferencesDraft().fieldErrors.topicPageLimit);
  store.updatePreferences({ topicPageMode: 'all' });
  assert.equal(store.validatePreferencesDraft().valid, true);
  assert.equal((await store.save()).ok, true);
  assert.equal(storage.values.preferences.topicPageMode, 'all');
  assert.equal(storage.values.preferences.topicPageLimit, 1, 'the remembered value is clamped into range');
});

test('save(): a drafted chat context limit is saved normalized', async () => {
  const storage = createFakeStorage({ selectedProvider: 'ollama' });
  const store = createStore(storage);
  await store.load();
  store.selectProvider('ollama');
  store.updateDraft({ forumContextLimit: '42001' });
  assert.equal((await store.save()).ok, true);
  assert.equal(storage.values.forumContextLimit, 40000);
  assert.equal(store.config.forumContextLimit, 40000);
});

test('resetPreferencesDraft restores defaults for all or some keys (draft only)', async () => {
  const storage = createFakeStorage({
    preferences: { researchDepth: 'thorough', topicPageMode: 'limit', topicPageLimit: 3, historyRetention: '30d', maxSavedTopics: 99 }
  });
  const store = createStore(storage);
  await store.load();
  // "Reading topics" → Restore defaults: back to every page.
  store.resetPreferencesDraft(['topicPageMode', 'topicPageLimit']);
  assert.equal(store.draftPreferences.topicPageMode, 'all');
  assert.equal(store.draftPreferences.topicPageLimit, 20);
  assert.equal(store.draftPreferences.historyRetention, '30d', 'other sections untouched');
  store.resetPreferencesDraft(['historyRetention', 'maxSavedTopics']);
  assert.equal(store.draftPreferences.historyRetention, '1d');
  assert.equal(store.draftPreferences.maxSavedTopics, 40);
  assert.equal(store.draftPreferences.researchDepth, 'thorough', 'other sections untouched');
  store.resetPreferencesDraft();
  assert.deepEqual(store.draftPreferences, defaultPreferences());
  assert.equal(storage.writes.length, 0);
  assert.equal(store.config.preferences.researchDepth, 'thorough');
});

test('setPreferences validates and writes directly; subscribers hear it', async () => {
  const storage = createFakeStorage();
  const store = createStore(storage);
  await store.load();
  const events = [];
  store.subscribe(event => events.push(event.type));
  const bad = await store.setPreferences({ ...defaultPreferences(), maxSavedTopics: 2 });
  assert.equal(bad.ok, false);
  assert.equal(storage.writes.length, 0);
  const good = await store.setPreferences({ ...defaultPreferences(), historyRetention: '3d' });
  assert.equal(good.ok, true);
  assert.equal(storage.values.preferences.historyRetention, '3d');
  assert.ok(events.includes('preferences'));
});

test('preferences saved in another page reach subscribers as a reload', async () => {
  const storage = createFakeStorage();
  const store = createStore(storage);
  await store.load();
  const seen = [];
  store.subscribe((event, current) => {
    if (event.type === 'loaded') seen.push(current.config.preferences.historyRetention);
  });
  storage.externalSet({ preferences: { historyRetention: 'forever' } });
  await settle();
  assert.deepEqual(seen, ['forever']);
});
