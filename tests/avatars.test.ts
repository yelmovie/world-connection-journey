import { describe, expect, it } from 'vitest';
import { hasAsset } from '../src/core/assets';
import { AVATAR_CHOICES, selectedAvatarAssetId, selectedAvatarSpeaker } from '../src/ui/avatarRoster';

describe('탐험가 아바타 매핑', () => {
  it('같은 일러스트 묶음의 탐험가 6명을 제공한다', () => {
    expect(AVATAR_CHOICES).toHaveLength(6);
    expect(new Set(AVATAR_CHOICES.map((avatar) => avatar.saveId)).size).toBe(6);
    expect(new Set(AVATAR_CHOICES.map((avatar) => avatar.assetId)).size).toBe(6);
    expect(new Set(AVATAR_CHOICES.map((avatar) => avatar.name)).size).toBe(6);
    expect(new Set(AVATAR_CHOICES.map((avatar) => avatar.role)).size).toBe(6);
    expect(new Set(AVATAR_CHOICES.map((avatar) => avatar.support.id)).size).toBe(6);
    AVATAR_CHOICES.forEach((avatar) => {
      expect(avatar.assetId).not.toContain('3d');
      expect(hasAsset(avatar.assetId)).toBe(true);
      expect(avatar.label).toContain(avatar.name);
      expect(avatar.label).toContain(avatar.role.replace(' 탐험가', ''));
      expect(avatar.sampleLine).toContain(avatar.name);
      expect(avatar.sampleLine.length).toBeLessThanOrEqual(54);
      expect(avatar.support.description.length).toBeGreaterThan(12);
      expect(avatar.support.missionHints.oceania?.length).toBeGreaterThan(12);
    });
  });

  it('기존 저장값은 새 2D 탐험가로 이어지고 알 수 없는 값은 기본값으로 복구한다', () => {
    expect(selectedAvatarAssetId('a1')).toBe('oceania.visitor');
    expect(selectedAvatarAssetId('a6')).toBe('oceania.youth');
    expect(selectedAvatarAssetId('unknown')).toBe('oceania.visitor');
  });

  it('여권 별명과 탐험가 이미지를 모든 화면용 플레이어 화자로 묶는다', () => {
    const speaker = selectedAvatarSpeaker({ avatarId: 'a4', nickname: '햇살빛' });
    expect(speaker.name).toBe('햇살빛');
    expect(speaker.assetId).toBe('greeting.morocco');
    expect(speaker.avatar.name).toBe('유세프');
  });
});
