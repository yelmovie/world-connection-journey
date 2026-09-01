/**
 * 출시 전 화면 전수 점검 — Playwright.
 * 3해상도(전자칠판·웹앱·모바일 가로) × 전 스테이지 × 주요 팝업을 돌며
 * 글자 잘림 / 빈 버튼 / 눌리지 않는 버튼 / 겹침 / 스크롤 / 빈 여백 / 콘솔 오류를 모은다.
 *
 *   node scripts/qa-sweep.cjs            (기본 http://localhost:5273)
 *   node scripts/qa-sweep.cjs http://localhost:4273
 */
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:5273';
const SAVE_KEY = 'world_connection_journey.save.v1';

const VIEWPORTS = [
  { name: '전자칠판 1920x1080', width: 1920, height: 1080 },
  { name: '웹앱 1366x768', width: 1366, height: 768 },
  { name: '모바일가로 844x390', width: 844, height: 390 }
];

const ROUTES = [
  ['타이틀', '#/'],
  ['여권', '#/passport'],
  ['세계지도', '#/map'],
  ['아메리카', '#/mission/americas'],
  ['유럽', '#/mission/europe'],
  ['아프리카', '#/mission/africa'],
  ['아시아', '#/mission/asia'],
  ['오세아니아', '#/mission/oceania'],
  ['스테이지6', '#/mission/respect-dialogue'],
  ['완주', '#/completion']
];

/** 전 스테이지 해금 + 프로필이 있는 저장 상태 */
function seedSave() {
  const done = (extra) => ({
    status: 'completed', checkpointId: null, bestScore: 80, attempts: 1,
    completedAt: new Date().toISOString(), scoreDimensions: {}, data: extra || {}
  });
  return {
    schemaVersion: 1,
    profile: { nickname: '바다', createdAt: new Date().toISOString(), avatarId: 'a1', airplaneId: 'plane1' },
    teacherUnlocked: true,
    missions: {
      asia: done({ earthSignals: [{ label: '초원의 물이 줄어든 신호', issueId: 'climate' }] }),
      europe: done({ earthSignals: ['프랑스 · 센강 곁 길'] }),
      africa: done({ africaProgress: { instrumentLab: { createdRhythm: [1, 0, 2, 1, 0, 2, 0, 1], completed: true } } }),
      americas: done({ earthSignals: ['숲과 강의 신호'] }),
      oceania: done({ earthSignals: [{ label: '산호가 하얗게 변한 신호', issueId: 'ocean' }] }),
      dialogue: { status: 'available', checkpointId: null, bestScore: 0, attempts: 0, completedAt: null, scoreDimensions: {}, data: {} }
    },
    stamps: ['asia', 'europe', 'africa', 'americas', 'oceania'],
    settings: { bgm: false, sfx: false, reducedMotion: true, volume: 0 },
    completion: {
      unlocked: true, reflection: '', placedPuzzlePieceIds: [],
      reflectionDrafts: { initialThought: '', evidenceLearned: '', revisedThought: '', transferApplication: '' },
      actionPrinciples: [], certificateIssued: false
    },
    rewardClaimedById: {},
    lastRoute: '#/map',
    updatedAt: new Date().toISOString()
  };
}

/** 한 화면에서 문제를 수집한다. 브라우저 안에서 실행된다. */
function auditPage() {
  const issues = [];
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  // 1) 글자 잘림 — 실제 내용이 박스를 넘는 텍스트 요소
  document.querySelectorAll('p,span,strong,h1,h2,h3,h4,button,li,small,em,b,label,figcaption').forEach((el) => {
    if (!vis(el)) return;
    const s = getComputedStyle(el);
    if (s.overflow === 'auto' || s.overflow === 'scroll' || s.overflowY === 'auto' || s.overflowY === 'scroll') return;
    if (el.querySelector('*')) return; // 잎 노드만
    const clippedY = el.scrollHeight - el.clientHeight > 3;
    const clippedX = el.scrollWidth - el.clientWidth > 3;
    if ((clippedY || clippedX) && el.textContent.trim()) {
      issues.push({ kind: '글자잘림', detail: label(el), cls: el.className.toString().slice(0, 60) });
    }
  });

  // 2) 빈 버튼 — 글자도 그림도 접근 이름도 없는 버튼
  document.querySelectorAll('button').forEach((el) => {
    if (!vis(el)) return;
    const hasText = (el.textContent || '').trim().length > 0;
    const hasAria = !!(el.getAttribute('aria-label') || el.getAttribute('title'));
    const hasGraphic = !!el.querySelector('img,svg,canvas');
    const bg = getComputedStyle(el).backgroundImage;
    if (!hasText && !hasAria && !hasGraphic && (!bg || bg === 'none')) {
      issues.push({ kind: '빈버튼', detail: el.className.toString().slice(0, 60) });
    }
  });

  // 3) 화면 밖으로 나간 조작 요소 — 눌리지 않는다
  const vw = innerWidth, vh = innerHeight;
  document.querySelectorAll('button,a,input,textarea,select').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > vh + 2 || r.top < -2 || r.right > vw + 2 || r.left < -2) {
      // 스크롤 컨테이너 안에 있으면 스크롤로 도달 가능하므로 제외
      let p = el.parentElement, scrollable = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY + s.overflow)) { scrollable = true; break; }
        p = p.parentElement;
      }
      if (!scrollable) issues.push({ kind: '화면밖요소', detail: label(el) });
    }
  });

  // 4) 터치 영역 — 초등 기준 44px 미만
  document.querySelectorAll('button,a[href],input[type=range]').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 36 || r.width < 28) issues.push({ kind: '작은터치영역', detail: `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}` });
  });

  // 5) 조작 요소가 실제로 눌리는가 — 중심점에서 다른 요소가 가로채면 겹침으로 본다
  //    (모달이 열려 있으면 뒤 화면이 가려지는 게 정상이므로 모달 안만 본다)
  const openModalEl = document.querySelector('#overlay-root .modal');
  const scope = openModalEl || document;
  scope.querySelectorAll('button:not(.guide-mascot-button)').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      issues.push({ kind: '버튼가려짐', detail: `${label(el)} ← ${hit.className.toString().slice(0, 30) || hit.tagName}` });
    }
  });

  // 6) 페이지 세로 스크롤
  const body = document.querySelector('.page-body');
  if (body && body.scrollHeight > body.clientHeight + 8) {
    issues.push({ kind: '세로스크롤', detail: `${body.scrollHeight - body.clientHeight}px 넘침` });
  }

  // 7) 큰 빈 패널 — 내용 대비 빈 공간이 과도한 패널
  document.querySelectorAll('.panel,.eu-board,.regional-side,.country-detail,.map-brief').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 200) return;
    let used = 0;
    [...el.children].forEach((c) => { if (vis(c)) used += c.getBoundingClientRect().height; });
    if (used > 0 && used < r.height * 0.55) {
      issues.push({ kind: '빈여백패널', detail: `${el.className.toString().slice(0, 40)} 내용 ${Math.round(used)}/${Math.round(r.height)}px` });
    }
  });

  // 8) 같은 문구가 화면에 2번 이상(중복 안내)
  const texts = new Map();
  document.querySelectorAll('p,h2,h3,strong,span').forEach((el) => {
    if (!vis(el) || el.querySelector('*')) return;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length < 12) return;
    texts.set(t, (texts.get(t) || 0) + 1);
  });
  [...texts].filter(([, n]) => n > 1).forEach(([t, n]) => issues.push({ kind: '중복문구', detail: `${t.slice(0, 36)} ×${n}` }));

  // 9) 이미지가 너무 작게 눌렸는가(주요 학습 이미지)
  document.querySelectorAll('.regional-photo img,.detail-photo,.eu-gallery-card img,.day-card img,.regional-modal-visual').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 60) issues.push({ kind: '그림눌림', detail: `${el.className.toString().slice(0, 34)} h=${Math.round(r.height)}` });
  });

  return issues;
}

(async () => {
  const browser = await chromium.launch();
  const report = [];
  let consoleErrors = [];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    // 앱이 부팅하며 자기 상태로 덮어쓰기 전에 저장을 심는다(로드 전 실행)
    await ctx.addInitScript((args) => {
      try { localStorage.setItem(args.key, JSON.stringify(args.save)); } catch { /* 무시 */ }
    }, { key: SAVE_KEY, save: seedSave() });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${vp.name}] ${m.text().slice(0, 120)}`); });
    page.on('pageerror', (e) => consoleErrors.push(`[${vp.name}] pageerror ${String(e).slice(0, 120)}`));

    for (const [name, route] of ROUTES) {
      await page.goto(BASE + '/' + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);
      // 안내 모달(핵심 카드 등)은 닫고 화면 본체를 본다
      for (let i = 0; i < 8; i += 1) {
        const hasModal = await page.$('#overlay-root .modal');
        if (!hasModal) break;
        // 핵심 카드가 뒤집기/짝맞추기면 먼저 풀어야 확인 버튼이 열린다
        await page.evaluate(() => {
          document.querySelectorAll('.keypoint-card').forEach((c) => c.click());
          const fronts = [...document.querySelectorAll('[data-front]')];
          fronts.forEach((f) => {
            f.click();
            const back = document.querySelector(`[data-back="${f.dataset.front}"]`);
            if (back) back.click();
          });
          document.body.click();
        });
        await page.waitForTimeout(350);
        const btn = await page.$('.modal-actions button:not([disabled])');
        if (!btn) { await page.waitForTimeout(400); continue; }
        try { await btn.click({ timeout: 800 }); } catch { break; }
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(400);
      const issues = await page.evaluate(auditPage);
      if (issues.length) report.push({ vp: vp.name, screen: name, issues });
    }
    await ctx.close();
  }

  await browser.close();

  // ── 출력: 종류별 집계 + 화면별 상세
  const byKind = new Map();
  report.forEach((r) => r.issues.forEach((i) => {
    const k = i.kind;
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push(`${r.vp} · ${r.screen} · ${i.detail || ''}`);
  }));

  console.log('===== QA 요약 =====');
  if (!byKind.size) console.log('발견된 문제 없음');
  [...byKind].sort((a, b) => b[1].length - a[1].length).forEach(([kind, list]) => {
    console.log(`\n## ${kind} (${list.length})`);
    list.slice(0, 14).forEach((l) => console.log('  -', l));
    if (list.length > 14) console.log(`  … 외 ${list.length - 14}건`);
  });
  console.log('\n## 콘솔 오류 (' + consoleErrors.length + ')');
  [...new Set(consoleErrors)].slice(0, 10).forEach((e) => console.log('  -', e));
})().catch((e) => { console.error('SWEEP ERROR', e); process.exit(1); });
