// Drives AIService through the real AI SDK and provider packages with a
// mocked fetch: checks the request each provider sends and that streamed
// (SSE) responses reach onStream, errors and aborts included.
import assert from 'node:assert/strict';
import test from 'node:test';

import { AIService, toInstructionsAndMessages } from '../src/services/ai-service.js';
import { FULL_PROMPTS, MINIMAL_PROMPTS } from '../src/services/prompts.js';

const encoder = new TextEncoder();

// Like a real fetch body, the stream errors with the abort reason when the
// request's signal aborts.
function sseResponse(events, { delayMs = 0, signal } = {}) {
  const body = new ReadableStream({
    async start(controller) {
      let aborted = false;
      signal?.addEventListener(
        'abort',
        () => {
          aborted = true;
          controller.error(signal.reason);
        },
        { once: true }
      );
      for (const event of events) {
        if (aborted) return;
        controller.enqueue(encoder.encode(event));
        if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      if (!aborted) controller.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function anthropicSse(chunks) {
  const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  return [
    event('message_start', {
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-5',
        content: [],
        stop_reason: null,
        usage: { input_tokens: 10, output_tokens: 1 }
      }
    }),
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
    ...chunks.map(text =>
      event('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text }
      })
    ),
    event('content_block_stop', { index: 0 }),
    event('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }),
    event('message_stop', {})
  ];
}

function anthropicMessage(text) {
  return {
    id: 'msg_2',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 }
  };
}

function chatCompletionsSse(chunks) {
  const chunk = (delta, finishReason = null) =>
    `data: ${JSON.stringify({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'test-model',
      choices: [{ index: 0, delta, finish_reason: finishReason }]
    })}\n\n`;
  return [
    ...chunks.map((content, index) => chunk(index === 0 ? { role: 'assistant', content } : { content })),
    chunk({}, 'stop'),
    'data: [DONE]\n\n'
  ];
}

// Records every request and answers with the handler's response.
function mockFetch(handler) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const request = {
      url: String(url),
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body ? JSON.parse(init.body) : undefined,
      signal: init.signal
    };
    requests.push(request);
    return handler(request, requests.length);
  };
  return { fetch, requests };
}

const followUpContext = {
  content: 'Original post: the release date moved to spring.',
  summary: 'The release moved to spring.',
  question: 'Why did it move?'
};

test('system messages move to instructions; other messages keep their order', () => {
  const { instructions, messages } = toInstructionsAndMessages([
    { role: 'system', content: 'Rules' },
    { role: 'user', content: 'Q1' },
    { role: 'assistant', content: 'A1' },
    { role: 'user', content: 'Q2' }
  ]);
  assert.equal(instructions, 'Rules');
  assert.deepEqual(
    messages.map(message => message.role),
    ['user', 'assistant', 'user']
  );
  assert.equal(toInstructionsAndMessages([{ role: 'user', content: 'x' }]).instructions, undefined);
});

test('Anthropic follow-up streams chunks; request has no temperature and max_tokens 16000', async () => {
  const { fetch, requests } = mockFetch(() => sseResponse(anthropicSse(['It moved ', 'because ', 'of testing.'])));
  const service = new AIService({ fetch });
  const streamed = [];

  const answer = await service.streamFollowUp(
    'anthropic',
    followUpContext,
    { apiKey: 'sk-ant-test', model: 'claude-sonnet-5' },
    { onStream: chunk => streamed.push(chunk) }
  );

  assert.equal(answer, 'It moved because of testing.');
  assert.deepEqual(streamed, ['It moved ', 'because ', 'of testing.']);
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(request.headers['x-api-key'], 'sk-ant-test');
  assert.equal(request.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(request.body.model, 'claude-sonnet-5');
  assert.equal(request.body.stream, true);
  assert.equal(request.body.max_tokens, 16000);
  assert.equal('temperature' in request.body, false);
  assert.equal('top_p' in request.body, false);
  // The system prompt travels in Anthropic's `system` field, not as a message.
  assert.match(JSON.stringify(request.body.system), /follow-up questions/);
  assert.ok(request.body.messages.every(message => message.role !== 'system'));
  assert.deepEqual(
    request.body.messages.map(message => message.role),
    ['user', 'assistant', 'user']
  );
});

test('Anthropic rule also applies to older Claude models the SDK would send temperature to', async () => {
  const { fetch, requests } = mockFetch(() => jsonResponse(anthropicMessage('Short summary of the part.')));
  const service = new AIService({ fetch });

  const text = await service.summarizeWithRetry(
    service.getModel('anthropic', { apiKey: 'k', model: 'claude-haiku-4-5' }),
    FULL_PROMPTS.op,
    'A post long enough to summarize.'
  );

  assert.equal(text, 'Short summary of the part.');
  assert.equal(requests[0].body.max_tokens, 16000);
  assert.equal('temperature' in requests[0].body, false);
  assert.equal(requests[0].body.stream, undefined);
});

test('OpenRouter follow-up streams through chat completions with temperature and a system message', async () => {
  const { fetch, requests } = mockFetch(() => sseResponse(chatCompletionsSse(['Because ', 'of QA.'])));
  const service = new AIService({ fetch });
  const streamed = [];

  const answer = await service.streamFollowUp(
    'openrouter',
    followUpContext,
    { apiKey: 'sk-or-test', model: 'moonshotai/kimi-k2' },
    { onStream: chunk => streamed.push(chunk) }
  );

  assert.equal(answer, 'Because of QA.');
  assert.deepEqual(streamed, ['Because ', 'of QA.']);
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(request.headers.authorization, 'Bearer sk-or-test');
  assert.equal(request.body.model, 'moonshotai/kimi-k2');
  assert.equal(request.body.stream, true);
  assert.equal(request.body.temperature, 0.5);
  assert.equal(request.body.messages[0].role, 'system');
  assert.match(JSON.stringify(request.body.messages[0].content), /follow-up questions/);
  assert.equal(request.body.messages.at(-1).content, 'Why did it move?');
});

test('Agent answers through LM Studio stream with temperature 0.3 and the source-framing system prompt', async () => {
  const { fetch, requests } = mockFetch(() => sseResponse(chatCompletionsSse(['Use X [S1].'])));
  const service = new AIService({ fetch });

  const answer = await service.generateAgentAnswer(
    'lmstudio',
    {
      question: 'Which tool should I use?',
      sources: [{ id: 'S1', title: 'Tools', url: 'https://forum.example.com/t/tools/1', excerpt: 'Use X.' }]
    },
    { url: 'http://localhost:1234', model: 'local-model' },
    {}
  );

  assert.equal(answer, 'Use X [S1].');
  assert.equal(requests[0].url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(requests[0].body.temperature, 0.3);
  assert.equal(requests[0].body.messages[0].role, 'system');
  assert.ok(requests[0].body.messages.slice(1).every(message => message.role !== 'system'));
});

test('Ollama keeps the /api base path', async () => {
  const { fetch, requests } = mockFetch(() =>
    jsonResponse({
      model: 'llama3.2',
      created_at: '2026-01-01T00:00:00Z',
      done: true,
      done_reason: 'stop',
      message: { role: 'assistant', content: 'Ollama summary.' },
      prompt_eval_count: 1,
      eval_count: 1
    })
  );
  const service = new AIService({ fetch });

  const text = await service.summarizeWithRetry(
    service.getModel('ollama', { url: 'http://localhost:11434', model: 'llama3.2' }),
    FULL_PROMPTS.op,
    'A post long enough to summarize.'
  );

  assert.equal(text, 'Ollama summary.');
  assert.equal(requests[0].url, 'http://localhost:11434/api/chat');
  assert.equal(requests[0].body.messages[0].role, 'system');
});

test('a context-limit error on the single pass falls back to hierarchical summarization', async () => {
  const { fetch, requests } = mockFetch((request, count) => {
    if (count === 1) {
      return jsonResponse(
        {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'prompt is too long: 250000 tokens > 200000 maximum' }
        },
        400
      );
    }
    if (request.body.stream) {
      return sseResponse(anthropicSse(['## Final ', 'summary']));
    }
    return jsonResponse(anthropicMessage(`Partial summary ${count}`));
  });
  const service = new AIService({ fetch });
  const streamed = [];
  const progress = [];

  const summary = await service.generateSummary(
    'anthropic',
    `Original post text.\n\n\n\nFirst reply.\n\n\n\nSecond reply.`,
    { apiKey: 'k', model: 'claude-sonnet-5' },
    { onStream: chunk => streamed.push(chunk), onProgress: step => progress.push(step.step) }
  );

  assert.equal(summary, '## Final summary');
  assert.deepEqual(streamed, ['## Final ', 'summary']);
  assert.ok(progress.includes('hierarchical'), progress.join(','));
  // single pass (failed) + OP + comments + streamed final assembly
  assert.equal(requests.length, 4);
  assert.deepEqual(
    requests.map(request => Boolean(request.body.stream)),
    [true, false, false, true]
  );
  for (const request of requests) {
    assert.equal(request.body.max_tokens, 16000);
    assert.equal('temperature' in request.body, false);
  }
});

test('a prompt-too-large error retries once with the minimal prompt', async () => {
  const { fetch, requests } = mockFetch((_request, count) =>
    count === 1
      ? jsonResponse({ error: { message: 'The initial prompt is greater than the context length' } }, 400)
      : jsonResponse({
          id: 'c1',
          object: 'chat.completion',
          created: 1,
          model: 'local-model',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Minimal summary.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        })
  );
  const service = new AIService({ fetch });
  const operationState = { useMinimalPrompts: false };

  const text = await service.summarizeWithRetry(
    service.getModel('lmstudio', { url: 'http://localhost:1234', model: 'local-model' }),
    FULL_PROMPTS.op,
    'A post long enough to summarize.',
    { operationState }
  );

  assert.equal(text, 'Minimal summary.');
  assert.equal(operationState.useMinimalPrompts, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.messages[0].content, FULL_PROMPTS.op);
  assert.equal(requests[1].body.messages[0].content, MINIMAL_PROMPTS.op);
});

test('aborting mid-stream rejects with the caller reason and stops the request', async () => {
  const controller = new AbortController();
  const { fetch, requests } = mockFetch(request =>
    sseResponse(chatCompletionsSse(['one ', 'two ', 'three ', 'four']), { delayMs: 20, signal: request.signal })
  );
  const service = new AIService({ fetch });
  const streamed = [];
  const reason = new Error('Navigated to a different post');
  reason.name = 'AbortError';

  await assert.rejects(
    service.streamFollowUp(
      'openrouter',
      followUpContext,
      { apiKey: 'k', model: 'm' },
      {
        abortSignal: controller.signal,
        onStream: chunk => {
          streamed.push(chunk);
          controller.abort(reason);
        }
      }
    ),
    error => error === reason
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].signal?.aborted, true);
  assert.ok(streamed.length < 4, `streamed ${streamed.length} chunks after abort`);
});

test('a provider error during a follow-up surfaces through onError and rejects', async () => {
  const { fetch } = mockFetch(() => jsonResponse({ error: { message: 'Invalid API key' } }, 401));
  const service = new AIService({ fetch });
  const errors = [];

  await assert.rejects(
    service.streamFollowUp('openrouter', followUpContext, { apiKey: 'bad', model: 'm' }, { onError: error => errors.push(error) }),
    error => /Invalid API key/.test(error.message)
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /Invalid API key/);
});
