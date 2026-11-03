/* SPACE WORKS — 화면 로직 (프레임워크 없음). 데이터·로그인은 graph.js */
const $ = (s, el = document) => el.querySelector(s);
const PAGE = $('#page');
const CATS = ['법인설립', '금감원', '사무실 세팅', '회사소개·대외', '투자·딜', '개발', '기타'];
const PSTAT = ['아이디어', '설계', '개발 중', '운영 중', '보류'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const DAY1 = '2026-11-02'; // 입사 첫날 = Day-1 (업무일지 표기)

let S = null;            // 할 일·프로그램·D-day·브리핑·기록 목록
let CALC = {};           // 일정 캐시 key → 응답
let ui = { todoTab: 'open', todoEdit: null, progSel: null, progTab: 'all', note: null, noteQ: '', calStart: null };
let noteTimer = null;

// ---------- 유틸 ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
const md = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const mdw = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const uid = () => Math.random().toString(16).slice(2, 10);
const isMobile = () => matchMedia('(max-width: 760px)').matches;
function openSheet(html, mount) { // 아래에서 올라오는 패널(데스크톱은 가운데 창)
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="handle"></div>${html}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  if (mount) mount(wrap.querySelector('.sheet'), close);
  return close;
}
const ico = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;

function workDay(dateStr) { // DAY1부터 평일 기준 N일째
  let n = 0, d = parse(DAY1); const end = parse(dateStr);
  if (end < d) return 0;
  while (d <= end) { if (d.getDay() % 6) n++; d = addDays(d, 1); }
  return n;
}

function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}

async function load() {
  const [todos, programs, milestones, brief, notes] = await Promise.all([
    STORE.readJSON('todos'), STORE.readJSON('programs'), STORE.readJSON('milestones'),
    STORE.readText('data/briefing.md'), STORE.listNotes(S?.notes || []),
  ]);
  S = { todos, programs, milestones, briefing: { text: brief.text, mtime: brief.mtime }, notes, auth: { connected: true, upn: G.account.username } };
  counts(); foot();
}

async function save(coll) {
  try {
    S[coll].version = await STORE.writeJSON(coll, S[coll].items, S[coll].version);
    counts();
  } catch (e) {
    toast(e.message);
    if (e.status === 409) { await load(); render(); }
  }
}

function counts() {
  const open = S.todos.items.filter((t) => !t.done).length;
  document.querySelectorAll('[data-cnt=todos]').forEach((el) => { el.textContent = open || ''; });
  const urgent = S.todos.items.filter((t) => !t.done && t.due && t.due <= today()).length;
  document.querySelectorAll('[data-badge=todos]').forEach((el) => { el.textContent = urgent || ''; });
  document.querySelectorAll('[data-cnt=programs]').forEach((el) => { el.textContent = S.programs.items.filter((p) => ['설계', '개발 중'].includes(p.status)).length || ''; });
}

function accountMenu() {
  openSheet(`<h3>메뉴</h3><div class="who" style="font-size:13px;color:var(--text3);margin:-6px 0 8px">${esc(S.auth.upn)}</div>
    <ul class="menu">
      <li><a href="#programs" data-close>${ico('box')}프로그램</a></li>
      <li><button type="button" id="m-refresh">${ico('refresh')}새로고침</button></li>
      <li><button type="button" id="m-logout">${ico('ext')}로그아웃</button></li>
    </ul>`, (el, close) => {
    el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', close));
    el.querySelector('#m-refresh').onclick = async () => { close(); CALC = {}; await load(); render(); toast('최신 내용으로 바꿨습니다'); };
    el.querySelector('#m-logout').onclick = () => G.logout();
  });
}

function foot() {
  $('#side-foot').innerHTML = `<div class="who"><span class="dot ok"></span>${esc(S.auth.upn)}</div><button class="btn ghost sm" id="logout" style="padding:0;height:24px">로그아웃</button>`;
  $('#logout').onclick = () => G.logout();
}

// ---------- 라우팅 ----------
const route = () => (location.hash || '#home').slice(1);
const CRUMB = { home: '대시보드', todos: '할 일', calendar: '일정', mail: '메일', notes: '업무일지·회의록', programs: '프로그램' };
function render() {
  const r = CRUMB[route()] ? route() : 'home';
  document.querySelectorAll('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === r));
  document.body.dataset.route = r;
  if (r !== 'notes') document.body.classList.remove('note-open');
  $('#crumb').textContent = CRUMB[r];
  ({ home: renderHome, todos: renderTodos, calendar: renderCalendar, mail: renderMail, programs: renderPrograms, notes: renderNotes }[r] || renderHome)();
}
window.addEventListener('hashchange', render);

// ---------- 할 일 공통 ----------
function dueInfo(t) {
  if (!t.due) return { cls: '', txt: '' };
  const d = diffDays(t.due, today());
  if (t.done) return { cls: '', txt: md(t.due) };
  if (d < 0) return { cls: 'over', txt: `${md(t.due)} · ${-d}일 지남` };
  if (d === 0) return { cls: 'today', txt: '오늘' };
  if (d === 1) return { cls: '', txt: '내일' };
  return { cls: '', txt: mdw(t.due) };
}
const sortTodos = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.created.localeCompare(b.created);

function toggleTodo(id) {
  const t = S.todos.items.find((x) => x.id === id); if (!t) return;
  t.done = !t.done; t.doneAt = t.done ? today() : null;
  save('todos'); render();
}

// ---------- 홈 ----------
function greet(h) { return h < 6 ? '늦은 시간까지 수고 많으십니다' : h < 12 ? '좋은 아침입니다' : h < 18 ? '좋은 오후입니다' : '오늘도 수고 많으셨습니다'; }

function renderHome() {
  const td = today(), d = new Date();
  const open = S.todos.items.filter((t) => !t.done);
  const over = open.filter((t) => t.due && t.due < td).sort(sortTodos);
  const dueToday = open.filter((t) => t.due === td);
  const soon = open.filter((t) => t.due && t.due > td && diffDays(t.due, td) <= 7).sort(sortTodos);
  const weekEnd = ymd(addDays(weekStart(d), 6));
  const thisWeek = open.filter((t) => t.due && t.due >= td && t.due <= weekEnd);
  const doneWeek = S.todos.items.filter((t) => t.done && t.doneAt && t.doneAt >= ymd(weekStart(d)));
  const ms = S.milestones.items.filter((m) => m.date >= td).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 2);
  const prog = S.programs.items.filter((p) => ['설계', '개발 중'].includes(p.status));
  const b = S.briefing, bt = b.mtime ? new Date(b.mtime * 1000) : null;
  const tile = (color, icon, title, value, sub, tab) => `<a class="tile ${color}" href="#todos"${tab ? ` data-tab-link="${tab}"` : ''}>
    <div class="top"><span class="h">${title}</span><span class="ic">${ico(icon)}</span></div>
    <div><div class="v">${value}</div><div class="s2">${sub}</div></div></a>`;

  PAGE.innerHTML = `
    <div class="home">
      <div class="col">
        <section class="sec-hello m-only">
          <div class="dt">${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일</div>
          <div class="sub">${greet(d.getHours())} · Day-${workDay(td)}</div>
          <div class="chips">
            ${ms.map((m) => `<span class="dchip">${esc(m.title.replace(/\s*\(.*\)$/, ''))} <b>D-${diffDays(m.date, td)}</b></span>`).join('')}
            <a class="dchip blue" href="#todos" data-tab-link="today">오늘 마감 <b>${dueToday.length}</b></a>
            <a class="dchip ${over.length ? 'red' : ''}" href="#todos" data-tab-link="over">기한 지남 <b>${over.length}</b></a>
          </div>
        </section>
        <section class="card sec-month" id="home-month"></section>
        <section class="card sec-tiles">
          <div class="card-head"><h2>주요 현황</h2></div>
          <div class="tiles">
            ${ms.map((m, i) => tile(i ? 'violet' : 'blue', 'flag', esc(m.title.replace(/\s*\(.*\)$/, '')), `D-${diffDays(m.date, td)}`, mdw(m.date))).join('')}
            ${tile('amber', 'clock', '오늘 마감', `${dueToday.length}<small>건</small>`, `7일 안 ${soon.length}건`, 'today')}
            ${tile(over.length ? 'red' : 'green', over.length ? 'alert' : 'done', '기한 지남', `${over.length}<small>건</small>`, `남은 할 일 ${open.length}건`, 'over')}
          </div>
        </section>
        <section class="card sec-brief">
          <div class="card-head"><h2>AI 브리핑</h2><span class="meta">${bt ? `Claude · ${bt.getMonth() + 1}/${bt.getDate()} ${pad(bt.getHours())}:${pad(bt.getMinutes())} 갱신` : ''}</span></div>
          <div class="card-body brief">${b.text ? mdRender(b.text) : '<div class="empty">브리핑 없음</div>'}</div>
        </section>
        <section class="card sec-todo">
          <div class="card-head"><h2>해야 할 일 <span class="n">${over.length + dueToday.length + soon.length}</span></h2><a class="btn sm act" href="#todos">전체 보기</a></div>
          <div class="card-body" style="padding-top:0">
            ${homeTodoBlock('기한 지남', over)}${homeTodoBlock('오늘', dueToday)}${homeTodoBlock('7일 안', soon)}
            ${!over.length && !dueToday.length && !soon.length ? '<div class="empty">7일 안에 마감인 할 일이 없습니다.</div>' : ''}
          </div>
        </section>
      </div>
      <div class="col">
        <section class="card sec-profile">
          <div class="profile"><span class="ph">${ico('user', 'lg')}</span><div><div class="nm">탁지원 님, ${greet(d.getHours())}</div><div class="dp">투자운용본부 · 대리</div></div></div>
          <div class="timebox">
            <div class="cell"><div class="k">${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})</div><div class="v blue" id="live-time">${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</div></div>
            <div class="cell"><div class="k">입사 후</div><div class="v">Day-${workDay(td)}</div></div>
          </div>
        </section>
        <section class="card sec-today">
          <div class="card-head"><h2>오늘·내일 일정</h2><a class="btn sm act" href="#calendar">일정</a></div>
          <div class="card-body" id="home-cal" style="padding-top:0"><div class="empty">불러오는 중…</div></div>
        </section>
        <section class="card sec-status">
          <div class="card-head"><h2>할 일 현황 <span class="n">[${open.length}]</span></h2><a class="btn sm act" href="#todos">할 일</a></div>
          <div class="card-body status">
            <a href="#todos" data-tab-link="over"><span class="si ${over.length ? 'red' : ''}">${ico('alert', 'sm')}</span>기한 지남<span class="sv ${over.length ? 'red' : ''}">${over.length}건</span></a>
            <a href="#todos" data-tab-link="today"><span class="si ${dueToday.length ? 'blue' : ''}">${ico('clock', 'sm')}</span>오늘 마감<span class="sv ${dueToday.length ? 'blue' : ''}">${dueToday.length}건</span></a>
            <a href="#todos" data-tab-link="open"><span class="si">${ico('week', 'sm')}</span>이번 주 마감<span class="sv">${thisWeek.length}건</span></a>
            <a href="#todos" data-tab-link="done"><span class="si">${ico('done', 'sm')}</span>이번 주 완료<span class="sv">${doneWeek.length}건</span></a>
          </div>
        </section>
        <section class="card sec-notes">
          <div class="card-head"><h2>최근 기록</h2><a class="btn sm act" href="#notes">기록</a></div>
          <div class="card-body" style="padding-top:0"><ul class="list">${S.notes.slice(0, 4).map((n) => `
            <li class="click" data-note="${esc(n.name)}"><div class="t"><div class="ttl">${esc(n.name.replace(/\.(txt|md)$/i, ''))}</div><div class="meta">${relTime(n.mtime)} 수정</div></div></li>`).join('') || '<div class="empty">기록이 없습니다.</div>'}</ul></div>
        </section>
        <section class="card sec-prog">
          <div class="card-head"><h2>진행 중 프로그램</h2><a class="btn sm act" href="#programs">전체</a></div>
          <div class="card-body" style="padding-top:0"><ul class="list">${prog.map((p) => `
            <li><div class="t"><div class="ttl">${esc(p.name)}</div><div class="meta">${esc(p.desc)}</div></div><span class="chip blue">${esc(p.status)}</span></li>`).join('') || '<div class="empty">진행 중인 프로그램이 없습니다.</div>'}</ul></div>
        </section>
      </div>
    </div>`;
  PAGE.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => toggleTodo(el.dataset.toggle)));
  PAGE.querySelectorAll('[data-note]').forEach((el) => el.addEventListener('click', () => { ui.note = el.dataset.note; location.hash = '#notes'; }));
  PAGE.querySelectorAll('[data-tab-link]').forEach((el) => el.addEventListener('click', () => { ui.todoTab = el.dataset.tabLink; }));
  homeCalendar();
  mountMonth($('#home-month'));
}

function homeTodoBlock(label, items) {
  if (!items.length) return '';
  return `<div class="sec-label">${label} ${items.length}</div><ul class="list">${items.map((t) => {
    const di = dueInfo(t);
    return `<li><input type="checkbox" class="check" data-toggle="${t.id}" aria-label="완료"><div class="t"><div class="ttl">${esc(t.title)}</div>${t.note ? `<div class="meta">${esc(t.note)}</div>` : ''}</div>
      <span class="chip line">${esc(t.cat)}</span><span class="due-s ${di.cls}">${di.txt}</span></li>`;
  }).join('')}</ul>`;
}

async function homeCalendar() {
  const box = $('#home-cal'); if (!box) return;
  const s = new Date(); s.setHours(0, 0, 0, 0);
  try {
    const r = await fetchCal(ymd(s), ymd(addDays(s, 2)));
    if (!$('#home-cal')) return;
    const ev = r.events.filter((e) => !e.cancelled);
    if (!ev.length) { box.innerHTML = '<div class="empty">오늘·내일 일정이 없습니다.</div>'; return; }
    box.innerHTML = `<ul class="list">${ev.map((e) => `<li><span class="time">${e.allDay ? '종일' : e.start.slice(11, 16)}</span>
      <div class="t"><div class="ttl">${esc(e.subject)}</div><div class="meta">${e.start.slice(0, 10) === today() ? '오늘' : '내일'}${e.location || e.organizer ? ' · ' + esc(e.location || e.organizer) : ''}</div></div>${e.join ? `<a class="btn sm" href="${esc(e.join)}" target="_blank">참가</a>` : ''}</li>`).join('')}</ul>`;
  } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

function relTime(ts) {
  const m = Math.round((Date.now() / 1000 - ts) / 60);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60); if (h < 24) return `${h}시간 전`;
  const d = new Date(ts * 1000); return `${d.getMonth() + 1}/${d.getDate()}`;
}

function mdRender(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let html = '', inList = false;
  for (const line of text.split(/\r?\n/)) {
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) html += `<h3>${inline(h[1])}</h3>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

// ---------- 할 일 ----------
function renderTodos() {
  const td = today(), all = S.todos.items;
  const tabs = {
    open: ['진행 중', all.filter((t) => !t.done)],
    today: ['오늘', all.filter((t) => !t.done && t.due === td)],
    over: ['기한 지남', all.filter((t) => !t.done && t.due && t.due < td)],
    done: ['완료', all.filter((t) => t.done)],
  };
  const [, items] = tabs[ui.todoTab];
  let body;
  if (ui.todoTab === 'done') {
    body = items.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).map(todoRow).join('');
  } else {
    body = CATS.map((c) => {
      const g = items.filter((t) => (t.cat || '기타') === c).sort(sortTodos);
      return g.length ? `<div class="todo-group"><h3>${c} <span class="muted" style="font-weight:500">${g.length}</span></h3>${g.map(todoRow).join('')}</div>` : '';
    }).join('');
  }
  PAGE.innerHTML = `
    <div class="page-head"><h1>할 일</h1></div>
    <section class="card">
    <form class="addbar" id="addf">
      <input class="input grow" id="add-title" placeholder="할 일을 입력하고 Enter" autocomplete="off">
      <select class="select" id="add-cat">${CATS.map((c) => `<option>${c}</option>`).join('')}</select>
      <input class="input" type="date" id="add-due" style="width:150px">
      <button class="btn primary" type="submit">${ico('plus', 'sm')}추가</button>
    </form>
    <div class="tabs">${Object.entries(tabs).map(([k, [lbl, arr]]) => `<button data-tab="${k}" class="${ui.todoTab === k ? 'on' : ''}">${lbl}<span class="n">${arr.length}</span></button>`).join('')}</div>
    <div id="todo-list" style="padding-bottom:8px">${body || '<div class="empty">해당하는 할 일이 없습니다.</div>'}</div></section>
    <button class="fab" type="button" id="todo-fab" aria-label="할 일 추가">${ico('plus')}</button>`;
  $('#todo-fab').onclick = () => addTodoSheet();

  $('#add-cat').value = ui.lastCat || '사무실 세팅';
  $('#addf').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#add-title').value.trim(); if (!title) return;
    ui.lastCat = $('#add-cat').value;
    S.todos.items.push({ id: uid(), title, cat: ui.lastCat, due: $('#add-due').value || null, done: false, doneAt: null, created: today(), note: '' });
    save('todos'); renderTodos(); $('#add-title').focus();
  });
  PAGE.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { ui.todoTab = b.dataset.tab; ui.todoEdit = null; renderTodos(); }));
  PAGE.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => toggleTodo(el.dataset.toggle)));
  PAGE.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => { ui.todoEdit = el.dataset.edit; renderTodos(); }));
  PAGE.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', () => {
    const t = S.todos.items.find((x) => x.id === el.dataset.del);
    if (t && confirm(`"${t.title}" 할 일을 삭제할까요?`)) { S.todos.items = S.todos.items.filter((x) => x !== t); save('todos'); renderTodos(); }
  }));
  const ef = $('#todo-edit');
  if (ef) {
    $('#te-title').focus();
    ef.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = S.todos.items.find((x) => x.id === ui.todoEdit);
      Object.assign(t, { title: $('#te-title').value.trim() || t.title, note: $('#te-note').value.trim(), cat: $('#te-cat').value, due: $('#te-due').value || null });
      ui.todoEdit = null; save('todos'); renderTodos();
    });
    ef.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.todoEdit = null; renderTodos(); } });
    $('#te-cancel').addEventListener('click', () => { ui.todoEdit = null; renderTodos(); });
  }
}

function todoRow(t) {
  if (ui.todoEdit === t.id) {
    return `<form class="todo" id="todo-edit" style="grid-template-columns:24px minmax(0,1fr) 140px 150px auto;background:var(--hover)">
      <span></span>
      <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0"><input class="edit-input" id="te-title" value="${esc(t.title)}"><input class="edit-input" id="te-note" style="border-color:var(--line2)" value="${esc(t.note)}" placeholder="메모 (선택)"></div>
      <select class="select" id="te-cat">${CATS.map((c) => `<option ${c === t.cat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <input class="input" type="date" id="te-due" value="${t.due || ''}">
      <div style="display:flex;gap:6px"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" id="te-cancel">취소</button><button class="btn ghost" type="button" data-del="${t.id}">삭제</button></div>
    </form>`;
  }
  const di = dueInfo(t);
  return `<div class="todo ${t.done ? 'done' : ''}">
    <input type="checkbox" class="check" data-toggle="${t.id}" ${t.done ? 'checked' : ''} aria-label="완료">
    <div data-edit="${t.id}" style="min-width:0;cursor:text"><div class="ttl">${esc(t.title)}</div>${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}</div>
    <span>${ui.todoTab === 'done' ? `<span class="chip line">${esc(t.cat)}</span>` : ''}</span>
    <span class="due ${di.cls}">${t.done && t.doneAt ? `${md(t.doneAt)} 완료` : di.txt}</span>
    <button class="iconbtn del" data-del="${t.id}" title="삭제">${ico('trash', 'sm')}</button>
  </div>`;
}


function addTodoSheet(due) {
  openSheet(`<h3>할 일 추가</h3>
    <form id="sheet-todo">
      <div class="field"><input class="input full" name="title" placeholder="할 일" autocomplete="off" required></div>
      <div class="field"><div class="chips">${CATS.map((c) => `<label><input type="radio" name="cat" value="${c}" ${c === (ui.lastCat || '사무실 세팅') ? 'checked' : ''}>${c}</label>`).join('')}</div></div>
      <div class="field"><label style="display:block;font-size:13px;color:var(--text2);margin-bottom:6px">마감일</label><input class="input full" type="date" name="due" value="${due || ''}"></div>
      <button class="btn primary full" type="submit">추가</button>
    </form>`, (el, close) => {
    const f = el.querySelector('#sheet-todo');
    setTimeout(() => f.title.focus(), 50);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      if (!v.title.trim()) return;
      ui.lastCat = v.cat;
      S.todos.items.push({ id: uid(), title: v.title.trim(), cat: v.cat, due: v.due || null, done: false, doneAt: null, created: today(), note: '' });
      close(); save('todos'); render(); toast('추가했습니다');
    });
  });
}

// ---------- 월간 캘린더 (홈·일정 공용) ----------
function monthGrid(m) { // 그 달이 걸친 주만 (5주 또는 6주)
  const first = new Date(m.getFullYear(), m.getMonth(), 1), start = addDays(first, -first.getDay());
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(), weeks = Math.ceil((first.getDay() + days) / 7);
  return { first, start, end: addDays(start, weeks * 7), n: weeks * 7 };
}

const CALS = [
  { key: 'team', name: '스페이스인베스트먼트', sub: '대표님 공유' },
  { key: 'me', name: '내 일정', sub: '비공개' },
  { key: 'ms', name: 'D-day', sub: '' },
  { key: 'td', name: '할 일', sub: '' },
];
ui.calShow = (() => { try { return { team: true, me: true, ms: true, td: true, ...JSON.parse(localStorage.getItem('calShow') || '{}') }; } catch { return { team: true, me: true, ms: true, td: true }; } })();
const calKey = (it) => (it.type === 'ev' ? it.cal || 'me' : it.type);

function dayItems(k, events, all) {
  return dayItemsAll(k, events).filter((it) => all || ui.calShow[calKey(it)] !== false);
}

function dayItemsAll(k, events) {
  const td = today();
  const ms = S.milestones.items.filter((m) => m.date === k).map((m) => ({ type: 'ms', id: m.id, time: 'D-day', title: m.title, editable: true }));
  const ev = (events || []).filter((e) => !e.cancelled && e.start.slice(0, 10) <= k && e.end > `${k}T00:00`)
    .map((e) => ({ type: 'ev', id: e.id, time: e.allDay ? '종일' : e.start.slice(0, 10) === k ? e.start.slice(11, 16) : '계속', title: e.subject, join: e.join, link: e.link, editable: e.editable, cal: e.cal, ev: e }));
  const tds = S.todos.items.filter((t) => !t.done && t.due === k).map((t) => ({ type: 'td', id: t.id, time: '할 일', title: t.title, over: k < td, editable: true }));
  // 같은 일정이 두 곳에 있으면 하나만 보인다 (원본은 그대로): 팀 캘린더 ↔ 내 일정(회의 초대), D-day ↔ 캘린더 일정
  const evs = [];
  for (const e of ev) {
    const dup = evs.find((x) => x.time === e.time && sameTitle(x.title, e.title));
    if (!dup) { evs.push(e); continue; }
    const keep = dup.cal === 'team' ? dup : e, drop = keep === dup ? e : dup;
    keep.join = keep.join || drop.join; keep.alt = drop;
    evs[evs.indexOf(dup)] = keep;
  }
  const mss = ms.filter((m) => !evs.some((e) => sameTitle(e.title, m.title)));
  return [...mss, ...evs, ...tds];
}

function sameTitle(a, b) { // 기호·공백을 빼고 앞 네 글자가 같으면 같은 일정으로 본다
  const n = (s) => String(s).replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 4);
  const x = n(a), y = n(b);
  return x.length >= 3 && x === y;
}

const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function calForm(kind, id, events) {
  const f = (label, inner, cls = '') => `<div class="field ${cls}"><label>${label}</label>${inner}</div>`;
  const del = id ? '<button class="btn ghost" type="button" data-cf="del" style="margin-left:auto">삭제</button>' : '';
  const actions = `<div class="actions"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-cf="cancel">취소</button>${del}</div>`;
  if (kind === 'ev') {
    const e = id ? events.find((x) => x.id === id) : null;
    const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(Math.min(Math.max(now.getHours() + 1, 9), 22));
    const sd = e ? e.start.slice(0, 10) : ui.selDay;
    let ed = e ? e.end.slice(0, 10) : ui.selDay;
    if (e && e.allDay) ed = ymd(addDays(parse(ed), -1)); // 종일 일정의 끝(다음 날 0시) → 화면에서는 마지막 날
    const st = e ? e.start.slice(11, 16) : hhmm(now), et = e ? e.end.slice(11, 16) : hhmm(new Date(now.getTime() + 3600000));
    return `<form class="cal-form" id="cf" data-kind="ev">
      ${f('제목', `<input class="input" name="subject" value="${esc(e?.subject || '')}" required>`, 'wide')}
      ${f('시작', `<div class="pair"><input class="input" type="date" name="startDate" value="${sd}" required><input class="input t" type="time" step="600" name="startTime" value="${st}"></div>`, 'half')}
      ${f('종료', `<div class="pair"><input class="input" type="date" name="endDate" value="${ed}" required><input class="input t" type="time" step="600" name="endTime" value="${et}"></div>`, 'half')}
      ${f('장소', `<input class="input" name="location" value="${esc(e?.location || '')}">`, 'half')}
      ${e ? '' : f('캘린더', `<div class="cal-pick">${CALS.slice(0, 2).map((c, i) => `<label class="c-${c.key}"><input type="radio" name="calendar" value="${c.key}" ${i === 0 ? 'checked' : ''}><i class="cdot"></i>${c.name}<span class="muted">${c.sub}</span></label>`).join('')}</div>`, 'wide')}
      <label class="allday"><input type="checkbox" class="check" name="allDay" ${e?.allDay ? 'checked' : ''}>종일</label>
      ${actions}</form>`;
  }
  if (kind === 'td') {
    const t = id ? S.todos.items.find((x) => x.id === id) : null;
    return `<form class="cal-form" id="cf" data-kind="td">
      ${f('할 일', `<input class="input" name="title" value="${esc(t?.title || '')}" required>`, 'wide')}
      ${f('구분', `<select class="select" name="cat">${CATS.map((c) => `<option ${c === (t?.cat || ui.lastCat || '사무실 세팅') ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
      ${f('마감일', `<input class="input" type="date" name="due" value="${t?.due || ui.selDay}">`)}
      ${f('메모', `<input class="input" name="note" value="${esc(t?.note || '')}">`, 'half')}
      ${actions}</form>`;
  }
  const m = S.milestones.items.find((x) => x.id === id);
  return `<form class="cal-form" id="cf" data-kind="ms">
    ${f('D-day', `<input class="input" name="title" value="${esc(m?.title || '')}" required>`, 'wide')}
    ${f('날짜', `<input class="input" type="date" name="date" value="${m?.date || ui.selDay}" required>`)}
    ${f('메모', `<input class="input" name="note" value="${esc(m?.note || '')}">`, 'wide3')}
    ${actions}</form>`;
}

async function mountMonth(el) {
  if (!ui.month) { const n = new Date(); ui.month = new Date(n.getFullYear(), n.getMonth(), 1); }
  if (!ui.selDay) ui.selDay = today();
  const { first, start, end, n } = monthGrid(ui.month);
  let events = [];
  const refetch = () => { CALC = {}; mountMonth(el); };

  const draw = () => {
    const td = today();
    const collapsed = isMobile() && el.id === 'home-month' && !ui.monthOpen; // 접기는 홈에서만
    let from = 0, to = n;
    if (collapsed) { // 선택한 날짜가 있는 주 한 줄만
      const idx = diffDays(ui.selDay, ymd(start));
      const row = idx >= 0 && idx < n ? Math.floor(idx / 7) : 0;
      from = row * 7; to = from + 7;
    }
    let cells = '';
    for (let i = from; i < to; i++) {
      const d = addDays(start, i), k = ymd(d), items = dayItems(k, events);
      const cls = [d.getMonth() !== first.getMonth() ? 'other' : '', k === td ? 'today' : '', k === ui.selDay ? 'sel' : '', d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''].join(' ');
      cells += `<div class="c ${cls}" data-day="${k}"><div class="n ${k === ui.selDay && k !== td ? 'ring' : ''}">${d.getDate()}</div>${items.slice(0, 3).map((it) =>
        `<span class="it c-${calKey(it)}${it.over ? ' over' : ''}" data-item="${it.type}|${esc(it.id)}" data-d="${k}" title="${esc(it.title)}">${it.type === 'ev' && /\d/.test(it.time) ? it.time + ' ' : ''}${esc(it.title)}</span>`).join('')}${items.length > 3 ? `<span class="it more">+${items.length - 3}</span>` : ''}</div>`;
    }
    const sel = dayItems(ui.selDay, events), ed = ui.calEdit;
    const rows = sel.map((it) => {
      const on = ed && ed.kind === it.type && ed.id === it.id;
      if (on) return `<li class="editing">${calForm(it.type, it.id, events)}</li>`;
      const ext = it.type === 'ev' && !it.editable
        ? `<span class="chip line">${it.ev.organizer_me ? '참석자 있음' : '받은 초대'}</span>${it.join ? `<a class="btn sm" href="${esc(it.join)}" target="_blank">Teams 참가</a>` : it.link ? `<a class="btn sm ghost" href="${esc(it.link)}" target="_blank">Outlook에서 열기</a>` : ''}`
        : it.join ? `<a class="btn sm" href="${esc(it.join)}" target="_blank">Teams 참가</a>` : '';
      return `<li class="${it.editable ? 'click' : ''}" ${it.editable ? `data-item="${it.type}|${esc(it.id)}"` : ''}><span class="k c-${calKey(it)}"><i class="cdot"></i>${it.time}</span><div class="t"><div class="ttl">${esc(it.title)}</div>${it.ev ? `<div class="meta">${it.cal === 'team' ? '스페이스인베스트먼트' : '내 일정'}${it.ev.location ? ' · ' + esc(it.ev.location) : ''}</div>` : ''}</div>${ext}</li>`;
    }).join('');
    const newForm = ed && ed.kind.startsWith('new-') ? `<div class="new-wrap">${calForm(ed.kind.slice(4), null, events)}</div>` : '';
    el.innerHTML = `<div class="card-head">
        <div class="mcal-nav"><button class="iconbtn" data-m="-1" aria-label="이전 달">${ico('left')}</button><span class="ym">${first.getFullYear()}년 ${first.getMonth() + 1}월</span><button class="iconbtn" data-m="1" aria-label="다음 달">${ico('right')}</button></div>
        <button class="btn sm" data-m="0">오늘</button>
        ${el.id === 'home-month' ? `<button class="btn sm ghost mcal-toggle" type="button" data-mt>${ui.monthOpen ? '접기' : '월 전체'}</button>` : ''}
        <div class="cal-filter act">${CALS.filter((c) => S.auth.connected || ['ms', 'td'].includes(c.key)).map((c) =>
          `<label class="cf c-${c.key}" title="${c.sub}"><input type="checkbox" data-show="${c.key}" ${ui.calShow[c.key] !== false ? 'checked' : ''}><i class="box"></i>${c.name}</label>`).join('')}
</div></div>
      <div class="mcal">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells}</div>
      <div class="mcal-day">
        <div class="day-head"><span class="hd">${mdw(ui.selDay)}</span><div class="tools">
          ${S.auth.connected ? `<button class="btn sm" data-new="ev">${ico('plus', 'sm')}일정</button>` : ''}
          <button class="btn sm" data-new="td">${ico('plus', 'sm')}할 일</button></div></div>
        ${newForm}
        ${rows ? `<ul class="list">${rows}</ul>` : newForm ? '' : '<div class="muted" style="font-size:13px;padding:6px 0">일정 없음</div>'}
      </div>`;

    const nav = (v) => {
      ui.calEdit = null;
      if (v === 0) { const n2 = new Date(); ui.month = new Date(n2.getFullYear(), n2.getMonth(), 1); ui.selDay = today(); return mountMonth(el); }
      if (collapsed) { // 접힌 상태: 한 주씩 이동
        const nd = addDays(parse(ui.selDay), 7 * v); ui.selDay = ymd(nd);
        if (nd.getMonth() !== ui.month.getMonth() || nd.getFullYear() !== ui.month.getFullYear()) { ui.month = new Date(nd.getFullYear(), nd.getMonth(), 1); return mountMonth(el); }
        return draw();
      }
      ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + v, 1);
      mountMonth(el);
    };
    el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => nav(Number(b.dataset.m))));
    const mt = el.querySelector('[data-mt]'); if (mt) mt.addEventListener('click', () => { ui.monthOpen = !ui.monthOpen; draw(); });
    const grid = el.querySelector('.mcal');
    let tx = null, ty = null;
    grid.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (tx === null) return;
      const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) nav(dx < 0 ? 1 : -1);
    }, { passive: true });
    el.querySelectorAll('.mcal [data-day]').forEach((c) => {
      c.addEventListener('click', () => { if (ui.selDay !== c.dataset.day) ui.calEdit = null; ui.selDay = c.dataset.day; draw(); });
      c.addEventListener('dblclick', () => { ui.selDay = c.dataset.day; ui.calEdit = { kind: S.auth.connected ? 'new-ev' : 'new-td' }; draw(); });
    });
    el.querySelectorAll('[data-item]').forEach((x) => x.addEventListener('click', (e) => {
      e.stopPropagation();
      const [kind, id] = x.dataset.item.split('|');
      if (x.dataset.d) ui.selDay = x.dataset.d;
      const it = dayItems(ui.selDay, events, true).find((i) => i.type === kind && i.id === id);
      ui.calEdit = it && it.editable ? { kind, id } : null;
      draw();
    }));
    el.querySelectorAll('[data-show]').forEach((x) => x.addEventListener('change', () => {
      ui.calShow[x.dataset.show] = x.checked;
      try { localStorage.setItem('calShow', JSON.stringify(ui.calShow)); } catch { /* 저장 못 해도 이번 화면엔 적용 */ }
      draw();
    }));
    el.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => { ui.calEdit = { kind: 'new-' + b.dataset.new }; draw(); }));

    const form = $('#cf', el);
    if (!form) return;
    const allDay = form.querySelector('[name=allDay]');
    const syncAllDay = () => form.querySelectorAll('input.t').forEach((t) => { t.disabled = allDay.checked; });
    if (allDay) { allDay.addEventListener('change', syncAllDay); syncAllDay(); }
    form.querySelector('input').focus();
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.calEdit = null; draw(); } });
    form.querySelector('[data-cf=cancel]').onclick = () => { ui.calEdit = null; draw(); };
    const kind = form.dataset.kind, id = ui.calEdit.id || null, v = () => Object.fromEntries(new FormData(form));
    const delBtn = form.querySelector('[data-cf=del]');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm('삭제할까요?')) return;
      try {
        if (kind === 'ev') { await OUTLOOK.remove(id); ui.calEdit = null; toast('Outlook에서 삭제했습니다'); return refetch(); }
        const coll = kind === 'td' ? 'todos' : 'milestones';
        S[coll].items = S[coll].items.filter((x) => x.id !== id); ui.calEdit = null; await save(coll); draw();
      } catch (err) { toast(err.message); }
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = v();
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try {
        if (kind === 'ev') {
          const body = { subject: val.subject, startDate: val.startDate, endDate: val.endDate, startTime: val.startTime, endTime: val.endTime, allDay: !!allDay.checked, location: val.location, calendar: val.calendar || 'team' };
          await (id ? OUTLOOK.update(id, body) : OUTLOOK.create(body));
          ui.calEdit = null; ui.selDay = val.startDate; toast(id ? 'Outlook 일정을 고쳤습니다' : body.calendar === 'team' ? '스페이스인베스트먼트 캘린더에 추가했습니다' : '내 일정에 추가했습니다'); return refetch();
        }
        if (kind === 'td') {
          ui.lastCat = val.cat;
          const t = id ? S.todos.items.find((x) => x.id === id) : null;
          const fields = { title: val.title.trim(), cat: val.cat, due: val.due || null, note: val.note.trim() };
          if (t) Object.assign(t, fields); else S.todos.items.push({ id: uid(), ...fields, done: false, doneAt: null, created: today() });
          if (val.due) ui.selDay = val.due;
          ui.calEdit = null; await save('todos'); return draw();
        }
        const m = S.milestones.items.find((x) => x.id === id);
        const fields = { title: val.title.trim(), date: val.date, note: val.note.trim() };
        if (m) Object.assign(m, fields); else S.milestones.items.push({ id: uid(), ...fields });
        ui.selDay = val.date; ui.calEdit = null; await save('milestones'); draw();
      } catch (err) { btn.disabled = false; toast(err.message); }
    });
  };
  draw();
  if (!S.auth.connected) return;
  try {
    const r = await fetchCal(ymd(start), ymd(end));
    if (!el.isConnected || !r.connected) return;
    events = r.events || []; draw();
  } catch (e) { /* 일정 실패해도 D-day·할 일은 보인다 */ }
}

// ---------- 일정 ----------
async function fetchCal(s, e, force) {
  const key = `${s}|${e}`;
  if (CALC[key] && !force && Date.now() - CALC[key].at < 300000) return CALC[key];
  if (force) OUTLOOK.ids = null;
  const d = new Date();
  const r = { connected: true, events: await OUTLOOK.events(`${s}T00:00:00`, `${e}T00:00:00`), fetched: `${pad(d.getHours())}:${pad(d.getMinutes())}`, at: Date.now() };
  CALC[key] = r; return r;
}

function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

async function renderCalendar(force) {
  ui.calView ||= 'month';
  const seg = `<div class="seg"><button data-v="month" class="${ui.calView === 'month' ? 'on' : ''}">월간</button><button data-v="list" class="${ui.calView === 'list' ? 'on' : ''}">목록</button></div>`;
  const bindSeg = () => PAGE.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { ui.calView = b.dataset.v; renderCalendar(); }));
  if (ui.calView === 'month') {
    PAGE.innerHTML = `<div class="page-head"><h1>일정</h1><div class="tools">${seg}<button class="btn ghost" id="cal-ref">${ico('refresh', 'sm')}새로고침</button></div></div>
      <section class="card" id="cal-month"></section>`;
    bindSeg();
    $('#cal-ref').onclick = () => { CALC = {}; OUTLOOK.ids = null; renderCalendar(); };
    return mountMonth($('#cal-month'));
  }
  if (!ui.calStart) ui.calStart = weekStart(new Date());
  const s = ui.calStart, e = addDays(s, 14);
  PAGE.innerHTML = `
    <div class="page-head"><h1>일정</h1><span class="sub">${s.getMonth() + 1}/${s.getDate()} ~ ${addDays(e, -1).getMonth() + 1}/${addDays(e, -1).getDate()}</span>
      <div class="tools">${seg}
        <button class="iconbtn" id="cal-prev" title="이전 주">${ico('left')}</button>
        <button class="btn" id="cal-today">이번 주</button>
        <button class="iconbtn" id="cal-next" title="다음 주">${ico('right')}</button>
        <button class="btn ghost" id="cal-ref">${ico('refresh', 'sm')}새로고침</button>
      </div></div>
    <div id="cal-body"><div class="empty">불러오는 중…</div></div>`;
  $('#cal-prev').onclick = () => { ui.calStart = addDays(ui.calStart, -7); renderCalendar(); };
  $('#cal-next').onclick = () => { ui.calStart = addDays(ui.calStart, 7); renderCalendar(); };
  $('#cal-today').onclick = () => { ui.calStart = weekStart(new Date()); renderCalendar(); };
  $('#cal-ref').onclick = () => renderCalendar(true);
  bindSeg();

  try {
    const r = await fetchCal(ymd(s), ymd(e), force);
    if (route() !== 'calendar') return;
    const byDay = {};
    r.events.forEach((ev) => (byDay[ev.start.slice(0, 10)] ||= []).push(ev));
    const td = today();
    let html = '';
    for (let i = 0; i < 14; i++) {
      const d = addDays(s, i), k = ymd(d), list = byDay[k] || [];
      const we = d.getDay() % 6 === 0;
      if (we && !list.length) continue; // 일정 없는 주말은 접는다
      html += `<div class="cal-day ${k === td ? 'today' : ''} ${we ? 'weekend' : ''}">
        <div class="d ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}">${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})<small>${k === td ? '오늘' : ''}</small></div>
        <div>${list.length ? list.map((ev) => `<div class="ev">
          <span class="tm">${ev.allDay ? '종일' : `${ev.start.slice(11, 16)} – ${ev.end.slice(11, 16)}`}</span>
          <div><div class="s ${ev.cancelled ? 'cx' : ''}">${esc(ev.subject)}</div><div class="m">${esc([ev.location, ev.organizer].filter(Boolean).join(' · '))}</div></div>
          <span>${ev.join && !ev.cancelled ? `<a class="btn sm" href="${esc(ev.join)}" target="_blank">Teams 참가</a>` : ev.link ? `<a class="btn sm ghost" href="${esc(ev.link)}" target="_blank">Outlook에서 열기</a>` : ''}</span>
        </div>`).join('') : '<div class="m muted" style="padding:6px 0;font-size:13px">일정 없음</div>'}</div></div>`;
    }
    $('#cal-body').innerHTML = `<section class="card" style="overflow:hidden">${html}</section>
      <div class="muted" style="font-size:12px;margin-top:8px">${r.fetched} 기준</div>`;
  } catch (err) { $('#cal-body').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

// ---------- 프로그램 ----------
function renderPrograms() {
  const groups = { all: ['전체', () => true], dev: ['진행', (p) => ['아이디어', '설계', '개발 중'].includes(p.status)], run: ['운영 중', (p) => p.status === '운영 중'], hold: ['보류', (p) => p.status === '보류'] };
  const items = S.programs.items.filter(groups[ui.progTab][1]).sort((a, b) => PSTAT.indexOf(a.status) - PSTAT.indexOf(b.status));
  const sel = ui.progSel === 'new' ? { id: 'new', name: '', status: '아이디어', desc: '', location: '', memo: '' } : S.programs.items.find((p) => p.id === ui.progSel);
  const badge = (s) => `<span class="chip ${s === '개발 중' ? 'blue' : s === '운영 중' ? 'green' : ''}">${esc(s)}</span>`;
  PAGE.innerHTML = `
    <div class="page-head"><h1>프로그램</h1>
      <div class="tools"><button class="btn primary" id="p-new">${ico('plus', 'sm')}새 프로그램</button></div></div>
    <div class="${sel ? 'split' : ''}"><section class="card" style="overflow:hidden">
    <div class="tabs">${Object.entries(groups).map(([k, [lbl, f]]) => `<button data-ptab="${k}" class="${ui.progTab === k ? 'on' : ''}">${lbl}<span class="n">${S.programs.items.filter(f).length}</span></button>`).join('')}</div>
      <table class="tbl">
        <colgroup><col><col style="width:120px"><col><col style="width:96px"></colgroup>
        <thead><tr><th>이름</th><th class="chip-col">상태</th><th>위치</th><th>수정</th></tr></thead>
        <tbody>${items.map((p) => `<tr class="row ${p.id === ui.progSel ? 'sel' : ''}" data-p="${p.id}">
          <td><div class="name">${esc(p.name)}</div><div class="desc">${esc(p.desc)}</div></td><td>${badge(p.status)}</td>
          <td class="loc">${esc(p.location)}</td><td class="muted">${p.updated ? md(p.updated) : ''}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">항목이 없습니다.</div></td></tr>'}</tbody>
      </table></section>
      ${sel ? `<form class="card detail" id="pf"><h3>${sel.id === 'new' ? '새 프로그램' : '프로그램 정보'}</h3>
        <div class="field"><label>이름</label><input class="input" id="pf-name" value="${esc(sel.name)}" required></div>
        <div class="field"><label>상태</label><select class="select" id="pf-status">${PSTAT.map((s) => `<option ${s === sel.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>한 줄 설명</label><input class="input" id="pf-desc" value="${esc(sel.desc)}"></div>
        <div class="field"><label>위치 (폴더·주소)</label><input class="input" id="pf-loc" value="${esc(sel.location)}"></div>
        <div class="field"><label>메모</label><textarea class="area" id="pf-memo">${esc(sel.memo)}</textarea></div>
        <div style="display:flex;gap:8px"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" id="pf-close">닫기</button>
          ${sel.id !== 'new' ? `<button class="btn ghost" type="button" id="pf-del" style="margin-left:auto">삭제</button>` : ''}</div>
      </form>` : ''}
    </div>`;
  PAGE.querySelectorAll('[data-ptab]').forEach((b) => b.addEventListener('click', () => { ui.progTab = b.dataset.ptab; renderPrograms(); }));
  PAGE.querySelectorAll('[data-p]').forEach((r) => r.addEventListener('click', () => { ui.progSel = r.dataset.p; renderPrograms(); }));
  $('#p-new').onclick = () => { ui.progSel = 'new'; renderPrograms(); $('#pf-name').focus(); };
  if (sel) {
    $('#pf-close').onclick = () => { ui.progSel = null; renderPrograms(); };
    if ($('#pf-del')) $('#pf-del').onclick = () => {
      if (!confirm(`"${sel.name}" 항목을 삭제할까요?`)) return;
      S.programs.items = S.programs.items.filter((p) => p.id !== sel.id); ui.progSel = null; save('programs'); renderPrograms();
    };
    $('#pf').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = { name: $('#pf-name').value.trim(), status: $('#pf-status').value, desc: $('#pf-desc').value.trim(), location: $('#pf-loc').value.trim(), memo: $('#pf-memo').value, updated: today() };
      if (sel.id === 'new') { const id = uid(); S.programs.items.push({ id, ...v }); ui.progSel = id; }
      else Object.assign(sel, v);
      save('programs'); renderPrograms(); toast('저장했습니다');
    });
  }
}

// ---------- 기록 ----------
function renderNotes() {
  const q = ui.noteQ.trim().toLowerCase();
  const list = S.notes.filter((n) => !q || n.name.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q));
  if (!ui.note && S.notes.length && !isMobile()) ui.note = S.notes[0].name;
  document.body.classList.toggle('note-open', isMobile() && !!ui.noteOpen);
  PAGE.innerHTML = `
    <div class="page-head"><h1>업무일지·회의록</h1></div>
    <div class="card notes">
      <div class="notes-list">
        <div class="top">
          <div class="row"><button class="btn" data-new="daily">${ico('plus', 'sm')}업무일지</button><button class="btn" data-new="meeting">${ico('plus', 'sm')}회의록</button><button class="btn" data-new="memo">${ico('plus', 'sm')}메모</button></div>
          <input class="input" id="nq" placeholder="제목·내용 검색" value="${esc(ui.noteQ)}">
        </div>
        <ul>${list.map((n) => `<li data-n="${esc(n.name)}" class="${n.name === ui.note ? 'on' : ''}"><div class="nm">${esc(n.name.replace(/\.(txt|md)$/i, ''))}</div><div class="pv">${relTime(n.mtime)} · ${esc(n.preview.replace(/\s+/g, ' ').slice(0, 60))}</div></li>`).join('') || '<div class="empty">기록이 없습니다.</div>'}</ul>
      </div>
      <div class="editor" id="editor"><div class="empty" style="margin:auto">왼쪽에서 기록을 고르거나 새로 만드세요.</div></div>
    </div>`;
  $('#nq').addEventListener('input', (e) => { ui.noteQ = e.target.value; const pos = e.target.selectionStart; renderNotes(); const n = $('#nq'); n.focus(); n.setSelectionRange(pos, pos); });
  PAGE.querySelectorAll('[data-n]').forEach((li) => li.addEventListener('click', async () => { await flushNote(); ui.note = li.dataset.n; ui.noteOpen = true; renderNotes(); }));
  PAGE.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => newNote(b.dataset.new)));
  if (ui.note) openNote(ui.note);
}

let cur = null; // 열린 기록 { name, version, dirty }
async function openNote(name) {
  const ed = $('#editor');
  try {
    const n = await STORE.readNote(name);
    cur = { name: n.name, version: n.version, dirty: false };
    ed.innerHTML = `<div class="bar"><button class="iconbtn m-only" type="button" id="note-back" aria-label="목록" style="width:44px;height:44px">${ico('left')}</button><span class="nm">${esc(n.name.replace(/\.(txt|md)$/i, ''))}</span><span class="st" id="nst">저장됨</span></div><textarea id="nta" spellcheck="false"></textarea>`;
    $('#note-back').onclick = async () => { await flushNote(); ui.noteOpen = false; renderNotes(); };
    const ta = $('#nta'); ta.value = n.text;
    ta.addEventListener('input', () => { cur.dirty = true; $('#nst').textContent = '입력 중…'; clearTimeout(noteTimer); noteTimer = setTimeout(flushNote, 800); });
  } catch (e) { ed.innerHTML = `<div class="empty" style="margin:auto">${esc(e.message)}</div>`; }
}

async function flushNote() {
  clearTimeout(noteTimer);
  if (!cur || !cur.dirty || !$('#nta')) return;
  const text = $('#nta').value;
  try {
    cur.version = await STORE.writeNote(cur.name, text, cur.version); cur.dirty = false;
    const st = $('#nst'); if (st) { const d = new Date(); st.textContent = `저장됨 ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
    const n = S.notes.find((x) => x.name === cur.name); if (n) { n.mtime = Date.now() / 1000; n.preview = text.slice(0, 400); n.version = cur.version; }
  } catch (e) {
    toast(e.message);
    if (e.status === 409) { $('#nst').textContent = '다른 곳에서 수정됨 — 내용을 복사해 두고 다시 여세요'; }
  }
}

async function newNote(kind) {
  await flushNote();
  const d = new Date(), y = String(d.getFullYear()).slice(2), m = pad(d.getMonth() + 1), dd = pad(d.getDate()), w = WD[d.getDay()];
  const full = `${d.getFullYear()}.${m}.${dd}(${w})`;
  let name, text;
  if (kind === 'daily') { name = `업무 일지_${y}.${m}.${dd}.txt`; text = `업무 일지\n${full} Day-${workDay(today())}\n\n1. `; }
  else if (kind === 'meeting') { name = `회의록_${y}.${m}.${dd}(${w}).txt`; text = `회의록\n${full}\n참석: \n안건: \n\n1. `; }
  else { name = `메모_${y}.${m}.${dd}_${pad(d.getHours())}${pad(d.getMinutes())}.txt`; text = ''; }
  if (S.notes.some((n) => n.name === name)) {
    if (kind === 'daily') { ui.note = name; ui.noteOpen = true; toast('오늘 업무일지가 이미 있어 그 파일을 엽니다'); return renderNotes(); }
    let i = 2; const base = name.replace(/\.txt$/, ''); while (S.notes.some((n) => n.name === `${base}_${i}.txt`)) i++; name = `${base}_${i}.txt`;
  }
  try {
    await STORE.writeNote(name, text, null);
    await load(); ui.note = name; ui.noteQ = ''; ui.noteOpen = true; renderNotes();
    setTimeout(() => { const ta = $('#nta'); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }, 200);
  } catch (e) { toast(e.message); }
}

// ---------- 시작 ----------
function tick() {
  const d = new Date();
  $('#clock').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const lt = $('#live-time'); if (lt) lt.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
tick(); setInterval(tick, 1000);
window.addEventListener('beforeunload', () => { if (cur && cur.dirty) flushNote(); });
async function refresh() { // 다른 기기·Claude Code가 바꾼 내용 반영 (편집 중이 아닐 때만)
  if (!S || document.hidden || ui.todoEdit || ui.calEdit || ui.mail?.composing || (route() === 'programs' && ui.progSel) || (cur && cur.dirty) || document.activeElement?.matches('input,textarea,select')) return;
  const sig = () => JSON.stringify([S.todos.version, S.programs.version, S.milestones.version, S.briefing.mtime, S.notes.map((n) => n.version)]);
  const before = sig();
  try { await load(); } catch { return; }
  if (before !== sig() && !['notes', 'mail'].includes(route())) render();
}
setInterval(refresh, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { CALC = {}; refresh(); } });

function loginScreen(msg) {
  document.body.classList.add('signed-out');
  $('#login').innerHTML = `<div class="login-box">
    <div class="brand-mark">SPACE WORKS</div>
    <p class="muted">${msg ? esc(msg) : 'jw.tak@spaceinve.com'}</p>
    <button class="btn primary" id="login-go" style="width:100%;height:44px">회사 계정으로 로그인</button>
    ${G.wrongAccount ? '<button class="btn ghost" id="login-out" style="width:100%;margin-top:8px">다른 계정 로그아웃</button>' : ''}
  </div>`;
  $('#login-go').onclick = () => G.login();
  if ($('#login-out')) $('#login-out').onclick = () => G.logout();
}

$('#me')?.addEventListener('click', () => { if (S) accountMenu(); });
async function start() {
  try {
    if (!(await G.init())) return loginScreen(G.wrongAccount ? `${G.wrongAccount} 계정으로는 열 수 없습니다` : '');
    document.body.classList.remove('signed-out');
    PAGE.innerHTML = '<div class="empty">불러오는 중…</div>';
    await load();
    render();
  } catch (e) {
    PAGE.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // 앱을 다시 열 때마다 새 버전 확인 → 새 서비스워커가 자리 잡으면, 작성 중인 내용이 없을 때 한 번 새로 고침
  document.addEventListener('visibilitychange', () => { if (!document.hidden) navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); });
  let reloaded = false; const hadController = !!navigator.serviceWorker.controller; // 첫 설치 때는 새로 고치지 않음
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded || (cur && cur.dirty) || ui.mail?.compose || document.activeElement?.matches('input,textarea')) return;
    reloaded = true; location.reload();
  });
}
start();
