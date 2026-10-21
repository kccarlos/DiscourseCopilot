// Fixture data for the README screenshots (docs/screenshots/), in the
// language of `copy` (copy/*.mjs).
import { META, OPENAI, MIN, now, session, chat, agentAnswer, rateLimitRun, topicsFor } from './forums.mjs';

// A list of alternating questions and answers → chat messages, `minsAgo`
// minutes ago for the first pair and one minute later for each next one.
const exchange = (lines, minsAgo) =>
  lines.map((content, index) => chat(index % 2 ? 'assistant' : 'user', content, minsAgo - Math.floor(index / 2)));

export function readmeFixtures(copy) {
  const topics = topicsFor(copy);
  const text = copy.readme;
  const run = rateLimitRun(copy);

  const metaTips = session(META, {
    ...topics.metaTipsReadme,
    totalPosts: 88,
    ageMin: 12,
    summary: text.tipsSummary,
    history: exchange(text.tipsChat, 9)
  });

  // The hero's Chat tab: the same topic with one more exchange.
  const metaTipsLongChat = { ...metaTips, history: [...metaTips.history, ...exchange(text.tipsMoreChat, 6)] };

  const metaLong = session(META, {
    ...topics.metaLong,
    totalPosts: 2431,
    pages: 25,
    ageMin: 6,
    summary: text.longSummary,
    history: exchange(text.longChat, 4)
  });

  const agentRun = agentAnswer({ id: 'readme', ...run, answer: text.agentAnswer });

  // The Activity screen's Saved tab: two forums, two topics each, plus the kept answer.
  const savedTopics = [
    session(OPENAI, {
      ...topics.streaming,
      totalPosts: 13,
      ageMin: 2 * 60,
      provider: 'openai',
      model: 'gpt-4o-mini',
      kept: true,
      summary: text.saved.streaming,
      history: [chat('user', 'q', 120), chat('assistant', 'a', 120), chat('user', 'q', 119), chat('assistant', 'a', 119)]
    }),
    session(OPENAI, {
      ...topics.longThreads,
      totalPosts: 32,
      ageMin: 5 * 60,
      provider: 'openai',
      model: 'gpt-4o-mini',
      summary: text.saved.longThreads
    }),
    session(META, { ...topics.metaTipsReadme, totalPosts: 88, ageMin: 12, summary: text.saved.tips, history: metaTips.history }),
    session(META, { ...topics.notifications, totalPosts: 20, ageMin: 9 * 60, summary: text.saved.notifications })
  ];
  const keptAgentRun = { ...agentRun, lastOpenedAt: now - 19 * MIN, kept: true };

  return { topics, metaTips, metaTipsLongChat, metaLong, agentRun, savedTopics, keptAgentRun, followUpDraft: text.longChat[0] };
}
