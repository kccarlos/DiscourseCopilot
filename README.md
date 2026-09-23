# DiscourseCopilot

AI summaries, follow-up chat, and a forum-wide research copilot for **any Discourse forum** — [community.openai.com](https://community.openai.com), [meta.discourse.org](https://meta.discourse.org), or your own community.

![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)
![Version](https://img.shields.io/badge/version-2.0.0-green.svg)
![Chrome Extension](https://img.shields.io/badge/platform-Chrome%20Extension-yellow.svg)

![DiscourseCopilot side panel showing a topic summary, an agent answer with citations, and dark mode](docs/screenshots/hero.png)

## What it does

- **Works on any Discourse forum** — detected automatically (via the `generator` meta tag and Discourse's own page markers), no per-site setup.
- **Topic summaries** of the original post, the community response, and key takeaways, including long, multi-page topics.
- **Follow-up chat** — ask questions about a topic using the full discussion and its summary as context.
- **Ask the forum (Agent mode)** — searches the current forum, reads the most relevant discussions, and answers with cited, clickable sources.
- **Per-forum history** — saved summaries, chats, and Agent answers are grouped by forum, so different communities never mix. Subfolder installs (e.g. `https://example.com/forum`) are supported too.
- **Bring your own AI provider** — OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, xAI, DeepSeek, or a local Ollama / LM Studio server. Your key stays in your browser.
- **Response language** — matches the discussion by default, or pin one of 12 languages.
- **Background tasks** — keep browsing while summaries, chats, and Agent research run; track, reopen, or cancel work from **Activity**.
- **Dark mode** — follows your OS/browser theme.

<img src="docs/screenshots/feature-summary-chat.png" alt="Topic summary with a follow-up chat conversation" width="420">

## Install

A Chrome Web Store listing is coming soon. Until then, install from a GitHub Release:

1. Go to the [Releases page](https://github.com/kccarlos/DiscourseCopilot/releases) and download the latest `discourse-copilot-<version>.zip`.
2. Unzip it.
3. Open `chrome://extensions`, enable **Developer mode** (top right).
4. Click **Load unpacked** and select the unzipped folder.
5. Pin DiscourseCopilot and click its icon to open the side panel.

Building from source instead? See [DEVELOPMENT.md](DEVELOPMENT.md).

## Quick start

1. Open the side panel (click the DiscourseCopilot icon, or the floating launcher button on a Discourse page).
2. On first run, the setup card walks you through connecting an AI provider — choose one, add an API key (or a local server URL), and pick a model.
3. Open a topic on any Discourse forum and click **Create summary**.

From there, ask follow-up questions under **Ask about this post**, or click **Ask the forum** to research across the whole forum with cited sources.

<img src="docs/screenshots/feature-setup.png" alt="First-run setup card: choose a provider, add a key, pick a model" width="420">

## Using Ask the forum

**Ask the forum** searches the current forum's `/search.json`, reads the most relevant topics, and answers with `[S1]`-style citations that link to the cited posts. It runs as a background task, so you can keep browsing while it works; reopen it from the pill that appears, or from **Activity**.

<img src="docs/screenshots/feature-agent-answer.png" alt="Ask the forum answer with numbered citations and linked sources" width="420">

Everything you run — summaries, chats, and Agent research — shows up in **Activity**, grouped by forum:

<img src="docs/screenshots/feature-activity.png" alt="Activity view with saved summaries grouped by forum" width="420">

## Supported AI providers

| Provider | Type | Notes |
| --- | --- | --- |
| OpenRouter | Hosted | Many models behind one key |
| OpenAI | Hosted | GPT models |
| Anthropic | Hosted | Claude models |
| Groq | Hosted | |
| Google Gemini | Hosted | |
| xAI | Hosted | Grok models |
| DeepSeek | Hosted | |
| Ollama | Local | Runs on your computer, no API key |
| LM Studio | Local | Runs on your computer, no API key |

For a local provider, start it with an origin allowlist so the extension (a `chrome-extension://` origin) can reach it, for example:

```bash
OLLAMA_ORIGINS=chrome-extension://* ollama serve
```

Switch providers or models any time from **Settings** (right-click the extension icon → **Options**, or the **Settings** button in the side panel), where you can also set a custom system prompt and add favorite models for quick switching from the side-panel header.

The side panel follows your OS/browser theme automatically:

<img src="docs/screenshots/feature-dark-mode.png" alt="DiscourseCopilot in dark mode" width="420">

## Privacy

DiscourseCopilot reads only the forum you're currently on (or the forum an Agent task started on), using your existing browser session for it. Everything — settings, API keys, saved summaries, chat, and Agent answers — is stored locally in your browser. Forum content is sent only to the AI provider you configure; there are no developer servers, accounts, or analytics.

See [PRIVACY.md](PRIVACY.md) for the full policy.

## FAQ / Troubleshooting

**The side panel says to open a Discourse forum topic**
Make sure the page is a Discourse forum (most show "Powered by Discourse") and that you're on a topic URL (`/t/…`).

**Nothing happens on a tab that was already open before I installed or reloaded the extension**
Chrome only injects the content script into tabs opened (or reloaded) after install. Refresh the tab.

**A summary or Agent task pauses asking me to log in or verify**
DiscourseCopilot uses your browser session for that forum. Log in (or complete the verification challenge) in a tab on that forum, then choose **Continue** in **Activity**.

**Requests are failing or slow with a rate-limit error**
The extension retries automatically using the provider's `Retry-After` header. If it keeps failing, check your provider account's plan and usage.

**API errors**
Verify your API key and model, check your provider account's credits, and use **Test Connection** in Settings.

## Contributing

Bug reports, ideas, and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Building the extension, running tests, project structure, and the release process are in [DEVELOPMENT.md](DEVELOPMENT.md). Please report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

Apache License 2.0 — see [LICENSE](LICENSE). Author: [kccarlos](https://github.com/kccarlos).
