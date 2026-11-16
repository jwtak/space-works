/* 투자업무 › 가치평가 › DCF.
   데이터: OneDrive data/valuation_dcf.json {updated_at, cases: [dcf_web.json, ...]}. 05. 딜소싱\_자동화\가치평가 에서 dcf.py run 뒤 publish.py 로 올린다.
   계산 dcfWacc(), dcfCompute(), dcfSens()는 dcf.py wacc_parts(), compute(), sensitivities()와 같은 순서, 같은 식이다. 고치면 dcf.py, 엑셀 수식과 같이 고친다.
   처음 값으로 낸 결과를 사례의 py 값(파이썬 결과)과 맞춰 보고(dcfVerify), 다르면 점검 칸에 오류로 띄운다.
   valuation.js renderValuation()이 #valuation/dcf 에서 renderDcf(#va-host)를 부른다. 파일 순서에 흔들리지 않게 vaXxx 함수는 부르지 않는다.
   app.js 전역($, esc, pad, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn), graph.js STORE·G, market.css(.mk-*)와 valuation.css(.va-*) 클래스를 쓴다. */
const DCF_FILE = 'data/valuation_dcf.json';
const DCF_TTL = 600000;
const DCF_SENS = { sens_wacc: [-0.01, -0.005, 0, 0.005, 0.01], sens_g: [-0.01, -0.005, 0, 0.005, 0.01], sens_growth: [-0.02, -0.01, 0, 0.01, 0.02] };
// 화면에서 바꿀 수 있는 입력. sc: 화면 값 ÷ sc = 계산 값, d: 화면에 보일 소수 자리
const DCF_IN = {
  rf: { label: '무위험이자율', unit: '%', sc: 100, d: 3, step: 0.01 },
  erp: { label: '주식위험프리미엄', unit: '%', sc: 100, d: 3, step: 0.01 },
  beta_u: { label: '무부채 베타', unit: '', sc: 1, d: 3, step: 0.01 },
  beta: { label: '재부채 베타', unit: '', sc: 1, d: 3, step: 0.01 },
  spread: { label: '스프레드', unit: '%', sc: 100, d: 3, step: 0.01 },
  kd: { label: '세전 타인자본비용', unit: '%', sc: 100, d: 3, step: 0.01 },
  tax: { label: '세율', unit: '%', sc: 100, d: 2, step: 0.1 },
  g: { label: '영구성장률', unit: '%', sc: 100, d: 2, step: 0.1 },
  margin: { label: '4년차부터 영업이익률', unit: '%', sc: 100, d: 2, step: 0.5 },
  dg: { label: '4년차부터 성장률 가산', unit: '%p', sc: 100, d: 2, step: 0.5 },
};
const dcfS = { data: null, at: 0, loading: null, err: '', cid: null, ov: {}, sc: {} };
Object.assign(dcfS, viewGet('dcf', {}));
const dcfSave = () => viewSet('dcf', { cid: dcfS.cid, ov: dcfS.ov, sc: dcfS.sc });

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
const dcfUp = (u, d = 1) => (u == null ? '' : `<span class="${u > 0 ? 'up' : u < 0 ? 'dn' : ''}">${u > 0 ? '+' : ''}${dcfNum(u * 100, d)}%</span>`);
const dcfSgn = (v) => (v == null ? '-' : `${v < 0 ? '−' : '+'}${dcfNum(Math.abs(v))}억`);
const dcfSec = (title, right, body, cls = '', id = '') => `<section class="card mk-sec ${cls}"${id ? ` id="${id}"` : ''}><div class="card-head"><h2>${title}</h2>${right || ''}</div><div class="mk-body">${body}</div></section>`;
const dcfMed = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

// ---------- 계산 (dcf.py 와 같은 식) ----------
const dcfRound = (x, unit) => Math.floor(x / unit + 0.5) * unit;

function dcfUnlever(peers, t) { // dcf.py beta_unlever: 비교기업 [52주 베타, D/E]를 세율 t로 무부채화한 중앙값
  const xs = peers.map(([b, de]) => b / (1 + (1 - t) * de)).sort((a, b) => a - b), n = xs.length;
  return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
}
function dcfWacc(inp, ov) {
  const W = inp.wacc;
  const t = ov.tax ?? inp.tax, rf = ov.rf ?? W.rf, erp = ov.erp ?? W.erp;
  let bl, bu = null;
  if (W.beta_mode === 'own') bl = W.beta_own;
  else if (W.beta_mode === 'input') bl = W.beta_input;
  else {
    bu = ov.beta_u ?? (W.peers ? dcfUnlever(W.peers, t) : W.beta_u); // 세율을 바꾸면 비교기업 무부채 베타도 다시 계산(엑셀과 같음)
    bl = bu * (1 + (1 - t) * W.de);
  }
  if (ov.beta != null) bl = ov.beta;
  const aw = ov.adj_w ?? W.adj_w;
  let b = aw * bl + (1 - aw) * 1.0;
  if (W.beta_floor != null && b < W.beta_floor) b = W.beta_floor;
  const ke = rf + b * erp;
  const kd = ov.kd != null ? ov.kd : W.kd_mode === 'input' ? W.kd_input : rf + (ov.spread ?? W.spread);
  const wd = W.D / (W.D + W.E);
  let wacc = (1 - wd) * ke + wd * kd * (1 - t);
  if (ov.wacc != null) wacc = ov.wacc;
  return { tax: t, rf, erp, beta_u: W.beta_mode === 'bottom_up' ? bu : null, beta_l: bl, beta: b, ke, kd, kd_at: kd * (1 - t), wd, we: 1 - wd, wacc };
}

// inp: dcf_web.json 의 inp. ov: 바꿔 볼 값(tax, rf, erp, beta_u, beta, adj_w, spread, kd, wacc, g, roc, margin, dg, growth=[2년차, 3년차 성장률])
function dcfCompute(inp, ov = {}) {
  const w = dcfWacc(inp, ov);
  const t = w.tax, wacc = w.wacc;
  const g = ov.g ?? inp.g;
  const roc = ov.roc ?? (inp.roc_mode === 'wacc' ? wacc : inp.roc_value);
  const N = inp.N, C = inp.C, R = inp.ratio, cons = inp.cons;
  const grOv = ov.growth;
  const dg = ov.dg ?? inp.dg;
  const rows = [];
  let prev = inp.rev0;
  for (let k = 0; k < N; k++) {
    let gk, rev, op;
    if (k < C) {
      if (grOv != null && k >= 1) {
        gk = grOv[k - 1];
        rev = prev * (1 + gk);
        op = rev * cons.op[k] / cons.rev[k];
      } else {
        rev = cons.rev[k]; op = cons.op[k];
        gk = rev / prev - 1;
      }
    } else {
      const gC = rows[C - 1].growth, mC = rows[C - 1].margin;
      gk = gC + (g - gC) * (k - C + 1) / (N - C) + dg;
      rev = prev * (1 + gk);
      const m = ov.margin ?? (inp.margin_ext != null ? inp.margin_ext : mC);
      op = rev * m;
    }
    const nopat = op * (1 - t);
    const daR = R.da * rev;
    const dnwc = R.nwc * (rev - prev);
    let da, capex, reinv, rr;
    if (k < C) {
      da = cons.da[k] != null ? cons.da[k] : daR;
      capex = R.capex * rev;
      reinv = capex - da + dnwc;
      rr = reinv / nopat;
    } else {
      const rrC = rows[C - 1].rr;
      rr = rrC + (g / roc - rrC) * (k - C + 1) / (N - C);
      reinv = rr * nopat;
      da = daR;
      capex = reinv + da - dnwc;
    }
    const fcff = nopat - reinv;
    const f = k === 0 ? inp.stub : 1.0;
    const df = (1 + wacc) ** (-inp.t_mid[k]);
    rows.push({ year: inp.years[k], growth: gk, rev, margin: op / rev, op, tax: op * t, nopat, da, capex, dnwc, reinv, rr, fcff, f, cf: fcff * f, t: inp.t_mid[k], df, pv: fcff * f * df });
    prev = rev;
  }
  const pvSum = rows.reduce((a, r) => a + r.pv, 0);
  const last = rows[rows.length - 1];
  const ok = wacc > g;
  const tv = ok ? last.op * (1 - t) * (1 + g) * (1 - g / roc) / (wacc - g) : null;
  const pvTv = ok ? tv * (1 + wacc) ** (-inp.t_tv) : null;
  const B = inp.bridge;
  const ev = ok ? pvSum + pvTv : null;
  const eq = ok ? ev + B.cash + B.nonop - B.debt - B.nci : null;
  const psRaw = ok ? eq * 1e8 / B.shares : null;
  const ps = ok ? dcfRound(psRaw, inp.round) : null;
  return { ...w, g, roc, rr_t: g / roc, rows, pv_sum: pvSum, tv, pv_tv: pvTv, ev, eq, ps_raw: psRaw, ps,
    tv_share: ok && ev ? pvTv / ev : null, up: ok && inp.close ? ps / inp.close - 1 : null };
}

// 민감도: 지금 WACC와 g(또는 성장률 가산)를 가운데로, 나머지 입력은 그대로
function dcfSens(inp, base, ov, cfg) {
  const ws = cfg.sens_wacc.map((d) => base.wacc + d);
  const gs = cfg.sens_g.map((d) => base.g + d);
  const d0 = ov.dg ?? inp.dg, ds = cfg.sens_growth.map((d) => d0 + d);
  return { wacc: ws, g: gs, dg: ds,
    wacc_g: ws.map((w) => gs.map((g) => dcfCompute(inp, { ...ov, wacc: w, g }).ps)),
    wacc_growth: ws.map((w) => ds.map((d) => dcfCompute(inp, { ...ov, wacc: w, dg: d }).ps)) };
}
const dcfCfg = (c) => { const s = c.switches || {}, o = { ...DCF_SENS }; for (const k of Object.keys(DCF_SENS)) if (Array.isArray(s[k])) o[k] = s[k]; return o; };

// 처음 값 계산이 파이썬 결과(c.py)와 같은지. JSON이 소수 10자리로 잘려 있어 상대 오차 1e-7까지는 같다고 봄. 주당 가치와 민감도 표는 원 단위까지 같아야 함
function dcfVerify(c) {
  if (c._v) return c._v;
  const p = c.py, bad = [];
  let n = 0, max = 0;
  if (!p?.base) return (c._v = { ok: true, n, max, bad });
  const near = (lab, a, x) => {
    if (a == null && x == null) return;
    n++;
    const d = a == null || x == null ? Infinity : Math.abs(a - x) / Math.max(1, Math.abs(x));
    if (d > max) max = d;
    if (d > 1e-7) bad.push(`${lab} 화면 ${a} 파이썬 ${x}`);
  };
  const same = (lab, a, x) => { n++; if (a !== x) bad.push(`${lab} 화면 ${a} 파이썬 ${x}`); };
  const b = dcfCompute(c.inp, {});
  for (const k of ['tax', 'rf', 'erp', 'beta_u', 'beta_l', 'beta', 'ke', 'kd', 'kd_at', 'wd', 'we', 'wacc', 'g', 'roc', 'rr_t', 'pv_sum', 'tv', 'pv_tv', 'ev', 'eq', 'ps_raw', 'tv_share', 'up']) if (k in p.base) near(k, b[k], p.base[k]);
  same('주당 가치', b.ps, p.base.ps);
  (p.base.rows || []).forEach((x, i) => { for (const k of Object.keys(x)) if (k !== 'year') near(`${x.year} ${k}`, b.rows[i]?.[k], x[k]); });
  if (p.sens) {
    const s = dcfSens(c.inp, b, {}, dcfCfg(c));
    for (const k of ['wacc', 'g', 'dg']) (p.sens[k] || []).forEach((x, i) => near(`민감도 ${k} ${i}`, s[k][i], x));
    for (const k of ['wacc_g', 'wacc_growth']) (p.sens[k] || []).forEach((row, i) => row.forEach((x, j) => same(`민감도 ${k} ${i},${j}`, s[k][i][j], x)));
  }
  for (const [k, v] of Object.entries(p.scen || {})) {
    const r = k === 'Base' ? b : dcfCompute(c.inp, { growth: v.growth });
    same(`${k} 주당 가치`, r.ps, v.ps);
    near(`${k} 상승여력`, r.up, v.up); near(`${k} 기업가치`, r.ev, v.ev); near(`${k} 3년차 매출`, r.rows[c.inp.C - 1].rev, v.rev_last); near(`${k} 영구가치 비중`, r.tv_share, v.tv_share);
  }
  c._v = { ok: !bad.length, n, max, bad };
  if (bad.length) console.warn('DCF 화면 계산이 파이썬 결과와 다름', c.id, bad);
  return c._v;
}

// ---------- 입력과 모델 ----------
const dcfCase = () => { const cs = dcfS.data?.cases || []; return cs.find((x) => x.id === dcfS.cid) || cs[0] || null; };
const dcfKdKey = (c) => (c.inp.wacc.kd_mode === 'input' ? 'kd' : 'spread');
const dcfB0 = (c) => (c._b0 ||= dcfCompute(c.inp, {}));
function dcfUserOv(c) {
  const u = dcfS.ov[c.id] || {}, o = {};
  for (const [k, v] of Object.entries(u)) if (DCF_IN[k] && v != null && v !== '' && Number.isFinite(+v)) o[k] = +v / DCF_IN[k].sc;
  return o;
}
function dcfModel(c) {
  const scen = c.py?.scen || {}, ov = dcfUserOv(c);
  const cur = scen[dcfS.sc[c.id]] ? dcfS.sc[c.id] : 'Base';
  const ovOf = (k) => (k === 'Base' || !scen[k] ? ov : { ...ov, growth: scen[k].growth });
  const r = dcfCompute(c.inp, ovOf(cur));
  const scs = ['Bull', 'Base', 'Bear'].filter((k) => k === 'Base' || scen[k]).map((k) => ({ k, rule: scen[k]?.rule || '', r: k === cur ? r : dcfCompute(c.inp, ovOf(k)) }));
  return { r, sc: cur, scs, ov: ovOf(cur), sens: dcfSens(c.inp, r, ovOf(cur), dcfCfg(c)) };
}
function dcfBase(c, m, k) { // 입력 칸의 처음 값(화면 단위). 재부채 베타는 다른 입력을 반영한 지금 값
  const inp = c.inp, W = inp.wacc;
  const x = { rf: W.rf, erp: W.erp, beta_u: dcfWacc(inp, { ...m.ov, beta_u: null }).beta_u, beta: dcfWacc(inp, { ...m.ov, beta: null }).beta_l, spread: W.spread, kd: W.kd_input,
    tax: inp.tax, g: inp.g, margin: inp.margin_ext ?? dcfB0(c).rows[inp.C - 1].margin, dg: inp.dg }[k];
  return x == null || !Number.isFinite(x) ? null : +(x * DCF_IN[k].sc).toFixed(DCF_IN[k].d);
}
const dcfChanged = (c) => Object.keys(dcfS.ov[c.id] || {}).length > 0 || (dcfS.sc[c.id] && dcfS.sc[c.id] !== 'Base');

// ---------- 화면 조각 ----------
function dcfHead(c) {
  const t = c.target, cs = dcfS.data.cases, B = c.inp.bridge, nd = B.debt - B.cash;
  const pick = cs.length > 1 ? `<select class="va-case" data-dcf-case aria-label="평가 사례">${cs.map((x) => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.target.name)} ${esc(x.day)}</option>`).join('')}</select>` : '';
  const kv = [['시가총액', `${dcfNum(t.mcap)}억`], [nd < 0 ? '순현금' : '순부채', `${dcfNum(Math.abs(nd))}억`], ['52주 범위', `${dcfNum(t.low52)} ～ ${dcfNum(t.high52)}원`], ['증권사 목표가 평균', dcfWon(t.target_mean)]];
  return `<section class="card va-head"><div class="va-ttl"><div><h2>${esc(t.name)} <small>${esc(t.code)}</small></h2>
      <p>기준일 ${esc(c.day)}${t.bs_date ? `, 재무상태표 ${esc(t.bs_date)}` : ''}${t.wics ? `, WICS ${esc(t.wics)}` : ''}</p></div>
      <div class="va-tools">${pick}${infoBtn('valuation_dcf')}<button class="btn ghost" type="button" id="dcf-xlsx">${ico('file', 'sm')}엑셀 받기</button></div></div>
    <dl class="va-kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`;
}

function dcfTop(c, m) {
  const r = m.r, t = c.target, inp = c.inp;
  const box = r.ps == null
    ? `<div class="va-tpbox dcf-tp"><p>영구성장률 ${dcfPct(r.g, 2)}이 WACC ${dcfPct(r.wacc, 2)} 이상이라 계산할 수 없습니다.</p></div>`
    : `<div class="va-tpbox dcf-tp"><div class="dcf-tp-ps"><span>DCF 주당 가치</span><b>${dcfWon(r.ps)}</b></div><div><span>현재가</span><b>${dcfWon(t.close)}</b></div><div><span>상승여력</span><b>${dcfUp(r.up)}</b></div>
      <p>${m.sc}, WACC ${dcfPct(r.wacc, 2)}, 영구성장률 ${dcfPct(r.g, 2)}</p></div>`;
  const yrs = inp.years.slice(1, inp.C);
  const tiles = m.scs.map((s) => `<button type="button" class="dcf-sc ${s.k === m.sc ? 'on' : ''}" data-dcf-sc="${s.k}" aria-pressed="${s.k === m.sc}" ${s.rule ? `title="${esc(s.rule)}"` : ''}>
      <span>${s.k}</span><b>${dcfWon(s.r.ps)}</b>${dcfUp(s.r.up)}<small>${yrs.map((y, i) => `${y}년 ${dcfPct(s.r.rows[i + 1].growth)}`).join(', ')}</small></button>`).join('');
  return dcfSec('DCF 요약', `<span class="meta">시나리오별 2～${inp.C}년차 매출 성장률</span>`, `<div class="dcf-top">${box}<div class="dcf-scs">${tiles}</div></div>`, '', 'dcf-top');
}

function dcfKv(c, m) {
  const r = m.r, C = c.inp.C, y = c.inp.years[C - 1], row = r.rows[C - 1];
  const kv = [['WACC', dcfPct(r.wacc, 2)], ['영구성장률', dcfPct(r.g, 2)], [`${y}년 매출 성장률`, dcfPct(row.growth)], [`${y}년 영업이익률`, dcfPct(row.margin)],
    ['4년차부터 영업이익률', dcfPct(r.rows[C]?.margin)], ['영구가치 비중', dcfPct(r.tv_share)], ['기업가치', r.ev == null ? '-' : `${dcfNum(r.ev)}억`]];
  return `<dl class="va-kv" id="dcf-kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function dcfField(c, m, k) {
  const f = DCF_IN[k], u = dcfS.ov[c.id] || {}, on = u[k] != null, base = dcfBase(c, m, k);
  return `<label class="dcf-f ${on ? 'chg' : ''}" data-dcf-f="${k}"><span>${f.label}</span>
    <span class="dcf-iw ${f.unit ? '' : 'nu'}"><input type="number" step="${f.step}" inputmode="decimal" data-dcf-in="${k}" value="${on ? u[k] : base ?? ''}">${f.unit ? `<em>${f.unit}</em>` : ''}</span>
    <small class="dcf-was">처음 ${base ?? '-'}</small></label>`;
}
function dcfAsm(c, m) {
  const grp = (title, keys) => `<div><h3 class="va-h3">${title}</h3><div class="dcf-in">${keys.map((k) => dcfField(c, m, k)).join('')}</div></div>`;
  const body = `${dcfKv(c, m)}<div class="dcf-ins">${grp('할인율', ['rf', 'erp', ...(c.inp.wacc.beta_mode === 'bottom_up' ? ['beta_u'] : []), 'beta', dcfKdKey(c), 'tax'])}${grp('성장', ['g', 'margin', 'dg'])}</div>`;
  return dcfSec('핵심 가정', `<button class="btn ghost sm act" type="button" data-dcf-reset ${dcfChanged(c) ? '' : 'disabled'}>처음 값으로</button>`, body, 'dcf-asm');
}

function dcfFcff(c, m) {
  const inp = c.inp, C = inp.C, N = inp.N, rows = m.r.rows;
  const bl = (i) => (i === C ? 'bl' : '');
  const f = { n: (v) => dcfNum(v), p: (v) => dcfPct(v), p0: (v) => dcfPct(v, 0), d: (v) => dcfNum(v, 3) };
  const L = [['매출', 'rev', 'n', 'strong'], ['성장률', 'growth', 'p', 'sub'], ['영업이익', 'op', 'n', 'strong'], ['영업이익률', 'margin', 'p', 'sub'], ['세금', 'tax', 'n'], ['NOPAT', 'nopat', 'n', 'strong'],
    ['감가상각비', 'da', 'n'], ['CAPEX', 'capex', 'n'], ['순운전자본 증가', 'dnwc', 'n'], ['재투자율', 'rr', 'p', 'sub'], ['FCFF', 'fcff', 'n', 'strong'], ['반영 비율', 'f', 'p0', 'sub'], ['할인계수', 'df', 'd', 'sub'], ['현재가치', 'pv', 'n', 'key']];
  const head = `<tr class="dcf-grp"><th class="st"></th><th colspan="${C}" class="tx">컨센서스</th><th colspan="${N - C}" class="tx bl">수렴</th></tr>
    <tr><th class="st">억원</th>${rows.map((x, i) => `<th class="${bl(i)}">${x.year}</th>`).join('')}</tr>`;
  const body = L.map(([lab, k, fm, cls]) => `<tr class="${cls || ''}"><td class="st">${lab}</td>${rows.map((x, i) => `<td class="${bl(i)}" ${k === 'df' ? `title="할인 시점 ${dcfNum(x.t, 2)}년"` : ''}>${f[fm](x[k])}</td>`).join('')}</tr>`).join('');
  return dcfSec('FCFF 추정', `<span class="meta">${inp.years[0]}～${inp.years[N - 1]}년</span>`, `<div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-fcff"><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
}

function dcfWaccSec(c, m) {
  const r = m.r, inp = c.inp, W = inp.wacc, mk = c.market || {}, ov = m.ov, peers = c.peers || [];
  const kdNote = ov.kd != null || W.kd_mode === 'input' ? '직접 입력' : `${ov.spread != null ? '스프레드 직접 입력' : `합성등급 ${esc(c.rating || '')}`}, 스프레드 ${dcfPct(ov.spread ?? W.spread, 2)}`;
  const buNote = ov.beta_u != null ? '직접 입력' : W.beta_u != null && peers.length ? `비교기업 ${peers.length}곳 중앙값` : '';
  const blNote = ov.beta != null ? '직접 입력' : ov.beta_u == null && W.beta_mode === 'own' ? '대상 회사 52주 베타' : ov.beta_u == null && W.beta_mode === 'input' ? '직접 입력' : '';
  const rows = [
    ['무위험이자율', dcfPct(r.rf, 2), ov.rf != null ? '직접 입력' : mk.rf?.as_of ? `국고채 10년 ${esc(mk.rf.as_of)}` : ''],
    ['주식위험프리미엄', dcfPct(r.erp, 2), ov.erp != null ? '직접 입력' : mk.erp?.as_of ? `Damodaran ${esc(String(mk.erp.as_of).slice(0, 10))}` : ''],
    ...(r.beta_u != null ? [['무부채 베타', dcfNum(r.beta_u, 3), buNote]] : []),
    ['D/E', dcfPct(W.de, 1), `이자부부채 ${dcfNum(W.D)}억, 시가총액 ${dcfNum(W.E)}억`],
    ['재부채 베타', dcfNum(r.beta_l, 3), blNote],
    ...(Math.abs(r.beta - r.beta_l) > 1e-12 ? [['적용 베타', dcfNum(r.beta, 3), '조정 또는 하한']] : []),
    ['Ke', dcfPct(r.ke, 2), ''],
    ['세전 Kd', dcfPct(r.kd, 2), kdNote],
    ['세율', dcfPct(r.tax, 1), ov.tax != null ? '직접 입력' : ''],
    ['세후 Kd', dcfPct(r.kd_at, 2), ''],
    ['부채 비중', dcfPct(r.wd, 1), ''],
  ];
  const wt = `<div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-wacc"><thead><tr><th class="st">항목</th><th>값</th><th class="tx">근거</th></tr></thead><tbody>
    ${rows.map(([k, v, n]) => `<tr><td class="st">${k}</td><td>${v}</td><td class="tx">${n}</td></tr>`).join('')}
    <tr class="key"><td class="st">WACC</td><td>${dcfPct(r.wacc, 2)}</td><td class="tx"></td></tr></tbody></table></div>`;
  const bu = (p) => p.beta / (1 + (1 - r.tax) * p.de); // 지금 세율로 무부채화
  const med = (k) => dcfMed(peers.map((p) => (k === 'beta_u' ? bu(p) : p[k])));
  const pt = peers.length ? `<div><h3 class="va-h3">비교기업 베타</h3><div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-peer"><thead><tr><th class="st">회사</th><th>52주 베타</th><th>D/E</th><th>무부채 베타</th><th>1년 베타</th></tr></thead><tbody>
    ${peers.map((p) => `<tr><td class="st">${esc(p.name)}</td><td>${dcfNum(p.beta, 2)}</td><td>${dcfPct(p.de)}</td><td>${dcfNum(bu(p), 3)}</td><td>${dcfNum(p.beta_1y, 2)}</td></tr>`).join('')}
    <tr class="key"><td class="st">중앙값</td><td>${dcfNum(med('beta'), 2)}</td><td>${dcfPct(med('de'))}</td><td>${dcfNum(med('beta_u'), 3)}</td><td>${dcfNum(med('beta_1y'), 2)}</td></tr></tbody></table></div></div>` : '';
  return dcfSec('WACC', `<span class="meta">${dcfPct(r.wacc, 2)}</span>`, `<div class="dcf-two wide"><div><h3 class="va-h3">할인율</h3>${wt}</div>${pt}</div>`);
}

function dcfBridge(c, m) {
  const r = m.r, inp = c.inp, B = inp.bridge;
  if (r.ev == null) return dcfSec('주주가치', '', '<div class="empty">영구성장률이 WACC 이상이라 계산할 수 없습니다.</div>');
  const L = (k, v, cls = '') => `<tr class="${cls}"><th>${k}</th><td>${v}</td></tr>`;
  const br = `<table class="va-calc dcf-br"><tbody>${L('추정 기간 현재가치 합', `${dcfNum(r.pv_sum)}억`)}${L('영구가치 현재가치', `${dcfNum(r.pv_tv)}억`)}${L('기업가치', `${dcfNum(r.ev)}억`, 'sum')}
    ${L('현금성자산', dcfSgn(B.cash))}${L('비영업자산', dcfSgn(B.nonop))}${L('이자부부채', dcfSgn(-B.debt))}${L('비지배지분', dcfSgn(-B.nci))}${L('주주가치', `${dcfNum(r.eq)}억`, 'sum')}
    ${L('주식수', `${dcfNum(B.shares)}주`)}</tbody><tbody class="res">${L('주당 가치', dcfWon(r.ps_raw), 'k')}${L(`${dcfNum(inp.round)}원 단위`, dcfWon(r.ps), 'k big')}</tbody></table>`;
  const last = r.rows[r.rows.length - 1];
  const tv = `<table class="va-calc dcf-br"><tbody>${L(`${last.year}년 NOPAT`, `${dcfNum(last.nopat)}억`)}${L('안정기 ROC', dcfPct(r.roc, 2))}${L('안정기 재투자율', dcfPct(r.rr_t))}
    ${L('할인 전 영구가치', `${dcfNum(r.tv)}억`, 'sum')}${L('할인 시점', `${dcfNum(inp.t_tv, 2)}년`)}${L('할인계수', dcfNum((1 + r.wacc) ** (-inp.t_tv), 4))}${L('영구가치 현재가치', `${dcfNum(r.pv_tv)}억`, 'sum')}${L('영구가치 비중', dcfPct(r.tv_share))}</tbody></table>`;
  return dcfSec('주주가치', '', `<div class="dcf-two"><div><h3 class="va-h3">기업가치에서 주당 가치까지</h3>${br}</div><div><h3 class="va-h3">영구가치</h3>${tv}</div></div>`);
}

function dcfSensTbl(title, axis, xs, xfmt, ws, tbl, close) {
  const ci = Math.floor(ws.length / 2), cj = Math.floor(xs.length / 2);
  const cls = (v, i, j) => [v == null ? '' : v > close ? 'up' : v < close ? 'dn' : '', i === ci && j === cj ? 'mid' : ''].join(' ');
  return `<div><h3 class="va-h3">${title}</h3><div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-sens"><thead><tr class="dcf-grp"><th class="st" rowspan="2">WACC</th><th colspan="${xs.length}" class="tx">${axis}</th></tr>
    <tr>${xs.map((x, j) => `<th class="${j === cj ? 'c' : ''}">${xfmt(x)}</th>`).join('')}</tr></thead>
    <tbody>${ws.map((w, i) => `<tr><td class="st ${i === ci ? 'c' : ''}">${dcfPct(w, 2)}</td>${tbl[i].map((v, j) => `<td class="${cls(v, i, j)}">${dcfNum(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
function dcfSensSec(c, m) {
  const s = m.sens, close = c.target.close, sp = (x) => `${x > 0 ? '+' : ''}${dcfNum(x * 100, 1)}%p`;
  return dcfSec('민감도', `<span class="meta">주당 가치(원), 현재가 ${dcfWon(close)}</span>`, `<div class="dcf-two wide">
    ${dcfSensTbl('WACC × 영구성장률', '영구성장률', s.g, (x) => dcfPct(x, 2), s.wacc, s.wacc_g, close)}
    ${dcfSensTbl('WACC × 4년차부터 성장률 가산', '성장률 가산', s.dg, sp, s.wacc, s.wacc_growth, close)}</div>`);
}

function dcfChecks(c, m) {
  const v = dcfVerify(c), r = m.r, L = { err: '오류', warn: '주의', info: '참고' }, ord = { err: 0, warn: 1, info: 2 };
  const now = [];
  if (!v.ok) now.push({ level: 'err', text: `화면 계산이 파이썬 결과와 다름. ${v.bad.slice(0, 3).join(', ')}${v.bad.length > 3 ? ` 외 ${v.bad.length - 3}건` : ''}` });
  if (r.ps == null) now.push({ level: 'err', text: `영구성장률 ${dcfPct(r.g, 2)}이 WACC ${dcfPct(r.wacc, 2)} 이상이라 영구가치를 계산할 수 없음` });
  const li = (xs) => `<ul class="dcf-chk">${[...xs].sort((a, b) => (ord[a.level] ?? 3) - (ord[b.level] ?? 3)).map((x) => `<li><span class="dcf-lv ${esc(x.level)}">${L[x.level] || esc(x.level)}</span><span>${esc(x.text)}</span></li>`).join('')}</ul>`;
  const base = c.checks || [], alt = Object.entries(c.py?.alt || {}), pend = c.pending || [];
  const altT = alt.length ? `<h3 class="va-h3">다른 가정</h3><div class="mk-scroll"><table class="mk-tbl dcf-tbl dcf-alt"><thead><tr><th class="st">가정</th><th>WACC</th><th>주당 가치</th><th>상승여력</th></tr></thead><tbody>
    ${alt.map(([k, x]) => `<tr><td class="st">${esc(k)}</td><td>${dcfPct(x.wacc, 2)}</td><td>${dcfWon(x.ps)}</td><td>${dcfUp(x.up)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const body = `${now.length ? `<h3 class="va-h3">지금 입력 기준</h3>${li(now)}` : ''}${base.length ? `<h3 class="va-h3">처음 값 기준</h3>${li(base)}` : ''}${altT}
    ${pend.length ? `<details class="va-det dcf-pend"><summary>사용자 확인 대기 <span class="n">${pend.length}</span></summary><ul class="va-warn">${pend.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}`;
  return dcfSec('점검', `<span class="meta">${now.length + base.filter((x) => x.level !== 'info').length}건 확인</span>`, body);
}

const dcfRest = (c, m) => dcfFcff(c, m) + dcfWaccSec(c, m) + dcfBridge(c, m) + dcfSensSec(c, m) + dcfChecks(c, m);

// ---------- 그리기 ----------
function dcfDraw() {
  const host = $('#va-host'); if (!host || !host.hasAttribute('data-dcf')) return;
  if (dcfS.err) { host.innerHTML = `<div class="card"><div class="empty">${esc(dcfS.err)}</div></div>`; return; }
  const c = dcfCase();
  if (!c) { host.innerHTML = '<div class="card"><div class="empty">아직 DCF 평가가 없습니다.</div></div>'; return; }
  dcfS.cid = c.id;
  TAB_INFO.valuation_dcf = dcfInfo(c);
  const m = dcfModel(c);
  host.innerHTML = dcfHead(c) + dcfTop(c, m) + dcfAsm(c, m) + `<div class="dcf-rest" id="dcf-rest">${dcfRest(c, m)}</div>`;
  dcfSave();
}
function dcfLive(c) { // 입력을 바꿀 때: 입력 칸은 그대로 두고(커서 유지) 나머지만 다시 그림
  const host = $('#va-host'); if (!host?.querySelector('#dcf-rest')) return dcfDraw();
  const m = dcfModel(c), u = dcfS.ov[c.id] || {};
  host.querySelector('#dcf-top').outerHTML = dcfTop(c, m);
  host.querySelector('#dcf-kv').outerHTML = dcfKv(c, m);
  host.querySelector('#dcf-rest').innerHTML = dcfRest(c, m);
  host.querySelectorAll('[data-dcf-f]').forEach((el) => {
    const k = el.dataset.dcfF, on = u[k] != null, base = dcfBase(c, m, k), inp = el.querySelector('input');
    el.classList.toggle('chg', on);
    el.querySelector('.dcf-was').textContent = `처음 ${base ?? '-'}`;
    if (inp !== document.activeElement) inp.value = on ? u[k] : base ?? '';
  });
  const rs = host.querySelector('[data-dcf-reset]'); if (rs) rs.disabled = !dcfChanged(c);
  dcfSave();
}

function dcfBind(host) {
  host.addEventListener('click', (e) => {
    const c = dcfCase(); if (!c) return;
    const sc = e.target.closest('[data-dcf-sc]');
    if (sc) { dcfS.sc[c.id] = sc.dataset.dcfSc; dcfLive(c); return; }
    if (e.target.closest('[data-dcf-reset]')) { delete dcfS.ov[c.id]; delete dcfS.sc[c.id]; dcfLive(c); return; }
    if (e.target.closest('#dcf-xlsx')) dcfDownload(e.target.closest('#dcf-xlsx'), c);
  });
  host.addEventListener('input', (e) => {
    const el = e.target.closest('[data-dcf-in]'); if (!el) return;
    const c = dcfCase(); if (!c) return;
    const k = el.dataset.dcfIn, u = (dcfS.ov[c.id] ||= {}), v = el.value.trim();
    delete u[k];
    if (v !== '' && Number.isFinite(+v)) { const base = dcfBase(c, dcfModel(c), k); if (base == null || Math.abs(+v - base) > 1e-9) u[k] = +v; }
    if (!Object.keys(u).length) delete dcfS.ov[c.id];
    dcfLive(c);
  });
  host.addEventListener('change', (e) => {
    const c = dcfCase(); if (!c) return;
    if (e.target.matches('[data-dcf-case]')) { dcfS.cid = e.target.value; dcfDraw(); return; }
  });
  host.addEventListener('focusout', (e) => { // 비운 칸은 나갈 때 처음 값으로. 값만 넣고 다시 그리지 않아 바로 누른 버튼이 안 사라짐
    const el = e.target; if (!el.matches?.('[data-dcf-in]') || el.value.trim() !== '' || el.validity?.badInput) return;
    const c = dcfCase(); if (c) el.value = dcfBase(c, dcfModel(c), el.dataset.dcfIn) ?? '';
  });
}

async function dcfDownload(btn, c) {
  if (btn.disabled) return;
  btn.disabled = true;
  const rel = c.xlsx || `data/valuation/${c.id}_DCF.xlsx`;
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
  finally { btn.disabled = false; }
}

async function renderDcf(host) {
  host.setAttribute('data-dcf', '');
  dcfBind(host);
  await dcfLoad();
  const u = dcfS.data?.updated_at ? new Date(dcfS.data.updated_at) : null, upd = $('#va-upd');
  if (upd && u && !isNaN(u)) upd.textContent = `${u.getMonth() + 1}/${u.getDate()} ${pad(u.getHours())}:${pad(u.getMinutes())} 업데이트`;
  dcfDraw();
}

// ---------- 화면 설명 (사례를 열면 그 사례의 출처와 규칙으로 다시 채움) ----------
function dcfInfo(c) {
  const sw = c?.switches || {}, inp = c?.inp, mk = c?.market || {}, hy = c?.hist_years || [];
  const hist = hy.length ? `${hy[0]}～${hy[hy.length - 1]}년` : '최근 3년';
  const sc = c?.py?.scen || {};
  const src = [
    mk.rf?.source ? `무위험이자율: ${mk.rf.source}` : '무위험이자율: 한국은행 ECOS 국고채 10년',
    mk.erp?.source ? `주식위험프리미엄: ${mk.erp.source}` : '주식위험프리미엄: Damodaran 국가별 위험프리미엄',
    mk.cpi?.source ? `소비자물가: ${mk.cpi.source}` : '소비자물가: KOSIS 소비자물가지수',
    mk.tax?.source ? `세율: ${mk.tax.source}` : '세율: 법인세법, 지방세법',
    `재무제표: ${c?.src_fs || '와이즈리포트 재무제표(연결)'}`,
    `컨센서스: ${c?.cons_src ? [...new Set(c.cons_src)].join(', ') : '와이즈리포트 컨센서스'}`,
    '베타: 와이즈리포트 52주 베타. 1년 베타는 참고',
    '계산 원본과 사례 폴더: 05. 딜소싱 > _자동화 > 가치평가 > dcf.py, cases',
  ];
  return { title: 'DCF', rows: [
    ['이 화면', '회사가 앞으로 벌어들일 영업 현금흐름(FCFF)을 WACC로 할인해 기업가치를 구하고, 현금성자산과 비영업자산을 더하고 이자부부채와 비지배지분을 빼 주당 가치를 냅니다. 1～3년차는 증권사 컨센서스, 4～10년차는 성장률과 재투자율이 영구 단계 값으로 수렴하게 둡니다. 계산은 파이썬(dcf.py), 엑셀, 이 화면이 같은 식으로 합니다.'],
    ['바꿔 볼 수 있는 것', ['무위험이자율, 주식위험프리미엄, 스프레드, 세율: 바꾸면 Ke, Kd, WACC를 다시 계산', '무부채 베타: 대상 회사 D/E로 재부채해 씀', '재부채 베타: 넣으면 무부채 베타 대신 그 값을 그대로 씀', '영구성장률', '4년차부터 영업이익률: 처음 값은 3년차 영업이익률', '4년차부터 성장률 가산: 4～10년차 매출 성장률에 더하는 값', '시나리오: Bull, Base, Bear 칸을 누르면 2～3년차 매출 성장률만 바꿔 다시 계산. 영업이익률은 컨센서스 그대로', '바꾼 칸은 파란 테두리, 아래에 처음 값. 칸을 비우면 처음 값', '처음 값으로: 입력과 시나리오를 모두 되돌림']],
    ['FCFF', ['FCFF = NOPAT − 순재투자', 'NOPAT = 영업이익 × (1 − 세율)', '순재투자 = CAPEX − 감가상각비 + 순운전자본 증가', '재투자율 = 순재투자 ÷ NOPAT', `1～3년차: 매출과 영업이익은 컨센서스. 감가상각비는 컨센서스 EBITDA − 영업이익(없으면 매출 × 과거 평균 비율), CAPEX는 매출 × 과거 평균 비율, 순운전자본 증가는 매출 증가분 × 과거 평균 순운전자본 비율`, `과거 평균 비율: ${hist} 실적 평균. 순운전자본 = 매출채권및기타채권 + 재고자산 − 매입채무및기타채무`, '4～10년차 매출 성장률: 3년차 성장률에서 영구성장률까지 해마다 같은 폭으로 내려감(성장률 가산을 넣으면 그만큼 더함)', '4～10년차 영업이익률: 3년차 값 유지(입력으로 바꿀 수 있음)', '4～10년차 재투자율: 3년차 재투자율에서 안정기 재투자율(g ÷ ROC)까지 같은 폭으로 수렴. CAPEX = 순재투자 + 감가상각비 − 순운전자본 증가']],
    ['할인', ['할인계수 = (1 + WACC)^(−t). 현금흐름이 해마다 고르게 들어온다고 보고 기중에 할인', 't: 첫해는 평가 기준일부터 첫 결산일까지의 절반, 그 뒤는 결산일까지 연수 − 0.5', `첫해 반영 비율: 현금과 부채가 재무상태표 기준일 값이라 그 뒤부터 결산일까지만 넣음${inp ? `(${dcfPct(inp.stub)})` : ''}`]],
    ['영구가치', ['영구가치 = 마지막 해 영업이익 × (1 − 세율) × (1 + g) × (1 − g ÷ ROC) ÷ (WACC − g)', '안정기 ROC = WACC. 초과수익이 없다고 봄', sw.tv_timing === 'end' ? '할인 시점: 마지막 해 말' : '할인 시점: 마지막 해와 같은 기중', sw.g === 'cpi10' || !sw.g ? '영구성장률: 소비자물가 10년 평균. 무위험이자율보다 높으면 무위험이자율로 낮춤' : '영구성장률: 사례에서 정한 값', '영구성장률이 WACC 이상이면 계산할 수 없음']],
    ['WACC', ['WACC = 자기자본 비중 × Ke + 부채 비중 × 세전 Kd × (1 − 세율)', 'Ke = 무위험이자율 + 베타 × 주식위험프리미엄', '세전 Kd = 무위험이자율 + 스프레드', '비중: 이자부부채와 시가총액(시장가치) 기준', sw.tax === 'top' || !sw.tax ? '세율: 법인세 최고세율 + 지방소득세' : '세율: 사례에서 정한 값', '무위험이자율: 국고채 10년물 기준일 값', '주식위험프리미엄: Damodaran 한국 위험프리미엄(성숙 시장 프리미엄 + 국가 위험 프리미엄)']],
    ['바텀업 베타', ['비교기업 52주 베타를 회사마다 무부채화: 무부채 베타 = 베타 ÷ (1 + (1 − 세율) × D/E)', '비교기업 무부채 베타 중앙값을 대상 회사 D/E로 재부채화: 재부채 베타 = 무부채 베타 × (1 + (1 − 세율) × D/E)', 'D/E: 이자부부채 ÷ 시가총액', '세율을 바꾸면 비교기업 무부채 베타와 중앙값도 새 세율로 다시 계산', '1년 베타: 참고용, 계산에는 쓰지 않음']],
    ['합성등급', [`이자보상배율(직전 결산 영업이익 ÷ 이자비용)로 Damodaran 합성등급 표에서 등급과 스프레드를 고름${c?.coverage != null ? `. ${c.target.name} ${dcfNum(c.coverage, 1)}배, ${c.rating}` : ''}`, '시가총액이 기준보다 크면 대형 기업 표, 작으면 소형 기업 표']],
    ['시나리오', [`Bull: ${sc.Bull?.rule || '2～3년차 매출 성장률 컨센서스 + 5%p'}`, `Base: ${sc.Base?.rule || '컨센서스'}`, `Bear: ${sc.Bear?.rule || '2～3년차 매출 성장률을 최근 3년 실적 성장률 최솟값으로'}`, '시나리오 칸의 값은 지금 입력을 그대로 두고 성장률만 바꾼 결과']],
    ['민감도', ['WACC × 영구성장률, WACC × 4년차부터 성장률 가산', '가운데 칸이 지금 입력 값. 다른 입력과 시나리오는 그대로 두고 두 값만 바꿔 계산', '빨강은 현재가보다 높음, 파랑은 낮음']],
    ['읽는 법', ['DCF 요약: 지금 입력과 고른 시나리오의 주당 가치, 시나리오별 주당 가치와 2～3년차 매출 성장률', 'FCFF 추정: 컨센서스(1～3년차)와 수렴(4～10년차) 구간. 할인계수에 마우스를 올리면 할인 시점', '주주가치: 기업가치 + 현금성자산 + 비영업자산 − 이자부부채 − 비지배지분 = 주주가치, ÷ 주식수 = 주당 가치', '현금성자산 = 이자부부채 − 순부채. 주식수 = 보통주(자사주 제외) + 우선주', `주당 가치는 ${inp ? dcfNum(inp.round) : '100'}원 단위 반올림`, '점검: 오류는 계산 불가, 주의는 확인할 것, 참고는 기준일과 근거. 처음 값 기준은 파이썬이 낸 결과', '다른 가정: 베타 하한, 대상 회사 자체 베타, 구간 세율 등으로 바꿨을 때의 결과(파이썬)', '사용자 확인 대기: 아직 정하지 않은 가정']],
    ['출처', src],
  ] };
}
TAB_INFO.valuation_dcf = dcfInfo(null);
