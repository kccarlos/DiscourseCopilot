// How a topic summary is produced. AIService.generateSummary() tries a
// single pass first; when the provider reports a token/context limit (or
// returns too little) it falls back to the hierarchical strategy:
//
//   single pass ──token limit──▶ hierarchical
//                                  ├─ OP summary        ┐ in parallel
//                                  ├─ replies summary   ┘ (map-reduce halves
//                                  │                      while too long)
//                                  └─ final assembly (streamed), or a plain
//                                     concatenation when that fails
//
// Every request retries with halved content on a token-limit error and
// switches to the minimal prompts when the prompt itself is too large.
import { generateText, streamText } from 'ai';
import { FULL_PROMPTS, getHierarchicalPrompt, getMinimalPromptFor, getPrompt } from './prompts.js';
import { samplingOptions } from '../shared/provider-setup.mjs';
import { estimateTokens, isPromptTooLargeError, isTokenLimitError, parseForumContent, throwIfAborted } from './ai-errors.mjs';

export const DEFAULT_MAX_RETRIES = 3;

// Puts the "only part of the topic was provided" note before a request.
export function withNote(text, note) {
  return note ? `${note}\n\n${text}` : text;
}

/**
 * Single-pass summarization for content that fits in context.
 */
export async function singlePassSummary(
  model,
  content,
  { onStream, systemPrompt = getPrompt('system'), hasCustomSystemPrompt = false, abortSignal, forumName = '', coverageNote = '' } = {}
) {
  throwIfAborted(abortSignal);

  const source = typeof forumName === 'string' && forumName.trim() ? `forum discussion from ${forumName.trim()}` : 'forum discussion';
  const request = hasCustomSystemPrompt
    ? `Analyze the following ${source} according to the system instructions:`
    : `Please analyze and summarize this ${source}:`;
  const userContent = `${withNote(request, coverageNote)}\n\n${content}`;

  try {
    if (onStream) {
      const result = streamText({
        model,
        instructions: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        ...samplingOptions(model, 0.7),
        abortSignal,
        onError: error => {
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
        console.error('AI Service: Stream error:', streamError.message);
        lastStreamError = streamError;
        throwIfAborted(abortSignal);
        if (fullText.length === 0) {
          // No content received, throw the original error (preserves token limit info)
          throw streamError;
        }
        // Got partial content, log warning but return what we have
        console.warn('AI Service: Stream interrupted but got partial content');
      }

      // The SDK may finish without throwing but store an error.
      try {
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
        const errorToThrow = lastStreamError || new Error('No content generated - model may have context limit issues');
        // Add hint about token limits
        errorToThrow.possibleTokenLimit = true;
        throw errorToThrow;
      }
      throwIfAborted(abortSignal);
      return fullText;
    }
    const { text } = await generateText({
      model,
      instructions: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      ...samplingOptions(model, 0.7),
      abortSignal
    });
    throwIfAborted(abortSignal);
    return text;
  } catch (error) {
    throwIfAborted(abortSignal);
    console.error('AI Service: Single-pass summary error:', error);
    // Preserve original error for token limit detection
    const wrappedError = new Error(`Failed to generate summary: ${error.message}`);
    wrappedError.originalError = error;
    wrappedError.message = error.message; // Keep original message for detection
    throw wrappedError;
  }
}

/**
 * Hierarchical summarization for long content: the OP and the replies are
 * summarized in parallel, then combined into the final summary (streamed).
 */
export async function hierarchicalSummary(
  model,
  content,
  {
    onProgress,
    onStream,
    customSystemPrompt = '',
    abortSignal,
    operationState = { useMinimalPrompts: false },
    maxRetries = DEFAULT_MAX_RETRIES
  } = {}
) {
  throwIfAborted(abortSignal);
  const { op, comments } = parseForumContent(content);
  const language = operationState.responseLanguage;
  const opPrompt = getHierarchicalPrompt('op', customSystemPrompt, language);
  const commentsPrompt = getHierarchicalPrompt('comments', customSystemPrompt, language);
  const combinePrompt = getHierarchicalPrompt('combine', customSystemPrompt, language);
  const finalPrompt = getHierarchicalPrompt('final', customSystemPrompt, language);
  const retry = { abortSignal, operationState, maxRetries };

  console.log(`AI Service: Parsed content - OP length: ${op.length} chars, Comments: ${comments.length} items`);

  // If parsing produced no content, fall back to treating entire content as OP
  if (!op && comments.length === 0) {
    console.log('AI Service: Parsing produced no results, summarizing with retry...');
    onProgress?.({ step: 'fallback', message: '📝 Summarizing content...' });
    return summarizeWithRetry(model, opPrompt, content, { ...retry, note: operationState.coverageNote });
  }

  const tasks = [];
  if (op && op.trim().length > 0) {
    onProgress?.({ step: 'op', message: '📝 Summarizing original post...' });
    tasks.push(summarizeWithRetry(model, opPrompt, op, retry).then(result => ({ type: 'op', result })));
  }
  if (comments.length > 0) {
    onProgress?.({ step: 'comments', message: `💬 Processing ${comments.length} comments...` });
    tasks.push(
      summarizeCommentsWithFallback(model, comments, {
        ...retry,
        onProgress,
        prompts: { commentsPrompt, combinePrompt }
      }).then(result => ({ type: 'comments', result }))
    );
  }

  // allSettled: a failed half still leaves the other one to work with.
  console.log(`AI Service: Running ${tasks.length} tasks in parallel...`);
  const settledResults = await Promise.allSettled(tasks);
  throwIfAborted(abortSignal);

  let opSummary = '';
  let commentsSummary = '';
  const errors = [];
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

  if (!opSummary && !commentsSummary) {
    throw new Error(`All summarization tasks failed: ${errors.join(', ')}`);
  }
  if (errors.length > 0) {
    console.warn(`AI Service: Partial success - ${errors.length} task(s) failed, continuing with available content`);
  }

  onProgress?.({ step: 'final', message: '✨ Assembling final summary...' });
  console.log('AI Service: Assembling final summary...');
  return assembleFinalSummary(model, opSummary, commentsSummary, {
    onStream,
    finalPrompt,
    abortSignal,
    coverageNote: operationState.coverageNote
  });
}

/**
 * Summarizes the replies at once, falling back to map-reduce when too long.
 */
export async function summarizeCommentsWithFallback(
  model,
  comments,
  { onProgress, prompts = {}, abortSignal, operationState = { useMinimalPrompts: false }, maxRetries = DEFAULT_MAX_RETRIES } = {}
) {
  throwIfAborted(abortSignal);
  const commentsText = comments.join('\n\n');
  const commentsPrompt = prompts.commentsPrompt || FULL_PROMPTS.comments;
  const combinePrompt = prompts.combinePrompt || FULL_PROMPTS.combine;

  try {
    console.log('AI Service: Attempting to summarize all comments...');
    return await summarizeWithRetry(model, commentsPrompt, commentsText, {
      abortSignal,
      operationState,
      maxRetries,
      note: operationState.coverageNote
    });
  } catch (error) {
    throwIfAborted(abortSignal);
    if (isTokenLimitError(error) && comments.length > 1) {
      console.log('AI Service: Comments too long, using parallel map-reduce...');
      onProgress?.({ step: 'map-reduce', message: '📊 Splitting comments for parallel processing...' });
      return mapReduceCommentsParallel(model, comments, {
        onProgress,
        prompts: { commentsPrompt, combinePrompt },
        abortSignal,
        operationState,
        maxRetries
      });
    }
    throw error;
  }
}

/**
 * Parallel map-reduce for replies: both halves at once, split further while
 * a half is still too long, then combined.
 */
export async function mapReduceCommentsParallel(
  model,
  comments,
  { onProgress, prompts = {}, abortSignal, operationState = { useMinimalPrompts: false }, maxRetries = DEFAULT_MAX_RETRIES } = {}
) {
  throwIfAborted(abortSignal);
  const commentsPrompt = prompts.commentsPrompt || FULL_PROMPTS.comments;
  const combinePrompt = prompts.combinePrompt || FULL_PROMPTS.combine;
  const retry = { abortSignal, operationState, maxRetries, note: operationState.coverageNote };

  if (comments.length === 0) return '';

  if (comments.length === 1) {
    return summarizeWithRetry(model, commentsPrompt, comments[0], retry);
  }

  const mid = Math.ceil(comments.length / 2);
  const firstHalf = comments.slice(0, mid);
  const secondHalf = comments.slice(mid);

  console.log(`AI Service: Parallel split ${comments.length} comments into ${firstHalf.length} + ${secondHalf.length}`);
  onProgress?.({ step: 'map-reduce', message: `📊 Processing ${firstHalf.length} + ${secondHalf.length} comments in parallel...` });

  const processHalf = async half => {
    try {
      return await summarizeWithRetry(model, commentsPrompt, half.join('\n\n'), retry);
    } catch (error) {
      throwIfAborted(abortSignal);
      if (isTokenLimitError(error) && half.length > 1) {
        return mapReduceCommentsParallel(model, half, {
          onProgress,
          prompts: { commentsPrompt, combinePrompt },
          abortSignal,
          operationState,
          maxRetries
        });
      }
      throw error;
    }
  };

  const [summary1, summary2] = await Promise.all([processHalf(firstHalf), processHalf(secondHalf)]);
  throwIfAborted(abortSignal);

  console.log('AI Service: Combining parallel chunk summaries...');
  const combinedInput = `**Part 1:**\n${summary1}\n\n---\n\n**Part 2:**\n${summary2}`;
  return summarizeWithRetry(model, combinePrompt, combinedInput, retry);
}

/**
 * One summarization request that retries on token-limit errors, halving the
 * content each time down to a minimum, and switches to the minimal prompts
 * when the system prompt itself is too large. `operationState` is shared by
 * one summary's requests, so the switch sticks for the rest of it.
 */
export async function summarizeWithRetry(
  model,
  systemPrompt,
  content,
  { attempt = 1, operationState = { useMinimalPrompts: false }, abortSignal, note = '', maxRetries = DEFAULT_MAX_RETRIES } = {}
) {
  throwIfAborted(abortSignal);
  if (!content || content.trim().length === 0) {
    console.warn('AI Service: Empty content, skipping summarization');
    return '';
  }

  const minContentLength = 300; // Don't reduce below this
  const estimatedTokens = estimateTokens(content);
  const useMinimalPrompts = Boolean(operationState.useMinimalPrompts);
  const promptType = useMinimalPrompts ? 'minimal' : 'full';
  const retry = { operationState, abortSignal, note, maxRetries };

  console.log(`AI Service: Attempt ${attempt}/${maxRetries} [${promptType}] - ${content.length} chars, ~${estimatedTokens} tokens`);

  const actualPrompt = useMinimalPrompts ? getMinimalPromptFor(systemPrompt, operationState.responseLanguage) : systemPrompt;

  try {
    const { text } = await generateText({
      model,
      instructions: actualPrompt,
      messages: [{ role: 'user', content: withNote(content, note) }],
      ...samplingOptions(model, 0.7),
      abortSignal
    });
    throwIfAborted(abortSignal);
    return text;
  } catch (error) {
    throwIfAborted(abortSignal);
    console.error(`AI Service: Attempt ${attempt} failed:`, error.message);

    if (isPromptTooLargeError(error) && !useMinimalPrompts) {
      console.log('AI Service: System prompt too large for model, switching to minimal prompts...');
      operationState.useMinimalPrompts = true;
      return summarizeWithRetry(model, systemPrompt, content, { ...retry, attempt: 1 });
    }

    if (isTokenLimitError(error) && attempt < maxRetries) {
      if (content.length > minContentLength) {
        const truncatedContent = content.substring(0, Math.floor(content.length / 2));
        console.log(`AI Service: Retrying with truncated content (${truncatedContent.length} chars)...`);
        return summarizeWithRetry(model, systemPrompt, truncatedContent, { ...retry, attempt: attempt + 1 });
      } else if (!useMinimalPrompts) {
        console.log('AI Service: Content minimal, trying with minimal prompts...');
        operationState.useMinimalPrompts = true;
        return summarizeWithRetry(model, systemPrompt, content, { ...retry, attempt: 1 });
      }
    }

    throw error;
  }
}

/**
 * The final summary from the OP summary and the replies analysis; a plain
 * concatenation when only one exists or the request fails.
 */
export async function assembleFinalSummary(
  model,
  opSummary,
  commentsSummary,
  { onStream, finalPrompt = FULL_PROMPTS.final, abortSignal, coverageNote = '' } = {}
) {
  throwIfAborted(abortSignal);
  if (!commentsSummary) {
    const result =
      opSummary + '\n\n## 💬 Community Response Analysis\n*No comments available.*\n\n## 🎯 Key Takeaways\n*Based on original post only.*';
    onStream?.(result);
    return result;
  }

  if (!opSummary) {
    const result = '## 📝 Original Post Summary\n*Original post not available.*\n\n' + commentsSummary;
    onStream?.(result);
    return result;
  }

  const combinedInput = withNote(
    `**ORIGINAL POST SUMMARY:**\n${opSummary}\n\n**COMMUNITY COMMENTS ANALYSIS:**\n${commentsSummary}`,
    coverageNote
  );

  try {
    if (onStream) {
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
        throwIfAborted(abortSignal);
        if (fullText.length === 0) {
          throw streamError;
        }
        // Got partial content, use what we have
      }

      if (fullText.length === 0) {
        throw new Error('No content generated');
      }
      throwIfAborted(abortSignal);
      return fullText;
    }
    const { text } = await generateText({
      model,
      instructions: finalPrompt,
      messages: [{ role: 'user', content: combinedInput }],
      ...samplingOptions(model, 0.7),
      abortSignal
    });
    throwIfAborted(abortSignal);
    return text;
  } catch (error) {
    throwIfAborted(abortSignal);
    console.error('AI Service: Final assembly error, using simple concatenation:', error);
    const fallback = `${opSummary}\n\n${commentsSummary}\n\n## 🎯 Key Takeaways\n*See summaries above for key insights.*`;
    onStream?.(fallback);
    return fallback;
  }
}
