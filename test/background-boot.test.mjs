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

  installedListeners[0]({ reason: 'update', previousVersion: '1.9.0' });
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
