// The side panel history database (IndexedDB "discourse-copilot-history"):
// store names, the version upgrade (creating stores and the version 4
// topicKey migration) and promise wrappers for requests and transactions.
// TopicSessionDatabase (topic-session-db.mjs) reads and writes the records.
import { buildTopicIndexEntry, normalizeTopicSession } from './topic-session.mjs';

export const DATABASE_NAME = 'discourse-copilot-history';
export const DATABASE_VERSION = 4;
export const SESSION_STORE = 'topicSessions';
export const INDEX_STORE = 'topicIndex';
export const TASK_STORE = 'tasks';
export const AGENT_ACTIVITY_STORE = 'agentActivities';

export function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

export function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
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

// onupgradeneeded: creates missing stores and migrates older versions.
export function upgradeHistoryDatabase(request, event) {
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
}
