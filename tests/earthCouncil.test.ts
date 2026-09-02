import { describe, expect, it } from 'vitest';
import raw from '../public/content/v1/ko/environment.json';
import {
  buildPledge, canOpenCouncil, canRunSimulation, defaultEarthProgress, friendCountForIssue,
  personalActionIssue, simulate, validateEarthProgress, type EarthContent
} from '../src/core/earthCouncil';
import { fixJosa } from '../src/core/josa';

const content = raw as unknown as EarthContent;

describe('지구회의 콘텐츠 무결성', () => {
  it('선택할 환경문제 4개가 있고 물 부족 주제도 세 수준의 해결 행동으로 이어진다', () => {
    expect(content.issues).toHaveLength(4);
    const climateIssue = content.issues.find((issue) => issue.id === 'climate');
    expect(climateIssue?.imageAssetId).toBe('earth.issue.climate_glacier');
    const waterIssue = content.issues.find((issue) => issue.id === 'resource');
    expect(waterIssue?.imageAssetId).toBe('earth.issue.water_sharing');
    expect(content.roundtable.resource).toHaveLength(4);
    const waterTiers = new Set(content.actions.filter((action) => action.issues.includes('resource')).map((action) => action.tier));
    expect(waterTiers).toEqual(new Set(['self', 'community', 'institution']));
    expect(content.councilTurns).toHaveLength(6);
    expect(new Set(content.councilTurns.map((turn) => turn.phase))).toEqual(new Set(['문제', '해결책', '약속']));
    expect(content.councilTurns.every((turn) => content.friends.some((friend) => friend.id === turn.friendId))).toBe(true);
  });
  it('신호 6개가 각각 친구·문제·연결 유형·범위 안내를 갖는다', () => {
    expect(content.signals).toHaveLength(6);
    const friendIds = new Set(content.friends.map((f) => f.id));
    const issueIds = new Set(content.issues.map((i) => i.id));
    for (const s of content.signals) {
      expect(friendIds.has(s.friendId), s.id).toBe(true);
      expect(issueIds.has(s.issueId), s.id).toBe(true);
      expect(s.connectionTypes.length).toBeGreaterThan(0);
      expect(s.hotspots.length).toBeGreaterThanOrEqual(2);
      expect(s.scopeNoteKo).toContain('한 곳');
      expect(s.needsReview).toBe(true);
    }
  });
  it('문제마다 원탁 참석자 3명 이상, 관점 겹치지 않음, 렌즈마다 맞는 이유 1개', () => {
    for (const issue of content.issues) {
      const seats = content.roundtable[issue.id] ?? [];
      expect(seats.length, issue.id).toBeGreaterThanOrEqual(3);
      expect(new Set(seats.map((s) => s.perspectiveId)).size).toBe(seats.length);
      expect(friendCountForIssue(content, issue.id)).toBeGreaterThanOrEqual(3);
    }
    for (const lens of content.lenses) {
      expect(content.connectionReasons[lens.id].filter((r) => r.fits)).toHaveLength(1);
    }
    for (const tier of content.actionTiers) {
      expect(content.actions.some((a) => a.tier === tier.id)).toBe(true);
    }
  });
});

describe('진행 상태 검증', () => {
  it('중복·알 수 없는 ID를 버리고 근거 없는 장면은 되돌린다', () => {
    const p = validateEarthProgress({
      scene: 'done',
      signalViewedIds: ['sig_nepal_glacier', 'sig_nepal_glacier', 'ghost'],
      signalObservedIds: ['sig_nepal_glacier', 'sig_japan_heat'],
      inspectedIssueIds: ['ocean', 'ocean', 'ghost'],
      councilTurnIndex: 999,
      selectedPerspectiveIds: ['p_effect', 'p_cost', 'p_local']
    }, content);
    expect(p.signalViewedIds).toEqual(['sig_nepal_glacier']);
    expect(p.signalObservedIds).toEqual(['sig_nepal_glacier']);
    expect(p.inspectedIssueIds).toEqual(['ocean']);
    expect(p.councilTurnIndex).toBe(content.councilTurns.length);
    expect(p.selectedPerspectiveIds).toHaveLength(2);
    expect(p.scene).toBe('signals');
    expect(p.missionCompleted).toBe(false);
  });
  it('회의는 신호 4개 관찰 + 연결 2개 뒤에만 열린다', () => {
    const p = defaultEarthProgress();
    expect(canOpenCouncil(p)).toBe(false);
    p.signalViewedIds = content.signals.slice(0, 4).map((s) => s.id);
    p.signalObservedIds = [...p.signalViewedIds];
    expect(canOpenCouncil(p)).toBe(false);
    p.exploredConnectionTypes = ['ocean', 'climate'];
    expect(canOpenCouncil(p)).toBe(true);
    expect(validateEarthProgress({ ...p, scene: 'pledge' }, content).scene).toBe('issue');
    p.inspectedIssueIds = content.issues.map((issue) => issue.id);
    expect(validateEarthProgress({ ...p, scene: 'roundtable' }, content).scene).toBe('roundtable');
  });
});

describe('해결안 학습용 모형', () => {
  it('개인 행동만 고르면 실험이 안 되고, 세 수준을 고르면 된다', () => {
    expect(canRunSimulation(content, ['a_reuse'])).toBe(false);
    expect(canRunSimulation(content, ['a_reuse', 'a_cleanup', 'a_rule'])).toBe(true);
  });
  it('조합에 따라 피드백이 달라지고 정답 조합 하나로 고정되지 않는다', () => {
    const a = simulate(content, 'ocean', ['a_reuse', 'a_cleanup', 'a_rule']);
    const b = simulate(content, 'ocean', ['a_energy', 'a_shade', 'a_treaty']);
    const c = simulate(content, 'ocean', ['a_reuse', 'a_cleanup', 'a_treaty']);
    expect(b.feedback).toContain(content.simulationFeedback.offIssue);
    expect(a.feedback).not.toEqual(b.feedback);
    expect(a.cooperation).toBeLessThan(c.cooperation);
    expect(a.feedback).not.toEqual(c.feedback);
    expect([a, b, c].every((r) => [1, 2, 3].includes(r.effect))).toBe(true);
  });
});

describe('공동약속', () => {
  it('선택이 문장에 반영되고 마지막 줄은 학생 글이 들어간다', () => {
    const p = defaultEarthProgress();
    p.selectedIssueId = 'ocean';
    p.selectedActionIds = ['a_reuse', 'a_cleanup', 'a_rule'];
    p.personalActionDraft = '월요일 아침 등굣길에 물병을 챙기고 친구와 확인하기';
    const lines = buildPledge(content, p);
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain('바다와 플라스틱 쓰레기');
    expect(lines[2]).toContain('다회용 물병');
    expect(lines[5]).toContain('월요일 아침');
    expect(personalActionIssue(content, '환경 보호')).not.toBeNull();
    expect(personalActionIssue(content, p.personalActionDraft)).toBeNull();
    // 도배 글자와 육하 단서 없는 문장은 통과하지 못한다 (P1-11)
    expect(personalActionIssue(content, 'ㅋㅋㅋㅋㅋㅋㅋㅋ')).not.toBeNull();
    expect(personalActionIssue(content, '물병을 챙겨서 아껴 쓰겠다')).not.toBeNull();
    expect(personalActionIssue(content, '매일 아침 물병을 챙겨서 아껴 쓰겠다')).toBeNull();
  });

  it('채워진 낱말의 받침에 맞게 조사를 고친다 — "쓰기을" 금지', () => {
    expect(fixJosa('물 아껴 쓰기', '을')).toBe('물 아껴 쓰기를');
    expect(fixJosa('다회용 물병', '을')).toBe('다회용 물병을');
    expect(fixJosa('바다', '과')).toBe('바다와');
    const p = defaultEarthProgress();
    p.selectedIssueId = 'ocean';
    p.selectedActionIds = ['a_reuse', 'a_cleanup', 'a_rule'];
    // 모든 약속 문장에서 받침 없는 글자 + '을' 조합이 남지 않아야 한다
    for (const line of buildPledge(content, p)) {
      for (const m of line.matchAll(/([가-힣])을 /g)) {
        const code = m[1]!.charCodeAt(0);
        expect((code - 0xac00) % 28, `잘못된 조사: "${m[0]}" in "${line}"`).not.toBe(0);
      }
    }
  });
});
