# icon-prompts — UI 아이콘 교체 프롬프트

작성일: 2026-08-15

## 현재 상태: 교체 대상 없음

`src/` 전체를 이모지 코드포인트 범위(U+1F300–U+1FAFF)로 검색한 결과 **일치 0건**이다(2026-08-15, ripgrep `[\x{1F300}-\x{1FAFF}]` 재확인). UI는 이모지 대신 텍스트 기호(✓, ◐, ? 등)와 manifest 기반 WebP 이미지(`icon.compass` 등)를 사용하므로, 현재 아이콘으로 교체할 이모지가 없다.

## 향후 아이콘 추가 시 규격

새 아이콘이 필요해지면 아래 규격으로 생성·등록한다.

- **형식**: 투명 배경 PNG 또는 SVG. 래스터는 원본 256×256px 이상(빌드 파이프라인이 아이콘을 256px WebP로 변환 — `scripts/build-assets.mjs` 규격).
- **등록**: 파일을 직접 참조하지 말고 `src/content/asset-manifest.json`에 `icon.*` semantic ID로 등록한 뒤 `assetUrl()`/`hasAsset()`으로 사용한다. `license` 필드 기록 필수.
- **스타일**: 기존 에셋과 동일한 밝은 3D 카툰 렌더 톤(`icon.compass` 참고), 단일 오브젝트, 여백 최소화.

### 프롬프트 표 형식

아이콘 생성 요청 시 아래 표 형식으로 기록한다.

| semantic ID | 용도(페이지) | 프롬프트 | 규격 |
|---|---|---|---|
| icon.listening | p09 경청 단계 | 귀와 하트가 결합된 경청 아이콘, 밝은 3D 카툰 렌더, 투명 배경, 단일 오브젝트 | 투명 PNG 256px |
| icon.heart_speech | p09 공감 대화 | 하트가 담긴 말풍선 아이콘, 밝은 3D 카툰 렌더, 투명 배경, 단일 오브젝트 | 투명 PNG 256px |

위 두 줄은 docs/ASSET_AUDIT.md "3. missing 목록"에 기록된 미생성 아이콘(현재 코드는 SVG로 대체)의 예시 항목이다. 필수 작업은 아니며, 생성 시 이 표에 추가하고 assets/CREDITS.md에 출처를 기록한다.
