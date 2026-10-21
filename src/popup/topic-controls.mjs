// Enabled/disabled state and labels of the topic view's controls, derived
// from one snapshot of the panel state (pure), then applied to the DOM.

import { t } from '../shared/i18n.mjs';
import { setButtonLabel } from './icons.mjs';

export function getSummaryActionLabel({
  taskStatus = '',
  taskPhase = '',
  isSubmitting = false,
  hasSummary = false,
  isHydrating = false
} = {}) {
  if (taskStatus === 'queued') return t('controls.summary.queued');
  if (taskStatus && taskPhase === 'fetching') return t('controls.summary.reading');
  if (taskStatus) return t('controls.summary.creating');
  if (isSubmitting) return t('controls.summary.starting');
  if (hasSummary) return t('controls.summary.check');
  if (isHydrating) return t('controls.summary.loading');
  return t('controls.summary.create');
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
      label: submitting('agent') ? t('controls.starting') : input.agentSearchLabel
    },
    copyPost: { disabled: !input.hasSource },
    copySummary: { disabled: !input.hasSummary },
    exportSummary: { disabled: !input.hasSummary },
    chatInput: {
      disabled: !background || submitting('chat') || !input.hasSummary,
      // Off (no chat to have) rather than briefly disabled while a question sends.
      off: !background || !input.hasSummary,
      placeholder: input.hasSummary ? t('popup.chat.placeholder') : t('popup.chat.needsSummary')
    },
    contextLimit: {
      disabled: contextLimitDisabled,
      title: contextLimitDisabled && input.hasSummary ? t('controls.contextLocked') : t('controls.contextChoose')
    },
    clearChat: {
      disabled: busy || input.chatEditSaving || topicTasksRunning || !input.historyLength
    },
    chatEdit: {
      disabled: chatEditLocked,
      title: chatEditLocked ? t('controls.editLocked') : t('controls.edit')
    },
    sendChat: {
      disabled:
        !background
        || input.forumAccessMissing === true
        || input.chatEditSaving
        || submitting('chat')
        || !input.hasSummary
        || !input.hasChatQuestion,
      label: submitting('chat') ? t('controls.chatStarting') : t('controls.send'),
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
    return configReady ? t('helper.forumOpenTopic') : t('helper.forumConnect');
  }
  if (!pageContext?.isForumTopic) {
    return t('helper.openTopic');
  }
  if (!configReady) {
    return t('helper.finishSetup');
  }
  if (summaryRunning) {
    return t('helper.running');
  }
  if (hasSummary) {
    return t('helper.saved');
  }
  return t('helper.default');
}

const $ = id => document.getElementById(id);

function setBusy(element, busy) {
  element.setAttribute('aria-busy', String(busy));
}

export function applyTopicControls(controls, helperText) {
  const summarize = $('summarizeBtn');
  summarize.disabled = controls.summarize.disabled;
  setButtonLabel(summarize, controls.summarize.label);
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
    setButtonLabel(sendAgent, controls.sendAgent.label);
  }

  $('copyPostBtn').disabled = controls.copyPost.disabled;
  $('copyBtn').disabled = controls.copySummary.disabled;
  $('exportBtn').disabled = controls.exportSummary.disabled;
  const chatInput = $('chatInput');
  chatInput.disabled = controls.chatInput.disabled;
  chatInput.placeholder = controls.chatInput.placeholder;
  $('composerDock').classList.toggle('chat-off', controls.chatInput.off);
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
