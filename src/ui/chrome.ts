import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { navigate } from '../router';
import { openModal } from './modal';

/** 설정 모달 — 모든 페이지 공용 */
export function openSettings(): void {
  const s = saveRepo.get().settings;
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4)">
      ${toggleRow('set-bgm', '배경 음악', s.bgm)}
      ${toggleRow('set-sfx', '효과음', s.sfx)}
      ${toggleRow('set-motion', '움직임 줄이기', s.reducedMotion)}
    </div>`;
  openModal({
    id: 'settings',
    title: '설정',
    bodyEl: body,
    actions: [{ label: '닫기', kind: 'primary', onClick: (close) => close(), autofocus: true }]
  });
  body.querySelector('#set-bgm')?.addEventListener('change', (e) => {
    audio.setSettings((e.target as HTMLInputElement).checked, saveRepo.get().settings.sfx);
  });
  body.querySelector('#set-sfx')?.addEventListener('change', (e) => {
    audio.setSettings(saveRepo.get().settings.bgm, (e.target as HTMLInputElement).checked);
  });
  body.querySelector('#set-motion')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    saveRepo.update((st) => {
      st.settings.reducedMotion = on;
    });
    document.documentElement.dataset.reducedMotion = String(on);
  });
}

function toggleRow(id: string, label: string, checked: boolean): string {
  return `
    <label style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-4);min-height:var(--touch-min);cursor:pointer">
      <span style="font-weight:700">${label}</span>
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:28px;height:28px;accent-color:var(--c-violet)">
    </label>`;
}

/** 미션 공통 상단 바: 지도로 버튼 + 제목 + 진행 점 + 설정 */
export function buildTopBar(opts: { title: string; subtitle?: string; backTo?: string; steps?: { total: number; done: number; now: number } }): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'top-bar';
  const back = opts.backTo
    ? `<button class="btn btn-ghost" data-act="back" aria-label="지도로 돌아가기">← 지도</button>`
    : '';
  const dots = opts.steps
    ? `<div class="step-dots chip" role="img" aria-label="진행 ${opts.steps.done}/${opts.steps.total} 단계">
        ${Array.from({ length: opts.steps.total }, (_, i) =>
          `<span class="step-dot ${i < opts.steps!.done ? 'is-done' : i === opts.steps!.now ? 'is-now' : ''}"></span>`).join('')}
      </div>`
    : '';
  bar.innerHTML = `
    ${back}
    <div class="top-bar-title">
      <span>${opts.title}</span>
      ${opts.subtitle ? `<span class="chip">${opts.subtitle}</span>` : ''}
    </div>
    <div class="spacer"></div>
    ${dots}
    <button class="btn btn-ghost btn-icon" data-act="settings" aria-label="설정">⚙</button>`;
  bar.querySelector('[data-act="back"]')?.addEventListener('click', () => navigate(opts.backTo ?? '#/map'));
  bar.querySelector('[data-act="settings"]')?.addEventListener('click', () => openSettings());
  return bar;
}

/** 진행 점 갱신 */
export function updateSteps(bar: HTMLElement, total: number, done: number, now: number): void {
  const wrap = bar.querySelector('.step-dots');
  if (!wrap) return;
  wrap.setAttribute('aria-label', `진행 ${done}/${total} 단계`);
  wrap.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.className = `step-dot ${i < done ? 'is-done' : i === now ? 'is-now' : ''}`.trim();
  });
}
