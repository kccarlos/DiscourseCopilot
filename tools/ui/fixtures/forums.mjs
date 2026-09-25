// Forums and record builders shared by the screenshot fixtures. The forums
// are real public Discourse sites; every topic, post and username in the
// fixtures is invented.
//
// Timestamps are relative to the time of the run, so labels like
// "12 min ago" or "expires in 23h" come out the same on every run.

export const now = Date.now();
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;

export const META = { siteUrl: 'https://meta.discourse.org', host: 'meta.discourse.org', name: 'Discourse Meta' };
export const OPENAI = { siteUrl: 'https://community.openai.com', host: 'community.openai.com', name: 'OpenAI Developer Community' };

// What the content script reports for a topic page.
export function pageStateFor(forum, topicId, slug) {
  const url = `${forum.siteUrl}/t/${slug}/${topicId}`;
  return {
    url,
    isDiscourse: true,
    isForumPage: true,
    isForumTopic: true,
    postId: String(topicId),
    topicId: String(topicId),
    siteUrl: forum.siteUrl,
    basePath: '',
    forumName: forum.name,
    topicKey: `${forum.host}/t/${topicId}`
  };
}

// chrome.* stub options for a panel open on an enabled forum's topic.
export function onTopic(forum, { topicId, slug }, tabTitle) {
  const pageState = pageStateFor(forum, topicId, slug);
  return { granted: [`${forum.siteUrl}/*`], tabUrl: pageState.url, tabTitle, pageState };
}

// A saved topic session (IndexedDB topicSessions record).
export function session(
  forum,
  {
    topicId,
    slug,
    title,
    summary,
    history = [],
    totalPosts,
    truncated = false,
    coveredPosts = null,
    pages = 1,
    ageMin = 12,
    kept = false,
    provider = 'anthropic',
    model = 'claude-sonnet-5'
  }
) {
  const t = now - ageMin * MIN;
  return {
    topicId: String(topicId),
    siteUrl: forum.siteUrl,
    topicKey: `${forum.host}/t/${topicId}`,
    url: `${forum.siteUrl}/t/${slug}/${topicId}`,
    title,
    forumName: forum.name,
    source: 'Post 1\n\nPost 2',
    rawPages: [{ page: 1, content: 'Post 1\n\nPost 2' }],
    summary,
    history,
    kept,
    totalPosts,
    summaryPostCount: totalPosts,
    sourceTruncated: truncated,
    coveredPosts,
    summaryTruncated: truncated,
    summaryCoveredPosts: coveredPosts,
    summaryPagesRead: pages,
    pagesFetched: pages,
    provider,
    model,
    createdAt: t - 5 * MIN,
    updatedAt: t,
    summaryUpdatedAt: t,
    chatUpdatedAt: history.length ? t : 0,
    lastCheckedAt: t,
    lastAccessedAt: t
  };
}

// The topicIndex record the background writes next to a session.
export function indexEntry(s) {
  return {
    topicKey: s.topicKey,
    topicId: s.topicId,
    siteUrl: s.siteUrl,
    url: s.url,
    title: s.title,
    forumName: s.forumName,
    hasSummary: true,
    kept: s.kept,
    summaryExcerpt: s.summary.replace(/[#*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180),
    totalPosts: s.totalPosts,
    summaryPostCount: s.summaryPostCount,
    summaryTruncated: s.summaryTruncated,
    summaryCoveredPosts: s.summaryCoveredPosts,
    summaryPagesRead: s.summaryPagesRead,
    historyCount: s.history.length,
    provider: s.provider,
    model: s.model,
    updatedAt: s.updatedAt,
    summaryUpdatedAt: s.summaryUpdatedAt,
    chatUpdatedAt: s.chatUpdatedAt,
    lastAccessedAt: s.lastAccessedAt
  };
}

// Sessions plus their index entries, ready for seedHistory().
export function history({ sessions = [], activities = [] }) {
  return { sessions, entries: sessions.map(indexEntry), activities };
}

export const chat = (role, content, minsAgo) => ({ role, content, taskId: `c-${minsAgo}`, createdAt: now - minsAgo * MIN });

// A finished Agent run (IndexedDB agentActivities record) on the OpenAI forum.
export function agentAnswer({ id, question, searchQueries, sources, answer }) {
  return {
    schemaVersion: 1,
    activityId: `run-${id}`,
    activityType: 'agent',
    taskId: `agent-${id}`,
    agentRunId: `run-${id}`,
    title: question,
    question,
    siteUrl: OPENAI.siteUrl,
    forumName: OPENAI.name,
    searchQueries,
    toolCalls: [],
    sourceRefs: sources.map((s, i) => ({
      sourceId: `S${i + 1}`,
      topicId: s.topicId,
      postId: s.postId,
      retrievedAt: now - 20 * MIN,
      title: s.title,
      url: `${OPENAI.siteUrl}/t/${s.slug}/${s.topicId}/${s.postNumber}`,
      postNumber: s.postNumber,
      excerpt: s.excerpt,
      siteUrl: OPENAI.siteUrl
    })),
    answer,
    answerStatus: 'answered',
    status: 'completed',
    phase: 'completed',
    statusText: 'Completed',
    progress: { percent: 100 },
    error: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    createdAt: now - 21 * MIN,
    updatedAt: now - 20 * MIN,
    startedAt: now - 21 * MIN,
    completedAt: now - 20 * MIN,
    expiresAt: now + 23 * HOUR,
    kept: false,
    retryOf: '',
    lastOpenedAt: 0,
    dismissedAt: 0
  };
}

// The Agent question used in the README and store images, with its sources.
export const RATE_LIMIT_QUESTION = 'How are people handling rate limits during streaming?';
export const RATE_LIMIT_QUERIES = [
  { query: 'streaming rate limit 429', resultCount: 6 },
  { query: 'Retry-After backoff streaming', resultCount: 4 },
  { query: 'batch tool calls rate limit', resultCount: 3 }
];
export const RATE_LIMIT_SOURCES = [
  {
    topicId: 1088142,
    postId: 10881424,
    postNumber: 4,
    slug: 'rate-limit-errors-only-during-streamed-tool-calls',
    title: 'Rate limit errors only during streamed tool calls',
    excerpt: 'We started seeing 429s when a tool call happened mid-stream and the client retried immediately…'
  },
  {
    topicId: 1071920,
    postId: 10719201,
    postNumber: 1,
    slug: 'guide-exponential-backoff-with-retry-after',
    title: 'Guide: exponential backoff with Retry-After',
    excerpt: 'Rather than a fixed one-second delay, read the Retry-After header and back off from that value…'
  },
  {
    topicId: 1080655,
    postId: 10806559,
    postNumber: 9,
    slug: 'batching-several-tool-calls-in-one-turn',
    title: 'Batching several tool calls in one turn',
    excerpt: 'Each call still counts toward the same per-minute budget, so batching cut our error rate a lot…'
  },
  {
    topicId: 1064310,
    postId: 10643102,
    postNumber: 2,
    slug: 'how-to-request-a-higher-rate-limit',
    title: 'How to request a higher rate limit',
    excerpt: 'Once your usage is steady for a couple of weeks, asking for an increase is the better long-term fix…'
  }
];

export const STREAMING_TOPIC = {
  topicId: 1093417,
  slug: 'streaming-function-calls-with-the-responses-api',
  title: 'Streaming function calls with the Responses API'
};
export const LONG_THREADS_TOPIC = {
  topicId: 1079884,
  slug: 'best-practices-for-long-running-assistant-threads',
  title: 'Best practices for long-running assistant threads'
};

// Configured providers.
export const FAVORITES = [
  { provider: 'anthropic', model: 'claude-sonnet-5' },
  { provider: 'openai', model: 'gpt-4o-mini' }
];
export const ANTHROPIC_STORE = {
  selectedProvider: 'anthropic',
  anthropicApiKey: 'sk-ant-demo',
  anthropicModel: 'claude-sonnet-5',
  openaiApiKey: 'sk-demo',
  openaiModel: 'gpt-4o-mini',
  favoriteModels: FAVORITES
};
export const OPENAI_STORE = { selectedProvider: 'openai', openaiApiKey: 'sk-demo', openaiModel: 'gpt-4o-mini' };
