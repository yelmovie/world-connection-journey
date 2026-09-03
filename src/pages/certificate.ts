import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset } from '../core/assets';
import { saveRepo } from '../core/SaveRepository';
import { buildTopBar } from '../ui/chrome';
import { avatarChoice } from '../ui/avatarRoster';
import { STAMP_ASSETS, STAMP_LABELS, STAMP_SLOTS } from '../core/stamps';

/** 인증서 한 장 — 세로 A4. 학교·학년반·번호·이름은 인쇄해서 손으로 쓰도록 빈칸으로 둔다. */
const STYLE = `
.cert-page { --cert-ink:#173653; --cert-gold:#c9a24a; --cert-teal:#1b7f86; --cert-paper:#fffdf6; }
.cert-page .page-body { display:grid; place-items:center; padding:clamp(8px,1.5vh,18px) clamp(12px,2vw,32px); overflow:auto; }
.cert-wrap { display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,340px); gap:clamp(16px,2.4vw,40px); align-items:center; justify-content:center; width:min(1280px,100%); }
.cert-preview { position:relative; width:100%; }
/* 낮은 창에서도 최소 430px은 유지 — 모자라면 page-body가 스크롤을 맡는다 */
.cert-sheet {
  position:relative; width:min(100%, max(430px, calc((100dvh - var(--top-bar-h) - 48px) * 0.7071))); aspect-ratio:1/1.4142; margin:0 auto;
  padding:clamp(18px,3.2cqw,40px); box-sizing:border-box; background:var(--cert-paper);
  box-shadow:0 10px 24px rgba(4,20,40,.35), 0 30px 80px rgba(4,20,40,.4); color:var(--cert-ink); text-align:center; container-type:inline-size;
  display:flex; flex-direction:column; align-items:center; justify-content:space-between; gap:1.4cqw;
}
.cert-sheet::before { content:''; position:absolute; inset:2.2cqw; border:2px solid var(--cert-gold); pointer-events:none; }
.cert-sheet::after { content:''; position:absolute; inset:3cqw; border:1px solid rgba(201,162,74,.55); pointer-events:none; }
.cert-corner { position:absolute; width:9cqw; height:9cqw; opacity:.85; pointer-events:none; }
.cert-corner.tl { left:3.4cqw; top:3.4cqw; } .cert-corner.tr { right:3.4cqw; top:3.4cqw; transform:scaleX(-1); }
.cert-corner.bl { left:3.4cqw; bottom:3.4cqw; transform:scaleY(-1); } .cert-corner.br { right:3.4cqw; bottom:3.4cqw; transform:scale(-1); }
.cert-head { position:relative; z-index:1; display:grid; justify-items:center; gap:.6cqw; margin-top:1cqw; }
.cert-emblem { width:13cqw; height:13cqw; object-fit:contain; filter:drop-shadow(0 6px 14px rgba(20,50,80,.25)); }
.cert-kicker { font:800 2.4cqw/1.2 var(--font-body); letter-spacing:.42em; color:var(--cert-teal); text-transform:uppercase; }
.cert-title { margin:0; font:900 5.4cqw/1.15 var(--font-head); color:var(--cert-ink); letter-spacing:.02em; word-break:keep-all; }
.cert-title small { display:block; margin-top:.5cqw; font:800 2.6cqw/1.3 var(--font-body); color:#4b6a84; letter-spacing:.08em; }
.cert-fields { position:relative; z-index:1; display:grid; grid-template-columns:1fr 1fr; gap:1.6cqw 4cqw; width:78%; margin:1.2cqw auto 0; text-align:left; }
.cert-field { display:grid; grid-template-columns:auto 1fr; align-items:end; gap:1.4cqw; font:800 2.5cqw/1 var(--font-body); color:#3e5a75; }
.cert-field.wide { grid-column:1 / -1; }
.cert-field span { padding-bottom:.6cqw; white-space:nowrap; }
.cert-field i { display:block; height:4.2cqw; border-bottom:2px dotted rgba(23,54,83,.55); }
.cert-body { position:relative; z-index:1; width:84%; margin:0 auto; font:700 2.7cqw/1.6 var(--font-body); color:#22405a; word-break:keep-all; text-wrap:balance; }
.cert-body b { color:var(--cert-teal); font-weight:900; }
/* 도장 여섯 칸 — 그림 원본 폭(384px)이 열을 밀지 않게 minmax(0,1fr), 이름표는 칸 폭에 맞춰 축소 */
.cert-stamps { position:relative; z-index:1; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:1.2cqw; width:90%; margin:0 auto; }
.cert-stamp-cell { display:grid; gap:.6cqw; min-width:0; justify-items:center; }
#scene-root .cert-page .cert-stamp-name, .cert-stamp-name { display:block; max-width:100%; text-align:center; font-family:var(--font-body); font-weight:800; font-size:clamp(9px,2.1cqw,13px); line-height:1.15; color:#4b6a84; white-space:normal; word-break:keep-all; letter-spacing:-.03em; }
.cert-stamp { width:100%; min-width:0; aspect-ratio:1; display:grid; place-items:center; border-radius:50%; border:2px solid rgba(201,162,74,.6); background:#fff; overflow:hidden; box-shadow:0 3px 10px rgba(20,50,80,.12); }
.cert-stamp img { display:block; width:100%; height:100%; object-fit:cover; }
.cert-stamp b { font:900 3cqw/1 var(--font-head); color:#b7c3cf; }
.cert-pledge { position:relative; z-index:1; width:80%; margin:0 auto; padding:1.4cqw 2.4cqw; border-radius:1.2cqw; background:rgba(27,127,134,.08); font:800 2.5cqw/1.5 var(--font-body); color:#1f4d42; word-break:keep-all; }
.cert-pledge em { font-style:normal; color:var(--cert-teal); }
.cert-foot { position:relative; z-index:1; display:grid; grid-template-columns:1fr auto 1fr; align-items:end; width:84%; margin:0 auto 1.2cqw; font:800 2.6cqw/1.4 var(--font-body); color:#3e5a75; }
.cert-foot .date { text-align:left; } .cert-foot .issuer { text-align:right; font-family:var(--font-head); font-weight:900; color:var(--cert-ink); font-size:3cqw; }
.cert-seal { width:13cqw; height:13cqw; object-fit:contain; justify-self:center; filter:drop-shadow(0 4px 10px rgba(20,50,80,.25)); }

/* 미리보기 위 돋보기 — 인증서를 크게 보는 확대 보기를 연다 */
.cert-zoom-btn { position:absolute; right:-14px; bottom:-14px; z-index:2; width:58px; height:58px; display:grid; place-items:center; border:4px solid #fff; border-radius:50%; background:var(--c-navy); color:#fff; cursor:pointer; box-shadow:0 8px 20px rgba(4,20,40,.45); transition:transform .16s ease, background .16s ease; }
.cert-zoom-btn:hover, .cert-zoom-btn:focus-visible { transform:scale(1.08); background:#0c6f91; outline:none; }
.cert-zoom-btn svg { width:28px; height:28px; }
.cert-preview .cert-sheet { cursor:zoom-in; }

/* 확대 보기 — 화면 가득 */
.cert-zoom { position:fixed; inset:0; z-index:60; display:grid; place-items:center; padding:2vh 2vw; background:rgba(5,20,38,.78); backdrop-filter:blur(6px); }
.cert-zoom .cert-sheet { width:min(94vw, calc((100dvh - 4vh) * 0.7071)); cursor:zoom-out; }
.cert-zoom-close { position:absolute; top:18px; right:22px; width:56px; height:56px; display:grid; place-items:center; border:3px solid rgba(255,255,255,.85); border-radius:50%; background:rgba(10,35,60,.72); color:#fff; font:900 26px/1 var(--font-head); cursor:pointer; }
.cert-zoom-close:hover, .cert-zoom-close:focus-visible { background:#0c6f91; outline:none; }

/* 오른쪽 안내 — 축하 배경 위 유리 패널 */
.cert-side { display:grid; gap:14px; align-content:center; }
.cert-side .panel { padding:clamp(16px,1.6vw,24px); display:grid; gap:12px; background:rgba(255,253,246,.93); backdrop-filter:blur(8px); border:2px solid rgba(255,255,255,.85); box-shadow:0 16px 44px rgba(4,20,40,.35); }
.cert-side-head { display:grid; grid-template-columns:auto minmax(0,1fr); gap:12px; align-items:center; }
.cert-side-head img { width:64px; height:64px; border-radius:50%; object-fit:cover; border:3px solid #fff; box-shadow:0 4px 12px rgba(4,20,40,.25); background:#dfeef4; }
.cert-side h2 { margin:0; font:900 clamp(21px,1.6vw,27px)/1.25 var(--font-head); color:var(--c-navy); word-break:keep-all; }
.cert-side .cert-side-sub { margin:0; font:800 clamp(14px,1vw,17px)/1.3 var(--font-body); color:var(--cert-teal); }
.cert-side p { margin:0; font-size:max(16px,var(--fs-small)); line-height:1.55; color:var(--c-ink-soft); font-weight:700; word-break:keep-all; }
.cert-side-stamps { display:flex; gap:6px; }
.cert-side-stamps img, .cert-side-stamps span { width:38px; height:38px; border-radius:50%; object-fit:cover; border:2px solid rgba(201,162,74,.7); background:#fff; box-shadow:0 3px 8px rgba(4,20,40,.18); }
@media (max-width:1000px) { .cert-wrap { grid-template-columns:1fr; } .cert-side { width:100%; } .cert-zoom-btn { right:2px; bottom:2px; } }
@media print {
  @page { size:A4 portrait; margin:0; }
  html, body { background:#fff !important; }
  /* 인증서 페이지의 조상은 남기고 형제만 숨긴다(조상을 숨기면 인증서까지 사라진다) */
  body.printing-certificate #app > :not(#scene-root), body.printing-certificate #scene-root > :not(.cert-page) { display:none !important; }
  body.printing-certificate #app, body.printing-certificate #scene-root { display:block !important; position:static !important; width:auto; height:auto; overflow:visible !important; }
  body.printing-certificate #overlay-root, body.printing-certificate .top-bar, body.printing-certificate .cert-side, body.printing-certificate .guide-wrap,
  body.printing-certificate .cert-zoom, body.printing-certificate .cert-zoom-btn { display:none !important; }
  body.printing-certificate::after { content:none !important; display:none !important; } /* 세로 안내 오버레이(A4 세로 판정) 숨김 */
  body.printing-certificate #scene-root > .cert-page { display:block !important; position:static; width:210mm; height:297mm; overflow:visible; background:#fff !important; }
  body.printing-certificate .cert-page .page-body { display:block; padding:0; overflow:visible; }
  body.printing-certificate .cert-wrap { display:block; width:210mm; }
  body.printing-certificate .cert-preview { position:static; }
  body.printing-certificate .cert-stamp-name { font-size:11pt; }
  body.printing-certificate .cert-sheet { width:210mm; height:297mm; aspect-ratio:auto; box-shadow:none; margin:0; page-break-inside:avoid;
    print-color-adjust:exact; -webkit-print-color-adjust:exact; }
}`;

const BODY_TEXT = '위 학생은 <b>여섯 대륙</b>의 친구를 만나 서로 다른 생활과 문화를 <b>있는 그대로 존중</b>하고, 여러 지역의 <b>환경 신호</b>를 하나로 이어 세계 친구 지구회의에서 <b>함께 지킬 약속</b>을 만들었기에 세계 다문화 이해 &amp; 지구 지킴이 협력가로 인증합니다.';

const formatDate = (d: Date): string => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;

const pledgeOf = (): string => {
  const data = saveRepo.get().missions.dialogue?.data as { earth?: { personalActionDraft?: unknown } } | undefined;
  const text = data?.earth?.personalActionDraft;
  return typeof text === 'string' ? text.trim() : '';
};

export function createPage(): Page {
  let page: HTMLElement | null = null;
  let onKey: ((ev: KeyboardEvent) => void) | null = null;
  const onAfterPrint = () => document.body.classList.remove('printing-certificate');
  return {
    mount(root: HTMLElement) {
      const save = saveRepo.get();
      const avatar = avatarChoice(save.profile?.avatarId);
      const earned = new Set(save.stamps);
      const pledge = pledgeOf();
      const emblem = ['reward.certificate', 'deco.emblem_unity', 'reward.globe_puzzle', 'prop.globe'].find((id) => hasAsset(id)) ?? 'prop.globe';
      const seal = ['deco.emblem_stamp', 'reward.medal2', 'reward.badge'].find((id) => hasAsset(id)) ?? emblem;
      const wreath = hasAsset('reward.wreath') ? 'reward.wreath' : null;
      page = document.createElement('div');
      page.className = 'page cert-page';
      // 밋밋한 파란 화면 대신 완주 축하 배경 — 흰 인증서가 도드라지게 어두운 그라데이션을 얹는다
      if (hasAsset('bg.completion')) {
        page.style.backgroundImage = `linear-gradient(rgba(8,28,52,.5),rgba(8,28,52,.62)),url('${assetUrl('bg.completion')}')`;
      }
      const style = document.createElement('style');
      style.textContent = STYLE;
      page.appendChild(style);
      page.appendChild(buildTopBar({ title: '인증서', backTo: '#/map', showPassport: true }));
      const sheetHTML = `
          <article class="cert-sheet" aria-label="세계 다문화 이해 & 지구 지킴이 협력가 인증서">
            ${wreath ? `<img class="cert-corner tl" src="${assetUrl(wreath)}" alt="" aria-hidden="true"><img class="cert-corner tr" src="${assetUrl(wreath)}" alt="" aria-hidden="true"><img class="cert-corner bl" src="${assetUrl(wreath)}" alt="" aria-hidden="true"><img class="cert-corner br" src="${assetUrl(wreath)}" alt="" aria-hidden="true">` : ''}
            <header class="cert-head">
              <img class="cert-emblem" src="${assetUrl(emblem)}" data-asset-id="${emblem}" alt="">
              <span class="cert-kicker">Certificate</span>
              <h1 class="cert-title">세계 다문화 이해 &amp; 지구 지킴이<br>협력가 인증서<small>세계를 잇는 여행 완주</small></h1>
            </header>
            <section class="cert-fields" aria-label="학생 정보">
              <label class="cert-field wide"><span>학교</span><i></i></label>
              <label class="cert-field"><span>학년 · 반</span><i></i></label>
              <label class="cert-field"><span>번호</span><i></i></label>
              <label class="cert-field wide"><span>이름</span><i></i></label>
            </section>
            <p class="cert-body">${BODY_TEXT}</p>
            <div class="cert-stamps" aria-label="여행 도장">
              ${STAMP_SLOTS.map((id, index) => {
                const asset = STAMP_ASSETS[id];
                const label = STAMP_LABELS[id];
                const got = earned.has(id) && hasAsset(asset);
                return `<span class="cert-stamp-cell" role="img" aria-label="${label} 도장 ${got ? '받음' : '아직'}"><span class="cert-stamp">${got ? `<img src="${assetUrl(asset)}" data-asset-id="${asset}" alt="">` : `<b>${index + 1}</b>`}</span><small class="cert-stamp-name" aria-hidden="true">${label}</small></span>`;
              }).join('')}
            </div>
            ${pledge ? `<p class="cert-pledge"><em>나의 약속</em> · ${pledge.replace(/</g, '&lt;')}</p>` : ''}
            <footer class="cert-foot">
              <span class="date">${formatDate(new Date())}</span>
              <img class="cert-seal" src="${assetUrl(seal)}" data-asset-id="${seal}" alt="">
              <span class="issuer">세계를 잇는 여행 탐험대</span>
            </footer>
          </article>`;
      const sideStamps = STAMP_SLOTS.map((id, index) => {
        const asset = STAMP_ASSETS[id];
        return earned.has(id) && hasAsset(asset)
          ? `<img src="${assetUrl(asset)}" alt="${STAMP_LABELS[id]} 도장">`
          : `<span aria-label="${STAMP_LABELS[id]} 도장 아직" style="display:grid;place-items:center;font:900 16px/1 var(--font-head);color:#b7c3cf">${index + 1}</span>`;
      }).join('');
      const body = document.createElement('div');
      body.className = 'page-body';
      body.innerHTML = `
        <div class="cert-wrap">
          <div class="cert-preview">
            ${sheetHTML}
            <button type="button" class="cert-zoom-btn" data-act="zoom" aria-label="인증서 크게 보기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/><path d="M10.5 7.8v5.4M7.8 10.5h5.4"/></svg>
            </button>
          </div>
          <aside class="cert-side">
            <section class="panel">
              <div class="cert-side-head">
                <img src="${assetUrl(avatar.assetId)}" alt="">
                <div>
                  <p class="cert-side-sub">여섯 대륙 여행 완주</p>
                  <h2>${avatar.name}의 여행이 끝났어요</h2>
                </div>
              </div>
              <div class="cert-side-stamps" aria-label="모은 여행 도장">${sideStamps}</div>
              <p>인쇄해서 학교·학년반·번호·이름을 직접 쓰면 나만의 인증서가 완성돼요. A4 세로로 한 장에 나와요.</p>
              <button type="button" class="btn btn-primary btn-big" data-act="print">인증서 인쇄하기</button>
              <button type="button" class="btn btn-ghost" data-act="zoom2">크게 보기</button>
              <button type="button" class="btn btn-ghost" data-act="map">지도로 돌아가기</button>
            </section>
          </aside>
        </div>`;
      page.appendChild(body);
      root.appendChild(page);

      // 확대 보기 — 같은 인증서를 화면 가득 다시 그린다(컨테이너 단위라 비율 그대로 커진다)
      let zoom: HTMLElement | null = null;
      const closeZoom = (): void => { zoom?.remove(); zoom = null; };
      const openZoom = (): void => {
        if (zoom || !page) return;
        zoom = document.createElement('div');
        zoom.className = 'cert-zoom';
        zoom.innerHTML = `${sheetHTML}<button type="button" class="cert-zoom-close" aria-label="닫기">✕</button>`;
        zoom.addEventListener('click', closeZoom); // 시트·배경·닫기 어디를 눌러도 닫힌다
        page.appendChild(zoom);
      };
      onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') closeZoom(); };
      window.addEventListener('keydown', onKey);
      // 돋보기를 시트 모서리에 붙인다(미리보기 열이 시트보다 넓어 preview 기준으론 떨어져 보인다)
      const previewSheet = body.querySelector<HTMLElement>('.cert-preview .cert-sheet');
      const zoomBtn = body.querySelector<HTMLElement>('.cert-zoom-btn');
      if (previewSheet && zoomBtn) previewSheet.appendChild(zoomBtn);
      body.querySelector('[data-act="zoom"]')?.addEventListener('click', openZoom);
      body.querySelector('[data-act="zoom2"]')?.addEventListener('click', openZoom);
      body.querySelector('.cert-preview .cert-sheet')?.addEventListener('click', openZoom);
      body.querySelector('[data-act="print"]')?.addEventListener('click', () => {
        closeZoom();
        document.body.classList.add('printing-certificate');
        window.addEventListener('afterprint', onAfterPrint, { once: true });
        window.print();
        window.setTimeout(onAfterPrint, 1500); // afterprint가 안 오는 브라우저 대비
      });
      body.querySelector('[data-act="map"]')?.addEventListener('click', () => navigate('#/map'));
    },
    unmount() {
      onAfterPrint();
      if (onKey) { window.removeEventListener('keydown', onKey); onKey = null; }
      page?.remove();
      page = null;
    }
  };
}
