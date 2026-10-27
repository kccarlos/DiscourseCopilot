# Chrome Web Store listing

The text submitted to the Chrome Web Store for Forumind, kept here so it changes together with the extension. Update it whenever `manifest.json` permissions or user-facing features change. Current as of version 3.0.0. The release workflow uploads only the package, never this text: the listing text, screenshots and permission justifications are pasted by hand into the [developer dashboard](https://chrome.google.com/webstore/devconsole), so copy any change made here there too (and the other way round). The short description comes from `extDescription` in `public/_locales/en/messages.json` (the manifest's `description` is a `__MSG_extDescription__` placeholder); the Chinese ones are in `public/_locales/zh_CN/messages.json` and `public/_locales/zh_TW/messages.json`.

## Summary (short description, max 132 characters)

Your AI assistant for the comment section. Formerly DiscourseCopilot.

## Description

Kept short and free of brand-name lists: the Chrome Web Store's keyword-spam check rejected an earlier version that listed every supported AI provider in one line. Keep provider names out of the description and screenshot captions (the README can list them).

Forumind (formerly DiscourseCopilot) is your AI assistant for the comment section: catch up on any Discourse forum, WordPress blog comments (like Doctor of Credit) or Reddit thread in seconds, right from Chrome's side panel.

• Summarize long topics: the original post, how people responded, and the key takeaways, even on topics with thousands of replies.
• Ask follow-up questions about the topic you're reading. The whole thread, every reply, is the context, so answers can point to the posts that said it.
• Ask the forum: an agent searches the forum, reads the most relevant discussions step by step (you can watch each step), and answers with numbered sources you can click. Ask follow-up questions on the same answer.
• Made for Discourse forums (including your own community), WordPress sites that leave their public REST API open, and Reddit while you're signed in. One click allows each site you use; the extension does not read other websites.
• Bring your own AI: connect the AI provider you already use with your own API key, or run a model on your own computer.
• Your language: answers follow the language of the discussion, or one you choose.
• Organized history: saved summaries, chats and answers, grouped by forum. Keep the ones you need.
• Light and dark mode.

Privacy first: your API key and history stay in your browser. Forum content is sent only to the AI provider you choose (or stays on your computer with a local model). Forumind reads only the forums you allow, and you can remove access anytime in Settings. No accounts, no analytics, no tracking.

Free and open source (Apache-2.0): https://github.com/kccarlos/DiscourseCopilot

## Simplified Chinese listing (简体中文)

Paste into the dashboard's Chinese (Simplified) listing. The name and short description are also in `public/_locales/zh_CN/messages.json`; keep them in sync. Screenshots and promo tiles: `store-assets/zh-CN/` (captions in `tools/ui/fixtures/copy/zh-CN.mjs`).

Name: Forumind

### Summary (short description, max 132 characters)

你的评论区 AI 助手。原名 DiscourseCopilot。

### Description

你的评论区 AI 助手。逛 Discourse 论坛、WordPress 博客评论和 Reddit，不用再爬楼。Forumind 在 Chrome 侧边栏里帮你读完长帖、回答追问、搜遍整个论坛。

• 一键爬楼总结：原帖内容、大家的回应和关键要点，即使话题有上千条回复也没问题。
• 针对整栋楼追问：每一层楼都在上下文里，所以可以问“哪一层楼提到了解决办法？”，回答会告诉你是哪一层楼说的。
• 全站搜索：由智能体搜索论坛，一步步阅读最相关的讨论（每一步你都能看到），并给出带编号来源的回答，来源可以直接点开。还可以针对同一个回答继续追问。
• 你能看到的，它都能读：用你自己的论坛登录状态读帖和搜索，需要登录才能看的帖子也能总结和搜索。
• 不给论坛添负担：总结和对话按帖子保存在本地，有新回复时只读取新增的部分。
• 后台运行：总结和提问都在后台进行，你可以接着看别的帖子，回来再看结果。
• 适用于基于 Discourse 搭建的论坛（包括你自己的社区）、开放公开 REST API 的 WordPress 网站，以及已登录的 Reddit。点一下即可允许访问你用到的每个网站，扩展不会读取其他网站。
• 自带 AI：连接你已经在用的 AI 服务商并填入自己的 API 密钥，也可以在自己的电脑上运行模型。被限速了，一键切换到别的模型。
• 你的语言：界面提供简体中文、繁体中文和英文，跟随浏览器语言；回答默认跟随讨论的语言，也可以自行指定。
• 支持浅色和深色模式。

隐私优先：你的 API 密钥和历史记录都保存在浏览器里。论坛内容只会发送给你选择的 AI 服务商（使用本地模型时则完全留在你的电脑上）。Forumind 只读取你允许的论坛，你可以随时在设置中移除访问权限。无需账号，没有统计分析，不做任何追踪。

免费开源（Apache-2.0）：https://github.com/kccarlos/DiscourseCopilot

### Screenshot captions

1. `01-summarize-topics.png`：**一键总结 Discourse 长帖** 一键爬楼看要点，接着追问，连是哪一层楼说的都告诉你。
2. `02-ask-the-forum.png`：**全站搜索，回答附带来源** 智能体一步步搜索、阅读，并标出它引用的帖子。
3. `03-works-on-every-site.png`：**Discourse 论坛、WordPress 评论和 Reddit 帖子都能用** 用你自己的登录状态读帖，登录才能看的帖子也能总结和搜索。
4. `04-bring-your-own-ai.png`：**AI 随你选** 连接你已经在用的 AI 服务商，被限速了一键换模型。密钥只保存在浏览器里。
5. `05-light-and-dark-mode.png`：**浅色和深色模式** 侧边栏自动跟随系统主题。

## Traditional Chinese listing (繁體中文)

Paste into the dashboard's Chinese (Traditional) listing. The name and short description are also in `public/_locales/zh_TW/messages.json`; keep them in sync. Screenshots and promo tiles: `store-assets/zh-TW/` (captions in `tools/ui/fixtures/copy/zh-TW.mjs`).

Name: Forumind

### Summary (short description, max 132 characters)

你的留言區 AI 助手。原名 DiscourseCopilot。

### Description

你的留言區 AI 助手。逛 Discourse 論壇、WordPress 部落格留言和 Reddit，不用再爬文。Forumind 在 Chrome 側邊欄裡幫你讀完長篇討論、回答追問、搜遍整個論壇。

• 一鍵爬文摘要：原始貼文、大家的回應和重點整理，即使話題有上千則回覆也沒問題。
• 針對整串討論追問：每一則回覆都在上下文裡，所以可以問「哪一樓提到了解決辦法？」，回答會告訴你是哪一樓說的。
• 全站搜尋：由 AI 代理搜尋論壇，一步步閱讀最相關的討論（每一步你都看得到），並給出附編號來源的回答，來源可以直接點開。還可以針對同一個回答繼續追問。
• 你看得到的，它都能讀：用你自己的論壇登入狀態讀文和搜尋，要登入才看得到的貼文也能摘要和搜尋。
• 不給論壇添負擔：摘要和對話按貼文儲存在本機，有新回覆時只讀取新增的部分。
• 背景執行：摘要和提問都在背景進行，你可以接著看別的貼文，回來再看結果。
• 適用於以 Discourse 架設的論壇（包括你自己的社群）、開放公開 REST API 的 WordPress 網站，以及已登入的 Reddit。點一下即可允許存取你用到的每個網站，擴充功能不會讀取其他網站。
• 自備 AI：連線你已經在用的 AI 供應商並填入自己的 API 金鑰，也可以在自己的電腦上執行模型。被限速了，一鍵切換到別的模型。
• 你的語言：介面提供繁體中文、簡體中文和英文，跟隨瀏覽器語言；回答預設跟隨討論的語言，也可以自行指定。
• 支援淺色和深色模式。

隱私優先：你的 API 金鑰和歷史紀錄都儲存在瀏覽器裡。論壇內容只會傳送給你選擇的 AI 供應商（使用本機模型時則完全留在你的電腦上）。Forumind 只讀取你允許的論壇，你可以隨時在設定中移除存取權限。不需要帳號，沒有統計分析，不做任何追蹤。

免費開源（Apache-2.0）：https://github.com/kccarlos/DiscourseCopilot

### Screenshot captions

1. `01-summarize-topics.png`：**一鍵摘要 Discourse 長篇討論** 一鍵爬文看重點，接著追問，連是哪一樓說的都告訴你。
2. `02-ask-the-forum.png`：**全站搜尋，回答附帶來源** AI 代理一步步搜尋、閱讀，並標出它引用的貼文。
3. `03-works-on-every-site.png`：**Discourse 論壇、WordPress 留言和 Reddit 貼文都能用** 用你自己的登入狀態讀文，要登入才看得到的貼文也能摘要和搜尋。
4. `04-bring-your-own-ai.png`：**AI 隨你選** 連線你已經在用的 AI 供應商，被限速了一鍵換模型。金鑰只儲存在瀏覽器裡。
5. `05-light-and-dark-mode.png`：**淺色和深色模式** 側邊欄自動跟隨系統主題。

## Single purpose

Forumind summarizes forum topics, WordPress posts and Reddit posts, and answers questions about those sites, using an AI provider the user configures.

## Permission justifications

**Host permissions (required): AI provider APIs and localhost**
`https://openrouter.ai/*`, `https://api.openai.com/*`, `https://api.anthropic.com/*`, `https://api.groq.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.x.ai/*`, `https://api.deepseek.com/*`, `http://localhost/*`, `http://127.0.0.1/*`.
The extension sends the user's summary and question requests, with the forum text they concern, to the AI provider the user selected, using the user's own API key. localhost and 127.0.0.1 are for local models (Ollama on port 11434, LM Studio on port 1234). No other hosts are contacted without the user's action.

**Optional host permissions: `https://*/*` (and `http://*/*`)**
Discourse forums and WordPress sites are self-hosted on arbitrary domains, so they cannot be listed in the manifest; Reddit (`https://www.reddit.com/*`) is requested the same way, only when the user allows it. Nothing is granted at install. The first time the user uses a forum, the side panel shows "Allow Forumind on {forum}" with an "Allow access to {forum host}" button, and the extension requests access to that one origin (for example `https://community.openai.com/*`) with `chrome.permissions.request`. With it, the extension reads that forum's topic JSON (`/t/{id}.json`), raw posts (`/raw/{id}`), search results (`/search.json`) and the latest topics (`/latest.json`) with the user's existing login, including from background tasks that keep running after the user switches tabs, and runs its content script there (topic detection and an in-page button that opens the side panel). On a WordPress site it reads the public REST API instead (`/wp-json/wp/v2/posts`, `/pages`, `/comments`, `/categories`); on Reddit, with the user's signed-in session, the post's comments (`/comments/{id}.json`, `/api/morechildren.json`), post and comment search within a subreddit or across Reddit (`/svc/shreddit/r/{subreddit}/search/`, `/svc/shreddit/search/`) and the newest posts of a subreddit or the front page (`/r/{subreddit}/new.json`, `/new.json`). Users can see and remove every enabled forum in Settings → Forum access. `http://*/*` is requested only for one origin when a user enters a local-model server on another computer (e.g. `http://192.168.1.20:11434`).

**declarativeNetRequestWithHostAccess**
Ollama (a local model server) answers HTTP 403 to every request that carries a browser extension's `Origin` header unless the user started it with a special environment variable, so summaries and chat fail on a default install. The extension registers one declarativeNetRequest rule that removes only the `Origin` request header, only from requests the extension itself makes (`initiatorDomains` is the extension's own ID), and only to the local model server addresses the user uses: `localhost`, `127.0.0.1`, and the address of a custom Ollama or LM Studio server the user entered and allowed. Requests from web pages and to any other address are not modified, the rule does not block or redirect anything, and it reads no page content. It uses the host permissions the extension already has.

**scripting**
Registers the content script dynamically, only for forums the user enabled (`chrome.scripting.registerContentScripts`), injects it into already-open tabs of a newly enabled forum so it works without a reload, and — after the user clicks the toolbar icon (activeTab) — runs a one-time check of that tab for Discourse's or WordPress's page markers (Reddit is recognized from its address) so the side panel can offer "Allow access to {forum host}".

**activeTab**
When the user clicks the toolbar icon, the side panel needs to know whether the current tab is a supported site (a Discourse forum, a WordPress site or Reddit) before the user has enabled it: activeTab lets it read that tab's address and title and run the one-time check. No access to other tabs, and it ends when the tab moves to another site.

**storage**
Saves the user's settings on their device: selected AI provider, API keys, models, favorites, custom instructions, response language, and research/reading/history preferences.

**sidePanel**
The extension's interface is a Chrome side panel next to the forum: summaries, chat, Ask the forum answers, and saved history.

**alarms**
Wakes the background service worker while summaries or forum research tasks are queued or running, so long tasks finish even when Chrome suspends the worker. The alarm is cleared when no task is active.

## Data usage disclosures

- Collected by the developer: none. No personal data, browsing history, analytics or telemetry; the extension has no servers.
- Handled on the user's device only: settings and API keys (chrome.storage), saved summaries, chats, answers and task status (IndexedDB).
- Sent to third parties: forum, WordPress or Reddit text and the user's questions go to the AI provider the user configured, only when the user runs a task.
- Privacy policy: https://github.com/kccarlos/DiscourseCopilot/blob/main/PRIVACY.md

## Screenshots

Captions (title, then subtitle), also free of provider brand names:

1. `01-summarize-topics.png`: **Summarize any Discourse topic in seconds.** Get the main points of a long thread, then ask follow-up questions about it.
2. `02-ask-the-forum.png`: **Ask the whole forum — answers with sources.** An agent searches and reads step by step, then cites the posts it used.
3. `03-works-on-every-site.png`: **Discourse forums, WordPress comments and Reddit threads.** One click enables each site you use. Saved summaries and answers stay grouped by site.
4. `04-bring-your-own-ai.png`: **Bring your own AI.** Connect the AI provider you already use, or run a model on your own computer. Your key stays in your browser.
5. `05-light-and-dark-mode.png`: **Light and dark mode.** The side panel follows your system theme automatically.

Promo tiles: `promo-small-440x280.png` and `promo-marquee-1400x560.png`.

GitHub social preview (not a store image): `social-preview-1280x640.png`, the marquee tile re-laid for 2:1. Upload it in the repository's **Settings → General → Social preview**; it is what X, Slack, WeChat and others show for a link to the repository.

`store-assets/01-…05-*.png` are 1280×800 (24-bit, no alpha). They show the side panel on forums that are already allowed; the "Allow Forumind on {forum}" card is pictured in the README (`docs/screenshots/feature-allow-access.png`).

They are generated by `tools/ui/store-shots.mjs` (`pnpm shots:store --write`, and `--locale=zh-CN` / `--locale=zh-TW` for `store-assets/zh-CN/` and `store-assets/zh-TW/`, the images for the Chinese listings; see [DEVELOPMENT.md, "UI tests and screenshots"](../DEVELOPMENT.md#ui-tests-and-screenshots)). Captions, promo copy and the forum text in each language live in `tools/ui/fixtures/copy/`.
