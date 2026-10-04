# Changelog

Notable changes to DiscourseCopilot. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each release is on the [Chrome Web Store](https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac) and on the [Releases page](https://github.com/kccarlos/DiscourseCopilot/releases).

## [Unreleased]

### Changed

- Security: replaced the vulnerable dev-only `web-ext-run` dependency tree (pulled in by `vite-plugin-web-extension`, used only for its browser-launch mode) with a local stub, clearing all 13 `pnpm audit` findings. Also bumped the AI SDK packages, Biome, Vite and sharp within their ranges.

## [2.2.1] - 2026-10-03

### Fixed
- Local models (Ollama, LM Studio): summaries, chat and Ask the forum failed with "Forbidden" on a default Ollama install, because Ollama refuses requests that carry a browser extension's `Origin` header. The extension now removes that header from its own requests to `localhost`, `127.0.0.1` and a local server address you allowed (one `declarativeNetRequestWithHostAccess` rule, no new install warning). Requests from web pages are not changed. `OLLAMA_ORIGINS` is no longer needed; the setup and settings hints about it are gone, and the 403 message only suggests it as a fallback.

### Added
- `pnpm test:local-models`: a local-only end-to-end check of Ollama (and LM Studio when running) in real Chromium with the built extension.

## [2.2.0] - 2026-10-02

### Added
- Ask the forum is now an agent. It plans one step at a time (search the forum, list the latest topics, read a topic, check your saved summaries), you can watch and open each step, and it answers with [S#] sources that link to the topics it read. It works with every AI provider (the model replies with one JSON action per turn, no native tool calling needed), and the answer streams in.
- Follow-up questions under an answer continue the same run on the same forum, with a fresh budget, and add a new answer.
- A run is saved after every step: it resumes from the last finished step after a browser or service-worker restart, and **Continue** after a login or forum-access pause picks up the step that was waiting.
- Model selection from the provider's live list: once a key (or local server address) is entered, the setup card and Settings list the models the provider offers today and pre-select a curated fast, low-cost model (or a sensible available one). A saved model is never changed; Settings warns when the provider no longer offers it.
- A setting to hide the in-page DiscourseCopilot button: **Settings → Forum access → Show the DiscourseCopilot button on forum pages** (on by default). It applies to open forum tabs when you save, without a reload; the toolbar icon always opens the side panel.
- Undo for deletes: deleting a saved summary or an Ask the forum answer takes effect at once and can be undone for 8 seconds (the **Undo** button, or Ctrl/⌘+Z).
- Developer tooling: Playwright UI flows in light and dark mode (`pnpm test:ui`, also in CI), README and store screenshot generators (`pnpm shots:readme`, `pnpm shots:store` with `--check` / `--write`), and Biome linting and formatting (`pnpm lint`, `pnpm format`, `pnpm check`, a CI job), with `.editorconfig` and `.git-blame-ignore-revs`.

### Changed
- Settings → Ask the forum now sets the agent's budget instead of searches and result pages: steps, topics read and characters per read (Quick 6/3/12k, Balanced 15/8/30k, Thorough 25/14/45k, Custom). Earlier custom limits are converted to an equivalent budget; runs already queued keep what they were queued with.
- Saved and Activity cards for Ask the forum show the question, the number of steps and sources. Answers from before this change still open, with their searches shown as steps.
- Summaries and follow-up chat are told when only part of a topic was read (page limit, or a topic of unknown length), so the answer says so.
- **Reset all settings** asks for confirmation inline on the page. The extension no longer uses browser dialogs.
- Curated default models refreshed for every provider. Anthropic now defaults to Claude Sonnet 5, with Haiku 4.5 as a fallback, because Haiku 4.5 retires after 2026-10-15.
- Diagnostic trace logging (`DiscourseCopilotLogger.log`) is off in production builds; it is on only for `pnpm dev`. Warnings and errors are unchanged.
- Retention and saved-topic defaults, and the Agent's default research budget, now come from one place (`src/shared/preferences.mjs`).
- The model list is fetched after the same typing pause (700 ms) in Settings and in the setup card.
- Store and README screenshots show a neutral avatar.
- Upgraded the AI SDK to v7 (every provider on its matching major), Vite to 8 and marked to 18.
- Code split into smaller modules; a test enforces which folders each layer may import from.

### Fixed
- A deleted Ask the forum answer could reappear as an empty panel.

## [2.1.1] - 2026-09-25

First release published through the automated Chrome Web Store pipeline. No changes to the extension since 2.1.0.

### Added
- Ask the forum is now an agent. It plans one step at a time (search the forum, list the latest topics, read a topic, check your saved summaries), you can watch and open each step, and it answers with [S#] sources that link to the topics it read. It works with every AI provider (the model replies with one JSON action per turn, no native tool calling needed), and the answer streams in.
- Follow-up questions under an answer continue the same run on the same forum, with a fresh budget, and add a new answer.
- A run is saved after every step: it resumes from the last finished step after a browser or service-worker restart, and **Continue** after a login or forum-access pause picks up the step that was waiting.
- Release workflow uploads each tagged version to the Chrome Web Store (API v2, signed in through Workload Identity Federation, no stored keys) and submits it for review when enabled.

### Changed
- Settings → Ask the forum now sets the agent's budget instead of searches and result pages: steps, topics read and characters per read (Quick 6/3/12k, Balanced 15/8/30k, Thorough 25/14/45k, Custom). Earlier custom limits are converted to an equivalent budget; runs already queued keep what they were queued with.
- Saved and Activity cards for Ask the forum show the question, the number of steps and sources. Answers from before this change still open, with their searches shown as steps.
- README installs from the Chrome Web Store; the GitHub Releases zip is the alternative.

## [2.1.0] - 2026-09-23

### Changed
- Settings → Ask the forum now sets the agent's budget instead of searches and result pages: steps, topics read and characters per read (Quick 6/3/12k, Balanced 15/8/30k, Thorough 25/14/45k, Custom). Earlier custom limits are converted to an equivalent budget; runs already queued keep what they were queued with.
- Saved and Activity cards for Ask the forum show the question, the number of steps and sources. Answers from before this change still open, with their searches shown as steps.
- Forum access is requested per forum instead of for all websites (`<all_urls>` removed). At install the extension can reach only the AI providers' APIs and your own computer (local models); each Discourse forum is allowed the first time you use it (**Allow access to {forum}**), and the in-page button runs only on allowed forums. Forums used with 2.0 need one click on **Allow access**. New `activeTab` and `scripting` permissions let the side panel check a page for Discourse after you click the toolbar icon, and register the in-page script for allowed forums.
- The side panel shows one guidance card per page state: page not checked yet, not a Discourse forum, allow access (with Chrome's prompt steps), forum home, and a two-step checklist when provider setup is also pending.
- Background tasks check forum access and explain how to allow it; Ask the forum waits for access and continues once it is granted.
- Store listing description no longer lists AI provider names (the Chrome Web Store flagged the list as keyword spam).

### Added
- Ask the forum is now an agent. It plans one step at a time (search the forum, list the latest topics, read a topic, check your saved summaries), you can watch and open each step, and it answers with [S#] sources that link to the topics it read. It works with every AI provider (the model replies with one JSON action per turn, no native tool calling needed), and the answer streams in.
- Follow-up questions under an answer continue the same run on the same forum, with a fresh budget, and add a new answer.
- A run is saved after every step: it resumes from the last finished step after a browser or service-worker restart, and **Continue** after a login or forum-access pause picks up the step that was waiting.
- **Settings → Forum access** lists the allowed forums, with **Remove access** (saved summaries and answers are kept).

## [2.0.0] - 2026-09-23

First public release.

### Added
- Ask the forum is now an agent. It plans one step at a time (search the forum, list the latest topics, read a topic, check your saved summaries), you can watch and open each step, and it answers with [S#] sources that link to the topics it read. It works with every AI provider (the model replies with one JSON action per turn, no native tool calling needed), and the answer streams in.
- Follow-up questions under an answer continue the same run on the same forum, with a fresh budget, and add a new answer.
- A run is saved after every step: it resumes from the last finished step after a browser or service-worker restart, and **Continue** after a login or forum-access pause picks up the step that was waiting.
- Side panel for any Discourse forum: topic summaries (original post, how people responded, key takeaways), follow-up chat, and **Ask the forum**, which searches the forum, reads the best matches and answers with numbered, clickable sources.
- Bring your own AI: OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, xAI, DeepSeek, or a local Ollama or LM Studio server.
- Work runs in the background and can be picked up later; Activity lists saved summaries, chats and answers grouped by forum, with **Keep**.
- Settings for response language, custom instructions, research depth (Quick, Balanced, Thorough, Custom), pages read per topic (every page by default, or a 1–100 page limit), chat context, history retention and saved-topic count, and favorite models switchable from the side panel header.
- Login-required forums work with your existing login; Ask the forum pauses until you log in.
- Light and dark mode, new logo, and Chrome Web Store listing images.

[Unreleased]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.2.1...HEAD
[2.2.1]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/kccarlos/DiscourseCopilot/releases/tag/v2.0.0
