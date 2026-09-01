import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const generatedDir = path.join(root, 'public', 'assets', 'generated');
const outputDir = path.join(root, 'public', 'assets');

const travelers = [
  ['camille', 'europe_traveler_camille-v1-chroma.png'],
  ['lina', 'europe_traveler_lina-v1-chroma.png'],
  ['zofia', 'europe_traveler_zofia-v1-chroma.png'],
  ['adam', 'europe_traveler_adam-v1-chroma.png'],
  ['luca', 'europe_traveler_luca-v1-chroma.png'],
  ['eleni', 'europe_traveler_eleni-v1-chroma.png'],
];

const key = [255, 0, 255];
const opaqueChroma = 18;
const transparentChroma = 215;

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

await fs.mkdir(outputDir, { recursive: true });

for (const [name, sourceName] of travelers) {
  const source = path.join(generatedDir, sourceName);
  const { data, info } = await sharp(source)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);

  for (let sourceIndex = 0, targetIndex = 0; sourceIndex < data.length; sourceIndex += 3, targetIndex += 4) {
    const red = data[sourceIndex];
    const green = data[sourceIndex + 1];
    const blue = data[sourceIndex + 2];
    // Magenta background variations keep red and blue well above green. This
    // score is more stable than RGB distance when the generated key contains
    // subtle tonal noise.
    const magentaChroma = Math.min(red, blue) - green;
    let alpha = 1 - smoothstep((magentaChroma - opaqueChroma) / (transparentChroma - opaqueChroma));
    if (alpha < 0.045) alpha = 0;
    if (alpha > 0.985) alpha = 1;

    if (alpha <= 0.001) {
      rgba[targetIndex] = 0;
      rgba[targetIndex + 1] = 0;
      rgba[targetIndex + 2] = 0;
      rgba[targetIndex + 3] = 0;
      continue;
    }

    // Recover foreground colour from pixels blended with the magenta key.
    rgba[targetIndex] = Math.max(0, Math.min(255, Math.round((red - (1 - alpha) * key[0]) / alpha)));
    rgba[targetIndex + 1] = Math.max(0, Math.min(255, Math.round((green - (1 - alpha) * key[1]) / alpha)));
    rgba[targetIndex + 2] = Math.max(0, Math.min(255, Math.round((blue - (1 - alpha) * key[2]) / alpha)));
    rgba[targetIndex + 3] = Math.round(alpha * 255);
  }

  const destination = path.join(outputDir, `europe_traveler_${name}-v1.webp`);
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ quality: 92, alphaQuality: 100, smartSubsample: true })
    .toFile(destination);

  const metadata = await sharp(destination).metadata();
  console.log(`${path.basename(destination)} ${metadata.width}x${metadata.height} ${metadata.hasAlpha ? 'alpha' : 'opaque'}`);
}
