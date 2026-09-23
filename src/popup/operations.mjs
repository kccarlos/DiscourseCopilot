// The one request the side panel is submitting at a time (summary, chat
// question or Agent question). It snapshots the page and configuration when
// it starts, so a tab switch or settings change mid-request cannot mix them,
// and it goes stale when the page changes (topic requests) or it is cancelled.

export class OperationTracker {
  /**
   * @param {object} deps
   * @param {() => string|undefined} deps.getPageKey the current page's key
   * @param {() => void} [deps.onChange] the active operation started or ended
   * @param {() => void} [deps.onCancel] cancel() dropped the active operation
   */
  constructor({ getPageKey, onChange = () => {}, onCancel = () => {} }) {
    this.getPageKey = getPageKey;
    this.onChange = onChange;
    this.onCancel = onCancel;
    this.active = null;
    this.revision = 0;
  }

  get kind() {
    return this.active?.kind || '';
  }

  get busy() {
    return Boolean(this.active);
  }

  /**
   * Starts an operation, or returns null while another is active or the page
   * can't host it (topic work needs a topic; Agent questions a forum page).
   * @param {'summary'|'chat'|'agent'} kind
   * @param {object} context the page context
   * @param {object} snapshot provider, settings, prompt, language, limit
   */
  begin(kind, context, snapshot = {}) {
    if (
      this.active
      || (kind !== 'agent' && !context?.isForumTopic)
      || (kind === 'agent' && !context?.isDiscourse)
    ) {
      return null;
    }
    const revision = ++this.revision;
    this.active = {
      id: `${Date.now()}-${revision}`,
      revision,
      kind,
      // Agent questions survive navigation; topic work belongs to its page.
      pageKey: kind === 'agent' ? null : context.pageKey,
      postId: context.postId,
      topicKey: context.topicKey,
      siteUrl: context.siteUrl,
      forumName: context.forumName || '',
      ...snapshot
    };
    this.onChange();
    return this.active;
  }

  isCurrent(operation) {
    return Boolean(
      operation
      && this.active === operation
      && operation.revision === this.revision
      && (!operation.pageKey || operation.pageKey === this.getPageKey())
    );
  }

  finish(operation) {
    if (!this.isCurrent(operation)) {
      return;
    }
    this.active = null;
    this.onChange();
  }

  cancel() {
    this.revision++;
    this.active = null;
    this.onCancel();
    this.onChange();
  }
}
