import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

test('background service registers queue and action listeners during startup', async () => {
  const runtimeListeners = [];
  const actionListeners = [];
  const alarmListeners = [];
  const connectListeners = [];
  const installedListeners = [];
  const createdTabs = [];
  const sidePanelCalls = [];
  const storage = {};
  const sessionStorage = {};
  const permissionListeners = { added: [], removed: [] };
  const granted = new Set(['https://api.openai.com/*', 'https://www.uscardforum.com/*']);
  const registered = new Map();
  const scriptingCalls = [];

  globalThis.indexedDB = new IDBFactory();
  globalThis.IDBKeyRange = IDBKeyRange;
  globalThis.chrome = {
    action: {
      onClicked: {
        addListener(listener) {
          actionListeners.push(listener);
        }
      }
    },
    alarms: {
      async get() {
        return undefined;
      },
      create() {},
      async clear() {
        return true;
      },
      onAlarm: {
        addListener(listener) {
          alarmListeners.push(listener);
        }
      }
    },
    runtime: {
      async sendMessage() {},
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      getManifest() {
        return { options_page: 'src/settings/settings.html' };
      },
      onInstalled: {
        addListener(listener) {
          installedListeners.push(listener);
        }
      },
      onConnect: {
        addListener(listener) {
          connectListeners.push(listener);
        }
      },
      onMessage: {
        addListener(listener) {
          runtimeListeners.push(listener);
        }
      }
    },
    tabs: {
      async create(options) {
        createdTabs.push(options);
        return { id: 7, ...options };
      },
      async query() {
        return [
          { id: 11, url: 'https://meta.discourse.org/t/x/1' },
          { id: 12, url: 'https://example.com/' }
        ];
      }
    },
    permissions: {
      async contains({ origins }) {
        return origins.every(origin => granted.has(origin));
      },
      async getAll() {
        return { origins: [...granted], permissions: [] };
      },
      async remove({ origins }) {
        origins.forEach(origin => granted.delete(origin));
        return true;
      },
      onAdded: { addListener: listener => permissionListeners.added.push(listener) },
      onRemoved: { addListener: listener => permissionListeners.removed.push(listener) }
    },
    scripting: {
      async getRegisteredContentScripts({ ids }) {
        return ids.map(id => registered.get(id)).filter(Boolean);
      },
      async registerContentScripts(scripts) {
        scriptingCalls.push(['register', scripts]);
        for (const script of scripts) {
          if (registered.has(script.id)) throw new Error(`Duplicate script ID '${script.id}'`);
          registered.set(script.id, script);
        }
      },
      async updateContentScripts(scripts) {
        scriptingCalls.push(['update', scripts]);
        for (const script of scripts) registered.set(script.id, { ...registered.get(script.id), ...script });
      },
      async unregisterContentScripts({ ids }) {
        scriptingCalls.push(['unregister', ids]);
        for (const id of ids) registered.delete(id);
      },
      async executeScript(injection) {
        scriptingCalls.push(['execute', injection]);
        return [];
      }
    },
    sidePanel: {
      async open(options) {
        sidePanelCalls.push({ method: 'open', options });
      },
      async setOptions(options) {
        sidePanelCalls.push({ method: 'setOptions', options });
      }
    },
    storage: {
      session: {
        async get(key) {
          return Object.hasOwn(sessionStorage, key) ? { [key]: sessionStorage[key] } : {};
        },
        async set(values) {
          Object.assign(sessionStorage, values);
        }
      },
      local: {
        async get(keys) {
          return Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys])
              .filter(key => Object.hasOwn(storage, key))
              .map(key => [key, storage[key]])
          );
        },
        async set(values) {
          Object.assign(storage, values);
        },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete storage[key];
          }
        }
      }
    }
  };

  await import(`../src/background/background.js?boot=${Date.now()}`);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(actionListeners.length, 1);
  assert.equal(alarmListeners.length, 1);
  assert.equal(connectListeners.length, 0, 'legacy streaming ports were removed');
  assert.equal(runtimeListeners.length, 1);
  assert.equal(installedListeners.length, 1);
  assert.equal(permissionListeners.added.length, 1);
  assert.equal(permissionListeners.removed.length, 1);

  // The worker registers the forum content script for the enabled forums
  // only (never the provider hosts).
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(registered.get('forum-content'), {
    id: 'forum-content',
    matches: ['https://www.uscardforum.com/*'],
    js: ['src/content/content.js'],
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true
  });

  // A new grant: the registration follows, and open tabs of that forum
  // get the script without a reload.
  granted.add('https://meta.discourse.org/*');
  permissionListeners.added[0]({ origins: ['https://meta.discourse.org/*'] });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(registered.get('forum-content').matches, [
    'https://meta.discourse.org/*',
    'https://www.uscardforum.com/*'
  ]);
  assert.deepEqual(
    scriptingCalls.filter(([kind]) => kind === 'execute').map(([, injection]) => injection),
    [{ target: { tabId: 11 }, files: ['src/content/content.js'] }]
  );

  // The toolbar icon records the tab (activeTab) for the panel.
  actionListeners[0]({ id: 5, windowId: 1 });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(sessionStorage.actionClickedTabs, [5]);
  sidePanelCalls.length = 0;

  // 2.0 had <all_urls>; an update drops what Chrome kept of it.
  granted.add('https://*/*');
  installedListeners[0]({ reason: 'update', previousVersion: '2.0.0' });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(granted.has('https://*/*'), false, 'legacy all-sites access is removed on update');
  assert.ok(granted.has('https://www.uscardforum.com/*'), 'enabled forums stay');
  assert.deepEqual(createdTabs, [], 'updates must not open the welcome page');
  installedListeners[0]({ reason: 'install' });
  assert.deepEqual(createdTabs, [
    { url: 'chrome-extension://test-id/src/settings/settings.html?welcome=1' }
  ]);

  const listener = runtimeListeners[0];
  const pageChangedResponse = new Promise(resolve => {
    assert.equal(listener(
      { action: 'pageChanged', postId: '517303' },
      { tab: { id: 42 } },
      resolve
    ), true);
  });
  assert.deepEqual(await pageChangedResponse, { success: true });
  assert.deepEqual(sidePanelCalls[0], {
    method: 'setOptions',
    options: {
      tabId: 42,
      path: 'src/popup/popup.html',
      enabled: true
    }
  });

  const openResponse = new Promise(resolve => {
    assert.equal(listener(
      { action: 'openSidePanel' },
      { tab: { id: 42 } },
      resolve
    ), true);
  });
  assert.deepEqual(await openResponse, { success: true });
  assert.deepEqual(sidePanelCalls[1], {
    method: 'open',
    options: { tabId: 42 }
  });

  const enqueueResponse = new Promise(resolve => {
    assert.equal(listener(
      {
        action: 'enqueueTask',
        taskType: 'chat',
        topicId: '517303',
        title: 'Context limit test',
        siteUrl: 'https://www.uscardforum.com',
        url: 'https://www.uscardforum.com/t/topic/517303',
        question: 'What changed?',
        maxPostChars: 45000,
        provider: 'openrouter',
        settings: { apiKey: 'runtime-only', model: 'test-model' }
      },
      {},
      resolve
    ), true);
  });
  const queued = await enqueueResponse;

  assert.equal(queued.success, true);
  assert.equal(queued.task.maxPostChars, 45000);
  assert.equal(queued.task.topicKey, 'www.uscardforum.com/t/517303');

  // A forum the user never enabled: refused before anything is queued.
  const deniedResponse = new Promise(resolve => {
    listener(
      {
        action: 'enqueueTask',
        taskType: 'summary',
        topicId: '42',
        siteUrl: 'https://forum.example.org',
        url: 'https://forum.example.org/t/topic/42',
        provider: 'openrouter',
        settings: { apiKey: 'runtime-only', model: 'test-model' }
      },
      {},
      resolve
    );
  });
  const denied = await deniedResponse;
  assert.equal(denied.success, false);
  assert.equal(denied.code, 'FORUM_ACCESS_NOT_GRANTED');
  assert.match(denied.error, /Allow DiscourseCopilot on forum\.example\.org/);

  const rejectedResponse = new Promise(resolve => {
    listener(
      {
        action: 'enqueueTask',
        taskType: 'summary',
        topicId: '517303',
        url: 'https://www.uscardforum.com/t/topic/517303',
        provider: 'openrouter',
        settings: { apiKey: 'runtime-only', model: 'test-model' }
      },
      {},
      resolve
    );
  });
  const rejected = await rejectedResponse;
  assert.equal(rejected.success, false);
  assert.match(rejected.error, /forum site URL/);
});
