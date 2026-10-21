// Fixture data for the Chrome Web Store images (store-assets/) and the demo,
// in the language of `copy` (copy/*.mjs): side-panel contents (shorter than
// the README ones so they fit a 1280x800 frame) and the mock forum pages next
// to the panel.
import { META, MIN, now, session, chat, agentAnswer, rateLimitRun, topicsFor } from './forums.mjs';

const C = {
  purple: '#7b4fb8',
  teal: '#2a8f8a',
  orange: '#c9722a',
  blue: '#3a78c9',
  green: '#4d8f3a',
  rose: '#b8456a',
  slate: '#5c6f86',
  gold: '#a88a20'
};

export const FORUM_LOOKS = {
  meta: { host: 'meta.discourse.org', name: 'Discourse Meta', letter: 'D', color: '#4f2a8a', me: '#2f8f6f' },
  openai: { host: 'community.openai.com', name: 'OpenAI Developer Community', letter: 'O', color: '#8a8423', me: '#b0522d' }
};

// Who wrote each post on the mock pages, with avatar colors and likes; the
// words come from copy.forum.
const POSTS = {
  metaTips: [
    { color: C.purple, likes: 214 },
    { color: C.teal, likes: 36 },
    { color: C.orange, likes: 18 }
  ],
  streaming: [
    { color: C.blue, likes: 24 },
    { color: C.green, likes: 17 },
    { color: C.rose, likes: 9 }
  ],
  longThreads: [
    { color: C.slate, likes: 41 },
    { color: C.gold, likes: 28 },
    { color: C.teal, likes: 12 }
  ]
};
const CATEGORY_COLORS = { meta: '#25aae2', openai: '#0e76bd' };
// The "Latest" list: replies, avatars and category colors, top to bottom.
const LATEST = [
  {
    catColor: '#0e76bd',
    replies: 12,
    avs: [
      ['A', C.blue],
      ['B', C.green],
      ['N', C.rose]
    ]
  },
  {
    catColor: '#0e76bd',
    replies: 47,
    hot: true,
    avs: [
      ['Q', C.slate],
      ['M', C.gold],
      ['L', C.teal]
    ]
  },
  {
    catColor: '#0e76bd',
    replies: 31,
    avs: [
      ['Q', C.slate],
      ['M', C.gold]
    ]
  },
  {
    catColor: '#3ab54a',
    replies: 18,
    avs: [
      ['R', C.orange],
      ['T', C.purple]
    ]
  },
  {
    catColor: '#e45735',
    replies: 126,
    hot: true,
    avs: [
      ['P', C.teal],
      ['S', C.blue],
      ['H', C.rose]
    ]
  },
  { catColor: '#9e9e9e', replies: 9, avs: [['B', C.green]] },
  {
    catColor: '#c0392b',
    replies: 6,
    avs: [
      ['W', C.gold],
      ['E', C.slate]
    ]
  }
];

const forumTopic = (copy, name, look, title, count) => {
  const page = copy.forum[name];
  return {
    title,
    cat: page.cat,
    catColor: CATEGORY_COLORS[look],
    tags: page.tags,
    started: page.started,
    latest: page.latest,
    count,
    posts: page.posts.map((post, index) => ({ ...POSTS[name][index], ...post }))
  };
};

export function storeFixtures(copy) {
  const topics = topicsFor(copy);
  const text = copy.store;
  const run = rateLimitRun(copy);

  // ---------- Side panel ----------
  const metaTips = session(META, {
    ...topics.metaTips,
    totalPosts: 88,
    ageMin: 12,
    summary: text.tipsSummary,
    history: [chat('user', text.tipsChat[0], 9), chat('assistant', text.tipsChat[1], 9)]
  });
  const metaTipsOpenAI = { ...metaTips, provider: 'openai', model: 'gpt-4o-mini' };
  const agentRun = agentAnswer({
    id: 'store',
    question: run.question,
    steps: run.steps.slice(0, 4),
    sources: run.sources.slice(0, 2),
    answer: text.agentAnswer
  });
  const savedTopics = [
    session(META, { ...topics.metaTips, totalPosts: 88, ageMin: 12, summary: text.saved.tips, history: metaTips.history }),
    session(META, { ...topics.notifications, totalPosts: 20, ageMin: 9 * 60, summary: text.saved.notifications })
  ];
  const keptAgentRun = { ...agentRun, lastOpenedAt: now - 19 * MIN, kept: true };

  // ---------- Mock forum pages ----------
  const latest = copy.forum.latest.map((row, index) => ({ ...LATEST[index], ...row }));

  return {
    copy,
    topics,
    run,
    metaTips,
    metaTipsOpenAI,
    agentRun,
    savedTopics,
    keptAgentRun,
    metaTipsForumTopic: forumTopic(copy, 'metaTips', 'meta', topics.metaTips.title, 88),
    streamingForumTopic: forumTopic(copy, 'streaming', 'openai', topics.streaming.title, 13),
    longThreadsForumTopic: forumTopic(copy, 'longThreads', 'openai', topics.longThreads.title, 32),
    openaiLatest: latest
  };
}
