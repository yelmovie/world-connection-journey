/**
 * 출시 전 화면 전수 점검 — Playwright.
 * 해상도(전자칠판·웹앱·태블릿 가로·실사용 창) × 겉 화면 + 미션 내부 화면 × 팝업 자동 해제 후
 * 글자 잘림 / 패널 밖 잘림 / 빈 버튼 / 버튼 가려짐(실제 클릭 지점) / 터치 영역 / 세로 스크롤 / 빈 여백 /
 * 중복 문구 / 그림 눌림·깨짐 / 콘솔 오류를 모은다.
 *
 *   node scripts/qa-sweep.cjs                        (기본 http://localhost:5273)
 *   node scripts/qa-sweep.cjs http://localhost:4273   (프로덕션 preview)
 *   node scripts/qa-sweep.cjs --mobile                (모바일 가로 844x390 포함)
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:5273';
const WITH_MOBILE = args.includes('--mobile');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7); // 화면 이름 부분 일치 필터
const SAVE_KEY = 'world_connection_journey.save.v1';
const content = (name) => require(path.join(__dirname, '..', 'public', 'content', 'v1', 'ko', `${name}.json`));
const routerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'router.ts'), 'utf8');
const hasRoute = (route) => routerSrc.includes(`'${route}'`);

const VIEWPORTS = [
  { name: '전자칠판 1920x1080', width: 1920, height: 1080 },
  { name: '웹앱 1366x768', width: 1366, height: 768 },
  { name: '태블릿가로 1280x800', width: 1280, height: 800 },
  { name: '실사용창 1900x880', width: 1900, height: 880 },
  ...(WITH_MOBILE ? [{ name: '모바일가로 844x390', width: 844, height: 390 }] : [])
];

const ts = () => new Date().toISOString();
const mission = (status, data, checkpointId = null) => ({ status, checkpointId, bestScore: 0, attempts: 1, completedAt: null, scoreDimensions: {}, data: data || {} });

/** 전 스테이지 해금 + 프로필이 있는 기본 저장 */
function baseSave() {
  const done = (extra) => ({ ...mission('completed', extra), completedAt: ts(), bestScore: 80 });
  return {
    schemaVersion: 1,
    profile: { nickname: '바다', createdAt: ts(), avatarId: 'a1', airplaneId: 'plane1' },
    teacherUnlocked: true,
    missions: {
      asia: done({ earthSignals: [{ label: '초원의 물이 줄어든 신호', issueId: 'climate' }] }),
      europe: done({ earthSignals: ['프랑스 · 센강 곁 길'] }),
      africa: done({ africaProgress: { instrumentLab: { createdRhythm: [1, 0, 2, 1, 0, 2, 0, 1], completed: true } } }),
      americas: done({ earthSignals: ['숲과 강의 신호'] }),
      oceania: done({ earthSignals: [{ label: '산호가 하얗게 변한 신호', issueId: 'ocean' }] }),
      dialogue: mission('available', {})
    },
    stamps: ['asia', 'europe', 'africa', 'americas', 'oceania'],
    settings: { bgm: false, sfx: false, reducedMotion: true, volume: 0 },
    completion: { unlocked: true, reflection: '', placedPuzzlePieceIds: [], reflectionDrafts: { initialThought: '', evidenceLearned: '', revisedThought: '', transferApplication: '' }, actionPrinciples: [], certificateIssued: false },
    rewardClaimedById: {},
    lastRoute: '#/map',
    updatedAt: ts()
  };
}

/** 점검 화면 목록 — 겉 화면 + 저장 상태를 바꿔 들어가는 미션 내부 화면 */
function buildScenes() {
  const af = content('africa'), asia = content('asia'), oc = content('oceania'), eu = content('europe');
  const scenes = [];
  const add = (name, route, patch) => { if (hasRoute(route)) scenes.push({ name, route, patch }); };

  add('타이틀', '#/', null);
  add('여권', '#/passport', null);
  add('세계지도', '#/map', null);
  add('완주', '#/completion', null);

  // 아메리카 — 화면 순서대로(현재 코드의 SCREENS 목록을 읽는다)
  const amSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'missionAmericas.ts'), 'utf8');
  const amScreens = (amSrc.match(/const SCREENS = \[([^\]]+)\]/) || [, "'landing'"])[1].match(/'(\w+)'/g).map((x) => x.replace(/'/g, ''));
  for (const screen of amScreens) {
    add(`아메리카·${screen}`, '#/mission/americas', (s) => { s.missions.americas = mission('in_progress', { exploreProgress: { screen } }, screen); });
  }
  // 문화 가방 — 나라 화면에서 친구를 이미 만난 상태로 들어가 첫 나라 핀을 누르면 가방이 열린다
  const am = content('americas'); const c0 = am.explore.countries[0];
  scenes.push({ name: '아메리카·가방', route: '#/mission/americas',
    patch: (s) => { s.missions.americas = mission('in_progress', { exploreProgress: { screen: 'countries', countries: { [c0.id]: { stopsSeen: c0.stops.map((x) => x.id), met: true, bagSeen: [], keep: null, done: false } } } }, 'countries'); },
    after: async (page) => { await page.click('.hub-pin', { timeout: 5000 }); await page.waitForTimeout(700); } });
  // 유럽 — 지도 → 문화 창 → 갤러리 → 이유 → 질문 → 엽서
  const allVisuals = eu.countries.flatMap((c) => c.visuals.map((v) => v.id));
  const euBase = { visitedCountryIds: eu.countries.map((c) => c.id), viewedVisualIds: allVisuals, savedVisualIds: allVisuals, selectedCountryId: 'france', selectedEvidenceId: 'france_louvre', reasonPromptId: 'scene', reasonDraft: '루브르의 옛것과 새것의 모습이 오래 눈에 남았어.', questionStarterId: 'why', questionDraft: '루브르의 옛것과 새것을 소중히 지킬까?', postcardCompleted: false, stampAwarded: false };
  for (const screen of ['map', 'window', 'gallery', 'reason', 'question', 'postcard']) {
    add(`유럽·${screen}`, '#/mission/europe', (s) => { s.missions.europe = mission('in_progress', { europeProgress: { ...euBase, screen, activeCountryId: 'france', activeVisualId: 'france_seine' } }, screen); });
  }
  // 아프리카 — 지도 + 다섯 지역 + 이후 화면(현재 FLOW를 읽는다)
  const afSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'missionAfrica.ts'), 'utf8');
  const afFlow = (afSrc.match(/const FLOW[^=]*=\s*\[([^\]]+)\]/) || [, "'map','region'"])[1].match(/'(\w+)'/g).map((x) => x.replace(/'/g, ''));
  const afBase = { visitedRegions: [], visitedCountries: [], discoveredGeographyClues: [], discoveredCultureExamples: [], instrumentLab: { exploredInstrumentIds: [], createdRhythm: [], completed: false } };
  const afDone = { ...afBase, activeRegionId: 'west', visitedRegions: af.regions.map((x) => x.id), instrumentLab: { exploredInstrumentIds: ['a', 'b', 'c'], createdRhythm: [1, 0, 2, 1, 0, 2, 0, 1], completed: true } };
  for (const screen of afFlow) {
    if (screen === 'region') {
      for (const r of af.regions) add(`아프리카·${r.name}`, '#/mission/africa', (s) => { s.missions.africa = mission('in_progress', { africaProgress: { ...afBase, screen: 'region', activeRegionId: r.id } }, 'region'); });
    } else {
      add(`아프리카·${screen}`, '#/mission/africa', (s) => { s.missions.africa = mission('in_progress', { africaProgress: { ...afDone, screen } }, screen); });
    }
  }
  // 아시아·오세아니아 — 권역 선택 전 / 권역 선택 / 환경 연결
  const regional = (id, areaId, exampleId, screen) => (s) => { s.missions[id] = mission('in_progress', { regionalExploration: { screen, activeAreaId: areaId, activeExampleId: exampleId, visitedAreaIds: areaId ? [areaId] : [], viewedExampleIds: [], viewedSceneIds: [], discoveredSignalIds: [], listenedPerspectiveIds: [], heardPerspectiveIds: [], selectedActionIds: [] } }, screen); };
  add('아시아·권역전', '#/mission/asia', regional('asia', null, null, 'explore'));
  add('아시아·동아시아', '#/mission/asia', regional('asia', asia.regions[0].id, asia.countryExamples.find((e) => e.regionId === asia.regions[0].id)?.id ?? null, 'explore'));
  add('아시아·연결', '#/mission/asia', regional('asia', asia.regions[0].id, null, 'connections'));
  add('오세아니아·구역전', '#/mission/oceania', regional('oceania', null, null, 'explore'));
  add('오세아니아·호주', '#/mission/oceania', regional('oceania', oc.zones[0].id, oc.countryExamples[0].id, 'explore'));
  add('오세아니아·연결', '#/mission/oceania', regional('oceania', oc.zones[0].id, null, 'connections'));
  // 스테이지6 — 인사 → 사진 비교 → 경청 → 나침반 → 지구회의 장면들
  const dlg = (checkpointId, data) => (s) => { s.missions.dialogue = mission('in_progress', data, checkpointId); };
  add('스테이지6·인사', '#/mission/respect-dialogue', dlg('stage1', { matched: [], oxDone: false }));
  add('스테이지6·사진비교', '#/mission/respect-dialogue', dlg('stage2', { visualCompareDone: [], visualCompareIndex: 0, scenarioIndex: 0 }));
  add('스테이지6·경청', '#/mission/respect-dialogue', dlg('stage2', { visualCompareDone: ['yusra', 'kenji', 'amara'], visualCompareIndex: 3, scenarioIndex: 0 }));
  add('스테이지6·나침반', '#/mission/respect-dialogue', dlg('stage3', { npcIndex: 0, npcTurnIndex: 0, npcPhase: 'turn' }));
  const sig = ['sig_nepal_glacier', 'sig_japan_heat', 'sig_morocco_water', 'sig_colombia_plastic', 'sig_australia_reef', 'sig_tanzania_habitat'];
  const earth = (scene, extra) => ({ earth: { scene, signalViewedIds: sig, signalObservedIds: sig, exploredConnectionTypes: ['ocean', 'climate', 'ecosystem'], selectedIssueId: 'ocean', listenedPerspectiveIds: ['p_effect', 'p_institution', 'p_cost', 'p_cooperation'], selectedPerspectiveIds: ['p_effect', 'p_cooperation'], perspectiveReason: '효과도 크고 여러 나라가 함께해야 오래 가니까', selectedActionIds: ['a_reuse', 'a_cleanup', 'a_rule'], simulationAttempts: 1, jointPledgeDraft: '', personalActionDraft: '', missionCompleted: false, stampAwarded: false, ...extra } });
  for (const scene of ['signals', 'connect', 'issue', 'roundtable', 'actions', 'pledge']) {
    add(`지구회의·${scene}`, '#/mission/respect-dialogue', dlg('stage4', earth(scene, scene === 'signals' ? { signalObservedIds: [] } : {})));
  }
  return scenes;
}

/** 한 화면에서 문제를 수집한다 — 브라우저 안에서 실행 */
function auditPage() {
  const issues = [];
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const inScroller = (el) => { let p = el.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowY + s.overflow)) return true; p = p.parentElement; } return false; };
  const openModalEl = document.querySelector('#overlay-root .modal');

  // 1) 글자 잘림 — 잎 텍스트 노드가 자기 박스를 넘는가
  document.querySelectorAll('p,span,strong,h1,h2,h3,h4,button,li,small,em,b,label,figcaption').forEach((el) => {
    if (!vis(el) || el.querySelector('*')) return;
    const s = getComputedStyle(el);
    if (/(auto|scroll)/.test(s.overflow + s.overflowY)) return;
    if ((el.scrollHeight - el.clientHeight > 3 || el.scrollWidth - el.clientWidth > 3) && el.textContent.trim()) issues.push({ kind: '글자잘림', detail: label(el) });
  });
  // 1b) 요소가 overflow:hidden 부모 밖으로 잘려 나갔는가 — 캡션·버튼이 패널 아래로 사라지는 경우
  document.querySelectorAll('p,button,h3,h4,img,.detail-caption,.detail-facts,.eu-look').forEach((el) => {
    if (!vis(el) || inScroller(el)) return;
    let p = el.parentElement;
    while (p && p !== document.body) {
      const ps = getComputedStyle(p);
      if (ps.overflow === 'hidden' || ps.overflowY === 'hidden') {
        const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (r.bottom > pr.bottom + 4 || r.right > pr.right + 4) issues.push({ kind: '패널밖잘림', detail: `${label(el) || el.className.toString().slice(0, 30)} (${Math.round(r.bottom - pr.bottom)}px 아래)` });
        break;
      }
      p = p.parentElement;
    }
  });
  // 2) 빈 버튼
  document.querySelectorAll('button').forEach((el) => {
    if (!vis(el)) return;
    const bg = getComputedStyle(el).backgroundImage;
    if (!(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.querySelector('img,svg,canvas') && (!bg || bg === 'none')) issues.push({ kind: '빈버튼', detail: el.className.toString().slice(0, 60) });
  });
  // 3) 화면 밖 조작 요소
  document.querySelectorAll('button,a,input,textarea,select').forEach((el) => {
    if (!vis(el) || inScroller(el)) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > innerHeight + 2 || r.top < -2 || r.right > innerWidth + 2 || r.left < -2) issues.push({ kind: '화면밖요소', detail: label(el) });
  });
  // 4) 터치 영역
  document.querySelectorAll('button,a[href],input[type=range]').forEach((el) => {
    if (!vis(el)) return; const r = el.getBoundingClientRect();
    if (r.height < 36 || r.width < 28) issues.push({ kind: '작은터치영역', detail: `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}` });
  });
  // 5) 버튼 가려짐 — 실제 클릭 지점을 다른 요소가 가로채는가(모달이 열려 있으면 모달 안만)
  (openModalEl || document).querySelectorAll('button:not(.guide-mascot-button)').forEach((el) => {
    if (!vis(el)) return; const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) issues.push({ kind: '버튼가려짐', detail: `${label(el)} ← ${hit.className.toString().slice(0, 30) || hit.tagName}` });
  });
  // 5b) 말풍선·캐릭터 가림 — 본문 글자 위를 가이드(마스코트·말풍선)가 덮는가
  document.querySelectorAll('p,h1,h2,h3,h4,li,label,button,span,strong,dt,dd').forEach((el) => {
    if (el.closest('.guide-wrap') || !vis(el)) return;
    const txt = (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) ? el.textContent.trim() : '';
    if (!txt) return;
    const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
    const pts = [[r.left + 6, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 6, r.top + r.height / 2], [r.left + r.width / 2, r.top + 6], [r.left + r.width / 2, r.bottom - 6]];
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      const g = hit && hit.closest && hit.closest('.guide-wrap');
      if (g) { issues.push({ kind: hit.closest('.guide-bubble') ? '말풍선가림' : '캐릭터가림', detail: `${txt.slice(0, 26)} ← ${(hit.className || hit.tagName).toString().slice(0, 24)}` }); break; }
    }
  });
  // 6) 세로 스크롤
  const body = document.querySelector('.page-body');
  if (body && body.scrollHeight > body.clientHeight + 8) issues.push({ kind: '세로스크롤', detail: `${body.scrollHeight - body.clientHeight}px 넘침` });
  // 7) 빈 여백 패널
  document.querySelectorAll('.panel,.eu-board,.regional-side,.country-detail,.map-brief').forEach((el) => {
    if (!vis(el)) return; const r = el.getBoundingClientRect(); if (r.height < 200) return;
    let used = 0; [...el.children].forEach((c) => { if (vis(c)) used += c.getBoundingClientRect().height; });
    if (used > 0 && used < r.height * 0.55) issues.push({ kind: '빈여백패널', detail: `${el.className.toString().slice(0, 40)} 내용 ${Math.round(used)}/${Math.round(r.height)}px` });
  });
  // 8) 중복 문구
  const texts = new Map();
  document.querySelectorAll('p,h2,h3,strong,span').forEach((el) => { if (!vis(el) || el.querySelector('*')) return; const t = (el.textContent || '').replace(/\s+/g, ' ').trim(); if (t.length >= 12) texts.set(t, (texts.get(t) || 0) + 1); });
  [...texts].filter(([, n]) => n > 1).forEach(([t, n]) => issues.push({ kind: '중복문구', detail: `${t.slice(0, 36)} ×${n}` }));
  // 9) 그림 눌림 / 깨짐 / 없음
  document.querySelectorAll('.regional-photo img,.detail-photo,.eu-gallery-card img,.eu-stage > img,.regional-modal-visual,.region-mapstage,.instrument-photo img').forEach((el) => {
    if (!vis(el)) return; const r = el.getBoundingClientRect();
    if (r.height < 60) issues.push({ kind: '그림눌림', detail: `${el.className.toString().slice(0, 34)} h=${Math.round(r.height)}` });
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) issues.push({ kind: '그림깨짐', detail: (el.getAttribute('src') || '').slice(-40) });
    const bg = getComputedStyle(el).backgroundImage;
    if (el.tagName !== 'IMG' && (!bg || bg === 'none') && el.className.toString().includes('photo')) issues.push({ kind: '그림없음', detail: el.className.toString().slice(0, 34) });
  });
  return issues;
}

async function dismissModals(page) {
  for (let i = 0; i < 8; i += 1) {
    if (!(await page.$('#overlay-root .modal'))) break;
    await page.evaluate(() => {
      document.querySelectorAll('.keypoint-card').forEach((c) => c.click());
      document.querySelectorAll('[data-front]').forEach((f) => { f.click(); document.querySelector(`[data-back="${f.dataset.front}"]`)?.click(); });
      document.querySelector('.keypoint')?.click();
      document.querySelector('.learn-option')?.click();
    });
    await page.waitForTimeout(350);
    const btn = await page.$('.modal-actions button:not([disabled])');
    if (!btn) { await page.waitForTimeout(400); continue; }
    try { await btn.click({ timeout: 800 }); } catch { break; }
    await page.waitForTimeout(450);
  }
}

(async () => {
  const browser = await chromium.launch();
  const scenes = buildScenes().filter((sc) => !ONLY || sc.name.includes(ONLY));
  const report = [];
  const consoleErrors = new Set();
  const bounced = new Set();

  for (const vp of VIEWPORTS) {
    for (const scene of scenes) {
      const save = baseSave();
      if (scene.patch) scene.patch(save);
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      await ctx.addInitScript((a) => { try { localStorage.setItem(a.key, JSON.stringify(a.save)); } catch { /* 무시 */ } }, { key: SAVE_KEY, save });
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.add(`${scene.name}: ${m.text().slice(0, 100)}`); });
      page.on('pageerror', (e) => consoleErrors.add(`${scene.name}: ${String(e).slice(0, 100)}`));
      try {
        await page.goto(BASE + '/' + scene.route, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(1600);
        await dismissModals(page);
        if (scene.after) { await scene.after(page); await dismissModals(page); }
        await page.waitForTimeout(300);
        const hash = await page.evaluate(() => location.hash);
        if (hash !== scene.route) bounced.add(`${scene.name} → ${hash}`);
        const issues = await page.evaluate(auditPage);
        if (issues.length) report.push({ vp: vp.name, screen: scene.name, issues });
      } catch (e) {
        report.push({ vp: vp.name, screen: scene.name, issues: [{ kind: '진입실패', detail: String(e).slice(0, 80) }] });
      }
      await ctx.close();
    }
  }
  await browser.close();

  const byKind = new Map();
  fs.mkdirSync(path.join(__dirname, '..', '.tmp'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', '.tmp', 'qa-sweep-last.json'), JSON.stringify(report, null, 1)); // 마지막 결과(상세 포함)
  report.forEach((r) => r.issues.forEach((i) => { if (!byKind.has(i.kind)) byKind.set(i.kind, []); byKind.get(i.kind).push(`${r.vp} · ${r.screen} · ${i.detail || ''}`); }));
  console.log(`===== QA 요약 (${scenes.length}화면 × ${VIEWPORTS.length}해상도) =====`);
  if (!byKind.size) console.log('발견된 문제 없음');
  [...byKind].sort((a, b) => b[1].length - a[1].length).forEach(([kind, list]) => {
    console.log(`\n## ${kind} (${list.length})`);
    list.slice(0, 16).forEach((l) => console.log('  -', l));
    if (list.length > 16) console.log(`  … 외 ${list.length - 16}건`);
  });
  if (bounced.size) { console.log('\n## 라우트 튕김(내부 화면 진입 실패)'); [...bounced].slice(0, 12).forEach((s) => console.log('  -', s)); }
  console.log('\n## 콘솔 오류 (' + consoleErrors.size + ')');
  [...consoleErrors].slice(0, 10).forEach((e) => console.log('  -', e));
})().catch((e) => { console.error('SWEEP ERROR', e); process.exit(1); });
