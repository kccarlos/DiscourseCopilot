// A stand-in for the chrome.* APIs the side panel and settings page use, so
// the built pages in dist/ run in a plain browser tab.
//
// installChromeStub is passed to page.addInitScript() and serialized: it must
// stay self-contained (no imports, no references to module scope).
//
// Options:
//   store            initial chrome.storage.local contents
//   tasks            what the background answers to listTasks
//   noBackground     listTasks gets no answer (service worker unreachable)
//   granted          forum origins with host access (provider hosts are always granted);
//                    default: Discourse Meta
//   tabUrl, tabTitle the active tab
//   pageState        what the content script answers (only once the tab's forum is enabled)
//   activeTab        the toolbar icon was clicked: the tab's URL is visible without host access
//   probe            result of the one-off Discourse check (null: the page couldn't be read)
//   permissionAnswer what Chrome's permission prompt answers (default: Allow)
//
// Test hooks on window: __store, __sent (runtime messages), __granted,
// __permissionRequests, __permissionAnswer, __grant(origin), __fire(event, ...args).
export function installChromeStub(options) {
  const store = { ...(options.store || {}) };
  const listeners = { onChanged: [], onMessage: [], onActivated: [], onUpdated: [], onAdded: [], onRemoved: [] };
  const granted = new Set(['https://api.openai.com/*', 'http://localhost/*', ...(options.granted ?? ['https://meta.discourse.org/*'])]);
  window.__granted = granted;
  window.__permissionRequests = [];
  window.__permissionAnswer = options.permissionAnswer ?? true;
  const sessionStore = {};
  const originOf = url => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname}/*`;
    } catch {
      return '';
    }
  };
  const hasHost = url => granted.has(originOf(url));
  // A content script keeps answering after access is removed; it starts
  // once the tab's forum is enabled (registered + injected by the worker).
  let contentScriptLoaded = hasHost(options.tabUrl);
  window.__grant = (origin, answer = true) => {
    if (!answer) return;
    granted.add(origin);
    if (origin === originOf(options.tabUrl)) contentScriptLoaded = true;
    setTimeout(() => {
      for (const fn of listeners.onAdded) fn({ origins: [origin], permissions: [] });
    }, 0);
  };
  const ev = name => ({
    addListener(fn) {
      listeners[name].push(fn);
    },
    removeListener() {}
  });
  const sent = [];
  window.__sent = sent;
  window.__store = store;
  window.__listeners = listeners;
  window.__fire = (name, ...args) => {
    for (const fn of listeners[name]) fn(...args);
  };
  // chrome.storage.local writes reach onChanged listeners asynchronously, like in Chrome.
  const fireChanged = changes =>
    setTimeout(() => {
      for (const fn of listeners.onChanged) fn(changes, 'local');
    }, 0);
  // The pages use in-page confirmations; a native dialog is a regression.
  for (const name of ['alert', 'confirm', 'prompt']) {
    window[name] = () => {
      throw new Error(`window.${name}() is not allowed in extension pages`);
    };
  }
  window.chrome = {
    permissions: {
      async contains({ origins }) {
        return origins.every(o => granted.has(o));
      },
      request({ origins }) {
        window.__permissionRequests.push(origins);
        const answer = window.__permissionAnswer;
        if (answer) origins.forEach(o => window.__grant(o));
        return Promise.resolve(answer);
      },
      async remove({ origins }) {
        origins.forEach(o => granted.delete(o));
        setTimeout(() => {
          for (const fn of listeners.onRemoved) fn({ origins, permissions: [] });
        }, 0);
        return true;
      },
      async getAll() {
        return { origins: [...granted], permissions: [] };
      },
      onAdded: ev('onAdded'),
      onRemoved: ev('onRemoved')
    },
    scripting: {
      async executeScript({ func }) {
        if (func) {
          if (!options.probe)
            throw new Error(
              'Cannot access contents of the page. Extension manifest must request permission to access the respective host.'
            );
          return [{ result: options.probe }];
        }
        return [];
      }
    },
    runtime: {
      id: 'test',
      sendMessage: async message => {
        sent.push(message);
        if (message?.action === 'listTasks') return options.noBackground ? undefined : { success: true, tasks: options.tasks || [] };
        if (message?.action === 'cancelTask') {
          const task = (options.tasks || []).find(t => t.id === message.taskId);
          return {
            success: true,
            task: task && { ...task, status: 'cancelled', phase: 'cancelled', statusText: 'Cancelled', updatedAt: Date.now() }
          };
        }
        if (message?.action === 'enqueueTask') {
          const now = Date.now();
          const id = `task-${sent.length}`;
          return {
            success: true,
            task: {
              id,
              type: message.taskType,
              topicId: message.topicId || null,
              siteUrl: message.siteUrl,
              topicKey: message.taskType === 'agent' ? '' : message.topicKey,
              agentRunId: message.taskType === 'agent' ? message.agentRunId || id : '',
              clientRequestId: message.clientRequestId || '',
              title: message.title || '',
              question: message.question || '',
              forumName: message.forumName || '',
              provider: message.provider,
              model: message.settings?.model || '',
              status: 'queued',
              phase: 'queued',
              statusText: 'Waiting for an available worker…',
              progress: null,
              error: '',
              createdAt: now,
              updatedAt: now
            }
          };
        }
        return { success: true };
      },
      onMessage: ev('onMessage'),
      openOptionsPage() {},
      reload() {},
      getURL: p => p,
      getManifest: () => ({ version: '2.0.0' })
    },
    storage: {
      session: {
        async get(key) {
          return key in sessionStore ? { [key]: sessionStore[key] } : {};
        },
        async set(values) {
          Object.assign(sessionStore, values);
        }
      },
      local: {
        async get(keys) {
          const ks = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
          return Object.fromEntries(ks.filter(k => k in store).map(k => [k, store[k]]));
        },
        async set(values) {
          const changes = {};
          for (const [k, v] of Object.entries(values)) changes[k] = { oldValue: store[k], newValue: v };
          Object.assign(store, values);
          fireChanged(changes);
        },
        async remove(ks) {
          const changes = {};
          for (const k of [].concat(ks)) {
            if (k in store) {
              changes[k] = { oldValue: store[k] };
              delete store[k];
            }
          }
          if (Object.keys(changes).length) fireChanged(changes);
        }
      },
      onChanged: ev('onChanged')
    },
    tabs: {
      async query() {
        // Without the "tabs" permission Chrome hides URL and title of pages
        // the extension has no host access to (unless activeTab).
        const visible = hasHost(options.tabUrl) || options.activeTab;
        return [
          {
            id: 1,
            windowId: 1,
            index: 0,
            active: true,
            url: visible ? options.tabUrl : undefined,
            title: visible ? options.tabTitle : undefined
          }
        ];
      },
      // Content scripts only run on enabled forums.
      async sendMessage() {
        return contentScriptLoaded ? options.pageState : undefined;
      },
      onActivated: ev('onActivated'),
      onUpdated: ev('onUpdated'),
      async create(props) {
        return { id: 2, ...props };
      },
      async update() {}
    },
    windows: { async update() {} }
  };
}
