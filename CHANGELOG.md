# Changelog

Notable changes to Forumind (formerly DiscourseCopilot). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each release is published on the [Releases page](https://github.com/kccarlos/DiscourseCopilot/releases) (with the installable zip) and submitted to the [Chrome Web Store](https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac) and [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/cjbpgigbkfdcgdmlpifklpoklpnbkhmp). Each store offers a version only after its review, which can take from a few hours to several days, so it may lag behind the newest release.

## [Unreleased]

### Changed
- Renamed to Forumind (formerly DiscourseCopilot). The extension ID, your settings and your saved history stay as they are.

### Added
- WordPress posts: summarize a post and its comments, and chat about them, on any WordPress site that leaves its public REST API open (for example doctorofcredit.com). The article is read as the opening post and every comment as a reply, 100 per page; reading it again asks the site only for what could have changed. The Agent works on WordPress too: it searches posts (by keyword, category and date), searches reader comments, lists the newest posts and reads a post with its comments, and its answers cite the posts it read.
- Reddit posts: summarize a post and all its comments, and chat about them, while you're signed in to Reddit (comments hidden behind "more replies" are read too). The Agent searches a subreddit's posts and comments, lists its newest posts and reads a post with its comments.
- After an update, the side panel shows a short "What's new" card at the top until you close it. Fresh installs don't see it.

### Fixed
- Copy full post is available as soon as the post has been read, instead of only after the summary finishes.

## [2.6.0] - 2026-10-26

### Added
- LM Studio settings take an optional API key, for LM Studio or another OpenAI-compatible server that requires one. It is sent as `Authorization: Bearer <key>` with the connection test, the model list and every request; left empty, nothing changes. ([#14](https://github.com/kccarlos/DiscourseCopilot/issues/14))

## [2.5.0] - 2026-10-21

### Added
- The interface is available in Traditional Chinese (Taiwan wording), chosen automatically for `zh-TW`, `zh-HK`, `zh-MO` and `zh-Hant` browsers; other Chinese browsers keep Simplified Chinese. The store listing is translated too, and so is the button on forum pages in `zh-TW` browsers (Chrome offers extensions no Hong Kong or Macau locale, so there it stays in English).
- A Traditional Chinese README (README.zh-TW.md), and README screenshots, store images and the demo in Simplified and Traditional Chinese, Chinese throughout, forum pages included.
- docs/guide.md and docs/faq.md (with Simplified and Traditional Chinese versions): the details that used to make the README long.

### Changed
- In Activity, click anywhere on a task or saved item to open it; the separate open button is gone. Keep, Delete, Stop, Retry and Continue stay as buttons.
- The READMEs are shorter: what it does, the forums it works with, the screenshots and three steps to start; everything else links to the guide and the FAQ.

### Fixed
- In Activity, a task's status or error line shows its full text on hover again, and a saved item's details line no longer runs under the Keep and Delete buttons.
- Saved items' previews in Activity no longer get stray spaces where bold text or a citation was in Chinese answers and summaries.

## [2.4.0] - 2026-10-21

### Changed
- A new look everywhere: the side panel, Settings, the welcome tab and the button on forum pages share one calm design (neutral grays, one indigo accent, the system font, flat surfaces), in light and dark.
- The side panel's header shows the forum you're on, with icon buttons for Activity (it counts running tasks) and Settings.
- Summary and Chat are tabs. Copy, Download and a More menu (Copy full post) sit beside them.
- One question box at the bottom of the side panel: **This post** asks about the topic and its summary, **Whole forum** asks the forum. The model switcher and the forum context limit moved into it.

## [2.3.2] - 2026-10-20

Same extension as 2.3.1, now also on [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/cjbpgigbkfdcgdmlpifklpoklpnbkhmp).

### Changed
- Releases are uploaded to Microsoft Edge Add-ons as well as the Chrome Web Store, and the README and release notes link to both stores. Nothing in the extension itself changed.

## [2.3.1] - 2026-10-20

### Changed
- First install opens a small welcome tab instead of the settings page. Its **Open DiscourseCopilot** button opens the side panel, where setup happens, and closes the tab (Chrome opens the side panel only after a click, so it can't pop up on its own). The settings page no longer has a welcome mode.

## [2.3.0] - 2026-10-19

### Added
- Settings opens inside the side panel (header Settings button, the model chip, Advanced settings) instead of a separate tab; Back returns to where you were, and leaving with unsaved edits asks first. The extension's Options page works as before.
- Activity's Saved tab has a search box (title or question), and empty Tasks and Saved lists say what to do next.
- Long summaries, earlier answers in an Ask the forum thread and older chat answers are cut off with a soft fade and a Show all / Show less button.
- After your fifth summary, the side panel shows a small "Enjoying DiscourseCopilot?" card once, with links to rate the extension or star it on GitHub. Close it and it never comes back.
- Settings ends with a quiet "Star on GitHub · Rate it" line.
- The interface is available in Simplified Chinese, chosen automatically from the browser language (summaries and answers still follow Settings → Response language).
- A Chinese README (README.zh-CN.md) and an animated demo at the top of the README.
- No API key? The setup card and Settings → AI provider link to Google AI Studio for a free Gemini key, and switch the form to Gemini so the key can be pasted straight in. The note says the free tier has usage limits and Google may use free-tier prompts to improve its products.

### Changed
- The side panel keeps your attention on what matters: starting a chat question, an Ask the forum question or a follow-up opens that card and folds the others to a one-line header (for example "11 replies · saved 2m ago"), and a finished answer opens itself unless you moved on to something else. You can still open or close any card.
- Activity is calmer and denser: a compact header, a type icon on every card, forum, status and time on one line, and icon buttons for open, stop, retry, keep and delete.
- Ask the forum answers read as a conversation: each question has its own block with its research steps (one line, opens on click), its answer and the sources that answer cites. Follow-up questions show as chat bubbles, and the follow-up box sends with Enter like the topic chat.
- Buttons have icons. The answer and summary actions are a compact toolbar (Copy, Keep, Activity, Ask another; Copy summary, Copy full post, Download), and on narrow panels only the icons show. Activity cards' Keep and Delete are icon buttons.
- GitHub release notes are built from this changelog (the version's section, plus install steps, links and a line asking for a rating or a star) instead of GitHub's auto-generated list.
- README and store listing: follow-up questions use the whole thread as context, so answers can point to the posts that said it.

## [2.2.1] - 2026-10-03

### Changed

- Security: replaced the vulnerable dev-only `web-ext-run` dependency tree (pulled in by `vite-plugin-web-extension`, used only for its browser-launch mode) with a local stub, clearing all 13 `pnpm audit` findings. Also bumped the AI SDK packages, Biome, Vite and sharp within their ranges.
- Docs: README highlights the privacy-first design, explains that Chrome Web Store updates wait for Google's review, and no longer overclaims; store screenshot 3 now reads "Made for Discourse forums".


### Fixed
- Local models (Ollama, LM Studio): summaries, chat and Ask the forum failed with "Forbidden" on a default Ollama install, because Ollama refuses requests that carry a browser extension's `Origin` header. The extension now removes that header from its own requests to `localhost`, `127.0.0.1` and a local server address you allowed (one `declarativeNetRequestWithHostAccess` rule, no new install warning). Requests from web pages are not changed. `OLLAMA_ORIGINS` is no longer needed; the setup and settings hints about it are gone, and the 403 message only suggests it as a fallback.

### Added
- `pnpm test:local-models`: a local-only end-to-end check of Ollama (and LM Studio when running) in real Chromium with the built extension.

## [2.2.0] - 2026-10-02

### Added
- Ask the forum is now an agent. It plans one step at a time (search the forum, list the latest topics, read a topic, check your saved summaries), you can watch and open each step, and it answers with [S#] sources that link to the topics it read. It does not need native tool calling from the provider (the model replies with one JSON action per turn), so it can work with any of the supported providers, though very small local models may struggle to keep to the format. The answer streams in.
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
- Release workflow uploads each tagged version to the Chrome Web Store (API v2, signed in through Workload Identity Federation, no stored keys) and submits it for review when enabled.

### Changed
- README installs from the Chrome Web Store; the GitHub Releases zip is the alternative.

## [2.1.0] - 2026-09-23

### Changed
- Forum access is requested per forum instead of for all websites (`<all_urls>` removed). At install the extension can reach only the AI providers' APIs and your own computer (local models); each Discourse forum is allowed the first time you use it (**Allow access to {forum}**), and the in-page button runs only on allowed forums. Forums used with 2.0 need one click on **Allow access**. New `activeTab` and `scripting` permissions let the side panel check a page for Discourse after you click the toolbar icon, and register the in-page script for allowed forums.
- The side panel shows one guidance card per page state: page not checked yet, not a Discourse forum, allow access (with Chrome's prompt steps), forum home, and a two-step checklist when provider setup is also pending.
- Background tasks check forum access and explain how to allow it; Ask the forum waits for access and continues once it is granted.
- Store listing description no longer lists AI provider names (the Chrome Web Store flagged the list as keyword spam).

### Added
- **Settings → Forum access** lists the allowed forums, with **Remove access** (saved summaries and answers are kept).

## [2.0.0] - 2026-09-23

First public release.

### Added
- Side panel for any Discourse forum: topic summaries (original post, how people responded, key takeaways), follow-up chat, and **Ask the forum**, which searches the forum, reads the best matches and answers with numbered, clickable sources.
- Bring your own AI: OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, xAI, DeepSeek, or a local Ollama or LM Studio server.
- Work runs in the background and can be picked up later; Activity lists saved summaries, chats and answers grouped by forum, with **Keep**.
- Settings for response language, custom instructions, research depth (Quick, Balanced, Thorough, Custom), pages read per topic (every page by default, or a 1–100 page limit), chat context, history retention and saved-topic count, and favorite models switchable from the side panel header.
- Login-required forums work with your existing login; Ask the forum pauses until you log in.
- Light and dark mode, new logo, and Chrome Web Store listing images.

[Unreleased]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.6.0...HEAD
[2.6.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.3.2...v2.4.0
[2.3.2]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.2.1...v2.3.0
[2.2.1]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.1.1...v2.2.0
[2.1.1]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/kccarlos/DiscourseCopilot/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/kccarlos/DiscourseCopilot/releases/tag/v2.0.0
