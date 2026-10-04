// The declarativeNetRequest rule that removes the Origin header from the
// extension's own requests to local model servers (Ollama answers 403 to the
// chrome-extension:// origin).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DiscourseCopilotConstants } from '../src/shared/constants.js';
import { readConfig } from '../src/shared/config-model.mjs';
import { REQUIRED_HOST_PATTERNS } from '../src/shared/forum-access.mjs';
import {
  LOCAL_MODEL_RULE_ID,
  LOOPBACK_HOSTS,
  buildLocalModelRule,
  customServerHosts,
  grantedCustomHosts,
  serverHost,
  syncLocalModelHeaders
} from '../src/shared/local-model-headers.mjs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';

function configWith(values = {}) {
  const { STORAGE_KEYS } = DiscourseCopilotConstants;
  return readConfig({
    [STORAGE_KEYS.OLLAMA_URL]: values.ollama,
    [STORAGE_KEYS.LMSTUDIO_URL]: values.lmstudio
  });
}

function fakeDnr(initial = []) {
  const state = { rules: [...initial], writes: 0 };
  return {
    state,
    async getDynamicRules() {
      return state.rules.map(rule => structuredClone(rule));
    },
    async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
      state.writes++;
      state.rules = [...state.rules.filter(rule => !removeRuleIds.includes(rule.id)), ...addRules.map(rule => structuredClone(rule))];
    }
  };
}

const fakePermissions = (granted = []) => ({ contains: async ({ origins }) => origins.every(origin => granted.includes(origin)) });
const runtime = { id: EXTENSION_ID };

test('the rule removes Origin only for this extension, on the loopback hosts', () => {
  const rule = buildLocalModelRule({ extensionId: EXTENSION_ID });
  assert.equal(rule.id, LOCAL_MODEL_RULE_ID);
  assert.deepEqual(rule.action, { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] });
  // Scoping: web pages are never an initiator of this rule.
  assert.deepEqual(rule.condition.initiatorDomains, [EXTENSION_ID]);
  assert.deepEqual(rule.condition.requestDomains, ['localhost', '127.0.0.1']);
  assert.ok(rule.condition.resourceTypes.includes('xmlhttprequest'));
  assert.ok(!rule.condition.resourceTypes.includes('main_frame'));
  assert.ok(!rule.condition.resourceTypes.includes('sub_frame'));
  // Only Origin is touched.
  assert.equal(rule.action.requestHeaders.length, 1);
  assert.equal(rule.condition.excludedInitiatorDomains, undefined);
});

test('the loopback hosts are exactly the manifest-granted local hosts', () => {
  const granted = REQUIRED_HOST_PATTERNS.filter(pattern => /localhost|127\.0\.0\.1/.test(pattern));
  assert.deepEqual(granted.map(pattern => new URL(pattern.replace('/*', '/')).hostname).sort(), [...LOOPBACK_HOSTS].sort());
  for (const host of LOOPBACK_HOSTS) {
    assert.ok(manifest.host_permissions.includes(`http://${host}/*`));
  }
});

test('the manifest uses the host-access flavour (no extra install warning)', () => {
  assert.ok(manifest.permissions.includes('declarativeNetRequestWithHostAccess'));
  assert.ok(!manifest.permissions.includes('declarativeNetRequest'));
  assert.ok(!manifest.permissions.includes('webRequest'));
});

test('serverHost and customServerHosts pick out non-loopback server hosts', () => {
  assert.equal(serverHost('http://LAN-Box.local:11434/'), 'lan-box.local');
  assert.equal(serverHost('http://[::1]:11434'), '[::1]');
  assert.equal(serverHost('ftp://example.com'), '');
  assert.equal(serverHost('not a url'), '');
  assert.deepEqual(customServerHosts(configWith({})), []);
  assert.deepEqual(customServerHosts(configWith({ ollama: 'http://localhost:11434', lmstudio: 'http://127.0.0.1:1234' })), []);
  assert.deepEqual(customServerHosts(configWith({ ollama: 'http://192.168.1.20:11434', lmstudio: 'http://192.168.1.20:1234' })), [
    '192.168.1.20'
  ]);
  assert.deepEqual(customServerHosts(configWith({ ollama: 'http://b.local:1', lmstudio: 'http://a.local:2' })), ['a.local', 'b.local']);
});

test('a custom host joins the rule only while access to it is granted', async () => {
  const config = configWith({ ollama: 'http://192.168.1.20:11434' });
  assert.deepEqual(await grantedCustomHosts(config, { permissions: fakePermissions([]) }), []);
  assert.deepEqual(await grantedCustomHosts(config, { permissions: fakePermissions(['http://192.168.1.20/*']) }), ['192.168.1.20']);
  assert.deepEqual(await grantedCustomHosts(config, { permissions: { contains: async () => Promise.reject(new Error('x')) } }), []);
});

test('sync writes the rule, is idempotent, adds and removes a custom host', async () => {
  const dnr = fakeDnr();
  const permissions = fakePermissions(['http://192.168.1.20/*']);
  const sync = config => syncLocalModelHeaders(config, { dnr, runtime, permissions });

  assert.equal(await sync(configWith({})), true);
  assert.equal(dnr.state.rules.length, 1);
  assert.deepEqual(dnr.state.rules[0].condition.requestDomains, ['localhost', '127.0.0.1']);

  // Same state again: nothing is rewritten.
  assert.equal(await sync(configWith({})), false);
  assert.equal(dnr.state.writes, 1);

  // A saved custom URL with granted access is added.
  assert.equal(await sync(configWith({ ollama: 'http://192.168.1.20:11434' })), true);
  assert.deepEqual(dnr.state.rules[0].condition.requestDomains, ['localhost', '127.0.0.1', '192.168.1.20']);
  assert.equal(dnr.state.rules.length, 1);

  // A URL whose access was not granted is not added.
  assert.equal(await sync(configWith({ ollama: 'http://10.0.0.5:11434' })), true);
  assert.deepEqual(dnr.state.rules[0].condition.requestDomains, ['localhost', '127.0.0.1']);

  // Back to a custom host, then the URL changes back to the default: removed.
  await sync(configWith({ lmstudio: 'http://192.168.1.20:1234' }));
  assert.ok(dnr.state.rules[0].condition.requestDomains.includes('192.168.1.20'));
  await sync(configWith({ ollama: 'http://localhost:11434' }));
  assert.deepEqual(dnr.state.rules[0].condition.requestDomains, ['localhost', '127.0.0.1']);

  // Removing the permission removes the host even though the URL is saved.
  const revoked = fakePermissions([]);
  await syncLocalModelHeaders(configWith({ ollama: 'http://192.168.1.20:11434' }), { dnr, runtime, permissions: revoked });
  assert.deepEqual(dnr.state.rules[0].condition.requestDomains, ['localhost', '127.0.0.1']);
});

test('sync replaces a stale or duplicated rule set (update, restart)', async () => {
  const dnr = fakeDnr([
    { id: LOCAL_MODEL_RULE_ID, priority: 1, action: { type: 'block' }, condition: { urlFilter: 'x' } },
    { id: 7, priority: 1, action: { type: 'block' }, condition: { urlFilter: 'y' } }
  ]);
  assert.equal(await syncLocalModelHeaders(configWith({}), { dnr, runtime, permissions: fakePermissions() }), true);
  assert.equal(dnr.state.rules.length, 1);
  assert.equal(dnr.state.rules[0].id, LOCAL_MODEL_RULE_ID);
  assert.equal(dnr.state.rules[0].action.type, 'modifyHeaders');
});

test('sync does nothing without declarativeNetRequest or an extension id', async () => {
  assert.equal(await syncLocalModelHeaders(configWith({}), { dnr: undefined, runtime, permissions: fakePermissions() }), false);
  assert.equal(await syncLocalModelHeaders(configWith({}), { dnr: fakeDnr(), runtime: {}, permissions: fakePermissions() }), false);
});
