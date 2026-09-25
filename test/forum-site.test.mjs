import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRawPageUrl,
  buildSiteUrl,
  buildTopicJsonUrl,
  buildTopicKey,
  forumDisplayName,
  isSameForumUrl,
  normalizeBasePath,
  normalizeSiteUrl,
  parseSiteUrl,
  siteUrlFromPageUrl
} from '../src/shared/forum-site.mjs';

test('normalizes Discourse base paths', () => {
  assert.equal(normalizeBasePath(''), '');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(normalizeBasePath('/forum'), '/forum');
  assert.equal(normalizeBasePath('forum/'), '/forum');
  assert.equal(normalizeBasePath('/community/forum//'), '/community/forum');
  assert.equal(normalizeBasePath('/forum?x=1'), '');
  assert.equal(normalizeBasePath('/for um'), '');
  assert.equal(normalizeBasePath('/../admin'), '');
  assert.equal(normalizeBasePath(null), '');
});

test('builds site URLs with https, or http only for local development', () => {
  assert.equal(buildSiteUrl('https://community.openai.com/'), 'https://community.openai.com');
  assert.equal(buildSiteUrl('https://Example.com:8443/x', '/forum'), 'https://example.com:8443/forum');
  assert.equal(buildSiteUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(buildSiteUrl('http://127.0.0.1:4200', 'forum'), 'http://127.0.0.1:4200/forum');
  assert.equal(buildSiteUrl('http://example.com'), '');
  assert.equal(buildSiteUrl('ftp://example.com'), '');
  assert.equal(buildSiteUrl('not a url'), '');
});

test('parses only clean site URLs', () => {
  assert.deepEqual(parseSiteUrl('https://example.com/forum/'), {
    origin: 'https://example.com',
    basePath: '/forum'
  });
  assert.deepEqual(parseSiteUrl('https://community.openai.com'), {
    origin: 'https://community.openai.com',
    basePath: ''
  });
  assert.equal(parseSiteUrl('https://example.com/forum?x=1'), null);
  assert.equal(parseSiteUrl('https://user:pass@example.com'), null);
  assert.equal(parseSiteUrl('http://example.com'), null);
  assert.equal(parseSiteUrl(''), null);
  assert.equal(normalizeSiteUrl('https://EXAMPLE.com/forum/'), 'https://example.com/forum');
});

test('derives the site URL from a page URL and base path', () => {
  assert.equal(siteUrlFromPageUrl('https://community.openai.com/t/topic/1?x=1'), 'https://community.openai.com');
  assert.equal(siteUrlFromPageUrl('https://example.com/forum/t/slug/42', '/forum'), 'https://example.com/forum');
  assert.equal(siteUrlFromPageUrl('https://example.com/other/t/42', '/forum'), '');
  assert.equal(siteUrlFromPageUrl('http://example.com/t/42'), '');
});

test('builds forum-scoped topic keys that differ across forums', () => {
  assert.equal(buildTopicKey('https://community.openai.com', '123'), 'community.openai.com/t/123');
  assert.equal(buildTopicKey('https://Example.com/forum', 42), 'example.com/forum/t/42');
  assert.equal(buildTopicKey('https://example.com:8443', '1'), 'example.com:8443/t/1');
  assert.notEqual(buildTopicKey('https://community.openai.com', '123'), buildTopicKey('https://www.uscardforum.com', '123'));
  assert.equal(buildTopicKey('https://example.com', 'abc'), '');
  assert.equal(buildTopicKey('https://example.com', '0'), '');
  assert.equal(buildTopicKey('', '123'), '');
});

test('builds topic JSON and raw URLs under the base path and rejects bad identities', () => {
  assert.equal(buildTopicJsonUrl('https://example.com/forum', '42'), 'https://example.com/forum/t/42.json');
  assert.equal(buildRawPageUrl('https://community.openai.com', '42', 3), 'https://community.openai.com/raw/42?page=3');
  assert.throws(() => buildTopicJsonUrl('', '42'), /forum site URL/);
  assert.throws(() => buildRawPageUrl('https://example.com', 'x', 1), /topic ID/);
  assert.throws(() => buildRawPageUrl('https://example.com', '42', 0), /page/);
});

test('matches forum URLs strictly by origin and base path', () => {
  const site = 'https://www.uscardforum.com';
  assert.equal(isSameForumUrl('https://www.uscardforum.com/t/x/1', site), true);
  assert.equal(isSameForumUrl('https://uscardforum.com/t/x/1', site), false);
  assert.equal(isSameForumUrl('https://evil.com/t/x/1', site), false);
  assert.equal(isSameForumUrl('https://www.uscardforum.com.evil.com/t/x/1', site), false);
  assert.equal(isSameForumUrl('https://evil.com/?u=https://www.uscardforum.com', site), false);
  assert.equal(isSameForumUrl('http://www.uscardforum.com/t/x/1', site), false);
  assert.equal(isSameForumUrl('https://www.uscardforum.com:444/t/x/1', site), false);
  assert.equal(isSameForumUrl('not a url', site), false);

  const subfolder = 'https://example.com/forum';
  assert.equal(isSameForumUrl('https://example.com/forum', subfolder), true);
  assert.equal(isSameForumUrl('https://example.com/forum/t/x/1', subfolder), true);
  assert.equal(isSameForumUrl('https://example.com/t/x/1', subfolder), false);
  assert.equal(isSameForumUrl('https://example.com/forumx/t/x/1', subfolder), false);
});

test('uses the forum name when present and falls back to the hostname', () => {
  assert.equal(forumDisplayName('https://community.openai.com', ' OpenAI Developer Community '), 'OpenAI Developer Community');
  assert.equal(forumDisplayName('https://example.com/forum', ''), 'example.com');
  assert.equal(forumDisplayName('', ''), '');
});
