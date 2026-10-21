// A small menu that opens from a button (the summary's More menu, the
// composer's scope picker): Escape or a click elsewhere closes it, arrow keys
// move between its items, and focus returns to the button when it closes
// from the keyboard.

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

export class PopoverMenu {
  /**
   * @param {object} deps
   * @param {HTMLButtonElement} deps.button
   * @param {HTMLElement} deps.menu
   * @param {(open: boolean) => void} [deps.onToggle]
   */
  constructor({ button, menu, onToggle = () => {} }) {
    this.button = button;
    this.menu = menu;
    this.onToggle = onToggle;
  }

  get isOpen() {
    return !this.menu.classList.contains('hidden');
  }

  items() {
    return [...this.menu.querySelectorAll(ITEM_SELECTOR)].filter(item => !item.disabled && !item.classList.contains('hidden'));
  }

  mount() {
    this.button.addEventListener('click', () => {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    });
    this.button.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.open({ focus: event.key === 'ArrowDown' ? 'first' : 'last' });
      }
    });
    this.menu.addEventListener('keydown', event => {
      const items = this.items();
      const index = items.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close({ focusButton: true });
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        items[(index + step + items.length) % items.length]?.focus();
      } else if (event.key === 'Tab') {
        this.close();
      }
    });
    document.addEventListener(
      'pointerdown',
      event => {
        if (this.isOpen && !this.menu.contains(event.target) && !this.button.contains(event.target)) {
          this.close();
        }
      },
      true
    );
  }

  open({ focus = '' } = {}) {
    if (this.button.disabled) {
      return;
    }
    this.menu.classList.remove('hidden');
    this.button.setAttribute('aria-expanded', 'true');
    this.onToggle(true);
    if (focus) {
      const items = this.items();
      (focus === 'last' ? items.at(-1) : items[0])?.focus();
    }
  }

  close({ focusButton = false } = {}) {
    if (!this.isOpen) {
      return;
    }
    this.menu.classList.add('hidden');
    this.button.setAttribute('aria-expanded', 'false');
    this.onToggle(false);
    if (focusButton) {
      this.button.focus();
    }
  }
}
