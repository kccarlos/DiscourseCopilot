// The page guidance card (#pageGuide) and the "Get started" checklist: one
// card per page state, derived by page-guidance.mjs. On a Discourse forum
// without access it is the "Allow DiscourseCopilot on {forum}" card, whose
// button asks Chrome for access to the forum's origin.
// chrome.permissions.request() only works inside the click, so the handler
// calls it before anything else.
import { requestForumAccess } from '../shared/forum-access.mjs';
import { ACCESS_DENIED_TEXT, splitEmphasis } from './page-guidance.mjs';
import { announce } from './status-line.mjs';

// Shown by the Agent panel when Continue/Retry was refused.
export function forumAccessDeniedText() {
  return ACCESS_DENIED_TEXT.replaceAll('**', '');
}

const $ = id => document.getElementById(id);

// Writes text with **bold** runs as text nodes and <strong> elements.
function setRichText(element, text) {
  element.replaceChildren(
    ...splitEmphasis(text).map(part => {
      if (!part.strong) {
        return document.createTextNode(part.text);
      }
      const strong = document.createElement('strong');
      strong.textContent = part.text;
      return strong;
    })
  );
}

function setOptionalText(element, text, rich = false) {
  if (rich) {
    setRichText(element, text);
  } else {
    element.textContent = text;
  }
  element.classList.toggle('hidden', !text);
}

export class ForumAccessCard {
  /**
   * @param {object} deps
   * @param {(siteUrl: string) => Promise<void>} deps.onGranted access was granted
   * @param {() => void} deps.onDenied access was refused (re-render the card)
   * @param {(siteUrl: string) => Promise<boolean>} [deps.request] requestForumAccess
   */
  constructor({ onGranted, onDenied = () => {}, request = siteUrl => requestForumAccess(siteUrl) }) {
    this.onGranted = onGranted;
    this.onDenied = onDenied;
    this.request = request;
    this.guidance = null;
    this.pending = false;
    // The forum Chrome last refused, so the card can say how to allow it.
    this.deniedSiteUrl = '';
  }

  mount() {
    $('forumAccessBtn').addEventListener('click', () => {
      const siteUrl = this.guidance?.siteUrl;
      if (!siteUrl || this.pending || !this.guidance.card?.button) {
        return;
      }
      // First statement of the gesture: Chrome shows its permission prompt.
      const granted = this.request(siteUrl);
      void this.finish(granted, siteUrl);
    });
  }

  // Whether Chrome refused access to this forum since the card last showed it.
  isDenied(siteUrl) {
    return Boolean(siteUrl) && this.deniedSiteUrl === siteUrl;
  }

  async finish(granted, siteUrl) {
    this.pending = true;
    this.deniedSiteUrl = '';
    this.renderButton();
    let ok = false;
    try {
      ok = await granted;
    } catch {
      ok = false;
    }
    this.pending = false;
    if (!ok) {
      this.deniedSiteUrl = siteUrl;
      this.renderButton();
      this.onDenied();
      return;
    }
    try {
      await this.onGranted(siteUrl);
    } finally {
      this.renderButton();
    }
  }

  renderButton() {
    const button = $('forumAccessBtn');
    const label = this.guidance?.card?.button || '';
    button.classList.toggle('hidden', !label);
    button.disabled = this.pending;
    button.setAttribute('aria-busy', String(this.pending));
    button.textContent = this.pending ? 'Waiting for Chrome…' : label;
    button.classList.toggle('outline', Boolean(this.guidance?.card?.nextStep));
  }

  renderChecklist(checklist) {
    const section = $('getStarted');
    section.classList.toggle('hidden', !checklist);
    if (!checklist) {
      return;
    }
    $('getStartedLabel').textContent = checklist.label;
    $('getStartedList').replaceChildren(
      ...checklist.items.map((item, index) => {
        const row = document.createElement('li');
        row.dataset.status = item.status;
        if (item.status === 'current') {
          row.setAttribute('aria-current', 'step');
        }
        const number = document.createElement('span');
        number.className = 'get-started-number';
        number.setAttribute('aria-hidden', 'true');
        number.textContent = item.status === 'done' ? '✓' : String(index + 1);
        const label = document.createElement('span');
        label.textContent = item.label;
        const status = document.createElement('span');
        status.className = 'sr-only';
        status.textContent = { done: ' (done)', current: ' (current step)', next: ' (next)' }[item.status];
        row.append(number, label, status);
        return row;
      })
    );
  }

  /**
   * Renders the card and checklist for a guidance object (page-guidance.mjs).
   * The heading is announced when the page state changes, except on the
   * first render.
   */
  render(guidance) {
    const previous = this.guidance;
    this.guidance = guidance;
    const card = guidance.card;
    const section = $('pageGuide');
    const hadFocus = section.contains(document.activeElement);
    section.classList.toggle('hidden', !card);
    section.dataset.state = guidance.state;
    section.dataset.step = card?.nextStep ? 'next' : '';
    if (card) {
      $('pageGuideEyebrow').textContent = card.eyebrow;
      $('pageGuideHeading').textContent = card.title;
      setRichText($('pageGuideText'), card.text);
      const steps = $('pageGuideSteps');
      steps.replaceChildren(
        ...card.steps.map(step => {
          const item = document.createElement('li');
          const content = document.createElement('span');
          setRichText(content, step);
          item.append(content);
          return item;
        })
      );
      steps.classList.toggle('hidden', !card.steps.length);
      const links = $('pageGuideLinks');
      links.replaceChildren(
        ...card.links.map(link => {
          const item = document.createElement('li');
          const anchor = document.createElement('a');
          anchor.href = link.href;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.textContent = link.label;
          const external = document.createElement('span');
          external.setAttribute('aria-hidden', 'true');
          external.textContent = '↗';
          const hint = document.createElement('span');
          hint.className = 'sr-only';
          hint.textContent = ' (opens in a new tab)';
          anchor.append(external, hint);
          item.append(anchor);
          return item;
        })
      );
      links.classList.toggle('hidden', !card.links.length);
      setOptionalText($('forumAccessNote'), card.notice, true);
      setOptionalText($('pageGuideFootnote'), card.footnote);
      setOptionalText($('pageGuideTip'), card.tip);
    }
    this.renderButton();
    this.renderChecklist(guidance.checklist);

    if (previous && previous.key !== guidance.key) {
      if (previous.siteUrl !== guidance.siteUrl) {
        this.deniedSiteUrl = '';
      }
      if (card) {
        announce($('guideAnnouncer'), card.title);
        if (hadFocus) {
          $('pageGuideHeading').focus({ preventScroll: true });
        }
      }
    }
    return guidance;
  }
}
