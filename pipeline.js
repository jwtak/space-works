/* SPACE WORKS — 딜소싱 › 파이프라인: 개인 소개 딜과 다른 탭(신규상장·예심청구·매각희망·입찰딜)에서 올린 딜을 단계별로 관리하는 보드
   데이터: 회사 OneDrive SPACE WORKS/data/pipeline.json — 탁지원·대표님 두 분, 세 사람이 같이 고친다.
   항목 형식은 05. 딜소싱\_자동화\딜레이더\CONTRACT.md 의 pipeline (매일 엑셀 통합 작업도 같은 파일을 읽는다).
   진입: renderPipeline(host) — host 안에만 그린다. 홈 카드: pipeHomeBlock(). 다른 탭 상세 버튼: pipeHas(ref)·pipeAdd({...}), '있음' 링크에 data-pp-ref="<ref>"를 달면 그 딜을 펼쳐 연다.
   app.js 전역($, esc, pad, ymd, parse, today, addDays, diffDays, md, ico, toast, G, PEOPLE, openSheet, fixYmd)과 graph.js 의 STORE 를 쓴다. */

const PP_STAGES = ['발굴', '검토', '미팅', '실사', '투자심의', '완료', '드롭'];
const PP_END = ['완료', '드롭'];            // '진행 중'에서 빼는 단계
const PP_HOT = ['미팅', '실사', '투자심의'];  // 목록 칩을 파랑으로
const PP_SRCS = ['소개', '신규상장', '예심청구', '매각희망', '입찰딜', '행사·IR', '기타'];
const PP_TYPES = ['메자닌', '구주', '프리IPO', '경영권', '기타'];
const PP_SORTS = [['next', '다음 연락일순'], ['at', '최근 수정순'], ['created', '등록일순']];

// 머리줄 ⓘ 설명(app.js infoOpen)
TAB_INFO['deals/pipeline'] = { title: '파이프라인', rows: [
  ['무엇인가', '실제로 검토하는 딜을 한곳에서 관리하는 목록입니다. 소개받은 딜과 다른 탭에서 \'파이프라인에 올리기\'로 넘긴 딜이 같이 들어옵니다.'],
  ['왜 보나', '누가 어떤 딜을 어디까지 봤고 다음에 무엇을 할지를 세 사람이 같이 봅니다.'],
  ['어떻게 보나', [
    '단계: 발굴 → 검토 → 미팅 → 실사 → 투자심의 → 완료(그만 보면 드롭).',
    '딜마다 유형(메자닌·구주·프리IPO·경영권), 소개자, 담당, 다음 할 일과 날짜를 적습니다.',
    '다음 할 일 날짜가 7일 안이거나 지난 딜은 대시보드 홈 카드에도 뜹니다.',
  ]],
  ['그래서 할 일', [
    '소개받은 딜은 \'새 딜\'로 바로 넣습니다.',
    '미팅·실사가 끝날 때마다 단계와 다음 할 일 날짜를 고칩니다.',
    '그만 볼 딜은 지우지 말고 드롭으로 둡니다. 나중에 같은 딜이 다시 와도 이력이 남습니다.',
  ]],
] };
// ref 앞부분 → 그 딜이 있는 탭
const PP_TABS = { ipo: ['#deals/ipo', '신규상장'], yesim: ['#deals/yesim', '예심청구'], sell: ['#deals/sell', '매각희망'], bids: ['#deals/bids', '입찰딜'], events: ['#deals/events', '행사·IR'] };
const PP_HASH = '#deals/pipeline';
const PP_TTL = 5 * 60000;
const PP_WD = '일월화수목금토';

const ppS = {
  items: [], version: null, at: 0, loading: null, dirty: new Map(), saving: Promise.resolve(), host: null,
  q: '', stage: 'live', sort: 'next', open: null, focus: null, field: null, ime: false, redraw: false,
};

/* ---------- 데이터 ---------- */
// 파일은 배열이어야 한다. 다른 모양이거나 깨졌으면 덮어쓰지 않도록 읽기부터 멈춘다
const PP_BAD = '파이프라인 자료 형식이 올바르지 않습니다';
const ppArr = (v) => { if (!Array.isArray(v)) throw new Error(PP_BAD); return v; };
const ppRead = () => STORE.readJSON('pipeline').catch((e) => { throw e instanceof SyntaxError ? new Error(PP_BAD) : e; });

function pipeLoad(force) {
  if (!force && ppS.at && Date.now() - ppS.at < PP_TTL) return Promise.resolve();
  if (!ppS.loading) {
    ppS.loading = (async () => {
      // 저장 대기 중에 읽으면 대기 변경이 덮이므로 저장이 끝난 뒤 읽고, 아직 못 보낸 변경은 다시 얹는다
      let r, s;
      do {
        s = ppS.saving; await s.catch(() => {});
        r = await ppRead();
      } while (s !== ppS.saving);
      ppS.items = ppApplyDirty(ppArr(r.items));
      ppS.version = r.version;
      ppS.at = Date.now();
    })().finally(() => { ppS.loading = null; });
  }
  return ppS.loading;
}

const ppNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// 로그인한 사람 이름: 담당 목록(PEOPLE)과 같은 표기로(app.js 일정 담당자와 같은 방식)
const ppMe = () => {
  const n = typeof myName === 'function' ? myName() : String(G.account?.name || '').replace(/\s*\(.*\)$/, '');
  return (typeof PEOPLE !== 'undefined' && Array.isArray(PEOPLE) && PEOPLE.find((p) => n.includes(p))) || n;
};
const ppKey = (s) => String(s || '').replace(/\(주\)|㈜|주식회사|\s/g, '').toLowerCase();
const ppOk = (x) => !!x && typeof x === 'object' && !!x.id && !!x.name && !x.deleted;
const ppStage = (x) => (PP_STAGES.includes(x.stage) ? x.stage : '발굴');
const ppLive = (x) => !PP_END.includes(ppStage(x));
const ppNext = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x.next || '') ? x.next : '');
const ppFind = (id) => ppS.items.find((x) => ppOk(x) && x.id === id);

/* 저장: pipeline.json 은 세 사람이 같이 쓴다(편집 공유). ipo.js 표시 저장과 같은 방식.
   dirty = 아직 저장 안 된 변경 {id → {patch(바뀐 필드만, 새 딜은 전부), seq, base(되돌릴 원본, 새 딜은 null), isNew, at, by}}.
   다른 사람이 먼저 저장했으면(409) 최신본을 다시 읽고 바뀐 필드만 얹어 한 번 더 저장한다 — 동시에 추가한 새 딜도 합쳐진다.
   삭제는 deleted: true 로만 표시한다(실제로 빼면 합칠 때 되살아난다). 409가 아닌 실패는 화면을 저장 전으로 되돌린다. */
let ppSeq = 0;

function ppApplyDirty(items) {
  ppS.dirty.forEach((e, id) => {
    const k = items.findIndex((x) => x && x.id === id);
    // 같은 딜(ref)을 다른 분이 먼저 올렸으면 내 새 딜은 버린다(pipeAdd가 그 딜을 돌려준다)
    if (k < 0 && e.isNew && e.patch.ref && items.some((x) => x && !x.deleted && x.ref === e.patch.ref)) { ppS.dirty.delete(id); return; }
    if (k < 0 && !e.isNew) { ppS.dirty.delete(id); return; } // 파일에서 아예 빠진 딜(앱 밖에서 지움)은 고친 칸만으로 되살리지 않는다
    const m = { ...(k >= 0 ? items[k] : null), ...e.patch, id, at: e.at, by: e.by };
    if (k >= 0) items[k] = m; else items.push(m);
  });
  return items;
}

function ppRollback(msg) {
  ppS.dirty.forEach((e, id) => {
    const items = ppS.items, k = items.findIndex((x) => x && x.id === id);
    if (e.base) { if (k >= 0) items[k] = e.base; else items.push(e.base); } else if (k >= 0) items.splice(k, 1);
  });
  ppS.dirty.clear();
  toast(msg);
  ppDraw();
}

function ppSave() {
  let merged = false;
  const gone = [];
  ppS.saving = ppS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      if (!ppS.dirty.size) return;
      const sent = new Map([...ppS.dirty].map(([id, e]) => [id, { seq: e.seq, patch: { ...e.patch } }]));
      const body = ppS.items.map((x) => (x && typeof x === 'object' ? { ...x } : x));
      try {
        ppS.version = await STORE.writeJSON('pipeline', body, ppS.version);
        // 보내는 동안 또 바뀐 딜은 남겨 두고 다음 저장에 태운다. 이때 방금 저장된 상태를 되돌릴 기준(base)으로, 그 뒤에 바뀐 칸만 patch로 둔다
        // (안 그러면 다음 저장이 실패할 때 이미 저장된 칸까지 되돌린 채 다음 저장이 서버를 덮고, 409 때는 이미 저장한 칸을 다시 얹어 다른 분 변경을 덮는다)
        sent.forEach((s, id) => {
          const d = ppS.dirty.get(id); if (!d) return;
          if (d.seq === s.seq) { ppS.dirty.delete(id); return; }
          const b = body.find((m) => m && m.id === id);
          d.base = b ? { ...b } : null; d.isNew = false;
          d.patch = Object.fromEntries(Object.entries(d.patch).filter(([k, v]) => !(k in s.patch) || s.patch[k] !== v));
        });
        return;
      } catch (e) {
        if (e.status !== 409) { ppRollback(e.status === 403 ? '편집 권한이 없습니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
        try {
          const r = await ppRead();
          const items = ppArr(r.items);
          ppS.dirty.forEach((d, id) => {
            const x = items.find((m) => m && m.id === id);
            d.base = x ? { ...x } : null;
            if (x?.deleted && !d.patch.deleted) gone.push(id); // 고치는 사이 다른 분이 지웠다
          });
          ppS.items = ppApplyDirty(items); ppS.version = r.version;
          merged = true;
        } catch (e2) { ppRollback(e2.message === PP_BAD ? `저장하지 못했습니다. ${PP_BAD}.` : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; } // 그사이 파일이 깨졌으면 덮어쓰지 않는다
      }
    }
    ppRollback('다른 분이 동시에 수정 중입니다. 잠시 후 다시 시도해 주세요.');
  }).finally(() => {
    if (gone.length) { if (gone.includes(ppS.open)) ppS.open = null; toast('다른 분이 삭제한 딜입니다.'); }
    if (merged) ppDraw(); // 다른 분이 바꾼 내용도 화면에 반영
  });
  return ppS.saving;
}

function ppTouch(id, patch) {
  const m = ppS.items.find((x) => x && x.id === id); if (!m) return null;
  const prev = ppS.dirty.get(id);
  const e = { patch: { ...prev?.patch, ...patch }, seq: ++ppSeq, base: prev ? prev.base : { ...m }, isNew: !!prev?.isNew, at: ppNow(), by: ppMe() };
  Object.assign(m, patch, { at: e.at, by: e.by });
  ppS.dirty.set(id, e);
  return m;
}

// 새 딜도 patch(전체 필드)로 dirty에 둔다 — 다른 분이 동시에 추가한 딜과 합쳐진다. id = 시각 + 난수
function ppCreate(f) {
  const at = ppNow(), by = ppMe();
  let id;
  do { id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; } while (ppS.items.some((x) => x && x.id === id));
  const item = {
    id, name: f.name, src: f.src || '기타', ref: f.ref || '', type: f.type || '', introducer: f.introducer || '',
    stage: PP_STAGES.includes(f.stage) ? f.stage : '발굴', owner: f.owner ?? by, next: f.next || '', action: f.action || '', note: f.note || '', created: at,
  };
  ppS.items.push({ ...item, at, by });
  ppS.dirty.set(id, { patch: item, seq: ++ppSeq, base: null, isNew: true, at, by });
  return id;
}

function ppSet(id, patch) {
  const x = ppFind(id); if (!x) return;
  const p = {};
  Object.keys(patch).forEach((k) => { if ((x[k] ?? '') !== patch[k]) p[k] = patch[k]; });
  if (!Object.keys(p).length) return;
  ppTouch(id, p);
  ppPaint(id);
  ppSave();
}

/* ---------- 다른 탭에서 부르는 것 ---------- */
// 로드 전이면 false. 지운 딜은 없는 것으로 본다
function pipeHas(ref) {
  return !!ref && ppS.at > 0 && ppS.items.some((x) => x && !x.deleted && x.ref === ref);
}

// 같은 ref(ref가 비었으면 같은 이름+출처)가 이미 있으면 그 딜을, 아니면 새로 올린 딜을 돌려준다. 저장 실패면 null
async function pipeAdd({ name, src, ref, type, introducer } = {}) {
  const nm = String(name || '').trim(); if (!nm) return null;
  try { await pipeLoad(Date.now() - ppS.at > 30000); } catch (e) { toast(e.message); return null; }
  const rf = String(ref || '').trim(), sc = String(src || '').trim() || '기타';
  const same = (x) => x && !x.deleted && (rf ? x.ref === rf : ppKey(x.name) === ppKey(nm) && (x.src || '') === sc);
  const dup = ppS.items.find(same);
  if (dup) { toast('이미 파이프라인에 있습니다'); return { ...dup }; }
  const id = ppCreate({ name: nm, src: sc, ref: rf, type: String(type || '').trim(), introducer: String(introducer || '').trim() });
  ppDraw();
  try { await ppSave(); } catch { /* ppSave가 되돌리고 알린다 */ }
  const mine = ppS.items.find((x) => x && x.id === id && !x.deleted);
  if (mine) { toast('파이프라인에 올렸습니다'); return { ...mine }; }
  const other = rf ? ppS.items.find(same) : null;
  if (other) { toast('이미 파이프라인에 있습니다'); ppDraw(); return { ...other }; }
  return null;
}

/* ---------- 표시 형식 ---------- */
const ppThisYear = (s) => s.slice(0, 4) === today().slice(0, 4);
const ppDay = (s) => { const d = parse(s); return ppThisYear(s) ? md(s) : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const ppMd = (s) => (ppThisYear(s) ? `${md(s)} (${PP_WD[parse(s).getDay()]})` : ppDay(s));
const ppRel = (s) => { const n = diffDays(s, today()); return n < 0 ? [`${-n}일 지남`, 'over'] : n === 0 ? ['오늘', 'today'] : n === 1 ? ['내일', ''] : [`D-${n}`, '']; };
const ppBy = (x) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x.at || '') ? `${esc(x.by || '')} ${esc(ppDay(x.at.slice(0, 10)))} ${esc(x.at.slice(11, 16))}` : '');
const ppChip = (st) => `<span class="ipo-st${PP_HOT.includes(st) ? ' s-1' : st === '완료' ? ' pp-done' : st === '드롭' ? ' pp-drop' : ''}">${esc(st)}</span>`;
const ppDash = '<span class="muted">–</span>';
const ppPeople = () => [...new Set([...(typeof PEOPLE !== 'undefined' && Array.isArray(PEOPLE) ? PEOPLE : []), ppMe()].filter(Boolean))];

function ppOpts(list, cur, blank) {
  const v = cur || '', all = [...list, ...(v && !list.includes(v) ? [v] : [])];
  return (blank != null ? `<option value=""${v ? '' : ' selected'}>${blank}</option>` : '')
    + all.map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
}

/* ---------- 목록 ---------- */
function ppList() {
  const q = ppS.q.trim().toLowerCase();
  const list = ppS.items.filter((x) => ppOk(x) && (ppS.stage === 'live' ? ppLive(x) : ppStage(x) === ppS.stage)
    && (!q || [x.name, x.src, x.introducer, x.type, x.owner, x.action, x.note, ppStage(x)].join(' ').toLowerCase().includes(q)));
  const s = (v) => String(v || '');
  const by = {
    next: (a, b) => (ppNext(a) || '9999').localeCompare(ppNext(b) || '9999') || s(b.at).localeCompare(s(a.at)),
    at: (a, b) => s(b.at).localeCompare(s(a.at)) || s(b.created).localeCompare(s(a.created)),
    created: (a, b) => s(b.created).localeCompare(s(a.created)),
  }[ppS.sort] || (() => 0);
  return list.sort(by);
}

// 머리글 칸도 같은 이름표를 달아 좁은 폭에서 값 칸과 함께 숨긴다. 단계 머리글은 칩 안 글자 시작선(10)에 맞춘다
const PP_HEAD = `<div class="ipo-head pp-cols"><div class="pp-c-next">다음 연락</div><div class="pp-c-name">회사</div><div class="pp-c-st">단계</div>
  <div class="pp-c-src">출처</div><div class="pp-c-own">담당</div><div class="pp-c-act">다음 할 일</div><div class="pp-c-chev"></div></div>`;

function ppLine(x, open) {
  const nx = ppNext(x);
  let next = ppDash, cls = ' none';
  if (nx) { const [rel, c] = ppRel(nx); cls = c ? ` ${c}` : ''; next = `<span class="pp-d">${ppMd(nx)}</span><div class="ipo-sub">${rel}</div>`; }
  return `<div class="pp-line pp-cols">
    <div class="pp-c-next${cls}">${next}</div>
    <div class="pp-c-name"><button type="button" class="ipo-ttl" aria-expanded="${!!open}">${esc(x.name)}</button>${x.type ? `<div class="ipo-sub">${esc(x.type)}</div>` : ''}</div>
    <div class="pp-c-st">${ppChip(ppStage(x))}</div>
    <div class="pp-c-src">${x.src ? esc(x.src) : ppDash}${x.introducer ? `<div class="ipo-sub">${esc(x.introducer)}</div>` : ''}</div>
    <div class="pp-c-own">${x.owner ? esc(x.owner) : ppDash}</div>
    <div class="pp-c-act${x.action ? '' : ' none'}">${x.action ? esc(x.action) : ppDash}</div>
    <div class="pp-c-chev"><span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span></div>
  </div>`;
}

function ppRow(x) {
  const open = ppS.open === x.id;
  return `<div class="ipo-row pp-row${open ? ' open' : ''}" data-id="${esc(x.id)}">${ppLine(x, open)}${open ? ppDetail(x) : ''}</div>`;
}

// 펼친 행: 글자마다 저장하지 않고 바꾼 칸을 벗어날 때(선택 상자·단계는 바로) 저장한다
function ppDetail(x) {
  const st = ppStage(x), fid = (f) => esc(`pp-${x.id}-${f}`);
  const fld = (f, label, ctl, cls = '') => `<div class="field${cls}"><label for="${fid(f)}">${label}</label>${ctl}</div>`;
  const inp = (f, max) => `<input class="input" id="${fid(f)}" data-pp-f="${f}" value="${esc(x[f] || '')}" maxlength="${max}" autocomplete="off">`;
  const sel = (f, list, blank) => `<select class="select" id="${fid(f)}" data-pp-f="${f}">${ppOpts(list, x[f], blank)}</select>`;
  const tab = PP_TABS[String(x.ref || '').split(':')[0]];
  return `<div class="ipo-detail pp-detail">
    <div class="pp-dhead">
      <div class="seg pp-stseg" role="group" aria-label="단계">${PP_STAGES.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" aria-pressed="${s === st}" data-pp-set="${s}">${s}</button>`).join('')}</div>
      <span class="ipo-by pp-by">${ppBy(x)}</span>
    </div>
    <div class="pp-form">
      ${fld('next', '다음 연락일', `<input class="input" type="date" id="${fid('next')}" data-pp-f="next" value="${ppNext(x)}">`)}
      ${fld('action', '다음 할 일', inp('action', 200), ' w2')}
      ${fld('owner', '담당', sel('owner', ppPeople(), '선택'))}
      ${fld('name', '회사명', inp('name', 100))}
      ${fld('type', '유형', sel('type', PP_TYPES, '선택'))}
      ${fld('src', '출처', sel('src', PP_SRCS, x.src ? null : '선택'))}
      ${fld('introducer', '소개자', inp('introducer', 100))}
      ${fld('note', '메모', `<textarea class="area" id="${fid('note')}" data-pp-f="note" rows="4" maxlength="4000">${esc(x.note || '')}</textarea>`, ' wall')}
    </div>
    <div class="pp-dfoot">${tab ? `<a class="ipo-a" href="${tab[0]}" data-pp-tab="${esc(x.ref)}">${tab[1]}에서 보기${ico('right', 'sm')}</a>` : ''}
      <button type="button" class="btn ghost sm pp-del" data-pp-del>${ico('trash', 'sm')}삭제</button></div>
  </div>`;
}

function ppSummary() {
  if (!ppS.at) return '';
  const td = today(), d = new Date(), end = ymd(addDays(d, 6 - ((d.getDay() + 6) % 7))); // 이번 주 = 일요일까지
  const live = ppS.items.filter((x) => ppOk(x) && ppLive(x));
  const week = live.filter((x) => ppNext(x) && ppNext(x) >= td && ppNext(x) <= end).length;
  const over = live.filter((x) => ppNext(x) && ppNext(x) < td).length;
  return `<span>진행 중 <b>${live.length}</b></span><span>이번 주 연락 <b>${week}</b></span><span${over ? ' class="pp-over"' : ''}>연락일 지남 <b>${over}</b></span>`;
}

function ppBody() {
  if (!ppS.items.some(ppOk)) return '<div class="empty">아직 등록된 딜이 없습니다.</div>';
  const list = ppList();
  if (!list.length) return '<div class="empty">조건에 맞는 딜이 없습니다.</div>';
  return PP_HEAD + list.map(ppRow).join('');
}

/* 다시 그릴 때 쓰던 칸을 지키기: 포커스·커서·아직 저장 안 한 입력·늘린 메모 높이 (다른 분 변경이 합쳐져 다시 그려도 입력이 날아가지 않게)
   다시 그리는 동안(ppDrawing) 지워지는 칸의 change·focusout(Chromium은 이때도 낸다)으로는 저장하지 않는다 — 쓰던 값은 되살린 칸에 남고,
   저장이 계속 실패할 때 되돌림 → 다시 그리기 → 저장 → 실패가 끝없이 돌지 않게. 그 행이 목록에서 빠져 되살릴 칸이 없으면 쓰던 값을 저장한다 */
const ppSel = (el, k) => { try { return el[k]; } catch { return null; } };
let ppDrawing = false;
function ppKeep(root, fn) {
  const a = document.activeElement;
  const st = a && root.contains(a) && a.matches('[data-pp-f]') ? {
    id: a.closest('.pp-row')?.dataset.id, f: a.dataset.ppF, v: a.value, typed: a.tagName !== 'SELECT' && a.value !== a.defaultValue,
    s: ppSel(a, 'selectionStart'), e: ppSel(a, 'selectionEnd'),
  } : null;
  const hs = [...root.querySelectorAll('textarea[data-pp-f]')].filter((t) => t.style.height).map((t) => [t.closest('.pp-row')?.dataset.id, t.style.height]);
  ppDrawing = true;
  try { fn(); } finally { ppDrawing = false; }
  hs.forEach(([id, h]) => { const t = id && root.querySelector(`.pp-row[data-id="${CSS.escape(id)}"] textarea[data-pp-f]`); if (t) t.style.height = h; });
  if (!st?.id) return;
  const el = root.querySelector(`.pp-row[data-id="${CSS.escape(st.id)}"] [data-pp-f="${st.f}"]`);
  if (!el) { if (st.typed) ppCommit(a); return; } // 지워진 칸(a)에 쓰던 값이 남아 있다. 지운 딜이면 ppCommit이 건너뛴다
  if (st.typed) el.value = st.v;
  el.focus({ preventScroll: true });
  if (st.s != null) { try { el.setSelectionRange(st.s, st.e); } catch { /* 날짜 칸 */ } }
}

/* 보기 링크로 펼친 행을 보여 줄 때: 행이 보이는 높이(스크롤 칸에서 폰 아래 탭 막대를 뺀 높이)에 다 들어가면 행 전체를 가운데에,
   길면 머리 줄이 맨 위(8 띄움)에 오게 — radar.js rdReveal·ipo.js ipoReveal과 같은 방식 */
function ppReveal(r) {
  const sc = r.closest('.scroll');
  if (!sc) { r.scrollIntoView({ block: r.offsetHeight <= innerHeight ? 'center' : 'start' }); return; }
  const tb = document.querySelector('.tabbar'), vis = sc.clientHeight - (tb ? tb.offsetHeight : 0), h = r.offsetHeight;
  const top = r.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  sc.scrollTop = h <= vis ? top - (vis - h) / 2 : top - 8;
}

function ppDraw() {
  const h = ppS.host, b = h && h.querySelector('#pp-body'); if (!b || !ppS.at) return;
  // 한글 조합 중에 칸을 바꾸면 글자가 깨지므로 조합이 끝나거나 칸을 벗어날 때 그린다
  if (ppS.ime && b.contains(document.activeElement)) { ppS.redraw = true; return; }
  ppS.redraw = false;
  ppKeep(b, () => { b.innerHTML = ppBody(); });
  const s = h.querySelector('#pp-sum'); if (s) s.innerHTML = ppSummary();
  h.querySelectorAll('[data-pp-stage]').forEach((x) => { const on = x.dataset.ppStage === ppS.stage; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
  if (ppS.focus) {
    const r = b.querySelector(`.pp-row[data-id="${CSS.escape(ppS.focus)}"]`);
    ppS.focus = null;
    if (r) ppReveal(r);
  }
}

// 한 칸을 고친 뒤: 목록 줄·수정자·단계 버튼·요약만 바꾼다(펼친 칸의 입력·포커스는 그대로).
// 마우스를 누르는 사이(칸을 벗어나며 저장된 경우)에 줄을 바꾸면 그 클릭이 사라지므로 손을 뗀 뒤에 바꾼다
let ppPressed = 0;
const ppPending = new Set();
// 목록 줄을 누를 때만 미룬다(선택 상자는 누르면 목록이 떠서 mouseup이 페이지로 오지 않는다)
document.addEventListener('mousedown', (e) => { ppPressed = e.target.closest?.('.pp-line') ? Date.now() : 0; }, true);
document.addEventListener('mouseup', () => setTimeout(() => { ppPressed = 0; const ids = [...ppPending]; ppPending.clear(); ids.forEach(ppPaint); }, 0), true);
/* 행을 갈아 끼울 때 보던 자리를 지킨다 — .ipo-page는 브라우저 스크롤 고정을 꺼 두었으므로(ipo.css) 직접 맞춘다.
   기준 행은 key 행이 화면에 조금이라도 보이면 그 행, 아니면 머리가 화면 안에 있는 맨 위 행(없으면 화면 맨 위에 걸친 행).
   재는 자리는 기준 행 바로 위(앞에 보이는 형제의 아래 바깥 여백 끝, 없으면 자기 위 바깥 여백 끝)라, 기준 행 자신이 펼쳐지며 생기는 여백·테두리는 그대로 두고
   그 위에서 바뀐 높이만 .scroll로 되돌린다(위 행이 접혀도 보던 줄이 그대로). 바뀐 것이 없으면 scrollTop을 쓰지 않는다(하던 스크롤이 끊기지 않게) */
function ppHold(b, key, fn) {
  const sc = b && b.closest('.scroll'); if (!sc) return fn();
  const tb = document.querySelector('.tabbar'), t = sc.getBoundingClientRect().top, e = t + sc.clientHeight - (tb ? tb.offsetHeight : 0);
  const rows = [...b.querySelectorAll('.pp-row[data-id]')], at = (r) => r.getBoundingClientRect(), k = key == null ? null : rows.find((r) => r.dataset.id === key);
  const pin = (k && at(k).bottom > t && at(k).top < e ? k : null) || rows.find((r) => at(r).top >= t && at(r).top < e) || rows.find((r) => at(r).top < t && at(r).bottom > t);
  if (!pin) return fn();
  const up = (r) => { let p = r.previousElementSibling; while (p && !p.getClientRects().length) p = p.previousElementSibling;
    return p ? at(p).bottom + (parseFloat(getComputedStyle(p).marginBottom) || 0) : at(r).top - (parseFloat(getComputedStyle(r).marginTop) || 0); };
  const id = pin.dataset.id, y0 = up(pin), out = fn();
  const now = [...b.querySelectorAll('.pp-row[data-id]')].find((r) => r.dataset.id === id), dy = now ? up(now) - y0 : 0;
  if (Math.abs(dy) >= 0.5) sc.scrollTop += dy;
  return out;
}

function ppPaint(id) {
  if (ppPressed && Date.now() - ppPressed < 2000) { ppPending.add(id); return; }
  const h = ppS.host; if (!h) return;
  const x = ppFind(id), row = h.querySelector(`.pp-row[data-id="${CSS.escape(id)}"]`);
  // 줄이 화면 위 가장자리보다 위에서 시작하면 그 줄 아래 끝이 움직인 만큼 .scroll을 되돌린다(.ipo-page는 스크롤 고정을 꺼 둠, 맨 아래에서 브라우저가 이미 당긴 만큼은 빼지 않음).
  // 재는 것은 모든 쓰기를 마친 뒤 한 번 — WebKit은 .pp-by·#pp-sum을 바꿀 때 맨 아래에서 한 번 더 당긴다
  let sc = null, above = false, b0 = 0;
  if (row && x) {
    const ln = row.querySelector('.pp-line');
    if (ln) {
      sc = ln.closest('.scroll'); above = !!sc && ln.getBoundingClientRect().top < sc.getBoundingClientRect().top; b0 = ln.getBoundingClientRect().bottom;
      ln.outerHTML = ppLine(x, row.classList.contains('open'));
    }
    const by = row.querySelector('.pp-by'); if (by) by.innerHTML = ppBy(x);
    row.querySelectorAll('[data-pp-set]').forEach((b) => { const on = b.dataset.ppSet === ppStage(x); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  const s = h.querySelector('#pp-sum'); if (s) s.innerHTML = ppSummary();
  const nl = above && row.querySelector('.pp-line'), dy = nl ? nl.getBoundingClientRect().bottom - b0 : 0;
  if (Math.abs(dy) >= 0.5) sc.scrollTop += dy;
}

function ppToggle(id) {
  const prev = ppS.open;
  ppS.open = prev === id ? null : id; // 펼친 행은 하나만 — 위에 펼쳐 둔 딜이 접혀도 누른 딜이 제자리에(ppHold)
  ppHold(ppS.host && ppS.host.querySelector('#pp-body'), id, () => [prev, ppS.open].forEach((k) => {
    if (!k || !ppS.host) return;
    const row = ppS.host.querySelector(`.pp-row[data-id="${CSS.escape(k)}"]`), x = ppFind(k);
    if (row && x) row.outerHTML = ppRow(x);
  }));
}

// 새 딜·홈 카드로 연 딜이 지금 필터에 걸려 안 보이면 필터를 푼다
function ppShow(id) {
  const x = ppFind(id); if (!x) return;
  if (!(ppS.stage === 'live' ? ppLive(x) : ppStage(x) === ppS.stage)) ppS.stage = ppLive(x) ? 'live' : ppStage(x);
  if (!ppList().some((m) => m.id === id)) { ppS.q = ''; const q = ppS.host?.querySelector('#pp-q'); if (q) q.value = ''; }
  ppS.open = id; ppS.focus = id;
  ppDraw();
}

/* ---------- 입력 저장 ---------- */
function ppCommit(el) {
  const row = el.closest('.pp-row'); if (!row) return;
  const id = row.dataset.id, f = el.dataset.ppF, x = ppFind(id); if (!x || !f) return;
  let v = String(el.value || '');
  const typing = document.activeElement === el;
  if (f === 'next') {
    // 연도를 치는 중(0002·20261…)이면 기다렸다가 칸을 벗어날 때 고쳐서 저장. 끝까지 틀리면 원래 날짜로 되돌린다
    const fixed = typeof fixYmd === 'function' ? fixYmd(v) : v;
    if (typing && fixed !== v) return;
    v = fixed;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { if (!typing) { el.value = ppNext(x); el.defaultValue = ppNext(x); } return; }
  } else v = v.trim();
  if (f === 'name' && !v) { el.value = x.name; el.defaultValue = x.name; return; } // 회사명은 비울 수 없다
  if (el.tagName !== 'SELECT') { if (el.value !== v && !typing) el.value = v; el.defaultValue = v; }
  ppSet(id, { [f]: v });
}

// 날짜 칸은 키보드로 고치면 칸마다 change가 나서 잠시 모았다 저장(칸을 벗어나면 바로)
let ppDateT = null, ppDateEl = null;
function ppDateLater(el) { clearTimeout(ppDateT); ppDateEl = el; ppDateT = setTimeout(() => ppDateNow(), 700); }
function ppDateNow() { if (!ppDateEl) return; clearTimeout(ppDateT); const el = ppDateEl; ppDateEl = null; ppDateT = null; ppCommit(el); }

// 입력 중에 다른 메뉴로 옮기거나 앱을 내리면 칸이 사라져도 쓰던 내용은 저장한다
function ppFlush() {
  if (ppDateEl) ppDateNow();
  const el = ppS.field;
  if (el && el.tagName !== 'SELECT' && el.value !== el.defaultValue) ppCommit(el);
}
window.addEventListener('hashchange', ppFlush);
document.addEventListener('visibilitychange', () => { if (document.hidden) ppFlush(); });

/* ---------- 새 딜·삭제 ---------- */
function ppNewSheet() {
  if (typeof openSheet !== 'function' || document.querySelector('#pp-nf')) return;
  const r = (id, label, ctl) => `<div class="r"><label for="${id}">${label}</label>${ctl}</div>`;
  openSheet(`<h3>새 딜</h3>
    <form class="ev-form" id="pp-nf" autocomplete="off">
      ${r('pp-nf-co', '회사명', '<input class="input" id="pp-nf-co" name="company" maxlength="100" placeholder="회사명을 입력하세요.">')}
      ${r('pp-nf-src', '출처', `<select class="select narrow" id="pp-nf-src" name="src">${ppOpts(PP_SRCS, '소개')}</select>`)}
      ${r('pp-nf-in', '소개자', '<input class="input" id="pp-nf-in" name="introducer" maxlength="100">')}
      ${r('pp-nf-ty', '유형', `<select class="select narrow" id="pp-nf-ty" name="type">${ppOpts(PP_TYPES, '', '선택')}</select>`)}
      ${r('pp-nf-st', '단계', `<select class="select narrow" id="pp-nf-st" name="stage">${ppOpts(PP_STAGES, '발굴')}</select>`)}
      ${r('pp-nf-ow', '담당', `<select class="select narrow" id="pp-nf-ow" name="owner">${ppOpts(ppPeople(), ppMe(), '선택')}</select>`)}
      ${r('pp-nf-nx', '다음 연락일', '<input class="input narrow" type="date" id="pp-nf-nx" name="next">')}
      ${r('pp-nf-ac', '다음 할 일', '<input class="input" id="pp-nf-ac" name="todo" maxlength="200">')}
      ${r('pp-nf-no', '메모', '<textarea class="area" id="pp-nf-no" name="note" maxlength="4000"></textarea>')}
      <div class="ev-actions"><span class="sp"></span><button type="button" class="btn grey" data-cancel>취소</button><button type="submit" class="btn primary" data-save disabled>저장</button></div>
    </form>`, (el, close) => {
    const f = el.querySelector('#pp-nf'), save = f.querySelector('[data-save]'), co = f.querySelector('#pp-nf-co');
    let busy = false;
    const sync = () => { save.disabled = busy || !co.value.trim(); };
    co.addEventListener('input', sync);
    setTimeout(() => co.focus(), 50);
    f.querySelector('[data-cancel]').onclick = close;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(f)), name = String(v.company || '').trim();
      if (!name || busy) return;
      busy = true; sync();
      try {
        await pipeLoad();
        const nx = (typeof fixYmd === 'function' ? fixYmd(v.next) : v.next) || '';
        const id = ppCreate({
          name, src: v.src, ref: '', type: v.type, introducer: String(v.introducer || '').trim(), stage: v.stage, owner: v.owner,
          next: /^\d{4}-\d{2}-\d{2}$/.test(nx) ? nx : '', action: String(v.todo || '').trim(), note: String(v.note || '').trim(),
        });
        ppShow(id);
        await ppSave();
        if (ppFind(id)) { close(); toast('추가했습니다'); } // 저장 못 하면 창을 그대로 두어 쓴 내용을 잃지 않게
      } catch (e) { toast(e.message); }
      busy = false; sync();
    });
  }, 'wide pp-sheet');
}

function ppAskDelete(id) {
  const x = ppFind(id); if (!x) return;
  const go = async () => {
    if (ppS.open === id) ppS.open = null;
    ppTouch(id, { deleted: true });
    ppDraw();
    try { await ppSave(); } catch { /* ppSave가 되돌리고 알린다 */ }
    if (ppS.items.find((m) => m && m.id === id)?.deleted) toast('삭제했습니다');
  };
  if (typeof openSheet !== 'function') { if (confirm(`"${x.name}" 딜을 삭제할까요?`)) go(); return; }
  openSheet(`<h3>이 딜을 삭제할까요?</h3><p class="pp-cf-name">${esc(x.name)}</p>
    <div class="pp-cf-act"><button type="button" class="btn grey" data-cancel>취소</button><button type="button" class="btn primary" data-ok>삭제</button></div>`, (el, close) => {
    el.querySelector('[data-cancel]').onclick = close;
    el.querySelector('[data-ok]').onclick = () => { close(); go(); };
  }, 'pp-sheet');
}

// 출처 탭으로 갈 때 그 딜을 펼쳐 둔다(이동은 링크 주소로). 신규상장은 ipo.js 의 ipoFocus(검색어·필터를 풀고 펼침, 없으면 펼침만), 예심청구·매각희망·입찰딜은 radar.js 의 radarFocus
function ppGoTab(ref) {
  const [k, ...rest] = String(ref || '').split(':'), key = rest.join(':');
  if (k === 'ipo' && key) {
    if (typeof ipoFocus === 'function') ipoFocus(key);
    else if (typeof ipoState === 'object' && ipoState?.open instanceof Set) { ipoState.focus = key; ipoState.open.add(key); }
  } else if (['yesim', 'sell', 'bids'].includes(k) && key && typeof radarFocus === 'function') radarFocus(ref);
}

async function ppRefresh(btn) {
  btn.disabled = true;
  try { await pipeLoad(true); ppDraw(); } catch (e) { toast(e.message); } finally { btn.disabled = false; }
}

function ppBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const fs = t.closest('[data-pp-stage]');
    if (fs) { ppS.stage = fs.dataset.ppStage; ppDraw(); return; }
    if (t.closest('#pp-ref')) { ppRefresh(t.closest('#pp-ref')); return; }
    if (t.closest('#pp-new')) { ppNewSheet(); return; }
    const sb = t.closest('[data-pp-set]');
    if (sb) { ppSet(sb.closest('.pp-row').dataset.id, { stage: sb.dataset.ppSet }); return; }
    if (t.closest('[data-pp-del]')) { ppAskDelete(t.closest('.pp-row').dataset.id); return; }
    const tl = t.closest('[data-pp-tab]');
    if (tl) { ppGoTab(tl.dataset.ppTab); return; }
    if (t.closest('a, input, select, textarea, .ipo-detail')) return;
    const row = t.closest('.pp-row');
    if (row) ppToggle(row.dataset.id);
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'pp-q') { ppS.q = ev.target.value; ppDraw(); } });
  root.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.id === 'pp-sort') { ppS.sort = el.value; ppDraw(); return; }
    if (!el.matches('[data-pp-f]') || ppDrawing) return;
    if (el.type === 'date') ppDateLater(el); else ppCommit(el);
  });
  root.addEventListener('focusin', (ev) => { if (ev.target.matches?.('[data-pp-f]')) ppS.field = ev.target; });
  const later = () => setTimeout(() => { if (ppS.redraw && !ppS.ime) ppDraw(); }, 0);
  root.addEventListener('compositionstart', () => { ppS.ime = true; });
  root.addEventListener('compositionend', () => { ppS.ime = false; later(); });
  // 칸을 벗어날 때: change가 안 난 경우(다시 그리며 되살린 입력)도 저장 안 된 값이면 저장
  root.addEventListener('focusout', (ev) => {
    const el = ev.target; if (!el.matches?.('[data-pp-f]')) return;
    ppS.ime = false;
    if (ppDrawing) return; // 다시 그리며 지워지는 칸: 쓰던 값은 ppKeep이 되살리거나 저장한다
    if (el.type === 'date' && ppDateEl) ppDateNow();
    if (el.tagName !== 'SELECT' && el.value !== el.defaultValue) ppCommit(el);
    if (ppS.field === el) ppS.field = null;
    later();
  });
}

async function renderPipeline(host) {
  ppS.host = host;
  host.innerHTML = `<div class="ipo-page pp-page" id="pp-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="pp-sum"></div>
      ${infoBtn('deals/pipeline')}
      <button class="btn ghost" type="button" id="pp-ref" aria-label="새로고침">${ico('refresh', 'sm')}<span class="pp-txt">새로고침</span></button>
      <button class="btn primary" type="button" id="pp-new">${ico('plus', 'sm')}새 딜</button></div>
    <section class="card ipo-card pp-card">
      <div class="ipo-filter pp-filter">
        <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="pp-q" type="search" placeholder="회사·소개자·메모 검색" value="${esc(ppS.q)}" autocomplete="off" aria-label="검색"></div>
        <div class="seg pp-seg" role="group" aria-label="단계">${[['live', '진행 중'], ...PP_STAGES.map((s) => [s, s])].map(([k, l]) => `<button type="button" data-pp-stage="${k}" class="${ppS.stage === k ? 'on' : ''}" aria-pressed="${ppS.stage === k}">${l}</button>`).join('')}</div>
        <select class="select" id="pp-sort" aria-label="정렬">${PP_SORTS.map(([k, l]) => `<option value="${k}"${ppS.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="pp-body" id="pp-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  ppBind(host.querySelector('#pp-root'));
  try { await pipeLoad(); }
  catch (e) {
    const b = host.querySelector('#pp-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (ppS.host === host && host.isConnected) ppDraw();
}

/* 홈 카드: 다음 연락일이 지났거나 7일 안인 진행 중 딜(최대 5개). 없거나 못 읽으면 '' */
async function pipeHomeBlock() {
  try { await pipeLoad(); } catch { return ''; }
  const lim = ymd(addDays(new Date(), 7));
  const list = ppS.items.filter((x) => ppOk(x) && ppLive(x) && ppNext(x) && ppNext(x) <= lim)
    .sort((a, b) => ppNext(a).localeCompare(ppNext(b)) || String(a.name).localeCompare(String(b.name)));
  if (!list.length) return '';
  const li = (x) => {
    const n = diffDays(ppNext(x), today()), when = n < 0 ? `${-n}일 지남` : n === 0 ? '오늘' : n === 1 ? '내일' : ppMd(ppNext(x));
    const meta = [x.action, x.owner].filter(Boolean).join(' · ');
    return `<li class="click" data-pp-go="${esc(x.id)}"><span class="time${n < 0 ? ' pp-over' : n === 0 ? ' pp-today' : ''}">${esc(when)}</span>
      <div class="t"><div class="ttl">${esc(x.name)}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}</div>${ppChip(ppStage(x))}</li>`;
  };
  return `<section class="card pp-home">
    <div class="card-head"><h2>파이프라인 연락 <span class="n">${list.length}</span></h2><a class="btn sm act" href="${PP_HASH}">전체 보기</a></div>
    <div class="card-body"><ul class="list">${list.slice(0, 5).map(li).join('')}</ul></div></section>`;
}

// 홈 카드에서 딜을 누르면 파이프라인에서 그 딜을 펼쳐 보여 준다
document.addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-pp-go]'); if (!li) return;
  const id = li.dataset.ppGo;
  ppS.stage = 'live'; ppS.q = ''; ppS.open = id; ppS.focus = id;
  if (location.hash === PP_HASH && ppS.host?.isConnected) ppShow(id); else location.hash = PP_HASH;
});

// 다른 탭의 '파이프라인에 있음'(data-pp-ref = ref)을 누르면 같은 ref 딜을 펼쳐 보여 준다. 완료·드롭이면 그 단계로(이동은 링크 주소로)
document.addEventListener('click', (ev) => {
  const ref = ev.target.closest('a[data-pp-ref]')?.dataset.ppRef; if (!ref) return;
  const x = ppS.items.find((m) => ppOk(m) && m.ref === ref); if (!x) return;
  if (location.hash === PP_HASH && ppS.host?.isConnected) { ppShow(x.id); return; }
  ppS.stage = ppLive(x) ? 'live' : ppStage(x); ppS.q = ''; ppS.open = x.id; ppS.focus = x.id;
});
