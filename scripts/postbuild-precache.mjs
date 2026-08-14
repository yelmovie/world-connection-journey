// 빌드 산출물(js/css) 목록을 dist/precache-manifest.json으로 기록한다.
// sw.js가 install 단계에서 이 목록을 읽어 전부 프리캐시 — 오프라인에서도
// 아직 방문하지 않은 페이지(lazy chunk)가 열리게 한다.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const distAssets = join(process.cwd(), 'dist', 'assets');
const files = readdirSync(distAssets)
  .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
  .map((f) => `./assets/${f}`);

writeFileSync(join(process.cwd(), 'dist', 'precache-manifest.json'), JSON.stringify({ files }, null, 2));
console.log(`[precache] ${files.length}개 산출물 기록`);
