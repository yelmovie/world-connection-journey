# 영국·미국 추가 이미지 프롬프트 (2026-09-03)

지금은 `public/assets/`에 "사진 준비 중" 안내판(placeholder)이 같은 파일명으로 들어가 있어요.
**그림을 만들면 아래 파일명 그대로 덮어쓰기만 하면 됩니다** (매니페스트·데이터는 이미 연결됨).
webp로 만들었다면 `src/content/asset-manifest.json`에서 해당 항목의 `src` 확장자만 `.webp`로 바꾸세요.

## 공통 스타일 (기존 그림과 맞추기)
- 3D 렌더 카툰 스타일, 밝고 따뜻한 채도, 부드러운 조명, 초등학생 교육용. 글자·로고·워터마크 없음.
- 사람이 나오면 다양한 외모의 아이·어른, 특정 인물 묘사 금지. 국기·정치 상징 없음.
- 풍경 장면은 **가로 16:9 (1280×720 이상)**. 캐릭터는 **세로 3:4, 배경 투명 PNG**.
- 영어 프롬프트 뒤에 `--ar 16:9` 등 도구에 맞는 비율 옵션을 붙이세요.

공통 접두 프롬프트(영어):
`Bright 3D cartoon render for a children's educational game, soft warm lighting, clean composition, no text, no logos, no watermark, family-friendly.`

---

## 영국 (유럽 미션 · 관찰 장면 3장)

| 파일명 | 장면 | 프롬프트 |
|---|---|---|
| `europe_uk_dover.png` | 도버의 흰 절벽 해안 (자연과 공간) | White chalk cliffs of Dover on the English Channel, small harbor below with a ferry and fishing boats, green grass on top of the cliffs, seagulls, calm blue sea, wide landscape view. |
| `europe_uk_thames.png` | 런던 템스강 곁 등굣길 (오늘날의 생활) | Morning by the River Thames in London, children in school uniforms walking across a bridge, a red double-decker bus and black cab on the road, riverside path with people cycling, modern and old buildings mixed, no famous landmark needed. |
| `europe_uk_edinburgh.png` | 에든버러의 옛 성과 도시 (이어 온 문화 공간) | Edinburgh old castle on a rocky hill above the city, stone buildings and narrow streets below, people walking with umbrellas, soft afternoon light, wide view showing hill, castle and town together. |

## 미국 (북·남아메리카 미션 · 탐험 지점 4장 + 친구 캐릭터 1장)

| 파일명 | 장면 | 프롬프트 |
|---|---|---|
| `americas_scene_usa_west.png` | 서부 해안 | Foggy Pacific coast city in the western United States, long red suspension bridge over the bay, hills with colorful houses, sailboats, morning fog rolling in, wide landscape. |
| `americas_scene_usa_plains.png` | 중부 대평원 | Endless cornfields and wheat fields of the American Great Plains, a very long freight train crossing the flat land, big sky with clouds, a grain silo and farmhouse in the distance. |
| `americas_scene_usa_east.png` | 동부 도시 | East coast harbor city where a wide river meets the ocean, tall buildings, bridges, ferries and tugboats, people walking along the waterfront, sunny afternoon. |
| `americas_scene_usa_landmark.png` | 뉴욕의 자유의 여신상 | The Statue of Liberty on its island at the harbor entrance, ferry boats approaching, city skyline softly in the background, clear blue sky, respectful and bright. |
| `americas_student5.png` | 친구 캐릭터 **리암** (전신, 투명 배경) | Full-body 3D cartoon child character, about 11 years old, American boy named Liam with light brown curly hair and freckles, hoodie and jeans, holding a camera and a board game box, friendly smile, waving, standing pose, **transparent background**, same style as the other student characters (노아·카밀라·아나·마테오). |

> 리암은 아메리카 지도 핀·대화창 카드·문화 가방에 쓰여요. 기존 학생 캐릭터(`americas_student1~4.webp`)와 크기·시선·발 위치를 맞춰 주세요.

## 중국
아시아 미션에 이미 **중국(베이징)** 장면 4장이 들어 있어 추가 그림이 필요 없어요.
