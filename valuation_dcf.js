/* 투자업무 › 가치평가 › DCF (Valley AI 「DCF 실전형」 구성, v2).
   데이터: OneDrive data/valuation_dcf.json {updated_at, cases: [dcf_web.json, ...]}. 05. 딜소싱\_자동화\가치평가 에서 dcf.py run 뒤 publish.py 로 올린다.
   계산 dcfWacc(), dcfCompute(), dcfWeighted(), dcfSens(), dcfReverse()는 dcf.py wacc_parts(), compute(), weighted(), sensitivities(), reverse()와
   같은 순서, 같은 식이다. 고치면 dcf.py, 엑셀 수식과 같이 고친다. 추정 기간을 바꾸면 dcf.py build()처럼 years와 할인 기간을 다시 만든다.
   처음 값으로 낸 결과를 사례의 py 값(파이썬 결과)과 맞춰 보고(dcfVerify), 다르면 점검 칸에 오류로 띄운다.
   valuation.js renderValuation()이 #valuation/dcf 에서 renderDcf(#va-host)를 부른다. 파일 순서에 흔들리지 않게 vaXxx 함수는 부르지 않는다.
   app.js 전역($, esc, pad, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn), graph.js STORE·G, market.css(.mk-*)와 valuation.css(.va-*) 클래스를 쓴다. */
const DCF_FILE = 'data/valuation_dcf.json';
const DCF_TTL = 600000;
const DCF_SCEN = ['Bull', 'Base', 'Bear'];
const DCF_PATH = { compound: '고성장기', linear: '초기 성숙기', log: '완전 성숙기' };
const DCF_SVAR = { wacc: ['WACC', 0.01, 0.2, 0.0005], g: ['영구성장률', 0, 0.06, 0.0005], ty_margin: ['종료연도 세후 영업이익률', 0, 0.6, 0.005] };
const dcfS = { data: null, at: 0, loading: null, err: '', cid: null, st: {} };
Object.assign(dcfS, viewGet('dcf2', {}));
const dcfSave = () => viewSet('dcf2', { cid: dcfS.cid, st: dcfS.st });

function dcfLoad(force) {
  if (!force && dcfS.at && Date.now() - dcfS.at < DCF_TTL) return Promise.resolve();
  dcfS.loading ||= STORE.readText(DCF_FILE)
    .then((r) => { dcfS.data = r.text ? JSON.parse(r.text) : null; dcfS.err = ''; dcfS.at = Date.now(); })
    .catch((e) => { dcfS.data = null; dcfS.err = e instanceof SyntaxError ? 'DCF 파일을 읽지 못했습니다.' : e.message; })
    .finally(() => { dcfS.loading = null; });
  return dcfS.loading;
}

// ---------- 포맷 ----------
const dcfNum = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '-' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const dcfPct = (v, d = 1) => (v == null || !Number.isFinite(+v) ? '-' : `${dcfNum(v * 100, d)}%`);
const dcfWon = (v) => (v == null ? '-' : `${dcfNum(v)}원`);
const dcfX = (v, d = 2) => (v == null || !Number.isFinite(+v) ? '-' : `${dcfNum(v, d)}배`);
const dcfUp = (u, d = 1) => (u == null ? '' : `<span class="${u > 0 ? 'up' : u < 0 ? 'dn' : ''}">${u > 0 ? '+' : ''}${dcfNum(u * 100, d)}%</span>`);
const dcfEok = (v) => (v == null ? '-' : `${dcfNum(v)}억`);
const dcfSgn = (v) => (v == null ? '-' : `${v < 0 ? '−' : '+'}${dcfNum(Math.abs(v))}억`);
const dcfFi = (x, sc = 100, d = 2) => (x == null || !Number.isFinite(x) ? '' : String(+(x * sc).toFixed(d))); // 입력 칸에 넣을 처음 값
const dcfNumOf = (s) => vaNumIn(s, '*'); // valuation.js. 쉼표와 12%, 3배 같은 단위 꼬리는 읽고 못 읽으면 null
/* 못 읽는 값 표시: 칸에 aria-invalid와 칸 아래 「숫자 확인」. 계산은 처음 값. 치는 동안(dcfS.typing)은 표시하지 않고 칸을 나갈 때 붙임 */
const dcfEId = (k) => `dcfe-${String(k).replace(/[^A-Za-z0-9_-]/g, '_')}`;
function dcfBadMark(el) {
  const box = el.closest('.dcf-iw') || el; if (box.nextElementSibling?.classList.contains('dcf-inv')) return;
  const t = document.createElement('span'); t.className = 'dcf-inv'; t.id = dcfEId(el.dataset.k); t.textContent = '숫자 확인'; box.after(t);
  el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', t.id);
}
const dcfSec = (title, right, body, cls = '', id = '') => `<section class="card mk-sec ${cls}"${id ? ` id="${id}"` : ''}><div class="card-head"><h2>${title}</h2>${right || ''}</div><div class="mk-body">${body}</div></section>`;
const dcfSeg = (key, opts, cur) => `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-dcf-seg="${key}" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;

// ---------- 계산 (dcf.py 와 같은 식) ----------
const dcfRound = (x, unit) => Math.floor(x / unit + 0.5) * unit;
const dcfLerp = (se, k, n) => { const [s, e] = se; return n === 1 ? s : s + (e - s) * k / (n - 1); };
const dcfMed = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

function dcfWacc(inp, ov) {
  const W = inp.wacc, t = ov.tax_m ?? W.tax_m, rf = ov.rf ?? W.rf, erp = ov.erp ?? W.erp, extra = ov.extra ?? W.extra, mode = W.beta_mode;
  let bu;
  if (mode === 'regression') bu = W.beta_reg / (1 + (1 - t) * W.de);
  else if (mode === 'bottom_up') bu = dcfMed(W.peers.map(([b, de]) => b / (1 + (1 - t) * de)));
  else bu = W.beta_input / (1 + (1 - t) * W.de);
  if (ov.beta_u != null) bu = ov.beta_u;
  const aw = ov.adj_w ?? W.adj_w;
  let buAdj = aw * bu + (1 - aw), beta = buAdj * (1 + (1 - t) * W.de);
  if (mode === 'input' && ov.beta_u == null) { buAdj = bu; beta = W.beta_input; } // 직접 입력한 베타(재차입 베타)는 조정 없이 그대로
  if (ov.beta != null) beta = ov.beta;
  const ke = rf + beta * erp + extra;
  const kd = ov.kd != null ? ov.kd : W.kd_mode === 'input' ? W.kd_input : rf + (ov.spread ?? W.spread);
  const wd = W.D / (W.D + W.E);
  let wacc = (1 - wd) * ke + wd * kd * (1 - t);
  if (ov.wacc != null) wacc = ov.wacc;
  return { tax_m: t, rf, erp, extra, beta_u: bu, beta_u_adj: buAdj, beta, ke, kd, kd_at: kd * (1 - t), wd, we: 1 - wd, wacc };
}

// inp: dcf_web.json 의 inp. sc: Bull, Base, Bear. ov: 바꿔 볼 값(할인율 tax_m, rf, erp, extra, beta_u, beta, adj_w, spread, kd, wacc / 경로 growth, cogs, opex, rr, turn0, roic_end, tax_eff / 종료가치 g, roic_lt, ty_margin)
function dcfCompute(inp, sc = 'Base', ov = {}) {
  const S = { ...inp.scen[sc] };
  for (const k of ['growth', 'cogs', 'opex', 'rr', 'g', 'roic_lt', 'turn0', 'roic_end']) if (k in ov) S[k] = ov[k];
  const w = dcfWacc(inp, ov), wacc = w.wacc;
  const te = ov.tax_eff ?? inp.tax_eff, g = S.g;
  const roicLt = S.roic_lt != null ? S.roic_lt : wacc;
  const N = inp.N, mN = 1 - S.cogs[1] - S.opex[1];
  const rows = [];
  let prev = inp.rev0, icPrev = inp.ic0, dfPrev = 1.0, tPrev = 0.0;
  for (let k = 0; k < N; k++) {
    const gk = dcfLerp(S.growth, k, N), rev = prev * (1 + gk);
    const cg = dcfLerp(S.cogs, k, N), ox = dcfLerp(S.opex, k, N), m = 1 - cg - ox, op = rev * m, nopat = op * (1 - te);
    let turn, ic, reinv, rr;
    if (inp.reinvest === 'ic') {
      const turnEnd = S.roic_end / (mN * (1 - te));
      turn = dcfLerp([S.turn0, turnEnd], k, N);
      ic = rev / turn; reinv = ic - icPrev; rr = reinv / rev;
    } else {
      const rrEnd = S.rr[1] != null ? S.rr[1] : g / roicLt * mN * (1 - te);
      rr = dcfLerp([S.rr[0], rrEnd], k, N);
      reinv = rev * rr; ic = icPrev + reinv; turn = rev / ic;
    }
    const fcff = nopat - reinv, f = k === 0 ? inp.stub : 1.0, t = inp.t[k];
    const df = dfPrev * (1 + wacc) ** (-(t - tPrev)); // 누적 곱(dcf.py와 같음)
    rows.push({ year: inp.years[k], growth: gk, rev, cogs_r: cg, opex_r: ox, margin: m, op, tax: op * te, nopat, rr, reinv, ic, turn, roic: ic ? nopat / ic : null,
      fcff, f, cf: fcff * f, t, df, pv: fcff * f * df });
    prev = rev; icPrev = ic; dfPrev = df; tPrev = t;
  }
  const pvSum = rows.reduce((a, r) => a + r.pv, 0), last = rows[rows.length - 1];
  const tyM = ov.ty_margin ?? mN * (1 - te);
  const revTy = last.rev * (1 + g), nopatTy = revTy * tyM, reinvTy = g / roicLt * nopatTy, fcffTy = nopatTy - reinvTy;
  const ok = wacc > g;
  const tv = ok ? fcffTy / (wacc - g) : null, pvTv = ok ? tv * last.df : null;
  const B = inp.bridge, ev = ok ? pvSum + pvTv : null, eq = ok ? ev + B.cash + B.nonop - B.debt - B.nci : null;
  const psRaw = ok ? eq * 1e8 / B.shares : null, ps = ok ? dcfRound(psRaw, inp.round) : null;
  return { ...w, tax_eff: te, g, roic_lt: roicLt, rows, pv_sum: pvSum, ty: { rev: revTy, margin: tyM, nopat: nopatTy, reinv: reinvTy, fcff: fcffTy },
    tv, pv_tv: pvTv, ev, eq, ps_raw: psRaw, ps, tv_share: ok && ev ? pvTv / ev : null, up: ok && inp.close ? ps / inp.close - 1 : null };
}

function dcfWeighted(inp, res, weights) { // 가중치 합이 100%가 아니면 계산하지 않음
  const tot = DCF_SCEN.reduce((a, s) => a + (weights[s] || 0), 0);
  if (Math.abs(tot - 1) > 1e-6 || DCF_SCEN.some((s) => weights[s] && res[s].ps_raw == null)) return { ok: false, sum: tot, ps: null, ps_raw: null, up: null };
  const raw = DCF_SCEN.reduce((a, s) => a + (weights[s] || 0) * res[s].ps_raw, 0), ps = dcfRound(raw, inp.round);
  return { ok: true, sum: tot, ps_raw: raw, ps, up: ps / inp.close - 1 };
}

// 이중 변수 민감도. dcf.py는 Base와 처음 값, 화면은 고른 시나리오와 지금 입력을 가운데로
function dcfSens(inp, base, step, sc = 'Base', ov = {}) {
  const d = [-2 * step, -step, 0, step, 2 * step];
  const ws = d.map((x) => base.wacc + x), gs = d.map((x) => base.g + x), ms = d.map((x) => base.ty.margin + x);
  return { step, wacc: ws, g: gs, ty_margin: ms,
    wacc_g: ws.map((w) => gs.map((g) => dcfCompute(inp, sc, { ...ov, wacc: w, g }).ps)),
    wacc_margin: ws.map((w) => ms.map((m) => dcfCompute(inp, sc, { ...ov, wacc: w, ty_margin: m }).ps)) };
}

// 리버스 DCF(P/FCF): P = Σ F_t/(1+r)^t + F_n × M/(1+r)^n 을 g로 풂. 이분법 200회(dcf.py와 같음)
function dcfReverse(R, ov = {}) {
  const P = ov.price ?? R.price, F0 = ov.f0 ?? R.f0, n = ov.n ?? R.n, M = ov.multiple ?? R.multiple, r = ov.r ?? R.r, path = ov.path ?? R.path;
  const npm = ov.npm ?? R.npm, conv = ov.conv ?? R.conv;
  if (F0 == null || F0 <= 0 || r <= 0) return { ok: false };
  const val = (g) => {
    const Fn = F0 * (1 + g) ** n;
    let s = 0.0;
    for (let t = 1; t <= n; t++) {
      let F;
      if (path === 'linear') F = F0 + (Fn - F0) * t / n;
      else if (path === 'log') F = F0 + (Fn - F0) * Math.log(1 + t) / Math.log(1 + n);
      else F = F0 * (1 + g) ** t;
      s += F / (1 + r) ** t;
    }
    return s + Fn * M / (1 + r) ** n;
  };
  let lo = -0.9, hi = 3.0;
  if ((val(lo) - P) * (val(hi) - P) > 0) return { ok: false };
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if ((val(mid) - P) * (val(lo) - P) <= 0) hi = mid; else lo = mid; }
  const g = (lo + hi) / 2, Fn = F0 * (1 + g) ** n, Sn = Fn / (npm * conv), gs = (Sn / R.s0) ** (1 / n) - 1, tvPv = Fn * M / (1 + r) ** n;
  return { ok: true, g_fcf: g, g_sales: gs, fn: Fn, sn: Sn, tv_share: tvPv / P, rev_path: Array.from({ length: n }, (_, i) => R.s0 * (1 + gs) ** (i + 1) * R.shares / 1e8) };
}

// 추정 기간을 바꾼 inp(dcf.py build: years = 직전 결산 다음 해부터, 기말 할인 기간 = k + 1 − 결산 뒤 지난 기간)
function dcfHorizon(b, N) {
  if (N === b.N) return b;
  const el = b.elapsed, te = Array.from({ length: N }, (_, k) => k + 1 - el), mid = Math.abs(b.t[0] - b.t_end[0]) > 1e-12;
  return { ...b, N, years: Array.from({ length: N }, (_, k) => b.rev0_year + 1 + k), t_end: te, t: mid ? [te[0] / 2, ...te.slice(1).map((x) => x - 0.5)] : te };
}

// 처음 값 계산이 파이썬 결과(c.py, c.reverse.py)와 같은지. JSON이 소수 10자리라 상대 오차 1e-7까지는 같다고 봄. 원 단위 값은 똑같아야 함
function dcfVerify(c) {
  if (c._v) return c._v;
  const p = c.py, bad = [];
  let n = 0, max = 0;
  if (!p?.scen) return (c._v = { ok: true, n, max, bad });
  const near = (lab, a, x) => {
    if (a == null && x == null) return;
    n++;
    const d = a == null || x == null ? Infinity : Math.abs(a - x) / Math.max(1, Math.abs(x));
    if (d > max) max = d;
    if (d > 1e-7) bad.push(`${lab} 화면 ${a} 파이썬 ${x}`);
  };
  const same = (lab, a, x) => { n++; if (a !== x) bad.push(`${lab} 화면 ${a} 파이썬 ${x}`); };
  const deep = (lab, a, x) => {
    if (x != null && typeof x === 'object') { for (const k of Object.keys(x)) deep(`${lab} ${k}`, a?.[k], x[k]); return; }
    if (typeof x === 'number' || x == null) near(lab, a, x);
  };
  const res = {};
  for (const s of DCF_SCEN) {
    if (!p.scen[s]) continue;
    const r = (res[s] = dcfCompute(c.inp, s, {}));
    same(`${s} 주당 가치`, r.ps, p.scen[s].ps);
    for (const [k, x] of Object.entries(p.scen[s])) if (k !== 'ps') deep(`${s} ${k}`, r[k], x);
  }
  if (p.wavg && res.Base) { const w = dcfWeighted(c.inp, res, c.inp.weights); same('가중평균', w.ps, p.wavg.ps); near('가중평균 원값', w.ps_raw, p.wavg.ps_raw); }
  if (p.sens && res.Base) {
    const s = dcfSens(c.inp, res.Base, p.sens.step);
    for (const k of ['wacc', 'g', 'ty_margin']) (p.sens[k] || []).forEach((x, i) => near(`민감도 ${k} ${i}`, s[k][i], x));
    for (const k of ['wacc_g', 'wacc_margin']) (p.sens[k] || []).forEach((row, i) => row.forEach((x, j) => same(`민감도 ${k} ${i},${j}`, s[k][i][j], x)));
  }
  for (const [nm, x] of Object.entries(p.alt || {})) {
    let r = null;
    if (nm === '바텀업 베타') r = dcfCompute({ ...c.inp, wacc: { ...c.inp.wacc, beta_mode: 'bottom_up' } });
    else if (nm === '조정 안 한 회귀 베타') r = dcfCompute(c.inp, 'Base', { adj_w: 1.0 });
    else if (nm === '10년 추정') r = dcfCompute(dcfHorizon(c.inp, 10));
    else if (nm === '무위험이자율 기준일 값' && c.market?.rf?.value != null) r = dcfCompute(c.inp, 'Base', { rf: c.market.rf.value });
    if (r) { same(`${nm} 주당 가치`, r.ps, x.ps); near(`${nm} WACC`, r.wacc, x.wacc); }
  }
  if (c.reverse?.py?.ok) {
    const r = dcfReverse(c.reverse.inp);
    for (const k of ['g_fcf', 'g_sales', 'fn', 'sn', 'tv_share']) near(`리버스 ${k}`, r[k], c.reverse.py[k]);
    (c.reverse.py.rev_path || []).forEach((x, i) => near(`리버스 매출 ${i + 1}`, r.rev_path?.[i], x));
  }
  c._v = { ok: !bad.length, n, max, bad };
  if (bad.length) console.warn('DCF 화면 계산이 파이썬 결과와 다름', c.id, bad);
  return c._v;
}

// ---------- 화면 상태와 모델 ----------
const dcfCase = () => { const cs = dcfS.data?.cases || []; return cs.find((x) => x.id === dcfS.cid) || cs[0] || null; };
const dcfSt = (c) => (dcfS.st[c.id] ||= {});
function dcfPath(st, k) { // 입력 칸 키 → [저장 객체, 이름]. sv.<시나리오>.<항목>, ov.<항목>, w.<시나리오>, rv.<항목>, step
  const p = k.split('.');
  if (p[0] === 'sv') { st.sv ||= {}; st.sv[p[1]] ||= {}; return [st.sv[p[1]], p.slice(2).join('.')]; }
  if (p.length === 1) return [st, p[0]];
  st[p[0]] ||= {};
  return [st[p[0]], p[1]];
}
const DCF_OV = { g: 100, roic_lt: 100, tax_eff: 100, rf: 100, erp: 100, extra: 100, adj_w: 100, spread: 100, tax_m: 100 };

function dcfModel(c) {
  const st = dcfSt(c), b = c.inp;
  const N = [5, 10, 15].includes(+st.years) ? +st.years : b.N;
  const inp = { ...dcfHorizon(b, N), reinvest: st.rein === 'ic' || st.rein === 'sales' ? st.rein : b.reinvest, wacc: { ...b.wacc }, scen: {} };
  for (const s of DCF_SCEN) {
    const x = b.scen[s], u = st.sv?.[s] || {};
    const pair = (nm) => [0, 1].map((i) => { const v = dcfNumOf(u[`${nm}.${i}`]); return v == null ? x[nm][i] : v / 100; });
    const turn0 = dcfNumOf(u.turn0), roicEnd = dcfNumOf(u.roic_end);
    inp.scen[s] = { ...x, growth: pair('growth'), cogs: pair('cogs'), opex: pair('opex'), rr: pair('rr'), turn0: turn0 ?? x.turn0, roic_end: roicEnd == null ? x.roic_end : roicEnd / 100 };
  }
  const bm = ['regression', 'bottom_up', 'input'].includes(st.bmode) ? st.bmode : b.wacc.beta_mode, bv = dcfNumOf(st.ov?.beta_v);
  inp.wacc.beta_mode = bm;
  if (bm === 'input') inp.wacc.beta_input = bv ?? b.wacc.beta_input ?? b.wacc.beta_reg;
  else if (bm === 'regression' && bv != null) inp.wacc.beta_reg = bv;
  inp.weights = Object.fromEntries(DCF_SCEN.map((s) => { const v = dcfNumOf(st.w?.[s]); return [s, v == null ? b.weights?.[s] ?? 1 / 3 : v / 100]; }));
  const ov = {};
  for (const [k, sc] of Object.entries(DCF_OV)) { const v = dcfNumOf(st.ov?.[k]); if (v != null) ov[k] = v / sc; }
  const sc = DCF_SCEN.includes(st.sc) ? st.sc : 'Base';
  const res = Object.fromEntries(DCF_SCEN.map((s) => [s, dcfCompute(inp, s, ov)]));
  const step0 = c.py?.sens?.step ?? c.switches?.sens_step ?? 0.0015, sv = dcfNumOf(st.step), step = sv != null && sv > 0 ? sv / 100 : step0;
  const R = c.reverse?.inp, rov = {};
  if (R) {
    const rv = st.rv || {};
    for (const [k, s_] of [['price', 1], ['r', 100], ['multiple', 1], ['npm', 100], ['conv', 100]]) { const v = dcfNumOf(rv[k]); if (v != null) rov[k] = v / s_; }
    if ([5, 10, 15].includes(+st.rvn)) rov.n = +st.rvn;
    if (DCF_PATH[st.rvpath]) rov.path = st.rvpath;
  }
  return { st, inp, ov, sc, N, res, r: res[sc], wavg: dcfWeighted(inp, res, inp.weights), step, step0, sens: dcfSens(inp, res[sc], step, sc, ov),
    R, rov, rev: R ? dcfReverse(R, rov) : { ok: false } };
}

// 입력 칸. 바꾼 칸은 파란 바탕. base는 처음 값(화면 단위 문자열)
function dcfIn(st, k, base, { u = '', ph = '', lab = '', dis = false } = {}) {
  const [o, kk] = dcfPath(st, k), has = o[kk] != null, v = has ? o[kk] : base;
  const bad = has && dcfS.typing !== k && String(o[kk]).trim() !== '' && dcfNumOf(o[kk]) == null, eid = bad ? dcfEId(k) : '';
  return `<span class="dcf-iw ${u ? '' : 'nu'}"><input type="text" autocomplete="off" data-k="${esc(k)}" data-b="${esc(base ?? '')}" value="${esc(v ?? '')}"${ph ? ` placeholder="${esc(ph)}"` : ''}${dis ? ' disabled' : ''} class="${has ? 'chg' : ''}" aria-label="${esc(lab)}"${bad ? ` aria-invalid="true" aria-describedby="${eid}"` : ''}>${u ? `<em>${u}</em>` : ''}</span>${bad ? `<span class="dcf-inv" id="${eid}">숫자 확인</span>` : ''}`;
}
const dcfF = (lab, html) => `<label class="dcf-f"><span>${lab}</span>${html}</label>`;

// ---------- 머리와 DCF 맵 ----------
function dcfHead(c, x) {
  const t = c.target, cs = dcfS.data.cases, st = x.st;
  const pick = cs.length > 1 ? `<select class="va-case" data-dcf-case aria-label="평가 사례">${cs.map((y) => `<option value="${esc(y.id)}" ${y.id === c.id ? 'selected' : ''}>${esc(y.target.name)} ${esc(y.day)}</option>`).join('')}</select>` : '';
  return `<section class="card va-head"><div class="va-ttl"><div><h2>${esc(t.name)} <small>${esc(t.code)}</small></h2>
      <p>기준일 ${esc(c.day)}${t.bs_date ? `, 재무상태표 ${esc(t.bs_date)}` : ''}${t.wics ? `, WICS ${esc(t.wics)}` : ''}</p></div>
      <div class="va-tools">${pick}${infoBtn('valuation_dcf')}<button class="btn ghost" type="button" id="dcf-xlsx">${ico('file', 'sm')}엑셀 받기</button></div></div>
    <div class="va-ctrl"><div><span>추정 기간</span>${dcfSeg('years', [[5, '5년'], [10, '10년'], [15, '15년']], x.N)}</div>
      <div><span>재투자 방식</span>${dcfSeg('rein', [['sales', '매출 대비'], ['ic', '투하자본회전율']], x.inp.reinvest)}</div>
      <div><span>시나리오</span>${dcfSeg('sc', DCF_SCEN.map((s) => [s, s]), x.sc)}</div>
      <button class="btn ghost sm" type="button" data-dcf-reset>처음 값으로</button></div></section>`;
}

function dcfMap(c, x) {
  const r = x.r, S = x.inp.scen[x.sc], B = x.inp.bridge, N = r.rows.length, f = r.rows[0], l = r.rows[N - 1];
  const from = (a, b, d = 1) => `${dcfPct(a, d)}에서 ${dcfPct(b, d)}`;
  const V = {
    매출액: [from(f.growth, l.growth), 'sv.g0'], 총매출원가: [from(f.cogs_r, l.cogs_r), 'sv.c0'], 영업비용: [from(f.opex_r, l.opex_r), 'sv.o0'], 법인세비용: [`유효세율 ${dcfPct(r.tax_eff)}`, 'ov.tax_eff'],
    재투자비용: [x.inp.reinvest === 'ic' ? `회전율 ${dcfX(S.turn0)}, ROIC ${dcfPct(S.roic_end)}` : from(f.rr, l.rr), x.inp.reinvest === 'ic' ? 'sv.t0' : 'sv.r0'],
    자기자본비용: [dcfPct(r.ke, 2), 'ov.rf'], 타인자본비용: [`세후 ${dcfPct(r.kd_at, 2)}`, 'ov.spread'], '할인율 확정': [`WACC ${dcfPct(r.wacc, 2)}`, 'ov.tax_m'],
    '종료가치 확정': [r.tv == null ? '-' : `${dcfEok(r.tv)}, g ${dcfPct(r.g, 2)}`, 'ov.g'],
    비영업자산: [dcfEok(B.cash + B.nonop), '#dcf-bridge'], 비주주청구권: [dcfEok(B.debt + B.nci), '#dcf-bridge'], '주식 수': [`${dcfNum(B.shares)}주`, '#dcf-bridge'],
  };
  const map = c.map || [], groups = [...new Set(map.map((m) => m.group))];
  const ok = (s) => V[s] && !/^-/.test(V[s][0]) && !V[s][0].includes('-%');
  const done = map.filter((m) => ok(m.step)).length;
  const body = `<div class="dcf-mapg">${groups.map((g) => `<div class="dcf-mg"><h3>${esc(g)}</h3><ol>${map.filter((m) => m.group === g).map((m) => {
    const v = V[m.step] || ['-', ''];
    return `<li><button type="button" class="${ok(m.step) ? 'ok' : ''}" data-dcf-go="${esc(v[1])}">${ico('done', 'sm')}<b>${esc(m.step)}</b><span>${v[0]}</span></button></li>`;
  }).join('')}</ol></div>`).join('')}</div>`;
  return dcfSec('DCF 맵', `<span class="meta">${done}/${map.length} 완료</span>`, body, 'dcf-map');
}

// ---------- 요약 ----------
function dcfTop(c, x) {
  const r = x.r, t = c.target, w = x.wavg;
  const box = r.ps == null
    ? `<div class="va-tpbox dcf-tp"><p>${x.sc} 영구성장률 ${dcfPct(r.g, 2)}이 WACC ${dcfPct(r.wacc, 2)} 이상이라 계산할 수 없습니다.</p></div>`
    : `<div class="va-tpbox dcf-tp"><div class="dcf-tp-ps"><span>${x.sc} 내재 가치</span><b>${dcfWon(r.ps)}</b></div><div><span>상승여력</span><b>${dcfUp(r.up)}</b></div>
      <div><span>가중평균</span><b>${w.ok ? dcfWon(w.ps) : '-'}</b></div><div><span>현재가</span><b>${dcfWon(t.close)}</b></div>
      <p>추정 ${x.N}년, WACC ${dcfPct(r.wacc, 2)}, 영구성장률 ${dcfPct(r.g, 2)}</p></div>`;
  const tiles = DCF_SCEN.map((s) => { const y = x.res[s]; return `<button type="button" class="dcf-sc ${s === x.sc ? 'on' : ''}" data-dcf-sc="${s}" aria-pressed="${s === x.sc}" ${c.rules?.[s] ? `title="${esc(c.rules[s])}"` : ''}>
      <span>${s}</span><b>${dcfWon(y.ps)}</b>${dcfUp(y.up)}<small>첫해 매출 성장률 ${dcfPct(y.rows[0].growth)}, 가중치 ${dcfPct(x.inp.weights[s])}</small></button>`; }).join('');
  return dcfSec('DCF 평가 결과', w.ok ? '' : `<span class="meta">가중치 합 ${dcfPct(w.sum, 2)}</span>`, `<div class="dcf-top">${box}<div class="dcf-scs">${tiles}</div></div>`);
}

function dcfBridge(c, x) {
  const r = x.r, inp = x.inp, B = inp.bridge;
  if (r.ev == null) return dcfSec('내재 가치 산정', '', '<div class="empty">영구성장률이 WACC 이상이라 계산할 수 없습니다.</div>', '', 'dcf-bridge');
  const L = (k, v, cls = '') => `<tr class="${cls}"><th>${k}</th><td>${v}</td></tr>`;
  const br = `<table class="va-calc dcf-br"><tbody>${L('PV(FCFF) 합', dcfEok(r.pv_sum))}${L('PV(종료가치)', dcfEok(r.pv_tv))}${L('순영업자산가치', dcfEok(r.ev), 'sum')}
    ${L('현금성자산', dcfSgn(B.cash))}${L('비영업자산', dcfSgn(B.nonop))}${L('이자부부채', dcfSgn(-B.debt))}${L('비지배지분', dcfSgn(-B.nci))}${L('환산주주가치', dcfEok(r.eq), 'sum')}
    ${L('주식 수', `${dcfNum(B.shares)}주`)}</tbody><tbody class="res">${L('내재 가치', dcfWon(r.ps_raw), 'k')}${L(`${dcfNum(inp.round)}원 단위`, dcfWon(r.ps), 'k big')}</tbody></table>`;
  const last = r.rows[r.rows.length - 1];
  const tv = `<table class="va-calc dcf-br"><tbody>${L('종료연도 매출', dcfEok(r.ty.rev))}${L('종료연도 세후 영업이익률', dcfPct(r.ty.margin))}${L('종료연도 세후영업이익', dcfEok(r.ty.nopat))}
    ${L('장기 ROIC', dcfPct(r.roic_lt, 2))}${L('종료연도 재투자', dcfEok(r.ty.reinv))}${L('종료연도 FCFF', dcfEok(r.ty.fcff), 'sum')}${L('종료가치', dcfEok(r.tv), 'sum')}
    ${L(`할인계수 ${last.year}년`, dcfNum(last.df, 4))}${L('PV(종료가치)', dcfEok(r.pv_tv), 'sum')}${L('종료가치 비중', dcfPct(r.tv_share))}</tbody></table>`;
  return dcfSec('내재 가치 산정', `<span class="meta">${x.sc}</span>`, `<div class="dcf-two"><div><h3 class="va-h3">순영업자산가치에서 내재 가치까지</h3>${br}</div><div><h3 class="va-h3">종료가치</h3>${tv}</div></div>`, '', 'dcf-bridge');
}

function dcfAsm(c, x) {
  const r = x.r, N = r.rows.length, f = r.rows[0], l = r.rows[N - 1];
  const two = (lab, a, b, fm = dcfPct) => `<tr><td class="st">${lab}</td><td>${fm(a)}</td><td>${fm(b)}</td></tr>`;
  const one = (lab, v) => `<tr><td class="st">${lab}</td><td colspan="2">${v}</td></tr>`;
  const body = `<div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-asmt"><thead><tr><th class="st">항목</th><th>${f.year}년</th><th>${l.year}년</th></tr></thead><tbody>
    ${two('매출 성장률', f.growth, l.growth)}${two('매출원가율', f.cogs_r, l.cogs_r)}${two('영업비용률', f.opex_r, l.opex_r)}${two('영업이익률', f.margin, l.margin)}
    ${two('매출 대비 재투자비용', f.rr, l.rr)}${two('투하자본회전율', f.turn, l.turn, dcfX)}${two('ROIC', f.roic, l.roic)}
    ${one('FCFF 세율', dcfPct(r.tax_eff))}${one('영구성장률', dcfPct(r.g, 2))}${one('장기 ROIC', dcfPct(r.roic_lt, 2))}${one('종료연도 세후 영업이익률', dcfPct(r.ty.margin))}
    ${one('WACC', dcfPct(r.wacc, 2))}${one('종료가치 비중', dcfPct(r.tv_share))}</tbody></table></div>`;
  return dcfSec('핵심 가정', `<span class="meta">${x.sc}, 추정 ${x.N}년, ${x.inp.reinvest === 'ic' ? '투하자본회전율' : '매출 대비 재투자'}</span>`, body);
}

function dcfWaccSec(c, x) {
  const r = x.r, W = x.inp.wacc, mk = c.market || {}, ov = x.ov, sw = c.switches || {}, peers = c.peers || [];
  const rfNote = ov.rf != null ? '직접 입력' : sw.rf === 'avg_3m' ? '국고채 10년 최근 3개월 평균' : sw.rf === 'avg_1y' ? '국고채 10년 1년 평균' : mk.rf?.as_of ? `국고채 10년 ${esc(mk.rf.as_of)}` : '';
  const bNote = { regression: '대상 회사 52주 베타', bottom_up: '비교기업 무차입 베타 중앙값', input: '직접 입력' }[W.beta_mode];
  const kdNote = ov.spread != null ? '스프레드 직접 입력' : W.kd_mode === 'input' ? '직접 입력' : `합성등급 ${esc(c.rating || '')}, 스프레드 ${dcfPct(W.spread, 2)}`;
  const rows = [
    ['무위험이자율', dcfPct(r.rf, 3), rfNote],
    ['주식위험프리미엄', dcfPct(r.erp, 3), ov.erp != null ? '직접 입력' : mk.erp?.as_of ? `Damodaran ${esc(String(mk.erp.as_of).slice(0, 10))}` : ''],
    ['추가 위험', dcfPct(r.extra, 2), ov.extra != null ? '직접 입력' : ''],
    ...(W.beta_mode === 'regression' ? [['원 베타', dcfNum(W.beta_reg, 3), bNote]] : []),
    ['무차입 베타', dcfNum(r.beta_u, 3), W.beta_mode === 'bottom_up' ? bNote : ''],
    ['조정 무차입 베타', dcfNum(r.beta_u_adj, 3), W.beta_mode === 'input' ? '조정 없음' : `조정 비중 ${dcfPct(ov.adj_w ?? W.adj_w, 2)}`],
    ['D/E', dcfPct(W.de, 2), `이자부부채 ${dcfEok(W.D)}, 시가총액 ${dcfEok(W.E)}`],
    ['재차입 베타', dcfNum(r.beta, 3), W.beta_mode === 'input' ? '직접 입력' : ''],
    ['자기자본비용', dcfPct(r.ke, 2), ''],
    ['세전 타인자본비용', dcfPct(r.kd, 2), kdNote],
    ['한계세율', dcfPct(r.tax_m, 1), ov.tax_m != null ? '직접 입력' : ''],
    ['세후 타인자본비용', dcfPct(r.kd_at, 2), ''],
    ['부채 비중', dcfPct(r.wd, 2), ''],
  ];
  const wt = `<div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-wacc"><thead><tr><th class="st">항목</th><th>값</th><th class="tx">근거</th></tr></thead><tbody>
    ${rows.map(([k, v, n]) => `<tr><td class="st">${k}</td><td>${v}</td><td class="tx">${n}</td></tr>`).join('')}
    <tr class="key"><td class="st">WACC</td><td>${dcfPct(r.wacc, 2)}</td><td class="tx"></td></tr></tbody></table></div>`;
  const bu = (b, de) => b / (1 + (1 - r.tax_m) * de);
  const med = (f) => dcfMed(peers.map(f));
  const pt = `<div><h3 class="va-h3">회귀 베타와 바텀업 베타</h3><div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-peer"><thead><tr><th class="st">회사</th><th>52주 베타</th><th>D/E</th><th>무차입 베타</th><th>1년 베타</th></tr></thead><tbody>
    <tr class="tgt"><td class="st">${esc(c.target.name)}</td><td>${dcfNum(c.inp.wacc.beta_reg, 2)}</td><td>${dcfPct(W.de)}</td><td>${dcfNum(bu(c.inp.wacc.beta_reg, W.de), 3)}</td><td>-</td></tr>
    ${peers.map((p) => `<tr><td class="st">${esc(p.name)}</td><td>${dcfNum(p.beta, 2)}</td><td>${dcfPct(p.de)}</td><td>${dcfNum(bu(p.beta, p.de), 3)}</td><td>${dcfNum(p.beta_1y, 2)}</td></tr>`).join('')}
    ${peers.length ? `<tr class="key"><td class="st">비교기업 중앙값</td><td>${dcfNum(med((p) => p.beta), 2)}</td><td>${dcfPct(med((p) => p.de))}</td><td>${dcfNum(med((p) => bu(p.beta, p.de)), 3)}</td><td>${dcfNum(med((p) => p.beta_1y), 2)}</td></tr>` : ''}</tbody></table></div></div>`;
  return dcfSec('WACC', `<span class="meta">${dcfPct(r.wacc, 2)}</span>`, `<div class="dcf-two wide"><div><h3 class="va-h3">할인율</h3>${wt}</div>${pt}</div>`);
}

function dcfChecks(c, x) {
  const v = dcfVerify(c), L = { err: '오류', warn: '주의', info: '참고' }, ord = { err: 0, warn: 1, info: 2 }, now = [];
  if (!v.ok) now.push({ level: 'err', text: `화면 계산이 파이썬 결과와 다름. ${v.bad.slice(0, 3).join(', ')}${v.bad.length > 3 ? ` 외 ${v.bad.length - 3}건` : ''}` });
  for (const s of DCF_SCEN) { const y = x.res[s]; if (y.ps == null) now.push({ level: 'err', text: `${s} 영구성장률 ${dcfPct(y.g, 2)}이 WACC ${dcfPct(y.wacc, 2)} 이상이라 종료가치를 계산할 수 없음` }); }
  if (!x.wavg.ok) now.push({ level: 'warn', text: `시나리오 가중치 합이 ${dcfPct(x.wavg.sum, 2)}라 가중평균을 계산하지 않음` });
  if (x.r.g > x.r.rf) now.push({ level: 'warn', text: `영구성장률 ${dcfPct(x.r.g, 2)}이 무위험이자율 ${dcfPct(x.r.rf, 2)}을 넘음` });
  const li = (xs) => `<ul class="dcf-chk">${[...xs].sort((a, b) => (ord[a.level] ?? 3) - (ord[b.level] ?? 3)).map((y) => `<li><span class="dcf-lv ${esc(y.level)}">${L[y.level] || esc(y.level)}</span><span>${esc(y.text)}</span></li>`).join('')}</ul>`;
  const base = c.checks || [], alt = Object.entries(c.py?.alt || {}), pend = c.pending || [];
  const altT = alt.length ? `<h3 class="va-h3">다른 가정</h3><div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-alt"><thead><tr><th class="st">가정</th><th>WACC</th><th>내재 가치</th><th>상승여력</th></tr></thead><tbody>
    ${alt.map(([k, y]) => `<tr><td class="st">${esc(k)}</td><td>${dcfPct(y.wacc, 2)}</td><td>${dcfWon(y.ps)}</td><td>${dcfUp(y.up)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const body = `${now.length ? `<h3 class="va-h3">지금 입력 기준</h3>${li(now)}` : ''}${base.length ? `<h3 class="va-h3">처음 값 기준</h3>${li(base)}` : ''}${altT}
    ${pend.length ? `<details class="va-det dcf-pend"><summary>사용자 확인 대기 <span class="n">${pend.length}</span></summary><ul class="va-warn">${pend.map((y) => `<li>${esc(y)}</li>`).join('')}</ul></details>` : ''}`;
  return dcfSec('점검', `<span class="meta">${now.length + base.filter((y) => y.level !== 'info').length}건 확인</span>`, body);
}

// ---------- 상세 ----------
function dcfDetIn(c, x) {
  const st = x.st, s = x.sc, b = c.inp.scen[s], r = x.r, N = r.rows.length, ic = x.inp.reinvest === 'ic', S = x.inp.scen[s];
  const pr = (lab, nm) => `<tr><td class="st">${lab}</td><td>${dcfIn(st, `sv.${s}.${nm}.0`, dcfFi(b[nm][0]), { u: '%', lab: `${lab} 첫해` })}</td><td>${dcfIn(st, `sv.${s}.${nm}.1`, dcfFi(b[nm][1]), { u: '%', lab: `${lab} 마지막 해`, ph: nm === 'rr' ? dcfFi(r.rows[N - 1].rr) : '' })}</td></tr>`;
  const rein = ic
    ? `<tr><td class="st">투하자본회전율</td><td>${dcfIn(st, `sv.${s}.turn0`, dcfFi(b.turn0, 1, 3), { u: '배', lab: '투하자본회전율 첫해' })}</td><td class="ro">${dcfX(r.rows[N - 1].turn)}</td></tr>
       <tr><td class="st">ROIC</td><td class="ro">${dcfPct(r.rows[0].roic)}</td><td>${dcfIn(st, `sv.${s}.roic_end`, dcfFi(b.roic_end), { u: '%', lab: '마지막 해 ROIC' })}</td></tr>`
    : pr('매출 대비 재투자비용', 'rr');
  const sct = `<div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-pt"><thead><tr><th class="st">${s}</th><th>첫해 ${r.rows[0].year}</th><th>마지막 해 ${r.rows[N - 1].year}</th></tr></thead><tbody>
    ${pr('매출 성장률', 'growth')}${pr('매출원가율', 'cogs')}${pr('영업비용률', 'opex')}${rein}</tbody></table></div>`;
  const W = c.inp.wacc, bm = x.inp.wacc.beta_mode;
  const bBase = bm === 'input' ? dcfFi(W.beta_input ?? W.beta_reg, 1, 3) : bm === 'regression' ? dcfFi(W.beta_reg, 1, 3) : dcfFi(dcfWacc(x.inp, { ...x.ov, beta_u: null }).beta_u, 1, 3);
  const o = (k, lab, base, u = '%', ph = '') => dcfF(lab, dcfIn(st, `ov.${k}`, base, { u, lab, ph }));
  const com = `<div class="dcf-ing"><h3 class="va-h3">종료가치와 세율</h3><div class="dcf-in">
      ${o('g', '영구성장률', dcfFi(b.g))}${o('roic_lt', '장기 ROIC', dcfFi(b.roic_lt), '%', dcfFi(r.roic_lt))}${o('tax_eff', '유효세율', dcfFi(c.inp.tax_eff))}${o('tax_m', '한계세율', dcfFi(W.tax_m))}</div></div>
    <div class="dcf-ing"><h3 class="va-h3">자기자본비용</h3><div class="dcf-in">
      ${o('rf', '무위험이자율', dcfFi(W.rf, 100, 3))}${o('erp', '주식위험프리미엄', dcfFi(W.erp, 100, 3))}${o('extra', '추가 위험', dcfFi(W.extra))}
      <div class="dcf-f dcf-fw"><span>베타 방식</span>${dcfSeg('bmode', [['regression', '회귀'], ['bottom_up', '바텀업'], ['input', '직접 입력']], bm)}</div>
      ${dcfF(bm === 'bottom_up' ? '무차입 베타 중앙값' : bm === 'input' ? '베타' : '회귀 베타', dcfIn(st, 'ov.beta_v', bBase, { lab: '베타', dis: bm === 'bottom_up' }))}
      ${bm === 'input' ? '' : o('adj_w', '조정 비중', dcfFi(W.adj_w))}</div></div>
    <div class="dcf-ing"><h3 class="va-h3">타인자본비용</h3><div class="dcf-in">${W.kd_mode === 'input' ? '' : o('spread', '스프레드', dcfFi(W.spread, 100, 3))}</div></div>`;
  return dcfSec('입력값 세부 조정', `<span class="meta">${s}</span>`, `<h3 class="va-h3">시나리오 경로</h3>${sct}<div class="dcf-coms">${com}</div>`, 'dcf-detin');
}

function dcfDetTbl(c, x) {
  const r = x.r, hy = c.hist_years || [], H = (c.hist || []).filter((h) => hy.includes(h.year)), te = r.tax_eff, ty = r.ty, N = r.rows.length, last = r.rows[N - 1];
  const hn = (h) => (h.tax_r != null ? h.op * (1 - h.tax_r) : null);
  const n = (v) => dcfNum(v), p = (v) => dcfPct(v), X = (v) => dcfX(v);
  const L = [ // [이름, 실적, 추정, 종료연도, 표시, 줄 종류]
    ['총매출', (h) => h.revenue, (w) => w.rev, () => ty.rev, n, 'strong'],
    ['성장률', (h) => h.growth, (w) => w.growth, () => r.g, p, 'sub'],
    ['매출원가율', (h) => h.cogs_r, (w) => w.cogs_r, null, p, 'sub'],
    ['영업비용률', (h) => h.opex_r, (w) => w.opex_r, null, p, 'sub'],
    ['영업이익', (h) => h.op, (w) => w.op, null, n, 'strong'],
    ['영업이익률', (h) => h.margin, (w) => w.margin, null, p, 'sub'],
    ['유효세율', (h) => h.tax_r, () => te, null, p, 'sub'],
    ['법인세', (h) => (h.tax_r != null ? h.op * h.tax_r : null), (w) => w.tax, null, n],
    ['세후영업이익', hn, (w) => w.nopat, () => ty.nopat, n, 'strong'],
    ['세후 영업이익률', (h) => (hn(h) != null ? hn(h) / h.revenue : null), (w) => w.nopat / w.rev, () => ty.margin, p, 'sub'],
    ['재투자비용', (h) => h.reinv, (w) => w.reinv, () => ty.reinv, n],
    ['매출 대비 재투자비용', (h) => h.rr, (w) => w.rr, () => ty.reinv / ty.rev, p, 'sub'],
    ['투하자본', (h) => h.ic, (w) => w.ic, null, n],
    ['투하자본회전율', (h) => h.turn, (w) => w.turn, null, X, 'sub'],
    ['ROIC', (h) => h.roic, (w) => w.roic, () => r.roic_lt, p, 'sub'],
    ['FCFF', (h) => (hn(h) != null && h.reinv != null ? hn(h) - h.reinv : null), (w) => w.fcff, () => ty.fcff, n, 'strong'],
    ['반영 비율', null, (w) => w.f, null, (v) => dcfPct(v, 0), 'sub'],
    ['할인 기간', null, (w) => w.t, null, (v) => dcfNum(v, 2), 'sub'],
    ['할인계수', null, (w) => w.df, () => last.df, (v) => dcfNum(v, 3), 'sub'],
    ['PV(FCFF)', null, (w) => w.pv, null, n, 'key'],
    ['종료가치', null, null, () => r.tv, n, 'strong'],
    ['PV(종료가치)', null, null, () => r.pv_tv, n, 'key'],
  ];
  const cell = (f, o, fm, cls = '') => `<td class="${cls}">${f ? fm(f(o)) : ''}</td>`;
  const head = `<tr class="dcf-grp"><th class="st"></th>${H.length ? `<th colspan="${H.length}" class="tx">실적</th>` : ''}<th colspan="${N}" class="tx bl">추정 ${x.sc}</th><th class="tx bl">종료</th></tr>
    <tr><th class="st">억원</th>${H.map((h) => `<th>${h.year}</th>`).join('')}${r.rows.map((w, i) => `<th class="${i === 0 ? 'bl' : ''}">${w.year}</th>`).join('')}<th class="bl">TY</th></tr>`;
  const body = L.map(([lab, fh, ff, ft, fm, cls]) => `<tr class="${cls || ''}"><td class="st">${lab}</td>${H.map((h) => cell(fh, h, fm, 'hi')).join('')}${r.rows.map((w, i) => cell(ff, w, fm, i === 0 ? 'bl' : '')).join('')}${cell(ft, null, fm, 'bl')}</tr>`).join('');
  return dcfSec('연도별 추정', `<span class="meta">${x.inp.years[0]}～${x.inp.years[N - 1]}년</span>`, `<div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-fcff"><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
}

// ---------- 민감도 ----------
function dcfSensTbl(title, axis, xs, xfmt, ws, tbl, close) {
  const ci = Math.floor(ws.length / 2), cj = Math.floor(xs.length / 2);
  const cls = (v, i, j) => [v == null ? '' : v > close ? 'up' : v < close ? 'dn' : '', i === ci && j === cj ? 'mid' : ''].join(' ');
  return `<div><h3 class="va-h3">${title}</h3><div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-sens"><thead><tr class="dcf-grp"><th class="st" rowspan="2">WACC</th><th colspan="${xs.length}" class="tx">${axis}</th></tr>
    <tr>${xs.map((x, j) => `<th class="${j === cj ? 'c' : ''}">${xfmt(x)}</th>`).join('')}</tr></thead>
    <tbody>${ws.map((w, i) => `<tr><td class="st ${i === ci ? 'c' : ''}">${dcfPct(w, 2)}</td>${tbl[i].map((v, j) => `<td class="${cls(v, i, j)}">${dcfNum(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
function dcfSvOut(c, x, v) {
  const k = x.st.svar in DCF_SVAR ? x.st.svar : 'wacc', y = dcfCompute(x.inp, x.sc, { ...x.ov, [k]: v });
  return `<div><dt>${DCF_SVAR[k][0]}</dt><dd>${dcfPct(v, 2)}</dd></div><div><dt>조정 내재 가치</dt><dd>${dcfWon(y.ps)}</dd></div><div><dt>상승여력</dt><dd>${y.ps == null ? '-' : dcfUp(y.up)}</dd></div>`;
}
function dcfSensTab(c, x) {
  const s = x.sens, close = c.target.close, st = x.st;
  const two = dcfSec('이중 변수', `<label class="dcf-step">간격 ${dcfIn(st, 'step', dcfFi(x.step0, 100, 2), { u: '%p', lab: '민감도 간격' })}</label>`, `<div class="dcf-two wide">
    ${dcfSensTbl('WACC × 영구성장률', '영구성장률', s.g, (v) => dcfPct(v, 2), s.wacc, s.wacc_g, close)}
    ${dcfSensTbl('WACC × 종료연도 세후 영업이익률', '종료연도 세후 영업이익률', s.ty_margin, (v) => dcfPct(v, 2), s.wacc, s.wacc_margin, close)}</div>`);
  const k = st.svar in DCF_SVAR ? st.svar : 'wacc', [, lo, hi, stp] = DCF_SVAR[k], cur = k === 'ty_margin' ? x.r.ty.margin : x.r[k];
  const one = dcfSec('단일 변수', dcfSeg('svar', Object.entries(DCF_SVAR).map(([v, [l]]) => [v, l]), k), `<div class="dcf-sv">
    <input type="range" data-dcf-sv min="${lo}" max="${hi}" step="${stp}" value="${Math.min(hi, Math.max(lo, cur))}" aria-label="${DCF_SVAR[k][0]}">
    <div class="dcf-svax"><span>${dcfPct(lo, 1)}</span><span>${dcfPct(hi, 1)}</span></div>
    <dl class="va-kv" id="dcf-sv-out">${dcfSvOut(c, x, cur)}</dl></div>`);
  return two + one;
}

// ---------- 시나리오 ----------
function dcfScenTab(c, x) {
  const st = x.st, w = x.wavg, close = c.target.close;
  const rows = DCF_SCEN.map((s) => { const y = x.res[s], N = y.rows.length; return `<tr class="${s === x.sc ? 'on' : ''}"><td class="st">${s}</td><td>${dcfWon(y.ps)}</td><td>${dcfUp(y.up)}</td>
    <td>${dcfPct(y.rows[0].growth)}</td><td>${dcfPct(y.rows[N - 1].margin)}</td><td>${dcfPct(y.tv_share)}</td>
    <td class="inp">${dcfIn(st, `w.${s}`, dcfFi(c.inp.weights?.[s] ?? 1 / 3), { u: '%', lab: `${s} 가중치` })}</td></tr>`; }).join('');
  const foot = `<tr class="key"><td class="st">가중평균</td><td>${w.ok ? dcfWon(w.ps) : '-'}</td><td>${w.ok ? dcfUp(w.up) : ''}</td><td></td><td></td><td></td><td class="${w.ok ? '' : 'bad'}">${dcfPct(w.sum, 2)}</td></tr>`;
  const tbl = `<div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-scen"><thead><tr><th class="st">시나리오</th><th>내재 가치</th><th>상승여력</th><th>첫해 매출 성장률</th><th>마지막 해 영업이익률</th><th>종료가치 비중</th><th>가중치</th></tr></thead><tbody>${rows}${foot}</tbody></table></div>
    ${w.ok ? '' : `<ul class="dcf-chk"><li><span class="dcf-lv warn">주의</span><span>가중치 합이 ${dcfPct(w.sum, 2)}라 가중평균을 계산하지 않음</span></li></ul>`}`;
  const rules = c.rules ? `<h3 class="va-h3">시나리오 규칙</h3><ul class="dcf-chk">${DCF_SCEN.filter((s) => c.rules[s]).map((s) => `<li><span class="dcf-lv info">${s}</span><span>${esc(c.rules[s])}</span></li>`).join('')}</ul>` : '';
  return dcfSec('시나리오와 가중평균', `<span class="meta">현재가 ${dcfWon(close)}</span>`, tbl + rules);
}

// ---------- 리버스 DCF ----------
function dcfRevChart(c, x) {
  const R = x.R, v = x.rev, n = x.rov.n ?? R.n, hist = (c.hist || []).filter((h) => h.revenue != null);
  const ty = parseInt(String(R.ttm_end || '').slice(0, 4), 10) || (c.inp.rev0_year + 1);
  const path = v.ok ? [{ y: ty, v: R.rev_ttm }, ...v.rev_path.map((val, i) => ({ y: ty + i + 1, v: val }))] : [];
  const cons = (c.cons?.years || []).map((y, i) => ({ y, v: c.cons.rev[i] })).filter((p) => p.y && p.v != null);
  const ys = [...hist.map((h) => h.year), ...path.map((p) => p.y), ...cons.map((p) => p.y)];
  if (!ys.length) return '';
  const y0 = Math.min(...ys), y1 = Math.max(...ys), vmax = Math.max(...hist.map((h) => h.revenue), ...path.map((p) => p.v), ...cons.map((p) => p.v)) * 1.1;
  const narrow = ($('#va-host')?.clientWidth || 800) < 560; // 폰에서는 좁게 그려 글자가 작아지지 않게
  const Wd = narrow ? 380 : 720, Ht = narrow ? 240 : 260, P = { l: 48, r: 10, t: 14, b: 28 }, bw = (Wd - P.l - P.r) / (y1 - y0 + 1);
  const X = (y) => P.l + (y - y0 + 0.5) * bw, Y = (val) => P.t + (1 - val / vmax) * (Ht - P.t - P.b);
  const tick = (() => { const raw = vmax / 4, m = 10 ** Math.floor(Math.log10(raw)), f = raw / m; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * m; })();
  const grid = Array.from({ length: Math.floor(vmax / tick) + 1 }, (_, i) => i * tick).map((t) => `<line x1="${P.l}" x2="${Wd - P.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="gl"/><text x="${P.l - 6}" y="${(Y(t) + 4).toFixed(1)}" class="yl">${dcfNum(t)}</text>`).join('');
  const every = Math.ceil((y1 - y0 + 1) / (narrow ? 5 : 12));
  const xt = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).filter((y, i) => i % every === 0).map((y) => `<text x="${X(y).toFixed(1)}" y="${Ht - 8}" class="xl">${y}</text>`).join('');
  const bars = hist.map((h) => `<rect x="${(X(h.year) - bw * 0.32).toFixed(1)}" y="${Y(h.revenue).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(Y(0) - Y(h.revenue)).toFixed(1)}" rx="3" class="hb"><title>${h.year}년 매출 ${dcfEok(h.revenue)}</title></rect>`).join('');
  const line = (pts, cls) => (pts.length > 1 ? `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.y).toFixed(1)},${Y(p.v).toFixed(1)}`).join('')}" class="${cls}"/>` : '') + pts.map((p) => `<circle cx="${X(p.y).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3.5" class="${cls}"><title>${p.y}년 ${dcfEok(p.v)}</title></circle>`).join('');
  return `<div class="dcf-leg"><span class="b">매출 실적</span><span class="p">내재 성장 경로</span><span class="c">컨센서스</span></div>
    <div class="va-scw"><svg viewBox="0 0 ${Wd} ${Ht}" class="va-sc dcf-rc" role="img" aria-label="매출 실적과 내재 성장 경로">${grid}${xt}${bars}${line(path, 'p')}${line(cons, 'c')}</svg></div>`;
}
function dcfRevTab(c, x) {
  const R = x.R;
  if (!R) return dcfSec('리버스 DCF', '', '<div class="empty">리버스 DCF 입력이 없습니다.</div>');
  const st = x.st, v = x.rev, n = x.rov.n ?? R.n, path = x.rov.path ?? R.path;
  const r = (k, lab, base, u) => dcfF(lab, dcfIn(st, `rv.${k}`, base, { u, lab }));
  const basic = `<dl class="va-kv dcf-rkv"><div><dt>주당 FCF${R.ttm_end ? ` ${esc(R.ttm_end)} TTM` : ''}</dt><dd>${dcfWon(R.f0)}</dd></div><div><dt>주당 매출${R.ttm_end ? ` ${esc(R.ttm_end)} TTM` : ''}</dt><dd>${dcfWon(R.s0)}</dd></div>
    <div><dt>FCF TTM</dt><dd>${dcfEok(R.fcf_ttm)}</dd></div><div><dt>매출 TTM</dt><dd>${dcfEok(R.rev_ttm)}</dd></div></dl>`;
  const asm = `<div class="dcf-in dcf-rin">${r('price', '주가', dcfFi(R.price, 1, 0), '원')}${r('r', '할인율', dcfFi(R.r), '%')}
    <div class="dcf-f dcf-fw"><span>추정 기간</span>${dcfSeg('rvn', [[5, '5년'], [10, '10년'], [15, '15년']], n)}</div>
    <div class="dcf-f dcf-fw"><span>성장 형태</span>${dcfSeg('rvpath', Object.entries(DCF_PATH), path)}</div>
    ${r('multiple', '최종 P/FCF', dcfFi(R.multiple, 1, 2), '배')}${r('npm', '최종 순이익률', dcfFi(R.npm), '%')}${r('conv', 'FCF 전환 비율', dcfFi(R.conv), '%')}</div>`;
  const hist = (c.hist || []).filter((h) => h.revenue != null), h0 = hist[0], h1 = hist[hist.length - 1];
  const cy = (c.cons?.years || []).map((y, i) => [y, c.cons.rev[i]]).filter(([y, val]) => y && val != null), cl = cy[cy.length - 1];
  const hc = h0 && h1 && h1.year > h0.year ? (h1.revenue / h0.revenue) ** (1 / (h1.year - h0.year)) - 1 : null;
  const cc = cl && h1 && cl[0] > h1.year ? (cl[1] / h1.revenue) ** (1 / (cl[0] - h1.year)) - 1 : null;
  const res = v.ok ? `<div class="dcf-rres"><div><span>내재 주당 FCF 성장률</span><b>${dcfPct(v.g_fcf, 2)}</b></div><div><span>내재 매출 성장률</span><b>${dcfPct(v.g_sales, 2)}</b></div><div><span>출구 가치 비중</span><b>${dcfPct(v.tv_share)}</b></div></div>
    <dl class="va-kv dcf-rkv">${hc != null ? `<div><dt>${h0.year}～${h1.year}년 실적 매출 성장률</dt><dd>${dcfPct(hc)}</dd></div>` : ''}${cc != null ? `<div><dt>${h1.year}～${cl[0]}년 컨센서스 매출 성장률</dt><dd>${dcfPct(cc)}</dd></div>` : ''}
      <div><dt>${n}년 뒤 주당 FCF</dt><dd>${dcfWon(v.fn)}</dd></div><div><dt>${n}년 뒤 매출</dt><dd>${dcfEok(v.sn * R.shares / 1e8)}</dd></div></dl>`
    : `<div class="empty">${R.f0 == null || R.f0 <= 0 ? '주당 FCF TTM이 0 이하라 성장률을 풀 수 없습니다.' : '이 주가를 맞추는 성장률이 −90%와 300% 사이에 없습니다.'}</div>`;
  return dcfSec('기본 입력치와 가정값', '', basic + asm) + dcfSec('결괏값', `<span class="meta">${DCF_PATH[path] || ''}, ${n}년, 할인율 ${dcfPct(x.rov.r ?? R.r, 1)}</span>`, res + (v.ok ? dcfRevChart(c, x) : ''));
}

// ---------- 그리기 ----------
function dcfBody(c, x) {
  const tab = ['sum', 'det', 'sens', 'scen', 'rev'].includes(x.st.tab) ? x.st.tab : 'sum';
  const tabs = `<div class="va-tabs">${dcfSeg('tab', [['sum', '요약'], ['det', '상세'], ['sens', '민감도'], ['scen', '시나리오'], ['rev', '리버스 DCF']], tab)}</div>`;
  const body = { sum: () => dcfTop(c, x) + dcfBridge(c, x) + dcfAsm(c, x) + dcfWaccSec(c, x) + dcfChecks(c, x), det: () => dcfDetIn(c, x) + dcfDetTbl(c, x),
    sens: () => dcfSensTab(c, x), scen: () => dcfScenTab(c, x), rev: () => dcfRevTab(c, x) }[tab]();
  return tabs + body;
}
function dcfDraw() {
  const host = $('#va-host'); if (!host || !host.hasAttribute('data-dcf')) return;
  if (dcfS.err) { host.innerHTML = `<div class="card"><div class="empty">${esc(dcfS.err)}</div></div>`; return; }
  const c = dcfCase();
  if (!c) { host.innerHTML = '<div class="card"><div class="empty">아직 DCF 평가가 없습니다.</div></div>'; return; }
  if (c.version !== 2 || !c.inp?.scen) { host.innerHTML = '<div class="card"><div class="empty">예전 형식의 DCF 파일입니다. dcf.py run 으로 다시 만들어 주세요.</div></div>'; return; }
  dcfS.cid = c.id;
  TAB_INFO.valuation_dcf = dcfInfo(c);
  const x = dcfModel(c);
  const a = document.activeElement, fk = host.contains(a) ? a.dataset?.k : null, s0 = a?.selectionStart, s1 = a?.selectionEnd;
  host.innerHTML = dcfHead(c, x) + dcfMap(c, x) + dcfBody(c, x);
  if (fk) { const el = host.querySelector(`[data-k="${CSS.escape(fk)}"]`); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(s0, s1); } catch { /* */ } } }
  dcfSave();
}

const dcfMo = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
function dcfBind(host) {
  host.addEventListener('click', (e) => {
    const c = dcfCase(); if (!c) return;
    const st = dcfSt(c);
    const sg = e.target.closest('[data-dcf-seg]');
    if (sg) { st[sg.dataset.dcfSeg] = sg.dataset.v; dcfDraw(); return; }
    const sc = e.target.closest('[data-dcf-sc]');
    if (sc) { st.sc = sc.dataset.dcfSc; dcfDraw(); return; }
    const go = e.target.closest('[data-dcf-go]');
    if (go) {
      const k = go.dataset.dcfGo;
      if (k.startsWith('#')) { st.tab = 'sum'; dcfDraw(); $(k)?.scrollIntoView({ behavior: dcfMo(), block: 'start' }); return; }
      st.tab = 'det'; dcfDraw();
      const s = DCF_SCEN.includes(st.sc) ? st.sc : 'Base';
      const key = { 'sv.g0': `sv.${s}.growth.0`, 'sv.c0': `sv.${s}.cogs.0`, 'sv.o0': `sv.${s}.opex.0`, 'sv.r0': `sv.${s}.rr.0`, 'sv.t0': `sv.${s}.turn0` }[k] || k;
      const el = host.querySelector(`[data-k="${CSS.escape(key)}"]`);
      if (el) { el.scrollIntoView({ behavior: dcfMo(), block: 'center' }); el.focus({ preventScroll: true }); }
      return;
    }
    if (e.target.closest('[data-dcf-reset]')) {
      const has = (v) => v != null && v !== '' && (typeof v !== 'object' || Object.values(v).some(has)), chg = Object.entries(st).some(([k, v]) => k !== 'tab' && k !== 'sc' && has(v)); // 탭, 시나리오 선택만 바뀌었으면 묻지 않음
      if (chg && !confirm('바꾼 입력을 모두 처음 값으로 되돌릴까요?')) return;
      dcfS.st[c.id] = { tab: st.tab }; dcfDraw(); return;
    }
    if (e.target.closest('#dcf-xlsx')) dcfDownload(e.target.closest('#dcf-xlsx'), c);
  });
  host.addEventListener('input', (e) => {
    const c = dcfCase(); if (!c) return;
    const el = e.target;
    if (el.matches('[data-dcf-sv]')) { const x = dcfModel(c), out = $('#dcf-sv-out'); if (out) out.innerHTML = dcfSvOut(c, x, +el.value); return; } // 끄는 동안 칸을 다시 만들지 않음
    if (!el.matches('[data-k]')) return;
    const [o, k] = dcfPath(dcfSt(c), el.dataset.k);
    if (el.value === el.dataset.b) delete o[k]; else o[k] = el.value;
    dcfS.typing = el.dataset.k; dcfDraw();
  });
  host.addEventListener('focusout', (e) => { // 비운 칸은 나갈 때 처음 값으로, 못 읽는 칸은 「숫자 확인」. 다시 그리지 않아 바로 누른 단추가 안 사라짐
    const el = e.target; if (!el.matches?.('[data-k]')) return;
    if (dcfS.typing === el.dataset.k) dcfS.typing = null;
    if (el.value.trim() !== '') { if (dcfNumOf(el.value) == null) dcfBadMark(el); return; }
    const c = dcfCase(); if (!c) return;
    const [o, k] = dcfPath(dcfSt(c), el.dataset.k);
    delete o[k]; el.value = el.dataset.b; el.classList.remove('chg'); dcfSave();
  });
  host.addEventListener('change', (e) => {
    if (e.target.matches('[data-dcf-case]')) { dcfS.cid = e.target.value; dcfDraw(); }
  });
}

async function dcfDownload(btn, c) {
  if (btn.disabled) return;
  btn.disabled = true;
  const rel = c.xlsx || `data/valuation/${c.id}_DCF.xlsx`;
  vaBusy(btn, true);
  try {
    const meta = await STORE.meta(rel);
    if (!meta) { toast('아직 올라간 엑셀이 없습니다.'); return; }
    const sh = STORE.sharedItem(rel);
    const blob = await G.get(sh ? `${sh}/content` : `${STORE.path(rel)}:/content`, { type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `[유니버스인베스트먼트] ${c.target.name} DCF_${String(c.day).replace(/-/g, '').slice(2)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; vaBusy(btn, false); }
}

async function renderDcf(host) {
  host.setAttribute('data-dcf', '');
  dcfBind(host);
  await dcfLoad();
  const u = dcfS.data?.updated_at ? new Date(dcfS.data.updated_at) : null, upd = $('#va-upd');
  if (upd && u && !isNaN(u)) upd.textContent = `${u.getMonth() + 1}/${u.getDate()} ${pad(u.getHours())}:${pad(u.getMinutes())} 업데이트`;
  dcfDraw();
}

// ---------- 화면 설명 (사례를 열면 그 사례의 규칙과 출처로 다시 채움) ----------
function dcfInfo(c) {
  const sw = c?.switches || {}, mk = c?.market || {}, hy = c?.hist_years || [], rv = c?.reverse?.inp;
  const hist = hy.length ? `최근 ${hy.length}년(${hy[0]}～${hy[hy.length - 1]}년)` : '최근 3년';
  const rl = c?.rules || {};
  const src = [
    mk.rf?.avg_3m_source || mk.rf?.source ? `무위험이자율: ${mk.rf.avg_3m_source || mk.rf.source}` : '무위험이자율: 한국은행 ECOS 국고채 10년',
    mk.erp?.source ? `주식위험프리미엄: ${mk.erp.source}` : '주식위험프리미엄: Damodaran 국가별 위험프리미엄',
    mk.cpi?.source ? `소비자물가: ${mk.cpi.source}` : '소비자물가: KOSIS 소비자물가지수',
    mk.tax?.source ? `한계세율: ${mk.tax.source}` : '한계세율: 법인세법, 지방세법',
    mk.spread?.source ? `합성등급 스프레드: ${mk.spread.source}` : '합성등급 스프레드: Valley AI 화면 값',
    `재무제표: ${c?.src_fs || '와이즈리포트 재무제표(연결)'}. 투하자본은 와이즈리포트 cF4002 IC`,
    '컨센서스와 베타: 와이즈리포트(네이버 기업정보). 52주 베타는 기간과 주기 표시 없음, 1년 베타는 참고',
    '화면 구성과 기본값: Valley AI 「DCF 실전형」과 「리버스 DCF」(06. 투자 심사·실행 > 가치평가 학습 노트 (Valley AI) 01, 02)',
    '계산 원본과 사례 폴더: 05. 딜소싱 > _자동화 > 가치평가 > dcf.py, cases',
  ];
  return { title: 'DCF', rows: [
    ['이 화면', '회사가 앞으로 벌어들일 영업 현금흐름(FCFF)을 WACC로 할인해 순영업자산가치를 구하고, 비영업자산을 더하고 비주주청구권을 빼 주당 내재 가치를 냅니다. Valley AI 「DCF 실전형」처럼 매출 성장률, 원가율, 영업비용률, 재투자는 첫해와 마지막 해 값만 정하고 그 사이를 직선으로 잇습니다. 계산은 파이썬(dcf.py), 엑셀, 이 화면이 같은 식으로 합니다.'],
    ['바꿔 볼 수 있는 것', ['추정 기간 5, 10, 15년: 첫해와 마지막 해 값은 그대로 두고 그 사이 연수만 늘림', '재투자 방식: 매출 대비 재투자비용(기본) 또는 투하자본회전율', '시나리오 Bull, Base, Bear: 머리 단추나 요약의 시나리오 칸', '상세 탭: 고른 시나리오의 첫해와 마지막 해 값, 영구성장률, 장기 ROIC, 유효세율, 한계세율, 무위험이자율, 주식위험프리미엄, 추가 위험, 베타 방식과 값, 조정 비중, 스프레드', '민감도 탭: 이중 변수 간격, 단일 변수 막대', '시나리오 탭: 가중치. 합이 100%가 아니면 가중평균을 비움', '리버스 DCF 탭: 주가, 기간, 성장 형태, 할인율, 최종 P/FCF, 순이익률, FCF 전환 비율', '바꾼 칸은 파란 바탕. 칸을 비우면 처음 값, 처음 값으로 단추는 모두 되돌림', 'DCF 맵 단계를 누르면 그 입력 칸으로 감']],
    ['매출과 이익', ['총매출 = 전년 매출 × (1 + 성장률). 첫해 성장률은 컨센서스, 마지막 해는 영구성장률', '영업이익 = 매출 × (1 − 매출원가율 − 영업비용률). 첫해 원가율은 와이즈리포트 올해 매출총이익 추정, 영업비용률은 컨센서스 영업이익에 맞춤', `마지막 해 원가율과 영업비용률: Base는 ${hist} 평균, Bull은 최저, Bear는 최고`, `법인세 = 영업이익 × 유효세율(${hist} 유효세율 평균, 모든 해 같음)`, '세후영업이익 = 영업이익 − 법인세']],
    ['재투자', ['매출 대비 방식: 재투자비용 = 매출 × 재투자율. 첫해 재투자율은 과거 평균, 마지막 해는 비우면 종료가치 재투자율과 이어지게 g ÷ 장기 ROIC × 마지막 해 세후 영업이익률', '투하자본회전율 방식: 투하자본 = 매출 ÷ 회전율, 재투자비용 = 투하자본 증가분. 첫해 회전율은 과거 평균, 마지막 해 회전율은 마지막 해 ROIC ÷ 마지막 해 세후 영업이익률', '과거 재투자비용 = CAPEX − 감가상각비 + 순운전자본 증가(Valley: Net CapEx + Changes in NWC)', 'ROIC = 세후영업이익 ÷ 투하자본']],
    ['FCFF와 할인', ['FCFF = 세후영업이익 − 재투자비용', sw.discount === 'mid' ? '할인 기간: 기중(첫해는 절반, 그 뒤는 결산까지 연수 − 0.5)' : '할인 기간 = 연차 − 직전 결산일 뒤 지난 날수 ÷ 365, 기말 할인(Valley)', '할인계수 = 앞 해 할인계수 × (1 + WACC)^(−기간 차이)', '첫해 반영 비율: 현금과 부채가 재무상태표 기준일 값이라 그 뒤부터 연말까지만 넣음(Valley는 통째로)']],
    ['종료가치', ['종료연도 매출 = 마지막 해 매출 × (1 + 영구성장률)', '종료연도 세후 영업이익률 = 마지막 해 영업이익률 × (1 − 유효세율)', '종료연도 재투자 = 영구성장률 ÷ 장기 ROIC × 종료연도 세후영업이익. 장기 ROIC 기본은 WACC(초과수익 없음)', '종료가치 = 종료연도 FCFF ÷ (WACC − 영구성장률), 마지막 해와 같은 할인계수로 할인', sw.g === 'cpi10' || !sw.g ? '영구성장률: 소비자물가 10년 평균. 무위험이자율보다 높으면 무위험이자율로 낮춤' : '영구성장률: 사례에서 정한 값', '영구성장률이 WACC 이상이면 계산할 수 없음']],
    ['WACC', ['WACC = 자기자본 비중 × 자기자본비용 + 부채 비중 × 세전 타인자본비용 × (1 − 한계세율)', '자기자본비용 = 무위험이자율 + 베타 × 주식위험프리미엄 + 추가 위험', '세전 타인자본비용 = 무위험이자율 + 스프레드', '비중: 이자부부채와 시가총액(시장가치)', sw.rf === 'avg_3m' ? '무위험이자율: 국고채 10년 최근 3개월 평균(Valley 방식)' : '무위험이자율: 국고채 10년', '주식위험프리미엄: Damodaran 한국 합계(성숙 시장 + 국가 위험). Valley의 과거 수익률 대신', 'FCFF는 유효세율, WACC와 베타는 한계세율(법인세 최고세율 + 지방소득세)']],
    ['베타', ['회귀(기본): 대상 회사 52주 베타를 무차입화', '바텀업: 비교기업 52주 베타를 회사마다 무차입화한 중앙값', '무차입 베타 = 베타 ÷ (1 + (1 − 한계세율) × D/E)', '조정 무차입 베타 = 무차입 베타 × 조정 비중 + 1 × (1 − 조정 비중). 기본 조정 비중 2/3', '직접 입력: 넣은 값을 재차입 베타로 조정 없이 그대로 씀', '재차입 베타 = 조정 무차입 베타 × (1 + (1 − 한계세율) × 대상 회사 D/E)', '한계세율을 바꾸면 무차입 베타도 다시 계산']],
    ['합성등급', [`이자보상배율(영업이익 최근 4분기 ÷ 직전 결산 이자비용)로 Valley 합성 신용등급 표에서 등급과 스프레드를 고름${c?.coverage != null ? `. ${c.target.name} ${dcfNum(c.coverage, 1)}배, ${c.rating}` : ''}`, '스프레드는 미국 회사채 기준 Valley 화면 값']],
    ['시나리오', [`Bull: ${rl.Bull || '첫해 매출 성장률 Base + 5%p, 마지막 해 원가율과 영업비용률 최저'}`, `Base: ${rl.Base || '첫해는 컨센서스, 마지막 해 과거 평균'}`, `Bear: ${rl.Bear || '첫해 매출 성장률 과거 최저, 마지막 해 원가율과 영업비용률 최고'}`, '가중평균 = 시나리오별 내재 가치 × 가중치의 합(기본 1/3씩), 100원 단위 반올림. 가중치 합이 100%가 아니면 계산하지 않음(Valley는 그대로 계산함)']],
    ['민감도', ['이중 변수: WACC × 영구성장률, WACC × 종료연도 세후 영업이익률. 간격 기본 0.15%p(Valley), 5 × 5', '가운데 칸이 지금 값. 고른 시나리오와 다른 입력은 그대로 두고 두 값만 바꿔 계산', '단일 변수: 막대를 움직이면 그 값만 바꾼 조정 내재 가치', '빨강은 현재가보다 높음, 파랑은 낮음']],
    ['리버스 DCF', ['지금 주가를 맞추는 주당 FCF 성장률을 거꾸로 풂(Valley P/FCF 방식)', '주가 = Σ 주당 FCF(t) ÷ (1 + 할인율)^t + n년 뒤 주당 FCF × 최종 P/FCF ÷ (1 + 할인율)^n, 기말 할인', '성장 형태: 고성장기 복리 F0 × (1 + g)^t, 초기 성숙기 단리 F0 + (Fn − F0) × t ÷ n, 완전 성숙기 로그 F0 + (Fn − F0) × ln(1 + t) ÷ ln(1 + n)', '내재 매출 성장률: n년 뒤 주당 매출 = n년 뒤 주당 FCF ÷ (순이익률 × FCF 전환 비율), (그 값 ÷ 지금 주당 매출)^(1/n) − 1', '출구 가치 비중 = n년 뒤 출구 가치의 현재가치 ÷ 주가', `기본값: 할인율 10%(Valley 고정값), 최종 P/FCF, 순이익률, 전환 비율은 직전 결산 실적${rv?.ttm_end ? `. 주당 FCF와 매출은 ${rv.ttm_end}까지 4분기` : ''}`, '차트: 막대는 매출 실적, 선은 주가가 담은 매출 경로, 점선은 컨센서스']],
    ['읽는 법', ['상승여력 = 내재 가치 ÷ 현재가 − 1(Valley 괴리율과 반대 방향)', '비영업자산 = 현금성자산(이자부부채 − 순부채) + 사례에서 정한 비영업자산', '비주주청구권 = 이자부부채 + 비지배지분', '주식 수 = 보통주(자사주 제외) + 우선주', '점검: 오류는 계산 불가, 주의는 확인할 것, 참고는 기준일과 근거. 처음 값 기준은 파이썬이 낸 결과', '다른 가정: 바텀업 베타, 조정 안 한 회귀 베타, 10년 추정, 무위험이자율 기준일 값으로 바꾼 결과(파이썬, Base)', '사용자 확인 대기: 아직 정하지 않은 가정']],
    ['출처', src],
  ] };
}
TAB_INFO.valuation_dcf = dcfInfo(null);
