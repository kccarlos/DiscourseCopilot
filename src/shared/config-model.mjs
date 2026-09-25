// The configuration as data (pure): the storage keys, readConfig() that
// normalizes raw storage values into the snapshot, the derived status, and
// the storage writes for a save or a quick model switch. ConfigStore
// (config-state.mjs) holds a snapshot and a draft on top of this.
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

import { DiscourseCopilotConstants } from './constants.js';
import { normalizeFavoriteModels } from './favorite-models.mjs';
import { normalizeForumContextLimit } from './chat-context-limit.mjs';
import { normalizeResponseLanguage } from './response-language.mjs';
import { normalizePreferences } from './preferences.mjs';
import { defaultProviderSettings, validateProviderSettings } from './provider-setup.mjs';

const { STORAGE_KEYS, LEGACY_STORAGE_KEYS, PROVIDER_CONFIGS } = DiscourseCopilotConstants;

export const DEFAULT_PROVIDER = 'openrouter';

export const CONFIG_STATUS = Object.freeze({
  UNCONFIGURED: 'unconfigured',
  INCOMPLETE: 'incomplete',
  READY: 'ready'
});

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
 *   savedModels: Record<string, boolean>,
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
    // Whether each provider's model was ever saved (else it is the curated
    // default, which setup may replace with one from the live model list).
    savedModels: Object.fromEntries(Object.keys(providerConfigs).map(id => [
      id,
      Boolean(PROVIDER_STORAGE_KEYS[id] && storedString(raw[PROVIDER_STORAGE_KEYS[id].model]))
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

export function defaultStorageArea() {
  return globalThis.chrome?.storage?.local;
}

// One-shot read for callers that don't need a store (the background worker).
export async function loadConfig(storageArea = defaultStorageArea(), providerConfigs = PROVIDER_CONFIGS) {
  return readConfig(await storageArea.get([...CONFIG_STORAGE_KEYS]), providerConfigs);
}
