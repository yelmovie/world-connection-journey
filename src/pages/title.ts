import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { confirmDialog } from '../ui/modal';
import { openSettings } from '../ui/chrome';

export function createPage(): Page {
  return {
    async mount(root: HTMLElement) {
      await preloadImages(['bg.title', 'title.logo', 'plane.main']);
      audio.playBgm('main');

      const hasSave = saveRepo.hasValidSave();
      const page = document.createElement('div');
      page.className = 'page title-page';
      page.style.backgroundImage = `linear-gradient(rgba(20,45,80,0.08), rgba(20,45,80,0.25)), url('${assetUrl('bg.title')}')`;
      page.innerHTML = `
        <div class="page-body" style="align-items:center;justify-content:center;gap:var(--sp-5);text-align:center">
          <img class="title-logo" src="${assetUrl('title.logo')}" alt="세계를 잇는 여행"
               style="width:min(680px,72vw);filter:drop-shadow(0 8px 24px rgba(10,25,45,0.4))">
          ${hasAsset('plane.main') ? `<img class="bob" src="${assetUrl('plane.main')}" alt="" aria-hidden="true" style="width:clamp(120px,16vw,220px);margin-top:calc(-1 * var(--sp-5))">` : ''}
          <p class="chip" style="font-size:var(--fs-body)">세계 여러 지역의 생활을 조사하고, 존중하는 대화를 배워요</p>
          <div style="display:flex;gap:var(--sp-4);flex-wrap:wrap;justify-content:center">
            <button class="btn btn-primary btn-big" data-act="new">새 여행 시작</button>
            <button class="btn btn-big" data-act="continue" ${hasSave ? '' : 'disabled aria-disabled="true" title="저장된 여행이 없어요"'}>이어하기</button>
            <button class="btn btn-ghost btn-big" data-act="settings">설정</button>
          </div>
          <p style="color:rgba(255,255,255,0.9);font-size:var(--fs-small);text-shadow:0 1px 4px rgba(0,0,0,0.4)">
            초등학교 6학년 사회 · 지구촌 사람들 | 소리 없이도 플레이할 수 있어요
          </p>
        </div>`;

      page.querySelector('[data-act="new"]')?.addEventListener('click', () => {
        void audio.playSfx('tap');
        if (hasSave) {
          confirmDialog(
            '새 여행을 시작할까요?',
            '지금 시작하면 이전 여행 기록(도장, 점수)이 지워져요. 정말 새로 시작할까요?',
            '새로 시작',
            () => {
              saveRepo.reset();
              navigate('#/passport');
            }
          );
        } else {
          navigate('#/passport');
        }
      });
      page.querySelector('[data-act="continue"]')?.addEventListener('click', () => {
        void audio.playSfx('tap');
        const last = saveRepo.get().lastRoute;
        navigate(last && last !== '#/' ? last : '#/map');
      });
      page.querySelector('[data-act="settings"]')?.addEventListener('click', () => openSettings());

      root.appendChild(page);
    },
    unmount() {
      /* DOM은 라우터가 정리, BGM은 다음 장면에서 crossfade */
    }
  };
}
