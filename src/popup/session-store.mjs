// Topic sessions (summary, source posts, chat history) cached in the side
// panel and saved to IndexedDB, with writes serialized per topic.
import { topicSessionDatabase } from '../shared/topic-session-db.mjs';
import { createTopicSession, normalizeTopicSession } from '../shared/topic-session.mjs';
import { DiscourseCopilotLogger } from '../shared/logger.js';

export class SessionStore {
  /**
   * @param {object} deps
   * @param {() => boolean} deps.isPersistent whether IndexedDB is usable
   * @param {(session: object) => void} [deps.onSaveError] a save failed
   * @param {object} [deps.db]
   */
  constructor({ isPersistent, onSaveError = () => {}, db = topicSessionDatabase }) {
    this.isPersistent = isPersistent;
    this.onSaveError = onSaveError;
    this.db = db;
    this.sessions = new Map();
    // Topics whose saved session was already looked up this panel lifetime.
    this.hydrated = new Set();
    this.persistenceQueues = new Map();
  }

  getOrCreate(context, forumName = '') {
    if (!this.sessions.has(context.topicKey)) {
      this.sessions.set(context.topicKey, createTopicSession({
        topicId: context.postId,
        siteUrl: context.siteUrl,
        url: context.url,
        title: context.title,
        forumName
      }));
    }
    return this.sessions.get(context.topicKey);
  }

  // Caches a session without marking its topic hydrated.
  cache(session) {
    this.sessions.set(session.topicKey, session);
  }

  // Caches a session read from (or written to) the database.
  remember(session) {
    this.sessions.set(session.topicKey, session);
    this.hydrated.add(session.topicKey);
  }

  isHydrated(topicKey) {
    return this.hydrated.has(topicKey);
  }

  markHydrated(topicKey) {
    this.hydrated.add(topicKey);
  }

  forget(topicKey) {
    this.sessions.delete(topicKey);
    this.hydrated.delete(topicKey);
  }

  load(topicKey) {
    return this.db.get(topicKey);
  }

  snapshot(session) {
    if (!session) {
      return null;
    }
    return normalizeTopicSession({
      ...session,
      rawPages: session.rawPages?.map(entry => ({ ...entry })) || [],
      history: session.history?.map(message => ({ ...message })) || []
    });
  }

  // Resolves to whether the session was saved; failures are logged and
  // reported through onSaveError.
  async persist(session) {
    if (!this.isPersistent() || !session?.topicKey) {
      return false;
    }

    const snapshot = this.snapshot(session);
    const previous = this.persistenceQueues.get(session.topicKey) || Promise.resolve();
    const save = previous
      .catch(() => {
        // A later snapshot should still be saved if an earlier write failed.
      })
      .then(() => this.db.save(snapshot));
    this.persistenceQueues.set(session.topicKey, save);

    try {
      await save;
      return true;
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to save summary session:', error);
      this.onSaveError(session);
      return false;
    } finally {
      if (this.persistenceQueues.get(session.topicKey) === save) {
        this.persistenceQueues.delete(session.topicKey);
      }
    }
  }
}
