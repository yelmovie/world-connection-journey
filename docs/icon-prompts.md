# 아이콘 프롬프트 캔버스 (2026-09-03)

이모지를 UI 아이콘으로 쓴 곳. 이미지는 생성하지 않고 프롬프트만 정리. ✓·✦·◐·↻ 같은 기호는 Graphics(SVG)로 그릴 수 있어 `dokdo-design`으로 넘긴다.

| 위치(파일:줄) | 현재 이모지 | 용도 | 생성 프롬프트 | 규격 |
|---|---|---|---|---|
| src/pages/missionAmericas.ts:368 | 👆 | 다음 지점 안내 배지 '여기를 눌러!' | 권고: 제거(문구+주황 테두리만으로 충분). 굳이 쓰면 flat pointing-hand icon, navy outline, gold fill, no shadow | 24px, SVG |
| src/pages/missionAmericas.ts:975 | 🚤 / 👣 | 탐험 방식 아이콘(강 내려가기 / 발자국 경로) | Two flat line icons for a kids' map game: (1) small motorboat side view, (2) two footprints; navy #173653 stroke 2.5px, white fill, rounded ends | 32px, SVG 2종 |
| scripts/make-placeholders.cjs | 🖼 | 사진 준비 중 안내판(임시) | 교체 예정 자산 — 실제 그림이 들어오면 사라짐 | — |
| src/ui/feedback.ts:10 | ✓ ◐ ↻ | 피드백 종류 표시 | Graphics(SVG)로 그린다 → dokdo-design | 20px |
| 여러 파일 | ✓ (CSS content) | 완료 체크 배지 | Graphics(SVG)로 그린다 → dokdo-design | 16~24px |
