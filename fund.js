/* UNIVERSE WORKS — 딜소싱 › 출자사업(#deals/fund) (2026-11-25 사용자 요청: 우주항공 펀드 출자 공고 트래커를 '타깃' 오른쪽 탭으로)
   자료: data/fund_calls.json(04. 펀드 결성\_자동화\fund_calls.py가 트래커 엑셀을 바꿔 올림, 수동 실행. --scan이면 fund_scan.py 원천 8곳 최근 공고도 실음).
   근거는 04. 펀드 결성\우주항공 펀드 출자 리서치 노트.md. 이 화면은 읽기만.
   보기 셋: 공고 목록(기본 다가오는 접수순) | 2027 일정 | 새 공고(원천 게시판에서 받은 최근 공고, 선정 결과 제외).
   PEF 가능, Co-GP 가능은 엑셀 '지원 자격' 문장에서 뽑은 값(fund_calls.py pef_of·cogp_of). 필터 줄은 공용 틀(filt.js)이 꾸민다.
   ipo.css(목록·펼친 행)·radar.css(.rd-page·.rd-grp·.rd-clamp)·pe.css(.pe-grp·.pe-gn) 클래스를 쓰고 새것만 fund.css. */

const FC_FILE = 'data/fund_calls.json';
const FC_TTL = 5 * 60000;
const FC_VIEWS = [['list', '공고 목록'], ['plan', '2027 일정'], ['scan', '새 공고']];
const FC_ST = [['', '전체'], ['예정', '예정'], ['수시', '수시'], ['완료', '완료'], ['확인 불가', '확인 불가'], ['해당 없음', '해당 없음']];
const FC_YN = [['', '전체'], ['가능', '가능'], ['불가', '불가'], ['확인 필요', '확인 필요']];
const FC_PATH = [['', '전체'], ['go', '우리 길 있음'], ['watch', '관찰'], ['none', '참고·해당 없음']];
const FC_GO = /직접|Co-GP|프로젝트|매칭|공동투자/;
const FC_KEYS = ['view', 'q', 'st', 'pef', 'cogp', 'path'];

const fcS = (() => {
  const v = viewGet('fund', null) || {};
  const s = { view: 'list', q: '', st: '', pef: '', cogp: '', path: '', data: null, at: 0, loading: null, host: null, open: new Set(), err: '' };
  FC_KEYS.forEach((k) => { if (typeof v[k] === 'string') s[k] = v[k]; });
  if (!FC_VIEWS.some(([k]) => k === s.view)) s.view = 'list';
  return s;
})();
const fcSave = () => viewSet('fund', Object.fromEntries(FC_KEYS.map((k) => [k, fcS[k]])));

/* ---------- 자료 ---------- */
const fcStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const fcHttp = (v) => { const s = fcStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const fcArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
function fcNorm(raw) {
  const items = fcArr(raw.items).map((x, i) => {
    const o = Object.fromEntries(['org', 'name', 'field', 'year', 'amt', 'size', 'gp', 'elig', 'next', 'st', 'key', 'doc', 'path', 'todo', 'pef', 'cogp'].map((k) => [k, fcStr(x[k])]));
    o.id = fcStr(x.id) || `fc${i}`; o.url = fcHttp(x.url); o.est = x.est === true;
    o.q = [o.org, o.name, o.field, o.gp, o.elig, o.path, o.todo].join(' ').toLowerCase();
    return o;
  });
  const plan = fcArr(raw.plan).map((x) => Object.fromEntries(['org', 'name', 'exp', 'prev', 'path'].map((k) => [k, fcStr(x[k])])));
  const scan = fcArr(raw.scan).map((x) => ({ src: fcStr(x.src), title: fcStr(x.title), date: fcStr(x.date).slice(0, 10), url: fcHttp(x.url), sector: fcStr(x.sector) }));
  return { generated: fcStr(raw.generated), source: fcStr(raw.source), scanAt: fcStr(raw.scanAt), scanErr: (Array.isArray(raw.scanErr) ? raw.scanErr : []).map(fcStr).filter(Boolean), items, plan, scan, hasScan: Array.isArray(raw.scan) };
}
function fcLoad(force) {
  if (!force && fcS.at && Date.now() - fcS.at < FC_TTL) return Promise.resolve();
  if (!fcS.loading) {
    fcS.loading = (async () => {
      const d = await STORE.readText(FC_FILE);
      let raw = null;
      if (d.text) { try { raw = JSON.parse(d.text); } catch { throw new Error('출자사업 자료 형식이 올바르지 않습니다'); } }
      fcS.data = raw && typeof raw === 'object' ? fcNorm(raw) : null;
      fcS.at = Date.now();
    })().finally(() => { fcS.loading = null; });
  }
  return fcS.loading;
}

/* ---------- 목록·정렬 ---------- */
// 다가오는 접수순: 예정(접수 시기 빠른 순) → 수시 → 확인 불가 → 완료(최근 순) → 해당 없음
const FC_RANK = { 예정: 0, 수시: 1, 지남: 2, '확인 불가': 3, 완료: 4, '해당 없음': 5 };
const fcPathOf = (x) => (FC_GO.test(x.path) ? 'go' : /관찰/.test(x.path) ? 'watch' : 'none');
function fcList() {
  const s = fcS, q = s.q.trim().toLowerCase();
  return (s.data?.items || []).filter((x) => (!q || x.q.includes(q)) && (!s.st || x.st === s.st) && (!s.pef || x.pef === s.pef) && (!s.cogp || x.cogp === s.cogp) && (!s.path || fcPathOf(x) === s.path))
    .sort((a, b) => (FC_RANK[a.st] ?? 9) - (FC_RANK[b.st] ?? 9) || (a.st === '완료' ? (b.key || '').localeCompare(a.key || '') : (a.key || '9999').localeCompare(b.key || '9999')) || a.org.localeCompare(b.org, 'ko'));
}

/* ---------- 그리기 ---------- */
const FC_NA = '<span class="muted">–</span>';
const fcYm = (k) => (/^\d{4}-\d{2}$/.test(k) ? `${k.slice(2, 4)}.${k.slice(5, 7)}` : '');
const fcCell = (v) => (v ? `<span class="rd-clamp">${esc(v)}</span>` : FC_NA);
const fcYn = (v) => (v === '가능' ? '<span class="fc-yn on">가능</span>' : v === '불가' ? '<span class="fc-yn off">불가</span>' : `<span class="muted">${esc(v || '확인 필요')}</span>`);
const fcStChip = (x) => `<span class="pe-ds${x.st === '예정' || x.st === '수시' ? ' on' : ''}">${esc(x.st || '확인 불가')}</span>`;
const fcWhen = (x) => (x.st === '완료' ? (fcYm(x.key) ? `${fcYm(x.key)} 선정` : '') : x.st === '수시' ? '수시' : fcYm(x.key) ? `${fcYm(x.key)}${x.est ? ' 추정' : ''}` : '');
const fcKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const fcChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
const FC_HEAD = '<div class="ipo-head ipo-cols"><div>출자기관</div><div>사업명</div><div>분야</div><div>규모</div><div>접수 시기</div><div>PEF</div><div>Co-GP</div><div>상태</div><div></div></div>';

function fcRow(x) {
  const open = fcS.open.has(x.id), w = fcWhen(x);
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div class="rd-mh">${fcCell(x.org)}</div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name)}</button><div class="ipo-sub fc-org">${esc(x.org)}</div>
        <div class="rd-pair"><span class="fc-w1">${w ? esc(w) : FC_NA}</span><span>PEF ${fcYn(x.pef)}</span><span>${fcStChip(x)}</span></div></div>
      <div class="rd-mh">${fcCell(x.field)}</div>
      <div class="rd-mh">${fcCell(x.amt)}</div>
      <div class="rd-mh">${w ? esc(w) : FC_NA}</div>
      <div class="rd-mh">${fcYn(x.pef)}</div>
      <div class="rd-mh">${fcYn(x.cogp)}</div>
      <div class="rd-mh">${fcStChip(x)}</div>
      <div class="ipo-c-st">${fcChev()}</div>
    </div>${open ? fcDetail(x) : ''}</div>`;
}
function fcDetail(x) {
  const src = x.url ? `<a class="rd-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60))}</a>` : x.doc ? `04. 펀드 결성\\원문\\${esc(x.doc)}` : '';
  const a = `${fcKv('출자기관', esc(x.org))}${fcKv('분야', esc(x.field))}${fcKv('연도', esc(x.year))}${fcKv('출자액', esc(x.amt))}${fcKv('펀드 결성액', esc(x.size))}${fcKv('선정 GP', esc(x.gp))}`;
  const b = `${fcKv('지원 자격', esc(x.elig))}${fcKv('PEF', fcYn(x.pef))}${fcKv('Co-GP', fcYn(x.cogp))}${fcKv('다음 공고', esc(x.next))}${fcKv('우리 경로', esc(x.path))}${fcKv('준비할 것', esc(x.todo))}${fcKv('원문', src)}`;
  const box = (t, body) => (body ? `<section class="ipo-box"><div class="ipo-box-h">${t}</div><div class="ipo-box-b">${body}</div></section>` : '');
  return `<div class="ipo-detail"><div class="ipo-pane"><div class="ipo-two-col"><div class="ipo-stack">${box('사업', a)}</div><div class="ipo-stack">${box('자격과 일정', b)}</div></div></div></div>`;
}

function fcPlanBody() {
  const l = fcS.data?.plan || [];
  if (!l.length) return '<div class="empty">2027 일정이 없습니다.</div>';
  return `<div class="ipo-head ipo-cols fc-plan"><div>출자기관</div><div>사업</div><div>2027 예상</div><div>2026 실제</div><div>우리 경로</div></div>${l.map((x) => `<div class="ipo-row rd-static"><div class="ipo-line ipo-cols fc-plan">
    <div class="rd-mh">${fcCell(x.org)}</div>
    <div class="ipo-c-name"><span class="rd-strong">${esc(x.name)}</span><div class="ipo-sub fc-org">${esc(x.org)}</div><div class="rd-pair"><span>${esc(x.exp)}</span><span>${esc(x.path)}</span></div></div>
    <div class="rd-mh">${fcCell(x.exp)}</div><div class="rd-mh">${fcCell(x.prev)}</div><div class="rd-mh">${fcCell(x.path)}</div></div></div>`).join('')}`;
}
function fcScanBody() {
  const d = fcS.data;
  if (!d?.hasScan) return '<div class="empty">아직 받은 새 공고가 없습니다.</div>';
  const q = fcS.q.trim().toLowerCase(), l = d.scan.filter((x) => !q || `${x.title} ${x.src} ${x.sector}`.toLowerCase().includes(q));
  const err = d.scanErr.length ? `<div class="fc-err">${d.scanErr.map((t) => `<div>${esc(t)}</div>`).join('')}</div>` : '';
  if (!l.length) return `${err}<div class="empty">조건에 맞는 공고가 없습니다.</div>`;
  return `${err}<div class="ipo-head ipo-cols fc-scan"><div>날짜</div><div>제목</div><div>원천</div><div>분야 말</div></div>${l.map((x) => `<div class="ipo-row rd-static"><div class="ipo-line ipo-cols fc-scan">
    <div>${x.date ? esc(yymd(x.date)) : FC_NA}</div>
    <div class="ipo-c-name">${x.url ? `<a class="rd-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title)}<div class="rd-pair"><span>${esc(x.src)}</span>${x.sector ? `<span class="fc-hit">${esc(x.sector)}</span>` : ''}</div></div>
    <div class="rd-mh">${fcCell(x.src)}</div><div class="rd-mh">${x.sector ? `<span class="fc-hit">${esc(x.sector)}</span>` : FC_NA}</div></div></div>`).join('')}`;
}
function fcBody() {
  if (fcS.err) return `<div class="empty">${esc(fcS.err)}</div>`;
  if (!fcS.data) return '<div class="empty">아직 올라온 출자사업 자료가 없습니다.</div>';
  if (fcS.view === 'plan') return fcPlanBody();
  if (fcS.view === 'scan') return fcScanBody();
  const l = fcList();
  return l.length ? FC_HEAD + l.map(fcRow).join('') : '<div class="empty">조건에 맞는 공고가 없습니다.</div>';
}
function fcSummary() {
  const d = fcS.data; if (!d) return '';
  const n = (st) => d.items.filter((x) => x.st === st).length, go = d.items.filter((x) => fcPathOf(x) === 'go' && x.st !== '완료').length;
  return `${d.generated ? `<span>${yymd(d.generated)} 갱신</span>` : ''}<span>공고 <b>${d.items.length}</b></span><span>예정 <b>${n('예정')}</b></span><span>수시 <b>${n('수시')}</b></span><span>우리 길 있음 <b>${go}</b></span>${d.scanAt ? `<span>새 공고 ${esc(d.scanAt.slice(2, 10).replace(/-/g, '.'))} 확인</span>` : ''}`;
}
const fcSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
function fcFilterHtml() {
  const s = fcS, list = s.view === 'list';
  const search = `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="fc-q" type="search" placeholder="${list ? '기관, 사업, 분야, GP로 검색' : '제목, 원천으로 검색'}" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div></div>`;
  if (s.view === 'plan') return '';
  if (!list) return search;
  return `${search}<div class="ipo-filter rd-finf"><div class="rd-fing"><span class="rd-finl">상태</span>${fcSeg('fc-st', FC_ST, s.st)}</div>
    <div class="rd-fing"><span class="rd-finl">PEF</span>${fcSeg('fc-pef', FC_YN, s.pef)}</div>
    <div class="rd-fing"><span class="rd-finl">Co-GP</span>${fcSeg('fc-cogp', FC_YN, s.cogp)}</div>
    <div class="rd-fing"><span class="rd-finl">우리 경로</span>${fcSeg('fc-path', FC_PATH, s.path)}</div></div>`;
}
function fcViewHtml() {
  const d = fcS.data;
  const n = { list: d?.items.length, plan: d?.plan.length, scan: d?.hasScan ? d.scan.length : null };
  return `<div class="seg" role="tablist">${FC_VIEWS.map(([k, l]) => `<button type="button" role="tab" data-fc-view="${k}" class="${fcS.view === k ? 'on' : ''}" aria-selected="${fcS.view === k}">${l}${n[k] != null ? `<span class="pe-gn">${n[k]}</span>` : ''}</button>`).join('')}</div>`;
}
function fcDraw(full) {
  const h = fcS.host; if (!h || !h.isConnected) return;
  if (full) { h.querySelector('#fc-filter').innerHTML = fcFilterHtml(); h.querySelector('#fc-view').innerHTML = fcViewHtml(); }
  h.querySelector('#fc-sum').innerHTML = fcSummary();
  h.querySelector('#fc-body').innerHTML = fcBody();
  fcSave();
}
function fcBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const vb = t.closest('[data-fc-view]');
    if (vb) { if (fcS.view !== vb.dataset.fcView) { fcS.view = vb.dataset.fcView; fcDraw(true); } return; }
    const fb = t.closest('[data-fc-st], [data-fc-pef], [data-fc-cogp], [data-fc-path]');
    if (fb) {
      const k = ['st', 'pef', 'cogp', 'path'].find((y) => `fc${y[0].toUpperCase()}${y.slice(1)}` in fb.dataset);
      fcS[k] = fb.dataset[`fc${k[0].toUpperCase()}${k.slice(1)}`];
      root.querySelectorAll(`[data-fc-${k}]`).forEach((b) => { b.classList.toggle('on', b === fb); b.setAttribute('aria-pressed', b === fb); });
      fcDraw(); return;
    }
    if (t.closest('#fc-ref')) { fcLoad(true).then(() => fcDraw(true)).catch((e) => toast(e.message)); return; }
    if (t.closest('a, input, select, .ipo-detail, .rd-static')) return;
    const row = t.closest('.ipo-row[data-id]'), x = row && fcS.data?.items.find((y) => y.id === row.dataset.id);
    if (!x) return;
    if (fcS.open.has(x.id)) fcS.open.delete(x.id); else fcS.open.add(x.id);
    row.outerHTML = fcRow(x);
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'fc-q') { fcS.q = ev.target.value; fcDraw(); } });
}

async function renderFund(host) {
  fcS.host = host; fcS.err = '';
  host.innerHTML = `<div class="ipo-page rd-page fc-page" id="fc-root">
    <div class="pe-grp" id="fc-view">${fcViewHtml()}</div>
    <div class="ipo-top"><div class="ipo-sumrow" id="fc-sum"></div>${infoBtn('deals/fund')}
      <button class="btn ghost" type="button" id="fc-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card"><div id="fc-filter">${fcFilterHtml()}</div><div class="ipo-body" id="fc-body"><div class="empty">불러오는 중…</div></div></section></div>`;
  fcBind(host.querySelector('#fc-root'));
  try { await fcLoad(); } catch (e) { fcS.err = e.message; }
  if (fcS.host === host && host.isConnected) fcDraw(true);
}

TAB_INFO['deals/fund'] = {
  title: '출자사업',
  asof: '트래커 04. 펀드 결성\\우주항공 출자사업 트래커 엑셀, 근거 같은 폴더 우주항공 펀드 출자 리서치 노트. 새 공고는 한국벤처투자, 한국성장금융, 산업은행, 국민성장펀드, 금융위, 우주항공청, 방위사업청, 과기정통부 게시판',
  rows: [
    ['무엇인가', [
      '우주항공과 방산 쪽 펀드 출자사업(모태펀드, 국민성장펀드, 성장금융, 방사청, 과기정통부, 지역 모펀드, 공제회)을 한 목록으로 모은 것입니다.',
      'PEF와 Co-GP는 공고의 지원 자격 문장에서 뽑았습니다. 벤처투자조합만 받는 사업은 기관전용 PEF GP인 우리가 GP로 들어갈 수 없어 불가로 나옵니다.',
      '접수 시기 옆 추정은 지난해 일정으로 짐작한 값입니다.',
    ]],
    ['어떻게 보나', [
      '공고 목록은 다가오는 접수순(예정, 수시, 확인 불가, 완료 순)입니다. 우리 경로가 직접, Co-GP, 프로젝트, 매칭, 공동투자인 사업은 우리 길 있음으로 거를 수 있습니다.',
      '2027 일정은 출자기관별 예상 시기와 올해 실제 시기, 새 공고는 원천 게시판에서 받은 최근 90일 공고(선정 결과 제외)입니다.',
    ]],
  ],
};
