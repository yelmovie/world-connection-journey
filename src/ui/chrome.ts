import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { navigate } from '../router';
import { confirmDialog, openModal } from './modal';
import { showToast } from './toast';

/** 설정 모달 — 모든 페이지 공용 */
export function openSettings(): void {
  const s = saveRepo.get().settings;
  const certificateIssued = saveRepo.get().completion.certificateIssued;
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--sp-4);width:100%">
      ${toggleRow('set-bgm', '배경 음악', s.bgm)}
      ${toggleRow('set-sfx', '효과음', s.sfx)}
      <label style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-4);min-height:var(--touch-min);cursor:pointer">
        <span style="font-weight:700">전체 소리 크기</span>
        <input type="range" id="set-volume" min="0" max="100" step="1" value="${Math.round((s.volume ?? 0.8) * 100)}"
          aria-label="전체 소리 크기" style="width:180px;accent-color:var(--c-violet)">
      </label>
      ${toggleRow('set-motion', '움직임 줄이기', s.reducedMotion)}
      ${certificateIssued ? `
      <button type="button" id="set-certificate" class="btn btn-ghost" style="align-self:stretch;min-height:var(--touch-min)">
        수료증 다시 보기
      </button>` : ''}
      <details class="card">
        <summary style="font-weight:800;cursor:pointer">학생용 여행 안내</summary>
        <p style="margin-top:var(--sp-2)">지도에서 원하는 대륙을 골라 자료를 관찰하고, 판단한 근거를 남겨 보세요. 드래그가 어렵다면 항목을 먼저 선택한 뒤 놓을 자리를 선택해도 돼요. 진행은 이 기기에 자동으로 저장돼요.</p>
      </details>
      <details class="card">
        <summary style="font-weight:800;cursor:pointer">교사용 수업 안내·성취기준</summary>
        <p style="margin-top:var(--sp-2)">[6사09-01]·[6사09-02]·[6사10-01]·[6사10-02]·[6사12-02] 탐구를 돕는 보조 활동이에요. 문화 사례는 수업 전에 JSON의 needsReview 표시와 맥락을 다시 확인해 주시고, 학생들의 서로 다른 근거를 토론으로 연결해 주세요.</p>
        <p style="margin-top:var(--sp-2)">게임 이후 확장 활동 아이디어 — ① 우리 반 친구들의 아침 루틴을 조사해 아시아 미션 자료와 비교하기 ② 우리 지역의 이동 수단·시간을 조사해 유럽 경로 미션 방식으로 답사 계획 세우기 ③ 우리 학교 주변 환경 문제 하나를 골라 오세아니아 미션의 4관점(주민·연구자·이용자·방문객)으로 인터뷰하기</p>
      </details>
      <details class="card">
        <summary style="font-weight:800;cursor:pointer">개인정보·정보·크레딧</summary>
        <p style="margin-top:var(--sp-2)">별명과 진행 기록은 서버로 보내지 않고 현재 브라우저에만 저장해요. 생성형 AI 이미지와 자체 제작 BGM을 사용했으며, 외부 효과음·폰트의 출처는 프로젝트 CREDITS에 기록되어 있어요.</p>
        <p style="margin-top:var(--sp-2)">교육 내용 근거: 교육부 2022 개정 사회과 교육과정(moe.go.kr). 앱 화면·자체 제작 이미지·BGM의 무단 복제·재배포·상업적 이용을 금지하며, 외부 에셋의 권리는 각 원저작자와 라이선스 조건을 따라요.</p>
        <p style="margin-top:var(--sp-2)">ⓒ 2026 세계를 잇는 여행 프로젝트 · 버전 0.1.0</p>
      </details>
    </div>`;
  const closeSettings = openModal({
    id: 'settings',
    title: '설정',
    bodyEl: body,
    actions: [
      {
        label: '여행 기록 초기화',
        kind: 'ghost',
        onClick: (close) => {
          close();
          queueMicrotask(() => confirmDialog(
            '여행 기록을 초기화할까요?',
            '별명, 미션 진행, 도장, 점수, 회고 기록이 이 기기에서 모두 지워져요.',
            '기록 지우기',
            () => {
              saveRepo.reset();
              showToast('이 기기의 여행 기록을 지웠어요.', 'success');
              navigate('#/');
            }
          ));
        }
      },
      { label: '닫기', kind: 'primary', onClick: (close) => close(), autofocus: true }
    ]
  });
  body.querySelector('#set-volume')?.addEventListener('input', (e) => {
    audio.setVolume(Number((e.target as HTMLInputElement).value) / 100);
  });
  body.querySelector('#set-certificate')?.addEventListener('click', () => {
    closeSettings();
    navigate('#/completion');
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
export function buildTopBar(opts: { title: string; subtitle?: string; backTo?: string; showPassport?: boolean; steps?: { total: number; done: number; now: number } }): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'top-bar';
  const backLabel = opts.backTo === '#/' ? '처음 화면' : '지도';
  const backAria = opts.backTo === '#/' ? '처음 화면으로 돌아가기' : '지도로 돌아가기';
  const back = opts.backTo
    ? `<button class="btn btn-ghost" data-act="back" aria-label="${backAria}">← ${backLabel}</button>`
    : '';
  const dots = opts.steps
    ? `<div class="step-dots chip" role="img" aria-label="진행 ${opts.steps.done}/${opts.steps.total} 단계">
        ${Array.from({ length: opts.steps.total }, (_, i) =>
          `<span class="step-dot ${i < opts.steps!.done ? 'is-done' : i === opts.steps!.now ? 'is-now' : ''}"></span>`).join('')}
      </div>`
    : '';
  bar.innerHTML = `
    ${back}
    <h1 class="top-bar-title">
      <span>${escapeHtml(opts.title)}</span>
      ${opts.subtitle ? `<span class="chip">${escapeHtml(opts.subtitle)}</span>` : ''}
    </h1>
    <div class="spacer"></div>
    ${dots}
    ${opts.showPassport ? '<button class="btn btn-ghost" data-act="passport">여권</button>' : ''}
    <button class="btn btn-ghost" data-act="settings">설정</button>`;
  bar.querySelector('[data-act="back"]')?.addEventListener('click', () => navigate(opts.backTo ?? '#/map'));
  bar.querySelector('[data-act="settings"]')?.addEventListener('click', () => openSettings());
  bar.querySelector('[data-act="passport"]')?.addEventListener('click', () => navigate('#/passport'));
  return bar;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char] ?? char);
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
