/* UNIVERSE WORKS — 딜소싱 › 타깃 › 소비재(#deals/cons)·딥테크(#deals/deep) 두 화면 (2026-11-16 사용자 요청)
   소비재: 화장품·향수·탈취제·방향제 같은 소비재 회사(영업이익 20～30억 이상). 딥테크: 젊은 창업자가 세운 반도체·우주항공 등 딥테크 스타트업(시리즈 B 이상).
   딜레이더가 회사 OneDrive SPACE WORKS/data/consumer.json·deeptech.json 을 올린다(이 화면은 읽기만, 형식은 딜레이더 CONTRACT_tgt.md · 메인 세션 tgt_contract.md).
   컨택 상태·메모는 다른 딜소싱 화면과 같은 data/radar_marks.json(key = item.id 'cons:…'·'deep:…', tab = cons·deep). 저장·합치기는 pe.js 와 같은 방식.
   진입: renderCons(host)·renderDeep(host) — host 안에만 그린다. 다른 화면에서 한 회사를 펼쳐 열 때: tgtFocus(ref)가 돌려준 주소로 이동.
   app.js 전역($, esc, pad, ymd, yymd, today, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn, G)과 graph.js 의 STORE,
   ipo.css(목록·펼친 행·상자)·radar.css(.rd-page 배치·필터·컨택)·pe.css(.pe-mg·.pe-fin·.pe-finm·.pe-ds·.pe-up·.pe-dn) 클래스를 쓴다.
   팩트시트는 fsq.js 의 fqHead·fqBox(키 = item.id), 파이프라인은 pipeline.js 의 pipeAdd·pipeHas·pipeLoad(있을 때만 버튼이 보인다). */

const TG_TTL = 5 * 60000;
const TG_STATUS = ['미접촉', '연락함', '미팅', '보류', '검토 완료']; // radar.js RD_STATUS와 같은 값·순서(같은 파일을 쓴다)
// 화면별 설정: 자료 파일, 화면 이름(= 파이프라인 출처·PP_TABS 이름), 기준일이 며칠 넘게 지나면 빨간 글씨인지
const TG_CFG = {
  cons: { file: 'data/consumer.json', title: '소비재', stale: 2 },
  deep: { file: 'data/deeptech.json', title: '딥테크', stale: 8 },
};
const TG_OP = [['', '전체'], ['20', '20억+'], ['30', '30억+'], ['50', '50억+']];
const TG_LST = [['', '전체'], ['private', '비상장'], ['listed', '상장']];
const TG_CSORT = [['op', '영업이익순'], ['rev', '매출순'], ['opm', 'OPM순'], ['cagr', '성장률순']];
const TG_DSORT = [['inv', '누적 투자순'], ['round', '최근 라운드순'], ['age', '창업자 나이순']];
const TG_LATE = 3; // '시리즈C 이상' = 단계 순위 3 이상(tgStageN)

// 새로 고친 뒤에도 보던 분류·검색어·필터·정렬·펼친 행을 이어 보게 창마다 기억한다(app.js viewGet·viewSet, 키 tg.cons·tg.deep)
function tgView(k, s) {
  const v = viewGet(`tg.${k}`, null) || {};
  ['q', 'cat', 'op', 'lst', 'sort'].forEach((f) => { if (f in s && typeof v[f] === 'string') s[f] = v[f]; });
  ['young', 'late', 'fi'].forEach((f) => { if (f in s && typeof v[f] === 'boolean') s[f] = v[f]; });
  if ('op' in s && !TG_OP.some(([x]) => x === s.op)) s.op = '';
  if ('lst' in s && !TG_LST.some(([x]) => x === s.lst)) s.lst = '';
  if (!(k === 'cons' ? TG_CSORT : TG_DSORT).some(([x]) => x === s.sort)) s.sort = k === 'cons' ? 'op' : 'inv';
  s.open = new Set(Array.isArray(v.open) ? v.open : []);
  return s;
}
const tgS = {
  k: 'cons', host: null, focus: null, field: null,
  marks: { items: [], version: null }, dirty: new Map(), saving: Promise.resolve(),
  cons: { data: null, err: '', at: 0, loading: null, v: tgView('cons', { q: '', cat: '', op: '', lst: '', fi: false, sort: 'op', open: new Set() }) },
  deep: { data: null, err: '', at: 0, loading: null, v: tgView('deep', { q: '', cat: '', young: false, late: false, sort: 'inv', open: new Set() }) },
};
function tgViewSave(k = tgS.k) {
  const s = tgS[k].v;
  viewSet(`tg.${k}`, { ...Object.fromEntries(Object.entries(s).filter(([f]) => f !== 'open')), open: [...s.open] });
}

/* ---------- 데이터 ---------- */
const tgStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const tgNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tgObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const tgArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const tgList = (v) => (Array.isArray(v) ? v : []).map(tgStr).filter(Boolean);
const tgDay = (v) => { const s = tgStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const tgYm = (v) => { const s = tgStr(v); return /^\d{4}-\d{2}(-\d{2})?/.exec(s)?.[0] || ''; }; // 라운드 시기는 YYYY-MM도 된다
const tgHttp = (v) => { const s = tgStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const tgHolder = (h) => ({ name: tgStr(h.name), pct: tgNum(h.pct), kind: tgStr(h.kind) });
const tgFin = (a) => tgArr(a).filter((f) => tgNum(f.y) != null).map((f) => ({ y: f.y, rev: tgNum(f.rev), op: tgNum(f.op), ni: tgNum(f.ni) })).sort((a, b) => a.y - b.y).slice(-3);

// 투자 단계 순위: 시드 0, 프리A 0.5, 시리즈A 1, B 2, C 3 …, 프리IPO·상장 9. 모르면 null
function tgStageN(s) {
  const t = tgStr(s).replace(/\s/g, '').toUpperCase();
  if (!t) return null;
  if (/IPO|상장/.test(t)) return 9;
  const m = /(?:시리즈|SERIES)([A-Z])/.exec(t);
  if (m) return m[1].charCodeAt(0) - 64;
  if (/프리A|PRE-?A/.test(t)) return 0.5;
  if (/시드|SEED|엔젤/.test(t)) return 0;
  return null;
}

function tgNorm(k, raw) {
  const pre = `${k}:`, seen = new Set(), pg = raw.progress && typeof raw.progress === 'object' ? tgObj(raw.progress) : null;
  const ay = +tgDay(raw.asof).slice(0, 4) || new Date().getFullYear();
  const items = tgArr(raw.items).map((x, i) => {
    const id = tgStr(x.id), name = tgStr(x.name);
    if (!id.startsWith(pre) || id.length <= pre.length || !name || seen.has(id)) return null;
    seen.add(id);
    const fin = tgFin(x.fin), last = [...fin].reverse().find((f) => f.rev != null || f.op != null) || null;
    const fd = tgObj(x.founder), lr = tgObj(x.last_round), born = tgNum(fd.born);
    const o = {
      id, name, idx: i, brand: tgStr(x.brand), code: tgStr(x.corp_code), listed: tgStr(x.listed), cat: tgStr(x.cat),
      tags: [...new Set([tgStr(x.cat), ...tgList(x.tags)].filter(Boolean))], invSum: tgStr(x.inv_summary),
      rounds: tgArr(x.rounds).map((r) => ({ date: tgYm(r.date) || tgStr(r.date), round: tgStr(r.round), amount: tgStr(r.amount), investors: tgStr(r.investors), src: tgStr(r.source) }))
        .filter((r) => r.date || r.round || r.amount || r.investors),
      ceo: tgStr(x.ceo), est: tgDay(x.est), years: tgNum(x.years), region: tgStr(x.region), induty: tgStr(x.induty), home: tgHttp(x.home),
      fin, last, fs: tgStr(x.fs), finSrc: tgStr(x.fin_src),
      rev: tgNum(x.rev) ?? last?.rev ?? null, op: tgNum(x.op) ?? last?.op ?? null, opm: tgNum(x.opm), cagr: tgNum(x.cagr),
      holders: tgArr(x.holders).map(tgHolder).filter((h) => h.name).slice(0, 5), top: tgStr(x.top?.name) ? tgHolder(x.top) : null,
      founder: tgStr(fd.name) || born != null || tgNum(fd.age) != null || tgStr(fd.bg) ? { name: tgStr(fd.name), born, age: tgNum(fd.age) ?? (born != null ? ay - born : null), bg: tgStr(fd.bg) } : null,
      young: x.young === true ? true : x.young === false ? false : null,
      stage: tgStr(x.stage), inv: tgNum(x.total_inv), investors: tgList(x.investors), valuation: tgStr(x.valuation), tech: tgStr(x.tech),
      round: tgYm(lr.date) || tgStr(lr.round) || tgStr(lr.amount) ? { date: tgYm(lr.date), round: tgStr(lr.round), amount: tgStr(lr.amount), investors: tgStr(lr.investors) } : null,
      why: tgStr(x.why), flags: tgList(x.flags), src: tgList(x.src),
      news: tgArr(x.news).filter((n) => tgStr(n.title)).map((n) => ({ title: tgStr(n.title), url: tgHttp(n.url), date: tgDay(n.dt) || tgDay(n.date), src: tgStr(n.src) }))
        .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    };
    if (o.opm == null && o.op != null && o.rev) o.opm = Math.round((o.op / o.rev) * 1000) / 10;
    o.stageN = tgStageN(o.stage);
    o.q = [name, o.brand, ...o.tags, o.invSum, ...o.rounds.map((r) => r.investors), o.ceo, o.region, o.induty, o.tech, o.stage, o.top?.name, o.founder?.name, o.founder?.bg, o.round?.investors, o.why,
      ...o.holders.map((h) => h.name), ...o.investors].join(' ').toLowerCase();
    return o;
  }).filter(Boolean);
  // 분류 순서는 파일의 cats, 거기 없는 분류는 뒤에
  const cats = tgList(raw.cats);
  items.forEach((x) => x.tags.forEach((c) => { if (!cats.includes(c)) cats.push(c); }));
  return {
    generated: tgStr(raw.generated), asof: tgDay(raw.asof), basis: tgStr(raw.basis), note: tgStr(tgObj(raw.rules).note), cats,
    progress: pg && tgNum(pg.universe) != null ? { universe: tgNum(pg.universe), done: tgNum(pg.done), pending: tgNum(pg.pending) } : null,
    sources: tgObj(raw.sources), items, byId: new Map(items.map((x) => [x.id, x])),
  };
}

// 파일이 아직 없으면(딜레이더 첫 실행 전) 오류가 아니라 '준비 중'
async function tgRead(k) {
  let d;
  try { d = await STORE.readText(TG_CFG[k].file); }
  catch (e) { if (e.status === 404) return { data: null, err: '' }; throw e; }
  if (!d.text) return { data: null, err: '' };
  let raw;
  try { raw = JSON.parse(d.text); } catch { return { data: null, err: `${TG_CFG[k].title} 자료 형식이 올바르지 않습니다` }; }
  return { data: raw && typeof raw === 'object' && !Array.isArray(raw) ? tgNorm(k, raw) : null, err: '' };
}

function tgLoad(k, force) {
  const st = tgS[k];
  if (!force && st.at && Date.now() - st.at < TG_TTL) return Promise.resolve();
  if (!st.loading) {
    st.loading = (async () => {
      // 저장 대기 중에 읽으면 대기 변경이 덮이므로 저장이 끝난 뒤 읽고, 아직 못 보낸 변경은 다시 얹는다(pe.js peLoad와 같다)
      let r, mk, sv;
      do {
        sv = tgS.saving; await sv.catch(() => {});
        [r, mk] = await Promise.all([tgRead(k), tgReadMarks()]);
      } while (sv !== tgS.saving);
      st.data = r.data; st.err = r.err;
      tgS.marks = { items: tgApplyDirty(mk.items), version: mk.version };
      st.at = Date.now();
      TAB_INFO[`deals/${k}`] = tgInfo(k);
    })().finally(() => { st.loading = null; });
  }
  return st.loading;
}

/* ---------- 컨택 상태·메모 (radar_marks.json, pe.js 와 같은 방식) ----------
   dirty = 아직 저장 안 된 변경 {key → {patch, seq, base(되돌릴 원본, 없으면 null), name, tab, at, by}} */
const TG_MARKS_BAD = '컨택 상태 자료 형식이 올바르지 않습니다';
const tgFind = (id) => { const k = String(id || '').split(':')[0]; return TG_CFG[k] ? tgS[k].data?.byId.get(id) || null : null; };
const tgMark = (key) => tgS.marks.items.find((m) => m && m.key === key);
const tgSt = (key) => { const s = tgMark(key)?.status; return TG_STATUS.includes(s) ? s : '미접촉'; };
const tgNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
let tgSeq = 0;

// 깨졌거나 배열이 아니면 빈 목록으로 보고 저장하면 다른 분 표시가 지워지므로 읽기를 멈춘다
async function tgReadMarks() {
  let r;
  try { r = await STORE.readJSON('radar_marks'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; r = null; }
  if (!r || !Array.isArray(r.items)) { const err = new Error(TG_MARKS_BAD); err.bad = true; throw err; }
  return r;
}

function tgApplyDirty(items) {
  tgS.dirty.forEach((e, key) => {
    const k = items.findIndex((x) => x && x.key === key);
    const m = { ...(k >= 0 ? items[k] : { key, status: '미접촉', note: '' }), ...e.patch, tab: e.tab, name: e.name, at: e.at, by: e.by };
    if (k >= 0) items[k] = m; else items.push(m);
  });
  return items;
}

function tgRollback(msg) {
  tgS.dirty.forEach((e, key) => {
    const items = tgS.marks.items, k = items.findIndex((x) => x && x.key === key);
    if (e.base) { if (k >= 0) items[k] = e.base; else items.push(e.base); } else if (k >= 0) items.splice(k, 1);
  });
  tgS.dirty.clear();
  toast(msg);
  tgDraw();
}

function tgSaveMarks() {
  let merged = false;
  tgS.saving = tgS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      if (!tgS.dirty.size) return;
      const sent = new Map([...tgS.dirty].map(([key, e]) => [key, e.seq]));
      const body = tgS.marks.items.filter((m) => m && typeof m === 'object').map((m) => ({ ...m }));
      try {
        tgS.marks.version = await STORE.writeJSON('radar_marks', body, tgS.marks.version);
        // 보내는 동안 또 바뀐 항목은 남겨 두고(방금 보낸 값을 원본으로, 그 뒤 바뀐 필드만 patch로) 다음 저장에 태운다
        sent.forEach((seq, key) => {
          const d = tgS.dirty.get(key); if (!d) return;
          if (d.seq === seq) { tgS.dirty.delete(key); return; }
          const b = body.find((m) => m.key === key);
          d.base = b ? { ...b } : null;
          d.patch = Object.fromEntries(Object.entries(d.patch).filter(([f, v]) => !b || b[f] !== v));
        });
        return;
      } catch (e) {
        if (e.status !== 409) { tgRollback(e.status === 403 ? '편집 권한이 없습니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
        try {
          const r = await tgReadMarks(), items = r.items;
          tgS.dirty.forEach((d, key) => { const x = items.find((m) => m && m.key === key); d.base = x ? { ...x } : null; });
          tgS.marks = { items: tgApplyDirty(items), version: r.version };
          merged = true;
        } catch (e2) { tgRollback(e2.bad ? `저장하지 못했습니다. ${TG_MARKS_BAD}.` : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
      }
    }
    tgRollback('다른 분이 동시에 수정 중입니다. 잠시 후 다시 시도해 주세요.');
  }).finally(() => { if (merged) tgDraw(); });
  return tgS.saving;
}

function tgTouch(id, patch) {
  const x = tgFind(id); if (!x) return false;
  const tab = id.split(':')[0];
  let m = tgMark(x.id);
  const prev = tgS.dirty.get(x.id), base = prev ? prev.base : (m ? { ...m } : null);
  if (!m) { m = { key: x.id, tab, name: x.name, status: '미접촉', note: '' }; tgS.marks.items.push(m); }
  const e = { patch: { ...prev?.patch, ...patch }, seq: ++tgSeq, base, name: x.name, tab, at: tgNow(), by: G.account?.name || '' };
  Object.assign(m, patch, { tab, name: e.name, at: e.at, by: e.by });
  tgS.dirty.set(x.id, e);
  return true;
}

// 상태를 바꾼 행은 펼친 채 그 자리에 두고(메모를 이어 쓸 수 있게), 접을 때 목록 아래 '컨택·검토한 곳'으로 내린다
function tgSetStatus(id, status) {
  const x = tgFind(id);
  if (!x || !TG_STATUS.includes(status) || tgSt(x.id) === status) return;
  if (!tgTouch(id, { status })) return;
  tgRefreshRow(id);
  tgSumDraw();
  tgSaveMarks();
}

function tgSetNote(id, v) {
  const x = tgFind(id); if (!x) return;
  const note = String(v || '').trim().slice(0, 300);
  if ((tgMark(x.id)?.note || '') === note) return;
  if (!tgTouch(id, { note })) return;
  const by = tgS.host && tgRowEl(tgS.host, id)?.querySelector('.ipo-by');
  if (by) by.textContent = tgByText(tgMark(x.id));
  tgSaveMarks();
}

/* ---------- 표시 형식 ---------- */
const TG_NA = '<span class="muted">–</span>';
const TG_NONE = '<p class="ipo-p muted">없음</p>';
const tgFmt = (n, d = 1) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });
const tgEok = (v) => (tgNum(v) == null ? '–' : `${tgFmt(v)}억`);
const tgPct = (v) => (tgNum(v) == null ? '–' : `${v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
// 손실은 파랑, 증감률은 부호를 붙여 오르면 빨강·내리면 파랑
const tgDn = (v, s) => (tgNum(v) != null && v < 0 ? `<span class="pe-dn">${s}</span>` : s);
const tgChg = (v) => (tgNum(v) == null ? '–' : v === 0 ? tgPct(v) : `<span class="${v > 0 ? 'pe-up' : 'pe-dn'}">${v > 0 ? '+' : ''}${tgPct(v)}</span>`);
// 이름 칸: pe.js peNm과 같은 자리에만 줄바꿈 기회(<wbr>)
const tgNm = (s) => esc(s).replace(/[A-Za-z0-9]-(?=\d)|-(?=[A-Za-z(가-힣ㄱ-ㅣ一-鿿])|·(?=[가-힣ㄱ-ㅣ一-鿿])/g, '$&<wbr>');
const tgYmd = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? yymd(s) : /^\d{4}-\d{2}$/.test(s) ? `${s.slice(2, 4)}.${s.slice(5, 7)}` : '');
const tgByText = (m) => (m && typeof m.at === 'string' && m.at ? `${tgStr(m.by)} ${tgYmd(m.at.slice(0, 10))} ${m.at.slice(11, 16)}`.trim() : '');
const tgChip = (st) => (st === TG_STATUS[0] ? '' : `<span class="ipo-st s-${TG_STATUS.indexOf(st)}">${esc(st)}</span>`); // 미접촉은 칩 없이
const tgChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
const tgBox = (t, body, sub = '', cls = '') => `<section class="ipo-box${cls ? ` ${cls}` : ''}"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const tgKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const tgA = (url, label) => `<a class="ipo-a" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}${ico('ext', 'sm')}</a>`;
const tgLines = (a) => a.map((t) => `<div>${esc(t)}</div>`).join('');
const tgMg = (cells) => `<dl class="pe-mg">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
// 상장사만 이름 옆에 시장 칩(비상장이 대부분이라 칩 없이)
const tgListed = (x) => (x.listed && x.listed !== '비상장' ? `<span class="rd-fs-tag">${esc(x.listed)}</span>` : '');
const tgStage = (x) => (x.stage ? `<span class="pe-ds${x.stageN != null && x.stageN >= TG_LATE ? ' on' : ''}">${esc(x.stage)}</span>` : TG_NA);
const tgAge = (f) => (f ? [f.name ? tgNm(f.name) : '', f.age != null ? `${f.age}세` : ''].filter(Boolean).join(' ') : '');
const tgRoundTxt = (r) => (r ? [tgYmd(r.date), r.round, r.amount].filter(Boolean).join(' ') : '');
function tgTime(s) {
  const g = s ? new Date(s) : null;
  if (!g || isNaN(g)) return '';
  return `${ymd(g) === today() ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())}`;
}
// 가장 많은 회사의 최근 재무 연도(소비재 '2025 매출' 머리글). 그 해가 아닌 회사는 칸 아래에 연도를 적는다
function tgYear(items) {
  const n = new Map();
  items.forEach((x) => { if (x.last) n.set(x.last.y, (n.get(x.last.y) || 0) + 1); });
  return [...n].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? null;
}

/* ---------- 목록 ---------- */
function tgRows(k) {
  const st = tgS[k], d = st.data, s = st.v; if (!d) return [];
  const q = s.q.trim().toLowerCase(), lo = (v) => (v == null ? -Infinity : v);
  const by = k === 'cons' ? {
    op: (a, b) => lo(b.op) - lo(a.op), rev: (a, b) => lo(b.rev) - lo(a.rev), opm: (a, b) => lo(b.opm) - lo(a.opm), cagr: (a, b) => lo(b.cagr) - lo(a.cagr),
  }[s.sort] : {
    inv: (a, b) => lo(b.inv) - lo(a.inv),
    round: (a, b) => (b.round?.date || '').localeCompare(a.round?.date || ''),
    age: (a, b) => (a.founder?.age ?? Infinity) - (b.founder?.age ?? Infinity),
  }[s.sort];
  const ok = k === 'cons'
    ? (x) => (!s.op || (x.op != null && x.op >= +s.op)) && (!s.fi || tgHasInv(x)) && (!s.lst || (s.lst === 'private' ? x.listed === '비상장' : !!x.listed && x.listed !== '비상장'))
    : (x) => (!s.young || x.young === true) && (!s.late || (x.stageN != null && x.stageN >= TG_LATE));
  return d.items.filter((x) => (!s.cat || x.tags.includes(s.cat)) && ok(x) && (!q || x.q.includes(q))).sort((a, b) => (by ? by(a, b) : 0) || a.idx - b.idx);
}

// 투자 이력 있음 = 라운드가 하나라도 있거나 누적 외부 투자가 0보다 큼
const tgHasInv = (x) => x.rounds.length > 0 || (x.inv != null && x.inv > 0);
// 투자 라운드 히스토리 표(시기 | 라운드 | 금액 | 투자자 | 출처), 위에 요약 한 줄
function tgRoundsBox(x) {
  const sum = x.invSum ? `<p class="ipo-p">${esc(x.invSum)}</p>` : '';
  const tbl = x.rounds.length ? `<div class="fs-scroll"><table class="ipo-tbl tgt-rounds"><thead><tr><th>시기</th><th>라운드</th><th>금액</th><th>투자자</th><th>출처</th></tr></thead><tbody>${x.rounds.map((r) => `<tr>
    <td>${esc(tgYmd(r.date) || r.date) || '–'}</td><td>${esc(r.round) || '–'}</td><td>${esc(r.amount) || '–'}</td><td>${r.investors ? esc(r.investors) : '–'}</td><td class="muted">${esc(r.src) || '–'}</td></tr>`).join('')}</tbody></table></div>` : '';
  return tgBox('투자 라운드', `${sum}${tbl}` || '<p class="ipo-p muted">확인 불가</p>', x.rounds.length ? `${x.rounds.length}건` : '');
}

// 컨택했거나 다 본 곳(미접촉이 아닌 상태)은 맨 아래 '컨택·검토한 곳'으로 내리고 흐리게(pe.js peSink와 같다)
function tgSink(list) {
  const low = list.filter((x) => tgSt(x.id) !== '미접촉');
  if (!low.length) return list;
  return [...list.filter((x) => !low.includes(x)), { low: true, n: low.length }, ...low];
}
const tgLowRow = (x) => `<div class="rd-grp rd-low"><b>컨택·검토한 곳</b><span>${x.n}곳</span></div>`;

/* 소비재: 영업이익 | 회사 | 매출 | 매출 성장 | 최대주주 | 컨택 상태 — 정렬 기준 값을 첫 칸에(pe.js 오너기업 점수 칸과 같은 자리)
   카드가 1000보다 좁으면 최대주주 칸(rd-c2)을 접어 회사 칸 보조 줄(rd-alt)로, 700보다 좁거나 폰이면 회사 칸 아래 수치 칸(pe-mg)으로 */
const tgConsHead = (y) => `<div class="ipo-head ipo-cols"><div>영업이익</div><div>회사</div><div>${y != null ? `${esc(y)} 매출` : '최근 매출'}</div><div>매출 성장</div><div class="rd-c2">최대주주</div><div class="rd-h-st">컨택 상태</div></div>`;

function tgConsRow(x, y) {
  const s = tgS.cons.v, open = s.open.has(x.id), t = x.top;
  const ty = x.last && x.last.y !== y ? `${esc(x.last.y)}년` : '';
  const sub = [...(s.cat ? x.tags.filter((c) => c !== s.cat) : x.tags), x.brand].filter(Boolean).join(', ');
  const invl = x.invSum && x.invSum !== '확인 불가' ? `<div class="ipo-sub tgt-s">투자 ${esc(x.invSum)}</div>` : '';
  const holder = t ? `${tgNm(t.name)}${t.pct != null ? ` ${tgPct(t.pct)}` : ''}` : '';
  const mg = tgMg([['매출', tgEok(x.rev)], ['영업이익', x.op != null ? `${tgDn(x.op, tgEok(x.op))}${x.opm != null ? ` <span class="tgt-mgs">OPM ${tgDn(x.opm, tgPct(x.opm))}</span>` : ''}` : TG_NA],
    ['매출 성장', tgChg(x.cagr)], ['최대주주', holder || TG_NA]]);
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div class="rd-mh">${x.op != null ? tgDn(x.op, tgEok(x.op)) : TG_NA}<div class="ipo-sub">${x.opm != null ? `OPM ${tgDn(x.opm, tgPct(x.opm))}` : ''}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${tgNm(x.name)}</button>${tgListed(x)}${sub ? `<div class="ipo-sub tgt-s">${esc(sub)}</div>` : ''}${invl}${holder ? `<div class="ipo-sub rd-alt">최대주주 ${holder}</div>` : ''}${mg}</div>
      <div class="rd-mh">${tgEok(x.rev)}<div class="ipo-sub">${ty}</div></div>
      <div class="rd-mh">${tgChg(x.cagr)}<div class="ipo-sub">${x.cagr != null ? '연평균' : ''}</div></div>
      <div class="rd-mh rd-c2">${holder || TG_NA}<div class="ipo-sub">${t ? esc(t.kind) : ''}</div></div>
      <div class="ipo-c-st">${tgChip(tgSt(x.id))}${tgChev()}</div>
    </div>${open ? tgDetail('cons', x) : ''}</div>`;
}

/* 딥테크: 누적 투자 | 회사 | 분야 | 단계 | 창업자 | 최근 라운드 | 컨택 상태 — radar.css 일곱 칸 그대로. 1000보다 좁으면 분야·최근 라운드(rd-c2)를 회사 칸 보조 줄로 */
const TG_DEEP_HEAD = '<div class="ipo-head ipo-cols"><div>누적 투자</div><div>회사</div><div class="rd-c2">분야</div><div class="pe-h-chip">단계</div><div>창업자</div><div class="rd-c2">최근 라운드</div><div class="rd-h-st">컨택 상태</div></div>';

function tgDeepRow(x) {
  const s = tgS.deep.v, open = s.open.has(x.id), f = x.founder, r = x.round;
  const fsub = f ? (x.young === true ? '<span class="tgt-yg">젊은 창업자</span>' : esc(f.bg)) : '';
  const alt = [s.cat ? '' : x.cat, r ? `최근 ${tgRoundTxt(r)}` : ''].filter(Boolean).join(', ');
  const mg = tgMg([['누적 투자', tgEok(x.inv)], ['단계', x.stage ? esc(x.stage) : TG_NA], ['창업자', f && tgAge(f) ? (x.young === true ? `<span class="tgt-yg">${tgAge(f)}</span>` : tgAge(f)) : TG_NA], ['최근 라운드', r ? esc(tgRoundTxt(r)) : TG_NA]]);
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div class="rd-mh">${x.inv != null ? tgEok(x.inv) : TG_NA}<div class="ipo-sub">${x.investors.length ? `투자사 ${x.investors.length}곳` : ''}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${tgNm(x.name)}</button>${tgListed(x)}${x.tech ? `<div class="ipo-sub tgt-s">${esc(x.tech)}</div>` : ''}${alt ? `<div class="ipo-sub rd-alt">${esc(alt)}</div>` : ''}${mg}</div>
      <div class="rd-mh rd-c2">${x.cat ? esc(x.cat) : TG_NA}</div>
      <div class="rd-mh">${tgStage(x)}</div>
      <div class="rd-mh">${f && tgAge(f) ? tgAge(f) : TG_NA}<div class="ipo-sub">${fsub}</div></div>
      <div class="rd-mh rd-c2">${r?.amount || r?.round ? esc(r.amount || r.round) : TG_NA}<div class="ipo-sub">${r ? esc([tgYmd(r.date), r.amount ? r.round : ''].filter(Boolean).join(' ')) : ''}</div></div>
      <div class="ipo-c-st">${tgChip(tgSt(x.id))}${tgChev()}</div>
    </div>${open ? tgDetail('deep', x) : ''}</div>`;
}

/* ---------- 펼친 행 ---------- */
// 머리: 이 목록에 든 이유 한 줄 + 컨택 상태 + 메모 + 작성자 + 팩트시트 요청, 그리고 파이프라인 — pe.js peDhead와 같은 마크업
function tgDhead(x) {
  const m = tgMark(x.id), st = tgSt(x.id);
  return `<div class="ipo-dhead">
      ${x.why ? `<p class="ipo-sum1">${esc(x.why)}</p>` : '<p></p>'}
      <div class="ipo-acts"><div class="seg ipo-seg">${TG_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" aria-pressed="${s === st}" data-tg-st="${s}">${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-tg-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모">
        <span class="ipo-by">${esc(tgByText(m))}</span>${typeof fqHead === 'function' ? fqHead(x.id, x) : ''}</div>${tgPipe(x)}
    </div>`;
}

// '파이프라인에 있음' 링크의 data-pp-ref = 파이프라인 화면이 그 딜을 펼쳐 보여 줄 때 쓰는 ref
function tgPipe(x) {
  if (typeof pipeAdd !== 'function') return '';
  let has = false;
  try { has = typeof pipeHas === 'function' && !!pipeHas(x.id); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(x.id)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-tg-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}

// 주요 손익: 항목 | 연도(최근 3개, 같은 폭) — pe.js peFinBox와 같은 표. 카드가 아주 좁으면(300 미만) 연도별 한 줄 목록(pe-finm)으로
const TG_FS = { OFS: '별도', CFS: '연결' };
function tgFinBox(x) {
  const fin = x.fin, sub = esc(TG_FS[x.fs] || x.fs);
  if (!fin.length) return tgBox('주요 손익', TG_NONE + (x.finSrc ? `<p class="pe-finsrc">${esc(x.finSrc)}</p>` : ''), sub);
  const n = (v) => (v == null ? '–' : tgDn(v, v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
  const opm = (f) => (f.op == null || !f.rev ? null : Math.round((f.op / f.rev) * 1000) / 10);
  const row = (k, g, key, cls = '') => (fin.every((f) => f[key] == null) ? '' : `<tr${cls ? ` class="${cls}"` : ''}><td>${k}</td>${fin.map((f) => `<td>${g(f)}</td>`).join('')}</tr>`);
  const tbl = `<table class="ipo-tbl pe-fin"><thead><tr><th>억 원</th>${fin.map((f) => `<th>${esc(f.y)}</th>`).join('')}</tr></thead><tbody>
    ${row('매출액', (f) => n(f.rev), 'rev')}${row('영업이익', (f) => n(f.op), 'op')}${row('OPM', (f) => (opm(f) == null ? '–' : tgDn(opm(f), tgPct(opm(f)))), 'op', 'r')}${row('당기순이익', (f) => n(f.ni), 'ni')}
    </tbody></table>`;
  const list = `<ul class="pe-finm">${[...fin].reverse().map((f) => `<li><b>${esc(f.y)}</b>${tgMg([['매출', tgEok(f.rev)], ['영업이익', f.op != null ? tgDn(f.op, tgEok(f.op)) : '–'], ['OPM', opm(f) != null ? tgDn(opm(f), tgPct(opm(f))) : '–'], ['순이익', f.ni != null ? tgDn(f.ni, tgEok(f.ni)) : '–']])}</li>`).join('')}</ul>`;
  const cagr = x.cagr != null ? `<div class="pe-hkv">${tgKv('매출 CAGR', tgChg(x.cagr))}</div>` : '';
  return tgBox('주요 손익', tbl + list + cagr + (x.finSrc ? `<p class="pe-finsrc">${esc(x.finSrc)}</p>` : ''), sub);
}

function tgDetail(k, x) {
  const deep = k === 'deep', f = x.founder, r = x.round;
  const est = x.est ? `${esc(x.est)}${x.years != null ? `, 업력 ${x.years}년` : ''}` : x.years != null ? `업력 ${x.years}년` : '';
  const links = [x.home ? tgA(x.home, '홈페이지') : '', tgA(`https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(x.name)}`, 'DART 검색')].join('');
  const co = `${tgKv('대표', x.ceo ? tgNm(x.ceo) : '')}${tgKv('설립', est)}${tgKv('지역', esc(x.region))}${tgKv('업종', esc(x.induty))}${tgKv('분류', esc(x.tags.join(', ')))}
    ${tgKv('상장', esc(x.listed))}${tgKv(deep ? '기술' : '브랜드', esc(deep ? x.tech : x.brand))}<div class="ipo-links">${links}</div>`;
  const holders = x.holders.length ? `<table class="ipo-tbl rd-tbl-h"><thead><tr><th>주주</th><th>지분율</th><th>구분</th></tr></thead><tbody>${x.holders.map((h) => `<tr><td>${tgNm(h.name)}</td><td>${h.pct != null ? tgPct(h.pct) : '–'}</td><td>${esc(h.kind) || '–'}</td></tr>`).join('')}</tbody></table>`
    : x.top ? tgKv('최대주주', `${tgNm(x.top.name)}${x.top.pct != null ? ` ${tgPct(x.top.pct)}` : ''}${x.top.kind ? ` (${esc(x.top.kind)})` : ''}`) : TG_NONE;
  const inv = deep ? tgBox('투자', `${tgKv('단계', x.stage ? tgStage(x) : '')}${tgKv('누적 투자', x.inv != null ? tgEok(x.inv) : '')}${tgKv('최근 라운드', r ? esc(tgRoundTxt(r)) : '')}${tgKv('라운드 투자자', esc(r?.investors))}
    ${tgKv('투자사', x.investors.length ? x.investors.map(tgNm).join(', ') : '')}${tgKv('기업가치', esc(x.valuation))}
    ${tgKv('창업자', f ? `${tgAge(f)}${f.born != null ? ` (${f.born}년생)` : ''}${x.young === true ? ' <span class="tgt-yg">젊은 창업자</span>' : ''}` : '')}${tgKv('창업자 경력', esc(f?.bg))}`
    || TG_NONE) : '';
  const news = x.news.length ? `<table class="ipo-tbl rd-tbl-n"><thead><tr><th>날짜</th><th>기사</th><th>매체</th></tr></thead><tbody>${x.news.map((n) => `<tr>
    <td>${esc(n.date) || '–'}</td><td>${n.url ? `<a class="rd-link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</td><td>${esc(n.src)}</td></tr>`).join('')}</tbody></table>` : TG_NONE;
  const src = `${tgKv('출처', x.src.length ? tgLines(x.src) : '')}${tgKv('확인할 것', x.flags.length ? `<div class="tgt-flags">${x.flags.map((t) => `<span class="pe-ds off">${esc(t)}</span>`).join('')}</div>` : '')}` || TG_NONE;
  return `<div class="ipo-detail">${tgDhead(x)}
    <div class="ipo-pane"><div class="ipo-stack">${typeof fqBox === 'function' ? fqBox(x.id, x, TG_CFG[k].title) : ''}
      <div class="ipo-two-col">
        <div class="ipo-stack">${inv}${tgRoundsBox(x)}${tgFinBox(x)}</div>
        <div class="ipo-stack">${tgBox('회사 정보', co)}${tgBox('주주', holders)}</div>
      </div>
      ${tgBox('최근 기사', news, x.news.length ? `${x.news.length}건` : '')}
      ${tgBox('출처', src)}
    </div></div>
  </div>`;
}

/* ---------- 요약 줄·필터 ---------- */
function tgSummary(k) {
  const d = tgS[k].data; if (!d) return '';
  const it = d.items, n = (f) => it.filter(f).length, t = tgTime(d.generated);
  const old = d.asof && (Date.parse(today()) - Date.parse(d.asof)) / 86400000 > TG_CFG[k].stale;
  const pg = d.progress;
  const parts = [
    d.asof ? `<span class="${old ? 'ipo-stale' : ''}"${t ? ` title="${esc(t)} 수집"` : ''}>기준일 ${esc(yymd(d.asof))}</span>` : t ? `<span>${t} 수집</span>` : '',
    `<span><b>${it.length}</b>곳</span>`,
    pg ? `<span>수집 <b>${tgFmt(pg.done ?? 0, 0)}</b>/${tgFmt(pg.universe, 0)}곳${pg.pending ? `, 남은 곳 ${tgFmt(pg.pending, 0)}` : ''}</span>` : '',
    k === 'deep' ? `<span>젊은 창업자 <b>${n((x) => x.young === true)}</b></span>` : '',
    `<span>컨택 <b>${n((x) => tgSt(x.id) !== '미접촉')}</b></span>`,
  ];
  // ok로 시작하지 않는 출처만 이름으로(값은 마우스를 올리면)
  const bad = Object.entries(d.sources).filter(([, v]) => !/^ok/i.test(tgStr(v))).map(([s, v]) => `<span class="ipo-stale" title="${esc(tgStr(v))}">${esc(s)} 확인 필요</span>`);
  return parts.join('') + bad.join('');
}

const tgSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
function tgFilterHtml(k) {
  const s = tgS[k].v, d = tgS[k].data, cats = [['', '전체'], ...(d?.cats || []).map((c) => [c, c])];
  if (s.cat && !cats.some(([c]) => c === s.cat)) cats.push([s.cat, s.cat]); // 자료에서 빠진 분류를 고른 채로 남아 있으면 풀 수 있게
  const search = `<div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="tg-q" type="search" placeholder="${k === 'cons' ? '회사, 브랜드, 대표, 주주로 검색' : '회사, 기술, 창업자, 투자사로 검색'}" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>`;
  const sel = `<select class="select" id="tg-sort" aria-label="정렬">${(k === 'cons' ? TG_CSORT : TG_DSORT).map(([v, l]) => `<option value="${v}"${s.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const tg = (f, l) => `<button type="button" data-tg-tg="${f}" class="${s[f] ? 'on' : ''}" aria-pressed="${!!s[f]}">${l}</button>`;
  const second = k === 'cons'
    ? `<div class="rd-fing"><span class="rd-finl">영업이익</span>${tgSeg('tg-op', TG_OP, s.op)}</div><div class="rd-fing"><span class="rd-finl">상장</span>${tgSeg('tg-lst', TG_LST, s.lst)}</div><div class="rd-fing"><span class="rd-finl">투자</span><div class="seg">${tg('fi', '투자 이력 있음')}</div></div>`
    : `<div class="rd-fing"><span class="rd-finl">조건</span><div class="seg">${tg('young', '젊은 창업자만')}${tg('late', '시리즈C 이상')}</div></div>`;
  return `<div class="ipo-filter">${search}${tgSeg('tg-cat', cats, s.cat)}${sel}</div><div class="ipo-filter rd-finf">${second}</div>`;
}

/* ---------- 엑셀(CSV, 지금 보이는 목록·정렬 그대로 — delist.js dlCsv와 같은 방식) ---------- */
function tgCsv(k) {
  const d = tgS[k].data; if (!d) return;
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const mk = (x) => [tgSt(x.id), tgMark(x.id)?.note || ''];
  const head = k === 'cons'
    ? ['번호', '회사', '브랜드', '분류', '상장', '대표', '설립', '지역', '업종', '최근 연도', '매출(억)', '영업이익(억)', 'OPM(%)', '매출 CAGR(%)', '최대주주', '최대주주 지분(%)', '투자 이력', '누적 투자(억)', '홈페이지', '선정 이유', '컨택 상태', '메모']
    : ['번호', '회사', '분야', '기술', '단계', '누적 투자(억)', '최근 라운드 시기', '최근 라운드', '최근 라운드 금액', '최근 라운드 투자자', '투자사', '기업가치', '창업자', '창업자 나이', '젊은 창업자', '창업자 경력', '대표', '설립', '지역', '홈페이지', '선정 이유', '컨택 상태', '메모'];
  const rows = tgRows(k).map((x, i) => (k === 'cons'
    ? [i + 1, x.name, x.brand, x.tags.join(', '), x.listed, x.ceo, x.est, x.region, x.induty, x.last?.y, x.rev, x.op, x.opm, x.cagr, x.top?.name, x.top?.pct, x.invSum, x.inv, x.home, x.why, ...mk(x)]
    : [i + 1, x.name, x.cat, x.tech, x.stage, x.inv, x.round?.date, x.round?.round, x.round?.amount, x.round?.investors, x.investors.join(', '), x.valuation,
      x.founder?.name, x.founder?.age, x.young === true ? 'O' : x.young === false ? 'X' : '', x.founder?.bg, x.ceo, x.est, x.region, x.home, x.why, ...mk(x)]));
  const csv = '\uFEFF' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${TG_CFG[k].title}_${(d.asof || today()).replace(/-/g, '').slice(2)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- 그리기 ---------- */
function tgBody(k) {
  const st = tgS[k];
  if (st.err) return `<div class="empty">${esc(st.err)}</div>`;
  if (!st.data) return `<div class="empty">${TG_CFG[k].title} 목록을 준비하고 있습니다. 자료가 올라오면 여기에 보입니다.</div>`;
  if (!st.data.items.length) return '<div class="empty">아직 목록에 든 회사가 없습니다.</div>';
  const list = tgSink(tgRows(k));
  if (!list.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  if (k === 'deep') return TG_DEEP_HEAD + list.map((x) => (x.low ? tgLowRow(x) : tgDeepRow(x))).join('');
  const y = tgYear(st.data.items);
  return tgConsHead(y) + list.map((x) => (x.low ? tgLowRow(x) : tgConsRow(x, y))).join('');
}
const tgRowEl = (root, id) => [...root.querySelectorAll('.ipo-row[data-id]')].find((r) => r.dataset.id === id);
const tgRowHtml = (x) => (x.id.startsWith('deep:') ? tgDeepRow(x) : tgConsRow(x, tgYear(tgS.cons.data?.items || [])));

/* 다시 그릴 때 쓰고 있던 메모 칸을 지킨다(pe.js peKeepNote·peKeepBack과 같다). 그 행이 빠져 되살릴 칸이 없으면 쓰던 메모를 저장한다.
   다시 그리는 동안(tgDrawing) 빠지는 칸의 change·focusout으로는 저장하지 않는다. 한글 조합 중이면 다시 그리기를 조합이 끝난 뒤로 미룬다 */
let tgDrawing = false;
const tgIme = { el: null, todo: new Map() };
function tgImeWait(scope, key, fn) {
  const el = tgIme.el;
  if (!el || !el.isConnected || document.activeElement !== el || !scope.contains(el)) return false;
  tgIme.todo.set(key, fn);
  return true;
}
function tgImeDone() {
  tgIme.el = null;
  setTimeout(() => { if (tgIme.el) return; const todo = [...tgIme.todo.values()]; tgIme.todo.clear(); todo.forEach((f) => f()); });
}
function tgKeepNote(scope) {
  const ae = document.activeElement;
  return ae && ae.matches && ae.matches('[data-tg-note]') && scope.contains(ae) ? { id: ae.closest('.ipo-row')?.dataset.id, v: ae.value, a: ae.selectionStart, z: ae.selectionEnd } : null;
}
function tgKeepBack(keep) {
  if (!keep || keep.id == null) return;
  const i = tgRowEl(tgS.host, keep.id)?.querySelector('[data-tg-note]');
  if (!i) { tgSetNote(keep.id, keep.v); return; }
  i.value = keep.v; i.focus({ preventScroll: true });
  try { i.setSelectionRange(keep.a, keep.z); } catch { /* 커서 위치는 못 지켜도 됨 */ }
}

// 펼친 행을 보여 줄 때: 보이는 높이에 다 들어가면 가운데, 길면 머리 줄이 맨 위(8 띄움) — pe.js peReveal과 같다
function tgReveal(r) {
  const sc = r.closest('.scroll');
  if (!sc) { r.scrollIntoView({ block: r.offsetHeight <= innerHeight ? 'center' : 'start' }); return; }
  const tb = document.querySelector('.tabbar'), vis = sc.clientHeight - (tb ? tb.offsetHeight : 0), h = r.offsetHeight;
  const top = r.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  sc.scrollTop = h <= vis ? top - (vis - h) / 2 : top - 8;
}

// 행을 갈아 끼울 때 보던 자리를 지킨다 — pe.js peHold와 같다
function tgHold(b, key, fn) {
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

function tgSumDraw() {
  const h = tgS.host; if (!h || !h.isConnected) return;
  const sum = h.querySelector('#tg-sum'); if (sum) sum.innerHTML = tgSummary(tgS.k);
}

function tgDraw() {
  const host = tgS.host; if (!host || !host.isConnected) return;
  const b = host.querySelector('#tg-body'); if (!b) return;
  if (tgImeWait(b, 'draw', tgDraw)) return;
  const keep = tgKeepNote(b);
  tgDrawing = true;
  try { b.innerHTML = tgBody(tgS.k); } finally { tgDrawing = false; }
  tgSumDraw();
  tgKeepBack(keep);
  tgViewSave();
  if (tgS.focus != null) {
    const r = tgRowEl(b, tgS.focus);
    tgS.focus = null;
    if (r) tgReveal(r);
  }
}

function tgRefreshRow(id) {
  const x = tgFind(id), b = tgS.host?.querySelector('#tg-body'), r = b && tgRowEl(b, id);
  if (!x || !r) return;
  if (tgImeWait(r, `row:${id}`, () => tgRefreshRow(id))) return;
  const keep = tgKeepNote(r);
  tgDrawing = true;
  try { tgHold(b, id, () => { r.outerHTML = tgRowHtml(x); }); } finally { tgDrawing = false; }
  tgKeepBack(keep);
}

// 접은 행이 상태 때문에 다른 묶음(컨택·검토한 곳 ↔ 위 목록)으로 가야 하면 목록을 다시 그리고, 그 행 바로 다음 행이 그 자리에 오게 한다
function tgFold(r, x) {
  const b = r.parentElement, low = b.querySelector('.rd-low');
  const inLow = !!low && !!(low.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
  if ((tgSt(x.id) !== '미접촉') === inLow) { tgRefreshRow(x.id); return; }
  const sc = r.closest('.scroll');
  let nx = r.nextElementSibling; while (nx && !nx.matches('.ipo-row[data-id]')) nx = nx.nextElementSibling;
  const y0 = r.getBoundingClientRect().top - (parseFloat(getComputedStyle(r).marginTop) || 0), nid = nx?.dataset.id;
  tgDraw();
  const n = nid != null && tgRowEl(b, nid);
  if (sc && n) { const dy = n.getBoundingClientRect().top - y0; if (Math.abs(dy) >= 0.5) sc.scrollTop += dy; }
}

// 펼친 행의 파이프라인 버튼만 다시 그린다(행을 통째로 다시 그리면 그사이 치던 메모가 사라진다). id가 없으면 펼친 행 전부
function tgPipeDraw(id) {
  if (!tgS.host || !tgS.host.isConnected) return;
  tgS.host.querySelectorAll('#tg-body .ipo-row.open[data-id]').forEach((r) => {
    if (id != null && r.dataset.id !== id) return;
    const x = tgFind(r.dataset.id), p = r.querySelector('.ipo-dhead > .rd-pipe');
    if (!x || !p) return;
    const t = document.createElement('template'); t.innerHTML = tgPipe(x).trim();
    const n = t.content.firstElementChild;
    if (n && !n.isEqualNode(p)) p.replaceWith(n);
  });
}

async function tgPipeAdd(btn) {
  const x = tgFind(btn.closest('.ipo-row')?.dataset.id);
  if (!x || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  try { await pipeAdd({ src: TG_CFG[x.id.split(':')[0]].title, ref: x.id, name: x.name }); }
  catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  tgPipeDraw(x.id);
}

function tgBind(root) {
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  root.addEventListener('click', (ev) => {
    const t = ev.target, k = tgS.k, s = tgS[k].v;
    const cb = t.closest('[data-tg-cat]'); if (cb) { s.cat = cb.dataset.tgCat; segOn('[data-tg-cat]', cb); tgDraw(); return; }
    const ob = t.closest('[data-tg-op]'); if (ob) { s.op = ob.dataset.tgOp; segOn('[data-tg-op]', ob); tgDraw(); return; }
    const lb = t.closest('[data-tg-lst]'); if (lb) { s.lst = lb.dataset.tgLst; segOn('[data-tg-lst]', lb); tgDraw(); return; }
    const tb = t.closest('[data-tg-tg]');
    if (tb) { const f = tb.dataset.tgTg; s[f] = !s[f]; tb.classList.toggle('on', s[f]); tb.setAttribute('aria-pressed', s[f]); tgDraw(); return; }
    if (t.closest('#tg-xls')) { tgCsv(k); return; }
    if (t.closest('#tg-ref')) {
      tgLoad(k, true).then(() => { const f = tgS.host?.querySelector('#tg-filter'); if (f) f.innerHTML = tgFilterHtml(k); tgDraw(); }).catch((e) => toast(e.message));
      if (typeof pipeLoad === 'function') pipeLoad(true).then(() => tgPipeDraw()).catch(() => {}); // 다른 분이 그사이 올린 딜도 '있음'으로
      return;
    }
    const sb = t.closest('[data-tg-st]'); if (sb) { tgSetStatus(sb.closest('.ipo-row').dataset.id, sb.dataset.tgSt); return; }
    const pb = t.closest('[data-tg-pipe]'); if (pb) { tgPipeAdd(pb); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]');
    if (row) {
      const id = row.dataset.id, x = tgFind(id), was = s.open.has(id);
      if (was) s.open.delete(id); else s.open.add(id);
      tgViewSave();
      if (was && x) tgFold(row, x); else tgRefreshRow(id);
    }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'tg-q') { tgS[tgS.k].v.q = ev.target.value; tgDraw(); } });
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'tg-sort') { tgS[tgS.k].v.sort = t.value; tgDraw(); }
    if (t.matches('[data-tg-note]') && !tgDrawing) tgSetNote(t.closest('.ipo-row').dataset.id, t.value);
  });
  // 메모를 쓰다가 칸이 다시 그려졌으면 change가 안 올 수 있어 칸을 떠날 때도 저장한다
  root.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!t.matches || !t.matches('[data-tg-note]') || !t.isConnected) return;
    if (tgIme.el === t) tgImeDone();
    if (!tgDrawing) tgSetNote(t.closest('.ipo-row').dataset.id, t.value);
    if (tgS.field === t) tgS.field = null;
  });
  root.addEventListener('focusin', (ev) => { if (ev.target.matches?.('[data-tg-note]')) tgS.field = ev.target; });
  root.addEventListener('compositionstart', (ev) => { if (ev.target.matches?.('[data-tg-note]')) tgIme.el = ev.target; });
  root.addEventListener('compositionend', (ev) => { if (tgIme.el === ev.target) tgImeDone(); });
}

// 메모 칸을 떠나지 않은 채 다른 화면으로 옮기거나 앱을 내릴 때도 쓰던 메모를 저장한다(pe.js peFlush와 같다)
function tgFlush(leave) {
  const el = tgS.field; if (!el) return;
  if (leave || !el.isConnected) tgS.field = null;
  const id = el.closest('.ipo-row')?.dataset.id;
  if (id != null) tgSetNote(id, el.value);
}
window.addEventListener('hashchange', () => tgFlush(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) tgFlush(false); });
window.addEventListener('beforeunload', (e) => { tgFlush(false); if (tgS.dirty.size) { e.preventDefault(); e.returnValue = ''; } });

async function tgRender(k, host) {
  tgS.k = k; tgS.host = host;
  tgIme.el = null; tgIme.todo.clear();
  host.innerHTML = `<div class="ipo-page rd-page tgt-page tgt-${k}" id="tg-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="tg-sum"></div>
      ${infoBtn(`deals/${k}`)}
      <button class="btn ghost" type="button" id="tg-xls">${ico('file', 'sm')}<span>엑셀 다운로드</span></button>
      <button class="btn ghost" type="button" id="tg-ref">${ico('refresh', 'sm')}<span>새로고침</span></button></div>
    <section class="card ipo-card">
      <div id="tg-filter">${tgFilterHtml(k)}</div>
      <div class="ipo-body" id="tg-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  tgBind(host.querySelector('#tg-root'));
  try { await tgLoad(k); }
  catch (e) {
    const b = tgS.host === host && host.querySelector('#tg-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (tgS.host !== host || !host.isConnected) return;
  host.querySelector('#tg-filter').innerHTML = tgFilterHtml(k); // 분류 묶음은 자료(cats)를 읽은 뒤에 정해진다
  tgDraw();
  // '파이프라인에 있음' 표시가 처음부터 맞게 미리 읽고, 다 읽으면 펼친 행의 버튼만 다시 그림
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (tgS.host === host) tgPipeDraw(); }).catch(() => {});
}
const renderCons = (host) => tgRender('cons', host);
const renderDeep = (host) => tgRender('deep', host);

/* 다른 화면(파이프라인 등)에서 ref('cons:…'·'deep:…' = item.id)로 한 회사를 펼쳐 보여 줄 때: 탭 열기 전에 부르고 돌려준 주소로 이동 */
function tgtFocus(ref) {
  const m = /^(cons|deep):(.+)$/.exec(String(ref || ''));
  if (!m) return '';
  const k = m[1], s = tgS[k].v, id = `${k}:${m[2]}`;
  Object.assign(s, { q: '', cat: '' }, k === 'cons' ? { op: '', lst: '', fi: false } : { young: false, late: false });
  s.open.add(id); tgS.focus = id;
  tgViewSave(k);
  return `#deals/${k}`;
}

/* ---------- 화면 설명(ⓘ) — 기준 문장은 자료 파일 rules.note에서 읽는다 ---------- */
function tgInfo(k) {
  const d = tgS[k].data, cons = k === 'cons';
  const asof = [d?.asof ? `기준일 ${d.asof}` : '기준일 –', d?.basis || ''].filter(Boolean).join(', ');
  const note = d?.note || (cons ? '영업이익 20억 원 이상인 회사를 담았습니다.' : '젊은 창업자가 세운 회사 중 시리즈 B 이상 투자를 받은 곳을 담았습니다.');
  return {
    title: TG_CFG[k].title,
    asof,
    rows: cons ? [
      ['무엇인가', [
        '화장품, 향수, 탈취제와 방향제처럼 생활 소비재를 만드는 회사 목록입니다.',
        note,
      ]],
      ['왜 보나', [
        '이익을 꾸준히 내는 소비재 회사를 바이아웃이나 성장투자 대상으로 찾기 위한 목록입니다.',
      ]],
      ['어떻게 보나', [
        '맨 위 묶음으로 분류를 고르고, 영업이익 20억, 30억, 50억 이상과 상장 여부로 좁혀 봅니다. 정렬은 영업이익, 매출, OPM, 매출 성장률 순입니다.',
        '매출 성장은 최근 몇 해 매출의 연평균 증가율입니다. 오르면 빨강, 줄면 파랑으로 보입니다.',
        '행을 펼치면 선정 이유, 주요 손익, 주주, 회사 정보, 최근 기사, 출처가 나옵니다.',
        `기준일이 ${TG_CFG[k].stale}일 넘게 지나면 요약 줄에 빨간 글씨로 보입니다.`,
        '엑셀 다운로드는 지금 보이는 목록을 정렬 그대로 CSV로 받습니다.',
        '연락함, 미팅, 보류, 검토 완료로 바꾼 회사는 행을 접으면 목록 맨 아래 컨택·검토한 곳으로 내려갑니다.',
      ]],
      ['그래서 할 일', [
        '펼쳐서 손익과 주주를 보고, 볼 곳은 팩트시트를 요청한 뒤 대표 앞으로 연락합니다.',
        '연락하면 상태와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
      ]],
    ] : [
      ['무엇인가', [
        '반도체 팹리스, 우주항공 같은 딥테크 스타트업 중 젊은 창업자가 세운 회사 목록입니다.',
        note,
      ]],
      ['왜 보나', [
        '시리즈 B 이상으로 기술과 시장을 어느 정도 검증받은 딥테크 회사에 투자 기회를 찾기 위한 목록입니다. 우주항공 회사는 따로 분류해 둡니다.',
      ]],
      ['어떻게 보나', [
        '맨 위 묶음으로 분야를 고르고, 젊은 창업자만, 시리즈C 이상으로 좁혀 봅니다. 정렬은 누적 투자, 최근 라운드, 창업자 나이 순입니다.',
        '창업자 나이와 투자 금액은 기사와 투자 정보 사이트에서 모은 값이라 펼친 행의 출처와 확인할 것을 같이 봐 주세요.',
        '행을 펼치면 선정 이유, 투자 이력, 창업자, 주요 손익, 주주, 회사 정보, 최근 기사가 나옵니다.',
        `기준일이 ${TG_CFG[k].stale}일 넘게 지나면 요약 줄에 빨간 글씨로 보입니다.`,
        '엑셀 다운로드는 지금 보이는 목록을 정렬 그대로 CSV로 받습니다.',
        '연락함, 미팅, 보류, 검토 완료로 바꾼 회사는 행을 접으면 목록 맨 아래 컨택·검토한 곳으로 내려갑니다.',
      ]],
      ['그래서 할 일', [
        '펼쳐서 투자 이력과 창업자를 보고, 볼 곳은 팩트시트를 요청한 뒤 다음 라운드 참여나 구주 인수 가능성을 문의합니다.',
        '연락하면 상태와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
      ]],
    ],
  };
}
TAB_INFO['deals/cons'] = tgInfo('cons');
TAB_INFO['deals/deep'] = tgInfo('deep');
