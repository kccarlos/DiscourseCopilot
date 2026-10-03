// Renders one Agent run into an answer view root: the inline panel on the
// topic view (#agentPanel) or the Activity detail view (#agentDetailView).
// Both roots hold a copy of #agentAnswerTemplate and every element is found
// through its data-part inside the root, so the two never share IDs.
import {
  AGENT_ACTIVITY_STATUS,
  agentStepsOf,
  agentTurnsOf,
  currentAgentTurnIndex,
  describeAgentStep,
  isAgentActivityTerminal
} from '../shared/agent-activity.mjs';
import { isTerminalTaskStatus } from '../shared/task-record.mjs';
import { isSameForumUrl } from '../shared/forum-site.mjs';
import { forumAccessHost, isForumAccessError } from '../shared/forum-access.mjs';
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { topicKeyFromUrl } from './conversation-state.mjs';
import { formatRelativeTime, retentionCopy } from './ui-state.mjs';
import { renderMarkdown } from './markdown.mjs';
import { openForumTarget } from './forum-tabs.mjs';

function plural(count, word, suffix = 's') {
  return `${count} ${word}${count === 1 ? '' : suffix}`;
}

// "Step 3 of 15 · Searching “rate limit”…": where the agent is in this
// turn's budget, and what it is doing.
export function describeAgentProgress(activity = {}) {
  if (activity.status === 'queued') {
    return { label: 'Queued · waiting for an available worker…', percent: null };
  }
  if (activity.phase === 'answering') {
    return { label: 'Writing the answer…', percent: null };
  }
  const turnIndex = currentAgentTurnIndex(activity);
  const steps = agentStepsOf(activity).filter(step => step.turn === turnIndex);
  const max = activity.budget?.maxSteps || activity.progress?.totalSteps || 0;
  const used = steps.filter(step => step.status !== 'running').length;
  const running = steps.find(step => step.status === 'running');
  const position = max ? `Step ${Math.min(used + 1, max)} of ${max}` : `Step ${used + 1}`;
  let label;
  if (running) {
    label = `${position} · ${describeAgentStep(running).label}`;
  } else if (!steps.length && activity.phase !== 'planning') {
    label = 'Starting…';
  } else {
    label = `${position} · Planning…`;
  }
  const percent = Number.isFinite(activity.progress?.percent) ? activity.progress.percent : null;
  return { label, percent };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP_ICON_PATHS = {
  search_forum: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-4-4'],
  list_latest: ['M8 6h12M8 12h12M8 18h12', 'M4 6h.01M4 12h.01M4 18h.01'],
  read_topic: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h7M9 17h5'],
  saved_summaries: ['M7 4h10v17l-5-3.5L7 21z'],
  failed: ['M12 8v5', 'M12 16.5h.01', 'M12 3 2.5 20h19z']
};

// A small line icon for a step: one per tool, an alert for a failed step.
function stepIcon(step) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const paths = step.status === 'failed' ? STEP_ICON_PATHS.failed : STEP_ICON_PATHS[step.tool] || STEP_ICON_PATHS.search_forum;
  for (const definition of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', definition);
    svg.appendChild(path);
  }
  return svg;
}

const SOURCE_HIGHLIGHT_MS = 2400;

export class AgentAnswerView {
  /**
   * @param {object} deps
   * @param {object} deps.forums ForumDirectory
   * @param {object} deps.markdown MarkdownScheduler
   * @param {(taskId: string) => string|undefined} deps.getStream streamed answer text so far
   * @param {(activity: object) => object|null} deps.findTask the run's queue task
   * @param {() => object} [deps.getRetentionCopy] retentionCopy() for the history setting
   */
  constructor({ forums, markdown, getStream, findTask, getRetentionCopy = () => retentionCopy(null) }) {
    this.getRetentionCopy = getRetentionCopy;
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
        return 'Working…';
      case AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION:
        return isForumAccessError(activity.error) ? 'Needs forum access' : 'Needs forum login';
      case AGENT_ACTIVITY_STATUS.FAILED:
        return 'Failed';
      case AGENT_ACTIVITY_STATUS.CANCELLED:
        return 'Stopped';
      case AGENT_ACTIVITY_STATUS.COMPLETED:
        return [
          plural(agentStepsOf(activity).length, 'step'),
          plural(activity.sourceRefs?.length || 0, 'source'),
          formatRelativeTime(activity.completedAt || activity.updatedAt)
        ].join(' · ');
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
    const isActive = status === AGENT_ACTIVITY_STATUS.QUEUED || status === AGENT_ACTIVITY_STATUS.RUNNING;
    this.renderProgress(root, activity, isActive);
    this.renderNotice(root, activity, mode);
    this.renderSteps(root, activity, { isNewRun, isActive });
    this.renderThread(root, activity);
    this.renderAnswer(root, activity, isActive);
    this.renderSources(root, activity, { isNewRun, mode });
    this.renderFollowUp(root, activity);
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
    const turns = agentTurnsOf(activity);
    const index = turns.length - 1;
    const turn = turns[index];
    answer.dataset.citations = (activity.sourceRefs || []).map(source => source.sourceId).join(',');
    // A follow-up shows its own question above its answer.
    const question = this.part(root, 'turn-question');
    question.textContent = index > 0 ? turn.question : '';
    question.classList.toggle('hidden', index === 0 || !turn.question);
    const note = this.part(root, 'budget-note');
    note.classList.toggle('hidden', !(turn.answer && turn.outOfBudget));
    const stream = this.getStream(activity.taskId);
    if (stream && (isActive || !turn.answer)) {
      answer.classList.remove('hidden');
      this.markdown.schedule(answer, stream);
      answer.dataset.renderKey = '';
    } else if (turn.answer) {
      answer.classList.remove('hidden');
      const renderKey = `${activity.activityId}:${turn.id}:${turn.answer.length}:${answer.dataset.citations}`;
      if (answer.dataset.renderKey !== renderKey) {
        answer.dataset.renderKey = renderKey;
        renderMarkdown(answer, turn.answer);
      }
    } else if (isActive) {
      answer.classList.remove('hidden');
      answer.dataset.renderKey = '';
      const placeholder = document.createElement('p');
      placeholder.className = 'streaming-placeholder';
      placeholder.textContent =
        activity.status === AGENT_ACTIVITY_STATUS.QUEUED
          ? 'The agent starts as soon as a worker is free. You can keep browsing.'
          : 'The answer appears here once the agent has what it needs.';
      answer.replaceChildren(placeholder);
    } else {
      answer.dataset.renderKey = '';
      answer.replaceChildren();
      answer.classList.add('hidden');
    }
  }

  // Earlier questions and answers of a run with follow-ups, above the
  // newest one.
  renderThread(root, activity) {
    const thread = this.part(root, 'thread');
    const turns = agentTurnsOf(activity).slice(0, -1);
    const citations = (activity.sourceRefs || []).map(source => source.sourceId).join(',');
    const key =
      turns.map((turn, index) => `${index}:${turn.id}:${turn.question}:${turn.answer.length}`).join('|')
      + `|${citations}|${activity.activityId}`;
    if (thread.dataset.key === key) {
      return;
    }
    thread.dataset.key = key;
    thread.replaceChildren(
      ...turns.flatMap((turn, index) => {
        if (!turn.answer) {
          return [];
        }
        const nodes = [];
        if (index > 0) {
          const question = document.createElement('h3');
          question.className = 'agent-thread-question';
          question.textContent = turn.question;
          nodes.push(question);
        }
        const article = document.createElement('article');
        article.className = 'agent-answer-display summary-display agent-thread-answer';
        article.dataset.citations = citations;
        renderMarkdown(article, turn.answer);
        nodes.push(article);
        return nodes;
      })
    );
  }

  // The live step list: an icon per tool, what was done and how it went,
  // and the reason and what came back under each step.
  renderSteps(root, activity, { isNewRun, isActive }) {
    const details = this.part(root, 'steps');
    const list = this.part(root, 'step-list');
    const steps = agentStepsOf(activity);
    this.part(root, 'step-count').textContent = String(steps.length);
    details.classList.toggle('hidden', !steps.length);
    const wasActive = root.dataset.stepsActive === 'true';
    root.dataset.stepsActive = String(isActive);
    if (isNewRun) {
      details.open = isActive;
    } else if (wasActive && !isActive) {
      // Finished: tuck the steps away, the answer is what matters now.
      details.open = false;
    }
    // Steps the viewer expanded stay expanded when the list is rebuilt; a
    // different run starts from a clean list.
    const open = new Set(
      isNewRun
        ? []
        : [...list.querySelectorAll('li[data-step-id]')]
            .filter(item => item.querySelector('details')?.open)
            .map(item => item.dataset.stepId)
    );
    const lastTurn = currentAgentTurnIndex(activity);
    const turns = agentTurnsOf(activity);
    const nodes = [];
    let shownTurn = 0;
    for (const step of steps) {
      if (step.turn > shownTurn && step.turn <= lastTurn) {
        shownTurn = step.turn;
        const marker = document.createElement('li');
        marker.className = 'agent-step-turn';
        marker.textContent = `Follow-up · ${turns[step.turn]?.question || ''}`;
        nodes.push(marker);
      }
      nodes.push(this.createStepItem(step, open));
    }
    list.replaceChildren(...nodes);
  }

  createStepItem(step, open) {
    const { label, meta } = describeAgentStep(step);
    const item = document.createElement('li');
    item.className = 'agent-step';
    item.dataset.stepId = step.id;
    item.dataset.status = step.status;
    item.dataset.tool = step.tool;
    const icon = document.createElement('span');
    icon.className = 'agent-step-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(stepIcon(step));
    const main = document.createElement('div');
    main.className = 'agent-step-main';
    const heading = (parent, tag) => {
      const text = document.createElement(tag);
      if (tag === 'span') text.className = 'agent-step-text';
      const labelNode = document.createElement('span');
      labelNode.className = 'agent-step-label';
      labelNode.textContent = label;
      text.appendChild(labelNode);
      if (meta) {
        const metaNode = document.createElement('span');
        metaNode.className = 'agent-step-meta';
        // "Searched “x” · 12 results", "Read “Title” (42 posts)": a space
        // keeps the two readable in text, the dot is part of the outcome.
        text.append(' ');
        metaNode.textContent = meta.startsWith('(') ? meta : `· ${meta}`;
        text.appendChild(metaNode);
      }
      parent.appendChild(text);
      return text;
    };
    const detail = step.status === 'failed' ? step.error || step.detail : step.detail;
    if (step.reason || detail) {
      const details = document.createElement('details');
      details.open = open.has(step.id);
      heading(details, 'summary');
      const body = document.createElement('div');
      body.className = 'agent-step-body';
      if (step.reason) {
        const reason = document.createElement('p');
        reason.className = 'agent-step-reason';
        reason.textContent = step.reason;
        body.appendChild(reason);
      }
      if (detail) {
        const pre = document.createElement('pre');
        pre.className = 'agent-step-detail';
        pre.textContent = detail;
        body.appendChild(pre);
      }
      details.appendChild(body);
      main.appendChild(details);
    } else {
      heading(main, 'span');
    }
    item.append(icon, main);
    return item;
  }

  // The follow-up box under a finished answer; it keeps what was typed.
  renderFollowUp(root, activity) {
    const form = this.part(root, 'followup');
    const turn = agentTurnsOf(activity).at(-1);
    const show = activity.status === AGENT_ACTIVITY_STATUS.COMPLETED && Boolean(turn?.answer);
    form.classList.toggle('hidden', !show);
    if (!show) {
      return;
    }
    const forumName = this.forums.label(activity.siteUrl, activity.forumName);
    this.part(root, 'followup-label').textContent = forumName ? `Ask a follow-up on ${forumName}` : 'Ask a follow-up';
    const busy = form.dataset.busy === 'true';
    this.part(root, 'followup-send').disabled = busy;
    this.part(root, 'followup-input').disabled = busy;
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
    if (activity.status === AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION && isForumAccessError(activity.error)) {
      // Continue asks for access first (agent-controller withForumAccess).
      const host = forumAccessHost(activity.siteUrl);
      type = 'warning';
      message = `DiscourseCopilot needs your OK to read ${host} before this research can continue. It searches the forum using your current login.`;
      actions.push({ action: 'continue', label: `Allow access to ${host} & continue`, primary: true });
    } else if (activity.status === AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION) {
      type = 'warning';
      message = `${forumName} asked for a login or verification before the research can continue. Log in in a browser tab, then choose Continue.`;
      actions.push({ action: 'login', label: `Log in to ${forumName} ↗`, primary: true }, { action: 'continue', label: 'Continue' });
    } else if (activity.status === AGENT_ACTIVITY_STATUS.FAILED) {
      type = 'error';
      message = activity.error?.message || 'Agent research failed.';
      actions.push({ action: 'retry', label: 'Retry', primary: true });
    } else if (activity.status === AGENT_ACTIVITY_STATUS.CANCELLED) {
      type = 'info';
      const followUp = currentAgentTurnIndex(activity) > 0;
      message = followUp ? 'The follow-up was stopped before an answer was written.' : 'Research stopped before an answer was written.';
      actions.push(
        mode === 'inline' && !followUp
          ? { action: 'ask-again', label: 'Ask again', primary: true }
          : { action: 'retry', label: 'Ask again', primary: true }
      );
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
    const focusedAction = container.contains(document.activeElement) ? document.activeElement.dataset.agentAction : '';
    container.dataset.signature = signature;
    container.replaceChildren(
      ...actions.map(item => {
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
      })
    );
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
        title: activity.kept ? this.getRetentionCopy().unkeepAnswer : this.getRetentionCopy().keepAnswer
      });
    }
    if (mode === 'inline' && activity.status === AGENT_ACTIVITY_STATUS.COMPLETED) {
      // Failed and stopped runs offer Retry / Ask again in their notice instead.
      actions.push({ action: 'ask-another', label: 'Ask another' }, { action: 'open-activity', label: 'Open in Activity' });
    } else if (isAgentActivityTerminal(activity.status)) {
      actions.push({ action: 'delete', label: 'Delete' });
    }
    const container = this.part(root, 'actions');
    this.renderButtons(container, actions);
    container.dataset.count = String(actions.length);
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
      link.textContent = source.postNumber ? `Open post ${source.postNumber} ↗` : 'Open topic ↗';
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
