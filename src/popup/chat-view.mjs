// Follow-up chat about the current topic: the conversation, editing an
// earlier question, sending a question, and the forum context limit slider.
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { TASK_STATUS, TASK_TYPE, isTerminalTaskStatus } from '../shared/task-record.mjs';
import {
  FORUM_CONTEXT_LIMIT,
  formatForumContextLimit,
  normalizeForumContextLimit
} from '../shared/chat-context-limit.mjs';
import { normalizeChatQuestion, prepareChatEdit } from './conversation-state.mjs';
import { renderMarkdown } from './markdown.mjs';

export function getChatCountLabel(history = []) {
  const questionCount = history.filter(message => message.role === 'user').length;
  if (!questionCount) return 'Start a conversation';
  return `${questionCount} ${questionCount === 1 ? 'question' : 'questions'} asked`;
}

const $ = id => document.getElementById(id);
const MAX_INPUT_HEIGHT_PX = 144;
const NEAR_BOTTOM_PX = 80;
// Above this many characters the slider shows a cost warning.
const LARGE_CONTEXT_CHARS = 100000;

const EDIT_ICON = `
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="m4 20 4.4-1 10.8-10.8a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z"/>
            <path d="m14.8 6.6 3 3"/>
          </svg>
          <span>Edit</span>
        `;

export class ChatView {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (pageContext, session, backgroundAvailable)
   * @param {object} deps.tasks TaskRegistry
   * @param {object} deps.config ConfigStore
   * @param {object} deps.status StatusLine
   * @param {object} deps.markdown MarkdownScheduler
   * @param {object} deps.operations OperationTracker
   * @param {Map<string, string>} deps.streams streamed text per topic task ID
   * @param {object} deps.hooks updateControls, beginOperation,
   *   markBackgroundUnavailable, handleBackgroundError, reloadCurrentSession,
   *   renderTaskState, cancelActiveOperation, persistSession
   */
  constructor({ state, tasks, config, status, markdown, operations, streams, hooks }) {
    this.state = state;
    this.tasks = tasks;
    this.config = config;
    this.status = status;
    this.markdown = markdown;
    this.operations = operations;
    this.streams = streams;
    this.hooks = hooks;
    // The slider's value; saved on change, reset from the saved config.
    this.forumContextLimit = FORUM_CONTEXT_LIMIT.default;
    this.forumContextLimitSaveRevision = 0;
    // An in-flight save of an edited conversation.
    this.editPersistence = null;
    this.editNeedsSave = false;
  }

  get input() {
    return $('chatInput');
  }

  mount() {
    $('clearChatBtn').addEventListener('click', () => {
      this.clear();
    });
    $('chatForm').addEventListener('submit', event => {
      event.preventDefault();
      this.send();
    });
    this.input.addEventListener('input', event => {
      this.resizeInput(event.currentTarget);
      this.hooks.updateControls();
    });
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        $('chatForm').requestSubmit();
      }
    });
    $('forumContextLimit').addEventListener('input', event => {
      this.forumContextLimit = normalizeForumContextLimit(event.currentTarget.value);
      this.renderContextControl();
    });
    $('forumContextLimit').addEventListener('change', () => {
      void this.saveContextLimit();
    });
    for (const suggestion of document.querySelectorAll('[data-question]')) {
      suggestion.addEventListener('click', () => {
        const input = this.input;
        input.value = suggestion.dataset.question || '';
        this.resizeInput(input);
        this.hooks.updateControls();
        input.focus();
      });
    }
  }

  get hasQuestion() {
    return Boolean(normalizeChatQuestion(this.input.value));
  }

  get isSavingEdit() {
    return Boolean(this.editPersistence);
  }

  clearInput() {
    this.input.value = '';
    this.resizeInput();
  }

  resizeInput(input = this.input) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT_PX)}px`;
  }

  isNearBottom() {
    const messages = $('chatMessages');
    return messages.scrollHeight - messages.scrollTop - messages.clientHeight < NEAR_BOTTOM_PX;
  }

  scrollToBottom() {
    const messages = $('chatMessages');
    messages.scrollTop = messages.scrollHeight;
  }

  // ---------- Conversation ----------

  renderHistory(history) {
    const chatContainer = $('chatContainer');
    const messages = $('chatMessages');
    messages.replaceChildren();

    if (!this.state.session?.summary) {
      chatContainer.classList.add('hidden');
      $('chatCount').textContent = 'Start a conversation';
      this.hooks.updateControls();
      return;
    }

    chatContainer.classList.remove('hidden');
    $('chatCount').textContent = getChatCountLabel(history);
    $('chatSuggestions').classList.toggle('hidden', Boolean((history || []).length));
    for (const [index, message] of (history || []).entries()) {
      const bubble = this.appendBubble(
        message.role,
        message.content,
        [],
        message.role === 'user'
          ? { onEdit: () => this.editMessage(index) }
          : {}
      );
      if (message.taskId) {
        bubble.dataset.taskId = message.taskId;
      }
      if (message.role === 'assistant') {
        renderMarkdown(bubble, message.content);
      }
    }
    this.hooks.updateControls();
  }

  appendBubble(role, content, extraClasses = [], { onEdit = null } = {}) {
    const bubble = document.createElement('div');
    bubble.classList.add('chat-message', role, ...extraClasses);
    if (role === 'assistant') {
      renderMarkdown(bubble, content);
    } else {
      const messageContent = document.createElement('div');
      messageContent.className = 'chat-message-content';
      messageContent.textContent = content;
      bubble.appendChild(messageContent);

      if (typeof onEdit === 'function') {
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'chat-edit-btn';
        editButton.setAttribute('aria-label', 'Edit this message');
        editButton.title = 'Edit this message and remove later replies';
        editButton.innerHTML = EDIT_ICON;
        editButton.addEventListener('click', onEdit);
        bubble.appendChild(editButton);
      }
    }
    $('chatMessages').appendChild(bubble);
    this.scrollToBottom();
    return bubble;
  }

  // The bubble for a task's message, created on first use.
  bubbleFor(role, taskId, createContent, extraClasses = []) {
    let bubble = document.querySelector(
      `.chat-message.${role}[data-task-id="${CSS.escape(taskId)}"]`
    );
    if (!bubble) {
      bubble = this.appendBubble(role, createContent, extraClasses);
      bubble.dataset.taskId = taskId;
    }
    return bubble;
  }

  renderStream(taskId, content) {
    const bubble = this.bubbleFor('assistant', taskId, '', ['pending']);
    bubble.classList.remove('pending');
    this.markdown.schedule(bubble, content, true);
  }

  async editMessage(messageIndex) {
    const session = this.state.session;
    if (
      !session
      || this.editPersistence
      || this.operations.busy
      || this.tasks.activeForTopic(this.state.pageContext?.topicKey).length
    ) {
      return;
    }

    const edit = prepareChatEdit(session.history, messageIndex);
    if (!edit) {
      return;
    }

    for (const taskId of edit.removedTaskIds) {
      this.streams.delete(taskId);
    }
    const now = Date.now();
    session.history = edit.history;
    session.chatUpdatedAt = edit.history.length ? now : 0;
    session.updatedAt = now;
    this.editNeedsSave = true;
    this.renderHistory(edit.history);

    const input = this.input;
    input.value = edit.prompt;
    this.resizeInput(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const saved = await this.savePendingEdit();
    this.status.show(
      saved
        ? 'Message ready to edit. Later replies were removed.'
        : 'Message restored, but the conversation change could not be saved.',
      saved ? 'ready' : 'warning'
    );
  }

  // Resolves to whether the edited conversation is saved (true when there
  // is nothing to save).
  async savePendingEdit() {
    if (this.editPersistence) {
      return this.editPersistence;
    }
    if (!this.editNeedsSave) {
      return true;
    }

    const persistence = this.hooks.persistSession();
    this.editPersistence = persistence;
    this.hooks.updateControls();
    try {
      const saved = await persistence;
      if (saved) {
        this.editNeedsSave = false;
      }
      return saved;
    } finally {
      if (this.editPersistence === persistence) {
        this.editPersistence = null;
      }
      this.hooks.updateControls();
    }
  }

  async send() {
    if (!await this.savePendingEdit()) {
      this.status.show(
        'The edited conversation could not be saved. Try sending again.',
        'warning'
      );
      return;
    }
    const question = normalizeChatQuestion(this.input.value);
    if (!question || !this.state.session?.summary) {
      return;
    }

    const operation = this.hooks.beginOperation('chat');
    if (!operation) {
      return;
    }
    const isStillOnPage = () => operation.pageKey === this.state.pageContext?.pageKey;

    this.clearInput();

    try {
      this.status.show('Submitting follow-up task…', 'loading');
      const session = this.state.session;
      const task = await this.tasks.enqueue({
        taskType: TASK_TYPE.CHAT,
        topicId: operation.postId,
        siteUrl: operation.siteUrl,
        topicKey: operation.topicKey,
        title: session.title,
        url: session.url,
        question,
        maxPostChars: operation.forumContextLimit,
        forumName: operation.forumName,
        provider: operation.provider,
        settings: operation.settings,
        systemPrompt: operation.systemPrompt,
        responseLanguage: operation.responseLanguage
      }, 'Unable to queue follow-up');
      if (!task) {
        this.hooks.markBackgroundUnavailable();
        return;
      }

      if (isStillOnPage()) {
        if (!isTerminalTaskStatus(task.status)) {
          this.bubbleFor('user', task.id, question);
          this.bubbleFor(
            'assistant',
            task.id,
            task.status === TASK_STATUS.QUEUED
              ? 'Queued. You can safely browse elsewhere.'
              : 'Thinking…',
            ['pending']
          );
        } else {
          await this.hooks.reloadCurrentSession();
        }
        this.hooks.renderTaskState(task);
      }
    } catch (error) {
      if (this.hooks.handleBackgroundError(error)) {
        return;
      }
      DiscourseCopilotLogger.error('Popup: Error queueing follow-up:', error);
      if (isStillOnPage()) {
        this.input.value = question;
        this.status.show(`Error: ${error.message}`, 'error');
      }
    } finally {
      this.operations.finish(operation);
      this.input.focus();
    }
  }

  async clear() {
    const session = this.state.session;
    if (!session) {
      return;
    }
    this.hooks.cancelActiveOperation();
    session.history = [];
    session.chatUpdatedAt = 0;
    session.updatedAt = Date.now();
    this.renderHistory([]);
    const saved = await this.hooks.persistSession();
    this.status.show(saved ? 'Chat cleared and saved' : 'Chat cleared', 'ready');
  }

  // ---------- Forum context limit ----------

  // The saved limit replaces the slider's value (settings loaded or changed).
  syncContextLimit(limit) {
    this.forumContextLimit = limit;
  }

  renderContextControl() {
    const slider = $('forumContextLimit');
    const output = $('forumContextLimitValue');
    const help = $('forumContextLimitHelp');
    const warning = $('forumContextLimitWarning');
    if (!slider || !output || !help || !warning) {
      return;
    }

    const limit = normalizeForumContextLimit(this.forumContextLimit);
    this.forumContextLimit = limit;
    slider.min = String(FORUM_CONTEXT_LIMIT.min);
    slider.max = String(FORUM_CONTEXT_LIMIT.max);
    slider.step = String(FORUM_CONTEXT_LIMIT.step);
    slider.value = String(limit);
    const formattedLimit = formatForumContextLimit(limit);
    output.textContent = formattedLimit;
    slider.setAttribute('aria-valuetext', formattedLimit);

    const source = this.state.session?.source;
    const sourceLength = typeof source === 'string' ? source.trim().length : 0;
    if (!sourceLength) {
      help.textContent =
        `Up to ${formattedLimit} from the discussion will be sent with each question.`;
    } else if (sourceLength <= limit) {
      help.textContent =
        `The full discussion fits (${sourceLength.toLocaleString()} characters).`;
    } else {
      const excess = sourceLength - limit;
      help.textContent =
        `The discussion exceeds this limit by ${excess.toLocaleString()} characters. `
        + 'The opening and latest replies will be kept.';
    }
    const includedCharacters = sourceLength
      ? Math.min(sourceLength, limit)
      : limit;
    warning.classList.toggle('hidden', includedCharacters <= LARGE_CONTEXT_CHARS);
  }

  async saveContextLimit() {
    const revision = ++this.forumContextLimitSaveRevision;
    const selectedLimit = normalizeForumContextLimit(this.forumContextLimit);
    try {
      const savedLimit = await this.config.setForumContextLimit(selectedLimit);
      if (revision !== this.forumContextLimitSaveRevision) {
        return;
      }
      this.forumContextLimit = savedLimit;
      this.renderContextControl();
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Unable to save forum context limit:', error);
      if (revision === this.forumContextLimitSaveRevision) {
        this.status.show('Context limit changed for now but could not be saved', 'warning');
      }
    }
  }
}
