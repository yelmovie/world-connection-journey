# DECISIONS

- 2026-09-01 점수 비표시 설계 확정 — completeMissionFlow가 점수를 쓰지 않으므로 미션 3곳의 computeScore 호출 제거. core/scoring.ts는 순수 모듈로 보존.
