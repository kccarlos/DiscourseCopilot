// Provider → AI SDK model. Names, curated default models and whether a key
// is required come from PROVIDER_CONFIGS in constants.js; this file only
// knows how to create each provider's client.

import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOllama } from 'ollama-ai-provider-v2';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createXai } from '@ai-sdk/xai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { DiscourseCopilotConstants } from '../shared/constants.js';

const { PROVIDER_CONFIGS } = DiscourseCopilotConstants;

// createClient(settings, http) per provider; `http` carries a fetch override (tests).
const CLIENT_FACTORIES = {
  openai: (settings, http) => createOpenAI({ apiKey: settings.apiKey, ...http }),
  openrouter: (settings, http) => createOpenRouter({ apiKey: settings.apiKey, ...http }),
  // The SDK doesn't add Anthropic's browser (CORS) opt-in header itself.
  anthropic: (settings, http) =>
    createAnthropic({
      apiKey: settings.apiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      ...http
    }),
  groq: (settings, http) => createGroq({ apiKey: settings.apiKey, ...http }),
  gemini: (settings, http) => createGoogleGenerativeAI({ apiKey: settings.apiKey, ...http }),
  ollama: (settings, http) =>
    createOllama({
      baseURL: `${settings.url || 'http://localhost:11434'}/api`,
      ...http
    }),
  xai: (settings, http) => createXai({ apiKey: settings.apiKey, ...http }),
  deepseek: (settings, http) => createDeepSeek({ apiKey: settings.apiKey, ...http }),
  lmstudio: (settings, http) =>
    createOpenAICompatible({
      name: 'lmstudio',
      baseURL: `${settings.url || 'http://localhost:1234'}/v1`,
      ...http
    })
};

/**
 * Get the appropriate model instance based on provider and settings
 * @param {string} provider - Provider name
 * @param {object} settings - Provider settings (apiKey, model, url)
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] - Replaces the global fetch (tests)
 * @returns {object} Model instance
 * @throws {Error} If provider is unsupported or required API key is missing
 */
export function getModel(provider, settings, { fetch } = {}) {
  const config = PROVIDER_CONFIGS[provider];
  const createClient = CLIENT_FACTORIES[provider];

  if (!config || !createClient) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (config.requiresApiKey && !settings.apiKey) {
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    throw new Error(`${providerName} API key is required`);
  }

  const client = createClient(settings, fetch ? { fetch } : {});
  const modelName = settings.model || config.defaultModel;

  if (provider === 'lmstudio') {
    console.log('AI Service: Creating LM Studio client with URL:', settings.url || 'http://localhost:1234', 'model:', modelName);
  }

  return client(modelName);
}
