/* UNIVERSE WORKS — 파이프라인 › 관심 기업 (2026-11-16 사용자 "내가 관심한 기업들로 있어야")
   딜소싱 각 화면에서 회사를 펼친 칸 머리의 '관심'(☆)을 누르면 여기 모인다. 사람마다 따로: 로그인한 사람 본인 OneDrive data/favs.json
   (graph.js STORE — 공유 매핑이 없는 파일은 각자 OneDrive /SPACE WORKS/data/ 에 읽고 쓴다).
   형식: [{key, name, src, tab, at}] — key = 파이프라인·팩트시트 ref와 같은 꼴(yesim:<id> · ipo:<code> · pe:heir:<cc> · delist:<code> · cons:<id> · deep:<id> …),
         src = 관심 표시한 화면 이름(app.js DEAL_SCREENS), tab = 그 화면 키, at = 'YYYY-MM-DDTHH:MM'.
   버튼은 fsq.js fqHead가 '팩트시트 요청' 옆에 같이 넣는다(fvHead). 원래 화면 이동은 pipeline.js PP_TABS·ppGoTab.
   진입: renderFav(host). 버튼 클릭은 document에서 받는다(각 탭 클릭 처리는 펼친 칸 안 클릭을 건너뛴다). */

const FV_TTL = 5 * 60000;
const FV_STAR = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l2.3 4.6 5.1.8-3.7 3.6.9 5.1L12 16.2l-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z"/></svg>';
const fvS = { items: [], ver: null, at: 0, loading: null, err: '', saving: Promise.resolve(), ctx: new Map(), host: null, q: viewGet('fv.q', ''), src: viewGet('fv.src', '') };

/* ---------- 데이터 ---------- */
async function fvRead() {
  let r;
  try { r = await STORE.readJSON('favs'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; r = null; }
  if (!r || !Array.isArray(r.items)) throw new Error('관심 기업 목록 형식이 올바르지 않습니다'); // 깨진 파일 위에 저장하지 않는다
  return { items: r.items.filter((x) => x && typeof x === 'object' && typeof x.key === 'string' && x.key), version: r.version };
}

function fvLoad(force) {
  if (!force && fvS.at && Date.now() - fvS.at < FV_TTL) return Promise.resolve();
  if (!fvS.loading) {
    fvS.loading = fvRead().then((r) => { fvS.items = r.items; fvS.ver = r.version; fvS.err = ''; })
      .catch((e) => { fvS.err = e.message || '관심 기업을 불러오지 못했습니다'; })
      .finally(() => { fvS.at = Date.now(); fvS.loading = null; fvPaint(); });
  }
  return fvS.loading;
}

const fvHas = (ref) => fvS.items.some((x) => x.key === ref);
const fvNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// 관심 표시한 화면: 지금 보고 있는 딜소싱 화면 이름, 모르면 ref 앞머리로
function fvSrc(ref) {
  const k = typeof ui === 'object' ? ui.dealTab : '';
  if (k && typeof DEAL_SCREENS === 'object' && DEAL_SCREENS[k] && route().startsWith('deals')) return { src: DEAL_SCREENS[k][0], tab: k };
  const p = String(ref).split(':'), t = p[0] === 'pe' ? p[1] : p[0];
  return { src: (typeof DEAL_SCREENS === 'object' && DEAL_SCREENS[t]?.[0]) || (typeof PP_TABS === 'object' && PP_TABS[p[0]]?.[1]) || '', tab: t };
}

/* ---------- 펼친 칸 머리 버튼(fsq.js fqHead가 부른다) ---------- */
function fvHead(ref, x) {
  if (!ref) return '';
  if (x?.name) fvS.ctx.set(ref, { name: String(x.name) });
  if (!fvS.loading && (!fvS.at || Date.now() - fvS.at > FV_TTL)) fvLoad();
  return `<span class="fv-slot" data-fv="${esc(ref)}">${fvBtn(ref)}</span>`;
}
function fvBtn(ref) {
  if (!fvS.at || fvS.err) return '';
  const on = fvHas(ref);
  return `<button type="button" class="btn sm rd-fs fv-btn${on ? ' on' : ''}" data-fv-tgl="${esc(ref)}" aria-pressed="${on}">${FV_STAR}관심</button>`;
}

function fvPaint() {
  document.querySelectorAll('.fv-slot[data-fv]').forEach((s) => { s.innerHTML = fvBtn(s.dataset.fv); });
  if (fvS.host?.isConnected) fvDraw();
}

/* ---------- 표시·해제 ---------- */
function fvToggle(ref) {
  if (!fvS.at || fvS.err) return;
  const add = !fvHas(ref);
  const old = fvS.items.find((x) => x.key === ref);
  const rec = add ? { key: ref, name: fvS.ctx.get(ref)?.name || fqNameOf(ref), ...fvSrc(ref), at: fvNow() } : null;
  const apply = (items) => { const a = items.filter((x) => x.key !== ref); if (rec) a.push(rec); return a; };
  fvS.items = apply(fvS.items);
  fvPaint();
  fvS.saving = fvS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      try { fvS.ver = await STORE.writeJSON('favs', fvS.items, fvS.ver); return; } catch (e) {
        if (e.status !== 409) throw e;
        const r = await fvRead(); fvS.items = apply(r.items); fvS.ver = r.version; // 다른 기기에서 먼저 저장했으면 최신본에 다시 얹는다
      }
    }
    throw new Error('다른 기기에서 동시에 수정 중입니다. 잠시 후 다시 해 주세요.');
  }).then(() => { fvPaint(); if (!add && old) toast(`${old.name || '이 회사'}를 관심 기업에서 뺐습니다`); })
    .catch((e) => { toast(e.message || '저장하지 못했습니다.'); return fvLoad(true); });
}
// 이름을 못 받았을 때: 팩트시트 요청 기록의 이름
const fqNameOf = (ref) => (typeof fqS === 'object' && (fqS.ctx.get(ref)?.name || fqS.req.find((r) => r.key === ref)?.name)) || ref;

/* ---------- 관심 기업 탭 ---------- */
// 원래 화면 주소: 파이프라인과 같은 표(PP_TABS), 없으면 관심 표시한 화면
function fvHref(x) {
  const t = typeof ppTabOf === 'function' ? ppTabOf(x.key) : null;
  return t ? t[0] : x.tab && typeof DEAL_SCREENS === 'object' && DEAL_SCREENS[x.tab] ? `#deals/${x.tab}` : '';
}
const fvDay = (s) => (s && s.length >= 10 ? yymd(s) : '');

function fvList() {
  const q = fvS.q.trim().toLowerCase();
  return fvS.items.filter((x) => (!fvS.src || x.src === fvS.src) && (!q || `${x.name || ''} ${x.src || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (String(a.at || '') < String(b.at || '') ? 1 : -1));
}
function fvSrcs() {
  const m = new Map();
  fvS.items.forEach((x) => { const s = x.src || '기타'; m.set(s, (m.get(s) || 0) + 1); });
  return [...m];
}

function fvDraw() {
  const root = fvS.host?.querySelector('#fv-root'); if (!root) return;
  const sum = root.querySelector('#fv-sum'), seg = root.querySelector('#fv-seg'), body = root.querySelector('#fv-body');
  if (!fvS.at) { body.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
  if (fvS.err) { body.innerHTML = `<div class="empty">${esc(fvS.err)}</div>`; sum.innerHTML = ''; seg.innerHTML = ''; return; }
  const srcs = fvSrcs();
  if (fvS.src && !srcs.some(([s]) => s === fvS.src)) { fvS.src = ''; viewSet('fv.src', ''); }
  sum.innerHTML = `<span><b>${fvS.items.length}</b>곳</span>`;
  const one = (k, l, n) => `<button type="button" data-fv-src="${esc(k)}" class="${fvS.src === k ? 'on' : ''}" aria-pressed="${fvS.src === k}">${esc(l)}<span class="fv-n">${n}</span></button>`;
  seg.innerHTML = srcs.length > 1 ? one('', '전체', fvS.items.length) + srcs.map(([s, n]) => one(s, s, n)).join('') : '';
  seg.hidden = srcs.length < 2;
  const a = fvList();
  if (!fvS.items.length) { body.innerHTML = '<div class="empty">관심 표시한 회사가 없습니다.</div>'; return; }
  if (!a.length) { body.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>'; return; }
  body.innerHTML = `<div class="ipo-head fv-cols"><div>회사</div><div class="fv-h-src">화면</div><div>관심 표시</div><div></div></div>${a.map(fvRow).join('')}`;
}

function fvRow(x) {
  const href = fvHref(x);
  return `<div class="ipo-row fv-row" data-fv-row="${esc(x.key)}">
    <div class="ipo-line fv-cols">
      <div class="ipo-c-name fv-c-name">${href ? `<a class="ipo-ttl fv-ttl" href="${href}" data-fv-go="${esc(x.key)}">${esc(x.name || x.key)}</a>` : `<span class="ipo-ttl fv-ttl">${esc(x.name || x.key)}</span>`}</div>
      <div class="fv-c-src">${x.src ? `<span class="chip">${esc(x.src)}</span>` : ''}</div>
      <div class="fv-c-at">${esc(fvDay(x.at))}</div>
      <div class="fv-c-st"><button type="button" class="fv-star on" data-fv-tgl="${esc(x.key)}" aria-pressed="true" aria-label="관심 해제" title="관심 해제">${FV_STAR}</button></div>
    </div></div>`;
}

function fvGo(key) {
  const x = fvS.items.find((y) => y.key === key); if (!x) return;
  const href = fvHref(x); if (!href) return;
  if (typeof ppGoTab === 'function') ppGoTab(x.key); // 그 화면에서 이 회사를 펼쳐 둔다
  location.hash = href;
}

async function renderFav(host) {
  fvS.host = host;
  host.innerHTML = `<div class="ipo-page fv-page" id="fv-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="fv-sum"></div>
      <button class="btn ghost" type="button" id="fv-ref">${ico('refresh', 'sm')}<span>새로고침</span></button></div>
    <section class="card ipo-card">
      <div class="ipo-filter">
        <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="fv-q" type="search" placeholder="회사 검색" value="${esc(fvS.q)}" autocomplete="off" aria-label="검색"></div>
        <div class="seg fv-seg" id="fv-seg" hidden></div>
      </div>
      <div class="ipo-body" id="fv-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  const root = host.querySelector('#fv-root');
  root.addEventListener('input', (ev) => { if (ev.target.id === 'fv-q') { fvS.q = ev.target.value; viewSet('fv.q', fvS.q); fvDraw(); } });
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('[data-fv-tgl]')) return; // document에서 받는다
    const sb = t.closest('[data-fv-src]');
    if (sb) { fvS.src = sb.dataset.fvSrc; viewSet('fv.src', fvS.src); fvDraw(); return; }
    if (t.closest('#fv-ref')) { fvLoad(true); return; }
    const row = t.closest('[data-fv-row]');
    if (row) { ev.preventDefault(); fvGo(row.dataset.fvRow); }
  });
  fvDraw();
  await fvLoad(true);
}

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-fv-tgl]');
  if (b) { ev.preventDefault(); fvToggle(b.dataset.fvTgl); }
});
