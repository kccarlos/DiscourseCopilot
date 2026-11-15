// Provider setup shared by the settings page and the side panel's first-run
// setup card: validation, "get a key" links, and the connection test.
import { t } from './i18n.mjs';

export const LOCAL_PROVIDER_IDS = new Set(['ollama', 'lmstudio']);
// Local servers that may sit behind an optional API key (sent as
// `Authorization: Bearer <key>`); empty means no Authorization header.
export const OPTIONAL_KEY_PROVIDER_IDS = new Set(['lmstudio']);

// Shown as large choices in the side panel; every other provider is listed
// under "More providers".
// Ollama rejects requests from browser extensions unless they are allowed.
// The extension removes its Origin header from requests to local servers, so a 403 means
// the rule is not in effect (an old Ollama that checks more, or a proxy in between).
const ollamaOriginsHint = () => t('providerSetup.ollamaOrigins');

export const RECOMMENDED_PROVIDERS = Object.freeze(['openrouter', 'openai', 'anthropic', 'ollama']);

// Where to get an API key (hosted providers) or the local server (Ollama, LM Studio).
export const PROVIDER_LINKS = Object.freeze({
  openrouter: { url: 'https://openrouter.ai/keys', label: 'openrouter.ai/keys', kind: 'key' },
  openai: { url: 'https://platform.openai.com/api-keys', label: 'platform.openai.com', kind: 'key' },
  anthropic: { url: 'https://console.anthropic.com/', label: 'console.anthropic.com', kind: 'key' },
  groq: { url: 'https://console.groq.com/keys', label: 'console.groq.com', kind: 'key' },
  gemini: { url: 'https://aistudio.google.com/apikey', label: 'Google AI Studio', kind: 'key' },
  ollama: {
    url: 'https://ollama.ai',
    get label() {
      return t('providerSetup.downloadOllama');
    },
    kind: 'download'
  },
  xai: { url: 'https://console.x.ai', label: 'console.x.ai', kind: 'key' },
  deepseek: { url: 'https://platform.deepseek.com/api_keys', label: 'platform.deepseek.com', kind: 'key' },
  lmstudio: {
    url: 'https://lmstudio.ai',
    get label() {
      return t('providerSetup.downloadLmStudio');
    },
    kind: 'download'
  }
});

// Short descriptions for the side panel's provider choices.
export const PROVIDER_BLURBS = Object.freeze({
  get openrouter() {
    return t('providerSetup.blurb.openrouter');
  },
  get openai() {
    return t('providerSetup.blurb.openai');
  },
  get anthropic() {
    return t('providerSetup.blurb.anthropic');
  },
  get ollama() {
    return t('providerSetup.blurb.ollama');
  }
});

export function defaultLocalUrl(provider, providerConfigs) {
  const baseUrl = providerConfigs?.[provider]?.baseUrl || '';
  return baseUrl.replace(/\/v1$/, '');
}

// What a provider's settings look like before the user saves anything:
// hosted providers get an empty key, local ones their default server URL.
export function defaultProviderSettings(provider, providerConfigs) {
  const config = providerConfigs?.[provider];
  if (!config) return {};
  if (!LOCAL_PROVIDER_IDS.has(provider)) return { apiKey: '', model: config.defaultModel };
  const settings = { url: defaultLocalUrl(provider, providerConfigs), model: config.defaultModel };
  if (OPTIONAL_KEY_PROVIDER_IDS.has(provider)) settings.apiKey = '';
  return settings;
}

export function normalizeProviderSettings(provider, settings = {}) {
  const normalized = {
    model: typeof settings.model === 'string' ? settings.model.trim() : ''
  };

  if (LOCAL_PROVIDER_IDS.has(provider)) {
    normalized.url = typeof settings.url === 'string' ? settings.url.trim().replace(/\/+$/, '') : '';
  }
  if (!LOCAL_PROVIDER_IDS.has(provider) || OPTIONAL_KEY_PROVIDER_IDS.has(provider)) {
    normalized.apiKey = typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
  }

  return normalized;
}

// `errors` keeps the page-level messages; `fieldErrors` maps each message to
// the field it belongs to (apiKey, url, model, provider) for inline display.
export function validateProviderSettings(provider, settings, providerConfigs) {
  const config = providerConfigs?.[provider];
  const normalized = normalizeProviderSettings(provider, settings);
  const errors = [];
  const fieldErrors = {};
  const fail = (field, message) => {
    errors.push(message);
    fieldErrors[field] = message;
  };

  if (!config) {
    fail('provider', t('providerSetup.chooseProvider'));
    return { valid: false, errors, fieldErrors, settings: normalized };
  }

  if (config.requiresApiKey && !normalized.apiKey) {
    fail('apiKey', t('providerSetup.apiKeyRequired', { name: config.name }));
  }

  if (LOCAL_PROVIDER_IDS.has(provider)) {
    if (!normalized.url) {
      fail('url', t('providerSetup.urlRequired', { name: config.name }));
    } else {
      try {
        const parsedUrl = new URL(normalized.url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          fail('url', t('providerSetup.urlProtocol', { name: config.name }));
        }
      } catch {
        fail('url', t('providerSetup.urlInvalid', { name: config.name }));
      }
    }
  }

  if (!normalized.model) {
    fail('model', t('providerSetup.modelRequired', { name: config.name }));
  }

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
    settings: normalized
  };
}

// Model suggestions for the setup card before (or without) a live model
// list: the provider's curated models (default first), then favorites.
export function suggestSetupModels(provider, favoriteModels = [], providerConfigs = {}) {
  const models = [];
  const add = model => {
    const id = typeof model === 'string' ? model.trim() : '';
    if (id && !models.includes(id)) models.push(id);
  };
  add(providerConfigs[provider]?.defaultModel);
  const curated = providerConfigs[provider]?.recommendedModels || providerConfigs[provider]?.suggestedModels || [];
  for (const model of curated) add(model);
  for (const favorite of Array.isArray(favoriteModels) ? favoriteModels : []) {
    if (favorite?.provider === provider) add(favorite.model);
  }
  return models;
}

export function buildConnectionTest(provider, settings, providerConfigs, apiHeaders = {}) {
  const config = providerConfigs[provider];
  const headers = { 'Content-Type': 'application/json' };
  let url;
  let method = 'POST';
  let body;

  if (provider === 'ollama') {
    url = `${settings.url}/api/tags`;
    method = 'GET';
  } else if (provider === 'lmstudio') {
    url = `${settings.url}/v1/models`;
    method = 'GET';
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  } else if (provider === 'anthropic') {
    url = `${config.baseUrl}/messages`;
    headers['x-api-key'] = settings.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = JSON.stringify({
      model: settings.model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Test' }]
    });
  } else if (provider === 'gemini') {
    url = `${config.baseUrl}/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
    body = JSON.stringify({
      contents: [{ parts: [{ text: 'Test' }] }],
      generationConfig: { maxOutputTokens: 1 }
    });
  } else {
    url = `${config.baseUrl}/chat/completions`;
    headers.Authorization = `Bearer ${settings.apiKey}`;
    if (provider === 'openrouter') {
      if (apiHeaders.REFERER) headers['HTTP-Referer'] = apiHeaders.REFERER;
      if (apiHeaders.TITLE) headers['X-Title'] = apiHeaders.TITLE;
    }
    body = JSON.stringify({
      model: settings.model,
      ...(provider === 'openai' ? { max_completion_tokens: 16 } : { max_tokens: 1 }),
      messages: [{ role: 'user', content: 'Test' }]
    });
  }

  return { url, options: { method, headers, body } };
}

export class ConnectionTestError extends Error {
  constructor(message, { status = 0, body = '', cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ConnectionTestError';
    this.status = status;
    this.body = body;
  }
}

function buildTokenLimitFallbackBody(requestUrl, requestOptions, status, errorBody) {
  if (requestOptions?.method !== 'POST' || !String(requestUrl).endsWith('/chat/completions')) return null;
  if (status !== 400 && status !== 422) return null;
  if (isUnknownModelFailure(status, providerErrorInfo(errorBody))) return null;
  if (!/\b(?:max_tokens|max_completion_tokens|max_output_tokens|minimum value|expected a value\s*>=|must be at least)\b/i.test(errorBody)) {
    return null;
  }
  try {
    const payload = JSON.parse(requestOptions.body);
    if ('max_tokens' in payload) {
      if (
        /\bmax_completion_tokens\b/i.test(errorBody)
        || /\b(?:unsupported|unknown|unrecognized|deprecated)\b|\b(?:does not|doesn't|do not|don't|cannot|can't) support\b|\bnot (?:supported|allowed|permitted)\b/i.test(
          errorBody
        )
      ) {
        delete payload.max_tokens;
        payload.max_completion_tokens = 16;
        return JSON.stringify(payload);
      }
      if (
        typeof payload.max_tokens === 'number'
        && payload.max_tokens < 16
        && /\b(?:minimum value|expected a value\s*>=|must be at least)\b/i.test(errorBody)
      ) {
        payload.max_tokens = 16;
        return JSON.stringify(payload);
      }
      delete payload.max_tokens;
      payload.max_completion_tokens = 16;
      return JSON.stringify(payload);
    }
    if ('max_completion_tokens' in payload) {
      delete payload.max_completion_tokens;
      payload.max_tokens = 16;
      return JSON.stringify(payload);
    }
  } catch {
    // Request body was not JSON.
  }
  return null;
}

// Sends one tiny request with the given settings. Throws ConnectionTestError
// with the HTTP status (0 for network failures) and the response body.
export async function runConnectionTest(provider, settings, providerConfigs, { apiHeaders = {}, fetchImpl } = {}) {
  const request = buildConnectionTest(provider, settings, providerConfigs, apiHeaders);
  // Resolved per call so tests and the screenshot harness can replace fetch.
  const doFetch = fetchImpl || globalThis.fetch;
  let response;
  try {
    response = await doFetch(request.url, request.options);
  } catch (error) {
    throw new ConnectionTestError(error?.message || 'Network request failed', { cause: error });
  }
  if (!response.ok) {
    let rawBody = (await response.text().catch(() => '')).slice(0, 4096).trim();
    const fallbackBody = buildTokenLimitFallbackBody(request.url, request.options, response.status, rawBody);
    if (fallbackBody) {
      try {
        const retryResponse = await doFetch(request.url, { ...request.options, body: fallbackBody });
        if (retryResponse.ok) return true;
        response = retryResponse;
        rawBody = (await retryResponse.text().catch(() => '')).slice(0, 4096).trim();
      } catch {
        // Keep the original HTTP error if the fallback attempt fails at the network layer.
      }
    }
    const { detail } = providerErrorInfo(rawBody);
    throw new ConnectionTestError(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`, {
      status: response.status,
      body: rawBody
    });
  }
  return true;
}

function providerErrorInfo(body) {
  if (!body) return { detail: '', code: '', param: '', type: '' };
  try {
    const parsed = JSON.parse(body);
    const errObj = Array.isArray(parsed?.error) ? parsed.error[0] : parsed?.error;
    let message =
      typeof errObj?.message === 'string'
        ? errObj.message
        : typeof parsed?.message === 'string'
          ? parsed.message
          : typeof parsed?.error === 'string'
            ? parsed.error
            : '';
    let code = errObj?.code ?? parsed?.code ?? '';
    let param = typeof errObj?.param === 'string' ? errObj.param : typeof parsed?.param === 'string' ? parsed.param : '';
    let type = errObj?.type ?? parsed?.type ?? '';

    if (typeof errObj?.metadata?.raw === 'string') {
      try {
        const rawParsed = JSON.parse(errObj.metadata.raw);
        const rawErr = Array.isArray(rawParsed?.error) ? rawParsed.error[0] : (rawParsed?.error ?? rawParsed);
        if (rawErr && typeof rawErr === 'object') {
          if (
            typeof rawErr.message === 'string'
            && rawErr.message.trim()
            && (!message || /^provider returned error$/i.test(message.trim()))
          ) {
            message = rawErr.message;
          }
          if (rawErr.code != null && (!code || typeof code === 'number')) code = rawErr.code;
          if (!param && typeof rawErr.param === 'string') param = rawErr.param;
          if (!type && typeof rawErr.type === 'string') type = rawErr.type;
        }
      } catch {
        // Ignore non-JSON metadata.raw.
      }
    }

    if (typeof message === 'string' && message.trim()) {
      return {
        detail: message.replace(/\s+/g, ' ').trim().slice(0, 200),
        code: String(code ?? ''),
        param,
        type: String(type ?? '')
      };
    }
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return {
    detail: String(body).replace(/\s+/g, ' ').trim().slice(0, 200),
    code: '',
    param: '',
    type: ''
  };
}

// 400/422 errors that mention "model" while rejecting a request parameter,
// model capability, or context size rather than the model ID itself.
const NON_MODEL_PARAMETER_ERROR =
  /\b(?:(?:unsupported|unknown|unrecognized|invalid|unexpected|deprecated) (?:request )?(?:parameter|argument|value|field|option)|(?:parameter|argument|value|field|option)\b[^.!?\n]*?\b(?:not (?:supported|allowed|permitted|valid|recognized)|is deprecated|is invalid)|(?:model|models)\b[^.!?\n]*?\b(?:does not|doesn't|do not|don't|cannot|can't) support\b|(?:does not|doesn't|do not|don't|cannot|can't) support\b[^.!?\n]*?\b(?:with|for|by|on) (?:this |the |reasoning )?models?\b|\bonly supports\b|\bnot (?:supported|allowed|permitted) (?:with|for|by|on|in) (?:this |the |reasoning )?models?\b|\bis deprecated (?:with|for|by|on|in) (?:this |the |reasoning )?models?\b|\bbelow minimum value\b|\bexpected a value\s*>=|\b(?:temperature|top_p|top_k|max_tokens|max_completion_tokens|max_output_tokens|frequency_penalty|presence_penalty|reasoning_effort)\b|\bmaximum context length\b|\bcontext length exceeded\b|\btoo many tokens\b)/i;

const NON_MODEL_ERROR_CODES = new Set([
  'unsupported_parameter',
  'unsupported_value',
  'unknown_parameter',
  'invalid_value',
  'invalid_type',
  'context_length_exceeded'
]);

function isUnknownModelFailure(status, info) {
  if (status === 404) return true;
  if (status !== 400 && status !== 422) return false;
  const { detail, code, param } = info;
  if (code === 'model_not_found' || param === 'model') return true;
  if (NON_MODEL_ERROR_CODES.has(code) || (param && param !== 'model')) {
    return false;
  }
  if (!detail || NON_MODEL_PARAMETER_ERROR.test(detail)) return false;
  return /model/i.test(detail);
}

// Maps a failed connection test to the field the user should fix.
export function classifyConnectionFailure(provider, error, providerConfigs = {}) {
  const name = providerConfigs[provider]?.name || provider || t('providerSetup.theProvider');
  const status = Number(error?.status) || 0;
  const info = providerErrorInfo(error?.body);
  const { detail } = info;
  const withDetail = message => (detail ? `${message} (${detail})` : message);

  if (!status) {
    if (LOCAL_PROVIDER_IDS.has(provider)) {
      return {
        field: 'url',
        message: t('providerSetup.cantReachLocal', { name })
      };
    }
    return {
      field: null,
      message: t('providerSetup.cantReach', { name })
    };
  }
  if (OPTIONAL_KEY_PROVIDER_IDS.has(provider) && status === 401) {
    return { field: 'apiKey', message: withDetail(t('providerSetup.localKeyRejected', { name })) };
  }
  if (status === 401 || status === 403) {
    return {
      field: LOCAL_PROVIDER_IDS.has(provider) ? 'url' : 'apiKey',
      message: withDetail(
        LOCAL_PROVIDER_IDS.has(provider)
          ? provider === 'ollama'
            ? ollamaOriginsHint()
            : t('providerSetup.refused', { name })
          : t('providerSetup.keyRejected', { name })
      )
    };
  }
  if (isUnknownModelFailure(status, info)) {
    return {
      field: 'model',
      message: withDetail(t('providerSetup.modelUnknown', { name }))
    };
  }
  if (status === 402) {
    return { field: 'apiKey', message: withDetail(t('providerSetup.needsCredits', { name })) };
  }
  if (status === 429) {
    return { field: null, message: withDetail(t('providerSetup.rateLimited', { name })) };
  }
  return { field: null, message: withDetail(t('providerSetup.httpError', { name, status })) };
}

// What the settings page header says about the saved configuration.
export function describeSavedConfiguration(provider, settings, providerConfigs) {
  const config = providerConfigs?.[provider];
  const validation = validateProviderSettings(provider, settings || {}, providerConfigs);
  if (validation.valid) {
    return {
      valid: true,
      label: t('providerSetup.currentlySaved'),
      text: `${config.name} · ${validation.settings.model}`
    };
  }
  const missing = validation.fieldErrors.apiKey
    ? t('providerSetup.missing.apiKey')
    : validation.fieldErrors.url
      ? t('providerSetup.missing.url')
      : validation.fieldErrors.model
        ? t('providerSetup.missing.model')
        : t('providerSetup.missing.provider');
  return { valid: false, label: t('providerSetup.status'), text: t('providerSetup.notSetUp', { missing }) };
}

// Success copy for the side panel's setup card, adapted to the page.
export function setupSuccessMessage(pageContext = {}) {
  if (pageContext?.forumAccess === 'missing') {
    return t('providerSetup.success.missingAccess');
  }
  if (pageContext?.isForumTopic) {
    return t('providerSetup.success.topic');
  }
  if (pageContext?.isSupportedSite) {
    return t('providerSetup.success.forum');
  }
  if (pageContext?.pageHidden) {
    return t('providerSetup.success.hidden');
  }
  return t('providerSetup.success.default');
}

const ANTHROPIC_MAX_OUTPUT_TOKENS = 16000;

// Reasoning and fixed-temperature models (OpenAI o-series, codex, search-preview,
// GPT-5+ except explicit `gpt-*-chat*` variants, Claude adaptive-thinking models
// via OpenRouter, and DeepSeek R1/reasoner) reject or ignore custom `temperature`.
function isReasoningOrFixedTempModel(modelId) {
  if (typeof modelId !== 'string' || !modelId) return false;
  const bare = modelId
    .trim()
    .replace(/:.*$/, '')
    .replace(/^(?:openai|anthropic|deepseek)\//i, '')
    .toLowerCase();
  if (/^o\d+(?:-|$)/.test(bare) || /^codex(?:-|$)/.test(bare)) return true;
  if (bare.startsWith('gpt-4o-search-preview') || bare.startsWith('gpt-4o-mini-search-preview')) return true;
  if (/^claude-(?:sonnet-5|opus-5|fable-5|opus-4[.-][78])(?:[.-]|$)/.test(bare)) return true;
  if (/^deepseek-(?:r1|reasoner)(?:-|$)/.test(bare)) return true;
  const gptMatch = /^gpt-(\d+)(?:\.(\d+))?(?:-(.+))?$/.exec(bare);
  if (!gptMatch) return false;
  const major = Number(gptMatch[1]);
  const minor = gptMatch[2] == null ? undefined : Number(gptMatch[2]);
  const variant = gptMatch[3] || '';
  const isChatVariant = minor == null && variant.startsWith('chat');
  return major >= 5 && !isChatVariant;
}

export function samplingOptions(model, temperature) {
  const providerId = typeof model?.provider === 'string' ? model.provider : '';
  // Current Claude models reject sampling parameters and think adaptively by
  // default; thinking counts toward max_tokens, so lift the SDK's 4096 default.
  if (providerId === 'anthropic' || providerId.startsWith('anthropic.')) {
    return { maxOutputTokens: ANTHROPIC_MAX_OUTPUT_TOKENS };
  }
  if (isReasoningOrFixedTempModel(model?.modelId)) {
    return {};
  }
  return { temperature };
}
