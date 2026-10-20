# Chrome Web Store listing

The text submitted to the Chrome Web Store for DiscourseCopilot, kept here so it changes together with the extension. Update it whenever `manifest.json` permissions or user-facing features change. Current as of version 2.3.1. The release workflow uploads only the package, never this text: the listing text, screenshots and permission justifications are pasted by hand into the [developer dashboard](https://chrome.google.com/webstore/devconsole), so copy any change made here there too (and the other way round). The short description comes from `extDescription` in `public/_locales/en/messages.json` (the manifest's `description` is a `__MSG_extDescription__` placeholder); the Chinese one is in `public/_locales/zh_CN/messages.json`.

## Summary (short description, max 132 characters)

AI summaries and research copilot for any Discourse forum

## Description

Kept short and free of brand-name lists: the Chrome Web Store's keyword-spam check rejected an earlier version that listed every supported AI provider in one line. Keep provider names out of the description and screenshot captions (the README can list them).

DiscourseCopilot helps you catch up on any Discourse forum in seconds, right from Chrome's side panel.

• Summarize long topics: the original post, how people responded, and the key takeaways, even on topics with thousands of replies.
• Ask follow-up questions about the topic you're reading. The whole thread, every reply, is the context, so answers can point to the posts that said it.
• Ask the forum: an agent searches the forum, reads the most relevant discussions step by step (you can watch each step), and answers with numbered sources you can click. Ask follow-up questions on the same answer.
• Made for forums built with Discourse, including your own community. One click allows each forum you use; the extension does not read other websites.
• Bring your own AI: connect the AI provider you already use with your own API key, or run a model on your own computer.
• Your language: answers follow the language of the discussion, or one you choose.
• Organized history: saved summaries, chats and answers, grouped by forum. Keep the ones you need.
• Light and dark mode.

Privacy first: your API key and history stay in your browser. Forum content is sent only to the AI provider you choose (or stays on your computer with a local model). DiscourseCopilot reads only the forums you allow, and you can remove access anytime in Settings. No accounts, no analytics, no tracking.

Free and open source (Apache-2.0): https://github.com/kccarlos/DiscourseCopilot

## Simplified Chinese listing (简体中文)

Paste into the dashboard's Chinese (Simplified) listing. The name and short description are also in `public/_locales/zh_CN/messages.json`; keep them in sync.

Name: DiscourseCopilot

### Summary (short description, max 132 characters)

为任意 Discourse 论坛提供 AI 助手：一键总结贴文，全站搜索并获得带来源的回答。

### Description

DiscourseCopilot 让你在 Chrome 侧边栏里几秒钟看懂任何 Discourse 论坛的长帖。

• 总结贴文：原帖内容、大家的回应和关键要点，即使话题有上千条回复也没问题。
• 针对正在阅读的话题继续追问。整个讨论串、每一条回复都会作为上下文，因此回答能指向说出这些内容的帖子。
• 全站搜索：由智能体搜索论坛，一步步阅读最相关的讨论（每一步你都能看到），并给出带编号来源的回答，来源可以直接点开。你还可以针对同一个回答继续追问。
• 专为基于 Discourse 搭建的论坛设计，包括你自己的社区。点一下即可允许访问你用到的每个论坛，扩展不会读取其他网站。
• 自带 AI：连接你已经在用的 AI 服务商并填入自己的 API 密钥，也可以在自己的电脑上运行模型。
• 你的语言：界面提供英文和简体中文，跟随浏览器语言；回答默认跟随讨论的语言，也可以自行指定。
• 条理清晰的历史记录：已保存的总结、对话和回答按论坛分组，需要的可以保留。
• 支持浅色和深色模式。

隐私优先：你的 API 密钥和历史记录都保存在浏览器里。论坛内容只会发送给你选择的 AI 服务商（使用本地模型时则完全留在你的电脑上）。DiscourseCopilot 只读取你允许的论坛，你可以随时在设置中移除访问权限。无需账号，没有统计分析，不做任何追踪。

免费开源（Apache-2.0）：https://github.com/kccarlos/DiscourseCopilot

## Single purpose

DiscourseCopilot summarizes Discourse forum topics and answers questions about Discourse forums, using an AI provider the user configures.

## Permission justifications

**Host permissions (required): AI provider APIs and localhost**
`https://openrouter.ai/*`, `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://api.groq.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.x.ai/*`, `https://api.deepseek.com/*`, `http://localhost/*`, `http://127.0.0.1/*`.
The extension sends the user's summary and question requests, with the forum text they concern, to the AI provider the user selected, using the user's own API key. localhost and 127.0.0.1 are for local models (Ollama on port 11434, LM Studio on port 1234). No other hosts are contacted without the user's action.

**Optional host permissions: `https://*/*` (and `http://*/*`)**
Discourse forums are self-hosted on arbitrary domains, so they cannot be listed in the manifest. Nothing is granted at install. The first time the user uses a forum, the side panel shows "Allow DiscourseCopilot on {forum}" with an "Allow access to {forum host}" button, and the extension requests access to that one origin (for example `https://community.openai.com/*`) with `chrome.permissions.request`. With it, the extension reads that forum's topic JSON (`/t/{id}.json`), raw posts (`/raw/{id}`), search results (`/search.json`) and the latest topics (`/latest.json`) with the user's existing login, including from background tasks that keep running after the user switches tabs, and runs its content script there (topic detection and an in-page button that opens the side panel). Users can see and remove every enabled forum in Settings → Forum access. `http://*/*` is requested only for one origin when a user enters a local-model server on another computer (e.g. `http://192.168.1.20:11434`).

**declarativeNetRequestWithHostAccess**
Ollama (a local model server) answers HTTP 403 to every request that carries a browser extension's `Origin` header unless the user started it with a special environment variable, so summaries and chat fail on a default install. The extension registers one declarativeNetRequest rule that removes only the `Origin` request header, only from requests the extension itself makes (`initiatorDomains` is the extension's own ID), and only to the local model server addresses the user uses: `localhost`, `127.0.0.1`, and the address of a custom Ollama or LM Studio server the user entered and allowed. Requests from web pages and to any other address are not modified, the rule does not block or redirect anything, and it reads no page content. It uses the host permissions the extension already has.

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

Captions (title, then subtitle), also free of provider brand names:

1. `01-summarize-topics.png`: **Summarize any Discourse topic in seconds.** Get the main points of a long thread, then ask follow-up questions about it.
2. `02-ask-the-forum.png`: **Ask the whole forum — answers with sources.** An agent searches and reads step by step, then cites the posts it used.
3. `03-every-discourse-forum.png`: **Made for Discourse forums.** One click enables each forum you use. Saved summaries and answers stay grouped by forum.
4. `04-bring-your-own-ai.png`: **Bring your own AI.** Connect the AI provider you already use, or run a model on your own computer. Your key stays in your browser.
5. `05-light-and-dark-mode.png`: **Light and dark mode.** The side panel follows your system theme automatically.

Promo tiles: `promo-small-440x280.png` and `promo-marquee-1400x560.png`.

GitHub social preview (not a store image): `social-preview-1280x640.png`, the marquee tile re-laid for 2:1. Upload it in the repository's **Settings → General → Social preview**; it is what X, Slack, WeChat and others show for a link to the repository.

`store-assets/01-…05-*.png` are 1280×800 (24-bit, no alpha). They show the side panel on forums that are already allowed; the "Allow DiscourseCopilot on {forum}" card is pictured in the README (`docs/screenshots/feature-allow-access.png`).

They are generated by `tools/ui/store-shots.mjs` (`pnpm shots:store --write`; see [DEVELOPMENT.md, "UI tests and screenshots"](../DEVELOPMENT.md#ui-tests-and-screenshots)). Captions live in `tools/ui/store-shots.mjs`.
