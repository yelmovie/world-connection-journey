import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo, recomputeUnlocks } from '../core/SaveRepository';
import { createPhaserHost, GAME_W, GAME_H, type PhaserHost } from '../core/phaserHost';
import { buildTopBar } from '../ui/chrome';
import type { MissionId, MissionStatus } from '../types';
import { CONTINENT_IDS } from '../types';

interface Spot {
  id: MissionId;
  name: string;
  route: string;
  desc: string;
  x: number; // 0~1 (1280×720 기준 비율)
  y: number;
}

const SPOTS: Spot[] = [
  { id: 'asia', name: '아시아', route: '#/mission/asia', desc: '한 친구의 하루 자료를 보고 사실과 해석을 구분해요', x: 0.74, y: 0.36 },
  { id: 'europe', name: '유럽', route: '#/mission/europe', desc: '문화유산과 오늘의 생활을 잇는 여행 경로를 설계해요', x: 0.52, y: 0.28 },
  { id: 'africa', name: '아프리카', route: '#/mission/africa', desc: '리듬으로 주고받는 소리의 대화를 만들어요', x: 0.52, y: 0.56 },
  { id: 'americas', name: '아메리카', route: '#/mission/americas', desc: '친구들의 필요를 살펴 함께할 하루를 계획해요', x: 0.22, y: 0.42 },
  { id: 'oceania', name: '오세아니아', route: '#/mission/oceania', desc: '섬과 바다를 지키는 3턴 시뮬레이션에 도전해요', x: 0.84, y: 0.66 },
  { id: 'dialogue', name: '다름을 잇는 대화', route: '#/mission/respect-dialogue', desc: '다섯 대륙을 여행한 뒤 열리는 마지막 대화 미션이에요', x: 0.5, y: 0.8 }
];

const STATUS_LABEL: Record<MissionStatus, string> = {
  locked: '잠김', available: '도전 가능', in_progress: '진행 중', completed: '완료'
};

export function createPage(): Page {
  let host: PhaserHost | null = null;
  let flyTo: ((x: number, y: number) => void) | null = null;
  let resizeObs: ResizeObserver | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      await preloadImages(['bg.map', 'plane.main']);
      audio.playBgm('main');
      const save = saveRepo.get();
      recomputeUnlocks(save);

      const page = document.createElement('div');
      page.className = 'page';
      page.style.background = 'linear-gradient(#0e2440, #19324d)';
      page.appendChild(
        buildTopBar({
          title: '세계 항로 지도',
          subtitle: save.profile ? `${save.profile.nickname}의 여행` : undefined,
          backTo: '#/'
        })
      );

      const bodyWrap = document.createElement('div');
      bodyWrap.style.cssText = 'flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center';
      const canvasWrap = document.createElement('div');
      canvasWrap.style.cssText = 'position:absolute;inset:0';
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:absolute;pointer-events:none';
      bodyWrap.appendChild(canvasWrap);
      bodyWrap.appendChild(overlay);
      page.appendChild(bodyWrap);

      // 하단 미리보기 패널
      const preview = document.createElement('div');
      preview.className = 'bottom-bar';
      preview.innerHTML = `<span class="chip">가고 싶은 지역을 골라 보세요. 순서는 자유예요!</span>`;
      page.appendChild(preview);
      root.appendChild(page);

      // ---- Phaser 배경·항로·비행기 ----
      const bgUrl = assetUrl('bg.map');
      const planeUrl = hasAsset('plane.main') ? assetUrl('plane.main') : null;
      host = await createPhaserHost(canvasWrap, (Phaser) => {
        class MapScene extends Phaser.Scene {
          constructor() {
            super('map');
          }
          preload() {
            this.load.image('bg', bgUrl);
            if (planeUrl) this.load.image('plane', planeUrl);
          }
          create() {
            const bg = this.add.image(GAME_W / 2, GAME_H / 2, 'bg');
            const scale = Math.max(GAME_W / bg.width, GAME_H / bg.height);
            bg.setScale(scale).setAlpha(0.96);

            // 완료 지역을 잇는 항로 (점선)
            const g = this.add.graphics();
            g.lineStyle(3, 0xf2c14e, 0.85);
            const done = SPOTS.filter((s) => saveRepo.get().missions[s.id].status === 'completed');
            for (let i = 0; i < done.length - 1; i++) {
              const a = done[i]!;
              const b = done[i + 1]!;
              drawDashedLine(g, a.x * GAME_W, a.y * GAME_H, b.x * GAME_W, b.y * GAME_H);
            }

            if (planeUrl) {
              const start = done.length > 0 ? done[done.length - 1]! : SPOTS[0]!;
              const plane = this.add.image(start.x * GAME_W, start.y * GAME_H - 40, 'plane');
              plane.setScale(Math.min(1, 120 / plane.width));
              this.tweens.add({
                targets: plane,
                y: plane.y - 10,
                duration: 1600,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
              });
              flyTo = (x, y) => {
                if (saveRepo.get().settings.reducedMotion) {
                  plane.setPosition(x * GAME_W, y * GAME_H - 40);
                  return;
                }
                this.tweens.add({
                  targets: plane,
                  x: x * GAME_W,
                  y: y * GAME_H - 40,
                  duration: 700,
                  ease: 'Cubic.easeInOut'
                });
              };
            }
          }
        }
        function drawDashedLine(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number) {
          const len = Math.hypot(x2 - x1, y2 - y1);
          const dash = 12;
          const n = Math.floor(len / (dash * 2));
          for (let i = 0; i <= n; i++) {
            const t0 = (i * dash * 2) / len;
            const t1 = Math.min(1, (i * dash * 2 + dash) / len);
            g.lineBetween(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1);
          }
        }
        return new MapScene();
      });
      if (disposed) {
        host.destroy();
        return;
      }

      // ---- DOM 핫스폿(캔버스 표시 영역에 맞춰 배치) ----
      const syncOverlay = () => {
        const canvas = canvasWrap.querySelector('canvas');
        if (!canvas) return;
        const wrapRect = bodyWrap.getBoundingClientRect();
        const rect = canvas.getBoundingClientRect();
        overlay.style.left = `${rect.left - wrapRect.left}px`;
        overlay.style.top = `${rect.top - wrapRect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
      };
      resizeObs = new ResizeObserver(syncOverlay);
      resizeObs.observe(bodyWrap);
      window.setTimeout(syncOverlay, 50);

      let selectedId: MissionId | null = null;
      for (const spot of SPOTS) {
        const m = saveRepo.get().missions[spot.id];
        const btn = document.createElement('button');
        const isDialogue = spot.id === 'dialogue';
        btn.className = 'map-hotspot';
        btn.dataset.status = m.status;
        btn.disabled = m.status === 'locked';
        btn.style.cssText = `
          position:absolute;left:${spot.x * 100}%;top:${spot.y * 100}%;transform:translate(-50%,-50%);
          pointer-events:auto;min-width:var(--hotspot-min);min-height:var(--hotspot-min);
          border-radius:${isDialogue ? 'var(--radius-m)' : '999px'};
          border:3px solid #fff;cursor:${m.status === 'locked' ? 'not-allowed' : 'pointer'};
          font-family:var(--font-head);font-size:var(--fs-small);color:#fff;
          padding:8px 14px;display:flex;flex-direction:column;align-items:center;gap:2px;
          box-shadow:var(--shadow-pop);
          background:${statusColor(m.status)};
          opacity:${m.status === 'locked' ? 0.75 : 1};
        `;
        btn.innerHTML = `
          <span aria-hidden="true" style="font-size:1.15em">${statusMark(m.status)}</span>
          <span>${spot.name}</span>`;
        btn.setAttribute('aria-label', `${spot.name} — ${STATUS_LABEL[m.status]}`);
        btn.addEventListener('click', () => {
          if (m.status === 'locked') return;
          void audio.playSfx('tap');
          if (selectedId === spot.id) {
            navigate(spot.route); // 두 번째 탭 = 진입
            return;
          }
          selectedId = spot.id;
          flyTo?.(spot.x, spot.y);
          preview.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
              <strong style="font-family:var(--font-head);font-size:var(--fs-body)">${spot.name} · ${STATUS_LABEL[m.status]}${m.bestScore > 0 ? ` · 최고 ${m.bestScore}점` : ''}</strong>
              <span style="font-size:var(--fs-small);color:var(--c-cream)">${spot.desc}</span>
            </div>
            <button class="btn btn-primary btn-big" data-act="enter">${m.status === 'completed' ? '다시 도전' : m.status === 'in_progress' ? '이어서 하기' : '출발!'}</button>`;
          preview.querySelector('[data-act="enter"]')?.addEventListener('click', () => navigate(spot.route));
        });
        overlay.appendChild(btn);
      }

      // 완료 화면 포털
      if (saveRepo.get().completion.unlocked) {
        const doneBtn = document.createElement('button');
        doneBtn.className = 'btn btn-success';
        doneBtn.textContent = '여행 완료 확인하러 가기';
        doneBtn.style.cssText = 'position:absolute;right:16px;bottom:16px;pointer-events:auto';
        doneBtn.addEventListener('click', () => navigate('#/completion'));
        overlay.appendChild(doneBtn);
      }

      const doneCount = CONTINENT_IDS.filter((id) => saveRepo.get().missions[id].status === 'completed').length;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.cssText = 'position:absolute;left:16px;bottom:16px;pointer-events:none';
      chip.textContent = `대륙 미션 ${doneCount}/5 완료`;
      overlay.appendChild(chip);
    },

    unmount() {
      disposed = true;
      resizeObs?.disconnect();
      resizeObs = null;
      flyTo = null;
      host?.destroy();
      host = null;
    }
  };
}

function statusColor(s: MissionStatus): string {
  switch (s) {
    case 'completed': return 'var(--c-success)';
    case 'in_progress': return 'var(--c-violet)';
    case 'available': return 'var(--c-coral)';
    case 'locked': return '#5b6b7d';
  }
}
function statusMark(s: MissionStatus): string {
  switch (s) {
    case 'completed': return '✓';
    case 'in_progress': return '◐';
    case 'available': return '★';
    case 'locked': return '🔒';
  }
}
