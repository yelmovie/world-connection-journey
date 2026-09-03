/** 페이지 수명에 묶인 setTimeout 풀 — 정리(clear)를 한 번에, dispose 후 콜백은 무시. */
export function createTimerPool(isDisposed: () => boolean): {
  later: (fn: () => void, ms: number) => number;
  clear: () => void;
} {
  const timers = new Set<number>();
  return {
    later(fn: () => void, ms: number): number {
      const id = window.setTimeout(() => { timers.delete(id); if (!isDisposed()) fn(); }, ms);
      timers.add(id);
      return id;
    },
    clear(): void {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    }
  };
}
