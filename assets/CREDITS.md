# 에셋 출처 기록 (CREDITS)

## 이미지·BGM

- **자체 이미지**: 캐릭터·배경·장식은 프로젝트 자체 AI 생성(ChatGPT 이미지 생성) 원본이다. 원본→semantic ID 매핑과 라이선스 표기는 `src/content/asset-manifest.json`(`"license": "AI-generated (project original)"`) 참조.
- **BGM**: 6곡(`sound/` 원본 → `public/sound/bgm/`) 모두 프로젝트 자체 제작(AI 생성)으로 외부 출처 없음.

### 첫 화면 한국 중심 세계지도

`background/bg_title_korea_centered_v2.png`는 2026-08-23 프로젝트용 이미지 생성 도구로 새로 제작했다.
한국·한반도를 지구의 시각 중심에 두고, 제목과 좌우 캐릭터가 겹쳐도 지도가 읽히도록 구성한 자체 AI 생성 원본이다.

### 내가 만든 여행 여권

`assets/generated/passport_builder_open_v2.png`는 2026-08-23 프로젝트용 이미지 생성 도구로 새로 제작했다.
아이의 선택이 실제 결과물에 남도록 탐험가 사진칸, 비행기 스티커칸, 빈 도장칸을 갖춘 펼친 여권 프레임이며,
페이지 위의 이름과 선택 이미지는 웹 화면에서 실시간으로 합성한다. 자체 AI 생성 원본이다.

### 프라하 실제 사진 (유럽 미션)

아래 사진은 Unsplash에서 내려받아 화면 카드용 WebP로 리사이즈·재인코딩했다. 모두
[Unsplash License](https://unsplash.com/license)에 따라 무료 사용 및 수정이 가능한 사진이며,
사진의 저작권은 각 촬영자에게 있다. 다운로드·가공 날짜: 2026-08-22.

| 파일 | 장소 | 촬영자 | 출처 URL | 라이선스 |
|---|---|---|---|---|
| europe_prague_charles_bridge.webp | 카를교 | Ryan Lum | https://unsplash.com/photos/1ak3Z7ZmtQA | Unsplash License |
| europe_prague_castle.webp | 프라하성 전망 | Rafael Sales | https://unsplash.com/photos/_D2u9vR6TR8 | Unsplash License |
| europe_prague_clock.webp | 프라하 천문시계 | Mathis Mauprivez | https://unsplash.com/photos/UQjtvIBrAYs | Unsplash License |
| europe_prague_old_town.webp | 구시가 광장 | Ronin | https://unsplash.com/photos/zNbNkIYboFY | Unsplash License |
| europe_prague_lennon_wall.webp | 레넌 벽 | Red Mirror | https://unsplash.com/photos/f303VzauP6w | Unsplash License |
| europe_prague_tram.webp | 프라하 트램 거리 | Kevin Andre | https://unsplash.com/photos/c1uN4ly-YUY | Unsplash License |

### 유럽 관심 창 생성 그림

아래 파일은 2026-08-30에 프로젝트용으로 각각 한 장면씩 생성한 원본이며, 화면에서는 사실 사진이 아닌 `관찰 그림`으로 표시한다. 장소 표현은 교사 검토 전까지 `needsReview: true` 상태로 둔다.

| 파일 | 장면 | 제작 방식 | 라이선스 |
|---|---|---|---|
| europe_france_seine.webp | 프랑스 센강 곁 공공 공간 | OpenAI 이미지 생성 | AI-generated project original |
| europe_france_market.webp | 프랑스 리옹 시장 | OpenAI 이미지 생성 | AI-generated project original |
| europe_france_louvre.webp | 프랑스 루브르 안뜰 | OpenAI 이미지 생성 | AI-generated project original |
| europe_germany_berlin_tram.webp | 독일 베를린 도시 이동 | OpenAI 이미지 생성 | AI-generated project original |
| europe_germany_rhine.webp | 독일 라인강 풍경 | OpenAI 이미지 생성 | AI-generated project original |
| europe_italy_bologna.webp | 이탈리아 볼로냐 광장 | OpenAI 이미지 생성 | AI-generated project original |
| europe_italy_dolomites.webp | 이탈리아 돌로미티 | OpenAI 이미지 생성 | AI-generated project original |
| europe_spain_barcelona.webp | 스페인 바르셀로나 바닷가 | OpenAI 이미지 생성 | AI-generated project original |
| europe_spain_madrid_market.webp | 스페인 마드리드 시장 | OpenAI 이미지 생성 | AI-generated project original |
| europe_poland_vistula.webp | 폴란드 바르샤바 강변 | OpenAI 이미지 생성 | AI-generated project original |
| europe_poland_krakow.webp | 폴란드 크라쿠프 광장 | OpenAI 이미지 생성 | AI-generated project original |
| europe_poland_tatras.webp | 폴란드 타트라산맥 | OpenAI 이미지 생성 | AI-generated project original |
| europe_greece_acropolis.webp | 그리스 아테네 아크로폴리스 | OpenAI 이미지 생성 | AI-generated project original |
| europe_greece_thessaloniki.webp | 그리스 테살로니키 바닷길 | OpenAI 이미지 생성 | AI-generated project original |
| europe_greece_island_harbor.webp | 그리스 에게해 섬 항구 | OpenAI 이미지 생성 | AI-generated project original |

### 오세아니아 주민 대화 에셋

`oceania_residents_lineup.webp`와 `oceania_resident_{youth,researcher,fisher,elder}-v2.webp`는
2026-08-22 프로젝트용 이미지 생성 도구로 새로 제작한 원본 에셋이다. 태평양 섬 공동체의 다양한 세대와 역할을
한 가지 전형으로 묶지 않도록 청소년·해양 연구자·어부·공동체 원로로 나누어 디자인했다.

### 아프리카 악기 실물 사진

아래 사진은 Wikimedia Commons의 각 파일 설명 페이지에서 재사용 조건을 확인한 뒤 내려받았다.
게임 카드에 맞게 회전 보정·640×420 중앙 자르기·WebP 재인코딩을 했으며, 다운로드·가공 날짜는 2026-08-23이다.

| 파일 | 악기·장소 | 촬영자 | 출처 URL | 라이선스 |
|---|---|---|---|---|
| africa_photo_djembe.webp | 가나 아위아 공예 마을의 젬베 | ZSM | https://commons.wikimedia.org/wiki/File:Djembe_drums.jpg | CC BY 3.0 |
| africa_photo_talkingdrum.webp | 나이지리아 콰라주의 토킹드럼 | AYOOLA,B.F | https://commons.wikimedia.org/wiki/File:Talking_drum._Offa_Kwara_State.jpg | CC BY-SA 4.0 |
| africa_photo_shekere.webp | 셰케레 | Freddythehat | https://commons.wikimedia.org/wiki/File:Shekere.jpg | Public domain |
| africa_photo_kalimba.webp | 중앙아프리카 왕립박물관의 칼림바 | Daderot | https://commons.wikimedia.org/wiki/File:Kalimba_-_Royal_Museum_for_Central_Africa_-_DSC07087.JPG | CC0 1.0 |
| africa_photo_kora.webp | 세네갈 만딩카 코라 연주자 Jali Fily Sissokho | Kevin Walsh (kevinzim) | https://commons.wikimedia.org/wiki/File:Kora-Player2.jpg | CC BY 2.0 |

`africa_photo_talkingdrum.webp`는 CC BY-SA 4.0 조건에 따라 같은 라이선스로 제공한다.

## 효과음 (sound/bfx/)

모든 효과음은 Pixabay에서 다운로드했으며, [Pixabay Content License](https://pixabay.com/service/license-summary/) 적용 대상입니다.
크레딧 표기 의무 없음, 상업적 사용 가능. 다운로드 날짜: 2026-08-14.

| 파일 | 원제목 | 출처 URL | 라이선스 | 길이 |
|---|---|---|---|---|
| sfx_tap.mp3 | Clean Minimal Pop | https://pixabay.com/sound-effects/clean-minimal-pop-467466/ | Pixabay Content License | 1.0초 |
| sfx_pickup.mp3 | Bubble Pop 04 | https://pixabay.com/sound-effects/people-bubble-pop-04-323580/ | Pixabay Content License | 1.1초 |
| sfx_drop.mp3 | soft_pop | https://pixabay.com/sound-effects/film-special-effects-soft-pop-538611/ | Pixabay Content License | 0.5초 |
| sfx_success.mp3 | Correct | https://pixabay.com/sound-effects/technology-correct-472358/ | Pixabay Content License | 1.3초 |
| sfx_partial.mp3 | Soft Notification | https://pixabay.com/sound-effects/film-special-effects-soft-notification-146623/ | Pixabay Content License | 1.4초 |
| sfx_stamp.mp3 | traditional stamp | https://pixabay.com/sound-effects/film-special-effects-traditional-stamp-44189/ | Pixabay Content License | 1.7초 |
| sfx_complete.mp3 | Success Fanfare Trumpets | https://pixabay.com/sound-effects/film-special-effects-success-fanfare-trumpets-6185/ | Pixabay Content License | 3.9초 |
| sfx_whoosh.mp3 | Thin Swoosh | https://pixabay.com/sound-effects/film-special-effects-thin-swoosh-352756/ | Pixabay Content License | 1.6초 |
| sfx_beat_low.mp3 | Drum One Shot Kick | https://pixabay.com/sound-effects/musical-drum-one-shot-kick-383868/ | Pixabay Content License | 0.6초 |
| sfx_beat_high.mp3 | Woodblock Sample 2 | https://pixabay.com/sound-effects/musical-woodblock-sample-2-320883/ | Pixabay Content License | 2.0초 |

### 아프리카 악기 효과음 (리듬 시퀀서용 원샷)

아프리카 미션 리듬 시퀀서에서 쓰는 실제 악기 원샷 8종. 전량 Pixabay에서 다운로드했으며
[Pixabay Content License](https://pixabay.com/service/license-summary/) 적용 대상이라 크레딧 표기 의무 없음, 상업적 사용 가능.
다운로드 날짜: 2026-08-17.

| 파일 | 원제목 | 출처 URL | 라이선스 | 길이 | 크기 |
|---|---|---|---|---|---|
| sfx_djembe_low.mp3 | mini djembe hit | https://pixabay.com/sound-effects/musical-mini-djembe-hit-80178/ | Pixabay Content License | 0.60초 | 10.5KB |
| sfx_djembe_high.mp3 | mini djembe hit | https://pixabay.com/sound-effects/musical-mini-djembe-hit-80178/ | Pixabay Content License | 0.70초 | 12.2KB |
| sfx_talkingdrum.mp3 | TALKING DRUM | https://pixabay.com/sound-effects/musical-talking-drum-318911/ | Pixabay Content License | 0.75초 | 13.1KB |
| sfx_shaker.mp3 | cabasa back shake | https://pixabay.com/sound-effects/film-special-effects-cabasa-back-shake-44019/ | Pixabay Content License | 0.94초 | 16.3KB |
| sfx_kalimba.mp3 | Kalimba G4 | https://pixabay.com/sound-effects/musical-kalimba-g4-47324/ | Pixabay Content License | 2.00초 | 33.5KB |
| sfx_kora.mp3 | Kora | https://pixabay.com/sound-effects/musical-kora-274924/ | Pixabay Content License | 1.80초 | 29.7KB |
| sfx_clap.mp3 | Clap-10 | https://pixabay.com/sound-effects/musical-clap-10-36723/ | Pixabay Content License | 1.06초 | 18.1KB |
| sfx_count.mp3 | Woodblock Drum @MRSTOKES302 | https://pixabay.com/sound-effects/musical-woodblock-drum-mrstokes302-426359/ | Pixabay Content License | 1.04초 | 17.6KB |

**가공 내역**: 위 8종은 원본을 그대로 쓰지 않고 게임용 원샷으로 다음과 같이 가공했다.
Pixabay Content License는 개작(modify)을 허용하므로 라이선스상 문제 없다.

- **구간 추출**: 원본이 연주·루프인 경우 자연스러운 타점(onset)에서 한 타만 잘라냈다.
  - `sfx_djembe_low` = 원본 2.595초 지점의 저음 타, `sfx_djembe_high` = 원본 0초 지점의 밝은 타 (원본은 4타 샘플)
  - `sfx_talkingdrum` = 원본 3.960초 지점, `sfx_kora` = 원본 4.020초 지점(악구 시작), `sfx_kalimba` = 첫 음 + 여운
  - `sfx_shaker`·`sfx_clap`·`sfx_count`는 원본이 이미 원샷이라 구간을 자르지 않았다.
- **디클릭 페이드**: 잘린 지점의 클릭음 방지를 위해 앞 3~8ms, 뒤 60~300ms 페이드 적용.
- **레벨 정규화**: 8종 모두 피크 −3dBFS로 통일. 원본 피크가 −29.7dB(cabasa)에서 −1.4dB(clap)까지 28dB나 벌어져 있어,
  그대로 두면 시퀀서에서 악기별 음량이 들쭉날쭉해진다.
- 인코딩: MP3 128kbps. 원본 → `sound/bfx/` 보관, 빌드용 사본 → `public/sound/sfx/`.

## 폰트

| 파일 | 폰트 | 출처 | 라이선스 |
|---|---|---|---|
| public/fonts/jua-400.woff2 | Jua (Woowahan Bros) | fontsource via jsdelivr | SIL OFL 1.1 |
| public/fonts/pretendard-400.woff2 | Pretendard Regular | github.com/orioncactus/pretendard v1.3.9 | SIL OFL 1.1 |
| public/fonts/pretendard-700.woff2 | Pretendard Bold | github.com/orioncactus/pretendard v1.3.9 | SIL OFL 1.1 |

## 환경 신호 현장 사진 (2026-08-30 추가)

- `public/assets/env_signal_{morocco,colombia,australia,tanzania}.webp` — 최종 단계 "하나의 지구, 여섯 개의 신호"의 친구가 보낸 현장 사진. 프로젝트 자체 AI 생성(힉스필드 nano_banana) 원본 `assets/environment/*.png`. 실제 사진이 아닌 **개념 일러스트**이며, 특정 지역의 현재 상태를 기록한 자료가 아니다. 화면에는 "이 친구가 사는 지역에서 관찰한 여러 모습 중 하나" 범위 안내와 함께 표시한다. 네팔·일본 신호는 기존 `asia_nepal_3.webp`, `asia_japan_3.webp`를 재사용한다.
- `public/assets/env_issue_water_sharing.webp` — 최종 단계의 네 번째 환경문제 "물 부족과 공평한 사용" 선택 카드. 프로젝트 자체 AI 생성 이미지이며, 물이 부족한 지역에서 마을·농장·가정이 물을 함께 나누는 학습용 가상 장면이다. 실제 특정 지역이나 인물을 기록한 사진이 아니다.

## 인트로·엔딩 영상 (2026-08-30 추가)

- `public/video/intro.mp4`, `public/video/final.mp4` — 사용자가 제작해 넣은 원본 `intro/intro.mp4`, `final/final.mp4`(1920×1080, 각 16~17초)를 1280×720·H.264 CRF27로 변환하고, 소리는 원본 배경음 `intro/intro.MP3`·`final/final.MP3`를 -16 LUFS로 정규화해 AAC 128k로 넣었다(3.5MB·4.9MB). 포스터 `*_poster.jpg`는 영상 첫 장면. 자막은 영상에 굽지 않고 `src/pages/title.ts`(INTRO_CUES)·`src/pages/completion.ts`(FINAL_CUES)에서 HTML로 표시한다.

## 아프리카 악기 연주 음원 (2026-08-30 추가) — `public/sound/instrument/`

원본은 `assets/sound-src/instrument/`에 보존. 모두 Pixabay 다운로드, [Pixabay Content License](https://pixabay.com/service/license-summary/) 적용(표기 불필요·상업 사용 가능). -16 LUFS로 정규화하고 30초 이내로 잘라 페이드아웃했다.

| 파일 | 제목 · 업로더 | 출처 | 라이선스 | 처리 | 확보일 |
|---|---|---|---|---|---|
| djembe.mp3 | DJEMBE BEAT #4 (slow pace) · ETHNICsoundscapes | https://pixabay.com/sound-effects/musical-djembe-beat-4-slow-pace-323061/ | Pixabay Content License | 0:42 → 앞 30초 | 2026-08-30 |
| talkingdrum.mp3 | TALKING DRUM · ETHNICsoundscapes | https://pixabay.com/sound-effects/musical-talking-drum-318911/ | Pixabay Content License | 0:17 그대로 | 2026-08-30 |
| shekere.mp3 | Sekeregroove1_120bpm · freesound_community | https://pixabay.com/sound-effects/musical-sekeregroove1-120bpm-45003/ | Pixabay Content License | 0:08 × 3회 이어붙임 = 0:24 | 2026-08-30 |
| kalimba.mp3 | Kalimba african · freesound_community | https://pixabay.com/sound-effects/musical-kalimba-african-34977/ | Pixabay Content License | 0:44 → 앞 30초 | 2026-08-30 |
| kora.mp3 | Kora Kora (loop) · Grumpynora | https://pixabay.com/sound-effects/musical-kora-kora-loop-390911/ | Pixabay Content License | 0:30 그대로 | 2026-08-30 |

"Editorial Use Only"·인물·브랜드 포함 여부: 음원이라 해당 없음. 연주자 실명 표기 여부는 각 페이지에서 확인하지 않음(`NOT CHECKED`).

## 아프리카 지역 탐험 장면 (2026-08-31 추가)

아프리카 권역 탐험 상호작용용 16:9 학습 일러스트 5종과 나라별 대표 장소 장면 10종. OpenAI 내장 이미지 생성 도구로 제작한 프로젝트 원본이며, 특정 시점의 실제 현장 사진이나 특정 공동체 전체를 대표하는 기록물이 아니다. 각 그림은 현대의 학교·교통·시장·작업 공간과 자연환경을 함께 보여 주고, 텍스트·국기·국경·관광 클리셰를 넣지 않도록 생성했다. 대표 장소 장면은 프로젝트에 1280×720 WebP로 적용했다.

| 파일 | 학습 장면 | 라이선스 |
|---|---|---|
| `public/assets/africa_region_north.webp` | 지중해 연안 도시 → 아틀라스산맥 → 사막 가장자리의 물과 농업 | AI-generated (project original) |
| `public/assets/africa_region_west.webp` | 대서양 항구 → 강과 현대 도시 → 직조·음악의 생활 공간 | AI-generated (project original) |
| `public/assets/africa_region_central.webp` | 콩고분지 숲 → 큰 강과 이동 → 강변 도시의 오늘 | AI-generated (project original) |
| `public/assets/africa_region_east.webp` | 고원 도시 → 큰 호수와 열곡 → 인도양 스와힐리 해안 | AI-generated (project original) |
| `public/assets/africa_region_south.webp` | 사막 해안 → 내륙 고원 도시 → 남쪽 해안의 문화 공간 | AI-generated (project original) |

나라별 대표 장소는 하산 2세 모스크, 기자 피라미드, 아산테 전통 건축물, 페데르브 다리, 포트 지저스, 파실 게비, 야운데 통일 기념비, 리메테 교차로 탑, 테이블산, 트위펠폰테인으로 구성했다. 장소 설명은 각 콘텐츠 파일에 연결한 UNESCO·정부·공식 관광 자료를 기준으로 작성했다.

## BGM 교체 (2026-08-30)

- `public/sound/bgm/stage5_oceania.mp3` — 원본 `sound/stage5_Oceania.mp3`("Ocean Discovery", seoulmovie, 2:26)로 교체. 프로젝트 자체 제작(AI 생성) 곡이라 외부 출처 없음. 이전 곡(1:48)은 `_unused/sound/stage5_oceania_20260814.mp3`로 이동.

## 아시아·오세아니아 권역 지도와 관찰 장면 (2026-08-31 추가)

OpenAI 내장 이미지 생성 도구로 제작한 프로젝트 원본이다. 실사 사진이 아니라 초등 지리 탐험 화면에 맞춘 밝은 3D 페인터리 학습 일러스트이며, 특정 시점의 현장 기록이나 한 국가·공동체 전체를 대표하는 자료가 아니다. 지도에는 국경·국기·텍스트를 넣지 않았고, 장면은 자연환경·오늘날의 생활·살아 있는 문화가 서로 구분되도록 구성했다. 원본 PNG는 도구 저장소에 보존하고, 프로젝트에는 960px 관찰 카드와 1280px 지도 WebP(품질 84)를 사용한다.

- 아시아: 기존 권역 지도와 나라별 관찰 장면에 대한민국 신규 3장, 동·동남·남·중앙·서아시아 8개 나라의 대표 장소 8장을 추가
- 오세아니아: 기존 권역 지도와 자연·생활·문화 장면에 8개 나라의 대표 장소 8장을 추가
- 라이선스: AI-generated (project original)
- 생성 프롬프트와 자산 대응표: `docs/ASIA_OCEANIA_IMAGEGEN_PROMPTS_20260831.md`

## 아메리카 지도와 나라별 탐험 장면 (2026-08-31 추가)

OpenAI 내장 이미지 생성 도구로 제작한 프로젝트 원본이다. 아메리카 전체 학습 지도 1장과 캐나다·멕시코·브라질·페루의 탐험 지점 각 3장, 나라별 대표 장소 각 1장으로 구성했다. 모두 실사 사진이 아닌 밝은 3D 페인터리 게임 일러스트이며, 사람을 한 국가의 전형으로 표현하지 않고 자연환경과 오늘날 생활의 지역별 차이를 보여 주도록 제작했다. 원본 PNG는 도구 저장소에 보존하고 프로젝트에는 1280×720 WebP를 사용한다.

- 지도: `americas_map_regional_v2.webp`
- 캐나다: `americas_canada_{west,plains,east,landmark}_v2.webp`
- 멕시코: `americas_mexico_{coast,highland,mountain,landmark}_v2.webp`
- 브라질: `americas_brazil_{upriver,riverside,city,landmark}_v2.webp`
- 페루: `americas_peru_{coast,andes,amazon,landmark}_v2.webp`
- 라이선스: AI-generated (project original)
- 생성 프롬프트와 자산 대응표: `docs/AMERICAS_IMAGEGEN_PROMPTS_20260831.md`

## 아메리카 비행기 가이드 캐릭터 v2 (2026-09-01 추가)

- `public/assets/plane_guide_clean_v2.webp` — 아메리카 첫 화면의 몽실이 가이드 캐릭터. OpenAI 내장 이미지 생성 도구로 단일 캐릭터를 재생성한 뒤, 체크무늬 배경을 실제 알파 투명으로 다시 추출했다.
- 원본: `assets/plane_guide_clean_v2.png` (1261×1247 RGBA), 적용본: WebP 298KB.
- 라이선스: AI-generated (project original)

## 지구회의 기후 카드 그림 (2026-09-02 추가)

- `public/assets/env_issue_climate_glacier.webp` — 산 정상과 빙하가 세로 카드 안에서 잘리지 않도록 상단 안전 여백을 둔 히말라야 빙하·계곡물 관찰 장면.
- OpenAI 내장 이미지 생성 도구로 만든 프로젝트 원본이며, 실제 인물이나 특정 현장 기록을 재현한 사진이 아닌 초등 환경교육용 합성 장면이다.
- 원본: `generated_images/exec-ab42cd59-ae3e-4ea7-8617-21276b4cfd94.png`, 적용본: 800×1000 WebP.
- 라이선스: AI-generated (project original)

## 최종 지구회의 신호 지도·별밤슝슝 복원 (2026-09-02 추가)

- `public/assets/earth_signal_map_v2.webp` — 네팔 빙하, 일본의 더운 해안, 모로코의 마른 밭, 탄자니아의 줄어든 물웅덩이, 호주의 백화 산호, 콜롬비아의 해안 쓰레기를 실제 지역에 배치한 클릭용 세계지도. 원본은 `assets/earth-council/earth_signal_map_v2.png`.
- `public/assets/plane_portrait_navy_restored_transparent_v2.webp` — 자동 투명화로 외곽이 손상됐던 별밤슝슝을 양쪽 날개·꼬리·추진기·하단 착륙부·가방까지 온전히 보이도록 다시 제작한 투명 선택 이미지. 알파 원본은 `assets/generated/plane_portrait_navy_transparent_v3.png`.
- 두 자산 모두 OpenAI 내장 이미지 생성 도구로 만든 프로젝트 원본이며, 별밤슝슝은 단색 크로마 배경을 로컬에서 제거해 투명 WebP로 변환했다. 라이선스: AI-generated (project original).
