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
      <details class="card" id="teacher-tools">
        <summary style="font-weight:800;cursor:pointer">교사용 도구</summary>
        <p style="margin-top:var(--sp-2)">수업에서 특정 미션만 다루거나 시연할 때 모든 미션을 열 수 있어요. 학생이 이미 쌓은 점수·도장·기록은 지워지지 않아요.</p>
        <p id="teacher-state" class="chip" style="margin-top:var(--sp-2)">${saveRepo.isTeacherUnlocked() ? '지금은 전체 해금 상태예요.' : '지금은 순서대로 열리는 상태예요.'}</p>
        <button class="btn btn-ghost" id="btn-unlock-all" style="margin-top:var(--sp-3)" ${saveRepo.isTeacherUnlocked() ? 'disabled aria-disabled="true"' : ''}>전체 미션 해금</button>
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
  body.querySelector('#btn-unlock-all')?.addEventListener('click', () => {
    closeSettings();
    queueMicrotask(() => confirmDialog(
      '모든 미션을 열까요?',
      '다섯 대륙을 끝내지 않아도 대화 미션과 인증 화면까지 바로 갈 수 있어요. 수업 시연이나 한 미션만 다루는 차시에 쓰세요. 학생 기록은 그대로 남아요.',
      '전체 해금',
      () => {
        saveRepo.unlockAllForTeacher();
        showToast('모든 미션을 열었어요. 지도에서 바로 고를 수 있어요.', 'success');
        navigate('#/map');
      }
    ));
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

/* 상단바 아이콘 — 이모지 대신 SVG (OS별 글리프 차이·미지원 네모 방지) */
const GEAR_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.3 4c0-.6-.1-1.2-.2-1.8l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-3.1-1.8L15.3 2h-3.9l-.4 2.5c-1.1.3-2.2.9-3.1 1.8l-2.3-1-2 3.4 2 1.5a7.7 7.7 0 000 3.6l-2 1.5 2 3.4 2.3-1c.9.9 2 1.5 3.1 1.8l.4 2.5h3.9l.4-2.5c1.1-.3 2.2-.9 3.1-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8z"/></svg>`;
const SOUND_ON_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 2.2v2.1a7.8 7.8 0 010 15.4v2.1a9.9 9.9 0 000-19.6z"/></svg>`;
const SOUND_OFF_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm15.5 3l2.3-2.3-1.4-1.4L18 10.6l-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.4 2.3 1.4-1.4z"/></svg>`;

function soundIconSvg(): string {
  const s = saveRepo.get().settings;
  return s.bgm || s.sfx ? SOUND_ON_SVG : SOUND_OFF_SVG;
}

/** 미션 공통 상단 바: 지도로 버튼 + 제목 + 진행 점 + 소리·설정 아이콘 */
export function buildTopBar(opts: { title: string; subtitle?: string; backTo?: string; showPassport?: boolean; steps?: { total: number; done: number; now: number } }): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'top-bar';
  const save = saveRepo.get();
  const ticket = save.profile
    ? `<div class="journey-ticket" aria-label="${escapeHtml(save.profile.nickname)}의 여행, 도장 ${save.stamps.length}/6개">
        <span class="journey-ticket__icon" aria-hidden="true">TRIP</span>
        <span>${escapeHtml(save.profile.nickname)}</span>
        <span class="journey-ticket__meta">도장 ${save.stamps.length}/6</span>
      </div>`
    : '';
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
    ${ticket}
    <h1 class="top-bar-title quest-ribbon">
      <span class="ribbon-main">${escapeHtml(opts.title)}</span>
      ${opts.subtitle ? `<span class="ribbon-sub">${escapeHtml(opts.subtitle)}</span>` : ''}
    </h1>
    <div class="spacer"></div>
    ${dots}
    ${opts.showPassport ? '<button class="btn btn-ghost" data-act="passport">여권</button>' : ''}
    <button class="btn btn-ghost btn-icon" data-act="sound" aria-label="소리 켜기 끄기">${soundIconSvg()}</button>
    <button class="btn btn-ghost btn-icon" data-act="settings" aria-label="설정">${GEAR_SVG}</button>`;
  bar.querySelector('[data-act="back"]')?.addEventListener('click', () => navigate(opts.backTo ?? '#/map'));
  bar.querySelector('[data-act="settings"]')?.addEventListener('click', () => openSettings());
  const soundBtn = bar.querySelector<HTMLElement>('[data-act="sound"]');
  soundBtn?.addEventListener('click', () => {
    const s = saveRepo.get().settings;
    const on = !(s.bgm || s.sfx); // 하나라도 켜져 있으면 전체 끄기, 다 꺼져 있으면 전체 켜기
    audio.setSettings(on, on);
    soundBtn.innerHTML = soundIconSvg();
    showToast(on ? '소리를 켰어요.' : '소리를 껐어요. 그림으로 계속할 수 있어요.', 'info', 1800);
  });
  bar.querySelector('[data-act="passport"]')?.addEventListener('click', () => navigate('#/passport'));
  return bar;
}

/** 이어하기 버튼에서 저장 위치를 학생에게 말로 보여 준다. 저장 구조는 바꾸지 않는다. */
export function describeSavedRoute(route: string): string {
  const routeLabels: Record<string, string> = {
    '#/map': '세계 지도부터 이어하기',
    '#/passport': '여권 꾸미기부터 이어하기',
    '#/mission/asia': '아시아 여행부터 이어하기',
    '#/mission/europe': '유럽 여행부터 이어하기',
    '#/mission/africa': '아프리카 여행부터 이어하기',
    '#/mission/americas': '아메리카 여행부터 이어하기',
    '#/mission/oceania': '오세아니아 여행부터 이어하기',
    '#/mission/respect-dialogue': '존중 대화부터 이어하기',
    '#/completion': '완주 기록부터 이어하기'
  };
  return routeLabels[route] ?? '세계 지도부터 이어하기';
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
