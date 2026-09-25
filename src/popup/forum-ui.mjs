// Forum identity in the side panel: the names the panel knows forums by,
// the colored forum accents, and the forum bar at the top.
import {
  cleanTopicTitle,
  collectForumNames,
  forumAccentHue,
  forumHostname,
  forumInitial,
  resolveForumName
} from './forum-names.mjs';
import { announce } from './status-line.mjs';

// Forum names learned from the page, tasks, Agent runs and saved sessions.
export class ForumDirectory {
  /**
   * @param {object} deps
   * @param {() => object|null} deps.getPageContext
   * @param {() => Iterable<{siteUrl?: string, forumName?: string}>} deps.getRecords
   */
  constructor({ getPageContext, getRecords }) {
    this.getPageContext = getPageContext;
    this.getRecords = getRecords;
    this.names = new Map();
  }

  // The page context falls back to the hostname; only a name the forum itself
  // reported is worth saving on a session.
  reportedName(context = this.getPageContext()) {
    const hostname = forumHostname(context?.siteUrl);
    const name = resolveForumName(context?.siteUrl, context?.forumName);
    return name && name !== hostname ? name : '';
  }

  label(siteUrl, ...candidates) {
    const context = this.getPageContext();
    const pageName = context?.siteUrl && context.siteUrl === siteUrl
      ? context.forumName
      : '';
    return resolveForumName(siteUrl, ...candidates, pageName, this.names.get(siteUrl))
      || 'Unknown forum';
  }

  // The label of the forum in the current tab ('' off-forum).
  currentLabel() {
    const siteUrl = this.getPageContext()?.siteUrl;
    return siteUrl ? this.label(siteUrl) : '';
  }

  refresh() {
    const context = this.getPageContext();
    this.names = collectForumNames([
      ...(context?.siteUrl ? [{ siteUrl: context.siteUrl, forumName: this.reportedName(context) }] : []),
      ...this.getRecords()
    ]);
    return this.names;
  }
}

export function applyForumHue(element, siteUrl) {
  const hue = forumAccentHue(siteUrl);
  element.classList.toggle('neutral', hue === null);
  if (hue === null) {
    element.style.removeProperty('--forum-hue');
  } else {
    element.style.setProperty('--forum-hue', String(hue));
  }
}

// Colored initial for every forum; the favicon only for the current forum so
// the panel never contacts forums other than the one being browsed.
export function createForumAvatar(siteUrl, forumName, withFavicon = false) {
  const avatar = document.createElement('span');
  avatar.className = 'forum-avatar small';
  avatar.setAttribute('aria-hidden', 'true');
  applyForumHue(avatar, siteUrl);
  const initial = document.createElement('span');
  initial.className = 'forum-avatar-initial';
  initial.textContent = siteUrl ? forumInitial(forumName) : '?';
  avatar.appendChild(initial);
  if (withFavicon && siteUrl) {
    const icon = document.createElement('img');
    icon.className = 'forum-avatar-icon hidden';
    icon.alt = '';
    icon.referrerPolicy = 'no-referrer';
    icon.addEventListener('load', () => {
      icon.classList.remove('hidden');
      initial.classList.add('hidden');
    }, { once: true });
    icon.src = `${siteUrl}/favicon.ico`;
    avatar.appendChild(icon);
  }
  return avatar;
}

export function createForumChip(siteUrl, forumName) {
  const chip = document.createElement('span');
  chip.className = 'forum-chip';
  applyForumHue(chip, siteUrl);
  chip.textContent = forumName;
  chip.title = forumHostname(siteUrl) || forumName;
  return chip;
}

function pageHostname(url) {
  try {
    const pageUrl = new URL(url || '');
    return /^https?:$/.test(pageUrl.protocol) ? pageUrl.hostname : '';
  } catch {
    // Blank tabs and browser pages have no host to show.
    return '';
  }
}

// The forum bar, the hero eyebrow and the page title.
export class ForumBar {
  constructor({ forums }) {
    this.forums = forums;
    this.bar = document.getElementById('forumBar');
    this.icon = document.getElementById('forumBarIcon');
    this.initial = document.getElementById('forumBarInitial');
  }

  mount() {
    this.icon.addEventListener('load', () => {
      this.icon.classList.remove('hidden');
      this.initial.classList.add('hidden');
    });
    this.icon.addEventListener('error', () => {
      this.icon.classList.add('hidden');
      this.initial.classList.remove('hidden');
    });
  }

  // `previousSiteUrl` is undefined on the first render; a change of forum
  // afterwards is highlighted and announced.
  render(context = {}, previousSiteUrl) {
    const { bar, icon, initial } = this;
    const siteUrl = context.siteUrl || '';
    const name = document.getElementById('forumBarName');
    const host = document.getElementById('forumBarHost');
    this.forums.refresh();
    const forumName = siteUrl ? this.forums.label(siteUrl) : '';
    const hostname = forumHostname(siteUrl);

    const hidden = !siteUrl && context.pageHidden === true;
    bar.dataset.state = siteUrl ? 'forum' : hidden ? 'unchecked' : 'none';
    applyForumHue(bar, siteUrl);
    name.textContent = siteUrl ? forumName : hidden ? 'Page not checked yet' : 'Not a Discourse forum';
    host.textContent = siteUrl
      ? (hostname !== forumName ? hostname : '')
      : pageHostname(context.url);
    host.classList.toggle('hidden', !host.textContent);
    bar.title = siteUrl
      ? `${forumName} · ${hostname}`
      : hidden
        ? 'Click the DiscourseCopilot icon in the toolbar to check this page'
        : 'This page is not a Discourse forum';
    initial.textContent = siteUrl ? forumInitial(forumName) : hidden ? '?' : '–';

    const iconUrl = siteUrl ? `${siteUrl}/favicon.ico` : '';
    if (icon.dataset.src !== iconUrl) {
      icon.dataset.src = iconUrl;
      icon.classList.add('hidden');
      initial.classList.remove('hidden');
      if (iconUrl) {
        icon.src = iconUrl;
      } else {
        icon.removeAttribute('src');
      }
    }

    // The hero shows on forum pages only; off-topic pages get their copy
    // from the page guidance (popup.js renderGuidance).
    document.getElementById('heroEyebrow').textContent = context.isForumTopic
      ? `Topic on ${forumName}`
      : 'Current page';
    // Tab titles repeat the category and forum, which the bar already shows.
    document.getElementById('currentPageTitle').textContent = context.isForumTopic
      ? cleanTopicTitle(context.title, forumName)
      : forumName || 'This page';

    if (previousSiteUrl !== undefined && siteUrl && siteUrl !== previousSiteUrl) {
      bar.classList.remove('is-switched');
      // Restart the highlight when switching between forums in quick succession.
      void bar.offsetWidth;
      bar.classList.add('is-switched');
      bar.addEventListener('animationend', () => {
        bar.classList.remove('is-switched');
      }, { once: true });
      announce(document.getElementById('forumSwitchAnnouncer'), `Switched to ${forumName}`);
    }
    return forumName;
  }
}
