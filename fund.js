/* UNIVERSE WORKS — 딜소싱 › 출자사업(#deals/fund) (2026-11-25 사용자 요청: 우주항공 펀드 출자 공고 트래커를 '타깃' 오른쪽 탭으로)
   자료: data/fund_calls.json(04. 펀드 결성\_자동화\fund_calls.py가 트래커 엑셀을 바꿔 올림, 수동 실행. --scan이면 fund_scan.py 원천 8곳 최근 공고도 실음).
   근거는 04. 펀드 결성\우주항공 펀드 출자 리서치 노트.md. 이 화면은 읽기만.
   보기 넷: 공고 목록(기본 다가오는 접수순) | 2027 일정 | 새 공고(원천 게시판에서 받은 최근 공고, 선정 결과 제외) | 선정 이력(11/25 사용자 "어떤 출자기관의 어떤 사업을 어떤 곳이 가져갔고, LP한테 나눠줬다면 어느 GP가 했는지").
   선정 이력: 자료 hist(한 줄에 선정 1건, 엑셀 '우주항공 출자사업 선정 이력 (날짜).xlsx'). 출자기관 › 사업 › 회차로 묶고, 모펀드 경유 건은 상위 운용기관 줄 아래 자펀드 GP를 들여씀.
   검색은 GP·Co-GP·상위 운용기관 이름까지 보므로 GP 이름을 넣으면 그 GP가 가져간 사업이 다 남는다. 공고 목록에서 '선정 이력'을 누르면 그 사업(이름 키 fcBizKey)만 걸러 보여 준다.
   PEF 가능, Co-GP 가능은 엑셀 '지원 자격' 문장에서 뽑은 값(fund_calls.py pef_of·cogp_of). 필터 줄은 공용 틀(filt.js)이 꾸민다.
   ipo.css(목록·펼친 행)·radar.css(.rd-page·.rd-grp·.rd-clamp)·pe.css(.pe-grp·.pe-gn) 클래스를 쓰고 새것만 fund.css. */

const FC_FILE = 'data/fund_calls.json';
const FC_TTL = 5 * 60000;
const FC_VIEWS = [['list', '공고 목록'], ['plan', '2027 일정'], ['scan', '새 공고'], ['hist', '선정 이력']];
const FC_HROUTE = [['', '전체'], ['직접', '직접 위탁'], ['모펀드', '모펀드 경유'], ['매칭', '매칭'], ['프로젝트', '프로젝트']];
const FC_HORD = [['date', '최신 발표순'], ['org', '출자기관순']]; // 이름이 '순'으로 끝나야 폰 필터 단추 숫자에 안 셈(app.js mfApply)
const FC_ST = [['', '전체'], ['예정', '예정'], ['수시', '수시'], ['완료', '완료'], ['확인 불가', '확인 불가'], ['해당 없음', '해당 없음']];
const FC_YN = [['', '전체'], ['가능', '가능'], ['불가', '불가'], ['확인 필요', '확인 필요']];
const FC_PATH = [['', '전체'], ['go', '우리 길 있음'], ['watch', '관찰'], ['none', '참고·해당 없음']];
const FC_GO = /직접|Co-GP|프로젝트|매칭|공동투자/;
const FC_KEYS = ['view', 'q', 'st', 'pef', 'cogp', 'path', 'hq', 'horg', 'hroute', 'hkind', 'hsp', 'hord', 'biz', 'bizName'];

const fcS = (() => {
  const v = viewGet('fund', null) || {};
  const s = { view: 'list', q: '', st: '', pef: '', cogp: '', path: '', hq: '', horg: '', hroute: '', hkind: '', hsp: '', hord: 'date', biz: '', bizName: '', data: null, at: 0, loading: null, host: null, open: new Set(), err: '' };
  FC_KEYS.forEach((k) => { if (typeof v[k] === 'string') s[k] = v[k]; });
  if (!FC_VIEWS.some(([k]) => k === s.view)) s.view = 'list';
  return s;
})();
const fcSave = () => viewSet('fund', Object.fromEntries(FC_KEYS.map((k) => [k, fcS[k]])));

/* ---------- 자료 ---------- */
const fcStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const fcHttp = (v) => { const s = fcStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const fcArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
// 사업 이름 키: 띄어쓰기·괄호·연도·회차(1호, 2차, 2기, 1차년도, 정시)를 뺀 것. 공고 목록 '뉴스페이스 펀드 4호'와 이력 '뉴스페이스 펀드'가 같은 사업
const fcBizKey = (n) => fcStr(n).replace(/\(.*?\)/g, '').replace(/20\d\d|\d+\s*(호|차년도|차|기)|정시|수시|[\s·,.-]/g, '').toLowerCase();
const fcBizHit = (a, b) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))));
function fcNorm(raw) {
  const items = fcArr(raw.items).map((x, i) => {
    const o = Object.fromEntries(['org', 'name', 'field', 'year', 'amt', 'size', 'gp', 'elig', 'next', 'st', 'key', 'doc', 'path', 'todo', 'pef', 'cogp'].map((k) => [k, fcStr(x[k])]));
    o.id = fcStr(x.id) || `fc${i}`; o.url = fcHttp(x.url); o.est = x.est === true;
    o.q = [o.org, o.name, o.field, o.gp, o.elig, o.path, o.todo].join(' ').toLowerCase();
    return o;
  });
  const plan = fcArr(raw.plan).map((x) => Object.fromEntries(['org', 'name', 'exp', 'prev', 'path'].map((k) => [k, fcStr(x[k])])));
  const scan = fcArr(raw.scan).map((x) => ({ src: fcStr(x.src), title: fcStr(x.title), date: fcStr(x.date).slice(0, 10), url: fcHttp(x.url), sector: fcStr(x.sector) }));
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const hist = fcArr(raw.hist).map((x, i) => {
    const o = Object.fromEntries(['date', 'round', 'org', 'name', 'field', 'path', 'parent', 'gp', 'cogp', 'kind'].map((k) => [k, fcStr(x[k])]));
    o.date = o.date.slice(0, 10); o.amt = num(x.amt); o.size = num(x.size); o.sp = x.sp === true; o.url = fcHttp(x.url); o.i = i;
    o.biz = fcBizKey(o.name); o.q = [o.gp, o.cogp, o.parent, o.org, o.name, o.field].join(' ').toLowerCase();
    return o;
  });
  const scanSel = fcArr(raw.scanSel).map((x) => ({ src: fcStr(x.src), title: fcStr(x.title), date: fcStr(x.date).slice(0, 10), url: fcHttp(x.url), sector: fcStr(x.sector) }));
  items.forEach((x) => { x.biz = fcBizKey(x.name); x.hn = x.biz ? hist.filter((h) => fcBizHit(h.biz, x.biz)).length : 0; });
  return { generated: fcStr(raw.generated), source: fcStr(raw.source), scanAt: fcStr(raw.scanAt), scanErr: (Array.isArray(raw.scanErr) ? raw.scanErr : []).map(fcStr).filter(Boolean), items, plan, scan, hasScan: Array.isArray(raw.scan), hist, histSrc: fcStr(raw.histSrc), scanSel };
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
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name)}</button>${x.hn ? `<button type="button" class="fc-hl" data-fc-hist="${esc(x.id)}">선정 이력 ${x.hn}</button>` : ''}<div class="ipo-sub fc-org">${esc(x.org)}</div>
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
  const hl = x.hn ? `<div class="ipo-links"><button type="button" class="btn sm rd-fs" data-fc-hist="${esc(x.id)}">지난 선정 이력 ${x.hn}건 보기</button></div>` : '';
  return `<div class="ipo-detail">${hl}<div class="ipo-pane"><div class="ipo-two-col"><div class="ipo-stack">${box('사업', a)}</div><div class="ipo-stack">${box('자격과 일정', b)}</div></div></div></div>`;
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
/* ---------- 선정 이력 ---------- */
const fcEok = (v) => (v == null ? '' : `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`);
const fcIsMo = (h) => /모펀드/.test(h.path) && !!h.parent;
function fcHistList() {
  const s = fcS, q = s.hq.trim().toLowerCase();
  return (s.data?.hist || []).filter((h) => (!q || h.q.includes(q)) && (!s.horg || h.org === s.horg) && (!s.hroute || h.path.includes(s.hroute))
    && (!s.hkind || h.kind === s.hkind) && (!s.hsp || h.sp) && (!s.biz || fcBizHit(h.biz, s.biz)));
}
// 한 번의 선정(출자기관 · 사업 · 회차)을 한 덩어리로. 덩어리 안은 직접 건 먼저, 모펀드 경유는 상위 운용기관별로 묶음
function fcHistBlocks(list) {
  const m = new Map();
  list.forEach((h) => { const k = `${h.org}|${h.name}|${h.round}`; if (!m.has(k)) m.set(k, { k, org: h.org, name: h.name, round: h.round, date: '', rows: [] }); const b = m.get(k); b.rows.push(h); if (h.date > b.date) b.date = h.date; });
  const bs = [...m.values()];
  if (fcS.hord === 'org') bs.sort((a, b) => a.org.localeCompare(b.org, 'ko') || a.name.localeCompare(b.name, 'ko') || b.date.localeCompare(a.date));
  else bs.sort((a, b) => b.date.localeCompare(a.date) || a.org.localeCompare(b.org, 'ko'));
  return bs;
}
const FC_HHEAD = '<div class="ipo-head ipo-cols fc-hist"><div>선정 GP</div><div>Co-GP</div><div>분야·리그</div><div>경로</div><div>출자 약정</div><div>결성 목표</div><div>운용사 유형</div><div>발표일</div></div>';
function fcHistRow(h, sub) {
  const gp = h.url ? `<a class="rd-link" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">${esc(h.gp)}</a>` : esc(h.gp);
  return `<div class="ipo-row rd-static fc-hrow${sub ? ' fc-sub' : ''}"><div class="ipo-line ipo-cols fc-hist">
    <div class="ipo-c-name"><span class="rd-strong">${gp}</span>${h.sp ? '<span class="rd-fs-tag rd-sp">우주·방산</span>' : ''}<div class="rd-pair"><span>${esc([h.cogp && `Co-GP ${h.cogp}`, h.field, fcEok(h.amt)].filter(Boolean).join(', ')) || FC_NA}</span></div></div>
    <div class="rd-mh">${fcCell(h.cogp)}</div><div class="rd-mh">${fcCell(h.field)}</div><div class="rd-mh">${fcCell(h.path)}</div>
    <div class="rd-mh">${h.amt != null ? esc(fcEok(h.amt)) : FC_NA}</div><div class="rd-mh">${h.size != null ? esc(fcEok(h.size)) : FC_NA}</div>
    <div class="rd-mh">${fcCell(h.kind)}</div><div class="rd-mh">${h.date ? esc(yymd(h.date)) : FC_NA}</div></div></div>`;
}
function fcHistBlock(b) {
  const direct = b.rows.filter((h) => !fcIsMo(h)), mo = new Map();
  b.rows.filter(fcIsMo).forEach((h) => { if (!mo.has(h.parent)) mo.set(h.parent, []); mo.get(h.parent).push(h); });
  const head = `<div class="rd-grp fc-hgrp"><b>${esc(b.name)}</b>${b.round ? `<span>${esc(b.round)}</span>` : ''}${fcS.hord === 'org' ? '' : `<span>${esc(b.org)}</span>`}<span>${b.date ? esc(yymd(b.date)) : ''}</span><span>${b.rows.length}곳</span></div>`;
  return head + direct.map((h) => fcHistRow(h, false)).join('')
    + [...mo].map(([p, rs]) => `<div class="fc-par"><b>${esc(p)}</b><span>모펀드 운용, 자펀드 GP ${rs.length}곳</span></div>${rs.map((h) => fcHistRow(h, true)).join('')}`).join('');
}
function fcHistBody() {
  const d = fcS.data;
  const sel = d?.scanSel?.length ? `<details class="fc-sel"><summary>원천 게시판의 선정 결과 공고 ${d.scanSel.length}건</summary>${d.scanSel.map((x) => `<div class="fc-selr"><span>${x.date ? esc(yymd(x.date)) : ''}</span>${x.url ? `<a class="rd-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title)}<span class="muted">${esc(x.src)}</span></div>`).join('')}</details>` : '';
  if (!d?.hist.length) return `<div class="empty">선정 이력 자료를 준비하고 있습니다.</div>${sel}`;
  const bs = fcHistBlocks(fcHistList());
  if (!bs.length) return `<div class="empty">조건에 맞는 선정 이력이 없습니다.</div>${sel}`;
  let org = '';
  return FC_HHEAD + bs.map((b) => { const oh = fcS.hord === 'org' && b.org !== org ? (org = b.org, `<div class="fc-org-h">${esc(b.org)}</div>`) : ''; return oh + fcHistBlock(b); }).join('') + sel;
}

function fcBody() {
  if (fcS.err) return `<div class="empty">${esc(fcS.err)}</div>`;
  if (!fcS.data) return '<div class="empty">아직 올라온 출자사업 자료가 없습니다.</div>';
  if (fcS.view === 'plan') return fcPlanBody();
  if (fcS.view === 'scan') return fcScanBody();
  if (fcS.view === 'hist') return fcHistBody();
  const l = fcList();
  return l.length ? FC_HEAD + l.map(fcRow).join('') : '<div class="empty">조건에 맞는 공고가 없습니다.</div>';
}
function fcSummary() {
  const d = fcS.data; if (!d) return '';
  const n = (st) => d.items.filter((x) => x.st === st).length, go = d.items.filter((x) => fcPathOf(x) === 'go' && x.st !== '완료').length;
  return `${d.generated ? `<span>${yymd(d.generated)} 갱신</span>` : ''}<span>공고 <b>${d.items.length}</b></span><span>예정 <b>${n('예정')}</b></span><span>수시 <b>${n('수시')}</b></span><span>우리 길 있음 <b>${go}</b></span>${d.scanAt ? `<span>새 공고 ${esc(d.scanAt.slice(2, 10).replace(/-/g, '.'))} 확인</span>` : ''}${fcS.view === 'hist' && d.hist.length ? `<span>선정 <b>${d.hist.length}</b></span>` : ''}`;
}
const fcSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
function fcFilterHtml() {
  const s = fcS, list = s.view === 'list';
  const search = `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="fc-q" type="search" placeholder="${list ? '기관, 사업, 분야, GP로 검색' : '제목, 원천으로 검색'}" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div></div>`;
  if (s.view === 'plan') return '';
  if (s.view === 'hist') return fcHistFilterHtml();
  if (!list) return search;
  return `${search}<div class="ipo-filter rd-finf"><div class="rd-fing"><span class="rd-finl">상태</span>${fcSeg('fc-st', FC_ST, s.st)}</div>
    <div class="rd-fing"><span class="rd-finl">PEF</span>${fcSeg('fc-pef', FC_YN, s.pef)}</div>
    <div class="rd-fing"><span class="rd-finl">Co-GP</span>${fcSeg('fc-cogp', FC_YN, s.cogp)}</div>
    <div class="rd-fing"><span class="rd-finl">우리 경로</span>${fcSeg('fc-path', FC_PATH, s.path)}</div></div>`;
}
function fcHistFilterHtml() {
  const s = fcS, h = s.data?.hist || [];
  const orgs = [...new Set(h.map((x) => x.org).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const kinds = [...new Set(h.map((x) => x.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  if (s.horg && !orgs.includes(s.horg)) orgs.push(s.horg);
  const sel = (id, label, opts, cur) => `<select class="select" id="${id}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="fc-hq" type="search" placeholder="GP, 운용기관, 사업으로 검색" value="${esc(s.hq)}" autocomplete="off" aria-label="검색"></div>
      ${sel('fc-horg', '출자기관', [['', '출자기관 전체'], ...orgs.map((o) => [o, `${o} ${h.filter((x) => x.org === o).length}`])], s.horg)}${sel('fc-hord', '정렬', FC_HORD, s.hord)}</div>
    <div class="ipo-filter rd-finf">${s.biz ? `<div class="rd-fing"><span class="rd-finl">사업</span>${fcSeg('fc-biz', [['', '전체'], [s.biz, s.bizName || '고른 사업']], s.biz)}</div>` : ''}
      <div class="rd-fing"><span class="rd-finl">경로</span>${fcSeg('fc-hroute', FC_HROUTE, s.hroute)}</div>
      ${kinds.length ? `<div class="rd-fing"><span class="rd-finl">운용사 유형</span>${fcSeg('fc-hkind', [['', '전체'], ...kinds.map((k) => [k, k])], s.hkind)}</div>` : ''}
      <div class="rd-fing"><span class="rd-finl">우주·방산</span>${fcSeg('fc-hsp', [['', '전체'], ['1', '관련']], s.hsp)}</div></div>`;
}
function fcViewHtml() {
  const d = fcS.data;
  const n = { list: d?.items.length, plan: d?.plan.length, scan: d?.hasScan ? d.scan.length : null, hist: d?.hist.length || null };
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
    const hb = t.closest('[data-fc-hist]');
    if (hb) { // 공고 목록 → 그 사업의 지난 선정 이력
      const x = fcS.data?.items.find((y) => y.id === hb.dataset.fcHist); if (!x) return;
      Object.assign(fcS, { view: 'hist', biz: x.biz, bizName: x.name.replace(/\s*\d+\s*(호|차년도|차|기)$/, ''), hq: '', horg: '', hroute: '', hkind: '', hsp: '' });
      fcDraw(true); root.scrollIntoView({ block: 'start' }); return;
    }
    const fb = t.closest('[data-fc-st], [data-fc-pef], [data-fc-cogp], [data-fc-path], [data-fc-hroute], [data-fc-hkind], [data-fc-hsp], [data-fc-biz]');
    if (fb) {
      const k = ['st', 'pef', 'cogp', 'path', 'hroute', 'hkind', 'hsp', 'biz'].find((y) => `fc${y[0].toUpperCase()}${y.slice(1)}` in fb.dataset);
      fcS[k] = fb.dataset[`fc${k[0].toUpperCase()}${k.slice(1)}`];
      root.querySelectorAll(`[data-fc-${k}]`).forEach((b) => { b.classList.toggle('on', b === fb); b.setAttribute('aria-pressed', b === fb); });
      fcDraw(k === 'biz'); return;
    }
    if (t.closest('#fc-ref')) { fcLoad(true).then(() => fcDraw(true)).catch((e) => toast(e.message)); return; }
    if (t.closest('a, input, select, .ipo-detail, .rd-static')) return;
    const row = t.closest('.ipo-row[data-id]'), x = row && fcS.data?.items.find((y) => y.id === row.dataset.id);
    if (!x) return;
    if (fcS.open.has(x.id)) fcS.open.delete(x.id); else fcS.open.add(x.id);
    row.outerHTML = fcRow(x);
  });
  root.addEventListener('input', (ev) => {
    if (ev.target.id === 'fc-q') { fcS.q = ev.target.value; fcDraw(); }
    if (ev.target.id === 'fc-hq') { fcS.hq = ev.target.value; fcDraw(); }
  });
  root.addEventListener('change', (ev) => {
    if (ev.target.id === 'fc-horg') { fcS.horg = ev.target.value; fcDraw(); }
    if (ev.target.id === 'fc-hord') { fcS.hord = ev.target.value === 'org' ? 'org' : 'date'; fcDraw(); }
  });
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
      '선정 이력은 어느 출자기관의 어느 사업을 어느 GP가 가져갔는지 회차별로 묶은 것입니다. 모펀드를 거친 사업은 상위 운용기관 아래에 자펀드 GP가 들여써져 있고, GP 이름으로 찾으면 그 GP가 가져간 사업이 모두 나옵니다. 공고 목록에서 선정 이력을 누르면 그 사업만 보입니다.',
    ]],
  ],
};
