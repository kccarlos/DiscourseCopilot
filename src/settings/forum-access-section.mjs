// Settings → "Forum access": the forums the user enabled, with Remove
// access (confirmed inline). Removing access never deletes saved summaries
// or answers; the list follows grants and removals made anywhere
// (chrome.permissions.onAdded/onRemoved).
import { hostPatternForUrl, listGrantedForums, revokeForumAccess, subscribeForumAccess } from '../shared/forum-access.mjs';
import { parseSiteUrl } from '../shared/forum-site.mjs';
import { t, tn } from '../shared/i18n.mjs';

export const FORUM_ACCESS_EMPTY_TEXT = t('settings.forumAccess.empty');

function originOf(siteUrl) {
  return parseSiteUrl(siteUrl)?.origin || '';
}

function isRealName(name, hostname) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return Boolean(trimmed) && trimmed.toLowerCase() !== hostname.toLowerCase();
}

/**
 * One row per granted forum origin (pure).
 * @param {string[]} origins granted forum origins (listGrantedForums)
 * @param {Array<{siteUrl: string, forumName?: string}>} records saved topic
 *   sessions and Agent answers, for forum names and saved-item counts
 * @returns {Array<{origin: string, host: string, name: string, savedCount: number}>}
 */
export function buildForumAccessRows(origins = [], records = []) {
  return origins.map(origin => {
    const host = new URL(origin).hostname;
    let name = '';
    let savedCount = 0;
    for (const record of records) {
      if (originOf(record?.siteUrl) !== origin) {
        continue;
      }
      savedCount++;
      if (!name && isRealName(record.forumName, host)) {
        name = record.forumName.trim().slice(0, 120);
      }
    }
    return { origin, host, name, savedCount };
  });
}

export function describeSavedCount(count) {
  if (!count) return '';
  return tn('settings.forumAccess.saved', count);
}

const $ = id => document.getElementById(id);

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export class ForumAccessSection {
  /**
   * @param {object} deps
   * @param {() => Promise<object[]>} deps.loadRecords saved sessions and Agent answers
   * @param {() => string[]} deps.excludedPatterns host patterns that aren't forums
   *   (a custom Ollama / LM Studio server)
   * @param {(message: string, type?: string) => void} deps.notify
   */
  constructor({ loadRecords, excludedPatterns = () => [], notify = () => {} }) {
    this.loadRecords = loadRecords;
    this.excludedPatterns = excludedPatterns;
    this.notify = notify;
    this.rows = [];
    this.confirming = '';
    this.removing = '';
    this.records = null;
  }

  async mount() {
    subscribeForumAccess(() => {
      void this.refresh();
    });
    await this.refresh();
  }

  async refresh() {
    let origins = [];
    try {
      origins = await listGrantedForums({ exclude: this.excludedPatterns() });
    } catch (error) {
      console.warn('Forumind Settings: Unable to list forum access:', error);
    }
    if (this.records === null) {
      try {
        this.records = await this.loadRecords();
      } catch (error) {
        console.warn('Forumind Settings: Unable to read saved forums:', error);
        this.records = [];
      }
    }
    this.rows = buildForumAccessRows(origins, this.records);
    if (!this.rows.some(row => row.origin === this.confirming)) {
      this.confirming = '';
    }
    this.render();
  }

  render() {
    const list = $('forumAccessList');
    const empty = $('forumAccessEmpty');
    empty.textContent = FORUM_ACCESS_EMPTY_TEXT;
    empty.hidden = this.rows.length > 0;
    list.hidden = this.rows.length === 0;
    const focused = document.activeElement?.closest?.('#forumAccessList [data-origin]')?.dataset.origin;
    list.replaceChildren(...this.rows.map(row => this.renderRow(row)));
    if (focused) {
      list.querySelector(`[data-origin="${CSS.escape(focused)}"] button`)?.focus();
    }
  }

  renderRow(row) {
    const item = element('li', 'forum-access-row');
    item.dataset.origin = row.origin;
    const avatar = element('span', 'forum-access-avatar', (row.name || row.host).charAt(0).toUpperCase());
    avatar.setAttribute('aria-hidden', 'true');
    const copy = element('div', 'forum-access-row-copy');
    copy.append(element('strong', 'forum-access-row-name', row.name || row.host));
    const meta = [row.name ? row.host : '', describeSavedCount(row.savedCount)].filter(Boolean).join(' · ');
    if (meta) {
      copy.append(element('span', 'forum-access-row-meta', meta));
    }
    const actions = element('div', 'forum-access-row-actions');
    if (this.confirming === row.origin) {
      item.classList.add('is-confirming');
      const question = element('span', 'forum-access-confirm-text', t('settings.forumAccess.confirm', { host: row.host }));
      const remove = element(
        'button',
        'btn-danger btn-small',
        this.removing === row.origin ? t('settings.forumAccess.removing') : t('settings.forumAccess.remove')
      );
      remove.type = 'button';
      remove.disabled = this.removing === row.origin;
      remove.addEventListener('click', () => void this.remove(row));
      const cancel = element('button', 'btn-secondary btn-small', t('settings.cancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        this.confirming = '';
        this.render();
        $('forumAccessList')
          .querySelector(`[data-origin="${CSS.escape(row.origin)}"] button`)
          ?.focus();
      });
      actions.append(question, remove, cancel);
    } else {
      const button = element('button', 'btn-secondary btn-small', t('settings.forumAccess.removeAccess'));
      button.type = 'button';
      button.setAttribute('aria-label', t('settings.forumAccess.removeAria', { host: row.host }));
      button.addEventListener('click', () => {
        this.confirming = row.origin;
        this.render();
        $('forumAccessList')
          .querySelector(`[data-origin="${CSS.escape(row.origin)}"] .btn-danger`)
          ?.focus();
      });
      actions.append(button);
    }
    item.append(avatar, copy, actions);
    return item;
  }

  async remove(row) {
    this.removing = row.origin;
    this.render();
    try {
      const removed = await revokeForumAccess(row.origin);
      if (!removed) {
        throw new Error(t('settings.forumAccess.kept'));
      }
      this.notify(t('settings.forumAccess.removed', { host: row.host }), 'success');
    } catch (error) {
      this.notify(t('settings.forumAccess.removeFailed', { host: row.host, error: error.message }), 'error');
    } finally {
      this.removing = '';
      this.confirming = '';
      await this.refresh();
    }
  }
}

export function customServerPatterns(urls = []) {
  return urls.map(hostPatternForUrl).filter(Boolean);
}
