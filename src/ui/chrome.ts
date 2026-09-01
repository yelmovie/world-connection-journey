import { audio } from '../core/AudioManager';
import { assetUrl, hasAsset } from '../core/assets';
import { matchesTeacherPassword, saveRepo } from '../core/SaveRepository';
import { navigate } from '../router';
import { confirmDialog, openModal } from './modal';
import { showToast } from './toast';
import { airplaneChoice } from './airplaneFleet';
import { avatarChoice } from './avatarRoster';

let teacherSessionAuthenticated = false;

const SOURCE_DOCS: Array<[string, string]> = [
  ['asia', '아시아'], ['europe', '유럽'], ['africa', '아프리카'],
  ['americas', '아메리카'], ['oceania', '오세아니아'],
  ['environment', '지구 회의'], ['dialogue', '존스 대화']
];

/**
 * 콘텐츠 JSON 어디에 있든 url + 제목 쌍을 모은다.
 * 미션 화면에서는 출처를 숨기고 설정 한 곳에서만 보여 주기 때문에,
 * 파일 구조가 바뀌어도 빠지는 출처가 없도록 통째로 훑는다.
 */
function collectSources(node: unknown, out: Map<string, string>): void {
  if (Array.isArray(node)) { node.forEach((item) => collectSources(item, out)); return; }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  const url = typeof record.url === 'string' ? record.url
    : typeof record.sourceUrl === 'string' ? record.sourceUrl : null;
  const title = typeof record.title === 'string' ? record.title
    : typeof record.sourceTitle === 'string' ? record.sourceTitle : null;
  if (url && /^https?:\/\//.test(url) && !out.has(url)) out.set(url, title ?? url);
  Object.values(record).forEach((value) => collectSources(value, out));
}

async function fillSourceList(host: HTMLElement | null): Promise<void> {
  if (!host) return;
  const { loadContent } = await import('../core/ContentRepository');
  const blocks: string[] = [];
  for (const [name, label] of SOURCE_DOCS) {
    try {
      const found = new Map<string, string>();
      collectSources(await loadContent<unknown>(name), found);
      if (found.size === 0) continue;
      const items = [...found].map(([url, title]) =>
        `<li><a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeText(title)}</a></li>`).join('');
      blocks.push(`<p class="settings-copy"><strong>${escapeText(label)}</strong></p><ul class="settings-list">${items}</ul>`);
    } catch {
      blocks.push(`<p class="settings-copy">${escapeText(label)} 자료를 불러오지 못했어요.</p>`);
    }
  }
  host.innerHTML = blocks.join('') || '<p class="settings-copy">표시할 출처가 없어요.</p>';
}

const escapeText = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
const escapeAttr = escapeText;

/** 설정 모달 — 모든 페이지 공용 */
export function openSettings(): void {
  const s = saveRepo.get().settings;
  const certificateIssued = saveRepo.get().completion.certificateIssued;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="settings-stack">
      ${toggleRow('set-bgm', '배경 음악', s.bgm)}
      ${toggleRow('set-sfx', '효과음', s.sfx)}
      <label class="settings-row">
        <span>전체 소리 크기</span>
        <input type="range" id="set-volume" min="0" max="100" step="1" value="${Math.round((s.volume ?? 0.8) * 100)}"
          aria-label="전체 소리 크기" class="settings-range">
      </label>
      ${certificateIssued ? `
      <button type="button" id="set-certificate" class="btn btn-ghost settings-full">
        수료증 다시 보기
      </button>` : ''}
      <button type="button" id="set-prologue" class="btn btn-ghost settings-full">
        이 여행을 하는 이유 다시 보기
      </button>
      <details class="settings-card">
        <summary>앱 정보 · 배움과 보상</summary>
        <ul class="settings-list">
          <li><strong>여행 목적</strong> 서로 다른 문화의 목소리와 자료를 확인하고, 함께 지킬 약속을 근거로 결정하는 연습을 해요.</li>
          <li><strong>미션 보상</strong> 지역 도장, 배움 카드, 지구본 조각을 모아 마지막 세계 연결 회의와 수료증을 열어요.</li>
          <li><strong>남는 배움</strong> 처음 생각·확인한 근거·수정한 판단·새 상황에서 할 행동이 여행 기록으로 남아요.</li>
        </ul>
        <p class="settings-copy"><strong>세계를 잇는 여행</strong> v0.1.4 · 기획·제작: 옐샘 &amp; 아이스크림미디어</p>
      </details>
      <details class="settings-card">
        <summary>학생용 가이드</summary>
        <ol class="settings-list">
          <li>여권을 만들고 세계 지도에서 대륙을 골라요.</li>
          <li>그림을 누르고, 비교하고, 내 생각의 근거를 남겨요.</li>
          <li>완료한 여행은 도장으로 표시되고 이 기기에 자동 저장돼요.</li>
          <li>미션에 나오는 사진과 이야기는 그 나라의 한 장면이에요. 한 장면이 나라 전체나 그곳 사람들 모두를 대표하지는 않아요.</li>
        </ol>
      </details>
      <details class="settings-card">
        <summary>교사용 가이드</summary>
        <ul class="settings-list">
          <li>전자칠판에서는 한 단계씩 함께 읽고 학생의 선택 근거를 먼저 물어봐 주세요.</li>
          <li>서로 다른 답은 오답으로 끝내지 말고 자료·관점 비교 토론으로 연결해 주세요.</li>
          <li>별명과 활동 기록은 서버로 전송하지 않고 현재 브라우저에만 저장돼요.</li>
        </ul>
        <details class="settings-section">
          <summary>성취기준</summary>
          <p class="settings-copy">2022 개정 사회과 교육과정과 연계한 탐구 보조 활동이에요. 이 게임만으로 성취기준 전체를 달성했다고 판단하지 않으며, 수업·토론·후속 평가와 함께 활용해 주세요.</p>
          <ul class="settings-list">
            <li><strong>[6사09-01]</strong> 세계를 표현하는 다양한 공간 자료의 특징을 이해하고, 지구본과 세계지도에서 위치를 표현하는 방법을 익힌다.</li>
            <li><strong>[6사09-02]</strong> 세계 주요 대륙과 대양을 파악하고, 우리나라 및 세계 여러 국가의 위치와 영토의 특징을 이해한다.</li>
            <li><strong>[6사10-01]</strong> 세계의 여러 지역의 지형 경관을 살펴보고, 이를 통해 다양한 삶의 모습을 이해한다.</li>
            <li><strong>[6사10-02]</strong> 세계의 다양한 기후를 알아보고 기후 환경과 인간 생활 간의 관계를 탐구한다.</li>
            <li><strong>[6사12-02]</strong> 지구촌을 위협하는 다양한 문제들을 파악하고, 지속 가능한 미래를 위한 해결 방안을 탐색한다.</li>
          </ul>
        </details>
        <details id="teacher-tools" class="settings-section">
          <summary>교사용 도구</summary>
        <div id="teacher-auth-panel" ${teacherSessionAuthenticated ? 'hidden' : ''}>
          <p class="settings-copy">학생의 진행 상태를 바꾸는 수업 시연 기능이에요. 교사용 확인 코드를 입력해 주세요.</p>
          <form id="teacher-auth-form" class="settings-form" novalidate>
            <label for="teacher-password" class="settings-label">교사용 확인 코드</label>
            <div class="settings-field-row">
              <input id="teacher-password" name="teacher-password" type="password" autocomplete="off" autocapitalize="none" spellcheck="false"
                aria-describedby="teacher-password-help teacher-password-error" class="settings-input">
              <button class="btn btn-primary" type="submit">교사용 도구 열기</button>
            </div>
            <p id="teacher-password-help" class="settings-help">확인 코드는 저장되지 않으며 현재 화면에서만 검사해요. 계정이나 개인정보를 보호하는 보안 비밀번호는 아니에요.</p>
            <p id="teacher-password-error" role="alert" aria-live="assertive" class="settings-error" hidden></p>
          </form>
        </div>
        <div id="teacher-actions" ${teacherSessionAuthenticated ? '' : 'hidden'}>
          <p id="teacher-state" class="chip settings-state">${saveRepo.isTeacherUnlocked() ? '해금 적용됨 · 마지막 단계와 완주 화면까지 바로 열려 있어요.' : '학생 진행 순서가 적용 중이에요.'}</p>
          <div class="settings-actions">
            <button class="btn btn-ghost" id="btn-unlock-all" type="button">${saveRepo.isTeacherUnlocked() ? '교사용 해금 해제' : '모든 지역·마지막 단계 열기'}</button>
            <button class="btn btn-primary" id="btn-complete-all" type="button">모든 미션 완료 처리</button>
          </div>
          <p class="settings-copy">교사용 해금은 기록을 보존한 채 모든 지역, 마지막 단계, 완주 화면으로 가는 길을 열어요. 지도에서 교사용 해금 표시와 마지막 단계 자동 선택을 확인할 수 있어요.</p>
          </div>
        </details>
      </details>
      <details class="settings-card">
        <summary>이미지·소리·저작권 고지</summary>
        <ul class="settings-list">
          <li>캐릭터·배경·장식은 프로젝트 자체 AI 생성 이미지예요.</li>
          <li>미션에 나오는 장면 그림은 실제 현장 사진이 아닌 학습용 재현 이미지예요. 사람·배치·날씨는 사실 근거로 쓰지 않아요.</li>
          <li>프라하 사진은 Unsplash, 아프리카 악기 사진은 Wikimedia Commons의 재사용 가능 자료를 라이선스에 맞게 사용했어요.</li>
          <li>배경 음악 6곡은 프로젝트 자체 AI 생성 음원이에요.</li>
          <li>효과음은 Pixabay Content License에 따라 사용·가공했어요.</li>
          <li>출처와 라이선스 상세 내용은 프로젝트의 <code>assets/CREDITS.md</code>에서 확인할 수 있어요.</li>
        </ul>
        <details class="settings-section">
          <summary>자료 출처 모아 보기</summary>
          <p class="settings-copy">미션 화면에는 출처를 표시하지 않고 이곳에 모아 두었어요.</p>
          <div id="settings-sources" class="settings-list">불러오는 중이에요…</div>
        </details>
        <p class="settings-copyright">ⓒ 2026 옐샘 &amp; 아이스크림미디어. All rights reserved.</p>
        <p class="settings-copy">앱 화면 캡처·자체 제작 일러스트·자체 제작 음원은 무단 복제·재배포·전용·상업적 이용을 금지해요.</p>
        <p class="settings-copy">외부 공개 사진·효과음·폰트의 저작권은 각 원저작자와 소장 기관에 있으며, 각 자료의 공개 라이선스와 이용 조건을 따라요.</p>
        <p class="settings-copy">교육 내용 구성 참고: 교육부 2022 개정 사회과 교육과정(moe.go.kr), UNESCO 문화다양성 자료(unesco.org), UN 지속가능발전목표(sdgs.un.org).</p>
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
            '별명, 미션 진행, 도장, 활동 기록이 이 기기에서 모두 지워져요.',
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
  void fillSourceList(body.querySelector<HTMLElement>('#settings-sources'));
  const teacherPassword = body.querySelector<HTMLInputElement>('#teacher-password');
  const teacherError = body.querySelector<HTMLElement>('#teacher-password-error');
  const teacherAuthPanel = body.querySelector<HTMLElement>('#teacher-auth-panel');
  const teacherActions = body.querySelector<HTMLElement>('#teacher-actions');
  const showTeacherPasswordError = (message: string) => {
    if (!teacherPassword || !teacherError) return;
    teacherPassword.setAttribute('aria-invalid', message ? 'true' : 'false');
    teacherError.textContent = message;
    teacherError.hidden = message.length === 0;
  };
  const requireTeacherSession = (): boolean => {
    if (teacherSessionAuthenticated) return true;
    showTeacherPasswordError('교사용 기능을 사용하려면 비밀번호를 먼저 확인해 주세요.');
    teacherAuthPanel?.removeAttribute('hidden');
    teacherPassword?.focus();
    return false;
  };
  body.querySelector<HTMLFormElement>('#teacher-auth-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!teacherPassword || !matchesTeacherPassword(teacherPassword.value)) {
      showTeacherPasswordError('비밀번호가 맞지 않아요. 입력 내용을 다시 확인해 주세요.');
      teacherPassword?.select();
      return;
    }
    teacherSessionAuthenticated = true;
    teacherPassword.value = '';
    showTeacherPasswordError('');
    teacherAuthPanel?.setAttribute('hidden', '');
    teacherActions?.removeAttribute('hidden');
    teacherActions?.querySelector<HTMLElement>('button')?.focus();
    showToast('교사용 도구를 열었어요. 비밀번호는 저장하지 않았어요.', 'success');
  });
  body.querySelector('#btn-unlock-all')?.addEventListener('click', () => {
    if (!requireTeacherSession()) return;
    closeSettings();
    if (saveRepo.isTeacherUnlocked()) {
      queueMicrotask(() => confirmDialog(
        '순서대로 다시 잠글까요?',
        '학생이 아직 완료하지 않은 대화·완료 화면만 원래 순서대로 잠겨요. 학생 기록은 그대로 남아요.',
        '순서 잠금 복원',
        () => {
          saveRepo.restoreProgressionAfterTeacherUnlock();
          showToast('학생 진행 순서로 돌아왔어요.', 'success');
          navigate('#/map');
        }
      ));
      return;
    }
    queueMicrotask(() => confirmDialog(
      '모든 단계를 열까요?',
      '다섯 대륙을 끝내지 않아도 마지막 단계와 완주 화면까지 바로 갈 수 있어요. 적용 뒤 지도에서 마지막 단계가 자동으로 선택돼요. 학생 기록은 그대로 남아요.',
      '전체 해금',
      () => {
        saveRepo.unlockAllForTeacher();
        showToast('교사용 전체 해금을 적용했어요. 마지막 단계가 지도에 열렸어요.', 'success');
        navigate('#/map');
      }
    ));
  });
  body.querySelector('#btn-complete-all')?.addEventListener('click', () => {
    if (!requireTeacherSession()) return;
    closeSettings();
    queueMicrotask(() => confirmDialog(
      '모든 미션을 완료 상태로 바꿀까요?',
      '수업 시연을 위해 도장 6개와 완료 화면을 열어요. 기존 활동 기록은 보존하지만, 완료 처리는 자동으로 되돌릴 수 없어요.',
      '모든 미션 완료',
      () => {
        saveRepo.completeAllForTeacher();
        showToast('모든 미션을 완료하고 도장 6개를 열었어요.', 'success');
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
  body.querySelector('#set-prologue')?.addEventListener('click', () => {
    closeSettings();
    void import('../pages/title').then(({ showPrologue }) => showPrologue(() => undefined, '여행으로 돌아가기'));
  });
  body.querySelector('#set-bgm')?.addEventListener('change', (e) => {
    audio.setSettings((e.target as HTMLInputElement).checked, saveRepo.get().settings.sfx);
  });
  body.querySelector('#set-sfx')?.addEventListener('change', (e) => {
    audio.setSettings(saveRepo.get().settings.bgm, (e.target as HTMLInputElement).checked);
  });
}

function toggleRow(id: string, label: string, checked: boolean): string {
  return `
    <label class="settings-row">
      <span>${label}</span>
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} class="settings-toggle">
    </label>`;
}

/* 상단바 아이콘 — 이모지 대신 SVG (OS별 글리프 차이·미지원 네모 방지) */
const GEAR_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm9.3 4c0-.6-.1-1.2-.2-1.8l2-1.5-2-3.4-2.3 1a7.6 7.6 0 00-3.1-1.8L15.3 2h-3.9l-.4 2.5c-1.1.3-2.2.9-3.1 1.8l-2.3-1-2 3.4 2 1.5a7.7 7.7 0 000 3.6l-2 1.5 2 3.4 2.3-1c.9.9 2 1.5 3.1 1.8l.4 2.5h3.9l.4-2.5c1.1-.3 2.2-.9 3.1-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8z"/></svg>`;
const SOUND_ON_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 2.2v2.1a7.8 7.8 0 010 15.4v2.1a9.9 9.9 0 000-19.6z"/></svg>`;
const SOUND_OFF_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm15.5 3l2.3-2.3-1.4-1.4L18 10.6l-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.4 2.3 1.4-1.4z"/></svg>`;
const BACK_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
const HOME_SVG = `<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`;
const MAP_SVG = `<svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 6 5-2 8 2 5-2v14l-5 2-8-2-5 2z"/><path d="M8 4v14M16 6v14"/><path d="m10.5 10 1.5-1.5 1.5 1.5-1.5 2z"/></svg>`;

function soundIconSvg(): string {
  const s = saveRepo.get().settings;
  return s.bgm || s.sfx ? SOUND_ON_SVG : SOUND_OFF_SVG;
}

/** 모든 페이지 공통 상단 바: 왼쪽 뒤로·홈, 오른쪽 소리·설정 */
export function buildTopBar(opts: { title: string; subtitle?: string; backTo?: string; showPassport?: boolean; steps?: { total: number; done: number; now: number } }): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'top-bar';
  const save = saveRepo.get();
  const currentRoute = window.location.hash || '#/';
  const isHome = currentRoute === '#/';
  const isMap = currentRoute === '#/map';
  const selectedPlane = airplaneChoice(save.profile?.airplaneId);
  const selectedAvatar = avatarChoice(save.profile?.avatarId);
  const ticket = save.profile && opts.showPassport
    ? `<button type="button" class="journey-ticket" data-act="passport"
        data-selected-avatar="${escapeHtml(selectedAvatar.saveId)}" data-selected-airplane="${escapeHtml(selectedPlane.saveId)}"
        title="${escapeHtml(selectedAvatar.name)}와 ${escapeHtml(selectedPlane.name)}의 여행 여권"
        aria-label="${escapeHtml(save.profile.nickname)}의 여권 보기. 탐험가 ${escapeHtml(selectedAvatar.name)}, 비행기 ${escapeHtml(selectedPlane.name)}, 도장 ${save.stamps.length}개">
        <span class="journey-ticket__crew" aria-hidden="true">
          ${hasAsset(selectedAvatar.assetId) ? `<img class="journey-ticket__avatar" src="${assetUrl(selectedAvatar.assetId)}" data-asset-id="${selectedAvatar.assetId}" alt="">` : ''}
          ${hasAsset(selectedPlane.assetId) ? `<img class="journey-ticket__plane" src="${assetUrl(selectedPlane.assetId)}" data-asset-id="${selectedPlane.assetId}" alt="">` : ''}
        </span>
        <span class="journey-ticket__name">${escapeHtml(save.profile.nickname)}</span>
        <span class="journey-ticket__meta">${escapeHtml(selectedAvatar.name)} · ${escapeHtml(selectedPlane.name)} · 도장 ${save.stamps.length}개</span>
      </button>`
    : '';
  const backAria = isHome
    ? '이전 화면 없음'
    : opts.backTo === '#/' ? '처음 화면으로 돌아가기' : '이전 화면으로 돌아가기';
  const dots = opts.steps
    ? `<div class="step-dots chip" role="img" aria-label="진행 ${opts.steps.done}/${opts.steps.total} 단계">
        ${Array.from({ length: opts.steps.total }, (_, i) =>
          `<span class="step-dot ${i < opts.steps!.done ? 'is-done' : i === opts.steps!.now ? 'is-now' : ''}"></span>`).join('')}
      </div>`
    : '';
  bar.innerHTML = `
    <nav class="top-bar-nav" aria-label="화면 이동">
      <button class="btn btn-ghost btn-icon" data-act="back" aria-label="${backAria}" ${isHome ? 'disabled aria-disabled="true"' : ''}>${BACK_SVG}</button>
      <button class="btn btn-ghost btn-icon" data-act="home" aria-label="홈으로 가기" ${isHome ? 'disabled aria-disabled="true"' : ''}>${HOME_SVG}</button>
      <button class="btn btn-ghost btn-icon" data-act="map" aria-label="지도 선택 화면으로 가기" title="지도 선택" ${isMap ? 'disabled aria-disabled="true"' : ''}>${MAP_SVG}</button>
    </nav>
    ${ticket}
    <h1 class="top-bar-title quest-ribbon" ${opts.subtitle ? `aria-label="${escapeHtml(`${opts.title}. ${opts.subtitle}`)}"` : ''}>
      <span class="ribbon-main">${escapeHtml(opts.title)}</span>
      <span class="ribbon-sub visually-hidden">${escapeHtml(opts.subtitle ?? '')}</span>
    </h1>
    <div class="spacer"></div>
    ${dots}
    <div class="top-bar-actions" aria-label="소리와 설정">
      <button class="btn btn-ghost btn-icon" data-act="sound" aria-label="소리 켜기 끄기">${soundIconSvg()}</button>
      <button class="btn btn-ghost btn-icon" data-act="settings" aria-label="설정">${GEAR_SVG}</button>
    </div>`;
  bar.querySelector('[data-act="back"]')?.addEventListener('click', () => {
    if (!isHome) navigate(opts.backTo ?? '#/');
  });
  bar.querySelector('[data-act="home"]')?.addEventListener('click', () => {
    if (!isHome) navigate('#/');
  });
  bar.querySelector('[data-act="map"]')?.addEventListener('click', () => {
    if (!isMap) navigate('#/map');
  });
  bar.querySelector('[data-act="settings"]')?.addEventListener('click', () => openSettings());
  const soundBtn = bar.querySelector<HTMLElement>('[data-act="sound"]');
  soundBtn?.addEventListener('click', () => {
    const s = saveRepo.get().settings;
    const on = !(s.bgm || s.sfx); // 하나라도 켜져 있으면 전체 끄기, 다 꺼져 있으면 전체 켜기
    audio.setSettings(on, on);
    soundBtn.innerHTML = soundIconSvg();
    showToast(on ? '소리를 켰어요.' : '소리를 껐어요.', 'info', 1800);
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
    '#/mission/respect-dialogue': '하나의 지구, 여섯 개의 신호부터 이어하기',
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
