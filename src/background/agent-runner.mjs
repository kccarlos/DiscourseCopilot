import {
  buildTopicUrl,
  FORUM_TOOL_LIMITS,
  ForumToolError
} from './forum-tools.mjs';
import { PREFERENCE_RANGES, RESEARCH_PRESETS } from '../shared/preferences.mjs';
import {
  buildTopicKey,
  forumDisplayName,
  normalizeSiteUrl
} from '../shared/forum-site.mjs';
import {
  buildAgentSourceContext,
  deriveSearchQueries,
  rankSearchResults
} from '../services/agent-context.mjs';

// Sources handed to the model; matches AGENT_CONTEXT_LIMITS.maxSourceCount.
const MAX_SELECTED_SOURCES = 12;

// The research budget when the caller passes none (the Balanced preset).
export const DEFAULT_RESEARCH_LIMITS = Object.freeze({
  ...RESEARCH_PRESETS.balanced,
  rawFallbacks: Math.ceil(RESEARCH_PRESETS.balanced.topicsRead / 2)
});

function boundedCount(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

// The run's budget, clamped to the hard caps whatever the caller asked for:
// preference ranges, and the forum tools' own search page limit.
export function effectiveResearchLimits(limits = {}) {
  const ranges = PREFERENCE_RANGES;
  const topicsRead = boundedCount(
    limits.topicsRead, DEFAULT_RESEARCH_LIMITS.topicsRead, ranges.topicsRead.min, ranges.topicsRead.max
  );
  return {
    searchQueries: boundedCount(
      limits.searchQueries, DEFAULT_RESEARCH_LIMITS.searchQueries,
      ranges.searchQueries.min, ranges.searchQueries.max
    ),
    searchPages: boundedCount(
      limits.searchPages, DEFAULT_RESEARCH_LIMITS.searchPages,
      ranges.searchPages.min, Math.min(ranges.searchPages.max, FORUM_TOOL_LIMITS.maxSearchPage)
    ),
    topicsRead,
    rawFallbacks: boundedCount(limits.rawFallbacks, Math.ceil(topicsRead / 2), 0, topicsRead)
  };
}

function now() {
  return Date.now();
}

function text(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function uniqueBy(items, key) {
  const seen = new Set();
  return items.filter(item => {
    const value = key(item);
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

// Source identity is forum-scoped so the same topic ID on two forums never
// merges.
function sourceIdentity(siteUrl, topicId) {
  return {
    siteUrl,
    topicKey: buildTopicKey(siteUrl, topicId)
  };
}

function sourceRefFromPost(siteUrl, post, topic, sourceId) {
  const postId = post.postId || '';
  const excerpt = text(post.text || post.excerpt, 5000);
  return {
    sourceId,
    topicId: topic.topicId,
    ...sourceIdentity(siteUrl, topic.topicId),
    postId,
    postNumber: post.postNumber || null,
    title: topic.title || post.topicTitle,
    url: buildTopicUrl({
      siteUrl,
      topicId: topic.topicId,
      slug: topic.slug || post.topicSlug,
      postId
    }),
    excerpt,
    text: excerpt,
    evidenceType: 'post',
    retrievedAt: now()
  };
}

function sourceRefFromRaw(siteUrl, raw, topic, sourceId) {
  const content = text(raw.content, 30000);
  return {
    sourceId,
    topicId: topic.topicId,
    ...sourceIdentity(siteUrl, topic.topicId),
    title: topic.title,
    url: buildTopicUrl({ siteUrl, topicId: topic.topicId, slug: topic.slug }),
    postNumber: null,
    excerpt: content.slice(0, 5000),
    text: content,
    evidenceType: 'raw',
    retrievedAt: now()
  };
}

function progressPatch(phase, statusText, completedSteps, totalSteps, sourceCount = null) {
  return {
    phase,
    statusText,
    progress: {
      percent: totalSteps > 0
        ? Math.min(100, Math.round((completedSteps / totalSteps) * 100))
        : null,
      completedSteps,
      totalSteps,
      sourceCount,
      etaMs: null
    }
  };
}

export async function runAgentTask({
  question,
  systemPrompt = '',
  responseLanguage,
  forumName = '',
  signal,
  toolClient,
  generateAnswer,
  onProgress = () => {},
  onActivityPatch = () => {},
  onStream = () => {},
  limits
} = {}) {
  const budget = effectiveResearchLimits(limits);
  // Source links are always built from the tool client's forum, never from
  // model output.
  const siteUrl = normalizeSiteUrl(toolClient?.siteUrl);
  if (!siteUrl) {
    throw new ForumToolError('INVALID_ARGUMENT', 'A valid forum site URL is required', {
      retryable: false
    });
  }
  const forumLabel = forumDisplayName(siteUrl, forumName) || 'the forum';
  const queries = deriveSearchQueries(question, budget.searchQueries);
  if (!queries.length) {
    throw new Error('Agent question is required');
  }

  const totalSteps = queries.length * budget.searchPages + budget.topicsRead + 4;
  let completedSteps = 0;
  const searchQueries = [];
  const toolCalls = [];
  const searchHits = [];

  const report = async (patch, durable = false) => {
    await onProgress(patch, durable);
  };

  const invoke = async (name, args, fn) => {
    const call = {
      callId: `${name}-${now()}-${toolCalls.length + 1}`,
      name,
      argumentSummary: Object.fromEntries(
        Object.entries(args || {}).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join(',') : String(value ?? '')
        ])
      ),
      status: 'running',
      startedAt: now(),
      completedAt: 0,
      resultCount: null,
      error: ''
    };
    toolCalls.push(call);
    await onActivityPatch({ toolCalls: [...toolCalls] }, true);
    try {
      const result = await fn();
      call.status = 'completed';
      call.completedAt = now();
      call.resultCount = Array.isArray(result?.hits)
        ? result.hits.length
        : Array.isArray(result?.posts)
          ? result.posts.length
          : null;
      await onActivityPatch({ toolCalls: [...toolCalls] }, true);
      return result;
    } catch (error) {
      call.status = 'failed';
      call.completedAt = now();
      call.error = text(error?.message || error, 500);
      await onActivityPatch({ toolCalls: [...toolCalls] }, true);
      throw error;
    }
  };

  await report(progressPatch('searching', `Searching ${forumLabel}…`, 0, totalSteps), true);
  for (const query of queries) {
    for (let page = 1; page <= budget.searchPages; page++) {
      const startedAt = now();
      const result = await invoke(
        'searchForum',
        { query, page },
        () => toolClient.searchForum({ query, page })
      );
      searchHits.push(...result.hits);
      searchQueries.push({
        query,
        page,
        resultCount: result.hits.length,
        startedAt,
        completedAt: now()
      });
      completedSteps++;
      await onActivityPatch({ searchQueries: [...searchQueries] }, true);
      await report(progressPatch(
        'searching',
        `Found ${searchHits.length} search matches…`,
        completedSteps,
        totalSteps
      ));
      // No further result pages for this query.
      if (result.more !== true) {
        completedSteps += budget.searchPages - page;
        break;
      }
    }
  }

  const ranked = rankSearchResults(searchHits, question, budget.topicsRead);
  if (!ranked.length) {
    return {
      answer: `I could not find any relevant discussions on ${forumLabel} for that question.`,
      answerStatus: 'no_results',
      sourceRefs: [],
      searchQueries,
      toolCalls
    };
  }

  await report(progressPatch(
    'ranking',
    `Comparing ${ranked.length} relevant discussions…`,
    completedSteps,
    totalSteps
  ), true);

  const topics = [];
  for (const hit of ranked) {
    const topic = await invoke(
      'getTopic',
      { topicId: hit.topicId },
      () => toolClient.getTopic({ topicId: hit.topicId })
    );
    topics.push({ topic, hit });
    completedSteps++;
    await report(progressPatch(
      'fetching_metadata',
      `Checking discussion ${topics.length} of ${ranked.length}…`,
      completedSteps,
      totalSteps
    ));
  }

  const sourceCandidates = [];
  let rawFallbacks = 0;
  for (const { topic, hit } of topics) {
    const postIds = hit.postId ? [hit.postId] : [];
    let posts = [];
    if (postIds.length) {
      const result = await invoke(
        'getPosts',
        { topicId: topic.topicId, postIds },
        () => toolClient.getPosts({ topicId: topic.topicId, postIds })
      );
      posts = result.posts;
    }

    if (posts.length) {
      sourceCandidates.push(...posts.map(post => ({
        ...sourceRefFromPost(siteUrl, post, topic, `S${sourceCandidates.length + 1}`),
        score: hit.score
      })));
    } else if (rawFallbacks < budget.rawFallbacks) {
      rawFallbacks++;
      const raw = await invoke(
        'getRawPage',
        { topicId: topic.topicId, page: 1 },
        () => toolClient.getRawPage({ topicId: topic.topicId, page: 1 })
      );
      if (raw.content) {
        sourceCandidates.push({
          ...sourceRefFromRaw(siteUrl, raw, topic, `S${sourceCandidates.length + 1}`),
          score: hit.score
        });
      }
    } else if (hit.excerpt) {
      sourceCandidates.push({
        sourceId: `S${sourceCandidates.length + 1}`,
        topicId: topic.topicId,
        ...sourceIdentity(siteUrl, topic.topicId),
        title: topic.title,
        url: buildTopicUrl({
          siteUrl,
          topicId: topic.topicId,
          slug: topic.slug,
          postId: hit.postId
        }),
        postId: hit.postId,
        postNumber: hit.postNumber || null,
        excerpt: text(hit.excerpt, 5000),
        text: text(hit.excerpt, 5000),
        evidenceType: 'search-hit',
        retrievedAt: now(),
        score: hit.score
      });
    }

    completedSteps++;
    await report(progressPatch(
      'fetching_posts',
      `Reading selected discussions…`,
      completedSteps,
      totalSteps,
      sourceCandidates.length
    ));
  }

  const sources = uniqueBy(
    sourceCandidates
      .sort((left, right) => right.score - left.score)
      .slice(0, MAX_SELECTED_SOURCES),
    source => `${source.topicKey}:${source.postId || source.sourceId}`
  ).map((source, index) => ({
    ...source,
    sourceId: `S${index + 1}`
  }));

  const sourceRefs = sources.map(({ text: _text, score: _score, ...source }) => source);
  await onActivityPatch({ sourceRefs }, true);

  if (!sources.length) {
    return {
      answer: 'I found potentially related discussions, but not enough readable source content to answer confidently.',
      answerStatus: 'no_results',
      sourceRefs,
      searchQueries,
      toolCalls
    };
  }

  const sourceContext = buildAgentSourceContext(sources);
  completedSteps++;
  await report(progressPatch(
    'generating',
    `Writing an answer from ${sources.length} sources…`,
    completedSteps,
    totalSteps,
    sources.length
  ), true);

  const answer = await generateAnswer({
    question,
    sources: sourceContext.sources,
    systemPrompt,
    responseLanguage,
    forumName: forumLabel,
    signal,
    onProgress: progress => onProgress({
      phase: 'generating',
      statusText: progress?.message || 'Writing an answer with sources…',
      progress: {
        percent: null,
        completedSteps,
        totalSteps,
        sourceCount: sources.length,
        etaMs: null
      }
    }),
    onStream
  });

  completedSteps = totalSteps;
  await report(progressPatch(
    'saving',
    'Saving answer and sources…',
    completedSteps,
    totalSteps,
    sources.length
  ), true);
  return {
    answer,
    answerStatus: 'answered',
    sourceRefs,
    searchQueries,
    toolCalls
  };
}

export function isAgentUserActionError(error) {
  return error instanceof ForumToolError && error.needsUserAction === true;
}
