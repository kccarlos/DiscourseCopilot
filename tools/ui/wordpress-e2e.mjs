// Real end-to-end check of WordPress support: loads dist/ into real Chromium
// and reads a fixture WordPress post (shaped like doctorofcredit.com: slug
// URLs, <link rel="https://api.w.org/">, the REST comments API with
// X-WP-Total headers) with a fixture Ollama server standing in for the model.
//
//   pnpm test:wordpress [--dist=dist] [--keep-open]
//
// What it proves, in the real browser:
//   1. the page's own markup is recognized as a WordPress post (content script
//      and the side panel's probe) and the post id comes from the document;
//   2. a summary task for it reads the article and every comment (across
//      three REST pages) and the model is handed all of it;
//   3. a follow-up question is answered from the saved text;
//   4. a second summary request asks the site only for what could have changed;
//   5. a Discourse topic still works through the same registry (no site type),
//      and an Agent run on WordPress searches comments, reads the post and answers.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { REPO, parseArgs } from './lib/env.mjs';
import { pageStateFromProbe, probeDiscoursePage } from '../../src/popup/page-probe.mjs';

const args = parseArgs();
const dist = path.resolve(REPO, typeof args.dist === 'string' ? args.dist : 'dist');
const results = [];
const notes = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
  console.error(`${path.relative(REPO, dist)}/ is missing. Run \`pnpm build\` first.`);
  process.exit(2);
}

const COMMENT_COUNT = 250;
const POST_ID = 42;
const requests = [];

// ---------- the fixture site: WordPress and (for the regression) Discourse ----------

let siteOrigin = '';
const comments = Array.from({ length: COMMENT_COUNT }, (_, index) => ({
  id: 5000 + index + 1,
  parent: index > 0 && index % 7 === 0 ? 5000 + index : 0,
  author_name: `reader${index + 1}`,
  date_gmt: '2026-10-25T12:00:00',
  content: { rendered: `<p>Data point ${index + 1}: got the 10x &#038; it posted in ${index + 1} days.</p>` }
}));

const site = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  requests.push(`${req.method} ${url.pathname}${url.search}`);
  const json = (body, headers = {}, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=UTF-8', ...headers });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/chase-10x-paze-checkout/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
    res.end(`<!doctype html><html><head><title>Chase 10x With Paze - Fixture Blog</title>
<link rel='https://api.w.org/' href='${siteOrigin}/wp-json/' />
<link rel='shortlink' href='${siteOrigin}/?p=${POST_ID}' />
<meta property="og:site_name" content="Fixture Blog" /></head>
<body class="post-template-default single single-post postid-${POST_ID} single-format-standard"><h1>Chase 10x</h1></body></html>`);
  } else if (url.pathname === `/wp-json/wp/v2/posts/${POST_ID}`) {
    json({
      id: POST_ID,
      title: { rendered: '(Update) Chase 10x &#038; Paze Checkout' },
      link: `${siteOrigin}/chase-10x-paze-checkout/`,
      date_gmt: '2026-10-01T10:00:00',
      modified_gmt: '2026-10-25T11:50:59',
      content: { rendered: '<p>Chase Sapphire cards earn <strong>10x</strong> with Paze through 2026.</p>' }
    });
  } else if (url.pathname === '/wp-json/wp/v2/comments' && url.searchParams.get('search')) {
    json(
      [
        {
          id: 5100,
          post: POST_ID,
          parent: 0,
          author_name: 'speedy',
          date_gmt: '2026-10-25T13:00:00',
          content: { rendered: '<p>The 10x posted within 3 days for me.</p>' }
        }
      ],
      { 'X-WP-Total': '1', 'X-WP-TotalPages': '1' }
    );
  } else if (url.pathname === '/wp-json/wp/v2/posts' && url.searchParams.get('include')) {
    json([{ id: POST_ID, title: { rendered: '(Update) Chase 10x &#038; Paze Checkout' } }]);
  } else if (url.pathname === '/wp-json/wp/v2/comments') {
    const page = Number(url.searchParams.get('page') || 1);
    const perPage = Number(url.searchParams.get('per_page') || 10);
    const totalPages = Math.ceil(COMMENT_COUNT / perPage);
    if (page > totalPages) {
      json({ code: 'rest_post_invalid_page_number' }, {}, 400);
    } else {
      json(comments.slice((page - 1) * perPage, page * perPage), {
        'X-WP-Total': String(COMMENT_COUNT),
        'X-WP-TotalPages': String(totalPages)
      });
    }
  } else if (url.pathname === '/t/1.json') {
    json({ title: 'Balcony tomatoes', posts_count: 2, post_stream: { stream: [1, 2] } });
  } else if (url.pathname === '/raw/1') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(url.searchParams.get('page') === '1' ? 'Welcome to the garden club.\n\n\nReply from Ana: use deep pots.' : '');
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
siteOrigin = `http://127.0.0.1:${site.address().port}`;

// ---------- the fixture model: an Ollama-shaped server that records its prompts ----------

const prompts = [];
const model = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
  });
  req.on('end', () => {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname !== '/api/chat') {
      res.writeHead(404);
      res.end();
      return;
    }
    const parsed = JSON.parse(body || '{}');
    prompts.push(parsed.messages.map(message => message.content).join('\n---\n'));
    // The Agent plans with JSON actions (search comments, read the post,
    // finish); the answer that follows is ordinary text.
    let answer = 'FIXTURE ANSWER: readers report the 10x posting within days.';
    const last = parsed.messages.at(-1)?.content || '';
    if (/research agent/.test(parsed.messages[0]?.content || '') && !last.startsWith('Now write the final answer')) {
      const seen = parsed.messages.filter(message => /^OBSERVATION from /.test(message.content)).length;
      answer = JSON.stringify(
        [
          { tool: 'search_comments', arguments: { query: '10x posted' }, reason: 'find reports' },
          { tool: 'read_topic', arguments: { topic_id: String(POST_ID) }, reason: 'read the post' },
          { tool: 'final_answer', arguments: { answer: 'About three days.' }, reason: 'done' }
        ][Math.min(seen, 2)]
      );
    }
    const base = { model: parsed.model, created_at: new Date().toISOString() };
    const done = {
      ...base,
      message: { role: 'assistant', content: '' },
      done: true,
      done_reason: 'stop',
      eval_count: 8,
      prompt_eval_count: 20
    };
    if (parsed.stream === false) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...done, message: { role: 'assistant', content: answer } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    for (const word of answer.split(' ')) {
      res.write(`${JSON.stringify({ ...base, message: { role: 'assistant', content: `${word} ` }, done: false })}\n`);
    }
    res.end(`${JSON.stringify(done)}\n`);
  });
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const MODEL_URL = `http://127.0.0.1:${model.address().port}`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-wordpress-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
});

let exitCode = 0;
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const extensionId = new URL(worker.url()).host;
  console.log(`Extension ${extensionId} loaded from ${path.relative(REPO, dist)}/`);
  await new Promise(resolve => setTimeout(resolve, 1500));

  // ---------- 1. recognizing the page ----------
  const blog = await context.newPage();
  await blog.goto(`${siteOrigin}/chase-10x-paze-checkout/`);

  const probed = await blog.evaluate(probeDiscoursePage);
  const probeState = pageStateFromProbe(probed);
  check(
    'the side panel probe recognizes the post from its markup',
    probeState?.siteType === 'wordpress' && probeState.topicId === String(POST_ID) && probeState.siteUrl === siteOrigin,
    JSON.stringify(probeState)
  );

  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({ url }))[0]?.id, `${siteOrigin}/chase-10x-paze-checkout/`);
  await worker.evaluate(async id => chrome.scripting.executeScript({ target: { tabId: id }, files: ['src/content/content.js'] }), tabId);
  await new Promise(resolve => setTimeout(resolve, 800));
  const contentState = await worker.evaluate(async id => chrome.tabs.sendMessage(id, { action: 'getPostId' }), tabId);
  check(
    'the content script reports a WordPress post with its id',
    contentState?.isSupportedSite === true
      && contentState.siteType === 'wordpress'
      && contentState.topicId === String(POST_ID)
      && contentState.topicKey === `${new URL(siteOrigin).host}/t/${POST_ID}`
      && contentState.forumName === 'Fixture Blog',
    JSON.stringify(contentState)
  );

  // ---------- running tasks through the background queue ----------
  const extPage = await context.newPage();
  const pageErrors = [];
  extPage.on('pageerror', error => pageErrors.push(error.message));
  await extPage.goto(`chrome-extension://${extensionId}/src/settings/settings.html`);
  const run = request =>
    extPage.evaluate(
      ({ request: payload }) =>
        new Promise(resolve => {
          const chunks = [];
          let last = null;
          let settled = false;
          const finish = outcome => {
            if (settled) return;
            settled = true;
            chrome.runtime.onMessage.removeListener(listener);
            resolve({ ...outcome, text: chunks.join(''), task: last });
          };
          const listener = message => {
            if (message?.action === 'taskStream' && message.chunk != null) {
              chunks.push(typeof message.chunk === 'string' ? message.chunk : (message.chunk?.text ?? message.chunk?.delta ?? ''));
            }
            if (message?.action === 'taskUpdated') {
              last = message.task;
              if (['completed', 'failed', 'cancelled'].includes(last.status)) finish({ status: last.status });
            }
          };
          chrome.runtime.onMessage.addListener(listener);
          chrome.runtime.sendMessage({ action: 'enqueueTask', ...payload }).then(
            response => {
              if (response && response.success === false) finish({ status: 'rejected', error: response.error });
            },
            error => finish({ status: 'rejected', error: String(error) })
          );
          setTimeout(() => finish({ status: 'timeout' }), 60000);
        }),
      { request }
    );

  const base = {
    provider: 'ollama',
    settings: { url: MODEL_URL, model: 'fixture' },
    systemPrompt: '',
    responseLanguage: 'English'
  };
  const wordpress = {
    ...base,
    siteType: 'wordpress',
    siteUrl: siteOrigin,
    forumName: 'Fixture Blog',
    topicId: String(POST_ID),
    title: 'Chase 10x With Paze',
    url: `${siteOrigin}/chase-10x-paze-checkout/`
  };

  // ---------- 2. summary ----------
  const summary = await run({ ...wordpress, taskType: 'summary' });
  check(
    'WordPress summary completes',
    summary.status === 'completed',
    `${summary.status} ${summary.error || ''} ${JSON.stringify(summary.task?.error || '')}`
  );
  check('the summary streams in', summary.text.includes('FIXTURE ANSWER'), summary.text.slice(0, 80));
  const prompt = prompts.at(-1) || '';
  check(
    'the model was given the article',
    /Article: \(Update\) Chase 10x & Paze Checkout/.test(prompt) && prompt.includes('10x with Paze through 2026')
  );
  const commentsSeen = (prompt.match(/^Comment \d+ · /gm) || []).length;
  check('the model was given every comment', commentsSeen === COMMENT_COUNT, `${commentsSeen} of ${COMMENT_COUNT}`);
  check(
    'entities are decoded and replies point at their parent',
    prompt.includes('got the 10x & it posted in 250 days') && /· reply to comment 5007/.test(prompt)
  );
  const commentPages = requests.filter(entry => entry.includes('/comments')).length;
  check('three comment pages were requested', commentPages === 3, `${commentPages}`);

  // ---------- 3. follow-up question ----------
  const chat = await run({ ...wordpress, taskType: 'chat', question: 'How long did the 10x take to post?' });
  check('a follow-up question completes', chat.status === 'completed', chat.status);
  check('the follow-up is answered from the saved text', (prompts.at(-1) || '').includes('Data point 250'));

  // ---------- 4. a second read only asks for what could have changed ----------
  requests.length = 0;
  const again = await run({ ...wordpress, taskType: 'summary' });
  check('asking again completes', again.status === 'completed', again.status);
  const secondRead = requests.filter(entry => entry.includes('/wp-json/')).length;
  check('the second read asks the site for two things only, not all 250 comments again', secondRead === 2, requests.join(' | '));

  // ---------- 5. neighbours: Discourse unchanged, Agent on WordPress refused ----------
  const discourse = await run({
    ...base,
    siteUrl: siteOrigin,
    forumName: 'Fixture forum',
    topicId: '1',
    title: 'Balcony tomatoes',
    url: `${siteOrigin}/t/balcony-tomatoes/1`,
    taskType: 'summary'
  });
  check('a Discourse topic without a site type still summarizes', discourse.status === 'completed', discourse.status);
  check('and its replies reach the model', (prompts.at(-1) || '').includes('Reply from Ana: use deep pots.'));

  requests.length = 0;
  const agent = await run({ ...wordpress, taskType: 'agent', topicId: '', question: 'Who got the 10x?' });
  check('an Agent run on WordPress completes', agent.status === 'completed', `${agent.status} ${JSON.stringify(agent.task?.error || '')}`);
  check(
    'it searched the comments and read the post',
    requests.some(entry => entry.includes('/comments?search=')) && requests.some(entry => entry.includes('/posts/42'))
  );
  check('the answer streams in', agent.text.includes('FIXTURE ANSWER'), agent.text.slice(0, 80));
  const agentPrompts = prompts.filter(entry => entry.includes('OBSERVATION from read_topic'));
  check(
    'the model saw the comment hits and the post, with a source number',
    agentPrompts.length > 0
      && agentPrompts.at(-1).includes('The 10x posted within 3 days for me.')
      && agentPrompts.at(-1).includes('[S1] Topic 42'),
    agentPrompts.at(-1)?.slice(0, 120)
  );

  if (pageErrors.length) notes.push(`page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
} catch (error) {
  check('e2e run', false, error?.stack || String(error));
} finally {
  if (!args['keep-open']) await context.close();
  site.close();
  model.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  for (const note of notes) console.log(`NOTE  ${note}`);
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  exitCode = failed.length ? 1 : 0;
}
process.exit(exitCode);
