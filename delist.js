/* UNIVERSE WORKS — 딜소싱 › 상폐 위험·CB (#deals/delist). 화면 구성은 kosdaq-watch(jwtakyan.github.io/kosdaq-watch)를 따른다: AI 추천 카드 → 지난 추천 이력 → 넓은 표.
   매일 09:30 PC 작업(05. 딜소싱\_자동화\딜레이더\delist.py)이 회사 OneDrive SPACE WORKS/data/delist.json 을 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT_delist.md).
   상장폐지 시총 요건 위험 회사 목록(items)에서 좋은 기업(pass)을 골라내고, CB·바이아웃 앵글(angles), Claude가 고른 AI 추천(picks·picks_history)을 본다.
   연락 상태·메모는 따로 두지 않고 파이프라인(ref = delist:<종목코드>)에서 관리한다.
   진입: renderDelist(host) — host 안에만 그린다. 다른 화면에서 한 회사를 펼쳐 열 때: delistFocus(ref)가 돌려준 주소로 이동.
   app.js 전역($, esc, pad, ymd, yymd, today, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn)과 graph.js 의 STORE, ipo.css 상자 클래스를 쓴다.
   파이프라인은 pipeline.js 의 pipeAdd·pipeHas·pipeLoad(있을 때만 버튼이 보인다). */

const DL_FILE = 'data/delist.json';
const DL_TTL = 5 * 60000;
const DL_PIPE_SRC = '상폐 위험·CB';
const DL_ANG_L = { cb: 'CB', buyout: '바이아웃' };
const DL_COLS = 20; // 표 칸 수(펼친 칸 colspan)

// 새로 고친 뒤에도 보던 검색어·체크·선택·정렬·펼친 행·이력 펼침을 창마다 기억한다(app.js viewGet·viewSet)
const DL_VIEW = { q: 'string', stage: 'string', mkt: 'string', sk: 'string', good: 'boolean', cb: 'boolean', bo: 'boolean', asc: 'boolean', hist: 'boolean' };
const dlS = (() => {
  const s = { data: null, at: 0, loading: null, q: '', good: true, cb: false, bo: false, stage: '', mkt: '', sk: 'score', asc: false, hist: false, open: new Set(), focus: null, host: null };
  const v = viewGet('dl2', null) || {};
  Object.entries(DL_VIEW).forEach(([k, t]) => { if (typeof v[k] === t) s[k] = v[k]; });
  s.open = new Set(Array.isArray(v.open) ? v.open : []);
  return s;
})();
const dlViewSave = () => viewSet('dl2', { ...Object.fromEntries(Object.keys(DL_VIEW).map((k) => [k, dlS[k]])), open: [...dlS.open] });

/* ---------- 데이터 ---------- */
const dlStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const dlNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const dlArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const dlDay = (v) => { const s = dlStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const dlList1 = (v) => (Array.isArray(v) ? v : [v]).map(dlStr).filter(Boolean);

// AI 추천 한 곳: 새 형식 {code, name, angle, thesis[], key_metrics, structure, risks}, 옛 형식 {why, structure, risk, next}도 받는다
const dlPickN = (k) => ({
  code: dlStr(k.code), name: dlStr(k.name), angle: dlStr(k.angle),
  thesis: k.thesis != null ? dlList1(k.thesis) : [k.why, k.next].map(dlStr).filter(Boolean),
  km: dlStr(k.key_metrics), structure: dlStr(k.structure), risks: dlStr(k.risks) || dlStr(k.risk),
});

function dlNorm(raw) {
  const r = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  const rule = (o) => (o && typeof o === 'object' ? { from: dlStr(o.from), 코스피: dlNum(o['코스피']), 코스닥: dlNum(o['코스닥']) } : { from: '', 코스피: null, 코스닥: null });
  const seen = new Set();
  const items = dlArr(raw.items).map((x, i) => {
    const code = dlStr(x.code), name = dlStr(x.name);
    if (!code || !name || seen.has(code)) return null;
    seen.add(code);
    const fin = dlArr(x.fin).filter((f) => dlNum(f.y) != null).map((f) => ({ y: f.y, rev: dlNum(f.rev), op: dlNum(f.op), ni: dlNum(f.ni), assets: dlNum(f.assets), liab: dlNum(f.liab), equity: dlNum(f.equity), fs: dlStr(f.fs) }))
      .sort((a, b) => a.y - b.y).slice(-3);
    const h = x.holder && typeof x.holder === 'object' ? x.holder : {};
    const fg = x.flags && typeof x.flags === 'object' ? x.flags : {};
    const mz = x.mezz && typeof x.mezz === 'object' ? x.mezz : {};
    const ag = x.angles && typeof x.angles === 'object' ? x.angles : null;
    const ang = (a) => (a && typeof a === 'object' ? { ok: a.ok === true, why: dlList1(a.why) } : null);
    const mlist = dlArr(mz.list).map((m) => ({ dt: dlDay(m.dt), type: dlStr(m.type), amount: dlNum(m.amount), conv: dlNum(m.conv_price), refix: dlNum(m.refix), investors: dlList1(m.investors) }))
      .sort((a, b) => b.dt.localeCompare(a.dt));
    const o = {
      code, name, idx: i, market: dlStr(x.market), sector: dlStr(x.sector), biz: dlStr(x.biz), close: dlNum(x.close), mcap: dlNum(x.mcap),
      stage: [1, 2, 3].includes(x.stage) ? x.stage : null, rule: dlNum(x.rule), gap: dlNum(x.gap), gapPct: dlNum(x.gap_pct),
      gapNext: dlNum(x.gap_next) ?? dlNum(x.gap), gapNextPct: dlNum(x.gap_next_pct) ?? dlNum(x.gap_pct), below: dlNum(x.below_days), turnover: dlNum(x.turnover),
      fin, last: fin.length ? fin[fin.length - 1] : null, profitYears: dlNum(x.profit_years), pbr: dlNum(x.pbr), netCash: dlNum(x.net_cash), ppe: dlNum(x.ppe),
      ev: dlNum(x.ev), evOp: dlNum(x.ev_op), opm: dlNum(x.opm), revCagr: dlNum(x.rev_cagr), angles: ag ? { cb: ang(ag.cb), buyout: ang(ag.buyout) } : null,
      holder: { name: dlStr(h.name), pct: dlNum(h.pct), fund: h.fund === true },
      flags: { mgmt: fg.mgmt === true, halted: fg.halted === true, impaired: fg.impaired === true },
      mezz: { n: dlNum(mz.n), amt: dlNum(mz.amt_3y), ratio: dlNum(mz.ratio), list: mlist },
      pass: x.pass === true, reasons: dlList1(x.reasons), score: dlNum(x.score),
    };
    o.q = [code, name, o.market, o.sector, o.biz, o.holder.name, ...mlist.flatMap((m) => m.investors)].join(' ').toLowerCase();
    return o;
  }).filter(Boolean);
  const p = raw.picks && typeof raw.picks === 'object' ? raw.picks : {};
  const hist = dlArr(raw.picks_history).map((hh) => ({ at: dlStr(hh.at), summary: dlStr(hh.summary), items: dlArr(hh.items).map(dlPickN).filter((k) => k.code || k.name) }))
    .filter((hh) => hh.items.length).sort((a, b) => b.at.localeCompare(a.at));
  const ys = items.map((x) => x.last?.y).filter((y) => y != null);
  const fl = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  const run = raw.run && typeof raw.run === 'object' ? raw.run : {};
  return {
    generated: dlStr(raw.generated), asof: dlDay(raw.asof),
    rules: { now: rule(r.now), next: rule(r.next), near: dlNum(r.near_pct), note: dlStr(r.note) },
    filters: { raw: fl }, items, byCode: new Map(items.map((x) => [x.code, x])),
    picks: { at: dlStr(p.at), stale: p.stale === true, summary: dlStr(p.summary), items: dlArr(p.items).map(dlPickN).filter((k) => k.code || k.name) },
    hist: hist.filter((hh) => hh.at !== dlStr(p.at)), // 지금 추천과 같은 회차는 이력에서 뺀다
    year: ys.length ? Math.max(...ys) : null, // 표 머리 '○○○○ 결산'·매출·영업이익 3개년 기준
    sources: dlArr(raw.sources).map((s) => ({ name: dlStr(s.name), use: dlStr(s.use) })).filter((s) => s.name),
    errors: dlList1(run.errors),
  };
}

function dlLoad(force) {
  if (!force && dlS.at && Date.now() - dlS.at < DL_TTL) return Promise.resolve();
  if (!dlS.loading) {
    dlS.loading = (async () => {
      const d = await STORE.readText(DL_FILE);
      let raw = null;
      if (d.text) { try { raw = JSON.parse(d.text); } catch { throw new Error('상폐 위험 자료 형식 오류'); } }
      dlS.data = raw && typeof raw === 'object' ? dlNorm(raw) : null;
      dlS.at = Date.now();
      TAB_INFO['deals/delist'] = dlInfo(dlS.data);
    })().finally(() => { dlS.loading = null; });
  }
  return dlS.loading;
}

/* ---------- 표시 형식 ---------- */
const DL_NA = '<span class="muted">–</span>';
const dlFmt = (n, d = 1) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });
const dlEok = (v) => (dlNum(v) == null ? '–' : `${dlFmt(v)}억`);
const dlPct = (v) => (dlNum(v) == null ? '–' : `${dlFmt(v)}%`);
const dlX = (v) => (dlNum(v) == null ? '–' : `${dlFmt(v)}배`);
const dlWon = (v) => (dlNum(v) == null ? '–' : `${dlFmt(v, 0)}원`);
const dlPbr = (v) => (dlNum(v) == null ? '–' : v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
// 표 숫자: 손실은 빨간 괄호 (17) — kosdaq-watch와 같게
const dlI = (v, d = 0) => (dlNum(v) == null ? DL_NA : v < 0 ? `<span class="dl-neg">(${dlFmt(Math.abs(v), d)})</span>` : dlFmt(v, d));
const dlNeg = (v) => (dlNum(v) != null && v < 0 ? 'dl-neg' : '');
const dlNm = (s) => esc(s).replace(/·(?=[가-힣])/g, '$&<wbr>');
const dlFrom = (s) => (/^\d{4}-\d{2}$/.test(s) ? s : '');
const dlNextY = () => dlFrom(dlS.data?.rules.next.from).slice(0, 4) || '2027';
const dlAngOk = (x, k) => x.angles?.[k]?.ok === true;
function dlStageName(n) {
  const r = dlS.data?.rules;
  if (n === 1) return '현행 미달';
  if (n === 2) return `${dlFrom(r?.next.from) || '상향 기준'} 미달`;
  if (n === 3) return `여유 ${r?.near != null ? dlFmt(r.near) : 20}%`;
  return '';
}
function dlTime(s, withTime = true) {
  const g = s ? new Date(s) : null;
  if (!g || isNaN(g)) return '';
  return withTime ? `${ymd(g) === today() ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())}` : ymd(g);
}
const dlBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const dlKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
// 배지: 앵글(CB 파랑·바이아웃 보라), 상태(관리·정지·잠식 빨강, 투자조합·탈락 사유 주황, 양호 초록)
const dlBadge = (t, c) => `<span class="dl-bdg ${c}">${esc(t)}</span>`;
const dlAngBadge = (t) => dlBadge(t, t === 'CB' ? 'b-cb' : 'b-bo');
const dlAngBadges = (angle) => angle.split(/\s*[·,/]\s*/).filter(Boolean).map(dlAngBadge).join('');
function dlStateBadges(x) {
  const fl = [x.flags.mgmt && '관리종목', x.flags.halted && '거래정지', x.flags.impaired && '자본잠식'].filter(Boolean);
  const b = fl.map((t) => dlBadge(t, 'b-dan'));
  if (x.holder.fund) b.push(dlBadge('투자조합', 'b-warn'));
  x.reasons.filter((t) => !fl.includes(t) && !/투자조합/.test(t)).forEach((t) => b.push(dlBadge(t, 'b-warn')));
  return b.length ? b.join('') : x.pass ? dlBadge('양호', 'b-ok') : DL_NA;
}
const dlRisk = (x) => (x.flags.mgmt ? 150 : 0) + (x.flags.halted ? 150 : 0) + (x.flags.impaired ? 100 : 0) + (x.holder.fund ? 40 : 0) + x.reasons.length;

/* ---------- 목록 ---------- */
const dlFinOf = (x, y) => x.fin.find((f) => f.y === y) || null;
const dlYears = () => { const y = dlS.data?.year; return y ? [y - 2, y - 1, y] : []; };
// 정렬: 머리글 data-k → 값. 처음 누를 때 작은 순인 칸(이름·업종·단계·부족분·PBR·EV/영업이익·메자닌), 나머지는 큰 순. 기본은 점수순(좋은 기업 먼저).
// 값이 없는 회사(EV/영업이익은 영업적자로 0 이하인 회사도)는 방향과 상관없이 맨 뒤
const DL_ASC = ['name', 'sector', 'stage', 'gap', 'pbr', 'evop', 'mezz'];
function dlVal(k) {
  const [y1, y2, y3] = dlYears();
  return {
    score: (x) => (x.pass ? 1000 : 0) + (x.score ?? 0), name: (x) => x.name, sector: (x) => x.sector || null, stage: (x) => x.stage, mcap: (x) => x.mcap, gap: (x) => x.gapNextPct,
    ast: (x) => x.last?.assets, lia: (x) => x.last?.liab, eq: (x) => x.last?.equity,
    r1: (x) => dlFinOf(x, y1)?.rev, r2: (x) => dlFinOf(x, y2)?.rev, r3: (x) => dlFinOf(x, y3)?.rev,
    o1: (x) => dlFinOf(x, y1)?.op, o2: (x) => dlFinOf(x, y2)?.op, o3: (x) => dlFinOf(x, y3)?.op,
    pbr: (x) => x.pbr, evop: (x) => (x.evOp > 0 ? x.evOp : null), mezz: (x) => x.mezz.ratio,
    angle: (x) => (dlAngOk(x, 'cb') ? 1 : 0) + (dlAngOk(x, 'buyout') ? 1 : 0), risk: dlRisk,
  }[k];
}
function dlList() {
  const d = dlS.data; if (!d) return [];
  const q = dlS.q.trim().toLowerCase(), st = Number(dlS.stage) || 0;
  const rows = d.items.filter((x) => (!dlS.good || x.pass) && (!dlS.cb || dlAngOk(x, 'cb')) && (!dlS.bo || dlAngOk(x, 'buyout'))
    && (!st || x.stage === st) && (!dlS.mkt || x.market === dlS.mkt) && (!q || x.q.includes(q)));
  const v = dlVal(dlS.sk) || dlVal('score'), dir = dlS.asc ? 1 : -1;
  return rows.map((x) => [x, v(x)]).sort(([a, va], [b, vb]) => {
    const na = va == null, nb = vb == null;
    if (na || nb) return (na - nb) || a.idx - b.idx;
    const c = typeof va === 'string' ? va.localeCompare(vb, 'ko') : va - vb;
    return c * dir || a.idx - b.idx;
  }).map(([x]) => x);
}

const DL_ARR = { n: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.5l5-5 5 5"/><path d="M7 14.5l5 5 5-5"/></svg>',
  up: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15l7-7 7 7"/></svg>',
  dn: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l7 7 7-7"/></svg>' };
// 머리글 칸: 숫자 칸은 화살표를 글자 앞에 둬 글자 끝 = 값 끝(오른쪽 맞춤), 글 칸은 글자 뒤
function dlTh(k, label, cls = '', attrs = '') {
  const on = dlS.sk === k, arr = `<span class="arr${on ? ' on' : ''}" aria-hidden="true">${on ? (dlS.asc ? DL_ARR.up : DL_ARR.dn) : DL_ARR.n}</span>`;
  const num = /\bnum\b/.test(cls);
  return `<th class="${cls}${on ? ' sorted' : ''}" data-k="${k}"${attrs} aria-sort="${on ? (dlS.asc ? 'ascending' : 'descending') : 'none'}">${num ? `${arr}${label}` : `${label}${arr}`}</th>`;
}
function dlHead() {
  const ys = dlYears(), y = dlS.data?.year;
  return `<thead><tr>
    ${dlTh('score', '번호', 'num dl-no', ' rowspan="2"')}${dlTh('name', '기업명', 'stick dl-nm', ' rowspan="2"')}${dlTh('sector', '업종', '', ' rowspan="2"')}${dlTh('stage', '단계', '', ' rowspan="2"')}
    ${dlTh('mcap', '시총(억)', 'num', ' rowspan="2"')}${dlTh('gap', `${dlNextY()} 부족분(억)`, 'num', ' rowspan="2"')}
    <th colspan="3" class="grp-h grp">재무상태(${y ? `${y} 결산, ` : ''}억)</th><th colspan="3" class="grp-h grp">매출(억)</th><th colspan="3" class="grp-h grp">영업이익(억)</th>
    ${dlTh('pbr', 'PBR', 'num grp', ' rowspan="2"')}${dlTh('evop', 'EV/영업이익', 'num', ' rowspan="2"')}${dlTh('mezz', '메자닌(%)', 'num', ' rowspan="2"')}
    ${dlTh('angle', '앵글', 'grp dl-bh', ' rowspan="2"')}${dlTh('risk', '상태', 'dl-bh', ' rowspan="2"')}
  </tr><tr class="sub">
    ${dlTh('ast', '자산', 'num grp')}${dlTh('lia', '부채', 'num')}${dlTh('eq', '자본', 'num')}
    ${ys.map((yy, i) => dlTh(`r${i + 1}`, String(yy), `num${i ? '' : ' grp'}`)).join('')}${ys.map((yy, i) => dlTh(`o${i + 1}`, String(yy), `num${i ? '' : ' grp'}`)).join('')}
  </tr></thead>`;
}

function dlRow(x, i) {
  const open = dlS.open.has(x.code), ys = dlYears(), l = x.last, y = dlS.data.year;
  const mark = l && y && l.y !== y ? `<span class="yr">'${String(l.y).slice(2)}</span>` : ''; // 최근 결산이 다른 회사보다 이르면 연도 표시
  const gap = x.gapNext != null && x.gapNext > 0 ? `${dlI(x.gapNext, 1)}<span class="yr">${dlFmt(x.gapNextPct ?? 0, 0)}%</span>` : DL_NA;
  const ang = x.angles ? Object.keys(DL_ANG_L).filter((k) => dlAngOk(x, k)).map((k) => dlAngBadge(DL_ANG_L[k])).join('') : '';
  return `<tr class="dl-tr${i % 2 ? ' z' : ''}${open ? ' open' : ''}" data-id="${esc(x.code)}" data-n="${i}" tabindex="0" aria-expanded="${open}">
    <td class="num dl-no">${i + 1}</td>
    <td class="dl-nm stick"><span class="dl-ttl">${dlNm(x.name)}</span><span class="dl-cd">${esc(x.code)}</span>${x.biz ? `<div class="biz" title="${esc(x.biz)}">${esc(x.biz)}</div>` : ''}</td>
    <td class="sector" title="${esc(x.sector)}">${esc(x.sector) || DL_NA}</td>
    <td class="dl-stg">${x.stage ? `<span class="dl-s${x.stage}">${x.stage}단계</span><span class="yr">${esc(dlStageName(x.stage))}</span>` : DL_NA}</td>
    <td class="num"><b>${dlI(x.mcap, 1)}</b></td><td class="num">${gap}</td>
    <td class="num grp">${dlI(l?.assets)}${mark}</td><td class="num">${dlI(l?.liab)}</td><td class="num">${dlI(l?.equity)}</td>
    ${ys.map((yy, k) => `<td class="num${k ? '' : ' grp'}">${dlI(dlFinOf(x, yy)?.rev)}</td>`).join('')}
    ${ys.map((yy, k) => `<td class="num${k ? '' : ' grp'}">${dlI(dlFinOf(x, yy)?.op)}</td>`).join('')}
    <td class="num grp">${x.pbr != null ? dlPbr(x.pbr) : DL_NA}</td><td class="num">${x.evOp != null ? dlI(x.evOp, 1) : DL_NA}</td><td class="num">${x.mezz.ratio != null ? dlFmt(x.mezz.ratio) : DL_NA}</td>
    <td class="grp dl-ang">${ang || DL_NA}</td><td class="risk">${dlStateBadges(x)}</td>
  </tr>${open ? `<tr class="dl-xrow" data-x="${esc(x.code)}"><td colspan="${DL_COLS}"><div class="dl-xin">${dlDetail(x)}</div></td></tr>` : ''}`;
}

/* ---------- 펼친 행 ---------- */
function dlDetail(x) {
  const h = x.holder, r = dlS.data.rules, pc = (v) => (v != null ? `<span class="${dlNeg(v)}">${dlPct(v)}</span>` : DL_NA);
  const ruleFrom = x.stage === 1 ? dlFrom(r.now.from) : dlFrom(r.next.from);
  const holder = h.name ? `${dlNm(h.name)}${h.pct != null ? ` ${dlPct(h.pct)}` : ''}${h.fund ? ` ${dlBadge('투자조합', 'b-warn')}` : ''}` : DL_NA;
  const cap = `${dlKv('최대주주', holder)}${dlKv('시총', `${dlEok(x.mcap)}${x.close != null ? ` · 종가 ${dlWon(x.close)}` : ''}`)}
    ${dlKv('적용 기준', x.rule != null ? `${dlEok(x.rule)}${ruleFrom ? ` · ${ruleFrom}~` : ''}` : '')}
    ${dlKv(`${dlNextY()} 부족분`, x.gapNext != null ? (x.gapNext > 0 ? `${dlEok(x.gapNext)} · 시총의 ${dlPct(x.gapNextPct)}` : '없음') : '')}
    ${dlKv('현행 부족분', x.stage === 1 && x.gap != null ? `${dlEok(x.gap)} · 시총의 ${dlPct(x.gapPct)}` : '')}
    ${dlKv('연속 미달', x.below ? `${dlFmt(x.below, 0)}거래일` : '')}${dlKv('거래대금', x.turnover != null ? `${dlEok(x.turnover)} · 20일 평균` : '')}`;
  const val = `${dlKv('순현금', x.netCash != null ? `<span class="${dlNeg(x.netCash)}">${dlEok(x.netCash)}</span>` : DL_NA)}${dlKv('유형자산', x.ppe != null ? dlEok(x.ppe) : DL_NA)}
    ${dlKv('EV', x.ev != null ? dlEok(x.ev) : DL_NA)}${dlKv('EV/영업이익', x.evOp != null ? dlX(x.evOp) : DL_NA)}${dlKv('영업이익률', pc(x.opm))}
    ${dlKv('매출 성장', x.revCagr != null ? `${pc(x.revCagr)} · 연평균` : DL_NA)}${dlKv('PBR', x.pbr != null ? dlPbr(x.pbr) : DL_NA)}
    ${dlKv('영업흑자', x.profitYears != null ? `${x.fin.length || 3}년 중 ${dlFmt(x.profitYears, 0)}년` : '')}`;
  const one = (k) => { const a = x.angles?.[k]; return !a ? DL_NA : a.ok ? '<span class="dl-ok">가능</span>' : a.why.length ? a.why.map(esc).join(' · ') : '불가'; };
  const verdict = `${dlKv('좋은 기업', x.pass ? '<span class="dl-ok">해당</span>' : x.reasons.length ? x.reasons.map(esc).join(' · ') : '미해당')}
    ${x.angles ? `${dlKv('CB', one('cb'))}${dlKv('바이아웃', one('buyout'))}` : ''}`;
  const pk = dlS.data.picks.items.find((k) => k.code === x.code);
  const links = [
    { url: `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(x.name)}`, label: 'DART' },
    { url: `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(x.code)}`, label: '네이버 금융' },
  ].map((lk) => `<a class="ipo-a" href="${esc(lk.url)}" target="_blank" rel="noopener noreferrer">${esc(lk.label)}${ico('ext', 'sm')}</a>`).join('');
  return `<div class="ipo-dhead">${x.biz ? `<p class="ipo-sum1">${esc(x.biz)}</p>` : '<p></p>'}${dlPipe(x)}</div>
    <div class="dl-xgrid">${dlBox('지분·시총', cap)}${dlBox('현금·밸류', val)}${dlBox('판정', verdict)}${pk ? dlBox('AI 추천', `<div class="dl-pkb">${dlPickBody(pk)}</div>`, pk.angle ? dlAngBadges(pk.angle) : '') : ''}</div>
    ${dlMezzBox(x)}<div class="ipo-links">${links}</div>`;
}

function dlMezzBox(x) {
  const m = x.mezz;
  const sub = m.n != null || m.amt != null ? `최근 3년 ${dlFmt(m.n || 0, 0)}건 · ${dlEok(m.amt)} · 시총의 ${dlPct(m.ratio)}` : '';
  if (!m.list.length) return dlBox('메자닌·유증 이력', '<p class="ipo-p muted">없음</p>', esc(sub));
  return dlBox('메자닌·유증 이력', `<table class="ipo-tbl dl-mz"><thead><tr><th>날짜</th><th>종류</th><th>금액</th><th>전환가</th><th>리픽싱 하한</th><th>투자자</th></tr></thead><tbody>${m.list.map((e) => `<tr>
    <td>${e.dt ? yymd(e.dt) : '–'}</td><td>${esc(e.type) || '–'}</td><td>${dlEok(e.amount)}</td><td data-k="전환가">${dlWon(e.conv)}</td><td data-k="리픽싱 하한">${dlWon(e.refix)}</td><td>${e.investors.map(dlNm).join(', ') || '–'}</td></tr>`).join('')}</tbody></table>`, esc(sub));
}

// '파이프라인에 있음' 링크의 data-pp-ref = 파이프라인 화면이 그 딜을 펼쳐 보여 줄 때 쓰는 ref
function dlPipe(x) {
  if (typeof pipeAdd !== 'function') return '';
  const ref = `delist:${x.code}`;
  let has = false;
  try { has = typeof pipeHas === 'function' && !!pipeHas(ref); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(ref)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-dl-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}

/* ---------- AI 추천 ---------- */
const dlPickBody = (k) => `<ul class="th">${k.thesis.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
  + `<div class="km">${k.km ? `📊 ${esc(k.km)}` : ''}</div><div class="st">${esc(k.structure)}</div><div class="rk">${k.risks ? `⚠ ${esc(k.risks)}` : ''}</div>`;
function dlPicks() {
  const d = dlS.data, p = d?.picks;
  if (!p || (!p.items.length && !d.hist.length)) return '';
  const card = (k) => {
    const x = d.byCode.get(k.code);
    return `<div class="dl-card${x ? '' : ' off'}"${x ? ` role="button" tabindex="0" data-dl-go="${esc(k.code)}"` : ''}>
      <div class="nm"><b>${dlNm(k.name || x?.name || k.code)}</b>${k.code ? `<span class="cd">${esc(k.code)}</span>` : ''}${k.angle ? `<span class="ag">${dlAngBadges(k.angle)}</span>` : ''}</div>
      ${dlPickBody(k)}</div>`;
  };
  const hist = d.hist.length ? `<details class="dl-hist" id="dl-hist"${dlS.hist ? ' open' : ''}><summary>지난 추천 이력</summary>${d.hist.map((hh) => `
      <div class="h-run">${esc(dlTime(hh.at, false) || hh.at)}${hh.summary ? `<span class="h-sum">${esc(hh.summary)}</span>` : ''}</div>
      ${hh.items.map((k) => `<div class="h-pick">${k.angle ? `[${esc(k.angle)}] ` : ''}<b>${dlNm(k.name)}</b>${k.code ? `(${esc(k.code)})` : ''}${k.thesis.length ? ` — ${esc(k.thesis.join(' · '))}` : ''}</div>`).join('')}`).join('')}</details>` : '';
  const t = dlTime(p.at, false);
  return `<section class="card dl-ai"><div class="dl-ai-head"><span class="ttl">AI 추천</span>${t ? `<span class="meta${p.stale ? ' ipo-stale' : ''}"${p.stale ? ' title="오늘 선정 실패, 직전 추천"' : ''}>${esc(t)}</span>` : ''}</div>
    ${p.summary ? `<p class="dl-ai-note">${esc(p.summary)}</p>` : ''}
    ${p.items.length ? `<div class="dl-ai-grid">${p.items.map(card).join('')}</div>` : ''}${hist}</section>`;
}

/* ---------- 요약 줄·조건 줄 ---------- */
function dlSummary() {
  const d = dlS.data; if (!d) return '';
  const g = dlTime(d.generated), gd = d.generated ? new Date(d.generated) : null;
  const n = (f) => d.items.filter(f).length;
  return `${g ? `<span class="${gd && Date.now() - gd > 36 * 3600000 ? 'ipo-stale' : ''}">${g} 수집</span>` : ''}${d.asof ? `<span>기준일 ${yymd(d.asof)}</span>` : ''}`
    + [1, 2, 3].map((s) => `<span>${s}단계 <b>${n((x) => x.stage === s)}</b></span>`).join('') + `<span>좋은 기업 <b>${n((x) => x.pass)}</b></span>`
    + (d.items.some((x) => x.angles) ? Object.entries(DL_ANG_L).map(([k, l]) => `<span>${l} <b>${n((x) => dlAngOk(x, k))}</b></span>`).join('') : '')
    + (d.errors.length ? `<span class="ipo-stale" title="${esc(d.errors.join('\n'))}">수집 오류 ${d.errors.length}</span>` : '');
}

function dlControls() {
  const ck = (id, on, label) => `<label class="dl-ck"><input type="checkbox" class="check" id="${id}"${on ? ' checked' : ''}>${label}</label>`;
  const sel = (id, label, opts, cur) => `<select class="select" id="${id}" aria-label="${label}">${opts.map(([k, l]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="ipo-search dl-q"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="dl-q" type="search" placeholder="기업명 검색" value="${esc(dlS.q)}" autocomplete="off" aria-label="기업명 검색"></div>
    ${ck('dl-good', dlS.good, '좋은 기업만')}${ck('dl-cb', dlS.cb, 'CB 가능')}${ck('dl-bo', dlS.bo, '바이아웃 가능')}
    ${sel('dl-stage', '단계', [['', '전체 단계'], ...[1, 2, 3].map((n) => [String(n), `${n}단계 ${dlStageName(n)}`])], dlS.stage)}
    ${sel('dl-mkt', '시장', [['', '전체 시장'], ['코스피', '코스피'], ['코스닥', '코스닥']], dlS.mkt)}
    <button class="btn ghost" type="button" id="dl-xls">${ico('file', 'sm')}엑셀 다운로드</button><span class="dl-count" id="dl-count"></span>`;
}

/* ---------- 엑셀(CSV, 지금 보이는 목록·정렬 그대로) ---------- */
function dlCsv() {
  const d = dlS.data; if (!d) return;
  const ys = dlYears(), cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['번호', '기업명', '종목코드', '시장', '업종', '단계', '시총(억)', `${dlNextY()} 부족분(억)`, `${dlNextY()} 부족분(%)`, '자산(억)', '부채(억)', '자본(억)',
    ...ys.map((y) => `매출 ${y}(억)`), ...ys.map((y) => `영업이익 ${y}(억)`), 'PBR', 'EV(억)', 'EV/영업이익', '메자닌(%)', '순현금(억)', '유형자산(억)', '최대주주', '최대주주 지분(%)',
    '좋은 기업', 'CB', '바이아웃', '상태·탈락 사유', '사업'];
  const rows = dlList().map((x, i) => [i + 1, x.name, `'${x.code}`, x.market, x.sector, x.stage ? `${x.stage}단계 ${dlStageName(x.stage)}` : '', x.mcap, x.gapNext, x.gapNextPct,
    x.last?.assets, x.last?.liab, x.last?.equity, ...ys.map((y) => dlFinOf(x, y)?.rev), ...ys.map((y) => dlFinOf(x, y)?.op), x.pbr, x.ev, x.evOp, x.mezz.ratio, x.netCash, x.ppe,
    x.holder.name, x.holder.pct, x.pass ? 'O' : '', dlAngOk(x, 'cb') ? 'O' : '', dlAngOk(x, 'buyout') ? 'O' : '',
    [...new Set([x.flags.mgmt && '관리종목', x.flags.halted && '거래정지', x.flags.impaired && '자본잠식', x.holder.fund && '투자조합', ...x.reasons].filter(Boolean))].join(', '), x.biz]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `상폐위험_${(d.asof || today()).replace(/-/g, '').slice(2)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- 그리기 ---------- */
function dlBody() {
  if (!dlS.data) return '<div class="empty">수집 자료 없음</div>';
  const list = dlList();
  const cnt = dlS.host?.querySelector('#dl-count'); if (cnt) cnt.textContent = `${list.length.toLocaleString('ko-KR')} / 전체 ${dlS.data.items.length.toLocaleString('ko-KR')}곳`;
  return `<table class="dl-tbl">${dlHead()}<tbody>${list.length ? list.map(dlRow).join('') : `<tr><td colspan="${DL_COLS}" class="dl-empty">조건에 맞는 회사 없음</td></tr>`}</tbody></table>`;
}
const dlRowEl = (root, id) => [...root.querySelectorAll('tr.dl-tr[data-id]')].find((r) => r.dataset.id === id);
// 펼친 칸은 표가 옆으로 밀려도 보이는 폭에 맞춰 둔다(표 상자 폭을 --dl-bw로)
function dlFitX() {
  const box = dlS.host?.querySelector('#dl-body'); if (!box) return;
  box.style.setProperty('--dl-bw', `${box.clientWidth}px`);
}

// 펼친 행을 보여 줄 때: 표 상자는 맨 왼쪽으로, 세로는 행 머리가 화면 위쪽(8 띄움)에 오게
function dlReveal(r) {
  const sc = r.closest('.scroll'), box = r.closest('#dl-body');
  if (box) box.scrollLeft = 0;
  if (!sc) { r.scrollIntoView({ block: 'start' }); return; }
  sc.scrollTop += r.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8;
}

function dlDraw() {
  const host = dlS.host; if (!host || !host.isConnected) return;
  const b = host.querySelector('#dl-body'); if (!b) return;
  const sum = host.querySelector('#dl-sum'); if (sum) sum.innerHTML = dlSummary();
  const pk = host.querySelector('#dl-picks'); if (pk) pk.innerHTML = dlPicks();
  const sl = b.scrollLeft;
  b.innerHTML = dlBody();
  b.scrollLeft = sl;
  dlFitX();
  dlViewSave();
  if (dlS.focus != null) {
    const r = dlRowEl(b, dlS.focus);
    dlS.focus = null;
    if (r) dlReveal(r);
  }
}

function dlToggle(tr) {
  const id = tr.dataset.id, x = dlS.data?.byCode.get(id); if (!x) return;
  if (dlS.open.has(id)) dlS.open.delete(id); else dlS.open.add(id);
  dlViewSave();
  const nx = tr.nextElementSibling;
  if (nx && nx.classList.contains('dl-xrow')) nx.remove();
  tr.outerHTML = dlRow(x, Number(tr.dataset.n) || 0);
  dlFitX();
}

// 펼친 행의 파이프라인 버튼만 다시 그린다. id가 없으면 펼친 행 전부
function dlPipeDraw(id) {
  if (!dlS.host || !dlS.host.isConnected) return;
  dlS.host.querySelectorAll('#dl-body tr.dl-xrow').forEach((r) => {
    if (id != null && r.dataset.x !== id) return;
    const x = dlS.data?.byCode.get(r.dataset.x), p = r.querySelector('.ipo-dhead > .rd-pipe');
    if (!x || !p) return;
    const t = document.createElement('template'); t.innerHTML = dlPipe(x).trim();
    const n = t.content.firstElementChild;
    if (n && !n.isEqualNode(p)) p.replaceWith(n);
  });
}

async function dlPipeAdd(btn) {
  const x = dlS.data?.byCode.get(btn.closest('tr.dl-xrow')?.dataset.x);
  if (!x || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  try { await pipeAdd({ src: DL_PIPE_SRC, ref: `delist:${x.code}`, name: x.name }); }
  catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  dlPipeDraw(x.code);
}

// 조건 줄 값을 상태와 맞춘다(AI 추천 카드로 조건을 풀었을 때)
function dlCtlSync() {
  const h = dlS.host; if (!h) return;
  [['dl-q', 'q'], ['dl-good', 'good'], ['dl-cb', 'cb'], ['dl-bo', 'bo'], ['dl-stage', 'stage'], ['dl-mkt', 'mkt']].forEach(([id, k]) => {
    const el = h.querySelector(`#${id}`); if (el) el[el.type === 'checkbox' ? 'checked' : 'value'] = dlS[k];
  });
}

// AI 추천 카드 → 표에서 그 회사를 펼쳐 보여 준다(조건에 걸려 빠져 있으면 그 조건만 푼다)
function dlGo(code) {
  const x = dlS.data?.byCode.get(code); if (!x) return;
  if (dlS.good && !x.pass) dlS.good = false;
  if (dlS.cb && !dlAngOk(x, 'cb')) dlS.cb = false;
  if (dlS.bo && !dlAngOk(x, 'buyout')) dlS.bo = false;
  if (dlS.stage && Number(dlS.stage) !== x.stage) dlS.stage = '';
  if (dlS.mkt && dlS.mkt !== x.market) dlS.mkt = '';
  if (dlS.q && !x.q.includes(dlS.q.trim().toLowerCase())) dlS.q = '';
  dlCtlSync();
  dlS.open.add(code); dlS.focus = code;
  dlDraw();
}

function dlBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.closest('#dl-ref')) {
      dlLoad(true).then(dlDraw).catch((e) => toast(e.message));
      if (typeof pipeLoad === 'function') pipeLoad(true).then(() => dlPipeDraw()).catch(() => {}); // 다른 분이 그사이 올린 딜도 '있음'으로
      return;
    }
    if (t.closest('#dl-xls')) { dlCsv(); return; }
    const pb = t.closest('[data-dl-pipe]'); if (pb) { dlPipeAdd(pb); return; }
    const go = t.closest('[data-dl-go]'); if (go) { dlGo(go.dataset.dlGo); return; }
    const th = t.closest('th[data-k]');
    if (th) { const k = th.dataset.k; if (dlS.sk === k) dlS.asc = !dlS.asc; else { dlS.sk = k; dlS.asc = DL_ASC.includes(k); } dlDraw(); return; }
    if (t.closest('a, input, select, label, .dl-xrow')) return;
    const tr = t.closest('tr.dl-tr'); if (tr) dlToggle(tr);
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const go = ev.target.closest?.('[data-dl-go]'), tr = ev.target.matches?.('tr.dl-tr') ? ev.target : null;
    if (go) { ev.preventDefault(); dlGo(go.dataset.dlGo); } else if (tr) { ev.preventDefault(); dlToggle(tr); }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'dl-q') { dlS.q = ev.target.value; dlDraw(); } });
  root.addEventListener('change', (ev) => {
    const t = ev.target, k = { 'dl-good': 'good', 'dl-cb': 'cb', 'dl-bo': 'bo', 'dl-stage': 'stage', 'dl-mkt': 'mkt' }[t.id];
    if (k) { dlS[k] = t.type === 'checkbox' ? t.checked : t.value; dlDraw(); }
  });
  root.addEventListener('toggle', (ev) => { if (ev.target.id === 'dl-hist') { dlS.hist = ev.target.open; dlViewSave(); } }, true);
}

let dlRO = null;
async function renderDelist(host) {
  dlS.host = host;
  host.innerHTML = `<div class="ipo-page dl-page" id="dl-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="dl-sum"></div>
      ${infoBtn('deals/delist')}
      <button class="btn ghost" type="button" id="dl-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <div id="dl-picks"></div>
    <div class="dl-ctl" id="dl-ctl">${dlControls()}</div>
    <div class="dl-tbox" id="dl-body"><div class="empty">불러오는 중</div></div></div>`;
  dlBind(host.querySelector('#dl-root'));
  if (dlRO) dlRO.disconnect();
  if (window.ResizeObserver) { dlRO = new ResizeObserver(dlFitX); dlRO.observe(host.querySelector('#dl-body')); }
  try { await dlLoad(); }
  catch (e) {
    const b = dlS.host === host && host.querySelector('#dl-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (dlS.host !== host || !host.isConnected) return;
  host.querySelector('#dl-ctl').innerHTML = dlControls(); // 단계 이름은 자료의 기준으로 정해지므로 읽은 뒤 다시
  dlDraw();
  // '파이프라인에 있음' 표시가 처음부터 맞게 미리 읽고, 다 읽으면 펼친 행의 버튼만 다시 그림
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (dlS.host === host) dlPipeDraw(); }).catch(() => {});
}

/* 다른 화면(파이프라인 등)에서 ref('delist:<종목코드>')로 한 회사를 펼쳐 보여 줄 때: 탭 열기 전에 부르고 돌려준 주소로 이동 */
function delistFocus(ref) {
  const m = /^delist:(.+)$/.exec(String(ref || ''));
  if (!m) return '';
  Object.assign(dlS, { q: '', good: false, cb: false, bo: false, stage: '', mkt: '' });
  dlS.open.add(m[1]); dlS.focus = m[1];
  dlViewSave();
  return '#deals/delist';
}

/* ---------- 화면 설명(ⓘ) — 근거: 딜레이더 판단·데이터 노트 6절, 07. 전략\[스페이스인베스트먼트] 전략_261104.md 138·148~150·499행. 기준 값은 delist.json filters에서 읽는다 ---------- */
// filters 한 묶음(good·cb·buyout)을 [기준, 값] 줄로. 아는 키는 말로, 모르는 키는 이름·값 그대로
function dlRuleRows(o) {
  if (!o || typeof o !== 'object') return [];
  const n = (v) => (typeof v === 'number' ? dlFmt(v) : dlStr(v));
  const done = new Set(), rows = [];
  const use = (k) => { done.add(k); return o[k]; };
  const has = (k) => o[k] != null && o[k] !== false;
  if (has('profit_years_min')) rows.push(['영업흑자', `최근 3개 사업연도 중 ${n(use('profit_years_min'))}년 이상`]);
  ['last_profit', 'recent_profit', 'last_op_positive', 'profit_last'].forEach((k) => { if (has(k)) { use(k); rows.push(['최근 연도', '영업흑자']); } });
  ['rev_min', 'revenue_min', 'min_rev'].forEach((k) => { if (has(k)) rows.push(['최근 매출', `${n(use(k))}억 이상`]); });
  ['mezz_ratio_max', 'mezz_max'].forEach((k) => { if (has(k)) rows.push(['미전환 메자닌', `최근 3년 CB·BW·EB·제3자배정 유증 발행액이 시총의 ${n(use(k))}% 이하`]); });
  ['gap_next_ratio_max', 'gap_ratio_max', 'gap_max'].forEach((k) => { if (has(k)) rows.push(['2027 부족분', `2027-07 기준까지 모자란 시총이 지금 시총의 ${n(use(k))}% 이하`]); });
  const evLo = ['ev_min'].find(has), evHi = ['ev_max'].find(has);
  if (evLo || evHi) rows.push(['EV', evLo && evHi ? `${n(use(evLo))}~${n(use(evHi))}억` : evLo ? `${n(use(evLo))}억 이상` : `${n(use(evHi))}억 이하`]);
  ['ev_op_max', 'evop_max'].forEach((k) => { if (has(k)) rows.push(['EV/영업이익', `${n(use(k))}배 이하`]); });
  ['holder_pct_min', 'holder_min', 'major_pct_min'].forEach((k) => { if (has(k)) rows.push(['최대주주 지분', `특수관계인 합계 ${n(use(k))}% 이상`]); });
  ['no_fund', 'exclude_fund', 'fund'].forEach((k) => { if (has(k)) { use(k); rows.push(['투자조합 최대주주', '제외']); } });
  if (Array.isArray(o.exclude) && o.exclude.length) rows.push(['제외', use('exclude').map(dlStr).filter(Boolean).join(', ')]);
  Object.keys(o).filter((k) => !done.has(k) && o[k] != null).forEach((k) => rows.push([k, Array.isArray(o[k]) ? o[k].map(n).join(', ') : typeof o[k] === 'object' ? JSON.stringify(o[k]) : n(o[k])]));
  return rows;
}

function dlInfo(d) {
  const r = d?.rules, fr = d?.filters.raw || {};
  const amt = (o) => (o && o['코스피'] != null && o['코스닥'] != null ? `코스피 ${dlFmt(o['코스피'])}억·코스닥 ${dlFmt(o['코스닥'])}억` : '');
  const now = amt(r?.now), next = amt(r?.next), nf = dlFrom(r?.now.from) || '2026-07', xf = dlFrom(r?.next.from) || '2027-07', near = r?.near != null ? dlFmt(r.near) : '20';
  const src = d?.sources.length ? ` · 출처 ${d.sources.map((s) => s.name).join(', ')}` : '';
  // 예전 형식(filters 한 묶음)이면 그것을 좋은 기업 기준으로 보여 준다
  const good = dlRuleRows(fr.good || (fr.cb || fr.buyout ? null : fr)), cb = dlRuleRows(fr.cb), bo = dlRuleRows(fr.buyout);
  const tbl = (rows) => (rows.length ? [{ table: [['기준', '값'], ...rows] }] : ['기준 값은 자료를 읽은 뒤 표시됩니다.']);
  return {
    title: '상폐 위험·CB',
    asof: `${d?.asof ? `기준일 ${d.asof}` : '기준일 –'}${src} · 근거: 딜레이더 판단·데이터 노트 6절, 전략_261104.md 138·148~150·499행`,
    rows: [
      ['무엇인가', [
        '상장폐지 시가총액 요건에 걸렸거나 곧 걸릴 수 있는 코스피·코스닥 회사 목록에서 실적이 받쳐 주는 좋은 기업을 골라내는 화면입니다. 1차 목표는 이 골라내기이고, 골라낸 회사는 CB와 바이아웃 두 앵글로 봅니다.',
        `시총 기준은 ${nf}부터 ${now || '코스피 300억·코스닥 200억'}, ${xf}부터 ${next || '코스피 500억·코스닥 300억'}입니다.`,
        { table: [
          ['단계', '뜻'],
          ['1단계 현행 미달', `지금 기준(${now || '–'})보다 시총이 작음`],
          [`2단계 ${xf} 미달`, `지금 기준은 넘지만 ${xf} 기준(${next || '–'})보다 작음`],
          [`3단계 여유 ${near}%`, `${xf} 기준은 넘지만 그 ${100 + Number(near)}% 안`],
        ] },
        '기준 미달이 30거래일 이어지면 관리종목, 지정 뒤 90거래일 안에 기준 이상이 45거래일 연속 이어지지 않으면 상장폐지입니다(코스닥 상장규정 제53조①5호·제54조①12호). 펼친 행의 연속 미달이 지정까지 남은 날을 가늠하는 값입니다.',
        `보통주만 봅니다. 스팩·리츠·우선주·ETF·ETN은 뺍니다. 일정은 확정이 아닙니다${r?.note ? `(${r.note})` : ''}.`,
      ]],
      ['왜 보나', [
        '시총 요건을 못 맞추면 상장폐지 사유가 됩니다. 실적은 좋은데 시총만 모자란 회사는 시총을 올릴 자금이 필요하거나, 최대주주가 회사를 넘길 이유가 생깁니다. 들어가는 길은 두 가지입니다.',
        { table: [
          ['앵글', '구조', '핵심'],
          ['CB', '시총 보강은 최대주주·SI의 제3자배정 유증, 우리는 CB·BW', '사모 CB는 발행 후 1년 안에 전환청구를 못 해(증권의 발행 및 공시 등에 관한 규정 제5-21조) CB만으로는 상향 판정 전에 시총이 늘지 않음. 유증 투자자 주식은 1년 전매제한'],
          ['바이아웃', '최대주주 블록 인수, SI 동반', '상장을 지키려면 공개매수·자진상폐에 소액주주 지분 매수 비용이 들지만, 상폐 위험이 커진 회사는 그 비용 없이 블록을 넘겨받을 여지가 있고 상폐 위험 자체가 가격 협상력이 됨'],
        ] },
        '우리 펀드의 제3자배정 유증 참여는 대표님 확인 전까지 보류라, CB 앵글의 구조는 최대주주·SI가 유증을 맡고 우리는 CB·BW로 들어가는 것으로 씁니다.',
        '바이아웃 규모 EV 100~300억은 전략 문서의 작업 가정(우리 펀드 투자액 50~100억, EV 100~300억)입니다. EV 50~100억으로 읽을 수도 있어 대표님 확인 1순위로 남아 있습니다. 입찰딜도 EV 300억 이하를 직접 검토합니다(SI 동반 소수지분은 제한 없음).',
        '상폐되면 CB는 조기상환으로 가고 회수는 회사의 현금·자산에 달립니다. 그래서 순현금(현금성자산·단기금융상품 − 차입금·사채)과 유형자산(유형자산+투자부동산)을 같이 봅니다.',
      ]],
      ['어떻게 보나', [
        '좋은 기업: 아래 기준을 모두 통과한 회사입니다. 못 든 회사는 표 끝 상태 칸에 걸린 기준이 배지로 나옵니다.',
        ...tbl(good),
        '좋은 기업 가운데 각 앵글 기준을 통과한 곳은 앵글 칸에 CB·바이아웃 배지가 붙습니다. 행을 펼치면 판정 상자에 앵글별로 안 되는 이유가 나옵니다.',
        'CB 앵글 기준',
        ...tbl(cb),
        '바이아웃 앵글 기준',
        ...tbl(bo),
        `부족분은 ${xf} 기준 − 현재 시총입니다. 지금 기준을 맞춰도 ${xf}에 다시 걸리므로 모든 단계를 ${xf} 기준으로 잽니다. 1단계는 펼친 행에 현행 기준 부족분도 함께 나옵니다.`,
        'AI 추천은 좋은 기업 중 점수 상위 10곳을 Claude가 다시 읽고 5~6곳을 고른 것입니다. 카드에 앵글 배지, 투자 포인트, 핵심 지표(📊), 제안 구조, 가장 큰 위험(⚠)이 붙습니다. 선정이 실패한 날은 직전 결과를 두고 날짜를 빨간색으로 표시합니다. 카드를 누르면 표에서 그 회사가 펼쳐지고, 지난 회차는 지난 추천 이력을 펼치면 날짜별로 나옵니다.',
        `조건 줄: 기업명 검색, 좋은 기업만·CB 가능·바이아웃 가능 체크(여러 개면 모두 만족하는 곳), 단계, 시장. 머리글을 누르면 그 칸으로 정렬되고 다시 누르면 방향이 바뀝니다. 기본은 점수순입니다. 금액은 억 원, 손실은 빨간 괄호로 표시합니다. 부족분은 ${xf} 기준입니다.`,
        '행을 펼치면 최대주주 지분, 시총·적용 기준·부족분, 순현금·유형자산·EV·EV/영업이익·영업이익률·매출 성장, 좋은 기업·앵글별 판정, 메자닌·유증 이력(전환가·리픽싱 하한·투자자), DART·네이버 금융 링크, 파이프라인 올리기가 나옵니다. 엑셀 다운로드는 지금 보이는 목록을 정렬 그대로 CSV로 받습니다.',
        '자료는 매일 09:30에 새로 받습니다. 순현금·유형자산·앵글은 좋은 기업만 채웁니다.',
      ]],
      ['그래서 할 일', [
        '매일: AI 추천을 보고, 표에서 펼쳐 재무·순현금·앵글별 이유를 확인합니다.',
        'CB 가능·바이아웃 가능 체크로 앵글별 후보를 나눠 봅니다. 볼 회사는 파이프라인에 올리고, 연락 상태·메모는 파이프라인에서 관리합니다.',
        'CB: 최대주주·SI 유증과 우리 CB·BW로 시총 기준을 언제까지 맞출 수 있는지부터 확인합니다. 바이아웃: 최대주주의 매각·승계 의사와 SI 동반 후보부터 확인합니다.',
        '확인할 것: CB 컨택 기준(시총 500억 이상·흑자·미전환 메자닌 시총 20% 이하)과 달리 이 목록은 정의상 시총 500억 아래라 예외로 둘지, 일평균 거래대금 기준 금액, 바이아웃 EV 범위의 해석은 대표님 확인이 필요합니다.',
      ]],
    ],
  };
}
TAB_INFO['deals/delist'] = dlInfo(null);
