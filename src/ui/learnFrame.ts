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
  const options = asksQuestion && Array.isArray(learn.prediction.options)
    ? learn.prediction.options.filter((option) => typeof option === 'string' && option.trim().length > 0)
    : [];
  const previous = readRecord(missionId).initialHypothesis;

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
        ${options.length > 0 ? `<div class="learn-options" role="group" aria-label="내 예측 고르기">
          ${options.map((option, index) => `<button type="button" class="card card-pick learn-option" data-option="${index}" aria-pressed="${option === previous}">${option === previous ? '✓ ' : ''}${option}</button>`).join('')}
        </div><p class="learn-hint">정답 맞히기가 아니야 — 여행이 끝나면 내 예측과 비교해 볼 거야.</p>` : ''}
      </section>` : ''}`;

  // 예측 선택지가 있으면 하나를 골라야 출발한다 — 고른 예측은 배움 카드에서 발견과 비교된다.
  const close = openModal({
    id: `learn-intro-${missionId}`,
    bodyEl: body,
    dismissible: false,
    actions: options.length > 0 ? [] : [{
      label: asksQuestion ? '생각해 봤어' : '만나러 가기',
      kind: 'primary',
      onClick: (doClose) => {
        doClose();
        onBegin();
      }
    }]
  });
  body.querySelectorAll<HTMLButtonElement>('[data-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const chosen = options[Number(button.dataset.option)];
      if (!chosen) return;
      const record = readRecord(missionId);
      writeRecord(missionId, {
        initialHypothesis: chosen,
        initialRecordedAt: record.initialRecordedAt ?? new Date().toISOString()
      });
      void audio.playSfx('tap');
      close();
      onBegin();
    });
  });
}

/** 미션 결과 뒤에 발견 내용을 짧게 확인하고 바로 다음 흐름으로 넘어간다. */
export function showLearningWrap(missionId: MissionId, learn: MissionLearn, onDone: () => void): void {
  const discoveries = learn.discoveries.length > 0 ? learn.discoveries : [learn.goal];
  const summaryLine = discoveries[0] ?? learn.goal;

  const body = document.createElement('div');
  body.className = 'learn-wrap';
  body.innerHTML = `
    <div class="learn-hero learn-hero--small">${friendImg(learn, 'clamp(82px,9vw,126px)')}
      <div><p class="learn-name">${learn.friend.name}</p><p class="learn-region">${learn.friend.region}</p></div>
    </div>
    <div class="learn-confirm-list" role="list" aria-label="이번 여행에서 확인한 내용">
      ${discoveries.map((discovery) => `<p class="learn-confirm-item" role="listitem"><span aria-hidden="true">✓</span><strong>${discovery}</strong></p>`).join('')}
    </div>`;

  openModal({
    id: `learn-wrap-${missionId}`,
    title: '이번 여행에서 확인했어',
    bodyEl: body,
    dismissible: false,
    actions: [{
      label: '확인했어',
      kind: 'primary',
      onClick: (close) => {
        writeRecord(missionId, {
          confirmedAt: new Date().toISOString(),
          cardLine: summaryLine,
          friendName: learn.friend.name,
          friendImageId: learn.friend.imageId,
          revisedThought: summaryLine
        });
        void audio.playSfx('tap');
        close();
        onDone();
      }
    }]
  });
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
