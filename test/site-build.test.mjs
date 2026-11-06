import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSite } from '../tools/site/build-site.mjs';
import {
  CHROME_STORE_URL,
  COMMUNITIES,
  EDGE_ADDONS_URL,
  FAQ_ITEMS,
  GITHUB_RELEASES_URL,
  LOCALES,
  PAGE_META,
  PAGES,
  PROVIDERS_DATA,
  SIM_CONTENT,
  SITE_BASE_URL,
  UI_COPY
} from '../tools/site/site-data.mjs';
import { getPageDir, getPageFilePath, getPageUrl, getRelativeHref } from '../tools/site/site-render.mjs';

const SIMPLIFIED_ONLY = /[这个为么说时们会发对开关问题论坛页设请过还没点显与历应选择网络链译输简检数据记录总结话复删务读语码图标签]/;
const CJK_PATTERN = /[\u4e00-\u9fff]/;

test('site-data: all 3 locales define identical UI_COPY keys and non-empty strings', () => {
  const enKeys = Object.keys(UI_COPY.en).sort();
  assert.deepEqual(Object.keys(UI_COPY['zh-CN']).sort(), enKeys);
  assert.deepEqual(Object.keys(UI_COPY['zh-TW']).sort(), enKeys);

  for (const locale of LOCALES) {
    for (const [key, val] of Object.entries(UI_COPY[locale])) {
      assert.equal(typeof val, 'string', `${locale}.${key}`);
      assert.ok(val.trim().length > 0, `empty ${locale}.${key}`);
    }
    assert.ok(
      UI_COPY[locale]['filter.all'].includes(`(${COMMUNITIES.length})`),
      `filter.all in ${locale} should reflect COMMUNITIES.length (${COMMUNITIES.length})`
    );
    assert.ok(
      UI_COPY[locale]['strip.cta'].includes(`${COMMUNITIES.length}+`),
      `strip.cta in ${locale} should reflect COMMUNITIES.length (${COMMUNITIES.length}+)`
    );
  }
});

test('site-data: English (en) copy, metadata, communities, and FAQs contain zero Chinese characters', () => {
  for (const [key, val] of Object.entries(UI_COPY.en)) {
    assert.ok(!CJK_PATTERN.test(val), `Chinese character found in UI_COPY.en['${key}']: ${val}`);
  }
  for (const [page, meta] of Object.entries(PAGE_META)) {
    assert.ok(!CJK_PATTERN.test(meta.title.en), `Chinese character in PAGE_META.${page}.title.en: ${meta.title.en}`);
    assert.ok(!CJK_PATTERN.test(meta.description.en), `Chinese character in PAGE_META.${page}.description.en: ${meta.description.en}`);
  }
  for (const site of COMMUNITIES) {
    assert.ok(!CJK_PATTERN.test(site.avatar), `Chinese character in COMMUNITIES(${site.id}).avatar: ${site.avatar}`);
    assert.ok(!CJK_PATTERN.test(site.name.en), `Chinese character in COMMUNITIES(${site.id}).name.en: ${site.name.en}`);
    assert.ok(!CJK_PATTERN.test(site.desc.en), `Chinese character in COMMUNITIES(${site.id}).desc.en: ${site.desc.en}`);
    assert.ok(!CJK_PATTERN.test(site.keywords.en), `Chinese character in COMMUNITIES(${site.id}).keywords.en: ${site.keywords.en}`);
  }
  for (const item of FAQ_ITEMS) {
    assert.ok(!CJK_PATTERN.test(item.q.en), `Chinese character in FAQ_ITEMS(${item.id}).q.en: ${item.q.en}`);
    assert.ok(!CJK_PATTERN.test(item.a.en), `Chinese character in FAQ_ITEMS(${item.id}).a.en: ${item.a.en}`);
  }
});

test('site-data: Traditional Chinese (zh-TW) contains no Simplified-only characters', () => {
  for (const [key, val] of Object.entries(UI_COPY['zh-TW'])) {
    assert.ok(!SIMPLIFIED_ONLY.test(val), `Simplified char in UI_COPY['zh-TW']['${key}']: ${val}`);
  }
  for (const [page, meta] of Object.entries(PAGE_META)) {
    assert.ok(!SIMPLIFIED_ONLY.test(meta.title['zh-TW']), `Simplified char in PAGE_META.${page}.title['zh-TW']`);
    assert.ok(!SIMPLIFIED_ONLY.test(meta.description['zh-TW']), `Simplified char in PAGE_META.${page}.description['zh-TW']`);
  }
  for (const site of COMMUNITIES) {
    assert.ok(!SIMPLIFIED_ONLY.test(site.name['zh-TW']), `Simplified char in COMMUNITIES(${site.id}).name['zh-TW']: ${site.name['zh-TW']}`);
    assert.ok(!SIMPLIFIED_ONLY.test(site.desc['zh-TW']), `Simplified char in COMMUNITIES(${site.id}).desc['zh-TW']: ${site.desc['zh-TW']}`);
  }
  for (const row of PROVIDERS_DATA['zh-TW']) {
    for (const cell of row) {
      assert.ok(!SIMPLIFIED_ONLY.test(cell), `Simplified char in PROVIDERS_DATA['zh-TW']: ${cell}`);
    }
  }
  for (const [tab, tabLocales] of Object.entries(SIM_CONTENT)) {
    const data = tabLocales['zh-TW'];
    for (const field of ['forum', 'host', 'topic', 'cardTitle', 'badge', 'composerScope', 'composerHint']) {
      assert.ok(!SIMPLIFIED_ONLY.test(data[field]), `Simplified char in SIM_CONTENT.${tab}['zh-TW'].${field}: ${data[field]}`);
    }
    for (const bullet of data.bullets) {
      assert.ok(!SIMPLIFIED_ONLY.test(bullet), `Simplified char in SIM_CONTENT.${tab}['zh-TW'].bullets: ${bullet}`);
    }
    for (const line of data.trace || []) {
      assert.ok(!SIMPLIFIED_ONLY.test(line), `Simplified char in SIM_CONTENT.${tab}['zh-TW'].trace: ${line}`);
    }
  }
  for (const item of FAQ_ITEMS) {
    assert.ok(!SIMPLIFIED_ONLY.test(item.q['zh-TW']), `Simplified char in FAQ_ITEMS(${item.id}).q['zh-TW']: ${item.q['zh-TW']}`);
    assert.ok(!SIMPLIFIED_ONLY.test(item.a['zh-TW']), `Simplified char in FAQ_ITEMS(${item.id}).a['zh-TW']: ${item.a['zh-TW']}`);
  }
});

test('buildSite generates all 12 localized HTML pages, data/sites.json, 404.html, sitemap.xml, robots.txt, and resolves all relative links', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forumind-site-test-'));
  try {
    const { writtenFiles } = buildSite({ outDir: tmpDir });
    assert.ok(writtenFiles.includes('index.html'));
    assert.ok(writtenFiles.includes('sites/index.html'));
    assert.ok(writtenFiles.includes('guide/index.html'));
    assert.ok(writtenFiles.includes('faq/index.html'));
    assert.ok(writtenFiles.includes('zh-CN/index.html'));
    assert.ok(writtenFiles.includes('zh-CN/sites/index.html'));
    assert.ok(writtenFiles.includes('zh-CN/guide/index.html'));
    assert.ok(writtenFiles.includes('zh-CN/faq/index.html'));
    assert.ok(writtenFiles.includes('zh-TW/index.html'));
    assert.ok(writtenFiles.includes('zh-TW/sites/index.html'));
    assert.ok(writtenFiles.includes('zh-TW/guide/index.html'));
    assert.ok(writtenFiles.includes('zh-TW/faq/index.html'));
    assert.ok(writtenFiles.includes('404.html'));
    assert.ok(writtenFiles.includes('sitemap.xml'));
    assert.ok(writtenFiles.includes('robots.txt'));
    assert.ok(writtenFiles.includes('.nojekyll'));
    assert.ok(writtenFiles.includes('assets/icon128.png'));
    assert.ok(writtenFiles.includes('data/sites.json'));

    const sitesJsonData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'data/sites.json'), 'utf8'));
    assert.equal(sitesJsonData.length, COMMUNITIES.length);

    for (const locale of LOCALES) {
      for (const page of PAGES) {
        const relFile = getPageFilePath(locale, page);
        const filePath = path.join(tmpDir, relFile);
        assert.ok(fs.existsSync(filePath), `missing generated file ${relFile}`);
        const html = fs.readFileSync(filePath, 'utf8');

        // 1. HTML lang & canonical & hreflang
        assert.match(html, new RegExp(`<html lang="${locale}">`));
        const expectedCanonical = getPageUrl(locale, page);
        assert.ok(html.includes(`<link rel="canonical" href="${expectedCanonical}">`), `canonical mismatch in ${relFile}`);
        for (const altLocale of LOCALES) {
          assert.ok(
            html.includes(`<link rel="alternate" hreflang="${altLocale}" href="${getPageUrl(altLocale, page)}">`),
            `missing hreflang=${altLocale} in ${relFile}`
          );
        }
        assert.ok(
          html.includes(`<link rel="alternate" hreflang="x-default" href="${getPageUrl('en', page)}">`),
          `missing hreflang=x-default in ${relFile}`
        );
        assert.ok(
          html.includes(`<meta name="twitter:image" content="${SITE_BASE_URL}/assets/icon128.png">`),
          `missing twitter:image in ${relFile}`
        );
        const ogAltMatches = [...html.matchAll(/property="og:locale:alternate"/g)];
        assert.equal(ogAltMatches.length, 2, `expected 2 og:locale:alternate tags in ${relFile}`);

        // 1b. English pages contain zero Chinese characters outside #langSelect
        if (locale === 'en') {
          const withoutLangSelect = html.replace(/<select id="langSelect"[\s\S]*?<\/select>/, '');
          assert.ok(!CJK_PATTERN.test(withoutLangSelect), `unexpected Chinese characters found in ${relFile}`);
        }

        // 2. JSON-LD parses cleanly and matches page schema
        const ldMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
        assert.ok(ldMatch, `missing JSON-LD in ${relFile}`);
        const ld = JSON.parse(ldMatch[1]);
        if (page === 'overview') {
          assert.equal(ld['@graph'][0]['@type'], 'SoftwareApplication');
          assert.equal(ld['@graph'][1]['@type'], 'WebSite');
        } else if (page === 'sites') {
          assert.equal(ld['@type'], 'CollectionPage');
          assert.equal(ld.mainEntity['@type'], 'ItemList');
          assert.equal(ld.mainEntity.itemListElement.length, COMMUNITIES.length);
        } else if (page === 'guide') {
          assert.equal(ld['@type'], 'TechArticle');
        } else if (page === 'faq') {
          assert.equal(ld['@type'], 'FAQPage');
          assert.equal(ld.mainEntity.length, FAQ_ITEMS.length);
        }

        // 3. Relative links between all pages and locales resolve to existing index.html files
        const fromDir = path.join(tmpDir, getPageDir(locale, page));
        for (const targetPage of PAGES) {
          const href = getRelativeHref(locale, page, locale, targetPage);
          const resolvedIndex = path.resolve(fromDir, href, 'index.html');
          assert.ok(fs.existsSync(resolvedIndex), `broken nav link from ${relFile} to ${targetPage}: ${href} -> ${resolvedIndex}`);
        }
        for (const targetLocale of LOCALES) {
          const href = getRelativeHref(locale, page, targetLocale, page);
          const resolvedIndex = path.resolve(fromDir, href, 'index.html');
          assert.ok(fs.existsSync(resolvedIndex), `broken lang link from ${relFile} to ${targetLocale}: ${href} -> ${resolvedIndex}`);
        }

        // 4. External target="_blank" links include rel="noopener noreferrer"
        for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
          assert.match(match[0], /rel="noopener noreferrer"/, `missing rel="noopener noreferrer" in ${relFile}: ${match[0]}`);
        }

        // 5. Language dropdown & browser language auto-detection
        assert.ok(html.includes('grid-template-columns: minmax(0, 1fr)'), `missing mobile minmax(0, 1fr) in ${relFile}`);
        assert.match(html, /<select id="langSelect" class="lang-select"/);
        assert.ok(html.includes('forumind-site-locale'), `missing browser locale detection in ${relFile}`);

        // 6. Page-specific DOM assertions
        if (page === 'overview') {
          assert.match(html, /id="simStage"/);
          assert.match(html, /id="tab-summary"[^>]*aria-selected="true"[^>]*tabindex="0"/);
          assert.match(html, /id="tab-chat"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
          assert.match(html, /id="tab-agent"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
        } else if (page === 'sites') {
          const cardMatches = [...html.matchAll(/<a class="site-card" data-id="[a-z0-9]+"/g)];
          assert.equal(cardMatches.length, COMMUNITIES.length);
          assert.ok(html.includes('URLSearchParams(window.location.search)'));
          assert.ok(html.includes('fetch(SITES_DATA_URL)'));
          assert.ok(html.includes('data/sites.json'));
          assert.ok(html.includes('https://www.uscardforum.com'));
          assert.ok(html.includes('https://www.doctorofcredit.com'));
          assert.ok(html.includes('https://www.uscreditcardguide.com'));
          assert.ok(html.includes('https://www.reddit.com'));
          assert.ok(html.includes('https://linux.do'));
        } else if (page === 'guide') {
          assert.match(html, /id="providers"/);
          assert.match(html, /id="settings-guide"/);
          assert.match(html, /id="permissions"/);
          assert.match(html, /id="privacy"/);
          assert.match(html, /id="github-install"/);
          assert.match(html, /class="icon-feature-list"/);
          assert.ok(!html.includes('strips the extension <code>Origin</code> header'));
          assert.ok(html.includes('OpenAI'));
          // Store links appear before GitHub Releases in the install section
          const storeIdx = html.indexOf(CHROME_STORE_URL);
          const edgeIdx = html.indexOf(EDGE_ADDONS_URL);
          const ghReleaseIdx = html.indexOf(GITHUB_RELEASES_URL);
          assert.ok(storeIdx > 0 && edgeIdx > 0 && ghReleaseIdx > storeIdx, 'Store install links should appear before GitHub Releases');
        } else if (page === 'faq') {
          for (const item of FAQ_ITEMS) {
            assert.ok(html.includes(`id="${item.id}"`), `missing FAQ item ${item.id} in ${relFile}`);
          }
        }
      }
    }

    // Check 404.html, sitemap.xml, and robots.txt
    const notFound = fs.readFileSync(path.join(tmpDir, '404.html'), 'utf8');
    assert.ok(notFound.includes('forumind-site-theme'));
    assert.ok(notFound.includes(`${SITE_BASE_URL}/assets/icon128.png`));
    const sitemap = fs.readFileSync(path.join(tmpDir, 'sitemap.xml'), 'utf8');
    for (const locale of LOCALES) {
      for (const page of PAGES) {
        assert.ok(sitemap.includes(`<loc>${getPageUrl(locale, page)}</loc>`));
      }
    }
    const robots = fs.readFileSync(path.join(tmpDir, 'robots.txt'), 'utf8');
    assert.ok(robots.includes(`Sitemap: ${SITE_BASE_URL}/sitemap.xml`));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
