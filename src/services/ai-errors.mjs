// Classifying provider failures and sizing content for the summary
// strategies (pure): cancellation, "prompt too large" and token/context
// limit errors, token estimates, and splitting a topic into OP + replies.

import { DiscourseCopilotLogger } from '../shared/logger.js';

/**
 * Preserves the caller's cancellation reason and stops fallback/retry work.
 */
export function throwIfAborted(abortSignal) {
  if (!abortSignal?.aborted) return;

  if (abortSignal.reason instanceof Error) {
    throw abortSignal.reason;
  }

  const error = new Error(typeof abortSignal.reason === 'string' ? abortSignal.reason : 'Operation was aborted');
  error.name = 'AbortError';
  throw error;
}

/**
 * Whether the error says the prompt itself is too large.
 */
export function isPromptTooLargeError(error) {
  const errorMsg = error.message?.toLowerCase() || '';
  return errorMsg.includes('initial prompt') || errorMsg.includes('prompt is greater than');
}

/**
 * Whether the error is related to token/context limits.
 */
export function isTokenLimitError(error) {
  // Check for explicit flag
  if (error.possibleTokenLimit) {
    DiscourseCopilotLogger.log('AI Service: Detected possible token limit (no content generated)');
    return true;
  }

  const errorMsg = `${error.message?.toLowerCase() || ''} ${error.originalError?.message?.toLowerCase() || ''}`;
  const isTokenError =
    errorMsg.includes('context')
    || errorMsg.includes('token')
    || errorMsg.includes('length')
    || errorMsg.includes('too long')
    || errorMsg.includes('maximum')
    || errorMsg.includes('limit')
    || errorMsg.includes('exceeded')
    || errorMsg.includes('channel') // LM Studio "Channel Error"
    || errorMsg.includes('initial prompt') // LM Studio specific
    || errorMsg.includes('shorter input') // LM Studio specific
    || errorMsg.includes('bad request') // Often indicates payload too large
    || errorMsg.includes('no content generated'); // Fallback when SDK doesn't propagate error

  if (isTokenError) {
    DiscourseCopilotLogger.log('AI Service: Detected token limit error:', errorMsg.substring(0, 200));
  }
  return isTokenError;
}

/**
 * Estimates the token count of text: Chinese ~1.5 chars/token, English and
 * other text ~4 chars/token, weighted by the mix.
 */
export function estimateTokens(text) {
  if (!text) return 0;

  // Count Chinese characters (CJK Unified Ideographs range)
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const otherChars = text.length - chineseChars;

  const chineseTokens = chineseChars / 1.5;
  const otherTokens = otherChars / 4;

  return Math.ceil(chineseTokens + otherTokens);
}

/**
 * Splits raw forum content into the OP and the replies. Posts in Discourse
 * raw output are separated by blank lines; the first post is the OP.
 */
export function parseForumContent(content) {
  if (!content) return { op: '', comments: [] };

  // Split by double newlines which typically separate posts
  const sections = content.split(/\n{3,}/);

  if (sections.length === 0) {
    return { op: content, comments: [] };
  }

  const op = sections[0].trim();
  const comments = sections
    .slice(1)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return { op, comments };
}
