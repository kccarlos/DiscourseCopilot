// Fixture data for the README screenshots (docs/screenshots/).
import {
  META,
  OPENAI,
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
  slug: 'psa-new-user-tips-read-this-before-your-first-post',
  title: 'New user tips: read this before your first post'
};
export const META_LONG_TOPIC = {
  topicId: 187233,
  slug: 'what-are-you-working-on-2026-edition',
  title: 'What are you working on? (2026 edition)'
};
export { STREAMING_TOPIC, LONG_THREADS_TOPIC };

export const metaTips = session(META, {
  ...META_TIPS_TOPIC,
  totalPosts: 88,
  ageMin: 12,
  summary: `## Original post

A staff post collecting the most common new-user questions: how trust levels work, why some links need a few posts before they render, and where to find the community guidelines.

## Community response

- Most replies say **trust levels** are the biggest source of confusion — several people didn't realize new accounts are rate-limited on purpose.
- A moderator explains that flags are reviewed by the community, not just staff, and how the "Regular" level is earned.
- A few admins share plugins that build on the default trust-level behavior.

## Key takeaways

- New accounts are limited on purpose: it stops spam, not genuine new members.
- Trust level 1 unlocks after a little reading and participation, no application needed.
- Flag review is a community job, not only a staff one.`,
  history: [
    chat('user', 'Why can’t I post more than two links yet?', 9),
    chat(
      'assistant',
      'New accounts (trust level 0) are limited to two links per post. It’s a **spam guard**, not a bug, and it lifts automatically at trust level 1.',
      9
    ),
    chat('user', 'How long does that usually take?', 8),
    chat(
      'assistant',
      'For most people, a day or two of normal reading and a few genuine replies. There’s no application or waiting queue.',
      8
    )
  ]
});

export const metaLong = session(META, {
  ...META_LONG_TOPIC,
  totalPosts: 2431,
  pages: 25,
  ageMin: 6,
  summary: `## Original post

A long-running community thread where site owners share what they're building on Discourse this year, from themes and plugins to whole new communities.

## What people are building

- **Theme components**: many posts show custom home pages, sidebar tweaks and dark-mode palettes.
- **Automations**: several admins describe welcome flows and scheduled topic reminders.
- **Migrations**: a recurring group is moving from older forums and mailing lists, with tips on importing history.

## Useful tips from the thread

- Test theme changes on a staging site before rolling them out.
- Keep plugins to the ones you actively maintain; fewer means smoother upgrades.`,
  history: [
    chat('user', 'Which migration tips come up most often?', 4),
    chat(
      'assistant',
      'Import in batches, **map user accounts first**, and freeze the old forum before the final sync so no posts are lost.',
      4
    )
  ]
});

export const agentRun = agentAnswer({
  id: 'readme',
  question: RATE_LIMIT_QUESTION,
  searchQueries: RATE_LIMIT_QUERIES,
  sources: RATE_LIMIT_SOURCES,
  answer: `Rate-limit errors during streaming usually come from **retrying too fast**: a failed stream triggers an immediate new request [S1]. The fix most people report is exponential backoff that starts from the \`Retry-After\` header instead of a fixed delay [S2].

Several threads also suggest **batching tool calls**, because every call in a streamed turn counts toward the same per-minute limit [S3]. For steady, high-volume apps, developers recommend asking for a higher limit rather than working around a temporary one [S4].`
});

// The Activity screen's Saved tab: two forums, two topics each, plus the kept answer.
export const savedTopics = [
  session(OPENAI, {
    ...STREAMING_TOPIC,
    totalPosts: 13,
    ageMin: 2 * 60,
    provider: 'openai',
    model: 'gpt-4o-mini',
    kept: true,
    summary:
      'Retries during streamed tool calls are the top cause of 429 errors; people back off using the Retry-After header and batch tool calls where they can.',
    history: [chat('user', 'q', 120), chat('assistant', 'a', 120), chat('user', 'q', 119), chat('assistant', 'a', 119)]
  }),
  session(OPENAI, {
    ...LONG_THREADS_TOPIC,
    totalPosts: 32,
    ageMin: 5 * 60,
    provider: 'openai',
    model: 'gpt-4o-mini',
    summary: 'Archive old threads on your side; keep a short running summary instead of resending the whole history with every request.'
  }),
  session(META, {
    ...META_TIPS_TOPIC,
    totalPosts: 88,
    ageMin: 12,
    summary:
      'Trust levels limit new accounts on purpose; trust level 1 unlocks after a little reading and participation, no application needed.',
    history: metaTips.history
  }),
  session(META, {
    topicId: 229140,
    slug: 'category-specific-notification-defaults',
    title: 'Category-specific notification defaults',
    totalPosts: 20,
    ageMin: 9 * 60,
    summary:
      'Admins can set default notification levels per category; the defaults apply to new users and can be applied to existing ones too.'
  })
];
export const keptAgentRun = { ...agentRun, lastOpenedAt: now - 19 * MIN, kept: true };
