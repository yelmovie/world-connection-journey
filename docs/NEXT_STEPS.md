# 이어서 진행할 것 (2026-09-03 출근 전 정리)

"이어서 진행해"라고 하면 이 문서 위에서부터 순서대로 처리한다. 작업 전 `git log --oneline -5`, `git status --short`로 다른 에이전트(안티그라비티) 변경 여부부터 확인.

## 지금 상태 (전부 커밋됨, 작업 트리 깨끗)
- 마지막 커밋: 권역 지도 핀 재디자인(반투명 유리). 그 앞: 터치·조작 전수 점검(에이전트 3개, 프로브 57/194/122 통과), 자산 다이어트(public/assets 75→43MB), 인증서 도장 줄 수정, 6대륙 도장(북·남아메리카 분리, 지구회의는 인증서), 영국·미국·일본 그림 적용, 완료 미션 재플레이 첫 화면부터.
- 검증 도구: `node scripts/qa-sweep.cjs`(45화면×4해상도, `--only=이름`, `--vp=WxH`), `_unused/scripts/probe-touch-*.cjs`(터치), `node scripts/audit-source-assets.mjs`(자산 누락).
- 최종점검 성적표: docs/reviews/FINAL-CHECK-20260903.md (216/253, 도장 개편 전 기준) — **재채점 필요**.

## 남은 일 (우선순위 순)
1. **최종점검 재실행** — `final-check` 스킬. 사진 8장 감점(5번)은 해소됐고, 12번(권역 카드 글자 하한 12~13px→14px 권장)·9번(아메리카 이모지 👆🚤👣 → SVG, docs/icon-prompts.md)은 사용자 승인 후 수정.
2. **아메리카 로컬 `.is-pressed` 핸들러 정리** — `src/pages/missionAmericas.ts` 616~621줄 근처, 전역 `src/ui/touch.ts`가 같은 일을 하므로 제거 가능(선택).
3. **아프리카 지역 상세 사진 크기 점프** — 개요 페이지(613×345)와 나라 페이지(360×202) 사이에서 사진·화살표가 튐(T2 보고). `missionAfrica.ts` `.country-detail .detail-photo` 폭 계산을 페이지 종류와 무관하게 고정하는 방향.
4. **지구회의 약속 화면 도움 칩** — `.ec-starters .chip`이 span이라 못 누름. 누르면 글상자에 넣게 할지 사용자 결정.
5. **`dnd.ts enablePickPlace`** — 터치에도 `setPointerCapture`를 걸어 "같은 카드 다시 탭해 선택 해제"가 안 먹을 수 있음(T2 지적). 증상 보고 오면 `pointerType !== 'touch'` 가드 한 줄.
6. **배경음 20MB(public/sound)** — 비트레이트 낮춰 절반으로(선택).
7. `feedback.ts`의 안 쓰는 `learningLines` 표 제거(무해).
8. 안티그라비티가 그림을 더 만들면: `docs/IMAGE_PROMPTS_UK_USA.md` 규격대로 같은 파일명 덮어쓰기 → `node scripts/convert-uk-usa.cjs` 방식으로 webp 변환·매니페스트 연결 → `node scripts/audit-source-assets.mjs` → 스윕.

## 함정 메모
- 같은 파일을 안티그라비티와 동시에 고치지 말 것(먼저 `find src -newermt "-10 minutes"`).
- `git add -u`는 다른 에이전트의 미커밋 변경까지 쓸어 담는다 — 커밋 메시지에 명시.
- 아메리카 검증: students 4명 이상, postcards·countries 수 일치 필요.
- 도장 규칙은 `src/core/stamps.ts` 한 곳. 여권 도장 6칸 = 6대륙, 지구회의는 도장 없음.
