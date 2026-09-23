import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('forum context slider is collapsed by default but remains discoverable', async () => {
  const html = await readFile(
    new URL('../src/popup/popup.html', import.meta.url),
    'utf8'
  );
  const control = html.match(
    /<details class="chat-context-control"[^>]*>([\s\S]*?)<\/details>/
  );

  assert.ok(control, 'expected a collapsible forum context control');
  assert.doesNotMatch(control[0], /<details[^>]*\sopen(?:\s|>)/);
  assert.match(control[1], /<summary class="chat-context-summary">/);
  assert.match(control[1], /<span>Forum context<\/span>/);
  assert.match(control[1], /id="forumContextLimit"/);
});

test('exposes Agent entry, composer, and Activity detail controls', async () => {
  const html = await readFile(
    new URL('../src/popup/popup.html', import.meta.url),
    'utf8'
  );

  assert.match(html, /id="agentLaunchBtn"/);
  assert.match(html, /id="agentForm"/);
  assert.match(html, /id="agentInput"[^>]*maxlength="4000"/);
  assert.match(html, /id="agentDetailView"/);
  assert.match(html, /id="agentPanel"/);
  assert.match(html, /id="agentPill"/);
});

test('inline and detail Agent answers share one template without fixed IDs', async () => {
  const html = await readFile(
    new URL('../src/popup/popup.html', import.meta.url),
    'utf8'
  );
  const template = html.match(
    /<template id="agentAnswerTemplate">([\s\S]*?)<\/template>/
  );
  assert.ok(template, 'expected a shared Agent answer template');
  assert.doesNotMatch(template[1], /\sid="/);
  assert.doesNotMatch(template[1], /aria-live/);
  for (const part of ['progress', 'answer', 'searches', 'sources', 'actions']) {
    assert.match(template[1], new RegExp(`data-part="${part}"`));
  }
  assert.match(html, /id="agentPanel"[\s\S]*?data-agent-body/);
  assert.match(html, /id="agentDetailBody" data-agent-body/);
  assert.match(html, /id="agentAnnouncer"[^>]*aria-live="polite"/);
  assert.match(html, /<details id="recentTasks" class="recent-tasks" open>/);
});

test('live regions announce status, not streaming or re-rendered content', async () => {
  const html = await readFile(
    new URL('../src/popup/popup.html', import.meta.url),
    'utf8'
  );
  assert.match(html, /id="status"[^>]*role="status"/);
  assert.match(html, /<section class="topic-hero">/);
  for (const id of ['chatMessages', 'fetchProgress', 'activeTaskList', 'savedList']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"[^>]*aria-live`), id);
  }
});

test('follows the browser color scheme and keeps copy forum-neutral', async () => {
  const html = await readFile(
    new URL('../src/popup/popup.html', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(html, /data-theme=/);
  assert.doesNotMatch(html, /retention|credit card/i);
});
