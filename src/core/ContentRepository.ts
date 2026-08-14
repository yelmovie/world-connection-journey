/** 콘텐츠 JSON 로더 — public/content/v1/ko/*.json, 페이지별 lazy + 캐시 */
const cache = new Map<string, unknown>();

export async function loadContent<T>(name: string): Promise<T> {
  const hit = cache.get(name);
  if (hit) return hit as T;
  const res = await fetch(`content/v1/ko/${name}.json`);
  if (!res.ok) throw new Error(`콘텐츠 로드 실패: ${name} (HTTP ${res.status})`);
  const json: unknown = await res.json();
  cache.set(name, json);
  return json as T;
}
