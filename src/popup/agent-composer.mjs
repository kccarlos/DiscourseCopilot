// "Ask the forum": the question composer (#agentComposer). It takes the
// inline answer panel's place until the question is sent or the composer
// is closed; sending queues an Agent task for the current forum.
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { TASK_TYPE } from '../shared/task-record.mjs';
import { normalizeAgentQuestion } from '../services/agent-context.mjs';

const $ = id => document.getElementById(id);

export class AgentComposer {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (pageContext)
   * @param {object} deps.tasks TaskRegistry
   * @param {object} deps.forums ForumDirectory
   * @param {object} deps.config ConfigStore
   * @param {object} deps.operations OperationTracker
   * @param {object} deps.status StatusLine
   * @param {object} deps.hooks updateControls, beginOperation, promptSetup,
   *   dismissSetupSuccess, handleBackgroundError, markBackgroundUnavailable
   * @param {() => void} deps.onToggle the composer opened or closed (re-render the panel)
   * @param {(task: object) => void} deps.onQueued the question was queued as `task`
   */
  constructor({ state, tasks, forums, config, operations, status, hooks, onToggle, onQueued }) {
    this.state = state;
    this.tasks = tasks;
    this.forums = forums;
    this.config = config;
    this.operations = operations;
    this.status = status;
    this.hooks = hooks;
    this.onToggle = onToggle;
    this.onQueued = onQueued;
    this.open = false;
  }

  mount() {
    $('agentLaunchBtn').addEventListener('click', () => {
      this.show();
    });
    $('agentCloseBtn').addEventListener('click', () => {
      this.hide();
    });
    $('agentForm').addEventListener('submit', event => {
      event.preventDefault();
      void this.send();
    });
    $('agentInput').addEventListener('input', () => {
      this.hooks.updateControls();
    });
    for (const suggestion of document.querySelectorAll('[data-agent-question]')) {
      suggestion.addEventListener('click', () => {
        const input = $('agentInput');
        input.value = suggestion.dataset.agentQuestion || '';
        input.focus();
        this.hooks.updateControls();
      });
    }
  }

  searchLabel(forumName = this.forums.currentLabel()) {
    return forumName ? `Search ${forumName}` : 'Search this forum';
  }

  // Composer copy names the forum being searched; the topic suggestion only
  // makes sense while a topic is open.
  renderCopy(forumName, isForumTopic) {
    $('agentComposerHeading').textContent = this.searchLabel(forumName);
    $('agentInput').placeholder = forumName ? `Ask a question about ${forumName}…` : 'Ask a question about this forum…';
    $('agentTopicSuggestion').classList.toggle('hidden', !isForumTopic);
  }

  show({ question = '' } = {}) {
    if (!this.state.pageContext?.isDiscourse) {
      this.status.show('Open a Discourse forum page to ask the forum', 'warning');
      return;
    }
    this.open = true;
    this.onToggle();
    $('agentComposer').classList.remove('hidden');
    const input = $('agentInput');
    if (question) {
      input.value = question;
    }
    input.focus();
    this.hooks.updateControls();
  }

  hide() {
    this.open = false;
    $('agentComposer').classList.add('hidden');
    this.onToggle();
    this.hooks.updateControls();
  }

  async send() {
    const question = normalizeAgentQuestion($('agentInput').value);
    if (!question) {
      return;
    }
    if (!this.config.isReady()) {
      this.hooks.promptSetup();
      return;
    }

    this.hooks.dismissSetupSuccess();
    const operation = this.hooks.beginOperation('agent');
    if (!operation) {
      return;
    }

    try {
      this.status.show('Submitting Agent research task…', 'loading');
      const task = await this.tasks.enqueue(
        {
          taskType: TASK_TYPE.AGENT,
          agentRunId: operation.id,
          clientRequestId: operation.id,
          title: question,
          question,
          siteUrl: operation.siteUrl,
          forumName: operation.forumName,
          provider: operation.provider,
          settings: operation.settings,
          systemPrompt: operation.systemPrompt,
          responseLanguage: operation.responseLanguage
        },
        'Unable to queue Agent research'
      );
      if (!task) {
        this.hooks.markBackgroundUnavailable();
        return;
      }
      $('agentInput').value = '';
      this.status.hide();
      this.onQueued(task);
    } catch (error) {
      if (this.hooks.handleBackgroundError(error)) {
        return;
      }
      DiscourseCopilotLogger.error('Popup: Error queueing Agent task:', error);
      this.status.show(`Error: ${error.message}`, 'error');
    } finally {
      this.operations.finish(operation);
    }
  }
}
