# TRD — 세계를 잇는 여행

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite 7 + TypeScript 5 (strict, noUncheckedIndexedAccess) | 정적 배포, 빠른 HMR |
| 게임 캔버스 | Phaser 3 (동적 import — 사용하는 페이지에서만 청크 로드) | 지도 연출·비행기 트윈 |
| UI | 바닐라 DOM + CSS + 인라인 SVG | 한글 텍스트·접근성·인쇄, React 불필요 |
| 오디오 | HTMLAudio(BGM crossfade) + WebAudio(SFX·합성 타악기) | 리듬 시퀀서 정밀 스케줄링 |
| 저장 | localStorage (schema v1) | 서버 없음, 개인정보 최소화 |
| 테스트 | Vitest (node 환경) | 결정론 로직·콘텐츠 검증 |
| 3D | 예약 슬롯만 (`src/ui/threeSlot.ts`) | GLB 에셋 0개 — "3d assets" 폴더는 2.5D PNG 렌더. 슬롯은 `[data-three-slot]`로 표준화, 현재는 이미지 폴백 표시 |

## 디렉터리

```
public/assets/*.webp      빌드용 최적화 이미지 (원본은 assets/ 등에 보존, gitignore)
public/content/v1/ko/     미션 콘텐츠 JSON 7종 (버전 폴더로 마이그레이션 대비)
public/sound/{bgm,sfx}/   오디오 (bgm은 sound/ 원본의 소문자 사본)
public/fonts/             Jua·Pretendard woff2 셀프호스팅 (외부 CDN 요청 0)
src/core/                 EventBus, SaveRepository, AudioManager, assets(매니페스트),
                          ContentRepository, scoring, phaserHost
src/ui/                   modal, toast, chrome(top bar·설정), dnd(집기-놓기), feedback
src/pages/                10페이지 (라우터가 lazy import)
src/content/asset-manifest.json   semantic id → src 매핑 (스크립트가 생성)
scripts/                  build-assets.mjs(원본→WebP), contact-sheet.mjs, asset-map.json
tests/                    save/scoring/unlock/reward/sim/dialogue
docs/                     본 문서 4종
_unused/duplicates/       MD5 동일 중복 원본 23장 (삭제 아님, 이동 보관)
```

## 책임 분리

- **Phaser**: 지도 배경·항로 점선·비행기 트윈(2p), 미션 연출. 페이지당 1인스턴스, `unmount()`에서 `game.destroy(true)` — 숨은 캔버스 금지.
- **DOM/SVG**: 모든 한글 텍스트·버튼·카드·대화창·게이지·수료증. 미션의 드래그/분류/시퀀서/경로 UI는 DOM+SVG로 구현해 키보드·탭 대체 조작과 200% 확대를 보장한다(글자를 이미지에 굽지 않음).
- **통신**: `src/core/EventBus.ts`의 타입 지정 EventMap만 사용. 이벤트 이름 상수는 이 파일 단일 소스.

이벤트: `SCENE_READY, REQUEST_SCENE_CHANGE, MISSION_START, MISSION_CHECKPOINT, MISSION_FEEDBACK, MISSION_COMPLETE, SCORE_UPDATED, OPEN_DIALOGUE, CLOSE_DIALOGUE, PROFILE_UPDATED, SAVE_COMPLETED, SAVE_FAILED, AUDIO_SETTING_CHANGED, MODAL_OPENED, MODAL_CLOSED`

## 라우팅·가드

해시 라우터(`#/map` 등) — 정적 호스팅에서 리라이트 불필요.
- 전환 가드: `isTransitioning` + 300ms 디바운스 (빠른 연속 클릭에 화면 중복 열림 방지)
- 접근 가드(`guard()`): 프로필 없으면 여권으로, 대화는 5대륙 완료 시, `#/completion`은 `recomputeUnlocks()` 재계산 통과 시만. 저장값의 unlocked를 신뢰하지 않는다 (2차 방어는 completion 페이지 mount에서 재검사).

## 저장 스키마 (v1)

키 `world_connection_journey.save.v1`. 타입은 `src/types.ts`의 `GameSaveV1`:
profile(별명·아바타·비행기·탐험질문) / missions(미션ID별 status·checkpointId·bestScore·attempts·scoreDimensions·data) /
stamps / settings(bgm·sfx·reducedMotion) / completion(unlocked·reflection·actionPrinciples·certificateIssued) /
rewardClaimedById(보상 중복 방지) / lastRoute / updatedAt

안전장치:
- `validateSave()` 필드 단위 검증·복구, 손상 원문은 `…corrupt-backup`에 백업
- 해금 상태는 `recomputeUnlocks()`로 항상 재계산 (저장 조작 무력화)
- `completeMission()` — attempts 증가, bestScore max 갱신, 스탬프·보상은 rewardClaimedById로 1회만
- 저장은 microtask 병합, 실패 시 SAVE_FAILED 이벤트 → 토스트 (크래시 없음)
- v2 도입 시 `migrate()`에 `migrateSaveV1ToV2` 추가

## 콘텐츠 스키마

`public/content/v1/ko/` 7종 — 파일별 구조는 각 JSON 참조. 공통 규칙:
`schemaVersion`, `missionId`, `needsReview: true`, 사실 레코드 `factConfidence`,
피드백은 부족한 이유+단서+재도전 형식. 문화 사례는 지역·맥락 명시, 단정 표현 금지.
콘텐츠 검증은 tests/sim.test.ts(시뮬 계수 결정론·균형 전략 2+·만능 전략 0), tests/dialogue.test.ts(분기 도달성·caution 필수)가 담당.

## 에셋 매니페스트

`src/content/asset-manifest.json` — semantic id(`bg.map`, `plane.main`, `greeting.nepal` …) → `{src, original, pages, preload, alpha, license, note}`.
- 코드는 `assetUrl(id)`/`hasAsset(id)`만 사용 (경로 문자열 하드코딩 금지)
- 누락 id는 경고 + 투명 픽셀 폴백 (게임 중단 없음), 아이콘 누락분은 SVG 대체
- 재생성: `npm run assets` (scripts/asset-map.json 기준, 원본 무수정)

## 오디오

- BGM: `bgm.main` + 대륙 5곡, 400ms crossfade, 첫 포인터/키 입력 후 unlock
- SFX: `sfx_{tap,pickup,drop,success,partial,stamp,complete,whoosh,beat_low,beat_high}.mp3`, 80ms 스로틀로 중첩 방지, 로드 실패 시 무음 진행
- 리듬 시퀀서: `audio.playBeat()` WebAudio 합성(파일 불요, 결정론) + 시각 박자점 병행 — 무음 완주 보장
- 음소거·모션 감소는 저장에 지속

## 성능 예산 (목표치, 보장 아님)

- 초기 필수 다운로드 5~8MB (현재: core 이미지 0.6MB + 폰트 1.9MB + JS)
- 이미지 총량 3.8MB (WebP, 배경 1600w/카드 512/아이콘 256)
- 저사양 태블릿 30fps / 일반 45~60fps, devicePixelRatio 상한 1.5
- Phaser는 필요 페이지에서만 로드, 장면 종료 시 완전 파괴

## 오류 처리

전역 error/unhandledrejection 로깅, 라우터 레벨 페이지 로드 실패 폴백 화면,
저장 실패 토스트, 콘텐츠 로드 실패 시 페이지별 기본값 또는 오류 안내.

## 테스트 전략

- 단위(vitest): 저장 검증·복구, 점수 결정론, 해금 규칙, 보상 중복, 시뮬 계수, 대화 분기 — `npm test`
- 통합(수동): QA_CHECKLIST.md 절차 — 전체 플레이, 새로고침 복구, 직접 URL, 연속 클릭, 무음, 해상도 3종
- `npm run verify` = typecheck + test + build

## 배포·복구

- 정적 빌드(dist/) — Vercel/GitHub Pages 등 아무 정적 호스팅. base './' 상대 경로라 하위 경로 배포 가능
- 원격: github.com/yelmovie/world-connection-journey (원본 대용량 에셋은 로컬 보존, 최적화본만 버전 관리)
- 복구: 코드는 git, 콘텐츠는 public/content 버전 폴더, 에셋은 scripts/asset-map.json으로 원본에서 재생성 가능
- 유지보수 1년 체크: 의존성은 lockfile 고정, 저장 마이그레이션 함수 자리 마련, 콘텐츠는 contentVersion 폴더 추가 방식
