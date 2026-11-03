/* SPACE WORKS — 딜소싱 › 행사·IR: 전시회·박람회·IR·데모데이 일정과 Claude 추천 점수
   매일 아침 PC 작업이 회사 OneDrive SPACE WORKS/data/events.json 을 올린다(이 화면은 읽기만 한다).
   관심(☆)·숨기기 표시는 data/event_marks.json (status 'star' | 'pass'). 다음 날 채점이 사용자 반응 예시로 쓰므로 title·start 를 함께 저장한다.
   진입점 renderEvents(el) — el(딜소싱 탭 본문) 안에만 그린다. el 이 없으면 PAGE.
   app.js 전역(PAGE, $, esc, pad, ymd, parse, today, addDays, diffDays, md, mdw, ico, toast, WD)과 graph.js 의 STORE 를 쓴다. */

const EV_TYPES = ['전시', 'IR', '데모데이', '컨퍼런스', '네트워킹', '기타'];
const EV_INDS = ['소비재', '신기술', '전통산업', '헬스케어·바이오', '스페이스테크', '투자·IPO'];
const EV_REGIONS = ['수도권', '지방', '해외', '온라인'];
const EV_PERIODS = [['week', '이번 주'], ['month', '이번 달'], ['3m', '3개월'], ['6m', '6개월'], ['all', '전체 기간']];
const EV_MINS = [[0, '모든 점수'], [40, '40점 이상'], [60, '60점 이상'], [80, '80점 이상']];
const EV_SHOWS = [['', '모든 행사'], ['star', '관심'], ['pass', '숨긴 행사']];
const EV_VIEWS = [['list', '목록'], ['cal', '달력'], ['year', '연간']];
const EV_SCORE = [['fit', '산업'], ['people', '사람'], ['format', '형식'], ['access', '참석'], ['rarity', '희소성']];
let evLink = '#events'; // 홈 카드에서 행사·IR 화면으로 갈 주소 (딜소싱에서는 '#deals')
const EV_TTL = 5 * 60000;
const EV_STAR = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l2.3 4.6 5.1.8-3.7 3.6.9 5.1L12 16.2l-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z"/></svg>';
const EV_HIDE = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="12" cy="12" r="2.5"/><path d="M4.5 4.5l15 15"/></svg>';
const EV_SHOW = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="12" cy="12" r="2.5"/></svg>';
const evDefaults = () => ({ view: 'list', period: '3m', type: '', ind: '', region: '', min: 40, show: '', sort: 'date' });

const evState = {
  data: null, marks: { items: [], version: null }, at: 0, loading: null,
  f: evLoadFilter(), q: '', open: new Set(), month: null, day: null,
  saving: Promise.resolve(), focus: null, el: null,
};

/* ---------- 상태·데이터 ---------- */
function evLoadFilter() {
  const f = evDefaults();
  try {
    const s = JSON.parse(localStorage.getItem('evFilter2') || '{}');
    for (const k of Object.keys(f)) if (s[k] !== undefined && typeof s[k] === typeof f[k]) f[k] = s[k];
  } catch { /* 기본값 */ }
  if (!EV_VIEWS.some(([k]) => k === f.view)) f.view = 'list';
  if (!EV_PERIODS.some(([k]) => k === f.period)) f.period = '3m';
  return f;
}
function evSaveFilter() { try { localStorage.setItem('evFilter2', JSON.stringify(evState.f)); } catch { /* 이번 화면엔 적용 */ } }

const evMarkList = (v) => (Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []).filter((m) => m && m.id);
const evMarkOf = (id) => evState.marks.items.find((m) => m.id === id);
const evSt = (id) => { const s = evMarkOf(id)?.status || ''; return s === 'go' ? 'star' : s; }; // 예전 '갈게'는 관심으로
const evFind = (id) => evState.data?.items.find((e) => e.id === id);
const evNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function evNorm(j) {
  const items = (Array.isArray(j?.items) ? j.items : []).filter((x) => x && x.id && /^\d{4}-\d{2}-\d{2}/.test(x.start || '')).map((x) => {
    const e = { ...x, extra: x.extra || {}, industry: Array.isArray(x.industry) ? x.industry : [], sources: Array.isArray(x.sources) ? x.sources : [] };
    e.start = x.start.slice(0, 10);
    e.end = String(x.end || '').slice(0, 10) >= e.start ? x.end.slice(0, 10) : e.start;
    e.type = EV_TYPES.includes(x.type) ? x.type : '기타';
    e.score = Math.round(Number(x.score) || 0);
    e._q = [e.title, e.venue, e.host, e.company, e.category, e.type, e.desc, e.reason, ...(e.extra.participants || [])].join(' ').toLowerCase();
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
      try { const r = await STORE.readJSON('event_marks'); evState.marks = { items: evMarkList(r.items), version: r.version }; } catch { /* 다음 저장 때 */ }
      if ($('#ev-root')) evDrawMain();
    }
  });
  return evState.saving;
}

function evToggleMark(id, status) {
  const e = evFind(id); if (!e) return;
  const items = evState.marks.items, m = evMarkOf(id);
  if (m && evSt(id) === status) items.splice(items.indexOf(m), 1);
  else if (m) Object.assign(m, { status, at: evNow(), title: e.title, start: e.start });
  else items.push({ id, status, note: '', at: evNow(), title: e.title, start: e.start });
  if (evPass(e)) evRefreshRow(id); // 지금 조건에서 빠지면(숨김, 관심 해제 등) 목록을 다시 그린다
  else { evState.open.delete(id); evDrawMain(); }
  evSaveMarks();
}

/* ---------- 날짜·필터 ---------- */
const evMon = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const evFirst = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
function evPeriodEnd(p) {
  const n = new Date();
  if (p === 'week') return ymd(addDays(evMon(n), 6));
  if (p === 'month') return ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  if (p === '3m' || p === '6m') return ymd(new Date(n.getFullYear(), n.getMonth() + (p === '3m' ? 3 : 6), n.getDate()));
  return '9999-12-31';
}
function evYearRange() { const s = evFirst(new Date()); return [ymd(s), ymd(new Date(s.getFullYear(), s.getMonth() + 12, 0))]; }
function evCalRange() { const m = evState.month; return [ymd(m), ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0))]; }

const evKey = (e) => { // 진행 중인 행사는 오늘 자리에, 예상 일정은 그 달 마지막 날 자리에
  if (e.extra.estimated) { const [y, m] = (e.extra.month || e.start).split('-').map(Number); const k = ymd(new Date(y, m, 0)); return k < today() ? today() : k; }
  return e.start < today() && e.end >= today() ? today() : e.start;
};
const evByDate = (a, b) => evKey(a).localeCompare(evKey(b)) || b.score - a.score;
const evByScore = (a, b) => b.score - a.score || evKey(a).localeCompare(evKey(b));
const evTier = (s) => (s >= 80 ? 1 : s >= 60 ? 2 : 3);

function evPass(e) {
  const f = evState.f, st = evSt(e.id);
  if (f.show === 'pass' ? st !== 'pass' : st === 'pass') return false;
  if (f.show === 'star' && st !== 'star') return false;
  if (e.score < f.min) return false;
  if (f.type && e.type !== f.type) return false;
  if (f.ind && !e.industry.includes(f.ind)) return false;
  if (f.region && e.region !== f.region) return false;
  const q = evState.q.trim().toLowerCase();
  return !q || e._q.includes(q);
}

function evInScope(e) {
  const v = evState.f.view;
  if (v === 'cal') { const [s, t] = evCalRange(); return !e.extra.estimated && e.start <= t && e.end >= s; }
  if (v === 'year') { const [s, t] = evYearRange(); return (e.score >= 60 || e.extra.seed) && e.start <= t && (e.start >= s || e.end >= today()); }
  return e.end >= today() && e.start <= evPeriodEnd(evState.f.period);
}
const evVisible = () => (evState.data ? evState.data.items.filter((e) => evInScope(e) && evPass(e)).sort(evState.f.sort === 'score' && evState.f.view === 'list' ? evByScore : evByDate) : []);
const evIsDefault = () => { const f = evState.f, d = evDefaults(); return ['type', 'ind', 'region', 'min', 'show'].every((k) => f[k] === d[k]) && !evState.q.trim(); };

/* ---------- 조각 ---------- */
const evRange = (e) => (e.start === e.end ? mdw(e.start) : `${md(e.start)}~${md(e.end)}`);
const evScore = (e) => {
  const tip = e.scores ? EV_SCORE.filter(([k]) => e.scores[k] != null).map(([k, l]) => `${l} ${e.scores[k]}`).concat(Number(e.penalty) ? [`지역 ${e.penalty}`] : []).join(' · ') : '';
  return `<span class="ev-sc t${evTier(e.score)}"${tip ? ` title="${esc(tip)}"` : ''}>${e.score}</span>`;
};
const evAway = (e) => (['지방', '해외', '온라인'].includes(e.region) ? e.region : '');

function evRel(e) {
  if (e.extra.estimated) return '';
  const td = today();
  if (e.start === td) return '오늘';
  if (e.start < td) return e.end >= td ? '진행 중' : '';
  const n = diffDays(e.start, td);
  return n === 1 ? '내일' : n <= 14 ? `D-${n}` : '';
}
function evDue(e) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(e.reg_deadline || '')) return null;
  const n = diffDays(e.reg_deadline, today());
  return { n, txt: n < 0 ? '마감' : n === 0 ? '오늘 마감' : `D-${n}` };
}
function evWhen(e) {
  if (e.extra.estimated) { const [y, m] = (e.extra.month || e.start).split('-'); return `${y}년 ${Number(m)}월 예상`; }
  const y = e.start.slice(0, 4) !== String(new Date().getFullYear()) ? `${e.start.slice(0, 4)}년 ` : '';
  return `${y}${mdw(e.start)}${e.end !== e.start ? ` ~ ${mdw(e.end)}` : ''}${e.time ? ` ${esc(e.time)}` : ''}`;
}

function evDateCell(e) {
  if (e.extra.estimated) return `<span class="ev-d">${Number((e.extra.month || e.start).slice(5, 7))}월</span><span class="ev-d2">예상</span>`;
  const rel = evRel(e), due = evDue(e);
  const d2 = [rel && `<span class="${rel === '오늘' || rel === '진행 중' ? 'now' : ''}">${rel}</span>`, e.time && esc(e.time)].filter(Boolean).join(' · ');
  return `<span class="ev-d">${evRange(e)}</span>${d2 ? `<span class="ev-d2">${d2}</span>` : ''}${due && due.n >= 0 && due.n <= 7 && e.end >= today() ? `<span class="ev-d2 ev-due">등록 ${due.txt}</span>` : ''}`;
}

function evRow(e) {
  const st = evSt(e.id), open = evState.open.has(e.id), away = evAway(e);
  return `<div class="ev-row${st ? ` m-${st}` : ''}${open ? ' open' : ''}" data-id="${esc(e.id)}">
    <div class="ev-line ev-cols">
      <button type="button" class="ev-star${st === 'star' ? ' on' : ''}" data-mark="star" aria-pressed="${st === 'star'}" aria-label="관심">${EV_STAR}</button>
      <div class="ev-c-date">${evDateCell(e)}</div>
      <div class="ev-c-sc">${evScore(e)}</div>
      <div class="ev-c-main"><button type="button" class="ev-ttl" aria-expanded="${open}">${esc(e.title)}</button>
        <div class="ev-sub">${[e.type, e.host].filter(Boolean).map(esc).join(' · ')}</div>
        <div class="ev-sub ev-mplace">${esc([e.venue, away].filter(Boolean).join(' · '))}</div></div>
      <div class="ev-c-place"><div class="ev-pv">${esc(e.venue)}</div>${away ? `<div class="ev-sub">${away}</div>` : ''}</div>
      <div class="ev-c-ind">${esc(e.industry.join(' · '))}</div>
      <button type="button" class="iconbtn ev-hide" data-mark="pass" aria-label="${st === 'pass' ? '다시 보이기' : '숨기기'}" title="${st === 'pass' ? '다시 보이기' : '숨기기'}">${st === 'pass' ? EV_SHOW : EV_HIDE}</button>
    </div>${open ? evDetail(e) : ''}</div>`;
}

function evDetail(e) {
  const due = evDue(e), x = e.extra, parts = Array.isArray(x.participants) ? x.participants : [];
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
  const link = (u, label) => (/^https?:\/\//i.test(u || '') ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">${label}${ico('ext', 'sm')}</a>` : '');
  const links = link(e.url, '상세 페이지') + link(x.homepage, '홈페이지');
  return `<div class="ev-detail"><dl>
      ${row('추천 이유', esc(e.reason))}
      ${row('현장 팁', esc(e.tip))}
      ${row('소개', esc(e.desc))}
      ${row('일시', evWhen(e))}
      ${row('장소', esc([e.venue, e.region !== '미상' && e.region].filter(Boolean).join(' · ')))}
      ${row('주최', esc(e.host))}
      ${row('대상', esc(e.audience))}
      ${row('참가비', esc(e.fee))}
      ${row('등록 마감', due ? `${mdw(e.reg_deadline)} · ${due.txt}` : '')}
      ${row('IR 회사', esc(e.company))}
      ${row('참가사', parts.length ? `${parts.length}곳 · ${parts.map(esc).join(', ')}` : '')}
      ${row('출처', esc(e.sources.join(', ')))}
    </dl>${links ? `<div class="ev-links">${links}</div>` : ''}</div>`;
}

function evRefreshRow(id) {
  const e = evFind(id); if (!e) return;
  document.querySelectorAll('#ev-body .ev-row').forEach((r) => { if (r.dataset.id === id) r.outerHTML = evRow(e); });
  if (evState.f.view === 'cal') { const g = $('#ev-body .ev-mcal'); if (g) g.outerHTML = evCalGrid(); }
}

/* ---------- 필터 줄 ---------- */
function evFilterHTML() {
  const f = evState.f, v = f.view;
  const sel = (key, opts, label, allLabel) => `<select class="select" data-f="${key}" aria-label="${label}">${allLabel ? `<option value="">${allLabel}</option>` : ''}${opts.map((o) => {
    const [val, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${val}"${String(f[key]) === String(val) ? ' selected' : ''}>${l}</option>`;
  }).join('')}</select>`;
  return `<div class="ev-search"><span class="ev-sic">${ico('search', 'sm')}</span><input class="input" id="ev-q" type="search" placeholder="행사·장소·회사 검색" value="${esc(evState.q)}" autocomplete="off" aria-label="검색"></div>
    <div class="ev-sels">${v === 'list' ? sel('period', EV_PERIODS, '기간') : ''}${sel('type', EV_TYPES, '유형', '모든 유형')}${sel('ind', EV_INDS, '산업', '모든 산업')}${sel('region', EV_REGIONS, '지역', '모든 지역')}${sel('min', EV_MINS, '점수')}${sel('show', EV_SHOWS, '표시')}${v === 'list' ? sel('sort', [['date', '날짜순'], ['score', '점수순']], '정렬').replace('class="select"', 'class="select ev-msort"') : ''}</div>
    <span class="ev-r" id="ev-cnt"></span>`;
}

/* ---------- 보기 ---------- */
function evBarHTML() {
  const v = evState.f.view;
  if (v === 'cal') {
    const m = evState.month;
    return `<div class="ev-bar"><div class="mcal-nav"><button class="iconbtn" type="button" data-evm="-1" aria-label="이전 달">${ico('left')}</button><span class="ym">${m.getFullYear()}년 ${m.getMonth() + 1}월</span><button class="iconbtn" type="button" data-evm="1" aria-label="다음 달">${ico('right')}</button></div>
      <button class="btn sm" type="button" data-evm="0">오늘</button></div>`;
  }
  if (v === 'year') {
    const [s, t] = evYearRange();
    return `<div class="ev-bar"><span class="ev-yr">${s.slice(0, 7).replace('-', '.')} ~ ${t.slice(0, 7).replace('-', '.')}</span><button class="btn sm" type="button" data-evprint>인쇄</button></div>`;
  }
  return '';
}

const evNoneHTML = () => `<div class="empty">조건에 맞는 행사가 없습니다.${evIsDefault() ? '' : '<div class="ev-retry"><button class="btn sm" type="button" data-reset>초기화</button></div>'}</div>`;

function evHeadHTML() {
  const arrow = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
  const s = evState.f.sort, h = (k, l) => `<button type="button" class="ev-sort${s === k ? ' on' : ''}" data-sort="${k}" aria-pressed="${s === k}">${l}${s === k ? arrow : ''}</button>`;
  return `<div class="ev-head ev-cols"><span></span>${h('date', '날짜')}${h('score', '점수')}<span>행사</span><span class="ev-c-place">장소</span><span class="ev-c-ind">산업</span><span></span></div>`;
}

function evListHTML(list) {
  if (!list.length) return evHeadHTML() + evNoneHTML();
  if (evState.f.sort === 'score') return evHeadHTML() + list.map(evRow).join('');
  const year = new Date().getFullYear(), groups = [];
  for (const e of list) {
    const k = evKey(e).slice(0, 7);
    if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, items: [] });
    groups[groups.length - 1].items.push(e);
  }
  return evHeadHTML() + groups.map((g) => {
    const [y, m] = g.k.split('-').map(Number);
    return `<div class="ev-grp">${y === year ? '' : `${y}년 `}${m}월<span>${g.items.length}</span></div>${g.items.map(evRow).join('')}`;
  }).join('');
}

function evCalGrid() {
  const m = evState.month, start = addDays(m, -m.getDay());
  const weeks = Math.ceil((m.getDay() + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
  const td = today(), all = evState.data.items.filter((e) => !e.extra.estimated && evPass(e)).sort(evByScore);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = ymd(d), its = all.filter((e) => e.start <= k && e.end >= k);
    const cls = [d.getMonth() !== m.getMonth() ? 'other' : '', k === td ? 'today' : '', k === evState.day ? 'sel' : '', d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''].join(' ');
    cells += `<div class="c ${cls}" data-day="${k}"><div class="n">${d.getDate()}</div>${its.slice(0, 3).map((e) => `<span class="it ev-t${evTier(e.score)}${evSt(e.id) === 'star' ? ' ev-on' : ''}" data-evid="${esc(e.id)}" title="${esc(`${e.score} ${e.title}`)}">${esc(e.title)}</span>`).join('')}${its.length > 3 ? `<span class="it more">+${its.length - 3}</span>` : ''}</div>`;
  }
  return `<div class="mcal ev-mcal">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells}</div>`;
}

function evCalHTML() {
  const m = evState.month, k = ymd(m).slice(0, 7), day = evState.day;
  const dl = evState.data.items.filter((e) => !e.extra.estimated && e.start <= day && e.end >= day && evPass(e)).sort(evByScore);
  const est = evState.data.items.filter((e) => e.extra.estimated && (e.extra.month || e.start).slice(0, 7) === k && evPass(e)).sort(evByScore);
  return `${evCalGrid()}
    <div class="ev-day"><div class="ev-grp">${mdw(day)}<span>${dl.length}</span></div>${dl.map(evRow).join('') || '<div class="ev-none">행사 없음</div>'}</div>
    ${est.length ? `<div class="ev-day"><div class="ev-grp">${m.getMonth() + 1}월 예상<span>${est.length}</span></div>${est.map(evRow).join('')}</div>` : ''}`;
}

function evYearHTML(list) {
  const [ys] = evYearRange(), s = parse(ys);
  const mk = (e) => (e.start < ys ? ys : e.start).slice(0, 7);
  const item = (e) => `<div class="ev-yi${evSt(e.id) === 'star' ? ' m-star' : ''}" data-yid="${esc(e.id)}">
      <span class="ev-yd">${e.extra.estimated ? '예상' : evRange(e)}</span><span>${evScore(e)}</span>
      <span class="ev-yt">${evSt(e.id) === 'star' ? `<span class="ev-ystar">${EV_STAR}</span>` : ''}${esc(e.title)}</span>
      <span class="ev-yv">${esc([e.venue, evAway(e)].filter(Boolean).join(' · '))}</span></div>`;
  let html = '';
  for (let i = 0; i < 12; i++) {
    const m = new Date(s.getFullYear(), s.getMonth() + i, 1), key = ymd(m).slice(0, 7);
    const its = list.filter((e) => mk(e) === key);
    html += `<div class="ev-ym"><div class="ev-ym-l">${m.getMonth() === 0 || i === 0 ? `${m.getFullYear()}.` : ''}${m.getMonth() + 1}월</div>
      <div>${its.map(item).join('') || '<div class="ev-yi ev-yempty">—</div>'}</div></div>`;
  }
  return `<div class="ev-year"><div class="ev-yhead"><span>월</span><span>날짜</span><span>점수</span><span>행사</span><span>장소</span></div>${html}</div>`;
}

function evDrawMain() {
  const list = evVisible(), v = evState.f.view, body = $('#ev-body');
  if (!body) return;
  $('#ev-barwrap').innerHTML = evBarHTML();
  const c = $('#ev-cnt');
  if (c) c.innerHTML = `${evIsDefault() ? '' : '<button class="btn ghost sm" type="button" data-reset>초기화</button>'}<span class="ev-cnt"><b>${list.length}</b>건</span>`;
  body.innerHTML = v === 'cal' ? evCalHTML() : v === 'year' ? evYearHTML(list) : evListHTML(list);
}

function evDraw() {
  const root = $('#ev-root'); if (!root) return;
  const f = evState.f;
  let focus = null;
  if (evState.focus && evFind(evState.focus)) { focus = evState.focus; f.view = 'list'; evState.open.add(focus); }
  evState.focus = null;
  root.querySelectorAll('[data-evview]').forEach((b) => b.classList.toggle('on', b.dataset.evview === f.view));
  const g = evState.data?.generated ? new Date(evState.data.generated) : null;
  const ref = $('#ev-ref');
  if (ref && g && !isNaN(g)) ref.title = `${g.getMonth() + 1}/${g.getDate()} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집`;
  if (!evState.data) { $('#ev-card').innerHTML = '<div class="ev-blank">아직 수집 전입니다</div>'; return; }
  if (f.view === 'cal') { evState.month ||= evFirst(new Date()); evState.day ||= today(); }
  $('#ev-filter').innerHTML = evFilterHTML();
  evDrawMain();
  if (focus) {
    const r = [...document.querySelectorAll('#ev-body .ev-row')].find((x) => x.dataset.id === focus);
    if (r) r.scrollIntoView({ block: 'center' });
  }
}

/* ---------- 이벤트 ---------- */
function evBind(root) {
  let qTimer = null;
  root.addEventListener('click', (ev) => {
    const hit = (s) => ev.target.closest(s), f = evState.f;
    let el;
    if ((el = hit('[data-mark]'))) return evToggleMark(el.closest('[data-id]').dataset.id, el.dataset.mark);
    if (hit('a, input, select, .ev-detail')) return;
    if ((el = hit('.ev-line'))) {
      const id = el.closest('[data-id]').dataset.id;
      if (evState.open.has(id)) evState.open.delete(id); else evState.open.add(id);
      return evRefreshRow(id);
    }
    if ((el = hit('[data-evview]'))) { f.view = el.dataset.evview; evSaveFilter(); return evDraw(); }
    if ((el = hit('[data-sort]'))) { f.sort = el.dataset.sort; evSaveFilter(); return evDrawMain(); }
    if (hit('[data-reset]')) {
      evState.f = { ...evDefaults(), view: f.view, period: f.period, sort: f.sort }; evState.q = '';
      evSaveFilter(); return evDraw();
    }
    if (hit('#ev-ref') || hit('[data-evretry]')) return evRender(evState.el, true);
    if (hit('[data-evprint]')) return window.print();
    if ((el = hit('[data-evm]'))) {
      const v = Number(el.dataset.evm), n = new Date();
      if (v === 0) { evState.month = evFirst(n); evState.day = today(); }
      else { evState.month = new Date(evState.month.getFullYear(), evState.month.getMonth() + v, 1); evState.day = ymd(evState.month); }
      return evDrawMain();
    }
    if ((el = hit('.ev-mcal [data-evid]'))) { evState.day = el.closest('[data-day]').dataset.day; evState.open.add(el.dataset.evid); return evDrawMain(); }
    if ((el = hit('.ev-mcal [data-day]'))) { evState.day = el.dataset.day; return evDrawMain(); }
    if ((el = hit('[data-yid]'))) { evState.focus = el.dataset.yid; return evDraw(); }
  });
  root.addEventListener('change', (ev) => {
    const t = ev.target, k = t.dataset.f; if (!k) return;
    evState.f[k] = k === 'min' ? Number(t.value) : t.value;
    evSaveFilter(); evDrawMain();
  });
  root.addEventListener('input', (ev) => {
    if (ev.target.id !== 'ev-q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { evState.q = ev.target.value; evDrawMain(); }, 150);
  });
}

/* ---------- 진입점 ---------- */
function renderEvents(el) { return evRender(el, false); }

async function evRender(el, force) {
  const host = el && el.nodeType === 1 ? el : PAGE, v = evState.f.view;
  evState.el = host;
  host.innerHTML = `<div class="ev-page" id="ev-root">
    <div class="ev-top">${host === PAGE ? '<h1>행사·IR</h1>' : ''}<div class="seg">${EV_VIEWS.map(([k, l]) => `<button type="button" data-evview="${k}" class="${v === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn ghost" type="button" id="ev-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ev-card" id="ev-card">
      <div class="ev-filter" id="ev-filter"></div>
      <div id="ev-barwrap"></div>
      <div class="ev-body" id="ev-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  const root = $('#ev-root', host);
  evBind(root);
  try { await evLoad(force); }
  catch (e) {
    if (!root.isConnected) return;
    root.querySelector('#ev-body').innerHTML = `<div class="empty">${esc(e.message)}<div class="ev-retry"><button class="btn sm" type="button" data-evretry>다시 시도</button></div></div>`;
    return;
  }
  if (root.isConnected) evDraw();
}

/* 홈 카드: 2주 안 60점 이상 최대 5건. events.json 이 없거나 못 읽으면 '' */
async function eventsHomeBlock() {
  try { await evLoad(); } catch { return ''; }
  const d = evState.data; if (!d) return '';
  const td = today(), lim = ymd(addDays(new Date(), 14));
  const all = d.items.filter((e) => e.score >= 60 && !e.extra.estimated && e.end >= td && e.start <= lim && evSt(e.id) !== 'pass').sort(evByDate);
  const li = (e) => `<li class="click" data-ev-go="${esc(e.id)}"><span class="time">${evRange(e)}</span>
      <div class="t"><div class="ttl">${esc(e.title)}</div><div class="meta">${[evRel(e), e.venue].filter(Boolean).map(esc).join(' · ')}</div></div>${evScore(e)}</li>`;
  return `<section class="card ev-home">
    <div class="card-head"><h2>다가오는 행사 <span class="n">${all.length}</span></h2><a class="btn sm act" href="${evLink}">전체 보기</a></div>
    <div class="card-body">${all.length ? `<ul class="list">${all.slice(0, 5).map(li).join('')}</ul>` : '<div class="empty">2주 안에 갈 만한 행사가 없습니다.</div>'}</div></section>`;
}

document.addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-ev-go]'); if (!li) return;
  evState.focus = li.dataset.evGo;
  if ($('#ev-root')?.isConnected) evDraw(); else location.hash = evLink;
});
