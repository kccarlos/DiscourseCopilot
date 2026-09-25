// Activity lists grouped by forum: collapsible forum sections (the current
// forum first) and the forum filter chips above the lists.
import { groupByForum } from './forum-names.mjs';
import { applyForumHue, createForumAvatar } from './forum-ui.mjs';

const $ = id => document.getElementById(id);

export function emptyMessage(className, text) {
  const paragraph = document.createElement('p');
  paragraph.className = className;
  paragraph.textContent = text;
  return paragraph;
}

export class ForumGroups {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (pageContext)
   * @param {object} deps.forums ForumDirectory
   * @param {() => object[]} deps.getRecords everything the filter offers forums from
   * @param {() => void} deps.onFilterChange re-render the lists
   */
  constructor({ state, forums, getRecords, onFilterChange }) {
    this.state = state;
    this.forums = forums;
    this.getRecords = getRecords;
    this.onFilterChange = onFilterChange;
    // Expanded/collapsed per `${listKey}:${siteUrl}` once the user toggled it.
    this.groupState = new Map();
    this.filter = '';
    this.filterSignature = '';
  }

  // The filter chips are rebuilt on the next render (e.g. after the detail
  // view hid them).
  invalidateFilter() {
    this.filterSignature = '';
  }

  isExpanded(listKey, group, groupCount) {
    if (this.filter) {
      return true;
    }
    const stored = this.groupState.get(`${listKey}:${group.siteUrl}`);
    return typeof stored === 'boolean'
      ? stored
      : group.isCurrent || groupCount <= 3;
  }

  render(container, items, listKey, createCard) {
    const filter = this.filter;
    const visible = filter
      ? items.filter(item => item.siteUrl === filter)
      : items;
    const groups = groupByForum(visible, this.state.pageContext?.siteUrl, {
      names: this.forums.names
    });
    if (filter && items.length && !visible.length) {
      container.appendChild(emptyMessage('saved-empty', `Nothing from ${this.forums.label(filter)} here.`));
      return;
    }

    groups.forEach((group, index) => {
      const section = document.createElement('section');
      section.className = 'forum-group';
      section.classList.toggle('current', group.isCurrent);
      const bodyId = `forum-group-${listKey}-${index}`;
      const expanded = this.isExpanded(listKey, group, groups.length);
      const forumName = group.siteUrl ? this.forums.label(group.siteUrl, group.forumName) : group.forumName;

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'forum-group-toggle';
      toggle.dataset.focusKey = `${listKey}:${group.siteUrl}`;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-controls', bodyId);
      toggle.setAttribute(
        'aria-label',
        `${forumName}${group.isCurrent ? ', this forum' : ''}, ${group.items.length} item${group.items.length === 1 ? '' : 's'}`
      );

      const copy = document.createElement('span');
      copy.className = 'forum-group-copy';
      const name = document.createElement('strong');
      name.textContent = forumName;
      copy.appendChild(name);
      if (group.hostname && group.hostname !== forumName) {
        const host = document.createElement('span');
        host.className = 'forum-group-host';
        host.textContent = group.hostname;
        copy.appendChild(host);
      }
      toggle.append(createForumAvatar(group.siteUrl, forumName, group.isCurrent), copy);
      if (group.isCurrent) {
        const badge = document.createElement('span');
        badge.className = 'forum-current-badge';
        badge.textContent = 'This forum';
        toggle.appendChild(badge);
      }
      const count = document.createElement('span');
      count.className = 'count-badge';
      count.textContent = String(group.items.length);
      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.setAttribute('aria-hidden', 'true');
      toggle.append(count, chevron);

      const body = document.createElement('div');
      body.id = bodyId;
      body.className = 'forum-group-items';
      body.hidden = !expanded;
      for (const item of group.items) {
        body.appendChild(createCard(item));
      }
      toggle.addEventListener('click', () => {
        const next = toggle.getAttribute('aria-expanded') !== 'true';
        this.groupState.set(`${listKey}:${group.siteUrl}`, next);
        toggle.setAttribute('aria-expanded', String(next));
        body.hidden = !next;
      });
      section.append(toggle, body);
      container.appendChild(section);
    });
  }

  renderFilter() {
    const container = $('forumFilter');
    const records = this.getRecords().filter(record => record.siteUrl);
    const groups = groupByForum(records, this.state.pageContext?.siteUrl, {
      names: this.forums.names
    });
    if (this.filter && !groups.some(group => group.siteUrl === this.filter)) {
      this.filter = '';
    }
    const options = groups.length >= 2
      ? [
          { siteUrl: '', label: 'All' },
          ...groups.map(group => ({
            siteUrl: group.siteUrl,
            label: this.forums.label(group.siteUrl, group.forumName)
          }))
        ]
      : [];
    const signature = JSON.stringify([this.filter, options]);
    if (signature === this.filterSignature) {
      return;
    }
    this.filterSignature = signature;
    container.replaceChildren();
    container.classList.toggle('hidden', !options.length);
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'forum-filter-chip';
      button.dataset.focusKey = `filter:${option.siteUrl}`;
      button.setAttribute('aria-pressed', String(option.siteUrl === this.filter));
      if (option.siteUrl) {
        applyForumHue(button, option.siteUrl);
        const dot = document.createElement('span');
        dot.className = 'forum-filter-dot';
        dot.setAttribute('aria-hidden', 'true');
        button.appendChild(dot);
      }
      button.append(option.label);
      button.addEventListener('click', () => {
        this.filter = option.siteUrl;
        this.onFilterChange();
        container.querySelector(`[data-focus-key="${CSS.escape(`filter:${option.siteUrl}`)}"]`)?.focus();
      });
      container.appendChild(button);
    }
  }
}
