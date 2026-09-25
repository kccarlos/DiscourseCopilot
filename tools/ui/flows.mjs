// UI regression suite: loads the built side panel and settings page (dist/)
// with the chrome.* stub, drives the main flows, asserts DOM state and
// screenshots each step. Fails on any failed check, page error or
// console.error, and on a brand image or favicon that doesn't load.
//
// Usage: node tools/ui/flows.mjs [--theme=light|dark|both] [--width=460] [--only=name,...] [--out=dir]
//   Screenshots go to tools/ui/out/flows/<theme>-<width>/ (or --out/<theme>-<width>/).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { DIST, OUT, onlyFilter, parseArgs, relative, requireDist } from './lib/env.mjs';
import { startServer } from './lib/static-server.mjs';
import { brandImagesLoaded, brokenIconLinks, openExtensionPage, seedHistory } from './lib/extension-page.mjs';
import {
  SITE, TOPIC_KEY, OAI, OAI_TOPIC, accessOptions, configuredStore, defaultStub, forumHomeState, modelRoutes, savedSessionHistory
} from './fixtures/flows.mjs';

const args = parseArgs();
const THEMES = { light: ['light'], dark: ['dark'], both: ['light', 'dark'] }[args.theme || 'both'];
if (!THEMES) throw new Error(`--theme must be light, dark or both (got ${args.theme})`);
const WIDTH = Number(args.width || 460);
const outRoot = path.resolve(typeof args.out === 'string' ? args.out : path.join(OUT, 'flows'));
const wanted = onlyFilter(args);

// ---------- Scenarios ----------

const scenarios = [];
// steps({ page, check, shot, outDir }) drives one page; check(label, ok, detail) records an assertion.
function scenario(name, pagePath, options, steps) {
  if (wanted(name)) scenarios.push({ name, pagePath, options, steps });
}

const text = (page, sel) => page.$eval(sel, el => el.textContent.trim().replace(/\s+/g, ' ')).catch(() => '<missing>');
const visible = (page, sel) => page.$eval(sel, el => !el.closest('.hidden') && !el.hidden && el.offsetParent !== null).catch(() => false);

// ---------- Popup ----------
scenario('popup-configured', 'src/popup/popup.html', { store: configuredStore }, async ({ page, check, shot }) => {
  check('chip names provider and model', (await text(page, '#modelChipBtn')) === 'OpenAI · gpt-4o-mini', await text(page, '#modelChipBtn'));
  check('chip visible, select hidden', (await visible(page, '#modelChipBtn')) && !(await visible(page, '#favoriteModelSelect')));
  check('chip accessible name', (await page.getAttribute('#modelChipBtn', 'aria-label')).includes('OpenAI · gpt-4o-mini'));
  check('no subline', (await page.$('#providerContext')) === null);
  check('logo loaded', await page.$eval('.brand-mark img', i => i.complete && i.naturalWidth > 0));
  await page.evaluate(() => { window.__openedOptions = 0; chrome.runtime.openOptionsPage = () => { window.__openedOptions++; }; });
  await page.click('#modelChipBtn');
  check('chip opens settings', await page.evaluate(() => window.__openedOptions === 1));
  check('summarize enabled', await page.$eval('#summarizeBtn', b => !b.disabled));
  check('setup card hidden', !(await visible(page, '#setupCard')));
  check('no idle status on a topic', !(await visible(page, '#status')), await text(page, '#status'));
  check('forum bar name', (await text(page, '#forumBarName')) === 'Discourse Meta', await text(page, '#forumBarName'));
  await shot();
});

scenario('popup-setup', 'src/popup/popup.html', { store: {} }, async ({ page, check, shot }) => {
  check('setup card visible', await visible(page, '#setupCard'));
  check('header says not set up', await visible(page, '#setupJumpBtn'));
  check('summarize disabled', await page.$eval('#summarizeBtn', b => b.disabled));
  await shot('fresh');
  // Invalid submit shows a field error.
  await page.click('label.setup-provider-option[data-provider="openai"]');
  await page.fill('#setupApiKey', '');
  await page.click('#setupSaveOnlyBtn');
  await page.waitForTimeout(100);
  check('field error for missing key', (await text(page, '#setupApiKeyError')).includes('API key is required'), await text(page, '#setupApiKeyError'));
  await shot('invalid');
  await page.fill('#setupApiKey', 'sk-new');
  await page.fill('#setupModel', 'gpt-4o');
  await page.click('#setupTestSaveBtn');
  await page.waitForTimeout(500);
  check('success shown', await visible(page, '#setupSuccess'), await text(page, '#setupCard'));
  check('success copy', (await text(page, '#setupSuccessText')).includes('Create summary'), await text(page, '#setupSuccessText'));
  check('stored provider', await page.evaluate(() => window.__store.selectedProvider === 'openai' && window.__store.openaiApiKey === 'sk-new'));
  check('header model after save', (await text(page, '#modelChipBtn')) === 'OpenAI · gpt-4o', await text(page, '#modelChipBtn'));
  check('not set up hidden after save', !(await visible(page, '#setupJumpBtn')));
  check('summarize enabled after save', await page.$eval('#summarizeBtn', b => !b.disabled));
  await shot('success');
  await page.click('#setupDoneBtn');
  await page.waitForTimeout(100);
  check('card hidden after done', !(await visible(page, '#setupCard')));
  // Removing the key elsewhere reopens setup.
  await page.evaluate(() => chrome.storage.local.remove('openaiApiKey'));
  await page.waitForTimeout(300);
  check('setup reopens when key removed', await visible(page, '#setupCard'));
  await shot('reopened');
});

// The live model list after a key is entered: pre-selection, the datalist,
// a model the user typed, and a key the provider refuses.
const datalistOptions = (page, sel) => page.$$eval(`${sel} option`, options => options.map(o => ({ value: o.value, label: o.label })));
scenario('popup-setup-models', 'src/popup/popup.html', { store: {}, routes: modelRoutes }, async ({ page, check, shot, requests }) => {
  await page.click('label.setup-provider-option[data-provider="anthropic"]');
  check('curated default before a key', (await page.inputValue('#setupModel')) === 'claude-haiku-4-5', await page.inputValue('#setupModel'));
  check('curated hint', (await text(page, '#setupModelHint')).startsWith('Prefilled with a fast, low-cost default'), await text(page, '#setupModelHint'));
  check('no list request without a key', !requests.some(r => r.url.includes('/v1/models')));
  await page.fill('#setupApiKey', 'sk-ant-good');
  await page.waitForTimeout(1000);
  check('list requested once after typing pauses', requests.filter(r => r.url.startsWith('https://api.anthropic.com/v1/models')).length === 1,
    JSON.stringify(requests.map(r => r.url)));
  check('recommended model pre-selected', (await page.inputValue('#setupModel')) === 'claude-haiku-4-5', await page.inputValue('#setupModel'));
  const anthropicOptions = await datalistOptions(page, '#setupModelList');
  check('datalist: recommended first, labelled', anthropicOptions[0]?.value === 'claude-haiku-4-5' && anthropicOptions[0]?.label === 'Recommended'
    && anthropicOptions.length === 3 && anthropicOptions.every(o => o.label === 'Recommended'), JSON.stringify(anthropicOptions));
  check('live-list hint', (await text(page, '#setupModelHint')).includes('Anthropic’s current list'), await text(page, '#setupModelHint'));
  await shot('anthropic');

  // OpenAI lists none of the curated models: a small one is picked.
  await page.click('label.setup-provider-option[data-provider="openai"]');
  check('openai curated default', (await page.inputValue('#setupModel')) === 'gpt-6-luna', await page.inputValue('#setupModel'));
  await page.fill('#setupApiKey', 'sk-good');
  await page.locator('#setupApiKey').blur();
  await page.waitForTimeout(400);
  check('heuristic pick when no recommended model is listed', (await page.inputValue('#setupModel')) === 'gpt-9-mini', await page.inputValue('#setupModel'));
  const openaiOptions = await datalistOptions(page, '#setupModelList');
  check('datalist has chat models only', JSON.stringify(openaiOptions.map(o => o.value)) === '["gpt-9","gpt-9-mini"]', JSON.stringify(openaiOptions));
  await shot('openai');
  // A model the user types is kept when the key changes.
  await page.fill('#setupModel', 'my-fine-tune');
  await page.fill('#setupApiKey', 'sk-good-2');
  await page.locator('#setupApiKey').blur();
  await page.waitForTimeout(400);
  check('typed model survives a new list', (await page.inputValue('#setupModel')) === 'my-fine-tune', await page.inputValue('#setupModel'));
  await page.click('#setupTestSaveBtn');
  await page.waitForTimeout(500);
  check('saved with the typed model', await page.evaluate(() => window.__store.openaiModel === 'my-fine-tune'), await page.evaluate(() => JSON.stringify(window.__store)));
  check('no API key in any request URL', !requests.some(r => /sk-/.test(r.url)), JSON.stringify(requests.map(r => r.url)));
});

const REFUSED_KEY_LOG = /^console\.error: Failed to load resource: the server responded with a status of 401/;
scenario('popup-setup-models-failure', 'src/popup/popup.html', { store: {}, routes: modelRoutes, allowErrors: [REFUSED_KEY_LOG] }, async ({ page, check, shot, requests }) => {
  await page.click('label.setup-provider-option[data-provider="openai"]');
  await page.fill('#setupApiKey', 'sk-bad');
  await page.locator('#setupApiKey').blur();
  await page.waitForTimeout(400);
  check('list was requested', requests.some(r => r.url === 'https://api.openai.com/v1/models'));
  check('curated default kept', (await page.inputValue('#setupModel')) === 'gpt-6-luna', await page.inputValue('#setupModel'));
  check('curated hint kept', (await text(page, '#setupModelHint')).startsWith('Prefilled with a fast, low-cost default'), await text(page, '#setupModelHint'));
  const options = await datalistOptions(page, '#setupModelList');
  check('curated suggestions', options[0]?.value === 'gpt-6-luna' && options[0]?.label === 'Recommended', JSON.stringify(options));
  check('no error shown before testing', !(await visible(page, '#setupApiKeyError')) && !(await visible(page, '#setupFormError')));
  await page.click('#setupTestSaveBtn');
  await page.waitForTimeout(500);
  check('test reports the key', (await text(page, '#setupApiKeyError')).includes('didn’t accept this API key') || (await text(page, '#setupApiKeyError')).includes("didn't accept this API key"), await text(page, '#setupApiKeyError'));
  check('nothing saved', await page.evaluate(() => !window.__store.openaiApiKey));
  await shot('bad-key');
});

scenario('popup-summary', 'src/popup/popup.html', {
  store: configuredStore,
  tasks: [{
    id: 'sum-1', type: 'summary', topicId: '12345', siteUrl: SITE, topicKey: TOPIC_KEY, agentRunId: '', title: 'Some topic',
    status: 'running', phase: 'fetching', statusText: 'Read 10 of 40 replies',
    progress: { currentPage: 1, totalPages: 4, totalPosts: 41, processedPosts: 11, percent: 25, etaMs: 12000 },
    error: '', createdAt: Date.now() - 5000, updatedAt: Date.now()
  }]
}, async ({ page, check, shot }) => {
  check('fetch progress visible', await visible(page, '#fetchProgress'));
  check('progress label', (await text(page, '#fetchProgressLabel')).includes('10 of 40'), await text(page, '#fetchProgressLabel'));
  check('summarize busy', await page.$eval('#summarizeBtn', b => b.disabled));
  await shot('fetching');
  await page.evaluate(() => {
    const task = { id: 'sum-1', type: 'summary', topicId: '12345', siteUrl: 'https://meta.discourse.org', topicKey: 'meta.discourse.org/t/12345', status: 'running', phase: 'generating', statusText: 'Generating summary…', progress: null, error: '', createdAt: Date.now() - 5000, updatedAt: Date.now() };
    window.__fire('onMessage', { action: 'taskUpdated', task }, {});
    window.__fire('onMessage', { action: 'taskStream', taskId: 'sum-1', topicKey: 'meta.discourse.org/t/12345', type: 'summary', chunk: '## Overview\n\nThe thread discusses **caching**.' }, {});
  });
  await page.waitForTimeout(300);
  check('summary streamed', (await text(page, '#summaryDisplay')).includes('caching'), await text(page, '#summaryDisplay'));
  check('generating status', (await text(page, '#status')).includes('creating your summary'), await text(page, '#status'));
  await shot('streaming');
  // Rich markdown and hostile HTML/URLs from the model go through marked and the sanitizer.
  await page.evaluate(() => {
    window.__fire('onMessage', { action: 'taskStream', taskId: 'sum-1', topicKey: 'meta.discourse.org/t/12345', type: 'summary', chunk: [
      '', '', '### Options', '', '| Option | Default |', '| --- | --- |', '| A | `1` |', '',
      '- one', '- two', '', '```js', 'const a = "<b>";', '```', '',
      '[docs](https://example.com) [bad](javascript:alert(1)) [data](data:text/html,x) <a href="JaVaScRiPt:alert(2)" onclick="x()">raw</a>',
      '<img src="x" onerror="alert(3)"><script>alert(4)</script><iframe src="https://example.com"></iframe>'
    ].join('\n') }, {});
  });
  await page.waitForTimeout(300);
  const rendered = await page.$eval('#summaryDisplay', el => ({
    h3: el.querySelectorAll('h3').length,
    cells: el.querySelectorAll('table thead th, table tbody td').length,
    items: el.querySelectorAll('ul > li').length,
    code: el.querySelector('pre code')?.textContent || '',
    hrefs: [...el.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
    external: [...el.querySelectorAll('a[href^="https:"]')].every(a => a.target === '_blank' && a.rel === 'noopener noreferrer'),
    blocked: el.querySelectorAll('img, script, iframe, input, [onclick], [onerror], [style]').length,
    linkTexts: [...el.querySelectorAll('a')].map(a => a.textContent)
  }));
  check('markdown heading, table, list and code rendered',
    rendered.h3 === 1 && rendered.cells === 4 && rendered.items === 2 && rendered.code.includes('const a = "<b>";'),
    JSON.stringify(rendered));
  check('only safe link hrefs kept', JSON.stringify(rendered.hrefs) === '["https://example.com"]' && rendered.external, JSON.stringify(rendered.hrefs));
  check('unsafe links keep their text', ['bad', 'data', 'raw'].every(label => rendered.linkTexts.includes(label)), JSON.stringify(rendered.linkTexts));
  check('disallowed elements and attributes removed', rendered.blocked === 0, String(rendered.blocked));
  await page.evaluate(() => {
    const task = { id: 'sum-1', type: 'summary', topicId: '12345', siteUrl: 'https://meta.discourse.org', topicKey: 'meta.discourse.org/t/12345', status: 'failed', phase: 'failed', statusText: 'Failed', progress: null, error: 'Boom', createdAt: Date.now() - 5000, updatedAt: Date.now() };
    window.__fire('onMessage', { action: 'taskUpdated', task }, {});
  });
  await page.waitForTimeout(100);
  check('failed status', (await text(page, '#status')) === 'Task failed: Boom', await text(page, '#status'));
  // Start a summary.
  await page.click('#summarizeBtn');
  await page.waitForTimeout(200);
  check('enqueue sent', await page.evaluate(() => window.__sent.some(m => m.action === 'enqueueTask' && m.taskType === 'summary' && m.provider === 'openai' && m.settings.apiKey === 'sk-test')));
  check('queued status', (await text(page, '#status')).startsWith('Task queued'), await text(page, '#status'));
  await shot('queued');
});

scenario('popup-agent', 'src/popup/popup.html', {
  store: { ...configuredStore, favoriteModels: [{ provider: 'openai', model: 'gpt-4o-mini' }, { provider: 'anthropic', model: 'claude-sonnet-5' }], anthropicApiKey: 'ak' },
  tasks: [{
    id: 'agent-1', type: 'agent', topicId: null, siteUrl: SITE, topicKey: '', agentRunId: 'run-1', clientRequestId: '', title: 'How do I enable caching?',
    question: 'How do I enable caching?', forumName: 'Discourse Meta', status: 'running', phase: 'searching', statusText: 'Searching…',
    progress: { percent: 30 }, error: '', createdAt: Date.now() - 5000, updatedAt: Date.now()
  }]
}, async ({ page, check, shot }) => {
  check('agent panel visible', await visible(page, '#agentPanel'));
  check('ask the forum enabled while another run is going', await page.$eval('#agentLaunchBtn', b => !b.disabled));
  check('agent question', (await text(page, '#agentPanel [data-part="question"]')).includes('caching'));
  await shot('running');
  await page.evaluate(() => {
    const now = Date.now();
    window.__fire('onMessage', { action: 'activityUpdated', activity: {
      schemaVersion: 1, activityId: 'run-1', activityType: 'agent', taskId: 'agent-1', agentRunId: 'run-1',
      title: 'How do I enable caching?', question: 'How do I enable caching?', siteUrl: 'https://meta.discourse.org', forumName: 'Discourse Meta',
      searchQueries: [{ query: 'enable caching', resultCount: 3 }], toolCalls: [],
      sourceRefs: [{ sourceId: 'S1', title: 'Caching guide', url: 'https://meta.discourse.org/t/caching/1', excerpt: 'Turn it on in settings.', siteUrl: 'https://meta.discourse.org' }],
      answer: 'Enable it in the admin panel [S1].', answerStatus: 'answered', status: 'running', phase: 'generating', statusText: 'Writing', progress: { percent: 90 },
      error: null, provider: 'openai', model: 'gpt-4o-mini', createdAt: now - 5000, updatedAt: now, startedAt: now - 4000, completedAt: 0, expiresAt: 0, kept: false, retryOf: '', lastOpenedAt: 0, dismissedAt: 0
    } }, {});
    const task = { id: 'agent-1', type: 'agent', siteUrl: 'https://meta.discourse.org', topicKey: '', agentRunId: 'run-1', title: 'How do I enable caching?', question: 'How do I enable caching?', status: 'completed', phase: 'completed', statusText: 'Completed', progress: null, error: '', createdAt: now - 5000, updatedAt: now };
    window.__fire('onMessage', { action: 'taskUpdated', task }, {});
    window.__fire('onMessage', { action: 'activityUpdated', activity: {
      schemaVersion: 1, activityId: 'run-1', activityType: 'agent', taskId: 'agent-1', agentRunId: 'run-1',
      title: 'How do I enable caching?', question: 'How do I enable caching?', siteUrl: 'https://meta.discourse.org', forumName: 'Discourse Meta',
      searchQueries: [{ query: 'enable caching', resultCount: 3 }], toolCalls: [],
      sourceRefs: [{ sourceId: 'S1', title: 'Caching guide', url: 'https://meta.discourse.org/t/caching/1', excerpt: 'Turn it on in settings.', siteUrl: 'https://meta.discourse.org' }],
      answer: 'Enable it in the admin panel [S1].', answerStatus: 'answered', status: 'completed', phase: 'completed', statusText: 'Completed', progress: { percent: 100 },
      error: null, provider: 'openai', model: 'gpt-4o-mini', createdAt: now - 5000, updatedAt: now + 1, startedAt: now - 4000, completedAt: now, expiresAt: now + 86400000, kept: false, retryOf: '', lastOpenedAt: 0, dismissedAt: 0
    } }, {});
  });
  await page.waitForTimeout(400);
  check('answer rendered', (await text(page, '#agentPanel [data-part="answer"]')).includes('admin panel'), await text(page, '#agentPanel [data-part="answer"]'));
  check('citation linked', (await page.$$('#agentPanel .agent-citation')).length === 1);
  check('answer announced', (await text(page, '#agentAnnouncer')) === 'Answer ready', await text(page, '#agentAnnouncer'));
  check('copy action', (await text(page, '#agentPanel [data-part="actions"]')).includes('Copy answer'), await text(page, '#agentPanel [data-part="actions"]'));
  await shot('answered');
  // Composer.
  await page.click('#agentPanel [data-agent-action="ask-another"]');
  await page.waitForTimeout(100);
  check('composer open', await visible(page, '#agentComposer'));
  check('composer heading', (await text(page, '#agentComposerHeading')) === 'Search Discourse Meta', await text(page, '#agentComposerHeading'));
  await page.fill('#agentInput', 'What about CDN?');
  check('send enabled', await page.$eval('#sendAgentBtn', b => !b.disabled));
  await shot('composer');
  await page.click('#sendAgentBtn');
  await page.waitForTimeout(300);
  check('agent enqueue sent', await page.evaluate(() => window.__sent.some(m => m.action === 'enqueueTask' && m.taskType === 'agent' && m.question === 'What about CDN?')));
  check('composer closed', !(await visible(page, '#agentComposer')));
  check('panel follows new run', (await text(page, '#agentPanel [data-part="question"]')).includes('CDN'), await text(page, '#agentPanel [data-part="question"]'));
  await shot('queued');
  // Favorite switch.
  const options = await page.$$eval('#favoriteModelSelect option', os => os.map(o => o.value));
  check('favorites listed', options.length === 2, JSON.stringify(options));
  check('active favorite selected', (await page.$eval('#favoriteModelSelect', s => s.selectedOptions[0].textContent)) === 'OpenAI · gpt-4o-mini');
  check('chip hidden with favorites', !(await visible(page, '#modelChipBtn')));
  await page.selectOption('#favoriteModelSelect', options[1]);
  await page.waitForTimeout(300);
  check('switched provider', (await page.$eval('#favoriteModelSelect', s => s.selectedOptions[0].textContent)) === 'Anthropic · claude-sonnet-5');
  check('switch status', (await text(page, '#status')) === 'Using Anthropic · claude-sonnet-5', await text(page, '#status'));
  await shot('switched');
});

scenario('popup-activity', 'src/popup/popup.html', {
  store: configuredStore,
  tasks: [
    { id: 'sum-2', type: 'summary', topicId: '12345', siteUrl: SITE, topicKey: TOPIC_KEY, agentRunId: '', title: 'Some topic - Discourse Meta', forumName: 'Discourse Meta', status: 'queued', phase: 'queued', statusText: 'Waiting for an available worker…', progress: null, error: '', createdAt: Date.now() - 3000, updatedAt: Date.now() },
    { id: 'chat-9', type: 'chat', topicId: '777', siteUrl: 'https://forum.example.com', topicKey: 'forum.example.com/t/777', agentRunId: '', title: 'Other topic', status: 'completed', phase: 'completed', statusText: 'Completed', progress: null, error: '', createdAt: Date.now() - 90000, updatedAt: Date.now() - 80000 },
    { id: 'agent-9', type: 'agent', topicId: null, siteUrl: 'https://forum.example.com', topicKey: '', agentRunId: 'run-9', clientRequestId: '', title: 'Q?', question: 'Q?', status: 'failed', phase: 'failed', statusText: 'Failed', progress: null, error: 'Model error', createdAt: Date.now() - 70000, updatedAt: Date.now() - 60000 }
  ]
}, async ({ page, check, shot }) => {
  await page.click('#savedBtn');
  await page.waitForTimeout(400);
  check('saved view visible', await visible(page, '#savedView'));
  check('topic view hidden', !(await visible(page, '#topicView')));
  check('active count', (await text(page, '#taskCount')) === '1', await text(page, '#taskCount'));
  check('recent count', (await text(page, '#recentTaskCount')) === '2', await text(page, '#recentTaskCount'));
  check('forum filter shown', (await page.$$('#forumFilter .forum-filter-chip')).length === 3);
  check('queue position', (await text(page, '#activeTaskList')).includes('Queue position 1'), await text(page, '#activeTaskList'));
  check('retry on failed agent', (await text(page, '#taskList')).includes('Retry'));
  await shot('tasks');
  await page.click('#summariesTab');
  await page.waitForTimeout(200);
  check('saved panel visible', await visible(page, '#summariesPanel'));
  check('saved empty', (await text(page, '#savedList')).includes('No saved items yet'), await text(page, '#savedList'));
  await shot('saved');
  await page.click('#closeSavedBtn');
  await page.waitForTimeout(100);
  check('back to topic', await visible(page, '#topicView'));
});

scenario('popup-forum-home', 'src/popup/popup.html', {
  store: configuredStore, tabUrl: `${SITE}/latest`, tabTitle: 'Latest - Discourse Meta', pageState: forumHomeState
}, async ({ page, check, shot }) => {
  check('summarize disabled off-topic', await page.$eval('#summarizeBtn', b => b.disabled));
  check('summarize hidden off-topic', !(await visible(page, '#summarizeBtn')));
  check('agent enabled and visible', await page.$eval('#agentLaunchBtn', b => !b.disabled && b.offsetParent !== null));
  check('eyebrow', (await text(page, '#heroEyebrow')) === 'Discourse forum', await text(page, '#heroEyebrow'));
  check('title', (await text(page, '#currentPageTitle')) === 'You’re on Discourse Meta', await text(page, '#currentPageTitle'));
  check('helper', (await text(page, '#topicHelper')) === 'Open any topic to summarize it, or ask the forum a question.', await text(page, '#topicHelper'));
  check('no idle status', !(await visible(page, '#status')), await text(page, '#status'));
  check('no guide card', !(await visible(page, '#pageGuide')));
  check('no welcome panel', !(await visible(page, '#welcomePanel')));
  await shot();
});

scenario('popup-not-forum', 'src/popup/popup.html', {
  store: {}, tabUrl: 'https://example.com/', tabTitle: 'Example', pageState: { url: 'https://example.com/', isDiscourse: false },
  // Opened with the toolbar icon (activeTab): the panel probes the page.
  activeTab: true, probe: { url: 'https://example.com/', isDiscourse: false, basePath: '', forumName: '' }
}, async ({ page, check, shot }) => {
  check('not a forum', (await text(page, '#forumBarName')) === 'Not a Discourse forum');
  check('no hero, no disabled actions', !(await visible(page, '#summarizeBtn')) && !(await visible(page, '#agentLaunchBtn')) && !(await visible(page, '#currentPageTitle')));
  check('guide heading', (await text(page, '#pageGuideHeading')) === 'This page isn’t a Discourse forum', await text(page, '#pageGuideHeading'));
  check('setup card first', await page.evaluate(() => {
    const setup = document.getElementById('setupCard');
    const guide = document.getElementById('pageGuide');
    return setup.offsetParent !== null && Boolean(setup.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  check('no checklist', !(await visible(page, '#getStarted')));
  check('no welcome panel', !(await visible(page, '#welcomePanel')));
  await shot();
});

scenario('popup-not-forum-ready', 'src/popup/popup.html', {
  store: configuredStore, tabUrl: 'https://example.com/', tabTitle: 'Example', pageState: { url: 'https://example.com/', isDiscourse: false },
  activeTab: true, probe: { url: 'https://example.com/', isDiscourse: false, basePath: '', forumName: '' }
}, async ({ page, check, shot }) => {
  check('guide heading', (await text(page, '#pageGuideHeading')) === 'This page isn’t a Discourse forum', await text(page, '#pageGuideHeading'));
  check('guide explains', (await text(page, '#pageGuideText')).includes('forums built with Discourse'), await text(page, '#pageGuideText'));
  const links = await page.$$eval('#pageGuideLinks a', as => as.map(a => ({ href: a.href, target: a.target, rel: a.rel, text: a.textContent })));
  check('two example links in new tabs', links.length === 2 && links.every(l => l.target === '_blank' && l.rel.includes('noopener')) && links[0].href === 'https://meta.discourse.org/' && links[1].href === 'https://community.openai.com/', JSON.stringify(links));
  check('no action button', !(await visible(page, '#forumAccessBtn')));
  check('no hero', !(await visible(page, '#currentPageTitle')));
  check('no welcome panel', !(await visible(page, '#welcomePanel')));
  check('no idle status', !(await visible(page, '#status')), await text(page, '#status'));
  check('no setup card', !(await visible(page, '#setupCard')));
  await shot();
});




scenario('popup-chat', 'src/popup/popup.html', { store: configuredStore }, async ({ page, check, shot }) => {
  await seedHistory(page, savedSessionHistory());
  await page.reload();
  await page.waitForTimeout(700);
  check('summary restored', (await text(page, '#summaryDisplay')).includes('caching'), await text(page, '#summaryDisplay'));
  check('summary meta', (await text(page, '#summaryMeta')).startsWith('11 replies · saved'), await text(page, '#summaryMeta'));
  check('button offers refresh', (await text(page, '#summarizeBtn')) === 'Check for new replies', await text(page, '#summarizeBtn'));
  check('history restored', (await page.$$('#chatMessages .chat-message')).length === 2);
  check('helper', (await text(page, '#topicHelper')) === 'Your saved summary and conversation are ready.', await text(page, '#topicHelper'));
  check('copy post enabled', await page.$eval('#copyPostBtn', b => !b.disabled));
  check('context help', (await text(page, '#forumContextLimitHelp')).startsWith('The full discussion fits'), await text(page, '#forumContextLimitHelp'));
  check('send disabled without text', await page.$eval('#sendChatBtn', b => b.disabled));
  await shot('restored');
  await page.fill('#chatInput', 'Any caveats?');
  check('send enabled', await page.$eval('#sendChatBtn', b => !b.disabled));
  await page.click('#sendChatBtn');
  await page.waitForTimeout(300);
  const sent = await page.evaluate(() => window.__sent.find(m => m.action === 'enqueueTask' && m.taskType === 'chat'));
  check('chat enqueued', sent?.question === 'Any caveats?' && sent?.maxPostChars === 30000, JSON.stringify(sent));
  check('pending bubbles', (await page.$$('#chatMessages .chat-message')).length === 4);
  check('queued bubble text', (await text(page, '#chatMessages .chat-message.assistant.pending')).includes('Queued'), await text(page, '#chatMessages'));
  check('input cleared', (await page.$eval('#chatInput', i => i.value)) === '');
  const taskId = await page.evaluate(() => window.__sent.filter(m => m.action === 'enqueueTask').length && document.querySelector('.chat-message.assistant.pending').dataset.taskId);
  await page.evaluate(taskId => {
    window.__fire('onMessage', { action: 'taskStream', taskId, topicKey: 'meta.discourse.org/t/12345', type: 'chat', chunk: 'One caveat: **cost**.' }, {});
  }, taskId);
  await page.waitForTimeout(200);
  check('answer streamed', (await text(page, `.chat-message.assistant[data-task-id="${taskId}"]`)).includes('cost'));
  check('edit locked while task runs', await page.$eval('.chat-edit-btn', b => b.disabled));
  await shot('streaming');
  // Context slider.
  await page.$eval('#forumContextLimit', el => { el.value = '200000'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  check('limit saved', await page.evaluate(() => window.__store.forumContextLimit === 200000));
  check('no warning for a short discussion', !(await visible(page, '#forumContextLimitWarning')));
  check('limit shown', (await text(page, '#forumContextLimitValue')).startsWith('200,000'), await text(page, '#forumContextLimitValue'));
});

scenario('popup-chat-edit', 'src/popup/popup.html', { store: configuredStore }, async ({ page, check, shot }) => {
  await seedHistory(page, savedSessionHistory());
  await page.reload();
  await page.waitForTimeout(700);
  await page.click('.chat-edit-btn');
  await page.waitForTimeout(300);
  check('edit restores prompt', (await page.$eval('#chatInput', i => i.value)) === 'What is the consensus?');
  check('later replies removed', (await page.$$('#chatMessages .chat-message')).length === 0);
  check('edit status', (await text(page, '#status')) === 'Message ready to edit. Later replies were removed.', await text(page, '#status'));
  await shot();
  await page.click('#clearChatBtn').catch(() => {});
  // Saved list shows the session.
  await page.click('#savedBtn');
  await page.waitForTimeout(400);
  await page.click('#summariesTab');
  await page.waitForTimeout(200);
  check('saved card', (await page.$$('#savedList .saved-card')).length === 1, await text(page, '#savedList'));
  check('saved card is current', (await text(page, '#savedList .saved-card .open-saved')) === 'View current session');
  await shot('saved');
  await page.click('#savedList .keep-saved');
  await page.waitForTimeout(300);
  check('kept', (await text(page, '#savedList .keep-saved')) === 'Unkeep', await text(page, '#savedList .keep-saved'));
  await page.click('#savedList .open-saved');
  await page.waitForTimeout(200);
  check('back on topic', await visible(page, '#topicView'));
  await page.click('#savedBtn');
  await page.waitForTimeout(300);
  await page.click('#summariesTab');
  await page.click('#savedList .delete-saved');
  await page.waitForTimeout(300);
  check('deleted', (await text(page, '#savedList')).includes('No saved items yet'), await text(page, '#savedList'));
  await page.click('#closeSavedBtn');
  await page.waitForTimeout(100);
  check('summary gone after delete', !(await visible(page, '#summaryContainer')));
});

scenario('popup-agent-detail', 'src/popup/popup.html', {
  store: configuredStore,
  tasks: [
    { id: 'agent-5', type: 'agent', topicId: null, siteUrl: 'https://forum.example.com', topicKey: '', agentRunId: 'run-5', clientRequestId: '', title: 'Other forum question', question: 'Other forum question', status: 'running', phase: 'searching', statusText: 'Searching…', progress: { percent: 20 }, error: '', createdAt: Date.now() - 4000, updatedAt: Date.now() },
    { id: 'sum-7', type: 'summary', topicId: '12345', siteUrl: SITE, topicKey: TOPIC_KEY, agentRunId: '', clientRequestId: '', title: 'Some topic', status: 'queued', phase: 'queued', statusText: 'Waiting for an available worker…', progress: null, error: '', createdAt: Date.now() - 1000, updatedAt: Date.now() }
  ]
}, async ({ page, check, shot }) => {
  // The background writes the run's activity when it queues the task.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('discourse-copilot-history');
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['agentActivities'], 'readwrite');
      const now = Date.now();
      tx.objectStore('agentActivities').put({
        schemaVersion: 1, activityId: 'run-5', activityType: 'agent', taskId: 'agent-5', agentRunId: 'run-5',
        title: 'Other forum question', question: 'Other forum question', siteUrl: 'https://forum.example.com', forumName: '',
        searchQueries: [], toolCalls: [], sourceRefs: [], answer: '', answerStatus: 'pending', status: 'queued', phase: 'queued',
        statusText: 'Waiting for an available worker…', progress: null, error: null, provider: 'openai', model: 'gpt-4o-mini',
        createdAt: now - 4000, updatedAt: now - 4000, startedAt: 0, completedAt: 0, expiresAt: 0, kept: false, retryOf: '', lastOpenedAt: 0, dismissedAt: 0
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    open.onerror = () => reject(open.error);
  }));
  await page.reload();
  await page.waitForTimeout(700);
  check('pill for other forum', await visible(page, '#agentPill'));
  check('pill text', (await text(page, '#agentPillText')) === 'Researching on forum.example.com…', await text(page, '#agentPillText'));
  check('queued status', (await text(page, '#status')).startsWith('Task queued'), await text(page, '#status'));
  await shot('pill');
  await page.click('#agentPill');
  await page.waitForTimeout(300);
  check('detail open', await visible(page, '#agentDetailView'));
  check('detail heading', (await text(page, '#agentDetailHeading')) === 'Other forum question', await text(page, '#agentDetailHeading'));
  check('detail meta', (await text(page, '#agentDetailMeta')).includes('Researching'), await text(page, '#agentDetailMeta'));
  check('back label', await page.$eval('#closeAgentDetailBtn', b => b.getAttribute('aria-label') === 'Back to current page'));
  await shot('detail');
  await page.click('#closeAgentDetailBtn');
  await page.waitForTimeout(200);
  check('back to topic', await visible(page, '#topicView'));
  // Cancel from Activity.
  await page.click('#savedBtn');
  await page.waitForTimeout(300);
  const stopButtons = await page.$$('#activeTaskList button');
  check('stop buttons', stopButtons.length >= 2);
  await page.click('#activeTaskList .task-card:not(.agent) button:has-text("Stop task")');
  await page.waitForTimeout(300);
  check('cancel sent', await page.evaluate(() => window.__sent.some(m => m.action === 'cancelTask' && m.taskId === 'sum-7')));
  check('cancelled moved to recent', (await text(page, '#taskList')).includes('cancelled'), await text(page, '#taskList'));
  await shot('cancelled');
});

scenario('popup-header-narrow', 'src/popup/popup.html', {
  width: 360,
  store: { ...configuredStore, openaiModel: 'gpt-4o-mini-2024-07-18-with-an-extra-long-fine-tune-suffix', favoriteModels: [{ provider: 'anthropic', model: 'claude-sonnet-5' }], anthropicApiKey: 'ak' }
}, async ({ page, check, shot, outDir }) => {
  const sel = await page.$eval('#favoriteModelSelect', s => ({ text: s.selectedOptions[0].textContent, n: s.options.length, title: s.title, w: s.getBoundingClientRect().right }));
  check('non-favorite active model selected first', sel.n === 2 && sel.text.startsWith('OpenAI · gpt-4o-mini-2024'), JSON.stringify(sel));
  check('full name in title', sel.title.includes('fine-tune-suffix'));
  const nav = await page.$eval('.header-actions', n => n.getBoundingClientRect().left);
  check('switcher does not overlap nav', sel.w <= nav, `${sel.w} vs ${nav}`);
  check('no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(outDir, 'popup-header-narrow-top.png'), clip: { x: 0, y: 0, width: 360, height: 90 } });
  await shot();
});

scenario('popup-no-background', 'src/popup/popup.html', { store: configuredStore, noBackground: true }, async ({ page, check, shot }) => {
  check('recovery banner', await visible(page, '#backgroundRecovery'));
  check('summarize disabled', await page.$eval('#summarizeBtn', b => b.disabled));
  check('status hidden', !(await visible(page, '#status')));
  await shot();
});

scenario('popup-forum-switch', 'src/popup/popup.html', { store: configuredStore, granted: ['https://meta.discourse.org/*', 'https://forum.example.com/*'] }, async ({ page, check, shot }) => {
  await page.evaluate(() => {
    window.__switch = true;
    chrome.tabs.query = async () => [{ id: 3, windowId: 1, index: 1, active: true, url: 'https://forum.example.com/t/other/9', title: 'Other - Example Forum' }];
    chrome.tabs.sendMessage = async () => ({ url: 'https://forum.example.com/t/other/9', isDiscourse: true, isForumPage: true, isForumTopic: true, postId: '9', topicId: '9', siteUrl: 'https://forum.example.com', basePath: '', forumName: 'Example Forum', topicKey: 'forum.example.com/t/9' });
    window.__fire('onActivated', { tabId: 3 });
  });
  await page.waitForTimeout(400);
  check('forum name', (await text(page, '#forumBarName')) === 'Example Forum', await text(page, '#forumBarName'));
  check('switch announced', (await text(page, '#forumSwitchAnnouncer')) === 'Switched to Example Forum', await text(page, '#forumSwitchAnnouncer'));
  check('title', (await text(page, '#currentPageTitle')) === 'Other', await text(page, '#currentPageTitle'));
  await shot();
});

// ---------- Settings ----------
scenario('settings-configured', 'src/settings/settings.html', { store: configuredStore }, async ({ page, check, shot }) => {
  check('saved header', (await text(page, '#savedConfiguration')) === 'OpenAI · gpt-4o-mini', await text(page, '#savedConfiguration'));
  check('indicator saved', (await text(page, '#dirtyIndicator')) === 'All changes saved', await text(page, '#dirtyIndicator'));
  check('provider select', await page.$eval('#providerSelect', s => s.value === 'openai'));
  await shot('loaded');
  await page.fill('#openaiModel', 'gpt-4.1');
  check('indicator dirty', (await text(page, '#dirtyIndicator')) === 'Unsaved changes', await text(page, '#dirtyIndicator'));
  await shot('dirty');
  await page.click('#testBtn');
  await page.waitForTimeout(300);
  check('test success', (await text(page, '#status')) === 'OpenAI connection successful.', await text(page, '#status'));
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  check('save status', (await text(page, '#status')) === 'Settings saved successfully.', await text(page, '#status'));
  check('indicator saved again', (await text(page, '#dirtyIndicator')) === 'All changes saved', await text(page, '#dirtyIndicator'));
  check('stored model', await page.evaluate(() => window.__store.openaiModel === 'gpt-4.1'));
  check('header updated', (await text(page, '#savedConfiguration')) === 'OpenAI · gpt-4.1', await text(page, '#savedConfiguration'));
  await shot('saved');
  // Favorites.
  await page.click('#addFavoriteBtn');
  await page.waitForTimeout(200);
  check('favorite added', (await page.$$('#favoriteModelList .favorite-model-item')).length === 1);
  check('favorite status', (await text(page, '#status')).startsWith('Favorite model added'), await text(page, '#status'));
  check('add disabled for existing', (await text(page, '#addFavoriteBtn')) === 'Already a favorite', await text(page, '#addFavoriteBtn'));
  await page.click('.favorite-remove');
  await page.waitForTimeout(200);
  check('favorite removed', (await page.$$('#favoriteModelList .favorite-model-item')).length === 0);
  // Reset.
  await page.click('#resetBtn');
  await page.waitForTimeout(300);
  check('reset status', (await text(page, '#status')) === 'Settings reset to defaults.', await text(page, '#status'));
  check('reset provider', await page.$eval('#providerSelect', s => s.value === 'openrouter'));
  check('storage cleared', await page.evaluate(() => Object.keys(window.__store).length === 0), await page.evaluate(() => JSON.stringify(window.__store)));
  check('header not set up', (await text(page, '#savedConfiguration')).startsWith('Not set up yet'), await text(page, '#savedConfiguration'));
  await shot('reset');
});

scenario('settings-fresh', 'src/settings/settings.html', { store: { extensionSettings: { old: true } } }, async ({ page, check, shot }) => {
  check('not set up', (await text(page, '#savedConfiguration')) === 'Not set up yet — add an API key', await text(page, '#savedConfiguration'));
  check('no indicator', !(await visible(page, '#dirtyIndicator')));
  await page.click('#saveBtn');
  await page.waitForTimeout(100);
  check('invalid status', (await text(page, '#status')) === 'OpenRouter API key is required.', await text(page, '#status'));
  check('field marked invalid', await page.$eval('#openrouterApiKey', i => i.getAttribute('aria-invalid') === 'true'));
  await shot('invalid');
  await page.selectOption('#providerSelect', 'ollama');
  check('ollama section', await visible(page, '#config-ollama'));
  check('dirty after provider change', (await text(page, '#dirtyIndicator')) === 'Unsaved changes');
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  check('saved ollama', (await text(page, '#savedConfiguration')) === 'Ollama (Local) · llama3.2', await text(page, '#savedConfiguration'));
  await shot('saved');
});

// A saved model the provider no longer lists: a warning, never a change.
scenario('settings-model-missing', 'src/settings/settings.html', {
  store: { selectedProvider: 'openai', openaiApiKey: 'sk-good', openaiModel: 'gpt-4o-mini' }, routes: modelRoutes
}, async ({ page, check, shot, requests }) => {
  await page.waitForTimeout(300);
  check('list loaded for the saved key', requests.some(r => r.url === 'https://api.openai.com/v1/models'));
  check('saved model unchanged', (await page.inputValue('#openaiModel')) === 'gpt-4o-mini', await page.inputValue('#openaiModel'));
  check('warning shown', (await visible(page, '#openaiModelWarning'))
    && (await text(page, '#openaiModelWarning')) === 'This model is no longer offered by OpenAI. Choose another.', await text(page, '#openaiModelWarning'));
  check('model field describes the warning', (await page.getAttribute('#openaiModel', 'aria-describedby')).includes('openaiModelWarning'));
  check('status counts models', (await text(page, '#openaiModelStatus')).startsWith('2 models available from OpenAI'), await text(page, '#openaiModelStatus'));
  check('form not dirty', (await text(page, '#formStateText')) === 'All changes saved', await text(page, '#formStateText'));
  const listed = await page.$$eval('#openaiModelList option', options => options.map(o => o.value));
  check('saved value stays offered', listed[0] === 'gpt-4o-mini' && listed.includes('gpt-9-mini'), JSON.stringify(listed));
  await shot('warning');
  await page.fill('#openaiModel', 'gpt-9-mini');
  await page.waitForTimeout(100);
  check('warning hidden for another model', !(await visible(page, '#openaiModelWarning')));
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  check('saved the chosen model', await page.evaluate(() => window.__store.openaiModel === 'gpt-9-mini'));
  check('no warning after saving a listed model', !(await visible(page, '#openaiModelWarning')));
  // A provider without a saved model gets the best listed one once a key is entered.
  await page.selectOption('#providerSelect', 'gemini');
  check('gemini curated default', (await page.inputValue('#geminiModel')) === 'gemini-3.5-flash-lite');
  await page.fill('#geminiApiKey', 'AIza-good');
  await page.waitForTimeout(1000);
  check('gemini list uses the key header, not the URL', requests.some(r => r.url === 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000') && !requests.some(r => r.url.includes('AIza')));
  check('gemini keeps the listed recommended model', (await page.inputValue('#geminiModel')) === 'gemini-3.5-flash-lite', await page.inputValue('#geminiModel'));
  const geminiOptions = await page.$$eval('#geminiModelList option', options => options.map(o => [o.value, o.label]));
  check('gemini recommended first', geminiOptions[0]?.[0] === 'gemini-3.5-flash-lite' && geminiOptions[0]?.[1] === 'Recommended', JSON.stringify(geminiOptions));
  check('no warning without a saved model', !(await visible(page, '#geminiModelWarning')));
});

scenario('settings-model-list-failure', 'src/settings/settings.html', {
  store: { selectedProvider: 'openai', openaiApiKey: 'sk-bad', openaiModel: 'gpt-4o-mini' }, routes: modelRoutes, allowErrors: [REFUSED_KEY_LOG]
}, async ({ page, check }) => {
  await page.waitForTimeout(300);
  check('no warning when the list fails', !(await visible(page, '#openaiModelWarning')));
  check('model unchanged', (await page.inputValue('#openaiModel')) === 'gpt-4o-mini');
  check('status explains', (await text(page, '#openaiModelStatus')).startsWith('Couldn’t load the model list: OpenAI returned HTTP 401. You can'), await text(page, '#openaiModelStatus'));
});

scenario('settings-welcome', 'src/settings/settings.html?welcome=1', { store: {} }, async ({ page, check, shot }) => {
  check('welcome header', await visible(page, '#welcomeHeader'));
  check('status cleared', !(await visible(page, '#status')));
  await page.fill('#openrouterApiKey', 'or-key');
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  check('welcome save copy', (await text(page, '#status')).startsWith('Settings saved. You’re set'), await text(page, '#status'));
  await shot();
});


// ---------- Preferences ----------
scenario('settings-preferences', 'src/settings/settings.html', { store: configuredStore }, async ({ page, check, shot, outDir }) => {
  const checked = name => page.$eval(`input[name="${name}"]:checked`, i => i.value).catch(() => '');
  check('default depth', (await checked('researchDepth')) === 'balanced');
  check('default retention', (await checked('historyRetention')) === '1d');
  const readingShot = suffix => page.locator('section:has(#readingHeading)').screenshot({ path: path.join(outDir, `settings-reading-${suffix}.png`) });
  await readingShot('default');
  check('default page mode all', (await checked('topicPageMode')) === 'all');
  check('limit input disabled by default', await page.$eval('#topicPageLimit', i => i.disabled && i.value === '20'));
  check('effective research', (await text(page, '#researchEffective')).includes('up to 3 searches'), await text(page, '#researchEffective'));
  check('effective every page', (await text(page, '#topicPageLimitEffective')) === 'Every page of a topic is read.', await text(page, '#topicPageLimitEffective'));
  check('page limit a11y', await page.$eval('#topicPageLimit', i => i.getAttribute('aria-describedby').includes('topicPageLimitError') && i.getAttribute('aria-labelledby') === 'topicPageModeLimitLabel topicPageLimitUnit'));
  check('custom hidden', !(await visible(page, '#customResearch')));
  check('bar saved', (await text(page, '#formStateText')) === 'All changes saved', await text(page, '#formStateText'));
  // Keyboard: focus the "every page" radio, arrow to "limit".
  await page.focus('input[name="topicPageMode"][value="all"]');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(50);
  check('keyboard selects limit', (await checked('topicPageMode')) === 'limit');
  check('limit input enabled', await page.$eval('#topicPageLimit', i => !i.disabled));
  check('effective limit', (await text(page, '#topicPageLimitEffective')).includes('Topics up to 2,000 posts are read in full'), await text(page, '#topicPageLimitEffective'));
  check('bar dirty after mode', (await text(page, '#formStateText')) === 'Unsaved changes', await text(page, '#formStateText'));
  await page.fill('#topicPageLimit', '101');
  await page.press('#topicPageLimit', 'Tab');
  await page.waitForTimeout(50);
  check('page limit inline error', (await text(page, '#topicPageLimitError')).includes('from 1 to 100'), await text(page, '#topicPageLimitError'));
  check('page limit aria-invalid', await page.$eval('#topicPageLimit', i => i.getAttribute('aria-invalid') === 'true'));
  await shot('page-limit-invalid');
  await readingShot('invalid');
  await page.click('input[name="topicPageMode"][value="all"]');
  await page.waitForTimeout(50);
  check('error cleared in all mode', !(await visible(page, '#topicPageLimitError')));
  check('no aria-invalid in all mode', await page.$eval('#topicPageLimit', i => !i.hasAttribute('aria-invalid') && i.disabled));
  await page.click('input[name="topicPageMode"][value="limit"]');
  await page.fill('#topicPageLimit', '5');
  await page.waitForTimeout(50);
  check('effective 5 pages', (await text(page, '#topicPageLimitEffective')).includes('500 posts'), await text(page, '#topicPageLimitEffective'));
  await shot('page-limit');
  await readingShot('limit');
  await page.click('[data-restore="reading"]');
  await page.waitForTimeout(50);
  check('reading restored to every page', (await checked('topicPageMode')) === 'all');
  check('restored limit value', await page.$eval('#topicPageLimit', i => i.disabled && i.value === '20'));
  check('reading restore status', (await text(page, '#status')) === 'Reading topics restored to defaults. Save to apply.', await text(page, '#status'));
  // Save a limit, then check it is stored.
  await page.click('input[name="topicPageMode"][value="limit"]');
  await page.fill('#topicPageLimit', '8');
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  const limitStored = await page.evaluate(() => window.__store.preferences);
  check('stored limit mode', limitStored?.topicPageMode === 'limit' && limitStored?.topicPageLimit === 8, JSON.stringify(limitStored));
  await page.click('input[name="topicPageMode"][value="all"]');
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  const allStored = await page.evaluate(() => window.__store.preferences);
  check('stored every page', allStored?.topicPageMode === 'all' && allStored?.topicPageLimit === 8, JSON.stringify(allStored));
  // Preset + retention → save.
  await page.click('input[name="researchDepth"][value="thorough"]');
  check('bar dirty', (await text(page, '#formStateText')) === 'Unsaved changes', await text(page, '#formStateText'));
  check('effective updates live', (await text(page, '#researchEffective')).includes('4 searches × 2 result pages'), await text(page, '#researchEffective'));
  await page.click('input[name="historyRetention"][value="7d"]');
  await shot('dirty');
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => window.__store.preferences);
  check('stored depth', stored?.researchDepth === 'thorough', JSON.stringify(stored));
  check('stored retention', stored?.historyRetention === '7d', JSON.stringify(stored));
  check('bar saved after save', (await text(page, '#formStateText')) === 'Saved', await text(page, '#formStateText'));
  check('history effective', (await text(page, '#historyEffective')).includes('7 days'), await text(page, '#historyEffective'));
  // Invalid custom number → inline error, save blocked.
  await page.click('input[name="researchDepth"][value="custom"]');
  check('custom visible', await visible(page, '#customResearch'));
  await page.fill('#topicsRead', '40');
  await page.press('#topicsRead', 'Tab');
  await page.waitForTimeout(50);
  check('inline error', (await text(page, '#topicsReadError')).includes('from 1 to 12'), await text(page, '#topicsReadError'));
  check('aria-invalid', await page.$eval('#topicsRead', i => i.getAttribute('aria-invalid') === 'true'));
  check('described by error', await page.$eval('#topicsRead', i => i.getAttribute('aria-describedby').includes('topicsReadError')));
  await page.click('#saveBtn');
  await page.waitForTimeout(200);
  check('save blocked', (await page.evaluate(() => window.__store.preferences.researchDepth)) === 'thorough');
  check('error status', (await text(page, '#status')).includes('Discussions read must be'), await text(page, '#status'));
  check('bar invalid', (await text(page, '#formStateText')) === 'Fix the highlighted fields', await text(page, '#formStateText'));
  check('focus on field', await page.evaluate(() => document.activeElement?.id === 'topicsRead'));
  await shot('invalid');
  await page.fill('#topicsRead', '8');
  await page.waitForTimeout(50);
  check('error cleared', !(await visible(page, '#topicsReadError')));
  check('bar dirty after fix', (await text(page, '#formStateText')) === 'Unsaved changes', await text(page, '#formStateText'));
  // Restore section defaults → save.
  await page.click('[data-restore="research"]');
  check('restored depth', (await checked('researchDepth')) === 'balanced');
  check('custom hidden again', !(await visible(page, '#customResearch')));
  check('restore status', (await text(page, '#status')) === 'Ask the forum restored to defaults. Save to apply.', await text(page, '#status'));
  await page.click('#saveBtn');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__store.preferences);
  check('saved defaults for section', after.researchDepth === 'balanced' && after.historyRetention === '7d', JSON.stringify(after));
  // Saved in another page while this one has no edits → fields follow.
  await page.evaluate(() => chrome.storage.local.set({ preferences: { ...window.__store.preferences, historyRetention: '30d', topicPageMode: 'limit', topicPageLimit: 3 } }));
  await page.waitForTimeout(300);
  check('external retention', (await checked('historyRetention')) === '30d');
  check('external page limit', await page.$eval('#topicPageLimit', i => i.value === '3' && !i.disabled));
  check('external page mode', (await checked('topicPageMode')) === 'limit');
  await shot('saved');
});


scenario('popup-retention', 'src/popup/popup.html', { store: configuredStore }, async ({ page, check, shot }) => {
  const now = Date.now();
  const H = 3600000;
  const activity = (id, title, completedAt) => ({
    schemaVersion: 1, activityId: id, activityType: 'agent', taskId: id, agentRunId: id, title, question: title,
    siteUrl: 'https://meta.discourse.org', forumName: 'Discourse Meta', searchQueries: [], toolCalls: [],
    sourceRefs: [], answer: `Answer for ${title}`, answerStatus: 'answered', status: 'completed', phase: 'completed',
    statusText: 'Completed', progress: null, error: null, provider: 'openai', model: 'm', createdAt: completedAt - 1000,
    updatedAt: completedAt, startedAt: completedAt - 1000, completedAt, retainedFrom: completedAt,
    expiresAt: completedAt + 24 * H, kept: false, retryOf: '', lastOpenedAt: completedAt + 1, dismissedAt: completedAt + 1
  });
  await seedHistory(page, { activities: [activity('recent', 'Recent question', now - 3 * H), activity('older', 'Older question', now - 48 * H)] });
  await page.reload();
  await page.waitForTimeout(700);
  await page.click('#savedBtn');
  await page.waitForTimeout(300);
  await page.click('#summariesTab');
  await page.waitForTimeout(300);
  const savedText = () => text(page, '#savedList');
  check('1 day intro', (await text(page, '#savedExpiryIntro')).includes('expire after 1 day'), await text(page, '#savedExpiryIntro'));
  check('only recent answer (1 day)', (await savedText()).includes('Recent question') && !(await savedText()).includes('Older question'), await savedText());
  check('hours label', (await savedText()).includes('expires in 21h'), await savedText());
  await shot('1d');
  // Saved from the settings page: the open panel follows at once.
  await page.evaluate(() => chrome.storage.local.set({ preferences: { historyRetention: '7d' } }));
  await page.waitForTimeout(600);
  check('7 day intro', (await text(page, '#savedExpiryIntro')).includes('expire after 7 days'), await text(page, '#savedExpiryIntro'));
  check('older answer back in window', (await savedText()).includes('Older question'), await savedText());
  check('day labels', (await savedText()).includes('expires in 7d') && (await savedText()).includes('expires in 5d'), await savedText());
  check('keep title', await page.$eval('.agent-saved-card .keep-saved', b => b.title.includes('7 days')).catch(() => false));
  await shot('7d');
  await page.evaluate(() => chrome.storage.local.set({ preferences: { historyRetention: 'forever' } }));
  await page.waitForTimeout(600);
  check('forever intro', (await text(page, '#savedExpiryIntro')).includes('until you delete them'), await text(page, '#savedExpiryIntro'));
  check('no expiry labels', !(await savedText()).includes('expires in'), await savedText());
});

// ---------- Forum access ----------


scenario('access-enable', 'src/popup/popup.html', accessOptions, async ({ page, check, shot, outDir }) => {
  check('allow card visible', await visible(page, '#pageGuide'));
  check('card heading', (await text(page, '#pageGuideHeading')) === 'Allow DiscourseCopilot on OpenAI Developer Community', await text(page, '#pageGuideHeading'));
  check('card button', (await text(page, '#forumAccessBtn')) === 'Allow access to community.openai.com', await text(page, '#forumAccessBtn'));
  check('card explains', (await text(page, '#pageGuideText')).includes('using your current login'));
  const steps = await page.$$eval('#pageGuideSteps li', items => items.map(li => li.textContent));
  check('three steps', JSON.stringify(steps) === JSON.stringify(['Click Allow access below.', 'Chrome asks for permission. Choose Allow.', 'Then click Create summary.']), JSON.stringify(steps));
  check('Allow is bold', (await page.$$eval('#pageGuideSteps strong', els => els.map(e => e.textContent))).join('|') === 'Allow access|Allow|Create summary');
  check('footnote', (await text(page, '#pageGuideFootnote')) === 'Only this forum. You can remove access anytime in Settings.');
  check('hero hidden', !(await visible(page, '#summarizeBtn')) && !(await visible(page, '#currentPageTitle')));
  check('no welcome panel', !(await visible(page, '#welcomePanel')));
  check('no checklist', !(await visible(page, '#getStarted')));
  check('forum bar names forum', (await text(page, '#forumBarName')) === 'OpenAI Developer Community', await text(page, '#forumBarName'));
  check('no idle status', !(await visible(page, '#status')), await text(page, '#status'));
  await shot('card');
  await page.locator('#pageGuide').screenshot({ path: path.join(outDir, `access-card.png`) });
  await page.click('#forumAccessBtn');
  await page.waitForTimeout(500);
  check('asked for the origin', await page.evaluate(() => JSON.stringify(window.__permissionRequests) === JSON.stringify([['https://community.openai.com/*']])), await page.evaluate(() => JSON.stringify(window.__permissionRequests)));
  check('background synced', await page.evaluate(() => window.__sent.some(m => m.action === 'syncForumAccess' && m.siteUrl === 'https://community.openai.com')));
  check('card hidden after grant', !(await visible(page, '#pageGuide')));
  check('summarize enabled after grant', await page.$eval('#summarizeBtn', b => !b.disabled && b.offsetParent !== null));
  check('welcome panel on the topic', await visible(page, '#welcomePanel'));
  check('grant announced', (await text(page, '#status')) === 'DiscourseCopilot can now read OpenAI Developer Community', await text(page, '#status'));
  await shot('granted');
  await page.click('#summarizeBtn');
  await page.waitForTimeout(200);
  check('summary queued for the forum', await page.evaluate(() => window.__sent.some(m => m.action === 'enqueueTask' && m.siteUrl === 'https://community.openai.com')));
});

scenario('access-deny', 'src/popup/popup.html', { ...accessOptions, permissionAnswer: false }, async ({ page, check, shot }) => {
  await page.click('#forumAccessBtn');
  await page.waitForTimeout(300);
  check('still the card', await visible(page, '#pageGuide'));
  check('gentle note', (await text(page, '#forumAccessNote')) === 'Chrome didn’t grant access. Click Allow access and choose Allow in Chrome’s prompt.', await text(page, '#forumAccessNote'));
  check('button usable again', await page.$eval('#forumAccessBtn', b => !b.disabled && b.textContent === 'Allow access to community.openai.com'));
  check('summarize still locked', await page.$eval('#summarizeBtn', b => b.disabled));
  await shot();
});

scenario('access-maybe', 'src/popup/popup.html', { ...accessOptions, probe: null }, async ({ page, check, shot }) => {
  check('maybe card', (await text(page, '#pageGuideHeading')) === 'Is this a Discourse forum?', await text(page, '#pageGuideHeading'));
  check('maybe explains', (await text(page, '#pageGuideText')).includes('couldn’t check community.openai.com yet'), await text(page, '#pageGuideText'));
  check('maybe button', (await text(page, '#forumAccessBtn')) === 'Allow access to community.openai.com');
  check('maybe steps', (await text(page, '#pageGuideSteps')).includes('Chrome asks for permission. Choose Allow.'));
  await shot();
});

scenario('access-hidden', 'src/popup/popup.html', { ...accessOptions, activeTab: false }, async ({ page, check, shot }) => {
  check('not checked yet', (await text(page, '#forumBarName')) === 'Page not checked yet', await text(page, '#forumBarName'));
  check('guide title', (await text(page, '#pageGuideHeading')) === 'Check this page', await text(page, '#pageGuideHeading'));
  check('guide explains the icon', (await text(page, '#pageGuideText')).includes('Click the DiscourseCopilot icon in your toolbar'), await text(page, '#pageGuideText'));
  check('pin tip', (await text(page, '#pageGuideTip')).includes('puzzle-piece menu'));
  check('no allow button yet', !(await visible(page, '#forumAccessBtn')));
  check('hero hidden', !(await visible(page, '#summarizeBtn')) && !(await visible(page, '#currentPageTitle')));
  check('no welcome panel', !(await visible(page, '#welcomePanel')));
  check('no idle status', !(await visible(page, '#status')), await text(page, '#status'));
  await shot('before-click');
  // The user clicks the toolbar icon: activeTab reveals the page.
  await page.evaluate(({ url, title }) => {
    chrome.tabs.query = async () => [{ id: 1, windowId: 1, index: 0, active: true, url, title }];
    window.__fire('onMessage', { action: 'actionClicked', tabId: 1 }, {});
  }, { url: OAI_TOPIC, title: 'Rate limits explained - OpenAI Developer Community' });
  await page.waitForTimeout(400);
  check('allow card after click', (await text(page, '#pageGuideHeading')) === 'Allow DiscourseCopilot on OpenAI Developer Community', await text(page, '#pageGuideHeading'));
  check('state change announced', (await text(page, '#guideAnnouncer')) === 'Allow DiscourseCopilot on OpenAI Developer Community', await text(page, '#guideAnnouncer'));
  await shot('after-click');
});

scenario('access-setup-both', 'src/popup/popup.html', { ...accessOptions, store: {} }, async ({ page, check, shot }) => {
  check('checklist shown', await visible(page, '#getStarted'));
  check('checklist step 1', (await text(page, '#getStartedLabel')) === 'Step 1 of 2: Connect an AI provider', await text(page, '#getStartedLabel'));
  check('checklist items', (await text(page, '#getStartedList')).includes('Allow access to community.openai.com'), await text(page, '#getStartedList'));
  check('setup card first', await page.evaluate(() => {
    const setup = document.getElementById('setupCard');
    const guide = document.getElementById('pageGuide');
    return setup.offsetParent !== null && guide.offsetParent !== null && Boolean(setup.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING);
  }));
  check('setup eyebrow is step 1', (await text(page, '#setupEyebrow')) === 'Step 1 of 2');
  check('access card is the next step', await page.$eval('#pageGuide', el => el.dataset.step === 'next'));
  check('access card eyebrow', (await text(page, '#pageGuideEyebrow')) === 'Step 2 of 2 · Next', await text(page, '#pageGuideEyebrow'));
  check('allow button secondary', await page.$eval('#forumAccessBtn', b => b.classList.contains('outline') && !b.disabled));
  await shot('step1');
  await page.click('label.setup-provider-option[data-provider="openai"]');
  await page.fill('#setupApiKey', 'sk-new');
  await page.fill('#setupModel', 'gpt-4o');
  await page.click('#setupSaveOnlyBtn');
  await page.waitForTimeout(500);
  check('success says what is next', (await text(page, '#setupSuccessText')) === 'You’re set. Next, allow access to this forum below.', await text(page, '#setupSuccessText'));
  check('checklist step 2', (await text(page, '#getStartedLabel')) === 'Step 2 of 2: Allow access to this forum', await text(page, '#getStartedLabel'));
  check('access card primary now', await page.$eval('#pageGuide', el => el.dataset.step === '') && await page.$eval('#forumAccessBtn', b => !b.classList.contains('outline')));
  await shot('step2');
  await page.click('#setupDoneBtn');
  await page.waitForTimeout(150);
  check('checklist gone after Done', !(await visible(page, '#getStarted')));
  check('focus on Allow access', await page.evaluate(() => document.activeElement?.id === 'forumAccessBtn'));
});

scenario('access-click-then-navigate', 'src/popup/popup.html', { ...accessOptions, activeTab: false }, async ({ page, check }) => {
  // A page Chrome never shows extensions (new tab page): clicking the icon
  // records the tab, and the panel settles on "Not a Discourse forum".
  await page.evaluate(async () => {
    await chrome.storage.session.set({ actionClickedTabs: [1] });
    window.__fire('onMessage', { action: 'actionClicked', tabId: 1 }, {});
  });
  await page.waitForTimeout(300);
  check('clicked restricted page is not a forum', (await text(page, '#forumBarName')) === 'Not a Discourse forum', await text(page, '#forumBarName'));
  // Then the tab goes to another site: activeTab is gone, so "not checked yet" again.
  await page.evaluate(() => {
    window.__fire('onUpdated', 1, { status: 'loading' }, { id: 1, windowId: 1 });
    setTimeout(() => window.__fire('onUpdated', 1, { status: 'complete' }, { id: 1, windowId: 1 }), 50);
  });
  await page.waitForTimeout(400);
  check('back to not checked', (await text(page, '#forumBarName')) === 'Page not checked yet', await text(page, '#forumBarName'));
});

scenario('access-removed', 'src/popup/popup.html', { store: configuredStore }, async ({ page, check, shot }) => {
  check('normal view first', !(await visible(page, '#pageGuide')) && await page.$eval('#summarizeBtn', b => !b.disabled));
  // Removed in Settings (another extension page): onRemoved reaches the panel.
  await page.evaluate(() => chrome.permissions.remove({ origins: ['https://meta.discourse.org/*'] }));
  await page.waitForTimeout(400);
  // The tab keeps its already-loaded content script, but access is gone.
  check('allow card back', await visible(page, '#pageGuide'), await text(page, '#topicView'));
  check('summarize locked', await page.$eval('#summarizeBtn', b => b.disabled));
  await shot();
});

scenario('access-agent-continue', 'src/popup/popup.html', {
  ...accessOptions,
  tasks: [{
    id: 'agent-w', type: 'agent', topicId: null, siteUrl: OAI, topicKey: '', agentRunId: 'run-w', clientRequestId: '', title: 'What are the rate limits?',
    question: 'What are the rate limits?', forumName: 'OpenAI Developer Community', status: 'waiting_user_action', phase: 'waiting_user_action',
    statusText: 'Waiting for forum access', progress: null, error: 'Enable DiscourseCopilot on community.openai.com in the side panel, then try again.',
    createdAt: Date.now() - 5000, updatedAt: Date.now()
  }]
}, async ({ page, check, shot }) => {
  await page.evaluate(() => {
    const now = Date.now();
    window.__fire('onMessage', { action: 'activityUpdated', activity: {
      schemaVersion: 1, activityId: 'run-w', activityType: 'agent', taskId: 'agent-w', agentRunId: 'run-w',
      title: 'What are the rate limits?', question: 'What are the rate limits?', siteUrl: 'https://community.openai.com', forumName: 'OpenAI Developer Community',
      searchQueries: [], toolCalls: [], sourceRefs: [], answer: '', answerStatus: '', status: 'waiting_user_action', phase: 'waiting_user_action',
      statusText: 'Waiting for forum access', progress: null,
      error: { code: 'FORUM_ACCESS_NOT_GRANTED', message: 'Enable DiscourseCopilot on community.openai.com in the side panel, then try again.', retryable: false, needsUserAction: true, retryAfterAt: 0 },
      provider: 'openai', model: 'gpt-4o-mini', createdAt: now - 5000, updatedAt: now, startedAt: now - 4000, completedAt: 0, expiresAt: 0, kept: false, retryOf: '', lastOpenedAt: 0, dismissedAt: 0
    } }, {});
  });
  await page.waitForTimeout(300);
  const notice = await text(page, '#agentPanel');
  check('waiting notice explains access', notice.includes('needs your OK to read community.openai.com'), notice);
  const button = '#agentPanel [data-agent-action="continue"]';
  check('allow & continue button', (await text(page, button)) === 'Allow access to community.openai.com & continue', await text(page, button));
  check('no login button', (await page.$('#agentPanel [data-agent-action="login"]')) === null);
  await shot('waiting');
  await page.click(button);
  await page.waitForTimeout(400);
  check('asked for access', await page.evaluate(() => window.__permissionRequests.length === 1));
  check('resumed after grant', await page.evaluate(() => window.__sent.some(m => m.action === 'resumeTask' && m.taskId === 'agent-w')));
  await shot('continued');
});

scenario('access-agent-deny', 'src/popup/popup.html', {
  ...accessOptions, permissionAnswer: false,
  tasks: [{
    id: 'agent-w', type: 'agent', topicId: null, siteUrl: OAI, topicKey: '', agentRunId: 'run-w', clientRequestId: '', title: 'Q',
    question: 'Q', forumName: 'OpenAI Developer Community', status: 'waiting_user_action', phase: 'waiting_user_action',
    statusText: 'Waiting for forum access', progress: null, error: 'x', createdAt: Date.now() - 5000, updatedAt: Date.now()
  }]
}, async ({ page, check }) => {
  await page.click('#savedBtn');
  await page.waitForTimeout(300);
  await page.click('#activeTaskList button:has-text("Continue")').catch(() => {});
  await page.waitForTimeout(300);
  check('asked from the Activity card', await page.evaluate(() => window.__permissionRequests.length === 1));
  check('not resumed when denied', await page.evaluate(() => !window.__sent.some(m => m.action === 'resumeTask')));
});

scenario('settings-forum-access', 'src/settings/settings.html', {
  store: configuredStore, granted: ['https://meta.discourse.org/*', 'https://community.openai.com/*']
}, async ({ page, check, shot, outDir }) => {
  await seedHistory(page, savedSessionHistory());
  await page.reload();
  await page.waitForTimeout(800);
  const list = () => text(page, '#forumAccessList');
  check('nav link', (await text(page, '.section-nav')).includes('Forum access'));
  check('lists both forums', (await list()).includes('Discourse Meta') && (await list()).includes('community.openai.com'), await list());
  check('saved count', (await list()).includes('meta.discourse.org · 1 saved item'), await list());
  check('provider hosts not listed', !(await list()).includes('api.openai.com') && !(await list()).includes('localhost'));
  const section = page.locator('section:has(#forumAccessHeading)');
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: path.join(outDir, `settings-forum-access.png`) });
  await page.click('[data-origin="https://meta.discourse.org"] button');
  await page.waitForTimeout(100);
  check('inline confirm', (await text(page, '[data-origin="https://meta.discourse.org"]')).includes('Remove access to meta.discourse.org? Saved summaries and answers stay.'));
  check('confirm focused', await page.evaluate(() => document.activeElement?.classList.contains('btn-danger')));
  await section.screenshot({ path: path.join(outDir, `settings-forum-access-confirm.png`) });
  await page.click('[data-origin="https://meta.discourse.org"] .btn-danger');
  await page.waitForTimeout(400);
  check('removed from list', !(await list()).includes('Discourse Meta'), await list());
  check('permission removed', await page.evaluate(() => !window.__granted.has('https://meta.discourse.org/*')));
  check('removal notice', (await text(page, '#status')).includes('Your saved summaries and answers are still here'), await text(page, '#status'));
  // Cancel keeps it.
  await page.click('[data-origin="https://community.openai.com"] button');
  await page.click('[data-origin="https://community.openai.com"] button:has-text("Cancel")');
  check('cancel keeps access', await page.evaluate(() => window.__granted.has('https://community.openai.com/*')));
  // Granted elsewhere: the list follows.
  await page.evaluate(() => window.__grant('https://forum.example.com/*'));
  await page.waitForTimeout(300);
  check('live update on grant', (await list()).includes('forum.example.com'), await list());
  await page.evaluate(() => chrome.permissions.remove({ origins: ['https://forum.example.com/*', 'https://community.openai.com/*'] }));
  await page.waitForTimeout(300);
  check('empty state', (await text(page, '#forumAccessEmpty')).includes('You haven’t enabled any forums yet') && await visible(page, '#forumAccessEmpty'));
  await section.screenshot({ path: path.join(outDir, `settings-forum-access-empty.png`) });
});
// ---------- Runner ----------

async function runScenario(browser, base, { name, pagePath, options, steps }, { theme, outDir }) {
  // Network answers stay in Node (functions can't reach the page's stub).
  // allowErrors: console messages a scenario provokes on purpose (Chrome
  // logs every HTTP error response, e.g. a refused API key).
  const { routes = [], allowErrors = [], ...stubOptions } = options;
  const { ctx, page, errors, requests } = await openExtensionPage(browser, base, {
    pagePath, theme, width: options.width || WIDTH, height: 1000, stub: { ...defaultStub, ...stubOptions }, routes
  });
  const checks = [];
  const check = (label, ok, detail = '') => { checks.push({ label, ok: Boolean(ok), detail }); };
  const shot = async suffix => page.screenshot({ path: path.join(outDir, `${name}${suffix ? '-' + suffix : ''}.png`) });
  try {
    check('brand images load', await brandImagesLoaded(page));
    const brokenIcons = await brokenIconLinks(page);
    check('favicons resolve', brokenIcons.length === 0, brokenIcons.join(', '));
    await steps({ page, check, shot, outDir, requests });
  } catch (error) {
    check('steps completed', false, error.message.split('\n')[0]);
    await shot('crash').catch(() => {});
  }
  await ctx.close();
  return { name, errors: errors.filter(e => !allowErrors.some(pattern => pattern.test(e))), checks };
}

async function runTheme(browser, base, theme) {
  const outDir = path.join(outRoot, `${theme}-${WIDTH}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const s of scenarios) results.push(await runScenario(browser, base, s, { theme, outDir }));
  return { theme, outDir, results };
}

requireDist();
if (!scenarios.length) throw new Error('--only matched no scenario');
const started = Date.now();
const server = await startServer({ '/': DIST });
const browser = await chromium.launch();
let runs;
try {
  // Themes run side by side; every scenario has its own browser context.
  runs = await Promise.all(THEMES.map(theme => runTheme(browser, server.base, theme)));
} finally {
  await browser.close();
  await server.close();
}

let problems = 0;
let total = 0;
for (const { theme, outDir, results } of runs) {
  console.log(`\n=== ${theme}, ${WIDTH}px (screenshots: ${relative(outDir)}) ===`);
  for (const { name, errors, checks } of results) {
    const failed = checks.filter(c => !c.ok);
    total += checks.length;
    problems += failed.length + errors.length;
    console.log(`${failed.length || errors.length ? 'FAIL' : 'ok  '} ${name}: ${checks.length - failed.length}/${checks.length} checks, ${errors.length} page errors`);
    for (const c of failed) console.log(`     ✗ ${c.label}${c.detail ? ` — ${c.detail}` : ''}`);
    for (const e of errors) console.log(`     ! ${e.split('\n')[0]}`);
  }
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(problems ? `\n${problems} problem(s) in ${total} checks (${seconds}s)` : `\nall ${total} checks passed, no page errors (${seconds}s)`);
process.exit(problems ? 1 : 0);
