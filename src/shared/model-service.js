// Model service for fetching available models from AI providers
export const DiscourseCopilotModels = {
  // Cache for model lists to avoid repeated API calls
  modelCache: {},
  cacheExpiry: 5 * 60 * 1000, // 5 minutes

  async getModels(provider, settings = {}) {
    console.log(`DiscourseCopilot Models: Loading models for ${provider}`);
    
    const cacheKey = `${provider}_${JSON.stringify(settings)}`;
    const cached = this.modelCache[cacheKey];
    
    // Return cached models if still valid
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      console.log(`DiscourseCopilot Models: Returning cached models for ${provider}:`, cached.models);
      return cached.models;
    }

    try {
      let models = [];
      
      console.log(`DiscourseCopilot Models: Fetching fresh models for ${provider}`);
      
      switch (provider) {
        case 'openrouter':
          models = await this.fetchOpenRouterModels(settings);
          break;
        case 'openai':
          models = await this.fetchOpenAIModels(settings);
          break;
        case 'anthropic':
          models = await this.fetchAnthropicModels(settings);
          break;
        case 'groq':
          models = await this.fetchGroqModels(settings);
          break;
        case 'gemini':
          models = await this.fetchGeminiModels(settings);
          break;
        case 'ollama':
          models = await this.fetchOllamaModels(settings);
          break;
        case 'xai':
          models = await this.fetchXaiModels(settings);
          break;
        case 'deepseek':
          models = await this.fetchDeepseekModels(settings);
          break;
        case 'lmstudio':
          models = await this.fetchLMStudioModels(settings);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      console.log(`DiscourseCopilot Models: Fetched ${models.length} models for ${provider}:`, models);

      // Cache the results
      this.modelCache[cacheKey] = {
        models,
        timestamp: Date.now()
      };

      return models;
      
    } catch (error) {
      console.error(`DiscourseCopilot Models: Error fetching models for ${provider}:`, error);
      throw error;
    }
  },

  async fetchOpenRouterModels(settings) {
    console.log('DiscourseCopilot Models: Fetching OpenRouter models');
    
    const headers = {
      'X-Title': 'DiscourseCopilot Extension'
    };
    
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }
    
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DiscourseCopilot Models: OpenRouter API error:', response.status, errorText);
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // // Filter and format models suitable for chat completion
    // const filteredModels = data.data
    //   .filter(model => 
    //     model.id.includes('gpt') || 
    //     model.id.includes('claude') || 
    //     model.id.includes('gemini') ||
    //     model.id.includes('llama') ||
    //     model.id.includes('kimi') ||
    //     model.id.includes('mixtral')
    //   )
    //   .map(model => ({
    //     id: model.id,
    //     name: model.name || model.id,
    //     description: model.description,
    //     context_length: model.context_length,
    //     pricing: model.pricing
    //   }))
    //   .sort((a, b) => a.name.localeCompare(b.name));
    return data.data;
  },

  async fetchOpenAIModels(settings) {
    if (!settings.apiKey) {
      throw new Error('API key required for OpenAI models');
    }

    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Filter for chat models only
    return data.data
      .filter(model => 
        model.id.includes('gpt') && 
        !model.id.includes('instruct') &&
        !model.id.includes('davinci') &&
        !model.id.includes('ada') &&
        !model.id.includes('babbage') &&
        !model.id.includes('curie')
      )
      .map(model => ({
        id: model.id,
        name: model.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        created: model.created,
        owned_by: model.owned_by
      }))
      .sort((a, b) => b.created - a.created); // Sort by newest first
  },

  async fetchAnthropicModels(settings) {
    if (!settings.apiKey) {
      throw new Error('API key required for Anthropic models');
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.data
        .filter(model => model.type === 'model')
        .map(model => ({
          id: model.id,
          name: model.display_name || model.id,
          created_at: model.created_at,
          type: model.type
        }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Sort by newest first
        
    } catch (error) {
      console.error('Failed to fetch Anthropic models:', error);
      throw error;
    }
  },

  async fetchGroqModels(settings) {
    if (!settings.apiKey) {
      throw new Error('API key required for Groq models');
    }

    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    
    return data.data
      .filter(model => model.active !== false)
      .map(model => ({
        id: model.id,
        name: model.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        created: model.created,
        owned_by: model.owned_by,
        context_window: model.context_window
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async fetchGeminiModels(settings) {
    const config = { baseUrl: 'https://generativelanguage.googleapis.com/v1beta' };
    
    try {
      const response = await fetch(`${config.baseUrl}/models?key=${settings.apiKey}`);
      
      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.models
        .filter(model => model.name.includes('gemini'))
        .map(model => ({
          id: model.name.replace('models/', ''),
          name: model.displayName || model.name.replace('models/', ''),
          description: model.description,
          version: model.version,
          inputTokenLimit: model.inputTokenLimit,
          outputTokenLimit: model.outputTokenLimit
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
        
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error);
      throw error;
    }
  },

  async fetchOllamaModels(settings) {
    const baseUrl = settings.url || 'http://localhost:11434';
    
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.models.map(model => ({
        id: model.name,
        name: model.name,
        size: model.size,
        modified_at: model.modified_at,
        digest: model.digest
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
      
    } catch (error) {
      console.error('Ollama not accessible:', error);
      throw error;
    }
  },

  async fetchXaiModels(settings) {
    if (!settings.apiKey) {
      throw new Error('API key required for xAI models');
    }

    const response = await fetch('https://api.x.ai/v1/models', {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`xAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    return data.data
      .filter(model => model.object === 'model')
      .map(model => ({
        id: model.id,
        name: model.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        created: model.created,
        owned_by: model.owned_by
      }))
      .sort((a, b) => b.created - a.created); // Sort by newest first
  },

  async fetchDeepseekModels(settings) {
    if (!settings.apiKey) {
      throw new Error('API key required for DeepSeek models');
    }

    const response = await fetch('https://api.deepseek.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return (data.data || [])
      .filter(model => model.id)
      .map(model => ({
        id: model.id,
        name: model.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        created: model.created,
        owned_by: model.owned_by,
        description: model.description
      }))
      .sort((a, b) => {
        if (a.name && b.name) {
          return a.name.localeCompare(b.name);
        }
        return a.id.localeCompare(b.id);
      });
  },

  async fetchLMStudioModels(settings) {
    const baseUrl = settings.url || 'http://localhost:1234';
    
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`LM Studio API error: ${response.status}`);
      }

      const data = await response.json();
      
      return (data.data || [])
        .map(model => ({
          id: model.id,
          name: model.id,
          owned_by: model.owned_by
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      
    } catch (error) {
      console.error('LM Studio not accessible:', error);
      throw error;
    }
  },

  // Clear cache for a specific provider or all providers
  clearCache(provider = null) {
    if (provider) {
      Object.keys(this.modelCache).forEach(key => {
        if (key.startsWith(provider)) {
          delete this.modelCache[key];
        }
      });
    } else {
      this.modelCache = {};
    }
  }
};
