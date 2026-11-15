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
  const errorMsg = `${error?.message || ''} ${error?.originalError?.message || ''}`.toLowerCase();
  return errorMsg.includes('initial prompt') || errorMsg.includes('prompt is greater than');
}

const REQUEST_PARAM_NAMES =
  '(?:max_tokens|max_completion_tokens|max_output_tokens|temperature|top_p|top_k|frequency_penalty|presence_penalty|reasoning_effort)';

const NON_CONTEXT_LIMIT_PATTERN = new RegExp(
  `\\b(?:rate[-_ ]limit(?:ed|s)?|too many requests|quota|billing|insufficient_quota|requests per (?:min|minute|sec|second|day|hour)|rpm|tpm|unauthorized|invalid[-_ ]?(?:api[-_ ]?)?key|authentication|permission denied|(?:unsupported|unknown|unrecognized|deprecated)[-_ ]?(?:request[-_ ]?)?(?:parameter|argument|value|field|option)|(?:invalid|unexpected)[-_ ]?(?:request[-_ ]?)?(?:parameter|field|option)\\b|${REQUEST_PARAM_NAMES}\\b[^.!?\\n]*?\\b(?:not (?:supported|allowed|permitted|valid|recognized)|is deprecated|is invalid|does not support|only supports)|(?:(?:does not|doesn't|do not|don't|cannot|can't) support|only supports|(?:invalid|unsupported|unknown|unrecognized|deprecated)\\s+(?:parameter|argument|value|field|option)?)\\b[^.!?\\n]*?['"\`‘’“”]?${REQUEST_PARAM_NAMES}\\b|invalid\\s+['"\`‘’“”]?${REQUEST_PARAM_NAMES}\\b|below minimum value|expected a value\\s*>=|must be at least)\\b`,
  'i'
);

const TOKEN_LIMIT_PATTERN =
  /\b(?:(?:context|prompt|input)[-_ ]?(?:length|limit|window|size)s?|max(?:imum)?[-_ ]?(?:context|tokens?|completion[-_ ]tokens|input[-_ ]tokens|output[-_ ]tokens|prompt)|token[-_ ]?(?:limit|count|maximum)|too many tokens|tokens?\s*(?:>|exceed(?:s|ed)?)|exceed(?:s|ed)?\s+(?:the\s+)?max(?:imum)?|(?:prompt|input|message|content|request|text|payload)\s+(?:is\s+)?too\s+(?:long|large)|(?:prompts?|inputs?|messages?)\s+(?:longer|larger)\s+than|reduce\s+the\s+length|initial prompt|prompt is greater than|shorter input|channel error|request entity too large|no content generated)\b/i;

const NON_CONTEXT_ERROR_CODES = new Set([
  'unsupported_parameter',
  'unsupported_value',
  'unknown_parameter',
  'invalid_value',
  'invalid_type',
  'model_not_found',
  'invalid_api_key',
  'insufficient_quota',
  'rate_limit_exceeded'
]);

/**
 * Whether the error is related to token/context limits.
 */
export function isTokenLimitError(error) {
  if (!error) return false;

  // Check for explicit flag
  if (error.possibleTokenLimit || error.originalError?.possibleTokenLimit) {
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

  const code =
    error.code
    || error.data?.error?.code
    || error.originalError?.code
    || error.originalError?.data?.error?.code
    || error.lastError?.code
    || error.lastError?.data?.error?.code
    || error.originalError?.lastError?.code
    || error.originalError?.lastError?.data?.error?.code;
  if (typeof code === 'string') {
    if (code === 'context_length_exceeded') return true;
    if (NON_CONTEXT_ERROR_CODES.has(code)) return false;
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
