// Reading the model's actions. The agent asks for one JSON object per turn
// ({"tool": ..., "arguments": {...}, "reason": ...}); models wrap it in code
// fences or prose, add a second object, send numbers where text belongs, or
// forget the "arguments" wrapper. parseAgentAction() takes what is usable,
// and planAgentStep() asks once more, with a correction, when nothing is.
import { CORRECTION_MESSAGE } from './agent-prompt.mjs';

export class AgentActionParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AgentActionParseError';
    this.code = code;
  }
}

/**
 * Every top-level `{…}` in the text, in order, found by balancing braces
 * (aware of strings and escapes, so braces inside an answer don't confuse it).
 */
export function balancedJsonObjects(text) {
  const results = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      // Quotes outside any object are prose ("it's a "quoted" word").
      inString = depth > 0;
    } else if (character === '{') {
      if (depth === 0) start = index;
      depth++;
    } else if (character === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        results.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return results;
}

function jsonObjectCandidates(text) {
  const candidates = [];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    candidates.push(match[1].trim());
    candidates.push(...balancedJsonObjects(match[1]));
  }
  candidates.push(...balancedJsonObjects(text));
  return candidates;
}

function parseObject(candidate) {
  try {
    const value = JSON.parse(candidate);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** A scalar the tools can use: text stays, numbers and booleans become text, lists are joined. */
export function coerceArgument(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(coerceArgument).join(', ');
  return JSON.stringify(value);
}

const TOOL_KEYS = ['tool', 'action', 'name'];
const ARGUMENT_KEYS = ['arguments', 'args', 'input', 'parameters'];
const META_KEYS = new Set([...TOOL_KEYS, ...ARGUMENT_KEYS, 'reason', 'thought', 'reasoning', 'answer', 'final_answer']);

function normalizeToolName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function toolNameOf(object) {
  for (const key of TOOL_KEYS) {
    if (typeof object[key] === 'string' && normalizeToolName(object[key])) {
      return normalizeToolName(object[key]);
    }
  }
  return '';
}

/**
 * The first usable action in a model reply.
 * @returns {{ tool: string, arguments: Record<string, string>, reason: string }}
 * @throws {AgentActionParseError} NO_OBJECT (no JSON object) or MISSING_TOOL
 */
export function parseAgentAction(text) {
  const objects = jsonObjectCandidates(String(text ?? ''))
    .map(parseObject)
    .filter(Boolean);
  if (!objects.length) {
    throw new AgentActionParseError('NO_OBJECT', 'The model did not reply with a JSON action.');
  }
  const object = objects.find(candidate => toolNameOf(candidate)) || null;
  if (!object) {
    throw new AgentActionParseError('MISSING_TOOL', "The model's action did not name a tool.");
  }
  const tool = toolNameOf(object);
  const args = {};
  const rawArguments = ARGUMENT_KEYS.map(key => object[key]).find(value => value !== undefined);
  if (rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
    for (const [key, value] of Object.entries(rawArguments)) {
      args[key] = coerceArgument(value);
    }
  } else if (rawArguments !== undefined && rawArguments !== null) {
    args.input = coerceArgument(rawArguments);
  } else {
    // {"tool": "search_forum", "query": "..."}: arguments beside the tool.
    for (const [key, value] of Object.entries(object)) {
      if (!META_KEYS.has(key)) {
        args[key] = coerceArgument(value);
      }
    }
  }
  if (tool === 'final_answer' && args.answer === undefined) {
    const answer = object.answer ?? object.final_answer;
    if (answer !== undefined) {
      args.answer = coerceArgument(answer);
    }
  }
  const reason = coerceArgument(object.reason ?? object.thought ?? object.reasoning ?? '')
    .trim()
    .slice(0, 400);
  return { tool, arguments: args, reason };
}

/**
 * Asks the model for the next action. A reply that can't be read gets one
 * more try with a correction; a second failure throws.
 * @param {object} options
 * @param {(messages: Array<{role: string, content: string}>) => Promise<string>} options.complete
 *   one model call over the conversation (system prompt handled by the caller)
 * @param {Array<{role: string, content: string}>} options.transcript
 * @returns {Promise<{ action: object, retried: boolean }>}
 */
export async function planAgentStep({ complete, transcript }) {
  const reply = await complete(transcript);
  try {
    return { action: parseAgentAction(reply), retried: false };
  } catch (error) {
    if (!(error instanceof AgentActionParseError)) {
      throw error;
    }
    const corrected = await complete([
      ...transcript,
      { role: 'assistant', content: String(reply ?? '').slice(0, 4000) },
      CORRECTION_MESSAGE
    ]);
    try {
      return { action: parseAgentAction(corrected), retried: true };
    } catch (secondError) {
      if (secondError instanceof AgentActionParseError) {
        throw new AgentActionParseError(secondError.code, 'The model did not reply with a valid action, even after a correction.');
      }
      throw secondError;
    }
  }
}
