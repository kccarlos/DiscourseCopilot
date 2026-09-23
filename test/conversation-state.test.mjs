import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendChatMessage,
  findTabForForumTarget,
  getTopicContext,
  normalizeChatQuestion,
  prepareChatEdit,
  topicKeyFromUrl
} from '../src/popup/conversation-state.mjs';

test('falls back to URL parsing when no content script answered', () => {
  assert.deepEqual(
    getTopicContext({
      id: 7,
      url: 'https://www.uscardforum.com/t/a-useful-slug/12345/88',
      title: 'A useful topic'
    }),
    {
      tabId: 7,
      url: 'https://www.uscardforum.com/t/a-useful-slug/12345/88',
      title: 'A useful topic',
      isDiscourse: false,
      detectedBy: 'url',
      siteUrl: 'https://www.uscardforum.com',
      forumName: 'www.uscardforum.com',
      postId: '12345',
      topicKey: 'www.uscardforum.com/t/12345',
      isForumTopic: true,
      pageKey: '7:www.uscardforum.com/t/12345'
    }
  );
});

test('prefers content-script state, including subfolder forums', () => {
  const context = getTopicContext(
    { id: 3, url: 'https://example.com/forum/t/slug/42/5', title: 'Topic' },
    {
      url: 'https://example.com/forum/t/slug/42/5',
      isDiscourse: true,
      isForumPage: true,
      isForumTopic: true,
      postId: '42',
      topicId: '42',
      siteUrl: 'https://example.com/forum',
      basePath: '/forum',
      forumName: 'Example Community',
      topicKey: 'example.com/forum/t/42'
    }
  );

  assert.equal(context.isDiscourse, true);
  assert.equal(context.detectedBy, 'content');
  assert.equal(context.siteUrl, 'https://example.com/forum');
  assert.equal(context.forumName, 'Example Community');
  assert.equal(context.postId, '42');
  assert.equal(context.topicKey, 'example.com/forum/t/42');
  assert.equal(context.pageKey, '3:example.com/forum/t/42');
});

test('content-script state overrides URL guesses on non-Discourse pages', () => {
  const context = getTopicContext(
    { id: 1, url: 'https://blog.example/t/topic/12' },
    { url: 'https://blog.example/t/topic/12', isDiscourse: false }
  );

  assert.equal(context.isDiscourse, false);
  assert.equal(context.isForumTopic, false);
  assert.equal(context.topicKey, '');
  assert.equal(context.pageKey, '1:none');
});

test('ignores a stale content-script answer from the previous page', () => {
  const context = getTopicContext(
    { id: 1, url: 'https://community.openai.com/t/new-topic/99' },
    {
      url: 'https://community.openai.com/t/old-topic/12',
      isDiscourse: true,
      topicId: '12',
      postId: '12',
      siteUrl: 'https://community.openai.com'
    }
  );

  assert.equal(context.detectedBy, 'url');
  assert.equal(context.topicKey, 'community.openai.com/t/99');
});

test('uses a saved site URL hint to identify subfolder topics without a content script', () => {
  const context = getTopicContext(
    { id: 1, url: 'https://example.com/forum/t/slug/42' },
    null,
    { siteUrlHint: 'https://example.com/forum' }
  );

  assert.equal(context.topicKey, 'example.com/forum/t/42');
});

test('rejects non-topic pages and non-https remote hosts', () => {
  assert.equal(
    getTopicContext({ id: 1, url: 'https://www.uscardforum.com/latest' }).isForumTopic,
    false
  );
  assert.equal(
    getTopicContext({ id: 1, url: 'http://example.com/t/topic/12' }).isForumTopic,
    false
  );
  assert.equal(getTopicContext({ id: 1, url: 'chrome://extensions' }).isForumTopic, false);
});

test('changes page identity when the tab, topic, or forum changes', () => {
  const first = getTopicContext({ id: 1, url: 'https://www.uscardforum.com/t/topic/12' });
  const nextTopic = getTopicContext({ id: 1, url: 'https://www.uscardforum.com/t/topic/13' });
  const nextTab = getTopicContext({ id: 2, url: 'https://www.uscardforum.com/t/topic/12' });
  const nextForum = getTopicContext({ id: 1, url: 'https://community.openai.com/t/topic/12' });

  assert.notEqual(first.pageKey, nextTopic.pageKey);
  assert.notEqual(first.pageKey, nextTab.pageKey);
  assert.notEqual(first.pageKey, nextForum.pageKey);
});

test('normalizes and bounds chat questions', () => {
  assert.equal(normalizeChatQuestion('  follow up?  '), 'follow up?');
  assert.equal(normalizeChatQuestion('abcdef', 4), 'abcd');
  assert.equal(normalizeChatQuestion(null), '');
});

test('keeps only the most recent bounded chat history', () => {
  const history = [
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'two' }
  ];

  assert.deepEqual(appendChatMessage(history, 'user', 'three', 2), [
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' }
  ]);
});

test('prepares a new chat branch from an edited user message', () => {
  const history = [
    { role: 'user', content: 'first', taskId: 'task-1' },
    { role: 'assistant', content: 'answer one', taskId: 'task-1' },
    { role: 'user', content: 'second', taskId: 'task-2' },
    { role: 'assistant', content: 'answer two', taskId: 'task-2' },
    { role: 'user', content: 'third', taskId: 'task-3' }
  ];

  assert.deepEqual(prepareChatEdit(history, 2), {
    prompt: 'second',
    history: [
      { role: 'user', content: 'first', taskId: 'task-1' },
      { role: 'assistant', content: 'answer one', taskId: 'task-1' }
    ],
    removedTaskIds: ['task-2', 'task-3']
  });
  assert.equal(prepareChatEdit(history, 1), null);
  assert.equal(prepareChatEdit(history, 99), null);
});

test('derives the topic key from any URL form of a topic', () => {
  const site = 'https://forum.example.com';
  for (const url of [
    'https://forum.example.com/t/some-slug/123',
    'https://forum.example.com/t/some-slug/123/45',
    'https://forum.example.com/t/123?u=someone#reply',
    'https://forum.example.com/t/123/'
  ]) {
    assert.equal(topicKeyFromUrl(url, site), 'forum.example.com/t/123', url);
  }
  assert.equal(topicKeyFromUrl('https://other.example.com/t/slug/123', site), '');
  assert.equal(topicKeyFromUrl('https://forum.example.com/latest', site), '');
  assert.equal(topicKeyFromUrl('not a url', site), '');
  assert.equal(
    topicKeyFromUrl('https://example.com/forum/t/slug/9/2', 'https://example.com/forum'),
    'example.com/forum/t/9'
  );
  assert.equal(topicKeyFromUrl('https://example.com/t/slug/9', 'https://example.com/forum'), '');
});

test('finds a tab already showing the topic, else any tab on the forum', () => {
  const site = 'https://forum.example.com';
  const tabs = [
    { id: 1, url: 'https://forum.example.com/latest' },
    { id: 2, url: 'https://forum.example.com/t/other/7' },
    { id: 3, url: 'https://forum.example.com/t/slug/123/88?page=2' },
    { id: 4, url: 'https://forum.example.com/t/123', active: true },
    { url: 'https://forum.example.com/t/123' }
  ];
  const topicKey = 'forum.example.com/t/123';
  assert.equal(findTabForForumTarget(tabs, { siteUrl: site, topicKey }).id, 4);
  assert.equal(findTabForForumTarget(tabs.slice(0, 3), { siteUrl: site, topicKey }).id, 3);
  assert.equal(findTabForForumTarget(tabs.slice(0, 2), { siteUrl: site, topicKey }), null);
  assert.equal(findTabForForumTarget(tabs.slice(0, 2), { siteUrl: site }).id, 1);
  assert.equal(
    findTabForForumTarget([{ id: 9, url: 'https://elsewhere.example.com/' }], { siteUrl: site }),
    null
  );
  assert.equal(findTabForForumTarget(null, { siteUrl: site }), null);
});
