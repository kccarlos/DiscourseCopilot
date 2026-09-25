// Streaming a chat-style answer from a provider (follow-up chat, Agent
// answers): the AI SDK call, chunk forwarding, and one error path for errors
// reported through the SDK's onError callback and errors thrown by the stream.
import { streamText } from 'ai';
import { samplingOptions } from '../shared/provider-setup.mjs';
import { throwIfAborted } from './ai-errors.mjs';

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
 * @param {object} model AI SDK language model
 * @param {object} request
 * @param {Array<{role: string, content: string}>} request.messages including system messages
 * @param {number} request.temperature
 * @param {AbortSignal} [request.abortSignal]
 * @param {(chunk: string) => void} [request.onStream]
 * @param {(error: Error) => void} [request.onError] called once per failure
 * @param {string} request.emptyMessage error message when nothing was generated
 * @param {string} [request.logLabel] logs stream errors under this label
 * @returns {Promise<string>} the complete text
 */
export async function streamAnswer(model, { messages, temperature, abortSignal, onStream, onError, emptyMessage, logLabel = '' }) {
  const split = toInstructionsAndMessages(messages);
  let callbackError = null;
  const result = streamText({
    model,
    instructions: split.instructions,
    messages: split.messages,
    ...samplingOptions(model, temperature),
    abortSignal,
    onError: event => {
      callbackError = event?.error instanceof Error ? event.error : new Error(String(event?.error ?? event));
      if (logLabel) {
        console.error(`AI Service: ${logLabel} stream error:`, callbackError);
      }
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

  throwIfAborted(abortSignal);
  if (callbackError) {
    throw callbackError;
  }
  if (!fullText.trim()) {
    throw new Error(emptyMessage);
  }
  return fullText;
}
