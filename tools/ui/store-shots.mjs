// Chrome Web Store images (store-assets/*.png): five 1280x800 screenshots and
// the two promo tiles.
//
//   1. panels:  the dist/ side panel with the chrome.* stub and
//               fixtures/store.mjs data, 440x732 at 2x      → out/store/panels/
//   2. compose: templates/store/ (mock Discourse page + caption + panel, promo
//               tiles) rendered at 2x                       → out/store/html/ (generated pages)
//   3. downsample to 1x (lanczos3), flatten, no alpha      → out/store/
//
// Usage: node tools/ui/store-shots.mjs [--only=01,promo-small] [--check] [--write]
//   --check  compare out/store/ with store-assets/ (exit 1 on a material difference)
//   --write  also copy the results over store-assets/
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { BRAND, DIST, OUT, REPO, TEMPLATES, onlyFilter, parseArgs, relative, requireDist } from './lib/env.mjs';
import { startServer } from './lib/static-server.mjs';
import { brandImagesLoaded, openExtensionPage, seedHistory } from './lib/extension-page.mjs';
import { compareDirs } from './lib/pixdiff.mjs';
import { META, OPENAI, OPENAI_STORE, ANTHROPIC_STORE, history, onTopic } from './fixtures/forums.mjs';
import {
  FORUM_LOOKS, LONG_THREADS_TOPIC, META_TIPS_TOPIC, STREAMING_TOPIC,
  agentRun, keptAgentRun, longThreadsForumTopic, metaTips, metaTipsForumTopic, metaTipsOpenAI,
  openaiLatest, savedTopics, streamingForumTopic
} from './fixtures/store.mjs';
import { screenshotPage, topicList, topicView } from './templates/store/screenshot.mjs';

const args = parseArgs();
const outDir = path.join(OUT, 'store');
const panelDir = path.join(outDir, 'panels');
const htmlDir = path.join(outDir, 'html');
const assetsDir = path.join(REPO, 'store-assets');

// ---------- Panels ----------

const PANEL_W = 440;
const PANEL_H = 732;

const metaTipsTab = onTopic(META, META_TIPS_TOPIC, `${META_TIPS_TOPIC.title} - Community - ${META.name}`);
const streamingTab = onTopic(OPENAI, STREAMING_TOPIC, `${STREAMING_TOPIC.title} - API - ${OPENAI.name}`);
const longThreadsTab = onTopic(OPENAI, LONG_THREADS_TOPIC, `${LONG_THREADS_TOPIC.title} - API - ${OPENAI.name}`);

const openSources = async page => {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('#agentPanel details')) {
      if (/Sources/.test(d.querySelector('summary')?.textContent || '')) d.open = true;
    }
  });
  await page.waitForTimeout(150);
};

// Each panel is the side-panel viewport, scrolled so `scrollTo` sits `offset` px from the top.
const PANELS = {
  'summary-light': { stub: { ...metaTipsTab, store: ANTHROPIC_STORE }, data: history({ sessions: [metaTips] }), scrollTo: '#summaryContainer' },
  'agent-light': { stub: { ...streamingTab, store: OPENAI_STORE }, data: history({ activities: [agentRun] }), prepare: openSources, scrollTo: '#agentPanel' },
  'activity-light': {
    stub: { ...streamingTab, store: OPENAI_STORE }, data: history({ sessions: savedTopics, activities: [keptAgentRun] }),
    prepare: async page => {
      await page.click('#savedBtn');
      await page.waitForTimeout(400);
      await page.click('#summariesTab');
      await page.waitForTimeout(400);
    }
  },
  'setup-light': {
    stub: { ...longThreadsTab, store: {} },
    prepare: async page => {
      await page.click('label.setup-provider-option[data-provider="anthropic"]');
      await page.waitForTimeout(300);
    },
    scrollTo: '#setupCard'
  },
  'summary-dark': { theme: 'dark', stub: { ...metaTipsTab, store: OPENAI_STORE }, data: history({ sessions: [metaTipsOpenAI] }) },
  // Marquee tile cards: top of the panel, taller viewport.
  'marquee-summary': { height: 760, stub: { ...metaTipsTab, store: OPENAI_STORE }, data: history({ sessions: [metaTipsOpenAI] }) },
  'marquee-agent': { height: 760, stub: { ...streamingTab, store: OPENAI_STORE }, data: history({ activities: [agentRun] }), prepare: openSources, scrollTo: '#agentPanel', offset: 12 }
};

async function renderPanel(browser, base, name, { theme = 'light', height = PANEL_H, stub, data, prepare, scrollTo, offset = 10 }) {
  const { ctx, page, errors } = await openExtensionPage(browser, base, { theme, width: PANEL_W, height, deviceScaleFactor: 2, stub, settle: 600 });
  if (data) {
    await seedHistory(page, data);
    await page.reload();
    await page.waitForTimeout(800);
  }
  if (prepare) await prepare(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(0, 0);
  if (scrollTo) {
    // Let the target reach the top even when the content below it is shorter than the viewport.
    await page.evaluate(() => { document.body.style.paddingBottom = '400px'; });
    await page.evaluate(({ sel, offset }) => {
      const el = document.querySelector(sel);
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
    }, { sel: scrollTo, offset });
    await page.waitForTimeout(200);
  }
  if (!(await brandImagesLoaded(page))) errors.push('broken brand image');
  // Finished transitions: the same pixels on every run.
  await page.screenshot({ path: path.join(panelDir, `${name}.png`), animations: 'disabled' });
  await ctx.close();
  console.log(`${errors.length ? 'FAIL' : 'ok  '} panel ${name}`);
  for (const e of errors) console.log(`     ${e}`);
  return errors.length;
}

// ---------- Compositions ----------

const SHOTS = [
  { id: '01', file: '01-summarize-topics.png', panels: ['summary-light'],
    html: () => screenshotPage({ panel: 'summary-light',
      url: `meta.discourse.org/t/${META_TIPS_TOPIC.slug}/${META_TIPS_TOPIC.topicId}`,
      forumHtml: topicView(FORUM_LOOKS.meta, metaTipsForumTopic),
      title: 'Summarize any Discourse topic in seconds',
      sub: 'Get the main points of a long thread, then ask follow-up questions about it.' }) },
  { id: '02', file: '02-ask-the-forum.png', panels: ['agent-light'],
    html: () => screenshotPage({ panel: 'agent-light',
      url: `community.openai.com/t/${STREAMING_TOPIC.slug}/${STREAMING_TOPIC.topicId}`,
      forumHtml: topicView(FORUM_LOOKS.openai, streamingForumTopic),
      title: 'Ask the whole forum — answers with sources',
      sub: 'It searches the forum, reads the best matches, and cites the posts it used.' }) },
  { id: '03', file: '03-every-discourse-forum.png', panels: ['activity-light'],
    html: () => screenshotPage({ panel: 'activity-light',
      url: 'community.openai.com/latest',
      forumHtml: topicList(FORUM_LOOKS.openai, openaiLatest, '#0e76bd'),
      title: 'Works on every Discourse forum',
      sub: 'One click enables each forum you use. Saved summaries and answers stay grouped by forum.' }) },
  { id: '04', file: '04-bring-your-own-ai.png', panels: ['setup-light'],
    html: () => screenshotPage({ panel: 'setup-light',
      url: `community.openai.com/t/${LONG_THREADS_TOPIC.slug}/${LONG_THREADS_TOPIC.topicId}`,
      forumHtml: topicView(FORUM_LOOKS.openai, longThreadsForumTopic),
      title: 'Bring your own AI',
      sub: 'Connect the AI provider you already use, or run a model on your own computer. Your key stays in your browser.' }) },
  { id: '05', file: '05-light-and-dark-mode.png', panels: ['summary-dark'],
    html: () => screenshotPage({ panel: 'summary-dark', theme: 'dark',
      url: `meta.discourse.org/t/${META_TIPS_TOPIC.slug}/${META_TIPS_TOPIC.topicId}`,
      forumHtml: topicView(FORUM_LOOKS.meta, metaTipsForumTopic),
      title: 'Light and dark mode',
      sub: 'The side panel follows your system theme automatically.' }) }
];
const JOBS = [
  ...SHOTS.map(s => ({ ...s, w: 1280, h: 800, sel: '.stage' })),
  { id: 'promo-small', file: 'promo-small-440x280.png', template: 'store/promo-small.html', panels: [], w: 440, h: 280, sel: '.tile' },
  { id: 'promo-marquee', file: 'promo-marquee-1400x560.png', template: 'store/promo-marquee.html', panels: ['marquee-summary', 'marquee-agent'], w: 1400, h: 560, sel: '.tile' }
];

async function compose(browser, base, job) {
  let url;
  if (job.html) {
    fs.writeFileSync(path.join(htmlDir, `${job.id}.html`), job.html());
    url = `${base}/html/${job.id}.html`;
  } else {
    url = `${base}/templates/${job.template}`;
  }
  const ctx = await browser.newContext({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const bad = [];
  page.on('requestfailed', r => bad.push(r.url()));
  page.on('response', r => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  bad.push(...await page.evaluate(() => [...document.images].filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.src)));
  const buf = await page.locator(job.sel).screenshot();
  await ctx.close();
  const outPath = path.join(outDir, job.file);
  await sharp(buf).resize(job.w, job.h, { kernel: 'lanczos3' }).flatten({ background: '#ffffff' }).removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${relative(outPath)} ${meta.width}x${meta.height} alpha=${meta.hasAlpha} ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
  for (const b of bad) console.log(`     broken: ${b}`);
  return bad.length;
}

// ---------- Run ----------

requireDist();
const wanted = onlyFilter(args);
const jobs = JOBS.filter(j => wanted(j.id));
if (!jobs.length) throw new Error(`--only matched nothing; ids: ${JOBS.map(j => j.id).join(', ')}`);
const panels = [...new Set(jobs.flatMap(j => j.panels))];
fs.mkdirSync(panelDir, { recursive: true });
fs.mkdirSync(htmlDir, { recursive: true });

const dist = await startServer({ '/': DIST });
const server = await startServer({ '/': outDir, '/templates/': TEMPLATES, '/brand/': BRAND });
const browser = await chromium.launch();
let problems = 0;
try {
  for (const name of panels) problems += await renderPanel(browser, dist.base, name, PANELS[name]);
  for (const job of jobs) problems += await compose(browser, server.base, job);
} finally {
  await browser.close();
  await server.close();
  await dist.close();
}

const files = jobs.map(j => j.file);
if (args.check) {
  console.log(`\nCompare with ${relative(assetsDir)}:`);
  if (!(await compareDirs(outDir, assetsDir, files))) problems++;
}
if (args.write) {
  for (const file of files) fs.copyFileSync(path.join(outDir, file), path.join(assetsDir, file));
  console.log(`\nWrote ${files.length} image(s) to ${relative(assetsDir)}`);
} else {
  console.log(`\nImages in ${relative(outDir)} (run with --write to update ${relative(assetsDir)})`);
}
process.exit(problems ? 1 : 0);
