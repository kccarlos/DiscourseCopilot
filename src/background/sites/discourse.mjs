// The Discourse site adapter: how a Discourse forum is read. The topic
// fetcher reads a topic's raw posts page by page; the tool client answers the
// agent's search, latest and read calls. Both stay in their own modules; this
// file only presents them under the shared adapter shape (see index.mjs).
import { createTopicFetcher } from '../topic-fetcher.mjs';
import { ForumToolClient } from '../forum-tools.mjs';

export const DISCOURSE_SITE_TYPE = 'discourse';

/**
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] replaces fetch (tests)
 */
export function createDiscourseAdapter({ fetchImpl } = {}) {
  return Object.freeze({
    type: DISCOURSE_SITE_TYPE,
    label: 'Discourse',
    // (siteUrl, topicId, onProgress, signal, { cachedPages, knownTotalPosts, maxPages })
    fetchTopicContent: createTopicFetcher({ fetchImpl }),
    // One client per agent run: searchForum, listLatest, getTopic, getRawPage.
    createToolClient: ({ siteUrl, signal, governor }) => new ForumToolClient({ siteUrl, signal, governor, fetchImpl })
  });
}
