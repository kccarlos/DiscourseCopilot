// Cards on the Activity screen: tasks (Tasks tab) and saved items (Saved
// tab). Pure DOM builders; every action goes through a callback.
import { TASK_STATUS, TASK_TYPE, isTerminalTaskStatus } from '../shared/task-record.mjs';
import { agentActivityExpiry } from '../shared/agent-activity.mjs';
import { formatExpiresIn } from '../shared/preferences.mjs';
import { describeSummarizedReplies, formatRelativeTime, retentionCopy } from './ui-state.mjs';
import { cleanTopicTitle } from './forum-names.mjs';

// data-saved-key of a saved card (focus after a delete, tests).
export const savedTopicKey = entry => `topic:${entry.topicKey}`;
export const savedAgentKey = activity => `agent:${activity.activityId}`;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createMetadataSpan(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function createCancelButton(task, onCancel) {
  const cancel = createButton(
    task.phase === 'cancelling' ? 'Stopping…' : 'Stop task',
    'outline secondary',
    () => onCancel(task.id)
  );
  cancel.disabled = task.phase === 'cancelling';
  return cancel;
}

// Header, status line and progress bar shared by every task card.
function createTaskCardBase(task, { className, title, titleTooltip, badge, queuePosition }) {
  const card = document.createElement('article');
  card.className = className;

  const header = document.createElement('div');
  header.className = 'task-card-header';
  const heading = document.createElement('h4');
  heading.textContent = title;
  heading.title = titleTooltip;
  const badgeElement = document.createElement('span');
  badgeElement.className = 'task-badge';
  badgeElement.textContent = badge;
  header.append(heading, badgeElement);
  card.appendChild(header);

  const status = document.createElement('p');
  status.className = 'task-card-status';
  status.textContent = task.status === TASK_STATUS.QUEUED && queuePosition
    ? `Queue position ${queuePosition} · ${task.statusText}`
    : task.error || task.statusText || task.phase;
  card.appendChild(status);

  if (task.progress && !isTerminalTaskStatus(task.status)) {
    const progress = document.createElement('progress');
    progress.max = 100;
    if (task.progress.percent !== null) {
      progress.value = task.progress.percent;
    }
    progress.setAttribute('aria-label', status.textContent);
    card.appendChild(progress);
  }
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
  const card = createTaskCardBase(task, {
    className: `task-card ${task.status}`,
    title: `${task.type === TASK_TYPE.CHAT ? 'Chat' : 'Summary'} · ${topicTitle}`,
    titleTooltip: topicTitle,
    badge: task.status,
    queuePosition
  });
  card.appendChild(createActions('task-card-actions', [
    createButton(isCurrentTopic ? 'View session' : 'Open post', 'outline secondary', () => onOpen(task)),
    !isTerminalTaskStatus(task.status) && createCancelButton(task, onCancel)
  ]));
  return card;
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
export function createAgentTaskCard(task, { queuePosition = 0, activity, onOpen, onResume, onRetry, onCancel }) {
  const waiting = task.status === TASK_STATUS.WAITING_USER_ACTION;
  const card = createTaskCardBase(task, {
    className: `task-card agent ${task.status}`,
    title: `Agent · ${task.title || task.question || 'Ask the forum'}`,
    titleTooltip: task.question || task.title || 'Ask the forum',
    badge: waiting ? 'needs action' : task.status,
    queuePosition
  });

  if (activity?.sourceRefs?.length || activity?.answerStatus === 'no_results') {
    const meta = document.createElement('small');
    meta.className = 'task-card-status';
    meta.textContent = activity.answerStatus === 'no_results'
      ? 'No matching sources'
      : plural(activity.sourceRefs.length, 'source');
    card.appendChild(meta);
  }

  const openLabel = waiting
    ? 'Continue'
    : isTerminalTaskStatus(task.status)
      ? 'View answer'
      : 'View progress';
  card.appendChild(createActions('task-card-actions', [
    createButton(openLabel, 'outline secondary', () => {
      if (waiting) {
        onResume(task.id);
      } else {
        onOpen(task);
      }
    }),
    (task.status === TASK_STATUS.FAILED || task.status === TASK_STATUS.CANCELLED)
      && createButton('Retry', 'outline secondary', () => onRetry(task)),
    !isTerminalTaskStatus(task.status) && createCancelButton(task, onCancel)
  ]));
  return card;
}

function createKeepButton({ kept, label, title, disabledTitle, onToggle }) {
  const keepButton = createButton(kept ? 'Unkeep' : 'Keep', 'outline secondary keep-saved', () => onToggle(keepButton));
  keepButton.setAttribute('aria-pressed', String(kept === true));
  keepButton.setAttribute('aria-label', `${kept ? 'Unkeep' : 'Keep'} ${label}`);
  keepButton.title = title;
  if (disabledTitle) {
    keepButton.disabled = true;
    keepButton.title = disabledTitle;
  }
  return keepButton;
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
export function createSavedTopicCard(entry, {
  forumName,
  isCurrent,
  hasActiveTasks,
  onOpen,
  onKeep,
  onDelete,
  copy = retentionCopy(null)
}) {
  const card = document.createElement('article');
  card.className = 'saved-card';
  card.dataset.savedKey = savedTopicKey(entry);
  card.classList.toggle('kept', entry.kept === true);
  if (isCurrent) {
    card.classList.add('current');
  }

  const topicTitle = cleanTopicTitle(entry.title, forumName);
  const title = document.createElement('h3');
  title.textContent = topicTitle;
  title.title = topicTitle;
  card.appendChild(title);

  const excerpt = document.createElement('p');
  excerpt.textContent = entry.summaryExcerpt || 'Saved summary';
  card.appendChild(excerpt);

  const metadata = document.createElement('div');
  metadata.className = 'saved-card-meta';
  metadata.append(
    createMetadataSpan(describeSummarizedReplies(entry)),
    createMetadataSpan(`${entry.historyCount} chat messages`),
    createMetadataSpan(formatRelativeTime(entry.updatedAt))
  );
  card.appendChild(metadata);

  const openButton = createButton(
    isCurrent ? 'View current session' : 'Open saved session',
    'open-saved',
    () => onOpen(entry)
  );

  const deleteButton = createButton('Delete', 'outline secondary delete-saved', () => onDelete(entry));
  deleteButton.setAttribute('aria-label', `Delete saved summary for ${topicTitle}`);
  if (hasActiveTasks) {
    deleteButton.disabled = true;
    deleteButton.title = 'Terminate this topic’s tasks before deleting its saved session';
  }

  const keepButton = createKeepButton({
    kept: entry.kept,
    label: `saved session for ${topicTitle}`,
    title: entry.kept ? copy.unkeepTopic : copy.keepTopic,
    disabledTitle: hasActiveTasks
      ? 'Wait for this topic’s tasks to finish before changing retention'
      : '',
    onToggle: button => onKeep(entry, button)
  });

  card.appendChild(createActions('saved-card-actions', [openButton, keepButton, deleteButton]));
  return card;
}

// Plain-text excerpt of a markdown answer.
export function answerExcerpt(answer, maxLength = 240) {
  return String(answer || '')
    .replace(/[#*_>`~[\]]/g, ' ')
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
export function createSavedAgentCard(activity, {
  onOpen,
  onKeep,
  onDelete,
  now = Date.now(),
  retention = null,
  copy = retentionCopy(retention)
}) {
  const card = document.createElement('article');
  card.className = 'saved-card agent-saved-card';
  card.dataset.savedKey = savedAgentKey(activity);
  card.classList.toggle('kept', activity.kept === true);

  const title = document.createElement('h3');
  title.textContent = `Agent · ${activity.title}`;
  title.title = activity.question || activity.title;
  card.appendChild(title);

  const excerpt = document.createElement('p');
  excerpt.textContent = activity.answerStatus === 'no_results'
    ? 'No matching discussions were found.'
    : answerExcerpt(activity.answer) || 'Saved Agent answer';
  card.appendChild(excerpt);

  const metadata = document.createElement('div');
  metadata.className = 'saved-card-meta';
  metadata.append(
    createMetadataSpan(plural(activity.sourceRefs.length, 'source')),
    createMetadataSpan(formatRelativeTime(activity.completedAt || activity.updatedAt))
  );
  // Recomputed with the current history setting (never the stored copy).
  const expires = formatExpiresIn(
    agentActivityExpiry(activity, retention ? retention.agentMs : undefined),
    now
  );
  if (expires) {
    metadata.appendChild(createMetadataSpan(expires));
  }
  card.appendChild(metadata);

  const keepButton = createKeepButton({
    kept: activity.kept,
    label: `Agent answer for ${activity.title}`,
    title: activity.kept ? copy.unkeepSavedAnswer : copy.keepSavedAnswer,
    onToggle: button => onKeep(activity, button)
  });

  const deleteButton = createButton('Delete', 'outline secondary delete-saved', () => onDelete(activity));
  deleteButton.setAttribute('aria-label', `Delete Agent answer for ${activity.title}`);
  card.appendChild(createActions('saved-card-actions', [
    createButton('View answer', 'open-saved', () => onOpen(activity)),
    keepButton,
    deleteButton
  ]));
  return card;
}
