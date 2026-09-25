// README screenshots (docs/screenshots/*.png) from the real built pages.
//
//   1. panels:  dist/ side panel and settings page with the chrome.* stub and
//               fixtures/readme.mjs data, captured at 2x   → out/readme/panels/
//   2. compose: templates/readme-showcase.html frames the panels (browser
//               window, gradient, shadow), one element per image
//   3. compress: ≤1600 px wide, 8-bit palette PNG          → out/readme/
//
// Usage: node tools/ui/readme-shots.mjs [--only=hero,feature-setup] [--check] [--write]
//   --check  compare out/readme/ with docs/screenshots/ (exit 1 on a material difference)
//   --write  also copy the results over docs/screenshots/
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { DIST, OUT, REPO, TEMPLATES, onlyFilter, parseArgs, relative, requireDist } from './lib/env.mjs';
import { startServer } from './lib/static-server.mjs';
import { POPUP, SETTINGS, brandImagesLoaded, openExtensionPage, seedHistory } from './lib/extension-page.mjs';
import { compareDirs } from './lib/pixdiff.mjs';
import { ANTHROPIC_STORE, META, OPENAI, OPENAI_STORE, history, onTopic } from './fixtures/forums.mjs';
import {
  LONG_THREADS_TOPIC,
  META_LONG_TOPIC,
  META_TIPS_TOPIC,
  STREAMING_TOPIC,
  agentRun,
  keptAgentRun,
  metaLong,
  metaTips,
  savedTopics
} from './fixtures/readme.mjs';

const args = parseArgs();
const outDir = path.join(OUT, 'readme');
const panelDir = path.join(outDir, 'panels');
const docsDir = path.join(REPO, 'docs', 'screenshots');

// Final image → showcase element and the panels it frames.
const IMAGES = [
  { file: 'hero.png', id: 'heroStage', panels: ['meta-summary-chat-light', 'openai-agent-answer-light', 'meta-summary-chat-dark'] },
  { file: 'feature-summary-chat.png', id: 'featureSummary', panels: ['meta-long-summary-light'] },
  { file: 'feature-agent-answer.png', id: 'featureAgent', panels: ['openai-agent-answer-light'] },
  { file: 'feature-activity.png', id: 'featureActivity', panels: ['activity-grouped-light'] },
  { file: 'feature-setup.png', id: 'featureSetup', panels: ['setup-card-light'] },
  { file: 'feature-allow-access.png', id: 'featureAllow', panels: ['allow-access-light'] },
  { file: 'feature-dark-mode.png', id: 'featureDark', panels: ['openai-agent-answer-dark'] },
  { file: 'feature-settings.png', id: 'featureSettings', panels: ['settings-light'] }
];

// ---------- Panels ----------

// Finish CSS transitions (e.g. a focus ring fading out after blur) before
// capturing, so every run produces the same pixels.
const STILL = { animations: 'disabled' };

const captureUntil =
  (selector, pad = 14) =>
  async (page, outPath) => {
    const box = await page.locator(selector).boundingBox();
    const container = await page.locator('main.container').boundingBox();
    await page.screenshot({
      ...STILL,
      path: outPath,
      clip: { x: container.x, y: container.y, width: container.width, height: box.y + box.height - container.y + pad }
    });
  };

const openSources = async page => {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('#agentPanel details')) {
      if (/Sources/.test(d.querySelector('summary')?.textContent || '')) d.open = true;
    }
  });
  await page.waitForTimeout(150);
};

const metaTipsTab = onTopic(META, META_TIPS_TOPIC, `${META_TIPS_TOPIC.title} - Community - ${META.name}`);
const streamingTab = onTopic(OPENAI, STREAMING_TOPIC, `${STREAMING_TOPIC.title} - API - ${OPENAI.name}`);
const longThreadsTab = onTopic(OPENAI, LONG_THREADS_TOPIC, `${LONG_THREADS_TOPIC.title} - API - ${OPENAI.name}`);

const PANELS = {};
for (const theme of ['light', 'dark']) {
  PANELS[`meta-summary-chat-${theme}`] = {
    theme,
    stub: { ...metaTipsTab, store: ANTHROPIC_STORE },
    data: history({ sessions: [metaTips] }),
    capture: captureUntil('#chatContainer')
  };
  PANELS[`openai-agent-answer-${theme}`] = {
    theme,
    stub: { ...streamingTab, store: OPENAI_STORE },
    data: history({ activities: [agentRun] }),
    prepare: openSources,
    capture: captureUntil('#agentPanel')
  };
}
PANELS['meta-long-summary-light'] = {
  stub: { ...onTopic(META, META_LONG_TOPIC, `${META_LONG_TOPIC.title} - Community - ${META.name}`), store: ANTHROPIC_STORE },
  data: history({ sessions: [metaLong] }),
  capture: captureUntil('#chatContainer')
};
PANELS['activity-grouped-light'] = {
  stub: { ...streamingTab, store: OPENAI_STORE },
  data: history({ sessions: savedTopics, activities: [keptAgentRun] }),
  prepare: async page => {
    await page.click('#savedBtn');
    await page.waitForTimeout(400);
    await page.click('#summariesTab');
    await page.waitForTimeout(400);
  },
  // Down to the first saved topic of the second forum group.
  capture: async (page, outPath) => {
    const card = await page.locator('#savedList .forum-group').nth(1).locator('.saved-card').first().boundingBox();
    const container = await page.locator('main.container').boundingBox();
    await page.screenshot({
      ...STILL,
      path: outPath,
      clip: { x: container.x, y: container.y, width: container.width, height: card.y + card.height - container.y + 4 }
    });
  }
};
PANELS['setup-card-light'] = {
  stub: { ...longThreadsTab, store: {} },
  prepare: async page => {
    await page.click('label.setup-provider-option[data-provider="anthropic"]');
    await page.waitForTimeout(300);
  },
  capture: captureUntil('#setupCard')
};
// The toolbar icon was clicked on a forum that isn't enabled yet.
PANELS['allow-access-light'] = {
  stub: {
    ...longThreadsTab,
    store: ANTHROPIC_STORE,
    granted: [],
    activeTab: true,
    probe: { url: longThreadsTab.tabUrl, isDiscourse: true, basePath: '', forumName: OPENAI.name }
  },
  capture: captureUntil('#pageGuide')
};
PANELS['settings-light'] = {
  pagePath: SETTINGS,
  width: 900,
  height: 2600,
  stub: { store: { ...ANTHROPIC_STORE } },
  // "Ask the forum" through "History" without the sticky save bar. The clip
  // can reach past the bottom of the viewport, hence fullPage.
  capture: async (page, outPath) => {
    await page.addStyleTag({ content: '.action-bar { display: none !important; }' });
    await page.waitForTimeout(100);
    const top = await page.locator('section:has(#researchHeading)').boundingBox();
    const bottom = await page.locator('section:has(#historyHeading)').boundingBox();
    const x = Math.min(top.x, bottom.x) - 16;
    await page.screenshot({
      ...STILL,
      path: outPath,
      fullPage: true,
      clip: { x, y: top.y - 16, width: top.width + 32, height: bottom.y + bottom.height - top.y + 32 }
    });
  }
};

async function renderPanel(
  browser,
  base,
  name,
  { theme = 'light', width = 460, height = 1400, pagePath = POPUP, stub, data, prepare, capture }
) {
  const { ctx, page, errors } = await openExtensionPage(browser, base, {
    pagePath,
    theme,
    width,
    height,
    deviceScaleFactor: 2,
    stub,
    settle: 600
  });
  if (data) {
    await seedHistory(page, data);
    await page.reload();
    await page.waitForTimeout(800);
  }
  if (prepare) await prepare(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(0, 0);
  if (!(await brandImagesLoaded(page))) errors.push('broken brand image');
  const outPath = path.join(panelDir, `${name}.png`);
  await capture(page, outPath);
  await ctx.close();
  console.log(`${errors.length ? 'FAIL' : 'ok  '} panel ${name}`);
  for (const e of errors) console.log(`     ${e}`);
  return errors.length;
}

// ---------- Compose + compress ----------

// Each image gets a freshly loaded page: an element screenshot scrolls the
// page, and the scroll position left by an earlier capture shifts how the
// panels are resampled, so a shared page would make results depend on --only.
async function compose(browser, base, images) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1600 }, deviceScaleFactor: 2 });
  for (const image of images) {
    const page = await ctx.newPage();
    await page.goto(`${base}/readme-showcase.html`);
    const broken = await page.evaluate(() =>
      [...document.images].filter(i => !(i.complete && i.naturalWidth > 0)).map(i => i.getAttribute('src'))
    );
    if (broken.length) throw new Error(`Missing panels (render them first): ${broken.join(', ')}`);
    await page.waitForTimeout(100);
    const raw = await page.locator(`#${image.id}`).screenshot();
    await page.close();
    const meta = await sharp(raw).metadata();
    let pipeline = sharp(raw);
    if (meta.width > 1600) pipeline = pipeline.resize({ width: 1600 });
    const outPath = path.join(outDir, image.file);
    await pipeline.png({ palette: true, compressionLevel: 9, effort: 10, quality: 95, dither: 0 }).toFile(outPath);
    console.log(`ok   ${relative(outPath)} ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
  }
  await ctx.close();
}

// ---------- Run ----------

requireDist();
const wanted = onlyFilter(args);
const images = IMAGES.filter(i => wanted(i.file.replace(/\.png$/, '')));
if (!images.length) throw new Error(`--only matched nothing; images: ${IMAGES.map(i => i.file.replace(/\.png$/, '')).join(', ')}`);
const panels = [...new Set(images.flatMap(i => i.panels))];
fs.mkdirSync(panelDir, { recursive: true });

const server = await startServer({ '/': TEMPLATES, '/panels/': panelDir });
const dist = await startServer({ '/': DIST });
const browser = await chromium.launch();
let problems = 0;
try {
  for (const name of panels) problems += await renderPanel(browser, dist.base, name, PANELS[name]);
  await compose(browser, server.base, images);
} finally {
  await browser.close();
  await server.close();
  await dist.close();
}

const files = images.map(i => i.file);
if (args.check) {
  console.log(`\nCompare with ${relative(docsDir)}:`);
  if (!(await compareDirs(outDir, docsDir, files))) problems++;
}
if (args.write) {
  for (const file of files) fs.copyFileSync(path.join(outDir, file), path.join(docsDir, file));
  console.log(`\nWrote ${files.length} image(s) to ${relative(docsDir)}`);
} else {
  console.log(`\nImages in ${relative(outDir)} (run with --write to update ${relative(docsDir)})`);
}
process.exit(problems ? 1 : 0);
