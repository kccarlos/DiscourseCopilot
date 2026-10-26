<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark/discoursecopilot-wordmark-horizontal-on-dark.svg">
    <img src="assets/brand/wordmark/discoursecopilot-wordmark-horizontal-on-light.svg" alt="DiscourseCopilot" width="440">
  </picture>
</h1>

<h3 align="center">Catch up on any Discourse forum in seconds.</h3>

<p align="center"><b>English</b> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a></p>

<p align="center">
  Summarize long topics, ask follow-up questions, and let AI search the whole forum for you, with links to the posts it used.
</p>

<p align="center">
  <a href="https://github.com/kccarlos/DiscourseCopilot/releases/latest"><img src="https://img.shields.io/github/v/release/kccarlos/DiscourseCopilot?label=release&logo=github" alt="Latest GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white" alt="Chrome extension, Manifest V3">
  <a href="https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac"><img src="https://img.shields.io/chrome-web-store/users/dpngnaiiofobfjleabbhnfmdflddnhac?label=Chrome%20users&logo=googlechrome&logoColor=white" alt="Chrome Web Store users"></a>
  <a href="https://linux.do/t/topic/3078486"><img src="https://img.shields.io/badge/LinuxDO-community-FFB003?logo=discourse&logoColor=white" alt="LinuxDO community"></a>
  <a href="https://github.com/kccarlos/DiscourseCopilot/stargazers"><img src="https://img.shields.io/github/stars/kccarlos/DiscourseCopilot?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac"><img src="docs/badges/chrome-web-store.png" height="56" alt="Available in the Chrome Web Store"></a>
  &nbsp;
  <a href="https://microsoftedge.microsoft.com/addons/detail/cjbpgigbkfdcgdmlpifklpoklpnbkhmp"><img src="docs/badges/microsoft-edge-add-ons.png" height="56" alt="Get it from Microsoft Edge"></a>
</p>

<p align="center">
  <a href="https://github.com/kccarlos/DiscourseCopilot"><b>⭐ Star on GitHub</b></a>
  to follow new releases. It is free, and it helps other forum readers find DiscourseCopilot.
</p>

![DiscourseCopilot in action: summarizing a Discourse topic, asking a follow-up, and asking the whole forum for an answer with sources](docs/screenshots/demo.gif)

DiscourseCopilot is a free, open-source Chrome extension. It opens in your browser's side panel next to a forum built on Discourse and reads it with your own login. You bring your own AI (a provider's API key, or a model on your own computer), and **it has no servers, accounts, or analytics of its own**.

## Works with

Any forum built on [Discourse](https://www.discourse.org), on any domain, including private and login-only communities. Some well-known Discourse forums it works with:

[Discourse Meta](https://meta.discourse.org), [OpenAI Developer Community](https://community.openai.com), [Cursor Forum](https://forum.cursor.com), [Hugging Face Forums](https://discuss.huggingface.co), [PyTorch Forums](https://discuss.pytorch.org), [Python Discourse](https://discuss.python.org), [Rust Users Forum](https://users.rust-lang.org), [Swift Forums](https://forums.swift.org), [Julia Discourse](https://discourse.julialang.org), [Obsidian Forum](https://forum.obsidian.md), [Home Assistant Community](https://community.home-assistant.io), [Docker Community Forums](https://forums.docker.com), [Let's Encrypt Community](https://community.letsencrypt.org), [freeCodeCamp Forum](https://forum.freecodecamp.org), [Godot Forum](https://forum.godotengine.org), [Unity Discussions](https://discussions.unity.com), [Elastic Discuss](https://discuss.elastic.co), [n8n Community](https://community.n8n.io), [Fly.io Community](https://community.fly.io), [Level1Techs Forums](https://forum.level1techs.com), [Ethereum Research](https://ethresear.ch), [US Card Forum (美卡论坛)](https://www.uscardforum.com), [LINUX DO](https://linux.do), and thousands more.

Not sure whether a forum runs Discourse? Open it and click the DiscourseCopilot icon: the side panel tells you. These forums are listed only as examples; DiscourseCopilot is not affiliated with them. Each forum's own rules still apply, and a forum with strict bot checks can block some requests (see the [FAQ](docs/faq.md#does-it-work-on-every-discourse-forum-including-ones-where-i-have-to-log-in)).

## Why you'll like it

- **Skip the scroll.** Get the main points of a 500-reply topic without reading every post.
- **Ask about the whole thread.** Every reply goes into the conversation, not just a few search hits, so you can ask "What did people decide?" or "Which reply mentioned a workaround?" and get an answer that tells you which post said it.
- **Search the whole forum.** Ask a question and an agent searches and reads the forum for you, step by step, then answers with numbered sources you can click.
- **Sees what you can see.** It reads with your forum login, so topics only signed-in members can open are included: posts that search engines and public AI tools never see.
- **Gentle on the forum.** Summaries and chats are saved per topic; when a topic gets new replies, only the new ones are read.
- **Keep browsing.** Work runs in the background; switch topics and come back to the result.
- **Use the AI you like.** OpenAI, Anthropic (Claude), Google Gemini, and more, or a free model on your own computer. Hit a rate limit? Switch models in one click.
- **In your language.** English, Simplified Chinese and Traditional Chinese, following your browser's language.

## What you can do

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/feature-summary-chat.png" alt="A topic summary, with a follow-up question typed in the question box below it">
      <p><strong>Summaries and chat</strong><br>
      See the original post, how people responded, and the key takeaways, even on huge topics (every page is read unless you set a limit, so very long topics take longer and use more of your provider's tokens). Then ask follow-up questions.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/feature-agent-answer.png" alt="An answer from Ask the forum with numbered sources">
      <p><strong>Ask the forum</strong><br>
      Ask a question and the agent searches the forum, reads the best matches while you watch each step, and answers with sources like [S1] that link to the posts. Ask a follow-up right under the answer.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/feature-activity.png" alt="The Activity screen with saved summaries and answers grouped by forum">
      <p><strong>Activity, grouped by forum</strong><br>
      Find your saved summaries, chats, and answers, sorted by forum so different communities never mix. Keep the ones you want to hold on to.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/feature-setup.png" alt="The first-time setup card for connecting an AI provider">
      <p><strong>Quick setup</strong><br>
      Pick a provider, paste a key, and click <strong>Test &amp; save</strong>. The side panel tells you right away if something needs fixing.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/screenshots/feature-dark-mode.png" alt="The side panel in dark mode">
      <p><strong>Dark mode</strong><br>
      Follows your computer's light or dark theme automatically.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/screenshots/feature-settings.png" alt="Settings for research depth, reading topics, and history">
      <p><strong>Settings you control</strong><br>
      Choose how deep the forum search goes, how much of a long topic is read, and how long your history is kept.</p>
    </td>
  </tr>
</table>

## Get started in 3 steps

**1. Install the extension.**
Open [DiscourseCopilot in the Chrome Web Store](https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac) and click **Add to Chrome**, or [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/cjbpgigbkfdcgdmlpifklpoklpnbkhmp) in Microsoft Edge. Pin **DiscourseCopilot** from the puzzle-piece icon in the toolbar. (Store versions arrive after review; for the newest one right away, [install from GitHub](docs/guide.md#install-the-newest-version-from-github).)

**2. Connect an AI provider.**
Click the DiscourseCopilot icon to open the side panel, pick a provider, paste your API key, and click **Test & save**; a fast, low-cost model is picked for you. **No API key?** [Google AI Studio](https://aistudio.google.com/apikey) gives you a free Gemini key in a minute. See [Choosing an AI provider](docs/guide.md#choosing-an-ai-provider).

**3. Open a forum topic, allow access, then Create summary.**
Open any Discourse topic (log in first if the forum needs it) and click the DiscourseCopilot icon. The first time, click **Allow access** and choose **Allow** when Chrome asks; each forum asks only once. Then click **Create summary**, and ask follow-ups in the box at the bottom.

<img src="docs/screenshots/feature-allow-access.png" alt="The side panel asking to allow DiscourseCopilot on a forum, with three short steps and an Allow access button" width="420">

## Privacy first

- **No analytics, no tracking, no accounts, no DiscourseCopilot servers.** Nothing is sent to the developer, because there is nowhere to send it.
- **Your data stays in your browser.** Settings, API keys, and your saved summaries, chats, and answers are stored on your computer only.
- **Only two kinds of network calls:** the forums you allow (one forum at a time, with your login there), and the AI provider you choose, with your own key. **With a local model (Ollama or LM Studio), nothing leaves your computer.**

The details are in [Privacy in plain words](docs/guide.md#privacy-in-plain-words) and the [privacy policy](PRIVACY.md). The code is open, so you can check all of this yourself.

## Learn more

- [Guide](docs/guide.md): the side panel, Ask the forum, AI providers and Ollama, every setting
- [FAQ](docs/faq.md): login-only forums, rate limits, "Page not checked yet", undo, costs, and more

## For developers

- Building, testing, and how the code is organized: [DEVELOPMENT.md](DEVELOPMENT.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Reporting a security issue: [SECURITY.md](SECURITY.md)
- What changed in each version: [CHANGELOG.md](CHANGELOG.md)

## License

Apache License 2.0. See [LICENSE](LICENSE). Made by [kccarlos](https://github.com/kccarlos).

If DiscourseCopilot saves you time, a [⭐ star on GitHub](https://github.com/kccarlos/DiscourseCopilot) is a friendly way to say thanks. It helps other forum readers find the extension.
