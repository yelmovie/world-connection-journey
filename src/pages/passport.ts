import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { buildTopBar } from '../ui/chrome';
import { showToast } from '../ui/toast';
import { CONTINENT_IDS } from '../types';
import { threeSlot } from '../ui/threeSlot';
import { createGuide, type GuideController } from '../ui/guide';

interface CommonContent {
  nickname?: { minLen: number; maxLen: number; banned: string[] };
  inquiryQuestions?: string[];
  stamps?: Array<{ id: string; label: string }>;
}

const FALLBACK_QUESTIONS = [
  '사람들은 어떻게 인사할까?',
  '학교생활은 무엇이 같고 다를까?',
  '자연과 문화를 어떻게 지킬까?'
];
const STAMP_LABELS: Record<string, string> = {
  asia: '아시아', europe: '유럽', africa: '아프리카',
  americas: '아메리카', oceania: '오세아니아', dialogue: '존중 대화'
};
const AVATAR_COLORS = ['#6C4CE8', '#2588E8', '#10C3C8', '#F26D6D', '#F2C14E', '#2EAD78'];
const PLANES = ['plane.main', 'plane.alt1', 'plane.alt2'];

export function createPage(): Page {
  let guide: GuideController | null = null;

  return {
    async mount(root: HTMLElement) {
      let common: CommonContent = {};
      try {
        common = await loadContent<CommonContent>('common');
      } catch {
        console.warn('[passport] common.json 없음 — 기본값 사용');
      }
      await preloadImages(['bg.title', 'prop.passport', ...PLANES]);

      const save = saveRepo.get();
      const profile = save.profile;
      const questions = common.inquiryQuestions ?? FALLBACK_QUESTIONS;
      const banned = common.nickname?.banned ?? [];
      const maxLen = common.nickname?.maxLen ?? 10;

      const page = document.createElement('div');
      page.className = 'page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.35), rgba(20,45,80,0.45)), url('${assetUrl('bg.title')}')`;

      const stampsHtml = [...CONTINENT_IDS, 'dialogue' as const]
        .map((id) => {
          const earned = save.stamps.includes(id);
          return `<div class="stamp ${earned ? 'is-earned' : 'is-empty'}" role="img"
            aria-label="${STAMP_LABELS[id]} ${earned ? '도장 획득' : '아직 도장 없음'}">${STAMP_LABELS[id]}</div>`;
        })
        .join('');

      const avatarsHtml = AVATAR_COLORS.map(
        (c, i) => `<button type="button" class="card-pick avatar-swatch" data-avatar="a${i + 1}"
          aria-label="아바타 색 ${i + 1}" style="width:56px;height:56px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:var(--shadow-card)"></button>`
      ).join('');

      const planesHtml = PLANES.filter(hasAsset).map(
        (id, i) => `<button type="button" class="card-pick plane-pick" data-plane="plane${i + 1}"
          aria-label="비행기 ${i + 1}" style="width:96px;padding:6px;background:rgba(255,255,255,0.85);border-radius:var(--radius-m);border:2px solid var(--c-line)">
          <img src="${assetUrl(id)}" alt="" style="width:100%"></button>`
      ).join('') || `<p class="chip">비행기 이미지는 준비 중이에요</p>`;

      const questionsHtml = questions
        .map(
          (q, i) => `<label class="card" style="display:flex;gap:10px;align-items:center;cursor:pointer">
            <input type="radio" name="inquiry" value="q${i + 1}" ${(profile?.inquiryQuestionId ?? 'q1') === `q${i + 1}` ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--c-violet)">
            <span>${q}</span></label>`
        )
        .join('');

      page.appendChild(buildTopBar({ title: '나의 여행 여권', backTo: profile ? '#/map' : undefined }));
      const body = document.createElement('div');
      body.className = 'page-body';
      body.innerHTML = `
        <div class="panel" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-6);align-items:start;overflow-y:auto;max-height:100%">
          <section style="display:flex;flex-direction:column;gap:var(--sp-4)">
            <h2 style="color:var(--c-navy)">여행자 정보</h2>
            <label style="font-weight:700">별명
              <input id="nickname" type="text" maxlength="${maxLen}" autocomplete="off"
                placeholder="예: 씩씩한여행자"
                style="display:block;width:100%;margin-top:6px;padding:12px;font-size:var(--fs-body);border:2px solid var(--c-line);border-radius:var(--radius-s);min-height:var(--touch-min)">
            </label>
            <p id="nick-msg" class="chip" style="display:none"></p>
            <div>
              <p style="font-weight:700;margin-bottom:8px">아바타 색 고르기</p>
              <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap">${avatarsHtml}</div>
            </div>
            <div>
              <p style="font-weight:700;margin-bottom:8px">함께 갈 비행기</p>
              <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap">${planesHtml}</div>
            </div>
            <div>
              <p style="font-weight:700;margin-bottom:8px">이번 여행에서 알아보고 싶은 질문</p>
              <div style="display:flex;flex-direction:column;gap:var(--sp-2)">${questionsHtml}</div>
            </div>
          </section>
          <section style="display:flex;flex-direction:column;gap:var(--sp-4)">
            <h2 style="color:var(--c-navy)">여권 도장</h2>
            <div style="display:grid;grid-template-columns:repeat(3,auto);gap:var(--sp-4);justify-content:start">${stampsHtml}</div>
            ${hasAsset('prop.passport') ? `<img src="${assetUrl('prop.passport')}" alt="" aria-hidden="true" style="width:min(260px,60%);align-self:center" class="bob">` : ''}
            <div id="stamp-3d-slot" style="align-self:center"></div>
          </section>
        </div>`;
      page.appendChild(body);

      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      bottom.innerHTML = `
        <span class="chip">별명과 선택은 이 기기에만 저장돼요</span>
        <button class="btn btn-primary btn-big" data-act="save">${profile ? '여권 수정하기' : '여권 만들기'}</button>`;
      page.appendChild(bottom);

      // 선택 상태
      let avatarId = profile?.avatarId ?? 'a1';
      let airplaneId = profile?.airplaneId ?? 'plane1';
      const markSelected = (selector: string, dataKey: 'avatar' | 'plane', value: string) => {
        page.querySelectorAll<HTMLElement>(selector).forEach((el) => {
          el.classList.toggle('is-selected', el.dataset[dataKey] === value);
          el.setAttribute('aria-pressed', String(el.dataset[dataKey] === value));
        });
      };
      markSelected('.avatar-swatch', 'avatar', avatarId);
      markSelected('.plane-pick', 'plane', airplaneId);
      page.querySelectorAll<HTMLElement>('.avatar-swatch').forEach((el) =>
        el.addEventListener('click', () => {
          void audio.playSfx('tap');
          avatarId = el.dataset.avatar ?? 'a1';
          markSelected('.avatar-swatch', 'avatar', avatarId);
        })
      );
      page.querySelectorAll<HTMLElement>('.plane-pick').forEach((el) =>
        el.addEventListener('click', () => {
          void audio.playSfx('tap');
          airplaneId = el.dataset.plane ?? 'plane1';
          markSelected('.plane-pick', 'plane', airplaneId);
        })
      );

      // Three.js 예약 슬롯 — 지금은 2.5D 도장 이미지, GLB 준비 시 교체
      const slotWrap = page.querySelector('#stamp-3d-slot');
      if (slotWrap) slotWrap.appendChild(threeSlot({ slotId: 'passport-stamp', assetId: 'prop.stamp', label: '나의 여행 도장', width: 'min(160px,30vw)' }));

      const input = page.querySelector<HTMLInputElement>('#nickname');
      const msg = page.querySelector<HTMLElement>('#nick-msg');
      if (input) input.value = profile?.nickname ?? '';
      const validate = (): string | null => {
        const v = (input?.value ?? '').trim();
        if (v.length < 1) return '별명을 1자 이상 적어 주세요.';
        if (v.length > maxLen) return `별명은 ${maxLen}자까지예요.`;
        if (banned.some((w) => w && v.includes(w))) return '이 별명은 쓸 수 없어요. 다른 별명을 골라 볼까요?';
        return null;
      };

      bottom.querySelector('[data-act="save"]')?.addEventListener('click', () => {
        const error = validate();
        if (error) {
          if (msg) {
            msg.textContent = error;
            msg.style.display = 'inline-flex';
          }
          input?.focus();
          return;
        }
        const inquiry = page.querySelector<HTMLInputElement>('input[name="inquiry"]:checked')?.value ?? 'q1';
        saveRepo.update((s) => {
          s.profile = {
            nickname: (input?.value ?? '').trim(),
            createdAt: s.profile?.createdAt ?? new Date().toISOString(),
            avatarId,
            airplaneId,
            inquiryQuestionId: inquiry
          };
        });
        void audio.playSfx('stamp');
        showToast('여권이 준비됐어요! 세계 지도로 떠나요.', 'success');
        navigate('#/map');
      });

      // 마스코트 가이드 — 별명 → 아바타·비행기 → 질문 선택 후 저장 버튼 순으로 안내
      guide = createGuide({});
      page.appendChild(guide.el);
      let guideStep = 0;
      guide.say('별명을 먼저 지어 볼까요?', { cue: input });
      input?.addEventListener('input', () => {
        if (guideStep === 0 && input.value.trim().length > 0) {
          guideStep = 1;
          guide?.say('아바타랑 비행기도 골라 봐요!', { cue: null });
        }
      });
      page.querySelectorAll<HTMLInputElement>('input[name="inquiry"]').forEach((radio) =>
        radio.addEventListener('change', () => {
          guideStep = 2;
          guide?.say('다 골랐으면 아래 버튼을 눌러요!', {
            cue: bottom.querySelector<HTMLElement>('[data-act="save"]')
          });
        })
      );

      root.appendChild(page);
    },
    unmount() {
      guide?.dispose();
      guide = null;
    }
  };
}
