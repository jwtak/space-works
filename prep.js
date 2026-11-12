/* 준비서류 체크(2026-11-12): 공통업무 > 법인설립(#corp)·금감원 면담(#fss).
   목록과 체크 상태는 팀 파일함 '_웍스/준비서류.json' 하나를 세 사람이 같이 쓴다(누구나 체크, 누가 언제 했는지 남김).
   { lists: { corp|fss: { title, event, date, src, folder, personFolders?, people[], roles{}, owners[],
       sections[{ title, kind: 'people'|'company', note, items[{ id, title, detail, due, na?[사람], owner? }] }] } },
     state: { <항목 id>: 사람 서류면 { <사람>: { s: 'todo'|'done'|'na', by, at } }, 회사 서류면 { owner, s, by, at } },
     memos: { <항목 id>: { t, by, at } } }  — 서류 줄마다 메모 하나(누구나 쓰고 고친다, 비우면 지움)
   서류 목록은 공개 저장소에 두지 않으려고 코드에 없다 — 목록을 바꿀 땐 그 파일을 고친다.
   저장은 할 일 맡기기(app.js ttSave)처럼 eTag로 충돌을 막고, 겹치면 다시 읽어 다시 적용한다 */
const PR_PATH = '_웍스/준비서류.json';
const PR = { d: null, etag: null, loaded: false, at: 0, gen: 0, busy: 0, q: Promise.resolve(), err: '', edit: null, draft: '' }; // edit: 메모를 쓰고 있는 항목 id
const prUrl = () => `/drives/${CFG.teamDrive}/root:/${PR_PATH.split('/').map(encodeURIComponent).join('/')}:`;
const prOn = () => ['corp', 'fss'].includes(route());

// inSave: prSave 안에서 부를 때. 밖에서 부른 읽기는 저장 중이거나 그사이 저장이 있었으면 버린다(false)
async function prLoad(inSave) {
  const g = PR.gen;
  let d = null, etag = null;
  try {
    const meta = await G.get(`${prUrl()}?$select=eTag`);
    d = JSON.parse((await G.get(`${prUrl()}/content`, { type: 'text' })) || '{}'); etag = meta.eTag;
  } catch (e) { if (e.status !== 404) throw e; } // 404 = 아직 목록 파일이 없음
  if (inSave !== true && (g !== PR.gen || PR.busy)) return false;
  PR.d = d && typeof d === 'object' ? d : {}; PR.d.lists ||= {}; PR.d.state ||= {}; PR.d.memos ||= {};
  PR.etag = etag; PR.loaded = true; PR.at = Date.now(); PR.err = '';
  return true;
}
async function prSave(fn) {
  PR.gen++;
  try {
    if (!PR.loaded) await prLoad(true);
    for (let i = 0; i < 4; i++) {
      if (i) await prLoad(true);
      fn(PR.d);
      try {
        const r = await G.put(`${prUrl()}/content${PR.etag ? '' : '?@microsoft.graph.conflictBehavior=fail'}`, JSON.stringify(PR.d, null, 1),
          { headers: { 'Content-Type': 'application/json', ...(PR.etag ? { 'If-Match': PR.etag } : {}) } });
        PR.etag = r?.eTag || null;
        return i > 0;
      } catch (e) { if (![409, 412].includes(e.status)) throw e; }
    }
    throw new Error('다른 분이 동시에 고치고 있습니다. 잠시 후 다시 해 주세요');
  } finally { PR.gen++; }
}
// 화면에 먼저 적용하고 저장은 줄을 세운다. 실패하면 다시 읽어 저장 안 된 변경을 걷어낸다. fn은 여러 번 적용돼도 같은 결과여야 한다
function prAct(fn) {
  fn(PR.d); PR.busy++; PR.gen++; prDraw();
  PR.q = PR.q.then(async () => {
    let redraw = false;
    try { redraw = await prSave(fn); } catch (e) { toast(e.message); PR.loaded = false; await prLoad(true).catch(() => {}); redraw = true; }
    finally { PR.busy--; }
    if (redraw && prOn() && !prTyping()) prDraw();
  });
}

const prTyping = () => !!PR.edit || !!document.activeElement?.matches('select');
const prMe = () => personName(G.account?.username);
const prStamp = () => ({ by: (G.account?.username || '').toLowerCase(), at: new Date().toISOString() });
const prMD = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const prWhen = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const prFolder = (p) => `#files/${p.split('/').map(encodeURIComponent).join('/')}`;
// 사람 서류 한 칸의 상태: 기록이 없으면 그 사람이 해당 없음(na) 목록에 있는지로 정한다
const prCell = (it, p) => PR.d.state[it.id]?.[p] || { s: (it.na || []).includes(p) ? 'na' : 'todo' };
const prCo = (it) => ({ owner: it.owner || '', s: 'todo', ...(PR.d.state[it.id] || {}) });
function prMemo(it) {
  if (PR.edit === it.id) return `<div class="pr-medit"><textarea class="area" data-mtext rows="2" maxlength="500" placeholder="예: 11/12 하임에 원본 요청함, 다음 주 수령">${esc(PR.draft)}</textarea>
    <div class="pr-mbtns"><span>Ctrl+Enter 저장, 비우고 저장하면 지움</span><button type="button" class="btn sm ghost" data-mcancel>취소</button><button type="button" class="btn sm primary" data-msave="${esc(it.id)}">저장</button></div></div>`;
  const m = PR.d.memos[it.id];
  return m?.t ? `<button type="button" class="pr-memo" data-medit="${esc(it.id)}" title="눌러서 고치기"><span class="pr-mt">${esc(m.t)}</span><span class="pr-mw">${esc(personName(m.by))} ${prWhen(m.at)}</span></button>` : '';
}
const prMemoBtn = (it) => (PR.edit === it.id || PR.d.memos[it.id]?.t ? '' : `<button type="button" class="pr-madd" data-medit="${esc(it.id)}">${ico('plus', 'sm')}메모</button>`);
const PR_NEXT = { todo: 'done', done: 'na', na: 'todo' };
const PR_LABEL = { todo: '미준비', done: '준비됨', na: '해당 없음' };

function prCount(L) {
  const per = Object.fromEntries(L.people.map((p) => [p, { n: 0, done: 0 }])), co = { n: 0, done: 0, mine: 0 };
  for (const sec of L.sections) for (const it of sec.items) {
    if (sec.kind === 'people') for (const p of L.people) { const s = prCell(it, p).s; if (s !== 'na') { per[p].n++; if (s === 'done') per[p].done++; } }
    else { const c = prCo(it); co.n++; if (c.s === 'done') co.done++; if (c.owner && c.owner === prMe() && c.s !== 'done') co.mine++; }
  }
  return { per, co };
}
const prBar = (done, n) => `<span class="pr-bar"><i style="width:${n ? Math.round((done / n) * 100) : 0}%"></i></span>`;
function prDue(due, done) {
  if (!due) return '';
  const d = diffDays(due, today()), cls = done ? '' : d < 0 ? 'red' : d <= 3 ? 'amber' : '';
  return `<span class="pr-due ${cls}">${prMD(due)}${!done && d < 0 ? ` · ${-d}일 지남` : ''}</span>`;
}

function renderPrep(host, key) {
  host.innerHTML = `<div id="pr-root" data-key="${key}"><div class="page-head"><h1>${esc(CRUMB[key])}</h1></div><section class="card"><div class="empty">불러오는 중…</div></section></div>`;
  if (PR.loaded) prDraw();
  if (!PR.loaded || Date.now() - PR.at > 10000) prLoad().then((ok) => { if (ok && prOn()) prDraw(); }).catch((e) => { PR.err = e.message; if (prOn()) prDraw(); });
}

function prDraw() {
  const root = $('#pr-root'); if (!root) return;
  const key = root.dataset.key, L = PR.d?.lists?.[key];
  if (!L) {
    root.innerHTML = `<div class="page-head"><h1>${esc(CRUMB[key])}</h1></div><section class="card"><div class="empty">${esc(PR.err || (PR.loaded ? '준비서류 목록이 아직 없습니다. 탁지원 대리에게 알려 주세요.' : '불러오는 중…'))}</div></section>`;
    return;
  }
  const me = prMe(), { per, co } = prCount(L), dd = L.date ? diffDays(L.date, today()) : null;
  const sum = `<section class="pr-sum">
    ${L.people.map((p) => `<div class="pr-who ${p === me ? 'me' : ''}">
      <div class="pr-who-h"><b>${esc(p)}</b><span>${esc(L.roles?.[p] || '')}</span>${L.personFolders?.[p] ? `<a class="pr-fd" href="${esc(prFolder(L.personFolders[p]))}" title="${esc(p)} 서류 폴더">${ico('folder', 'sm')}</a>` : ''}</div>
      <div class="pr-who-n"><b>${per[p].done}</b> / ${per[p].n}${per[p].n && per[p].done === per[p].n ? '<span class="chip green">완료</span>' : ''}</div>${prBar(per[p].done, per[p].n)}</div>`).join('')}
    <div class="pr-who co"><div class="pr-who-h"><b>회사 서류</b>${co.mine ? `<span>내 담당 ${co.mine}건 남음</span>` : ''}</div>
      <div class="pr-who-n"><b>${co.done}</b> / ${co.n}</div>${prBar(co.done, co.n)}</div>
  </section>`;
  const secs = L.sections.map((sec, si) => {
    if (sec.kind === 'people') {
      const n = sec.items.length * L.people.length, done = sec.items.reduce((a, it) => a + L.people.filter((p) => prCell(it, p).s === 'done').length, 0);
      return `<section class="card pr-sec">
        <div class="card-head"><h2>${esc(sec.title)}</h2>${sec.note ? `<span class="meta">${esc(sec.note)}</span>` : ''}</div>
        <div class="pr-scroll"><table class="pr-tbl">
          <thead><tr><th class="pr-doc">서류</th>${L.people.map((p) => `<th class="${p === me ? 'me' : ''}">${esc(p)}</th>`).join('')}</tr></thead>
          <tbody>${sec.items.map((it) => `<tr>
            <td class="pr-doc"><div class="pr-t">${esc(it.title)}${prDue(it.due, L.people.every((p) => prCell(it, p).s !== 'todo'))}${prMemoBtn(it)}</div>${it.detail ? `<div class="pr-det">${esc(it.detail)}</div>` : ''}${prMemo(it)}</td>
            ${L.people.map((p) => { const c = prCell(it, p);
              return `<td class="${p === me ? 'me' : ''}"><button type="button" class="pr-cell s-${c.s}" data-id="${esc(it.id)}" data-p="${esc(p)}" aria-label="${esc(`${p} ${it.title}: ${PR_LABEL[c.s]}`)}"
                title="${esc(`${p}: ${PR_LABEL[c.s]}${c.by ? ` (${personName(c.by)} ${prWhen(c.at)})` : ''} · 누르면 ${PR_LABEL[PR_NEXT[c.s]]}`)}">${c.s === 'done' ? ico('done', 'sm') : c.s === 'na' ? '–' : ''}</button></td>`; }).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="pr-foot">${done}/${n}칸 준비됨</div>
      </section>`;
    }
    return `<section class="card pr-sec">
      <div class="card-head"><h2>${esc(sec.title)}</h2>${sec.note ? `<span class="meta">${esc(sec.note)}</span>` : ''}${sec.folder ? `<a class="btn sm act" href="${esc(prFolder(sec.folder))}">${ico('folder', 'sm')}<span>회사 서류 폴더</span></a>` : ''}</div>
      <ul class="pr-co">${sec.items.map((it) => { const c = prCo(it), opts = [...new Set([...(L.owners || []), ...(c.owner ? [c.owner] : [])])];
        return `<li class="${c.s === 'done' ? 'done' : ''}">
          <button type="button" class="pr-cell s-${c.s === 'done' ? 'done' : 'todo'}" data-co="${esc(it.id)}" aria-label="${esc(`${it.title}: ${c.s === 'done' ? '준비됨' : '미준비'}`)}"
            title="${esc(c.s === 'done' && c.by ? `준비됨 (${personName(c.by)} ${prWhen(c.at)})` : '누르면 준비됨')}">${c.s === 'done' ? ico('done', 'sm') : ''}</button>
          <div class="pr-doc"><div class="pr-t">${esc(it.title)}${prDue(it.due, c.s === 'done')}${prMemoBtn(it)}</div>${it.detail ? `<div class="pr-det">${esc(it.detail)}</div>` : ''}${prMemo(it)}</div>
          <select class="select pr-own ${c.owner ? '' : 'none'} ${c.owner && c.owner === me ? 'me' : ''}" data-own="${esc(it.id)}" aria-label="담당">
            <option value="">담당 미정</option>${opts.map((o) => `<option ${o === c.owner ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
        </li>`; }).join('')}</ul>
    </section>`;
  }).join('');
  root.innerHTML = `<div class="page-head"><h1>${esc(L.title)}</h1>
      ${L.date ? `<span class="chip ${dd < 0 ? '' : dd <= 14 ? 'red' : 'blue'}">${esc(L.event || '')} ${prMD(L.date)}${dd > 0 ? ` D-${dd}` : dd === 0 ? ' 오늘' : ''}</span>` : ''}
      <div class="tools">${L.folder ? `<a class="btn sm" href="${esc(prFolder(L.folder))}">${ico('folder', 'sm')}<span>서류 폴더</span></a>` : ''}</div></div>
    ${sum}${secs}
    ${L.src ? `<div class="pr-src">목록 근거: ${esc(L.src)}</div>` : ''}`;

  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.id, p = b.dataset.p, it = L.sections.flatMap((s) => s.items).find((x) => x.id === id); if (!it) return;
    const to = PR_NEXT[prCell(it, p).s], st = { s: to, ...prStamp() };
    prAct((d) => { (d.state[id] ||= {})[p] = st; });
  }));
  root.querySelectorAll('[data-co]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.co, it = L.sections.flatMap((s) => s.items).find((x) => x.id === id); if (!it) return;
    const to = prCo(it).s === 'done' ? 'todo' : 'done', st = { s: to, ...prStamp() };
    prAct((d) => { d.state[id] = { owner: it.owner || '', ...(d.state[id] || {}), ...st }; });
  }));
  root.querySelectorAll('[data-own]').forEach((sel) => sel.addEventListener('change', () => {
    const id = sel.dataset.own, it = L.sections.flatMap((s) => s.items).find((x) => x.id === id); if (!it) return;
    const owner = sel.value;
    prAct((d) => { d.state[id] = { s: 'todo', ...(d.state[id] || {}), owner }; });
  }));
  root.querySelectorAll('[data-medit]').forEach((b) => b.addEventListener('click', () => {
    if (PR.edit && PR.draft.trim() !== (PR.d.memos[PR.edit]?.t || '') && !confirm('쓰던 메모를 버리고 다른 메모를 열까요?')) return;
    PR.edit = b.dataset.medit; PR.draft = PR.d.memos[PR.edit]?.t || ''; prDraw();
    const ta = $('[data-mtext]', root); ta?.focus(); ta?.setSelectionRange(ta.value.length, ta.value.length);
  }));
  const ta = $('[data-mtext]', root);
  if (ta) {
    ta.addEventListener('input', () => { PR.draft = ta.value; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); $('[data-msave]', root)?.click(); }
      if (e.key === 'Escape') { e.preventDefault(); $('[data-mcancel]', root)?.click(); }
    });
  }
  $('[data-mcancel]', root)?.addEventListener('click', () => { PR.edit = null; PR.draft = ''; prDraw(); });
  $('[data-msave]', root)?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.msave, t = PR.draft.trim(), m = t ? { t, ...prStamp() } : null;
    PR.edit = null; PR.draft = '';
    if (t === (PR.d.memos[id]?.t || '')) { prDraw(); return; }
    prAct((d) => { if (m) d.memos[id] = m; else delete d.memos[id]; });
  });
}
// 다른 창에서 돌아오면 다른 분이 바꾼 체크를 다시 읽는다
window.addEventListener('focus', () => {
  if (!prOn() || PR.busy || Date.now() - PR.at < 5000 || prTyping()) return;
  prLoad().then((ok) => { if (ok && prOn()) prDraw(); }).catch(() => {});
});
