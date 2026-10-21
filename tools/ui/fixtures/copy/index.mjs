// The languages the README, store and demo images are made in, and their text.
import en from './en.mjs';
import zhCN from './zh-CN.mjs';
import zhTW from './zh-TW.mjs';

export const COPY = { en, 'zh-CN': zhCN, 'zh-TW': zhTW };
export const SHOT_LOCALES = Object.keys(COPY);

// `--locale=zh-CN` → its copy (English without the flag).
export function copyFor(locale = 'en') {
  const copy = COPY[locale];
  if (!copy) throw new Error(`Unknown --locale=${locale}; one of ${SHOT_LOCALES.join(', ')}`);
  return copy;
}

// English images live where they always have; the others in a folder named
// after the locale (docs/screenshots/zh-CN/, store-assets/zh-TW/, ...).
export const localeDir = (dir, locale) => (locale === 'en' ? dir : `${dir}/${locale}`);
