import type { Page } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo } from '../core/SaveRepository';
import { computeScore } from '../core/scoring';
import { buildTopBar, updateSteps } from '../ui/chrome';
import { completeMissionFlow, showFeedback } from '../ui/feedback';
import { burstConfetti, countUp, popBounce } from '../ui/fx';
import { createGuide, type GuideController } from '../ui/guide';
import { openModal } from '../ui/modal';

/* ===== 콘텐츠 스키마 (public/content/v1/ko/dialogue.json 기준) ===== */
interface Greeting {
  id: string;
  country: string;
  example: string;
  context: string;
  caution: string;
}
interface ListenOption {
  id: string;
  text: string;
  good: boolean;
  why: string;
}
interface Scenario {
  id: string;
  situation: string;
  cues: string[];
  options: ListenOption[];
}
interface TurnOption {
  id: string;
  text: string;
  empathy: number;
  reply: string;
  leadsTo: number | 'end';
}
interface NpcTurn {
  prompt: string;
  options: TurnOption[];
}
interface RevisionOption {
  text: string;
  better: boolean;
  why: string;
}
interface Npc {
  id: string;
  name: string;
  from: string;
  situation: string;
  firstImpression: string;
  turns: NpcTurn[];
  revision: { question: string; options: RevisionOption[] };
}
interface DialogueContent {
  intro: { title: string; subtitle: string; guide: string };
  greetings: Greeting[];
  listening: { guide: string; scenarios: Scenario[] };
  compass: { guide: string; npcs: Npc[] };
  feedback: { good: string; retry: string; stereotypeWarning: string };
}

/**
 * NPC 아바타 — 관련 인물 이미지(greeting.*)는 성별·인상착의가 NPC 설정과 어긋날 수 있는
 * '추정' 에셋이라 배정하지 않고, 이름 첫 글자 이니셜 원으로 표현한다.
 */
const NPC_COLOR: Record<string, string> = {
  npc_yusra: 'var(--c-violet)',
  npc_kenji: 'var(--c-sky)',
  npc_amara: 'var(--c-turquoise)'
};
const NPC_IMG: Record<string, string> = {
  npc_yusra: 'greeting.morocco',
  npc_kenji: 'greeting.japan',
  npc_amara: 'greeting.tanzania'
};
const npcAvatar = (npc: { id: string; name: string }, size: number): string => `
  <span aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;
    background:${NPC_COLOR[npc.id] ?? 'var(--c-sky)'};color:#fff;font-family:var(--font-head);
    font-size:${Math.round(size * 0.42)}px;border:3px solid #fff;box-shadow:var(--shadow-pop)">${npc.name.charAt(0)}</span>`;

const greetingImg = (g: Greeting): string => `greeting.${g.id.replace(/^greet_/, '')}`;

const DIALOGUE_CSS = `
/* 계약 §7 — 배경이 주인공. 패널은 반투명·내용 크기만큼. */
.dialogue-scene .page-body { padding: var(--sp-3) clamp(12px, 3vw, 44px); }
.dialogue-scene .panel { background: rgba(255,252,240,0.9); backdrop-filter: blur(6px); padding: var(--sp-4); }
.dialogue-scene .card { padding: var(--sp-3); background: rgba(255,255,255,0.94); }
.dl-stage { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
.dl-head { display: flex; justify-content: center; flex-shrink: 0; }

/* 1단계 — 인사 사진(크게) + 오른쪽 질문 패널 */
.dl-greet-row { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1.3fr) minmax(280px,0.72fr); gap: var(--sp-3); }
.dl-greet-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: var(--sp-2); align-content: start; min-height: 0; overflow-y: auto; }
.dl-greet-card { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px; }
.dl-greet-card img { width: 100%; height: clamp(120px, 12vw, 168px); object-fit: contain; }
.dl-greet-card .g-name { font-family: var(--font-head); font-size: var(--fs-small); }
.dl-task { min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-2); }
.dl-ox { display: flex; gap: var(--sp-2); }
.dl-ox .btn { flex: 1; }

/* 2단계 — 상황 + 단서 + 반응 */
.dl-listen { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--sp-2); overflow-y: auto; }
.dl-cues { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: var(--sp-2); }
.dl-opt { text-align: left; min-height: var(--touch-min); font-size: var(--fs-small); padding: 8px 12px; }

/* 3단계 — 왼쪽 인물·나침반 / 오른쪽 대화 */
.dl-talk { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(240px,0.8fr) minmax(0,1.5fr); gap: var(--sp-3); }
.dl-who { min-height: 0; display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); overflow-y: auto; }
.dl-portrait { width: clamp(120px, 13vw, 190px); height: clamp(120px, 13vw, 190px); border-radius: 50%; object-fit: cover; border: 4px solid #fff; box-shadow: var(--shadow-pop); }
.dl-chat { min-height: 0; display: flex; flex-direction: column; gap: var(--sp-2); overflow-y: auto; }

/* NPC 말풍선 — 가이드 스트립(하단 흰 말풍선)과 확실히 다르게 보이도록
   본문 안, 보라 테두리 + 연보라 배경 + 왼쪽 꼬리 + 인물 아바타 */
.npc-bubble {
  position: relative; display: flex; align-items: flex-start; gap: var(--sp-2);
  background: linear-gradient(180deg, #f3efff, #e9e2ff);
  border: 2px solid var(--c-violet); border-radius: var(--radius-l);
  padding: var(--sp-3) var(--sp-4); margin-left: 12px;
  box-shadow: var(--shadow-card); font-weight: 700; color: var(--c-ink);
}
.npc-bubble::before {
  content: ''; position: absolute; left: -12px; top: 22px;
  border: 10px solid transparent; border-right-color: var(--c-violet); border-left: 0;
}
.npc-bubble .npc-say { flex: 1; min-width: 0; }

/* 공감 나침반 — 숫자 + 바늘 하나로 단순화 */
.dl-compass { display: flex; align-items: center; gap: var(--sp-2); }
.dl-compass .c-dial { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
.dl-compass .c-num { font-family: var(--font-head); font-size: var(--fs-title); }
.dl-side-btn { display: none; }

@media (max-height: 620px) {
  .dialogue-scene .page-body { padding: 6px clamp(10px, 2.5vw, 28px); }
  .dl-stage { gap: var(--sp-2); }
  .dialogue-scene .panel { padding: var(--sp-3); }
  .dialogue-scene .card { padding: 8px 10px; }
  .ribbon-title .ribbon-sub { display: none; }
  /* 낮은 화면(1024×576): 사진 6장을 한 줄로 올리고 질문 패널을 아래로 */
  .dl-greet-row { grid-template-columns: 1fr; grid-template-rows: auto minmax(0,1fr); }
  .dl-greet-grid { grid-template-columns: repeat(6, minmax(0,1fr)); overflow: visible; }
  .dl-greet-card { padding: 3px; }
  .dl-greet-card img { height: 120px; }
  .dl-opt { padding: 5px 10px; }
  .npc-bubble { padding: 8px 12px; }
  /* 3단계: 왼쪽 칸이 넘치지 않게 상황 카드를 버튼+모달로 */
  .dl-who .dl-side-card { display: none; }
  .dl-side-btn { display: inline-flex; }
  .dl-compass .c-dial { width: 48px; height: 48px; }
}
@media (max-width: 900px) {
  .dl-greet-row, .dl-talk { grid-template-columns: 1fr; }
}
`;

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function createPage(): Page {
  let closeActiveModal: (() => void) | null = null;
  let guide: GuideController | null = null;
  let disposed = false;

  return {
    async mount(root: HTMLElement) {
      disposed = false;
      const content = await loadContent<DialogueContent>('dialogue');
      await preloadImages([
        'bg.dialogue',
        'icon.compass',
        'icon.listening',
        'icon.heart_speech',
        'deco.explorer1',
        ...content.greetings.map(greetingImg).filter(hasAsset)
      ]);
      audio.playBgm('main');

      /* ===== 진행 상태 ===== */
      const greetingIds = new Set(content.greetings.map((g) => g.id));
      const scenarioIds = new Set(content.listening.scenarios.map((scenario) => scenario.id));
      let stage: 1 | 2 | 3 = 1;
      const matched = new Set<string>();
      const greetingMistakes = new Set<string>();
      const scenarioMistakes = new Set<string>();
      let firstTryMatches = 0;
      let oxDone = false;
      let oxFirstCorrect = false;
      let oxAttempted = false;
      let scenarioIndex = 0;
      let scenarioFirstGood = 0;
      let npcIndex = 0;
      let empathySum = 0;
      let betterCount = 0;
      let npcTurnIndex = 0;
      let npcPhase: 'turn' | 'revision' = 'turn';
      let busy = false;
      let finished = false;
      const empathyMax = content.compass.npcs.reduce((acc, n) => acc + n.turns.length * 2, 0);

      const presentModal = (opts: Parameters<typeof openModal>[0]): void => {
        if (disposed) return;
        closeActiveModal = openModal(opts);
      };

      const rememberCompletionModal = (): void => {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#overlay-root .modal-actions button'));
        const reviewButton = buttons.find((button) => button.textContent?.includes('한 번 더 보기'));
        if (reviewButton) closeActiveModal = () => reviewButton.click();
      };

      /* ===== 체크포인트 복원 ===== */
      const saved = saveRepo.get().missions.dialogue;
      if (saved.checkpointId) {
        const d = saved.data;
        strArr(d.matched).filter((id) => greetingIds.has(id)).forEach((id) => matched.add(id));
        strArr(d.greetingMistakes).filter((id) => greetingIds.has(id)).forEach((id) => greetingMistakes.add(id));
        strArr(d.scenarioMistakes).filter((id) => scenarioIds.has(id)).forEach((id) => scenarioMistakes.add(id));
        firstTryMatches = Math.max(
          0,
          Math.min(content.greetings.length, Math.floor(num(d.firstTryMatches, Math.max(0, matched.size - greetingMistakes.size))))
        );
        oxDone = d.oxDone === true;
        oxFirstCorrect = d.oxFirstCorrect === true;
        oxAttempted = d.oxAttempted === true;
        scenarioIndex = Math.max(0, Math.min(content.listening.scenarios.length, Math.floor(num(d.scenarioIndex, 0))));
        scenarioFirstGood = Math.max(0, Math.min(content.listening.scenarios.length, Math.floor(num(d.scenarioFirstGood, 0))));
        npcIndex = Math.max(0, Math.min(content.compass.npcs.length, Math.floor(num(d.npcIndex, 0))));
        empathySum = Math.max(0, Math.min(empathyMax, Math.floor(num(d.empathySum, 0))));
        betterCount = Math.max(0, Math.min(content.compass.npcs.length, Math.floor(num(d.betterCount, 0))));
        npcTurnIndex = Math.max(0, Math.floor(num(d.npcTurnIndex, 0)));
        npcPhase = d.npcPhase === 'revision' ? 'revision' : 'turn';
        const restoredNpc = content.compass.npcs[npcIndex];
        if (!restoredNpc || npcTurnIndex >= restoredNpc.turns.length) npcPhase = 'revision';
        if (saved.checkpointId === 'stage2') stage = 2;
        if (saved.checkpointId === 'stage3') stage = 3;
      }

      const checkpoint = (id: 'stage1' | 'stage2' | 'stage3') => {
        saveRepo.setCheckpoint('dialogue', id, {
          matched: [...matched],
          greetingMistakes: [...greetingMistakes],
          scenarioMistakes: [...scenarioMistakes],
          firstTryMatches,
          oxDone,
          oxFirstCorrect,
          oxAttempted,
          scenarioIndex,
          scenarioFirstGood,
          npcIndex,
          npcTurnIndex,
          npcPhase,
          empathySum,
          betterCount
        });
      };

      /* ===== 페이지 골격 ===== */
      const page = document.createElement('div');
      page.className = 'page dialogue-scene';
      page.dataset.assetId = 'bg.dialogue';
      // 배경이 주인공 — 오버레이는 글자 대비에 필요한 만큼만
      page.style.backgroundImage = `linear-gradient(rgba(22, 34, 60, 0.28), rgba(22, 34, 60, 0.42)), url('${assetUrl('bg.dialogue')}')`;
      const pageStyle = document.createElement('style');
      pageStyle.textContent = DIALOGUE_CSS;
      page.appendChild(pageStyle);
      const topBar = buildTopBar({
        title: '다름을 잇는 대화',
        subtitle: content.intro.subtitle,
        backTo: '#/map',
        steps: { total: 3, done: stage - 1, now: stage - 1 }
      });
      page.appendChild(topBar);
      const body = document.createElement('div');
      body.className = 'page-body dialogue-body';
      page.appendChild(body);
      // 장식 — 흐름 밖(.page-deco)이라 겹침을 만들지 않는다
      const deco = document.createElement('div');
      deco.className = 'page-deco';
      deco.setAttribute('aria-hidden', 'true');
      deco.innerHTML = [
        hasAsset('deco.explorer2')
          ? `<img src="${assetUrl('deco.explorer2')}" alt="" style="position:absolute;left:1.5%;bottom:0;width:clamp(80px,9vw,150px);opacity:0.9">`
          : '',
        hasAsset('deco.portal_globe')
          ? `<img src="${assetUrl('deco.portal_globe')}" alt="" style="position:absolute;right:1.5%;bottom:0;width:clamp(80px,9vw,150px);opacity:0.85">`
          : ''
      ].join('');
      page.appendChild(deco);

      const bottom = document.createElement('div');
      bottom.className = 'bottom-bar';
      page.appendChild(bottom);
      root.appendChild(page);

      // 마스코트 가이드 — NPC 말풍선과 헷갈리지 않게 화면 구석 고정, 조작 안내만 말한다
      guide = createGuide();
      page.appendChild(guide.el);

      /* ===== 1단계: 인사 이해 (이미지 ↔ 설명 연결) ===== */
      const openGreetingInfo = (g: Greeting) => {
        const bodyEl = document.createElement('div');
        bodyEl.innerHTML = `
          <div style="display:flex;gap:var(--sp-4);align-items:flex-start;flex-wrap:wrap">
            ${hasAsset(greetingImg(g)) ? `<img src="${assetUrl(greetingImg(g))}" data-asset-id="${greetingImg(g)}" alt="${g.country}에서 만난 학생의 인사 사례" style="width:140px;flex-shrink:0;border-radius:var(--radius-m)">` : ''}
            <div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:var(--sp-3)">
              <p>${g.example}</p>
              <p style="font-size:var(--fs-small);color:rgba(25,50,77,0.75)">${g.context}</p>
              <div class="feedback partial" style="font-weight:400"><span aria-hidden="true" style="font-size:1.4em">◐</span><span><strong>꼭 기억해요</strong> — ${g.caution}</span></div>
            </div>
          </div>`;
        presentModal({
          id: `greet-info-${g.id}`,
          title: `${g.country}의 인사`,
          bodyEl,
          actions: [{ label: '알겠어요', kind: 'primary', autofocus: true, onClick: (close) => { close(); renderStage1(); } }]
        });
      };

      function renderStage1(): void {
        updateSteps(topBar, 3, 0, 0);
        const total = content.greetings.length;
        const current = content.greetings.find((g) => !matched.has(g.id));

        body.innerHTML = `
          <div class="dl-stage">
            <div class="dl-head">
              <div class="ribbon-title">
                <span class="ribbon-main">세계의 인사</span>
                <span class="ribbon-sub">설명을 읽고 어울리는 사진을 골라요</span>
              </div>
            </div>
            <div class="dl-greet-row">
              <div id="greet-grid" class="dl-greet-grid"></div>
              <section class="panel dl-task">
                <div id="stage1-task" style="display:flex;flex-direction:column;gap:var(--sp-2)"></div>
                <div id="stage1-fb"></div>
              </section>
            </div>
          </div>`;

        const grid = body.querySelector<HTMLElement>('#greet-grid');
        const fb = body.querySelector<HTMLElement>('#stage1-fb');
        if (grid) {
          for (const [index, g] of content.greetings.entries()) {
            const isMatched = matched.has(g.id);
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'card card-pick dl-greet-card';
            card.innerHTML = `
              ${hasAsset(greetingImg(g)) ? `<img src="${assetUrl(greetingImg(g))}" data-asset-id="${greetingImg(g)}" alt="${g.country}에서 만난 학생의 인사 사례"${isMatched ? ' style="opacity:0.85"' : ''}>` : `<span style="font-size:var(--fs-title)" aria-hidden="true">?</span>`}
              <span class="g-name" style="color:${isMatched ? 'var(--c-success-ink)' : 'var(--c-ink-soft)'}">${isMatched ? `✓ ${g.country}` : '?'}</span>`;
            card.setAttribute('aria-label', isMatched ? `${g.country}의 인사 — 연결 완료, 다시 보기` : `인사 사진 ${index + 1} — 설명과 연결하기`);
            card.addEventListener('click', () => {
              if (busy || disposed) return;
              void audio.playSfx('tap');
              if (matched.has(g.id)) {
                openGreetingInfo(g);
                return;
              }
              if (!current || oxDone) return;
              if (g.id === current.id) {
                if (!greetingMistakes.has(current.id)) firstTryMatches += 1;
                matched.add(g.id);
                checkpoint('stage1');
                popBounce(card); // 매칭 성공 — 이어서 모달에서 사진·설명 쌍이 나란히 보인다
                openGreetingInfo(g);
              } else {
                greetingMistakes.add(current.id);
                checkpoint('stage1');
                if (fb) showFeedback(fb, 'partial', '이 친구의 몸짓을 다시 살펴봐요. 설명과는 다른 인사 같아요. 다른 사진을 골라 볼까요?', 'dialogue');
              }
            });
            grid.appendChild(card);
          }
        }

        const task = body.querySelector<HTMLElement>('#stage1-task');
        if (task) {
          if (current) {
            task.innerHTML = `
              <div class="card" style="border-width:2px;border-color:var(--c-violet)">
                <p style="font-weight:700;margin-bottom:6px">어느 인사일까요? (${matched.size + 1}/${total})</p>
                <p><strong style="font-family:var(--font-head)">${current.country}</strong> — ${current.example}</p>
                <p style="font-size:var(--fs-small);color:rgba(25,50,77,0.7);margin-top:6px">${current.context}</p>
              </div>`;
          } else if (!oxDone) {
            // 고정관념 점검 확인 질문 — X가 정답
            task.innerHTML = `
              <div class="card" style="border-width:2px;border-color:var(--c-gold)">
                <p style="font-weight:700;margin-bottom:6px">확인 질문</p>
                <p>"한 나라의 사람은 <strong>모두 항상</strong> 방금 배운 방법으로 인사한다." 맞을까요?</p>
              </div>
              <div class="dl-ox">
                <button class="btn btn-ghost btn-big" data-ox="o">O 맞아요</button>
                <button class="btn btn-ghost btn-big" data-ox="x">X 아니에요</button>
              </div>`;
            task.querySelector('[data-ox="o"]')?.addEventListener('click', () => {
              if (busy || oxDone || disposed) return;
              oxAttempted = true;
              checkpoint('stage1');
              if (fb) showFeedback(fb, 'partial', content.feedback.stereotypeWarning, 'dialogue');
            });
            task.querySelector('[data-ox="x"]')?.addEventListener('click', () => {
              if (busy || oxDone || disposed) return;
              busy = true;
              oxDone = true;
              oxFirstCorrect = !oxAttempted;
              checkpoint('stage1');
              renderStage1();
              busy = false;
            });
          } else {
            task.innerHTML = '';
            if (fb) showFeedback(fb, 'success', '맞아요! 나라 정보는 힌트일 뿐, 인사 방법은 사람마다 달라요. 잘 관찰하고 물어보는 게 제일 정확해요.', 'dialogue');
          }
        }

        bottom.innerHTML = `
          <span class="chip">연결 ${matched.size}/${total}${oxDone ? ' · 확인 질문 완료' : ''}</span>
          <button class="btn btn-primary btn-big" data-act="next" ${oxDone ? '' : 'disabled'}>다음</button>`;
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          if (!oxDone || busy || disposed) return;
          busy = true;
          stage = 2;
          checkpoint('stage2');
          renderStage2();
          busy = false;
        });

        if (current) {
          guide?.say('그림과 설명을 이어 봐요!', { cue: grid });
        } else if (!oxDone) {
          guide?.say('정말 모두 그럴까요? 생각하고 골라요!', { cue: task });
        } else {
          guide?.say('잘했어요! 경청 연습으로 가요!', { cue: bottom.querySelector<HTMLElement>('[data-act="next"]') });
        }
      }

      /* ===== 2단계: 경청 ===== */
      function renderStage2(): void {
        updateSteps(topBar, 3, 1, 1);
        const scenarios = content.listening.scenarios;
        if (scenarioIndex >= scenarios.length) {
          goStage3();
          return;
        }
        const sc = scenarios[scenarioIndex];
        if (!sc) {
          goStage3();
          return;
        }
        const revealed = new Set<number>();
        let wrongPicked = scenarioMistakes.has(sc.id);
        let resolved = false;

        // 화면 안내 문장('관찰 단서'·'어떻게 할까요?')은 가이드 말풍선이 대신한다
        body.innerHTML = `
          <div class="dl-stage">
            <div class="dl-head">
              <div class="ribbon-title">
                <span class="ribbon-main">경청 렌즈</span>
                <span class="ribbon-sub">상황 ${scenarioIndex + 1}/${scenarios.length} · 단서를 보고 반응을 골라요</span>
              </div>
            </div>
            <section class="panel dl-listen">
              <div class="card">${sc.situation}</div>
              <div id="cue-row" class="dl-cues"></div>
              <div id="opt-col" style="display:flex;flex-direction:column;gap:6px"></div>
              <div id="stage2-fb"></div>
            </section>
          </div>`;

        const fb = body.querySelector<HTMLElement>('#stage2-fb');
        const optCol = body.querySelector<HTMLElement>('#opt-col');
        const cueRow = body.querySelector<HTMLElement>('#cue-row');

        const optionButtons: HTMLButtonElement[] = [];
        const syncOptions = () => {
          const open = revealed.size >= sc.cues.length;
          optionButtons.forEach((b) => {
            if (!b.dataset.locked) b.disabled = !open;
          });
          if (open && !resolved) {
            guide?.say('존중하는 반응을 골라 봐요!', { cue: optCol });
          } else if (!open) {
            guide?.setCue((cueRow?.querySelector<HTMLElement>('button:not(:disabled)')) ?? null);
          }
          if (open && fb && !resolved && !wrongPicked) {
            showFeedback(fb, 'partial', '단서를 모두 확인했어요. 이제 상대를 존중하는 반응을 골라 보세요.');
          }
        };

        if (cueRow) {
          sc.cues.forEach((cue, i) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'card card-pick dl-opt';
            card.style.textAlign = 'center';
            card.style.fontWeight = '700';
            card.textContent = `단서 ${i + 1}`;
            card.addEventListener('click', () => {
              if (revealed.has(i) || resolved || disposed) return;
              void audio.playSfx('pickup');
              revealed.add(i);
              card.classList.remove('card-pick');
              card.style.textAlign = 'left';
              card.style.fontWeight = '400';
              card.innerHTML = `<span aria-hidden="true" style="font-weight:900;color:var(--c-turquoise)">✓</span> ${cue}`;
              card.disabled = true;
              syncOptions();
            });
            cueRow.appendChild(card);
          });
        }

        if (optCol) {
          for (const opt of sc.options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'card card-pick dl-opt';
            btn.textContent = opt.text;
            btn.disabled = true;
            btn.addEventListener('click', () => {
              if (resolved || btn.dataset.locked || busy || disposed) return;
              if (opt.good) {
                resolved = true;
                const first = !scenarioMistakes.has(sc.id);
                if (first) scenarioFirstGood += 1;
                optionButtons.forEach((b) => {
                  b.dataset.locked = '1';
                  b.disabled = true;
                });
                btn.classList.add('is-selected');
                if (fb) showFeedback(fb, 'success', `좋은 선택이에요! ${opt.why}`, 'dialogue');
                // 피드백을 본 뒤 새로고침해도 같은 답을 다시 골라 점수를 바꾸지 못하도록
                // 다음 상황 위치까지 즉시 체크포인트로 확정한다.
                scenarioIndex += 1;
                checkpoint('stage2');
                const nextBtn = bottom.querySelector<HTMLButtonElement>('[data-act="next"]');
                if (nextBtn) {
                  nextBtn.disabled = false;
                  guide?.say('좋아요! 다음으로 가요!', { cue: nextBtn });
                }
              } else {
                wrongPicked = true;
                scenarioMistakes.add(sc.id);
                checkpoint('stage2');
                btn.dataset.locked = '1';
                btn.disabled = true;
                btn.style.opacity = '0.6';
                if (fb) showFeedback(fb, 'partial', `${opt.why} 다른 반응을 다시 골라 볼까요?`, 'dialogue');
              }
            });
            optionButtons.push(btn);
            optCol.appendChild(btn);
          }
        }

        bottom.innerHTML = `
          <span class="chip">상황 ${scenarioIndex + 1}/${scenarios.length}</span>
          <button class="btn btn-primary btn-big" data-act="next" disabled>다음</button>`;
        bottom.querySelector('[data-act="next"]')?.addEventListener('click', () => {
          if (!resolved || busy || disposed) return;
          busy = true;
          if (scenarioIndex >= scenarios.length) {
            goStage3();
          } else {
            renderStage2();
          }
          busy = false;
        });

        guide?.say('단서를 먼저 확인하고 골라요!');
        syncOptions();
      }

      function goStage3(): void {
        stage = 3;
        npcTurnIndex = 0;
        npcPhase = 'turn';
        checkpoint('stage3');
        renderStage3();
      }

      /* ===== 3단계: 공감 나침반 ===== */
      const compassAngle = (sum: number): number =>
        empathyMax > 0 ? Math.round(-90 + (sum / empathyMax) * 180) : -90;
      /** 공감 나침반 — 게이지 바·설명문 없이 '숫자 + 바늘 하나'로 단순화 (계약 §3) */
      const compassHtml = (): string => `
        <div class="dl-compass" role="img" aria-label="공감 ${empathySum}점, 최대 ${empathyMax}점">
          <span class="c-dial" aria-hidden="true">
            ${hasAsset('icon.compass') ? `<img src="${assetUrl('icon.compass')}" data-asset-id="icon.compass" alt="" style="width:100%;height:100%;object-fit:contain">` : ''}
            <span id="compass-needle" style="position:absolute;left:50%;bottom:50%;width:5px;height:26px;margin-left:-2.5px;
              border-radius:4px 4px 0 0;background:var(--c-coral);box-shadow:0 0 0 1px rgba(255,255,255,0.7);
              transform-origin:50% 100%;transform:rotate(${compassAngle(empathySum)}deg);
              transition:transform 220ms cubic-bezier(0.2,0.8,0.4,1)"></span>
          </span>
          <span id="compass-num" class="c-num">${empathySum}/${empathyMax}</span>
        </div>`;
      /** 공감 상승 연출 — 바늘 회전 + 숫자 굴리기 */
      const updateCompass = (prevSum: number): void => {
        const needle = body.querySelector<HTMLElement>('#compass-needle');
        if (needle) needle.style.transform = `rotate(${compassAngle(empathySum)}deg)`;
        const numEl = body.querySelector<HTMLElement>('#compass-num');
        if (numEl && prevSum !== empathySum) countUp(numEl, prevSum, empathySum, `/${empathyMax}`);
        const dial = body.querySelector<HTMLElement>('.dl-compass');
        if (dial) dial.setAttribute('aria-label', `공감 ${empathySum}점, 최대 ${empathyMax}점`);
      };

      function renderStage3(): void {
        updateSteps(topBar, 3, 2, 2);
        const npcs = content.compass.npcs;
        const npc = npcs[npcIndex];
        if (!npc) {
          finish();
          return;
        }
        const imgId = NPC_IMG[npc.id];

        // 왼쪽: 누구와 이야기하는지(그림 크게) + 나침반 / 오른쪽: 대화만
        // 단계에 따라 카드 1장만 — 대화 중엔 상황, 되돌아볼 땐 '처음 든 생각'
        const sideTitle = npcPhase === 'revision' ? '처음 든 생각' : '어떤 상황인가요?';
        const sideText = npcPhase === 'revision' ? npc.firstImpression : npc.situation;
        // 낮은 화면에서는 카드 대신 버튼 → 모달 (CSS가 전환)
        const sideCard = `
          <div class="card dl-side-card" style="font-size:var(--fs-small)${npcPhase === 'revision' ? ';border-color:var(--c-warning)' : ''}">
            ${npcPhase === 'revision' ? '<strong>처음 든 생각</strong><br>' : ''}${sideText}
          </div>
          <button type="button" class="btn btn-ghost dl-side-btn">${npcPhase === 'revision' ? '생각 보기' : '상황 보기'}</button>`;
        body.innerHTML = `
          <div class="dl-stage">
            <div class="dl-head">
              <div class="ribbon-title">
                <span class="ribbon-main">${npc.name}와 대화</span>
                <span class="ribbon-sub">마음에 다가가는 말을 골라요</span>
              </div>
            </div>
            <div class="dl-talk">
              <section class="panel dl-who">
                ${imgId && hasAsset(imgId)
                  ? `<img class="dl-portrait" src="${assetUrl(imgId)}" data-asset-id="${imgId}" alt="${npc.name} 학생의 대화 사례">`
                  : npcAvatar(npc, 150)}
                <span class="chip">${npc.name} · ${npc.from}</span>
                ${compassHtml()}
                ${sideCard}
              </section>
              <section class="panel dl-chat">
                <div id="dlg-area" style="display:flex;flex-direction:column;gap:var(--sp-2)"></div>
                <div id="stage3-fb"></div>
              </section>
            </div>
          </div>`;

        const area = body.querySelector<HTMLElement>('#dlg-area');
        const fb = body.querySelector<HTMLElement>('#stage3-fb');
        body.querySelector<HTMLElement>('.dl-side-btn')?.addEventListener('click', () => {
          void audio.playSfx('tap');
          presentModal({
            id: `npc-side-${npc.id}-${npcPhase}`,
            title: sideTitle,
            bodyHtml: `<p>${sideText}</p>`,
            actions: [{ label: '닫기', kind: 'primary', autofocus: true, onClick: (close) => close() }]
          });
        });

        bottom.innerHTML = `
          <span class="chip">친구 ${npcIndex + 1}/${npcs.length} · ${npc.name}</span>
          <button class="btn btn-primary btn-big" data-act="next" disabled>다음</button>`;
        const nextBtn = bottom.querySelector<HTMLButtonElement>('[data-act="next"]');

        if (npcPhase === 'turn') {
          const turn = npc.turns[npcTurnIndex];
          if (!turn) {
            npcPhase = 'revision';
            checkpoint('stage3');
            renderStage3();
            return;
          }
          let answered = false;
          if (area) {
            // NPC가 하는 말 — 하단 가이드 스트립과 헷갈리지 않게 본문 안 말풍선으로
            const bubble = document.createElement('div');
            bubble.className = 'npc-bubble';
            const say = document.createElement('span');
            say.className = 'npc-say';
            say.textContent = turn.prompt;
            bubble.appendChild(say);
            area.appendChild(bubble);
            const btns: HTMLButtonElement[] = [];
            for (const opt of turn.options) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'card card-pick dl-opt';
              btn.textContent = opt.text;
              btn.addEventListener('click', () => {
                if (answered || busy || disposed) return;
                answered = true;
                void audio.playSfx('tap');
                const prevSum = empathySum;
                empathySum = Math.min(empathyMax, empathySum + Math.max(0, opt.empathy));
                btns.forEach((b) => (b.disabled = true));
                btn.classList.add('is-selected');
                if (fb) showFeedback(fb, opt.empathy >= 2 ? 'success' : 'partial', opt.reply, 'dialogue');
                updateCompass(prevSum);
                if (opt.leadsTo === 'end' || typeof opt.leadsTo !== 'number' || !npc.turns[opt.leadsTo]) {
                  npcPhase = 'revision';
                } else {
                  npcTurnIndex = opt.leadsTo;
                }
                checkpoint('stage3');
                if (nextBtn) {
                  nextBtn.disabled = false;
                  guide?.say('나침반 게이지를 봐요! 다음을 눌러요!', { cue: nextBtn });
                }
              });
              btns.push(btn);
              area.appendChild(btn);
            }
            guide?.say('마음에 다가가는 말을 골라 봐요!', { cue: area });
          }
          nextBtn?.addEventListener('click', () => {
            if (!answered || busy || disposed) return;
            busy = true;
            renderStage3();
            busy = false;
          });
        } else {
          // 첫인상 수정 질문
          let answered = false;
          if (area) {
            const bubble = document.createElement('div');
            bubble.className = 'npc-bubble';
            const say = document.createElement('span');
            say.className = 'npc-say';
            say.textContent = npc.revision.question;
            bubble.appendChild(say);
            area.appendChild(bubble);
            const btns: HTMLButtonElement[] = [];
            for (const opt of npc.revision.options) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'card card-pick dl-opt';
              btn.textContent = opt.text;
              btn.addEventListener('click', () => {
                if (answered || busy || disposed) return;
                answered = true;
                const isLastNpc = npcIndex + 1 >= content.compass.npcs.length;
                void audio.playSfx('tap');
                if (opt.better) betterCount += 1;
                btns.forEach((b) => (b.disabled = true));
                btn.classList.add('is-selected');
                if (fb) showFeedback(fb, opt.better ? 'success' : 'partial', opt.why, 'dialogue');
                npcIndex += 1;
                npcTurnIndex = 0;
                npcPhase = 'turn';
                checkpoint('stage3');
                if (nextBtn) {
                  nextBtn.disabled = false;
                  nextBtn.textContent = isLastNpc ? '대화 마치기' : '다음 친구에게';
                  guide?.say(isLastNpc ? '대화 마치기를 눌러요!' : '다음 친구에게 가 봐요!', { cue: nextBtn });
                }
              });
              btns.push(btn);
              area.appendChild(btn);
            }
            guide?.say('처음 든 생각을 다시 살펴봐요!', { cue: area });
          }
          nextBtn?.addEventListener('click', () => {
            if (!answered || busy || disposed) return;
            busy = true;
            if (npcIndex >= content.compass.npcs.length) {
              finish();
            } else {
              renderStage3();
            }
            busy = false;
          });
        }
      }

      /* ===== 완료 처리 ===== */
      function finish(): void {
        if (finished) return;
        finished = true;
        const nGreet = Math.max(1, content.greetings.length);
        const nScen = Math.max(1, content.listening.scenarios.length);
        const nNpc = Math.max(1, content.compass.npcs.length);
        // 단서 활용: 인사 첫 시도 연결 + 단서 확인 후 좋은 선택(첫 시도)
        const listeningEvidence = (scenarioFirstGood + 0.5 * (nScen - scenarioFirstGood)) / nScen;
        const evidence = 0.4 * (firstTryMatches / nGreet) + 0.6 * listeningEvidence;
        // 관점: 고정관념 점검 정답 + 첫인상 수정
        const perspective = 0.5 * (oxFirstCorrect ? 1 : 0.4) + 0.5 * (betterCount / nNpc);
        // 소통: 공감 누적
        const communication = empathyMax > 0 ? empathySum / empathyMax : 0;
        // 수정: 경청 재선택으로 좋은 선택 도달(기본) + 첫인상 수정 선택
        const revision = 0.5 + 0.5 * (betterCount / nNpc);
        const speedBonus =
          (firstTryMatches >= nGreet ? 2 : 0) + (scenarioFirstGood >= nScen ? 2 : 0) + (oxFirstCorrect ? 1 : 0);
        const result = computeScore(
          { evidence, perspective, communication, revision },
          { evidence: 30, perspective: 25, communication: 25, revision: 15 },
          speedBonus
        );
        completeMissionFlow('dialogue', '존중 대화', result);
        rememberCompletionModal();
      }

      /* ===== 시작 ===== */
      if (stage === 1) renderStage1();
      else if (stage === 2) renderStage2();
      else renderStage3();

      if (stage === 1 && matched.size === 0) {
        presentModal({
          id: 'dialogue-intro',
          title: content.intro.title,
          bodyHtml: `<p>${content.intro.guide}</p>`,
          actions: [{ label: '연습 시작!', kind: 'primary', autofocus: true, onClick: (close) => close() }]
        });
      }
    },
    unmount() {
      disposed = true;
      closeActiveModal?.();
      closeActiveModal = null;
      guide?.dispose();
      guide = null;
    }
  };
}
