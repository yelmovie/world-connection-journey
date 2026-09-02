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
.cert-wrap { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:clamp(14px,2vw,32px); align-items:start; width:min(1240px,100%); }
.cert-sheet {
  position:relative; width:min(100%, calc((100dvh - var(--top-bar-h) - 40px) * 0.7071)); aspect-ratio:1/1.4142; margin:0 auto;
  padding:clamp(18px,3.2cqw,40px); box-sizing:border-box; background:var(--cert-paper);
  box-shadow:0 24px 60px rgba(6,28,52,.28); color:var(--cert-ink); text-align:center; container-type:inline-size;
  display:flex; flex-direction:column; align-items:center; justify-content:space-between; gap:2cqw;
}
.cert-sheet::before { content:''; position:absolute; inset:2.2cqw; border:2px solid var(--cert-gold); pointer-events:none; }
.cert-sheet::after { content:''; position:absolute; inset:3cqw; border:1px solid rgba(201,162,74,.55); pointer-events:none; }
.cert-corner { position:absolute; width:9cqw; height:9cqw; opacity:.85; pointer-events:none; }
.cert-corner.tl { left:3.4cqw; top:3.4cqw; } .cert-corner.tr { right:3.4cqw; top:3.4cqw; transform:scaleX(-1); }
.cert-corner.bl { left:3.4cqw; bottom:3.4cqw; transform:scaleY(-1); } .cert-corner.br { right:3.4cqw; bottom:3.4cqw; transform:scale(-1); }
.cert-head { position:relative; z-index:1; display:grid; justify-items:center; gap:.6cqw; margin-top:1cqw; }
.cert-emblem { width:16cqw; height:16cqw; object-fit:contain; filter:drop-shadow(0 6px 14px rgba(20,50,80,.25)); }
.cert-kicker { font:800 2.4cqw/1.2 var(--font-body); letter-spacing:.42em; color:var(--cert-teal); text-transform:uppercase; }
.cert-title { margin:0; font:900 5.4cqw/1.15 var(--font-head); color:var(--cert-ink); letter-spacing:.02em; word-break:keep-all; }
.cert-title small { display:block; margin-top:.5cqw; font:800 2.6cqw/1.3 var(--font-body); color:#4b6a84; letter-spacing:.08em; }
.cert-fields { position:relative; z-index:1; display:grid; grid-template-columns:1fr 1fr; gap:1.6cqw 4cqw; width:78%; margin:1.2cqw auto 0; text-align:left; }
.cert-field { display:grid; grid-template-columns:auto 1fr; align-items:end; gap:1.4cqw; font:800 2.5cqw/1 var(--font-body); color:#3e5a75; }
.cert-field.wide { grid-column:1 / -1; }
.cert-field span { padding-bottom:.6cqw; white-space:nowrap; }
.cert-field i { display:block; height:4.2cqw; border-bottom:2px dotted rgba(23,54,83,.55); }
.cert-body { position:relative; z-index:1; width:84%; margin:0 auto; font:700 2.75cqw/1.75 var(--font-body); color:#22405a; word-break:keep-all; text-wrap:balance; }
.cert-body b { color:var(--cert-teal); font-weight:900; }
.cert-stamps { position:relative; z-index:1; display:grid; grid-template-columns:repeat(6,1fr); gap:1.6cqw; width:76%; margin:0 auto; }
.cert-stamp-cell { display:grid; gap:.5cqw; min-width:0; }
.cert-stamp-name { display:block; text-align:center; font:800 2.2cqw/1.2 var(--font-body); color:#4b6a84; white-space:nowrap; }
.cert-stamp { aspect-ratio:1; display:grid; place-items:center; border-radius:50%; border:2px solid rgba(201,162,74,.6); background:#fff; overflow:hidden; box-shadow:0 3px 10px rgba(20,50,80,.12); }
.cert-stamp img { width:100%; height:100%; object-fit:cover; }
.cert-stamp b { font:900 3cqw/1 var(--font-head); color:#b7c3cf; }
.cert-pledge { position:relative; z-index:1; width:80%; margin:0 auto; padding:1.4cqw 2.4cqw; border-radius:1.2cqw; background:rgba(27,127,134,.08); font:800 2.5cqw/1.5 var(--font-body); color:#1f4d42; word-break:keep-all; }
.cert-pledge em { font-style:normal; color:var(--cert-teal); }
.cert-foot { position:relative; z-index:1; display:grid; grid-template-columns:1fr auto 1fr; align-items:end; width:84%; margin:0 auto 1.2cqw; font:800 2.6cqw/1.4 var(--font-body); color:#3e5a75; }
.cert-foot .date { text-align:left; } .cert-foot .issuer { text-align:right; font-family:var(--font-head); font-weight:900; color:var(--cert-ink); font-size:3cqw; }
.cert-seal { width:13cqw; height:13cqw; object-fit:contain; justify-self:center; filter:drop-shadow(0 4px 10px rgba(20,50,80,.25)); }
.cert-side { display:grid; gap:12px; align-content:start; width:min(300px,100%); }
.cert-side .panel { padding:16px; display:grid; gap:10px; }
.cert-side h2 { margin:0; font:900 clamp(20px,1.5vw,26px)/1.2 var(--font-head); color:var(--c-navy); }
.cert-side p { margin:0; font-size:max(16px,var(--fs-small)); line-height:1.5; color:var(--c-ink-soft); font-weight:700; }
@media (max-width:1000px) { .cert-wrap { grid-template-columns:1fr; } .cert-side { width:100%; } }
@media print {
  @page { size:A4 portrait; margin:0; }
  html, body { background:#fff !important; }
  /* 인증서 페이지의 조상은 남기고 형제만 숨긴다(조상을 숨기면 인증서까지 사라진다) */
  body.printing-certificate #app > :not(#scene-root), body.printing-certificate #scene-root > :not(.cert-page) { display:none !important; }
  body.printing-certificate #app, body.printing-certificate #scene-root { display:block !important; position:static !important; width:auto; height:auto; overflow:visible !important; }
  body.printing-certificate #overlay-root, body.printing-certificate .top-bar, body.printing-certificate .cert-side, body.printing-certificate .guide-wrap { display:none !important; }
  body.printing-certificate::after { content:none !important; display:none !important; } /* 세로 안내 오버레이(A4 세로 판정) 숨김 */
  body.printing-certificate #scene-root > .cert-page { display:block !important; position:static; width:210mm; height:297mm; overflow:visible; }
  body.printing-certificate .cert-page .page-body { display:block; padding:0; overflow:visible; }
  body.printing-certificate .cert-wrap { display:block; width:210mm; }
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
      const style = document.createElement('style');
      style.textContent = STYLE;
      page.appendChild(style);
      page.appendChild(buildTopBar({ title: '인증서', backTo: '#/map', showPassport: true }));
      const body = document.createElement('div');
      body.className = 'page-body';
      body.innerHTML = `
        <div class="cert-wrap">
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
          </article>
          <aside class="cert-side">
            <section class="panel">
              <h2>${avatar.name}의 여행이 끝났어요</h2>
              <p>인쇄해서 학교·학년반·번호·이름을 직접 쓰면 나만의 인증서가 완성돼요. A4 세로로 한 장에 나와요.</p>
              <button type="button" class="btn btn-primary btn-big" data-act="print">인증서 인쇄하기</button>
              <button type="button" class="btn btn-ghost" data-act="map">지도로 돌아가기</button>
            </section>
          </aside>
        </div>`;
      page.appendChild(body);
      root.appendChild(page);
      body.querySelector('[data-act="print"]')?.addEventListener('click', () => {
        document.body.classList.add('printing-certificate');
        window.addEventListener('afterprint', onAfterPrint, { once: true });
        window.print();
        window.setTimeout(onAfterPrint, 1500); // afterprint가 안 오는 브라우저 대비
      });
      body.querySelector('[data-act="map"]')?.addEventListener('click', () => navigate('#/map'));
    },
    unmount() {
      onAfterPrint();
      page?.remove();
      page = null;
    }
  };
}
