/* 투자업무 › 가치평가 › 상대가치평가.
   데이터: OneDrive data/valuation.json — 05. 딜소싱\_자동화\가치평가 에서 relval.py run(사례 계산) 뒤 publish.py 로 올린다.
   사례마다 회사별 배수와 대상 회사 지표가 들어 있고, 비교기업 켜고 끄기, 국내만과 해외 포함, 기준 기간, 할증·할인은 이 화면이 다시 계산한다.
   계산식은 relval.py 와 같다(사례의 py 값과 맞춰 봄). 원본 로직은 05. 딜소싱\가치평가 로직 노트.md 18장.
   엑셀: data/valuation/<사례 id>.xlsx. 손PB 상대가치 화면(PERValuationScreen.jsx)의 범위 막대(IQR)를 결론 막대그림에 가져왔다.
   app.js 전역($, esc, pad, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn, PAGE, route), graph.js STORE·G, market.css 표·탭 클래스를 쓴다. */
const VA_FILE = 'data/valuation.json';
const VA_TTL = 600000;
const VA_PER = { LTM: '최근 4분기', FY0: '직전 결산', FY1: '올해 추정', FY2: '내년 추정', FY3: '후년 추정' };
const VA_MULT = { PER: ['equity', 'ni'], PBR: ['equity', 'equity'], PSR: ['equity', 'revenue'], 'EV/EBITDA': ['ev', 'ebitda'], 'EV/EBIT': ['ev', 'op'], 'EV/Sales': ['ev', 'revenue'] };
const VA_MET = { ni: '순이익', equity: '자본', revenue: '매출', ebitda: 'EBITDA', op: '영업이익' };
const vaS = { data: null, at: 0, loading: null, err: '', cid: null, sel: {}, tblPer: null, showEx: false, open: {} };
Object.assign(vaS, viewGet('va', {}));
const vaSave = () => viewSet('va', { cid: vaS.cid, sel: vaS.sel, tblPer: vaS.tblPer });

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
  if (!c.peers.some((p) => p.kind !== '국내')) s.scope = '국내';
  return s;
}
const vaAdj = (c, s, nm) => (s.adj[nm] != null && s.adj[nm] !== '' ? +s.adj[nm] / 100 : +(c.adjustments?.[nm]?.pct || 0));
const vaUse = (c, s, skip) => c.peers.filter((p) => p !== skip && s.inc[vaKey(p)] && (s.scope === '전체' || p.kind === '국내'));
function vaCol(c, s, per, nm, skip) {
  const use = vaUse(c, s, skip), st = vaStats(use.map((p) => p.mult[per]?.[nm]).filter((v) => v !== '제외'));
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
    ['유통주식수', `${vaNum(t.shares)}주`], ['52주 범위', `${vaNum(t.low52)} ~ ${vaNum(t.high52)}원`], ['증권사 목표가 평균', vaWon(t.target_mean)]];
  const hasGlobal = c.peers.some((p) => p.kind !== '국내');
  return `<section class="card va-head"><div class="va-ttl"><div><h2>${esc(t.name)} <small>${esc(t.code)}</small></h2>
      <p>기준일 ${esc(c.day)}${c.purpose ? `, ${esc(c.purpose)} 평가` : ''}${t.wics ? `, WICS ${esc(t.wics)}` : ''}</p></div>
      <div class="va-tools">${pick}${infoBtn('valuation')}<button class="btn ghost" type="button" id="va-xlsx">${ico('file', 'sm')}엑셀 받기</button></div></div>
    <dl class="va-kv">${kv.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="va-ctrl">${hasGlobal ? `<div><span>비교기업 범위</span>${vaSeg('scope', [['국내', '국내만'], ['전체', '국내와 해외']], s.scope)}</div>` : ''}
      <div><span>기준 기간</span>${vaSeg('base', c.periods.map((p) => [p, VA_PER[p] || p]), s.base)}</div>
      <button class="btn ghost sm" type="button" data-va-reset>처음 구성으로</button></div></section>`;
}

function vaField(c, r) { // 결론 막대: 배수별 25~75% 범위와 중앙값, 현재가 세로선
  const s = r.s, rows = [];
  for (const nm of c.mults) rows.push([s.base, nm]);
  for (const per of c.periods) if (per !== s.base) for (const nm of c.primary) rows.push([per, nm]);
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
  }).join('')}<div class="va-ff-r leg"><div class="va-ff-l"></div><div class="va-ff-b"><span class="now-l" style="left:${now}">현재가 ${vaWon(c.target.close)}</span></div><div class="va-ff-v"></div></div></div>
  <p class="va-note">막대는 비교기업 배수 25%~75% 구간을 대상 회사에 적용한 주당 가치, 가운데 선은 중앙값</p>`;
}

function vaConclusion(c, r) {
  const s = r.s;
  const tiles = c.primary.map((nm) => {
    const v = r.val[s.base][nm], st = r.st[s.base][nm], a = vaAdj(c, s, nm);
    if (!v.med) return `<div class="va-tile"><span>${esc(nm)}</span><strong>-</strong><p>계산된 비교기업 없음</p></div>`;
    return `<div class="va-tile"><span>${esc(VA_PER[s.base])} ${esc(nm)} 중앙값 ${vaX(st.median)}${a ? ` (${a > 0 ? '+' : ''}${vaNum(a * 100, 1)}% 조정)` : ''}, ${st.n}곳</span>
      <strong>${vaWon(v.med.ps)}</strong><p>현재가 대비 ${vaUp(v.med.up)}</p><p class="rng">25~75% ${vaWon(v.lo?.ps)} ~ ${vaWon(v.hi?.ps)}</p></div>`;
  }).join('');
  const memo = c.conclusion ? `<div class="va-memo"><b>판단 메모</b><p>${esc(c.conclusion)}</p></div>` : '';
  return vaSec('결론', '', `<div class="va-tiles">${tiles}</div>${vaField(c, r)}${memo}`);
}

function vaWarnCard(c, r) {
  const dyn = vaWarns(c, r), dat = c.data_warnings || [];
  if (!dyn.length && !dat.length) return '';
  const li = (a) => a.map((w) => `<li>${esc(w)}</li>`).join('');
  return vaSec(`확인할 것 <span class="n">${dyn.length + dat.length}</span>`, '', `${dyn.length ? `<h3 class="va-h3">지금 구성 기준</h3><ul class="va-warn">${li(dyn)}</ul>` : ''}${dat.length ? `<h3 class="va-h3">데이터</h3><ul class="va-warn">${li(dat)}</ul>` : ''}`);
}

function vaMultTable(c, r) {
  const s = r.s, per = c.periods.includes(vaS.tblPer) ? vaS.tblPer : s.base, st = r.st[per];
  const cell = (p, nm) => {
    const v = p.mult[per]?.[nm];
    if (v === '제외') return `<td class="va-ex" title="${esc(p.exclude_reason || '사람이 뺀 배수')}">제외</td>`;
    const out = typeof v === 'number' && st[nm].median && s.inc[vaKey(p)] && (s.scope === '전체' || p.kind === '국내') && (v > st[nm].median * 2 || v < st[nm].median * 0.5);
    return `<td class="${out ? 'va-out' : ''}" ${out ? 'title="중앙값의 2배를 넘거나 절반에 못 미침"' : ''}>${vaX(v)}</td>`;
  };
  const t = c.target;
  const head = `<tr><th class="st">회사</th><th>시가총액</th>${c.mults.map((nm) => `<th class="${c.primary.includes(nm) ? 'strong' : ''}">${esc(nm)}</th>`).join('')}</tr>`;
  const trow = `<tr class="va-tgt"><td class="st"><b>${esc(t.name)}</b><small>대상 회사</small></td><td>${vaNum(t.mcap)}억</td>${c.mults.map((nm) => `<td class="strong">${vaX(t.mult[per]?.[nm])}</td>`).join('')}</tr>`;
  const prow = (p) => {
    const on = !!s.inc[vaKey(p)], inScope = s.scope === '전체' || p.kind === '국내';
    return `<tr class="${on && inScope ? '' : 'off'}"><td class="st"><label class="va-chk"><input type="checkbox" data-va-inc="${esc(vaKey(p))}" ${on ? 'checked' : ''} ${inScope ? '' : 'disabled'}><span><b>${esc(p.name)}</b><small>${esc(p.kind === '국내' ? '국내' : p.country || '해외')}${!inScope ? ', 범위 밖' : !p.include ? ', 처음엔 뺀 회사' : ''}</small></span></label></td>
      <td>${p.mcap != null ? `${vaNum(p.mcap)}억` : '-'}</td>${c.mults.map((nm) => cell(p, nm)).join('')}</tr>`;
  };
  const srow = (label, f) => `<tr class="va-stat"><td class="st">${label}</td><td></td>${c.mults.map((nm) => `<td>${f(st[nm])}</td>`).join('')}</tr>`;
  const peers = [...c.peers].sort((a, b) => (a.kind === '국내' ? 0 : 1) - (b.kind === '국내' ? 0 : 1));
  const body = `<div class="mk-scroll"><table class="mk-tbl va-mt"><thead>${head}</thead><tbody>${trow}${peers.map(prow).join('')}
    ${srow('중앙값', (x) => `<b>${vaX(x.median)}</b>`)}${srow('평균', (x) => vaX(x.mean))}${srow('25%', (x) => vaX(x.q25))}${srow('75%', (x) => vaX(x.q75))}
    ${srow('계산된 회사', (x) => `${x.n}곳${x.nm ? ` (NM ${x.nm})` : ''}`)}</tbody></table></div>
    <p class="va-note">체크를 풀면 그 회사가 통계에서 빠지고 위 결론이 바로 다시 계산됩니다. NM은 분모가 0 이하(적자 등), 제외는 리서치에서 뺀 배수</p>`;
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
    <p class="va-note">비교기업 중앙값 배수를 대상 회사 지표에 곱한 주당 가치. 조정(할증은 +, 할인은 −)은 성장률이나 이익률 차이처럼 근거가 있을 때만 넣고 판단 메모에 이유를 남김</p>
    <h3 class="va-h3">대상 회사 지표 (억원)</h3><div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">기간</th><th>매출</th><th>영업이익</th><th>EBITDA</th><th>순이익</th><th>자본</th></tr></thead><tbody>${met}</tbody></table></div>
    <p class="va-note">순부채 ${vaNum(t.net_debt)}억, 비지배지분 ${vaNum(t.nci)}억, 비영업자산 ${vaNum(c.non_op?.amount || 0)}억(${esc(t.bs_date || '')} 기준)${c.non_op?.reason ? `. ${esc(c.non_op.reason)}` : ''}</p>
    ${t.override_note ? `<p class="va-note">손으로 바꾼 값: ${esc(t.override_note)}</p>` : ''}`);
}

function vaLoo(c, r) {
  if (!r.loo.length || !r.loo[0].rows.length) return '';
  const names = r.loo[0].rows.map((x) => x.name);
  const rows = names.map((n, i) => `<tr><td class="st"><b>${esc(n)}</b></td>${r.loo.map((g) => { const x = g.rows[i]; const big = x.ch != null && Math.abs(x.ch) > 0.15; return `<td>${vaX(x.med)}</td><td class="${big ? 'va-out' : ''}">${vaWon(x.ps)} <small>${x.ch == null ? '' : `${x.ch > 0 ? '+' : ''}${vaNum(x.ch * 100, 1)}%`}</small></td>`; }).join('')}</tr>`).join('');
  return vaSec('한 회사씩 뺀 결과', `<span class="meta">${esc(VA_PER[r.s.base])} 기준</span>`, `<div class="mk-scroll"><table class="mk-tbl va-loo"><thead><tr><th class="st">뺀 회사</th>${r.loo.map((g) => `<th>${esc(g.nm)} 중앙값</th><th>${esc(g.nm)} 주당 가치</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="va-note">한 회사를 빼서 주당 가치가 15% 넘게 움직이면 표시. 결과가 특정 회사 하나에 기대고 있다는 뜻</p>`);
}

function vaScen(c, r) {
  const sc = Object.entries(c.scenarios || {}); if (!sc.length) return '';
  const s = r.s, pers = c.periods.filter((p) => sc.some(([, o]) => o[p]));
  const line = (name, ov) => `<tr><td class="st"><b>${esc(name)}</b></td>${pers.map((per) => c.primary.map((nm) => { const v = (ov ? ov[per] : {}) && vaImplied(c, per, nm, r.st[per][nm].median, vaAdj(c, s, nm), ov ? ov[per] : null); return `<td>${ov && !ov[per] ? '-' : v ? `${vaWon(v.ps)} <small>${vaUp(v.up)}</small>` : '-'}</td>`; }).join('')).join('')}</tr>`;
  const body = `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">시나리오</th>${pers.map((per) => c.primary.map((nm) => `<th>${esc(VA_PER[per])} ${esc(nm)}</th>`).join('')).join('')}</tr></thead>
    <tbody>${line('기본', null)}${sc.map(([n, o]) => line(n, o)).join('')}</tbody></table></div>
    ${sc.map(([n, o]) => (o._note ? `<p class="va-note"><b>${esc(n)}</b> ${esc(o._note)}</p>` : '')).join('')}<p class="va-note">배수는 그대로 두고 대상 회사 이익만 바꿔 적용</p>`;
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

// ---------- 그리기 ----------
function vaDraw() {
  const host = $('#va-host'); if (!host) return;
  if (vaS.err) { host.innerHTML = `<div class="card"><div class="empty">${esc(vaS.err)}</div></div>`; return; }
  const c = vaCase();
  if (!c) { host.innerHTML = '<div class="card"><div class="empty">아직 올라온 평가가 없습니다.</div></div>'; return; }
  vaS.cid = c.id;
  const r = vaCalc(c);
  host.innerHTML = vaHead(c, r) + vaConclusion(c, r) + vaWarnCard(c, r) + vaMultTable(c, r) + vaApply(c, r) + vaLoo(c, r) + vaScen(c, r) + vaPick(c);
  vaSave();
}
const vaCase = () => { const cs = vaS.data?.cases || []; return cs.find((x) => x.id === vaS.cid) || cs[0] || null; };

function vaBind(host) {
  host.addEventListener('click', (e) => {
    const c = vaCase(); if (!c) return;
    const s = vaSel(c), sg = e.target.closest('[data-va-seg]');
    if (sg) { const k = sg.dataset.vaSeg, v = sg.dataset.v; if (k === 'tper') vaS.tblPer = v; else s[k] = v; vaDraw(); return; }
    if (e.target.closest('[data-va-reset]')) { delete vaS.sel[c.id]; vaS.tblPer = null; vaDraw(); return; }
    if (e.target.closest('[data-va-ex]')) { vaS.showEx = !vaS.showEx; vaDraw(); return; }
    if (e.target.closest('#va-xlsx')) { vaDownload(e.target.closest('#va-xlsx'), c); return; }
    const row = e.target.closest('[data-va-row]');
    if (row && e.target.closest('button')) { const k = row.dataset.vaRow; vaS.open[k] = !vaS.open[k]; vaDraw(); }
  });
  host.addEventListener('change', (e) => {
    const c = vaCase(); if (!c) return;
    const s = vaSel(c), t = e.target;
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
  const tabs = [['rel', '상대가치평가', 'chart']];
  PAGE.innerHTML = `<div class="page-head"><h1>가치평가</h1><span class="mk-upd" id="va-upd"></span></div>
    <div class="deal-seg" role="tablist">${tabs.map(([k, t, i]) => `<button type="button" role="tab" aria-selected="true" class="on" data-vt="${k}">${ico(i)}${t}</button>`).join('')}</div>
    <div id="va-host" class="mk va"><div class="card"><div class="empty">불러오는 중…</div></div></div>`;
  vaBind($('#va-host'));
  await vaLoad();
  const u = vaS.data?.updated_at ? new Date(vaS.data.updated_at) : null;
  if (u && !isNaN(u)) $('#va-upd').textContent = `${u.getMonth() + 1}/${u.getDate()} ${pad(u.getHours())}:${pad(u.getMinutes())} 업데이트`;
  vaDraw();
}

TAB_INFO.valuation = { title: '상대가치평가', rows: [
  ['이 화면', '비슷한 상장사들의 배수(PER, EV/EBITDA 등) 중앙값을 대상 회사 이익에 곱해 적정 주가를 봅니다. 비교기업 선정과 해외 배수, 시나리오 근거는 리서치로 채우고, 계산은 이 화면과 엑셀이 같은 식으로 합니다.'],
  ['바꿔 볼 수 있는 것', ['배수 표의 체크를 풀거나 켜면 그 회사를 빼거나 넣고 다시 계산', '비교기업 범위: 국내만 또는 국내와 해외', '기준 기간: 최근 4분기, 올해 추정, 내년 추정', '적용 결과 표의 조정(%): 할증은 +, 할인은 −', '처음 구성으로: 리서치에서 정한 구성으로 되돌림']],
  ['배수 정의', { table: [['배수', '분자', '분모'], ['PER', '시가총액', '지배주주 순이익'], ['PBR', '시가총액', '지배주주 자본'], ['EV/EBITDA', 'EV', 'EBITDA'], ['EV/EBIT', 'EV', '영업이익'], ['EV/Sales', 'EV', '매출']] }],
  ['금액 정의', ['시가총액: 자사주를 뺀 보통주 수 × 종가 + 우선주(상장이면 우선주 종가, 비상장이면 보통주 종가로 1:1 가정)', 'EV: 시가총액 + 순부채 + 비지배지분', '순부채: 이자발생부채(전환사채, 리스 포함) − 현금, 단기금융상품, 단기 당기손익공정가치 금융자산', '배수와 이익은 같은 기간끼리 곱함. 대표값은 중앙값, 범위는 25%~75%', 'EV 배수로 구한 주주가치 = 배수 × 지표 − 순부채 − 비지배지분 + 비영업자산']],
  ['읽는 법', ['NM: 분모가 0 이하(적자 등)라 계산하지 않음', '주황 칸: 중앙값의 2배를 넘거나 절반에 못 미치는 배수', '확인할 것: 지금 구성에서 비교기업 수 부족, 평균과 중앙값 차이, 한 회사에 기대는 결과, 데이터 지연 등']],
  ['출처', ['국내 비교기업: 네이버 기업정보(와이즈리포트) 실적과 컨센서스, KIND 상장법인 목록. 실적 발표 직후 며칠은 반영이 늦어 대상 회사는 분기보고서와 증권사 리포트로 고쳐 넣음', '해외 비교기업: 리서치로 모은 배수(회사별 출처와 기준일은 비교기업 선정 칸)', '계산 원본과 사례 폴더: 05. 딜소싱 > _자동화 > 가치평가']],
] };
