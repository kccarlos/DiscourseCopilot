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

// One agent step as stored on an activity. `spec` is { tool, args, title,
// resultCount, reason, detail, status, topicId, sourceId }.
export function agentStep(spec, index, { startedAt = now - 20 * MIN, turn = 0 } = {}) {
  const step = {
    id: `step-${index + 1}`,
    turn,
    tool: spec.tool,
    args: spec.args || {},
    reason: spec.reason || '',
    status: spec.status || 'completed',
    detail: spec.detail || '',
    title: spec.title || '',
    resultCount: spec.resultCount ?? null,
    error: spec.error || '',
    startedAt: startedAt + index * 4000,
    completedAt: spec.status === 'running' ? 0 : startedAt + index * 4000 + 3000
  };
  if (spec.topicId) step.topicId = String(spec.topicId);
  if (spec.sourceId) step.sourceId = spec.sourceId;
  return step;
}

// An Agent run (IndexedDB agentActivities record) on the OpenAI forum:
// finished by default, or in any other state through the overrides.
export function agentActivity({
  id,
  question,
  steps = [],
  sources = [],
  answer = '',
  status = 'completed',
  siteUrl = OPENAI.siteUrl,
  forumName = OPENAI.name,
  followUps = [],
  budget = { maxSteps: 15, maxTopicReads: 8, maxCharsPerRead: 30000 },
  ...overrides
}) {
  const startedAt = now - 21 * MIN;
  const finished = status === 'completed';
  const turns = [{ id: `agent-${id}`, question, answer, startedAt, completedAt: answer ? now - 20 * MIN : 0 }];
  followUps.forEach((followUp, index) => {
    turns.push({
      id: `agent-${id}-f${index + 1}`,
      question: followUp.question,
      answer: followUp.answer || '',
      startedAt: now - 10 * MIN,
      completedAt: followUp.answer ? now - 8 * MIN : 0
    });
  });
  const allSteps = [
    ...steps.map((spec, index) => agentStep(spec, index, { startedAt })),
    ...followUps.flatMap((followUp, turn) =>
      (followUp.steps || []).map((spec, index) => agentStep(spec, steps.length + index, { startedAt: now - 10 * MIN, turn: turn + 1 }))
    )
  ];
  const lastTurn = turns.at(-1);
  return {
    schemaVersion: 2,
    activityId: `run-${id}`,
    activityType: 'agent',
    taskId: lastTurn.id,
    agentRunId: `run-${id}`,
    title: question,
    question,
    siteUrl,
    forumName,
    steps: allSteps,
    transcript: [],
    turns,
    budget,
    searchQueries: [],
    toolCalls: [],
    sourceRefs: sources.map((source, index) => ({
      sourceId: `S${index + 1}`,
      topicId: source.topicId,
      postId: source.postId,
      retrievedAt: now - 20 * MIN,
      title: source.title,
      url: `${siteUrl}/t/${source.slug}/${source.topicId}${source.postNumber ? `/${source.postNumber}` : ''}`,
      postNumber: source.postNumber,
      excerpt: source.excerpt,
      evidenceType: 'topic',
      siteUrl
    })),
    answer: followUps.at(-1)?.answer || answer,
    answerStatus: answer ? 'answered' : 'pending',
    status,
    phase: finished ? 'completed' : 'running_tool',
    statusText: finished ? 'Completed' : 'Working…',
    progress: {
      percent: finished ? 100 : 40,
      completedSteps: allSteps.length,
      totalSteps: budget?.maxSteps ?? null,
      sourceCount: sources.length
    },
    error: null,
    provider: 'openai',
    model: 'gpt-4o-mini',
    createdAt: now - 21 * MIN,
    updatedAt: now - 20 * MIN,
    startedAt,
    completedAt: finished ? lastTurn.completedAt : 0,
    expiresAt: finished ? now + 23 * HOUR : 0,
    kept: false,
    retryOf: '',
    lastOpenedAt: 0,
    dismissedAt: 0,
    ...overrides
  };
}

// A finished Agent run with its steps, sources and answer.
export function agentAnswer({ id, question, steps, sources, answer, followUps }) {
  return agentActivity({ id, question, steps, sources, answer, followUps });
}

// The Agent question used in the README and store images, with its sources.
export const RATE_LIMIT_QUESTION = 'How are people handling rate limits during streaming?';
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

// What the agent did to answer it: two searches, then one read per source (the store image uses the first four steps).
export const RATE_LIMIT_STEPS = [
  {
    tool: 'search_forum',
    args: { query: 'streaming rate limit 429' },
    reason: 'Start with the most direct wording of the question.',
    resultCount: 6,
    detail:
      'Search results for "streaming rate limit 429" (page 1): 6 topics.\n- id 1088142: Rate limit errors only during streamed tool calls — 42 posts, last activity 2026-09-28\n- id 1080655: Batching several tool calls in one turn — 27 posts'
  },
  {
    tool: 'search_forum',
    args: { query: 'Retry-After backoff streaming' },
    reason: 'People may describe the fix instead of the error.',
    resultCount: 4,
    detail:
      'Search results for "Retry-After backoff streaming" (page 1): 4 topics.\n- id 1071920: Guide: exponential backoff with Retry-After — 18 posts'
  },
  {
    tool: 'read_topic',
    args: { topic_id: '1088142' },
    reason: 'The best match for the error itself.',
    title: RATE_LIMIT_SOURCES[0].title,
    resultCount: 42,
    topicId: RATE_LIMIT_SOURCES[0].topicId,
    sourceId: 'S1',
    detail:
      '[S1] Topic 1088142: Rate limit errors only during streamed tool calls\nShowing: the opening and the newest replies (42 posts; middle omitted)'
  },
  {
    tool: 'read_topic',
    args: { topic_id: '1071920' },
    reason: 'A guide that explains the usual fix.',
    title: RATE_LIMIT_SOURCES[1].title,
    resultCount: 18,
    topicId: RATE_LIMIT_SOURCES[1].topicId,
    sourceId: 'S2',
    detail: '[S2] Topic 1071920: Guide: exponential backoff with Retry-After\nShowing: all posts'
  },
  {
    tool: 'read_topic',
    args: { topic_id: '1080655' },
    reason: 'Batching came up in two results.',
    title: RATE_LIMIT_SOURCES[2].title,
    resultCount: 27,
    topicId: RATE_LIMIT_SOURCES[2].topicId,
    sourceId: 'S3',
    detail: '[S3] Topic 1080655: Batching several tool calls in one turn\nShowing: all posts'
  },
  {
    tool: 'read_topic',
    args: { topic_id: '1064310' },
    reason: 'For steady, high-volume apps the question is whether to ask for more.',
    title: RATE_LIMIT_SOURCES[3].title,
    resultCount: 9,
    topicId: RATE_LIMIT_SOURCES[3].topicId,
    sourceId: 'S4',
    detail: '[S4] Topic 1064310: How to request a higher rate limit\nShowing: all posts'
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
