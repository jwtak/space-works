// 가치평가 v3 JS 엔진. 파이썬 v3/engine.py를 줄 단위로 옮긴 것(같은 함수 이름 step_<이름>, 같은 순서, 같은 덧셈 순서).
// 이 파일은 조각(v3parts/eng/*.js)을 build.mjs가 이어 붙여 만든다. 직접 고치지 말고 조각을 고친 뒤 build.
// 전역 이름: V3E(공개 객체), step_<이름>(단계 함수), 그 밖은 모두 v3e 접두사.
// 식의 정본은 설계서 MODEL_SPEC.md 2장과 engine.py. 고치면 파이썬, JS, 엑셀 세 곳을 같이 고친다. 대조: node _v3_parity.mjs
//
// 열 배치(c.labels[id].cols): hist+fc 과거 h개 + 명시 n개, fc 명시 n개, dcf 명시 n개 + 전환 m개 + TY 1개, one 값 하나([v])
// 덮기 키: sw.<스위치>, a.<가정 키>.<시나리오 또는 *>, m.rf, m.erp, i.<input 안 경로>, o.wacc_shift, o.g, o.ty_margin, o.growth_add, o.fade_g_add, o.fade_g_shift(전환 기간 성장률 전체 가산, 민감도 표 2), o.wacc

var V3E = { version: 3, ready: false, done: [], steps: [], SCEN: ['Bull', 'Base', 'Bear'] };

// ── 작은 도구 (engine.py 「작은 도구」와 같은 이름에 v3e를 붙임) ──────────────
const v3eIsN = (x) => typeof x === 'number' && Number.isFinite(x);
// lerp(s, e, k, n): 시작값과 끝값 직선 보간. k = 0..n−1
const v3eLerp = (s, e, k, n) => (n <= 1 ? s : s + (e - s) * k / (n - 1));
// round_to: 엑셀 ROUND와 같은 반올림(0.5는 올림). 마지막 주당 가치에만 씀
const v3eRound = (x, unit) => (x == null ? null : Math.floor(x / unit + 0.5) * unit);
// dv: 나눗셈. 분모가 0이거나 값이 없으면 null
const v3eDiv = (a, b) => (a == null || b == null || b === 0 ? null : a / b);
// nz(x, d = 0)
const v3eNz = (x, d = 0) => (x == null ? d : x);
// 파이썬 sum(xs): 3.12부터 float 합은 Neumaier 보정 합. 같은 순서, 같은 보정으로 더한다. 파이썬 코드의 sum(...)은 모두 이것으로
function v3eSum(xs) {
  let s = 0, c = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], t = s + x;
    if (Math.abs(s) >= Math.abs(x)) c += (s - t) + x; else c += (x - t) + s;
    s = t;
  }
  return c && Number.isFinite(c) ? s + c : s;
}
// median: 정렬 뒤 가운데, 짝수면 가운데 둘의 평균. 빈 목록이면 null
function v3eMedian(xs) {
  const s = xs.slice().sort((a, b) => a - b), n = s.length;
  return !n ? null : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
// is_to: 끝값 하나 꼴 {to: 끝값}
const v3eIsTo = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && v.to != null && !('start' in v) && !('by_year' in v);
// expand: 가정 값 하나를 명시 기간 n개 배열로. 숫자, {start, end}, {by_year: [...]}, {to: 끝값}, 배열
// {to: 끝값}(끝값 하나 꼴)은 직전 실적 a0에서 출발해 n 해 뒤 끝값에 닿음. 첫 추정 해가 이미 한 칸 움직인 값(원형 EBIT!O66 =($S$66-$N$66)/5+N66).
// 정액은 해마다 (끝 − 실적) ÷ n, 정률(cagr. {to, interp: 'cagr'}나 interp 인자)은 해마다 같은 비율(원형 EBIT!O72). a0을 모르면 끝값을 그대로 n 해
function v3eExpand(v, n, a0, interp) {
  if (v == null) return null;
  if (Array.isArray(v)) { const a = v.slice(0, n); while (a.length < n) a.push(a[a.length - 1]); return a; }
  if (typeof v === 'object') {
    if ('by_year' in v) { const a = v.by_year.slice(0, n); if (!a.length) return null; while (a.length < n) a.push(a[a.length - 1]); return a; }
    if (v3eIsTo(v)) {
      const e = v.to, o = [];
      if (a0 == null) { for (let k = 0; k < n; k++) o.push(e); return o; }
      if ((v.interp || interp) === 'cagr' && a0 > 0 && e > 0) { for (let k = 0; k < n; k++) o.push(a0 * (e / a0) ** ((k + 1) / n)); return o; }
      for (let k = 0; k < n; k++) o.push(a0 + (e - a0) * (k + 1) / n);
      return o;
    }
    const o = []; for (let k = 0; k < n; k++) o.push(v3eLerp(v.start, v.end, k, n)); return o;
  }
  const o = []; for (let k = 0; k < n; k++) o.push(v); return o;
}
// pick: {시나리오: 값}에서 S 값. 없으면 Base, 그것도 없으면 처음 값. 시나리오 dict가 아니면 그대로
function v3ePick(d, S) {
  if (d == null || typeof d !== 'object' || Array.isArray(d) || !V3E.SCEN.some((k) => k in d)) return d;
  if (S in d) return d[S];
  if ('Base' in d) return d.Base;
  return d[Object.keys(d)[0]];
}
// bracket_tax: 누진 법인세(지방소득세 전). base 억원, brackets [[상한(원) 또는 null, 세율], ...]. [세액, 구간별 금액] 을 돌려줌
function v3eBracketTax(base, brackets) {
  let tax = 0.0, lo = 0.0; const parts = [];
  for (const [up, rate] of brackets) {
    const hi = up == null ? base : Math.min(base, up / 1e8), amt = Math.max(hi - lo, 0.0);
    parts.push(amt); tax += amt * rate;
    if (up != null) lo = up / 1e8;
  }
  return [tax, parts];
}
// bracket_rate: 과세표준이 속한 구간 세율
function v3eBracketRate(base, brackets) {
  for (const [up, rate] of brackets) if (up == null || base <= up / 1e8) return rate;
  return brackets[brackets.length - 1][1];
}
// 파이썬과 뜻을 맞추는 도우미
const v3eT = (x) => !(x == null || x === false || x === 0 || x === '' || (Array.isArray(x) && !x.length) || (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length)); // 파이썬 참, 거짓(빈 목록과 빈 dict는 거짓)
const v3eOr = (a, b) => (v3eT(a) ? a : b);                          // 파이썬 a or b
const v3eGet = (o, k, d = null) => (o != null && k in o ? o[k] : d);   // dict.get(k, d): 키가 있으면 null이어도 그 값
const v3eFill = (n, v = null) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = v; return a; }; // [v] * n
const v3eLast = (xs) => xs[xs.length - 1];
const v3eClone = (o) => (o == null ? o : typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const v3eMaxOf = (xs) => { let m = xs[0]; for (let i = 1; i < xs.length; i++) if (xs[i] > m) m = xs[i]; return m; }; // max(목록): 같으면 앞의 것
const v3eMinOf = (xs) => { let m = xs[0]; for (let i = 1; i < xs.length; i++) if (xs[i] < m) m = xs[i]; return m; };

// ── 계산 문맥 (engine.py Ctx) ─────────────────────────────────────────────
// c.inp 사례, c.I = c.input = inp.input, c.tl = inp.timeline, c.sw = inp.switches, c.S 시나리오, c.ov 덮기, c.rows, c.labels, c.checks, c.notes, c.out
function v3eCtx(inp, S, ov) {
  return { inp, I: inp.input, input: inp.input, tl: inp.timeline, sw: inp.switches, S: S || 'Base', ov: ov || {}, rows: {}, labels: {}, checks: [], notes: { why: {} }, out: {} };
}
// c.put(rid, hist, fc, name, fmt, kind, cols): 이름과 서식은 사례의 labels에 있으므로 JS는 값과 열 배치만 둠
function v3ePut(c, rid, hist, fc, cols) {
  if (cols == null) cols = hist != null ? 'hist+fc' : 'fc';
  const vals = (hist != null ? hist : []).concat(fc);
  c.rows[rid] = vals;
  if (!(rid in c.labels)) c.labels[rid] = { cols };
  return vals;
}
// c.one(rid, v): 값 하나
const v3eOne = (c, rid, v) => v3ePut(c, rid, null, [v === undefined ? null : v], 'one');
// c.fc(rid): 명시 기간 값 목록(hist+fc 행이면 뒤쪽을 잘라 낸 사본, 아니면 행 그대로)
function v3eFc(c, rid) { const r = c.rows[rid]; return c.labels[rid].cols === 'hist+fc' ? r.slice(c.H) : r; }
// c.h(rid): 입력 과거 값 목록(없으면 null h개)
function v3eHist(c, rid) { const v = c.I.hist[rid]; return v != null ? v.slice() : v3eFill(c.H); }
// c.a(key): 가정 행
const v3eA = (c, key) => { const r = c.rows['CTL.a.' + key]; return r === undefined ? null : r; };
// c.chk(cid, level, text, value)
function v3eChk(c, id, level, text, value) { c.checks.push({ id, level, text, value: value === undefined ? null : value }); }
// _to_given: 끝값 하나 꼴 {to: 끝값}로 준 가정을 직전 실적 a0에서 출발하는 배열로 펼쳐 A_given에 넣음.
// a0을 모르면 dflt(과거 평균)에서 출발하고 A_to_miss에 적어 점검(to_no_fy0)으로 알림
function v3eToGiven(c, key, a0, interp, dflt) {
  if (!(key in c.A_to)) return;
  const v = c.A_to[key];
  delete c.A_to[key];
  if (v == null) return;
  if (a0 == null) {
    a0 = typeof dflt === 'number' ? dflt : null;
    c.A_to_miss.push(key);
  }
  c.A_given[key] = v3eExpand(v, c.N, a0, interp);
}
// _seta: 가정 행 CTL.a.<key>를 쓴다. 주어진 값이 있으면 그것, 없으면 기본값(숫자나 배열)
// scn = [낮은 값, 높은 값]을 주면 기본값을 쓸 때 Bull은 끝값을 낮은 값, Bear는 높은 값으로(비용률 시나리오 규칙)
function v3eSeta(c, key, dflt, why, scn) {
  if (key in c.A_to) v3eToGiven(c, key, null, null, dflt); // 끝값 하나 꼴인데 직전 실적을 넘겨받지 못한 가정: 기본값(과거 평균)에서 출발, 그것도 없으면 끝값 그대로
  const given = c.A_given[key];
  let arr;
  if (given != null) arr = given;
  else {
    if (v3eT(scn) && c.S !== 'Base' && dflt != null && typeof dflt !== 'object') {
      const end = c.S === 'Bull' ? scn[0] : scn[1];
      if (end != null) dflt = { start: dflt, end };
    }
    arr = v3eExpand(dflt, c.N);
    if (why && !(key in c.notes.why)) c.notes.why[key] = why;
  }
  if (arr == null) arr = v3eFill(c.N);
  v3ePut(c, 'CTL.a.' + key, null, arr);
  return arr;
}

// ── 덮기 (_apply_overrides) ───────────────────────────────────────────────
// 사례를 바꾸지 않고 덮기를 반영한 얕은 사본을 만든다. m.*, o.* 는 c2.ov 에 실려 단계 함수가 읽음
function v3eApplyOverrides(inp, ov) {
  const keys = ov ? Object.keys(ov) : [];
  if (!keys.length) return inp;
  const out = Object.assign({}, inp);
  out.switches = Object.assign({}, inp.switches);
  let I = Object.assign({}, inp.input);
  out.input = I;
  out.ov = Object.assign({}, inp.ov || {}, ov);
  let deep = false;
  for (const k of keys) {
    const v = ov[k];
    if (k.startsWith('sw.')) out.switches[k.slice(3)] = v;
    else if (k.startsWith('a.')) {
      const dot = k.lastIndexOf('.'), key = k.slice(2, dot), S = k.slice(dot + 1);
      if (I.assump === inp.input.assump) { const A = {}; for (const s of Object.keys(inp.input.assump || {})) A[s] = Object.assign({}, inp.input.assump[s]); I.assump = A; }
      for (const s of (S === '*' ? V3E.SCEN : [S])) { if (!(s in I.assump)) I.assump[s] = {}; I.assump[s][key] = v; }
    } else if (k.startsWith('i.')) {
      if (!deep) {
        const keep = I.assump;
        I = v3eClone(inp.input);
        if (keep !== inp.input.assump) I.assump = keep;
        out.input = I; deep = true;
      }
      let node = I; const path = k.slice(2).split('.');
      for (let j = 0; j < path.length - 1; j++) {
        let p = path[j];
        if (/^\d+$/.test(p) && Array.isArray(node)) p = Number(p);
        if (!Array.isArray(node) && !(p in node)) node[p] = {};
        node = node[p];
      }
      const last = path[path.length - 1];
      if (Array.isArray(node) && /^\d+$/.test(last)) node[Number(last)] = v; else node[last] = v;
    }
  }
  return out;
}

// ── 단계 등록과 실행 ──────────────────────────────────────────────────────
// 한 시나리오 단계(E01～E19)는 fn(c), 전체 단계(E20～E24)는 fn(all)
function v3eReg(id, name, fn) {
  const i = V3E.steps.findIndex((s) => s.id === id);
  const s = { id, name, fn, all: Number(id.slice(1)) >= 20 };
  if (i >= 0) V3E.steps[i] = s; else V3E.steps.push(s);
  V3E.steps.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  V3E.done = V3E.steps.map((x) => x.id);
}
const v3eStep = (id) => V3E.steps.find((s) => s.id === id) || null;

// run: 한 시나리오 E01～E19. 계산 문맥을 돌려준다(c.rows, c.out)
function v3eRun(inp, S, ov, upto) {
  const inp2 = v3eApplyOverrides(inp, ov), c = v3eCtx(inp2, S || 'Base', inp2.ov || {});
  for (const s of V3E.steps) {
    if (s.all) break;
    if (upto && s.id > upto) break;
    s.fn(c);
  }
  return c;
}

// runAll: 세 시나리오 + 가중평균, 민감도, 리버스, 결합, 점검. 사례의 py와 같은 모양
function v3eRunAll(inp, ov) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now(), inp2 = v3eApplyOverrides(inp, ov), py0 = inp.py || {};
  const all = { inp: inp2, I: inp2.input, sw: inp2.switches, ov: inp2.ov || {}, runs: {}, checks: [],
    py: { rows: {}, scen: {}, wavg: null, blend: null, sens: null, rdcf: null, ff: null, rel_model: null, wacc_matrix: null, alt: py0.alt, mc: py0.mc, typ: py0.typ, lbo: py0.lbo, rel_plus: py0.rel_plus } };
  for (const s of V3E.steps) if (s.all) s.fn(all);
  const res = all.py;
  res.checks = all.checks;
  res.map = all.map || inp.map || [];
  res.ms = now() - t0;
  return res;
}

// 처음 값 대조: runAll(c, {})의 모든 행을 c.py.rows와 비교 (상대 1e-7. py 값은 소수 10자리로 반올림돼 있음)
function v3eClose(a, b, rel = 1e-7, abs = 2e-10) {
  if (a == null && b == null) return 0;
  if (a == null || b == null || !v3eIsN(a) || !v3eIsN(b)) return a === b ? 0 : Infinity;
  const d = Math.abs(a - b);
  if (d <= abs) return 0;
  const e = d / Math.max(Math.abs(a), Math.abs(b));
  return e <= rel ? 0 : e;
}
function v3eVerify(inp) {
  const out = { n: 0, bad: [], max: 0 };
  if (!inp || !inp.py || !inp.py.rows) return out;
  const res = v3eRunAll(inp, {});
  for (const S of Object.keys(inp.py.rows)) {
    const pr = inp.py.rows[S], jr = res.rows[S] || {};
    for (const id of Object.keys(pr)) {
      const p = pr[id], j = jr[id];
      const pa = Array.isArray(p) ? p : [p], ja = j == null ? [] : Array.isArray(j) ? j : [j];
      for (let col = 0; col < pa.length; col++) {
        out.n++;
        const jv = col < ja.length ? ja[col] : undefined;
        const e = jv === undefined ? Infinity : v3eClose(jv, pa[col]);
        if (e) { out.bad.push({ id, S, col, js: jv === undefined ? null : jv, py: pa[col] }); if (Number.isFinite(e) && e > out.max) out.max = e; }
      }
    }
  }
  return out;
}

V3E.run = v3eRun;
V3E.runAll = v3eRunAll;
V3E.applyOverrides = v3eApplyOverrides;
V3E.verify = v3eVerify;
// valueOnly: 덮기 dict를 받아 Base 주당 가치 하나. 파이썬 engine.value_only와 같게 기본은 반올림 전 값(key = 'ps'면 반올림 값)
V3E.valueOnly = function (inp, ov, key, S) { return v3eGet(v3eRun(inp, S || 'Base', ov).out, key || 'ps_raw'); };
V3E.ctx = v3eCtx;
V3E.step = v3eStep;
V3E.util = { sum: v3eSum, median: v3eMedian, round: v3eRound, lerp: v3eLerp, div: v3eDiv, expand: v3eExpand, close: v3eClose, clone: v3eClone };

// engine.py 맨 위 상수
const v3eTR = ['st', 'lt', 'bond', 'cb', 'lease', 'rcf']; // 차입 트랜치
const v3eBS_TR = { st: 'BS.debt_st', lt: 'BS.debt_lt', bond: 'BS.bond', cb: 'BS.cb', lease: 'BS.lease', rcf: 'BS.rcf' };
const v3eSGA_ORDER = ['labor', 'sbc', 'dna', 'rnd', 'mkt', 'fee', 'freight', 'baddebt', 'other'];
const v3eSGA_NAME = { labor: '인건비', sbc: '주식보상비용', dna: '감가상각비', rnd: '연구개발비', mkt: '광고판촉', fee: '지급수수료', freight: '운반비', baddebt: '대손상각비', other: '기타관리비' };
const v3eSGA_DRIVER = { labor: 'pct_sales', sbc: 'pct_sales', dna: 'schedule', rnd: 'schedule', mkt: 'pct_sales', fee: 'pct_sales', freight: 'pct_sales', baddebt: 'pct_sales', other: 'cpi' };

// ── E01～E05: 연도와 할인 시점, 가정 펼치기, 거시 값, 과거 열, 매출 (engine.py step_timeline ～ step_revenue를 줄 단위로 옮김) ──
// 파이썬 isinstance(x, dict)
const v3eE01IsDict = (x) => x != null && typeof x === 'object' && !Array.isArray(x);

// ── E01 timeline ─────────────────────────────────────────────────────
function step_timeline(c) {
  const tl = c.inp.timeline, sw = c.sw;
  const hist = tl.hist.slice(-Math.trunc(Number(v3eGet(sw, 'hist_years', tl.hist.length))));
  const fy0 = hist[hist.length - 1];
  const N = Math.trunc(Number(sw.fc_years)), M = Math.trunc(Number(sw.fade_years));
  c.years_h = hist;
  c.years_f = [];
  for (let k = 0; k < N; k++) c.years_f.push(fy0 + 1 + k);
  c.years_d = [];
  for (let j = 0; j < M; j++) c.years_d.push(fy0 + N + 1 + j);
  c.ty = fy0 + N + M + 1;
  c.H = tl.hist.length; c.N = N; c.M = M; // 과거 열 수는 입력 그대로(hist_years 는 평균과 표시용)
  const el = tl.elapsed;
  const stub = sw.stub === 'bs' ? tl.stub : 1.0;
  const ends = [];
  for (let k = 0; k < N + M; k++) ends.push(k + 1 - el);
  let t, t_ty;
  if (sw.discount === 'mid') {
    const first = v3eGet(sw, 'mid_first'); // 원형 재현(첫해 0.5년)용. 없으면 (1 − elapsed) ÷ 2
    t = [first == null ? ends[0] / 2 : first];
    const rest = ends.slice(1);
    for (let k = 0; k < rest.length; k++) { const x = rest[k]; t.push(first == null ? x - 0.5 : first + k + 1); }
    t_ty = v3eT(v3eGet(sw, 'tv_mid')) ? t[t.length - 1] : (first == null ? ends[ends.length - 1] : t[t.length - 1] + 0.5);
  } else {
    t = ends; t_ty = ends[ends.length - 1];
  }
  c.t = t; c.t_ty = t_ty; c.stub = stub; c.elapsed = el;
  v3eOne(c, 'CTL.elapsed', el);
  v3eOne(c, 'CTL.stub', stub);
  v3eOne(c, 'CTL.scenario_no', { Bull: 1, Base: 2, Bear: 3 }[c.S]);
  v3eOne(c, 'CTL.circuit', Math.trunc(Number(sw.circuit)));
  v3eOne(c, 'CTL.price', v3eGet(c.inp.target, 'close'));
}

// ── E02 expand ───────────────────────────────────────────────────────
// 가정 펼치기. 주어진 가정만 여기서 펼치고, 없는 가정의 기본값은 E04 가 채운다
function step_expand(c) {
  const A = v3eOr(v3eGet(c.I, 'assump'), {});
  const base = v3eOr(v3eGet(A, 'Base'), {}), mine = v3eOr(v3eGet(A, c.S), {});
  c.A_given = {};
  c.A_to = {}; c.A_to_miss = []; // 끝값 하나 꼴 {to: 끝값}: 직전 실적을 아는 단계(_to_given, _seta)에서 펼침
  const keys = Object.keys(base);
  for (const k of Object.keys(mine)) if (!(k in base)) keys.push(k);
  for (const key of keys) {
    const v = v3eGet(mine, key, v3eGet(base, key));
    if (v3eIsTo(v)) { c.A_to[key] = v; continue; }
    const arr = v3eExpand(v, c.N);
    if (arr != null) c.A_given[key] = arr;
  }
}

// ── E03 macro ────────────────────────────────────────────────────────
function step_macro(c) {
  const m = c.I.market, sw = c.sw, ov = c.ov;
  let rf = sw.rf !== 'manual' ? v3eGet(m.rf, sw.rf) : v3eGet(m.rf, 'manual');
  if (v3eT(v3eGet(sw, 'rf_cds'))) rf = rf - v3eNz(v3eGet(m, 'cds'));
  rf = v3eGet(ov, 'm.rf', rf);
  c.rf = rf;
  const erp_key = { damodaran: 'total', damodaran_cds: 'total_cds', historical: 'historical', implied_kospi: 'implied', manual: 'manual' }[sw.erp];
  let erp = v3eGet(m.erp, erp_key);
  if (erp == null) { // 값이 없는 선택지(historical, implied_kospi, manual 미입력)는 Damodaran 합계로
    erp = v3eGet(m.erp, 'total');
    v3eChk(c, 'erp_fallback', 'warn', 'ERP 선택지 ' + sw.erp + '의 값이 입력에 없어 Damodaran 한국 합계를 씀');
  }
  c.erp = v3eGet(ov, 'm.erp', erp);
  const g_avg = [v3eGet(m, 'cpi10'), v3eGet(m, 'gdp10'), v3eGet(m, 'g_peer_mature')].filter((x) => x != null);   // avg: 물가, 명목 GDP, 업계 성숙기(있으면) 평균
  let g_raw = { cpi10: v3eGet(m, 'cpi10'), rf: rf, gdp_nominal: v3eGet(m, 'gdp10'), manual: v3eGet(m, 'g_manual'),
    avg: g_avg.length ? v3eSum(g_avg) / g_avg.length : null, peer_mature: v3eGet(m, 'g_peer_mature') }[sw.g];
  if (g_raw == null) { // 고른 출처 값이 없으면 물가 10년 평균, 그것도 없으면 무위험이자율
    const has = v3eGet(m, 'cpi10') != null;
    g_raw = has ? m.cpi10 : rf;
    v3eChk(c, 'g_fallback', 'warn', '영구성장률 출처 ' + v3ePyStr(sw.g) + '의 값이 입력에 없어 ' + (has ? '소비자물가 10년 평균' : '무위험이자율') + '을 씀');
  }
  let g = v3eT(sw.g_cap) ? Math.min(g_raw, rf) : g_raw;
  g = v3eGet(ov, 'o.g', g);
  c.g_raw = g_raw; c.g_s = g;
  v3eOne(c, 'MAC.cpi10', v3eGet(m, 'cpi10'));
  v3eOne(c, 'MAC.cpi5', v3eGet(m, 'cpi5'));
  v3eOne(c, 'MAC.gdp10', v3eGet(m, 'gdp10'));
  v3eOne(c, 'MAC.wage5', v3eGet(m, 'wage5'));
  v3eOne(c, 'MAC.rf', rf);
  v3eOne(c, 'DCF.g_s', g);
}

// ── E04 hist ─────────────────────────────────────────────────────────
// avg_exclude: 뺄 연도. input.avg_exclude 가 목록이면 모든 평균에, dict 면 "all" 은 모든 평균에, "<가정 키>"(예 tax_eff)는 그 가정에만
function v3eAvgExclude(I, key) {
  const ex = v3eOr(v3eGet(I, 'avg_exclude'), []);
  if (v3eE01IsDict(ex)) return v3eOr(v3eGet(ex, 'all'), []).concat(key ? v3eOr(v3eGet(ex, key), []) : []);
  return ex;
}
// _avg_idx: 평균에 넣을 과거 열 번호. 최근 avg_years 개 해에서 뺄 연도를 뺌(창을 과거로 늘리지 않음, 설계서 9-3)
function v3eAvgIdx(c, key) {
  const ex = v3eAvgExclude(c.I, key);
  const ys = c.inp.timeline.hist;
  const all = [];
  for (let i = 0; i < ys.length; i++) all.push(i);
  const win = all.slice(-Math.trunc(Number(c.sw.avg_years)));
  const idx = win.filter((i) => !ex.includes(ys[i]));
  if (!idx.length && win.length) { // 창의 모든 해를 빼면 빼기를 무시(평균이 비어 계산이 멈추지 않게)
    if (!c.checks.some((ck) => ck.id === 'avg_exclude_all')) v3eChk(c, 'avg_exclude_all', 'warn', '평균 창의 모든 해를 빼도록 되어 있어 빼기를 무시하고 평균을 냄');
    return win;
  }
  return idx;
}

// _avg: 다년 평균. ratio_mean 은 연도별 비율의 단순평균, sum_ratio 는 합계 ÷ 합계
// key(가정 키)를 주면 input.avg_exclude dict 에서 그 가정에만 건 제외 연도도 뺌(설계서 M3-020)
function v3eAvg(c, num, den, idx, key) {
  idx = idx == null ? v3eAvgIdx(c, key) : idx;
  if (den == null) {
    const xs = [];
    for (const i of idx) if (num[i] != null) xs.push(num[i]);
    return xs.length ? v3eSum(xs) / xs.length : null;
  }
  const pr = [];
  for (const i of idx) if (num[i] != null && v3eT(den[i])) pr.push([num[i], den[i]]);
  if (!pr.length) return null;
  if (c.sw.avg_method === 'sum_ratio') return v3eSum(pr.map((p) => p[0])) / v3eSum(pr.map((p) => p[1]));
  return v3eSum(pr.map((p) => p[0] / p[1])) / pr.length;
}

function step_hist(c) {
  const I = c.I, H = c.H, sw = c.sw;
  const h = (rid) => v3eHist(c, rid);
  const R = {};
  for (const k of ['rev', 'cogs', 'sga', 'ebit', 'oth_inc', 'oth_exp', 'int_inc', 'fin_inc_oth', 'int_exp', 'fin_exp_oth', 'eqm', 'ebt', 'tax', 'disc',
    'ni', 'ni_parent', 'ni_nci']) {
    R[k] = h('IS.' + k).map((x) => (k !== 'int_inc' && k !== 'int_exp' ? v3eNz(x) : x));
  }
  c.R = R;
  // 보정(ADJ): 과거 연도의 일회성 항목을 되돌린 정상화 값. 평균을 낼 때 씀(sw.use_norm)
  const adj_rev = v3eFill(H, 0.0), adj_cogs = v3eFill(H, 0.0), adj_sga = v3eFill(H, 0.0);
  const sga_g = {};                                   // 판관비 보정의 묶음별 몫(묶음을 안 적으면 기타관리비)
  const ys = c.inp.timeline.hist;
  const fc_adj = new Map();                           // 진행 연도(명시 기간) 매출 보정: sw.adj_fc 가 켜져 있으면 그해 매출에 더함
  for (const a of v3eOr(v3eGet(I, 'adj'), [])) {
    const acc = v3eGet(a, 'account');
    if (ys.includes(v3eGet(a, 'year'))) {
      const i = ys.indexOf(a.year);
      if (acc === 'rev') adj_rev[i] += a.amount;
      else if (acc === 'cogs') adj_cogs[i] += a.amount;
      else if (acc === 'sga' || acc === 'ebit') {
        const v = acc === 'ebit' ? -a.amount : a.amount;
        adj_sga[i] += v;
        const gk = v3eOr(v3eGet(a, 'group'), 'other');
        if (!(gk in sga_g)) sga_g[gk] = v3eFill(H, 0.0);
        sga_g[gk][i] += v;
      }
    } else if (acc === 'rev' && c.years_f.includes(v3eGet(a, 'year'))) {
      fc_adj.set(a.year, (fc_adj.has(a.year) ? fc_adj.get(a.year) : 0.0) + a.amount);
    }
  }
  const norm = v3eT(sw.use_norm);
  const rev_n = [], cogs_n = [];
  for (let i = 0; i < H; i++) rev_n.push(R.rev[i] + (norm ? adj_rev[i] : 0));
  for (let i = 0; i < H; i++) cogs_n.push(R.cogs[i] + (norm ? adj_cogs[i] : 0));
  c.rev_n = rev_n; c.cogs_n = cogs_n;
  const rev_norm = [], ebit_norm = [];
  for (let i = 0; i < H; i++) ebit_norm.push(R.ebit[i] + adj_rev[i] - adj_cogs[i] - adj_sga[i]);
  for (let i = 0; i < H; i++) rev_norm.push(R.rev[i] + adj_rev[i]);
  v3ePut(c, 'ADJ.rev_norm', rev_norm, v3eFill(c.N));
  v3ePut(c, 'ADJ.ebit_norm', ebit_norm, v3eFill(c.N));
  if (v3eT(v3eGet(I, 'adj'))) { // 보정 항목 세효과(법정 세율, 설계서 2-17 ADJ.item 세효과): 정상화 순이익
    const T = I.market.tax;
    const te = [], nn = [];
    for (let i = 0; i < H; i++) te.push((ebit_norm[i] - R.ebit[i]) * v3eBracketRate(Math.max(v3eNz(R.ebt[i]), 0.0), T.brackets) * (1 + T.local));
    v3ePut(c, 'ADJ.tax_eff', te, v3eFill(c.N));
    for (let i = 0; i < H; i++) nn.push(R.ni[i] + ebit_norm[i] - R.ebit[i] - te[i]);
    v3ePut(c, 'ADJ.ni_norm', nn, v3eFill(c.N));
  }
  c.sga_adj = norm ? adj_sga : v3eFill(H, 0.0);
  c.sga_adj_g = norm ? sga_g : {};
  c.rev_adj_fc = c.years_f.map((y) => (v3eT(v3eGet(sw, 'adj_fc')) ? (fc_adj.has(y) ? fc_adj.get(y) : 0.0) : 0.0));
  // 최근 12개월(LTM) = 직전 연간 − 전년 같은 기간 누적 + 당해 누적(03 노트 11.2절). 표시용
  const yp = v3eOr(v3eGet(I, 'ytd_prev'), {}), yt = v3eOr(v3eGet(I, 'ytd'), {});
  for (const k_ of ['rev', 'ebit', 'ni_parent']) {
    const a0 = v3eLast(R[k_]), a1 = v3eGet(yp, 'IS.' + k_), a2 = v3eGet(yt, 'IS.' + k_);
    if (a1 != null && a2 != null) v3eOne(c, 'ADJ.ltm.' + k_, a0 - a1 + a2);
  }
  c.cpi = v3eNz(v3eGet(I.market, 'cpi5'), v3eNz(v3eGet(I.market, 'cpi10')));
  v3eSeta(c, 'cpi', c.cpi, '소비자물가 5년 평균');
  c.avg_idx = v3eAvgIdx(c);
  const idx3 = v3eAvgIdx(c, 'tax_eff');
  // 유효세율: 최근 평균에서 법정 세율 대비 0.5배 미만, 1.5배 초과 해 제외
  const T = I.market.tax;
  const effs = [], used = [], dropped = [];
  for (const i of idx3) {
    const e = v3eDiv(R.tax[i], R.ebt[i]);
    if (e == null || R.ebt[i] <= 0) continue;
    const stat = v3eDiv(v3eBracketTax(R.ebt[i], T.brackets)[0] * (1 + T.local), R.ebt[i]);
    if (v3eT(stat) && (e < 0.5 * stat || e > 1.5 * stat)) {
      dropped.push(ys[i]);
      continue;
    }
    effs.push(e);
    used.push(ys[i]);
  }
  if (dropped.length) v3eChk(c, 'tax_outlier', 'info', '유효세율 평균에서 뺀 연도: ' + dropped.map((y) => String(y)).join(', '), dropped);
  c.tax_eff_default = effs.length ? v3eSum(effs) / effs.length : v3eGet(T, 'marginal_top', 0.275);
  c.tax_eff_years = used;
}

// ── E05 revenue ──────────────────────────────────────────────────────
// _line_orig: 줄 드라이버의 연간 값(누적 실적, 성장률 가산을 넣기 전)
function v3eLineOrig(c, ln, k, prev, aux) {
  const typ = ln.type, key = 'rev.' + ln.id, N = c.N;
  const A = (v, d = null) => v3eOr(v3eA(c, key + '.' + v), v3eFill(N, d))[k];
  if (typ === 'growth') return prev * (1 + A('g', 0.0));
  if (typ === 'manual') return A('val');
  if (typ === 'fixed') return v3eGet(v3eGet(ln, 'a', {}), 'mode') === 'cpi' ? prev * (1 + v3eA(c, 'cpi')[k]) : prev;
  if (typ === 'market_share') return A('mkt') * A('share') * A('net_ratio', 1.0) * A('fx', 1.0);
  if (typ === 'units_x_per') return A('units') * A('per_unit');
  if (typ === 'capacity') return A('cap') * A('util') * A('price');
  if (typ === 'price_volume') {
    aux.vol = aux.vol * (1 + A('g_vol', 0.0));
    aux.price = aux.price * (1 + A('g_price', 0.0));
    return aux.vol * aux.price / v3eOr(v3eGet(ln, 'unit_conv'), 1.0);
  }
  if (typ === 'backlog') return aux.backlog[k];
  throw new Error('모르는 드라이버: ' + typ);
}

// _backlog: 프로젝트별 분기 인식액을 연도로 합침(SK오션플랜트 방식)
function v3eBacklog(c, ln) {
  const rb = c.I.revbuild;
  const curves = new Map();
  for (const x of v3eOr(v3eGet(rb, 'curves'), [])) curves.set(x.id, x.q_weights);
  const out = v3eFill(c.N, 0.0);
  const y0 = c.years_f[0];
  for (const p of v3eOr(v3eGet(rb, 'projects'), [])) {
    if (v3eGet(p, 'line') !== ln.id) continue;
    let amt = v3eGet(p, 'contract');
    if (amt == null && v3eT(v3eGet(p, 'capacity'))) { // 예상 수주: 용량 × 점유율 ÷ 단위 용량 × 단위 단가
      amt = p.capacity * v3eGet(p, 'share', 1.0) / v3eGet(p, 'unit_cap', 1.0) * v3eGet(p, 'unit_price', 0.0);
    }
    const remain = v3eNz(amt) * v3eNz(v3ePick(v3eGet(p, 'prob'), c.S), 1.0) - v3eNz(v3eGet(p, 'recognized_to_date'));
    const w = v3eOr(curves.get(v3eGet(p, 'curve')), [1.0]);
    const sy = Math.trunc(Number(p.start_q.slice(0, 4))), sq = Math.trunc(Number(p.start_q[5]));
    const tot = v3eSum(w);
    for (let j = 0; j < w.length; j++) {
      const wj = w[j];
      const q = (sy - y0) * 4 + (sq - 1) + j;
      const qy = Math.floor(q / 4);
      if (0 <= qy && qy < c.N) out[qy] += remain * wj / tot;
    }
  }
  return out;
}

function step_revenue(c) {
  const I = c.I, H = c.H, N = c.N, S = c.S, sw = c.sw;
  const rb = I.revbuild;
  const lines = rb.lines, groups = v3eOr(v3eGet(rb, 'groups'), []);
  const add = v3eNz(v3eGet(c.ov, 'o.growth_add'));
  const ytd_on = sw.fy1_mode === 'ytd_plus_rest';
  const v2 = v3eGet(sw, 'scn_rule') === 'v2';        // v2: 리서치의 Bull, Bear 값을 쓰지 않고 늘 규칙으로
  const mod = v3eGet(sw, 'scn_rule') === 'modellers'; // modellers: 원형 그대로. Bull = Base + 5%p, Bear = 최근 3년 실적 최저를 명시 기간 내내 같은 값으로
  const HK = new Map([['g', 'val'], ['g_vol', 'vol'], ['g_price', 'price']]);
  const RULE_WHY = new Map([['avg4', '과거 4년 평균 성장률'], ['cagr5', '과거 5년 연평균 성장률(CAGR)']]);
  // hist_rule: 과거 실적에서 뽑는 성장률. avg4는 최근 4개 증가율 평균(원형 Scenario!O17), cagr5는 최근 5년 연평균(Scenario!O27 =$T$25). 값이 모자라면 null
  const hist_rule = (lid, v, rule) => {
    let hv = v3eHist(c, 'REV.l.' + lid + '.' + HK.get(v)).filter((x) => x != null);
    if (rule === 'cagr5') {
      hv = hv.slice(-6);
      return hv.length > 1 && hv[0] > 0 && v3eLast(hv) > 0 ? (v3eLast(hv) / hv[0]) ** (1 / (hv.length - 1)) - 1 : null;
    }
    hv = hv.slice(-5);
    const gg = [];
    for (let i = 1; i < hv.length; i++) if (v3eT(hv[i - 1])) gg.push(hv[i] / hv[i - 1] - 1);
    return gg.length ? v3eSum(gg) / gg.length : null;
  };
  // last_g: 끝값 하나 꼴의 출발점. 직전 실적 증가율(성장률 변수만)
  const last_g = (lid, v) => {
    if (!HK.has(v)) return null;
    const hv = v3eHist(c, 'REV.l.' + lid + '.' + HK.get(v)).filter((x) => x != null);
    return hv.length > 1 && v3eT(hv[hv.length - 2]) ? hv[hv.length - 1] / hv[hv.length - 2] - 1 : null;
  };
  for (const ln of lines) { // 줄 가정 행
    const lid = ln.id;
    const la = Object.assign({}, v3eOr(v3eGet(ln, 'a'), {}));
    if (ln.type === 'price_volume') { // 리서치 값이 없으면 단가, 수량 성장률 = 과거 실적 규칙(sw.scn_base_rule. 기본 avg4, 301, 설계서 2-17 scn_rule 보강)
      for (const v of ['g_price', 'g_vol']) { // 가정 덮기(a.rev.<줄>.g_vol.<시나리오>)로만 준 값도 아래에서 가정 행이 됨
        if (!(v in la)) la[v] = { rule: v3eOr(v3eGet(sw, 'scn_base_rule'), 'avg4'), auto: true };
      }
    }
    for (const v of Object.keys(la)) {
      const spec = la[v];
      if (v === 'mode') continue;
      const key = 'rev.' + lid + '.' + v;
      const scn_v = v === 'g' || v === 'g_vol'; // 시나리오 규칙이 걸리는 변수: 성장률 줄의 성장률, 수량 × 단가 줄의 수량 성장률(원형 Scenario 시트는 수량 4줄)
      v3eToGiven(c, key, last_g(lid, v));
      if (!(key in c.A_given)) {
        let one = v3ePick(spec, v2 && scn_v ? 'Base' : S);
        if (v3eE01IsDict(one) && 'rule' in one) { // 줄별 과거 실적 규칙 {rule: 'avg4' 또는 'cagr5'}
          const rv = HK.has(v) ? hist_rule(lid, v, one.rule) : null;
          if (rv == null) continue; // 과거 값이 모자라면 가정 행을 만들지 않음(성장률 0)
          if (!(key in c.notes.why)) c.notes.why[key] = (v3eT(v3eGet(one, 'auto')) ? '리서치 값이 없어 ' : '') + (RULE_WHY.has(one.rule) ? RULE_WHY.get(one.rule) : RULE_WHY.get('avg4'));
          one = rv;
        }
        let arr;
        if (v3eIsTo(one)) { // 끝값 하나 꼴: 직전 실적 증가율에서 출발
          const a0 = last_g(lid, v);
          if (a0 == null) c.A_to_miss.push(key);
          arr = v3eExpand(one, N, a0);
        } else {
          if (v3eE01IsDict(one) && 'start' in one && v3eGet(one, 'end') == null) {
            one = { start: one.start, end: c.g_s }; // 끝값이 비면 영구성장률
          }
          arr = v3eExpand(one, N);
        }
        if (arr != null && scn_v && S !== 'Base' && (v2 || !(v3eE01IsDict(spec) && S in spec))) {
          // 리서치가 Bull, Bear 를 안 준 성장률 줄: Bull = Base + 5%p, Bear = 최근 3년 실적 최저(Base 보다 높으면 Base − 5%p).
          // 가산 폭은 첫해에서 마지막 해로 가며 0 으로 줄어듦. 수량 성장률은 과거 수량 증가율에서 최저를 찾음
          let hv;
          if (v === 'g') {
            hv = v3eHist(c, 'REV.l.' + lid + '.val').filter((x) => x != null);
            if (!hv.length) hv = c.R.rev.filter((x) => x != null);
          } else hv = v3eHist(c, 'REV.l.' + lid + '.vol').filter((x) => x != null);
          const hg = [];
          for (let i = Math.max(1, hv.length - 3); i < hv.length; i++) if (v3eT(hv[i - 1])) hg.push(hv[i] / hv[i - 1] - 1);
          const arr0 = arr;
          arr = [];
          if (mod) { // 원형 Scenario!O16 =O17+5%, O18 =MIN(L15:N15), P18 =+O18. 실적이 없으면 Base − 5%p
            for (let k = 0; k < N; k++) arr.push(S === 'Bull' ? arr0[k] + 0.05 : (hg.length ? v3eMinOf(hg) : arr0[k] - 0.05));
          } else {
            const d = S === 'Bull' ? 0.05 : (hg.length && v3eMinOf(hg) < arr0[0] ? v3eMinOf(hg) - arr0[0] : -0.05);
            for (let k = 0; k < N; k++) arr.push(arr0[k] + d * (N > 1 ? (N - 1 - k) / (N - 1) : 1.0));
          }
        }
        if (arr != null) c.A_given[key] = arr;
      }
      v3eSeta(c, key, null);
    }
  }
  const vals = {}, share_of = [];
  for (const ln of lines) {
    const lid = ln.id;
    const rid = 'REV.l.' + lid;
    const hist = v3eHist(c, rid + '.val');
    const fy0 = hist[hist.length - 1] != null ? hist[hist.length - 1] : v3ePick(v3eGet(ln, 'fy0'), S);
    if (ln.type === 'share_of') {
      share_of.push(ln);
      continue;
    }
    const aux = { vol: v3eNz(v3eLast(v3eOr(v3eHist(c, rid + '.vol'), [null]))), price: v3eNz(v3eLast(v3eOr(v3eHist(c, rid + '.price'), [null]))) };
    if (ln.type === 'backlog') aux.backlog = v3eBacklog(c, ln);
    const ytd = ytd_on ? v3eGet(I.ytd, rid + '.val') : null;
    const ovr = v3ePick(v3eGet(ln, 'fy1_override'), S);
    let qs = v3eGet(v3eOr(v3eGet(I, 'q_share'), {}), lid);
    qs = v3eT(qs) ? qs[0] : null;
    const out = [];
    let prev_o = fy0, prev_n = fy0;
    for (let k = 0; k < N; k++) {
      let o = v3eLineOrig(c, ln, k, prev_o, aux);
      const fixed_fy1 = k === 0 && ytd != null && (ovr != null || qs != null);
      let v;
      if (fixed_fy1) {
        o = ytd + (ovr != null ? ovr : o * qs);
        v = o;
      } else if (v3eT(add) && v3eT(prev_o)) {
        v = prev_n * (o / prev_o + add);
      } else if (v3eT(add) && !v3eT(prev_n)) {
        v = o * (1 + add); // 0 에서 시작하는 줄(직접 입력 0 → 20 → 55): 전년이 0 이면 그해 값에 같은 비율을 곱함
      } else {
        v = !v3eT(add) ? o : !v3eT(prev_o) ? prev_n * (1 + add) : o;
      }
      out.push(v);
      prev_o = o; prev_n = v;
      if (ln.type === 'price_volume') { // 수량과 단가 행(단위원가 방식 원가가 읽음)
        if (!(('pv_' + lid) in c)) c['pv_' + lid] = [];
        c['pv_' + lid].push([aux.vol * (v3eT(o) ? v / o : 1.0), aux.price]);
      }
    }
    vals[lid] = out;
    c['line_hist_' + lid] = hist.slice(0, -1).concat([fy0]);
  }
  for (const ln of share_of) {
    const base = vals['a_base' in ln ? ln.a_base : ln.a.base_line], r = v3eA(c, 'rev.' + ln.id + '.ratio');
    const sv = [];
    for (let k = 0; k < N; k++) sv.push(base[k] * r[k]);
    vals[ln.id] = sv;
    c['line_hist_' + ln.id] = v3eHist(c, 'REV.l.' + ln.id + '.val');
  }
  const scale = v3eFill(N, 1.0);
  const cons = v3eOr(v3eGet(I, 'cons'), {});
  const tot = [];
  for (let k = 0; k < N; k++) tot.push(v3eSum(lines.map((ln) => vals[ln.id][k])));
  if (sw.cons_anchor !== 'off' && v3eT(v3eGet(cons, 'rev'))) { // 줄 합계를 컨센서스에 맞추는 배율(K12: 올해와 내년만)
    const cy = cons.years.slice(0, sw.cons_anchor === 'fy1' ? 1 : 2);
    for (let j = 0; j < cy.length; j++) {
      const y = cy[j];
      if (c.years_f.includes(y) && v3eT(cons.rev[j])) {
        const k = c.years_f.indexOf(y);
        scale[k] = cons.rev[j] / tot[k];
      }
    }
  }
  const rev_h = c.R.rev;
  // 과거 열의 최상위 합(묶음 과거값이 있으면 그것). 다 있는 해만 resid 를 계산
  const gh = new Map();
  for (const g of groups) gh.set(g.id, v3eHist(c, 'REV.g.' + g.id + '.val'));
  const top = groups.filter((g) => !v3eT(v3eGet(g, 'parent'))).concat(lines.filter((ln) => !v3eT(v3eGet(ln, 'group'))));
  const resid = [];
  for (let i = 0; i < H; i++) {
    let s = 0.0, ok = true;
    for (const node of top) {
      let v = gh.has(node.id) ? gh.get(node.id)[i] : c['line_hist_' + node.id][i];
      if (v == null && gh.has(node.id)) {
        const ch = [];
        for (const ln of lines) if (v3eGet(ln, 'group') === node.id) ch.push(c['line_hist_' + ln.id][i]);
        v = ch.length && ch.every((x) => x != null) ? v3eSum(ch) : null;
      }
      if (v == null) {
        ok = false;
        break;
      }
      s += v;
    }
    resid.push(ok ? rev_h[i] - s : null);
  }
  let total_fc = [];
  for (let k = 0; k < N; k++) total_fc.push(v3eSum(lines.map((ln) => vals[ln.id][k] * scale[k])));
  let resid_fc;
  if (sw.resid_fwd === 'hold_share' && resid[resid.length - 1] != null && v3eT(rev_h[rev_h.length - 1])) {
    const rs = resid[resid.length - 1] / (rev_h[rev_h.length - 1] - resid[resid.length - 1]);
    resid_fc = [];
    for (let k = 0; k < N; k++) resid_fc.push(total_fc[k] * rs);
    const total_fc0 = total_fc;
    total_fc = [];
    for (let k = 0; k < N; k++) total_fc.push(total_fc0[k] + resid_fc[k]);
  } else {
    resid_fc = v3eFill(N, 0.0);
  }
  if (c.rev_adj_fc.some((x) => v3eT(x))) { // sw.adj_fc: 진행 연도 매출 보정(일회성 차감 되돌림)을 체계 차이 조정 줄로 더함
    resid_fc = resid_fc.map((x, k) => x + c.rev_adj_fc[k]);
    total_fc = total_fc.map((x, k) => x + c.rev_adj_fc[k]);
  }
  const total = v3ePut(c, 'REV.total', rev_h, total_fc);
  const growth_h = [v3eDiv(rev_h[0], v3eGet(v3eOr(v3eGet(I, 'hist_prev'), {}), 'IS.rev'))];
  for (let i = 1; i < H; i++) growth_h.push(v3eDiv(rev_h[i], rev_h[i - 1]));
  const growth_f = [total_fc[0] / rev_h[rev_h.length - 1]];
  for (let k = 1; k < N; k++) growth_f.push(total_fc[k] / total_fc[k - 1]);
  v3ePut(c, 'REV.growth', growth_h, growth_f);
  const growth = c.rows['REV.growth'];
  for (let i = 0; i < growth.length; i++) growth[i] = growth[i] == null ? null : growth[i] - 1;
  for (const ln of lines) {
    const lid = ln.id;
    const hv = c['line_hist_' + lid];
    const fv = [];
    for (let k = 0; k < N; k++) fv.push(vals[lid][k] * scale[k]);
    const allv = v3ePut(c, 'REV.l.' + lid + '.val', hv, fv);
    const g_all = [null];
    for (let i = 1; i < H + N; i++) g_all.push(v3eDiv(allv[i], allv[i - 1]));
    v3ePut(c, 'REV.l.' + lid + '.g', g_all, [], 'hist+fc');
    const gr = c.rows['REV.l.' + lid + '.g'];
    for (let i = 0; i < gr.length; i++) gr[i] = gr[i] == null ? null : gr[i] - 1;
    const sh_all = [];
    for (let i = 0; i < H + N; i++) sh_all.push(v3eDiv(allv[i], total[i]));
    v3ePut(c, 'REV.l.' + lid + '.share', sh_all, [], 'hist+fc');
    if (v3eT(c['pv_' + lid])) {
      v3ePut(c, 'REV.l.' + lid + '.vol', v3eHist(c, 'REV.l.' + lid + '.vol'), c['pv_' + lid].map((x, k) => x[0] * scale[k]));
      v3ePut(c, 'REV.l.' + lid + '.price', v3eHist(c, 'REV.l.' + lid + '.price'), c['pv_' + lid].map((x) => x[1]));
    }
  }
  const child = new Map();
  for (const g of groups) {
    const par = v3eGet(g, 'parent');
    if (!child.has(par)) child.set(par, []);
    child.get(par).push(g.id);
  }
  const gsum = (gid, k) => {
    const own = [];
    for (const ln of lines) if (v3eGet(ln, 'group') === gid) own.push(vals[ln.id][k] * scale[k]);
    return v3eSum(own) + v3eSum((child.has(gid) ? child.get(gid) : []).map((x) => gsum(x, k)));
  };
  for (const g of groups) {
    const hv = [];
    for (let i = 0; i < H; i++) {
      let v = gh.get(g.id)[i];
      if (v == null) {
        const ch = [];
        for (const ln of lines) if (v3eGet(ln, 'group') === g.id) ch.push(c['line_hist_' + ln.id][i]);
        v = ch.length && ch.every((x) => x != null) && !v3eT(child.get(g.id)) ? v3eSum(ch) : null;
      }
      hv.push(v);
    }
    const gf = [];
    for (let k = 0; k < N; k++) gf.push(gsum(g.id, k));
    v3ePut(c, 'REV.g.' + g.id + '.val', hv, gf);
  }
  v3ePut(c, 'REV.resid', resid, resid_fc);
  const cons_fc = v3eFill(N);
  const cyears = v3eOr(v3eGet(cons, 'years'), []);
  for (let j = 0; j < cyears.length; j++) {
    const y = cyears[j];
    if (c.years_f.includes(y)) cons_fc[c.years_f.indexOf(y)] = v3eOr(v3eGet(cons, 'rev'), v3eFill(9))[j];
  }
  v3ePut(c, 'REV.cons', null, cons_fc);
  const cons_gap = [];
  for (let k = 0; k < N; k++) cons_gap.push(cons_fc[k] == null ? null : total_fc[k] - cons_fc[k]);
  v3ePut(c, 'REV.cons_gap', null, cons_gap);
  for (const key_ of ['n', 'hi', 'lo']) {
    const arr_ = v3eFill(N);
    const src_ = v3eOr(v3eGet(cons, key_), []);
    for (let j = 0; j < cyears.length; j++) {
      const y = cyears[j];
      if (c.years_f.includes(y)) arr_[c.years_f.indexOf(y)] = j < src_.length ? src_[j] : null;
    }
    v3ePut(c, 'REV.cons_' + key_, null, arr_);
  }
  // 묶음 혼합 단가(설계서 2-17 REV.l.<줄>.mix_asp): 묶음의 모든 줄이 단가 × 수량이면 총수량과 묶음 매출 ÷ 총수량
  for (const g of groups) {
    const gl = lines.filter((ln) => v3eGet(ln, 'group') === g.id);
    if (gl.length && gl.every((ln) => v3eT(c.rows['REV.l.' + ln.id + '.vol']))) {
      const vr = (ln) => c.rows['REV.l.' + ln.id + '.vol'], pr = (ln) => c.rows['REV.l.' + ln.id + '.price'];
      const vol = [], pv = [], mix = [];
      for (let i = 0; i < H + N; i++) vol.push(gl.every((ln) => vr(ln)[i] != null) ? v3eSum(gl.map((ln) => v3eNz(vr(ln)[i]))) : null);
      for (let i = 0; i < H + N; i++) pv.push(vol[i] == null || gl.some((ln) => pr(ln)[i] == null) ? null : v3eSum(gl.map((ln) => vr(ln)[i] * pr(ln)[i])));
      for (let i = 0; i < H + N; i++) mix.push(pv[i] == null || !v3eT(vol[i]) ? null : pv[i] / vol[i]);
      v3ePut(c, 'REV.g.' + g.id + '.vol', vol.slice(0, H), vol.slice(H));
      v3ePut(c, 'REV.g.' + g.id + '.mix_asp', mix.slice(0, H), mix.slice(H));
    }
  }
  v3eOne(c, 'REV.ytd', v3eGet(I.ytd, 'IS.rev'));
  c.vals = vals; c.scale = scale;
}

v3eReg('E01', 'timeline', step_timeline);
v3eReg('E02', 'expand', step_expand);
v3eReg('E03', 'macro', step_macro);
v3eReg('E04', 'hist', step_hist);
v3eReg('E05', 'revenue', step_revenue);

// ── E06～E11: 매출원가, R&D, 유무형자산, 판관비, 영업이익, 운전자본 (engine.py step_cogs ～ step_nwc를 줄 단위로 옮김) ──
// 파이썬의 [식 for i in range(n)] 을 같은 순서로 만드는 도우미
const v3eE06Seq = (n, f) => { const o = new Array(n); for (let i = 0; i < n; i++) o[i] = f(i); return o; };

// ── E06 cogs ─────────────────────────────────────────────────────────
// _seg_hist: 원가 키별 과거 사업부 매출, 원가, 원가율과 「기타」 잔여(원형 EBIT 54～56, 64～66행).
// 과거 사업부 원가는 input.hist의 OPX.cogs.<원가 키>. 과거 원가가 있는 키가 하나라도 있으면 그 밖(과거 원가가 없는 키, 키 없는 줄, 체계 차이)은 「기타」 = 전사 − 사업부 합.
// 과거 원가가 없는 키가 하나뿐이고 키 없는 줄이 없으면 그 키가 잔여를 받음(원형 Others: EBIT!H56 =H30−H61)
function v3eSegHist(c) {
  const H = c.H, lines = c.I.revbuild.lines;
  const ckOf = (ln) => v3eGet(v3eOr(v3eGet(ln, 'cost'), {}), 'cogs_r_key');
  const keys = [];
  for (const ln of lines) if (v3eT(ckOf(ln)) && !keys.includes(ckOf(ln))) keys.push(ckOf(ln));
  const sg = { keys, rev: {}, cost: {}, r: {}, known: [], etc: null, unkeyed: lines.some((ln) => !v3eT(ckOf(ln))), resid_key: null };
  for (const ck of keys) {
    const ls = [];
    for (const ln of lines) if (ckOf(ln) === ck) ls.push(c['line_hist_' + ln.id]);
    sg.rev[ck] = v3eE06Seq(H, (i) => (ls.every((x) => x[i] != null) ? v3eSum(ls.map((x) => x[i])) : null));
    const ch = c.I.hist['OPX.cogs.' + ck];
    if (ch != null && ch.some((x) => x != null)) {
      sg.known.push(ck);
      sg.cost[ck] = ch.slice();
    }
  }
  if (sg.known.length) {
    const kn = sg.known.slice(), tc = v3eHist(c, 'IS.cogs'), tr = v3eHist(c, 'IS.rev');
    const ec = v3eE06Seq(H, (i) => (tc[i] != null && kn.every((ck) => sg.cost[ck][i] != null) ? tc[i] - v3eSum(kn.map((ck) => sg.cost[ck][i])) : null));
    const er = v3eE06Seq(H, (i) => (tr[i] != null && kn.every((ck) => sg.rev[ck][i] != null) ? tr[i] - v3eSum(kn.map((ck) => sg.rev[ck][i])) : null));
    const rest = keys.filter((ck) => !kn.includes(ck));
    if (rest.length === 1 && !sg.unkeyed) {
      sg.known.push(rest[0]);
      sg.cost[rest[0]] = ec;
      sg.resid_key = rest[0];
    } else if (rest.length || sg.unkeyed) {
      sg.etc = { cost: ec, rev: er, r: v3eE06Seq(H, (i) => v3eDiv(ec[i], er[i])) };
    }
  }
  for (const ck of sg.known) sg.r[ck] = v3eE06Seq(H, (i) => v3eDiv(sg.cost[ck][i], sg.rev[ck][i]));
  return sg;
}
// _seg_rate: 사업부 원가율 가정 행 CTL.a.cogs_r.<키>(ck가 null이면 기타 잔여 CTL.a.cogs_r.etc).
// 기본값: 과거 사업부 원가가 있는 키는 그 키의 과거 평균, 없는 키와 기타는 잔여 평균, 과거 사업부 원가가 하나도 없으면 전사 평균(예전 동작)
function v3eSegRate(c, sg, ck, cr_def) {
  const etc = sg.etc, ny = String(c.avg_idx.length);
  if (ck == null) {
    v3eToGiven(c, 'cogs_r.etc', etc.r[etc.r.length - 1]);
    return v3eSeta(c, 'cogs_r.etc', v3eNz(v3eAvg(c, etc.cost, etc.rev), cr_def), '전사 원가에서 사업부 원가를 뺀 나머지 ÷ 나머지 매출의 최근 ' + ny + '년 평균');
  }
  if (sg.known.includes(ck)) {
    v3eToGiven(c, 'cogs_r.' + ck, sg.r[ck][sg.r[ck].length - 1]);
    const why = ck === sg.resid_key ? '전사 원가에서 다른 사업부 원가를 뺀 나머지 ÷ 사업부 매출의 최근 ' + ny + '년 평균' : '과거 사업부 원가 ÷ 사업부 매출의 최근 ' + ny + '년 평균';
    return v3eSeta(c, 'cogs_r.' + ck, v3eNz(v3eAvg(c, sg.cost[ck], sg.rev[ck]), cr_def), why);
  }
  if (etc) {
    v3eToGiven(c, 'cogs_r.' + ck, etc.r[etc.r.length - 1]);
    return v3eSeta(c, 'cogs_r.' + ck, v3eNz(v3eAvg(c, etc.cost, etc.rev), cr_def), '과거 사업부 원가가 없어 기타 잔여 원가율의 최근 ' + ny + '년 평균');
  }
  return v3eSeta(c, 'cogs_r.' + ck, cr_def);
}
// _seg_rows: 사업부 원가 행 OPX.cogs.<키>, 사업부 원가율 행 OPX.cogs_r.<키>(과거 원가가 있는 키만. 과거 열까지)와 기타 잔여 행 OPX.cogs.etc, OPX.cogs_r.etc
function v3eSegRows(c, sg, seg, srev, cogs, rev) {
  const N = c.N;
  for (const ck of sg.keys) {
    if (sg.known.includes(ck)) {
      v3ePut(c, 'OPX.cogs.' + ck, sg.cost[ck], seg[ck]);
      v3ePut(c, 'OPX.cogs_r.' + ck, sg.r[ck], v3eE06Seq(N, (k) => v3eDiv(seg[ck][k], srev[ck][k])));
    } else v3ePut(c, 'OPX.cogs.' + ck, null, seg[ck]);
  }
  if (sg.etc) {
    const kn = sg.known;
    const ec = v3eE06Seq(N, (k) => cogs[k] - v3eSum(kn.map((ck) => seg[ck][k])));
    v3ePut(c, 'OPX.cogs.etc', sg.etc.cost, ec);
    v3ePut(c, 'OPX.cogs_r.etc', sg.etc.r, v3eE06Seq(N, (k) => v3eDiv(ec[k], rev[k] - v3eSum(kn.map((ck) => srev[ck][k])))));
  }
}

function step_cogs(c, late) {
  const sw = c.sw, N = c.N, H = c.H, R = c.R;
  const mode = sw.cogs_mode;
  if ((mode === 'components') !== !!late) return;
  const rev = v3eFc(c, 'REV.total');
  const cogs_h = R.cogs;
  const cr_h = v3eE06Seq(H, (i) => v3eDiv(cogs_h[i], R.rev[i]));
  const cr_def = v3eAvg(c, c.cogs_n, c.rev_n, null, 'cogs_r');
  const rng = [];
  for (const i of c.avg_idx) if (cr_h[i] != null) rng.push(cr_h[i]);
  v3eToGiven(c, 'cogs_r', cr_h[cr_h.length - 1]);
  const cr = v3eSeta(c, 'cogs_r', cr_def,'최근 ' + String(c.avg_idx.length) + '년 평균(정상화)', v3eT(rng) ? [v3eMinOf(rng), v3eMaxOf(rng)] : null);
  const lines = c.I.revbuild.lines;
  let cogs;
  if (mode === 'ratio') {
    cogs = v3eE06Seq(N, (k) => rev[k] * cr[k]);
  } else if (mode === 'seg_ratio') {
    cogs = v3eFill(N, 0.0);
    const sg = v3eSegHist(c);
    const keys = sg.keys;
    for (const ck of keys) v3eSegRate(c, sg, ck, cr_def);
    const er = sg.etc && sg.unkeyed ? v3eSegRate(c, sg, null, cr_def) : cr; // 키 없는 줄: 과거 사업부 원가가 있으면 기타 잔여 원가율, 없으면 전사 원가율
    const seg = {}, srev = {};
    for (const ck of keys) { seg[ck] = v3eFill(N, 0.0); srev[ck] = v3eFill(N, 0.0); }
    for (const ln of lines) {
      const ck = v3eGet(v3eOr(v3eGet(ln, 'cost'), {}), 'cogs_r_key');
      const v = v3eFc(c, 'REV.l.' + ln.id + '.val');
      const r = v3eT(ck) ? v3eA(c, 'cogs_r.' + ck) : er;
      for (let k = 0; k < N; k++) {
        cogs[k] += v[k] * r[k];
        if (v3eT(ck)) { seg[ck][k] += v[k] * r[k]; srev[ck][k] += v[k]; }
      }
    }
    v3eSegRows(c, sg, seg, srev, cogs, rev);
  } else if (mode === 'gpm_step') {
    const step = v3eSeta(c, 'gpm_step', 0.0);
    let gpm = 1 - cr_h[cr_h.length - 1];
    cogs = [];
    for (let k = 0; k < N; k++) {
      gpm += step[k];
      cogs.push(rev[k] * (1 - gpm));
    }
  } else if (mode === 'unit_cost') {
    cogs = v3eFill(N, 0.0);
    const sg = v3eSegHist(c);
    const keys = sg.keys;
    const seg = {}, srev = {};
    for (const ck of keys) { seg[ck] = v3eFill(N, 0.0); srev[ck] = v3eFill(N, 0.0); }
    const uh = {}; // 과거 단위원가(원형 EBIT!H72 =H54/H70*10^6): 사업부 원가 ÷ 그 키 줄들의 수량 합 × 단위 환산
    for (const ck of sg.known) {
      const vh = [];
      for (const ln of lines) if (v3eGet(v3eOr(v3eGet(ln, 'cost'), {}), 'cogs_r_key') === ck) vh.push([v3eHist(c, 'REV.l.' + ln.id + '.vol'), v3eOr(v3eGet(ln, 'unit_conv'), 1.0)]);
      const den = v3eE06Seq(H, (i) => (vh.every((x) => x[0][i] != null) ? v3eSum(vh.map((x) => x[0][i] / x[1])) : null));
      if (den.some((x) => x != null)) uh[ck] = v3eE06Seq(H, (i) => v3eDiv(sg.cost[ck][i], den[i]));
    }
    let er = null;
    for (const ln of lines) {
      const v = v3eFc(c, 'REV.l.' + ln.id + '.val');
      const ck = v3eGet(v3eOr(v3eGet(ln, 'cost'), {}), 'cogs_r_key');
      const hasU = v3eT(ck) && Object.prototype.hasOwnProperty.call(uh, ck);
      v3eToGiven(c, 'ucost.' + ln.id, hasU ? uh[ck][H - 1] : null, v3eGet(sw, 'ucost_interp')); // 끝값 하나 꼴: 직전 실적 단위원가에서 출발
      if (('ucost.' + ln.id) in c.A_given) { // 단위원가 가정이 있는 줄만 가정 행을 만듦. 없는 줄은 원가율로 계산
        if (v3eGet(sw, 'ucost_interp') === 'cagr') { // 정률 보간: 시작값과 끝값을 연평균 같은 비율로 이음
          const A_ = v3eOr(v3eGet(c.I, 'assump'), {});
          const raw = v3eGet(v3eOr(v3eGet(A_, c.S), {}), 'ucost.' + ln.id, v3eGet(v3eOr(v3eGet(A_, 'Base'), {}), 'ucost.' + ln.id));
          if (raw != null && typeof raw === 'object' && !Array.isArray(raw) && !('by_year' in raw) && v3eNz(v3eGet(raw, 'start')) > 0 && v3eNz(v3eGet(raw, 'end')) > 0) {
            const s_ = raw.start, e_ = raw.end, arr = [];
            for (let k = 0; k < N; k++) arr.push(N <= 1 ? s_ : s_ * (e_ / s_) ** (k / (N - 1)));
            c.A_given['ucost.' + ln.id] = arr;
          }
        }
        v3eSeta(c, 'ucost.' + ln.id, null);
      }
      const uc = v3eA(c, 'ucost.' + ln.id);
      const vol = v3eGet(c.rows, 'REV.l.' + ln.id + '.vol');
      let lr = null;
      if (!(v3eT(uc) && v3eT(vol))) { // 단위원가가 없는 줄: 원가 키가 있으면 그 원가율, 없으면 기타 잔여(과거 사업부 원가가 있을 때)나 전사 원가율
        if (v3eT(ck)) lr = v3eOr(v3eA(c, 'cogs_r.' + ck), null) || v3eSegRate(c, sg, ck, cr_def);
        else if (sg.etc) { er = er || v3eSegRate(c, sg, null, cr_def); lr = er; }
        else lr = cr;
      }
      const lc = v3eE06Seq(N, (k) => (v3eT(uc) && v3eT(vol) ? vol[H + k] * uc[k] / v3eOr(v3eGet(ln, 'unit_conv'), 1.0) : v[k] * lr[k]));
      v3ePut(c, 'OPX.cogs.l.' + ln.id, null, lc);
      if (v3eT(uc) && v3eT(vol) && hasU) v3ePut(c, 'OPX.ucost.' + ln.id, uh[ck], uc); // 단위원가 행: 과거는 사업부 원가 ÷ 수량, 추정은 가정
      for (let k = 0; k < N; k++) {
        cogs[k] += lc[k];
        if (v3eT(ck)) { seg[ck][k] += lc[k]; srev[ck][k] += v[k]; }
      }
    }
    if (sg.known.length) v3eSegRows(c, sg, seg, srev, cogs, rev);
  } else { // components: 재료, 인건비, 감가상각, 기타
    const mat = v3eSeta(c, 'cogs_mat_pct', v3eAvg(c, v3eHist(c, 'OPX.cogs.mat'), R.rev, null, 'cogs_mat_pct'));
    const oth = v3eSeta(c, 'cogs_other_pct', v3eAvg(c, v3eHist(c, 'OPX.cogs.other'), R.rev, null, 'cogs_other_pct'));
    let lab;
    if (sw.labor_mode === 'headcount') lab = v3eE06Seq(N, (k) => v3eFc(c, 'OPX.labor_total')[k] - v3eFc(c, 'OPX.sga.labor')[k]);
    else { // 인원 방식이 아니면 전체 인건비가 없으므로 원가 인건비 ÷ 매출 과거 평균으로
      const lp = v3eSeta(c, 'cogs_labor_pct', v3eNz(v3eAvg(c, v3eHist(c, 'OPX.cogs.labor'), R.rev, null, 'cogs_labor_pct')), '최근 평균');
      lab = v3eE06Seq(N, (k) => rev[k] * v3eNz(lp[k]));
    }
    const dep = v3eE06Seq(N, (k) => v3eFc(c, 'PPE.dep')[k] * (1 - v3eA(c, 'dep_sga_share')[k]) + v3eFc(c, 'INT.amort')[k] * (1 - v3eA(c, 'amort_sga_share')[k]));
    const m_ = v3eE06Seq(N, (k) => rev[k] * v3eNz(mat[k])), o_ = v3eE06Seq(N, (k) => rev[k] * v3eNz(oth[k]));
    v3ePut(c, 'OPX.cogs.mat', v3eHist(c, 'OPX.cogs.mat'), m_);
    v3ePut(c, 'OPX.cogs.labor', v3eHist(c, 'OPX.cogs.labor'), lab);
    v3ePut(c, 'OPX.cogs.dep', v3eHist(c, 'OPX.cogs.dep'), dep);
    v3ePut(c, 'OPX.cogs.other', v3eHist(c, 'OPX.cogs.other'), o_);
    cogs = v3eE06Seq(N, (k) => m_[k] + lab[k] + dep[k] + o_[k]);
  }
  v3ePut(c, 'OPX.cogs', cogs_h, cogs);
  v3ePut(c, 'OPX.cogs_r', cr_h, v3eE06Seq(N, (k) => v3eDiv(cogs[k], rev[k])));
  const gp = v3ePut(c, 'OPX.gp', v3eE06Seq(H, (i) => R.rev[i] - cogs_h[i]), v3eE06Seq(N, (k) => rev[k] - cogs[k]));
  const allrev = c.rows['REV.total'];
  v3ePut(c, 'OPX.gpm', v3eE06Seq(H + N, (i) => v3eDiv(gp[i], allrev[i])), [], 'hist+fc');
}

// ── E07 rnd ──────────────────────────────────────────────────────────
function step_rnd(c) {
  const N = c.N, H = c.H, R = c.R;
  const rev = v3eFc(c, 'REV.total');
  const tot_h = v3eHist(c, 'RND.total'), cap_h = v3eHist(c, 'RND.cap'), exp_h = v3eHist(c, 'RND.exp');
  let pct_def = v3eNz(v3eAvg(c, tot_h, R.rev, null, 'rnd_pct'));
  const RD = v3eOr(v3eGet(c.I, 'rnd'), {});
  let target = v3eGet(RD, 'target');
  const bench = v3eOr(v3eGet(RD, 'bench'), []);       // 비교기업 R&D ÷ 매출(301 R&D 벤치마크). include 가 거짓인 회사는 평균에서 뺌
  if (bench.length) {
    for (const b of bench) v3eOne(c, 'RND.bench.' + v3ePyStr(v3eOr(v3eGet(b, 'id'), v3eGet(b, 'name'))), v3eGet(b, 'ratio'));
    const xs = bench.filter((b) => v3eT(v3eGet(b, 'include', true)) && v3eGet(b, 'ratio') != null).map((b) => b.ratio);
    const bavg = xs.length ? v3eSum(xs) / xs.length : null;
    v3eOne(c, 'RND.bench_avg', bavg);
    if (target == null) target = bavg;
  }
  if (c.sw.rnd_mode === 'linear_to' && target != null) {
    const s = v3eNz(v3eDiv(v3eLast(tot_h), v3eLast(R.rev)), pct_def);
    pct_def = { start: s + ((target - s) / N), end: target };
  }
  const pct = v3eSeta(c, 'rnd_pct', pct_def, '최근 평균 유지');
  const cs = v3eSeta(c, 'rnd_cap_share', v3eNz(v3eAvg(c, cap_h, tot_h, null, 'rnd_cap_share')), '최근 평균');
  const tot = v3eE06Seq(N, (k) => rev[k] * pct[k]);
  const cap = v3eE06Seq(N, (k) => tot[k] * cs[k]);
  v3ePut(c, 'RND.total', tot_h, tot);
  v3ePut(c, 'RND.pct', v3eE06Seq(H, (i) => v3eDiv(tot_h[i], R.rev[i])), pct);
  v3ePut(c, 'RND.cap', cap_h, cap);
  v3ePut(c, 'RND.exp', exp_h, v3eE06Seq(N, (k) => tot[k] - cap[k]));
}

// ── E08 assets ───────────────────────────────────────────────────────
function step_assets(c) {
  const I = c.I, N = c.N, H = c.H, R = c.R, sw = c.sw;
  const hp = v3eOr(v3eGet(I, 'hist_prev'), {});
  const rev = v3eFc(c, 'REV.total');
  const ppe_h = v3eHist(c, 'BS.ppe'), capex_h = v3eHist(c, 'CF.capex_ppe').map((x) => (x == null ? null : -x)), dep_h = v3eHist(c, 'CF.dep'), rou_h = v3eHist(c, 'PPE.rou_add');
  const bop_h = [v3eGet(hp, 'BS.ppe')].concat(ppe_h.slice(0, -1));
  const disp_h = v3eE06Seq(H, (i) => (bop_h[i] == null || capex_h[i] == null || dep_h[i] == null || ppe_h[i] == null ? null : bop_h[i] + capex_h[i] + v3eNz(rou_h[i]) - dep_h[i] - ppe_h[i]));
  let mode = sw.ppe_mode;
  if (mode === 'auto' || mode === 'waterfall') { // 변동표 워터폴은 rdetail ppe_roll이 있을 때. 없으면 maint_exp
    mode = v3eT(v3eGet(I, 'ppe_roll')) ? 'waterfall' : 'maint_exp';
  }
  const base_ppe = sw.capex_maint_base === 'ppe';
  const capex_a = capex_h.slice();                    // 튄 CAPEX 처리(ADJ.capex_spike): 일시적이면 평균에서 빼고, 주기적이면 주기 연수로 나눈 값으로
  const ys = c.inp.timeline.hist;
  const spikes = v3eOr(v3eGet(I, 'capex_spike'), []);
  for (const sp of spikes) {
    if (ys.includes(v3eGet(sp, 'year')) && capex_a[ys.indexOf(sp.year)] != null) {
      const i = ys.indexOf(sp.year);
      capex_a[i] = v3eGet(sp, 'mode', 'exclude') === 'exclude' ? null : capex_a[i] / Math.max(Number(v3eOr(v3eGet(sp, 'cycle'), 1)), 1.0);
    }
  }
  if (spikes.length) v3ePut(c, 'ADJ.capex_spike', v3eE06Seq(H, (i) => (capex_h[i] == null ? null : v3eNz(capex_a[i]) - capex_h[i])), v3eFill(N));
  const cm_def = v3eAvg(c, capex_a, base_ppe ? bop_h : R.rev, null, 'capex_maint_pct');
  const cm = v3eSeta(c, 'capex_maint_pct', v3eNz(cm_def), '최근 평균 CAPEX ÷ ' + (base_ppe ? '기초 유형자산' : '매출'));
  let cx = v3eSeta(c, 'capex_exp', 0.0);
  if (sw.ppe_mode === 'simple') {                     // simple 은 CAPEX = 매출 × 비율 하나(설계서 2-5, 원형 101 Model 121～122행). 확장 CAPEX 칸을 쓰지 않음(M1-125)
    if (cx.some((x) => v3eT(v3eNz(x)))) v3eChk(c, 'capex_exp_unused', 'info', 'ppe_mode 가 simple 이라 확장 CAPEX 입력을 쓰지 않음(쓰려면 maint_exp)');
    cx = v3eFill(N, 0.0);
  }
  const rp = v3eSeta(c, 'rou_add_pct', v3eNz(v3eAvg(c, rou_h, R.rev, null, 'rou_add_pct')));
  const ra = v3eSeta(c, 'rou_add_abs', 0.0);
  const dr = v3eSeta(c, 'dep_rate', v3eNz(v3eAvg(c, dep_h, bop_h, null, 'dep_rate')), '최근 평균');
  const bop = [], capm = [], capx = [], capex = [], rou = [], dep = [], eop = [];
  let prev = v3eLast(ppe_h);
  let wf;
  if (mode === 'waterfall') wf = v3eWaterfall(c, rev, cx);
  for (let k = 0; k < N; k++) {
    const b = prev;
    let m_ = (base_ppe ? b : rev[k]) * cm[k];
    let r_ = rev[k] * rp[k] + ra[k];
    let d_;
    if (mode === 'waterfall') {
      m_ = wf.capex[k] - cx[k]; d_ = wf.dep[k]; r_ = wf.rou[k];
    } else {
      d_ = b * dr[k];
    }
    const e = b + m_ + cx[k] + r_ - d_;
    bop.push(b); capm.push(m_); capx.push(cx[k]); capex.push(m_ + cx[k]); rou.push(r_); dep.push(d_); eop.push(e);
    prev = e;
  }
  v3ePut(c, 'PPE.bop', bop_h, bop);
  v3ePut(c, 'PPE.capex_maint', null, capm);
  v3ePut(c, 'PPE.capex_exp', null, capx);
  v3ePut(c, 'PPE.capex', capex_h, capex);
  v3ePut(c, 'PPE.rou_add', rou_h, rou);
  v3ePut(c, 'PPE.dep', dep_h, dep);
  v3ePut(c, 'PPE.disp', disp_h, v3eFill(N, 0.0));
  v3ePut(c, 'PPE.eop', ppe_h, eop);
  v3ePut(c, 'PPE.capex_pct', v3eE06Seq(H, (i) => v3eDiv(capex_h[i], R.rev[i])), v3eE06Seq(N, (k) => v3eDiv(capex[k], rev[k])));
  v3ePut(c, 'PPE.capex_da', v3eE06Seq(H, (i) => v3eDiv(capex_h[i], dep_h[i])), v3eE06Seq(N, (k) => v3eDiv(capex[k], dep[k])));
  if (mode === 'waterfall') {                         // 묶음 합 = 재무상태표 유형자산(PPE.check). 직전 결산은 변동표 기말 합 − 재무상태표
    const ids = I.ppe_roll.classes.map((cl) => cl.id);
    const s0 = v3eSum(I.ppe_roll.classes.map((cl) => v3eNz(v3eGet(cl, 'eop_fy0'))));
    const ckf = [];
    for (let k = 0; k < N; k++) ckf.push(v3eSum(ids.map((x) => v3eFc(c, 'PPE.' + x + '.eop')[k])) - eop[k]);
    const ck = v3ePut(c, 'PPE.check', v3eFill(H - 1).concat([v3eLast(ppe_h) == null ? null : s0 - v3eLast(ppe_h)]), ckf);
    const big = ck.filter((x) => x != null && Math.abs(x) > 1e-6);
    if (big.length) {
      let mx = big[0];
      for (const x of big) if (Math.abs(x) > Math.abs(mx)) mx = x;
      v3eChk(c, 'ppe_check', 'warn', '유형자산 묶음 합이 재무상태표와 ' + v3eFmt2(mx, '+,.2f') + '억 다름(변동표 단위, 묶음 빠짐 확인)', mx);
    }
  }
  // 무형자산
  const int_h = v3eHist(c, 'BS.intan'), gw_h = v3eHist(c, 'BS.gw'), icap_h = v3eHist(c, 'CF.capex_int').map((x) => (x == null ? null : -x)), am_h = v3eHist(c, 'CF.amort');
  const ibop_h = [v3eGet(hp, 'BS.intan')].concat(int_h.slice(0, -1));
  const rcap_h = v3eHist(c, 'RND.cap');
  const oth_h = v3eE06Seq(H, (i) => (icap_h[i] == null ? null : Math.max(icap_h[i] - v3eNz(rcap_h[i]), 0.0)));
  const ip = v3eSeta(c, 'int_capex_other_pct', v3eNz(v3eAvg(c, oth_h, R.rev, null, 'int_capex_other_pct')), '최근 평균(자산화 R&D 제외)');
  const ar = v3eSeta(c, 'amort_rate', v3eNz(v3eAvg(c, am_h, ibop_h, null, 'amort_rate')), '최근 평균');
  const oa = v3eSeta(c, 'int_other_add', 0.0);
  const life = v3eNz(v3eGet(v3eOr(v3eGet(I, 'capex'), {}), 'int_other_amort_years'), 5);
  const cashf = v3eT(v3eGet(v3eOr(v3eGet(I, 'capex'), {}), 'int_other_cash', true)) ? 1.0 : 0.0;
  v3eOne(c, 'CTL.a.int_other_life', life);
  v3eOne(c, 'CTL.a.int_other_cash', cashf);
  const rcap = v3eFc(c, 'RND.cap');
  const ibop = [], icap = [], iam = [], iamo = [], ieop = [];
  prev = v3eLast(int_h);
  const start = { next: 1, same: 0, half: 0 }[sw.vintage_start];
  const half = sw.vintage_start === 'half';
  // vint: 빈티지 정액 상각. 상각은 내용연수가 끝나면 0. half 면 첫해 반년, 내용연수 다음 해에 남은 반년
  const vint = (amts, k, lf) => {
    let s = 0.0;
    for (let j = 0; j < k + 1; j++) {
      const age = k - j - start;
      if (v3eT(amts[j]) && ((0 <= age && age < lf) || (half && age === lf))) s += amts[j] / lf * (half && (age === 0 || age === lf) ? 0.5 : 1.0);
    }
    return s;
  };
  const life_mode = v3eGet(sw, 'amort_mode') === 'life'; // life: 무형 CAPEX 도 빈티지 정액, 기존 잔액은 남은 연수로 정액(설계서 2-5 INT.amort)
  const capI = v3eOr(v3eGet(I, 'capex'), {});
  const ilife = v3eNz(v3eGet(capI, 'int_life'), 5);
  const iremain = v3eOr(v3eGet(capI, 'int_remain'), v3eT(ar[0]) ? 1 / ar[0] : ilife);
  if (life_mode) {
    v3eOne(c, 'CTL.a.int_life', ilife);
    v3eOne(c, 'CTL.a.int_remain', iremain);
  }
  const caps = [];
  const int0 = v3eLast(int_h);
  for (let k = 0; k < N; k++) {
    const b = prev;
    const cp = rcap[k] + rev[k] * ip[k];
    caps.push(cp);
    const ao = vint(oa, k, life);
    const a_ = !life_mode ? b * ar[k] : Math.min(int0 / iremain, Math.max(int0 - int0 / iremain * k, 0.0)) + vint(caps, k, ilife);
    const e = b + cp + oa[k] - a_ - ao;
    ibop.push(b); icap.push(cp); iam.push(a_ + ao); iamo.push(ao); ieop.push(e);
    prev = e;
  }
  v3ePut(c, 'INT.bop', ibop_h, ibop);
  v3ePut(c, 'INT.capex', icap_h, icap);
  v3ePut(c, 'INT.other_add', null, oa);
  v3ePut(c, 'INT.amort_other', null, iamo);
  v3ePut(c, 'INT.amort', am_h, iam);
  v3ePut(c, 'INT.eop', int_h, ieop);
  v3ePut(c, 'INT.gw', gw_h, v3eFill(N, v3eLast(gw_h)));
}

// _waterfall: 자산 묶음별 워터폴(301 PPE 탭). rdetail ppe_roll의 FY0 기말 장부가와 내용연수를 씀
function v3eWaterfall(c, rev, cx) {
  const N = c.N, sw = c.sw;
  const roll = c.I.ppe_roll;
  const pickl = { lower: 0, mid: null, upper: 1 }[sw.life_pick];
  const tot_capex = v3eFill(N, 0.0), tot_dep = v3eFill(N, 0.0), tot_rou = v3eFill(N, 0.0);
  const cip_x = v3eFill(N, 0.0);
  const order = roll.classes.slice().sort((a, b) => (a.id === 'cip' ? 0 : 1) - (b.id === 'cip' ? 0 : 1));
  const H = c.H, ys = c.inp.timeline.hist;
  const byid = {};
  for (const cl of roll.classes) byid[cl.id] = cl;
  const rev_h = v3eHist(c, 'IS.rev');
  // 묶음의 연도별 변동표 값(inputs._ppe_roll 이 붙인 hist). 없으면 null h개
  const hist_of = (cid, nm) => { const v = v3eGet(v3eOr(v3eGet(v3eOr(byid[cid], {}), 'hist'), {}), nm); return v != null ? v.slice() : v3eFill(H); };
  // 평균에 실제로 들어간 연도를 근거 문구로
  const span = (idx, xs) => {
    const used = idx.filter((i) => xs[i] != null).map((i) => ys[i]);
    const why = used.length > 1 ? '변동표 ' + v3ePyStr(used[0]) + '～' + v3ePyStr(v3eLast(used)) + '년 ' + used.length + '개 해 평균'
      : used.length ? '직전 결산 한 해(' + v3ePyStr(used[0]) + '년) 값. 변동표가 한 해뿐' : null;
    return [used, why];
  };
  const one_year = [];                                // 한 해 값으로 기본값을 낸 가정(점검 ppe_roll_short)
  let xr = v3eFill(N, 1.0), tb = v3eFill(N, 0.3);
  if ('cip' in byid) {
    // 건설중인자산 대체율 기본값(M3-046, 원형 301 PPE!J39:N39 = −대체 ÷ (기초 + 취득), O39 = 평균): 가정이 없으면 과거 평균, 변동표 과거가 없으면 100%
    const cb_ = hist_of('cip', 'bop'), cc_ = hist_of('cip', 'capex'), cxf_ = hist_of('cip', 'xfer');
    const xr_h = v3eE06Seq(H, (i) => (cxf_[i] == null || v3eNz(cb_[i]) + v3eNz(cc_[i]) <= 0 ? null : -cxf_[i] / (v3eNz(cb_[i]) + v3eNz(cc_[i]))));
    const xr_def = v3eAvg(c, xr_h, null, v3eAvgIdx(c, 'cip_xfer_rate'));
    const [used, why] = span(v3eAvgIdx(c, 'cip_xfer_rate'), xr_h);
    if (!('cip_xfer_rate' in c.A_given) && used.length === 1) one_year.push('건설중인자산 대체 비율');
    xr = v3eSeta(c, 'cip_xfer_rate', xr_def == null ? 1.0 : Math.min(Math.max(xr_def, 0.0), 1.0), why ? '대체 유출 ÷ (기초 + 취득), ' + why : '변동표 과거 값이 없어 100%');
    // 대체분 건물 몫 기본값(M3-047, 원형 PPE!O40 = 0.3 입력): 가정이 없으면 실적(건물 묶음 대체 유입 합 ÷ 건설중인자산 대체 유출 합), 자료가 없으면 0.3
    const bx_ = hist_of('bldg', 'xfer');
    let num = 0.0, den = 0.0;
    const used2 = [];
    for (const i of v3eAvgIdx(c, 'cip_to_bldg')) {
      if (cxf_[i] != null && bx_[i] != null && cxf_[i] < 0) {
        num += Math.max(bx_[i], 0.0);
        den += -cxf_[i];
        used2.push(ys[i]);
      }
    }
    tb = v3eSeta(c, 'cip_to_bldg', den > 0 ? Math.min(Math.max(num / den, 0.0), 1.0) : 0.3,
      den > 0 ? (used2.length > 1 ? '변동표 ' + v3ePyStr(used2[0]) + '～' + v3ePyStr(v3eLast(used2)) + '년 건물 묶음 대체 유입 합 ÷ 건설중인자산 대체 유출 합'
        : '직전 결산 한 해(' + v3ePyStr(used2[0]) + '년) 건물 묶음 대체 유입 ÷ 건설중인자산 대체 유출') : '변동표 과거 값이 없어 원형 301 값 30%');
  }
  for (const cl of order) {
    const cid = cl.id;
    const lf = v3eGet(cl, 'life');
    const life = !v3eT(lf) ? null : Array.isArray(lf) ? (pickl == null ? v3eSum(lf) / lf.length : lf[Math.min(pickl, lf.length - 1)]) : lf;
    let pct;
    if (cid === 'rou') {                              // 사용권자산은 rou_add_pct, rou_add_abs 가정을 씀
      pct = v3eFill(N, 0.0);
    } else {
      // 묶음별 CAPEX 비율 기본값(M1-257, M3-043, 원형 301 PPE!O51:O55 = AVERAGE(J51:N51)): 변동표 연도별 취득 ÷ 매출의 최근 avg_years 평균
      // (avg_exclude 의 capex_<묶음>_pct, all 연도 제외). 변동표 과거가 없으면 입력의 capex_pct(직전 결산 한 해)
      const ch_ = hist_of(cid, 'capex');
      const ix_ = v3eAvgIdx(c, 'capex_' + cid + '_pct');
      const p_def = v3eAvg(c, ch_, rev_h, ix_);
      const [used, why] = span(ix_, v3eE06Seq(H, (i) => (ch_[i] == null || !v3eT(rev_h[i]) ? null : ch_[i])));
      if (!(('capex_' + cid + '_pct') in c.A_given) && used.length === 1 && !one_year.includes('묶음별 CAPEX 비율')) one_year.push('묶음별 CAPEX 비율');
      pct = v3eSeta(c, 'capex_' + cid + '_pct', p_def == null ? v3eNz(v3eGet(cl, 'capex_pct')) : p_def, why ? '취득 ÷ 매출, ' + why : '입력 값(직전 결산 한 해)');
    }
    let bop = v3eNz(v3eGet(cl, 'eop_fy0'));
    const remain = v3eOr(v3eGet(cl, 'remain_life'), life);
    const exist0 = v3eT(remain) && !(cid === 'land' || cid === 'cip') ? bop / remain : 0.0;
    const adds = [], rows = { bop: [], capex: [], xfer: [], dep: [], eop: [] };
    const dep_e = [], dep_v = [];                     // 워터폴 내역: 기존분, 빈티지(취득 연도)별 상각
    for (let j = 0; j < N; j++) dep_v.push(v3eFill(N, 0.0));
    for (let k = 0; k < N; k++) {
      let cap = rev[k] * pct[k] + (cid === 'cip' ? cx[k] : 0.0);
      if (cid === 'rou') {
        cap = rev[k] * (v3eA(c, 'rou_add_pct')[k]) + v3eA(c, 'rou_add_abs')[k];
      }
      let xf;
      if (cid === 'cip') {
        xf = -(bop + cap) * xr[k];
        cip_x[k] = xf;
      } else if (cid === 'bldg') {
        xf = -cip_x[k] * tb[k];
      } else if (cid === 'mach') {
        xf = -cip_x[k] * (1 - tb[k]);
      } else {
        xf = 0.0;
      }
      let d_;
      const add_k = Math.max(cap + xf, 0.0);
      if (v3eT(life) && !(cid === 'land' || cid === 'cip')) {
        let de;
        if (sw.exist_dep === 'step' && (cid === 'mach' || cid === 'other')) {
          de = Math.max(exist0 * (1 - k / life), 0.0);
        } else {
          de = k < v3eOr(remain, 0) ? exist0 : 0.0;
        }
        const st = { next: 1, same: 0, half: 0 }[sw.vintage_start];
        const hf = sw.vintage_start === 'half';
        let dvv = 0;
        for (let j = 0; j <= k; j++) {                 // 그해 취득분(j = k)은 same, half 일 때만 그해부터
          if ((0 <= k - j - st && k - j - st < life) || (hf && k - j === life)) {
            const x_ = (j < k ? adds[j] : add_k) / life * (hf && (k - j === 0 || k - j === life) ? 0.5 : 1.0);
            dep_v[j][k] = x_;
            dvv += x_;
          }
        }
        d_ = de + dvv;
        dep_e.push(de);
      } else {
        d_ = 0.0;
      }
      adds.push(add_k);
      const e = bop + cap + xf - d_;
      rows.bop.push(bop); rows.capex.push(cap); rows.xfer.push(xf); rows.dep.push(d_); rows.eop.push(e);
      if (cid === 'rou') {
        tot_rou[k] += cap;
      } else {
        tot_capex[k] += cap;
      }
      tot_dep[k] += d_;
      bop = e;
    }
    const hs = v3eGet(cl, 'hist');                    // 실적 열(M3-060): 변동표 연도 값이 있으면 과거 열에 넣음(없으면 명시 기간만)
    for (const nm of ['bop', 'capex', 'xfer', 'dep', 'eop']) v3ePut(c, 'PPE.' + cid + '.' + nm, v3eT(hs) ? hist_of(cid, nm) : null, rows[nm]);
    if (v3eT(hs)) v3ePut(c, 'PPE.' + cid + '.oth', hist_of(cid, 'oth'), v3eFill(N, 0.0));
    if (dep_e.length) {
      v3eOne(c, 'PPE.' + cid + '.life', life);
      v3ePut(c, 'PPE.' + cid + '.dep_exist', null, dep_e);
      for (let j = 0; j < N; j++) v3ePut(c, 'PPE.' + cid + '.dep_v.' + v3ePyStr(c.years_f[j]), null, dep_v[j]);
    }
  }
  if (one_year.length) v3eChk(c, 'ppe_roll_short', 'info', '유형자산 변동표가 직전 결산 한 해뿐이라 ' + one_year.join(', ') + '을 그해 값으로 둠(여러 해 변동표를 넣으면 평균)');
  return { capex: tot_capex, dep: tot_dep, rou: tot_rou };
}

// ── E09 sga ──────────────────────────────────────────────────────────
// _share_def: 판관비 몫 기본값과 근거. sw.share_years 가 1 이하면 직전 결산 값, 크면 최근 n년 평균(값이 없는 해는 뺌. 설계서 M1-122)
function v3eShareDef(c, hv) {
  const n = Math.trunc(Number(v3eNz(v3eGet(c.sw, 'share_years'), 1)));
  if (n <= 1) return [v3eNz(v3eLast(v3eOr(hv, [null])), 1.0), '직전 결산 유지'];
  const xs = hv.slice(-n).filter((x) => x != null);
  return [xs.length ? v3eSum(xs) / xs.length : 1.0, '최근 ' + n + '년 평균'];
}

function step_sga(c) {
  const I = c.I, N = c.N, H = c.H, R = c.R, sw = c.sw;
  const rev = v3eFc(c, 'REV.total');
  const cfg = v3eOr(v3eGet(v3eOr(v3eGet(I, 'opex'), {}), 'groups'), {});
  const keys = v3eSGA_ORDER.slice().concat(Object.keys(cfg).filter((k) => k.startsWith('custom.')));
  const [dep_d, dep_w] = v3eShareDef(c, v3eHist(c, 'OPX.dep_sga_share'));
  const [am_d, am_w] = v3eShareDef(c, v3eHist(c, 'OPX.amort_sga_share'));
  const dep_s = v3eSeta(c, 'dep_sga_share', dep_d, dep_w);
  const am_s = v3eSeta(c, 'amort_sga_share', am_d, am_w);
  v3ePut(c, 'OPX.dep_sga_share', v3eHist(c, 'OPX.dep_sga_share'), dep_s);
  v3ePut(c, 'OPX.amort_sga_share', v3eHist(c, 'OPX.amort_sga_share'), am_s);
  // 인건비 블록
  const lt_h = v3eHist(c, 'OPX.labor_total'), hc_in = v3eHist(c, 'OPX.hc');
  const depts = v3eOr(v3eGet(v3eOr(v3eGet(I, 'opex'), {}), 'hc_depts'), []);
  // sw.hc_rnd = exclude(기본, 원형 EBIT 104행): 부서 표에서 rnd 로 표시한 부서는 인원 합계에서 뺌. 이때 입력 OPX.hc 는 R&D 를 포함한 총원
  const skip = depts.filter((d) => v3eT(v3eGet(d, 'rnd')) && v3eGet(sw, 'hc_rnd', 'exclude') !== 'include').map((d) => d.id);
  let hc_h = hc_in;
  if (skip.length) hc_h = v3eE06Seq(H, (i) => (hc_in[i] == null ? null : hc_in[i] - v3eSum(skip.map((x) => v3eNz(v3eHist(c, 'OPX.hc.' + x)[i])))));
  let lab_fc = null;
  if (sw.labor_mode === 'headcount' && v3eT(v3eLast(hc_h))) {
    const hp = v3eOr(v3eGet(I, 'hist_prev'), {});
    const avg_b = v3eGet(sw, 'hc_basis', 'eop') === 'avg'; // 인당 인건비의 직원 수 기준: eop 기말(원형 실습 엑셀), avg 기초와 기말 평균(노트 01 B8 원칙)
    let den_h = hc_h;
    if (avg_b) {
      let p0 = v3eGet(hp, 'OPX.hc');
      if (p0 != null && skip.length) { // 기초 총원에서 R&D 부서 기초 인원을 뺌. 부서 기초 인원이 없으면 첫 과거 해는 기말 인원으로
        const ps = skip.map((x) => v3eGet(hp, 'OPX.hc.' + x));
        p0 = ps.some((x) => x == null) ? null : p0 - v3eSum(ps);
      }
      den_h = [];
      for (let i = 0; i < H; i++) {
        const p = i ? hc_h[i - 1] : p0;
        den_h.push(p == null || hc_h[i] == null ? hc_h[i] : (p + hc_h[i]) / 2);
      }
    }
    const wg = v3eSeta(c, 'wage_g', v3eNz(v3eGet(I.market, 'wage5')), '임금상승률 5년 평균');
    const rph0 = v3eLast(R.rev) / v3eLast(hc_h);
    const rph_add = v3eSeta(c, 'rev_per_hc_add', 0.0);
    const sl_h = v3eHist(c, 'OPX.sga.labor');
    const ls_h = v3eE06Seq(H, (i) => v3eDiv(sl_h[i], lt_h[i]));
    const [ls_d, ls_w] = v3eShareDef(c, ls_h);
    const ls = v3eSeta(c, 'labor_sga_share', ls_d, Math.trunc(Number(v3eNz(v3eGet(sw, 'share_years'), 1))) > 1 ? ls_w : null);
    let cph = v3eLast(lt_h) / v3eLast(den_h), rph = rph0;
    let hc = [];
    const cphs = [];
    for (let k = 0; k < N; k++) {
      rph += rph_add[k];
      cph *= 1 + wg[k];
      hc.push(rev[k] / rph);
      cphs.push(cph);
    }
    if (v3eT(depts)) { // 부서별 인원(2-4 인건비 블록): 변동 부서 = 매출 ÷ 인당 매출, 고정 부서 = 전년 + 증가 인원
      hc = v3eFill(N, 0.0);
      for (const d of depts) {
        const vr = v3eGet(d, 'kind') === 'V', dh = v3eHist(c, 'OPX.hc.' + d.id);
        const rp_h = v3eE06Seq(H, (i) => v3eDiv(R.rev[i], dh[i]));
        if (skip.includes(d.id)) { // 합계에서 뺀 R&D 부서: 과거 인원과 인당 매출만 보여 줌(원형 EBIT 111, 120행)
          v3ePut(c, 'OPX.hc.' + d.id, dh, v3eFill(N));
          v3ePut(c, 'OPX.rev_per_hc.' + d.id, rp_h, v3eFill(N));
          continue;
        }
        const ad = v3eSeta(c, 'hc.' + d.id + '.add', v3eNz(v3eGet(d, 'add')));
        let cur = vr ? v3eLast(R.rev) / v3eLast(dh) : v3eLast(dh);
        const dhc = [], drp = [];
        for (let k = 0; k < N; k++) {
          cur += ad[k];
          drp.push(cur);
          dhc.push(vr ? rev[k] / cur : cur);
          hc[k] += dhc[k];
        }
        v3ePut(c, 'OPX.hc.' + d.id, dh, dhc);
        if (vr) v3ePut(c, 'OPX.rev_per_hc.' + d.id, rp_h, drp);
        else v3ePut(c, 'OPX.rev_per_hc.' + d.id, rp_h, v3eE06Seq(N, (k) => v3eDiv(rev[k], dhc[k]))); // 고정 부서 인당 매출은 표시용(원형 EBIT 116～119행. 설계서 M1-108)
      }
    }
    let hc_b = hc;
    if (avg_b) {
      hc_b = v3eE06Seq(N, (k) => ((k === 0 ? v3eLast(hc_h) : hc[k - 1]) + hc[k]) / 2);
      v3ePut(c, 'OPX.hc_avg', den_h, hc_b);
    }
    const tot = v3eE06Seq(N, (k) => hc_b[k] * cphs[k]);
    if (skip.length) v3ePut(c, 'OPX.hc_all', hc_in, v3eFill(N));
    v3ePut(c, 'OPX.hc', hc_h, hc);
    v3ePut(c, 'OPX.cost_per_hc', v3eE06Seq(H, (i) => v3eDiv(lt_h[i], den_h[i])), cphs);
    v3ePut(c, 'OPX.labor_total', lt_h, tot);
    v3ePut(c, 'OPX.labor_sga_share', ls_h, ls);
    lab_fc = v3eE06Seq(N, (k) => tot[k] * ls[k]);
  }
  const total = v3eFill(N, 0.0);
  const sga_h = R.sga;
  const sum_h = v3eFill(H, 0.0);
  const cpi = v3eA(c, 'cpi');
  for (const g of keys) {
    const gh = v3eHist(c, 'OPX.sga.' + g);
    const drv = v3eOr(v3eGet(v3eOr(v3eGet(cfg, g), {}), 'driver'), v3eGet(v3eSGA_DRIVER, g, 'pct_sales'));
    let fc;
    if (g === 'labor' && lab_fc != null) {
      fc = lab_fc;
    } else if (g === 'dna') {
      fc = v3eE06Seq(N, (k) => v3eFc(c, 'PPE.dep')[k] * dep_s[k] + v3eFc(c, 'INT.amort')[k] * am_s[k]);
    } else if (g === 'rnd') {
      fc = v3eFc(c, 'RND.exp');
    } else if (drv === 'per_line') {
      const r = v3eSeta(c, 'sga_' + g + '_ratio', 0.0);
      const lv = v3eFc(c, 'REV.l.' + cfg[g].line + '.val');
      fc = v3eE06Seq(N, (k) => lv[k] * r[k]);
    } else if (drv === 'manual') {
      fc = v3eSeta(c, 'sga_' + g + '_val', 0.0).map((x) => v3eNz(x));
    } else if (drv === 'cpi') {
      const gr = v3eSeta(c, 'sga_' + g + '_g', cpi, '물가 연동');
      fc = [];
      let prev = v3eNz(v3eLast(gh));
      for (let k = 0; k < N; k++) {
        prev = prev * (1 + gr[k]);
        fc.push(prev);
      }
    } else {
      const ga = v3eOr(v3eGet(c.sga_adj_g, g), v3eFill(H, 0.0)); // 판관비, 영업이익 보정(정상화)을 그 묶음 평균에 반영
      const norm = v3eE06Seq(H, (i) => (gh[i] == null ? null : gh[i] + ga[i]));
      const ix = v3eAvgIdx(c, 'sga_' + g + '_pct'); // 이 가정에만 건 제외 연도(avg_exclude dict)까지 뺀 평균 창(설계서 M3-020)
      const rng = [];
      for (const i of ix) if (norm[i] != null && v3eT(c.rev_n[i])) rng.push(norm[i] / c.rev_n[i]);
      const p = v3eSeta(c, 'sga_' + g + '_pct', v3eNz(v3eAvg(c, norm, c.rev_n, ix)), '최근 평균', v3eT(rng) ? [v3eMinOf(rng), v3eMaxOf(rng)] : null);
      fc = v3eE06Seq(N, (k) => rev[k] * p[k]);
    }
    v3ePut(c, 'OPX.sga.' + g, gh, fc);
    const allrev = c.rows['REV.total'];
    v3ePut(c, 'OPX.sga.' + g + '.pct', v3eE06Seq(H, (i) => v3eDiv(gh[i], allrev[i])), v3eE06Seq(N, (k) => v3eDiv(fc[k], rev[k])));
    for (let k = 0; k < N; k++) total[k] += fc[k];
    for (let i = 0; i < H; i++) sum_h[i] += v3eNz(gh[i]);
  }
  v3ePut(c, 'OPX.sga.resid', v3eE06Seq(H, (i) => sga_h[i] - sum_h[i]), v3eFill(N, 0.0));
  v3ePut(c, 'OPX.sga', sga_h, total);
  v3ePut(c, 'OPX.sga_r', v3eE06Seq(H, (i) => v3eDiv(sga_h[i], R.rev[i])), v3eE06Seq(N, (k) => v3eDiv(total[k], rev[k])));
  if (sw.labor_mode !== 'headcount') {
    v3ePut(c, 'OPX.labor_total', lt_h, v3eFill(N));
    v3ePut(c, 'OPX.hc', hc_in, v3eFill(N));
  }
}

// ── E10 ebit ─────────────────────────────────────────────────────────
function step_ebit(c) {
  const N = c.N, H = c.H, R = c.R;
  const rev = v3eFc(c, 'REV.total'), gp = v3eFc(c, 'OPX.gp'), sga = v3eFc(c, 'OPX.sga');
  const ebit = v3eE06Seq(N, (k) => gp[k] - sga[k]);
  const da_h = v3eE06Seq(H, (i) => (v3eHist(c, 'CF.dep')[i] == null ? null : v3eHist(c, 'CF.dep')[i] + v3eNz(v3eHist(c, 'CF.amort')[i])));
  const da = v3eE06Seq(N, (k) => v3eFc(c, 'PPE.dep')[k] + v3eFc(c, 'INT.amort')[k]);
  v3ePut(c, 'OPX.ebit', R.ebit, ebit);
  v3ePut(c, 'OPX.ebit_m', v3eE06Seq(H, (i) => v3eDiv(R.ebit[i], R.rev[i])), v3eE06Seq(N, (k) => v3eDiv(ebit[k], rev[k])));
  v3ePut(c, 'OPX.da', da_h, da);
  v3ePut(c, 'OPX.ebitda', v3eE06Seq(H, (i) => (da_h[i] == null ? null : R.ebit[i] + da_h[i])), v3eE06Seq(N, (k) => ebit[k] + da[k]));
  const cons = v3eOr(v3eGet(c.I, 'cons'), {});
  const ce = v3eFill(N);
  const years = v3eOr(v3eGet(cons, 'years'), []);
  for (let j = 0; j < years.length; j++) {
    const y = years[j];
    if (c.years_f.includes(y)) {
      ce[c.years_f.indexOf(y)] = v3eOr(v3eGet(cons, 'ebit'), v3eFill(9))[j];
    }
  }
  v3ePut(c, 'OPX.ebit_cons', null, ce);
}

// ── E11 nwc ──────────────────────────────────────────────────────────
function step_nwc(c) {
  const I = c.I, N = c.N, H = c.H, R = c.R, sw = c.sw;
  const hp = v3eOr(v3eGet(I, 'hist_prev'), {});
  const rev = v3eFc(c, 'REV.total'), cogs = v3eFc(c, 'OPX.cogs');
  const hh = {};
  for (const k of ['ar', 'inv', 'oca', 'ap', 'ocl']) hh[k] = v3eHist(c, 'BS.' + k).map((x) => v3eNz(x));
  const avgb = sw.nwc_basis === 'avg';

  const bal = (k, i) => {
    if (!avgb) return hh[k][i];
    const p = i ? hh[k][i - 1] : v3eGet(hp, 'BS.' + k);
    return p == null ? hh[k][i] : (hh[k][i] + p) / 2;
  };
  const days = {
    dso: v3eE06Seq(H, (i) => v3eDiv(bal('ar', i) * 365, R.rev[i])), dio: v3eE06Seq(H, (i) => v3eDiv(bal('inv', i) * 365, R.cogs[i])),
    dpo: v3eE06Seq(H, (i) => v3eDiv(bal('ap', i) * 365, R.cogs[i])), oca_pct: v3eE06Seq(H, (i) => v3eDiv(bal('oca', i), R.rev[i])),
    ocl_pct: v3eE06Seq(H, (i) => v3eDiv(bal('ocl', i), R.rev[i])),
  };
  const A = {};
  const ys = c.inp.timeline.hist;
  // win(n, k): 최근 n개 해 창에서 avg_exclude(가정 키별, all) 연도를 뺀 열 번호와 뺀 연도(M1-245, M3-031. 원형 101 Model!O112 = AVERAGE(J112,K112,M112,N112)).
  // 창을 과거로 늘리지 않음. 창의 모든 해를 빼면 빼기를 무시
  const win = (n, k) => {
    const w = v3eE06Seq(H, (i) => i).slice(-n);
    const ex = v3eAvgExclude(I, k);
    const idx = w.filter((i) => !ex.includes(ys[i]));
    if (!idx.length && w.length) {
      if (!c.checks.some((ck) => ck.id === 'avg_exclude_all')) v3eChk(c, 'avg_exclude_all', 'warn', '평균 창의 모든 해를 빼도록 되어 있어 빼기를 무시하고 평균을 냄');
      return [w, []];
    }
    return [idx, w.filter((i) => ex.includes(ys[i])).map((i) => ys[i])];
  };
  for (const k of ['dso', 'dio', 'dpo', 'oca_pct', 'ocl_pct']) {
    const hv = days[k];
    const mode = sw.nwc_avg;
    const xs = hv.filter((x) => x != null);
    let cut = [], d;
    if (mode === 'avg3' || mode === 'avg5') {
      const r = win(mode === 'avg3' ? 3 : 5, k);
      cut = r[1];
      d = v3eAvg(c, hv, null, r[0]);
    } else if (mode === 'median5') {
      const r = win(5, k);
      cut = r[1];
      d = cut.length ? v3eMedian(r[0].filter((i) => hv[i] != null).map((i) => hv[i])) : v3eMedian(xs.slice(-5));
    } else {
      d = { last: v3eLast(hv), manual: v3eLast(hv) }[mode];
    }
    let why = { last: '직전 결산 연도', avg3: '3년 평균', avg5: '5년 평균', median5: '5년 중앙값', manual: '직접 입력' }[mode];
    if (cut.length) why += '(' + cut.map((y) => v3ePyStr(y)).join(', ') + '년 제외)';
    A[k] = v3eSeta(c, k, v3eNz(d), why);
    v3ePut(c, 'NWC.' + k, hv, A[k]);
  }
  const ar = v3eE06Seq(N, (k) => rev[k] * A.dso[k] / 365);
  const inv = v3eE06Seq(N, (k) => cogs[k] * A.dio[k] / 365);
  const oca = v3eE06Seq(N, (k) => rev[k] * A.oca_pct[k]);
  const ap = v3eE06Seq(N, (k) => cogs[k] * A.dpo[k] / 365);
  const ocl = v3eE06Seq(N, (k) => rev[k] * A.ocl_pct[k]);
  const nwc_h = v3eE06Seq(H, (i) => hh.ar[i] + hh.inv[i] + hh.oca[i] - hh.ap[i] - hh.ocl[i]);
  const nwc = v3eE06Seq(N, (k) => ar[k] + inv[k] + oca[k] - ap[k] - ocl[k]);
  let p0 = null;
  if (['ar', 'inv', 'oca', 'ap', 'ocl'].every((k) => v3eGet(hp, 'BS.' + k) != null)) {
    p0 = hp['BS.ar'] + hp['BS.inv'] + hp['BS.oca'] - hp['BS.ap'] - hp['BS.ocl'];
  }
  for (const [k, hv, fv] of [['ar', hh.ar, ar], ['inv', hh.inv, inv], ['oca', hh.oca, oca], ['ap', hh.ap, ap], ['ocl', hh.ocl, ocl]]) {
    v3ePut(c, 'NWC.' + k, hv, fv);
  }
  const alln = v3ePut(c, 'NWC.nwc', nwc_h, nwc);
  const dn = [p0 == null ? null : nwc_h[0] - p0];
  for (let i = 1; i < H + N; i++) dn.push(alln[i] - alln[i - 1]);
  v3ePut(c, 'NWC.dnwc', dn, [], 'hist+fc');
  const allrev = c.rows['REV.total'];
  v3ePut(c, 'NWC.nwc_pct', v3eE06Seq(H + N, (i) => v3eDiv(alln[i], allrev[i])), [], 'hist+fc');
}

v3eReg('E06', 'cogs', (c) => step_cogs(c, false));
v3eReg('E07', 'rnd', step_rnd);
v3eReg('E08', 'assets', step_assets);
v3eReg('E09', 'sga', (c) => { step_sga(c); step_cogs(c, true); }); // 파이썬 run()이 step_sga 뒤에 step_cogs(c, late=True)를 한 번 더 부름
v3eReg('E10', 'ebit', step_ebit);
v3eReg('E11', 'nwc', step_nwc);

// ── E12 shares ────────────────────────────────────────────────────────────
// marginal_rate(c, base): 한계세율(지방소득세 포함)
function v3eMarginalRate(c, base) {
  const T = c.I.market.tax;
  if (c.sw.tax_marginal === 'top') return v3eLast(T.brackets)[1] * (1 + T.local);
  return v3eBracketRate(Math.max(v3eNz(base), 0.0), T.brackets) * (1 + T.local);
}

// _dilution: 희석 판정(자기주식법, 전환사채 EPS 판정). price 는 판정 주가(기본 기준일 종가, sw.dilution_iter 면 모델 주당 가치)
function v3eDilution(c, price) {
  const I = c.I, sw = c.sw;
  const sh = I.shares;
  const val_date = v3eOr(v3eGet(c.inp.target, 'val_date'), '');
  const fx = Number(v3eNz(v3eGet(sh, 'split_adj'), 1.0)); // 분할, 무상증자 보정 배수(희석 요인의 수량은 곱하고 가격은 나눔)
  const basic = sh.issued - v3eNz(v3eGet(sh, 'treasury'));
  const t_m = c.t_m;
  let itm_q = 0.0, itm_x = 0.0;
  for (const o of v3eOr(v3eGet(sh, 'options'), [])) {
    const q = o.qty * fx, k_ = o.strike / fx;
    let ok = price != null && price > k_ && (!v3eT(v3eGet(o, 'start')) || val_date >= o.start);
    if (ok && v3eT(sw.exercise_window) && v3eT(v3eGet(o, 'end')) && val_date > o.end) ok = false;
    if (ok) {
      itm_q += q;
      itm_x += q * k_;
    }
  }
  for (const w of v3eOr(v3eGet(sh, 'bw'), [])) { // 신주인수권: 행사가 기준 자기주식법
    const q = w.qty * fx, k_ = w.strike / fx;
    if (price != null && price > k_) {
      itm_q += q;
      itm_x += q * k_;
    }
  }
  const tsm = itm_q - (v3eT(price) ? itm_x / price : 0.0);
  const rsu = v3eSum(v3eOr(v3eGet(sh, 'rsu'), []).map((r) => v3eNz(v3eGet(r, 'qty')))) * fx;
  const ni0 = v3eLast(c.R.ni_parent);
  let cb_add = 0.0, cb_debt = 0.0;
  const cb_tests = [];                                // 건별 판정(SHR.cb.<id>.test, M1-274): 1 전환, 0 상환. 만기(maturity)가 있으면 step_finance 가 그해 스케줄에 반영
  const cbs = v3eOr(v3eGet(sh, 'cb'), []);
  for (let n_ = 0; n_ < cbs.length; n_++) {
    const b = cbs[n_];
    if (!v3eT(v3eGet(b, 'face')) || !v3eT(v3eGet(b, 'conv_price'))) continue;
    const cp_ = b.conv_price / fx;
    const nw = b.face * 1e8 / cp_;
    let itm = price != null && price > cp_;
    if (v3eT(sw.exercise_window) && v3eT(v3eGet(b, 'window')) && v3eT(b.window[0]) && !(b.window[0] <= val_date && val_date <= v3eOr(b.window[1], '9999'))) itm = false;
    const eps0 = ni0 * 1e8 / basic;
    const eps1 = (ni0 + b.face * v3eNz(v3eGet(b, 'coupon')) * (1 - t_m)) * 1e8 / (basic + nw);
    const conv = !!(itm && eps1 <= eps0);
    if (conv) {
      cb_add += nw;
      cb_debt += b.face;
    }
    const mat = v3eGet(b, 'maturity');
    const ms = v3eT(mat) ? v3ePyStr(mat).slice(0, 4) : '';
    cb_tests.push({ id: v3ePyStr(v3eOr(v3eGet(b, 'id'), n_ + 1)).replace(/\./g, '_'), test: conv ? 1 : 0, face: b.face, new: nw, year: /^\d+$/.test(ms) ? parseInt(ms, 10) : null });
  }
  for (const r of v3eOr(v3eGet(sh, 'rcps'), [])) {
    if (sw.rcps === 'convert') {
      cb_add += v3eNz(v3eGet(r, 'shares')) * fx;
      cb_debt += v3eNz(v3eGet(r, 'book'));
    }
  }
  const pref = v3eNz(v3eGet(sh, 'pref'));
  const diluted = basic + (sw.pref === 'as_common' ? pref : 0.0) + tsm + rsu + cb_add;
  return { basic, pref, itm_q, tsm, rsu, cb_add, cb_debt, diluted, cb_tests };
}

// _shares_of: share_basis 에 맞는 주식수
function v3eSharesOf(c, d) {
  const sw = c.sw;
  return { diluted: d.diluted, basic: d.basic + (sw.pref === 'as_common' ? d.pref : 0.0), issued: c.I.shares.issued }[sw.share_basis];
}

function step_shares(c) {
  const I = c.I;
  const sh = I.shares;
  const price = v3eGet(c.inp.target, 'close');
  c.t_m = v3eMarginalRate(c, v3eLast(c.R.ebt));
  const d = v3eDilution(c, price);
  c.cb_as_equity = d.cb_debt;
  if (v3eNz(v3eGet(sh, 'split_adj'), 1.0) !== 1.0) v3eOne(c, 'SHR.split_adj', Number(sh.split_adj));
  v3eOne(c, 'SHR.issued', sh.issued);
  v3eOne(c, 'SHR.treasury', v3eNz(v3eGet(sh, 'treasury')));
  v3eOne(c, 'SHR.basic', d.basic);
  v3eOne(c, 'SHR.pref', d.pref);
  v3eOne(c, 'SHR.so_itm', d.itm_q);
  v3eOne(c, 'SHR.so_tsm', d.tsm);
  v3eOne(c, 'SHR.rsu', d.rsu);
  v3eOne(c, 'SHR.cb_add', d.cb_add);
  c.cb_tests = d.cb_tests;
  for (const t of d.cb_tests) v3eOne(c, 'SHR.cb.' + t.id + '.test', t.test);
  v3eOne(c, 'SHR.diluted', d.diluted);
  c.shares = v3eSharesOf(c, d);
}

// ── E13 finance (순환 블록) ───────────────────────────────────────────────
function step_finance(c) {
  const I = c.I, N = c.N, H = c.H, R = c.R, sw = c.sw;
  const hp = v3eOr(v3eGet(I, 'hist_prev'), {});
  const T = I.market.tax;
  const D = v3eOr(v3eGet(I, 'debt'), {});
  const circ = Math.trunc(Number(sw.circuit)) === 1;
  const rev = v3eFc(c, 'REV.total'), ebit = v3eFc(c, 'OPX.ebit');
  const bs = {};
  for (const k of ['cash', 'st_fin', 'debt_st', 'debt_lt', 'bond', 'cb', 'lease', 'rcf', 're', 'cs_apic', 'other_eq', 'nci']) bs[k] = v3eHist(c, 'BS.' + k).map((x) => v3eNz(x));
  const dh = { st: bs.debt_st, lt: bs.debt_lt, bond: bs.bond, cb: bs.cb, lease: bs.lease, rcf: bs.rcf };
  const ibd_h = [];
  for (let i = 0; i < H; i++) ibd_h.push(v3eSum(v3eTR.map((r) => dh[r][i])));
  const ibd_p = ['st', 'lt', 'bond', 'cb'].some((r) => v3eGet(hp, v3eBS_TR[r]) == null) ? null : v3eSum(v3eTR.map((r) => v3eNz(v3eGet(hp, v3eBS_TR[r]))));
  const ie_h = R.int_exp, ii_h = R.int_inc;
  const rate_h = [];
  for (let i = 0; i < H; i++) rate_h.push(v3eDiv(ie_h[i], ((ibd_h[i] + (i ? ibd_h[i - 1] : v3eNz(ibd_p, ibd_h[i]))) / 2)));
  const cs_h = [];
  for (let i = 0; i < H; i++) cs_h.push(bs.cash[i] + bs.st_fin[i]);
  const cs_p = v3eGet(hp, 'BS.cash') == null ? null : hp['BS.cash'] + v3eNz(v3eGet(hp, 'BS.st_fin'));
  const crate_h = [];
  for (let i = 0; i < H; i++) crate_h.push(v3eDiv(ii_h[i], ((cs_h[i] + (i ? cs_h[i - 1] : v3eNz(cs_p, cs_h[i]))) / 2)));
  const rmode = sw.int_rate;
  const idx4 = [];
  for (let i = 0; i < H; i++) idx4.push(i);
  const rdef = { last: v3eLast(rate_h), avg4: v3eAvg(c, rate_h, null, idx4.slice(-4)), kd: v3eLast(rate_h), manual: v3eLast(rate_h) }[rmode];
  const rate = v3eSeta(c, 'debt_rate', v3eNz(rdef), '직전 결산 실효이자율');
  // 트랜치별 이자율(DEBT.<r>.rate): 가정 debt_rate.<r> 을 준 트랜치만 따로, 나머지는 차입 이자율 하나
  const rates = {};
  for (const r of v3eTR) rates[r] = ('debt_rate.' + r) in c.A_given ? v3eSeta(c, 'debt_rate.' + r, null) : rate;
  const crate = v3eSeta(c, 'cash_rate', v3eNz(v3eLast(crate_h)), '직전 결산 이자수익 ÷ 평균 현금성자산');
  const te = v3eSeta(c, 'tax_eff', c.tax_eff_default, '최근 평균(법정 대비 0.5배 미만, 1.5배 초과 해 제외): ' + c.tax_eff_years.map((y) => String(y)).join(', '));
  const tcr = v3eSeta(c, 'tax_credit', 0.0);
  const tadj = v3eSeta(c, 'tax_adj', 0.0);
  const po = v3eSeta(c, 'payout', v3eNz(v3eAvg(c, v3eHist(c, 'CF.div').map((x) => (x == null ? null : -x)), R.ni_parent, null, 'payout')), '최근 평균');
  let bb_def = 0.0;
  if (sw.buyback_mode === 'ni_ratio') bb_def = v3eNz(v3eAvg(c, v3eHist(c, 'CF.buyback').map((x) => (x == null ? null : -x)), R.ni_parent, null, 'buyback'));
  const bb = v3eSeta(c, 'buyback', bb_def);
  const eqi = v3eSeta(c, 'equity_iss', 0.0);
  const ncs = v3eSeta(c, 'nci_share', v3eNz(v3eAvg(c, R.ni_nci, R.ni, null, 'nci_share')), '최근 평균');
  const lrr = v3eSeta(c, 'lease_repay_rate', 1 / 3, '리스 기간 정보가 없어 3년으로 봄');
  // 전환사채 판정을 스케줄에 연결(M1-274, 02 노트 8절): shares.cb[] 에 만기(maturity)가 있는 건은 만기 해에 전환 판정이면 전환(비현금, 자본으로),
  // 상환 판정이면 상환. 가정 cb_convert 나 debt.manual.cb.repay 를 직접 주면 그 값이 먼저. 만기가 없거나 명시 기간 밖이면 예전처럼 잔액 유지
  const yfc = c.years_f;
  const cb_cv = v3eFill(N, 0.0), cb_rp = v3eFill(N, 0.0), cb_txt = [];
  for (const t of v3eOr(c.cb_tests, [])) {
    if (yfc.includes(t.year)) {
      (t.test ? cb_cv : cb_rp)[yfc.indexOf(t.year)] += t.face;
      cb_txt.push(t.id + ' ' + v3ePyStr(t.year) + '년 ' + (t.test ? '전환' : '상환') + ' ' + v3eFmt2(t.face, ',.1f') + '억');
    }
  }
  const cb_auto = !('cb_convert' in c.A_given) && cb_cv.some((x) => v3eT(x));
  const cbc = v3eSeta(c, 'cb_convert', cb_auto ? cb_cv : 0.0, cb_auto ? '전환 판정인 전환사채를 만기 해에 전환(SHR.cb.<건>.test)' : null);
  if (cb_txt.length) v3eChk(c, 'cb_schedule', 'info', '전환사채 판정을 만기 해 스케줄에 반영(액면 기준, 장부 잔액까지만): ' + cb_txt.join(', '));
  const cba = v3eSeta(c, 'cb_accr_share', 0.0);
  // sw.st_fin_fwd: hold(기본, 금액을 준 해만 현금화), release(금액을 안 주면 직전 결산 잔액을 명시 기간에 똑같이 나눠 현금화)
  const rls = v3eGet(sw, 'st_fin_fwd') === 'release';
  const rel = v3eSeta(c, 'st_fin_release', rls ? v3eLast(bs.st_fin) / N : 0.0, rls ? '직전 결산 잔액을 명시 기간에 나눔' : null);
  const avg3rev = v3eAvg(c, R.rev);
  const min_cash = v3eNz(v3eGet(D, 'min_cash'), v3eNz(avg3rev) * Number(sw.min_cash));
  v3eOne(c, 'DEBT.min_cash', min_cash);
  const plan = sw.debt_plan;
  const man = v3eOr(v3eGet(D, 'manual'), {});
  const no_int = v3eOr(v3eGet(D, 'no_int'), {});    // 이자를 내지 않는 차입분 {트랜치: 금액 또는 연도별}(SK오션플랜트 신야드 차입)
  const oth_mode = sw.other_pl, eqm_mode = sw.eqm_fwd;
  const oth_net = [];
  for (let i = 0; i < H; i++) oth_net.push(R.oth_inc[i] - R.oth_exp[i]);
  const oth_pct = oth_mode === 'avg3' ? v3eNz(v3eAvg(c, oth_net, R.rev)) : 0.0;
  const eqm_v = eqm_mode === 'avg3' ? v3eNz(v3eAvg(c, R.eqm)) : 0.0;
  const dep = v3eFc(c, 'PPE.dep'), amort = v3eFc(c, 'INT.amort'), sbc = v3eFc(c, 'OPX.sga.sbc');
  const dnwc = c.rows['NWC.dnwc'].slice(H);
  const capex_p = v3eFc(c, 'PPE.capex'), capex_i = v3eFc(c, 'INT.capex'), rou = v3eFc(c, 'PPE.rou_add');
  const oadd = v3eFc(c, 'INT.other_add');
  const cashf = c.rows['CTL.a.int_other_cash'][0];
  const out = {};
  for (const k of ['int_inc', 'int_exp', 'ebt', 'tax', 'ni', 'ni_parent', 'nci_ni', 'div', 'buyback', 'cfo', 'cfi', 'cff', 'net', 'cash', 'st_fin',
    're', 'cs_apic', 'other_eq', 'nci', 'pre_rcf', 'cash_avg', 'oth_inc', 'oth_exp', 'eqm', 'accr', 'iters',
    't_base', 't_nol_bop', 't_nol_use', 't_nol_add', 't_nol_eop', 't_corp', 't_local', 't_stat', 't_b1', 't_b2', 't_b3', 't_b4',
    't_marg', 't_stat_ebit', 'fin_assets', 'cfi_oth', 'treasury']) out[k] = [];
  const tr = {};
  for (const r of v3eTR) { tr[r] = {}; for (const k of ['bop', 'draw', 'repay', 'new', 'conv', 'eop', 'avg', 'int', 'ibase']) tr[r][k] = []; }
  const prev = {};
  for (const r of v3eTR) prev[r] = v3eLast(dh[r]);
  let cash_p = v3eLast(bs.cash), stf_p = v3eLast(bs.st_fin);
  let re_p = v3eLast(bs.re), csa_p = v3eLast(bs.cs_apic), oeq_p = v3eLast(bs.other_eq), nci_p = v3eLast(bs.nci);
  let tre_p = v3eNz(v3eLast(v3eHist(c, 'BS.treasury')));   // 자기주식(EQ.treasury). 과거 값이 없으면 0
  let nol_p = v3eNz(v3eGet(v3eOr(v3eGet(I, 'tax'), {}), 'nol'));
  const nol_cap = v3eT(sw.sme) ? 1.0 : 0.8;
  for (let k = 0; k < N; k++) {
    // 트랜치(리볼버 제외)는 순환과 무관하게 먼저 정해짐
    let nonrcf_int = 0.0, flow = 0.0;
    let accr = 0.0;
    for (const r of ['st', 'lt', 'bond', 'cb', 'lease']) {
      const b = prev[r];
      const m = v3eOr(v3eGet(man, r), {});
      const draw = plan === 'manual' ? v3eNz(v3eOr(v3eExpand(v3eGet(m, 'draw'), N), v3eFill(N, 0.0))[k]) : 0.0;
      let repay = plan === 'manual' ? v3eNz(v3eOr(v3eExpand(v3eGet(m, 'repay'), N), v3eFill(N, 0.0))[k]) : 0.0;
      let nw = 0.0, conv = 0.0;
      if (r === 'cb') {
        conv = Math.min(cbc[k], b);
        accr = b * rates.cb[k] * cba[k];
        if (v3eT(cb_rp[k]) && !(plan === 'manual' && v3eGet(m, 'repay') != null)) repay += Math.min(cb_rp[k], b - conv); // 상환 판정 전환사채의 만기 상환(amort 면 아래에서 균등 상환이 덮음)
      }
      if (plan === 'amort' && r !== 'lease') repay = (b - conv) / (N - k); // 전환된 몫을 뺀 잔액을 나눠 갚음(전환과 상환이 겹쳐 잔액이 음수가 되지 않게)
      if (r === 'lease') { nw = rou[k]; repay = b * lrr[k]; }
      const e = b + draw + nw - repay - conv + (r === 'cb' ? accr : 0.0);
      const av = circ ? (b + e) / 2 : b;
      const nb = v3eGet(no_int, r) != null ? v3eNz(v3eOr(v3eExpand(no_int[r], N), v3eFill(N, 0.0))[k]) : 0.0;
      const base_i = Math.max(av - nb, 0.0);         // 이자 대상 잔액(이자를 내지 않는 차입분 제외, DEBT.<r>.int_base)
      const it = (r !== 'cb' || !v3eT(cba[k])) ? base_i * rates[r][k] : Math.max(b - nb, 0.0) * rates[r][k];
      for (const [nm, v] of [['bop', b], ['draw', draw], ['repay', repay], ['new', nw], ['conv', conv], ['eop', e], ['avg', av], ['int', it], ['ibase', base_i]]) tr[r][nm].push(v);
      nonrcf_int += it;
      flow += draw - repay;
      prev[r] = e;
    }
    const conv_k = tr.cb.conv[k];
    const stf = stf_p - rel[k];
    const fin_assets = stf_p - stf;
    const cfi_oth = -oadd[k] * cashf;
    const oi = oth_pct > 0 ? rev[k] * oth_pct : 0.0;
    const oe = oth_pct < 0 ? -rev[k] * oth_pct : 0.0;
    const rb = prev.rcf;
    let ii = 0.0, ri = 0.0; // 첫 반복은 이자수익, 리볼버 이자 0
    let it_n, ie, ebt, pre, nol_use, nol_add, base, corp, parts, local, stat, marg, tm, tax, ni, nci_ni, nip, div, bbk, cfo, cfi, cff_x, pre_rcf, rd, net, cash, re_, cavg;
    let conv_ok = false, diff;
    for (let n_ = 1; n_ < 101; n_++) {
      it_n = n_; // 파이썬 it_n: 다 돌면 100, 멈추면 멈춘 회차
      ie = nonrcf_int + ri;
      ebt = ebit[k] + oi - oe + ii - ie + eqm_v;
      // 법인세 스케줄
      pre = ebt + tadj[k];
      nol_use = Math.min(nol_p, Math.max(0.0, pre) * nol_cap);
      nol_add = Math.max(0.0, -pre);
      base = Math.max(0.0, pre - nol_use);
      [corp, parts] = v3eBracketTax(base, T.brackets);
      local = corp * T.local;
      stat = corp + local - tcr[k];
      marg = sw.tax_marginal === 'bracket' ? v3eBracketRate(base, T.brackets) * (1 + T.local) : v3eLast(T.brackets)[1] * (1 + T.local);
      tm = sw.tax_mode;
      tax = { eff_avg: Math.max(0.0, ebt) * te[k], statutory: Math.max(0.0, stat), marginal: Math.max(0.0, ebt) * marg, manual: Math.max(0.0, ebt) * te[k] }[tm];
      ni = ebt - tax;
      nci_ni = ni * ncs[k];
      nip = ni - nci_ni;
      div = { payout: Math.max(0.0, nip * po[k]), dps: v3eNz(v3eGet(D, 'dps')) * c.shares / 1e8, none: 0.0 }[sw.div_mode];
      bbk = sw.buyback_mode === 'ni_ratio' ? Math.max(0.0, nip * bb[k]) : bb[k];
      cfo = ni + dep[k] + amort[k] + sbc[k] + accr - dnwc[k];
      cfi = -capex_p[k] - capex_i[k] + fin_assets + cfi_oth;
      cff_x = flow - div - bbk + eqi[k];
      pre_rcf = cash_p + cfo + cfi + cff_x - min_cash;
      rd = sw.revolver === 'on' ? -Math.min(rb, pre_rcf) : 0.0;
      net = cfo + cfi + cff_x + rd;
      cash = cash_p + net;
      re_ = rb + rd;
      cavg = circ ? ((cash_p + stf_p) + (cash + stf)) / 2 : cash_p + stf_p;
      const ii2 = cavg * crate[k];
      const ri2 = (circ ? (rb + re_) / 2 : rb) * rates.rcf[k];
      diff = Math.abs(ii2 - ii) + Math.abs(ri2 - ri);
      ii = ii2; ri = ri2;
      if (diff < 1e-9) {
        // 수렴한 이자로 한 번 더 계산해 표의 값이 서로 맞게 함
        ie = nonrcf_int + ri;
        ebt = ebit[k] + oi - oe + ii - ie + eqm_v;
        pre = ebt + tadj[k];
        nol_use = Math.min(nol_p, Math.max(0.0, pre) * nol_cap);
        nol_add = Math.max(0.0, -pre);
        base = Math.max(0.0, pre - nol_use);
        [corp, parts] = v3eBracketTax(base, T.brackets);
        local = corp * T.local;
        stat = corp + local - tcr[k];
        tax = { eff_avg: Math.max(0.0, ebt) * te[k], statutory: Math.max(0.0, stat), marginal: Math.max(0.0, ebt) * marg, manual: Math.max(0.0, ebt) * te[k] }[tm];
        ni = ebt - tax;
        nci_ni = ni * ncs[k];
        nip = ni - nci_ni;
        div = { payout: Math.max(0.0, nip * po[k]), dps: v3eNz(v3eGet(D, 'dps')) * c.shares / 1e8, none: 0.0 }[sw.div_mode];
        bbk = sw.buyback_mode === 'ni_ratio' ? Math.max(0.0, nip * bb[k]) : bb[k];
        cfo = ni + dep[k] + amort[k] + sbc[k] + accr - dnwc[k];
        cff_x = flow - div - bbk + eqi[k];
        pre_rcf = cash_p + cfo + cfi + cff_x - min_cash;
        rd = sw.revolver === 'on' ? -Math.min(rb, pre_rcf) : 0.0;
        net = cfo + cfi + cff_x + rd;
        cash = cash_p + net;
        re_ = rb + rd;
        cavg = circ ? ((cash_p + stf_p) + (cash + stf)) / 2 : cash_p + stf_p;
        conv_ok = true;
        break;
      }
    }
    if (!conv_ok) v3eChk(c, 'circ_converge', 'warn', v3ePyStr(c.years_f[k]) + '년 이자 순환이 100회 안에 수렴하지 않음(마지막 차이 ' + v3eFmtE(diff, 2) + ')', diff);
    for (const [nm, v] of [['bop', rb], ['draw', rd], ['repay', 0.0], ['new', 0.0], ['conv', 0.0], ['eop', re_], ['avg', circ ? (rb + re_) / 2 : rb], ['int', ri],
      ['ibase', circ ? (rb + re_) / 2 : rb]]) tr.rcf[nm].push(v);
    prev.rcf = re_;
    const cancel = v3eT(sw.buyback_cancel);
    const re_e = re_p + nip - div - (cancel ? bbk : 0.0);
    const csa = csa_p + eqi[k] + conv_k;
    const oeq = oeq_p + sbc[k];                      // 자사주 매입은 자기주식 행으로(소각이면 이익잉여금)
    const tre = tre_p - (cancel ? 0.0 : bbk);
    const nci = nci_p + nci_ni;
    const se = v3eDiv(v3eBracketTax(Math.max(ebit[k], 0.0), T.brackets)[0] * (1 + T.local), Math.max(ebit[k], 0.0));
    for (const [nm, v] of [['int_inc', ii], ['int_exp', ie], ['ebt', ebt], ['tax', tax], ['ni', ni], ['ni_parent', nip], ['nci_ni', nci_ni], ['div', div],
      ['buyback', bbk], ['cfo', cfo], ['cfi', cfi], ['cff', cff_x + rd], ['net', net], ['cash', cash], ['st_fin', stf], ['re', re_e],
      ['cs_apic', csa], ['other_eq', oeq], ['nci', nci], ['pre_rcf', pre_rcf], ['cash_avg', cavg], ['oth_inc', oi], ['oth_exp', oe],
      ['eqm', eqm_v], ['accr', accr], ['iters', it_n], ['t_base', base], ['t_nol_bop', nol_p], ['t_nol_use', nol_use], ['t_nol_add', nol_add],
      ['t_nol_eop', nol_p - nol_use + nol_add], ['t_corp', corp], ['t_local', local], ['t_stat', stat],
      ['t_b1', parts[0]], ['t_b2', parts[1]], ['t_b3', parts[2]], ['t_b4', parts[3]], ['t_marg', marg], ['t_stat_ebit', se],
      ['fin_assets', fin_assets], ['cfi_oth', cfi_oth], ['treasury', tre]]) out[nm].push(v);
    nol_p = nol_p - nol_use + nol_add;
    cash_p = cash; stf_p = stf; re_p = re_e; csa_p = csa; oeq_p = oeq; nci_p = nci; tre_p = tre;
  }
  c.fin = out; c.tr = tr;
  const P = (rid, hist, fc, cols) => v3ePut(c, rid, hist, fc, cols);
  for (const r of v3eTR) {
    P('DEBT.' + r + '.bop', [v3eGet(hp, v3eBS_TR[r])].concat(dh[r].slice(0, -1)), tr[r].bop);
    P('DEBT.' + r + '.draw', null, tr[r].draw);
    P('DEBT.' + r + '.repay', null, tr[r].repay);
    if (r === 'lease') P('DEBT.lease.new', null, tr[r].new);
    if (r === 'cb') {
      if (cb_rp.some((x) => v3eT(x))) P('DEBT.cb.repay_sched', null, cb_rp); // 상환 판정 전환사채의 만기 해 상환 예정액(엑셀이 상환 식에 쓰도록 따로 둠)
      P('DEBT.cb.conv', null, tr[r].conv);
      P('DEBT.cb.accr', null, out.accr);
    }
    P('DEBT.' + r + '.eop', dh[r], tr[r].eop);
    P('DEBT.' + r + '.avg', null, tr[r].avg);
    P('DEBT.' + r + '.rate', null, rates[r]);
    P('DEBT.' + r + '.int', null, tr[r].int);
    if (v3eGet(no_int, r) != null) P('DEBT.' + r + '.int_base', null, tr[r].ibase);
  }
  P('DEBT.rate', rate_h, rate);
  const ibd_f = [];
  for (let k = 0; k < N; k++) ibd_f.push(v3eSum(v3eTR.map((r) => tr[r].eop[k])));
  P('DEBT.ibd', ibd_h, ibd_f);
  P('DEBT.int_exp', ie_h, out.int_exp);
  P('DEBT.pre_rcf_cash', null, out.pre_rcf);
  P('DEBT.cash_avg', null, out.cash_avg);
  P('DEBT.cash_rate', crate_h, crate);
  P('DEBT.int_inc', ii_h, out.int_inc);
  P('DEBT.iters', null, out.iters);
  // 손익계산서
  const gp_h = [];
  for (let i = 0; i < H; i++) gp_h.push(R.rev[i] - R.cogs[i]);
  P('IS.rev', R.rev, rev);
  P('IS.cogs', R.cogs, v3eFc(c, 'OPX.cogs'));
  P('IS.gp', gp_h, v3eFc(c, 'OPX.gp'));
  P('IS.sga', R.sga, v3eFc(c, 'OPX.sga'));
  P('IS.ebit', R.ebit, ebit);
  P('IS.oth_inc', R.oth_inc, out.oth_inc);
  P('IS.oth_exp', R.oth_exp, out.oth_exp);
  P('IS.int_inc', ii_h, out.int_inc);
  P('IS.fin_inc_oth', R.fin_inc_oth, v3eFill(N, 0.0));
  P('IS.int_exp', ie_h, out.int_exp);
  P('IS.fin_exp_oth', R.fin_exp_oth, v3eFill(N, 0.0));
  P('IS.eqm', R.eqm, out.eqm);
  P('IS.ebt', R.ebt, out.ebt);
  P('IS.tax', R.tax, out.tax);
  P('IS.disc', R.disc, v3eFill(N, 0.0));
  P('IS.ni', R.ni, out.ni);
  P('IS.ni_parent', R.ni_parent, out.ni_parent);
  P('IS.ni_nci', R.ni_nci, out.nci_ni);
  const allrev = c.rows['REV.total'];
  for (const [rid, src] of [['IS.gpm', 'IS.gp'], ['IS.ebit_m', 'IS.ebit'], ['IS.ni_m', 'IS.ni']]) {
    const xs = [];
    for (let i = 0; i < H + N; i++) xs.push(v3eDiv(c.rows[src][i], allrev[i]));
    P(rid, xs, [], 'hist+fc');
  }
  const tax_r = [];
  for (let i = 0; i < H + N; i++) tax_r.push(v3eNz(c.rows['IS.ebt'][i]) > 0 ? v3eDiv(c.rows['IS.tax'][i], c.rows['IS.ebt'][i]) : null);
  P('IS.tax_r', tax_r, [], 'hist+fc');
  const chk = [];
  for (let i = 0; i < H; i++) {
    chk.push(R.ebit[i] + R.oth_inc[i] - R.oth_exp[i] + v3eNz(ii_h[i]) + R.fin_inc_oth[i] - v3eNz(ie_h[i]) - R.fin_exp_oth[i] + R.eqm[i]
      - R.tax[i] + R.disc[i] - R.ni[i]);
  }
  P('IS.check_ni', chk, v3eFill(N, null));
  // 법인세 스케줄
  P('TAX.ebt', null, out.ebt);
  P('TAX.adj', null, tadj);
  P('TAX.nol_bop', null, out.t_nol_bop);
  P('TAX.nol_use', null, out.t_nol_use);
  P('TAX.nol_add', null, out.t_nol_add);
  P('TAX.nol_eop', null, out.t_nol_eop);
  P('TAX.base', null, out.t_base);
  for (let j = 0; j < 4; j++) P('TAX.b' + String(j + 1), null, out['t_b' + String(j + 1)]);
  P('TAX.corp', null, out.t_corp);
  P('TAX.local', null, out.t_local);
  P('TAX.credit', null, tcr);
  P('TAX.stat', null, out.t_stat);
  P('TAX.total', null, out.tax);
  const tax_eff = [];
  for (let k = 0; k < N; k++) tax_eff.push(out.ebt[k] > 0 ? v3eDiv(out.tax[k], out.ebt[k]) : null);
  P('TAX.eff', null, tax_eff);
  P('TAX.stat_rate_ebit', null, out.t_stat_ebit);
  P('TAX.marginal', null, out.t_marg);
  // 자본
  P('EQ.ni_parent', null, out.ni_parent);
  const payout_h = [];
  for (let i = 0; i < H; i++) payout_h.push(v3eDiv(-v3eNz(v3eHist(c, 'CF.div')[i]), R.ni_parent[i]));
  P('EQ.payout', payout_h, po);
  P('EQ.div', null, out.div);
  P('EQ.buyback', null, out.buyback);
  P('EQ.re_bop', null, [v3eLast(bs.re)].concat(out.re.slice(0, -1)));
  P('EQ.re_eop', null, out.re);
  P('EQ.cs_apic', null, out.cs_apic);
  P('EQ.other', null, out.other_eq);
  P('EQ.treasury', null, out.treasury);
  P('EQ.nci_ni', null, out.nci_ni);
  P('EQ.nci_eop', null, out.nci);
  // 현금흐름표
  const dnwc_h = c.rows['NWC.dnwc'].slice(0, H);
  const cf = {};
  for (const k of ['cfo', 'cfi', 'cff', 'capex_ppe', 'capex_int', 'div', 'buyback', 'fx', 'dep', 'amort', 'sbc']) cf[k] = v3eHist(c, 'CF.' + k);
  const cfo_oth = [], cfi_oth_h = [], cff_oth = [];
  for (let i = 0; i < H; i++) cfo_oth.push((cf.cfo[i] == null || cf.dep[i] == null || dnwc_h[i] == null) ? null : cf.cfo[i] - (R.ni[i] + cf.dep[i] + v3eNz(cf.amort[i]) + v3eNz(cf.sbc[i]) - dnwc_h[i]));
  for (let i = 0; i < H; i++) cfi_oth_h.push(cf.cfi[i] == null ? null : cf.cfi[i] - v3eNz(cf.capex_ppe[i]) - v3eNz(cf.capex_int[i]));
  for (let i = 0; i < H; i++) cff_oth.push(cf.cff[i] == null ? null : cf.cff[i] - v3eNz(cf.div[i]) - v3eNz(cf.buyback[i]));
  P('CF.ni', R.ni, out.ni);
  P('CF.dep', cf.dep, dep);
  P('CF.amort', cf.amort, amort);
  P('CF.sbc', cf.sbc, sbc);
  P('CF.cb_accr', null, out.accr);
  P('CF.dnwc', dnwc_h.map((x) => (x == null ? null : -x)), dnwc.map((x) => -x));
  P('CF.cfo_oth', cfo_oth, v3eFill(N, 0.0));
  P('CF.cfo', cf.cfo, out.cfo);
  P('CF.capex_ppe', cf.capex_ppe, capex_p.map((x) => -x));
  P('CF.capex_int', cf.capex_int, capex_i.map((x) => -x));
  P('CF.fin_assets', null, out.fin_assets);
  P('CF.cfi_oth', cfi_oth_h, out.cfi_oth);
  P('CF.cfi', cf.cfi, out.cfi);
  for (const r of v3eTR) {
    const xs = [];
    for (let k = 0; k < N; k++) xs.push(tr[r].draw[k] - tr[r].repay[k]);
    P('CF.debt.' + r, null, xs);
  }
  P('CF.div', cf.div, out.div.map((x) => -x));
  P('CF.buyback', cf.buyback, out.buyback.map((x) => -x));
  P('CF.equity_iss', null, eqi);
  P('CF.cff_oth', cff_oth, v3eFill(N, 0.0));
  P('CF.cff', cf.cff, out.cff);
  P('CF.fx', cf.fx, v3eFill(N, 0.0));
  const net_h = [];
  for (let i = 0; i < H; i++) net_h.push((cf.cfo[i] == null || cf.cfi[i] == null || cf.cff[i] == null) ? null : cf.cfo[i] + cf.cfi[i] + cf.cff[i] + v3eNz(cf.fx[i]));
  P('CF.net', net_h, out.net);
}

// ── E14 balance ───────────────────────────────────────────────────────────
function step_balance(c) {
  const I = c.I, N = c.N, H = c.H;
  const hp = v3eOr(v3eGet(I, 'hist_prev'), {});
  const f = c.fin, tr = c.tr;
  const P = (rid, hist, fc, cols) => v3ePut(c, rid, hist, fc, cols);
  const h = (rid) => v3eHist(c, rid);
  const hold = (k) => v3eFill(N, v3eNz(v3eLast(h('BS.' + k))));
  const oadd = v3eFc(c, 'INT.other_add');
  const cashf = c.rows['CTL.a.int_other_cash'][0];
  const oncl = [];
  let prev = v3eNz(v3eLast(h('BS.oncl')));
  for (let k = 0; k < N; k++) {
    prev = prev + oadd[k] * (1 - cashf);
    oncl.push(prev);
  }
  const A = [['cash', f.cash], ['st_fin', f.st_fin], ['ar', v3eFc(c, 'NWC.ar')], ['inv', v3eFc(c, 'NWC.inv')],
    ['oca', v3eFc(c, 'NWC.oca')], ['ppe', v3eFc(c, 'PPE.eop')], ['intan', v3eFc(c, 'INT.eop')],
    ['gw', v3eFc(c, 'INT.gw')], ['assoc', hold('assoc')], ['lt_fin', hold('lt_fin')],
    ['inv_prop', hold('inv_prop')], ['dta', hold('dta')], ['onca', hold('onca')]];
  const L = [['ap', v3eFc(c, 'NWC.ap')], ['ocl', v3eFc(c, 'NWC.ocl')], ['debt_st', tr.st.eop], ['debt_lt', tr.lt.eop],
    ['bond', tr.bond.eop], ['cb', tr.cb.eop], ['lease', tr.lease.eop], ['rcf', tr.rcf.eop],
    ['dbo', hold('dbo')], ['prov', hold('prov')], ['dtl', hold('dtl')], ['oncl', oncl]];
  const E = [['cs_apic', f.cs_apic], ['re', f.re], ['other_eq', f.other_eq], ['treasury', f.treasury], ['nci', f.nci]];
  const tot = {};
  for (const [items, tid] of [[A, 'ta'], [L, 'tl'], [E, 'te']]) {
    const sh = v3eFill(H, 0.0), sf = v3eFill(N, 0.0);
    for (const [k_, fv] of items) {
      const hv = h('BS.' + k_).map((x) => v3eNz(x));
      P('BS.' + k_, hv, fv);
      for (let i = 0; i < H; i++) sh[i] += hv[i];
      for (let k = 0; k < N; k++) sf[k] += fv[k];
    }
    tot[tid] = P('BS.' + tid, sh, sf);
  }
  const bchk = [];
  for (let i = 0; i < H + N; i++) bchk.push(tot.ta[i] - tot.tl[i] - tot.te[i]);
  P('BS.check', bchk, [], 'hist+fc');
  const cash = c.rows['BS.cash'];
  const net = c.rows['CF.net'];
  const cchk = [net[0] == null || v3eGet(hp, 'BS.cash') == null ? null : cash[0] - hp['BS.cash'] - net[0]];
  for (let i = 1; i < H + N; i++) cchk.push(net[i] == null ? null : cash[i] - cash[i - 1] - net[i]);
  P('CF.check', cchk, [], 'hist+fc');
  let bad = [];
  for (let k = 0; k < N; k++) if (Math.abs(c.rows['BS.check'][H + k]) > 1e-6) bad.push(c.years_f[k]);
  if (bad.length) v3eChk(c, 'bs_balance', 'err', '대차 불일치: ' + bad.map((y) => String(y)).join(', '), v3eMaxOf(c.rows['BS.check'].slice(H).map((x) => Math.abs(x))));
  bad = [];
  for (let k = 0; k < N; k++) if (Math.abs(c.rows['CF.check'][H + k]) > 1e-6) bad.push(c.years_f[k]);
  if (bad.length) v3eChk(c, 'cash_roll', 'err', '현금 검증 불일치: ' + bad.map((y) => String(y)).join(', '));
  const rb = c.rows['EQ.re_bop'], re_ = c.rows['EQ.re_eop'];
  let re_bad = false;
  for (let k = 1; k < N; k++) if (Math.abs(rb[k] - re_[k - 1]) > 1e-6) { re_bad = true; break; }
  if (re_bad) v3eChk(c, 're_roll', 'err', '이익잉여금 이월 불일치');
  // 주당이익
  const sh0 = c.rows['SHR.basic'][0];
  const shI = I.shares;
  const pdiv = v3eNz(v3eGet(shI, 'pref_div'));      // 우선주 배당(억원, 해마다 같음). EPS 분자에서 뺌(설계서 2-17 SHR.eps 보강)
  const yr = v3eFill(N, sh0);                         // 연도별 주식수: 자사주 매입액 ÷ 가정 주가만큼 줄임(SHR.yr_shares, EPS 에만)
  const bb = v3eFc(c, 'EQ.buyback'), bpx = v3eNz(v3eGet(shI, 'buyback_price'), v3eNz(v3eGet(c.inp.target, 'close')));
  if (v3eT(bpx) && bb.some((x) => x > 0)) {
    let cum = sh0;
    for (let k = 0; k < N; k++) {
      cum -= bb[k] * 1e8 / bpx;
      yr[k] = (cum + (k === 0 ? sh0 : yr[k - 1])) / 2; // 기초와 기말 평균
    }
    P('SHR.yr_shares', null, yr);
  }
  if (v3eT(pdiv)) v3eOne(c, 'SHR.pref_div', pdiv);
  const eps_h = [], eps_f = [], eps_d = [];
  // 과거 열 분모(M3-106, 원형 301 Model!I223 = I213 ÷ AVERAGE(H219:I219)): shares.basic_hist(과거 연도별 기말 유통주식수, 분할 보정 뒤)가 있으면
  // 전년 말과 그해 말 평균(첫 해의 전년 말은 shares.basic_pre, 없으면 그해 말). 없거나 spot 이면 기준일 유통주식수 고정
  const bh = v3eGet(c.sw, 'eps_basis') !== 'spot' ? v3eGet(shI, 'basic_hist') : null;
  const sh_h = v3eFill(H, sh0);
  if (v3eT(bh)) {
    for (let i = 0; i < H; i++) {
      const p_ = i === 0 ? v3eGet(shI, 'basic_pre') : bh[i - 1];
      if (bh[i] != null) sh_h[i] = p_ == null ? bh[i] : (bh[i] + p_) / 2;
    }
  }
  for (let i = 0; i < H; i++) eps_h.push(v3eDiv((c.R.ni_parent[i] - pdiv) * 1e8, sh_h[i]));
  const ye = v3eGet(c.sw, 'eps_basis') === 'spot' ? v3eFill(N, sh0) : yr;   // EPS 분모: avg 기초와 기말 평균, spot 기준일 유통주식수
  if (v3eT(bh)) P('SHR.eps_shares', sh_h, ye);       // EPS 분모 주식수(전년 말과 그해 말 평균)
  for (let k = 0; k < N; k++) eps_f.push(v3eDiv((f.ni_parent[k] - pdiv) * 1e8, ye[k]));
  P('SHR.eps', eps_h, eps_f);
  const dil0 = c.rows['SHR.diluted'][0];
  for (let k = 0; k < N; k++) eps_d.push(v3eDiv((f.ni_parent[k] - pdiv) * 1e8, ye[k] === sh0 ? dil0 : dil0 - sh0 + ye[k]));
  P('SHR.eps_dil', null, eps_d);
  v3eDisplayRows(c);
}

// cagr: 연평균 성장률(엑셀 RATE(n,0,−a,b)). 시작이나 끝이 0 이하면 null
function v3eCagr(a, b, n) {
  if (a == null || b == null || a <= 0 || b <= 0 || n <= 0) return null;
  return (b / a) ** (1 / n) - 1;
}
const v3eCAGR_ROWS = ['REV.total', 'OPX.gp', 'OPX.sga', 'OPX.ebit', 'OPX.ebitda', 'IS.ni', 'IS.ni_parent'];

// _display_rows: 표시용 행(주당 가치에 영향 없음): 과거 성장률 표(REV.hist_g), 과거 5년과 명시 기간 CAGR(*.cagr_h, *.cagr_f)
function v3eDisplayRows(c) {
  const R = c.rows, H = c.H, N = c.N;
  for (const [key, rid] of [['rev', 'IS.rev'], ['ebit', 'IS.ebit'], ['ni', 'IS.ni_parent'], ['eps', 'SHR.eps']]) {
    const xs = R[rid].slice(Math.max(0, H - 5), H);
    const yy = [];
    for (let i = 1; i < xs.length; i++) if (xs[i] != null && xs[i - 1] != null && xs[i - 1] > 0) yy.push(v3eDiv(xs[i], xs[i - 1]));
    const ar = yy.length ? v3eSum(yy.map((y) => y - 1)) / yy.length : null;
    const geo = xs.length ? v3eCagr(xs[0], v3eLast(xs), xs.length - 1) : null;
    let reg = null;
    if (xs.length && xs.every((x) => x != null && x > 0) && xs.length >= 3) {
      const n_ = xs.length;
      const ly = xs.map((x) => Math.log(x));
      const mx = (n_ - 1) / 2, my = v3eSum(ly) / n_;
      const num = [], den = [];
      for (let i = 0; i < n_; i++) { num.push((i - mx) * (ly[i] - my)); den.push((i - mx) ** 2); }
      reg = Math.exp(v3eSum(num) / v3eSum(den)) - 1;
    }
    v3eOne(c, 'REV.hist_g.' + key + '.arith', ar);
    v3eOne(c, 'REV.hist_g.' + key + '.geo', geo);
    v3eOne(c, 'REV.hist_g.' + key + '.reg', reg);
  }
  // CAGR(원형 EBIT T, U열 RATE(5,0,−시작,끝)): 과거는 5년(과거 열이 모자라면 있는 만큼), 명시 기간은 직전 실적에서 마지막 해까지.
  // 대상은 CAGR_ROWS, 매출 줄(금액, 수량, 단가), 묶음(금액, 총수량, 혼합 단가), 단위원가(과거 열이 있는 OPX.ucost.<줄>)
  const rk = Object.keys(R);
  const rids = v3eCAGR_ROWS.concat(rk.filter((k) => k.startsWith('REV.l.') && k.endsWith('.val')),
    rk.filter((k) => k.startsWith('REV.l.') && (k.endsWith('.vol') || k.endsWith('.price'))),
    rk.filter((k) => k.startsWith('REV.g.') && (k.endsWith('.val') || k.endsWith('.vol') || k.endsWith('.mix_asp'))),
    rk.filter((k) => k.startsWith('OPX.ucost.') && !k.endsWith('.cagr_h') && !k.endsWith('.cagr_f')));
  const nh = Math.min(5, H - 1);
  for (const rid of rids) {
    const v = R[rid];
    if (!v3eT(v) || c.labels[rid].cols !== 'hist+fc') continue;
    v3eOne(c, rid + '.cagr_h', v3eCagr(v[H - 1 - nh], v[H - 1], nh));
    v3eOne(c, rid + '.cagr_f', v3eCagr(v[H - 1], v[H + N - 1], N));
  }
  for (const ln of c.I.revbuild.lines) { // 단위원가 가정만 있고 과거 단위원가 행이 없는 줄: 첫 추정 해에서 마지막 해까지
    const v = R['CTL.a.ucost.' + ln.id];
    if (v3eT(v) && !(('OPX.ucost.' + ln.id) in R)) v3eOne(c, 'OPX.ucost.' + ln.id + '.cagr_f', v3eCagr(v[0], v[N - 1], N - 1));
  }
  // DCF 과거 참고 3년: 과거 열의 FCFF. 세율은 손익 유효세율(세전이익 0 이하면 0)
  const hx = {};
  const HK = ['rev', 'ebit', 'tax_r', 'tax', 'nopat', 'da', 'capex', 'dnwc', 'reinv', 'fcff'];
  for (const k of HK) hx[k] = v3eFill(H);
  for (let i = Math.max(0, H - 3); i < H; i++) {
    const ebt = R['IS.ebt'][i], tx_ = R['IS.tax'][i], e_ = R['IS.ebit'][i];
    let tr_ = ebt != null && ebt > 0 && tx_ != null ? tx_ / ebt : 0.0;
    let t_ = Math.max(0.0, e_) * tr_;
    if (c.sw.fcff_tax === 'is_total') { t_ = v3eNz(tx_); tr_ = v3eNz(v3eDiv(tx_, e_)); } // 원형(201 DCF!N18 = Model!N26): 손익 법인세 그대로, 세율 = 세금 ÷ 영업이익
    const cx_ = v3eNz(R['PPE.capex'][i]) + v3eNz(R['INT.capex'][i]) + v3eNz(R['PPE.rou_add'][i]);
    const ri_ = cx_ - v3eNz(R['OPX.da'][i]) + v3eNz(R['NWC.dnwc'][i]);
    const vals = { rev: R['IS.rev'][i], ebit: e_, tax_r: tr_, tax: t_, nopat: e_ - t_, da: v3eNz(R['OPX.da'][i]), capex: cx_, dnwc: v3eNz(R['NWC.dnwc'][i]), reinv: ri_, fcff: e_ - t_ - ri_ };
    for (const k of HK) hx[k][i] = vals[k];
  }
  for (const k of HK) v3ePut(c, 'DCF.hist.' + k, hx[k], v3eFill(N));
  // 시나리오 표 옆 참고: 매출 줄 성장률 가정의 최근 3년 실적 최저, 최고
  for (const ln of c.I.revbuild.lines) {
    const lid = ln.id;
    for (const [v_, src] of [['g', null], ['g_price', 'price'], ['g_vol', 'vol']]) {
      if (!(('CTL.a.rev.' + lid + '.' + v_) in R)) continue;
      let ser;
      if (src == null) ser = R['REV.l.' + lid + '.g'].slice(0, H);
      else {
        const hv_ = v3eOr(v3eGet(R, 'REV.l.' + lid + '.' + src), v3eHist(c, 'REV.l.' + lid + '.' + src));
        ser = [null];
        for (let i = 1; i < H; i++) ser.push(hv_[i] == null || hv_[i - 1] == null ? null : v3eDiv(hv_[i] - hv_[i - 1], hv_[i - 1]));
      }
      const l3 = ser.slice(Math.max(0, H - 3), H).filter((x) => x != null);
      v3eOne(c, 'CTL.ref.rev.' + lid + '.' + v_ + '.min3', l3.length ? v3eMinOf(l3) : null);
      v3eOne(c, 'CTL.ref.rev.' + lid + '.' + v_ + '.max3', l3.length ? v3eMaxOf(l3) : null);
    }
  }
}

v3eReg('E12', 'shares', step_shares);
v3eReg('E13', 'finance', step_finance);
v3eReg('E14', 'balance', step_balance);

// ── E15 wacc ─────────────────────────────────────────────────────────────
// _synthetic: 이자보상배율로 합성 등급과 스프레드를 고름. [등급, 스프레드, 소형 여부] 를 돌려줌
function v3eSynthetic(c, cov, mcap) {
  const sp = c.I.market.spread;
  const small = mcap != null && v3eGet(sp, 'large_cap_krw') && mcap * 1e8 < sp.large_cap_krw;
  const rows = v3eT(small) ? sp.small : sp.large;
  if (cov == null) return [rows[0][1], rows[0][2], small];
  for (const [lo, rt, s] of rows) {
    if (lo == null || cov >= lo) return [rt, s, small];
  }
  return [rows[rows.length - 1][1], rows[rows.length - 1][2], small];
}

// _lease_adj: 운용리스 보정(설계서 2-8 ADJ.lease, sw.lease_adj. 일반기업회계기준 비상장사만): 약정 지급액 현재가치를 부채로,
// 영업이익에는 그해 리스료를 더하고 리스자산 감가상각(현재가치 ÷ 기간)을 뺌(03 노트, Damodaran)
function v3eLeaseAdj(c) {
  const L = v3eOr(v3eGet(c.I, 'lease_adj'), {});
  if (!v3eT(v3eGet(c.sw, 'lease_adj')) || !v3eT(v3eGet(L, 'commit'))) return;
  const r = v3eGet(L, 'rate') != null ? L.rate : c.rows['CTL.a.debt_rate'][0];
  const com = L.commit.slice();
  const by = Math.trunc(Number(v3eNz(v3eGet(L, 'beyond_years'), 0)));
  const pay = com.concat(by ? v3eFill(by, v3eNz(v3eGet(L, 'beyond')) / by) : []);
  const pv = v3eSum(pay.map((x, t) => x / (1 + r) ** (t + 1)));
  c.lease_pv = pv;
  c.lease_ebit_add = v3eNz(v3eGet(L, 'expense'), com[0]) - pv / pay.length;
  v3eOne(c, 'ADJ.lease.rate', r);
  v3eOne(c, 'ADJ.lease.ebit_add', c.lease_ebit_add);
}

// engine.py px_slope: input.beta.px(rows = [표시일, 대상 종가, 지수 종가], from = 창 시작일)에서 단순 수익률과 SLOPE. [기울기, 관측수]
function v3ePxSlope(px) {
  const rows = v3eOr(v3eGet(px, 'rows'), []), lo = v3eOr(v3eGet(px, 'from'), '');
  const ret = [{}, {}];
  for (const j of [0, 1]) {
    let prev = null;
    for (const r of rows) {
      const v = r[j + 1];
      if (v == null) continue;
      if (prev != null) ret[j][r[0]] = v / prev - 1;
      prev = v;
    }
  }
  const xy = [];
  for (const r of rows) if (r[0] in ret[0] && r[0] in ret[1] && r[0] > lo) xy.push([ret[1][r[0]], ret[0][r[0]]]);
  const n = xy.length;
  if (n < 3) return [null, n];
  const mx = v3eSum(xy.map((q) => q[0])) / n, my = v3eSum(xy.map((q) => q[1])) / n;
  const sxx = v3eSum(xy.map((q) => (q[0] - mx) * (q[0] - mx)));
  const sxy = v3eSum(xy.map((q) => (q[0] - mx) * (q[1] - my)));
  return [sxx ? sxy / sxx : null, n];
}

function step_wacc(c) {
  const I = c.I, sw = c.sw, ov = c.ov;
  v3eLeaseAdj(c);
  const B = I.beta, m = I.market;
  const t_m = c.t_m;
  const w = Number(sw.beta_adj_w);
  const win = sw.beta_window;
  const adjb = (x) => (x == null ? null : x * w + (1 - w));
  const adj_u = v3eGet(sw, 'beta_adj_on') === 'unlevered';   // 조정(2/3 + 1/3)을 관측 베타(기본)가 아니라 무차입 베타에 적용
  const tg = c.inp.target;
  const mb = v3eOr(v3eGet(sw, 'mcap_basis'), 'spot');  // 시가총액 기준: spot(기준일), avg1y, avg2y(일평균. 값이 없으면 기준일 값)
  let mcap_b = mb === 'spot' ? v3eGet(tg, 'mcap') : v3eGet(tg, 'mcap_' + mb);
  if (mb !== 'spot' && mcap_b == null) {
    mcap_b = v3eGet(tg, 'mcap');
    v3eChk(c, 'mcap_basis', 'warn', '시가총액 기준 ' + v3ePyStr(mb) + '의 값이 입력에 없어 기준일 시가총액을 씀');
  }
  const mcap = v3eOr(v3eGet(B, 'mcap_override'), mcap_b);
  const br = I.bridge;
  const ibd = v3eSum(Object.values(br.debt).map((v) => v3eNz(v))) + v3eNz(c.lease_pv);
  const de = v3eNz(v3eDiv(ibd, mcap));
  const kospi = v3eGet(sw, 'beta_index') === 'kospi'; // 베타 지수: listing(상장 시장 지수) 또는 kospi. KOSPI 회귀 값이 없으면 상장 시장 값
  const tgt_b = kospi && v3eT(v3eGet(B, 'target_kospi')) ? B.target_kospi : v3eGet(B, 'target');
  if (kospi && !v3eT(v3eGet(B, 'target_kospi'))) v3eChk(c, 'beta_index', 'warn', 'KOSPI 기준 회귀 베타가 입력에 없어 상장 시장 지수 베타를 씀');
  const raw_t = v3eGet(v3eOr(v3eGet(v3eOr(tgt_b, {}), win), {}), 'raw');
  const peers = [];
  const T_ = I.market.tax;
  const utax = v3eOr(v3eGet(sw, 'beta_u_tax'), 'input'); // 무차입 베타 세율: input(입력 세율, 없으면 대상 한계세율), own(입력 세율, 없으면 자기 세전이익 구간 세율), target
  for (const p of v3eOr(v3eGet(B, 'peers'), [])) {
    if (!v3eT(v3eGet(p, 'include', true))) continue;
    const praw = kospi && v3eGet(p, 'raw_kospi') != null ? p.raw_kospi : v3eGet(p, 'raw');
    const r = praw != null && typeof praw === 'object' && !Array.isArray(praw) ? v3eGet(v3eOr(praw, {}), win) : praw;
    if (r == null) continue;
    const tx = utax === 'target' ? t_m : v3eGet(p, 'tax') != null ? p.tax :
      (utax === 'own' && v3eGet(p, 'tax_base') != null ? v3eBracketRate(Math.max(p.tax_base, 0.0), T_.brackets) * (1 + T_.local) : t_m);
    let bu = adjb(r) / (1 + (1 - tx) * v3eNz(v3eGet(p, 'de')));
    if (adj_u) bu = adjb(r / (1 + (1 - tx) * v3eNz(v3eGet(p, 'de'))));   // valley_v2: 무차입 베타에 조정을 적용
    if (v3eT(v3eGet(sw, 'beta_cash_adj')) && v3eT(v3eGet(p, 'cash_ratio'))) bu = bu / (1 - p.cash_ratio);
    peers.push([p, bu]);
    if (utax !== 'input') { const pid_ = v3eOr(v3eGet(p, 'code'), v3eGet(p, 'name')); v3eOne(c, 'WACC.tax_u.' + (pid_ == null ? 'None' : pid_), tx); }
  }
  const us = peers.map((x) => x[1]);
  let bu_peer = !us.length ? null : { median: v3eMedian(us), mean: v3eSum(us) / us.length, high: v3eMaxOf(us), low: v3eMinOf(us) }[sw.beta_stat];
  // 사업부별 상향식 베타(설계서 2-17 WACC.beta_seg, Valley): 사업부가 둘 이상이면 사업부 무차입 베타를 매출(또는 영업이익) 비중으로 가중
  const segs = v3eOr(v3eGet(B, 'segments'), []);
  let seg_rows = [];
  if (segs.length > 1) {
    const wk = v3eGet(sw, 'beta_bu_weight') === 'ebit' ? 'ebit' : 'rev';
    const bys = [];
    for (const s of segs) {
      let bs_ = v3eGet(s, 'beta_u');
      if (bs_ == null && v3eT(v3eGet(s, 'peers'))) {
        const xs_ = peers.filter(([p]) => s.peers.includes(v3eOr(v3eGet(p, 'code'), v3eGet(p, 'name')))).map((x) => x[1]);
        bs_ = xs_.length ? v3eMedian(xs_) : null;
      }
      bys.push([s, bs_, v3eNz(v3eGet(s, wk))]);
    }
    const tot = v3eSum(bys.filter((x) => x[1] != null).map((x) => x[2]));
    if (tot > 0) {
      bu_peer = v3eSum(bys.filter((x) => x[1] != null).map((x) => x[1] * x[2])) / tot;
      seg_rows = bys;
    }
  }
  const de_t = { current: de, peer_median: v3eNz(v3eMedian(peers.map((x) => v3eNz(v3eGet(x[0], 'de')))), de), manual: v3eNz(v3eGet(B, 'de_manual'), de) }[sw.cap_struct];
  if (sw.cap_struct === 'manual' && v3eGet(B, 'de_manual') == null) v3eChk(c, 'manual_missing', 'warn', '목표 D/E 직접 입력값이 없어 지금 D/E를 씀');
  if (sw.stable_beta === 'manual' && v3eGet(B, 'stable_manual') == null) v3eChk(c, 'manual_missing', 'warn', '안정기 베타 직접 입력값이 없어 명시 기간 베타를 씀');
  let bu_t = raw_t == null ? null : adjb(raw_t) / (1 + (1 - t_m) * de);
  if (adj_u && raw_t != null) bu_t = adjb(raw_t / (1 + (1 - t_m) * de));
  const beta_reg = bu_t == null ? null : bu_t * (1 + (1 - t_m) * de_t);
  const beta_bu = bu_peer == null ? null : bu_peer * (1 + (1 - t_m) * de_t);
  let mode = sw.beta_mode;
  let used = mode;
  if ((mode === 'manual' || mode === 'accounting') && v3eGet(B, mode) == null) { // 직접 입력을 골랐는데 값이 없으면 자동 판정으로(하한도 그대로 걸림)
    v3eChk(c, 'manual_missing', 'warn', '베타 방식 ' + mode + '의 값이 입력에 없어 자동 판정(회귀 또는 바텀업)으로 계산');
    mode = 'auto';
  }
  if (mode === 'auto') {
    used = (v3eNz(v3eGet(B, 'listed_years')) >= 2 && !v3eT(v3eGet(B, 'capital_change')) && beta_reg != null) ? 'regression' : 'bottom_up';
  }
  let beta = { regression: beta_reg, bottom_up: beta_bu, manual: v3eGet(B, 'manual'), accounting: v3eGet(B, 'accounting') }[used];
  if (beta == null) beta = beta_bu != null ? beta_bu : beta_reg != null ? beta_reg : 1.0;
  const floor = v3eGet(sw, 'beta_floor');
  const floored = floor != null && used !== 'manual' && beta < Number(floor);
  if (floored) beta = Number(floor);
  const rf = c.rf, erp = c.erp;
  const prem = v3eNz(v3eGet(sw, 'prem_size')) + v3eNz(v3eGet(sw, 'prem_spec')) + v3eNz(v3eGet(sw, 'prem_country'));
  let ke = rf + beta * erp + prem;
  const W = v3eOr(v3eGet(I, 'wacc_in'), {});
  const cb = sw.cov_basis;
  const [num, den] = { ebit_ltm_int_fy0: [v3eGet(W, 'ebit_ltm'), v3eGet(W, 'int_fy0')], ltm_ltm: [v3eGet(W, 'ebit_ltm'), v3eGet(W, 'int_ltm')],
    fy0_fy0: [v3eLast(c.R.ebit), v3eGet(W, 'int_fy0')], ebitda: [v3eGet(W, 'ebitda_ltm'), v3eGet(W, 'int_fy0')] }[cb];
  const cov = v3eDiv(num, den);
  const [rating, spread, small] = v3eSynthetic(c, cov, mcap);
  const kmode = sw.kd;
  const debt_ex_lease = ibd - v3eNz(v3eGet(br.debt, 'lease'));
  const eff = c.rows['CTL.a.debt_rate'][0];
  let path = kmode;
  if (kmode === 'auto') {
    if (v3eGet(m, 'kd_market_yield') != null) path = 'market_yield';
    else if (v3eGet(m, 'kd_recent_issue') != null) path = 'recent_issue';   // 최근 발행 금리(03 노트 §1.4 순서: 회사채 수익률, 최근 발행 금리, 그 뒤 등급과 실효이자율)
    else if (v3eT(v3eGet(B, 'credit_rating')) && v3eGet(v3eGet(m.spread, 'kr_rating', {}), B.credit_rating) != null) path = 'rating';
    else if (v3eT(mcap) && debt_ex_lease >= 0.05 * mcap && v3eT(eff)) path = 'effective';
    else path = 'synthetic';
  }
  let kd_pre = { market_yield: v3eGet(m, 'kd_market_yield'), recent_issue: v3eGet(m, 'kd_recent_issue'), peer_avg: v3eGet(m, 'kd_peer_avg'),
    rating: v3eGet(v3eGet(m.spread, 'kr_rating', {}), v3eGet(B, 'credit_rating')) == null ? null : rf + m.spread.kr_rating[B.credit_rating],
    effective: eff, synthetic: spread == null ? null : rf + spread, extra_spread: spread == null ? null : rf + spread + v3eNz(v3eGet(m, 'kd_extra_spread')), manual: v3eGet(m, 'kd_manual') }[path];
  if (kd_pre == null) {
    if (spread == null) v3eChk(c, 'kd_missing', 'err', '합성 등급 스프레드가 비어 타인자본비용을 계산할 수 없음(0%로 계산)');
    else if (path !== 'synthetic') v3eChk(c, 'kd_missing', 'warn', '타인자본비용 경로 ' + v3ePyStr(path) + '의 값이 입력에 없어 합성 등급(무위험이자율 + 스프레드)으로 계산');
    kd_pre = rf + v3eNz(spread);
  }
  const kd = kd_pre * (1 - t_m);
  const km = v3eOr(v3eGet(sw, 'ke_model'), 'capm');    // 자기자본비용 모형: capm(기본), bond_rp(세전 타인자본비용 + 가산 sw.ke_bond_rp)
  const ke_capm = ke;
  if (km === 'bond_rp') ke = kd_pre + v3eNz(v3eGet(sw, 'ke_bond_rp'), 0.04);
  else if (km !== 'capm') v3eChk(c, 'ke_model', 'warn', '자기자본비용 모형 ' + v3ePyStr(km) + '은 계산식이 없어 CAPM으로 계산');
  const wd = de_t / (1 + de_t);
  let wacc = (1 - wd) * ke + wd * kd;
  const sb = sw.stable_beta;
  const beta_s = { clamp: Math.min(Math.max(beta, 0.8), 1.2), one: 1.0, same: beta, manual: v3eNz(v3eGet(B, 'stable_manual'), beta) }[sb];
  let ke_s = rf + beta_s * erp + prem;
  if (km === 'bond_rp') ke_s = ke;
  const de_s = sw.stable_cap === 'same' ? de_t : v3eNz(v3eMedian(peers.map((x) => v3eNz(v3eGet(x[0], 'de')))), de_t);
  const wd_s = de_s / (1 + de_s);
  let wacc_s = (1 - wd_s) * ke_s + wd_s * kd;
  const ovw = v3eGet(ov, 'o.wacc', v3eGet(sw, 'wacc_override'));
  if (ovw != null) wacc = wacc_s = Number(ovw);
  if (v3eGet(sw, 'wacc_s_override') != null) wacc_s = Number(sw.wacc_s_override);
  const sh = v3eNz(v3eGet(ov, 'o.wacc_shift'));
  wacc = wacc + sh; wacc_s = wacc_s + sh;
  c.W = { beta: beta, beta_used: used, floored: floored, ke: ke, ke_s: ke_s, kd_pre: kd_pre, kd: kd, wd: wd, wacc: wacc, wacc_s: wacc_s,
    beta_s: beta_s, cov: cov, rating: rating, spread: spread, kd_path: path, de: de, de_t: de_t, beta_reg: beta_reg, beta_bu: beta_bu,
    bu_t: bu_t, bu_peer: bu_peer, mcap: mcap, ibd: ibd, small: small, override: ovw != null, raw_t: raw_t, prem: prem };
  v3eOne(c, 'WACC.beta_raw', raw_t);
  v3eOne(c, 'WACC.beta_adj', adjb(raw_t));
  v3eOne(c, 'WACC.mcap', mcap);
  v3eOne(c, 'WACC.ibd', ibd);
  v3eOne(c, 'WACC.de', de);
  v3eOne(c, 'WACC.beta_u', bu_t);
  v3eOne(c, 'WACC.beta_u_peer', bu_peer);
  v3eOne(c, 'WACC.de_target', de_t);
  v3eOne(c, 'WACC.beta_bu', beta_bu);
  v3eOne(c, 'WACC.beta_reg', beta_reg);
  v3eOne(c, 'WACC.beta', beta);
  v3eOne(c, 'WACC.rf', rf);
  v3eOne(c, 'WACC.erp', erp);
  v3eOne(c, 'WACC.prem', prem);
  v3eOne(c, 'WACC.ke', ke);
  if (km === 'bond_rp') v3eOne(c, 'WACC.ke_capm', ke_capm);
  v3eOne(c, 'WACC.cov', cov);
  v3eOne(c, 'WACC.spread', spread);
  v3eOne(c, 'WACC.kd_pre', kd_pre);
  v3eOne(c, 'WACC.t_m', t_m);
  v3eOne(c, 'WACC.kd', kd);
  v3eOne(c, 'WACC.wd', wd);
  v3eOne(c, 'WACC.we', 1 - wd);
  v3eOne(c, 'WACC.wacc', wacc);
  v3eOne(c, 'WACC.beta_s', beta_s);
  v3eOne(c, 'WACC.ke_s', ke_s);
  v3eOne(c, 'WACC.de_s', de_s);
  v3eOne(c, 'WACC.wacc_s', wacc_s);
  for (const [p, bu] of peers) {
    const pid = v3eOr(v3eGet(p, 'code'), v3eGet(p, 'name'));
    v3eOne(c, 'WACC.beta_u.' + (pid == null ? 'None' : pid), bu);
  }
  for (const [s, b_] of seg_rows) v3eOne(c, 'WACC.beta_seg.' + v3ePyStr(s.id), b_);
  if (v3eT(c.lease_pv)) v3eOne(c, 'ADJ.lease.pv', c.lease_pv);
  const px = v3eOr(v3eGet(B, 'px'), {});
  if (v3eT(v3eGet(px, 'rows'))) {                      // 가격 표(설계서 WACC.px, WACC.ret): 수익률과 SLOPE 를 다시 계산해 원 베타와 맞춰 봄
    const [sl, n_] = v3ePxSlope(px);
    v3eOne(c, 'WACC.ret.n', n_);
    v3eOne(c, 'WACC.ret.slope', sl);
  }
}

// ── E16 fcff ─────────────────────────────────────────────────────────────
function step_fcff(c) {
  const I = c.I, N = c.N, H = c.H, sw = c.sw;
  const R = c.rows;
  const f = c.fin;
  const rev = v3eFc(c, 'IS.rev');
  let ebit = v3eFc(c, 'IS.ebit');
  if (v3eT(c.lease_ebit_add)) ebit = ebit.map((x) => x + c.lease_ebit_add);
  const mode = sw.fcff_tax;
  const tax_r = [], tax = [];
  for (let k = 0; k < N; k++) {
    let r;
    if (mode === 'marginal') r = f.t_marg[k];
    else if (mode === 'is_total') r = v3eDiv(f.tax[k], ebit[k]);
    else r = f.ebt[k] > 0 ? v3eDiv(f.tax[k], f.ebt[k]) : f.t_stat_ebit[k];
    r = v3eNz(r);
    tax_r.push(r);
    tax.push(mode === 'is_total' ? f.tax[k] : Math.max(0.0, ebit[k]) * r);
  }
  let nopat = []; for (let k = 0; k < N; k++) nopat.push(ebit[k] - tax[k]);
  const da = v3eFc(c, 'OPX.da');
  const capex = []; for (let k = 0; k < N; k++) capex.push(v3eFc(c, 'PPE.capex')[k] + v3eFc(c, 'INT.capex')[k] + v3eFc(c, 'PPE.rou_add')[k] + v3eFc(c, 'INT.other_add')[k]);
  const dn = R['NWC.dnwc'].slice(H);
  const ic_h = []; for (let i = 0; i < H; i++) ic_h.push(R['NWC.nwc'][i] + R['BS.ppe'][i] + R['BS.intan'][i] + R['BS.gw'][i]);
  let ic0 = ic_h[ic_h.length - 1];
  const rm = sw.reinv_mode;
  let reinv, ic;
  if (rm === 'sales_pct') {
    const capx_h = []; for (let i = 0; i < H; i++) capx_h.push(v3eHist(c, 'CF.capex_ppe')[i] == null ? null : -v3eHist(c, 'CF.capex_ppe')[i] - v3eNz(v3eHist(c, 'CF.capex_int')[i]));
    const rr_h = []; for (let i = 0; i < H; i++) rr_h.push(capx_h[i] == null || R['OPX.da'][i] == null || R['NWC.dnwc'][i] == null ? null : capx_h[i] - R['OPX.da'][i] + R['NWC.dnwc'][i]);
    let rp = v3eSeta(c, 'reinv_pct', v3eNz(v3eAvg(c, rr_h, c.R.rev, null, 'reinv_pct')), '최근 평균');
    if (v3eGet(sw, 'reinv_end') === 'g_over_roc') {      // valley_v2: 끝값 = g ÷ 안정기 ROC × 마지막 해 세후 영업이익률, 첫해 값에서 직선
      const ws_ = c.W.wacc_s;
      const roc_ = sw.roc_s === 'wacc' ? ws_ : v3eNz(v3eGet(sw, 'roc_s_manual'), ws_);
      const end_ = c.g_s / roc_ * v3eNz(v3eDiv(nopat[nopat.length - 1], rev[rev.length - 1]));
      rp = c.rows['CTL.a.reinv_pct'];
      const rp_new = []; for (let k = 0; k < N; k++) rp_new.push(v3eLerp(v3eNz(rp[0]), end_, k, N));
      rp.length = rp_new.length; for (let k = 0; k < rp_new.length; k++) rp[k] = rp_new[k];   // rp[:] = … (행을 제자리에서 바꿈)
    }
    reinv = []; for (let k = 0; k < N; k++) reinv.push(rev[k] * v3eNz(rp[k]));
    ic = []; let p = ic0;
    for (let k = 0; k < N; k++) {
      p += reinv[k];
      ic.push(p);
    }
  } else if (rm === 'ic_turnover') {
    const to = v3eSeta(c, 'ic_turnover', v3eNz(v3eDiv(v3eLast(c.R.rev), ic0)), '직전 결산');
    ic = []; for (let k = 0; k < N; k++) ic.push(rev[k] / to[k]);
    reinv = []; for (let k = 0; k < N; k++) reinv.push(ic[k] - (k ? ic[k - 1] : ic0));
  } else if (rm === 's2c') { // 증분 재투자(매출 증가 ÷ 매출 대비 투하자본 비율, 적자 유형 sales-to-capital)
    const to = v3eSeta(c, 'ic_turnover', v3eNz(v3eDiv(v3eLast(c.R.rev), ic0)), '직전 결산 매출 ÷ 투하자본');
    reinv = []; ic = []; let p = ic0;
    for (let k = 0; k < N; k++) {
      const ri_ = v3eDiv(rev[k] - (k ? rev[k - 1] : v3eLast(c.R.rev)), to[k]);
      reinv.push(v3eNz(ri_));
      p += v3eNz(ri_);
      ic.push(p);
    }
  } else {
    reinv = []; for (let k = 0; k < N; k++) reinv.push(capex[k] - da[k] + dn[k]);
    ic = []; for (let k = 0; k < N; k++) ic.push(R['NWC.nwc'][H + k] + R['BS.ppe'][H + k] + R['BS.intan'][H + k] + R['BS.gw'][H + k]);
  }
  const nco = v3eSeta(c, 'noncash_oth', 0.0);
  const fcff = []; for (let k = 0; k < N; k++) fcff.push(nopat[k] - reinv[k] + nco[k]);
  if (v3eT(v3eGet(sw, 'rnd_cap_adj'))) {
    // R&D 자본화 보정(설계서 2-8 ADJ.rnd_asset): 연구자산 = Σ 과거 R&D × 남은 비율(정액, n년), 상각 = Σ 과거 n년 R&D ÷ n.
    // 세후영업이익에 (R&D − 상각)을 더하고 같은 금액을 재투자에 더해 FCFF 는 그대로. ROIC 와 전환 기간 재투자만 바뀜
    const nl = Math.trunc(Number(v3eNz(v3eGet(v3eOr(v3eGet(I, 'rnd'), {}), 'cap_life'), 5)));
    const rd_all = v3eHist(c, 'RND.total').map((x) => v3eNz(x)).concat(v3eFc(c, 'RND.total'));
    const asset = [], amort = [];
    for (let t_ = H; t_ < H + N; t_++) {
      const xa = [], xs = [];
      for (let j = 1; j < nl + 1; j++) if (t_ - j >= 0) xa.push(rd_all[t_ - j]);
      amort.push(v3eSum(xa) / nl);
      for (let j = 0; j < nl; j++) if (t_ - j >= 0) xs.push(rd_all[t_ - j] * (nl - j) / nl);
      asset.push(v3eSum(xs));
    }
    const x0 = [];
    for (let j = 0; j < nl; j++) if (H - 1 - j >= 0) x0.push(rd_all[H - 1 - j] * (nl - j) / nl);
    const a0 = v3eSum(x0);
    const d_ = []; for (let k = 0; k < N; k++) d_.push(rd_all[H + k] - amort[k]);
    nopat = nopat.map((x, k) => x + d_[k]);
    reinv = reinv.map((x, k) => x + d_[k]);
    ic = ic.map((x, k) => x + asset[k]);
    ic0 = ic0 + a0;
    v3ePut(c, 'ADJ.rnd_asset', null, asset);
    v3ePut(c, 'ADJ.rnd_amort', null, amort);
    v3ePut(c, 'ADJ.ebit_rnd', null, ebit.map((x, k) => x + d_[k]));
  }
  const roic = []; for (let k = 0; k < N; k++) roic.push(v3eDiv(nopat[k], k ? ic[k - 1] : ic0));
  c.X = { rev: rev, ebit: ebit, tax_r: tax_r, tax: tax, nopat: nopat, da: da, capex: capex, dnwc: dn, reinv: reinv, ic: ic, ic0: ic0,
    fcff: fcff, nco: nco, roic: roic };
}

// ── E17 fade, E18 value ──────────────────────────────────────────────────
function step_fade(c) {
  const N = c.N, M = c.M, sw = c.sw, ov = c.ov;
  const X = c.X, W = c.W, T = c.I.market.tax;
  const g_s = c.g_s;
  const wacc = W.wacc, wacc_s = W.wacc_s;
  const roc_s = sw.roc_s === 'wacc' ? wacc_s : v3eNz(v3eGet(sw, 'roc_s_manual'), wacc_s);
  const frac = (j) => j / (M + 1);                     // 전환 j번째 해의 직선 보간 위치(TY가 끝점)
  const rev = X.rev.slice(), g = v3eFill(N), ebit = X.ebit.slice(), margin = [];
  for (let k = 0; k < N; k++) margin.push(v3eDiv(X.ebit[k], X.rev[k]));
  for (let k = 0; k < N; k++) g[k] = c.rows['REV.growth'][c.H + k];
  const g_last = g[g.length - 1] + v3eNz(v3eGet(ov, 'o.fade_g_add'));
  const g_sh = v3eNz(v3eGet(ov, 'o.fade_g_shift'));    // 전환 기간 성장률 전체에 가산(민감도 표 2. 원형 DCF!F30 을 데이터 표가 덮는 것과 같음)
  let fg = sw.fade_growth; const g_man = v3eGet(sw, 'fade_g_manual');
  if (fg === 'manual' && g_man == null) {              // 직접 입력을 골랐는데 값이 없으면 직선
    fg = 'linear';
    if (M) v3eChk(c, 'manual_missing', 'warn', '전환 기간 성장률 직접 입력값(fade_g_manual)이 없어 직선 보간으로 계산');
  }
  const m_last = margin[margin.length - 1];
  let m_fade;
  if (sw.fade_margin === 'avg2' && N >= 2) m_fade = (margin[margin.length - 1] + margin[margin.length - 2]) / 2;
  else m_fade = m_last;
  let m_target = v3eGet(v3eOr(v3eGet(v3eOr(v3eGet(c.I, 'assump'), {}), c.S), {}), 'fade_margin_target'); // 시나리오별 목표 이익률(적자 유형)이 먼저
  if (typeof m_target !== 'number') m_target = v3eGet(sw, 'fade_margin_target');
  if (sw.fade_margin === 'to_target' && m_target == null) v3eChk(c, 'manual_missing', 'warn', '목표 이익률(fade_margin_target)이 없어 전환 기간 이익률을 마지막 해 그대로 둠');
  if (sw.roc_s === 'manual' && v3eGet(sw, 'roc_s_manual') == null) v3eChk(c, 'manual_missing', 'warn', '안정기 ROC 직접 입력값이 없어 안정기 WACC 를 씀');
  const tax_r = X.tax_r.slice(), tax = X.tax.slice(), nopat = X.nopat.slice(), reinv = X.reinv.slice(), fcff = X.fcff.slice(), ic = X.ic.slice(), roic = X.roic.slice();
  let wacc_t = v3eFill(N, wacc);
  if (sw.fade_wacc === 'from_start') {
    wacc_t = []; for (let k = 0; k < N; k++) wacc_t.push(wacc + (wacc_s - wacc) * (k + 1) / (N + M + 1));
  }
  const roic_last = v3eNz(roic[roic.length - 1], roc_s);
  const rr_last = v3eDiv(reinv[reinv.length - 1], rev[rev.length - 1]);
  let da_l = v3eLast(X.da), capex_l = v3eLast(X.capex), dn_l = v3eLast(X.dnwc);
  // 종료연도 세율은 종료연도 영업이익으로 정해지므로 먼저 매출 경로를 만든다
  let rv = rev[rev.length - 1]; const gs = [];
  for (let j = 1; j <= M; j++) {
    const gj = (fg === 'manual' ? Number(g_man) : fg === 'avg_const' ? (g_last + g_s) / 2 : g_last + (g_s - g_last) * frac(j)) + g_sh;
    gs.push(gj);
    rv = rv * (1 + gj);
  }
  const rev_ty = rv * (1 + g_s);
  let m_end;
  if (sw.fade_margin === 'to_target' && m_target != null) m_end = m_target; // 종료연도가 목표에 닿음(전환 j번째 해는 j ÷ (m + 1) 만큼 다가감)
  else m_end = M ? m_fade : m_last;
  const m_ty = v3eGet(ov, 'o.ty_margin', v3eGet(sw, 'ty_margin') != null ? v3eGet(sw, 'ty_margin') : m_end);
  const ebit_ty = rev_ty * m_ty;
  const tt = sw.ty_tax;
  let t_ty;
  if (tt === 'statutory') t_ty = v3eNz(v3eDiv(v3eBracketTax(Math.max(ebit_ty, 0.0), T.brackets)[0] * (1 + T.local), Math.max(ebit_ty, 0.0)));
  else if (tt === 'marginal') t_ty = c.t_m;
  else t_ty = tax_r[tax_r.length - 1];
  const t_last = tax_r[tax_r.length - 1];
  const cr_fade = v3eOr(v3eGet(v3eOr(v3eGet(c.I, 'tax'), {}), 'credit_fade'), []).slice();
  if (cr_fade.length && v3eT(M)) {
    const tcv = v3eFill(N, 0.0);
    for (let j = 0; j < M; j++) tcv.push(v3eNz(j < cr_fade.length ? cr_fade[j] : 0.0));
    tcv.push(0.0);
    v3ePut(c, 'DCF.tax_credit', null, tcv, 'dcf');
  }
  rv = rev[rev.length - 1];
  for (let j = 1; j <= M; j++) {
    const gj = gs[j - 1];
    rv = rv * (1 + gj);
    const mj = sw.fade_margin === 'to_target' && m_target != null ? m_last + (m_target - m_last) * frac(j) : m_fade;
    const eb = rv * mj;
    const tr_ = t_last + (t_ty - t_last) * frac(j);
    let tx = Math.max(0.0, eb) * tr_;
    if (cr_fade.length) tx = Math.max(0.0, tx - v3eNz(j - 1 < cr_fade.length ? cr_fade[j - 1] : 0.0)); // 세액감면이 전환 기간까지 이어지면 세금에서 뺌(설계서 2-17, SK오션플랜트 2033년까지)
    const npt = eb - tx;
    const fr = sw.fade_reinv;
    let ri;
    if (fr === 'grow') {
      da_l = da_l * (1 + gj); capex_l = capex_l * (1 + gj); dn_l = dn_l * (1 + gj);
      ri = capex_l - da_l + dn_l;
    } else if (fr === 'sales_pct') {
      const rr_ty = v3eDiv(g_s / roc_s * (ebit_ty * (1 - t_ty)), rev_ty);
      ri = rv * (v3eNz(rr_last) + (v3eNz(rr_ty) - v3eNz(rr_last)) * frac(j));
    } else {
      const rocj = roic_last + (roc_s - roic_last) * frac(j);
      ri = rocj ? npt * gj / rocj : 0.0;
    }
    const icj = ic[ic.length - 1] + ri;
    g.push(gj); rev.push(rv); margin.push(mj); ebit.push(eb); tax_r.push(tr_); tax.push(tx); nopat.push(npt);
    reinv.push(ri); fcff.push(npt - ri); roic.push(v3eDiv(npt, ic[ic.length - 1])); ic.push(icj);
    wacc_t.push(wacc + (wacc_s - wacc) * (sw.fade_wacc === 'linear' ? frac(j) : sw.fade_wacc === 'from_start' ? (N + j) / (N + M + 1) : 0.0));
  }
  const tax_ty = Math.max(0.0, ebit_ty) * t_ty;
  const nopat_ty = ebit_ty - tax_ty;
  let reinv_ty = roc_s ? nopat_ty * g_s / roc_s : 0.0;
  if (v3eGet(sw, 'ty_reinv') === 'grow') reinv_ty = reinv[reinv.length - 1] * (1 + g_s);   // The Modellers 원형: 종료연도 재투자 = 마지막 해 재투자 × (1 + g)
  const fcff_ty = nopat_ty - reinv_ty;
  c.F = { rev: rev.concat([rev_ty]), g: g.concat([g_s]), ebit: ebit.concat([ebit_ty]), margin: margin.concat([m_ty]), tax_r: tax_r.concat([t_ty]), tax: tax.concat([tax_ty]),
    nopat: nopat.concat([nopat_ty]), reinv: reinv.concat([reinv_ty]), fcff: fcff.concat([fcff_ty]), ic: ic.concat([null]), roic: roic.concat([roc_s]),
    wacc_t: wacc_t.concat([wacc_s]), roc_s: roc_s, da_last: da_l };
}

// nonop_value: 비영업자산 합. sw.assoc_value = market 이면 시가(market)가 있는 항목은 시가로(상장 관계기업)
function v3eNonopValue(I, sw) {
  const mk = v3eGet(sw, 'assoc_value') === 'market';
  return v3eSum(v3eOr(v3eGet(I.bridge, 'nonop'), []).map((x) => (mk && v3eGet(x, 'market') != null ? v3eNz(x.market) : v3eNz(v3eGet(x, 'amount')))));
}

function step_value(c) {
  const N = c.N, M = c.M, sw = c.sw, I = c.I;
  const F = c.F, W = c.W, X = c.X;
  const L = N + M;
  const t = c.t, t_ty = c.t_ty;
  const stub = c.stub;
  const fa = F.fcff.slice(0, L);
  if (sw.stub === 'ytd_actual' && v3eGet(I.ytd, 'DCF.fcff') != null) fa[0] = fa[0] - I.ytd['DCF.fcff'];
  else fa[0] = fa[0] * stub;
  const df = [], pv = []; let prev_df = 1.0, prev_t = 0.0;
  for (let k = 0; k < L; k++) {
    const d = prev_df * Math.pow(1 + F.wacc_t[k], -(t[k] - prev_t));
    df.push(d);
    pv.push(fa[k] * d);
    prev_df = d; prev_t = t[k];
  }
  const wacc_s = W.wacc_s, g_s = c.g_s;
  const df_ty = prev_df * Math.pow(1 + wacc_s, -(t_ty - prev_t));
  let ok = true;
  const tvm = sw.tv;
  const ebitda_last = F.ebit[L - 1] + (!M ? v3eLast(X.da) : F.rev[L - 1] * v3eDiv(v3eLast(X.da), v3eLast(X.rev)));
  let tv;
  if (tvm === 'exit_mult') {
    const mult = v3eNz(v3eGet(v3eOr(v3eGet(I, 'rel'), {}), 'exit_mult'), v3eNz(v3eGet(sw, 'exit_mult')));
    const base = { ev_ebitda: ebitda_last, ev_ebit: F.ebit[L - 1], ev_sales: F.rev[L - 1] }[sw.exit_metric];
    tv = base * mult;
  } else if (tvm === 'finite') {
    tv = 0.0;
  } else {
    ok = wacc_s > g_s;
    tv = ok ? F.fcff[L] / (wacc_s - g_s) : null;
  }
  let tv_parts = null;
  if (tvm === 'avg' && ok) {                           // 영구성장과 Exit Multiple 평균(03 노트 §1.4)
    const mult = v3eNz(v3eGet(v3eOr(v3eGet(I, 'rel'), {}), 'exit_mult'), v3eNz(v3eGet(sw, 'exit_mult')));
    if (v3eT(mult)) {
      tv_parts = [tv, { ev_ebitda: ebitda_last, ev_ebit: F.ebit[L - 1], ev_sales: F.rev[L - 1] }[sw.exit_metric] * mult];
      tv = (tv_parts[0] + tv_parts[1]) / 2;
    } else v3eChk(c, 'tv_avg', 'warn', 'Exit Multiple 배수가 입력에 없어 종료가치를 영구성장 값만으로 계산');
  }
  const pv_tv = ok ? tv * df_ty : null;
  const ev = ok ? v3eSum(pv) + pv_tv : null;
  const br = I.bridge;
  const cash = v3eNz(v3eGet(br, 'cash')) + v3eNz(v3eGet(br, 'st_fin'));
  const nonop = v3eNonopValue(I, sw);
  const debt = v3eSum(Object.values(br.debt).map((v) => v3eNz(v))) - v3eNz(c.cb_as_equity) + v3eNz(c.lease_pv);
  const nci = v3eNz(v3eGet(br, 'nci')) * (sw.nci_value === 'book_x_pbr' ? v3eNz(v3eGet(sw, 'nci_pbr'), 1.0) : 1.0);
  const pref = sw.pref === 'market' ? v3eNz(v3eGet(br, 'pref_mkt')) : 0.0;
  const dbo = v3eT(sw.dbo_claim) ? v3eNz(v3eGet(br, 'dbo')) : 0.0;
  const claims = v3eSum(v3eOr(v3eGet(br, 'claims'), []).map((x) => v3eNz(v3eGet(x, 'amount'))));
  const eq = ok ? ev + cash + nonop - debt - nci - pref - dbo - claims : null;
  let shares = c.shares;
  let ps_raw = ok ? eq * 1e8 / shares : null;
  if (ok && v3eT(v3eGet(sw, 'dilution_iter'))) { // 희석 판정 주가를 모델 주당 가치로 바꿔 다시 판정(20회, 주식수 차이 0.5주 안이면 멈춤)
    for (let it_ = 0; it_ < 20; it_++) {
      const d_ = v3eDilution(c, ps_raw);
      const sh2 = v3eSharesOf(c, d_);
      ps_raw = eq * 1e8 / sh2;
      if (Math.abs(sh2 - shares) < 0.5) { shares = sh2; break; }
      shares = sh2;
    }
    c.shares = shares;
    v3eOne(c, 'SHR.diluted_iter', shares);
  }
  const ps = ok ? v3eRound(ps_raw, sw.round) : null;
  const close = v3eGet(c.inp.target, 'close');
  const P = (rid, vals) => v3ePut(c, rid, null, vals, 'dcf');
  P('DCF.rev', F.rev);
  P('DCF.g', F.g);
  P('DCF.ebit', F.ebit);
  P('DCF.margin', F.margin);
  P('DCF.tax_r', F.tax_r);
  P('DCF.tax', F.tax);
  P('DCF.nopat', F.nopat);
  P('DCF.da', X.da.concat(v3eFill(M + 1)));
  P('DCF.capex', X.capex.concat(v3eFill(M + 1)));
  P('DCF.dnwc', X.dnwc.concat(v3eFill(M + 1)));
  P('DCF.reinv', F.reinv);
  const rr = []; for (let k = 0; k < L + 1; k++) rr.push(v3eDiv(F.reinv[k], F.nopat[k]));
  P('DCF.rr', rr);
  P('DCF.ic', F.ic);
  P('DCF.roic', F.roic);
  const eva = []; for (let k = 0; k < L + 1; k++) eva.push(F.roic[k] == null ? null : F.roic[k] - F.wacc_t[k]);
  P('DCF.eva_spread', eva);
  P('DCF.noncash_oth', X.nco.concat(v3eFill(M + 1, 0.0)));
  P('DCF.fcff', F.fcff);
  P('DCF.fcff_adj', fa.concat([null]));
  P('DCF.wacc_t', F.wacc_t);
  P('DCF.t', t.concat([t_ty]));
  P('DCF.df', df.concat([df_ty]));
  P('DCF.pv', pv.concat([null]));
  v3eOne(c, 'DCF.tv', tv);
  if (tv_parts) { v3eOne(c, 'DCF.tv_gordon', tv_parts[0]); v3eOne(c, 'DCF.tv_exit', tv_parts[1]); }
  v3eOne(c, 'DCF.pv_tv', pv_tv);
  v3eOne(c, 'DCF.pv_sum', v3eSum(pv));
  v3eOne(c, 'DCF.ev', ev);
  v3eOne(c, 'DCF.tv_share', ok ? v3eDiv(pv_tv, ev) : null);
  v3eOne(c, 'DCF.cash', cash);
  v3eOne(c, 'DCF.nonop', nonop);
  v3eOne(c, 'DCF.debt', debt);
  v3eOne(c, 'DCF.nci', nci);
  v3eOne(c, 'DCF.pref', pref);
  v3eOne(c, 'DCF.dbo', dbo);
  v3eOne(c, 'DCF.other_claim', claims);
  v3eOne(c, 'DCF.eq', eq);
  v3eOne(c, 'DCF.eq_sel', eq);
  v3eOne(c, 'DCF.shares', shares);
  v3eOne(c, 'DCF.ps_raw', ps_raw);
  v3eOne(c, 'DCF.ps', ps);
  v3eOne(c, 'DCF.up', !ok || !v3eT(close) ? null : ps / close - 1);
  // 종료가치가 뜻하는 배수, 성장의 가치 분해
  v3eOne(c, 'DCF.tv_implied', ok ? v3eDiv(tv, ebitda_last) : null);
  const nop1 = F.nopat[0];
  v3eOne(c, 'DCF.value_split.existing', v3eDiv(nop1, W.wacc));
  c.out = { ps: ps, ps_raw: ps_raw, up: !ok || !v3eT(close) ? null : ps / close - 1, ev: ev, eq: eq, wacc: W.wacc, wacc_s: wacc_s,
    ke: W.ke, beta: W.beta, g_s: g_s, tv: tv, pv_tv: pv_tv, tv_share: ok ? v3eDiv(pv_tv, ev) : null, fcff: F.fcff,
    ok: ok, df: df, df_ty: df_ty };
}

// ── E19 alt_models ───────────────────────────────────────────────────────
// FCFE, DDM, RIM, APV. 주주가치를 바로 내는 모형은 Ke로 할인
function step_alt_models(c) {
  const N = c.N, M = c.M, H = c.H, sw = c.sw, I = c.I;
  const f = c.fin, W = c.W, F = c.F, X = c.X, o = c.out;
  const L = N + M;
  const t = c.t, stub = c.stub, el = c.elapsed;
  const g_s = c.g_s;
  let ke = W.ke, ke_s = W.ke_s;
  if (v3eT(v3eGet(c.ov, 'o.ke_shift'))) { ke = ke + c.ov['o.ke_shift']; ke_s = ke_s + c.ov['o.ke_shift']; } // DDM, RIM 민감도용: 주주 모형의 Ke 만 같은 폭으로 움직임
  const shares = c.shares;
  const br = I.bridge;
  const cash = v3eNz(v3eGet(br, 'cash')) + v3eNz(v3eGet(br, 'st_fin'));
  const nonop = v3eNonopValue(I, sw);
  const am = v3eOr(v3eGet(sw, 'alt_models'), 'all'); // 계산할 다른 모형(all 또는 목록). 목표주가 모형(dcf_model)은 늘 계산
  const on = (nm) => am === 'all' || am.includes(nm) || sw.dcf_model === nm;
  const frac = (j) => j / (M + 1);
  const ke_t = v3eFill(N, ke); for (let j = 1; j <= M; j++) ke_t.push(ke + (ke_s - ke) * frac(j));
  const dfe = []; let p_df = 1.0, p_t = 0.0;
  for (let k = 0; k < L; k++) {
    const d = p_df * Math.pow(1 + ke_t[k], -(t[k] - p_t));
    dfe.push(d);
    p_df = d; p_t = t[k];
  }
  const dfe_ty = p_df * Math.pow(1 + ke_s, -(c.t_ty - p_t));
  const ok = ke_s > g_s;
  const roe_s = ke_s;
  const tr = c.tr;
  const gF = F.g;
  // FCFE: 지배주주 순이익에서 세후 이자수익을 빼고(현금은 다리에서 더함) 재투자와 순차입을 반영
  const nip = f.ni_parent;
  const core = []; for (let k = 0; k < N; k++) core.push(nip[k] - f.int_inc[k] * (1 - X.tax_r[k]));
  let netb = []; for (let k = 0; k < N; k++) netb.push(v3eSum(v3eTR.map((r) => tr[r].draw[k] - tr[r].repay[k])));
  const capx_cash = []; for (let k = 0; k < N; k++) capx_cash.push(v3eFc(c, 'PPE.capex')[k] + v3eFc(c, 'INT.capex')[k] - f.cfi_oth[k]);
  const fd = v3eOr(v3eGet(sw, 'fcfe_debt'), 'schedule'); // 순차입: schedule(차입 스케줄), target_ratio(재투자 × 목표 부채 비중), current_ed(재투자 × 지금 부채 비중)
  if (fd === 'target_ratio' || fd === 'current_ed') {
    const delta = fd === 'target_ratio' ? W.wd : v3eNz(v3eDiv(W.de, 1 + W.de));
    netb = []; for (let k = 0; k < N; k++) netb.push((capx_cash[k] - X.da[k] + X.dnwc[k]) * delta);
    v3eOne(c, 'DCF.fcfe.delta', delta);
  }
  const fcfe = []; for (let k = 0; k < N; k++) fcfe.push(core[k] + X.da[k] - capx_cash[k] - X.dnwc[k] + netb[k]);
  const ni_path = core.slice();
  const bv_h = c.rows['BS.te'][H - 1] - c.rows['BS.nci'][H - 1];
  const bv = []; for (let k = 0; k < N; k++) bv.push(c.rows['BS.te'][H + k] - c.rows['BS.nci'][H + k]);
  const roe_last = v3eNz(v3eDiv(nip[nip.length - 1], N > 1 ? bv[bv.length - 2] : bv_h), roe_s);
  for (let j = 1; j <= M; j++) {
    const nj = ni_path[ni_path.length - 1] * (1 + gF[N + j - 1]);
    const roe_j = roe_last + (roe_s - roe_last) * frac(j);
    ni_path.push(nj);
    fcfe.push(nj * (1 - (roe_j ? gF[N + j - 1] / roe_j : 0.0)));
  }
  const ni_ty = ni_path[ni_path.length - 1] * (1 + g_s);
  const fcfe_ty = ni_ty * (1 - g_s / roe_s);
  let fa = [fcfe[0] * stub].concat(fcfe.slice(1));
  const pvs = []; for (let k = 0; k < L; k++) pvs.push(fa[k] * dfe[k]);
  const pv = v3eSum(pvs);
  const tv = ok ? fcfe_ty / (ke_s - g_s) : null;
  const eq_fcfe = ok ? pv + tv * dfe_ty + cash + nonop : null;
  const P = (rid, vals) => v3ePut(c, rid, null, vals, 'dcf');
  P('DCF.fcfe.cf', fcfe.concat([fcfe_ty]));
  P('DCF.fcfe.ke_t', ke_t.concat([ke_s]));
  P('DCF.fcfe.df', dfe.concat([dfe_ty]));
  v3eOne(c, 'DCF.fcfe.eq', eq_fcfe);
  v3eOne(c, 'DCF.fcfe.ps', ok ? v3eRound(v3eDiv(eq_fcfe, shares / 1e8), sw.round) : null);
  // DDM 2단계: 명시와 전환 기간 배당 현가 + 종료
  let div = f.div.slice();
  if (sw.ddm_payout === 'div_buyback') {
    div = []; for (let k = 0; k < N; k++) div.push(f.div[k] + f.buyback[k]);
  }
  const po_last = v3eNz(v3eDiv(div[div.length - 1], nip[nip.length - 1]));
  const po_s = 1 - g_s / roe_s;
  const nd = nip.slice();
  for (let j = 1; j <= M; j++) {
    const nj = nd[nd.length - 1] * (1 + gF[N + j - 1]);
    nd.push(nj);
    div.push(nj * (po_last + (po_s - po_last) * frac(j)));
  }
  const div_ty = nd[nd.length - 1] * (1 + g_s) * po_s;
  const da_ = [div[0] * stub].concat(div.slice(1));
  let eq_ddm = null;
  if (ok) {
    const xs = []; for (let k = 0; k < L; k++) xs.push(da_[k] * dfe[k]);
    eq_ddm = v3eSum(xs) + div_ty / (ke_s - g_s) * dfe_ty;
  }
  const stg = v3eOr(v3eGet(sw, 'ddm_stage'), 'two'); // two(명시 + 전환 + 종료), gordon(1단계), three(전환 기간이 0이면 5년 전환을 따로 둠), h(H 모형)
  if (ok && stg === 'gordon') eq_ddm = div[0] / (ke_s - g_s);
  else if (ok && stg === 'h') {
    const d0 = -v3eNz(v3eLast(v3eHist(c, 'CF.div')));
    const g_hi = v3eNz(v3eDiv(nip[0], v3eLast(c.R.ni_parent)), 1.0) - 1;
    const hh = (N + M) / 2;
    eq_ddm = d0 * (1 + g_s) / (ke_s - g_s) + d0 * hh * (g_hi - g_s) / (ke_s - g_s);
    v3eOne(c, 'DCF.ddm.h_g', g_hi);
  } else if (ok && stg === 'three' && M === 0) {
    const T5 = 5;
    const g_l = gF[N - 1];
    let n_ = nip[nip.length - 1], pv3 = 0.0, p_df3 = dfe[N - 1];
    for (let j = 1; j <= T5; j++) {
      const gj = g_l + (g_s - g_l) * j / (T5 + 1);
      n_ = n_ * (1 + gj);
      const kj = ke + (ke_s - ke) * j / (T5 + 1);
      p_df3 = p_df3 / (1 + kj);
      pv3 += n_ * (po_last + (po_s - po_last) * j / (T5 + 1)) * p_df3;
    }
    const d_ty3 = n_ * (1 + g_s) * po_s;
    const xs3 = []; for (let k = 0; k < N; k++) xs3.push(da_[k] * dfe[k]);
    eq_ddm = v3eSum(xs3) + pv3 + d_ty3 / (ke_s - g_s) * p_df3;
  }
  if ((stg !== 'two' || sw.dcf_model === 'ddm') && po_last < 0.05) {
    v3eChk(c, 'ddm_low_div', 'warn', '배당성향이 ' + v3eFmt2(po_last * 100, '.1f') + '%로 거의 없어 배당할인모형(' + v3ePyStr(stg) + ') 값이 매우 작음. 자사주 매입이 많으면 div_buyback, 아니면 FCFF 를 볼 것');
  }
  P('DCF.ddm.div', div.concat([div_ty]));
  v3eOne(c, 'DCF.ddm.eq', eq_ddm);
  v3eOne(c, 'DCF.ddm.ps', ok ? v3eRound(v3eDiv(eq_ddm, shares / 1e8), sw.round) : null);
  // RIM: 직전 결산 장부가 + 초과이익 현가(직전 결산 시점 가치를 기준일까지 Ke로 굴림)
  const ri = []; let b_prev = bv_h;
  for (let k = 0; k < N; k++) {
    ri.push(nip[k] - ke * b_prev);
    b_prev = bv[k];
  }
  const pri = []; for (let k = 0; k < N; k++) pri.push(ri[k] / Math.pow(1 + ke, k + 1));
  const pv_ri = v3eSum(pri);
  const omega = v3eNz(v3eGet(sw, 'rim_omega'), 0.7);
  const rt = sw.rim_tv;
  let ri_tv = ri[ri.length - 1];
  if (v3eGet(c.ov, 'o.rim_roe') != null) ri_tv = (c.ov['o.rim_roe'] - ke) * bv[bv.length - 1]; // RIM 민감도용: 종료가치의 초과이익을 장기 ROE 로 (ROE − Ke) × 마지막 장부가
  let tv_ri;
  if (rt === 'gordon') tv_ri = ke > g_s ? ri_tv * (1 + g_s) / (ke - g_s) : null;
  else if (rt === 'pbr') tv_ri = (v3eNz(v3eGet(sw, 'rim_pbr'), 1.0) - 1) * bv[bv.length - 1];
  else tv_ri = ri_tv * omega / (1 + ke - omega);
  const eq_rim = tv_ri == null ? null : (bv_h + pv_ri + tv_ri / Math.pow(1 + ke, N)) * Math.pow(1 + ke, el);
  v3ePut(c, 'DCF.rim.bv', null, bv, 'fc');
  v3ePut(c, 'DCF.rim.ri', null, ri, 'fc');
  v3eOne(c, 'DCF.rim.eq', eq_rim);
  v3eOne(c, 'DCF.rim.ps', eq_rim != null ? v3eRound(v3eDiv(eq_rim, shares / 1e8), sw.round) : null);
  // APV: 무차입 가치(Ku 할인) + 이자 절세 현가
  const t_m = c.t_m;
  const bu = W.beta / (1 + (1 - t_m) * W.de_t);
  const ku = c.rf + bu * c.erp + W.prem;
  const bu_s = W.beta_s / (1 + (1 - t_m) * W.de_t);
  const ku_s = c.rf + bu_s * c.erp + W.prem;
  fa = c.rows['DCF.fcff_adj'].slice(0, L);
  const pu = []; for (let k = 0; k < L; k++) pu.push(fa[k] / Math.pow(1 + ku, t[k]));
  const pvu = v3eSum(pu);
  const oku = ku_s > g_s;
  const tvu = oku ? F.fcff[L] / (ku_s - g_s) / Math.pow(1 + ku, c.t_ty) : null;
  const kd_pre = W.kd_pre;
  const ts = []; for (let k = 0; k < N; k++) ts.push(f.int_exp[k] * t_m);
  const pts = []; for (let k = 0; k < N; k++) pts.push(ts[k] * (k === 0 ? stub : 1.0) / Math.pow(1 + kd_pre, t[k]));
  const pv_ts = v3eSum(pts);
  const tv_ts = kd_pre > g_s ? ts[ts.length - 1] * (1 + g_s) / (kd_pre - g_s) / Math.pow(1 + kd_pre, t[N - 1]) : 0.0;
  const apv = oku ? pvu + tvu + pv_ts + tv_ts : null;
  const debt = c.rows['DCF.debt'][0];
  const eq_apv = oku ? apv + cash + nonop - debt - c.rows['DCF.nci'][0] - c.rows['DCF.pref'][0] - c.rows['DCF.dbo'][0] - c.rows['DCF.other_claim'][0] : null;
  v3eOne(c, 'DCF.apv.ku', ku);
  v3eOne(c, 'DCF.apv.pv_u', !oku ? null : pvu + tvu);
  v3eOne(c, 'DCF.apv.pv_ts', pv_ts + tv_ts);
  v3eOne(c, 'DCF.apv.eq', eq_apv);
  v3eOne(c, 'DCF.apv.ps', oku ? v3eRound(v3eDiv(eq_apv, shares / 1e8), sw.round) : null);
  v3eOne(c, 'DCF.rim.roe_last', v3eDiv(nip[nip.length - 1], N > 1 ? bv[bv.length - 2] : bv_h));
  for (const nm of ['fcfe', 'ddm', 'rim', 'apv']) { // sw.alt_models 에 없는 모형은 값을 비움(계산 순서는 같음)
    if (!on(nm)) { c.rows['DCF.' + nm + '.eq'][0] = null; c.rows['DCF.' + nm + '.ps'][0] = null; }
  }
  c.alt = { fcfe: c.rows['DCF.fcfe.ps'][0], ddm: c.rows['DCF.ddm.ps'][0], rim: c.rows['DCF.rim.ps'][0], apv: c.rows['DCF.apv.ps'][0] };
  const model = sw.dcf_model;
  if (model !== 'fcff') {                              // 목표주가에 쓸 모형을 바꾼 경우
    const ps = c.alt[model];
    const raw = { fcfe: eq_fcfe, ddm: eq_ddm, rim: eq_rim, apv: eq_apv }[model];
    const close = v3eGet(c.inp.target, 'close');
    Object.assign(o, { ps: ps, ps_raw: v3eDiv(raw, shares / 1e8), eq: raw, up: ps == null || !v3eT(close) ? null : ps / close - 1 });
    c.rows['DCF.ps'][0] = o.ps; c.rows['DCF.ps_raw'][0] = o.ps_raw; c.rows['DCF.up'][0] = o.up;
    c.rows['DCF.eq_sel'][0] = raw;
  }
}

v3eReg('E15', 'wacc', step_wacc);
v3eReg('E16', 'fcff', step_fcff);
v3eReg('E17', 'fade', step_fade);
v3eReg('E18', 'value', step_value);
v3eReg('E19', 'alt_models', step_alt_models);

// ── E20～E24: 시나리오, 민감도, 리버스, 결합, 점검 (engine.py weighted ～ run_all, run.py compute()를 줄 단위로 옮김) ──
// 파이썬 run_all 몸통을 계산 순서대로 다섯 단계(step_scenarios, step_sensitivity, step_reverse, step_blend, step_checks)로 나눔.
// 「다른 가정」 표(alt_one, alt_table)와 몬테카를로, 유형별, LBO는 파이썬만 계산하고 사례의 py 값을 그대로 넘김(00_core v3eRunAll)

// 파이썬 서식 f"{x:.2e}"(지수는 부호와 두 자리 이상: 1.23e-05)
function v3eFmtE(x, d) {
  if (x == null || !Number.isFinite(x)) return v3ePyStr(x);
  const p = x.toExponential(d).split('e'), e = Number(p[1]);
  return p[0] + 'e' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
}
// 파이썬 서식 f"{x:.1f}", f"{x:,.0f}", f"{x:+,.0f}". 딱 가운데 값(2.5, 0.125)은 파이썬처럼 짝수 쪽으로(toFixed는 큰 쪽)
function v3eFmt2(x, spec) {
  const m = /^(\+?)(,?)\.(\d+)f$/.exec(spec), d = Number(m[3]), a = Math.abs(x);
  let s = a.toFixed(d);
  const t = a.toFixed(d + 25), head = t.slice(0, t.length - 24);      // head: 소수 d + 1자리까지, 그 뒤 24자리가 모두 0이면 정확한 값
  if (head.charAt(head.length - 1) === '5' && /^0+$/.test(t.slice(-24))) {
    const lo = head.slice(0, d ? -1 : -2);
    if ((lo.charCodeAt(lo.length - 1) - 48) % 2 === 0) s = lo;
  }
  if (m[2]) { const p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
  return (x < 0 || Object.is(x, -0) ? '-' : m[1] ? '+' : '') + s;
}
// 파이썬 str(x): None, True, False, 정수, 소수(1e-05, 1e+16 표기). JSON에서 온 1.0은 정수와 구분할 수 없어 정수로 적음
function v3ePyStr(x) {
  if (x == null) return 'None';
  if (x === true) return 'True';
  if (x === false) return 'False';
  if (typeof x !== 'number') return String(x);
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return String(x);
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf';
  const p = x.toExponential().split('e'), e = Number(p[1]);
  if (e >= -4 && e < 16) return String(x);
  return p[0] + 'e' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
}
// pct = lambda x, d=1: "확인 불가" if x is None else f"{x * 100:.{d}f}%"
const v3ePct = (x, d = 1) => (x == null ? '확인 불가' : v3eFmt2(x * 100, '.' + d + 'f') + '%');

// 등록된 한 시나리오 단계 가운데 from～to만 실행
function v3eRunSteps(c, from, to) {
  for (const s of V3E.steps) if (!s.all && s.id >= from && s.id <= to) s.fn(c);
  return c;
}
// Base 한 번 계산(run(inp, "Base")와 같은 결과). 민감도가 E15～E19만 다시 돌릴 수 있게 E14 직후 문맥을 따로 떠 둠.
// gs_read: E04～E14가 영구성장률(c.g_s)을 읽었는지(매출 줄 성장률 끝값이 비어 영구성장률로 채우는 경우). 읽었으면 o.g 덮기는 통째로 다시 계산
function v3eBaseRun(inp) {
  const c = v3eRun(inp, 'Base', null, 'E03');
  let g = c.g_s, read = false;
  Object.defineProperty(c, 'g_s', { get() { read = true; return g; }, set(v) { read = true; g = v; }, enumerable: true, configurable: true });
  v3eRunSteps(c, 'E04', 'E14');
  const gs_read = read;
  Object.defineProperty(c, 'g_s', { value: g, writable: true, enumerable: true, configurable: true });
  const snap = { c: v3eCopyCtx(c), gs_read: gs_read };
  v3eRunSteps(c, 'E15', 'E19');
  return { c: c, snap: snap };
}
// 문맥 사본: rows의 배열은 사본, labels, notes, checks, out도 따로. 그 밖 문맥 값은 얕은 복사(E15～E19는 앞 단계 값을 읽기만 함)
function v3eCopyCtx(c) {
  const c2 = Object.assign({}, c), rows = {};
  for (const k in c.rows) rows[k] = c.rows[k].slice();
  c2.rows = rows;
  c2.labels = Object.assign({}, c.labels);
  c2.notes = Object.assign({}, c.notes, { why: Object.assign({}, c.notes.why) });
  c2.checks = c.checks.slice();
  c2.out = Object.assign({}, c.out);
  return c2;
}
// E15 이후에서만 읽는 덮기 키. 이 키만 바뀌면 E14 직후 문맥에서 E15～E19만 다시 돌려도 run(inp, "Base", ov)와 같은 값
const v3eLATE_KEYS = { 'o.wacc_shift': true, 'o.wacc': true, 'o.fade_g_add': true, 'o.fade_g_shift': true, 'o.ty_margin': true, 'o.ke_shift': true, 'o.rim_roe': true };
// value_only(inp, ov, "Base", "ps"). snap이 있고 덮기가 늦은 키뿐이면 E15～E19만 다시 계산. rid 를 주면 그 행의 첫 값(run(inp, "Base", ov)["rows"][rid][0])
function v3eSensPs(inp, snap, ov, rid) {
  const pick = (c) => (rid ? c.rows[rid][0] : v3eGet(c.out, 'ps'));
  let late = snap != null;
  if (late) {
    for (const k in ov) {
      if (v3eLATE_KEYS[k] === true || (k === 'o.g' && !snap.gs_read)) continue;
      late = false;
      break;
    }
  }
  if (!late) return pick(v3eRun(inp, 'Base', ov));
  const c = v3eCopyCtx(snap.c);
  c.ov = Object.assign({}, snap.c.ov, ov);
  if ('o.g' in ov) {                                  // E03이 하는 대로: g = ov.get("o.g", g), c["g_s"] = g, DCF.g_s 행
    c.g_s = ov['o.g'];
    c.rows['DCF.g_s'] = [ov['o.g']];
  }
  v3eRunSteps(c, 'E15', 'E19');
  return pick(c);
}

function v3eWeighted(inp, scen) {
  const w = inp.switches.weights;
  const tot = v3eSum(V3E.SCEN.map((S) => v3eNz(v3eGet(w, S))));
  if (Math.abs(tot - 1) > 1e-6 || V3E.SCEN.some((S) => v3eT(v3eGet(w, S)) && scen[S].ps_raw == null)) {
    return { ok: false, sum: tot, ps_raw: null, ps: null, up: null };
  }
  const raw = v3eSum(V3E.SCEN.map((S) => v3eNz(v3eGet(w, S)) * scen[S].ps_raw));
  const ps = v3eRound(raw, inp.switches.round);
  const close = v3eGet(inp.target, 'close');
  return { ok: true, sum: tot, ps_raw: raw, ps: ps, up: v3eT(close) ? ps / close - 1 : null };
}

// 토네이도 변수: [이름, 폭, 덮기 만드는 함수]
// 파이썬 run_all에는 처음 덮기가 없음. JS는 화면 덮기(base.ov)에 o.wacc_shift, o.growth_add가 있으면 그 값에 폭을 더함(없으면 파이썬과 같은 값)
function v3eSensVars(base) {
  const g0 = base.g_s, m0 = v3eLast(base.F.margin);
  const A = (k) => base.rows['CTL.a.' + k];
  const beta = base.W.beta;
  const sh0 = v3eNz(v3eGet(base.ov, 'o.wacc_shift')), ga0 = v3eNz(v3eGet(base.ov, 'o.growth_add'));
  return [['WACC', 0.01, (d) => ({ 'o.wacc_shift': sh0 + d })], ['영구성장률', 0.005, (d) => ({ 'o.g': g0 + d })],
    ['매출 성장률(전 기간)', 0.02, (d) => ({ 'o.growth_add': ga0 + d })], ['종료연도 영업이익률', 0.02, (d) => ({ 'o.ty_margin': m0 + d })],
    ['유효세율', 0.03, (d) => ({ 'a.tax_eff.Base': { by_year: A('tax_eff').map((x) => x + d) } })],
    ['베타', 0.1, (d) => ({ 'sw.beta_mode': 'manual', 'sw.beta_floor': null, 'i.beta.manual': beta + d })],
    ['주식위험프리미엄', 0.005, (d) => ({ 'm.erp': base.erp + d })],
    ['매출채권 회전일수', 10.0, (d) => ({ 'a.dso.Base': { by_year: A('dso').map((x) => x + d) } })],
    ['유지 CAPEX 비율', 0.01, (d) => ({ 'a.capex_maint_pct.Base': { by_year: A('capex_maint_pct').map((x) => x + d) } })],
    ['안정기 ROC', 0.02, (d) => ({ 'sw.roc_s': 'manual', 'sw.roc_s_manual': base.F.roc_s + d })]].concat(v3eUcostVars(base));
}
// 단위원가 끝값 토네이도: 끝값을 ±5% 옮기고 첫해에서 끝해로 갈수록 그만큼 커지게(첫해 0). 이름은 사례 labels(없으면 행 ID)
function v3eUcostVars(base) {
  const out = [];
  for (const k_ of Object.keys(base.rows).filter((k) => k.startsWith('CTL.a.ucost.'))) {
    const arr = base.rows[k_], lid = k_.slice('CTL.a.ucost.'.length);
    if (!arr || !arr.length || v3eLast(arr) == null || arr.some((x) => x == null)) continue;
    const n_ = arr.length, lb = (base.inp && base.inp.labels && base.inp.labels[k_]) || null;
    out.push([(lb && lb.name ? lb.name : k_) + ' 끝값', 0.05, (d) => ({ ['a.ucost.' + lid + '.Base']: { by_year: arr.map((x, j) => x + v3eLast(arr) * d * (n_ > 1 ? j / (n_ - 1) : 1.0)) } })]);
  }
  return out;
}

// E21. Base 에서 변수만 움직여 다시 계산(그 밖 입력은 지금 값). steps = {wacc, g, margin, growth} 간격(없으면 sw.sens_step)
// snap = v3eBaseRun이 떠 둔 E14 직후 문맥(null이면 칸마다 통째로 다시 계산)
function v3eSensitivities(inp, base, snap, steps) {
  const st = steps != null ? Object.assign({}, inp.switches.sens_step, steps) : inp.switches.sens_step;
  const d5 = (s) => [-2 * s, -s, 0.0, s, 2 * s];
  const o = base.out;
  const g0 = base.g_s;
  const m0 = v3eLast(base.F.margin);
  const sh0 = v3eNz(v3eGet(base.ov, 'o.wacc_shift')), fs0 = v3eNz(v3eGet(base.ov, 'o.fade_g_shift')), ga0 = v3eNz(v3eGet(base.ov, 'o.growth_add'));
  const ps = (ov) => v3eSensPs(inp, snap, ov);
  const ws = d5(st.wacc);
  const wy = ws.map((d) => o.wacc + d);
  const t1 = { x: d5(st.g).map((d) => g0 + d), y: wy, z: ws.map((dw) => d5(st.g).map((dg) => ps({ 'o.wacc_shift': sh0 + dw, 'o.g': g0 + dg }))) };
  const t2 = { x: d5(st.margin).map((d) => m0 + d), y: wy, z: ws.map((dw) => d5(st.margin).map((dm) => ps({ 'o.wacc_shift': sh0 + dw, 'o.ty_margin': m0 + dm }))) };
  // 표 2: 전환 기간이 있으면 가로축은 전환 기간 성장률 가산(o.fade_g_shift, avg_const 면 원형 DCF!F30 덮기와 같음).
  // 전환 기간이 없으면(v3 기본) 가로로 값이 안 바뀌므로 명시 기간 매출 성장률 가산(o.growth_add). x_kind 로 구분.
  // 가운데 열(가산 폭 0)은 키를 빼 E15～E19만 다시 계산(화면 덮기의 o.growth_add 는 기준에 이미 들어 있어 값이 같음)
  let t3;
  if (v3eT(base.M)) {
    t3 = { x: d5(st.growth), y: wy, z: ws.map((dw) => d5(st.growth).map((dg) => ps({ 'o.wacc_shift': sh0 + dw, 'o.fade_g_shift': fs0 + dg }))),
      x_kind: 'fade_g', x_name: '전환 기간 성장률 가산', x_base: base.F.g[base.N] };
  } else {
    t3 = { x: d5(st.growth), y: wy, z: ws.map((dw) => d5(st.growth).map((dg) => ps(dg === 0 ? { 'o.wacc_shift': sh0 + dw } : { 'o.wacc_shift': sh0 + dw, 'o.growth_add': ga0 + dg }))),
      x_kind: 'growth', x_name: '명시 기간 매출 성장률 가산', x_base: null };
  }
  const tor = v3eSensVars(base).map(([n, d, f]) => ({ var: n, lo: -d, hi: d, ps_lo: ps(f(-d)), ps_hi: ps(f(d)) }));
  // DDM, RIM 민감도(설계서 2-17 SENS 보강): Ke × 영구성장률, Ke × 장기 ROE. 값은 각 모형 주당 가치
  const alt_ps = (ov, rid) => v3eSensPs(inp, snap, ov, rid);
  const kk0 = v3eNz(v3eGet(base.ov, 'o.ke_shift'));
  const ke0 = base.W.ke + kk0, ks = d5(st.wacc);
  const roe0 = v3eNz(base.rows['DCF.rim.roe_last'][0], ke0);
  const t4 = { x: d5(st.g).map((d) => g0 + d), y: ks.map((d) => ke0 + d), z: ks.map((dk) => d5(st.g).map((dg) => alt_ps({ 'o.ke_shift': kk0 + dk, 'o.g': g0 + dg }, 'DCF.ddm.ps'))) };
  const t5 = { x: d5(st.margin).map((d) => roe0 + d), y: ks.map((d) => ke0 + d), z: ks.map((dk) => d5(st.margin).map((dr) => alt_ps({ 'o.ke_shift': kk0 + dk, 'o.rim_roe': roe0 + dr }, 'DCF.rim.ps'))) };
  return { wacc_g: t1, wacc_margin: t2, wacc_fade: t3, tornado: tor, ddm_ke_g: t4, rim_ke_roe: t5 };
}

function v3eBisect(fn, lo, hi, n = 200) {
  const flo = fn(lo);
  if (flo * fn(hi) > 0) return null;
  for (let i = 0; i < n; i++) {
    const mid = (lo + hi) / 2;
    if (fn(mid) * flo <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// Valley 방식: P = Σ F_t/(1+r)^t + F_n × M/(1+r)^n 을 성장률로 풂(이분법 −90%～300%, 200회)
function v3eReverseClosed(R, r, f0, mult, npm_conv) {
  const P = v3eGet(R, 'price'), n = Math.trunc(Number(v3eOr(v3eGet(R, 'n'), 10))), path = v3eOr(v3eGet(R, 'path'), 'compound');
  if (!v3eT(P) || f0 == null || f0 <= 0 || !v3eT(r) || r <= 0 || !v3eT(mult)) return { ok: false };

  const val = (g) => {
    const Fn = f0 * Math.pow(1 + g, n);
    let s = 0.0;
    for (let t = 1; t <= n; t++) {
      const F = path === 'linear' ? f0 + (Fn - f0) * t / n : path === 'log' ? f0 + (Fn - f0) * Math.log(1 + t) / Math.log(1 + n) : f0 * Math.pow(1 + g, t);
      s += F / Math.pow(1 + r, t);
    }
    return s + Fn * mult / Math.pow(1 + r, n);
  };
  const g = v3eBisect((x) => val(x) - P, -0.9, 3.0);
  if (g == null) return { ok: false };
  const Fn = f0 * Math.pow(1 + g, n);
  const out = { ok: true, g: g, fn: Fn, tv_share: Fn * mult / Math.pow(1 + r, n) / P, r: r, multiple: mult, f0: f0, n: n };
  if (v3eT(npm_conv) && v3eT(v3eGet(R, 's0'))) {
    const Sn = Fn / npm_conv;
    out.g_sales = Sn > 0 ? Math.pow(Sn / R.s0, 1 / n) - 1 : null;
    if (out.g_sales != null) {
      out.rev_path = [];
      for (let t = 1; t <= n; t++) out.rev_path.push(R.s0 * Math.pow(1 + out.g_sales, t) * R.shares / 1e8);
    }
  }
  return out;
}

// E22. P/FCF, P/E 닫힌 식과 모델 전체 리버스(모든 매출 줄 성장률에 같은 가산값)
// model이 참일 때만 모델 리버스(엔진을 53번 돌림). runAll은 닫힌 식만 계산하고 모델 리버스는 V3E.reverseModel이 계산
function v3eReverse(inp, base, model = true) {
  const R = Object.assign({}, v3eOr(v3eGet(inp.input, 'rdcf'), {}));
  const sw = inp.switches;
  const close = v3eGet(inp.target, 'close');
  const tgt = { close: close, manual: v3eGet(sw, 'rdcf_price'), relval: v3eGet(v3eOr(v3eGet(v3eOr(v3eGet(inp.input, 'rel'), {}), 'ps'), {}), 'median') }[sw.rdcf_target];
  R.price = tgt;
  const r = { ke: base.W.ke, wacc: base.W.wacc, fixed10: 0.10 }[sw.rdcf_r];
  const out = { pfcf: v3eReverseClosed(R, r, v3eGet(R, 'f0'), v3eGet(R, 'multiple'), v3eNz(v3eGet(R, 'npm')) * v3eNz(v3eGet(R, 'conv'))),
    pe: v3eReverseClosed(R, r, v3eGet(R, 'eps0'), v3eGet(R, 'pe'), v3eGet(R, 'npm')) };
  if (v3eT(model) && v3eT(tgt)) {
    const x = v3eBisect((a) => v3eNz(v3eGet(v3eRun(inp, 'Base', { 'o.growth_add': a }).out, 'ps_raw'), -1e18) - tgt, -0.3, 0.6, 50);
    const m = { x: x, cagr: null, cons_cagr: null, base_cagr: null };
    const H = base.H, N = base.N;
    const rev = base.rows['REV.total'];
    m.base_cagr = Math.pow(v3eLast(rev) / rev[H - 1], 1 / N) - 1;
    if (x != null) {
      const rv = v3eRun(inp, 'Base', { 'o.growth_add': x }).rows['REV.total'];
      m.cagr = Math.pow(v3eLast(rv) / rv[H - 1], 1 / N) - 1;
      m.rev_path = rv.slice(H);
    }
    const cons = v3eOr(v3eGet(inp.input, 'cons'), {});
    const cr = v3eOr(v3eGet(cons, 'rev'), []).filter((v) => v3eT(v));
    if (cr.length) m.cons_cagr = Math.pow(v3eLast(cr) / rev[H - 1], 1 / cr.length) - 1;
    out.model = m;
  }
  return out;
}

// E24. 2-16, 2-17 점검
// _days: 'YYYY-MM-DD' 두 날짜 사이 일수(b − a)
function v3eDays(a, b) {
  const p = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((p(b) - p(a)) / 86400000);
}

// _checks_more: 2-16, 2-17 점검 가운데 21-7 에 남았던 10개
function v3eChecksMore(inp, c, add, pct) {
  const R = c.rows, H = c.H, N = c.N, I = inp.input, sw = inp.switches, W = c.W;
  const tg = inp.target, yf = c.years_f, ys = inp.timeline.hist;
  const cons = v3eOr(v3eGet(I, 'cons'), {});
  // fy1_stale: 컨센서스 기준일이 최근 분기 실적 공시(분기 말 + 45일) 전이면 실적이 반영 안 된 값
  if (v3eT(v3eGet(cons, 'as_of')) && v3eT(v3eGet(tg, 'bs_date')) && v3eT(v3eGet(tg, 'val_date'))) {
    const pub = v3eDays(tg.bs_date, cons.as_of);
    if (pub < 45 && v3eDays(tg.bs_date, tg.val_date) >= 45) add('fy1_stale', 'warn', '컨센서스 기준일 ' + v3ePyStr(cons.as_of) + '이 ' + v3ePyStr(tg.bs_date) + ' 분기 실적 공시 전이라 최근 실적이 반영되지 않았을 수 있음');
  }
  const rel = v3eOr(v3eGet(I, 'rel'), {});
  // shares_align: DCF 와 상대가치의 주식수
  if (v3eT(v3eGet(rel, 'shares')) && v3eT(c.shares) && Math.abs(rel.shares / c.shares - 1) > 0.005) {
    add('shares_align', 'warn', '상대가치 주식수 ' + v3eFmt2(rel.shares, ',.0f') + '주와 DCF 주식수 ' + v3eFmt2(c.shares, ',.0f') + '주가 다름(' + pct(rel.shares / c.shares - 1) + '). 희석을 어느 쪽에 넣었는지 확인');
  }
  // ev_def_align: EV 다리 항목(금액이 있는 것만)
  const ed = v3eOr(v3eGet(rel, 'ev_def'), {});
  const br = I.bridge, sh = I.shares;
  const nonopv = v3eNonopValue(I, sw);
  const dcf_def = { lease: v3eNz(v3eGet(br.debt, 'lease')) > 0, nci: v3eNz(v3eGet(br, 'nci')) > 0,
    pref: (v3eNz(v3eGet(sh, 'pref')) > 0 || v3eNz(v3eGet(br, 'pref_mkt')) > 0) && sw.pref === 'market', nonop: nonopv > 0 };
  const amt = { lease: v3eNz(v3eGet(br.debt, 'lease')), nci: v3eNz(v3eGet(br, 'nci')), pref: v3eNz(v3eGet(br, 'pref_mkt')) + v3eNz(v3eGet(sh, 'pref')), nonop: nonopv };
  const nm_ = { lease: '리스부채', nci: '비지배지분', pref: '우선주', nonop: '비영업자산' };
  const diff = Object.keys(dcf_def).filter((k) => k in ed && v3eT(amt[k]) && v3eT(ed[k]) !== dcf_def[k]).map((k) => nm_[k]);
  if (diff.length) add('ev_def_align', 'warn', '상대가치 EV 와 DCF 주주가치 다리의 정의가 다른 항목: ' + diff.join(', '));
  // double_count: 희석에 넣은 옵션, 전환을 청구권에도 넣었는지
  const dil = R['SHR.so_tsm'][0] + R['SHR.rsu'][0] + R['SHR.cb_add'][0];
  const words = ['옵션', 'RSU', '전환', '신주인수권', '주식보상'];
  const dup = v3eOr(v3eGet(br, 'claims'), []).filter((x) => words.some((w) => String(v3eOr(v3eGet(x, 'name'), '')).includes(w))).map((x) => v3ePyStr(v3eGet(x, 'name')));
  if (dil > 0 && dup.length) add('double_count', 'warn', '희석 주식수에 넣은 항목이 청구권에도 있음: ' + dup.join(', '));
  // fcff_cross: FCFF 와 (영업현금흐름 + 세후 순이자 − CAPEX) 교차 확인
  const gap = [];
  for (let k = 0; k < N; k++) {
    const t_ = c.X.tax_r[k];
    const alt_ = R['CF.cfo'][H + k] + (R['IS.int_exp'][H + k] - R['IS.int_inc'][H + k]) * (1 - t_) - R['PPE.capex'][H + k] - R['INT.capex'][H + k];
    const f_ = R['DCF.fcff'][k];
    if (v3eT(f_) && Math.abs(alt_ / f_ - 1) > 0.2) gap.push(v3ePyStr(yf[k]) + ' ' + pct(alt_ / f_ - 1));
  }
  if (gap.length) {
    add('fcff_cross', 'info', 'FCFF 와 영업현금흐름 기준 값(세후 순이자 가산, CAPEX 차감) 차이가 20% 넘는 해: ' + gap.join(', ')
      + '. 주식보상비용, 사용권자산 신규, 계약관계 취득처럼 두 정의가 다르게 다루는 항목을 확인');
  }
  // asp_vs_ucost: 단위원가가 단가보다 연 2%p 넘게 빨리 내려가면 마진이 저절로 커짐
  for (const ln of I.revbuild.lines) {
    const uc = R['CTL.a.ucost.' + ln.id], pr = R['REV.l.' + ln.id + '.price'];
    if (v3eT(uc) && v3eT(pr) && N > 1) {
      const gu = v3eCagr(uc[0], v3eLast(uc), N - 1), gp_ = v3eCagr(pr[H], v3eLast(pr), N - 1);
      if (gu != null && gp_ != null && gu < gp_ - 0.02) add('asp_vs_ucost', 'warn', v3ePyStr(ln.name) + ': 단위원가 연 ' + pct(gu) + '가 단가 연 ' + pct(gp_) + '보다 빨리 내려가 마진이 저절로 커짐');
    }
  }
  // stable_vs_peer: 안정기 D/E, 베타가 비교기업과 크게 다름
  const pd_ = v3eOr(v3eGet(I.beta, 'peers'), []).filter((p) => v3eT(v3eGet(p, 'include', true)) && v3eGet(p, 'de') != null).map((p) => v3eNz(p.de));
  if (pd_.length) {
    const md = v3eMedian(pd_);
    const de_s = R['WACC.de_s'][0];
    if (Math.abs(de_s - md) > 0.3) add('stable_vs_peer', 'info', '안정기 D/E ' + pct(de_s) + '가 비교기업 중앙값 ' + pct(md) + '과 30%p 넘게 다름');
  }
  if (v3eGet(W, 'beta_bu') != null && Math.abs(W.beta_s - W.beta_bu) > 0.3) {
    add('stable_vs_peer', 'info', '안정기 베타 ' + v3eFmt2(W.beta_s, '.2f') + '가 비교기업 바텀업 베타 ' + v3eFmt2(W.beta_bu, '.2f') + '와 0.3 넘게 다름');
  }
  // ppe_xfer_sum: 건설중인자산 대체 합은 0
  if ('PPE.cip.xfer' in R) {
    const xf_ = (rid) => (rid in R ? v3eFc(c, rid) : v3eFill(N, 0.0));   // 묶음 행에 과거 열이 붙을 수 있어 명시 기간 값으로 읽음
    const cp = xf_('PPE.cip.xfer'), bl = xf_('PPE.bldg.xfer'), mc = xf_('PPE.mach.xfer');
    const bad = [];
    for (let k = 0; k < N; k++) if (Math.abs(cp[k] + v3eNz(bl[k]) + v3eNz(mc[k])) > 1e-6) bad.push(v3ePyStr(yf[k]));
    if (bad.length) add('ppe_xfer_sum', 'err', '건설중인자산 대체 합이 0이 아님: ' + bad.join(', '));
  }
  // ppe_src_gap: 변동표 취득과 현금흐름표 유형자산 취득 차이(직전 결산)
  const roll = v3eOr(v3eGet(I, 'ppe_roll'), {});
  let acq = v3eGet(roll, 'acq_fy0');
  if (acq == null && v3eT(v3eGet(roll, 'classes'))) {
    const xs_ = roll.classes.filter((cl) => v3eGet(cl, 'acq_fy0') != null && v3eGet(cl, 'id') !== 'rou').map((cl) => cl.acq_fy0);
    acq = xs_.length ? v3eSum(xs_) : null;
  }
  const cx0 = -v3eNz(v3eLast(v3eHist(c, 'CF.capex_ppe')));
  if (acq != null && v3eT(cx0) && Math.abs(acq / cx0 - 1) > 0.1) {
    add('ppe_src_gap', 'info', '직전 결산 유형자산 변동표 취득 ' + v3eFmt2(acq, ',.0f') + '억과 현금흐름표 취득 ' + v3eFmt2(cx0, ',.0f') + '억 차이 ' + pct(acq / cx0 - 1) + '(미지급 취득, 대체 등)');
  }
  // loan_dep: 기타유동자산에 든 대여금, 보증금. sw.loan_class = nonop 이면 inputs 가 비영업자산으로 옮김
  const ld = v3eOr(v3eGet(I, 'loan_dep'), {});
  if (v3eT(v3eGet(ld, 'ca')) && v3eOr(v3eGet(sw, 'loan_class'), 'nwc') === 'nwc' && v3eT(v3eNz(v3eLast(ld.ca)))) {
    add('loan_dep', 'info', '기타유동자산에 대여금, 보증금 ' + v3eFmt2(v3eLast(ld.ca), ',.1f') + '억(' + v3eOr(v3eGet(ld, 'names'), []).join(', ') + ')이 들어 있어 운전자본으로 계산됨. '
      + '영업과 무관하면 sw.loan_class = nonop 으로 비영업자산에 넣음');
  }
  // market_changed: 지난 실행과 달라진 시장 입력(CHK.stale_inputs 보강)
  const mp = v3eOr(v3eGet(I, 'market_prev'), {}), m_ = I.market;
  if (v3eT(mp)) {
    const win = sw.beta_window;
    const pairs = [['무위험이자율', v3eGet(v3eOr(v3eGet(mp, 'rf'), {}), sw.rf), v3eGet(v3eOr(v3eGet(m_, 'rf'), {}), sw.rf), true],
      ['주식위험프리미엄', v3eGet(v3eOr(v3eGet(mp, 'erp'), {}), 'total'), v3eGet(v3eOr(v3eGet(m_, 'erp'), {}), 'total'), true],
      ['소비자물가 10년 평균', v3eGet(mp, 'cpi10'), v3eGet(m_, 'cpi10'), true], ['소비자물가 5년 평균', v3eGet(mp, 'cpi5'), v3eGet(m_, 'cpi5'), true],
      ['명목 GDP 성장률', v3eGet(mp, 'gdp10'), v3eGet(m_, 'gdp10'), true], ['임금상승률', v3eGet(mp, 'wage5'), v3eGet(m_, 'wage5'), true],
      ['대상 회귀 베타', v3eGet(mp, 'beta_raw'), v3eGet(v3eOr(v3eGet(v3eOr(v3eGet(I.beta, 'target'), {}), win), {}), 'raw'), 'num'],
      ['기준일 종가', v3eGet(mp, 'close'), v3eGet(tg, 'close'), 'won']];
    const fm_ = (x, k) => (k === true ? pct(x, 2) : k === 'num' ? v3eFmt2(x, ',.3f') : v3eFmt2(x, ',.0f') + '원');
    const ch_ = pairs.filter((x) => x[1] != null && x[2] != null && Math.abs(x[1] - x[2]) > 1e-9)
      .map((x) => x[0] + ' ' + fm_(x[1], x[3]) + ' → ' + fm_(x[2], x[3]));
    if (ch_.length) add('stale_inputs', 'info', '지난 실행(' + v3eOr(v3eGet(mp, 'at'), '날짜 모름') + ')과 달라진 시장 입력: ' + ch_.join(', '));
  }
  // bs_cf_pair: 과거 유형자산 증감 중 CAPEX, 감가상각, 사용권자산으로 설명되지 않는 몫(처분, 대체 등)이 큰 해
  const dsp = R['PPE.disp'].slice(0, H), cxh = R['PPE.capex'].slice(0, H);
  const bad2 = [];
  for (let i = 0; i < H; i++) if (dsp[i] != null && v3eT(cxh[i]) && Math.abs(dsp[i]) > 0.2 * Math.abs(cxh[i])) bad2.push(v3ePyStr(ys[i]) + ' ' + v3eFmt2(dsp[i], '+,.0f') + '억');
  if (bad2.length) add('bs_cf_pair', 'info', '유형자산 기초 + 취득 + 사용권자산 − 감가상각과 기말 차이(처분, 대체, 환율 등)가 취득의 20%를 넘는 해: ' + bad2.join(', '));
}

const v3eCogsModeName = { ratio: '전사 원가율', seg_ratio: '사업부 원가율', unit_cost: '단위원가', gpm_step: '매출총이익률 가산' };
// _checks_p1a: 매출, 원가 묶음 점검
function v3eChecksP1a(inp, c, add, pct) {
  const sw = inp.switches, lines = inp.input.revbuild.lines;
  // pv_hist: 수량 × 단가 줄의 직전 실적 수량, 단가가 없으면 그 줄 매출이 0 으로 계산됨
  for (const ln of lines) {
    if (ln.type !== 'price_volume') continue;
    const miss = [];
    for (const [hk, nm] of [['vol', '수량'], ['price', '단가']]) if (!v3eT(v3eLast(v3eHist(c, 'REV.l.' + ln.id + '.' + hk)))) miss.push(nm);
    if (miss.length) add('pv_hist', 'err', v3ePyStr(ln.name) + ': 수량 × 단가 줄인데 직전 실적 ' + miss.join(', ') + ' 값이 없어 매출이 0으로 계산됨(revbuild 줄의 hist_vol, hist_price에 rSegment KPI 줄을 연결)');
  }
  // to_no_fy0: 끝값 하나 꼴인데 직전 실적을 몰라 과거 평균(없으면 끝값)에서 출발한 가정
  if (c.A_to_miss.length) add('to_no_fy0', 'warn', '끝값 하나만 준 가정 가운데 직전 실적을 몰라 과거 평균(없으면 끝값 그대로)에서 출발한 것: ' + c.A_to_miss.join(', '), c.A_to_miss.slice());
  // to_unused: 끝값 하나 꼴로 줬지만 지금 방식에서 읽지 않아 쓰이지 않은 가정
  if (Object.keys(c.A_to).length) add('to_unused', 'warn', '끝값 하나만 준 가정 가운데 지금 방식에서 읽지 않아 쓰이지 않은 것: ' + Object.keys(c.A_to).join(', '), Object.keys(c.A_to));
  // seg_cost_hist: 사업부 원가 방식인데 과거 사업부 원가가 없어 사업부 원가율 기본값이 전사 평균인 키(결과가 전사 원가율 방식과 같아짐)
  if (sw.cogs_mode === 'seg_ratio' && !('OPX.cogs.etc' in c.rows)) {
    const keys = [];
    for (const ln of lines) {
      const ck = v3eGet(v3eOr(v3eGet(ln, 'cost'), {}), 'cogs_r_key');
      if (v3eT(ck) && !keys.includes(ck) && !(('OPX.cogs_r.' + ck) in c.rows) && !(('cogs_r.' + ck) in c.A_given)) keys.push(ck);
    }
    if (keys.length) add('seg_cost_hist', 'info', '과거 사업부 원가가 없어 사업부 원가율 기본값을 전사 평균으로 둔 키: ' + keys.join(', ') + '(revbuild cost_hist에 rSegment 원가 줄을 연결하면 사업부별 평균)');
  }
}
// _checks_p1b: 판관비, 인원 점검(설계서 2-17 CHK.labor_ratio, share_le_1, ratio_jump 보강과 sga_resid, hc_dept_sum)
function v3eChecksP1b(inp, c, add, pct, name) {
  const R = c.rows, H = c.H, I = inp.input, ys = inp.timeline.hist;
  // labor_ratio: 판관비 인건비 비율. 과거 3년 매출이 느는데 비율이 해마다 오르면 정보(M1-098),
  // 추정 마지막 해가 직전 실적보다 15% 넘게 낮거나 과거 3년 오르던 비율이 추정에서 내려가면 경고(M1-120. 원형 12.44%에서 9.89%)
  const lab = R['OPX.sga.labor.pct'];
  const up3 = v3eT(lab) && H >= 3 && lab[H - 3] != null && lab[H - 2] != null && lab[H - 1] != null && lab[H - 3] < lab[H - 2] && lab[H - 2] < lab[H - 1];
  const rv = R['IS.rev'];
  if (up3 && rv[H - 3] != null && rv[H - 1] != null && rv[H - 1] > rv[H - 3]) {
    add('labor_ratio', 'info', '매출이 느는데 판관비 인건비 비율이 ' + v3ePyStr(ys[H - 3]) + '년 ' + pct(lab[H - 3]) + '에서 ' + v3ePyStr(ys[H - 1]) + '년 ' + pct(lab[H - 1]) + '로 해마다 오름(채용 증가인지 임금 상승인지 확인)');
  }
  if (v3eT(lab) && v3eT(lab[H - 1]) && v3eLast(lab) != null) {
    if (v3eLast(lab) < 0.85 * lab[H - 1]) {
      add('labor_ratio', 'warn', '판관비 인건비 비율이 직전 실적 ' + pct(lab[H - 1]) + '에서 마지막 해 ' + pct(v3eLast(lab)) + '로 크게 내려감' + (up3 ? '(과거 3년은 해마다 오름)' : ''));
    } else if (up3 && v3eLast(lab) < lab[H - 1]) {
      add('labor_ratio', 'warn', '판관비 인건비 비율이 과거 3년은 해마다 올랐는데 추정에서는 직전 실적 ' + pct(lab[H - 1]) + '에서 마지막 해 ' + pct(v3eLast(lab)) + '로 내려감');
    }
  }
  // share_le_1: 판관비 인건비가 전체 인건비보다 큼(M1-145)
  const sl = v3eOr(R['OPX.sga.labor'], []), lt = v3eOr(R['OPX.labor_total'], []);
  let bad = [];
  for (let i = 0; i < H; i++) if (sl.length && lt.length && sl[i] != null && v3eT(lt[i]) && sl[i] > lt[i] * (1 + 1e-9)) bad.push(v3ePyStr(ys[i]));
  const la = R['CTL.a.labor_sga_share'];
  if (bad.length || (v3eT(la) && la.some((x) => x != null && x > 1 + 1e-9))) {
    add('share_le_1', 'warn', '인건비 판관비 몫이 1을 넘음' + (bad.length ? '(판관비 인건비가 전체 인건비보다 큰 해: ' + bad.join(', ') + ')' : ''));
  }
  // share_le_1: 같은 이름 계정이 판관비 주석에서 성격별 분류(원가 + 판관비)보다 큼(M1-149. 원형 경상연구개발비 2022년 150.8억 대 130.3억)
  for (const it of v3eOr(v3eGet(v3eOr(v3eGet(I, 'opex'), {}), 'nat_sga'), [])) {
    const a = v3eOr(v3eGet(it, 'sga'), []), b = v3eOr(v3eGet(it, 'nature'), []);
    bad = [];
    for (let i = 0; i < Math.min(H, a.length, b.length); i++) {
      if (a[i] != null && b[i] != null && a[i] - b[i] > 0.1) bad.push(v3ePyStr(ys[i]) + ' ' + v3eFmt2(a[i], ',.1f') + '억 대 ' + v3eFmt2(b[i], ',.1f') + '억');
    }
    if (bad.length) add('share_le_1', 'warn', '판관비 주석의 ' + v3ePyStr(v3eGet(it, 'name')) + '가 성격별 분류의 같은 계정보다 큼: ' + bad.join(', '));
  }
  // sga_resid: 판관비 주석 묶음 합과 본문 판관비 차이가 판관비의 1%를 넘음(M1-145)
  const rs = v3eOr(R['OPX.sga.resid'], []), sg = R['OPX.sga'];
  bad = [];
  for (let i = 0; i < H; i++) {
    if (rs.length && rs[i] != null && v3eT(sg[i]) && Math.abs(rs[i]) > 0.01 * Math.abs(sg[i])) bad.push(v3ePyStr(ys[i]) + ' ' + v3eFmt2(rs[i], '+,.1f') + '억(' + pct(rs[i] / sg[i]) + ')');
  }
  if (bad.length) add('sga_resid', 'warn', '판관비 주석 묶음 합이 본문 판관비와 1% 넘게 다른 해: ' + bad.join(', '));
  // ratio_jump: 묶음별 첫해 비율이 직전 실적과 2%p 넘게 다르거나 금액이 15% 넘게 줆(M1-153. 원형 지급수수료 13.93%에서 10.56%)
  for (const rid of Object.keys(R).filter((k) => k.startsWith('OPX.sga.') && k.endsWith('.pct') && (k.slice(0, -4) in R))) {
    const base = rid.slice(0, -4);
    const a0 = R[rid][H - 1], a1 = R[rid][H], v0 = R[base][H - 1], v1 = R[base][H];
    const nm = name(base);
    if (a0 != null && a1 != null && Math.abs(a1 - a0) > 0.02) {
      add('ratio_jump', 'warn', nm + ' ÷ 매출 첫해 ' + pct(a1, 2) + '가 직전 실적 ' + pct(a0, 2) + '와 2%p 넘게 다름');
    } else if (v0 != null && v1 != null && v0 > 10 && v1 < 0.85 * v0) {
      add('ratio_jump', 'warn', nm + ' 첫해 금액 ' + v3eFmt2(v1, ',.1f') + '억이 직전 실적 ' + v3eFmt2(v0, ',.1f') + '억보다 15% 넘게 줆');
    }
  }
  // hc_dept_sum: 부서 인원 합이 총원과 다름(M1-158. 원형은 「기타」 부서를 총원 − 나머지로 맞춤)
  const depts = v3eOr(v3eGet(v3eOr(v3eGet(I, 'opex'), {}), 'hc_depts'), []);
  const hc = v3eOr(v3eGet(I.hist, 'OPX.hc'), []);
  if (depts.length && hc.length) {
    bad = [];
    for (let i = 0; i < Math.min(H, hc.length); i++) {
      const dh = depts.map((d) => v3eOr(v3eGet(I.hist, 'OPX.hc.' + d.id), v3eFill(H))[i]);
      if (hc[i] != null && dh.every((x) => x != null) && Math.abs(v3eSum(dh) - hc[i]) > 0.5) bad.push(v3ePyStr(ys[i]) + ' ' + v3eFmt2(v3eSum(dh) - hc[i], '+,.0f') + '명');
    }
    if (bad.length) add('hc_dept_sum', 'info', '부서 인원 합이 총원과 다른 해: ' + bad.join(', ') + '(「기타」 부서로 맞추거나 부서 표 확인)');
  }
}
// _checks_p2: 자산, 운전자본, 차입 묶음 점검(대조 M1-249, M3-036, M3-064, M3-243)
function v3eChecksP2(inp, c, add, pct) {
  const R = c.rows, H = c.H, N = c.N, I = inp.input;
  const yf = c.years_f, ys = inp.timeline.hist;
  // nwc_avg_gap: 회전일수와 비율마다 3년 평균과 5년 평균 차이가 20% 넘으면 튄 해가 있다는 뜻(02 노트 6.2절, 17.4절)
  const nm = { dso: '매출채권 회전일수', dio: '재고자산 회전일수', dpo: '매입채무 회전일수', oca_pct: '기타 영업 유동자산 ÷ 매출', ocl_pct: '기타 영업 유동부채 ÷ 매출' };
  const gap = [];
  for (const k of ['dso', 'dio', 'dpo', 'oca_pct', 'ocl_pct']) {
    const hv = R['NWC.' + k].slice(0, H);
    const x3 = hv.slice(-3).filter((x) => x != null), x5 = hv.slice(-5).filter((x) => x != null);
    if (x5.length < 4 || !x3.length) continue;
    let a3 = 0.0, a5 = 0.0;
    for (const x of x3) a3 += x;
    for (const x of x5) a5 += x;
    a3 = a3 / x3.length; a5 = a5 / x5.length;
    if (v3eT(a5) && Math.abs(a3 / a5 - 1) > 0.2) {
      const fm = k.charAt(0) === 'd' ? (x) => v3eFmt2(x, ',.1f') + '일' : pct;
      gap.push(nm[k] + ' ' + fm(a3) + ' 대 ' + fm(a5) + '(' + pct(a3 / a5 - 1) + ')');
    }
  }
  if (gap.length) {
    const bd = R['OPX.sga.baddebt'];
    let tail = '';
    if (v3eT(bd)) {                                   // 대손상각비 ÷ 매출이 가장 높은 해(매출채권이 튄 해와 같이 볼 것)
      let top = null;
      for (let i = 0; i < H; i++) {
        const x = bd[i] == null ? null : v3eDiv(bd[i], R['IS.rev'][i]);
        if (x != null && (top == null || x > top[0])) top = [x, ys[i]];
      }
      if (top) tail = '. 대손상각비 ÷ 매출이 가장 높은 해 ' + v3ePyStr(top[1]) + '년 ' + pct(top[0], 2);
    }
    add('nwc_avg_gap', 'info', '3년 평균과 5년 평균 차이가 20%를 넘는 운전자본 항목: ' + gap.join(', ') + '. 튄 해의 계정 주석을 확인하고 평균에서 뺄지 정함(avg_exclude)' + tail);
  }
  // nwc_scope: 당기법인세부채, 미지급배당금을 예전처럼 운전자본에 둔 경우(sw.taxpay_class = nwc)
  const ne = v3eOr(v3eGet(I, 'nwc_excl'), {});
  if (v3eT(v3eGet(ne, 'cl')) && v3eOr(v3eGet(ne, 'class'), 'nonop') === 'nwc' && v3eT(v3eNz(v3eLast(ne.cl)))) {
    add('nwc_scope', 'info', '기타유동부채에 당기법인세부채, 미지급배당금 ' + v3eFmt2(v3eLast(ne.cl), ',.1f') + '억(' + v3eOr(v3eGet(ne, 'names'), []).join(', ') + ')이 들어 있어 운전자본으로 계산됨. '
      + '설계서 2-6 대로 빼려면 sw.taxpay_class = nonop');
  }
  // dep_rate_trend: 첫해 뒤에도 감가상각률이 과거 범위를 벗어나는 해(M3-064, 원형 301은 2023E 5.6%에서 2027E 13.3%로 해마다 오름)
  let dr_h = [];
  for (let i = 0; i < H; i++) dr_h.push(v3eDiv(R['PPE.dep'][i], R['PPE.bop'][i]));
  dr_h = dr_h.filter((x) => x != null);
  if (dr_h.length) {
    const late = [];
    for (let k = 1; k < N; k++) {
      const x = v3eDiv(R['PPE.dep'][H + k], R['PPE.bop'][H + k]);
      if (x != null && !(0.7 * v3eMinOf(dr_h) <= x && x <= 1.3 * v3eMaxOf(dr_h))) late.push(v3ePyStr(yf[k]) + ' ' + pct(x));
    }
    if (late.length) add('dep_rate_trend', 'info', '첫해 뒤 추정 감가상각률이 과거 범위(' + pct(v3eMinOf(dr_h)) + '～' + pct(v3eMaxOf(dr_h)) + ')와 크게 다른 해: ' + late.join(', '));
  }
  // rate_jump(정보): 추정 이자율이 직전 실효이자율 그대로인데 그 값이 튄 경우(M3-243, 원형 301 Model!O148 추정 금리 = 직전 1년 실적 비율)
  const rh = R['DEBT.rate'].slice(0, H);
  if (v3eLast(rh) != null && Math.abs(R['DEBT.rate'][H] - v3eLast(rh)) < 1e-12) {
    const prior = rh.slice(-4, -1).filter((x) => x != null);
    if (prior.length) {
      let pm = 0.0;
      for (const x of prior) pm += x;
      pm /= prior.length;
      if (Math.abs(v3eLast(rh) - pm) > 0.02) {
        add('rate_jump', 'info', '추정 이자율로 쓴 직전 실효이자율 ' + pct(v3eLast(rh), 2) + '이 그 앞 ' + prior.length + '개 해 평균 ' + pct(pm, 2) + '와 2%p 넘게 다름(sw.int_rate = avg4 나 직접 입력 검토)');
      }
    }
    const ibd = R['DEBT.ibd'];
    const avg_d = (v3eNz(ibd[H - 1]) + v3eNz(H > 1 ? ibd[H - 2] : ibd[H - 1])) / 2;
    const rev0 = R['IS.rev'][H - 1];
    if (v3eT(rev0) && v3eNz(R['IS.int_exp'][H - 1]) > 0 && avg_d < 0.01 * rev0) {
      add('rate_jump', 'info', '직전 결산 평균 차입금 ' + v3eFmt2(avg_d, ',.1f') + '억이 매출의 1% 미만이라 실효이자율 ' + pct(v3eLast(rh), 2) + '이 튈 수 있음(추정 이자율을 직접 넣는 것을 검토)');
    }
  }
}

// engine.py _checks_p3: wacc_vs_broker, peer_self, beta_px_tie, rel_scen_src
function v3eChecksP3(inp, ctxs, add, pct) {
  const c = ctxs.Base;
  const I = inp.input, sw = inp.switches, W = c.W;
  const bw = [];
  for (const b of v3eOr(v3eGet(v3eOr(v3eGet(I, 'research'), {}), 'broker_wacc'), [])) {      // 숫자 목록이나 {broker, date, wacc} 목록
    const v = b != null && typeof b === 'object' && !Array.isArray(b) ? v3eGet(b, 'wacc') : b;
    if (typeof v === 'number') bw.push(v);
  }
  if (bw.length) {
    const md = v3eMedian(bw);
    if (Math.abs(W.wacc - md) > 0.01) add('wacc_vs_broker', 'info', 'WACC ' + pct(W.wacc, 2) + '가 증권사 리포트 WACC 중앙값 ' + pct(md, 2) + '(' + bw.length + '건)와 1%p 넘게 다름', W.wacc - md);
  }
  const code = v3eGet(inp.target, 'code');
  if (v3eT(code) && v3eOr(v3eGet(I.beta, 'peers'), []).some((p) => v3eGet(p, 'code') === code && v3eT(v3eGet(p, 'include', true)))) {
    add('peer_self', 'info', '대상 회사가 베타 비교기업 통계에 들어 있음(include_target)');
  }
  const R = c.rows;
  const raw = v3eGet(v3eOr(v3eGet(v3eOr(v3eGet(I.beta, 'target'), {}), v3eGet(v3eOr(v3eGet(I.beta, 'px'), {}), 'window')), {}), 'raw');
  const slr = R['WACC.ret.slope'];
  const sl = v3eT(slr) ? slr[0] : null;
  if (sl != null && raw != null && Math.abs(sl - raw) > 1e-4) add('beta_px_tie', 'warn', '가격 표로 다시 계산한 원 베타 ' + v3eFmt2(sl, '.4f') + '가 입력 원 베타 ' + v3eFmt2(raw, '.4f') + '와 다름', sl - raw);
  if (v3eGet(sw, 'rel_scen_src') === 'model' && v3eT(v3eGet(v3eOr(v3eGet(I, 'rel'), {}), 'ps')) && v3eRelModel(inp, ctxs) == null) {
    add('rel_scen_src', 'warn', '상대가치 시나리오를 모델 값으로 계산할 수 없어 외부 값을 씀(평가 배수 기간이 FY1～FY3 이 아니거나 배수, 주식수가 없음)');
  }
}

// engine.py rel_model: 상대가치 평가 배수(input.rel 의 중앙값)에 엔진 시나리오 실적을 넣은 주당 가치(py.rel_model). 식은 relval.implied 와 같음
const v3eREL_METRIC = { PER: ['eq', 'IS.ni_parent'], PBR: ['eq', null], PSR: ['eq', 'IS.rev'], 'EV/EBITDA': ['ev', 'OPX.ebitda'], 'EV/EBIT': ['ev', 'IS.ebit'], 'EV/Sales': ['ev', 'IS.rev'] };
function v3eRelModel(inp, ctxs) {
  const rel = v3eOr(v3eGet(inp.input, 'rel'), {});
  const mt = v3eGet(rel, 'method');
  const [kind, rid] = mt != null && Object.prototype.hasOwnProperty.call(v3eREL_METRIC, mt) ? v3eREL_METRIC[mt] : [null, null];
  const pk = { FY1: 0, FY2: 1, FY3: 2 }, per = v3eGet(rel, 'period');
  const k = per != null && Object.prototype.hasOwnProperty.call(pk, per) ? pk[per] : null;
  const H = ctxs.Base.H, N = ctxs.Base.N;
  if (kind == null || k == null || k >= N || !v3eT(v3eGet(rel, 'multiple')) || !v3eT(v3eGet(rel, 'shares'))) return null;
  const ep = v3eOr(v3eGet(rel, 'ev_parts'), {});
  const pref = v3eT(v3eGet(v3eOr(v3eGet(rel, 'shares_src'), {}), 'pref_listed')) ? v3eNz(v3eGet(ep, 'mcap_pref')) : 0.0;
  const claim = kind === 'ev' ? v3eNz(v3eGet(ep, 'net_debt')) + v3eNz(v3eGet(ep, 'nci')) - v3eNz(v3eGet(rel, 'non_op')) : 0.0;
  const out = { method: rel.method, period: rel.period, multiple: rel.multiple, metric: {}, ps: {} };
  for (const S of V3E.SCEN) {
    const R = ctxs[S].rows;
    const met = rid ? R[rid][H + k] : R['BS.te'][H + k] - R['BS.nci'][H + k];
    out.metric[S] = met === undefined ? null : met;
    out.ps[S] = met == null || met <= 0 ? null : (rel.multiple * met - claim - pref) * 1e8 / rel.shares;
  }
  return out;
}

// engine.py wacc_matrix: WACC 선택지 조합 결과표(py.wacc_matrix). 베타 창 × 방식(회귀, 바텀업 중앙값, 평균, 최고, 최저), 무위험이자율 선택지별 WACC.
// Base 문맥에서 E15 만 다시 돌림. WACC 직접 입력과 가산(wacc_override, o.wacc, o.wacc_shift)은 빼고 계산한 값
const v3eMATRIX_COLS = ['regression', 'median', 'mean', 'high', 'low'];
function v3eWaccMatrix(base) {
  const c = base, I = c.I, sw = c.sw;
  const B = I.beta, m = I.market;
  const one = (sw_over, rf, erp) => {
    const c2 = Object.assign({}, c);
    c2.sw = Object.assign({}, sw, { wacc_override: null, wacc_s_override: null }, sw_over);
    c2.ov = {};
    for (const k in c.ov) if (k !== 'o.wacc' && k !== 'o.wacc_shift') c2.ov[k] = c.ov[k];
    c2.rows = Object.assign({}, c.rows); c2.labels = Object.assign({}, c.labels); c2.checks = [];
    if (rf != null) c2.rf = rf;
    if (erp != null) c2.erp = erp;
    step_wacc(c2);
    return c2.W;
  };
  let wins = Object.keys(v3eOr(v3eGet(B, 'target'), {}));
  for (const p of v3eOr(v3eGet(B, 'peers'), [])) {
    const r = v3eGet(p, 'raw');
    if (r != null && typeof r === 'object' && !Array.isArray(r)) for (const w of Object.keys(r)) if (!wins.includes(w)) wins.push(w);
  }
  if (!wins.length) wins = [sw.beta_window];
  const z = [], bz = [], pz = [];
  for (const w of wins) {
    const zr = [], br_ = [], pr_ = [];
    for (const col of v3eMATRIX_COLS) {
      const W = one(col === 'regression' ? { beta_window: w, beta_mode: 'regression' } : { beta_window: w, beta_mode: 'bottom_up', beta_stat: col });
      const miss = col === 'regression' ? W.beta_reg == null : W.beta_bu == null;
      zr.push(miss ? null : W.wacc);
      br_.push(miss ? null : W.beta);
      pr_.push(col === 'regression' ? W.beta_reg : W.beta_bu);
    }
    z.push(zr); bz.push(br_); pz.push(pr_);
  }
  const rk = Object.keys(m.rf).filter((k) => typeof m.rf[k] === 'number');
  const rv = rk.map((k) => m.rf[k] - (v3eT(v3eGet(sw, 'rf_cds')) ? v3eNz(v3eGet(m, 'cds')) : 0.0));
  const rz = rv.map((r) => one({}, r).wacc);
  const ek = [['damodaran', 'total'], ['damodaran_cds', 'total_cds'], ['historical', 'historical'], ['implied_kospi', 'implied'], ['manual', 'manual']]
    .filter((q) => typeof v3eGet(m.erp, q[1]) === 'number');      // 값이 있는 ERP 출처만
  const ev = ek.map((q) => m.erp[q[1]]);
  const ez = ev.map((e) => one({}, null, e).wacc);
  const cur = one({});
  const used = c.W.beta_used;
  const vals = [];
  for (const row of z) for (const v of row) if (v != null) vals.push(v);
  for (const v of rz) vals.push(v);
  for (const v of ez) vals.push(v);
  return { beta: { x: v3eMATRIX_COLS.slice(), y: wins, wacc: z, beta: bz, beta_pre: pz }, rf: { x: rk, rf: rv, wacc: rz },
    erp: { x: ek.map((q) => q[0]), erp: ev, wacc: ez },
    cur: { beta_window: sw.beta_window, beta_col: used === 'regression' ? 'regression' : used === 'bottom_up' ? sw.beta_stat : null, rf: sw.rf, erp: sw.erp, wacc: cur.wacc },
    min: vals.length ? v3eMinOf(vals) : null, max: vals.length ? v3eMaxOf(vals) : null, override: v3eT(c.W.override) };
}

function v3eChecks(inp, ctxs, scen, wavg, rd) {
  const c = ctxs.Base;
  const out = [];
  for (const S of V3E.SCEN) {
    for (const ck of ctxs[S].checks) {
      if (S === 'Base' || ck.id === 'bs_balance' || ck.id === 'cash_roll' || ck.id === 're_roll') {
        out.push(S === 'Base' ? ck : Object.assign({}, ck, { text: '[' + S + '] ' + ck.text }));
      }
    }
  }
  const add = (cid, lv, text, value) => out.push({ id: cid, level: lv, text: text, value: value === undefined ? null : value });
  const pct = v3ePct;
  const R = c.rows, H = c.H, N = c.N, I = inp.input, sw = inp.switches, W = c.W;
  const meta = v3eOr(v3eGet(inp, '_meta'), {});
  // _meta(입력을 만들 때의 기록)는 사례 파일에 실리지 않음. 없으면 거기서 나오는 점검(rseg_checks, basis_mix, sga_unmapped, input_note)은
  // 사례의 checks에 있는 것을 같은 자리에 그대로 넘김(계산 결과와 무관한 입력 기록이라 덮기를 바꿔도 같음)
  const kept = v3eGet(inp, '_meta') == null ? v3eOr(v3eGet(inp, 'checks'), []) : [];
  const keep = (cid) => { for (const k of kept) if (k.id === cid) add(k.id, k.level, k.text, k.value); };
  const name = (rid) => v3eOr(v3eGet(v3eOr(v3eGet(v3eOr(v3eGet(inp, 'labels'), {}), rid), {}), 'name'), v3eOr(v3eGet(c.labels[rid], 'name'), rid));   // c["labels"][rid]["name"]
  const hist = I.hist;
  const ys = inp.timeline.hist, yf = c.years_f;
  // 과거 열 합계와 rFS 합계
  for (const rid of ['BS.ta', 'BS.tl', 'BS.te']) {
    const bad = [];
    for (let i = 0; i < H; i++) if (v3eT(v3eGet(hist, rid)) && hist[rid][i] != null && Math.abs(R[rid][i] - hist[rid][i]) > 1e-6) bad.push(ys[i]);
    if (bad.length) add('hist_tie', 'err', '과거 열 ' + name(rid) + '가 재무제표 원자료와 다름: ' + bad.map(v3ePyStr).join(', '));
  }
  let bad = [];
  for (let i = 0; i < H; i++) if (R['IS.check_ni'][i] != null && Math.abs(R['IS.check_ni'][i]) > 1e-6) bad.push(ys[i]);
  if (bad.length) add('hist_tie', 'err', '과거 순이익이 손익 항목 합과 다름: ' + bad.map(v3ePyStr).join(', '));
  if (R['BS.check'].slice(0, H).some((x) => x != null && Math.abs(x) > 1e-6)) add('hist_tie', 'err', '과거 재무상태표 대차가 맞지 않음');
  for (const k of v3eOr(v3eGet(meta, 'rseg_checks'), [])) {
    add('rseg_checks', 'warn', 'rSegment 검산 ' + v3ePyStr(v3eGet(k, 'check')) + ': ' + v3ePyStr(v3eGet(k, 'text')), v3eGet(k, 'diff'));
  }
  keep('rseg_checks');
  if (v3eOr(v3eGet(v3eOr(v3eGet(meta, 'notes'), {}), 'warn'), []).includes('basis_mix')) add('basis_mix', 'err', 'revbuild 가 출처 계열이 다른 체계를 섞음');
  keep('basis_mix');
  const tol = 1.5;
  bad = [];
  for (let i = 0; i < H; i++) if (R['REV.resid'][i] != null && Math.abs(R['REV.resid'][i]) > tol) bad.push(v3ePyStr(ys[i]) + ' ' + v3eFmt2(R['REV.resid'][i], '+.1f'));
  if (bad.length) add('rev_check', 'warn', '과거 줄 합과 공시 매출 차이가 허용 오차를 넘음: ' + bad.join(', '));
  // 할인율과 성장률
  const g = c.g_s, rf = c.rf;
  if (!v3eT(c.out.ok)) add('g_vs_rate', 'err', '영구성장률 ' + pct(g, 2) + '이 안정기 WACC ' + pct(W.wacc_s, 2) + ' 이상이라 종료가치를 계산할 수 없음');
  if (g > rf + 1e-12) add('g_vs_rate', 'warn', '영구성장률 ' + pct(g, 2) + '이 무위험이자율 ' + pct(rf, 2) + '보다 높음');
  const gdp = v3eGet(I.market, 'gdp10');
  if (gdp != null && g > gdp) add('g_vs_rate', 'warn', '영구성장률 ' + pct(g, 2) + '이 명목 GDP 성장률 10년 평균 ' + pct(gdp, 2) + '보다 높음');
  if ((sw.dcf_model === 'fcfe' || sw.dcf_model === 'ddm' || sw.dcf_model === 'rim') && v3eGet(sw, 'wacc_override') != null) {
    add('model_rate_pair', 'err', '주주 현금흐름 모형인데 WACC 를 직접 넣음(Ke 로 할인해야 함)');
  }
  const ts = c.out.tv_share;
  if (ts != null && ts > 1) add('tv_share', 'warn', '종료가치 비중 ' + pct(ts) + ': 명시와 전환 기간 현금흐름 합이 음수', ts);
  else if (ts != null && ts > 0.85) add('tv_share', 'info', '종료가치 비중 ' + pct(ts), ts);
  if (!(0.8 <= W.beta_s && W.beta_s <= 1.2)) add('stable_beta', 'warn', '안정기 베타 ' + v3eFmt2(W.beta_s, '.2f') + '가 0.8～1.2 밖');
  const bt = v3eOr(v3eGet(v3eOr(v3eGet(I.beta, 'target'), {}), sw.beta_window), {});
  if (v3eGet(bt, 'raw') != null) {
    add('beta_stats', 'info', '회귀 베타(' + v3ePyStr(sw.beta_window) + ') ' + v3eFmt2(bt.raw, '.2f') + ', 표준오차 ' + v3eFmt2(v3eNz(v3eGet(bt, 'se')), '.2f')
      + ', R² ' + v3eFmt2(v3eNz(v3eGet(bt, 'r2')), '.2f') + ', 관측수 ' + v3ePyStr(v3eGet(bt, 'n')), v3eGet(bt, 'raw'));
  }
  if (v3eT(W.floored)) add('beta_floor', 'info', '베타 하한 ' + v3ePyStr(sw.beta_floor) + ' 적용(계산값 ' + v3eFmt2(v3eNz(W.beta_used === 'regression' ? W.beta_reg : W.beta_bu), '.2f') + ')');
  if (v3eT(W.override)) add('override', 'warn', 'WACC 를 직접 입력함');
  if (v3eT(v3eNz(v3eGet(sw, 'prem_size'))) || v3eT(v3eNz(v3eGet(sw, 'prem_spec'))) || v3eT(v3eNz(v3eGet(sw, 'prem_country')))) {
    if (!v3eT(v3eGet(v3eOr(v3eGet(I, 'notes_in'), {}), 'premium_why'))) add('premium_evidence', 'warn', '규모, 개별, 국가 프리미엄에 근거가 없음');
  }
  if (W.kd_pre == null) add('kd_missing', 'err', '합성 등급 스프레드가 비어 타인자본비용을 계산할 수 없음');
  const eff = R['CTL.a.debt_rate'][0];
  if (v3eT(eff) && Math.abs(W.kd_pre - eff) > 0.02) add('kd_consistency', 'info', 'WACC 세전 Kd ' + pct(W.kd_pre, 2) + '와 차입 실효이자율 ' + pct(eff, 2) + '이 2%p 넘게 다름');
  const tg = inp.target;
  if (v3eT(v3eGet(tg, 'bs_date')) && v3eT(v3eGet(tg, 'val_date'))) {
    const gap = (parseInt(tg.val_date.slice(0, 4), 10) - parseInt(tg.bs_date.slice(0, 4), 10)) * 12 + parseInt(tg.val_date.slice(5, 7), 10) - parseInt(tg.bs_date.slice(5, 7), 10);
    if (gap > 4) add('date_align', 'warn', '재무상태표 기준일 ' + tg.bs_date + '과 평가 기준일 ' + tg.val_date + ' 사이가 ' + gap + '개월');
  }
  const as_of = v3eGet(v3eOr(v3eGet(I.market, 'as_of'), {}), 'updated');
  if (v3eT(as_of) && v3eT(v3eGet(tg, 'val_date'))) {
    const [y1, m1, d1] = tg.val_date.split('-').map((x) => parseInt(x, 10));
    const [y0, m0, d0] = as_of.split('-').map((x) => parseInt(x, 10));
    const dd = (y1 - y0) * 365 + (m1 - m0) * 30 + (d1 - d0);
    if (dd > 30) add('stale_inputs', 'warn', '시장 입력(금리, ERP, 물가) 갱신일 ' + as_of + '이 평가 기준일보다 약 ' + dd + '일 앞섬');
  }
  // 컨센서스
  const cons = v3eOr(v3eGet(I, 'cons'), {});
  const cys = v3eOr(v3eGet(cons, 'years'), []).slice(0, 2);
  for (let j = 0; j < cys.length; j++) {
    const y = cys[j];
    if (yf.includes(y)) {
      const k = yf.indexOf(y);
      for (const [rid, key, nm] of [['REV.total', 'rev', '매출'], ['OPX.ebit', 'ebit', '영업이익']]) {
        const cv = v3eOr(v3eGet(cons, key), v3eFill(3))[j];
        if (v3eT(cv) && Math.abs(R[rid][H + k] / cv - 1) > 0.10) {
          add('cons_gap', 'warn', v3ePyStr(y) + '년 ' + nm + ' ' + v3eFmt2(R[rid][H + k], ',.0f') + '억이 컨센서스 ' + v3eFmt2(cv, ',.0f') + '억과 ' + pct(R[rid][H + k] / cv - 1) + ' 차이');
        }
      }
    }
  }
  if (v3eOr(v3eGet(cons, 'n'), []).some((n) => n != null && n < 3)) add('cons_n', 'warn', '컨센서스 추정 기관이 3곳 미만');
  // 매출, 비용
  const gr = R['REV.growth'];
  if (gr.slice(H).some((x) => x != null && x > 0.5)) add('assump_range', 'warn', '매출 성장률이 50%를 넘는 해가 있음');
  const hm = R['OPX.ebit_m'].slice(0, H).filter((x) => x != null);
  const hgr = gr.slice(0, H).filter((x) => x != null);
  if (hm.length && hgr.length && v3eMaxOf(R['OPX.ebit_m'].slice(H)) > v3eMaxOf(hm) && v3eMaxOf(gr.slice(H)) > v3eMaxOf(hgr)) {
    add('rev_sanity', 'warn', '추정 성장률과 영업이익률이 동시에 과거 최고를 넘음');
  }
  const hg = R['OPX.gpm'].slice(0, H).filter((x) => x != null);
  const out_rng = [];
  for (let k = 0; k < N; k++) if (hg.length && !(v3eMinOf(hg) - 1e-9 <= R['OPX.gpm'][H + k] && R['OPX.gpm'][H + k] <= v3eMaxOf(hg) + 1e-9)) out_rng.push(yf[k]);
  if (out_rng.length) add('gpm_range', 'warn', '추정 매출총이익률이 과거 범위(' + pct(v3eMinOf(hg)) + '～' + pct(v3eMaxOf(hg)) + ') 밖: ' + out_rng.map(v3ePyStr).join(', '));
  if (sw.cogs_mode !== 'components') add('cogs_link', 'info', '원가 방식이 ' + (v3eCogsModeName[sw.cogs_mode] || v3ePyStr(sw.cogs_mode)) + '(' + v3ePyStr(sw.cogs_mode) + ')이라 원가 쪽 감가상각비와 인건비는 스케줄 변화가 반영되지 않음');
  if (v3eT(v3eGet(meta, 'sga_unmapped'))) add('sga_unmapped', 'info', '기타관리비로 묶은 판관비 계정: ' + meta.sga_unmapped.join(', '));
  keep('sga_unmapped');
  for (const rid of Object.keys(R).filter((k) => k.startsWith('OPX.sga.') && k.split('.').length - 1 === 2 && !k.endsWith('resid') && !k.endsWith('cagr_h') && !k.endsWith('cagr_f'))) {
    const hv = R[rid].slice(0, H);
    const sp = [];
    for (let i = 1; i < H; i++) if (hv[i] != null && v3eT(hv[i - 1]) && hv[i] / hv[i - 1] - 1 > 0.5 && hv[i] > 10) sp.push(ys[i]);
    if (sp.length) add('sga_spike', 'info', name(rid) + '가 전년보다 50% 넘게 늘어난 해: ' + sp.map(v3ePyStr).join(', '));
  }
  for (const rid of ['OPX.sga_r', 'OPX.cogs_r']) {
    const a0 = R[rid][H - 1], a1 = R[rid][H];
    if (v3eT(a0) && a1 != null && Math.abs(a1 - a0) > 0.05) add('ratio_jump', 'warn', name(rid) + ' 첫해 ' + pct(a1) + '가 직전 실적 ' + pct(a0) + '와 5%p 넘게 다름');
  }
  for (const rid of ['OPX.dep_sga_share', 'OPX.amort_sga_share']) {
    if (R[rid].some((x) => x != null && x > 1 + 1e-9)) add('share_le_1', 'warn', name(rid) + '이 1을 넘음');
  }
  const hc = v3eOr(v3eGet(hist, 'OPX.hc'), []), lt = v3eOr(v3eGet(hist, 'OPX.labor_total'), []);
  if (hc.some((x) => x != null) && lt.some((x) => x != null) && sw.labor_mode !== 'headcount') {
    add('labor_scope', 'info', '직원 수(별도 기준)와 인건비(연결)의 범위가 달라 인원 방식은 쓰지 않음');
  }
  // 자산, 운전자본, 차입
  const cd = v3eLast(R['PPE.capex_da']);
  if (cd != null && cd > 2) add('capex_da', 'warn', '마지막 해 CAPEX ÷ 감가상각 ' + v3eFmt2(cd, '.1f') + '배');
  const xs = R['NWC.nwc_pct'].slice(0, H).filter((x) => x != null);
  if (xs.length >= 3) {
    const med = v3eMedian(xs.slice(-5));
    if (v3eT(med) && Math.abs(v3eLast(xs) / med - 1) > 0.3) add('nwc_jump', 'warn', '직전 결산 순운전자본 ÷ 매출 ' + pct(v3eLast(xs)) + '가 5년 중앙값 ' + pct(med) + '에서 30% 넘게 벗어남');
  }
  if (sw.revolver !== 'on' && R['BS.cash'].slice(H).some((x) => x < 0)) add('neg_cash', 'warn', '추정 현금이 음수인 해가 있음');
  if (R['DEBT.rcf.eop'].slice(H).some((x) => x > 1e-6)) add('rcf_used', 'info', '최소 현금을 맞추려고 리볼버를 쓴 해가 있음');
  const rh = R['DEBT.rate'].slice(0, H).filter((x) => x != null);
  if (rh.length && Math.abs(R['DEBT.rate'][H] - v3eLast(rh)) > 0.02) add('rate_jump', 'warn', '추정 이자율이 직전 실효이자율과 2%p 넘게 다름');
  const dil = R['SHR.diluted'][0] - R['SHR.basic'][0];
  add('dilution', 'info', '희석 주식수 ' + v3eFmt2(R['SHR.diluted'][0], ',.0f') + '주(유통 ' + v3eFmt2(R['SHR.basic'][0], ',.0f') + '주 + 희석 ' + v3eFmt2(dil, ',.0f') + '주)'
    + (v3eT(v3eNz(v3eGet(c, 'cb_as_equity'))) ? ', 주식으로 본 전환사채는 부채에서 뺌' : ''));
  const sh = I.shares;
  if (!v3eT(v3eGet(sh, 'options')) && !v3eT(v3eGet(sh, 'rsu'))) add('dilution_missing', 'info', '스톡옵션, RSU 건별 표가 없어 희석을 반영하지 못함');
  const rel = v3eOr(v3eGet(I, 'rel'), {});
  // 결과
  if (v3eT(wavg) && !v3eT(wavg.ok)) {
    if (Math.abs(wavg.sum - 1) > 1e-6) add('weights', 'err', '시나리오 가중치 합이 ' + v3eFmt2(wavg.sum * 100, '.1f') + '%라 가중평균을 계산하지 않음');
    else {
      const miss = V3E.SCEN.filter((S) => scen[S].ps_raw == null && v3eT(v3eNz(v3eGet(sw.weights, S))));
      add('weights', 'err', '주당 가치를 구하지 못한 시나리오가 있어 가중평균을 계산하지 않음: ' + miss.join(', '));
    }
  }
  const close = v3eGet(tg, 'close');
  const up = c.out.up;
  if (up != null && up > 1) add('upside_big', 'warn', 'Base 상승여력 ' + pct(up) + ': 가정을 다시 확인');
  if (v3eT(close) && v3eT(c.out.ps) && (c.out.ps / close > 10 || c.out.ps / close < 0.1)) add('result_gap', 'warn', '결과가 시장가와 10배 넘게 차이');
  const rp = v3eGet(v3eOr(v3eGet(rel, 'ps'), {}), 'median');
  if (v3eT(rp) && v3eT(wavg) && v3eT(v3eGet(wavg, 'ps')) && Math.abs(wavg.ps / rp - 1) > 0.3) {
    add('dcf_rel_gap', 'warn', 'DCF 가중평균 ' + v3eFmt2(wavg.ps, ',.0f') + '원과 상대가치 ' + v3eFmt2(rp, ',.0f') + '원이 30% 넘게 다름');
  }
  if (hist['IS.rev'].filter((x) => x != null).length < 3) add('hist_short', 'warn', '실적이 3년 미만');
  const X = c.X;
  const neg = [];
  for (let k = 0; k < N; k++) if (X.reinv[k] <= 0 && v3eNz(gr[H + k]) > 0) neg.push(yf[k]);
  if (neg.length) add('reinv_neg', 'warn', '매출이 느는데 재투자가 0 이하인 해: ' + neg.map(v3ePyStr).join(', '));
  const ni = hist['IS.ni'], cfo = hist['CF.cfo'];
  let q3 = H >= 3;
  for (let i = H - 3; q3 && i < H; i++) if (!(cfo[i] != null && ni[i] != null && cfo[i] < ni[i])) q3 = false;
  if (q3) add('earnings_quality', 'warn', '영업현금흐름이 3년 연속 순이익보다 작음');
  const ar = hist['BS.ar'], hrev = hist['IS.rev'];
  if (H >= 2 && v3eT(v3eLast(ar)) && v3eT(ar[ar.length - 2]) && v3eT(hrev[hrev.length - 2])
    && v3eLast(ar) / ar[ar.length - 2] - 1 > (v3eLast(hrev) / hrev[hrev.length - 2] - 1) + 0.2) {
    add('earnings_quality', 'info', '직전 결산 매출채권 증가율 ' + pct(v3eLast(ar) / ar[ar.length - 2] - 1) + '이 매출 증가율 ' + pct(v3eLast(hrev) / hrev[hrev.length - 2] - 1) + '보다 크게 높음');
  }
  if (v3eNz(v3eLast(R['EQ.buyback'])) > 0 && sw.dcf_model === 'ddm') add('model_signal', 'info', '자사주 매입이 있어 배당할인모형보다 FCFF 가 맞음');
  const F = c.F;
  const rr_ty = v3eDiv(v3eLast(F.reinv), v3eLast(F.nopat)), g_roc = v3eDiv(c.g_s, F.roc_s);
  if (rr_ty != null && g_roc != null && Math.abs(rr_ty - g_roc) > 1e-6) add('stable_rr', 'warn', '종료연도 재투자율 ' + pct(rr_ty) + '이 g ÷ ROC ' + pct(g_roc) + '와 다름');
  let dr_h = [];
  for (let i = 0; i < H; i++) dr_h.push(v3eDiv(R['PPE.dep'][i], R['PPE.bop'][i]));
  dr_h = dr_h.filter((x) => x != null);
  const dr_f = v3eDiv(R['PPE.dep'][H], R['PPE.bop'][H]);
  if (dr_h.length && dr_f != null && !(0.7 * v3eMinOf(dr_h) <= dr_f && dr_f <= 1.3 * v3eMaxOf(dr_h))) {
    add('dep_rate_trend', 'info', '추정 감가상각률 ' + pct(dr_f) + '이 과거 범위(' + pct(v3eMinOf(dr_h)) + '～' + pct(v3eMaxOf(dr_h)) + ')와 크게 다름');
  }
  v3eChecksP1b(inp, c, add, pct, name);
  if (hist['IS.ebit'].slice(-3).filter((x) => x != null && x < 0).length >= 2) add('dcf_fit', 'warn', '최근 3년 가운데 2년 넘게 영업적자라 FCFF 할인이 잘 맞지 않음(적자 기업 유형 검토)');
  v3eChecksMore(inp, c, add, pct);
  v3eChecksP1a(inp, c, add, pct);
  v3eChecksP2(inp, c, add, pct);
  v3eChecksP3(inp, ctxs, add, pct);
  if (v3eT(rd) && v3eT(v3eGet(v3eGet(rd, 'pfcf', {}), 'ok')) && rd.pfcf.tv_share > 0.7) add('rdcf_tv_share', 'info', '리버스 DCF 종료가치 비중 ' + pct(rd.pfcf.tv_share));
  if (v3eT(rd) && !v3eT(v3eGet(v3eGet(rd, 'pfcf', {}), 'ok'))) add('rdcf_input', 'info', '리버스 DCF(P/FCF)를 풀 수 없음(출발 FCF 가 0 이하이거나 입력이 범위 밖)');
  for (const a of v3eOr(v3eGet(I, 'adj'), [])) {
    if (!v3eT(v3eGet(a, 'why'))) add('adj_why', 'err', '보정 항목(' + v3ePyStr(v3eGet(a, 'year')) + ' ' + v3ePyStr(v3eGet(a, 'account')) + ')에 근거 문장이 없음');
    if (!ys.includes(v3eGet(a, 'year'))) {
      add('adj_fc', 'info', v3ePyStr(v3eGet(a, 'year')) + '년 보정 ' + v3eFmt2(v3eGet(a, 'amount'), '+,.0f') + '억(' + v3ePyStr(v3eGet(a, 'account')) + ')은 진행 중인 해라 과거 평균에는 들어가지 않음');
    }
  }
  for (const n of v3eOr(v3eGet(v3eOr(v3eGet(meta, 'notes'), {}), 'info'), [])) add('input_note', 'info', n);
  keep('input_note');
  add('nominal_real', 'info', '현금흐름, 할인율, 영구성장률 모두 명목 원화 기준');
  add('rf_consistency', 'info', '무위험이자율은 원화 국고채 10년, ERP 는 Damodaran(성숙시장 프리미엄 + 한국 국가위험)');
  return out;
}

// DCF 맵 15단계의 지금 값 한 줄(화면 오른쪽 패널)
// MAP_CHECKS: 맵 단계별로 거는 점검 id
const v3eMAP_CHECKS = { '매출액': ['rev_check', 'rseg_checks', 'basis_mix', 'cons_gap', 'assump_range', 'rev_sanity', 'cons_n', 'fy1_stale'],
  '매출원가': ['gpm_range', 'ratio_jump', 'asp_vs_ucost'], '판관비': ['ratio_jump', 'sga_spike', 'labor_ratio', 'share_le_1'],
  '법인세': ['tax_outlier'], '재투자': ['capex_da', 'reinv_neg', 'nwc_jump', 'dep_rate_trend', 'ppe_xfer_sum', 'fcff_cross'],
  '재무 구조': ['neg_cash', 'rate_jump', 'circ_converge'], '자기자본비용': ['stable_beta', 'premium_evidence', 'beta_index', 'manual_missing'],
  '타인자본비용': ['kd_missing', 'kd_consistency'], '할인율 확정': ['override', 'model_rate_pair', 'stable_vs_peer', 'mcap_basis'],
  '성장 단계와 종료가치': ['g_vs_rate', 'tv_share', 'stable_rr', 'g_fallback'], '주식 수': ['shares_align', 'double_count'],
  '비주주청구권': ['ev_def_align'], '시나리오 근거': ['weights', 'upside_big'], '상대가치 결합': ['dcf_rel_gap', 'type_block'] };
v3eMAP_CHECKS['판관비'] = v3eMAP_CHECKS['판관비'].concat(['sga_resid']);
v3eMAP_CHECKS['매출액'].push('pv_hist'); // 수량 × 단가 줄의 직전 실적 수량, 단가 없음(err)
v3eMAP_CHECKS['매출원가'].push('seg_cost_hist');

// DCF, WACC, 상대가치 연결 묶음 점검(11-17)이 걸리는 단계
v3eMAP_CHECKS['자기자본비용'].push('ke_model', 'beta_px_tie');
v3eMAP_CHECKS['성장 단계와 종료가치'].push('tv_avg');
v3eMAP_CHECKS['상대가치 결합'].push('rel_scen_src');
// _map_status: 맵 단계별 상태. 그 단계 점검 가운데 err 나 warn 이 있으면 warn, 근거 없는 매출 줄이 있으면 매출액 warn
function v3eMapStatus(inp, checks) {
  const lv = new Map();
  for (const ck of checks) {
    if (!lv.has(ck.id)) lv.set(ck.id, new Set());
    lv.get(ck.id).add(ck.level);
  }
  const out = {};
  for (const step of Object.keys(v3eMAP_CHECKS)) {
    if (v3eMAP_CHECKS[step].some((i) => lv.has(i) && (lv.get(i).has('err') || lv.get(i).has('warn')))) out[step] = 'warn';
  }
  if (inp.input.revbuild.lines.some((ln) => !v3eT(v3eGet(ln, 'why')))) out['매출액'] = 'warn';
  return out;
}

function v3eMap(inp, c, wavg, blend, checks) {
  const R = c.rows, H = c.H, N = c.N, W = c.W, I = inp.input;
  const pct = v3ePct;
  const won = (x) => (x == null ? '계산 안 됨' : v3eFmt2(x, ',.0f') + '원');
  const amt = (x) => v3eFmt2(x, ',.0f');
  const why = c.notes.why;
  const rb = I.revbuild;
  const cov = W.cov == null ? '확인 불가' : v3eFmt2(W.cov, ',.1f');
  const used = v3eGet({ regression: '회귀 베타', bottom_up: '바텀업 베타', manual: '직접 입력' }, W.beta_used, '') + (v3eT(W.floored) ? ', 하한 적용' : '');
  const m = [['내러티브', '매출액', v3ePyStr(c.years_f[0]) + '년 ' + amt(R['REV.total'][H]) + '억에서 ' + v3ePyStr(v3eLast(c.years_f)) + '년 ' + amt(v3eLast(R['REV.total'])) + '억, 줄 ' + rb.lines.length + '개', 'revbuild 줄별 근거'],
    ['내러티브', '매출원가', '원가율 ' + pct(R['OPX.cogs_r'][H]) + '에서 ' + pct(v3eLast(R['OPX.cogs_r'])), v3eOr(v3eGet(why, 'cogs_r'), '리서치 값')],
    ['내러티브', '판관비', '판관비율 ' + pct(R['OPX.sga_r'][H]) + '에서 ' + pct(v3eLast(R['OPX.sga_r'])), '묶음별 드라이버'],
    ['내러티브', '법인세', '유효세율 ' + pct(R['CTL.a.tax_eff'][0]) + ', 종료연도 ' + pct(v3eLast(c.F.tax_r)), v3eOr(v3eGet(why, 'tax_eff'), '')],
    ['내러티브', '재투자', 'CAPEX ' + amt(R['DCF.capex'][0]) + '억에서 ' + amt(R['DCF.capex'][N - 1]) + '억, 마지막 해 ROIC ' + pct(v3eLast(c.X.roic)), v3eOr(v3eGet(why, 'capex_maint_pct'), '')],
    ['내러티브', '재무 구조', '이자부부채 ' + amt(R['DEBT.ibd'][H - 1]) + '억, 배당성향 ' + pct(R['CTL.a.payout'][0]), v3eOr(v3eGet(why, 'debt_rate'), '')],
    ['할인율', '자기자본비용', 'Ke ' + pct(W.ke, 2) + '(rf ' + pct(c.rf, 2) + ', 베타 ' + v3eFmt2(W.beta, '.2f') + ', ERP ' + pct(c.erp, 2) + ')', used],
    ['할인율', '타인자본비용', '세전 ' + pct(W.kd_pre, 2) + '(합성 등급 ' + v3ePyStr(W.rating) + ', 이자보상배율 ' + cov + '배)', W.kd_path],
    ['할인율', '할인율 확정', 'WACC ' + pct(W.wacc, 2) + ', 안정기 ' + pct(W.wacc_s, 2) + ', 부채 비중 ' + pct(W.wd), ''],
    ['종료가치', '성장 단계와 종료가치', '전환 ' + v3ePyStr(c.M) + '년, 영구성장률 ' + pct(c.g_s, 2) + ', 종료가치 비중 ' + pct(c.out.tv_share), ''],
    ['내재 가치', '비영업자산', '현금성자산 ' + amt(R['DCF.cash'][0]) + '억 + 비영업자산 ' + amt(R['DCF.nonop'][0]) + '억', ''],
    ['내재 가치', '비주주청구권', '이자부부채 ' + amt(R['DCF.debt'][0]) + '억, 비지배지분 ' + amt(R['DCF.nci'][0]) + '억', ''],
    ['내재 가치', '주식 수', amt(R['DCF.shares'][0]) + '주', ''],
    ['마무리', '시나리오 근거', '가중평균 ' + won(v3eGet(wavg, 'ps')), ''],
    ['마무리', '상대가치 결합', '목표주가 ' + won(v3eGet(v3eOr(blend, {}), 'target')) + '(DCF ' + pct(v3eNz(v3eGet(v3eOr(blend, {}), 'w_dcf'), inp.switches.blend_w), 0) + ')', '']];
  // 단계 상태: 그 단계에 걸린 경고나 오류 점검이 있으면 「확인 필요」(warn). 맵이 늘 완료로만 나오던 것을 고침
  const st = v3eMapStatus(inp, checks != null ? checks : c.checks);
  return m.map(([g, s, v, w]) => ({ group: g, step: s, status: v3eGet(st, s, 'done'), value_text: v, why: w }));
}

function v3eScenSummary(c) {
  const o = c.out;
  return { ps: o.ps, ps_raw: o.ps_raw, up: o.up, ev: o.ev, eq: o.eq, wacc: o.wacc, wacc_s: o.wacc_s, ke: o.ke,
    beta: o.beta, g_s: o.g_s, tv: o.tv, pv_tv: o.pv_tv, tv_share: o.tv_share, fcff: o.fcff };
}

// ── run_all 몸통(E20～E24). all = v3eRunAll이 만든 묶음. 단계끼리 넘길 값: all.runs[S](시나리오별 문맥), all.snap(Base의 E14 직후 문맥) ──
// E20: 세 시나리오, 요약, 가중평균, SCN 행
function step_scenarios(all) {
  const inp = all.inp;
  const ctxs = {};
  for (const S of V3E.SCEN) {
    if (S === 'Base') {
      const b = v3eBaseRun(inp);
      ctxs[S] = b.c; all.snap = b.snap;
    } else ctxs[S] = v3eRun(inp, S);
  }
  const base = ctxs.Base;
  const H = base.H, N = base.N;
  const scen = {};
  for (const S of V3E.SCEN) scen[S] = v3eScenSummary(ctxs[S]);
  const wavg = v3eWeighted(inp, scen);
  const scn = {};                                     // 시나리오 결과 행(SCN). 세 시나리오 rows 에 같은 값을 넣어 둠
  for (const S of V3E.SCEN) {
    const R = ctxs[S].rows;
    for (const [k, v] of [['ps', scen[S].ps], ['up', scen[S].up], ['ev', scen[S].ev],
      ['eq', scen[S].eq], ['wacc', scen[S].wacc], ['tv_share', scen[S].tv_share],
      ['rev_last', v3eLast(R['REV.total'])], ['ebit_m_last', v3eLast(R['OPX.ebit_m'])],
      ['ni_fy1', R['IS.ni_parent'][H]], ['ni_fy2', N > 1 ? R['IS.ni_parent'][H + 1] : null]]) {
      scn['SCN.' + S + '.' + k] = [v === undefined ? null : v];
    }
  }
  scn['SCN.wavg.ps'] = [wavg.ps];
  for (const S of V3E.SCEN) {
    all.runs[S] = ctxs[S];
    all.py.rows[S] = Object.assign({}, ctxs[S].rows, scn);
    for (const rid in scn) ctxs[S].labels[rid] = { cols: 'one' };
    all.py.scen[S] = scen[S];
  }
  all.py.wavg = wavg;
}

// E21: 민감도 표와 토네이도
function step_sensitivity(all) {
  all.py.sens = v3eSensitivities(all.inp, all.runs.Base, all.snap, null);
}

// E22: 리버스 DCF 닫힌 식. 모델 리버스는 사례의 값(py.rdcf.model)이 있으면 그대로 넘김(다시 계산은 V3E.reverseModel)
function step_reverse(all) {
  const rd = v3eReverse(all.inp, all.runs.Base, false);
  const m0 = v3eGet(v3eOr(v3eGet(v3eOr(v3eGet(all.inp, 'py'), {}), 'rdcf'), {}), 'model');
  if (m0 != null) rd.model = m0;
  all.py.rdcf = rd;
}

// engine.py REL_TOKEN, typ_block(sw)
const V3E_REL_TOKEN = { 'PER': 'per', 'PBR': 'pbr', 'PSR': 'psr', 'EV/EBITDA': 'ev_ebitda', 'EV/EBIT': 'ev_ebit', 'EV/Sales': 'ev_sales' };
function v3eTypBlock(sw) {
  return new Set(v3ePyStr(v3eOr(v3eGet(sw, 'typ_block'), '')).split(',').map((x) => x.trim()).filter((x) => x));
}

// engine.py blend_calc: E23 결합. 회사 유형이 general 이 아니고 유형별 주당 가치(py.typ.ps)가 있으면 DCF 자리에 그 값을 씀.
// 유형에서 막은 상대가치 배수(sw.typ_block)는 결합에서 뺌. general 이면 예전과 같음. { blend, summ }를 돌려줌
function v3eBlendCalc(inp, wavg, base, typ) {
  const sw = inp.switches, I = inp.input;
  const H = base.H, N = base.N;
  const close = v3eGet(inp.target, 'close');
  const rel = v3eOr(v3eGet(I, 'rel'), {});
  let rel_ps = v3eGet(v3eOr(v3eGet(rel, 'ps'), {}), 'median');
  const w = Number(sw.blend_w);
  let dcf_raw = null, dcf_ps = null, src = 'dcf';
  if (v3eT(wavg.ok)) { dcf_raw = wavg.ps_raw; dcf_ps = wavg.ps; }
  const blk = v3eTypBlock(sw);
  const ctype = v3eOr(v3eGet(sw, 'company_type'), 'general');
  let rel_blocked = false;
  if (ctype !== 'general') {
    const ty = v3eOr(typ, {});
    const tps = v3eGet(ty, 'ps');
    if (tps != null) {
      const sub = v3eOr(v3eGet(ty, ctype), {});
      const traw = v3eGet(v3eOr(v3eGet(sub, 'summary'), {}), 'ps_raw');
      dcf_raw = traw != null ? traw : tps; dcf_ps = tps; src = v3eOr(v3eGet(ty, 'method'), ctype);
    } else if (blk.has('fcff') || blk.has('dcf_consolidated')) {
      dcf_raw = null; dcf_ps = null; src = 'blocked';
    }
    if (v3eT(rel_ps) && blk.has(v3eGet(V3E_REL_TOKEN, v3eGet(rel, 'method')))) { rel_ps = null; rel_blocked = true; }
  }
  let tgt;
  if (dcf_raw != null && v3eT(rel_ps)) tgt = v3eRound(dcf_raw * w + rel_ps * (1 - w), sw.round);
  else if (dcf_raw != null) tgt = src !== 'dcf' ? v3eRound(dcf_raw, sw.round) : dcf_ps;
  else if (v3eT(rel_ps) && src === 'blocked') tgt = v3eRound(rel_ps, sw.round);
  else tgt = null;
  const w_dcf = src === 'blocked' ? 0.0 : (v3eT(rel_ps) ? w : 1.0);
  const blend = { w_dcf, dcf: dcf_ps, rel: v3eT(rel_ps) ? v3eRound(rel_ps, sw.round) : null, target: tgt,
    up: v3eT(tgt) && v3eT(close) ? tgt / close - 1 : null, dcf_src: src, rel_blocked };
  const eps = [];
  for (let k = 0; k < Math.min(2, N); k++) eps.push(v3eDiv(base.rows['IS.ni_parent'][H + k] * 1e8, base.shares));
  const ebitda = base.rows['OPX.ebitda'];
  const net_claims = base.rows['DCF.debt'][0] + base.rows['DCF.nci'][0] - base.rows['DCF.cash'][0] - base.rows['DCF.nonop'][0];
  const summ = { 'SUM.target': [tgt], 'SUM.up': [blend.up], 'SUM.dcf': [dcf_ps], 'SUM.rel': [blend.rel],
    'SUM.implied_pe': [v3eT(tgt) ? v3eDiv(tgt, eps[0]) : null], 'SUM.implied_pe_fy2': [v3eT(tgt) && eps.length > 1 ? v3eDiv(tgt, eps[1]) : null],
    'SUM.implied_ev_ebitda': [v3eT(tgt) ? v3eDiv(tgt * base.shares / 1e8 + net_claims, ebitda[H]) : null] };
  return { blend, summ };
}

// engine.py blend_checks: 결합 점검(유형별). general 이면 없음
function v3eBlendChecks(inp, blend) {
  const sw = inp.switches;
  if (v3eOr(v3eGet(sw, 'company_type'), 'general') === 'general') return [];
  const out = [];
  const rel = v3eOr(v3eGet(inp.input, 'rel'), {});
  const src = v3eGet(blend, 'dcf_src');
  if (src === 'blocked') out.push({ id: 'type_block', level: 'warn', text: '유형별 주당 가치가 없어 연결 DCF를 목표주가에서 뺌', value: null });
  else if (src !== 'dcf') out.push({ id: 'type_block', level: 'info', text: '목표주가의 DCF 자리에 유형별 주당 가치 ' + v3eFmt2(blend.dcf, ',.0f') + '원을 씀. 방법: ' + v3ePyStr(blend.dcf_src) + ', Base 기준', value: blend.dcf });
  if (v3eT(v3eGet(blend, 'rel_blocked'))) out.push({ id: 'type_block', level: 'info', text: '상대가치 평가 배수 ' + v3ePyStr(v3eGet(rel, 'method')) + '는 이 유형에서 쓰지 않아 결합에서 뺌', value: null });
  return out;
}

// E23: 상대가치 결합, SUM 행, 풋볼필드. 파이썬은 run_all 에서 general 규칙으로 결합한 뒤 run.py 가 apply_typ 로 다시 쓰지만,
// JS는 처음부터 사례의 py.typ가 있으니 blend_calc(inp, wavg, base, typ) 한 번으로 같은 결과를 냄(풋볼필드는 유형과 무관)
function step_blend(all) {
  const inp = all.inp, base = all.runs.Base, scen = all.py.scen, wavg = all.py.wavg;
  const sw = inp.switches, I = inp.input;
  const rel = v3eOr(v3eGet(I, 'rel'), {});
  const rel_ps = v3eGet(v3eOr(v3eGet(rel, 'ps'), {}), 'median');
  const { blend, summ } = v3eBlendCalc(inp, wavg, base, all.py.typ);
  for (const S of V3E.SCEN) {
    Object.assign(all.py.rows[S], summ);
    for (const rid in summ) all.runs[S].labels[rid] = { cols: 'one' };
  }
  const ff = [{ label: '52주 최저～최고', lo: v3eGet(inp.target, 'low52'), hi: v3eGet(inp.target, 'high52'), kind: 'market' }];
  const goals = v3eOr(v3eGet(inp.target, 'broker_targets'), []).filter((b) => v3eT(v3eGet(b, 'goal'))).map((b) => b.goal);
  if (goals.length) ff.push({ label: '증권사 목표가', lo: v3eMinOf(goals), hi: v3eMaxOf(goals), kind: 'broker' });
  ff.push({ label: 'DCF Bear～Bull', lo: scen.Bear.ps, hi: scen.Bull.ps, kind: 'dcf' });
  const rm = v3eRelModel(inp, all.runs);
  if (v3eT(rel_ps)) {
    let rs = v3eOr(v3eGet(rel, 'scen'), {});
    if (v3eGet(sw, 'rel_scen_src') === 'model' && rm != null && v3eT(rm.ps.Bear) && v3eT(rm.ps.Bull)) rs = rm.ps;   // 상대가치 Bull, Bear 를 엔진 시나리오 실적으로
    let lo, hi;
    if (v3eT(v3eGet(rs, 'Bear')) && v3eT(v3eGet(rs, 'Bull'))) { lo = rs.Bear; hi = rs.Bull; }
    else { lo = v3eGet(v3eOr(v3eGet(rel, 'ps'), {}), 'q25'); hi = v3eGet(v3eOr(v3eGet(rel, 'ps'), {}), 'q75'); }
    ff.push({ label: '상대가치 ' + v3ePyStr(v3eGet(rel, 'method')) + '(' + v3ePyStr(v3eGet(rel, 'period')) + ')', lo: v3eRound(lo, sw.round), hi: v3eRound(hi, sw.round), kind: 'rel' });
  }
  // engine.apply_typ 의 ff_typ: 유형별 주당 가치 줄을 DCF 줄 뒤에 넣고, 결합에서 뺀 상대가치 줄은 지움(general 이면 바뀌는 것 없음)
  if (v3eT(blend.rel_blocked)) for (let i = ff.length - 1; i >= 0; i--) if (ff[i].kind === 'rel') ff.splice(i, 1);
  if (blend.dcf_src !== 'dcf' && blend.dcf_src !== 'blocked' && blend.dcf != null) {
    let i = ff.findIndex((r) => r.kind === 'dcf');
    if (i < 0) i = ff.length - 1;
    ff.splice(i + 1, 0, { label: '유형별 주당 가치(Base)', lo: blend.dcf, hi: blend.dcf, kind: 'typ' });
  }
  // run.py compute(): 몬테카를로 25～75% 줄을 DCF 줄 바로 아래에(몬테카를로 값은 사례의 py.mc)
  const m = all.py.mc;
  if (v3eT(v3eGet(sw, 'mc')) && v3eT(m)) {
    if (v3eGet(m, 'p25') != null && v3eGet(m, 'p75') != null) {
      const unit = sw.round;
      const row = { label: 'DCF 몬테카를로 25～75%', lo: v3eRound(m.p25, unit), hi: v3eRound(m.p75, unit), kind: 'mc' };
      let i = ff.findIndex((r) => r.kind === 'dcf');
      if (i < 0) i = ff.length - 1;
      ff.splice(i + 1, 0, row);
    }
  }
  all.py.blend = blend;
  all.py.ff = ff;
  all.py.rel_model = rm;
  all.py.wacc_matrix = v3eWaccMatrix(base);
}

// E24: 점검과 DCF 맵. run.py compute_inp()가 뒤에 붙이는 C 모듈 점검은 사례의 py 값으로 같은 순서로 붙임:
// py.typ 점검, 결합 점검(blend_checks), py.rel_plus 점검(dcf_rel_gap 뺌), py.lbo 점검, py.mc 점검
// (C 모듈이 실패했을 때의 typ_error, rel_plus_error, lbo_error, mc_error는 파이썬만 알 수 있어 붙이지 않음)
function step_checks(all) {
  const inp = all.inp, sw = inp.switches;
  const checks = v3eChecks(inp, all.runs, all.py.scen, all.py.wavg, all.py.rdcf);
  let extra = [];
  const typ = all.py.typ;
  if (v3eT(typ)) extra = extra.concat(v3eOr(v3eGet(typ, 'checks'), []));
  extra = extra.concat(v3eBlendChecks(inp, all.py.blend)); // 유형 계산이 없어도 결합 규칙(막은 방법)과 점검은 남김(run.py apply_typ(inp, res, None))
  const rp = all.py.rel_plus;
  if (v3eT(rp)) extra = extra.concat(v3eOr(v3eGet(rp, 'checks'), []).filter((x) => v3eGet(x, 'id') !== 'dcf_rel_gap'));
  const lb = all.py.lbo;
  if (v3eT(lb)) extra = extra.concat(v3eOr(v3eGet(lb, 'checks'), []));
  const m = all.py.mc;
  if (v3eT(v3eGet(sw, 'mc')) && v3eT(m)) extra = extra.concat(v3eOr(v3eGet(m, 'checks'), []));
  all.checks = checks.concat(extra.map((x) => ({ id: v3eGet(x, 'id'), level: v3eGet(x, 'level', 'info'), text: v3eGet(x, 'text', ''), value: v3eGet(x, 'value') })));
  all.map = v3eMap(inp, all.runs.Base, all.py.wavg, all.py.blend, checks); // 맵 상태는 엔진 점검(E24)만 봄
}

v3eReg('E20', 'scenarios', step_scenarios);
v3eReg('E21', 'sensitivity', step_sensitivity);
v3eReg('E22', 'reverse', step_reverse);
v3eReg('E23', 'blend', step_blend);
v3eReg('E24', 'checks', step_checks);

// 민감도 다시 계산: 덮기 ov를 적용한 Base에서 표 세 개와 토네이도(py.sens와 같은 모양). steps = {wacc, g, margin, growth} 간격(없으면 sw.sens_step)
// full이 참이면 모든 칸을 통째로 다시 계산(줄인 경로와 값이 같은지 볼 때)
V3E.sens = function (inp, ov, steps, full) {
  const inp2 = v3eApplyOverrides(inp, ov);
  const b = v3eBaseRun(inp2);
  return v3eSensitivities(inp2, b.c, v3eT(full) ? null : b.snap, steps);
};
// 모델 리버스: 목표 가격이 되는 매출 성장률 가산값(이분법 50회, 엔진 53번). py.rdcf.model과 같은 모양. 목표 가격이 없으면 null
V3E.reverseModel = function (inp, ov) {
  const inp2 = v3eApplyOverrides(inp, ov);
  return v3eGet(v3eReverse(inp2, v3eRun(inp2, 'Base'), true), 'model');
};

// 끝: E01～E24가 모두 구현되고 대조(_v3_parity.mjs: 전체 대조 0건, 덮기 43건, 속도)를 통과한 판이라 ready를 true로 둠.
// engine.py가 바뀌면 조각을 다시 맞추고 대조를 통과시킨 뒤에만 true로 둔다(그 전에는 false로 두면 화면이 c.py를 그대로 보여 줌)
V3E.ready = true;
if (typeof module !== 'undefined' && module.exports) module.exports = V3E;
