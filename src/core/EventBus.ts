import type { MissionId } from '../types';

/** 이벤트 이름은 이 파일에서만 정의한다. 임의 문자열 사용 금지. */
export interface EventMap {
  SCENE_READY: { sceneId: string };
  REQUEST_SCENE_CHANGE: { route: string };
  MISSION_START: { missionId: MissionId };
  MISSION_CHECKPOINT: { missionId: MissionId; checkpointId: string };
  MISSION_FEEDBACK: { missionId: MissionId; kind: 'success' | 'partial' | 'retry'; message: string };
  MISSION_COMPLETE: { missionId: MissionId; score: number };
  SCORE_UPDATED: { missionId: MissionId; score: number };
  OPEN_DIALOGUE: { id: string };
  CLOSE_DIALOGUE: { id: string };
  PROFILE_UPDATED: Record<string, never>;
  SAVE_COMPLETED: { at: string };
  SAVE_FAILED: { message: string };
  AUDIO_SETTING_CHANGED: { bgm: boolean; sfx: boolean };
  MODAL_OPENED: { id: string };
  MODAL_CLOSED: { id: string };
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<never>>>();

  on<K extends keyof EventMap>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<K>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        (h as Handler<K>)(payload);
      } catch (err) {
        console.error(`[EventBus] handler error on ${String(event)}`, err);
      }
    });
  }

  /** 장면 정리 시 페이지가 등록한 핸들러 일괄 해제용 */
  scope(): { on: EventBus['on']; dispose: () => void } {
    const offs: Array<() => void> = [];
    return {
      on: (event, handler) => {
        const off = this.on(event, handler);
        offs.push(off);
        return off;
      },
      dispose: () => {
        offs.forEach((off) => off());
        offs.length = 0;
      }
    };
  }
}

export const bus = new EventBus();
