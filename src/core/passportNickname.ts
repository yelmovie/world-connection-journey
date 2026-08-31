function compactNickname(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s'’-]/g, '');
}

/** 학생 여권에 들어갈 표시 이름을 DOM과 무관하게 검사한다. */
export function validatePassportNickname(value: string, maxLen: number, banned: string[]): string | null {
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name) return '한글이나 영어로 이름을 적어 줘.';
  if (name.length > maxLen) return `이름은 ${maxLen}자까지 쓸 수 있어.`;
  if (/[ㄱ-ㅎㅏ-ㅣ]/.test(name)) return '자음이나 모음만 쓰지 말고 이름을 완성해 줘.';

  const koreanName = /^[가-힣]+(?: [가-힣]+)*$/.test(name);
  const englishName = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/.test(name);
  if (!koreanName && !englishName) return '한글 이름이나 영어 이름 중 하나로 적어 줘.';

  const letters = name.replace(/[^A-Za-z가-힣]/g, '');
  if (englishName && letters.length < 2) return '영어 이름은 두 글자 이상 적어 줘.';
  if (/^(.)\1{2,}$/iu.test(letters)) return '같은 글자만 반복하지 말고 이름을 적어 줘.';

  const compact = compactNickname(name);
  const meaningless = /^(?:asdf|qwer|zxcv|abc|abcd|test|name|none|null|unknown|guest|user|aaa+|bbb+|xxx+)$/i;
  if (meaningless.test(compact)) return '연습 글자 대신 사용할 이름을 적어 줘.';
  if (banned.some((word) => {
    const bannedWord = compactNickname(word);
    return Boolean(bannedWord) && compact.includes(bannedWord);
  })) return '다른 친구도 편안하게 부를 수 있는 이름을 골라 줘.';
  return null;
}
