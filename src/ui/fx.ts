import { saveRepo } from '../core/SaveRepository';

/** 연출(주스) 유틸 — 성공/배치/보상 순간에 화면이 반응하게 한다. 모션 감소 설정 시 자동 생략. */

function reducedMotion(): boolean {
  return saveRepo.get().settings.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const CONFETTI_COLORS = ['#6C4CE8', '#2588E8', '#10C3C8', '#F26D6D', '#F2C14E', '#2EAD78'];

export type FxCleanup = () => void;
const NOOP: FxCleanup = () => undefined;

/** 요소 위치에서 국소 파티클 6~10개. 학습 설명을 가리지 않고 280ms 안에 정리한다. */
export function burstConfetti(anchor: HTMLElement, count = 8): FxCleanup {
  if (reducedMotion() || !anchor.isConnected) return NOOP;
  const particleCount = Math.max(6, Math.min(10, count));
  const rect = anchor.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const host = document.getElementById('overlay-root') ?? document.body;
  const particles: HTMLElement[] = [];
  const animations: Animation[] = [];
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    animations.forEach((animation) => animation.cancel());
    particles.forEach((particle) => particle.remove());
  };
  for (let i = 0; i < particleCount; i++) {
    const p = document.createElement('div');
    const size = 6 + (i % 3) * 3;
    const angle = (Math.PI * 2 * i) / particleCount + (i % 2) * 0.3;
    const dist = 42 + (i % 4) * 12;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    p.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size * 0.6}px;
      background:${color};border-radius:2px;pointer-events:none;z-index:calc(var(--z-modal) + 20);
      transform:translate(-50%,-50%) rotate(${i * 40}deg);`;
    host.appendChild(p);
    particles.push(p);
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40;
    const animation = p.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx - 8}px, ${dy + 90}px) rotate(${180 + i * 30}deg)`, opacity: 0 }
      ],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)' }
    );
    animations.push(animation);
    void animation.finished.catch(() => undefined).finally(() => p.remove());
  }
  window.setTimeout(cleanup, 320);
  return cleanup;
}

/** 배치·정답 순간의 팝 바운스 */
export function popBounce(el: HTMLElement): FxCleanup {
  if (reducedMotion() || !el.isConnected) return NOOP;
  const animation = el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.12)' },
      { transform: 'scale(0.96)' },
      { transform: 'scale(1)' }
    ],
    { duration: 280, easing: 'ease-out' }
  );
  return () => animation.cancel();
}

/** 스탬프 쾅 — 위에서 내리찍고 살짝 흔들림 */
export function stampSlam(el: HTMLElement): FxCleanup {
  if (reducedMotion() || !el.isConnected) return NOOP;
  const animation = el.animate(
    [
      { transform: 'scale(2.4) rotate(-18deg)', opacity: 0 },
      { transform: 'scale(0.92) rotate(-8deg)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1.04) rotate(-9deg)', offset: 0.8 },
      { transform: 'scale(1) rotate(-8deg)' }
    ],
    { duration: 460, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' }
  );
  return () => animation.cancel();
}

/** 지표·게이지 숫자 굴리기 */
export function countUp(el: HTMLElement, from: number, to: number, suffix = ''): void {
  if (reducedMotion()) {
    el.textContent = `${to}${suffix}`;
    return;
  }
  const start = performance.now();
  const dur = 500;
  const tick = (now: number) => {
    if (!el.isConnected) return;
    const t = Math.min(1, (now - start) / dur);
    el.textContent = `${Math.round(from + (to - from) * t)}${suffix}`;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
