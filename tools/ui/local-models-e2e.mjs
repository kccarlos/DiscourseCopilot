// Real end-to-end check of the local-model providers (Ollama, LM Studio):
// loads dist/ into real Chromium and talks to the servers actually running on
// this machine. Local only (CI has neither); skips when Ollama isn't reachable.
//
//   pnpm test:local-models [--dist=dist] [--keep-open] [--agent]
//
// What it proves:
//   1. a request from an extension page reaches Ollama (Ollama answers 403 to
//      any request carrying a chrome-extension:// Origin unless the extension
//      strips it with declarativeNetRequest);
//   2. the settings page lists the models and "Test Connection" succeeds;
//   3. a real summary streams through the background task queue, and one agent
//      step runs (reported, not asserted: small models struggle with the JSON
//      action loop);
//   4. an ordinary web page is still refused by Ollama (the rule is scoped to
//      this extension's own requests).
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { REPO, parseArgs } from './lib/env.mjs';

const args = parseArgs();
const dist = path.resolve(REPO, typeof args.dist === 'string' ? args.dist : 'dist');
const OLLAMA = 'http://localhost:11434';
const LMSTUDIO = 'http://localhost:1234';
const results = [];
const notes = [];

function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function probe(base, pathname) {
  try {
    const response = await fetch(`${base}${pathname}`, { signal: AbortSignal.timeout(2500) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

const tags = await probe(OLLAMA, '/api/tags');
if (!tags) {
  console.log(`SKIP  Ollama is not reachable at ${OLLAMA}; start it (ollama serve) to run this check.`);
  process.exit(0);
}
const installed = (tags.models || []).map(model => model.name);
const model = installed.includes('qwen3.5:0.8b-mlx') ? 'qwen3.5:0.8b-mlx' : installed[0];
if (!model) {
  console.log('SKIP  Ollama has no installed models; run `ollama pull <model>` first.');
  process.exit(0);
}
console.log(`Ollama models: ${installed.join(', ')}; using ${model}`);
const lmstudio = await probe(LMSTUDIO, '/v1/models');
console.log(lmstudio ? `LM Studio is running (${lmstudio.data?.length ?? 0} models)` : 'LM Studio is not running; its checks are skipped.');

if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
  console.error(`${path.relative(REPO, dist)}/ is missing. Run \`pnpm build\` first.`);
  process.exit(2);
}

// One local server plays two roles on different host names: the fixture forum
// (http://localhost:PORT, host access comes with the manifest) and a stand-in
// ordinary website (http://evil.test:PORT) for the scoping check.
const POSTS = [
  'Welcome to the garden club. This thread collects tips for growing tomatoes on a balcony.',
  'Reply from Ana: use pots at least 30 cm deep, water in the morning, and feed every two weeks.',
  'Reply from Ben: cherry varieties like Sungold cope best with wind; stake them early.'
].join('\n\n');
const forum = http.createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url, 'http://x');
  if (pathname === '/t/1.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ title: 'Balcony tomatoes', posts_count: 3, post_stream: { stream: [1, 2, 3] } }));
  } else if (pathname === '/raw/1') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(searchParams.get('page') === '1' ? POSTS : '');
  } else if (pathname === '/page.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>site</title>');
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(resolve => forum.listen(0, resolve));
const port = forum.address().port;
const FORUM_URL = `http://localhost:${port}`;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-local-models-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--host-resolver-rules=MAP evil.test 127.0.0.1']
});

// A custom server host joins the rule only while it is allowed and saved. The browser prompt
// can't be answered in automation, so a copy of dist/ gets "[::1]" as a granted host and the
// check drives the saved URL: the host must join the rule, work, and leave the rule again.
async function customHostCheck() {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-local-models-dist-'));
  fs.cpSync(dist, copy, { recursive: true });
  const manifestPath = path.join(copy, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push('http://[::1]/*');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-local-models-'));
  const custom = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`]
  });
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    res.end(req.method === 'OPTIONS' ? '{}' : JSON.stringify({ origin: req.headers.origin ?? null }));
  });
  await new Promise(resolve => server.listen(0, '::1', resolve));
  try {
    const worker = custom.serviceWorkers()[0] || (await custom.waitForEvent('serviceworker', { timeout: 15000 }));
    const extensionId = new URL(worker.url()).host;
    const page = await custom.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/settings/settings.html`);
    const hosts = () =>
      worker.evaluate(async () => (await chrome.declarativeNetRequest.getDynamicRules())[0]?.condition.requestDomains || []);
    const waitFor = async predicate => {
      for (let i = 0; i < 40; i++) {
        const current = await hosts();
        if (predicate(current)) return current;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      return hosts();
    };
    const address = `http://[::1]:${server.address().port}/`;
    check(
      'rule starts with the loopback hosts only',
      (await waitFor(list => list.length === 2)).join() === 'localhost,127.0.0.1',
      (await hosts()).join()
    );
    await page.evaluate(url => chrome.storage.local.set({ ollamaUrl: url }), address.replace(/\/$/, ''));
    const added = await waitFor(list => list.includes('[::1]'));
    check('saving a custom server URL adds its host to the rule', added.includes('[::1]'), added.join());
    const origin = await page.evaluate(async url => {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return (await response.json()).origin;
    }, address);
    check('custom host: extension request goes without Origin', origin === null, String(origin));
    await page.evaluate(() => chrome.storage.local.remove('ollamaUrl'));
    const removed = await waitFor(list => !list.includes('[::1]'));
    check('changing the URL back removes the host from the rule', !removed.includes('[::1]'), removed.join());
  } finally {
    await custom.close();
    server.close();
    fs.rmSync(copy, { recursive: true, force: true });
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

let exitCode = 0;
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const extensionId = new URL(worker.url()).host;
  console.log(`Extension ${extensionId} loaded from ${path.relative(REPO, dist)}/`);
  // Let the worker finish its start-up registration.
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 1. A plain request from an extension page.
  const settingsUrl = `chrome-extension://${extensionId}/src/settings/settings.html`;
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(settingsUrl);
  const direct = await page.evaluate(async url => {
    try {
      const response = await fetch(url);
      return { status: response.status };
    } catch (error) {
      return { error: String(error) };
    }
  }, `${OLLAMA}/api/tags`);
  check('extension page can fetch Ollama /api/tags', direct.status === 200, JSON.stringify(direct));
  // POST requests carry an Origin header (GETs from an extension page do not), so this is
  // the request Ollama refuses without the fix.
  const chatBody = JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: 'Say ok.' }], options: { num_predict: 4 } });
  const postFromPage = await page.evaluate(
    async ({ url, body }) => {
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        return { status: response.status };
      } catch (error) {
        return { error: String(error) };
      }
    },
    { url: `${OLLAMA}/api/chat`, body: chatBody }
  );
  check('extension page can POST Ollama /api/chat', postFromPage.status === 200, JSON.stringify(postFromPage));

  // 2. Settings page: provider, default URL, model list, Test Connection.
  await page.selectOption('#providerSelect', 'ollama');
  const url = await page.inputValue('#ollamaUrl');
  check('Ollama default URL', url === OLLAMA, url);
  let listed = [];
  try {
    await page.waitForFunction(() => document.querySelectorAll('#ollamaModelList option').length > 0, null, { timeout: 8000 });
  } catch {
    // reported by the assertion below
  }
  listed = await page.$$eval('#ollamaModelList option', options => options.map(option => option.value));
  check(
    'model list shows the installed models',
    installed.every(name => listed.includes(name)),
    `listed: ${listed.join(', ') || 'none'}`
  );
  await page.fill('#ollamaModel', model);
  await page.click('#testBtn');
  let status = '';
  try {
    await page.waitForFunction(
      () =>
        /success|connect|working|ready/i.test(document.getElementById('status')?.textContent || '')
        || /refused|can.t reach|couldn/i.test(document.getElementById('status')?.textContent || ''),
      null,
      { timeout: 30000 }
    );
  } catch {
    // fall through to the assertion
  }
  status = (await page.textContent('#status')) || '';
  check(
    'Test Connection succeeds',
    /success|connect|working|ready/i.test(status) && !/refused|can.t reach|couldn/i.test(status),
    status.trim()
  );

  // 3. A real generation through the background task queue.
  await page.evaluate(
    ({ model: chosen }) => chrome.storage.local.set({ aiProvider: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: chosen }),
    { model }
  );
  const run = async request => {
    return await page.evaluate(
      ({ request }) =>
        new Promise(resolve => {
          const chunks = [];
          let last = null;
          let settled = false;
          const finish = outcome => {
            if (settled) return;
            settled = true;
            chrome.runtime.onMessage.removeListener(listener);
            resolve({ ...outcome, chunks: chunks.length, text: chunks.join(''), task: last });
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
          chrome.runtime.sendMessage({ action: 'enqueueTask', ...request }).then(
            response => {
              if (response && response.success === false) finish({ status: 'rejected', error: response.error });
            },
            error => finish({ status: 'rejected', error: String(error) })
          );
          setTimeout(() => finish({ status: 'timeout' }), request.timeoutMs);
        }),
      { request }
    );
  };
  const base = {
    siteUrl: FORUM_URL,
    forumName: 'Fixture forum',
    topicId: '1',
    title: 'Balcony tomatoes',
    url: `${FORUM_URL}/t/balcony-tomatoes/1`,
    provider: 'ollama',
    settings: { url: OLLAMA, model },
    systemPrompt: '',
    responseLanguage: 'English',
    timeoutMs: 240000
  };
  const summary = await run({ ...base, taskType: 'summary' });
  check(
    'summary task completes',
    summary.status === 'completed',
    `${summary.status}${summary.error ? `: ${summary.error}` : ''}${summary.task?.error ? `: ${JSON.stringify(summary.task.error).slice(0, 300)}` : ''}`
  );
  check(
    'summary text streams in',
    summary.chunks > 0 && summary.text.trim().length > 0,
    `${summary.chunks} chunks, ${summary.text.length} chars`
  );
  notes.push(`summary (${model}): ${summary.text.replace(/\s+/g, ' ').slice(0, 240)}`);

  const chat = await run({ ...base, taskType: 'chat', question: 'Which tomato variety copes best with wind?' });
  check('follow-up chat completes', chat.status === 'completed', chat.status);
  notes.push(`chat (${model}): ${chat.text.replace(/\s+/g, ' ').slice(0, 200)}`);

  if (args.agent) {
    const agent = await run({
      ...base,
      taskType: 'agent',
      topicId: '',
      question: 'What do people suggest for balcony tomatoes?',
      timeoutMs: 300000
    });
    notes.push(
      `agent step run (${model}): status ${agent.status}; ${agent.chunks} chunks; ${agent.text.replace(/\s+/g, ' ').slice(0, 300)}${agent.task?.error ? ` error ${JSON.stringify(agent.task.error).slice(0, 300)}` : ''}`
    );
  }

  // 4. Scoping: an ordinary web page is still refused by Ollama.
  const web = await context.newPage();
  const seen = [];
  web.on('response', response => {
    if (response.url().startsWith(`${OLLAMA}/api/`)) seen.push(`${response.request().method()} ${response.status()}`);
  });
  web.on('requestfailed', request => {
    if (request.url().startsWith(`${OLLAMA}/api/`)) seen.push(`${request.method()} failed: ${request.failure()?.errorText}`);
  });
  await web.goto(`http://evil.test:${port}/page.html`);
  const fromWeb = await web.evaluate(async url => {
    try {
      const response = await fetch(url);
      return { status: response.status };
    } catch (error) {
      return { error: String(error) };
    }
  }, `${OLLAMA}/api/tags`);
  const postFromWeb = await web.evaluate(
    async ({ url, body }) => {
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        return { status: response.status };
      } catch (error) {
        return { error: String(error) };
      }
    },
    { url: `${OLLAMA}/api/chat`, body: chatBody }
  );
  notes.push(`web page requests seen by the browser: ${seen.join('; ') || 'none'}`);
  check(
    'web page GET and POST to Ollama are still refused',
    fromWeb.status !== 200 && postFromWeb.status !== 200,
    `GET ${JSON.stringify(fromWeb)}; POST ${JSON.stringify(postFromWeb)}`
  );

  // The same scoping, measured exactly: echo servers report the Origin header they received,
  // on the loopback addresses the rule covers (any port).
  const echo = host =>
    new Promise(resolve => {
      const server = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Private-Network': 'true'
        });
        res.end(req.method === 'OPTIONS' ? '{}' : JSON.stringify({ origin: req.headers.origin ?? null }));
      });
      server.once('error', () => resolve(null));
      server.listen(0, host, () => resolve(server));
    });
  const postOrigin = (target, url) =>
    target.evaluate(async address => {
      try {
        const response = await fetch(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        return (await response.json()).origin;
      } catch (error) {
        return `error: ${error}`;
      }
    }, url);
  const loopback = await echo('127.0.0.1');
  const loopbackAddress = `http://127.0.0.1:${loopback.address().port}/`;
  check('127.0.0.1: extension request goes without Origin', (await postOrigin(page, loopbackAddress)) === null);
  const fromWebPage = await postOrigin(web, loopbackAddress);
  check(
    '127.0.0.1: web page request keeps its Origin',
    typeof fromWebPage === 'string' && fromWebPage.startsWith('http://evil.test'),
    String(fromWebPage)
  );
  loopback.close();

  if (pageErrors.length) notes.push(`settings page errors: ${pageErrors.slice(0, 3).join(' | ')}`);
  if (!lmstudio) notes.push('LM Studio not running: skipped.');
} catch (error) {
  check('e2e run', false, error?.stack || String(error));
} finally {
  if (!args['keep-open']) await context.close();
  try {
    await customHostCheck();
  } catch (error) {
    check('custom host check', false, error?.stack || String(error));
  }
  forum.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  for (const note of notes) console.log(`NOTE  ${note}`);
  const failed = results.filter(result => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  exitCode = failed.length ? 1 : 0;
}
process.exit(exitCode);
