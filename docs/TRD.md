# TRD — 세계를 잇는 여행

## 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite 7 + TypeScript 5 (strict, noUncheckedIndexedAccess) | 정적 배포, 빠른 HMR |
| 게임 캔버스 | Phaser 3 (세계지도에서만 동적 import) | 지도 연출·비행기 트윈; 작은 화면은 DOM 목록으로 대체 |
| UI | 바닐라 DOM + CSS + 인라인 SVG | 한글 텍스트·접근성·인쇄, React 불필요 |
| 오디오 | HTMLAudio(BGM crossfade) + WebAudio(SFX·합성 타악기) | 리듬 시퀀서 정밀 스케줄링 |
| 저장 | localStorage (schema v1) | 서버 없음, 개인정보 최소화 |
| 테스트 | Vitest (node 환경) | 결정론 로직·콘텐츠 검증 |
| 3D | 예약 슬롯만 (`src/ui/threeSlot.ts`) | Three.js 의존성·GLB 0개 — `passport-stamp`→`prop.stamp`, `completion-globe`→`reward.globe_puzzle` 이미지 폴백 표시 |

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
tests/                    save/scoring/unlock/reward/sim/dialogue/content (7파일·32테스트)
docs/                     본 문서 4종
_unused/duplicates/       MD5 동일 중복 원본 23장 (삭제 아님, 이동 보관)
```

## 책임 분리

- **Phaser**: 지도 배경·항로 점선·비행기 트윈(2p)만 담당한다. 1280×720 논리 캔버스를 contain 방식으로 표시하며, `unmount()`에서 `game.destroy(true)`한다. 폭 600px 이하 compact 지도는 Phaser를 만들지 않고 DOM 목록만 사용한다.
- **DOM/SVG**: 한글 텍스트·버튼·카드·대화창·게이지·수료증과 모든 미션 조작을 담당한다. 타이틀 로고 이미지를 제외하면 학습 텍스트를 이미지에 굽지 않으며, 드래그에는 키보드·탭 선택 대체 조작을 제공한다.
- **통신**: `src/core/EventBus.ts`의 타입 지정 EventMap만 사용. 이벤트 이름 상수는 이 파일 단일 소스.

이벤트: `SCENE_READY, REQUEST_SCENE_CHANGE, MISSION_START, MISSION_CHECKPOINT, MISSION_FEEDBACK, MISSION_COMPLETE, SCORE_UPDATED, OPEN_DIALOGUE, CLOSE_DIALOGUE, PROFILE_UPDATED, SAVE_COMPLETED, SAVE_FAILED, AUDIO_SETTING_CHANGED, MODAL_OPENED, MODAL_CLOSED`

## 라우팅·가드

해시 라우터(`#/map` 등) — 정적 호스팅에서 리라이트 불필요.
- 전환 가드: `isTransitioning` + 300ms 디바운스 (빠른 연속 클릭에 화면 중복 열림 방지)
- 접근 가드(`guard()`): 프로필 없으면 여권으로, 대화는 5대륙 완료 시, `#/completion`은 `recomputeUnlocks()` 재계산 통과 시만. 저장값의 unlocked를 신뢰하지 않는다 (2차 방어는 completion 페이지 mount에서 재검사).

## 저장 스키마 (v1)

키 `world_connection_journey.save.v1`. 타입은 `src/types.ts`의 `GameSaveV1`:
profile(별명·아바타·비행기·탐험질문) / missions(미션ID별 status·checkpointId·bestScore·attempts·scoreDimensions·data) /
stamps / settings(bgm·sfx·reducedMotion) / completion(unlocked·reflection·actionPrinciples·certificateIssued·placedPuzzlePieceIds·reflectionDrafts) /
rewardClaimedById(보상 중복 방지) / lastRoute / updatedAt

안전장치:
- `validateSave()` 필드 단위 검증·복구, 손상 원문은 `…corrupt-backup`에 백업
- 해금 상태는 `recomputeUnlocks()`로 항상 재계산 (저장 조작 무력화)
- `completeMission()` — attempts 증가, bestScore max 갱신, 스탬프·보상은 rewardClaimedById로 1회만
- 저장은 microtask 병합, 실패 시 SAVE_FAILED 이벤트 → 토스트 (크래시 없음)
- v2 도입 시 `migrate()`에 `migrateSaveV1ToV2` 추가

### 미션 체크포인트

| 미션 | 저장되는 체크포인트 |
|---|---|
| 아시아 | `observe` → `round2` → `round3` |
| 유럽 | `sources` → `route` → `second_route` (서로 다른 두 경로 비교) |
| 아프리카 | `context` → `r1` → `r2` → `r3` |
| 아메리카 | `profiles` → `classify` → `plan` → `alt`(선택) |
| 오세아니아 | `stage1` → `stage2` → `stage3` |
| 대화 | `stage1` → `stage2` → `stage3` |

## 콘텐츠 스키마

`public/content/v1/ko/` 7종 — 파일별 구조는 각 JSON 참조. 공통 규칙:
`schemaVersion`, `missionId`, `needsReview: true`, 사실 레코드 `factConfidence`,
피드백은 부족한 이유+단서+재도전 형식. 문화 사례는 지역·맥락 명시, 단정 표현 금지.
콘텐츠 검증은 `tests/content.test.ts`(7개 JSON 스키마·위험 문자열·중첩 구조), `tests/sim.test.ts`(오세아니아 시뮬 계수 결정론·균형 전략 2+·만능 전략 0), `tests/dialogue.test.ts`(분기 도달성·caution 필수)가 담당한다. 유럽 JSON에는 판단 태그가 아직 없어 화면 코드가 안정 ID 집합으로 자료 역할을 분류한다. 기능은 안정적이지만 콘텐츠 교체 시 코드를 함께 확인해야 하는 유지보수 경고다.

모든 콘텐츠 파일은 `needsReview: true`다. 현재 성취기준·학습목표 연결은 기록돼 있지만 교육 내용 출처, 검토자, 라이선스 메타데이터는 완비되지 않았다. 공식 수업·공개 배포 전 교사 검토와 출처 보강이 필요하다.

## 에셋 매니페스트

`src/content/asset-manifest.json` — semantic id(`bg.map`, `plane.main`, `greeting.nepal` …) → `{src, original, pages, preload, alpha, license, note}`.
- 코드는 `assetUrl(id)`/`hasAsset(id)`만 사용 (경로 문자열 하드코딩 금지)
- 누락 id는 경고 + 투명 픽셀 폴백 (게임 중단 없음), 아이콘 누락분은 SVG 대체
- 재생성: `npm run assets` (scripts/asset-map.json 기준, 원본 무수정)

## 오디오

- BGM: `bgm.main` + 대륙 5곡, 400ms crossfade, 첫 포인터/키 입력 후 unlock
- SFX: `sfx_{tap,pickup,drop,success,partial,stamp,complete,whoosh,beat_low,beat_high}.mp3` 10종. 같은 효과음의 빠른 중복을 중단하고 in-flight 디코딩을 재사용하며, 로드 실패 시 무음 진행
- 리듬 시퀀서: `audio.playBeat()` WebAudio 합성(파일 불요, 결정론) + 시각 박자점 병행 — 무음 완주 보장
- 음소거·모션 감소는 저장에 지속

## 성능·번들 실측

- production `dist/`: 92파일, 21.219MiB. 이미지 WebP 47개 3.797MiB, 폰트 3개 1.836MiB, BGM 6개 13.733MiB, SFX 10개 0.417MiB다. 전체 용량은 초기 화면 전송량이 아니며 오디오는 페이지 진입·재생 시 로드된다.
- 앱 초기 JS 청크: 20.40kB(gzip 7.56kB). Phaser lazy 청크: 1208.48kB(gzip 332.40kB). 미션 청크도 라우트별로 분리된다.
- 로딩 화면을 표시하고 Phaser는 지도에서만 지연 로드한다. 작은 지도에서는 캔버스를 만들지 않는다.
- 런타임 에셋·폰트·오디오는 로컬 파일이며 확인한 플레이에서 외부 요청이 없었다.
- devicePixelRatio 상한은 구현하지 않았다. 학교 기기 FPS·초기 로딩 시간·학교 Wi-Fi 전송 속도는 실측하지 않았으므로 수치를 보장하지 않는다.

## 오류 처리

전역 error/unhandledrejection 로깅, 라우터 레벨 페이지 로드 실패 폴백 화면,
저장 실패 토스트, 콘텐츠 로드 실패 시 페이지별 기본값 또는 오류 안내.

## 테스트 전략

- 단위(vitest): 저장 검증·복구, 점수 결정론, 해금 규칙, 보상 중복, 시뮬 계수, 대화 분기, 콘텐츠 스키마·안전 문자열 — 7파일·32테스트
- 통합(수동): QA_CHECKLIST.md 절차 — 전체 플레이, 새로고침 복구, 직접 URL, 연속 클릭, 대표 뷰포트
- `npm run verify` = typecheck + test + build

## 배포·복구

- 정적 빌드 `dist/`와 `base: './'`를 사용하며 해시 라우터라 서버 리라이트 의존은 낮다. 다만 실제 호스팅의 하위 경로·직접 접근은 아직 검증하지 않았다.
- 현재 `git remote -v` 결과는 비어 있고 배포 서비스도 구성되지 않았다. 특정 GitHub 저장소나 배포 URL을 문서의 확정 사실로 간주하지 않는다.
- 복구: 코드는 git, 콘텐츠는 `public/content` 버전 폴더, 에셋은 `scripts/asset-map.json`으로 원본에서 재생성 가능하다.
- 의존성은 lockfile로 고정하고, 저장은 마이그레이션 경로를 마련했으며 콘텐츠는 버전 폴더를 추가하는 방식이다.
- 배포 전 필수: 콘텐츠 출처·검토자·라이선스 보강, 실제 URL에서 직접 딥링크/새로고침/저장 smoke test, 학교망·실기기·회전 검증.
