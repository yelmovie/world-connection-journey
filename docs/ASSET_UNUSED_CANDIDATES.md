# 미사용 에셋 후보 기록

마지막 확인: 2026-08-26

`npm run audit:assets`가 시맨틱 매니페스트 137개와 소스 참조를 비교한다. 현재 파일 누락은 없고, 아래 27개 ID는 소스에서 직접 참조되지 않는 재사용 후보다. 기존 자산을 먼저 살펴보고 활용한다는 원칙에 따라 삭제하지 않고 보존한다.

## 다음 화면 개선 때 우선 검토

- 친구·인사 확장: `greeting.colombia`, `asia.child2`, `asia.child3`
- 문화 맥락 카드: `costume.1`~`costume.4`, `prop.necklace`, `prop.scarf`, `prop.norigae`, `prop.mask`, `prop.tomato`, `prop.accordion`, `prop.lantern_star`, `prop.tulip`, `prop.violin`
- 여행·보상 연출: `oceania.sydney`, `reward.star3d`, `prop.scrapbook`, `deco.signpost`, `deco.explorer1`, `deco.explorer2`
- 향후 3D 대체 슬롯: `char.boy3d`, `prop.plane3d`, `prop.globe3d`, `prop.portal3d`
- 예비 배경: `bg.spare`

## 처리 원칙

1. 새 이미지를 생성하기 전에 위 후보가 학습 맥락과 시각 언어에 맞는지 먼저 확인한다.
2. 문화 장식은 단순 분위기용으로 넣지 않고, 출처·지역·학습 질문을 함께 제시할 수 있을 때만 사용한다.
3. 3D 표기 에셋은 실제 GLB가 아니라 현재 이미지 폴백이므로 3D 기능처럼 안내하지 않는다.
4. 두 차례 이상 릴리스에서 사용 계획이 없고 중복까지 확인된 파일만 별도 보관 대상으로 옮긴다. 원본은 삭제하지 않는다.

