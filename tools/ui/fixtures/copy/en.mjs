// English text for the screenshot fixtures: what the forum says, what the AI
// answered, the captions and the promo copy. zh-CN.mjs and zh-TW.mjs have the
// same shape, so a localized image shows no English apart from brand names.
// The interface itself is translated by the extension (src/shared/locales/).
export default {
  lang: 'en',

  // Topics on the two forums (forums.mjs). `slug` is the store/demo URL;
  // the README's tips topic has an older slug.
  topics: {
    metaTips: {
      title: 'New user tips: read this before your first post',
      slug: 'new-user-tips-read-this-before-your-first-post',
      readmeSlug: 'psa-new-user-tips-read-this-before-your-first-post'
    },
    metaLong: { title: 'What are you working on? (2026 edition)', slug: 'what-are-you-working-on-2026-edition' },
    notifications: { title: 'Category-specific notification defaults', slug: 'category-specific-notification-defaults' },
    streaming: { title: 'Streaming function calls with the Responses API', slug: 'streaming-function-calls-with-the-responses-api' },
    longThreads: { title: 'Best practices for long-running assistant threads', slug: 'best-practices-for-long-running-assistant-threads' }
  },
  // The category in each forum's tab title: "{title} - {category} - {forum}".
  tabCategory: { meta: 'Community', openai: 'API' },

  // The Ask the forum run in the README, the store images and the demo.
  agent: {
    question: 'How are people handling rate limits during streaming?',
    sources: [
      {
        slug: 'rate-limit-errors-only-during-streamed-tool-calls',
        title: 'Rate limit errors only during streamed tool calls',
        excerpt: 'We started seeing 429s when a tool call happened mid-stream and the client retried immediately…'
      },
      {
        slug: 'guide-exponential-backoff-with-retry-after',
        title: 'Guide: exponential backoff with Retry-After',
        excerpt: 'Rather than a fixed one-second delay, read the Retry-After header and back off from that value…'
      },
      {
        slug: 'batching-several-tool-calls-in-one-turn',
        title: 'Batching several tool calls in one turn',
        excerpt: 'Each call still counts toward the same per-minute budget, so batching cut our error rate a lot…'
      },
      {
        slug: 'how-to-request-a-higher-rate-limit',
        title: 'How to request a higher rate limit',
        excerpt: 'Once your usage is steady for a couple of weeks, asking for an increase is the better long-term fix…'
      }
    ],
    // Two searches, then one read per source.
    steps: [
      {
        query: 'streaming rate limit 429',
        reason: 'Start with the most direct wording of the question.',
        detail:
          'Search results for "streaming rate limit 429" (page 1): 6 topics.\n- id 1088142: Rate limit errors only during streamed tool calls — 42 posts, last activity 2026-09-28\n- id 1080655: Batching several tool calls in one turn — 27 posts'
      },
      {
        query: 'Retry-After backoff streaming',
        reason: 'People may describe the fix instead of the error.',
        detail:
          'Search results for "Retry-After backoff streaming" (page 1): 4 topics.\n- id 1071920: Guide: exponential backoff with Retry-After — 18 posts'
      },
      {
        reason: 'The best match for the error itself.',
        detail:
          '[S1] Topic 1088142: Rate limit errors only during streamed tool calls\nShowing: the opening and the newest replies (42 posts; middle omitted)'
      },
      {
        reason: 'A guide that explains the usual fix.',
        detail: '[S2] Topic 1071920: Guide: exponential backoff with Retry-After\nShowing: all posts'
      },
      {
        reason: 'Batching came up in two results.',
        detail: '[S3] Topic 1080655: Batching several tool calls in one turn\nShowing: all posts'
      },
      {
        reason: 'For steady, high-volume apps the question is whether to ask for more.',
        detail: '[S4] Topic 1064310: How to request a higher rate limit\nShowing: all posts'
      }
    ]
  },

  // ---------- README screenshots (readme.mjs) ----------
  readme: {
    tipsSummary: `## Original post

A staff post collecting the most common new-user questions: how trust levels work, why some links need a few posts before they render, and where to find the community guidelines.

## Community response

- Most replies say **trust levels** are the biggest source of confusion — several people didn't realize new accounts are rate-limited on purpose.
- A moderator explains that flags are reviewed by the community, not just staff, and how the "Regular" level is earned.
- A few admins share plugins that build on the default trust-level behavior.

## Key takeaways

- New accounts are limited on purpose: it stops spam, not genuine new members.
- Trust level 1 unlocks after a little reading and participation, no application needed.
- Flag review is a community job, not only a staff one.`,
    tipsChat: [
      'Why can’t I post more than two links yet?',
      'New accounts (trust level 0) are limited to two links per post. It’s a **spam guard**, not a bug, and it lifts automatically at trust level 1.',
      'How long does that usually take?',
      'For most people, a day or two of normal reading and a few genuine replies. There’s no application or waiting queue.'
    ],
    // The hero's Chat tab: one more exchange.
    tipsMoreChat: [
      'Can a moderator raise my trust level by hand?',
      'Yes. Staff can **promote you manually**, and the thread notes they sometimes do for known contributors. Most people never need to ask: reading a few topics and replying is enough.'
    ],
    longSummary: `## Original post

A long-running community thread where site owners share what they're building on Discourse this year, from themes and plugins to whole new communities.

## What people are building

- **Theme components**: many posts show custom home pages, sidebar tweaks and dark-mode palettes.
- **Automations**: several admins describe welcome flows and scheduled topic reminders.
- **Migrations**: a recurring group is moving from older forums and mailing lists, with tips on importing history.

## Useful tips from the thread

- Test theme changes on a staging site before rolling them out.
- Keep plugins to the ones you actively maintain; fewer means smoother upgrades.`,
    longChat: [
      'Which migration tips come up most often?',
      'Import in batches, **map user accounts first**, and freeze the old forum before the final sync so no posts are lost.'
    ],
    agentAnswer: `Rate-limit errors during streaming usually come from **retrying too fast**: a failed stream triggers an immediate new request [S1]. The fix most people report is exponential backoff that starts from the \`Retry-After\` header instead of a fixed delay [S2].

Several threads also suggest **batching tool calls**, because every call in a streamed turn counts toward the same per-minute limit [S3]. For steady, high-volume apps, developers recommend asking for a higher limit rather than working around a temporary one [S4].`,
    // Activity → Saved.
    saved: {
      streaming:
        'Retries during streamed tool calls are the top cause of 429 errors; people back off using the Retry-After header and batch tool calls where they can.',
      longThreads:
        'Archive old threads on your side; keep a short running summary instead of resending the whole history with every request.',
      tips: 'Trust levels limit new accounts on purpose; trust level 1 unlocks after a little reading and participation, no application needed.',
      notifications:
        'Admins can set default notification levels per category; the defaults apply to new users and can be applied to existing ones too.'
    }
  },

  // ---------- Chrome Web Store images (store.mjs, store-shots.mjs) ----------
  store: {
    tipsSummary: `## Original post

A staff post answering the most common new-user questions: how trust levels work, why links are limited at first, and where to find the community guidelines.

## Key takeaways

- The limits stop spam, not genuine new members.
- Trust level 1 unlocks after a little reading, no application needed.`,
    tipsChat: [
      'Why can’t I post more than two links yet?',
      'New accounts (trust level 0) are limited to two links per post. It’s a **spam guard**, not a bug, and it lifts automatically at trust level 1.'
    ],
    // Typed into the question box of the first screenshot.
    draft: 'How long does that usually take?',
    agentAnswer:
      'Most 429s during streaming come from **retrying too fast**: a failed stream triggers an immediate new request [S1]. The fix people report most is **exponential backoff** that starts from the `Retry-After` header instead of a fixed delay [S2].',
    saved: {
      tips: 'Trust levels limit new accounts on purpose; trust level 1 unlocks after a little reading, no application needed.',
      notifications: 'Admins can set default notification levels per category for new users.'
    },
    captions: {
      '01': {
        title: 'Summarize any Discourse topic in seconds',
        sub: 'Get the main points of a long thread, then ask follow-up questions about it.'
      },
      '02': {
        title: 'Ask the whole forum — answers with sources',
        sub: 'An agent searches and reads step by step, then cites the posts it used.'
      },
      '03': {
        title: 'Discourse forums, WordPress comments and Reddit threads',
        sub: 'One click enables each site you use. Saved summaries and answers stay grouped by site.'
      },
      '04': {
        title: 'Bring your own AI',
        sub: 'Connect the AI provider you already use, or run a model on your own computer. Your key stays in your browser.'
      },
      '05': { title: 'Light and dark mode', sub: 'The side panel follows your system theme automatically.' }
    },
    // Promo tiles and the social preview (templates/store/*.html).
    promo: {
      tag: 'Your AI assistant<br>for the <span class="accent-text">comment section</span>',
      headline: 'Your AI assistant<br>for the <span class="accent-text">comment section</span>',
      points: ['Summaries and follow-up chat', 'Ask the forum, with cited sources', 'Discourse, WordPress and Reddit'],
      foot: 'Free and open source Chrome extension'
    }
  },

  // ---------- Demo GIF (demo-gif.mjs) ----------
  demo: {
    summary: { title: 'Summarize any Discourse topic', sub: 'One click reads every reply and gives you the main points.' },
    chat: { title: 'Ask follow-up questions', sub: 'Chat with the whole thread as context. No more scrolling back through replies.' },
    agent: { title: 'Ask the whole forum', sub: 'An agent searches and reads for you, then answers with sources you can click.' }
  },

  // ---------- Mock forum pages next to the panel (store.mjs) ----------
  forum: {
    // Discourse's own interface words on the mock pages.
    ui: {
      share: 'Share',
      reply: 'Reply',
      latest: 'Latest',
      top: 'Top',
      categories: 'Categories',
      bookmarks: 'Bookmarks',
      topic: 'Topic',
      replies: 'Replies',
      activity: 'Activity'
    },
    metaTips: {
      cat: 'Community',
      tags: ['faq', 'trust-levels'],
      started: 'Sep 2023',
      latest: '2h ago',
      posts: [
        {
          user: 'forum_team',
          badge: 'Staff',
          time: 'Sep 2023',
          body: [
            'Welcome! Here are answers to the questions new members ask most often.',
            '<b>Why can’t I post links or images yet?</b> New accounts start at trust level 0, which limits links per post. It’s a spam guard, and it lifts automatically after you read a few topics.',
            '<b>How do trust levels work?</b> You move up by reading, replying, and receiving likes. There is nothing to apply for.'
          ]
        },
        {
          user: 'pixelpenguin',
          time: 'Oct 2023',
          body: ['This cleared up a lot for me. I thought my account was broken when my second link was blocked!']
        },
        { user: 'trailrunner42', time: 'Nov 2023', body: ['Is flagging only for moderators, or can regular members review flags too?'] }
      ]
    },
    streaming: {
      cat: 'API',
      tags: ['streaming', 'rate-limits'],
      started: 'Aug 2026',
      latest: '2h ago',
      posts: [
        {
          user: 'async_otter',
          time: 'Aug 28',
          body: [
            'When a tool call arrives mid-stream, my client sometimes gets a 429 right after it retries. Is there a recommended way to handle rate limits while streaming?',
            'I’m retrying after a fixed one-second delay, which doesn’t seem to help much.'
          ]
        },
        {
          user: 'byte_gardener',
          time: 'Aug 28',
          body: ['Read the <code>Retry-After</code> header and back off from that value instead of a fixed delay. That fixed it for us.']
        },
        {
          user: 'null_island',
          time: 'Aug 29',
          body: ['Same issue here. Batching tool calls also helped, since each call counts toward the same limit.']
        }
      ]
    },
    longThreads: {
      cat: 'API',
      tags: ['assistants', 'context'],
      started: 'Jul 2026',
      latest: '5h ago',
      posts: [
        {
          user: 'quiet_compiler',
          time: 'Jul 14',
          body: [
            'Our support bot keeps conversations open for weeks. Resending the whole history every time is getting slow and expensive.',
            'How are others handling very long threads? Summaries, trimming, something else?'
          ]
        },
        {
          user: 'maple_syntax',
          time: 'Jul 14',
          body: ['We keep a short running summary and only send the last few turns in full. Old threads get archived on our side.']
        },
        { user: 'lambda_lark', time: 'Jul 15', body: ['+1 to the running summary. Refresh it every 10 turns or so.'] }
      ]
    },
    // The "Latest" list, top to bottom.
    latest: [
      { title: 'Streaming function calls with the Responses API', cat: 'API', act: '2h' },
      { title: 'How to request a higher rate limit', cat: 'API', act: '3h' },
      { title: 'Best practices for long-running assistant threads', cat: 'API', act: '5h' },
      { title: 'Batching several tool calls in one turn', cat: 'Prompting', act: '8h' },
      { title: 'Show us what you built this month', cat: 'Community', act: '9h' },
      { title: 'Guide: exponential backoff with Retry-After', cat: 'Documentation', act: '1d' },
      { title: 'Structured outputs return an empty object', cat: 'Bugs', act: '1d' }
    ]
  }
};
