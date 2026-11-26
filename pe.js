/* UNIVERSE WORKS — 딜소싱 › PE 앵글 (#deals/pe): 오너기업(상속이슈) · 중복상장 두 묶음
   매일 10:00 PC 작업(05. 딜소싱\_자동화\딜레이더\pe.py)이 회사 OneDrive SPACE WORKS/data/pe.json 을 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT_pe.md).
   컨택 상태·메모는 예심청구·매각희망·입찰딜과 같은 data/radar_marks.json 에 남긴다(key = pe:heir:<corp_code> · pe:dup:<이름>, tab = pe).
   저장·합치기는 radar.js 와 같은 방식(아직 못 보낸 변경만 얹고, 409면 최신본을 다시 읽어 합친 뒤 한 번 더 저장, 그 밖의 실패는 되돌림).
   진입: renderPe(host) — host 안에만 그린다. 다른 화면에서 한 회사를 펼쳐 열 때: peFocus(ref)가 돌려준 주소로 이동.
   app.js 전역($, esc, pad, ymd, yymd, today, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn, G)과 graph.js 의 STORE, ipo.css·radar.css 클래스를 쓴다.
   파이프라인은 pipeline.js 의 pipeAdd·pipeHas·pipeLoad(있을 때만 버튼이 보인다). */

const PE_FILE = 'data/pe.json';
const PE_TTL = 5 * 60000;
const PE_STATUS = ['미접촉', '연락함', '미팅', '보류', '검토 완료']; // radar.js RD_STATUS와 같은 값·순서(같은 파일을 쓴다)
// 검토 완료는 제자리에서 진한 회색 행(.ct-done, radar.css), 연락함·미팅·보류만 맨 아래 '컨택한 곳'으로(사용자 2026-11-16)
const PE_DONE = PE_STATUS[4];
const peLowSt = (st) => st !== PE_STATUS[0] && st !== PE_DONE;
const peDoneCls = (st) => (st === PE_DONE ? ' ct-done' : '');
const pePipeSrc = (key) => (String(key).startsWith('pe:dup:') ? '중복상장' : '오너기업'); // pipeline.js 출처 목록(PP_SRCS)과 같은 이름(11/18 'PE 앵글'에서 탭 이름으로)
const PE_GRPS = [['heir', '오너기업'], ['dup', '중복상장']];
const PE_HF = [['pass', '통과'], ['near', '근접'], ['all', '전체']];
const PE_REV = [['', '전체'], ['200-700', '바이아웃 200~700억'], ['300-3000', '성장투자 300~3,000억'], ['3000-', '3,000억+']]; // 2026-11-12 사용자: 두 딜 다 보고 필터로 나눔
const PE_OPM = [['', '전체'], ['5', '5%+'], ['10', '10%+'], ['20', '20%+']];
const PE_OLD = 25;
const PE_HSORT = [['score', '점수순'], ['rev', '매출순'], ['opm', '영업이익률순'], ['years', '업력순']];
// 딜 상태 묶음: live = 해소·매각 완료를 뺀 것(기본)
const PE_DF = [['live', '살아 있는 딜'], ['sale', '실제 매물'], ['ing', '진행 중'], ['drop', '철회·보류'], ['watch', '관찰'], ['end', '끝난 딜'], ['all', '전체']];
const PE_DSORT = [['last', '최근 신호순'], ['mcap', '모회사 시총순'], ['rev', '매출순']];
const PE_SIG_N = 10;
const peDupGrp = (st) => (st === '매각 완료' || /^해소/.test(st) ? 'end' : st === '실제 매물' ? 'sale' : st === '진행 중' ? 'ing' : ['철회', '지연·철회', '보류'].includes(st) ? 'drop' : 'watch');

// 새로 고친 뒤에도 보던 묶음·검색어·필터·정렬·펼친 행을 이어 보게 창마다 기억한다(app.js viewGet·viewSet, 키 pe.grp·pe.heir·pe.dup)
const PE_VIEW = { heir: ['q', 'f', 'rev', 'opm', 'sp', 'sort'], dup: ['q', 'f', 'sort'] };
function peView(g, s) {
  const v = viewGet(`pe.${g}`, null) || {};
  PE_VIEW[g].forEach((k) => { if (typeof v[k] === 'string') s[k] = v[k]; });
  ['old', 'team', 'big'].forEach((k) => { if (typeof v[k] === 'boolean') s[k] = v[k]; });
  if (g === 'heir') [['rev', PE_REV], ['opm', PE_OPM]].forEach(([k, o]) => { if (!o.some(([x]) => x === s[k])) s[k] = ''; }); // 구간을 바꾼 뒤 남은 옛 값
  s.open = new Set(Array.isArray(v.open) ? v.open : []);
  return s;
}
const peS = {
  data: null, at: 0, loading: null, host: null, focus: null, field: null,
  grp: viewGet('pe.grp', 'heir') === 'dup' ? 'dup' : 'heir',
  marks: { items: [], version: null }, dirty: new Map(), saving: Promise.resolve(),
  heir: peView('heir', { q: '', f: 'pass', rev: '', opm: '', sp: '', old: false, team: false, sort: 'score', open: new Set() }),
  dup: peView('dup', { q: '', f: 'live', team: false, big: false, sort: 'last', open: new Set() }), // big: 공시대상기업집단 소속도 보기(팀 기준상 기본 제외)
};
function peViewSave() {
  viewSet('pe.grp', peS.grp);
  PE_GRPS.forEach(([g]) => { const s = peS[g]; viewSet(`pe.${g}`, { ...Object.fromEntries(PE_VIEW[g].map((k) => [k, s[k]])), old: !!s.old, team: s.team, big: !!s.big, open: [...s.open] }); });
}

/* ---------- 데이터 ---------- */
const peStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const peNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const peObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const peArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const peList = (v) => (Array.isArray(v) ? v : []).map(peStr).filter(Boolean);
const peDay = (v) => { const s = peStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const peHttp = (v) => { const s = peStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const peFinN = (a) => peArr(a).filter((f) => peNum(f.y) != null).map((f) => ({ y: f.y, rev: peNum(f.rev), op: peNum(f.op), ni: peNum(f.ni) })).sort((a, b) => a.y - b.y).slice(-3);
const peLastFin = (fin) => [...fin].reverse().find((f) => f.rev != null) || null;
const peHolderN = (h) => ({ name: peStr(h.name), pct: peNum(h.pct), kind: peStr(h.kind) });

function peNormHeir(raw) {
  const r = peObj(raw.rules), pg = peObj(raw.progress), seen = new Set();
  const items = peArr(raw.items).map((x, i) => {
    const code = peStr(x.corp_code) || peStr(x.id).replace(/^heir:/, ''), name = peStr(x.name);
    if (!code || !name || seen.has(code)) return null;
    seen.add(code);
    const fin = peFinN(x.fin), top = peStr(x.top?.name) ? peHolderN(x.top) : null, p = peObj(x.parent);
    const o = {
      id: `heir:${code}`, key: `pe:heir:${code}`, code, name, idx: i,
      ceo: peStr(x.ceo), est: peDay(x.est), years: peNum(x.years), induty: peStr(x.induty), region: peStr(x.region), auditor: peStr(x.auditor),
      fin, last: peLastFin(fin), fs: peStr(x.fs), opm: peNum(x.opm), cagr: peNum(x.cagr),
      cash: peNum(x.cash), debt: peNum(x.debt), netCash: peNum(x.net_cash),
      top, holders: peArr(x.holders).map(peHolderN).filter((h) => h.name).slice(0, 5), ownerPct: peNum(x.owner_pct), family: peNum(x.family),
      parent: peStr(p.name) ? { name: peStr(p.name), code: peStr(p.code) } : null,
      fi: peList(x.fi), mezz: peList(x.mezz), signals: peList(x.signals),
      pass: x.pass === true, reasons: peList(x.reasons), score: peNum(x.score), team: x.team === true, dart: peHttp(x.dart),
    };
    o.q = [code, name, o.ceo, o.induty, o.region, o.auditor, top?.name, o.parent?.name, ...o.holders.map((h) => h.name), ...o.fi, ...o.signals].join(' ').toLowerCase();
    return o;
  }).filter(Boolean);
  return {
    asof: peDay(raw.asof), basis: peStr(raw.basis),
    rules: { rev: peNum(r.rev_min), op: peNum(r.op_min), owner: peNum(r.owner_min), note: peStr(r.note) },
    progress: { universe: peNum(pg.universe), parsed: peNum(pg.parsed), perDay: peNum(pg.per_day) },
    items, byId: new Map(items.map((x) => [x.id, x])),
  };
}

function peNormDup(raw) {
  const r = peObj(raw.rules), seen = new Set();
  const items = peArr(raw.items).map((x, i) => {
    const name = peStr(x.name), part = peStr(x.id).replace(/^dup:/, '') || name;
    if (!name || !part || seen.has(part)) return null;
    seen.add(part);
    const p = peObj(x.parent), fin = peFinN(x.fin), st = peStr(x.status);
    const signals = peArr(x.signals).map((s) => ({ type: peStr(s.type), date: peDay(s.date), text: peStr(s.text), url: peHttp(s.url) }))
      .filter((s) => s.text || s.type).sort((a, b) => b.date.localeCompare(a.date));
    const news = peArr(x.news).filter((n) => peStr(n.title)).map((n) => ({ title: peStr(n.title), url: peHttp(n.url), date: peDay(n.date), src: peStr(n.src) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    const o = {
      id: `dup:${part}`, key: `pe:dup:${part}`, name, idx: i, code: peStr(x.corp_code), biz: peStr(x.biz),
      parent: { name: peStr(p.name), code: peStr(p.code), mcap: peNum(p.mcap), pct: peNum(p.pct) }, bigGroup: peStr(x.big_group),
      status: st, sg: peDupGrp(st), fin, last: peLastFin(fin), finSrc: peStr(x.fin_src),
      fi: peStr(x.fi), ipo: peStr(x.ipo), deal: peStr(x.deal), signals, news,
      src: peList(x.src), team: x.team === true, first: peDay(x.first),
    };
    o.lastDay = [peDay(x.last), signals[0]?.date || ''].sort().pop();
    o.q = [name, o.biz, o.parent.name, o.parent.code, o.bigGroup, st, o.fi, o.ipo, o.deal, ...signals.map((s) => s.text)].join(' ').toLowerCase();
    return o;
  }).filter(Boolean);
  return { asof: peDay(raw.asof), rules: { pct: peNum(r.pct_min), note: peStr(r.note) }, items, byId: new Map(items.map((x) => [x.id, x])) };
}

function peNorm(raw) {
  return { generated: peStr(raw.generated), heir: peNormHeir(peObj(raw.heir)), dup: peNormDup(peObj(raw.dup)), sources: peObj(raw.sources) };
}

function peLoad(force) {
  if (!force && peS.at && Date.now() - peS.at < PE_TTL) return Promise.resolve();
  if (!peS.loading) {
    peS.loading = (async () => {
      // 저장 대기 중에 읽으면 대기 변경이 덮이므로 저장이 끝난 뒤 읽고, 아직 못 보낸 변경은 다시 얹는다(radar.js rdLoad와 같다)
      let d, mk, sv;
      do {
        sv = peS.saving; await sv.catch(() => {});
        [d, mk] = await Promise.all([STORE.readText(PE_FILE), peReadMarks(), typeof spLoad === 'function' ? spLoad(force) : null]);
      } while (sv !== peS.saving);
      let raw = null;
      if (d.text) { try { raw = JSON.parse(d.text); } catch { throw new Error('PE 앵글 자료 형식이 올바르지 않습니다'); } }
      peS.data = raw && typeof raw === 'object' ? peNorm(raw) : null;
      peS.marks = { items: peApplyDirty(mk.items), version: mk.version };
      peS.at = Date.now();
      TAB_INFO['deals/pe'] = peInfo(peS.data);
    })().finally(() => { peS.loading = null; });
  }
  return peS.loading;
}

/* ---------- 컨택 상태·메모 (radar_marks.json, radar.js 와 같은 방식) ----------
   dirty = 아직 저장 안 된 변경 {key → {patch, seq, base(되돌릴 원본, 없으면 null), name, at, by}} */
const PE_MARKS_BAD = '컨택 상태 자료 형식이 올바르지 않습니다';
const peFind = (id) => peS.data?.[String(id).split(':')[0]]?.byId.get(id) || null;
const peMark = (key) => peS.marks.items.find((m) => m && m.key === key);
const peSt = (key) => { const s = peMark(key)?.status; return PE_STATUS.includes(s) ? s : '미접촉'; };
const peNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
let peSeq = 0;

// 깨졌거나 배열이 아니면 빈 목록으로 보고 저장하면 다른 분 표시가 지워지므로 읽기를 멈춘다
async function peReadMarks() {
  let r;
  try { r = await STORE.readJSON('radar_marks'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; r = null; }
  if (!r || !Array.isArray(r.items)) { const err = new Error(PE_MARKS_BAD); err.bad = true; throw err; }
  return r;
}

function peApplyDirty(items) {
  peS.dirty.forEach((e, key) => {
    const k = items.findIndex((x) => x && x.key === key);
    const m = { ...(k >= 0 ? items[k] : { key, status: '미접촉', note: '' }), ...e.patch, tab: 'pe', name: e.name, at: e.at, by: e.by };
    if (k >= 0) items[k] = m; else items.push(m);
  });
  return items;
}

function peRollback(msg) {
  peS.dirty.forEach((e, key) => {
    const items = peS.marks.items, k = items.findIndex((x) => x && x.key === key);
    if (e.base) { if (k >= 0) items[k] = e.base; else items.push(e.base); } else if (k >= 0) items.splice(k, 1);
  });
  peS.dirty.clear();
  toast(msg);
  peDraw();
}

function peSaveMarks() {
  let merged = false;
  peS.saving = peS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      if (!peS.dirty.size) return;
      const sent = new Map([...peS.dirty].map(([key, e]) => [key, e.seq]));
      const body = peS.marks.items.filter((m) => m && typeof m === 'object').map((m) => ({ ...m }));
      try {
        peS.marks.version = await STORE.writeJSON('radar_marks', body, peS.marks.version);
        // 보내는 동안 또 바뀐 항목은 남겨 두고(방금 보낸 값을 원본으로, 그 뒤 바뀐 필드만 patch로) 다음 저장에 태운다
        sent.forEach((seq, key) => {
          const d = peS.dirty.get(key); if (!d) return;
          if (d.seq === seq) { peS.dirty.delete(key); return; }
          const b = body.find((m) => m.key === key);
          d.base = b ? { ...b } : null;
          d.patch = Object.fromEntries(Object.entries(d.patch).filter(([f, v]) => !b || b[f] !== v));
        });
        return;
      } catch (e) {
        if (e.status !== 409) { peRollback(e.status === 403 ? '편집 권한이 없습니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
        try {
          const r = await peReadMarks(), items = r.items;
          peS.dirty.forEach((d, key) => { const x = items.find((m) => m && m.key === key); d.base = x ? { ...x } : null; });
          peS.marks = { items: peApplyDirty(items), version: r.version };
          merged = true;
        } catch (e2) { peRollback(e2.bad ? `저장하지 못했습니다. ${PE_MARKS_BAD}.` : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
      }
    }
    peRollback('다른 분이 동시에 수정 중입니다. 잠시 후 다시 시도해 주세요.');
  }).finally(() => { if (merged) peDraw(); });
  return peS.saving;
}

function peTouch(id, patch) {
  const x = peFind(id); if (!x) return false;
  let m = peMark(x.key);
  const prev = peS.dirty.get(x.key), base = prev ? prev.base : (m ? { ...m } : null);
  if (!m) { m = { key: x.key, tab: 'pe', name: x.name, status: '미접촉', note: '' }; peS.marks.items.push(m); }
  const e = { patch: { ...prev?.patch, ...patch }, seq: ++peSeq, base, name: x.name, at: peNow(), by: G.account?.name || '' };
  Object.assign(m, patch, { tab: 'pe', name: e.name, at: e.at, by: e.by });
  peS.dirty.set(x.key, e);
  return true;
}

// 상태를 바꾼 행은 펼친 채 그 자리에 두고(메모를 이어 쓸 수 있게), 접을 때 연락함·미팅·보류면 목록 아래 '컨택한 곳'으로 내린다.
// 검토 완료를 한 번 더 누르면 미접촉으로 되돌린다(다른 상태는 그대로)
function peSetStatus(id, status) {
  const x = peFind(id);
  if (!x || !PE_STATUS.includes(status)) return;
  if (peSt(x.key) === status) { if (status !== PE_DONE) return; status = PE_STATUS[0]; }
  if (!peTouch(id, { status })) return;
  peRefreshRow(id);
  peSumDraw();
  peSaveMarks();
}

function peSetNote(id, v) {
  const x = peFind(id); if (!x) return;
  const note = String(v || '').trim().slice(0, 300);
  if ((peMark(x.key)?.note || '') === note) return;
  if (!peTouch(id, { note })) return;
  const by = peS.host && peRowEl(peS.host, id)?.querySelector('.ipo-by');
  if (by) by.textContent = peByText(peMark(x.key));
  peSaveMarks();
}

/* ---------- 표시 형식 ---------- */
const PE_NA = '<span class="muted">–</span>';
const peFmt = (n, d = 1) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });
const peEok = (v) => (peNum(v) == null ? '–' : `${peFmt(v)}억`);
const pePct = (v) => (peNum(v) == null ? '–' : `${v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
// 손실·감소는 파랑, 증가율은 빨강(오르면 빨강·내리면 파랑)
const peDn = (v, s) => (peNum(v) != null && v < 0 ? `<span class="pe-dn">${s}</span>` : s);
const peUpDn = (v, s) => (peNum(v) == null || v === 0 ? s : `<span class="${v > 0 ? 'pe-up' : 'pe-dn'}">${s}</span>`);
// 이름 칸: radar.js rdNm과 같은 자리에만 줄바꿈 기회(<wbr>)
const peNm = (s) => esc(s).replace(/[A-Za-z0-9]-(?=\d)|-(?=[A-Za-z(가-힣ㄱ-ㅣ一-鿿])|·(?=[가-힣ㄱ-ㅣ一-鿿])/g, '$&<wbr>');
const peMd = (s) => (peDay(s) ? yymd(s) : '');
const peByText = (m) => (m && typeof m.at === 'string' && m.at ? `${peStr(m.by)} ${peMd(m.at.slice(0, 10))} ${m.at.slice(11, 16)}`.trim() : '');
const peChip = (st) => (st === PE_STATUS[0] ? '' : `<span class="ipo-st s-${PE_STATUS.indexOf(st)}">${esc(st)}</span>`); // 기본값 '미접촉'은 칩 없이(상장·매물 화면과 같게, 컨택한 곳은 아래 묶음으로 내려감)
const peChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
const peTeam = (x) => (x.team ? '<span class="rd-fs-tag">팀 리스트</span>' : '');
const peBox = (t, body, sub = '', cls = '') => `<section class="ipo-box${cls ? ` ${cls}` : ''}"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const peKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const PE_NONE = '<p class="ipo-p muted">없음</p>';
const peA = (url, label) => `<a class="ipo-a" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}${ico('ext', 'sm')}</a>`;
function peTime(s) {
  const g = s ? new Date(s) : null;
  if (!g || isNaN(g)) return '';
  return `${ymd(g) === today() ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())}`;
}
const peDsCls = (sg) => (sg === 'sale' ? ' on' : sg === 'end' ? ' off' : '');
const peDs = (x) => (x.status ? `<span class="pe-ds${peDsCls(x.sg)}">${esc(x.status)}</span>` : PE_NA);
// 모회사가 상폐 위험·CB 목록에 있으면 그 탭에서 펼쳐 보는 링크. 그 목록은 delist.js 의 dlLoad(5분 캐시)로 읽고 dlS.data.byCode로 찾는다
const peDlOk = () => typeof dlLoad === 'function' && typeof delistFocus === 'function' && typeof dlS === 'object';
const peDlLink = (code) => (peDlOk() && dlS.data?.byCode?.has(code) ? `<a class="ipo-a" href="#deals/delist" data-pe-dl="${esc(code)}">상폐 위험·CB에서 보기${ico('right', 'sm')}</a>` : '');

/* ---------- 목록 ---------- */
// 우주·방산 테마(space.js): 오너기업은 회사 개요 글이 없어 이름(후보 목록)과 업종 코드만 본다. 약한 업종(기타 무선 통신장비 등)은 후보 목록에 있을 때만
const peSp = (x) => (typeof spOf === 'function' ? spOf(x, (y) => ({ name: y.name, ind: y.induty })) : { sp: false, coi: false });
function peHeirList() {
  const s = peS.heir, d = peS.data?.heir; if (!d) return [];
  const q = s.q.trim().toLowerCase(), [lo, hi] = s.rev ? s.rev.split('-').map((v) => (v === '' ? null : +v)) : [null, null];
  const by = {
    score: (a, b) => (b.pass - a.pass) || (b.score ?? -1) - (a.score ?? -1),
    rev: (a, b) => (b.last?.rev ?? -Infinity) - (a.last?.rev ?? -Infinity),
    opm: (a, b) => (b.opm ?? -Infinity) - (a.opm ?? -Infinity),
    years: (a, b) => (b.years ?? -1) - (a.years ?? -1),
  }[s.sort] || (() => 0);
  return d.items.filter((x) => (s.f === 'all' || (s.f === 'pass') === x.pass)
    && (!s.rev || (x.last?.rev != null && (lo == null || x.last.rev >= lo) && (hi == null || x.last.rev < hi)))
    && (!s.opm || (x.opm != null && x.opm >= +s.opm))
    && (!s.old || (x.years != null && x.years >= PE_OLD)) && (!s.team || x.team) && (!s.sp || peSp(x).sp) && (!q || x.q.includes(q)))
    .sort((a, b) => by(a, b) || a.idx - b.idx);
}

// 공시대상기업집단 소속은 팀 기준상 제외 대상이라 '대기업집단 포함'을 켜야 보인다. 묶음 숫자·요약 줄도 이 범위로 센다
const peDupBase = () => (peS.data?.dup.items || []).filter((x) => peS.dup.big || !x.bigGroup);
function peDupList() {
  const s = peS.dup, d = peS.data?.dup; if (!d) return [];
  const q = s.q.trim().toLowerCase();
  const by = {
    last: (a, b) => b.lastDay.localeCompare(a.lastDay),
    mcap: (a, b) => (b.parent.mcap ?? -1) - (a.parent.mcap ?? -1),
    rev: (a, b) => (b.last?.rev ?? -Infinity) - (a.last?.rev ?? -Infinity),
  }[s.sort] || (() => 0);
  return peDupBase().filter((x) => (s.f === 'all' || (s.f === 'live' ? x.sg !== 'end' : x.sg === s.f)) && (!s.team || x.team) && (!q || x.q.includes(q)))
    .sort((a, b) => by(a, b) || a.idx - b.idx);
}

// 컨택한 곳(연락함·미팅·보류)은 맨 아래 '컨택한 곳'으로 내리고 흐리게 — radar.js rdSink와 같다. 검토 완료는 제자리
function peSink(list) {
  const low = list.filter((x) => peLowSt(peSt(x.key)));
  if (!low.length) return list;
  return [...list.filter((x) => !low.includes(x)), { low: true, n: low.length }, ...low];
}
const peLowRow = (x) => `<div class="rd-grp rd-low"><b>컨택한 곳</b><span>${x.n}곳</span></div>`;
// 관심 없음(사람별, fav.js): 펼친 칸 머리와 같은 ref(pe:heir:<cc> · pe:dup:<이름>)로 떼어 맨 아래 접힌 묶음으로. 요약 숫자·묶음 숫자도 뺀 목록으로 센다
const peRef = (x) => x.key;
const peFv = (list) => (typeof fvSplit === 'function' ? fvSplit(list, peRef) : [list, []]);
const peVis = (list) => peFv(list)[0];

/* 오너기업: 점수 | 회사 | 최근 매출 | 영업이익률 | 최대주주 | 업력 | 신호 | 컨택 상태
   카드가 좁으면 업력·신호 칸(rd-c2)을 접어 회사 칸 보조 줄(rd-alt)로, 더 좁으면 한 건을 여러 줄로(rd-mob) — radar.css 배치 */
const PE_HEIR_HEAD = '<div class="ipo-head ipo-cols"><div>점수</div><div>회사</div><div>최근 매출</div><div>영업이익률</div><div>최대주주</div><div class="rd-c2">업력</div><div class="rd-c2">신호</div><div class="rd-h-st">컨택 상태</div></div>';

// 최대주주 칸: 이름·지분 + 구분(개인 합계·상장 모회사는 펼친 행 '주주' 상자에)
function peHolder(x) {
  const t = x.top;
  if (!t) return { main: PE_NA, sub: '' };
  return { main: `${peNm(t.name)}${t.pct != null ? ` ${pePct(t.pct)}` : ''}`, sub: esc(t.kind) };
}
// 신호 칸: 업력은 따로 보여 주므로 '업력 …' 신호는 빼고 한 줄에 하나씩 두 줄까지(전부는 펼친 행 '회사' 상자)
const peSigs = (x) => x.signals.filter((t) => !(x.years != null && /^업력/.test(t)));
// 좁은 폭·폰 목록 한 건의 수치 칸(이름표 위·값 아래, 자리 고정)
const peMg = (cells) => `<dl class="pe-mg">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

function peHeirRow(x) {
  const s = peS.heir, open = s.open.has(x.id), st = peSt(x.key), f = x.last, h = peHolder(x), sig = peSigs(x);
  const rs = x.reasons.join(', ');
  // 통과·근접 필터가 걸려 있으면 판정은 행마다 되풀이하지 않는다
  const pass = s.f === 'all' ? `<div class="ipo-sub"${!x.pass && rs ? ` title="${esc(rs)}"` : ''}>${x.pass ? '통과' : '근접'}</div>` : '';
  const mg = peMg([['매출', f ? peEok(f.rev) : PE_NA], ['OPM', x.opm != null ? peDn(x.opm, pePct(x.opm)) : PE_NA]]);
  return `<div class="ipo-row${open ? ' open' : ''}${peDoneCls(st)}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div>${x.score != null ? `${peFmt(x.score, 0)}점` : PE_NA}${pass}</div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${peNm(x.name)}</button>${s.team ? '' : peTeam(x)}${typeof spBadge === 'function' ? spBadge(peSp(x)) : ''}${x.induty ? `<div class="ipo-sub">${esc(x.induty)}</div>` : ''}${mg}</div>
      <div class="rd-mh">${f ? peEok(f.rev) : PE_NA}<div class="ipo-sub">${f ? esc(f.y) : ''}</div></div>
      <div class="rd-mh">${x.opm != null ? peDn(x.opm, pePct(x.opm)) : PE_NA}<div class="ipo-sub">${f?.op != null ? `영업이익 ${peDn(f.op, peEok(f.op))}` : ''}</div></div>
      <div class="rd-mh">${h.main}<div class="ipo-sub">${h.sub}</div></div>
      <div class="rd-mh rd-c2">${x.years != null ? `${x.years}년` : PE_NA}<div class="ipo-sub">${x.est ? `${x.est.slice(0, 4)} 설립` : ''}</div></div>
      <div class="rd-mh rd-c2">${sig.length ? `<div class="pe-sigl">${sig.slice(0, 2).map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : PE_NA}</div>
      <div class="ipo-c-st">${typeof ctSel === 'function' ? ctSel('pe', x.id, st, x.key) : peChip(st)}${peChev()}</div>
    </div>${open ? peHeirDetail(x) : ''}</div>`;
}

/* 중복상장: 날짜(최근 신호) | 자회사 | 딜 상태 | 모회사 | 최근 신호 | 최근 매출 | 컨택 상태 — radar.css 일곱 칸 그대로 */
const PE_DUP_HEAD = '<div class="ipo-head ipo-cols"><div>날짜</div><div>자회사</div><div class="pe-h-chip">딜 상태</div><div class="rd-c2">모회사</div><div>최근 신호</div><div class="rd-c2">최근 매출</div><div class="rd-h-st">컨택 상태</div></div>';

// 신호 글 앞에 종류가 또 붙어 있으면('상장 추진 · [더벨]…') 떼고 보인다 — 종류는 날짜 칸 아래에 있다
const peSgText = (sg) => (sg?.text ? (sg.type ? sg.text.replace(new RegExp(`^${sg.type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[·:|/-]\\s*`), '') : sg.text) : '');

function peDupRow(x) {
  const s = peS.dup, open = s.open.has(x.id), st = peSt(x.key), sg = x.signals[0], f = x.last, p = x.parent, sgt = peSgText(sg);
  // 딜 상태 필터가 한 가지(실제 매물·진행 중 …)로 걸려 있으면 이름 옆 칩은 되풀이라 뺀다
  const nchip = x.status && (s.f === 'all' || s.f === 'live') ? `<span class="pe-ds pe-nchip${peDsCls(x.sg)}">${esc(x.status)}</span>` : '';
  const pn = p.name ? `${peNm(p.name)}${p.pct != null ? ` ${pePct(p.pct)}` : ''}` : '';
  return `<div class="ipo-row${open ? ' open' : ''}${peDoneCls(st)}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div>${peMd(x.lastDay) || PE_NA}<div class="ipo-sub">${esc(sg?.type || '')}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${peNm(x.name)}</button>${nchip}${s.team ? '' : peTeam(x)}<div class="ipo-sub pe-biz">${esc(x.biz)}</div>${pn ? `<div class="ipo-sub rd-alt">${pn}</div>` : ''}${sgt ? `<div class="pe-msig">${esc(sgt)}</div>` : ''}${pn ? peMg([['모회사', p.name ? peNm(p.name) : PE_NA], ['지분율', p.pct != null ? pePct(p.pct) : PE_NA]]) : ''}</div>
      <div class="rd-mh">${peDs(x)}</div>
      <div class="rd-mh rd-c2">${p.name ? peNm(p.name) : PE_NA}<div class="ipo-sub">${p.pct != null ? `지분 ${pePct(p.pct)}` : ''}</div></div>
      <div class="rd-mh">${sgt ? `<div class="rd-clamp">${esc(sgt)}</div>` : PE_NA}</div>
      <div class="rd-mh rd-c2">${f ? peDn(f.rev, peEok(f.rev)) : PE_NA}<div class="ipo-sub">${f?.op != null ? `영업이익 ${peDn(f.op, peEok(f.op))}` : ''}</div></div>
      <div class="ipo-c-st">${typeof ctSel === 'function' ? ctSel('pe', x.id, st, x.key) : peChip(st)}${peChev()}</div>
    </div>${open ? peDupDetail(x) : ''}</div>`;
}

/* ---------- 펼친 행 ---------- */
// 머리: 요약 한 줄 + 컨택 상태 + 메모 + 작성자, 그리고 파이프라인(좁으면 요약 줄 오른쪽) — radar.js rdDhead와 같은 마크업
function peDhead(x, sum) {
  const m = peMark(x.key), st = peSt(x.key);
  return `<div class="ipo-dhead">
      ${sum ? `<p class="ipo-sum1">${esc(sum)}</p>` : '<p></p>'}
      <div class="ipo-acts"><div class="seg ipo-seg">${PE_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" aria-pressed="${s === st}" data-pe-st="${s}">${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-pe-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모">
        <span class="ipo-by">${esc(peByText(m))}</span>${fqHead(x.key, x)}</div>${pePipe(x)}
    </div>`;
}

// '파이프라인에 있음' 링크의 data-pp-ref = 파이프라인 화면이 그 딜을 펼쳐 보여 줄 때 쓰는 ref
function pePipe(x) {
  if (typeof pipeAdd !== 'function') return '';
  let has = false;
  try { has = typeof pipeHas === 'function' && !!pipeHas(x.key); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(x.key)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-pe-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}

// 재무: 항목 | 연도(최근 3개, 같은 폭), 전부 왼쪽 정렬. 카드가 아주 좁으면(300 미만) 연도별 한 줄 목록(pe-finm)으로
const PE_FS = { OFS: '별도', CFS: '연결' };
function peFinBox(fin, sub, src = '') {
  if (!fin.length) return peBox('재무', PE_NONE, sub);
  const n = (v) => (v == null ? '–' : peDn(v, v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
  const opm = (f) => (f.op == null || !f.rev ? null : Math.round((f.op / f.rev) * 1000) / 10);
  // 세 해 모두 값이 없는 줄(중복상장 당기순이익 등)은 뺀다
  const row = (k, g, key, cls = '') => (fin.every((f) => f[key] == null) ? '' : `<tr${cls ? ` class="${cls}"` : ''}><td>${k}</td>${fin.map((f) => `<td>${g(f)}</td>`).join('')}</tr>`);
  const tbl = `<table class="ipo-tbl pe-fin"><thead><tr><th>억 원</th>${fin.map((f) => `<th>${esc(f.y)}</th>`).join('')}</tr></thead><tbody>
    ${row('매출액', (f) => n(f.rev), 'rev')}${row('영업이익', (f) => n(f.op), 'op')}${row('OPM', (f) => (opm(f) == null ? '–' : peDn(opm(f), pePct(opm(f)))), 'op', 'r')}${row('당기순이익', (f) => n(f.ni), 'ni')}
    </tbody></table>`;
  const list = `<ul class="pe-finm">${[...fin].reverse().map((f) => `<li><b>${esc(f.y)}</b>${peMg([['매출', peEok(f.rev)], ['영업이익', f.op != null ? peDn(f.op, peEok(f.op)) : '–'], ['OPM', opm(f) != null ? peDn(opm(f), pePct(opm(f))) : '–'], ['순이익', f.ni != null ? peDn(f.ni, peEok(f.ni)) : '–']])}</li>`).join('')}</ul>`;
  return peBox('재무', tbl + list + (src ? `<p class="pe-finsrc">${esc(src)}</p>` : ''), sub);
}
// 항목 여러 개(신호·탈락 이유·메자닌·출처)는 한 줄에 잇지 않고 줄마다 하나씩
const peLines = (a) => a.map((t) => `<div>${esc(t)}</div>`).join('');

function peHeirDetail(x) {
  const finSub = esc(PE_FS[x.fs] || x.fs);
  const holders = x.holders.length ? `<table class="ipo-tbl rd-tbl-h"><thead><tr><th>주주</th><th>지분율</th><th>구분</th></tr></thead><tbody>${x.holders.map((h) => `<tr><td>${peNm(h.name)}</td><td>${h.pct != null ? pePct(h.pct) : '–'}</td><td>${esc(h.kind)}</td></tr>`).join('')}</tbody></table>` : PE_NONE;
  const hKv = `${peKv('개인 합계', x.ownerPct != null ? pePct(x.ownerPct) : '')}${peKv('같은 성', x.family > 1 ? `${x.family}명` : '')}`;
  const parent = x.parent ? `${peKv('모회사', peNm(x.parent.name))}${peKv('상장 코드', esc(x.parent.code))}` : '';
  const cash = `${peKv('현금성자산', x.cash != null ? peEok(x.cash) : PE_NA)}${peKv('차입금', x.debt != null ? peEok(x.debt) : PE_NA)}${peKv('순현금', x.netCash != null ? peDn(x.netCash, peEok(x.netCash)) : PE_NA)}
    ${peKv('메자닌', x.mezz.length ? peLines(x.mezz) : '없음')}${peKv('FI', x.fi.length ? x.fi.map(peNm).join(', ') : '없음')}`;
  const links = [x.dart ? peA(x.dart, 'DART 감사보고서') : '', peA(`https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(x.name)}`, 'DART 검색')].join('');
  const co = `${peKv('판정', x.pass ? '통과' : '근접')}${peKv('점수', x.score != null ? `${peFmt(x.score, 0)}점` : '')}${peKv('탈락 이유', x.reasons.length ? peLines(x.reasons) : '')}
    ${peKv('대표', peNm(x.ceo))}${peKv('설립', esc(x.est))}${peKv('업력', x.years != null ? `${x.years}년` : '')}${peKv('업종', esc(x.induty))}${peKv('지역', esc(x.region))}${peKv('감사인', esc(x.auditor))}
    ${peKv('매출 CAGR', x.cagr != null ? peUpDn(x.cagr, pePct(x.cagr)) : '')}${peKv('신호', x.signals.length ? peLines(x.signals) : '')}<div class="ipo-links">${links}</div>`;
  return `<div class="ipo-detail">${peDhead(x, '')}
    <div class="ipo-pane">${fqBox(x.key, x, '오너기업')}<div class="ipo-two-col">
      <div class="ipo-stack">${peFinBox(x.fin, finSub)}${peBox('현금·차입', cash)}</div>
      <div class="ipo-stack">${peBox('주주', holders + (hKv || parent ? `<div class="pe-hkv">${hKv}${parent}</div>` : ''))}${peBox('회사', co)}</div>
    </div></div>
  </div>`;
}

function peDupDetail(x) {
  const p = x.parent;
  const deal = `${peKv('딜 상태', peDs(x))}${peKv('FI', esc(x.fi))}${peKv('IPO', esc(x.ipo))}${peKv('딜 현황', esc(x.deal))}${peKv('출처', peLines(x.src))}${peKv('처음 본 날', esc(x.first))}`;
  const links = [peA(`https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(x.name)}`, 'DART 검색'),
    /^\d{6}$/.test(p.code) ? peA(`https://finance.naver.com/item/main.naver?code=${encodeURIComponent(p.code)}`, '모회사 네이버 금융') : '',
    /^\d{6}$/.test(p.code) && peDlOk() ? `<span class="pe-dl" data-pe-dls="${esc(p.code)}">${peDlLink(p.code)}</span>` : ''].join('');
  const par = `${peKv('회사', p.name ? peNm(p.name) : '')}${peKv('종목코드', esc(p.code))}${peKv('시총', p.mcap != null ? peEok(p.mcap) : '')}${peKv('지분율', p.pct != null ? pePct(p.pct) : '')}
    ${peKv('기업집단', esc(x.bigGroup))}<div class="ipo-links">${links}</div>`;
  // 신호는 최근 PE_SIG_N건만 보이고 나머지는 '나머지 n건 보기'로 펼친다(뉴스가 수십 건인 회사가 있다)
  const more = x.signals.length - PE_SIG_N;
  const sigs = x.signals.length ? `<table class="ipo-tbl pe-tbl-s"><thead><tr><th>날짜</th><th>종류</th><th>내용</th></tr></thead><tbody>${x.signals.map((s, i) => `<tr${i >= PE_SIG_N ? ' class="pe-more"' : ''}>
    <td>${esc(s.date) || '–'}</td><td>${esc(s.type) || '–'}</td><td>${s.url ? `<a class="rd-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.text || s.type)}</a>` : esc(s.text)}</td></tr>`).join('')}</tbody></table>${more > 0 ? `<button type="button" class="btn sm pe-morebtn" data-pe-more>나머지 ${more}건 보기</button>` : ''}` : PE_NONE;
  const news = x.news.length ? `<table class="ipo-tbl rd-tbl-n"><thead><tr><th>날짜</th><th>기사</th><th>매체</th></tr></thead><tbody>${x.news.map((n) => `<tr>
    <td>${esc(n.date) || '–'}</td><td>${n.url ? `<a class="rd-link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</td><td>${esc(n.src)}</td></tr>`).join('')}</tbody></table>` : PE_NONE;
  return `<div class="ipo-detail">${peDhead(x, x.biz)}
    <div class="ipo-pane"><div class="ipo-stack">${fqBox(x.key, x, '중복상장')}
      <div class="ipo-two-col">
        <div class="ipo-stack">${peBox('딜 현황', deal)}</div>
        <div class="ipo-stack">${peBox('모회사', par)}${peFinBox(x.fin, '', x.finSrc)}</div>
      </div>
      ${peBox('신호', sigs, x.signals.length ? `${x.signals.length}건` : '', 'pe-sigbox')}
      ${peBox('관련 기사', news, x.news.length ? `${x.news.length}건` : '')}
    </div></div>
  </div>`;
}

/* ---------- 요약 줄·묶음·필터 ---------- */
function peSummary() {
  const d = peS.data; if (!d) return '';
  const g = d.generated ? new Date(d.generated) : null, t = peTime(d.generated);
  const all = peS.grp === 'heir' ? d.heir.items : peDupBase(), it = peVis(all), n = (f) => it.filter(f).length;
  const done = n((x) => peSt(x.key) !== '미접촉');
  const pg = d.heir.progress;
  const parts = peS.grp === 'heir'
    ? [pg.universe != null && pg.parsed != null ? `<span>감사보고서 ${peFmt(pg.parsed, 0)}/${peFmt(pg.universe, 0)}곳 확인</span>` : '', `<span>통과 <b>${n((x) => x.pass)}</b></span>`, `<span>근접 <b>${n((x) => !x.pass)}</b></span>`]
    : [`<span>${it.length}곳</span>`, `<span>살아 있는 딜 <b>${n((x) => x.sg !== 'end')}</b></span>`, `<span>실제 매물 <b>${n((x) => x.sg === 'sale')}</b></span>`,
      peS.dup.big ? '' : `<span>대기업집단 제외 <b>${d.dup.items.length - all.length}</b></span>`];
  // ok로 시작하지 않는 출처만 이름으로(값은 마우스를 올리면)
  const bad = Object.entries(d.sources).filter(([, v]) => !/^ok/i.test(peStr(v))).map(([k, v]) => `<span class="ipo-stale" title="${esc(peStr(v))}">${esc(k)} 확인 필요</span>`);
  return `${t ? `<span class="${g && Date.now() - g > 36 * 3600000 ? 'ipo-stale' : ''}">${t} 수집</span>` : ''}${parts.join('')}<span>팀 리스트 <b>${n((x) => x.team)}</b></span><span>컨택 <b>${done}</b></span>${bad.join('')}`;
}

const peSeg = (attr, opts, cur, cls = 'seg') => `<div class="${cls}">${opts.map(([k, l]) => `<button type="button" data-${attr}="${esc(k)}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('')}</div>`;
function peGrpHtml() {
  const d = peS.data;
  return `<div class="seg" role="tablist">${PE_GRPS.map(([k, l]) => `<button type="button" role="tab" data-pe-g="${k}" class="${peS.grp === k ? 'on' : ''}" aria-selected="${peS.grp === k}">${l}${d ? `<span class="pe-gn">${peVis(k === 'heir' ? d.heir.items : peDupBase()).length}</span>` : ''}</button>`).join('')}</div>`;
}

function peFilterHtml() {
  const g = peS.grp, s = peS[g];
  const search = (ph) => `<div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="pe-q" type="search" placeholder="${ph}" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>`;
  const sel = (opts) => `<select class="select" id="pe-sort" aria-label="정렬">${opts.map(([k, l]) => `<option value="${k}"${s.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const tg = (k, l) => `<button type="button" data-pe-tg="${k}" class="${s[k] ? 'on' : ''}" aria-pressed="${!!s[k]}">${l}</button>`;
  if (g === 'heir') {
    if (typeof FF_RG === 'object') FF_RG['pe-heir'] = { st: () => peS.heir, apply: () => peDraw(), spN: () => (peS.data ? peS.data.heir.items.filter((x) => (s.f === 'all' || (s.f === 'pass') === x.pass) && peSp(x).sp).length : null) }; // 수는 통과·근접 고른 범위 안
    const sp = typeof ffRangeHtml === 'function' ? ffRangeHtml('pe-heir', 'sp', '테마') : '';
    return `<div class="ipo-filter">${search('회사·업종·대표·주주 검색')}${peSeg('pe-f', PE_HF, s.f)}${sel(PE_HSORT)}</div>
      <div class="ipo-filter rd-finf">${sp}<div class="rd-fing"><span class="rd-finl">최근 매출</span>${peSeg('pe-rev', PE_REV, s.rev)}</div>
        <div class="rd-fing"><span class="rd-finl">영업이익률</span>${peSeg('pe-opm', PE_OPM, s.opm)}</div>
        <div class="rd-fing"><span class="rd-finl">조건</span><div class="seg">${tg('old', `업력 ${PE_OLD}년+`)}${tg('team', '팀 리스트만')}</div></div></div>`;
  }
  return `<div class="ipo-filter">${search('회사·모회사·사업·FI 검색')}${peSeg('pe-f', PE_DF, s.f)}<div class="seg">${tg('team', '팀 리스트만')}${tg('big', '대기업집단 포함')}</div>${sel(PE_DSORT)}</div>`;
}

/* ---------- 그리기 ---------- */
function peLists() {
  const heir = peS.grp === 'heir', row = (x) => (heir ? peHeirRow(x) : peDupRow(x));
  const [keep, skip] = peFv(heir ? peHeirList() : peDupList()), list = peSink(keep);
  const li = list.findIndex((x) => x.low), main = li < 0 ? list : list.slice(0, li), low = li < 0 ? [] : list.slice(li);
  return { heir, row, list, main, low, skip };
}
function peBody() {
  if (!peS.data) return '<div class="empty">아직 수집된 PE 앵글 자료가 없습니다.</div>';
  const { heir, row, list, main, low, skip } = peLists();
  if (!list.length && !skip.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  // 위 목록은 100건씩(더 보기 누를 때마다 100건을 아래에 붙임, 다시 그리지 않음). 컨택한 곳·관심 없음 묶음은 그대로 아래에. 보기 링크로 온 회사가 뒤쪽이면 그 회사까지
  return (heir ? PE_HEIR_HEAD : PE_DUP_HEAD) + moreList(`pe-${peS.grp}`, main, row, { sig: peSig(), focus: peS.focus != null ? (x) => x.id === peS.focus : null })
    + low.map((x) => (x.low ? peLowRow(x) : row(x))).join('') + (skip.length ? fvSkipTail(skip, `pe-${peS.grp}`, row) : '');
}
// 더 보기(app.js moreList)의 조건(그룹·검색어·필터·정렬). 조건이 바뀌면 다시 100건부터
const peSig = () => { const s = peS[peS.grp]; return JSON.stringify([peS.grp, ...PE_VIEW[peS.grp].map((k) => s[k]), !!s.old, !!s.team, !!s.big]); };
const peRowEl = (root, id) => [...root.querySelectorAll('.ipo-row[data-id]')].find((r) => r.dataset.id === id);
const peRowHtml = (x) => (x.id.startsWith('heir:') ? peHeirRow(x) : peDupRow(x));

/* 다시 그릴 때 쓰고 있던 메모 칸을 지킨다(radar.js rdKeepNote·rdKeepBack과 같다). 그 행이 빠져 되살릴 칸이 없으면 쓰던 메모를 저장한다.
   다시 그리는 동안(peDrawing) 빠지는 칸의 change·focusout으로는 저장하지 않는다. 한글 조합 중이면 다시 그리기를 조합이 끝난 뒤로 미룬다 */
let peDrawing = false;
const peIme = { el: null, todo: new Map() };
function peImeWait(scope, key, fn) {
  const el = peIme.el;
  if (!el || !el.isConnected || document.activeElement !== el || !scope.contains(el)) return false;
  peIme.todo.set(key, fn);
  return true;
}
function peImeDone() {
  peIme.el = null;
  setTimeout(() => { if (peIme.el) return; const todo = [...peIme.todo.values()]; peIme.todo.clear(); todo.forEach((f) => f()); });
}
function peKeepNote(scope) {
  const ae = document.activeElement;
  return ae && ae.matches && ae.matches('[data-pe-note]') && scope.contains(ae) ? { id: ae.closest('.ipo-row')?.dataset.id, v: ae.value, a: ae.selectionStart, z: ae.selectionEnd } : null;
}
function peKeepBack(keep) {
  if (!keep || keep.id == null) return;
  const i = peRowEl(peS.host, keep.id)?.querySelector('[data-pe-note]');
  if (!i) { peSetNote(keep.id, keep.v); return; }
  i.value = keep.v; i.focus({ preventScroll: true });
  try { i.setSelectionRange(keep.a, keep.z); } catch { /* 커서 위치는 못 지켜도 됨 */ }
}

// 펼친 행을 보여 줄 때: 보이는 높이(스크롤 칸 − 폰 아래 탭 막대)에 다 들어가면 가운데, 길면 머리 줄이 맨 위(8 띄움) — radar.js rdReveal과 같다
function peReveal(r) {
  const sc = r.closest('.scroll');
  if (!sc) { r.scrollIntoView({ block: r.offsetHeight <= innerHeight ? 'center' : 'start' }); return; }
  const tb = document.querySelector('.tabbar'), vis = sc.clientHeight - (tb ? tb.offsetHeight : 0), h = r.offsetHeight;
  const top = r.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  sc.scrollTop = h <= vis ? top - (vis - h) / 2 : top - 8;
}

/* 행을 갈아 끼울 때 보던 자리를 지킨다(.ipo-page는 브라우저 스크롤 고정을 꺼 두었다) — radar.js rdHold와 같은 방식:
   기준 행(key 행이 보이면 그 행, 아니면 머리가 화면 안에 있는 맨 위 행) 바로 위 끝이 움직인 만큼 .scroll을 되돌린다 */
function peHold(b, key, fn) {
  const sc = b && b.closest('.scroll'); if (!sc) return fn();
  const tb = document.querySelector('.tabbar'), t = sc.getBoundingClientRect().top, e = t + sc.clientHeight - (tb ? tb.offsetHeight : 0);
  const rows = [...b.querySelectorAll('.ipo-row[data-id]')], at = (r) => r.getBoundingClientRect(), k = key == null ? null : rows.find((r) => r.dataset.id === key);
  const pin = (k && at(k).bottom > t && at(k).top < e ? k : null) || rows.find((r) => at(r).top >= t && at(r).top < e) || rows.find((r) => at(r).top < t && at(r).bottom > t);
  if (!pin) return fn();
  const up = (r) => { let p = r.previousElementSibling; while (p && !p.getClientRects().length) p = p.previousElementSibling;
    return p ? at(p).bottom + (parseFloat(getComputedStyle(p).marginBottom) || 0) : at(r).top - (parseFloat(getComputedStyle(r).marginTop) || 0); };
  const id = pin.dataset.id, y0 = up(pin), out = fn();
  const now = [...b.querySelectorAll('.ipo-row[data-id]')].find((r) => r.dataset.id === id), dy = now ? up(now) - y0 : 0;
  if (Math.abs(dy) >= 0.5) sc.scrollTop += dy;
  return out;
}

function peSumDraw() {
  const h = peS.host; if (!h || !h.isConnected) return;
  const sum = h.querySelector('#pe-sum'); if (sum) sum.innerHTML = peSummary();
  const gr = h.querySelector('#pe-grp'); if (gr) gr.innerHTML = peGrpHtml();
}

function peDraw() {
  const host = peS.host; if (!host || !host.isConnected) return;
  const b = host.querySelector('#pe-body'); if (!b) return;
  if (peImeWait(b, 'draw', peDraw)) return;
  const fx = peS.focus != null ? peFind(peS.focus) : null;
  if (fx?.bigGroup && !peS.dup.big) { peS.dup.big = true; if (peS.grp === 'dup') host.querySelector('#pe-filter').innerHTML = peFilterHtml(); }
  const keep = peKeepNote(b);
  peDrawing = true;
  try { b.innerHTML = peBody(); } finally { peDrawing = false; }
  const sg = host.querySelector('.ff-rg[data-ff-k="sp"]'); // 테마 단추 옆 수: 자료를 읽은 뒤, 통과·근접을 바꾼 뒤
  if (sg && peS.grp === 'heir' && typeof ffRangeHtml === 'function') { const h = ffRangeHtml('pe-heir', 'sp', '테마'); if (sg.outerHTML !== h) sg.outerHTML = h; }
  peSumDraw();
  peKeepBack(keep);
  peViewSave();
  if (peS.focus != null) {
    const r = peRowEl(b, peS.focus);
    peS.focus = null;
    if (r) peReveal(r);
  }
}

function peRefreshRow(id) {
  const x = peFind(id), b = peS.host?.querySelector('#pe-body'), r = b && peRowEl(b, id);
  if (!x || !r) return;
  if (peImeWait(r, `row:${id}`, () => peRefreshRow(id))) return;
  const keep = peKeepNote(r), fk = keep ? null : peFocusKey(r);
  peDrawing = true;
  try { peHold(b, id, () => { r.outerHTML = peRowHtml(x); }); } finally { peDrawing = false; }
  peKeepBack(keep);
  peFocusBack(peRowEl(b, id), fk);
}

/* 행을 갈아 끼우기 전 포커스 자리(태그와 data-* 이름, 없으면 class, 같은 것 중 몇 번째)를 적어 두고 새 행에서 같은 자리로 되돌린다(radar.js rdFocusKey와 같다) */
const PE_FK_STATE = new Set(['on', 'open', 'sel']);
function peFocusKey(box) {
  const a = document.activeElement; if (!a || !box || !box.contains(a)) return null;
  if (a === box) return { self: true };
  const d = [...a.attributes].filter((t) => t.name.startsWith('data-')).map((t) => `[${t.name}]`).join('');
  const sel = a.tagName.toLowerCase() + (d || [...a.classList].filter((c) => !PE_FK_STATE.has(c)).map((c) => `.${CSS.escape(c)}`).join(''));
  return { sel, n: [...box.querySelectorAll(sel)].indexOf(a) };
}
function peFocusBack(box, k) {
  if (!k || !box || !box.isConnected) return;
  const all = k.self ? [box] : box.querySelectorAll(k.sel), el = all[k.self ? 0 : k.n] || all[0];
  if (el && document.activeElement !== el) el.focus({ preventScroll: true });
}

// 접은 행이 상태 때문에 다른 묶음(컨택한 곳 ↔ 위 목록)으로 가야 하면 목록을 다시 그리고, 그 행 바로 다음 행이 그 자리에 오게 한다
function peFold(r, x) {
  if (r.closest('.fv-skiprows')) { peRefreshRow(x.id); return; } // 관심 없음 묶음 안에서는 상태와 관계없이 제자리
  const b = r.parentElement, low = b.querySelector('.rd-low');
  const inLow = !!low && !!(low.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (peLowSt(peSt(x.key)) === inLow) { peRefreshRow(x.id); return; }
  const sc = r.closest('.scroll');
  let nx = r.nextElementSibling; while (nx && !nx.matches('.ipo-row[data-id]')) nx = nx.nextElementSibling;
  const y0 = r.getBoundingClientRect().top - (parseFloat(getComputedStyle(r).marginTop) || 0), nid = nx?.dataset.id, fk = peFocusKey(r); // 펼친 행 위 여백까지
  peDraw();
  const n = nid != null && peRowEl(b, nid);
  if (sc && n) { const dy = n.getBoundingClientRect().top - y0; if (Math.abs(dy) >= 0.5) sc.scrollTop += dy; }
  peFocusBack(peRowEl(b, x.id), fk);
}

// 펼친 행의 파이프라인 버튼만 다시 그린다(행을 통째로 다시 그리면 그사이 치던 메모가 사라진다). id가 없으면 펼친 행 전부
function pePipeDraw(id) {
  if (!peS.host || !peS.host.isConnected) return;
  peS.host.querySelectorAll('#pe-body .ipo-row.open[data-id]').forEach((r) => {
    if (id != null && r.dataset.id !== id) return;
    const x = peFind(r.dataset.id), p = r.querySelector('.ipo-dhead > .rd-pipe');
    if (!x || !p) return;
    const t = document.createElement('template'); t.innerHTML = pePipe(x).trim();
    const n = t.content.firstElementChild;
    if (n && !n.isEqualNode(p)) p.replaceWith(n);
  });
}

// 상폐 위험·CB 자료를 다 읽은 뒤 펼친 중복상장 행의 링크 자리만 채운다
function peDlDraw() {
  peS.host?.querySelectorAll('[data-pe-dls]').forEach((el) => { const h = peDlLink(el.dataset.peDls); if (el.innerHTML !== h) el.innerHTML = h; });
}

async function pePipeAdd(btn) {
  const x = peFind(btn.closest('.ipo-row')?.dataset.id);
  if (!x || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  try { await pipeAdd({ src: pePipeSrc(x.key), ref: x.key, name: x.name }); }
  catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  pePipeDraw(x.id);
}

// 묶음을 바꾸면 필터 줄도 그 묶음 것으로 바꾼다
function peGrpSet(g) {
  if (peS.grp === g || !peS.host) return;
  peS.grp = g;
  const root = peS.host.querySelector('#pe-root');
  root.classList.toggle('pe-heir', g === 'heir'); root.classList.toggle('pe-dup', g === 'dup');
  root.querySelector('#pe-filter').innerHTML = peFilterHtml();
  peDraw();
}

function peBind(root) {
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  root.addEventListener('click', (ev) => {
    const t = ev.target, s = peS[peS.grp];
    const gb = t.closest('[data-pe-g]'); if (gb) { peGrpSet(gb.dataset.peG); return; }
    const fb = t.closest('[data-pe-f]'); if (fb) { s.f = fb.dataset.peF; segOn('[data-pe-f]', fb); peDraw(); return; }
    const rb = t.closest('[data-pe-rev]'); if (rb) { s.rev = rb.dataset.peRev; segOn('[data-pe-rev]', rb); peDraw(); return; }
    const ob = t.closest('[data-pe-opm]'); if (ob) { s.opm = ob.dataset.peOpm; segOn('[data-pe-opm]', ob); peDraw(); return; }
    const tb = t.closest('[data-pe-tg]');
    if (tb) { const k = tb.dataset.peTg; s[k] = !s[k]; tb.classList.toggle('on', s[k]); tb.setAttribute('aria-pressed', s[k]); peDraw(); return; }
    if (t.closest('#pe-ref')) {
      peLoad(true).then(peDraw).catch((e) => toast(e.message));
      if (typeof pipeLoad === 'function') pipeLoad(true).then(() => pePipeDraw()).catch(() => {}); // 다른 분이 그사이 올린 딜도 '있음'으로
      return;
    }
    const sb = t.closest('[data-pe-st]'); if (sb) { peSetStatus(sb.closest('.ipo-row').dataset.id, sb.dataset.peSt); return; }
    const pb = t.closest('[data-pe-pipe]'); if (pb) { pePipeAdd(pb); return; }
    // 이동은 링크(#deals/delist)가 한다. 그 전에 상폐 위험·CB 탭이 필터를 풀고 그 회사를 펼쳐 두게
    const mb = t.closest('[data-pe-more]'); if (mb) { mb.closest('.pe-sigbox')?.classList.add('pe-all'); mb.remove(); return; }
    const dl = t.closest('[data-pe-dl]'); if (dl) { if (typeof delistFocus === 'function') delistFocus(`delist:${dl.dataset.peDl}`); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]');
    if (row) {
      const id = row.dataset.id, x = peFind(id), was = s.open.has(id);
      if (was) s.open.delete(id); else s.open.add(id);
      peViewSave();
      if (was && x) peFold(row, x); else peRefreshRow(id);
    }
  });
  // 검색: 150ms 모아서 한 번 그린다. 한글 조합 중에는 미루고 조합이 끝나면 그린다
  let qT = 0;
  const qSoon = (el) => { clearTimeout(qT); qT = setTimeout(() => { if (!el.isConnected) return; peS[peS.grp].q = el.value; peDraw(); }, 150); };
  root.addEventListener('input', (ev) => { if (ev.target.id === 'pe-q' && !ev.isComposing) qSoon(ev.target); });
  root.addEventListener('compositionend', (ev) => { if (ev.target.id === 'pe-q') qSoon(ev.target); });
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'pe-sort') { peS[peS.grp].sort = t.value; peDraw(); }
    if (t.matches('[data-pe-note]') && !peDrawing) peSetNote(t.closest('.ipo-row').dataset.id, t.value);
  });
  // 메모를 쓰다가 칸이 다시 그려졌으면 change가 안 올 수 있어 칸을 떠날 때도 저장한다
  root.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!t.matches || !t.matches('[data-pe-note]') || !t.isConnected) return;
    if (peIme.el === t) peImeDone();
    if (!peDrawing) peSetNote(t.closest('.ipo-row').dataset.id, t.value);
    if (peS.field === t) peS.field = null;
  });
  root.addEventListener('focusin', (ev) => { if (ev.target.matches?.('[data-pe-note]')) peS.field = ev.target; });
  root.addEventListener('compositionstart', (ev) => { if (ev.target.matches?.('[data-pe-note]')) peIme.el = ev.target; });
  root.addEventListener('compositionend', (ev) => { if (peIme.el === ev.target) peImeDone(); });
}

// 메모 칸을 떠나지 않은 채 다른 화면으로 옮기거나 앱을 내릴 때도 쓰던 메모를 저장한다(radar.js rdFlush와 같다)
function peFlush(leave) {
  const el = peS.field; if (!el) return;
  if (leave || !el.isConnected) peS.field = null;
  const id = el.closest('.ipo-row')?.dataset.id;
  if (id != null) peSetNote(id, el.value);
}
window.addEventListener('hashchange', () => peFlush(true));
// 관심 없음을 켜고 끄거나 처음 읽었을 때: 이 화면이 열려 있으면 보던 자리를 지킨 채 목록을 다시 그린다
window.addEventListener('fv-change', () => {
  const b = peS.host?.isConnected && peS.data && peS.host.querySelector('#pe-body');
  if (b) peHold(b, null, peDraw);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) peFlush(false); });
window.addEventListener('beforeunload', (e) => { peFlush(false); if (peS.dirty.size) { e.preventDefault(); e.returnValue = ''; } });

async function renderPe(host) {
  peS.host = host;
  peIme.el = null; peIme.todo.clear();
  host.innerHTML = `<div class="ipo-page rd-page pe-page pe-${peS.grp}" id="pe-root">
    <div class="pe-grp" id="pe-grp">${peGrpHtml()}</div>
    <div class="ipo-top"><div class="ipo-sumrow" id="pe-sum"></div>
      ${infoBtn('deals/pe')}
      <button class="btn ghost" type="button" id="pe-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div id="pe-filter">${peFilterHtml()}</div>
      <div class="ipo-body" id="pe-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  peBind(host.querySelector('#pe-root'));
  try { await peLoad(); }
  catch (e) {
    const b = peS.host === host && host.querySelector('#pe-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (peS.host === host && host.isConnected) peDraw();
  // '파이프라인에 있음' 표시가 처음부터 맞게 미리 읽고, 다 읽으면 펼친 행의 버튼만 다시 그림
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (peS.host === host) pePipeDraw(); }).catch(() => {});
  if (peDlOk()) dlLoad().then(() => { if (peS.host === host) peDlDraw(); }).catch(() => {});
}

/* 다른 화면(파이프라인 등)에서 ref('pe:heir:<corp_code>' · 'pe:dup:<이름>')로 한 회사를 펼쳐 보여 줄 때: 탭 열기 전에 부르고 돌려준 주소로 이동 */
function peFocus(ref) {
  const m = /^pe:(heir|dup):(.+)$/.exec(String(ref || ''));
  if (!m) return '';
  const g = m[1], s = peS[g], id = `${g}:${m[2]}`;
  peS.grp = g; s.q = ''; s.team = false; s.f = 'all';
  if (g === 'heir') { s.rev = ''; s.opm = ''; s.old = false; s.sp = ''; }
  s.open.add(id); peS.focus = id;
  if (typeof fvSkip === 'function' && fvSkip(String(ref))) viewSet(`fv.sk.pe-${g}`, true); // 관심 없음 회사면 맨 아래 묶음을 펼쳐 둔다
  peViewSave();
  return '#deals/pe';
}

/* ---------- 화면 설명(ⓘ) — 업무 맥락은 05. 딜소싱\딜소싱 실무 노트.md 7장, 기준 값은 pe.json rules에서 읽는다 ---------- */
function peInfo(d) {
  const r = d?.heir.rules, dr = d?.dup.rules, pd = d?.heir.progress.perDay;
  const v = (x, u, def) => (x != null ? `${peFmt(x)}${u}` : def);
  return {
    title: '오너기업, 중복상장',
    asof: `${d?.heir.asof ? `기준일 ${d.heir.asof}` : '기준일 –'} · 출처 팀 엑셀 '0.PE(상속이슈기업)'·'0.PE(중복상장)' 시트, DART 감사보고서·타법인출자, KIND, 뉴스 · 업무 맥락은 딜소싱 실무 노트 7장`,
    rows: [
      ['무엇인가', [
        `오너기업: 감사보고서를 내는 비상장 회사 중 창업자·가족이 대부분을 가진 곳입니다. 매출 ${v(r?.rev, '억', '200억')}·영업이익 ${v(r?.op, '억', '20억')} 이상, 개인 주주 지분 ${v(r?.owner, '%', '50%')} 이상, 외부 FI 없음을 모두 넘으면 통과, 일부에 걸리면 근접입니다.`,
        `중복상장: 상장 모회사가 ${v(dr?.pct, '%', '20%')} 이상 가진 비상장 자회사 중 중복상장 규제로 IPO가 막혔거나 FI 회수 압력 신호가 있는 곳입니다.`,
        '팀 엑셀 두 시트에 있던 회사는 회사 이름 옆에 팀 리스트로 표시합니다.',
      ]],
      ['왜 보나', [
        '오너기업: 승계 시점이 온 회사의 경영권 딜이 처음 생각이었고, 실제로는 소수지분 성장투자로 먼저 들어가는 쪽입니다. 팀 콜드메일도 성장 자금을 보태는 협업과 티타임 제안이었습니다.',
        '중복상장: 프리IPO로 들어온 FI가 IPO로 회수하지 못해 회수 압력이 생깁니다. FI 구주 세컨더리, 모회사 지분 인수, 모회사 CB 투자 뒤 FI 구주 매입으로 들어갈 수 있습니다.',
      ]],
      ['어떻게 보나', [
        `오너기업 감사보고서는 하루 ${v(pd, '곳', '1,500곳')}씩 나눠 읽습니다. 요약 줄의 '감사보고서 n/n곳 확인'이 진행도입니다.`,
        `오너기업 필터는 통과·근접·전체, 최근 매출, 영업이익률, 업력 ${PE_OLD}년 이상, 팀 리스트만입니다. 최근 매출은 바이아웃(200~700억)과 소수지분 성장투자(300~3,000억) 규모로 나눠 봅니다. 업종과 이익률로 미리 빼 둔 회사는 없습니다.`,
        '오너기업 점수는 100점 만점입니다. 매출 성장 25, 영업이익률 25, 매출 규모 15, 무차입·순현금 15, 업력 10, 승계 신호 10입니다. 승계 신호는 최대주주와 성이 같은 개인 주주가 2명 이상이거나, 대표 중에 최대주주는 없고 성이 같은 사람이 있는 경우(2세 경영 추정)입니다. 정렬은 점수·매출·영업이익률·업력입니다.',
        '중복상장 필터는 딜 상태(기본은 해소·매각 완료를 뺀 살아 있는 딜), 팀 리스트만, 대기업집단 포함입니다. 공시대상기업집단 소속 자회사는 팀 기준상 제외 대상이라 대기업집단 포함을 켜야 보입니다. 정렬은 최근 신호·모회사 시총·매출입니다.',
        '중복상장 모회사가 상폐 위험·CB 목록에 있으면 펼친 행에 그 탭으로 가는 링크가 붙습니다.',
        '연락함, 미팅, 보류로 바꾼 회사는 행을 접으면 목록 맨 아래 컨택한 곳으로 내려갑니다. 검토 완료는 제자리에서 진한 회색으로 보이고, 한 번 더 누르면 풀립니다.',
        '자료는 매일 10:00에 새로 받습니다.',
      ]],
      ['그래서 할 일', [
        '오너기업: 펼쳐서 재무·주주·차입을 보고, 볼 곳은 팩트시트를 만든 뒤 대표 앞 콜드메일·전화로 티타임을 잡습니다.',
        '중복상장: FI 이름과 IPO가 막힌 사유를 보고 FI 구주 또는 모회사 쪽 컨택 경로를 찾습니다.',
        '연락하면 상태와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
      ]],
    ],
  };
}
TAB_INFO['deals/pe'] = peInfo(null);
