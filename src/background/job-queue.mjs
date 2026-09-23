import {
  TASK_STATUS,
  isTerminalTaskStatus,
  normalizeTaskRecord
} from '../shared/task-record.mjs';

function abortError() {
  const error = new Error('Task cancelled');
  error.name = 'AbortError';
  return error;
}

export class JobQueue {
  constructor({
    concurrency = 2,
    maxQueued = 50,
    execute,
    onTransition = async () => {},
    now = () => Date.now()
  }) {
    if (typeof execute !== 'function') {
      throw new TypeError('A task executor is required');
    }
    this.concurrency = Math.max(1, Math.floor(Number(concurrency) || 1));
    this.maxQueued = Math.max(this.concurrency, Math.floor(Number(maxQueued) || 50));
    this.execute = execute;
    this.onTransition = onTransition;
    this.now = now;
    this.tasks = new Map();
    this.pending = [];
    this.running = new Map();
    this.idleWaiters = [];
  }

  async restore(records) {
    for (const record of records || []) {
      let task;
      try {
        task = normalizeTaskRecord(record, this.now());
      } catch {
        // Records without a valid forum identity cannot be resumed safely.
        continue;
      }
      if (isTerminalTaskStatus(task.status)) {
        this.tasks.set(task.id, task);
        continue;
      }
      if (task.status === TASK_STATUS.WAITING_USER_ACTION) {
        task.phase = task.phase || 'waiting_user_action';
        task.statusText = task.statusText || 'Waiting for your action…';
        task.updatedAt = this.now();
        this.tasks.set(task.id, task);
        await this.onTransition({ ...task }, { durable: true });
        continue;
      }
      task.status = TASK_STATUS.QUEUED;
      task.phase = 'queued';
      task.statusText = record.status === TASK_STATUS.RUNNING
        ? 'Resuming after extension restart…'
        : 'Waiting for an available worker…';
      task.updatedAt = this.now();
      this.tasks.set(task.id, task);
      this.pending.push(task.id);
      await this.onTransition({ ...task }, { durable: true });
    }
    this.pump();
  }

  async enqueue(record) {
    if (this.pending.length + this.running.size >= this.maxQueued) {
      throw new Error('The task queue is full. Cancel or wait for an existing task.');
    }
    const task = normalizeTaskRecord(record, this.now());
    task.status = TASK_STATUS.QUEUED;
    task.phase = 'queued';
    task.statusText = 'Waiting for an available worker…';
    task.updatedAt = this.now();
    this.tasks.set(task.id, task);
    this.pending.push(task.id);
    try {
      await this.onTransition({ ...task }, { durable: true });
    } catch (error) {
      this.pending = this.pending.filter(id => id !== task.id);
      this.tasks.delete(task.id);
      throw error;
    }
    this.pump();
    return { ...task };
  }

  get(taskId) {
    const task = this.tasks.get(String(taskId));
    return task ? { ...task } : null;
  }

  list() {
    return [...this.tasks.values()]
      .map(task => ({ ...task }))
      .sort((left, right) => right.createdAt - left.createdAt);
  }

  findActive(predicate) {
    return this.list().find(task =>
      !isTerminalTaskStatus(task.status)
      && predicate(task)
    ) || null;
  }

  async cancel(taskId) {
    const id = String(taskId);
    const task = this.tasks.get(id);
    if (!task || isTerminalTaskStatus(task.status)) {
      return task ? { ...task } : null;
    }

    const running = this.running.get(id);
    if (running) {
      running.controller.abort(abortError());
      task.phase = 'cancelling';
      task.statusText = 'Cancelling…';
      task.updatedAt = this.now();
      await this.onTransition({ ...task }, { durable: true });
      return { ...task };
    }

    this.pending = this.pending.filter(pendingId => pendingId !== id);
    try {
      await this.finishTask(task, TASK_STATUS.CANCELLED, {
        phase: 'cancelled',
        statusText: 'Cancelled',
        error: ''
      });
    } finally {
      this.pump();
    }
    return { ...task };
  }

  async resume(taskId) {
    const id = String(taskId);
    const task = this.tasks.get(id);
    if (!task || task.status !== TASK_STATUS.WAITING_USER_ACTION) {
      return task ? { ...task } : null;
    }
    task.status = TASK_STATUS.QUEUED;
    task.phase = 'queued';
    task.statusText = 'Waiting for an available worker…';
    task.error = '';
    task.updatedAt = this.now();
    this.pending.push(id);
    await this.onTransition({ ...task }, { durable: true });
    this.pump();
    return { ...task };
  }

  pump() {
    while (this.running.size < this.concurrency) {
      const pendingIndex = this.pending.findIndex(id => {
        const task = this.tasks.get(id);
        if (!task) return false;
        return ![...this.running.values()].some(
          running => running.task.resourceKey === task.resourceKey
        );
      });
      if (pendingIndex < 0) {
        break;
      }

      const [taskId] = this.pending.splice(pendingIndex, 1);
      const task = this.tasks.get(taskId);
      if (task) {
        void this.startTask(task);
      }
    }
    this.resolveIdleIfNeeded();
  }

  async startTask(task) {
    const controller = new AbortController();
    this.running.set(task.id, { task, controller });
    task.status = TASK_STATUS.RUNNING;
    task.phase = 'starting';
    task.statusText = 'Starting…';
    task.startedAt = task.startedAt || this.now();
    task.updatedAt = this.now();

    try {
      await this.onTransition({ ...task }, { durable: true });
      const report = async (patch, options = {}) => {
        if (controller.signal.aborted || isTerminalTaskStatus(task.status)) {
          throw abortError();
        }
        Object.assign(task, patch, { updatedAt: this.now() });
        await this.onTransition({ ...task }, options);
      };

      const result = await this.execute({ ...task }, {
        signal: controller.signal,
        report
      });
      if (controller.signal.aborted) {
        throw abortError();
      }
      if (result?.status === TASK_STATUS.WAITING_USER_ACTION) {
        await this.finishTask(task, TASK_STATUS.WAITING_USER_ACTION, {
          phase: result.phase || 'waiting_user_action',
          statusText: result.statusText || 'Waiting for your action…',
          error: result.error || ''
        });
        return;
      }
      await this.finishTask(task, TASK_STATUS.COMPLETED, {
        phase: 'completed',
        statusText: 'Completed',
        error: ''
      });
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      const waitingForUser = !cancelled
        && error?.taskStatus === TASK_STATUS.WAITING_USER_ACTION;
      const status = cancelled
        ? TASK_STATUS.CANCELLED
        : waitingForUser
          ? TASK_STATUS.WAITING_USER_ACTION
          : TASK_STATUS.FAILED;
      const patch = {
        phase: cancelled
          ? 'cancelled'
          : waitingForUser
            ? 'waiting_user_action'
            : 'failed',
        statusText: cancelled
          ? 'Cancelled'
          : waitingForUser
            ? (error.statusText || 'Waiting for your action…')
            : 'Failed',
        error: cancelled || waitingForUser
          ? (waitingForUser ? String(error?.message || error) : '')
          : String(error?.message || error)
      };
      try {
        await this.finishTask(task, status, patch);
      } catch (transitionError) {
        Object.assign(task, patch, {
          status,
          updatedAt: this.now(),
          completedAt: this.now(),
          error: patch.error || String(transitionError?.message || transitionError)
        });
      }
    } finally {
      this.running.delete(task.id);
      this.pump();
    }
  }

  async finishTask(task, status, patch) {
    Object.assign(task, patch, {
      status,
      updatedAt: this.now(),
      completedAt: isTerminalTaskStatus(status)
        ? this.now()
        : (task.completedAt || 0)
    });
    await this.onTransition({ ...task }, { durable: true });
  }

  waitForIdle() {
    if (!this.pending.length && !this.running.size) {
      return Promise.resolve();
    }
    return new Promise(resolve => this.idleWaiters.push(resolve));
  }

  resolveIdleIfNeeded() {
    if (this.pending.length || this.running.size) {
      return;
    }
    for (const resolve of this.idleWaiters.splice(0)) {
      resolve();
    }
  }
}
