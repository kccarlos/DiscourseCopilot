// Renders one Agent run into an answer view root: the inline panel on the
// topic view (#agentPanel) or the Activity detail view (#agentDetailView).
// Both roots hold a copy of #agentAnswerTemplate and every element is found
// through its data-part inside the root, so the two never share IDs.
import {
  AGENT_ACTIVITY_STATUS,
  isAgentActivityTerminal
} from '../shared/agent-activity.mjs';
import { isTerminalTaskStatus } from '../shared/task-record.mjs';
import { isSameForumUrl } from '../shared/forum-site.mjs';
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { topicKeyFromUrl } from './conversation-state.mjs';
import { describeAgentProgress, formatRelativeTime } from './ui-state.mjs';
import { renderMarkdown } from './markdown.mjs';
import { openForumTarget } from './forum-tabs.mjs';

const SOURCE_HIGHLIGHT_MS = 2400;

function plural(count, word, suffix = 's') {
  return `${count} ${word}${count === 1 ? '' : suffix}`;
}

export class AgentAnswerView {
  /**
   * @param {object} deps
   * @param {object} deps.forums ForumDirectory
   * @param {object} deps.markdown MarkdownScheduler
   * @param {(taskId: string) => string|undefined} deps.getStream streamed answer text so far
   * @param {(activity: object) => object|null} deps.findTask the run's queue task
   */
  constructor({ forums, markdown, getStream, findTask }) {
    this.forums = forums;
    this.markdown = markdown;
    this.getStream = getStream;
    this.findTask = findTask;
    this.sourceHighlightTimer = null;
  }

  part(root, name) {
    return root.querySelector(`[data-part="${name}"]`);
  }

  // One line describing where a run stands.
  statusSummary(activity) {
    switch (activity.status) {
      case AGENT_ACTIVITY_STATUS.QUEUED:
        return 'Queued';
      case AGENT_ACTIVITY_STATUS.RUNNING:
        return 'Researching…';
      case AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION:
        return 'Needs forum login';
      case AGENT_ACTIVITY_STATUS.FAILED:
        return 'Failed';
      case AGENT_ACTIVITY_STATUS.CANCELLED:
        return 'Stopped';
      case AGENT_ACTIVITY_STATUS.COMPLETED:
        return activity.answerStatus === 'no_results'
          ? 'No matching discussions'
          : `${plural(activity.sourceRefs?.length || 0, 'source')} · ${formatRelativeTime(activity.completedAt || activity.updatedAt)}`;
      default:
        return activity.statusText || '';
    }
  }

  /**
   * @param {HTMLElement} root
   * @param {object} activity
   * @param {{mode?: 'inline'|'detail'}} [options]
   */
  render(root, activity, { mode = 'detail' } = {}) {
    const isNewRun = root.dataset.activityId !== activity.activityId;
    root.dataset.activityId = activity.activityId;
    root.dataset.taskId = activity.taskId;
    root.dataset.status = activity.status;
    if (isNewRun) {
      this.setActionStatus(root, '');
    }

    const status = activity.status;
    const isActive = status === AGENT_ACTIVITY_STATUS.QUEUED
      || status === AGENT_ACTIVITY_STATUS.RUNNING;
    this.renderProgress(root, activity, isActive);
    this.renderNotice(root, activity, mode);
    this.renderAnswer(root, activity, isActive);
    this.renderSearches(root, activity, { isNewRun, mode });
    this.renderSources(root, activity, { isNewRun, mode });
    this.renderActions(root, activity, mode);
  }

  renderProgress(root, activity, isActive) {
    const progress = this.part(root, 'progress');
    progress.classList.toggle('hidden', !isActive);
    if (!isActive) {
      return;
    }
    const { label, percent } = describeAgentProgress(activity);
    this.part(root, 'progress-label').textContent = label;
    const bar = this.part(root, 'progress-bar');
    if (percent === null) {
      bar.removeAttribute('value');
    } else {
      bar.value = percent;
    }
    bar.setAttribute('aria-label', label);
    const task = this.findTask(activity);
    const stop = progress.querySelector('[data-agent-action="stop"]');
    const stopping = task?.phase === 'cancelling';
    stop.textContent = stopping ? 'Stopping…' : 'Stop';
    stop.disabled = stopping || !task || isTerminalTaskStatus(task.status);
  }

  renderAnswer(root, activity, isActive) {
    const answer = this.part(root, 'answer');
    answer.dataset.citations = (activity.sourceRefs || []).map(source => source.sourceId).join(',');
    const stream = this.getStream(activity.taskId);
    if (stream && (isActive || !activity.answer)) {
      answer.classList.remove('hidden');
      this.markdown.schedule(answer, stream);
      answer.dataset.renderKey = '';
    } else if (activity.answer) {
      answer.classList.remove('hidden');
      const renderKey = `${activity.activityId}:${activity.updatedAt}:${activity.answer.length}`;
      if (answer.dataset.renderKey !== renderKey) {
        answer.dataset.renderKey = renderKey;
        renderMarkdown(answer, activity.answer);
      }
    } else if (isActive) {
      answer.classList.remove('hidden');
      answer.dataset.renderKey = '';
      const placeholder = document.createElement('p');
      placeholder.className = 'streaming-placeholder';
      placeholder.textContent = activity.status === AGENT_ACTIVITY_STATUS.QUEUED
        ? 'Research starts as soon as a worker is free. You can keep browsing.'
        : 'The answer appears here once the relevant discussions are read.';
      answer.replaceChildren(placeholder);
    } else {
      answer.dataset.renderKey = '';
      answer.replaceChildren();
      answer.classList.add('hidden');
    }
  }

  // Streams a chunk into every visible root showing this task.
  renderStream(roots, taskId, content) {
    for (const root of roots) {
      if (root.dataset.taskId === taskId && !root.classList.contains('hidden')) {
        const answer = this.part(root, 'answer');
        answer.classList.remove('hidden');
        this.markdown.schedule(answer, content);
      }
    }
  }

  renderNotice(root, activity, mode) {
    const notice = this.part(root, 'notice');
    const text = this.part(root, 'notice-text');
    const actions = [];
    const forumName = this.forums.label(activity.siteUrl, activity.forumName);
    let type = '';
    let message = '';
    if (activity.status === AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION) {
      type = 'warning';
      message = `${forumName} asked for a login or verification before the research can continue. Log in in a browser tab, then choose Continue.`;
      actions.push(
        { action: 'login', label: `Log in to ${forumName} ↗`, primary: true },
        { action: 'continue', label: 'Continue' }
      );
    } else if (activity.status === AGENT_ACTIVITY_STATUS.FAILED) {
      type = 'error';
      message = activity.error?.message || 'Agent research failed.';
      actions.push({ action: 'retry', label: 'Retry', primary: true });
    } else if (activity.status === AGENT_ACTIVITY_STATUS.CANCELLED) {
      type = 'info';
      message = 'Research stopped before an answer was written.';
      actions.push(mode === 'inline'
        ? { action: 'ask-again', label: 'Ask again', primary: true }
        : { action: 'retry', label: 'Ask again', primary: true });
    }
    notice.className = `agent-notice status ${type}${type ? '' : ' hidden'}`;
    text.textContent = message;
    this.renderButtons(this.part(root, 'notice-actions'), actions);
  }

  // Rebuilds a button row only when its actions change, keeping focus.
  renderButtons(container, actions) {
    const signature = JSON.stringify(actions);
    if (container.dataset.signature === signature) {
      return;
    }
    const focusedAction = container.contains(document.activeElement)
      ? document.activeElement.dataset.agentAction
      : '';
    container.dataset.signature = signature;
    container.replaceChildren(...actions.map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = item.primary ? 'secondary' : 'outline secondary';
      button.dataset.agentAction = item.action;
      button.textContent = item.label;
      if (item.pressed !== undefined) {
        button.setAttribute('aria-pressed', String(item.pressed));
      }
      if (item.title) {
        button.title = item.title;
      }
      return button;
    }));
    container.classList.toggle('hidden', !actions.length);
    if (focusedAction) {
      container.querySelector(`[data-agent-action="${CSS.escape(focusedAction)}"]`)?.focus();
    }
  }

  renderActions(root, activity, mode) {
    const actions = [];
    if (activity.status === AGENT_ACTIVITY_STATUS.COMPLETED) {
      if (activity.answer) {
        actions.push({ action: 'copy', label: 'Copy answer', primary: true });
      }
      actions.push({
        action: 'keep',
        label: activity.kept ? 'Kept' : 'Keep',
        pressed: activity.kept === true,
        title: activity.kept
          ? 'Kept in Saved. Select to let it expire after 24 hours.'
          : 'Keep this answer in Saved beyond 24 hours'
      });
    }
    if (mode === 'inline' && activity.status === AGENT_ACTIVITY_STATUS.COMPLETED) {
      // Failed and stopped runs offer Retry / Ask again in their notice instead.
      actions.push(
        { action: 'ask-another', label: 'Ask another' },
        { action: 'open-activity', label: 'Open in Activity' }
      );
    } else if (isAgentActivityTerminal(activity.status)) {
      actions.push({ action: 'delete', label: 'Delete' });
    }
    const container = this.part(root, 'actions');
    this.renderButtons(container, actions);
    container.dataset.count = String(actions.length);
  }

  renderSearches(root, activity, { isNewRun, mode }) {
    const details = this.part(root, 'searches');
    const list = this.part(root, 'search-list');
    const searchQueries = Array.isArray(activity.searchQueries) ? activity.searchQueries : [];
    this.part(root, 'search-count').textContent = String(searchQueries.length);
    details.classList.toggle('hidden', !searchQueries.length);
    if (isNewRun) {
      details.open = mode === 'detail' && !isAgentActivityTerminal(activity.status);
    }
    list.replaceChildren(...searchQueries.map(search => {
      const item = document.createElement('li');
      item.className = 'agent-search-item';
      const query = document.createElement('code');
      query.className = 'agent-search-query';
      query.textContent = search.query;
      item.appendChild(query);
      if (Number.isFinite(search.resultCount)) {
        const resultMeta = document.createElement('span');
        resultMeta.className = 'agent-search-meta';
        resultMeta.textContent = plural(search.resultCount, 'match', 'es');
        item.appendChild(resultMeta);
      }
      return item;
    }));
  }

  renderSources(root, activity, { isNewRun, mode }) {
    const details = this.part(root, 'sources');
    const list = this.part(root, 'source-list');
    const sources = activity.sourceRefs || [];
    this.part(root, 'source-count').textContent = String(sources.length);
    details.classList.toggle('hidden', !sources.length);
    if (isNewRun) {
      details.open = mode === 'detail';
    }
    const highlighted = list.querySelector('.agent-source-card.is-highlighted')?.dataset.sourceId;
    list.replaceChildren(...sources.map(source => this.createSourceCard(source, activity, highlighted)));
  }

  createSourceCard(source, activity, highlighted) {
    const card = document.createElement('article');
    card.className = 'agent-source-card';
    card.classList.toggle('is-highlighted', source.sourceId === highlighted);
    card.dataset.sourceId = source.sourceId;
    card.tabIndex = -1;
    const header = document.createElement('div');
    header.className = 'agent-source-card-header';
    const id = document.createElement('span');
    id.className = 'agent-source-id';
    id.textContent = `[${source.sourceId}]`;
    const title = document.createElement('strong');
    title.textContent = source.title;
    title.title = source.title;
    header.append(id, title);
    card.appendChild(header);
    const excerpt = document.createElement('p');
    excerpt.textContent = source.excerpt || 'Source content was not excerpted.';
    card.appendChild(excerpt);
    // Only link sources that belong to the forum this activity ran on.
    if (isSameForumUrl(source.url, activity.siteUrl || source.siteUrl)) {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.postNumber
        ? `Open post ${source.postNumber} ↗`
        : 'Open topic ↗';
      link.addEventListener('click', event => {
        // Reuse a tab already on this topic (jumping to the cited post)
        // instead of piling up new tabs; fall back to the plain link.
        event.preventDefault();
        const siteUrl = activity.siteUrl || source.siteUrl;
        openForumTarget({
          siteUrl,
          url: source.url,
          topicKey: topicKeyFromUrl(source.url, siteUrl),
          navigateExisting: true
        }).catch(error => {
          DiscourseCopilotLogger.error('Popup: Unable to open source:', error);
          window.open(source.url, '_blank', 'noopener');
        });
      });
      card.appendChild(link);
    }
    return card;
  }

  focusSource(root, sourceId) {
    const details = this.part(root, 'sources');
    const card = details.querySelector(`.agent-source-card[data-source-id="${CSS.escape(sourceId)}"]`);
    if (!card) {
      return;
    }
    details.open = true;
    for (const other of details.querySelectorAll('.agent-source-card.is-highlighted')) {
      other.classList.remove('is-highlighted');
    }
    // Restart the highlight when the same citation is followed twice.
    void card.offsetWidth;
    card.classList.add('is-highlighted');
    clearTimeout(this.sourceHighlightTimer);
    this.sourceHighlightTimer = setTimeout(() => {
      card.classList.remove('is-highlighted');
    }, SOURCE_HIGHLIGHT_MS);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
    card.focus({ preventScroll: true });
  }

  setActionStatus(root, message, type = 'info') {
    const status = this.part(root, 'action-status');
    status.textContent = message;
    status.dataset.type = type;
    status.classList.toggle('hidden', !message);
  }
}
