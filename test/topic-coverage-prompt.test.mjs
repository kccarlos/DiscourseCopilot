// A topic read only in part (page limit, or the safety cap on topics of
// unknown size) is described to the model: in the summary request, in every
// hierarchical phase that sees replies, and in the follow-up chat rules.
import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { AIService } from '../src/services/ai-service.js';
import { FULL_PROMPTS, buildCoverageNote, describeTopicCoverage, getHierarchicalPrompt } from '../src/services/prompts.js';
import { buildFollowUpMessages } from '../src/services/chat-context.mjs';
import { createTopicExecutors } from '../src/background/topic-executors.mjs';
import { TopicSessionDatabase } from '../src/shared/topic-session-db.mjs';
import { createTaskRecord } from '../src/shared/task-record.mjs';

const SITE = 'https://forum.example.com';
const limited = { truncated: true, coveredPosts: 201, totalPosts: 901, pagesFetched: 2 };
const unknownSize = { truncated: true, coveredPosts: null, totalPosts: null, pagesFetched: 100 };
const complete = { truncated: false, coveredPosts: 12, totalPosts: 12, pagesFetched: 1 };

const LIMITED_NOTE = "Note: only the first 200 of 900 replies were provided. Say so in the summary and don't claim to cover later replies.";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function chatCompletion(content) {
  return jsonResponse({
    id: 'c1',
    object: 'chat.completion',
    created: 1,
    model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
  });
}

function mockFetch(handler) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const request = { url: String(url), body: init.body ? JSON.parse(init.body) : undefined };
    requests.push(request);
    return handler(request, requests.length);
  };
  return { fetch, requests };
}

const LONG_SUMMARY = 'A summary that is comfortably longer than fifty characters in total.';
const settings = { url: 'http://localhost:1234', model: 'local-model' };
const userText = request =>
  request.body.messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n');
const systemText = request =>
  request.body.messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n');

test('describeTopicCoverage normalizes a fetch result', () => {
  assert.deepEqual(describeTopicCoverage(limited), { truncated: true, coveredPosts: 201, totalPosts: 901, pagesRead: 2 });
  assert.deepEqual(describeTopicCoverage(unknownSize), { truncated: true, coveredPosts: null, totalPosts: null, pagesRead: 100 });
  assert.deepEqual(describeTopicCoverage(null), { truncated: false, coveredPosts: null, totalPosts: null, pagesRead: null });
  assert.equal(describeTopicCoverage({ truncated: 'yes', coveredPosts: -1 }).truncated, false);
});

test('buildCoverageNote: first N of M replies, unknown size, and complete topics', () => {
  assert.equal(buildCoverageNote(describeTopicCoverage(limited)), LIMITED_NOTE);
  assert.equal(
    buildCoverageNote(describeTopicCoverage({ truncated: true, coveredPosts: 2001, totalPosts: 12001 })),
    "Note: only the first 2,000 of 12,000 replies were provided. Say so in the summary and don't claim to cover later replies."
  );
  assert.equal(
    buildCoverageNote(describeTopicCoverage(unknownSize)),
    "Note: only the first part of this topic was provided; the topic may continue beyond the provided replies. Say so in the summary and don't claim to cover later replies."
  );
  assert.match(
    buildCoverageNote(describeTopicCoverage(limited), 'answer'),
    /^Note: only the first 200 of 900 replies were provided\. If the answer could depend on later replies/
  );
  assert.equal(buildCoverageNote(describeTopicCoverage(complete)), '');
  assert.equal(buildCoverageNote(undefined), '');
  // A total no larger than the covered part says nothing wrong about counts.
  assert.match(buildCoverageNote({ truncated: true, coveredPosts: 5, totalPosts: 5 }), /may continue/);
});

test('single-pass summary: the note leads the user message; the system prompt is unchanged', async () => {
  const { fetch, requests } = mockFetch(() => chatCompletion(LONG_SUMMARY));
  const service = new AIService({ fetch });
  await service.generateSummary(
    'lmstudio',
    'OP\n\n\n\nReply',
    settings,
    {},
    {
      responseLanguage: 'fr',
      coverage: describeTopicCoverage(limited)
    }
  );
  assert.equal(requests.length, 1);
  assert.ok(
    userText(requests[0]).startsWith(`${LIMITED_NOTE}\n\nPlease analyze and summarize this forum discussion:`),
    userText(requests[0])
  );
  assert.ok(systemText(requests[0]).startsWith(FULL_PROMPTS.system));
  assert.match(systemText(requests[0]), /\*\*LANGUAGE:\*\*.*French/);
  assert.doesNotMatch(systemText(requests[0]), /replies were provided/);
});

test('single-pass summary of a complete topic has no note', async () => {
  const { fetch, requests } = mockFetch(() => chatCompletion(LONG_SUMMARY));
  const service = new AIService({ fetch });
  await service.generateSummary('lmstudio', 'OP\n\n\n\nReply', settings, {}, { coverage: describeTopicCoverage(complete) });
  await service.generateSummary('lmstudio', 'OP\n\n\n\nReply', settings, {}, {});
  for (const request of requests) {
    assert.ok(userText(request).startsWith('Please analyze and summarize this forum discussion:'));
    assert.doesNotMatch(userText(request), /Note: only/);
  }
});

test('a custom system prompt keeps its wording; the note still reaches the request', async () => {
  const { fetch, requests } = mockFetch(() => chatCompletion(LONG_SUMMARY));
  const service = new AIService({ fetch });
  await service.generateSummary(
    'lmstudio',
    'OP\n\n\n\nReply',
    settings,
    {},
    {
      systemPrompt: 'Summarize as a haiku.',
      coverage: describeTopicCoverage(unknownSize)
    }
  );
  assert.ok(userText(requests[0]).startsWith('Note: only the first part of this topic was provided'));
  assert.ok(userText(requests[0]).includes('Analyze the following forum discussion according to the system instructions:'));
});

test('hierarchical summary: replies and final phases get the note, the OP phase and prompts do not', async () => {
  const { fetch, requests } = mockFetch((request, count) =>
    count === 1
      ? jsonResponse({ error: { message: "This model's maximum context length is 8192 tokens" } }, 400)
      : chatCompletion(`Partial ${count}`)
  );
  const service = new AIService({ fetch });
  await service.generateSummary(
    'lmstudio',
    'Original post text.\n\n\n\nFirst reply.\n\n\n\nSecond reply.',
    settings,
    {},
    {
      responseLanguage: 'auto',
      coverage: describeTopicCoverage(limited)
    }
  );
  // single pass (failed) + OP + comments + final assembly
  assert.equal(requests.length, 4);
  const [, ...phases] = requests;
  const bySystem = prompt => phases.find(request => systemText(request) === getHierarchicalPrompt(prompt, '', 'auto'));
  const op = bySystem('op');
  const comments = bySystem('comments');
  const final = bySystem('final');
  assert.ok(op && comments && final, phases.map(systemText).join('\n---\n'));
  assert.doesNotMatch(userText(op), /Note: only/);
  assert.ok(userText(comments).startsWith(`${LIMITED_NOTE}\n\nFirst reply.`), userText(comments));
  assert.ok(userText(final).startsWith(`${LIMITED_NOTE}\n\n**ORIGINAL POST SUMMARY:**`), userText(final));
});

test('a hierarchical retry with halved content keeps the note once', async () => {
  const { fetch, requests } = mockFetch((request, count) =>
    count === 1 ? jsonResponse({ error: { message: 'context length exceeded' } }, 400) : chatCompletion('Short.')
  );
  const service = new AIService({ fetch });
  const model = service.getModel('lmstudio', settings);
  await service.summarizeWithRetry(model, FULL_PROMPTS.comments, 'x'.repeat(1000), {
    operationState: { useMinimalPrompts: false },
    note: LIMITED_NOTE
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(userText(request).split(LIMITED_NOTE).length - 1, 1);
  }
  assert.equal(userText(requests[1]), `${LIMITED_NOTE}\n\n${'x'.repeat(500)}`);
  assert.equal(systemText(requests[0]), FULL_PROMPTS.comments);
});

test('follow-up messages carry the note in the rules, outside the reference material', () => {
  const base = { content: 'Post', summary: 'Summary', question: 'Q?', responseLanguage: 'de' };
  const partial = buildFollowUpMessages({ ...base, coverage: describeTopicCoverage(limited) });
  assert.match(
    partial[0].content,
    /Note: only the first 200 of 900 replies were provided\. If the answer could depend on later replies, say so, and don't claim to cover them\./
  );
  assert.match(partial[0].content, /German/);
  assert.doesNotMatch(partial[1].content, /Note: only/);

  const custom = buildFollowUpMessages({ ...base, systemPrompt: 'Be brief.', coverage: describeTopicCoverage(unknownSize) });
  assert.match(custom[0].content, /^Be brief\.\n\nFollow-up requirements:[\s\S]*may continue beyond the provided replies/);

  const whole = buildFollowUpMessages({ ...base, coverage: describeTopicCoverage(complete) });
  assert.doesNotMatch(whole[0].content, /Note: only/);
  assert.deepEqual(buildFollowUpMessages(base)[0], whole[0]);
});

function database() {
  return new TopicSessionDatabase({
    indexedDB,
    keyRange: IDBKeyRange,
    databaseName: `coverage-${crypto.randomUUID()}`
  });
}

function executorsFor(db, fetchResult, calls) {
  return createTopicExecutors({
    aiService: {
      generateSummary: async (provider, content, providerSettings, callbacks, options) => {
        calls.push({ kind: 'summary', options });
        return 'A summary';
      },
      streamFollowUp: async (provider, context) => {
        calls.push({ kind: 'chat', context });
        return 'An answer';
      }
    },
    db,
    broadcast: () => {},
    getTaskConfiguration: async () => ({ provider: 'openai', settings: { model: 'm' }, limits: { topicPageLimit: 2 } }),
    fetchTopicContent: async () => ({
      content: 'c',
      rawPages: [{ page: 1, content: 'c' }],
      unchanged: false,
      newPosts: null,
      ...fetchResult
    })
  });
}

test('the summary and chat executors pass what was read to the AI service', async () => {
  const db = database();
  const calls = [];
  const { executeSummaryTask, executeChatTask } = executorsFor(db, limited, calls);
  const run = { signal: new AbortController().signal, report: async () => {} };
  const summaryTask = createTaskRecord({ id: 's', type: 'summary', topicId: '7', siteUrl: SITE });
  await executeSummaryTask(summaryTask, run);
  const chatTask = createTaskRecord({ id: 'c', type: 'chat', topicId: '7', siteUrl: SITE, question: 'Q?' });
  await executeChatTask(chatTask, run);

  assert.deepEqual(
    calls.map(call => call.kind),
    ['summary', 'chat']
  );
  assert.deepEqual(calls[0].options.coverage, { truncated: true, coveredPosts: 201, totalPosts: 901, pagesRead: 2 });
  assert.deepEqual(calls[1].context.coverage, { truncated: true, coveredPosts: 201, totalPosts: 901, pagesRead: 2 });
});

test('a complete topic reaches the AI service as not truncated', async () => {
  const db = database();
  const calls = [];
  const { executeSummaryTask } = executorsFor(db, complete, calls);
  await executeSummaryTask(createTaskRecord({ id: 's', type: 'summary', topicId: '8', siteUrl: SITE }), {
    signal: new AbortController().signal,
    report: async () => {}
  });
  assert.equal(calls[0].options.coverage.truncated, false);
  assert.equal(buildCoverageNote(calls[0].options.coverage), '');
});
