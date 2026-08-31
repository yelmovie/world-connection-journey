import { describe, expect, it } from 'vitest';
import { validatePassportNickname } from '../src/core/passportNickname';

const banned = ['바보', '씨발'];

describe('여권 이름 검사', () => {
  it.each(['소피아', '민준', 'Sofia', "O'Connor", 'Mary Jane'])(
    '한글 또는 영어 이름 %s을 허용한다',
    (name) => expect(validatePassportNickname(name, 12, banned)).toBeNull()
  );

  it.each(['ㄴㅇㄹ', 'sㅇㄹ', 'asdf', 'aaaa', '1234', '소피아!', '바보왕'])(
    '무의미하거나 부적절한 입력 %s을 거절한다',
    (name) => expect(validatePassportNickname(name, 12, banned)).not.toBeNull()
  );
});
