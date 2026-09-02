// 영국·미국·남아메리카 도장 생성 PNG → webp 변환 + 매니페스트 연결 (1회성)
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SCENES = ['europe_uk_dover', 'europe_uk_thames', 'europe_uk_edinburgh', 'americas_scene_usa_west', 'americas_scene_usa_plains', 'americas_scene_usa_east', 'americas_scene_usa_landmark'];
const ALPHAS = ['americas_student5', 'stamp_americas_south'];
const KEYS = {
  'europe.uk.dover': 'europe_uk_dover', 'europe.uk.thames': 'europe_uk_thames', 'europe.uk.edinburgh': 'europe_uk_edinburgh',
  'americas.scene.usa.west': 'americas_scene_usa_west', 'americas.scene.usa.plains': 'americas_scene_usa_plains',
  'americas.scene.usa.east': 'americas_scene_usa_east', 'americas.scene.usa.landmark': 'americas_scene_usa_landmark',
  'americas.student5': 'americas_student5', 'stamp.americas_south': 'stamp_americas_south'
};

(async () => {
  fs.mkdirSync('_unused/assets', { recursive: true });
  const originals = fs.existsSync('assets/generated/uk-usa') ? fs.readdirSync('assets/generated/uk-usa') : [];
  const findOriginal = (f) => {
    const stem = f.replace('europe_', '').replace('americas_scene_', '');
    return originals.find((n) => n.includes(stem)) || '';
  };
  for (const f of [...SCENES, ...ALPHAS]) {
    const src = `public/assets/${f}.png`;
    const out = `public/assets/${f}.webp`;
    if (!fs.existsSync(src)) { console.log('skip (png 없음)', f); continue; }
    const isAlpha = ALPHAS.includes(f);
    await sharp(src).webp(isAlpha ? { quality: 90, alphaQuality: 90 } : { quality: 82 }).toFile(out);
    fs.renameSync(src, path.join('_unused/assets', `${f}.png`));
    console.log('webp', f, Math.round(fs.statSync(out).size / 1024) + 'KB', isAlpha ? '(alpha)' : '');
  }
  const mp = 'src/content/asset-manifest.json';
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const a = m.assets || m;
  for (const [key, f] of Object.entries(KEYS)) {
    const e = a[key];
    if (!e) { console.log('manifest 없음', key); continue; }
    e.src = `assets/${f}.webp`;
    const orig = findOriginal(f);
    e.original = orig ? `assets/generated/uk-usa/${orig}` : `_unused/assets/${f}.png`;
    e.license = 'AI-generated (project original)';
    e.note = String(e.note || '').replace(' — 사진 준비 중', '').replace('(마추픽추) — 사진 준비 중', '(마추픽추)');
    if (ALPHAS.includes(f)) e.alpha = true;
  }
  fs.writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
  console.log('manifest updated');
})();
