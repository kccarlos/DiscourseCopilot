// The background's entry point to the AI providers (Vercel AI SDK): topic
// summaries, follow-up chat answers and Agent answers.
//
//   provider-config.js      provider → AI SDK model
//   summary-strategies.mjs  single pass, hierarchical fallback, retries
//   text-stream.mjs         streamed chat/Agent answers, system messages
//   ai-errors.mjs           cancellation and token-limit classification
import {
  FULL_PROMPTS,
  getPrompt,
  normalizeCustomSystemPrompt,
  resolveSummarySystemPrompt,
  buildCoverageNote
} from './prompts.js';
import { buildFollowUpMessages } from './chat-context.mjs';
import { buildAgentMessages } from './agent-context.mjs';
import { getModel } from './provider-config.js';
import { normalizeResponseLanguage } from '../shared/response-language.mjs';
import { estimateTokens, isTokenLimitError, throwIfAborted } from './ai-errors.mjs';
import { streamAnswer } from './text-stream.mjs';
import {
  DEFAULT_MAX_RETRIES,
  hierarchicalSummary,
  singlePassSummary,
  summarizeWithRetry
} from './summary-strategies.mjs';

export { toInstructionsAndMessages } from './text-stream.mjs';

export class AIService {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] - Replaces the global fetch for provider requests (tests)
   */
  constructor({ fetch } = {}) {
    this.maxRetries = DEFAULT_MAX_RETRIES;
    this.fetch = fetch;
  }

  getModel(provider, settings) {
    return getModel(provider, settings, { fetch: this.fetch });
  }

  /**
   * The full or minimal prompt of a type.
   */
  getPrompt(promptType, useMinimalPrompts = false) {
    return getPrompt(promptType, useMinimalPrompts);
  }

  /**
   * Generate summary using Vercel AI SDK with automatic fallback for long content
   * @param {string} provider - AI provider name
   * @param {string} content - Forum content to summarize
   * @param {object} settings - Provider settings (API keys, models, etc.)
   * @param {object} callbacks - Optional callbacks { onProgress, onStream, abortSignal }
   * @param {object} options - Summary options { systemPrompt, responseLanguage, forumName,
   *   coverage } — coverage (describeTopicCoverage()) says whether only the
   *   start of the topic was provided; the model is told so
   * @returns {Promise<string>} Generated summary
   */
  async generateSummary(provider, content, settings, callbacks = {}, options = {}) {
    const { onProgress, onStream, abortSignal } = callbacks;
    throwIfAborted(abortSignal);

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('Content is required and must be a non-empty string');
    }

    if (!provider || !settings) {
      throw new Error('Provider and settings are required');
    }

    console.log('AI Service: Provider:', provider);
    console.log('AI Service: API Key present:', !!settings.apiKey);
    const model = this.getModel(provider, settings);
    const configuredSystemPrompt = options.systemPrompt ?? settings.systemPrompt;
    const customSystemPrompt = normalizeCustomSystemPrompt(configuredSystemPrompt);
    const responseLanguage = normalizeResponseLanguage(
      options.responseLanguage ?? settings.responseLanguage
    );
    const systemPrompt = resolveSummarySystemPrompt(
      customSystemPrompt,
      FULL_PROMPTS.system,
      responseLanguage
    );
    // Goes in the user message, never the system prompt: getMinimalPromptFor()
    // matches system prompts exactly.
    const coverageNote = buildCoverageNote(options.coverage, 'summary');
    // Shared by this summary's requests (the switch to minimal prompts sticks).
    const operationState = { useMinimalPrompts: false, responseLanguage, coverageNote };
    const hierarchical = () => hierarchicalSummary(model, content, {
      onProgress,
      onStream,
      customSystemPrompt,
      abortSignal,
      operationState,
      maxRetries: this.maxRetries
    });

    const estimatedTokens = estimateTokens(content);
    console.log(`AI Service: Content length: ${content.length} chars, ~${estimatedTokens} tokens`);

    // Try single-pass first, fall back to hierarchical if token limit exceeded
    try {
      onProgress?.({ step: 'single-pass', message: '🚀 Generating summary...' });
      console.log('AI Service: Attempting single-pass summarization...');
      const result = await singlePassSummary(model, content, {
        onStream,
        systemPrompt,
        hasCustomSystemPrompt: Boolean(customSystemPrompt),
        abortSignal,
        forumName: options.forumName,
        coverageNote
      });

      if (!result || result.trim().length < 50) {
        console.warn('AI Service: Single-pass returned insufficient content, trying hierarchical...');
        return hierarchical();
      }
      return result;
    } catch (error) {
      throwIfAborted(abortSignal);
      console.error('AI Service: Single-pass failed:', error.message);
      if (isTokenLimitError(error)) {
        console.log('AI Service: Token limit hit, switching to hierarchical summarization...');
        onProgress?.({ step: 'hierarchical', message: '📊 Content too long, using hierarchical mode...' });
        return hierarchical();
      }
      throw error;
    }
  }

  /**
   * Stream an answer to a follow-up question about an already summarized post.
   *
   * @param {string} provider - AI provider name
   * @param {object} context - { content, summary, history, question }
   * @param {object} settings - Provider settings (API keys, models, etc.)
   * @param {object} callbacks - { onProgress, onStream, onError, abortSignal }
   * @returns {Promise<string>} Complete generated answer
   */
  async streamFollowUp(provider, context, settings, callbacks = {}) {
    const { onProgress, onStream, onError, abortSignal } = callbacks;
    throwIfAborted(abortSignal);

    if (!provider || !settings) {
      throw new Error('Provider and settings are required');
    }

    const messages = buildFollowUpMessages(context || {});
    const model = this.getModel(provider, settings);
    onProgress?.({ step: 'follow-up', message: 'Generating answer…' });
    return streamAnswer(model, {
      messages,
      temperature: 0.5,
      abortSignal,
      onStream,
      onError,
      emptyMessage: 'No follow-up answer was generated',
      logLabel: 'Follow-up'
    });
  }

  /**
   * Generate a forum-wide answer from a bounded, citation-addressable source set.
   * Forum content is framed as untrusted reference material by buildAgentMessages.
   */
  async generateAgentAnswer(provider, context, settings, callbacks = {}) {
    const { onProgress, onStream, onError, abortSignal } = callbacks;
    throwIfAborted(abortSignal);

    if (!provider || !settings) {
      throw new Error('Provider and settings are required');
    }

    const messages = buildAgentMessages(context || {});
    const model = this.getModel(provider, settings);
    onProgress?.({ step: 'agent-answer', message: 'Writing answer with sources…' });
    return streamAnswer(model, {
      messages,
      temperature: 0.3,
      abortSignal,
      onStream,
      onError,
      emptyMessage: 'No Agent answer was generated'
    });
  }

  /**
   * One summarization request with retries (see summary-strategies.mjs).
   */
  summarizeWithRetry(model, systemPrompt, content, retryState = {}) {
    return summarizeWithRetry(model, systemPrompt, content, {
      maxRetries: this.maxRetries,
      ...retryState
    });
  }
}
