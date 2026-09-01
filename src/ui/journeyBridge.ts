import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { openModal } from './modal';

/**
 * 대륙 이동 전 15초 브릿지 미니게임(P2-13) — 읽기-탭 사이의 페이스 브레이커.
 * - 기본: 배낭 챙기기(6개 중 3개 고르기, 10초 소프트 타이머 — 실패 없음)
 * - 아프리카 완료 후: 학생이 만든 여덟 박 리듬이 콜&리스폰스로 재등장
 * 언제든 "바로 출발"로 건너뛸 수 있다.
 */

const PACK_ITEMS: Array<{ id: string; label: string; svg: string }> = [
  { id: 'bottle', label: '물병', svg: '<path d="M9 3h6v3l1.5 2v12a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V8L9 6z"/><path d="M8 12h8"/>' },
  { id: 'hat', label: '모자', svg: '<path d="M4 15c0-4 3.5-8 8-8s8 4 8 8"/><path d="M2 15h20"/>' },
  { id: 'map', label: '탐험 지도', svg: '<path d="m3 6 5-2 8 2 5-2v14l-5 2-8-2-5 2z"/><path d="M8 4v14M16 6v14"/>' },
  { id: 'camera', label: '사진기', svg: '<rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M9 7l1.5-3h3L15 7"/>' },
  { id: 'note', label: '여행 수첩', svg: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>' },
  { id: 'scope', label: '쌍안경', svg: '<circle cx="7" cy="16" r="4"/><circle cx="17" cy="16" r="4"/><path d="M7 12V5h4v7M13 12V5h4v7M11 8h2"/>' }
];

const icon = (svg: string): string =>
  `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svg}</svg>`;

let activeCleanup: (() => void) | null = null;

export function cancelJourneyBridge(): void {
  activeCleanup?.();
  activeCleanup = null;
}

/** 아프리카에서 학생이 만든 여덟 박 리듬(0 쉼 · 1 쿵 · 2 탁). 없거나 박이 2개 미만이면 null. */
function savedAfricaRhythm(): number[] | null {
  const save = saveRepo.get();
  if (save.missions.africa.status !== 'completed') return null;
  const lab = (save.missions.africa.data.africaProgress as { instrumentLab?: { createdRhythm?: unknown } } | undefined)?.instrumentLab;
  const cells = Array.isArray(lab?.createdRhythm)
    ? lab.createdRhythm.filter((cell): cell is number => cell === 0 || cell === 1 || cell === 2)
    : [];
  return cells.filter((cell) => cell !== 0).length >= 2 ? cells.slice(0, 8) : null;
}

export function playDepartureBridge(destinationName: string): Promise<void> {
  return new Promise((resolve) => {
    const rhythm = savedAfricaRhythm();
    const timers: number[] = [];
    let settled = false;
    const done = (close?: () => void) => {
      if (settled) return;
      settled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.length = 0;
      if (activeCleanup === cleanup) activeCleanup = null;
      close?.();
      resolve();
    };
    const cleanup = () => done(closeModal);
    activeCleanup = cleanup;

    const body = document.createElement('div');
    body.className = 'journey-bridge';
    let closeModal: () => void = () => undefined;

    if (rhythm) {
      /* ===== 리듬 에코 — 내가 만든 리듬으로 출발 신호 보내기 ===== */
      const beats = rhythm.filter((cell) => cell !== 0);
      let echoIndex = 0;
      body.innerHTML = `
        <p class="journey-bridge__copy">아프리카에서 만든 <strong>네 리듬</strong>이 출발 신호야! 듣고 그대로 따라 쳐 봐.</p>
        <div class="journey-bridge__cells" aria-label="내가 만든 여덟 박 리듬">
          ${rhythm.map((cell) => `<span class="journey-bridge__cell" data-cell="${cell}" aria-hidden="true">${cell === 1 ? '●' : cell === 2 ? '▲' : ''}</span>`).join('')}
        </div>
        <div class="journey-bridge__drums">
          <button type="button" class="btn btn-ghost journey-bridge__drum" data-beat="1">● 가운데 쿵</button>
          <button type="button" class="btn btn-ghost journey-bridge__drum" data-beat="2">▲ 가장자리 탁</button>
        </div>
        <p class="journey-bridge__status" data-status>리듬을 들려줄게…</p>`;
      const cells = [...body.querySelectorAll<HTMLElement>('.journey-bridge__cell')];
      const status = body.querySelector<HTMLElement>('[data-status]')!;
      const playCall = () => {
        rhythm.forEach((cell, i) => timers.push(window.setTimeout(() => {
          cells.forEach((el) => el.classList.remove('is-play'));
          cells[i]?.classList.add('is-play');
          if (cell === 1) audio.playBeat('low');
          if (cell === 2) audio.playBeat('high');
        }, i * 330)));
        timers.push(window.setTimeout(() => {
          cells.forEach((el) => el.classList.remove('is-play'));
          status.textContent = '이제 네 차례! 쉼은 건너뛰고 순서대로 쳐 봐.';
        }, rhythm.length * 330 + 120));
      };
      body.querySelectorAll<HTMLButtonElement>('[data-beat]').forEach((drum) => drum.addEventListener('click', () => {
        if (echoIndex >= beats.length) return;
        const expected = beats[echoIndex];
        const hit = Number(drum.dataset.beat);
        audio.playBeat(hit === 1 ? 'low' : 'high');
        if (hit === expected) {
          echoIndex += 1;
          // 몇 번째 박까지 맞췄는지 칸에 표시
          let seen = 0;
          cells.forEach((el, i) => {
            if (rhythm[i] !== 0) {
              seen += 1;
              el.classList.toggle('is-echoed', seen <= echoIndex);
            }
          });
          if (echoIndex >= beats.length) {
            status.textContent = '완벽해! 리듬 신호가 하늘로 퍼졌어 — 출발!';
            void audio.playSfx('success');
            timers.push(window.setTimeout(() => done(closeModal), 700));
          } else {
            status.textContent = `좋아! ${beats.length - echoIndex}박 남았어.`;
          }
        } else {
          // 실패 없음 — 틀려도 그 자리에서 다시
          drum.classList.remove('is-shake');
          void drum.offsetWidth;
          drum.classList.add('is-shake');
          status.textContent = '아까 그 박이 아니야 — 다시 잘 듣고 쳐 봐!';
        }
      }));
      closeModal = openModal({
        id: 'journey-bridge',
        title: `${destinationName}로 신호 보내기`,
        bodyEl: body,
        dismissible: false,
        actions: [
          { label: '다시 듣기', kind: 'ghost', onClick: () => { if (!settled) playCall(); } },
          { label: '바로 출발', kind: 'ghost', onClick: () => done(closeModal) }
        ]
      });
      playCall();
    } else {
      /* ===== 배낭 챙기기 — 10초 안에 3개 고르기(소프트 타이머, 실패 없음) ===== */
      const picked = new Set<string>();
      let remain = 10;
      body.innerHTML = `
        <p class="journey-bridge__copy"><strong>${destinationName}</strong> 여행에 가져갈 물건 <strong>3개</strong>를 골라 배낭에 담아!</p>
        <div class="journey-bridge__grid" role="group" aria-label="배낭에 담을 물건 고르기">
          ${PACK_ITEMS.map((item) => `<button type="button" class="journey-bridge__item" data-item="${item.id}" aria-pressed="false">${icon(item.svg)}<span>${item.label}</span></button>`).join('')}
        </div>
        <p class="journey-bridge__status" data-status>남은 시간 10초 · 0/3 담았어</p>`;
      const status = body.querySelector<HTMLElement>('[data-status]')!;
      const departLater = (message: string) => {
        status.textContent = message;
        void audio.playSfx('success');
        timers.push(window.setTimeout(() => done(closeModal), 650));
      };
      const tick = () => {
        remain -= 1;
        if (settled) return;
        if (remain <= 0) {
          // 시간이 끝나도 벌은 없다 — 챙긴 만큼 들고 출발
          departLater(picked.size > 0 ? '시간 끝! 챙긴 것만 들고 출발!' : '시간 끝! 몸만 가볍게 출발!');
          return;
        }
        status.textContent = `남은 시간 ${remain}초 · ${picked.size}/3 담았어`;
        timers.push(window.setTimeout(tick, 1000));
      };
      timers.push(window.setTimeout(tick, 1000));
      body.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((button) => button.addEventListener('click', () => {
        const id = button.dataset.item!;
        if (picked.has(id)) {
          picked.delete(id);
          button.setAttribute('aria-pressed', 'false');
        } else if (picked.size < 3) {
          picked.add(id);
          button.setAttribute('aria-pressed', 'true');
          void audio.playSfx('pickup');
        }
        status.textContent = `남은 시간 ${remain}초 · ${picked.size}/3 담았어`;
        if (picked.size >= 3) {
          const labels = PACK_ITEMS.filter((item) => picked.has(item.id)).map((item) => item.label).join('·');
          departLater(`${labels} 챙겼다 — 출발!`);
        }
      }));
      closeModal = openModal({
        id: 'journey-bridge',
        title: '배낭 챙기기',
        bodyEl: body,
        dismissible: false,
        actions: [{ label: '바로 출발', kind: 'ghost', onClick: () => done(closeModal) }]
      });
    }
  });
}
