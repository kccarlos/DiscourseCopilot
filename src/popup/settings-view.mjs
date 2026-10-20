// The Settings screen inside the side panel (#settingsView): the settings
// page (src/settings/settings.html?embedded=1) in an iframe of the same
// extension, so there is no second tab to close. Like Activity it replaces the
// topic view; Back returns to whichever of the two the user came from.
//
// Leaving with unsaved edits asks first, inline (never a browser dialog).
// Every way out goes through leave(): Back, the header's Activity and
// Settings buttons, and "Not set up".
import { DiscourseCopilotLogger } from '../shared/logger.js';

const $ = id => document.getElementById(id);

const SETTINGS_PAGE = '../settings/settings.html';

export class SettingsView {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (settingsViewOpen, savedViewOpen)
   */
  constructor({ state }) {
    this.state = state;
    this.returnTo = 'topic';
    this.opener = null;
    this.pendingExit = null;
  }

  get frame() {
    return $('settingsFrame');
  }

  get isOpen() {
    return this.state.settingsViewOpen;
  }

  mount() {
    $('closeSettingsBtn').addEventListener('click', () => this.leave());
    $('settingsLeaveDiscard').addEventListener('click', () => this.discardAndLeave());
    $('settingsLeaveKeep').addEventListener('click', () => this.keepEditing());
    $('settingsLeave').addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.keepEditing();
      }
    });
    window.addEventListener('resize', () => this.fit());
  }

  // The page inside the frame (same origin), once it has started.
  get page() {
    try {
      return this.frame.contentWindow?.settingsInstance || null;
    } catch {
      return null;
    }
  }

  // A frame that has not loaded yet has nothing to lose.
  get isDirty() {
    const page = this.page;
    return Boolean(page && (page.form?.edited || page.isBusy));
  }

  /** Opens Settings, at one of its sections ('provider', 'forumAccess', …) when given. */
  open({ section = '' } = {}) {
    if (this.isOpen) {
      this.page?.goToSection?.(section || 'provider');
      return;
    }
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.returnTo = this.state.savedViewOpen ? 'activity' : 'topic';
    this.state.settingsViewOpen = true;
    $('topicView').classList.add('hidden');
    $('savedView').classList.add('hidden');
    $('settingsView').classList.remove('hidden');
    document.body.classList.add('settings-open');
    $('settingsBtn').setAttribute('aria-pressed', 'true');
    this.hideLeave();
    const url = new URL(SETTINGS_PAGE, location.href);
    url.searchParams.set('embedded', '1');
    if (section) {
      url.searchParams.set('section', section);
    }
    this.frame.src = url.href;
    window.scrollTo(0, 0);
    this.fit();
    $('settingsHeading').focus({ preventScroll: true });
  }

  // Closes Settings, then runs `then` (the view the user was heading to).
  // With unsaved changes it asks first and `then` waits for the answer.
  leave(then = null) {
    if (!this.isOpen) {
      then?.();
      return;
    }
    if (this.isDirty) {
      this.pendingExit = then || (() => {});
      this.showLeave();
      return;
    }
    this.close();
    then?.();
  }

  toggle() {
    if (this.isOpen) {
      this.leave();
    } else {
      this.open();
    }
  }

  showLeave() {
    $('settingsLeave').classList.remove('hidden');
    this.fit();
    $('settingsLeaveKeep').focus();
  }

  hideLeave() {
    $('settingsLeave').classList.add('hidden');
    this.pendingExit = null;
  }

  keepEditing() {
    this.hideLeave();
    this.fit();
    $('settingsHeading').focus({ preventScroll: true });
  }

  discardAndLeave() {
    const then = this.pendingExit;
    this.close();
    then?.();
  }

  close() {
    this.state.settingsViewOpen = false;
    this.hideLeave();
    // Dropping the page makes the next visit start from what is saved.
    this.frame.removeAttribute('src');
    $('settingsView').classList.add('hidden');
    document.body.classList.remove('settings-open');
    $('settingsBtn').setAttribute('aria-pressed', 'false');
    if (this.returnTo === 'activity') {
      $('savedView').classList.remove('hidden');
    } else {
      $('topicView').classList.remove('hidden');
    }
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected && opener.offsetParent !== null) {
      opener.focus({ preventScroll: true });
    } else {
      $('settingsBtn').focus({ preventScroll: true });
    }
  }

  // The frame fills what is left of the panel below the header; the settings
  // page scrolls inside it and keeps its Save bar in view.
  fit() {
    const frame = this.frame;
    if (!this.isOpen) {
      return;
    }
    try {
      const top = frame.getBoundingClientRect().top + window.scrollY;
      frame.style.height = `${Math.max(320, window.innerHeight - top - 8)}px`;
    } catch (error) {
      DiscourseCopilotLogger.warn('Popup: Unable to size the settings frame:', error);
    }
  }
}
