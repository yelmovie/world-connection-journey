// 무거운 자산 정리: (1) 매니페스트가 참조하는 PNG → webp 변환, (2) 아무 데서도 참조하지 않는 public/assets 파일 → _unused/assets/unreferenced 로 이동(삭제 없음)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execSync } = require('child_process');

const MANIFEST = 'src/content/asset-manifest.json';
const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const a = m.assets || m;
const refs = new Map();
for (const [k, e] of Object.entries(a)) if (e.src) refs.set(e.src.replace(/^assets\//, ''), k);

const files = [];
const walk = (d, rel = '') => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n), r = rel ? rel + '/' + n : n; const st = fs.statSync(p); if (st.isDirectory()) walk(p, r); else files.push({ r, size: st.size, p }); } };
walk('public/assets');

(async () => {
  // 1) 참조 중인 PNG → webp
  let saved = 0;
  for (const f of files.filter((x) => /\.png$/i.test(x.r) && refs.has(x.r))) {
    const key = refs.get(f.r);
    const out = f.p.replace(/\.png$/i, '.webp');
    const meta = await sharp(f.p).metadata();
    const hasAlpha = meta.hasAlpha;
    await sharp(f.p).webp(hasAlpha ? { quality: 88, alphaQuality: 90 } : { quality: 82 }).toFile(out);
    const outSize = fs.statSync(out).size;
    a[key].src = 'assets/' + f.r.replace(/\.png$/i, '.webp');
    if (hasAlpha) a[key].alpha = true;
    const dest = path.join('_unused/assets', f.r); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(f.p, dest);
    saved += f.size - outSize;
    console.log('webp', f.r, Math.round(f.size / 1024) + 'KB →', Math.round(outSize / 1024) + 'KB');
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
  // 2) 미참조 파일 이동 — 코드·HTML·CSS·웹매니페스트에서 파일명이 한 번도 안 나오는 것만
  const haystack = execSync('git ls-files src index.html public/*.html public/*.webmanifest public/*.json 2>/dev/null || true', { encoding: 'utf8' }).split('\n').filter(Boolean).map((p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }).join('\n');
  let moved = 0, movedBytes = 0;
  for (const f of files.filter((x) => !refs.has(x.r) && fs.existsSync(x.p))) {
    const base = path.basename(f.r);
    if (haystack.includes(base) || haystack.includes(f.r)) { console.log('keep (코드 참조)', f.r); continue; }
    const dest = path.join('_unused/assets/unreferenced', f.r); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.renameSync(f.p, dest);
    moved++; movedBytes += f.size;
  }
  console.log(`이동 ${moved}개 · ${(movedBytes / 1048576).toFixed(1)}MB → _unused/assets/unreferenced · webp 절감 ${(saved / 1048576).toFixed(1)}MB`);
})();
