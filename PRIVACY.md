# Privacy Policy for DiscourseCopilot

**Last Updated:** September 22, 2026

## Overview

DiscourseCopilot is a browser extension that summarizes and answers questions about discussions on Discourse forums you visit, using an AI provider you configure. It works on any Discourse forum (for example community.openai.com or meta.discourse.org). This policy explains what data the extension handles and where it goes.

## Why the extension requests access to all sites

Discourse forums are hosted on arbitrary domains, so the extension cannot list them in advance. It therefore requests host access to all sites (`<all_urls>`). This access is used narrowly:

- **Content script activation**: On each page, the content script only checks whether the page identifies itself as a Discourse forum (the `generator` meta tag, the `discourse-base-uri` meta tag, or Discourse's setup element). On pages that are not Discourse, it does nothing further: it adds no UI, reads no page content, and sends nothing anywhere.
- **Forum requests**: Requests to a forum go only to the forum of the current page, or to the forum an Agent task was started on. They use your existing browser session for that forum only (so login-required forums work when you are logged in). The extension never sends requests to other sites on your behalf.
- **AI requests**: Forum content is sent only to the AI provider you configured in settings.

## Data Collection and Usage

### What the extension stores (locally, on your device)
- **Forum content and summaries**: Topic pages you choose to summarize and the resulting summaries, saved in extension-owned IndexedDB so you can return to them. Saved sessions are keyed by forum and topic, so different forums are kept separate.
- **Follow-up chat and Agent answers**: Recent questions, answers, search queries, and source references.
- **Task status**: Queued, running, completed, failed, and cancelled task metadata so work can be restored and managed.
- **API keys and settings**: Your AI provider credentials, model choices, custom system prompt, response language, and other preferences, stored in Chrome local storage.

### What the extension fetches from a forum
Only from the forum of the current page or task:
- Topic metadata (`/t/{id}.json`)
- Raw topic markdown (`/raw/{id}`)
- Search results (`/search.json`), for **Ask the forum** only

### What the extension does NOT collect
- **Personal information**: No names, email addresses, or other personal identifiers are collected by the developer.
- **Browsing history**: The extension does not record or transmit the sites you visit. Non-Discourse pages are ignored.
- **Analytics**: No usage statistics or telemetry.
- **Accounts**: No user accounts are required or maintained.

## Data Storage and Security

- Settings and API keys are stored locally using Chrome's storage API.
- Saved sessions, summaries, chat, Agent activity, and task status are stored locally in extension-owned IndexedDB.
- API keys are never written into saved task records.
- Nothing is transmitted to the developer's servers — there are none.

### AI Provider Communication
- When you run a summary, chat, or Agent task, the relevant forum content and your question are sent directly from your browser to your chosen AI provider (OpenRouter, OpenAI, Anthropic, Groq, Google Gemini, xAI, DeepSeek, or a local Ollama / LM Studio server).
- Please review your provider's privacy policy, for example:
  - [OpenRouter Privacy Policy](https://openrouter.ai/privacy)
  - [OpenAI Privacy Policy](https://openai.com/privacy/)
  - [Anthropic Privacy Policy](https://www.anthropic.com/privacy)
  - [Groq Privacy Policy](https://groq.com/privacy-policy/)
  - [Google Privacy Policy](https://policies.google.com/privacy)
- With a local provider (Ollama or LM Studio), content stays on your machine.

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
- Uninstall the extension to remove all data

## Third-Party Services

### Discourse forums
- Content is read from the forum you are viewing, subject to that forum's own terms and privacy policy.
- Requests carry your existing session for that forum, exactly as your browser would when you view the pages yourself.
- Forum content is cached only in your browser.

### AI providers
- Each provider has its own privacy policy and data handling practices. Review them before use.

## Changes to This Policy

- This policy may be updated as the extension changes; the "Last Updated" date reflects the latest revision.

## Contact

For questions about this policy or data handling, open an issue on the project's GitHub repository.

## Summary

**In simple terms**: DiscourseCopilot only activates on Discourse forums, reads topics from the forum you are on using your own session, stores everything locally, and sends forum content only to the AI provider you choose. It collects no personal data and does no tracking.
