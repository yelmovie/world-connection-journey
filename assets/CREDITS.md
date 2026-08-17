# 에셋 출처 기록 (CREDITS)

## 이미지·BGM (자체 제작)

- **이미지**: 전량 프로젝트 자체 AI 생성(ChatGPT 이미지 생성) 원본이며 외부 저작물을 포함하지 않는다. 원본→semantic ID 매핑과 라이선스 표기는 `src/content/asset-manifest.json`(`"license": "AI-generated (project original)"`) 참조.
- **BGM**: 6곡(`sound/` 원본 → `public/sound/bgm/`) 모두 프로젝트 자체 제작(AI 생성)으로 외부 출처 없음.

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
