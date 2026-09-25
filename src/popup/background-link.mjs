// Whether the side panel can reach the background worker: the initial task
// list, errors that mean the worker (or its database) must be restarted, and
// the "Restart DiscourseCopilot" banner (#backgroundRecovery).
import { DiscourseCopilotLogger } from '../shared/logger.js';
import {
  isDatabaseCompatibilityError,
  isMissingRuntimeResponse,
  isRuntimeDisconnectedError
} from './runtime-state.mjs';

const $ = id => document.getElementById(id);

export class BackgroundLink {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state; this writes backgroundAvailable
   * @param {object} deps.tasks TaskRegistry
   * @param {object} deps.status StatusLine
   * @param {() => void} deps.onUnavailable re-derive the controls
   */
  constructor({ state, tasks, status, onUnavailable }) {
    this.state = state;
    this.tasks = tasks;
    this.status = status;
    this.onUnavailable = onUnavailable;
  }

  mount() {
    $('restartExtensionBtn').addEventListener('click', () => {
      chrome.runtime.reload();
    });
  }

  async loadTasks() {
    let response;
    try {
      response = await this.tasks.requestList();
      if (isMissingRuntimeResponse(response)) {
        this.markUnavailable();
        return;
      }
      if (!response?.success) {
        throw new Error(response?.error || 'Unable to load tasks');
      }
      this.state.backgroundAvailable = true;
      this.tasks.replaceAll(response.tasks);
      this.tasks.updateHeartbeat();
    } catch (error) {
      if (isMissingRuntimeResponse(response) || isRuntimeDisconnectedError(error)) {
        this.markUnavailable(error);
        return;
      }
      if (this.handleError(error)) {
        return;
      }
      DiscourseCopilotLogger.warn('Popup: Background tasks are unavailable:', error);
    }
  }

  // True when `error` means the worker must be restarted (handled here).
  handleError(error) {
    if (isDatabaseCompatibilityError(error)) {
      this.markUnavailable(error);
      this.status.show('Restart DiscourseCopilot to finish the update.', 'warning');
      return true;
    }
    if (isRuntimeDisconnectedError(error)) {
      this.markUnavailable(error);
      return true;
    }
    return false;
  }

  renderRecovery() {
    $('backgroundRecovery').classList.toggle('hidden', this.state.backgroundAvailable);
  }

  markUnavailable(error) {
    this.state.backgroundAvailable = false;
    if (error) {
      DiscourseCopilotLogger.warn('Popup: Background service needs a restart:', error);
    }
    this.renderRecovery();
    this.status.hide();
    this.onUnavailable();
  }
}
