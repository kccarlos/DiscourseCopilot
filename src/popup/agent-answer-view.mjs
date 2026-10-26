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
import { topicSessionDatabase } from '../shared/topic-session-db.mjs';
import { forumAccessHost, isForumAccessError } from '../shared/forum-access.mjs';
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { topicKeyFromUrl } from './conversation-state.mjs';
import { formatRelativeTime, retentionCopy } from './ui-state.mjs';
import { citedSourceIds, renderMarkdown } from './markdown.mjs';
import { ANSWER_CLAMP_PX, clearClamp, setClamp } from './clamp.mjs';
import { openForumTarget } from './forum-tabs.mjs';
import { createIcon, setButtonLabel, setIconButton } from './icons.mjs';
import { t, tn } from '../shared/i18n.mjs';

// "Step 3 of 15 · Searching “rate limit”…": where the agent is in this
// turn's budget, and what it is doing.
export function describeAgentProgress(activity = {}) {
  if (activity.status === 'queued') {
    return { label: t('answer.queuedWaiting'), percent: null };
  }
  if (activity.phase === 'answering') {
    return { label: t('agent.writing'), percent: null };
  }
  const turnIndex = currentAgentTurnIndex(activity);
  const steps = agentStepsOf(activity).filter(step => step.turn === turnIndex);
  const max = activity.budget?.maxSteps || activity.progress?.totalSteps || 0;
  const used = steps.filter(step => step.status !== 'running').length;
  const running = steps.find(step => step.status === 'running');
  const position = max ? t('answer.stepOf', { step: Math.min(used + 1, max), max }) : t('answer.step', { step: used + 1 });
  let label;
  if (running) {
    label = `${position} · ${describeAgentStep(running).label}`;
  } else if (!steps.length && activity.phase !== 'planning') {
    label = t('controls.starting');
  } else {
    label = t('answer.planning', { position });
  }
  const percent = Number.isFinite(activity.progress?.percent) ? activity.progress.percent : null;
  return { label, percent };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP_ICON_PATHS = {
  search_forum: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-4-4'],
  search_comments: ['M4 5h16v12H9l-5 4V5Z', 'M9 10h6'],
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
// Sources listed open under an answer up to this many.
const MAX_OPEN_SOURCES = 3;
const FOLLOWUP_MAX_HEIGHT_PX = 144;

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
        return t('answer.status.queued');
      case AGENT_ACTIVITY_STATUS.RUNNING:
        return t('answer.status.working');
      case AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION:
        return isForumAccessError(activity.error) ? t('answer.status.needsAccess') : t('answer.status.needsLogin');
      case AGENT_ACTIVITY_STATUS.FAILED:
        return t('task.failed');
      case AGENT_ACTIVITY_STATUS.CANCELLED:
        return t('answer.status.stopped');
      case AGENT_ACTIVITY_STATUS.COMPLETED:
        return [
          tn('answer.count.step', agentStepsOf(activity).length),
          tn('answer.count.source', activity.sourceRefs?.length || 0),
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
    this.renderTurns(root, activity, { isNewRun, isActive });
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
    setButtonLabel(stop, stopping ? t('answer.stopping') : t('answer.stop'));
    stop.disabled = stopping || !task || isTerminalTaskStatus(task.status);
  }

  // The thread: one block per turn (question, research, answer, sources),
  // kept in place between renders so open steps, focus and highlights stay.
  // The progress bar and the notice belong to the turn being worked on, so
  // they move into the last block.
  renderTurns(root, activity, { isNewRun, isActive }) {
    const container = this.part(root, 'turns');
    const turns = agentTurnsOf(activity);
    const lastIndex = turns.length - 1;
    const existing = new Map([...container.children].map(block => [block.dataset.turnId, block]));
    if (isNewRun) {
      existing.clear();
    }
    const stream = this.getStream(activity.taskId);
    const sources = activity.sourceRefs || [];
    // Citations in earlier answers point at sources of earlier turns, so each
    // turn lists the sources its own answer cites; sources no answer cites
    // stay with the last turn so none is unreachable.
    const cited = turns.map((turn, index) =>
      citedSourceIds(index === lastIndex && stream && (isActive || !turn.answer) ? stream : turn.answer)
    );
    const citedAnywhere = new Set(cited.flat());
    const blocks = turns.map((turn, index) => {
      const block = existing.get(turn.id) || this.createTurnBlock();
      existing.delete(turn.id);
      const ids = new Set(cited[index]);
      const listed = sources.filter(source => ids.has(source.sourceId) || (index === lastIndex && !citedAnywhere.has(source.sourceId)));
      this.updateTurnBlock(block, { activity, turn, index, isLast: index === lastIndex, isActive, listed, stream });
      return block;
    });
    const slot = blocks.at(-1).querySelector('.agent-turn-status');
    for (const part of ['progress', 'notice']) {
      const element = this.part(root, part);
      if (element.parentElement !== slot) {
        slot.appendChild(element);
      }
    }
    for (const block of existing.values()) {
      block.remove();
    }
    if (blocks.some((block, index) => container.children[index] !== block) || container.children.length !== blocks.length) {
      container.replaceChildren(...blocks);
    }
  }

  createTurnBlock() {
    const block = document.createElement('section');
    block.className = 'agent-turn';
    const question = document.createElement('div');
    question.className = 'chat-message user agent-turn-question hidden';
    question.dataset.part = 'turn-question';
    const status = document.createElement('div');
    status.className = 'agent-turn-status';

    const research = document.createElement('details');
    research.className = 'agent-research';
    research.dataset.part = 'steps';
    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.className = 'agent-research-label';
    label.dataset.part = 'research-label';
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(createIcon('search'), label, chevron);
    const steps = document.createElement('ol');
    steps.className = 'agent-step-list';
    steps.dataset.part = 'step-list';
    research.append(summary, steps);

    const answer = document.createElement('article');
    answer.className = 'agent-answer-display summary-display hidden';
    answer.dataset.part = 'answer';
    const note = document.createElement('p');
    note.className = 'agent-note hidden';
    note.dataset.part = 'budget-note';
    note.textContent = t('popup.budgetNote');

    const sources = document.createElement('details');
    sources.className = 'agent-turn-sources hidden';
    sources.dataset.part = 'sources';
    const sourcesSummary = document.createElement('summary');
    const sourcesLabel = document.createElement('span');
    sourcesLabel.textContent = t('popup.sources');
    const count = document.createElement('span');
    count.className = 'count-badge';
    count.dataset.part = 'source-count';
    const sourcesChevron = document.createElement('span');
    sourcesChevron.className = 'chevron';
    sourcesChevron.setAttribute('aria-hidden', 'true');
    sourcesSummary.append(sourcesLabel, count, sourcesChevron);
    const list = document.createElement('div');
    list.className = 'agent-source-list';
    list.dataset.part = 'source-list';
    sources.append(sourcesSummary, list);

    block.append(question, status, research, answer, note, sources);
    return block;
  }

  updateTurnBlock(block, { activity, turn, index, isLast, isActive, listed, stream }) {
    const live = isLast && isActive;
    const isNew = block.dataset.turnId !== turn.id;
    block.dataset.turnId = turn.id;
    block.dataset.turnIndex = String(index);
    const part = name => block.querySelector(`[data-part="${name}"]`);

    // A follow-up shows its own question as a user bubble; the first
    // question is in the card header.
    const question = part('turn-question');
    question.textContent = index > 0 ? turn.question : '';
    question.classList.toggle('hidden', index === 0 || !turn.question);

    this.renderTurnSteps(block, { activity, index, live, isNew });
    this.renderTurnAnswer(block, { activity, turn, live, isLast, stream });
    part('budget-note').classList.toggle('hidden', !(turn.answer && turn.outOfBudget));
    this.renderTurnSources(block, activity, listed);
    this.renderResearchLabel(block, listed.length);
  }

  // "3 steps · 2 sources": what this turn's research came to.
  renderResearchLabel(block, sourceCount) {
    const steps = block.querySelectorAll('[data-part="step-list"] > li.agent-step').length;
    const parts = [tn('answer.count.step', steps)];
    if (sourceCount) {
      parts.push(tn('answer.count.source', sourceCount));
    }
    block.querySelector('[data-part="research-label"]').textContent = parts.join(' · ');
  }

  renderTurnAnswer(block, { activity, turn, live, isLast, stream }) {
    const answer = block.querySelector('[data-part="answer"]');
    answer.dataset.citations = (activity.sourceRefs || []).map(source => source.sourceId).join(',');
    if (isLast && stream && (live || !turn.answer)) {
      answer.classList.remove('hidden');
      clearClamp(answer);
      this.markdown.schedule(answer, stream);
      answer.dataset.renderKey = '';
    } else if (turn.answer) {
      answer.classList.remove('hidden');
      const renderKey = `${activity.activityId}:${turn.id}:${turn.answer.length}:${answer.dataset.citations}`;
      if (answer.dataset.renderKey !== renderKey) {
        answer.dataset.renderKey = renderKey;
        renderMarkdown(answer, turn.answer);
      }
      // Earlier turns are cut off with a Show all button; the newest answer is shown in full.
      setClamp(answer, { enabled: !isLast, limit: ANSWER_CLAMP_PX });
    } else if (live) {
      answer.classList.remove('hidden');
      clearClamp(answer);
      answer.dataset.renderKey = '';
      const placeholder = document.createElement('p');
      placeholder.className = 'streaming-placeholder';
      placeholder.textContent =
        activity.status === AGENT_ACTIVITY_STATUS.QUEUED ? t('answer.placeholderQueued') : t('answer.placeholderRunning');
      answer.replaceChildren(placeholder);
    } else {
      answer.dataset.renderKey = '';
      clearClamp(answer);
      answer.replaceChildren();
      answer.classList.add('hidden');
    }
  }

  // This turn's steps: an icon per tool, what was done and how it went, and
  // the reason and what came back under each step. Open while the turn is
  // being worked on, tucked away once it is done.
  renderTurnSteps(block, { activity, index, live, isNew }) {
    const details = block.querySelector('[data-part="steps"]');
    const list = block.querySelector('[data-part="step-list"]');
    const steps = agentStepsOf(activity).filter(step => step.turn === index);
    details.classList.toggle('hidden', !steps.length);
    const wasLive = block.dataset.live === 'true';
    block.dataset.live = String(live);
    if (isNew) {
      details.open = live;
    } else if (wasLive && !live) {
      details.open = false;
    }
    // Steps the viewer expanded stay expanded when the list is rebuilt.
    const open = new Set(
      [...list.querySelectorAll('li[data-step-id]')].filter(item => item.querySelector('details')?.open).map(item => item.dataset.stepId)
    );
    list.replaceChildren(...steps.map(step => this.createStepItem(step, open)));
  }

  renderTurnSources(block, activity, sources) {
    const details = block.querySelector('[data-part="sources"]');
    const list = block.querySelector('[data-part="source-list"]');
    details.classList.toggle('hidden', !sources.length);
    block.querySelector('[data-part="source-count"]').textContent = String(sources.length);
    if (!sources.length) {
      list.replaceChildren();
      list.dataset.key = '';
      delete details.dataset.init;
      return;
    }
    if (!details.dataset.init) {
      // A short list is shown; a longer one waits behind its heading.
      details.dataset.init = 'true';
      details.open = sources.length <= MAX_OPEN_SOURCES;
    }
    const key = `${activity.activityId}|${activity.siteUrl}|${sources.map(source => `${source.sourceId}:${source.evidenceType}`).join(',')}`;
    if (list.dataset.key === key) {
      return;
    }
    list.dataset.key = key;
    const highlighted = list.querySelector('.agent-source-card.is-highlighted')?.dataset.sourceId;
    list.replaceChildren(...sources.map(source => this.createSourceCard(source, activity, highlighted)));
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
    this.part(root, 'followup-label').textContent = forumName ? t('answer.followUpOn', { forum: forumName }) : t('answer.followUp');
    this.part(root, 'followup-input').disabled = form.dataset.busy === 'true';
    this.syncFollowUp(root);
  }

  // Grows the box with its text, like the topic chat's, and enables Send
  // once there is a question.
  syncFollowUp(root) {
    const form = this.part(root, 'followup');
    const input = this.part(root, 'followup-input');
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, FOLLOWUP_MAX_HEIGHT_PX)}px`;
    this.part(root, 'followup-send').disabled = form.dataset.busy === 'true' || !input.value.trim();
  }

  // Streams a chunk into every visible root showing this task.
  renderStream(roots, taskId, content) {
    for (const root of roots) {
      if (root.dataset.taskId === taskId && !root.classList.contains('hidden')) {
        const answer = [...root.querySelectorAll('[data-part="answer"]')].at(-1);
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
      message = t('answer.notice.needAccess', { host });
      actions.push({ action: 'continue', icon: 'play', label: t('answer.notice.allowContinue', { host }), primary: true });
    } else if (activity.status === AGENT_ACTIVITY_STATUS.WAITING_USER_ACTION) {
      type = 'warning';
      message = t('answer.notice.needLogin', { forum: forumName });
      actions.push(
        { action: 'login', icon: 'open', label: t('answer.notice.login', { forum: forumName }), primary: true },
        { action: 'continue', icon: 'play', label: t('common.continue') }
      );
    } else if (activity.status === AGENT_ACTIVITY_STATUS.FAILED) {
      type = 'error';
      message = activity.error?.message || t('agent.researchFailed');
      actions.push({ action: 'retry', icon: 'retry', label: t('common.retry'), primary: true });
    } else if (activity.status === AGENT_ACTIVITY_STATUS.CANCELLED) {
      type = 'info';
      const followUp = currentAgentTurnIndex(activity) > 0;
      message = followUp ? t('answer.notice.followUpStopped') : t('answer.notice.stopped');
      actions.push(
        mode === 'inline' && !followUp
          ? { action: 'ask-again', icon: 'retry', label: t('answer.askAgain'), primary: true }
          : { action: 'retry', icon: 'retry', label: t('answer.askAgain'), primary: true }
      );
    }
    notice.className = `agent-notice status ${type}${type ? '' : ' hidden'}`;
    text.textContent = message;
    this.renderButtons(this.part(root, 'notice-actions'), actions);
  }

  // Rebuilds a button row only when its actions change, keeping focus.
  // `short` is the label shown beside the icon (the full `label` stays the
  // accessible name and tooltip); `tool` makes it a compact toolbar button.
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
        button.className = item.tool ? 'tool-btn' : item.primary ? 'secondary' : 'outline secondary';
        button.dataset.agentAction = item.action;
        if (item.icon) {
          setIconButton(button, { icon: item.icon, label: item.short || item.label });
        } else {
          button.textContent = item.label;
        }
        if (item.tool) {
          button.setAttribute('aria-label', item.label);
          button.title = item.title || item.label;
        } else if (item.title) {
          button.title = item.title;
        }
        if (item.pressed !== undefined) {
          button.setAttribute('aria-pressed', String(item.pressed));
        }
        return button;
      })
    );
    container.classList.toggle('hidden', !actions.length);
    if (focusedAction) {
      container.querySelector(`[data-agent-action="${CSS.escape(focusedAction)}"]`)?.focus();
    }
  }

  // The toolbar under a card: icon buttons (copy, keep, open, new question,
  // delete), each named for assistive tech and as a tooltip.
  renderActions(root, activity, mode) {
    const actions = [];
    if (activity.status === AGENT_ACTIVITY_STATUS.COMPLETED) {
      if (activity.answer) {
        actions.push({ action: 'copy', icon: 'copy', label: t('answer.copy'), short: t('answer.copyShort'), tool: true });
      }
      actions.push({
        action: 'keep',
        icon: 'bookmark',
        label: activity.kept ? t('common.kept') : t('common.keep'),
        pressed: activity.kept === true,
        title: activity.kept ? this.getRetentionCopy().unkeepAnswer : this.getRetentionCopy().keepAnswer,
        tool: true
      });
    }
    if (mode === 'inline' && activity.status === AGENT_ACTIVITY_STATUS.COMPLETED) {
      // Failed and stopped runs offer Retry / Ask again in their notice instead.
      actions.push(
        { action: 'open-activity', icon: 'activity', label: t('answer.openActivity'), short: t('popup.activity'), tool: true },
        { action: 'ask-another', icon: 'plus', label: t('answer.askAnother'), tool: true }
      );
    } else if (isAgentActivityTerminal(activity.status)) {
      actions.push({ action: 'delete', icon: 'trash', label: t('common.delete'), tool: true });
    }
    const container = this.part(root, 'actions');
    this.renderButtons(container, actions);
    container.dataset.count = String(actions.length);
  }

  createSourceCard(source, activity, highlighted) {
    const card = document.createElement('article');
    card.className = 'agent-source-card';
    card.classList.toggle('is-highlighted', source.sourceId === highlighted);
    card.dataset.sourceId = source.sourceId;
    card.tabIndex = -1;
    if (source.excerpt) {
      card.title = source.excerpt;
    }
    const id = document.createElement('span');
    id.className = 'agent-source-id';
    id.textContent = source.sourceId;
    const title = document.createElement('span');
    title.className = 'agent-source-title';
    title.textContent = source.title;
    title.title = source.title;
    card.append(id, title);
    // A saved summary is the user's own text, not a page of the forum: it
    // opens in place instead of sending them to the site.
    if (source.evidenceType === 'summary' && source.topicKey) {
      card.append(this.createSummaryToggle(card, source));
      return card;
    }
    // Only link sources that belong to the forum this activity ran on.
    if (isSameForumUrl(source.url, activity.siteUrl || source.siteUrl)) {
      const link = document.createElement('a');
      link.className = 'agent-source-open';
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const label = source.postNumber ? t('answer.openPost', { number: source.postNumber }) : t('answer.openTopic');
      link.setAttribute('aria-label', `${label}: ${source.title}`);
      link.title = label;
      link.appendChild(createIcon('open'));
      link.addEventListener('click', event => {
        // Reuse a tab already on this topic (jumping to the cited post)
        // instead of piling up new tabs; fall back to the plain link.
        event.preventDefault();
        const siteUrl = activity.siteUrl || source.siteUrl;
        openForumTarget({
          siteUrl,
          url: source.url,
          topicKey: source.topicKey || topicKeyFromUrl(source.url, siteUrl),
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

  // The button on a saved-summary source: shows or hides the summary under
  // the card, read from the saved topic the first time it is opened.
  createSummaryToggle(card, source) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'agent-source-open';
    button.setAttribute('aria-expanded', 'false');
    const label = t('answer.viewSummary');
    button.setAttribute('aria-label', `${label}: ${source.title}`);
    button.title = label;
    button.appendChild(createIcon('summary'));
    let body = null;
    button.addEventListener('click', async () => {
      if (body) {
        const hidden = body.classList.toggle('hidden');
        button.setAttribute('aria-expanded', String(!hidden));
        return;
      }
      body = document.createElement('div');
      body.className = 'agent-source-summary summary-display';
      body.textContent = t('answer.summaryLoading');
      card.appendChild(body);
      button.setAttribute('aria-expanded', 'true');
      try {
        const session = await topicSessionDatabase.get(source.topicKey);
        if (session?.summary) {
          renderMarkdown(body, session.summary);
        } else {
          body.textContent = t('answer.summaryGone');
        }
      } catch (error) {
        DiscourseCopilotLogger.error('Popup: Unable to load a saved summary:', error);
        body.textContent = t('answer.summaryGone');
      }
    });
    return button;
  }

  // Follows a citation to its source: within the turn that cites it, else
  // anywhere in the card.
  focusSource(root, sourceId, scope = root) {
    const selector = `.agent-source-card[data-source-id="${CSS.escape(sourceId)}"]`;
    const card = scope.querySelector(selector) || root.querySelector(selector);
    if (!card) {
      return;
    }
    const details = card.closest('details');
    if (details) {
      details.open = true;
    }
    for (const other of root.querySelectorAll('.agent-source-card.is-highlighted')) {
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
