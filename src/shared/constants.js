// Curated models per provider, chosen to be cheap and fast (each provider's
// small/fast tier, good at summarizing long threads). The first is the
// default; the rest are fallbacks. These are only hints: once the user
// enters a key (or a local server URL), model-catalog.mjs reads the
// provider's live model list and pickDefaultModel() takes the first of these
// that the provider still offers, otherwise a small/fast-looking model from
// the list, so a retired default can't break setup. Saved models are never
// changed automatically.
//
// Sources (checked 2026-09-25):
//   openrouter  https://openrouter.ai/api/v1/models (public list): openai/gpt-6-luna,
//               1.05M context, $0.10/$0.50 per M tokens; fallbacks from the same list
//   openai      https://developers.openai.com/api/docs/models ("GPT-6 Luna: our most
//               efficient model") and .../docs/models/all
//   anthropic   https://platform.claude.com/docs/en/about-claude/models/overview (Haiku 4.5:
//               "fastest", $1/$5; retirement not sooner than 2026-10-15, so the live list
//               falls back to Sonnet 5 once it's gone)
//   groq        https://console.groq.com/docs/models and /docs/deprecations
//               (llama-3.1-8b-instant deprecated; gpt-oss-20b is the named replacement)
//   gemini      https://ai.google.dev/gemini-api/docs/models (stable; flash-lite is the
//               cost-effective tier)
//   ollama      https://ollama.com/library (popular small models; the live list is what
//               the user has installed)
//   xai         https://docs.x.ai/docs/models (grok-4.3: lowest price, 1M context)
//   deepseek    https://api-docs.deepseek.com/quick_start/pricing (deepseek-flash =
//               DeepSeek-V4.1-Flash; deepseek-chat is no longer documented)
//   lmstudio    none: whatever model the user has loaded ('local-model' is a placeholder)
const RECOMMENDED_MODELS = Object.freeze({
  openrouter: Object.freeze(['openai/gpt-6-luna', 'google/gemini-3.5-flash-lite', 'deepseek/deepseek-v4.1-flash']),
  openai: Object.freeze(['gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.4-mini']),
  anthropic: Object.freeze(['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5-5']),
  groq: Object.freeze(['openai/gpt-oss-20b', 'openai/gpt-oss-120b']),
  gemini: Object.freeze(['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']),
  ollama: Object.freeze(['llama3.2', 'qwen3', 'gemma3']),
  xai: Object.freeze(['grok-4.3', 'grok-4.20-0309-non-reasoning']),
  deepseek: Object.freeze(['deepseek-flash', 'deepseek-v4-pro']),
  lmstudio: Object.freeze(['local-model'])
});

// Shared constants across the extension
export const DiscourseCopilotConstants = {
  STORAGE_KEYS: {
    LEGACY_API_KEY: 'apiKey',
    PROVIDER: 'selectedProvider',
    OPENROUTER_API_KEY: 'openrouterApiKey',
    OPENROUTER_MODEL: 'openrouterModel',
    OPENAI_API_KEY: 'openaiApiKey',
    OPENAI_MODEL: 'openaiModel',
    ANTHROPIC_API_KEY: 'anthropicApiKey',
    ANTHROPIC_MODEL: 'anthropicModel',
    GROQ_API_KEY: 'groqApiKey',
    GROQ_MODEL: 'groqModel',
    GEMINI_API_KEY: 'geminiApiKey',
    GEMINI_MODEL: 'geminiModel',
    OLLAMA_URL: 'ollamaUrl',
    OLLAMA_MODEL: 'ollamaModel',
    XAI_API_KEY: 'xaiApiKey',
    XAI_MODEL: 'xaiModel',
    DEEPSEEK_API_KEY: 'deepseekApiKey',
    DEEPSEEK_MODEL: 'deepseekModel',
    LMSTUDIO_URL: 'lmstudioUrl',
    LMSTUDIO_MODEL: 'lmstudioModel',
    SYSTEM_PROMPT: 'systemPrompt',
    RESPONSE_LANGUAGE: 'responseLanguage',
    FORUM_CONTEXT_LIMIT: 'forumContextLimit',
    FAVORITE_MODELS: 'favoriteModels',
    PREFERENCES: 'preferences'
  },

  // Keys earlier versions wrote that nothing reads any more. They are only
  // removed on "Reset settings" so old installs do not keep stale data.
  LEGACY_STORAGE_KEYS: {
    EXTENSION_SETTINGS: 'extensionSettings'
  },

  MESSAGES: {
    GET_POST_ID: 'getPostId',
    PAGE_CHANGED: 'pageChanged',
    OPEN_SIDE_PANEL: 'openSidePanel',
    ENQUEUE_TASK: 'enqueueTask',
    CANCEL_TASK: 'cancelTask',
    LIST_TASKS: 'listTasks',
    TASK_HEARTBEAT: 'taskHeartbeat',
    TASK_UPDATED: 'taskUpdated',
    TASK_STREAM: 'taskStream',
    ACTIVITY_UPDATED: 'activityUpdated',
    RESUME_TASK: 'resumeTask',
    SESSION_UPDATED: 'sessionUpdated',
    SYNC_FORUM_ACCESS: 'syncForumAccess',
    ACTION_CLICKED: 'actionClicked'
  },

  // chrome.storage.session keys (cleared when the browser closes).
  SESSION_KEYS: {
    // Tabs where the toolbar icon was clicked (activeTab was granted), so
    // the panel can tell "not checked yet" from "checked, not a forum".
    ACTION_CLICKED_TABS: 'actionClickedTabs'
  },

  PROVIDER_CONFIGS: {
    openrouter: {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: RECOMMENDED_MODELS.openrouter[0],
      recommendedModels: RECOMMENDED_MODELS.openrouter,
      requiresApiKey: true
    },
    openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: RECOMMENDED_MODELS.openai[0],
      recommendedModels: RECOMMENDED_MODELS.openai,
      requiresApiKey: true
    },
    anthropic: {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: RECOMMENDED_MODELS.anthropic[0],
      recommendedModels: RECOMMENDED_MODELS.anthropic,
      // Known-good Claude IDs, offered even without a live model list.
      suggestedModels: RECOMMENDED_MODELS.anthropic,
      requiresApiKey: true
    },
    groq: {
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: RECOMMENDED_MODELS.groq[0],
      recommendedModels: RECOMMENDED_MODELS.groq,
      requiresApiKey: true
    },
    gemini: {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: RECOMMENDED_MODELS.gemini[0],
      recommendedModels: RECOMMENDED_MODELS.gemini,
      requiresApiKey: true
    },
    ollama: {
      name: 'Ollama (Local)',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: RECOMMENDED_MODELS.ollama[0],
      recommendedModels: RECOMMENDED_MODELS.ollama,
      requiresApiKey: false
    },
    xai: {
      name: 'xAI Grok',
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: RECOMMENDED_MODELS.xai[0],
      recommendedModels: RECOMMENDED_MODELS.xai,
      requiresApiKey: true
    },
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: RECOMMENDED_MODELS.deepseek[0],
      recommendedModels: RECOMMENDED_MODELS.deepseek,
      requiresApiKey: true
    },
    lmstudio: {
      name: 'LM Studio (Local)',
      baseUrl: 'http://localhost:1234/v1',
      defaultModel: RECOMMENDED_MODELS.lmstudio[0],
      recommendedModels: RECOMMENDED_MODELS.lmstudio,
      requiresApiKey: false
    }
  },

  API_CONFIG: {
    HEADERS: {
      TITLE: 'DiscourseCopilot'
    }
  }
};
