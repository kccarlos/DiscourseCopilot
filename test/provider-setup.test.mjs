import assert from 'node:assert/strict';
import test from 'node:test';

import { DiscourseCopilotConstants } from '../src/shared/constants.js';
import {
  PROVIDER_LINKS,
  RECOMMENDED_PROVIDERS,
  buildConnectionTest,
  normalizeProviderSettings,
  classifyConnectionFailure,
  defaultLocalUrl,
  describeSavedConfiguration,
  defaultProviderSettings,
  runConnectionTest,
  setupSuccessMessage,
  samplingOptions,
  suggestSetupModels,
  validateProviderSettings
} from '../src/shared/provider-setup.mjs';

const configs = DiscourseCopilotConstants.PROVIDER_CONFIGS;

test('every provider has a key or download link and recommended providers exist', () => {
  for (const provider of Object.keys(configs)) {
    assert.match(PROVIDER_LINKS[provider]?.url || '', /^https:\/\//, provider);
  }
  for (const provider of RECOMMENDED_PROVIDERS) {
    assert.ok(configs[provider], provider);
  }
  assert.equal(PROVIDER_LINKS.ollama.kind, 'download');
  assert.equal(PROVIDER_LINKS.openrouter.kind, 'key');
});

test('validation reports errors per field for inline display', () => {
  const hosted = validateProviderSettings('openai', { apiKey: ' ', model: '' }, configs);
  assert.equal(hosted.valid, false);
  assert.deepEqual(Object.keys(hosted.fieldErrors).sort(), ['apiKey', 'model']);
  assert.equal(hosted.fieldErrors.apiKey, 'OpenAI API key is required.');

  const local = validateProviderSettings('ollama', { url: 'ftp://x', model: 'llama3.2' }, configs);
  assert.deepEqual(local.fieldErrors, { url: 'Ollama (Local) server URL must use http or https.' });

  const unknown = validateProviderSettings('nope', {}, configs);
  assert.deepEqual(unknown.fieldErrors, { provider: 'Choose a supported AI provider.' });
});

test('defaultProviderSettings gives hosted providers an empty key and local ones their URL', () => {
  assert.deepEqual(defaultProviderSettings('openrouter', configs), { apiKey: '', model: 'openai/gpt-6-luna' });
  assert.deepEqual(defaultProviderSettings('ollama', configs), { url: 'http://localhost:11434', model: 'llama3.2' });
  assert.deepEqual(defaultProviderSettings('nope', configs), {});
  assert.equal(validateProviderSettings('openrouter', defaultProviderSettings('openrouter', configs), configs).valid, false);
  assert.equal(validateProviderSettings('ollama', defaultProviderSettings('ollama', configs), configs).valid, true);
});

test('local providers default to their server URL without the /v1 suffix', () => {
  assert.equal(defaultLocalUrl('ollama', configs), 'http://localhost:11434');
  assert.equal(defaultLocalUrl('lmstudio', configs), 'http://localhost:1234');
});

test('model suggestions start with the default and add that provider’s favorites', () => {
  const favorites = [
    { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },
    { provider: 'openai', model: 'gpt-5' },
    { provider: 'openrouter', model: 'moonshotai/kimi-k2' }
  ];
  assert.deepEqual(suggestSetupModels('openrouter', favorites, configs), [
    ...configs.openrouter.recommendedModels,
    'anthropic/claude-sonnet-4.5',
    'moonshotai/kimi-k2'
  ]);
  assert.deepEqual(suggestSetupModels('anthropic', null, configs), ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5-5']);
  assert.equal(configs.anthropic.defaultModel, 'claude-sonnet-5');
  // Suggestions without a curated list fall back to suggestedModels.
  assert.deepEqual(suggestSetupModels('x', [], { x: { defaultModel: 'a', suggestedModels: ['b', 'a'] } }), ['a', 'b']);
});

test('every provider’s default is the first of its curated models, cheap/fast tier first', () => {
  for (const [provider, config] of Object.entries(configs)) {
    assert.ok(Array.isArray(config.recommendedModels) && config.recommendedModels.length >= 1, provider);
    assert.equal(config.defaultModel, config.recommendedModels[0], provider);
    assert.equal(new Set(config.recommendedModels).size, config.recommendedModels.length, provider);
  }
  assert.deepEqual(configs.anthropic.suggestedModels, ['claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5-5']);
  // Retired or deprecated former defaults are gone.
  const all = Object.values(configs).flatMap(config => config.recommendedModels);
  for (const retired of ['gemini-1.5-flash', 'llama-3.1-8b-instant', 'grok-3', 'moonshotai/kimi-k2']) {
    assert.equal(all.includes(retired), false, retired);
  }
});

test('Anthropic and OpenAI reasoning requests leave sampling parameters to the model', () => {
  assert.deepEqual(samplingOptions({ provider: 'anthropic.messages', modelId: 'claude-sonnet-5' }, 0.7), { maxOutputTokens: 16000 });
  assert.deepEqual(samplingOptions({ provider: 'openai.responses', modelId: 'gpt-6-luna' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openai.responses', modelId: 'gpt-5.6-luna' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openai.responses', modelId: 'gpt-5.4-mini' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openai.responses', modelId: 'o3' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openai.responses', modelId: 'o4-mini' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openai.responses', modelId: 'o1' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'openai/gpt-6-luna' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'openai/gpt-6-luna:free' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'openai/o3-mini' }, 0.3), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'openai/o3-mini:high' }, 0.3), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'anthropic/claude-sonnet-5' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'anthropic/claude-sonnet-5.5' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'anthropic/claude-opus-5-5:beta' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'anthropic/claude-opus-4.7' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'anthropic/claude-opus-4.8:beta' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'deepseek/deepseek-r1:free' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'deepseek.chat', modelId: 'deepseek-reasoner' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'xai.chat', modelId: 'grok-3-mini' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'x-ai/grok-3-mini-beta' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'xai.chat', modelId: 'grok-4.3' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'openrouter', modelId: 'x-ai/grok-4.3:free' }, 0.7), {});
  assert.deepEqual(samplingOptions({ provider: 'xai.chat', modelId: 'grok-4.20-0309-non-reasoning' }, 0.7), { temperature: 0.7 });
  assert.deepEqual(samplingOptions({ provider: 'xai.chat', modelId: 'grok-3' }, 0.7), { temperature: 0.7 });
  assert.deepEqual(samplingOptions({ provider: 'openai.chat', modelId: 'gpt-4o-mini' }, 0.7), { temperature: 0.7 });
  assert.deepEqual(samplingOptions({ provider: 'openai.responses', modelId: 'gpt-5-chat-latest' }, 0.7), { temperature: 0.7 });
  assert.deepEqual(samplingOptions({ provider: 'groq.chat', modelId: 'openai/gpt-oss-20b' }, 0.5), { temperature: 0.5 });
  assert.deepEqual(samplingOptions({ provider: 'deepseek.chat', modelId: 'deepseek-flash' }, 0.5), { temperature: 0.5 });
  assert.deepEqual(samplingOptions({ provider: 'openrouter' }, 0.3), { temperature: 0.3 });
  assert.deepEqual(samplingOptions(null, 0.5), { temperature: 0.5 });
});

test('connection tests use each provider’s cheapest request shape', () => {
  const openrouter = buildConnectionTest('openrouter', { apiKey: 'k', model: 'm' }, configs, { TITLE: 'Forumind' });
  assert.equal(openrouter.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(openrouter.options.headers.Authorization, 'Bearer k');
  assert.equal(openrouter.options.headers['X-Title'], 'Forumind');
  assert.equal('HTTP-Referer' in openrouter.options.headers, false, 'no "undefined" referer header');
  assert.equal(JSON.parse(openrouter.options.body).max_tokens, 1);

  const openai = buildConnectionTest('openai', { apiKey: 'k', model: 'gpt-6-luna' }, configs);
  assert.equal(openai.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(openai.options.headers.Authorization, 'Bearer k');
  const openaiBody = JSON.parse(openai.options.body);
  assert.equal(openaiBody.max_completion_tokens, 16);
  assert.equal('max_tokens' in openaiBody, false, 'OpenAI reasoning models reject max_tokens');

  const anthropic = buildConnectionTest('anthropic', { apiKey: 'k', model: 'claude' }, configs);
  assert.equal(anthropic.options.headers['x-api-key'], 'k');
  assert.equal(JSON.parse(anthropic.options.body).max_tokens, 1);

  const ollama = buildConnectionTest('ollama', { url: 'http://localhost:11434', model: 'llama3.2' }, configs);
  assert.deepEqual([ollama.url, ollama.options.method], ['http://localhost:11434/api/tags', 'GET']);

  const lmstudio = buildConnectionTest('lmstudio', { url: 'http://box:8080', model: 'm' }, configs);
  assert.deepEqual([lmstudio.url, lmstudio.options.method], ['http://box:8080/v1/models', 'GET']);
  assert.equal('Authorization' in lmstudio.options.headers, false, 'no key, no Authorization header');
  const lmstudioKeyed = buildConnectionTest('lmstudio', { url: 'http://box:8080', apiKey: 'lan-key', model: 'm' }, configs);
  assert.equal(lmstudioKeyed.options.headers.Authorization, 'Bearer lan-key');

  const gemini = buildConnectionTest('gemini', { apiKey: 'a b', model: 'gemini-x' }, configs);
  assert.match(gemini.url, /models\/gemini-x:generateContent\?key=a%20b$/);
});

test('runConnectionTest resolves on success, retries token-limit parameter mismatches, and reports status and body on failure', async () => {
  const calls = [];
  const ok = async (url, options) => {
    calls.push([url, options.method]);
    return { ok: true, status: 200, text: async () => '' };
  };
  assert.equal(await runConnectionTest('openai', { apiKey: 'k', model: 'm' }, configs, { fetchImpl: ok }), true);
  assert.deepEqual(calls, [['https://api.openai.com/v1/chat/completions', 'POST']]);

  // If a /chat/completions provider rejects max_tokens: 1 in favor of max_completion_tokens, retry once with max_completion_tokens: 16.
  const retryPayloads = [];
  const needsCompletionTokens = async (_url, options) => {
    const parsed = JSON.parse(options.body);
    retryPayloads.push(parsed);
    if ('max_tokens' in parsed) {
      return {
        ok: false,
        status: 400,
        text: async () =>
          '{"error":{"message":"Unsupported parameter: \'max_tokens\' is not supported with this model. Use \'max_completion_tokens\' instead."}}'
      };
    }
    return { ok: true, status: 200, text: async () => '{}' };
  };
  assert.equal(
    await runConnectionTest('openrouter', { apiKey: 'k', model: 'openai/o3' }, configs, { fetchImpl: needsCompletionTokens }),
    true
  );
  assert.equal(retryPayloads.length, 2);
  assert.equal(retryPayloads[0].max_tokens, 1);
  assert.equal(retryPayloads[1].max_completion_tokens, 16);
  assert.equal('max_tokens' in retryPayloads[1], false);

  // If a /chat/completions provider requires max_tokens >= 16 (minimum value error), retry with max_tokens: 16.
  const minTokensPayloads = [];
  const needsMinMaxTokens = async (_url, options) => {
    const parsed = JSON.parse(options.body);
    minTokensPayloads.push(parsed);
    if (parsed.max_tokens < 16) {
      return {
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"Invalid \'max_tokens\': integer below minimum value. Expected a value >= 16, but got 1."}}'
      };
    }
    return { ok: true, status: 200, text: async () => '{}' };
  };
  assert.equal(
    await runConnectionTest('openrouter', { apiKey: 'k', model: 'openai/gpt-5' }, configs, { fetchImpl: needsMinMaxTokens }),
    true
  );
  assert.equal(minTokensPayloads.length, 2);
  assert.equal(minTokensPayloads[0].max_tokens, 1);
  assert.equal(minTokensPayloads[1].max_tokens, 16);
  assert.equal('max_completion_tokens' in minTokensPayloads[1], false);

  // If OpenAI rejects max_completion_tokens: 16 due to a higher minimum (e.g. >= 64), bump max_completion_tokens instead of switching back to max_tokens.
  const minCompletionTokensPayloads = [];
  const needsMinCompletionTokens = async (_url, options) => {
    const parsed = JSON.parse(options.body);
    minCompletionTokensPayloads.push(parsed);
    if (parsed.max_completion_tokens < 64) {
      return {
        ok: false,
        status: 400,
        text: async () =>
          '{"error":{"message":"Invalid \'max_completion_tokens\': integer below minimum value. Expected a value >= 64, but got 16."}}'
      };
    }
    return { ok: true, status: 200, text: async () => '{}' };
  };
  assert.equal(await runConnectionTest('openai', { apiKey: 'k', model: 'o3-pro' }, configs, { fetchImpl: needsMinCompletionTokens }), true);
  assert.equal(minCompletionTokensPayloads.length, 2);
  assert.equal(minCompletionTokensPayloads[0].max_completion_tokens, 16);
  assert.equal(minCompletionTokensPayloads[1].max_completion_tokens, 64);
  assert.equal('max_tokens' in minCompletionTokensPayloads[1], false);

  const unauthorized = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"Invalid API key"}}' });
  await assert.rejects(
    runConnectionTest('openai', { apiKey: 'k', model: 'm' }, configs, { fetchImpl: unauthorized }),
    error => error.status === 401 && /Invalid API key/.test(error.body) && /^HTTP 401/.test(error.message)
  );

  // Preserves >300-char JSON error bodies so structured fields at the end are not truncated.
  const longJsonBody = JSON.stringify({
    error: {
      message: `Unsupported parameter: 'max_tokens' is not supported with this model. ${'x'.repeat(280)}`,
      type: 'invalid_request_error',
      param: 'max_tokens',
      code: 'unsupported_parameter'
    }
  });
  assert.ok(longJsonBody.length > 350);
  await assert.rejects(
    runConnectionTest('openai', { apiKey: 'k', model: 'm' }, configs, {
      fetchImpl: async () => ({ ok: false, status: 400, text: async () => longJsonBody })
    }),
    error => {
      const classified = classifyConnectionFailure('openai', error, configs);
      return error.status === 400 && classified.field === null;
    }
  );

  const offline = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    runConnectionTest('ollama', { url: 'http://localhost:11434', model: 'x' }, configs, { fetchImpl: offline }),
    error => error.status === 0 && error.message === 'Failed to fetch'
  );
});

test('connection failures map to the field the user should fix', () => {
  const badKey = classifyConnectionFailure(
    'openrouter',
    { status: 401, body: '{"error":{"message":"No auth credentials found"}}' },
    configs
  );
  assert.equal(badKey.field, 'apiKey');
  assert.match(badKey.message, /didn't accept this API key.*No auth credentials found/);

  assert.equal(classifyConnectionFailure('openai', { status: 404, body: 'model not found' }, configs).field, 'model');
  assert.equal(
    classifyConnectionFailure('anthropic', { status: 400, body: '{"error":{"message":"model: claude-x"}}' }, configs).field,
    'model'
  );
  assert.equal(
    classifyConnectionFailure('openrouter', { status: 400, body: '{"error":{"message":"foo/bar is not a valid model ID"}}' }, configs)
      .field,
    'model'
  );
  assert.equal(
    classifyConnectionFailure(
      'openai',
      { status: 400, body: '{"error":{"message":"The model `gpt-foo` does not exist","code":"model_not_found"}}' },
      configs
    ).field,
    'model'
  );
  for (const modelErrorBody of [
    '{"error":{"message":"The model \'llama-3.1-8b-instant\' is deprecated"}}',
    '{"error":{"message":"Model \'xyz\' is not supported for chat completions"}}',
    '{"error":{"message":"models/gemini-x is not found for API version v1beta, or is not supported for generateContent"}}'
  ]) {
    assert.equal(
      classifyConnectionFailure('openai', { status: 400, body: modelErrorBody }, configs).field,
      'model',
      `should mark model field invalid for: ${modelErrorBody}`
    );
  }

  // Parameter and capability errors that mention "model" must not blame the model name.
  for (const body of [
    '{"error":{"message":"Unsupported parameter: \'max_tokens\' is not supported with this model. Use \'max_completion_tokens\' instead.","type":"invalid_request_error","param":"max_tokens","code":"unsupported_parameter"}}',
    'Unsupported parameter: ‘max_tokens’ is not supported with this model. Use ‘max_completion_tokens’ instead.',
    '{"error":{"message":"Unsupported value: \'temperature\' does not support 0.7 with this model. Only the default (1) value is supported."}}',
    '{"error":{"message":"This model does not support the max_tokens parameter."}}',
    '{"error":{"message":"Model gpt-5 does not support temperature."}}',
    '{"error":{"message":"Reasoning models do not support temperature."}}',
    '{"error":{"message":"This model only supports the default temperature value of 1."}}',
    '{"error":{"message":"temperature is not supported for reasoning models"}}',
    '{"error":{"message":"max_tokens is not supported for model gpt-6-luna"}}',
    '{"error":{"message":"max_tokens is deprecated for this model"}}'
  ]) {
    const classified = classifyConnectionFailure('openai', { status: 400, body }, configs);
    assert.equal(classified.field, null, `should not mark model field invalid for: ${body}`);
  }

  // OpenRouter metadata.raw upstream errors unwrap the inner message and code even when outer message is "Upstream error".
  const openrouterWrappedParam = classifyConnectionFailure(
    'openrouter',
    {
      status: 400,
      body: JSON.stringify({
        error: {
          message: 'Upstream error',
          code: 400,
          metadata: {
            raw: JSON.stringify({
              error: {
                message: "Unsupported parameter: 'max_tokens' is not supported with this model.",
                param: 'max_tokens',
                code: 'unsupported_parameter'
              }
            })
          }
        }
      })
    },
    configs
  );
  assert.equal(openrouterWrappedParam.field, null);
  assert.match(openrouterWrappedParam.message, /Unsupported parameter: 'max_tokens'/);

  const openrouterWrappedModel = classifyConnectionFailure(
    'openrouter',
    {
      status: 400,
      body: JSON.stringify({
        error: {
          message: 'Provider returned error',
          code: 400,
          metadata: {
            raw: JSON.stringify({
              error: {
                message: 'The model `gpt-nope` does not exist',
                param: 'model',
                code: 'model_not_found'
              }
            })
          }
        }
      })
    },
    configs
  );
  assert.equal(openrouterWrappedModel.field, 'model');
  assert.match(openrouterWrappedModel.message, /gpt-nope/);

  assert.equal(classifyConnectionFailure('openai', { status: 400, body: 'bad request' }, configs).field, null);
  assert.equal(classifyConnectionFailure('openai', { status: 402, body: '' }, configs).field, 'apiKey');
  assert.equal(classifyConnectionFailure('openai', { status: 500, body: '' }, configs).message, 'OpenAI returned an error (HTTP 500).');

  const offlineLocal = classifyConnectionFailure('ollama', { status: 0 }, configs);
  assert.equal(offlineLocal.field, 'url');
  assert.match(offlineLocal.message, /Can't reach Ollama/);
  assert.match(
    classifyConnectionFailure('ollama', { status: 403 }, configs).message,
    /refused the connection \(403\).*OLLAMA_ORIGINS=chrome-extension:\/\/\*/
  );
  assert.doesNotMatch(classifyConnectionFailure('lmstudio', { status: 403 }, configs).message, /OLLAMA_ORIGINS/);
  const lmstudioKey = classifyConnectionFailure('lmstudio', { status: 401, body: 'Unauthorized' }, configs);
  assert.equal(lmstudioKey.field, 'apiKey');
  assert.match(lmstudioKey.message, /API key.*Unauthorized/);
  assert.equal(classifyConnectionFailure('ollama', { status: 401 }, configs).field, 'url');
  assert.equal(classifyConnectionFailure('openai', { status: 0 }, configs).field, null);
});

test('the settings header only claims a saved configuration when it is usable', () => {
  assert.deepEqual(describeSavedConfiguration('openrouter', { apiKey: '', model: 'moonshotai/kimi-k2' }, configs), {
    valid: false,
    label: 'Status',
    text: 'Not set up yet — add an API key'
  });
  assert.equal(describeSavedConfiguration('ollama', { url: '', model: 'llama3.2' }, configs).text, 'Not set up yet — add a server URL');
  assert.deepEqual(describeSavedConfiguration('openai', { apiKey: 'k', model: ' gpt-4o-mini ' }, configs), {
    valid: true,
    label: 'Currently saved',
    text: 'OpenAI · gpt-4o-mini'
  });
});

test('setup success copy adapts to the current page', () => {
  assert.equal(setupSuccessMessage({ isForumTopic: true, isSupportedSite: true }), 'You’re set — press Create summary above.');
  assert.match(setupSuccessMessage({ isSupportedSite: true }), /Ask the forum above/);
  assert.equal(setupSuccessMessage(null), 'You’re set. Open a post on a Discourse forum, WordPress site or Reddit to get started.');
  assert.equal(
    setupSuccessMessage({ pageHidden: true }),
    'You’re set. Next, click the Forumind icon in your toolbar on a Discourse forum, WordPress site or Reddit.'
  );
  assert.equal(
    setupSuccessMessage({ isForumTopic: true, isSupportedSite: true, forumAccess: 'missing' }),
    'You’re set. Next, allow access to this forum below.'
  );
});

test('LM Studio settings take an optional API key; Ollama does not', () => {
  assert.deepEqual(defaultProviderSettings('lmstudio', configs), { url: 'http://localhost:1234', model: 'local-model', apiKey: '' });
  assert.deepEqual(normalizeProviderSettings('lmstudio', { url: 'http://box:8080/', apiKey: ' lan-key ', model: 'm' }), {
    model: 'm',
    url: 'http://box:8080',
    apiKey: 'lan-key'
  });
  assert.equal('apiKey' in normalizeProviderSettings('ollama', { url: 'http://x', apiKey: 'k', model: 'm' }), false);
  // Empty is valid: the key is optional.
  assert.equal(validateProviderSettings('lmstudio', { url: 'http://box:8080', apiKey: '', model: 'm' }, configs).valid, true);
});
