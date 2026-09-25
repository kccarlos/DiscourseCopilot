import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FULL_PROMPTS,
  MINIMAL_PROMPTS,
  buildLanguageInstruction,
  getHierarchicalPrompt,
  getMinimalPromptFor,
  getPrompt,
  resolveSummarySystemPrompt
} from '../src/services/prompts.js';
import { DEFAULT_RESPONSE_LANGUAGE, RESPONSE_LANGUAGES, normalizeResponseLanguage } from '../src/shared/response-language.mjs';
import { buildFollowUpMessages } from '../src/services/chat-context.mjs';
import { buildAgentMessages } from '../src/services/agent-context.mjs';

test('normalizes response languages and defaults to auto', () => {
  assert.equal(DEFAULT_RESPONSE_LANGUAGE, 'auto');
  assert.equal(normalizeResponseLanguage(undefined), 'auto');
  assert.equal(normalizeResponseLanguage('klingon'), 'auto');
  assert.equal(normalizeResponseLanguage(' ja '), 'ja');
  assert.equal(RESPONSE_LANGUAGES[0].value, 'auto');
  for (const value of ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru']) {
    assert.equal(normalizeResponseLanguage(value), value);
  }
});

test('auto language follows the discussion or the question', () => {
  assert.match(buildLanguageInstruction('auto'), /same language as the discussion/);
  assert.match(buildLanguageInstruction('auto', 'question'), /same language as the user's question/);
  assert.match(buildLanguageInstruction('unknown'), /same language as the discussion/);
});

test('pinned language names the chosen language', () => {
  assert.equal(buildLanguageInstruction('en'), 'Respond in English.');
  assert.match(buildLanguageInstruction('zh-Hans'), /^Respond in Simplified Chinese/);
  assert.match(buildLanguageInstruction('zh-Hant', 'question'), /^Respond in Traditional Chinese .*unless the user explicitly asks/);
});

test('built-in prompts are forum-neutral and do not force a language', () => {
  for (const prompts of [FULL_PROMPTS, MINIMAL_PROMPTS]) {
    for (const prompt of Object.values(prompts)) {
      assert.doesNotMatch(prompt, /US\s?Card|credit card/i);
      assert.doesNotMatch(prompt, /Chinese|中文/);
      assert.doesNotMatch(prompt, /\*\*LANGUAGE:\*\*/);
      assert.doesNotMatch(prompt, /[一-鿿]/);
    }
  }
});

test('summary prompts append the language instruction', () => {
  const auto = getPrompt('system', false, 'auto');
  assert.ok(auto.startsWith(FULL_PROMPTS.system));
  assert.match(auto, /\*\*LANGUAGE:\*\* Respond in the same language as the discussion/);

  const pinned = resolveSummarySystemPrompt('', undefined, 'fr');
  assert.ok(pinned.startsWith(FULL_PROMPTS.system));
  assert.match(pinned, /\*\*LANGUAGE:\*\* Respond in French/);

  assert.match(getPrompt('op', true, 'de'), /Respond in German/);
});

test('custom prompts keep precedence and still get the language line', () => {
  const prompt = resolveSummarySystemPrompt('  Be terse.  ', undefined, 'ja');
  assert.match(prompt, /^Be terse\./);
  assert.match(prompt, /Respond in Japanese/);

  const phase = getHierarchicalPrompt('comments', 'Be terse.', 'ko');
  assert.match(phase, /^Be terse\./);
  assert.match(phase, /processed hierarchically/);
  assert.match(phase, /Respond in Korean/);
});

test('minimal fallback preserves the phase and the language', () => {
  const full = getHierarchicalPrompt('comments', '', 'es');
  const minimal = getMinimalPromptFor(full, 'es');
  assert.ok(minimal.startsWith(MINIMAL_PROMPTS.comments));
  assert.match(minimal, /Respond in Spanish/);
  assert.equal(getMinimalPromptFor(FULL_PROMPTS.final), MINIMAL_PROMPTS.final);
});

test('follow-up messages use the response language and forum name', () => {
  const base = {
    content: 'Original post',
    summary: 'Summary',
    question: 'What now?'
  };
  const auto = buildFollowUpMessages({ ...base, forumName: 'OpenAI Developer Community' });
  assert.match(auto[0].content, /discussion from OpenAI Developer Community/);
  assert.match(auto[0].content, /same language as the user's question/);
  assert.doesNotMatch(auto[0].content, /US\s?Card/i);

  const pinned = buildFollowUpMessages({
    ...base,
    systemPrompt: 'Be terse.',
    responseLanguage: 'pt'
  });
  assert.match(pinned[0].content, /^Be terse\./);
  assert.match(pinned[0].content, /Respond in Portuguese/);
});

test('Agent messages use the response language and forum name', () => {
  const sources = [{ sourceId: 'S1', title: '', text: 'Source text' }];
  const auto = buildAgentMessages({ question: 'How?', sources, forumName: 'Discourse Meta' });
  assert.match(auto[0].content, /discussions on Discourse Meta/);
  assert.match(auto[0].content, /same language as the user's question/);
  assert.match(auto[1].content, /Title: Forum discussion/);

  const pinned = buildAgentMessages({
    question: 'How?',
    sources,
    systemPrompt: 'Be terse.',
    responseLanguage: 'ru'
  });
  assert.match(pinned[0].content, /^Be terse\./);
  assert.match(pinned[0].content, /a Discourse forum/);
  assert.match(pinned[0].content, /Respond in Russian/);
});
