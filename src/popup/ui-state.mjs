// Pure view logic shared by several side panel views: task lists, summary
// coverage, history-retention copy, the idle status line and relative times.
import { isTerminalTaskStatus } from '../shared/task-record.mjs';
import { t, tn } from '../shared/i18n.mjs';

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
  return tn('coverage.reply', count, { n: count.toLocaleString('en-US') });
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
        text: t('coverage.firstOf', { covered: coveredReplies, total: replies(total) }),
        note: t('coverage.noteReplies', { covered: coveredReplies, total: replies(total) })
      };
    }
    const pages = session.summaryPagesRead || 0;
    return {
      truncated: true,
      text: tn('coverage.firstPages', pages),
      note: tn('coverage.notePages', pages)
    };
  }
  return { truncated: false, text: total ? replies(total) : '', note: '' };
}

export function describeSummarizedReplies(entry = {}) {
  const coverage = describeSummaryCoverage(entry);
  return coverage.text ? t('coverage.summarized', { text: coverage.text }) : t('coverage.unavailable');
}

/**
 * Copy that depends on the history setting (resolveRetention()).
 */
export function retentionCopy(retention) {
  const forever = retention?.forever === true;
  const period = retention?.label || t('settings.history.option.1d');
  const limit = retention?.maxSavedTopics;
  return {
    savedIntro: forever
      ? t('retention.intro.forever', { limit: limit ? t('retention.introLimit', { limit }) : '' })
      : t('retention.intro.timed', { period }),
    keepAnswer: forever ? t('retention.keepAnswer.forever') : t('retention.keepAnswer.timed', { period }),
    unkeepAnswer: forever ? t('retention.unkeepAnswer.forever') : t('retention.unkeepAnswer.timed', { period }),
    keepSavedAnswer: forever ? t('retention.keepSaved.forever') : t('retention.keepSaved.timed', { period }),
    unkeepSavedAnswer: forever ? t('retention.unkeepSaved.forever') : t('retention.unkeepSaved.timed', { period }),
    keepTopic: forever ? t('retention.keepTopic.forever') : t('retention.keepTopic.timed', { period }),
    unkeepTopic: forever ? t('retention.unkeepTopic.forever') : t('retention.unkeepTopic.timed', { period })
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
    return agentPanelShown ? null : { message: t('idle.askForum'), type: 'info' };
  }
  if (!isForumTopic) {
    return { message: t('idle.openTopic'), type: 'info' };
  }
  return null;
}

// Quiet re-renders (settings changes, session reloads) normally leave the
// status line alone, but a change in whether the provider is usable must
// re-derive it, and a "set up your provider" message must not outlive setup.
export function shouldRederiveStatus({ announce = false, settingsValid = false, previousSettingsValid, statusKind = '' } = {}) {
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
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  return t('time.daysAgo', { count: Math.floor(hours / 24) });
}
