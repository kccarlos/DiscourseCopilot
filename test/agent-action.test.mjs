import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AgentActionParseError,
  balancedJsonObjects,
  coerceArgument,
  parseAgentAction,
  planAgentStep
} from '../src/services/agent-action.mjs';
import { CORRECTION_MESSAGE } from '../src/services/agent-prompt.mjs';

test('reads a plain JSON action', () => {
  assert.deepEqual(parseAgentAction('{"tool": "search_forum", "arguments": {"query": "rate limit"}, "reason": "start broad"}'), {
    tool: 'search_forum',
    arguments: { query: 'rate limit' },
    reason: 'start broad'
  });
});

test('tolerates code fences and prose around the object', () => {
  const fenced = 'Sure!\n```json\n{"tool": "list_latest", "arguments": {}}\n```\nLet me know.';
  assert.equal(parseAgentAction(fenced).tool, 'list_latest');
  const prose = 'I will search first. {"tool": "search_forum", "arguments": {"query": "a {b} c"}} Done.';
  assert.deepEqual(parseAgentAction(prose).arguments, { query: 'a {b} c' });
  assert.equal(parseAgentAction('```\n{"tool":"list_latest"}\n```').tool, 'list_latest');
});

test('takes the first object that names a tool when there are several', () => {
  const text = '{"note": "thinking"} then {"tool": "read_topic", "arguments": {"topic_id": 5}} and {"tool": "list_latest"}';
  const action = parseAgentAction(text);
  assert.equal(action.tool, 'read_topic');
  assert.deepEqual(action.arguments, { topic_id: '5' });
});

test('coerces scalar arguments to text', () => {
  const action = parseAgentAction(
    '{"tool": "read_topic", "arguments": {"topic_id": 42, "page": 2, "flag": true, "ids": [1, 2], "none": null}}'
  );
  assert.deepEqual(action.arguments, { topic_id: '42', page: '2', flag: 'true', ids: '1, 2', none: '' });
  assert.equal(coerceArgument({ a: 1 }), '{"a":1}');
});

test('accepts the usual aliases and arguments written beside the tool', () => {
  assert.deepEqual(parseAgentAction('{"action": "Search Forum", "args": {"query": "x"}, "thought": "t"}'), {
    tool: 'search_forum',
    arguments: { query: 'x' },
    reason: 't'
  });
  assert.deepEqual(parseAgentAction('{"tool": "search_forum", "query": "x", "page": 2}').arguments, { query: 'x', page: '2' });
  assert.deepEqual(parseAgentAction('{"tool": "saved_summaries", "arguments": "sso"}').arguments, { input: 'sso' });
  assert.equal(parseAgentAction('{"tool": "final_answer", "answer": "Done."}').arguments.answer, 'Done.');
});

test('balanced extraction is string and escape aware', () => {
  assert.deepEqual(balancedJsonObjects('x {"a": "}{\\"}"} y {"b": {"c": 1}}'), ['{"a": "}{\\"}"}', '{"b": {"c": 1}}']);
  assert.deepEqual(balancedJsonObjects('he said "{" and left'), []);
  assert.deepEqual(balancedJsonObjects('{"unterminated": '), []);
});

test('replies without a usable action are errors with a code', () => {
  assert.throws(
    () => parseAgentAction('I think we should search.'),
    error => error instanceof AgentActionParseError && error.code === 'NO_OBJECT'
  );
  assert.throws(
    () => parseAgentAction('{"query": "x"}'),
    error => error instanceof AgentActionParseError && error.code === 'MISSING_TOOL'
  );
  assert.throws(() => parseAgentAction('{"tool": "   "}'), AgentActionParseError);
  assert.throws(() => parseAgentAction('[1, 2]'), AgentActionParseError);
  assert.throws(() => parseAgentAction(undefined), AgentActionParseError);
});

test('an unreadable reply gets one corrective retry with the bad reply in the conversation', async () => {
  const calls = [];
  const replies = ['Let me think about it.', '{"tool": "list_latest", "arguments": {}}'];
  const transcript = [{ role: 'user', content: 'GOAL:\nx' }];
  const result = await planAgentStep({
    transcript,
    complete: async messages => {
      calls.push(messages);
      return replies.shift();
    }
  });
  assert.equal(result.retried, true);
  assert.equal(result.action.tool, 'list_latest');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], transcript);
  assert.deepEqual(calls[1], [...transcript, { role: 'assistant', content: 'Let me think about it.' }, CORRECTION_MESSAGE]);
  assert.equal(transcript.length, 1, 'the caller transcript is not extended');
});

test('a second unreadable reply fails the step; a readable one costs a single call', async () => {
  let count = 0;
  await assert.rejects(
    planAgentStep({
      transcript: [],
      complete: async () => {
        count++;
        return 'still prose';
      }
    }),
    error => error instanceof AgentActionParseError && /even after a correction/.test(error.message)
  );
  assert.equal(count, 2);

  let single = 0;
  const ok = await planAgentStep({
    transcript: [],
    complete: async () => {
      single++;
      return '{"tool": "list_latest"}';
    }
  });
  assert.equal(single, 1);
  assert.equal(ok.retried, false);

  // Provider errors are not parse errors and are not retried here.
  await assert.rejects(
    planAgentStep({
      transcript: [],
      complete: async () => {
        throw new Error('network down');
      }
    }),
    /network down/
  );
});
