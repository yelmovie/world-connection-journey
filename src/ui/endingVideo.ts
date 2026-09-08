import { audio } from '../core/AudioManager';
import { playVideoOverlay } from './videoOverlay';

/** 엔딩 자막 — 장면 순서: 지구 위 비행 → 도시·자연 → 원탁 지구본 → 해변 청소·나무 심기 → 마무리 */
const FINAL_CUES = [
  { start: 0, end: 3.4, text: '여섯 친구의 신호를 모아 세계 친구 지구회의를 열었어.' },
  { start: 3.4, end: 7, text: '바다와 공기, 기후와 생태계는 국경을 넘어 이어져 있었지.' },
  { start: 7, end: 10.6, text: '서로 다른 생각을 듣고, 함께 지킬 약속을 만들었어.' },
  { start: 10.6, end: 14.2, text: '나부터, 학교와 마을이, 그리고 여러 나라가 함께.' },
  { start: 14.2, end: 17.6, text: '세계를 잇는 여행은 이제 네 생활에서 이어질 거야. 고마워, 탐험가!' }
];

/** 완주 엔딩 영상(final/final.mp4 원본 → public/video/final.mp4). 로드 실패·건너뛰기여도 onDone으로 이어진다. */
export function playEndingVideo(onDone: () => void): void {
  // 다른 완료 흐름에서 시작된 팡파르가 영상 위로 이어지지 않게 진입 시점에도 확실히 끊는다.
  audio.stopSfx('complete');
  playVideoOverlay({
    id: 'final',
    src: 'video/final.mp4',
    poster: 'video/final_poster.jpg',
    title: '세계를 잇는 여행 엔딩 영상',
    skipLabel: '건너뛰기',
    cues: FINAL_CUES,
    keepBgm: true, // 영상 소리가 작아 들리지 않던 문제 — 게임 배경음을 그대로 쓴다
    onDone
  });
}
