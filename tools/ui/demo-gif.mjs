// The animated README demo (docs/screenshots/demo.gif): the real dist/ side
// panel, driven through the chrome.* stub the way the background would drive
// it (task progress, streamed text, agent steps), next to the mock forum page
// the store screenshots use. Three scenes: summarize a topic, ask a follow-up,
// ask the whole forum.
//
//   1. backgrounds: templates/store/ page with an empty panel slot, per scene
//   2. panel frames: the side panel at each step, with a drawn cursor
//   3. ffmpeg: frames with their durations → palette → GIF
//
// Usage: node tools/ui/demo-gif.mjs [--locale=en|zh-CN|zh-TW] [--write] [--width=960]
//   --locale interface and fixture language (default en); other languages
//            write to out/demo/<locale>/ and docs/screenshots/<locale>/demo.gif
//   --write  also copy the result to docs/screenshots/demo.gif
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { BRAND, DIST, OUT, REPO, TEMPLATES, parseArgs, relative, requireDist } from './lib/env.mjs';
import { startServer } from './lib/static-server.mjs';
import { openExtensionPage, seedHistory } from './lib/extension-page.mjs';
import { LOCALES } from '../../src/shared/i18n.mjs';
import { META, OPENAI, OPENAI_STORE, agentActivity, chat, history, onTopic } from './fixtures/forums.mjs';
import { FORUM_LOOKS, storeFixtures } from './fixtures/store.mjs';
import { copyFor, localeDir } from './fixtures/copy/index.mjs';
import { screenshotPage, topicView } from './templates/store/screenshot.mjs';

const args = parseArgs();
const locale = args.locale || 'en';
const copy = copyFor(locale);
const { topics, run: rateLimit, metaTips, metaTipsForumTopic, streamingForumTopic } = storeFixtures(copy);
// Status lines the background would send, in the interface language.
const status = (key, params = {}) =>
  LOCALES[locale][key].replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
const outDir = localeDir(path.join(OUT, 'demo'), locale);
const htmlDir = path.join(outDir, 'html');
const framesDir = path.join(outDir, 'frames');
const W = 1280;
const H = 800;
const PANEL_W = 440;
const PANEL_H = 732;
const GIF_W = Number(args.width) || 960;
const browserLocale = locale === 'en' ? undefined : locale;

// ---------- Backgrounds ----------

const metaUrl = `meta.discourse.org/t/${topics.metaTips.slug}/${topics.metaTips.topicId}`;
const SCENES = {
  summary: { url: metaUrl, forumHtml: topicView(FORUM_LOOKS.meta, metaTipsForumTopic, copy.forum.ui), ...copy.demo.summary },
  chat: { url: metaUrl, forumHtml: topicView(FORUM_LOOKS.meta, metaTipsForumTopic, copy.forum.ui), ...copy.demo.chat },
  agent: {
    url: `community.openai.com/t/${topics.streaming.slug}/${topics.streaming.topicId}`,
    forumHtml: topicView(FORUM_LOOKS.openai, streamingForumTopic, copy.forum.ui),
    ...copy.demo.agent
  }
};

async function renderBackgrounds(browser, base) {
  const out = {};
  let slot;
  for (const [name, scene] of Object.entries(SCENES)) {
    fs.writeFileSync(path.join(htmlDir, `${name}.html`), screenshotPage({ ...scene, lang: copy.lang, panel: 'blank' }));
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(`${base}/html/${name}.html`);
    await page.waitForLoadState('networkidle');
    slot = await page.locator('.panel').boundingBox();
    out[name] = await page.locator('.stage').screenshot();
    await ctx.close();
  }
  return { backgrounds: out, slot: { x: Math.round(slot.x), y: Math.round(slot.y) } };
}

// ---------- Frames ----------

const CURSOR = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M5 3 L5 22 L10 17.5 L13.5 25 L17 23.5 L13.6 16 L20 16 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`
);
const clickRing = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><circle cx="22" cy="22" r="18" fill="rgba(79,70,229,0.22)" stroke="rgba(79,70,229,0.9)" stroke-width="3"/></svg>`
);

const frames = [];
let scene = 'summary';
let cursor = null;

async function snap(page, ms, { ring = false } = {}) {
  const panel = await page.screenshot({ animations: 'disabled' });
  frames.push({ scene, panel, cursor: cursor && { ...cursor }, ring, ms });
}

async function center(page, sel) {
  const box = await page.locator(sel).first().boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Glide the cursor to an element, then click it with a ring.
async function clickOn(page, sel) {
  const to = await center(page, sel);
  const from = cursor || { x: PANEL_W - 60, y: PANEL_H - 80 };
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const e = 1 - (1 - t) ** 3;
    cursor = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
    await snap(page, 60);
  }
  await snap(page, 250, { ring: true });
  await page.click(sel);
}

async function typeInto(page, sel, text) {
  await page.click(sel);
  for (let i = 0; i < text.length; i += 3) {
    await page.fill(sel, text.slice(0, i + 3));
    await snap(page, 70);
  }
  await snap(page, 400);
}

const fire = (page, message) => page.evaluate(m => window.__fire('onMessage', m, {}), message);
const lastEnqueued = (page, type) =>
  page.evaluate(type => {
    const i = window.__sent.findLastIndex(m => m.action === 'enqueueTask' && m.taskType === type);
    return { ...window.__sent[i], id: `task-${i + 1}` };
  }, type);

// `offset` px under the sticky header.
const scrollTo = (page, sel, offset = 8) =>
  page.evaluate(
    ({ sel, offset }) => {
      const el = document.querySelector(sel);
      const header = document.querySelector('.app-header')?.getBoundingClientRect().height || 0;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - header - offset);
    },
    { sel, offset }
  );
const scrollToBottom = page => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

// Split text into chunks of a few words, the way a model streams.
function chunks(text, words = 4) {
  const parts = text.split(/(\s+)/);
  const out = [];
  for (let i = 0; i < parts.length; i += words * 2) out.push(parts.slice(i, i + words * 2).join(''));
  return out;
}

const metaTab = onTopic(META, topics.metaTips, `${topics.metaTips.title} - ${copy.tabCategory.meta} - ${META.name}`);
const openaiTab = onTopic(OPENAI, topics.streaming, `${topics.streaming.title} - ${copy.tabCategory.openai} - ${OPENAI.name}`);

const SUMMARY = metaTips.summary;
const QUESTION = copy.store.tipsChat[0];
const ANSWER = copy.store.tipsChat[1];
// Chinese streams a few characters at a time, not words.
const streamParts = (text, size) => (copy.lang === 'en' ? chunks(text, size) : text.match(new RegExp(`[\\s\\S]{1,${size * 3}}`, 'g')));

async function summaryAndChat(browser, base) {
  const store = { ...OPENAI_STORE, showFloatingButton: true };
  const { ctx, page, errors } = await openExtensionPage(browser, base, {
    width: PANEL_W,
    height: PANEL_H,
    stub: { ...metaTab, store },
    locale: browserLocale
  });
  scene = 'summary';
  cursor = null;
  await snap(page, 900);
  await clickOn(page, '#summarizeBtn');
  await page.waitForTimeout(150);
  const task = await lastEnqueued(page, 'summary');
  const base0 = {
    id: task.id,
    type: 'summary',
    topicId: String(topics.metaTips.topicId),
    siteUrl: META.siteUrl,
    topicKey: metaTab.pageState.topicKey,
    title: topics.metaTips.title,
    error: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await snap(page, 300);
  cursor = null;
  for (const done of [0, 30, 62, 88]) {
    await fire(page, {
      action: 'taskUpdated',
      task: {
        ...base0,
        status: 'running',
        phase: 'fetching',
        statusText: status('fetch.readReplies', { read: done, total: 87 }),
        progress: {
          currentPage: 1,
          totalPages: 1,
          totalPosts: 88,
          processedPosts: done,
          percent: Math.round((done / 88) * 100),
          etaMs: (88 - done) * 40
        },
        updatedAt: Date.now()
      }
    });
    await page.waitForTimeout(120);
    await snap(page, 260);
  }
  await fire(page, {
    action: 'taskUpdated',
    task: {
      ...base0,
      status: 'running',
      phase: 'generating',
      statusText: status('executor.generatingSummary'),
      progress: null,
      updatedAt: Date.now()
    }
  });
  for (const chunk of streamParts(SUMMARY, 4)) {
    await fire(page, { action: 'taskStream', taskId: task.id, topicKey: base0.topicKey, type: 'summary', chunk });
    await page.waitForTimeout(60);
    await snap(page, 110);
  }
  // Done: what the background saves, then the panel re-reads it.
  const saved = {
    ...metaTips,
    provider: 'openai',
    model: 'gpt-4o-mini',
    history: [],
    chatUpdatedAt: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    summaryUpdatedAt: Date.now()
  };
  await seedHistory(page, history({ sessions: [saved] }));
  await fire(page, {
    action: 'taskUpdated',
    task: { ...base0, status: 'completed', phase: 'completed', statusText: status('task.completed'), progress: null, updatedAt: Date.now() }
  });
  await fire(page, { action: 'sessionUpdated', topicKey: base0.topicKey });
  await page.waitForTimeout(500);
  await snap(page, 2200);

  // Follow-up chat: typed into the question box at the bottom ("This post");
  // sending it opens the Chat tab.
  scene = 'chat';
  await snap(page, 700);
  cursor = await center(page, '#chatInput');
  await typeInto(page, '#chatInput', QUESTION);
  await clickOn(page, '#sendChatBtn');
  await page.waitForTimeout(250);
  const chatTask = await page.evaluate(() => document.querySelector('.chat-message.assistant.pending')?.dataset.taskId);
  cursor = null;
  await scrollToBottom(page);
  await snap(page, 400);
  for (const chunk of streamParts(ANSWER, 3)) {
    await fire(page, { action: 'taskStream', taskId: chatTask, topicKey: base0.topicKey, type: 'chat', chunk });
    await page.waitForTimeout(60);
    await scrollToBottom(page);
    await snap(page, 110);
  }
  await seedHistory(
    page,
    history({
      sessions: [
        {
          ...saved,
          history: [chat('user', QUESTION, 0), chat('assistant', ANSWER, 0)],
          chatUpdatedAt: Date.now(),
          updatedAt: Date.now() + 1
        }
      ]
    })
  );
  await fire(page, {
    action: 'taskUpdated',
    task: {
      ...base0,
      id: chatTask,
      type: 'chat',
      status: 'completed',
      phase: 'completed',
      statusText: status('task.completed'),
      progress: null,
      updatedAt: Date.now()
    }
  });
  await fire(page, { action: 'sessionUpdated', topicKey: base0.topicKey });
  await page.waitForTimeout(500);
  await scrollToBottom(page);
  await snap(page, 2400);
  await ctx.close();
  return errors;
}

async function askTheForum(browser, base) {
  const { ctx, page, errors } = await openExtensionPage(browser, base, {
    width: PANEL_W,
    height: PANEL_H,
    stub: { ...openaiTab, store: OPENAI_STORE },
    locale: browserLocale
  });
  scene = 'agent';
  cursor = null;
  await snap(page, 700);
  await clickOn(page, '#agentLaunchBtn');
  await page.waitForTimeout(250);
  await snap(page, 300);
  await typeInto(page, '#agentInput', rateLimit.question);
  await clickOn(page, '#sendAgentBtn');
  await page.waitForTimeout(250);
  const task = await lastEnqueued(page, 'agent');
  cursor = null;
  const runId = task.agentRunId || task.id;
  const ids = { activityId: runId, agentRunId: runId, taskId: task.id };
  const steps = rateLimit.steps.slice(0, 4);
  const sources = rateLimit.sources.slice(0, 2);
  const answer = copy.store.agentAnswer;
  const run = overrides =>
    agentActivity({ id: 'demo', question: rateLimit.question, ...overrides, ...ids, createdAt: Date.now(), startedAt: Date.now() });
  await fire(page, {
    action: 'taskUpdated',
    task: {
      ...task,
      id: task.id,
      type: 'agent',
      status: 'running',
      phase: 'planning',
      statusText: status('agent.starting'),
      progress: { percent: 5 },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  });
  await snap(page, 500);
  for (let i = 0; i < steps.length; i++) {
    for (const finished of [false, true]) {
      const shown = steps
        .slice(0, i + 1)
        .map((s, k) => (k === i && !finished ? { ...s, status: 'running', title: '', resultCount: null, sourceId: '', detail: '' } : s));
      await fire(page, {
        action: 'activityUpdated',
        activity: run({
          status: 'running',
          answer: '',
          steps: shown,
          sources: sources.slice(0, shown.filter(s => s.sourceId && s.status !== 'running').length),
          phase: 'running_tool',
          updatedAt: Date.now(),
          progress: { percent: 10 + i * 18, completedSteps: i + (finished ? 1 : 0), totalSteps: 15, sourceCount: 0 }
        })
      });
      await page.waitForTimeout(120);
      await scrollTo(page, '#agentPanel');
      await snap(page, finished ? 450 : 350);
    }
  }
  await fire(page, {
    action: 'activityUpdated',
    activity: run({ status: 'running', answer: '', steps, sources, phase: 'answering', updatedAt: Date.now() })
  });
  for (const chunk of streamParts(answer, 4)) {
    await fire(page, { action: 'taskStream', taskId: task.id, type: 'agent', chunk });
    await page.waitForTimeout(60);
    await scrollToBottom(page);
    await snap(page, 110);
  }
  await fire(page, {
    action: 'taskUpdated',
    task: {
      ...task,
      type: 'agent',
      status: 'completed',
      phase: 'completed',
      statusText: status('task.completed'),
      progress: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  });
  await fire(page, { action: 'activityUpdated', activity: run({ steps, sources, answer, updatedAt: Date.now() + 10 }) });
  await page.waitForTimeout(500);
  await scrollTo(page, '#agentPanel');
  await snap(page, 900);
  await clickOn(page, '#agentPanel .agent-citation');
  await page.waitForTimeout(300);
  cursor = null;
  await snap(page, 3000);
  await ctx.close();
  return errors;
}

// ---------- Compose ----------

async function writeFrames(backgrounds, slot) {
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const list = [];
  for (const [i, f] of frames.entries()) {
    const layers = [{ input: f.panel, left: slot.x, top: slot.y }];
    if (f.cursor) {
      const cx = Math.round(slot.x + f.cursor.x);
      const cy = Math.round(slot.y + f.cursor.y);
      const at = (x, y, size) => ({ left: Math.max(0, Math.min(W - size, x)), top: Math.max(0, Math.min(H - size, y)) });
      if (f.ring) layers.push({ input: clickRing, ...at(cx - 22, cy - 22, 44) });
      layers.push({ input: CURSOR, ...at(cx - 5, cy - 3, 28) });
    }
    const file = path.join(framesDir, `${String(i).padStart(4, '0')}.png`);
    // sharp resizes before it composites, so composite first.
    const full = await sharp(backgrounds[f.scene]).composite(layers).png().toBuffer();
    await sharp(full)
      .resize(GIF_W, Math.round((GIF_W * H) / W), { kernel: 'lanczos3' })
      .removeAlpha()
      .png()
      .toFile(file);
    list.push(`file '${file}'\nduration ${(f.ms / 1000).toFixed(3)}`);
  }
  // The concat demuxer ignores the last duration unless the file repeats.
  list.push(`file '${path.join(framesDir, `${String(frames.length - 1).padStart(4, '0')}.png`)}'`);
  const listFile = path.join(outDir, 'frames.txt');
  fs.writeFileSync(listFile, `${list.join('\n')}\n`);
  return listFile;
}

function encodeGif(listFile, outFile) {
  const palette = path.join(outDir, 'palette.png');
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-vf',
    'palettegen=max_colors=192:stats_mode=full',
    palette
  ]);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listFile,
    '-i',
    palette,
    '-lavfi',
    'paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
    '-loop',
    '0',
    outFile
  ]);
}

// ---------- Run ----------

requireDist();
fs.mkdirSync(htmlDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'panels'), { recursive: true });
await sharp({ create: { width: PANEL_W, height: PANEL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .png()
  .toFile(path.join(outDir, 'panels', 'blank.png'));

const dist = await startServer({ '/': DIST });
const server = await startServer({ '/': outDir, '/templates/': TEMPLATES, '/brand/': BRAND });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let errors = [];
let bg;
try {
  bg = await renderBackgrounds(browser, server.base);
  errors = [...(await summaryAndChat(browser, dist.base)), ...(await askTheForum(browser, dist.base))];
} finally {
  await browser.close();
  await server.close();
  await dist.close();
}
for (const e of errors) console.log(`     ${e}`);

const listFile = await writeFrames(bg.backgrounds, bg.slot);
const gif = path.join(outDir, 'demo.gif');
encodeGif(listFile, gif);
const seconds = frames.reduce((n, f) => n + f.ms, 0) / 1000;
console.log(
  `${errors.length ? 'FAIL' : 'ok  '} ${relative(gif)} ${frames.length} frames, ${seconds.toFixed(1)} s, ${(fs.statSync(gif).size / 1024).toFixed(0)} KB`
);
if (args.write) {
  const target = path.join(localeDir(path.join(REPO, 'docs', 'screenshots'), locale), 'demo.gif');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(gif, target);
  console.log(`Wrote ${relative(target)}`);
}
process.exit(errors.length ? 1 : 0);
