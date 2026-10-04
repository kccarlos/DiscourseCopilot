// Local model servers (Ollama, LM Studio) and the Origin header.
//
// Ollama answers HTTP 403 to any request that carries an
// `Origin: chrome-extension://…` header unless it was started with
// OLLAMA_ORIGINS set. Chrome adds that header to the extension's own POST
// requests (summaries, chat, agent steps), so without help every generation
// fails on a default Ollama install.
//
// The fix is one declarativeNetRequest rule that removes the Origin header
// from requests the extension itself makes to the user's local model servers:
// localhost, 127.0.0.1, and the host of a custom Ollama / LM Studio
// URL the user saved and allowed. The rule is scoped with
// `initiatorDomains: [<this extension's id>]`, so a web page's requests to the
// same servers are untouched and keep being refused by Ollama's CORS check.
//
// It is a dynamic rule (not a session rule): dynamic rules persist across
// browser restarts, so they are in place before the service worker has run
// (the settings page can test a connection right after the browser starts).
// syncLocalModelHeaders() is idempotent and runs whenever the worker starts
// (covers install, update and browser start), the saved configuration changes
// or host access is added or removed. It needs the
// `declarativeNetRequestWithHostAccess` permission, which relies on the host
// permissions the extension already has and adds no install warning.
import { hostPatternForUrl, isRequiredHostPattern } from './forum-access.mjs';

export const LOCAL_MODEL_RULE_ID = 1;
export const LOCAL_MODEL_PROVIDERS = Object.freeze(['ollama', 'lmstudio']);
// The hosts the manifest grants (see REQUIRED_HOST_PATTERNS). Any other host,
// including the IPv6 loopback "[::1]", is a custom server: it needs the
// user's permission and joins the rule only while that is granted.
export const LOOPBACK_HOSTS = Object.freeze(['localhost', '127.0.0.1']);
// A service worker's fetch() is `xmlhttprequest`; "other" is kept for requests
// Chrome classifies that way (e.g. streaming, keep-alive).
export const LOCAL_MODEL_RESOURCE_TYPES = Object.freeze(['xmlhttprequest', 'other']);

function parseUrl(value) {
  try {
    return new URL(String(value));
  } catch {
    return null;
  }
}

/** The host DNR matches on for a server URL ('' when not an http(s) URL). */
export function serverHost(serverUrl) {
  const url = parseUrl(serverUrl);
  return url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.hostname.toLowerCase() : '';
}

/**
 * Hosts of the saved Ollama / LM Studio URLs that are not loopback. Each
 * needs its own host permission; see grantedCustomHosts().
 */
export function customServerHosts(config) {
  const hosts = new Set();
  for (const provider of LOCAL_MODEL_PROVIDERS) {
    const host = serverHost(config?.providers?.[provider]?.url);
    if (host && !LOOPBACK_HOSTS.includes(host)) {
      hosts.add(host);
    }
  }
  return [...hosts].sort();
}

/** The custom hosts the user allowed (rules never cover a host without access). */
export async function grantedCustomHosts(config, { permissions = globalThis.chrome?.permissions } = {}) {
  const granted = [];
  for (const host of customServerHosts(config)) {
    const pattern = hostPatternForUrl(`http://${host}`);
    if (!pattern || isRequiredHostPattern(pattern)) {
      continue;
    }
    try {
      if (await permissions?.contains?.({ origins: [pattern] })) {
        granted.push(host);
      }
    } catch {
      // Treated as not granted.
    }
  }
  return granted;
}

/** The single rule: strip Origin from this extension's requests to these hosts. */
export function buildLocalModelRule({ extensionId, customHosts = [] }) {
  return {
    id: LOCAL_MODEL_RULE_ID,
    priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
    condition: {
      initiatorDomains: [extensionId],
      requestDomains: [...new Set([...LOOPBACK_HOSTS, ...customHosts])],
      resourceTypes: [...LOCAL_MODEL_RESOURCE_TYPES]
    }
  };
}

function sameRule(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Makes the dynamic rule match the saved configuration and granted access.
 * Resolves to true when the rule was (re)written. Does nothing without the
 * declarativeNetRequest API (tests, other browsers).
 * @param {object} config the readConfig() snapshot
 */
export async function syncLocalModelHeaders(
  config,
  {
    dnr = globalThis.chrome?.declarativeNetRequest,
    runtime = globalThis.chrome?.runtime,
    permissions = globalThis.chrome?.permissions
  } = {}
) {
  if (!dnr?.updateDynamicRules || !runtime?.id) {
    return false;
  }
  const customHosts = await grantedCustomHosts(config, { permissions });
  const rule = buildLocalModelRule({ extensionId: runtime.id, customHosts });
  const existing = (await dnr.getDynamicRules?.()) || [];
  if (existing.length === 1 && sameRule(existing[0], rule)) {
    return false;
  }
  await dnr.updateDynamicRules({
    removeRuleIds: [...new Set([LOCAL_MODEL_RULE_ID, ...existing.map(item => item.id)])],
    addRules: [rule]
  });
  return true;
}
