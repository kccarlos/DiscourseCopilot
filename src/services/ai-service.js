import { generateText, streamText } from 'ai';
import {
  FULL_PROMPTS,
  getPrompt,
  getMinimalPromptFor,
  getHierarchicalPrompt,
  normalizeCustomSystemPrompt,
  resolveSummarySystemPrompt
} from './prompts.js';
import { buildFollowUpMessages } from './chat-context.mjs';
import { buildAgentMessages } from './agent-context.mjs';
import { getModel } from './provider-config.js';
import { samplingOptions } from '../shared/provider-setup.mjs';
import { normalizeResponseLanguage } from '../shared/response-language.mjs';

/**
 * AI SDK 7 rejects system messages inside `messages`; the system prompt goes
 * in `instructions` instead. Splits the context builders' system messages off.
 */
export function toInstructionsAndMessages(messages = []) {
  const instructions = messages
    .filter(message => message.role === 'system')
    .map(message => message.content)
    .join('\n\n');
  return {
    instructions: instructions || undefined,
    messages: messages.filter(message => message.role !== 'system')
  };
}

/**
 * AI Service using Vercel AI SDK
 * Supports hierarchical summarization for long content
 */
export class AIService {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] - Replaces the global fetch for provider requests (tests)
   */
  constructor({ fetch } = {}) {
    this.maxRetries = 3;
    this.fetch = fetch;
  }

  getModel(provider, settings) {
    return getModel(provider, settings, { fetch: this.fetch });
  }

  /**
   * Get the appropriate prompt based on context size
   */
  getPrompt(promptType, useMinimalPrompts = false) {
    return getPrompt(promptType, useMinimalPrompts);
  }

  /**
   * Preserve the caller's cancellation reason and stop fallback/retry work.
   */
  throwIfAborted(abortSignal) {
    if (!abortSignal?.aborted) return;

    if (abortSignal.reason instanceof Error) {
      throw abortSignal.reason;
    }

    const error = new Error(
      typeof abortSignal.reason === 'string'
        ? abortSignal.reason
        : 'Operation was aborted'
    );
    error.name = 'AbortError';
    throw error;
  }

  /**
   * Check if error indicates the prompt itself is too large
   */
  isPromptTooLargeError(error) {
    const errorMsg = (error.message?.toLowerCase() || '');
    return errorMsg.includes('initial prompt') || 
           errorMsg.includes('prompt is greater than');
  }

  /**
   * Check if error is related to token/context limits
   */
  isTokenLimitError(error) {
    // Check for explicit flag
    if (error.possibleTokenLimit) {
      console.log('AI Service: Detected possible token limit (no content generated)');
      return true;
    }
    
    const errorMsg = (error.message?.toLowerCase() || '') + ' ' + (error.originalError?.message?.toLowerCase() || '');
    const isTokenError = errorMsg.includes('context') || 
           errorMsg.includes('token') || 
           errorMsg.includes('length') ||
           errorMsg.includes('too long') ||
           errorMsg.includes('maximum') ||
           errorMsg.includes('limit') ||
           errorMsg.includes('exceeded') ||
           errorMsg.includes('channel') ||  // LM Studio "Channel Error"
           errorMsg.includes('initial prompt') ||  // LM Studio specific
           errorMsg.includes('shorter input') ||  // LM Studio specific
           errorMsg.includes('bad request') ||  // Often indicates payload too large
           errorMsg.includes('no content generated');  // Fallback when SDK doesn't propagate error
    
    if (isTokenError) {
      console.log('AI Service: Detected token limit error:', errorMsg.substring(0, 200));
    }
    return isTokenError;
  }

  /**
   * Estimate token count from text
   * More accurate: Chinese ~1.5 chars/token, English ~4 chars/token
   * We detect language mix and use weighted average
   */
  estimateTokens(text) {
    if (!text) return 0;
    
    // Count Chinese characters (CJK Unified Ideographs range)
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    // Chinese: ~1.5 chars per token, English/other: ~4 chars per token
    const chineseTokens = chineseChars / 1.5;
    const otherTokens = otherChars / 4;
    
    return Math.ceil(chineseTokens + otherTokens);
  }

  /**
   * Parse raw forum content to separate OP from comments
   * Discourse raw format typically has posts separated by blank lines
   * First post is always the OP
   */
  parseForumContent(content) {
    if (!content) return { op: '', comments: [] };

    // Split by double newlines which typically separate posts
    const sections = content.split(/\n{3,}/);
    
    if (sections.length === 0) {
      return { op: content, comments: [] };
    }

    // First section is the OP
    const op = sections[0].trim();
    
    // Rest are comments
    const comments = sections.slice(1)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return { op, comments };
  }

  /**
   * Generate summary using Vercel AI SDK with automatic fallback for long content
   * @param {string} provider - AI provider name
   * @param {string} content - Forum content to summarize
   * @param {object} settings - Provider settings (API keys, models, etc.)
   * @param {object} callbacks - Optional callbacks { onProgress, onStream, abortSignal }
   * @param {object} options - Summary options { systemPrompt, responseLanguage, forumName }
   * @returns {Promise<string>} Generated summary
   */
  async generateSummary(provider, content, settings, callbacks = {}, options = {}) {
    const { onProgress, onStream, abortSignal } = callbacks;
    this.throwIfAborted(abortSignal);
    
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
    const operationState = { useMinimalPrompts: false, responseLanguage };
    
    const estimatedTokens = this.estimateTokens(content);
    console.log(`AI Service: Content length: ${content.length} chars, ~${estimatedTokens} tokens`);

    // Try single-pass first, fall back to hierarchical if token limit exceeded
    try {
      onProgress?.({ step: 'single-pass', message: '🚀 Generating summary...' });
      console.log('AI Service: Attempting single-pass summarization...');
      const result = await this.singlePassSummary(
        model,
        content,
        onStream,
        systemPrompt,
        Boolean(customSystemPrompt),
        abortSignal,
        options.forumName
      );
      
      // Validate result
      if (!result || result.trim().length < 50) {
        console.warn('AI Service: Single-pass returned insufficient content, trying hierarchical...');
        return this.hierarchicalSummary(model, content, {
          onProgress,
          onStream,
          customSystemPrompt,
          abortSignal,
          operationState
        });
      }
      return result;
    } catch (error) {
      this.throwIfAborted(abortSignal);
      console.error('AI Service: Single-pass failed:', error.message);
      if (this.isTokenLimitError(error)) {
        console.log('AI Service: Token limit hit, switching to hierarchical summarization...');
        onProgress?.({ step: 'hierarchical', message: '📊 Content too long, using hierarchical mode...' });
        return this.hierarchicalSummary(model, content, {
          onProgress,
          onStream,
          customSystemPrompt,
          abortSignal,
          operationState
        });
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
    const {
      onProgress,
      onStream,
      onError,
      abortSignal
    } = callbacks;
    this.throwIfAborted(abortSignal);

    if (!provider || !settings) {
      throw new Error('Provider and settings are required');
    }

    const { instructions, messages } = toInstructionsAndMessages(
      buildFollowUpMessages(context || {})
    );
    const model = this.getModel(provider, settings);

    onProgress?.({ step: 'follow-up', message: 'Generating answer…' });

    let callbackError = null;
    const result = streamText({
      model,
      instructions,
      messages,
      ...samplingOptions(model, 0.5),
      abortSignal,
      onError: event => {
        callbackError = event?.error instanceof Error
          ? event.error
          : new Error(String(event?.error ?? event));
        console.error('AI Service: Follow-up stream error:', callbackError);
        onError?.(callbackError);
      }
    });

    let fullText = '';
    try {
      for await (const chunk of result.textStream) {
        fullText += chunk;
        onStream?.(chunk);
      }
    } catch (error) {
      const streamError = error instanceof Error ? error : new Error(String(error));
      if (streamError !== callbackError) {
        onError?.(streamError);
      }
      throw streamError;
    }

    this.throwIfAborted(abortSignal);
    if (callbackError) {
      throw callbackError;
    }
    if (!fullText.trim()) {
      throw new Error('No follow-up answer was generated');
    }

    return fullText;
  }

  /**
   * Generate a forum-wide answer from a bounded, citation-addressable source set.
   * Forum content is framed as untrusted reference material by buildAgentMessages.
   */
  async generateAgentAnswer(provider, context, settings, callbacks = {}) {
    const {
      onProgress,
      onStream,
      onError,
      abortSignal
    } = callbacks;
    this.throwIfAborted(abortSignal);

    if (!provider || !settings) {
      throw new Error('Provider and settings are required');
    }

    const { instructions, messages } = toInstructionsAndMessages(
      buildAgentMessages(context || {})
    );
    const model = this.getModel(provider, settings);
    onProgress?.({ step: 'agent-answer', message: 'Writing answer with sources…' });

    let callbackError = null;
    const result = streamText({
      model,
      instructions,
      messages,
      ...samplingOptions(model, 0.3),
      abortSignal,
      onError: event => {
        callbackError = event?.error instanceof Error
          ? event.error
          : new Error(String(event?.error ?? event));
        onError?.(callbackError);
      }
    });

    let fullText = '';
    try {
      for await (const chunk of result.textStream) {
        fullText += chunk;
        onStream?.(chunk);
      }
    } catch (error) {
      const streamError = error instanceof Error ? error : new Error(String(error));
      if (streamError !== callbackError) {
        onError?.(streamError);
      }
      throw streamError;
    }

    this.throwIfAborted(abortSignal);
    if (callbackError) {
      throw callbackError;
    }
    if (!fullText.trim()) {
      throw new Error('No Agent answer was generated');
    }
    return fullText;
  }

  /**
   * Single-pass summarization for content that fits in context
   */
  async singlePassSummary(
    model,
    content,
    onStream,
    systemPrompt = this.getPrompt('system'),
    hasCustomSystemPrompt = false,
    abortSignal,
    forumName = ''
  ) {
    this.throwIfAborted(abortSignal);

    const source = typeof forumName === 'string' && forumName.trim()
      ? `forum discussion from ${forumName.trim()}`
      : 'forum discussion';
    const userContent = hasCustomSystemPrompt
      ? `Analyze the following ${source} according to the system instructions:\n\n${content}`
      : `Please analyze and summarize this ${source}:\n\n${content}`;
    
    try {
      if (onStream) {
        // Use streaming
        const result = streamText({
          model,
          instructions: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          ...samplingOptions(model, 0.7),
          abortSignal,
          onError: (error) => {
            console.error('AI Service: Stream onError callback:', error);
          }
        });
        
        let fullText = '';
        let lastStreamError = null;
        try {
          for await (const chunk of result.textStream) {
            fullText += chunk;
            onStream(chunk);
          }
        } catch (streamError) {
          // Check if we got any content before the error
          console.error('AI Service: Stream error:', streamError.message);
          lastStreamError = streamError;
          this.throwIfAborted(abortSignal);
          if (fullText.length === 0) {
            // No content received, throw the original error (preserves token limit info)
            throw streamError;
          }
          // Got partial content, log warning but return what we have
          console.warn('AI Service: Stream interrupted but got partial content');
        }
        
        // Check if stream finished with error (SDK may not throw but store error)
        try {
          // Wait for the full response to check for errors
          const finalResult = await result;
          if (finalResult.error) {
            console.error('AI Service: Stream finished with error:', finalResult.error);
            lastStreamError = new Error(finalResult.error.message || String(finalResult.error));
          }
        } catch (finishError) {
          console.error('AI Service: Error checking stream result:', finishError.message);
          lastStreamError = finishError;
        }
        
        if (fullText.length === 0) {
          // Throw the original stream error if we have one, otherwise generic error
          const errorToThrow = lastStreamError || new Error('No content generated - model may have context limit issues');
          // Add hint about token limits
          errorToThrow.possibleTokenLimit = true;
          throw errorToThrow;
        }
        this.throwIfAborted(abortSignal);
        return fullText;
      } else {
        // Non-streaming
        const { text } = await generateText({
          model,
          instructions: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          ...samplingOptions(model, 0.7),
          abortSignal
        });
        this.throwIfAborted(abortSignal);
        return text;
      }
    } catch (error) {
      this.throwIfAborted(abortSignal);
      console.error('AI Service: Single-pass summary error:', error);
      // Preserve original error for token limit detection
      const wrappedError = new Error(`Failed to generate summary: ${error.message}`);
      wrappedError.originalError = error;
      wrappedError.message = error.message; // Keep original message for detection
      throw wrappedError;
    }
  }

  /**
   * Hierarchical summarization for long content
   * 1. Separate OP from comments
   * 2. Summarize OP and comments IN PARALLEL
   * 3. Combine all summaries with streaming
   */
  async hierarchicalSummary(model, content, callbacks = {}) {
    const {
      onProgress,
      onStream,
      customSystemPrompt = '',
      abortSignal,
      operationState = { useMinimalPrompts: false }
    } = callbacks;
    this.throwIfAborted(abortSignal);
    const { op, comments } = this.parseForumContent(content);
    const language = operationState.responseLanguage;
    const opPrompt = getHierarchicalPrompt('op', customSystemPrompt, language);
    const commentsPrompt = getHierarchicalPrompt('comments', customSystemPrompt, language);
    const combinePrompt = getHierarchicalPrompt('combine', customSystemPrompt, language);
    const finalPrompt = getHierarchicalPrompt('final', customSystemPrompt, language);
    
    console.log(`AI Service: Parsed content - OP length: ${op.length} chars, Comments: ${comments.length} items`);

    // If parsing produced no content, fall back to treating entire content as OP
    if (!op && comments.length === 0) {
      console.log('AI Service: Parsing produced no results, summarizing with retry...');
      onProgress?.({ step: 'fallback', message: '📝 Summarizing content...' });
      return this.summarizeWithRetry(model, opPrompt, content, {
        abortSignal,
        operationState
      });
    }

    // PARALLEL: Summarize OP and comments at the same time
    const tasks = [];
    
    // Task 1: Summarize OP
    if (op && op.trim().length > 0) {
      onProgress?.({ step: 'op', message: '📝 Summarizing original post...' });
      tasks.push(
        this.summarizeWithRetry(model, opPrompt, op, {
          abortSignal,
          operationState
        })
          .then(result => ({ type: 'op', result }))
      );
    }

    // Task 2: Handle comments
    if (comments.length > 0) {
      onProgress?.({ step: 'comments', message: `💬 Processing ${comments.length} comments...` });
      const commentsTask = this.summarizeCommentsWithFallback(
        model,
        comments,
        onProgress,
        { commentsPrompt, combinePrompt },
        abortSignal,
        operationState
      )
        .then(result => ({ type: 'comments', result }));
      tasks.push(commentsTask);
    }

    // Wait for all tasks to complete in parallel (use allSettled to handle partial failures)
    console.log(`AI Service: Running ${tasks.length} tasks in parallel...`);
    const settledResults = await Promise.allSettled(tasks);
    this.throwIfAborted(abortSignal);
    
    // Extract results, handling failures gracefully
    let opSummary = '';
    let commentsSummary = '';
    let errors = [];
    
    for (const settled of settledResults) {
      if (settled.status === 'fulfilled') {
        const { type, result } = settled.value;
        if (type === 'op') opSummary = result;
        if (type === 'comments') commentsSummary = result;
      } else {
        console.error('AI Service: Task failed:', settled.reason?.message);
        errors.push(settled.reason?.message || 'Unknown error');
      }
    }
    
    // If we got nothing at all, throw error
    if (!opSummary && !commentsSummary) {
      throw new Error(`All summarization tasks failed: ${errors.join(', ')}`);
    }
    
    // Log partial success
    if (errors.length > 0) {
      console.warn(`AI Service: Partial success - ${errors.length} task(s) failed, continuing with available content`);
    }

    // Step 3: Assemble final summary (with streaming if available)
    onProgress?.({ step: 'final', message: '✨ Assembling final summary...' });
    console.log('AI Service: Assembling final summary...');
    const finalSummary = await this.assembleFinalSummary(
      model,
      opSummary,
      commentsSummary,
      onStream,
      finalPrompt,
      abortSignal
    );
    
    return finalSummary;
  }

  /**
   * Summarize comments with automatic fallback to map-reduce
   */
  async summarizeCommentsWithFallback(
    model,
    comments,
    onProgress,
    prompts = {},
    abortSignal,
    operationState = { useMinimalPrompts: false }
  ) {
    this.throwIfAborted(abortSignal);
    const commentsText = comments.join('\n\n');
    const commentsPrompt = prompts.commentsPrompt || FULL_PROMPTS.comments;
    const combinePrompt = prompts.combinePrompt || FULL_PROMPTS.combine;
    
    try {
      console.log('AI Service: Attempting to summarize all comments...');
      return await this.summarizeWithRetry(
        model,
        commentsPrompt,
        commentsText,
        { abortSignal, operationState }
      );
    } catch (error) {
      this.throwIfAborted(abortSignal);
      if (this.isTokenLimitError(error) && comments.length > 1) {
        console.log('AI Service: Comments too long, using parallel map-reduce...');
        onProgress?.({ step: 'map-reduce', message: '📊 Splitting comments for parallel processing...' });
        return this.mapReduceCommentsParallel(
          model,
          comments,
          onProgress,
          { commentsPrompt, combinePrompt },
          abortSignal,
          operationState
        );
      }
      throw error;
    }
  }

  /**
   * Parallel map-reduce for comments: process halves simultaneously
   */
  async mapReduceCommentsParallel(
    model,
    comments,
    onProgress,
    prompts = {},
    abortSignal,
    operationState = { useMinimalPrompts: false }
  ) {
    this.throwIfAborted(abortSignal);
    const commentsPrompt = prompts.commentsPrompt || FULL_PROMPTS.comments;
    const combinePrompt = prompts.combinePrompt || FULL_PROMPTS.combine;

    if (comments.length === 0) return '';
    
    if (comments.length === 1) {
      return this.summarizeWithRetry(
        model,
        commentsPrompt,
        comments[0],
        { abortSignal, operationState }
      );
    }

    // Split comments in half
    const mid = Math.ceil(comments.length / 2);
    const firstHalf = comments.slice(0, mid);
    const secondHalf = comments.slice(mid);

    console.log(`AI Service: Parallel split ${comments.length} comments into ${firstHalf.length} + ${secondHalf.length}`);
    onProgress?.({ step: 'map-reduce', message: `📊 Processing ${firstHalf.length} + ${secondHalf.length} comments in parallel...` });

    // Process both halves in PARALLEL
    const processhalf = async (half, index) => {
      const halfText = half.join('\n\n');
      try {
        return await this.summarizeWithRetry(
          model,
          commentsPrompt,
          halfText,
          { abortSignal, operationState }
        );
      } catch (error) {
        this.throwIfAborted(abortSignal);
        if (this.isTokenLimitError(error) && half.length > 1) {
          // Recursively split this half further
          return this.mapReduceCommentsParallel(
            model,
            half,
            onProgress,
            { commentsPrompt, combinePrompt },
            abortSignal,
            operationState
          );
        }
        throw error;
      }
    };

    const [summary1, summary2] = await Promise.all([
      processhalf(firstHalf, 0),
      processhalf(secondHalf, 1)
    ]);
    this.throwIfAborted(abortSignal);

    // Combine the summaries
    console.log('AI Service: Combining parallel chunk summaries...');
    const combinedInput = `**Part 1:**\n${summary1}\n\n---\n\n**Part 2:**\n${summary2}`;
    return this.summarizeWithRetry(
      model,
      combinePrompt,
      combinedInput,
      { abortSignal, operationState }
    );
  }

  /**
   * Summarize content with automatic retry on token limit errors
   * Halves content on each retry until it succeeds or hits minimum
   * Switches to minimal prompts if system prompt is too large
   */
  async summarizeWithRetry(model, systemPrompt, content, retryState = {}) {
    const {
      attempt = 1,
      operationState = { useMinimalPrompts: false },
      abortSignal
    } = retryState;
    this.throwIfAborted(abortSignal);
    // Validate content is not empty
    if (!content || content.trim().length === 0) {
      console.warn('AI Service: Empty content, skipping summarization');
      return '';
    }

    const minContentLength = 300; // Don't reduce below this
    const estimatedTokens = this.estimateTokens(content);
    const useMinimalPrompts = Boolean(operationState.useMinimalPrompts);
    const promptType = useMinimalPrompts ? 'minimal' : 'full';
    
    console.log(`AI Service: Attempt ${attempt}/${this.maxRetries} [${promptType}] - ${content.length} chars, ~${estimatedTokens} tokens`);

    // Use current prompt setting
    const actualPrompt = useMinimalPrompts
      ? getMinimalPromptFor(systemPrompt, operationState.responseLanguage)
      : systemPrompt;

    try {
      const { text } = await generateText({
        model,
        instructions: actualPrompt,
        messages: [{ role: 'user', content }],
        ...samplingOptions(model, 0.7),
        abortSignal
      });
      this.throwIfAborted(abortSignal);
      return text;
    } catch (error) {
      this.throwIfAborted(abortSignal);
      console.error(`AI Service: Attempt ${attempt} failed:`, error.message);
      
      // If the prompt itself is too large, switch to minimal prompts
      if (this.isPromptTooLargeError(error) && !useMinimalPrompts) {
        console.log('AI Service: System prompt too large for model, switching to minimal prompts...');
        operationState.useMinimalPrompts = true;
        return this.summarizeWithRetry(model, systemPrompt, content, {
          attempt: 1,
          operationState,
          abortSignal
        });
      }
      
      // If it's a token limit error and we can retry
      if (this.isTokenLimitError(error) && attempt < this.maxRetries) {
        // Halve the content and retry
        if (content.length > minContentLength) {
          const halfLength = Math.floor(content.length / 2);
          const truncatedContent = content.substring(0, halfLength);
          console.log(`AI Service: Retrying with truncated content (${truncatedContent.length} chars)...`);
          return this.summarizeWithRetry(model, systemPrompt, truncatedContent, {
            attempt: attempt + 1,
            operationState,
            abortSignal
          });
        } else if (!useMinimalPrompts) {
          // Content is already minimal, try with minimal prompts
          console.log('AI Service: Content minimal, trying with minimal prompts...');
          operationState.useMinimalPrompts = true;
          return this.summarizeWithRetry(model, systemPrompt, content, {
            attempt: 1,
            operationState,
            abortSignal
          });
        }
      }
      
      throw error;
    }
  }

  /**
   * Assemble final summary from OP summary and comments analysis
   */
  async assembleFinalSummary(
    model,
    opSummary,
    commentsSummary,
    onStream,
    finalPrompt = FULL_PROMPTS.final,
    abortSignal
  ) {
    this.throwIfAborted(abortSignal);
    // If we only have OP or only have comments, format appropriately
    if (!commentsSummary) {
      const result = opSummary + '\n\n## 💬 Community Response Analysis\n*No comments available.*\n\n## 🎯 Key Takeaways\n*Based on original post only.*';
      onStream?.(result);
      return result;
    }
    
    if (!opSummary) {
      const result = '## 📝 Original Post Summary\n*Original post not available.*\n\n' + commentsSummary;
      onStream?.(result);
      return result;
    }

    // Combine both with final takeaways
    const combinedInput = `**ORIGINAL POST SUMMARY:**\n${opSummary}\n\n**COMMUNITY COMMENTS ANALYSIS:**\n${commentsSummary}`;
    
    try {
      if (onStream) {
        // Use streaming for final assembly
        const result = streamText({
          model,
          instructions: finalPrompt,
          messages: [{ role: 'user', content: combinedInput }],
          ...samplingOptions(model, 0.7),
          abortSignal
        });
        
        let fullText = '';
        try {
          for await (const chunk of result.textStream) {
            fullText += chunk;
            onStream(chunk);
          }
        } catch (streamError) {
          console.error('AI Service: Final assembly stream error:', streamError.message);
          this.throwIfAborted(abortSignal);
          if (fullText.length === 0) {
            throw streamError;
          }
          // Got partial content, use what we have
        }
        
        if (fullText.length === 0) {
          throw new Error('No content generated');
        }
        this.throwIfAborted(abortSignal);
        return fullText;
      } else {
        const { text } = await generateText({
          model,
          instructions: finalPrompt,
          messages: [{ role: 'user', content: combinedInput }],
          ...samplingOptions(model, 0.7),
          abortSignal
        });
        this.throwIfAborted(abortSignal);
        return text;
      }
    } catch (error) {
      this.throwIfAborted(abortSignal);
      // If final assembly fails, just concatenate the parts
      console.error('AI Service: Final assembly error, using simple concatenation:', error);
      const fallback = `${opSummary}\n\n${commentsSummary}\n\n## 🎯 Key Takeaways\n*See summaries above for key insights.*`;
      onStream?.(fallback);
      return fallback;
    }
  }

}
