import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_ACTIVITY_STATUS,
  MAX_AGENT_SOURCES,
  MAX_AGENT_STEPS,
  MAX_AGENT_TRANSCRIPT_CHARS,
  agentStepText,
  agentStepsOf,
  agentTurnsOf,
  appendAgentTurn,
  compactAgentTranscript,
  createAgentActivity,
  currentAgentTurnIndex,
  describeAgentStep,
  buildAgentActivityIndexEntry,
  normalizeAgentActivity
} from '../src/shared/agent-activity.mjs';
import { TASK_TYPE, createTaskRecord } from '../src/shared/task-record.mjs';

test('creates an Agent task without a topic and without provider credentials', () => {
  const task = createTaskRecord(
    {
      id: 'agent-task-1',
      type: TASK_TYPE.AGENT,
      agentRunId: 'run-1',
      clientRequestId: 'request-1',
      question: 'Which card has the best referral bonus?',
      provider: 'openrouter',
      model: 'test/model',
      settings: { apiKey: 'must-not-persist' }
    },
    100
  );

  assert.equal(task.topicId, null);
  assert.equal(task.resourceKey, 'agent:run-1');
  assert.equal(task.question, 'Which card has the best referral bonus?');
  assert.equal(task.clientRequestId, 'request-1');
  assert.equal('settings' in task, false);
  assert.doesNotMatch(JSON.stringify(task), /must-not-persist/);
});

test('normalizes bounded Agent activity records and derives a lightweight index entry', () => {
  const activity = normalizeAgentActivity(
    {
      activityId: 'activity-1',
      taskId: 'task-1',
      agentRunId: 'run-1',
      question: 'Find the answer',
      status: AGENT_ACTIVITY_STATUS.COMPLETED,
      completedAt: 100,
      answer: '# Answer [S1]',
      searchQueries: Array.from({ length: 20 }, (_, index) => ({
        query: `query-${index}`
      })),
      toolCalls: Array.from({ length: 60 }, (_, index) => ({
        name: `tool-${index}`,
        argumentSummary: { page: index }
      })),
      sourceRefs: Array.from({ length: MAX_AGENT_SOURCES + 4 }, (_, index) => ({
        sourceId: `S${index + 1}`,
        topicId: String(index + 1),
        title: `Topic ${index + 1}`,
        url: `https://www.uscardforum.com/t/${index + 1}`
      }))
    },
    100
  );

  assert.equal(activity.status, AGENT_ACTIVITY_STATUS.COMPLETED);
  // Legacy fields stay readable, bounded.
  assert.equal(activity.searchQueries.length, 12);
  assert.equal(activity.toolCalls.length, 60);
  assert.equal(activity.sourceRefs.length, MAX_AGENT_SOURCES);
  assert.equal(activity.expiresAt, 100 + 24 * 60 * 60 * 1000);

  const index = buildAgentActivityIndexEntry(activity);
  assert.equal(index.activityId, 'activity-1');
  assert.equal(index.sourceCount, MAX_AGENT_SOURCES);
  assert.equal(index.answerExcerpt, 'Answer S1');
});

test('creates a queued activity with durable identity fields', () => {
  const activity = createAgentActivity(
    {
      activityId: 'activity-2',
      taskId: 'task-2',
      agentRunId: 'run-2',
      question: 'What changed?',
      title: 'What changed?'
    },
    500
  );

  assert.equal(activity.status, AGENT_ACTIVITY_STATUS.QUEUED);
  assert.equal(activity.createdAt, 500);
  assert.equal(activity.completedAt, 0);
  assert.equal(activity.expiresAt, 0);
});

test('records the forum an Agent task and activity belong to', () => {
  const task = createTaskRecord(
    {
      id: 'agent-task-3',
      type: TASK_TYPE.AGENT,
      question: 'How do I use the API?',
      siteUrl: 'https://community.openai.com/',
      forumName: 'OpenAI Developer Community'
    },
    100
  );
  assert.equal(task.siteUrl, 'https://community.openai.com');
  assert.equal(task.forumName, 'OpenAI Developer Community');

  const activity = createAgentActivity(
    {
      activityId: 'activity-3',
      taskId: task.id,
      question: task.question,
      siteUrl: task.siteUrl,
      forumName: task.forumName
    },
    100
  );
  assert.equal(activity.siteUrl, 'https://community.openai.com');
  assert.equal(activity.forumName, 'OpenAI Developer Community');
  assert.equal(buildAgentActivityIndexEntry(activity).siteUrl, 'https://community.openai.com');

  const unnamed = createAgentActivity(
    {
      activityId: 'activity-4',
      taskId: 'task-4',
      question: 'Question',
      siteUrl: 'https://example.com/forum'
    },
    100
  );
  assert.equal(unnamed.forumName, 'example.com');
});

test('scopes source identity and links to the activity forum', () => {
  const activity = normalizeAgentActivity(
    {
      activityId: 'activity-5',
      taskId: 'task-5',
      question: 'Question',
      siteUrl: 'https://community.openai.com',
      sourceRefs: [
        { sourceId: 'S1', topicId: '12', url: 'https://community.openai.com/t/a/12' },
        { sourceId: 'S2', topicId: '12', url: 'https://evil.com/t/a/12' }
      ]
    },
    100
  );

  assert.equal(activity.sourceRefs[0].topicKey, 'community.openai.com/t/12');
  assert.equal(activity.sourceRefs[0].url, 'https://community.openai.com/t/a/12');
  assert.equal(activity.sourceRefs[0].title, 'Topic 12');
  assert.equal(activity.sourceRefs[1].url, '');

  const other = normalizeAgentActivity(
    {
      activityId: 'activity-6',
      taskId: 'task-6',
      question: 'Question',
      siteUrl: 'https://meta.discourse.org',
      sourceRefs: [{ sourceId: 'S1', topicId: '12', url: 'https://meta.discourse.org/t/12' }]
    },
    100
  );
  assert.notEqual(other.sourceRefs[0].topicKey, activity.sourceRefs[0].topicKey);
});

const base = {
  activityId: 'run-1',
  taskId: 'task-1',
  agentRunId: 'run-1',
  question: 'How do I cache?',
  siteUrl: 'https://meta.discourse.org'
};

test('normalizes steps, turns, transcript and budget; legacy records stay readable', () => {
  const activity = normalizeAgentActivity(
    {
      ...base,
      steps: [
        { id: 'a', tool: 'search_forum', args: { query: 'cache', page: 2 }, status: 'completed', resultCount: 12, turn: 0 },
        { tool: 'read_topic', args: { topic_id: '77' }, status: 'bogus', topicId: '77', sourceId: 'S1', turn: 1 },
        { args: {} },
        ...Array.from({ length: MAX_AGENT_STEPS + 5 }, () => ({ tool: 'list_latest' }))
      ],
      transcript: [
        { role: 'user', content: 'GOAL' },
        { role: 'system', content: 'dropped' },
        { role: 'assistant', content: '{}' }
      ],
      turns: [{ id: 't', question: 'q', answer: 'a [S1]' }],
      budget: { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 }
    },
    100
  );
  assert.equal(activity.steps.length, MAX_AGENT_STEPS);
  assert.deepEqual(activity.steps[0].args, { query: 'cache', page: '2' });
  assert.equal(activity.steps[1].status, 'completed', 'unknown status reads as completed');
  assert.equal(activity.steps[1].sourceId, 'S1');
  assert.deepEqual(
    activity.transcript.map(message => message.role),
    ['user', 'assistant']
  );
  assert.equal(activity.turns[0].answer, 'a [S1]');
  assert.deepEqual(activity.budget, { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 });
  assert.equal(buildAgentActivityIndexEntry(activity).stepCount, MAX_AGENT_STEPS);

  const legacy = normalizeAgentActivity(
    { ...base, schemaVersion: 1, searchQueries: [{ query: 'old', resultCount: 3 }], answer: 'Old answer' },
    100
  );
  assert.deepEqual(legacy.steps, []);
  assert.equal(legacy.schemaVersion, 1);
  assert.equal(agentStepsOf(legacy).length, 1);
  assert.equal(agentStepText(agentStepsOf(legacy)[0]), 'Searched “old” · 3 results');
  assert.equal(agentTurnsOf(legacy)[0].answer, 'Old answer');
});

test('describes each step in plain words', () => {
  const text = step => agentStepText({ status: 'completed', ...step });
  assert.equal(
    text({ tool: 'search_forum', args: { query: 'rate limit streaming' }, resultCount: 12 }),
    'Searched “rate limit streaming” · 12 results'
  );
  assert.equal(text({ tool: 'search_forum', args: { query: 'x', page: '2' }, resultCount: 1 }), 'Searched “x” (page 2) · 1 result');
  assert.equal(text({ tool: 'list_latest', resultCount: 30 }), 'Listed latest topics · 30 topics');
  assert.equal(
    text({ tool: 'read_topic', args: { topic_id: '5' }, title: 'Topic title', resultCount: 42 }),
    'Read “Topic title” (42 posts)'
  );
  assert.equal(text({ tool: 'saved_summaries', args: {}, resultCount: 3 }), 'Checked your saved summaries · 3 found');
  assert.equal(describeAgentStep({ tool: 'search_forum', args: { query: 'q' }, status: 'running' }).label, 'Searching “q”…');
  assert.equal(describeAgentStep({ tool: 'read_topic', args: { topic_id: '9' }, status: 'failed' }).label, 'Could not read topic 9');
  assert.equal(describeAgentStep({ tool: 'plan', status: 'failed' }).label, 'The model did not reply with a valid action');
});

test('a follow-up adds a turn to the same run; an unanswered follow-up is replaced', () => {
  const answered = normalizeAgentActivity(
    {
      ...base,
      status: AGENT_ACTIVITY_STATUS.COMPLETED,
      completedAt: 50,
      steps: [{ id: 's1', tool: 'search_forum', args: { query: 'a' }, turn: 0 }],
      transcript: [
        { role: 'user', content: 'GOAL' },
        { role: 'assistant', content: 'final' }
      ],
      turns: [{ id: 'task-1', question: base.question, answer: 'First', startedAt: 1, completedAt: 50 }]
    },
    100
  );
  const queued = appendAgentTurn(answered, { taskId: 'task-2', question: 'And with CDN?', now: 200 });
  assert.equal(queued.status, AGENT_ACTIVITY_STATUS.QUEUED);
  assert.equal(queued.taskId, 'task-2');
  assert.equal(queued.completedAt, 0);
  assert.equal(queued.turns.length, 2);
  assert.equal(queued.steps.length, 1, 'earlier steps stay');
  assert.equal(currentAgentTurnIndex(queued), 1);

  // The follow-up started (message and a step added), then failed.
  const failed = normalizeAgentActivity(
    {
      ...queued,
      status: AGENT_ACTIVITY_STATUS.FAILED,
      steps: [...queued.steps, { id: 's2', tool: 'list_latest', turn: 1 }],
      transcript: [...queued.transcript, { role: 'user', content: 'FOLLOW-UP' }],
      turns: [queued.turns[0], { ...queued.turns[1], startedAt: 300, transcriptStart: 2 }]
    },
    100
  );
  const again = appendAgentTurn(failed, { taskId: 'task-3', question: 'And with CDN?', now: 400 });
  assert.equal(again.turns.length, 2, 'replaced, not stacked');
  assert.equal(again.turns[1].id, 'task-3');
  assert.equal(again.steps.length, 1);
  assert.equal(again.transcript.length, 2);
});

test('compacts the oldest observations first and keeps the goal and the newest messages', () => {
  const big = 'x'.repeat(MAX_AGENT_TRANSCRIPT_CHARS / 2);
  const transcript = [
    { role: 'user', content: 'GOAL' },
    { role: 'assistant', content: '{"tool":"read_topic"}' },
    { role: 'user', content: `OBSERVATION from read_topic:\n${big}` },
    { role: 'assistant', content: '{"tool":"read_topic"}' },
    { role: 'user', content: `OBSERVATION from read_topic:\n${big}` },
    { role: 'assistant', content: '{"tool":"read_topic"}' },
    { role: 'user', content: `OBSERVATION from read_topic:\n${big}` }
  ];
  const compacted = compactAgentTranscript(transcript);
  assert.equal(compacted[0].content, 'GOAL');
  assert.ok(compacted[2].content.length < 2000, 'oldest observation trimmed');
  assert.match(compacted[2].content, /trimmed/);
  assert.equal(compacted.at(-1).content, transcript.at(-1).content, 'newest stays whole');
  assert.ok(compacted.reduce((sum, message) => sum + message.content.length, 0) <= MAX_AGENT_TRANSCRIPT_CHARS);
  assert.equal(transcript[2].content.length > 100000, true, 'input is not mutated');
});
