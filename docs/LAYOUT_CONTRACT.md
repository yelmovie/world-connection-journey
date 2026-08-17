# 화면 레이아웃 계약 (전 페이지 필수)

목적: **겹침 0건 · 빈 공간 0 · 정보 최소화**. 초등학생이 "지금 뭘 눌러야 하는지" 1초 안에 알게 한다.

## 1. 페이지 골격 — 4행 그리드 (src/styles/base.css가 강제)

```
.page (grid: auto / 1fr / auto / auto)
├─ .top-bar      ← 행1: 뒤로/제목·리본/설정 (고정)
├─ .page-body    ← 행2: 유일한 스크롤 영역 (min-height:0)
├─ .guide-wrap   ← 행3: 마스코트 + 타이핑 말풍선 스트립 (겹침 불가)
└─ .bottom-bar   ← 행4: 다음 행동 버튼 1개 (고정)
```

**규칙**
- 이 네 개만 `.page`의 직계 자식이다. 장식은 `.page-deco`(absolute, pointer-events:none)에 넣는다.
- `guide.el`은 반드시 `.page`의 직계 자식으로 append한다. **페이지에서 `.guide-wrap`에 position/absolute/bottom을 다시 지정하지 않는다.**
- 미션 콘텐츠는 전부 `.page-body` 안에 넣는다. `.page-body`가 뷰포트를 다 쓰도록 하고, 남는 공간에 콘텐츠를 늘린다(빈 띠 금지).
- 페이지 안에서 `height`를 px로 고정하지 않는다. `min-height:0` + `flex:1` + 내부 스크롤을 쓴다.

## 2. 제목은 한 번만

- 리본 제목(`.ribbon-title`)을 쓰면 상단바 제목은 CSS가 자동으로 숨긴다. **두 곳에 같은 제목을 넣지 마라.**
- 리본은 `미션명`(main) + `한 줄 목표`(sub)까지만. 설명 문단을 리본에 넣지 않는다.

## 3. 정보 최소화 (핵심)

한 화면에 **텍스트 블록 3개 이하**. 나머지는 말풍선·모달로 옮긴다.

| 정보 | 어디에 |
|---|---|
| 지금 뭘 해야 하는지 | **가이드 말풍선(타이핑)** — `guide.say('한 문장', { cue: 누를요소 })` |
| 각 항목이 뭔지 | 카드의 **그림 + 한 줄 라벨**(`.card-visual`) |
| 자세한 자료·근거 | 카드 탭 → 모달 |
| 결과·피드백 | `showFeedback` 패널 1개 |

- 화면 설명문은 `.text-lead`(2줄 클램프) 또는 아예 제거.
- 카드 안 설명은 최대 1줄(`.text-oneline`). 길면 모달로.
- 같은 안내를 화면과 말풍선에 중복해서 쓰지 않는다.

## 4. 타이포 (독도 규격)

토큰만 쓴다. px 직접 지정 금지.

| 역할 | 토큰 | 1280×720 실제값 |
|---|---|---|
| 히어로 | `--fs-hero` | 46px |
| 제목 | `--fs-title` | 33px |
| 본문 | `--fs-body` | 20.5px |
| 버튼 | `--fs-btn` | 20.5px |
| 보조 | `--fs-small` | 16px |

- 제목·버튼·라벨 = `var(--font-head)`(Jua), 문장 = `var(--font-body)`(Pretendard).
- 버튼 문구는 2~6자로 축약("정답을 확인해보세요" → "확인").

## 5. 겹침·균형 자가 검사 (수정 후 반드시 실행)

브라우저 콘솔(javascript_tool)에 붙여 **overlaps 0 / clipped 0**을 확인한다. 1920×1080, 1366×768, 1024×576 세 해상도 전부.

```js
(() => {
  const vw=innerWidth, vh=innerHeight;
  const els=[...document.querySelectorAll('.page button, .page .card, .page .chip, .ribbon-title, .round-node, .guide-bubble, .guide-mascot, .panel-board')]
    .filter(e=>e.offsetParent && e.getBoundingClientRect().width>4);
  const ov=[];
  for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){
    if(els[i].contains(els[j])||els[j].contains(els[i]))continue;
    const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();
    if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>6 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>6)
      ov.push(els[i].textContent.trim().slice(0,8)+'|'+els[j].textContent.trim().slice(0,8));
  }
  const clipped=els.filter(e=>{const r=e.getBoundingClientRect();return r.top<-2||r.left<-2||r.bottom>vh+2||r.right>vw+2;})
    .map(e=>e.textContent.trim().slice(0,10));
  const body=document.querySelector('.page-body');
  return JSON.stringify({vp:[vw,vh],overlaps:ov.length,ovSample:ov.slice(0,5),clipped:clipped.length,clipSample:clipped.slice(0,5),
    bodyFill: body? Math.round(body.getBoundingClientRect().height/vh*100)+'%' : null});
})()
```

- `overlaps > 0` → 그 두 요소를 같은 흐름(flex/grid)에 넣거나 위치를 옮긴다. absolute 남발 금지.
- `clipped > 0` → 음수 마진·고정 높이·`transform: translateY(-…)`를 제거한다.
- `bodyFill`이 60% 미만이면 화면이 비어 보인다 → 콘텐츠를 키우거나 여백을 재배분한다.

## 6. 하지 말 것

- `position: absolute`로 카드·버튼 배치(겹침의 원인 1순위)
- `z-index: 9999`
- 이모지를 UI 아이콘으로 사용
- 같은 정보를 상단바·리본·본문에 반복
- 화면에 4문단 이상 텍스트

## 7. 배경·패널·캐릭터 (사용자 지시 — 최우선)

배경 일러스트가 이 게임의 가장 큰 자산이다. **패널이 배경을 덮어버리면 실패다.**

| 규칙 | 기준 |
|---|---|
| 배경 노출 | 화면에서 패널·창이 덮는 면적 **60% 이하**. 나머지는 배경이 보이게 |
| 패널 투명도 | 카드·패널 배경은 `rgba(255,252,240,0.88~0.94)` + `backdrop-filter: blur(6px)` — 배경이 은은히 비치게 |
| 패널 크기 | 내용에 맞춰 줄인다(`height` 고정 금지). **패널 안 여백은 var(--sp-3)~var(--sp-4)까지만** — 텅 빈 큰 창 금지 |
| 패널 개수 | 한 화면에 큰 패널 2개 이하. 세 번째부터는 탭·모달로 |
| 캐릭터 크기 | 마스코트·인물은 **최소 clamp(120px, 14vw, 240px)**. 타이틀·완료 화면의 주인공 캐릭터는 clamp(200px, 24vw, 360px) |
| 캐릭터 배치 | 배경 위에 서 있게(하단 정렬), 패널에 가려지지 않는 쪽에. 잘림 금지 |
| 에셋 다양성 | 한 화면에 서로 다른 에셋 **3종 이상** 사용(배경·캐릭터·소품·랜드마크). manifest 110개를 적극 활용 |

체크: 스크린샷을 보고 "배경 그림이 보이는가 / 캐릭터가 한눈에 보이는가 / 창이 답답하지 않은가" 셋 다 예여야 통과.

## 8. 검사 스크립트의 알려진 오탐 (읽고 판단할 것)

§5 스크립트는 `getBoundingClientRect()`만 비교하므로 **스크롤 컨테이너 안에서 잘린 요소를 겹침으로 오탐**한다.
예: 보드(`overflow-y:auto`) 아래로 밀려난 시퀀서 칸이 화면 아래 가이드 스트립과 "겹친다"고 나오지만,
실제로는 보드가 잘라내므로 눈에는 안 겹친다.

의심되면 두 가지로 확인한다.

```js
// ① 두 요소가 진짜 눈에 겹치나 — 겹치는 지점에서 무엇이 잡히는지 본다
document.elementFromPoint(x, y).className
// ② 잘린 것뿐인가 — 조상 스크롤 컨테이너의 보이는 영역과 비교한다
const board = el.closest('[style*="overflow"], .scene-board, .page-body');
el.getBoundingClientRect().bottom > board.getBoundingClientRect().bottom // true면 '잘림', 겹침 아님
```

판정 기준: **`elementFromPoint`로 다른 요소가 덮고 있으면 진짜 겹침**이고, 조상 컨테이너 밖으로 나간 것뿐이면
스크롤로 접근 가능한지만 확인하면 된다(기준 해상도 1024×576 이상에서는 스크롤 없이 들어와야 한다).
