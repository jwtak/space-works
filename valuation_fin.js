/* 투자업무 › 가치평가 › 재무분석.
   데이터: OneDrive data/valuation_fin.json — 05. 딜소싱\_자동화\가치평가 에서 사례마다 계산해 올린다(형식은 그 폴더 FIN_CONTRACT.md).
   추정에 들어가기 전에 대상 회사의 5년 재무 흐름과 비교기업 대비 위치를 본다(SK오션플랜트 IM 10쪽 Financial Analysis 구성).
   숫자는 파일의 값을 그대로 보여 주고 다시 계산하지 않는다(대상 − 비교기업 차이만 화면에서 뺀다). 지표는 metrics 목록대로 그리므로 키를 코드에 적지 않는다.
   valuation.js 뒤에 읽는다: vaNum, vaSec, 그리고 app.js 전역($, esc, ico, viewGet, viewSet, TAB_INFO, infoBtn), graph.js STORE, market.css·valuation.css 표·머리 클래스를 쓴다. */
const FIN_FILE = 'data/valuation_fin.json';
const FIN_TTL = 600000;
const FIN_U = { '%': '%', x: '배', 일: '일', 억원: '억' };
const FIN_LV = { good: ['좋음', 'done'], warn: ['주의', 'alert'], info: ['참고', 'info'] };
const FIN_ROWS = [ // 주요 계정 표의 순서와 이름. 파일에 있는 키만 그리고, 여기 없는 키는 「기타」로 붙임
  ['손익', [['rev', '매출'], ['cogs', '매출원가'], ['gp', '매출총이익'], ['sga', '판관비'], ['op', '영업이익'], ['ebitda', 'EBITDA'], ['ni', '순이익'], ['ni_ctrl', '지배주주 순이익'], ['dep', '감가상각비'], ['int_exp', '이자비용']]],
  ['재무상태', [['assets', '자산'], ['cur_assets', '유동자산'], ['liab', '부채'], ['cur_liab', '유동부채'], ['equity', '자본'], ['equity_ctrl', '지배주주 자본'], ['cash', '현금'], ['debt', '차입금'], ['net_debt', '순차입금'], ['ar', '매출채권'], ['inv', '재고자산'], ['ap', '매입채무']]],
  ['현금흐름', [['cfo', '영업현금흐름'], ['capex', 'CAPEX'], ['fcf', 'FCF']]],
];
const FIN_KEY = new Set(['rev', 'op', 'ni']);
const finS = { data: null, at: 0, loading: null, err: '', stat: 'avg', met: {}, shut: {}, cid: {} };
Object.assign(finS, viewGet('fin', {}));
const finSave = () => viewSet('fin', { stat: finS.stat, met: finS.met, shut: finS.shut, cid: finS.cid });

function finLoad(force) {
  if (!force && finS.at && Date.now() - finS.at < FIN_TTL) return Promise.resolve();
  finS.loading ||= STORE.readText(FIN_FILE)
    .then((r) => { finS.data = r.text ? JSON.parse(r.text) : null; finS.err = ''; finS.at = Date.now(); })
    .catch((e) => { finS.data = null; finS.err = e instanceof SyntaxError ? '재무분석 파일을 읽지 못했습니다.' : e.message; })
    .finally(() => { finS.loading = null; });
  return finS.loading;
}

// ---------- 포맷 ----------
const finOk = (v) => typeof v === 'number' && Number.isFinite(v);
function finDec(m, vals) { // 소수 자리: 비율 1, 일수 0, 배수와 금액은 한 줄(열)에서 가장 큰 값이 작으면 한 자리 더
  const mx = Math.max(0, ...(vals || []).filter(finOk).map(Math.abs));
  if (m.unit === '%') return 1;
  if (m.unit === '일') return 0;
  if (m.unit === 'x') return mx < 100 ? 2 : 1;
  if (m.unit === '억원') return mx < 100 ? 1 : 0;
  return mx < 10 ? 2 : mx < 100 ? 1 : 0;
}
const finN = (v, d) => vaNum(v, d).replace(/^-(0(\.0+)?)$/, '$1'); // 반올림해서 0이면 음수 부호를 뗌
const finFmt = (m, v, d) => (finOk(v) ? `${finN(m.unit === '%' ? v * 100 : v, d ?? finDec(m, [v]))}${FIN_U[m.unit] ?? (m.unit ? ` ${esc(m.unit)}` : '')}` : '-');
function finDiff(m, a, b) { // 대상 − 비교기업. 좋은 방향이 정해진 지표만 우위, 열위
  if (!finOk(a) || !finOk(b)) return '<span class="fin-df">-<em></em></span>';
  const d = a - b, dec = finDec(m, [a, b]), mag = vaNum(Math.abs(d) * (m.unit === '%' ? 100 : 1), dec);
  const u = m.unit === '%' ? '%p' : FIN_U[m.unit] ?? '';
  if (!+mag.replace(/,/g, '')) return `<span class="fin-df">${mag}${u}<em></em></span>`;
  const good = m.better === 'high' ? d > 0 : m.better === 'low' ? d < 0 : null;
  return `<span class="fin-df ${good == null ? '' : good ? 'good' : 'bad'}"><i>${d > 0 ? '▲' : '▼'}</i> ${mag}${u}<em>${good == null ? '' : good ? '우위' : '열위'}</em></span>`;
}
const finSeg = (key, opts, cur) => `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-fin-seg="${key}" data-v="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
const finName = (m) => `<span class="fin-nm" ${m.def ? `title="${esc(m.def)}"` : ''}>${esc(m.name || m.key)}</span>`;

// ---------- 사례 고르기와 정리 ----------
function finList(code) { // 그 회사의 사례, 최근 기준일 먼저. 코드를 안 주면 전체
  return (finS.data?.cases || []).filter((c) => c && (!code || c.code === code)).sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')));
}
function finCase(code) { const cs = finList(code); return cs.find((c) => c.id === finS.cid[code || '']) || cs[0] || null; }
function finPrep(c) { // 빠진 칸이 있어도 그릴 수 있게 정리
  const years = Array.isArray(c.years) ? c.years : [], n = years.length, T = c.target || {};
  const metrics = (c.metrics || []).filter((m) => m && m.key);
  const groups = (c.groups || []).filter((g) => g && g.key).map((g) => ({ key: g.key, name: g.name || g.key }));
  for (const m of metrics) if (!groups.some((g) => g.key === m.group)) groups.push({ key: m.group, name: m.group || '기타' });
  const arr = (a) => Array.from({ length: n }, (_, i) => (Array.isArray(a) && finOk(a[i]) ? a[i] : null));
  const ratio = (k) => arr(T.ratios?.[k]);
  return { years, n, Y: years[n - 1] ?? '', metrics, groups, rows: T.rows || {}, ltm: T.ltm || {}, arr, ratio, last: (k) => ratio(k)[n - 1] ?? null, peers: (c.peers || []).filter((p) => p && p.name), stat: c.peer_stat || {} };
}
const finCore = (P) => { const xs = P.metrics.filter((m) => m.core); return xs.length ? xs : P.metrics; };

// ---------- 머리 ----------
function finHead(c, P, list) {
  const pick = list.length > 1 ? `<select class="va-case" data-fin-case aria-label="재무분석 사례">${list.map((x) => `<option value="${esc(x.id)}" ${x.id === c.id ? 'selected' : ''}>${esc(x.name)} ${esc(x.day)}</option>`).join('')}</select>` : '';
  const last = (k) => P.arr(P.rows[k])[P.n - 1], nd = last('net_debt');
  const kv = [['매출', last('rev')], ['영업이익', last('op')], ['순이익', last('ni')], [finOk(nd) && nd < 0 ? '순현금' : '순차입금', finOk(nd) ? Math.abs(nd) : null]].filter(([, v]) => finOk(v));
  const span = P.n ? `${P.years[0]}～${P.Y} 결산` : '';
  const sub = [c.day ? `기준일 ${esc(c.day)}` : '', span, c.ltm ? `최근 4분기 ${esc(c.ltm)}` : '', P.peers.length ? `비교기업 ${P.peers.length}곳` : ''].filter(Boolean).join(', ');
  return `<section class="card va-head fin-head"><div class="va-ttl"><p>${sub}</p>
      <div class="va-tools">${pick}${infoBtn('valuation_fin')}</div></div>
    ${kv.length ? `<dl class="va-kv">${kv.map(([k, v]) => `<div><dt>${P.Y} ${k}</dt><dd>${vaNum(v)}억</dd></div>`).join('')}</dl>` : ''}</section>`;
}

// ---------- 1. 한눈에: 방사형 그림과 핵심 지표 표 ----------
function finRadar(c) {
  const ax = (c.radar?.axes || []).filter((a) => a && (finOk(a.target) || finOk(a.peer)));
  if (ax.length < 3) return '';
  const W = 360, H = 312, cx = 180, cy = 152, R = 96, n = ax.length;
  const ang = (i) => ((-90 + (360 / n) * i) * Math.PI) / 180;
  const pt = (i, v) => [cx + R * (Math.min(100, Math.max(0, v)) / 100) * Math.cos(ang(i)), cy + R * (Math.min(100, Math.max(0, v)) / 100) * Math.sin(ang(i))];
  const poly = (f) => ax.map((a, i) => pt(i, f(a, i)).map((x) => x.toFixed(1)).join(',')).join(' ');
  const rings = [25, 50, 75, 100].map((v) => `<polygon points="${poly(() => v)}" class="gl"/>`).join('');
  const spokes = ax.map((_, i) => { const [x, y] = pt(i, 100); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="gl"/>`; }).join('');
  const tip = (a) => `<title>${esc(a.name)}: ${esc(c.name)} ${finOk(a.target) ? vaNum(a.target) : '-'}점, 비교기업 ${finOk(a.peer) ? vaNum(a.peer) : '-'}점</title>`;
  const dia = (x, y, r = 4.5) => `M${x},${y - r}L${x + r},${y}L${x},${y + r}L${x - r},${y}Z`;
  const pe = ax.map((a, i) => { if (!finOk(a.peer)) return ''; const [x, y] = pt(i, a.peer); return `<path d="${dia(+x.toFixed(1), +y.toFixed(1))}" class="pd">${tip(a)}</path>`; }).join('');
  const me = ax.map((a, i) => { if (!finOk(a.target)) return ''; const [x, y] = pt(i, a.target); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" class="md">${tip(a)}</circle>`; }).join('');
  const labs = ax.map((a, i) => { // 축 이름과 그 아래 점수 둘(표식으로 구분)
    const co = Math.cos(ang(i)), si = Math.sin(ang(i)), x = cx + (R + 14) * co, y = cy + (R + 14) * si;
    const anc = Math.abs(co) < 0.3 ? 'middle' : co > 0 ? 'start' : 'end', bw = 72, x0 = anc === 'middle' ? -bw / 2 : anc === 'start' ? 0 : -bw;
    const y0 = si < -0.3 ? -24 : si > 0.3 ? 14 : -4;
    return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><text y="${y0}" class="an" text-anchor="${anc}">${esc(a.name)}</text>
      <circle cx="${x0 + 5}" cy="${y0 + 14}" r="4" class="md k"/><text x="${x0 + 13}" y="${y0 + 18.5}" class="sv">${finOk(a.target) ? vaNum(a.target) : '-'}</text>
      <path d="${dia(x0 + 45, y0 + 14, 4)}" class="pd k"/><text x="${x0 + 53}" y="${y0 + 18.5}" class="sv p">${finOk(a.peer) ? vaNum(a.peer) : '-'}</text></g>`;
  }).join('');
  const aria = `${c.name}과 비교기업 묶음별 점수. ${ax.map((a) => `${a.name} ${finOk(a.target) ? vaNum(a.target) : '-'}점 대 ${finOk(a.peer) ? vaNum(a.peer) : '-'}점`).join(', ')}`;
  return `<figure class="fin-rd"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">${rings}${spokes}
      <polygon points="${poly((a) => (finOk(a.peer) ? a.peer : 0))}" class="pp"/><polygon points="${poly((a) => (finOk(a.target) ? a.target : 0))}" class="mp"/>${pe}${me}${labs}</svg>
    <figcaption class="fin-leg"><span><i class="me"></i>${esc(c.name)}</span><span><i class="pe"></i>비교기업</span><span class="yr" ${c.radar?.method ? `title="${esc(c.radar.method)}"` : ''}>100점 만점</span></figcaption></figure>`;
}

function finGlance(c, P) {
  const stat = finS.stat === 'med' ? 'med' : 'avg', SL = stat === 'med' ? '중앙값' : '평균', core = finCore(P), cut = {};
  const body = P.groups.map((g) => {
    const ms = core.filter((m) => m.group === g.key);
    if (!ms.length) return '';
    return `<tr class="grp"><td colspan="4">${esc(g.name)}</td></tr>${ms.map((m) => {
      const t = P.last(m.key), st = P.stat[m.key] || {}, pv = st[stat], ex = stat === 'avg' ? (st.excluded || []).filter(Boolean) : [], dec = finDec(m, [t, pv]);
      const rank = finOk(st.target_rank) && finOk(st.of) ? `${st.of}곳 가운데 ${st.target_rank}위` : '';
      for (const nm of ex) (cut[nm] ||= []).push(m.name || m.key);
      return `<tr><td class="st">${finName(m)}</td><td class="strong" ${rank ? `title="${rank}"` : ''}>${finFmt(m, t, dec)}</td><td ${finOk(st.n) ? `title="${st.n}곳 ${SL}${ex.length ? `, 뺀 회사 ${esc(ex.join(', '))}` : ''}"` : ''}>${finFmt(m, pv, dec)}${ex.length && finOk(pv) ? '<sup>*</sup>' : ''}</td><td>${finDiff(m, t, pv)}</td></tr>`;
    }).join('')}`;
  }).join('');
  if (!body) return '';
  const fn = Object.keys(cut).length ? `<p class="va-note fin-fn"><b>*</b>극단값이라 평균에서 뺀 회사${Object.entries(cut).map(([nm, ms]) => `<span><b>${esc(nm)}</b>${esc(ms.join(', '))}</span>`).join('')}</p>` : '';
  const tbl = `<div class="fin-gt"><div class="mk-scroll"><table class="mk-tbl fin-t fin-g4"><thead><tr><th class="st">지표</th><th>${esc(c.name)}<small>${P.Y} 결산</small></th><th>비교기업 ${SL}<small>최근 결산</small></th><th>차이</th></tr></thead><tbody>${body}</tbody></table></div>${fn}</div>`;
  const rd = finRadar(c);
  return vaSec('비교기업 대비', P.peers.length ? finSeg('stat', [['avg', '평균'], ['med', '중앙값']], stat) : '', `<div class="fin-gl ${rd ? '' : 'solo'}">${rd}${tbl}</div>`);
}

// ---------- 2. 눈여겨볼 점 ----------
function finPoints(c, P) {
  const pts = (c.points || []).filter((p) => p && p.text);
  if (!pts.length) return '';
  const gs = [...P.groups];
  for (const p of pts) if (!gs.some((g) => g.key === p.group)) gs.push({ key: p.group, name: p.group || '기타' });
  const lv = (p) => (FIN_LV[p.level] ? p.level : 'info');
  const body = gs.map((g) => {
    const xs = pts.filter((p) => p.group === g.key);
    return xs.length ? `<div class="fin-pg"><h3>${esc(g.name)}</h3><ul>${xs.map((p) => `<li><span class="fin-lv ${lv(p)}">${ico(FIN_LV[lv(p)][1], 'sm')}${FIN_LV[lv(p)][0]}</span><p>${esc(p.text)}</p></li>`).join('')}</ul></div>` : '';
  }).join('');
  const cnt = Object.keys(FIN_LV).map((k) => [FIN_LV[k][0], pts.filter((p) => lv(p) === k).length]).filter(([, n]) => n).map(([l, n]) => `${l} ${n}`).join(', ');
  return vaSec('눈여겨볼 점', `<span class="meta">${cnt}</span>`, `<div class="fin-pts">${body}</div>`);
}

// ---------- 3. 추세: 핵심 그림과 묶음별 지표 × 연도 표 ----------
function finNice(x) { // x 이상인 1, 2, 2.5, 5 × 10^k
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x)), f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function finScale(vals, zero) { // 눈금 3～5개로 떨어지는 축. 간격 후보 가운데 빈 자리가 가장 적은 것
  const xs = vals.filter(finOk);
  if (!xs.length) return null;
  let a = Math.min(...xs), b = Math.max(...xs);
  if (zero) { a = Math.min(0, a); b = Math.max(0, b); }
  let lo, hi, step;
  for (const k of [2, 3, 4]) {
    const st = finNice((b - a || Math.abs(b) || 1) / k), l = Math.floor(a / st + 1e-9) * st, h = Math.max(Math.ceil(b / st - 1e-9) * st, l + st);
    if (step == null || h - l < hi - lo - st / 1e6) { lo = l; hi = h; step = st; }
  }
  const ticks = [];
  for (let t = lo; t <= hi + step / 1e6; t += step) ticks.push(+t.toPrecision(12));
  return { lo, hi, step, ticks, P: (v) => ((v - lo) / (hi - lo)) * 100 };
}
function finChart(kind, title, unit, P, series) { // kind: cols(막대, 0에서 시작) | lines(선). series: [{name, vals, fmt}]
  series = series.filter((s) => s.vals.some(finOk)).slice(0, 3);
  if (!series.length || !P.n) return '';
  const sc = finScale(series.flatMap((s) => s.vals), kind === 'cols');
  const tk = (t) => (unit === '%' ? `${vaNum(t, sc.step < 1 ? 1 : 0)}%` : vaNum(t, sc.step < 1 ? 1 : 0));
  const grid = sc.ticks.map((t) => `<i class="gl ${t === 0 && sc.lo < 0 ? 'z' : ''}" style="bottom:${sc.P(t).toFixed(2)}%"><span>${tk(t)}</span></i>`).join('');
  const tipOf = (i) => esc([`${P.years[i]}`, ...series.map((s) => `${s.name} ${s.fmt(s.vals[i])}`)].join('|'));
  const z = sc.P(0);
  const bands = P.years.map((_, i) => `<div class="bd" data-tip="${tipOf(i)}">${kind === 'cols' ? series.map((s, k) => {
    const v = s.vals[i];
    if (!finOk(v)) return '<span class="b"></span>';
    const p = sc.P(v);
    return `<span class="b"><i class="s${k + 1} ${v < 0 ? 'neg' : ''}" style="bottom:${Math.min(z, p).toFixed(2)}%;height:${Math.abs(p - z).toFixed(2)}%"></i></span>`;
  }).join('') : ''}</div>`).join('');
  let over = '';
  if (kind === 'lines') {
    const X = (i) => ((i + 0.5) / P.n) * 100;
    const paths = series.map((s, k) => {
      let d = '', pen = false;
      s.vals.forEach((v, i) => { if (!finOk(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(2)},${(100 - sc.P(v)).toFixed(2)}`; pen = true; });
      return `<path d="${d}" class="s${k + 1}"/>`;
    }).join('');
    const dots = series.map((s, k) => s.vals.map((v, i) => (finOk(v) ? `<i class="pt s${k + 1}" style="left:${X(i).toFixed(2)}%;bottom:${sc.P(v).toFixed(2)}%"></i>` : '')).join('')).join('');
    over = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>${dots}`;
  }
  const li = P.n - 1;
  const leg = `<div class="fin-leg"><span class="yr">${esc(P.Y)}년</span>${series.map((s, k) => `<span><i class="s${k + 1} ${kind === 'lines' ? 'ln' : ''}"></i>${esc(s.name)} <b>${s.fmt(s.vals[li])}</b></span>`).join('')}</div>`;
  const aria = `${title} ${P.years[0]}～${P.Y}. ${series.map((s) => `${s.name} ${s.vals.map((v) => s.fmt(v)).join(', ')}`).join('. ')}`;
  return `<figure class="fin-ch ${kind}" role="img" aria-label="${esc(aria)}"><figcaption><b>${esc(title)}</b>${unit ? `<small>${esc(unit)}</small>` : ''}</figcaption>
    <div class="plot">${grid}${over}<div class="bds">${bands}</div></div><div class="xl">${P.years.map((y) => `<span>${esc(y)}</span>`).join('')}</div>${leg}</figure>`;
}
function finTrendCharts(c, P) {
  const won = (v) => (finOk(v) ? `${vaNum(v)}억` : '-'), row = (k, name) => ({ name, vals: P.arr(P.rows[k]), fmt: won });
  // 선 그림: 수익성 묶음(없으면 % 지표가 있는 첫 묶음)의 % 지표, 핵심 지표 먼저 셋까지
  const pct = (g) => P.metrics.filter((m) => m.group === g.key && m.unit === '%' && P.ratio(m.key).filter(finOk).length > 1).sort((a, b) => !!b.core - !!a.core).slice(0, 3);
  const lg = [P.groups.find((g) => g.key === 'profit'), ...P.groups].filter(Boolean).find((g) => pct(g).length);
  const lines = lg ? pct(lg).map((m) => ({ name: m.name || m.key, vals: P.ratio(m.key).map((v) => (finOk(v) ? v * 100 : null)), fmt: (v) => (finOk(v) ? `${vaNum(v, 1)}%` : '-') })) : [];
  const html = finChart('cols', '매출과 이익', c.unit || '억원', P, [row('rev', '매출'), row('op', '영업이익'), row('ni', '순이익')])
    + (lg ? finChart('lines', lg.name, '%', P, lines) : '')
    + finChart('cols', '현금흐름', c.unit || '억원', P, [row('cfo', '영업현금흐름'), row('capex', 'CAPEX'), row('fcf', 'FCF')])
    + finChart('cols', '현금과 차입금', c.unit || '억원', P, [row('cash', '현금'), row('debt', '차입금'), row('net_debt', '순차입금')]);
  return html ? `<div class="fin-chs">${html}</div>` : '';
}
function finTrend(c, P) {
  const yh = `${P.years.map((y) => `<th>${esc(y)}</th>`).join('')}${c.ltm ? `<th class="bl">최근 4분기<small>${esc(c.ltm)}</small></th>` : ''}`;
  const tbls = P.groups.map((g) => {
    const ms = P.metrics.filter((m) => m.group === g.key);
    if (!ms.length) return '';
    const rows = ms.map((m) => {
      const vs = P.ratio(m.key), lv = P.ltm[m.key], dec = finDec(m, [...vs, lv]);
      return `<tr class="${m.core ? 'core' : ''}"><td class="st">${finName(m)}</td>${vs.map((v) => `<td>${finFmt(m, v, dec)}</td>`).join('')}${c.ltm ? `<td class="bl">${finFmt(m, lv, dec)}</td>` : ''}</tr>`;
    }).join('');
    return `<details class="fin-grp" data-fin-grp="${esc(g.key)}" ${finS.shut[g.key] ? '' : 'open'}><summary>${esc(g.name)}</summary>
      <div class="mk-scroll"><table class="mk-tbl fin-t fin-yt ${c.ltm ? 'ltm' : ''}"><thead><tr><th class="st">지표</th>${yh}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
  }).join('');
  const body = finTrendCharts(c, P) + tbls + finDupont(c);
  return body ? vaSec('5년 추세', `<span class="meta">${P.n ? `${P.years[0]}～${P.Y} 결산` : ''}</span>`, body) : '';
}

function finDupont(c) { // ROE 분해(사례에 dupont 가 있을 때만): 순이익률 × 총자산회전율 × 재무레버리지
  const d = c.dupont;
  if (!d || !Array.isArray(d.roe) || !Array.isArray(d.years)) return '';
  const L = [['margin', '순이익률', '%'], ['turnover', '총자산회전율', 'x'], ['leverage', '재무레버리지', 'x'], ['roe', 'ROE', '%']];
  const pe = d.peer && typeof d.peer === 'object' ? d.peer : null;
  const rows = L.filter(([k]) => Array.isArray(d[k])).map(([k, name, unit]) => {
    const m = { unit }, vs = d.years.map((_, i) => (finOk(d[k][i]) ? d[k][i] : null)), dec = finDec(m, [...vs, pe?.[k]]);
    return `<tr class="${k === 'roe' ? 'core' : ''}"><td class="st">${name}</td>${vs.map((v) => `<td>${finFmt(m, v, dec)}</td>`).join('')}${pe ? `<td class="bl">${finFmt(m, pe[k], dec)}</td>` : ''}</tr>`;
  }).join('');
  return `<details class="fin-grp" data-fin-grp="_dupont" ${finS.shut._dupont ? '' : 'open'}><summary><span class="fin-nm" ${d.def ? `title="${esc(d.def)}"` : ''}>ROE 분해</span></summary>
    <div class="mk-scroll"><table class="mk-tbl fin-t fin-yt ${pe ? 'ltm' : ''}"><thead><tr><th class="st">항목</th>${d.years.map((y) => `<th>${esc(y)}</th>`).join('')}${pe ? '<th class="bl">비교기업</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

// ---------- 4. 비교기업과 나란히 ----------
function finMet(c, P) { // 막대로 볼 지표. 고른 값이 없으면 비교기업 값이 있는 첫 핵심 지표
  const has = (m) => P.peers.some((p) => finOk(p.ratios?.[m.key]));
  return P.metrics.find((m) => m.key === finS.met[c.id]) || finCore(P).find(has) || P.metrics.find(has) || P.metrics[0] || null;
}
function finPeerBars(c, P) {
  const m = finMet(c, P);
  if (!m) return '<div class="empty">비교할 지표가 없습니다.</div>';
  const st = P.stat[m.key] || {}, cut = new Set(st.excluded || []), tv = P.last(m.key);
  const ps = P.peers.map((p) => ({ name: p.name, v: finOk(p.ratios?.[m.key]) ? p.ratios[m.key] : null, cut: cut.has(p.name), out: p.in_stat === false, sub: [p.kind && p.kind !== '국내' ? p.kind : '', p.year && p.year !== P.Y ? `${p.year}` : '', p.in_stat === false ? '평균에 안 넣음' : ''].filter(Boolean).join(', ') }))
    .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  const all = [{ name: c.name, v: tv, me: true, sub: '대상' }, ...ps];
  const base = [tv, st.avg, st.med, ...ps.filter((x) => !x.cut && !x.out).map((x) => x.v)].filter(finOk);
  if (!base.length) return '<div class="empty">이 지표는 값이 있는 회사가 없습니다.</div>';
  const dec = finDec(m, base);
  let lo = Math.min(0, ...base), hi = Math.max(0, ...base);
  const pad = (hi - lo || 1) * 0.04; hi += hi > 0 ? pad : 0; lo -= lo < 0 ? pad : 0;
  if (hi === lo) hi = lo + 1;
  const X = (v) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100, z = X(0);
  const mark = (v, cls) => (finOk(v) ? `<b class="${cls}" style="left:${X(v).toFixed(2)}%"></b>` : '');
  // 평균선과 중앙값선 머리에 이름과 값. 둘이 붙어 있어도 겹치지 않게 큰 쪽은 선 오른쪽, 작은 쪽은 선 왼쪽에 붙임
  const ml = [['avg', '평균', st.avg], ['med', '중앙값', st.med]].filter(([, , v]) => finOk(v));
  const side = (k, v) => (ml.length < 2 ? (X(v) > 60 ? 'l' : 'r') : (k === 'avg' ? st.avg >= st.med : st.med > st.avg) ? 'r' : 'l');
  const head = ml.length ? `<div class="fin-pb fin-pbh" aria-hidden="true"><span></span><div>${ml.map(([k, nm, v]) => `${mark(v, k)}<small class="${k} ${side(k, v)}" ${k === 'avg' && finOk(st.n) ? `title="평균에 넣은 회사 ${st.n}곳"` : ''} style="left:${X(v).toFixed(2)}%">${nm} <strong>${finFmt(m, v, dec)}</strong></small>`).join('')}</div><em></em></div>` : '';
  const rows = all.map((x) => {
    const p = finOk(x.v) ? X(x.v) : z, over = finOk(x.v) && (x.v > hi || x.v < lo);
    return `<div class="fin-pb ${x.me ? 'me' : ''} ${x.cut || x.out ? 'cut' : ''}" data-tip="${esc(`${x.name}|${m.name || m.key} ${finFmt(m, x.v, dec)}${x.cut ? '|평균에서 뺌' : ''}`)}"><span>${esc(x.name)}${x.cut ? '<sup>*</sup>' : ''}${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span>
      <div>${lo < 0 ? `<u style="left:${z.toFixed(2)}%"></u>` : ''}${finOk(x.v) ? `<i class="${x.v < 0 ? 'neg' : ''} ${over ? 'over' : ''}" style="left:${Math.min(z, p).toFixed(2)}%;width:${Math.abs(p - z).toFixed(2)}%"></i>` : ''}${mark(st.avg, 'avg')}${mark(st.med, 'med')}</div><em>${finFmt(m, x.v, dec)}</em></div>`;
  }).join('');
  const leg = cut.size ? '<div class="fin-leg fin-pleg"><span class="yr"><sup>*</sup>평균에서 뺀 회사</span></div>' : '';
  return `<div class="fin-pbs" role="img" aria-label="${esc(`${m.name || m.key} 회사별 값. ${all.map((x) => `${x.name} ${finFmt(m, x.v, dec)}`).join(', ')}${ml.length ? `. ${ml.map(([, nm, v]) => `${nm} ${finFmt(m, v, dec)}`).join(', ')}` : ''}`)}">${head}${rows}</div>${leg}`;
}
function finPeerTable(c, P) { // 회사 × 핵심 지표
  const core = finCore(P), gs = P.groups.map((g) => ({ g, ms: core.filter((m) => m.group === g.key) })).filter((x) => x.ms.length), ms = gs.flatMap((x) => x.ms);
  if (!ms.length) return '';
  const first = new Set(gs.map((x) => x.ms[0].key)), bl = (m) => (first.has(m.key) ? 'bl' : '');
  const col = (m) => [P.last(m.key), ...P.peers.map((p) => p.ratios?.[m.key]), P.stat[m.key]?.avg, P.stat[m.key]?.med];
  const dec = Object.fromEntries(ms.map((m) => [m.key, finDec(m, col(m))]));
  const line = (cls, name, sub, f) => `<tr class="${cls}"><td class="st"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</td>${ms.map((m) => `<td class="${bl(m)}">${f(m)}</td>`).join('')}</tr>`;
  const peers = [...P.peers].sort((a, b) => (a.kind === '국내' ? 0 : 1) - (b.kind === '국내' ? 0 : 1));
  const body = line('tgt', c.name, `대상, ${P.Y}`, (m) => finFmt(m, P.last(m.key), dec[m.key]))
    + peers.map((p) => line('', p.name, [p.kind, p.year, p.in_stat === false ? '평균에 안 넣음' : ''].filter(Boolean).join(', '), (m) => { const v = p.ratios?.[m.key], ex = (P.stat[m.key]?.excluded || []).includes(p.name); return ex && finOk(v) ? `<span class="cut" title="평균에서 뺌">${finFmt(m, v, dec[m.key])}<sup>*</sup></span>` : finFmt(m, v, dec[m.key]); })).join('')
    + line('stat', '평균', '', (m) => finFmt(m, P.stat[m.key]?.avg, dec[m.key])) + line('stat', '중앙값', '', (m) => finFmt(m, P.stat[m.key]?.med, dec[m.key]));
  return `<h3 class="va-h3">회사별 핵심 지표</h3><div class="mk-scroll"><table class="mk-tbl fin-t fin-ct"><thead>
    <tr><th class="st" rowspan="2">회사</th>${gs.map((x) => `<th class="bl gh" colspan="${x.ms.length}">${esc(x.g.name)}</th>`).join('')}</tr>
    <tr>${ms.map((m) => `<th class="${bl(m)}">${finName(m)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function finPeers(c, P) {
  if (!P.peers.length) return '';
  const cur = finMet(c, P);
  const sel = `<select class="va-case" data-fin-met aria-label="막대로 볼 지표">${P.groups.map((g) => { const ms = P.metrics.filter((m) => m.group === g.key); return ms.length ? `<optgroup label="${esc(g.name)}">${ms.map((m) => `<option value="${esc(m.key)}" ${cur && m.key === cur.key ? 'selected' : ''}>${esc(m.name || m.key)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>`;
  return vaSec('비교기업과 나란히', sel, `<div data-fin-pb>${finPeerBars(c, P)}</div>${finPeerTable(c, P)}`);
}

// ---------- 5. 주요 계정 ----------
function finAccounts(c, P) {
  const known = new Set(FIN_ROWS.flatMap(([, xs]) => xs.map(([k]) => k)));
  const rest = Object.keys(P.rows).filter((k) => !known.has(k)).map((k) => [k, c.row_names?.[k] || k]);
  const lt = c.ltm && c.target?.ltm_rows && typeof c.target.ltm_rows === 'object' ? c.target.ltm_rows : null;
  const body = [...FIN_ROWS, ...(rest.length ? [['기타', rest]] : [])].map(([g, xs]) => {
    const rs = xs.filter(([k]) => Array.isArray(P.rows[k]));
    return rs.length ? `<tr class="grp"><td colspan="${P.n + 1 + (lt ? 1 : 0)}">${g}</td></tr>${rs.map(([k, name]) => `<tr class="${FIN_KEY.has(k) ? 'core' : ''}"><td class="st">${esc(name)}</td>${P.arr(P.rows[k]).map((v) => `<td>${vaNum(v)}</td>`).join('')}${lt ? `<td class="bl">${vaNum(lt[k])}</td>` : ''}</tr>`).join('')}` : '';
  }).join('');
  if (!body || !P.n) return '';
  return vaSec('주요 계정', `<span class="meta">${esc(c.unit || '억원')}</span>`, `<div class="mk-scroll"><table class="mk-tbl fin-t fin-yt ${lt ? 'ltm' : ''}"><thead><tr><th class="st">계정</th>${P.years.map((y) => `<th>${esc(y)}</th>`).join('')}${lt ? `<th class="bl">최근 4분기<small>${esc(c.ltm)}</small></th>` : ''}</tr></thead><tbody>${body}</tbody></table></div>`);
}

// ---------- 화면 설명: 지표 정의와 점수 계산법, 출처는 사례에서 가져와 채움 ----------
const FIN_INFO = [
  ['이 화면', '재무 추정에 들어가기 전에 대상 회사의 5년 재무 흐름과 비교기업 대비 위치를 먼저 봅니다. 숫자는 리서치 사례에서 계산해 올린 값 그대로이고, 이 화면에서 따로 계산하는 것은 대상 회사와 비교기업의 차이뿐입니다.'],
  ['읽는 법', ['비교기업 대비: 대상 회사는 가장 최근 결산 연도 값, 비교기업은 회사별 최근 결산 값의 평균이나 중앙값', '차이: 대상 회사 값에서 비교기업 값을 뺀 값. 비율은 %p, 배수는 배, 일수는 일. 높을수록 좋은 지표와 낮을수록 좋은 지표를 가려 우위와 열위를 붙이고, 방향을 정하지 않은 지표는 차이만 표시',
    '* 표시: 극단값인 회사를 빼고 평균을 낸 지표. 중앙값에는 넣음. 뺀 회사는 표 아래와 회사별 막대, 회사별 표에 표시', '순위: 비교기업 대비 표의 대상 회사 값에 마우스를 올리면 대상과 비교기업을 합친 표본 안 순위가 나옴. 좋은 쪽이 1위', '방사형 그림: 묶음별 점수 0～100점. 축 이름 아래 동그라미 옆 숫자가 대상 회사, 마름모 옆 숫자가 비교기업',
    '5년 추세: 막대와 선은 결산 연도 기준. 표의 최근 4분기 열은 사례에 값이 있을 때만 나옴. 굵은 지표가 핵심 지표',
    '비교기업과 나란히: 지표를 고르면 회사별 막대가 바뀜. 실선은 평균, 점선은 중앙값, 흐린 막대는 평균에서 뺀 회사이고 끝이 옅어지는 막대는 칸을 넘는 값', '비율은 %, 배수는 배, 금액은 억원. 값이 없으면 -']],
];
TAB_INFO.valuation_fin = { title: '재무분석', rows: FIN_INFO };
function finInfo(c, P) {
  const rows = [...FIN_INFO];
  if (c.radar?.method) rows.push(['방사형 점수 계산', c.radar.method]);
  if (c.outlier_rule) rows.push(['극단값 기준', c.outlier_rule]);
  if (c.dupont?.def) rows.push(['ROE 분해', c.dupont.def]);
  if (P.metrics.length) rows.push(['지표 정의', { table: [['지표', '묶음', '정의', '좋은 방향'], ...P.metrics.map((m) => [m.name || m.key, P.groups.find((g) => g.key === m.group)?.name || '', m.def || '', m.better === 'high' ? '높을수록' : m.better === 'low' ? '낮을수록' : '-'])] }]);
  const src = [...(c.notes || []), ...(c.source ? [c.source] : [])].filter(Boolean);
  if (src.length) rows.push(['출처와 한계', src]);
  TAB_INFO.valuation_fin = { title: '재무분석', asof: `${c.name}${c.day ? `, 기준일 ${c.day}` : ''}`, rows };
}

// ---------- 그리기 ----------
function finDraw(root, code) {
  const box = (t) => `<div class="card"><div class="empty">${t}</div></div>`;
  if (finS.err) { root.innerHTML = box(esc(finS.err)); return; }
  const list = finList(code), c = finCase(code);
  if (!c) { root.innerHTML = box(finS.data?.cases?.length && code ? '이 회사는 아직 재무분석이 없습니다.' : '아직 올라온 재무분석이 없습니다.'); return; }
  const P = finPrep(c);
  finInfo(c, P);
  root.innerHTML = finHead(c, P, list) + finGlance(c, P) + finPoints(c, P) + finTrend(c, P) + finPeers(c, P) + finAccounts(c, P);
}

function finTip() { // 값 풍선 하나를 body 에 두고 같이 씀(.fin 이 container 라 안에 두면 fixed 기준이 바뀜)
  let tip = document.getElementById('fin-tip');
  if (!tip) { tip = document.createElement('div'); tip.id = 'fin-tip'; tip.className = 'fin-tip'; tip.hidden = true; document.body.appendChild(tip); window.addEventListener('hashchange', () => { tip.hidden = true; }); }
  return tip;
}
function finBind(root, code) {
  root.addEventListener('click', (e) => {
    const sg = e.target.closest('[data-fin-seg="stat"]');
    if (sg) { finS.stat = sg.dataset.v; finSave(); finDraw(root, code); root.querySelector('[data-fin-seg="stat"].on')?.focus(); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-fin-case]')) { finS.cid[code || ''] = t.value; finSave(); finDraw(root, code); return; }
    if (t.matches('[data-fin-met]')) { // 막대만 다시 그림(고르는 칸의 초점 유지)
      const c = finCase(code), w = root.querySelector('[data-fin-pb]');
      if (c && w) { finS.met[c.id] = t.value; finSave(); w.innerHTML = finPeerBars(c, finPrep(c)); }
    }
  });
  root.addEventListener('toggle', (e) => { const d = e.target; if (d.matches?.('[data-fin-grp]')) { finS.shut[d.dataset.finGrp] = !d.open; finSave(); } }, true);
  const tipAt = (e) => { // 그림 위 값 풍선
    const tip = finTip(), t = e.target.closest?.('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    if (tip._for !== t) { tip.innerHTML = t.dataset.tip.split('|').map((s, i) => (i ? `<span>${esc(s)}</span>` : `<b>${esc(s)}</b>`)).join(''); tip._for = t; }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(e.clientX + 12, innerWidth - w - 8))}px`;
    tip.style.top = `${e.clientY + 16 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 16}px`;
  };
  root.addEventListener('pointermove', tipAt);
  root.addEventListener('pointerdown', tipAt);
  root.addEventListener('pointerleave', () => { finTip().hidden = true; });
}

// 가치평가 화면의 재무분석 탭이 부름: renderFin($('#va-host'), 종목코드). 코드를 안 주면 가장 최근 사례
async function renderFin(host, code) {
  if (!host) return;
  host.innerHTML = '<div class="fin"><div class="card"><div class="empty">불러오는 중…</div></div></div>';
  const root = host.firstElementChild;
  finBind(root, code);
  await finLoad();
  if (!root.isConnected) return; // 읽는 사이 다른 탭으로 넘어감
  finDraw(root, code);
}
