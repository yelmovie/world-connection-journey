import { bus } from './core/EventBus';
import { saveRepo, recomputeUnlocks } from './core/SaveRepository';
import { audio } from './core/AudioManager';
import { clearToasts } from './ui/toast';
import { closeActiveModal } from './ui/modal';

export interface Page {
  mount(root: HTMLElement): void | Promise<void>;
  unmount(): void | Promise<void>;
}

type PageModule = { createPage: () => Page };
type PageLoader = () => Promise<PageModule>;

const routes: Record<string, PageLoader> = {
  '#/': () => import('./pages/title'),
  '#/map': () => import('./pages/map'),
  '#/passport': () => import('./pages/passport'),
  '#/mission/asia': () => import('./pages/missionAsia'),
  '#/mission/europe': () => import('./pages/missionEurope'),
  '#/mission/africa': () => import('./pages/missionAfrica'),
  '#/mission/americas': () => import('./pages/missionAmericas'),
  '#/mission/oceania': () => import('./pages/missionOceania'),
  '#/mission/respect-dialogue': () => import('./pages/missionDialogue'),
  '#/completion': () => import('./pages/completion')
};

/** 접근 가드 — 저장값을 믿지 않고 매번 재계산한다. */
function guard(route: string): string {
  const save = saveRepo.get();
  recomputeUnlocks(save);
  const needsProfile = route.startsWith('#/mission/') || route === '#/map' || route === '#/completion';
  if (needsProfile && !save.profile) return '#/passport';
  if (route === '#/mission/respect-dialogue' && save.missions.dialogue.status === 'locked') return '#/map';
  if (route === '#/completion' && !save.completion.unlocked) return '#/map';
  return route;
}

class Router {
  private currentPage: Page | null = null;
  private isTransitioning = false;
  private lastNavAt = 0;

  private get root(): HTMLElement {
    return (document.getElementById('scene-root') ?? document.body) as HTMLElement;
  }

  start(): void {
    window.addEventListener('hashchange', () => void this.sync());
    bus.on('REQUEST_SCENE_CHANGE', ({ route }) => this.go(route));
    void this.sync();
  }

  go(route: string): void {
    const now = performance.now();
    if (this.isTransitioning || now - this.lastNavAt < 300) return; // 전환 가드 + 중복 클릭 방지
    this.lastNavAt = now;
    const target = guard(routes[route] ? route : '#/');
    if (location.hash === target) {
      void this.sync();
    } else {
      location.hash = target;
    }
  }

  private async sync(): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    const requested = location.hash || '#/';
    const route = guard(routes[requested] ? requested : '#/');
    if (route !== requested) {
      this.isTransitioning = false;
      location.hash = route;
      return;
    }
    try {
      closeActiveModal();
      if (this.currentPage) {
        await this.currentPage.unmount();
        this.currentPage = null;
      }
      clearToasts();
      this.root.replaceChildren();
      this.root.setAttribute('aria-busy', 'true');
      const loading = document.createElement('div');
      loading.className = 'loading-screen';
      loading.setAttribute('role', 'status');
      loading.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span><span>다음 목적지로 이동하고 있어요...</span>';
      this.root.appendChild(loading);
      this.root.className = `route-${route.replace(/[#/]+/g, '-').replace(/^-|-$/g, '') || 'title'}`;
      const loader = routes[route];
      if (!loader) throw new Error(`알 수 없는 경로: ${route}`);
      const mod = await loader();
      const page = mod.createPage();
      this.currentPage = page;
      await page.mount(this.root);
      loading.remove();
      if (route !== '#/') {
        saveRepo.update((s) => {
          s.lastRoute = route;
        });
      }
      bus.emit('SCENE_READY', { sceneId: route });
    } catch (err) {
      console.error('[Router] 페이지 로드 실패', err);
      this.root.innerHTML = `
        <div class="error-fallback">
          <h1>화면을 불러오지 못했어요</h1>
          <p>화면을 준비하는 중 문제가 생겼어요. 다시 시도하거나 지도 선택 화면으로 돌아가 주세요.</p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" data-act="retry">다시 시도</button>
            <button class="btn btn-ghost" data-act="map">지도 선택</button>
            <button class="btn btn-ghost" data-act="home">처음으로</button>
          </div>
        </div>`;
      this.root.querySelector('[data-act="retry"]')?.addEventListener('click', () => {
        this.isTransitioning = false;
        void this.sync();
      });
      this.root.querySelector('[data-act="home"]')?.addEventListener('click', () => {
        this.isTransitioning = false;
        location.hash = '#/';
      });
      this.root.querySelector('[data-act="map"]')?.addEventListener('click', () => {
        this.isTransitioning = false;
        location.hash = '#/map';
      });
    } finally {
      this.root.removeAttribute('aria-busy');
      this.isTransitioning = false;
      // 전환 중 해시가 다시 바뀐 경우 재동기화
      if ((location.hash || '#/') !== route) void this.sync();
    }
  }
}

export const router = new Router();

/** 페이지 코드에서 쓰는 내비게이션 헬퍼 */
export function navigate(route: string): void {
  void audio.playSfx('whoosh');
  router.go(route);
}
