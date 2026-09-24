// Per-forum host access.
//
// The manifest only asks for the AI providers' API hosts (and localhost for
// local models). Every forum is an optional host permission the user grants
// from the side panel the first time they use that forum ("Allow access
// to {host}"); background tasks then fetch it with the user's login. A grant
// covers the whole origin, so subfolder installs (example.com/forum) and
// every port share it.
//
// Chrome rules this module is built around:
// - chrome.permissions.request() must run inside a user gesture: call
//   requestForumAccess() synchronously in the click handler, before any await.
// - A pattern can only be requested when the manifest's
//   optional_host_permissions cover it (https://*/*, http://*/*).
// - chrome.permissions.getAll() also returns the required manifest hosts;
//   listGrantedForums() leaves those out.
import { DiscourseCopilotConstants } from './constants.js';
import { parseSiteUrl } from './forum-site.mjs';

export const FORUM_ACCESS_ERROR_CODE = 'FORUM_ACCESS_NOT_GRANTED';
export const FORUM_CONTENT_SCRIPT_ID = 'forum-content';
// Built as a standalone script by vite.config.js (additionalInputs).
export const FORUM_CONTENT_SCRIPT_FILE = 'src/content/content.js';

const LOCAL_HOST_PATTERNS = Object.freeze(['http://localhost/*', 'http://127.0.0.1/*']);

function parseUrl(value) {
  try {
    return new URL(String(value));
  } catch {
    return null;
  }
}

// The match pattern for a URL's origin, without its port (match patterns
// ignore ports unless they name one): "https://forum.example.com/*".
export function hostPatternForUrl(value) {
  const url = parseUrl(value);
  if (!url || !url.hostname || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    return '';
  }
  return `${url.protocol}//${url.hostname}/*`;
}

// Host patterns the manifest requires (and Chrome grants at install): the
// providers' API hosts plus localhost for Ollama and LM Studio. Kept in sync
// with manifest.json by test/forum-access.test.mjs.
export const REQUIRED_HOST_PATTERNS = Object.freeze([
  ...new Set([
    ...Object.values(DiscourseCopilotConstants.PROVIDER_CONFIGS)
      .map(config => hostPatternForUrl(config.baseUrl))
      .filter(pattern => pattern && !LOCAL_HOST_PATTERNS.includes(pattern)),
    ...LOCAL_HOST_PATTERNS
  ])
]);

export function isRequiredHostPattern(pattern) {
  return REQUIRED_HOST_PATTERNS.includes(pattern);
}

/** The origin permission pattern for a forum site URL, or '' when invalid. */
export function forumOriginPattern(siteUrl) {
  const site = parseSiteUrl(siteUrl);
  return site ? hostPatternForUrl(site.origin) : '';
}

/** "https://forum.example.com" for "https://forum.example.com/*", else ''. */
export function originFromPattern(pattern) {
  const match = /^(https?):\/\/([^/*:]+)\/\*$/.exec(String(pattern || ''));
  return match ? `${match[1]}://${match[2]}` : '';
}

export function forumAccessHost(siteUrl) {
  const site = parseSiteUrl(siteUrl);
  if (site) {
    return new URL(site.origin).hostname;
  }
  const url = parseUrl(siteUrl);
  return url?.hostname || 'this forum';
}

/**
 * The origins of granted forums in a permissions.getAll() result: exact
 * host patterns only (no wildcards), without the required manifest hosts
 * and any `exclude` patterns (e.g. a custom local-model server).
 */
export function forumOriginsFromPatterns(patterns = [], { exclude = [] } = {}) {
  const excluded = new Set(exclude);
  const origins = new Set();
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    if (isRequiredHostPattern(pattern) || excluded.has(pattern)) {
      continue;
    }
    const origin = originFromPattern(pattern);
    if (origin) {
      origins.add(origin);
    }
  }
  return [...origins].sort((left, right) =>
    new URL(left).hostname.localeCompare(new URL(right).hostname)
  );
}

export function forumAccessMessage(siteUrl) {
  return `Allow DiscourseCopilot on ${forumAccessHost(siteUrl)} in the side panel, then try again.`;
}

export function createForumAccessError(siteUrl) {
  return Object.assign(new Error(forumAccessMessage(siteUrl)), {
    code: FORUM_ACCESS_ERROR_CODE,
    retryable: false,
    needsUserAction: true
  });
}

export function isForumAccessError(error) {
  return error?.code === FORUM_ACCESS_ERROR_CODE;
}

// A fetch the browser refused (CORS / no host access) rejects with a
// TypeError, never an HTTP response.
export function isNetworkFailure(error) {
  return error instanceof TypeError || error?.name === 'TypeError';
}

const chromePermissions = () => globalThis.chrome?.permissions;

/** Whether the extension may fetch this forum. Never throws. */
export async function hasForumAccess(siteUrl, { permissions = chromePermissions() } = {}) {
  const pattern = forumOriginPattern(siteUrl) || hostPatternForUrl(siteUrl);
  if (!pattern || !permissions?.contains) {
    return false;
  }
  if (isRequiredHostPattern(pattern)) {
    return true;
  }
  try {
    return Boolean(await permissions.contains({ origins: [pattern] }));
  } catch {
    return false;
  }
}

/**
 * Asks the user for access to a forum (or a custom model server). Must be
 * called synchronously from a click handler. Resolves to whether access is
 * granted; an already granted origin resolves true without a prompt.
 */
export function requestForumAccess(siteUrl, { permissions = chromePermissions() } = {}) {
  const pattern = forumOriginPattern(siteUrl) || hostPatternForUrl(siteUrl);
  if (!pattern || !permissions?.request) {
    return Promise.resolve(false);
  }
  if (isRequiredHostPattern(pattern)) {
    return Promise.resolve(true);
  }
  try {
    return Promise.resolve(permissions.request({ origins: [pattern] }))
      .then(Boolean, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

// ---------- Custom local-model servers ----------

/**
 * Access to a custom Ollama / LM Studio server URL (e.g. another computer
 * on the network). localhost and 127.0.0.1 are granted by the manifest and
 * resolve true at once. Same gesture rule as requestForumAccess().
 */
export function requestServerAccess(serverUrl, options) {
  return hostPatternForUrl(serverUrl)
    ? requestForumAccess(serverUrl, options)
    : Promise.resolve(true);
}

/** Whether a server URL needs a permission prompt (not a manifest host). */
export function serverNeedsAccessPrompt(serverUrl) {
  const pattern = hostPatternForUrl(serverUrl);
  return Boolean(pattern) && !isRequiredHostPattern(pattern);
}

export function serverAccessDeniedText(serverUrl) {
  return `DiscourseCopilot wasn’t allowed to connect to ${forumAccessHost(serverUrl)}. Try again and choose Allow, or start the server so it accepts requests from the extension (for Ollama: OLLAMA_ORIGINS=chrome-extension://*).`;
}

export async function revokeForumAccess(siteUrl, { permissions = chromePermissions() } = {}) {
  const pattern = forumOriginPattern(siteUrl) || hostPatternForUrl(siteUrl);
  if (!pattern || isRequiredHostPattern(pattern) || !permissions?.remove) {
    return false;
  }
  return Boolean(await permissions.remove({ origins: [pattern] }));
}

/** Origins of every forum the user enabled. */
export async function listGrantedForums({
  permissions = chromePermissions(),
  exclude = []
} = {}) {
  if (!permissions?.getAll) {
    return [];
  }
  const { origins = [] } = await permissions.getAll();
  return forumOriginsFromPatterns(origins, { exclude });
}

/**
 * Calls `listener({ type: 'added'|'removed', origins })` when host access
 * changes (in any extension page). Returns an unsubscribe function.
 */
export function subscribeForumAccess(listener, { permissions = chromePermissions() } = {}) {
  if (!permissions?.onAdded || !permissions?.onRemoved) {
    return () => {};
  }
  const handle = type => change => {
    const origins = forumOriginsFromPatterns(change?.origins);
    if (origins.length) {
      listener({ type, origins });
    }
  };
  const onAdded = handle('added');
  const onRemoved = handle('removed');
  permissions.onAdded.addListener(onAdded);
  permissions.onRemoved.addListener(onRemoved);
  return () => {
    permissions.onAdded.removeListener?.(onAdded);
    permissions.onRemoved.removeListener?.(onRemoved);
  };
}

// ---------- Content script registration (background) ----------

/**
 * What to do with the dynamic content script so it runs on exactly the
 * granted forums. registerContentScripts rejects a duplicate ID and an
 * empty `matches`, so an existing registration is updated and no forums
 * means unregistering.
 * @returns {{ action: 'register'|'update'|'unregister'|'none', matches: string[] }}
 */
export function planContentScriptSync({ registered = null, origins = [] } = {}) {
  const matches = [...new Set(origins.map(origin => `${origin}/*`))].sort();
  if (!matches.length) {
    return { action: registered ? 'unregister' : 'none', matches };
  }
  if (!registered) {
    return { action: 'register', matches };
  }
  const current = [...(registered.matches || [])].sort();
  const same = current.length === matches.length
    && current.every((pattern, index) => pattern === matches[index]);
  return { action: same ? 'none' : 'update', matches };
}

export function forumContentScript(matches) {
  return {
    id: FORUM_CONTENT_SCRIPT_ID,
    matches,
    js: [FORUM_CONTENT_SCRIPT_FILE],
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true
  };
}

/**
 * Registers, updates or removes the forum content script to match the
 * granted forums. Calls are serialized by the caller (see background.js).
 */
export async function syncForumContentScripts({
  scripting = globalThis.chrome?.scripting,
  permissions = chromePermissions()
} = {}) {
  if (!scripting?.getRegisteredContentScripts) {
    return { action: 'none', matches: [] };
  }
  const origins = await listGrantedForums({ permissions });
  const [registered = null] = await scripting.getRegisteredContentScripts({
    ids: [FORUM_CONTENT_SCRIPT_ID]
  });
  const plan = planContentScriptSync({ registered, origins });
  if (plan.action === 'register') {
    await scripting.registerContentScripts([forumContentScript(plan.matches)]);
  } else if (plan.action === 'update') {
    await scripting.updateContentScripts([{ id: FORUM_CONTENT_SCRIPT_ID, matches: plan.matches }]);
  } else if (plan.action === 'unregister') {
    await scripting.unregisterContentScripts({ ids: [FORUM_CONTENT_SCRIPT_ID] });
  }
  return plan;
}

/**
 * Injects the content script into tabs already showing these origins, so
 * the launcher and page detection work without a reload. content.js
 * ignores a second injection. Tabs that cannot be scripted (discarded,
 * still loading, an error page) are skipped.
 * @returns {Promise<number>} how many tabs were injected
 */
export async function injectForumContentScript(origins = [], {
  tabs = globalThis.chrome?.tabs,
  scripting = globalThis.chrome?.scripting
} = {}) {
  const patterns = origins.map(origin => `${origin}/*`);
  if (!patterns.length || !tabs?.query || !scripting?.executeScript) {
    return 0;
  }
  let openTabs = [];
  try {
    openTabs = await tabs.query({ url: patterns });
  } catch {
    return 0;
  }
  const allowed = new Set(origins);
  let injected = 0;
  await Promise.all(openTabs.map(async tab => {
    // tabs.query ignores `url` for hosts without access; check each tab.
    const origin = originFromPattern(hostPatternForUrl(tab?.url));
    if (!Number.isInteger(tab?.id) || !origin || !allowed.has(origin)) {
      return;
    }
    try {
      await scripting.executeScript({
        target: { tabId: tab.id },
        files: [FORUM_CONTENT_SCRIPT_FILE]
      });
      injected++;
    } catch {
      // Not scriptable right now; the registered script covers its next load.
    }
  }));
  return injected;
}
