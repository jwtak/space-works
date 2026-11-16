/* 투자업무 › 가치평가 › 상대가치평가.
   데이터: OneDrive data/valuation.json — 05. 딜소싱\_자동화\가치평가 에서 relval.py run(사례 계산) 뒤 publish.py 로 올린다.
   사례마다 회사별 배수와 대상 회사 지표가 들어 있고, 비교기업 켜고 끄기, 국내만·해외만·합친 범위, 기준 기간, 할증·할인은 이 화면이 다시 계산한다.
   계산식은 relval.py 와 같다(사례의 py 값과 맞춰 봄). 원본 로직은 05. 딜소싱\가치평가 로직 노트.md 18장.
   엑셀: data/valuation/<사례 id>.xlsx. 손PB 상대가치 화면(PERValuationScreen.jsx)의 범위 막대(IQR)를 결론 막대그림에 가져왔다.
   app.js 전역($, esc, pad, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn, PAGE, route), graph.js STORE·G, market.css 표·탭 클래스를 쓴다. */
const VA_FILE = 'data/valuation.json';
const VA_TTL = 600000;
const VA_PER = { LTM: '최근 4분기', FY0: '직전 결산', FY1: '올해 추정', FY2: '내년 추정', FY3: '후년 추정' };
const VA_MULT = { PER: ['equity', 'ni'], PBR: ['equity', 'equity'], PSR: ['equity', 'revenue'], 'EV/EBITDA': ['ev', 'ebitda'], 'EV/EBIT': ['ev', 'op'], 'EV/Sales': ['ev', 'revenue'] };
const VA_MET = { ni: '순이익', equity: '자본', revenue: '매출', ebitda: 'EBITDA', op: '영업이익' };
const vaS = { data: null, at: 0, loading: null, err: '', cid: null, sel: {}, tblPer: null, showEx: false, open: {}, view: null, qp: {} };
Object.assign(vaS, viewGet('va', {}));
const vaSave = () => viewSet('va', { cid: vaS.cid, sel: vaS.sel, tblPer: vaS.tblPer, view: vaS.view, qp: vaS.qp, tab: vaS.tab, qtab: vaS.qtab, trd: vaS.trd });
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
    if (typeof tv === 'number' && st.min != null && (tv < st.min || tv > st.max)) w.push(`${L} ${nm}: 대상 회사 배수 ${vaNum(tv, 1)}배가 비교기업 범위(${vaNum(st.min, 1)}~${vaNum(st.max, 1)}배) 밖`);
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
    ['52주 범위', `${vaNum(t.low52)} ~ ${vaNum(t.high52)}원`], ['증권사 목표가 평균', vaWon(t.target_mean)]];
  const hasGlobal = c.peers.some((p) => p.kind !== '국내');
  return `<section class="card va-head"><div class="va-ttl"><div><h2>${esc(t.name)} <small>${esc(t.code)}</small></h2>
      <p>기준일 ${esc(c.day)}${c.purpose ? `, ${esc(c.purpose)} 평가` : ''}${t.wics ? `, WICS ${esc(t.wics)}` : ''}</p></div>
      <div class="va-tools">${pick}${infoBtn('valuation')}<button class="btn ghost" type="button" id="va-xlsx">${ico('file', 'sm')}엑셀 받기</button></div></div>
    <dl class="va-kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="va-ctrl">${hasGlobal ? `<div><span>비교기업 범위</span>${vaSeg('scope', [['국내', '국내만'], ['해외', '해외만'], ['전체', '국내와 해외']], s.scope)}</div>` : ''}
      <div><span>기준 기간</span>${vaSeg('base', c.periods.map((p) => [p, VA_PER[p] || p]), s.base)}</div>
      ${c.per_range ? `<div><span>PER ${vaNum(c.per_range.min)}~${vaNum(c.per_range.max)}배만</span>${vaSeg('pr', [['on', '켬'], ['off', '끔']], s.pr)}</div>` : ''}
      <button class="btn ghost sm" type="button" data-va-reset>처음 구성으로</button></div></section>`;
}

function vaField(c, r) { // 결론 막대: 배수별 25~75% 범위와 중앙값, 현재가 세로선
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
      <div class="va-ff-b"><i class="bar" style="left:${X(Math.min(lo, hi))};width:calc(${X(Math.max(lo, hi))} - ${X(Math.min(lo, hi))})" title="25% ${vaWon(lo)} ~ 75% ${vaWon(hi)}"></i><i class="med" style="left:${X(x.v.med.ps)}"></i><i class="now" style="left:${now}"></i></div>
      <div class="va-ff-v"><b>${vaWon(x.v.med.ps)}</b>${vaUp(x.v.med.up)}</div></div>`;
  }).join('')}<div class="va-ff-r leg"><div class="va-ff-l"></div><div class="va-ff-b"><span class="now-l" style="left:${now}">현재가 ${vaWon(c.target.close)}</span></div><div class="va-ff-v"></div></div></div>`;
}

function vaRange(c, r) { // 배수 탭 머리: 국내와 해외 따로, 배수별 25~75% 범위 막대
  return vaSec('배수별 주당 가치', `<span class="meta">${esc(VA_PER[r.s.base])}</span>`, `${vaSplit(c, r)}${vaField(c, r)}`);
}

function vaSplit(c, r) { // 국내와 해외를 따로 계산한 값(기준 기간, 대표 배수). 위 범위 선택과 상관없이 늘 셋 다 보여 줌
  if (!c.peers.some((p) => p.kind !== '국내')) return '';
  const s = r.s, L = { 국내: '국내', 해외: '해외', 전체: '국내와 해외' };
  const rows = ['국내', '해외', '전체'].map((sc) => {
    const n = vaUse(c, s, null, sc).length;
    return `<tr class="${sc === s.scope ? 'on' : ''}"><td class="st"><b>${L[sc]}</b><small>${n}곳 넣음</small></td>${c.primary.map((nm) => {
      const st = vaCol(c, s, s.base, nm, null, sc), v = vaImplied(c, s.base, nm, st.median, vaAdj(c, s, nm));
      return `<td class="${st.n < 3 ? 'va-few' : ''}">${vaX(st.median)} <small>${st.n}곳</small></td><td>${v ? `<b>${vaWon(v.ps)}</b><small>${vaUp(v.up)}</small>` : '-'}</td>`;
    }).join('')}</tr>`;
  }).join('');
  return `<h3 class="va-h3">국내와 해외 따로</h3><div class="mk-scroll"><table class="mk-tbl va-split"><thead><tr><th class="st">범위</th>${c.primary.map((nm) => `<th>${esc(nm)} 중앙값</th><th>주당 가치</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function vaWarnCard(c, r) {
  const dyn = vaWarns(c, r), dat = c.data_warnings || [];
  if (!dyn.length && !dat.length) return '';
  const li = (a) => a.map((w) => `<li>${esc(w)}</li>`).join('');
  return `<details class="va-det" ${vaS.warnOpen ? 'open' : ''}><summary data-va-warn>확인할 것 <span class="n">${dyn.length + dat.length}</span></summary>${dyn.length ? `<h3 class="va-h3">지금 구성 기준</h3><ul class="va-warn">${li(dyn)}</ul>` : ''}${dat.length ? `<h3 class="va-h3">데이터</h3><ul class="va-warn">${li(dat)}</ul>` : ''}</details>`;
}

function vaMultTable(c, r) {
  const s = r.s, per = c.periods.includes(vaS.tblPer) ? vaS.tblPer : s.base, st = r.st[per];
  const cell = (p, nm) => {
    const v = p.mult[per]?.[nm];
    if (v === '제외') return `<td class="va-ex" title="${esc(p.exclude_reason || '사람이 뺀 배수')}">제외</td>`;
    if (vaCut(c, s, nm, v)) return `<td class="va-cut" title="${vaNum(c.per_range.min)}~${vaNum(c.per_range.max)}배 밖이라 통계에서 뺌">${vaX(v)}</td>`;
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
    ${srow('계산된 회사', (x) => `${x.n}곳${x.nm ? ` (NM ${x.nm})` : ''}${x.cut?.length ? ` (범위 밖 ${x.cut.length})` : ''}`)}</tbody></table></div>`;
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
    <p class="va-note">순부채 ${vaNum(t.net_debt)}억, 비지배지분 ${vaNum(t.nci)}억, 비영업자산 ${vaNum(c.non_op?.amount || 0)}억(${esc(t.bs_date || '')} 기준)${c.non_op?.reason ? `. ${esc(c.non_op.reason)}` : ''}</p>
    ${t.override_note ? `<p class="va-note">손으로 바꾼 값: ${esc(t.override_note)}</p>` : ''}`);
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
  const fun = (c.funnel || []).map((f) => `<tr><td class="st"><b>${esc(f.stage)}</b></td><td class="wrap">${esc(f.criteria || '')}</td><td>${f.count ?? ''}</td><td class="wrap">${esc(f.note || '')}</td></tr>`).join('');
  const sim = (o) => (o ? `<dl class="va-sim">${Object.entries(o).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '');
  const peers = c.peers.map((p) => { const k = vaKey(p), op = vaS.open[k];
    return `<tr class="va-pr" data-va-row="${esc(k)}"><td class="st"><b>${esc(p.name)}</b><small>${esc(p.kind === '국내' ? '국내' : p.country || '해외')}${p.include ? '' : ', 처음엔 뺌'}</small></td><td class="wrap">${esc(p.reason || '')}${p.exclude_multiples?.length ? `<small>뺀 배수 ${esc(p.exclude_multiples.join(', '))}: ${esc(p.exclude_reason || '')}</small>` : ''}${p.source ? `<small>출처 ${esc(p.source)}${p.as_of ? `, ${esc(p.as_of)}` : ''}</small>` : ''}${op ? sim(p.similarity) : ''}</td>
      <td>${p.similarity ? `<button class="btn ghost sm" type="button">${op ? '접기' : '유사성'}</button>` : ''}</td></tr>`; }).join('');
  const ex = c.excluded || [];
  const exHtml = ex.length ? `<button class="btn ghost sm va-exbtn" type="button" data-va-ex>${vaS.showEx ? '뺀 후보 접기' : `뺀 후보 ${ex.length}곳 보기`}</button>
    ${vaS.showEx ? `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">회사</th><th>단계</th><th>이유</th></tr></thead><tbody>${ex.map((e) => `<tr><td class="st"><b>${esc(e.name)}</b></td><td>${esc(e.stage || '')}</td><td class="wrap">${esc(e.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}` : '';
  return vaSec('비교기업 선정', '', `${c.target_profile ? `<p class="va-prof">${esc(c.target_profile)}</p>` : ''}
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
function vaScenRange(c, r, nm) { // 배수별 Bear~Bull. 시나리오가 없으면 비교기업 25~75%
  const s = r.s, st = r.st[s.base][nm], a = vaAdj(c, s, nm), sc = c.scenarios || {};
  const pick = (k) => sc[k]?.[s.base] && vaImplied(c, s.base, nm, st.median, a, sc[k][s.base])?.ps;
  const lo = pick('Bear'), hi = pick('Bull');
  if (lo && hi) return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), lab: 'Bear~Bull' };
  const v = r.val[s.base][nm];
  return v.lo && v.hi ? { lo: Math.min(v.lo.ps, v.hi.ps), hi: Math.max(v.lo.ps, v.hi.ps), lab: '25~75%' } : null;
}

function vaSummary(c, r) {
  const s = r.s, t = c.target, tp = vaTarget(c, r), bt = t.broker_targets || [];
  const rows = [['시장', '52주 고저', t.low52 && t.high52 ? { lo: t.low52, hi: t.high52 } : null]];
  if (bt.length) rows.push(['시장', `증권사 목표가 ${bt.length}곳`, { lo: Math.min(...bt.map((x) => x.goal)), hi: Math.max(...bt.map((x) => x.goal)) }]);
  const W_ = vaW(c), multi = Object.values(W_).filter((x) => x > 0).length > 1;
  for (const nm of c.primary) { const g = vaScenRange(c, r, nm), w = W_[nm] || 0; rows.push([w > 0 ? '평가' : '참고', `${nm} ${g?.lab || ''}`, g, multi ? tp?.parts.find((p) => p.nm === nm)?.w : null]); }
  const vals = rows.flatMap(([, , g]) => (g ? [g.lo, g.hi] : [])).concat(t.close, tp?.ps || t.close);
  const x0 = Math.min(...vals) * 0.84, x1 = Math.max(...vals) * 1.12, X = (v) => `${(((v - x0) / (x1 - x0)) * 100).toFixed(2)}%`;
  rows.sort((a, b) => ['시장', '평가', '참고'].indexOf(a[0]) - ['시장', '평가', '참고'].indexOf(b[0]));
  const ff = rows.map(([grp, lab, g, w], i) => `<div class="va-fb-r ${grp === '시장' ? 'mk' : grp === '참고' ? 'ref' : ''}"><div class="va-fb-l">${i === 0 || rows[i - 1][0] !== grp ? `<em>${grp}</em>` : '<em></em>'}<b>${esc(lab)}${w ? ` <small>${vaNum(w * 100)}%</small>` : ''}</b></div>
    <div class="va-fb-b">${g ? `<span class="lo" style="left:${X(g.lo)}">${vaNum(g.lo)}</span><i style="left:${X(g.lo)};width:calc(${X(g.hi)} - ${X(g.lo)})"></i><span class="hi" style="left:${X(g.hi)}">${vaNum(g.hi)}</span>` : ''}<u class="now" style="left:${X(t.close)}"></u>${tp ? `<u class="tp" style="left:${X(tp.ps)}"></u>` : ''}</div></div>`).join('');
  const leg = `<div class="va-fb-leg"><span class="now">현재가 ${vaWon(t.close)}</span>${tp ? `<span class="tp">목표주가 ${vaWon(Math.round(tp.ps / 100) * 100)}</span>` : ''}</div>`;
  const m = t.metrics[s.base] || {}, divSh = t.shares + (t.pref_shares && !t.pref_listed ? t.pref_shares : 0);
  const lead = c.primary.filter((nm) => (W_[nm] || 0) > 0), item = VA_MULT[lead[0]]?.[1];
  const asm = [[`${VA_PER[s.base]} ${VA_MET[item] || '순이익'}`, `${vaNum(m[item || 'ni'])}억`], ...(item === 'ni' ? [['EPS', vaWon(m.ni ? (m.ni * 1e8) / divSh : null)]] : []), ...lead.map((nm) => [`Target ${nm}`, `${vaX(r.st[s.base][nm].median)} <small>${r.st[s.base][nm].n}곳 중앙값</small>`])];
  const box = `<div class="va-tpbox" ${c.method_reason ? `title="평가 배수 ${esc(c.method || '')}: ${esc(c.method_reason)}"` : ''}>${tp ? `<div><span>목표주가</span><b>${vaWon(Math.round(tp.ps / 100) * 100)}</b></div><div><span>상승여력</span><b>${vaUp(tp.up)}</b></div><p>${tp.parts.length > 1 ? tp.parts.map((p) => `${esc(p.nm)} ${vaNum(p.w * 100)}%`).join(', ') : `${esc(tp.parts[0].nm)} 기준, ${esc(VA_PER[s.base])}`}</p>` : '<p>계산된 배수가 없습니다.</p>'}</div>
    <dl class="va-asm">${asm.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const memo = c.conclusion ? `<div class="va-memo"><b>판단 메모</b><p>${esc(c.conclusion)}</p></div>` : '';
  return vaSec('가치평가 요약', '', `<div class="va-sumtop">${box}</div><div class="va-fb">${ff}</div>${leg}${memo}${vaWarnCard(c, r)}`)
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
function vaMultCard(c, r, nm, ref) { // IM 106쪽: 비교기업 배수 막대 + Target 선, 지표 × 배수 = 주당 가치
  const s = r.s, t = c.target, st = r.st[s.base][nm], v = r.val[s.base][nm].med, a = vaAdj(c, s, nm), [kind, item] = VA_MULT[nm];
  const peers = vaUse(c, s).map((p) => ({ p, v: p.mult[s.base]?.[nm] })).filter((x) => typeof x.v === 'number').sort((x, y) => y.v - x.v);
  const tv = t.mult[s.base]?.[nm];
  const mx = Math.max(st.median || 0, typeof tv === 'number' ? tv : 0, ...peers.map((x) => Math.min(x.v, (st.median || x.v) * 4))) * 1.08;
  const W = (v_) => `${Math.min(100, (v_ / mx) * 100).toFixed(1)}%`;
  const bar = (name, val, cls, sub) => `<div class="va-pb ${cls}"><span>${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><div><i style="width:${typeof val === 'number' && val > 0 ? W(val) : 0}"></i>${st.median ? `<b style="left:${W(st.median)}"></b>` : ''}</div><em>${vaX(val)}</em></div>`;
  const bars = bar(t.name, tv, 'me', '대상') + peers.map((x) => bar(x.p.name, x.v, vaCut(c, s, nm, x.v) ? 'cut' : '', x.p.kind === '국내' ? '' : x.p.country || '해외')).join('');
  const m = t.metrics[s.base] || {}, den = m[item], divSh = t.shares + (t.pref_shares && !t.pref_listed ? t.pref_shares : 0);
  const L = (k, val, cls = '') => `<tr class="${cls}"><th>${k}</th><td>${val}</td></tr>`;
  const per = VA_PER[s.base];
  const tbl = kind === 'equity'
    ? L(`${per} 매출`, `${vaNum(m.revenue)}억`) + L(`${per} 순이익`, `${vaNum(m.ni)}억`) + L('주식수', `${vaNum(divSh)}주`) + L(`${per} EPS`, vaWon(den ? (den * 1e8) / divSh : null))
    : L(`${per} ${VA_MET[item]}`, `${vaNum(den)}억${m.ebitda_est && item === 'ebitda' ? ' <small>추정</small>' : ''}`) + L('주주가치', v ? `${vaNum(v.eq)}억` : '-') + L('순현금', `${vaNum(-(t.net_debt || 0))}억`) + L('비지배지분, 비영업자산', `${vaNum(-(t.nci || 0))}억, ${vaNum(+(c.non_op?.amount) || 0)}억`) + L('주식수', `${vaNum(divSh)}주`);
  const res = L(`Target ${nm}`, `${vaX(v?.mult ?? st.median)}${a ? ` <small>${a > 0 ? '+' : ''}${vaNum(a * 100, 1)}% 조정</small>` : ''}`, 'k') + L('주당 가치', v ? vaWon(Math.round(v.ps / 100) * 100) : '-', 'k big') + L(`현재가 (${esc(c.day)})`, vaWon(t.close)) + L('상승여력', v ? vaUp(v.up) : '-', 'k');
  return vaSec(ref ? `${nm} 교차 확인` : `${nm} 평가`, `<span class="meta">${esc(per)}, 비교기업 ${st.n}곳 중앙값</span>`, `<div class="va-mcg"><div class="va-pbs">${bars}</div>
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
const VA_BUCKETS = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 40], [40, 50], [50, 75], [75, 200]];
function vaLoadMkt() {
  if (vaS.mkAt && Date.now() - vaS.mkAt < VA_TTL) return Promise.resolve();
  vaS.mkLoading ||= STORE.readText(VA_MKT_FILE)
    .then((r) => {
      const d = r.text ? JSON.parse(r.text) : null;
      if (d) {
        const ix = Object.fromEntries(d.cols.map((k, i) => [k, i]));
        d.list = d.rows.map((x) => Object.fromEntries(Object.entries(ix).map(([k, i]) => [k, x[i]])));
        d.by = Object.fromEntries(d.list.map((x) => [x.code, x]));
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

// 맨 위 회사 검색: 리서치한 사례가 있으면 그 사례, 없으면 시장 데이터로 빠르게 보기(손PB 상대가치 화면과 같은 흐름)
function vaFinder() {
  const back = vaS.view && (vaS.data?.cases || []).length ? `<button class="btn ghost sm" type="button" data-va-back>리서치한 평가 보기</button>` : '';
  return `<section class="card va-find"><div class="va-srch va-srch-l"><input type="search" data-va-q value="${esc(vaS.q || '')}" placeholder="회사 이름이나 종목코드로 찾기" aria-label="회사 검색" autocomplete="off"><div class="va-sug" id="va-sug">${vaS.q ? vaSug(vaS.q) : ''}</div></div>${back}</section>`;
}
function vaSug(qs, attr = 'data-va-pick') {
  const t = qs.trim().toLowerCase(); if (!t) return '';
  const list = vaS.mk?.list || (vaS.data?.cases || []).map((c) => ({ code: c.target.code, name: c.target.name, market: '' }));
  const hits = list.filter((x) => x.code.startsWith(t) || x.name.toLowerCase().includes(t)).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 8);
  return hits.length ? hits.map((x) => `<button type="button" ${attr}="${esc(x.code)}"><b>${esc(x.name)}</b><small>${esc(x.code)} ${esc(x.market || '')}${x.per ? `, PER ${vaNum(x.per, 1)}배` : ''}${attr === 'data-va-pick' && vaCaseOf(x.code) ? ', 리서치한 평가 있음' : ''}</small></button>`).join('') : '<div class="empty">맞는 회사가 없습니다.</div>';
}

function vaQuick(code) {
  const d = vaS.mk, x = d?.by[code];
  if (!x) return '<div class="card"><div class="empty">시장 데이터에 없는 회사입니다.</div></div>';
  const F = vaFocusQuick(code), pc = vaPctl(x.per, 'per'), all = vaMkUse().map((y) => y.per).filter((p) => p > 0 && p < 200);
  const ind = d.list.filter((y) => y.industry && y.industry === x.industry && y.per > 0 && y.per < 200).map((y) => y.per);
  const kv = [['최근 4분기 PER', vaX(x.per)], ['추정 PER', vaX(x.estPer)], ['시장 내 위치', pc == null ? '-' : `하위 ${vaNum(pc * 100)}%`], ['시장 중앙값', vaX(vaQuant(all, 0.5))], [`업종 중앙값${x.industry ? ` (${x.industry})` : ''}`, ind.length ? `${vaX(vaQuant(ind, 0.5))} <small>${ind.length}곳</small>` : '-'], ['시가총액', x.mcap ? `${vaNum(x.mcap)}억` : '-']];
  const head = `<section class="card va-head"><div class="va-ttl"><div><h2>${esc(x.name)} <small>${esc(x.code)}</small></h2>
      <p>${esc(x.market)}${x.sector ? `, ${esc(x.sector)}` : ''}${x.industry ? ` › ${esc(x.industry)}` : ''}${d.date ? `, ${esc(d.date)} 기준` : ''}</p></div>
      <div class="va-tools">${infoBtn('valuation')}</div></div>
    <dl class="va-kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`;
  const tab = vaS.qtab || 'peer';
  const body = { peer: () => vaPeerQ(F, x), trend: () => vaTrend(F), sec: () => vaSector(F), mkt: () => vaMarket(F), reg: () => vaReg(F) }[tab] || (() => vaPeerQ(F, x));
  return head + vaTabs('qtab', [['peer', 'Peer 비교'], ['trend', 'PER 추이'], ['sec', '업종'], ['mkt', '시장 분포'], ['reg', '회귀']], tab) + body();
}

// Peer 비교(빠른 보기): Peer를 검색해 넣고 중앙값 PER과 비교
function vaPeerQ(F, x) {
  const d = vaS.mk, peers = F.peers.map((k) => d.by[k]), on = (vaS.qpr || 'on') === 'on';
  const inR = (v) => typeof v === 'number' && v > 0 && (!on || (v >= 10 && v <= 50));
  const st = (key) => { const v = peers.map((p) => p[key]).filter(inR); return v.length ? { med: vaQuant(v, 0.5), n: v.length } : null; };
  const sT = st('per'), sE = st('estPer');
  const mx = Math.max(10, ...[x, ...peers].map((p) => (p.per > 0 && p.per < 200 ? p.per : 0))) * 1.08;
  const bar = (p, me) => `<div class="va-pb ${me ? 'me' : ''} ${!me && !inR(p.per) ? 'cut' : ''}"><span>${esc(p.name)}</span><div><i style="width:${p.per > 0 ? Math.min(100, (p.per / mx) * 100).toFixed(1) : 0}%"></i>${sT ? `<b style="left:${Math.min(100, (sT.med / mx) * 100).toFixed(1)}%"></b>` : ''}</div><em>${vaX(p.per)}</em>${me ? '' : `<button type="button" class="va-x" data-va-prm="${esc(p.code)}" aria-label="${esc(p.name)} 빼기">×</button>`}</div>`;
  const res = sT || sE ? `<div class="va-tiles">${[['최근 4분기', sT, x.per], ['추정', sE, x.estPer]].filter(([, s]) => s).map(([lab, s, v]) => `<div class="va-tile"><span>Peer ${lab} PER 중앙값 ${vaX(s.med)}, ${s.n}곳</span><strong>${v > 0 ? vaUp(s.med / v - 1) : '-'}</strong><p>지금 ${vaX(v)}</p></div>`).join('')}</div>` : '';
  const same = d.list.filter((y) => y.industry && y.industry === x.industry && y.code !== x.code && !F.peers.includes(y.code)).length;
  const body = `<div class="va-mctl"><div class="va-srch"><input type="search" data-va-pq value="${esc(vaS.pq || '')}" placeholder="Peer 추가" aria-label="Peer 검색" autocomplete="off"><div class="va-sug" id="va-psug">${vaS.pq ? vaSug(vaS.pq, 'data-va-padd') : ''}</div></div>
      ${same ? `<button class="btn ghost sm" type="button" data-va-pind>같은 업종 시가총액 상위 5곳 넣기</button>` : ''}<div><span class="va-lab">PER 10~50배만</span>${vaSeg('qpr', [['on', '켬'], ['off', '끔']], on ? 'on' : 'off')}</div></div>
    ${peers.length ? `${res}<div class="va-pbs">${bar(x, true)}${peers.map((p) => bar(p, false)).join('')}</div>` : '<div class="empty">Peer를 넣어 주세요.</div>'}`;
  return vaSec('Peer 비교', '', body);
}

// 업종별 PER: FnGuide 대분류마다 중앙값과 25~75% 구간(손PB SectorBarChart)
function vaSector(F) {
  const d = vaS.mk, x = d.by[F.code], g = {};
  for (const y of vaMkUse()) if (y.sector && y.per > 0 && y.per < 200) (g[y.sector] ||= []).push(y.per);
  const rows = Object.entries(g).filter(([, v]) => v.length >= 5).map(([k, v]) => ({ k, n: v.length, med: vaQuant(v, 0.5), lo: vaQuant(v, 0.25), hi: vaQuant(v, 0.75) })).sort((a, b) => b.med - a.med);
  if (!rows.length) return '';
  const mx = Math.max(...rows.map((r) => r.hi)) * 1.05, P = (v) => `${Math.min(100, (v / mx) * 100).toFixed(1)}%`;
  const ind = x?.industry ? d.list.filter((y) => y.industry === x.industry && y.per > 0 && y.per < 200).map((y) => y.per) : [];
  const body = `<div class="va-sbs">${rows.map((r) => `<div class="va-sb ${x?.sector === r.k ? 'me' : ''}" title="${esc(r.k)} 중앙값 ${vaNum(r.med, 1)}배, 25~75% ${vaNum(r.lo, 1)}~${vaNum(r.hi, 1)}배, ${r.n}곳"><span>${esc(r.k)}</span><div><i style="left:${P(r.lo)};width:calc(${P(r.hi)} - ${P(r.lo)})"></i><b style="left:${P(r.med)}"></b>${x?.sector === r.k && x.per > 0 && x.per < mx ? `<u style="left:${P(x.per)}"></u>` : ''}</div><em>${vaX(r.med)}</em></div>`).join('')}</div>
    ${ind.length ? `<p class="va-note">${esc(x.industry)} 중앙값 ${vaX(vaQuant(ind, 0.5))}, 25~75% ${vaNum(vaQuant(ind, 0.25), 1)}~${vaNum(vaQuant(ind, 0.75), 1)}배, ${ind.length}곳</p>` : ''}`;
  return vaSec('업종별 PER', '', body);
}

function vaMarket(F) {
  const d = vaS.mk; if (!d) return '';
  const key = vaS.mkKind || 'per', vals = vaMkUse().map((x) => x[key]).filter((p) => p > 0 && p < 200).sort((a, b) => a - b);
  if (!vals.length) return '';
  const q = (p) => vaQuant(vals, p), tg = d.by[F.code];
  const cnt = VA_BUCKETS.map(([a, b]) => vals.filter((v) => v >= a && v < b).length), mx = Math.max(...cnt);
  const bars = cnt.map((n, i) => {
    const lab = `${VA_BUCKETS[i][0]}~${i === VA_BUCKETS.length - 1 ? '' : VA_BUCKETS[i][1]}배`, hit = tg && tg[key] >= VA_BUCKETS[i][0] && tg[key] < VA_BUCKETS[i][1];
    return `<div class="va-hb ${hit ? 'tg' : ''}" title="${lab} ${vaNum(n)}곳 (${vaNum((n / vals.length) * 100, 1)}%)"><span>${vaNum(n)}</span><i style="height:${((n / mx) * 100).toFixed(1)}%"></i><small>${lab}</small></div>`;
  }).join('');
  const kv = [['종목 수', `${vaNum(vals.length)}곳`], ['중앙값', vaX(q(0.5))], ['25~75%', `${vaNum(q(0.25), 1)} ~ ${vaNum(q(0.75), 1)}배`], ['평균', vaX(vals.reduce((a, b) => a + b, 0) / vals.length)]];
  const row = (code, role) => {
    const x = d.by[code]; if (!x) return '';
    const f = vaFit(x), pc = vaPctl(x[key], key);
    return `<tr class="${role === F.role ? 'va-tgt' : ''}"><td class="st"><b>${esc(x.name)}</b><small>${role}${x.industry ? `, ${esc(x.industry)}` : ''}</small></td><td>${vaX(x.per)}</td><td>${vaX(x.estPer)}</td><td>${pc == null ? '-' : `하위 ${vaNum(pc * 100)}%`}</td><td>${f ? `${vaNum(f.growth * 100)}%` : '-'}</td><td>${f?.per ? `${vaX(f.per)}${f.simple ? '<small>단순 회귀</small>' : ''}` : '-'}</td><td>${f?.per && x.per ? vaUp(f.per / x.per - 1) : '-'}</td></tr>`;
  };
  const body = `<div class="va-mctl">${vaSeg('mkm', [['ALL', '전체'], ['KOSPI', '코스피'], ['KOSDAQ', '코스닥']], vaS.mkMarket || 'ALL')}${vaSeg('mkk', [['per', '최근 4분기 PER'], ['estPer', '추정 PER']], key)}</div>
    <dl class="va-kv va-mkv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="va-hist" role="img" aria-label="PER 구간별 종목 수">${bars}</div>
    <div class="va-leg"><span class="tg">${esc(F.name)}${tg ? ` ${vaX(tg[key])}` : ''}</span></div>
    <h3 class="va-h3">${F.role === '대상' ? '대상과 비교기업' : '선택한 회사와 Peer'} 위치</h3><div class="mk-scroll"><table class="mk-tbl va-pos"><thead><tr><th class="st">회사</th><th>최근 4분기 PER</th><th>추정 PER</th><th>시장 내 위치</th><th>이익 성장률</th><th>회귀 적정 PER</th><th>괴리</th></tr></thead><tbody>${row(F.code, F.role)}${F.peers.map((k) => row(k, F.peerRole)).join('')}</tbody></table></div>`;
  return vaSec('전 상장사 PER 분포', '', body);
}

function vaReg(F) {
  const d = vaS.mk, g = d?.regression; if (!g?.simple) return '';
  const pts = d.list.filter((x) => g.fitted?.[x.code]).map((x) => ({ x, g: g.fitted[x.code][0], p: x.per }));
  if (!pts.length) return '';
  const W = 640, H = 300, P = { l: 40, r: 24, t: 10, b: 30 }, gx = Math.min(2, Math.max(...pts.map((o) => o.g))), ylo = Math.log(2), yhi = Math.log(200);
  const X = (v) => P.l + (Math.min(v, gx) / gx) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - (Math.log(Math.min(Math.max(v, 2), 200)) - ylo) / (yhi - ylo)) * (H - P.t - P.b);
  const grid = [2, 5, 10, 20, 50, 100, 200].map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${P.l - 6}" y="${Y(v) + 4}" class="yl">${v}</text>`).join('');
  const xt = [0, 0.5, 1, 1.5, 2].filter((v) => v <= gx + 1e-9).map((v) => `<text x="${X(v)}" y="${H - 10}" class="xl">${v * 100}%</text>`).join('');
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
    <div class="va-leg"><span class="tg">${esc(F.name)}</span>${F.peers.length ? `<span class="pe">${F.peerRole === 'Peer' ? 'Peer' : '국내 비교기업'}</span>` : ''}<span class="cv">단순 회귀 곡선</span></div>
    <div class="va-scw">${svg}</div>${tline}`;
  return vaSec('PER 회귀', '', body);
}

// ---------- 그리기 ----------
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
  const x = vaS.mk?.by[F.code], mkt = x?.market === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI', yrs = vaS.trd || '5';
  const cut = yrs === 'all' ? '' : (() => { const d = new Date(); d.setFullYear(d.getFullYear() - +yrs); return d.toISOString().slice(0, 10); })();
  const ds = h.dates, a = h.per[F.code];
  const mPts = ds.map((d, i) => ({ d, v: h.mkt[mkt][i] })).filter((p) => p.v && p.d >= cut);
  const sPts = a ? a.slice(1).map((v, i) => ({ d: ds[a[0] + i], v })).filter((p) => p.v && p.d >= cut) : [];
  const seg = vaSeg('trd', [['1', '1년'], ['3', '3년'], ['5', '5년'], ['all', '전체']], yrs);
  if (mPts.length < 2) return vaSec('PER 추이', seg, '<div class="empty">기록이 쌓이는 중입니다.</div>');
  const M = vaSmooth(mPts), S = vaSmooth(sPts);
  const W = 640, H = 260, P = { l: 40, r: 56, t: 12, b: 30 };
  const t0 = Date.parse(M[0].d), t1 = Date.parse(M[M.length - 1].d), vs = [...M, ...S].map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.12 || 2, y0 = lo - pad, y1 = hi + pad;
  const X = (d) => P.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r), Y = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const yt = [lo, (lo + hi) / 2, hi].map((v) => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gl"/><text x="${P.l - 6}" y="${(Y(v) + 4).toFixed(1)}" class="yl">${vaNum(v)}</text>`).join('');
  const xt = [t0, (t0 + t1) / 2, t1].map((t, i) => { const d = new Date(t).toISOString().slice(0, 10); return `<text x="${X(d).toFixed(1)}" y="${H - 8}" class="xl" style="text-anchor:${['start', 'middle', 'end'][i]}">${d.slice(2, 7).replace('-', '.')}</text>`; }).join('');
  const lm = M[M.length - 1], ls = S.length > 1 ? S[S.length - 1] : null, gap = ls ? Y(ls.v) - Y(lm.v) : 99, nudge = Math.abs(gap) < 14 ? (14 - Math.abs(gap)) / 2 * (gap < 0 ? -1 : 1) : 0;
  const end = (p, cls, dy) => `<text x="${(X(p.d) + 6).toFixed(1)}" y="${(Y(p.v) + 4 + dy).toFixed(1)}" class="${cls}">${vaNum(p.v, 1)}배</text>`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" class="va-sc va-tr" role="img" aria-label="PER 추이">${yt}${xt}<path d="${path(M)}" class="mk"/>${S.length > 1 ? `<path d="${path(S)}" class="me"/>` : ''}${end(lm, 'el mk', -nudge)}${ls ? end(ls, 'el me', nudge) : ''}</svg>`;
  const raw = sPts.map((p) => p.v);
  const kv = raw.length < 2 ? [['지금', vaX(raw[0] ?? x?.per)], [`${mkt} 중앙값`, vaX(mPts[mPts.length - 1].v)]] : [['지금', vaX(raw[raw.length - 1])], ['기간 중앙값', vaX(vaQuant(raw, 0.5))], ['25~75%', `${vaNum(vaQuant(raw, 0.25), 1)}~${vaNum(vaQuant(raw, 0.75), 1)}배`], ['최저~최고', `${vaNum(Math.min(...raw), 1)}~${vaNum(Math.max(...raw), 1)}배`], [`${mkt} 중앙값`, vaX(mPts[mPts.length - 1].v)]];
  const leg = `<div class="va-leg"><span class="tg">${esc(F.name)}</span><span class="cv">${mkt} 중앙값</span></div>`;
  const note = sPts.length < 2 ? `<p class="va-note">${esc(F.name)} 기록은 ${esc(sPts[0]?.d || ds[ds.length - 1])}부터 쌓는 중</p>` : '';
  return vaSec('PER 추이', seg, `<dl class="va-kv va-mkv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${leg}<div class="va-scw">${svg}</div>${note}`);
}

function vaDraw() {
  const host = $('#va-host'); if (!host) return;
  if (vaS.err) { host.innerHTML = `<div class="card"><div class="empty">${esc(vaS.err)}</div></div>`; return; }
  if (vaS.view && !vaS.mk?.by[vaS.view]) vaS.view = null;
  if (vaS.view) { host.innerHTML = vaFinder() + vaQuick(vaS.view); vaSave(); return; }
  const c = vaCase();
  if (!c) { host.innerHTML = vaFinder() + '<div class="card"><div class="empty">아직 리서치한 평가가 없습니다. 위에서 회사를 찾으면 시장 데이터로 비교해 볼 수 있습니다.</div></div>'; return; }
  vaS.cid = c.id;
  const r = vaCalc(c), F = vaFocusCase(c), tab = vaS.tab || 'sum';
  const body = { sum: () => vaSummary(c, r), mult: () => vaRange(c, r) + vaMultTable(c, r) + vaApply(c, r), chk: () => vaLoo(c, r) + vaScen(c, r), pick: () => vaPick(c), mkt: () => vaTrend(F) + vaMarket(F) + vaReg(F) }[tab] || (() => vaSummary(c, r));
  host.innerHTML = vaFinder() + vaHead(c, r) + vaTabs('tab', [['sum', '요약'], ['mult', '배수 상세'], ['chk', '검증'], ['pick', '선정 근거'], ...(vaS.mk ? [['mkt', '시장']] : [])], tab) + body();
  vaSave();
}
const vaCase = () => { const cs = vaS.data?.cases || []; return cs.find((x) => x.id === vaS.cid) || cs[0] || null; };

function vaBind(host) {
  host.addEventListener('click', (e) => {
    const pk = e.target.closest('[data-va-pick]');
    if (pk) { const k = pk.dataset.vaPick, cs = vaCaseOf(k); vaS.q = ''; vaS.pq = ''; if (cs) { vaS.cid = cs.id; vaS.view = null; } else vaS.view = k; vaDraw(); window.scrollTo(0, 0); return; }
    if (e.target.closest('[data-va-back]')) { vaS.view = null; vaDraw(); return; }
    const pa = e.target.closest('[data-va-padd]');
    if (pa && vaS.view) { const l = (vaS.qp[vaS.view] ||= []); if (pa.dataset.vaPadd !== vaS.view && !l.includes(pa.dataset.vaPadd)) l.push(pa.dataset.vaPadd); vaS.pq = ''; vaDraw(); return; }
    const pr = e.target.closest('[data-va-prm]');
    if (pr && vaS.view) { vaS.qp[vaS.view] = (vaS.qp[vaS.view] || []).filter((k) => k !== pr.dataset.vaPrm); vaDraw(); return; }
    if (e.target.closest('[data-va-pind]') && vaS.view) {
      const x = vaS.mk.by[vaS.view], l = (vaS.qp[vaS.view] ||= []);
      vaS.mk.list.filter((y) => y.industry === x.industry && y.code !== x.code && !l.includes(y.code)).sort((a, b) => (b.mcap || 0) - (a.mcap || 0)).slice(0, 5).forEach((y) => l.push(y.code));
      vaDraw(); return;
    }
    const sg = e.target.closest('[data-va-seg]');
    if (sg && ['mkm', 'mkk', 'qpr', 'tab', 'qtab', 'trd'].includes(sg.dataset.vaSeg)) { vaS[{ mkm: 'mkMarket', mkk: 'mkKind', qpr: 'qpr', tab: 'tab', qtab: 'qtab', trd: 'trd' }[sg.dataset.vaSeg]] = sg.dataset.v; vaDraw(); return; }
    if (e.target.closest('[data-va-warn]')) { vaS.warnOpen = !e.target.closest('details').open; return; }
    const c = vaCase(); if (!c || vaS.view) return;
    const s = vaSel(c);
    if (sg) { const k = sg.dataset.vaSeg, v = sg.dataset.v; if (k === 'tper') vaS.tblPer = v; else s[k] = v; vaDraw(); return; }
    if (e.target.closest('[data-va-reset]')) { delete vaS.sel[c.id]; vaS.tblPer = null; vaDraw(); return; }
    if (e.target.closest('[data-va-ex]')) { vaS.showEx = !vaS.showEx; vaDraw(); return; }
    if (e.target.closest('#va-xlsx')) { vaDownload(e.target.closest('#va-xlsx'), c); return; }
    const row = e.target.closest('[data-va-row]');
    if (row && e.target.closest('button')) { const k = row.dataset.vaRow; vaS.open[k] = !vaS.open[k]; vaDraw(); }
  });
  host.addEventListener('input', (e) => {
    if (e.target.matches('[data-va-q]')) { vaS.q = e.target.value; const box = $('#va-sug'); if (box) box.innerHTML = vaSug(vaS.q); }
    if (e.target.matches('[data-va-pq]')) { vaS.pq = e.target.value; const box = $('#va-psug'); if (box) box.innerHTML = vaSug(vaS.pq, 'data-va-padd'); }
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-va-cg]')) { (vaS.cg ||= {})[t.dataset.vaCg] = t.value; vaDraw(); return; }
    const c = vaCase(); if (!c) return;
    const s = vaSel(c);
    if (t.matches('[data-va-inc]')) { s.inc[t.dataset.vaInc] = t.checked; vaDraw(); return; }
    if (t.matches('[data-va-adj]')) { s.adj[t.dataset.vaAdj] = t.value === '' ? '' : +t.value; vaDraw(); return; }
    if (t.matches('[data-va-case]')) { vaS.cid = t.value; vaS.tblPer = null; vaDraw(); }
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

async function renderValuation() {
  const tabs = [['rel', '상대가치평가', 'chart'], ...(typeof renderDcf === 'function' ? [['dcf', 'DCF', 'calc']] : [])];
  const vt = location.hash.startsWith('#valuation/dcf') && tabs.length > 1 ? 'dcf' : 'rel';
  PAGE.innerHTML = `<div class="page-head"><h1>가치평가</h1><span class="mk-upd" id="va-upd"></span></div>
    <div class="deal-seg" role="tablist">${tabs.map(([k, t, i]) => `<button type="button" role="tab" aria-selected="${k === vt}" class="${k === vt ? 'on' : ''}" data-vt="${k}">${ico(i)}${t}</button>`).join('')}</div>
    <div id="va-host" class="mk va"><div class="card"><div class="empty">불러오는 중…</div></div></div>`;
  PAGE.querySelectorAll('[data-vt]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.vt === 'dcf' ? '#valuation/dcf' : '#valuation'; }));
  if (vt === 'dcf') return renderDcf($('#va-host'));
  vaBind($('#va-host'));
  await Promise.all([vaLoad(), vaLoadMkt()]);
  const u = vaS.data?.updated_at ? new Date(vaS.data.updated_at) : null;
  if (u && !isNaN(u)) $('#va-upd').textContent = `${u.getMonth() + 1}/${u.getDate()} ${pad(u.getHours())}:${pad(u.getMinutes())} 업데이트`;
  vaDraw();
}

TAB_INFO.valuation = { title: '상대가치평가', rows: [
  ['이 화면', '비슷한 상장사들의 배수(PER, EV/EBITDA 등) 중앙값을 대상 회사 이익에 곱해 적정 주가를 봅니다. 비교기업 선정과 해외 배수, 시나리오 근거는 리서치로 채우고, 계산은 이 화면과 엑셀이 같은 식으로 합니다.'],
  ['바꿔 볼 수 있는 것', ['배수 표의 체크를 풀거나 켜면 그 회사를 빼거나 넣고 다시 계산', '비교기업 범위: 국내만, 해외만, 국내와 해외. 결론의 「국내와 해외 따로」 표는 범위와 상관없이 셋 다 보여 줌', '기준 기간: 최근 4분기, 올해 추정, 내년 추정', 'PER 10~50배만: 증권신고서 관행대로 PER이 10배 미만이거나 50배 초과인 비교기업을 PER 통계에서 뺌', '적용 결과 표의 조정(%): 할증은 +, 할인은 −', '처음 구성으로: 리서치에서 정한 구성으로 되돌림']],
  ['배수 정의', { table: [['배수', '분자', '분모'], ['PER', '시가총액', '지배주주 순이익'], ['PBR', '시가총액', '지배주주 자본'], ['EV/EBITDA', 'EV', 'EBITDA'], ['EV/EBIT', 'EV', '영업이익'], ['EV/Sales', 'EV', '매출']] }],
  ['금액 정의', ['시가총액: 자사주를 뺀 보통주 수 × 종가 + 우선주(상장이면 우선주 종가, 비상장이면 보통주 종가로 1:1 가정)', 'EV: 시가총액 + 순부채 + 비지배지분', '순부채: 이자발생부채(전환사채, 리스 포함) − 현금, 단기금융상품, 단기 당기손익공정가치 금융자산', '배수와 이익은 같은 기간끼리 곱함. 대표값은 중앙값, 범위는 25%~75%', 'EV 배수로 구한 주주가치 = 배수 × 지표 − 순부채 − 비지배지분 + 비영업자산']],
  ['읽는 법', ['탭: 요약(풋볼필드와 목표주가, 배수별 평가표, 비교기업 선정), 배수 상세(국내와 해외 따로, 배수별 범위, 회사별 배수, 적용 결과), 검증(한 회사씩 빼기, 시나리오), 선정 근거(단계별 기준과 회사별 이유), 시장(전 상장사 분포와 회귀)', '풋볼필드: 52주 고저, 증권사 목표가 최저~최고, 배수별 Bear~Bull(시나리오가 없으면 25~75%). 회색 점선은 현재가, 빨간 점선은 목표주가', '목표주가: 평가 배수 하나로 계산(100원 단위 반올림). 기본은 PER, 금융업은 PBR, 순이익 적자면 EV/EBITDA, EBITDA도 적자면 EV/Sales(국내 IPO 증권신고서와 셀사이드 관행). 리서치에서 바꿀 수 있고, 다른 배수는 풋볼필드 「참고」 줄과 교차 확인 표로만 봄', '배수별 평가표: 막대 세로선이 Target 배수(비교기업 중앙값), 표는 지표 × Target 배수 = 주당 가치', '범위 막대(배수 상세): 비교기업 배수 25~75% 구간을 대상 회사에 적용한 주당 가치, 가운데 선은 중앙값', '배수 표 체크: 풀면 그 회사가 통계에서 빠지고 결론이 바로 다시 계산됨. 취소선 PER은 10~50배 밖이라 통계에서 뺀 값', '조정(%): 성장률이나 이익률 차이처럼 근거가 있을 때만 넣고 판단 메모에 이유를 남김', '비교기업이 3곳 미만이면 배수 평가 칸 아래에 다른 범위(국내, 해외, 국내와 해외)와 대상 회사 업종(FnGuide 소분류, 같은 PER 범위 조건) 중앙값을 참고로 보여 줌. 「국내와 해외 따로」 표에서는 주황', '한 회사씩 빼기: 한 곳만 빼도 주당 가치가 15% 넘게 움직이면 주황 표시', '시나리오: 배수는 그대로 두고 대상 회사 이익만 바꿔 적용. 근거는 시나리오 이름에 마우스를 올리면 보임', 'NM: 분모가 0 이하(적자 등)라 계산하지 않음', '주황 칸: 중앙값의 2배를 넘거나 절반에 못 미치는 배수', '확인할 것: 지금 구성에서 비교기업 수 부족, 평균과 중앙값 차이, 한 회사에 기대는 결과, 데이터 지연 등']],
  ['전 상장사 PER 분포와 회귀', ['분포: 코스피, 코스닥 전 종목(우선주, 스팩 제외)의 PER 구간별 종목 수. 대상 회사가 든 구간은 파란색, 검색한 회사 구간은 주황색', '회사 검색(맨 위): 리서치한 평가가 있는 회사는 그 평가를, 없는 회사는 네이버 PER로 손PB처럼 빠르게 비교(시장 내 위치, Peer 비교, 업종별 PER, 분포, 회귀). Peer는 검색해 넣거나 같은 업종 시가총액 상위 5곳을 한 번에 넣음', '회귀: 이익 성장률이 같을 때 시장이 주는 PER을 보는 보조 지표. 손PB 상대가치 화면과 같은 식. log(PER) = 상수 + 성장률 계수 × 이익 성장률 + 베타 계수 × 베타 + 업종 더미. 표본은 최근 4분기 PER 2~500배, 추정 PER 0~200배, 성장률 0~500%, 베타 −1~4인 회사, 업종 5곳 미만은 기준 업종. 가로축은 200%에서 자름', '이익 성장률: 최근 4분기 PER ÷ 추정 PER − 1. 괴리: 회귀 적정 PER ÷ 지금 PER − 1. 성장률이 0 이하인 회사는 직접 넣으면 단순 회귀 곡선으로 계산', '분포: PER 0~200배 종목만. 업종 막대는 FnGuide 대분류별 25~75% 구간과 중앙값, 파란 점은 고른 회사', 'Peer 비교: 세로선은 Peer 최근 4분기 PER 중앙값, 흐린 막대는 10~50배 밖이라 중앙값에서 뺀 회사', 'PER 추이: 고른 회사의 최근 4분기 PER과 그 회사 시장(KOSPI, KOSDAQ) 중앙값. 손PB와 같이 점이 200개 넘으면 10개, 아니면 4개씩 이동평균. 시장 중앙값은 PER 2~500배, 금융 업종 제외. 평일 16:30에 쌓고, 그 전 기록은 손PB가 2016-05부터 모은 같은 네이버 PER(시장 중앙값과 리서치 사례 회사만, 2025년까지는 주 1회)', '추이 위 숫자: 지금, 기간 중 PER 중앙값, 25~75%, 최저~최고(이동평균 전 값)']],
  ['출처', ['국내 비교기업: 네이버 기업정보(와이즈리포트) 실적과 컨센서스, KIND 상장법인 목록. 실적 발표 직후 며칠은 반영이 늦어 대상 회사는 분기보고서와 증권사 리포트로 고쳐 넣음', '해외 비교기업: 리서치로 모은 배수(회사별 출처와 기준일은 비교기업 선정 칸)', '계산 원본과 사례 폴더: 05. 딜소싱 > _자동화 > 가치평가']],
] };
