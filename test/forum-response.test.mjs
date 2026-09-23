import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FORUM_RESPONSE_KIND,
  MAX_UNKNOWN_TOPIC_PAGES,
  classifyForumResponse,
  collectRawPages,
  forumAccessError,
  isLoginRedirect,
  looksLikeHtml,
  rawPageContent
} from '../src/shared/forum-response.mjs';

const SITE = 'https://community.openai.com';
const RAW = 'alice | 2024-01-01 | #1\n\nHello\n\n-------------------------\n';

test('recognizes HTML bodies and content types', () => {
  assert.equal(looksLikeHtml('<!DOCTYPE html><html></html>'), true);
  assert.equal(looksLikeHtml('  <html lang="en">'), true);
  assert.equal(looksLikeHtml('plain', 'text/html; charset=utf-8'), true);
  assert.equal(looksLikeHtml(RAW, 'text/plain; charset=utf-8'), false);
  assert.equal(looksLikeHtml('<b>markdown with html</b>'), false);
});

test('detects redirects to login, SSO, or another origin', () => {
  assert.equal(isLoginRedirect({ redirected: true, url: `${SITE}/login` }, SITE), true);
  assert.equal(isLoginRedirect({ redirected: true, url: `${SITE}/session/sso` }, SITE), true);
  assert.equal(isLoginRedirect({ redirected: true, url: `${SITE}/auth/google_oauth2` }, SITE), true);
  assert.equal(isLoginRedirect({ redirected: true, url: 'https://idp.example.com/sso' }, SITE), true);
  assert.equal(
    isLoginRedirect({ redirected: true, url: 'https://example.com/forum/login' }, 'https://example.com/forum'),
    true
  );
  assert.equal(isLoginRedirect({ redirected: true, url: `${SITE}/t/slug/12.json` }, SITE), false);
  assert.equal(isLoginRedirect({ redirected: false, url: `${SITE}/login` }, SITE), false);
});

test('classifies Discourse login_required and private-topic responses', () => {
  const classify = (snapshot, expect = 'text') => classifyForumResponse(snapshot, SITE, { expect });

  assert.equal(classify({ status: 200, body: RAW, contentType: 'text/plain' }), FORUM_RESPONSE_KIND.OK);
  assert.equal(classify({ status: 200, body: '' }), FORUM_RESPONSE_KIND.EMPTY);
  // Anonymous /raw/ on a login_required site follows a redirect to /login.
  assert.equal(classify({
    status: 200,
    redirected: true,
    url: `${SITE}/login`,
    contentType: 'text/html',
    body: '<!DOCTYPE html><html></html>'
  }), FORUM_RESPONSE_KIND.LOGIN_REQUIRED);
  assert.equal(
    classify({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><html>Log in</html>' }),
    FORUM_RESPONSE_KIND.LOGIN_REQUIRED
  );
  // Maintenance or overload 503s are transient; only challenge pages need the user.
  assert.equal(
    classify({ status: 503, contentType: 'text/html', body: '<html>Maintenance</html>' }),
    FORUM_RESPONSE_KIND.HTTP_ERROR
  );
  assert.equal(
    classify({ status: 503, contentType: 'text/html', body: '<html>Just a moment... cf-chl-</html>' }),
    FORUM_RESPONSE_KIND.CHALLENGE
  );
  // Anonymous JSON on a login_required site is a 403 not_logged_in error.
  assert.equal(classify({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ error_type: 'not_logged_in' })
  }, 'json'), FORUM_RESPONSE_KIND.LOGIN_REQUIRED);
  assert.equal(classify({ status: 403, body: '{"error_type":"invalid_access"}' }, 'json'), FORUM_RESPONSE_KIND.LOGIN_REQUIRED);
  assert.equal(classify({ status: 404, body: '' }), FORUM_RESPONSE_KIND.NOT_FOUND);
  assert.equal(classify({ status: 403, body: 'Just a moment... cf-chl-' }), FORUM_RESPONSE_KIND.CHALLENGE);
  assert.equal(classify({ status: 500, body: 'oops' }), FORUM_RESPONSE_KIND.HTTP_ERROR);
});

test('turns raw responses into content or actionable errors', () => {
  assert.equal(rawPageContent({ status: 200, body: RAW }, SITE), RAW);
  assert.equal(rawPageContent({ status: 200, body: '  ' }, SITE), '');
  assert.throws(
    () => rawPageContent({ status: 200, redirected: true, url: `${SITE}/login`, body: '<html>' }, SITE),
    error => error.needsUserAction === true
      && /Log in to community\.openai\.com in this browser/.test(error.message)
  );
  assert.throws(
    () => rawPageContent({ status: 502, body: 'bad gateway' }, SITE),
    error => error.status === 502 && error.needsUserAction !== true
  );
  const error = forumAccessError(FORUM_RESPONSE_KIND.LOGIN_REQUIRED, SITE, { status: 403 });
  assert.equal(error.retryable, false);
  assert.equal(error.status, 403);
});

test('stops reading raw pages at the first empty page', async () => {
  const pages = ['one', 'two', ''];
  const delays = [];
  const result = await collectRawPages({
    fetchPage: async page => pages[page - 1],
    betweenPages: async () => delays.push(true)
  });

  assert.deepEqual(result.rawPages, [
    { page: 1, content: 'one' },
    { page: 2, content: 'two' }
  ]);
  assert.equal(result.truncated, false);
  assert.equal(delays.length, 2);
});

test('caps raw page reading when a forum never returns an empty page', async () => {
  let requests = 0;
  const result = await collectRawPages({
    fetchPage: async () => {
      requests++;
      return 'never-ending content';
    },
    maxPages: 5
  });

  assert.equal(requests, 5);
  assert.equal(result.rawPages.length, 5);
  assert.equal(result.truncated, true);
  assert.ok(Number.isInteger(MAX_UNKNOWN_TOPIC_PAGES) && MAX_UNKNOWN_TOPIC_PAGES > 0);
});

test('propagates access failures instead of looping', async () => {
  let requests = 0;
  await assert.rejects(
    () => collectRawPages({
      fetchPage: async () => {
        requests++;
        return rawPageContent({
          status: 200,
          redirected: true,
          url: `${SITE}/login`,
          contentType: 'text/html',
          body: '<!DOCTYPE html>'
        }, SITE);
      }
    }),
    error => error.needsUserAction === true
  );
  assert.equal(requests, 1);
});
