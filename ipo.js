/* SPACE WORKS — 딜소싱 › 신규상장: 신규 상장사 컨택 리스트 (작성책임자·재무·FI·락업·자금수요)
   매일 07:00 PC 작업(05. 딜소싱\_자동화\신규상장\daily.py)이 회사 OneDrive SPACE WORKS/data/ipo.json 을 올린다(이 화면은 읽기만).
   컨택 상태·메모는 data/ipo_marks.json — 다음 날 엑셀(신규상장 컨택리스트.xlsx)에도 반영된다.
   진입: renderIpo(host) — host 안에만 그린다. 홈 카드: ipoHomeBlock().
   app.js 전역($, esc, pad, ymd, parse, today, addDays, diffDays, md, ico, toast)과 graph.js 의 STORE 를 쓴다. */

const IPO_STATUS = ['미접촉', '연락함', '미팅', '보류'];
const IPO_FILTERS = [['all', '전체'], ['lock', '락업 30일'], ['direct', '직통번호'], ['todo', '미접촉'], ['fund', '조달 공시']];
const IPO_SORTS = [['listed', '상장일순'], ['lock', '락업 임박순'], ['mcap', '시총순']];
const IPO_TTL = 5 * 60000;
const IPO_FUND = /전환사채|교환사채|신주인수권부사채|유상증자/;

const ipoState = {
  data: null, marks: { items: [], version: null }, at: 0, loading: null,
  q: '', f: 'all', sort: 'listed', tab: 'contact', open: new Set(), dirty: new Map(), saving: Promise.resolve(), focus: null, host: null,
};

/* ---------- 데이터 ---------- */
function ipoLoad(force) {
  if (!force && ipoState.at && Date.now() - ipoState.at < IPO_TTL) return Promise.resolve();
  if (!ipoState.loading) {
    ipoState.loading = (async () => {
      const [d, mk] = await Promise.all([STORE.readText('data/ipo.json'), STORE.readJSON('ipo_marks')]);
      let data = null;
      if (d.text) { try { data = JSON.parse(d.text); } catch { throw new Error('ipo.json 형식이 올바르지 않습니다'); } }
      if (data) data.items = (data.items || []).map(ipoNorm);
      ipoState.data = data;
      ipoState.marks = { items: Array.isArray(mk.items) ? mk.items : [], version: mk.version };
      ipoState.at = Date.now();
    })().finally(() => { ipoState.loading = null; });
  }
  return ipoState.loading;
}

function ipoNorm(x) {
  const td = today();
  const locks = (x.lockups || []).map((l) => ({ ...l, d: String(l['해제일'] || '').slice(0, 10) })).filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.d));
  // 상장일 당일 '유통가능' 행은 해제가 아니므로 다음 락업에서 뺀다
  const next = locks.filter((l) => l.d >= td && l.d > x.listed).sort((a, b) => a.d.localeCompare(b.d))[0] || null;
  const fund = (x.events || []).filter((e) => IPO_FUND.test(e.nm));
  const w = x.writer || {};
  return { ...x, locks, next, fund,
    _q: [x.name, x.code, x.sector, x.product, x.summary, x.fi, x.broker, w.name, x.discloser?.['성명']].join(' ').toLowerCase() };
}

const ipoFind = (code) => ipoState.data?.items.find((x) => x.code === code);
const ipoMark = (code) => ipoState.marks.items.find((m) => m.code === code);
const ipoSt = (code) => ipoMark(code)?.status || '미접촉';
const ipoNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* 표시 저장: ipo_marks.json 은 탁지원·대표님 두 분이 같이 쓴다(편집 공유).
   다른 사람이 먼저 저장했으면(409) 최신본을 다시 읽고, 이번에 바꾼 회사만 덮어 합쳐 한 번 더 저장한다. */
function ipoSaveMarks() {
  let merged = false;
  ipoState.saving = ipoState.saving.then(async () => {
    for (let i = 0; i < 3; i++) {
      try {
        ipoState.marks.version = await STORE.writeJSON('ipo_marks', ipoState.marks.items, ipoState.marks.version);
        ipoState.dirty.clear();
        return;
      } catch (e) {
        if (e.status !== 409) { toast(e.message); return; }
        try {
          const r = await STORE.readJSON('ipo_marks');
          const items = Array.isArray(r.items) ? r.items : [];
          ipoState.dirty.forEach((m, code) => { const k = items.findIndex((x) => x.code === code); if (k >= 0) items[k] = m; else items.push(m); });
          ipoState.marks = { items, version: r.version };
          merged = true;
        } catch { toast('저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.'); return; }
      }
    }
    toast('다른 분이 동시에 수정 중입니다. 잠시 후 다시 시도해 주세요.');
  }).finally(() => { if (merged) ipoDraw(); }); // 다른 분이 바꾼 내용도 화면에 반영
  return ipoState.saving;
}

function ipoTouch(code, patch) {
  const x = ipoFind(code); if (!x) return;
  let m = ipoMark(code);
  if (!m) { m = { code, name: x.name, status: '미접촉', note: '' }; ipoState.marks.items.push(m); }
  Object.assign(m, patch, { name: x.name, at: ipoNow(), by: G.account?.name || '' });
  ipoState.dirty.set(code, m);
}

function ipoSetStatus(code, status) {
  ipoTouch(code, { status });
  ipoRefreshRow(code);
  const s = $('#ipo-sum'); if (s) s.innerHTML = ipoSummary();
  ipoSaveMarks();
}

function ipoSetNote(code, v) {
  const note = v.trim();
  if ((ipoMark(code)?.note || '') === note) return;
  ipoTouch(code, { note });
  ipoSaveMarks();
}

/* ---------- 표시 형식 ---------- */
const ipoMd = (s) => { const d = parse(s); return s.slice(0, 4) === today().slice(0, 4) ? md(s) : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const ipoEok = (v) => (v == null || v === '' ? '–' : `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`);
const ipoWon = (v) => (v == null ? '–' : `${Number(v).toLocaleString('ko-KR')}원`);
const ipoTel = (t) => (t ? `<a class="ipo-tel" href="tel:${esc(String(t).replace(/[^\d+]/g, ''))}">${esc(t)}</a>` : '–');
const ipoUrl = (u) => (u ? (/^https?:\/\//i.test(u) ? u : `http://${u}`) : '');

function ipoChange(x) {
  if (!x.mcapNow || !x.mcapOffer) return '';
  const r = x.mcapNow / x.mcapOffer - 1;
  return `<span class="ipo-chg ${r < 0 ? 'dn' : 'up'}">${r >= 0 ? '+' : ''}${(r * 100).toFixed(0)}%</span>`;
}

function ipoLockCell(x) {
  if (!x.next) return '<span class="muted">–</span>';
  const n = diffDays(x.next.d, today());
  return `<span class="${n <= 14 ? 'ipo-soon' : ''}">${ipoMd(x.next.d)} · ${n ? `D-${n}` : '오늘'}</span><div class="ipo-sub">${esc(x.next['지분율'] || '')}</div>`;
}

function ipoWriterCell(x) {
  const w = x.writer || {};
  if (!w.name) return '<span class="muted">–</span>';
  return `<div>${esc(w.title)} ${esc(w.name)}</div><div class="ipo-sub">${esc(w.phone)}${w.direct ? ' <span class="ipo-direct">직통</span>' : ''}</div>`;
}

/* ---------- 목록 ---------- */
function ipoList() {
  const d = ipoState.data; if (!d) return [];
  const q = ipoState.q.trim().toLowerCase(), d30 = ymd(addDays(new Date(), 30));
  let list = d.items.filter((x) => !q || x._q.includes(q));
  const f = ipoState.f;
  if (f === 'lock') list = list.filter((x) => x.next && x.next.d <= d30);
  if (f === 'direct') list = list.filter((x) => x.writer?.direct);
  if (f === 'todo') list = list.filter((x) => ipoSt(x.code) === '미접촉');
  if (f === 'fund') list = list.filter((x) => x.fund.length);
  const by = {
    listed: (a, b) => b.listed.localeCompare(a.listed),
    lock: (a, b) => (a.next?.d || '9999').localeCompare(b.next?.d || '9999') || b.listed.localeCompare(a.listed),
    mcap: (a, b) => (b.mcapNow || 0) - (a.mcapNow || 0),
  }[ipoState.sort];
  return list.sort(by);
}

function ipoRow(x) {
  const open = ipoState.open.has(x.code), st = ipoSt(x.code), f25 = x.fin?.years?.['2025'] || [];
  return `<div class="ipo-row${open ? ' open' : ''}" data-code="${esc(x.code)}">
    <div class="ipo-line ipo-cols">
      <div class="ipo-c-date">${md(x.listed)}<div class="ipo-sub">${esc(x.market)}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name)}</button><div class="ipo-sub">${esc(x.product || x.sector)}</div></div>
      <div>${ipoEok(x.mcapNow)} ${ipoChange(x)}<div class="ipo-sub">공모가 기준 ${ipoEok(x.mcapOffer)}</div></div>
      <div>${ipoEok(f25[0])}<div class="ipo-sub">영업이익 ${ipoEok(f25[1])}</div></div>
      <div class="ipo-c-writer">${ipoWriterCell(x)}</div>
      <div class="ipo-c-lock">${ipoLockCell(x)}</div>
      <div class="ipo-c-st"><span class="ipo-st s-${IPO_STATUS.indexOf(st)}">${esc(st)}</span><span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span></div>
    </div>${open ? ipoDetail(x) : ''}</div>`;
}

const IPO_TABS = [['contact', '연락처'], ['signal', '자금수요·포인트'], ['fin', '재무'], ['holders', '주주·락업'], ['disc', '공시']];

/* ①②… 또는 ' · '로 이어 쓴 문장을 줄 목록으로 */
const ipoSplitNum = (s) => String(s || '').split(/\s*(?=[①②③④⑤⑥⑦⑧⑨])/).map((t) => t.replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '').trim()).filter(Boolean);
const ipoSplitDot = (s) => String(s || '').split(/\s+·\s+|(?<=\))\s*,\s*/).map((t) => t.trim()).filter(Boolean);

function ipoDetail(x) {
  const m = ipoMark(x.code), st = ipoSt(x.code), tab = ipoState.tab;
  const tabs = IPO_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-ipo-tab="${k}">${l}</button>`).join('');
  return `<div class="ipo-detail">
    <div class="ipo-dhead">
      ${x.summary ? `<p class="ipo-sum1">${esc(x.summary)}</p>` : '<p></p>'}
      <div class="ipo-acts"><div class="seg ipo-seg">${IPO_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" data-ipo-st="${s}">${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-ipo-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모">
        ${m?.at ? `<span class="ipo-by">${esc(m.by || '')} ${esc(ipoMd(m.at.slice(0, 10)))} ${esc(m.at.slice(11, 16))}</span>` : ''}</div>
    </div>
    <div class="ipo-tabs" role="tablist">${tabs}</div>
    <div class="ipo-pane">${({ contact: ipoPaneContact, signal: ipoPaneSignal, fin: ipoPaneFin, holders: ipoPaneHolders, disc: ipoPaneDisc }[tab] || ipoPaneContact)(x)}</div>
  </div>`;
}

const ipoKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const ipoPerson = (p) => [p?.['직책'], p?.['성명']].filter((s) => s && s !== '확인 필요').map(esc).join(' ');

function ipoPaneContact(x) {
  const w = x.writer || {};
  const staff = (x.staff || []).map((s) => [s['구분'], s['성명'], s['직책']].filter(Boolean).map(esc).join(' ')).filter(Boolean).join('<br>');
  const links = [[x.home, '홈페이지'], [x.ir, 'IR'], [x.contactPage, '문의'], [x.dartUrl, 'DART 원문']]
    .filter(([u]) => u).map(([u, l]) => `<a class="ipo-a" href="${esc(ipoUrl(u))}" target="_blank" rel="noopener">${l}${ico('ext', 'sm')}</a>`).join('');
  const route = ipoSplitNum(x.route);
  return `<div class="ipo-two-col">
    <div>
      ${w.name ? `<div class="ipo-lead"><div class="ipo-lead-k">작성책임자</div>
        <div class="ipo-lead-v">${esc(w.title)} ${esc(w.name)}</div>
        <div class="ipo-lead-s">${ipoTel(w.phone)}${w.direct ? '<span class="ipo-direct">직통</span>' : ''}</div></div>` : ''}
      ${ipoKv('공시책임자', ipoPerson(x.discloser))}
      ${ipoKv('공시담당자', staff)}
      ${ipoKv('CFO', ipoPerson(x.cfo))}
      ${ipoKv('대표전화', x.phone ? ipoTel(x.phone) : '')}
      ${ipoKv('팩스', esc(x.fax))}
      ${ipoKv('주관사', esc(x.broker))}
      ${links ? `<div class="ipo-links">${links}</div>` : ''}
    </div>
    <div>${route.length ? `<div class="ipo-h">접촉 경로</div><ol class="ipo-ol">${route.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}</div>
  </div>`;
}

function ipoPaneSignal(x) {
  const lst = (a) => (a || []).map((s) => `<li>${esc(s)}</li>`).join('');
  return `<div class="ipo-h">자금수요 신호</div><p class="ipo-p">${esc(x.signal || '–')}</p>
    <div class="ipo-two-col">
      <div><div class="ipo-h">투자 포인트</div><ul class="ipo-ul">${lst(x.points)}</ul></div>
      <div><div class="ipo-h">리스크</div><ul class="ipo-ul">${lst(x.risks)}</ul></div>
    </div>`;
}

function ipoPaneFin(x) {
  const fin = x.fin || {}, years = ['2023', '2024', '2025'], half = fin.half && fin.half.label;
  const fv = (y, i) => ipoEok((fin.years?.[y] || [])[i]);
  return `<div class="ipo-h">손익 <span class="muted">${esc(fin.basis || '')} · 억원</span></div>
    <table class="ipo-fin"><thead><tr><th></th>${years.map((y) => `<th>${y}</th>`).join('')}${half ? `<th>${esc(half)}</th>` : ''}</tr></thead>
    <tbody><tr><td>매출</td>${years.map((y) => `<td>${fv(y, 0)}</td>`).join('')}${half ? `<td>${ipoEok(fin.half.rev)}</td>` : ''}</tr>
    <tr><td>영업이익</td>${years.map((y) => `<td>${fv(y, 1)}</td>`).join('')}${half ? `<td>${ipoEok(fin.half.op)}</td>` : ''}</tr></tbody></table>
    <div class="ipo-h">유동성</div>
    ${ipoKv('현금성자산', esc(fin.cash))}${ipoKv('차입금', esc(fin.debt))}${ipoKv('부채비율', esc(fin.lev))}
    ${ipoKv('시가총액', `${ipoEok(x.mcapNow)} · 공모가 기준 ${ipoEok(x.mcapOffer)} ${ipoChange(x)}`)}
    ${fin.note ? `<div class="ipo-h">재무 특징</div><p class="ipo-p">${esc(fin.note)}</p>` : ''}`;
}

function ipoPaneHolders(x) {
  const fi = ipoSplitDot(x.fi);
  const locks = x.locks.map((l) => `<tr class="${l.d < today() ? 'past' : ''}"><td>${esc(l.d)}</td><td>${esc(l['지분율'] || '')}</td><td>${esc(l['대상'] || '')}</td></tr>`).join('');
  return `<div class="ipo-two-col">
    <div><div class="ipo-h">주요 FI</div>${fi.length ? `<ul class="ipo-ul">${fi.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : '<p class="ipo-p muted">없음</p>'}</div>
    <div><div class="ipo-h">락업 해제</div>${locks ? `<table class="ipo-tbl"><thead><tr><th>해제일</th><th>지분율</th><th>대상</th></tr></thead><tbody>${locks}</tbody></table>` : '<p class="ipo-p muted">없음</p>'}</div>
  </div>`;
}

function ipoPaneDisc(x) {
  const evs = (x.events || []).map((e) => `<tr><td>${esc(e.dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))}</td><td><a class="ipo-a" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.nm)}</a></td></tr>`).join('');
  return `<div class="ipo-h">상장 후 공시</div>${evs ? `<table class="ipo-tbl ipo-tbl-2"><thead><tr><th>접수일</th><th>보고서</th></tr></thead><tbody>${evs}</tbody></table>` : '<p class="ipo-p muted">없음</p>'}
    ${x.dartUrl ? `<div class="ipo-links"><a class="ipo-a" href="${esc(x.dartUrl)}" target="_blank" rel="noopener">투자설명서 원문${ico('ext', 'sm')}</a></div>` : ''}`;
}

function ipoSummary() {
  const d = ipoState.data; if (!d) return '';
  const g = d.generated ? new Date(d.generated) : null, ok = g && !isNaN(g), td = today(), d30 = ymd(addDays(new Date(), 30));
  const gl = ok ? `${ymd(g) === td ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집` : '';
  const lock = d.items.filter((x) => x.next && x.next.d <= d30).length;
  const done = d.items.filter((x) => ipoSt(x.code) !== '미접촉').length;
  return `${gl ? `<span class="${ok && Date.now() - g > 36 * 3600000 ? 'ipo-stale' : ''}">${gl}</span>` : ''}<span>${d.items.length}곳</span><span>락업 30일 <b>${lock}</b></span><span>컨택 <b>${done}</b></span>`;
}

function ipoBody() {
  const list = ipoList();
  if (!ipoState.data) return '<div class="empty">아직 수집된 신규상장 데이터가 없습니다.</div>';
  if (!list.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  return `<div class="ipo-head ipo-cols"><div>상장일</div><div>회사</div><div>현재 시총</div><div>2025 매출</div><div>작성책임자</div><div>다음 락업</div><div>상태</div></div>${list.map(ipoRow).join('')}`;
}

function ipoDraw() {
  const b = ipoState.host && ipoState.host.querySelector('#ipo-body'); if (!b) return;
  b.innerHTML = ipoBody();
  const s = ipoState.host.querySelector('#ipo-sum'); if (s) s.innerHTML = ipoSummary();
  if (ipoState.focus) {
    const r = b.querySelector(`.ipo-row[data-code="${CSS.escape(ipoState.focus)}"]`);
    ipoState.focus = null;
    if (r) r.scrollIntoView({ block: 'center' });
  }
}

function ipoRefreshRow(code) {
  const x = ipoFind(code); if (!x || !ipoState.host) return;
  ipoState.host.querySelectorAll('.ipo-row').forEach((r) => { if (r.dataset.code === code) r.outerHTML = ipoRow(x); });
}

function ipoBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const fb = t.closest('[data-ipo-f]');
    if (fb) { ipoState.f = fb.dataset.ipoF; root.querySelectorAll('[data-ipo-f]').forEach((b) => b.classList.toggle('on', b === fb)); ipoDraw(); return; }
    if (t.closest('#ipo-ref')) { ipoLoad(true).then(ipoDraw).catch((e) => toast(e.message)); return; }
    const tb = t.closest('[data-ipo-tab]');
    if (tb) { ipoState.tab = tb.dataset.ipoTab; ipoRefreshRow(tb.closest('.ipo-row').dataset.code); return; }
    const sb = t.closest('[data-ipo-st]');
    if (sb) { ipoSetStatus(sb.closest('.ipo-row').dataset.code, sb.dataset.ipoSt); return; }
    if (t.closest('a, input, details, .ipo-detail')) return;
    const row = t.closest('.ipo-row');
    if (row) {
      const c = row.dataset.code;
      if (ipoState.open.has(c)) ipoState.open.delete(c); else ipoState.open.add(c);
      ipoRefreshRow(c);
    }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'ipo-q') { ipoState.q = ev.target.value; ipoDraw(); } });
  root.addEventListener('change', (ev) => {
    if (ev.target.id === 'ipo-sort') { ipoState.sort = ev.target.value; ipoDraw(); }
    if (ev.target.matches('[data-ipo-note]')) ipoSetNote(ev.target.closest('.ipo-row').dataset.code, ev.target.value);
  });
}

async function renderIpo(host) {
  ipoState.host = host;
  host.innerHTML = `<div class="ipo-page" id="ipo-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="ipo-sum"></div>
      <button class="btn ghost" type="button" id="ipo-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div class="ipo-filter">
        <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="ipo-q" type="search" placeholder="회사·FI·담당자 검색" value="${esc(ipoState.q)}" autocomplete="off" aria-label="검색"></div>
        <div class="seg">${IPO_FILTERS.map(([k, l]) => `<button type="button" data-ipo-f="${k}" class="${ipoState.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select class="select" id="ipo-sort" aria-label="정렬">${IPO_SORTS.map(([k, l]) => `<option value="${k}"${ipoState.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="ipo-body" id="ipo-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  ipoBind(host.querySelector('#ipo-root'));
  try { await ipoLoad(); }
  catch (e) {
    const b = host.querySelector('#ipo-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (ipoState.host === host && host.isConnected) ipoDraw();
}

/* 홈 카드: 2주 안 락업 해제가 있는 회사 최대 5곳. ipo.json 이 없거나 못 읽으면 '' */
async function ipoHomeBlock() {
  try { await ipoLoad(); } catch { return ''; }
  const d = ipoState.data; if (!d) return '';
  const lim = ymd(addDays(new Date(), 14));
  const list = d.items.filter((x) => x.next && x.next.d <= lim).sort((a, b) => a.next.d.localeCompare(b.next.d));
  const li = (x) => `<li class="click" data-ipo-go="${esc(x.code)}"><span class="time">${ipoMd(x.next.d)}</span>
    <div class="t"><div class="ttl">${esc(x.name)}</div><div class="meta">${esc([x.next['지분율'], x.writer?.name && `${x.writer.title} ${x.writer.name}`].filter(Boolean).join(' · '))}</div></div>
    <span class="ipo-st s-${IPO_STATUS.indexOf(ipoSt(x.code))}">${esc(ipoSt(x.code))}</span></li>`;
  return `<section class="card ipo-home">
    <div class="card-head"><h2>신규상장 락업 해제 <span class="n">${list.length}</span></h2><a class="btn sm act" href="#deals/ipo">신규상장 전체 보기</a></div>
    <div class="card-body">${list.length ? `<ul class="list">${list.slice(0, 5).map(li).join('')}</ul>` : '<div class="empty">2주 안에 락업이 풀리는 회사가 없습니다.</div>'}</div></section>`;
}

/* 홈 카드에서 회사를 누르면 신규상장 목록에서 그 회사를 펼쳐 보여 준다 */
document.addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-ipo-go]'); if (!li) return;
  ipoState.focus = li.dataset.ipoGo;
  ipoState.open.add(li.dataset.ipoGo);
  location.hash = '#deals/ipo';
});
