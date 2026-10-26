import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SITE_TYPE, createDefaultSiteRegistry, createSiteRegistry } from '../src/background/sites/index.mjs';
import { ForumToolClient } from '../src/background/forum-tools.mjs';

const adapter = (type, extra = {}) => ({ type, label: type, fetchTopicContent: async () => ({}), createToolClient: () => ({}), ...extra });

test('the default registry serves Discourse, including tasks saved before site types existed', () => {
  const sites = createDefaultSiteRegistry();
  assert.deepEqual(sites.types, ['discourse']);
  assert.equal(DEFAULT_SITE_TYPE, 'discourse');
  assert.equal(sites.forTask({}).type, 'discourse');
  assert.equal(sites.forTask({ siteType: 'discourse' }).type, 'discourse');
  assert.equal(sites.forTask(undefined).type, 'discourse');
});

test('the Discourse adapter builds the Discourse tool client for a run', () => {
  const client = createDefaultSiteRegistry().get('discourse').createToolClient({ siteUrl: 'https://forum.example/' });
  assert.ok(client instanceof ForumToolClient);
  assert.equal(client.siteUrl, 'https://forum.example');
});

test('an unknown site type is a clear, non-retryable error', () => {
  const sites = createDefaultSiteRegistry();
  assert.throws(
    () => sites.forTask({ siteType: 'nope' }),
    error => /Unsupported site type "nope"/.test(error.message) && error.retryable === false
  );
});

test('the registry routes each task to its own adapter and rejects incomplete or duplicate adapters', () => {
  const sites = createSiteRegistry([adapter('discourse'), adapter('wordpress')]);
  assert.equal(sites.forTask({ siteType: 'wordpress' }).type, 'wordpress');
  assert.equal(sites.forTask({}).type, 'discourse');
  assert.throws(() => createSiteRegistry([adapter('a', { createToolClient: undefined })]), /missing "createToolClient"/);
  assert.throws(() => createSiteRegistry([adapter('a'), adapter('a')]), /registered twice/);
});
