// Background task service: the job queue plus everything around it —
// request validation, IndexedDB persistence, broadcasting task updates to
// open views, the wake-up alarm that keeps the worker alive while tasks run,
// and the per-task provider configuration.
import {
  TASK_STATUS,
  TASK_TYPE,
  createTaskRecord,
  isActiveTaskStatus,
  isTerminalTaskStatus
} from '../shared/task-record.mjs';
import { agentActivityFromTask } from '../shared/agent-activity.mjs';
import { buildTopicKey, forumDisplayName, normalizeSiteUrl } from '../shared/forum-site.mjs';
import { loadConfig, providerSettingsOf } from '../shared/config-state.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { JobQueue } from './job-queue.mjs';

const { MESSAGES } = DiscourseCopilotConstants;

export const TASK_WAKE_ALARM = 'discourse-copilot-task-wakeup';

// Task updates are persisted at most this often unless the change is durable.
const PERSIST_INTERVAL_MS = 1000;

/**
 * Checks an enqueue request; throws with a user-facing message.
 * @returns {{ type: string, siteUrl: string, topicKey: string }}
 */
export function validateEnqueueRequest(request) {
  const type = request?.taskType;
  if (type !== TASK_TYPE.SUMMARY && type !== TASK_TYPE.CHAT && type !== TASK_TYPE.AGENT) {
    throw new Error('Unsupported task type');
  }
  if (type !== TASK_TYPE.AGENT && !request.topicId) {
    throw new Error('A forum topic is required');
  }
  const siteUrl = normalizeSiteUrl(request.siteUrl);
  if (!siteUrl) {
    throw new Error('A valid forum site URL is required');
  }
  const topicKey = type === TASK_TYPE.AGENT
    ? ''
    : buildTopicKey(siteUrl, request.topicId);
  if (type !== TASK_TYPE.AGENT && !topicKey) {
    throw new Error('A valid forum topic is required');
  }
  if ((type === TASK_TYPE.CHAT || type === TASK_TYPE.AGENT)
    && !String(request.question || '').trim()) {
    throw new Error(type === TASK_TYPE.AGENT
      ? 'An Agent question is required'
      : 'A follow-up question is required');
  }
  return { type, siteUrl, topicKey };
}

function createTaskId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class TaskService {
  /**
   * @param {object} options
   * @param {object} options.db topicSessionDatabase
   * @param {object} options.agentActivities AgentActivityStore
   * @param {(message: object) => void} options.broadcast
   * @param {object} [options.alarms] chrome.alarms
   * @param {(storage?: object) => Promise<object>} [options.readConfig] config-state loadConfig
   */
  constructor({
    db,
    agentActivities,
    broadcast,
    alarms = globalThis.chrome?.alarms,
    readConfig = loadConfig,
    concurrency = 2,
    maxQueued = 50
  }) {
    this.db = db;
    this.agentActivities = agentActivities;
    this.broadcast = broadcast;
    this.alarms = alarms;
    this.readConfig = readConfig;
    this.executor = null;
    // Provider settings sent with a request; kept in memory only, never
    // persisted with the task (they include API keys).
    this.runtimePayloads = new Map();
    this.persistedAt = new Map();
    this.persistenceQueues = new Map();
    this.alarmScheduled = false;
    this.queue = new JobQueue({
      concurrency,
      maxQueued,
      execute: (task, context) => this.runTask(task, context),
      onTransition: (task, options) => this.persistAndBroadcast(task, options)
    });
    this.ready = null;
  }

  // Starts restoring persisted tasks; every request waits for `ready`.
  start(executor) {
    this.executor = executor;
    this.ready = this.initialize();
    void this.ready.catch(error => {
      console.error('Background: Unable to initialize task service:', error);
    });
    return this.ready;
  }

  async initialize() {
    await this.db.open();
    this.alarmScheduled = Boolean(await this.alarms.get(TASK_WAKE_ALARM));
    await Promise.all([
      this.db.cleanupStaleChats(),
      this.db.cleanupTasks(),
      this.db.cleanupAgentActivities()
    ]);
    await this.queue.restore(await this.db.listTasks());
    await this.syncAlarm();
  }

  async runTask(task, context) {
    try {
      await this.executor(task, context);
    } finally {
      this.runtimePayloads.delete(task.id);
    }
  }

  async persistAndBroadcast(task, { durable = false } = {}) {
    this.broadcast({ action: MESSAGES.TASK_UPDATED, task });

    const now = Date.now();
    const lastPersisted = this.persistedAt.get(task.id) || 0;
    if (!durable && now - lastPersisted < PERSIST_INTERVAL_MS) {
      return;
    }

    this.persistedAt.set(task.id, now);
    const snapshot = { ...task };
    const previous = this.persistenceQueues.get(task.id) || Promise.resolve();
    const persistence = previous
      .catch(() => {
        // A newer task state should still be persisted after an earlier failure.
      })
      .then(() => this.db.saveTask(snapshot, { prune: durable }));
    this.persistenceQueues.set(task.id, persistence);
    try {
      await persistence;
      if (durable) {
        await this.syncAlarm();
      }
    } finally {
      if (this.persistenceQueues.get(task.id) === persistence) {
        this.persistenceQueues.delete(task.id);
      }
      if (isTerminalTaskStatus(task.status)) {
        this.runtimePayloads.delete(task.id);
        this.persistedAt.delete(task.id);
      }
    }
  }

  // The alarm wakes a suspended worker while queued or running tasks exist.
  async syncAlarm() {
    const hasActiveTasks = this.activeTaskCount() > 0;
    if (hasActiveTasks && !this.alarmScheduled) {
      this.alarms.create(TASK_WAKE_ALARM, { periodInMinutes: 0.5 });
      this.alarmScheduled = true;
    } else if (!hasActiveTasks && this.alarmScheduled) {
      await this.alarms.clear(TASK_WAKE_ALARM);
      this.alarmScheduled = false;
    }
  }

  handleAlarm(alarm) {
    if (alarm?.name !== TASK_WAKE_ALARM) {
      return;
    }
    // Loading this service worker initializes and restores unfinished tasks.
    void this.ready.then(() => this.syncAlarm());
  }

  list() {
    return this.queue.list();
  }

  activeTaskCount() {
    return this.queue.list().filter(task => isActiveTaskStatus(task.status)).length;
  }

  // Provider, settings, prompt and language for a task: what the request
  // carried, or the saved configuration after a worker restart.
  async getTaskConfiguration(task) {
    const runtime = this.runtimePayloads.get(task.id);
    const forumName = forumDisplayName(task.siteUrl, task.forumName || runtime?.forumName);
    if (runtime?.settings) {
      return {
        ...runtime,
        responseLanguage: runtime.responseLanguage
          ?? (await this.readConfig()).responseLanguage,
        forumName
      };
    }

    const config = await this.readConfig();
    const provider = task.provider || config.provider;
    const settings = providerSettingsOf(config, provider);
    if (task.model) {
      settings.model = task.model;
    }
    return {
      provider,
      settings,
      systemPrompt: config.systemPrompt,
      responseLanguage: config.responseLanguage,
      forumName
    };
  }

  async enqueue(request) {
    await this.ready;
    const { type, siteUrl, topicKey } = validateEnqueueRequest(request);

    // One summary per topic at a time; a repeated request joins it.
    if (type === TASK_TYPE.SUMMARY) {
      const existing = this.queue.findActive(task =>
        task.type === TASK_TYPE.SUMMARY && task.topicKey === topicKey
      );
      if (existing) {
        return existing;
      }
    }
    // A resent Agent request (same client request ID) is the same task.
    if (type === TASK_TYPE.AGENT && request.clientRequestId) {
      const existing = this.queue.list().find(task =>
        task.type === TASK_TYPE.AGENT
        && task.clientRequestId === String(request.clientRequestId)
      );
      if (existing) {
        return existing;
      }
    }

    const id = createTaskId();
    const agentRunId = type === TASK_TYPE.AGENT
      ? (request.agentRunId || id)
      : '';
    const record = createTaskRecord({
      id,
      type,
      topicId: request.topicId ? String(request.topicId) : '',
      siteUrl,
      agentRunId,
      clientRequestId: request.clientRequestId,
      retryOf: request.retryOf,
      forumName: request.forumName,
      title: request.title,
      url: request.url,
      question: request.question,
      maxPostChars: request.maxPostChars,
      provider: request.provider,
      model: request.settings?.model
    });

    this.runtimePayloads.set(id, {
      provider: request.provider,
      settings: request.settings,
      systemPrompt: request.systemPrompt,
      responseLanguage: request.responseLanguage,
      forumName: request.forumName
    });
    try {
      if (type === TASK_TYPE.AGENT) {
        await this.agentActivities.create(agentActivityFromTask(record));
      }
      return await this.queue.enqueue(record);
    } catch (error) {
      this.runtimePayloads.delete(id);
      if (type === TASK_TYPE.AGENT) {
        await this.agentActivities.remove(agentRunId).catch(() => {});
      }
      throw error;
    }
  }

  async cancel(taskId) {
    await this.ready;
    const task = await this.queue.cancel(taskId);
    if (task?.type === TASK_TYPE.AGENT && task.status === TASK_STATUS.CANCELLED) {
      await this.agentActivities.markCancelled(task);
    }
    return task;
  }

  async resume(taskId) {
    await this.ready;
    return this.queue.resume(taskId);
  }
}
