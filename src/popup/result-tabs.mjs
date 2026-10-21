// Summary and Chat share one place on the topic view: a tab row over the two
// cards. The cards stay <details> elements, so everything that opens or folds
// them (reading-focus.mjs, the summary and chat views) keeps working; the tabs
// follow their open state and opening one folds the other. The tab row also
// holds each card's tools: Copy / Download / More for the summary, the
// question count and Clear for the chat.
import { tn } from '../shared/i18n.mjs';
import { PopoverMenu } from './popover-menu.mjs';

const $ = id => document.getElementById(id);

export class ResultTabs {
  constructor() {
    this.tabs = {
      summary: { tab: $('summaryTab'), card: $('summaryContainer') },
      chat: { tab: $('chatTab'), card: $('chatContainer') }
    };
    this.more = new PopoverMenu({ button: $('summaryMoreBtn'), menu: $('summaryMoreMenu') });
  }

  mount() {
    for (const [name, { tab, card }] of Object.entries(this.tabs)) {
      tab.addEventListener('click', () => this.select(name));
      card.addEventListener('toggle', () => {
        if (card.open) {
          this.foldOthers(name);
        }
        this.render();
      });
    }
    $('resultTabs')
      .querySelector('[role="tablist"]')
      .addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          return;
        }
        const visible = this.visibleNames();
        const current = visible.indexOf(this.selected() || 'summary');
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? visible.length - 1
              : (current + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
        event.preventDefault();
        this.select(visible[next]);
        this.tabs[visible[next]].tab.focus();
      });
    this.more.mount();
    // A menu item runs its own action; the menu closes after it.
    $('summaryMoreMenu').addEventListener('click', event => {
      if (event.target.closest('[role="menuitem"]')) {
        this.more.close();
      }
    });
    // Visibility and open state change from many places; follow them.
    const observer = new MutationObserver(() => this.render());
    for (const { card } of Object.values(this.tabs)) {
      observer.observe(card, { attributes: true, attributeFilter: ['class'] });
    }
    observer.observe($('chatMessages'), { childList: true });
    this.render();
  }

  isShown(name) {
    return !this.tabs[name].card.classList.contains('hidden');
  }

  visibleNames() {
    return Object.keys(this.tabs).filter(name => this.isShown(name));
  }

  // The open card ('' when both are folded, e.g. while an answer has the focus).
  selected() {
    return this.visibleNames().find(name => this.tabs[name].card.open) || '';
  }

  select(name) {
    const { card } = this.tabs[name];
    if (!this.isShown(name)) {
      return;
    }
    this.foldOthers(name);
    card.open = true;
    this.render();
  }

  foldOthers(name) {
    for (const [other, { card }] of Object.entries(this.tabs)) {
      if (other !== name && card.open) {
        card.open = false;
      }
    }
  }

  render() {
    const row = $('resultTabs');
    const visible = this.visibleNames();
    row.classList.toggle('hidden', !visible.length);
    const selected = this.selected();
    row.dataset.selected = selected;
    for (const [name, { tab }] of Object.entries(this.tabs)) {
      tab.classList.toggle('hidden', !visible.includes(name));
      const isSelected = name === selected;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected || (!selected && name === visible[0]) ? 0 : -1;
    }
    if (selected !== 'summary') {
      this.more.close();
    }
    const questions = $('chatMessages').querySelectorAll('.chat-message.user').length;
    const count = $('chatTabCount');
    count.textContent = questions ? String(questions) : '';
    count.classList.toggle('hidden', !questions);
    count.title = questions ? tn('chat.asked', questions) : '';
  }
}
