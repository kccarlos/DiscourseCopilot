import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentLoop } from '../src/background/agent-loop.mjs';
import { ForumToolError } from '../src/background/forum-tools.mjs';
import { AgentActionParseError } from '../src/services/agent-action.mjs';
import { extractCitationIds } from '../src/services/agent-context.mjs';
import { AGENT_ACTIVITY_STATUS, appendAgentTurn, createAgentActivity, normalizeAgentActivity } from '../src/shared/agent-activity.mjs';

const SITE = 'https://forum.example.com';
const BUDGET = { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 };

const action = (tool, args = {}, reason = 'why') => JSON.stringify({ tool, arguments: args, reason });

// A forum with two topics, as a ForumToolClient look-alike.
function fakeClient({ log = [], failSearch = null } = {}) {
  return {
    siteUrl: SITE,
    log,
    async searchForum({ query, page = 1 }) {
      log.push(['search', query, page]);
      if (failSearch) throw failSearch;
      return {
        query,
        page,
        more: false,
        hits: [],
        topicSummaries: [
          { topicId: '11', title: 'Caching with a CDN', postsCount: 3, excerpt: 'Use a CDN.' },
          { topicId: '12', title: 'Backups', postsCount: 2, excerpt: 'Nightly.' }
        ]
      };
    },
    async listLatest() {
      log.push(['latest']);
      return { topics: [{ topicId: '11', title: 'Caching with a CDN', postsCount: 3 }] };
    },
    async getTopic({ topicId }) {
      log.push(['topic', topicId]);
      return { topicId, title: topicId === '11' ? 'Caching with a CDN' : 'Backups', slug: `slug-${topicId}`, postsCount: 3, tags: [] };
    },
    async getRawPage({ topicId, page }) {
      log.push(['raw', topicId, page]);
      return { content: `ann | 2026-01-01 10:00:00 UTC | #1\n\nPost text of ${topicId}` };
    }
  };
}

// The persisted record the loop writes to, round-tripped through the
// normalizer the way IndexedDB would hand it back after a restart.
function store(question = 'How do I cache?') {
  let record = createAgentActivity({ activityId: 'run-1', taskId: 'task-1', agentRunId: 'run-1', question, siteUrl: SITE }, 1);
  return {
    get record() {
      return record;
    },
    set record(value) {
      record = value;
    },
    saves: [],
    async save(patch) {
      record = normalizeAgentActivity({ ...record, ...patch }, 1);
      this.saves.push(structuredClone(patch));
    },
    restart() {
      record = normalizeAgentActivity(JSON.parse(JSON.stringify(record)), 1);
    }
  };
}

function model(replies, { answer = 'The answer [S1].', calls = [] } = {}) {
  const queue = [...replies];
  return {
    calls,
    answers: [],
    planAction: async (system, messages) => {
      calls.push({ system, messages: messages.map(message => ({ ...message })) });
      if (!queue.length) throw new Error('the model was asked more than scripted');
      return queue.shift();
    },
    writeAnswer: async request => {
      const text = typeof answer === 'function' ? answer(request) : answer;
      for (const chunk of text.match(/.{1,8}/gs) || []) request.onStream(chunk);
      return text;
    }
  };
}

const runLoop = (records, scripted, extra = {}) =>
  runAgentLoop({
    activity: records.record,
    save: patch => records.save(patch),
    planAction: scripted.planAction,
    writeAnswer: scripted.writeAnswer,
    toolClient: fakeClient(),
    savedSummaries: { list: async () => [], get: async () => null },
    budget: BUDGET,
    forumName: 'Example Forum',
    ...extra
  });

test('search, read, final answer: the whole loop with a scripted model', async () => {
  const records = store();
  const log = [];
  const streamed = [];
  const scripted = model([
    action('search_forum', { query: 'cache cdn' }, 'find topics'),
    action('read_topic', { topic_id: 11 }, 'read the best match'),
    action('final_answer', { answer: 'Use a CDN.' })
  ]);
  const { answer, outOfBudget, patch } = await runLoop(records, scripted, {
    toolClient: fakeClient({ log }),
    onStream: chunk => streamed.push(chunk)
  });

  assert.equal(answer, 'The answer [S1].');
  assert.equal(outOfBudget, false);
  assert.equal(streamed.join(''), 'The answer [S1].', 'the answer is streamed as it is written');
  assert.deepEqual(log, [
    ['search', 'cache cdn', 1],
    ['topic', '11'],
    ['raw', '11', 1]
  ]);

  // Steps: tool, arguments, reason, outcome, timings.
  assert.deepEqual(
    patch.steps.map(step => [step.tool, step.status, step.resultCount, step.reason]),
    [
      ['search_forum', 'completed', 2, 'find topics'],
      ['read_topic', 'completed', 3, 'read the best match']
    ]
  );
  assert.deepEqual(patch.steps[1].args, { topic_id: '11' });
  assert.equal(patch.steps[1].sourceId, 'S1');
  assert.equal(patch.steps[1].title, 'Caching with a CDN');
  assert.ok(patch.steps.every(step => step.startedAt > 0 && step.completedAt >= step.startedAt));
  assert.match(patch.steps[0].detail, /id 11: Caching with a CDN/);

  // The model saw: system prompt, goal, then action/observation pairs.
  assert.equal(scripted.calls.length, 3);
  assert.match(scripted.calls[0].system, /research agent for Example Forum/);
  assert.deepEqual(scripted.calls[0].messages, [{ role: 'user', content: 'GOAL:\nHow do I cache?' }]);
  assert.deepEqual(
    scripted.calls[2].messages.map(message => message.role),
    ['user', 'assistant', 'user', 'assistant', 'user']
  );
  assert.match(scripted.calls[2].messages[2].content, /^OBSERVATION from search_forum:/);
  assert.match(scripted.calls[2].messages[4].content, /^OBSERVATION from read_topic:\n\[S1\] Topic 11/);

  // The answer and the sources are saved on the record.
  assert.equal(patch.answer, 'The answer [S1].');
  assert.equal(patch.answerStatus, 'answered');
  assert.equal(patch.turns[0].answer, 'The answer [S1].');
  assert.ok(patch.turns[0].completedAt > 0);
  assert.deepEqual(patch.budget, BUDGET);
  assert.deepEqual(
    patch.sourceRefs.map(source => [source.sourceId, source.topicId, source.url]),
    [['S1', '11', 'https://forum.example.com/t/slug-11/11']]
  );
  assert.deepEqual(extractCitationIds(answer, patch.sourceRefs), ['S1']);
  assert.equal(patch.transcript.at(-1).role, 'assistant');
  assert.match(patch.transcript.at(-1).content, /"final_answer".*The answer \[S1\]/);
});

test('the streamed answer continues the same conversation and lists the sources that were read', async () => {
  const records = store();
  let request;
  const scripted = model([action('read_topic', { topic_id: '11' }), action('final_answer', { answer: 'gist' })], {
    answer: r => {
      request = r;
      return 'Done.';
    }
  });
  await runLoop(records, scripted);
  assert.match(request.system, /research agent/);
  const roles = request.messages.map(message => message.role);
  assert.deepEqual(roles, ['user', 'assistant', 'user', 'assistant', 'user']);
  assert.match(request.messages[3].content, /"final_answer".*gist/);
  assert.match(request.messages[4].content, /not JSON/);
  assert.match(request.messages[4].content, /\[S1\] Caching with a CDN/);
});

test('progress is saved after every step, so the record always shows where the run is', async () => {
  const records = store();
  const scripted = model([action('search_forum', { query: 'a' }), action('list_latest'), action('final_answer', { answer: 'x' })]);
  await runLoop(records, scripted);
  const withRunning = records.saves.filter(save => save.steps?.some(step => step.status === 'running'));
  assert.ok(withRunning.length >= 2, 'a step is visible as running before it finishes');
  const progress = records.saves.map(save => save.progress?.completedSteps).filter(value => value !== undefined);
  assert.deepEqual([...new Set(progress)], [0, 1, 2]);
  assert.equal(records.saves.at(-1).phase, 'answering');
});

test('the step budget is enforced: after maxSteps tool calls the answer is forced', async () => {
  const records = store();
  const scripted = model(Array.from({ length: 5 }, (_, index) => action('search_forum', { query: `q${index}` })));
  const { patch, outOfBudget } = await runLoop(records, scripted, { budget: { ...BUDGET, maxSteps: 3 } });
  assert.equal(outOfBudget, true);
  assert.equal(scripted.calls.length, 3, 'the model is not asked for a fourth step');
  assert.equal(patch.steps.length, 3);
  assert.equal(patch.turns[0].outOfBudget, true);
  assert.equal(patch.answer, 'The answer [S1].');
  assert.deepEqual(patch.budget.maxSteps, 3);
});

test('the out-of-budget answer request says the budget ran out', async () => {
  const records = store();
  let request;
  const scripted = model([action('list_latest'), action('list_latest'), action('list_latest')], {
    answer: r => {
      request = r;
      return 'Partial answer.';
    }
  });
  await runLoop(records, scripted, { budget: { ...BUDGET, maxSteps: 3 } });
  assert.match(request.messages.at(-1).content, /ran out of tool budget/);
  assert.equal(request.messages.at(-2).role, 'user', 'the last observation, then the instruction');
});

test('the topic-read budget turns an extra read into an error the model sees; the run goes on', async () => {
  const records = store();
  const scripted = model([
    action('read_topic', { topic_id: '11' }),
    action('read_topic', { topic_id: '12' }),
    action('final_answer', { answer: 'g' })
  ]);
  const { patch } = await runLoop(records, scripted, { budget: { ...BUDGET, maxTopicReads: 1 } });
  assert.deepEqual(
    patch.steps.map(step => step.status),
    ['completed', 'failed']
  );
  assert.match(patch.steps[1].error, /topic-read budget \(1\)/);
  assert.equal(patch.sourceRefs.length, 1);
  assert.match(scripted.calls[2].messages.at(-1).content, /^ERROR from read_topic:\nThe topic-read budget/);
});

test('bad arguments and unknown tools come back as errors, not crashes', async () => {
  const records = store();
  const scripted = model([
    action('search_forum', { query: '' }),
    action('delete_everything'),
    action('read_topic', { topic_id: 'https://evil.example/' }),
    action('final_answer', { answer: 'g' })
  ]);
  const log = [];
  const { patch } = await runLoop(records, scripted, { toolClient: fakeClient({ log }) });
  assert.deepEqual(
    patch.steps.map(step => step.status),
    ['failed', 'failed', 'failed']
  );
  assert.deepEqual(log, [], 'nothing was fetched');
  assert.match(scripted.calls[1].messages.at(-1).content, /query is required/);
  assert.match(scripted.calls[2].messages.at(-1).content, /Unknown tool "delete_everything"/);
});

test('a failed forum request is shown to the model as an error and the run continues', async () => {
  const records = store();
  const client = fakeClient({ failSearch: new ForumToolError('HTTP_ERROR', 'Forum request failed with HTTP 500', { status: 500 }) });
  const scripted = model([action('search_forum', { query: 'x' }), action('final_answer', { answer: 'g' })]);
  const { patch } = await runLoop(records, scripted, { toolClient: client });
  assert.equal(patch.steps[0].status, 'failed');
  assert.match(
    scripted.calls[1].messages.at(-1).content,
    /ERROR from search_forum:\nThe request failed: Forum request failed with HTTP 500/
  );
});

test('an unreadable reply is retried once with a correction, then the step fails', async () => {
  const records = store();
  const retried = model(['I will search now.', action('list_latest'), action('final_answer', { answer: 'g' })]);
  const { patch } = await runLoop(records, retried);
  assert.equal(patch.steps.length, 1);
  assert.equal(retried.calls.length, 3);
  assert.match(retried.calls[1].messages.at(-1).content, /not a valid action/);
  assert.equal(
    patch.transcript.some(message => message.content.includes('not a valid action')),
    false,
    'the correction is not kept in the transcript'
  );

  const failing = store();
  const bad = model(['prose', 'more prose']);
  await assert.rejects(runLoop(failing, bad), AgentActionParseError);
  const [step] = failing.record.steps;
  assert.equal(step.tool, 'plan');
  assert.equal(step.status, 'failed');
  assert.match(step.error, /did not reply with a valid action/);
});

test('cancellation stops the run between steps and keeps what was done', async () => {
  const records = store();
  const controller = new AbortController();
  const scripted = model([action('search_forum', { query: 'a' }), action('search_forum', { query: 'b' })]);
  await assert.rejects(
    runLoop(records, scripted, {
      signal: controller.signal,
      report: async () => {
        controller.abort();
        throw Object.assign(new Error('Task cancelled'), { name: 'AbortError' });
      }
    }),
    error => error.name === 'AbortError'
  );
  assert.equal(scripted.calls.length, 1, 'no further step was planned');
  assert.equal(records.record.steps.length, 1);
  assert.equal(records.record.steps[0].status, 'completed');
  assert.equal(records.record.answer, '');
});

test('cancellation inside a tool call leaves that step to be run again, not failed', async () => {
  const records = store();
  const controller = new AbortController();
  const client = fakeClient();
  client.searchForum = async () => {
    controller.abort();
    throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  };
  const scripted = model([action('search_forum', { query: 'a' })]);
  await assert.rejects(runLoop(records, scripted, { toolClient: client, signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(records.record.steps[0].status, 'running');
});

test('a restart resumes from the last saved step without asking the model again', async () => {
  const records = store();
  const log = [];
  const crash = new AbortController();
  const first = model([action('search_forum', { query: 'cache' }), action('read_topic', { topic_id: '11' })]);
  const crashing = fakeClient({ log });
  crashing.getRawPage = async () => {
    // The worker is killed while the second tool call is in flight.
    crash.abort();
    throw Object.assign(new Error('killed'), { name: 'AbortError' });
  };
  await assert.rejects(runLoop(records, first, { toolClient: crashing, signal: crash.signal }), error => error.name === 'AbortError');
  assert.deepEqual(
    records.record.steps.map(step => step.status),
    ['completed', 'running']
  );
  assert.equal(first.calls.length, 2);

  // New worker: the record comes back from storage.
  records.restart();
  const resumedLog = [];
  const second = model([action('final_answer', { answer: 'g' })]);
  const { patch } = await runLoop(records, second, { toolClient: fakeClient({ log: resumedLog }) });
  assert.deepEqual(
    resumedLog,
    [
      ['topic', '11'],
      ['raw', '11', 1]
    ],
    'the interrupted read runs again; the finished search does not'
  );
  assert.equal(second.calls.length, 1, 'only the final_answer decision was asked of the model');
  assert.deepEqual(
    second.calls[0].messages.map(message => message.role),
    ['user', 'assistant', 'user', 'assistant', 'user'],
    'the saved transcript carries both steps'
  );
  assert.equal(second.calls[0].messages.filter(message => message.content.startsWith('GOAL')).length, 1, 'the goal is not added twice');
  assert.deepEqual(
    patch.steps.map(step => [step.tool, step.status]),
    [
      ['search_forum', 'completed'],
      ['read_topic', 'completed']
    ]
  );
  assert.equal(patch.sourceRefs[0].sourceId, 'S1');
});

test('a forum that needs the user stops the run with the step kept; Continue runs it again', async () => {
  const records = store();
  const blocked = fakeClient({
    failSearch: new ForumToolError('USER_ACTION_REQUIRED', 'Log in', { needsUserAction: true, retryable: false })
  });
  const first = model([action('search_forum', { query: 'cache' })]);
  await assert.rejects(runLoop(records, first, { toolClient: blocked }), error => error.needsUserAction === true);
  assert.equal(records.record.steps[0].status, 'running', 'the step waits for the user');

  records.restart();
  const log = [];
  const second = model([action('final_answer', { answer: 'g' })]);
  const { patch } = await runLoop(records, second, { toolClient: fakeClient({ log }) });
  assert.deepEqual(log, [['search', 'cache', 1]]);
  assert.equal(second.calls.length, 1);
  assert.equal(patch.steps[0].status, 'completed');
});

test('an unexpected error ends the loop and leaves the step for the executor to settle', async () => {
  const records = store();
  const client = fakeClient();
  client.listLatest = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(runLoop(records, model([action('list_latest')]), { toolClient: client }), TypeError);
  assert.equal(records.record.steps[0].status, 'running');
});

test('a follow-up continues the transcript with a fresh budget and numbers its sources after the earlier ones', async () => {
  const records = store();
  const first = model([action('read_topic', { topic_id: '11' }), action('final_answer', { answer: 'g' })], {
    answer: 'First answer [S1].'
  });
  await records.save((await runLoop(records, first, { budget: { ...BUDGET, maxSteps: 3 } })).patch);
  records.record = { ...records.record, status: AGENT_ACTIVITY_STATUS.COMPLETED, completedAt: 5 };
  const stepsAfterFirst = records.record.steps.length;

  records.record = normalizeAgentActivity(appendAgentTurn(records.record, { taskId: 'task-2', question: 'And for backups?' }), 1);
  assert.equal(records.record.taskId, 'task-2');
  const second = model(
    [action('read_topic', { topic_id: '12' }), action('read_topic', { topic_id: '11' }), action('final_answer', { answer: 'g2' })],
    { answer: 'Second answer [S2][S1].' }
  );
  const { patch } = await runLoop(records, second, { budget: { ...BUDGET, maxSteps: 2 } });

  assert.equal(stepsAfterFirst, 1);
  assert.equal(patch.steps.length, 3, 'earlier steps are kept; the new turn gets its own two');
  assert.deepEqual(
    patch.steps.map(step => step.turn),
    [0, 1, 1]
  );
  assert.equal(second.calls.length, 3, 'two steps and then the final decision, the budget having started over');
  const firstCall = second.calls[0].messages;
  assert.match(firstCall[0].content, /^GOAL:/);
  assert.match(firstCall.at(-2).content, /First answer \[S1\]/, 'the first answer is part of the conversation');
  assert.match(firstCall.at(-1).content, /^FOLLOW-UP from the user.*\nAnd for backups\?$/s);
  assert.deepEqual(
    patch.sourceRefs.map(source => `${source.sourceId}:${source.topicId}`),
    ['S1:11', 'S2:12']
  );
  assert.equal(patch.turns[0].answer, 'First answer [S1].');
  assert.equal(patch.turns[1].answer, 'Second answer [S2][S1].');
  assert.equal(patch.turns[1].question, 'And for backups?');
  assert.equal(patch.answer, 'Second answer [S2][S1].', 'the latest answer is the record answer');
});

test('an unfinished follow-up resumes without adding its question twice', async () => {
  const records = store();
  await records.save((await runLoop(records, model([action('final_answer', { answer: 'g' })], { answer: 'First.' }))).patch);
  records.record = { ...records.record, status: AGENT_ACTIVITY_STATUS.COMPLETED, completedAt: 5 };
  records.record = normalizeAgentActivity(appendAgentTurn(records.record, { taskId: 'task-2', question: 'More?' }), 1);

  const abort = new AbortController();
  const crashing = fakeClient();
  crashing.listLatest = async () => {
    abort.abort();
    throw Object.assign(new Error('killed'), { name: 'AbortError' });
  };
  await assert.rejects(runLoop(records, model([action('list_latest')]), { toolClient: crashing, signal: abort.signal }));
  records.restart();
  const resumed = model([action('final_answer', { answer: 'g' })], { answer: 'Second.' });
  const { patch } = await runLoop(records, resumed);
  const followUps = patch.transcript.filter(message => message.content.startsWith('FOLLOW-UP'));
  assert.equal(followUps.length, 1);
  assert.equal(patch.turns[1].answer, 'Second.');
});

test('a follow-up on a run from before follow-ups starts from its question and answer', async () => {
  const records = store();
  records.record = normalizeAgentActivity(
    {
      ...records.record,
      schemaVersion: 1,
      status: AGENT_ACTIVITY_STATUS.COMPLETED,
      completedAt: 5,
      startedAt: 2,
      answer: 'Old answer [S1].'
    },
    1
  );
  records.record = normalizeAgentActivity(appendAgentTurn(records.record, { taskId: 'task-2', question: 'More?' }), 1);
  const scripted = model([action('final_answer', { answer: 'g' })], { answer: 'New answer.' });
  const { patch } = await runLoop(records, scripted);
  assert.deepEqual(
    scripted.calls[0].messages.map(message => message.role),
    ['user', 'assistant', 'user']
  );
  assert.match(scripted.calls[0].messages[1].content, /Old answer \[S1\]\./);
  assert.deepEqual(
    patch.turns.map(turn => turn.answer),
    ['Old answer [S1].', 'New answer.']
  );
});

test('an empty streamed answer falls back to the gist; no answer at all is an error', async () => {
  const records = store();
  const gist = model([action('final_answer', { answer: 'Just the gist.' })], { answer: '   ' });
  const { answer } = await runLoop(records, gist);
  assert.equal(answer, 'Just the gist.');

  const empty = model([action('final_answer', { answer: '' })], { answer: '' });
  await assert.rejects(runLoop(store(), empty), /No Agent answer was generated/);
});

test('source links come from the run forum, never from what the model wrote', async () => {
  const records = store();
  const scripted = model(
    [
      action('read_topic', { topic_id: 'https://evil.example/t/phish/11' }),
      action('final_answer', { answer: 'see https://evil.example/x' })
    ],
    { answer: 'See https://evil.example/x and [S1] and [S7].' }
  );
  const { patch, answer } = await runLoop(records, scripted);
  assert.deepEqual(
    patch.sourceRefs.map(source => source.url),
    ['https://forum.example.com/t/slug-11/11']
  );
  assert.deepEqual(extractCitationIds(answer, patch.sourceRefs), ['S1'], 'S7 is not a source and gets no link');
});

test('the saved transcript is compacted, and a run on a missing forum is refused', async () => {
  const records = store();
  const big = fakeClient();
  big.getRawPage = async () => ({ content: 'x'.repeat(90000) });
  const reads = Array.from({ length: 6 }, (_, index) => action('read_topic', { topic_id: String(11 + (index % 2)) }));
  const scripted = model([...reads, action('final_answer', { answer: 'g' })]);
  const { patch } = await runLoop(records, scripted, { toolClient: big, budget: { ...BUDGET, maxCharsPerRead: 60000 } });
  const total = patch.transcript.reduce((sum, message) => sum + message.content.length, 0);
  assert.ok(total <= 240000, `transcript ${total}`);
  assert.equal(patch.transcript[0].content, 'GOAL:\nHow do I cache?');

  await assert.rejects(runLoop(store(), model([]), { toolClient: { siteUrl: '' } }), error => error.code === 'INVALID_ARGUMENT');
});
