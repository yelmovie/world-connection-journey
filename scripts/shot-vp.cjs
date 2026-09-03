// 사용: node scripts/shot-vp.cjs 974x601 유럽·연결 [아메리카·lenses ...]  → docs/reviews/shots/<vp>/<name>.png
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
process.argv.splice(2, 0); const [vpArg, ...names] = process.argv.slice(2);
const [w, h] = vpArg.split('x').map(Number);
// qa-sweep의 장면 정의를 재사용
const src = fs.readFileSync(path.join(__dirname, 'qa-sweep.cjs'), 'utf8');
const head = src.slice(0, src.indexOf('/** 한 화면에서 문제를 수집한다'));
const m = {}; new Function('require', 'module', '__dirname', 'process', head + '\nmodule.exports={buildScenes,baseSave,SAVE_KEY,BASE};')(require, m, __dirname, { argv: [], exit(){}, env: process.env });
const { buildScenes, baseSave, SAVE_KEY, BASE } = m.exports;
(async () => {
  const browser = await chromium.launch();
  const out = path.join(__dirname, '..', 'docs', 'reviews', 'shots', vpArg); fs.mkdirSync(out, { recursive: true });
  const scenes = buildScenes().filter((s) => !names.length || names.some((n) => s.name.includes(n)));
  for (const scene of scenes) {
    const save = baseSave(); if (scene.patch) scene.patch(save);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await ctx.addInitScript((a) => { localStorage.setItem(a.key, JSON.stringify(a.save)); }, { key: SAVE_KEY, save });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + '/' + scene.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(1500);
      for (let i = 0; i < 6; i++) { const b = await page.$('.modal-actions button:not([disabled])'); if (!b) break; try { await b.click({ timeout: 800 }); } catch { break; } await page.waitForTimeout(400); }
      if (scene.after) await scene.after(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, scene.name.replace(/[\/\:]/g, '_') + '.png') });
      console.log('ok', scene.name);
    } catch (e) { console.log('fail', scene.name, String(e).slice(0, 80)); }
    await ctx.close();
  }
  await browser.close();
})();
