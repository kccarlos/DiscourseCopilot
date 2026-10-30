// The composer at the bottom of the topic view: one box for both questions.
// Its scope picks the form it sends: "This post" is the follow-up chat
// (#chatForm), "Whole forum" asks the Agent (#agentForm, with the Ask the
// forum suggestions above the box). Off a topic only the forum can be asked.
// The forum context limit opens from the box as a popover.
import { t } from '../shared/i18n.mjs';
import { PopoverMenu } from './popover-menu.mjs';

const $ = id => document.getElementById(id);

export const COMPOSER_SCOPE = { POST: 'post', FORUM: 'forum' };

export class ComposerDock {
  /**
   * @param {object} deps
   * @param {(scope: string) => void} deps.onScope the user picked a scope
   */
  constructor({ onScope }) {
    this.onScope = onScope;
    this.scope = COMPOSER_SCOPE.POST;
    this.menu = new PopoverMenu({ button: $('composerScopeBtn'), menu: $('composerScopeMenu') });
  }

  get context() {
    return $('forumContextControl');
  }

  mount() {
    this.menu.mount();
    // The page scrolls under the sticky composer: its height is the bottom
    // scroll padding, so scrollIntoView stops above the box, not behind it.
    new ResizeObserver(([entry]) => {
      const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight);
      document.documentElement.style.setProperty('--composer-height', `${height}px`);
    }).observe($('composerDock'));
    for (const option of $('composerScopeMenu').querySelectorAll('[data-scope]')) {
      option.addEventListener('click', () => {
        this.menu.close();
        if (option.dataset.scope !== this.scope) {
          this.onScope(option.dataset.scope);
        } else {
          this.focusInput();
        }
      });
    }
    // The context popover closes like a menu: Escape or a click elsewhere.
    const context = this.context;
    context.addEventListener('keydown', event => {
      if (event.key === 'Escape' && context.open) {
        event.preventDefault();
        context.open = false;
        context.querySelector('summary').focus();
      }
    });
    document.addEventListener(
      'pointerdown',
      event => {
        if (context.open && !context.contains(event.target)) {
          context.open = false;
        }
      },
      true
    );
  }

  focusInput() {
    $(this.scope === COMPOSER_SCOPE.FORUM ? 'agentInput' : 'chatInput').focus();
  }

  /**
   * @param {object} input
   * @param {boolean} input.hasTopic a topic is open (the post can be asked)
   * @param {boolean} input.forumOpen the Ask the forum composer is open
   */
  render({ hasTopic, forumOpen }) {
    const scope = forumOpen || !hasTopic ? COMPOSER_SCOPE.FORUM : COMPOSER_SCOPE.POST;
    this.scope = scope;
    $('composerDock').dataset.scope = scope;
    $('composerScopeLabel').textContent = t(scope === COMPOSER_SCOPE.FORUM ? 'popup.scope.forum' : 'popup.scope.post');
    $('composerScopePost').disabled = !hasTopic;
    for (const option of $('composerScopeMenu').querySelectorAll('[data-scope]')) {
      option.setAttribute('aria-checked', String(option.dataset.scope === scope));
    }
    if (scope === COMPOSER_SCOPE.FORUM && this.context.open) {
      this.context.open = false;
    }
  }
}
