// Pure view logic shared by several side panel views: task lists, summary
// coverage, history-retention copy, the idle status line and relative times.
import { isTerminalTaskStatus } from '../shared/task-record.mjs';

export function partitionTasks(tasks = []) {
  const sorted = [...tasks].sort((left, right) => {
    const leftTerminal = isTerminalTaskStatus(left.status) ? 1 : 0;
    const rightTerminal = isTerminalTaskStatus(right.status) ? 1 : 0;
    return leftTerminal - rightTerminal || Number(right.createdAt || 0) - Number(left.createdAt || 0);
  });

  return {
    active: sorted.filter(task => !isTerminalTaskStatus(task.status)),
    recent: sorted.filter(task => isTerminalTaskStatus(task.status))
  };
}

function replies(posts) {
  const count = Math.max(0, posts - 1);
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'reply' : 'replies'}`;
}

/**
 * What a saved summary covers, honest about the page limit: a topic longer
 * than the limit was summarized from its first pages only. A topic of unknown
 * size may have hit the built-in safety cap instead of the user's limit, so
 * its note gives no settings advice.
 * @returns {{ text: string, truncated: boolean, note: string }}
 */
export function describeSummaryCoverage(session = {}) {
  const total = session.summaryPostCount ?? session.totalPosts ?? null;
  if (session.summaryTruncated) {
    const covered = session.summaryCoveredPosts;
    if (covered && total) {
      const coveredReplies = Math.max(0, covered - 1).toLocaleString('en-US');
      return {
        truncated: true,
        text: `first ${coveredReplies} of ${replies(total)}`,
        note: `Page limit reached: summarized from the first ${coveredReplies} of ${replies(total)}. To include more, choose “Read every page” (or a higher limit) under “Pages read per topic” in Settings.`
      };
    }
    const pages = session.summaryPagesRead || 0;
    return {
      truncated: true,
      text: `first ${pages} ${pages === 1 ? 'page' : 'pages'} of replies`,
      note: `Page limit reached: summarized from the first ${pages} ${pages === 1 ? 'page' : 'pages'} of replies; the topic may be longer.`
    };
  }
  return { truncated: false, text: total ? replies(total) : '', note: '' };
}

export function describeSummarizedReplies(entry = {}) {
  const coverage = describeSummaryCoverage(entry);
  return coverage.text ? `${coverage.text} summarized` : 'Reply count unavailable';
}

/**
 * Copy that depends on the history setting (resolveRetention()).
 */
export function retentionCopy(retention) {
  const forever = retention?.forever === true;
  const period = retention?.label || '1 day';
  const limit = retention?.maxSavedTopics;
  return {
    savedIntro: forever
      ? `Conversations and Agent answers are kept until you delete them${limit ? `; past ${limit} saved topics the oldest unkept ones are removed` : ''}. Keep one to protect it.`
      : `Conversations and Agent answers expire after ${period}. Keep one to preserve it.`,
    keepAnswer: forever
      ? 'Keep this answer in Saved'
      : `Keep this answer in Saved beyond ${period}`,
    unkeepAnswer: forever
      ? 'Kept in Saved. Select to unkeep it.'
      : `Kept in Saved. Select to let it expire after ${period}.`,
    keepSavedAnswer: forever
      ? 'Keep this answer'
      : `Keep this answer beyond ${period}`,
    unkeepSavedAnswer: forever
      ? 'Unkeep this answer'
      : `Let this answer expire ${period} from now`,
    keepTopic: forever
      ? 'Keep this summary and conversation'
      : `Keep this summary and conversation beyond ${period}`,
    unkeepTopic: forever
      ? 'Unkeep this summary and conversation'
      : `Resume the ${period} conversation expiry`
  };
}

// The status line shown when nothing is running. While setup is needed the
// setup card is the call to action, and off a readable topic the page
// guidance (page-guidance.mjs) says what to do, so no status competes.
export function resolveIdleStatus({
  isForumTopic = false,
  isDiscourse = false,
  needsSetup = false,
  accessPending = false,
  guidanceShown = false,
  agentPanelShown = false
} = {}) {
  if (needsSetup || accessPending || guidanceShown) {
    return null;
  }
  if (!isForumTopic && isDiscourse) {
    return agentPanelShown
      ? null
      : { message: 'Ask the forum to search across discussions', type: 'info' };
  }
  if (!isForumTopic) {
    return { message: 'Open a Discourse forum topic to get started', type: 'info' };
  }
  return null;
}

// Quiet re-renders (settings changes, session reloads) normally leave the
// status line alone, but a change in whether the provider is usable must
// re-derive it, and a "set up your provider" message must not outlive setup.
export function shouldRederiveStatus({
  announce = false,
  settingsValid = false,
  previousSettingsValid,
  statusKind = ''
} = {}) {
  if (announce) {
    return true;
  }
  if (previousSettingsValid !== undefined && previousSettingsValid !== settingsValid) {
    return true;
  }
  return statusKind === 'setup' && settingsValid;
}

// "just now", "5m ago", "3h ago", "2d ago".
export function formatRelativeTime(timestamp, now = Date.now()) {
  const elapsed = Math.max(0, now - Number(timestamp || 0));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
