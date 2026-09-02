/**
 * 사진 자리(placeholder) PNG 생성 — 아직 없는 그림 자리를 눈에 보이는 안내판으로 채운다.
 * 실제 그림이 준비되면 같은 파일명으로 덮어쓰면 된다(docs/IMAGE_PROMPTS_UK_USA.md).
 *   node scripts/make-placeholders.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'public', 'assets');
const ITEMS = [
  { file: 'europe_uk_dover.png', w: 1280, h: 720, title: '영국 · 도버의 흰 절벽 해안', sub: '사진 준비 중' },
  { file: 'europe_uk_thames.png', w: 1280, h: 720, title: '영국 · 런던 템스강 곁 등굣길', sub: '사진 준비 중' },
  { file: 'europe_uk_edinburgh.png', w: 1280, h: 720, title: '영국 · 에든버러의 옛 성과 도시', sub: '사진 준비 중' },
  { file: 'americas_scene_usa_west.png', w: 1280, h: 720, title: '미국 · 서부 해안', sub: '사진 준비 중' },
  { file: 'americas_scene_usa_plains.png', w: 1280, h: 720, title: '미국 · 중부 대평원', sub: '사진 준비 중' },
  { file: 'americas_scene_usa_east.png', w: 1280, h: 720, title: '미국 · 동부 도시', sub: '사진 준비 중' },
  { file: 'americas_scene_usa_landmark.png', w: 1280, h: 720, title: '미국 · 뉴욕 자유의 여신상', sub: '사진 준비 중' },
  { file: 'americas_student5.png', w: 900, h: 1200, title: '리암', sub: '캐릭터 준비 중', transparent: true }
];

(async () => {
  const browser = await chromium.launch();
  for (const item of ITEMS) {
    const target = path.join(OUT, item.file);
    if (fs.existsSync(target) && !process.argv.includes('--force')) { console.log('skip (있음)', item.file); continue; }
    const page = await browser.newPage({ viewport: { width: item.w, height: item.h } });
    const bg = item.transparent ? 'transparent' : 'linear-gradient(135deg,#dfeef5,#f6f1de)';
    await page.setContent(`<html><body style="margin:0;width:${item.w}px;height:${item.h}px;background:${bg};display:grid;place-items:center;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif">
      <div style="display:grid;justify-items:center;gap:${Math.round(item.h * 0.02)}px;${item.transparent ? 'padding:40px;border-radius:40px;background:rgba(255,255,255,.55);border:4px dashed #8aa6bf' : ''}">
        <div style="width:${Math.round(item.h * 0.22)}px;height:${Math.round(item.h * 0.22)}px;border-radius:50%;border:6px dashed #8aa6bf;display:grid;place-items:center;font-size:${Math.round(item.h * 0.1)}px;color:#8aa6bf">🖼</div>
        <div style="font-size:${Math.round(item.h * 0.06)}px;font-weight:900;color:#2b4a66;text-align:center">${item.title}</div>
        <div style="font-size:${Math.round(item.h * 0.035)}px;font-weight:700;color:#6b8398">${item.sub}</div>
      </div></body></html>`);
    await page.screenshot({ path: target, omitBackground: !!item.transparent });
    await page.close();
    console.log('made', item.file);
  }
  await browser.close();
})();
