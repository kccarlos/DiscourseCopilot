# Privacy Policy for Forumind

**Last Updated:** October 27, 2026

## Overview

Forumind (formerly DiscourseCopilot) is a browser extension that summarizes and answers questions about discussions you visit, using an AI provider you configure. It works on three kinds of sites: Discourse forums (for example community.openai.com or meta.discourse.org), WordPress sites that leave their public REST API open (for example doctorofcredit.com), and Reddit (www.reddit.com, while you are signed in). This policy explains what data the extension handles and where it goes. In this policy, "forum" or "site" means any of these.

## Permissions and site access

Discourse forums and WordPress sites are hosted on arbitrary domains, so the extension cannot list them in advance. Instead of asking for access to all websites, it asks for access **one site at a time** (Reddit too: access to `www.reddit.com` is requested the same way), when you choose **Allow access** in the side panel. Chrome shows its own prompt, and nothing is read from a forum before you allow it.

- **Forums you enable** (optional host permission, per forum): the extension reads topics, posts, comments and search results from that site, using your existing browser session there (so login-required forums work when you are logged in, and Reddit works only while you are signed in to Reddit). A small content script runs on that site's pages to detect the topic or post you are viewing and show the in-page Forumind button. You can see and remove every enabled forum under **Settings → Forum access**; removing access keeps your saved summaries and answers.
- **AI provider hosts** (requested at install): the API addresses of the supported providers (OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, xAI, DeepSeek) and `localhost` / `127.0.0.1` for Ollama and LM Studio. They are used only to send your requests to the provider you configured, and to read that provider's list of available models. A local model server on another computer is added (optional host permission for that one address) only when you enter its address and allow it.
- **Checking the current page** (`activeTab` and `scripting`): when you click the Forumind toolbar icon, the extension may look once at that tab to see whether it is a supported site and read its address and title. For Discourse it looks for the `generator` meta tag, the `discourse-base-uri` meta tag or Discourse's setup element; for WordPress, the page's WordPress REST API link (`link rel="https://api.w.org/"`), its shortlink, the `body` class and the `og:site_name` tag; Reddit is recognized from the address alone. This happens only after your click and only for that tab. The result is not sent anywhere; the only thing remembered is that you clicked in that tab, kept in session storage (cleared when the browser closes).
- **Local model servers and request headers** (`declarativeNetRequestWithHostAccess`): Ollama refuses requests that carry a browser extension's `Origin` header. The extension therefore removes that one header from its own requests to `localhost`, `127.0.0.1` and a local model server address you entered and allowed. It changes nothing else, never touches requests from web pages or to any other address, and sends no additional data anywhere.
- **Other permissions**: `storage` (settings on your device), `sidePanel` (the side panel), `alarms` (keeps background tasks running while you browse).
- The extension does not read forums you have not enabled, and it cannot see which websites you visit. Two small things involve the page you are on: the one-time check described above (after you click the toolbar icon), and the side panel's forum bar, which loads that forum's own icon (`/favicon.ico`) directly from the forum, as any web page would; it is requested without a referrer and can happen before you allow access. Links to AI provider sites (for example "Get a key") open only when you click them.

## Data Collection and Usage

### What the extension stores (locally, on your device)
- **Forum content and summaries**: Topic pages you choose to summarize and the resulting summaries, saved in extension-owned IndexedDB so you can return to them. Saved sessions are keyed by forum and topic, so different forums are kept separate.
- **Follow-up chat and Agent answers**: Recent questions, answers, search queries, and source references.
- **Task status**: Queued, running, completed, failed, and cancelled task metadata so work can be restored and managed.
- **API keys and settings**: Your AI provider credentials, model choices, favorite models, custom instructions, response language, and other preferences (research depth, pages read per topic, chat context, history settings), stored in Chrome local storage. Chrome does not encrypt this storage, so anyone who can use your Chrome profile on your computer could read your keys; remove them in Settings (or uninstall the extension) if you no longer want them there.
- **Rating reminder**: How many summaries have completed (counted up to 5) and when the one-time "Enjoying Forumind?" card was shown or closed, stored in Chrome local storage so the card appears only once. It never leaves your browser.
- **Model lists**: The list of models your provider offers, kept for about 10 minutes in Chrome session storage (cleared when the browser closes) so the model field doesn't ask again on every keystroke. It is stored under a one-way hash of your key, never the key itself.

### What the extension fetches from a site
Only from sites you enabled, and only the site of the current page or task. Text the agent reads is sent to your AI provider as part of the conversation, like a summary is.

**Discourse forums**
- Topic metadata (`/t/{id}.json`) and raw topic markdown (`/raw/{id}`)
- Search results (`/search.json`) and the latest topics (`/latest.json`), for **Ask the forum** only

**WordPress sites** (the public REST API, `/wp-json/wp/v2/`)
- The post you are reading (`/posts/{id}` or `/pages/{id}`) and its comments (`/comments?post={id}`)
- Post and comment search, categories and the newest posts (`/posts`, `/comments`, `/categories`), for **Ask the forum** only

**Reddit** (`www.reddit.com`, with your signed-in session)
- The post you are reading with its comments (`/comments/{id}.json`), and comments hidden behind "more replies" (`/api/morechildren.json`)
- Search results within a subreddit (`/svc/shreddit/r/{subreddit}/search/`) and a subreddit's newest posts (`/r/{subreddit}/new.json`), for **Ask the forum** only

### What the extension does NOT collect
- **Personal information**: No names, email addresses, or other personal identifiers are collected by the developer.
- **Browsing history**: The extension does not record or transmit the sites you visit. It has no access to sites you have not enabled (it does not request the "tabs" permission).
- **Analytics**: No usage statistics or telemetry.
- **Accounts**: No user accounts are required or maintained.

## Data Storage and Security

- Settings and API keys are stored locally using Chrome's storage API.
- Saved sessions, summaries, chat, Agent activity, and task status are stored locally in extension-owned IndexedDB.
- API keys are never written into saved task records.
- Nothing is transmitted to the developer's servers — there are none.

### AI Provider Communication
- When you run a summary, chat, or Agent task, the relevant forum content and your question are sent directly from your browser to your chosen AI provider (OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, xAI, DeepSeek, or a local Ollama / LM Studio server).
- When you enter a key (or a local server address) in setup or Settings, the extension asks that same provider for its list of available models, sending your key only to that provider. No forum content is sent with this request.
- Please review your provider's privacy policy, for example:
  - [OpenRouter Privacy Policy](https://openrouter.ai/privacy)
  - [OpenAI Privacy Policy](https://openai.com/privacy/)
  - [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
  - [Groq Privacy Policy](https://groq.com/privacy-policy/)
  - [Google Privacy Policy](https://policies.google.com/privacy)
  - [xAI Privacy Policy](https://x.ai/legal/privacy-policy)
  - [DeepSeek Privacy Policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html)
- With a local provider (Ollama or LM Studio) on your own computer, content does not leave it. If you enter the address of a server on another computer, content goes to that server.

## Data Retention

- Settings and API keys remain until you clear them, reset settings, or uninstall the extension.
- Up to the 40 most recently updated topic summaries and their cached forum pages are retained locally (10–200, set under **Settings → History & privacy**; kept topics are never removed).
- Chat history and Agent answers you haven't kept are removed 1 day after their latest activity by default (3, 7 or 30 days, or no time limit, under **Settings → History & privacy**); the summary remains available and kept items never expire.
- Completed, failed, and cancelled task records follow the same setting, for at most 7 days.
- You can delete individual saved summaries from **Activity**.
- Uninstalling the extension removes its local storage and IndexedDB data.

## Your Controls

You can:
- View and change all settings, including the response language, on the settings page
- Delete API keys and reset all settings at any time
- Delete saved topic sessions individually
- Cancel queued or running tasks
- Choose which AI provider (including local ones) receives content
- Allow forums one at a time, and remove a forum's access at any time under **Settings → Forum access** (or in Chrome's extension details)
- Uninstall the extension to remove all data

## Third-Party Services

### Discourse forums, WordPress sites and Reddit
- Content is read from the site you are viewing, subject to that site's own terms and privacy policy (for Reddit, [Reddit's User Agreement](https://redditinc.com/policies/user-agreement) and [Privacy Policy](https://www.reddit.com/policies/privacy-policy)).
- Requests carry your existing session for that site, exactly as your browser would when you view the pages yourself, so the site can see these requests in its logs like any other visit.
- Site content is cached only in your browser.

### AI providers
- Each provider has its own privacy policy and data handling practices. Review them before use.

## Changes to This Policy

- This policy may be updated as the extension changes; the "Last Updated" date reflects the latest revision.

## Contact

For questions about this policy or data handling, open an issue on the project's GitHub repository.

## Summary

**In simple terms**: Forumind only works on the Discourse forums, WordPress sites and Reddit that you enable, reads posts and comments from the site you are on using your own session, stores everything locally, and sends forum content only to the AI provider you choose. It collects no personal data and does no tracking.
