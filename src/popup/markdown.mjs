// Markdown rendering for AI output: marked → allow-listed HTML, with Agent
// citations ([S1]) turned into links to their source cards. Streaming
// updates are batched to one render per animation frame.
import { marked } from 'marked';
import { linkifyCitations } from './ui-state.mjs';

marked.setOptions({ breaks: false, gfm: true });

const ALLOWED_TAGS = new Set([
  'A', 'BLOCKQUOTE', 'BR', 'CODE', 'DEL', 'EM', 'H1', 'H2', 'H3',
  'H4', 'H5', 'H6', 'HR', 'LI', 'OL', 'P', 'PRE', 'STRONG', 'TABLE',
  'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL'
]);

// Links may only point to the web, mail or an in-page anchor; anything else
// (javascript:, data:, vbscript:, relative paths) loses its href.
export function isAllowedHref(href) {
  return /^(https?:|mailto:|#)/i.test(String(href ?? '').trim());
}

export function markdownToHtml(markdown) {
  return marked.parse(markdown || '');
}

export function sanitizeHTML(html) {
  const template = document.createElement('template');
  template.innerHTML = html;

  for (const element of [...template.content.querySelectorAll('*')]) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const allowedAttribute = element.tagName === 'A'
        && (name === 'href' || name === 'title');
      if (!allowedAttribute) {
        element.removeAttribute(attribute.name);
      }
    }

    if (element.hasAttribute('href')) {
      if (!isAllowedHref(element.getAttribute('href'))) {
        element.removeAttribute('href');
      } else {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
  }

  return template.innerHTML;
}

export function renderMarkdown(element, markdown) {
  const html = sanitizeHTML(markdownToHtml(markdown));
  // Agent answers cite sources as [S1]; those become links to the source cards.
  const citations = element.dataset.citations;
  element.innerHTML = citations
    ? linkifyCitations(html, citations.split(','))
    : html;
}

// Batches streaming renders: the latest markdown per element, once per frame.
export class MarkdownScheduler {
  /**
   * @param {object} chatScroll keeps a streaming chat reply pinned to the bottom
   * @param {() => boolean} chatScroll.isNearBottom
   * @param {() => void} chatScroll.scrollToBottom
   */
  constructor(chatScroll) {
    this.chatScroll = chatScroll;
    this.pending = new Map();
    this.frame = null;
  }

  schedule(element, markdown, keepChatPinned = false) {
    this.pending.set(element, { markdown, keepChatPinned });
    if (this.frame !== null) {
      return;
    }
    this.frame = requestAnimationFrame(() => {
      for (const [target, render] of this.pending) {
        const shouldFollow = render.keepChatPinned && this.chatScroll.isNearBottom();
        renderMarkdown(target, render.markdown);
        if (shouldFollow) {
          this.chatScroll.scrollToBottom();
        }
      }
      this.pending.clear();
      this.frame = null;
    });
  }

  cancel() {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.pending.clear();
  }
}
