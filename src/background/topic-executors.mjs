// Executors for topic tasks: summarizing a topic and answering a follow-up
// question about it. Both refresh the topic's posts first (reusing cached
// pages) and save the result on the topic's session.
import { createTopicSession } from '../popup/topic-session.mjs';
import { DiscourseCopilotConstants } from '../shared/constants.js';
import { createForumAccessError } from '../shared/forum-access.mjs';
import { isAbortError } from '../shared/rate-limit-retry.mjs';
import { formatFetchTaskStatus } from './topic-fetcher.mjs';

const { MESSAGES } = DiscourseCopilotConstants;

function pluralPosts(count) {
  return `${count} new ${count === 1 ? 'post' : 'posts'}`;
}

/**
 * @param {object} deps
 * @param {object} deps.aiService AIService
 * @param {object} deps.db topicSessionDatabase
 * @param {(message: object) => void} deps.broadcast
 * @param {(task: object) => Promise<object>} deps.getTaskConfiguration
 * @param {Function} deps.fetchTopicContent from createTopicFetcher()
 * @param {(siteUrl: string) => Promise<boolean>} [deps.hasForumAccess] whether the
 *   user enabled the forum (forum-access.mjs)
 */
export function createTopicExecutors({
  aiService,
  db,
  broadcast,
  getTaskConfiguration,
  fetchTopicContent,
  hasForumAccess = async () => true
}) {
  const broadcastSessionUpdated = task => {
    broadcast({
      action: MESSAGES.SESSION_UPDATED,
      topicId: task.topicId,
      topicKey: task.topicKey
    });
  };

  const streamChunks = task => chunk => {
    broadcast({
      action: MESSAGES.TASK_STREAM,
      taskId: task.id,
      topicId: task.topicId,
      topicKey: task.topicKey,
      type: task.type,
      chunk
    });
  };

  // Re-reads the topic, reporting fetch progress as the task status. The
  // page limit is the one snapshotted when the task was queued. Fails fast
  // with FORUM_ACCESS_NOT_GRANTED when the forum isn't enabled — also when
  // access was removed while the task ran (the browser then refuses the
  // requests, which would otherwise read as a network error).
  const fetchTopic = async (task, session, { signal, report, maxPages }) => {
    if (!(await hasForumAccess(task.siteUrl))) {
      throw createForumAccessError(task.siteUrl);
    }
    try {
      return await fetchTopicContent(
        task.siteUrl,
        task.topicId,
        progress => {
          void report({
            phase: 'fetching',
            statusText: formatFetchTaskStatus(progress),
            progress
          }, { durable: progress.rateLimited === true }).catch(() => {});
        },
        signal,
        {
          cachedPages: session.rawPages,
          knownTotalPosts: session.totalPosts,
          maxPages
        }
      );
    } catch (error) {
      if (!isAbortError(error) && !(await hasForumAccess(task.siteUrl))) {
        throw createForumAccessError(task.siteUrl);
      }
      throw error;
    }
  };

  const withFetchedContent = (session, response, now) => ({
    ...session,
    source: response.content,
    rawPages: response.rawPages,
    pagesFetched: response.pagesFetched,
    totalPosts: response.totalPosts,
    // Whether the page limit cut the read short, and how many posts it covered.
    sourceTruncated: response.truncated === true,
    coveredPosts: response.coveredPosts ?? null,
    lastCheckedAt: now,
    lastAccessedAt: now
  });

  async function executeSummaryTask(task, { signal, report }) {
    const configuration = await getTaskConfiguration(task);
    const maxPages = configuration.limits?.topicPageLimit;
    let session = await db.get(task.topicKey);
    if (!session) {
      session = createTopicSession({
        topicId: task.topicId,
        siteUrl: task.siteUrl,
        url: task.url,
        title: task.title,
        forumName: task.forumName
      });
    } else if (task.forumName && !session.forumName) {
      session.forumName = task.forumName;
    }

    await report({
      phase: 'fetching',
      statusText: session.summary
        ? 'Checking for new replies…'
        : 'Reading forum responses…',
      progress: null
    }, { durable: true });

    const response = await fetchTopic(task, session, { signal, report, maxPages });
    session = {
      ...withFetchedContent(session, response, Date.now()),
      url: task.url || session.url,
      title: task.title || session.title
    };
    await db.save(session);

    // Up to date when nothing new was read: the same post count, or (for a
    // topic past the page limit) the same covered part.
    const summaryAlreadyCurrent = Boolean(
      response.unchanged
      && session.summary
      && session.summaryPostCount
      && (
        session.summaryPostCount === response.totalPosts
        || (response.truncated
          && session.summaryTruncated
          && session.summaryCoveredPosts === response.coveredPosts)
      )
    );
    if (summaryAlreadyCurrent) {
      await report({
        phase: 'saving',
        statusText: response.truncated
          ? `Saved summary already covers the first ${Math.max(0, (response.coveredPosts || 0) - 1)} replies (page limit).`
          : 'Saved summary already includes every reply.',
        progress: { ...response.progress, percent: 100, etaMs: 0 }
      }, { durable: true });
      broadcastSessionUpdated(task);
      return;
    }

    await report({
      phase: 'generating',
      statusText: response.newPosts > 0 && session.summary
        ? `Updating summary with ${pluralPosts(response.newPosts)}…`
        : 'Generating summary…',
      progress: null
    }, { durable: true });

    const summary = await aiService.generateSummary(
      configuration.provider,
      response.content,
      configuration.settings,
      {
        abortSignal: signal,
        onProgress: progress => {
          void report({
            phase: 'generating',
            statusText: progress.message || 'Generating summary…',
            progress: null
          }).catch(() => {});
        },
        onStream: streamChunks(task)
      },
      {
        systemPrompt: configuration.systemPrompt,
        responseLanguage: configuration.responseLanguage,
        forumName: configuration.forumName
      }
    );

    const completedAt = Date.now();
    session.summary = summary;
    session.summaryPostCount = response.totalPosts;
    session.summaryTruncated = response.truncated === true;
    session.summaryCoveredPosts = response.truncated ? (response.coveredPosts ?? null) : null;
    session.summaryPagesRead = response.pagesFetched;
    session.provider = configuration.provider;
    session.model = configuration.settings.model || task.model;
    session.summaryUpdatedAt = completedAt;
    session.updatedAt = completedAt;
    session.lastAccessedAt = completedAt;
    await db.save(session);
    broadcastSessionUpdated(task);
  }

  async function executeChatTask(task, { signal, report }) {
    const configuration = await getTaskConfiguration(task);
    let session = await db.get(task.topicKey);
    if (!session?.summary || !session.source) {
      throw new Error('The saved post and summary are required before chatting');
    }

    const hasMessage = role => session.history.some(
      message => message.taskId === task.id && message.role === role
    );
    // A restarted task whose answer was already saved is done.
    if (hasMessage('assistant')) {
      broadcastSessionUpdated(task);
      return;
    }

    await report({
      phase: 'fetching',
      statusText: 'Checking for new replies before answering…',
      progress: null
    }, { durable: true });
    const response = await fetchTopic(task, session, {
      signal,
      report,
      maxPages: configuration.limits?.topicPageLimit
    });
    session = withFetchedContent(session, response, Date.now());
    await db.save(session);

    const priorHistory = session.history.filter(message => message.taskId !== task.id);
    if (!hasMessage('user')) {
      const queuedAt = Date.now();
      session.history.push({
        role: 'user',
        content: task.question,
        taskId: task.id,
        createdAt: queuedAt
      });
      session.chatUpdatedAt = queuedAt;
      session.updatedAt = queuedAt;
      await db.save(session);
      broadcastSessionUpdated(task);
    }

    await report({
      phase: 'generating',
      statusText: response.newPosts > 0
        ? `Answering with ${pluralPosts(response.newPosts)} included…`
        : 'Answering follow-up question…',
      progress: null
    }, { durable: true });

    const answer = await aiService.streamFollowUp(
      configuration.provider,
      {
        content: session.source,
        summary: session.summary,
        history: priorHistory,
        question: task.question,
        systemPrompt: configuration.systemPrompt,
        responseLanguage: configuration.responseLanguage,
        forumName: configuration.forumName,
        maxPostChars: task.maxPostChars
      },
      configuration.settings,
      {
        abortSignal: signal,
        onProgress: progress => {
          void report({
            phase: 'generating',
            statusText: progress.message || 'Answering follow-up question…'
          }).catch(() => {});
        },
        onStream: streamChunks(task)
      }
    );

    session = await db.get(task.topicKey) || session;
    if (!hasMessage('assistant')) {
      const completedAt = Date.now();
      session.history.push({
        role: 'assistant',
        content: answer,
        taskId: task.id,
        createdAt: completedAt
      });
      session.chatUpdatedAt = completedAt;
      session.updatedAt = completedAt;
      if (task.forumName && !session.forumName) {
        session.forumName = task.forumName;
      }
      await db.save(session);
    }
    broadcastSessionUpdated(task);
  }

  return { executeSummaryTask, executeChatTask };
}
