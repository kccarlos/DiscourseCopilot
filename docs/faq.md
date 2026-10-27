# Forumind FAQ

**English** · [简体中文](zh-CN/faq.md) · [繁體中文](zh-TW/faq.md)

Back to the [README](../README.md) · How everything works: the [guide](guide.md).

### Does it work on every Discourse forum, including ones where I have to log in?
It works on Discourse forums in general, but a forum's own settings still apply. Forumind reads a forum the same way your browser does, using your login, so if you're logged in it can read what you can read. Some forums restrict search or reading for certain users, limit how fast they can be read, or show a check that automated requests can't pass; there, a summary or answer can be incomplete or fail. If the forum asks you to log in or pass a check, do that on the forum in a normal tab. For **Ask the forum**, the search pauses and waits: click **Continue** when you're done. For a summary, just click **Create summary** again.

### Why does it ask for permission per forum?
Discourse forums live on thousands of different websites, so Forumind can't know them in advance. Instead of asking to "read and change all your data on all websites" when you install it, it asks for one forum at a time, the first time you use that forum. That access lets it read topics and search the forum in the background (even after you switch tabs) using your login there. You can see and remove every forum you allowed in **Settings → Forum access**; removing access doesn't delete your saved summaries or answers.

### The side panel says "Page not checked yet".
Chrome only lets Forumind see forums you've allowed or pages where you clicked its icon. Click the Forumind icon in the toolbar and the side panel checks the page. If it's a Discourse forum, you'll see **Allow Forumind on *forum name***: click **Allow access** and choose **Allow** in Chrome's prompt. Tip: pin Forumind from the puzzle-piece menu so the icon is always there.

### I updated from an older version and the forum asks again.
Version 2.1 switched from access to every website to access per forum, so forums you used before need one click on **Allow access**. Your saved summaries and answers are still there.

### I see a "rate limit" message. What now?
There are two kinds. If the *forum* asks Forumind to slow down, the side panel shows "Forum asked us to slow down" and tries again on its own after a short wait, so you don't need to do anything. If your *AI provider* is limiting you, wait a minute and try again, and check your plan and usage with your provider. If a free tier keeps hitting its limit, switch to another model in the question box at the bottom of the side panel (save a few in **Settings → Favorite models**).

### "Ask the forum" is greyed out, or the side panel doesn't recognize the forum.
Click the Forumind icon in the toolbar while the forum is open, and click **Allow access** if the side panel asks (then choose **Allow** in Chrome's prompt). Also make sure you're on a Discourse forum (many say "Powered by Discourse" at the bottom). If you allowed access from the **Is this a Discourse forum?** card on a site that isn't one, remove it in **Settings → Forum access**.

### My summary says "Page limit reached" or "first 1,999 of 2,430 replies".
You've set a limit on **Pages read per topic**, so a longer topic is summarized from its first pages. To include more, choose **Read every page** (or a higher limit) in Settings, then click **Check for new replies**. It will take longer and cost a bit more. By default there is no limit. On the rare forum that doesn't report a topic's length, reading stops after 100 pages (10,000 posts) as a safety net.

### How do I hide the Forumind button on forum pages?
Open Settings, scroll to **Forum access**, and turn off **Show the Forumind button on forum pages**, then click **Save Settings**. The button goes away on open forum tabs right away. The toolbar icon still opens the side panel.

### Ollama says "refused the connection (403)".
Forumind removes the `Origin` header from its own requests to `localhost`, `127.0.0.1` and any local server address you allowed, which is what lets a default Ollama install accept it. Web pages are not affected, so Ollama still refuses them. If you still see a 403, update Ollama and reload the extension; as a fallback, start Ollama with `OLLAMA_ORIGINS=chrome-extension://*`.

### What gets sent, and to whom?
Only the forum content needed for your request and your question, sent to the AI provider you set up (or to your local model server). Nothing is sent to us. The forum sees requests for its topic and search data, made from your browser with your login, the same kind your browser makes when you read it, so forum admins may see them in their logs. See [Privacy in plain words](guide.md#privacy-in-plain-words) and the [privacy policy](../PRIVACY.md).

### Why is the Chrome Web Store version older than the latest GitHub Release?
Every new version goes through the store's review (Google's, or Microsoft's for Edge Add-ons) before the store offers it. That can take from a few hours to several days, so the store may lag behind GitHub. Once approved, Chrome updates the extension for you. To get a release right away, install its zip from the [Releases page](https://github.com/kccarlos/DiscourseCopilot/releases/latest) (see the [guide](guide.md#install-the-newest-version-from-github)), and switch back to the store version later if you like.

### Does it cost anything?
The extension is free. Your AI provider may charge for usage, usually a small amount per summary. Local models (Ollama, LM Studio) cost nothing to use.

### I deleted something by mistake.
Click **Undo** in the message at the bottom of the side panel (or press Ctrl+Z, ⌘Z on a Mac, when you're not typing in a text box) within 8 seconds. After that, or once you close the side panel, the delete is final.

### How do I keep an answer or a conversation?
Click **Keep** on it. Kept items never expire. You can also make history last longer in Settings.

### Something went wrong with my API key.
Open Settings, check the key and model, and click **Test Connection**. Also check that your provider account has credit.
