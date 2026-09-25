// Opens a built extension page (served from dist/) in its own browser context
// with the chrome.* stub installed, the network sealed off, and page errors
// collected.
import { installChromeStub } from './chrome-stub.mjs';

export const POPUP = 'src/popup/popup.html';
export const SETTINGS = 'src/settings/settings.html';

// `routes` answer chosen network requests instead: each is
// (url, request) => ({ status, body }) | null, tried in order (runs in Node,
// so it may inspect request headers). `requests` records every non-page
// request (method and URL) for assertions.
export async function openExtensionPage(browser, base, {
  pagePath = POPUP, theme = 'light', width = 460, height = 1000, deviceScaleFactor = 1, stub = {}, settle = 700,
  routes = []
} = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor, colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  // Never reach the real network: model lists and connection tests get a
  // well-formed empty answer, images and favicons a 404.
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (/favicon|\.png|\.ico|\.svg/.test(url)) return route.fulfill({ status: 404, body: '' });
    requests.push({ method: route.request().method(), url });
    for (const answer of routes) {
      const response = answer(url, route.request());
      if (response) {
        return route.fulfill({
          status: response.status ?? 200,
          contentType: 'application/json',
          body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body ?? {})
        });
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[],"models":[]}' });
  });
  await page.addInitScript(installChromeStub, stub);
  await page.goto(`${base}/${pagePath}`);
  await page.waitForTimeout(settle);
  return { ctx, page, errors, requests };
}

// Writes records the way the background saves them. The page must already
// have opened (and so created) the database; reload afterwards to render them.
export async function seedHistory(page, { sessions = [], entries = [], activities = [] }) {
  await page.evaluate(({ sessions, entries, activities }) => new Promise((resolve, reject) => {
    const open = indexedDB.open('discourse-copilot-history');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['topicSessions', 'topicIndex', 'agentActivities'], 'readwrite');
      for (const s of sessions) tx.objectStore('topicSessions').put(s);
      for (const e of entries) tx.objectStore('topicIndex').put(e);
      for (const a of activities) tx.objectStore('agentActivities').put(a);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { sessions, entries, activities });
}

// Every brand image (logo, wordmark) on the page decoded.
export function brandImagesLoaded(page) {
  return page.evaluate(() => [...document.images]
    .filter(i => i.src.includes('/brand/'))
    .every(i => i.complete && i.naturalWidth > 0));
}

// Favicon <link>s that don't resolve.
export async function brokenIconLinks(page) {
  const hrefs = await page.$$eval('link[rel~="icon"]', links => links.map(l => l.href));
  const broken = [];
  for (const href of hrefs) {
    const response = await fetch(href).catch(() => null);
    if (!response?.ok) broken.push(href);
  }
  return broken;
}
