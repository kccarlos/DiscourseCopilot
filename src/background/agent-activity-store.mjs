// Agent activity records in IndexedDB, written in order per activity and
// broadcast to open extension views after each save.
import { AGENT_ACTIVITY_STATUS, agentTurnsOf, appendAgentTurn, settleRunningAgentSteps } from '../shared/agent-activity.mjs';
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

  // The transcript (what the model has seen) can be large and only the
  // worker uses it, so broadcasts leave it out; the saved record has it.
  announce(activity) {
    const { transcript: _transcript, ...visible } = activity;
    this.broadcast({ action: MESSAGES.ACTIVITY_UPDATED, activity: visible });
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

  // Starts a follow-up turn on a finished run for `task` (same agentRunId).
  // Throws when the run can't be continued: gone, on another forum, still
  // unfinished, or never answered.
  async startFollowUp(task) {
    const activity = await this.get(task.agentRunId);
    if (!activity || activity.siteUrl !== task.siteUrl) {
      throw new Error('This answer is no longer available to continue. Ask a new question instead.');
    }
    const finished =
      activity.status === AGENT_ACTIVITY_STATUS.COMPLETED
      || activity.status === AGENT_ACTIVITY_STATUS.FAILED
      || activity.status === AGENT_ACTIVITY_STATUS.CANCELLED;
    // A follow-up that failed or was stopped can be asked again; a first
    // question that never got an answer can't be continued.
    if (!finished || !agentTurnsOf(activity).some(turn => turn.answer)) {
      throw new Error('This run has no answer to follow up on yet.');
    }
    return this.update(activity, appendAgentTurn(activity, { taskId: task.id, question: task.question }), { prune: false });
  }

  // Marks the activity of a cancelled Agent task as cancelled.
  async markCancelled(task) {
    const activity = await this.get(task.agentRunId || task.id);
    if (!activity || activity.status === AGENT_ACTIVITY_STATUS.CANCELLED) {
      return;
    }
    const now = Date.now();
    await this.update(
      activity,
      {
        status: AGENT_ACTIVITY_STATUS.CANCELLED,
        phase: 'cancelled',
        statusText: 'Cancelled',
        error: null,
        steps: settleRunningAgentSteps(activity.steps, { status: 'stopped', now }),
        completedAt: now,
        retainedFrom: now
      },
      { prune: true }
    );
  }
}
