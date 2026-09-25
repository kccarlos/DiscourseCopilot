import assert from 'node:assert/strict';
import test from 'node:test';

import { extractForumTopicId } from '../src/shared/topic-route.mjs';

test('detects Discourse topic routes with and without a slug', () => {
  assert.equal(extractForumTopicId('https://www.uscardforum.com/t/topic-name/517303'), '517303');
  assert.equal(extractForumTopicId('https://uscardforum.com/t/517303/2?search=one#reply'), '517303');
  assert.equal(extractForumTopicId('https://community.openai.com/t/some-topic/123/7'), '123');
});

test('is host-agnostic because URL checks cannot prove a site runs Discourse', () => {
  assert.equal(extractForumTopicId('https://uscardforum.com.example/t/topic/517303'), '517303');
});

test('rejects forum indexes, nested paths, and malformed URLs', () => {
  assert.equal(extractForumTopicId('https://www.uscardforum.com/latest'), null);
  assert.equal(extractForumTopicId('https://www.uscardforum.com/tags/cards'), null);
  assert.equal(extractForumTopicId('https://example.com/blog/t/topic/517303'), null);
  assert.equal(extractForumTopicId('ftp://example.com/t/topic/517303'), null);
  assert.equal(extractForumTopicId('not a URL'), null);
});

test('extracts topics below a subfolder base path only when it matches', () => {
  assert.equal(extractForumTopicId('https://example.com/forum/t/slug/42', '/forum'), '42');
  assert.equal(extractForumTopicId('https://example.com/forum/t/42/3', 'forum/'), '42');
  assert.equal(extractForumTopicId('https://example.com/t/slug/42', '/forum'), null);
  assert.equal(extractForumTopicId('https://example.com/forumx/t/slug/42', '/forum'), null);
  assert.equal(extractForumTopicId('https://example.com/forum/t/slug/42'), null);
});
