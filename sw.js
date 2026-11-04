/* SPACE WORKS 서비스워커: 앱 화면 파일만 캐시(오프라인에서도 열리게). 메일·일정·파일 같은 데이터는 캐시하지 않는다. */
const VERSION = 'works-2611041407';
const SHELL = ['./', 'index.html', 'style.css', 'mail.css', 'graph.js', 'app.js', 'mail.js', 'events.js', 'events.css', 'ipo.js', 'ipo.css', 'files.js', 'files.css', 'vendor/msal-browser.min.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Graph·로그인 요청은 건드리지 않음
  // 화면 파일: 네트워크 우선(새 버전 바로 반영), 실패하면 캐시
  // cache:'no-cache' — GitHub Pages의 10분 캐시를 건너뛰고 서버에 새 버전이 있는지 매번 확인
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    const copy = r.clone();
    if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
