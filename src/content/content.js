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
// DiscourseCopilot logo (white bubble, "on-dark" variant) pixel-hinted for
// small sizes; source: assets/brand/icon/sizes/discoursecopilot-icon-32-on-dark.svg
const LAUNCHER_LOGO_SVG = '<svg class="logo" aria-hidden="true" focusable="false" viewBox="0 0 32 32"><defs><linearGradient id="dcl-bub" gradientUnits="userSpaceOnUse" x1="3.5" y1="7" x2="25.5" y2="29"><stop offset="0" stop-color="#3A5BE0"/><stop offset="1" stop-color="#8E2DB5"/></linearGradient><linearGradient id="dcl-star" gradientUnits="userSpaceOnUse" x1="17.5" y1="1" x2="31.5" y2="16.5"><stop offset="0" stop-color="#3D5CEB"/><stop offset="1" stop-color="#9B2FC6"/></linearGradient></defs><g><path d="M9.548 29.108Q6.103 29.8 2.058 31.319Q1.648 31.473 1.366 31.345Q1.085 31.217 0.931 30.808Q0.835 30.552 0.901 30.287Q2.079 25.587 2.404 21.502Q1.199 17.616 2.647 13.793Q4.127 9.888 7.726 7.769Q11.324 5.65 15.457 6.249Q17.34 6.523 18.957 7.306Q18.191 7.618 17.295 7.767Q16.414 7.914 16.267 8.795Q16.164 9.411 16.421 9.771Q16.678 10.13 17.295 10.233Q22.402 11.084 23.265 16.69Q23.404 17.596 24.31 17.735Q25.269 17.883 25.598 17.172Q25.889 21.308 23.538 24.728Q21.172 28.17 17.173 29.373Q13.301 30.538 9.548 29.108Z" fill="#4A6BFF" opacity="0.55"/><path d="M11.048 29.483Q7.603 30.175 3.558 31.694Q3.148 31.848 2.866 31.72Q2.585 31.592 2.431 31.183Q2.335 30.927 2.401 30.662Q3.579 25.962 3.904 21.877Q2.699 17.991 4.147 14.168Q5.627 10.263 9.226 8.144Q12.824 6.025 16.957 6.624Q18.156 6.799 19.248 7.179Q18.364 7.589 17.295 7.767Q16.414 7.914 16.267 8.795Q16.164 9.411 16.421 9.771Q16.678 10.13 17.295 10.233Q22.402 11.084 23.265 16.69Q23.404 17.596 24.31 17.735Q25.545 17.926 25.735 16.69Q25.945 15.328 26.406 14.246Q26.967 15.777 27.094 17.498Q27.403 21.662 25.038 25.103Q22.672 28.545 18.673 29.748Q14.801 30.913 11.048 29.483Z" fill="#C13AE0" opacity="0.55"/><path d="M10.298 29.108Q6.853 29.8 2.808 31.319Q2.398 31.473 2.116 31.345Q1.835 31.217 1.681 30.808Q1.585 30.552 1.651 30.287Q2.829 25.587 3.154 21.502Q1.949 17.616 3.397 13.793Q4.877 9.888 8.476 7.769Q12.074 5.65 16.207 6.249Q17.878 6.492 19.34 7.136Q18.42 7.579 17.295 7.767Q16.857 7.84 16.6 8.094Q16.283 8.029 15.955 7.981Q12.432 7.47 9.364 9.277Q6.296 11.084 5.034 14.414Q3.772 17.743 4.872 21.13Q4.926 21.294 4.913 21.466Q4.64 25.072 3.726 29.126Q7.184 27.927 10.214 27.341Q10.468 27.292 10.708 27.389Q14.009 28.723 17.419 27.697Q20.828 26.671 22.846 23.737Q24.717 21.014 24.625 17.761Q25.571 17.758 25.735 16.69Q25.855 15.91 26.058 15.222Q26.271 16.141 26.344 17.123Q26.653 21.287 24.288 24.728Q21.922 28.17 17.923 29.373Q14.051 30.538 10.298 29.108Z" fill="url(#dcl-bub)"/><path d="M4.872 21.13Q3.772 17.743 5.034 14.414Q6.296 11.084 9.364 9.277Q12.432 7.47 15.955 7.981Q16.283 8.029 16.6 8.094Q16.341 8.352 16.267 8.795Q16.164 9.411 16.421 9.771Q16.678 10.13 17.295 10.233Q22.402 11.084 23.265 16.69Q23.404 17.596 24.31 17.735Q24.477 17.761 24.625 17.761Q24.717 21.014 22.846 23.737Q20.828 26.671 17.419 27.697Q14.009 28.723 10.708 27.389Q10.468 27.292 10.214 27.341Q7.184 27.927 3.726 29.126Q4.64 25.072 4.913 21.466Q4.926 21.294 4.872 21.13Z" fill="#FFFFFF"/><path d="M8.55 13H18.95Q19.25 13 19.25 13.3V14.7Q19.25 15 18.95 15H8.55Q8.25 15 8.25 14.7V13.3Q8.25 13 8.55 13ZM8.55 17H18.95Q19.25 17 19.25 17.3V18.7Q19.25 19 18.95 19H8.55Q8.25 19 8.25 18.7V17.3Q8.25 17 8.55 17ZM8.55 21H14.95Q15.25 21 15.25 21.3V22.7Q15.25 23 14.95 23H8.55Q8.25 23 8.25 22.7V21.3Q8.25 21 8.55 21Z" fill="#4A6BFF"/><path d="M10.05 13.375H20.45Q20.75 13.375 20.75 13.675V15.075Q20.75 15.375 20.45 15.375H10.05Q9.75 15.375 9.75 15.075V13.675Q9.75 13.375 10.05 13.375ZM10.05 17.375H20.45Q20.75 17.375 20.75 17.675V19.075Q20.75 19.375 20.45 19.375H10.05Q9.75 19.375 9.75 19.075V17.675Q9.75 17.375 10.05 17.375ZM10.05 21.375H16.45Q16.75 21.375 16.75 21.675V23.075Q16.75 23.375 16.45 23.375H10.05Q9.75 23.375 9.75 23.075V21.675Q9.75 21.375 10.05 21.375Z" fill="#C13AE0"/><path d="M9.3 13H19.7Q20 13 20 13.3V14.7Q20 15 19.7 15H9.3Q9 15 9 14.7V13.3Q9 13 9.3 13ZM9.3 17H19.7Q20 17 20 17.3V18.7Q20 19 19.7 19H9.3Q9 19 9 18.7V17.3Q9 17 9.3 17ZM9.3 21H15.7Q16 21 16 21.3V22.7Q16 23 15.7 23H9.3Q9 23 9 22.7V21.3Q9 21 9.3 21Z" fill="#17132B"/><path d="M23.75 1Q24.75 8 30.75 9Q27.361 9.565 25.567 11.885Q24.827 10.562 23.736 9.392Q22.447 8.009 20.91 7.1Q23.17 5.058 23.75 1Z" fill="#4A6BFF" opacity="0.7"/><path d="M25.25 1.375Q26.25 8.375 32.25 9.375Q28.055 10.074 26.304 13.461Q25.455 11.236 23.736 9.392Q22.915 8.511 21.994 7.823Q24.619 5.795 25.25 1.375Z" fill="#C13AE0" opacity="0.7"/><path d="M24.5 1Q25.5 8 31.5 9Q25.5 10 24.5 16.5Q23.5 10 17.5 9Q23.5 8 24.5 1Z" fill="url(#dcl-star)"/></g></svg>';
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

  dispose() {
    if (this.urlCheckTimer !== null) {
      window.clearInterval(this.urlCheckTimer);
      this.urlCheckTimer = null;
    }
    this.isDiscourse = false;
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
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 999px;
        background: linear-gradient(135deg, #22265c, #33205f);
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
      .logo {
        display: block;
        width: 24px;
        height: 24px;
        flex: 0 0 auto;
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
