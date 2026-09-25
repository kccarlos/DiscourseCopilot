// The side panel's view of the background task queue: the latest copy of
// every task (kept current by taskUpdated broadcasts), queries over them,
// the requests the panel sends to the queue, and the heartbeat that keeps
// the service worker awake while tasks run.
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { TASK_TYPE, isActiveTaskStatus, isTerminalTaskStatus } from '../shared/task-record.mjs';
import { FORUM_ACCESS_ERROR_CODE } from '../shared/forum-access.mjs';
import { isMissingRuntimeResponse } from './runtime-state.mjs';

const { MESSAGES } = DiscourseCopilotConstants;
const HEARTBEAT_INTERVAL_MS = 15000;

const agentRunIdOf = task => task.agentRunId || task.id;

export class TaskRegistry {
  constructor({ sendMessage = message => chrome.runtime.sendMessage(message), onForumAccessMissing = () => {} } = {}) {
    this.sendMessage = sendMessage;
    this.onForumAccessMissing = onForumAccessMissing;
    this.tasks = new Map();
    this.heartbeatTimer = null;
  }

  // ---------- State ----------

  set(task) {
    this.tasks.set(task.id, task);
  }

  replaceAll(tasks) {
    this.tasks = new Map((tasks || []).map(task => [task.id, task]));
  }

  values() {
    return [...this.tasks.values()];
  }

  // Unfinished tasks for a topic, oldest first.
  activeForTopic(topicKey) {
    if (!topicKey) {
      return [];
    }
    return this.values()
      .filter(task => task.topicKey === topicKey && !isTerminalTaskStatus(task.status))
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  activeForTopicOfType(type, topicKey) {
    return this.activeForTopic(topicKey).find(task => task.type === type) || null;
  }

  // The task behind an Agent run (activity or task-shaped value).
  findAgentTask(activity) {
    const runId = activity?.agentRunId || activity?.activityId;
    return this.values().find(task => task.type === TASK_TYPE.AGENT && agentRunIdOf(task) === runId) || null;
  }

  findUnfinishedAgentTask(agentRunId) {
    return (
      this.values().find(task => task.type === TASK_TYPE.AGENT && agentRunIdOf(task) === agentRunId && !isTerminalTaskStatus(task.status))
      || null
    );
  }

  // Whether the Agent request with this client ID is still unfinished.
  isAgentRequestPending(clientRequestId) {
    return this.values().some(
      task => task.type === TASK_TYPE.AGENT && task.clientRequestId === clientRequestId && !isTerminalTaskStatus(task.status)
    );
  }

  hasActiveTasks() {
    return this.values().some(task => isActiveTaskStatus(task.status));
  }

  // ---------- Heartbeat ----------

  // While tasks are queued or running, ping the worker so Chrome keeps it
  // (or wakes it) instead of suspending mid-task.
  updateHeartbeat() {
    if (!this.hasActiveTasks()) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      return;
    }
    if (this.heartbeatTimer !== null) {
      return;
    }
    const heartbeat = () => {
      Promise.resolve(this.sendMessage({ action: MESSAGES.TASK_HEARTBEAT })).catch(() => {
        // The next heartbeat will wake a suspended service worker.
      });
    };
    heartbeat();
    this.heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  }

  // ---------- Requests ----------

  // The raw listTasks response (undefined when no worker answered).
  requestList() {
    return this.sendMessage({ action: MESSAGES.LIST_TASKS });
  }

  // Queues a task. Resolves to the task, or null when no background worker
  // answered; throws with the worker's error (or `fallbackError`).
  async enqueue(payload, fallbackError) {
    const response = await this.sendMessage({ action: MESSAGES.ENQUEUE_TASK, ...payload });
    if (isMissingRuntimeResponse(response)) {
      return null;
    }
    if (!response?.success || !response.task) {
      if (response?.code === FORUM_ACCESS_ERROR_CODE) {
        this.onForumAccessMissing();
      }
      throw Object.assign(new Error(response?.error || fallbackError), response?.code ? { code: response.code } : {});
    }
    this.set(response.task);
    this.updateHeartbeat();
    return response.task;
  }

  cancel(taskId) {
    return this.requestTaskChange(MESSAGES.CANCEL_TASK, taskId, 'Unable to cancel task');
  }

  resume(taskId) {
    return this.requestTaskChange(MESSAGES.RESUME_TASK, taskId, 'Unable to resume Agent task');
  }

  async requestTaskChange(action, taskId, fallbackError) {
    const response = await this.sendMessage({ action, taskId });
    if (!response?.success) {
      throw new Error(response?.error || fallbackError);
    }
    return response.task || null;
  }
}
