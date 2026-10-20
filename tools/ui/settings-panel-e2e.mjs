// Real-Chromium check of Settings inside the side panel: loads dist/ as an
// extension (no chrome.* stand-in), opens the side panel's page
// (chrome-extension://<id>/src/popup/popup.html) in a tab and drives the
// Settings view, whose page runs in an iframe of the same extension.
//
//   node tools/ui/settings-panel-e2e.mjs [--dist=dist]
//
// Proves: the iframe loads from the extension origin, a Save inside it writes
// chrome.storage and the panel's header follows without a reload, leaving with
// unsaved edits asks inline, openOptionsPage is never called, the standalone
// options page is unchanged, and a click inside the frame can call
// chrome.permissions.request (the browser's prompt itself cannot be answered
// in automation, so the request stays pending, exactly as from a top-level page).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { REPO, parseArgs } from './lib/env.mjs';

const args = parseArgs();
const dist = path.resolve(REPO, typeof args.dist === 'string' ? args.dist : 'dist');
if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
  console.error(`${path.relative(REPO, dist)}/ is missing. Run \`pnpm build\` first.`);
  process.exit(2);
}

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-settings-panel-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
});

try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const id = new URL(worker.url()).host;
  const panelUrl = `chrome-extension://${id}/src/popup/popup.html`;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 460, height: 700 });
  await page.goto(panelUrl);
  await page.evaluate(() => chrome.storage.local.set({ selectedProvider: 'openai', openaiApiKey: 'sk-test', openaiModel: 'gpt-4o-mini' }));
  await page.reload();
  await page.waitForSelector('#modelChipBtn:not(.hidden)');
  await page.evaluate(() => {
    window.__opened = 0;
    try {
      chrome.runtime.openOptionsPage = () => {
        window.__opened++;
      };
    } catch {
      // read-only in this build; the check below then only proves no new tab opened
    }
  });
  const tabsBefore = context.pages().length;
  const chipText = () => page.$eval('#modelChipBtn', el => el.textContent.trim().replace(/\s+/g, ' '));
  const frameOf = async () => {
    await page.waitForFunction(() => document.getElementById('settingsFrame')?.contentWindow?.settingsInstance?.form, null, {
      timeout: 8000
    });
    return page.frames().find(frame => frame.url().includes('/src/settings/settings.html'));
  };

  // 1. The chip opens Settings in the panel, at the provider section.
  await page.click('#modelChipBtn');
  const frame = await frameOf();
  check('side panel URL is the real extension page', page.url() === panelUrl, page.url());
  check(
    'iframe loads from the extension origin',
    frame?.url().startsWith(`chrome-extension://${id}/src/settings/settings.html?embedded=1`),
    frame?.url()
  );
  check('no new tab opened', context.pages().length === tabsBefore);
  check('openOptionsPage not called', (await page.evaluate(() => window.__opened)) === 0);
  check('embedded page hides its own header', await frame.$eval('.header', el => getComputedStyle(el).display === 'none'));
  check(
    'chrome.* is available in the frame',
    await frame.evaluate(() => typeof chrome.storage?.local?.set === 'function' && typeof chrome.permissions?.request === 'function')
  );
  check('save bar is visible in the frame', await frame.$eval('#saveBtn', el => el.getBoundingClientRect().bottom <= window.innerHeight));

  // 2. Unsaved edits ask inline.
  await frame.fill('#openaiModel', 'gpt-4o');
  await page.click('#closeSettingsBtn');
  check('leaving with edits asks inline', await page.$eval('#settingsLeave', el => !el.classList.contains('hidden')));
  await page.click('#settingsLeaveKeep');

  // 3. Save: storage changes, the panel header follows without a reload.
  await frame.click('#saveBtn');
  await page
    .waitForFunction(
      () =>
        document.getElementById('modelChipLabel')?.textContent.includes('gpt-4o')
        && !document.getElementById('modelChipLabel').textContent.includes('mini'),
      null,
      { timeout: 5000 }
    )
    .catch(() => {});
  check('header model follows the save', (await chipText()) === 'OpenAI · gpt-4o', await chipText());
  check('stored value changed', (await page.evaluate(() => chrome.storage.local.get('openaiModel'))).openaiModel === 'gpt-4o');
  await page.click('#closeSettingsBtn');
  check('closes without a question after saving', await page.$eval('#settingsView', el => el.classList.contains('hidden')));

  // 4. A click inside the frame can call chrome.permissions.request.
  await page.click('#settingsBtn');
  const second = await frameOf();
  await second.evaluate(() => {
    window.__perm = 'not called';
    const button = document.createElement('button');
    button.id = 'permProbe';
    button.textContent = 'probe';
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;width:90px;height:32px';
    document.body.prepend(button);
    button.addEventListener('click', () => {
      try {
        chrome.permissions.request({ origins: ['http://my-nas.local/*'] }).then(
          granted => {
            window.__perm = `resolved ${granted}`;
          },
          error => {
            window.__perm = `rejected: ${error.message}`;
          }
        );
        window.__perm = 'pending';
      } catch (error) {
        window.__perm = `threw: ${error.message}`;
      }
    });
  });
  await second.click('#permProbe');
  await page.waitForTimeout(1500);
  const permission = await second.evaluate(() => window.__perm);
  check(
    'permissions.request from a click in the frame is accepted',
    permission === 'pending' || permission.startsWith('resolved'),
    permission
  );

  // 5. A requested section scrolls into view (short window so the page must scroll).
  await page.click('#closeSettingsBtn').catch(() => {});
  const sectionPage = await context.newPage();
  await sectionPage.setViewportSize({ width: 460, height: 500 });
  await sectionPage.goto(`chrome-extension://${id}/src/settings/settings.html?embedded=1&welcome=1&section=forumAccess`);
  await sectionPage.waitForTimeout(1200);
  const top = await sectionPage.$eval('#forumAccessHeading', el => el.getBoundingClientRect().top);
  check(
    'requested section is scrolled into view',
    (await sectionPage.evaluate(() => window.scrollY)) > 0 && top >= 0 && top < 200,
    String(top)
  );
  check('welcome banner ignored when embedded', await sectionPage.$eval('#welcomeHeader', el => getComputedStyle(el).display === 'none'));

  // 6. The standalone options page keeps its header and welcome mode.
  const options = await context.newPage();
  await options.setViewportSize({ width: 900, height: 700 });
  await options.goto(`chrome-extension://${id}/src/settings/settings.html?welcome=1`);
  await options.waitForTimeout(800);
  check('standalone page keeps its header', await options.$eval('.header', el => getComputedStyle(el).display !== 'none'));
  check('standalone page keeps the welcome banner', await options.$eval('#welcomeHeader', el => getComputedStyle(el).display !== 'none'));
  check('standalone page is not in embedded mode', await options.evaluate(() => !document.documentElement.classList.contains('embedded')));

  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await context.close();
}
process.exit(failed ? 1 : 0);
