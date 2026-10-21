// Forums and record builders shared by the screenshot fixtures. The forums
// are real public Discourse sites; every topic, post and username in the
// fixtures is invented.
//
// The text they hold comes from copy/*.mjs, one file per language.
//
// Timestamps are relative to the time of the run, so labels like
// "12 min ago" or "expires in 23h" come out the same on every run.

import enCopy from './copy/en.mjs';

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

// The Agent run used in the README, store images and demo, in the language
// of `copy` (copy/*.mjs): the question, its sources and what the agent did
// (two searches, then one read per source; the store image uses the first
// four steps).
const SOURCE_POSTS = [
  { topicId: 1088142, postId: 10881424, postNumber: 4 },
  { topicId: 1071920, postId: 10719201, postNumber: 1 },
  { topicId: 1080655, postId: 10806559, postNumber: 9 },
  { topicId: 1064310, postId: 10643102, postNumber: 2 }
];
const STEP_RESULTS = [
  { tool: 'search_forum', resultCount: 6 },
  { tool: 'search_forum', resultCount: 4 },
  { tool: 'read_topic', resultCount: 42, source: 0 },
  { tool: 'read_topic', resultCount: 18, source: 1 },
  { tool: 'read_topic', resultCount: 27, source: 2 },
  { tool: 'read_topic', resultCount: 9, source: 3 }
];
export function rateLimitRun(copy) {
  const sources = copy.agent.sources.map((text, index) => ({ ...SOURCE_POSTS[index], ...text }));
  const steps = copy.agent.steps.map((text, index) => {
    const { tool, resultCount, source } = STEP_RESULTS[index];
    const step = { tool, reason: text.reason, resultCount, detail: text.detail };
    if (tool === 'search_forum') return { ...step, args: { query: text.query } };
    const { topicId, title } = sources[source];
    return { ...step, args: { topic_id: String(topicId) }, title, topicId, sourceId: `S${source + 1}` };
  });
  return { question: copy.agent.question, sources, steps };
}

// The topics the images open, in the language of `copy`.
export function topicsFor(copy) {
  const { metaTips, metaLong, notifications, streaming, longThreads } = copy.topics;
  return {
    metaTips: { topicId: 241807, slug: metaTips.slug, title: metaTips.title },
    metaTipsReadme: { topicId: 241807, slug: metaTips.readmeSlug, title: metaTips.title },
    metaLong: { topicId: 187233, ...metaLong },
    notifications: { topicId: 229140, ...notifications },
    streaming: { topicId: 1093417, ...streaming },
    longThreads: { topicId: 1079884, ...longThreads }
  };
}

// The English run and topics, for the UI flows.
const englishRun = rateLimitRun(enCopy);
const englishTopics = topicsFor(enCopy);
export const RATE_LIMIT_QUESTION = englishRun.question;
export const RATE_LIMIT_SOURCES = englishRun.sources;
export const RATE_LIMIT_STEPS = englishRun.steps;
export const STREAMING_TOPIC = englishTopics.streaming;
export const LONG_THREADS_TOPIC = englishTopics.longThreads;

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
