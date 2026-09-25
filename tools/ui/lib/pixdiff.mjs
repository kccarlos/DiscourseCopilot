// Pixel comparison of two PNGs (sharp, no browser).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// A pixel "differs" when |ΔR|+|ΔG|+|ΔB| exceeds `threshold`; small deltas are
// anti-aliasing and palette quantization noise.
export async function compareImages(fileA, fileB, { threshold = 30 } = {}) {
  const [a, b] = await Promise.all([fileA, fileB].map(f => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  const size = [a.info.width, a.info.height];
  const sizeB = [b.info.width, b.info.height];
  if (size[0] !== sizeB[0] || size[1] !== sizeB[1]) return { sameSize: false, size, sizeB };
  let differing = 0;
  let minX = Infinity,
    minY = Infinity,
    maxX = -1,
    maxY = -1;
  const { width, height } = a.info;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const delta = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (delta > threshold) {
        differing++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return {
    sameSize: true,
    size,
    differing,
    ratio: differing / (width * height),
    box: differing ? [minX, minY, maxX, maxY] : null
  };
}

export function describeDiff(result) {
  if (!result.sameSize) return `size differs: ${result.size.join('x')} vs ${result.sizeB.join('x')}`;
  if (!result.differing) return 'identical (within threshold)';
  return `${result.differing} px differ (${(result.ratio * 100).toFixed(2)}%), box ${result.box.join(',')}`;
}

// Compares every file in `files` between two directories; returns true when
// all have the same size and at most `maxRatio` of their pixels differ.
export async function compareDirs(dirA, dirB, files, { maxRatio = 0.001 } = {}) {
  let ok = true;
  for (const file of files) {
    const a = path.join(dirA, file);
    const b = path.join(dirB, file);
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
      console.log(`  ${file}: missing on one side`);
      ok = false;
      continue;
    }
    const result = await compareImages(a, b);
    const close = result.sameSize && result.ratio <= maxRatio;
    if (!close) ok = false;
    console.log(`  ${close ? 'match' : 'DIFF '} ${file}: ${describeDiff(result)}`);
  }
  return ok;
}
