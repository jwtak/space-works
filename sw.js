/* SPACE WORKS 서비스워커: 앱 화면 파일만 캐시(오프라인에서도 열리게). 메일·일정·파일 같은 데이터는 캐시하지 않는다. */
const VERSION = 'works-1794309952';
const SHELL = ['./', 'index.html', 'style.css', 'mail.css', 'graph.js', 'app.js', 'mail.js', 'events.js', 'events.css', 'ipo.js', 'ipo.css', 'radar.js', 'radar.css', 'pipeline.js', 'pipeline.css', 'facts.js', 'facts.css', 'delist.js', 'delist.css', 'pe.js', 'pe.css', 'files.js', 'files.css', 'news.js', 'news.css', 'market.js', 'market.css', 'feedback.js', 'feedback.css', 'guide.js', 'guide.css', 'vendor/msal-browser.min.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* 홈페이지 미리보기: ./hp/… 요청은 팀 파일함 '_홈페이지 미리보기' 폴더의 빌드 결과를 Graph로 읽어 돌려준다.
   공개 주소 없이, 웍스에 로그인한 사람(팀 구성원)만 볼 수 있다. 빌드 주소의 '/__hp__/'는 여기서 실제 경로로 바꾼다. */
const HP = { drive: 'b!j-FPAIUPjU6AnBcIJNprMgAfPOR1jCVOvR6mVssjMWkyr34wYSj7Rp-_wJU9Subr', dir: '_홈페이지 미리보기', base: '/__hp__/' };
const HP_MIME = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', txt: 'text/plain; charset=utf-8', xml: 'application/xml',
  mp4: 'video/mp4', webm: 'video/webm' };
const HP_TEXT = /^(text\/|image\/svg\+xml|application\/(json|xml))/; // '/__hp__/'를 바꿔 쓰는 형식(나머지는 그대로 흘려보냄)
const HP_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'none'";
let hpTok = null, hpTokReq = null; // { t, exp } — 웍스 화면이 넘겨준 Graph 토큰(메모리에만). hpTokReq: 진행 중인 토큰 요청(동시에 여러 파일을 읽어도 한 번만 묻는다)
self.addEventListener('message', (e) => { if (e.data?.type === 'token') hpTok = { t: e.data.token, exp: e.data.exp }; });
function hpToken(force) {
  if (!force && hpTok && hpTok.exp - 60000 > Date.now()) return Promise.resolve(hpTok.t);
  return (hpTokReq ||= (async () => {
    const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter((c) => !new URL(c.url).pathname.startsWith(hpPath()));
    for (const c of wins) {
      const r = await new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = (ev) => res(ev.data); c.postMessage({ type: 'need-token', force: !!force }, [ch.port2]); setTimeout(() => res(null), 4000); });
      if (r?.token) { hpTok = { t: r.token, exp: r.exp }; return r.token; }
    }
    return null;
  })().finally(() => { hpTokReq = null; }));
}
const hpPath = () => new URL('./hp/', self.registration.scope).pathname;
async function hpServe(req) {
  const url = new URL(req.url);
  let rel = url.pathname.slice(hpPath().length);
  const txt = (s, status) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  // 끝에 /가 없는 폴더 주소(확장자 없음)는 /를 붙여 다시 연다(그 안의 상대 경로 링크가 맞게 풀리도록)
  if (rel && !rel.endsWith('/') && !/\.[a-z0-9]+$/i.test(rel.split('/').pop())) { url.pathname += '/'; return Response.redirect(url.href, 302); }
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const ext = (/\.([a-z0-9]+)$/i.exec(rel) || [, ''])[1].toLowerCase(), type = HP_MIME[ext] || 'application/octet-stream', isText = HP_TEXT.test(type);
  const range = isText ? null : req.headers.get('Range'); // 글 형식은 바꿔 쓰므로 통째로 받는다
  let segs; try { segs = rel.split('/').map((s) => decodeURIComponent(s)); } catch { return txt('없는 페이지입니다.', 404); }
  const p = [HP.dir, ...segs].map(encodeURIComponent).join('/');
  const get = (tok, rg) => fetch(`https://graph.microsoft.com/v1.0/drives/${HP.drive}/root:/${p}:/content`, { headers: { Authorization: `Bearer ${tok}`, ...(rg ? { Range: rg } : {}) } });
  let r;
  try {
    let tok = await hpToken();
    if (!tok) return txt('웍스에 로그인한 뒤 다시 열어 주세요.', 401);
    r = await get(tok, range);
    if (r.status === 401) { hpTok = null; tok = await hpToken(true); if (!tok) return txt('웍스에 로그인한 뒤 다시 열어 주세요.', 401); r = await get(tok, range); } // 토큰이 막 만료됐으면 새로 받아 한 번만 다시
    if (r.status === 206 && !r.headers.get('Content-Range')) r = await get(tok); // 범위 정보를 못 읽으면 통째로
  } catch { return txt('불러오지 못했습니다. 네트워크를 확인해 주세요.', 502); }
  if (r.status === 416) return new Response(null, { status: 416, headers: r.headers.get('Content-Range') ? { 'Content-Range': r.headers.get('Content-Range') } : {} });
  if (!r.ok) return txt(r.status === 404 ? '없는 페이지입니다.' : `불러오지 못했습니다 (${r.status})`, r.status === 404 ? 404 : 502);
  const headers = { 'Content-Type': type, 'Content-Security-Policy': HP_CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
  if (isText) {
    try { return new Response((await r.text()).split(HP.base).join(hpPath()), { headers }); } catch { return txt('불러오지 못했습니다. 네트워크를 확인해 주세요.', 502); }
  }
  headers['Accept-Ranges'] = 'bytes';
  if (r.status === 206) headers['Content-Range'] = r.headers.get('Content-Range');
  return new Response(r.body, { status: r.status === 206 ? 206 : 200, headers });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Graph·로그인 요청은 건드리지 않음
  if (url.pathname === hpPath().slice(0, -1)) { url.pathname += '/'; e.respondWith(Response.redirect(url.href, 302)); return; }
  if (url.pathname.startsWith(hpPath())) { e.respondWith(hpServe(e.request)); return; }
  // 화면 파일: 네트워크 우선(새 버전 바로 반영), 실패하면 캐시
  // cache:'no-cache' — GitHub Pages의 10분 캐시를 건너뛰고 서버에 새 버전이 있는지 매번 확인
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => {
    const copy = r.clone();
    if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
