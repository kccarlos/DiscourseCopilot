// The topic the panel shows: switches the topic session when the page
// changes, restores it from IndexedDB (once per topic) or reloads it after
// the background saved new work, renders it into the summary and chat
// views, and routes summary/chat task updates and streamed text to them.
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { TASK_TYPE } from '../shared/task-record.mjs';
import { canonicalizeTopicUrl } from './topic-session.mjs';

function usableTitle(title) {
  return title && title !== 'Unknown page';
}

export class TopicController {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state; this controller writes state.session
   * @param {object} deps.sessions SessionStore
   * @param {object} deps.forums ForumDirectory
   * @param {object} deps.status StatusLine
   * @param {object} deps.summary SummaryView
   * @param {object} deps.chat ChatView
   * @param {Map<string, string>} deps.streams streamed text per topic task ID
   * @param {object} deps.hooks updateUI, updateControls
   */
  constructor({ state, sessions, forums, status, summary, chat, streams, hooks }) {
    this.state = state;
    this.sessions = sessions;
    this.forums = forums;
    this.status = status;
    this.summary = summary;
    this.chat = chat;
    this.streams = streams;
    this.hooks = hooks;
    this.loadRevision = 0;
  }

  isCurrentTopic(topicKey) {
    return Boolean(topicKey) && topicKey === this.state.pageContext?.topicKey;
  }

  // ---------- Session lifecycle ----------

  // A new page: show its topic's session (or none) and restore it.
  async open(context) {
    this.state.session = context.isForumTopic
      ? this.sessions.getOrCreate(context, this.forums.reportedName(context))
      : null;
    this.render();
    await this.hydrate(context);
  }

  // The same page reported a newer URL, title or forum name.
  refreshDetails(context) {
    const session = this.state.session;
    if (!session || !context.isForumTopic) {
      return;
    }
    session.url = canonicalizeTopicUrl(context.url, context.postId, context.siteUrl);
    if (usableTitle(context.title)) {
      session.title = context.title;
    }
    const reportedName = this.forums.reportedName(context);
    if (reportedName) {
      session.forumName = reportedName;
    }
  }

  // Replaces the current topic's session with a fresh one (it was deleted).
  reset() {
    const context = this.state.pageContext;
    this.state.session = this.sessions.getOrCreate(context, this.forums.reportedName(context));
    this.sessions.markHydrated(context.topicKey);
    this.render();
  }

  persist() {
    return this.sessions.persist(this.state.session);
  }

  // Loads the saved session the first time a topic is shown.
  async hydrate(context) {
    const { state } = this;
    const loadRevision = ++this.loadRevision;
    if (!context.isForumTopic || this.sessions.isHydrated(context.topicKey)) {
      return;
    }
    if (!state.persistenceAvailable) {
      this.sessions.markHydrated(context.topicKey);
      return;
    }

    state.isHydratingSession = true;
    this.hooks.updateControls();
    try {
      const stored = await this.sessions.load(context.topicKey);
      if (loadRevision !== this.loadRevision || context.pageKey !== state.pageContext?.pageKey) {
        return;
      }

      if (stored) {
        stored.url = canonicalizeTopicUrl(context.url || stored.url, context.postId, context.siteUrl);
        if (usableTitle(context.title)) {
          stored.title = context.title;
        }
        const forumName = this.forums.reportedName(context);
        if (forumName && stored.forumName !== forumName) {
          stored.forumName = forumName;
          if (stored.summary) {
            void this.sessions.persist(stored);
          }
        }
        this.sessions.cache(stored);
        state.session = stored;
        this.render();
      }
      this.sessions.markHydrated(context.topicKey);
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to restore saved summary:', error);
      if (loadRevision === this.loadRevision) {
        this.status.show('Saved history could not be loaded', 'warning');
      }
    } finally {
      if (loadRevision === this.loadRevision) {
        state.isHydratingSession = false;
        this.hooks.updateUI({ announce: false });
      }
    }
  }

  // Re-reads the current topic's session after the background saved it.
  async reload() {
    const { state } = this;
    if (!state.persistenceAvailable || !state.pageContext?.topicKey) {
      return;
    }
    const pageKey = state.pageContext.pageKey;
    try {
      const stored = await this.sessions.load(state.pageContext.topicKey);
      if (!stored || pageKey !== state.pageContext?.pageKey) {
        return;
      }
      this.sessions.remember(stored);
      state.session = stored;
      this.render();
      this.hooks.updateUI({ announce: false });
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to refresh saved session:', error);
    }
  }

  render() {
    const { summary, chat } = this;
    summary.hideFetchProgress();
    chat.clearInput();

    const session = this.state.session;
    if (!session) {
      summary.setPostContent('');
      summary.setSummary('');
      chat.renderHistory([]);
      chat.renderContextControl();
      return;
    }

    summary.setPostContent(session.source, { updateSession: false });
    summary.setSummary(session.summary, { updateSession: false });
    chat.renderHistory(session.history);
    summary.updateMeta();
    chat.renderContextControl();
  }

  // ---------- Topic tasks ----------

  renderTaskState(task) {
    if (task && this.isCurrentTopic(task.topicKey)) {
      this.summary.renderTaskState(task);
    }
  }

  handleTaskUpdated(task) {
    if (this.isCurrentTopic(task.topicKey)) {
      this.renderTaskState(task);
      this.hooks.updateControls();
    }
  }

  handleStream(message) {
    if (!this.isCurrentTopic(message.topicKey)) {
      return;
    }
    const content = (this.streams.get(message.taskId) || '') + message.chunk;
    this.streams.set(message.taskId, content);
    if (message.type === TASK_TYPE.SUMMARY) {
      this.summary.renderStream(content);
    } else {
      this.chat.renderStream(message.taskId, content);
    }
  }
}
