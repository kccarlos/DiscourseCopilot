// The providers' live model lists, and the choice of a default model from
// them. Used by the side panel's setup card and the settings page.
//
//   key / server URL ──▶ ModelCatalog.list(provider, settings)
//                           │  cache hit (same provider + key hash, < TTL) ─▶ models
//                           ▼
//                        buildModelListRequest() ──fetch (8 s timeout)──▶ JSON
//                           ▼
//                        normalizeModelList(): ids, chat models only, newest first
//                           ▼
//                        pickDefaultModel(): first curated model the provider still
//                        offers (constants.js RECOMMENDED_MODELS), else a small/fast-
//                        looking one, else the first; findOfferedModel() tells whether
//                        a saved model is still listed (the settings page's warning)
//
// Nothing here touches chrome.* or fetch at import time: both are resolved per
// call (or injected), so the module runs under node --test. API keys never
// appear in cache keys, errors or logs (Gemini's key goes in a header rather
// than the URL for that reason).
import { DiscourseCopilotConstants } from './constants.js';

const { PROVIDER_CONFIGS } = DiscourseCopilotConstants;

export const MODEL_LIST_TIMEOUT_MS = 8000;
export const MODEL_LIST_TTL_MS = 10 * 60 * 1000;
const CACHE_PREFIX = 'modelCatalog:';
const LOCAL_PROVIDERS = new Set(['ollama', 'lmstudio']);

// Models that can't answer a chat request: embeddings, speech, images,
// video, moderation, realtime/live voice.
const NON_CHAT_PATTERN =
  /(^|[^a-z])(embed\w*|tts|whisper|transcribe|audio|realtime|live|image|images|imagine|dall-e|sora|video|veo|imagen|lyria|moderation|guard|rerank|computer-use|aqa|babbage|davinci)([^a-z]|$)/i;
// Listed and selectable, but never picked automatically.
const AVOID_PATTERN = /(^~)|(:)|(^|[^a-z])(preview|exp|experimental|vision|beta|alpha|test|deprecated)([^a-z]|$)/i;
// What a small, fast, cheap tier tends to be called.
const FAST_PATTERN = /(^|[^a-z])(mini|nano|flash|lite|haiku|small|instant|luna|fast|turbo|air)([^a-z]|$)/i;
const DATED_SUFFIX = /^-\d{8}$/;

export class ModelListError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ModelListError';
    this.status = status;
  }
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function providerName(provider, providerConfigs) {
  return providerConfigs[provider]?.name || provider;
}

export function isChatModelId(id) {
  const value = trimmed(id);
  return Boolean(value) && !NON_CHAT_PATTERN.test(value);
}

// Local servers are entered without the /v1 suffix (see provider-setup.mjs).
function localBaseUrl(provider, settings, providerConfigs) {
  const entered = trimmed(settings?.url).replace(/\/+$/, '');
  return entered || (providerConfigs[provider]?.baseUrl || '').replace(/\/v1$/, '');
}

/**
 * The request that lists a provider's models.
 * @returns {{ url: string, headers: Record<string, string> }}
 */
export function buildModelListRequest(provider, settings = {}, providerConfigs = PROVIDER_CONFIGS) {
  const config = providerConfigs[provider];
  if (!config) throw new ModelListError(`Unsupported provider: ${provider}`);
  const apiKey = trimmed(settings.apiKey);
  const bearer = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  switch (provider) {
    case 'openrouter':
      // Public: works without a key.
      return { url: `${config.baseUrl}/models`, headers: { ...bearer } };
    case 'anthropic':
      return {
        url: `${config.baseUrl}/models?limit=1000`,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        }
      };
    case 'gemini':
      return { url: `${config.baseUrl}/models?pageSize=1000`, headers: { 'x-goog-api-key': apiKey } };
    case 'ollama':
      return { url: `${localBaseUrl(provider, settings, providerConfigs)}/api/tags`, headers: {} };
    case 'lmstudio':
      return { url: `${localBaseUrl(provider, settings, providerConfigs)}/v1/models`, headers: {} };
    default:
      // OpenAI and the OpenAI-compatible hosted APIs (Groq, xAI, DeepSeek).
      return { url: `${config.baseUrl}/models`, headers: { ...bearer } };
  }
}

function createdAt(model) {
  if (Number.isFinite(model?.created)) return model.created * 1000;
  const parsed = Date.parse(model?.created_at || model?.modified_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A provider's /models answer → chat-capable models, newest first when the
 * provider says when they were created (list order otherwise).
 * @returns {Array<{ id: string, name: string, created: number }>}
 */
export function normalizeModelList(provider, data) {
  let entries = [];
  if (provider === 'gemini') {
    entries = (Array.isArray(data?.models) ? data.models : [])
      .filter(model => !Array.isArray(model?.supportedGenerationMethods) || model.supportedGenerationMethods.includes('generateContent'))
      .map(model => ({
        id: trimmed(model?.name).replace(/^models\//, ''),
        name: trimmed(model?.displayName)
      }));
  } else if (provider === 'ollama') {
    entries = (Array.isArray(data?.models) ? data.models : []).map(model => ({
      id: trimmed(model?.name) || trimmed(model?.model),
      created: createdAt(model)
    }));
  } else {
    const list = Array.isArray(data?.data) ? data.data : [];
    entries = list
      .filter(model => {
        if (provider === 'anthropic' && model?.type && model.type !== 'model') return false;
        if (provider === 'groq' && model?.active === false) return false;
        if (provider === 'openrouter') {
          const output = model?.architecture?.output_modalities;
          const input = model?.architecture?.input_modalities;
          if (Array.isArray(output) && !output.includes('text')) return false;
          if (Array.isArray(input) && !input.includes('text')) return false;
        }
        if (provider === 'openai') {
          // Chat models only: GPT, the o-series and ChatGPT aliases.
          if (!/^(gpt-|o\d|chatgpt-)/i.test(trimmed(model?.id))) return false;
          if (/instruct/i.test(model.id)) return false;
        }
        return true;
      })
      .map(model => ({
        id: trimmed(model?.id),
        name: trimmed(model?.display_name) || trimmed(model?.name),
        created: createdAt(model)
      }));
  }

  const seen = new Set();
  const models = [];
  entries.forEach((entry, index) => {
    if (!entry.id || seen.has(entry.id) || !isChatModelId(entry.id)) return;
    seen.add(entry.id);
    models.push({ id: entry.id, name: entry.name || entry.id, created: entry.created || 0, index });
  });
  models.sort((a, b) => b.created - a.created || a.index - b.index);
  return models.map(({ index, ...model }) => model);
}

function idsOf(available) {
  return (Array.isArray(available) ? available : [])
    .map(model => (typeof model === 'string' ? model : model?.id))
    .map(trimmed)
    .filter(Boolean);
}

/**
 * The listed id that stands for `model`, or '' when the provider doesn't
 * list it. Besides exact matches: Anthropic lists dated snapshots for the
 * aliases ("claude-haiku-4-5" ↔ "claude-haiku-4-5-20251001"), and Ollama
 * lists tags ("llama3.2" ↔ "llama3.2:latest" or "llama3.2:3b").
 */
export function findOfferedModel(provider, model, available) {
  const wanted = trimmed(model);
  if (!wanted) return '';
  const ids = idsOf(available);
  if (ids.includes(wanted)) return wanted;
  if (provider === 'ollama') {
    const base = wanted.replace(/:latest$/, '');
    return (
      ids.find(id => id === `${base}:latest`)
      || (wanted.includes(':') ? '' : ids.find(id => id.startsWith(`${base}:`)))
      || (wanted.endsWith(':latest') ? ids.find(id => id === base) : '')
      || ''
    );
  }
  // A dated snapshot of an alias, or the alias of a dated snapshot.
  return (
    ids.find(id => id.startsWith(wanted) && DATED_SUFFIX.test(id.slice(wanted.length)))
    || ids.find(id => wanted.startsWith(id) && DATED_SUFFIX.test(wanted.slice(id.length)))
    || ''
  );
}

export function isModelOffered(provider, model, available) {
  return Boolean(findOfferedModel(provider, model, available));
}

export function recommendedModelsFor(provider, providerConfigs = PROVIDER_CONFIGS) {
  const config = providerConfigs[provider] || {};
  const list = config.recommendedModels || [config.defaultModel];
  return list.map(trimmed).filter(Boolean);
}

// Shown when a saved model is missing from the provider's live list.
export function modelMissingText(provider, providerConfigs = PROVIDER_CONFIGS) {
  const name = providerName(provider, providerConfigs);
  return LOCAL_PROVIDERS.has(provider)
    ? `This model isn't available on your ${name.replace(/\s*\(Local\)$/, '')} server. Choose another.`
    : `This model is no longer offered by ${name}. Choose another.`;
}

/**
 * The model to preselect from a provider's live list: the first curated
 * model it still offers, else the newest small/fast-looking chat model, else
 * the first listed one. With no list at all, the curated default.
 * @param {string} provider
 * @param {Array<string|{id: string}>} available normalized list (newest first)
 */
export function pickDefaultModel(provider, available, providerConfigs = PROVIDER_CONFIGS) {
  const recommended = recommendedModelsFor(provider, providerConfigs);
  const ids = idsOf(available);
  if (!ids.length) return recommended[0] || '';

  for (const model of recommended) {
    const offered = findOfferedModel(provider, model, ids);
    // Ollama: the installed tag. Elsewhere the curated id, also when the
    // list has only its dated snapshot (the alias stays valid).
    if (offered) return provider === 'ollama' ? offered : model;
  }

  // Ollama's ids are name:tag; only the name says what the model is.
  const nameOf = id => (provider === 'ollama' ? id.replace(/:[^:]*$/, '') : id);
  const candidates = ids.filter(id => isChatModelId(id) && !AVOID_PATTERN.test(nameOf(id)));
  return candidates.find(id => FAST_PATTERN.test(id)) || candidates[0] || ids.find(isChatModelId) || ids[0];
}

/**
 * Datalist choices: the recommended models the provider offers first
 * (labelled "Recommended"), then everything else.
 * @returns {Array<{ id: string, name: string, recommended: boolean }>}
 */
export function orderModelChoices(provider, models, providerConfigs = PROVIDER_CONFIGS) {
  const list = (Array.isArray(models) ? models : [])
    .map(model => (typeof model === 'string' ? { id: model } : model))
    .filter(model => trimmed(model?.id));
  const ids = list.map(model => model.id);
  // [listed id, id to offer]: the curated id, as pickDefaultModel() does.
  const recommended = [];
  for (const model of recommendedModelsFor(provider, providerConfigs)) {
    const offered = findOfferedModel(provider, model, ids);
    if (offered && !recommended.some(([listed]) => listed === offered)) {
      recommended.push([offered, provider === 'ollama' ? offered : model]);
    }
  }
  const listedRecommended = new Set(recommended.map(([listed]) => listed));
  const byId = new Map(list.map(model => [model.id, model]));
  return [
    ...recommended.map(([listed, id]) => ({ ...byId.get(listed), id, name: 'Recommended', recommended: true })),
    ...list
      .filter(model => !listedRecommended.has(model.id))
      .map(model => ({ ...model, name: trimmed(model.name) || model.id, recommended: false }))
  ];
}

// SHA-256 of the credential, so cached lists are keyed without the key itself.
async function credentialHash(provider, settings) {
  const credential = LOCAL_PROVIDERS.has(provider) ? trimmed(settings?.url).replace(/\/+$/, '') : trimmed(settings?.apiKey);
  const bytes = new TextEncoder().encode(`${provider}\n${credential}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

function memoryStorage() {
  const values = new Map();
  return {
    async get(key) {
      return values.has(key) ? { [key]: values.get(key) } : {};
    },
    async set(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    }
  };
}

// chrome.storage.session in extension pages (shared by the side panel and
// the settings page, cleared when the browser closes), memory elsewhere.
function defaultStorage() {
  return globalThis.chrome?.storage?.session || null;
}

export class ModelCatalog {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetchImpl] default: globalThis.fetch at call time
   * @param {{get: Function, set: Function}|null} [options.storage] default:
   *   chrome.storage.session when available, else memory
   * @param {() => number} [options.now]
   * @param {number} [options.timeoutMs]
   * @param {number} [options.ttlMs]
   * @param {object} [options.providerConfigs]
   */
  constructor({
    fetchImpl,
    storage,
    now = () => Date.now(),
    timeoutMs = MODEL_LIST_TIMEOUT_MS,
    ttlMs = MODEL_LIST_TTL_MS,
    providerConfigs = PROVIDER_CONFIGS
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.storage = storage;
    this.memory = memoryStorage();
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.ttlMs = ttlMs;
    this.providerConfigs = providerConfigs;
    // Entries written before this are ignored (clear()).
    this.clearedAt = { all: 0 };
    this.inFlight = new Map();
  }

  get store() {
    return this.storage === undefined ? defaultStorage() || this.memory : this.storage || this.memory;
  }

  // Makes the next list() for the provider (or every provider) fetch again.
  clear(provider = null) {
    if (provider) this.clearedAt[provider] = this.now();
    else this.clearedAt = { all: this.now() };
  }

  async readCache(provider, key) {
    try {
      const entry = (await this.store.get(key))?.[key];
      const cutoff = Math.max(this.clearedAt.all || 0, this.clearedAt[provider] || 0);
      if (!entry || !Array.isArray(entry.models)) return null;
      if (entry.fetchedAt < cutoff || this.now() - entry.fetchedAt >= this.ttlMs) return null;
      return entry.models;
    } catch {
      return null;
    }
  }

  async writeCache(key, models) {
    try {
      await this.store.set({ [key]: { models, fetchedAt: this.now() } });
    } catch {
      // A cache that can't be written only costs a refetch.
    }
  }

  /**
   * The provider's chat models (normalized, newest first).
   * @param {string} provider
   * @param {{apiKey?: string, url?: string}} settings
   * @param {{force?: boolean, signal?: AbortSignal}} [options]
   * @returns {Promise<{ models: Array<{id: string, name: string, created: number}>, fromCache: boolean }>}
   * @throws {ModelListError} status 0 for network failures and timeouts
   */
  async list(provider, settings = {}, { force = false, signal } = {}) {
    if (!this.providerConfigs[provider]) {
      throw new ModelListError(`Unsupported provider: ${provider}`);
    }
    const key = `${CACHE_PREFIX}${provider}:${await credentialHash(provider, settings)}`;
    if (!force) {
      const cached = await this.readCache(provider, key);
      if (cached) return { models: cached, fromCache: true };
      // Two callers asking at once share one request.
      if (this.inFlight.has(key)) return this.inFlight.get(key);
    }
    const request = this.fetchList(provider, settings, signal).then(async models => {
      await this.writeCache(key, models);
      return { models, fromCache: false };
    });
    this.inFlight.set(key, request);
    try {
      return await request;
    } finally {
      if (this.inFlight.get(key) === request) this.inFlight.delete(key);
    }
  }

  async fetchList(provider, settings, signal) {
    const name = providerName(provider, this.providerConfigs);
    const config = this.providerConfigs[provider];
    if (config.requiresApiKey && provider !== 'openrouter' && !trimmed(settings?.apiKey)) {
      throw new ModelListError(`Enter a ${name} API key to load its models.`);
    }
    const { url, headers } = buildModelListRequest(provider, settings, this.providerConfigs);
    const doFetch = this.fetchImpl || globalThis.fetch;
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      let response;
      try {
        response = await doFetch(url, { method: 'GET', headers, signal: controller.signal });
      } catch (error) {
        if (timedOut) throw new ModelListError(`${name} didn't answer in time.`);
        if (signal?.aborted) throw signal.reason ?? error;
        // The browser's message only; the request (and any key) stays out of it.
        throw new ModelListError(`Couldn't reach ${name}.`, { cause: error });
      }
      if (!response.ok) {
        throw new ModelListError(`${name} returned HTTP ${response.status}.`, { status: response.status });
      }
      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (timedOut) throw new ModelListError(`${name} didn't answer in time.`);
        throw new ModelListError(`${name} sent a model list that couldn't be read.`, { cause: error });
      }
      return normalizeModelList(provider, data);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

// Shared by the pages of one extension context.
export const modelCatalog = new ModelCatalog();
