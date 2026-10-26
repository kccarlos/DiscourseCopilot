import { createSiteRegistry } from '../src/background/sites/index.mjs';

// A Discourse-typed registry whose adapter reads topics with the given
// function, for tests of the task executors.
export function sitesReading(fetchTopicContent) {
  return createSiteRegistry([{ type: 'discourse', label: 'Discourse', fetchTopicContent, createToolClient: () => ({}) }]);
}
