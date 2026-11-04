/* 요청사항: 화면마다 대표님·팀원이 "이런 게 있으면 좋겠다"를 남기고, 고친 뒤 그 아래 의견(답글)을 단다.
   데이터는 팀 파일함 '_웍스/요청사항.json' 하나(세 사람 모두 쓰기 가능). 저장은 eTag로 충돌을 막고, 겹치면 다시 읽어 다시 적용한다.
   넓은 화면(1800px 이상)은 오른쪽에 붙여 두고, 그보다 좁으면 위쪽 '요청사항' 버튼으로 연다. */
const RQ_PATH = '_웍스/요청사항.json';
const RQ_HINT = {
  home: '예: 대시보드에 이번 주 딜 미팅 일정도 같이 보이면 좋겠습니다',
  mail: '예: 메일 목록에서 보낸 사람별로 묶어 보기가 있으면 좋겠습니다',
  todos: '예: 할 일에 담당자를 지정할 수 있으면 좋겠습니다',
  deals: '예: 행사 목록을 지역별 지도로도 볼 수 있으면 좋겠습니다',
  weekly: '예: 이번 주 회의 자료가 맨 위에 바로 보이면 좋겠습니다',
  files: '예: 최근에 올라온 파일만 모아 보는 화면이 있으면 좋겠습니다',
  notes: '예: 회의록에 참석자를 고르는 칸이 있으면 좋겠습니다',
  programs: '예: 프로그램마다 담당자와 마감일이 보이면 좋겠습니다',
  homepage: '예: 투자전략 페이지 첫 문장을 더 짧게 바꾸면 좋겠습니다',
};
const rqS = { items: [], etag: null, at: 0, scope: 'page', open: null, reply: null, busy: false };
const rqUrl = () => `/drives/${CFG.teamDrive}/root:/${RQ_PATH.split('/').map(encodeURIComponent).join('/')}:`;
const rqPage = () => (document.body.dataset.route || 'home');
const rqWide = () => matchMedia('(min-width: 1800px)').matches;
const rqWhen = (s) => { const d = new Date(s); return `${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const rqWho = () => [myName(), myTitle()].filter(Boolean).join(' ');

async function rqLoad() {
  try {
    const meta = await G.get(`${rqUrl()}?$select=eTag`);
    const text = await G.get(`${rqUrl()}/content`, { type: 'text' });
    const d = JSON.parse(text || '{}');
    rqS.items = Array.isArray(d.items) ? d.items : []; rqS.etag = meta.eTag;
  } catch (e) {
    if (e.status !== 404) throw e;
    rqS.items = []; rqS.etag = null; // 아직 아무도 안 씀
  }
  rqS.at = Date.now();
}

// fn(items)로 고친 뒤 저장. 다른 사람이 먼저 저장했으면(412) 다시 읽고 다시 적용
async function rqSave(fn) {
  for (let i = 0; i < 4; i++) {
    if (i) await rqLoad();
    fn(rqS.items);
    try {
      const r = await G.put(`${rqUrl()}/content`, JSON.stringify({ items: rqS.items }, null, 1),
        { headers: { 'Content-Type': 'application/json', ...(rqS.etag ? { 'If-Match': rqS.etag } : {}) } });
      rqS.etag = r?.eTag || null; rqS.at = Date.now();
      return;
    } catch (e) { if (![409, 412].includes(e.status)) throw e; }
  }
  throw new Error('다른 사람이 동시에 쓰고 있습니다. 잠시 후 다시 해 주세요');
}

function rqCount() {
  const n = rqS.items.filter((x) => x.status !== 'done').length;
  document.querySelectorAll('[data-cnt=req]').forEach((el) => { el.textContent = n || ''; });
}

function rqItemHTML(x) {
  const mine = x.email === (G.account?.username || '').toLowerCase(), done = x.status === 'done';
  return `<li class="rq-it${done ? ' done' : ''}" data-id="${esc(x.id)}">
    <div class="rq-meta"><b>${esc(x.by)}</b><span>${rqWhen(x.at)}</span>${rqS.scope === 'all' ? `<span>${esc(CRUMB[x.page] || x.page)}</span>` : ''}
      <span class="chip ${done ? 'green' : 'blue'} rq-st">${done ? '반영 완료' : '요청'}</span></div>
    <p class="rq-txt">${esc(x.text)}</p>
    ${(x.replies || []).map((r) => `<div class="rq-re"><div class="rq-meta"><b>${esc(r.by)}</b><span>${rqWhen(r.at)}</span></div><p class="rq-txt">${esc(r.text)}</p></div>`).join('')}
    ${rqS.reply === x.id ? `<form class="rq-rf" data-rf="${esc(x.id)}"><textarea class="area" name="t" rows="2" placeholder="의견을 입력하세요" required></textarea>
      <div class="rq-act"><button type="button" class="btn sm grey" data-rcancel>취소</button><button class="btn sm primary">등록</button></div></form>` : ''}
    <div class="rq-tools">
      <button type="button" data-reply="${esc(x.id)}">의견 달기</button>
      ${G.isOwner ? `<button type="button" data-done="${esc(x.id)}">${done ? '요청으로 되돌리기' : '반영 완료'}</button>` : ''}
      ${mine ? `<button type="button" class="rq-del" data-del="${esc(x.id)}">삭제</button>` : ''}
    </div></li>`;
}

function rqDraw() {
  const box = $('#req'); if (!box || box.hidden) return;
  const page = rqPage();
  const list = rqS.items.filter((x) => rqS.scope === 'all' || x.page === page)
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.at.localeCompare(a.at));
  const draft = $('#rq-t')?.value || '';
  box.innerHTML = `<div class="rq-hd"><h2>요청사항</h2>
      <div class="rq-seg">${[['page', CRUMB[page] || '이 화면'], ['all', '전체']].map(([k, t]) => `<button type="button" data-scope="${k}" class="${rqS.scope === k ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <button type="button" class="iconbtn rq-x" data-rqx aria-label="닫기"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <form class="rq-new" id="rq-new"><textarea class="area" id="rq-t" rows="3" placeholder="${esc(RQ_HINT[page] || '예: 이런 기능이 있으면 좋겠습니다')}" required>${esc(draft)}</textarea>
      <div class="rq-act"><button class="btn sm primary" ${rqS.busy ? 'disabled' : ''}>등록</button></div></form>
    <ul class="rq-list">${list.length ? list.map(rqItemHTML).join('') : '<li class="rq-none">아직 요청이 없습니다</li>'}</ul>`;
}

async function rqAct(fn, msg) {
  if (rqS.busy) return;
  rqS.busy = true;
  try { await rqSave(fn); if (msg) toast(msg); } catch (e) { toast(e.message); }
  rqS.busy = false; rqCount(); rqDraw();
}

function rqBind(box) {
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.scope) { rqS.scope = t.dataset.scope; rqDraw(); return; }
    if ('rqx' in t.dataset) { rqClose(); return; }
    if (t.dataset.reply) { rqS.reply = rqS.reply === t.dataset.reply ? null : t.dataset.reply; rqDraw(); box.querySelector('.rq-rf textarea')?.focus(); return; }
    if ('rcancel' in t.dataset) { rqS.reply = null; rqDraw(); return; }
    if (t.dataset.done) { const id = t.dataset.done; rqAct((items) => { const x = items.find((i) => i.id === id); if (x) x.status = x.status === 'done' ? 'open' : 'done'; }); return; }
    if (t.dataset.del) {
      if (!confirm('이 요청을 삭제할까요?')) return;
      const id = t.dataset.del; rqAct((items) => { const i = items.findIndex((x) => x.id === id); if (i >= 0) items.splice(i, 1); }, '삭제했습니다');
    }
  });
  box.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, by = rqWho(), email = (G.account?.username || '').toLowerCase(), at = new Date().toISOString();
    if (f.id === 'rq-new') {
      const text = $('#rq-t').value.trim(); if (!text) return;
      const item = { id: uid(), page: rqPage(), text, by, email, at, status: 'open', replies: [] };
      $('#rq-t').value = '';
      rqAct((items) => { items.push(item); }, '요청을 남겼습니다');
    } else if (f.dataset.rf) {
      const id = f.dataset.rf, text = f.t.value.trim(); if (!text) return;
      rqS.reply = null;
      rqAct((items) => { const x = items.find((i) => i.id === id); if (x) (x.replies ||= []).push({ id: uid(), text, by, email, at }); });
    }
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches('textarea')) e.target.form?.requestSubmit(); });
}

// 열기·닫기: 넓은 화면은 오른쪽에 붙여 두고(닫으면 기억), 좁으면 위에 덮는 패널
let rqOff = null;
function rqOpen() {
  const box = $('#req'); if (!box) return;
  box.hidden = false; document.body.classList.add('req-on');
  if (rqWide()) { try { localStorage.setItem('reqDock', '1'); } catch { /* 기억 못 해도 됨 */ } } else if (!rqOff) rqOff = pushLayer(() => { rqOff = null; rqClose(true); }, () => { rqOff = null; rqClose(true); });
  rqDraw();
  if (Date.now() - rqS.at > 20000) rqLoad().then(() => { rqCount(); rqDraw(); }).catch(() => {});
}
function rqClose(viaBack) {
  const box = $('#req'); if (!box) return;
  box.hidden = true; document.body.classList.remove('req-on');
  if (rqWide()) { try { localStorage.setItem('reqDock', '0'); } catch { /* 기억 못 해도 됨 */ } }
  if (viaBack !== true && rqOff) { rqOff(); rqOff = null; }
}
function rqToggle() { $('#req')?.hidden ? rqOpen() : rqClose(); }

// 앱 시작 후(로그인·데이터 읽은 뒤) app.js load()가 부른다
async function rqInit() {
  const box = $('#req');
  if (!box || box.dataset.bound) return; // load()가 1분마다 다시 불러도 한 번만
  box.dataset.bound = '1'; rqBind(box);
  $('#req-btn')?.addEventListener('click', rqToggle);
  let dock = '1'; try { dock = localStorage.getItem('reqDock') ?? '1'; } catch { /* 기본은 붙여 둠 */ }
  if (rqWide() && dock === '1') rqOpen();
  window.addEventListener('hashchange', () => { rqS.reply = null; rqDraw(); });
  setInterval(() => { if (!document.hidden && !rqS.busy && !document.activeElement?.closest?.('#req')) rqLoad().then(() => { rqCount(); rqDraw(); }).catch(() => {}); }, 60000);
  try { await rqLoad(); rqCount(); rqDraw(); } catch { /* 요청사항은 없어도 된다 */ }
}
