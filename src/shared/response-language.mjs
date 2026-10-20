// Response language preference for summaries, follow-up answers, and Agent
// answers. "auto" follows the discussion (or the user's question) instead of
// forcing one language.
import { t } from './i18n.mjs';

export const RESPONSE_LANGUAGE_AUTO = 'auto';
export const DEFAULT_RESPONSE_LANGUAGE = RESPONSE_LANGUAGE_AUTO;

export const RESPONSE_LANGUAGES = Object.freeze(
  [
    { value: RESPONSE_LANGUAGE_AUTO, promptName: '' },
    { value: 'en', promptName: 'English' },
    { value: 'zh-Hans', promptName: 'Simplified Chinese (简体中文)' },
    { value: 'zh-Hant', promptName: 'Traditional Chinese (繁體中文)' },
    { value: 'ja', promptName: 'Japanese (日本語)' },
    { value: 'ko', promptName: 'Korean (한국어)' },
    { value: 'es', promptName: 'Spanish (Español)' },
    { value: 'fr', promptName: 'French (Français)' },
    { value: 'de', promptName: 'German (Deutsch)' },
    { value: 'it', promptName: 'Italian (Italiano)' },
    { value: 'pt', promptName: 'Portuguese (Português)' },
    { value: 'ru', promptName: 'Russian (Русский)' },
    { value: 'vi', promptName: 'Vietnamese (Tiếng Việt)' }
  ].map(language =>
    // The label follows the interface language; the prompt name never does.
    Object.freeze({
      ...language,
      get label() {
        return t(`responseLanguage.${language.value}`);
      }
    })
  )
);

const LANGUAGES_BY_VALUE = new Map(RESPONSE_LANGUAGES.map(language => [language.value, language]));

export function normalizeResponseLanguage(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return LANGUAGES_BY_VALUE.has(normalized) ? normalized : DEFAULT_RESPONSE_LANGUAGE;
}

/**
 * Build a one-line language instruction for a system prompt.
 *
 * @param {string} language - A RESPONSE_LANGUAGES value; unknown values mean auto.
 * @param {'discussion'|'question'} basis - What "auto" should follow: the
 *   discussion being summarized, or the user's question (chat and Agent).
 */
export function buildLanguageInstruction(language, basis = 'discussion') {
  const normalized = normalizeResponseLanguage(language);
  if (normalized === RESPONSE_LANGUAGE_AUTO) {
    return basis === 'question'
      ? "Respond in the same language as the user's question unless the user asks for another language."
      : "Respond in the same language as the discussion (the original post's language).";
  }
  const { promptName } = LANGUAGES_BY_VALUE.get(normalized);
  return basis === 'question'
    ? `Respond in ${promptName} unless the user explicitly asks for another language.`
    : `Respond in ${promptName}.`;
}
