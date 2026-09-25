import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AGENT_ACTIVITY_STATUS,
  MAX_AGENT_SEARCH_QUERIES,
  MAX_AGENT_SOURCES,
  MAX_AGENT_TOOL_CALLS,
  createAgentActivity,
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
  assert.equal(activity.searchQueries.length, MAX_AGENT_SEARCH_QUERIES);
  assert.equal(activity.toolCalls.length, MAX_AGENT_TOOL_CALLS);
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
