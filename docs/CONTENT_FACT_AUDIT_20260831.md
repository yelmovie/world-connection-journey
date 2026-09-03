# 국가·문화·지리 콘텐츠 사실 검증 기록

- 검증일: 2026-08-31
- 범위: 아메리카, 아시아, 유럽, 아프리카, 오세아니아, 여섯 친구 대화, 지구회의 환경 신호
- 원칙: 정부·UN·UNESCO·공공 연구기관 자료를 우선하고, 한 도시·가족·공동체 사례를 국가 전체의 특징으로 일반화하지 않는다.

## 이번에 바로잡은 내용

1. 베이징을 막연한 큰 강 도시로 표현한 장면을 베이징에서 저장성까지 이어지는 중국 대운하 사례로 수정했다.
2. 브라질 가상 친구의 돼지고기 제외 요청을 할랄 식사로 분류하지 않고 `pork_free_option`으로 분리했다.
3. 멕시코의 언어 설명을 국립토착언어연구소 분류에 맞춰 68개 토착 언어 집단의 언어가 쓰인다는 표현으로 구체화했다.
4. 일본의 주요 섬 설명에 오키나와를 포함하고 1만 4천 개가 넘는 작은 섬이라는 일본 통계국 설명을 반영했다.
5. 호주의 Aboriginal peoples와 Torres Strait Islander peoples를 하나의 원주민 문화로 묶지 않고 다양한 공동체로 표현했다.
6. 케냐의 스와힐리어는 국어이고 스와힐리어와 영어는 공용어라는 헌법 내용을 반영했다.
7. 남아프리카공화국은 남아프리카수어를 포함해 12개 공용어가 있다는 최신 정부 안내를 반영했다.
8. 사그라다 파밀리아는 2026년 예수 그리스도 탑 외관이 완성됐지만 영광의 파사드와 탑 내부 등 전체 공사는 계속된다고 유지했다.
9. 실제로 확인되지 않은 특정 마을·학교의 행동처럼 읽힐 수 있던 환경 대화를 조건형·학습용 사례 문장으로 바꿨다.

## 표현 안전장치

- 모든 친구와 여행자는 학습용 가상 인물이라고 콘텐츠 메타데이터와 화면 대화에서 고지한다.
- 생성 이미지는 실제 현장 사진이나 축척 지도라고 주장하지 않고 학습용 재현 이미지로 고지한다.
- 문화 사례는 특정 도시·공동체·가정의 한 사례이며 국가 전체를 대표하지 않는다는 범위 문구를 유지한다.
- 인사 방식은 국가 규칙 대신 각 가상 친구가 편하게 여기는 사례로 말한다.

## 핵심 공식 출처

| 검증 항목 | 공식 출처 |
| --- | --- |
| 국가·대륙·권역 분류 | UN Statistics M49: https://unstats.un.org/unsd/methodology/m49/ |
| 중국 대운하 | UNESCO World Heritage: https://whc.unesco.org/en/list/1443/ |
| 일본의 주요 섬과 섬 수 | Statistics Bureau of Japan: https://www.stat.go.jp/english/data/handbook/pdf/2024all.pdf |
| 캐나다 공식 언어 | Canada.ca: https://www.canada.ca/en/immigration-refugees-citizenship/services/settle-canada/language-skills.html |
| 멕시코 토착 언어 분류 | INALI Atlas: https://atlas.inali.gob.mx/inicio |
| 페루 공식 언어 | Congreso del Perú 헌법 제48조: https://www3.congreso.gob.pe/Docs/files/constitucion/constitucion-12-2024.pdf |
| 케냐 국어·공용어 | Kenya Constitution: https://klrc.go.ke/index.php/constitution-of-kenya/108-chapter-two-the-republic/173-7-national-official-and-other-languages |
| 남아프리카공화국 공용어 | South African Government: https://www.gov.za/about-sa/south-africas-people |
| Gnawa | UNESCO ICH: https://ich.unesco.org/en/RL/gnawa-01170 |
| Kente | UNESCO ICH: https://ich.unesco.org/en/RL/craftsmanship-of-traditional-woven-textile-kente-02130 |
| Ceebu Jën | UNESCO ICH: https://ich.unesco.org/en/RL/ceebu-jen-a-culinary-art-of-senegal-01748 |
| Gada system | UNESCO ICH: https://ich.unesco.org/en/RL/gada-system-an-indigenous-democratic-socio-political-system-of-the-oromo-01164 |
| Congolese rumba | UNESCO ICH: https://ich.unesco.org/en/RL/congolese-rumba-01711 |
| 카카두 공동 관리 | Australian Government: https://www.dcceew.gov.au/parks-heritage/national-parks/kakadu-national-park/management-and-conservation/park-management |
| 태평양 항해 교육 | UNESCO: https://www.unesco.org/en/articles/promoting-transmission-traditional-navigation-knowledge-pacific-classrooms |
| 뉴질랜드 해양 환경 | Ministry for the Environment: https://environment.govt.nz/publications/our-marine-environment-2025/ |
| 사그라다 파밀리아 공사 상태 | Sagrada Família 공식 사이트: https://sagradafamilia.org/en/-/la-grua-central-de-la-sagrada-familia-inicia-una-nova-etapa-despres-de-completar-l-exterior-de-la-torre-de-jesucrist?redirect=/en/ |

## 자동 회귀 검증

- 모든 지역 콘텐츠에 2026-08-31 검증일, 공식 출처, 가상 인물·재현 이미지 고지가 있는지 확인한다.
- `halal_meal` 오분류가 다시 들어오지 않는지 확인한다.
- 유럽·아시아·아프리카·오세아니아 지도 핀의 동서·남북 상대 관계가 뒤바뀌지 않는지 확인한다.
- 대륙 지도는 학습용 도식이므로 국경선·거리·면적을 측정하는 용도로 사용하지 않는다.
