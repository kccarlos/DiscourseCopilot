// The extension's configuration: the one place that reads, normalizes,
// validates and writes the persisted settings (provider, per-provider
// settings, active model, favorites, system prompt, response language, forum
// context limit, and the `preferences` section: research depth, topic page
// limit, history retention). The settings page, the side panel (header, model
// switcher, setup card, Activity labels) and the background worker (task
// limits, retention cleanup) all go through this module. The configuration
// as data (storage keys, readConfig(), the derived status, the writes) is in
// config-model.mjs and re-exported here; this file is the ConfigStore.
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
import { defaultPreferences, validatePreferences } from './preferences.mjs';
import { classifyConnectionFailure, defaultProviderSettings, runConnectionTest, validateProviderSettings } from './provider-setup.mjs';
import {
  CONFIG_STORAGE_KEYS,
  PROVIDER_STORAGE_KEYS,
  RESETTABLE_STORAGE_KEYS,
  buildActiveModelWrite,
  buildConfigurationWrite,
  defaultStorageArea,
  providerSettingsOf,
  readConfig,
  deriveConfigStatus
} from './config-model.mjs';

// The pure model is part of this module's API.
export * from './config-model.mjs';

const { STORAGE_KEYS, PROVIDER_CONFIGS } = DiscourseCopilotConstants;

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

const BUSY_PHASES = new Set([OPERATION_PHASE.TESTING, OPERATION_PHASE.SAVING, OPERATION_PHASE.RESETTING]);

const CONFIG_KEY_SET = new Set(CONFIG_STORAGE_KEYS);

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
        values[key] = field === 'model' && !this.config.savedModels?.[provider] ? '' : this.config.providers[provider]?.[field] || '';
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
