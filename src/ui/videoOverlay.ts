import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';

export interface VideoCue { start: number; end: number; text: string }

// unmount에서 오버레이 DOM만 지우면 finish가 안 돌아 BGM이 영구 정지된다 — 반드시 finish 경유로 닫는다
let activeVideoFinish: (() => void) | null = null;
export function closeActiveVideoOverlay(): void { activeVideoFinish?.(); }

/**
 * 인트로·엔딩 영상 오버레이. 재생 중에는 BGM을 멈추고 끝나면 되돌린다.
 * 로드 실패·자동재생 차단이어도 흐름이 막히지 않는다(재생 버튼 또는 건너뛰기).
 */
export function playVideoOverlay(opts: {
  /** 게임 배경음을 계속 틀고 영상 소리는 끈다 */
  keepBgm?: boolean;
  id: string;
  src: string;
  poster?: string;
  title: string;
  skipLabel?: string;
  /** 시간에 맞춰 큰 자막으로 보여 줄 대사 */
  cues?: VideoCue[];
  onDone: () => void;
}): () => void {
  if (!document.getElementById('video-overlay-css')) {
    const style = document.createElement('style');
    style.id = 'video-overlay-css';
    style.textContent = VIDEO_OVERLAY_CSS;
    document.head.appendChild(style);
  }
  const overlay = document.createElement('div');
  overlay.className = 'video-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', opts.title);
  overlay.innerHTML = `
    <video class="video-overlay__video" playsinline preload="auto" ${opts.poster ? `poster="${opts.poster}"` : ''}>
      <source src="${opts.src}" type="video/mp4">
    </video>
    <p class="video-overlay__caption" role="status" aria-live="polite"></p>
    <button type="button" class="btn btn-primary btn-big video-overlay__play" data-act="play" hidden>영상 재생</button>
    <button type="button" class="btn btn-ghost video-overlay__skip" data-act="skip">${opts.skipLabel ?? '건너뛰기'}</button>`;
  const video = overlay.querySelector<HTMLVideoElement>('video')!;
  const playBtn = overlay.querySelector<HTMLButtonElement>('[data-act="play"]')!;
  const skipBtn = overlay.querySelector<HTMLButtonElement>('[data-act="skip"]')!;
  const previousFocus = document.activeElement as HTMLElement | null;
  const resumeBgm = audio.currentBgmId;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (activeVideoFinish === finish) activeVideoFinish = null;
    window.clearTimeout(stallTimer);
    video.pause();
    video.removeAttribute('src');
    video.querySelector('source')?.remove();
    video.load();
    overlay.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    if (!opts.keepBgm) audio.resumeBgmAfterVideo(resumeBgm);
    previousFocus?.focus();
    opts.onDone();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); finish(); }
  };

  // keepBgm: 게임 배경음을 그대로 두고 영상 자체 소리는 끈다(영상 소리가 작아 안 들리는 문제 대신 배경음 사용).
  // 아니면 영상 자체 BGM만 나오게: 게임 BGM을 멈추고, 재생 중 unlock·장면 전환으로 되살아나는 것도 막는다.
  if (!opts.keepBgm) audio.suspendBgm();
  // 영상의 원래 배경음: BGM 설정을 따르고 마스터 볼륨을 적용한다.
  video.muted = opts.keepBgm ? true : !audio.settings.bgm;
  const master = saveRepo.get().settings.volume;
  video.volume = typeof master === 'number' && Number.isFinite(master) ? Math.max(0, Math.min(1, master)) : 0.8;
  const caption = overlay.querySelector<HTMLElement>('.video-overlay__caption')!;
  const cues = opts.cues ?? [];
  let cueIndex = -1;
  const syncCaption = () => {
    const t = video.currentTime;
    const idx = cues.findIndex((c) => t >= c.start && t < c.end);
    if (idx === cueIndex) return;
    cueIndex = idx;
    caption.textContent = idx >= 0 ? cues[idx]!.text : '';
    caption.classList.toggle('is-on', idx >= 0);
  };
  video.addEventListener('timeupdate', syncCaption);
  if (cues.length) caption.textContent = cues[0]!.text, caption.classList.add('is-on');
  video.addEventListener('ended', finish);
  video.addEventListener('error', finish);
  // 8초 안에 재생이 시작되지 않으면(학교망 느림·차단) 흐름을 막지 않는다.
  const stallTimer = window.setTimeout(() => { if (video.currentTime === 0) finish(); }, 8000);
  video.addEventListener('playing', () => window.clearTimeout(stallTimer), { once: true });
  playBtn.addEventListener('click', () => {
    playBtn.hidden = true;
    video.play().catch(() => finish());
  });
  skipBtn.addEventListener('click', finish);
  overlay.addEventListener('keydown', onKeyDown);
  activeVideoFinish = finish;
  (document.getElementById('overlay-root') ?? document.body).appendChild(overlay);
  skipBtn.focus();
  video.play().catch(() => {
    // 자동재생 차단 — 사용자가 직접 누르게 한다.
    playBtn.hidden = false;
    playBtn.focus();
  });
  return finish;
}

export const VIDEO_OVERLAY_CSS = `
.video-overlay { position:fixed;inset:0;z-index:var(--z-modal);background:#05111f;display:flex;align-items:center;justify-content:center; }
.video-overlay__video { width:100%;height:100%;object-fit:contain;background:#05111f; }
.video-overlay__skip { position:absolute;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));min-height:52px;
  /* 밝은 장면 위에서도 반드시 보이게 — 영상을 못 건너뛰면 아이는 그냥 기다린다 */
  background:rgba(10,26,44,.82);color:#fff;border:2px solid rgba(255,255,255,.7);
  padding-inline:18px;font-weight:900;box-shadow:0 6px 18px rgba(0,0,0,.4);backdrop-filter:blur(4px); }
.video-overlay__skip:hover,.video-overlay__skip:focus-visible { background:rgba(10,26,44,.94); }
.video-overlay__play { position:absolute;left:50%;top:50%;transform:translate(-50%,-50%); }
.video-overlay__caption {
  position:absolute;left:50%;bottom:max(6vh,env(safe-area-inset-bottom));transform:translateX(-50%);max-width:min(92vw,30em);margin:0;
  padding:10px 22px;border-radius:16px;background:rgba(5,17,31,.72);color:#fff;text-align:center;
  font:900 clamp(22px,2.4vw,36px)/1.35 var(--font-head);text-shadow:0 2px 8px rgba(0,0,0,.7);word-break:keep-all;
  opacity:0;transition:opacity 180ms;pointer-events:none;
}
.video-overlay__caption.is-on { opacity:1; }
`;
