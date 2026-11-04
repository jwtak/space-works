/* SPACE WORKS 서비스워커: 앱 화면 파일만 캐시(오프라인에서도 열리게). 메일·일정·파일 같은 데이터는 캐시하지 않는다. */
const VERSION = 'works-2611041506';
const SHELL = ['./', 'index.html', 'style.css', 'mail.css', 'graph.js', 'app.js', 'mail.js', 'events.js', 'events.css', 'ipo.js', 'ipo.css', 'files.js', 'files.css', 'vendor/msal-browser.min.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* 홈페이지 미리보기: ./hp/… 요청은 팀 파일함 '_홈페이지 미리보기' 폴더의 빌드 결과를 Graph로 읽어 돌려준다.
   공개 주소 없이, 웍스에 로그인한 사람(팀 구성원)만 볼 수 있다. 빌드 주소의 '/__hp__/'는 여기서 실제 경로로 바꾼다. */
const HP = { drive: 'b!j-FPAIUPjU6AnBcIJNprMgAfPOR1jCVOvR6mVssjMWkyr34wYSj7Rp-_wJU9Subr', dir: '_홈페이지 미리보기', base: '/__hp__/' };
const HP_MIME = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', txt: 'text/plain; charset=utf-8', xml: 'application/xml' };
const HP_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'";
let hpTok = null; // { t, exp } — 웍스 화면이 넘겨준 Graph 토큰(메모리에만)
self.addEventListener('message', (e) => { if (e.data?.type === 'token') hpTok = { t: e.data.token, exp: e.data.exp }; });
async function hpToken() {
  if (hpTok && hpTok.exp - 60000 > Date.now()) return hpTok.t;
  const wins = (await self.clients.matchAll({ type: 'window' })).filter((c) => !new URL(c.url).pathname.startsWith(hpPath()));
  for (const c of wins) {
    const r = await new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (ev) => res(ev.data); c.postMessage({ type: 'need-token' }, [ch.port2]); setTimeout(() => res(null), 4000); });
    if (r?.token) { hpTok = { t: r.token, exp: r.exp }; return r.token; }
  }
  return null;
}
const hpPath = () => new URL('./hp/', self.registration.scope).pathname;
async function hpServe(rel) {
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const txt = (s, status) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const tok = await hpToken();
  if (!tok) return txt('웍스에 로그인한 뒤 다시 열어 주세요.', 401);
  const p = [HP.dir, ...rel.split('/').map((s) => decodeURIComponent(s))].map(encodeURIComponent).join('/');
  const r = await fetch(`https://graph.microsoft.com/v1.0/drives/${HP.drive}/root:/${p}:/content`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) return txt(r.status === 404 ? '없는 페이지입니다.' : `불러오지 못했습니다 (${r.status})`, r.status === 404 ? 404 : 502);
  const ext = (/\.([a-z0-9]+)$/i.exec(rel) || [, ''])[1].toLowerCase(), type = HP_MIME[ext] || 'application/octet-stream';
  let body = await r.blob();
  if (/^(text\/|application\/(json|xml))/.test(type)) body = (await body.text()).split(HP.base).join(hpPath());
  return new Response(body, { headers: { 'Content-Type': type, 'Content-Security-Policy': HP_CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Graph·로그인 요청은 건드리지 않음
  if (url.pathname.startsWith(hpPath())) { e.respondWith(hpServe(url.pathname.slice(hpPath().length))); return; }
  // 화면 파일: 네트워크 우선(새 버전 바로 반영), 실패하면 캐시
  // cache:'no-cache' — GitHub Pages의 10분 캐시를 건너뛰고 서버에 새 버전이 있는지 매번 확인
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    const copy = r.clone();
    if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
