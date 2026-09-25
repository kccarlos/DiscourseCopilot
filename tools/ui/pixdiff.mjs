// Compares PNGs pixel by pixel.
//   node tools/ui/pixdiff.mjs a.png b.png
//   node tools/ui/pixdiff.mjs dirA dirB [file.png ...]   (default: every PNG in dirA)
import fs from 'node:fs';
import path from 'node:path';
import { compareDirs, compareImages, describeDiff } from './lib/pixdiff.mjs';

const [a, b, ...names] = process.argv.slice(2);
if (!a || !b) {
  console.error('Usage: node tools/ui/pixdiff.mjs <a.png|dirA> <b.png|dirB> [file.png ...]');
  process.exit(2);
}

if (fs.statSync(a).isDirectory()) {
  const files = names.length ? names : fs.readdirSync(a).filter(f => f.endsWith('.png')).sort();
  process.exit((await compareDirs(a, b, files)) ? 0 : 1);
} else {
  const result = await compareImages(a, b);
  console.log(`${path.basename(a)}: ${describeDiff(result)}`);
  process.exit(result.sameSize && !result.differing ? 0 : 1);
}
