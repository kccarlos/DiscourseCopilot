# Developing DiscourseCopilot

For what the extension does and how to install a release, see [README.md](README.md). What changed in each version is in [CHANGELOG.md](CHANGELOG.md).

## Prerequisites

- **Node.js 22** (matches CI; see `.github/workflows/ci.yml`).
- **pnpm**, version pinned in `package.json`'s `packageManager` field. The easiest way to get the right version:

  ```bash
  corepack enable
  corepack prepare --activate
  ```

## Setup

```bash
pnpm install
```

## Common commands

```bash
pnpm build   # build the extension into dist/
pnpm dev     # rebuild on change (vite build --watch --mode development; also turns on DiscourseCopilotLogger.log traces)
pnpm test          # run unit tests (node --test)
pnpm test:ui       # build, then run the UI flows in Chromium (light and dark)
pnpm shots:readme  # build, then render the README screenshots into tools/ui/out/readme/
pnpm shots:store   # build, then render the Chrome Web Store images into tools/ui/out/store/
pnpm clean         # remove dist/
pnpm lint          # lint (Biome); pnpm lint:fix applies the safe fixes
pnpm format        # format every file in place; pnpm format:check only reports
pnpm check         # lint + format check in one pass (what CI runs)
```

The UI commands need Playwright's Chromium once: `pnpm exec playwright install chromium` (see [UI tests and screenshots](#ui-tests-and-screenshots)).

### Linting and formatting

[Biome](https://biomejs.dev) lints and formats the JavaScript and JSON (CSS is linted only; HTML and the vendored stylesheets are left alone). The configuration is `biome.jsonc`, with three small GritQL rules in `tools/lint/`; `.editorconfig` gives editors the same basics (2 spaces, LF, 140 columns), and the Biome editor extension can format on save with the same configuration. Beyond the recommended rules it enforces `===` (except `== null`), `const`/no `var`, no unused variables or imports (prefix an intentionally unused parameter with `_`), no undeclared globals (`chrome` is declared, read-only), imports that resolve with their file extension, and in `src/`: no `console.log` (use `console.warn`/`console.error`, or `DiscourseCopilotLogger.log` for traces, which print only in development builds: `vite.config.js` sets `import.meta.env.DEV` to true only for `--mode development`, i.e. `pnpm dev`), no `alert`/`confirm`/`prompt`, no `eval`, `new Function` or string timers (the Chrome Web Store forbids dynamic code), no Node globals, and in `src/background/` no `window`/`document`/`localStorage`. An inline `// biome-ignore <rule>: <reason>` needs a reason. CI fails on any lint error or unformatted file.

Formatting-only commits are listed in `.git-blame-ignore-revs`; to have `git blame` skip them locally, run once: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

## Running it locally

1. `pnpm build` (or `pnpm dev` to rebuild on every change).
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. After each rebuild, click the reload icon on the extension's card in `chrome://extensions` (and refresh any open forum tabs) to pick up the change.
5. Open a Discourse forum, click the toolbar icon, and click **Allow access to …** in the side panel (then **Allow** in Chrome's prompt). Allowed forums survive reloads; remove them under **Settings → Forum access** (or the extension's **Site access** in `chrome://extensions`) to test the first-run flow again.

## Project structure

Plain JavaScript ES modules, bundled by Vite (`vite-plugin-web-extension` reads `manifest.json`). Logic that needs no DOM or `chrome.*` API at import time lives in modules unit-tested under `test/` (state derivations, the config model, the settings form machine, the task service, executors' helpers); the DOM-bound view classes are kept thin on top of them.

```
manifest.json       Chrome MV3 manifest (build input)
vite.config.js      Build configuration (also builds src/content/content.js, which the manifest no
                    longer references, via additionalInputs)
biome.jsonc         Lint and format configuration (tools/lint/*.grit: extra lint rules)
public/             Static assets copied into dist/ as-is: toolbar/store icons (icon16/32/48/128.png,
                    rendered from assets/brand/icon/sizes/*-on-light.svg) and brand/ SVGs used by the pages
assets/brand/       Logo source of truth (icon, pixel-hinted small sizes, wordmarks; on-light/on-dark
                    variants). Not shipped; the README wordmark is served from here
test/               Unit tests (node --test)
tools/ui/           Playwright UI flows and the README / store screenshot pipelines (not shipped)
src/
  background/       Service worker
    background.js         Entry: builds the services below and registers every Chrome listener once
    message-router.mjs    onMessage routing (action → handler table, async responses)
    task-service.mjs      Job queue + request validation (incl. forum access), IndexedDB persistence,
                          broadcasts, wake-up alarm, per-task provider configuration
    topic-executors.mjs   Summary and follow-up chat tasks
    agent-executor.mjs    Agent (forum research) tasks
    agent-activity-store.mjs  Agent activity records: ordered saves + broadcasts
    topic-fetcher.mjs     Reads a topic's raw posts page by page (cache reuse, rate-limit retries)
    job-queue.mjs, agent-runner.mjs, forum-tools.mjs  Queue engine, Agent loop, forum search tools
  content/          Content script on enabled forums (registered at runtime): detects Discourse,
                    topic IDs, in-page launcher (hidden when the
                    `showForumButton` preference is off; follows storage changes live)
  popup/            Side panel (popup.html/css)
    popup.js              Entry: composes the modules below; page changes, broadcast routing,
                          panel-wide render (updateUI)
    background-link.mjs   Reaching the background worker: task list, restart banner
    page-context.mjs      Active tab → page context (forum, topic, access, hidden page)
    page-probe.mjs        One-off Discourse check of a page not enabled yet (activeTab)
    page-guidance.mjs     One guidance state per page (loading, unchecked, not-forum, allow,
                          maybe, forum-home, topic), its copy and the "Get started" checklist
    forum-access-card.mjs Renders that guidance card + checklist; the Allow access request
    topic-controller.mjs  The topic session: switch with the page, restore, reload, render
    summary-view.mjs      Summary card, reading progress, topic task status line
    chat-view.mjs         Follow-up chat, message editing, forum context limit
    agent-controller.mjs  Agent research: composes the agent-* modules; broadcasts, detail view,
                          answer actions (stop, copy, keep, dismiss, delete with Undo)
    agent-runs.mjs        The runs the panel knows about (activities + queue tasks), which run
                          shows where (selectAgentRunView), opened/dismissed/deleted marks
    agent-panel.mjs       Inline answer panel and pill on the topic view
    agent-composer.mjs    "Ask the forum" composer (queues the Agent task)
    agent-requests.mjs    Continue / Retry, with the forum access request
    agent-answer-view.mjs Renders one Agent run (shared by the inline panel and the detail view)
    activity-view.mjs     Activity screen: Tasks/Saved tabs, Agent detail, deleting saved items
    forum-groups.mjs      Activity lists grouped by forum, forum filter chips
    activity-cards.mjs    Task and saved-item cards
    undo-toast.mjs, undo-slot.mjs  Undo after a delete: the toast (#undoToast) and the pure
                          one-pending-action model with its 8 s window
    provider-header.mjs   Model switcher (active provider · model, favorites), setup state
    setup-card.mjs        First-run setup (uses the shared ConfigStore)
    forum-ui.mjs          Forum directory (names), forum bar, forum accents
    forum-names.mjs       Forum identity as data: names, hostnames, hue, grouping by forum
    task-registry.mjs     The panel's copy of the task queue and requests to it
    session-store.mjs     Topic sessions cached in memory and saved to IndexedDB
    operations.mjs        The one request being submitted (page/config snapshot)
    topic-controls.mjs    Enabled state and labels of every control, derived from panel state
    markdown.mjs, status-line.mjs, forum-tabs.mjs, clipboard.mjs  Rendering and small helpers
    ui-state.mjs, conversation-state.mjs, runtime-state.mjs  Pure view logic shared by views
  settings/         Options page
    settings.js           Wires the sections to the ConfigStore and the form state machine;
                          status line, save bar, busy state, Save/Test, Reset (with confirmation)
    settings-form-state.mjs  Form state machine (status line, dirty indicator, busy state,
                          reset confirmation)
    provider-section.mjs  Provider picker, key/URL/model fields, live model lists
    preferences-section.mjs  Research, reading and history preferences, Restore defaults
    favorites-section.mjs Favorite models
    forum-access-section.mjs  "Forum access": enabled forums, Remove access
    settings-helpers.mjs  Model choices for the model field, latest-request check, re-exported
                          provider-setup validation
  services/         AI provider calls
    ai-service.js         Summary, follow-up chat and Agent answer entry points (AIService)
    summary-strategies.mjs  Single pass → hierarchical fallback (OP + replies, map-reduce),
                          retries with halved content / minimal prompts, final assembly
    text-stream.mjs       Streamed chat/Agent answers; system messages → instructions
    ai-errors.mjs         Cancellation, token-limit classification, token estimates
    provider-config.js    Provider → AI SDK client (defaults come from constants.js)
    prompts.js, chat-context.mjs, agent-context.mjs  Prompts and chat/Agent context
  shared/           Used across the above (never imports a page, see Layering)
    config-state.mjs      The ConfigStore (see below); re-exports config-model.mjs
    config-model.mjs      The configuration as data: storage keys, readConfig(), status, writes
    topic-session.mjs     Topic session records, refresh/page planning
    topic-session-db.mjs  Saved history in IndexedDB (sessions, tasks, Agent activities),
                          retention cleanup, take()/restore() for Undo
    history-schema.mjs    The IndexedDB schema, upgrades and request helpers
    topic-route.mjs       Topic ID from a forum URL (content script and side panel)
    preferences.mjs       Research depth, topic page limit and history retention: defaults, ranges,
                          normalization/validation and the resolve*() helpers
    provider-setup.mjs    Provider validation, connection test, failure messages
    model-catalog.mjs     Providers' live model lists (fetch, filter, cache) and the default
                          pick from them; curated cheap/fast models live in constants.js
    forum-access.mjs      Per-forum host permissions, the access error, content script sync
    constants.js          Storage keys, message names, provider list, curated models (RECOMMENDED_MODELS)
    task-record.mjs       Task records: statuses, types, normalization
    agent-activity.mjs    Agent activity records (progress, sources, answer) and their retention
    forum-site.mjs        Forum identity: site URL (origin + subfolder), topic keys
    forum-response.mjs    Classifying forum responses (login required, rate limits);
                          MAX_UNKNOWN_TOPIC_PAGES
    fetch-progress.mjs    Topic pagination and reading progress/ETA
    rate-limit-retry.mjs  fetch with Retry-After/backoff retries, abortable delays
    response-language.mjs Response language choices and the prompt's language instruction
    chat-context-limit.mjs, favorite-models.mjs  Chat context limit range; favorite model list
    bounded-map.mjs, logger.js  Worker-pool map; console prefix and the trace sink
    normalize.css, pico.min.css  Vendored stylesheets (not linted or formatted)
```

### Layering

`src/` has one folder per layer, and each may import only from the layers listed:

| Layer | May import from |
| --- | --- |
| `shared/` | `shared/` |
| `services/` | `services/`, `shared/` |
| `content/` | `content/`, `shared/` |
| `background/` | `background/`, `services/`, `shared/` |
| `popup/` | `popup/`, `services/`, `shared/` |
| `settings/` | `settings/`, `services/`, `shared/` |

So the service worker, the content script and the shared modules never depend on a page, and the two pages don't depend on each other: code both sides need (the session records and the IndexedDB history, for example) lives in `shared/`. `test/layering.test.mjs` enforces the table (static, re-exported, side-effect and dynamic imports, and the `@/` alias) as part of `pnpm test`, and fails if a new top-level folder appears without a rule.

### Forum access (permission model)

The manifest asks only for the AI providers' API hosts and `localhost`/`127.0.0.1` (Ollama, LM Studio) as `host_permissions`. Forums are `optional_host_permissions` (`https://*/*`, plus `http://*/*` for a local-model server on another computer), granted one origin at a time (`https://forum.example.com/*`; subfolder installs and ports share it). There is no static content script and no `tabs` permission. `src/shared/forum-access.mjs` owns all of it.

```
  side panel: page without access                       background (service worker)
  ─────────────────────────────                         ───────────────────────────
  tab.url hidden ──▶ "Page not checked yet"
        │ user clicks toolbar icon: action.onClicked → sidePanel.open, activeTab
        │ granted, tab ID recorded in storage.session, ACTION_CLICKED broadcast
        ▼
  probeDiscoursePage() via scripting.executeScript ──▶ Discourse? ──no──▶ "Not a Discourse forum"
        │ yes (or a /t/slug/id URL that couldn't be probed → "Is this a Discourse forum?")
        ▼
  Allow card  ──click──▶ permissions.request({origins:[origin/*]})   (first statement of the click)
        │ granted                                    permissions.onAdded ─┐
        ├──▶ SYNC_FORUM_ACCESS ─────────────────────────────────────────┤
        │                                          syncForumContentScripts(): register/update/
        │                                          unregister "forum-content" (matches = enabled
        │                                          forums, persistAcrossSessions) + executeScript
        │                                          into the forum's open tabs
        ▼
  page re-checked ──▶ content script answers ──▶ normal view
```

- **Page guidance.** `derivePageGuidance()` (`page-guidance.mjs`, pure and unit-tested) maps the page context to one state and one card: *Check this page* (hidden page: click the toolbar icon), *This page isn't a Discourse forum* (two example forums), *Allow DiscourseCopilot on {forum}* (3-step guide + **Allow access to {host}**), *Is this a Discourse forum?* (a `/t/…/id` URL that couldn't be probed), *You're on {forum}* (hero with **Ask the forum** only) and the normal topic view. `#topicView[data-guidance]` lets the stylesheet hide the hero and the welcome panel outside a topic. Provider setup stays first: with both setup and access pending, a "Get started" checklist shows and the access card waits as step 2. The card heading is announced (polite) when the state changes.
- **Gating.** `TaskService.enqueue()` refuses a forum without access (`FORUM_ACCESS_NOT_GRANTED`, "Allow DiscourseCopilot on {host} in the side panel, then try again"; `respondAsync` passes the `code` through). Executors check again before fetching, and a failed fetch on a forum whose access is now gone becomes the same error. Summary/chat tasks fail with it; Agent tasks wait (`WAITING_USER_ACTION`, "Waiting for forum access") and the panel's **Allow access to {host} & continue** requests access, then resumes. Continue and Retry always request access first (no prompt when already granted).
- **Registration** is re-synced whenever the worker starts (and on `runtime.onStartup`, `onInstalled` and `permissions.onAdded/onRemoved`), serialized because `registerContentScripts` rejects a duplicate ID. On update, any `https://*/*`/`http://*/*` grant carried over from 2.0's `<all_urls>` is removed (nothing in 2.1 requests wildcards), so every forum is enabled explicitly.
- **"Checked" tabs.** A toolbar click records the tab ID in `storage.session` (`actionClickedTabs`) so a page that stays hidden afterwards (new tab page, `chrome://`) reads as "Not a Discourse forum" rather than "Page not checked yet". The panel drops the record when the tab starts loading another page (activeTab ends on a cross-site navigation); with the panel closed during that navigation the record can go stale until the next click. `content.js` ignores a second injection into a page that already has a live instance, and replaces an instance orphaned by an extension reload.
- **What the panel can see.** Without `tabs`, `tab.url`/`title` exist only for enabled forums, provider hosts, and tabs where the icon was clicked (activeTab, until the tab navigates to another site). A content script already running keeps answering after access is removed; the panel checks `permissions.contains` and shows the Allow access card again. Opening a forum link from the panel still works (`tabs.create/update` need no permission), but an existing tab on a forum that isn't enabled can't be found and reused.
- **Custom local-model servers.** Test/Save in the setup card and Settings request the server's origin in the click when it isn't `localhost`/`127.0.0.1`; Settings leaves such origins out of the forum list.

### Model catalog (live model lists)

`src/shared/model-catalog.mjs` reads the provider's current model list for the side panel's setup card and the settings page's model field. It runs once a key (or a local server URL) is entered, after a short pause in typing, and again on **Refresh models** in Settings.

- **Request.** One `GET` per provider to its own models endpoint (`/models`, Ollama's `/api/tags`, LM Studio's `/v1/models`), 8 s timeout. The key goes only to that provider (OpenRouter's list is public and works without one; Gemini's key goes in a header, not the URL).
- **Cache.** 10 minutes in `chrome.storage.session` (shared by the side panel and Settings, memory where that is missing), keyed by provider and a hash of the credentials; the key itself never appears in a cache key, error or log.
- **Filtering.** Embedding, speech, image, video, moderation and realtime models are dropped; the rest are sorted newest first.
- **Default pick.** `pickDefaultModel()` takes the first `RECOMMENDED_MODELS` entry (`constants.js`, each provider's cheap/fast tier) that the provider still offers, else a small/fast-looking model (`mini`, `flash`, `haiku`, …, never previews), else the first listed. Without a list (offline, bad key) the curated default stays and **Test & save** reports the problem.
- **Saved models are never changed.** The pick replaces only the curated default the user hasn't touched (never a model they chose or saved). When a saved model is missing from the list, `isModelOffered()`/`findOfferedModel()` and `modelMissingText()` give the settings page its "no longer offered" warning.

To refresh the curated picks, edit `RECOMMENDED_MODELS` in `constants.js` (the first entry is the provider's default) and run `pnpm test` (`test/model-catalog.test.mjs`).

### Configuration state

`src/shared/config-state.mjs` is the only code that reads or writes the configuration in `chrome.storage.local` (provider, per-provider key/URL/model, favorites, system prompt, response language, forum context limit, and the `preferences` section described below). `readConfig()` normalizes the stored values, `deriveConfigStatus()` derives the status, and a `ConfigStore` holds the snapshot, a draft being edited, and the transitions. The settings page, the side panel (header, model switcher, setup card) and the background worker (`loadConfig()`, used when a task's in-memory settings are gone after a restart) all use it.

Status is derived from storage and never stored:

```
                    save() of a valid draft
  ┌──────────────┐ ─────────────────────────────▶ ┌───────┐
  │ unconfigured │                                 │ ready │
  └──────────────┘ ◀──────────── reset() ───────── └───────┘
         ▲                                          │    ▲
         │ reset()           a required value was   │    │ save() of a
         │                   removed elsewhere      ▼    │ valid draft
         │                                ┌────────────────────────────┐
         └─────────────────────────────── │ incomplete (+ fieldErrors) │
                                          └────────────────────────────┘
```

- **unconfigured**: nothing usable and no provider was ever chosen (fresh install). A legacy OpenRouter key alone still counts as ready.
- **incomplete**: a provider was chosen but its settings don't validate; `fieldErrors` names the field (`apiKey`, `url`, `model`).
- **ready**: the selected provider's settings validate.

Operations on a store (`store.operation.phase`):

```
                test()
  idle ──┬──▶ testing ──▶ passed | failed
         ├──▶ saving  ──▶ saved  | error        save()
         ├──▶ invalid (+ validation)            test()/save() of an invalid draft
         └──▶ resetting ──▶ idle | error        reset()
```

Draft edits (`selectProvider`, `updateField`, `updateDraft`, `updatePreferences`, `resetPreferencesDraft`) are synchronous and never touch storage; only `save()` does, after validating the provider settings *and* the preferences (`validateSave()`; `test()` checks the provider only). `setActiveModel`, `setFavorites`, `setForumContextLimit` and `setPreferences` write directly. `subscribe()` reports persisted changes, including those made in other extension pages (via `chrome.storage.onChanged`), and operation phases.

### Preferences

`config.preferences` (storage key `preferences`, logic in `src/shared/preferences.mjs`):

| Option | Default | Range / choices | Consumed by |
| --- | --- | --- | --- |
| `researchDepth` + `customResearch` | Balanced (3 searches, 1 result page, 6 discussions) | Quick / Balanced / Thorough / Custom (queries 1–4, result pages 1–3, discussions 1–12) | `agent-runner.mjs` via the task's snapshot |
| `topicPageMode` + `topicPageLimit` | Every page (`'all'`); the limit, when chosen, starts at 20 pages (2,000 posts) | `'all'` / `'limit'` (limit 1–100, only validated in `'limit'` mode) | `topic-fetcher.mjs` via the task's snapshot (`resolveTopicPageLimit()` → pages, or `null` for every page); summary coverage in the side panel |
| `historyRetention` | 1 day | 1d / 3d / 7d / 30d / forever | `TopicSessionDatabase.setRetention()` in the background (cleanup) and side panel (lazy expiry, Saved list, labels) |
| `maxSavedTopics` | 40 | 10–200 | saved-topic pruning |
| `showForumButton` | `true` | boolean (anything else reads as `true`) | `content.js`: reads it at start and on `chrome.storage.onChanged`, adding or removing the launcher without a reload; page-change detection runs either way. Settings: checkbox under Forum access |

`preferences.mjs` is the single source for the user-tunable defaults (`DEFAULT_RETENTION_MS`, `DEFAULT_MAX_SAVED_TOPICS`, `DEFAULT_RESEARCH_LIMITS`); `task-record.mjs`, `topic-session.mjs` and `agent-runner.mjs` import them.

Hard caps stay in code (including `MAX_TASK_RECORDS`, 100 stored task records): `FORUM_TOOL_LIMITS` (search pages ≤ 3, raw pages ≤ 20), `MAX_UNKNOWN_TOPIC_PAGES`, the forum request pacing, `MAX_AGENT_SEARCH_QUERIES`/`MAX_AGENT_TOOL_CALLS` (sized for the largest budget) and a 7-day ceiling on finished task records.

```
  storage ──readConfig()──▶ normalizePreferences()     missing keys → defaults,
     ▲                          │                       out of range → clamped
     │                          ▼
     │                   config.preferences ──▶ resolveResearchLimits()
     │                          │                  resolveTopicPageLimit()
     │                          │                  resolveRetention()
     │                          ▼
     │     updatePreferences() / resetPreferencesDraft([keys])
     │                          │
     │                          ▼
     │                   draft.preferences ──validatePreferences()──▶ invalid
     │                          │               (per-field errors, nothing
     └──────── save() ──────────┘                clamped, nothing written)
```

Consumers never read the raw fields; effective values always come from the `resolve*()` helpers.

- **Snapshot rule.** When the background queues a task, `TaskService.enqueue()` reads the saved preferences and stores `snapshotTaskLimits(type, preferences)` on the task record (`task.limits`: `research` for Agent tasks, `topicPageLimit` for summary/chat, where `null` means every page). Records without `limits` (or without `topicPageLimit`) predate the snapshot and fall back to the current preferences. Executors only use `task.limits` (through `getTaskConfiguration()`), and the record is persisted, so queued and running tasks — including ones resumed after a worker restart — keep the values they started with. Tasks queued after a change use the new values.
- **Retention.** The background holds a `ConfigStore` subscription; on every change it calls `TaskService.applyRetention(resolveRetention(prefs))`, which updates the database and re-runs chat/task/Agent cleanup and pruning (also done at startup, *after* reading the preferences). Agent answers expire `retention` after `retainedFrom` (completion, or the moment they were unkept), recomputed with the current setting, so shortening the period applies immediately. The side panel applies the same retention to its own database instance and re-renders the Saved list, the "expires in …" labels and the Keep button titles when the preferences change in any page.
- **Page limit and truncation.** Stored preferences from before `topicPageMode` existed read as `'all'` (a stored `topicPageLimit` was written on every save, so it says nothing about intent; it is kept as the value offered in limit mode). With every page, a topic of known size is read in full; a topic whose size is unknown (no pagination metadata) still stops at `MAX_UNKNOWN_TOPIC_PAGES` and reports it. A topic longer than the page limit is read from its first pages; the fetch result carries `truncated`/`coveredPosts`, the task status says "(page limit; the topic has N)", and the session stores `summaryTruncated`/`summaryCoveredPosts`, shown as "first X of Y replies" plus a note on the summary. Replies added past the limit don't trigger a re-read or a new summary.

### Settings form

The settings page layers its form lifecycle on top of this in `settings-form-state.mjs`: `loading → pristine ⇄ dirty → testing | saving → saved`, plus `invalid`, `error` and `resetting`. Inline field errors (`fieldErrors`) are part of that state: a number field shows its error when left, clears it as soon as it is fixed, and Save with errors goes to `invalid` without writing anything. "Restore defaults" on a section is a draft edit (`defaults-restored` → dirty) saved with Save.

```
                    edit with an error ─┐
  pristine ──edit──▶ dirty ◀──fix──── dirty + fieldErrors ──Save──▶ invalid
                       │                                       (nothing written)
                       └──Save──▶ saving ──▶ saved | dirty | error
```

The status line, the save bar's state label ("Unsaved changes", "Saving…", "Saved", "Fix the highlighted fields", …), the header's "Unsaved changes" indicator and the disabled buttons are all derived from that state.

**Reset all settings** asks first, inline: `reset-requested` sets `confirmingReset` (no phase change) and opens a panel under the button ("This removes every provider, API key, model, favorite, prompt and preference on this page. Saved summaries and answers are not deleted." with **Reset everything** and **Cancel**; Escape cancels). `reset-started` is ignored unless that panel is open, and an edit, Test, Save or Restore defaults closes it. Focus moves to **Reset everything** when the panel opens and back to **Reset all settings** when it closes.

### Deleting in the side panel (Undo)

Deleting a saved summary or an Agent answer removes it at once, from IndexedDB too (`TopicSessionDatabase.take()` / `takeAgentActivity()` return the stored record), and shows an **Undo** toast for 8 seconds. Undo (the button, or Ctrl/⌘+Z outside a text field) writes that record back unchanged (`restore()` / `restoreAgentActivity()`). Because the database is always the truth, re-renders and background broadcasts during the window can't bring an item back, and closing the panel keeps the delete. A new delete ends the previous offer. The window pauses while the pointer or focus is on the toast; the message is announced through the panel's `announce()` helper. Focus moves to the next saved card (or the list's tab), to **Ask the forum** after a delete from the topic view, and to the restored card after Undo. A finished Agent task whose activity is gone (deleted, expired, pruned) never becomes a run again, though the task stays in the task list for days; runs deleted in this panel also ignore late broadcasts (`AgentRuns.deletedRunIds`). `undo-slot.mjs` is the pure model (injected timers, unit-tested); `undo-toast.mjs` renders it.

## CI/CD & releases

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request (a newer push cancels the running one), all on Node 22 with `pnpm install --frozen-lockfile`:

| Job | What it runs |
| --- | --- |
| **build** | Checks that `manifest.json` and `package.json` have the same version, `pnpm test`, `pnpm build`, checks `dist/manifest.json` exists, uploads `dist/` as the `dist-<sha>` artifact (kept 7 days) |
| **UI flows** | Installs Playwright's Chromium (headless shell, cached per Playwright version) and runs `pnpm test:ui`; on failure uploads the flow screenshots as `ui-flows-<sha>` (see [UI tests and screenshots](#ui-tests-and-screenshots)) |
| **Lint and format** | `biome ci` (the same checks as `pnpm check`, annotated on the pull request) |

Before pushing, `pnpm test && pnpm check && pnpm build` covers everything except the UI flows (`pnpm test:ui`).

### Cutting a release

1. Make sure `main` is green and holds everything that should ship.
2. Bump `version` in **both** `manifest.json` and `package.json` (for example `2.2.0`). The Chrome Web Store only accepts a version higher than the last one uploaded, so never reuse or lower a version.
3. In [CHANGELOG.md](CHANGELOG.md), rename **Unreleased** to the new version with today's date, start a new empty **Unreleased** section, and update the compare links at the bottom.
4. Commit to `main` (for example "Release 2.2.0") and push.
5. Tag and push the tag: `git tag v2.2.0 && git push origin v2.2.0`. Only repository admins can create `v*` tags (see [Repository protections](#repository-protections)).

`.github/workflows/release.yml` then runs on the tag:

1. **release** job: installs, fails unless the tag equals the manifest version (and both version files agree), runs `pnpm test` and `pnpm build`, zips the contents of `dist/` as `discourse-copilot-<version>.zip`, and creates a GitHub Release for the tag with the zip and auto-generated notes.
2. **chrome-web-store** job: signs in to Google Cloud through Workload Identity Federation (below), uploads the zip with the [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/api) and waits until the store has processed it. Then:
   - `CWS_AUTO_PUBLISH` = `true`: submits the item for review (`publishType: DEFAULT_PUBLISH`, so it goes live automatically once approved).
   - anything else (the current setting is `false`): leaves the upload as a draft. Open the [developer dashboard](https://chrome.google.com/webstore/devconsole), check the draft (listing text, see [store-assets/LISTING.md](store-assets/LISTING.md)) and click **Submit for review**.

Google reviews every update before it reaches users; the dashboard shows the review status. To switch automatic submission on or off: `gh variable set CWS_AUTO_PUBLISH --body true` (or `false`).

The workflow can also be started by hand (**Actions → Release → Run workflow**, with an existing tag). That only rebuilds and creates the GitHub Release; the store job runs for tag pushes only, because the identity provider trusts nothing else.

### Chrome Web Store publishing setup

No keys or refresh tokens are stored in GitHub. The store job gets a 15-minute Google access token by exchanging the job's GitHub OIDC token ([google-github-actions/auth](https://github.com/google-github-actions/auth)):

- **Google Cloud project** `discoursecopilot-publish` with the Chrome Web Store API (`chromewebstore.googleapis.com`), IAM, IAM Credentials and Security Token Service APIs enabled.
- **Workload identity pool** `github` with an OIDC **provider** `discoursecopilot` (issuer `https://token.actions.githubusercontent.com`), mapping `google.subject`, `attribute.repository` and `attribute.ref`, with the condition `assertion.repository == 'kccarlos/DiscourseCopilot' && assertion.ref.startsWith('refs/tags/v')`.
- **Service account** `cws-publisher@discoursecopilot-publish.iam.gserviceaccount.com`, with no project roles. The only binding is `roles/iam.workloadIdentityUser` on the service account for the pool's principals from this repository.
- **Chrome Web Store Developer Dashboard → Account → Service account**: that service account's email is linked to the publisher, which lets it upload and publish this publisher's items.
- **GitHub repository variables**: `GCP_WORKLOAD_IDENTITY_PROVIDER` (the provider's full resource name, `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/discoursecopilot`), `GCP_SERVICE_ACCOUNT` (the email above), `CWS_ITEM_ID` (the extension ID, `dpngnaiiofobfjleabbhnfmdflddnhac`), `CWS_AUTO_PUBLISH` (`true`/`false`). **Secret**: `CWS_PUBLISHER_ID` (the publisher ID from the dashboard's Account page). If any of the first four values is missing the job logs a notice and skips the upload.

To recreate it (for a fork, or after deleting the project), with `PROJECT_ID`, `PROJECT_NUMBER` and `OWNER/REPO` filled in:

```bash
gcloud services enable chromewebstore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project=PROJECT_ID

gcloud iam workload-identity-pools create github \
  --project=PROJECT_ID --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc discoursecopilot \
  --project=PROJECT_ID --location=global --workload-identity-pool=github \
  --display-name="OWNER/REPO" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == 'OWNER/REPO' && assertion.ref.startsWith('refs/tags/v')"

gcloud iam service-accounts create cws-publisher --project=PROJECT_ID --display-name="Chrome Web Store publisher"

gcloud iam service-accounts add-iam-policy-binding \
  cws-publisher@PROJECT_ID.iam.gserviceaccount.com --project=PROJECT_ID \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/OWNER/REPO"

gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --body "projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/discoursecopilot"
gh variable set GCP_SERVICE_ACCOUNT --body "cws-publisher@PROJECT_ID.iam.gserviceaccount.com"
gh variable set CWS_ITEM_ID --body "<extension ID>"
gh variable set CWS_AUTO_PUBLISH --body false
gh secret set CWS_PUBLISHER_ID   # paste the publisher ID when asked
```

Then add the service account's email under **Account → Service account** in the Chrome Web Store Developer Dashboard. The current settings can be read back with `gcloud iam workload-identity-pools providers describe discoursecopilot --location=global --workload-identity-pool=github --project=PROJECT_ID` and `gh variable list`.

### Repository protections

- **Rulesets:** *Protect main* blocks force-pushes to and deletion of `main`. *Protect release tags* allows only repository admins to create, move or delete `v*` tags, so only an admin can start a store upload.
- **Security:** private vulnerability reporting ([SECURITY.md](SECURITY.md)), secret scanning with push protection, Dependabot alerts and security updates.
- **Dependabot** (`.github/dependabot.yml`) opens weekly grouped updates for GitHub Actions and npm (minor/patch grouped). It ignores major versions of the AI SDK family (`ai`, `@ai-sdk/*`, `@openrouter/ai-sdk-provider`, `ollama-ai-provider-v2`, `zod`): those must move to a new major together, as one hand-made change.

### Troubleshooting CI and releases

| Failure | Cause and fix |
| --- | --- |
| `Version mismatch: manifest.json=… package.json=…` | Bump both files to the same version. |
| `Tag vX.Y.Z does not match manifest.json version …` | The tag points at a commit without the bump. Delete the tag (`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`, admin only), commit the bump, tag again. |
| `pnpm install --frozen-lockfile` fails | `pnpm-lock.yaml` is out of date: run `pnpm install` and commit the lockfile. Use the pnpm version from `packageManager` (see [Prerequisites](#prerequisites)). |
| **Lint and format** fails | Run `pnpm check` locally; `pnpm format` fixes formatting and `pnpm lint:fix` the safe lint fixes. |
| **UI flows** fails | Download the `ui-flows-<sha>` artifact and look at the step screenshots; run `pnpm test:ui` (or `node tools/ui/flows.mjs --only=<scenario>`) locally. |
| `gh release create` fails because the release exists | The tag was released already. Delete the GitHub Release (keep the tag) and re-run the workflow, or cut a new version. |
| "Chrome Web Store publishing is not configured; skipping store upload." | A repository variable or the `CWS_PUBLISHER_ID` secret is missing (`gh variable list`, `gh secret list`). |
| Authenticate to Google Cloud fails (`unauthorized_client`, `Permission 'iam.serviceAccounts.getAccessToken' denied`) | The run wasn't a `v*` tag push from this repository (the provider's condition), the variables name the wrong provider/service account, or the `workloadIdentityUser` binding is missing. |
| Upload returns HTTP 400/403 | 400 with a version error: the manifest version isn't higher than the last upload, so bump and tag again. 403: the service account isn't linked in the dashboard, or `CWS_PUBLISHER_ID`/`CWS_ITEM_ID` is wrong. |
| Upload state isn't `SUCCEEDED` | The store rejected the package (the response is printed in the log); fix and release a new version. |
| Submit for review fails | Usually an item already in review or a listing problem shown in the dashboard. The upload itself is kept as a draft; submit it from the dashboard. |

## UI tests and screenshots

`tools/ui/` drives the **built** pages in `dist/` (side panel and settings page) in Playwright's Chromium, as ordinary web pages with a stand-in for the `chrome.*` APIs. Nothing in `src/` is aware of it.

```
tools/ui/
  flows.mjs           UI regression suite: ~38 scenarios, ~460 checks per theme (incl. content.js on a stand-in forum page, fixtures/discourse-topic.html)
  readme-shots.mjs    docs/screenshots/*.png: panels → framed composition → palette PNG
  store-shots.mjs     store-assets/*.png: 1280x800 screenshots and promo tiles (24-bit, no alpha)
  pixdiff.mjs         compare two PNGs or two folders of PNGs
  lib/
    chrome-stub.mjs   chrome.* stand-in (storage with onChanged, permissions, scripting probe,
                      runtime messages, tabs); options and test hooks documented in the file.
                      alert/confirm/prompt throw: the pages must not use native dialogs
    extension-page.mjs  open a dist/ page in its own context: stub installed, network sealed off
                      (model lists get an empty answer), page errors collected; IndexedDB seeding
    static-server.mjs, env.mjs, pixdiff.mjs  Static server, repo paths/arguments, pixel comparison
  fixtures/           Fixture data: forums.mjs (Discourse Meta and OpenAI Developer Community,
                      record builders), readme.mjs, store.mjs (incl. the mock forum pages), flows.mjs
  templates/          Composition templates: readme-showcase.html (browser frame, gradient,
                      shadow) and store/ (screenshot page builder + CSS, promo tiles)
  out/                Everything the runners write (gitignored)
```

The forums are real public Discourse sites so the images look familiar; every topic, post, username and answer in the fixtures is invented and in English. Fixture timestamps are relative to the run ("12m ago", "expires in 23h"), so the output doesn't drift with the date.

**Setup** (once, and again after a Playwright upgrade): `pnpm install`, then `pnpm exec playwright install chromium`.

**Flows.** `pnpm test:ui` builds and runs every scenario in light and dark mode (both at once, one browser context per scenario). It exits non-zero on any failed check, any page error or `console.error`, and any brand image or favicon that doesn't load. Screenshots of every step go to `tools/ui/out/flows/<theme>-<width>/`. To iterate, skip the build and pick scenarios, theme or panel width:

```bash
node tools/ui/flows.mjs --theme=dark --only=popup-agent,access-enable
node tools/ui/flows.mjs --theme=light --width=360
```

Scenarios live in `flows.mjs` (`scenario(name, page, stubOptions, steps)`); a scenario simulates the background by answering `chrome.runtime.sendMessage` and by firing broadcasts with `window.__fire('onMessage', …)`, and seeds saved sessions/Agent answers into IndexedDB before a reload.

**README and store images.** Both pipelines render the real panels at 2x with their fixtures, then compose them with the templates. By default the results go to `tools/ui/out/readme/` and `tools/ui/out/store/`, so a run never touches the committed images:

```bash
pnpm shots:readme --check     # render, then pixel-compare with docs/screenshots/
pnpm shots:store --check      # same for store-assets/
pnpm shots:readme --write     # render and overwrite docs/screenshots/*.png
pnpm shots:store --write --only=01,promo-marquee
```

`--check` reports each image as a match or with the size of the difference (pixels differing by more than a small anti-aliasing threshold), and exits non-zero on a material difference. Run it after a UI change to see which committed images went stale, look at the new ones in `tools/ui/out/`, then `--write` those. Rendering uses the system font stack, so regenerate the committed images on macOS (where they were made); other systems render text slightly differently.

**CI.** The `UI flows` job in `.github/workflows/ci.yml` installs Chromium (headless shell, cached per Playwright version) and runs `pnpm test:ui` on every push to `main` and every pull request. When it fails, the flow screenshots are uploaded as the `ui-flows-<sha>` artifact. Screenshot pipelines don't run in CI.
