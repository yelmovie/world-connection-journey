import type { Page } from '../router';
import { navigate } from '../router';
import { assetUrl, hasAsset, preloadImages } from '../core/assets';
import { audio } from '../core/AudioManager';
import { loadContent } from '../core/ContentRepository';
import { saveRepo, recomputeUnlocks } from '../core/SaveRepository';
import { buildTopBar } from '../ui/chrome';
import { confirmDialog } from '../ui/modal';
import { showToast } from '../ui/toast';
import { enablePickPlace, type PickPlaceController } from '../ui/dnd';
import { threeSlot } from '../ui/threeSlot';
import { createGuide, type GuideController } from '../ui/guide';
import { MISSION_IDS, type MissionId } from '../types';

interface CommonContent {
  reflectionFrame?: string;
  actionPrinciples?: string[];
  stamps?: Array<{ id: string; label: string }>;
}

const PIECES: Array<{ id: MissionId; label: string }> = [
  { id: 'asia', label: '아시아' },
  { id: 'europe', label: '유럽' },
  { id: 'africa', label: '아프리카' },
  { id: 'americas', label: '아메리카' },
  { id: 'oceania', label: '오세아니아' },
  { id: 'dialogue', label: '존중 대화' }
];
const PIECE_COLORS: Record<MissionId, string> = {
  asia: 'var(--c-coral)', europe: 'var(--c-violet)', africa: 'var(--c-gold)',
  americas: 'var(--c-turquoise)', oceania: 'var(--c-sky)', dialogue: 'var(--c-success)'
};
const PIECE_TEXT_COLORS: Record<MissionId, string> = {
  asia: 'var(--c-ink)', europe: '#fff', africa: 'var(--c-ink)',
  americas: 'var(--c-ink)', oceania: 'var(--c-ink)', dialogue: 'var(--c-ink)'
};

export function createPage(): Page {
  let dnd: PickPlaceController | null = null;
  let guide: GuideController | null = null;

  return {
    async mount(root: HTMLElement) {
      // 직접 URL 접근 차단: 저장값을 믿지 않고 재계산 (라우터 가드의 2차 방어)
      const save = saveRepo.get();
      recomputeUnlocks(save);
      if (!save.completion.unlocked) {
        navigate('#/map');
        return;
      }

      let common: CommonContent = {};
      try {
        common = await loadContent<CommonContent>('common');
      } catch {
        /* 기본값 사용 */
      }
      await preloadImages(['bg.completion', 'reward.globe_puzzle', 'reward.badge']);
      audio.playBgm('main');

      const principles = common.actionPrinciples ?? ['관찰하기', '물어보기', '끝까지 듣기', '잘못 알았으면 수정하기'];
      const placed = new Set<MissionId>(save.completion.placedPuzzlePieceIds);

      const page = document.createElement('div');
      page.className = 'page';
      page.style.backgroundImage = `linear-gradient(rgba(15,28,45,0.45), rgba(15,28,45,0.6)), url('${assetUrl('bg.completion')}')`;
      page.appendChild(buildTopBar({ title: '세계 연결 인증', backTo: '#/map' }));

      const body = document.createElement('div');
      body.className = 'page-body';
      body.style.cssText = 'overflow-y:auto;gap:var(--sp-5)';
      body.innerHTML = `
        <section class="panel" id="sec-puzzle">
          <h2 style="color:var(--c-navy)">① 퍼즐 지구본 완성하기</h2>
          <div style="display:flex;gap:var(--sp-6);flex-wrap:wrap;align-items:center;margin-top:var(--sp-4)">
            <div id="piece-tray" style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--sp-3)"></div>
            <div id="globe-zone" style="position:relative;width:min(300px,60vw);aspect-ratio:1;border-radius:50%;
              background:radial-gradient(circle at 35% 30%, #bfe6ff, #2588E8 70%);box-shadow:var(--shadow-pop);
              display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr;overflow:hidden"></div>
          </div>
          <div id="puzzle-done" style="display:none;margin-top:var(--sp-4);text-align:center">
            <div id="globe-3d-slot" style="display:flex;justify-content:center"></div>
            <p class="chip" style="font-size:var(--fs-body)">지구본이 완성됐어요! 세계가 하나로 이어졌어요.</p>
          </div>
        </section>

        <section class="panel" id="sec-reflect" style="display:none">
          <h2 style="color:var(--c-navy)">② 여행에서 바뀐 나의 생각</h2>
          <div style="display:flex;flex-direction:column;gap:var(--sp-3);font-size:var(--fs-body)">
            <label>처음에는 <input id="ref-1" type="text" maxlength="60" class="ref-input" placeholder="예: 다른 나라 친구들은 우리와 아주 다를 거야"
              style="width:min(420px,90%);padding:10px;border:2px solid var(--c-line);border-radius:var(--radius-s)"> 라고 생각했지만,</label>
            <label><input id="ref-2" type="text" maxlength="60" class="ref-input" placeholder="예: 아시아 친구의 하루"
              style="width:min(300px,80%);padding:10px;border:2px solid var(--c-line);border-radius:var(--radius-s)"> 자료를 보고,</label>
            <label><input id="ref-3" type="text" maxlength="60" class="ref-input" placeholder="예: 비슷한 점도 많고 저마다 다른 이유가 있구나"
              style="width:min(420px,90%);padding:10px;border:2px solid var(--c-line);border-radius:var(--radius-s)"> 라고 생각을 바꾸었어요.</label>
          </div>
          <h3 style="color:var(--c-navy);margin-top:var(--sp-5)">실천 약속 — 두 가지를 골라요</h3>
          <div id="principles" style="display:flex;gap:var(--sp-3);flex-wrap:wrap;margin-top:var(--sp-3)">
            ${principles.map((p) => `<button type="button" class="btn btn-ghost principle-pick" data-p="${p}" aria-pressed="false">${p}</button>`).join('')}
          </div>
          <div class="modal-actions"><button class="btn btn-primary btn-big" id="btn-reflect-done">기록 저장하기</button></div>
        </section>

        <section class="panel" id="sec-cert" style="display:none">
          <h2 style="color:var(--c-navy)">③ 세계 연결 수료증</h2>
          <div id="cert-preview" style="background:#fff;border:6px double var(--c-gold);border-radius:var(--radius-s);padding:var(--sp-6);text-align:center;max-width:720px;margin:var(--sp-4) auto"></div>
          <div class="modal-actions" style="justify-content:center">
            <button class="btn btn-success btn-big" id="btn-print">수료증 인쇄하기</button>
            <button class="btn btn-ghost" id="btn-new-journey">새 여행 시작하기</button>
          </div>
        </section>`;
      page.appendChild(body);
      root.appendChild(page);

      // 마스코트 가이드 — 퍼즐 → 회고 → 인쇄 순으로 다음 행동 안내
      guide = createGuide({});
      page.appendChild(guide.el);

      // Three.js 예약 슬롯 — 완성 지구본 (GLB 준비 시 회전 지구본으로 교체)
      body.querySelector('#globe-3d-slot')?.appendChild(
        threeSlot({ slotId: 'completion-globe', assetId: 'reward.globe_puzzle', label: '완성된 퍼즐 지구본', width: 'min(260px,50vw)' })
      );

      // ---- 퍼즐 지구본 ----
      const tray = body.querySelector('#piece-tray') as HTMLElement;
      const globe = body.querySelector('#globe-zone') as HTMLElement;
      const alreadyIssued = save.completion.certificateIssued;

      const appendPlacedPiece = (id: MissionId) => {
        const seg = document.createElement('div');
        seg.dataset.pieceId = id;
        seg.style.cssText = `background:${PIECE_COLORS[id]};display:flex;align-items:center;justify-content:center;color:${PIECE_TEXT_COLORS[id]};font-family:var(--font-head);font-size:var(--fs-small)`;
        seg.textContent = PIECES.find((p) => p.id === id)?.label ?? '';
        globe.appendChild(seg);
      };

      for (const id of placed) appendPlacedPiece(id);

      for (const piece of PIECES) {
        if (placed.has(piece.id)) continue;
        const el = document.createElement('div');
        el.className = 'card card-pick';
        el.dataset.itemId = piece.id;
        el.style.cssText = `min-width:88px;text-align:center;font-family:var(--font-head);border-top:6px solid ${PIECE_COLORS[piece.id]}`;
        el.innerHTML = `<span aria-hidden="true">◆</span><br>${piece.label}`;
        el.setAttribute('aria-label', `퍼즐 조각: ${piece.label}`);
        tray.appendChild(el);
      }
      globe.dataset.zoneId = 'globe';
      globe.setAttribute('aria-label', '지구본 — 조각을 놓는 곳');

      const puzzleDone = (announce = true) => {
        (body.querySelector('#puzzle-done') as HTMLElement).style.display = 'block';
        (body.querySelector('#sec-reflect') as HTMLElement).style.display = 'block';
        if (announce) void audio.playSfx('complete');
        guide?.say('여행에서 바뀐 생각을 적어 봐요!', { cue: body.querySelector<HTMLElement>('#ref-1') });
        if (alreadyIssued) revealCertificate(); // 이미 발급했던 경우 회고 스킵 가능
      };

      dnd = enablePickPlace({
        items: Array.from(tray.querySelectorAll<HTMLElement>('.card-pick')),
        zones: [globe],
        onPlace: (itemId) => {
          if (!MISSION_IDS.includes(itemId as MissionId)) return;
          const id = itemId as MissionId;
          if (placed.has(id)) return;
          placed.add(id);
          const src = tray.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
          src?.remove();
          appendPlacedPiece(id);
          saveRepo.update((s) => {
            s.completion.placedPuzzlePieceIds = PIECES
              .map((piece) => piece.id)
              .filter((pieceId) => placed.has(pieceId));
          });
          void audio.playSfx('stamp');
          if (placed.size === PIECES.length) puzzleDone();
          else guide?.setCue(tray.querySelector<HTMLElement>('.card-pick')); // 다음 조각으로 큐 이동
        }
      });
      if (placed.size < PIECES.length) {
        guide.say('조각을 지구본으로 옮겨 봐요!', { cue: tray.querySelector<HTMLElement>('.card-pick') });
      }

      // ---- 회고 + 실천 약속 ----
      const chosen = new Set<string>(
        save.completion.actionPrinciples.filter((principle) => principles.includes(principle)).slice(0, 2)
      );
      const persistChosen = () => {
        saveRepo.update((s) => {
          s.completion.actionPrinciples = [...chosen];
        });
      };
      body.querySelectorAll<HTMLElement>('.principle-pick').forEach((btn) => {
        if (chosen.has(btn.dataset.p ?? '')) {
          btn.classList.add('is-selected');
          btn.setAttribute('aria-pressed', 'true');
        }
        btn.addEventListener('click', () => {
          const p = btn.dataset.p ?? '';
          if (chosen.has(p)) {
            chosen.delete(p);
            btn.classList.remove('is-selected');
            btn.setAttribute('aria-pressed', 'false');
            persistChosen();
          } else if (chosen.size < 2) {
            chosen.add(p);
            btn.classList.add('is-selected');
            btn.setAttribute('aria-pressed', 'true');
            persistChosen();
            void audio.playSfx('tap');
          } else {
            showToast('실천 약속은 두 가지만 고를 수 있어요.');
          }
        });
      });

      const draftInputs = [
        ['#ref-1', 'initialThought'],
        ['#ref-2', 'evidenceLearned'],
        ['#ref-3', 'revisedThought']
      ] as const;
      for (const [selector, key] of draftInputs) {
        const input = body.querySelector<HTMLInputElement>(selector);
        if (!input) continue;
        input.value = save.completion.reflectionDrafts[key];
        input.addEventListener('input', () => {
          const value = input.value.slice(0, 60);
          if (input.value !== value) input.value = value;
          saveRepo.update((s) => {
            s.completion.reflectionDrafts[key] = value;
          });
        });
      }

      const revealCertificate = () => {
        const s = saveRepo.get();
        const cert = body.querySelector('#cert-preview') as HTMLElement;
        const dateStr = new Date().toLocaleDateString('ko-KR');
        cert.innerHTML = certificateHtml(s.profile?.nickname ?? '여행자', dateStr, s.completion.reflection, s.completion.actionPrinciples);
        (body.querySelector('#sec-cert') as HTMLElement).style.display = 'block';
        guide?.say('수료증을 인쇄할 수 있어요!', { cue: body.querySelector<HTMLElement>('#btn-print') });
        const reducedMotion = saveRepo.get().settings.reducedMotion
          || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        body.querySelector('#sec-cert')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
      };

      body.querySelector('#btn-reflect-done')?.addEventListener('click', () => {
        const r1 = (body.querySelector('#ref-1') as HTMLInputElement).value.trim();
        const r2 = (body.querySelector('#ref-2') as HTMLInputElement).value.trim();
        const r3 = (body.querySelector('#ref-3') as HTMLInputElement).value.trim();
        if (!r1 || !r2 || !r3) {
          showToast('세 칸을 모두 채워 볼까요? 짧아도 좋아요.', 'warn');
          return;
        }
        if (chosen.size < 2) {
          showToast('실천 약속 두 가지를 골라 주세요.', 'warn');
          return;
        }
        saveRepo.update((s) => {
          s.completion.reflection = `처음에는 ${r1}라고 생각했지만, ${r2} 자료를 보고 ${r3}라고 생각을 바꾸었다.`;
          s.completion.reflectionDrafts = {
            initialThought: r1.slice(0, 60),
            evidenceLearned: r2.slice(0, 60),
            revisedThought: r3.slice(0, 60)
          };
          s.completion.actionPrinciples = [...chosen];
          if (!s.rewardClaimedById['completion']) {
            s.rewardClaimedById['completion'] = true; // 수료 보상 1회 지급
          }
          s.completion.certificateIssued = true;
        });
        void audio.playSfx('complete');
        revealCertificate();
      });

      body.querySelector('#btn-print')?.addEventListener('click', () => {
        const s = saveRepo.get();
        let printBox = document.querySelector('.certificate-print') as HTMLElement | null;
        if (!printBox) {
          printBox = document.createElement('div');
          printBox.className = 'certificate-print';
          document.getElementById('scene-root')?.appendChild(printBox);
        }
        printBox.innerHTML = certificateHtml(
          s.profile?.nickname ?? '여행자',
          new Date().toLocaleDateString('ko-KR'),
          s.completion.reflection,
          s.completion.actionPrinciples,
          true
        );
        document.body.classList.add('printing-certificate');
        window.print();
        window.setTimeout(() => document.body.classList.remove('printing-certificate'), 500);
      });

      body.querySelector('#btn-new-journey')?.addEventListener('click', () => {
        confirmDialog(
          '새 여행을 시작할까요?',
          '지금까지의 도장과 기록이 지워져요. 수료증은 미리 인쇄해 두는 것을 추천해요!',
          '새로 시작',
          () => {
            saveRepo.reset();
            navigate('#/');
          }
        );
      });

      // 기존 발급자는 회고 섹션 즉시 노출
      if (placed.size === PIECES.length) puzzleDone(false);
    },

    unmount() {
      dnd?.dispose();
      dnd = null;
      guide?.dispose();
      guide = null;
    }
  };
}

function certificateHtml(nickname: string, date: string, reflection: string, principles: string[], forPrint = false): string {
  return `
    <div style="${forPrint ? 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:10px double #F2C14E;margin:16px;padding:24px;' : ''}text-align:center;font-family:var(--font-body, sans-serif);color:#19324D">
      <p style="font-size:1rem;letter-spacing:0.3em;color:#6f5514">CERTIFICATE</p>
      <h2 style="font-family:var(--font-head, sans-serif);font-size:2em;margin:8px 0">세계 연결 수료증</h2>
      <p style="font-size:1.2em;margin:12px 0"><strong>${escapeHtml(nickname)}</strong> 여행자</p>
      <p>다섯 대륙의 생활을 조사하고, 다름을 잇는 대화를 완주하여<br>세계를 연결하는 여행을 마쳤음을 인증합니다.</p>
      ${reflection ? `<p style="margin:14px auto;max-width:560px;background:#FFF9EA;border-radius:12px;padding:12px;font-size:1rem">“${escapeHtml(reflection)}”</p>` : ''}
      ${principles.length ? `<p style="font-size:1rem">나의 실천 약속: <strong>${principles.map(escapeHtml).join(' · ')}</strong></p>` : ''}
      <p style="margin-top:16px;color:#6b7a8d">${date} · 세계를 잇는 여행</p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
