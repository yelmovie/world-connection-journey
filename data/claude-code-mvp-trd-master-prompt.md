# 클로드코드 전달용 MVP 구현·TRD 마스터 프롬프트

아래 내용을 현재 프로젝트 루트에서 그대로 실행 지침으로 사용하라.

---

## 역할과 최종 목표

너는 기존 코드를 안전하게 복구하면서 실제로 플레이 가능한 태블릿 웹 교육게임 MVP를 완성하는 수석 게임 엔지니어이자 기술 설계자다.

프로젝트명은 **「세계를 잇는 여행」**이다. 제목은 정확히 이 한글 9글자(띄어쓰기 포함)를 사용한다. 대상은 초등학교 고학년~중학생이며, 국기·수도·음식 암기나 단순 카드 맞히기를 반복하는 게임이 아니다. 학생이 화면을 직접 조작하며 관찰하고, 단서를 연결하고, 가설을 수정하고, 여러 관점을 비교하고, 경청과 공감의 결과를 경험해야 한다.

이번 작업의 결과는 다음 세 가지를 동시에 만족해야 한다.

1. 현재 폴더의 코드·JSON·샘플 화면·배경·아이콘·캐릭터·음악·효과음을 전수 확인하고 최대한 재사용한다.
2. 1~10페이지가 연결된 **end-to-end MVP**를 실제로 실행 가능하게 구현한다.
3. 12개월 동안 수정·에셋 교체·콘텐츠 추가·브라우저 업데이트에 대응할 수 있는 **TRD와 유지 구조**를 코드와 문서로 남긴다.

계획서만 작성하고 멈추지 마라. 먼저 읽기 전용 진단을 마친 뒤, 중대한 차단 사유가 없다면 작은 단위로 구현하고 각 단계에서 검증하라. 다만 현재 사용자 파일을 훼손하거나 대규모 재작성하지 마라.

---

## A. 현재 전달 자료에서 확인된 기준

현재 전달본에는 다음 설계 파일이 있다. 실제 프로젝트 루트에서 이름이 약간 달라도 내용과 역할을 확인해 연결하라.

- `world-map-multicultural-page-prompts.json`
  - 최신 최종 설계다.
  - 프로젝트 제목, 1~10페이지, 학습 목표, 화면 구성, 저장 계약, 에셋 계획, 채점, 문화 안전, 검수 기준의 최우선 근거다.
- `world_passport_game_design_v1.json`
  - 이전 설계다.
  - 저장 안정성, 오류 복구, 교사 기능, 테스트, 유지보수 중 최신 설계와 충돌하지 않는 항목만 참고한다.
  - 예전 제목과 `WORLD LINK`, `GEO SCAN`, `FLAG LAB` 등의 이전 페이지 구조를 최종 UI에 복원하지 않는다.
- `antigravity-recovery-master-prompt.md` 또는 유사 이름의 복구 프롬프트
  - 비파괴 진단, 기존 코드 보존, 에셋 재사용, 저장 마이그레이션, Scene 수명주기, 성능·접근성 원칙을 계승한다.

전달된 이미지 스냅샷에는 독립 PNG 에셋과 다음 3D 변환 참고 이미지들이 존재한다.

- `assets/meshy-references/character_explorer_base.png`
- `assets/meshy-references/aircraft_world_traveler.png`
- `assets/meshy-references/prop_globe_blank.png`
- `assets/meshy-references/prop_passport_open.png`
- `assets/meshy-references/portal_continent_gateway.png`
- `assets/meshy-references/prop_empathy_compass.png`
- `assets/meshy-references/prop_puzzle_globe.png`
- `assets/meshy-references/prop_world_map_table.png`
- `assets/meshy-references/prop_passport_stamp.png`
- `assets/meshy-references/reward_world_connector_badge.png`

`generated_images`처럼 자동 생성 ID 이름을 가진 파일에는 정확한 제목, 예전 제목, 어린이 캐릭터, 아이콘, 3D 참고 이미지의 중복본이 섞여 있을 수 있다. 파일명만 보고 용도를 추측하지 말고 이미지를 실제로 열어 본 뒤 semantic id에 연결하라. 해시가 같은 파일은 중복 후보로만 기록하고 이번 작업에서 삭제하지 마라. `assets/meshy-references`의 이름 있는 파일은 3D 참고 이미지 또는 2.5D fallback의 우선 후보로 삼는다.

현재 전달 스냅샷에서는 별도 `pagesample` 디렉터리와 실제 오디오 파일이 확실하게 확인되지 않았다. 그러나 사용자의 실제 프로젝트에는 더 많은 파일이 있을 수 있으므로 반드시 다시 검색한다. 없을 경우 임의 파일명이나 깨진 URL을 만들지 말고 `docs/content-gaps.md`에 누락을 기록하고, 화면은 안전한 시각·무음 fallback으로 동작하게 한다.

자료 충돌 시 우선순위는 다음과 같다.

1. 이 프롬프트의 비파괴·안전 지침
2. `world-map-multicultural-page-prompts.json`
3. 페이지별 샘플 화면의 시각적 위계와 배치
4. 실제 존재하고 정상 표시되는 에셋
5. 정상 동작 중인 기존 코드와 저장 호환성
6. 이전 JSON의 비충돌 보조 항목

샘플 화면과 최신 JSON이 충돌하면 **레이아웃·크기 비율·색감·깊이감은 샘플**, **학습 내용·진행 조건·저장·채점·접근성은 최신 JSON**을 따른다.

---

## B. 절대 금지와 안전 규칙

1. 프로젝트 전체를 새로 만들거나 기존 프레임워크를 임의 교체하지 마라.
2. `rm -rf`, `git reset --hard`, `git clean`, 사용자 변경 stash, 미커밋 파일 덮어쓰기, 무단 브랜치 삭제를 금지한다.
3. 기존 파일을 삭제하지 마라. 사용되지 않는 것처럼 보여도 참조를 확인하고 `삭제 후보`로만 보고한다.
4. lockfile을 임의 삭제·재생성하지 마라. 의존성을 전부 최신 major로 올리지 마라.
5. 현재 정상 동작 기능, 라우트, 저장키, 에셋 경로를 무단 변경하지 마라.
6. 같은 역할의 새 서비스·컴포넌트·유틸리티를 중복 생성하지 마라. 먼저 `rg`로 기존 구현을 찾고 재사용·보강한다.
7. `Button2`, `NewScene`, `GameSceneCopy`, `utils-new`, `final-final` 같은 임시 중복 이름을 만들지 마라.
8. 빌드 오류를 숨기기 위해 테스트, 타입 검사, lint 규칙, 기존 코드를 삭제하지 마라.
9. 사실을 추측해서 문화 콘텐츠를 채우지 마라. 출처가 없으면 `검수 필요` 상태로 분리한다.
10. 외부 API, 원격 DB, 생성형 AI 호출을 핵심 플레이의 필수 런타임 의존성으로 추가하지 마라.
11. 이미지에 한글 본문·버튼·점수·말풍선·카드 UI를 굽지 마라. 제목 에셋 외 텍스트는 DOM/CSS/SVG로 만든다.
12. 새 콜라주, 콘택트시트, 합본, 에셋 시트를 만들지 마라. `1이미지=1에셋`을 유지한다.
13. GLB가 없는데 PNG를 GLB처럼 로드하지 마라. 2.5D PNG fallback으로 완성한다.
14. Three.js와 Phaser를 숨겨진 상태에서 동시에 계속 렌더링하지 마라.
15. 모든 에셋과 음악을 앱 시작 시 한꺼번에 preload하지 마라.
16. 단순 카드 뒤집기, 국기-나라 짝맞추기, 4지선다만으로 다섯 스테이지를 구성하지 마라.
17. 빠른 손놀림과 제한 시간으로 학습 성취를 결정하지 마라. 속도 보너스는 전체 5점 이내다.
18. 국가·대륙·언어·종교·인종을 같은 개념으로 취급하거나 국가별 인사법을 유일한 규칙처럼 제시하지 마라.
19. 사용자의 요청 없이 배포, 원격 push, PR 생성, 저장소 초기화를 하지 마라.

---

## C. 1단계 — 변경 전 읽기 전용 진단

코드를 수정하기 전에 다음을 수행하고 `docs/recovery-baseline.md`에 날짜가 포함된 새 섹션으로 기록하라. 기존 문서를 덮어쓰지 않는다.

### C1. 프로젝트·Git 진단

- `git status`, 현재 브랜치, HEAD, 미커밋 파일을 확인한다.
- 실제 기술 스택, 언어, 패키지 매니저, 번들러, 라우터, 상태 관리, Phaser/Three.js 사용 여부를 확인한다.
- `package.json`, lockfile, ts/js config, lint/format config, 테스트 설정, 배포 설정, `.env.example`, README를 읽는다.
- 기존 install, typecheck, lint, test, build 명령을 그대로 실행해 수정 전 기준을 남긴다.
- 실패하면 원문 오류와 재현 명령을 기록한다. 실패를 숨기지 않는다.

### C2. 코드 구조 진단

- 10개 페이지/route, Phaser Scene, DOM UI, EventBus, 저장 서비스, 오디오 서비스, 에셋 로더의 현재 구현을 목록화한다.
- 같은 역할의 중복 구현과 순환 의존성을 찾되 삭제하지 않는다.
- 모든 EventBus 이벤트 이름과 구독 해제 위치를 확인한다.
- Scene 전환, 뒤로가기, 새로고침, 빠른 연타, 비동기 로딩 중 이탈에서 중복 Scene·중복 모달·중복 보상이 생기는지 확인한다.
- localStorage/IndexedDB 키, 저장 스키마, 파싱 실패 처리, migration 유무를 확인한다.

### C3. 에셋·샘플 화면·오디오 진단

다음 이름 패턴과 확장자를 프로젝트 전체에서 검색한다.

- 샘플: `pagesample`, `page-sample`, `sample`, `mockup`, `reference`, `screen`, `page`, `design`
- 이미지: PNG, WebP, JPG, SVG
- 3D: GLB, GLTF, KTX2, HDR
- 오디오: OGG, MP3, M4A, WAV
- 설계: JSON, Markdown

각 에셋에 대해 경로, 해상도, 파일 크기, 실제 alpha 유무, 예상 semantic id, 사용 페이지, 현재 import 위치, 중복 해시, 검수 상태를 기록한다. 자동 생성 ID 파일은 실제 미리보기를 열어 확인한다.

결과는 `docs/asset-inventory.md`에 다음 열을 가진 표로 남긴다.

| semantic id | 실제 경로 | 유형 | 크기/해상도 | alpha | 사용 페이지 | 현재 참조 | 중복 후보 | 검수 상태 |
|---|---|---|---|---|---|---|---|---|

샘플 화면이 있으면 1~10페이지에 매핑하고 `docs/page-sample-audit.md`에 다음을 기록한다.

- 샘플 경로와 대응 route
- 배경/전경/중경 구조
- 제목, 히어로 오브젝트, 좌우 패널, 하단 행동 영역의 상대적 크기
- 보라 `#6C4CE8`, 하늘색 `#2588E8`, 청록 `#10C3C8`, 산호 `#F26D6D`, 금색 `#F2C14E`, 남색 `#19324D`, 크림 `#FFF9EA`의 사용 비율
- 라운드, 테두리, 그림자, 여백, 정보 밀도
- 실제 구현에서 DOM으로 다시 만들 텍스트와 조작 요소
- 누락·충돌·재사용 가능한 에셋

샘플 화면이 없으면 최신 JSON의 각 `sample_screen_image_prompt`를 시각 기준으로 사용하고 그 사실을 명시한다.

### C4. 진단 후 진행 조건

- 현재 앱 코드가 있으면 기존 스택을 유지한다.
- 앱 코드 없이 자료만 있는 폴더라면 그 사실을 먼저 기록한 뒤, 기존 파일을 건드리지 않는 최소 앱 구조를 만든다.
- 패키지 매니저가 없을 때만 npm을 선택한다.
- 새 앱이 꼭 필요한 경우 기본은 Vite + TypeScript + Phaser 3 + 바닐라 DOM/CSS다. React는 이미 사용 중일 때만 유지·활용한다.
- Three.js는 기존에 있고 실제 공간 상호작용 또는 GLB 미리보기가 필요할 때만 유지한다. MVP를 위해 새로 강제 도입하지 않는다.

---

## D. MVP 제품 정의

### D1. MVP 완료 정의

MVP는 정적인 10개 화면 모음이 아니다. 아래가 모두 실제로 동작해야 한다.

- 1페이지에서 새 여행 또는 이어하기
- 3페이지에서 개인정보를 최소화한 여행자 프로필 생성
- 2페이지 세계지도에서 5개 대륙 스테이지를 자유 순서로 선택
- 4~8페이지에서 각기 다른 핵심 조작으로 하나 이상의 완결된 미션 수행
- 각 스테이지 체크포인트 자동 저장, 중간 이탈 후 이어하기
- 다섯 대륙 완료 후 9페이지 해금
- 9페이지에서 관찰→질문→경청→수정의 대화 미션 수행
- 완료 조건 검증 후 10페이지에서 회고, 보상, 인증서 미리보기
- 새로고침·뒤로가기·빠른 연타에도 중복 보상과 Scene 중첩이 없음
- 오디오가 없어도 전체 플레이 가능
- 1024×576 태블릿 가로 화면에서 핵심 UI가 잘리지 않음

각 대륙 스테이지에는 최소한 다음이 있어야 한다.

1. 서로 다른 조작 동사 2개 이상
2. 선택 결과를 확인하는 피드백 또는 시뮬레이션
3. 처음 답을 수정할 수 있는 재도전 루프
4. 체크포인트 2개 이상
5. 단일 정답이 아닌 부분 점수 또는 복수 유효 전략

카드는 정보를 제시하거나 움직이는 조각으로 사용할 수 있지만, 다섯 스테이지의 핵심 메커닉을 모두 카드 뒤집기·짝맞추기로 만들지 않는다. 카드 짝맞추기가 들어가더라도 전체 미션의 짧은 보조 단계로만 사용한다.

### D2. 권장 한 차시 흐름

- 도입·프로필·지도: 6~8분
- 선택한 대륙 스테이지 2~3개: 각 4~6분
- 9페이지 대화 미션: 5~6분
- 회고·인증: 3~4분

모든 대륙을 한 차시에 강제하지 않는다. 진행 저장을 통해 2차시 확장이 가능해야 한다.

---

## E. 페이지별 화면·기능·게임 메커닉 계약

다음 조합을 기본 설계로 사용하되, 기존 구현이 더 안정적이고 학습 목표를 충족하면 그 구조를 보강해도 된다. 변경 시 이유를 `docs/MVP.md`에 기록한다.

### 1페이지 — `p01_title` / `/`

**화면 구성**

- 샘플 화면의 중앙 히어로 구도를 최대한 유지한다.
- 정확한 제목 이미지 `세계를 잇는 여행`을 사용하되, 이미지 글자가 틀렸거나 예전 제목이면 사용하지 않는다.
- 비행기, 지구본/항로, 구름을 전경·중경·후경으로 분리해 2.5D 깊이감을 만든다.
- 버튼은 DOM으로 만든다: `새 여행 시작`, `이어하기`, `설정`.

**조작**

- 비행기가 항로를 따라 천천히 이동하고 사용자가 포인터를 움직이면 배경이 아주 약하게 parallax 된다.
- `prefers-reduced-motion`에서는 이동을 정지하거나 최소화한다.
- 저장 데이터가 없으면 이어하기를 비활성화하고 이유를 텍스트로 안내한다.

### 2페이지 — `p02_world_map` / `/map`

**핵심 메커닉: 탐험 허브 + 항로 미리보기**

- 한국을 정중앙에 둔 태평양 중심 세계지도 배경 위에 한국 출발점과 5개 대륙 포털을 Phaser 또는 SVG hit area로 배치한다.
- 한 번 탭하면 선택·미리보기, 두 번째 탭 또는 DOM `탐험 시작` 버튼으로 진입한다.
- 작은 비행기가 선택 포털까지 점선 항로를 따라 이동한다.
- 상태는 `not_started`, `in_progress`, `completed`, `mastered`이며 색뿐 아니라 아이콘과 텍스트로 구분한다.
- 프로필 완료 후 대륙 순서는 자유 선택이다.

**주의**

- 대륙과 국가를 같은 개념으로 보이게 하지 않는다.
- 기본 화면에서 5개 포털이 모두 접근 가능해야 하며, 불필요한 지도 확대·패닝을 강제하지 않는다.

### 3페이지 — `p03_passport_profile` / `/passport`

**핵심 메커닉: 여권 꾸미기 + 탐험가·비행기 선택**

- 별명 → 탐험가 → 비행기의 세 단계로 구성하고, 고른 캐릭터와 비행기를 미리보기로 보여 준다.
- 닉네임은 실명이 아니어도 된다. 아바타와 비행기 선택은 능력치에 영향을 주지 않는다.
- 선택한 파츠는 기존 독립 이미지 레이어 또는 CSS 색상으로 조합한다. 새 합본 이미지를 만들지 않는다.
- 마지막에 도장을 직접 드래그해 여권에 찍는 짧은 확정 상호작용을 넣는다. 이것은 장식이 아니라 프로필 저장 트리거다.

### 4페이지 / Stage 1 — `p04_asia_route` / `/mission/asia`

**핵심 메커닉: 타임라인 조립 + 증거 렌즈 + 존중 질문 만들기**

단순 카드 짝맞추기가 아니라 세 단계로 구성한다.

1. **타임라인 조립**: 서로 다른 어린이 사례의 단서 6개를 시간 레일에 드래그한다. 잘못 놓으면 원위치로 부드럽게 돌아가고, 탭-선택 후 슬롯 탭 방식도 지원한다.
2. **증거 렌즈 분류**: `자료에 보이는 사실`, `가능한 해석`, `현재 판단 불가` 세 영역으로 문장을 분류한다. 애매한 항목은 부분 점수와 설명을 제공한다.
3. **질문 만들기**: 문장 조각을 조합해 단정 대신 존중하는 질문을 만든다. 하나의 문장만 정답으로 고정하지 않는다.

**학습 피드백**

- 처음 판단과 수정 판단을 나란히 보여준다.
- 같은 대륙 안에서도 생활이 다양하다는 점을 사례 맥락으로 설명한다.

### 5페이지 / Stage 2 — `p05_europe_route` / `/mission/europe`

**핵심 메커닉: 지도 노드 선잇기 + 다목적 경로 시뮬레이션**

1. 지도에서 조사할 지점 3개를 선택한다.
2. Phaser `Graphics` 또는 기존 SVG path로 노드 사이를 직접 연결한다. 터치 시 가까운 노드에 snap하고 선이 교차하거나 유효하지 않으면 이유를 시각적으로 알려준다.
3. 학생이 자료 근거를 경로 구간 또는 지점에 연결한다.
4. `이동 효율`, `접근성`, `지역 주민`, `보존` 네 지표의 결과를 시뮬레이션한다.
5. 최소 두 개의 유효 경로가 존재하며, 학생이 비교 후 한 구간을 수정할 수 있다.

**구현 원칙**

- 경로 계산은 pure function으로 분리하고 같은 입력에는 같은 결과를 반환한다.
- 최신 요청만 반영해 빠른 탭으로 중복 계산되지 않게 한다.
- 관광 명소만 나열하지 말고 현재 생활공간과 주민 관점을 포함한다.

### 6페이지 / Stage 3 — `p06_africa_route` / `/mission/africa`

**핵심 메커닉: 8칸 리듬 시퀀서 + 호출·응답 제작**

1. 맥락이 다른 여러 사운드 사례 중 하나를 선택한다.
2. 짧은 패턴을 듣고 동시에 파형·박자 점멸을 본다.
3. 8칸 시퀀서에 소리를 배치해 반복·변형 구조를 재구성한다.
4. 제시 패턴에 대한 응답 리듬을 직접 만든다.
5. 원본과 학생 패턴을 시각적으로 비교하고 한 번 수정한다.

**접근성과 안정성**

- 음소거 상태에서도 파형, 박자 점멸, 진동 없는 시각 피드백으로 완료 가능해야 한다.
- AudioContext는 첫 사용자 제스처 이후 한 번만 unlock한다.
- 빠른 연속 탭으로 한 박자가 두 번 기록되지 않게 한다.
- 페이지 종료 시 예약된 오디오 노드·타이머·BGM을 정리한다.
- 아프리카를 하나의 음악 문화로 묶거나 `tribal` 같은 상투적 표현을 사용하지 않는다.

### 7페이지 / Stage 4 — `p07_americas_route` / `/mission/americas`

**핵심 메커닉: 일정 블록 조합 + 제약 해결 + 대안 협상**

1. 북·중·남아메리카의 서로 다른 사례 기록을 읽는다.
2. 필요 조건을 `반드시 지켜야 할 필요`와 `선호`로 구분한다.
3. 일정 보드에 활동·이동·식사 블록을 드래그해 시간과 예산 안에서 계획을 만든다.
4. 알레르기, 접근성, 이동 가능 시간 등의 충돌은 즉시 표시하되 자동 정답을 보여주지 않는다.
5. 두 대안을 저장해 공정성·실행 가능성·만족도를 비교한 뒤 최종안을 수정한다.

**구현 원칙**

- 블록 배치는 grid snap과 충돌 판정을 사용한다.
- 예산은 정수 단위의 결정적 계산으로 처리한다.
- 다수결을 자동으로 공정한 답으로 판정하지 않는다.
- 아메리카를 미국 하나 또는 하나의 언어권으로 표현하지 않는다.

### 8페이지 / Stage 5 — `p08_oceania_route` / `/mission/oceania`

**핵심 메커닉: 지도 핫스폿 조사 + 계획 자원 배분 + 3턴 영향 시뮬레이션**

1. 섬·해안 지도에서 위험, 생활, 생태, 이동, 공동체 지점을 조사한다.
2. 환경, 지역 생활, 경제, 방문자 등 여러 관점 카드를 읽는다.
3. 제한된 행동 토큰 또는 키보드·터치 가능한 슬라이더로 1차 계획을 만든다.
4. `현재`, `몇 달 뒤`, `장기`의 3턴 결과를 애니메이션과 지표로 확인한다.
5. 빠진 관점과 지역 공동체 동의 여부를 확인하고 계획을 수정한다.

**오세아니아 BGM 통일 지침**

- 다른 스테이지와 같은 4음 `world connection` 모티프를 사용한다.
- 기존 88 BPM의 느린 앰비언트·엔딩 영상 느낌이 강하면 교체 또는 편집한다.
- 권장 방향은 102 BPM, 따뜻한 피아노, 소프트 마림바/우든 말렛, 가벼운 어쿠스틱 기타, 부드러운 핸드 퍼커션, 둥근 베이스, 얇은 패드, 아주 약한 파도형 리듬 질감이다.
- 명상 음악보다 탐색·계획·문제 해결에 맞는 분명한 게임 플레이 pulse를 유지한다.
- 원주민 의식 음악 모방, 상투적인 didgeridoo, 관광지식 ukulele, 부족 구호, 보컬을 사용하지 않는다.

**구현 원칙**

- 같은 입력은 같은 결과를 내는 deterministic simulation이어야 한다.
- 지역 공동체의 참여·동의가 없는 계획은 높은 점수를 받을 수 없다.
- 오세아니아를 호주 하나로 축소하지 않는다.

### 9페이지 — `p09_respect_dialogue` / `/mission/respect-dialogue`

**핵심 메커닉: 단서 선잇기 + 분기 대화 + 공감 나침반 + 퍼즐 지구본**

9페이지는 국적 보고 인사법 맞히기가 아니다.

1. 여섯 인사 사례를 관찰한다.
2. 국적이 아니라 `관찰한 행동`, `관계/상황`, `상대가 말한 선호` 단서를 선으로 연결한다.
3. 사실과 추측을 분리하고, 확인 질문을 선택하거나 조합한다.
4. 상대의 답을 요약하고 감정을 확인하는 분기 대화를 진행한다.
5. 공감 나침반을 회전·드래그해 `관찰`, `질문`, `경청`, `수정` 행동 중 다음 행동을 선택하고 근거를 연결한다.
6. 완료한 대화마다 퍼즐 지구본 조각을 하나씩 배치한다.

반드시 다음 10개 독립 투명 PNG를 실제 파일과 매핑한다. 없으면 빈 파일을 만들지 말고 CSS/SVG placeholder와 누락 보고서를 사용한다.

- `greeting_child_morocco.png`
- `greeting_child_colombia.png`
- `greeting_child_japan_bow.png`
- `greeting_child_tanzania.png`
- `greeting_child_australia.png`
- `greeting_child_nepal_namaste.png`
- `icon_heart_speech_bubble.png`
- `icon_listening_ear_heart.png`
- `icon_empathy_compass.png`
- `icon_puzzle_globe.png`

자동 생성 ID 이미지가 이 역할에 해당하면 원본을 지우거나 임의로 복사하지 말고 manifest에서 semantic id로 연결한다. 3D 참고용 `prop_empathy_compass`와 실제 UI용 하트 나침반 아이콘이 모두 있다면 용도를 분리한다.

인사 사례는 `이 나라에서는 모두 이렇게 인사한다`가 아니라, 지역·가정·관계·상황·개인 선호에 따라 달라질 수 있는 가능한 사례로 설명한다.

### 10페이지 — `p10_completion` / `/completion`

**핵심 메커닉: 성취 조립 + 회고 + 인증서**

- route 진입 시 다섯 대륙 스탬프와 9페이지 완료를 다시 검증한다.
- URL 직접 입력으로 보상을 우회할 수 없다.
- 퍼즐 지구본이 조립되고 스탬프가 항로로 연결되는 짧은 완료 연출을 보여준다.
- `처음 생각`, `바뀐 생각`, `다음에 할 행동`을 DOM 입력 또는 선택 문장으로 기록한다.
- 인증서는 DOM/CSS print stylesheet로 만들고 A4 가로 인쇄를 지원한다.
- 반·번호·이름은 인쇄 후 직접 쓸 수 있도록 빈 칸을 둔다.
- 보상은 새로고침·연타에도 정확히 한 번만 지급한다.

---

## F. 공통 UX와 시각 구현 기준

### F1. 샘플 화면 유사성

각 페이지는 샘플 화면의 다음 요소를 최대한 가깝게 구현한다.

- 핵심 오브젝트의 위치와 화면 점유율
- 제목·진행 정보·조작 영역의 시각적 위계
- 좌우 패널 폭, 하단 행동 영역 높이, 안전 여백
- 배경의 깊이감, 구름/광원/그림자 방향
- 색상 비율, 라운드, 테두리, 그림자 강도
- 초등 고학년에게 친근하지만 유치원 장난감처럼 보이지 않는 정보 밀도

샘플 이미지의 잘못된 한글이나 버튼은 그대로 쓰지 않고 DOM 텍스트로 재작성한다. 픽셀 고정 좌표를 남발하지 말고 CSS Grid/Flex, `clamp()`, `aspect-ratio`, 필요 시 container query를 사용한다.

### F2. 반응형·터치

- 기준 화면은 16:9 가로이며 1920×1080, 1366×768, 1024×576을 검증한다.
- Phaser 논리 좌표는 기존 기준이 없을 때 1280×720을 사용하고 `FIT` + 중앙 정렬한다.
- DOM overlay는 실제 canvas 표시 영역과 정렬하고 `ResizeObserver`로 갱신한다.
- 최소 터치 영역은 44×44px, 지도 포털/드래그 핵심 target은 56px 상당을 목표로 한다.
- hover 없이 모든 기능을 쓸 수 있어야 한다.
- 드래그 활동에는 `탭하여 선택 → 목적지 탭` 대체 조작을 제공한다.
- 키보드, 터치, 마우스를 지원하고 포커스 링을 제거하지 않는다.
- 200% 확대, `prefers-reduced-motion`, 색각 구분을 고려한다.

### F3. 페이지 다양성 규칙

- 같은 카드 그리드를 4~9페이지에 반복하지 않는다.
- 각 페이지는 배경, 핵심 오브젝트, 조작 영역의 구조가 분명히 달라야 한다.
- 카드가 필요한 경우 증거·관점·조건을 담는 보조 UI로 쓰고, 핵심 행동은 배치·연결·리듬·경로·시뮬레이션·대화로 만든다.
- 매 스테이지에 `행동 → 결과 → 설명 → 수정` 루프를 넣는다.
- 실패를 큰 빨간 X로 끝내지 말고 원인과 다음 단서를 제공한다.

---

## G. TRD — 기술 아키텍처

현재 코드 구조가 이미 안정적이면 아래 이름으로 전면 개편하지 말고 같은 책임 경계를 기존 구조에 적용한다.

### G1. 런타임 역할 분리

- **Phaser 3**: 드래그, snap, hit area, 지도 노드, 선 그리기, 리듬 시퀀서, 일정 블록 충돌, 시뮬레이션 연출, 퍼즐
- **DOM/CSS/SVG**: 한글, 버튼, 말풍선, 설명 카드, 설정, 모달, 입력, 인증서, 접근성
- **EventBus**: Phaser와 DOM 사이의 명시적 이벤트 계약
- **versioned JSON**: 페이지, 콘텐츠, 미션, 체크포인트, 채점, 에셋 semantic id, 출처
- **저장 서비스**: localStorage 기본, 기존 IndexedDB가 있다면 호환 유지
- **Three.js**: 실제 GLB와 공간 조작이 있을 때만 선택 사용. MVP 기본은 2D·2.5D다.

권장 레이어 역할은 다음과 같다.

```html
<div id="game-shell">
  <div id="three-root"></div>
  <div id="phaser-root"></div>
  <div id="ui-overlay"></div>
</div>
```

기존 DOM이 다르면 강제 변경하지 않는다. 중요한 것은 WebGL 게임 레이어와 접근 가능한 DOM UI가 분리되고, 숨겨진 렌더러가 정지되는 것이다.

### G2. 모듈 책임

기존 이름과 구조를 우선하되 다음 책임은 분리한다.

- `AssetManager`: manifest 기반 semantic id 해석, lazy load, fallback, 참조 카운트
- `AudioManager`: 첫 제스처 unlock, BGM crossfade, 포맷 fallback, mute/volume, visibility pause
- `SaveRepository`: parse, validate, migrate, backup, atomic-like write, export/reset
- `NavigationGuard`: route 해금, 전환 잠금, 직접 URL 검증
- `MissionEngine`: 체크포인트와 공통 상태 전이
- `ScoringEngine`: pure deterministic scoring과 부분 점수
- `ContentRepository`: versioned JSON 로드, 누락·검수 상태 처리
- `EventBus`: typed event map 또는 JSDoc 계약

같은 검증·저장·모달 코드를 페이지별로 복사하지 않는다. 반대로 페이지별 메커닉을 하나의 거대한 `GameScene` 조건문으로 합치지 않는다. 공통 수명주기와 서비스만 재사용하고, Asia/Europe/Africa/Americas/Oceania/Dialog 각 미션 로직은 독립 모듈로 둔다.

### G3. Scene 상태 머신

각 Phaser Scene은 다음 상태를 명시적으로 가진다.

```text
idle → loading → intro → playing → feedback → checkpoint → complete → shutdown
```

필수 가드:

- `isTransitioning`
- `isStageEnded`
- `resultShown`
- `inputLocked`
- `sceneToken`

비동기 콜백은 생성 당시 `sceneToken`이 현재 토큰과 같을 때만 상태를 변경한다. 완료·보상·저장은 idempotent하게 구현한다.

Scene `shutdown`/`destroy`에서는 다음을 실제로 정리한다.

- EventBus listener
- pointer/keyboard listener
- timeout, interval, Phaser delayedCall/tween
- WebAudio source와 예약 노드
- Scene 전용 texture와 object URL
- Three.js 사용 시 geometry, material, texture, renderTarget, AnimationMixer

공용 에셋은 참조 카운트가 0일 때만 해제한다.

### G4. 이벤트 계약

기존 이벤트 이름이 있으면 호환 adapter를 두고 다음 의미를 보장한다.

```text
scene:ready
scene:request-navigation
mission:checkpoint
mission:feedback
mission:completed
profile:updated
save:succeeded
save:failed
audio:unlock-requested
audio:settings-changed
ui:modal-opened
ui:modal-closed
```

payload에 최소 `sceneId`, `missionId`, `sceneToken`, `timestamp` 또는 결정 가능한 id를 포함한다. 동일 이벤트의 중복 구독 여부를 개발 모드에서 감지한다.

### G5. 데이터 계약

화면 배열 index를 영구 id로 사용하지 않는다. 다음 개념을 JSON 스키마 또는 기존 타입으로 정의한다.

- `PageDefinition`
- `MissionDefinition`
- `CheckpointDefinition`
- `AssetRecord`
- `AudioTrack`
- `ContentClaim`
- `PerspectiveRecord`
- `ScoreEvent`
- `SaveV1`

문화 사실 레코드에는 가능한 경우 다음을 포함한다.

```text
contentId
countryOrRegion
claimKo
contextKo
sourceTitle
sourceUrl
sourceOrganization
sourcePublishedAt
lastReviewedAt
reviewer
license
stereotypeRiskNotes
reviewStatus
```

필드가 부족하면 거짓 출처를 만들지 말고 `reviewStatus: "needs_review"`로 둔 뒤 플레이 핵심 사실로 단정하지 않는다.

### G6. 저장 스키마와 마이그레이션

우선 저장키는 다음을 유지한다.

```text
world_connection_journey.save.v1
```

기존 다른 키가 이미 사용 중이면 삭제하지 말고 legacy adapter로 읽어 새 스키마에 병합한다.

최소 저장 구조:

```ts
interface SaveV1 {
  schemaVersion: 1;
  appVersion: string;
  contentVersion: string;
  profile: {
    nickname: string;
    avatarId: string;
    airplaneId: string;
    inquiryGoalIds: string[];
  } | null;
  lastRoute: string;
  completedContinents: string[];
  missionStateById: Record<string, {
    checkpointId: string;
    attempts: number;
    revisionCount: number;
    scoreDimensions: Record<string, number>;
    completedAt?: string;
  }>;
  stamps: string[];
  dialogueCompleted: boolean;
  rewardClaimedById: Record<string, boolean>;
  reflection: Record<string, string>;
  settings: {
    bgmMute: boolean;
    sfxMute: boolean;
    masterVolume: number;
    reducedMotion?: boolean;
  };
  updatedAt: string;
}
```

필수 동작:

- `try/catch` parse와 runtime validation
- 파싱 실패 시 손상 데이터를 timestamp가 포함된 별도 키로 백업하고 안전한 기본값으로 복구
- `migrateSaveV1ToV2` 같은 명시적 순차 migration 패턴
- 프로필 확정, 각 미션 체크포인트, 9페이지 각 상황 완료, 최종 보상 전후 autosave
- quota/write 실패 시 사용자용 Toast와 개발 로그를 분리
- 저장 성공을 확인하기 전 완료 UI를 중복 표시하지 않음
- 교사 초기화는 백업 내보내기와 2단계 확인 후 실행

### G7. 라우팅

- 기존 라우터를 유지한다.
- 정적 호스팅에서 직접 새로고침이 가능하도록 현재 배포 설정의 rewrite/404 fallback을 확인한다.
- `/completion`은 route guard에서 완료 상태를 재검증한다.
- history back/forward로 Scene이 중복 mount되지 않게 한다.
- 전환 중 두 번째 navigation 요청은 무시하거나 queue 하나로 제한한다.

---

## H. 에셋·3D·오디오 TRD

### H1. 에셋 manifest

기존 manifest/registry가 있으면 확장한다. 없다면 프로젝트 관례에 맞는 단일 manifest를 만든다. 화면 코드에 GUID 파일 경로를 반복 하드코딩하지 않는다.

예시 semantic id:

```text
title.main
hero.explorer
vehicle.airplane
prop.globe
prop.passport
prop.passport_stamp
portal.continent
prop.empathy_compass_3d_ref
icon.empathy_compass
icon.listening
icon.heart_speech
reward.connector_badge
greeting.morocco
greeting.colombia
greeting.japan_bow
greeting.tanzania
greeting.australia
greeting.nepal_namaste
```

manifest 레코드는 `id`, `type`, `src`, `fallbackSrc`, `pages`, `preloadGroup`, `alphaRequired`, `sourceStatus`, `license`를 지원한다.

원본 PNG는 보존한다. 배포 최적화 WebP가 필요하면 별도 파일로 만들고 alpha를 검증한다. 파일 경로 변경이 필요하면 기존 경로 alias 또는 adapter를 남긴다.

### H2. 3D 사용 범위

- 캐릭터 이동, NPC 접근, 공간 조사처럼 실제 공간 상호작용이 없다면 실시간 3D를 쓰지 않는다.
- 프로필 미리보기는 GLB가 실제로 있을 때만 고정 카메라 3D를 선택할 수 있다.
- GLB가 없으면 투명 PNG + 그림자 + 약한 parallax/tween으로 2.5D를 완성한다.
- Meshy 참고 PNG를 실시간 3D 파일로 오인하지 않는다.
- Three.js를 사용한다면 Phaser 미션 진입 중 render loop를 정지하고 복귀 때만 재개한다.

보수적 목표:

- 저사양 태블릿 30fps
- 일반 기기 45~60fps
- pixel ratio 기본 1.0~1.25, 최대 1.5
- 최초 필수 다운로드 5~8MB 목표
- 일반 텍스처 512/1024, 핵심 캐릭터만 최대 2048
- 동적 그림자 1개 정도
- 후처리 기본 끄기
- 파티클 수와 투명 overdraw 제한

### H3. 오디오 manifest와 동작

실제 파일을 검색해 semantic id로 연결한다. 한 포맷만 존재하면 없는 대체 파일 경로를 꾸며내지 말고 누락을 보고한다.

권장 id:

```text
bgm.main
bgm.stage.asia
bgm.stage.europe
bgm.stage.africa
bgm.stage.americas
bgm.stage.oceania
sfx.ui.tap
sfx.drag.pickup
sfx.drag.drop
sfx.route.connect
sfx.rhythm.beat
sfx.reward.stamp
sfx.reward.complete
```

파일 이름의 권장 방향:

```text
bgm_main_world_connection.ogg / .mp3
bgm_stage_01_asia_daily_life.ogg / .mp3
bgm_stage_02_europe_city_route.ogg / .mp3
bgm_stage_03_africa_sound_dialogue.ogg / .mp3
bgm_stage_04_americas_shared_day.ogg / .mp3
bgm_stage_05_oceania_shared_future.ogg / .mp3
```

실제 이름이 다르고 이미 코드에서 사용 중이면 무단 rename하지 말고 manifest로 매핑한다.

모든 BGM은 공통 4음 모티프와 유사한 음량·루프 감각을 공유해야 한다. 오세아니아 곡은 위 E절의 102 BPM 수정 방향을 기준으로 삼는다. 장면 전환 시 250~500ms fade-out/crossfade, 브라우저가 숨겨지면 pause/suspend, 복귀 시 사용자 설정을 존중한다. BGM과 SFX mute를 분리한다.

---

## I. 채점·학습 피드백 TRD

총점은 100점이며 다음 공통 차원을 사용한다.

| 차원 | 배점 |
|---|---:|
| 근거 활용 | 30 |
| 관점 전환 | 25 |
| 존중하는 의사소통 | 25 |
| 전략 수정 | 15 |
| 속도 보너스 상한 | 5 |

채점 함수는 UI와 분리된 pure function으로 구현하고 같은 입력에는 같은 결과를 반환한다. 부분 점수와 복수 유효 전략을 지원한다. `틀림`만 표시하지 말고 어떤 근거가 빠졌는지, 어떤 관점이 누락됐는지, 어떻게 수정할 수 있는지를 알려준다.

스테이지별 강조점:

- 아시아: 사실/해석 구분, 존중 질문, 판단 수정
- 유럽: 근거 연결, 접근성·보존·주민 관점의 균형
- 아프리카: 패턴 분석, 경청, 응답 조정
- 아메리카: 필수 필요 구분, 공정한 제약 해결, 대안 비교
- 오세아니아: 여러 관점, 공동체 동의, 단기/장기 영향, 계획 수정
- 9페이지: 국적 추측보다 관찰·질문·요약·감정 확인·행동 수정에 높은 점수

통과 기준은 70점이지만, 미달이어도 전체를 처음부터 반복시키지 말고 부족한 단계만 재도전하게 한다.

---

## J. 12개월 유지 구조

`1년 동안 절대 장애가 없다`고 보장할 수는 없으므로, 장애 가능성을 줄이고 복구 시간을 짧게 만드는 구조와 증거를 만든다.

### J1. 의존성 정책

- 현재 major 버전을 유지하고 lockfile을 보존한다.
- 새 의존성은 기존 코드로 안전하게 해결할 수 없을 때만 추가하고 `docs/TRD.md`에 이유·대안·위험을 기록한다.
- 런타임 의존성보다 build-time 또는 표준 Web API를 우선한다.
- exact 또는 lockfile로 재현 가능한 설치를 유지한다.
- 보안 업데이트는 작은 단위로 수행하고 build/E2E/save migration 회귀 테스트 후 반영한다.

### J2. 변경에 강한 구조

- 에셋은 manifest, 콘텐츠는 versioned JSON, 채점은 pure function, 저장은 repository로 분리한다.
- 새 국가/사례/에셋을 추가할 때 Scene 코드를 수정하지 않고 데이터 추가로 확장할 수 있게 한다.
- 콘텐츠 id와 배열 index를 결합하지 않는다.
- public API와 이벤트 payload를 문서화한다.
- 오류 화면은 사용자용 메시지와 개발 진단 id를 분리한다.
- production에서는 상세 debug 로그를 비활성화하되 오류 원인은 재현 가능하게 남긴다.
- 핵심 게임은 네트워크가 끊겨도 로컬 번들로 실행되어야 한다.

### J3. 오류·fallback 전략

- 이미지 실패: semantic placeholder + alt/aria 설명, 진행 차단 금지
- 오디오 실패: 무음 진행 + 파형/박자 시각화
- JSON 일부 누락: 해당 콘텐츠만 건너뛰고 `contentId` 기록
- 저장 손상: 백업 후 기본값 복구
- route 오류: 안전한 지도 또는 마지막 유효 route로 복귀
- Scene 로딩 실패: retry 1회 후 DOM fallback과 오류 id 표시
- GLB 실패: 2.5D PNG fallback

### J4. 연간 점검

`docs/maintenance-12-month.md`를 만들고 다음을 월별/분기별/연간으로 나눈다.

- 매 배포: install, typecheck, lint, unit, build, route smoke, save migration
- 분기: 의존성 보안 검토, 깨진 링크·오디오·에셋 확인, iPad/Android/Chromebook 회귀 테스트
- 학년도 시작 전: 문화 설명·지역 명칭·출처·검수일 재검토, 접근성 점검, 백업/복구 훈련
- major upgrade: 별도 브랜치와 migration 테스트, 한 번에 하나씩

---

## K. 테스트·검증 계획

기존 테스트 도구를 우선 사용한다. 없다면 unit test는 현재 스택에 가장 작은 도구를 선택하고, 10개 route 시각·입력 검증에 Playwright가 필요할 경우에만 dev dependency 추가를 검토해 이유를 기록한다.

### K1. 단위 테스트

- save parse, corrupted JSON, 기본값 복구
- legacy key migration, schema migration
- stage score pure functions와 복수 유효 답
- Europe 경로 계산의 결정성
- Americas 예산·제약 계산의 결정성
- Oceania 3턴 simulation의 결정성
- reward idempotency
- route unlock guard
- asset manifest fallback

### K2. 통합 테스트

- Phaser Scene mount → checkpoint → shutdown
- EventBus listener가 shutdown 후 남지 않음
- 빠른 연타로 navigation이 한 번만 발생
- 결과 모달/보상 모달이 한 번만 표시
- 오디오 unlock이 한 번만 실행
- visibility change와 route change에서 BGM 정리
- 저장 실패 후 게임이 즉시 종료되지 않음

### K3. E2E·시각 검증

다음 화면 크기에서 route별 개별 스크린샷을 만든다. 여러 페이지를 한 장에 합치지 않는다.

- 1920×1080
- 1366×768
- 1024×576

검증 항목:

- 1~10 route 접근과 올바른 guard
- 새 여행, 이어하기, 중간 체크포인트 복원
- 뒤로가기/앞으로가기/새로고침
- 10회 빠른 연타와 다중 포인터 입력
- 텍스트 잘림, 카드 겹침, 버튼 터치 영역
- 샘플 화면 대비 주요 블록 위치·크기·색감
- 오디오 없는 상태와 이미지 누락 상태
- `prefers-reduced-motion`
- 키보드만으로 핵심 미션 완료
- 직접 `/completion` 접근 차단

정확한 학교 기기가 없으면 30fps를 보장한다고 쓰지 말고, Chrome performance 측정 결과와 남은 위험을 기록한다. 가능하면 오래된 iPad Safari, Android Chrome, Chromebook/저사양 Windows Chrome을 실제 검증 대상으로 둔다.

### K4. 성능 예산 검증

- 최초 화면 필수 다운로드 5~8MB 목표
- route별 lazy chunk와 에셋 크기 기록
- Scene 종료 전후 listener, texture, audio node 수 비교
- 5회 왕복 후 메모리 증가가 계속 누적되는지 확인
- 숨겨진 canvas에서 requestAnimationFrame이 계속 도는지 확인
- 장시간 30분 플레이 후 중복 입력·오디오 겹침·보상 중복 확인

---

## L. 구현 순서

각 단계가 끝날 때 기존 build와 해당 smoke test를 실행한다. 한 번에 대규모 리팩터링하지 않는다.

### 단계 0 — 진단과 기준점

- C절의 읽기 전용 진단
- 기존 오류 재현
- asset/page sample/audio 매핑
- `docs/recovery-baseline.md`, `docs/asset-inventory.md`, `docs/page-sample-audit.md`, `docs/content-gaps.md`

### 단계 1 — 공통 껍데기와 안정성

- 기존 라우팅/Scene mount 복구
- manifest, SaveRepository, AudioManager, EventBus cleanup, navigation guard
- 공통 DOM UI와 디자인 token
- 1·2·3페이지 연결

### 단계 2 — 5개 대륙 playable vertical slices

- Asia 타임라인/증거 분류
- Europe 노드 선잇기/경로 계산
- Africa 시퀀서/시각 리듬
- Americas 일정·제약 보드
- Oceania 핫스폿/3턴 simulation
- 각 스테이지에 checkpoint, feedback, revision, stamp 적용

### 단계 3 — 통합 대화와 완료

- 9페이지 독립 에셋 매핑, 단서 선잇기, 분기 대화, 공감 나침반, 퍼즐 지구본
- 10페이지 완료 guard, idempotent reward, 회고, print certificate

### 단계 4 — 품질 고정

- 10 route E2E
- 저장 손상/마이그레이션/연타/뒤로가기 회귀 테스트
- 개별 route 스크린샷과 sample 비교
- 접근성, 오디오 fallback, 30분 반복 플레이, 성능 예산
- README와 유지 문서 완성

각 단계에서 기존 사용자 파일을 삭제하거나 전체 구조를 갈아엎지 않는다.

---

## M. 산출물

실제 코드 변경과 함께 다음 문서를 남긴다. 기존 파일이 있으면 덮어쓰지 말고 현재 구조에 맞게 갱신하거나 날짜 섹션을 추가한다.

- `docs/recovery-baseline.md`
- `docs/asset-inventory.md`
- `docs/page-sample-audit.md`
- `docs/content-gaps.md`
- `docs/MVP.md`
- `docs/TRD.md`
- `docs/test-matrix.md`
- `docs/maintenance-12-month.md`
- `docs/implementation-report.md`

`docs/MVP.md`에는 다음을 포함한다.

- MVP 범위와 제외 범위
- 10페이지 flow
- 페이지별 고유 메커닉
- 체크포인트와 저장 지점
- 현재 플레이 가능한 콘텐츠와 검수 필요 콘텐츠
- 알려진 제약과 다음 우선순위

`docs/TRD.md`에는 다음을 포함한다.

- 실제 적용된 기술 스택과 버전
- 모듈/Scene/라우트/이벤트/데이터/저장 계약
- 에셋·오디오 lazy load와 해제 정책
- route guard와 idempotency
- 접근성·성능 예산
- 배포·브라우저 호환 전략
- 장애 fallback과 복구 절차
- 의존성 결정 기록

README에는 정확한 명령을 남긴다.

```text
install
dev
typecheck
lint
test
build
preview
e2e 또는 route smoke
```

실제로 없는 명령을 쓰지 말고 package script와 일치시킨다.

---

## N. 완료 판정 기준

다음이 충족되지 않으면 `완료`라고 보고하지 마라.

- [ ] 최신 JSON의 최종 제목과 10페이지가 구현됨
- [ ] 샘플 화면 또는 JSON 시각 프롬프트 대비 페이지별 배치가 점검됨
- [ ] 카드 맞히기 반복이 아닌 5개의 서로 다른 Phaser 핵심 메커닉이 동작함
- [ ] 1→3→2→4~8→9→10 end-to-end 진행 가능
- [ ] 각 대륙에 행동·결과·설명·수정 루프가 있음
- [ ] 페이지 9의 10개 독립 에셋이 실제 매핑되거나 안전한 누락 보고/fallback이 있음
- [ ] 새로고침 후 프로필·체크포인트·스탬프가 복원됨
- [ ] 손상 저장과 legacy 저장이 앱을 멈추게 하지 않음
- [ ] `/completion` 직접 접근으로 보상 우회 불가
- [ ] 빠른 연타에도 Scene·모달·보상·오디오가 중복되지 않음
- [ ] 첫 사용자 제스처 전 오디오 자동 재생 없음
- [ ] 오디오 없는 상태에서도 전 미션 진행 가능
- [ ] 1024×576에서 핵심 UI가 잘리지 않음
- [ ] 키보드·터치로 핵심 조작 가능
- [ ] 숨겨진 Phaser/Three 렌더러와 Scene listener가 정리됨
- [ ] 기존 파일 삭제·전체 재작성·중복 서비스 생성 없음
- [ ] install/typecheck/lint/test/build 결과가 기록됨
- [ ] MVP, TRD, 테스트, 12개월 유지 문서가 실제 코드와 일치함

---

## O. 최종 보고 형식

작업이 끝나면 아래 순서로 간결하지만 구체적으로 보고하라.

1. **복구 결과**: 수정 전 핵심 오류와 복구 내용
2. **MVP 플레이 흐름**: 실제로 가능한 1~10페이지 경로
3. **페이지별 메커닉**: 카드 반복을 피하기 위해 적용한 조작
4. **샘플 화면 유사성**: 유지한 요소와 불가피한 차이
5. **에셋·오디오 매핑**: 사용, fallback, 누락
6. **저장·Scene 안정성**: migration, guard, cleanup, idempotency
7. **검증 결과**: 실행한 명령과 성공/실패
8. **남은 위험**: 숨기지 말고 재현 조건과 다음 조치
9. **변경 파일 목록**: 생성/수정만 구분하고 삭제가 없음을 확인

빌드나 테스트가 실패하면 `완료`라고 하지 말고 실패 원문, 재현 명령, 영향 범위, 안전한 다음 조치를 적는다. 테스트 통과를 위해 기존 검증을 삭제하거나 완화하지 않는다.

이 프로젝트의 성공 기준은 화면 수가 아니라, 학생이 **지도에서 선택하고, 물체를 움직이고, 선을 잇고, 리듬을 만들고, 조건을 조정하고, 결과를 보고 생각을 수정하는 과정**을 실제 게임처럼 경험하는 것이다.
