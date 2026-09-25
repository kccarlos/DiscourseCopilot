import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';

// Which top-level folders under src/ each layer may import from. The service
// worker, the content script and the shared modules never depend on a page
// (popup/ or settings/); pages don't depend on each other.
const ALLOWED_IMPORTS = {
  shared: ['shared'],
  services: ['services', 'shared'],
  content: ['content', 'shared'],
  background: ['background', 'services', 'shared'],
  popup: ['popup', 'services', 'shared'],
  settings: ['settings', 'services', 'shared']
};

const SRC = resolve(import.meta.dirname, '..', 'src');
const SOURCE_FILE = /\.(m?js)$/;
const IMPORT_PATTERNS = [
  /\bimport\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bexport\s[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
];

function importSpecifiers(source) {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

function layerOf(absolutePath) {
  const rel = relative(SRC, absolutePath);
  if (rel.startsWith('..')) {
    return null;
  }
  return rel.split(sep)[0];
}

function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith('@/')) {
    return join(SRC, specifier.slice(2));
  }
  if (specifier.startsWith('.')) {
    return resolve(dirname(fromFile), specifier);
  }
  return null; // a package
}

function layeringViolations(file, source) {
  const from = layerOf(file);
  const allowed = ALLOWED_IMPORTS[from];
  if (!allowed) {
    return [];
  }
  const violations = [];
  for (const specifier of importSpecifiers(source)) {
    const target = resolveSpecifier(file, specifier);
    if (!target) {
      continue;
    }
    const to = layerOf(target);
    if (!allowed.includes(to)) {
      violations.push(`${relative(SRC, file)} (${from}) imports ${specifier} (${to ?? 'outside src'})`);
    }
  }
  return violations;
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });
}

test('every src/ folder is covered by the layering rule', () => {
  const layers = readdirSync(SRC, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(layers, Object.keys(ALLOWED_IMPORTS).sort());
});

test('background, shared, services and content never import a page module', () => {
  const violations = sourceFiles(SRC).flatMap(file => layeringViolations(file, readFileSync(file, 'utf8')));
  assert.deepEqual(violations, []);
});

test('the layering check catches static, re-exported, side-effect and dynamic imports', () => {
  const file = join(SRC, 'background', 'example.mjs');
  const source = [
    "import { a } from '../popup/a.mjs';",
    "import {\n  b\n} from '../settings/b.mjs';",
    "export { c } from '../popup/c.mjs';",
    "import '../popup/d.mjs';",
    "const e = await import('../settings/e.mjs');",
    "import { f } from '../shared/f.mjs';",
    "import { g } from 'ai';"
  ].join('\n');
  assert.equal(layeringViolations(file, source).length, 5);
  assert.deepEqual(layeringViolations(join(SRC, 'shared', 'x.mjs'), "import x from '@/popup/x.mjs';").length, 1);
  assert.deepEqual(layeringViolations(join(SRC, 'popup', 'x.mjs'), "import x from '../shared/x.mjs';"), []);
});
