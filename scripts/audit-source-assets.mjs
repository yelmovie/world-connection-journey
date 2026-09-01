// 소스 연결률 감사. 브라우저의 실제 렌더 감사와 구분해서 사용한다.
// Usage: node scripts/audit-source-assets.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'src', 'content', 'asset-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const assetIds = Object.keys(manifest.assets);
const targetCount = Math.ceil(assetIds.length * 0.8);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|css|html|json)$/.test(entry.name) ? [full] : [];
  });
}

const sourceFiles = [
  ...walk(path.join(root, 'src', 'pages')),
  ...walk(path.join(root, 'src', 'ui')),
  ...walk(path.join(root, 'src', 'styles')),
  ...walk(path.join(root, 'public', 'content'))
];
const sources = sourceFiles.map((file) => ({
  file: path.relative(root, file).replaceAll('\\', '/'),
  text: fs.readFileSync(file, 'utf8')
}));

const referenced = [];
const referenceFiles = {};
for (const id of assetIds) {
  const files = sources.filter(({ text }) => text.includes(id)).map(({ file }) => file);
  if (files.length) {
    referenced.push(id);
    referenceFiles[id] = files;
  }
}

const missingFiles = assetIds.filter((id) => {
  const src = manifest.assets[id]?.src;
  return typeof src !== 'string' || !fs.existsSync(path.join(root, 'public', src));
});
const unreferenced = assetIds.filter((id) => !referenced.includes(id));
const coverage = Number(((referenced.length / assetIds.length) * 100).toFixed(1));

const report = {
  note: '이 수치는 소스 연결률이다. 실제 렌더 여부는 브라우저 화면별 data-asset-id 감사로 별도 확인해야 한다.',
  manifestAssets: assetIds.length,
  targetAssets: targetCount,
  sourceReferenced: referenced.length,
  sourceCoveragePercent: coverage,
  missingPublicFiles: missingFiles,
  unreferenced,
  referenceFiles
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--check') && (referenced.length < targetCount || missingFiles.length > 0)) {
  process.exitCode = 1;
}
