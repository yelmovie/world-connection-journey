import sharp from 'sharp';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'public', 'assets');
const photos = [
  ['djembe', 'assets/africa_photo_djembe.jpg', 'centre'],
  ['talkingdrum', 'assets/africa_photo_talking_drum.jpg', 'centre'],
  ['shekere', 'assets/africa_photo_shekere.jpg', 'centre'],
  ['kalimba', 'assets/africa_photo_kalimba.jpg', 'centre'],
  ['kora', 'assets/africa_photo_kora.jpg', 'attention']
];

await mkdir(outDir, { recursive: true });
for (const [name, relativeSource, position] of photos) {
  const source = path.join(root, relativeSource);
  await access(source);
  await sharp(source)
    .rotate()
    .resize(640, 420, { fit: 'cover', position, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(outDir, `africa_photo_${name}.webp`));
  console.log(`built africa.photo.${name}`);
}
