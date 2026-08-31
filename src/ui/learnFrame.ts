import { assetUrl, hasAsset } from '../core/assets';
import { audio } from '../core/AudioManager';
import { saveRepo } from '../core/SaveRepository';
import { openModal } from './modal';
import type { MissionId } from '../types';

export interface MissionLearn {
  friend: { name: string; region: string; imageId?: string };
  goal: string;
  introMode?: 'prediction' | 'question-only' | 'friend-only';
  prediction: { question: string; options: string[] };
  discoveries: string[];
}

export interface LearnRecord {
  initialHypothesis?: string;
  initialRecordedAt?: string;
  confirmedAt?: string;
  cardLine?: string;
  friendName?: string;
  friendImageId?: string;
  revisedThought?: string;
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
  saveRepo.update((save) => {
    const data = save.missions[missionId].data;
    data.learn = { ...(data.learn as object | undefined), ...patch };
  });
}

export function readLearnRecord(missionId: MissionId): LearnRecord {
  return { ...readRecord(missionId) };
}

function friendImg(learn: MissionLearn, size: string): string {
  const id = learn.friend.imageId;
  return id && hasAsset(id)
    ? `<img src="${assetUrl(id)}" alt="" aria-hidden="true" style="width:${size};max-height:34vh;object-fit:contain;filter:drop-shadow(0 8px 18px rgba(8,18,33,.45))">`
    : '';
}

/**
 * 미션 전에 학생의 첫 생각을 남긴다. 정답을 맞히는 퀴즈가 아니라,
 * 미션 뒤 발견과 비교하기 위한 예측 기록이다.
 */
export function showFriendIntro(missionId: MissionId, learn: MissionLearn, onBegin: () => void): void {
  const mode = learn.introMode ?? 'prediction';
  const asksQuestion = mode !== 'friend-only' && Boolean(learn.prediction?.question);

  const body = document.createElement('div');
  body.className = 'learn-intro';
  body.innerHTML = `
    <div class="learn-hero">${friendImg(learn, 'clamp(110px,13vw,170px)')}
      <div>
        <p class="learn-eyebrow">${mode === 'question-only' ? '먼저 생각해 보기' : '오늘 만날 친구'}</p>
        <p class="learn-name">${learn.friend.name}</p>
        <p class="learn-region">${learn.friend.region}</p>
      </div>
    </div>
    ${mode === 'friend-only' ? `<p class="learn-goal">${learn.goal}</p>` : ''}
    ${asksQuestion ? `
      <section class="learn-prediction" aria-labelledby="learn-question-${missionId}">
        <h3 class="learn-question" id="learn-question-${missionId}">${learn.prediction.question}</h3>
      </section>` : ''}`;

  openModal({
    id: `learn-intro-${missionId}`,
    bodyEl: body,
    dismissible: false,
    actions: [{
      label: asksQuestion ? '생각해 봤어' : '만나러 가기',
      kind: 'primary',
      onClick: (close) => {
        close();
        onBegin();
      }
    }]
  });
}

/** 미션 결과 뒤에 처음 예상과 발견을 비교하고, 가장 중요한 발견을 직접 고른다. */
export function showLearningWrap(missionId: MissionId, learn: MissionLearn, onDone: () => void): void {
  const record = readRecord(missionId);
  let selectedDiscovery = record.revisedThought && learn.discoveries.includes(record.revisedThought)
    ? record.revisedThought
    : '';
  let activeIndex = 0;
  const viewed = new Set<number>();
  if (learn.discoveries.length > 0) viewed.add(0);

  const body = document.createElement('div');
  body.className = 'learn-wrap';
  body.innerHTML = `
    <div class="learn-hero learn-hero--small">${friendImg(learn, 'clamp(82px,9vw,126px)')}
      <div><p class="learn-name">${learn.friend.name}</p><p class="learn-region">${learn.friend.region}</p></div>
    </div>
    ${record.initialHypothesis ? `<p class="learn-first-thought"><strong>처음 예상</strong><span>${record.initialHypothesis}</span></p>` : ''}
    <h3 class="learn-question">세 발견을 비교해 봐</h3>
    <div class="learn-discovery-view" role="group" aria-label="미션에서 확인한 발견">
      <button type="button" class="learn-discovery-nav" data-discovery-prev aria-label="이전 발견">‹</button>
      <button type="button" class="learn-discovery" role="radio" aria-checked="false" data-discovery-current></button>
      <button type="button" class="learn-discovery-nav" data-discovery-next aria-label="다음 발견">›</button>
    </div>
    <div class="learn-discovery-meta">
      <span data-discovery-count></span>
      <span data-discovery-status role="status" aria-live="polite"></span>
    </div>
    <p class="learn-hint">가장 중요한 발견을 카드로 골라.</p>`;

  let ready = learn.discoveries.length === 0;
  openModal({
    id: `learn-wrap-${missionId}`,
    title: '생각이 어떻게 달라졌을까?',
    bodyEl: body,
    dismissible: false,
    actions: [{
      label: '배움 카드 받기',
      kind: 'primary',
      onClick: (close) => {
        if (!ready) return;
        writeRecord(missionId, {
          confirmedAt: new Date().toISOString(),
          cardLine: selectedDiscovery || learn.goal,
          friendName: learn.friend.name,
          friendImageId: learn.friend.imageId,
          revisedThought: selectedDiscovery || learn.goal
        });
        void audio.playSfx('stamp');
        close();
        onDone();
      }
    }]
  });

  const card = body.querySelector<HTMLButtonElement>('[data-discovery-current]')!;
  const prev = body.querySelector<HTMLButtonElement>('[data-discovery-prev]')!;
  const next = body.querySelector<HTMLButtonElement>('[data-discovery-next]')!;
  const count = body.querySelector<HTMLElement>('[data-discovery-count]')!;
  const status = body.querySelector<HTMLElement>('[data-discovery-status]')!;
  const actionButton = body.closest('.modal')?.querySelector<HTMLButtonElement>('.modal-actions .btn-primary') ?? null;

  const paint = (): void => {
    const discovery = learn.discoveries[activeIndex] ?? learn.goal;
    const allViewed = viewed.size >= learn.discoveries.length;
    card.textContent = discovery;
    card.classList.toggle('is-selected', discovery === selectedDiscovery);
    card.setAttribute('aria-checked', String(discovery === selectedDiscovery));
    card.disabled = learn.discoveries.length === 0;
    prev.disabled = activeIndex <= 0;
    next.disabled = activeIndex >= learn.discoveries.length - 1;
    count.textContent = learn.discoveries.length > 0 ? `${activeIndex + 1} / ${learn.discoveries.length}` : '';
    status.textContent = allViewed ? '모두 확인했어' : '화살표로 하나씩 확인해 봐';
    ready = learn.discoveries.length === 0 || (allViewed && Boolean(selectedDiscovery));
    if (actionButton) {
      actionButton.disabled = !ready;
      actionButton.textContent = ready ? '배움 카드 받기' : allViewed ? '중요한 발견을 골라' : '세 발견을 먼저 확인해';
    }
  };

  const move = (delta: number): void => {
    const nextIndex = Math.max(0, Math.min(learn.discoveries.length - 1, activeIndex + delta));
    if (nextIndex === activeIndex) return;
    activeIndex = nextIndex;
    viewed.add(activeIndex);
    paint();
    card.focus();
    void audio.playSfx('tap');
  };
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  card.addEventListener('click', () => {
    selectedDiscovery = learn.discoveries[activeIndex] ?? '';
    paint();
    void audio.playSfx('tap');
  });
  paint();
}

/** 여권의 배움 카드 요약은 저장값만 읽으므로 콘텐츠 재로딩이 필요 없다. */
export function readLearnCard(missionId: MissionId): { earned: boolean; line: string; friendName: string; friendImageId?: string; initialHypothesis: string; revisedThought: string } {
  const record = readRecord(missionId);
  return {
    earned: Boolean(record.confirmedAt),
    line: record.cardLine ?? '',
    friendName: record.friendName ?? '',
    friendImageId: record.friendImageId,
    initialHypothesis: record.initialHypothesis ?? '',
    revisedThought: record.revisedThought ?? record.cardLine ?? ''
  };
}
