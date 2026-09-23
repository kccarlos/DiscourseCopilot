import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentTask } from '../src/background/agent-runner.mjs';

function evidenceToolClient(siteUrl, calls = []) {
  return {
    siteUrl,
    async searchForum(args) {
      calls.push(['searchForum', args]);
      return {
        hits: [{
          postId: '101',
          topicId: '10',
          postNumber: 3,
          topicSlug: 'referral-bonuses',
          topicTitle: 'Referral bonuses',
          excerpt: 'Amex referral bonus data point',
          text: 'Amex referral bonus data point'
        }]
      };
    },
    async getTopic(args) {
      calls.push(['getTopic', args]);
      return {
        topicId: args.topicId,
        title: 'Referral bonuses',
        slug: 'referral-bonuses'
      };
    },
    async getPosts(args) {
      calls.push(['getPosts', args]);
      return {
        topicId: args.topicId,
        posts: [{
          postId: '101',
          topicId: args.topicId,
          postNumber: 3,
          text: 'The useful forum evidence is here.'
        }]
      };
    },
    async getRawPage() {
      throw new Error('raw fallback should not be needed');
    }
  };
}

test('retrieves bounded forum evidence and passes source content to answer generation', async () => {
  const calls = [];
  const patches = [];
  const toolClient = evidenceToolClient('https://community.openai.com', calls);

  let generatedSources;
  const result = await runAgentTask({
    question: 'What is the Amex referral bonus?',
    toolClient,
    onActivityPatch: async patch => patches.push(patch),
    generateAnswer: async ({ sources, onStream }) => {
      generatedSources = sources;
      onStream('Answer ');
      return 'Answer [S1]';
    }
  });

  assert.equal(result.answerStatus, 'answered');
  assert.equal(result.answer, 'Answer [S1]');
  assert.equal(result.sourceRefs.length, 1);
  assert.equal(result.sourceRefs[0].url, 'https://community.openai.com/t/referral-bonuses/10#post_101');
  assert.equal(result.sourceRefs[0].siteUrl, 'https://community.openai.com');
  assert.equal(result.sourceRefs[0].topicKey, 'community.openai.com/t/10');
  assert.equal(generatedSources[0].content, 'The useful forum evidence is here.');
  assert.deepEqual(calls.map(([name]) => name), [
    'searchForum',
    'searchForum',
    'searchForum',
    'getTopic',
    'getPosts'
  ]);
  assert.ok(patches.some(patch => patch.sourceRefs?.length === 1));
});

test('returns a clear no-results answer without calling the model', async () => {
  let generated = false;
  const searches = [];
  const result = await runAgentTask({
    question: 'Question with no matches?',
    toolClient: {
      siteUrl: 'https://community.openai.com',
      async searchForum(args) {
        searches.push(args.query);
        return { hits: [] };
      }
    },
    generateAnswer: async () => {
      generated = true;
      return 'should not run';
    }
  });

  assert.equal(generated, false);
  assert.equal(result.answerStatus, 'no_results');
  assert.match(result.answer, /could not find/i);
  assert.match(result.answer, /community\.openai\.com/);
  assert.equal(searches.length, 3);
  assert.deepEqual(searches, [
    'Question with no matches?',
    'Question with no matches',
    'Question matches'
  ]);
  assert.deepEqual(result.searchQueries.map(entry => entry.query), searches);
});

test('builds source links under a subfolder forum base path', async () => {
  const result = await runAgentTask({
    question: 'What is the Amex referral bonus?',
    toolClient: evidenceToolClient('https://example.com/forum'),
    generateAnswer: async () => 'Answer [S1]'
  });

  assert.equal(
    result.sourceRefs[0].url,
    'https://example.com/forum/t/referral-bonuses/10#post_101'
  );
  assert.equal(result.sourceRefs[0].topicKey, 'example.com/forum/t/10');
});

test('scopes source identity to the forum so equal topic IDs stay distinct', async () => {
  const run = siteUrl => runAgentTask({
    question: 'What is the Amex referral bonus?',
    toolClient: evidenceToolClient(siteUrl),
    generateAnswer: async () => 'Answer [S1]'
  });
  const [first, second] = await Promise.all([
    run('https://community.openai.com'),
    run('https://meta.discourse.org')
  ]);

  assert.equal(first.sourceRefs[0].topicId, second.sourceRefs[0].topicId);
  assert.notEqual(first.sourceRefs[0].topicKey, second.sourceRefs[0].topicKey);
  assert.match(second.sourceRefs[0].url, /^https:\/\/meta\.discourse\.org\/t\//);
});

test('refuses to run without a valid forum site on the tool client', async () => {
  let searched = false;
  await assert.rejects(
    () => runAgentTask({
      question: 'What is the Amex referral bonus?',
      toolClient: {
        siteUrl: 'javascript:alert(1)',
        async searchForum() {
          searched = true;
          return { hits: [] };
        }
      },
      generateAnswer: async () => 'unused'
    }),
    /valid forum site URL/
  );
  assert.equal(searched, false);
});
