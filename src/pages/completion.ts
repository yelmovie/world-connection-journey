import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo, recomputeUnlocks } from '../core/SaveRepository';
import { buildTopBar } from '../ui/chrome';
import { confirmDialog } from '../ui/modal';
import { showToast } from '../ui/toast';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { threeSlot } from '../ui/threeSlot';
import { createGuide, type GuideController } from '../ui/guide';
import { burstConfetti, popBounce } from '../ui/fx';
import { readLearnCard } from '../ui/learnFrame';
import { MISSION_IDS, type MissionId } from '../types';

interface CommonContent {
  reflectionFrame?: string;
  actionPrinciples?: string[];
  inquiryQuestions?: string[];
  stamps?: Array<{ id: string; label: string }>;
}

/** 여권에서 고른 탐구 질문 id → 회고 첫 칸의 "처음 생각" 예시 */
const INQUIRY_EXAMPLES: Record<string, string> = {
  q1: '예: 인사하는 방법은 어디나 똑같을 거야',
  q2: '예: 학교생활은 나라마다 전혀 다를 거야',
  q3: '예: 자연과 문화 지키기는 어른들의 일일 거야'
};

const PIECES: Array<{ id: MissionId; label: string }> = [
  { id: 'asia', label: '아시아' },
  { id: 'europe', label: '유럽' },
  { id: 'africa', label: '아프리카' },
  { id: 'americas', label: '아메리카' },
  { id: 'oceania', label: '오세아니아' },
  { id: 'dialogue', label: '존중 대화' }
];
const PIECE_COLORS: Record<MissionId, string> = {
  asia: 'var(--c-coral)', europe: 'var(--c-violet)', africa: 'var(--c-gold)',
  americas: 'var(--c-turquoise)', oceania: 'var(--c-sky)', dialogue: 'var(--c-success)'
};
const PIECE_TEXT_COLORS: Record<MissionId, string> = {
  asia: 'var(--c-ink)', europe: '#fff', africa: 'var(--c-ink)',
  americas: 'var(--c-ink)', oceania: 'var(--c-ink)', dialogue: 'var(--c-ink)'
};

/** 하단 보상 바 5슬롯 — 회고 저장 시 차례로 채워진다 */
const REWARD_ITEMS: Array<{ id: string; label: string }> = [
  { id: 'reward.trophy', label: '지구본 트로피' },
  { id: 'prop.stamp', label: '여행 도장' },
  { id: 'reward.badge', label: '지구 메달' },
  { id: 'reward.globe_puzzle', label: '퍼즐 지구본' },
  { id: 'prop.suitcase', label: '여행 가방' }
];

const COMPLETION_CSS = `
.completion-page .top-bar { height: auto; min-height: var(--top-bar-h); padding-block: var(--sp-2); }
/* 장식은 배경과 패널 사이에 깔아 둔다 — 패널을 가리지 않는다 */
.completion-page > .page-deco { z-index: -1; }
.completion-deco { position: absolute; opacity: .85; filter: drop-shadow(0 8px 18px rgba(0,0,0,.35)); }
.completion-deco.deco-left { left: clamp(4px, 1.5vw, 28px); bottom: clamp(4px, 1.5vh, 24px); width: min(clamp(64px, 8vw, 130px), 16vh); }
.completion-deco.deco-right { right: clamp(4px, 1.5vw, 28px); bottom: clamp(4px, 1.5vh, 24px); width: min(clamp(64px, 8vw, 130px), 16vh); }
.completion-deco.deco-top { left: 50%; top: 2vh; transform: translateX(-50%); width: min(clamp(70px, 9vw, 150px), 15vh); opacity: .5; }
.completion-page .page-body { gap: var(--sp-3); }
/* 리본과 주인공 캐릭터를 한 줄에 둬서 세로 공간을 아끼고 캐릭터는 크게 (§7) */
.completion-header { gap: clamp(6px, 2vw, 28px); align-items: flex-end; justify-content: center; flex-wrap: nowrap; }
.completion-header .header-side { display: flex; align-items: flex-end; gap: var(--sp-2); flex-shrink: 1; min-width: 0; }
.completion-wreath { width: min(clamp(48px, 6vw, 104px), 14vh); pointer-events: none; filter: drop-shadow(0 6px 14px rgba(0,0,0,0.35)); }
.completion-wreath.is-left { transform: scaleX(-1); }
/* §7 완료 화면 주인공 — 낮은 화면에서만 vh로 잘림을 막는다 */
.completion-mascot { width: min(clamp(200px, 24vw, 360px), 26vh); filter: drop-shadow(0 8px 18px rgba(0,0,0,0.4)); }
@media (max-height: 620px) { .completion-mascot { width: min(clamp(200px, 24vw, 360px), 23vh); } }
.completion-mascot.is-small { width: min(clamp(130px, 16vw, 240px), 18vh); animation-delay: 0.9s; }
.completion-trophy { width: min(clamp(90px, 11vw, 150px), 20vh); filter: drop-shadow(0 8px 18px rgba(0,0,0,0.35)); }
/* §7 반투명 패널 — 축하 배경이 비쳐 보이게 */
.completion-page .panel { background: rgba(255,252,240,0.9); padding: var(--sp-3) var(--sp-4); }
.completion-page .panel h2 { font-size: var(--fs-title); line-height: 1.1; }
.puzzle-row { display: flex; gap: var(--sp-4); flex-wrap: wrap; align-items: center; justify-content: center; margin-top: var(--sp-2); }
#piece-tray { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-2); }
#piece-tray .card-pick { min-width: 84px; padding: var(--sp-2); text-align: center; font-family: var(--font-head); font-size: var(--fs-small); }
#globe-zone {
  position: relative; width: min(300px, 46vw, 34vh); aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #bfe6ff, #2588E8 70%); box-shadow: var(--shadow-pop);
  display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; overflow: hidden;
}
.puzzle-trophy-row { display: flex; justify-content: center; align-items: center; gap: var(--sp-4); flex-wrap: wrap; margin-top: var(--sp-2); }
/* 축하 연출이 끝난 뒤(회고·수료증)에는 헤더를 줄여 본문이 한 화면에 들어오게 한다 */
.completion-page.is-writing .completion-wreath,
.completion-page.is-final .completion-wreath { display: none; }
.completion-page.is-writing .completion-mascot,
.completion-page.is-final .completion-mascot { width: min(clamp(80px, 9vw, 130px), 11vh); }
.completion-page.is-writing .completion-mascot.is-small,
.completion-page.is-final .completion-mascot.is-small { display: none; }
.completion-page.is-final .page-body {
  display: grid; grid-template-columns: minmax(200px, 0.75fr) minmax(0, 1.7fr);
  grid-template-rows: auto minmax(0, 1fr); gap: var(--sp-3); align-content: start;
}
.completion-page.is-final .scene-header { grid-column: 1 / -1; }
.completion-page.is-final #sec-rewards,
.completion-page.is-final #sec-cert { min-height: 0; overflow: hidden; }
/* 3D 지구본 슬롯은 아래 스티커의 "퍼즐 지구본"과 같은 보상이라 마지막 화면에서는 접는다 */
.completion-page.is-final #globe-3d-slot { display: none; }
.completion-page.is-final .completion-trophy { width: min(clamp(70px, 8vw, 130px), 15vh); }
.completion-page.is-final .cert-frame { width: min(100%, 44vh); margin-inline: auto; }
@media (max-height: 620px) {
  .completion-page.is-final .cert-frame { width: min(100%, 38vh); }
}
@media (max-width: 900px) {
  .completion-page.is-final .page-body { grid-template-columns: 1fr; }
}
.completion-rewards { justify-content: center; }
.completion-rewards .sticker { width: min(68px, 9vh); height: min(68px, 9vh); }
.completion-rewards .sticker-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.completion-rewards .sticker-name { font-size: var(--fs-small); font-weight: 700; color: var(--c-ink-soft); }
.cert-frame { position: relative; max-width: min(720px, 100%); margin: var(--sp-2) auto; }
.cert-frame-img { width: 100%; display: block; }
.cert-frame .cert-text {
  position: absolute; inset: 20% 15% 17%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; overflow-y: auto; text-align: center; color: #19324D;
  font-size: var(--fs-small);
}
.cert-frame .cert-text .cert-eyebrow { letter-spacing: 0.3em; color: #6f5514; font-size: var(--fs-small); }
.cert-frame .cert-text h2 { font-family: var(--font-head); font-size: 1.7em; margin: 0; color: #19324D; }
.cert-frame .cert-text .cert-quote { background: rgba(255,249,234,0.85); border-radius: 10px; padding: 6px 12px; max-width: 92%; }
.ref-row { display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-body); }
.ref-row .ref-input { padding: 8px 10px; border: 2px solid var(--c-line); border-radius: var(--radius-s); }
/* 회고 위 배움 카드 6장 요약 — 미션에서 만난 친구와 발견을 다시 본다 */
.completion-learn { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--sp-2); margin: var(--sp-2) 0 var(--sp-3); }
.learn-card-row .learn-card-main { display: flex; flex-direction: column; min-width: 0; text-align: left; }
.learn-card-row .learn-card-title { font-family: var(--font-head); color: var(--c-navy); line-height: 1.15; }
.learn-card-row .learn-card-line {
  color: var(--c-ink-soft); font-weight: 600; font-size: calc(var(--fs-small)*.9); line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
/* 여권에서 고른 탐구 질문 — 여기서 답을 적으며 학습 고리를 닫는다 */
.completion-inquiry {
  background: rgba(242,193,78,.18); border: 2px solid rgba(242,193,78,.6); border-radius: var(--radius-m);
  padding: var(--sp-2) var(--sp-3); font-weight: 800; color: var(--c-navy); margin-bottom: var(--sp-2);
}
/* 수료증 안의 배움 목록 */
.cert-learned { list-style: none; margin: 2px 0 0; padding: 0; max-width: 94%; display: flex; flex-direction: column; gap: 1px; font-size: calc(var(--fs-small)*.82); }
.cert-learned li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cert-learned-title { font-weight: 800; color: #6f5514; }
@media (max-width: 700px) { .completion-learn { grid-template-columns: 1fr; } }
/* 낮은 화면(1024×576 교실 태블릿)에서 회고 단계가 스크롤 없이 들어오도록 밀도를 올린다 */
@media (max-height: 620px) {
  .completion-page .page-body { gap: var(--sp-2); padding-block: 4px; }
  .completion-page .panel { padding: var(--sp-2) var(--sp-3); }
  .completion-learn { grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; margin: 6px 0 8px; }
  .completion-learn .learn-card-row { padding: 3px 8px; }
  .completion-learn .learn-card-row img { width: 26px; height: 26px; }
  .completion-learn .learn-card-line { -webkit-line-clamp: 1; }
  .completion-inquiry { padding: 4px 10px; font-size: var(--fs-small); margin-bottom: 6px; }
  .ref-row { gap: 6px; font-size: var(--fs-small); }
  .ref-row .ref-input { min-height: 44px; padding: 6px 8px; }
  #sec-reflect h3 { font-size: var(--fs-body); margin-top: var(--sp-2) !important; }
  #principles .btn { min-height: 44px; padding: 6px 14px; }
  #sec-reflect .modal-actions { margin-top: var(--sp-2) !important; }
}
`;

export function createPage(): Page {
  let dnd: PickPlaceController | null = null;
  let guide: GuideController | null = null;
  const timers: number[] = [];

  return {
    async mount(root: HTMLElement) {
      // 직접 URL 접근 차단: 저장값을 믿지 않고 재계산 (라우터 가드의 2차 방어)
      const save = saveRepo.get();
      recomputeUnlocks(save);
      if (!save.completion.unlocked) {
        navigate('#/map');
        return;
      }

      let common: CommonContent = {};
      try {
        common = await loadContent<CommonContent>('common');
      } catch {
        /* 기본값 사용 */
      }
      await preloadImages([
        'bg.completion', 'reward.globe_puzzle', 'reward.badge', 'reward.trophy',
        'reward.certificate', 'reward.wreath', 'plane.main', 'plane.alt1',
        'prop.stamp', 'prop.suitcase',
        'deco.emblem_unity', 'prop.globe_glow', 'deco.flight_kids'
      ]);
      audio.playBgm('main');

      const principles = common.actionPrinciples ?? ['관찰하기', '물어보기', '끝까지 듣기', '잘못 알았으면 수정하기'];
      const placed = new Set<MissionId>(save.completion.placedPuzzlePieceIds);

      // 여권(질문 선택) → 미션(배움 카드) → 수료증(내 답)으로 학습 고리를 닫는다
      const inquiryId = save.profile?.inquiryQuestionId ?? 'q1';
      const inquiryIndex = Math.max(0, ['q1', 'q2', 'q3'].indexOf(inquiryId));
      const inquiryQuestion = (common.inquiryQuestions ?? [])[inquiryIndex] ?? '';
      const learnCards = MISSION_IDS.map((id) => ({ id, ...readLearnCard(id) }));
      const earnedCards = learnCards.filter((card) => card.earned && card.friendName);

      const page = document.createElement('div');
      page.className = 'page completion-page';
      page.style.backgroundImage = `linear-gradient(rgba(15,28,45,0.45), rgba(15,28,45,0.6)), url('${assetUrl('bg.completion')}')`;
      const style = document.createElement('style');
      style.textContent = COMPLETION_CSS;
      page.appendChild(style);
      page.appendChild(buildTopBar({ title: '세계 연결 인증', backTo: '#/map' }));

      // 배경 위 장식 — 패널 뒤(z-index:-1)에 깔려 레이아웃에 영향을 주지 않는다 (§7 에셋 다양성)
      const deco = document.createElement('div');
      deco.className = 'page-deco';
      deco.setAttribute('aria-hidden', 'true');
      deco.innerHTML = `
        ${hasAsset('deco.emblem_unity') ? `<img class="completion-deco deco-left" src="${assetUrl('deco.emblem_unity')}" data-asset-id="deco.emblem_unity" alt="">` : ''}
        ${hasAsset('prop.globe_glow') ? `<img class="completion-deco deco-right" src="${assetUrl('prop.globe_glow')}" data-asset-id="prop.globe_glow" alt="">` : ''}
        ${hasAsset('deco.flight_kids') ? `<img class="completion-deco deco-top" src="${assetUrl('deco.flight_kids')}" data-asset-id="deco.flight_kids" alt="">` : ''}`;
      page.appendChild(deco);

      const wreathHtml = hasAsset('reward.wreath')
        ? `<img class="completion-wreath is-left" src="${assetUrl('reward.wreath')}" data-asset-id="reward.wreath" alt="" aria-hidden="true">`
        : '';
      const wreathHtmlR = hasAsset('reward.wreath')
        ? `<img class="completion-wreath" src="${assetUrl('reward.wreath')}" data-asset-id="reward.wreath" alt="" aria-hidden="true">`
        : '';

      const body = document.createElement('div');
      body.className = 'page-body';
      body.innerHTML = `
        <div class="scene-header completion-header">
          <div class="header-side">
            ${wreathHtml}
            ${hasAsset('plane.main') ? `<img class="bob completion-mascot" src="${assetUrl('plane.main')}" data-asset-id="plane.main" alt="" aria-hidden="true">` : ''}
          </div>
          <div class="ribbon-title">
            <span class="ribbon-main">세계 연결 완주!</span>
            <span class="ribbon-sub">다섯 대륙과 존중의 대화를 모두 마쳤어요</span>
          </div>
          <div class="header-side">
            ${hasAsset('plane.alt1') ? `<img class="bob completion-mascot is-small" src="${assetUrl('plane.alt1')}" data-asset-id="plane.alt1" alt="" aria-hidden="true">` : ''}
            ${wreathHtmlR}
          </div>
        </div>

        <section class="panel" id="sec-puzzle">
          <h2 style="color:var(--c-navy)">① 퍼즐 지구본 완성하기</h2>
          <div class="puzzle-row" id="puzzle-play">
            <div id="piece-tray"></div>
            <div id="globe-zone"></div>
          </div>
        </section>

        <section class="panel" id="sec-reflect" style="display:none">
          <h2 style="color:var(--c-navy)">② 여행에서 바뀐 나의 생각</h2>
          <div class="completion-learn" aria-label="여행에서 받은 배움 카드">
            ${learnCards.map((card) => {
              const label = PIECES.find((piece) => piece.id === card.id)?.label ?? card.id;
              return card.earned && card.friendName
                ? `<div class="learn-card-row">${card.friendImageId && hasAsset(card.friendImageId) ? `<img src="${assetUrl(card.friendImageId)}" data-asset-id="${card.friendImageId}" alt="" aria-hidden="true">` : ''}<div class="learn-card-main"><span class="learn-card-title">${escapeHtml(card.friendName)} · ${label}</span><span class="learn-card-line">${escapeHtml(card.line)}</span></div></div>`
                : `<div class="learn-card-row is-empty"><div class="learn-card-main"><span class="learn-card-title">${label}</span><span class="learn-card-line">아직 받지 못한 배움 카드예요</span></div></div>`;
            }).join('')}
          </div>
          ${inquiryQuestion ? `<p class="completion-inquiry">여행을 떠나며 네가 고른 질문 — “${escapeHtml(inquiryQuestion)}” 이제 너의 답을 적어 봐요!</p>` : ''}
          <div class="ref-row">
            <label>처음에는 <input id="ref-1" type="text" maxlength="60" class="ref-input" placeholder="${escapeHtml(INQUIRY_EXAMPLES[inquiryId] ?? '예: 다른 나라 친구들은 우리와 아주 다를 거야')}" style="width:min(420px,90%)"> 라고 생각했지만,</label>
            <label><input id="ref-2" type="text" maxlength="60" class="ref-input" placeholder="예: 아시아 친구의 하루" style="width:min(300px,80%)"> 자료를 보고,</label>
            <label><input id="ref-3" type="text" maxlength="60" class="ref-input" placeholder="예: 비슷한 점도 많고 저마다 다른 이유가 있구나" style="width:min(420px,90%)"> 라고 생각을 바꾸었어요.</label>
          </div>
          <h3 style="color:var(--c-navy);margin-top:var(--sp-3)">실천 약속 — 두 가지를 골라요</h3>
          <div id="principles" style="display:flex;gap:var(--sp-2);flex-wrap:wrap;margin-top:var(--sp-2)">
            ${principles.map((p) => `<button type="button" class="btn btn-ghost principle-pick" data-p="${p}" aria-pressed="false">${p}</button>`).join('')}
          </div>
          <div class="modal-actions" style="margin-top:var(--sp-3)"><button class="btn btn-primary btn-big" id="btn-reflect-done">기록 저장</button></div>
        </section>

        <section class="panel" id="sec-rewards" style="display:none">
          <h2 style="color:var(--c-navy)">여행 보상</h2>
          <div class="puzzle-trophy-row">
            <div id="globe-3d-slot"></div>
            ${hasAsset('reward.trophy') ? `<img id="trophy-img" class="completion-trophy" src="${assetUrl('reward.trophy')}" data-asset-id="reward.trophy" alt="" aria-hidden="true">` : ''}
          </div>
          <div class="sticker-row completion-rewards" style="margin-top:var(--sp-2)">
            ${REWARD_ITEMS.map((r) => `
              <div class="sticker-slot">
                <div class="sticker" data-reward="${r.id}" role="img" aria-label="${r.label}"></div>
                <span class="sticker-name">${r.label}</span>
              </div>`).join('')}
          </div>
        </section>

        <section class="panel" id="sec-cert" style="display:none">
          <h2 style="color:var(--c-navy)">③ 세계 연결 수료증</h2>
          <div id="cert-preview"></div>
          <div class="modal-actions" style="justify-content:center;margin-top:var(--sp-3)">
            <button class="btn btn-success btn-big" id="btn-print">인쇄하기</button>
            <button class="btn btn-ghost" id="btn-new-journey">새 여행</button>
          </div>
        </section>`;
      page.appendChild(body);
      root.appendChild(page);

      // 마스코트 가이드 — 퍼즐 → 회고 → 인쇄 순으로 다음 행동 안내
      guide = createGuide({});
      page.appendChild(guide.el);

      // Three.js 예약 슬롯 — 완성 지구본 (GLB 준비 시 회전 지구본으로 교체)
      body.querySelector('#globe-3d-slot')?.appendChild(
        threeSlot({ slotId: 'completion-globe', assetId: 'reward.globe_puzzle', label: '완성된 퍼즐 지구본', width: 'min(220px,44vw)' })
      );

      // ---- 보상 바 채우기 (표현 전용) ----
      const fillRewards = (animate: boolean) => {
        const slots = Array.from(body.querySelectorAll<HTMLElement>('[data-reward]'));
        slots.forEach((slot, i) => {
          if (slot.classList.contains('is-filled')) return;
          const id = slot.dataset.reward ?? '';
          const fill = () => {
            slot.classList.add('is-filled');
            if (hasAsset(id)) {
              const img = document.createElement('img');
              img.src = assetUrl(id);
              img.dataset.assetId = id;
              img.alt = '';
              img.setAttribute('aria-hidden', 'true');
              slot.appendChild(img);
            }
            popBounce(slot);
          };
          if (animate) timers.push(window.setTimeout(fill, 250 + i * 200));
          else fill();
        });
      };

      // ---- 퍼즐 지구본 ----
      const tray = body.querySelector('#piece-tray') as HTMLElement;
      const globe = body.querySelector('#globe-zone') as HTMLElement;
      const alreadyIssued = save.completion.certificateIssued;

      const appendPlacedPiece = (id: MissionId) => {
        const seg = document.createElement('div');
        seg.dataset.pieceId = id;
        seg.style.cssText = `background:${PIECE_COLORS[id]};display:flex;align-items:center;justify-content:center;color:${PIECE_TEXT_COLORS[id]};font-family:var(--font-head);font-size:var(--fs-small)`;
        seg.textContent = PIECES.find((p) => p.id === id)?.label ?? '';
        globe.appendChild(seg);
      };

      for (const id of placed) appendPlacedPiece(id);

      for (const piece of PIECES) {
        if (placed.has(piece.id)) continue;
        const el = document.createElement('div');
        el.className = 'card card-pick';
        el.dataset.itemId = piece.id;
        el.style.cssText = `min-width:88px;text-align:center;font-family:var(--font-head);border-top:6px solid ${PIECE_COLORS[piece.id]}`;
        el.innerHTML = `<span aria-hidden="true">◆</span><br>${piece.label}`;
        el.setAttribute('aria-label', `퍼즐 조각: ${piece.label}`);
        tray.appendChild(el);
      }
      globe.dataset.zoneId = 'globe';
      globe.setAttribute('aria-label', '지구본 — 조각을 놓는 곳');

      // 단계가 끝나면 그 단계 패널은 접는다 — 한 화면에 큰 패널 2개 이하(§7), 스크롤 없이 순서대로.
      const puzzleDone = (announce = true) => {
        if (announce) {
          void audio.playSfx('complete');
          burstConfetti(globe, 24); // 파티클은 overlay-root에 fixed로 붙으므로 패널을 접어도 남는다
        }
        page.classList.add('is-writing');
        (body.querySelector('#sec-puzzle') as HTMLElement).style.display = 'none';
        (body.querySelector('#sec-reflect') as HTMLElement).style.display = 'block';
        guide?.say('지구본이 완성됐어요! 여행에서 바뀐 생각을 적어 봐요.', { cue: body.querySelector<HTMLElement>('#ref-1') });
        if (alreadyIssued) {
          fillRewards(false); // 이미 발급했던 경우 보상 바 즉시 채움
          revealCertificate(); // 회고 스킵 가능
        }
      };

      dnd = enablePickPlace({
        items: Array.from(tray.querySelectorAll<HTMLElement>('.card-pick')),
        zones: [globe],
        onPlace: (itemId) => {
          if (!MISSION_IDS.includes(itemId as MissionId)) return;
          const id = itemId as MissionId;
          if (placed.has(id)) return;
          placed.add(id);
          const src = tray.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
          src?.remove();
          appendPlacedPiece(id);
          saveRepo.update((s) => {
            s.completion.placedPuzzlePieceIds = PIECES
              .map((piece) => piece.id)
              .filter((pieceId) => placed.has(pieceId));
          });
          void audio.playSfx('stamp');
          if (placed.size === PIECES.length) puzzleDone();
          else guide?.setCue(tray.querySelector<HTMLElement>('.card-pick')); // 다음 조각으로 큐 이동
        }
      });
      if (placed.size < PIECES.length) {
        guide.say('조각을 지구본으로 옮겨 봐요!', { cue: tray.querySelector<HTMLElement>('.card-pick') });
      }

      // ---- 회고 + 실천 약속 ----
      const chosen = new Set<string>(
        save.completion.actionPrinciples.filter((principle) => principles.includes(principle)).slice(0, 2)
      );
      const persistChosen = () => {
        saveRepo.update((s) => {
          s.completion.actionPrinciples = [...chosen];
        });
      };
      body.querySelectorAll<HTMLElement>('.principle-pick').forEach((btn) => {
        if (chosen.has(btn.dataset.p ?? '')) {
          btn.classList.add('is-selected');
          btn.setAttribute('aria-pressed', 'true');
        }
        btn.addEventListener('click', () => {
          const p = btn.dataset.p ?? '';
          if (chosen.has(p)) {
            chosen.delete(p);
            btn.classList.remove('is-selected');
            btn.setAttribute('aria-pressed', 'false');
            persistChosen();
          } else if (chosen.size < 2) {
            chosen.add(p);
            btn.classList.add('is-selected');
            btn.setAttribute('aria-pressed', 'true');
            persistChosen();
            void audio.playSfx('tap');
          } else {
            showToast('실천 약속은 두 가지만 고를 수 있어요.');
          }
        });
      });

      const draftInputs = [
        ['#ref-1', 'initialThought'],
        ['#ref-2', 'evidenceLearned'],
        ['#ref-3', 'revisedThought']
      ] as const;
      for (const [selector, key] of draftInputs) {
        const input = body.querySelector<HTMLInputElement>(selector);
        if (!input) continue;
        input.value = save.completion.reflectionDrafts[key];
        input.addEventListener('input', () => {
          const value = input.value.slice(0, 60);
          if (input.value !== value) input.value = value;
          saveRepo.update((s) => {
            s.completion.reflectionDrafts[key] = value;
          });
        });
      }

      const revealCertificate = () => {
        const s = saveRepo.get();
        const cert = body.querySelector('#cert-preview') as HTMLElement;
        const dateStr = new Date().toLocaleDateString('ko-KR');
        if (hasAsset('reward.certificate')) {
          // 두루마리 이미지 프레임 위 텍스트 오버레이 (인쇄용 HTML은 기존 유지)
          cert.className = 'cert-frame';
          cert.innerHTML = `
            <img class="cert-frame-img" src="${assetUrl('reward.certificate')}" data-asset-id="reward.certificate" alt="" aria-hidden="true">
            <div class="cert-text">
              <p class="cert-eyebrow">CERTIFICATE</p>
              <h2>세계 연결 수료증</h2>
              <p><strong>${escapeHtml(s.profile?.nickname ?? '여행자')}</strong> 여행자</p>
              <p>다섯 대륙의 생활을 조사하고, 다름을 잇는 대화를 완주하여<br>세계를 연결하는 여행을 마쳤음을 인증합니다.</p>
              ${inquiryQuestion ? `<p>나의 탐구 질문: <strong>“${escapeHtml(inquiryQuestion)}”</strong></p>` : ''}
              ${earnedCards.length ? `<p class="cert-learned-title">내가 만난 친구들과 배운 것</p><ul class="cert-learned">${earnedCards.slice(0, 6).map((card) => `<li><strong>${escapeHtml(card.friendName)}</strong> · ${escapeHtml(card.line)}</li>`).join('')}</ul>` : ''}
              ${s.completion.reflection ? `<p class="cert-quote">“${escapeHtml(s.completion.reflection)}”</p>` : ''}
              ${s.completion.actionPrinciples.length ? `<p>나의 실천 약속: <strong>${s.completion.actionPrinciples.map(escapeHtml).join(' · ')}</strong></p>` : ''}
              <p style="color:#6b7a8d">${dateStr} · 세계를 잇는 여행</p>
            </div>`;
        } else {
          cert.style.cssText = 'background:#fff;border:6px double var(--c-gold);border-radius:var(--radius-s);padding:var(--sp-6);text-align:center;max-width:720px;margin:var(--sp-4) auto';
          cert.innerHTML = certificateHtml(s.profile?.nickname ?? '여행자', dateStr, s.completion.reflection, s.completion.actionPrinciples, inquiryQuestion, earnedCards);
        }
        // 마지막 단계: 보상 스트립 + 수료증만 남긴다(헤더는 축소해 둘 다 스크롤 없이 보이게)
        page.classList.add('is-final');
        (body.querySelector('#sec-puzzle') as HTMLElement).style.display = 'none';
        (body.querySelector('#sec-reflect') as HTMLElement).style.display = 'none';
        (body.querySelector('#sec-rewards') as HTMLElement).style.display = 'block';
        (body.querySelector('#sec-cert') as HTMLElement).style.display = 'block';
        const trophy = body.querySelector<HTMLElement>('#trophy-img');
        if (trophy) popBounce(trophy);
        guide?.say('수료증을 인쇄할 수 있어요!', { cue: body.querySelector<HTMLElement>('#btn-print') });
        const reducedMotion = saveRepo.get().settings.reducedMotion
          || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        body.querySelector('#sec-cert')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      };

      body.querySelector('#btn-reflect-done')?.addEventListener('click', () => {
        const r1 = (body.querySelector('#ref-1') as HTMLInputElement).value.trim();
        const r2 = (body.querySelector('#ref-2') as HTMLInputElement).value.trim();
        const r3 = (body.querySelector('#ref-3') as HTMLInputElement).value.trim();
        if (!r1 || !r2 || !r3) {
          showToast('세 칸을 모두 채워 볼까요? 짧아도 좋아요.', 'warn');
          return;
        }
        if (chosen.size < 2) {
          showToast('실천 약속 두 가지를 골라 주세요.', 'warn');
          return;
        }
        saveRepo.update((s) => {
          s.completion.reflection = `처음에는 ${r1}라고 생각했지만, ${r2} 자료를 보고 ${r3}라고 생각을 바꾸었다.`;
          s.completion.reflectionDrafts = {
            initialThought: r1.slice(0, 60),
            evidenceLearned: r2.slice(0, 60),
            revisedThought: r3.slice(0, 60)
          };
          s.completion.actionPrinciples = [...chosen];
          if (!s.rewardClaimedById['completion']) {
            s.rewardClaimedById['completion'] = true; // 수료 보상 1회 지급
          }
          s.completion.certificateIssued = true;
        });
        void audio.playSfx('complete');
        fillRewards(true); // 보상 바 차례로 채우기
        revealCertificate();
      });

      body.querySelector('#btn-print')?.addEventListener('click', () => {
        const s = saveRepo.get();
        let printBox = document.querySelector('.certificate-print') as HTMLElement | null;
        if (!printBox) {
          printBox = document.createElement('div');
          printBox.className = 'certificate-print';
          document.getElementById('scene-root')?.appendChild(printBox);
        }
        printBox.innerHTML = certificateHtml(
          s.profile?.nickname ?? '여행자',
          new Date().toLocaleDateString('ko-KR'),
          s.completion.reflection,
          s.completion.actionPrinciples,
          inquiryQuestion,
          earnedCards,
          true
        );
        document.body.classList.add('printing-certificate');
        window.print();
        window.setTimeout(() => document.body.classList.remove('printing-certificate'), 500);
      });

      body.querySelector('#btn-new-journey')?.addEventListener('click', () => {
        confirmDialog(
          '새 여행을 시작할까요?',
          '지금까지의 도장과 기록이 지워져요. 수료증은 미리 인쇄해 두는 것을 추천해요!',
          '새로 시작',
          () => {
            saveRepo.reset();
            navigate('#/');
          }
        );
      });

      // 기존 발급자는 회고 섹션 즉시 노출
      if (placed.size === PIECES.length) puzzleDone(false);
    },

    unmount() {
      for (const t of timers) window.clearTimeout(t);
      timers.length = 0;
      dnd?.dispose();
      dnd = null;
      guide?.dispose();
      guide = null;
    }
  };
}

function certificateHtml(
  nickname: string, date: string, reflection: string, principles: string[],
  inquiry = '', learned: Array<{ friendName: string; line: string }> = [], forPrint = false
): string {
  return `
    <div style="${forPrint ? 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:10px double #F2C14E;margin:16px;padding:24px;' : ''}text-align:center;font-family:var(--font-body, sans-serif);color:#19324D">
      <p style="font-size:1rem;letter-spacing:0.3em;color:#6f5514">CERTIFICATE</p>
      <h2 style="font-family:var(--font-head, sans-serif);font-size:2em;margin:8px 0">세계 연결 수료증</h2>
      <p style="font-size:1.2em;margin:12px 0"><strong>${escapeHtml(nickname)}</strong> 여행자</p>
      <p>다섯 대륙의 생활을 조사하고, 다름을 잇는 대화를 완주하여<br>세계를 연결하는 여행을 마쳤음을 인증합니다.</p>
      ${inquiry ? `<p style="font-size:1rem;margin:10px 0 0">나의 탐구 질문: <strong>“${escapeHtml(inquiry)}”</strong></p>` : ''}
      ${learned.length ? `<div style="margin:10px auto 0;max-width:560px;text-align:left;font-size:0.95rem"><p style="font-weight:800;color:#6f5514;margin:0 0 4px">내가 만난 친구들과 배운 것</p><ul style="margin:0;padding-left:20px">${learned.slice(0, 6).map((item) => `<li><strong>${escapeHtml(item.friendName)}</strong> · ${escapeHtml(item.line)}</li>`).join('')}</ul></div>` : ''}
      ${reflection ? `<p style="margin:14px auto;max-width:560px;background:#FFF9EA;border-radius:12px;padding:12px;font-size:1rem">“${escapeHtml(reflection)}”</p>` : ''}
      ${principles.length ? `<p style="font-size:1rem">나의 실천 약속: <strong>${principles.map(escapeHtml).join(' · ')}</strong></p>` : ''}
      <p style="margin-top:16px;color:#6b7a8d">${date} · 세계를 잇는 여행</p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
