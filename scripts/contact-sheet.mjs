// Contact sheets: thumbnails with index numbers + index->filename mapping JSON.
// Usage: node scripts/contact-sheet.mjs <outDir>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2];
if (!outDir) { console.error('need outDir'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

const CELL = 200, LABEL = 24, COLS = 5, PER_SHEET = 25;
const groups = [
  { name: 'assets', dir: path.join(root, 'assets') },
  { name: 'background', dir: path.join(root, 'background') },
  { name: '3dassets', dir: path.join(root, '3d assets') },
  { name: 'title', dir: path.join(root, 'title') },
];

const mapping = {};
for (const g of groups) {
  const files = fs.readdirSync(g.dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  mapping[g.name] = {};
  for (let s = 0; s * PER_SHEET < files.length; s++) {
    const chunk = files.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
    const rows = Math.ceil(chunk.length / COLS);
    const W = COLS * CELL, H = rows * (CELL + LABEL);
    const composites = [];
    for (let i = 0; i < chunk.length; i++) {
      const idx = s * PER_SHEET + i;
      mapping[g.name][idx] = chunk[i];
      const col = i % COLS, row = Math.floor(i / COLS);
      const thumb = await sharp(path.join(g.dir, chunk[i]))
        .resize(CELL, CELL, { fit: 'contain', background: { r: 235, g: 235, b: 235, alpha: 1 } })
        .flatten({ background: { r: 235, g: 235, b: 235 } })
        .png().toBuffer();
      composites.push({ input: thumb, left: col * CELL, top: row * (CELL + LABEL) });
      const label = Buffer.from(
        `<svg width="${CELL}" height="${LABEL}"><rect width="100%" height="100%" fill="#222"/>` +
        `<text x="6" y="17" font-family="Arial" font-size="16" fill="#fff">#${idx}</text></svg>`);
      composites.push({ input: label, left: col * CELL, top: row * (CELL + LABEL) + CELL });
    }
    const out = path.join(outDir, `${g.name}_${s}.png`);
    await sharp({ create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .composite(composites).png().toFile(out);
    console.log('wrote', out, chunk.length, 'cells');
  }
}
fs.writeFileSync(path.join(outDir, 'mapping.json'), JSON.stringify(mapping, null, 2));
console.log('mapping.json written');
