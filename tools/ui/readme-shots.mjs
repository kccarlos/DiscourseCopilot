// README screenshots (docs/screenshots/*.png) from the real built pages.
//
//   1. panels:  dist/ side panel and settings page with the chrome.* stub and
//               fixtures/readme.mjs data, captured at 2x   → out/readme/panels/
//   2. compose: templates/readme-showcase.html frames the panels (browser
//               window, flat stage, hairline), one element per image
//   3. compress: ≤1600 px wide, 8-bit palette PNG          → out/readme/
//
// Usage: node tools/ui/readme-shots.mjs [--locale=en|zh-CN|zh-TW] [--only=hero,feature-setup] [--check] [--write]
//   --locale interface and fixture language (default en); other languages
//            write to out/readme/<locale>/ and docs/screenshots/<locale>/
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
import { readmeFixtures } from './fixtures/readme.mjs';
import { copyFor, localeDir } from './fixtures/copy/index.mjs';

const args = parseArgs();
const locale = args.locale || 'en';
const copy = copyFor(locale);
const { topics, agentRun, keptAgentRun, metaLong, metaTips, metaTipsLongChat, savedTopics, followUpDraft } = readmeFixtures(copy);
const outDir = localeDir(path.join(OUT, 'readme'), locale);
const panelDir = path.join(outDir, 'panels');
const docsDir = localeDir(path.join(REPO, 'docs', 'screenshots'), locale);

// Final image → showcase element and the panels it frames.
const IMAGES = [
  { file: 'hero.png', id: 'heroStage', panels: ['meta-summary-light', 'openai-agent-tall-light', 'meta-chat-dark'] },
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

// The panel as the side panel shows it: the whole viewport, with the question
// box (#composerDock, sticky) at the bottom.
const captureViewport = async (page, outPath) => {
  await page.screenshot({ ...STILL, path: outPath });
};

// Shrink the viewport to the content, so the question box sits right under
// the last card instead of at the bottom of a tall, mostly empty viewport.
const fitToContent = async (page, outPath) => {
  const width = page.viewportSize().width;
  const height = await page.evaluate(() => {
    const dock = document.getElementById('composerDock');
    let bottom = 0;
    for (const el of dock.parentElement.children) {
      const box = el.getBoundingClientRect();
      if (el !== dock && box.height) bottom = Math.max(bottom, box.bottom + window.scrollY);
    }
    return Math.ceil(bottom + 20 + dock.offsetHeight);
  });
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await captureViewport(page, outPath);
};

// "Show all" on a long summary (it is cut to a share of the viewport).
const expandSummary = async page => {
  const toggle = page.locator('#summaryContainer .clamp-toggle');
  if (await toggle.count()) {
    await toggle.first().click();
    await page.waitForTimeout(200);
  }
};

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

// Ask the forum: the research steps and the sources open, as after a click on each.
const openSteps = async page => {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('#agentPanel details[data-part="steps"], #agentPanel details[data-part="sources"]')) {
      d.classList.remove('hidden');
      d.open = true;
    }
  });
  await page.waitForTimeout(150);
};

// Only the sources list, as after a click on "Sources".
const openSources = async page => {
  await page.evaluate(() => {
    for (const d of document.querySelectorAll('#agentPanel details[data-part="sources"]')) d.open = true;
  });
  await page.waitForTimeout(150);
};

const openChatTab = async page => {
  await page.click('#chatTab');
  await page.waitForTimeout(300);
};

// A follow-up being typed into the question box ("This post" scope).
const draftFollowUp = text => async page => {
  await expandSummary(page);
  await page.fill('#chatInput', text);
  await page.waitForTimeout(150);
};

const tab = (forum, topic, category) => onTopic(forum, topic, `${topic.title} - ${category} - ${forum.name}`);
const metaTipsTab = tab(META, topics.metaTipsReadme, copy.tabCategory.meta);
const streamingTab = tab(OPENAI, topics.streaming, copy.tabCategory.openai);
const longThreadsTab = tab(OPENAI, topics.longThreads, copy.tabCategory.openai);

// Hero frames show a real side-panel viewport: 272 px wide frames, 640 px
// (the raised one 692 px) tall, i.e. 460 x 1082 / 1170 CSS px.
const HERO_H = 1082;
const HERO_RAISED_H = 1170;

const PANELS = {
  'meta-summary-light': {
    height: HERO_H,
    stub: { ...metaTipsTab, store: ANTHROPIC_STORE },
    data: history({ sessions: [metaTips] }),
    capture: captureViewport
  },
  'openai-agent-tall-light': {
    height: HERO_RAISED_H,
    stub: { ...streamingTab, store: OPENAI_STORE },
    data: history({ activities: [agentRun] }),
    prepare: openSources,
    capture: captureViewport
  },
  'meta-chat-dark': {
    theme: 'dark',
    height: HERO_H,
    stub: { ...metaTipsTab, store: ANTHROPIC_STORE },
    data: history({ sessions: [metaTipsLongChat] }),
    prepare: openChatTab,
    capture: captureViewport
  },
  'meta-long-summary-light': {
    stub: { ...tab(META, topics.metaLong, copy.tabCategory.meta), store: ANTHROPIC_STORE },
    data: history({ sessions: [metaLong] }),
    prepare: draftFollowUp(followUpDraft),
    capture: fitToContent
  }
};
for (const theme of ['light', 'dark']) {
  PANELS[`openai-agent-answer-${theme}`] = {
    theme,
    // Tall enough that the question box (sticky at the bottom) stays below the clip.
    height: 2400,
    stub: { ...streamingTab, store: OPENAI_STORE },
    data: history({ activities: [agentRun] }),
    prepare: openSteps,
    capture: captureUntil('#agentPanel')
  };
}
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
    probe: { url: longThreadsTab.tabUrl, isSupportedSite: true, basePath: '', forumName: OPENAI.name }
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
    // Exactly the white settings column: no slivers of the neighbouring sections.
    await page.screenshot({
      ...STILL,
      path: outPath,
      fullPage: true,
      clip: { x: top.x, y: top.y, width: top.width, height: bottom.y + bottom.height - top.y }
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
    settle: 600,
    locale: locale === 'en' ? undefined : locale
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
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
  fs.mkdirSync(docsDir, { recursive: true });
  for (const file of files) fs.copyFileSync(path.join(outDir, file), path.join(docsDir, file));
  console.log(`\nWrote ${files.length} image(s) to ${relative(docsDir)}`);
} else {
  console.log(`\nImages in ${relative(outDir)} (run with --write to update ${relative(docsDir)})`);
}
process.exit(problems ? 1 : 0);
