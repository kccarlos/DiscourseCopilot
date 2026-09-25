// Enabled/disabled state and labels of the topic view's controls, derived
// from one snapshot of the panel state (pure), then applied to the DOM.

export function getSummaryActionLabel({
  taskStatus = '',
  taskPhase = '',
  isSubmitting = false,
  hasSummary = false,
  isHydrating = false
} = {}) {
  if (taskStatus === 'queued') return 'Summary queued';
  if (taskStatus && taskPhase === 'fetching') return 'Reading replies';
  if (taskStatus) return 'Creating summary';
  if (isSubmitting) return 'Starting summary';
  if (hasSummary) return 'Check for new replies';
  if (isHydrating) return 'Loading saved summary';
  return 'Create summary';
}

/**
 * @param {object} input
 * @param {string} input.operationKind '' | 'summary' | 'chat' | 'agent'
 * @param {boolean} input.backgroundAvailable
 * @param {boolean} input.configReady the provider settings are usable
 * @param {boolean} input.hasTopic
 * @param {boolean} input.hasForumPage
 * @param {boolean} input.hasSummary
 * @param {boolean} input.hasSource
 * @param {number} input.historyLength
 * @param {boolean} input.isHydrating
 * @param {{status: string, phase: string}|null} input.activeSummaryTask
 * @param {boolean} input.hasActiveChatTask
 * @param {number} input.activeTopicTaskCount
 * @param {boolean} input.agentRequestPending the submitted Agent question is still queued/running
 * @param {boolean} input.hasChatQuestion
 * @param {boolean} input.hasAgentQuestion
 * @param {boolean} input.chatEditSaving an edited conversation is being saved
 * @param {string} input.agentSearchLabel
 * @param {boolean} [input.forumAccessMissing] the forum isn't enabled: nothing
 *   that reads it (summary, chat, Agent) can start
 */
export function deriveTopicControls(input) {
  const busy = Boolean(input.operationKind);
  const submitting = kind => input.operationKind === kind;
  const background = input.backgroundAvailable;
  const summaryTask = input.activeSummaryTask;
  const topicTasksRunning = input.activeTopicTaskCount > 0;
  const chatEditLocked = busy || input.chatEditSaving || topicTasksRunning;
  const agentInputDisabled = !background || submitting('agent') || !input.hasForumPage;
  const contextLimitDisabled = !input.hasSummary || submitting('chat') || input.hasActiveChatTask;

  return {
    summarize: {
      disabled: busy || !background || Boolean(summaryTask) || input.isHydrating || !input.hasTopic || !input.configReady,
      label: getSummaryActionLabel({
        taskStatus: summaryTask?.status,
        taskPhase: summaryTask?.phase,
        isSubmitting: submitting('summary'),
        hasSummary: input.hasSummary,
        isHydrating: input.isHydrating
      }),
      busy: Boolean(summaryTask) || submitting('summary')
    },
    agentLaunch: {
      disabled: busy || !background || !input.hasForumPage || !input.configReady || input.agentRequestPending,
      busy: submitting('agent')
    },
    agentInput: { disabled: agentInputDisabled },
    sendAgent: {
      disabled: agentInputDisabled || !input.hasAgentQuestion || !input.configReady,
      busy: submitting('agent'),
      label: submitting('agent') ? 'Starting…' : input.agentSearchLabel
    },
    copyPost: { disabled: !input.hasSource },
    copySummary: { disabled: !input.hasSummary },
    exportSummary: { disabled: !input.hasSummary },
    chatInput: { disabled: !background || submitting('chat') || !input.hasSummary },
    contextLimit: {
      disabled: contextLimitDisabled,
      title:
        contextLimitDisabled && input.hasSummary
          ? 'The context limit is locked while a chat response is running'
          : 'Choose how much forum discussion text accompanies each question'
    },
    clearChat: {
      disabled: busy || input.chatEditSaving || topicTasksRunning || !input.historyLength
    },
    chatEdit: {
      disabled: chatEditLocked,
      title: chatEditLocked ? 'Wait for the current chat task to finish before editing' : 'Edit this message and remove later replies'
    },
    sendChat: {
      disabled:
        !background
        || input.forumAccessMissing === true
        || input.chatEditSaving
        || submitting('chat')
        || !input.hasSummary
        || !input.hasChatQuestion,
      label: submitting('chat') ? 'Starting' : 'Send',
      busy: submitting('chat')
    }
  };
}

/**
 * The helper line under the page title.
 * @param {object} input
 * @param {object|null} input.pageContext
 * @param {boolean} input.configReady
 * @param {boolean} input.summaryRunning
 * @param {boolean} input.hasSummary
 */
// The hero shows only on a forum the panel can read (and while the page
// loads); every other page state has its own guidance card.
export function deriveTopicHelper({ pageContext, configReady, summaryRunning, hasSummary }) {
  if (!pageContext?.isForumTopic && pageContext?.isDiscourse) {
    return configReady
      ? 'Open any topic to summarize it, or ask the forum a question.'
      : 'Connect an AI provider below, then open a topic or ask the forum a question.';
  }
  if (!pageContext?.isForumTopic) {
    return 'Open a Discourse forum topic to get started.';
  }
  if (!configReady) {
    return 'Finish setup below to create a summary.';
  }
  if (summaryRunning) {
    return 'Your summary is running safely in the background.';
  }
  if (hasSummary) {
    return 'Your saved summary and conversation are ready.';
  }
  return 'Read every reply and create a focused overview.';
}

const $ = id => document.getElementById(id);

function setBusy(element, busy) {
  element.setAttribute('aria-busy', String(busy));
}

export function applyTopicControls(controls, helperText) {
  const summarize = $('summarizeBtn');
  summarize.disabled = controls.summarize.disabled;
  summarize.textContent = controls.summarize.label;
  setBusy(summarize, controls.summarize.busy);

  const agentLaunch = $('agentLaunchBtn');
  agentLaunch.disabled = controls.agentLaunch.disabled;
  setBusy(agentLaunch, controls.agentLaunch.busy);
  const agentInput = $('agentInput');
  const sendAgent = $('sendAgentBtn');
  if (agentInput && sendAgent) {
    agentInput.disabled = controls.agentInput.disabled;
    sendAgent.disabled = controls.sendAgent.disabled;
    setBusy(sendAgent, controls.sendAgent.busy);
    sendAgent.textContent = controls.sendAgent.label;
  }

  $('copyPostBtn').disabled = controls.copyPost.disabled;
  $('copyBtn').disabled = controls.copySummary.disabled;
  $('exportBtn').disabled = controls.exportSummary.disabled;
  $('chatInput').disabled = controls.chatInput.disabled;
  const contextLimit = $('forumContextLimit');
  contextLimit.disabled = controls.contextLimit.disabled;
  contextLimit.title = controls.contextLimit.title;
  $('clearChatBtn').disabled = controls.clearChat.disabled;
  $('savedBtn').disabled = false;
  document.querySelectorAll('.chat-edit-btn').forEach(button => {
    button.disabled = controls.chatEdit.disabled;
    button.title = controls.chatEdit.title;
  });

  const sendChat = $('sendChatBtn');
  sendChat.disabled = controls.sendChat.disabled;
  sendChat.querySelector('span').textContent = controls.sendChat.label;
  setBusy(sendChat, controls.sendChat.busy);

  $('topicHelper').textContent = helperText;
}
