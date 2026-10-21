// Cards on the Activity screen: tasks (Tasks tab) and saved items (Saved
// tab). Pure DOM builders; every action goes through a callback.
import { TASK_STATUS, TASK_TYPE, isTerminalTaskStatus } from '../shared/task-record.mjs';
import { agentActivityExpiry, agentStepsOf } from '../shared/agent-activity.mjs';
import { formatExpiresIn } from '../shared/preferences.mjs';
import { describeSummarizedReplies, formatRelativeTime, retentionCopy } from './ui-state.mjs';
import { cleanTopicTitle } from './forum-names.mjs';
import { t, tn } from '../shared/i18n.mjs';
import { createIcon, setIconButton } from './icons.mjs';

// data-saved-key of a saved card (focus after a delete, tests).
export const savedTopicKey = entry => `topic:${entry.topicKey}`;
export const savedAgentKey = activity => `agent:${activity.activityId}`;

const statusLabel = status => t(`task.status.${status}`);

// Every card button is an icon button: the label stays in the button (visually
// hidden) as its name, and is the tooltip. `primary` marks the one to press
// (Continue on a task waiting for the user).
function createButton(label, className, onClick, { icon, primary = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `activity-action ${className}`.trim();
  button.classList.toggle('primary', primary);
  setIconButton(button, { icon, label });
  button.classList.add('icon-only');
  button.setAttribute('aria-label', label);
  button.title = label;
  button.addEventListener('click', onClick);
  return button;
}

// The card's title is the button that opens it; its hit area covers the
// whole card (see .card-open in popup.css), so a click anywhere on the row
// opens the item while the action buttons keep their own clicks.
function createCardOpener(tagName, { text, tooltip, label, className, onClick }) {
  const heading = document.createElement(tagName);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `card-open ${className}`;
  button.textContent = text;
  button.title = tooltip && tooltip !== label ? `${tooltip}\n${label}` : label;
  button.dataset.openLabel = label;
  // The name is the title; screen readers still hear what the click does.
  button.setAttribute('aria-description', label);
  button.addEventListener('click', onClick);
  heading.appendChild(button);
  return heading;
}

function createMetadataSpan(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

// A tile with the kind of item: summary, chat or Agent.
function createTypeIcon(kind) {
  const tile = document.createElement('span');
  tile.className = `activity-icon ${kind}`;
  tile.setAttribute('aria-hidden', 'true');
  tile.appendChild(createIcon({ summary: 'summary', chat: 'chat', agent: 'search' }[kind]));
  return tile;
}

function createCancelButton(task, onCancel) {
  const cancel = createButton(
    task.phase === 'cancelling' ? t('answer.stopping') : t('activity.stopTask'),
    'stop-task',
    () => onCancel(task.id),
    { icon: 'stop' }
  );
  cancel.disabled = task.phase === 'cancelling';
  return cancel;
}

// One line each: the title with its status badge, forum · counts · time, and
// what the task is doing (or the error). Actions sit to the right.
function createTaskCardBase(task, { className, kind, title, titleTooltip, open, badge, queuePosition, forumName, details = [], buttons }) {
  const card = document.createElement('article');
  card.className = className;

  const main = document.createElement('div');
  main.className = 'task-card-main';
  const header = document.createElement('div');
  header.className = 'task-card-header';
  const heading = createCardOpener('h4', { text: title, tooltip: titleTooltip, className: 'open-task', ...open });
  const badgeElement = document.createElement('span');
  badgeElement.className = 'task-badge';
  badgeElement.textContent = badge;
  header.append(heading, badgeElement);
  main.appendChild(header);

  const meta = document.createElement('p');
  meta.className = 'task-card-meta';
  meta.textContent = [forumName, ...details, formatRelativeTime(task.updatedAt || task.createdAt)].filter(Boolean).join(' · ');
  main.appendChild(meta);

  const finishedQuietly = task.status === TASK_STATUS.COMPLETED || task.status === TASK_STATUS.CANCELLED;
  const text =
    task.status === TASK_STATUS.QUEUED && queuePosition
      ? t('activity.queuePosition', { position: queuePosition, status: task.statusText })
      : task.error || task.statusText || task.phase;
  if (text && !(finishedQuietly && !task.error)) {
    const status = document.createElement('p');
    status.className = 'task-card-status';
    status.textContent = text;
    // One line; the full text is the tooltip.
    status.title = text;
    main.appendChild(status);
  }

  if (task.progress && !isTerminalTaskStatus(task.status)) {
    const progress = document.createElement('progress');
    progress.max = 100;
    if (task.progress.percent !== null) {
      progress.value = task.progress.percent;
    }
    progress.setAttribute('aria-label', text || badge);
    main.appendChild(progress);
  }

  card.append(createTypeIcon(kind), main, createActions('task-card-actions', buttons));
  return card;
}

function createActions(className, buttons) {
  const actions = document.createElement('div');
  actions.className = className;
  actions.append(...buttons.filter(Boolean));
  return actions;
}

/**
 * A summary or chat task.
 * @param {object} task
 * @param {object} options
 * @param {number} options.queuePosition 1-based, 0 when not queued
 * @param {string} options.forumName
 * @param {boolean} options.isCurrentTopic
 * @param {(task: object) => void} options.onOpen
 * @param {(taskId: string) => void} options.onCancel
 */
export function createTopicTaskCard(task, { queuePosition, forumName, isCurrentTopic, onOpen, onCancel }) {
  const topicTitle = cleanTopicTitle(task.title, forumName);
  const isChat = task.type === TASK_TYPE.CHAT;
  return createTaskCardBase(task, {
    className: `task-card ${task.status}`,
    kind: isChat ? 'chat' : 'summary',
    title: t('activity.taskTitle', { type: isChat ? t('activity.type.chat') : t('activity.type.summary'), title: topicTitle }),
    titleTooltip: topicTitle,
    open: { label: isCurrentTopic ? t('activity.viewSession') : t('activity.openPost'), onClick: () => onOpen(task) },
    badge: statusLabel(task.status),
    queuePosition,
    forumName,
    buttons: [!isTerminalTaskStatus(task.status) && createCancelButton(task, onCancel)]
  });
}

/**
 * An Agent task.
 * @param {object} task
 * @param {object} options
 * @param {number} options.queuePosition
 * @param {object|undefined} options.activity the run's activity record
 * @param {(task: object) => void} options.onOpen
 * @param {(taskId: string) => void} options.onResume
 * @param {(task: object) => void} options.onRetry
 * @param {(taskId: string) => void} options.onCancel
 */
export function createAgentTaskCard(task, { queuePosition = 0, forumName = '', activity, onOpen, onResume, onRetry, onCancel }) {
  const waiting = task.status === TASK_STATUS.WAITING_USER_ACTION;
  const stepCount = activity ? agentStepsOf(activity).length : 0;
  const sourceCount = activity?.sourceRefs?.length || 0;
  const openLabel = waiting
    ? t('common.continue')
    : isTerminalTaskStatus(task.status)
      ? t('activity.viewAnswer')
      : t('activity.viewProgress');
  const open = () => {
    if (waiting) {
      onResume(task.id);
    } else {
      onOpen(task);
    }
  };
  return createTaskCardBase(task, {
    className: `task-card agent ${task.status}`,
    kind: 'agent',
    title: t('activity.agentTitle', { title: task.title || task.question || t('common.askForum') }),
    titleTooltip: task.question || task.title || t('common.askForum'),
    open: { label: openLabel, onClick: open },
    badge: waiting ? t('task.status.waiting_user_action') : statusLabel(task.status),
    queuePosition,
    forumName,
    details: [stepCount && tn('answer.count.step', stepCount), sourceCount && tn('answer.count.source', sourceCount)].filter(Boolean),
    buttons: [
      // Waiting on the user: Continue is the thing to do, so it stays a button too.
      waiting && createButton(openLabel, 'continue-task', open, { icon: 'play', primary: true }),
      (task.status === TASK_STATUS.FAILED || task.status === TASK_STATUS.CANCELLED)
        && createButton(t('common.retry'), 'retry-task', () => onRetry(task), { icon: 'retry' }),
      !isTerminalTaskStatus(task.status) && createCancelButton(task, onCancel)
    ]
  });
}

function createKeepButton({ kept, label, title, disabledTitle, onToggle }) {
  const keepButton = createButton(kept ? t('common.unkeep') : t('common.keep'), 'keep-saved', () => onToggle(keepButton), {
    icon: 'bookmark'
  });
  keepButton.setAttribute('aria-pressed', String(kept === true));
  keepButton.setAttribute('aria-label', t(kept ? 'activity.unkeepAria' : 'activity.keepAria', { label }));
  keepButton.title = title;
  if (disabledTitle) {
    keepButton.disabled = true;
    keepButton.title = disabledTitle;
  }
  return keepButton;
}

// The shell both saved cards share: a type icon, the title with its meta
// line, the actions on the right, and a short excerpt underneath.
function createSavedCardShell({ className, key, kind, titleText, tooltip, open, excerptText, metaParts, buttons }) {
  const card = document.createElement('article');
  card.className = className;
  card.dataset.savedKey = key;

  const title = createCardOpener('h3', { text: titleText, tooltip, className: 'open-saved', ...open });
  const metadata = document.createElement('div');
  metadata.className = 'saved-card-meta';
  metadata.appendChild(createMetadataSpan(metaParts.filter(Boolean).join(' · ')));
  const main = document.createElement('div');
  main.className = 'saved-card-main';
  main.append(title, metadata);

  const top = document.createElement('div');
  top.className = 'saved-card-top';
  top.append(createTypeIcon(kind), main, createActions('saved-card-actions', buttons));

  const excerpt = document.createElement('p');
  excerpt.textContent = excerptText;
  card.append(top, excerpt);
  return card;
}

/**
 * A saved topic session.
 * @param {object} entry topic index entry
 * @param {object} options
 * @param {string} options.forumName
 * @param {boolean} options.isCurrent the topic in the current tab
 * @param {boolean} options.hasActiveTasks the topic still has unfinished tasks
 * @param {(entry: object) => void} options.onOpen
 * @param {(entry: object, button: HTMLButtonElement) => void} options.onKeep
 * @param {(entry: object) => void} options.onDelete
 */
export function createSavedTopicCard(
  entry,
  { forumName, isCurrent, hasActiveTasks, onOpen, onKeep, onDelete, copy = retentionCopy(null) }
) {
  const topicTitle = cleanTopicTitle(entry.title, forumName);

  const deleteButton = createButton(t('common.delete'), 'delete-saved', () => onDelete(entry), { icon: 'trash' });
  deleteButton.setAttribute('aria-label', t('activity.deleteSummaryAria', { title: topicTitle }));
  if (hasActiveTasks) {
    deleteButton.disabled = true;
    deleteButton.title = t('activity.deleteBlocked');
  }

  const keepButton = createKeepButton({
    kept: entry.kept,
    label: t('activity.sessionLabel', { title: topicTitle }),
    title: entry.kept ? copy.unkeepTopic : copy.keepTopic,
    disabledTitle: hasActiveTasks ? t('activity.keepBlocked') : '',
    onToggle: button => onKeep(entry, button)
  });

  const card = createSavedCardShell({
    className: 'saved-card',
    key: savedTopicKey(entry),
    kind: 'summary',
    titleText: topicTitle,
    tooltip: topicTitle,
    open: { label: isCurrent ? t('activity.viewCurrent') : t('activity.openSaved'), onClick: () => onOpen(entry) },
    excerptText: entry.summaryExcerpt || t('activity.savedSummary'),
    metaParts: [
      forumName,
      describeSummarizedReplies(entry),
      entry.historyCount ? tn('activity.chatMessages', entry.historyCount) : '',
      formatRelativeTime(entry.updatedAt)
    ],
    buttons: [keepButton, deleteButton]
  });
  card.classList.toggle('kept', entry.kept === true);
  card.classList.toggle('current', Boolean(isCurrent));
  return card;
}

// Plain-text excerpt of a markdown answer. Inline markers go without a trace
// (Chinese has no spaces to keep); line markers become a space.
export function answerExcerpt(answer, maxLength = 240) {
  return String(answer || '')
    .replace(/[*`~[\]]/g, '')
    .replace(/[#_>]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
    .slice(0, maxLength);
}

/**
 * A saved Agent answer.
 * @param {object} activity
 * @param {object} options
 * @param {(activity: object) => void} options.onOpen
 * @param {(activity: object, button: HTMLButtonElement) => void} options.onKeep
 * @param {(activity: object) => void} options.onDelete
 */
export function createSavedAgentCard(
  activity,
  { onOpen, onKeep, onDelete, forumName = '', now = Date.now(), retention = null, copy = retentionCopy(retention) }
) {
  const keepButton = createKeepButton({
    kept: activity.kept,
    label: t('activity.answerLabel', { title: activity.title }),
    title: activity.kept ? copy.unkeepSavedAnswer : copy.keepSavedAnswer,
    onToggle: button => onKeep(activity, button)
  });

  const deleteButton = createButton(t('common.delete'), 'delete-saved', () => onDelete(activity), { icon: 'trash' });
  deleteButton.setAttribute('aria-label', t('activity.deleteAnswerAria', { title: activity.title }));

  const stepCount = agentStepsOf(activity).length;
  // Recomputed with the current history setting (never the stored copy).
  const expires = formatExpiresIn(agentActivityExpiry(activity, retention ? retention.agentMs : undefined), now);
  const card = createSavedCardShell({
    className: 'saved-card agent-saved-card',
    key: savedAgentKey(activity),
    kind: 'agent',
    titleText: t('activity.agentTitle', { title: activity.title }),
    tooltip: activity.question || activity.title,
    open: { label: t('activity.viewAnswer'), onClick: () => onOpen(activity) },
    excerptText: answerExcerpt(activity.answer) || t('activity.savedAnswer'),
    metaParts: [
      forumName,
      stepCount ? tn('answer.count.step', stepCount) : '',
      tn('answer.count.source', activity.sourceRefs.length),
      formatRelativeTime(activity.completedAt || activity.updatedAt),
      expires
    ],
    buttons: [keepButton, deleteButton]
  });
  card.classList.toggle('kept', activity.kept === true);
  return card;
}
