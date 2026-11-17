/* 투자업무 › 가치평가. 위 탭 셋: 시장동향(#valuation), 재무분석(#valuation/fin), 가치평가(하위 탭 요약 #valuation/sum, 상대가치평가 #valuation/rel, 절대가치평가 #valuation/dcf).
   탭 아래 회사 줄(#va-co)에서 고른 종목코드(vaS.code) 하나를 모든 탭이 같이 쓴다. 처음 들어오면 고른 회사가 없다(2026-11-17 사용자: 기본은 미선택).
   재무분석은 valuation_fin.js renderFin(host, code), 절대가치평가는 valuation_v3.js renderV3(host)가 그 회사의 v3 사례로 그린다.
   시장동향: 전 상장사 PER 분포, PER 추이, 업종별 PER 비교, 업종 안 PER 분포(SK오션플랜트 IM 99쪽 구성)와 접힌 구역(위치 표, 회귀). 회사를 고르지 않으면 시장과 업종끼리만.
   데이터는 data/valuation_market.json, data/valuation_per_hist.json(가치평가 폴더 market.py).
   요약: 결합 목표주가, 풋볼필드(v3 v3qFf), 상대가치평가와 절대가치평가 한 장씩. 상대가치평가 사례만 있으면 그 결과로.
   상대가치평가 데이터: OneDrive data/valuation.json — 05. 딜소싱\_자동화\가치평가 에서 relval.py run(사례 계산) 뒤 publish.py 로 올린다.
   사례마다 회사별 배수와 대상 회사 지표가 들어 있고, 비교기업 켜고 끄기, 국내만·해외만·합친 범위, 기준 기간, 할증·할인은 이 화면이 다시 계산한다.
   계산식은 relval.py 와 같다(사례의 py 값과 맞춰 봄). 원본 로직은 05. 딜소싱\가치평가 로직 노트.md 18장.
   엑셀: data/valuation/<사례 id>.xlsx. 손PB 상대가치 화면(PERValuationScreen.jsx)의 범위 막대(IQR)를 결론 막대그림에 가져왔다.
   app.js 전역($, esc, pad, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn, PAGE, route), graph.js STORE·G, market.css 표·탭 클래스를 쓴다. */
const VA_FILE = 'data/valuation.json';
const VA_TTL = 600000;
const VA_PER = { LTM: '최근 4분기', FY0: '직전 결산', FY1: '올해 추정', FY2: '내년 추정', FY3: '후년 추정' };
const VA_MULT = { PER: ['equity', 'ni'], PBR: ['equity', 'equity'], PSR: ['equity', 'revenue'], 'EV/EBITDA': ['ev', 'ebitda'], 'EV/EBIT': ['ev', 'op'], 'EV/Sales': ['ev', 'revenue'] };
const VA_MET = { ni: '순이익', equity: '자본', revenue: '매출', ebitda: 'EBITDA', op: '영업이익' };
// vt: 위 탭(mkt, fin, sum, rel, dcf), code: 지금 보는 종목코드(저장하지 않아 새로 들어오면 비어 있음), cid: 그 회사의 평가 사례,
// lv·thm: 시장동향 업종별 비교의 분류 단계와 고른 테마, gsel: 업종 안 분포로 고른 업종 {lv, name}, fold: 시장동향 접힌 구역
const vaS = { data: null, at: 0, loading: null, err: '', vt: 'mkt', code: null, cid: null, sel: {}, tblPer: null, showEx: false, open: {}, qp: {}, fold: {}, gsel: null };
Object.assign(vaS, viewGet('va', {}));
vaS.code = null; vaS.gsel = null;
const vaSave = () => viewSet('va', { cid: vaS.cid, sel: vaS.sel, tblPer: vaS.tblPer, qp: vaS.qp, tab: vaS.tab, trd: vaS.trd, lv: vaS.lv, thm: vaS.thm, mkMarket: vaS.mkMarket, mkKind: vaS.mkKind, fold: vaS.fold, gord: vaS.gord, vsub: vaS.vsub });
const vaTabs = (key, opts, cur) => `<div class="va-tabs">${vaSeg(key, opts, cur)}</div>`;

function vaLoad(force) {
  if (!force && vaS.at && Date.now() - vaS.at < VA_TTL) return Promise.resolve();
  vaS.loading ||= STORE.readText(VA_FILE)
    .then((r) => { vaS.data = r.text ? JSON.parse(r.text) : null; vaS.err = ''; vaS.at = Date.now(); })
    .catch((e) => { vaS.data = null; vaS.err = e instanceof SyntaxError ? '평가 파일을 읽지 못했습니다.' : e.message; })
    .finally(() => { vaS.loading = null; });
  return vaS.loading;
}

// ---------- 포맷 ----------
const vaNum = (v, d = 0) => (v == null || !Number.isFinite(+v) ? '-' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const vaWon = (v) => (v == null ? '-' : `${vaNum(v)}원`);
const vaX = (v) => (typeof v === 'number' ? `${vaNum(v, 1)}배` : v === 'NM' ? 'NM' : v === '제외' ? '제외' : '-');
const vaUp = (u, d = 1) => (u == null ? '' : `<span class="${u > 0 ? 'up' : u < 0 ? 'dn' : ''}">${u > 0 ? '+' : ''}${vaNum(u * 100, d)}%</span>`);
const vaKey = (p) => p.code || p.name;
const vaSeg = (key, opts, cur) => `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-va-seg="${key}" data-v="${esc(v)}" class="${cur === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
const vaTx = (s) => esc(s || '').replace(/~/g, '～'); // 리서치 글(메모, 이유, 경고)의 반각 물결표는 화면에서 전각으로
const vaSec = (title, right, body, cls = '') => `<section class="card mk-sec ${cls}"><div class="card-head"><h2>${title}</h2>${right || ''}</div><div class="mk-body">${body}</div></section>`;

// ---------- 계산 (relval.py 와 같은 식) ----------
function vaQuant(xs, q) { // 엑셀 QUARTILE.INC 와 같은 방식
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.min(lo + 1, s.length - 1);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
function vaStats(vals) {
  const nums = vals.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const st = { n: nums.length, nm: vals.filter((v) => v === 'NM').length };
  if (!nums.length) return st;
  return Object.assign(st, { median: vaQuant(nums, 0.5), mean: nums.reduce((a, b) => a + b, 0) / nums.length, q25: vaQuant(nums, 0.25), q75: vaQuant(nums, 0.75), min: Math.min(...nums), max: Math.max(...nums) });
}
function vaSel(c) { // 사례별 화면 선택값. 처음엔 파이썬 결과와 같은 구성
  const s = (vaS.sel[c.id] ||= {});
  s.inc ||= {};
  for (const p of c.peers) if (s.inc[vaKey(p)] == null) s.inc[vaKey(p)] = p.include;
  s.scope ||= c.scope; s.base ||= c.base; s.adj ||= {};
  s.pr ||= c.per_range?.on ? 'on' : 'off';
  if (!c.peers.some((p) => p.kind !== '국내')) s.scope = '국내';
  return s;
}
const vaAdj = (c, s, nm) => (s.adj[nm] != null && s.adj[nm] !== '' ? +s.adj[nm] / 100 : +(c.adjustments?.[nm]?.pct || 0));
const vaIn = (sc, p) => sc === '전체' || (sc === '국내') === (p.kind === '국내');
const vaUse = (c, s, skip, sc = s.scope) => c.peers.filter((p) => p !== skip && s.inc[vaKey(p)] && vaIn(sc, p));
const vaCut = (c, s, nm, v) => s.pr === 'on' && nm === 'PER' && typeof v === 'number' && c.per_range && (v < c.per_range.min || v > c.per_range.max);
function vaCol(c, s, per, nm, skip, sc) {
  const use = vaUse(c, s, skip, sc).filter((p) => !vaCut(c, s, nm, p.mult[per]?.[nm])), st = vaStats(use.map((p) => p.mult[per]?.[nm]).filter((v) => v !== '제외'));
  st.cut = vaUse(c, s, skip, sc).filter((p) => vaCut(c, s, nm, p.mult[per]?.[nm])).map((p) => p.name);
  st.out = st.median ? use.filter((p) => { const v = p.mult[per]?.[nm]; return typeof v === 'number' && (v > st.median * 2 || v < st.median * 0.5); }).map((p) => p.name) : [];
  return st;
}
function vaImplied(c, per, nm, mv, adj, ov) {
  const t = c.target, m = { ...(t.metrics[per] || {}), ...(ov || {}) }, [kind, item] = VA_MULT[nm], den = m[item];
  if (mv == null || den == null || den <= 0 || !t.shares) return null;
  const x = mv * (1 + adj);
  const eq = kind === 'equity' ? x * den : x * den - (t.net_debt || 0) - (t.nci || 0) + (+(c.non_op?.amount) || 0);
  const ps = t.pref_shares && t.pref_listed ? ((eq - t.mcap_pref) * 1e8) / t.shares : (eq * 1e8) / (t.shares + (t.pref_shares || 0));
  return { mult: x, metric: den, eq, ps, up: t.close ? ps / t.close - 1 : null };
}
function vaCalc(c) {
  const s = vaSel(c), out = { s, st: {}, val: {} };
  for (const per of c.periods) {
    out.st[per] = {}; out.val[per] = {};
    for (const nm of c.mults) {
      const st = vaCol(c, s, per, nm), a = vaAdj(c, s, nm);
      out.st[per][nm] = st;
      out.val[per][nm] = { med: vaImplied(c, per, nm, st.median, a), lo: vaImplied(c, per, nm, st.q25, a), hi: vaImplied(c, per, nm, st.q75, a) };
    }
  }
  out.loo = c.primary.map((nm) => {
    const basev = out.val[s.base][nm].med?.ps;
    return { nm, rows: vaUse(c, s).map((p) => { const st = vaCol(c, s, s.base, nm, p), iv = vaImplied(c, s.base, nm, st.median, vaAdj(c, s, nm)); return { name: p.name, med: st.median, ps: iv?.ps, ch: iv && basev ? iv.ps / basev - 1 : null }; }) };
  });
  return out;
}
function vaWarns(c, r) {
  const s = r.s, w = [], L = VA_PER[s.base];
  for (const nm of c.primary) {
    const st = r.st[s.base][nm], tv = c.target.mult[s.base]?.[nm];
    if (st.n < 3) w.push(`${L} ${nm}: 계산된 비교기업이 ${st.n}곳(3곳 미만)`);
    if (st.median && st.mean && Math.abs(st.mean / st.median - 1) > 0.25) w.push(`${L} ${nm}: 평균(${vaNum(st.mean, 1)}배)과 중앙값(${vaNum(st.median, 1)}배) 차이가 25% 넘음`);
    if (st.cut.length) w.push(`${L} ${nm}: ${vaNum(c.per_range.min)}배 미만 또는 ${vaNum(c.per_range.max)}배 초과라 통계에서 뺀 회사 ${st.cut.join(', ')}`);
    if (st.out.length) w.push(`${L} ${nm}: 중앙값의 2배를 넘거나 절반에 못 미치는 회사 ${st.out.join(', ')}`);
    if (typeof tv === 'number' && st.min != null && (tv < st.min || tv > st.max)) w.push(`${L} ${nm}: 대상 회사 배수 ${vaNum(tv, 1)}배가 비교기업 범위(${vaNum(st.min, 1)}～${vaNum(st.max, 1)}배) 밖`);
  }
  for (const g of r.loo) { // 회사마다 한 줄씩 쓰면 길어져서 배수별로 묶음
    const big = g.rows.filter((x) => x.ch != null && Math.abs(x.ch) > 0.15);
    if (big.length) w.push(`${g.nm}: ${big.map((x) => `${x.name}(${x.ch > 0 ? '+' : ''}${vaNum(x.ch * 100)}%)`).join(', ')} 중 한 곳만 빼도 주당 가치가 15% 넘게 바뀜`);
  }
  return w;
}

// ---------- 화면 조각 ----------
function vaHead(c, r) {
  const t = c.target, s = r.s, cs = vaS.data.cases;
  const pick = cs.length > 1 ? `<select class="va-case" data-va-case aria-label="평가 사례">${cs.map((x) => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.target.name)} ${esc(x.day)}</option>`).join('')}</select>` : '';
  const nd = t.net_debt;
  const kv = [['종가', vaWon(t.close)], ['시가총액', `${vaNum(t.mcap)}억`], [nd != null && nd < 0 ? '순현금' : '순부채', `${vaNum(Math.abs(nd ?? 0))}억`],
    ['52주 범위', `${vaNum(t.low52)} ～ ${vaNum(t.high52)}원`], ['증권사 목표가 평균', vaWon(t.target_mean)]];
  const hasGlobal = c.peers.some((p) => p.kind !== '국내');
  return `<section class="card va-head"><div class="va-ttl"><div><p>기준일 ${esc(c.day)}${c.purpose ? `, ${esc(c.purpose)} 평가` : ''}${t.wics ? `, WICS ${esc(t.wics)}` : ''}</p></div>
      <div class="va-tools">${pick}<button class="btn ghost" type="button" data-va-reset>처음 구성으로</button><button class="btn ghost" type="button" id="va-xlsx">${ico('file', 'sm')}엑셀 받기</button></div></div>
    <dl class="va-kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="va-ctrl">${hasGlobal ? `<div><span>비교기업 범위</span>${vaSeg('scope', [['국내', '국내만'], ['해외', '해외만'], ['전체', '국내와 해외']], s.scope)}</div>` : ''}
      <div><span>기준 기간</span>${vaSeg('base', c.periods.map((p) => [p, VA_PER[p] || p]), s.base)}</div>
      ${c.per_range ? `<div><span>PER ${vaNum(c.per_range.min)}～${vaNum(c.per_range.max)}배만</span>${vaSeg('pr', [['on', '켬'], ['off', '끔']], s.pr)}</div>` : ''}</div></section>`;
}

function vaField(c, r) { // 결론 막대: 배수별 25～75% 범위와 중앙값, 현재가 세로선
  const s = r.s, rows = [];
  for (const nm of c.mults) rows.push([s.base, nm]);
  const items = rows.map(([per, nm]) => ({ per, nm, v: r.val[per][nm], st: r.st[per][nm] })).filter((x) => x.v.med);
  if (!items.length) return '<div class="empty">계산할 수 있는 배수가 없습니다.</div>';
  const xs = items.flatMap((x) => [x.v.lo?.ps, x.v.hi?.ps, x.v.med.ps]).filter((v) => v != null).concat(c.target.close);
  const x0 = Math.min(...xs) * 0.92, x1 = Math.max(...xs) * 1.04, X = (v) => `${(((v - x0) / (x1 - x0)) * 100).toFixed(2)}%`;
  const now = X(c.target.close);
  return `<div class="va-ff">${items.map((x, i) => {
    const lo = x.v.lo?.ps ?? x.v.med.ps, hi = x.v.hi?.ps ?? x.v.med.ps, prim = c.primary.includes(x.nm), sep = i > 0 && x.per !== items[i - 1].per;
    return `<div class="va-ff-r ${prim ? 'p' : ''} ${sep ? 'sep' : ''}"><div class="va-ff-l"><b>${esc(x.nm)}</b><small>${esc(VA_PER[x.per])} ${vaX(x.v.med.mult)}</small></div>
      <div class="va-ff-b"><i class="bar" style="left:${X(Math.min(lo, hi))};width:calc(${X(Math.max(lo, hi))} - ${X(Math.min(lo, hi))})" title="25% ${vaWon(lo)} ～ 75% ${vaWon(hi)}"></i><i class="med" style="left:${X(x.v.med.ps)}"></i><i class="now" style="left:${now}"></i></div>
      <div class="va-ff-v"><b>${vaWon(x.v.med.ps)}</b>${vaUp(x.v.med.up)}</div></div>`;
  }).join('')}<div class="va-ff-r leg"><div class="va-ff-l"></div><div class="va-ff-b"><span class="now-l" style="left:${now}">현재가 ${vaWon(c.target.close)}</span></div><div class="va-ff-v"></div></div></div>
    <div class="va-leg"><span class="bd">25～75% 구간</span><span class="mdb">중앙값</span></div>`;
}

function vaRange(c, r) { // 배수 탭 머리: 국내와 해외 따로, 배수별 25～75% 범위 막대
  return vaSec('배수별 주당 가치', `<span class="meta">${esc(VA_PER[r.s.base])}</span>`, `${vaSplit(c, r)}${vaField(c, r)}`);
}

function vaSplit(c, r) { // 국내와 해외를 따로 계산한 값(기준 기간, 대표 배수). 위 범위 선택과 상관없이 늘 셋 다 보여 줌
  if (!c.peers.some((p) => p.kind !== '국내')) return '';
  const s = r.s, L = { 국내: '국내', 해외: '해외', 전체: '국내와 해외' };
  const rows = ['국내', '해외', '전체'].map((sc) => {
    const n = vaUse(c, s, null, sc).length;
    return `<tr class="${sc === s.scope ? 'on' : ''}"><td class="st"><b>${L[sc]}</b><small>${n}곳 넣음</small></td>${c.primary.map((nm) => {
      const st = vaCol(c, s, s.base, nm, null, sc), v = vaImplied(c, s.base, nm, st.median, vaAdj(c, s, nm));
      return `<td class="${st.n < 3 ? 'va-few' : ''}"${st.n < 3 ? ' title="비교기업 3곳 미만"' : ''}>${vaX(st.median)} <small>${st.n}곳</small></td><td>${v ? `<b>${vaWon(v.ps)}</b><small>${vaUp(v.up)}</small>` : '-'}</td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<h3 class="va-h3">국내와 해외 따로</h3><div class="mk-scroll"><table class="mk-tbl va-split"><thead><tr><th class="st">범위</th>${c.primary.map((nm) => `<th>${esc(nm)} 중앙값</th><th>주당 가치</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function vaWarnCard(c, r) {
  const dyn = vaWarns(c, r), dat = c.data_warnings || [];
  if (!dyn.length && !dat.length) return '';
  const li = (a) => a.map((w) => `<li>${vaTx(w)}</li>`).join('');
  return `<details class="va-det" ${vaS.warnOpen ? 'open' : ''}><summary data-va-warn>확인할 것 <span class="n">${dyn.length + dat.length}</span></summary>${dyn.length ? `<h3 class="va-h3">지금 구성 기준</h3><ul class="va-warn">${li(dyn)}</ul>` : ''}${dat.length ? `<h3 class="va-h3">데이터</h3><ul class="va-warn">${li(dat)}</ul>` : ''}</details>`;
}

function vaMultTable(c, r) {
  const s = r.s, per = c.periods.includes(vaS.tblPer) ? vaS.tblPer : s.base, st = r.st[per];
  const cell = (p, nm) => {
    const v = p.mult[per]?.[nm];
    if (v === '제외') return `<td class="va-ex" title="${esc(p.exclude_reason || '사람이 뺀 배수')}">제외</td>`;
    if (vaCut(c, s, nm, v)) return `<td class="va-cut" title="${vaNum(c.per_range.min)}～${vaNum(c.per_range.max)}배 밖이라 통계에서 뺌">${vaX(v)}</td>`;
    const out = typeof v === 'number' && st[nm].median && s.inc[vaKey(p)] && vaIn(s.scope, p) && (v > st[nm].median * 2 || v < st[nm].median * 0.5);
    return `<td class="${out ? 'va-out' : ''}" ${out ? 'title="중앙값의 2배를 넘거나 절반에 못 미침"' : ''}>${vaX(v)}</td>`;
  };
  const t = c.target;
  const head = `<tr><th class="st">회사</th><th>시가총액</th>${c.mults.map((nm) => `<th class="${c.primary.includes(nm) ? 'strong' : ''}">${esc(nm)}</th>`).join('')}</tr>`;
  const trow = `<tr class="va-tgt"><td class="st"><b>${esc(t.name)}</b><small>대상 회사</small></td><td>${vaNum(t.mcap)}억</td>${c.mults.map((nm) => `<td class="strong">${vaX(t.mult[per]?.[nm])}</td>`).join('')}</tr>`;
  const prow = (p) => {
    const on = !!s.inc[vaKey(p)], inScope = vaIn(s.scope, p);
    return `<tr class="${on && inScope ? '' : 'off'}"><td class="st"><label class="va-chk"><input type="checkbox" data-va-inc="${esc(vaKey(p))}" ${on ? 'checked' : ''} ${inScope ? '' : 'disabled'}><span><b>${esc(p.name)}</b><small>${esc(p.kind === '국내' ? '국내' : p.country || '해외')}${!inScope ? ', 범위 밖' : !p.include ? ', 처음엔 뺀 회사' : ''}</small></span></label></td>
      <td>${p.mcap != null ? `${vaNum(p.mcap)}억` : '-'}</td>${c.mults.map((nm) => cell(p, nm)).join('')}</tr>`;
  };
  const srow = (label, f) => `<tr class="va-stat"><td class="st">${label}</td><td></td>${c.mults.map((nm) => `<td>${f(st[nm])}</td>`).join('')}</tr>`;
  const peers = [...c.peers].sort((a, b) => (a.kind === '국내' ? 0 : 1) - (b.kind === '국내' ? 0 : 1));
  const body = `<div class="mk-scroll"><table class="mk-tbl va-mt"><thead>${head}</thead><tbody>${trow}${peers.map(prow).join('')}
    ${srow('중앙값', (x) => `<b>${vaX(x.median)}</b>`)}${srow('평균', (x) => vaX(x.mean))}${srow('25%', (x) => vaX(x.q25))}${srow('75%', (x) => vaX(x.q75))}
    ${srow('계산된 회사', (x) => { const o = [x.nm ? `NM ${x.nm}` : '', x.cut?.length ? `범위 밖 ${x.cut.length}` : ''].filter(Boolean); return `${x.n}곳${o.length ? ` (${o.join(', ')})` : ''}`; })}</tbody></table></div>`;
  return vaSec('배수 표', vaSeg('tper', c.periods.map((p) => [p, VA_PER[p] || p]), per), body);
}

function vaApply(c, r) {
  const s = r.s;
  const rows = c.mults.map((nm) => `<tr class="${c.primary.includes(nm) ? 'p' : ''}"><td class="st"><b>${esc(nm)}</b><small>${esc(VA_MET[VA_MULT[nm][1]])} 기준</small></td>
    ${c.periods.map((per) => { const v = r.val[per][nm].med; return `<td class="${per === s.base ? 'va-base' : ''}">${v ? `<b>${vaWon(v.ps)}</b><small>${vaX(v.mult)} ${vaUp(v.up)}</small>` : '-'}</td>`; }).join('')}
    <td><input class="va-adj" type="number" step="1" inputmode="decimal" data-va-adj="${esc(nm)}" value="${s.adj[nm] ?? (c.adjustments?.[nm]?.pct ? +(c.adjustments[nm].pct * 100).toFixed(1) : '')}" placeholder="0" aria-label="${esc(nm)} 조정(%)"> %</td></tr>`).join('');
  const t = c.target;
  const met = c.periods.map((per) => { const m = t.metrics[per] || {}; return `<tr><td class="st"><b>${esc(VA_PER[per])}</b><small>${esc(m.label || '')}</small></td>${['revenue', 'op', 'ebitda', 'ni', 'equity'].map((k) => `<td>${vaNum(m[k])}</td>`).join('')}</tr>`; }).join('');
  return vaSec('적용 결과', '', `<div class="mk-scroll"><table class="mk-tbl va-ap"><thead><tr><th class="st">배수</th>${c.periods.map((p) => `<th class="${p === s.base ? 'va-base' : ''}">${esc(VA_PER[p])}</th>`).join('')}<th title="할증은 +, 할인은 −">조정(%)</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3 class="va-h3">대상 회사 지표 (억원)</h3><div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">기간</th><th>매출</th><th>영업이익</th><th>EBITDA</th><th>순이익</th><th>자본</th></tr></thead><tbody>${met}</tbody></table></div>
    <p class="va-note">순부채 ${vaNum(t.net_debt)}억, 비지배지분 ${vaNum(t.nci)}억, 비영업자산 ${vaNum(c.non_op?.amount || 0)}억(${esc(t.bs_date || '')} 기준)${c.non_op?.reason ? `. ${vaTx(c.non_op.reason)}` : ''}</p>
    ${t.override_note ? `<p class="va-note">손으로 바꾼 값: ${vaTx(t.override_note)}</p>` : ''}`);
}

function vaLoo(c, r) {
  if (!r.loo.length || !r.loo[0].rows.length) return '';
  const names = r.loo[0].rows.map((x) => x.name);
  const rows = names.map((n, i) => `<tr><td class="st"><b>${esc(n)}</b></td>${r.loo.map((g) => { const x = g.rows[i]; const big = x.ch != null && Math.abs(x.ch) > 0.15; return `<td>${vaX(x.med)}</td><td class="${big ? 'va-out' : ''}">${vaWon(x.ps)} <small>${x.ch == null ? '' : `${x.ch > 0 ? '+' : ''}${vaNum(x.ch * 100, 1)}%`}</small></td>`; }).join('')}</tr>`).join('');
  return vaSec('한 회사씩 뺀 결과', `<span class="meta">${esc(VA_PER[r.s.base])} 기준</span>`, `<div class="mk-scroll"><table class="mk-tbl va-loo"><thead><tr><th class="st">뺀 회사</th>${r.loo.map((g) => `<th>${esc(g.nm)} 중앙값</th><th>${esc(g.nm)} 주당 가치</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`);
}

function vaScen(c, r) {
  const sc = Object.entries(c.scenarios || {}); if (!sc.length) return '';
  const s = r.s, pers = c.periods.filter((p) => sc.some(([, o]) => o[p]));
  const line = (name, ov) => `<tr><td class="st" ${ov?._note ? `title="${esc(ov._note)}"` : ''}><b>${esc(name)}</b></td>${pers.map((per) => c.primary.map((nm) => { const v = (ov ? ov[per] : {}) && vaImplied(c, per, nm, r.st[per][nm].median, vaAdj(c, s, nm), ov ? ov[per] : null); return `<td>${ov && !ov[per] ? '-' : v ? `${vaWon(v.ps)} <small>${vaUp(v.up)}</small>` : '-'}</td>`; }).join('')).join('')}</tr>`;
  const body = `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">시나리오</th>${pers.map((per) => c.primary.map((nm) => `<th>${esc(VA_PER[per])} ${esc(nm)}</th>`).join('')).join('')}</tr></thead>
    <tbody>${line('기본', null)}${sc.map(([n, o]) => line(n, o)).join('')}</tbody></table></div>
`;
  return vaSec('시나리오', '', body);
}

function vaPick(c) {
  const fun = (c.funnel || []).map((f) => `<tr><td class="st"><b>${esc(f.stage)}</b></td><td class="wrap">${vaTx(f.criteria)}</td><td>${f.count ?? ''}</td><td class="wrap">${vaTx(f.note)}</td></tr>`).join('');
  const sim = (o) => (o ? `<dl class="va-sim">${Object.entries(o).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${vaTx(v)}</dd></div>`).join('')}</dl>` : '');
  const peers = c.peers.map((p) => { const k = vaKey(p), op = vaS.open[k];
    return `<tr class="va-pr" data-va-row="${esc(k)}"><td class="st"><b>${esc(p.name)}</b><small>${esc(p.kind === '국내' ? '국내' : p.country || '해외')}${p.include ? '' : ', 처음엔 뺌'}</small></td><td class="wrap">${vaTx(p.reason)}${p.exclude_multiples?.length ? `<small>뺀 배수 ${esc(p.exclude_multiples.join(', '))}: ${vaTx(p.exclude_reason)}</small>` : ''}${p.source ? `<small>출처 ${vaTx(p.source)}${p.as_of ? `, ${esc(p.as_of)}` : ''}</small>` : ''}${op ? sim(p.similarity) : ''}</td>
      <td>${p.similarity ? `<button class="btn ghost sm" type="button" aria-expanded="${!!op}">${op ? '접기' : '유사성 보기'}</button>` : ''}</td></tr>`; }).join('');
  const ex = c.excluded || [];
  const exHtml = ex.length ? `<button class="btn ghost sm va-exbtn" type="button" data-va-ex>${vaS.showEx ? '뺀 후보 접기' : `뺀 후보 ${ex.length}곳 보기`}</button>
    ${vaS.showEx ? `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">회사</th><th>단계</th><th>이유</th></tr></thead><tbody>${ex.map((e) => `<tr><td class="st"><b>${esc(e.name)}</b></td><td>${esc(e.stage || '')}</td><td class="wrap">${vaTx(e.reason)}</td></tr>`).join('')}</tbody></table></div>` : ''}` : '';
  return vaSec('비교기업 선정', '', `${c.target_profile ? `<p class="va-prof">${vaTx(c.target_profile)}</p>` : ''}
    ${fun ? `<h3 class="va-h3">걸러낸 단계</h3><div class="mk-scroll"><table class="mk-tbl va-fun"><thead><tr><th class="st">단계</th><th>기준</th><th>남은 회사</th><th>메모</th></tr></thead><tbody>${fun}</tbody></table></div>` : ''}
    <h3 class="va-h3">비교기업</h3><div class="mk-scroll"><table class="mk-tbl va-peers"><thead><tr><th class="st">회사</th><th>넣은 이유</th><th></th></tr></thead><tbody>${peers}</tbody></table></div>${exHtml}`);
}


// ---------- 요약 (SK오션플랜트 IM 35, 39, 106쪽 구성: 풋볼필드와 목표주가, 배수별 평가표, Peer 선정) ----------
const vaW = (c) => (c.weights && Object.keys(c.weights).length ? c.weights : { [c.primary[0]]: 1 }); // 평가 배수 비중. 기본은 첫 대표 배수 하나(로직 노트 18-9)
function vaTarget(c, r) { // 목표주가 = 평가 배수 주당 가치(비중이 여럿이면 가중평균)
  const s = r.s, w = vaW(c);
  const xs = c.primary.map((nm) => ({ nm, w: w[nm] || 0, v: r.val[s.base][nm].med })).filter((x) => x.v && x.w > 0);
  const sw = xs.reduce((a, x) => a + x.w, 0);
  if (!sw) return null;
  const ps = xs.reduce((a, x) => a + x.w * x.v.ps, 0) / sw;
  return { ps, up: c.target.close ? ps / c.target.close - 1 : null, parts: xs.map((x) => ({ nm: x.nm, w: x.w / sw, ps: x.v.ps })) };
}
function vaScenRange(c, r, nm) { // 배수별 Bear～Bull. 시나리오가 없으면 비교기업 25～75%
  const s = r.s, st = r.st[s.base][nm], a = vaAdj(c, s, nm), sc = c.scenarios || {};
  const pick = (k) => sc[k]?.[s.base] && vaImplied(c, s.base, nm, st.median, a, sc[k][s.base])?.ps;
  const lo = pick('Bear'), hi = pick('Bull');
  if (lo && hi) return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), lab: 'Bear～Bull' };
  const v = r.val[s.base][nm];
  return v.lo && v.hi ? { lo: Math.min(v.lo.ps, v.hi.ps), hi: Math.max(v.lo.ps, v.hi.ps), lab: '25～75%' } : null;
}

function vaFootball(c, r) { // 풋볼필드: 52주 고저, 증권사 목표가, 배수별 범위와 현재가, 목표주가 선
  const t = c.target, tp = vaTarget(c, r), bt = t.broker_targets || [];
  const rows = [['시장', '52주 고저', t.low52 && t.high52 ? { lo: t.low52, hi: t.high52 } : null]];
  if (bt.length) rows.push(['시장', `증권사 목표가 ${bt.length}곳`, { lo: Math.min(...bt.map((x) => x.goal)), hi: Math.max(...bt.map((x) => x.goal)) }]);
  const W_ = vaW(c), multi = Object.values(W_).filter((x) => x > 0).length > 1;
  for (const nm of c.primary) { const g = vaScenRange(c, r, nm), w = W_[nm] || 0; rows.push([w > 0 ? '평가' : '참고', `${nm} ${g?.lab || ''}`, g, multi ? tp?.parts.find((p) => p.nm === nm)?.w : null]); }
  const vals = rows.flatMap(([, , g]) => (g ? [g.lo, g.hi] : [])).concat(t.close, tp?.ps || t.close);
  const x0 = Math.min(...vals) * 0.84, x1 = Math.max(...vals) * 1.12, X = (v) => `${(((v - x0) / (x1 - x0)) * 100).toFixed(2)}%`;
  rows.sort((a, b) => ['시장', '평가', '참고'].indexOf(a[0]) - ['시장', '평가', '참고'].indexOf(b[0]));
  const ff = rows.map(([grp, lab, g, w], i) => `<div class="va-fb-r ${grp === '시장' ? 'mk' : grp === '참고' ? 'ref' : ''}"><div class="va-fb-l">${i === 0 || rows[i - 1][0] !== grp ? `<em>${grp}</em>` : '<em></em>'}<b>${esc(lab)}${w ? ` <small>${vaNum(w * 100)}%</small>` : ''}</b></div>
    <div class="va-fb-b">${g ? `<span class="lo" style="left:${X(g.lo)}">${vaNum(g.lo)}</span><i style="left:${X(g.lo)};width:calc(${X(g.hi)} - ${X(g.lo)})"></i><span class="hi" style="left:${X(g.hi)}">${vaNum(g.hi)}</span>` : ''}<u class="now" style="left:${X(t.close)}"></u>${tp ? `<u class="tp" style="left:${X(tp.ps)}"></u>` : ''}</div></div>`).join('');
  // 현재가와 목표주가 선 이름표는 그림 위 한 줄에: 왼쪽 선은 선 왼쪽으로, 오른쪽 선은 선 오른쪽으로 붙여 서로 겹치지 않게
  const lab = (v, cls, t, side) => `<span class="${cls}" style="left:${X(v)};transform:translateX(${side < 0 ? 'calc(-100% - 6px)' : side > 0 ? '6px' : '-50%'})">${t}</span>`;
  const side = tp ? (tp.ps >= t.close ? -1 : 1) : 0;
  const top = `<div class="va-fb-r leg"><div class="va-fb-l"></div><div class="va-fb-b">${lab(t.close, 'now', `현재가 ${vaWon(t.close)}`, side)}${tp ? lab(tp.ps, 'tp', `목표주가 ${vaWon(Math.round(tp.ps / 100) * 100)}`, -side) : ''}<u class="now" style="left:${X(t.close)}"></u>${tp ? `<u class="tp" style="left:${X(tp.ps)}"></u>` : ''}</div></div>`;
  return `<div class="va-fb">${top}${ff}</div>`;
}
function vaSummary(c, r) {
  const s = r.s, t = c.target, tp = vaTarget(c, r), W_ = vaW(c);
  const m = t.metrics[s.base] || {}, divSh = t.shares + (t.pref_shares && !t.pref_listed ? t.pref_shares : 0);
  const lead = c.primary.filter((nm) => (W_[nm] || 0) > 0), item = VA_MULT[lead[0]]?.[1];
  const asm = [[`${VA_PER[s.base]} ${VA_MET[item] || '순이익'}`, `${vaNum(m[item || 'ni'])}억`], ...(item === 'ni' ? [['EPS', vaWon(m.ni ? (m.ni * 1e8) / divSh : null)]] : []), ...lead.map((nm) => [`Target ${nm}`, `${vaX(r.st[s.base][nm].median)} <small>${r.st[s.base][nm].n}곳 중앙값</small>`])];
  const box = `<div class="va-tpbox" ${c.method_reason ? `title="평가 배수 ${esc(c.method || '')}: ${esc(c.method_reason)}"` : ''}>${tp ? `<span>목표주가</span><b>${vaWon(Math.round(tp.ps / 100) * 100)}</b><em>상승여력 ${vaUp(tp.up) || '-'}</em><p>${tp.parts.length > 1 ? tp.parts.map((p) => `${esc(p.nm)} ${vaNum(p.w * 100)}%`).join(', ') : `${esc(tp.parts[0].nm)} 기준, ${esc(VA_PER[s.base])}`}</p>` : '<p>계산된 배수가 없습니다.</p>'}</div>
    <dl class="va-asm">${asm.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const memo = c.conclusion ? `<div class="va-memo"><b>판단 메모</b><p>${vaTx(c.conclusion)}</p></div>` : '';
  return vaSec('평가 결과', '', `<div class="va-sumtop">${box}</div>${vaFootball(c, r)}${memo}${vaWarnCard(c, r)}`)
    + [...lead, ...c.primary.filter((nm) => !lead.includes(nm))].map((nm) => vaMultCard(c, r, nm, !lead.includes(nm))).join('') + vaSelCard(c);
}

function vaThin(c, r, nm) { // 계산된 비교기업이 3곳 미만이면 다른 범위와 업종 중앙값을 참고로(로직 노트 18-5)
  const s = r.s, st = r.st[s.base][nm];
  if (st.n >= 3) return '';
  const L = { 국내: '국내', 해외: '해외', 전체: '국내와 해외' }, a = vaAdj(c, s, nm), out = [];
  if (c.peers.some((p) => p.kind !== '국내')) for (const sc of ['국내', '해외', '전체']) {
    if (sc === s.scope) continue;
    const x = vaCol(c, s, s.base, nm, null, sc);
    if (x.median) out.push([`${L[sc]} 비교기업`, x.median, x.n]);
  }
  const me = vaS.mk?.by[c.target.code], on = s.pr === 'on' && c.per_range;
  if (nm === 'PER' && me?.industry && ['LTM', 'FY1'].includes(s.base)) {
    const key = s.base === 'LTM' ? 'per' : 'estPer';
    const xs = vaS.mk.list.filter((y) => y.code !== me.code && y.industry === me.industry && y[key] > 0 && y[key] < 200 && (!on || (y[key] >= c.per_range.min && y[key] <= c.per_range.max))).map((y) => y[key]);
    if (xs.length) out.push([`업종 ${me.industry}`, vaQuant(xs, 0.5), xs.length]);
  }
  if (!out.length) return '';
  const rows = out.map(([lab, med, n]) => { const v = vaImplied(c, s.base, nm, med, a); return `<tr><td class="st">${esc(lab)}</td><td>${vaX(med)}</td><td>${n}곳</td><td>${v ? vaWon(Math.round(v.ps / 100) * 100) : '-'}</td><td>${v ? vaUp(v.up) : '-'}</td></tr>`; }).join('');
  return `<div class="va-thin"><h3 class="va-h3">비교기업 ${st.n}곳, 참고 중앙값</h3><div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">범위</th><th>${esc(nm)} 중앙값</th><th>회사 수</th><th>주당 가치</th><th>상승여력</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
const vaPbHead = (v, mx) => { // 막대 목록 위 한 줄: 세로선(중앙값) 자리에 이름표
  if (!(v > 0)) return '';
  const p = Math.min(100, (v / mx) * 100).toFixed(1);
  return `<div class="va-pb va-pbh" aria-hidden="true"><span></span><div><b class="lab" style="left:${p}%;transform:translateX(-${p}%)">중앙값 ${vaX(v)}</b></div></div>`;
};
function vaMultCard(c, r, nm, ref) { // IM 106쪽: 비교기업 배수 막대 + Target 선, 지표 × 배수 = 주당 가치
  const s = r.s, t = c.target, st = r.st[s.base][nm], v = r.val[s.base][nm].med, a = vaAdj(c, s, nm), [kind, item] = VA_MULT[nm];
  const peers = vaUse(c, s).map((p) => ({ p, v: p.mult[s.base]?.[nm] })).filter((x) => typeof x.v === 'number').sort((x, y) => y.v - x.v);
  const tv = t.mult[s.base]?.[nm];
  const mx = Math.max(st.median || 0, typeof tv === 'number' ? tv : 0, ...peers.map((x) => Math.min(x.v, (st.median || x.v) * 4))) * 1.08;
  const W = (v_) => `${Math.min(100, (v_ / mx) * 100).toFixed(1)}%`;
  const bar = (name, val, cls, sub) => `<div class="va-pb ${cls}"><span>${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><div><i style="width:${typeof val === 'number' && val > 0 ? W(val) : 0}"></i>${st.median ? `<b style="left:${W(st.median)}"></b>` : ''}</div><em>${vaX(val)}</em></div>`;
  const bars = vaPbHead(st.median, mx) + bar(t.name, tv, 'me', '대상') + peers.map((x) => bar(x.p.name, x.v, vaCut(c, s, nm, x.v) ? 'cut' : '', x.p.kind === '국내' ? '' : x.p.country || '해외')).join('');
  const cutLeg = peers.some((x) => vaCut(c, s, nm, x.v)) ? `<div class="va-leg"><span class="ct">${vaNum(c.per_range.min)}～${vaNum(c.per_range.max)}배 밖이라 뺀 회사</span></div>` : '';
  const m = t.metrics[s.base] || {}, den = m[item], divSh = t.shares + (t.pref_shares && !t.pref_listed ? t.pref_shares : 0);
  const L = (k, val, cls = '') => `<tr class="${cls}"><th>${k}</th><td>${val}</td></tr>`;
  const per = VA_PER[s.base];
  const tbl = kind === 'equity'
    ? L(`${per} 매출`, `${vaNum(m.revenue)}억`) + L(`${per} 순이익`, `${vaNum(m.ni)}억`) + L('주식수', `${vaNum(divSh)}주`) + L(`${per} EPS`, vaWon(den ? (den * 1e8) / divSh : null))
    : L(`${per} ${VA_MET[item]}`, `${vaNum(den)}억${m.ebitda_est && item === 'ebitda' ? ' <small>추정</small>' : ''}`) + L('주주가치', v ? `${vaNum(v.eq)}억` : '-') + L('순현금', `${vaNum(-(t.net_debt || 0))}억`) + L('비지배지분, 비영업자산', `${vaNum(-(t.nci || 0))}억, ${vaNum(+(c.non_op?.amount) || 0)}억`) + L('주식수', `${vaNum(divSh)}주`);
  const res = L(`Target ${nm}`, `${vaX(v?.mult ?? st.median)}${a ? ` <small>${a > 0 ? '+' : ''}${vaNum(a * 100, 1)}% 조정</small>` : ''}`, 'k') + L('주당 가치', v ? vaWon(Math.round(v.ps / 100) * 100) : '-', 'k big') + L(`현재가 (${esc(c.day)})`, vaWon(t.close)) + L('상승여력', v ? vaUp(v.up) : '-', 'k');
  return vaSec(ref ? `${nm} 교차 확인` : `${nm} 평가`, `<span class="meta">${esc(per)}, 비교기업 ${st.n}곳 중앙값</span>`, `<div class="va-mcg"><div><div class="va-pbs">${bars}</div>${cutLeg}</div>
    <table class="va-calc"><tbody>${tbl}</tbody><tbody class="res">${res}</tbody></table></div>${vaThin(c, r, nm)}`);
}

function vaSelCard(c) { // IM 39쪽 왼쪽: 4단계 선정과 최종 비교기업
  const f = c.funnel || []; if (!f.length) return '';
  const grp = (pre) => f.filter((x) => x.stage.startsWith(pre));
  const steps = (xs) => xs.map((x) => `<li title="${esc(x.criteria || '')}${x.note ? `\n${esc(x.note)}` : ''}"><b>${esc(x.stage.replace(/^(국내|해외)\s*/, ''))}</b><span>${x.count ?? ''}곳</span></li>`).join('');
  const chips = (kind) => c.peers.filter((p) => p.include && (kind === '국내') === (p.kind === '국내')).map((p) => `<span>${esc(p.name)}</span>`).join('');
  const col = (pre) => (grp(pre).length ? `<div class="va-selc"><h3>${pre}</h3><ol>${steps(grp(pre))}</ol><div class="va-chips">${chips(pre)}</div></div>` : '');
  return vaSec('비교기업 선정', '', `<div class="va-selg">${col('국내')}${col('해외')}</div>`);
}

// ---------- 전 상장사 PER 분포와 회귀 (data/valuation_market.json, 가치평가 폴더 market.py 결과. 로직은 손PB PERValuationScreen 과 같음) ----------
const VA_MKT_FILE = 'data/valuation_market.json';
const VA_BUCKETS = [[0, 3], [3, 5], [5, 8], [8, 10], [10, 13], [13, 15], [15, 20], [20, 25], [25, 30], [30, 40], [40, 50], [50, 75], [75, 200]]; // 낮은 쪽을 잘게(2026-11-17 사용자)
function vaLoadMkt() {
  if (vaS.mkAt && Date.now() - vaS.mkAt < VA_TTL) return Promise.resolve();
  vaS.mkLoading ||= STORE.readText(VA_MKT_FILE)
    .then((r) => {
      const d = r.text ? JSON.parse(r.text) : null;
      if (d) {
        const ix = Object.fromEntries(d.cols.map((k, i) => [k, i]));
        d.list = d.rows.map((x) => Object.fromEntries(Object.entries(ix).map(([k, i]) => [k, x[i]])));
        d.by = Object.fromEntries(d.list.map((x) => [x.code, x]));
        if (Array.isArray(d.themes)) d.themes = VA_TH_GROUP.map(([n, re, sec]) => [n, [...new Set(d.themes.filter((t) => re.test(t[0])).flatMap((t) => t[1]))], sec]).filter((t) => t[1].length); // 테마를 세부 업종으로 묶음
        if (Array.isArray(d.themes) && d.themes.length) { // 네이버 테마 [[이름, [종목코드]]]. 한 종목이 여러 테마에 듦
          d.thSet = d.themes.map((t) => new Set(t[1]));
          d.thOf = {};
          d.thSet.forEach((cs, i) => { for (const k of cs) (d.thOf[k] ||= []).push(i); });
        }
      }
      vaS.mk = d; vaS.mkAt = Date.now();
    })
    .catch(() => { vaS.mk = null; })
    .finally(() => { vaS.mkLoading = null; });
  return vaS.mkLoading;
}
const vaMkUse = () => (vaS.mk?.list || []).filter((x) => (vaS.mkMarket || 'ALL') === 'ALL' || x.market === vaS.mkMarket);
function vaFit(x) { // 회귀 적정 PER: 표본에 있으면 업종까지 반영한 모델 값, 없으면 단순 회귀 곡선
  const g = vaS.mk?.regression;
  if (!g || !x?.per || !x?.estPer) return null;
  const growth = x.per / x.estPer - 1;
  const f = g.fitted?.[x.code];
  if (f) return { growth: f[0], per: f[1], simple: false };
  if (!(growth > 0 && growth <= 5) || !g.simple) return { growth, per: null };
  return { growth, per: Math.exp(g.simple.intercept + g.simple.slope * growth), simple: true };
}
function vaPctl(v, key) {
  const xs = vaMkUse().map((x) => x[key]).filter((p) => p > 0 && p < 200);
  return xs.length && v > 0 ? xs.filter((p) => p < v).length / xs.length : null;
}

// F(보는 회사): { code, name, close, peers: [종목코드], role: '대상'|'선택', peerRole: '비교기업'|'Peer' }
const vaFocusCase = (c) => ({ code: c.target.code, name: c.target.name, close: c.target.close, peers: c.peers.filter((p) => p.kind === '국내').map((p) => p.code), role: '대상', peerRole: '비교기업' });
const vaFocusQuick = (code) => { const x = vaS.mk?.by[code]; return x ? { code, name: x.name, close: null, peers: (vaS.qp[code] || []).filter((k) => vaS.mk.by[k]), role: '선택', peerRole: 'Peer' } : null; };
const vaCaseOf = (code) => (vaS.data?.cases || []).find((x) => x.target.code === code);
const vaOkPer = (v) => v > 0 && v < 200; // 분포와 중앙값에 넣는 PER 범위

const vaV3Of = (code) => (typeof v3Cases === 'function' && code ? v3Cases().filter((c) => c.target.code === code) : []); // 그 회사의 절대가치평가(v3) 사례

// 지금 보는 종목코드. 다섯 탭이 같이 쓴다. 고르지 않았으면 null
function vaCode() {
  const k = vaS.code;
  return k && (vaS.mk?.by[k] || vaCaseOf(k) || vaV3Of(k).length) ? k : null;
}
function vaRow(code) { // 시장 데이터의 그 회사 줄. 시장 데이터에 없는 사례 회사는 사례 값으로 채움
  const x = vaS.mk?.by[code]; if (x) return x;
  const c = vaCaseOf(code), v = vaV3Of(code)[0]; if (!c && !v) return null;
  const num = (y) => (typeof y === 'number' ? y : null), t = c ? c.target : v.target;
  return { code, name: t.name, market: '', per: num(t.mult?.LTM?.PER), estPer: num(t.mult?.FY1?.PER), mcap: t.mcap, industry: t.wics || '' };
}
function vaGo(code) { vaS.code = code; vaS.q = ''; vaS.pq = ''; vaS.gsel = null; vaShow(); }

// 평가한 회사(상대가치평가 또는 절대가치평가 사례가 있는 회사): 회사 줄 바로가기와 회사를 고르지 않은 평가 탭에 씀
function vaDone() {
  const by = new Map();
  for (const c of vaS.data?.cases || []) if (c.target?.code && !by.has(c.target.code)) by.set(c.target.code, { code: c.target.code, name: c.target.name, rel: c });
  if (typeof v3Cases === 'function') for (const c of v3Cases()) { const k = c.target?.code; if (!k) continue; const o = by.get(k) || { code: k, name: c.target.name }; o.v3 ||= c; by.set(k, o); }
  return [...by.values()];
}

// 평가 요청(2026-11-17 사용자 「정한 게 있어야만 작동하니까 요청하기 이런 거」): 오른쪽 요청사항에 kind 'va' 글로 남기고, 반영 전이면 「요청함」으로 보여 줌
const vaHasEval = (code) => !!(code && (vaCaseOf(code) || vaV3Of(code).length));
const vaReqOf = (code) => (typeof rqS === 'object' ? rqS.items.find((r) => r.kind === 'va' && r.code === code && r.status !== 'done') : null);
function vaReqBtn(code) {
  if (!code || vaHasEval(code) || typeof rqAct !== 'function') return '';
  const r = vaReqOf(code), d = r ? new Date(r.at) : null;
  return r ? `<span class="va-reqd" title="${esc(`${r.by} 요청`)}">평가 요청함${d && !isNaN(d) ? ` ${d.getMonth() + 1}/${d.getDate()}` : ''}</span>` : `<button type="button" class="btn sm va-req" data-va-req="${esc(code)}">평가 요청</button>`;
}
async function vaRequest(code) {
  const x = vaRow(code); if (!x || vaReqOf(code)) return;
  if (!rqS.loaded) await rqLoad().catch(() => {});
  if (vaReqOf(code)) { vaShow(); return; }
  const item = { id: uid(), page: 'valuation', kind: 'va', code, text: `[평가 요청] ${x.name}(${code}) 상대가치평가와 절대가치평가`, by: rqWho(), email: (G.account?.username || '').toLowerCase(), at: new Date().toISOString(), status: 'open', replies: [] };
  await rqAct((items) => { if (!items.some((i) => i.id === item.id)) items.push(item); }, '평가 요청을 남겼습니다');
  vaShow(); // 실패해도 다시 그려 단추를 되살림
}

// 탭 위 회사 줄: 지금 보는 회사와 검색. 고른 회사가 없으면 검색과 평가한 회사 바로가기
function vaCoBar() {
  const code = vaCode(), x = code && vaRow(code);
  const cls = x ? [x.sector, x.industryGroup, x.industry].filter((v, i, a) => v && v !== a[i - 1]) : [];
  const sub = x ? [x.market, cls.join(' › ')].filter(Boolean).join(', ') : '';
  const srch = `<div class="va-srch va-srch-l"><input type="search" data-va-q value="${esc(vaS.q || '')}" placeholder="회사 이름이나 종목코드로 찾기" aria-label="회사 검색" autocomplete="off"><div class="va-sug" id="va-sug">${vaS.q ? vaSug(vaS.q) : ''}</div></div>`;
  const info = vaS.vt === 'mkt' || vaS.vt === 'rel' || vaS.vt === 'sum' ? infoBtn('valuation') : ''; // 화면 설명은 PC에서는 제목 줄, 폰에서는 이 줄(valuation.css)
  if (!x) {
    const done = vaDone();
    return `<div class="va-co none">${srch}${done.length ? `<div class="va-co-done"><span>평가한 회사</span>${done.map((o) => `<button type="button" class="va-chip" data-va-pick="${esc(o.code)}">${esc(o.name)}</button>`).join('')}</div>` : ''}${info}</div>`;
  }
  return `<div class="va-co"><div class="va-co-id"><h2>${esc(x.name)} <small>${esc(x.code)}</small><button type="button" class="va-co-x" data-va-clear aria-label="회사 선택 해제" title="선택 해제">${ico('plus', 'sm')}</button></h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${['mkt', 'fin'].includes(vaS.vt) ? vaReqBtn(code) : ''}${srch}${info}</div>`; // 가치평가 탭은 본문 빈 칸에 평가 요청이 있어 여기서는 뺌
}
function vaSug(qs, attr = 'data-va-pick') {
  const t = qs.trim().toLowerCase(); if (!t) return '';
  const list = vaS.mk?.list || (vaS.data?.cases || []).map((c) => ({ code: c.target.code, name: c.target.name, market: '' }));
  const hits = list.filter((x) => x.code.startsWith(t) || x.name.toLowerCase().includes(t)).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 8);
  return hits.length ? hits.map((x) => `<button type="button" ${attr}="${esc(x.code)}"><b>${esc(x.name)}</b><small>${esc(x.code)} ${esc(x.market || '')}${x.per ? `, PER ${vaNum(x.per, 1)}배` : ''}${attr === 'data-va-pick' && vaCaseOf(x.code) ? ', 리서치한 평가 있음' : ''}</small></button>`).join('') : '<div class="empty">맞는 회사가 없습니다.</div>';
}

// Peer 비교(리서치한 평가가 없는 회사의 상대가치평가 탭): Peer를 검색해 넣고 중앙값 PER과 비교
function vaPeerQ(F, x) {
  const d = vaS.mk, peers = F.peers.map((k) => d.by[k]), on = (vaS.qpr || 'on') === 'on';
  const inR = (v) => typeof v === 'number' && v > 0 && (!on || (v >= 10 && v <= 50));
  const st = (key) => { const v = peers.map((p) => p[key]).filter(inR); return v.length ? { med: vaQuant(v, 0.5), n: v.length } : null; };
  const sT = st('per'), sE = st('estPer');
  const mx = Math.max(10, ...[x, ...peers].map((p) => (p.per > 0 && p.per < 200 ? p.per : 0))) * 1.08;
  const bar = (p, me) => `<div class="va-pb ${me ? 'me' : ''} ${!me && !inR(p.per) ? 'cut' : ''}"><span>${esc(p.name)}</span><div><i style="width:${p.per > 0 ? Math.min(100, (p.per / mx) * 100).toFixed(1) : 0}%"></i>${sT ? `<b style="left:${Math.min(100, (sT.med / mx) * 100).toFixed(1)}%"></b>` : ''}</div><em>${vaX(p.per)}</em>${me ? '' : `<button type="button" class="va-x" data-va-prm="${esc(p.code)}" aria-label="${esc(p.name)} 빼기">×</button>`}</div>`;
  const res = sT || sE ? `<div class="va-tiles">${[['최근 4분기', sT, x.per], ['추정', sE, x.estPer]].filter(([, s]) => s).map(([lab, s, v]) => `<div class="va-tile"><span>${lab} PER 기준 상승여력</span><strong>${v > 0 ? vaUp(s.med / v - 1) : '-'}</strong><p>Peer 중앙값 ${vaX(s.med)}(${s.n}곳), 지금 ${vaX(v)}</p></div>`).join('')}</div>` : '';
  const same = d.list.filter((y) => y.industry && y.industry === x.industry && y.code !== x.code && !F.peers.includes(y.code)).length;
  const body = `<div class="va-mctl"><div class="va-srch"><input type="search" data-va-pq value="${esc(vaS.pq || '')}" placeholder="Peer 추가" aria-label="Peer 검색" autocomplete="off"><div class="va-sug" id="va-psug">${vaS.pq ? vaSug(vaS.pq, 'data-va-padd') : ''}</div></div>
      ${same ? `<button class="btn ghost sm" type="button" data-va-pind>같은 업종 시가총액 상위 5곳 넣기</button>` : ''}<div><span class="va-lab">PER 10～50배만</span>${vaSeg('qpr', [['on', '켬'], ['off', '끔']], on ? 'on' : 'off')}</div></div>
    ${peers.length ? `${res}<div class="va-pbs">${sT ? vaPbHead(sT.med, mx) : ''}${bar(x, true)}${peers.map((p) => bar(p, false)).join('')}</div>${on && peers.some((p) => !inR(p.per)) ? '<div class="va-leg"><span class="ct">10～50배 밖이라 뺀 회사</span></div>' : ''}` : '<div class="empty">Peer를 넣어 주세요.</div>'}`;
  return vaSec('Peer 비교', '', body);
}

// ---------- 요약 탭: 전 상장사 PER 분포, PER 추이, 업종별 PER 비교, 업종 안 PER 분포 (SK오션플랜트 IM 99쪽 구성) ----------
const VA_LV = [['sector', '대분류'], ['industryGroup', '중분류'], ['industry', '소분류']]; // FnGuide 분류 단계. 세부 업종(네이버 테마를 묶은 것, lv 'theme')은 데이터에 themes 가 있을 때만
/* 세부 업종: 네이버 테마를 2차전지 정도 크기로 묶음(2026-11-17 사용자 「2차전지(나트륨이온), 전고체가 나뉠 정도로 너무 세부적이지는 않게」).
   [묶음 이름, 테마 이름 정규식, 대분류]. 맞는 테마들의 종목을 합침(한 종목이 여러 묶음에 들 수 있음). 어느 묶음에도 안 맞는 테마(행사, 정책, 계절, 특정 회사, 지수 등)는 뺌. 새 테마가 생기면 여기에 넣음 */
const VA_TH_GROUP = [ // [묶음 이름, 테마 이름 정규식, 대분류]. 이 순서가 「기본 순서」
  ['반도체', /^반도체|시스템반도체|HBM|CXL|소캠|전력반도체|유리 기판/, 'IT'], ['디스플레이', /OLED|플렉서블 디스플레이|^LED|마이크로 LED/, 'IT'], ['스마트폰 부품', /^스마트폰$|폴더블폰|카메라모듈|^PCB|무선충전|MLCC/, 'IT'], ['통신장비', /^5G|통신장비|광통신/, 'IT'], ['로봇', /로봇/, 'IT'], ['AI', /AI 챗봇|온디바이스 AI|음성인식|의료AI/, 'IT'], ['클라우드, 데이터센터', /클라우드|데이터센터|냉각시스템/, 'IT'], ['IT 서비스', /^SI\(|^NI\(/, 'IT'], ['보안', /^보안주|바이오인식|CCTV/, 'IT'], ['양자컴퓨팅', /양자/, 'IT'],
  ['2차전지', /^2차전지|^리튬$|폐배터리|전기차 화재/, '2차전지, 자동차'], ['전기차', /^전기차$|^전기차\(충전/, '2차전지, 자동차'], ['자동차부품', /^자동차부품$|^타이어$/, '2차전지, 자동차'], ['자율주행', /자율주행|스마트카/, '2차전지, 자동차'],
  ['게임', /게임/, '콘텐츠, 인터넷'], ['엔터, 콘텐츠', /엔터테인먼트|영상콘텐츠|음원|웹툰|미디어|^광고$|캐릭터|모바일콘텐츠/, '콘텐츠, 인터넷'], ['메타버스', /메타버스|가상현실|증강현실/, '콘텐츠, 인터넷'],
  ['방산', /방위산업/, '산업재'], ['우주항공', /우주항공|항공기부품|UAM|드론/, '산업재'], ['조선', /^조선/, '산업재'], ['해운', /^해운$/, '산업재'], ['기계', /건설기계|공작기계|피팅|스마트팩토리/, '산업재'], ['건설', /건설 중소형|리모델링|시멘트|아스콘/, '산업재'], ['철도', /^철도$/, '산업재'], ['물류', /종합 물류|콜드체인/, '산업재'],
  ['원자력', /원자력|핵융합/, '에너지, 소재'], ['전력설비', /전력설비|^전선$|스마트그리드|ESS/, '에너지, 소재'], ['신재생에너지', /태양광|풍력/, '에너지, 소재'], ['수소', /수소에너지|SOFC/, '에너지, 소재'], ['가스, 에너지', /LNG|LPG|도시가스|셰일가스|주유소|자원개발/, '에너지, 소재'], ['환경', /수자원|탄소|공기청정기/, '에너지, 소재'], ['철강', /철강|강관/, '에너지, 소재'], ['비철금속', /비철금속|희귀금속|^니켈$/, '에너지, 소재'], ['화학', /석유화학|페인트|윤활유|탈 플라스틱|그래핀/, '에너지, 소재'], ['제지', /골판지|조림/, '에너지, 소재'],
  ['제약', /^제약업체$/, '헬스케어'], ['바이오', /바이오시밀러|mRNA|면역항암제|유전자 치료제|줄기세포|마이크로바이옴|탈모 치료/, '헬스케어'], ['비만치료제', /비만치료제/, '헬스케어'], ['진단, 백신', /백신\/진단시약/, '헬스케어'], ['의료기기', /^의료기기$|치아 치료/, '헬스케어'], ['미용 의료', /보톡스|미용기기/, '헬스케어'], ['디지털 헬스케어', /원격진료/, '헬스케어'],
  ['화장품', /^화장품$/, '소비재'], ['건강기능식품', /건강기능식품/, '소비재'], ['음식료', /음식료|주류업/, '소비재'], ['농축수산', /^사료$|^육계$|^수산$|^농업$|^비료$/, '소비재'], ['패션, 의류', /패션/, '소비재'], ['유통', /소매유통|백화점|면세점/, '소비재'], ['여행, 레저', /^여행$|호텔|카지노|^골프$/, '소비재'], ['교육', /교육/, '소비재'],
  ['증권', /^증권$/, '금융'], ['은행, 보험', /^은행$|손해보험/, '금융'], ['창투사', /창투사/, '금융'], ['리츠', /리츠/, '금융'], ['지주사', /^지주사$/, '금융'], ['핀테크', /핀테크|전자결제|마이데이터|인터넷은행/, '금융'], ['가상자산', /가상화폐|블록체인|^NFT|^STO|스테이블코인/, '금융'],
];
const VA_UP = { industryGroup: 'sector', industry: 'industryGroup' };
const VA_SEC_ORD = ['IT', '통신서비스', '산업재', '에너지', '소재', '유틸리티', '의료', '필수소비재', '경기소비재', '금융']; // FnGuide 대분류의 「기본 순서」
const VA_GMAX = 10; // 업종별 비교에 한 번에 보이는 줄 수
const VA_G2 = 700; // 네 칸을 두 줄로 놓는 화면 폭(px). 그보다 좁으면 한 줄
const vaCap = (v) => (v == null ? '-' : v >= 10000 ? `${vaNum(v / 10000, 1)}조` : `${vaNum(v)}억`);
const vaMean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const vaThOf = (x) => vaS.mk?.thOf?.[x.code] || [];
function vaCw(full) { // 차트를 그릴 칸의 안쪽 폭(px). SVG를 실제 폭으로 그려 글자가 줄지 않게 한다
  const w = vaS.cw || 720, pad = matchMedia('(max-width: 760px)').matches ? 32 : 48;
  return Math.max(260, Math.round((full || w < VA_G2 ? w : (w - 16) / 2) - pad - 2));
}

function vaGrp(x) { // 업종별 비교에서 고른 분류 단계와 업종 안 분포로 볼 묶음. 줄을 눌러 고른 업종 > 보는 회사의 업종 > 종목이 가장 많은 업종
  const d = vaS.mk, th = x ? vaThOf(x) : [];
  const lv = vaS.lv === 'theme' ? (d.thSet && (!x || th.length) ? 'theme' : 'sector') : VA_LV.some(([k]) => k === vaS.lv) ? vaS.lv : 'sector';
  if (lv === 'theme') { // 회사를 골랐으면 그 회사가 든 세부 업종 가운데, 아니면 전체에서. 처음엔 종목이 가장 많은 것
    const cand = x ? th : d.themes.map((_, k) => k), big = [...cand].sort((a, b) => d.thSet[b].size - d.thSet[a].size);
    const i = cand.find((k) => d.themes[k][0] === vaS.thm) ?? big[0];
    return { lv, name: d.themes[i][0], own: null, has: (y) => d.thSet[i].has(y.code) };
  }
  const own = x?.[lv] || null;
  let name = vaS.gsel?.lv === lv ? vaS.gsel.name : own;
  if (!name) { const n = {}; for (const y of vaMkUse()) if (y[lv]) n[y[lv]] = (n[y[lv]] || 0) + 1; name = Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null; }
  return { lv, name, own, has: (y) => !!name && y[lv] === name };
}
function vaGrpRows(x, g, key) { // 묶음별 PER 중앙값과 25～75% 구간, 1개월 상승률 중앙값, 20일 거래대금 합. 순서(vaS.gord): 기본은 전부, 상승률과 거래대금은 위 10개(펼치면 전부)
  const d = vaS.mk, use = vaMkUse(), ord = vaGord();
  const stat = (k, ys, sec) => {
    const v = ys.map((y) => y[key]).filter(vaOkPer), r1 = ys.map((y) => y.r1m).filter((z) => typeof z === 'number');
    return { k, sec, n: v.length, med: vaQuant(v, 0.5), lo: vaQuant(v, 0.25), hi: vaQuant(v, 0.75), r1: r1.length >= 3 ? vaQuant(r1, 0.5) : null, tv: ys.reduce((a, y) => a + (y.tv20 || 0), 0) };
  };
  let all;
  if (g.lv === 'theme') all = (x ? vaThOf(x) : d.themes.map((_, k) => k)).map((i) => stat(d.themes[i][0], use.filter((y) => d.thSet[i].has(y.code)), d.themes[i][2])).filter((r) => r.n);
  else {
    const by = {}, up = VA_UP[g.lv];
    for (const y of use) if (y[g.lv]) (by[y[g.lv]] ||= []).push(y);
    all = Object.entries(by).map(([k, ys]) => stat(k, ys, up ? ys[0].sector : null)).filter((r) => r.n >= (r.k === g.name || r.k === g.own ? 1 : 5));
  }
  const tvAll = use.reduce((a, y) => a + (y.tv20 || 0), 0);
  for (const r of all) r.sh = tvAll ? r.tv / tvAll : null;
  const total = all.length;
  if (vaGord() === 'base') { // 늘 같은 자리: 세부 업종은 VA_TH_GROUP 순서, FnGuide는 대분류 순서 안에서 종목 수 순
    const si = (sec) => { const k = VA_SEC_ORD.indexOf(sec); return k < 0 ? 99 : k; };
    if (g.lv === 'theme') { const ix = Object.fromEntries(d.themes.map((t, k) => [t[0], k])); all.sort((a, b) => ix[a.k] - ix[b.k]); }
    else if (g.lv === 'sector') all.sort((a, b) => si(a.k) - si(b.k));
    else all.sort((a, b) => si(a.sec) - si(b.sec) || b.n - a.n);
    return { total, rows: all, head: g.lv !== 'sector' };
  }
  const m = ord === 'r1m' ? (r) => r.r1 ?? -9 : (r) => r.tv;
  all.sort((a, b) => m(b) - m(a));
  const open = g.lv === 'theme' ? vaS.thAll : vaS.gAll, rows = open ? all : all.slice(0, VA_GMAX);
  const keep = all.find((r) => (r.k === g.name || r.k === g.own) && !rows.includes(r)); // 보고 있는 업종은 순위 밖이어도 맨 아래에 붙임
  return { total, rows: keep ? [...rows, keep] : rows, head: false };
}
const vaGord = () => (['r1m', 'tv'].includes(vaS.gord) && vaS.mk?.cols?.includes('r1m') ? vaS.gord : 'base');

function vaHisto(vals, tv, name) { // 구간별 종목 수 막대. 중앙값(실선), 평균(점선), 보는 회사(파란 점선)마다 선 위에 이름표(손PB 분포 그림처럼)
  if (!vals.length) return '<div class="empty">PER이 있는 회사가 없습니다.</div>';
  const N = VA_BUCKETS.length, at = (v) => VA_BUCKETS.findIndex(([a, b]) => v >= a && v < b);
  const pos = (v) => { const i = at(v), [a, b] = VA_BUCKETS[i]; return +(((i + (v - a) / (b - a)) / N) * 100).toFixed(2); }; // 구간 폭이 달라 구간 안에서만 비례로 놓음
  const cnt = VA_BUCKETS.map(([a, b]) => vals.filter((v) => v >= a && v < b).length), mx = Math.max(...cnt);
  const med = vaQuant(vals, 0.5), avg = vaMean(vals), ti = vaOkPer(tv) ? at(tv) : -1;
  // 이름표 자리: 선 가까운 줄부터 채우고 겹치면 한 줄 위로. 이름표는 선 위치만큼 왼쪽으로 당겨 칸 밖으로 안 나가게
  const W = vaCw(), tw = (t) => [...t].reduce((a, ch) => a + (ch.codePointAt(0) >= 0x1100 ? 12 : 7), 12);
  const marks = [['md', med, `중앙값 ${vaX(med)}`], ['av', avg, `평균 ${vaX(avg)}`], ...(ti < 0 ? [] : [['tg', tv, `${name} ${vaX(tv)}`]])].map(([cls, v, t]) => {
    const p = pos(v), w = tw(t), x = (p / 100) * (W - w); return { cls, p, t, x0: x - 4, x1: x + w + 4 };
  });
  const rows = [];
  for (const m of marks) { let k = 0; while ((rows[k] ||= []).some((o) => m.x0 < o.x1 && o.x0 < m.x1)) k++; rows[k].push(m); m.k = k; }
  const R = rows.length, LH = 20;
  const mk = marks.map((m) => `<div class="va-hm ${m.cls}" style="left:${m.p}%;top:${(R - 1 - m.k) * LH}px"><b style="transform:translateX(-${m.p}%)">${esc(m.t)}</b></div>`).join('');
  const bars = cnt.map((n, i) => `<div class="va-hb ${i === ti ? 'tg' : ''}" title="${VA_BUCKETS[i][0]}～${VA_BUCKETS[i][1]}배 ${vaNum(n)}곳 (${vaNum((n / vals.length) * 100, 1)}%)"><span>${vaNum(n)}</span><i style="height:calc((100% - 24px) * ${(n / mx).toFixed(3)})"></i></div>`).join('');
  const ticks = [...VA_BUCKETS.map(([a]) => a), VA_BUCKETS[N - 1][1]].map((v, i) => `<span style="left:${(i / N) * 100}%">${v}</span>`).join('');
  const out = ti >= 0 || !name ? '' : `<p class="va-note">${esc(name)} ${tv >= 200 ? `${vaX(tv)}, 200배 이상이라 그림에 없음` : tv < 0 ? '적자 추정이라 PER 없음' : 'PER 없음'}</p>`;
  return `<div class="va-hg" role="img" aria-label="PER 구간별 종목 수. 중앙값 ${vaNum(med, 1)}배, 평균 ${vaNum(avg, 1)}배${ti < 0 ? '' : `, ${esc(name)} ${vaNum(tv, 1)}배`}"><div class="va-hg-w" style="padding-top:${R * LH + 4}px"><div class="va-hg-p" style="grid-template-columns:repeat(${N}, minmax(0, 1fr))">${bars}</div>
    ${mk}</div><div class="va-hx">${ticks}</div></div>${out}`;
}

function vaCmp(x, g, key) { // 업종별 PER 비교: 분류 단계와 순서를 골라 묶음마다 PER 중앙값, 25～75% 구간, 1개월 상승률. 줄을 누르면 업종 안 분포가 그 업종으로 바뀜
  const th = x ? vaThOf(x) : [], isTh = g.lv === 'theme', { rows, total, head } = vaGrpRows(x, g, key), ord = vaGord();
  const seg = vaSeg('lv', [...VA_LV, ...(vaS.mk?.thSet && (!x || th.length) ? [['theme', '세부 업종']] : [])], g.lv);
  const oseg = vaS.mk?.cols?.includes('r1m') ? `<div class="va-mctl">${vaSeg('gord', [['base', '기본 순서'], ['r1m', '1개월 상승률'], ['tv', '거래대금']], ord)}</div>` : '';
  const ttl = '업종별 PER 비교';
  if (!rows.length) return vaSec(ttl, seg, `${oseg}<div class="empty">PER이 있는 회사가 없습니다.</div>`, 'va-cmp');
  const tv = x?.[key], mx = Math.max(...rows.map((r) => r.hi)) * 1.05, P = (v) => `${Math.min(100, (v / mx) * 100).toFixed(1)}%`;
  const dotOn = (r) => !!x && (r.k === g.own || isTh) && vaOkPer(tv) && tv <= mx; // 보는 회사 PER 점. 눈금 밖이면 안 찍음
  const third = ord === 'tv' ? (r) => (r.sh == null ? '-' : `${vaNum(r.sh * 100, 1)}%`) : (r) => (r.r1 == null ? '-' : vaUp(r.r1));
  const row = (r) => {
    const me = r.k === g.name, dot = dotOn(r);
    const tip = esc(`${r.k} PER 중앙값 ${vaNum(r.med, 1)}배, 25～75% ${vaNum(r.lo, 1)}～${vaNum(r.hi, 1)}배, ${r.n}곳${r.r1 != null ? `, 1개월 상승률 중앙값 ${vaNum(r.r1 * 100, 1)}%` : ''}${r.tv ? `, 20일 거래대금 ${vaCap(r.tv)}` : ''}`);
    return `<button type="button" class="va-gr ${me ? 'me' : ''}" ${isTh ? 'data-va-thm' : 'data-va-grp'}="${esc(r.k)}" aria-pressed="${me}" title="${tip}"><span class="nm">${esc(r.k)}${r.k === g.own && !isTh ? '<i class="own"></i>' : ''}</span>`
      + `<span class="bar"><i style="left:${P(r.lo)};width:calc(${P(r.hi)} - ${P(r.lo)})"></i><b style="left:${P(r.med)}"></b>${dot ? `<u style="left:${P(tv)}"></u>` : ''}</span><em class="mt">${third(r)}</em><em>${vaX(r.med)}</em><small>${vaNum(r.n)}곳</small></button>`;
  };
  let body = '', sec = null;
  for (const r of rows) { if (head && r.sec && r.sec !== sec) { body += `<div class="va-gh">${esc(r.sec)}</div>`; sec = r.sec; } body += row(r); }
  const hdr = `<div class="va-grh"><span>업종</span><span>PER 25～75%</span>${ord === 'tv' ? '<span title="전체 거래대금 가운데 비중">비중</span>' : '<span title="1개월 상승률 중앙값">1개월</span>'}<span>PER</span><span>종목</span></div>`;
  const open = isTh ? vaS.thAll : vaS.gAll;
  const more = ord !== 'base' && total > VA_GMAX ? `<button class="va-more" type="button" ${isTh ? 'data-va-thall' : 'data-va-gall'}>${open ? '접기' : `나머지 ${total - VA_GMAX}개`}</button>` : '';
  const leg = `<div class="va-leg"><span class="bd">PER 25～75% 구간</span><span class="md">PER 중앙값</span>${rows.some(dotOn) ? `<span class="tg">${esc(x.name)} ${vaX(tv)}</span>` : ''}</div>`;
  const meta = ord !== 'base' && total > rows.length ? ` <span class="meta">${total}개 중 ${rows.length}개</span>` : ` <span class="meta">${total}개</span>`;
  return vaSec(`${ttl}${meta}`, seg, `${oseg}${hdr}<div class="va-grs">${body}</div>${more}${leg}`, 'va-cmp');
}

function vaPerList(ys, key, x) { // 회사가 적으면 막대 분포 대신 회사별 PER. 세로선은 중앙값
  const vs = ys.map((y) => y[key]), med = vaQuant(vs, 0.5), mx = Math.max(...vs) * 1.08, W = (v) => `${Math.min(100, (v / mx) * 100).toFixed(1)}%`;
  const rows = [...ys].sort((a, b) => b[key] - a[key]).map((y) => `<div class="va-pb ${y.code === x?.code ? 'me' : ''}"><span>${esc(y.name)}</span><div><i style="width:${W(y[key])}"></i><b style="left:${W(med)}"></b></div><em>${vaX(y[key])}</em></div>`).join('');
  return `<div class="va-pbs va-gl">${vaPbHead(med, mx)}${rows}</div>`;
}
function vaInGrp(x, g, key) { // 업종 안 PER 분포: 업종별 비교에서 고른 업종(테마)
  const ttl = '업종 안 PER 분포';
  if (!g.name) return vaSec(ttl, '', '<div class="empty">업종 분류가 없는 회사입니다.</div>');
  const ys = vaMkUse().filter((y) => g.has(y) && vaOkPer(y[key])), vals = ys.map((y) => y[key]), mine = x && g.has(x);
  return vaSec(`${ttl} <span class="meta">${esc(g.name)}, ${vaNum(ys.length)}곳</span>`, '', `${ys.length && ys.length < 10 ? vaPerList(ys, key, x) : vaHisto(vals, mine ? x[key] : null, mine ? x.name : '')}`);
}

function vaPos(F, key) { // 보는 회사와 비교기업(또는 Peer)의 시장 내 위치와 회귀 적정 PER
  const row = (code, role) => {
    const x = vaRow(code); if (!x) return '';
    const f = vaFit(x), pc = vaPctl(x[key], key);
    return `<tr class="${role === F.role ? 'va-tgt' : ''}"><td class="st"><b>${esc(x.name)}</b><small>${role}${x.industry ? `, ${esc(x.industry)}` : ''}</small></td><td>${vaX(x.per)}</td><td>${vaX(x.estPer)}</td><td>${pc == null ? '-' : `하위 ${vaNum(pc * 100)}%`}</td><td>${f ? `${vaNum(f.growth * 100)}%` : '-'}</td><td>${f?.per ? `${vaX(f.per)}${f.simple ? '<small>단순 회귀</small>' : ''}` : '-'}</td><td>${f?.per && x.per ? vaUp(f.per / x.per - 1) : '-'}</td></tr>`;
  };
  return `<div class="mk-scroll"><table class="mk-tbl va-pos"><thead><tr><th class="st">회사</th><th>최근 4분기 PER</th><th>추정 PER</th><th>시장 내 위치</th><th>이익 성장률</th><th>회귀 적정 PER</th><th>괴리</th></tr></thead><tbody>${row(F.code, F.role)}${F.peers.map((k) => row(k, F.peerRole)).join('')}</tbody></table></div>`;
}
const vaFold = (k, title, body) => (body ? `<details class="card va-fold" ${vaS.fold[k] ? 'open' : ''}><summary data-va-fold="${k}">${title}</summary><div class="mk-body">${body}</div></details>` : '');

function vaMktTab() {
  const d = vaS.mk, code = vaCode(), x = code ? vaRow(code) : null;
  if (!d) return '<div class="card"><div class="empty">시장 데이터를 읽지 못했습니다.</div></div>';
  const c = x ? vaCase() : null, F = !x ? null : c ? vaFocusCase(c) : vaFocusQuick(code) || { code, name: x.name, close: null, peers: [], role: '선택', peerRole: 'Peer' };
  const key = vaS.mkKind || 'per', mkm = vaS.mkMarket || 'ALL', ML = { ALL: '시장', KOSPI: '코스피', KOSDAQ: '코스닥' }[mkm];
  const use = vaMkUse(), all = use.map((y) => y[key]).filter(vaOkPer), g = vaGrp(x), w = vaS.cw || 720;
  const med = (xs) => (xs.length ? vaX(vaQuant(xs, 0.5)) : '-'), per = (v) => (v < 0 ? '적자' : vaX(v));
  let kv;
  if (x) {
    const pc = vaPctl(x[key], key), gv = g.own ? use.filter((y) => y[g.lv] === g.own && vaOkPer(y[key])).map((y) => y[key]) : [];
    kv = [[key === 'per' ? '최근 4분기 PER' : '추정 PER', per(x[key]), true], [key === 'per' ? '추정 PER' : '최근 4분기 PER', per(x[key === 'per' ? 'estPer' : 'per'])], [`${ML} 내 위치`, pc == null ? '-' : `하위 ${vaNum(pc * 100)}%`],
      [`${ML} 중앙값`, med(all)], [`${g.lv === 'theme' ? '업종' : esc(g.own || '업종')} 중앙값`, gv.length ? `${med(gv)} <small>${vaNum(gv.length)}곳</small>` : '-'], ['시가총액', vaCap(x.mcap)]];
  } else {
    const by = (m) => d.list.filter((y) => y.market === m).map((y) => y[key]).filter(vaOkPer);
    kv = [[`${ML} 중앙값`, med(all), true], ['평균', all.length ? vaX(vaMean(all)) : '-'], ['25～75%', all.length ? `${vaNum(vaQuant(all, 0.25), 1)}～${vaNum(vaQuant(all, 0.75), 1)}배` : '-'],
      ['코스피 중앙값', med(by('KOSPI'))], ['코스닥 중앙값', med(by('KOSDAQ'))], ['PER 있는 종목', `${vaNum(all.length)}곳 <small>${vaNum(use.length)}곳 중</small>`]];
  }
  const bar = `<div class="va-fbar">${vaSeg('mkm', [['ALL', '전체'], ['KOSPI', '코스피'], ['KOSDAQ', '코스닥']], mkm)}${vaSeg('mkk', [['per', '최근 4분기 PER'], ['estPer', '추정 PER']], key)}${d.date ? `<span class="meta">${esc(d.date)} 기준</span>` : ''}</div>`;
  const kpi = `<section class="card va-kpis"><dl style="grid-template-columns:repeat(${w >= 1000 ? 6 : w >= 520 ? 3 : 2}, minmax(0, 1fr))">${kv.map(([k, v, big]) => `<div class="${big ? 'k' : ''}"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`;
  const dist = vaSec(`${{ ALL: '전 상장사', KOSPI: '코스피', KOSDAQ: '코스닥' }[mkm]} PER 분포 <span class="meta">${vaNum(all.length)}곳</span>`, '', `${vaHisto(all, x?.[key], x?.name || '')}`);
  const fold = F ? `${vaFold('pos', F.role === '대상' ? '대상과 비교기업 위치' : '선택한 회사와 Peer 위치', vaPos(F, key))}${vaFold('reg', 'PER 회귀', vaRegBody(F))}` : '';
  return `${bar}${kpi}<div class="va-g4 ${w >= VA_G2 ? 'two' : ''}">${dist}${vaTrend(F)}${vaCmp(x, g, key)}${vaInGrp(x, g, key)}</div>${fold}`;
}

function vaRegBody(F) { // PER 회귀(요약 탭 접힌 구역)
  const d = vaS.mk, g = d?.regression; if (!g?.simple) return '';
  const pts = d.list.filter((x) => g.fitted?.[x.code]).map((x) => ({ x, g: g.fitted[x.code][0], p: x.per }));
  if (!pts.length) return '';
  const W = vaCw(true), H = W < 480 ? 284 : 324, P = { l: 40, r: 24, t: 28, b: 48 }, gx = Math.min(2, Math.max(...pts.map((o) => o.g))), ylo = Math.log(2), yhi = Math.log(200);
  const X = (v) => P.l + (Math.min(v, gx) / gx) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (Math.log(Math.min(Math.max(v, 2), 200)) - ylo) / (yhi - ylo)) * (H - P.t - P.b);
  const grid = [2, 5, 10, 20, 50, 100, 200].map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${P.l - 6}" y="${Y(v) + 4}" class="yl">${v}</text>`).join('');
  const xt = [0, 0.5, 1, 1.5, 2].filter((v) => v <= gx + 1e-9).map((v) => `<text x="${X(v)}" y="${H - 28}" class="xl">${v * 100}%</text>`).join('')
    + `<text x="4" y="14" class="at">PER(배)</text><text x="${(P.l + W - P.r) / 2}" y="${H - 6}" class="at" style="text-anchor:middle">이익 성장률</text>`;
  const curve = Array.from({ length: 41 }, (_, i) => { const v = (gx * i) / 40; return `${i ? 'L' : 'M'}${X(v).toFixed(1)},${Y(Math.exp(g.simple.intercept + g.simple.slope * v)).toFixed(1)}`; }).join('');
  const tip = (o) => `<title>${esc(o.x.name)}: 성장률 ${vaNum(o.g * 100)}%, PER ${vaNum(o.p, 1)}배${g.fitted[o.x.code] ? `, 회귀 적정 ${vaNum(g.fitted[o.x.code][1], 1)}배` : ''}</title>`;
  const spot = (code) => { const x = d.by[code], f = vaFit(x); return x && f && f.growth > 0 && x.per ? { x, g: f.growth, p: x.per } : null; };
  const hl = [...F.peers.map((k) => [spot(k), 'pe']), [spot(F.code), 'tg']].filter(([o]) => o);
  const lab = (o) => `<text x="${(X(o.g) + 8).toFixed(1)}" y="${(Y(o.p) + 4).toFixed(1)}" class="dl">${esc(o.x.name)}</text>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="va-sc" role="img" aria-label="이익 성장률과 PER 산점도">${grid}${xt}
    ${pts.map((o) => `<circle cx="${X(o.g).toFixed(1)}" cy="${Y(o.p).toFixed(1)}" r="2.5" class="bg">${tip(o)}</circle>`).join('')}<path d="${curve}" class="cv"/>
    ${hl.map(([o, cls]) => `<circle cx="${X(o.g).toFixed(1)}" cy="${Y(o.p).toFixed(1)}" r="${cls === 'pe' ? 4 : 5.5}" class="${cls}">${tip(o)}</circle>${cls === 'tg' ? lab(o) : ''}`).join('')}</svg>`;
  const ms = g.models || {}, best = g.best && ms[g.best];
  const MN = { sector: '업종 대분류', industryGroup: '업종 중분류', industry: '업종 소분류' };
  const tg = d.by[F.code], cg = vaS.cg?.[F.code];
  let tf = vaFit(tg);
  if (cg != null && cg !== '' && tg?.per) {
    const gv = +cg / 100, f = g.fitted?.[tg.code], gc = (g.best && ms[g.best]?.growthCoef) ?? g.simple.slope;
    tf = { growth: gv, per: f ? f[1] * Math.exp(gc * (gv - f[0])) : Math.exp(g.simple.intercept + g.simple.slope * gv), simple: !f, custom: true };
  }
  const cin = `<label class="va-cg">이익 성장률 직접 넣기 <input type="number" step="1" inputmode="decimal" data-va-cg="${esc(F.code)}" value="${esc(cg ?? '')}" placeholder="${tf?.growth != null ? vaNum(tf.growth * 100) : ''}"> %</label>`;
  const px = tf?.per && tg?.per ? (F.close ? `적정 PER을 적용하면 주당 ${vaWon(F.close * (tf.per / tg.per))} ${vaUp(tf.per / tg.per - 1)}` : `적정 PER을 적용하면 지금 주가 대비 ${vaUp(tf.per / tg.per - 1)}`) : '';
  const tline = tf?.per && tg?.per
    ? `<div class="va-memo"><b>${esc(F.name)} 회귀 적정 PER ${vaX(tf.per)}</b><p>지금 ${vaX(tg.per)}(최근 4분기), 이익 성장률 ${vaNum(tf.growth * 100)}%. ${px}${tf.simple ? ', 단순 회귀 곡선' : ''}</p>${cin}</div>`
    : `<div class="va-memo"><p>${esc(F.name)}은 ${!tg?.per ? 'PER이 없어' : !tg?.estPer ? '추정 PER이 없어' : `이익 성장률이 ${vaNum((tg.per / tg.estPer - 1) * 100)}%(최근 4분기 PER ${vaNum(tg.per, 1)}배, 추정 PER ${vaNum(tg.estPer, 1)}배)라`} 회귀 표본에 들지 않습니다.</p>${tg?.per ? cin : ''}</div>`;
  const kv = [['표본', `${vaNum(g.n)}곳`], ['단순 회귀 R²', `${vaNum(g.simple.r2 * 100, 1)}%`], ...(best ? [[`${MN[g.best] || g.best} 반영 R²`, `${vaNum(best.r2 * 100, 1)}%`]] : [])];
  const body = `<dl class="va-kv va-mkv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="va-leg">${hl.some(([, k]) => k === 'tg') ? `<span class="tg">${esc(F.name)}</span>` : ''}${hl.some(([, k]) => k === 'pe') ? `<span class="pe">${F.peerRole === 'Peer' ? 'Peer' : '국내 비교기업'}</span>` : ''}<span class="cv">단순 회귀 곡선</span></div>
    <div class="va-scw">${svg}</div>${tline}`;
  return body;
}

// ---------- PER 추이 (data/valuation_per_hist.json, market.py 가 평일 16:30에 쌓음. 손PB PER 추이 비교 차트와 같은 구성) ----------
const VA_HIST_FILE = 'data/valuation_per_hist.json';
function vaLoadHist() {
  if (vaS.hist || vaS.histErr) return Promise.resolve();
  vaS.histLoading ||= STORE.readText(VA_HIST_FILE)
    .then((r) => { vaS.hist = r.text ? JSON.parse(r.text) : null; if (!vaS.hist) vaS.histErr = true; })
    .catch(() => { vaS.histErr = true; })
    .finally(() => { vaS.histLoading = null; vaDraw(); });
  return vaS.histLoading;
}
function vaSmooth(pts) { // 손PB rollingAvg: 점이 200개 넘으면 10개, 아니면 4개 평균
  const w = pts.length > 200 ? 10 : 4;
  return pts.map((p, i) => { const xs = pts.slice(Math.max(0, i - w + 1), i + 1); return { d: p.d, v: xs.reduce((a, x) => a + x.v, 0) / xs.length }; });
}
function vaTrend(F) {
  const h = vaS.hist;
  if (!h) { if (!vaS.histErr) vaLoadHist(); return vaSec('PER 추이', '', `<div class="empty">${vaS.histErr ? 'PER 기록을 읽지 못했습니다.' : '불러오는 중…'}</div>`); }
  const x = F ? vaS.mk?.by[F.code] : null, mkt = x?.market === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI', yrs = vaS.trd || '5';
  const cut = yrs === 'all' ? '' : (() => { const d = new Date(); d.setFullYear(d.getFullYear() - +yrs); return d.toISOString().slice(0, 10); })();
  const ds = h.dates, a = F ? h.per[F.code] : null;
  const mPts = ds.map((d, i) => ({ d, v: h.mkt[mkt][i] })).filter((p) => p.v && p.d >= cut);
  // 회사를 고르지 않으면 코스피(파랑)와 코스닥(회색) 중앙값을 같이 그림
  const sPts = F ? (a ? a.slice(1).map((v, i) => ({ d: ds[a[0] + i], v })).filter((p) => p.v && p.d >= cut) : []) : ds.map((d, i) => ({ d, v: h.mkt.KOSDAQ?.[i] })).filter((p) => p.v && p.d >= cut);
  const seg = vaSeg('trd', [['1', '1년'], ['3', '3년'], ['5', '5년'], ['all', '전체']], yrs);
  if (mPts.length < 2) return vaSec('PER 추이', seg, '<div class="empty">기록이 쌓이는 중입니다.</div>');
  const M = vaSmooth(mPts), S = vaSmooth(sPts);
  // 선 끝 이름표: 넓으면 「코스피 8.9배」처럼 이름까지, 좁으면 값만(위 범례로)
  const W = vaCw(), H = W < 360 ? 210 : 260, named = W >= 360;
  const mName = mkt === 'KOSDAQ' ? '코스닥' : '코스피', sName = F ? (F.name.length > 8 ? `${F.name.slice(0, 7)}…` : F.name) : '코스닥';
  const lm = M[M.length - 1], ls = S.length > 1 ? S[S.length - 1] : null;
  const etx = (p, nm) => `${named ? `${nm} ` : ''}${vaNum(p.v, 1)}배`, tw = (t) => [...t].reduce((a, ch) => a + (ch.codePointAt(0) >= 0x1100 ? 12 : 7), 0);
  const P = { l: 40, r: Math.max(56, 12 + Math.max(tw(etx(lm, mName)), ls ? tw(etx(ls, sName)) : 0)), t: 12, b: 30 };
  const t0 = Date.parse(M[0].d), t1 = Date.parse(M[M.length - 1].d), vs = [...M, ...S].map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.12 || 2, y0 = lo - pad, y1 = hi + pad;
  const X = (d) => P.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r), Y = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const yt = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gl"/><text x="${P.l - 6}" y="${(Y(v) + 4).toFixed(1)}" class="yl">${vaNum(v)}</text>`).join('');
  const xt = [t0, (t0 + t1) / 2, t1].map((t, i) => { const d = new Date(t).toISOString().slice(0, 10); return `<text x="${X(d).toFixed(1)}" y="${H - 8}" class="xl" style="text-anchor:${['start', 'middle', 'end'][i]}">${d.slice(2, 7).replace('-', '.')}</text>`; }).join('');
  const gap = ls ? Y(ls.v) - Y(lm.v) : 99, nudge = Math.abs(gap) < 16 ? (16 - Math.abs(gap)) / 2 * (gap < 0 ? -1 : 1) : 0;
  const end = (p, cls, dy, nm) => `<text x="${(X(p.d) + 6).toFixed(1)}" y="${(Y(p.v) + 4 + dy).toFixed(1)}" class="${cls}">${esc(etx(p, nm))}</text>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="va-sc va-tr" role="img" aria-label="PER 추이">${yt}${xt}<path d="${path(M)}" class="mk"/>${S.length > 1 ? `<path d="${path(S)}" class="me"/>` : ''}${end(lm, 'el mk', -nudge, mName)}${ls ? end(ls, 'el me', nudge, sName) : ''}</svg>`;
  const raw = sPts.map((p) => p.v), mr = mPts.map((p) => p.v), last = (xs) => xs[xs.length - 1];
  let kv, leg, note = '';
  const mTip = 'PER 2～500배, 금융 업종 제외한 중앙값(위 시장 중앙값과 기준이 다름)';
  if (!F) { // 코스닥은 진한 선(me), 코스피는 회색 선(mk)
    kv = [['코스피 중앙값', vaX(last(mr)), mTip], ['코스닥 중앙값', vaX(last(raw)), mTip]];
    leg = '<div class="va-leg"><span class="cv">코스피 중앙값</span><span class="ln">코스닥 중앙값</span></div>';
  } else {
    kv = raw.length < 2 ? [['지금', vaX(raw[0] ?? x?.per)], [`${mName} 중앙값`, vaX(last(mr)), mTip]] : [['지금', vaX(last(raw))], ['기간 중앙값', vaX(vaQuant(raw, 0.5))], [`${mName} 중앙값`, vaX(last(mr)), mTip]];
    leg = `<div class="va-leg"><span class="ln">${esc(F.name)}</span><span class="cv">${mName} 중앙값</span></div>`;
    note = sPts.length < 2 ? `<p class="va-note">${esc(F.name)} 기록은 ${esc(sPts[0]?.d || ds[ds.length - 1])}부터 쌓는 중</p>` : '';
  }
  return vaSec('PER 추이', seg, `<dl class="va-mini">${kv.map(([k, v, t]) => `<div${t ? ` title="${t}"` : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${named ? '' : leg}<div class="va-scw">${svg}</div>${note}`);
}

const vaNone = (code, what) => `<div class="card va-none"><div class="empty"><p>${what}</p>${vaReqBtn(code)}</div></div>`; // 평가가 없는 회사: 안내와 평가 요청
// ---------- 평가한 회사 목록(회사를 고르지 않은 재무분석, 요약, 상대가치평가, 절대가치평가) ----------
function vaPickList() {
  const done = vaDone();
  if (!done.length) return '<div class="card"><div class="empty">아직 평가한 회사가 없습니다.</div></div>';
  const rows = done.map((o) => {
    let tp = null, up = null, close = null, day = '';
    if (o.v3?.py?.blend) { const b = o.v3.py.blend; tp = b.target; up = b.up; close = o.v3.target.close; day = o.v3.target.val_date || ''; }
    else if (o.rel) { const t = vaTarget(o.rel, vaCalc(o.rel)); tp = t ? Math.round(t.ps / 100) * 100 : null; up = t?.up; close = o.rel.target.close; day = o.rel.day; }
    const kinds = [o.rel ? '상대가치' : '', o.v3 ? '절대가치' : ''].filter(Boolean).join(', ');
    return `<tr class="va-prow" data-va-pick="${esc(o.code)}" tabindex="0"><td class="st"><b>${esc(o.name)}</b><small>${esc(o.code)}</small></td><td><b>${vaWon(tp)}</b></td><td>${vaUp(up) || '-'}</td><td>${vaWon(close)}</td><td>${esc(kinds)}</td><td>${esc(day)}</td></tr>`;
  }).join('');
  return vaSec('평가한 회사', `<span class="meta">${done.length}곳</span>`, `<div class="mk-scroll"><table class="mk-tbl va-plist"><thead><tr><th class="st">회사</th><th>목표주가</th><th>상승여력</th><th>현재가</th><th>평가</th><th>기준일</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

// ---------- 요약 탭: 결합 목표주가, 풋볼필드, 상대가치평가와 절대가치평가 한 장씩 ----------
const vaGoTab = (k, label) => `<button type="button" class="va-link" data-va-vt="${k}">${label}${ico('right', 'sm')}</button>`;
function vaBrief() {
  const code = vaCode();
  if (!code) return vaPickList();
  const c = vaCase(), vs = vaV3Of(code), vc = vs.find((y) => y.id === v3S.cid) || vs[0];
  if (!c && !vc) return `${vaNone(code, '아직 평가하지 않은 회사입니다.')}${vaPickList()}`;
  const r = c ? vaCalc(c) : null, tp = c ? vaTarget(c, r) : null;
  let x = null;
  if (vc) try { x = v3Model(vc); } catch (e) { console.error(e); }
  const round = (v) => (v == null ? null : Math.round(v / 100) * 100);
  const close = x ? x.t.close : c.target.close, day = x ? x.t.val_date : c.day;
  const relPs = x ? x.res.blend?.rel : round(tp?.ps), relUp = relPs && close ? relPs / close - 1 : null;
  const cell = (lab, val, sub, cls = '') => `<div class="${cls}"><span>${lab}</span><b>${val}</b><em>${sub || ''}</em></div>`;
  let kpi;
  if (x) {
    const bl = x.res.blend || {}, wd = bl.w_dcf, typ = v3DcfTyp(x), dv = typ ? bl.dcf : x.res.wavg?.ok === false ? null : x.res.wavg?.ps;
    const wt = (w) => (w > 0 && w < 1 ? ` <small>비중 ${vaNum(w * 100)}%</small>` : '');
    kpi = cell('목표주가', vaWon(bl.target), vaUp(bl.up), 'tp') + cell(`${esc(v3DcfName(x))}${wt(wd)}`, vaWon(dv), vaUp(dv && close ? dv / close - 1 : null))
      + cell(`상대가치${wt(1 - wd)}`, vaWon(bl.rel), bl.rel_blocked ? '유형에 맞지 않아 뺌' : vaUp(relUp)) + cell('현재가', vaWon(close), esc(day || ''));
  } else {
    const nm = tp?.parts.map((p) => p.nm).join(', ') || '', st = nm && r.st[r.s.base][tp.parts[0].nm];
    kpi = cell('목표주가', vaWon(round(tp?.ps)), vaUp(tp?.up), 'tp') + cell(`평가 배수 ${esc(nm)}`, st ? vaX(st.median) : '-', st ? `${esc(VA_PER[r.s.base])}, 비교기업 ${st.n}곳 중앙값` : '')
      + cell('증권사 목표가 평균', vaWon(c.target.target_mean), '') + cell('현재가', vaWon(close), esc(day || ''));
  }
  const head = `<section class="card va-brief"><div class="v3-kpi">${kpi}</div></section>`;
  const ff = x ? v3Try(v3qFf, x, vc) : vaSec('풋볼필드', '', vaFootball(c, r));
  // 상대가치평가 한 장
  let rel;
  if (c) {
    const s = r.s, lead = tp?.parts.map((p) => p.nm) || c.primary.slice(0, 1), nm = lead[0], st = r.st[s.base][nm], item = VA_MULT[nm]?.[1], m = c.target.metrics[s.base] || {};
    const peers = vaUse(c, s).map((p) => p.name);
    rel = vaSec('상대가치평가', vaGoTab('rel', '자세히'), `<div class="va-bv"><span>주당 가치</span><b>${vaWon(round(tp?.ps))}</b>${vaUp(tp?.up)}</div>
      <dl class="va-asm"><div><dt>평가 배수</dt><dd>${esc(lead.join(', '))}, ${esc(VA_PER[s.base])}</dd></div><div><dt>Target ${esc(nm)}</dt><dd>${vaX(st?.median)} <small>${st?.n ?? 0}곳 중앙값</small></dd></div>
      <div><dt>${esc(VA_PER[s.base])} ${esc(VA_MET[item] || '')}</dt><dd>${vaNum(m[item])}억</dd></div></dl>
      ${peers.length ? `<div class="va-chips">${peers.map((n) => `<span>${esc(n)}</span>`).join('')}</div>` : ''}`);
  } else rel = vaSec('상대가치평가', '', `<div class="va-bv"><span>주당 가치</span><b>${vaWon(relPs)}</b>${vaUp(relUp)}</div><p class="va-note">상대가치평가 사례 없이 절대가치평가 입력의 값</p>`);
  // 절대가치평가 한 장
  let abs = '';
  if (x) {
    const sc = x.res.scen || {}, wt = x.sw.weights || {}, V = (id, S = 'Base') => v3V(x, id, 0, S), wv = x.res.wavg || {};
    const rows = V3_SCEN.map((S) => `<tr><td class="st">${v3pDot(S)}${S}</td><td>${vaWon(sc[S]?.ps)}</td><td>${vaUp(sc[S]?.up) || '-'}</td><td>${v3Pct(wt[S])}</td></tr>`).join('');
    abs = vaSec('절대가치평가', vaGoTab('dcf', '자세히'), `<div class="va-bv"><span>${esc(v3DcfName(x))}</span><b>${vaWon(wv.ps)}</b>${vaUp(wv.up)}</div>
      <div class="mk-scroll"><table class="mk-tbl va-sct"><thead><tr><th class="st">시나리오</th><th>주당 가치</th><th>상승여력</th><th>가중치</th></tr></thead><tbody>${rows}</tbody></table></div>
      <dl class="va-asm"><div><dt>WACC</dt><dd>${v3Pct(V('WACC.wacc'), 2)}</dd></div><div><dt>영구성장률</dt><dd>${v3Pct(V('DCF.g_s'), 2)}</dd></div><div><dt>추정 기간</dt><dd>명시 ${x.tl.N}년${x.tl.M ? `, 전환 ${x.tl.M}년` : ''}</dd></div><div><dt>종료가치 비중</dt><dd>${v3Pct(V('DCF.tv_share'), 1)}</dd></div></dl>`);
  }
  const memo = c?.conclusion ? vaSec('판단 메모', '', `<p class="va-prof">${vaTx(c.conclusion)}</p>`) : '';
  return `${head}${ff}<div class="va-two">${rel}${abs}</div>${memo}`;
}

// ---------- 그리기 ----------
function vaDraw() { // 시장동향, 요약, 상대가치평가 탭 본문
  const host = $('#va-host'); if (!host || !['mkt', 'sum', 'rel'].includes(vaS.vt)) return;
  vaS.cw = host.clientWidth;
  if (vaS.vt === 'mkt') { host.innerHTML = vaMktTab(); vaSave(); return; }
  if (vaS.vt === 'sum') { host.innerHTML = vaBrief(); vaSave(); return; }
  if (vaS.err) { host.innerHTML = `<div class="card"><div class="empty">${esc(vaS.err)}</div></div>`; return; }
  const c = vaCase(), code = vaCode();
  if (!c) { // 회사를 고르지 않았으면 평가한 회사 목록, 리서치한 평가가 없는 회사는 Peer 비교
    const x = code && vaS.mk?.by[code];
    host.innerHTML = !code ? vaPickList() : `${vaNone(code, '상대가치평가가 없는 회사입니다.')}${x ? vaPeerQ(vaFocusQuick(code), x) : ''}`;
    vaSave(); return;
  }
  vaS.cid = c.id;
  const r = vaCalc(c), tab = ['sum', 'mult', 'chk', 'pick'].includes(vaS.tab) ? vaS.tab : 'sum';
  const body = { sum: () => vaSummary(c, r), mult: () => vaRange(c, r) + vaMultTable(c, r) + vaApply(c, r), chk: () => vaLoo(c, r) + vaScen(c, r), pick: () => vaPick(c) }[tab];
  host.innerHTML = vaHead(c, r) + vaTabs('tab', [['sum', '결과'], ['mult', '배수 상세'], ['chk', '검증'], ['pick', '선정 근거']], tab) + body();
  vaSave();
}
const vaCase = () => { const code = vaCode(), cs = (vaS.data?.cases || []).filter((x) => x.target.code === code); return cs.find((x) => x.id === vaS.cid) || cs[0] || null; }; // 지금 보는 회사의 평가 사례

function vaShow() { // 회사 줄을 다시 그리고 지금 탭 본문을 그 회사로 바꿈
  const co = $('#va-co'); if (co) co.innerHTML = vaCoBar();
  if (vaS.vt === 'fin') vaFin(); else if (vaS.vt === 'dcf') vaDcf(); else vaDraw();
  vaSave();
}
function vaFresh() { // 회사를 바꿀 때마다 새 칸을 넘겨 이벤트가 겹치지 않게 함(재무분석, 절대가치평가)
  const old = $('#va-host'); if (!old) return null;
  const host = old.cloneNode(false);
  host.removeAttribute('data-v3');
  old.replaceWith(host);
  host.addEventListener('click', (e) => {
    if (host.hasAttribute('data-v3')) return;
    const pk = e.target.closest('[data-va-pick]'); if (pk) { vaGo(pk.dataset.vaPick); return; }
    const rq = e.target.closest('[data-va-req]'); if (rq) { rq.disabled = true; vaRequest(rq.dataset.vaReq); }
  });
  return host;
}
function vaFin() { // 재무분석은 valuation_fin.js 가 그린다
  const host = vaFresh(), code = vaCode(); if (!host) return;
  const msg = (t) => { host.innerHTML = `<div class="card"><div class="empty">${esc(t)}</div></div>`; };
  if (!code) { host.innerHTML = vaPickList(); return; }
  if (typeof renderFin !== 'function') return msg('준비 중입니다.');
  try { Promise.resolve(renderFin(host, code)).catch((e) => msg(e.message)); } catch (e) { msg(e.message); }
}
function vaDcf() { // 절대가치평가: 고른 회사의 v3 사례(valuation_v3.js). v3 사례가 하나도 없으면 예전 DCF 화면
  const host = vaFresh(), code = vaCode(); if (!host) return;
  if (typeof renderV3 !== 'function') { host.innerHTML = typeof renderDcf === 'function' ? '' : '<div class="card"><div class="empty">준비 중입니다.</div></div>'; if (typeof renderDcf === 'function') renderDcf(host); return; }
  if (!v3Cases().length) { renderV3(host); return; }
  if (!code) { host.innerHTML = vaPickList(); return; }
  const cs = vaV3Of(code);
  if (!cs.length) { host.innerHTML = `${vaNone(code, '절대가치평가가 없는 회사입니다.')}${vaPickList()}`; return; }
  if (!cs.some((c) => c.id === v3S.cid)) v3S.cid = cs[0].id;
  renderV3(host);
}

function vaBindCo(co) { // 회사 줄: 검색해서 고르기, 평가한 회사 바로가기, 선택 해제
  co.addEventListener('input', (e) => {
    if (e.target.matches('[data-va-q]')) { vaS.q = e.target.value; const box = $('#va-sug'); if (box) box.innerHTML = vaSug(vaS.q); }
  });
  co.addEventListener('click', (e) => {
    const pk = e.target.closest('[data-va-pick]');
    if (pk) { vaGo(pk.dataset.vaPick); return; }
    if (e.target.closest('[data-va-clear]')) { vaGo(null); return; }
    const rq = e.target.closest('[data-va-req]'); if (rq) { rq.disabled = true; vaRequest(rq.dataset.vaReq); }
  });
}

function vaBind(host) {
  host.addEventListener('keydown', (e) => { const pk = e.key === 'Enter' && e.target.closest('tr[data-va-pick]'); if (pk) vaGo(pk.dataset.vaPick); });
  host.addEventListener('click', (e) => {
    const pk = e.target.closest('[data-va-pick]');
    if (pk) { vaGo(pk.dataset.vaPick); return; }
    const rq = e.target.closest('[data-va-req]');
    if (rq) { rq.disabled = true; vaRequest(rq.dataset.vaReq); return; }
    const vt = e.target.closest('[data-va-vt]');
    if (vt) { location.hash = `#valuation/${vt.dataset.vaVt}`; return; }
    const gp = e.target.closest('[data-va-grp]');
    if (gp) { vaS.gsel = { lv: vaS.lv || 'sector', name: gp.dataset.vaGrp }; vaDraw(); return; }
    if (e.target.closest('[data-va-gall]')) { vaS.gAll = !vaS.gAll; vaDraw(); return; }
    const qc = vaCase() ? null : vaCode(); // 리서치한 평가가 없는 회사면 그 종목코드(Peer를 직접 고르는 회사)
    const pa = e.target.closest('[data-va-padd]');
    if (pa && qc) { const l = (vaS.qp[qc] ||= []); if (pa.dataset.vaPadd !== qc && !l.includes(pa.dataset.vaPadd)) l.push(pa.dataset.vaPadd); vaS.pq = ''; vaDraw(); return; }
    const pr = e.target.closest('[data-va-prm]');
    if (pr && qc) { vaS.qp[qc] = (vaS.qp[qc] || []).filter((k) => k !== pr.dataset.vaPrm); vaDraw(); return; }
    if (e.target.closest('[data-va-pind]') && qc) {
      const x = vaS.mk.by[qc], l = (vaS.qp[qc] ||= []);
      vaS.mk.list.filter((y) => y.industry === x.industry && y.code !== x.code && !l.includes(y.code)).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 5).forEach((y) => l.push(y.code));
      vaDraw(); return;
    }
    const sg = e.target.closest('[data-va-seg]'), SK = { mkm: 'mkMarket', mkk: 'mkKind', qpr: 'qpr', tab: 'tab', trd: 'trd', lv: 'lv', gord: 'gord' };
    if (sg && SK[sg.dataset.vaSeg]) { vaS[SK[sg.dataset.vaSeg]] = sg.dataset.v; vaDraw(); return; }
    const tm = e.target.closest('[data-va-thm]');
    if (tm) { vaS.thm = tm.dataset.vaThm; vaDraw(); return; }
    if (e.target.closest('[data-va-thall]')) { vaS.thAll = !vaS.thAll; vaDraw(); return; }
    const fd = e.target.closest('[data-va-fold]');
    if (fd) { vaS.fold[fd.dataset.vaFold] = !fd.parentElement.open; vaSave(); return; }
    if (e.target.closest('[data-va-warn]')) { vaS.warnOpen = !e.target.closest('details').open; return; }
    const c = vaCase(); if (!c || vaS.vt !== 'rel') return;
    const s = vaSel(c);
    if (sg) { const k = sg.dataset.vaSeg, v = sg.dataset.v; if (k === 'tper') vaS.tblPer = v; else s[k] = v; vaDraw(); return; }
    if (e.target.closest('[data-va-reset]')) { delete vaS.sel[c.id]; vaS.tblPer = null; vaDraw(); return; }
    if (e.target.closest('[data-va-ex]')) { vaS.showEx = !vaS.showEx; vaDraw(); return; }
    if (e.target.closest('#va-xlsx')) { vaDownload(e.target.closest('#va-xlsx'), c); return; }
    const row = e.target.closest('[data-va-row]');
    if (row && e.target.closest('button')) { const k = row.dataset.vaRow; vaS.open[k] = !vaS.open[k]; vaDraw(); }
  });
  host.addEventListener('input', (e) => {
    if (e.target.matches('[data-va-pq]')) { vaS.pq = e.target.value; const box = $('#va-psug'); if (box) box.innerHTML = vaSug(vaS.pq, 'data-va-padd'); }
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-va-cg]')) { (vaS.cg ||= {})[t.dataset.vaCg] = t.value; vaDraw(); return; }
    const c = vaCase(); if (!c || vaS.vt !== 'rel') return;
    const s = vaSel(c);
    if (t.matches('[data-va-inc]')) { s.inc[t.dataset.vaInc] = t.checked; vaDraw(); return; }
    if (t.matches('[data-va-adj]')) { s.adj[t.dataset.vaAdj] = t.value === '' ? '' : +t.value; vaDraw(); return; }
    if (t.matches('[data-va-case]')) { const n = vaS.data.cases.find((x) => x.id === t.value); if (!n) return; vaS.cid = n.id; vaS.code = n.target.code; vaS.tblPer = null; vaShow(); }
  });
}

async function vaDownload(btn, c) {
  if (btn.disabled) return;
  btn.disabled = true;
  const rel = `data/valuation/${c.id}.xlsx`;
  try {
    const m = await STORE.meta(rel);
    if (!m) { toast('아직 올라간 엑셀이 없습니다.'); return; }
    const sh = STORE.sharedItem(rel);
    const blob = await G.get(sh ? `${sh}/content` : `${STORE.path(rel)}:/content`, { type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `[유니버스인베스트먼트] ${c.target.name} 상대가치평가_${c.day.replace(/-/g, '').slice(2)}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; }
}

const VA_VT = [['mkt', '시장동향', 'globe'], ['fin', '재무분석', 'file'], ['val', '가치평가', 'calc']];
const VA_SUB = [['sum', '요약'], ['rel', '상대가치평가'], ['dcf', '절대가치평가']]; // 가치평가 아래 하위 탭(2026-11-17 사용자 「시장동향, 재무분석, 가치평가로 하고 가치평가에서 하위 3개로」)
let vaRO = null; // 시장동향, 요약 탭 폭이 바뀌면(창 크기, 요청사항 칸) 차트를 그 폭으로 다시 그림
async function renderValuation() {
  const vt = (location.hash.match(/^#valuation\/(fin|sum|rel|dcf)\b/) || [])[1] || 'mkt';
  vaS.vt = vt;
  const top = ['sum', 'rel', 'dcf'].includes(vt) ? 'val' : vt;
  if (top === 'val') vaS.vsub = vt;
  PAGE.innerHTML = `<div class="page-head"><h1>가치평가</h1><span class="mk-upd" id="va-upd"></span>${['mkt', 'sum', 'rel'].includes(vt) ? `<div class="tools va-pc">${infoBtn('valuation')}</div>` : ''}</div>
    <div id="va-co" class="va"></div>
    <div class="deal-seg va-vt" role="tablist">${VA_VT.map(([k, t, i]) => `<button type="button" role="tab" aria-selected="${k === top}" class="${k === top ? 'on' : ''}" data-vt="${k}">${ico(i)}${t}</button>`).join('')}</div>
    ${top === 'val' ? `<div class="va-sub" role="tablist">${VA_SUB.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === vt}" class="${k === vt ? 'on' : ''}" data-vt="${k}">${t}</button>`).join('')}</div>` : ''}
    <div id="va-host" class="mk va"><div class="card"><div class="empty">불러오는 중…</div></div></div>`;
  PAGE.querySelectorAll('[data-vt]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.vt === 'val' ? vaS.vsub || 'sum' : b.dataset.vt; location.hash = k === 'mkt' ? '#valuation' : `#valuation/${k}`; })); // 가치평가는 마지막에 본 하위 탭으로
  const host = $('#va-host');
  vaBindCo($('#va-co'));
  vaRO?.disconnect();
  if (['mkt', 'sum', 'rel'].includes(vt)) vaBind(host);
  if ((vt === 'mkt' || vt === 'sum') && typeof ResizeObserver === 'function') {
    let t = 0;
    vaRO = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { if (host.isConnected && vaS.vt === vt && vaS.cw && Math.abs(host.clientWidth - vaS.cw) > 4) vaDraw(); }, 150); });
    vaRO.observe(host);
  }
  await Promise.all([vaLoad(), vaLoadMkt(), typeof v3Load === 'function' ? v3Load().catch(() => {}) : null]);
  if (!$('#va-co')?.isConnected) return; // 불러오는 사이 다른 화면으로 감
  const u = new Date((vt === 'mkt' ? vaS.mk?.generated_at : vt === 'rel' ? vaS.data?.updated_at : vt === 'sum' ? v3S?.data?.updated_at || vaS.data?.updated_at : null) || NaN);
  if (!isNaN(u)) $('#va-upd').textContent = `${u.getMonth() + 1}/${u.getDate()} ${pad(u.getHours())}:${pad(u.getMinutes())} 업데이트`;
  vaShow();
}

TAB_INFO.valuation = { title: '가치평가', rows: [
  ['이 화면', '시장동향, 재무분석, 가치평가 세 탭이고, 가치평가 안에 요약, 상대가치평가, 절대가치평가가 있습니다. 회사는 탭 위 줄에서 한 번 고르면 모든 탭이 그 회사를 봅니다. 처음에는 고른 회사가 없고, 이름 옆 ×로 선택을 풉니다.'],
  ['평가 요청', '아직 평가하지 않은 회사를 고르면 시장동향과 재무분석에서는 회사 이름 옆에, 가치평가 탭에서는 본문에 「평가 요청」 단추가 나옵니다. 누르면 오른쪽 요청사항에 「[평가 요청] 회사 이름(종목코드)」 글이 남고, 반영 완료 전까지 「평가 요청함」으로 보입니다.'],
  ['탭', ['시장동향: 회사를 고르지 않으면 시장과 업종끼리 PER 비교(전 상장사 분포, 코스피와 코스닥 중앙값 추이, 업종별 비교, 업종 안 분포). 고르면 그 회사가 어디쯤인지와 접힌 구역 둘(비교기업 위치 표, PER 회귀)', '재무분석: 고른 회사의 재무제표 분석', '가치평가 › 요약: 결합 목표주가, 풋볼필드, 상대가치평가와 절대가치평가 핵심 값. 「자세히」로 각 탭에 감', '가치평가 › 상대가치평가: 리서치한 평가가 있으면 결과, 배수 상세, 검증, 선정 근거. 없으면 Peer 비교', '가치평가 › 절대가치평가: 고른 회사의 DCF 모델', '회사를 고르지 않은 재무분석과 가치평가는 평가한 회사 목록. 줄을 누르면 그 회사로 감']],
  ['시장동향 읽는 법', ['업종별 PER 비교의 줄을 누르면 업종 안 PER 분포가 그 업종으로 바뀜. 고른 줄은 파란 바탕, 고른 회사의 업종은 이름 옆 파란 점', '회사를 고르지 않았을 때 위 숫자: 시장 중앙값, 평균, 25～75%, 코스피와 코스닥 중앙값, PER 있는 종목 수', '고른 회사가 있을 때 위 숫자: 최근 4분기 PER, 추정 PER, 시장 안에서 PER이 낮은 쪽부터 몇 %에 있는지, 시장 중앙값, 업종별 비교에서 고른 분류의 중앙값, 시가총액. 추정 이익이 적자면 「적자」', '전체, 코스피, 코스닥과 최근 4분기 PER, 추정 PER 선택은 분포 두 칸, 업종별 비교, 위 숫자에 같이 적용. PER 추이는 늘 최근 4분기 PER', 'PER 분포: 코스피, 코스닥 전 종목(우선주, 스팩 제외) 가운데 PER 0～200배 종목을 구간별로 센 막대. 구간은 0, 3, 5, 8, 10, 13, 15, 20, 25, 30, 40, 50, 75, 200배에서 끊음. 실선은 중앙값, 점선은 평균, 파란 점선은 고른 회사이고 선마다 위에 이름표. PER이 없거나 200배 이상이면 선 없이 그림 아래에 적음', '업종별 PER 비교: 분류 단계(FnGuide 대분류, 중분류, 소분류와 세부 업종)와 순서를 고름. 한 줄에 업종, PER 25～75% 구간 막대(세로선은 중앙값), 1개월 상승률, PER 중앙값, 종목 수.', '순서: 기본 순서는 늘 같은 자리(세부 업종은 IT, 2차전지와 자동차, 콘텐츠, 산업재, 에너지와 소재, 헬스케어, 소비재, 금융 머리 아래, FnGuide는 대분류 순서 안에서 종목 수 순)이고 전부 보임. 1개월 상승률은 묶음 안 종목의 21거래일 상승률 중앙값이 높은 순, 거래대금은 최근 20거래일 거래대금 합이 큰 순(셋째 칸은 전체 거래대금 가운데 비중)이고 위 10개, 나머지는 펼쳐 봄. 보고 있는 업종이 10위 밖이면 맨 아래에 붙음', '파란 바탕 줄은 업종 안 분포로 보는 업종, 파란 점은 고른 회사 PER, 고른 회사의 업종은 이름 옆 파란 점', 'FnGuide 분류는 PER 있는 종목이 5곳 이상인 업종만(고른 회사와 누른 업종은 1곳이어도)', '세부 업종: 2차전지, 반도체, 화장품처럼 FnGuide 소분류와 다르게 나눈 50여 개 묶음. 네이버 테마를 묶어 만듦(2차전지는 소재, 장비, 전고체 등을 합침). 행사, 정책, 계절, 특정 회사, 지수 테마는 뺌. 한 종목이 여러 묶음에 듦. 회사를 고르지 않으면 전체, 고르면 그 회사가 든 묶음만', '업종 안 PER 분포: 업종별 비교에서 누른 업종의 종목만 모은 분포. 누르지 않았으면 고른 회사의 업종, 회사도 없으면 종목이 가장 많은 업종. 10곳 미만이면 회사별 PER 막대, 세로선은 중앙값', 'PER 추이: 고른 회사의 최근 4분기 PER과 그 회사 시장(코스피, 코스닥) 중앙값. 회사를 고르지 않으면 코스피와 코스닥 중앙값. 선 끝에 이름과 이동평균 마지막 값(좁은 화면은 값만 적고 위에 범례). 손PB와 같이 점이 200개 넘으면 10개, 아니면 4개씩 이동평균. 시장 중앙값은 PER 2～500배, 금융 업종 제외. 평일 16:30에 쌓고, 그 전 기록은 손PB가 2016-05부터 모은 같은 네이버 PER(시장 중앙값과 리서치 사례 회사만, 2025년까지는 주 1회)', '추이 위 숫자: 고른 회사가 있으면 지금, 기간 중 PER 중앙값(이동평균 전 값), 시장 중앙값. 없으면 코스피와 코스닥 지금 중앙값', '위치 표: 리서치한 평가가 있으면 대상과 국내 비교기업, 없으면 고른 회사와 상대가치평가 탭에서 넣은 Peer. 이익 성장률은 최근 4분기 PER ÷ 추정 PER − 1, 괴리는 회귀 적정 PER ÷ 지금 PER − 1', 'PER 회귀: 이익 성장률이 같을 때 시장이 주는 PER을 보는 보조 지표. 손PB 상대가치 화면과 같은 식. log(PER) = 상수 + 성장률 계수 × 이익 성장률 + 베타 계수 × 베타 + 업종 더미. 표본은 최근 4분기 PER 2～500배, 추정 PER 0～200배, 성장률 0～500%, 베타 −1～4인 회사, 업종 5곳 미만은 기준 업종. 가로축은 200%에서 자름. 성장률이 0 이하인 회사는 직접 넣으면 단순 회귀 곡선으로 계산']],
  ['상대가치평가', '비슷한 상장사들의 배수(PER, EV/EBITDA 등) 중앙값을 대상 회사 이익에 곱해 적정 주가를 봅니다. 비교기업 선정과 해외 배수, 시나리오 근거는 리서치로 채우고, 계산은 이 화면과 엑셀이 같은 식으로 합니다.'],
  ['바꿔 볼 수 있는 것', ['배수 표의 체크를 풀거나 켜면 그 회사를 빼거나 넣고 다시 계산', '비교기업 범위: 국내만, 해외만, 국내와 해외. 「국내와 해외 따로」 표는 범위와 상관없이 셋 다 보여 줌', '기준 기간: 최근 4분기, 올해 추정, 내년 추정', 'PER 10～50배만: 증권신고서 관행대로 PER이 10배 미만이거나 50배 초과인 비교기업을 PER 통계에서 뺌', '적용 결과 표의 조정(%): 할증은 +, 할인은 −', '처음 구성으로: 리서치에서 정한 구성으로 되돌림']],
  ['배수 정의', { table: [['배수', '분자', '분모'], ['PER', '시가총액', '지배주주 순이익'], ['PBR', '시가총액', '지배주주 자본'], ['EV/EBITDA', 'EV', 'EBITDA'], ['EV/EBIT', 'EV', '영업이익'], ['EV/Sales', 'EV', '매출']] }],
  ['금액 정의', ['시가총액: 자사주를 뺀 보통주 수 × 종가 + 우선주(상장이면 우선주 종가, 비상장이면 보통주 종가로 1:1 가정)', 'EV: 시가총액 + 순부채 + 비지배지분', '순부채: 이자발생부채(전환사채, 리스 포함) − 현금, 단기금융상품, 단기 당기손익공정가치 금융자산', '배수와 이익은 같은 기간끼리 곱함. 대표값은 중앙값, 범위는 25%～75%', 'EV 배수로 구한 주주가치 = 배수 × 지표 − 순부채 − 비지배지분 + 비영업자산']],
  ['상대가치평가 읽는 법', ['안쪽 탭: 결과(풋볼필드와 목표주가, 배수별 평가표, 비교기업 선정), 배수 상세(국내와 해외 따로, 배수별 범위, 회사별 배수, 적용 결과), 검증(한 회사씩 빼기, 시나리오), 선정 근거(단계별 기준과 회사별 이유)', '풋볼필드: 52주 고저, 증권사 목표가 최저～최고, 배수별 Bear～Bull(시나리오가 없으면 25～75%). 회색 점선은 현재가, 빨간 점선은 목표주가이고 이름표는 그림 맨 위 줄', '목표주가: 평가 배수 하나로 계산(100원 단위 반올림). 기본은 PER, 금융업은 PBR, 순이익 적자면 EV/EBITDA, EBITDA도 적자면 EV/Sales(국내 IPO 증권신고서와 셀사이드 관행). 리서치에서 바꿀 수 있고, 다른 배수는 풋볼필드 「참고」 줄과 교차 확인 표로만 봄', '배수별 평가표: 막대 세로선이 Target 배수(비교기업 중앙값), 표는 지표 × Target 배수 = 주당 가치', '범위 막대(배수 상세): 비교기업 배수 25～75% 구간을 대상 회사에 적용한 주당 가치, 가운데 선은 중앙값', '배수 표 체크: 풀면 그 회사가 통계에서 빠지고 결론이 바로 다시 계산됨. 취소선 PER은 10～50배 밖이라 통계에서 뺀 값', '조정(%): 성장률이나 이익률 차이처럼 근거가 있을 때만 넣고 판단 메모에 이유를 남김', '비교기업이 3곳 미만이면 배수 평가 칸 아래에 다른 범위(국내, 해외, 국내와 해외)와 대상 회사 업종(FnGuide 소분류, 같은 PER 범위 조건) 중앙값을 참고로 보여 줌. 「국내와 해외 따로」 표에서는 주황', '한 회사씩 빼기: 한 곳만 빼도 주당 가치가 15% 넘게 움직이면 주황 표시', '시나리오: 배수는 그대로 두고 대상 회사 이익만 바꿔 적용. 근거는 시나리오 이름에 마우스를 올리면 보임', 'NM: 분모가 0 이하(적자 등)라 계산하지 않음', '주황 칸: 중앙값의 2배를 넘거나 절반에 못 미치는 배수', '확인할 것: 지금 구성에서 비교기업 수 부족, 평균과 중앙값 차이, 한 회사에 기대는 결과, 데이터 지연 등']],
  ['Peer 비교', ['리서치한 평가가 없는 회사를 상대가치평가 탭에서 열면 나옴. Peer는 검색해 넣거나 같은 업종(소분류) 시가총액 상위 5곳을 한 번에 넣음', '세로선은 Peer 최근 4분기 PER 중앙값, 흐린 막대는 10～50배 밖이라 중앙값에서 뺀 회사', '넣은 Peer는 시장동향 탭의 위치 표와 PER 회귀 그림에도 같이 나옴']],
  ['출처', ['시장 데이터: 네이버 금융 PER(최근 4분기, 추정), FnGuide 업종 분류, 네이버 테마. 평일 장 마감 뒤 갱신', '국내 비교기업: 네이버 기업정보(와이즈리포트) 실적과 컨센서스, KIND 상장법인 목록. 실적 발표 직후 며칠은 반영이 늦어 대상 회사는 분기보고서와 증권사 리포트로 고쳐 넣음', '해외 비교기업: 리서치로 모은 배수(회사별 출처와 기준일은 비교기업 선정 칸)', '계산 원본과 사례 폴더: 05. 딜소싱 > _자동화 > 가치평가']],
] };
