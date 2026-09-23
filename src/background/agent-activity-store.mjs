// Agent activity records in IndexedDB, written in order per activity and
// broadcast to open extension views after each save.
import { AGENT_ACTIVITY_STATUS } from '../shared/agent-activity.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';

const { MESSAGES } = DiscourseCopilotConstants;

export class AgentActivityStore {
  constructor({ db, broadcast }) {
    this.db = db;
    this.broadcast = broadcast;
    this.persistenceQueues = new Map();
  }

  get(activityId) {
    return this.db.getAgentActivity(activityId);
  }

  // Saves a new record without broadcasting (the task broadcast follows).
  create(activity) {
    return this.db.saveAgentActivity(activity);
  }

  remove(activityId) {
    return this.db.deleteAgentActivity(activityId);
  }

  announce(activity) {
    this.broadcast({ action: MESSAGES.ACTIVITY_UPDATED, activity });
  }

  // Applies `patch`, saves after any earlier save of the same activity, then
  // broadcasts the stored record.
  async update(activity, patch = {}, { prune = true } = {}) {
    const next = {
      ...activity,
      ...patch,
      updatedAt: Date.now()
    };
    const previous = this.persistenceQueues.get(next.activityId) || Promise.resolve();
    const persistence = previous
      .catch(() => {
        // A newer activity snapshot should still be persisted after an earlier failure.
      })
      .then(() => this.db.saveAgentActivity(next, { prune }));
    this.persistenceQueues.set(next.activityId, persistence);
    try {
      const saved = await persistence;
      this.announce(saved);
      return saved;
    } finally {
      if (this.persistenceQueues.get(next.activityId) === persistence) {
        this.persistenceQueues.delete(next.activityId);
      }
    }
  }

  // Marks the activity of a cancelled Agent task as cancelled.
  async markCancelled(task) {
    const activity = await this.get(task.agentRunId || task.id);
    if (!activity || activity.status === AGENT_ACTIVITY_STATUS.CANCELLED) {
      return;
    }
    const now = Date.now();
    await this.update(activity, {
      status: AGENT_ACTIVITY_STATUS.CANCELLED,
      phase: 'cancelled',
      statusText: 'Cancelled',
      error: null,
      completedAt: now,
      retainedFrom: now
    }, { prune: true });
  }
}
