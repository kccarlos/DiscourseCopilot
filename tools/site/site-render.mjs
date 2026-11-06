import path from 'node:path';
import {
  AI_STUDIO_KEY_URL,
  CHROME_STORE_URL,
  COMMUNITIES,
  EDGE_ADDONS_URL,
  FAQ_ITEMS,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  LOCALES,
  PAGE_META,
  PAGES,
  PRIVACY_POLICY_URL,
  PROVIDERS_DATA,
  SIM_CONTENT,
  SITE_BASE_URL,
  UI_COPY
} from './site-data.mjs';
import { SITE_CSS } from './site-styles.mjs';

const OG_LOCALE = {
  en: 'en_US',
  'zh-CN': 'zh_CN',
  'zh-TW': 'zh_TW'
};

function escapeHtml(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function stripHtml(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .trim();
}

export function getPageDir(locale, page) {
  const meta = PAGE_META[page] || PAGE_META.overview;
  const prefix = locale === 'en' ? '' : `${locale}/`;
  return `${prefix}${meta.slug}`;
}

export function getPageFilePath(locale, page) {
  return `${getPageDir(locale, page)}index.html`;
}

export function getPageUrl(locale, page) {
  const dir = getPageDir(locale, page);
  return `${SITE_BASE_URL}/${dir}`;
}

export function getRelativeHref(fromLocale, fromPage, toLocale, toPage) {
  const fromDir = `/${getPageDir(fromLocale, fromPage).replace(/\/$/, '')}`;
  const toDir = `/${getPageDir(toLocale, toPage).replace(/\/$/, '')}`;
  const rel = path.posix.relative(fromDir, toDir);
  if (!rel || rel === '.') return './';
  return `${rel}/`;
}

export function getAssetHref(locale, page, assetRelPath) {
  const fromDir = `/${getPageDir(locale, page).replace(/\/$/, '')}`;
  const toAsset = `/${assetRelPath.replace(/^\//, '')}`;
  return path.posix.relative(fromDir, toAsset);
}

export function buildJsonLd({ locale, page, version = '3.0.2' }) {
  const pageUrl = getPageUrl(locale, page);
  const meta = PAGE_META[page] || PAGE_META.overview;
  const title = meta.title[locale] || meta.title.en;
  const description = meta.description[locale] || meta.description.en;

  if (page === 'overview') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          name: 'Forumind',
          alternateName: ['DiscourseCopilot', 'Forumind AI Comment Assistant', 'Forumind 评论区 AI 助手', 'Forumind 留言區 AI 助手'],
          applicationCategory: 'BrowserApplication',
          operatingSystem: 'Chrome, Microsoft Edge, Brave, Arc',
          softwareVersion: version,
          inLanguage: locale,
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD'
          },
          license: 'https://www.apache.org/licenses/LICENSE-2.0',
          url: pageUrl,
          downloadUrl: [CHROME_STORE_URL, EDGE_ADDONS_URL, GITHUB_RELEASES_URL],
          codeRepository: GITHUB_REPO_URL,
          description
        },
        {
          '@type': 'WebSite',
          name: 'Forumind',
          url: getPageUrl(locale, 'overview'),
          inLanguage: locale,
          description: title
        }
      ]
    };
  }

  if (page === 'sites') {
    return {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: pageUrl,
      inLanguage: locale,
      mainEntity: {
        '@type': 'ItemList',
        name: title,
        numberOfItems: COMMUNITIES.length,
        itemListElement: COMMUNITIES.map((site, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: site.name[locale] || site.name.en,
          description: site.desc[locale] || site.desc.en,
          url: site.url
        }))
      }
    };
  }

  if (page === 'guide') {
    return {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: title,
      description,
      url: pageUrl,
      inLanguage: locale,
      author: {
        '@type': 'Person',
        name: 'kccarlos',
        url: 'https://github.com/kccarlos'
      },
      about: {
        '@type': 'SoftwareApplication',
        name: 'Forumind',
        softwareVersion: version
      }
    };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    name: title,
    description,
    url: pageUrl,
    inLanguage: locale,
    mainEntity: FAQ_ITEMS.map(item => ({
      '@type': 'Question',
      name: stripHtml(item.q[locale] || item.q.en),
      acceptedAnswer: {
        '@type': 'Answer',
        text: stripHtml(item.a[locale] || item.a.en)
      }
    }))
  };
}

function renderSimStageHtml(data) {
  const traceHtml = data.trace ? `<div class="sim-trace">${data.trace.map(line => `<div>${line}</div>`).join('')}</div>` : '';
  return `<div class="sim-header">
  <div class="sim-forum-bar">
    <span class="forum-avatar" style="--forum-hue: 225; width: 25px; height: 25px; font-size: 11.5px;" aria-hidden="true">F</span>
    <div class="sim-forum-meta">
      <strong>${escapeHtml(data.forum)}</strong>
      <span>${escapeHtml(data.host)}</span>
    </div>
  </div>
  <span class="badge badge-ok">${escapeHtml(data.badge)}</span>
</div>
<div class="sim-body">
  <h2 class="sim-topic-title">${escapeHtml(data.topic)}</h2>
  ${traceHtml}
  <div class="sim-panel-card">
    <h3><span>${escapeHtml(data.cardTitle)}</span></h3>
    <ul>
      ${data.bullets.map(item => `<li>${item}</li>`).join('')}
    </ul>
  </div>
  <div class="sim-composer">
    <span>${escapeHtml(data.composerHint)}</span>
    <div class="sim-composer-chips">
      <span class="badge badge-accent">${escapeHtml(data.composerScope)}</span>
      <span class="badge">${escapeHtml(data.composerModel)}</span>
    </div>
  </div>
</div>`;
}

function renderOverviewMain({ locale, dict }) {
  const initialSim = SIM_CONTENT.summary[locale] || SIM_CONTENT.summary.en;
  const sitesHref = getRelativeHref(locale, 'overview', locale, 'sites');
  const guideHref = getRelativeHref(locale, 'overview', locale, 'guide');
  const faqHref = getRelativeHref(locale, 'overview', locale, 'faq');

  return `<section class="surface-card hero-card">
  <div class="wordmark-wrap">
    <svg class="wordmark-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 744 200" role="img" aria-label="Forumind">
      <defs>
        <linearGradient id="dchl-bub" gradientUnits="userSpaceOnUse" x1="62" y1="116" x2="402" y2="456"><stop offset="0" stop-color="#3A5BE0"/><stop offset="1" stop-color="#8E2DB5"/></linearGradient>
        <linearGradient id="dchl-star" gradientUnits="userSpaceOnUse" x1="286" y1="30" x2="494" y2="258"><stop offset="0" stop-color="#3D5CEB"/><stop offset="1" stop-color="#9B2FC6"/></linearGradient>
      </defs>
      <g transform="translate(0 0) scale(0.39)">
        <path d="M160.22 455.01Q106.24 465.14 42.78 488.33Q38.5 489.9 34.36 487.98Q30.23 486.06 28.67 481.78Q27.5 478.57 28.34 475.27Q46.9 402.8 52.18 339.8Q43.19 310.95 44.06 280.83Q44.93 250.4 55.74 221.87Q66.55 193.34 86.05 169.97Q106.08 145.98 133.13 130.04Q160.19 114.11 190.88 108.22Q220.78 102.49 250.97 106.87Q281.16 111.25 308.2 125.23Q309.84 126.08 311.46 126.96Q298.97 131.84 284.16 134.14Q280.28 134.74 277.51 137.51Q274.74 140.28 274.14 144.16Q273.38 149.07 276.31 153.08Q279.24 157.09 284.16 157.86Q325.04 164.22 348.21 189.17Q371.65 214.41 378.12 259.7Q378.69 263.66 381.51 266.49Q384.34 269.31 388.3 269.88Q393.22 270.58 397.2 267.6Q401.18 264.62 401.88 259.7Q402.37 256.24 402.97 252.9Q404.76 262.61 405.5 272.58Q407.76 303.01 399.96 332.43Q391.95 362.64 374.17 388.51Q356.39 414.39 331.05 432.7Q306.38 450.52 277.17 459.32Q247.95 468.11 217.54 466.86Q187.93 465.65 160.22 455.01Z" fill="#4A6BFF" opacity="0.55"/>
        <path d="M174.22 458.51Q120.24 468.64 56.78 491.83Q52.5 493.4 48.36 491.48Q44.23 489.56 42.67 485.28Q41.5 482.07 42.34 478.77Q60.9 406.3 66.18 343.3Q57.19 314.45 58.06 284.33Q58.93 253.9 69.74 225.37Q80.55 196.84 100.05 173.47Q120.08 149.48 147.13 133.54Q174.19 117.61 204.88 111.72Q234.78 105.99 264.97 110.37Q291.36 114.2 315.34 125.36Q301.31 131.47 284.16 134.14Q280.28 134.74 277.51 137.51Q274.74 140.28 274.14 144.16Q273.38 149.07 276.31 153.08Q279.24 157.09 284.16 157.86Q325.04 164.22 348.21 189.17Q371.65 214.41 378.12 259.7Q378.69 263.66 381.51 266.49Q384.34 269.31 388.3 269.88Q393.22 270.58 397.2 267.6Q401.18 264.62 401.88 259.7Q404.35 242.43 409.28 228.07Q417.66 251.25 419.5 276.08Q421.76 306.51 413.96 335.93Q405.95 366.14 388.17 392.01Q370.39 417.89 345.05 436.2Q320.38 454.02 291.17 462.82Q261.95 471.61 231.54 470.36Q201.93 469.15 174.22 458.51Z" fill="#C13AE0" opacity="0.55"/>
        <path d="M167.22 455.01Q113.24 465.14 49.78 488.33Q45.5 489.9 41.36 487.98Q37.23 486.06 35.67 481.78Q34.5 478.57 35.34 475.27Q53.9 402.8 59.18 339.8Q50.19 310.95 51.06 280.83Q51.93 250.4 62.74 221.87Q73.55 193.34 93.05 169.97Q113.08 145.98 140.13 130.04Q167.19 114.11 197.88 108.22Q227.78 102.49 257.97 106.87Q288.16 111.25 315.2 125.23Q315.3 125.28 315.4 125.34Q301.34 131.47 284.16 134.14Q280.28 134.74 277.51 137.51Q274.74 140.28 274.14 144.16Q273.38 149.07 276.31 153.08Q279.24 157.09 284.16 157.86Q325.04 164.22 348.21 189.17Q371.65 214.41 378.12 259.7Q378.69 263.66 381.51 266.49Q384.34 269.31 388.3 269.88Q393.22 270.58 397.2 267.6Q401.18 264.62 401.88 259.7Q403.56 247.9 406.4 237.47Q411.16 254.59 412.5 272.58Q414.76 303.01 406.96 332.43Q398.95 362.64 381.17 388.51Q363.39 414.39 338.05 432.7Q313.38 450.52 284.17 459.32Q254.95 468.11 224.54 466.86Q194.93 465.65 167.22 455.01Z" fill="url(#dchl-bub)"/>
        <path d="M151 212H321Q324 212 324 215V231Q324 234 321 234H151Q148 234 148 231V215Q148 212 151 212ZM151 254H321Q324 254 324 257V273Q324 276 321 276H151Q148 276 148 273V257Q148 254 151 254ZM151 296H321Q324 296 324 299V315Q324 318 321 318H151Q148 318 148 315V299Q148 296 151 296ZM151 338H257Q260 338 260 341V357Q260 360 257 360H151Q148 360 148 357V341Q148 338 151 338Z" fill="#FFFFFF"/>
        <path d="M390 30Q404 132 494 146Q404 160 390 258Q376 160 286 146Q376 132 390 30Z" fill="url(#dchl-star)"/>
      </g>
      <path class="wordmark-text-main" d="M225.8 152H240.4V119.4H274.3V107.3H240.4V82.8H278V70.5H225.8ZM317.5 153.3C335.4 153.3 346.8 140.6 346.8 121.8C346.8 102.7 335.4 90.1 317.5 90.1C299.7 90.1 288.3 102.7 288.3 121.8C288.3 140.6 299.7 153.3 317.5 153.3ZM317.5 141.7C307.6 141.7 302.8 132.9 302.8 121.7C302.8 110.4 307.6 101.6 317.5 101.6C327.5 101.6 332.4 110.4 332.4 121.7C332.4 132.9 327.5 141.7 317.5 141.7ZM359.2 152H373.4V116C373.4 108.2 379.3 102.8 387.2 102.8C389.7 102.8 392.7 103.2 393.9 103.5V90.4C392.6 90.2 390.3 90 388.7 90C381.7 90 375.8 94 373.6 101.1H373V90.8H359.2ZM424.6 152.8C433.5 152.8 439.9 148.5 443.6 139.7L443.7 152H457.2V90.8H442.9V126.7C442.9 135.5 437.4 140.7 429.9 140.7C422.4 140.7 417.9 135.8 417.9 127.5V90.8H403.7V129.7C403.7 144.5 412 152.8 424.6 152.8ZM472.3 152H486.5V114.5C486.5 106.4 491.6 102 497.9 102C503.9 102 508.2 106.1 508.2 112.3V152H522.1V113.6C522.1 106.8 526.3 102 533.2 102C539.1 102 543.8 105.4 543.8 112.9V152H558V110.8C558 97.2 549.6 89.9 538.6 89.9C530 89.9 522.4 94.3 519.1 103.2C516.5 94.5 511.3 89.9 503.4 89.9C496.1 89.9 489.2 93.8 486.1 102.5L485.6 90.8H472.3ZM573.1 152H587.4V90.8H573.1ZM580.2 82.2C584.8 82.2 588.6 78.7 588.6 74.4C588.6 70.1 584.8 66.6 580.2 66.6C575.7 66.6 572 70.1 572 74.4C572 78.7 575.7 82.2 580.2 82.2ZM616.7 116.2C616.7 107.3 622.1 102.2 629.7 102.2C637.2 102.2 641.7 107.1 641.7 115.3V152H655.9V113.1C655.9 98.4 647.6 90.1 635 90.1C626 90.1 619.7 94.5 616.1 103L615.9 90.8H602.5V152H616.7ZM693.5 153.1C704.1 153.1 708.8 146.7 711 142.3H711.9V152H725.8V70.5H711.6V101H711C708.8 96.6 704.4 90.1 693.5 90.1C679.4 90.1 668.3 101.2 668.3 121.5C668.3 141.6 679 153.1 693.5 153.1ZM697.4 141.4C687.9 141.4 682.9 133 682.9 121.5C682.9 110.1 687.8 101.8 697.4 101.8C706.8 101.8 711.9 109.6 711.9 121.5C711.9 133.4 706.7 141.4 697.4 141.4Z"/>
    </svg>
  </div>

  <h1 class="hero-tagline">${escapeHtml(dict['hero.tagline'])}</h1>
  <p class="hero-description">${dict['hero.desc']}</p>

  <div class="hero-cta-row">
    <a class="btn btn-primary" href="${CHROME_STORE_URL}" target="_blank" rel="noopener noreferrer">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5h7.8M8.97 13.75 5.07 7M15.03 13.75 11.13 20.5"/></svg>
      <span>${escapeHtml(dict['hero.ctaChrome'])}</span>
    </a>
    <a class="btn btn-outline" href="${EDGE_ADDONS_URL}" target="_blank" rel="noopener noreferrer">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z"/><path d="M8 12h8M12 8l4 4-4 4"/></svg>
      <span>${escapeHtml(dict['hero.ctaEdge'])}</span>
    </a>
    <a class="btn btn-outline" href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>
      <span>${escapeHtml(dict['hero.ctaGithub'])}</span>
    </a>
  </div>

  <div class="trust-pill-row">
    <span class="trust-pill">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/></svg>
      <span>${escapeHtml(dict['trust.1'])}</span>
    </span>
    <span class="trust-pill">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.35 4.15L17.5 8.5l-4.15 1.35L12 14l-1.35-4.15L6.5 8.5l4.15-1.35L12 3Z"/></svg>
      <span>${escapeHtml(dict['trust.2'])}</span>
    </span>
    <span class="trust-pill">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7v6c0 5 3.4 7.9 8 9 4.6-1.1 8-4 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>
      <span>${escapeHtml(dict['trust.3'])}</span>
    </span>
  </div>
</section>

<section class="surface-card" aria-label="${escapeHtml(dict['feat.sectionLabel'])}">
  <div class="walkthrough-layout">
    <div class="walkthrough-nav" role="tablist" aria-label="${escapeHtml(dict['feat.tablistLabel'])}">
      <button type="button" class="feature-tab-btn" role="tab" id="tab-summary" aria-controls="simStage" data-tab="summary" aria-selected="true">
        <span class="feature-tab-title">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h8l4 4v14H7V3Z"/><path d="M15 3v5h4M10 12h6M10 16h6"/></svg>
          <span>${escapeHtml(dict['feat.tab1.title'])}</span>
        </span>
        <span class="feature-tab-desc">${dict['feat.tab1.desc']}</span>
      </button>

      <button type="button" class="feature-tab-btn" role="tab" id="tab-chat" aria-controls="simStage" data-tab="chat" aria-selected="false">
        <span class="feature-tab-title">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8M8 13h5"/></svg>
          <span>${escapeHtml(dict['feat.tab2.title'])}</span>
        </span>
        <span class="feature-tab-desc">${dict['feat.tab2.desc']}</span>
      </button>

      <button type="button" class="feature-tab-btn" role="tab" id="tab-agent" aria-controls="simStage" data-tab="agent" aria-selected="false">
        <span class="feature-tab-title">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
          <span>${escapeHtml(dict['feat.tab3.title'])}</span>
        </span>
        <span class="feature-tab-desc">${dict['feat.tab3.desc']}</span>
      </button>
    </div>

    <div class="walkthrough-stage">
      <div class="sim-frame" id="simStage" role="tabpanel" aria-labelledby="tab-summary" aria-live="polite">
        ${renderSimStageHtml(initialSim)}
      </div>
    </div>
  </div>
</section>

<section class="surface-card preview-strip" aria-label="${escapeHtml(dict['strip.ariaLabel'])}">
  <div class="preview-strip-left">
    <span class="preview-strip-label">${escapeHtml(dict['strip.label'])}</span>
    <a class="mini-site-chip" href="https://www.reddit.com" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 16"></span>Reddit</a>
    <a class="mini-site-chip" href="https://www.uscardforum.com" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 225"></span>US Card Forum 美卡论坛</a>
    <a class="mini-site-chip" href="https://www.doctorofcredit.com" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 150"></span>Doctor of Credit</a>
    <a class="mini-site-chip" href="https://www.uscreditcardguide.com" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 210"></span>美卡指南</a>
    <a class="mini-site-chip" href="https://linux.do" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 32"></span>LINUX DO</a>
    <a class="mini-site-chip" href="https://community.openai.com" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 170"></span>OpenAI</a>
    <a class="mini-site-chip" href="https://forum.cursor.com" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 250"></span>Cursor</a>
    <a class="mini-site-chip" href="https://community.home-assistant.io" target="_blank" rel="noopener noreferrer"><span class="mini-dot" style="--forum-hue: 198"></span>Home Assistant</a>
  </div>
  <a class="link-btn" href="${sitesHref}">${escapeHtml(dict['strip.cta'])}</a>
</section>

<section class="surface-card quickstart-bar" aria-label="${escapeHtml(dict['qs.ariaLabel'])}">
  <div class="quickstart-head">
    <h2 class="quickstart-title">${escapeHtml(dict['qs.title'])}</h2>
    <div class="quickstart-links">
      <a class="link-btn" href="${guideHref}">${escapeHtml(dict['qs.guideLink'])}</a>
      <a class="link-btn" href="${faqHref}">${escapeHtml(dict['qs.faqLink'])}</a>
    </div>
  </div>
  <div class="quickstart-grid">
    <div class="qs-card">
      <span class="qs-num">1</span>
      <span class="qs-text">${dict['qs.step1']}</span>
    </div>
    <div class="qs-card">
      <span class="qs-num">2</span>
      <span class="qs-text">${dict['qs.step2']}</span>
    </div>
    <div class="qs-card">
      <span class="qs-num">3</span>
      <span class="qs-text">${dict['qs.step3']}</span>
    </div>
  </div>
</section>`;
}

function renderPlatformBadge(platform) {
  if (platform === 'WordPress') return '<span class="badge badge-ok">WordPress</span>';
  if (platform === 'Reddit') return '<span class="badge badge-warn">Reddit</span>';
  return '<span class="badge badge-accent">Discourse</span>';
}

function renderSitesMain({ locale, dict }) {
  const loginLabel = escapeHtml(dict['sites.loginBadge']);
  const cardsHtml = COMMUNITIES.map(site => {
    const name = site.name[locale] || site.name.en;
    const desc = site.desc[locale] || site.desc.en;
    const cats = site.categories.join(' ');
    const searchKeywords = [site.keywords, site.name.en, site.name['zh-CN'], site.name['zh-TW'], site.host].join(' ').toLowerCase();
    const loginPill = site.requiresLogin ? `<span class="badge">${loginLabel}</span>` : '';

    return `<a class="site-card" data-id="${escapeHtml(site.id)}" data-categories="${escapeHtml(cats)}" data-keywords="${escapeHtml(searchKeywords)}" href="${escapeHtml(site.url)}" target="_blank" rel="noopener noreferrer" role="listitem">
  <div class="site-card-top">
    <span class="forum-avatar" style="--forum-hue: ${site.hue}" aria-hidden="true">${escapeHtml(site.avatar)}</span>
    <div class="site-card-title-wrap">
      <div class="site-card-title"><span>${escapeHtml(name)}</span><span class="site-card-ext" aria-hidden="true">↗</span></div>
      <span class="site-card-host">${escapeHtml(site.host)}</span>
    </div>
  </div>
  <p class="site-card-desc">${escapeHtml(desc)}</p>
  <div class="site-card-meta">${renderPlatformBadge(site.platform)}${loginPill}</div>
</a>`;
  }).join('\n');

  return `<section class="surface-card" aria-labelledby="sitesHeading">
  <div class="section-header">
    <div>
      <span class="eyebrow">${escapeHtml(dict['sites.eyebrow'])}</span>
      <h1 id="sitesHeading" class="section-title">${escapeHtml(dict['sites.title'])}</h1>
      <p class="section-lede">${escapeHtml(dict['sites.lede'])}</p>
    </div>
    <span class="badge badge-ok">${escapeHtml(dict['sites.perSiteBadge'])}</span>
  </div>

  <div class="directory-toolbar">
    <div class="filter-pills" id="categoryFilterGroup" role="group" aria-label="${escapeHtml(dict['sites.filterAria'])}">
      <button type="button" class="filter-chip" data-filter="all" aria-pressed="true">${escapeHtml(dict['filter.all'])}</button>
      <button type="button" class="filter-chip" data-filter="finance" aria-pressed="false">${escapeHtml(dict['filter.finance'])}</button>
      <button type="button" class="filter-chip" data-filter="ai" aria-pressed="false">${escapeHtml(dict['filter.ai'])}</button>
      <button type="button" class="filter-chip" data-filter="tech" aria-pressed="false">${escapeHtml(dict['filter.tech'])}</button>
      <button type="button" class="filter-chip" data-filter="wordpress" aria-pressed="false">${escapeHtml(dict['filter.wp'])}</button>
      <button type="button" class="filter-chip" data-filter="reddit" aria-pressed="false">${escapeHtml(dict['filter.reddit'])}</button>
    </div>

    <div class="search-box">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input type="search" id="siteSearchInput" class="search-input" placeholder="${escapeHtml(dict['sites.searchPlaceholder'])}" aria-label="${escapeHtml(dict['sites.searchAria'])}">
    </div>
  </div>

  <div class="usecase-grid">
    <div class="usecase-card">
      <div class="usecase-card-head">
        <strong>${escapeHtml(dict['uc1.title'])}</strong>
        <span class="badge badge-ok">${escapeHtml(dict['uc1.badge'])}</span>
      </div>
      <p>${dict['uc1.desc']}</p>
    </div>
    <div class="usecase-card">
      <div class="usecase-card-head">
        <strong>${escapeHtml(dict['uc2.title'])}</strong>
        <span class="badge badge-warn">${escapeHtml(dict['uc2.badge'])}</span>
      </div>
      <p>${dict['uc2.desc']}</p>
    </div>
    <div class="usecase-card">
      <div class="usecase-card-head">
        <strong>${escapeHtml(dict['uc3.title'])}</strong>
        <span class="badge badge-accent">${escapeHtml(dict['uc3.badge'])}</span>
      </div>
      <p>${dict['uc3.desc']}</p>
    </div>
    <div class="usecase-card">
      <div class="usecase-card-head">
        <strong>${escapeHtml(dict['uc4.title'])}</strong>
        <span class="badge badge-accent">${escapeHtml(dict['uc4.badge'])}</span>
      </div>
      <p>${dict['uc4.desc']}</p>
    </div>
  </div>

  <div id="sitesGrid" class="sites-grid" role="list">
    ${cardsHtml}
  </div>
  <div id="sitesEmptyState" class="empty-filter-msg hidden" role="status">${escapeHtml(dict['sites.emptyState'])}</div>

  <div class="platform-grid">
    <div class="platform-col">
      <div class="platform-head">
        <span class="platform-title">${escapeHtml(dict['plat.discourse.title'])}</span>
        <span class="badge badge-accent">${escapeHtml(dict['plat.discourse.badge'])}</span>
      </div>
      <p class="platform-desc">${dict['plat.discourse.desc']}</p>
    </div>
    <div class="platform-col">
      <div class="platform-head">
        <span class="platform-title">${escapeHtml(dict['plat.wp.title'])}</span>
        <span class="badge badge-ok">${escapeHtml(dict['plat.wp.badge'])}</span>
      </div>
      <p class="platform-desc">${dict['plat.wp.desc']}</p>
    </div>
    <div class="platform-col">
      <div class="platform-head">
        <span class="platform-title">${escapeHtml(dict['plat.reddit.title'])}</span>
        <span class="badge badge-warn">${escapeHtml(dict['plat.reddit.badge'])}</span>
      </div>
      <p class="platform-desc">${dict['plat.reddit.desc']}</p>
    </div>
  </div>

  <div class="directory-footer">
    <span>${dict['sites.howToCheck']}</span>
    <span>${escapeHtml(dict['sites.disclaimer'])}</span>
  </div>
</section>`;
}

function renderGuideMain({ locale, dict }) {
  const providerRows = (PROVIDERS_DATA[locale] || PROVIDERS_DATA.en)
    .map(([name, need, note]) => `<tr><td><strong>${escapeHtml(name)}</strong></td><td>${need}</td><td>${escapeHtml(note)}</td></tr>`)
    .join('\n');

  return `<section class="surface-card" aria-labelledby="guideHeading">
  <div class="section-header">
    <div>
      <span class="eyebrow">${escapeHtml(dict['guide.eyebrow'])}</span>
      <h1 id="guideHeading" class="section-title">${escapeHtml(dict['guide.title'])}</h1>
      <p class="section-lede">${escapeHtml(dict['guide.lede'])}</p>
    </div>
  </div>

  <div class="docs-grid">
    <div id="providers" class="doc-block doc-block-wide">
      <h2>
        <span>${escapeHtml(dict['prov.title'])}</span>
        <a href="${AI_STUDIO_KEY_URL}" target="_blank" rel="noopener noreferrer" class="badge badge-accent">${escapeHtml(dict['prov.freeBadge'])}</a>
      </h2>
      <p>${escapeHtml(dict['prov.intro'])}</p>
      <div class="table-wrap">
        <table class="dc-table">
          <thead>
            <tr>
              <th scope="col">${escapeHtml(dict['prov.col1'])}</th>
              <th scope="col">${escapeHtml(dict['prov.col2'])}</th>
              <th scope="col">${escapeHtml(dict['prov.col3'])}</th>
            </tr>
          </thead>
          <tbody>
            ${providerRows}
          </tbody>
        </table>
      </div>
      <p>${dict['prov.ollamaNote']}</p>
    </div>

    <div id="settings-guide" class="doc-block">
      <h2>${escapeHtml(dict['set.title'])}</h2>
      <ul class="doc-list">
        <li>${dict['set.item1']}</li>
        <li>${dict['set.item2']}</li>
        <li>${dict['set.item3']}</li>
        <li>${dict['set.item4']}</li>
      </ul>
    </div>

    <div id="permissions" class="doc-block">
      <h2>${escapeHtml(dict['perm.title'])}</h2>
      <p>${dict['perm.p1']}</p>
      <ul class="doc-list">
        <li>${dict['perm.item1']}</li>
        <li>${dict['perm.item2']}</li>
      </ul>
    </div>

    <div id="privacy" class="doc-block">
      <h2>
        <span>${escapeHtml(dict['priv.title'])}</span>
        <a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener noreferrer" class="badge">${escapeHtml(dict['priv.policyLink'])}</a>
      </h2>
      <ul class="doc-list">
        <li>${dict['priv.item1']}</li>
        <li>${dict['priv.item2']}</li>
        <li>${dict['priv.item3']}</li>
      </ul>
    </div>

    <div id="github-install" class="doc-block">
      <h2>${escapeHtml(dict['gh.title'])}</h2>
      <ol class="doc-list">
        <li>${dict['gh.step1']}</li>
        <li>${dict['gh.step2']}</li>
        <li>${dict['gh.step3']}</li>
      </ol>
    </div>
  </div>
</section>`;
}

function renderFaqMain({ locale, dict }) {
  const faqItemsHtml = FAQ_ITEMS.map((item, idx) => {
    const q = item.q[locale] || item.q.en;
    const a = item.a[locale] || item.a.en;
    const openAttr = idx === 0 ? ' open' : '';
    return `<details class="faq-item" id="${escapeHtml(item.id)}"${openAttr}>
  <summary>
    <span>${escapeHtml(q)}</span>
    <span class="faq-chevron" aria-hidden="true"></span>
  </summary>
  <div class="faq-answer">${a}</div>
</details>`;
  }).join('\n');

  return `<section class="surface-card" aria-labelledby="faqHeading">
  <div class="section-header">
    <div>
      <span class="eyebrow">${escapeHtml(dict['faq.eyebrow'])}</span>
      <h1 id="faqHeading" class="section-title">${escapeHtml(dict['faq.title'])}</h1>
      <p class="section-lede">${escapeHtml(dict['faq.lede'])}</p>
    </div>
    <div class="search-box">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input type="search" id="faqSearchInput" class="search-input" placeholder="${escapeHtml(dict['faq.searchPlaceholder'])}" aria-label="${escapeHtml(dict['faq.searchAria'])}">
    </div>
  </div>

  <div id="faqList" class="faq-list">
    ${faqItemsHtml}
    <div id="faqEmptyState" class="empty-filter-msg hidden" role="status">${escapeHtml(dict['faq.emptyState'])}</div>
  </div>
</section>`;
}

function renderClientScript({ locale, page }) {
  const lines = [
    '(function () {',
    '  const root = document.documentElement;',
    '  const themeBtn = document.getElementById("themeToggleBtn");',
    '  if (themeBtn) {',
    '    themeBtn.addEventListener("click", () => {',
    '      const isDark = root.getAttribute("data-theme") === "dark" ||',
    '        (!root.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);',
    '      const next = isDark ? "light" : "dark";',
    '      root.setAttribute("data-theme", next);',
    '      try { localStorage.setItem("forumind-site-theme", next); } catch {}',
    '    });',
    '  }'
  ];

  if (page === 'overview') {
    const simHtmlMap = {
      summary: renderSimStageHtml(SIM_CONTENT.summary[locale] || SIM_CONTENT.summary.en),
      chat: renderSimStageHtml(SIM_CONTENT.chat[locale] || SIM_CONTENT.chat.en),
      agent: renderSimStageHtml(SIM_CONTENT.agent[locale] || SIM_CONTENT.agent.en)
    };
    const serializedSim = JSON.stringify(simHtmlMap).replaceAll('</', '<\\/');
    lines.push(
      `  const SIM_HTML = ${serializedSim};`,
      '  const tabs = Array.from(document.querySelectorAll(".feature-tab-btn"));',
      '  const stage = document.getElementById("simStage");',
      '  function selectTab(btn, focusBtn) {',
      '    const key = btn.getAttribute("data-tab");',
      '    const html = SIM_HTML[key];',
      '    if (!html || !stage) return;',
      '    tabs.forEach(b => b.setAttribute("aria-selected", String(b === btn)));',
      '    stage.setAttribute("aria-labelledby", btn.id);',
      '    if (focusBtn) btn.focus();',
      '    stage.innerHTML = html;',
      '  }',
      '  tabs.forEach((btn, idx) => {',
      '    btn.addEventListener("click", () => selectTab(btn, false));',
      '    btn.addEventListener("keydown", e => {',
      '      if (e.key === "ArrowDown" || e.key === "ArrowRight") {',
      '        e.preventDefault();',
      '        selectTab(tabs[(idx + 1) % tabs.length], true);',
      '      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {',
      '        e.preventDefault();',
      '        selectTab(tabs[(idx - 1 + tabs.length) % tabs.length], true);',
      '      }',
      '    });',
      '  });'
    );
  }

  if (page === 'sites') {
    lines.push(
      '  let activeCategory = "all";',
      '  const filterBtns = Array.from(document.querySelectorAll("#categoryFilterGroup .filter-chip"));',
      '  const searchInput = document.getElementById("siteSearchInput");',
      '  const cards = Array.from(document.querySelectorAll("#sitesGrid .site-card"));',
      '  const emptyEl = document.getElementById("sitesEmptyState");',
      '  function applySitesFilter() {',
      '    const q = ((searchInput && searchInput.value) || "").trim().toLowerCase();',
      '    let visibleCount = 0;',
      '    cards.forEach(card => {',
      '      const cats = (card.getAttribute("data-categories") || "").split(/\\s+/);',
      '      const kw = (card.getAttribute("data-keywords") || "") + " " + card.textContent.toLowerCase();',
      '      const matchCat = activeCategory === "all" || cats.includes(activeCategory);',
      '      const matchQ = !q || kw.includes(q);',
      '      const show = matchCat && matchQ;',
      '      card.classList.toggle("hidden", !show);',
      '      if (show) visibleCount++;',
      '    });',
      '    if (emptyEl) emptyEl.classList.toggle("hidden", visibleCount > 0);',
      '  }',
      '  filterBtns.forEach(btn => {',
      '    btn.addEventListener("click", () => {',
      '      activeCategory = btn.getAttribute("data-filter") || "all";',
      '      filterBtns.forEach(b => b.setAttribute("aria-pressed", String(b === btn)));',
      '      applySitesFilter();',
      '    });',
      '  });',
      '  if (searchInput) searchInput.addEventListener("input", applySitesFilter);'
    );
  }

  if (page === 'faq') {
    lines.push(
      '  const faqSearch = document.getElementById("faqSearchInput");',
      '  const faqItems = Array.from(document.querySelectorAll("#faqList details.faq-item"));',
      '  const faqEmpty = document.getElementById("faqEmptyState");',
      '  function applyFaqFilter() {',
      '    const q = ((faqSearch && faqSearch.value) || "").trim().toLowerCase();',
      '    let visibleCount = 0;',
      '    faqItems.forEach((item, idx) => {',
      '      const show = !q || item.textContent.toLowerCase().includes(q);',
      '      item.classList.toggle("hidden", !show);',
      '      if (show) {',
      '        visibleCount++;',
      '        if (q) item.open = true;',
      '        else if (!window.location.hash) item.open = idx === 0;',
      '      }',
      '    });',
      '    if (faqEmpty) faqEmpty.classList.toggle("hidden", visibleCount > 0);',
      '  }',
      '  function openHashTarget() {',
      '    const id = (window.location.hash || "").replace(/^#/, "");',
      '    if (!id) return;',
      '    const target = document.getElementById(id);',
      '    if (target && target.tagName === "DETAILS") target.open = true;',
      '  }',
      '  if (faqSearch) faqSearch.addEventListener("input", applyFaqFilter);',
      '  window.addEventListener("hashchange", openHashTarget);',
      '  openHashTarget();'
    );
  }

  lines.push('})();');
  return lines.join('\n');
}

export function renderSitePage({ locale = 'en', page = 'overview', version = '3.0.2' }) {
  if (!LOCALES.includes(locale)) throw new Error(`Unsupported locale: ${locale}`);
  if (!PAGES.includes(page)) throw new Error(`Unsupported page: ${page}`);

  const dict = UI_COPY[locale] || UI_COPY.en;
  const meta = PAGE_META[page];
  const title = meta.title[locale] || meta.title.en;
  const description = meta.description[locale] || meta.description.en;
  const canonicalUrl = getPageUrl(locale, page);
  const iconHref = getAssetHref(locale, page, 'assets/icon128.png');
  const ogImageUrl = `${SITE_BASE_URL}/assets/icon128.png`;
  const jsonLd = JSON.stringify(buildJsonLd({ locale, page, version }), null, 2).replaceAll('</', '<\\/');

  const hreflangLinks = [
    ...LOCALES.map(loc => `<link rel="alternate" hreflang="${loc}" href="${getPageUrl(loc, page)}">`),
    `<link rel="alternate" hreflang="x-default" href="${getPageUrl('en', page)}">`
  ].join('\n  ');

  const overviewHref = getRelativeHref(locale, page, locale, 'overview');
  const sitesHref = getRelativeHref(locale, page, locale, 'sites');
  const guideHref = getRelativeHref(locale, page, locale, 'guide');
  const faqHref = getRelativeHref(locale, page, locale, 'faq');

  const enHref = getRelativeHref(locale, page, 'en', page);
  const zhCnHref = getRelativeHref(locale, page, 'zh-CN', page);
  const zhTwHref = getRelativeHref(locale, page, 'zh-TW', page);

  let mainContent = '';
  if (page === 'overview') {
    mainContent = renderOverviewMain({ locale, dict });
  } else if (page === 'sites') {
    mainContent = renderSitesMain({ locale, dict });
  } else if (page === 'guide') {
    mainContent = renderGuideMain({ locale, dict });
  } else {
    mainContent = renderFaqMain({ locale, dict });
  }

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="icon" type="image/png" href="${iconHref}">

  <link rel="canonical" href="${canonicalUrl}">
  ${hreflangLinks}

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Forumind">
  <meta property="og:locale" content="${OG_LOCALE[locale] || 'en_US'}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">

  <script>
    try {
      const savedTheme = localStorage.getItem("forumind-site-theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        document.documentElement.setAttribute("data-theme", savedTheme);
      }
    } catch {}
  </script>

  <script type="application/ld+json">
${jsonLd}
  </script>

  <style>
${SITE_CSS}
  </style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="brand-link" href="${overviewHref}">
        <span class="brand-glyph" aria-hidden="true">
          <svg width="17" height="17" viewBox="0 0 24 24"><path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8M8 13h5"/></svg>
        </span>
        <span>Forumind</span>
      </a>

      <nav class="nav-links" aria-label="${escapeHtml(dict['nav.ariaLabel'])}">
        <a class="nav-pill" href="${overviewHref}"${page === 'overview' ? ' aria-current="page"' : ''}>
          <span>${escapeHtml(dict['nav.overview'])}</span>
        </a>
        <a class="nav-pill" href="${sitesHref}"${page === 'sites' ? ' aria-current="page"' : ''}>
          <span>${escapeHtml(dict['nav.sites'])}</span>
          <span class="nav-count">${COMMUNITIES.length}+</span>
        </a>
        <a class="nav-pill" href="${guideHref}"${page === 'guide' ? ' aria-current="page"' : ''}>
          <span>${escapeHtml(dict['nav.guide'])}</span>
        </a>
        <a class="nav-pill" href="${faqHref}"${page === 'faq' ? ' aria-current="page"' : ''}>
          <span>${escapeHtml(dict['nav.faq'])}</span>
        </a>
      </nav>

      <div class="header-controls">
        <div class="lang-switcher" role="group" aria-label="${escapeHtml(dict['nav.langLabel'])}">
          <a class="lang-link" href="${enHref}" lang="en" hreflang="en"${locale === 'en' ? ' aria-current="true"' : ''}>EN</a>
          <a class="lang-link" href="${zhCnHref}" lang="zh-CN" hreflang="zh-CN"${locale === 'zh-CN' ? ' aria-current="true"' : ''}>简体</a>
          <a class="lang-link" href="${zhTwHref}" lang="zh-TW" hreflang="zh-TW"${locale === 'zh-TW' ? ' aria-current="true"' : ''}>繁體</a>
        </div>
        <button type="button" id="themeToggleBtn" class="icon-btn" title="${escapeHtml(dict['nav.themeLabel'])}" aria-label="${escapeHtml(dict['nav.themeLabel'])}">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        </button>
      </div>
    </div>
  </header>

  <main class="page-wrap">
${mainContent}
  </main>

  <footer class="site-footer">
    <div>
      <strong>Forumind</strong> · <span>${escapeHtml(dict['footer.copy'])}</span>
    </div>
    <div class="footer-links">
      <a class="link-btn" href="${overviewHref}">${escapeHtml(dict['nav.overview'])}</a>
      <a class="link-btn" href="${sitesHref}">${escapeHtml(dict['nav.sites'])}</a>
      <a class="link-btn" href="${guideHref}">${escapeHtml(dict['nav.guide'])}</a>
      <a class="link-btn" href="${faqHref}">${escapeHtml(dict['nav.faq'])}</a>
      <a href="${PRIVACY_POLICY_URL}" target="_blank" rel="noopener noreferrer">${escapeHtml(dict['footer.privacy'])}</a>
      <a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub</a>
    </div>
  </footer>

  <script>
${renderClientScript({ locale, page })}
  </script>
</body>
</html>
`;
}

export function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Page Not Found — Forumind</title>
  <meta name="robots" content="noindex">
  <style>
${SITE_CSS}
  </style>
</head>
<body>
  <main class="page-wrap">
    <section class="surface-card hero-card">
      <h1 class="hero-tagline">Page not found (404)</h1>
      <p class="hero-description">
        The page you requested does not exist. Jump back to the Forumind homepage or browse supported communities below.
      </p>
      <div class="hero-cta-row">
        <a class="btn btn-primary" href="${SITE_BASE_URL}/">Overview (EN)</a>
        <a class="btn btn-outline" href="${SITE_BASE_URL}/sites/">Supported Sites</a>
        <a class="btn btn-outline" href="${SITE_BASE_URL}/zh-CN/">简体中文首页</a>
        <a class="btn btn-outline" href="${SITE_BASE_URL}/zh-TW/">繁體中文首頁</a>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

export function renderSitemapXml() {
  const urlEntries = [];
  for (const page of PAGES) {
    const alternates = [
      ...LOCALES.map(loc => `    <xhtml:link rel="alternate" hreflang="${loc}" href="${getPageUrl(loc, page)}" />`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${getPageUrl('en', page)}" />`
    ].join('\n');

    for (const locale of LOCALES) {
      urlEntries.push(`  <url>\n    <loc>${getPageUrl(locale, page)}</loc>\n${alternates}\n  </url>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urlEntries.join('\n')}
</urlset>
`;
}

export function renderRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_BASE_URL}/sitemap.xml
`;
}
