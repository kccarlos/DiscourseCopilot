import {
  CHAT_RETENTION_MS,
  MAX_SAVED_TOPICS,
  buildTopicIndexEntry,
  expireChatHistory,
  normalizeTopicSession
} from './topic-session.mjs';
import {
  MAX_TASK_RECORDS,
  TASK_RETENTION_MS,
  isTerminalTaskStatus,
  normalizeTaskRecord
} from '../shared/task-record.mjs';
import {
  AGENT_ACTIVITY_RETENTION_MS,
  MAX_AGENT_ACTIVITIES,
  AGENT_ACTIVITY_STATUS,
  agentActivityExpiry,
  buildAgentActivityIndexEntry,
  isAgentActivityExpired,
  isAgentActivityTerminal,
  mergeAgentActivityMarks,
  normalizeAgentActivity
} from '../shared/agent-activity.mjs';

const DATABASE_NAME = 'discourse-copilot-history';
const DATABASE_VERSION = 4;
const SESSION_STORE = 'topicSessions';
const INDEX_STORE = 'topicIndex';
const TASK_STORE = 'tasks';
const AGENT_ACTIVITY_STORE = 'agentActivities';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
      transaction.error || new Error('IndexedDB transaction was aborted')
    );
    transaction.onerror = () => reject(
      transaction.error || new Error('IndexedDB transaction failed')
    );
  });
}

function createTopicStores(database) {
  if (!database.objectStoreNames.contains(SESSION_STORE)) {
    const sessions = database.createObjectStore(SESSION_STORE, {
      keyPath: 'topicKey'
    });
    sessions.createIndex('chatUpdatedAt', 'chatUpdatedAt');
  }
  if (!database.objectStoreNames.contains(INDEX_STORE)) {
    database.createObjectStore(INDEX_STORE, { keyPath: 'topicKey' });
  }
}

// Version 4 keys topic stores by topicKey instead of topicId. IndexedDB cannot
// change a keyPath in place, so old stores are read, recreated, and refilled.
// Records whose URL cannot identify their forum are dropped.
function migrateTopicStoresToTopicKey(transaction) {
  const database = transaction.db;
  if (!database.objectStoreNames.contains(SESSION_STORE)) {
    if (database.objectStoreNames.contains(INDEX_STORE)) {
      database.deleteObjectStore(INDEX_STORE);
    }
    createTopicStores(database);
    return;
  }

  const readAll = transaction.objectStore(SESSION_STORE).getAll();
  readAll.onsuccess = () => {
    const legacySessions = readAll.result || [];
    database.deleteObjectStore(SESSION_STORE);
    if (database.objectStoreNames.contains(INDEX_STORE)) {
      database.deleteObjectStore(INDEX_STORE);
    }
    createTopicStores(database);
    const sessions = transaction.objectStore(SESSION_STORE);
    const index = transaction.objectStore(INDEX_STORE);
    for (const legacy of legacySessions) {
      const session = normalizeTopicSession(legacy);
      if (!session) {
        continue;
      }
      sessions.put(session);
      index.put(buildTopicIndexEntry(session));
    }
  };
}

export class TopicSessionDatabase {
  constructor({
    indexedDB = globalThis.indexedDB,
    keyRange = globalThis.IDBKeyRange,
    now = () => Date.now(),
    chatRetentionMs = CHAT_RETENTION_MS,
    maxSavedTopics = MAX_SAVED_TOPICS,
    maxTaskRecords = MAX_TASK_RECORDS,
    taskRetentionMs = TASK_RETENTION_MS,
    maxAgentActivities = MAX_AGENT_ACTIVITIES,
    agentActivityRetentionMs = AGENT_ACTIVITY_RETENTION_MS,
    databaseName = DATABASE_NAME
  } = {}) {
    this.indexedDB = indexedDB;
    this.keyRange = keyRange;
    this.now = now;
    this.chatRetentionMs = chatRetentionMs;
    this.maxSavedTopics = maxSavedTopics;
    this.maxTaskRecords = maxTaskRecords;
    this.taskRetentionMs = taskRetentionMs;
    this.maxAgentActivities = maxAgentActivities;
    this.agentActivityRetentionMs = agentActivityRetentionMs;
    this.databaseName = databaseName;
    this.databasePromise = null;
  }

  /**
   * Applies the history setting (resolveRetention(preferences)). Both the
   * background worker and the side panel hold an instance; each applies the
   * saved preferences at startup and on every change, so lazy expiry in get()
   * and setKept() matches the cleanup the background runs. Infinity = no
   * time limit.
   */
  setRetention({ chatMs, taskMs, agentMs, maxSavedTopics } = {}) {
    if (chatMs !== undefined) this.chatRetentionMs = chatMs;
    if (taskMs !== undefined) this.taskRetentionMs = taskMs;
    if (agentMs !== undefined) this.agentActivityRetentionMs = agentMs;
    if (Number.isInteger(maxSavedTopics) && maxSavedTopics > 0) {
      this.maxSavedTopics = maxSavedTopics;
    }
  }

  open() {
    if (!this.indexedDB) {
      return Promise.reject(new Error('IndexedDB is unavailable'));
    }
    if (this.databasePromise) {
      return this.databasePromise;
    }

    let databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = event => {
        const database = request.result;
        if (event.oldVersion > 0 && event.oldVersion < 4) {
          migrateTopicStoresToTopicKey(request.transaction);
        } else {
          createTopicStores(database);
        }
        if (!database.objectStoreNames.contains(TASK_STORE)) {
          const tasks = database.createObjectStore(TASK_STORE, { keyPath: 'id' });
          tasks.createIndex('status', 'status');
          tasks.createIndex('updatedAt', 'updatedAt');
        }
        if (!database.objectStoreNames.contains(AGENT_ACTIVITY_STORE)) {
          const activities = database.createObjectStore(AGENT_ACTIVITY_STORE, {
            keyPath: 'activityId'
          });
          activities.createIndex('status', 'status');
          activities.createIndex('updatedAt', 'updatedAt');
          activities.createIndex('kept', 'kept');
          activities.createIndex('expiresAt', 'expiresAt');
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          if (this.databasePromise === databasePromise) {
            this.databasePromise = null;
          }
        };
        resolve(database);
      };
      request.onerror = () => {
        if (this.databasePromise === databasePromise) {
          this.databasePromise = null;
        }
        reject(request.error || new Error('Unable to open summary history'));
      };
      request.onblocked = () => {
        if (this.databasePromise === databasePromise) {
          this.databasePromise = null;
        }
        const error = new Error('Summary history database upgrade is blocked');
        error.code = 'DATABASE_UPGRADE_BLOCKED';
        reject(error);
      };
    });
    this.databasePromise = databasePromise;
    return databasePromise;
  }

  async get(topicKey) {
    if (!topicKey) {
      return null;
    }
    const database = await this.open();
    const transaction = database.transaction(SESSION_STORE, 'readonly');
    const stored = await requestResult(
      transaction.objectStore(SESSION_STORE).get(String(topicKey))
    );
    await transactionComplete(transaction);
    if (!stored) {
      return null;
    }

    const now = this.now();
    const { session, expired } = expireChatHistory(
      stored,
      now,
      this.chatRetentionMs
    );
    session.lastAccessedAt = now;
    if (expired) {
      await this.save(session, { prune: false });
    }
    return session;
  }

  async save(value, { prune = true } = {}) {
    const session = normalizeTopicSession(value, this.now());
    if (!session) {
      throw new Error('A forum site and topic ID are required to save a summary session');
    }

    const database = await this.open();
    const transaction = database.transaction(
      [SESSION_STORE, INDEX_STORE],
      'readwrite'
    );
    transaction.objectStore(SESSION_STORE).put(session);
    const indexEntry = buildTopicIndexEntry(session);
    transaction.objectStore(INDEX_STORE).put(indexEntry);
    await transactionComplete(transaction);

    if (prune) {
      await this.prune();
    }
    return session;
  }

  async list() {
    const database = await this.open();
    const transaction = database.transaction(INDEX_STORE, 'readonly');
    const entries = await requestResult(
      transaction.objectStore(INDEX_STORE).getAll()
    );
    await transactionComplete(transaction);
    return entries
      .filter(entry => entry.hasSummary !== false)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async delete(topicKey) {
    const database = await this.open();
    const transaction = database.transaction(
      [SESSION_STORE, INDEX_STORE],
      'readwrite'
    );
    transaction.objectStore(SESSION_STORE).delete(String(topicKey));
    transaction.objectStore(INDEX_STORE).delete(String(topicKey));
    await transactionComplete(transaction);
  }

  async setKept(topicKey, kept) {
    const database = await this.open();
    const readTransaction = database.transaction(SESSION_STORE, 'readonly');
    const stored = await requestResult(
      readTransaction.objectStore(SESSION_STORE).get(String(topicKey))
    );
    await transactionComplete(readTransaction);
    if (!stored) {
      throw new Error('Saved session not found');
    }

    const { session } = expireChatHistory({
      ...stored,
      kept: kept === true
    }, this.now(), this.chatRetentionMs);
    return this.save(session, { prune: false });
  }

  async cleanupStaleChats() {
    const database = await this.open();
    const cutoff = this.now() - this.chatRetentionMs;
    // No time limit (Infinity) gives -Infinity here.
    if (!Number.isFinite(cutoff) || cutoff < 1) {
      return 0;
    }
    const readTransaction = database.transaction(SESSION_STORE, 'readonly');
    const staleSessions = await requestResult(
      readTransaction
        .objectStore(SESSION_STORE)
        .index('chatUpdatedAt')
        .getAll(this.keyRange.bound(1, cutoff))
    );
    await transactionComplete(readTransaction);
    if (!staleSessions.length) {
      return 0;
    }

    const expiredSessions = [];
    for (const stored of staleSessions) {
      const result = expireChatHistory(
        stored,
        this.now(),
        this.chatRetentionMs
      );
      if (result.expired) {
        expiredSessions.push(result.session);
      }
    }
    if (!expiredSessions.length) {
      return 0;
    }

    const transaction = database.transaction(
      [SESSION_STORE, INDEX_STORE],
      'readwrite'
    );
    for (const session of expiredSessions) {
      transaction.objectStore(SESSION_STORE).put(session);
      const indexEntry = buildTopicIndexEntry(session);
      transaction.objectStore(INDEX_STORE).put(indexEntry);
    }
    await transactionComplete(transaction);
    return expiredSessions.length;
  }

  async prune() {
    const database = await this.open();
    const readTransaction = database.transaction(INDEX_STORE, 'readonly');
    const entries = await requestResult(
      readTransaction.objectStore(INDEX_STORE).getAll()
    );
    await transactionComplete(readTransaction);
    entries.sort((left, right) => right.updatedAt - left.updatedAt);
    if (entries.length <= this.maxSavedTopics) {
      return 0;
    }

    const transaction = database.transaction(
      [SESSION_STORE, INDEX_STORE],
      'readwrite'
    );
    const removed = entries
      .filter(entry => !entry.kept)
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(0, entries.length - this.maxSavedTopics);
    for (const entry of removed) {
      transaction.objectStore(SESSION_STORE).delete(entry.topicKey);
      transaction.objectStore(INDEX_STORE).delete(entry.topicKey);
    }
    await transactionComplete(transaction);
    return removed.length;
  }

  async saveTask(value, { prune = true } = {}) {
    const task = normalizeTaskRecord(value, this.now());
    const database = await this.open();
    const transaction = database.transaction(TASK_STORE, 'readwrite');
    transaction.objectStore(TASK_STORE).put(task);
    await transactionComplete(transaction);
    if (prune) {
      await this.pruneTasks();
    }
    return task;
  }

  async getTask(taskId) {
    const database = await this.open();
    const transaction = database.transaction(TASK_STORE, 'readonly');
    const task = await requestResult(
      transaction.objectStore(TASK_STORE).get(String(taskId))
    );
    await transactionComplete(transaction);
    return task ? normalizeTaskRecord(task, this.now()) : null;
  }

  async listTasks() {
    const database = await this.open();
    const transaction = database.transaction(TASK_STORE, 'readonly');
    const tasks = await requestResult(transaction.objectStore(TASK_STORE).getAll());
    await transactionComplete(transaction);
    return tasks
      .map(task => {
        try {
          return normalizeTaskRecord(task, this.now());
        } catch {
          // Legacy records without a forum identity cannot be resumed.
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  async cleanupTasks() {
    const tasks = await this.listTasks();
    const cutoff = this.now() - this.taskRetentionMs;
    if (!Number.isFinite(cutoff)) {
      return 0;
    }
    const expired = tasks.filter(task =>
      isTerminalTaskStatus(task.status)
      && task.completedAt > 0
      && task.completedAt <= cutoff
    );
    if (!expired.length) {
      return 0;
    }

    const database = await this.open();
    const transaction = database.transaction(TASK_STORE, 'readwrite');
    for (const task of expired) {
      transaction.objectStore(TASK_STORE).delete(task.id);
    }
    await transactionComplete(transaction);
    return expired.length;
  }

  async pruneTasks() {
    const tasks = await this.listTasks();
    if (tasks.length <= this.maxTaskRecords) {
      return 0;
    }

    const removable = tasks
      .filter(task => isTerminalTaskStatus(task.status))
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(0, tasks.length - this.maxTaskRecords);
    if (!removable.length) {
      return 0;
    }

    const database = await this.open();
    const transaction = database.transaction(TASK_STORE, 'readwrite');
    for (const task of removable) {
      transaction.objectStore(TASK_STORE).delete(task.id);
    }
    await transactionComplete(transaction);
    return removable.length;
  }

  async saveAgentActivity(value, { prune = true } = {}) {
    const incoming = normalizeAgentActivity(value, this.now());
    incoming.expiresAt = agentActivityExpiry(incoming, this.agentActivityRetentionMs);
    const database = await this.open();
    const transaction = database.transaction(AGENT_ACTIVITY_STORE, 'readwrite');
    const store = transaction.objectStore(AGENT_ACTIVITY_STORE);
    const stored = await requestResult(store.get(incoming.activityId));
    const activity = mergeAgentActivityMarks(incoming, stored);
    store.put(activity);
    await transactionComplete(transaction);
    if (prune) {
      await this.pruneAgentActivities();
    }
    return activity;
  }

  // Records that the viewer opened or dismissed a run without rewriting the
  // rest of the record from a possibly stale copy.
  async markAgentActivity(activityId, { lastOpenedAt = 0, dismissedAt = 0 } = {}) {
    const database = await this.open();
    const transaction = database.transaction(AGENT_ACTIVITY_STORE, 'readwrite');
    const store = transaction.objectStore(AGENT_ACTIVITY_STORE);
    const stored = await requestResult(store.get(String(activityId)));
    if (!stored) {
      await transactionComplete(transaction);
      return null;
    }
    const activity = mergeAgentActivityMarks(
      normalizeAgentActivity({ ...stored, lastOpenedAt, dismissedAt }, this.now()),
      stored
    );
    store.put(activity);
    await transactionComplete(transaction);
    return activity;
  }

  async getAgentActivity(activityId) {
    const database = await this.open();
    const transaction = database.transaction(AGENT_ACTIVITY_STORE, 'readonly');
    const activity = await requestResult(
      transaction.objectStore(AGENT_ACTIVITY_STORE).get(String(activityId))
    );
    await transactionComplete(transaction);
    return activity ? normalizeAgentActivity(activity, this.now()) : null;
  }

  async listAgentActivities({ includeExpired = false } = {}) {
    const database = await this.open();
    const transaction = database.transaction(AGENT_ACTIVITY_STORE, 'readonly');
    const activities = await requestResult(
      transaction.objectStore(AGENT_ACTIVITY_STORE).getAll()
    );
    await transactionComplete(transaction);
    return activities
      .map(activity => normalizeAgentActivity(activity, this.now()))
      .filter(activity => includeExpired || activity.status !== AGENT_ACTIVITY_STATUS.EXPIRED)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async listAgentActivityIndex({ includeExpired = false } = {}) {
    const activities = await this.listAgentActivities({ includeExpired });
    return activities.map(buildAgentActivityIndexEntry);
  }

  async setAgentActivityKept(activityId, kept) {
    const activity = await this.getAgentActivity(activityId);
    if (!activity) {
      throw new Error('Agent activity not found');
    }
    const now = this.now();
    // Unkeeping starts a fresh retention period from now.
    const next = {
      ...activity,
      kept: kept === true,
      retainedFrom: kept === true ? activity.retainedFrom : now,
      updatedAt: now
    };
    return this.saveAgentActivity(next, { prune: false });
  }

  async deleteAgentActivity(activityId) {
    const database = await this.open();
    const transaction = database.transaction(AGENT_ACTIVITY_STORE, 'readwrite');
    transaction.objectStore(AGENT_ACTIVITY_STORE).delete(String(activityId));
    await transactionComplete(transaction);
  }

  async cleanupAgentActivities() {
    const activities = await this.listAgentActivities({ includeExpired: true });
    const now = this.now();
    // Expiry is recomputed with the current retention, so shortening the
    // history setting removes older answers right away.
    const expired = activities.filter(activity =>
      isAgentActivityExpired(activity, this.agentActivityRetentionMs, now)
    );
    if (!expired.length) {
      return 0;
    }

    const database = await this.open();
    const transaction = database.transaction(AGENT_ACTIVITY_STORE, 'readwrite');
    for (const activity of expired) {
      transaction.objectStore(AGENT_ACTIVITY_STORE).delete(activity.activityId);
    }
    await transactionComplete(transaction);
    return expired.length;
  }

  async pruneAgentActivities() {
    const activities = await this.listAgentActivities({ includeExpired: true });
    if (activities.length <= this.maxAgentActivities) {
      return 0;
    }

    const removable = activities
      .filter(activity => !activity.kept && isAgentActivityTerminal(activity.status))
      .sort((left, right) => left.updatedAt - right.updatedAt)
      .slice(0, activities.length - this.maxAgentActivities);
    if (!removable.length) {
      return 0;
    }

    const database = await this.open();
    const transaction = database.transaction(AGENT_ACTIVITY_STORE, 'readwrite');
    for (const activity of removable) {
      transaction.objectStore(AGENT_ACTIVITY_STORE).delete(activity.activityId);
    }
    await transactionComplete(transaction);
    return removable.length;
  }

  async clear() {
    const database = await this.open();
    const transaction = database.transaction(
      [SESSION_STORE, INDEX_STORE, TASK_STORE, AGENT_ACTIVITY_STORE],
      'readwrite'
    );
    transaction.objectStore(SESSION_STORE).clear();
    transaction.objectStore(INDEX_STORE).clear();
    transaction.objectStore(TASK_STORE).clear();
    transaction.objectStore(AGENT_ACTIVITY_STORE).clear();
    await transactionComplete(transaction);
  }
}

export const topicSessionDatabase = new TopicSessionDatabase();
