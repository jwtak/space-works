/* 요청사항: 화면마다 대표님·팀원이 "이런 게 있으면 좋겠다"를 남기고, 고친 뒤 그 아래 의견(답글)을 단다.
   데이터는 팀 파일함 '_웍스/요청사항.json' 하나(세 사람 모두 쓰기 가능). 저장은 eTag로 충돌을 막고, 겹치면 다시 읽어 다시 적용한다.
   PC는 각 화면 본문 오른쪽에 항상 고정된 칸(닫지 않음), 폰은 이름 메뉴에서 여는 덮는 패널. */
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
// loaded: 한 번이라도 제대로 읽었는지(또는 파일이 없음을 확인했는지). gen: 저장이 시작·끝날 때마다 올려, 그 사이 끝난 읽기는 버린다
const rqS = { items: [], etag: null, at: 0, scope: 'page', open: null, reply: null, replyDraft: '', busy: false, loaded: false, gen: 0 };
const rqUrl = () => `/drives/${CFG.teamDrive}/root:/${RQ_PATH.split('/').map(encodeURIComponent).join('/')}:`;
const rqPage = () => (document.body.dataset.route || 'home');
const RQ_MQ = '(min-width: 761px)'; // PC = 붙여 두기
const RQ_MQL = matchMedia(RQ_MQ); // 변수에 잡아 둬야 폭 변화 알림이 사라지지 않는다
const rqWide = () => RQ_MQL.matches;
const rqWhen = (s) => { const d = new Date(s); return isNaN(d) ? '' : `${d.getMonth() + 1}.${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const rqWho = () => [myName(), myTitle()].filter(Boolean).join(' ');
const rqDrafting = () => [...document.querySelectorAll('#req textarea')].some((t) => t.value.trim());

// inSave: rqSave 안에서 부를 때. 밖에서 부른 읽기는 저장 중이거나 그 사이 저장이 있었으면 결과를 버린다(false)
async function rqLoad(inSave) {
  const g = rqS.gen;
  let items = [], etag = null;
  try {
    const meta = await G.get(`${rqUrl()}?$select=eTag`);
    const text = await G.get(`${rqUrl()}/content`, { type: 'text' });
    const d = JSON.parse(text || '{}');
    items = Array.isArray(d.items) ? d.items.filter((x) => x && typeof x === 'object') : []; etag = meta.eTag;
  } catch (e) {
    if (e.status !== 404) throw e; // 404 = 아직 아무도 안 씀
  }
  if (inSave !== true && (g !== rqS.gen || rqS.busy)) return false;
  rqS.items = items; rqS.etag = etag; rqS.loaded = true; rqS.at = Date.now();
  return true;
}

// fn(items)로 고친 뒤 저장. 다른 사람이 먼저 저장했으면(412·409) 다시 읽고 다시 적용 — fn은 여러 번 적용돼도 같은 결과여야 한다
async function rqSave(fn) {
  rqS.gen++;
  try {
    if (!rqS.loaded) await rqLoad(true); // 처음 읽기가 실패했거나 아직이면 먼저 읽는다(빈 목록으로 남의 요청을 덮지 않게)
    for (let i = 0; i < 4; i++) {
      if (i) await rqLoad(true);
      fn(rqS.items);
      try {
        // eTag가 없으면(새 파일) 그사이 누가 만들었을 때 덮지 않고 409로 실패하게
        const r = await G.put(`${rqUrl()}/content${rqS.etag ? '' : '?@microsoft.graph.conflictBehavior=fail'}`, JSON.stringify({ items: rqS.items }, null, 1),
          { headers: { 'Content-Type': 'application/json', ...(rqS.etag ? { 'If-Match': rqS.etag } : {}) } });
        rqS.etag = r?.eTag || null; rqS.at = Date.now();
        return;
      } catch (e) { if (![409, 412].includes(e.status)) throw e; }
    }
    throw new Error('다른 사람이 동시에 쓰고 있습니다. 잠시 후 다시 해 주세요');
  } finally { rqS.gen++; }
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
    ${(Array.isArray(x.replies) ? x.replies : []).filter(Boolean).map((r) => `<div class="rq-re"><div class="rq-meta"><b>${esc(r.by)}</b><span>${rqWhen(r.at)}</span></div><p class="rq-txt">${esc(r.text)}</p></div>`).join('')}
    ${rqS.reply === x.id ? `<form class="rq-rf" data-rf="${esc(x.id)}"><textarea class="area" name="t" rows="2" placeholder="의견을 입력하세요" required>${esc(rqS.replyDraft)}</textarea>
      <div class="rq-act"><button type="button" class="btn sm grey" data-rcancel>취소</button><button class="btn sm primary" ${rqS.busy ? 'disabled' : ''}>등록</button></div></form>` : ''}
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
    .sort((a, b) => (a.status === 'done') - (b.status === 'done') || String(b.at || '').localeCompare(String(a.at || '')));
  const draft = $('#rq-t')?.value || '';
  box.innerHTML = `<div class="rq-hd"><h2>요청사항</h2>
      <div class="rq-seg">${[['page', CRUMB[page] || '이 화면'], ['all', '전체']].map(([k, t]) => `<button type="button" data-scope="${k}" class="${rqS.scope === k ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <button type="button" class="iconbtn rq-x" data-rqx aria-label="닫기"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <form class="rq-new" id="rq-new"><textarea class="area" id="rq-t" rows="3" placeholder="${esc(RQ_HINT[page] || '예: 이런 기능이 있으면 좋겠습니다')}" required>${esc(draft)}</textarea>
      <div class="rq-act"><button class="btn sm primary" ${rqS.busy ? 'disabled' : ''}>등록</button></div></form>
    <ul class="rq-list">${list.length ? list.map(rqItemHTML).join('') : '<li class="rq-none">아직 요청이 없습니다</li>'}</ul>`;
}

// 저장에 성공하면 true. 실패하면 다시 읽어 저장 안 된 변경을 화면에서 걷어낸다
async function rqAct(fn, msg) {
  if (rqS.busy) { toast('저장 중입니다'); return false; }
  rqS.busy = true; rqDraw();
  let ok = false;
  try { await rqSave(fn); ok = true; if (msg) toast(msg); } catch (e) { toast(e.message); }
  rqS.busy = false;
  if (!ok) { rqS.loaded = false; await rqLoad().catch(() => {}); } // 못 읽으면 다음 저장 때 먼저 읽는다
  rqCount(); rqDraw();
  return ok;
}

function rqBind(box) {
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.scope) { rqS.scope = t.dataset.scope; rqDraw(); return; }
    if ('rqx' in t.dataset) { rqClose(); return; }
    if (t.dataset.reply) { rqS.reply = rqS.reply === t.dataset.reply ? null : t.dataset.reply; rqS.replyDraft = ''; rqDraw(); box.querySelector('.rq-rf textarea')?.focus(); return; }
    if ('rcancel' in t.dataset) { rqS.reply = null; rqS.replyDraft = ''; rqDraw(); return; }
    if (t.dataset.done) {
      const id = t.dataset.done, to = rqS.items.find((i) => i.id === id)?.status === 'done' ? 'open' : 'done'; // 누른 순간 보이던 상태 기준
      rqAct((items) => { items.forEach((x) => { if (x.id === id) x.status = to; }); }); return;
    }
    if (t.dataset.del) {
      if (!confirm('이 요청을 삭제할까요?')) return;
      const id = t.dataset.del; rqAct((items) => { for (let i = items.length - 1; i >= 0; i--) if (items[i].id === id) items.splice(i, 1); }, '삭제했습니다');
    }
  });
  box.addEventListener('input', (e) => { if (e.target.matches('.rq-rf textarea')) rqS.replyDraft = e.target.value; });
  box.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, by = rqWho(), email = (G.account?.username || '').toLowerCase(), at = new Date().toISOString();
    if (rqS.busy) { toast('저장 중입니다'); return; }
    if (f.id === 'rq-new') {
      const text = $('#rq-t').value.trim(); if (!text) return;
      const item = { id: uid(), page: rqPage(), text, by, email, at, status: 'open', replies: [] };
      const ok = await rqAct((items) => { if (!items.some((x) => x.id === item.id)) items.push(item); }, '요청을 남겼습니다');
      const inp = $('#rq-t'); if (!inp) return;
      if (ok) { if (inp.value.trim() === text) inp.value = ''; } else if (!inp.value.trim()) inp.value = text; // 실패하면 쓴 글을 그대로 둔다
    } else if (f.dataset.rf) {
      const id = f.dataset.rf, text = f.t.value.trim(); if (!text) return;
      const re = { id: uid(), text, by, email, at };
      const ok = await rqAct((items) => {
        const x = items.find((i) => i.id === id); if (!x) return;
        if (!Array.isArray(x.replies)) x.replies = [];
        if (!x.replies.some((r) => r && r.id === re.id)) x.replies.push(re);
      });
      if (ok && rqS.reply === id) { rqS.reply = null; rqS.replyDraft = ''; rqDraw(); }
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
  if (Date.now() - rqS.at > 20000 && !rqS.busy) rqLoad().then((ok) => { if (!ok) return; rqCount(); if (!rqDrafting()) rqDraw(); }).catch(() => {});
}
// viaBack === true: 뒤로 가기·다른 메뉴로 옮기기·화면 폭 변화로 닫힘 → 붙여 두기 설정은 그대로
function rqClose(viaBack) {
  const box = $('#req'); if (!box) return;
  box.hidden = true; document.body.classList.remove('req-on');
  if (viaBack !== true && rqWide()) { try { localStorage.setItem('reqDock', '0'); } catch { /* 기억 못 해도 됨 */ } }
  if (viaBack !== true && rqOff) { rqOff(); rqOff = null; }
}
function rqToggle() { $('#req')?.hidden ? rqOpen() : rqClose(); }
const rqDock = () => true; // PC는 항상 열어 둔다

// 앱 시작 후(로그인·데이터 읽은 뒤) app.js load()가 부른다
async function rqInit() {
  const box = $('#req');
  if (!box || box.dataset.bound) return; // load()가 1분마다 다시 불러도 한 번만
  box.dataset.bound = '1'; rqBind(box);
  $('#req-btn')?.addEventListener('click', rqToggle);
  if (rqWide() && rqDock()) rqOpen();
  // PC↔폰 폭을 넘나들 때: PC가 되면 덮는 겹을 없애고 붙여 두기, 폰이 되면 붙여 둔 패널을 닫는다(겹 없이 덮어 두지 않게)
  RQ_MQL.addEventListener?.('change', (e) => {
    if (e.matches) {
      if (rqOff) { rqOff(); rqOff = null; }
      if (!box.hidden) { try { localStorage.setItem('reqDock', '1'); } catch { /* 기억 못 해도 됨 */ } } else if (rqDock()) rqOpen();
    } else if (!box.hidden) rqClose(true);
  });
  window.addEventListener('hashchange', () => { rqS.reply = null; rqS.replyDraft = ''; rqDraw(); });
  setInterval(() => {
    if (document.hidden || rqS.busy || document.activeElement?.closest?.('#req')) return;
    rqLoad().then((ok) => { if (!ok) return; rqCount(); if (!rqDrafting()) rqDraw(); }).catch(() => {});
  }, 60000);
  try { if (await rqLoad()) { rqCount(); rqDraw(); } } catch { /* 요청사항은 없어도 된다 */ }
}
