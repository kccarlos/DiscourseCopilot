// Content script for enabled Discourse forums (registered at runtime, see
// shared/forum-access.mjs): detects Discourse and the current topic, tells the
// side panel when the page changes, answers its page-state requests, and adds
// the floating launcher button unless the user turned it off in Settings.
import { extractForumTopicId } from '../shared/topic-route.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { readShowForumButton } from '../shared/forum-button-preference.mjs';
import { buildTopicKey, forumDisplayName, normalizeBasePath, siteUrlFromPageUrl } from '../shared/forum-site.mjs';

const { MESSAGES, STORAGE_KEYS } = DiscourseCopilotConstants;
// The launcher's few labels come from _locales through chrome.i18n, so this
// script, injected into every allowed forum page, doesn't bundle every UI string.
const message = (name, fallback) => globalThis.chrome?.i18n?.getMessage?.(name) || fallback;
const LAUNCHER_ID = 'discourse-copilot-page-launcher';
// The launcher's mark: a chat bubble on an accent circle.
const LAUNCHER_LOGO_SVG =
  '<span class="logo" aria-hidden="true"><svg focusable="false" width="15" height="15" viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4V5Z"/></svg></span>';
const URL_CHECK_INTERVAL_MS = 500;
const DETECTION_RETRY_MS = 1500;

function metaContent(selector) {
  const content = document.querySelector(selector)?.getAttribute('content');
  return typeof content === 'string' ? content.trim() : '';
}

// Every Discourse page renders these tags server-side; weaker signals such as
// #main-outlet or an OpenSearch link also appear on unrelated sites.
function detectDiscoursePage() {
  const generator = metaContent('meta[name="generator"]');
  const baseUriMeta = document.querySelector('meta[name="discourse-base-uri"]');
  const setup = document.getElementById('data-discourse-setup');
  const isSupportedSite = /\bDiscourse\b/i.test(generator) || Boolean(baseUriMeta) || Boolean(setup);
  if (!isSupportedSite) {
    return null;
  }
  // Current Discourse exposes the subfolder path on the setup tag; older
  // releases used a dedicated meta tag.
  return {
    basePath: normalizeBasePath(setup?.dataset?.baseUri || baseUriMeta?.getAttribute('content') || ''),
    forumName: metaContent('meta[property="og:site_name"]')
  };
}

class DiscourseCopilotContent {
  constructor() {
    this.postId = null;
    this.isSupportedSite = false;
    this.basePath = '';
    this.siteUrl = '';
    this.forumName = '';
    this.currentUrl = '';
    this.urlCheckTimer = null;
    // Whether to show the launcher: null until the stored preference is read
    // (no button flashes up for someone who turned it off).
    this.showLauncher = null;
    this.onStorageChanged = null;
  }

  init() {
    if (!this.detect()) {
      // Discourse tags are server-rendered, but check once more in case the
      // document was still being assembled when the script ran.
      window.setTimeout(() => {
        if (this.detect()) {
          this.start();
        }
      }, DETECTION_RETRY_MS);
      return;
    }
    this.start();
  }

  detect() {
    const detected = detectDiscoursePage();
    if (!detected) {
      return false;
    }
    this.isSupportedSite = true;
    this.basePath = detected.basePath;
    this.forumName = detected.forumName;
    return true;
  }

  start() {
    if (this.urlCheckTimer !== null) {
      return;
    }
    this.watchLauncherPreference();
    this.refreshLocation();
    window.addEventListener('popstate', () => this.refreshLocation());
    window.addEventListener('hashchange', () => this.refreshLocation());
    this.urlCheckTimer = window.setInterval(() => this.refreshLocation(), URL_CHECK_INTERVAL_MS);
  }

  dispose() {
    if (this.urlCheckTimer !== null) {
      window.clearInterval(this.urlCheckTimer);
      this.urlCheckTimer = null;
    }
    if (this.onStorageChanged) {
      try {
        chrome.storage.onChanged.removeListener(this.onStorageChanged);
      } catch {
        // The extension context is gone (reload or update).
      }
      this.onStorageChanged = null;
    }
    this.isSupportedSite = false;
  }

  // Reads the "show the button" preference once and follows later changes, so
  // Settings applies to open tabs without a reload. Page-change detection
  // (the timer and listeners above) doesn't depend on it; only the launcher
  // element is added or removed.
  watchLauncherPreference() {
    const apply = stored => {
      this.showLauncher = readShowForumButton(stored);
      this.syncLauncher();
    };
    this.onStorageChanged = (changes, area) => {
      if (area === 'local' && changes[STORAGE_KEYS.PREFERENCES]) {
        apply(changes[STORAGE_KEYS.PREFERENCES].newValue);
      }
    };
    chrome.storage.onChanged.addListener(this.onStorageChanged);
    chrome.storage.local
      .get(STORAGE_KEYS.PREFERENCES)
      .then(values => {
        // A change that arrived while reading is newer than what was read.
        if (this.showLauncher === null) apply(values?.[STORAGE_KEYS.PREFERENCES]);
      })
      .catch(() => {
        apply(undefined);
      });
  }

  get topicKey() {
    return this.postId ? buildTopicKey(this.siteUrl, this.postId) : '';
  }

  refreshLocation({ notify = true } = {}) {
    if (!this.isSupportedSite) {
      return false;
    }
    const nextUrl = window.location.href;
    if (nextUrl === this.currentUrl) {
      this.syncLauncher();
      return false;
    }

    const previousTopicKey = this.topicKey;
    const previousSiteUrl = this.siteUrl;
    this.currentUrl = nextUrl;
    this.siteUrl = siteUrlFromPageUrl(nextUrl, this.basePath);
    const topicId = this.siteUrl ? extractForumTopicId(nextUrl, this.basePath) : null;
    this.postId = buildTopicKey(this.siteUrl, topicId) ? topicId : null;
    this.syncLauncher();

    if (notify && (previousTopicKey !== this.topicKey || previousSiteUrl !== this.siteUrl)) {
      const notification = chrome.runtime.sendMessage({
        action: MESSAGES.PAGE_CHANGED,
        postId: this.postId,
        url: nextUrl,
        isSupportedSite: true,
        isForumPage: Boolean(this.siteUrl),
        siteUrl: this.siteUrl,
        topicKey: this.topicKey,
        forumName: forumDisplayName(this.siteUrl, this.forumName)
      });
      notification?.catch?.(() => {
        // The extension may be reloading.
      });
    }
    return true;
  }

  syncLauncher() {
    const existing = document.getElementById(LAUNCHER_ID);
    if (!this.isSupportedSite || !this.postId || this.showLauncher !== true) {
      existing?.remove();
      return;
    }
    if (existing) {
      existing.dataset.topicId = this.postId;
      return;
    }

    const host = document.createElement('div');
    host.id = LAUNCHER_ID;
    host.dataset.topicId = this.postId;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host {
        --dc-bg: #ffffff;
        --dc-ink: #18181b;
        --dc-muted: #5e5e68;
        --dc-line: #e4e4e7;
        --dc-hover: #f2f2f5;
        --dc-fill: #4f46e5;
        --dc-onfill: #ffffff;
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(78px, calc(env(safe-area-inset-bottom) + 18px));
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      @media (prefers-color-scheme: dark) {
        :host {
          --dc-bg: #18181b;
          --dc-ink: #f4f4f5;
          --dc-muted: #a1a1aa;
          --dc-line: #2c2c31;
          --dc-hover: #26262b;
        }
      }
      button {
        display: inline-flex;
        box-sizing: border-box;
        min-width: 40px;
        height: 40px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin: 0;
        padding: 0 14px 0 5px;
        border: 1px solid var(--dc-line);
        border-radius: 20px;
        background: var(--dc-bg);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
        color: var(--dc-ink);
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        line-height: 18px;
        white-space: nowrap;
        opacity: 0;
        transform: translateY(8px);
        animation: discourse-copilot-enter 200ms ease forwards;
        transition:
          background-color 150ms ease,
          box-shadow 150ms ease,
          transform 150ms ease;
      }
      button:hover {
        background: var(--dc-hover);
        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.16);
      }
      button:active {
        transform: translateY(1px);
      }
      button:focus-visible {
        outline: 2px solid var(--dc-fill);
        outline-offset: 2px;
      }
      button:disabled {
        background: var(--dc-bg);
        color: var(--dc-muted);
        cursor: wait;
      }
      .logo {
        display: flex;
        width: 28px;
        height: 28px;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--dc-fill);
        color: var(--dc-onfill);
      }
      button:disabled .logo {
        opacity: 0.6;
      }
      .logo svg {
        display: block;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      @keyframes discourse-copilot-enter {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (max-width: 520px) {
        :host {
          right: max(10px, env(safe-area-inset-right));
          bottom: max(68px, calc(env(safe-area-inset-bottom) + 12px));
        }
        button {
          width: 40px;
          padding: 0;
        }
        .label {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        button {
          animation: none;
          opacity: 1;
          transform: none;
          transition: none;
        }
      }
    `;

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', message('launcherAriaLabel', 'Open DiscourseCopilot panel'));
    button.title = message('launcherTitle', 'Open DiscourseCopilot');
    button.innerHTML = `${LAUNCHER_LOGO_SVG}<span class="label">DiscourseCopilot</span>`;
    button.addEventListener('click', () => {
      void this.openPanel(button);
    });

    shadow.append(style, button);
    document.documentElement.appendChild(host);
  }

  async openPanel(button) {
    const label = button.querySelector('.label');
    const originalLabel = label.textContent;
    button.disabled = true;
    label.textContent = message('launcherOpening', 'Opening…');
    try {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGES.OPEN_SIDE_PANEL,
        postId: this.postId
      });
      if (!response?.success) {
        throw new Error(response?.error || message('launcherOpenFailed', 'Unable to open DiscourseCopilot'));
      }
      label.textContent = message('launcherOpened', 'Opened');
    } catch (error) {
      label.textContent = message('launcherTryAgain', 'Try again');
      button.title = error?.message || message('launcherOpenFailed', 'Unable to open DiscourseCopilot');
    } finally {
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.disabled = false;
        label.textContent = originalLabel;
      }, 1200);
    }
  }

  getState() {
    if (!this.isSupportedSite && this.detect()) {
      this.start();
    }
    this.refreshLocation({ notify: false });
    const isForumPage = this.isSupportedSite && Boolean(this.siteUrl);
    return {
      url: window.location.href,
      isSupportedSite: this.isSupportedSite,
      isForumPage,
      isForumTopic: Boolean(this.postId),
      postId: this.postId,
      topicId: this.postId,
      siteUrl: isForumPage ? this.siteUrl : '',
      basePath: isForumPage ? this.basePath : '',
      forumName: isForumPage ? forumDisplayName(this.siteUrl, this.forumName) : '',
      topicKey: this.topicKey
    };
  }
}

// Registered with chrome.scripting for each forum the user enabled, and
// also injected into already-open tabs right after a grant: a second
// injection into a page with a working instance does nothing. An instance
// left over from before an extension reload or update (its runtime is gone)
// is replaced, launcher included.
const INSTANCE_KEY = '__discourseCopilotContent';
const previous = globalThis[INSTANCE_KEY];
if (!previous?.isAlive?.()) {
  previous?.dispose?.();
  document.getElementById(LAUNCHER_ID)?.remove();
  const discourseCopilot = new DiscourseCopilotContent();
  const runtime = chrome.runtime;
  globalThis[INSTANCE_KEY] = {
    isAlive: () => {
      try {
        return Boolean(runtime?.id);
      } catch {
        return false;
      }
    },
    dispose: () => discourseCopilot.dispose()
  };
  discourseCopilot.init();

  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === MESSAGES.GET_POST_ID) {
      sendResponse(discourseCopilot.getState());
      return true;
    }
  });
}
