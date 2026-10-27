# Forumind guide

**English** · [简体中文](zh-CN/guide.md) · [繁體中文](zh-TW/guide.md)

The details behind the [README](../README.md): installing from GitHub, Ask the forum, choosing an AI provider, every setting, and privacy in full. Questions and fixes are in the [FAQ](faq.md).

- [Install the newest version from GitHub](#install-the-newest-version-from-github)
- [The side panel](#the-side-panel)
- [Using Ask the forum](#using-ask-the-forum)
- [Choosing an AI provider](#choosing-an-ai-provider)
- [Customize](#customize)
- [Privacy in plain words](#privacy-in-plain-words)

## Install the newest version from GitHub

New versions reach the Chrome Web Store and Edge Add-ons only after Google and Microsoft review them, which can take anywhere from a few hours to several days. So the store can be a little behind the newest [GitHub Release](https://github.com/kccarlos/DiscourseCopilot/releases/latest). To get it right away:

1. Go to the [Releases page](https://github.com/kccarlos/DiscourseCopilot/releases) and download the zip attached to the latest release.
2. Unzip it.
3. Open `chrome://extensions` in Chrome (`edge://extensions` in Edge) and turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped folder.
5. Click the puzzle-piece icon in the toolbar and pin **Forumind**.

An unpacked install is not updated automatically. To update it, download the new zip, replace the files in that folder, and click the reload icon on the extension's card in `chrome://extensions`. Chrome may show a "Developer mode" reminder when it starts; that is normal for extensions installed this way. You can switch back to the store version later: the browser keeps it up to date once a release is approved.

## The side panel

- **Create summary** reads the whole topic, every page unless you set a limit, and writes the original post, how people responded, and the key takeaways. Later, **Check for new replies** reads only the replies posted since, so the forum isn't read twice.
- **Questions go in one box at the bottom.** Choose **This post** to ask about the topic: every reply is in the context, so the answer can tell you which reply said it. Choose **Whole forum** to [ask the forum](#using-ask-the-forum).
- **Switch models in the same box.** It shows the AI provider and model in use; save favorite models in Settings to switch between them there (handy when a free tier is rate-limited).
- **Everything runs in the background.** Start a summary or a question, keep reading other topics, and come back to the result.
- **Activity** (the clock icon) lists running tasks and your saved summaries, chats and answers, grouped by forum. Click a row to open it; **Keep** stops it from expiring.

## Using Ask the forum

1. Open a forum page and click **Ask the forum** (or pick **Whole forum** in the question box), then type what you want to know ("What are people saying about X?", "What's new this week?").
2. The side panel shows the agent's steps as it works: what it searched for, which topics it read, with how many posts. Open a step to see why it did it and what came back. **Stop** ends the run.
3. The answer appears with numbered sources like [S1]. Click one to jump to its source card, which links to the topic.
4. Ask a **follow-up** under the answer. It continues the same conversation, on the same forum, with a fresh budget.

The agent reads the forum with your login, so it can also find topics that only signed-in members (or members of a certain trust level) can see. It only reads: its tools can search, list, and read topics, and check your saved summaries, and none of them can post or change anything on the forum. Forum text is passed to the model as material to quote, with instructions not to follow commands found in it (a model can still be misled by cleverly written text, which is why the agent has no tools that write). Because the agent asks your AI model for one action at a time in a fixed format, a capable model works best; very small local models may struggle to follow it.

## Choosing an AI provider

Forumind doesn't come with its own AI. You connect one you already use, or sign up for one.

| Provider | What you need | Good to know |
| --- | --- | --- |
| OpenRouter | An API key | One key gives you many different models |
| OpenAI | An API key | GPT models |
| Anthropic | An API key | Claude models |
| Google Gemini | An API key ([free from Google AI Studio](https://aistudio.google.com/apikey), with usage limits) | Gemini models |
| Groq | An API key | Fast open models |
| xAI | An API key | Grok models |
| DeepSeek | An API key | DeepSeek models |
| Ollama | Ollama installed on your computer | Runs on your computer. No key and no usage bill |
| LM Studio | LM Studio installed on your computer | Runs on your computer. No key and no usage bill |

**Not sure?** If you already pay for one of these, use that one. If you want to try many models with one key, OpenRouter is an easy start. The free Gemini tier has usage limits, and Google may use free-tier prompts to improve its products.

Once you paste a key, the model field lists the models your provider offers today and picks a fast, low-cost one for summaries. You can pick another any time.

<details>
<summary>Using Ollama on your computer</summary>

Start Ollama, then choose **Local (Ollama)** in setup. No Ollama settings are needed: the extension takes care of the browser header that Ollama would otherwise refuse (see the [FAQ](faq.md#ollama-says-refused-the-connection-403)). The address `http://localhost:11434` is filled in for you. LM Studio uses `http://localhost:1234` by default. If the server runs on another computer, enter its address; Chrome asks once for permission to connect to it when you click **Test & save**. If your LM Studio (or other OpenAI-compatible) server requires an API key, enter it under **Settings → AI provider → API Key (optional)**.

</details>

## Customize

Open **Settings** from the side panel; it opens inside the panel, so there is no extra tab to close (the extension's **Options** page in `chrome://extensions` shows the same settings). Most changes apply when you click **Save Settings** (favorites and forum access change right away), and the Ask the forum, Reading topics, and History & privacy sections each have **Restore defaults**.

- **AI provider.** Switch providers, keys, or models. The model list comes from your provider (click **Refresh models** to reload it). Your saved model is never changed for you; if your provider stops offering it, Settings warns you so you can pick another.
- **Favorite models.** Save models to switch between them from the question box in the side panel.
- **Response language.** **Auto (match the discussion)** is the default: summaries follow the discussion's language, and questions are answered in the language you ask in. You can also pick one of 12 languages.
- **Custom instructions.** Your own instructions for summaries, chats, and Ask the forum answers, in place of the built-in ones. Leave it empty to use the defaults.
- **Ask the forum: Research depth.** The agent works in steps (a search, a topic read, a list of latest topics) until it can answer. **Quick** allows up to 6 steps and 3 topics read, **Balanced** (the default) 15 steps and 8 topics, **Thorough** 25 steps and 14 topics, and **Custom** lets you set the steps, the topics read and the characters taken from each read. Each follow-up gets the same budget again. A bigger budget finds more but takes longer and costs more.
- **Reading topics: Pages read per topic.** **Read every page** is the default, however long the topic is. To make very long topics faster and cheaper, choose **Read only the first** and a number of pages (1 to 100; each page is 100 posts). A topic past your limit is summarized from its first pages, and the summary and chat both say so.
- **Reading topics: Chat context.** How much of the topic is sent with each follow-up question: 30,000 characters by default (5,000 to 1,000,000). You can also change this in the side panel.
- **History & privacy: Keep conversations and Agent answers for.** Chats and answers you haven't kept are removed after **1 day** by default. You can choose 3, 7, or 30 days, or **Until I delete them**. Anything you **Keep** stays.
- **History & privacy: Saved topics.** Up to 40 topic summaries are remembered by default (10 to 200). Past that, the oldest ones you haven't kept are removed.
- **Forum access.** Every forum you allowed, with **Remove access**. Your saved summaries and answers stay.
- **Forum access: Show the Forumind button on forum pages.** On by default. Turn it off to hide the floating button on forums; it disappears from open forum tabs as soon as you save, and you can always open the side panel from the toolbar icon.
- **Reset all settings.** Removes every provider, key, model, favorite, custom instructions, and preference after you confirm on the page. Saved summaries and answers are not deleted.

The interface is in English, Simplified Chinese and Traditional Chinese, and follows your browser's language.

## Privacy in plain words

- **Your key and history stay in your browser.** Settings, API keys, summaries, chats, and answers are saved on your computer only (in the extension's own storage). Chrome stores them unencrypted, so anyone who can use your Chrome profile on your computer could read them. Remove them in Settings, or by uninstalling the extension.
- **Forum posts go only to the AI you chose.** When you summarize or ask something, the topic text and your question are sent straight from your browser to your AI provider. Check your provider's privacy policy for what it does with them. With a local model on your own computer, they go nowhere else.
- **No middleman.** There are no Forumind servers, no accounts, and no analytics.
- **It only reads sites you enable.** Chrome gives it access to a Discourse forum, a WordPress site or Reddit only after you click **Allow access** for that site, and you can remove access anytime in Settings. When you click the toolbar icon, it takes a one-time look at that page to see whether it is one of these; that is all it learns about other sites. The side panel also loads the forum icon (`/favicon.ico`) from the forum you are on.

Read the full [privacy policy](../PRIVACY.md).
