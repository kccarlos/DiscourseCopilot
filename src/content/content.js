import { extractForumTopicId } from './topic-route.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';
import {
  buildTopicKey,
  forumDisplayName,
  normalizeBasePath,
  siteUrlFromPageUrl
} from '../shared/forum-site.mjs';

const { MESSAGES } = DiscourseCopilotConstants;
const LAUNCHER_ID = 'discourse-copilot-page-launcher';
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
  const isDiscourse = /\bDiscourse\b/i.test(generator)
    || Boolean(baseUriMeta)
    || Boolean(setup);
  if (!isDiscourse) {
    return null;
  }
  // Current Discourse exposes the subfolder path on the setup tag; older
  // releases used a dedicated meta tag.
  return {
    basePath: normalizeBasePath(
      setup?.dataset?.baseUri || baseUriMeta?.getAttribute('content') || ''
    ),
    forumName: metaContent('meta[property="og:site_name"]')
  };
}

class DiscourseCopilotContent {
  constructor() {
    this.postId = null;
    this.isDiscourse = false;
    this.basePath = '';
    this.siteUrl = '';
    this.forumName = '';
    this.currentUrl = '';
    this.urlCheckTimer = null;
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
    this.isDiscourse = true;
    this.basePath = detected.basePath;
    this.forumName = detected.forumName;
    return true;
  }

  start() {
    if (this.urlCheckTimer !== null) {
      return;
    }
    this.refreshLocation();
    window.addEventListener('popstate', () => this.refreshLocation());
    window.addEventListener('hashchange', () => this.refreshLocation());
    this.urlCheckTimer = window.setInterval(
      () => this.refreshLocation(),
      URL_CHECK_INTERVAL_MS
    );
  }

  get topicKey() {
    return this.postId ? buildTopicKey(this.siteUrl, this.postId) : '';
  }

  refreshLocation({ notify = true } = {}) {
    if (!this.isDiscourse) {
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

    if (
      notify
      && (previousTopicKey !== this.topicKey || previousSiteUrl !== this.siteUrl)
    ) {
      const notification = chrome.runtime.sendMessage({
        action: MESSAGES.PAGE_CHANGED,
        postId: this.postId,
        url: nextUrl,
        isDiscourse: true,
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
    if (!this.isDiscourse || !this.postId) {
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
        position: fixed;
        right: max(16px, env(safe-area-inset-right));
        bottom: max(78px, calc(env(safe-area-inset-bottom) + 18px));
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      button {
        display: inline-flex;
        min-width: 46px;
        min-height: 46px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 9px 13px 9px 10px;
        border: 1px solid rgba(255, 255, 255, 0.72);
        border-radius: 999px;
        background: linear-gradient(145deg, #1769e0, #7254e8);
        box-shadow:
          0 10px 30px rgba(23, 58, 117, 0.25),
          0 2px 8px rgba(23, 58, 117, 0.2);
        color: #fff;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.01em;
        opacity: 0;
        transform: translateY(8px) scale(0.96);
        animation: discourse-copilot-enter 220ms ease forwards;
        transition:
          box-shadow 160ms ease,
          filter 160ms ease,
          transform 160ms ease;
      }
      button:hover {
        box-shadow:
          0 13px 34px rgba(23, 58, 117, 0.32),
          0 3px 10px rgba(23, 58, 117, 0.22);
        filter: saturate(1.08);
        transform: translateY(-2px);
      }
      button:active {
        transform: translateY(0) scale(0.98);
      }
      button:focus-visible {
        outline: 3px solid rgba(23, 105, 224, 0.34);
        outline-offset: 3px;
      }
      button:disabled {
        cursor: wait;
        opacity: 0.78;
      }
      svg {
        width: 21px;
        height: 21px;
        flex: 0 0 auto;
        fill: none;
        stroke: currentColor;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-width: 1.9;
      }
      @keyframes discourse-copilot-enter {
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @media (max-width: 520px) {
        :host {
          right: max(10px, env(safe-area-inset-right));
          bottom: max(68px, calc(env(safe-area-inset-bottom) + 12px));
        }
        button {
          width: 46px;
          padding: 9px;
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
    button.setAttribute('aria-label', 'Open DiscourseCopilot panel');
    button.title = 'Open DiscourseCopilot';
    button.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 4h14v16H5z"/>
        <path d="M9 8h6M9 12h6M9 16h4"/>
      </svg>
      <span class="label">DiscourseCopilot</span>
    `;
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
    label.textContent = 'Opening…';
    try {
      const response = await chrome.runtime.sendMessage({
        action: MESSAGES.OPEN_SIDE_PANEL,
        postId: this.postId
      });
      if (!response?.success) {
        throw new Error(response?.error || 'Unable to open DiscourseCopilot');
      }
      label.textContent = 'Opened';
    } catch (error) {
      label.textContent = 'Try again';
      button.title = error?.message || 'Unable to open DiscourseCopilot';
    } finally {
      window.setTimeout(() => {
        if (!button.isConnected) return;
        button.disabled = false;
        label.textContent = originalLabel;
      }, 1200);
    }
  }

  getState() {
    if (!this.isDiscourse && this.detect()) {
      this.start();
    }
    this.refreshLocation({ notify: false });
    const isForumPage = this.isDiscourse && Boolean(this.siteUrl);
    return {
      url: window.location.href,
      isDiscourse: this.isDiscourse,
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

const discourseCopilot = new DiscourseCopilotContent();
discourseCopilot.init();

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === MESSAGES.GET_POST_ID) {
    sendResponse(discourseCopilot.getState());
    return true;
  }
});
