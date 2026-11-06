import fs from 'node:fs';

export const SITE_BASE_URL = 'https://kccarlos.github.io/DiscourseCopilot';
export const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac';
export const EDGE_ADDONS_URL = 'https://microsoftedge.microsoft.com/addons/detail/cjbpgigbkfdcgdmlpifklpoklpnbkhmp';
export const GITHUB_REPO_URL = 'https://github.com/kccarlos/DiscourseCopilot';
export const GITHUB_RELEASES_URL = 'https://github.com/kccarlos/DiscourseCopilot/releases/latest';
export const PRIVACY_POLICY_URL = 'https://github.com/kccarlos/DiscourseCopilot/blob/main/PRIVACY.md';
export const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';

export const LOCALES = ['en', 'zh-CN', 'zh-TW'];
export const PAGES = ['overview', 'sites', 'guide', 'faq'];

export const COMMUNITIES = JSON.parse(fs.readFileSync(new URL('./sites.json', import.meta.url), 'utf8'));

export const PAGE_META = {
  overview: {
    slug: '',
    title: {
      en: 'Forumind — Your AI Assistant for the Comment Section (Chrome & Edge)',
      'zh-CN': 'Forumind — 你的评论区 AI 助手（Chrome 与 Edge 浏览器扩展）',
      'zh-TW': 'Forumind — 你的留言區 AI 助手（Chrome 與 Edge 瀏覽器擴充功能）'
    },
    description: {
      en: 'Free, open-source browser side-panel extension to summarize long threads, ask follow-up questions with #post citations, and search communities with AI. Works on Reddit, US Card Forum, Doctor of Credit, US Credit Card Guide, LINUX DO, OpenAI, Cursor & more.',
      'zh-CN':
        '免费开源的浏览器侧边栏扩展：一键爬楼总结几百楼长帖、带 #楼层号 追问细节、全站 AI 搜索。支持美卡论坛 (US Card Forum)、Doctor of Credit (DoC)、美卡指南、Reddit、LINUX DO、水源社区、OpenAI、Cursor 等社区与博客评论区。',
      'zh-TW':
        '免費開源的瀏覽器側邊欄擴充功能：一鍵爬文摘要數百樓長文、帶 #樓層號 追問細節、全站 AI 搜尋。支援美卡論壇 (US Card Forum)、Doctor of Credit (DoC)、美卡指南、Reddit、LINUX DO、水源社群、OpenAI、Cursor 等社群與部落格留言區。'
    }
  },
  sites: {
    slug: 'sites/',
    title: {
      en: 'Supported Communities & Websites — Forumind (Reddit, Doctor of Credit, US Card Forum, LINUX DO)',
      'zh-CN': '支持的网站与社区名录 — Forumind（美卡论坛 / DoC / 美卡指南 / Reddit / LINUX DO）',
      'zh-TW': '支援的網站與社群名錄 — Forumind（美卡論壇 / DoC / 美卡指南 / Reddit / LINUX DO）'
    },
    description: {
      en: 'Browse 32+ popular forums, blogs, and subreddits supported by Forumind: US Card Forum, Doctor of Credit (DoC), US Credit Card Guide, Reddit, LINUX DO, SJTU Shuiyuan, OpenAI, Cursor, Hugging Face, Home Assistant, Obsidian, and more.',
      'zh-CN':
        '按你常逛的网站名直接查找 Forumind 支持的 32+ 热门社区：美卡论坛 (US Card Forum)、Doctor of Credit (DoC)、美卡指南、Frequent Miler、Reddit、LINUX DO、上海交大水源社区、OpenAI、Cursor、Home Assistant、Obsidian 等。',
      'zh-TW':
        '按你常逛的網站名稱直接查找 Forumind 支援的 32+ 熱門社群：美卡論壇 (US Card Forum)、Doctor of Credit (DoC)、美卡指南、Frequent Miler、Reddit、LINUX DO、上海交大水源社群、OpenAI、Cursor、Home Assistant、Obsidian 等。'
    }
  },
  guide: {
    slug: 'guide/',
    title: {
      en: 'Setup Guide, AI Providers & Privacy — Forumind',
      'zh-CN': '配置指南、AI 服务商对比与隐私说明 — Forumind',
      'zh-TW': '設定指南、AI 供應商比較與隱私說明 — Forumind'
    },
    description: {
      en: 'How to set up Forumind in 1 minute with a free Google Gemini API key, OpenRouter, OpenAI, Anthropic Claude, DeepSeek, Groq, xAI, local Ollama / LM Studio, or any OpenAI-compatible API endpoint.',
      'zh-CN':
        '一分钟配置 Forumind：免费获取 Google Gemini API 密钥、接入 OpenRouter / OpenAI / Claude / DeepSeek / Groq / xAI、本地 Ollama / LM Studio 或任意 OpenAI 兼容接口。',
      'zh-TW':
        '一分鐘設定 Forumind：免費取得 Google Gemini API 金鑰、串接 OpenRouter / OpenAI / Claude / DeepSeek / Groq / xAI、本機 Ollama / LM Studio 或任意 OpenAI 相容介面。'
    }
  },
  faq: {
    slug: 'faq/',
    title: {
      en: 'Frequently Asked Questions (FAQ) — Forumind',
      'zh-CN': '常见问题与排错解答 (FAQ) — Forumind',
      'zh-TW': '常見問題與排錯解答 (FAQ) — Forumind'
    },
    description: {
      en: 'Troubleshooting and answers for Forumind: supported websites, login-only forums (LINUX DO, campus Discourse, Reddit), Cloudflare verification checks, AI rate limits, and local models.',
      'zh-CN':
        'Forumind 常见问题解答：支持哪些网站、登录私有论坛（LINUX DO、水源社区、Reddit）、Cloudflare 验证拦截、API 限速切换与本地 Ollama 403 排错。',
      'zh-TW':
        'Forumind 常見問題解答：支援哪些網站、登入私有論壇（LINUX DO、水源社群、Reddit）、Cloudflare 驗證攔截、API 限速切換與本機 Ollama 403 除錯。'
    }
  }
};

export const PROVIDERS_DATA = {
  en: [
    [
      'Google Gemini',
      `API key (<a href="${AI_STUDIO_KEY_URL}" target="_blank" rel="noopener noreferrer">free from Google AI Studio</a>)`,
      'Fastest free start (Gemini Flash / Pro)'
    ],
    ['OpenRouter', 'API key', 'One key for 300+ models (Claude, GPT, Gemini, DeepSeek, Llama, Qwen)'],
    ['OpenAI', 'API key', 'Official GPT & o-series models'],
    ['Anthropic Claude', 'API key', 'Official Claude Sonnet, Haiku & Opus models'],
    ['DeepSeek / Groq / xAI Grok', 'API key', 'Built-in presets for DeepSeek, ultra-fast Groq LPU & xAI Grok'],
    ['Ollama (Local)', 'Local server (<code>http://localhost:11434</code>)', '100% local · $0 cost & no API key needed'],
    [
      'LM Studio / Any OpenAI-Compatible API',
      'Server URL + optional Bearer API key',
      'Works with LM Studio, vLLM, llama.cpp, LiteLLM, OneAPI / NewAPI, SiliconFlow, Together AI, Fireworks & any <code>/v1</code> endpoint'
    ]
  ],
  'zh-CN': [
    [
      'Google Gemini',
      `API key（<a href="${AI_STUDIO_KEY_URL}" target="_blank" rel="noopener noreferrer">Google AI Studio 免费领</a>）`,
      '新手首选，一分钟免费拿 key'
    ],
    ['OpenRouter', 'API key', '一把 key 畅用 300+ 模型（Claude、GPT、Gemini、DeepSeek、Qwen 等）'],
    ['OpenAI', 'API key', '官方 GPT 与 o 系列推理模型'],
    ['Anthropic Claude', 'API key', '官方 Claude Sonnet、Haiku 与 Opus 模型'],
    ['DeepSeek / Groq / xAI Grok', 'API key', '内置 DeepSeek、极速 Groq 与 xAI Grok 预设'],
    ['Ollama（本地）', '本机服务（<code>http://localhost:11434</code>）', '100% 本机运行 · 零费用且无需 API key'],
    [
      'LM Studio / 任意 OpenAI 兼容接口',
      '自定义服务地址 + 可选 API key',
      '支持 LM Studio、vLLM、llama.cpp、LiteLLM、OneAPI / NewAPI、硅基流动 (SiliconFlow)、Together AI 等任意兼容 OpenAI <code>/v1</code> 的接口'
    ]
  ],
  'zh-TW': [
    [
      'Google Gemini',
      `API 金鑰（<a href="${AI_STUDIO_KEY_URL}" target="_blank" rel="noopener noreferrer">Google AI Studio 免費領</a>）`,
      '新手首選，一分鐘免費拿金鑰'
    ],
    ['OpenRouter', 'API 金鑰', '一把金鑰暢用 300+ 模型（Claude、GPT、Gemini、DeepSeek、Qwen 等）'],
    ['OpenAI', 'API 金鑰', '官方 GPT 與 o 系列推論模型'],
    ['Anthropic Claude', 'API 金鑰', '官方 Claude Sonnet、Haiku 與 Opus 模型'],
    ['DeepSeek / Groq / xAI Grok', 'API 金鑰', '內建 DeepSeek、極速 Groq 與 xAI Grok 預設'],
    ['Ollama（本機）', '本機服務（<code>http://localhost:11434</code>）', '100% 本機執行 · 零費用且無需 API 金鑰'],
    [
      'LM Studio / 任意 OpenAI 相容介面',
      '自訂伺服器網址 + 可選 API 金鑰',
      '支援 LM Studio、vLLM、llama.cpp、LiteLLM、OneAPI / NewAPI、SiliconFlow、Together AI 等任意相容 OpenAI <code>/v1</code> 的端點'
    ]
  ]
};

export const SIM_CONTENT = {
  summary: {
    en: {
      forum: 'Doctor of Credit · WordPress',
      host: 'www.doctorofcredit.com · 342 comments read',
      topic: 'Chase Sapphire Reserve 75,000 + $300 Travel Credit In-Branch & Online Data Points',
      cardTitle: 'Summary',
      badge: 'Updated · 14 new replies merged',
      bullets: [
        '<strong>Original Post:</strong> Details the elevated 75k UR sign-up bonus and $4,000 spend requirement.',
        '<strong>Reader Data Points (342 comments):</strong> Shared approval odds under 5/24, secure message matching (<span class="cite-pill">#42</span>, <span class="cite-pill">#108</span>), and expedited shipping (<span class="cite-pill">#219</span>).',
        '<strong>Key Takeaway:</strong> Secure message matching succeeded for cards approved within 21 days (<span class="cite-pill">#108</span>, <span class="cite-pill">#284</span>).'
      ],
      composerScope: 'This post · 30k',
      composerModel: 'gemini-2.5-flash ▾',
      composerHint: 'Ask a follow-up question about all 342 comments…'
    },
    'zh-CN': {
      forum: '美卡论坛 US Card Forum · Discourse',
      host: 'www.uscardforum.com · 已读取 342 条回复',
      topic: 'Chase Sapphire Reserve 开卡奖励与近期 Recon / Match DP 汇总讨论',
      cardTitle: '总结 (Summary)',
      badge: '已增量更新 · 合并 14 条新回复',
      bullets: [
        '<strong>主楼内容：</strong>整理了近期 75k 开卡奖励条款与 4,000 美元消费要求。',
        '<strong>坛友回应（共 342 楼）：</strong>集中汇报了 5/24 批卡 DP、发 SM 成功 Match 的时间窗口（<span class="cite-pill">#42</span>、<span class="cite-pill">#108</span>）及加急快递话术（<span class="cite-pill">#219</span>）。',
        '<strong>关键结论：</strong>近 21 天内批卡的坛友发 SM 请求 Match 成功率最高（<span class="cite-pill">#108</span>、<span class="cite-pill">#284</span>）。'
      ],
      composerScope: '此帖子 · 30k',
      composerModel: 'gemini-2.5-flash ▾',
      composerHint: '针对整栋楼 342 条回复继续追问…'
    },
    'zh-TW': {
      forum: '美卡論壇 US Card Forum · Discourse',
      host: 'www.uscardforum.com · 已讀取 342 則回覆',
      topic: 'Chase Sapphire Reserve 開卡獎勵與近期 Recon / Match DP 彙整討論',
      cardTitle: '摘要 (Summary)',
      badge: '已增量更新 · 合併 14 則新回覆',
      bullets: [
        '<strong>原始貼文：</strong>整理了近期 75k 開卡獎勵條款與 4,000 美元消費要求。',
        '<strong>版友回應（共 342 樓）：</strong>集中回報了 5/24 核卡 DP、發 SM 成功 Match 的時間窗口（<span class="cite-pill">#42</span>、<span class="cite-pill">#108</span>）及加急快遞話術（<span class="cite-pill">#219</span>）。',
        '<strong>關鍵結論：</strong>近 21 天內核卡的版友發 SM 請求 Match 成功率最高（<span class="cite-pill">#108</span>、<span class="cite-pill">#284</span>）。'
      ],
      composerScope: '此貼文 · 30k',
      composerModel: 'gemini-2.5-flash ▾',
      composerHint: '針對整串討論 342 則回覆繼續追問…'
    }
  },
  chat: {
    en: {
      forum: 'OpenAI Developer Community · Discourse',
      host: 'community.openai.com · Chat (2 messages)',
      topic: 'Structured Outputs & JSON Schema latency spikes on large schemas',
      cardTitle: 'Ask about this post',
      badge: 'Context: 30,000 chars',
      bullets: [
        '<strong>You asked:</strong> Which reply mentioned a workaround for first-token latency?',
        '<strong>Forumind:</strong> Post <span class="cite-pill">#37</span> and <span class="cite-pill">#64</span> found that flattening recursive <code>anyOf</code> unions into top-level <code>$defs</code> cut first-request latency from ~9s to 680ms. Post <span class="cite-pill">#81</span> confirmed it works on <code>gpt-4.1-mini</code>.'
      ],
      composerScope: 'This post · 30k',
      composerModel: 'claude-sonnet-4 ▾',
      composerHint: 'Press Enter to send · Switch favorite models anytime'
    },
    'zh-CN': {
      forum: 'OpenAI 开发者社区 · Discourse',
      host: 'community.openai.com · 对话 (2 条消息)',
      topic: 'Structured Outputs 在复杂 JSON Schema 下首字延迟升高的问题排查',
      cardTitle: '针对此帖子提问',
      badge: '上下文：30,000 字符',
      bullets: [
        '<strong>你提问：</strong>哪一层楼提到了绕过首次编译延迟的具体办法？',
        '<strong>Forumind：</strong><span class="cite-pill">#37</span> 楼和 <span class="cite-pill">#64</span> 楼指出，把嵌套 <code>anyOf</code> 拆平到顶层 <code>$defs</code> 并预热缓存，可将首字延迟从 9 秒降到 680ms。<span class="cite-pill">#81</span> 楼确认对 <code>gpt-4.1-mini</code> 同样有效。'
      ],
      composerScope: '此帖子 · 30k',
      composerModel: 'claude-sonnet-4 ▾',
      composerHint: '按 Enter 发送 · 输入框底部可一键切换常用模型'
    },
    'zh-TW': {
      forum: 'OpenAI 開發者社群 · Discourse',
      host: 'community.openai.com · 對話 (2 則訊息)',
      topic: 'Structured Outputs 在複雜 JSON Schema 下首字延遲升高的問題排查',
      cardTitle: '針對此貼文提問',
      badge: '上下文：30,000 字元',
      bullets: [
        '<strong>你提問：</strong>哪一樓提到了繞過首次編譯延遲的具體辦法？',
        '<strong>Forumind：</strong><span class="cite-pill">#37</span> 樓和 <span class="cite-pill">#64</span> 樓指出，將巢狀 <code>anyOf</code> 拆平到頂層 <code>$defs</code> 並預熱快取，可將首字延遲從 9 秒降到 680ms。<span class="cite-pill">#81</span> 樓確認對 <code>gpt-4.1-mini</code> 同樣有效。'
      ],
      composerScope: '此貼文 · 30k',
      composerModel: 'claude-sonnet-4 ▾',
      composerHint: '按 Enter 傳送 · 輸入框底部可一鍵切換常用模型'
    }
  },
  agent: {
    en: {
      forum: 'Home Assistant Community · Whole-forum Research',
      host: 'community.home-assistant.io · Balanced depth',
      topic: 'Question: "Which Zigbee coordinator do people recommend in 2026 for ZHA vs Zigbee2MQTT?"',
      cardTitle: 'Ask the forum (Agent Answer)',
      badge: '6 steps · 4 topics read',
      trace: [
        '✓ Searched forum for "best Zigbee coordinator 2026 ZHA Zigbee2MQTT"',
        '✓ Read 4 topics (286 posts total) · Synthesized with citations'
      ],
      bullets: [
        '<strong>SLZB-06 / SLZB-06M (PoE):</strong> Most recommended because Ethernet placement avoids USB 3.0 interference <span class="cite-pill">[S1#14]</span> <span class="cite-pill">[S2#6]</span>.',
        '<strong>Home Assistant Connect ZBT-1:</strong> Preferred for plug-and-play ZHA setups with native firmware updates <span class="cite-pill">[S3#22]</span>.'
      ],
      composerScope: 'Whole forum',
      composerModel: 'deepseek-chat ▾',
      composerHint: 'Ask a follow-up in the same forum research session…'
    },
    'zh-CN': {
      forum: 'Home Assistant 社区 · 全站搜索 (Agent)',
      host: 'community.home-assistant.io · 均衡深度',
      topic: '提问：“2026 年大家最推荐哪款 Zigbee 协调器网关？ZHA 和 Z2M 怎么选？”',
      cardTitle: '全站搜索回答（附带可点击来源）',
      badge: '执行 6 步 · 阅读 4 篇帖子',
      trace: ['✓ 已搜索关键词 "Zigbee coordinator 2026 ZHA Zigbee2MQTT"', '✓ 已阅读 4 个高相关度话题（共 286 楼）并整理来源引用'],
      bullets: [
        '<strong>SLZB-06 / SLZB-06M（PoE 网口版）：</strong>推荐度最高，可远离机柜 USB 3.0 干扰 <span class="cite-pill">[S1#14]</span> <span class="cite-pill">[S2#6]</span>。',
        '<strong>Home Assistant Connect ZBT-1：</strong>ZHA 省心首选，支持在系统界面直接升级固件 <span class="cite-pill">[S3#22]</span>。'
      ],
      composerScope: '整个论坛',
      composerModel: 'deepseek-chat ▾',
      composerHint: '在回答下方可直接继续追问…'
    },
    'zh-TW': {
      forum: 'Home Assistant 社群 · 全站搜尋 (Agent)',
      host: 'community.home-assistant.io · 均衡深度',
      topic: '提問：「2026 年大家最推薦哪款 Zigbee 協調器閘道？ZHA 和 Z2M 怎麼選？」',
      cardTitle: '全站搜尋回答（附帶可點擊來源）',
      badge: '執行 6 步 · 閱讀 4 篇貼文',
      trace: ['✓ 已搜尋關鍵字 "Zigbee coordinator 2026 ZHA Zigbee2MQTT"', '✓ 已閱讀 4 個高相關度主題（共 286 樓）並整理來源引用'],
      bullets: [
        '<strong>SLZB-06 / SLZB-06M（PoE 網路孔版）：</strong>推薦度最高，可遠離機櫃 USB 3.0 干擾 <span class="cite-pill">[S1#14]</span> <span class="cite-pill">[S2#6]</span>。',
        '<strong>Home Assistant Connect ZBT-1：</strong>ZHA 省心首選，支援在系統介面直接更新韌體 <span class="cite-pill">[S3#22]</span>。'
      ],
      composerScope: '整個論壇',
      composerModel: 'deepseek-chat ▾',
      composerHint: '在回答下方可直接繼續追問…'
    }
  }
};

export const FAQ_ITEMS = [
  {
    id: 'faq-supported-sites',
    q: {
      en: 'Which websites and communities does Forumind work on? Do I need to know if a site uses Discourse or WordPress?',
      'zh-CN': 'Forumind 支持哪些网站和社区（如美卡论坛、DoC、美卡指南、Reddit、LINUX DO）？需要知道底层架构吗？',
      'zh-TW': 'Forumind 支援哪些網站和社群（如美卡論壇、DoC、美卡指南、Reddit、LINUX DO）？需要知道底層架構嗎？'
    },
    a: {
      en: 'No—just open the site and click the Forumind icon. It works out of the box on <strong>US Card Forum</strong>, <strong>Doctor of Credit</strong>, <strong>US Credit Card Guide</strong>, <strong>Frequent Miler</strong>, <strong>One Mile at a Time</strong>, <strong>Reddit</strong> (while signed in), <strong>LINUX DO</strong>, <strong>SJTU Shuiyuan</strong>, <strong>9to5Mac / 9to5Google</strong>, and thousands of AI &amp; developer forums (<strong>OpenAI</strong>, <strong>Cursor</strong>, <strong>Hugging Face</strong>, <strong>PyTorch</strong>, <strong>Home Assistant</strong>, <strong>Obsidian</strong>, <strong>Anki</strong>, <strong>NixOS</strong>, <strong>Cloudflare</strong>).',
      'zh-CN':
        '完全不需要。打开常逛的网站点一下 Forumind 图标即可。直接支持：<strong>美卡论坛 (US Card Forum)</strong>、<strong>Doctor of Credit (DoC)</strong>、<strong>美卡指南</strong>、<strong>Frequent Miler</strong>、<strong>OMAAT</strong>；<strong>Reddit</strong> 各大版块（需登录）；<strong>LINUX DO</strong>、<strong>上海交大水源社区</strong>；<strong>9to5Mac / 9to5Google</strong>；以及 <strong>OpenAI</strong>、<strong>Cursor</strong>、<strong>Hugging Face</strong>、<strong>PyTorch</strong>、<strong>Home Assistant</strong>、<strong>Obsidian</strong>、<strong>Anki</strong>、<strong>NixOS</strong>、<strong>Cloudflare</strong> 等成千上万个社区。',
      'zh-TW':
        '完全不需要。開啟常逛的網站點一下 Forumind 圖示即可。直接支援：<strong>美卡論壇 (US Card Forum)</strong>、<strong>Doctor of Credit (DoC)</strong>、<strong>美卡指南</strong>、<strong>Frequent Miler</strong>、<strong>OMAAT</strong>；<strong>Reddit</strong> 各大看板（需登入）；<strong>LINUX DO</strong>、<strong>上海交大水源社群</strong>；<strong>9to5Mac / 9to5Google</strong>；以及 <strong>OpenAI</strong>、<strong>Cursor</strong>、<strong>Hugging Face</strong>、<strong>PyTorch</strong>、<strong>Home Assistant</strong>、<strong>Obsidian</strong>、<strong>Anki</strong>、<strong>NixOS</strong>、<strong>Cloudflare</strong> 等成千上萬個社群。'
    }
  },
  {
    id: 'faq-login-forums',
    q: {
      en: 'Does it work on private forums where I have to log in (like LINUX DO or campus forums)?',
      'zh-CN': '需要登录的私有论坛（如 LINUX DO 或高校水源社区）能用吗？',
      'zh-TW': '需要登入的私有論壇（如 LINUX DO 或大學水源社群）能用嗎？'
    },
    a: {
      en: 'Yes. Forumind reads the community using your existing browser login session, including member-only and trust-level topics. If a login or bot check appears, complete it in a normal tab and click Continue / Create summary.',
      'zh-CN':
        '可以。Forumind 复用你浏览器里的登录态读帖，连仅登录会员或特定信任等级可见的帖子都能读到。若遇到验证提示，在普通标签页完成后点“继续”或重新总结即可。',
      'zh-TW':
        '可以。Forumind 重用你瀏覽器裡的登入態讀文，連僅登入會員或特定信任等級可見的貼文都能讀到。若遇到驗證提示，在一般分頁完成後點「繼續」或重新摘要即可。'
    }
  },
  {
    id: 'faq-cloudflare',
    q: {
      en: 'It says a verification check is needed, but the forum tab looks normal. Why?',
      'zh-CN': '提示需要验证，但我打开网站看起来很正常？',
      'zh-TW': '提示需要驗證，但我開啟網站看起來很正常？'
    },
    a: {
      en: 'Cloudflare sometimes challenges background JSON requests (especially on VPNs). Open <code>https://your-forum-domain/t/1.json</code> in a tab, pass the challenge or switch proxy nodes, and retry.',
      'zh-CN':
        'Cloudflare 有时会单独拦截后台 JSON 请求（挂代理时较常见）。可在浏览器直接打开 <code>https://论坛域名/t/1.json</code> 通过验证或切换节点后再试。',
      'zh-TW':
        'Cloudflare 有時會單獨攔截背景 JSON 請求（掛代理時較常見）。可在瀏覽器直接開啟 <code>https://論壇網域/t/1.json</code> 通過驗證或切換節點後再試。'
    }
  },
  {
    id: 'faq-per-forum-permission',
    q: {
      en: 'Why does it ask for permission per site instead of once on install?',
      'zh-CN': '为什么要按网站逐个授权，而不是安装时一次性授权？',
      'zh-TW': '為什麼要按網站逐一授權，而不是安裝時一次性授權？'
    },
    a: {
      en: 'Instead of asking to read all websites on install, Forumind requests access only to the specific domain you use. You can revoke any site under Settings → Forum access without losing saved summaries.',
      'zh-CN':
        '不在安装时索取“读取所有网站数据”的宽泛权限，而是只对你实际使用的域名按需授权。可在“设置 → 论坛访问”随时移除，不会丢失历史总结。',
      'zh-TW':
        '不在安裝時索取「讀取所有網站資料」的寬泛權限，而是只對你實際使用的網域按需授權。可在「設定 → 論壇存取」隨時移除，不會遺失歷史摘要。'
    }
  },
  {
    id: 'faq-page-not-checked',
    q: {
      en: 'The side panel says "Page not checked yet" or "Ask the forum" is greyed out.',
      'zh-CN': '侧边栏显示“尚未检查此页面”或“全站搜索”是灰色的？',
      'zh-TW': '側邊欄顯示「尚未檢查此頁面」或「全站搜尋」是灰色的？'
    },
    a: {
      en: 'Click the Forumind icon in your browser toolbar on that tab so Chrome grants temporary <code>activeTab</code> access to check the page, then click Allow access if prompted.',
      'zh-CN': '在该页面点一下浏览器工具栏上的 Forumind 图标，让侧边栏检测当前标签页，若弹出提示点“允许访问”即可。',
      'zh-TW': '在該頁面點一下瀏覽器工具列上的 Forumind 圖示，讓側邊欄檢測目前分頁，若彈出提示點「允許存取」即可。'
    }
  },
  {
    id: 'faq-rate-limit',
    q: {
      en: 'I see a "rate limit" message. What should I do?',
      'zh-CN': '看到“rate limit”（限速）提示怎么办？',
      'zh-TW': '看到「rate limit」（限速）提示怎麼辦？'
    },
    a: {
      en: 'If the forum asks to slow down, Forumind waits and retries automatically. If your AI provider hits a rate limit, switch to another saved model in one click from the bottom question box.',
      'zh-CN': '若是论坛限速，扩展会自动等待并重试；若是 AI 服务商免费额度限速，可在底部输入框一键切换到其他常用模型。',
      'zh-TW': '若是論壇限速，擴充功能會自動等待並重試；若是 AI 供應商免費額度限速，可在底部輸入框一鍵切換到其他常用模型。'
    }
  },
  {
    id: 'faq-ollama-403',
    q: {
      en: 'Ollama says "refused the connection (403)".',
      'zh-CN': 'Ollama 报错“拒绝了连接 (403)”怎么办？',
      'zh-TW': 'Ollama 報錯「拒絕了連線 (403)」怎麼辦？'
    },
    a: {
      en: 'If you see a 403 error from a local Ollama server, update Ollama and reload the extension, or start Ollama with <code>OLLAMA_ORIGINS=chrome-extension://*</code>.',
      'zh-CN': '若连接本地 Ollama 报 403，请更新 Ollama 并重载扩展，或使用环境变量 <code>OLLAMA_ORIGINS=chrome-extension://*</code> 启动。',
      'zh-TW':
        '若連線本機 Ollama 報 403，請更新 Ollama 並重載擴充功能，或使用環境變數 <code>OLLAMA_ORIGINS=chrome-extension://*</code> 啟動。'
    }
  },
  {
    id: 'faq-cost-and-undo',
    q: {
      en: 'Does Forumind cost anything? How do I keep or undo deleted items?',
      'zh-CN': 'Forumind 收费吗？怎么长期保留或恢复误删记录？',
      'zh-TW': 'Forumind 收費嗎？怎麼長期保留或恢復誤刪紀錄？'
    },
    a: {
      en: "Forumind is 100% free and open source. Google AI Studio's free Gemini tier and local Ollama/LM Studio models cost $0. Click Keep to pin any item forever, or press Ctrl+Z (⌘Z) within 8s to undo a deletion.",
      'zh-CN': '扩展完全免费开源，配合免费 Gemini key 或本地 Ollama 零花销。点“保留”可永久置顶记录；误删后 8 秒内按 Ctrl+Z（⌘Z）即可撤销。',
      'zh-TW':
        '擴充功能完全免費開源，配合免費 Gemini 金鑰或本機 Ollama 零花銷。點「保留」可永久置頂紀錄；誤刪後 8 秒內按 Ctrl+Z（⌘Z）即可復原。'
    }
  }
];

export const UI_COPY = {
  en: {
    'nav.ariaLabel': 'Primary navigation',
    'nav.langLabel': 'Language',
    'nav.themeLabel': 'Toggle light or dark theme',
    'nav.overview': 'Overview',
    'nav.sites': 'Supported Sites',
    'nav.guide': 'Guide',
    'nav.faq': 'FAQ',
    'hero.tagline': 'Your AI assistant for the comment section',
    'hero.desc':
      'Summarize 500-reply discussions, ask follow-up questions with <code>#post</code> citations, and search the whole community right from your browser side panel.',
    'hero.ctaChrome': 'Add to Chrome',
    'hero.ctaEdge': 'Microsoft Edge',
    'hero.ctaGithub': 'GitHub (Free & Open Source)',
    'trust.1': 'Uses your browser login (reads member-only posts)',
    'trust.2': 'Bring your own AI (Free Gemini, OpenAI, Claude, Local, or any OpenAI-compatible API)',
    'trust.3': 'Zero servers or tracking',
    'feat.sectionLabel': 'Interactive side-panel preview',
    'feat.tablistLabel': 'Feature walkthrough tabs',
    'feat.tab1.title': '1. Summarize',
    'feat.tab1.desc': 'One-click summary of 500+ replies with incremental updates.',
    'feat.tab2.title': '2. Ask this post',
    'feat.tab2.desc': 'Ask across every reply and jump straight to <code>#post</code> numbers.',
    'feat.tab3.title': '3. Ask the forum',
    'feat.tab3.desc': 'AI agent searches topics and answers with <code>[S1#14]</code> citations.',
    'strip.ariaLabel': 'Popular supported communities',
    'strip.label': 'Works where you read:',
    'strip.uscardforum': 'US Card Forum',
    'strip.uscreditcardguide': 'US Credit Card Guide',
    'strip.cta': 'Browse all 32+ supported sites →',
    'qs.ariaLabel': 'Quick start',
    'qs.title': 'Get started in 3 steps',
    'qs.guideLink': 'Setup Guide & AI Providers →',
    'qs.faqLink': 'FAQ →',
    'qs.step1': 'Install from Chrome or Edge Store and pin the icon.',
    'qs.step2': 'Paste an AI key (free Gemini key) or pick local Ollama.',
    'qs.step3': 'Open any supported site, click <strong>Allow access</strong>, and summarize.',
    'sites.eyebrow': 'Search by site name · No platform knowledge needed',
    'sites.title': 'Supported Communities & Websites',
    'sites.lede': 'Click any community below to try Forumind right away, or open any site you read and click the Forumind toolbar icon.',
    'sites.perSiteBadge': 'Per-site permission · You control access',
    'sites.filterAria': 'Filter communities by category',
    'filter.all': 'All (32)',
    'filter.finance': 'Credit Cards & Miles',
    'filter.ai': 'AI & Developers',
    'filter.tech': 'Tech, Linux & Self-Host',
    'filter.wp': 'WordPress Blogs',
    'filter.reddit': 'Reddit',
    'sites.searchPlaceholder': 'Search site or domain (DoC, Reddit, OpenAI)…',
    'sites.searchAria': 'Search supported sites',
    'sites.emptyState':
      'No matching community in this curated list—open any website and click the Forumind toolbar icon to check if it supports Discourse, WordPress comments, or Reddit.',
    'sites.loginBadge': 'Login',
    'uc1.title': 'Credit Cards & Miles',
    'uc1.badge': 'DP Summarizer',
    'uc1.desc': 'Summarize 500-reply approval & retention threads with <code>#post</code> citations.',
    'uc2.title': 'Reddit Megathreads',
    'uc2.badge': 'Signed-in Reddit',
    'uc2.desc': 'Expands collapsed reply trees and searches across any subreddit.',
    'uc3.title': 'Private & Login Forums',
    'uc3.badge': 'Session Reuse',
    'uc3.desc': 'Reads member-only and trust-level topics with your browser session.',
    'uc4.title': 'AI, Dev & Smart Home',
    'uc4.badge': 'Dev & Tech',
    'uc4.desc': 'Find working bug fixes, YAML configs, and hardware picks fast.',
    'plat.discourse.title': 'Discourse Forums',
    'plat.discourse.badge': 'Thousands of sites',
    'plat.discourse.desc': 'Any custom Discourse domain, public or login-only.',
    'plat.wp.title': 'WordPress Blogs',
    'plat.wp.badge': 'Native WP Comments',
    'plat.wp.desc': 'Sites with open REST comments (<code>/wp-json/wp/v2/</code>).',
    'plat.reddit.title': 'Reddit',
    'plat.reddit.badge': 'While signed in',
    'plat.reddit.desc': 'Full nested threads and subreddit search on reddit.com.',
    'sites.howToCheck': '<strong>Not sure if another site works?</strong> Open it and click the Forumind toolbar icon to check instantly.',
    'sites.disclaimer': 'Examples only; Forumind is not affiliated with these sites.',
    'guide.eyebrow': 'Setup & Reference',
    'guide.title': 'Setup Guide, AI Providers & Privacy',
    'guide.lede':
      'Connect any built-in provider, local model, or custom OpenAI-compatible endpoint. Everything runs locally in your browser.',
    'prov.title': 'AI Providers, Local Models & OpenAI-Compatible APIs',
    'prov.freeBadge': 'Get a free Gemini key in 1 min ↗',
    'prov.compatBadge': 'Any OpenAI-Compatible /v1 API',
    'prov.intro':
      'Built-in presets for 9 major providers plus full support for any custom OpenAI-compatible server URL (vLLM, LiteLLM, OneAPI, SiliconFlow, Together AI, etc.).',
    'prov.col1': 'Provider',
    'prov.col2': 'Connection',
    'prov.col3': 'Highlights',
    'inst.title': 'Install Forumind',
    'inst.storeTitle': '1. Official Browser Stores (Recommended)',
    'inst.storeDesc': 'One-click install with automatic background updates.',
    'inst.ghTitle': '2. GitHub Releases (Manual Unpacked)',
    'inst.ghStep1': `Unzip the latest release from <a href="${GITHUB_RELEASES_URL}" target="_blank" rel="noopener noreferrer">GitHub Releases</a>.`,
    'inst.ghStep2': 'Enable <strong>Developer mode</strong> in <code>chrome://extensions</code>.',
    'inst.ghStep3': 'Click <strong>Load unpacked</strong> and select the unzipped folder.',
    'set.title': 'Controls & Customization',
    'set.f1.title': '30 Favorite Models',
    'set.f1.desc': 'Switch models in 1 click from the input bar.',
    'set.f2.title': '3 Research Depths',
    'set.f2.desc': 'Quick (6 steps), Balanced (15), Thorough (25), or Custom.',
    'set.f3.title': 'Topic Page Cap',
    'set.f3.desc': 'Read all pages or cap at 1–100 pages per thread.',
    'set.f4.title': '12 Output Languages',
    'set.f4.desc': 'Auto-match thread language or pin your preferred language.',
    'perm.title': 'Per-Site Permissions',
    'perm.f1.title': 'Zero Install-Time Host Access',
    'perm.f1.desc': 'Never asks to read all websites on install.',
    'perm.f2.title': 'One-Click Tab Check',
    'perm.f2.desc': 'Toolbar icon checks only the active tab (<code>activeTab</code>).',
    'perm.f3.title': 'Revoke Anytime',
    'perm.f3.desc': 'Remove domains in Settings → Forum access; saved history stays.',
    'priv.title': 'Privacy Guarantee',
    'priv.policyLink': 'PRIVACY.md ↗',
    'priv.f1.title': 'Zero Servers or Telemetry',
    'priv.f1.desc': 'No analytics, no tracking, nothing sent to the developer.',
    'priv.f2.title': '100% Local Storage',
    'priv.f2.desc': 'Keys and summaries stay in your browser IndexedDB.',
    'priv.f3.title': 'Direct Requests Only',
    'priv.f3.desc': 'Connects only to the forum you allow and the AI you pick.',
    'faq.eyebrow': 'Troubleshooting & Answers',
    'faq.title': 'Frequently Asked Questions',
    'faq.lede': 'Quick answers on supported sites, login-only forums, Cloudflare checks, rate limits, and local models.',
    'faq.searchPlaceholder': 'Search FAQ…',
    'faq.searchAria': 'Search FAQ',
    'faq.emptyState': 'No matching FAQ item found. Try another keyword or open an issue on GitHub.',
    'footer.copy': 'Free & open-source under Apache License 2.0. Made by kccarlos.',
    'footer.privacy': 'Privacy Policy'
  },
  'zh-CN': {
    'nav.ariaLabel': '主导航',
    'nav.langLabel': '切换语言',
    'nav.themeLabel': '切换浅色或深色主题',
    'nav.overview': '首页概览',
    'nav.sites': '支持的网站',
    'nav.guide': '配置指南',
    'nav.faq': '常见问题',
    'hero.tagline': '你的评论区 AI 助手',
    'hero.desc': '在浏览器侧边栏一键爬楼总结几百楼长帖、带 <code>#楼层号</code> 追问细节，或让 AI 帮你搜遍整个社区。',
    'hero.ctaChrome': '添加至 Chrome',
    'hero.ctaEdge': 'Microsoft Edge',
    'hero.ctaGithub': 'GitHub（免费开源）',
    'trust.1': '复用浏览器登录态（可读会员与等级受限帖）',
    'trust.2': '自带 AI 密钥（支持免费 Gemini、本地 Ollama 及任意 OpenAI 兼容接口）',
    'trust.3': '零服务器 · 零追踪',
    'feat.sectionLabel': '侧边栏交互预览',
    'feat.tablistLabel': '功能演示切换',
    'feat.tab1.title': '1. 一键爬楼总结',
    'feat.tab1.desc': '读完 500+ 楼长帖，后续新回复支持一键增量合并。',
    'feat.tab2.title': '2. 针对本帖追问',
    'feat.tab2.desc': '全楼上下文追问，精准标注 <code>#42</code> 楼层号。',
    'feat.tab3.title': '3. 全站 Agent 搜索',
    'feat.tab3.desc': 'AI 自动检索多篇帖子并附带 <code>[S1#14]</code> 来源链接。',
    'strip.ariaLabel': '热门支持社区',
    'strip.label': '打开这些常逛社区即可直接使用：',
    'strip.uscardforum': '美卡论坛 US Card Forum',
    'strip.uscreditcardguide': '美卡指南',
    'strip.cta': '查看全部 32+ 支持的网站名录 →',
    'qs.ariaLabel': '快速上手',
    'qs.title': '三步快速上手',
    'qs.guideLink': 'AI 服务商与配置指南 →',
    'qs.faqLink': '常见问题 FAQ →',
    'qs.step1': '从 Chrome 或 Edge 商店一键安装并固定图标。',
    'qs.step2': '填入 AI 密钥（免费 Gemini）或选本地 Ollama。',
    'qs.step3': '打开任意支持站点，点 <strong>允许访问</strong> 即可使用。',
    'sites.eyebrow': '直接按你常逛的网站名查找 · 无需关心底层架构',
    'sites.title': '支持哪些网站与社区',
    'sites.lede': '点击下方任意社区即可直接体验；或打开你常逛的网站，点一下浏览器工具栏上的 Forumind 图标。',
    'sites.perSiteBadge': '按网站逐个授权 · 权限完全可控',
    'sites.filterAria': '按分类筛选社区',
    'filter.all': '全部推荐 (32)',
    'filter.finance': '美卡、里程与羊毛',
    'filter.ai': 'AI 与开发者',
    'filter.tech': '技术、Linux 与自托管',
    'filter.wp': 'WordPress 博客',
    'filter.reddit': 'Reddit',
    'sites.searchPlaceholder': '搜索网站名或域名（美卡、DoC、水源、Reddit）…',
    'sites.searchAria': '搜索支持的网站',
    'sites.emptyState': '未在推荐列表中找到对应名称——你可以直接打开该网站并点一下浏览器工具栏上的 Forumind 图标，扩展会自动检测是否支持。',
    'sites.loginBadge': '需登录',
    'uc1.title': '美卡与常旅客（美卡论坛 · DoC · 美卡指南）',
    'uc1.badge': 'DP 汇总',
    'uc1.desc': '一键提炼几百楼申卡 DP、Retention 与报销，精准定位 <code>#楼层</code>。',
    'uc2.title': 'Reddit 长帖与版块（r/churning · r/LocalLLaMA）',
    'uc2.badge': '需登录',
    'uc2.desc': '自动展开折叠评论树，支持在任意 Subreddit 版块内跨帖检索。',
    'uc3.title': '私有与高校社区（LINUX DO · 水源社区）',
    'uc3.badge': '登录态复用',
    'uc3.desc': '携带你的浏览器登录态与信任等级，读取受限长帖与校内讨论。',
    'uc4.title': 'AI 开发与智能家居（OpenAI · Cursor · HA）',
    'uc4.badge': '开发排错',
    'uc4.desc': '在数百楼技术帖中秒找可用 Workaround、YAML 与硬件推荐。',
    'plat.discourse.title': 'Discourse 论坛',
    'plat.discourse.badge': '成千上万个站点',
    'plat.discourse.desc': '支持任意域名 Discourse 社区，含需登录私有站点。',
    'plat.wp.title': 'WordPress 博客',
    'plat.wp.badge': '原生评论 API',
    'plat.wp.desc': '支持开放 REST 评论（<code>/wp-json/wp/v2/</code>）的博客。',
    'plat.reddit.title': 'Reddit 社区',
    'plat.reddit.badge': '登录态支持',
    'plat.reddit.desc': '登录 reddit.com 后可读取全量评论并在版块内搜索。',
    'sites.howToCheck': '<strong>不确定某个网站能不能用？</strong>打开它并点一下工具栏上的 Forumind 图标即可自动检测。',
    'sites.disclaimer': '以上网站仅作举例，Forumind 与它们无任何关联。',
    'guide.eyebrow': '配置指南与参数说明',
    'guide.title': '配置指南、AI 服务商对比与隐私说明',
    'guide.lede': '支持 9 大内置 AI 预设、本地模型及任意 OpenAI 兼容接口，所有数据 100% 保存在本地浏览器。',
    'prov.title': 'AI 服务商、本地模型与 OpenAI 兼容接口',
    'prov.freeBadge': '一分钟免费领 Gemini Key ↗',
    'prov.compatBadge': '支持任意 OpenAI 兼容 /v1 接口',
    'prov.intro':
      '除 9 大内置服务商预设外，还支持填入任意兼容 OpenAI 接口规范的自定义服务地址（如 vLLM、LiteLLM、OneAPI / NewAPI、硅基流动 SiliconFlow、Together AI 等）。',
    'prov.col1': '服务商',
    'prov.col2': '接入方式',
    'prov.col3': '特点说明',
    'inst.title': '安装 Forumind',
    'inst.storeTitle': '1. 官方浏览器商店安装（首选推荐）',
    'inst.storeDesc': '一键安装，自动后台静默更新。',
    'inst.ghTitle': '2. 从 GitHub Releases 手动加载解压包',
    'inst.ghStep1': `从 <a href="${GITHUB_RELEASES_URL}" target="_blank" rel="noopener noreferrer">GitHub Releases</a> 下载最新 zip 并解压。`,
    'inst.ghStep2': '打开 <code>chrome://extensions</code> 并开启 <strong>开发者模式</strong>。',
    'inst.ghStep3': '点击 <strong>加载已解压的扩展程序</strong> 选择解压文件夹。',
    'set.title': '核心功能与控制项',
    'set.f1.title': '30 个常用模型收藏',
    'set.f1.desc': '在底部输入框一键切换不同模型。',
    'set.f2.title': '3 档全站搜索深度',
    'set.f2.desc': '快速（6 步）、均衡（15 步）、深入（25 步）或自定义。',
    'set.f3.title': '单帖页数上限控制',
    'set.f3.desc': '默认读完全楼，或限制 1–100 页（每页 100 楼）。',
    'set.f4.title': '12 种回答语言',
    'set.f4.desc': '默认跟随帖子语言，也可固定中文或英文输出。',
    'perm.title': '按网站逐个授权',
    'perm.f1.title': '安装时零全网权限',
    'perm.f1.desc': '绝不在安装时索取“读取所有网站数据”权限。',
    'perm.f2.title': '点击图标单次检测',
    'perm.f2.desc': '仅通过 <code>activeTab</code> 检测当前标签页。',
    'perm.f3.title': '随时撤销站点授权',
    'perm.f3.desc': '在“设置 → 论坛访问”管理域名，历史总结不丢失。',
    'priv.title': '隐私安全承诺',
    'priv.policyLink': 'PRIVACY.md ↗',
    'priv.f1.title': '零服务器 · 零遥测',
    'priv.f1.desc': '无任何统计埋点，任何数据都不会发给开发者。',
    'priv.f2.title': '100% 本地浏览器存储',
    'priv.f2.desc': 'API 密钥与历史记录仅保存在本机 IndexedDB。',
    'priv.f3.title': '仅两类直连请求',
    'priv.f3.desc': '浏览器仅直连你授权的社区与你选择的 AI 服务商。',
    'faq.eyebrow': '排错与解答',
    'faq.title': '常见问题 (FAQ)',
    'faq.lede': '关于支持网站、登录态、Cloudflare 验证、限速与本地 Ollama 的快速解答。',
    'faq.searchPlaceholder': '搜索常见问题…',
    'faq.searchAria': '搜索常见问题',
    'faq.emptyState': '未找到匹配的常见问题，可换个关键词或在 GitHub 提交 Issue。',
    'footer.copy': '基于 Apache License 2.0 免费开源 · 作者 kccarlos',
    'footer.privacy': '隐私政策'
  },
  'zh-TW': {
    'nav.ariaLabel': '主導覽',
    'nav.langLabel': '切換語言',
    'nav.themeLabel': '切換淺色或深色主題',
    'nav.overview': '首頁概覽',
    'nav.sites': '支援的網站',
    'nav.guide': '設定指南',
    'nav.faq': '常見問題',
    'hero.tagline': '你的留言區 AI 助手',
    'hero.desc': '在瀏覽器側邊欄一鍵爬文摘要數百樓長文、帶 <code>#樓層號</code> 追問細節，或讓 AI 幫你搜遍整個社群。',
    'hero.ctaChrome': '加到 Chrome',
    'hero.ctaEdge': 'Microsoft Edge',
    'hero.ctaGithub': 'GitHub（免費開源）',
    'trust.1': '重用瀏覽器登入態（可讀會員與等級受限貼文）',
    'trust.2': '自備 AI 金鑰（支援免費 Gemini、本機 Ollama 及任意 OpenAI 相容介面）',
    'trust.3': '零伺服器 · 零追蹤',
    'feat.sectionLabel': '側邊欄互動預覽',
    'feat.tablistLabel': '功能示範切換',
    'feat.tab1.title': '1. 一鍵爬文摘要',
    'feat.tab1.desc': '讀完 500+ 樓長文，後續新回覆支援一鍵增量合併。',
    'feat.tab2.title': '2. 針對本篇追問',
    'feat.tab2.desc': '整串上下文追問，精準標註 <code>#42</code> 樓層號。',
    'feat.tab3.title': '3. 全站 Agent 搜尋',
    'feat.tab3.desc': 'AI 自動檢索多篇貼文並附帶 <code>[S1#14]</code> 來源連結。',
    'strip.ariaLabel': '熱門支援社群',
    'strip.label': '開啟這些常逛社群即可直接使用：',
    'strip.uscardforum': '美卡論壇 US Card Forum',
    'strip.uscreditcardguide': '美卡指南',
    'strip.cta': '查看全部 32+ 支援的網站名錄 →',
    'qs.ariaLabel': '快速上手',
    'qs.title': '三步快速上手',
    'qs.guideLink': 'AI 供應商與設定指南 →',
    'qs.faqLink': '常見問題 FAQ →',
    'qs.step1': '從 Chrome 或 Edge 商店一鍵安裝並固定圖示。',
    'qs.step2': '填入 AI 金鑰（免費 Gemini）或選本機 Ollama。',
    'qs.step3': '開啟任意支援網站，點 <strong>允許存取</strong> 即可使用。',
    'sites.eyebrow': '直接按你常逛的網站名稱查找 · 無需關心底層架構',
    'sites.title': '支援哪些網站與社群',
    'sites.lede': '點擊下方任意社群即可直接體驗；或開啟你常逛的網站，點一下瀏覽器工具列上的 Forumind 圖示。',
    'sites.perSiteBadge': '按網站逐一授權 · 權限完全可控',
    'sites.filterAria': '按分類篩選社群',
    'filter.all': '全部推薦 (32)',
    'filter.finance': '美卡、哩程與點數',
    'filter.ai': 'AI 與開發者',
    'filter.tech': '技術、Linux 與自託管',
    'filter.wp': 'WordPress 部落格',
    'filter.reddit': 'Reddit',
    'sites.searchPlaceholder': '搜尋網站名或網域（美卡、DoC、水源、Reddit）…',
    'sites.searchAria': '搜尋支援的網站',
    'sites.emptyState':
      '未在推薦清單中找到對應名稱——你可以直接開啟該網站並點一下瀏覽器工具列上的 Forumind 圖示，擴充功能會自動檢測是否支援。',
    'sites.loginBadge': '需登入',
    'uc1.title': '美卡與常旅客（美卡論壇 · DoC · 美卡指南）',
    'uc1.badge': 'DP 彙整',
    'uc1.desc': '一鍵提煉幾百樓申卡 DP、Retention 與報銷，精準定位 <code>#樓層</code>。',
    'uc2.title': 'Reddit 長文與看板（r/churning · r/LocalLLaMA）',
    'uc2.badge': '需登入',
    'uc2.desc': '自動展開折疊留言樹，支援在任意 Subreddit 看板內跨篇檢索。',
    'uc3.title': '私有與大學社群（LINUX DO · 水源社群）',
    'uc3.badge': '登入態重用',
    'uc3.desc': '攜帶你的瀏覽器登入態與信任等級，讀取受限長文與校內討論。',
    'uc4.title': 'AI 開發與智慧家庭（OpenAI · Cursor · HA）',
    'uc4.badge': '開發除錯',
    'uc4.desc': '在數百樓技術文中秒找可用 Workaround、YAML 與硬體推薦。',
    'plat.discourse.title': 'Discourse 論壇',
    'plat.discourse.badge': '成千上萬個網站',
    'plat.discourse.desc': '支援任意網域 Discourse 社群，含需登入私有網站。',
    'plat.wp.title': 'WordPress 部落格',
    'plat.wp.badge': '原生留言 API',
    'plat.wp.desc': '支援開放 REST 留言（<code>/wp-json/wp/v2/</code>）的部落格。',
    'plat.reddit.title': 'Reddit 社群',
    'plat.reddit.badge': '登入態支援',
    'plat.reddit.desc': '登入 reddit.com 後可讀取全量留言並在看板內搜尋。',
    'sites.howToCheck': '<strong>不確定某個網站能不能用？</strong>開啟它並點一下工具列上的 Forumind 圖示即可自動檢測。',
    'sites.disclaimer': '以上網站僅作舉例，Forumind 與它們無任何關聯。',
    'guide.eyebrow': '設定指南與參數說明',
    'guide.title': '設定指南、AI 供應商比較與隱私說明',
    'guide.lede': '支援 9 大內建 AI 預設、本機模型及任意 OpenAI 相容介面，所有資料 100% 儲存在本機瀏覽器。',
    'prov.title': 'AI 供應商、本機模型與 OpenAI 相容介面',
    'prov.freeBadge': '一分鐘免費領 Gemini 金鑰 ↗',
    'prov.compatBadge': '支援任意 OpenAI 相容 /v1 介面',
    'prov.intro':
      '除 9 大內建供應商預設外，還支援填入任意相容 OpenAI 規範的自訂伺服器網址（如 vLLM、LiteLLM、OneAPI / NewAPI、SiliconFlow、Together AI 等）。',
    'prov.col1': '供應商',
    'prov.col2': '串接方式',
    'prov.col3': '特點說明',
    'inst.title': '安裝 Forumind',
    'inst.storeTitle': '1. 官方瀏覽器商店安裝（首選推薦）',
    'inst.storeDesc': '一鍵安裝，自動背景靜默更新。',
    'inst.ghTitle': '2. 從 GitHub Releases 手動載入未封裝套件',
    'inst.ghStep1': `從 <a href="${GITHUB_RELEASES_URL}" target="_blank" rel="noopener noreferrer">GitHub Releases</a> 下載最新 zip 並解壓縮。`,
    'inst.ghStep2': '開啟 <code>chrome://extensions</code> 並啟用 <strong>開發人員模式</strong>。',
    'inst.ghStep3': '點擊 <strong>載入未封裝項目</strong> 選擇解壓縮資料夾。',
    'set.title': '核心功能與控制項',
    'set.f1.title': '30 個常用模型收藏',
    'set.f1.desc': '在底部輸入框一鍵切換不同模型。',
    'set.f2.title': '3 檔全站搜尋深度',
    'set.f2.desc': '快速（6 步）、均衡（15 步）、深入（25 步）或自訂。',
    'set.f3.title': '單篇頁數上限控制',
    'set.f3.desc': '預設讀完整串，或限制 1–100 頁（每頁 100 樓）。',
    'set.f4.title': '12 種回答語言',
    'set.f4.desc': '預設跟隨貼文語言，也可固定繁中、簡中或英文輸出。',
    'perm.title': '按網站逐一授權',
    'perm.f1.title': '安裝時零全網權限',
    'perm.f1.desc': '絕不在安裝時索取「讀取所有網站資料」權限。',
    'perm.f2.title': '點擊圖示單次檢查',
    'perm.f2.desc': '僅透過 <code>activeTab</code> 檢查目前分頁。',
    'perm.f3.title': '隨時撤銷網站授權',
    'perm.f3.desc': '在「設定 → 論壇存取」管理網域，歷史摘要不遺失。',
    'priv.title': '隱私安全承諾',
    'priv.policyLink': 'PRIVACY.md ↗',
    'priv.f1.title': '零伺服器 · 零遙測',
    'priv.f1.desc': '無任何統計埋點，任何資料都不會發給開發者。',
    'priv.f2.title': '100% 本機瀏覽器儲存',
    'priv.f2.desc': 'API 金鑰與歷史紀錄僅儲存在本機 IndexedDB。',
    'priv.f3.title': '僅兩類直連請求',
    'priv.f3.desc': '瀏覽器僅直連你授權的社群與你選擇的 AI 供應商。',
    'faq.eyebrow': '排錯與解答',
    'faq.title': '常見問題 (FAQ)',
    'faq.lede': '關於支援網站、登入態、Cloudflare 驗證、限速與本機 Ollama 的快速解答。',
    'faq.searchPlaceholder': '搜尋常見問題…',
    'faq.searchAria': '搜尋常見問題',
    'faq.emptyState': '未找到匹配的常見問題，可換個關鍵字或在 GitHub 提交 Issue。',
    'footer.copy': '基於 Apache License 2.0 免費開源 · 作者 kccarlos',
    'footer.privacy': '隱私權政策'
  }
};
