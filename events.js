/* SPACE WORKS — 딜소싱 › 행사·IR: 전시회·박람회·IR·데모데이 일정과 Claude 추천 점수
   한 화면: 필터 → 월 달력 → 1년치 목록. 필터는 달력·목록에 같이 걸린다.
   매일 아침 PC 작업이 회사 OneDrive SPACE WORKS/data/events.json 을 올린다(이 화면은 읽기만 한다).
   관심(☆)·숨기기 표시는 data/event_marks.json (status 'star' | 'pass'). 다음 날 채점이 사용자 반응 예시로 쓰므로 title·start 를 함께 저장한다.
   진입점 renderEvents(el) — el(딜소싱 탭 본문) 안에만 그린다. el 이 없으면 PAGE.
   app.js 전역(PAGE, $, esc, pad, ymd, parse, today, addDays, diffDays, md, mdw, ico, toast, WD)과 graph.js 의 STORE 를 쓴다. */

const EV_TYPES = ['전시', 'IR', '데모데이', '컨퍼런스', '네트워킹', '기타'];
const EV_INDS = ['소비재', '신기술', '전통산업', '헬스케어·바이오', '스페이스테크', '투자·IPO'];
const EV_REGIONS = ['수도권', '지방', '해외', '온라인'];
const EV_PERIODS = [['month', '이번 달'], ['3m', '3개월'], ['6m', '6개월'], ['12m', '1년'], ['all', '전체 기간']];
const EV_MINS = [[0, '모든 점수'], [40, '40점 이상'], [60, '60점 이상'], [80, '80점 이상']];
const EV_SHOWS = [['', '모든 행사'], ['star', '관심'], ['pass', '숨긴 행사']];
const EV_SCORE = [['fit', '산업'], ['people', '사람'], ['format', '형식'], ['access', '참석'], ['rarity', '희소성']];
let evLink = '#events'; // 홈 카드에서 행사·IR 화면으로 갈 주소 (딜소싱에서는 '#deals')
const EV_TTL = 5 * 60000;
const EV_STAR = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l2.3 4.6 5.1.8-3.7 3.6.9 5.1L12 16.2l-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z"/></svg>';
const EV_HIDE = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="12" cy="12" r="2.5"/><path d="M4.5 4.5l15 15"/></svg>';
const EV_SHOW = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="12" cy="12" r="2.5"/></svg>';
const EV_ARROW = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
const evDefaults = () => ({ period: '12m', type: '', ind: '', region: '', min: 40, show: '', sort: 'date' });

const evState = {
  data: null, marks: { items: [], version: null }, at: 0, loading: null,
  f: evLoadFilter(), q: '', open: new Set(), month: null, day: null, mOpen: false,
  saving: Promise.resolve(), focus: null, el: null, pop: null,
};

/* ---------- 상태·데이터 ---------- */
function evLoadFilter() {
  const f = evDefaults();
  try {
    const s = JSON.parse(localStorage.getItem('evFilter3') || '{}');
    for (const k of Object.keys(f)) if (s[k] !== undefined && typeof s[k] === typeof f[k]) f[k] = s[k];
  } catch { /* 기본값 */ }
  if (!EV_PERIODS.some(([k]) => k === f.period)) f.period = '12m';
  return f;
}
function evSaveFilter() { try { localStorage.setItem('evFilter3', JSON.stringify(evState.f)); } catch { /* 이번 화면엔 적용 */ } }

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
  if (evPass(e)) { evRefreshRow(id); evDrawCal(); } // 지금 조건에서 빠지면(숨김, 관심 해제 등) 다시 그린다
  else { evState.open.delete(id); evDrawMain(); }
  evSaveMarks();
}

/* ---------- 날짜·필터 ---------- */
const evFirst = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
function evPeriodEnd(p) {
  const n = new Date(), months = { '3m': 3, '6m': 6, '12m': 12 }[p];
  if (p === 'month') return ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0));
  if (months) return ymd(new Date(n.getFullYear(), n.getMonth() + months, n.getDate()));
  return '9999-12-31';
}

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
const evInPeriod = (e) => e.end >= today() && e.start <= evPeriodEnd(evState.f.period);
const evVisible = () => (evState.data ? evState.data.items.filter((e) => evInPeriod(e) && evPass(e)).sort(evState.f.sort === 'score' ? evByScore : evByDate) : []);
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

// 목록 날짜는 연도까지 한 줄로(점수순 정렬 때 내년 행사와 섞여도 바로 구분): 26.11.4~11.6, 27.3.10(수)
const evYmd = (d) => `${d.slice(2, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const evMd = (d) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
function evDateCell(e) {
  if (e.extra.estimated) { const m = e.extra.month || e.start; return `<span class="ev-d">${m.slice(2, 4)}년 ${Number(m.slice(5, 7))}월</span><span class="ev-d2">예상</span>`; }
  const due = evDue(e);
  const d2 = e.time ? esc(e.time) : '';
  const range = e.start === e.end ? `${evYmd(e.start)}(${WD[parse(e.start).getDay()]})`
    : `${evYmd(e.start)}~${e.end.slice(0, 4) === e.start.slice(0, 4) ? evMd(e.end) : evYmd(e.end)}`;
  return `<span class="ev-d">${range}</span>${d2 ? `<span class="ev-d2">${d2}</span>` : ''}${due && due.n >= 0 && due.n <= 7 && e.end >= today() ? `<span class="ev-d2 ev-due">등록 ${due.txt}</span>` : ''}`;
}

function evRow(e) {
  const st = evSt(e.id), open = evState.open.has(e.id), away = evAway(e);
  return `<div class="ev-row${st ? ` m-${st}` : ''}${open ? ' open' : ''}" data-id="${esc(e.id)}" data-k="${evKey(e)}" data-e="${e.end}">
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
  document.querySelectorAll('#ev-list .ev-row').forEach((r) => { if (r.dataset.id === id) r.outerHTML = evRow(e); });
}

/* ---------- 필터 줄 ---------- */
function evMfHTML() { // 휴대폰: 기간·정렬 옆 '필터' 하나로 나머지 선택 상자를 접는다
  const f = evState.f, d = evDefaults(), n = ['type', 'ind', 'region', 'min', 'show'].filter((k) => f[k] !== d[k]).length;
  return `<button type="button" class="btn ev-mf${evState.mOpen ? ' on' : ''}" data-mf aria-expanded="${!!evState.mOpen}">필터${n ? ` <b>${n}</b>` : ''}</button>`;
}

function evFilterHTML() {
  const f = evState.f;
  const sel = (key, opts, label, allLabel, cls = '') => `<select class="select${cls}" data-f="${key}" aria-label="${label}">${allLabel ? `<option value="">${allLabel}</option>` : ''}${opts.map((o) => {
    const [val, l] = Array.isArray(o) ? o : [o, o];
    return `<option value="${val}"${String(f[key]) === String(val) ? ' selected' : ''}>${l}</option>`;
  }).join('')}</select>`;
  return `<div class="ev-search"><span class="ev-sic">${ico('search', 'sm')}</span><input class="input" id="ev-q" type="search" placeholder="행사·장소·회사 검색" value="${esc(evState.q)}" autocomplete="off" aria-label="검색"></div>
    <div class="ev-sels${evState.mOpen ? ' open' : ''}">${evMfHTML()}${sel('period', EV_PERIODS, '기간')}${sel('type', EV_TYPES, '유형', '모든 유형')}${sel('ind', EV_INDS, '산업', '모든 산업')}${sel('region', EV_REGIONS, '지역', '모든 지역')}${sel('min', EV_MINS, '점수')}${sel('show', EV_SHOWS, '표시')}${sel('sort', [['date', '날짜순'], ['score', '점수순']], '정렬', '', ' ev-msort')}</div>
    <span class="ev-r" id="ev-cnt"></span>
    <button class="iconbtn ev-ref" type="button" id="ev-ref" aria-label="새로고침">${ico('refresh', 'sm')}</button>`;
}

/* ---------- 달력 ---------- */
function evCalHTML() {
  const m = evState.month, start = addDays(m, -m.getDay());
  const weeks = Math.ceil((m.getDay() + new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate()) / 7);
  const td = today(), all = evState.data.items.filter((e) => !e.extra.estimated && evPass(e)).sort(evByScore);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), k = ymd(d), its = all.filter((e) => e.start <= k && e.end >= k);
    const cls = [d.getMonth() !== m.getMonth() ? 'other' : '', k === td ? 'today' : '', k === evState.day ? 'sel' : '', d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''].join(' ');
    cells += `<div class="c ${cls}" data-day="${k}"><div class="n">${d.getDate()}</div>${its.slice(0, 3).map((e) => `<span class="it ev-t${evTier(e.score)}${evSt(e.id) === 'star' ? ' ev-on' : ''}" data-evid="${esc(e.id)}" title="${esc(`${e.score} ${e.title}`)}">${esc(e.title)}</span>`).join('')}${its.length > 3 ? `<span class="it more">+${its.length - 3}</span>` : ''}</div>`;
  }
  return `<div class="ev-bar"><div class="mcal-nav"><button class="iconbtn" type="button" data-evm="-1" aria-label="이전 달">${ico('left')}</button><span class="ym">${m.getFullYear()}년 ${m.getMonth() + 1}월</span><button class="iconbtn" type="button" data-evm="1" aria-label="다음 달">${ico('right')}</button></div>
      <button class="btn sm" type="button" data-evm="0">오늘</button></div>
    <div class="mcal ev-mcal">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells}</div>`;
}
function evDrawCal() { const c = $('#ev-cal'); if (c && evState.data) c.innerHTML = evCalHTML(); }

/* ---------- 달력 요약 창: PC는 누른 날 옆에 뜨는 창, 휴대폰은 아래에서 올라오는 패널 ---------- */
const EV_X = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const evDayItems = (k) => evState.data.items.filter((e) => !e.extra.estimated && evPass(e) && e.start <= k && e.end >= k).sort(evByScore);

function evPopEventHTML(e, back) {
  const st = evSt(e.id), due = evDue(e);
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${v}</dd>` : '');
  const url = /^https?:\/\//i.test(e.url || '') ? e.url : /^https?:\/\//i.test(e.extra.homepage || '') ? e.extra.homepage : '';
  return `<div class="ev-pop-hd">${back ? `<button class="iconbtn ev-pop-back" type="button" data-pop-back aria-label="뒤로">${ico('left', 'sm')}</button>` : ''}<h3 class="ev-pop-ttl">${esc(e.title)}</h3>
      <button class="iconbtn ev-pop-x" type="button" data-pop-x aria-label="닫기">${EV_X}</button></div>
    <dl class="ev-pop-dl">
      ${row('일시', evWhen(e))}
      ${row('장소', esc(e.venue))}
      ${row('주최', esc(e.host))}
      ${row('IR 회사', esc(e.company))}
      ${row('등록 마감', due ? `${mdw(e.reg_deadline)} · ${due.txt}` : '')}
    </dl>
    ${e.reason ? `<p class="ev-pop-why">${esc(e.reason)}</p>` : ''}
    <div class="ev-pop-act">
      <button type="button" class="iconbtn ev-pop-star${st === 'star' ? ' on' : ''}" data-mark="star" aria-pressed="${st === 'star'}" aria-label="관심" title="관심">${EV_STAR}</button>
      <button type="button" class="iconbtn" data-mark="pass" aria-label="${st === 'pass' ? '다시 보이기' : '숨기기'}" title="${st === 'pass' ? '다시 보이기' : '숨기기'}">${st === 'pass' ? EV_SHOW : EV_HIDE}</button>
      <span class="sp"></span>
      ${url ? `<a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">상세 페이지${ico('ext', 'sm')}</a>` : ''}
      <button type="button" class="btn sm" data-pop-list>목록에서 보기</button>
    </div>`;
}

function evPopDayHTML(k) {
  const its = evDayItems(k), d = parse(k);
  return `<div class="ev-pop-hd"><strong class="ev-pop-day">${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})</strong><span class="ev-pop-meta">${its.length}건</span>
      <button class="iconbtn ev-pop-x" type="button" data-pop-x aria-label="닫기">${EV_X}</button></div>
    ${its.length ? `<ul class="ev-pop-list">${its.map((e) => `<li><button type="button" data-pop-ev="${esc(e.id)}">${evScore(e)}<span class="t">${esc(e.title)}</span><span class="d">${evRange(e)}</span></button></li>`).join('')}</ul>` : '<div class="ev-pop-none">행사가 없습니다.</div>'}`;
}

function evPopDraw() {
  const p = evState.pop; if (!p) return;
  const e = p.id && evFind(p.id);
  p.box.innerHTML = e ? evPopEventHTML(e, p.fromDay) : evPopDayHTML(p.day);
  if (!p.cell) return;
  // 누른 날 오른쪽(자리 없으면 왼쪽)에, 위아래는 화면 안으로
  const r = p.cell, w = p.box.offsetWidth, h = p.box.offsetHeight, W = innerWidth, H = innerHeight, gap = 8;
  const left = r.right + gap + w <= W - 16 ? r.right + gap : r.left - gap - w >= 16 ? r.left - gap - w : Math.max(16, Math.min(r.left, W - w - 16));
  p.box.style.left = `${left}px`;
  p.box.style.top = `${Math.max(16, Math.min(r.top, H - h - 16))}px`;
}

function evPopClose() {
  const p = evState.pop; if (!p) return;
  evState.pop = null; p.close();
}

function evPopOpen(day, id) {
  evPopClose();
  evState.day = day; evDrawCal();
  const p = { day, id, fromDay: !id };
  if (isMobile()) {
    openSheet('<div class="ev-pop"></div>', (sh, close) => { p.box = sh.querySelector('.ev-pop'); p.close = close; }, 'ev-sheet');
  } else {
    p.box = document.createElement('div');
    p.box.className = 'ev-pop ev-float';
    p.box.setAttribute('role', 'dialog');
    document.body.appendChild(p.box);
    p.close = () => p.box.remove();
    p.cell = document.querySelector(`#ev-cal [data-day="${day}"]`)?.getBoundingClientRect();
  }
  p.box.addEventListener('click', (ev) => evPopClick(ev, p));
  evState.pop = p; evPopDraw();
}

function evPopClick(ev, p) {
  const hit = (s) => ev.target.closest(s);
  let el;
  if ((el = hit('[data-mark]'))) { evToggleMark(p.id, el.dataset.mark); return evPopDraw(); }
  if ((el = hit('[data-pop-ev]'))) { p.id = el.dataset.popEv; return evPopDraw(); }
  if (hit('[data-pop-back]')) { p.id = null; return evPopDraw(); }
  if (hit('[data-pop-x]')) return evPopClose();
  if (hit('[data-pop-list]')) {
    const id = p.id; evPopClose();
    evState.open.add(id); evRefreshRow(id); evScrollTo(p.day, id);
  }
}

// PC 창은 바깥을 누르거나, 스크롤·창 크기 변경·화면 이동·Esc 때 닫는다(휴대폰 패널은 openSheet 가 닫는다)
const evPopAway = (ev) => { const p = evState.pop; if (p?.cell && !p.box.contains(ev.target)) evPopClose(); };
document.addEventListener('mousedown', evPopAway, true);
document.addEventListener('scroll', evPopAway, true);
addEventListener('resize', () => { if (evState.pop?.cell) evPopClose(); });
addEventListener('hashchange', evPopClose);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && evState.pop?.cell) evPopClose(); });

/* ---------- 목록 ---------- */
const evNoneHTML = () => `<div class="empty">조건에 맞는 행사가 없습니다.${evIsDefault() ? '' : '<div class="ev-retry"><button class="btn sm" type="button" data-reset>초기화</button></div>'}</div>`;

function evHeadHTML() {
  const s = evState.f.sort, h = (k, l) => `<button type="button" class="ev-sort${s === k ? ' on' : ''}" data-sort="${k}" aria-pressed="${s === k}">${l}${s === k ? EV_ARROW : ''}</button>`;
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
    return `<div class="ev-grp" data-ym="${g.k}">${y === year ? '' : `${y}년 `}${m}월<span>${g.items.length}</span></div>${g.items.map(evRow).join('')}`;
  }).join('');
}

function evDrawMain() {
  const list = evVisible(), l = $('#ev-list');
  if (!l) return;
  evDrawCal();
  l.innerHTML = evListHTML(list);
  const c = $('#ev-cnt');
  if (c) c.innerHTML = `${evIsDefault() ? '' : '<button class="btn ghost sm" type="button" data-reset>초기화</button>'}<span class="ev-cnt"><b>${list.length}</b>건</span>`;
}

/* 목록에서 그 날짜(또는 그 행사)로 스크롤. 없으면 기간을 넓혀 다시 그린다 */
function evScrollTo(day, id) {
  const rows = [...document.querySelectorAll('#ev-list .ev-row')];
  let r = id ? rows.find((x) => x.dataset.id === id) : rows.find((x) => x.dataset.e >= day) // 그날 진행 중이거나 그 뒤 첫 행사;
  if (!r && id && evState.f.period !== 'all') { evState.f.period = 'all'; evSaveFilter(); $('#ev-filter').innerHTML = evFilterHTML(); evDrawMain(); return evScrollTo(day, id); }
  if (!r) return;
  if (id && evState.f.sort === 'date') { r.scrollIntoView({ block: 'center' }); return; }
  (r.previousElementSibling?.classList.contains('ev-grp') ? r.previousElementSibling : r).scrollIntoView({ block: 'start' });
}

function evDraw() {
  const root = $('#ev-root'); if (!root) return;
  if (!evState.data) { $('#ev-card').innerHTML = '<div class="ev-blank">아직 수집 전입니다</div>'; return; }
  evState.month ||= evFirst(new Date()); evState.day ||= today();
  $('#ev-filter').innerHTML = evFilterHTML();
  const g = new Date(evState.data.generated);
  if (!isNaN(g)) $('#ev-ref').title = `${g.getMonth() + 1}/${g.getDate()} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집`;
  let focus = null;
  if (evState.focus && evFind(evState.focus)) { focus = evState.focus; evState.open.add(focus); }
  evState.focus = null;
  evDrawMain();
  if (focus) evScrollTo(null, focus);
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
    if (hit('[data-mf]')) { evState.mOpen = !evState.mOpen; $('#ev-filter').innerHTML = evFilterHTML(); return evDrawMain(); }
    if ((el = hit('[data-sort]'))) { f.sort = el.dataset.sort; evSaveFilter(); return evDrawMain(); }
    if (hit('[data-reset]')) {
      evState.f = { ...evDefaults(), period: f.period, sort: f.sort }; evState.q = '';
      evSaveFilter(); return evDraw();
    }
    if (hit('#ev-ref') || hit('[data-evretry]')) return evRender(evState.el, true);
    if ((el = hit('[data-evm]'))) {
      const v = Number(el.dataset.evm), n = new Date();
      if (v === 0) { evState.month = evFirst(n); evState.day = today(); }
      else { evState.month = new Date(evState.month.getFullYear(), evState.month.getMonth() + v, 1); }
      return evDrawCal();
    }
    if ((el = hit('.ev-mcal [data-day]'))) { // 휴대폰은 칸 전체가 하루 목록, PC는 행사를 누르면 그 행사 요약
      const it = !isMobile() && hit('.ev-mcal [data-evid]');
      return evPopOpen(el.dataset.day, it ? it.dataset.evid : null);
    }
  });
  root.addEventListener('change', (ev) => {
    const t = ev.target, k = t.dataset.f; if (!k) return;
    evState.f[k] = k === 'min' ? Number(t.value) : t.value;
    evSaveFilter(); evDrawMain();
    const mf = $('.ev-mf'); if (mf) mf.outerHTML = evMfHTML();
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
  const host = el && el.nodeType === 1 ? el : PAGE;
  evState.el = host; evPopClose();
  host.innerHTML = `<div class="ev-page" id="ev-root">${host === PAGE ? '<div class="page-head"><h1>행사·IR</h1></div>' : ''}
    <section class="card ev-card" id="ev-card">
      <div class="ev-filter" id="ev-filter"></div>
      <div class="ev-cal" id="ev-cal"></div>
      <div class="ev-list" id="ev-list"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  const root = $('#ev-root', host);
  evBind(root);
  try { await evLoad(force); }
  catch (e) {
    if (!root.isConnected) return;
    root.querySelector('#ev-list').innerHTML = `<div class="empty">${esc(e.message)}<div class="ev-retry"><button class="btn sm" type="button" data-evretry>다시 시도</button></div></div>`;
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
