# ASSET_AUDIT — 15worldmap 에셋 감사

최초 생성: 2026-08-14 / 재매핑(사용률 확대): 2026-08-15 / 도구: scripts/contact-sheet.mjs + scripts/build-assets.mjs (sharp)
원본 픽셀 파일은 수정하지 않았다. 산출물은 public/assets/ 와 src/content/asset-manifest.json 에 생성했다.

## 0. 사용률 전/후 (2026-08-15 재매핑)

- 이전: 원본 138장 중 45장 매핑(33%), 코드 실사용 약 34장
- 이후: **원본 138장 중 110장 매핑(80%)**, 신규 65건 추가 (deco 25 · 대륙 소품 17 · reward 6 · prop/3D 10 · plane 3 · icon 2 · 기타 2)
- 미배정 잔여 28장은 전부 근접 중복(같은 랜드마크의 이전 세대 변형), 배경이 박힌 무알파 3D 렌더, T포즈 리깅 소스다(아래 2절).
- 신규 배정분의 "사용 페이지"는 미션 화면 리디자인 시 투입할 기획 배정이다. 현재 코드가 실제 렌더링하는 ID는 기존과 동일하며, 리디자인 작업에서 아래 pages 기준으로 투입한다.

## 1. 배정표 (semantic ID 110건)

| semantic id | 원본 파일 | 원본 해상도 | 알파 | 변환 KB | 배정 페이지 | note |
|---|---|---|---|---|---|---|
| bg.title | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (1).png | 1672x941 | X | 131 | p01 | 구름 위 세계지도 파노라마 |
| bg.completion | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (10).png | 1672x941 | X | 198 | p10 | 지구 위 축하 폭죽·컨페티 |
| bg.dialogue | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (2).png | 1672x941 | X | 86 | p09 | 공항 라운지 실내(관제탑 창) |
| bg.map | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (3).png | 1672x941 | X | 230 | p02 p03 | 평면 세계지도(대륙 아이콘) |
| bg.asia | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (4).png | 1672x941 | X | 212 | p04 | 벚꽃·전통 건축 아시아 풍경 |
| bg.americas | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (5).png | 1672x941 | X | 291 | p07 | 미주 대륙 조감(금문교·자유의여신상·리우) |
| bg.africa | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (6).png | 1672x941 | X | 192 | p06 | 사바나 석양 무대·바오밥 |
| bg.europe | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (7).png | 1672x941 | X | 258 | p05 | 유럽 랜드마크 수변(에펠탑·콜로세움) |
| bg.oceania | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (8).png | 1672x941 | X | 222 | p08 | 열대 섬·산호해 조감 |
| bg.spare | background/ChatGPT Image 2026년 8월 14일 오전 03_21_55 (9).png | 1672x941 | X | 173 | - | 교실(원탁 세계지도) — 예비 |
| title.logo | title/ChatGPT Image 2026년 8월 14일 오후 04_16_10.png | 2172x724 | O | 105 | p01 | 세계를 잇는 여행 한글 로고 |
| plane.main | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_10 (1).png | 1254x1254 | O | 56 | p01 p02 | 로봇 비행기 마스코트(배낭·서있는 자세) |
| plane.alt1 | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_11 (2).png | 1254x1254 | O | 52 | p02 p03 | 로봇 비행기 비행 자세 변형 — 지도 전환 연출용 |
| plane.alt2 | assets/ChatGPT Image 2026년 8월 13일 오후 06_17_32 (1).png | 1254x1254 | O | 57 | p01 p03 | 로봇 비행기 돋보기 든 변형 |
| plane.africa | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_50 (1).png | 1254x1254 | O | 57 | p06 | 아프리카 문양 로봇 비행기 — 아프리카 미션 히어로/입장 연출 |
| plane.explorer | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_15 (1).png | 1254x1254 | O | 65 | p02 | 탐험 모자 로봇 비행기 — 지도 전환·미션 안내 연출 |
| plane.jet | assets/ChatGPT Image 2026년 8월 14일 오전 03_57_07 (1).png | 1254x1254 | O | 47 | p02 | 만화풍 여객기(비행 자세) — 지도 이동 연출용 |
| prop.passport | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_11 (4).png | 1254x1254 | O | 52 | p03 | 지구본 여권·티켓 |
| prop.globe | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_12 (6).png | 1254x1254 | O | 55 | p02 | 비행기 궤도 지구본 |
| prop.stamp | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_58 (9).png | 1224x1285 | O | 28 | p03 | 3D 도장(스탬프) |
| prop.suitcase | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_12 (5).png | 1254x1254 | O | 53 | p03 | 여행 가방(스티커 트렁크) |
| icon.compass | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_11 (3).png | 1254x1254 | O | 18 | p02 | 지구본 나침반 장식 아이콘 |
| greeting.morocco | assets/ChatGPT Image 2026년 8월 14일 오후 06_38_57 (4).png | 1254x1254 | O | 40 | p09 | 추정: 손 들어 인사하는 소년(국가 단서 없음) |
| greeting.colombia | assets/ChatGPT Image 2026년 8월 13일 오후 06_17_33 (3).png | 1254x1254 | O | 47 | p09 | 추정: 밝게 손 흔드는 소녀 |
| greeting.japan | assets/ChatGPT Image 2026년 8월 14일 오후 06_38_57 (3).png | 1254x1254 | O | 31 | p09 | 추정: 두 손 모아 목례하는 소녀(현대 복장) |
| greeting.tanzania | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_51 (2).png | 1254x1254 | O | 35 | p09 | 추정: 흥겹게 인사하는 소년 |
| greeting.australia | assets/ChatGPT Image 2026년 8월 14일 오후 06_38_56 (2).png | 1254x1254 | O | 43 | p09 | 추정: 손 흔드는 소년 |
| greeting.nepal | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_06 (3).png | 1254x1254 | O | 43 | p09 | 추정: 나마스테 합장 소녀(의상은 인도풍 사리) |
| reward.globe_puzzle | assets/ChatGPT Image 2026년 8월 14일 오후 06_39_03 (10).png | 1254x1254 | O | 46 | p02 p10 | 퍼즐 조각 지구본(웃는 얼굴) |
| reward.badge | assets/ChatGPT Image 2026년 8월 14일 오전 03_57_07 (2).png | 1254x1254 | O | 73 | p10 | 월계수·리본 지구 메달 |
| asia.child1 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_06 (2).png | 1254x1254 | O | 45 | p04 | 한복 소녀 |
| asia.child2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_06 (4).png | 1254x1254 | O | 35 | p04 | 중국 전통복 소년 |
| asia.child3 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_06 (5).png | 1254x1254 | O | 36 | p04 | 태국 전통복 소녀 |
| europe.guide | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_16 (2).png | 1254x1254 | O | 45 | p05 | 추정: 지도 든 탐험 복장 소녀 가이드 |
| europe.heritage | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_04 (1).png | 1254x1254 | O | 66 | p05 | 콜로세움 미니어처 |
| africa.host | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_51 (3).png | 1254x1254 | O | 49 | p06 | 추정: 춤추며 맞이하는 소녀 |
| africa.instrument1 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_52 (4).png | 1254x1254 | O | 46 | p06 | 젬베 북 |
| africa.instrument2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_53 (5).png | 1254x1254 | O | 66 | p06 | 토킹드럼(장구형 북) |
| africa.instrument3 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_54 (6).png | 1254x1254 | O | 70 | p06 | 셰케레(구슬 박) |
| americas.student1 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_41 (4).png | 1254x1254 | O | 38 | p07 | 급식판 든 소년 |
| americas.student2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_42 (5).png | 1254x1254 | O | 46 | p07 | 도시락 든 소녀 |
| americas.student3 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_43 (6).png | 1254x1254 | O | 47 | p07 | 병 간식 든 소녀 |
| americas.student4 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_43 (7).png | 1254x1254 | O | 46 | p07 | 보온병·가방 든 소년 |
| oceania.youth | assets/ChatGPT Image 2026년 8월 14일 오후 06_38_58 (6).png | 1254x1254 | O | 36 | p08 | 추정: 고글 모자 소년 |
| oceania.researcher | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_16 (3).png | 1254x1254 | O | 44 | p08 | 추정: 쌍안경 탐험가 소년 |
| oceania.fisher | assets/ChatGPT Image 2026년 8월 14일 오후 06_38_58 (5).png | 1254x1254 | O | 48 | p08 | 추정: 야외활동 복장 소녀 |
| oceania.visitor | assets/ChatGPT Image 2026년 8월 14일 오후 06_38_56 (1).png | 1254x1254 | O | 39 | p08 | 추정: 배낭 여행자 소녀 |
| oceania.island | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_17 (5).png | 1254x1254 | O | 98 | p08 | 산호초·바다거북 섬 |
| icon.listening | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_53 (9).png | 1254x1254 | O | 25 | p09 | 대체 배정: 하트 장식 나침반 원형 엠블럼 → 경청 아이콘 |
| icon.heart_speech | assets/ChatGPT Image 2026년 8월 14일 오후 06_39_02 (9).png | 1254x1254 | O | 20 | p09 | 대체 배정: 날개·하트 나침반 아이콘 → 하트 말풍선 아이콘 |
| asia.costume1 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_06 (6).png | 1254x1254 | O | 50 | p04 | 분홍 한복(의상 단품) — 아시아 의상 카드 |
| asia.costume2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_07 (8).png | 1254x1254 | O | 52 | p04 | 중국 전통 저고리(의상 단품) — 아시아 의상 카드 |
| asia.costume3 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_07 (7).png | 1254x1254 | O | 55 | p04 | 사리(의상 단품) — 아시아 의상 카드 |
| asia.costume4 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_30 (3).png | 1254x1254 | O | 42 | p04 | 분홍 살와르 카미즈(의상 단품) — 아시아 의상 카드 |
| americas.food1 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_38 (1).png | 1254x1254 | O | 45 | p07 | 샌드위치 급식판 — 미주 점심 미션 카드 |
| americas.food2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_38 (2).png | 1254x1254 | O | 68 | p07 | 타코 접시 — 미주 점심 미션 카드 |
| americas.food3 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_39 (3).png | 1254x1254 | O | 69 | p07 | 콩·곡물 요리 접시 — 미주 점심 미션 카드 |
| africa.instrument4 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_55 (7).png | 1254x1254 | O | 71 | p06 | 칼림바(엄지 피아노) — 아프리카 악기 확장 |
| africa.instrument5 | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_57 (8).png | 1254x1254 | O | 58 | p06 | 코라(현악기) — 아프리카 악기 확장 |
| africa.stage | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_59 (10).png | 1254x1254 | O | 114 | p06 | 바오밥 나무 북 무대 — 아프리카 리듬 미션 무대 히어로 |
| africa.emblem | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_59 (9).png | 1254x1254 | O | 46 | p06 | 북 문양 아프리카 엠블럼 — 미션 완료 장식 |
| europe.heritage2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_04 (2).png | 1254x1254 | O | 73 | p05 | 사그라다 파밀리아 미니어처 — 유럽 문화유산 카드 |
| europe.heritage3 | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_05 (3).png | 1254x1254 | O | 64 | p05 | 노이슈반슈타인 성 미니어처 — 유럽 문화유산 카드 |
| europe.heritage4 | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_05 (4).png | 1254x1254 | O | 84 | p05 | 풍차 마을 미니어처 — 유럽 문화유산 카드 |
| oceania.sydney | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_16 (4).png | 1254x1254 | O | 86 | p08 | 시드니 오페라하우스·하버브리지 섬 — 오세아니아 히어로 |
| oceania.island2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_17 (6).png | 1254x1254 | O | 86 | p08 | 열대 산악 섬 미니어처 — 오세아니아 관점 카드 배경 |
| oceania.island3 | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_17 (7).png | 1254x1254 | O | 86 | p08 | 야자수 오두막 해변 섬 — 오세아니아 관점 카드 배경 |
| reward.turtle_medal | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_18 (9).png | 1254x1254 | O | 62 | p08 | 바다거북 원형 메달 — 오세아니아 미션 보상 |
| reward.trophy | assets/ChatGPT Image 2026년 8월 14일 오전 03_57_07 (3).png | 1254x1254 | O | 58 | p10 | 지구본 트로피 — 완주 보상 연출 |
| reward.medal2 | assets/ChatGPT Image 2026년 8월 14일 오전 03_57_07 (4).png | 1254x1254 | O | 54 | p10 | 보라 리본 지구 메달 — 보상 변형 |
| reward.certificate | assets/ChatGPT Image 2026년 8월 14일 오전 04_00_42.png | 1254x1254 | O | 47 | p10 | 인증서 두루마리 — 최종 인증서 화면 |
| reward.wreath | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_52 (5).png | 1254x1254 | O | 77 | p10 | 지구 장식 월계수 화환 — 완주 화면 프레임 장식 |
| reward.star3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_58 (8).png | 1295x1214 | O | 39 | p10 | 3D 별 훈장 펜던트 — 보상 연출 |
| prop.journal | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_49 (1).png | 1254x1254 | O | 62 | p03 | 보라색 여행 일지(닫힘) — 여권/기록 화면 소품 |
| prop.scrapbook | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_50 (2).png | 1254x1254 | O | 68 | p03 | 펼친 여행 스크랩북 — 여권/기록 화면 소품 |
| prop.globe_glow | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_52 (4).png | 1254x1254 | O | 72 | p02 | 반짝이는 지구본 — 지도 화면 장식 |
| prop.treasure | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_52 (6).png | 1254x1254 | O | 79 | p10 | 보물상자(나침반·보석) — 완주 보상 연출 |
| char.boy3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_56 (1).png | 1024x1536 | O | 31 | p01 | 소년 캐릭터 3D 렌더 — 타이틀/안내 히어로 후보 |
| prop.plane3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_56 (2).png | 1536x1024 | O | 33 | p01 | 장난감풍 프로펠러 비행기 3D — 타이틀 장식 |
| prop.globe3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_58 (3).png | 1024x1536 | O | 33 | p02 | 파란 지구본 3D(받침대) — 지도 화면 히어로 |
| prop.book3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_58 (4).png | 1536x1024 | O | 24 | p09 | 펼친 책 3D — 대화 미션 소품 |
| prop.compass3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_58 (5).png | 1224x1285 | O | 38 | p02 | 원형 나침반 3D — 지도/미션 히어로 |
| prop.portal3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_58 (6).png | 1312x1199 | O | 45 | p02 | 포털 아치문 3D — 미션 입장 연출 |
| prop.puzzle3d | 3d assets/ChatGPT Image 2026년 8월 14일 오후 05_51_58 (7).png | 1230x1278 | O | 32 | p10 | 퍼즐 지구본 3D — completion-globe 슬롯 후보 |
| deco.landmark_liberty | assets/ChatGPT Image 2026년 8월 14일 오전 03_22_55 (5).png | 1254x1254 | O | 42 | p07 | 자유의 여신상 섬 미니어처 — 미주 미션 장식 |
| deco.landmark_eiffel | assets/ChatGPT Image 2026년 8월 14일 오전 03_22_57 (6).png | 1254x1254 | O | 45 | p05 | 에펠탑 섬 미니어처 — 유럽 미션 장식 |
| deco.landmark_rio | assets/ChatGPT Image 2026년 8월 14일 오전 03_22_58 (7).png | 1254x1254 | O | 48 | p07 | 리우 예수상 섬 미니어처 — 미주 미션 장식 |
| deco.landmark_taj | assets/ChatGPT Image 2026년 8월 14일 오전 03_22_58 (8).png | 1254x1254 | O | 52 | p04 | 타지마할 섬 미니어처 — 아시아 미션 장식 |
| deco.landmark_sydney | assets/ChatGPT Image 2026년 8월 14일 오전 03_22_58 (9).png | 1254x1254 | O | 50 | p08 | 시드니 오페라하우스 섬 미니어처 — 오세아니아 장식 |
| deco.landmark_pyramid | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_20 (3) (1).png | 1254x1254 | O | 35 | p06 | 피라미드·스핑크스 섬 미니어처 — 아프리카 미션 장식 |
| deco.signpost | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_13 (10).png | 1254x1254 | O | 38 | p02 | 세계 랜드마크 이정표 팻말 — 지도 화면 장식 |
| deco.map_kit | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_13 (9).png | 1254x1254 | O | 36 | p03 | 지도·나침반·연필 세트 — 여권/준비 화면 장식 |
| deco.emblem_unity | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_12 (7).png | 1254x1254 | O | 38 | p10 | 지구·악수·국기 원형 엠블럼 — 완주 화면 장식 |
| deco.emblem_stamp | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_13 (8).png | 1254x1254 | O | 41 | p03 | 우표 장식 지구 메달 엠블럼 — 여권 화면 장식 |
| deco.explorer1 | assets/ChatGPT Image 2026년 8월 13일 오후 06_17_32 (2).png | 1254x1254 | O | 30 | p09 | 쌍안경 든 탐험 소년 — 대화/안내 장식 인물 |
| deco.explorer2 | assets/ChatGPT Image 2026년 8월 13일 오후 06_17_33 (4).png | 1254x1254 | O | 31 | p09 | 망원경 든 사파리 모자 소년 — 대화/안내 장식 인물 |
| deco.necklace | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_07 (9).png | 1254x1254 | O | 34 | p04 | 금 목걸이 장신구 — 아시아 미션 장식 |
| deco.scarf | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_08 (10).png | 1254x1254 | O | 34 | p04 | 연꽃 무늬 파란 스카프 — 아시아 미션 장식 |
| deco.norigae | assets/ChatGPT Image 2026년 8월 14일 오전 03_23_30 (4).png | 1254x1254 | O | 26 | p04 | 매듭 노리개 — 아시아 미션 장식 |
| deco.mask | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_05 (5).png | 1254x1254 | O | 44 | p05 | 베네치아 카니발 가면 — 유럽 미션 장식 |
| deco.tomato | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_05 (6).png | 1254x1254 | O | 34 | p05 | 토마토 상자(토마티나) — 유럽 미션 장식 |
| deco.accordion | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_06 (7).png | 1254x1254 | O | 44 | p05 | 아코디언과 음표 — 유럽 미션 장식 |
| deco.lantern_star | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_06 (8).png | 1254x1254 | O | 29 | p05 | 별 모양 등불 장대 — 유럽 미션 장식 |
| deco.tulip | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_06 (9).png | 1254x1254 | O | 40 | p05 | 튤립 바구니 — 유럽 미션 장식 |
| deco.violin | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_07 (10).png | 1254x1254 | O | 42 | p05 | 바이올린과 월계수 — 유럽 미션 장식 |
| deco.shell_compass | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_17 (8).png | 1254x1254 | O | 34 | p08 | 조개껍데기 나침반 — 오세아니아 미션 장식 |
| deco.sea_lantern | assets/ChatGPT Image 2026년 8월 14일 오전 03_24_18 (10).png | 1254x1254 | O | 38 | p08 | 바다 랜턴(빛나는 구슬) — 오세아니아 미션 장식 |
| deco.flight_kids | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_53 (7).png | 1536x1024 | O | 45 | p10 | 아이들 태운 비행기와 지구 — 완주 화면 장식 |
| deco.ring_frame | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_53 (8).png | 1254x1254 | O | 34 | p10 | 지구·핀 고리 프레임 — 사진/배지 프레임 장식 |
| deco.portal_globe | assets/ChatGPT Image 2026년 8월 14일 오후 04_15_54 (10).png | 1254x1254 | O | 48 | p02 | 소용돌이 포털 지구본 — 지도 전환 연출 장식 |
| (og) | og.png | 1536x1024 | X | 161 | 메타태그 | - |
| (favicon) | assets/ChatGPT Image 2026년 8월 13일 오후 05_42_10 (1).png | - | O | 4 | 전역 | - |

note 에 "추정"이 있는 항목은 원본에 국가·역할 단서가 없어 이미지 내용으로 추정 배정했고, "대체 배정"은 설계 문서의 아이콘(경청·하트 말풍선)을 분위기가 맞는 하트 나침반 계열 이미지로 대신 채운 것이다.

## 2. 미배정(unused) 잔여 목록 — 28장, 전부 의도적 제외

| 원본 파일 | 내용 | 제외 사유 |
|---|---|---|
| assets/...06_17_34 (5).png | 자유의 여신상 섬 | 근접 중복(03_22_55 (5) 채택) |
| assets/...06_17_35 (6).png | 에펠탑 섬 | 근접 중복(03_22_57 (6) 채택) |
| assets/...06_17_35 (7).png | 리우 예수상 섬 | 근접 중복(03_22_58 (7) 채택) |
| assets/...06_17_36 (8).png | 피라미드 섬 | 근접 중복(03_23_20 (3) (1) 채택) |
| assets/...06_17_36 (9).png | 타지마할 섬 | 근접 중복(03_22_58 (8) 채택) |
| assets/...06_17_37 (10).png | 시드니 섬 | 근접 중복(03_22_58 (9) 채택) |
| assets/...03_22_52 (1).png | 돋보기 로봇 비행기 | plane.alt2 와 중복 |
| assets/...03_22_53 (2).png | 쌍안경 소년 | deco.explorer1 과 중복 |
| assets/...03_22_54 (3).png | 손 흔드는 소녀 | greeting.colombia 와 중복 |
| assets/...03_22_55 (4).png | 망원경 소년 | deco.explorer2 와 중복 |
| assets/...03_23_06 (1).png | 초록 로봇 비행기 | plane.main 색 변형 |
| assets/...03_23_18 (1).png | 쌍안경 소년 | deco.explorer1 과 중복 |
| assets/...03_23_20 (2) (1).png | 자유의 여신상 섬 | deco.landmark_liberty 와 중복 |
| assets/...03_23_27 (1).png | 중국 전통복 소년 | asia.child2 와 중복 |
| assets/...03_23_29 (2).png | 태국 전통복 소녀 | asia.child3 와 중복 |
| assets/...06_36_07 (1)~(10).png (10장) | 3D 렌더 로봇 비행기 색상 변형 | 전량 알파 없음(배경 박힘, sharp 확인) — 스프라이트로 부적합 |
| 3d assets/...05_52_00 (10).png | 원형 탁자 | 화면 용도 없음 |
| 3d assets/...05_52_02 (11).png | 소년 T포즈(투명) | 리깅 소스, 2D 화면 용도 없음 |
| 3d assets/...05_52_03 (12).png | 소년 T포즈 | 리깅 소스, 알파 없음 |

## 3. missing 목록 (코드에서 SVG 대체)

- europe.map — 유럽 지도 이미지: 원본에 없음. missionEurope.ts 가 hasAsset 가드로 참조하며 현재 SVG 대체 표현. 유럽 지도 이미지를 새로 만들면 이 ID로 등록.
- (해소) icon.listening / icon.heart_speech — 하트 나침반 계열 이미지로 대체 배정 완료(1절).

## 4. 중복 정리

동일 중복 23장은 _unused/duplicates/ 로 이동 완료(이전 작업). 근접 중복(포즈·색·세대만 다른 변형)은 원본 폴더에 그대로 두고 위 2절에 제외 사유를 기록했다. 삭제는 하지 않는다.

## 5. 사운드 목록

BGM 6곡 (sound/): maintheme.mp3, stage1_asia.mp3, stage2_Europe.mp3, stage3_Africa.mp3, stage4_America.mp3, stage5_Oceania.mp3
효과음 10종 (public/sound/sfx/): sfx_tap.mp3, sfx_pickup.mp3, sfx_drop.mp3, sfx_success.mp3, sfx_partial.mp3, sfx_stamp.mp3, sfx_complete.mp3, sfx_whoosh.mp3, sfx_beat_low.mp3, sfx_beat_high.mp3

리듬 미션은 beat_low·beat_high 파일 대신 WebAudio 합성 박자를 현재 사용하고, 두 파일은 이후 교체용으로 보존한다.

## 6. 변환 결과 총량 (재매핑 후)

- public/assets/: WebP 112개, **6.95MiB** (재매핑 전 3.80MiB → 증가분 약 3.15MiB, 12MiB 예산 내)
- public/fonts/: 3개, 1.836MiB / public/sound/bgm/: 6개, 13.733MiB / public/sound/sfx/: 10개, 0.417MiB
- 변환 설정: 배경 1600px q78 / 캐릭터·소품·카드 512px q82 / 장식(deco) 384px q82 / 아이콘 256px / 로고 1024px, 알파 보존
- 신규 이미지는 전부 preload: "page"(해당 페이지 진입 시 로드)라 초기 로딩 전송량에는 영향 없음

## 7. Three.js 예약 위치

- passport-stamp 슬롯: 현재 prop.stamp WebP 폴백
- completion-globe 슬롯: 현재 reward.globe_puzzle WebP 폴백 — 대안으로 prop.puzzle3d(3D 렌더 퍼즐 지구본) 사용 가능
- Three.js 패키지와 GLB 파일은 없다. "3d assets/" 원본은 3D 모델이 아니라 래스터 렌더 이미지이며, 이번 재매핑에서 9장을 char.boy3d / prop.plane3d / prop.globe3d / prop.book3d / prop.compass3d / prop.portal3d / prop.puzzle3d / reward.star3d / prop.stamp 로 배정했다.
