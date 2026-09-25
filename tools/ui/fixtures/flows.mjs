// Fixture data for the flow tests (tools/ui/flows.mjs). Topics and questions
// are invented; forum.example.com stands in for "some other forum".

export const SITE = 'https://meta.discourse.org';
export const TOPIC_URL = `${SITE}/t/some-topic/12345`;
export const TOPIC_KEY = 'meta.discourse.org/t/12345';

export const configuredStore = { selectedProvider: 'openai', openaiApiKey: 'sk-test', openaiModel: 'gpt-4o-mini' };

export const topicPageState = {
  url: TOPIC_URL, isDiscourse: true, isForumPage: true, isForumTopic: true, postId: '12345', topicId: '12345',
  siteUrl: SITE, basePath: '', forumName: 'Discourse Meta', topicKey: TOPIC_KEY
};
export const forumHomeState = { ...topicPageState, url: `${SITE}/latest`, isForumTopic: false, postId: null, topicId: null, topicKey: '' };

// Default chrome.* stub options: the panel is open on an enabled Discourse Meta topic.
export const defaultStub = { tabUrl: TOPIC_URL, tabTitle: 'Some topic - Discourse Meta', pageState: topicPageState };

const now = Date.now();

// A saved session with a summary and one question/answer.
export const savedSession = {
  topicId: '12345', siteUrl: SITE, topicKey: TOPIC_KEY, url: TOPIC_URL, title: 'Some topic', forumName: 'Discourse Meta',
  source: 'Post 1\n\nPost 2 with details', rawPages: [{ page: 1, content: 'Post 1\n\nPost 2 with details' }],
  summary: '## Overview\n\nPeople agree on **caching**.', kept: false, totalPosts: 12, summaryPostCount: 12, pagesFetched: 1,
  history: [
    { role: 'user', content: 'What is the consensus?', taskId: 'c1', createdAt: now - 60000 },
    { role: 'assistant', content: 'Mostly **yes**.', taskId: 'c1', createdAt: now - 50000 }
  ],
  provider: 'openai', model: 'gpt-4o-mini', createdAt: now - 120000, updatedAt: now - 50000,
  summaryUpdatedAt: now - 100000, chatUpdatedAt: now - 50000, lastCheckedAt: now - 100000, lastAccessedAt: now - 50000
};

// seedHistory() input for one saved session and its index entry.
export function savedSessionHistory(session = savedSession) {
  return {
    sessions: [session],
    entries: [{
      topicKey: session.topicKey, topicId: session.topicId, siteUrl: session.siteUrl, url: session.url,
      title: session.title, forumName: session.forumName, hasSummary: true, kept: false,
      summaryExcerpt: session.summary.slice(0, 180), totalPosts: session.totalPosts, summaryPostCount: session.summaryPostCount,
      historyCount: session.history.length, provider: 'openai', model: 'gpt-4o-mini', updatedAt: session.updatedAt,
      summaryUpdatedAt: session.summaryUpdatedAt, chatUpdatedAt: session.chatUpdatedAt, lastAccessedAt: session.lastAccessedAt
    }]
  };
}

// A topic on a forum that isn't enabled yet (the Forum access scenarios).
export const OAI = 'https://community.openai.com';
export const OAI_TOPIC = `${OAI}/t/rate-limits-explained/4242`;
export const oaiState = {
  url: OAI_TOPIC, isDiscourse: true, isForumPage: true, isForumTopic: true, postId: '4242', topicId: '4242',
  siteUrl: OAI, basePath: '', forumName: 'OpenAI Developer Community', topicKey: 'community.openai.com/t/4242'
};
export const oaiProbe = { url: OAI_TOPIC, isDiscourse: true, basePath: '', forumName: 'OpenAI Developer Community' };
export const accessOptions = {
  store: configuredStore, granted: [], activeTab: true, probe: oaiProbe,
  tabUrl: OAI_TOPIC, tabTitle: 'Rate limits explained - OpenAI Developer Community', pageState: oaiState
};
