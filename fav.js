/* UNIVERSE WORKS — 파이프라인 › 관심 기업 (2026-11-16 사용자 "내가 관심한 기업들로 있어야")
   딜소싱 각 화면에서 회사를 펼친 칸 머리의 '관심'(☆)을 누르면 여기 모인다. 사람마다 따로: 로그인한 사람 본인 OneDrive data/favs.json
   (graph.js STORE — 공유 매핑이 없는 파일은 각자 OneDrive /SPACE WORKS/data/ 에 읽고 쓴다).
   형식: [{key, name, src, tab, at}] — key = 파이프라인·팩트시트 ref와 같은 꼴(yesim:<id> · ipo:<code> · pe:heir:<cc> · delist:<code> · cons:<id> · deep:<id> …),
         src = 관심 표시한 화면 이름(app.js DEAL_SCREENS), tab = 그 화면 키, at = 'YYYY-MM-DDTHH:MM'.
   버튼은 fsq.js fqHead가 '팩트시트 요청' 옆에 같이 넣는다(fvHead). 원래 화면 이동은 pipeline.js PP_TABS·ppGoTab.
   진입: renderFav(host). 버튼 클릭은 document에서 받는다(각 탭 클릭 처리는 펼친 칸 안 클릭을 건너뛴다).
   '관심 없음'(2026-11-21 사용자, 사람별): 같은 파일에 skip: true로. 관심과 함께 걸리지 않는다(하나를 켜면 다른 하나는 꺼짐).
   각 화면 목록은 fvSplit(list, refOf)로 관심 없음을 떼어 맨 아래 fvSkipTail(...)로 접힌 묶음을 붙이고,
   표시가 바뀌거나 처음 읽혔을 때 window 'fv-change' 이벤트를 받아 목록을 다시 그린다. 관심 기업 탭에는 관심(skip 아님)만. */

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
      .finally(() => { fvS.at = Date.now(); fvS.loading = null; fvPaint(); fvChanged(); });
  }
  return fvS.loading;
}

const fvHas = (ref) => fvS.items.some((x) => x.key === ref && !x.skip);
const fvSkip = (ref) => fvS.items.some((x) => x.key === ref && x.skip);
const fvFavs = () => fvS.items.filter((x) => !x.skip);
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
  const on = fvHas(ref), off = fvSkip(ref);
  return `<button type="button" class="btn sm rd-fs fv-btn${on ? ' on' : ''}" data-fv-tgl="${esc(ref)}" aria-pressed="${on}">${FV_STAR}관심</button>`
    + `<button type="button" class="btn sm rd-fs fv-skip${off ? ' on' : ''}" data-fv-tgl="${esc(ref)}" data-fv-kind="skip" aria-pressed="${off}">관심 없음</button>`;
}
// 목록 화면용: 관심 없음을 떼어 낸다 → [보일 것, 관심 없음]. 아직 안 읽었으면 읽기 시작(다 읽으면 'fv-change'로 다시 그림)
function fvSplit(list, refOf) {
  if (!fvS.loading && (!fvS.at || Date.now() - fvS.at > FV_TTL) && typeof G === 'object' && G.account) fvLoad();
  if (!fvS.items.some((x) => x.skip)) return [list, []];
  const keep = [], skip = [];
  list.forEach((x) => { const r = x && !x.grp ? refOf(x) : null; (r && fvSkip(r) ? skip : keep).push(x); });
  return [keep, skip];
}
// 맨 아래 접힌 묶음: 머리(누르면 펼치기·접기, 화면별로 기억) + 펼쳤을 때만 행들
function fvSkipTail(skip, scope, rowFn) {
  if (!skip.length) return '';
  const open = viewGet(`fv.sk.${scope}`, false) === true;
  return `<button type="button" class="rd-grp fv-skipgrp${open ? ' open' : ''}" data-fv-skipgrp="${esc(scope)}" aria-expanded="${open}"><b>관심 없음</b><span>${skip.length}곳</span>${ico('right', 'sm')}</button>`
    + (open ? `<div class="fv-skiprows">${skip.map(rowFn).join('')}</div>` : '');
}
const fvChanged = () => window.dispatchEvent(new CustomEvent('fv-change'));

function fvPaint() {
  document.querySelectorAll('.fv-slot[data-fv]').forEach((s) => { s.innerHTML = fvBtn(s.dataset.fv); });
  if (fvS.host?.isConnected) fvDraw();
}

/* ---------- 표시·해제 ---------- */
function fvToggle(ref, kind) {
  if (!fvS.at || fvS.err) return;
  const skip = kind === 'skip', add = skip ? !fvSkip(ref) : !fvHas(ref);
  const old = fvS.items.find((x) => x.key === ref);
  const rec = add ? { key: ref, name: fvS.ctx.get(ref)?.name || fqNameOf(ref), ...fvSrc(ref), at: fvNow(), ...(skip ? { skip: true } : {}) } : null;
  const apply = (items) => { const a = items.filter((x) => x.key !== ref); if (rec) a.push(rec); return a; };
  fvS.items = apply(fvS.items);
  fvPaint(); fvChanged();
  fvS.saving = fvS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      try { fvS.ver = await STORE.writeJSON('favs', fvS.items, fvS.ver); return; } catch (e) {
        if (e.status !== 409) throw e;
        const r = await fvRead(); fvS.items = apply(r.items); fvS.ver = r.version; // 다른 기기에서 먼저 저장했으면 최신본에 다시 얹는다
      }
    }
    throw new Error('다른 기기에서 동시에 수정 중입니다. 잠시 후 다시 해 주세요.');
  }).then(() => { fvPaint(); if (!add && old && !skip) toast(`${old.name || '이 회사'}를 관심 기업에서 뺐습니다`); if (add && skip) toast(`${rec.name || '이 회사'}: 관심 없음으로 목록 맨 아래에 접어 둡니다`); })
    .catch((e) => { toast(e.message || '저장하지 못했습니다.'); return fvLoad(true); });
  return fvS.saving; // 목록 칸 고르기(ctPick)가 저장이 끝날 때까지 기다린다
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
  return fvFavs().filter((x) => (!fvS.src || x.src === fvS.src) && (!q || `${x.name || ''} ${x.src || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (String(a.at || '') < String(b.at || '') ? 1 : -1));
}
function fvSrcs() {
  const m = new Map();
  fvFavs().forEach((x) => { const s = x.src || '기타'; m.set(s, (m.get(s) || 0) + 1); });
  return [...m];
}

function fvDraw() {
  const root = fvS.host?.querySelector('#fv-root'); if (!root) return;
  const sum = root.querySelector('#fv-sum'), seg = root.querySelector('#fv-seg'), body = root.querySelector('#fv-body');
  if (!fvS.at) { body.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
  if (fvS.err) { body.innerHTML = `<div class="empty">${esc(fvS.err)}</div>`; sum.innerHTML = ''; seg.innerHTML = ''; return; }
  const srcs = fvSrcs();
  if (fvS.src && !srcs.some(([s]) => s === fvS.src)) { fvS.src = ''; viewSet('fv.src', ''); }
  const favs = fvFavs();
  sum.innerHTML = `<span><b>${favs.length}</b>곳</span>`;
  const one = (k, l, n) => `<button type="button" data-fv-src="${esc(k)}" class="${fvS.src === k ? 'on' : ''}" aria-pressed="${fvS.src === k}">${esc(l)}<span class="fv-n">${n}</span></button>`;
  seg.innerHTML = srcs.length > 1 ? one('', '전체', favs.length) + srcs.map(([s, n]) => one(s, s, n)).join('') : '';
  seg.hidden = srcs.length < 2;
  const a = fvList();
  if (!favs.length) { body.innerHTML = '<div class="empty">관심 표시한 회사가 없습니다.</div>'; return; }
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
  if (b) { ev.preventDefault(); fvToggle(b.dataset.fvTgl, b.dataset.fvKind); return; }
  const g = ev.target.closest('[data-fv-skipgrp]');
  if (g) { ev.preventDefault(); ev.stopPropagation(); const k = `fv.sk.${g.dataset.fvSkipgrp}`; viewSet(k, viewGet(k, false) !== true); fvChanged(); }
}, true);

/* ---------- 목록 '컨택 상태' 칸에서 바로 고르기 (2026-11-24 사용자 "행을 열지 않고 이 화면에서 바로") ----------
   칸 = 칩 모양 select(pipeline.js 단계 칸과 같은 모양). 위 다섯 줄은 컨택 상태(세 분 공유, 각 화면 펼친 칸 단추와 같은 저장 함수),
   구분선 아래 '관심 없음'은 사람별 표시(fvToggle, favs.json). 두 값은 다른 파일에 따로 저장되고 서로 바꾸지 않는다.
   각 화면 행 그리기에서 ctSel(kind, id, 상태, 관심 없음 ref, tab)을 부른다. 클릭·change는 document 캡처에서 받아 행 펼치기로 가지 않게 막는다.
   저장 중에는 흐리게(ct-busy), 저장이 되돌려지면(권한·충돌·네트워크) 빨간 테두리(ct-err) 4초 + 각 화면이 띄우는 안내. */
const CT_ST = ['미접촉', '연락함', '미팅', '보류', '검토 완료']; // radar.js RD_STATUS·ipo.js IPO_STATUS·pe.js·tgt.js와 같은 값·순서
const CT_KIND = {
  rd: { set: (id, s, tab) => rdSetStatus(tab, id, s), get: (id, tab) => rdSt(rdKey(tab, id)), wait: () => rdS.saving }, // 상장 준비·매각희망·입찰딜
  ipo: { set: (id, s) => ipoSetStatus(id, s), get: (id) => ipoSt(id), wait: () => ipoState.saving }, // 신규상장(ipo_marks.json)
  pe: { set: (id, s) => peSetStatus(id, s), get: (id) => { const x = peFind(id); return x ? peSt(x.key) : ''; }, wait: () => peS.saving }, // 오너기업·중복상장
  tg: { set: (id, s) => tgSetStatus(id, s), get: (id) => tgSt(id), wait: () => tgS.saving }, // 소비재·딥테크
  rn: { set: (id, s) => rnSetStatus(id, s), get: (id) => { const e = rnAll().find((y) => y.id === id); return e ? rnSt(e) : ''; }, wait: () => tgS.saving }, // 투자 라운드
  si: { set: (id, s) => siSetStatus(id, s), get: (id) => { const e = siFind(id); return e ? siSt(e) : ''; }, wait: () => tgS.saving }, // SI 타깃
};
const ctS = new Map(); // `${kind}|${tab}|${id}` → 'busy' | 'err'
const ctKey = (kind, tab, id) => `${kind}|${tab || ''}|${id}`;
const CT_TIP = { busy: '저장 중', err: '저장하지 못했습니다' };

function ctSel(kind, id, st, ref = '', tab = '') {
  const b = ctS.get(ctKey(kind, tab, id)), i = Math.max(0, CT_ST.indexOf(st));
  const fv = ref && fvS.at && !fvS.err; // 관심 없음을 아직 못 읽었으면 그 줄은 빼고, 다 읽으면 fv-change로 다시 그려진다
  const opts = CT_ST.map((s) => `<option value="${s}"${s === st ? ' selected' : ''}>${s}</option>`).join('')
    + (fv ? `<hr><option value="fv-skip">${fvSkip(ref) ? '✓ ' : ''}관심 없음</option>` : '');
  return `<select class="ipo-st s-${i} ct-sel${b ? ` ct-${b}` : ''}" data-ct="${kind}" data-ct-id="${esc(id)}" data-ct-tab="${esc(tab)}" data-ct-ref="${esc(ref)}" aria-label="컨택 상태"${b ? ` title="${CT_TIP[b]}" aria-busy="${b === 'busy'}"` : ''}>${opts}</select>`;
}

function ctPaint(k) {
  const b = ctS.get(k);
  document.querySelectorAll('select[data-ct]').forEach((s) => {
    if (ctKey(s.dataset.ct, s.dataset.ctTab, s.dataset.ctId) !== k) return;
    s.classList.toggle('ct-busy', b === 'busy'); s.classList.toggle('ct-err', b === 'err');
    if (b) { s.title = CT_TIP[b]; s.setAttribute('aria-busy', String(b === 'busy')); } else { s.removeAttribute('title'); s.removeAttribute('aria-busy'); }
  });
}

function ctRun(k, go, ok) {
  ctS.set(k, 'busy');
  let p;
  try { p = go(); } catch (e) { p = Promise.reject(e); }
  ctPaint(k); // 행을 다시 그렸으면 새 칸에도
  Promise.resolve(p).catch(() => {}).then(() => {
    if (ok()) ctS.delete(k);
    else { ctS.set(k, 'err'); setTimeout(() => { if (ctS.get(k) === 'err') { ctS.delete(k); ctPaint(k); } }, 4000); }
    ctPaint(k);
  });
}

function ctPick(sel) {
  const { ct: kind, ctId: id, ctTab: tab, ctRef: ref } = sel.dataset, d = CT_KIND[kind], v = sel.value;
  if (!d || !id) return;
  const k = ctKey(kind, tab, id), cur = d.get(id, tab);
  if (v === 'fv-skip') { // 관심 없음만 켜고 끈다. 컨택 상태 칸은 원래 값으로 돌려 둔다
    sel.value = cur;
    if (!ref || !fvS.at || fvS.err) return;
    const want = !fvSkip(ref);
    ctRun(k, () => fvToggle(ref, 'skip'), () => fvSkip(ref) === want);
    return;
  }
  if (!CT_ST.includes(v) || v === cur) return;
  ctRun(k, () => { d.set(id, v, tab); return d.wait(); }, () => d.get(id, tab) === v);
}

document.addEventListener('click', (ev) => { if (ev.target.closest?.('select[data-ct]')) ev.stopPropagation(); }, true); // 행 펼치기로 가지 않게
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (!t.matches?.('select[data-ct]')) return;
  ev.stopPropagation();
  ctPick(t);
}, true);
