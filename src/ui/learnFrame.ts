import { assetUrl, hasAsset } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { openModal } from './modal';
import { popBounce } from './fx';
import type { MissionId } from '../types';

/**
 * 배움 프레임 — 모든 미션을 같은 3막 학습 루프로 감싼다.
 *   ① 친구 만나기(누구를 만나 무엇을 배우는지) → ② 먼저 예상하기(첫 생각 기록)
 *   → 기존 미션 활동 → ③ 배움 확인(처음 생각 vs 발견) + 배움 카드 저장
 * 점수·체크포인트 로직과 무관하다(성찰 기록 전용). 저장은 missions[id].data.learn 사용
 * — 스키마 변경 없이 기존 data 필드에 담아 마이그레이션이 필요 없다.
 */
export interface MissionLearn {
  friend: { name: string; region: string; imageId?: string };
  goal: string;
  prediction: { question: string; options: string[] };
  discoveries: string[];
}

interface LearnRecord {
  prediction?: string;
  confirmedAt?: string;
  /* 여권·수료증이 콘텐츠 파일을 다시 읽지 않도록 확정 시점에 함께 저장 */
  cardLine?: string;
  friendName?: string;
  friendImageId?: string;
}

export function getLearn(content: unknown): MissionLearn | null {
  if (!content || typeof content !== 'object') return null;
  const learn = (content as Record<string, unknown>).learn as MissionLearn | undefined;
  if (!learn || !learn.friend || !learn.prediction || !Array.isArray(learn.discoveries)) return null;
  return learn;
}

function readRecord(missionId: MissionId): LearnRecord {
  const raw = saveRepo.get().missions[missionId].data.learn;
  return raw && typeof raw === 'object' ? (raw as LearnRecord) : {};
}

function writeRecord(missionId: MissionId, patch: LearnRecord): void {
  saveRepo.update((s) => {
    const data = s.missions[missionId].data;
    data.learn = { ...(data.learn as object | undefined), ...patch };
  });
}

export function savedPrediction(missionId: MissionId): string | null {
  return readRecord(missionId).prediction ?? null;
}

function friendImg(learn: MissionLearn, size: string): string {
  const id = learn.friend.imageId;
  return id && hasAsset(id)
    ? `<img src="${assetUrl(id)}" alt="" aria-hidden="true" style="width:${size};max-height:34vh;object-fit:contain;filter:drop-shadow(0 8px 18px rgba(8,18,33,.45))">`
    : '';
}

/**
 * ① 친구 만나기 + ② 먼저 예상하기.
 * 이미 예상을 기록했다면(이어하기) 짧은 인사만 보여 준다.
 */
export function showFriendIntro(missionId: MissionId, learn: MissionLearn, onBegin: () => void): void {
  const prior = savedPrediction(missionId);
  const body = document.createElement('div');
  body.className = 'learn-intro';

  if (prior) {
    body.innerHTML = `
      <div class="learn-hero">${friendImg(learn, 'clamp(120px,16vw,200px)')}
        <div><p class="learn-name">${learn.friend.name}</p><p class="learn-region">${learn.friend.region}</p></div>
      </div>
      <p class="learn-goal">${learn.goal}</p>
      <p class="learn-prior">내 첫 생각: “${prior}” — 조사하면서 확인해 봐요!</p>`;
    openModal({
      id: `learn-intro-${missionId}`,
      bodyEl: body,
      dismissible: false,
      actions: [{ label: '이어서 조사하기', kind: 'primary', autofocus: true, onClick: (close) => { close(); onBegin(); } }]
    });
    return;
  }

  body.innerHTML = `
    <div class="learn-hero">${friendImg(learn, 'clamp(140px,18vw,230px)')}
      <div>
        <p class="learn-eyebrow">오늘 만날 친구</p>
        <p class="learn-name">${learn.friend.name}</p>
        <p class="learn-region">${learn.friend.region}</p>
      </div>
    </div>
    <p class="learn-goal">${learn.goal}</p>
    <p class="learn-question">${learn.prediction.question}</p>
    <div class="learn-options">
      ${learn.prediction.options.map((o) => `<button type="button" class="btn btn-ghost learn-option">${o}</button>`).join('')}
    </div>
    <p class="learn-hint">정답은 없어요. 지금 생각을 골라 두고, 조사 후에 다시 봐요!</p>`;

  const close = openModal({ id: `learn-intro-${missionId}`, bodyEl: body, dismissible: false, actions: [] });
  body.querySelectorAll<HTMLElement>('.learn-option').forEach((btn) =>
    btn.addEventListener('click', () => {
      void audio.playSfx('tap');
      writeRecord(missionId, { prediction: btn.textContent?.trim() ?? '' });
      popBounce(btn);
      window.setTimeout(() => {
        close();
        onBegin();
      }, 260);
    })
  );
}

/** ③ 배움 확인 — 미션 성공 직후, 점수 모달 전에 호출한다. */
export function showLearningWrap(missionId: MissionId, learn: MissionLearn, onDone: () => void): void {
  const prior = savedPrediction(missionId);
  const body = document.createElement('div');
  body.className = 'learn-wrap';
  body.innerHTML = `
    <div class="learn-hero learn-hero--small">${friendImg(learn, 'clamp(88px,10vw,140px)')}
      <div><p class="learn-name">${learn.friend.name}</p><p class="learn-region">${learn.friend.region}</p></div>
    </div>
    ${prior ? `<p class="learn-prior">처음 생각: “${prior}”</p>` : ''}
    <p class="learn-question">조사해 보니, 이걸 알게 됐어요!</p>
    <ul class="learn-discoveries">
      ${learn.discoveries.map((d) => `<li class="learn-discovery" hidden>${d}</li>`).join('')}
    </ul>`;

  openModal({
    id: `learn-wrap-${missionId}`,
    title: '배움 카드',
    bodyEl: body,
    dismissible: false,
    actions: [{
      label: '배움 카드 받기',
      kind: 'primary',
      autofocus: true,
      onClick: (close) => {
        writeRecord(missionId, {
          confirmedAt: new Date().toISOString(),
          cardLine: learn.discoveries[0] ?? learn.goal,
          friendName: learn.friend.name,
          friendImageId: learn.friend.imageId
        });
        void audio.playSfx('stamp');
        close();
        onDone();
      }
    }]
  });

  // 발견을 하나씩 드러낸다 — 읽을 흐름을 만들고 글 덩어리로 안 보이게
  const items = [...body.querySelectorAll<HTMLElement>('.learn-discovery')];
  items.forEach((li, i) => {
    window.setTimeout(() => {
      li.hidden = false;
      popBounce(li);
      void audio.playSfx('partial');
    }, 250 + i * 650);
  });
}

/** 여권·수료증에서 쓰는 배움 카드 요약 — 저장만 읽으므로 콘텐츠 로드가 필요 없다 */
export function readLearnCard(missionId: MissionId): { earned: boolean; line: string; friendName: string; friendImageId?: string } {
  const rec = readRecord(missionId);
  return {
    earned: !!rec.confirmedAt,
    line: rec.cardLine ?? '',
    friendName: rec.friendName ?? '',
    friendImageId: rec.friendImageId
  };
}
