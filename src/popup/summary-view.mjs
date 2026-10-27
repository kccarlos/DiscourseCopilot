// The topic's summary card, the reply-reading progress bar, the topic task
// status line, and the summary actions (create/refresh, copy, export).
import { DiscourseCopilotLogger } from '../shared/logger.js';
import { formatEta } from '../shared/fetch-progress.mjs';
import { formatRetryDelay } from '../shared/rate-limit-retry.mjs';
import { TASK_STATUS, TASK_TYPE } from '../shared/task-record.mjs';
import { setPostCopyAvailability, writeClipboardText } from './clipboard.mjs';
import { describeSummaryCoverage, formatRelativeTime } from './ui-state.mjs';
import { forumHostname } from './forum-names.mjs';
import { renderMarkdown } from './markdown.mjs';
import { SUMMARY_CLAMP_VIEWPORT_SHARE, clearClamp, setClamp } from './clamp.mjs';
import { FOCUS_CARD } from './reading-focus.mjs';
import { t } from '../shared/i18n.mjs';

const $ = id => document.getElementById(id);

// A filesystem-friendly hostname for export file names.
export function exportHostLabel(siteUrl) {
  return forumHostname(siteUrl).replace(/[^A-Za-z0-9.-]+/g, '-') || 'forum';
}

export class SummaryView {
  /**
   * @param {object} deps
   * @param {object} deps.state shared panel state (pageContext, session)
   * @param {object} deps.tasks TaskRegistry
   * @param {object} deps.config ConfigStore
   * @param {object} deps.status StatusLine
   * @param {object} deps.markdown MarkdownScheduler
   * @param {object} deps.operations OperationTracker
   * @param {Map<string, string>} deps.streams streamed text per topic task ID
   * @param {object} deps.hooks updateControls, beginOperation, promptSetup,
   *   dismissSetupSuccess, markBackgroundUnavailable, handleBackgroundError,
   *   reloadCurrentSession, loadPostSource
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
  }

  mount() {
    $('summarizeBtn').addEventListener('click', () => {
      this.summarize();
    });
    $('copyPostBtn').addEventListener('click', () => {
      this.copyPost();
    });
    $('copyBtn').addEventListener('click', () => {
      this.copySummary();
    });
    $('exportBtn').addEventListener('click', () => {
      this.exportSummary();
    });
  }

  // ---------- Summary card ----------

  setPostContent(content, { updateSession = true } = {}) {
    const normalized = setPostCopyAvailability($('copyPostBtn'), content);
    if (updateSession && this.state.session) {
      this.state.session.source = normalized;
    }
    this.hooks.updateControls();
  }

  setSummary(summary, { updateSession = true } = {}) {
    const normalized = typeof summary === 'string' ? summary : '';
    if (updateSession && this.state.session) {
      this.state.session.summary = normalized;
    }

    const container = $('summaryContainer');
    const welcomePanel = $('welcomePanel');
    if (!normalized) {
      container.classList.add('hidden');
      welcomePanel.classList.remove('hidden');
      clearClamp($('summaryDisplay'));
      $('summaryDisplay').innerHTML = '<p>Your summary will appear here…</p>';
      $('chatContainer').classList.add('hidden');
    } else {
      const wasHidden = container.classList.contains('hidden');
      container.classList.remove('hidden');
      welcomePanel.classList.add('hidden');
      if (wasHidden) {
        container.open = true;
      }
      renderMarkdown($('summaryDisplay'), normalized);
      this.clampSummary(true);
      $('chatContainer').classList.remove('hidden');
    }
    this.updateMeta();
    this.hooks.updateControls();
  }

  // A summary taller than about 60% of the panel is cut off with a Show all
  // button; never while it is being written.
  clampSummary(enabled) {
    setClamp($('summaryDisplay'), { enabled, limit: () => window.innerHeight * SUMMARY_CLAMP_VIEWPORT_SHARE });
  }

  updateMeta() {
    const metadata = $('summaryMeta');
    const session = this.state.session;
    if (!session?.summary) {
      metadata.textContent = t('summary.metaEmpty');
      return;
    }
    const details = [];
    const coverage = describeSummaryCoverage(session);
    if (coverage.text) {
      details.push(coverage.text);
    }
    if (session.summaryUpdatedAt) {
      details.push(t('summary.savedAgo', { time: formatRelativeTime(session.summaryUpdatedAt) }));
    }
    metadata.textContent = details.join(' · ') || t('summary.metaSaved');
    // Say plainly when the page limit cut the topic short.
    metadata.title = coverage.note;
    const note = $('summaryCoverageNote');
    if (note) {
      note.textContent = coverage.note;
      note.classList.toggle('hidden', !coverage.truncated);
    }
  }

  // Opens the summary card for a summary being written.
  // A card the user folded, or moved away from, stays as they left it.
  revealSummaryCard() {
    const summaryContainer = $('summaryContainer');
    const wasHidden = summaryContainer.classList.contains('hidden');
    summaryContainer.classList.remove('hidden');
    if (wasHidden || this.hooks.readingMayExpand?.(FOCUS_CARD.SUMMARY)) {
      summaryContainer.open = true;
    }
    $('welcomePanel').classList.add('hidden');
  }

  renderStream(content) {
    this.revealSummaryCard();
    this.clampSummary(false);
    this.markdown.schedule($('summaryDisplay'), content);
  }

  // ---------- Reply-reading progress ----------

  startFetchProgress() {
    $('fetchProgress').classList.remove('hidden');
    $('fetchProgressBar').removeAttribute('value');
    $('fetchProgressLabel').textContent = t('summary.readingResponses');
    $('fetchProgressEta').textContent = t('fetchProgress.calculating');
  }

  updateFetchProgress(progress) {
    const progressBar = $('fetchProgressBar');
    const label = $('fetchProgressLabel');

    if (progress.rateLimited) {
      if (progress.percent === null) {
        progressBar.removeAttribute('value');
      } else {
        progressBar.value = progress.percent;
      }
      label.textContent = t(progress.retryPage ? 'summary.slowDownPage' : 'summary.slowDown', { page: progress.retryPage });
      $('fetchProgressEta').textContent = t('summary.retryingIn', { delay: formatRetryDelay(progress.retryAfterMs) });
      return;
    }

    if (progress.percent === null) {
      progressBar.removeAttribute('value');
      label.textContent = t('summary.readingPage', { page: progress.currentPage });
    } else {
      progressBar.value = progress.percent;
      const totalResponses = Math.max(0, progress.totalPosts - 1);
      const processedResponses = Math.max(0, progress.processedPosts - 1);
      label.textContent = t('summary.readingProgress', { done: processedResponses, total: totalResponses });
    }
    $('fetchProgressEta').textContent = formatEta(progress.etaMs);
  }

  hideFetchProgress() {
    $('fetchProgress').classList.add('hidden');
  }

  // ---------- Topic task state ----------

  // Shows where a summary or chat task on the current topic stands.
  renderTaskState(task) {
    if (task.status === TASK_STATUS.QUEUED) {
      this.hideFetchProgress();
      this.status.show(t('task.queued'), 'info');
      return;
    }
    if (task.status === TASK_STATUS.FAILED) {
      this.hideFetchProgress();
      this.streams.delete(task.id);
      this.status.show(t('task.failedWith', { error: task.error || t('task.unknownError') }), 'error');
      return;
    }
    if (task.status === TASK_STATUS.CANCELLED) {
      this.hideFetchProgress();
      this.streams.delete(task.id);
      this.status.show(t('task.cancelledStatus'), 'warning');
      return;
    }
    if (task.status === TASK_STATUS.COMPLETED) {
      this.streams.delete(task.id);
      void this.hooks.reloadCurrentSession();
      this.hooks.readingFinish?.(task.type === TASK_TYPE.CHAT ? FOCUS_CARD.CHAT : FOCUS_CARD.SUMMARY);
      // #status is a polite live region: this is the one completion announcement.
      this.status.show(task.type === TASK_TYPE.CHAT ? t('task.answerReady') : t('task.summaryReady'), 'success');
      return;
    }

    if (task.phase === 'fetching') {
      $('fetchProgress').classList.remove('hidden');
      if (task.progress) {
        this.updateFetchProgress(task.progress);
      } else {
        this.startFetchProgress();
      }
      this.status.hide();
      return;
    }
    if (task.phase === 'generating' && task.type === TASK_TYPE.SUMMARY) {
      this.revealSummaryCard();
      if (!this.state.session?.source) {
        void this.hooks.loadPostSource?.();
      }
      if (!this.state.session?.summary && !this.streams.get(task.id)) {
        $('summaryDisplay').innerHTML = `<p class="streaming-placeholder">${t('summary.waitingAi')}</p>`;
      }
      this.status.show(t('summary.aiCreating'), 'loading');
      return;
    }
    if (task.phase === 'generating' && task.type === TASK_TYPE.CHAT) {
      this.status.show(t('summary.aiPreparing'), 'loading');
      return;
    }
    this.status.show(task.statusText || t('task.working'), 'loading');
  }

  // ---------- Actions ----------

  async summarize() {
    if (!this.config.isReady()) {
      this.hooks.promptSetup();
      return;
    }
    this.hooks.dismissSetupSuccess();

    const operation = this.hooks.beginOperation('summary');
    if (!operation) {
      return;
    }
    const isStillOnPage = () => operation.pageKey === this.state.pageContext?.pageKey;

    try {
      this.status.show(t('summary.submitting'), 'loading');
      const session = this.state.session;
      const task = await this.tasks.enqueue(
        {
          taskType: TASK_TYPE.SUMMARY,
          topicId: operation.postId,
          siteUrl: operation.siteUrl,
          siteType: operation.siteType,
          topicKey: operation.topicKey,
          title: session?.title || this.state.pageContext.title,
          url: session?.url || this.state.pageContext.url,
          forumName: operation.forumName,
          provider: operation.provider,
          settings: operation.settings,
          systemPrompt: operation.systemPrompt,
          responseLanguage: operation.responseLanguage
        },
        t('summary.queueFailed')
      );
      if (!task) {
        this.hooks.markBackgroundUnavailable();
        return;
      }
      if (isStillOnPage()) {
        this.hooks.readingStart?.(FOCUS_CARD.SUMMARY);
        this.renderTaskState(task);
      }
    } catch (error) {
      if (this.hooks.handleBackgroundError(error)) {
        return;
      }
      DiscourseCopilotLogger.error('Popup: Error queueing summary:', error);
      if (isStillOnPage()) {
        this.hideFetchProgress();
        this.status.show(t('common.errorWith', { error: error.message }), 'error');
      }
    } finally {
      this.operations.finish(operation);
    }
  }

  async copyPost() {
    if (!this.state.session?.source) {
      this.status.show(t('summary.postUnavailable'), 'warning');
      return;
    }
    await this.copyText(this.state.session.source, t('summary.postCopied'));
  }

  async copySummary() {
    if (!this.state.session?.summary) {
      return;
    }
    await this.copyText(this.state.session.summary, t('summary.summaryCopied'));
  }

  async copyText(text, successMessage) {
    try {
      await writeClipboardText(text);
      this.status.show(successMessage, 'success');
    } catch (error) {
      DiscourseCopilotLogger.error('Popup: Clipboard error:', error);
      this.status.show(t('summary.copyFailed', { error: error.message }), 'error');
    }
  }

  exportSummary() {
    const { session, pageContext } = this.state;
    if (!session?.summary) {
      return;
    }
    const blob = new Blob([session.summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `forumind-${exportHostLabel(pageContext?.siteUrl || session.siteUrl)}-${pageContext.postId}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
