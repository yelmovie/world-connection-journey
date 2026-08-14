/* 세계를 잇는 여행 — 서비스워커
 * 캐시 전략: 코어 프리캐시 + cache-first, 네트워크 성공분은 runtime 캐시.
 * VERSION은 package.json의 version과 맞춘다. 배포 버전을 올릴 때 여기도 함께 수정하면
 * activate 단계에서 구버전 캐시가 통째로 삭제된다.
 */
const VERSION = '0.1.3';
const PRECACHE = `wcj-precache-v${VERSION}`;
const RUNTIME = `wcj-runtime-v${VERSION}`;

// BGM mp3는 용량이 커서 프리캐시하지 않는다 — 첫 재생 때 runtime 캐시에 담긴다.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './fonts/jua-400.woff2',
  './fonts/pretendard-400.woff2',
  './fonts/pretendard-700.woff2',
  './assets/favicon.webp',
  './assets/bg_title.webp',
  './assets/bg_map.webp',
  './assets/title_logo.webp',
  './assets/plane_main.webp',
  './assets/prop_passport.webp',
  './assets/prop_stamp.webp',
  './assets/icon_compass.webp',
  './content/v1/ko/common.json',
  './content/v1/ko/asia.json',
  './content/v1/ko/europe.json',
  './content/v1/ko/africa.json',
  './content/v1/ko/americas.json',
  './content/v1/ko/oceania.json',
  './content/v1/ko/dialogue.json'
];

/* 엔트리 번들(js/css)은 파일명에 해시가 붙어 목록에 못 적는다.
 * index.html을 읽어 참조된 빌드 산출물을 찾아 함께 프리캐시한다.
 * (첫 방문 로드는 SW 제어 밖이라 runtime 캐시에 안 잡히는 문제의 근본 대응) */
async function precacheEntryAssets(cache) {
  // 1순위: 빌드가 만든 청크 목록 (모든 페이지 lazy chunk 포함 — 오프라인 전 페이지 진행 보장)
  try {
    const res = await fetch('./precache-manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      const { files } = await res.json();
      await Promise.all(files.map((u) => cache.add(u).catch(() => undefined)));
      return;
    }
  } catch {
    /* dev 서버 등 목록이 없으면 index.html 파싱으로 폴백 */
  }
  try {
    const res = await fetch('./index.html', { cache: 'no-cache' });
    if (!res.ok) return;
    const html = await res.text();
    const urls = [...html.matchAll(/(?:src|href)="\.?\/?((?:assets\/)[^"]+\.(?:js|css))"/g)].map((m) => './' + m[1]);
    await Promise.all(urls.map((u) => cache.add(u).catch(() => undefined)));
  } catch {
    /* 오프라인 설치 등 — 프리캐시 실패는 치명적이지 않다 */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).then(() => precacheEntryAssets(cache)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== PRECACHE && key !== RUNTIME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// runtime 캐시 대상: 이미지·소리·콘텐츠·빌드 산출물(js/css/폰트)
const RUNTIME_PATH = /\/(assets|sound|content)\/|\.(js|css|woff2)$/;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 내비게이션(HTML)은 network-first — 새 배포가 즉시 반영되고, 오프라인일 때만 캐시 폴백.
  // (index.html까지 cache-first로 두면 구버전 앱이 영원히 서빙되는 사고가 난다)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PRECACHE).then((cache) => {
              cache.put('./index.html', copy);
            });
          }
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true }).then((page) => page ?? Response.error()))
    );
    return;
  }

  // ignoreVary: 정적 서버가 Vary: Origin을 붙이면 crossorigin 모듈 요청이
  // 캐시 매칭에 실패해 오프라인 부팅이 깨진다. 동일 출처 정적 파일만 다루므로 안전.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res.ok && RUNTIME_PATH.test(url.pathname)) {
            const copy = res.clone();
            caches.open(RUNTIME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch((err) => {
          // 오프라인에서 화면 이동(내비게이션)은 캐시된 index.html로 대신한다.
          if (req.mode === 'navigate') {
            return caches.match('./index.html', { ignoreVary: true }).then((page) => page ?? Promise.reject(err));
          }
          throw err;
        });
    })
  );
});
