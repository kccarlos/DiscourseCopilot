export const SITE_BASE_URL = 'https://kccarlos.github.io/DiscourseCopilot';
export const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/discoursecopilot/dpngnaiiofobfjleabbhnfmdflddnhac';
export const EDGE_ADDONS_URL = 'https://microsoftedge.microsoft.com/addons/detail/cjbpgigbkfdcgdmlpifklpoklpnbkhmp';
export const GITHUB_REPO_URL = 'https://github.com/kccarlos/DiscourseCopilot';
export const GITHUB_RELEASES_URL = 'https://github.com/kccarlos/DiscourseCopilot/releases/latest';
export const PRIVACY_POLICY_URL = 'https://github.com/kccarlos/DiscourseCopilot/blob/main/PRIVACY.md';
export const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';

export const LOCALES = ['en', 'zh-CN', 'zh-TW'];
export const PAGES = ['overview', 'sites', 'guide', 'faq'];

export const PAGE_META = {
  overview: {
    slug: '',
    title: {
      en: 'Forumind — Your AI Assistant for the Comment Section (Chrome & Edge)',
      'zh-CN': 'Forumind — 你的评论区 AI 助手（Chrome 与 Edge 浏览器扩展）',
      'zh-TW': 'Forumind — 你的留言區 AI 助手（Chrome 與 Edge 瀏覽器擴充功能）'
    },
    description: {
      en: 'Free, open-source browser side-panel extension to summarize long threads, ask follow-up questions with #post citations, and search communities with AI. Works on Reddit, US Card Forum (美卡论坛), Doctor of Credit, 美卡指南, LINUX DO, OpenAI, Cursor & more.',
      'zh-CN':
        '免费开源的浏览器侧边栏扩展：一键爬楼总结几百楼长帖、带 #楼层号 追问细节、全站 AI 搜索。支持美卡论坛 (US Card Forum)、Doctor of Credit (DoC)、美卡指南、Reddit、LINUX DO、水源社区、OpenAI、Cursor 等社区与博客评论区。',
      'zh-TW':
        '免費開源的瀏覽器側邊欄擴充功能：一鍵爬文摘要數百樓長文、帶 #樓層號 追問細節、全站 AI 搜尋。支援美卡論壇 (US Card Forum)、Doctor of Credit (DoC)、美卡指南、Reddit、LINUX DO、水源社群、OpenAI、Cursor 等社群與部落格留言區。'
    }
  },
  sites: {
    slug: 'sites/',
    title: {
      en: 'Supported Communities & Websites — Forumind (Reddit, DoC, 美卡论坛, LINUX DO)',
      'zh-CN': '支持的网站与社区名录 — Forumind（美卡论坛 / DoC / 美卡指南 / Reddit / LINUX DO）',
      'zh-TW': '支援的網站與社群名錄 — Forumind（美卡論壇 / DoC / 美卡指南 / Reddit / LINUX DO）'
    },
    description: {
      en: 'Browse 32+ popular forums, blogs, and subreddits supported by Forumind: US Card Forum (美卡论坛), Doctor of Credit (DoC), US Credit Card Guide (美卡指南), Reddit, LINUX DO, SJTU Shuiyuan, OpenAI, Cursor, Hugging Face, Home Assistant, Obsidian, and more.',
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
      en: 'How to set up Forumind in 1 minute with a free Google Gemini API key, OpenRouter, OpenAI, Anthropic Claude, DeepSeek, or local Ollama / LM Studio models, plus key settings and per-site permissions.',
      'zh-CN':
        '一分钟配置 Forumind：免费获取 Google Gemini API 密钥、接入 OpenRouter / OpenAI / Claude / DeepSeek 或本地 Ollama / LM Studio，以及全站搜索深度与按站点授权说明。',
      'zh-TW':
        '一分鐘設定 Forumind：免費取得 Google Gemini API 金鑰、串接 OpenRouter / OpenAI / Claude / DeepSeek 或本機 Ollama / LM Studio，以及全站搜尋深度與按網站授權說明。'
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
      en: 'Troubleshooting and answers for Forumind: supported websites, login-only forums (LINUX DO, campus Discourse, Reddit), Cloudflare verification checks, AI rate limits, and Ollama 403 fixes.',
      'zh-CN':
        'Forumind 常见问题解答：支持哪些网站、登录私有论坛（LINUX DO、水源社区、Reddit）、Cloudflare 验证拦截、API 限速切换与本地 Ollama 403 排错。',
      'zh-TW':
        'Forumind 常見問題解答：支援哪些網站、登入私有論壇（LINUX DO、水源社群、Reddit）、Cloudflare 驗證攔截、API 限速切換與本機 Ollama 403 除錯。'
    }
  }
};

export const COMMUNITIES = [
  {
    id: 'uscardforum',
    url: 'https://www.uscardforum.com',
    host: 'www.uscardforum.com',
    avatar: '美',
    hue: 225,
    categories: ['finance'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'us card forum 美卡论坛 美卡論壇 uscardforum 信用卡 申卡 dp 羊毛 泥潭 retention',
    name: {
      en: 'US Card Forum (美卡论坛)',
      'zh-CN': '美卡论坛 US Card Forum',
      'zh-TW': '美卡論壇 US Card Forum'
    },
    desc: {
      en: 'Summarize 500-reply credit card DP, retention, and miles threads.',
      'zh-CN': '一键爬楼总结几百楼申卡 DP、开卡奖励、Retention 与里程讨论。',
      'zh-TW': '一鍵爬文摘要數百樓申卡 DP、開卡獎勵、Retention 與哩程討論。'
    }
  },
  {
    id: 'doctorofcredit',
    url: 'https://www.doctorofcredit.com',
    host: 'www.doctorofcredit.com',
    avatar: 'DoC',
    hue: 150,
    categories: ['finance', 'wordpress'],
    platform: 'WordPress',
    requiresLogin: false,
    keywords: 'doctor of credit doc bank bonus credit card data points wordpress comments',
    name: {
      en: 'Doctor of Credit (DoC)',
      'zh-CN': 'Doctor of Credit (DoC)',
      'zh-TW': 'Doctor of Credit (DoC)'
    },
    desc: {
      en: 'Summarize hundreds of reader comment DPs on bank bonuses and card deals.',
      'zh-CN': '北美银行开户与信用卡优惠博客，一键汇总评论区数百条真实 DP。',
      'zh-TW': '北美銀行開戶與信用卡優惠部落格，一鍵彙整留言區數百則真實 DP。'
    }
  },
  {
    id: 'uscreditcardguide',
    url: 'https://www.uscreditcardguide.com',
    host: 'www.uscreditcardguide.com',
    avatar: '指',
    hue: 210,
    categories: ['finance', 'wordpress'],
    platform: 'WordPress',
    requiresLogin: false,
    keywords: 'us credit card guide 美卡指南 评论 留言 总结 dp wordpress',
    name: {
      en: 'US Credit Card Guide (美卡指南)',
      'zh-CN': '美卡指南 US Credit Card Guide',
      'zh-TW': '美卡指南 US Credit Card Guide'
    },
    desc: {
      en: 'Summarize card guides and reader approval comments (评论区 DP).',
      'zh-CN': '总结美卡指南评测文章底部上百条读者原生评论与最新申请 DP。',
      'zh-TW': '摘要美卡指南評測文章底部上百則讀者原生留言與最新申請 DP。'
    }
  },
  {
    id: 'reddit',
    url: 'https://www.reddit.com',
    host: 'www.reddit.com',
    avatar: 'r/',
    hue: 16,
    categories: ['reddit', 'finance', 'ai', 'tech'],
    platform: 'Reddit',
    requiresLogin: true,
    keywords: 'reddit churning creditcards localllama selfhosted homelab subreddit megathread',
    name: {
      en: 'Reddit (r/churning, r/LocalLLaMA…)',
      'zh-CN': 'Reddit（r/churning、r/LocalLLaMA 等）',
      'zh-TW': 'Reddit（r/churning、r/LocalLLaMA 等）'
    },
    desc: {
      en: 'Summarize megathreads and nested comment trees or search any subreddit.',
      'zh-CN': '登录状态下总结 Reddit 长帖与折叠评论，或在任意 Subreddit 内搜索。',
      'zh-TW': '登入狀態下摘要 Reddit 長文與折疊留言，或在任意 Subreddit 內搜尋。'
    }
  },
  {
    id: 'linuxdo',
    url: 'https://linux.do',
    host: 'linux.do',
    avatar: 'L',
    hue: 32,
    categories: ['ai', 'tech'],
    platform: 'Discourse',
    requiresLogin: true,
    keywords: 'linux do linux.do 社区 社群 l站 ai 教程 福利',
    name: {
      en: 'LINUX DO',
      'zh-CN': 'LINUX DO 社区',
      'zh-TW': 'LINUX DO 社群'
    },
    desc: {
      en: 'Chinese AI & tech community—reads topics with your logged-in trust level.',
      'zh-CN': '高活跃中文技术与 AI 社区，携带你的登录态与信任等级爬楼和搜索。',
      'zh-TW': '高活躍中文技術與 AI 社群，攜帶你的登入態與信任等級爬文與搜尋。'
    }
  },
  {
    id: 'openai',
    url: 'https://community.openai.com',
    host: 'community.openai.com',
    avatar: 'OA',
    hue: 170,
    categories: ['ai'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'openai developer community gpt api chatgpt prompt responses',
    name: {
      en: 'OpenAI Developer Community',
      'zh-CN': 'OpenAI 开发者社区',
      'zh-TW': 'OpenAI 開發者社群'
    },
    desc: {
      en: 'Official forum for OpenAI API, GPT models, and developer debugging.',
      'zh-CN': 'OpenAI 官方开发者论坛，API 排错、模型更新与工程实践。',
      'zh-TW': 'OpenAI 官方開發者論壇，API 除錯、模型更新與工程實踐。'
    }
  },
  {
    id: 'cursor',
    url: 'https://forum.cursor.com',
    host: 'forum.cursor.com',
    avatar: 'C',
    hue: 250,
    categories: ['ai'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'cursor forum ai editor rules mcp bug',
    name: {
      en: 'Cursor Forum',
      'zh-CN': 'Cursor 论坛',
      'zh-TW': 'Cursor 論壇'
    },
    desc: {
      en: 'Bug reports, rules workflows, and releases for the Cursor AI editor.',
      'zh-CN': 'Cursor AI 编辑器官方论坛，Rules 配置、版本更新与问题排查。',
      'zh-TW': 'Cursor AI 編輯器官方論壇，Rules 設定、版本更新與問題排查。'
    }
  },
  {
    id: 'huggingface',
    url: 'https://discuss.huggingface.co',
    host: 'discuss.huggingface.co',
    avatar: 'HF',
    hue: 42,
    categories: ['ai'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'hugging face discuss transformers diffusers llm fine-tuning',
    name: {
      en: 'Hugging Face Forums',
      'zh-CN': 'Hugging Face 论坛',
      'zh-TW': 'Hugging Face 論壇'
    },
    desc: {
      en: 'Open-weight models, Transformers, Diffusers, and fine-tuning threads.',
      'zh-CN': '开源大模型、Transformers、微调与推理部署讨论区。',
      'zh-TW': '開源大模型、Transformers、微調與推論部署討論區。'
    }
  },
  {
    id: 'pytorch',
    url: 'https://discuss.pytorch.org',
    host: 'discuss.pytorch.org',
    avatar: 'PT',
    hue: 14,
    categories: ['ai'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'pytorch discuss cuda deep learning tensor',
    name: {
      en: 'PyTorch Forums',
      'zh-CN': 'PyTorch 论坛',
      'zh-TW': 'PyTorch 論壇'
    },
    desc: {
      en: 'Deep learning research, CUDA debugging, and distributed training.',
      'zh-CN': '深度学习研发、CUDA 报错排查与分布式训练讨论。',
      'zh-TW': '深度學習研發、CUDA 除錯與分散式訓練討論。'
    }
  },
  {
    id: 'homeassistant',
    url: 'https://community.home-assistant.io',
    host: 'community.home-assistant.io',
    avatar: 'HA',
    hue: 198,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'home assistant smart home zigbee matter yaml automation',
    name: {
      en: 'Home Assistant Community',
      'zh-CN': 'Home Assistant 社区',
      'zh-TW': 'Home Assistant 社群'
    },
    desc: {
      en: 'Smart home YAML blueprints and 500-reply Zigbee/Matter hardware threads.',
      'zh-CN': '智能家居自动化与硬件排错，轻松读完几百楼设备兼容长帖。',
      'zh-TW': '智慧家庭自動化與硬體除錯，輕鬆讀完數百樓設備相容長文。'
    }
  },
  {
    id: 'obsidian',
    url: 'https://forum.obsidian.md',
    host: 'forum.obsidian.md',
    avatar: 'Ob',
    hue: 270,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'obsidian forum pkm markdown dataview plugin notes',
    name: {
      en: 'Obsidian Forum',
      'zh-CN': 'Obsidian 论坛',
      'zh-TW': 'Obsidian 論壇'
    },
    desc: {
      en: 'PKM workflows, CSS snippets, Dataview queries, and plugins.',
      'zh-CN': '知识管理工作流、CSS 片段与插件生态讨论。',
      'zh-TW': '知識管理工作流、CSS 片段與外掛生態討論。'
    }
  },
  {
    id: 'frequentmiler',
    url: 'https://frequentmiler.com',
    host: 'frequentmiler.com',
    avatar: 'FM',
    hue: 200,
    categories: ['finance', 'wordpress'],
    platform: 'WordPress',
    requiresLogin: false,
    keywords: 'frequent miler award travel miles points wordpress comments',
    name: {
      en: 'Frequent Miler',
      'zh-CN': 'Frequent Miler',
      'zh-TW': 'Frequent Miler'
    },
    desc: {
      en: 'Award travel sweet spots, transfer bonuses, and reader comment DPs.',
      'zh-CN': '常旅客里程甜点、转点活动与读者评论区真实 DP。',
      'zh-TW': '常旅客哩程亮點、轉點活動與讀者留言區真實 DP。'
    }
  },
  {
    id: 'omaat',
    url: 'https://onemileatatime.com',
    host: 'onemileatatime.com',
    avatar: 'OM',
    hue: 190,
    categories: ['finance', 'wordpress'],
    platform: 'WordPress',
    requiresLogin: false,
    keywords: 'one mile at a time omaat airline hotel loyalty wordpress comments',
    name: {
      en: 'One Mile at a Time (OMAAT)',
      'zh-CN': 'One Mile at a Time (OMAAT)',
      'zh-TW': 'One Mile at a Time (OMAAT)'
    },
    desc: {
      en: 'Airline & hotel loyalty news, flight reviews, and reader comments.',
      'zh-CN': '航空与酒店常旅客新闻、两舱评测与读者评论区。',
      'zh-TW': '航空與飯店常旅客新聞、兩艙評測與讀者留言區。'
    }
  },
  {
    id: 'viewfromthewing',
    url: 'https://viewfromthewing.com',
    host: 'viewfromthewing.com',
    avatar: 'VW',
    hue: 235,
    categories: ['finance', 'wordpress'],
    platform: 'WordPress',
    requiresLogin: false,
    keywords: 'view from the wing travel loyalty wordpress comments',
    name: {
      en: 'View from the Wing',
      'zh-CN': 'View from the Wing',
      'zh-TW': 'View from the Wing'
    },
    desc: {
      en: 'Frequent flyer analysis and travel commentary with native WP comments.',
      'zh-CN': '常旅客深度分析与旅行行业评论。',
      'zh-TW': '常旅客深度分析與旅行產業評論。'
    }
  },
  {
    id: 'milestomemories',
    url: 'https://milestomemories.com',
    host: 'milestomemories.com',
    avatar: 'MM',
    hue: 135,
    categories: ['finance', 'wordpress'],
    platform: 'WordPress',
    requiresLogin: false,
    keywords: 'miles to memories deals rewards wordpress comments',
    name: {
      en: 'Miles to Memories',
      'zh-CN': 'Miles to Memories',
      'zh-TW': 'Miles to Memories'
    },
    desc: {
      en: 'Deals, credit card rewards, buyer groups, and travel comment threads.',
      'zh-CN': '信用卡返现、促销活动与旅行省钱技巧评论区。',
      'zh-TW': '信用卡回饋、促銷活動與旅行省錢技巧留言區。'
    }
  },
  {
    id: '9to5mac',
    url: 'https://9to5mac.com',
    host: '9to5mac.com · 9to5google.com',
    avatar: '95',
    hue: 265,
    categories: ['tech', 'wordpress'],
    platform: 'WordPress',
    requiresLogin: false,
    keywords: '9to5mac 9to5google apple google news comments wordpress',
    name: {
      en: '9to5Mac & 9to5Google',
      'zh-CN': '9to5Mac & 9to5Google',
      'zh-TW': '9to5Mac & 9to5Google'
    },
    desc: {
      en: 'Apple & Google news articles with hundreds of reader comments.',
      'zh-CN': 'Apple 与 Google 科技新闻博客，快速总结文章底部上百条读者评论。',
      'zh-TW': 'Apple 與 Google 科技新聞部落格，快速摘要文章底部上百則讀者留言。'
    }
  },
  {
    id: 'shuiyuan',
    url: 'https://shuiyuan.sjtu.edu.cn',
    host: 'shuiyuan.sjtu.edu.cn',
    avatar: '水',
    hue: 212,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: true,
    keywords: 'shuiyuan sjtu 上海交大 水源社区 水源社群 高校 论坛',
    name: {
      en: 'SJTU Shuiyuan (上海交大水源社区)',
      'zh-CN': '上海交大水源社区 (Shuiyuan)',
      'zh-TW': '上海交大水源社群 (Shuiyuan)'
    },
    desc: {
      en: 'Private university Discourse community—reads with your campus login.',
      'zh-CN': '高校私有 Discourse 社区代表，复用校园账号登录态爬楼总结与搜索。',
      'zh-TW': '大學私有 Discourse 社群代表，重用校園帳號登入態爬文摘要與搜尋。'
    }
  },
  {
    id: 'anki',
    url: 'https://forums.ankiweb.net',
    host: 'forums.ankiweb.net',
    avatar: 'Ak',
    hue: 208,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'anki forums fsrs spaced repetition flashcards',
    name: {
      en: 'Anki Forums',
      'zh-CN': 'Anki 官方论坛',
      'zh-TW': 'Anki 官方論壇'
    },
    desc: {
      en: 'FSRS scheduling parameters, deck templates, add-ons, and Q&A.',
      'zh-CN': 'FSRS 算法参数、记忆卡片模板与插件问答社区。',
      'zh-TW': 'FSRS 演算法參數、記憶卡片範本與外掛問答社群。'
    }
  },
  {
    id: 'nixos',
    url: 'https://discourse.nixos.org',
    host: 'discourse.nixos.org',
    avatar: 'Nx',
    hue: 218,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'nixos discourse nix flakes linux',
    name: {
      en: 'NixOS Discourse',
      'zh-CN': 'NixOS 官方社区',
      'zh-TW': 'NixOS 官方社群'
    },
    desc: {
      en: 'Nix flakes, reproducible configs, Home Manager, and nixpkgs threads.',
      'zh-CN': 'Nix Flakes、可复现系统配置与 Home Manager 讨论区。',
      'zh-TW': 'Nix Flakes、可重現系統設定與 Home Manager 討論區。'
    }
  },
  {
    id: 'cloudflare',
    url: 'https://community.cloudflare.com',
    host: 'community.cloudflare.com',
    avatar: 'CF',
    hue: 26,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'cloudflare community workers dns zero trust waf',
    name: {
      en: 'Cloudflare Community',
      'zh-CN': 'Cloudflare 开发者社区',
      'zh-TW': 'Cloudflare 開發者社群'
    },
    desc: {
      en: 'Workers, DNS, Zero Trust tunnels, and WAF troubleshooting.',
      'zh-CN': 'Cloudflare Workers、DNS、Zero Trust 与 WAF 规则排错社区。',
      'zh-TW': 'Cloudflare Workers、DNS、Zero Trust 與 WAF 規則除錯社群。'
    }
  },
  {
    id: 'rust',
    url: 'https://users.rust-lang.org',
    host: 'users.rust-lang.org',
    avatar: 'Rs',
    hue: 24,
    categories: ['ai', 'tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'rust users forum cargo async',
    name: {
      en: 'Rust Users Forum',
      'zh-CN': 'Rust 用户论坛',
      'zh-TW': 'Rust 使用者論壇'
    },
    desc: {
      en: 'Borrow checker questions, crate design, and async Rust architecture.',
      'zh-CN': 'Rust 语言进阶、生命周期与异步架构讨论。',
      'zh-TW': 'Rust 語言進階、生命週期與非同步架構討論。'
    }
  },
  {
    id: 'python',
    url: 'https://discuss.python.org',
    host: 'discuss.python.org',
    avatar: 'Py',
    hue: 215,
    categories: ['ai', 'tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'python discourse pep packaging',
    name: {
      en: 'Python Discourse',
      'zh-CN': 'Python 官方社区',
      'zh-TW': 'Python 官方社群'
    },
    desc: {
      en: 'PEP discussions, packaging, core development, and Python help.',
      'zh-CN': 'PEP 提案讨论、打包工具与核心开发交流。',
      'zh-TW': 'PEP 提案討論、打包工具與核心開發交流。'
    }
  },
  {
    id: 'swift',
    url: 'https://forums.swift.org',
    host: 'forums.swift.org',
    avatar: 'Sw',
    hue: 12,
    categories: ['ai', 'tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'swift forums apple ios concurrency',
    name: {
      en: 'Swift Forums',
      'zh-CN': 'Swift 论坛',
      'zh-TW': 'Swift 論壇'
    },
    desc: {
      en: 'Swift Evolution proposals, strict concurrency, and Apple tooling.',
      'zh-CN': 'Swift Evolution 演进提案与并发编程讨论。',
      'zh-TW': 'Swift Evolution 演進提案與並行程式設計討論。'
    }
  },
  {
    id: 'julia',
    url: 'https://discourse.julialang.org',
    host: 'discourse.julialang.org',
    avatar: 'Jl',
    hue: 280,
    categories: ['ai', 'tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'julia discourse scientific computing',
    name: {
      en: 'Julia Discourse',
      'zh-CN': 'Julia 官方社区',
      'zh-TW': 'Julia 官方社群'
    },
    desc: {
      en: 'Scientific computing, numerical optimization, and Julia packages.',
      'zh-CN': '科学计算、数值优化与 Julia 包生态讨论。',
      'zh-TW': '科學計算、數值最佳化與 Julia 套件生態討論。'
    }
  },
  {
    id: 'docker',
    url: 'https://forums.docker.com',
    host: 'forums.docker.com',
    avatar: 'Dk',
    hue: 205,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'docker community forums container compose',
    name: {
      en: 'Docker Community Forums',
      'zh-CN': 'Docker 社区论坛',
      'zh-TW': 'Docker 社群論壇'
    },
    desc: {
      en: 'Container networking, Compose configs, and Docker troubleshooting.',
      'zh-CN': '容器网络、Docker Compose 配置与故障排查。',
      'zh-TW': '容器網路、Docker Compose 設定與故障排查。'
    }
  },
  {
    id: 'n8n',
    url: 'https://community.n8n.io',
    host: 'community.n8n.io',
    avatar: 'n8',
    hue: 350,
    categories: ['ai', 'tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'n8n community automation workflow agent',
    name: {
      en: 'n8n Community',
      'zh-CN': 'n8n 自动化社区',
      'zh-TW': 'n8n 自動化社群'
    },
    desc: {
      en: 'AI agent workflows, self-hosted automation nodes, and webhooks.',
      'zh-CN': 'AI 工作流编排、自托管节点与 Webhook 调试问答。',
      'zh-TW': 'AI 工作流編排、自託管節點與 Webhook 除錯問答。'
    }
  },
  {
    id: 'level1techs',
    url: 'https://forum.level1techs.com',
    host: 'forum.level1techs.com',
    avatar: 'L1',
    hue: 28,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'level1techs linux zfs homelab vfio hardware',
    name: {
      en: 'Level1Techs Forums',
      'zh-CN': 'Level1Techs 硬件论坛',
      'zh-TW': 'Level1Techs 硬體論壇'
    },
    desc: {
      en: 'Linux, ZFS storage, VFIO passthrough, homelab & workstation builds.',
      'zh-CN': 'Linux、ZFS 存储、虚拟化直通与工作站硬件讨论。',
      'zh-TW': 'Linux、ZFS 儲存、虛擬化直通與工作站硬體討論。'
    }
  },
  {
    id: 'blender',
    url: 'https://blenderartists.org',
    host: 'blenderartists.org',
    avatar: 'Bl',
    hue: 22,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'blender artists 3d modeling cycles geometry nodes',
    name: {
      en: 'Blender Artists Community',
      'zh-CN': 'Blender Artists 社区',
      'zh-TW': 'Blender Artists 社群'
    },
    desc: {
      en: '3D modeling, Geometry Nodes, Cycles rendering, and add-ons.',
      'zh-CN': '3D 建模、几何节点、Cycles 渲染与 Blender 插件讨论。',
      'zh-TW': '3D 建模、幾何節點、Cycles 渲染與 Blender 外掛討論。'
    }
  },
  {
    id: 'godot',
    url: 'https://forum.godotengine.org',
    host: 'forum.godotengine.org',
    avatar: 'Gd',
    hue: 202,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'godot engine forum gdscript gamedev',
    name: {
      en: 'Godot Engine Forum',
      'zh-CN': 'Godot 引擎论坛',
      'zh-TW': 'Godot 引擎論壇'
    },
    desc: {
      en: 'GDScript, shaders, 2D/3D game architecture & engine Q&A.',
      'zh-CN': 'Godot 游戏开发、GDScript 与着色器问答。',
      'zh-TW': 'Godot 遊戲開發、GDScript 與著色器問答。'
    }
  },
  {
    id: 'unity',
    url: 'https://discussions.unity.com',
    host: 'discussions.unity.com',
    avatar: 'Un',
    hue: 240,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'unity discussions gamedev csharp urp hdrp',
    name: {
      en: 'Unity Discussions',
      'zh-CN': 'Unity 官方讨论区',
      'zh-TW': 'Unity 官方討論區'
    },
    desc: {
      en: 'URP/HDRP rendering, C# scripting, and game optimization threads.',
      'zh-CN': 'Unity 渲染管线、C# 脚本与性能优化问答。',
      'zh-TW': 'Unity 渲染管線、C# 腳本與效能最佳化問答。'
    }
  },
  {
    id: 'ethresearch',
    url: 'https://ethresear.ch',
    host: 'ethresear.ch',
    avatar: 'Ξ',
    hue: 230,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'ethereum research ethresear.ch rollup consensus',
    name: {
      en: 'Ethereum Research',
      'zh-CN': 'Ethereum Research',
      'zh-TW': 'Ethereum Research'
    },
    desc: {
      en: 'Cryptography, consensus protocol design, and L2 rollup research.',
      'zh-CN': '以太坊协议设计、密码学与 Layer 2 研究讨论。',
      'zh-TW': '以太坊協定設計、密碼學與 Layer 2 研究討論。'
    }
  },
  {
    id: 'discoursemeta',
    url: 'https://meta.discourse.org',
    host: 'meta.discourse.org',
    avatar: 'DM',
    hue: 255,
    categories: ['tech'],
    platform: 'Discourse',
    requiresLogin: false,
    keywords: 'discourse meta official plugin theme',
    name: {
      en: 'Discourse Meta',
      'zh-CN': 'Discourse Meta 官方社区',
      'zh-TW': 'Discourse Meta 官方社群'
    },
    desc: {
      en: 'The official Discourse support, plugin, and theme community.',
      'zh-CN': 'Discourse 官方社区，非常适合作为测试 Forumind 的第一站。',
      'zh-TW': 'Discourse 官方社群，非常適合作為測試 Forumind 的第一站。'
    }
  }
];

export const PROVIDERS_DATA = {
  en: [
    [
      'Google Gemini',
      `API key (<a href="${AI_STUDIO_KEY_URL}" target="_blank" rel="noopener noreferrer">free from Google AI Studio</a>)`,
      'Fastest free start'
    ],
    ['OpenRouter', 'API key', 'One key for Claude, GPT, DeepSeek & more'],
    ['OpenAI / Anthropic', 'API key', 'GPT-4.1, o-series & Claude Sonnet / Haiku'],
    ['DeepSeek / Groq / xAI', 'API key', 'Low-cost DeepSeek V3/R1, fast Groq, Grok'],
    ['Ollama / LM Studio', 'Installed locally on your computer', '100% local · $0 cost & no API key needed']
  ],
  'zh-CN': [
    [
      'Google Gemini',
      `API key（<a href="${AI_STUDIO_KEY_URL}" target="_blank" rel="noopener noreferrer">Google AI Studio 免费领</a>）`,
      '新手首选，一分钟免费拿 key'
    ],
    ['OpenRouter', 'API key', '一把 key 畅用 Claude、GPT、DeepSeek 等各家模型'],
    ['OpenAI / Anthropic', 'API key', 'GPT-4.1、o 系列与 Claude Sonnet / Haiku'],
    ['DeepSeek / Groq / xAI', 'API key', '高性价比 DeepSeek、极速 Groq 与 Grok'],
    ['Ollama / LM Studio', '在电脑本地安装运行', '100% 本机运行 · 零费用且数据不出本机']
  ],
  'zh-TW': [
    [
      'Google Gemini',
      `API 金鑰（<a href="${AI_STUDIO_KEY_URL}" target="_blank" rel="noopener noreferrer">Google AI Studio 免費領</a>）`,
      '新手首選，一分鐘免費拿金鑰'
    ],
    ['OpenRouter', 'API 金鑰', '一把金鑰暢用 Claude、GPT、DeepSeek 等各家模型'],
    ['OpenAI / Anthropic', 'API 金鑰', 'GPT-4.1、o 系列與 Claude Sonnet / Haiku'],
    ['DeepSeek / Groq / xAI', 'API 金鑰', '高性價比 DeepSeek、極速 Groq 與 Grok'],
    ['Ollama / LM Studio', '在電腦本機安裝執行', '100% 本機執行 · 零費用且資料不出本機']
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
      en: 'No—just open the site and click the Forumind icon. It works out of the box on <strong>US Card Forum (美卡论坛)</strong>, <strong>Doctor of Credit</strong>, <strong>US Credit Card Guide (美卡指南)</strong>, <strong>Frequent Miler</strong>, <strong>One Mile at a Time</strong>, <strong>Reddit</strong> (while signed in), <strong>LINUX DO</strong>, <strong>SJTU Shuiyuan (水源社区)</strong>, <strong>9to5Mac / 9to5Google</strong>, and thousands of AI &amp; developer forums (<strong>OpenAI</strong>, <strong>Cursor</strong>, <strong>Hugging Face</strong>, <strong>PyTorch</strong>, <strong>Home Assistant</strong>, <strong>Obsidian</strong>, <strong>Anki</strong>, <strong>NixOS</strong>, <strong>Cloudflare</strong>).',
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
      en: 'Forumind automatically strips the Origin header for localhost/127.0.0.1. If you still see 403, update Ollama and reload the extension, or run <code>OLLAMA_ORIGINS=chrome-extension://*</code>.',
      'zh-CN':
        'Forumind 会自动剥离发往本机的 Origin 请求头。若仍报 403，请更新 Ollama 并重载扩展，或使用 <code>OLLAMA_ORIGINS=chrome-extension://*</code> 启动。',
      'zh-TW':
        'Forumind 會自動剝離發往本機的 Origin 標頭。若仍報 403，請更新 Ollama 並重載擴充功能，或使用 <code>OLLAMA_ORIGINS=chrome-extension://*</code> 啟動。'
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
    'trust.2': 'Bring your own AI (Free Gemini key, OpenAI, Claude, or local Ollama)',
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
    'strip.cta': 'Browse all 32+ supported sites →',
    'qs.ariaLabel': 'Quick start',
    'qs.title': 'Get started in 3 steps',
    'qs.guideLink': 'Setup Guide & AI Providers →',
    'qs.faqLink': 'FAQ →',
    'qs.step1': 'Install from Chrome or Edge and pin the Forumind icon.',
    'qs.step2': 'Paste an AI key (free 1-min Gemini key) or pick local Ollama.',
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
    'sites.searchPlaceholder': 'Search site or domain (美卡, DoC, Reddit)…',
    'sites.searchAria': 'Search supported sites',
    'sites.emptyState':
      'No matching community in this curated list—open any website and click the Forumind toolbar icon to check if it supports Discourse, WordPress comments, or Reddit.',
    'sites.loginBadge': 'Login',
    'uc1.title': 'Credit Cards & Miles (美卡论坛 · DoC · 美卡指南)',
    'uc1.badge': 'DP Summarizer',
    'uc1.desc':
      'Extract approval rules, retention offers, and bank bonus data points from 500-reply threads with <code>#post</code> numbers.',
    'uc2.title': 'Reddit Megathreads (r/churning · r/LocalLLaMA)',
    'uc2.badge': 'Signed-in Reddit',
    'uc2.desc': 'Reads full posts and collapsed "more replies" branches or searches across any subreddit while signed in.',
    'uc3.title': 'Chinese Tech & Campus (LINUX DO · 水源社区)',
    'uc3.badge': 'Login Session',
    'uc3.desc': 'Uses your signed-in session and trust level to summarize tutorials and member-only topics.',
    'uc4.title': 'AI, Dev & Smart Home (OpenAI · Cursor · Home Assistant)',
    'uc4.badge': 'Dev & Tech',
    'uc4.desc': 'Find working bug fixes, YAML configs, and hardware recommendations across official developer forums.',
    'plat.discourse.title': 'Discourse Forums',
    'plat.discourse.badge': 'Thousands of sites',
    'plat.discourse.desc': 'Works on any Discourse community on any custom domain, including login-only forums.',
    'plat.wp.title': 'WordPress Blogs',
    'plat.wp.badge': 'Native WP Comments',
    'plat.wp.desc': 'Works on WordPress blogs with open REST comments (<code>/wp-json/wp/v2/</code>). Disqus isn’t supported.',
    'plat.reddit.title': 'Reddit',
    'plat.reddit.badge': 'While signed in',
    'plat.reddit.desc': 'Reads full Reddit threads + nested comments and searches subreddits while signed in.',
    'sites.howToCheck':
      '<strong>Not sure if another site works?</strong> Open it and click the Forumind toolbar icon—it checks the page once and tells you right away.',
    'sites.disclaimer': 'Examples only; Forumind is not affiliated with these sites.',
    'guide.eyebrow': 'Setup & Reference',
    'guide.title': 'Setup Guide, AI Providers & Privacy',
    'guide.lede': 'Connect a free or paid AI provider, tune research depth, and see how per-site permissions protect your privacy.',
    'prov.title': 'AI Providers & Local Models',
    'prov.freeBadge': 'Get a free Gemini key in 1 min ↗',
    'prov.intro': 'Connect any provider you already use, grab a free Gemini API key, or run 100% locally with Ollama or LM Studio.',
    'prov.col1': 'Provider',
    'prov.col2': 'What you need',
    'prov.col3': 'Good to know',
    'prov.ollamaNote':
      '<strong>Local Ollama / LM Studio:</strong> Start Ollama (<code>http://localhost:11434</code>) or LM Studio (<code>http://localhost:1234</code>). Forumind automatically strips the extension <code>Origin</code> header so default local installs work without 403 errors.',
    'set.title': 'Key Settings',
    'set.item1': '<strong>Favorite models:</strong> Save up to 30 models to switch in one click from the bottom input box.',
    'set.item2':
      '<strong>Research depth:</strong> <em>Quick</em> (6 steps / 3 topics), <em>Balanced</em> (15 / 8), <em>Thorough</em> (25 / 14), or <em>Custom</em>.',
    'set.item3': '<strong>Pages per topic:</strong> Read all pages by default, or cap at 1–100 pages (100 posts/page).',
    'set.item4': '<strong>Response language:</strong> <em>Auto (match discussion)</em> or force any of 12 languages.',
    'perm.title': 'Per-Site Permissions',
    'perm.p1':
      'Instead of asking to read all websites on install, Forumind requests access <strong>one site at a time</strong> when you click <strong>Allow access</strong>.',
    'perm.item1': 'Clicking the toolbar icon checks only the active tab once (<code>activeTab</code>).',
    'perm.item2': 'Review or revoke sites anytime under <strong>Settings → Forum access</strong> without losing saved summaries.',
    'priv.title': 'Privacy in Plain Words',
    'priv.policyLink': 'PRIVACY.md ↗',
    'priv.item1': '<strong>Zero servers or analytics:</strong> Nothing is ever sent to the developer.',
    'priv.item2': '<strong>Stored in your browser:</strong> Keys and history stay in local storage &amp; IndexedDB.',
    'priv.item3': '<strong>Only 2 network targets:</strong> The site you allow and the AI provider you choose.',
    'gh.title': 'Install Unpacked from GitHub',
    'gh.step1': `Download and unzip the latest release from <a href="${GITHUB_RELEASES_URL}" target="_blank" rel="noopener noreferrer">GitHub Releases</a>.`,
    'gh.step2': 'Open <code>chrome://extensions</code> or <code>edge://extensions</code> and enable <strong>Developer mode</strong>.',
    'gh.step3': 'Click <strong>Load unpacked</strong> and select the unzipped folder.',
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
    'trust.2': '自带 AI 密钥（免费领 Gemini key，或用本地 Ollama）',
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
    'strip.cta': '查看全部 32+ 支持的网站名录 →',
    'qs.ariaLabel': '快速上手',
    'qs.title': '三步快速上手',
    'qs.guideLink': 'AI 服务商与配置指南 →',
    'qs.faqLink': '常见问题 FAQ →',
    'qs.step1': '从 Chrome 或 Edge 商店安装，并在工具栏固定图标。',
    'qs.step2': '填入 AI 密钥（一分钟免费领 Gemini key）或选本地 Ollama。',
    'qs.step3': '打开任意支持站点，点 <strong>允许访问</strong> 即可总结与搜索。',
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
    'uc1.badge': 'DP 汇总利器',
    'uc1.desc': '告别手动爬几百楼，一键提炼申卡 DP、开卡奖励、Retention 报销并定位到具体 <code>#楼层</code>。',
    'uc2.title': 'Reddit 长帖与版块搜索（r/churning · r/LocalLLaMA）',
    'uc2.badge': '需登录 Reddit',
    'uc2.desc': '登录状态下自动展开全部折叠评论，或让 AI 在当前 Subreddit 版块内跨帖检索。',
    'uc3.title': '中文技术与高校社区（LINUX DO · 上海交大水源社区）',
    'uc3.badge': '复用登录态',
    'uc3.desc': '自动携带你的浏览器登录态与信任等级，总结教程长帖与校内讨论。',
    'uc4.title': 'AI 开发者与智能家居（OpenAI · Cursor · Home Assistant）',
    'uc4.badge': '开发与极客',
    'uc4.desc': '在数百楼技术排错帖中秒找可用 Workaround、YAML 配置与硬件推荐。',
    'plat.discourse.title': 'Discourse 论坛',
    'plat.discourse.badge': '成千上万个站点',
    'plat.discourse.desc': '支持任意域名的 Discourse 论坛，包括需登录或特定等级的私有社区。',
    'plat.wp.title': 'WordPress 博客',
    'plat.wp.badge': '原生评论 API',
    'plat.wp.desc': '支持开放原生评论 REST API（<code>/wp-json/wp/v2/</code>）的站点；Disqus 暂不支持。',
    'plat.reddit.title': 'Reddit 社区',
    'plat.reddit.badge': '需登录 Reddit',
    'plat.reddit.desc': '登录 www.reddit.com 后可读取全量嵌套评论并在版块内搜索。',
    'sites.howToCheck': '<strong>不确定某个网站能不能用？</strong>打开它并点一下工具栏上的 Forumind 图标，侧边栏会自动检测并提示。',
    'sites.disclaimer': '以上网站仅作举例，Forumind 与它们无任何关联。',
    'guide.eyebrow': '配置指南与参数说明',
    'guide.title': '配置指南、AI 服务商对比与隐私说明',
    'guide.lede': '一分钟配置免费 Gemini 或本地 Ollama，按需调整搜索深度与站点权限。',
    'prov.title': 'AI 服务商与本地模型',
    'prov.freeBadge': '一分钟免费领 Gemini Key ↗',
    'prov.intro': '连接你常用的 API 服务商、免费申请 Google AI Studio 密钥，或用本地 Ollama / LM Studio 免费运行。',
    'prov.col1': '服务商',
    'prov.col2': '需要什么',
    'prov.col3': '特点说明',
    'prov.ollamaNote':
      '<strong>本地 Ollama / LM Studio：</strong>启动 Ollama（<code>http://localhost:11434</code>）或 LM Studio（<code>http://localhost:1234</code>）即可。扩展会自动剥离 <code>Origin</code> 请求头，避免 403 报错。',
    'set.title': '常用设置项',
    'set.item1': '<strong>常用模型：</strong>最多收藏 30 个模型，在底部输入框一键切换（免费额度限速时极其实用）。',
    'set.item2':
      '<strong>全站搜索深度：</strong><em>快速</em>（6 步/3 帖）、<em>均衡</em>（15 步/8 帖）、<em>深入</em>（25 步/14 帖）或<em>自定义</em>。',
    'set.item3': '<strong>单帖读取页数：</strong>默认读完全部页数，也可限制前 1–100 页（每页 100 楼）。',
    'set.item4': '<strong>回答语言：</strong>默认<em>自动匹配讨论语言</em>，也可固定为中文、英文等 12 种语言。',
    'perm.title': '按网站逐个授权',
    'perm.p1': '不在安装时索取全网权限，只在你首次对某站点点 <strong>允许访问</strong> 时按需授权。',
    'perm.item1': '点击工具栏图标仅对当前标签页做一次检测（<code>activeTab</code>）。',
    'perm.item2': '可在 <strong>设置 → 论坛访问</strong> 随时移除权限，不影响已保存的总结。',
    'priv.title': '大白话隐私说明',
    'priv.policyLink': 'PRIVACY.md ↗',
    'priv.item1': '<strong>零服务器、零统计：</strong>任何数据都不会发给开发者。',
    'priv.item2': '<strong>仅存本地浏览器：</strong>密钥、设置与历史记录均保存在本机。',
    'priv.item3': '<strong>仅两类网络请求：</strong>你授权的论坛与你选择的 AI 服务商。',
    'gh.title': '从 GitHub 安装免审核最新版',
    'gh.step1': `前往 <a href="${GITHUB_RELEASES_URL}" target="_blank" rel="noopener noreferrer">GitHub Releases</a> 下载最新 zip 并解压。`,
    'gh.step2': '打开 <code>chrome://extensions</code> 或 <code>edge://extensions</code>，开启 <strong>开发者模式</strong>。',
    'gh.step3': '点 <strong>加载已解压的扩展程序</strong> 并选择解压后的文件夹。',
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
    'trust.2': '自備 AI 金鑰（免費領 Gemini 金鑰，或用本機 Ollama）',
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
    'strip.cta': '查看全部 32+ 支援的網站名錄 →',
    'qs.ariaLabel': '快速上手',
    'qs.title': '三步快速上手',
    'qs.guideLink': 'AI 供應商與設定指南 →',
    'qs.faqLink': '常見問題 FAQ →',
    'qs.step1': '從 Chrome 或 Edge 商店安裝，並在工具列固定圖示。',
    'qs.step2': '填入 AI 金鑰（一分鐘免費領 Gemini 金鑰）或選本機 Ollama。',
    'qs.step3': '開啟任意支援網站，點 <strong>允許存取</strong> 即可摘要與搜尋。',
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
    'uc1.badge': 'DP 彙整利器',
    'uc1.desc': '告別手動爬幾百樓，一鍵提煉申卡 DP、開卡獎勵、Retention 報銷並定位到具體 <code>#樓層</code>。',
    'uc2.title': 'Reddit 長文與看板搜尋（r/churning · r/LocalLLaMA）',
    'uc2.badge': '需登入 Reddit',
    'uc2.desc': '登入狀態下自動展開全部折疊留言，或讓 AI 在目前 Subreddit 看板內跨篇檢索。',
    'uc3.title': '中文技術與大學社群（LINUX DO · 上海交大水源社群）',
    'uc3.badge': '重用登入態',
    'uc3.desc': '自動攜帶你的瀏覽器登入態與信任等級，摘要教學長文與校內討論。',
    'uc4.title': 'AI 開發者與智慧家庭（OpenAI · Cursor · Home Assistant）',
    'uc4.badge': '開發與極客',
    'uc4.desc': '在數百樓技術除錯文中秒找可用 Workaround、YAML 設定與硬體推薦。',
    'plat.discourse.title': 'Discourse 論壇',
    'plat.discourse.badge': '成千上萬個網站',
    'plat.discourse.desc': '支援任意網域的 Discourse 論壇，包括需登入或特定等級的私有社群。',
    'plat.wp.title': 'WordPress 部落格',
    'plat.wp.badge': '原生留言 API',
    'plat.wp.desc': '支援開放原生留言 REST API（<code>/wp-json/wp/v2/</code>）的網站；Disqus 暫不支援。',
    'plat.reddit.title': 'Reddit 社群',
    'plat.reddit.badge': '需登入 Reddit',
    'plat.reddit.desc': '登入 www.reddit.com 後可讀取全量巢狀留言並在看板內搜尋。',
    'sites.howToCheck': '<strong>不確定某個網站能不能用？</strong>開啟它並點一下工具列上的 Forumind 圖示，側邊欄會自動檢測並提示。',
    'sites.disclaimer': '以上網站僅作舉例，Forumind 與它們無任何關聯。',
    'guide.eyebrow': '設定指南與參數說明',
    'guide.title': '設定指南、AI 供應商比較與隱私說明',
    'guide.lede': '一分鐘設定免費 Gemini 或本機 Ollama，按需調整搜尋深度與網站權限。',
    'prov.title': 'AI 供應商與本機模型',
    'prov.freeBadge': '一分鐘免費領 Gemini 金鑰 ↗',
    'prov.intro': '連線你常用的 API 供應商、免費申請 Google AI Studio 金鑰，或用本機 Ollama / LM Studio 免費執行。',
    'prov.col1': '供應商',
    'prov.col2': '需要什麼',
    'prov.col3': '特點說明',
    'prov.ollamaNote':
      '<strong>本機 Ollama / LM Studio：</strong>啟動 Ollama（<code>http://localhost:11434</code>）或 LM Studio（<code>http://localhost:1234</code>）即可。擴充功能會自動剝離 <code>Origin</code> 標頭，避免 403 錯誤。',
    'set.title': '常用設定項',
    'set.item1': '<strong>常用模型：</strong>最多收藏 30 個模型，在底部輸入框一鍵切換（免費額度限速時極其實用）。',
    'set.item2':
      '<strong>全站搜尋深度：</strong><em>快速</em>（6 步/3 篇）、<em>均衡</em>（15 步/8 篇）、<em>深入</em>（25 步/14 篇）或<em>自訂</em>。',
    'set.item3': '<strong>單篇讀取頁數：</strong>預設讀完全部頁數，也可限制前 1–100 頁（每頁 100 樓）。',
    'set.item4': '<strong>回答語言：</strong>預設<em>自動匹配討論語言</em>，也可固定為繁中、簡中、英文等 12 種語言。',
    'perm.title': '按網站逐一授權',
    'perm.p1': '不在安裝時索取全網權限，只在你首次對某網站點 <strong>允許存取</strong> 時按需授權。',
    'perm.item1': '點擊工具列圖示僅對目前分頁做一次檢查（<code>activeTab</code>）。',
    'perm.item2': '可在 <strong>設定 → 論壇存取</strong> 隨時移除權限，不影響已儲存的摘要。',
    'priv.title': '白話隱私說明',
    'priv.policyLink': 'PRIVACY.md ↗',
    'priv.item1': '<strong>零伺服器、零統計：</strong>任何資料都不會發給開發者。',
    'priv.item2': '<strong>僅存本機瀏覽器：</strong>金鑰、設定與歷史紀錄均儲存在本機。',
    'priv.item3': '<strong>僅兩類網路請求：</strong>你授權的論壇與你選擇的 AI 供應商。',
    'gh.title': '從 GitHub 安裝免審核最新版',
    'gh.step1': `前往 <a href="${GITHUB_RELEASES_URL}" target="_blank" rel="noopener noreferrer">GitHub Releases</a> 下載最新 zip 並解壓縮。`,
    'gh.step2': '開啟 <code>chrome://extensions</code> 或 <code>edge://extensions</code>，開啟 <strong>開發人員模式</strong>。',
    'gh.step3': '點 <strong>載入未封裝項目</strong> 並選擇解壓縮後的資料夾。',
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
