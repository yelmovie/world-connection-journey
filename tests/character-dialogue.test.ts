import { describe, expect, it } from 'vitest';
import { splitDialogueSentences } from '../src/ui/characterDialogue';

describe('캐릭터 타이핑 대화 문장 분리', () => {
  it('친구 설명을 마침표 단위의 대화 차례로 나눈다', () => {
    expect(splitDialogueSentences(
      '그림이 있으면 이해하기 쉬워요. 이름을 원래 발음대로 불러 주세요. 춤추기를 좋아해요.'
    )).toEqual([
      '그림이 있으면 이해하기 쉬워요.',
      '이름을 원래 발음대로 불러 주세요.',
      '춤추기를 좋아해요.'
    ]);
  });

  it('불필요한 공백을 정리하고 빈 설명은 대화로 만들지 않는다', () => {
    expect(splitDialogueSentences('  첫 상황이에요.\n  다음 상황이에요!  ')).toEqual([
      '첫 상황이에요.',
      '다음 상황이에요!'
    ]);
    expect(splitDialogueSentences('   ')).toEqual([]);
  });
});
