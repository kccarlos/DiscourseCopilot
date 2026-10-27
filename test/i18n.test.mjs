import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import en from '../src/shared/locales/en.mjs';
import zhCN from '../src/shared/locales/zh-CN.mjs';
import zhTW from '../src/shared/locales/zh-TW.mjs';
import { getLocale, intlLocale, localizeDocument, resolveLocale, setLocaleForTests, t, tn } from '../src/shared/i18n.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

const sourceFiles = walk(SRC).filter(path => /\.(m?js)$/.test(path) && !path.includes(`${join('shared', 'locales')}`));
const placeholders = message => [...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test.afterEach(() => setLocaleForTests(null));

const CHINESE = { 'zh-CN': zhCN, 'zh-TW': zhTW };

test('English, Simplified and Traditional Chinese define the same keys', () => {
  // Chinese has no singular form, so `.one` keys are optional there.
  assert.deepEqual(Object.keys(zhTW).sort(), Object.keys(zhCN).sort(), 'zh-TW and zh-CN keys differ');
  const zhKeys = new Set(Object.keys(zhCN));
  const enKeys = Object.keys(en).filter(key => zhKeys.has(key) || !key.endsWith('.one'));
  assert.deepEqual([...zhKeys].sort(), [...enKeys].sort());
  for (const key of Object.keys(en)) {
    if (key.endsWith('.one')) assert.ok(`${key.slice(0, -4)}.other` in en, `${key} needs a .other form`);
  }
});

test('every message is a non-empty string with matching placeholders', () => {
  for (const [key, message] of Object.entries(en)) {
    assert.equal(typeof message, 'string', key);
    assert.ok(message.trim(), `empty English text for ${key}`);
    for (const [locale, messages] of Object.entries(CHINESE)) {
      if (!(key in messages)) continue;
      assert.ok(messages[key].trim(), `empty ${locale} text for ${key}`);
      assert.deepEqual(placeholders(messages[key]), placeholders(message), `${locale} placeholders differ for ${key}`);
    }
  }
});

test('Chinese messages use full-width punctuation instead of ASCII ,.?!:;', () => {
  for (const [key, message] of [...Object.entries(zhCN), ...Object.entries(zhTW)]) {
    // Keep ASCII punctuation only inside Latin text (URLs, product names, "10–200", env vars).
    const cjkThenAscii = /[一-鿿][,.?!:;]|[,?!:;]\s*[一-鿿]/.test(message.replace(/\{\w+\}/g, ''));
    assert.ok(!cjkThenAscii, `ASCII punctuation next to Chinese text in ${key}: ${message}`);
  }
});

test('Traditional Chinese messages contain no Simplified-only characters', () => {
  // The most common characters whose Simplified form differs; the language
  // names in responseLanguage.zh-Hans are the one place Simplified is meant.
  const simplified = /[这个为么说时们会发对开关问题论坛页设请过还没点显与历应选择网络链译输简检数据记录总结话复删务读语码图标签]/;
  for (const [key, message] of Object.entries(zhTW)) {
    if (key === 'responseLanguage.zh-Hans') continue;
    assert.ok(!simplified.test(message), `Simplified character in zh-TW ${key}: ${message}`);
  }
});

function dataKeys(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const keys = new Set();
  for (const match of html.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) keys.add(match[1]);
  for (const match of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of match[1].split(';')) keys.add(pair.split(':')[1].trim());
  }
  return keys;
}

for (const page of ['popup/popup.html', 'settings/settings.html']) {
  test(`${page}: every data-i18n key exists`, () => {
    const keys = dataKeys(join(SRC, page));
    assert.ok(keys.size > 20, 'the page should be tagged');
    for (const key of keys) assert.ok(key in en, `missing English message ${key}`);
    for (const key of keys) assert.ok(key in zhCN || key.endsWith('.one'), `missing Simplified Chinese message ${key}`);
    for (const key of keys) assert.ok(key in zhTW || key.endsWith('.one'), `missing Traditional Chinese message ${key}`);
  });

  test(`${page}: visible text nodes are all tagged`, () => {
    const html = readFileSync(join(SRC, page), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '')
      // Markup inside a data-i18n-html element belongs to its message.
      .replace(/<(\w+)[^>]*data-i18n-html[^>]*>[\s\S]*?<\/\1>/g, '');
    const allowed = new Set(['Forumind', 'Discourse', 'Copilot', '?', '↗', '×', '✓', '–', '·', '1', '2', '3', '4']);
    const leaks = [];
    // A text node belongs to the closest opening tag before it.
    for (const match of html.matchAll(/<([a-z][\w-]*)([^>]*)>([^<]+)/gi)) {
      const [, tag, attrs, rawText] = match;
      const text = rawText
        .replace(/&amp;/g, '&')
        .replace(/&[a-z]+;/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || allowed.has(text) || /^[\d\s.,%kKM+\-/]*$/.test(text)) continue;
      if (/data-i18n(?:-html)?=/.test(attrs) || (/^(title|option|datalist)$/i.test(tag) && /data-i18n/.test(attrs))) continue;
      leaks.push(`<${tag}> ${text}`);
    }
    // Strings that JavaScript always replaces before the user can see them are listed here.
    const rendered = [
      /^Loading/,
      /characters/,
      /^Up to /,
      /^Large contexts/,
      /^(Get a key|Download|Auto \(match the discussion\)|ollama pull model-name)$/,
      /^Conversations and Agent answers /,
      // Provider names, their domains and product names stay as they are.
      /^(OpenRouter|OpenAI|Anthropic|Groq|Google Gemini|Google AI Studio|Ollama( \(Local\))?|xAI( Grok)?|DeepSeek|LM Studio( \(Local\))?)$/,
      /^[\w.-]+\.(ai|com|org)(\/[\w-]+)?$/
    ];
    const unexpected = leaks.filter(entry => !rendered.some(pattern => pattern.test(entry.replace(/^<\w+> /, ''))));
    assert.deepEqual(unexpected, [], `untagged visible text:\n${unexpected.join('\n')}`);
  });
}

test('every literal t()/tn() key used in src exists', () => {
  const used = new Map();
  for (const path of sourceFiles) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([^'$]+)'/g)) used.set(match[1], path);
    for (const match of source.matchAll(/\btn\(\s*'([^'$]+)'/g)) {
      used.set(`${match[1]}.other`, path);
    }
  }
  assert.ok(used.size > 100);
  for (const [key, path] of used) {
    assert.ok(key in en, `${path.replace(ROOT, '')} uses unknown key ${key}`);
    assert.ok(key in zhCN, `${path.replace(ROOT, '')} key ${key} is missing in zh-CN`);
    assert.ok(key in zhTW, `${path.replace(ROOT, '')} key ${key} is missing in zh-TW`);
  }
});

test('locale detection maps Chinese browsers to zh-CN or zh-TW and everything else to English', () => {
  for (const language of ['zh', 'zh-CN', 'zh-SG', 'zh_CN', 'ZH-cn', 'zh-Hans-CN', 'zh-Hans']) {
    assert.equal(resolveLocale(language), 'zh-CN', language);
  }
  for (const language of ['zh-TW', 'zh-HK', 'zh-MO', 'zh_TW', 'ZH-tw', 'zh-Hant', 'zh-Hant-TW', 'zh-Hant-HK']) {
    assert.equal(resolveLocale(language), 'zh-TW', language);
  }
  for (const language of ['en', 'en-US', 'ja', 'ko-KR', 'fr', 'de-DE', '', undefined, null, 'zhx']) {
    assert.equal(resolveLocale(language), 'en', String(language));
  }
});

test('the locale comes from chrome.i18n, then navigator, then English', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  try {
    globalThis.chrome = { i18n: { getUILanguage: () => 'zh-TW' } };
    setLocaleForTests(null);
    assert.equal(getLocale(), 'zh-TW');
    globalThis.chrome = { i18n: { getUILanguage: () => 'zh-CN' } };
    setLocaleForTests(null);
    assert.equal(getLocale(), 'zh-CN');
    globalThis.chrome = { i18n: { getUILanguage: () => 'de' } };
    setLocaleForTests(null);
    assert.equal(getLocale(), 'en');
    delete globalThis.chrome;
    setLocaleForTests(null);
    assert.equal(getLocale(), 'en', 'Node has no chrome and a navigator language that is not Chinese or is missing');
  } finally {
    if (had) Object.defineProperty(globalThis, 'chrome', had);
    else delete globalThis.chrome;
    setLocaleForTests(null);
  }
});

test('t() interpolates, falls back to English, and returns unknown keys with a warning', () => {
  setLocaleForTests('en');
  assert.equal(t('guide.hero.title', { forum: 'Meta' }), 'You’re on Meta');
  assert.equal(intlLocale(), undefined);
  setLocaleForTests('zh-CN');
  assert.equal(t('guide.hero.title', { forum: 'Meta' }), '你正在浏览 Meta');
  assert.equal(intlLocale(), 'zh-CN');
  setLocaleForTests('zh-TW');
  assert.equal(t('guide.hero.title', { forum: 'Meta' }), '你正在瀏覽 Meta');
  assert.equal(intlLocale(), 'zh-TW');

  // A key present only in English falls back to English text.
  en['test.onlyEnglish'] = 'Only English {name}';
  try {
    assert.equal(t('test.onlyEnglish', { name: 'x' }), 'Only English x');
  } finally {
    delete en['test.onlyEnglish'];
  }

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = message => warnings.push(message);
  try {
    assert.equal(t('no.such.key'), 'no.such.key');
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no\.such\.key/);
});

test('tn() picks singular only in English', () => {
  setLocaleForTests('en');
  assert.equal(tn('answer.count.step', 1), '1 step');
  assert.equal(tn('answer.count.step', 3), '3 steps');
  setLocaleForTests('zh-CN');
  assert.equal(tn('answer.count.step', 1), '1 个步骤');
  assert.equal(tn('answer.count.step', 3), '3 个步骤');
  setLocaleForTests('zh-TW');
  assert.equal(tn('answer.count.step', 1), '1 個步驟');
});

test('localizeDocument fills text, attributes and the document language', () => {
  const makeElement = (dataset, attrs = {}) => ({
    dataset,
    attrs,
    textContent: 'old',
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
  });
  const text = makeElement({ i18n: 'popup.activity' });
  const html = makeElement({ i18nHtml: 'popup.settings' });
  const attr = makeElement({ i18nAttr: 'placeholder:popup.chat.placeholder;aria-label:popup.aiModel' });
  const root = {
    documentElement: { lang: 'en' },
    querySelector: () => null,
    querySelectorAll: selector =>
      selector === '[data-i18n]' ? [text] : selector === '[data-i18n-html]' ? [html] : selector === '[data-i18n-attr]' ? [attr] : []
  };
  setLocaleForTests('zh-CN');
  localizeDocument(root);
  assert.equal(root.documentElement.lang, 'zh-CN');
  assert.equal(text.textContent, '记录');
  assert.equal(html.innerHTML, '设置');
  assert.equal(attr.attrs.placeholder, '提出追问…');
  assert.equal(attr.attrs['aria-label'], 'AI 模型');
  setLocaleForTests('zh-TW');
  localizeDocument(root);
  assert.equal(root.documentElement.lang, 'zh-TW');
  assert.equal(text.textContent, '紀錄');
  assert.equal(attr.attrs.placeholder, '提出追問…');
});

test('_locales message files have the same keys, and the manifest points at them', () => {
  const read = locale => JSON.parse(readFileSync(join(ROOT, 'public', '_locales', locale, 'messages.json'), 'utf8'));
  const english = read('en');
  for (const locale of ['zh_CN', 'zh_TW']) {
    const chinese = read(locale);
    assert.deepEqual(Object.keys(chinese).sort(), Object.keys(english).sort(), locale);
    for (const key of Object.keys(english)) {
      assert.ok(english[key].message.trim() && chinese[key].message.trim(), `${locale} ${key}`);
    }
    assert.ok(chinese.extDescription.message.length <= 132, `${locale}: Chrome Web Store short description limit`);
  }
  assert.ok(english.extDescription.message.length <= 132);

  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.name, '__MSG_extName__');
  assert.equal(manifest.description, '__MSG_extDescription__');
  assert.equal(manifest.action.default_title, '__MSG_actionTitle__');
});
