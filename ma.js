/* UNIVERSE WORKS — 시장동향 › M&A 거래 (#market/ma): 국내 경영권 M&A 거래사례(최근 5년, PE·SI 인수)와 업종별 멀티플 중앙값
   딜레이더 ma_deals.py가 주 1회 회사 OneDrive SPACE WORKS/data/ma.json·ma.xlsx 를 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT_ma.md).
   진입: renderMa(host) — market.js 탭 줄 아래 #mk-host 안에만 그린다.
   app.js 전역($, esc, yymd, ico, toast, pad, viewGet, viewSet, TAB_INFO, infoBtn), graph.js STORE·G, sector.js SEC_NAMES(업종 이름),
   ipo.css(요약 줄·필터·펼친 행·상자)·radar.css(.rd-fing·.rd-finl·.rd-link)·pe.css(.pe-ds) 클래스를 쓴다. */

const MA_FILE = 'data/ma.json', MA_XLSX = 'data/ma.xlsx';
const MA_TTL = 5 * 60000;
const MA_STALE = 8; // 주 1회 갱신이므로 기준일이 8일 넘게 지나면 빨간 글씨
const MA_PAGE = 100; // 처음엔 100건만 그리고 나머지는 '나머지 n건 보기'로
const MA_KINDS = ['PE', 'SI', 'PE+SI'];
const MA_DONE = ['계약', '완료'];
const MA_STAGE_OPTS = [['done', '계약·완료'], ['all', '전체']];
const maSecName = (id) => (typeof SEC_NAMES === 'object' && SEC_NAMES[id]) || id;

// 새로 고친 뒤에도 보던 필터·검색어·펼친 행을 이어 보게 창마다 기억한다(app.js viewGet·viewSet, 키 ma)
const maS = (() => {
  const v = viewGet('ma', null) || {};
  const s = (k) => (typeof v[k] === 'string' ? v[k] : '');
  return {
    data: null, err: '', at: 0, loading: null, host: null, more: false,
    f: { sector: s('sector'), kind: MA_KINDS.includes(v.kind) ? v.kind : '', stage: v.stage === 'all' ? 'all' : 'done', year: /^\d{4}$/.test(v.year) ? v.year : '', q: s('q') },
    open: new Set(Array.isArray(v.open) ? v.open : []),
  };
})();
const maViewSave = () => viewSet('ma', { ...maS.f, open: [...maS.open] });

/* ---------- 데이터 ---------- */
const maStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const maNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const maObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const maArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const maDay = (v) => { const s = maStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const maHttp = (v) => { const s = maStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const maYearMap = (v) => Object.fromEntries(Object.entries(maObj(v)).map(([k, x]) => [k, maNum(x)]));

function maNorm(raw) {
  const seen = new Set();
  const deals = maArr(raw.deals).map((x, i) => {
    const id = maStr(x.id) || `ma-${i}`, target = maStr(x.target);
    if (!target || seen.has(id)) return null;
    seen.add(id);
    const sources = maArr(x.sources).filter((n) => maStr(n.title) || maHttp(n.url))
      .map((n) => ({ title: maStr(n.title), url: maHttp(n.url), date: maDay(n.date), src: maStr(n.src) })).sort((a, b) => b.date.localeCompare(a.date));
    const o = {
      id, date: maDay(x.date), dateText: maStr(x.date_text), stage: maStr(x.stage), sector: maStr(x.sector) || 'etc', sub: maStr(x.sub),
      target, listed: x.listed === true, buyer: maStr(x.buyer), kind: maStr(x.buyer_kind), seller: maStr(x.seller), sellerKind: maStr(x.seller_kind), type: maStr(x.type),
      stake: maNum(x.stake), stakeText: maStr(x.stake_text), amount: maNum(x.amount), equity100: maNum(x.equity100), netDebt: maNum(x.net_debt), netDebtYear: maStr(x.net_debt_year),
      ev: maNum(x.ev), evBasis: maStr(x.ev_basis), ebitda: maNum(x.ebitda), ebitdaBasis: maStr(x.ebitda_basis), evEbitda: maNum(x.ev_ebitda),
      op: maNum(x.op), opBasis: maStr(x.op_basis), evOp: maNum(x.ev_op), rev: maYearMap(x.rev), opi: maYearMap(x.opi),
      memo: maStr(x.memo), note: maStr(x.note), why: maStr(x.why), est: new Set((Array.isArray(x.est) ? x.est : []).map(maStr).filter(Boolean)), sources,
    };
    o.q = [o.target, o.buyer, o.seller, o.sub].join(' ').toLowerCase();
    return o;
  }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  // 매출·영업이익 열: 파일의 years(최근 5개 회계연도), 없으면 딜에 나온 연도
  let years = (Array.isArray(raw.years) ? raw.years : []).map(maStr).filter((y) => /^\d{4}$/.test(y));
  if (!years.length) years = [...new Set(deals.flatMap((d) => [...Object.keys(d.rev), ...Object.keys(d.opi)]).filter((y) => /^\d{4}$/.test(y)))].sort();
  const medians = Object.fromEntries(Object.entries(maObj(raw.medians)).map(([k, m]) => [k, { n: maNum(maObj(m).n), evEbitda: maNum(maObj(m).ev_ebitda), evOp: maNum(maObj(m).ev_op) }]));
  return { generated: maStr(raw.generated), checked: maDay(raw.checked) || maDay(raw.generated), sources: maObj(raw.sources), years: years.slice(-5), deals, medians };
}

// 파일이 아직 없으면(첫 실행 전) 오류가 아니라 '자료 없음'
function maLoad(force) {
  if (!force && maS.at && Date.now() - maS.at < MA_TTL) return Promise.resolve();
  maS.loading ||= (async () => {
    let d = null, err = '';
    try {
      const r = await STORE.readText(MA_FILE);
      if (r.text) {
        let raw = null;
        try { raw = JSON.parse(r.text); } catch { err = 'M&A 거래 자료 형식이 올바르지 않습니다'; }
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) d = maNorm(raw);
        else if (!err) err = 'M&A 거래 자료 형식이 올바르지 않습니다';
      }
    } catch (e) { if (e.status !== 404) err = e.message || '자료를 읽지 못했습니다'; }
    maS.data = d; maS.err = err; maS.at = Date.now();
    TAB_INFO['market/ma'] = maInfo();
  })().finally(() => { maS.loading = null; });
  return maS.loading;
}

/* ---------- 거르기·중앙값 ---------- */
// 단계 말고 나머지 조건(업종·매수자·기간·검색어)
function maPass(x, f) {
  const q = f.q.trim().toLowerCase();
  return (!f.sector || x.sector === f.sector) && (!f.kind || x.kind === f.kind) && (!f.year || x.date.startsWith(f.year)) && (!q || x.q.includes(q));
}
const maList = () => (maS.data ? maS.data.deals.filter((x) => (maS.f.stage === 'all' || MA_DONE.includes(x.stage)) && maPass(x, maS.f)) : []);

const maMedian = (a) => {
  const v = a.filter((n) => n != null).sort((x, y) => x - y), m = v.length >> 1;
  return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : null;
};
// 업종만 고르면 파일의 medians, 매수자·기간·검색어까지 걸면 같은 기준(계약·완료이고 멀티플 있는 딜)으로 여기서 다시 계산
function maMed() {
  const d = maS.data, f = maS.f; if (!d) return null;
  if (!f.kind && !f.year && !f.q.trim()) { const m = d.medians[f.sector || 'all']; if (m) return m; }
  const ds = d.deals.filter((x) => MA_DONE.includes(x.stage) && maPass(x, f) && (x.evEbitda != null || x.evOp != null));
  return { n: ds.length, evEbitda: maMedian(ds.map((x) => x.evEbitda)), evOp: maMedian(ds.map((x) => x.evOp)) };
}

/* ---------- 표시 형식 ---------- */
const MA_NA = '<span class="muted">–</span>';
const MA_NM = '<span class="muted">N/M</span>';
const maFmt = (v) => v.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
const maX = (v) => `${v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
const maPct = (v) => `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
// 역산·추정한 칸(est)은 회색·기울임. EV는 100% 지분가치를 역산했으면 같이 추정
const maEst = (x, ...keys) => keys.some((k) => x.est.has(k));
const maVal = (html, est) => (est ? `<span class="ma-est" title="추정">${html}</span>` : html);
const maChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
// 매수자가 여럿이면 표에는 첫 곳과 나머지 수만(전체는 펼친 행과 마우스를 올리면)
const maBuyer = (b) => { const a = b.split(/\s*,\s*/).filter(Boolean); return `${esc(a[0] || b)}${a.length > 1 ? ` <span class="muted">외 ${a.length - 1}</span>` : ''}`; };
const maKind = (k) => (k ? `<span class="pe-ds ma-kind">${esc(k)}</span>` : '');

const MA_COLS = [ // 키, 머리글, 값
  ['stake', '인수 지분', (x) => (x.stake != null ? maVal(maPct(x.stake), maEst(x, 'stake')) : x.stakeText ? maVal(esc(x.stakeText), maEst(x, 'stake')) : '')],
  ['amount', '거래금액', (x) => (x.amount != null ? maVal(maFmt(x.amount), maEst(x, 'amount')) : '')],
  ['ev', '추정 EV', (x) => (x.ev != null ? maVal(maFmt(x.ev), maEst(x, 'ev', 'equity100')) : '')],
  ['ebitda', 'EBITDA', (x) => (x.ebitda != null ? maVal(maFmt(x.ebitda), maEst(x, 'ebitda')) : '')],
  ['evebitda', 'EV/<wbr>EBITDA', (x) => (x.evEbitda != null ? maVal(maX(x.evEbitda), maEst(x, 'ev_ebitda')) : MA_NM)],
  ['evop', 'EV/<wbr>영업이익', (x) => (x.evOp != null ? maVal(maX(x.evOp), maEst(x, 'ev_op')) : MA_NM)],
];
const MA_HEAD = `<div class="ma-head ma-cols"><div class="ma-c-date">거래일</div><div>대상회사</div><div class="ma-c-sub">세부 업종</div><div>매수자</div><div class="ma-c-sell">매도자</div>${MA_COLS.map(([, t]) => `<div>${t}</div>`).join('')}<div></div></div>`;

/* ---------- 목록 ---------- */
function maRow(x) {
  const open = maS.open.has(x.id);
  const nums = MA_COLS.map(([k, t, fn]) => { const v = fn(x); return `<div class="ma-c ma-n ma-n-${k}"><span class="ma-k">${t}</span><span class="ma-v">${v || MA_NA}</span></div>`; }).join('');
  return `<div class="ipo-row ma-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ma-line ma-cols">
      <div class="ma-c-date"><span>${x.date ? yymd(x.date) : '–'}</span>${x.stage ? `<span class="ipo-sub">${esc(x.stage)}</span>` : ''}</div>
      <div class="ma-c-tgt"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.target)}</button>${x.listed ? '<span class="ma-tag">상장</span>' : ''}${x.sub ? `<div class="ipo-sub ma-alt">${esc(x.sub)}</div>` : ''}<div class="ipo-sub ma-alt-date">${x.date ? yymd(x.date) : '–'}${x.stage ? ` ${esc(x.stage)}` : ''}</div></div>
      <div class="ma-c-sub">${x.sub ? esc(x.sub) : MA_NA}</div>
      <div class="ma-c-buy"><span class="rd-clamp ma-buyer"${x.buyer ? ` title="${esc(x.buyer)}"` : ''}>${x.buyer ? maBuyer(x.buyer) : MA_NA}</span>${x.kind || x.seller ? `<div class="ma-buy2">${maKind(x.kind)}${x.seller ? `<span class="ipo-sub ma-alt">매도 ${esc(x.seller)}</span>` : ''}</div>` : ''}</div>
      <div class="ma-c-sell">${x.seller ? esc(x.seller) : MA_NA}</div>
      ${nums}
      <div class="ma-c-chev">${maChev()}</div>
    </div>${open ? maDetail(x) : ''}</div>`;
}

const maBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const maKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const MA_UNKNOWN = '<p class="ipo-p muted">확인 불가</p>';

function maFin(x) {
  const ys = maS.data?.years || [];
  const has = ys.some((y) => x.rev[y] != null || x.opi[y] != null);
  if (!ys.length || !has) return MA_UNKNOWN;
  const td = (m, y) => (m[y] != null ? `<td${m[y] < 0 ? ' class="ma-neg"' : ''}>${maFmt(m[y])}</td>` : `<td>${MA_NA}</td>`);
  return `<table class="ipo-fin ma-fin"><thead><tr><th></th>${ys.map((y) => `<th>${esc(y)}</th>`).join('')}</tr></thead>
    <tbody><tr><td>매출</td>${ys.map((y) => td(x.rev, y)).join('')}</tr><tr><td>영업이익</td>${ys.map((y) => td(x.opi, y)).join('')}</tr></tbody></table>`;
}

function maDetail(x) {
  const eok = (v, ...k) => (v != null ? maVal(`${maFmt(v)}억`, maEst(x, ...k)) : '');
  const deal = [
    maKv('일정', esc(x.dateText)), maKv('형태', esc(x.type)),
    maKv('매수자', x.buyer ? `${esc(x.buyer)}${x.kind ? ` <span class="muted">${esc(x.kind)}</span>` : ''}` : ''),
    maKv('매도자', x.seller ? `${esc(x.seller)}${x.sellerKind && x.sellerKind !== x.seller ? ` <span class="muted">${esc(x.sellerKind)}</span>` : ''}` : ''),
    maKv('인수 지분', x.stake != null ? `${maVal(maPct(x.stake), maEst(x, 'stake'))}${x.stakeText && x.stakeText !== maPct(x.stake) ? ` <span class="muted">${esc(x.stakeText)}</span>` : ''}` : esc(x.stakeText)),
    maKv('인수 이유', esc(x.why)),
  ].join('');
  const val = [
    maKv('100% 가치', eok(x.equity100, 'equity100')),
    maKv('순차입금', x.netDebt != null ? `${eok(x.netDebt, 'net_debt')}${x.netDebtYear ? ` <span class="muted">${esc(x.netDebtYear)}말</span>` : ''}` : ''),
    maKv('EV 산식', esc(x.evBasis)),
    maKv('EBITDA 기준', x.ebitdaBasis ? `${x.ebitda != null ? `${eok(x.ebitda, 'ebitda')} ` : ''}<span class="muted">${esc(x.ebitdaBasis)}</span>` : eok(x.ebitda, 'ebitda')),
    maKv('영업이익 기준', x.op != null ? `${eok(x.op, 'op')}${x.opBasis ? ` <span class="muted">${esc(x.opBasis)}</span>` : ''}` : ''),
    maKv('메모', esc(x.memo)),
  ].join('');
  const src = x.sources.length ? `<ul class="ma-src">${x.sources.map((n) => `<li><span class="muted">${[n.date ? yymd(n.date) : '', esc(n.src)].filter(Boolean).join(' ')}</span>${n.url
    ? `<a class="rd-link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title || n.src || '원문')}</a>` : `<span>${esc(n.title)}</span>`}</li>`).join('')}</ul>` : MA_UNKNOWN;
  return `<div class="ipo-detail"><div class="ipo-two-col">
    <div class="ipo-stack">${maBox('실적', maFin(x), '억원')}${maBox('밸류에이션', val || MA_UNKNOWN)}</div>
    <div class="ipo-stack">${maBox('거래', deal || MA_UNKNOWN)}${x.note ? maBox('비고', `<p class="ipo-p">${esc(x.note)}</p>`) : ''}${maBox('출처', src, x.sources.length > 1 ? `${x.sources.length}건` : '')}</div>
  </div></div>`;
}

function maBody() {
  if (maS.err) return `<div class="empty">${esc(maS.err)}</div>`;
  const d = maS.data;
  if (!d || !d.deals.length) return '<div class="empty">아직 만들어진 M&A 거래 자료가 없습니다.</div>';
  const list = maList();
  if (!list.length) return '<div class="empty">조건에 맞는 거래가 없습니다.</div>';
  const shown = maS.more ? list : list.slice(0, MA_PAGE), rest = list.length - shown.length;
  return `${MA_HEAD}${shown.map(maRow).join('')}${rest > 0 ? `<div class="ma-morewrap"><button type="button" class="btn sm" data-ma-more>나머지 ${rest}건 보기</button></div>` : ''}`;
}

/* ---------- 요약 줄·중앙값 줄·필터 ---------- */
function maSummary() {
  const d = maS.data; if (!d) return '';
  const old = d.checked && (Date.now() - new Date(`${d.checked}T00:00:00`)) / 864e5 > MA_STALE;
  // ok로 시작하지 않는 출처만 이름으로(값은 마우스를 올리면) — sector.js와 같다
  const bad = Object.entries(d.sources).filter(([, v]) => !/^ok/i.test(maStr(v))).map(([k, v]) => `<span class="ipo-stale" title="${esc(maStr(v))}">${esc(k)} 확인 필요</span>`);
  return `${d.checked ? `<span class="${old ? 'ipo-stale' : ''}">기준일 ${yymd(d.checked)}</span>` : ''}<span>거래 <b>${maList().length.toLocaleString('ko-KR')}</b>건</span>${bad.join('')}`;
}

function maMedHtml() {
  const m = maS.data?.deals.length ? maMed() : null; if (!m) return '';
  const v = (x) => (x != null ? `<b>${maX(x)}</b>` : '<b class="muted">N/M</b>');
  return `<span class="ma-med-t">${esc(maS.f.sector ? maSecName(maS.f.sector) : '전체 업종')} 중앙값</span>
    <span>EV/EBITDA ${v(m.evEbitda)}</span><span>EV/영업이익 ${v(m.evOp)}</span><span class="muted">${m.n != null ? `${m.n}건 기준` : ''}</span><span class="ma-unit muted">단위 억원</span>`;
}

const maSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([k, l]) => `<button type="button" data-${attr}="${esc(k)}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('')}</div>`;
function maFilterHtml() {
  const d = maS.data, f = maS.f;
  const secs = d ? [...new Set(d.deals.map((x) => x.sector))] : [];
  const order = typeof SEC_NAMES === 'object' ? Object.keys(SEC_NAMES) : [];
  secs.sort((a, b) => ((order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)) || a.localeCompare(b));
  if (f.sector && !secs.includes(f.sector)) secs.unshift(f.sector);
  const years = d ? [...new Set(d.deals.map((x) => x.date.slice(0, 4)).filter(Boolean))].sort().reverse() : [];
  if (f.year && !years.includes(f.year)) years.unshift(f.year);
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  return `<div class="ipo-filter">
      <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="ma-q" type="search" placeholder="회사·매수자 검색" value="${esc(f.q)}" autocomplete="off" aria-label="검색"></div>
      <select class="select ma-sel" id="ma-sector" aria-label="업종">${opt('', '전체 업종', f.sector)}${secs.map((k) => opt(k, maSecName(k), f.sector)).join('')}</select>
      <select class="select ma-sel" id="ma-year" aria-label="기간">${opt('', '전체 기간', f.year)}${years.map((y) => opt(y, `${y}년`, f.year)).join('')}</select>
    </div>
    <div class="ipo-filter ma-finf"><div class="rd-fing"><span class="rd-finl">매수자</span>${maSeg('ma-kind', [['', '전체'], ...MA_KINDS.map((k) => [k, k])], f.kind)}</div>
      <div class="rd-fing"><span class="rd-finl">단계</span>${maSeg('ma-stage', MA_STAGE_OPTS, f.stage)}</div></div>`;
}

/* ---------- 그리기 ---------- */
function maDraw() {
  const h = maS.host; if (!h || !h.isConnected) return;
  const set = (sel, html) => { const el = h.querySelector(sel); if (el) el.innerHTML = html; };
  set('#ma-sum', maSummary());
  set('#ma-med', maMedHtml());
  set('#ma-body', maBody());
  maViewSave();
}

async function maDownload(btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const m = await STORE.meta(MA_XLSX);
    if (!m) { toast('아직 올라간 엑셀이 없습니다.'); return; }
    const sh = STORE.sharedItem(MA_XLSX);
    const blob = await G.get(sh ? `${sh}/content` : `${STORE.path(MA_XLSX)}:/content`, { type: 'blob' });
    const d = new Date(m.lastModifiedDateTime);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `[유니버스인베스트먼트] 국내 M&A 거래사례_${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; }
}

function maBind(root) {
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  const refilter = () => { maS.more = false; maDraw(); };
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const kb = t.closest('[data-ma-kind]'); if (kb) { maS.f.kind = kb.dataset.maKind; segOn('[data-ma-kind]', kb); refilter(); return; }
    const sb = t.closest('[data-ma-stage]'); if (sb) { maS.f.stage = sb.dataset.maStage; segOn('[data-ma-stage]', sb); refilter(); return; }
    if (t.closest('#ma-ref')) {
      maLoad(true).then(() => { const f = root.querySelector('#ma-filter'); if (f) f.innerHTML = maFilterHtml(); maDraw(); }).catch((e) => toast(e.message));
      return;
    }
    const xb = t.closest('#ma-xlsx'); if (xb) { maDownload(xb); return; }
    if (t.closest('[data-ma-more]')) { maS.more = true; maDraw(); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ma-row[data-id]'); if (!row) return;
    const id = row.dataset.id, x = maS.data?.deals.find((d) => d.id === id); if (!x) return;
    if (maS.open.has(id)) maS.open.delete(id); else maS.open.add(id);
    maViewSave();
    row.outerHTML = maRow(x);
  });
  root.addEventListener('change', (ev) => {
    if (ev.target.id === 'ma-sector') { maS.f.sector = ev.target.value; refilter(); }
    if (ev.target.id === 'ma-year') { maS.f.year = ev.target.value; refilter(); }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'ma-q') { maS.f.q = ev.target.value; refilter(); } });
}

async function renderMa(host) {
  maS.host = host;
  host.innerHTML = `<div class="ipo-page ma-page" id="ma-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="ma-sum">${maSummary()}</div>
      ${infoBtn('market/ma')}
      <button class="btn ghost" type="button" id="ma-xlsx">${ico('file', 'sm')}엑셀 다운로드</button>
      <button class="btn ghost" type="button" id="ma-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div id="ma-filter">${maFilterHtml()}</div>
      <div class="ma-med" id="ma-med">${maMedHtml()}</div>
      <div class="ma-body" id="ma-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  const root = host.querySelector('#ma-root');
  maBind(root);
  try { await maLoad(); }
  catch (e) {
    const b = maS.host === host && host.querySelector('#ma-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (maS.host !== host || !host.isConnected) return;
  root.querySelector('#ma-filter').innerHTML = maFilterHtml(); // 업종·연도 목록은 자료를 읽은 뒤에
  maDraw();
}

/* ---------- 화면 설명(ⓘ) — 기준은 딜레이더 CONTRACT_ma.md ---------- */
function maInfo() {
  const d = maS.data;
  return {
    title: 'M&A 거래',
    asof: `${d?.checked ? `기준일 ${d.checked}` : '기준일 –'}, 출처 딜 기사, DART 공시, 감사보고서`,
    rows: [
      ['무엇인가', [
        '최근 5년 동안 국내 회사의 경영권이 바뀐 거래입니다. PE와 일반 기업(SI)의 인수, 볼트온, 사업양수, 회생 M&A, PE 회수 매각을 모았습니다.',
        '소수지분 투자, VC 투자, 같은 그룹 안의 지분 이동, 해외 회사만 사고판 거래는 넣지 않았습니다.',
      ]],
      ['어떻게 보나', [
        '기본은 계약이나 완료까지 간 거래만 보이고, 단계에서 전체를 고르면 추진, 우선협상, 무산 거래도 나옵니다.',
        '추정 EV는 100% 지분가치에 순차입금을 더한 값입니다. 지분 일부만 산 거래는 거래금액을 지분율로 나눠 100% 가치로 바꿉니다.',
        '멀티플의 EBITDA와 영업이익은 거래일이 10~12월이면 그해, 1~9월이면 전년 실적을 씁니다. EBITDA가 0 이하이거나 EV를 모르면 N/M입니다.',
        '회색 기울임 글씨는 보도 숫자를 역산했거나 추정한 값입니다.',
        '위 중앙값은 계약, 완료 거래 가운데 멀티플이 있는 것만 셉니다. 매수자, 기간, 검색어를 걸면 그 조건으로 다시 계산합니다.',
        '행을 누르면 5개 연도 매출과 영업이익, EV 산식, 메모, 출처 기사와 공시가 나옵니다.',
        '자료는 일주일에 한 번 새로 만듭니다. 기준일이 8일 넘게 지나면 빨간 글씨로 표시합니다.',
      ]],
    ],
  };
}
TAB_INFO['market/ma'] = maInfo();
