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

const NON_CONTEXT_LIMIT_PATTERN =
  /\b(?:rate[-_ ]limit(?:ed|s)?|too many requests|quota|billing|insufficient_quota|requests per (?:min|minute|sec|second|day|hour)|rpm|tpm|unauthorized|invalid[-_ ]?(?:api[-_ ]?)?key|authentication|permission denied)\b/i;

const TOKEN_LIMIT_PATTERN =
  /\b(?:context[-_ ]?(?:length|limit|window|size)|max(?:imum)?[-_ ]?(?:context|tokens?|completion[-_ ]tokens|input[-_ ]tokens|output[-_ ]tokens|prompt)|token[-_ ]?(?:limit|count|maximum)|too many tokens|tokens?\s*(?:>|exceed(?:s|ed)?)|exceed(?:s|ed)?\s+(?:the\s+)?max(?:imum)?|(?:prompt|input|message|content|request|text|payload)\s+(?:is\s+)?too\s+(?:long|large)|reduce\s+the\s+length|initial prompt|prompt is greater than|shorter input|channel error|request entity too large|no content generated)\b/i;

/**
 * Whether the error is related to token/context limits.
 */
export function isTokenLimitError(error) {
  if (!error) return false;

  // Check for explicit flag
  if (error.possibleTokenLimit) {
    DiscourseCopilotLogger.log('AI Service: Detected possible token limit (no content generated)');
    return true;
  }

  const status = Number(
    error.status
      || error.statusCode
      || error.lastError?.status
      || error.lastError?.statusCode
      || error.originalError?.status
      || error.originalError?.statusCode
      || error.originalError?.lastError?.status
      || error.originalError?.lastError?.statusCode
      || 0
  );
  if (status === 401 || status === 403 || status === 429) {
    return false;
  }

  const errorMsg = `${error.message?.toLowerCase() || ''} ${error.originalError?.message?.toLowerCase() || ''}`.trim();
  if (!errorMsg || NON_CONTEXT_LIMIT_PATTERN.test(errorMsg)) {
    return false;
  }

  const isTokenError = TOKEN_LIMIT_PATTERN.test(errorMsg);
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

const DISCOURSE_POST_SEPARATOR = /\n-{5,}[ \t]*(?:\n|$)/;

/**
 * Splits raw forum content into the OP and the replies. Posts in Discourse
 * raw output are separated by a line of dashes; WordPress and Reddit adapters
 * separate blocks by two blank lines (\n\n\n). The first block is the OP.
 */
export function parseForumContent(content) {
  if (!content) return { op: '', comments: [] };

  const separator = DISCOURSE_POST_SEPARATOR.test(content) ? /\n-{5,}[ \t]*(?:\n|$)/ : /\n{3,}/;
  const sections = content.split(separator);

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
