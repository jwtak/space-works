/* SPACE WORKS — 화면 로직 (프레임워크 없음). 데이터·로그인은 graph.js */
const $ = (s, el = document) => el.querySelector(s);
const PAGE = $('#page');
const CATS = ['법인설립', '금감원', '사무실 세팅', '회사소개·대외', '투자·딜', '개발', '기타'];
const PSTAT = ['아이디어', '설계', '개발 중', '운영 중', '보류'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const DAY1 = '2026-11-02'; // 입사 첫날 = Day-1 (업무일지 표기)

let S = null;            // 할 일·프로그램·D-day·브리핑·기록 목록
let CALC = {};           // 일정 캐시 key → 응답
let ui = { todoTab: viewGet('todoTab', 'open'), todoEdit: null, progSel: viewGet('progSel', null), progTab: viewGet('progTab', 'all'), note: viewGet('note', null), noteQ: viewGet('noteQ', ''), noteOpen: viewGet('noteOpen', false), calStart: null };
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
// 목록 날짜(예심청구·신규상장·파이프라인 등): 해에 따라 형식이 달라지지 않게 늘 26.07.31
const yymd = (s) => `${s.slice(2, 4)}.${s.slice(5, 7)}.${s.slice(8, 10)}`;
const mdw = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const uid = () => Math.random().toString(16).slice(2, 10);
// 날짜 칸에 월·일만 치면 연도가 2000처럼 엉뚱하게 들어갈 수 있다: 올해 앞뒤 범위를 벗어나면 올해로 고친다
const fixYmd = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return v; const y = +v.slice(0, 4), now = new Date().getFullYear(); return y < now - 1 || y > now + 5 ? `${now}${v.slice(4)}` : v; };
document.addEventListener('focusout', (e) => { const el = e.target; if (el.type === 'date' && el.value && fixYmd(el.value) !== el.value) el.value = fixYmd(el.value); }, true);
const isMobile = () => matchMedia('(max-width: 760px)').matches;
/* 보던 자리(탭·필터·정렬·검색어·보던 달·펼친 항목)를 새로 고침(F5) 뒤에도 그대로 — 창마다 따로라 sessionStorage (2026-11-10 사용자).
   값은 JSON. Set은 배열로 넣고 꺼낼 때 new Set(...)으로. 저장 못 하는 환경이면 기본값. */
function viewGet(key, def) { try { const v = sessionStorage.getItem('v:' + key); return v == null ? def : JSON.parse(v); } catch { return def; } }
function viewSet(key, val) { try { sessionStorage.setItem('v:' + key, JSON.stringify(val instanceof Set ? [...val] : val)); } catch { /* 기억 못 해도 된다 */ } }
function openSheet(html, mount, cls = '') { // 아래에서 올라오는 패널(데스크톱은 가운데 창)
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="handle"></div>${html}</div>`;
  const close = (viaBack) => { // viaBack === true: 뒤로 가기·메뉴 이동으로 닫힘
    if (!wrap.isConnected) return;
    wrap.remove(); document.removeEventListener('keydown', onKey);
    if (viaBack !== true) off();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  let downOut = false; const openedAt = Date.now();
  wrap.addEventListener('mousedown', (e) => { downOut = e.target === wrap; });
  wrap.addEventListener('click', (e) => { if (e.target === wrap && downOut && Date.now() - openedAt > 300) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  const off = pushLayer(() => close(true), () => close(true));
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
  const prevN = S?.notes || [], prevT = prevN.filter((n) => n.team);
  const [todos, programs, milestones, brief, mine, team] = await Promise.all([
    STORE.readJSON('todos'), STORE.readJSON('programs'), STORE.readJSON('milestones'),
    STORE.readText('data/briefing.md'), STORE.listNotes(prevN.filter((n) => !n.team)),
    STORE.listTeamNotes(prevT).catch(() => prevT), // 팀 회의록을 못 읽어도 내 기록은 보인다
    ttLoad().catch(() => false), // 팀 할 일도 같이(못 읽으면 지난 것 그대로)
  ]);
  const notes = [...mine, ...team].sort((a, b) => b.mtime - a.mtime);
  const me = S?.me || await G.get('/me?$select=displayName,jobTitle,department,mail').catch(() => ({}));
  S = { todos, programs, milestones, briefing: { text: brief.text, mtime: brief.mtime }, notes, me, auth: { connected: true, upn: G.account.username } };
  meChrome();
  counts(); foot(); mailUnread(); if (mailSeen === null) mailNotify();
  if (typeof rqInit === 'function') rqInit();
  tcSync(1500); // 할 일 마감 일정 맞추기(바뀐 게 없으면 서버를 부르지 않는다)
}

/* 로그인한 사람 이름·직급 (대표님도 각자 계정으로 쓴다) */
const myName = () => (S?.me?.displayName || G.account?.name || '').replace(/\s*\(.*\)$/, '');
// 회사 계정에 부서·직급이 비어 있으면 이 표로 채운다
const TITLES = { 'jw.tak@universeinvest.co.kr': ['투자운용본부', '대리'], 'sunyeul.yu@universeinvest.co.kr': ['', '대표'], 'chungjun.bae@universeinvest.co.kr': ['', '대표'], 'jw.tak@spaceinve.com': ['투자운용본부', '대리'], 'sunyeul.yu@spaceinve.com': ['', '대표'], 'chungjun.bae@spaceinve.com': ['', '대표'] };
// 일정 담당자: Outlook 분류(categories)에 이름으로 저장. 분류가 없으면 제목 앞 "(탁지원)"에서 읽는다
const PEOPLE = ['탁지원', '유선열', '배청준'];
function evOwners(e) {
  const c = (e?.categories || []).filter((x) => PEOPLE.includes(x));
  if (c.length) return c;
  const m = /^\s*[(\[]([^)\]]+)[)\]]/.exec(e?.subject || '');
  return m ? PEOPLE.filter((p) => m[1].includes(p)) : [];
}
const myTitle = () => S?.me?.jobTitle || (TITLES[(G.account?.username || '').toLowerCase()] || [])[1] || '';
const myRole = () => [S?.me?.department || (TITLES[(G.account?.username || '').toLowerCase()] || [])[0], myTitle()].filter(Boolean).join(' · ');
function meChrome() {
  const b = $('#me'); if (!b) return;
  const n = myName();
  b.innerHTML = `<span class="avatar">${esc(n.slice(0, 1))}</span>${esc(n)}${myTitle() ? ' ' + esc(myTitle()) : ''}`;
  if (!G.isOwner) CALS[0].sub = '팀 공유';
}

/* 저장은 파일마다 한 줄로: 앞 저장이 끝나기 전에 또 바꾸면 끝난 뒤 최신 내용으로 한 번 더 저장한다
   (같은 버전으로 두 번 보내 거짓 충돌이 나거나, 두 번째 변경이 사라지지 않게) */
const SAVING = {};
function save(coll) {
  const q = (SAVING[coll] ||= { p: null, again: false });
  if (q.p) { q.again = true; return q.p; }
  q.p = (async () => {
    do {
      q.again = false;
      try {
        const v = await STORE.writeJSON(coll, S[coll].items, S[coll].version);
        S[coll].version = v; counts();
      } catch (e) {
        toast(e.message);
        if (e.status === 409) { q.again = false; q.p = null; await load(); render(); return; }
        break;
      }
    } while (q.again);
  })().finally(() => { q.p = null; if (coll === 'todos') tcSync(); });
  return q.p;
}
const saving = () => Object.values(SAVING).some((q) => q.p) || TT.busy > 0;

/* ---------- 팀 할 일(맡기기, 2026-11-12): 팀 파일함 '_웍스/할일.json' 하나를 세 사람이 같이 쓴다 ----------
   항목 { id, title, due, cat, memo, assignee, by, at, done, doneAt } — assignee·by는 이메일.
   내 목록 = 내 OneDrive todos.json + 나에게 맡겨진 팀 할 일. '맡긴 일' 탭 = 내가 남에게 맡긴 것.
   저장은 요청사항(feedback.js)처럼 eTag로 충돌을 막고, 겹치면 다시 읽어 다시 적용한다 — 바꾸는 함수는 여러 번 적용돼도 같은 결과여야 한다 */
const PEOPLE_MAIL = { 탁지원: 'jw.tak@universeinvest.co.kr', 유선열: 'sunyeul.yu@universeinvest.co.kr', 배청준: 'chungjun.bae@universeinvest.co.kr' };
const mailId = (s) => String(s || '').toLowerCase().split('@')[0]; // 옛 주소(@spaceinve.com)도 같은 사람
const isMe = (email) => !!email && mailId(email) === mailId(G.account?.username);
const personName = (email) => Object.keys(PEOPLE_MAIL).find((n) => mailId(PEOPLE_MAIL[n]) === mailId(email)) || mailId(email);
const TT_PATH = '_웍스/할일.json';
const TT = { items: [], etag: null, loaded: false, gen: 0, busy: 0, q: Promise.resolve() };
const ttUrl = () => `/drives/${CFG.teamDrive}/root:/${TT_PATH.split('/').map(encodeURIComponent).join('/')}:`;
const isTT = (t) => TT.items.includes(t);
const ttCan = (t) => isMe(t.assignee) || isMe(t.by); // 완료·수정·삭제는 담당자와 만든 사람만
const ttGiven = () => TT.items.filter((t) => isMe(t.by) && !isMe(t.assignee));
const todoAll = () => [...S.todos.items, ...TT.items.filter((t) => isMe(t.assignee))];
const todoFind = (id) => S.todos.items.find((x) => x.id === id) || TT.items.find((x) => x.id === id && ttCan(x));
const tMemo = (t) => (isTT(t) ? t.memo : t.note) || '';
const ttWho = (t) => (isTT(t) ? `<span class="tt-who">${esc(`${isMe(t.by) ? '나' : personName(t.by)} → ${isMe(t.assignee) ? '나' : personName(t.assignee)}`)}</span>` : '');
const whoOpts = () => Object.entries(PEOPLE_MAIL).filter(([, m]) => !isMe(m));

// inSave: ttSave 안에서 부를 때. 밖에서 부른 읽기는 저장 중이거나 그사이 저장이 있었으면 버린다(false)
async function ttLoad(inSave) {
  const g = TT.gen;
  let items = [], etag = null;
  try {
    const meta = await G.get(`${ttUrl()}?$select=eTag`);
    const d = JSON.parse((await G.get(`${ttUrl()}/content`, { type: 'text' })) || '{}');
    items = Array.isArray(d.items) ? d.items.filter((x) => x && typeof x === 'object' && x.id) : []; etag = meta.eTag;
  } catch (e) { if (e.status !== 404) throw e; } // 404 = 아직 아무도 안 맡김
  if (inSave !== true && (g !== TT.gen || TT.busy)) return false;
  TT.items = items; TT.etag = etag; TT.loaded = true;
  return true;
}
// 다른 사람이 먼저 저장했으면(412·409) 다시 읽고 다시 적용. 다시 읽었으면 true(남이 바꾼 것도 화면에 반영)
async function ttSave(fn) {
  TT.gen++;
  try {
    if (!TT.loaded) await ttLoad(true); // 처음 읽기가 실패했으면 먼저 읽는다(빈 목록으로 남의 할 일을 덮지 않게)
    for (let i = 0; i < 4; i++) {
      if (i) await ttLoad(true);
      fn(TT.items);
      try {
        const r = await G.put(`${ttUrl()}/content${TT.etag ? '' : '?@microsoft.graph.conflictBehavior=fail'}`, JSON.stringify({ items: TT.items }, null, 1),
          { headers: { 'Content-Type': 'application/json', ...(TT.etag ? { 'If-Match': TT.etag } : {}) } });
        TT.etag = r?.eTag || null;
        return i > 0;
      } catch (e) { if (![409, 412].includes(e.status)) throw e; }
    }
    throw new Error('다른 사람이 동시에 고치고 있습니다. 잠시 후 다시 해 주세요');
  } finally { TT.gen++; }
}
// 화면에 먼저 적용하고 저장은 줄을 세운다. 실패하면 다시 읽어 저장 안 된 변경을 걷어낸다
function ttAct(fn, msg) {
  fn(TT.items); TT.busy++; TT.gen++; counts();
  return (TT.q = TT.q.then(async () => {
    let redraw = false;
    try { redraw = await ttSave(fn); if (msg) toast(msg); } catch (e) { toast(e.message); TT.loaded = false; await ttLoad(true).catch(() => {}); redraw = true; }
    finally { TT.busy--; counts(); tcSync(); }
    if (redraw && ['home', 'todos', 'calendar'].includes(route()) && !ui.todoEdit && !ui.calEdit && !document.activeElement?.matches('input,textarea,select')) render();
  }));
}
const ttNew = (f) => ({ id: uid(), title: f.title, due: f.due || null, cat: f.cat, memo: f.memo || '', assignee: f.assignee, by: (G.account?.username || '').toLowerCase(), at: new Date().toISOString(), done: false, doneAt: null });
const ttAdd = (item) => ttAct((items) => { if (!items.some((x) => x.id === item.id)) items.push(item); }, `${personName(item.assignee)}님께 맡겼습니다`);
const ttSet = (id, f) => ttAct((items) => { const x = items.find((i) => i.id === id); if (x && ttCan(x)) Object.assign(x, f); });
const ttDel = (id) => ttAct((items) => { for (let i = items.length - 1; i >= 0; i--) if (items[i].id === id && ttCan(items[i])) items.splice(i, 1); }, '삭제했습니다');

/* ---------- 할 일 마감 → 내 Outlook 캘린더 종일 일정 (2026-11-14 사용자 "내 캘린더에 종일 일정으로") ----------
   대상: 내 목록의 할 일(내 할 일 + 나에게 맡겨진 팀 할 일) 중 마감 있고 안 끝난 것. 내가 남에게 맡긴 일은 넣지 않는다.
   연결 표: 내 OneDrive data/todo_cal.json { 할 일 id: { id: 일정 id, due, title, team? } }. todos.json은 배열이고 브리핑(run.py)·Claude Code가
   그대로 읽어서 형식을 바꾸지 않고 따로 둔다. 팀 할 일도 같은 표(팀 파일에 내 일정 id를 남기지 않게).
   맞추기: 할 일을 저장한 뒤·앱을 열거나 다시 읽은 뒤(바꿀 게 없으면 서버를 부르지 않는다). 실패한 것은 표를 그대로 두어 다음에 다시.
   Outlook에서 지운 일정(404)은 마감·제목이 바뀔 때만 새로 만든다. 그대로면 지운 뜻을 따른다.
   웍스 달력에는 할 일이 따로 보이므로 이 일정은 fetchCal에서 뺀다(tcIsEv). */
const TC = { map: null, version: null, at: 0, ids: new Set(), busy: false, again: false, timer: null, dirty: false };
const tcIsEv = (e) => e.cal === 'me' && (TC.ids.has(e.id) || (e.allDay && String(e.subject).startsWith(OUTLOOK.TODO_PREFIX)));
const tcIndex = () => { TC.ids = new Set(Object.values(TC.map || {}).map((m) => m.id)); };
async function tcLoad() {
  const r = await STORE.readJSON('todo_cal');
  TC.map = r.items && typeof r.items === 'object' && !Array.isArray(r.items) ? r.items : {};
  TC.version = r.version; TC.at = Date.now(); tcIndex();
}
function tcWant() {
  const w = {};
  for (const t of todoAll()) if (t.due && !t.done && t.title) w[t.id] = { due: t.due, title: t.title, ...(isTT(t) ? { team: true } : {}) };
  return w;
}
function tcPlan() {
  const want = tcWant(), M = TC.map, ops = [];
  for (const [tid, w] of Object.entries(want)) {
    if (!M[tid]) ops.push({ k: 'add', tid, w });
    else if (M[tid].due !== w.due || M[tid].title !== w.title) ops.push({ k: 'set', tid, w });
  }
  for (const [tid, m] of Object.entries(M)) if (!want[tid] && !(m.team && !TT.loaded)) ops.push({ k: 'del', tid }); // 팀 할 일을 못 읽은 동안엔 지우지 않는다
  return ops;
}
async function tcDo(op, made) {
  const m = TC.map[op.tid];
  try {
    if (op.k === 'del') { if (m?.id) await OUTLOOK.todoRemove(m.id); delete TC.map[op.tid]; TC.dirty = true; return; }
    if (op.k === 'set') {
      try { await OUTLOOK.todoUpdate(m.id, op.w); TC.map[op.tid] = { id: m.id, ...op.w }; TC.dirty = true; return; }
      catch (e) { if (e.status !== 404) throw e; } // Outlook에서 지웠다 + 마감·제목이 바뀌었다: 새로 만든다
    }
    const ev = await OUTLOOK.todoCreate(op.w);
    TC.map[op.tid] = { id: ev.id, ...op.w }; TC.dirty = true; made.push([op.tid, ev.id]);
  } catch { /* 표를 그대로 두면 다음에 다시 */ }
}
// 다른 기기가 표를 먼저 고쳤으면(409) 그쪽 표를 받아, 이번에 만든 일정만 얹는다. 같은 할 일을 그쪽이 먼저 만들었으면 내 것을 지운다
async function tcSave(made) {
  if (!TC.dirty) return;
  for (let i = 0; i < 3; i++) {
    try { TC.version = await STORE.writeJSON('todo_cal', TC.map, TC.version); TC.dirty = false; TC.at = Date.now(); tcIndex(); return; } catch (e) {
      if (e.status !== 409) throw e;
      const mine = TC.map; await tcLoad();
      for (const [tid, id] of made) {
        const r = TC.map[tid];
        if (r && r.id !== id) OUTLOOK.todoRemove(id).catch(() => {});
        else if (mine[tid]?.id === id) TC.map[tid] = mine[tid];
      }
      TC.again = true; // 고치기·지우기는 받은 표로 다시 계산
    }
  }
  throw new Error('todo_cal 저장 충돌');
}
async function tcPass() {
  if (!TC.map) await tcLoad();
  let ops = tcPlan();
  if (!ops.length) return;
  if (Date.now() - TC.at > 30000) { await tcLoad(); ops = tcPlan(); if (!ops.length) return; } // 다른 기기가 이미 맞췄을 수 있다
  const made = [];
  for (let i = 0; i < ops.length; i += 3) { // 처음 켤 때 한꺼번에 생겨도 3개씩 차례로
    if (i) await new Promise((r) => setTimeout(r, 300));
    await Promise.all(ops.slice(i, i + 3).map((op) => tcDo(op, made)));
    await tcSave(made);
  }
  if (made.length > 1) toast(`할 일 마감 ${made.length}건을 내 캘린더에 넣었습니다`);
}
async function tcRun() {
  if (TC.busy) { TC.again = true; return; }
  TC.busy = true;
  try { do { TC.again = false; await tcPass(); } while (TC.again); } catch { /* 다음 저장·새로 읽기 때 다시 */ } finally { TC.busy = false; }
}
function tcSync(delay = 800) { // 잇달아 바꿔도 한 번에
  if (!S || !G.account || !G.isOwner) return; // 지금은 탁지원 계정만(11/14). 대표님 캘린더에는 묻기 전까지 만들지 않는다
  clearTimeout(TC.timer); TC.timer = setTimeout(tcRun, delay);
}

// 왼쪽 메뉴 '메일' 옆 숫자 = 받은편지함 안 읽은 메일 (1분마다, 메일 화면에선 폴더 개수와 같이 갱신)
function setMailCnt(n) {
  document.querySelectorAll('[data-cnt=mail]').forEach((el) => { el.textContent = n ? (n > 999 ? '999+' : n) : ''; });
}
async function mailUnread() {
  if (!S || document.hidden) return;
  try {
    const n = (await G.get('/me/mailFolders/inbox?$select=unreadItemCount')).unreadItemCount;
    setMailCnt(n);
    // Outlook·폰에서 읽음/안 읽음을 바꾸면 새 메일이 없어도 폴더 숫자가 낡는다 → 받은편지함 숫자가 다르면 폴더 숫자도 다시 읽기
    const c = route() === 'mail' && ui.mail?.counts?.inbox;
    if (c && c.unread !== n) mailLoadCounts();
  } catch { /* 숫자는 없어도 된다 */ }
}
setInterval(mailUnread, 60000);
document.addEventListener('visibilitychange', mailUnread);

/* 새 메일 알림(PC, 2026-11-10 사용자): 1분마다 받은편지함 최신 메일을 보고, 마지막으로 본 것보다 새로 온 안 읽은 메일을 알린다.
   웍스 창을 보고 있으면 화면 안 토스트, 아니면(최소화·다른 창) 윈도우 알림. 창이 숨어 있어도 돈다. 폰은 앱이 꺼지면 못 돌아 뺌.
   기준 시각은 서버 시간(receivedDateTime)으로 잡는다 — 처음 켤 때 쌓여 있던 메일은 알리지 않는다. 알림 tag=메일 id라 창이 여러 개여도 한 번. */
let mailSeen = null;
async function mailNotify() {
  if (!S || isMobile() || !('Notification' in window)) return;
  try {
    const j = await G.get('/me/mailFolders/inbox/messages?$top=10&$orderby=receivedDateTime desc&$select=id,subject,from,receivedDateTime,isRead');
    const at = (x) => Date.parse(x.receivedDateTime) || 0, top = j.value.length ? at(j.value[0]) : 0;
    if (mailSeen === null) { mailSeen = top; return; }
    const fresh = j.value.filter((x) => at(x) > mailSeen && !x.isRead).reverse();
    if (top > mailSeen) mailSeen = top;
    if (!fresh.length) return;
    mailUnread();
    if (route() === 'mail' && ui.mail) mailLoadCounts(); // 폴더 옆 안 읽은 수·'0 / 74'도 같이(목록만 새로 읽어 숫자가 남던 것)
    if (route() === 'mail' && ui.mail?.folder === 'inbox' && !ui.mail.q && ui.mail.view !== 'read' && !ui.mail.compose) mailLoadList();
    for (const x of fresh) {
      const who = x.from?.emailAddress?.name || x.from?.emailAddress?.address || '';
      if (document.hasFocus()) { toast(`새 메일 · ${who} · ${x.subject || '(제목 없음)'}`); continue; }
      if (Notification.permission !== 'granted') continue;
      const n = new Notification(who || '새 메일', { body: x.subject || '(제목 없음)', tag: x.id, icon: 'icons/icon-192.png' });
      n.onclick = () => { window.focus(); n.close(); mailGoto(x.id); };
    }
  } catch { /* 다음 분에 다시 */ }
}
setInterval(mailNotify, 60000);
// 알림 허용은 PC에서 처음 화면을 누를 때 한 번 묻는다(브라우저가 클릭 없이 묻는 창은 막음)
addEventListener('pointerdown', () => {
  if (!isMobile() && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
}, { once: true });
async function mailGoto(id) {
  const m = mailState();
  if (route() !== 'mail') { location.hash = '#mail'; await new Promise((r) => setTimeout(r, 50)); }
  if (m.folder !== 'inbox' || m.q) { mailFolderSet(m, 'inbox'); m.q = ''; mailDrawFolders(); mailLoadList(); }
  mailOpen(id);
}

function counts() {
  const all = todoAll(); // 나에게 맡겨진 팀 할 일 포함
  const open = all.filter((t) => !t.done).length;
  document.querySelectorAll('[data-cnt=todos]').forEach((el) => { el.textContent = open || ''; });
  const urgent = all.filter((t) => !t.done && t.due && t.due <= today()).length;
  document.querySelectorAll('[data-badge=todos]').forEach((el) => { el.textContent = urgent || ''; });
  document.querySelectorAll('[data-cnt=programs]').forEach((el) => { el.textContent = S.programs.items.filter((p) => ['설계', '개발 중'].includes(p.status)).length || ''; });
}

function accountMenu() {
  openSheet(`<h3>메뉴</h3><div class="who" style="font-size:14px;color:var(--text3);margin:-6px 0 8px">${esc(S.auth.upn)}</div>
    <ul class="menu">
      <li><a href="#deals" data-close>${ico('ticket')}딜소싱</a></li>
      <li><a href="#programs" data-close>${ico('box')}프로그램</a></li>
      <li><button type="button" id="m-guide">${ico('flag')}사용 안내</button></li>
      ${typeof pushMenuItem === 'function' ? pushMenuItem() : ''}
      <li><button type="button" id="m-req">${ico('spark')}요청사항<span class="cnt" data-cnt="req" style="margin-left:auto"></span></button></li>
      <li><button type="button" id="m-refresh">${ico('refresh')}새로고침</button></li>
      <li><button type="button" id="m-logout">${ico('ext')}로그아웃</button></li>
    </ul>`, (el, close) => {
    el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', close));
    el.querySelector('#m-refresh').onclick = async () => { close(); CALC = {}; await load(); render(); toast('최신 내용으로 바꿨습니다'); };
    el.querySelector('#m-logout').onclick = () => G.logout();
    el.querySelector('#m-req').onclick = () => { close(); if (typeof rqOpen === 'function') rqOpen(); };
    el.querySelector('#m-guide').onclick = () => { close(); setTimeout(() => gdOpen(true), 150); };
    el.addEventListener('click', (e) => { if (e.target.closest('[data-push-toggle]') && typeof pushToggle === 'function') pushToggle(); }); // 폰 알림 켜기·끄기(push.js)
    if (typeof rqCount === 'function') rqCount();
  });
}

function foot() {
  $('#side-foot').innerHTML = `<button type="button" class="side-guide" id="side-guide">${ico('help')}사용 안내</button><div class="who"><span class="dot ok"></span>${esc(S.auth.upn)}</div><button class="btn ghost sm" id="logout" style="padding:0;height:24px">로그아웃</button>`;
  $('#logout').onclick = () => G.logout();
  $('#side-guide').onclick = () => { if (typeof gdOpen === 'function') gdOpen(true); };
}

// ---------- 라우팅 ----------
const route = () => (location.hash || '#home').slice(1);
// 화면 설명(ⓘ): 키는 route(딜소싱은 'deals/<탭>'), 값 {title, rows: [[소제목, 글 또는 글 배열]]}. 각 화면 js가 채우고, 요약 줄(엑셀·새로고침 앞)에 infoBtn(키)로 버튼을 둔다
const TAB_INFO = {};
function infoOpen(k) {
  const x = TAB_INFO[k]; if (!x) return;
  // 글: 문자열 = 문단, 배열 = 목록, {table: [[머리...], [행...], ...]} = 표. 배열 안에 표·문단을 섞어도 된다
  const one = (t) => (t && t.table ? `<div class="info-tbl"><table><thead><tr>${t.table[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.table.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p>${esc(t)}</p>`);
  const body = (t) => (Array.isArray(t) ? `<ul>${t.map((s) => (typeof s === 'string' ? `<li>${esc(s)}</li>` : `</ul>${one(s)}<ul>`)).join('')}</ul>`.replace(/<ul><\/ul>/g, '') : one(t));
  const main = `${x.asof ? `<div class="info-asof">${esc(x.asof)}</div>` : ''}<dl class="info-dl">${x.rows.map(([h, t]) => `<dt>${esc(h)}</dt><dd>${body(t)}</dd>`).join('')}</dl>`;
  openSheet(`<div class="info-head"><h3>${esc(x.title)}</h3><button class="btn sm" type="button" data-info-win>${ico('ext', 'sm')}새 창에서 열기</button></div>${main}`, (el) => {
    // 새 창: 같은 내용을 웍스 글꼴·스타일만 입힌 HTML(blob)로 새 탭에 연다. 로그인·스크립트가 필요 없다
    el.querySelector('[data-info-win]').onclick = () => {
      const css = (f) => `<link rel="stylesheet" href="${esc(new URL(f, location.href).href)}">`;
      const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(x.title)} · 화면 설명</title>${css('fonts/pretendard.css')}${css('style.css')}
        <style>html, body { height: auto; } body { background: var(--card); } .info-page { max-width: 1120px; margin: 0 auto; padding: 40px 32px 64px; } .info-page h3 { margin: 0 0 4px; font-size: 24px; line-height: 32px; } @media (max-width: 760px) { .info-page { padding: 24px 16px 48px; } }</style></head>
        <body><main class="info-page"><h3>${esc(x.title)}</h3>${main}</main></body></html>`;
      window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank', 'noopener');
    };
  }, 'info');
}
const infoBtn = (k) => (TAB_INFO[k] ? `<button class="btn ghost info-btn" type="button" data-info="${esc(k)}" aria-label="화면 설명">${ico('info', 'sm')}<span class="info-txt">화면 설명</span></button>` : '');
document.addEventListener('click', (e) => { const b = e.target.closest('[data-info]'); if (b) infoOpen(b.dataset.info); });
const CRUMB = { home: '대시보드', todos: '할 일', calendar: '일정', mail: '메일', news: '뉴스', deals: '딜소싱', pipeline: '파이프라인', market: '시장동향', weekly: '주간회의', files: '공용 폴더', corp: '법인설립', fss: '금감원 면담', notes: '업무일지·회의록', programs: '프로그램', homepage: '홈페이지' };
function render() {
  if (!S) return; // 로그인·데이터 읽기 전 hashchange
  let r = route();
  if (r === 'deals' || r.startsWith('deals/')) { ui.dealTab = dealSub(r.slice(6)); r = DEAL_PAGE[ui.dealTab] || 'deals'; } // #deals/ipo → 딜소싱 > 상장 > 신규상장, #deals/news → 뉴스
  if (r.startsWith('market/')) r = 'market'; // 시장동향 > 공모주 통계·PE 동향
  for (const k of ['files', 'weekly']) if (r === k || r.startsWith(`${k}/`)) { try { ui.filesPath = decodeURIComponent(r.slice(k.length + 1)); } catch { ui.filesPath = ''; } r = k; } // #files/00. 전체 공유/01. 명함 → 공용 폴더의 그 폴더
  r = CRUMB[r] ? r : 'home';
  document.querySelectorAll('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === r));
  document.body.dataset.route = r;
  if (r !== 'notes') { document.body.classList.remove('note-open'); if (cur?.dirty) flushNote(); } // 업무일지를 쓰다 다른 메뉴로 가도 저장
  $('#crumb').textContent = CRUMB[r];
  ({ home: renderHome, todos: renderTodos, calendar: renderCalendar, mail: renderMail, news: renderDeals, deals: renderDeals, pipeline: renderDeals, market: () => (typeof renderMarket === 'function' ? renderMarket() : (PAGE.innerHTML = '<div class="card"><div class="empty">준비 중</div></div>')), weekly: () => renderFiles(PAGE, 'weekly'), files: () => (typeof renderFiles === 'function' ? renderFiles(PAGE) : (PAGE.innerHTML = '<div class="card"><div class="empty">준비 중</div></div>')), corp: () => renderPrep(PAGE, 'corp'), fss: () => renderPrep(PAGE, 'fss'), programs: renderPrograms, notes: renderNotes, homepage: renderHomepage }[r] || renderHome)();
  segFit(PAGE.querySelector('.deal-seg')); // 딜소싱·시장동향 탭 줄
  segFit(PAGE.querySelector('.deal-sub')); // 하위 탭 줄(타깃 다섯 탭은 1100보다 좁으면 넘친다)
}
window.addEventListener('hashchange', render);
// '메일' 메뉴: 다른 메뉴에서 오면 받은편지함부터(mailInboxReset). 메일 화면에서 다시 누르면 주소가 같아 hashchange가 안 오니 직접 받은편지함으로
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-r="mail"]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || typeof mailHome !== 'function') return;
  if (route() !== 'mail') { mailInboxReset(); return; }
  e.preventDefault(); mailHome();
});

/* 뒤로 가기: 화면 안에서 한 겹(창·패널·메일 읽기·상세) 열 때마다 기록을 하나 쌓고, 뒤로 가면 맨 위 한 겹만 닫는다.
   앱 안 버튼으로 닫은 겹의 기록은 지우지 않는다(history.go를 섞으면 메뉴 이동과 꼬인다). 대신 뒤로 갈 때 건너뛴다. */
const LAYERS = []; // { depth, route, close, leave }
let hSeq = 0, hCur = 0, hRoute = route(), hSkipping = false;
// 번호는 시각 기준: 새로 고친 뒤에 쌓는 기록이 그 전 기록보다 항상 크다(뒤로/앞으로 구분)
const hStamp = (layer) => { hSeq = Math.max(Date.now(), hSeq + 1); hCur = hSeq; return { layer, seq: hCur }; };
if (!history.state?.seq) history.replaceState(hStamp(0), ''); else hCur = history.state.seq;
// close: 뒤로 가기로 닫을 때(false를 돌려주면 안 닫힘), leave: 다른 메뉴로 옮길 때. 돌려주는 함수는 앱 안에서 닫았을 때 부른다
function pushLayer(close, leave) {
  const L = { depth: (history.state?.layer || 0) + 1, route: route(), close, leave };
  history.pushState(hStamp(L.depth), '');
  LAYERS.push(L);
  return () => { const i = LAYERS.indexOf(L); if (i >= 0) LAYERS.splice(i, 1); };
}
window.addEventListener('hashchange', () => {
  if (!history.state?.seq) history.replaceState(hStamp(0), ''); // 새로 연 메뉴 기록에도 번호
  const r = route();
  LAYERS.filter((L) => L.route !== r).forEach((L) => { LAYERS.splice(LAYERS.indexOf(L), 1); L.leave?.(); });
});
window.addEventListener('popstate', async (e) => {
  // 번호 없는 기록 = 방금 링크·주소로 새로 이동한 것(같은 주소 링크를 다시 눌러도 온다). 뒤로 가기가 아니다
  if (!e.state) { history.replaceState(hStamp(0), ''); hRoute = route(); hSkipping = false; return; }
  const st = e.state, d = st.layer || 0, r = route(), crossed = r !== hRoute;
  const back = !st.seq || st.seq < hCur;
  hCur = st.seq || hCur; hRoute = r;
  if (!back) { hSkipping = false; return; } // 앞으로 가기는 그대로
  let closed = false;
  for (const L of LAYERS.filter((x) => x.route === r && x.depth > d).sort((a, b) => b.depth - a.depth)) {
    LAYERS.splice(LAYERS.indexOf(L), 1);
    if ((await L.close()) === false) { // 닫지 않기로 함(작성 중인 메일 등): 기록을 다시 쌓는다
      L.depth = (history.state?.layer || 0) + 1; history.pushState(hStamp(L.depth), ''); LAYERS.push(L); hSkipping = false; return;
    }
    closed = true;
  }
  if (d > 0 && !LAYERS.some((L) => L.route === r && L.depth === d)) { if (!hSkipping) hSkipping = closed || crossed ? 'done' : 'none'; history.back(); return; } // 이미 닫힌 겹의 기록
  if (hSkipping) { const k = hSkipping; hSkipping = false; if (k === 'none' && !closed && !crossed) history.back(); return; } // 건너뛰는 동안 아무것도 안 닫혔으면 한 번 더
  if (!closed && !crossed) history.back(); // 누른 뒤로 가기가 화면에 아무 변화도 없었으면 한 번 더
});

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
const sortTodos = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.created || a.at || '').localeCompare(b.created || b.at || '');

function toggleTodo(id) {
  const t = todoFind(id); if (!t) return;
  if (isTT(t)) { const to = !t.done; ttSet(id, { done: to, doneAt: to ? today() : null }); render(); return; }
  t.done = !t.done; t.doneAt = t.done ? today() : null;
  save('todos'); render();
}

// ---------- 홈 ----------
function greet(h) { return h < 6 ? '늦은 시간까지 수고 많으십니다' : h < 12 ? '좋은 아침입니다' : h < 18 ? '좋은 오후입니다' : '오늘도 수고 많으셨습니다'; }

function renderHome() {
  if (isMobile()) return renderHomeMobile();
  const td = today(), d = new Date(), all = todoAll();
  const open = all.filter((t) => !t.done);
  const over = open.filter((t) => t.due && t.due < td).sort(sortTodos);
  const dueToday = open.filter((t) => t.due === td);
  const soon = open.filter((t) => t.due && t.due > td && diffDays(t.due, td) <= 7).sort(sortTodos);
  const weekEnd = ymd(addDays(weekStart(d), 6));
  const thisWeek = open.filter((t) => t.due && t.due >= td && t.due <= weekEnd);
  const doneWeek = all.filter((t) => t.done && t.doneAt && t.doneAt >= ymd(weekStart(d)));
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
          <div class="sub">${greet(d.getHours())}${G.isOwner ? ` · Day-${workDay(td)}` : ''}</div>
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
        <div id="home-pp"></div>
        <div id="home-ev"></div>
        <div id="home-ipo"></div>
        <div id="home-news"></div>
        <section class="card sec-brief" ${!b.text && !G.isOwner ? 'hidden' : ''}>
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
          <div class="profile"><span class="ph">${ico('user', 'lg')}</span><div><div class="nm">${esc(myName())} 님, ${greet(d.getHours())}</div><div class="dp">${esc(myRole())}</div></div></div>
          <div class="timebox">
            <div class="cell"><div class="k">${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})</div><div class="v blue" id="live-time">${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}</div></div>
            ${G.isOwner ? `<div class="cell"><div class="k">입사 후</div><div class="v">Day-${workDay(td)}</div></div>` : ''}
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
            <li class="click" data-note="${esc(n.name)}"><div class="t"><div class="ttl">${noteTag(n.name)}${esc(noteTitle(n.name))}</div><div class="meta">${relTime(n.mtime)} 수정</div></div></li>`).join('') || '<div class="empty">기록이 없습니다.</div>'}</ul></div>
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
  if (typeof ipoHomeBlock === 'function') ipoHomeBlock().then((h) => { const box = $('#home-ipo'); if (box) { if (h) { box.outerHTML = h; if (typeof ipoHomeBrief === 'function') $('.ipo-home .card-body')?.insertAdjacentHTML('afterbegin', ipoHomeBrief()); } else box.remove(); } }).catch(() => {});
  if (typeof eventsHomeBlock === 'function') eventsHomeBlock().then((h) => { const box = $('#home-ev'); if (box) { if (h) box.outerHTML = h; else box.remove(); } }).catch(() => {});
  if (typeof newsHomeBlock === 'function') newsHomeBlock().then((h) => { const box = $('#home-news'); if (box) { if (h) box.outerHTML = h; else box.remove(); } }).catch(() => {});
  if (typeof pipeHomeBlock === 'function') pipeHomeBlock().then((h) => { const box = $('#home-pp'); if (box) { if (h) box.outerHTML = h; else box.remove(); } }).catch(() => {});
}

// ---------- 폰 첫 화면: 하이웍스 앱처럼 메뉴 모음 + 오늘 한 묶음 ----------
function renderHomeMobile() {
  const td = today(), d = new Date();
  const open = todoAll().filter((t) => !t.done);
  const over = open.filter((t) => t.due && t.due < td).sort(sortTodos);
  const dueToday = open.filter((t) => t.due === td);
  const ms = S.milestones.items.filter((m) => m.date >= td).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 2);
  const prog = S.programs.items.filter((p) => ['설계', '개발 중'].includes(p.status)).length;
  const menu = [
    ['#mail', 'mail', '메일', '<i class="mh-n" id="mh-mail" hidden></i>'],
    ['#calendar', 'cal', '일정', '<i class="mh-n" id="mh-cal" hidden></i>'],
    ['#todos', 'check', '할 일', over.length + dueToday.length ? `<i class="mh-n ${over.length ? 'red' : ''}">${over.length + dueToday.length}</i>` : ''],
    ['#notes', 'file', '업무일지', ''],
    ['#deals/news', 'news', '뉴스', ''],
    ...DEAL_GROUPS.map(([g, t, i]) => [`#deals/${g}`, i, t, '']),
    ['#deals/pipeline', 'inbox', '파이프라인', ''],
    ['#market', 'chart', '시장동향', ''],
    ['#weekly', 'week', '주간회의', ''],
    ['#files', 'folder', '공용 폴더', ''],
    ['#corp', 'home', '법인설립', ''],
    ['#fss', 'flag', '금감원 면담', ''],
    ['#programs', 'box', '프로그램', prog ? `<i class="mh-n grey">${prog}</i>` : ''],
    ['', 'spark', 'AI 브리핑', ''],
  ].filter(([h]) => h || S.briefing.text || G.isOwner);
  PAGE.innerHTML = `<div class="mhome">
    <section class="mh-hello">
      <div class="dt">${d.getMonth() + 1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일</div>
      <div class="sub">${greet(d.getHours())}${ms.length ? ` · ${ms.map((m) => `${esc(m.title.replace(/\s*\(.*\)$/, ''))} <b>D-${diffDays(m.date, td)}</b>`).join(' · ')}` : ''}</div>
    </section>
    <nav class="mh-grid">${menu.map(([h, i, t, n]) => `<a ${h ? `href="${h}"` : 'href="#" data-brief'} class="mh-it"><span class="mh-ic">${ico(i)}${n}</span><span class="mh-t">${t}</span></a>`).join('')}</nav>
    <section class="mh-today">
      <div class="mh-head"><h2>오늘</h2></div>
      <ul class="mh-list" id="mh-ev"><li class="mh-empty">불러오는 중…</li></ul>
      ${over.length || dueToday.length ? `<div class="mh-sub">할 일</div><ul class="mh-list">${[...over, ...dueToday].slice(0, 5).map((t) => `
        <li><input type="checkbox" class="check" data-toggle="${esc(t.id)}" aria-label="완료"><span class="mh-tt">${esc(t.title)}${ttWho(t)}</span><span class="mh-due ${t.due < td ? 'red' : 'blue'}">${t.due < td ? `${diffDays(td, t.due)}일 지남` : '오늘'}</span></li>`).join('')}</ul>
        ${over.length + dueToday.length > 5 ? `<a class="mh-more" href="#todos">할 일 ${over.length + dueToday.length}건 모두 보기</a>` : ''}` : ''}
    </section>
  </div>`;
  PAGE.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => toggleTodo(el.dataset.toggle)));
  PAGE.querySelector('[data-brief]')?.addEventListener('click', (e) => {
    e.preventDefault();
    const b = S.briefing, bt = b.mtime ? new Date(b.mtime * 1000) : null;
    openSheet(`<h3>AI 브리핑</h3>${bt ? `<div class="meta" style="margin:-6px 0 12px">${bt.getMonth() + 1}/${bt.getDate()} ${pad(bt.getHours())}:${pad(bt.getMinutes())} 갱신</div>` : ''}<div class="brief">${b.text ? mdRender(b.text) : '<div class="empty">브리핑 없음</div>'}</div>`);
  });
  const s0 = new Date(); s0.setHours(0, 0, 0, 0);
  fetchCal(ymd(s0), ymd(addDays(s0, 1))).then((r) => {
    const box = $('#mh-ev'); if (!box) return;
    const ev = r.events.filter((e) => !e.cancelled);
    box.previousElementSibling?.matches('.cal-stale') && box.previousElementSibling.remove();
    if (r.stale) box.insertAdjacentHTML('beforebegin', calStaleBar(r.stale));
    const n = $('#mh-cal'); if (n && ev.length) { n.textContent = ev.length; n.hidden = false; }
    box.innerHTML = ev.map((e) => `<li class="click" ${e.editable ? `data-ev="${esc(e.id)}"` : 'data-go="#calendar"'}><span class="mh-time">${e.allDay ? '종일' : e.start.slice(11, 16)}</span><span class="mh-tt">${esc(e.subject)}</span>${e.location ? `<span class="mh-loc">${esc(e.location)}</span>` : ''}</li>`).join('') || '<li class="mh-empty">오늘 일정이 없습니다.</li>';
    box.querySelectorAll('[data-go]').forEach((li) => li.addEventListener('click', () => { location.hash = li.dataset.go; }));
    box.querySelectorAll('[data-ev]').forEach((li) => li.addEventListener('click', () => openEventModal(li.dataset.ev, r.events, () => { delete CALC[`${ymd(s0)}|${ymd(addDays(s0, 1))}`]; renderHome(); })));
  }).catch((e) => { const box = $('#mh-ev'); if (box) box.innerHTML = `<li class="mh-empty">${esc(e.message)}</li>`; });
  G.get('/me/mailFolders/inbox?$select=unreadItemCount').then((j) => { const n = $('#mh-mail'); if (n && j.unreadItemCount) { n.textContent = j.unreadItemCount > 99 ? '99+' : j.unreadItemCount; n.hidden = false; } }).catch(() => {});
}
// 폰↔PC 폭이 바뀌면 홈을 그 폭에 맞는 구성으로 다시 그린다
matchMedia('(max-width: 760px)').addEventListener('change', () => { if (S && route() === 'home') render(); });

/* ---------- 딜소싱·뉴스·파이프라인 (2026-11-11 사용자 승인으로 11개 탭을 정리)
   뉴스(사이드바): 딜 뉴스 — 회사 목록이 아니라 매일 훑는 소식
   딜소싱: 행사(행사·IR — 회사를 직접 만나는 자리, 11/11 사용자 '맨 앞으로') / 상장(상장 준비 | 신규상장) / 매물(입찰딜 | 매각희망 | 매물장터) / 타깃(오너기업 | 중복상장 | 상폐 위험·CB | 팩트시트)
   파이프라인(사이드바): 모든 탭에서 올린 카드가 모이는 곳
   주소는 예전 그대로 #deals/<화면>(다른 화면·홈 카드·파이프라인 '돌아가기'가 쓴다). #deals/<묶음>은 그 묶음에서 마지막으로 본 화면으로.
   PE 앵글은 오너기업(heir)·중복상장(dup) 두 화면으로 펼친다 — pe.js 안의 묶음 값(peS.grp)만 바꿔서 그리고 pe.js 자체 전환 줄은 숨긴다.
   각 화면은 events.js·news.js·ipo.js·radar.js·kmx.js·pe.js·delist.js·facts.js·pipeline.js가 host 안에 그린다 ---------- */
const DEAL_SCREENS = {
  news: ['딜 뉴스', 'news', () => (typeof renderNews === 'function' ? renderNews : null)],
  events: ['행사·IR', 'ticket', () => (typeof renderEvents === 'function' ? renderEvents : null)],
  yesim: ['상장 준비', 'flag', () => (typeof renderYesim === 'function' ? renderYesim : null)],
  ipo: ['신규상장', 'chart', () => (typeof renderIpo === 'function' ? renderIpo : null)],
  bids: ['입찰딜', 'send', () => (typeof renderBids === 'function' ? renderBids : null)],
  sell: ['매각희망', 'upload', () => (typeof renderSell === 'function' ? renderSell : null)],
  kmx: ['매물장터', 'clip', () => (typeof renderKmx === 'function' ? renderKmx : null)],
  heir: ['오너기업', 'link', () => dealPe('heir')],
  dup: ['중복상장', 'link', () => dealPe('dup')],
  delist: ['상폐 위험·CB', 'alert', () => (typeof renderDelist === 'function' ? renderDelist : null)],
  facts: ['팩트시트', 'file', () => (typeof renderFacts === 'function' ? renderFacts : null)],
  sector: ['섹터', 'chart', () => (typeof renderSector === 'function' ? renderSector : null)],
  pipeline: ['파이프라인', 'inbox', () => (typeof renderPipeline === 'function' ? renderPipeline : null)],
};
const DEAL_GROUPS = [['events', '행사', 'ticket', ['events']], ['listing', '상장', 'flag', ['yesim', 'ipo']], ['offer', '매물', 'upload', ['bids', 'sell', 'kmx']], ['target', '타깃', 'link', ['heir', 'dup', 'delist', 'facts', 'sector']]];
const DEAL_PAGE = { news: 'news', pipeline: 'pipeline' }; // 나머지는 딜소싱
// 주소 끝 → 화면 키. 빈 값은 첫 묶음, 묶음 이름은 그 묶음에서 마지막으로 본 화면, pe는 PE 앵글에서 보던 묶음
function dealSub(s) {
  if (s === 'pe') return typeof peS !== 'undefined' && peS.grp === 'dup' ? 'dup' : 'heir';
  if (DEAL_SCREENS[s]) return s;
  const g = DEAL_GROUPS.find(([k]) => k === s) || DEAL_GROUPS[0], last = viewGet(`deal.${g[0]}`, null);
  return g[3].includes(last) ? last : g[3][0];
}
function dealPe(g) {
  if (typeof renderPe !== 'function') return null;
  return (host) => { if (peS.grp !== g) { peS.grp = g; viewSet('pe.grp', g); } return renderPe(host); };
}
function renderDeals() {
  const k = ui.dealTab, page = DEAL_PAGE[k] || 'deals', grp = DEAL_GROUPS.find((g) => g[3].includes(k));
  const btn = (href, [t, i], on) => `<button type="button" role="tab" data-dt="${href}" aria-selected="${on}" class="${on ? 'on' : ''}">${i ? ico(i) : ''}${t}</button>`;
  let segs = '';
  if (grp) {
    viewSet(`deal.${grp[0]}`, k);
    segs = `<div class="deal-seg" role="tablist">${DEAL_GROUPS.map(([g, t, i]) => btn(`#deals/${g}`, [t, i], g === grp[0])).join('')}</div>
      ${grp[3].length < 2 ? '' : `<div class="deal-sub" role="tablist">${grp[3].map((s) => btn(`#deals/${s}`, [DEAL_SCREENS[s][0]], s === k)).join('')}</div>`}`;
  }
  PAGE.innerHTML = `<div class="page-head"><h1>${CRUMB[page]}</h1></div>${segs}<div id="deal-host" class="deal-${k}"></div>`;
  PAGE.querySelectorAll('[data-dt]').forEach((b) => b.addEventListener('click', () => { if (!b.classList.contains('on')) location.hash = b.dataset.dt; })); // 주소에 남겨 뒤로 가기로 전환
  const host = $('#deal-host'), fn = DEAL_SCREENS[k][2]();
  if (!fn) { host.innerHTML = '<div class="card"><div class="empty">준비 중</div></div>'; return; }
  Promise.resolve(fn(host)).catch((e) => { host.innerHTML = `<div class="card"><div class="empty">${esc(e.message)}</div></div>`; });
}
// 탭 줄이 넘치면 고른 탭을 가운데로(탭을 바꿀 때마다 새로 그려 처음 위치로 돌아가므로), PC 마우스 휠로도 옆으로 밀기(끝에 닿으면 화면 스크롤)
function segFit(seg) {
  const on = seg?.querySelector('.on'); if (!on) return;
  const fit = () => { if (seg.scrollWidth > seg.clientWidth) seg.scrollLeft += on.getBoundingClientRect().left - seg.getBoundingClientRect().left - (seg.clientWidth - on.offsetWidth) / 2; };
  fit();
  let w = seg.clientWidth; // 자료가 늦게 들어와 본문 세로 스크롤바가 생기면 탭 줄 폭이 줄어 끝 탭이 잘리므로 다시 맞춘다
  if (window.ResizeObserver) new ResizeObserver(() => { if (seg.clientWidth !== w) { w = seg.clientWidth; fit(); } }).observe(seg);
  seg.addEventListener('wheel', (e) => {
    const max = seg.scrollWidth - seg.clientWidth, d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (max <= 0 || !d || Math.abs(e.deltaX) > Math.abs(e.deltaY) || (d < 0 && seg.scrollLeft <= 0) || (d > 0 && seg.scrollLeft >= max - 1)) return;
    seg.scrollLeft += d; e.preventDefault();
  }, { passive: false });
}

function homeTodoBlock(label, items) {
  if (!items.length) return '';
  return `<div class="sec-label">${label} ${items.length}</div><ul class="list">${items.map((t) => {
    const di = dueInfo(t);
    return `<li><input type="checkbox" class="check" data-toggle="${esc(t.id)}" aria-label="완료"><div class="t"><div class="ttl">${esc(t.title)}${ttWho(t)}</div>${tMemo(t) ? `<div class="meta">${esc(tMemo(t))}</div>` : ''}</div>
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
      <div class="t"><div class="ttl">${esc(e.subject)}</div><div class="meta">${e.start.slice(0, 10) <= today() ? '오늘' : '내일'}${e.location || e.organizer ? ' · ' + esc(e.location || e.organizer) : ''}</div></div>${e.join ? `<a class="btn sm" href="${esc(e.join)}" target="_blank" rel="noopener">참가</a>` : ''}</li>`).join('')}</ul>`;
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
// 보기: cat = 분류별(분류 안에서 기한순) · due = 기한순(남은 기간으로 묶고 분류는 제목 아래에). 마지막 선택을 기억한다
ui.todoView = (() => { try { return localStorage.getItem('todoView') === 'due' ? 'due' : 'cat'; } catch { return 'cat'; } })();
const DUE_GROUPS = [['기한 지남', (d) => d < 0], ['오늘', (d) => d === 0], ['7일 이내', (d) => d > 0 && d <= 7], ['그 뒤', (d) => d > 7], ['기한 없음', (d) => d === null]];
function renderTodos() {
  const td = today(), all = todoAll();
  const tabs = {
    open: ['진행 중', all.filter((t) => !t.done)],
    today: ['오늘', all.filter((t) => !t.done && t.due === td)],
    over: ['기한 지남', all.filter((t) => !t.done && t.due && t.due < td)],
    done: ['완료', all.filter((t) => t.done)],
    given: ['맡긴 일', ttGiven()], // 내가 남에게 맡긴 팀 할 일(완료 포함, 숫자는 남은 것만)
  };
  if (!tabs[ui.todoTab]) ui.todoTab = 'open';
  viewSet('todoTab', ui.todoTab);
  const [, items] = tabs[ui.todoTab];
  const byDone = (a, b) => (b.doneAt || '').localeCompare(a.doneAt || '');
  const grp = (h, g) => (g.length ? `<div class="todo-group"><h3>${h} <span class="muted" style="font-weight:500">${g.length}</span></h3>${g.map(todoRow).join('')}</div>` : '');
  let body;
  if (ui.todoTab === 'done') {
    body = items.sort(byDone).map(todoRow).join('');
  } else if (ui.todoTab === 'given') { // 맡은 사람별로, 남은 것 먼저
    body = [...new Set(items.map((t) => personName(t.assignee)))].map((n) => {
      const g = items.filter((t) => personName(t.assignee) === n);
      return grp(esc(n), [...g.filter((t) => !t.done).sort(sortTodos), ...g.filter((t) => t.done).sort(byDone)]);
    }).join('');
  } else {
    body = ui.todoView === 'due'
      ? DUE_GROUPS.map(([h, f]) => grp(h, items.filter((t) => f(t.due ? diffDays(t.due, td) : null)).sort(sortTodos))).join('')
      : CATS.map((c) => grp(c, items.filter((t) => (t.cat || '기타') === c).sort(sortTodos))).join('');
  }
  PAGE.innerHTML = `
    <div class="page-head"><h1>할 일</h1></div>
    <section class="card">
    <form class="addbar" id="addf">
      <input class="input grow" id="add-title" placeholder="할 일을 입력하고 Enter" autocomplete="off">
      <select class="select" id="add-who" aria-label="담당" title="담당"><option value="">나</option>${whoOpts().map(([n, m]) => `<option value="${m}">${n}</option>`).join('')}</select>
      <select class="select" id="add-cat">${CATS.map((c) => `<option ${c === (ui.lastCat || '사무실 세팅') ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <input class="input" type="date" id="add-due" style="width:150px">
      <button class="btn primary" type="submit">${ico('plus', 'sm')}추가</button>
    </form>
    <div class="todo-bar"><div class="tabs">${Object.entries(tabs).map(([k, [lbl, arr]]) => `<button data-tab="${k}" class="${ui.todoTab === k ? 'on' : ''}">${lbl}<span class="n">${k === 'given' ? arr.filter((t) => !t.done).length || '' : arr.length}</span></button>`).join('')}</div>
      ${['done', 'given'].includes(ui.todoTab) ? '' : `<div class="seg todo-view">${[['cat', '분류별'], ['due', '기한순']].map(([k, l]) => `<button type="button" data-view="${k}" class="${ui.todoView === k ? 'on' : ''}" aria-pressed="${ui.todoView === k}">${l}</button>`).join('')}</div>`}</div>
    <div id="todo-list" style="padding-bottom:8px">${body || '<div class="empty">해당하는 할 일이 없습니다.</div>'}</div></section>
    <button class="fab" type="button" id="todo-fab" aria-label="할 일 추가">${ico('plus')}</button>`;
  $('#todo-fab').onclick = () => addTodoSheet();

  $('#addf').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#add-title').value.trim(); if (!title) return;
    ui.lastCat = $('#add-cat').value;
    const who = $('#add-who').value, due = fixYmd($('#add-due').value) || null;
    if (who) ttAdd(ttNew({ title, cat: ui.lastCat, due, assignee: who })); // 사람을 고르면 팀 할 일
    else { S.todos.items.push({ id: uid(), title, cat: ui.lastCat, due, done: false, doneAt: null, created: today(), note: '' }); save('todos'); }
    renderTodos(); $('#add-title').focus();
  });
  PAGE.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { ui.todoTab = b.dataset.tab; ui.todoEdit = null; renderTodos(); }));
  PAGE.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    ui.todoView = b.dataset.view; try { localStorage.setItem('todoView', ui.todoView); } catch { /* 이번 화면엔 적용 */ }
    renderTodos();
  }));
  PAGE.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => toggleTodo(el.dataset.toggle)));
  PAGE.querySelectorAll('[data-edit]').forEach((el) => el.addEventListener('click', () => { ui.todoEdit = el.dataset.edit; renderTodos(); }));
  PAGE.querySelectorAll('[data-del]').forEach((el) => el.addEventListener('click', () => {
    const t = todoFind(el.dataset.del);
    if (!t || !confirm(`"${t.title}" 할 일을 삭제할까요?`)) return;
    if (ui.todoEdit === t.id) ui.todoEdit = null;
    if (isTT(t)) ttDel(t.id); else { S.todos.items = S.todos.items.filter((x) => x !== t); save('todos'); }
    renderTodos();
  }));
  const ef = $('#todo-edit');
  if (ef) {
    $('#te-title').focus();
    ef.addEventListener('submit', (e) => {
      e.preventDefault();
      const t = todoFind(ui.todoEdit);
      if (t) {
        const f = { title: $('#te-title').value.trim() || t.title, cat: $('#te-cat').value, due: fixYmd($('#te-due').value) || null }, memo = $('#te-note').value.trim();
        if (isTT(t)) ttSet(t.id, { ...f, memo }); else { Object.assign(t, f, { note: memo }); save('todos'); }
      }
      ui.todoEdit = null; renderTodos();
    });
    ef.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.todoEdit = null; renderTodos(); } });
    $('#te-cancel').addEventListener('click', () => { ui.todoEdit = null; renderTodos(); });
  }
}

function todoRow(t) {
  if (ui.todoEdit === t.id) {
    return `<form class="todo" id="todo-edit" style="grid-template-columns:24px minmax(0,1fr) 140px 150px auto;background:var(--hover)">
      <span></span>
      <div style="display:flex;flex-direction:column;gap:6px;padding:4px 0"><input class="edit-input" id="te-title" value="${esc(t.title)}"><input class="edit-input" id="te-note" style="border-color:var(--line2)" value="${esc(tMemo(t))}" placeholder="메모 (선택)"></div>
      <select class="select" id="te-cat">${CATS.map((c) => `<option ${c === t.cat ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <input class="input" type="date" id="te-due" value="${t.due || ''}">
      <div style="display:flex;gap:6px"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" id="te-cancel">취소</button><button class="btn ghost" type="button" data-del="${esc(t.id)}">삭제</button></div>
    </form>`;
  }
  const di = dueInfo(t);
  return `<div class="todo ${t.done ? 'done' : ''}">
    <input type="checkbox" class="check" data-toggle="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="완료">
    <div data-edit="${esc(t.id)}" style="min-width:0;cursor:text"><div class="ttl">${esc(t.title)}${ttWho(t)}</div>${(ui.todoView === 'due' && ui.todoTab !== 'done') || ui.todoTab === 'given' ? `<div class="note">${esc(t.cat || '기타')}${tMemo(t) ? ` · ${esc(tMemo(t))}` : ''}</div>` : tMemo(t) ? `<div class="note">${esc(tMemo(t))}</div>` : ''}</div>
    <span>${ui.todoTab === 'done' ? `<span class="chip line">${esc(t.cat)}</span>` : ''}</span>
    <span class="due ${di.cls}">${t.done && t.doneAt ? `${md(t.doneAt)} 완료` : di.txt}</span>
    <button class="iconbtn del" data-del="${esc(t.id)}" title="삭제">${ico('trash', 'sm')}</button>
  </div>`;
}


function addTodoSheet(due) {
  openSheet(`<h3>할 일 추가</h3>
    <form id="sheet-todo">
      <div class="field"><input class="input full" name="title" placeholder="할 일" autocomplete="off" required></div>
      <div class="field"><div class="chips">${CATS.map((c) => `<label><input type="radio" name="cat" value="${c}" ${c === (ui.lastCat || '사무실 세팅') ? 'checked' : ''}>${c}</label>`).join('')}</div></div>
      <div class="field"><label style="display:block;font-size:14px;color:var(--text2);margin-bottom:6px">담당</label><div class="chips">${[['나', ''], ...whoOpts()].map(([n, m]) => `<label><input type="radio" name="who" value="${m}" ${m ? '' : 'checked'}>${n}</label>`).join('')}</div></div>
      <div class="field"><label style="display:block;font-size:14px;color:var(--text2);margin-bottom:6px">마감일</label><input class="input full" type="date" name="due" value="${due || ''}"></div>
      <button class="btn primary full" type="submit">추가</button>
    </form>`, (el, close) => {
    const f = el.querySelector('#sheet-todo');
    setTimeout(() => f.title.focus(), 50);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      if (!v.title.trim()) return;
      ui.lastCat = v.cat;
      if (v.who) { close(); ttAdd(ttNew({ title: v.title.trim(), cat: v.cat, due: fixYmd(v.due) || null, assignee: v.who })); render(); return; }
      S.todos.items.push({ id: uid(), title: v.title.trim(), cat: v.cat, due: fixYmd(v.due) || null, done: false, doneAt: null, created: today(), note: '' });
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
  { key: 'team', name: '유니버스인베스트먼트', sub: '대표님 공유' },
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
  const tds = todoAll().filter((t) => !t.done && t.due === k).map((t) => ({ type: 'td', id: t.id, time: '할 일', title: t.title, over: k < td, editable: true }));
  // 같은 일정이 두 곳에 있으면 하나만 보인다 (원본은 그대로): 팀 캘린더 ↔ 내 일정(회의 초대), D-day ↔ 캘린더 일정
  const evs = [];
  for (const e of ev) {
    const dup = evs.find((x) => x.cal !== e.cal && x.time === e.time && normTitle(x.title) === normTitle(e.title));
    if (!dup) { evs.push(e); continue; }
    const keep = dup.cal === 'team' ? dup : e, drop = keep === dup ? e : dup;
    keep.join = keep.join || drop.join; keep.alt = drop;
    evs[evs.indexOf(dup)] = keep;
  }
  const mss = ms.filter((m) => !evs.some((e) => sameTitle(e.title, m.title)));
  return [...mss, ...evs, ...tds];
}

const normTitle = (s) => String(s).replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/[^0-9A-Za-z가-힣]/g, '');
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
      ${e ? '' : f('캘린더', `<div class="cal-pick">${CALS.slice(0, 2).filter((c) => c.key !== 'team' || OUTLOOK.teamWritable).map((c, i) => `<label class="c-${c.key}"><input type="radio" name="calendar" value="${c.key}" ${i === 0 ? 'checked' : ''}><i class="cdot"></i>${c.name}<span class="muted">${c.sub}</span></label>`).join('')}</div>`, 'wide')}
      <label class="allday"><input type="checkbox" class="check" name="allDay" ${e?.allDay ? 'checked' : ''}>종일</label>
      ${actions}</form>`;
  }
  if (kind === 'td') {
    const t = id ? todoFind(id) : null;
    return `<form class="cal-form" id="cf" data-kind="td">
      ${f('할 일', `<input class="input" name="title" value="${esc(t?.title || '')}" required>`, 'wide')}
      ${f('구분', `<select class="select" name="cat">${CATS.map((c) => `<option ${c === (t?.cat || ui.lastCat || '사무실 세팅') ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
      ${f('마감일', `<input class="input" type="date" name="due" value="${t?.due || ui.selDay}">`)}
      ${f('메모', `<input class="input" name="note" value="${esc(t ? tMemo(t) : '')}">`, 'half')}
      ${actions}</form>`;
  }
  const m = S.milestones.items.find((x) => x.id === id);
  return `<form class="cal-form" id="cf" data-kind="ms">
    ${f('D-day', `<input class="input" name="title" value="${esc(m?.title || '')}" required>`, 'wide')}
    ${f('날짜', `<input class="input" type="date" name="date" value="${m?.date || ui.selDay}" required>`)}
    ${f('메모', `<input class="input" name="note" value="${esc(m?.note || '')}">`, 'wide3')}
    ${actions}</form>`;
}

const REM_OPTS = [['', '없음'], ['0', '정시'], ['10', '10분 전'], ['15', '15분 전'], ['30', '30분 전'], ['60', '1시간 전'], ['1440', '1일 전']];
const REP_OPTS = [['', '반복 안 함'], ['daily', '매일'], ['weekly', '매주'], ['monthly', '매월'], ['yearly', '매년']];

let evModalBusy = false;
// 일정 시작을 바꾸면 끝도 같은 길이(처음엔 1시간)만큼 따라 움직인다. 끝을 직접 고치면 그 길이를 기억
function linkEventEnd(f) {
  if (!f.startDate || !f.endDate) return;
  const ad = () => !!f.allDay?.checked;
  const at = (d, t) => new Date(`${fixYmd(d)}T${ad() ? '00:00' : t || '00:00'}`);
  const span = () => at(f.endDate.value, f.endTime?.value) - at(f.startDate.value, f.startTime?.value);
  let dur;
  const remember = () => { const d = span(); dur = d > 0 || (ad() && d === 0) ? d : ad() ? 0 : 3600000; };
  remember();
  const follow = () => {
    const st = at(f.startDate.value, f.startTime?.value); if (isNaN(st)) return;
    const en = new Date(st.getTime() + dur);
    f.endDate.value = ymd(en);
    if (!ad() && f.endTime) f.endTime.value = hhmm(en);
  };
  f.startDate.addEventListener('change', follow);
  f.startTime?.addEventListener('change', follow);
  f.endDate.addEventListener('change', remember);
  f.endTime?.addEventListener('change', remember);
  f.allDay?.addEventListener('change', () => { if (!ad() && span() <= 0) { dur = 3600000; follow(); } else remember(); });
}

// pre: 새 일정 창을 미리 채울 값(subject·allDay·startTime·endTime·location·note) — 행사·IR 화면의 '일정에 추가'
async function openEventModal(id, events, onDone, date, pre) {
  if (!S.auth.connected) return toast('Outlook이 연결되지 않았습니다');
  if (evModalBusy || document.querySelector('#evf')) return; // 더블클릭·느린 망에서 두 번 눌러도 창은 하나
  evModalBusy = true;
  try { await openEventModalInner(id, events, onDone, date, pre); } finally { evModalBusy = false; }
}
async function openEventModalInner(id, events, onDone, date, pre) {
  const e = id ? (events || []).find((x) => x.id === id) : null;
  const p = e ? {} : pre || {};
  let det = {};
  if (e) { try { det = await OUTLOOK.detail(id, e.cal); } catch { /* 내용 없이도 연다 */ } }
  await OUTLOOK.calendarIds().catch(() => {}); // 팀 캘린더를 고를 수 있는지(teamWritable) 먼저 확인 — 새 일정 기본은 팀 캘린더
  const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(Math.min(Math.max(now.getHours() + 1, 9), 22));
  const day = date || ui.selDay || today();
  const sd = e ? e.start.slice(0, 10) : day;
  let ed = e ? e.end.slice(0, 10) : day;
  if (e && e.allDay) ed = ymd(addDays(parse(ed), -1));
  const st = e && !e.allDay ? e.start.slice(11, 16) : p.startTime || hhmm(now), et = e && !e.allDay ? e.end.slice(11, 16) : p.endTime || hhmm(new Date(now.getTime() + 3600000));
  const series = det.type === 'occurrence' || det.type === 'exception';
  const repNow = { daily: 'daily', weekly: 'weekly', absoluteMonthly: 'monthly', absoluteYearly: 'yearly' }[det.recurrence?.pattern?.type] || '';
  const remNow = !e ? '15' : det.isReminderOn === false ? '' : String(det.reminderMinutesBeforeStart ?? 15);
  const noteNow = (det.body?.content || '').trim();
  const opts = (list, cur) => list.map(([v, t]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${t}</option>`).join('');
  // 있던 일정도 캘린더를 바꿀 수 있다(새로 만들고 원래 것 삭제). 반복 일정·첨부·Teams 회의는 옮기면 빠지는 게 있어 Outlook에서
  const canMove = !e || (!series && !det.hasAttachments && !e.join && OUTLOOK.teamWritable);
  const calNow = e ? e.cal : OUTLOOK.teamWritable ? 'team' : 'me';
  openSheet(`<h3>${e ? '일정 수정' : '일정 추가'}</h3>
    <form class="ev-form" id="evf" autocomplete="off">
      <div class="r"><label>캘린더</label><div>${!canMove
        ? `<span class="cal-tag c-${e.cal}"><i class="cdot"></i>${e.cal === 'team' ? '유니버스인베스트먼트' : '내 일정'}</span>`
        : `<div class="cal-pick">${CALS.slice(0, 2).filter((c) => c.key !== 'team' || OUTLOOK.teamWritable).map((c) => `<label class="c-${c.key}"><input type="radio" name="calendar" value="${c.key}" ${c.key === calNow ? 'checked' : ''}><i class="cdot"></i>${c.name}<span class="muted">${c.sub}</span></label>`).join('')}</div>`}</div></div>
      <div class="r"><label>담당자</label><div class="cal-pick owner-pick">${PEOPLE.map((p) => `<label><input type="checkbox" name="owner" value="${p}" ${(e ? evOwners(e) : PEOPLE.filter((x) => myName().includes(x))).includes(p) ? 'checked' : ''}>${p}</label>`).join('')}</div></div>
      <div class="r"><label for="ev-subj">제목</label><div class="line"><input class="input grow" id="ev-subj" name="subject" value="${esc(e?.subject || p.subject || '')}" placeholder="제목을 입력하세요."><label class="ck"><input type="checkbox" class="check" name="important" ${det.importance === 'high' ? 'checked' : ''}>중요</label></div></div>
      <div class="r"><label>일시</label><div>
        <div class="line wrap"><span class="dt"><input class="input" type="date" name="startDate" value="${sd}"><input class="input t" type="time" step="600" name="startTime" value="${st}"></span><span class="tilde">~</span><span class="dt"><input class="input" type="date" name="endDate" value="${ed}"><input class="input t" type="time" step="600" name="endTime" value="${et}"></span><label class="ck"><input type="checkbox" class="check" name="allDay" ${e?.allDay || p.allDay ? 'checked' : ''}>종일</label></div>
        <select class="select rep" name="repeat" ${series ? 'disabled' : ''}>${series ? '<option>반복 일정 — 이 일정만 수정</option>' : opts(REP_OPTS, repNow)}</select>
      </div></div>
      <div class="r"><label>내용</label><textarea class="area" name="note" placeholder="내용을 입력하세요.">${esc(noteNow || p.note || '')}</textarea></div>
      <div class="r"><label>장소</label><input class="input" name="location" value="${esc(e?.location || p.location || '')}" placeholder="장소를 입력하세요."></div>
      <div class="r"><label>알림</label><select class="select narrow" name="reminder">${opts(REM_OPTS, remNow)}</select></div>
      <div class="ev-actions">${e ? '<button type="button" class="btn ghost danger" data-del>삭제</button>' : ''}<span class="sp"></span><button type="button" class="btn grey" data-cancel>취소</button><button type="submit" class="btn primary" data-save>저장</button></div>
    </form>`, (el, close) => {
    const f = el.querySelector('#evf'), save = f.querySelector('[data-save]'), allDay = f.allDay;
    const sync = () => { save.disabled = !f.subject.value.trim(); f.querySelectorAll('input.t').forEach((t) => { t.disabled = allDay.checked; }); };
    f.subject.addEventListener('input', sync); allDay.addEventListener('change', sync); sync();
    linkEventEnd(f);
    setTimeout(() => f.subject.focus(), 50);
    f.querySelector('[data-cancel]').onclick = close;
    const del = f.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      if (!confirm('이 일정을 삭제할까요?')) return;
      try { await OUTLOOK.remove(id, e.cal); close(); toast('Outlook에서 삭제했습니다'); onDone?.(); } catch (err) { toast(err.message); }
    };
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      const body = { subject: v.subject, startDate: fixYmd(v.startDate), endDate: fixYmd(v.endDate), startTime: v.startTime, endTime: v.endTime, allDay: allDay.checked, location: v.location, calendar: v.calendar || (e ? e.cal : 'team'), important: !!v.important, reminder: v.reminder };
      const moving = !!e && body.calendar !== e.cal;
      if (moving || (v.note || '').trim() !== noteNow) body.note = v.note; // 옮길 땐 새로 만드니 내용도 그대로 넣는다
      body.categories = [...(e?.categories || []).filter((c) => !PEOPLE.includes(c)), ...new FormData(f).getAll('owner')];
      if (!series && v.repeat && (moving || v.repeat !== repNow)) body.repeat = v.repeat;
      save.disabled = true;
      try {
        await (moving ? OUTLOOK.move(id, body, e.cal) : id ? OUTLOOK.update(id, body, e.cal) : OUTLOOK.create(body));
        close(); ui.selDay = body.startDate;
        const calName = body.calendar === 'team' ? '유니버스인베스트먼트 캘린더' : '내 일정';
        toast(moving ? `${calName}${body.calendar === 'team' ? '로' : '으로'} 옮겼습니다` : id ? 'Outlook 일정을 고쳤습니다' : `${calName}에 추가했습니다`);
        onDone?.();
      } catch (err) {
        if (err.moved) { close(); onDone?.(); } else save.disabled = false; // 새 캘린더엔 이미 들어갔으니 다시 저장하지 않게
        toast(err.message);
      }
    });
  }, 'wide');
}

// 고칠 수 없는 일정(참석자 있는 회의·받은 초대·보기 전용 팀 일정): 내용만 보여 준다
async function openEventView(e, onDone) {
  if (evModalBusy || document.querySelector('.ev-view')) return;
  evModalBusy = true;
  try {
    let det = {};
    if (!e.stale) try { det = await OUTLOOK.detail(e.id, e.cal); } catch { /* 내용 없이도 연다 */ } // 저장분(서버 안 됨)은 바로 연다
    const sd = e.start.slice(0, 10); let ed = e.end.slice(0, 10);
    if (e.allDay) ed = ymd(addDays(parse(ed), -1));
    const when = e.allDay ? `${mdw(sd)}${ed > sd ? ` ~ ${mdw(ed)}` : ''} 종일`
      : `${mdw(sd)} ${e.start.slice(11, 16)} ~ ${ed > sd ? `${mdw(ed)} ` : ''}${e.end.slice(11, 16)}`;
    const who = (det.attendees || []).map((a) => a.emailAddress?.name || a.emailAddress?.address).filter(Boolean);
    const note = (det.body?.content || '').split(/_{10,}/)[0].trim(); // Teams 초대 안내문(밑줄 구분선 아래)은 뺀다
    const row = (l, v) => (v ? `<div class="r"><label>${l}</label><div class="v">${v}</div></div>` : '');
    openSheet(`<h3>${esc(e.subject)}</h3>
      <div class="ev-form ev-view">
        ${row('캘린더', `<span class="cal-tag c-${e.cal}"><i class="cdot"></i>${e.cal === 'team' ? '유니버스인베스트먼트' : '내 일정'}</span>`)}
        ${row('일시', esc(when))}
        ${row('담당자', esc(evOwners(e).join(', ')))}
        ${row('주최자', e.organizer_me ? '' : esc(e.organizer || ''))}
        ${row('참석자', esc(who.join(', ')))}
        ${row('장소', esc(e.location || ''))}
        ${row('내용', esc(note))}
        <div class="ev-actions">${e.stale || (e.cal === 'team' && !OUTLOOK.teamWritable) ? '' : '<button type="button" class="btn ghost danger" data-del>삭제</button>'}<span class="sp"></span>${e.link ? `<a class="btn grey" href="${esc(e.link)}" target="_blank" rel="noopener">Outlook에서 열기</a>` : ''}${e.join ? `<a class="btn primary" href="${esc(e.join)}" target="_blank" rel="noopener">Teams 참가</a>` : '<button type="button" class="btn primary" data-close>닫기</button>'}</div>
      </div>`, (el, close) => {
      const b = el.querySelector('[data-close]'); if (b) b.onclick = close;
      const del = el.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        const msg = e.organizer_me ? `이 회의를 취소할까요?\n${who.length ? `참석자(${who.join(', ')})에게` : '참석자에게'} 취소 알림이 갑니다.` : '이 일정을 내 캘린더에서 삭제할까요?\n주최자에게는 알리지 않습니다.';
        if (!confirm(msg)) return;
        del.disabled = true;
        try { await OUTLOOK.removeMeeting(e.id, e.cal); close(); toast(e.organizer_me ? '회의를 취소했습니다' : 'Outlook에서 삭제했습니다'); onDone?.(); } catch (err) { del.disabled = false; toast(err.message); }
      };
    }, 'wide');
  } finally { evModalBusy = false; }
}

/* 데스크톱 월간: 주마다 여러 날 일정은 막대로 잇고, 하루 일정은 칸에 쌓는다 (하이웍스 월간보기) */
function weekRowsHTML(start, n, events, first, td) {
  const MAXL = 3;
  const spanOf = (e) => {
    const a = e.start.slice(0, 10); let b = e.end.slice(0, 10);
    if (e.allDay || e.end.slice(11, 16) === '00:00') b = ymd(addDays(parse(b), -1));
    return [a, b < a ? a : b];
  };
  const multi = (events || []).filter((e) => !e.cancelled && ui.calShow[e.cal || 'me'] !== false).map((e) => [e, ...spanOf(e)]).filter(([, a, b]) => b > a);
  const multiIds = new Set(multi.map(([e]) => e.id));
  let html = '';
  for (let w = 0; w < n / 7; w++) {
    const ws = ymd(addDays(start, w * 7)), we = ymd(addDays(start, w * 7 + 6));
    const lanes = [], segs = [], hidden = new Array(7).fill(0);
    const place = (c0, c1) => {
      for (let l = 0; ; l++) {
        lanes[l] ||= new Array(7).fill(false);
        if (lanes[l].slice(c0, c1 + 1).every((x) => !x)) { for (let c = c0; c <= c1; c++) lanes[l][c] = true; return l; }
      }
    };
    multi.filter(([, a, b]) => a <= we && b >= ws)
      .sort((x, y) => x[1].localeCompare(y[1]) || diffDays(y[2], y[1]) - diffDays(x[2], x[1]))
      .forEach(([e, a, b]) => {
        const c0 = Math.max(0, diffDays(a, ws)), c1 = Math.min(6, diffDays(b, ws));
        segs.push({ l: place(c0, c1), c0, c1, cls: `bar c-${e.cal || 'me'}${a < ws ? ' cont-l' : ''}${b > we ? ' cont-r' : ''}`, item: `ev|${e.id}`, d: a < ws ? ws : a, text: e.subject });
      });
    for (let c = 0; c < 7; c++) {
      const k = ymd(addDays(start, w * 7 + c));
      dayItems(k, events).filter((it) => !(it.type === 'ev' && multiIds.has(it.id))).forEach((it) => {
        segs.push({ l: place(c, c), c0: c, c1: c, cls: `one c-${calKey(it)}${it.over ? ' over' : ''}`, item: `${it.type}|${it.id}`, d: k, text: (it.type === 'ev' && /\d/.test(it.time) ? `${it.time} ` : '') + it.title });
      });
    }
    let bg = '';
    for (let c = 0; c < 7; c++) {
      const d = addDays(start, w * 7 + c), k = ymd(d);
      const cls = [d.getMonth() !== first.getMonth() ? 'other' : '', k === td ? 'today' : '', k === ui.selDay ? 'sel' : '', d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''].join(' ');
      bg += `<div class="wbg ${cls}" data-day="${k}" style="grid-column:${c + 1}"><span class="n">${d.getDate()}</span></div>`;
    }
    const shown = segs.filter((sg) => {
      if (sg.l < MAXL) return true;
      for (let c = sg.c0; c <= sg.c1; c++) hidden[c]++;
      return false;
    });
    html += `<div class="mweek">${bg}${shown.map((sg) => `<span class="it2 ${sg.cls}" data-item="${sg.item}" data-d="${sg.d}" title="${esc(sg.text)}" style="grid-column:${sg.c0 + 1} / ${sg.c1 + 2};grid-row:${sg.l + 2}">${esc(sg.text)}</span>`).join('')}${hidden.map((h, c) => (h ? `<button type="button" class="more2" data-day="${ymd(addDays(start, w * 7 + c))}" style="grid-column:${c + 1}">+${h}</button>` : '')).join('')}</div>`;
  }
  return html;
}

async function mountMonth(el) {
  if (!ui.month) { const [vm, vd] = viewGet('month', []), n = new Date(); ui.month = vm ? parse(vm) : new Date(n.getFullYear(), n.getMonth(), 1); ui.selDay ||= vd; }
  if (!ui.selDay) ui.selDay = today();
  const { first, start, end, n } = monthGrid(ui.month);
  let events = [], stale = null;
  const refetch = () => { CALC = {}; mountMonth(el); };

  const draw = () => {
    viewSet('month', [ymd(ui.month), ui.selDay]);
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
        ? `<span class="chip line">${it.ev.stale || (it.ev.cal === 'team' && !OUTLOOK.teamWritable) ? '보기 전용' : it.ev.organizer_me ? '참석자 있음' : '받은 초대'}</span>${it.join ? `<a class="btn sm" href="${esc(it.join)}" target="_blank" rel="noopener">Teams 참가</a>` : it.link ? `<a class="btn sm ghost" href="${esc(it.link)}" target="_blank" rel="noopener">Outlook에서 열기</a>` : ''}`
        : it.join ? `<a class="btn sm" href="${esc(it.join)}" target="_blank" rel="noopener">Teams 참가</a>` : '';
      const click = it.editable || it.type === 'ev';
      return `<li class="${click ? 'click' : ''}" ${click ? `data-item="${it.type}|${esc(it.id)}"` : ''}><span class="k c-${calKey(it)}"><i class="cdot"></i>${it.time}</span><div class="t"><div class="ttl">${esc(it.title)}</div>${it.ev ? `<div class="meta">${it.cal === 'team' ? '유니버스인베스트먼트' : '내 일정'}${evOwners(it.ev).length ? ' · 담당 ' + evOwners(it.ev).join(', ') : ''}${it.ev.location ? ' · ' + esc(it.ev.location) : ''}</div>` : ''}</div>${ext}</li>`;
    }).join('');
    const newForm = ed && ed.kind.startsWith('new-') ? `<div class="new-wrap">${calForm(ed.kind.slice(4), null, events)}</div>` : '';
    let upcoming = ''; // 폰 일정 화면: 고른 날 다음 7일
    if (isMobile() && el.id === 'cal-month') {
      for (let i = 1; i <= 7; i++) {
        const k = ymd(addDays(parse(ui.selDay), i)), its = dayItems(k, events);
        if (its.length) upcoming += `<div class="up-d">${mdw(k)}</div><ul class="list">${its.map((it) => {
          const click = it.editable || it.type === 'ev';
          return `<li class="${click ? 'click' : ''}" ${click ? `data-item="${it.type}|${esc(it.id)}" data-d="${k}"` : ''}><span class="k c-${calKey(it)}"><i class="cdot"></i>${it.time}</span><div class="t"><div class="ttl">${esc(it.title)}</div></div></li>`;
        }).join('')}</ul>`;
      }
      upcoming = `<div class="mcal-day mcal-up"><div class="day-head"><span class="hd">향후 일정</span></div>${upcoming || '<div class="muted" style="font-size:14px;padding:6px 0">일정 없음</div>'}</div>`;
    }
    el.innerHTML = `<div class="card-head">
        <div class="mcal-nav"><button class="iconbtn" data-m="-1" aria-label="이전 달">${ico('left')}</button><span class="ym">${first.getFullYear()}년 ${first.getMonth() + 1}월</span><button class="iconbtn" data-m="1" aria-label="다음 달">${ico('right')}</button></div>
        <button class="btn sm" data-m="0">오늘</button>
        ${el.id === 'home-month' ? `<button class="btn sm ghost mcal-toggle" type="button" data-mt>${ui.monthOpen ? '접기' : '월 전체'}</button>` : ''}
        <div class="cal-filter act">${CALS.filter((c) => S.auth.connected || ['ms', 'td'].includes(c.key)).map((c) =>
          `<label class="cf c-${c.key}" title="${c.sub}"><input type="checkbox" data-show="${c.key}" ${ui.calShow[c.key] !== false ? 'checked' : ''}><i class="box"></i>${c.name}</label>`).join('')}
</div></div>${calStaleBar(stale)}
      ${isMobile()
        ? `<div class="mcal">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}${cells}</div>`
        : `<div class="mcal bars"><div class="mwd">${WD.map((w, i) => `<div class="wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}</div>${weekRowsHTML(start, n, events, first, td)}</div>`}
      <div class="mcal-day">
        <div class="day-head"><span class="hd">${mdw(ui.selDay)}</span><div class="tools">
          ${S.auth.connected ? `<button class="btn sm" data-new="ev">${ico('plus', 'sm')}일정</button>` : ''}
          <button class="btn sm" data-new="td">${ico('plus', 'sm')}할 일</button></div></div>
        ${newForm}
        ${rows ? `<ul class="list">${rows}</ul>` : newForm ? '' : '<div class="muted" style="font-size:14px;padding:6px 0">일정 없음</div>'}
      </div>${upcoming}`;

    const nav = (v) => {
      ui.calEdit = null;
      if (v === 0) { const n2 = new Date(); ui.month = new Date(n2.getFullYear(), n2.getMonth(), 1); ui.selDay = today(); return mountMonth(el); }
      if (collapsed) { // 접힌 상태: 한 주씩 이동
        const nd = addDays(parse(ui.selDay), 7 * v); ui.selDay = ymd(nd);
        if (nd.getMonth() !== ui.month.getMonth() || nd.getFullYear() !== ui.month.getFullYear()) { ui.month = new Date(nd.getFullYear(), nd.getMonth(), 1); return mountMonth(el); }
        return draw();
      }
      ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + v, 1);
      const nowM = new Date(); // 선택한 날이 그 달 밖이면 그 달 1일(이번 달이면 오늘)로
      if (parse(ui.selDay).getMonth() !== ui.month.getMonth() || parse(ui.selDay).getFullYear() !== ui.month.getFullYear())
        ui.selDay = nowM.getMonth() === ui.month.getMonth() && nowM.getFullYear() === ui.month.getFullYear() ? today() : ymd(ui.month);
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
      c.addEventListener('click', () => {
        if (ui.selDay !== c.dataset.day) ui.calEdit = null;
        ui.selDay = c.dataset.day; draw();
        // PC는 날짜 칸을 한 번 누르면 바로 일정 추가 (+N은 그날 목록만)
        if (!isMobile() && S.auth.connected && !c.classList.contains('more2')) openEventModal(null, events, refetch, c.dataset.day);
      });
      c.addEventListener('dblclick', () => {
        if (!isMobile() && S.auth.connected) return;
        ui.selDay = c.dataset.day;
        if (S.auth.connected) return openEventModal(null, events, refetch, c.dataset.day);
        ui.calEdit = { kind: 'new-td' }; draw();
      });
    });
    el.querySelectorAll('[data-item]').forEach((x) => x.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('a')) return; // Teams 참가·Outlook 링크
      const [kind, id] = x.dataset.item.split('|');
      if (x.dataset.d) ui.selDay = x.dataset.d;
      const it = dayItems(ui.selDay, events, true).find((i) => i.type === kind && i.id === id)
        || (kind === 'ev' && (events || []).some((x) => x.id === id) ? { type: 'ev', id, editable: events.find((x) => x.id === id).editable } : null);
      if (kind === 'ev' && it?.editable) { ui.calEdit = null; draw(); return openEventModal(id, events, refetch); }
      const ev = kind === 'ev' && (events || []).find((y) => y.id === id);
      if (ev) { ui.calEdit = null; draw(); return openEventView(ev, refetch); }
      ui.calEdit = it && it.editable && kind !== 'ev' ? { kind, id } : null;
      draw();
    }));
    el.querySelectorAll('[data-show]').forEach((x) => x.addEventListener('change', () => {
      ui.calShow[x.dataset.show] = x.checked;
      try { localStorage.setItem('calShow', JSON.stringify(ui.calShow)); } catch { /* 저장 못 해도 이번 화면엔 적용 */ }
      draw();
    }));
    el.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.new === 'ev') return openEventModal(null, events, refetch, ui.selDay);
      ui.calEdit = { kind: 'new-' + b.dataset.new }; draw();
    }));

    const form = $('#cf', el);
    if (!form) return;
    const allDay = form.querySelector('[name=allDay]');
    const syncAllDay = () => form.querySelectorAll('input.t').forEach((t) => { t.disabled = allDay.checked; });
    if (allDay) { allDay.addEventListener('change', syncAllDay); syncAllDay(); }
    if (form.dataset.kind === 'ev') linkEventEnd(form);
    form.querySelector('input').focus();
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.calEdit = null; draw(); } });
    form.querySelector('[data-cf=cancel]').onclick = () => { ui.calEdit = null; draw(); };
    const kind = form.dataset.kind, id = ui.calEdit.id || null, v = () => Object.fromEntries(new FormData(form));
    const delBtn = form.querySelector('[data-cf=del]');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm('삭제할까요?')) return;
      try {
        if (kind === 'ev') { await OUTLOOK.remove(id, (events || []).find((x) => x.id === id)?.cal); ui.calEdit = null; toast('Outlook에서 삭제했습니다'); return refetch(); }
        if (kind === 'td' && isTT(todoFind(id))) { ttDel(id); ui.calEdit = null; return draw(); }
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
          const body = { subject: val.subject, startDate: fixYmd(val.startDate), endDate: fixYmd(val.endDate), startTime: val.startTime, endTime: val.endTime, allDay: !!allDay.checked, location: val.location, calendar: val.calendar || 'team' };
          await (id ? OUTLOOK.update(id, body, (events || []).find((x) => x.id === id)?.cal) : OUTLOOK.create(body));
          ui.calEdit = null; ui.selDay = body.startDate; toast(id ? 'Outlook 일정을 고쳤습니다' : body.calendar === 'team' ? '유니버스인베스트먼트 캘린더에 추가했습니다' : '내 일정에 추가했습니다'); return refetch();
        }
        if (kind === 'td') {
          ui.lastCat = val.cat;
          const t = id ? todoFind(id) : null;
          const fields = { title: val.title.trim(), cat: val.cat, due: fixYmd(val.due) || null, note: val.note.trim() };
          if (val.due) ui.selDay = val.due;
          if (t && isTT(t)) { const { note, ...f } = fields; ttSet(id, { ...f, memo: note }); ui.calEdit = null; return draw(); } // 맡겨진 팀 할 일
          if (t) Object.assign(t, fields); else S.todos.items.push({ id: uid(), ...fields, done: false, doneAt: null, created: today() });
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
  const tok = el._tok = (el._tok || 0) + 1;
  try {
    const r = await fetchCal(ymd(start), ymd(el.id === 'cal-month' && isMobile() ? addDays(end, 7) : end)); // 폰은 향후 일정 7일까지
    if (!el.isConnected || !r.connected || el._tok !== tok) return; // 그사이 다른 달로 옮겼다
    events = r.events || []; stale = r.stale; draw();
  } catch (e) { /* 일정 실패해도 D-day·할 일은 보인다 */ }
}

// ---------- 일정 ----------
// 할 일 마감 일정([할 일])은 웍스에선 할 일로 따로 보이므로 뺀다. 서버가 안 될 때 받은 저장분(stale)은 캐시하지 않아 다음에 다시 부른다
const calOut = (r) => ({ ...r, events: r.events.filter((x) => !tcIsEv(x)) });
async function fetchCal(s, e, force) {
  const key = `${s}|${e}`;
  if (CALC[key] && !force && Date.now() - CALC[key].at < 300000) return calOut(CALC[key]);
  if (force) OUTLOOK.ids = null;
  const d = new Date(), events = await OUTLOOK.eventsSafe(`${s}T00:00:00`, `${e}T00:00:00`, force);
  const r = { connected: true, events, stale: events.stale || null, fetched: `${pad(d.getHours())}:${pad(d.getMinutes())}`, at: Date.now() };
  if (!r.stale) CALC[key] = r;
  return calOut(r);
}
// 일정 서버가 안 될 때 한 줄 안내 + 다시 시도
function calStaleBar(stale) {
  if (!stale) return '';
  const d = new Date(stale);
  return `<div class="cal-stale" role="status"><span>일정 서버 연결 안 됨 · ${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())} 기준</span><button type="button" class="btn sm" data-cal-retry>다시 시도</button></div>`;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-cal-retry]')) return;
  CALC = {}; OUTLOOK.ids = null; OUTLOOK.downAt = 0;
  if (route() === 'calendar') renderCalendar(true); else render();
});

function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

async function renderCalendar(force) {
  ui.calView ||= viewGet('calView', 'month');
  const seg = `<div class="seg"><button data-v="month" class="${ui.calView === 'month' ? 'on' : ''}">월간</button><button data-v="list" class="${ui.calView === 'list' ? 'on' : ''}">목록</button></div>`;
  const bindSeg = () => PAGE.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { ui.calView = b.dataset.v; viewSet('calView', ui.calView); renderCalendar(); }));
  if (ui.calView === 'month') {
    PAGE.innerHTML = `<div class="page-head"><h1>일정</h1><div class="tools">${seg}<button class="btn ghost" id="cal-ref">${ico('refresh', 'sm')}새로고침</button></div></div>
      <section class="card" id="cal-month"></section>`;
    bindSeg();
    $('#cal-ref').onclick = () => { CALC = {}; OUTLOOK.ids = null; renderCalendar(); };
    return mountMonth($('#cal-month'));
  }
  if (!ui.calStart) { const v = viewGet('calStart', null); ui.calStart = v ? parse(v) : weekStart(new Date()); }
  viewSet('calStart', ymd(ui.calStart));
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
    const tok = (renderCalendar.tok = (renderCalendar.tok || 0) + 1);
    const r = await fetchCal(ymd(s), ymd(e), force);
    if (route() !== 'calendar' || renderCalendar.tok !== tok || !$('#cal-body')) return; // 그사이 다른 주·월간으로 옮겼다
    const byDay = {};
    // 여러 날 일정은 걸친 날마다(기간 전에 시작한 일정도 첫날에) 보인다
    r.events.forEach((ev) => { for (let i = 0; i < 14; i++) { const k = ymd(addDays(s, i)); if (ev.start.slice(0, 10) <= k && ev.end > `${k}T00:00`) (byDay[k] ||= []).push(ev); } });
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
          <span>${ev.join && !ev.cancelled ? `<a class="btn sm" href="${esc(ev.join)}" target="_blank" rel="noopener">Teams 참가</a>` : ev.link ? `<a class="btn sm ghost" href="${esc(ev.link)}" target="_blank" rel="noopener">Outlook에서 열기</a>` : ''}</span>
        </div>`).join('') : '<div class="m muted" style="padding:6px 0;font-size:14px">일정 없음</div>'}</div></div>`;
    }
    $('#cal-body').innerHTML = `${calStaleBar(r.stale)}<section class="card" style="overflow:hidden">${html}</section>
      ${r.stale ? '' : `<div class="muted" style="font-size:12px;margin-top:8px">${r.fetched} 기준</div>`}`;
  } catch (err) { const cb = $('#cal-body'); if (cb) cb.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}

// ---------- 프로그램 ----------
function renderPrograms() {
  viewSet('progTab', ui.progTab); viewSet('progSel', ui.progSel);
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
  if (sel && !ui.progOff) ui.progOff = pushLayer(() => { ui.progOff = null; ui.progSel = null; renderPrograms(); }, () => { ui.progOff = null; ui.progSel = null; viewSet('progSel', null); }); // 오른쪽 상세 = 한 겹
  if (!sel && ui.progOff) { ui.progOff(); ui.progOff = null; }
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

// ---------- 홈페이지 미리보기 (sw.js가 hp/를 팀 파일함 '_홈페이지 미리보기'에서 읽어 준다) ----------
function renderHomepage() {
  ui.hpView ||= viewGet('hpView', 'pc');
  PAGE.innerHTML = `<div class="page-head"><h1>홈페이지</h1><span class="hp-when" id="hp-when"></span>
      <div class="tools"><div class="hp-seg" role="tablist">${[['pc', 'PC'], ['m', '모바일']].map(([k, t]) => `<button type="button" role="tab" data-hpv="${k}" aria-selected="${ui.hpView === k}" class="${ui.hpView === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <a class="btn" href="hp/" target="_blank" rel="noopener">${ico('ext', 'sm')}새 창</a></div></div>
    <div class="card hp-card ${ui.hpView === 'm' ? 'm' : ''}">${navigator.serviceWorker?.controller ? '<iframe class="hp-frame" src="hp/" title="홈페이지 미리보기"></iframe>' : '<div class="empty">한 번 새로 고침한 뒤 다시 열어 주세요.</div>'}</div>`;
  PAGE.querySelectorAll('[data-hpv]').forEach((b) => b.addEventListener('click', () => { ui.hpView = b.dataset.hpv; viewSet('hpView', ui.hpView); renderHomepage(); }));
  // 처음 접속이라 서비스워커가 아직 이 화면을 맡기 전이면, 맡는 순간 다시 그린다
  if (!navigator.serviceWorker?.controller) navigator.serviceWorker?.addEventListener('controllerchange', () => { if (route() === 'homepage') renderHomepage(); }, { once: true });
  G.get(`/drives/${CFG.teamDrive}/root:/${encodeURIComponent('_홈페이지 미리보기')}?$select=lastModifiedDateTime`).then((j) => {
    const d = new Date(j.lastModifiedDateTime), el = $('#hp-when');
    if (el) el.textContent = `${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())} 반영`;
  }).catch(() => {});
}

// ---------- 기록 ----------
function renderNotes() {
  const q = ui.noteQ.trim().toLowerCase();
  const list = S.notes.filter((n) => !q || n.name.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q));
  if (!ui.note && S.notes.length && !isMobile()) ui.note = S.notes[0].name;
  viewSet('note', ui.note); viewSet('noteQ', ui.noteQ); viewSet('noteOpen', !!ui.noteOpen);
  document.body.classList.toggle('note-open', isMobile() && !!ui.noteOpen);
  if (isMobile() && ui.noteOpen && !ui.noteOff) { // 폰에서 기록을 연 상태 = 한 겹
    ui.noteOff = pushLayer(async () => { ui.noteOff = null; await flushNote(); ui.noteOpen = false; renderNotes(); }, () => { ui.noteOff = null; ui.noteOpen = false; viewSet('noteOpen', false); flushNote(); });
  }
  PAGE.innerHTML = `
    <div class="page-head"><h1>업무일지·회의록</h1></div>
    <div class="card notes">
      <div class="notes-list">
        <div class="top">
          <div class="row"><button class="btn" data-new="daily">${ico('plus', 'sm')}업무일지</button><button class="btn" data-new="meeting">${ico('plus', 'sm')}회의록</button><button class="btn" data-new="memo">${ico('plus', 'sm')}메모</button></div>
          <input class="input" id="nq" placeholder="제목·내용 검색" value="${esc(ui.noteQ)}">
        </div>
        <ul>${list.map((n) => `<li data-n="${esc(n.name)}" class="${n.name === ui.note ? 'on' : ''}"><div class="nm">${noteTag(n.name)}${esc(noteTitle(n.name))}</div><div class="pv">${relTime(n.mtime)} · ${esc(n.preview.replace(/\s+/g, ' ').slice(0, 60))}</div></li>`).join('') || '<div class="empty">기록이 없습니다.</div>'}</ul>
      </div>
      <div class="editor" id="editor"><div class="empty" style="margin:auto">왼쪽에서 기록을 고르거나 새로 만드세요.</div></div>
    </div>`;
  $('#nq').addEventListener('input', (e) => { ui.noteQ = e.target.value; const pos = e.target.selectionStart; renderNotes(); const n = $('#nq'); n.focus(); n.setSelectionRange(pos, pos); });
  PAGE.querySelectorAll('[data-n]').forEach((li) => li.addEventListener('click', async () => { await flushNote(); ui.note = li.dataset.n; ui.noteOpen = true; renderNotes(); }));
  PAGE.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', () => newNote(b.dataset.new)));
  if (ui.note) openNote(ui.note);
}

/* 팀 회의록(2026-11-12): 새 회의록은 팀 파일함 '회의록' 폴더에 만들어 세 사람이 같이 보고 고친다. 이름 앞 '팀/'으로 내 기록과 구분.
   업무일지·메모와 옛 회의록은 그대로 내 OneDrive */
const isTeamNote = (name) => String(name || '').startsWith('팀/');
const noteTitle = (name) => String(name).replace(/^팀\//, '').replace(/\.(txt|md)$/i, '');
const noteTag = (name) => (isTeamNote(name) ? '<span class="note-team">팀</span>' : '');
const noteRead = (name) => (isTeamNote(name) ? STORE.readTeamNote(name) : STORE.readNote(name));
const noteWrite = (name, text, version) => (isTeamNote(name) ? STORE.writeTeamNote(name, text, version) : STORE.writeNote(name, text, version));
let cur = null, noteTok = 0; // 열린 기록 { name, version, text, dirty, gen, saving, conflict }
const NOTE_CONFLICT = '다른 곳에서 수정됨 — 내용을 복사해 두고 다시 여세요';
// 충돌 중에 친 내용은 저장되지 않으니 이 브라우저에 남겨 두고, 새로 고침 뒤 그 기록을 다시 열면 충돌 상태 그대로 한 번 되살린다
const noteDraftKey = (name) => `noteDraft:${name}`;
const noteDraftSet = (c) => { try { localStorage.setItem(noteDraftKey(c.name), c.text); } catch { /* 못 남기면 그대로 */ } };
async function openNote(name) {
  const ed = $('#editor'), tok = ++noteTok;
  const known = S.notes.find((x) => x.name === name);
  try {
    // 같은 기록을 다시 그릴 때(검색·새로 그리기)는 받아 둔 내용을 그대로 — 저장 안 된 글자가 사라지지 않게
    if (!(cur && cur.name === name && (cur.dirty || cur.saving || !known || known.version === cur.version))) {
      const n = await noteRead(name);
      if (tok !== noteTok) return; // 그사이 다른 기록을 눌렀다
      let draft = null; try { draft = localStorage.getItem(noteDraftKey(name)); localStorage.removeItem(noteDraftKey(name)); } catch { /* 없으면 그대로 */ }
      const keep = draft != null && draft !== n.text;
      cur = { name, version: n.version, text: keep ? draft : n.text, dirty: keep, gen: 0, saving: null, conflict: keep };
    }
    if (!ed.isConnected) return;
    ed.innerHTML = `<div class="bar"><button class="iconbtn m-only" type="button" id="note-back" aria-label="목록" style="width:44px;height:44px">${ico('left')}</button><span class="nm">${noteTag(cur.name)}${esc(noteTitle(cur.name))}</span><span class="st" id="nst">${cur.conflict ? NOTE_CONFLICT : cur.dirty ? '입력 중…' : '저장됨'}</span><button class="btn sm primary" type="button" id="note-save">저장</button></div><textarea id="nta" spellcheck="false"></textarea>`;
    ed.querySelector('#note-back').onclick = async () => { ui.noteOff?.(); ui.noteOff = null; await flushNote(); ui.noteOpen = false; renderNotes(); };
    const ta = ed.querySelector('#nta'), c = cur; ta.value = c.text;
    // 자동 저장(0.8초)과 별개로 손으로 저장: 버튼·Ctrl+S
    const saveNow = async () => {
      if (c.conflict) { toast(NOTE_CONFLICT); return; }
      c.text = ta.value; await flushNote();
      if (!c.dirty && !c.conflict) { const d = new Date(), st = cur === c && $('#nst'); if (st) st.textContent = `저장됨 ${pad(d.getHours())}:${pad(d.getMinutes())}`; toast('저장했습니다'); }
    };
    ed.querySelector('#note-save').onclick = saveNow;
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); return; }
      if (e.isComposing || e.keyCode === 229 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Tab') { e.preventDefault(); noteIndent(ta, e.shiftKey); }
      else if (e.key === 'Enter' && !e.shiftKey) noteEnter(ta, e);
    });
    ta.addEventListener('input', () => {
      c.text = ta.value; c.dirty = true; c.gen++;
      const st = $('#nst'); if (st && !c.conflict) st.textContent = '입력 중…';
      clearTimeout(noteTimer); if (!c.conflict) noteTimer = setTimeout(flushNote, 800); else noteDraftSet(c);
    });
  } catch (e) { if (tok === noteTok) ed.innerHTML = `<div class="empty" style="margin:auto">${esc(e.message)}</div>`; }
}

// 업무일지 들여쓰기: Tab=고른 줄(없으면 지금 줄)을 한 단계 안으로, Shift+Tab=한 단계 밖으로.
// 고친 부분만 insertText로 바꿔 Ctrl+Z가 되고 input 이벤트로 자동 저장도 그대로 돈다.
function noteReplace(ta, from, to, text, selStart, selEnd) {
  ta.focus(); ta.setSelectionRange(from, to);
  if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, from, to); ta.dispatchEvent(new Event('input')); }
  ta.setSelectionRange(selStart, selEnd);
}
function noteIndent(ta, out) {
  const v = ta.value, s = ta.selectionStart, e0 = ta.selectionEnd;
  const e = e0 > s && v[e0 - 1] === '\n' ? e0 - 1 : e0; // 다음 줄 맨 앞까지 고른 경우 그 줄은 빼기
  const a = v.lastIndexOf('\n', s - 1) + 1, z = v.indexOf('\n', e) < 0 ? v.length : v.indexOf('\n', e);
  const lines = v.slice(a, z).split('\n');
  const cut = (l) => (l[0] === '\t' ? 1 : (l.match(/^ {1,4}/) || [''])[0].length);
  const next = lines.map((l) => (out ? l.slice(cut(l)) : '\t' + l));
  if (out && next.every((l, i) => l === lines[i])) return;
  const d0 = out ? -Math.min(cut(lines[0]), s - a) : 1, dAll = next.join('\n').length - (z - a);
  noteReplace(ta, a, z, next.join('\n'), Math.max(a, s + d0), Math.max(a, e0 + dAll));
}
function noteEnter(ta, e) {
  const v = ta.value, s = ta.selectionStart, a = v.lastIndexOf('\n', s - 1) + 1;
  const ind = v.slice(a, s).match(/^[\t ]*/)[0];
  if (!ind) return; // 들여쓰지 않은 줄은 원래대로
  e.preventDefault();
  const p = s + 1 + ind.length;
  noteReplace(ta, s, ta.selectionEnd, '\n' + ind, p, p);
}

async function flushNote() {
  clearTimeout(noteTimer);
  const c = cur; if (!c) return;
  if (c.saving) await c.saving; // 앞 저장이 끝난 뒤 최신 버전으로
  if (!c.dirty || c.conflict) return;
  const gen = c.gen, text = c.text;
  c.saving = (async () => {
    try {
      c.version = await noteWrite(c.name, text, c.version);
      if (c.gen === gen) c.dirty = false; // 저장하는 사이에 친 글자가 있으면 한 번 더
      const st = cur === c && $('#nst'); if (st && !c.dirty) { const d = new Date(); st.textContent = `저장됨 ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
      const n = S.notes.find((x) => x.name === c.name); if (n) { n.mtime = Date.now() / 1000; n.preview = text.slice(0, 400); n.version = c.version; }
    } catch (e) {
      toast(e.message);
      if (e.status === 409) { c.conflict = true; noteDraftSet(c); const st = cur === c && $('#nst'); if (st) st.textContent = NOTE_CONFLICT; }
    }
  })();
  try { await c.saving; } finally { c.saving = null; }
  if (c.dirty && !c.conflict) return flushNote();
}

async function newNote(kind) {
  await flushNote();
  const d = new Date(), y = String(d.getFullYear()).slice(2), m = pad(d.getMonth() + 1), dd = pad(d.getDate()), w = WD[d.getDay()];
  const full = `${d.getFullYear()}.${m}.${dd}(${w})`;
  let name, text;
  if (kind === 'daily') { name = `업무 일지_${y}.${m}.${dd}.txt`; text = `업무 일지\n${full}${G.isOwner ? ` Day-${workDay(today())}` : ''}\n\n1. `; }
  else if (kind === 'meeting') { name = `팀/회의록_${y}.${m}.${dd}(${w}).txt`; text = `회의록\n${full}\n참석: \n안건: \n\n1. `; } // 팀 파일함
  else { name = `메모_${y}.${m}.${dd}_${pad(d.getHours())}${pad(d.getMinutes())}.txt`; text = ''; }
  const base = name.replace(/\.txt$/, '');
  let i = 2;
  if (S.notes.some((n) => n.name === name)) {
    if (kind === 'daily') { ui.note = name; ui.noteOpen = true; toast('오늘 업무일지가 이미 있어 그 파일을 엽니다'); return renderNotes(); }
    while (S.notes.some((n) => n.name === `${base}_${i}.txt`)) i++; name = `${base}_${i++}.txt`;
  }
  try {
    for (;;) {
      try { await noteWrite(name, text, null); break; } catch (e) {
        if (e.status !== 409) throw e;
        if (kind === 'daily') { toast('오늘 업무일지가 이미 있어 그 파일을 엽니다'); break; } // 다른 기기에서 오늘 업무일지를 먼저 만들었다 → 그 파일을 연다
        if (i > 9) throw e; // 같은 이름을 다른 사람·기기가 먼저 만들었다 → 다음 번호로
        name = `${base}_${i++}.txt`;
      }
    }
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
/* 새로 고침·창 닫기 전에: 저장 안 된 업무일지(입력 대기·저장 중·충돌)나 고친 채 저장 안 한 입력 폼이 있으면 묻는다 */
const FORMS = '#evf, #pf, #cf, #todo-edit, #sheet-todo, #addf';
const formDirty = () => [...document.querySelectorAll(FORMS)].some((f) => [...f.elements].some((x) => {
  if (x.disabled) return false;
  if (x.type === 'checkbox' || x.type === 'radio') return x.checked !== x.defaultChecked;
  if (x.tagName === 'SELECT') return x.value !== ([...x.options].find((o) => o.defaultSelected) || x.options[0])?.value;
  return 'defaultValue' in x && x.value !== x.defaultValue; // 처음 그린 값과 다르면 고친 것
}));
window.addEventListener('beforeunload', (e) => {
  if (cur && cur.dirty) flushNote();
  if ((cur && (cur.dirty || cur.saving)) || formDirty()) { e.preventDefault(); e.returnValue = ''; }
});
async function refresh() { // 다른 기기·Claude Code가 바꾼 내용 반영 (편집 중이 아닐 때만)
  const r = route();
  if (!S || document.hidden || saving() || (r === 'todos' && ui.todoEdit) || (['home', 'calendar'].includes(r) && ui.calEdit) || ui.mail?.compose || (r === 'programs' && ui.progSel) || (cur && (cur.dirty || cur.saving)) || document.activeElement?.matches('input,textarea,select')) return;
  const sig = () => JSON.stringify([S.todos.version, S.programs.version, S.milestones.version, S.briefing.mtime, S.notes.map((n) => n.version), TT.etag]);
  const before = sig();
  refresh.at = Date.now();
  try { await load(); } catch { return; }
  if (before !== sig() && ['home', 'todos', 'calendar', 'programs', 'notes'].includes(route())) render(); // 기록: 팀 회의록을 다른 사람이 고쳤으면 목록·열린 글을 새로(입력 중이면 위에서 건너뜀)
}
setInterval(refresh, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { CALC = {}; refresh(); } });
// PC는 창을 옮겨 다녀도 visibilitychange가 안 온다: 창으로 돌아올 때도(20초에 한 번까지) 팀 할 일·팀 회의록 다시 읽기
window.addEventListener('focus', () => { if (Date.now() - (refresh.at || 0) > 20000) refresh(); });

function loginScreen(msg) {
  document.body.classList.add('signed-out');
  $('#login').innerHTML = `<div class="login-box">
    <div class="brand-mark">UNIVERSE WORKS</div>
    <p class="muted">${msg ? esc(msg) : '유니버스인베스트먼트 회사 계정'}</p>
    <button class="btn primary" id="login-go" style="width:100%;height:44px">회사 계정으로 로그인</button>
    ${G.wrongAccount ? '<button class="btn ghost" id="login-out" style="width:100%;margin-top:8px">다른 계정 로그아웃</button>' : ''}
  </div>`;
  // 로그인 창으로 못 넘어가면(브라우저 저장소 막힘·MSAL 오류 등) 조용히 멈추지 않고 이유를 보여 준다
  $('#login-go').onclick = () => G.login().catch((e) => loginScreen(`로그인 화면을 열지 못했습니다: ${e.errorCode || e.message || e}`));
  if ($('#login-out')) $('#login-out').onclick = () => G.logout();
}

$('#me')?.addEventListener('click', () => { if (S) accountMenu(); });
async function start() {
  try {
    if (!(await G.init())) {
      // 받은 링크(#files/… 등)로 들어왔는데 로그인이 필요하면, 로그인 뒤 그 화면으로 돌아오게 기억해 둔다
      if (location.hash.length > 1 && !/^#(code|state|error)=/.test(location.hash)) try { sessionStorage.setItem('worksNext', location.hash); } catch { /* 못 기억하면 대시보드로 */ }
      return loginScreen(G.wrongAccount ? `${G.wrongAccount} 계정으로는 열 수 없습니다` : '');
    }
    try { const nx = sessionStorage.getItem('worksNext'); if (nx) { sessionStorage.removeItem('worksNext'); if (!location.hash || location.hash === '#home') history.replaceState(null, '', nx); } } catch { /* 없으면 그대로 */ }
    if (!history.state?.seq) history.replaceState(hStamp(0), ''); // 로그인 처리 중 MSAL이 기록을 바꿨으면 다시 번호
    hRoute = route();
    document.body.classList.remove('signed-out');
    if (typeof evLink !== 'undefined') evLink = '#deals/events'; // 홈 행사 카드 → 딜소싱 > 행사
    PAGE.innerHTML = '<div class="empty">불러오는 중…</div>';
    await load();
    render();
    setTimeout(() => { if (typeof gdOpen === 'function') gdOpen(); }, 900); // 처음 들어온 사람에게 한 번 사용 안내
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
    if (!hadController || reloaded || (cur && cur.dirty) || ui.mail?.compose || formDirty() || window.flUploading > 0 || (typeof rdS !== 'undefined' && rdS.dirty.size) || (typeof ppS !== 'undefined' && ppS.dirty.size) || (typeof ipoState !== 'undefined' && ipoState.dirty.size) || (typeof peS !== 'undefined' && peS.dirty.size) || saving() || document.activeElement?.matches('input,textarea')) return;
    reloaded = true; location.reload();
  });
}
// mail.js·events.js 등 뒤에 붙는 스크립트까지 다 읽힌 다음 시작 (그 전에 그리면 renderMail 등이 아직 없다)
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
