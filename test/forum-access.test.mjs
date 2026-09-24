// Per-forum host access: permission helpers, the manifest they rely on, and
// the dynamic content script registration.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  FORUM_ACCESS_ERROR_CODE,
  FORUM_CONTENT_SCRIPT_FILE,
  REQUIRED_HOST_PATTERNS,
  createForumAccessError,
  forumAccessHost,
  forumOriginPattern,
  forumOriginsFromPatterns,
  hasForumAccess,
  hostPatternForUrl,
  injectForumContentScript,
  isForumAccessError,
  listGrantedForums,
  originFromPattern,
  planContentScriptSync,
  requestForumAccess,
  requestServerAccess,
  revokeForumAccess,
  serverNeedsAccessPrompt,
  subscribeForumAccess,
  syncForumContentScripts
} from '../src/shared/forum-access.mjs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

function fakePermissions(initial = []) {
  const granted = new Set([...REQUIRED_HOST_PATTERNS, ...initial]);
  const listeners = { added: [], removed: [] };
  const calls = [];
  const event = list => ({
    addListener: fn => list.push(fn),
    removeListener: fn => list.splice(list.indexOf(fn), 1)
  });
  return {
    granted,
    listeners,
    calls,
    answer: true,
    async contains({ origins }) {
      return origins.every(origin => granted.has(origin));
    },
    request({ origins }) {
      calls.push(['request', origins]);
      if (this.answer) {
        origins.forEach(origin => granted.add(origin));
      }
      return Promise.resolve(this.answer);
    },
    async remove({ origins }) {
      calls.push(['remove', origins]);
      origins.forEach(origin => granted.delete(origin));
      return true;
    },
    async getAll() {
      return { origins: [...granted], permissions: ['storage'] };
    },
    onAdded: event(listeners.added),
    onRemoved: event(listeners.removed)
  };
}

function fakeScripting() {
  const registered = new Map();
  const calls = [];
  return {
    registered,
    calls,
    failTabs: new Set(),
    async getRegisteredContentScripts({ ids }) {
      return ids.map(id => registered.get(id)).filter(Boolean);
    },
    async registerContentScripts(scripts) {
      calls.push('register');
      for (const script of scripts) {
        if (registered.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`);
        if (!script.matches?.length) throw new Error('Script must specify at least one match');
        registered.set(script.id, { ...script });
      }
    },
    async updateContentScripts(scripts) {
      calls.push('update');
      for (const script of scripts) registered.set(script.id, { ...registered.get(script.id), ...script });
    },
    async unregisterContentScripts({ ids }) {
      calls.push('unregister');
      ids.forEach(id => registered.delete(id));
    },
    async executeScript({ target, files }) {
      if (this.failTabs.has(target.tabId)) throw new Error('Cannot access contents of the page');
      calls.push(['execute', target.tabId, files]);
      return [];
    }
  };
}

// ---------- manifest ----------

test('the manifest asks for provider hosts only; forums are optional', () => {
  const text = JSON.stringify(manifest);
  assert.ok(!text.includes('<all_urls>'), 'no <all_urls> anywhere');
  assert.equal(manifest.content_scripts, undefined, 'the content script is registered at runtime');
  assert.deepEqual([...manifest.host_permissions].sort(), [...REQUIRED_HOST_PATTERNS].sort());
  assert.ok(manifest.optional_host_permissions.includes('https://*/*'));
  for (const permission of ['scripting', 'activeTab', 'storage', 'sidePanel', 'alarms']) {
    assert.ok(manifest.permissions.includes(permission), permission);
  }
  assert.ok(!manifest.permissions.includes('tabs'), 'no "Read your browsing history" warning');
});

test('provider API hosts and localhost are required host patterns', () => {
  for (const pattern of [
    'https://openrouter.ai/*',
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    'https://api.groq.com/*',
    'https://generativelanguage.googleapis.com/*',
    'https://api.x.ai/*',
    'https://api.deepseek.com/*',
    'http://localhost/*',
    'http://127.0.0.1/*'
  ]) {
    assert.ok(REQUIRED_HOST_PATTERNS.includes(pattern), pattern);
  }
});

// ---------- patterns ----------

test('a forum grant covers its origin: subfolders and ports share it', () => {
  assert.equal(forumOriginPattern('https://meta.discourse.org'), 'https://meta.discourse.org/*');
  assert.equal(forumOriginPattern('https://example.com/forum'), 'https://example.com/*');
  assert.equal(forumOriginPattern('https://example.com:8443/forum'), 'https://example.com/*');
  assert.equal(forumOriginPattern('http://forum.example.com'), '', 'plain http forums are not supported');
  assert.equal(forumOriginPattern('not a url'), '');
  assert.equal(hostPatternForUrl('http://192.168.1.20:11434/v1'), 'http://192.168.1.20/*');
  assert.equal(hostPatternForUrl('chrome://extensions'), '');
  assert.equal(originFromPattern('https://meta.discourse.org/*'), 'https://meta.discourse.org');
  assert.equal(originFromPattern('https://*/*'), '');
  assert.equal(originFromPattern('<all_urls>'), '');
  assert.equal(forumAccessHost('https://example.com/forum'), 'example.com');
});

test('granted forums exclude provider hosts, wildcards and excluded servers', () => {
  const origins = forumOriginsFromPatterns([
    ...REQUIRED_HOST_PATTERNS,
    'https://*/*',
    'https://meta.discourse.org/*',
    'https://community.openai.com/*',
    'https://community.openai.com/*',
    'http://192.168.1.20/*'
  ], { exclude: ['http://192.168.1.20/*'] });
  assert.deepEqual(origins, ['https://community.openai.com', 'https://meta.discourse.org']);
});

test('the access error carries a code and an actionable message', () => {
  const error = createForumAccessError('https://forum.example.com/sub');
  assert.equal(error.code, FORUM_ACCESS_ERROR_CODE);
  assert.equal(error.needsUserAction, true);
  assert.equal(error.message, 'Allow DiscourseCopilot on forum.example.com in the side panel, then try again.');
  assert.ok(isForumAccessError(error));
  assert.ok(isForumAccessError({ code: FORUM_ACCESS_ERROR_CODE, message: 'stored' }));
  assert.ok(!isForumAccessError(new Error('other')));
});

// ---------- permissions ----------

test('hasForumAccess checks the origin and never throws', async () => {
  const permissions = fakePermissions(['https://meta.discourse.org/*']);
  assert.equal(await hasForumAccess('https://meta.discourse.org', { permissions }), true);
  assert.equal(await hasForumAccess('https://meta.discourse.org/t/x/1', { permissions }), true);
  assert.equal(await hasForumAccess('https://other.example', { permissions }), false);
  assert.equal(await hasForumAccess('http://localhost:3000', { permissions }), true, 'manifest host');
  assert.equal(await hasForumAccess('', { permissions }), false);
  assert.equal(await hasForumAccess('https://x.example', {
    permissions: { contains: async () => { throw new Error('boom'); } }
  }), false);
  assert.equal(await hasForumAccess('https://x.example', { permissions: undefined }), false);
});

test('requestForumAccess asks synchronously, inside the gesture', async () => {
  const permissions = fakePermissions();
  const pending = requestForumAccess('https://meta.discourse.org/forum', { permissions });
  // The request reached Chrome before anything was awaited.
  assert.deepEqual(permissions.calls, [['request', ['https://meta.discourse.org/*']]]);
  assert.equal(await pending, true);
  assert.ok(permissions.granted.has('https://meta.discourse.org/*'));

  permissions.answer = false;
  assert.equal(await requestForumAccess('https://denied.example', { permissions }), false);
  assert.equal(await requestForumAccess('https://x.example', {
    permissions: { request: () => { throw new Error('not in a gesture'); } }
  }), false);
  assert.equal(await requestForumAccess('https://x.example', {
    permissions: { request: () => Promise.reject(new Error('nope')) }
  }), false);
  assert.equal(await requestForumAccess('garbage', { permissions }), false);
  const before = permissions.calls.length;
  assert.equal(await requestForumAccess('http://127.0.0.1:8080', { permissions }), true);
  assert.equal(permissions.calls.length, before, 'manifest hosts need no prompt');
});

test('revoke and list granted forums', async () => {
  const permissions = fakePermissions(['https://a.example/*', 'https://b.example/*']);
  assert.deepEqual(await listGrantedForums({ permissions }), ['https://a.example', 'https://b.example']);
  assert.equal(await revokeForumAccess('https://a.example', { permissions }), true);
  assert.deepEqual(await listGrantedForums({ permissions }), ['https://b.example']);
  assert.equal(await revokeForumAccess('https://api.openai.com', { permissions }), false, 'required hosts stay');
  assert.deepEqual(await listGrantedForums({ permissions: undefined }), []);
});

test('subscribeForumAccess reports forum changes only and unsubscribes', () => {
  const permissions = fakePermissions();
  const events = [];
  const unsubscribe = subscribeForumAccess(event => events.push(event), { permissions });
  permissions.listeners.added[0]({ origins: ['https://a.example/*'] });
  permissions.listeners.added[0]({ permissions: ['alarms'] });
  permissions.listeners.removed[0]({ origins: ['https://a.example/*'] });
  assert.deepEqual(events, [
    { type: 'added', origins: ['https://a.example'] },
    { type: 'removed', origins: ['https://a.example'] }
  ]);
  unsubscribe();
  assert.equal(permissions.listeners.added.length, 0);
  assert.equal(permissions.listeners.removed.length, 0);
});

test('custom model servers ask only when not on localhost', async () => {
  assert.equal(serverNeedsAccessPrompt('http://localhost:11434'), false);
  assert.equal(serverNeedsAccessPrompt('http://127.0.0.1:1234'), false);
  assert.equal(serverNeedsAccessPrompt('http://192.168.1.20:11434'), true);
  assert.equal(serverNeedsAccessPrompt(''), false);
  const permissions = fakePermissions();
  assert.equal(await requestServerAccess('http://192.168.1.20:11434', { permissions }), true);
  assert.deepEqual(permissions.calls, [['request', ['http://192.168.1.20/*']]]);
  assert.equal(await requestServerAccess('', { permissions }), true);
});

// ---------- content script registration ----------

test('planContentScriptSync registers, updates, unregisters or leaves it', () => {
  const origins = ['https://b.example', 'https://a.example'];
  assert.deepEqual(planContentScriptSync({ registered: null, origins }), {
    action: 'register',
    matches: ['https://a.example/*', 'https://b.example/*']
  });
  assert.equal(planContentScriptSync({
    registered: { matches: ['https://b.example/*', 'https://a.example/*'] },
    origins
  }).action, 'none');
  assert.equal(planContentScriptSync({ registered: { matches: ['https://a.example/*'] }, origins }).action, 'update');
  assert.equal(planContentScriptSync({ registered: { matches: ['https://a.example/*'] }, origins: [] }).action, 'unregister');
  assert.equal(planContentScriptSync({ registered: null, origins: [] }).action, 'none');
});

test('syncForumContentScripts follows the granted forums', async () => {
  const permissions = fakePermissions();
  const scripting = fakeScripting();
  assert.equal((await syncForumContentScripts({ scripting, permissions })).action, 'none');
  assert.equal(scripting.registered.size, 0, 'no forums: nothing registered');

  permissions.granted.add('https://meta.discourse.org/*');
  await syncForumContentScripts({ scripting, permissions });
  assert.deepEqual(scripting.registered.get('forum-content'), {
    id: 'forum-content',
    matches: ['https://meta.discourse.org/*'],
    js: [FORUM_CONTENT_SCRIPT_FILE],
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true
  });
  // Running again (every worker start) is harmless.
  await syncForumContentScripts({ scripting, permissions });
  permissions.granted.add('https://community.openai.com/*');
  await syncForumContentScripts({ scripting, permissions });
  assert.deepEqual(scripting.registered.get('forum-content').matches, [
    'https://community.openai.com/*',
    'https://meta.discourse.org/*'
  ]);
  permissions.granted.delete('https://community.openai.com/*');
  permissions.granted.delete('https://meta.discourse.org/*');
  await syncForumContentScripts({ scripting, permissions });
  assert.equal(scripting.registered.size, 0);
  assert.deepEqual(scripting.calls, ['register', 'update', 'unregister']);
});

test('a grant injects the content script into open tabs of that forum only', async () => {
  const scripting = fakeScripting();
  scripting.failTabs.add(3);
  const tabs = {
    async query({ url }) {
      assert.deepEqual(url, ['https://meta.discourse.org/*']);
      // Without access Chrome ignores `url`; every tab comes back.
      return [
        { id: 1, url: 'https://meta.discourse.org/t/x/1' },
        { id: 2, url: 'https://example.com/' },
        { id: 3, url: 'https://meta.discourse.org/latest' },
        { id: 4 }
      ];
    }
  };
  assert.equal(await injectForumContentScript(['https://meta.discourse.org'], { tabs, scripting }), 1);
  assert.deepEqual(scripting.calls, [['execute', 1, [FORUM_CONTENT_SCRIPT_FILE]]]);
  assert.equal(await injectForumContentScript([], { tabs, scripting }), 0);
});
