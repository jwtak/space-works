/* SPACE WORKS — 행사·IR: 전시회·박람회·IR·데모데이 일정과 Claude 추천 점수
   매일 아침 PC 작업이 회사 OneDrive SPACE WORKS/data/events.json 을 올린다(이 화면은 읽기만 한다).
   관심·갈게·패스 표시는 data/event_marks.json. 다음 날 채점이 "사용자가 갈게/패스한 행사" 예시로 쓰므로 title·start 를 함께 저장한다.
   갈게 표시는 Outlook 일정을 만들지 않는다(표시만 저장).
   진입점 renderEvents(el) — el(딜소싱 탭 본문 등) 안에만 그린다. el 이 없으면 PAGE.
   app.js 전역(PAGE, $, esc, pad, ymd, parse, today, addDays, diffDays, md, mdw, ico, toast, WD)과 graph.js 의 STORE 를 쓴다. */

const EV_GRADES = ['꼭 가기', '가볼 만', '참고', '제외'];
const EV_GCLS = { '꼭 가기': 'ev-g1', '가볼 만': 'ev-g2', '참고': 'ev-g3', '제외': 'ev-g4' };
const EV_TYPES = ['전시', 'IR', '데모데이', '컨퍼런스', '네트워킹', '기타'];
const EV_INDS = ['소비재', '신기술', '전통산업', '헬스케어·바이오', '스페이스테크', '투자·IPO'];
const EV_REGIONS = ['전체', '수도권', '지방', '해외', '온라인'];
const EV_PERIODS = [['week', '이번 주'], ['month', '이번 달'], ['3m', '3개월'], ['all', '전체']];
const EV_VIEWS = [['list', '목록'], ['cal', '달력'], ['year', '연간']];
const EV_SCORE = [['fit', '적합'], ['people', '사람'], ['format', '형식'], ['access', '접근'], ['rarity', '희소']];
const EV_FG = { grade: '등급', region: '지역', type: '유형', mark: '표시', ind: '산업' };
let evLink = '#events'; // 홈 카드에서 행사·IR 화면으로 갈 주소 (딜소싱 탭 주소로 바꿔 쓸 수 있다)
const EV_TTL = 5 * 60000; // 이 시간 안에 다시 열면 받아 둔 데이터를 그대로 쓴다
const EV_STAR = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l2.3 4.6 5.1.8-3.7 3.6.9 5.1L12 16.2l-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z"/></svg>';
const evDefaults = () => ({ view: 'list', period: '3m', grades: ['꼭 가기', '가볼 만', '참고'], showEx: false, types: [], inds: [], region: '전체', marked: false, showPass: false });

const evState = {
  data: null,                          // { generated, items } — events.json 이 없으면 null
  marks: { items: [], version: null }, // event_marks.json
  at: 0, loading: null,                // 마지막으로 불러온 시각, 진행 중인 불러오기
  f: evLoadFilter(),                   // 필터·보기 (localStorage 에 기억)
  q: '',                               // 검색어 (기억하지 않음)
  open: new Set(),                     // 펼친 행사 id
  month: null, day: null,              // 달력 달(1일)·선택일
  fOpen: false,                        // 휴대폰에서 필터 펼침
  saving: Promise.resolve(),           // 표시 저장 줄 세우기 (eTag 충돌 방지)
  focus: null,                         // 홈에서 누른 행사 id
  el: null,                            // 마지막으로 그린 자리
};

/* ---------- 상태·데이터 ---------- */
function evLoadFilter() {
  const f = evDefaults();
  try {
    const s = JSON.parse(localStorage.getItem('evFilter') || '{}');
    for (const k of Object.keys(f)) if (s[k] !== undefined && typeof s[k] === typeof f[k] && Array.isArray(s[k]) === Array.isArray(f[k])) f[k] = s[k];
  } catch { /* 저장된 값이 없거나 못 읽으면 기본값 */ }
  if (!EV_VIEWS.some(([k]) => k === f.view)) f.view = 'list';
  if (!EV_PERIODS.some(([k]) => k === f.period)) f.period = '3m';
  return f;
}
function evSaveFilter() { try { localStorage.setItem('evFilter', JSON.stringify(evState.f)); } catch { /* 저장 못 해도 이번 화면엔 적용 */ } }

const evMarkList = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []).filter((m) => m && m.id);
const evMarkOf = (id) => evState.marks.items.find((m) => m.id === id);
const evSt = (id) => evMarkOf(id)?.status || '';
const evFind = (id) => evState.data?.items.find((e) => e.id === id);
const evNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function evNorm(j) {
  const items = (Array.isArray(j?.items) ? j.items : []).filter((x) => x && x.id && /^\d{4}-\d{2}-\d{2}/.test(x.start || '')).map((x) => {
    const e = { ...x, extra: x.extra || {}, industry: Array.isArray(x.industry) ? x.industry : [], sources: Array.isArray(x.sources) ? x.sources : [] };
    e.start = x.start.slice(0, 10);
    e.end = String(x.end || '').slice(0, 10) >= e.start ? x.end.slice(0, 10) : e.start;
    e.grade = EV_GRADES.includes(x.grade) ? x.grade : '참고';
    e.type = EV_TYPES.includes(x.type) ? x.type : '기타';
    e.score = Math.round(Number(x.score) || 0);
    e._q = [e.title, e.venue, e.host, e.company, e.category, e.type, e.desc, e.reason, e.tip, ...(e.extra.participants || [])].join(' ').toLowerCase();
    return e;
  });
  return { generated: j?.generated || '', items };
}

function evLoad(force) {
  if (!force && evState.at && Date.now() - evState.at < EV_TTL) return Promise.resolve();
  if (!evState.loading) {
    evState.loading = (async () => {
      const [ev, mk] = await Promise.all([STORE.readText('data/events.json'), STORE.readJSON('event_marks')]);
      let data = null;
      if (ev.text) { try { data = evNorm(JSON.parse(ev.text)); } catch { throw new Error('events.json 형식이 올바르지 않습니다'); } }
      evState.data = data;
      evState.marks = { items: evMarkList(mk.items), version: mk.version };
      evState.at = Date.now();
    })().finally(() => { evState.loading = null; });
  }
  return evState.loading;
}

/* 표시 저장: 차례로 하나씩. 다른 기기에서 먼저 고쳤으면(409) 알리고 다시 읽는다 (app.js save() 와 같은 방식) */
function evSaveMarks() {
  evState.saving = evState.saving.then(async () => {
    try { evState.marks.version = await STORE.writeJSON('event_marks', evState.marks.items, evState.marks.version); }
    catch (e) {
      toast(e.message);
      if (e.status !== 409) return;
      try { const r = await STORE.readJSON('event_marks'); evState.marks = { items: evMarkList(r.items), version: r.version }; } catch { /* 다음 저장 때 다시 */ }
      if ($('#ev-root')) evDraw();
    }
  });
  return evState.saving;
}

function evToggleMark(id, status) {
  const e = evFind(id); if (!e) return;
  const items = evState.marks.items, m = evMarkOf(id);
  if (m && m.status === status) items.splice(items.indexOf(m), 1);
  else if (m) Object.assign(m, { status, at: evNow(), title: e.title, start: e.start });
  else items.push({ id, status, note: '', at: evNow(), title: e.title, start: e.start });
  evRefreshRow(id);
  $('#ev-sum').innerHTML = evSummary();
  evDrawFilter();
  evSaveMarks();
}

function evSetNote(id, v) {
  const m = evMarkOf(id), note = v.trim();
  if (!m || (m.note || '') === note) return;
  m.note = note;
  evSaveMarks();
}

/* ---------- 날짜·필터 ---------- */
const evMon = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const evFirst = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
function evPeriodEnd(p) {
  const n = new Date();
  if (p === 'week') return ymd(addDays(evMon(n), 6));
  if (p === 'month') return ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  if (p === '3m') return ymd(new Date(n.getFullYear(), n.getMonth() + 3, n.getDate()));
  return '9999-12-31';
}
function evYearRange() { const s = evFirst(new Date()); return [ymd(s), ymd(new Date(s.getFullYear(), s.getMonth() + 12, 0))]; }
function evCalRange() { const m = evState.month; return [ymd(m), ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0))]; }

const evKey = (e) => { // 진행 중인 행사는 오늘 자리에, 예상 일정은 그 달 마지막 날 자리에
  if (e.extra.estimated) { const [y, m] = (e.extra.month || e.start).split('-').map(Number); const k = ymd(new Date(y, m, 0)); return k < today() ? today() : k; }
  return e.start < today() && e.end >= today() ? today() : e.start;
};
const evSort = (a, b) => evKey(a).localeCompare(evKey(b)) || b.score - a.score;
const evGradeSort = (a, b) => EV_GRADES.indexOf(a.grade) - EV_GRADES.indexOf(b.grade) || b.score - a.score;

/* 기간을 뺀 필터. noGrade 면 등급 조건도 뺀다(등급별 개수 셀 때) */
function evPass(e, noGrade) {
  const f = evState.f, st = evSt(e.id);
  if (!noGrade && (e.grade === '제외' ? !f.showEx : !f.grades.includes(e.grade))) return false;
  if (st === 'pass' && !f.showPass) return false;
  if (f.marked && !st) return false;
  if (f.types.length && !f.types.includes(e.type)) return false;
  if (f.inds.length && !e.industry.some((i) => f.inds.includes(i))) return false;
  if (f.region !== '전체' && e.region !== f.region) return false;
  const q = evState.q.trim().toLowerCase();
  return !q || e._q.includes(q);
}

/* 지금 보기(목록=기간, 달력=그 달, 연간=12개월의 꼭 가기·가볼 만·연간 시드)에 들어가는가 */
function evInScope(e) {
  const v = evState.f.view;
  if (v === 'cal') { const [s, t] = evCalRange(); return !e.extra.estimated && e.start <= t && e.end >= s; }
  if (v === 'year') { const [s, t] = evYearRange(); return (e.extra.seed || e.extra.estimated || e.grade === '꼭 가기' || e.grade === '가볼 만') && e.start <= t && (e.start >= s || e.end >= today()); }
  return e.end >= today() && e.start <= evPeriodEnd(evState.f.period);
}
const evVisible = () => (evState.data ? evState.data.items.filter((e) => evInScope(e) && evPass(e)).sort(evSort) : []);

function evActiveN() {
  const f = evState.f, d = evDefaults();
  return [[...f.grades].sort().join() !== [...d.grades].sort().join() || f.showEx, f.types.length, f.inds.length, f.region !== '전체', f.marked || f.showPass].filter(Boolean).length;
}
const evIsDefault = () => !evActiveN() && !evState.q.trim();

/* ---------- 조각 ---------- */
const evBadge = (e) => `<span class="ev-badge ${EV_GCLS[e.grade]}">${e.grade}</span>`;
const evRegionTag = (e) => (['지방', '해외', '온라인'].includes(e.region) ? `<span class="ev-tag">${e.region}</span>` : '');
const evRange = (e) => (e.start === e.end ? mdw(e.start) : `${md(e.start)}~${md(e.end)}`);

function evRel(e) {
  if (e.extra.estimated) return '';
  const td = today();
  if (e.start === td) return '오늘';
  if (e.start < td) return e.end >= td ? '진행 중' : '종료';
  const n = diffDays(e.start, td);
  return n === 1 ? '내일' : `D-${n}`;
}
function evDue(e) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(e.reg_deadline || '')) return null;
  const n = diffDays(e.reg_deadline, today());
  return { n, txt: n < 0 ? '마감됨' : n === 0 ? '오늘 마감' : `D-${n}` };
}
function evWhen(e) {
  if (e.extra.estimated) { const [y, m] = (e.extra.month || e.start).split('-'); return `${y}년 ${Number(m)}월 <span class="ev-est">예상</span>`; }
  const y = e.start.slice(0, 4) !== String(new Date().getFullYear()) ? `${e.start.slice(0, 4)}년 ` : '';
  return `${y}${mdw(e.start)}${e.end !== e.start ? ` ~ ${mdw(e.end)}` : ''}${e.time ? ` ${esc(e.time)}` : ''}`;
}

function evDateCell(e) {
  if (e.extra.estimated) return `<span class="ev-d">${Number((e.extra.month || e.start).slice(5, 7))}월</span><span class="ev-d2"><span class="ev-est">예상</span></span>`;
  const rel = evRel(e);
  const d2 = [rel && `<span class="${rel === '오늘' || rel === '진행 중' ? 'now' : ''}">${rel}</span>`, e.time && esc(e.time)].filter(Boolean).join(' · ');
  return `<span class="ev-d">${evRange(e)}</span>${d2 ? `<span class="ev-d2">${d2}</span>` : ''}`;
}

function evActs(st) {
  const b = (k, label, inner) => `<button type="button" class="ev-mk ev-mk-${k}${st === k ? ' on' : ''}" data-mark="${k}" aria-pressed="${st === k}" aria-label="${label}" title="${label}">${inner}</button>`;
  return b('star', '관심', EV_STAR) + b('go', '갈게', '갈게') + b('pass', '패스', '패스');
}

function evRow(e) {
  const st = evSt(e.id), open = evState.open.has(e.id), due = evDue(e);
  const hot = due && due.n >= 0 && due.n <= 7 && e.end >= today()
    ? `<span class="s"><span class="ev-due${due.n <= 3 ? ' hot' : ''}">등록 마감 ${due.n ? `D-${due.n}` : '오늘'}</span></span>` : '';
  const inds = e.industry.map((i) => `<span class="ev-ind">${esc(i)}</span>`).join('');
  return `<div class="ev-row${st ? ` m-${st}` : ''}${open ? ' open' : ''}${e.end < today() ? ' done' : ''}" data-id="${esc(e.id)}">
    <div class="ev-line ev-cols">
      <div class="ev-c-date">${evDateCell(e)}</div>
      <div class="ev-c-grade">${evBadge(e)}<span class="ev-score">${e.score}</span></div>
      <div class="ev-c-main">
        <button type="button" class="ev-ttl" aria-expanded="${open}">${esc(e.title)}</button>
        <div class="ev-meta"><span class="s">${esc(e.type)}</span>${hot}${e.host ? `<span class="s ev-host">${esc(e.host)}</span>` : ''}${e.venue ? `<span class="s ev-mv">${esc(e.venue)}${evRegionTag(e)}</span>` : ''}</div>
        ${inds ? `<div class="ev-inds ev-inds-in">${inds}</div>` : ''}
      </div>
      <div class="ev-c-place"><div class="ev-pv">${esc(e.venue)}</div>${evRegionTag(e)}</div>
      <div class="ev-c-ind"><div class="ev-inds">${inds}</div></div>
      <div class="ev-c-act">${evActs(st)}</div>
    </div>${open ? evDetail(e, st) : ''}</div>`;
}

function evDetail(e, st) {
  const m = evMarkOf(e.id), due = evDue(e), x = e.extra;
  const row = (k, v, cls = '') => (v ? `<dt class="${cls}">${k}</dt><dd class="${cls}">${v}</dd>` : '');
  const sc = e.scores ? EV_SCORE.filter(([k]) => e.scores[k] != null).map(([k, l]) => `${l} ${Number(e.scores[k])}`) : [];
  if (Number(e.penalty)) sc.push(`감점 ${String(e.penalty).replace('-', '−')}`);
  const parts = Array.isArray(x.participants) ? x.participants : [];
  const link = (u, label) => (/^https?:\/\//i.test(u || '') ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">${label}${ico('ext', 'sm')}</a>` : '');
  return `<div class="ev-detail">
    ${e.reason || e.tip ? `<dl class="ev-why">${row('추천 이유', esc(e.reason))}${row('현장 팁', esc(e.tip))}</dl>` : ''}
    ${e.desc ? `<p class="ev-desc">${esc(e.desc)}</p>` : ''}
    <dl class="ev-info">
      ${row('일시', evWhen(e))}
      ${row('장소', esc(e.venue) + (e.region && e.region !== '미상' ? ` · ${esc(e.region)}` : ''))}
      ${row('주최', esc(e.host))}
      ${row('참가 대상', esc(e.audience))}
      ${row('참가비', esc(e.fee))}
      ${row('등록 마감', due ? `${mdw(e.reg_deadline)} · <span class="${due.n >= 0 && due.n <= 3 ? 'ev-due hot' : ''}">${due.txt}</span>` : '')}
      ${row('IR 대상', esc(e.company))}
      ${row('분야', esc(e.category))}
      ${row('산업', esc(e.industry.join(', ')), 'ev-nar')}
      ${row('점수', sc.join(' · '))}
      ${row('출처', esc(e.sources.join(', ')))}
    </dl>
    ${parts.length ? `<details class="ev-parts"><summary>참가사 ${parts.length}곳</summary><p>${parts.map(esc).join(' · ')}</p></details>` : ''}
    <div class="ev-links">${link(e.url, '상세 페이지')}${link(x.homepage, '공식 홈페이지')}${st ? `<input class="input ev-note" data-note placeholder="메모" maxlength="200" value="${esc(m?.note || '')}" aria-label="메모">` : ''}</div>
  </div>`;
}

function evRefreshRow(id) {
  const e = evFind(id); if (!e) return;
  document.querySelectorAll('#ev-body .ev-row').forEach((r) => { if (r.dataset.id === id) r.outerHTML = evRow(e); });
  if (evState.f.view === 'cal') { const g = $('#ev-body .ev-mcal'); if (g) g.outerHTML = evCalGrid(); }
}

function evSummary() {
  const d = evState.data; if (!d) return '';
  const td = today(), we = ymd(addDays(evMon(new Date()), 6)), d30 = ymd(addDays(new Date(), 30));
  const live = d.items.filter((e) => e.end >= td && !e.extra.estimated && evSt(e.id) !== 'pass');
  const wk = live.filter((e) => e.grade === '꼭 가기' && e.start <= we).length;
  const m30 = live.filter((e) => (e.grade === '꼭 가기' || e.grade === '가볼 만') && e.start <= d30).length;
  const g = d.generated ? new Date(d.generated) : null, ok = g && !isNaN(g);
  const gl = ok ? `${ymd(g) === td ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집` : '';
  return `${gl ? `<span class="${Date.now() - g > 36 * 3600000 ? 'ev-stale' : ''}">${gl}</span>` : ''}<span>이번 주 꼭 가기 <b>${wk}</b></span><span>30일 안 가볼 만 이상 <b>${m30}</b></span>`;
}

/* ---------- 필터 ---------- */
function evFgHTML(g, cnt) {
  const f = evState.f;
  const cf = (attr, on, label, cls, n) => `<label class="cf ${cls}"><input type="checkbox" ${attr} ${on ? 'checked' : ''}><i class="box"></i>${label}${n != null ? `<span class="ev-n">${n}</span>` : ''}</label>`;
  const chips = (key, list) => `<button type="button" class="ev-chip${f[key].length ? '' : ' on'}" data-fall="${key}">전체</button>${list.map((v) => {
    const on = f[key].includes(v);
    return `<button type="button" class="ev-chip${on ? ' on' : ''}" data-fmulti="${key}" data-v="${v}" aria-pressed="${on}">${v}</button>`;
  }).join('')}`;
  const body = {
    grade: EV_GRADES.slice(0, 3).map((x) => cf(`data-fgrade="${x}"`, f.grades.includes(x), x, EV_GCLS[x], cnt[x])).join('') + cf('data-fset="showEx"', f.showEx, '제외 포함', 'ev-tg', cnt['제외']),
    region: `<div class="seg">${EV_REGIONS.map((r) => `<button type="button" data-fregion="${r}" class="${f.region === r ? 'on' : ''}">${r}</button>`).join('')}</div>`,
    type: chips('types', EV_TYPES),
    mark: cf('data-fset="marked"', f.marked, '관심·갈게만', 'ev-tg') + cf('data-fset="showPass"', f.showPass, '패스 포함', 'ev-tg'),
    ind: chips('inds', EV_INDS),
  }[g];
  return `<span class="ev-fl">${EV_FG[g]}</span><div class="ev-fc">${body}</div>`;
}

function evDrawFilter() {
  const box = $('#ev-filter'); if (!box) return;
  const cnt = Object.fromEntries(EV_GRADES.map((g) => [g, 0]));
  for (const e of evState.data?.items || []) if (evInScope(e) && evPass(e, true)) cnt[e.grade]++;
  box.querySelectorAll('[data-g]').forEach((el) => { el.innerHTML = evFgHTML(el.dataset.g, cnt); });
  const n = evActiveN(), t = $('#ev-ftoggle');
  t.innerHTML = evState.fOpen ? '필터 접기' : `필터${n ? ` <b>${n}</b>` : ''}`;
  t.setAttribute('aria-expanded', String(evState.fOpen));
  box.classList.toggle('open', evState.fOpen);
}

/* ---------- 보기 ---------- */
function evBarHTML(n) {
  const v = evState.f.view;
  const right = `<div class="ev-right"><span class="ev-cnt"><b>${n}</b>건</span>${evIsDefault() ? '' : '<button class="btn ghost sm" type="button" data-reset>필터 초기화</button>'}</div>`;
  if (v === 'cal') {
    const m = evState.month;
    return `<div class="mcal-nav"><button class="iconbtn" type="button" data-evm="-1" aria-label="이전 달">${ico('left')}</button><span class="ym">${m.getFullYear()}년 ${m.getMonth() + 1}월</span><button class="iconbtn" type="button" data-evm="1" aria-label="다음 달">${ico('right')}</button></div>
      <button class="btn sm" type="button" data-evm="0">오늘</button>${right}`;
  }
  if (v === 'year') {
    const [s, t] = evYearRange();
    return `<span class="ev-yr">${s.slice(0, 7).replace('-', '.')} ~ ${t.slice(0, 7).replace('-', '.')}</span><button class="btn sm" type="button" data-evprint>인쇄</button>${right}`;
  }
  return `<div class="seg ev-period">${EV_PERIODS.map(([k, l]) => `<button type="button" data-fperiod="${k}" class="${evState.f.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>${right}`;
}

const evNoneHTML = () => `<div class="empty">조건에 맞는 행사가 없습니다.${evIsDefault() ? '' : '<div class="ev-retry"><button class="btn sm" type="button" data-reset>필터 초기화</button></div>'}</div>`;

function evListHTML(list) {
  if (!list.length) return evNoneHTML();
  const byWeek = evState.f.period === 'week' || evState.f.period === 'month';
  const thisMon = ymd(evMon(new Date())), year = new Date().getFullYear();
  const groups = [];
  for (const e of list) {
    const k = byWeek ? ymd(evMon(parse(evKey(e)))) : evKey(e).slice(0, 7);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  const head = (k, n) => {
    if (byWeek) {
      const w = diffDays(k, thisMon) / 7, rng = `${md(k)} ~ ${md(ymd(addDays(parse(k), 6)))}`;
      return `<div class="ev-grp"><b>${w === 0 ? '이번 주' : w === 1 ? '다음 주' : rng}</b>${w <= 1 ? `<span>${rng}</span>` : ''}<span>${n}건</span></div>`;
    }
    const [y, m] = k.split('-').map(Number);
    return `<div class="ev-grp"><b>${y === year ? '' : `${y}년 `}${m}월</b><span>${n}건</span></div>`;
  };
  return `<div class="ev-thead ev-cols"><span>날짜</span><span>등급</span><span>행사</span><span class="ev-c-place">장소</span><span class="ev-c-ind">산업</span><span>표시</span></div>
    ${groups.map((g) => head(g.k, g.items.length) + g.items.map(evRow).join('')).join('')}`;
}

function evCalGrid() {
  const m = evState.month, start = addDays(m, -m.getDay());
  const weeks = Math.ceil((m.getDay() + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
  const td = today(), all = evState.data.items.filter((e) => !e.extra.estimated && evPass(e)).sort(evGradeSort);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = ymd(d), its = all.filter((e) => e.start <= k && e.end >= k);
    const cls = [d.getMonth() !== m.getMonth() ? 'other' : '', k === td ? 'today' : '', k === evState.day ? 'sel' : '', d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''].join(' ');
    cells += `<div class="c ${cls}" data-day="${k}"><div class="n">${d.getDate()}</div>${its.slice(0, 3).map((e) => {
      const st = evSt(e.id);
      return `<span class="it ${EV_GCLS[e.grade]}${st === 'go' ? ' ev-go' : st === 'pass' ? ' ev-pass' : ''}" data-evid="${esc(e.id)}" title="${esc(e.title)}">${esc(e.title)}</span>`;
    }).join('')}${its.length > 3 ? `<span class="it more">+${its.length - 3}</span>` : ''}</div>`;
  }
  return `<div class="mcal ev-mcal">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells}</div>`;
}

function evCalHTML() {
  const m = evState.month, k = ymd(m).slice(0, 7), day = evState.day;
  const dl = evState.data.items.filter((e) => !e.extra.estimated && e.start <= day && e.end >= day && evPass(e)).sort(evGradeSort);
  const est = evState.data.items.filter((e) => e.extra.estimated && (e.extra.month || e.start).slice(0, 7) === k && evPass(e)).sort(evGradeSort);
  return `${evCalGrid()}
    <div class="ev-day"><div class="ev-day-h"><b>${mdw(day)}</b><span>${dl.length}건</span></div>${dl.map(evRow).join('') || '<div class="ev-none">행사 없음</div>'}</div>
    ${est.length ? `<div class="ev-day"><div class="ev-day-h"><b>${m.getMonth() + 1}월 예상 일정</b><span>${est.length}건</span></div>${est.map(evRow).join('')}</div>` : ''}`;
}

function evYearHTML(list) {
  const [ys] = evYearRange(), s = parse(ys);
  const mk = (e) => (e.start < ys ? ys : e.start).slice(0, 7);
  const item = (e) => {
    const st = evSt(e.id);
    return `<div class="ev-yi${st === 'pass' ? ' m-pass' : ''}${e.end < today() ? ' done' : ''}">
      <span class="ev-yd">${e.extra.estimated ? '<span class="ev-est">예상</span>' : evRange(e)}</span><span class="ev-yg">${evBadge(e)}</span>
      <span class="ev-yt">${esc(e.title)}<small>${esc(e.type)}</small>${st === 'go' || st === 'star' ? `<span class="ev-mtag">${st === 'go' ? '갈게' : '관심'}</span>` : ''}</span>
      <span class="ev-yv">${esc(e.venue)}${evRegionTag(e)}</span></div>`;
  };
  let html = '';
  for (let i = 0; i < 12; i++) {
    const m = new Date(s.getFullYear(), s.getMonth() + i, 1), key = ymd(m).slice(0, 7);
    const its = list.filter((e) => mk(e) === key).sort((a, b) => evKey(a).localeCompare(evKey(b)) || b.score - a.score);
    html += `<div class="ev-ym"><div class="ev-ym-l"><b>${m.getMonth() + 1}월</b>${i === 0 || m.getMonth() === 0 ? `<span>${m.getFullYear()}</span>` : ''}</div>
      <div class="ev-ym-list">${its.map(item).join('') || '<div class="ev-yi ev-yempty">—</div>'}</div></div>`;
  }
  return `<div class="ev-year"><div class="ev-yhead"><span>월</span><span>날짜</span><span>등급</span><span>행사</span><span>장소</span></div>${html}</div>`;
}

function evDrawMain() {
  const list = evVisible(), v = evState.f.view, bar = $('#ev-bar'), body = $('#ev-body');
  if (!bar || !body) return;
  bar.innerHTML = evBarHTML(list.length);
  body.innerHTML = v === 'cal' ? evCalHTML() : v === 'year' ? evYearHTML(list) : evListHTML(list);
}

function evDraw() {
  const root = $('#ev-root'); if (!root) return;
  const f = evState.f;
  let focus = null;
  if (evState.focus && evFind(evState.focus)) { focus = evState.focus; f.view = 'list'; evState.open.add(focus); }
  evState.focus = null;
  root.querySelectorAll('[data-evview]').forEach((b) => b.classList.toggle('on', b.dataset.evview === f.view));
  $('#ev-sum').innerHTML = evSummary();
  const card = root.querySelector('.ev-card');
  card.classList.toggle('ev-nodata', !evState.data);
  card.dataset.view = f.view;
  if (!evState.data) { $('#ev-body').innerHTML = '<div class="ev-blank">아직 수집 전입니다</div>'; return; }
  if (f.view === 'cal') { evState.month ||= evFirst(new Date()); evState.day ||= today(); }
  evDrawFilter();
  evDrawMain();
  if (focus) {
    const r = [...document.querySelectorAll('#ev-body .ev-row')].find((x) => x.dataset.id === focus);
    if (r) r.scrollIntoView({ block: 'center' });
  }
}
const evRedraw = () => { evDrawFilter(); evDrawMain(); };

/* ---------- 이벤트 (화면 단위 위임: 다시 그리면 같이 사라진다) ---------- */
function evBind(root) {
  let qTimer = null;
  root.addEventListener('click', (ev) => {
    const hit = (s) => ev.target.closest(s), f = evState.f;
    let el;
    if ((el = hit('[data-mark]'))) return evToggleMark(el.closest('[data-id]').dataset.id, el.dataset.mark);
    if (hit('a, input, summary, .ev-detail')) return; // 링크·입력·접기는 기본 동작대로
    if ((el = hit('.ev-line'))) {
      const id = el.closest('[data-id]').dataset.id;
      if (evState.open.has(id)) evState.open.delete(id); else evState.open.add(id);
      return evRefreshRow(id);
    }
    if ((el = hit('[data-evview]'))) { f.view = el.dataset.evview; evSaveFilter(); return evDraw(); }
    if ((el = hit('[data-fperiod]'))) { f.period = el.dataset.fperiod; evSaveFilter(); return evRedraw(); }
    if ((el = hit('[data-fmulti]'))) {
      const k = el.dataset.fmulti, v = el.dataset.v;
      f[k] = f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v];
      evSaveFilter(); return evRedraw();
    }
    if ((el = hit('[data-fall]'))) { f[el.dataset.fall] = []; evSaveFilter(); return evRedraw(); }
    if ((el = hit('[data-fregion]'))) { f.region = el.dataset.fregion; evSaveFilter(); return evRedraw(); }
    if (hit('[data-reset]')) {
      evState.f = { ...evDefaults(), view: f.view, period: f.period }; evState.q = '';
      const q = $('#ev-q'); if (q) q.value = '';
      evSaveFilter(); return evRedraw();
    }
    if (hit('#ev-ftoggle')) { evState.fOpen = !evState.fOpen; return evDrawFilter(); }
    if (hit('#ev-ref') || hit('[data-evretry]')) return evRender(evState.el, true);
    if (hit('[data-evprint]')) return window.print();
    if ((el = hit('[data-evm]'))) {
      const v = Number(el.dataset.evm), n = new Date();
      if (v === 0) { evState.month = evFirst(n); evState.day = today(); }
      else { evState.month = new Date(evState.month.getFullYear(), evState.month.getMonth() + v, 1); evState.day = ymd(evState.month); }
      return evRedraw();
    }
    if ((el = hit('.ev-mcal [data-evid]'))) { evState.day = el.closest('[data-day]').dataset.day; evState.open.add(el.dataset.evid); return evDrawMain(); }
    if ((el = hit('.ev-mcal [data-day]'))) { evState.day = el.dataset.day; return evDrawMain(); }
  });
  root.addEventListener('change', (ev) => {
    const t = ev.target, f = evState.f;
    if (t.dataset.fgrade) { const g = t.dataset.fgrade; f.grades = t.checked ? [...new Set([...f.grades, g])] : f.grades.filter((x) => x !== g); }
    else if (t.dataset.fset) f[t.dataset.fset] = t.checked;
    else if (t.hasAttribute('data-note')) return evSetNote(t.closest('[data-id]').dataset.id, t.value);
    else return;
    evSaveFilter(); evRedraw();
  });
  root.addEventListener('input', (ev) => {
    if (ev.target.id !== 'ev-q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { evState.q = ev.target.value; evRedraw(); }, 150);
  });
}

/* ---------- 진입점 ---------- */
/* el: 그릴 자리(딜소싱 탭 본문 등). 없으면 PAGE. el 안만 바꾸고 바깥(탭 줄 등)은 건드리지 않는다 */
function renderEvents(el) { return evRender(el, false); }

async function evRender(el, force) {
  const host = el && el.nodeType === 1 ? el : PAGE, v = evState.f.view;
  evState.el = host;
  host.innerHTML = `<div class="ev-page" id="ev-root">
    <div class="page-head">${host === PAGE ? '<h1>행사·IR</h1>' : ''}<div class="ev-sum" id="ev-sum"></div>
      <div class="tools"><div class="seg">${EV_VIEWS.map(([k, l]) => `<button type="button" data-evview="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn ghost" type="button" id="ev-ref">${ico('refresh', 'sm')}새로고침</button></div></div>
    <section class="card ev-card" data-view="${v}">
      <div class="ev-filter" id="ev-filter">
        <div class="ev-fsearch"><span class="ev-sic">${ico('search', 'sm')}</span><input class="input" id="ev-q" type="search" placeholder="행사·장소·회사 검색" value="${esc(evState.q)}" autocomplete="off" aria-label="검색"></div>
        <button class="btn ev-ftoggle" type="button" id="ev-ftoggle" aria-controls="ev-filter" aria-expanded="false">필터</button>
        ${Object.keys(EV_FG).map((g) => `<div class="ev-fg" data-g="${g}"></div>`).join('')}
      </div>
      <div class="ev-bar" id="ev-bar"></div>
      <div class="ev-body" id="ev-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  const root = $('#ev-root', host);
  evBind(root);
  try { await evLoad(force); }
  catch (e) {
    if (!root.isConnected) return;
    root.querySelector('.ev-card').classList.add('ev-nodata');
    root.querySelector('#ev-body').innerHTML = `<div class="empty">${esc(e.message)}<div class="ev-retry"><button class="btn sm" type="button" data-evretry>다시 시도</button></div></div>`;
    return;
  }
  if (root.isConnected) evDraw(); // 불러오는 사이 다른 화면·탭으로 옮겼으면 그리지 않는다
}

/* 홈 카드: 2주 안 꼭 가기·가볼 만 최대 5건. events.json 이 없거나 못 읽으면 '' */
async function eventsHomeBlock() {
  try { await evLoad(); } catch { return ''; }
  const d = evState.data; if (!d) return '';
  const td = today(), lim = ymd(addDays(new Date(), 14));
  const all = d.items.filter((e) => (e.grade === '꼭 가기' || e.grade === '가볼 만') && !e.extra.estimated && e.end >= td && e.start <= lim && evSt(e.id) !== 'pass').sort(evSort);
  const li = (e) => {
    const st = evSt(e.id);
    return `<li class="click" data-ev-go="${esc(e.id)}"><span class="time">${evRange(e)}</span>
      <div class="t"><div class="ttl">${esc(e.title)}</div><div class="meta">${[evRel(e), e.venue].filter(Boolean).map(esc).join(' · ')}</div></div>
      ${st === 'go' || st === 'star' ? `<span class="ev-mtag">${st === 'go' ? '갈게' : '관심'}</span>` : ''}${evBadge(e)}</li>`;
  };
  return `<section class="card ev-home">
    <div class="card-head"><h2>다가오는 행사 <span class="n">${all.length}</span></h2><a class="btn sm act" href="${evLink}">행사·IR 전체 보기</a></div>
    <div class="card-body">${all.length ? `<ul class="list">${all.slice(0, 5).map(li).join('')}</ul>` : '<div class="empty">2주 안에 갈 만한 행사가 없습니다.</div>'}</div></section>`;
}

/* 홈 카드에서 행사를 누르면 행사·IR 목록에서 그 행사를 펼쳐 보여 준다 */
document.addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-ev-go]'); if (!li) return;
  evState.focus = li.dataset.evGo;
  if ($('#ev-root')?.isConnected) evDraw(); else location.hash = evLink;
});
