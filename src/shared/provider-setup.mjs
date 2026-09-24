// Provider setup shared by the settings page and the side panel's first-run
// setup card: validation, "get a key" links, and the connection test.

export const LOCAL_PROVIDER_IDS = new Set(['ollama', 'lmstudio']);

// Shown as large choices in the side panel; every other provider is listed
// under "More providers".
// Ollama rejects requests from browser extensions unless they are allowed.
export const OLLAMA_ORIGINS_HINT = 'Start Ollama with OLLAMA_ORIGINS=chrome-extension://* so the extension can reach it.';

export const RECOMMENDED_PROVIDERS = Object.freeze(['openrouter', 'openai', 'anthropic', 'ollama']);

// Where to get an API key (hosted providers) or the local server (Ollama, LM Studio).
export const PROVIDER_LINKS = Object.freeze({
  openrouter: { url: 'https://openrouter.ai/keys', label: 'openrouter.ai/keys', kind: 'key' },
  openai: { url: 'https://platform.openai.com/api-keys', label: 'platform.openai.com', kind: 'key' },
  anthropic: { url: 'https://console.anthropic.com/', label: 'console.anthropic.com', kind: 'key' },
  groq: { url: 'https://console.groq.com/keys', label: 'console.groq.com', kind: 'key' },
  gemini: { url: 'https://aistudio.google.com/app/apikey', label: 'Google AI Studio', kind: 'key' },
  ollama: { url: 'https://ollama.ai', label: 'Download Ollama', kind: 'download' },
  xai: { url: 'https://console.x.ai', label: 'console.x.ai', kind: 'key' },
  deepseek: { url: 'https://platform.deepseek.com/api_keys', label: 'platform.deepseek.com', kind: 'key' },
  lmstudio: { url: 'https://lmstudio.ai', label: 'Download LM Studio', kind: 'download' }
});

// Short descriptions for the side panel's provider choices.
export const PROVIDER_BLURBS = Object.freeze({
  openrouter: 'Many models, one key',
  openai: 'GPT models',
  anthropic: 'Claude models',
  ollama: 'Runs on your computer'
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
  return LOCAL_PROVIDER_IDS.has(provider)
    ? { url: defaultLocalUrl(provider, providerConfigs), model: config.defaultModel }
    : { apiKey: '', model: config.defaultModel };
}

export function normalizeProviderSettings(provider, settings = {}) {
  const normalized = {
    model: typeof settings.model === 'string' ? settings.model.trim() : ''
  };

  if (LOCAL_PROVIDER_IDS.has(provider)) {
    normalized.url = typeof settings.url === 'string'
      ? settings.url.trim().replace(/\/+$/, '')
      : '';
  } else {
    normalized.apiKey = typeof settings.apiKey === 'string'
      ? settings.apiKey.trim()
      : '';
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
    fail('provider', 'Choose a supported AI provider.');
    return { valid: false, errors, fieldErrors, settings: normalized };
  }

  if (config.requiresApiKey && !normalized.apiKey) {
    fail('apiKey', `${config.name} API key is required.`);
  }

  if (LOCAL_PROVIDER_IDS.has(provider)) {
    if (!normalized.url) {
      fail('url', `${config.name} server URL is required.`);
    } else {
      try {
        const parsedUrl = new URL(normalized.url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          fail('url', `${config.name} server URL must use http or https.`);
        }
      } catch {
        fail('url', `${config.name} server URL is not valid.`);
      }
    }
  }

  if (!normalized.model) {
    fail('model', `${config.name} model is required.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
    settings: normalized
  };
}

// Model suggestions for the setup card: the provider default, its other
// suggested models, then favorites.
export function suggestSetupModels(provider, favoriteModels = [], providerConfigs = {}) {
  const models = [];
  const add = model => {
    const id = typeof model === 'string' ? model.trim() : '';
    if (id && !models.includes(id)) models.push(id);
  };
  add(providerConfigs[provider]?.defaultModel);
  for (const model of providerConfigs[provider]?.suggestedModels || []) add(model);
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
      max_tokens: 1,
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

// Sends one tiny request with the given settings. Throws ConnectionTestError
// with the HTTP status (0 for network failures) and the start of the body.
export async function runConnectionTest(provider, settings, providerConfigs, {
  apiHeaders = {},
  fetchImpl
} = {}) {
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
    const detail = (await response.text().catch(() => '')).slice(0, 300).trim();
    throw new ConnectionTestError(
      `HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      { status: response.status, body: detail }
    );
  }
  return true;
}

function providerErrorDetail(body) {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error;
    if (typeof message === 'string') return message.trim();
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return String(body).replace(/\s+/g, ' ').trim().slice(0, 160);
}

// Maps a failed connection test to the field the user should fix.
export function classifyConnectionFailure(provider, error, providerConfigs = {}) {
  const name = providerConfigs[provider]?.name || provider || 'The provider';
  const status = Number(error?.status) || 0;
  const detail = providerErrorDetail(error?.body);
  const withDetail = message => (detail ? `${message} (${detail})` : message);

  if (!status) {
    if (LOCAL_PROVIDER_IDS.has(provider)) {
      return {
        field: 'url',
        message: `Can't reach ${name} at this address. Make sure it is running and the URL is correct.`
      };
    }
    return {
      field: null,
      message: `Couldn't reach ${name}. Check your internet connection and try again.`
    };
  }
  if (status === 401 || status === 403) {
    return {
      field: LOCAL_PROVIDER_IDS.has(provider) ? 'url' : 'apiKey',
      message: withDetail(
        LOCAL_PROVIDER_IDS.has(provider)
          ? `${name} refused the request.${provider === 'ollama' ? ` ${OLLAMA_ORIGINS_HINT}` : ''}`
          : `${name} didn't accept this API key. Check it and try again.`
      )
    };
  }
  if (status === 404 || ((status === 400 || status === 422) && /model/i.test(detail))) {
    return {
      field: 'model',
      message: withDetail(`${name} doesn't recognize this model. Check the model name.`)
    };
  }
  if (status === 402) {
    return { field: 'apiKey', message: withDetail(`${name} says this account needs credits.`) };
  }
  if (status === 429) {
    return { field: null, message: withDetail(`${name} is rate limiting requests. Try again in a minute, or save without testing.`) };
  }
  return { field: null, message: withDetail(`${name} returned an error (HTTP ${status}).`) };
}

// What the settings page header says about the saved configuration.
export function describeSavedConfiguration(provider, settings, providerConfigs) {
  const config = providerConfigs?.[provider];
  const validation = validateProviderSettings(provider, settings || {}, providerConfigs);
  if (validation.valid) {
    return {
      valid: true,
      label: 'Currently saved',
      text: `${config.name} · ${validation.settings.model}`
    };
  }
  const missing = validation.fieldErrors.apiKey
    ? 'add an API key'
    : validation.fieldErrors.url
      ? 'add a server URL'
      : validation.fieldErrors.model
        ? 'choose a model'
        : 'choose a provider';
  return { valid: false, label: 'Status', text: `Not set up yet — ${missing}` };
}

// Success copy for the side panel's setup card, adapted to the page.
export function setupSuccessMessage(pageContext = {}) {
  if (pageContext?.forumAccess === 'missing') {
    return 'You’re set. Next, allow access to this forum below.';
  }
  if (pageContext?.isForumTopic) {
    return 'You’re set — press Create summary above.';
  }
  if (pageContext?.isDiscourse) {
    return 'You’re set — press Ask the forum above, or open any topic and press Create summary.';
  }
  if (pageContext?.pageHidden) {
    return 'You’re set. Next, click the DiscourseCopilot icon in your toolbar on a Discourse forum.';
  }
  return 'You’re set. Open a topic on any Discourse forum to get started.';
}

const ANTHROPIC_MAX_OUTPUT_TOKENS = 16000;

export function samplingOptions(model, temperature) {
  const providerId = typeof model?.provider === 'string' ? model.provider : '';
  // Current Claude models reject sampling parameters and think adaptively by
  // default; thinking counts toward max_tokens, so lift the SDK's 4096 default.
  return providerId === 'anthropic' || providerId.startsWith('anthropic.')
    ? { maxOutputTokens: ANTHROPIC_MAX_OUTPUT_TOKENS }
    : { temperature };
}
