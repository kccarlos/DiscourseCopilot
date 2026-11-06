import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, PAGES } from './site-data.mjs';
import { getPageFilePath, renderNotFoundPage, renderRobotsTxt, renderSitemapXml, renderSitePage } from './site-render.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

export function buildSite({ outDir = path.join(REPO_ROOT, 'build/site') } = {}) {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version || '3.0.2';

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const writtenFiles = [];

  for (const locale of LOCALES) {
    for (const page of PAGES) {
      const relFile = getPageFilePath(locale, page);
      const fullPath = path.join(outDir, relFile);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      const html = renderSitePage({ locale, page, version });
      fs.writeFileSync(fullPath, html, 'utf8');
      writtenFiles.push(relFile);
    }
  }

  const notFoundPath = path.join(outDir, '404.html');
  fs.writeFileSync(notFoundPath, renderNotFoundPage(), 'utf8');
  writtenFiles.push('404.html');

  const sitemapPath = path.join(outDir, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, renderSitemapXml(), 'utf8');
  writtenFiles.push('sitemap.xml');

  const robotsPath = path.join(outDir, 'robots.txt');
  fs.writeFileSync(robotsPath, renderRobotsTxt(), 'utf8');
  writtenFiles.push('robots.txt');

  const noJekyllPath = path.join(outDir, '.nojekyll');
  fs.writeFileSync(noJekyllPath, '', 'utf8');
  writtenFiles.push('.nojekyll');

  const assetsDir = path.join(outDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  const srcIcon = path.join(REPO_ROOT, 'public/icon128.png');
  if (fs.existsSync(srcIcon)) {
    fs.copyFileSync(srcIcon, path.join(assetsDir, 'icon128.png'));
    writtenFiles.push('assets/icon128.png');
  }

  return { outDir, version, writtenFiles };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = buildSite();
  console.log(`Built Forumind static site (v${result.version}): ${result.writtenFiles.length} files -> ${result.outDir}`);
}
