# Adding support for a new kind of site

DiscourseCopilot reads a site through a **site adapter**. The task executors (summaries, chat) and the Agent never call a platform's API themselves: they ask the registry in `src/background/sites/index.mjs` for the adapter of the task's site (`task.siteType`, Discourse when missing) and call its methods. Today there are two: `sites/discourse.mjs` and `sites/wordpress.mjs` (a post and its comments through the public REST API, see DEVELOPMENT.md). Add one adapter per **platform** (Discourse, WordPress, ...), not per website: one WordPress adapter covers every WordPress blog.

## The adapter shape

A frozen object with these members. The registry refuses an adapter missing any of them.

| Member | Contract |
|---|---|
| `type` | Stable id, stored on tasks as `siteType`. Lowercase, never renamed. |
| `label` | Human name for messages. |
| `fetchTopicContent(siteUrl, topicId, onProgress, signal, { cachedPages, knownTotalPosts, maxPages })` | Reads one topic (a thread, or a post with its comments) page by page. Returns `{ content, rawPages, pagesFetched, totalPosts, truncated, coveredPosts, ... }` like `buildContentResult()` in `topic-fetcher.mjs`. Reuse `cachedPages` when `totalPosts` is unchanged; report progress through `onProgress`; throw `forumAccessError()` for login or challenge pages so the side panel can guide the user. |
| `createToolClient({ siteUrl, signal, governor })` | One client per Agent run. (WordPress's still throws "not available yet"; `siteTypeSupportsAgent()` in `shared/site-types.mjs` keeps the panel from offering Agent questions until a platform has real tools.) It must offer what `agent-tools.mjs` calls: `searchForum`, `listLatest`, `getTopic`, `getRawPage`. Send every request through the shared `governor` (rate limiting) and `fetchWithRateLimitRetry` (429 backoff), and refuse URLs outside `siteUrl`. |

## Checklist for a new platform

1. **Probe the API first.** Write a read-only script that calls every endpoint the adapter will use and records status, content type, pagination headers and timing. Run it from the user's own browser or machine, not a cloud sandbox: sites often block data-center traffic. Keep the script and a sample of real responses (trimmed) as test fixtures.
2. **Write `sites/<platform>.mjs`** exporting `create<Platform>Adapter({ fetchImpl })`, and add it to `createDefaultSiteRegistry()`.
3. **Page detection.** Page state carries `siteType` (`shared/site-types.mjs`). Discourse is recognized by its server-rendered tags (`content.js`, `popup/page-probe.mjs`); WordPress by `shared/wordpress-page.mjs`, which reads the document's REST link, shortlink and `<body>` class. A new platform adds its own recognition to both the content script and the probe (the probe runs serialized in the page, so it returns raw facts and the panel interprets them), and a `SITE_TYPE` value. The topic key stays `host/t/<id>` (a host is one platform); only Discourse also takes the id from the URL.
4. **Permissions.** Sites are enabled per origin through optional host permissions (`shared/forum-access.mjs`); no manifest change is needed.
5. **Agent prompt.** (Still Discourse-only.) The tool descriptions and example calls in `services/agent-prompt.mjs` are written for Discourse (search syntax, topic ids). A platform with different search capabilities needs its own tool descriptions.
6. **Text.** User-facing strings go in all three locales (`en`, `zh-CN`, `zh-TW`).
7. **Tests.** Contract tests like `test/site-registry.test.mjs`, adapter tests that replay recorded fixtures through `fetchImpl` (`test/wordpress-adapter.test.mjs`), and a real-browser check like `tools/ui/wordpress-e2e.mjs`.
8. **Docs.** List the platform in the README's supported sites and add a CHANGELOG entry.

Step 5 is not yet pluggable: the Agent's tool descriptions are not per site type.
