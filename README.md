# 세계를 잇는 여행 (World Connection Journey)

초등학교 6학년 사회과(6-2 '지구촌 사람들') 다문화·세계지리 교육 웹게임.
학생은 다섯 대륙의 생활 자료를 조사하고, 존중하는 대화를 연습하며
**관찰 → 증거 찾기 → 가설 세우기 → 질문하기 → 경청하기 → 판단 수정하기**의 학습 순환을 경험한다.

첫 방문 흐름은 **타이틀 → 여행자 여권 → 세계 항로 지도**이며, 지도에서 다섯 대륙을 자유 순서로 완료한 뒤 대화 미션과 인증 화면이 열린다. 아래 번호는 기획상의 10페이지 번호다.

## 성취기준 연계 (2022 개정 교육과정)

| 교과 | 성취기준 | 게임 연계 |
| -- | -- | -- |
| 사회 | **[6사09-01]** 세계를 표현하는 다양한 공간 자료의 특징을 이해하고, 지구본과 세계지도에서 위치를 표현하는 방법을 익힌다. | 세계지도 탐색과 대륙·지역 위치 찾기 (2p 세계 항로 지도) |
| 사회 | **[6사09-02]** 세계 주요 대륙과 대양을 파악하고, 우리나라 및 세계 여러 국가의 위치와 영토의 특징을 이해한다. | 대륙별 여행 경로와 지역 탐색 (2·5p) |
| 사회 | **[6사10-01]** 세계의 여러 지역의 지형 경관을 살펴보고, 이를 통해 다양한 삶의 모습을 이해한다. | 지역 환경과 생활문화 연결 (4~8p 대륙 미션) |
| 사회 | **[6사10-02]** 세계의 다양한 기후를 알아보고 기후 환경과 인간 생활 간의 관계를 탐구한다. | 기후·의식주·생활방식 탐구 (4·8p) |
| 사회 | **[6사12-02]** 지구촌을 위협하는 다양한 문제들을 파악하고, 지속 가능한 미래를 위한 해결 방안을 탐색한다. | 오세아니아 환경·공동체 3턴 시뮬레이션 (8p) |

> 게임 한 번의 플레이가 성취기준을 완전히 달성하는 것은 아니며, 수업의 탐구·토론 활동과 함께 사용하는 보조 도구다.
> 각 미션의 학습목표·활동·피드백은 `public/content/v1/ko/*.json`에 성취기준과 연결되어 기록돼 있다.

## 10페이지 구성

| # | 경로 | 화면 | 핵심 조작 |
|---|---|---|---|
| 1 | `#/` | 타이틀 | 새 여행 / 이어하기 / 설정 |
| 2 | `#/map` | 세계 항로 지도 | 대륙 핫스폿 선택, 비행기 이동, 진행 상태 |
| 3 | `#/passport` | 여행자 여권 | 별명·아바타·탐험 질문, 도장 확인 |
| 4 | `#/mission/asia` | 아시아: 하루 읽기 | 타임라인 배치, 사실·해석·확인필요 분류, 존중 질문 조립 |
| 5 | `#/mission/europe` | 유럽: 흔적과 오늘 | 자료 읽기, 목적이 다른 두 경로 설계·비교 |
| 6 | `#/mission/africa` | 아프리카: 소리의 대화 | 맥락 읽기, 8칸 리듬 재구성·비교, 콜 앤 리스폰스 |
| 7 | `#/mission/americas` | 아메리카: 함께 만드는 하루 | 필요/선호 분류, 제약 일정 조립, 선택형 대안 비교 |
| 8 | `#/mission/oceania` | 오세아니아: 섬과 바다 | 핫스폿 조사, 관점 카드, 3턴 환경 시뮬레이션 |
| 9 | `#/mission/respect-dialogue` | 다름을 잇는 대화 | 인사 사례 매칭, 경청, 공감 나침반 분기 대화 (5대륙 완료 시 해금) |
| 10 | `#/completion` | 세계 연결 인증 | 퍼즐 지구본, 회고, 실천 약속, 인쇄용 수료증 |

## 실행

```bash
npm install
npm run dev        # 개발 서버 (localhost:5173)
npm run build      # production 빌드 (dist/)
npm run verify     # typecheck + test + build
npm run assets     # 원본 에셋 → public/assets WebP 재생성
```

## 기술 개요

- **스택**: Vite + TypeScript + Phaser 3 + 바닐라 DOM/CSS/SVG (React·서버 없음)
- **저장**: `localStorage` 키 `world_connection_journey.save.v1` — 손상 시 백업 후 기본값 복구, 해금 상태는 항상 재계산
- **오디오**: BGM 6곡(`public/sound/bgm`) crossfade, SFX 10종, 리듬 시퀀서는 시각 박자와 합성 타악기를 함께 사용
- **에셋**: 원본은 `assets/` 등에 보존, 빌드 이미지 WebP 47개(3.797MiB). 매핑은 `src/content/asset-manifest.json`
- **3D**: Three.js 의존성·GLB는 아직 없다. `passport-stamp`와 `completion-globe` 예약 위치에서 `prop.stamp`, `reward.globe_puzzle` 이미지를 폴백으로 표시한다.
- **검증**: `npm run verify` 통과 — Vitest 7파일·32테스트, TypeScript 타입 검사, production 빌드
- **네트워크**: 런타임 에셋·폰트·오디오는 모두 로컬이며 외부 요청이 없다. PWA 오프라인 캐시는 포함하지 않는다.
- **문화적 안전성**: 단일 문화 단정 금지, 사례화 표현, 모든 콘텐츠 `needsReview: true`. 교육 내용 출처·검토자·라이선스 메타데이터가 아직 완비되지 않아 **교사 검수와 출처 보강 전 공식 수업·공개 배포는 조건부**다.

자세한 구조는 [docs/TRD.md](docs/TRD.md), 범위는 [docs/MVP_SPEC.md](docs/MVP_SPEC.md), 에셋 목록은 [docs/ASSET_AUDIT.md](docs/ASSET_AUDIT.md), 점검 항목은 [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) 참고.

## 새 스테이지(미션) 추가 방법

새 미션 하나는 **콘텐츠 JSON → 페이지 모듈 → 라우트·타입 등록 → 테스트** 4단계로 추가한다. 아래 경로와 예시는 모두 현재 저장소에 실존하는 파일 기준이다.

### ① 콘텐츠 JSON 작성 — `public/content/v1/ko/<missionId>.json`

`src/core/ContentRepository.ts`의 `loadContent()`가 `content/v1/ko/<name>.json`을 fetch해서 검증한다. 공통 필수 필드는 `schemaVersion: 1`, `missionId`, `needsReview: true`, `standards`(성취기준 배열), `learningObjectives`(1개 이상)이며, 미션별 라운드 구조는 기존 파일(`asia.json`, `oceania.json` 등)을 스키마 예시로 참조한다. HTML 삽입·위험 식별자는 `validateContentDocument()`가 거부하므로 텍스트만 넣는다.

### ② 페이지 모듈 생성 — `src/pages/mission<Name>.ts`

`src/router.ts`의 `Page` 인터페이스(`mount`/`unmount`)를 구현하는 `createPage()` 함수를 export한다. 패턴은 기존 미션 페이지(`missionAsia.ts`, `missionOceania.ts`)를 따른다:

```ts
// 기존 미션 페이지의 공통 골격 (missionOceania.ts 참고)
const content = await loadContent<MyContent>('mymission');   // ① 콘텐츠 로드
await preloadImages(['bg.mymission', /* semantic ID들 */]);  // 이미지 프리로드
audio.playBgm('...');                                        // BGM 전환
```

배경·캐릭터 이미지는 `src/content/asset-manifest.json`에 semantic ID를 등록한 뒤 `assetUrl()`/`hasAsset()`으로만 참조한다(경로 하드코딩 금지).

### ③ 라우트·타입 등록 — `src/router.ts` + `src/types.ts`

- `src/router.ts`의 `routes`에 lazy import 한 줄 추가:
  `'#/mission/mymission': () => import('./pages/missionMymission')`
- `src/types.ts`의 `MissionId` 유니언과 `MISSION_IDS` 배열에 새 ID를 추가한다. 대륙형 미션이면 `CONTINENT_IDS`에도 추가한다 — 이 두 배열이 `src/core/SaveRepository.ts`의 저장 기본값 생성, 도장(stamps) 계산, 대화·인증 해금 재계산을 모두 구동하므로 별도 저장 코드는 필요 없다.

### ④ 테스트 추가 후 검증 — `tests/` + `npm run verify`

`tests/content.test.ts`가 배포 콘텐츠 전체를 import해서 공통 스키마·`needsReview`·학습목표를 검증하므로, 새 JSON을 `actualFiles` 목록에 추가한다. 미션 고유 로직(점수·시뮬레이션)은 `tests/sim.test.ts`, `tests/unlock.test.ts` 패턴으로 추가한다. 마지막으로:

```bash
npm run verify   # typecheck + vitest + production build
```

## 라이선스·출처

- 이미지·BGM: 프로젝트 자체 제작(AI 생성) 에셋
- 효과음·폰트 출처: [assets/CREDITS.md](assets/CREDITS.md) (Jua — SIL OFL, Pretendard — SIL OFL)
- 개인정보: 서버 전송 없음. 별명 등 모든 데이터는 사용자의 기기(localStorage)에만 저장

## 현재 배포 상태

로컬 MVP 기능과 production 빌드는 검증했다. 현재 저장소에는 Git 원격이 설정되어 있지 않고 호스팅도 구성·검증하지 않았으므로, 배포 URL·직접 딥링크·학교망과 실제 기기 검증은 배포 전에 별도로 수행해야 한다.
