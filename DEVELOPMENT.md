# Developing DiscourseCopilot

For what the extension does and how to install a release, see [README.md](README.md).

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
pnpm dev     # rebuild on change (vite build --watch)
pnpm test    # run unit tests (node --test)
pnpm clean   # remove dist/
```

## Running it locally

1. `pnpm build` (or `pnpm dev` to rebuild on every change).
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. After each rebuild, click the reload icon on the extension's card in `chrome://extensions` (and refresh any open forum tabs) to pick up the change.

## Project structure

Plain JavaScript ES modules, bundled by Vite (`vite-plugin-web-extension` reads `manifest.json`). Logic that needs no DOM or `chrome.*` API at import time lives in modules unit-tested under `test/` (state derivations, the config model, the settings form machine, the task service, executors' helpers); the DOM-bound view classes are kept thin on top of them.

```
manifest.json       Chrome MV3 manifest (build input)
vite.config.js      Build configuration
public/             Static assets copied into dist/ as-is: toolbar/store icons (icon16/32/48/128.png,
                    rendered from assets/brand/icon/sizes/*-on-light.svg) and brand/ SVGs used by the pages
assets/brand/       Logo source of truth (icon, pixel-hinted small sizes, wordmarks; on-light/on-dark
                    variants). Not shipped; the README wordmark is served from here
test/               Unit tests (node --test)
src/
  background/       Service worker
    background.js         Entry: builds the services below and registers every Chrome listener once
    message-router.mjs    onMessage routing (action → handler table, async responses)
    task-service.mjs      Job queue + request validation, IndexedDB persistence, broadcasts,
                          wake-up alarm, per-task provider configuration
    topic-executors.mjs   Summary and follow-up chat tasks
    agent-executor.mjs    Agent (forum research) tasks
    agent-activity-store.mjs  Agent activity records: ordered saves + broadcasts
    topic-fetcher.mjs     Reads a topic's raw posts page by page (cache reuse, rate-limit retries)
    job-queue.mjs, agent-runner.mjs, forum-tools.mjs  Queue engine, Agent loop, forum search tools
  content/          Content script on every page: detects Discourse, topic IDs, in-page launcher
  popup/            Side panel (popup.html/css)
    popup.js              Entry: composes the modules below; page changes, broadcast routing,
                          panel-wide render (updateUI)
    page-context.mjs      Active tab → page context (forum, topic)
    topic-controller.mjs  The topic session: switch with the page, restore, reload, render
    summary-view.mjs      Summary card, reading progress, topic task status line
    chat-view.mjs         Follow-up chat, message editing, forum context limit
    agent-controller.mjs  Agent runs, inline panel, pill, composer, answer actions
    agent-answer-view.mjs Renders one Agent run (shared by the inline panel and the detail view)
    activity-view.mjs     Activity screen: Tasks/Saved tabs, forum groups and filter, Agent detail
    activity-cards.mjs    Task and saved-item cards
    provider-header.mjs   Model switcher (active provider · model, favorites), setup state
    setup-card.mjs        First-run setup (uses the shared ConfigStore)
    forum-ui.mjs          Forum names, forum bar, forum accents
    task-registry.mjs     The panel's copy of the task queue and requests to it
    session-store.mjs     Topic sessions cached in memory and saved to IndexedDB
    operations.mjs        The one request being submitted (page/config snapshot)
    topic-controls.mjs    Enabled state and labels of every control, derived from panel state
    markdown.mjs, status-line.mjs, forum-tabs.mjs, clipboard.mjs  Rendering and small helpers
    ui-state.mjs, conversation-state.mjs, runtime-state.mjs  Pure view logic
    topic-session.mjs, topic-session-db.mjs  Session records and the IndexedDB schema
                          (also used by the background)
  settings/         Options page
    settings.js           Wires the form to the ConfigStore and the form state machine
    settings-form-state.mjs  Form state machine (status line, dirty indicator, busy state)
    settings-helpers.mjs  Model suggestion helpers
  services/         AI provider calls (ai-service, provider-config), prompts, chat/Agent context
  shared/           Used across the above
    config-state.mjs      The configuration model (see below)
    preferences.mjs       Research depth, topic page limit and history retention: defaults, ranges,
                          normalization/validation and the resolve*() helpers
    provider-setup.mjs    Provider validation, connection test, failure messages
    constants.js          Storage keys, message names, provider list
    task-record.mjs, agent-activity.mjs, forum-site.mjs, forum-response.mjs, …  Records and utilities
```

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

Hard caps stay in code: `FORUM_TOOL_LIMITS` (search pages ≤ 3, raw pages ≤ 20), `MAX_UNKNOWN_TOPIC_PAGES`, the forum request pacing, `MAX_AGENT_SEARCH_QUERIES`/`MAX_AGENT_TOOL_CALLS` (sized for the largest budget) and a 7-day ceiling on finished task records.

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

## CI/CD & releases

**CI** (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request: `pnpm install --frozen-lockfile`, a check that `manifest.json` and `package.json` have the same version, `pnpm test`, `pnpm build`, and uploads `dist/` as a workflow artifact (kept 7 days).

**Cutting a release** (`.github/workflows/release.yml`):

1. Bump `version` in **both** `manifest.json` and `package.json` (e.g. `2.1.0`) and commit to `main`.
2. Tag and push: `git tag v2.1.0 && git push origin v2.1.0`

The workflow tests and builds, fails if the tag doesn't match the manifest version, zips the contents of `dist/` as `discourse-copilot-<version>.zip`, and creates a GitHub Release with the zip attached and auto-generated notes.

**Optional Chrome Web Store upload:** add these repository secrets (Settings → Secrets and variables → Actions): `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`. When all four are set, each release also uploads the zip to the store as a draft. To submit it for review automatically, also set the repository **variable** `CWS_AUTO_PUBLISH` to `true`. Without the secrets, the store step is skipped.

## Screenshots

The images in `docs/screenshots/` (used by the README) are produced with a Playwright harness that renders the real side-panel markup and CSS with fixture data, then composes the results into framed, captioned images. The harness itself lives outside this repository (it's a throwaway tool, not part of the extension); only its output is checked in.
