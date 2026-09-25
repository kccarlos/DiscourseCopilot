// Repository paths and command-line parsing shared by the UI runners.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(UI_DIR, '../..');
export const DIST = path.join(REPO, 'dist');
export const OUT = path.join(UI_DIR, 'out');
export const TEMPLATES = path.join(UI_DIR, 'templates');
export const BRAND = path.join(REPO, 'assets', 'brand');

// `--name=value` → { name: 'value' }, `--flag` → { flag: true }.
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match) throw new Error(`Unknown argument: ${arg}`);
    args[match[1]] = match[2] ?? true;
  }
  return args;
}

// `--only=a,b` → a filter function (everything passes without it).
export function onlyFilter(args) {
  const only = typeof args.only === 'string' ? args.only.split(',').filter(Boolean) : null;
  return name => !only || only.includes(name);
}

export function requireDist() {
  if (!fs.existsSync(path.join(DIST, 'src/popup/popup.html'))) {
    console.error('dist/ is missing or incomplete. Run `pnpm build` first.');
    process.exit(2);
  }
}

export function relative(p) {
  return path.relative(REPO, p) || '.';
}
