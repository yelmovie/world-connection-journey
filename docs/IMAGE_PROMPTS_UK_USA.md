# 영국·미국 추가 이미지 프롬프트 (2026-09-03)

**2026-09-03 완료**: 9장 모두 생성해 `public/assets/*.webp`로 변환·연결했어요(원본 PNG는 `assets/generated/uk-usa/`, 변환 전 PNG는 `_unused/assets/`). 아래는 재생성이 필요할 때 쓰는 프롬프트 기록입니다.

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

## 여권 도장 · 남아메리카

여권 도장이 6대륙(아시아·유럽·아프리카·북아메리카·남아메리카·오세아니아)으로 늘면서 남아메리카 도장 그림이 하나 더 필요해요.
기존 도장 그림(`deco_landmark_taj / eiffel / pyramid / liberty / sydney.webp`)과 같은 세트로 보여야 합니다.

- **파일명**: `stamp_americas_south.png` (webp로 만들면 매니페스트 `stamp.americas_south`의 `src` 확장자만 바꾸기)
- **규격**: 정사각형 **384×384 이상**(1024×1024 권장), **배경 투명 PNG**
- **기존 도장의 생김새**: 둥근 파란 바다 원반 위에 떠 있는 작은 섬 미니어처. 섬 가운데에 랜드마크가 크게 서 있고, 주변에 작은 나무·바위·배·갈매기·구름, 뒤로는 도시나 산이 낮게 깔림. 3D 카툰 렌더, 따뜻하고 선명한 채도, 부드러운 조명, 글자 없음. 원반 바깥은 투명.

| 파일명 | 장면 | 프롬프트 |
|---|---|---|
| `stamp_americas_south.png` | 남아메리카 도장 · 마추픽추 | Machu Picchu ancient stone terraces and ruins on top of a small round floating island, tall green Andes mountain peaks rising behind, llamas on the grass terraces, a few fluffy clouds and a condor in the sky, the island sits on a round blue water disc like a miniature diorama badge, centered composition, **transparent background outside the disc**, same 3D cartoon miniature-island style as the existing landmark stamp set (Statue of Liberty island, Eiffel Tower island, Taj Mahal island, Pyramid island, Sydney Opera House island), square 1:1. |

## 중국
아시아 미션에 이미 **중국(베이징)** 장면 4장이 들어 있어 추가 그림이 필요 없어요.
