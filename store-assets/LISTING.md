# Chrome Web Store listing

The text submitted to the Chrome Web Store for DiscourseCopilot, kept here so it changes together with the extension. Update it whenever `manifest.json` permissions or user-facing features change. Current as of version 2.1.0.

## Summary (short description, max 132 characters)

AI summaries and research copilot for any Discourse forum

## Description

Kept short and free of brand-name lists: the Chrome Web Store's keyword-spam check rejected an earlier version that listed every supported AI provider in one line. Keep provider names out of the description and screenshot captions (the README can list them).

DiscourseCopilot helps you catch up on any Discourse forum in seconds, right from Chrome's side panel.

• Summarize long topics: the original post, how people responded, and the key takeaways, even on topics with thousands of replies.
• Ask follow-up questions about the topic you're reading.
• Ask the forum: it searches the forum, reads the most relevant discussions, and answers with numbered sources you can click.
• Works on any forum built with Discourse, including your own community. One click allows each forum you use; there's no access to other websites.
• Bring your own AI: connect the AI provider you already use with your own API key, or run a model on your own computer.
• Your language: answers follow the language of the discussion, or one you choose.
• Organized history: saved summaries, chats and answers, grouped by forum. Keep the ones you need.
• Light and dark mode.

Private by design: your API key and history stay in your browser. Forum content is sent only to the AI provider you choose. DiscourseCopilot reads only the forums you allow, and you can remove access anytime in Settings. No accounts, no analytics, no tracking.

Free and open source (Apache-2.0): https://github.com/kccarlos/DiscourseCopilot

## Single purpose

DiscourseCopilot summarizes Discourse forum topics and answers questions about Discourse forums, using an AI provider the user configures.

## Permission justifications

**Host permissions (required): AI provider APIs and localhost**
`https://openrouter.ai/*`, `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://api.groq.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.x.ai/*`, `https://api.deepseek.com/*`, `http://localhost/*`, `http://127.0.0.1/*`.
The extension sends the user's summary and question requests, with the forum text they concern, to the AI provider the user selected, using the user's own API key. localhost and 127.0.0.1 are for local models (Ollama on port 11434, LM Studio on port 1234). No other hosts are contacted without the user's action.

**Optional host permissions: `https://*/*` (and `http://*/*`)**
Discourse forums are self-hosted on arbitrary domains, so they cannot be listed in the manifest. Nothing is granted at install. The first time the user uses a forum, the side panel shows "Allow DiscourseCopilot on {forum}" with an "Allow access to {forum host}" button, and the extension requests access to that one origin (for example `https://community.openai.com/*`) with `chrome.permissions.request`. With it, the extension reads that forum's topic JSON (`/t/{id}.json`), raw posts (`/raw/{id}`), search results (`/search.json`) and posts (`/t/{id}/posts.json`) with the user's existing login, including from background tasks that keep running after the user switches tabs, and runs its content script there (topic detection and an in-page button that opens the side panel). Users can see and remove every enabled forum in Settings → Forum access. `http://*/*` is requested only for one origin when a user enters a local-model server on another computer (e.g. `http://192.168.1.20:11434`).

**scripting**
Registers the content script dynamically, only for forums the user enabled (`chrome.scripting.registerContentScripts`), injects it into already-open tabs of a newly enabled forum so it works without a reload, and — after the user clicks the toolbar icon (activeTab) — runs a one-time check of that tab for Discourse's page markers so the side panel can offer "Allow access to {forum host}".

**activeTab**
When the user clicks the toolbar icon, the side panel needs to know whether the current tab is a Discourse forum before the user has enabled it: activeTab lets it read that tab's address and title and run the one-time Discourse check. No access to other tabs, and it ends when the tab moves to another site.

**storage**
Saves the user's settings on their device: selected AI provider, API keys, models, favorites, custom instructions, response language, and research/reading/history preferences.

**sidePanel**
The extension's interface is a Chrome side panel next to the forum: summaries, chat, Ask the forum answers, and saved history.

**alarms**
Wakes the background service worker while summaries or forum research tasks are queued or running, so long tasks finish even when Chrome suspends the worker. The alarm is cleared when no task is active.

## Data usage disclosures

- Collected by the developer: none. No personal data, browsing history, analytics or telemetry; the extension has no servers.
- Handled on the user's device only: settings and API keys (chrome.storage), saved summaries, chats, answers and task status (IndexedDB).
- Sent to third parties: forum text and the user's questions go to the AI provider the user configured, only when the user runs a task.
- Privacy policy: https://github.com/kccarlos/DiscourseCopilot/blob/main/PRIVACY.md

## Screenshots

`store-assets/01-…05-*.png` (1280×800) and the promo tiles. They show the side panel on forums that are already allowed; the "Allow DiscourseCopilot on {forum}" card is pictured in the README (`docs/screenshots/feature-allow-access.png`).
