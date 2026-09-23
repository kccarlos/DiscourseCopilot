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
    SESSION_UPDATED: 'sessionUpdated'
  },

  PROVIDER_CONFIGS: {
    openrouter: {
      name: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'moonshotai/kimi-k2',
      requiresApiKey: true
    },
    openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      requiresApiKey: true
    },
    anthropic: {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-sonnet-5',
      suggestedModels: ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5-5'],
      requiresApiKey: true
    },
    groq: {
      name: 'Groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: 'llama-3.1-8b-instant',
      requiresApiKey: true
    },
    gemini: {
      name: 'Google Gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: 'gemini-1.5-flash',
      requiresApiKey: true
    },
    ollama: {
      name: 'Ollama (Local)',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.2',
      requiresApiKey: false
    },
    xai: {
      name: 'xAI Grok',
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: 'grok-3',
      requiresApiKey: true
    },
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      defaultModel: 'deepseek-chat',
      requiresApiKey: true
    },
    lmstudio: {
      name: 'LM Studio (Local)',
      baseUrl: 'http://localhost:1234/v1',
      defaultModel: 'local-model',
      requiresApiKey: false
    }
  },

  API_CONFIG: {
    HEADERS: {
      TITLE: 'DiscourseCopilot'
    }
  }
};
