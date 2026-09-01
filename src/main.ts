import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/travel-theme.css';
import './styles/print.css';

import { router } from './router';
import { audio } from './core/AudioManager';
import { saveRepo } from './core/SaveRepository';
import { showToast } from './ui/toast';
import { bus } from './core/EventBus';

// 전역 오류 — 기술 메시지는 콘솔에 남기고 학생에게는 다음 행동만 안내한다.
let lastErrorNoticeAt = 0;
const notifyGlobalError = () => {
  const now = Date.now();
  if (now - lastErrorNoticeAt < 2000) return;
  lastErrorNoticeAt = now;
  showToast('화면 처리 중 문제가 생겼어요. 같은 동작을 다시 해 보고, 계속되면 처음 화면으로 돌아가 주세요.', 'warn', 5000);
};
window.addEventListener('error', (e) => {
  console.error('[Global]', e.error ?? e.message);
  notifyGlobalError();
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] unhandled rejection', e.reason);
  notifyGlobalError();
});

bus.on('SAVE_FAILED', () => {
  showToast('저장에 실패했어요. 브라우저 저장 공간을 확인해 주세요. 계속 실패하면 설정에서 여행 기록 초기화를 하면 다시 시작할 수 있어요.', 'warn', 6000);
});

// 모션 감소 설정 반영
const applyReducedMotion = () => {
  document.documentElement.dataset.reducedMotion = String(saveRepo.get().settings.reducedMotion);
};
bus.on('SAVE_COMPLETED', applyReducedMotion);

// ---- 부팅 스플래시 진행률 (index.html의 인라인 스플래시를 갱신) ----
const setBoot = (pct: number, msg?: string): void => {
  const bar = document.getElementById('boot-bar');
  if (bar) bar.style.width = `${pct}%`;
  const msgEl = document.getElementById('boot-msg');
  if (msgEl && msg) msgEl.textContent = msg;
};
const removeBootSplash = (): void => {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.style.opacity = '0';
  window.setTimeout(() => splash.remove(), 400);
};

// 첫 화면이 준비되면 스플래시를 부드럽게 제거한다.
let firstSceneSeen = false;
bus.on('SCENE_READY', () => {
  if (firstSceneSeen) return;
  firstSceneSeen = true;
  setBoot(100, '준비 완료!');
  removeBootSplash();
});

async function boot(): Promise<void> {
  setBoot(30, '글꼴을 준비하고 있어요...');
  // 폰트 로드는 최대 3초만 기다린다 — 느린 네트워크에서 시작을 막지 않는다.
  await Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((resolve) => window.setTimeout(resolve, 3000))
  ]);
  setBoot(55, '여행 기록을 확인하고 있어요...');
  applyReducedMotion(); // saveRepo는 import 시점에 이미 로드됨
  setBoot(80, '지도를 펼치고 있어요...');
  audio.init();
  router.start();
}
void boot();

// 서비스워커: 프로덕션 빌드에서만 등록 (dev HMR 충돌 방지)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[SW] 등록 실패', err));
  });
}

// 예전에 같은 localhost 주소에서 미리보기 빌드를 열었다면 그 서비스워커가
// 개발 서버의 최신 파일보다 오래된 캐시를 돌려줄 수 있다. 개발 중에는 이 앱의
// 현재 origin에 남아 있는 등록만 해제해 HMR 결과를 그대로 확인한다.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (new URL(registration.scope).origin === window.location.origin) {
        void registration.unregister();
      }
    }
  }).catch((err) => console.warn('[SW] 개발용 등록 해제 실패', err));
  // 등록 해제만으로는 이미 저장된 캐시가 남아 다음 로드에서 다시 옛 화면이 나올 수 있다.
  // 주의: 남의 서비스워커가 index.html까지 캐시로 돌려주면 이 코드 자체가 실행되지 않는다.
  // 그래서 포트를 이 프로젝트 전용(5273)으로 분리해 origin이 겹치지 않게 해 두었다.
  if ('caches' in window) {
    void caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch((err) => console.warn('[SW] 개발용 캐시 정리 실패', err));
  }
}
