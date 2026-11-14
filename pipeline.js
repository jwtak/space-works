/* SPACE WORKS — 딜소싱 › 파이프라인: 개인 소개 딜과 다른 탭(신규상장·예심청구·매각희망·입찰딜)에서 올린 딜을 단계별로 관리하는 보드
   데이터: 회사 OneDrive SPACE WORKS/data/pipeline.json — 탁지원·대표님 두 분, 세 사람이 같이 고친다.
   항목 형식은 05. 딜소싱\_자동화\딜레이더\CONTRACT.md 의 pipeline (매일 엑셀 통합 작업도 같은 파일을 읽는다).
   진입: renderPipeline(host) — host 안에만 그린다. 홈 카드: pipeHomeBlock(). 다른 탭 상세 버튼: pipeHas(ref)·pipeAdd({...}), '있음' 링크에 data-pp-ref="<ref>"를 달면 그 딜을 펼쳐 연다.
   app.js 전역($, esc, pad, ymd, parse, today, addDays, diffDays, md, ico, toast, G, PEOPLE, openSheet, fixYmd)과 graph.js 의 STORE 를 쓴다.
   컨택 플랜(펼친 행 아래)·전화할 곳 목록(2026-11-14): fs.json cp를 읽고, 메일 초안은 mail.js mailLoadSig·MAIL_FONT를 쓴다. 아래 '컨택 플랜' 묶음 참고. */

const PP_STAGES = ['발굴', '검토', '미팅', '실사', '투자심의', '완료', '드롭'];
const PP_END = ['완료', '드롭'];            // '진행 중'에서 빼는 단계
const PP_HOT = ['미팅', '실사', '투자심의'];  // 목록 칩을 파랑으로
const PP_SRCS = ['소개', '신규상장', '예심청구', '매각희망', '입찰딜', '행사·IR', '상폐 위험·CB', 'PE 앵글', '기타'];
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
    '발굴, 검토 단계 딜은 하루 두 번 컨택 플랜이 자동으로 만들어집니다. 딜을 펼치면 키맨, 연락 루트, 메일 초안, 전화 순서가 보입니다.',
  ]],
  ['그래서 할 일', [
    '소개받은 딜은 \'새 딜\'로 바로 넣습니다.',
    '미팅·실사가 끝날 때마다 단계와 다음 할 일 날짜를 고칩니다.',
    '메일을 보내거나 전화한 뒤에는 컨택 플랜의 기록 버튼을 눌러 주세요. 다음 연락일과 다음 할 일이 채워집니다.',
    '\'전화할 곳\'을 누르면 전화할 회사와 번호, 찾을 부서가 한 목록으로 나옵니다.',
    '직접 만들고 싶으시면 \'프롬프트 복사\'를 눌러 Claude나 ChatGPT에 붙여 넣으세요. 회사 공용 프롬프트는 공용 폴더 04. 딜소싱의 \'컨택 플랜 프롬프트\'이고, 고치면 자동 작성에도 반영됩니다.',
    '그만 볼 딜은 지우지 말고 드롭으로 둡니다. 나중에 같은 딜이 다시 와도 이력이 남습니다.',
  ]],
] };
// ref 앞부분 → 그 딜이 있는 탭
const PP_TABS = { ipo: ['#deals/ipo', '신규상장'], yesim: ['#deals/yesim', '예심청구'], sell: ['#deals/sell', '매각희망'], bids: ['#deals/bids', '입찰딜'], events: ['#deals/events', '행사·IR'], facts: ['#deals/facts', '팩트시트'], delist: ['#deals/delist', '상폐 위험·CB'], pe: ['#deals/pe', 'PE 앵글'] };
const PP_HASH = '#deals/pipeline';
const PP_TTL = 5 * 60000;
const PP_WD = '일월화수목금토';

// 새로 고친 뒤에도 보던 검색어·단계·정렬·펼친 딜을 이어 보게 창마다 기억한다(app.js viewGet·viewSet). 지워진 딜 id는 그리지 않을 뿐이다
const PP_VIEW = viewGet('pp', null) || {};
const ppS = {
  items: [], version: null, at: 0, loading: null, dirty: new Map(), saving: Promise.resolve(), host: null,
  q: typeof PP_VIEW.q === 'string' ? PP_VIEW.q : '', stage: typeof PP_VIEW.stage === 'string' ? PP_VIEW.stage : 'live',
  sort: typeof PP_VIEW.sort === 'string' ? PP_VIEW.sort : 'next', open: typeof PP_VIEW.open === 'string' ? PP_VIEW.open : null,
  focus: null, field: null, ime: false, redraw: false,
  view: PP_VIEW.view === 'call' ? 'call' : 'list', // 'call' = 전화할 곳 목록
  cp: null, cpAt: 0, cpLoading: null, cpErr: '', cpCo: {}, cpMore: new Set(), cpDraft: {}, cpBusy: new Set(), // 컨택 플랜(fs.json)
};
const ppViewSave = () => viewSet('pp', { q: ppS.q, stage: ppS.stage, sort: ppS.sort, open: ppS.open, view: ppS.view });

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
const ppDay = (s) => yymd(s);
const ppMd = (s) => `${yymd(s)} (${PP_WD[parse(s).getDay()]})`;
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
    <section class="pp-cp" data-cp="${esc(x.id)}">${ppCpInner(x)}</section>
    <div class="pp-dfoot">${tab ? `<a class="ipo-a" href="${tab[0]}" data-pp-tab="${esc(x.ref)}">${tab[1]}에서 보기${ico('right', 'sm')}</a>` : ''}
      <button type="button" class="btn ghost sm pp-del" data-pp-del>${ico('trash', 'sm')}삭제</button></div>
  </div>`;
}

/* ---------- 컨택 플랜 (2026-11-14) ----------
   fs.json cp{딜 id → {name, made, madeAt, cos[]}}·cpFail{딜 id → {at, n, err}} — PC cp_req.py가 팩트시트와 같은 시각(fs.json slots)에 만든다.
   형식은 딜레이더\CONTRACT_fs.md 「컨택 플랜」. 딜에 쓰는 필드: cpReq(다시 만들기 누른 시각), cl[{d, k: mail·call·reply, by, co}](컨택 기록).
   메일 본문은 화면이 짠다(보내는 사람 = 담당). 초안은 담당 본인이 열었을 때만 Graph로 만든다(/me 임시 보관함) */
const PP_CP_STAGES = ['발굴', '검토']; // cp_req.py STAGES: 요청 없이 자동으로 만드는 단계
const PP_CP_TRIES = 3;                 // cp_req.py TRIES: 이만큼 실패하면 다시 만들기를 누를 때까지 멈춘다
const PP_CL = { mail: '메일 보냄', call: '전화함', reply: '답 받음' };
const PP_CL_S = { mail: '메일', call: '전화', reply: '답장' };
const PP_TITLE = { 탁지원: '대리', 유선열: '대표', 배청준: '대표' };
const PP_MAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function ppCpLoad(force) {
  if (!force && ppS.cpAt && Date.now() - ppS.cpAt < PP_TTL) return Promise.resolve();
  if (!ppS.cpLoading) {
    ppS.cpLoading = STORE.readText('data/fs.json').then((o) => {
      let d = null;
      try { d = o.text ? JSON.parse(o.text) : null; } catch { d = null; }
      ppS.cp = d && typeof d === 'object' ? d : {}; ppS.cpErr = '';
    }).catch((e) => { ppS.cpErr = e.message || '컨택 플랜을 불러오지 못했습니다'; })
      .finally(() => { ppS.cpAt = Date.now(); ppS.cpLoading = null; ppCpPaint(); });
  }
  return ppS.cpLoading;
}

const ppStr = (v) => (typeof v === 'string' ? v.trim() : '');
const ppObjs = (v) => (Array.isArray(v) ? v.filter((o) => o && typeof o === 'object') : []);
const ppStrs = (v) => (Array.isArray(v) ? v.map(ppStr).filter(Boolean) : []);
const ppCl = (x) => ppObjs(x.cl);

// 회사 하나(cos[]): 빠진 칸은 빈 값으로. co가 비면 딜 이름
function ppCo(c, x) {
  const m = c.mail && typeof c.mail === 'object' ? c.mail : {};
  return {
    co: ppStr(c.co) || x.name, ceo: ppStr(c.ceo), investors: ppStr(c.investors), addr: ppStr(c.addr),
    keymen: ppObjs(c.keymen), routes: ppObjs(c.routes).sort((a, b) => (Number(a.rank) || 9) - (Number(b.rank) || 9)), steps: ppStrs(c.steps),
    pitch: ppStr(c.pitch), timing: ppStr(c.timing), cautions: ppStr(c.cautions), avoid: ppStrs(c.avoid), sources: ppStrs(c.sources),
    mail: { to: ppStr(m.to), subject: ppStr(m.subject), greet: ppStr(m.greet), hook: ppStr(m.hook), us: ppStr(m.us), ask: ppStr(m.ask) },
    calls: ppObjs(c.calls).map((k) => ({ when: ppStr(k.when), tel: ppStr(k.tel), ask: ppStr(k.ask), note: ppStr(k.note) })),
  };
}

// plan = 만든 플랜, wait = 다음 처리 때 만든다, auto = 요청 없이 자동 대상이라서, stopped = 3번 실패해 멈춤 (cp_req.py pending과 같은 판단)
function ppCpState(x) {
  const raw = ppS.cp?.cp?.[x.id], f = ppS.cp?.cpFail?.[x.id], req = String(x.cpReq || '');
  const plan = raw && typeof raw === 'object' ? raw : null, madeAt = plan ? String(plan.madeAt || `${plan.made || ''}T00:00`) : '';
  const wait = plan ? plan.name !== x.name || req > madeAt : !!req || PP_CP_STAGES.includes(ppStage(x));
  const stopped = wait && !!f && f.n >= PP_CP_TRIES && req <= String(f.at || '');
  return { plan, cos: plan ? ppObjs(plan.cos).map((c) => ppCo(c, x)) : [], f, wait, stopped, auto: !plan && !req };
}

function ppCpNext() {
  const s = ppS.cp?.slots, slots = Array.isArray(s) && s.length ? s : ['11:00', '16:00'];
  const d = new Date(), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`, t = slots.find((v) => v > hm);
  return t ? `오늘 ${t}` : `내일 ${slots[0]}`;
}

/* 메일·전화 문구. 담당 = 보내는 사람 */
const ppWho = (o) => (o ? `${o}${PP_TITLE[o] ? ` ${PP_TITLE[o]}` : ''}` : '');
function ppIntro(o) {
  if (PP_TITLE[o] === '대리') return `유니버스인베스트먼트 투자운용본부 ${o} 대리입니다.`;
  if (PP_TITLE[o] === '대표') return `유니버스인베스트먼트 대표 ${o}입니다.`;
  return o ? `유니버스인베스트먼트 ${o}입니다.` : '유니버스인베스트먼트입니다.';
}
const ppSubject = (c) => c.mail.subject || '[투자 제안] 유니버스인베스트먼트';
function ppMailText(x, c) {
  const m = c.mail, body = [m.hook, m.us, m.ask].filter(Boolean);
  return [`${m.greet || `${c.ceo ? `${c.ceo} ` : ''}대표님`}, 안녕하십니까.`, ppIntro(x.owner), '', ...body, ...(body.length ? [''] : []), '감사합니다.'].join('\n');
}
const ppSent = (x, co) => ppCl(x).filter((l) => l.k === 'mail' && l.co === co && /^\d{4}-\d{2}-\d{2}$/.test(l.d || '')).pop();
function ppCallScript(x, c) {
  const who = ppWho(x.owner), me = `안녕하십니까, 유니버스인베스트먼트${who ? ` ${who}` : ''}입니다.`, ceo = c.ceo ? `${c.ceo} 대표님` : '대표님';
  const sent = ppSent(x, c.co), ask = c.calls[0]?.ask;
  if (!sent) return `${me} ${ceo}께 투자 관련 미팅을 요청드리려고 연락드렸습니다. 메일로 소개 자료를 먼저 보내 드려도 될까요?`;
  const d = parse(sent.d);
  return `${me} ${d.getMonth() + 1}월 ${d.getDate()}일 ${ceo} 앞으로 투자 관련 미팅 요청 메일을 드렸는데, 잘 전달되었는지 여쭤보려고 연락드렸습니다. ${ask ? `${ask} 쪽으로` : '담당하시는 분께'} 연결해 주실 수 있을까요?`;
}

/* 그리기 */
const ppBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const ppKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const ppTel = (t) => (t ? `<a class="ipo-tel pp-tel" href="tel:${esc(t.replace(/[^\d+]/g, ''))}">${esc(t)}</a>` : '');
const ppUl = (a, tag = 'ul') => `<${tag} class="ipo-${tag}">${a.map((v) => `<li>${/^https?:\/\/\S+$/.test(v) ? `<a class="ipo-a pp-src" href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</li>`).join('')}</${tag}>`;
const PP_NONE = '<p class="ipo-p muted">없음</p>';
const ppCpKey = (id, co) => `${id}\n${co}`;

function ppCpInner(x) {
  const bar = (msg, btn = '') => `<div class="fq-bar"><span class="fq-t">컨택 플랜</span>${msg ? `<span class="muted">${msg}</span>` : ''}${btn}</div>`;
  if (!ppS.cpAt) { if (!ppS.cpLoading) ppCpLoad(); return bar('불러오는 중…'); }
  if (ppS.cpErr) return bar(esc(ppS.cpErr));
  // 프롬프트 복사: 대표님이 직접 Claude·ChatGPT로 만들 때 쓰는 회사 공용 프롬프트(cp_req.py도 같은 파일을 읽는다)
  const pb = '<button type="button" class="btn ghost sm" data-cp-prompt>프롬프트 복사</button>';
  const st = ppCpState(x), btn = (l, cls = '') => `<span class="pp-cp-acts">${pb}${l ? `<button type="button" class="btn sm${cls}" data-cp-req>${l}</button>` : ''}</span>`;
  let head;
  if (st.stopped) head = bar(`만들지 못했습니다${st.f.err ? `: ${esc(String(st.f.err).slice(0, 80))}` : ''}`, btn('다시 만들기'));
  else if (st.wait) head = bar(`${ppCpNext()}에 ${st.auto ? '자동으로 ' : ''}만듭니다`, btn(''));
  else if (st.plan) head = bar(/^\d{4}-\d{2}-\d{2}/.test(st.plan.made || '') ? `작성 ${esc(yymd(st.plan.made))}` : '', btn('다시 만들기'));
  else head = bar('', btn('컨택 플랜 만들기', ' primary'));
  if (!st.cos.length) return head;
  let i = ppS.cpCo[x.id] || 0;
  if (i >= st.cos.length) i = 0;
  const tabs = st.cos.length > 1 ? `<div class="seg pp-cp-tabs" role="group" aria-label="회사">${st.cos.map((c, k) => `<button type="button" class="${k === i ? 'on' : ''}" aria-pressed="${k === i}" data-cp-tab="${k}">${esc(c.co)}</button>`).join('')}</div>` : '';
  return `${head}${tabs}${ppCpCompany(x, st.cos[i])}`;
}

function ppCpCompany(x, c) {
  const key = ppCpKey(x.id, c.co), mine = !!x.owner && ppMe() === x.owner, busy = ppS.cpBusy.has(key), link = ppS.cpDraft[key];
  const hint = mine ? '' : x.owner ? `담당(${esc(x.owner)})이 열면 초안을 만들 수 있습니다` : '담당을 정하면 초안을 만들 수 있습니다';
  const mail = ppBox('메일', `${ppKv('받는 사람', c.mail.to ? esc(c.mail.to) : '<span class="muted">공식 메일 확인 불가</span>')}${ppKv('제목', esc(ppSubject(c)))}
      <div class="pp-cp-mail">${esc(ppMailText(x, c))}</div>
      <div class="pp-cp-act"><button type="button" class="btn sm primary" data-cp-draft${mine && !busy ? '' : ' disabled'}>${busy ? '만드는 중…' : 'Outlook 초안 만들기'}</button>
        <button type="button" class="btn sm" data-cp-copy>본문 복사</button>${link ? `<a class="ipo-a" href="${esc(link)}" target="_blank" rel="noopener">임시 보관함에서 열기${ico('ext', 'sm')}</a>` : ''}</div>
      ${hint ? `<p class="pp-cp-hint">${hint}</p>` : ''}`);
  const calls = c.calls.length ? `<ul class="pp-cp-calls">${c.calls.map((k) => `<li>
        <div class="pp-cp-tl">${ppTel(k.tel) || '<span class="muted">번호 확인 불가</span>'}${k.when ? `<span class="chip">${esc(k.when)}</span>` : ''}</div>
        ${k.ask ? `<div><span class="muted">찾을 곳</span> ${esc(k.ask)}</div>` : ''}${k.note ? `<div class="muted">${esc(k.note)}</div>` : ''}</li>`).join('')}</ul>
      <div class="pp-cp-k">통화 스크립트</div><p class="pp-cp-script">${esc(ppCallScript(x, c))}</p>` : PP_NONE;
  const logs = ppCl(x).map((l, n) => [l, n]).filter(([l]) => !l.co || l.co === c.co).reverse();
  const log = ppBox('컨택 기록', `<div class="pp-cp-logbtn">${Object.entries(PP_CL).map(([k, l]) => `<button type="button" class="btn sm" data-cp-log="${k}">${l}</button>`).join('')}</div>
      ${logs.length ? `<ul class="pp-cp-log">${logs.map(([l, n]) => `<li><span class="d">${/^\d{4}-\d{2}-\d{2}$/.test(l.d || '') ? esc(mdw(l.d)) : ''}</span><span>${esc(PP_CL[l.k] || l.k || '')}</span><span class="muted">${esc(l.by || '')}</span>
        <button type="button" class="btn ghost sm pp-cp-unlog" data-cp-unlog="${n}" aria-label="이 기록 지우기">${ico('trash', 'sm')}</button></li>`).join('')}</ul>` : ''}`);
  const routes = c.routes.length ? ppBox('루트 맵', `<table class="ipo-tbl pp-cp-routes"><thead><tr><th>순위</th><th>루트</th><th>대상</th><th>채널</th><th>활용 방법</th></tr></thead><tbody>${c.routes.map((r) => `<tr>
      <td class="rk">${r.rank ? `${esc(r.rank)}순위` : ''}</td><td data-k="루트">${esc(ppStr(r.kind))}</td><td data-k="대상">${esc(ppStr(r.target))}</td><td data-k="채널">${esc(ppStr(r.channel))}</td><td data-k="활용">${esc(ppStr(r.how))}</td></tr>`).join('')}</tbody></table>`, `${c.routes.length}곳`) : '';
  const more = ppS.cpMore.has(x.id);
  const keymen = c.keymen.length ? `<ul class="ipo-ul">${c.keymen.map((k) => `<li><b>${esc([ppStr(k.role), ppStr(k.name)].filter(Boolean).join(' '))}</b>${ppStr(k.note) ? ` ${esc(ppStr(k.note))}` : ''}</li>`).join('')}</ul>` : PP_NONE;
  const point = `${ppKv('피칭 포인트', esc(c.pitch))}${ppKv('타이밍', esc(c.timing))}${ppKv('주의사항', esc(c.cautions))}`;
  const etc = `${ppKv('기존 투자자', esc(c.investors))}${ppKv('친전 서신', esc(c.addr))}${c.avoid.length ? ppKv('쓰지 말 채널', ppUl(c.avoid)) : ''}`;
  const detail = more ? `<div class="ipo-two-col">${ppBox('키맨', keymen)}${ppBox('권장 순서', c.steps.length ? ppUl(c.steps, 'ol') : PP_NONE)}</div>
      <div class="ipo-two-col">${ppBox('접근 포인트', point || PP_NONE)}${ppBox('기존 투자자와 주소', etc || PP_NONE)}</div>
      ${c.sources.length ? ppBox('출처', ppUl(c.sources)) : ''}` : '';
  return `<div class="pp-cp-co ipo-stack" data-cp-id="${esc(x.id)}" data-cp-c="${esc(c.co)}">
    <div class="ipo-two-col">${mail}<div class="ipo-stack">${ppBox('전화', calls)}${log}</div></div>
    ${routes}
    <button type="button" class="btn ghost sm pp-cp-more" data-cp-more aria-expanded="${more}">${more ? '접기' : '자세히'}${ico('right', 'sm')}</button>
    ${detail}</div>`;
}

// 화면에 있는 컨택 플랜 칸(id가 있으면 그것만)과 전화할 곳 목록을 다시 그린다
function ppCpPaint(id) {
  const h = ppS.host; if (!h || !h.isConnected) return;
  if (ppS.view === 'call') { ppDraw(); return; }
  h.querySelectorAll('.pp-cp[data-cp]').forEach((s) => { if (id && s.dataset.cp !== id) return; const x = ppFind(s.dataset.cp); if (x) s.innerHTML = ppCpInner(x); });
  ppCallN();
}

/* 기록: 메일 보냄 = 3일 뒤 확인 전화, 전화함 = 7일 뒤 후속 연락(주말이면 월요일), 답 받음 = 미팅 일정 잡기(다음 연락일 그대로) */
function ppBizDay(n) { const d = addDays(parse(today()), n), w = d.getDay(); return ymd(w === 6 ? addDays(d, 2) : w === 0 ? addDays(d, 1) : d); }
function ppCpLog(id, co, k) {
  const x = ppFind(id); if (!x || !PP_CL[k]) return;
  const c = ppCpState(x).cos.find((m) => m.co === co), tel = c?.calls.find((m) => m.tel)?.tel || '';
  const p = { cl: [...ppCl(x), { d: today(), k, by: ppMe(), co }] };
  if (k === 'mail') { p.next = ppBizDay(3); p.action = `확인 전화 ${co}${tel ? ` ${tel}` : ''}`; }
  else if (k === 'call') { p.next = ppBizDay(7); p.action = `후속 연락 ${co}`; }
  else p.action = `미팅 일정 잡기 ${co}`;
  ppSet(id, p);
  ppFormSync(id, p);
  ppCpPaint(id);
  toast(`기록했습니다${p.next ? `. 다음 연락일 ${mdw(p.next)}` : ''}`);
}
function ppCpUnlog(id, n) {
  const x = ppFind(id); if (!x) return;
  const cl = ppCl(x); if (!cl[n]) return;
  ppSet(id, { cl: cl.filter((_, k) => k !== n) });
  ppCpPaint(id);
}
// 기록 버튼이 바꾼 다음 연락일·할 일을 펼친 칸 입력에도(쓰고 있는 칸은 그대로)
function ppFormSync(id, p) {
  const row = ppS.host?.querySelector(`.pp-row[data-id="${CSS.escape(id)}"]`); if (!row) return;
  ['next', 'action'].forEach((f) => {
    const el = f in p && row.querySelector(`[data-pp-f="${f}"]`);
    if (el && document.activeElement !== el) { el.value = p[f]; el.defaultValue = p[f]; }
  });
}

function ppCpReq(id) {
  if (!ppFind(id)) return;
  ppSet(id, { cpReq: ppNow() });
  ppCpPaint(id);
  toast(`${ppCpNext()}에 컨택 플랜을 만듭니다`);
}

async function ppCpDraft(id, co) {
  const x = ppFind(id), c = x && ppCpState(x).cos.find((m) => m.co === co), key = ppCpKey(id, co);
  if (!c || !x.owner || ppMe() !== x.owner || ppS.cpBusy.has(key)) return;
  ppS.cpBusy.add(key); ppCpPaint(id);
  try {
    const sig = typeof mailLoadSig === 'function' ? await mailLoadSig() : '';
    const font = typeof MAIL_FONT === 'string' ? MAIL_FONT : "Pretendard,'Malgun Gothic',sans-serif";
    const lines = ppMailText(x, c).split('\n').map((l) => `<div>${esc(l) || '<br>'}</div>`).join('');
    const to = c.mail.to.split(/[,;\s]+/).filter((a) => PP_MAIL_RE.test(a)).map((address) => ({ emailAddress: { address } }));
    const msg = { subject: ppSubject(c), body: { contentType: 'HTML', content: `<div style="font-family:${font};font-size:14px;line-height:1.6;color:#111827">${lines}<div><br></div>${sig ? `<div data-sig="1">${sig}</div>` : ''}</div>` } };
    if (to.length) msg.toRecipients = to;
    const d = await G.post('/me/messages', msg);
    ppS.cpDraft[key] = /^https:\/\//.test(d?.webLink || '') ? d.webLink : '';
    toast('Outlook 임시 보관함에 넣었습니다');
  } catch (e) { toast(e.status === 403 ? '메일 권한이 없습니다.' : '초안을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  finally { ppS.cpBusy.delete(key); ppCpPaint(id); }
}

/* 회사 공용 프롬프트(팀 파일함 04. 딜소싱/컨택 플랜 프롬프트.md)의 '프롬프트 시작' 아래를 회사 이름·보내는 사람·참고 자료를 채워 복사한다.
   회사는 보고 있는 회사 탭, 플랜이 없으면 딜 이름. 보내는 사람은 담당(없으면 나) */
const PP_PROMPT = '팀/04. 딜소싱/컨택 플랜 프롬프트.md';
async function ppCpPrompt(id) {
  const x = ppFind(id); if (!x) return;
  try {
    const raw = String((await STORE.readText(PP_PROMPT)).text || ''), mark = '===== 프롬프트 시작 =====';
    if (!raw.includes(mark)) throw new Error('형식');
    const cos = ppCpState(x).cos, co = cos.length ? cos[Math.min(ppS.cpCo[id] || 0, cos.length - 1)].co : x.name;
    const ref = [x.introducer && `소개해 준 분 ${x.introducer}`, x.note].filter(Boolean).join(' / ').replace(/\s+/g, ' ');
    const text = raw.split(mark)[1].replace(/^\s+/, '')
      .replace(/^\[회사 이름\]:.*$/m, `[회사 이름]: ${co}`)
      .replace(/^\[보내는 사람\]:.*$/m, `[보내는 사람]: ${ppWho(x.owner || ppMe())}`)
      .replace(/^\[참고 자료\]:.*$/m, `[참고 자료]: ${ref}`);
    await navigator.clipboard.writeText(text);
    toast(`${co} 프롬프트를 복사했습니다`);
  } catch (e) { toast(e.message === '형식' ? '프롬프트 파일 형식이 바뀌었습니다' : '프롬프트를 복사하지 못했습니다'); }
}

async function ppCpCopy(id, co) {
  const x = ppFind(id), c = x && ppCpState(x).cos.find((m) => m.co === co); if (!c) return;
  try { await navigator.clipboard.writeText(ppMailText(x, c)); toast('본문을 복사했습니다'); } catch { toast('복사하지 못했습니다'); }
}

/* ---------- 전화할 곳: 진행 중 딜 중 컨택 플랜에 전화가 있는 회사. 연락일이 오늘이거나 지난 곳, 메일 보낸 곳, 나머지 순 ---------- */
function ppCalls() {
  if (!ppS.cpAt || ppS.cpErr) return [];
  const q = ppS.q.trim().toLowerCase(), td = today(), out = [];
  ppS.items.forEach((x) => {
    if (!ppOk(x) || !ppLive(x)) return;
    const st = ppCpState(x);
    st.cos.forEach((c) => {
      if (!c.calls.length) return;
      if (q && ![x.name, c.co, x.owner, ...c.calls.map((k) => `${k.tel} ${k.ask}`)].join(' ').toLowerCase().includes(q)) return;
      const logs = ppCl(x).filter((l) => l.co === c.co || (!l.co && st.cos.length === 1)), nx = ppNext(x);
      const last = logs.filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.d || '')).sort((a, b) => a.d.localeCompare(b.d)).pop();
      out.push({ x, c, last, g: nx && nx <= td ? 0 : logs.some((l) => l.k === 'mail') ? 1 : 2 });
    });
  });
  return out.sort((a, b) => a.g - b.g || (ppNext(a.x) || '9999').localeCompare(ppNext(b.x) || '9999') || a.c.co.localeCompare(b.c.co, 'ko'));
}
function ppCallN() {
  const n = ppS.host?.querySelector('#pp-calls-n'); if (n) n.textContent = ppS.cpAt && !ppS.cpErr ? String(ppCalls().length || '') : '';
}

const PP_KHEAD = `<div class="ipo-head pp-kcols"><div class="pp-k-next">다음 연락</div><div class="pp-k-name">회사</div><div class="pp-k-own">담당</div><div class="pp-k-tel">번호</div>
  <div class="pp-k-ask">누구 찾기</div><div class="pp-k-when">언제</div><div class="pp-k-last">마지막 기록</div><div class="pp-k-act"></div></div>`;

function ppCallRow({ x, c, last }) {
  const nx = ppNext(x);
  let next = ppDash, cls = ' none';
  if (nx) { const [rel, k] = ppRel(nx); cls = k ? ` ${k}` : ''; next = `<span class="pp-d">${ppMd(nx)}</span><div class="ipo-sub">${rel}</div>`; }
  const col = (f) => c.calls.map((k) => `<div>${f(k) || ppDash}</div>`).join('');
  const asks = c.calls.some((k) => k.ask), whens = c.calls.some((k) => k.when);
  return `<div class="pp-call pp-kcols" data-cp-id="${esc(x.id)}" data-cp-c="${esc(c.co)}">
    <div class="pp-k-next pp-c-next${cls}">${next}</div>
    <div class="pp-k-name"><button type="button" class="ipo-ttl" data-cp-open>${esc(c.co)}</button>${c.co !== x.name ? `<div class="ipo-sub">${esc(x.name)}</div>` : ''}</div>
    <div class="pp-k-own${x.owner ? '' : ' none'}">${x.owner ? esc(x.owner) : ppDash}</div>
    <div class="pp-k-tel">${col((k) => `${ppTel(k.tel)}${k.ask || k.when ? `<span class="pp-k-sub">${esc([k.ask, k.when].filter(Boolean).join(', '))}</span>` : ''}`)}</div>
    <div class="pp-k-ask${asks ? '' : ' none'}">${col((k) => esc(k.ask))}</div>
    <div class="pp-k-when${whens ? '' : ' none'}">${col((k) => esc(k.when))}</div>
    <div class="pp-k-last${last ? '' : ' none'}">${last ? `${esc(PP_CL_S[last.k] || '')} ${esc(md(last.d))}` : ppDash}</div>
    <div class="pp-k-act"><button type="button" class="btn sm" data-cp-log="call">전화함</button></div>
  </div>`;
}

function ppCallBody() {
  if (!ppS.cpAt) { if (!ppS.cpLoading) ppCpLoad(); return '<div class="empty">불러오는 중…</div>'; }
  if (ppS.cpErr) return `<div class="empty">${esc(ppS.cpErr)}</div>`;
  const a = ppCalls();
  if (!a.length) return `<div class="empty">${ppS.q.trim() ? '조건에 맞는 곳이 없습니다.' : '전화할 곳이 없습니다. 진행 중 딜에 컨택 플랜이 만들어지면 여기에 모입니다.'}</div>`;
  return PP_KHEAD + a.map(ppCallRow).join('');
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
  if (ppS.view === 'call') return ppCallBody();
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
  const call = ppS.view === 'call', cb = h.querySelector('#pp-calls');
  h.querySelector('.pp-card')?.classList.toggle('pp-callmode', call);
  if (cb) { cb.classList.toggle('on', call); cb.setAttribute('aria-pressed', call); }
  ppCallN();
  ppViewSave();
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
  ppViewSave();
  ppHold(ppS.host && ppS.host.querySelector('#pp-body'), id, () => [prev, ppS.open].forEach((k) => {
    if (!k || !ppS.host) return;
    const row = ppS.host.querySelector(`.pp-row[data-id="${CSS.escape(k)}"]`), x = ppFind(k);
    if (row && x) row.outerHTML = ppRow(x);
  }));
}

// 새 딜·홈 카드로 연 딜이 지금 필터에 걸려 안 보이면 필터를 푼다
function ppShow(id) {
  const x = ppFind(id); if (!x) return;
  ppS.view = 'list';
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
// 새로 고침·창 닫기: 저장은 비동기라 페이지가 내려가면 끊긴다. 쓰던 칸을 저장에 태우고, 아직 저장 중이면 묻는다
window.addEventListener('beforeunload', (e) => { ppFlush(); if (ppS.dirty.size) { e.preventDefault(); e.returnValue = ''; } });

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
  else if (k === 'facts' && key && typeof factsFocus === 'function') factsFocus(key);
  else if (k === 'delist' && key && typeof delistFocus === 'function') delistFocus(ref);
  else if (k === 'pe' && key && typeof peFocus === 'function') peFocus(ref);
}

async function ppRefresh(btn) {
  btn.disabled = true;
  try { await Promise.all([pipeLoad(true), ppCpLoad(true)]); ppDraw(); } catch (e) { toast(e.message); } finally { btn.disabled = false; }
}

function ppBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const fs = t.closest('[data-pp-stage]');
    if (fs) { ppS.stage = fs.dataset.ppStage; ppDraw(); return; }
    if (t.closest('#pp-ref')) { ppRefresh(t.closest('#pp-ref')); return; }
    if (t.closest('#pp-new')) { ppNewSheet(); return; }
    if (t.closest('#pp-calls')) { ppS.view = ppS.view === 'call' ? 'list' : 'call'; ppDraw(); return; }
    // 컨택 플랜 칸·전화할 곳 줄: 딜 id는 [data-cp-id], 회사는 [data-cp-c]
    const cw = t.closest('[data-cp-c]'), cpId = cw?.dataset.cpId || t.closest('[data-cp]')?.dataset.cp;
    if (t.closest('[data-cp-open]') && cpId) { ppShow(cpId); return; }
    const lg = t.closest('[data-cp-log]');
    if (lg && cw) { ppCpLog(cw.dataset.cpId, cw.dataset.cpC, lg.dataset.cpLog); return; }
    const ul = t.closest('[data-cp-unlog]');
    if (ul && cw) { ppCpUnlog(cw.dataset.cpId, Number(ul.dataset.cpUnlog)); return; }
    if (t.closest('[data-cp-draft]') && cw) { ppCpDraft(cw.dataset.cpId, cw.dataset.cpC); return; }
    if (t.closest('[data-cp-copy]') && cw) { ppCpCopy(cw.dataset.cpId, cw.dataset.cpC); return; }
    if (t.closest('[data-cp-req]') && cpId) { ppCpReq(cpId); return; }
    if (t.closest('[data-cp-prompt]') && cpId) { ppCpPrompt(cpId); return; }
    const ct = t.closest('[data-cp-tab]');
    if (ct && cpId) { ppS.cpCo[cpId] = Number(ct.dataset.cpTab); ppCpPaint(cpId); return; }
    if (t.closest('[data-cp-more]') && cpId) { if (ppS.cpMore.has(cpId)) ppS.cpMore.delete(cpId); else ppS.cpMore.add(cpId); ppCpPaint(cpId); return; }
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
        <button type="button" class="btn pp-callbtn${ppS.view === 'call' ? ' on' : ''}" id="pp-calls" aria-pressed="${ppS.view === 'call'}">전화할 곳<span class="n" id="pp-calls-n"></span></button>
        <div class="seg pp-seg" role="group" aria-label="단계">${[['live', '진행 중'], ...PP_STAGES.map((s) => [s, s])].map(([k, l]) => `<button type="button" data-pp-stage="${k}" class="${ppS.stage === k ? 'on' : ''}" aria-pressed="${ppS.stage === k}">${l}</button>`).join('')}</div>
        <select class="select" id="pp-sort" aria-label="정렬">${PP_SORTS.map(([k, l]) => `<option value="${k}"${ppS.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="pp-body" id="pp-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  ppBind(host.querySelector('#pp-root'));
  ppCpLoad();
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
  ppS.stage = 'live'; ppS.q = ''; ppS.open = id; ppS.focus = id; ppS.view = 'list'; ppViewSave();
  if (location.hash === PP_HASH && ppS.host?.isConnected) ppShow(id); else location.hash = PP_HASH;
});

// 다른 탭의 '파이프라인에 있음'(data-pp-ref = ref)을 누르면 같은 ref 딜을 펼쳐 보여 준다. 완료·드롭이면 그 단계로(이동은 링크 주소로)
document.addEventListener('click', (ev) => {
  const ref = ev.target.closest('a[data-pp-ref]')?.dataset.ppRef; if (!ref) return;
  const x = ppS.items.find((m) => ppOk(m) && m.ref === ref); if (!x) return;
  if (location.hash === PP_HASH && ppS.host?.isConnected) { ppShow(x.id); return; }
  ppS.stage = ppLive(x) ? 'live' : ppStage(x); ppS.q = ''; ppS.open = x.id; ppS.focus = x.id; ppS.view = 'list'; ppViewSave();
});
