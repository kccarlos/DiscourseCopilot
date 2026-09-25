// Fixture data for the Chrome Web Store images (store-assets/): side-panel
// contents (shorter than the README ones so they fit a 1280x800 frame) and
// the mock forum pages next to the panel.
import {
  META,
  MIN,
  now,
  session,
  chat,
  agentAnswer,
  RATE_LIMIT_QUESTION,
  RATE_LIMIT_QUERIES,
  RATE_LIMIT_SOURCES,
  STREAMING_TOPIC,
  LONG_THREADS_TOPIC
} from './forums.mjs';

export const META_TIPS_TOPIC = {
  topicId: 241807,
  slug: 'new-user-tips-read-this-before-your-first-post',
  title: 'New user tips: read this before your first post'
};
export { STREAMING_TOPIC, LONG_THREADS_TOPIC };

// ---------- Side panel ----------

export const metaTips = session(META, {
  ...META_TIPS_TOPIC,
  totalPosts: 88,
  ageMin: 12,
  summary: `## Original post

A staff post answering the most common new-user questions: how trust levels work, why links are limited at first, and where to find the community guidelines.

## Key takeaways

- The limits stop spam, not genuine new members.
- Trust level 1 unlocks after a little reading, no application needed.`,
  history: [
    chat('user', 'Why can’t I post more than two links yet?', 9),
    chat(
      'assistant',
      'New accounts (trust level 0) are limited to two links per post. It’s a **spam guard**, not a bug, and it lifts automatically at trust level 1.',
      9
    )
  ]
});
export const metaTipsOpenAI = { ...metaTips, provider: 'openai', model: 'gpt-4o-mini' };

export const agentRun = agentAnswer({
  id: 'store',
  question: RATE_LIMIT_QUESTION,
  searchQueries: RATE_LIMIT_QUERIES,
  sources: RATE_LIMIT_SOURCES.slice(0, 2),
  answer:
    'Most 429s during streaming come from **retrying too fast**: a failed stream triggers an immediate new request [S1]. The fix people report most is **exponential backoff** that starts from the `Retry-After` header instead of a fixed delay [S2].'
});

export const savedTopics = [
  session(META, {
    ...META_TIPS_TOPIC,
    totalPosts: 88,
    ageMin: 12,
    summary: 'Trust levels limit new accounts on purpose; trust level 1 unlocks after a little reading, no application needed.',
    history: metaTips.history
  }),
  session(META, {
    topicId: 229140,
    slug: 'category-specific-notification-defaults',
    title: 'Category-specific notification defaults',
    totalPosts: 20,
    ageMin: 9 * 60,
    summary: 'Admins can set default notification levels per category for new users.'
  })
];
export const keptAgentRun = { ...agentRun, lastOpenedAt: now - 19 * MIN, kept: true };

// ---------- Mock forum pages ----------

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

export const metaTipsForumTopic = {
  title: META_TIPS_TOPIC.title,
  cat: 'Community',
  catColor: '#25aae2',
  tags: ['faq', 'trust-levels'],
  started: 'Sep 2023',
  latest: '2h ago',
  count: 88,
  posts: [
    {
      user: 'forum_team',
      badge: 'Staff',
      color: C.purple,
      time: 'Sep 2023',
      likes: 214,
      body: [
        'Welcome! Here are answers to the questions new members ask most often.',
        '<b>Why can’t I post links or images yet?</b> New accounts start at trust level 0, which limits links per post. It’s a spam guard, and it lifts automatically after you read a few topics.',
        '<b>How do trust levels work?</b> You move up by reading, replying, and receiving likes. There is nothing to apply for.'
      ]
    },
    {
      user: 'pixelpenguin',
      color: C.teal,
      time: 'Oct 2023',
      likes: 36,
      body: ['This cleared up a lot for me. I thought my account was broken when my second link was blocked!']
    },
    {
      user: 'trailrunner42',
      color: C.orange,
      time: 'Nov 2023',
      likes: 18,
      body: ['Is flagging only for moderators, or can regular members review flags too?']
    }
  ]
};

export const streamingForumTopic = {
  title: STREAMING_TOPIC.title,
  cat: 'API',
  catColor: '#0e76bd',
  tags: ['streaming', 'rate-limits'],
  started: 'Aug 2026',
  latest: '2h ago',
  count: 13,
  posts: [
    {
      user: 'async_otter',
      color: C.blue,
      time: 'Aug 28',
      likes: 24,
      body: [
        'When a tool call arrives mid-stream, my client sometimes gets a 429 right after it retries. Is there a recommended way to handle rate limits while streaming?',
        'I’m retrying after a fixed one-second delay, which doesn’t seem to help much.'
      ]
    },
    {
      user: 'byte_gardener',
      color: C.green,
      time: 'Aug 28',
      likes: 17,
      body: ['Read the <code>Retry-After</code> header and back off from that value instead of a fixed delay. That fixed it for us.']
    },
    {
      user: 'null_island',
      color: C.rose,
      time: 'Aug 29',
      likes: 9,
      body: ['Same issue here. Batching tool calls also helped, since each call counts toward the same limit.']
    }
  ]
};

export const longThreadsForumTopic = {
  title: LONG_THREADS_TOPIC.title,
  cat: 'API',
  catColor: '#0e76bd',
  tags: ['assistants', 'context'],
  started: 'Jul 2026',
  latest: '5h ago',
  count: 32,
  posts: [
    {
      user: 'quiet_compiler',
      color: C.slate,
      time: 'Jul 14',
      likes: 41,
      body: [
        'Our support bot keeps conversations open for weeks. Resending the whole history every time is getting slow and expensive.',
        'How are others handling very long threads? Summaries, trimming, something else?'
      ]
    },
    {
      user: 'maple_syntax',
      color: C.gold,
      time: 'Jul 14',
      likes: 28,
      body: ['We keep a short running summary and only send the last few turns in full. Old threads get archived on our side.']
    },
    { user: 'lambda_lark', color: C.teal, time: 'Jul 15', likes: 12, body: ['+1 to the running summary. Refresh it every 10 turns or so.'] }
  ]
};

export const openaiLatest = [
  {
    title: 'Streaming function calls with the Responses API',
    cat: 'API',
    catColor: '#0e76bd',
    replies: 12,
    act: '2h',
    avs: [
      ['A', C.blue],
      ['B', C.green],
      ['N', C.rose]
    ]
  },
  {
    title: 'How to request a higher rate limit',
    cat: 'API',
    catColor: '#0e76bd',
    replies: 47,
    act: '3h',
    hot: true,
    avs: [
      ['Q', C.slate],
      ['M', C.gold],
      ['L', C.teal]
    ]
  },
  {
    title: 'Best practices for long-running assistant threads',
    cat: 'API',
    catColor: '#0e76bd',
    replies: 31,
    act: '5h',
    avs: [
      ['Q', C.slate],
      ['M', C.gold]
    ]
  },
  {
    title: 'Batching several tool calls in one turn',
    cat: 'Prompting',
    catColor: '#3ab54a',
    replies: 18,
    act: '8h',
    avs: [
      ['R', C.orange],
      ['T', C.purple]
    ]
  },
  {
    title: 'Show us what you built this month',
    cat: 'Community',
    catColor: '#e45735',
    replies: 126,
    act: '9h',
    hot: true,
    avs: [
      ['P', C.teal],
      ['S', C.blue],
      ['H', C.rose]
    ]
  },
  {
    title: 'Guide: exponential backoff with Retry-After',
    cat: 'Documentation',
    catColor: '#9e9e9e',
    replies: 9,
    act: '1d',
    avs: [['B', C.green]]
  },
  {
    title: 'Structured outputs return an empty object',
    cat: 'Bugs',
    catColor: '#c0392b',
    replies: 6,
    act: '1d',
    avs: [
      ['W', C.gold],
      ['E', C.slate]
    ]
  }
];
