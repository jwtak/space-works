/* 준비서류 체크(2026-11-12): 공통업무 > 법인 설립(#corp)·금감원 면담(#fss).
   목록과 체크 상태는 팀 파일함 '_웍스/준비서류.json' 하나를 세 사람이 같이 쓴다(누구나 체크, 누가 언제 했는지 남김).
   { lists: { corp|fss: { title, event, date, src, folder, personFolders?, people[], roles{}, owners[],
       sections[{ title, kind: 'people'|'company', note, items[{ id, title, detail, due, na?[사람], owner? }] }] } },
     state: { <항목 id>: 사람 서류면 { <사람>: { s: 'todo'|'done'|'na', by, at } }, 회사 서류면 { owner, s, by, at } },
     memos: { <항목 id>: { t, by, at } } }  — 서류 줄마다 메모 하나(누구나 쓰고 고친다, 비우면 지움). 섹션의 folderLabel은 폴더 단추 글자(없으면 '회사 서류 폴더')
   하위 서류(2026-11-26 사용자 「각 항목 누르면 어떤 서류 준비해야 되는지 네모 체크」): 회사 일 항목에 subs[{ id, title, detail }]를 두면
     제목 옆 '서류 n/m' 단추와 줄 클릭으로 펼친다(펼침은 viewGet prep.subopen). 하위 체크는 state[<하위 id>] = { s, by, at } 자기 줄만,
     다 체크돼도 상위 항목은 자동으로 체크하지 않는다. 담당과 마감은 상위 것을 따른다. 완료 숨기기를 켜면 체크된 하위 줄도 숨긴다
   날짜별 보기(2026-11-23, 법인 설립): L.byDate가 true면 '날짜별'과 '서류별'을 오간다(마지막 보기는 기기별 localStorage, 처음은 날짜별).
     자료는 그대로 섹션 하나이고, 날짜별은 항목의 due와 when('오전', '10시', '이후' 같은 때 표시)으로 묶어 그린다. due가 없으면 맨 끝 묶음.
     사람 서류 섹션 항목은 날짜 묶음 안에서도 사람마다 칸. 다 끝난 지난 날짜는 '지난 일정'으로 접고(펼침은 viewGet), 오늘 묶음은 파란 테두리, 오늘 뒤 첫 날짜는 '다음'.
   서류 목록은 공개 저장소에 두지 않으려고 코드에 없다 — 목록을 바꿀 땐 그 파일을 고친다.
   저장은 할 일 맡기기(app.js ttSave)처럼 eTag로 충돌을 막고, 겹치면 다시 읽어 다시 적용한다 */
const PR_PATH = '_웍스/준비서류.json';
const PR = { d: null, etag: null, loaded: false, at: 0, gen: 0, busy: 0, q: Promise.resolve(), err: '', edit: null, draft: '', dedit: null, ddue: '', dwhen: '' }; // edit: 메모를 쓰고 있는 항목 id, dedit: 날짜를 고치고 있는 항목 id(ddue·dwhen은 고치기 전 값)
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

const prTyping = () => !!PR.edit || !!PR.dedit || !!document.activeElement?.matches('select');
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

const prKind = (sec) => sec.kind;
// 한 항목이 끝났는지: 사람 칸은 모두 준비됨이나 해당 없음, 회사 일은 준비됨
const prItemDone = (L, sec, it) => (prKind(sec) === 'people' ? L.people.every((p) => prCell(it, p).s !== 'todo') : prCo(it).s === 'done');
function prCount(L) {
  const per = Object.fromEntries(L.people.map((p) => [p, { n: 0, done: 0 }])), co = { n: 0, done: 0, mine: 0 };
  for (const sec of L.sections) for (const it of sec.items) {
    if (prKind(sec) === 'people') for (const p of L.people) { const s = prCell(it, p).s; if (s !== 'na') { per[p].n++; if (s === 'done') per[p].done++; } }
    else { const c = prCo(it); co.n++; if (c.s === 'done') co.done++; if (c.owner && c.owner === prMe() && c.s !== 'done') co.mine++; }
  }
  return { per, co };
}
const prBar = (done, n) => `<span class="pr-bar"><i style="width:${n ? Math.round((done / n) * 100) : 0}%"></i></span>`;
// 항목 날짜: 누르면 고치는 버튼. 날짜가 없거나 날짜별 보기(grp, 날짜는 묶음 제목에 있음)면 '날짜' 버튼(PC는 행에 올렸을 때만)
function prDue(it, done, grp) {
  if (PR.dedit === it.id) return '';
  const due = it.due, when = it.when;
  if (!due || grp) return `<button type="button" class="pr-madd pr-dadd ${grp ? 'grp' : ''}" data-dedit="${esc(it.id)}" aria-label="${esc(`${it.title} 날짜`)}">${ico('cal', 'sm')}날짜</button>`;
  const d = diffDays(due, today()), cls = done ? '' : d < 0 ? 'red' : d <= 3 ? 'amber' : '', md = `${prMD(due)}${when ? ` ${when}` : ''}`;
  return `<button type="button" class="pr-due ${cls}" data-dedit="${esc(it.id)}" title="${esc(md)}" aria-label="${esc(`${it.title} 날짜 ${md}`)}">${!done && d < 0 ? `${-d}일 지남` : esc(md)}</button>`;
}
const PR_WHENS = ['오전', '9시', '10시', '11시', '12시', '13시', '14시', '15시', '16시', '17시', '18시', '오후', '이후'];
function prDueEdit(it) {
  if (PR.dedit !== it.id) return '';
  const ws = [...new Set([...PR_WHENS, ...(it.when ? [it.when] : [])])];
  return `<div class="pr-dedit"><input class="input" type="date" data-ddate value="${esc(it.due || '')}" aria-label="날짜">
    <select class="select" data-dwhen aria-label="때"><option value="">때 없음</option>${ws.map((w) => `<option ${w === (it.when || '') ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>
    <button type="button" class="btn sm ghost" data-dcancel>취소</button><button type="button" class="btn sm primary" data-dsave="${esc(it.id)}">저장</button></div>`;
}

// 사람 서류 칸 하나(표와 날짜 묶음이 같이 쓴다)
function prPCell(it, p) {
  const c = prCell(it, p);
  return `<button type="button" class="pr-cell s-${c.s}" data-id="${esc(it.id)}" data-p="${esc(p)}" aria-label="${esc(`${p} ${it.title}: ${PR_LABEL[c.s]}`)}"
    title="${esc(`${p}: ${PR_LABEL[c.s]}${c.by ? ` (${personName(c.by)} ${prWhen(c.at)})` : ''} · 누르면 ${PR_LABEL[PR_NEXT[c.s]]}`)}">${c.s === 'done' ? ico('done', 'sm') : c.s === 'na' ? '–' : ''}</button>`;
}
// 회사 일 한 줄: 체크, 내용, 담당
const prSubOpen = () => new Set(viewGet('prep.subopen', []));
const prSubDone = (sb) => PR.d.state[sb.id]?.s === 'done';
// 하위 서류: 제목 옆 '서류 n/m' 단추(펼치기)와 펼친 목록
function prSubs(it) {
  const subs = it.subs || []; if (!subs.length) return { btn: '', list: '', open: false };
  const open = prSubOpen().has(it.id), n = subs.filter(prSubDone).length, show = PR.hideNow ? subs.filter((sb) => !prSubDone(sb)) : subs;
  const btn = `<button type="button" class="pr-sopen ${n === subs.length ? 'all' : ''}" data-subopen="${esc(it.id)}" aria-expanded="${open}" aria-label="${esc(`${it.title} 서류 ${n}/${subs.length}`)}">서류 ${n}/${subs.length}${ico('right', 'sm')}</button>`;
  const list = !open ? '' : `<div class="pr-subs" role="list">${show.map((sb) => {
    const d = prSubDone(sb), st = PR.d.state[sb.id];
    return `<div class="pr-sub ${d ? 'done' : ''}" role="listitem"><button type="button" class="pr-cell s-${d ? 'done' : 'todo'}" data-sub="${esc(sb.id)}" aria-label="${esc(`${sb.title}: ${d ? '준비됨' : '미준비'}`)}"
      title="${esc(d && st?.by ? `준비됨 (${personName(st.by)} ${prWhen(st.at)})` : '누르면 준비됨')}">${d ? ico('done', 'sm') : ''}</button>
      <div class="pr-doc"><div class="pr-t">${esc(sb.title)}</div>${sb.detail ? `<div class="pr-det">${esc(sb.detail)}</div>` : ''}</div></div>`;
  }).join('') || '<div class="pr-sub pr-snone">남은 서류 없음</div>'}</div>`;
  return { btn, list, open };
}
function prCoLi(L, it, me, noDue) {
  const c = prCo(it), opts = [...new Set([...(L.owners || []), ...(c.owner ? [c.owner] : [])])], sb = prSubs(it);
  return `<li class="${c.s === 'done' ? 'done' : ''}${sb.btn ? ' pr-has' : ''}${sb.open ? ' open' : ''}" data-pr-item="${esc(it.id)}">
    <button type="button" class="pr-cell s-${c.s === 'done' ? 'done' : 'todo'}" data-co="${esc(it.id)}" aria-label="${esc(`${it.title}: ${c.s === 'done' ? '준비됨' : '미준비'}`)}"
      title="${esc(c.s === 'done' && c.by ? `준비됨 (${personName(c.by)} ${prWhen(c.at)})` : '누르면 준비됨')}">${c.s === 'done' ? ico('done', 'sm') : ''}</button>
    <div class="pr-doc"><div class="pr-t">${esc(it.title)}${sb.btn}${prDue(it, c.s === 'done', noDue)}${prMemoBtn(it)}</div>${it.detail ? `<div class="pr-det">${esc(it.detail)}</div>` : ''}${prDueEdit(it)}${prMemo(it)}${sb.list}</div>
    <select class="select pr-own ${c.owner ? '' : 'none'} ${c.owner && c.owner === me ? 'me' : ''}" data-own="${esc(it.id)}" aria-label="담당">
      <option value="">담당 미정</option>${opts.map((o) => `<option ${o === c.owner ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
  </li>`;
}
// 날짜 묶음 안의 사람별 항목: 사람 아이콘, 내용, 사람마다 칸
function prPpLi(L, it, me) {
  const done = L.people.every((p) => prCell(it, p).s !== 'todo');
  return `<li class="pr-pp ${done ? 'done' : ''}">
    <span class="pr-pi" title="사람별 체크">${ico('user', 'sm')}</span>
    <div class="pr-doc"><div class="pr-t">${esc(it.title)}${prDue(it, done, true)}${prMemoBtn(it)}</div>${it.detail ? `<div class="pr-det">${esc(it.detail)}</div>` : ''}${prDueEdit(it)}${prMemo(it)}</div>
    <div class="pr-ppl">${L.people.map((p) => `<span class="pr-pw ${p === me ? 'me' : ''}"><small>${esc(p)}</small>${prPCell(it, p)}</span>`).join('')}</div>
  </li>`;
}
// 같은 날 안의 순서: 때 표시 없음, 오전, n시, 오후, 이후
const prWhenRank = (w) => { if (!w) return '0'; if (w === '오전') return '1'; const h = /(\d+)\s*시/.exec(w); if (h) return `2${pad(+h[1])}`; return w === '오후' ? '5' : '9'; };
const prDayTitle = (g) => (g.date ? `${prMD(g.date)}${g.when ? ` ${g.when}` : ''}` : g.when || '날짜 미정');
function prDays(L, me, hide) {
  const t = today(), map = new Map();
  for (const sec of L.sections) for (const it of sec.items) {
    const k = it.due ? `${it.due}|${prWhenRank(it.when)}|${it.when || ''}` : `~|${it.when || ''}`;
    if (!map.has(k)) map.set(k, { k, date: it.due || null, when: it.when || '', rows: [] });
    map.get(k).rows.push({ sec, it });
  }
  const groups = [...map.values()].sort((a, b) => (a.k < b.k ? -1 : 1));
  for (const g of groups) g.rows.sort((a, b) => (prKind(a.sec) === 'people') - (prKind(b.sec) === 'people')); // 회사 일 먼저, 사람별 항목은 뒤
  const next = groups.map((g) => g.date).filter((d) => d && d > t).sort()[0];
  const left = (g) => g.rows.filter((r) => !prItemDone(L, r.sec, r.it)).length;
  const one = (g) => {
    const n = left(g), d = g.date ? diffDays(g.date, t) : null;
    const cls = d === 0 ? 'today' : d != null && d < 0 ? 'past' : g.date && g.date === next ? 'next' : '';
    const tag = !n ? '<span class="chip green">완료</span>' : d === 0 ? '<span class="chip blue">오늘</span>' : d == null ? '' : d < 0 ? `<span class="chip red">${n}건 남음</span>`
      : g.date === next ? `<span class="chip line">다음 D-${d}</span>` : `<span class="meta">D-${d}</span>`;
    const rows = hide ? g.rows.filter((r) => !prItemDone(L, r.sec, r.it)) : g.rows;
    return `<section class="card pr-sec pr-day ${cls}">
      <div class="card-head"><h2>${esc(prDayTitle(g))}</h2>${tag}<span class="pr-dn">${g.rows.length - n}/${g.rows.length}</span></div>
      <ul class="pr-co">${rows.map(({ sec, it }) => (prKind(sec) === 'people' ? prPpLi(L, it, me) : prCoLi(L, it, me, true))).join('')}</ul>
    </section>`;
  };
  // 지난 날짜 가운데 다 끝난 묶음만 접는다. 남은 일이 있으면 지나도 펼쳐 둔다
  const fold = groups.filter((g) => g.date && g.date < t && !left(g)), rest = groups.filter((g) => !fold.includes(g));
  const open = viewGet('prep.past', false);
  const foldHtml = fold.length ? `<button type="button" class="pr-fold ${open ? 'open' : ''}" data-fold aria-expanded="${open}"><b>지난 일정</b><span>${fold.map(prDayTitle).join(', ')} 완료</span>${ico('right', 'sm')}</button>${open ? fold.map(one).join('') : ''}` : '';
  return foldHtml + (hide ? rest.filter((g) => left(g)) : rest).map(one).join(''); // 완료 숨기기: 다 끝난 묶음은 묶음째
}
// 완료 숨기기(2026-11-26 사용자 「서류 준비된 건 안 보이게」): 목록마다 기억, 처음은 꺼짐. 위쪽 사람별 카드와 막대, 지난 일정 줄은 그대로
const prHideOn = (key) => viewGet(`prep.hide.${key}`, false) === true;
// 보기(날짜별, 서류별)는 기기마다 기억한다
const prViewGet = (key) => { try { return localStorage.getItem(`prep.view.${key}`) || 'date'; } catch { return 'date'; } };
const prViewSet = (key, v) => { try { localStorage.setItem(`prep.view.${key}`, v); } catch { /* 기억 못 해도 된다 */ } };

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
  const me = prMe(), { per, co } = prCount(L), dd = L.date ? diffDays(L.date, today()) : null, byDay = !!L.byDate && prViewGet(key) === 'date';
  const sum = `<section class="pr-sum">
    ${L.people.map((p) => `<div class="pr-who ${p === me ? 'me' : ''}">
      <div class="pr-who-h"><b title="${esc(L.roles?.[p] || '')}">${esc(p)}</b><span class="pr-role">${esc(L.roles?.[p] || '')}</span>${L.personFolders?.[p] ? `<a class="pr-fd" href="${esc(prFolder(L.personFolders[p]))}" title="${esc(p)} 서류 폴더">${ico('folder', 'sm')}</a>` : ''}</div>
      <div class="pr-who-n"><b>${per[p].done}</b> / ${per[p].n}${per[p].n && per[p].done === per[p].n ? '<span class="chip green">완료</span>' : ''}</div>${prBar(per[p].done, per[p].n)}</div>`).join('')}
    <div class="pr-who co"><div class="pr-who-h"><b>회사 서류</b>${co.mine ? `<span>내 담당 ${co.mine}건 남음</span>` : ''}</div>
      <div class="pr-who-n"><b>${co.done}</b> / ${co.n}</div>${prBar(co.done, co.n)}</div>
  </section>`;
  const hide = prHideOn(key); PR.hideNow = hide;
  let secs = byDay ? prDays(L, me, hide) : L.sections.map((sec, si) => {
    const items = hide ? sec.items.filter((it) => !prItemDone(L, sec, it)) : sec.items;
    if (hide && !items.length) return '';
    if (sec.kind === 'people') {
      const n = sec.items.length * L.people.length, done = sec.items.reduce((a, it) => a + L.people.filter((p) => prCell(it, p).s === 'done').length, 0);
      return `<section class="card pr-sec">
        <div class="card-head"><h2>${esc(sec.title)}</h2>${sec.note ? `<span class="meta">${esc(sec.note)}</span>` : ''}</div>
        <div class="pr-scroll"><table class="pr-tbl">
          <thead><tr><th class="pr-doc">서류</th>${L.people.map((p) => `<th class="${p === me ? 'me' : ''}">${esc(p)}</th>`).join('')}</tr></thead>
          <tbody>${items.map((it) => `<tr>
            <td class="pr-doc"><div class="pr-t">${esc(it.title)}${prDue(it, L.people.every((p) => prCell(it, p).s !== 'todo'))}${prMemoBtn(it)}</div>${it.detail ? `<div class="pr-det">${esc(it.detail)}</div>` : ''}${prDueEdit(it)}${prMemo(it)}</td>
            ${L.people.map((p) => `<td class="${p === me ? 'me' : ''}">${prPCell(it, p)}</td>`).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="pr-foot">${done}/${n}칸 준비됨</div>
      </section>`;
    }
    return `<section class="card pr-sec">
      <div class="card-head"><h2>${esc(sec.title)}</h2>${sec.note ? `<span class="meta">${esc(sec.note)}</span>` : ''}${sec.folder ? `<a class="btn sm act" href="${esc(prFolder(sec.folder))}">${ico('folder', 'sm')}<span>${esc(sec.folderLabel || '회사 서류 폴더')}</span></a>` : ''}</div>
      <ul class="pr-co">${items.map((it) => prCoLi(L, it, me)).join('')}</ul>
    </section>`;
  }).join('');
  if (hide && !/class="card pr-sec/.test(secs)) secs += '<section class="card pr-sec"><div class="empty">남은 서류 없음</div></section>';
  root.innerHTML = `<div class="page-head"><h1>${esc(L.title)}</h1>
      ${L.date ? `<span class="chip ${dd < 0 ? '' : dd <= 14 ? 'red' : 'blue'}">${esc(L.event || '')} ${prMD(L.date)}${dd > 0 ? ` D-${dd}` : dd === 0 ? ' 오늘' : ''}</span>` : ''}
      <div class="tools">${L.byDate ? `<div class="seg pr-view" role="group" aria-label="보기">${[['date', '날짜별'], ['doc', '서류별']].map(([k, l]) => `<button type="button" data-view="${k}" class="${(byDay ? 'date' : 'doc') === k ? 'on' : ''}" aria-pressed="${(byDay ? 'date' : 'doc') === k}">${l}</button>`).join('')}</div>` : ''}<button type="button" class="btn sm pr-hide" data-hide aria-pressed="${hide}">완료 숨기기</button>${L.folder ? `<a class="btn sm" href="${esc(prFolder(L.folder))}">${ico('folder', 'sm')}<span>서류 폴더</span></a>` : ''}</div></div>
    ${sum}${secs}
    ${L.src ? `<div class="pr-src">목록 근거: ${esc(L.src)}</div>` : ''}`;

  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { prViewSet(key, b.dataset.view); prDraw(); }));
  $('[data-hide]', root)?.addEventListener('click', () => { viewSet(`prep.hide.${key}`, !hide); prDraw(); $('[data-hide]', root)?.focus({ preventScroll: true }); });
  const subToggle = (id) => { const o = prSubOpen(); if (o.has(id)) o.delete(id); else o.add(id); viewSet('prep.subopen', [...o]); prDraw(); root.querySelector(`[data-subopen="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); };
  root.querySelectorAll('[data-subopen]').forEach((b) => b.addEventListener('click', () => subToggle(b.dataset.subopen)));
  root.querySelectorAll('.pr-co li.pr-has').forEach((li) => li.addEventListener('click', (e) => { // 줄의 빈 곳을 눌러도 펼치고 접기(체크, 담당, 날짜, 메모, 하위 목록은 빼고)
    if (e.target.closest('button, a, select, input, textarea, .pr-subs, .pr-medit, .pr-dedit, .pr-memo')) return;
    subToggle(li.dataset.prItem);
  }));
  root.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.sub, it = CSS.escape(b.closest('li')?.dataset.prItem || ''), to = PR.d.state[id]?.s === 'done' ? 'todo' : 'done', st = { s: to, ...prStamp() };
    prAct((d) => { d.state[id] = st; });
    // 다시 그린 뒤 같은 칸으로(완료 숨기기로 사라졌으면 같은 항목의 다음 칸, 없으면 '서류 n/m' 단추)
    (root.querySelector(`[data-sub="${CSS.escape(id)}"]`) || root.querySelector(`li[data-pr-item="${it}"] [data-sub]`) || root.querySelector(`[data-subopen="${it}"]`))?.focus({ preventScroll: true });
  }));
  $('[data-fold]', root)?.addEventListener('click', () => { viewSet('prep.past', !viewGet('prep.past', false)); prDraw(); });
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
      if (e.key === 'Escape') { e.preventDefault(); if (prDirty() && !confirm('쓰던 메모를 버릴까요?')) return; $('[data-mcancel]', root)?.click(); }
    });
  }
  $('[data-mcancel]', root)?.addEventListener('click', () => { PR.edit = null; PR.draft = ''; prDraw(); });
  // 항목 날짜 고치기: 목록 자료(lists)의 due·when을 바꾼다. 날짜를 비우면 날짜별 보기에서 맨 끝 묶음
  root.querySelectorAll('[data-dedit]').forEach((b) => b.addEventListener('click', () => {
    const it = L.sections.flatMap((s) => s.items).find((x) => x.id === b.dataset.dedit); if (!it) return;
    if (PR.dedit && PR.dedit !== it.id && prDDirty() && !confirm('고치던 날짜를 버리고 다른 항목을 열까요?')) return;
    PR.dedit = it.id; PR.ddue = it.due || ''; PR.dwhen = it.when || ''; prDraw();
    $('[data-ddate]', root)?.focus();
  }));
  const de = $('.pr-dedit', root);
  if (de) {
    de.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.target.matches('input')) { e.preventDefault(); $('[data-dsave]', de)?.click(); }
      if (e.key === 'Escape') { e.preventDefault(); if (prDDirty() && !confirm('고치던 날짜를 버릴까요?')) return; $('[data-dcancel]', de)?.click(); }
    });
    $('[data-dcancel]', de).addEventListener('click', () => { const id = PR.dedit; PR.dedit = null; prDraw(); root.querySelector(`[data-dedit="${CSS.escape(id)}"]`)?.focus(); });
    $('[data-dsave]', de).addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.dsave, due = $('[data-ddate]', de).value, when = $('[data-dwhen]', de).value;
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) { toast('날짜를 확인하세요'); return; }
      PR.dedit = null;
      if (due === PR.ddue && when === PR.dwhen) { prDraw(); return; }
      prAct((d) => {
        const it = (d.lists?.[key]?.sections || []).flatMap((s) => s.items || []).find((x) => x.id === id); if (!it) return;
        if (due) it.due = due; else delete it.due;
        if (when) it.when = when; else delete it.when;
      });
      root.querySelector(`[data-dedit="${CSS.escape(id)}"]`)?.focus();
    });
  }
  $('[data-msave]', root)?.addEventListener('click', (e) => {
    const id = e.currentTarget.dataset.msave, t = PR.draft.trim(), m = t ? { t, ...prStamp() } : null;
    PR.edit = null; PR.draft = '';
    if (t === (PR.d.memos[id]?.t || '')) { prDraw(); return; }
    prAct((d) => { if (m) d.memos[id] = m; else delete d.memos[id]; });
  });
}
// 쓰던 메모(저장된 글과 다를 때)나 아직 저장 중인 변경이 있으면 새로 고침, 탭 닫기, 메뉴 이동 전에 묻는다
const prDDirty = () => { const de = document.querySelector('#pr-root .pr-dedit'); return !!PR.dedit && !!de && (de.querySelector('[data-ddate]').value !== PR.ddue || de.querySelector('[data-dwhen]').value !== PR.dwhen); };
const prDirty = () => (!!PR.edit && PR.draft.trim() !== (PR.d?.memos?.[PR.edit]?.t || '')) || prDDirty();
window.addEventListener('beforeunload', (e) => { if (prDirty() || PR.busy) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#"], [data-dt]'); if (!a || !prOn() || !prDirty()) return;
  const to = a.getAttribute('href') || a.dataset.dt; if (!to || to === location.hash) return;
  if (confirm('쓰던 내용이 저장되지 않습니다. 이동할까요?')) { PR.edit = null; PR.draft = ''; PR.dedit = null; return; }
  e.preventDefault(); e.stopImmediatePropagation();
}, true);
// 다른 창에서 돌아오면 다른 분이 바꾼 체크를 다시 읽는다
window.addEventListener('focus', () => {
  if (!prOn() || PR.busy || Date.now() - PR.at < 5000 || prTyping()) return;
  prLoad().then((ok) => { if (ok && prOn()) prDraw(); }).catch(() => {});
});
