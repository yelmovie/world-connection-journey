# 최종 검증 성적표 — 2026-09-03 (2차, 진단만·코드 무변경)

요청: "중복 코드·오류 코드·반응형 중심으로 검증만" (edu-webapp 9단계 QA 기준)

## 1. 빌드·콘솔 — 통과

- `npm run build` 통과 (vite 11.2s + precache 28개 기록)
- 청크: phaser 1,208KB(gzip 332KB) — 기존과 동일, 나머지 최대 216KB(gzip 66KB)
- 콘솔 오류 0, TODO/FIXME 0, console.log 0

## 2. 반응형 — 표준 4해상도 전체 통과, 축소창 2건 관찰

- **44화면 × 4해상도(1920×1080 / 1366×768 / 1280×800 / 1900×880): 발견된 문제 0**
- 6단계 전 화면(경청·나침반·지구회의 6종) 안쪽 스크롤 0 (1267×694까지 확인)
- 추가로 돌린 배율 축소창에서만 관찰된 항목(표준 해상도에선 미발생):
  - `1267×694` 오세아니아·연결: 대화 보드 글자 오른쪽 7px 넘침
  - `1267×694` 인증서: 세로 23px 스크롤 — 시트 최소폭 430px 유지 설계의 의도된 폴백(page-body가 스크롤)
  - `1024×576` 아메리카·signal: 가이드 말풍선이 신호 목록 일부 가림 4건 (모바일 가로급 크기)

## 3. 중복 코드 (공통 모듈 후보 — 수정 안 함)

| 항목 | 위치 | 제안 |
|---|---|---|
| HTML 이스케이프 6벌(동일) | chrome.ts 61·395(한 파일에 2벌), journeyTransition 135, gateNote 12, connectedRegionMission 327, earthCouncilScenes 55(' 누락 변종) | `ui/escape.ts` 하나로 |
| 전후 비교 와이프 슬라이더 2벌 | connectedRegionMission 701-763 vs missionDialogue 715-806 (임계 70/65만 다름) | `ui/compareWipe.ts` |
| 가로 스와이프 3벌 | passport 926-940(48), missionAfrica 344-349(36), connectedRegionMission 656-673(36) | `ui/swipe.ts` — 캡처 정책 제각각인 게 아래 오류 후보의 원인 |
| reducedMotion 판정 7벌 | guide 50, fx 6, characterDialogue 53, journeyTransition 49, earthCouncilScenes 62·1062, map 664 | 한 곳으로 |
| later/clearTimers 2벌 | missionAfrica 166, missionAmericas 556 | 공용화 |
| 글자 축소 별도 구현 | missionAmericas 119-131(fitStopCards) vs 공용 fitText | keepFitted 옵션으로 흡수 |

## 4. 오류 위험 코드 (높음 2건)

1. **missionDialogue.ts:465·1326** — `closeActiveModal`이 완료 모달의 "한 번 더 보기" **버튼 클릭 콜백**으로 덮어써짐. unmount가 이를 호출해 페이지 정리 중 detached 버튼 click이 발사됨(정리된 페이지 위 모달 재오픈 가능).
2. **missionDialogue.ts:780, passport.ts:931** — `setPointerCapture` try/catch 없음(코드베이스 나머지 5곳은 전부 감쌈). 특히 passport 931은 터치에서도 캡처 — "크롬이 다음 탭 click을 삼킨다"고 다른 파일 주석이 경고하는 바로 그 패턴.

## 5. 죽은 코드 (삭제 후보 — 수정 안 함)

- **파일 통째 5개(~510줄)**: core/asiaMission.ts(201줄), core/oceaniaMission.ts(205줄), ui/threeSlot.ts, core/scoring.ts(테스트만 사용), core/oceaniaPolicy.ts(테스트만 사용)
- **도달 불가 UI**: passport 1단계(이름 입력) — FIRST_STEP=2 클램프로 절대 표시 안 됨. 마크업 563-590, 핸들러 943-958 등 연쇄 사문화
- **미사용 export**: EventBus.scope, fx.stampSlam·countUp, avatarMissionInsight, calculateAfricaMetrics, signalsForLens, readMissionArtifact 등
- **죽은 CSS**: earthCouncilScenes EARTH_CSS 셀렉터 21개, missionDialogue .dl-council* 계열 10개, title 프롤로그 계열 6개+travel-theme 174-224 연쇄, 그 외 페이지별 1~2개씩
- **Observer 해제 없음(낮음)**: earthCouncilScenes 751, missionAmericas 129, fitText keepFitted(disposer 미반환 — 호출처 6곳 해제 불가)

## 6. 저장·터치·팝업 (전수 아님, 스팟)

- window/document 리스너 등록·해제 짝 전부 일치, 빈 catch 0, 타이머는 disposed 가드 확인
- 완료 미션 재플레이(지구회의 다시 열기), 1→2단계 전환, 사진 3장→경청 전체 흐름 자동화로 통과

## 결론

표준 해상도 기준 **납품 가능 상태**. 위 항목은 전부 진단이며 코드는 건드리지 않았다.
권장 처리 순서: ①4-1(closeActiveModal) ②4-2(setPointerCapture) ③죽은 파일 5개+죽은 CSS ④escape 공용화 → 나머지 중복.
