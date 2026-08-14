import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/print.css';

import { router } from './router';
import { audio } from './core/AudioManager';
import { saveRepo } from './core/SaveRepository';
import { showToast } from './ui/toast';
import { bus } from './core/EventBus';

// 전역 오류 — 크래시 대신 사용자에게 알리고 진행
window.addEventListener('error', (e) => {
  console.error('[Global]', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] unhandled rejection', e.reason);
});

bus.on('SAVE_FAILED', () => {
  showToast('저장에 실패했어요. 브라우저 저장 공간을 확인해 주세요.', 'warn');
});

// 모션 감소 설정 반영
const applyReducedMotion = () => {
  document.documentElement.dataset.reducedMotion = String(saveRepo.get().settings.reducedMotion);
};
applyReducedMotion();
bus.on('SAVE_COMPLETED', applyReducedMotion);

audio.init();
router.start();
