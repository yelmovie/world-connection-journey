import { bus } from './EventBus';
import { saveRepo } from './SaveRepository';

export type BgmId = 'main' | 'asia' | 'europe' | 'africa' | 'americas' | 'oceania';
export type SfxId =
  | 'tap' | 'pickup' | 'drop' | 'success' | 'partial'
  | 'complete' | 'whoosh'
  /* 아메리카 탐험의 환경 단서 효과음 (Pixabay — assets/CREDITS.md) */
  | 'beat_low';

type AudioAssetId = SfxId | 'stamp';

const BGM_SRC: Record<BgmId, string> = {
  main: 'sound/bgm/maintheme.mp3',
  asia: 'sound/bgm/stage1_asia.mp3',
  europe: 'sound/bgm/stage2_europe.mp3',
  africa: 'sound/bgm/stage3_africa.mp3',
  americas: 'sound/bgm/stage4_america.mp3',
  oceania: 'sound/bgm/stage5_oceania.mp3'
};

const FADE_MS = 400;

/**
 * BGM: HTMLAudio 2채널 crossfade. SFX: WebAudio(디코드 캐시, 중첩 스로틀).
 * 모든 재생은 첫 사용자 제스처(unlock) 이후에만 시작. 파일 누락은 경고만 하고 진행.
 */
class AudioManager {
  private unlocked = false;
  private ctx: AudioContext | null = null;
  private current: HTMLAudioElement | null = null;
  private currentId: BgmId | null = null;
  private pendingBgm: BgmId | null = null;
  private sfxBuffers = new Map<AudioAssetId, AudioBuffer | null>();
  private sfxLoads = new Map<AudioAssetId, Promise<AudioBuffer | null>>();
  private activeSfx = new Map<AudioAssetId, AudioBufferSourceNode>();
  private sfxGeneration = new Map<AudioAssetId, number>();
  private lastSfxAt = new Map<AudioAssetId, number>();
  private fadeTimer: number | null = null;
  private bgmSuspended = false;
  private fadingFrom: HTMLAudioElement | null = null;
  private clip: HTMLAudioElement | null = null;
  private clipResumeBgm: BgmId | null = null;

  init(): void {
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.ctx = new AudioContext();
      void this.ctx.resume();
      if (this.pendingBgm) this.playBgm(this.pendingBgm);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** 영상 재생 등으로 BGM을 잠시 멈췄다가 되돌릴 때 쓴다. */
  get currentBgmId(): BgmId | null {
    return this.currentId ?? this.pendingBgm;
  }

  get settings() {
    return saveRepo.get().settings;
  }

  /** 마스터 볼륨 0~1. BGM은 0.6×, SFX는 0.8× 기본 게인에 곱한다. */
  private get masterVolume(): number {
    const v = this.settings.volume;
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
  }

  setVolume(value: number): void {
    const v = Math.max(0, Math.min(1, value));
    saveRepo.update((s) => {
      s.settings.volume = v;
    });
    // 페이드 중이 아니면 현재 BGM에 즉시 반영
    if (this.current && this.fadeTimer === null) this.current.volume = 0.6 * v;
  }

  setSettings(bgm: boolean, sfx: boolean): void {
    saveRepo.update((s) => {
      s.settings.bgm = bgm;
      s.settings.sfx = sfx;
    });
    if (!bgm) this.stopBgm();
    else if (this.currentId) {
      this.current?.play().catch(() => undefined);
    } else if (this.pendingBgm) {
      this.playBgm(this.pendingBgm);
    }
    bus.emit('AUDIO_SETTING_CHANGED', { bgm, sfx });
  }

  playBgm(id: BgmId): void {
    this.pendingBgm = id;
    // 영상 오버레이 재생 중에는 unlock·장면 전환이 와도 BGM을 시작하지 않는다(영상 자체 BGM과 겹침 방지).
    if (this.bgmSuspended) return;
    if (!this.unlocked || !this.settings.bgm) return;
    if (this.currentId === id) return;

    const next = new Audio(BGM_SRC[id]);
    next.loop = true;
    next.volume = 0;
    next.play().catch((err: DOMException) => {
      // 브라우저의 자동 재생 차단은 오류가 아니라 첫 터치를 기다리는 정상 상태다.
      if (err?.name !== 'NotAllowedError') console.warn(`[Audio] BGM 재생 실패: ${id}`, err);
    });

    const prev = this.current;
    this.current = next;
    this.currentId = id;
    this.crossfade(prev, next);
  }

  /**
   * 악기 연주처럼 긴 클립 1개를 재생한다(동시에 하나만).
   * 악기 소리만 들리도록 재생 동안 BGM을 멈추고 효과음도 막았다가, 끝나거나 멈추면 되돌린다.
   * SFX 설정을 따르며 파일 누락·차단 시에는 조용히 종료한다.
   */
  playClip(src: string, opts: { loop?: boolean; onEnd?: () => void } = {}): boolean {
    this.stopClip();
    if (!this.unlocked || !this.settings.sfx) return false;
    const el = new Audio(src);
    el.loop = opts.loop === true;
    el.volume = 0.85 * this.masterVolume;
    this.clip = el;
    this.clipResumeBgm = this.currentBgmId;
    this.suspendBgm();
    const done = () => {
      if (this.clip !== el) return;
      this.clip = null;
      this.restoreBgmAfterClip();
      opts.onEnd?.();
    };
    el.addEventListener('ended', done, { once: true });
    el.addEventListener('error', done, { once: true });
    el.play().catch(() => done());
    return true;
  }

  stopClip(): void {
    const el = this.clip;
    if (!el) return;
    this.clip = null;
    this.disposeTrack(el);
    this.restoreBgmAfterClip();
  }

  private restoreBgmAfterClip(): void {
    const resume = this.clipResumeBgm;
    this.clipResumeBgm = null;
    this.resumeBgmAfterVideo(resume);
  }

  get clipPlaying(): boolean {
    return this.clip !== null && !this.clip.paused && !this.clip.ended;
  }

  /** 알림 순간에 BGM을 잠깐 낮췄다가 되돌린다 (페이드 중이면 건너뜀). */
  duck(ms = 1600, level = 0.25): void {
    const track = this.current;
    if (!track || this.fadeTimer !== null) return;
    const full = 0.6 * this.masterVolume;
    track.volume = full * level;
    window.setTimeout(() => {
      if (this.current === track && this.fadeTimer === null) track.volume = full;
    }, ms);
  }

  /** 영상 재생 동안 BGM을 멈추고, 도중의 playBgm·unlock에 의한 재시작도 막는다. */
  suspendBgm(): void {
    this.bgmSuspended = true;
    this.stopBgm();
  }

  /** 영상이 끝나면 막음을 풀고, 도중에 요청됐던(없으면 기억해 둔) BGM을 되살린다. */
  resumeBgmAfterVideo(fallback: BgmId | null): void {
    this.bgmSuspended = false;
    const id = this.pendingBgm ?? fallback;
    if (id) this.playBgm(id);
  }

  stopBgm(): void {
    const prev = this.current;
    this.current = null;
    this.currentId = null;
    this.crossfade(prev, null);
  }

  private crossfade(from: HTMLAudioElement | null, to: HTMLAudioElement | null): void {
    if (this.fadeTimer !== null) {
      window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    // 이전 crossfade 도중 다시 이동하면 최초 트랙이 고아 재생되지 않게 즉시 정리한다.
    if (this.fadingFrom && this.fadingFrom !== from && this.fadingFrom !== to) {
      this.disposeTrack(this.fadingFrom);
    }
    this.fadingFrom = from;
    const start = performance.now();
    this.fadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / FADE_MS);
      const bgmVol = 0.6 * this.masterVolume;
      if (from) from.volume = Math.max(0, bgmVol * (1 - t));
      if (to) to.volume = bgmVol * t;
      if (t >= 1) {
        if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
        this.fadeTimer = null;
        if (from) {
          this.disposeTrack(from);
          if (this.fadingFrom === from) this.fadingFrom = null;
        }
      }
    }, 30);
  }

  private disposeTrack(track: HTMLAudioElement): void {
    track.pause();
    track.removeAttribute('src');
    track.load();
  }

  async playSfx(id: SfxId): Promise<void> {
    await this.playSfxAsset(id);
  }

  /** 특정 효과음이 재생 중이거나 로딩 중이어도 이후 재생되지 않게 멈춘다. */
  stopSfx(id: SfxId): void {
    this.sfxGeneration.set(id, (this.sfxGeneration.get(id) ?? 0) + 1);
    const source = this.activeSfx.get(id);
    if (!source) return;
    this.activeSfx.delete(id);
    try { source.stop(); } catch { /* 이미 종료됨 */ }
  }

  /** 미션 상태를 완료로 저장한 뒤 도장 보상을 보여 줄 때만 호출한다. */
  async playStageCompleteStamp(): Promise<void> {
    await this.playSfxAsset('stamp');
  }

  private async playSfxAsset(id: AudioAssetId): Promise<void> {
    if (!this.unlocked || !this.ctx || !this.settings.sfx) return;
    if (this.clip) return; // 악기 소리를 듣는 동안에는 효과음을 겹치지 않는다
    const generation = this.sfxGeneration.get(id) ?? 0;
    const now = performance.now();
    const last = this.lastSfxAt.get(id) ?? 0;
    if (now - last < 80) return; // 빠른 연속 클릭 중첩 방지
    this.lastSfxAt.set(id, now);

    let buffer = this.sfxBuffers.get(id);
    if (buffer === undefined) {
      let pending = this.sfxLoads.get(id);
      if (!pending) {
        pending = this.loadSfx(id);
        this.sfxLoads.set(id, pending);
      }
      buffer = await pending;
      this.sfxLoads.delete(id);
      this.sfxBuffers.set(id, buffer);
    }
    if (!buffer || !this.ctx || generation !== (this.sfxGeneration.get(id) ?? 0)) return;
    const previous = this.activeSfx.get(id);
    if (previous) {
      try { previous.stop(); } catch { /* 이미 종료됨 */ }
      previous.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.8 * this.masterVolume;
    src.connect(gain).connect(this.ctx.destination);
    this.activeSfx.set(id, src);
    src.addEventListener('ended', () => {
      if (this.activeSfx.get(id) === src) this.activeSfx.delete(id);
      src.disconnect();
      gain.disconnect();
    }, { once: true });
    src.start();
  }

  private async loadSfx(id: AudioAssetId): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    try {
      const res = await fetch(`sound/sfx/sfx_${id}.mp3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await this.ctx.decodeAudioData(await res.arrayBuffer());
    } catch (err) {
      console.warn(`[Audio] SFX 로드 실패(무음 진행): ${id}`, err);
      return null;
    }
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }
}

export const audio = new AudioManager();
