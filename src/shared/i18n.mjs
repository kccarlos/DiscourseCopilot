// Interface language. The locale follows the browser UI language and is never
// chosen in-app: Chinese browsers get Simplified or Traditional Chinese,
// everything else English. Text sent to the AI model is not translated and stays out of here.
import en from './locales/en.mjs';
import zhCN from './locales/zh-CN.mjs';
import zhTW from './locales/zh-TW.mjs';

export const LOCALES = Object.freeze({ en, 'zh-CN': zhCN, 'zh-TW': zhTW });

let forcedLocale = null;
let cachedLocale = null;

function browserLanguage() {
  try {
    const fromChrome = globalThis.chrome?.i18n?.getUILanguage?.();
    if (fromChrome) return fromChrome;
  } catch {
    // Fall through to the navigator language.
  }
  return globalThis.navigator?.language || 'en';
}

// Traditional Chinese for Taiwan, Hong Kong, Macau and any zh-Hant tag;
// Simplified Chinese for every other Chinese variant (zh, zh-CN, zh-SG, ...).
export function resolveLocale(language) {
  const tag = String(language || '');
  if (!/^zh(?:[-_]|$)/i.test(tag)) return 'en';
  return /^zh[-_](?:TW|HK|MO|Hant)(?:[-_]|$)/i.test(tag) ? 'zh-TW' : 'zh-CN';
}

export function getLocale() {
  if (forcedLocale) return forcedLocale;
  cachedLocale ??= resolveLocale(browserLanguage());
  return cachedLocale;
}

// Test hook: pass 'en', 'zh-CN' or 'zh-TW' to force a locale, or null to detect again.
export function setLocaleForTests(locale) {
  forcedLocale = locale ? resolveLocale(locale) : null;
  cachedLocale = null;
}

// Locale argument for Intl APIs: undefined keeps the browser default for
// English, so English dates and numbers format exactly as before.
export function intlLocale() {
  const locale = getLocale();
  return locale === 'en' ? undefined : locale;
}

function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

function lookup(key) {
  const locale = getLocale();
  const message = LOCALES[locale]?.[key];
  if (typeof message === 'string') return message;
  return typeof en[key] === 'string' ? en[key] : null;
}

export function t(key, params) {
  const message = lookup(key);
  if (message === null) {
    console.warn(`[i18n] Missing message: ${key}`);
    return key;
  }
  return interpolate(message, params);
}

// Plural-aware lookup: `${key}.one` when English has exactly one, otherwise
// `${key}.other`. Chinese has no plural forms and only needs `${key}.other`.
export function tn(key, count, params) {
  const useOne = getLocale() === 'en' && count === 1;
  const message = (useOne && lookup(`${key}.one`)) || lookup(`${key}.other`);
  if (message === null) {
    console.warn(`[i18n] Missing message: ${key}.other`);
    return key;
  }
  return interpolate(message, { count, ...params });
}

function applyAttributes(element, spec) {
  for (const pair of spec.split(';')) {
    const [attr, key] = pair.split(':').map(part => part.trim());
    if (attr && key) element.setAttribute(attr, t(key));
  }
}

function localizeTree(root) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll('[data-i18n-html]')) {
    element.innerHTML = t(element.dataset.i18nHtml);
  }
  for (const element of root.querySelectorAll('[data-i18n-attr]')) {
    applyAttributes(element, element.dataset.i18nAttr);
  }
  // <template> content is a separate fragment: fill it too, so clones are
  // already translated.
  for (const template of root.querySelectorAll('template')) {
    if (template.content) localizeTree(template.content);
  }
}

// Fills `data-i18n` (text), `data-i18n-html` (trusted markup) and
// `data-i18n-attr="placeholder:key;aria-label:key"` inside `root`, including
// <template> content, and sets <html lang>.
export function localizeDocument(root = globalThis.document) {
  if (!root) return;
  const doc = root.ownerDocument || root;
  if (doc.documentElement) doc.documentElement.lang = getLocale();
  localizeTree(root);
  const title = doc.querySelector?.('title[data-i18n]');
  if (title) doc.title = t(title.dataset.i18n);
}
