import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { openModal } from './modal';

/**
 * 대륙 이동 전 브릿지(P2-13) — 아프리카를 완주해 자기 리듬을 만든 학생에게만 나온다.
 * 학생이 만든 여덟 박 리듬이 출발 신호로 재등장하고, 언제든 "바로 출발"로 건너뛸 수 있다.
 * 리듬이 없으면 브릿지 없이 곧장 출발한다.
 */

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
  const rhythm = savedAfricaRhythm();
  // 들려줄 내 리듬이 없으면 브릿지 없이 곧장 출발한다 — 여기서 멈추면 여행 자체가 막힌다
  if (!rhythm) return Promise.resolve();
  return new Promise((resolve) => {
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
  });
}
