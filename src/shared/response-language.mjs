// Response language preference for summaries, follow-up answers, and Agent
// answers. "auto" follows the discussion (or the user's question) instead of
// forcing one language.

export const RESPONSE_LANGUAGE_AUTO = 'auto';
export const DEFAULT_RESPONSE_LANGUAGE = RESPONSE_LANGUAGE_AUTO;

export const RESPONSE_LANGUAGES = Object.freeze(
  [
    { value: RESPONSE_LANGUAGE_AUTO, label: 'Auto (match the discussion)', promptName: '' },
    { value: 'en', label: 'English', promptName: 'English' },
    { value: 'zh-Hans', label: '简体中文 (Simplified Chinese)', promptName: 'Simplified Chinese (简体中文)' },
    { value: 'zh-Hant', label: '繁體中文 (Traditional Chinese)', promptName: 'Traditional Chinese (繁體中文)' },
    { value: 'ja', label: '日本語 (Japanese)', promptName: 'Japanese (日本語)' },
    { value: 'ko', label: '한국어 (Korean)', promptName: 'Korean (한국어)' },
    { value: 'es', label: 'Español (Spanish)', promptName: 'Spanish (Español)' },
    { value: 'fr', label: 'Français (French)', promptName: 'French (Français)' },
    { value: 'de', label: 'Deutsch (German)', promptName: 'German (Deutsch)' },
    { value: 'it', label: 'Italiano (Italian)', promptName: 'Italian (Italiano)' },
    { value: 'pt', label: 'Português (Portuguese)', promptName: 'Portuguese (Português)' },
    { value: 'ru', label: 'Русский (Russian)', promptName: 'Russian (Русский)' },
    { value: 'vi', label: 'Tiếng Việt (Vietnamese)', promptName: 'Vietnamese (Tiếng Việt)' }
  ].map(language => Object.freeze(language))
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
