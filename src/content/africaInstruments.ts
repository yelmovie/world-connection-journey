/**
 * 아프리카 악기 자료. 미션 화면에는 소개만 보여 주고,
 * 사진·음원 출처는 설정의 저작권 고지 한 곳에서만 안내한다.
 */
export interface AfricaInstrument {
  id: string;
  photoId: string;
  name: string;
  intro: string;
  place: string;
  material: string;
  how: string;
  clip: string;
  /** 사진·음원 출처 — 설정 > 이미지·소리·저작권 고지에서만 표시한다. */
  source: string;
  alt: string;
}

export const AFRICA_INSTRUMENTS: AfricaInstrument[] = [
  {
    id: 'africa.instrument1', photoId: 'africa.photo.djembe', name: '젬베',
    intro: '손바닥으로 치는 큰 북이야. 마을 잔치와 춤에서 박자를 이끌어.',
    place: '가나·말리·기니 등 서아프리카의 여러 연주 맥락',
    material: '나무 몸통과 동물 가죽 등',
    how: '두 손으로 북면을 쳐. 치는 자리에 따라 낮은 소리와 높은 소리가 나.',
    clip: 'sound/instrument/djembe.mp3', source: 'Wikimedia Commons · CC BY 3.0',
    alt: '여러 젬베가 놓인 실물 사진'
  },
  {
    id: 'africa.instrument2', photoId: 'africa.photo.talkingdrum', name: '토킹드럼',
    intro: '소리 높낮이가 말처럼 오르내려서 "말하는 북"이라고 불려.',
    place: '나이지리아·가나 등 서아프리카의 여러 공동체',
    material: '나무 몸통, 가죽, 장력 줄',
    how: '팔에 끼우고 줄의 장력을 바꾸며 굽은 채로 북면을 쳐.',
    clip: 'sound/instrument/talkingdrum.mp3', source: 'Wikimedia Commons · CC BY-SA 4.0',
    alt: '나이지리아의 토킹드럼 실물 사진'
  },
  {
    id: 'africa.instrument3', photoId: 'africa.photo.shekere', name: '셰케레',
    intro: '말린 박에 구슬 그물을 둘러, 흔들면 자잘한 소리가 쏟아져.',
    place: '나이지리아를 비롯한 서아프리카의 여러 연주 맥락',
    material: '말린 박과 구슬 그물',
    how: '박을 흔들거나 손으로 쳐서 구슬이 표면을 스치게 해.',
    clip: 'sound/instrument/shekere.mp3', source: 'Wikimedia Commons · Public domain',
    alt: '구슬 그물을 두른 셰케레 실물 사진'
  },
  {
    id: 'africa.instrument4', photoId: 'africa.photo.kalimba', name: '칼림바',
    intro: '엄지로 튕기는 작은 건반 악기야. 맑고 동그란 소리가 나.',
    place: '아프리카 여러 지역에서 변화해 온 라멜라폰 계열',
    material: '나무 울림통과 금속 건반',
    how: '두 손으로 들고 엄지손가락으로 금속 건반을 튕겨.',
    clip: 'sound/instrument/kalimba.mp3', source: 'Wikimedia Commons · CC0',
    alt: '금속 건반이 달린 칼림바 실물 사진'
  },
  {
    id: 'africa.instrument5', photoId: 'africa.photo.kora', name: '코라',
    intro: '스물한 줄을 뜯는 큰 현악기야. 이야기를 노래로 전할 때 함께해.',
    place: '감비아·세네갈·말리 등 서아프리카의 여러 연주 맥락',
    material: '큰 박 울림통, 가죽, 여러 줄',
    how: '양손의 엄지와 집게손가락으로 줄을 뜯어 연주해.',
    clip: 'sound/instrument/kora.mp3', source: 'Wikimedia Commons · 재사용 가능 자료',
    alt: '세네갈 연주자가 코라를 연주하는 실물 사진'
  }
];
