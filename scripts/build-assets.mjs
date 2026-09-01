// Builds public/assets/*.webp from scripts/asset-map.json (semantic id -> original file).
// Also: og.png -> og.webp (1200x630), plane.main -> favicon.webp (64x64),
// and writes src/content/asset-manifest.json + a stats JSON for the audit doc.
// Usage: node scripts/build-assets.mjs [quality-bg] [quality-char]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'asset-map.json'), 'utf8'));
const outDir = path.join(root, 'public', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(root, 'src', 'content'), { recursive: true });

const Q_BG = Number(process.argv[2] ?? 78);
const Q_CHAR = Number(process.argv[3] ?? 82);
const KINDS = {
  bg:   { resize: { width: 1600 }, quality: Q_BG },
  photo:{ resize: { width: 1600 }, quality: Q_BG },
  logo: { resize: { width: 1024 }, quality: Q_CHAR },
  char: { resize: { width: 512, height: 512, fit: 'inside' }, quality: Q_CHAR },
  deco: { resize: { width: 384, height: 384, fit: 'inside' }, quality: Q_CHAR },
  icon: { resize: { width: 256, height: 256, fit: 'inside' }, quality: Q_CHAR },
};

const manifest = { schemaVersion: 1, assets: {} };
const stats = [];
for (const [id, e] of Object.entries(map)) {
  if (id === '__missing__') continue;
  const src = path.join(root, e.original);
  const outName = id.replace(/\./g, '_').toLowerCase() + '.webp';
  const k = KINDS[e.kind];
  const meta = await sharp(src).metadata();
  const hasAlpha = !!meta.hasAlpha;
  await sharp(src).resize({ ...k.resize, withoutEnlargement: true })
    .webp({ quality: k.quality }).toFile(path.join(outDir, outName));
  const kb = Math.round(fs.statSync(path.join(outDir, outName)).size / 1024);
  manifest.assets[id] = {
    type: 'image', src: `assets/${outName}`, original: e.original,
    pages: e.pages, preload: e.preload, alpha: hasAlpha,
    license: 'AI-generated (project original)', note: e.note,
  };
  stats.push({ id, original: e.original, res: `${meta.width}x${meta.height}`, alpha: hasAlpha, kb, pages: e.pages.join(' ') });
}

// og + favicon
await sharp(path.join(root, 'og.png')).resize(1200, 630, { fit: 'cover' })
  .webp({ quality: Q_BG }).toFile(path.join(outDir, 'og.webp'));
const planeSrc = path.join(root, map['plane.main'].original);
await sharp(planeSrc).resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .webp({ quality: 90 }).toFile(path.join(outDir, 'favicon.webp'));

fs.writeFileSync(path.join(root, 'src', 'content', 'asset-manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(root, 'scripts', 'build-stats.json'), JSON.stringify(stats, null, 2));

const total = fs.readdirSync(outDir).filter(f => f.endsWith('.webp'))
  .reduce((s, f) => s + fs.statSync(path.join(outDir, f)).size, 0);
console.log('converted:', stats.length, '+ og.webp + favicon.webp');
console.log('total public/assets:', (total / 1024 / 1024).toFixed(2), 'MB');
