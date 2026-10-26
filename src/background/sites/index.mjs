// Site adapters: one per kind of site the extension can read. The task
// executors and the agent never talk to a platform directly; they ask the
// registry for the adapter of the task's site and call its methods.
//
// An adapter is a frozen object:
//   type                 stable id, stored on tasks as `siteType`
//   label                human name for messages
//   fetchTopicContent    (siteUrl, topicId, onProgress, signal, options) => content result
//   createToolClient     ({ siteUrl, signal, governor }) => client the agent tools call
// docs/adding-a-site.md describes each in full.
import { DEFAULT_SITE_TYPE } from '../../shared/site-types.mjs';
import { createDiscourseAdapter } from './discourse.mjs';
import { createWordPressSiteAdapter } from './wordpress.mjs';
import { createRedditSiteAdapter } from './reddit.mjs';

export { DEFAULT_SITE_TYPE };

const REQUIRED_MEMBERS = ['type', 'label', 'fetchTopicContent', 'createToolClient'];

export function createSiteRegistry(adapters) {
  const byType = new Map();
  for (const adapter of adapters) {
    for (const member of REQUIRED_MEMBERS) {
      if (!adapter?.[member]) {
        throw new Error(`Site adapter "${adapter?.type ?? '?'}" is missing "${member}"`);
      }
    }
    if (byType.has(adapter.type)) {
      throw new Error(`Site adapter "${adapter.type}" is registered twice`);
    }
    byType.set(adapter.type, adapter);
  }

  const get = type => {
    const adapter = byType.get(type);
    if (!adapter) {
      throw Object.assign(new Error(`Unsupported site type "${type}"`), { retryable: false });
    }
    return adapter;
  };

  return Object.freeze({
    types: Object.freeze([...byType.keys()]),
    get,
    // Tasks queued before site types existed have no siteType: Discourse.
    forTask: task => get(task?.siteType || DEFAULT_SITE_TYPE)
  });
}

export function createDefaultSiteRegistry(options) {
  return createSiteRegistry([createDiscourseAdapter(options), createWordPressSiteAdapter(options), createRedditSiteAdapter(options)]);
}
