/**
 * Provider configuration for AI services
 * Centralizes provider setup to reduce repetition in ai-service.js
 */

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

// Curated defaults live in constants.js (with their sources).
const defaultModelOf = provider => DiscourseCopilotConstants.PROVIDER_CONFIGS[provider].defaultModel;

/**
 * Provider configuration map
 * Each provider has: create function, requiresApiKey, defaultModel, and optional setup
 */
const PROVIDER_CONFIG = {
  openai: {
    requiresApiKey: true,
    defaultModel: defaultModelOf('openai'),
    createClient: (settings, http) => createOpenAI({ apiKey: settings.apiKey, ...http })
  },
  openrouter: {
    requiresApiKey: true,
    defaultModel: defaultModelOf('openrouter'),
    createClient: (settings, http) => createOpenRouter({ apiKey: settings.apiKey, ...http })
  },
  anthropic: {
    requiresApiKey: true,
    defaultModel: defaultModelOf('anthropic'),
    // The SDK doesn't add Anthropic's browser (CORS) opt-in header itself.
    createClient: (settings, http) => createAnthropic({
      apiKey: settings.apiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      ...http
    })
  },
  groq: {
    requiresApiKey: true,
    defaultModel: defaultModelOf('groq'),
    createClient: (settings, http) => createGroq({ apiKey: settings.apiKey, ...http })
  },
  gemini: {
    requiresApiKey: true,
    defaultModel: defaultModelOf('gemini'),
    createClient: (settings, http) => createGoogleGenerativeAI({ apiKey: settings.apiKey, ...http })
  },
  ollama: {
    requiresApiKey: false,
    defaultModel: defaultModelOf('ollama'),
    createClient: (settings, http) => {
      const baseUrl = settings.url || 'http://localhost:11434';
      return createOllama({ baseURL: `${baseUrl}/api`, ...http });
    }
  },
  xai: {
    requiresApiKey: true,
    defaultModel: defaultModelOf('xai'),
    createClient: (settings, http) => createXai({ apiKey: settings.apiKey, ...http })
  },
  deepseek: {
    requiresApiKey: true,
    defaultModel: defaultModelOf('deepseek'),
    createClient: (settings, http) => createDeepSeek({ apiKey: settings.apiKey, ...http })
  },
  lmstudio: {
    requiresApiKey: false,
    defaultModel: defaultModelOf('lmstudio'),
    createClient: (settings, http) => {
      const baseUrl = settings.url || 'http://localhost:1234';
      return createOpenAICompatible({
        name: 'lmstudio',
        baseURL: `${baseUrl}/v1`,
        ...http
      });
    }
  }
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
  const config = PROVIDER_CONFIG[provider];
  
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  
  if (config.requiresApiKey && !settings.apiKey) {
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
    throw new Error(`${providerName} API key is required`);
  }
  
  const client = config.createClient(settings, fetch ? { fetch } : {});
  const modelName = settings.model || config.defaultModel;
  
  if (provider === 'lmstudio') {
    console.log('AI Service: Creating LM Studio client with URL:', settings.url || 'http://localhost:1234', 'model:', modelName);
  }
  
  return client(modelName);
}
