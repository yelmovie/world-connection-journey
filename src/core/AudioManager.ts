import { bus } from './EventBus';
import { saveRepo } from './SaveRepository';

export type BgmId = 'main' | 'asia' | 'europe' | 'africa' | 'americas' | 'oceania';
export type SfxId =
  | 'tap' | 'pickup' | 'drop' | 'success' | 'partial'
  | 'stamp' | 'complete' | 'whoosh' | 'beat_low' | 'beat_high';

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
  private sfxBuffers = new Map<SfxId, AudioBuffer | null>();
  private sfxLoads = new Map<SfxId, Promise<AudioBuffer | null>>();
  private activeSfx = new Map<SfxId, AudioBufferSourceNode>();
  private lastSfxAt = new Map<SfxId, number>();
  private fadeTimer: number | null = null;
  private fadingFrom: HTMLAudioElement | null = null;

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
    if (!this.unlocked || !this.settings.bgm) return;
    if (this.currentId === id) return;

    const next = new Audio(BGM_SRC[id]);
    next.loop = true;
    next.volume = 0;
    next.play().catch((err) => console.warn(`[Audio] BGM 재생 실패: ${id}`, err));

    const prev = this.current;
    this.current = next;
    this.currentId = id;
    this.crossfade(prev, next);
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
    if (!this.unlocked || !this.ctx || !this.settings.sfx) return;
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
    if (!buffer || !this.ctx) return;
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

  private async loadSfx(id: SfxId): Promise<AudioBuffer | null> {
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

  /** 리듬 시퀀서용 — SFX 파일과 무관하게 WebAudio 합성 타악기 재생 (결정론적). */
  playBeat(kind: 'low' | 'high', when = 0): void {
    if (!this.ctx || !this.settings.sfx) return;
    const vol = this.masterVolume;
    if (vol <= 0) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (kind === 'low') {
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);
      gain.gain.setValueAtTime(0.9 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    } else {
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.06);
      gain.gain.setValueAtTime(0.6 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    }
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  get audioContext(): AudioContext | null {
    return this.ctx;
  }
}

export const audio = new AudioManager();
