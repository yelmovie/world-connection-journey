/** HTML 이스케이프 — 템플릿 문자열에 사용자·콘텐츠 텍스트를 넣을 때 공용으로 쓴다. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
