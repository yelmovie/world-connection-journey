/** 한글 이름의 마지막 글자 받침에 맞는 조사를 붙인다. */
export function withJosa(word: string, consonantJosa: string, vowelJosa: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hasFinalConsonant = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${word}${hasFinalConsonant ? consonantJosa : vowelJosa}`;
}

/** 조사 쌍 — 받침 있음/없음 순서. */
const JOSA_PAIRS: Record<string, [string, string]> = {
  '을': ['을', '를'], '를': ['을', '를'],
  '이': ['이', '가'], '가': ['이', '가'],
  '은': ['은', '는'], '는': ['은', '는'],
  '과': ['과', '와'], '와': ['과', '와']
};

/** 채워 넣은 낱말 뒤에 잘못 붙은 조사를 받침에 맞게 고친다. 예: "물 아껴 쓰기을" → "물 아껴 쓰기를" */
export function fixJosa(word: string, josa: string): string {
  const pair = JOSA_PAIRS[josa];
  return pair ? withJosa(word, pair[0], pair[1]) : `${word}${josa}`;
}
