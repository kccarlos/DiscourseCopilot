// The extension's configuration: the one place that reads, normalizes,
// validates and writes the persisted settings (provider, per-provider
// settings, active model, favorites, system prompt, response language, forum
// context limit, and the `preferences` section: research depth, topic page
// limit, history retention). The settings page, the side panel (header, model
// switcher, setup card, Activity labels) and the background worker (task
// limits, retention cleanup) all go through this module.
//
// Persisted status (derived from storage on every load and write, never
// stored itself):
//
//                     save() of a valid draft
//   ┌──────────────┐ ─────────────────────────────▶ ┌───────┐
//   │ unconfigured │                                 │ ready │
//   └──────────────┘ ◀──────────── reset() ───────── └───────┘
//          ▲                                          │    ▲
//          │ reset()           a required value was   │    │ save() of a
//          │                   removed elsewhere      ▼    │ valid draft
//          │                                ┌────────────────────────────┐
//          └─────────────────────────────── │ incomplete (+ fieldErrors) │
//                                           └────────────────────────────┘
//
//   ready        the selected provider's settings validate.
//   incomplete   a provider was chosen, but its settings don't validate;
//                `fieldErrors` says which field (apiKey, url, model).
//   unconfigured nothing usable and no provider was ever chosen (fresh
//                install). A legacy-only OpenRouter key still counts as ready.
//
// Operations on a ConfigStore (store.operation.phase):
//
//                 test()                        save()
//   idle ──┬──▶ testing ──▶ passed | failed      │
//          │                                     ▼
//          ├──────────────────────────────▶ saving ──▶ saved | error
//          │  test()/save() of an invalid draft
//          ├──────────────────────────────▶ invalid (+ validation)
//          └── reset() ──▶ resetting ──▶ idle | error
//
// Every phase is re-enterable: a new test()/save() starts from whichever
// phase the last operation ended in. test()/save()/reset() refuse to start
// while another operation is in flight (they return { ok: false, reason: 'busy' }).
//
// Draft edits (selectProvider, updateField, updateDraft, updatePreferences,
// resetPreferencesDraft) are synchronous and do not notify subscribers;
// subscribers hear about persisted changes and operation phases. The draft
// starts as a copy of the persisted settings and only reaches storage through
// save(), which validates the provider and the preferences together.
//
// Preferences (config.preferences, see preferences.mjs):
//
//   storage ──readConfig()──▶ normalizePreferences()   missing keys → defaults,
//      ▲                          │                     out of range → clamped
//      │                          ▼
//      │                   config.preferences ──▶ resolveResearchLimits()
//      │                          │                   resolveTopicPageLimit()
//      │                          │                   resolveRetention()
//      │                          ▼
//      │     updatePreferences() / resetPreferencesDraft()
//      │                          │
//      │                          ▼
//      │                   draft.preferences ──validatePreferences()──▶ invalid
//      │                          │                (per-field errors, nothing
//      └──────── save() ──────────┘                 clamped, nothing written)
//
//   Effective values are always derived with the resolve*() helpers. The
//   background snapshots the task-relevant ones into each task when it is
//   queued (snapshotTaskLimits), so queued and running tasks keep the values
//   they started with; retention changes reach the background and the side
//   panel through subscribe() and are applied at once (cleanup + labels).

import { DiscourseCopilotConstants } from './constants.js';
import { normalizeFavoriteModels } from './favorite-models.mjs';
import { FORUM_CONTEXT_LIMIT, normalizeForumContextLimit } from './chat-context-limit.mjs';
import { normalizeResponseLanguage } from './response-language.mjs';
import {
  defaultPreferences,
  normalizePreferences,
  validatePreferences
} from './preferences.mjs';
import {
  classifyConnectionFailure,
  defaultProviderSettings,
  runConnectionTest,
  validateProviderSettings
} from './provider-setup.mjs';

const { STORAGE_KEYS, LEGACY_STORAGE_KEYS, PROVIDER_CONFIGS } = DiscourseCopilotConstants;

export const DEFAULT_PROVIDER = 'openrouter';

export const CONFIG_STATUS = Object.freeze({
  UNCONFIGURED: 'unconfigured',
  INCOMPLETE: 'incomplete',
  READY: 'ready'
});

export const OPERATION_PHASE = Object.freeze({
  IDLE: 'idle',
  INVALID: 'invalid',
  TESTING: 'testing',
  PASSED: 'passed',
  FAILED: 'failed',
  SAVING: 'saving',
  SAVED: 'saved',
  RESETTING: 'resetting',
  ERROR: 'error'
});

const BUSY_PHASES = new Set([
  OPERATION_PHASE.TESTING,
  OPERATION_PHASE.SAVING,
  OPERATION_PHASE.RESETTING
]);

// Storage key for each provider field.
export const PROVIDER_STORAGE_KEYS = Object.freeze({
  openrouter: { apiKey: STORAGE_KEYS.OPENROUTER_API_KEY, model: STORAGE_KEYS.OPENROUTER_MODEL },
  openai: { apiKey: STORAGE_KEYS.OPENAI_API_KEY, model: STORAGE_KEYS.OPENAI_MODEL },
  anthropic: { apiKey: STORAGE_KEYS.ANTHROPIC_API_KEY, model: STORAGE_KEYS.ANTHROPIC_MODEL },
  groq: { apiKey: STORAGE_KEYS.GROQ_API_KEY, model: STORAGE_KEYS.GROQ_MODEL },
  gemini: { apiKey: STORAGE_KEYS.GEMINI_API_KEY, model: STORAGE_KEYS.GEMINI_MODEL },
  ollama: { url: STORAGE_KEYS.OLLAMA_URL, model: STORAGE_KEYS.OLLAMA_MODEL },
  xai: { apiKey: STORAGE_KEYS.XAI_API_KEY, model: STORAGE_KEYS.XAI_MODEL },
  deepseek: { apiKey: STORAGE_KEYS.DEEPSEEK_API_KEY, model: STORAGE_KEYS.DEEPSEEK_MODEL },
  lmstudio: { url: STORAGE_KEYS.LMSTUDIO_URL, model: STORAGE_KEYS.LMSTUDIO_MODEL }
});

export const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDER_CONFIGS));

// Everything the configuration is read from (one storage read).
export const CONFIG_STORAGE_KEYS = Object.freeze(Object.values(STORAGE_KEYS));

// Everything "Reset settings" removes: live keys plus legacy leftovers.
export const RESETTABLE_STORAGE_KEYS = Object.freeze([
  ...CONFIG_STORAGE_KEYS,
  ...Object.values(LEGACY_STORAGE_KEYS)
]);

const CONFIG_KEY_SET = new Set(CONFIG_STORAGE_KEYS);

function storedString(value) {
  return typeof value === 'string' ? value : '';
}

function readProviderSettings(values, provider, providerConfigs) {
  const keys = PROVIDER_STORAGE_KEYS[provider];
  if (!keys) return {};
  const settings = defaultProviderSettings(provider, providerConfigs);
  for (const [field, key] of Object.entries(keys)) {
    // Empty values fall back to the defaults.
    if (storedString(values[key])) {
      settings[field] = values[key];
    }
  }
  // Preserve the extension's original API key for existing OpenRouter users.
  if (provider === 'openrouter' && !settings.apiKey) {
    settings.apiKey = storedString(values[STORAGE_KEYS.LEGACY_API_KEY]);
  }
  return settings;
}

/**
 * Normalizes raw storage values into the configuration snapshot.
 * @returns {{
 *   provider: string, providerChoice: string,
 *   providers: Record<string, {apiKey?: string, url?: string, model: string}>,
 *   favorites: Array<{provider: string, model: string}>,
 *   systemPrompt: string, responseLanguage: string, forumContextLimit: number,
 *   preferences: ReturnType<typeof normalizePreferences>
 * }}
 */
export function readConfig(values = {}, providerConfigs = PROVIDER_CONFIGS) {
  const raw = values && typeof values === 'object' ? values : {};
  // The provider the user explicitly chose ('' on a fresh install).
  const providerChoice = storedString(raw[STORAGE_KEYS.PROVIDER]);
  const provider = providerConfigs[providerChoice] ? providerChoice : DEFAULT_PROVIDER;
  return {
    provider,
    providerChoice,
    providers: Object.fromEntries(Object.keys(providerConfigs).map(id => [
      id,
      readProviderSettings(raw, id, providerConfigs)
    ])),
    favorites: normalizeFavoriteModels(raw[STORAGE_KEYS.FAVORITE_MODELS], providerConfigs),
    systemPrompt: storedString(raw[STORAGE_KEYS.SYSTEM_PROMPT]),
    responseLanguage: normalizeResponseLanguage(raw[STORAGE_KEYS.RESPONSE_LANGUAGE]),
    forumContextLimit: normalizeForumContextLimit(raw[STORAGE_KEYS.FORUM_CONTEXT_LIMIT]),
    preferences: normalizePreferences(raw[STORAGE_KEYS.PREFERENCES])
  };
}

// A copy of one provider's settings ({} for an unknown provider).
export function providerSettingsOf(config, provider = config?.provider) {
  return { ...(config?.providers?.[provider] || {}) };
}

export function deriveConfigStatus(config, providerConfigs = PROVIDER_CONFIGS) {
  const provider = config?.provider || DEFAULT_PROVIDER;
  const validation = validateProviderSettings(
    provider,
    config?.providers?.[provider] || {},
    providerConfigs
  );
  const status = validation.valid
    ? CONFIG_STATUS.READY
    : config?.providerChoice
      ? CONFIG_STATUS.INCOMPLETE
      : CONFIG_STATUS.UNCONFIGURED;
  return {
    status,
    ready: status === CONFIG_STATUS.READY,
    provider,
    providerName: providerConfigs[provider]?.name || 'Unknown provider',
    model: config?.providers?.[provider]?.model || '',
    errors: validation.errors,
    fieldErrors: validation.fieldErrors
  };
}

// Storage values for saving a provider's settings (written in one call).
export function buildConfigurationWrite(provider, settings, {
  systemPrompt = '',
  responseLanguage,
  preferences,
  forumContextLimit
} = {}) {
  const keys = PROVIDER_STORAGE_KEYS[provider];
  if (!keys) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const values = {
    [STORAGE_KEYS.PROVIDER]: provider,
    [STORAGE_KEYS.SYSTEM_PROMPT]: typeof systemPrompt === 'string' ? systemPrompt : ''
  };
  if (responseLanguage !== undefined) {
    values[STORAGE_KEYS.RESPONSE_LANGUAGE] = normalizeResponseLanguage(responseLanguage);
  }
  if (preferences !== undefined) {
    values[STORAGE_KEYS.PREFERENCES] = normalizePreferences(preferences);
  }
  if (forumContextLimit !== undefined) {
    values[STORAGE_KEYS.FORUM_CONTEXT_LIMIT] = normalizeForumContextLimit(forumContextLimit);
  }
  for (const [field, key] of Object.entries(keys)) {
    values[key] = settings?.[field] || '';
  }
  return values;
}

// Storage values for switching the active provider and model.
export function buildActiveModelWrite(provider, model) {
  const keys = PROVIDER_STORAGE_KEYS[provider];
  const normalizedModel = typeof model === 'string' ? model.trim() : '';
  if (!keys || !normalizedModel) {
    throw new Error('A supported provider and model are required');
  }
  return {
    [STORAGE_KEYS.PROVIDER]: provider,
    [keys.model]: normalizedModel
  };
}

function defaultStorageArea() {
  return globalThis.chrome?.storage?.local;
}

// One-shot read for callers that don't need a store (the background worker).
export async function loadConfig(storageArea = defaultStorageArea(), providerConfigs = PROVIDER_CONFIGS) {
  return readConfig(await storageArea.get([...CONFIG_STORAGE_KEYS]), providerConfigs);
}

export class ConfigStore {
  /**
   * @param {object} [options]
   * @param {object} [options.storageArea] chrome.storage.local-shaped {get,set,remove}
   * @param {object} [options.onChanged] chrome.storage.onChanged-shaped event
   * @param {object} [options.providerConfigs]
   * @param {object} [options.apiHeaders] headers for connection tests
   * @param {Function} [options.testConnection] runConnectionTest-compatible
   * @param {number} [options.reloadDelayMs] debounce for external storage changes
   * @param {(error: Error) => void} [options.onError] reload failures
   */
  constructor({
    storageArea = defaultStorageArea(),
    onChanged = globalThis.chrome?.storage?.onChanged,
    providerConfigs = PROVIDER_CONFIGS,
    apiHeaders = DiscourseCopilotConstants.API_CONFIG?.HEADERS || {},
    testConnection = runConnectionTest,
    reloadDelayMs = 0,
    onError = error => console.error('DiscourseCopilot: Unable to reload settings:', error)
  } = {}) {
    this.storageArea = storageArea;
    this.onChanged = onChanged;
    this.providerConfigs = providerConfigs;
    this.apiHeaders = apiHeaders;
    this.testConnection = testConnection;
    this.reloadDelayMs = reloadDelayMs;
    this.onError = onError;
    this.listeners = new Set();
    this.changeListener = null;
    this.reloadTimer = null;
    this.operation = { phase: OPERATION_PHASE.IDLE };
    this.setConfig(readConfig({}, providerConfigs));
    this.discardDraft();
  }

  // ---------- Persisted configuration ----------

  get activeSettings() {
    return providerSettingsOf(this.config, this.config.provider);
  }

  isReady() {
    return this.status.ready;
  }

  providerName(provider) {
    return this.providerConfigs[provider]?.name || provider;
  }

  async load() {
    const values = await this.storageArea.get([...CONFIG_STORAGE_KEYS]);
    this.setConfig(readConfig(values, this.providerConfigs));
    this.emit({ type: 'loaded' });
    return this.config;
  }

  setConfig(config) {
    this.config = config;
    this.status = deriveConfigStatus(config, this.providerConfigs);
  }

  // Applies a write locally so the UI doesn't wait for the storage echo.
  applyWrite(values, type) {
    this.setConfig(readConfig({ ...this.snapshotValues(), ...values }, this.providerConfigs));
    this.emit({ type });
  }

  // The current snapshot expressed as storage values (for local merges).
  snapshotValues() {
    const values = {
      [STORAGE_KEYS.PROVIDER]: this.config.providerChoice,
      [STORAGE_KEYS.FAVORITE_MODELS]: this.config.favorites,
      [STORAGE_KEYS.SYSTEM_PROMPT]: this.config.systemPrompt,
      [STORAGE_KEYS.RESPONSE_LANGUAGE]: this.config.responseLanguage,
      [STORAGE_KEYS.FORUM_CONTEXT_LIMIT]: this.config.forumContextLimit,
      [STORAGE_KEYS.PREFERENCES]: this.config.preferences
    };
    for (const [provider, keys] of Object.entries(PROVIDER_STORAGE_KEYS)) {
      for (const [field, key] of Object.entries(keys)) {
        values[key] = this.config.providers[provider]?.[field] || '';
      }
    }
    return values;
  }

  // Quick switch from the side panel's favorites.
  async setActiveModel(provider, model) {
    const values = buildActiveModelWrite(provider, model);
    await this.storageArea.set(values);
    this.applyWrite(values, 'active-model');
  }

  async setFavorites(favorites) {
    const normalized = normalizeFavoriteModels(favorites, this.providerConfigs);
    const values = { [STORAGE_KEYS.FAVORITE_MODELS]: normalized };
    await this.storageArea.set(values);
    this.applyWrite(values, 'favorites');
    return normalized;
  }

  async setForumContextLimit(limit) {
    const normalized = normalizeForumContextLimit(limit);
    const values = { [STORAGE_KEYS.FORUM_CONTEXT_LIMIT]: normalized };
    await this.storageArea.set(values);
    this.applyWrite(values, 'forum-context-limit');
    return normalized;
  }

  // Writes the preferences section directly (validated; no draft involved).
  async setPreferences(preferences) {
    const validation = validatePreferences(preferences);
    if (!validation.valid) {
      return { ok: false, reason: 'invalid', validation };
    }
    const values = { [STORAGE_KEYS.PREFERENCES]: validation.preferences };
    await this.storageArea.set(values);
    this.applyWrite(values, 'preferences');
    return { ok: true, preferences: this.config.preferences };
  }

  // ---------- Subscription ----------

  // listener(event, store); event.type is 'loaded' (initial or external
  // change), 'active-model', 'favorites', 'forum-context-limit',
  // 'preferences', 'saved', 'reset' or 'operation'. The first subscriber starts watching storage.
  subscribe(listener) {
    this.listeners.add(listener);
    this.watchStorage();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.unwatchStorage();
      }
    };
  }

  emit(event) {
    for (const listener of [...this.listeners]) {
      listener(event, this);
    }
  }

  watchStorage() {
    if (this.changeListener || typeof this.onChanged?.addListener !== 'function') {
      return;
    }
    this.changeListener = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (!Object.keys(changes || {}).some(key => CONFIG_KEY_SET.has(key))) return;
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        this.reloadTimer = null;
        this.load().catch(error => this.onError(error));
      }, this.reloadDelayMs);
    };
    this.onChanged.addListener(this.changeListener);
  }

  unwatchStorage() {
    clearTimeout(this.reloadTimer);
    this.reloadTimer = null;
    if (this.changeListener) {
      this.onChanged?.removeListener?.(this.changeListener);
      this.changeListener = null;
    }
  }

  // ---------- Draft ----------

  discardDraft() {
    this.draft = {
      provider: '',
      providers: new Map(),
      systemPrompt: undefined,
      responseLanguage: undefined,
      forumContextLimit: undefined,
      // undefined until edited; then the preferences being edited (field
      // values may be strings typed into inputs until they validate).
      preferences: undefined
    };
  }

  selectProvider(provider) {
    if (!this.providerConfigs[provider]) {
      return false;
    }
    this.draft.provider = provider;
    this.draftSettings(provider);
    return true;
  }

  // The draft settings for a provider, first copied from the persisted ones.
  draftSettings(provider = this.draft.provider) {
    if (!this.providerConfigs[provider]) {
      return {};
    }
    if (!this.draft.providers.has(provider)) {
      this.draft.providers.set(provider, {
        ...defaultProviderSettings(provider, this.providerConfigs),
        ...providerSettingsOf(this.config, provider)
      });
    }
    return this.draft.providers.get(provider);
  }

  updateField(provider, field, value) {
    const settings = this.draftSettings(provider);
    if (!this.providerConfigs[provider] || !['apiKey', 'url', 'model'].includes(field)) {
      return;
    }
    settings[field] = typeof value === 'string' ? value : '';
  }

  updateDraft({ systemPrompt, responseLanguage, forumContextLimit } = {}) {
    if (systemPrompt !== undefined) this.draft.systemPrompt = systemPrompt;
    if (responseLanguage !== undefined) this.draft.responseLanguage = responseLanguage;
    // May be a string typed into the settings page until it validates.
    if (forumContextLimit !== undefined) this.draft.forumContextLimit = forumContextLimit;
  }

  // The preferences being edited (a copy of the persisted ones until edited).
  get draftPreferences() {
    return this.draft.preferences ?? structuredClone(this.config.preferences);
  }

  // Merges a patch into the draft preferences; `customResearch` merges too.
  updatePreferences(patch = {}) {
    const current = this.draftPreferences;
    this.draft.preferences = {
      ...current,
      ...patch,
      customResearch: {
        ...current.customResearch,
        ...(patch.customResearch || {})
      }
    };
    return this.draft.preferences;
  }

  // "Reset to defaults" for the preferences (all of them, or only `keys`):
  // a draft edit like any other (nothing is written until save()).
  resetPreferencesDraft(keys) {
    const defaults = defaultPreferences();
    if (!Array.isArray(keys)) {
      this.draft.preferences = defaults;
      return this.draft.preferences;
    }
    this.draft.preferences = {
      ...this.draftPreferences,
      ...Object.fromEntries(keys.filter(key => key in defaults).map(key => [key, defaults[key]]))
    };
    return this.draft.preferences;
  }

  // Provider settings only (what test() needs).
  validateDraft(provider = this.draft.provider) {
    return validateProviderSettings(provider, this.draftSettings(provider), this.providerConfigs);
  }

  validatePreferencesDraft() {
    const validation = validatePreferences(this.draftPreferences);
    const limit = this.draft.forumContextLimit;
    if (limit === undefined) {
      return validation;
    }
    const text = typeof limit === 'number' ? String(limit) : String(limit ?? '').trim();
    const number = Number(text);
    if (/^\d+$/.test(text) && number >= FORUM_CONTEXT_LIMIT.min && number <= FORUM_CONTEXT_LIMIT.max) {
      return validation;
    }
    const message = `Chat context must be a whole number from ${FORUM_CONTEXT_LIMIT.min.toLocaleString('en-US')} to ${FORUM_CONTEXT_LIMIT.max.toLocaleString('en-US')} characters.`;
    return {
      ...validation,
      valid: false,
      errors: [...validation.errors, message],
      fieldErrors: { ...validation.fieldErrors, forumContextLimit: message },
      preferences: null
    };
  }

  // Everything save() checks: the provider settings plus the preferences.
  validateSave(provider = this.draft.provider) {
    const providerValidation = this.validateDraft(provider);
    const preferenceValidation = this.validatePreferencesDraft();
    return {
      ...providerValidation,
      valid: providerValidation.valid && preferenceValidation.valid,
      errors: [...providerValidation.errors, ...preferenceValidation.errors],
      fieldErrors: { ...providerValidation.fieldErrors, ...preferenceValidation.fieldErrors },
      preferences: preferenceValidation.preferences
    };
  }

  // ---------- Operations ----------

  get busy() {
    return BUSY_PHASES.has(this.operation.phase);
  }

  setOperation(operation) {
    this.operation = operation;
    this.emit({ type: 'operation', operation });
  }

  async test(provider = this.draft.provider) {
    if (this.busy) return { ok: false, reason: 'busy' };
    const validation = this.validateDraft(provider);
    if (!validation.valid) {
      this.setOperation({ phase: OPERATION_PHASE.INVALID, provider, validation });
      return { ok: false, reason: 'invalid', validation };
    }
    this.setOperation({ phase: OPERATION_PHASE.TESTING, provider });
    try {
      await this.testConnection(provider, validation.settings, this.providerConfigs, {
        apiHeaders: this.apiHeaders
      });
    } catch (error) {
      const failure = classifyConnectionFailure(provider, error, this.providerConfigs);
      this.setOperation({ phase: OPERATION_PHASE.FAILED, provider, error, failure });
      return { ok: false, reason: 'failed', error, failure, validation };
    }
    this.setOperation({ phase: OPERATION_PHASE.PASSED, provider });
    return { ok: true, validation };
  }

  async save(provider = this.draft.provider) {
    if (this.busy) return { ok: false, reason: 'busy' };
    const validation = this.validateSave(provider);
    if (!validation.valid) {
      this.setOperation({ phase: OPERATION_PHASE.INVALID, provider, validation });
      return { ok: false, reason: 'invalid', validation };
    }
    this.setOperation({ phase: OPERATION_PHASE.SAVING, provider });
    // Edits made while the write is in flight stay in the draft.
    const savedDraftPreferences = this.draft.preferences;
    const savedDraftContextLimit = this.draft.forumContextLimit;
    let values;
    try {
      values = buildConfigurationWrite(provider, validation.settings, {
        systemPrompt: this.draft.systemPrompt ?? this.config.systemPrompt,
        responseLanguage: this.draft.responseLanguage ?? this.config.responseLanguage,
        preferences: validation.preferences,
        forumContextLimit: this.draft.forumContextLimit
      });
      await this.storageArea.set(values);
    } catch (error) {
      this.setOperation({ phase: OPERATION_PHASE.ERROR, provider, error });
      return { ok: false, reason: 'error', error, validation };
    }
    this.draft.providers.set(provider, { ...validation.settings });
    if (this.draft.preferences === savedDraftPreferences) this.draft.preferences = undefined;
    if (this.draft.forumContextLimit === savedDraftContextLimit) this.draft.forumContextLimit = undefined;
    this.applyWrite(values, 'saved');
    this.setOperation({ phase: OPERATION_PHASE.SAVED, provider });
    return { ok: true, validation };
  }

  async reset() {
    if (this.busy) return { ok: false, reason: 'busy' };
    this.setOperation({ phase: OPERATION_PHASE.RESETTING });
    try {
      await this.storageArea.remove([...RESETTABLE_STORAGE_KEYS]);
    } catch (error) {
      this.setOperation({ phase: OPERATION_PHASE.ERROR, error });
      return { ok: false, reason: 'error', error };
    }
    this.setConfig(readConfig({}, this.providerConfigs));
    this.discardDraft();
    this.emit({ type: 'reset' });
    this.setOperation({ phase: OPERATION_PHASE.IDLE });
    return { ok: true };
  }
}
