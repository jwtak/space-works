/* 투자업무 › 시장동향 — 손PB 시장 동향 화면(MarketTrendScreen.jsx)을 웍스용으로 옮긴 것 + 공모주 통계.
   데이터: OneDrive data/market.json(00. 대시보드\market\collect_market.py, 평일 07:20), data/ipo_stats.json(같은 폴더 ipo_stats.py).
   탭: #market = 시장 지표, #market/ipo = 공모주 통계, #market/pe = PE 동향(딜레이더 yesim·bids.json 집계 + 공표 통계). 차트는 인라인 SVG(라이브러리 없음).
   국내 관행대로 상승은 빨강, 하락은 파랑. */
const MK_TTL = 600000;
const mkS = { market: null, ipo: null, yesim: null, bids: null, at: 0, loading: null, tab: 'market', dd: 10, rate: 3, stock: 'KOSPI', sector: 'us', more: false, ipoMk: 'ALL', ipoQ: '', ipoAll: false, ipoVal: null, valQ: '', valAll: false, mezz: null };

function mkLoad(force) {
  if (!force && mkS.at && Date.now() - mkS.at < MK_TTL) return Promise.resolve();
  const read = async (rel) => { try { const r = await STORE.readText(rel); return r.text ? JSON.parse(r.text) : null; } catch { return null; } };
  mkS.loading ||= Promise.all([read('data/market.json'), read('data/ipo_stats.json'), read('data/yesim.json'), read('data/bids.json'), read('data/ipo_val.json'), read('data/mezz.json')])
    .then(([m, i, y, b, v, z]) => { mkS.market = m; mkS.ipo = i; mkS.yesim = y; mkS.bids = b; mkS.ipoVal = v; mkS.mezz = z; mkS.at = Date.now(); })
    .finally(() => { mkS.loading = null; });
  return mkS.loading;
}

// ---------- 포맷 ----------
const mkNum = (n, d = 2) => (n == null || Number.isNaN(+n) ? '-' : Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const mkCls = (v) => (v == null ? '' : v > 0 ? 'up' : v < 0 ? 'dn' : '');
const mkSigned = (v, d = 2) => (v == null ? '-' : `${v > 0 ? '+' : ''}${mkNum(v, d)}%`);
const mkPct = (v, d = 1) => `<span class="${mkCls(v)}">${mkSigned(v, d)}</span>`;
const mkWon = (v) => { if (v == null) return '-'; const a = Math.abs(v); return a >= 1e12 ? `${mkNum(v / 1e12, 1)}조` : a >= 1e8 ? `${mkNum(v / 1e8, 0)}억` : mkNum(v, 0); };
const mkUsd = (v) => (v == null ? '-' : v >= 1e12 ? `$${mkNum(v / 1e12, 2)}T` : v >= 1e9 ? `$${mkNum(v / 1e9, 0)}B` : `$${mkNum(v, 0)}`);
const mkDays = (d) => { if (d == null) return '-'; if (d < 60) return `${d}일`; const y = Math.floor(d / 365), m = Math.round((d % 365) / 30); return y === 0 ? `${Math.round(d / 30)}개월` : m > 0 ? `${y}년 ${m}개월` : `${y}년`; };
const mkRet = (r) => (r ? `${mkPct(r.total, 2)}${r.annualized != null ? `<small>연 ${mkSigned(r.annualized)}</small>` : ''}` : '<span class="mk-dim">-</span>');
const MK_SHORT = [['1m', '1개월'], ['3m', '3개월'], ['6m', '6개월']];
const MK_LONG = [['1y', '1년'], ['3y', '3년'], ['5y', '5년'], ['10y', '10년'], ['20y', '20년']];
const mkSeg = (key, opts, cur) => `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-mk-seg="${key}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const mkSec = (title, right, body, cls = '') => `<section class="card mk-sec ${cls}"><div class="card-head"><h2>${title}</h2>${right || ''}</div><div class="mk-body">${body}</div></section>`;

// ---------- 시계열: 수집기는 {start, freq: M|W|D, values}만 보낸다 ----------
const MK_DAY = 86400000;
function mkTimes(s) {
  const n = s.values.length;
  if (s.freq === 'M') { const [y, m] = s.start.split('-').map(Number); return Array.from({ length: n }, (_, i) => Date.UTC(y + Math.floor((m - 1 + i) / 12), (m - 1 + i) % 12, 1)); }
  const t0 = Date.parse(`${s.start}T00:00:00Z`), step = s.freq === 'W' ? 7 * MK_DAY : MK_DAY;
  return Array.from({ length: n }, (_, i) => t0 + i * step);
}
function mkWindow(s, years) {
  if (!s?.values?.length) return [];
  const ts = mkTimes(s), from = years ? ts[ts.length - 1] - years * 365.25 * MK_DAY : -Infinity;
  return ts.map((t, i) => ({ t, v: s.values[i] })).filter((p) => p.t >= from && p.v != null);
}
const mkNice = (raw) => { const p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
function mkTicks(t0, t1) {
  const span = (t1 - t0) / (365.25 * MK_DAY), out = [];
  if (span >= 3) {
    const st = Math.max(1, Math.ceil(span / 5));
    for (let y = Math.ceil((new Date(t0).getUTCFullYear() + 1) / st) * st; Date.UTC(y, 0, 1) < t1; y += st) out.push({ t: Date.UTC(y, 0, 1), l: String(y) });
  } else {
    const st = Math.max(1, Math.ceil((span * 12) / 6)); let y = new Date(t0).getUTCFullYear(), m = new Date(t0).getUTCMonth() + 1;
    for (let g = 0; g < 60; g++) { const t = Date.UTC(y, m, 1); if (t >= t1) break; if (t > t0 && m % st === 0) out.push({ t, l: `${String(y).slice(2)}.${pad(m + 1)}` }); m += 1; if (m >= 12) { m = 0; y += 1; } }
  }
  return out;
}
const mkDate = (t, day = true) => { const d = new Date(t); return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}${day ? `.${pad(d.getUTCDate())}` : ''}`; };

/* series: [{name, color, freq, data:[{t,v}]}], mode 'line' | 'area'(낙폭: 0이 수면). 그린 뒤 마우스를 올리면 그 시점 값이 뜬다 */
const MK_CHARTS = [];
function mkChart(series, { mode = 'line', h = 160, fmt = (v) => mkNum(v, 2), marker } = {}) {
  const all = series.flatMap((s) => s.data); if (!all.length) return '';
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
  let lo, hi, step;
  if (mode === 'area') { const r = Math.abs(Math.min(...all.map((p) => p.v), -5)); step = r <= 25 ? 5 : r <= 50 ? 10 : 20; lo = -Math.ceil(r / step) * step; hi = 0; }
  else { const a = Math.min(...all.map((p) => p.v)), b = Math.max(...all.map((p) => p.v)), padv = (b - a || Math.abs(b) || 1) * 0.08; step = mkNice((b - a + 2 * padv) / 4); lo = Math.floor((a - padv) / step) * step; hi = Math.ceil((b + padv) / step) * step; }
  const W = 1000, H = 100, x = (t) => ((t - t0) / (t1 - t0 || 1)) * W, y = (v) => ((hi - v) / (hi - lo || 1)) * H;
  const grid = []; for (let g = hi; g >= lo - 1e-9; g -= step) grid.push(+g.toFixed(6));
  const id = MK_CHARTS.push({ series, t0, t1, fmt }) - 1;
  const pts = (d) => d.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`);
  const lines = series.map((s) => (mode === 'area'
    ? `<path d="M${x(s.data[0].t).toFixed(1)},${y(0)} L${pts(s.data).join(' L')} L${x(s.data[s.data.length - 1].t).toFixed(1)},${y(0)} Z" class="mk-area"/>`
    : `<polyline points="${pts(s.data).join(' ')}" fill="none" stroke="${s.color}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`)).join('');
  const gl = grid.map((g) => `<line x1="0" x2="${W}" y1="${y(g)}" y2="${y(g)}" class="${g === 0 && mode === 'area' ? 'z' : ''}" vector-effect="non-scaling-stroke"/>`).join('');
  const ylab = grid.map((g) => `<span class="yl" style="top:${(y(g) / H) * 100}%">${esc(fmt(g))}</span>`).join('');
  const dots = series.map((s) => { const l = s.data[s.data.length - 1]; return `<i class="dot" style="left:${(x(l.t) / W) * 100}%;top:${(y(l.v) / H) * 100}%;background:${s.color}"></i>`; }).join('');
  const mk = marker && marker.t >= t0 && marker.t <= t1 ? `<div class="mk-mark" style="left:${(x(marker.t) / W) * 100}%"><span class="${x(marker.t) / W > 0.65 ? 'r' : ''}">${esc(marker.label)}</span></div>` : '';
  const xt = mkTicks(t0, t1).map((k) => `<span style="left:${(x(k.t) / W) * 100}%">${k.l}</span>`).join('');
  return `<div class="mk-chart" data-chart="${id}"><div class="plot" style="height:${h}px"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${gl}${lines}</svg>${ylab}${mk}${dots}<div class="hv" hidden></div><div class="tip" hidden></div></div><div class="xt">${xt}</div></div>`;
}
function mkChartHover(root) {
  root.querySelectorAll('.mk-chart').forEach((el) => {
    const c = MK_CHARTS[+el.dataset.chart], plot = el.querySelector('.plot'), hv = el.querySelector('.hv'), tip = el.querySelector('.tip');
    plot.addEventListener('pointermove', (e) => {
      const b = plot.getBoundingClientRect(), r = Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), t = c.t0 + r * (c.t1 - c.t0);
      const picks = c.series.map((s) => { let best = s.data[0]; for (const p of s.data) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; return { s, p: best }; });
      hv.hidden = tip.hidden = false; hv.style.left = `${r * 100}%`;
      tip.style.left = r > 0.6 ? 'auto' : `calc(${r * 100}% + 8px)`; tip.style.right = r > 0.6 ? `calc(${(1 - r) * 100}% + 8px)` : 'auto';
      tip.innerHTML = `<div class="d">${mkDate(picks[0].p.t, c.series[0].freq !== 'M')}</div>${picks.map(({ s, p }) => `<div><i style="background:${s.color}"></i>${esc(s.name)}<b>${esc(c.fmt(p.v))}</b></div>`).join('')}`;
    });
    plot.addEventListener('pointerleave', () => { hv.hidden = tip.hidden = true; });
  });
}
const mkLegend = (items) => `<div class="mk-legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.name)} <b>${esc(i.value)}</b></span>`).join('')}</div>`;

// ---------- 시장 지표 ----------
function mkIndexTable(ix) {
  const rows = Object.entries(ix || {}).filter(([, v]) => v); if (!rows.length) return '';
  return `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">지수</th><th>종가</th><th>일간</th>${MK_SHORT.map(([, l]) => `<th>${l}</th>`).join('')}${MK_LONG.map(([k, l]) => `<th class="${k === '1y' ? 'bl' : ''}">${l}</th>`).join('')}</tr></thead><tbody>${rows.map(([n, d]) => `<tr>
    <td class="st"><b>${esc(n)}</b><small>${esc(d.latest_date || '')}</small></td><td class="strong">${mkNum(d.latest_close)}</td><td>${mkPct(d.daily_return, 2)}</td>
    ${MK_SHORT.map(([k]) => `<td>${mkPct(d.returns?.[k]?.total, 2)}</td>`).join('')}${MK_LONG.map(([k]) => `<td class="${k === '1y' ? 'bl' : ''}">${mkRet(d.returns?.[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function mkDrawdowns(dd) {
  const rows = Object.entries(dd || {}).filter(([, v]) => v); if (!rows.length) return '';
  const C = 'var(--mk-up)', years = mkS.dd;
  return `<div class="mk-grid2">${rows.map(([name, d]) => {
    const src = years == null ? d.dd_series : (d.dd_weekly || d.dd_series), data = mkWindow(src, years);
    const worst = data.length ? data.reduce((a, b) => (b.v < a.v ? b : a)) : null, ath = d.current_dd > -0.05;
    return `<div class="mk-card"><div class="mk-card-h"><div><b>${esc(name)}</b><p>직전 고점 ${mkNum(d.ath)} · ${esc(d.ath_date || '')}${d.days_since_ath > 0 ? ` · ${mkDays(d.days_since_ath)} 전` : ''}</p></div>
      <div class="mk-big"><small>고점 대비</small><strong class="${ath ? 'ath' : ''}">${ath ? '고점' : `${mkNum(d.current_dd)}%`}</strong></div></div>
      ${mkChart(data.length ? [{ name, color: C, freq: src.freq, data }] : [], { mode: 'area', h: 140, fmt: (v) => `${mkNum(v, 0)}%`, marker: worst && { t: worst.t, label: `${mkDate(worst.t, false)} ${mkNum(worst.v, 1)}%` } })}</div>`;
  }).join('')}</div>`;
}
const MK_US_COLORS = { '3개월': '#94A3B8', '13주': '#94A3B8', '5년': '#D97706', '10년': '#2563EB', '30년': '#7C3AED' };
const MK_KR_COLORS = { '국고채(3년)': '#2563EB', '회사채(3년)': '#DC2626', 'CD금리(91일)': '#D97706' };
function mkRates(d) {
  const y = mkS.rate, out = [];
  const us = Object.entries(d.us_bonds || {}).filter(([, v]) => v?.history).map(([l, v]) => ({ name: l, color: MK_US_COLORS[l] || '#2563EB', freq: 'W', data: mkWindow(v.history, y), last: v.yield })).filter((s) => s.data.length);
  const kr = Object.entries(d.kr_rates?.history || {}).map(([l, h]) => ({ name: l, color: MK_KR_COLORS[l] || '#2563EB', freq: 'D', data: mkWindow(h, y), last: h?.values?.[h.values.length - 1] })).filter((s) => s.data.length);
  const fx = d.fx?.USDKRW, fxd = mkWindow(fx?.history, y);
  if (us.length) out.push(`<div class="mk-card"><div class="mk-card-h"><b>미국 국채 수익률</b><span class="mk-dim">${esc(d.us_bonds[us[0].name]?.date || '')}</span></div>${mkChart(us, { fmt: (v) => `${mkNum(v, 1)}%` })}${mkLegend(us.map((s) => ({ name: s.name, color: s.color, value: `${mkNum(s.last, 3)}%` })))}</div>`);
  if (kr.length) out.push(`<div class="mk-card"><div class="mk-card-h"><b>국내 시장금리</b><span class="mk-dim">${y == null || y > 3 ? '최근 3년' : esc(d.kr_rates.date || '')}</span></div>${mkChart(kr, { fmt: (v) => `${mkNum(v, 2)}%` })}${mkLegend(kr.map((s) => ({ name: s.name, color: s.color, value: `${mkNum(s.last, 2)}%` })))}</div>`);
  if (fxd.length) out.push(`<div class="mk-card"><div class="mk-card-h"><b>원달러 환율</b><span class="mk-dim">${esc(fx.date || '')}</span></div>${mkChart([{ name: 'USD/KRW', color: '#2563EB', freq: 'W', data: fxd }], { fmt: (v) => mkNum(v, 0) })}
    <div class="mk-fx"><b>${mkNum(fx.rate)}원</b>${[['일간', fx.daily_return], ['1개월', fx['1m']], ['3개월', fx['3m']], ['연초 대비', fx.ytd], ['1년', fx['1y']]].map(([l, v]) => `<span>${l} ${mkPct(v, 2)}</span>`).join('')}</div></div>`);
  const tiles = (d.kr_rates?.rates || []).map((r) => mkTile(r.label, mkNum(r.rate, 2), '%', r.change != null ? `<span class="${mkCls(r.change)}">${r.change > 0 ? '+' : ''}${mkNum(r.change, 3)}</span>` : '')).join('');
  return `${out.length ? `<div class="mk-grid3">${out.join('')}</div>` : ''}${tiles ? `<div class="mk-sub">국내 시장금리 현황 · 전일 대비</div><div class="mk-tiles">${tiles}</div>` : ''}`;
}
const mkTile = (label, value, unit, sub) => `<div class="mk-tile"><small>${esc(label)}</small><strong>${value}<em>${unit}</em></strong>${sub ? `<p>${sub}</p>` : ''}</div>`;
function mkStocks(rows, usd) {
  if (!rows?.length) return '<div class="empty">데이터가 없습니다.</div>';
  return `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">종목</th><th>종가</th><th>일간</th><th>시총</th>${MK_LONG.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>
    <td class="st"><b>${esc(r.name)}</b><small>${esc(r.code || '')}</small></td><td class="strong">${mkNum(r.close ?? r.price, usd ? 2 : 0)}</td><td>${mkPct(r.daily_return, 2)}</td>
    <td class="mk-dim">${usd ? mkUsd(r.market_cap) : mkWon(r.market_cap)}</td>${MK_LONG.map(([k]) => `<td>${mkRet(r.returns?.[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const MK_SECT = [['1d', '일간'], ['1w', '1주'], ['1m', '1개월'], ['3m', '3개월'], ['ytd', '연초 대비'], ['1y', '1년']];
const mkSectors = (rows) => (rows?.length ? `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">섹터</th>${MK_SECT.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td class="st"><b>${esc(r.name)}</b><small>${esc(r.code || '')}</small></td>${MK_SECT.map(([k]) => `<td>${mkPct(r[k], 2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">데이터가 없습니다.</div>');

function mkMarketHTML() {
  const d = mkS.market;
  if (!d) return '<div class="card"><div class="empty">아직 수집 전입니다. 평일 아침 7시 20분에 모읍니다.</div></div>';
  MK_CHARTS.length = 0;
  const DD = [[1, '1년'], [3, '3년'], [5, '5년'], [10, '10년'], [20, '20년'], ['null', '전체']], RT = [[1, '1년'], [3, '3년'], [5, '5년'], [10, '10년'], ['null', '전체']];
  const pol = (d.policy_rates || []).map((r) => mkTile(`${r.country} 기준금리`, mkNum(r.rate, 2), '%', esc(r.last_updated || ''))).join('')
    + Object.entries(d.cpi || {}).filter(([, v]) => v).map(([c, v]) => mkTile(`${c} 물가(전년비)`, mkNum(v.yoy, 2), '%', esc(v.date || ''))).join('');
  const parts = [
    mkSec('주요 지수', '', mkIndexTable(d.indexes)),
    Object.keys(d.drawdowns || {}).length ? mkSec('고점 대비 낙폭', mkSeg('dd', DD, mkS.dd ?? 'null'), mkDrawdowns(d.drawdowns)) : '',
    mkSec('금리 · 환율', mkSeg('rate', RT, mkS.rate ?? 'null'), mkRates(d)),
    pol ? mkSec('기준금리 · 물가', '', `<div class="mk-tiles">${pol}</div>`) : '',
  ];
  const more = mkS.more ? [
    mkSec('국내 시가총액 TOP 10', mkSeg('stock', [['KOSPI', '코스피'], ['KOSDAQ', '코스닥']], mkS.stock), mkStocks(d.top_stocks?.[mkS.stock])),
    d.top_us_stocks?.length ? mkSec('미국 시가총액 TOP 10', '', mkStocks(d.top_us_stocks, true)) : '',
    mkSec('섹터별 수익률', mkSeg('sector', [['us', '미국'], ['kr', '국내']], mkS.sector), mkSectors(mkS.sector === 'us' ? d.us_sectors : d.kr_sectors)),
    d.top_etfs?.length ? mkSec('국내 ETF 순자산 TOP 10', '', mkStocks(d.top_etfs)) : '',
  ].join('') : '';
  return `${parts.join('')}${more}<button type="button" class="btn mk-more" data-mk-more>${mkS.more ? '접기' : '더보기'}</button>
    <p class="mk-foot">지수·낙폭은 배당 미반영 종가 기준, 종목·ETF 수익률은 배당 재투자 기준입니다.</p>`;
}

// ---------- 공모주 통계 ----------
// 참고 통계(공표 수치): [항목, 기간, 수치, 출처 URL, 출처]. 2026-11-04 조사, 기관마다 집계 기준이 달라 직접 비교는 피한다
const MK_REF = [
  [
  "IPO 건수·공모금액",
  "2023 → 2024 → 2025",
  "82사 3.3조 → 77사 3.9조 → 76사 4.5조",
  "https://core.asiae.co.kr/article/2026030409524398778",
  "금감원(아시아경제)"
  ],
  [
  "상장일 시초가 / 종가 수익률",
  "2023 · 2024 · 2025",
  "82%/72% · 65%/42% · 92%/75%",
  "https://core.asiae.co.kr/article/2026030409524398778",
  "금감원, 종목 단순평균"
  ],
  [
  "상장 후 1개월 / 3개월 수익률",
  "2025",
  "약 57% / 27%",
  "https://news.bizwatch.co.kr/article/market/2026/03/04/0009",
  "금감원(비즈워치)"
  ],
  [
  "밴드 상단 초과 확정 비율",
  "2024 → 2025",
  "66% → 0% (2025 하반기 97% 상단 확정)",
  "https://www.mt.co.kr/stock/2026/03/04/2026030410445340662",
  "금감원(머니투데이)"
  ],
  [
  "기관 의무보유확약 비율(배정 기준)",
  "2023 · 2024 · 2025",
  "26.4% · 18.1% · 41%",
  "https://core.asiae.co.kr/article/2026030409524398778",
  "금감원, 2025.7 우선배정 제도 이후 상승"
  ],
  [
  "수요예측 경쟁률",
  "2023 · 2024",
  "925:1 · 775:1",
  "https://core.asiae.co.kr/article/2025021810315071462",
  "금감원"
  ],
  [
  "2026 상반기 신규상장",
  "2026.1~6",
  "17사, 1.13조(-48.7%), 특례 58.8%",
  "https://v.daum.net/v/20260705131403737",
  "IR큐더스, 스팩·재상장 제외"
  ],
  [
  "2026 상반기 상장분 공모가 하회",
  "6/30 기준",
  "17곳 중 13곳(약 76%)",
  "https://www.mt.co.kr/stock/2026/07/05/2026070317112071034",
  "KB증권"
  ],
  [
  "코스닥 예심 철회",
  "2024 / 2020~2024 평균",
  "102곳 중 34곳(33%) / 연 24%",
  "https://www.unicornfactory.co.kr/article/2025112015593198916",
  "언론 자체 집계"
  ],
  [
  "바이오 기술특례 예심 기간",
  "2024 → 2025",
  "112.1 → 76.9영업일(규정 45영업일)",
  "https://dailypharm.com/user/news/333391",
  "거래소(데일리팜)"
  ],
  [
  "예심 철회·미승인 사유",
  "2025~2026 상반기",
  "83%가 실적 관련",
  "https://www.heraldk.com/article/2026090719222849500",
  "삼정KPMG"
  ],
  [
  "기술특례 상장 수",
  "2021~2025.10",
  "31 · 28 · 35 · 42 · 22곳",
  "https://dealsite.co.kr/articles/150647",
  "딜사이트"
  ],
  [
  "VC 회수 중 IPO 비중",
  "2022 → 2026 상반기",
  "24.3% → 37.9%",
  "https://www.heraldk.com/article/2026090719222849500",
  "삼정KPMG"
  ],
  [
  "코스닥 상장폐지 결정",
  "2022 · 2023 · 2024 · 2025",
  "16 · 8 · 20 · 38개사",
  "https://bizhankook.com/articles/31448.html",
  "거래소(비즈한국)"
  ],
  [
  "확약 우선배정 제도",
  "2025.7 시행",
  "기관 배정 40% 이상 확약 기관 우선, 미달 시 주관사 1% 6개월 보유",
  "https://www.fsc.go.kr/no010101/83895",
  "금융위"
  ],
  [
  "코너스톤 투자자 제도",
  "2026.11.13 시행",
  "코스피 20%·코스닥 30% 사전 배정, 보호예수 6~10개월",
  "https://www.fsc.go.kr/no010101/87440",
  "금융위, 최종 확정본 미확인"
  ]
  ];
const MK_IPO_COLS = [['n', '건수', (v) => (v ?? '-')], ['open_mean', '시초가 평균', (v) => mkPct(v)], ['open_median', '시초가 중앙값', (v) => mkPct(v)], ['open_win', '상승 비율', (v) => (v == null ? '-' : `${mkNum(v, 0)}%`)],
  ['close1_mean', '첫날 종가', (v) => mkPct(v)], ['m1_mean', '1개월', (v) => mkPct(v)], ['m3_mean', '3개월', (v) => mkPct(v)], ['m6_mean', '6개월', (v) => mkPct(v)],
  ['m6_below', '6개월 하회', (v) => (v == null ? '-' : `${mkNum(v, 0)}%`)], ['y1_mean', '1년', (v) => mkPct(v)], ['y1_below', '1년 하회', (v) => (v == null ? '-' : `${mkNum(v, 0)}%`)]];
function mkBucket(title, rows) {
  if (!rows?.length) return '';
  return mkSec(title, '', `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">구간</th><th>건수</th><th>시초가 평균</th><th>6개월 평균</th><th>6개월 하회</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="st"><b>${esc(r.bucket || r.label || '')}</b></td><td>${r.n ?? '-'}</td><td>${mkPct(r.open_mean)}</td><td>${mkPct(r.m6_mean)}</td><td>${r.m6_below == null ? '-' : `${mkNum(r.m6_below, 0)}%`}</td></tr>`).join('')}</tbody></table></div>`);
}
function mkIpoHTML() {
  const d = mkS.ipo;
  if (!d) return '<div class="card"><div class="empty">아직 집계 전입니다.</div></div>';
  const rows = (d.summary?.by_year || []).filter((r) => r.market === mkS.ipoMk).sort((a, b) => b.year - a.year);
  // 요약 칸: 기간이 다 찬 가장 최근 연도로(올해는 6개월·1년이 거의 비어 있다)
  const cur = rows[0], full = (nk) => rows.find((r) => r[nk] && r[nk] === r.n);
  const m6 = full('n_m6'), y1 = full('n_y1');
  const below = (v) => `공모가 하회 ${v == null ? '-' : `${mkNum(v, 0)}%`}`;
  const tiles = cur ? [
    mkTile(`${cur.year}년 신규상장`, cur.n ?? '-', '건', ''),
    mkTile(`${cur.year}년 시초가 매도 평균`, mkSigned(cur.open_mean, 1).replace('%', ''), '%', `중앙값 ${mkSigned(cur.open_median, 1)} · 상승 ${cur.open_win == null ? '-' : `${mkNum(cur.open_win, 0)}%`}`),
    m6 ? mkTile(`${m6.year}년 상장 6개월 보유`, mkSigned(m6.m6_mean, 1).replace('%', ''), '%', `중앙값 ${mkSigned(m6.m6_median, 1)} · ${below(m6.m6_below)}`) : '',
    y1 ? mkTile(`${y1.year}년 상장 1년 보유`, mkSigned(y1.y1_mean, 1).replace('%', ''), '%', `중앙값 ${mkSigned(y1.y1_median, 1)} · ${below(y1.y1_below)}`) : '',
  ].join('') : '';
  const table = rows.length ? `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">연도</th>${MK_IPO_COLS.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td class="st"><b>${r.year}</b></td>${MK_IPO_COLS.map(([k, , f]) => { const nk = { m1_mean: 'n_m1', m3_mean: 'n_m3', m6_mean: 'n_m6', m6_below: 'n_m6', y1_mean: 'n_y1', y1_below: 'n_y1' }[k], nn = nk ? r[nk] : null; return `<td>${f(r[k])}${nn != null && nn < r.n && r[k] != null ? `<small>${nn}건 기준</small>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">데이터가 없습니다.</div>';
  const q = mkS.ipoQ.trim().toLowerCase();
  const items = (d.items || []).filter((x) => !x.spac && !x.reit && !x.excluded && (mkS.ipoMk === 'ALL' || x.market === mkS.ipoMk) && (!q || `${x.name} ${x.code}`.toLowerCase().includes(q)))
    .sort((a, b) => String(b.listed).localeCompare(String(a.listed)));
  const shown = mkS.ipoAll || q ? items : items.slice(0, 20);
  const list = `<div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">회사</th><th>상장일</th><th>공모가</th><th>시초가</th><th>첫날 종가</th><th>1개월</th><th>3개월</th><th>6개월</th><th>1년</th><th>현재</th><th>확약</th><th>경쟁률</th></tr></thead><tbody>${shown.map((x) => `<tr>
    <td class="st"><b>${esc(x.name)}</b><small>${esc([x.market === 'KOSPI' ? '코스피' : '코스닥', x.track === '기술특례' ? '기술특례' : ''].filter(Boolean).join(' · '))}</small></td><td class="mk-dim">${esc(String(x.listed || '').slice(2).replace(/-/g, '.'))}</td><td>${mkNum(x.offer, 0)}</td>
    <td>${mkPct(x.r_open)}</td><td>${mkPct(x.r_close1)}</td><td>${mkPct(x.r_1m)}</td><td>${mkPct(x.r_3m)}</td><td>${mkPct(x.r_6m)}</td><td>${mkPct(x.r_1y)}</td><td>${mkPct(x.r_now)}</td>
    <td class="mk-dim">${x.demand?.lockup == null ? '-' : `${mkNum(x.demand.lockup, 1)}%`}</td><td class="mk-dim">${x.demand?.comp == null ? '-' : `${mkNum(x.demand.comp, 0)}:1`}</td></tr>`).join('')}</tbody></table></div>
    ${!q && items.length > 20 ? `<button type="button" class="btn mk-more in" data-mk-ipoall>${mkS.ipoAll ? '최근 20건만' : `전체 ${items.length}건 보기`}</button>` : ''}`;
  const gen = new Date(d.generated);
  return `<div class="mk-ipo-bar">${mkSeg('ipoMk', [['ALL', '전체'], ['KOSPI', '코스피'], ['KOSDAQ', '코스닥']], mkS.ipoMk)}<span class="mk-dim">${isNaN(gen) ? '' : `${gen.getMonth() + 1}/${gen.getDate()} 집계`} · 스팩·리츠·이전상장 제외</span></div>
    ${tiles ? `<div class="mk-tiles mk-tiles4">${tiles}</div>` : ''}
    ${mkSec('연도별 공모가 대비 수익률', '', table)}
    ${mkBucket('의무보유확약 비율별', d.summary?.by_lockup)}${mkBucket('수요예측 경쟁률별', d.summary?.by_comp)}
    ${mkLockupHTML()}${mkBandHTML()}${mkValHTML()}
    ${mkSec('종목별', `<div class="nw-search mk-q"><span class="nw-sic">${ico('search', 'sm')}</span><input class="input" id="mk-q" type="search" placeholder="회사 검색" value="${esc(mkS.ipoQ)}"></div>`, list)}
    ${typeof MK_REF !== 'undefined' && MK_REF.length ? mkSec('참고 통계', '', `<div class="mk-scroll"><table class="mk-tbl mk-ref"><thead><tr><th class="st">항목</th><th>기간</th><th>수치</th><th>출처</th></tr></thead><tbody>${MK_REF.map((r) => `<tr><td class="st"><b>${esc(r[0])}</b></td><td class="mk-dim">${esc(r[1])}</td><td class="strong">${esc(r[2])}</td><td class="mk-dim">${r[3] ? `<a href="${esc(r[3])}" target="_blank" rel="noopener noreferrer">${esc(r[4] || '원문')}</a>` : esc(r[4] || '')}</td></tr>`).join('')}</tbody></table></div>`) : ''}
    <p class="mk-foot">공모가 대비 수익률입니다. 시초가는 상장일 시가, 1개월·3개월·6개월·1년은 상장 후 약 20·60·120·250거래일 종가 기준입니다.</p>`;
}

// ---------- 보호예수 해제·공모가 확정 위치 ----------
/* 공모주 통계 탭 추가 섹션 — 보호예수 해제일 전후 주가(mkLockupHTML), 공모가 확정 위치(mkBandHTML).
   데이터: mkS.ipo(data/ipo_stats.json)의 lockup_fx·band. market.js 도우미(mkSec·mkTile·mkPct·mkSigned·mkNum·mkNice·mkLegend·mkSeg·esc) 사용.
   시장 필터는 상단 mkS.ipoMk, 위치별 수익률 기간은 mkS.bandEra(mkSeg 'bandEra' → market.js 공통 클릭 처리). */
const LK_COLORS = { '1m': '#D97706', '3m': '#7C3AED', '6m': '#0D9488', '1y': '#64748B' };
const LK_BAND_COLORS = { above: 'var(--mk-up)', top: '#F59E9E', in: '#CBD5E1', bottom: '#93C5FD', below: 'var(--mk-dn)' };
const lkShare = (v) => (v == null ? '-' : `${mkNum(v, 0)}%`);
const lkTbl = (head, rows) => `<div class="mk-scroll"><table class="mk-tbl"><thead><tr>${head.map((h, i) => `<th${i ? '' : ' class="st"'}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

// 해제일 기준 D-10 ~ D+10 평균 누적 초과수익률. x축이 거래일 오프셋이라 mkChart(날짜 축) 대신 따로 그린다
function lkCurve(car, hs) {
  const ser = hs.filter(([h]) => car[h]?.mean?.length).map(([h, l]) => ({ h, l, v: car[h].mean, n: car[h].n }));
  if (!ser.length) return '';
  const len = ser[0].v.length, half = (len - 1) / 2, all = ser.flatMap((s) => s.v).concat(0);
  const a = Math.min(...all), b = Math.max(...all), padv = (b - a || 1) * 0.08, step = mkNice((b - a + 2 * padv) / 4);
  const lo = Math.floor((a - padv) / step) * step, hi = Math.ceil((b + padv) / step) * step;
  const W = 1000, H = 100, x = (i) => (i / (len - 1)) * W, y = (v) => ((hi - v) / (hi - lo || 1)) * H;
  const grid = []; for (let g = hi; g >= lo - 1e-9; g -= step) grid.push(+g.toFixed(6));
  const gl = grid.map((g) => `<line x1="0" x2="${W}" y1="${y(g)}" y2="${y(g)}" class="${Math.abs(g) < 1e-9 ? 'z' : ''}" vector-effect="non-scaling-stroke"/>`).join('');
  const dl = `<line x1="${x(half)}" x2="${x(half)}" y1="0" y2="${H}" class="d" vector-effect="non-scaling-stroke"/>`;
  const lines = ser.map((s) => `<polyline points="${s.v.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${LK_COLORS[s.h]}" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join('');
  const off = (i) => (i === half ? '해제일' : `D${i > half ? '+' : '−'}${Math.abs(i - half)}`);
  const hit = Array.from({ length: len }, (_, i) => `<rect class="hit" x="${(x(i) - W / (len - 1) / 2).toFixed(1)}" y="0" width="${(W / (len - 1)).toFixed(1)}" height="${H}"><title>${esc(off(i))}\n${ser.map((s) => `${s.l} ${mkSigned(s.v[i], 1)}`).join('\n')}</title></rect>`).join('');
  const ylab = grid.map((g) => `<span class="yl" style="top:${(y(g) / H) * 100}%">${esc(`${mkNum(g, step < 1 ? 1 : 0)}%`)}</span>`).join('');
  const dots = ser.map((s) => `<i class="dot" style="left:100%;top:${(y(s.v[len - 1]) / H) * 100}%;background:${LK_COLORS[s.h]}"></i>`).join('');
  const xt = [0, half / 2, half, half * 1.5, len - 1].map((i) => `<span style="left:${(x(i) / W) * 100}%">${off(i)}</span>`).join('');
  return `<div class="lk-chart"><div class="plot" style="height:180px"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${gl}${dl}${lines}${hit}</svg>${ylab}${dots}</div><div class="xt">${xt}</div></div>
    ${mkLegend(ser.map((s) => ({ name: s.l, color: LK_COLORS[s.h], value: mkSigned(s.v[len - 1], 1) })))}`;
}

function mkLockupHTML() {
  const L = mkS.ipo?.lockup_fx, M = L?.markets?.[mkS.ipoMk];
  if (!M) return '';
  const hs = L.horizons || [['1m', '1개월'], ['3m', '3개월'], ['6m', '6개월'], ['1y', '1년']];
  const tiles = hs.map(([h, l]) => { const s = M.total?.[h]; return s?.n ? mkTile(`${l} 해제 초과수익률`, mkSigned(s.ex_mean, 1).replace('%', ''), '%', `중앙값 ${mkSigned(s.ex_median, 1)} · 하락 ${lkShare(s.ex_down)}`) : ''; }).join('');
  const point = lkTbl(['시점', '건수', '수익률 평균', '수익률 중앙값', '하락 비율', '초과 평균', '초과 중앙값', '초과 하락'], hs.filter(([h]) => M.total?.[h]?.n).map(([h, l]) => { const s = M.total[h]; return `<tr><td class="st"><b>${l}</b></td><td>${s.n}</td><td>${mkPct(s.r_mean)}</td><td>${mkPct(s.r_median)}</td><td>${lkShare(s.r_down)}</td><td>${mkPct(s.ex_mean)}</td><td>${mkPct(s.ex_median)}</td><td>${lkShare(s.ex_down)}</td></tr>`; }));
  const cross = (first, rows, label) => lkTbl([first, ...hs.map(([, l]) => l)], rows.map((r) => `<tr><td class="st"><b>${esc(label(r))}</b></td>${hs.map(([h]) => { const s = r.h?.[h]; return `<td>${s?.n ? `${mkPct(s.ex_mean)}${s.n < r.n ? `<small>${s.n}건 기준</small>` : ''}` : '-'}</td>`; }).join('')}</tr>`));
  const mk = { KOSPI: '코스피', KOSDAQ: '코스닥' };
  const body = `<div class="mk-tiles mk-tiles4">${tiles}</div>
    <div class="mk-sub">해제일 전후 누적 초과수익률</div>${lkCurve(M.car || {}, hs)}
    <div class="mk-sub">시점별</div>${point}
    <div class="mk-sub">연도별 초과수익률</div>${cross('상장 연도', M.by_year || [], (r) => r.year)}
    <div class="mk-sub">확약 비율별 초과수익률</div>${cross('확약 비율', (M.by_lockup || []).filter((r) => r.n), (r) => r.bucket)}
    ${mkS.ipoMk === 'ALL' && L.by_market?.length ? `<div class="mk-sub">시장별 초과수익률</div>${cross('시장', L.by_market, (r) => mk[r.market] || r.market)}` : ''}`;
  return mkSec('보호예수 해제 전후 주가', '<span class="mk-dim mk-hd">D−5 → D+5 종가 · 지수 대비</span>', body);
}

function mkBandHTML() {
  const B = mkS.ipo?.band, M = B?.markets?.[mkS.ipoMk];
  if (!M) return '';
  const order = B.order || [['above', '상단 초과'], ['top', '상단'], ['in', '밴드 안'], ['bottom', '하단'], ['below', '하단 미만']];
  const years = (M.by_year || []).filter((r) => r.n);
  const stack = `<div class="lk-stack">${years.map((r) => `<div class="r"><b>${r.year}</b><div class="bar">${order.filter(([p]) => r.cnt?.[p]).map(([p, l]) => `<i style="width:${r.pct[p]}%;background:${LK_BAND_COLORS[p]}" title="${esc(`${l} ${r.cnt[p]}건 · ${mkNum(r.pct[p], 1)}%`)}"></i>`).join('')}</div></div>`).join('')}</div>
    ${mkLegend(order.map(([p, l]) => ({ name: l, color: LK_BAND_COLORS[p], value: lkShare(M.total?.pct?.[p]) })))}`;
  const dist = lkTbl(['상장 연도', '건수', ...order.map(([, l]) => l), '상단 초과폭'], years.map((r) => `<tr><td class="st"><b>${r.year}</b></td><td>${r.n}</td>${order.map(([p]) => `<td>${r.cnt?.[p] ? `${lkShare(r.pct[p])}<small>${r.cnt[p]}건</small>` : '-'}</td>`).join('')}<td>${mkPct(r.above_prem_mean)}</td></tr>`));
  const era = mkS.bandEra || 'all';
  const pos = (M.by_pos?.[era] || []).filter((r) => r.n);
  const part = (v, n, all) => `${mkPct(v)}${n != null && n < all && v != null ? `<small>${n}건 기준</small>` : ''}`;
  const ret = pos.length ? lkTbl(['확정 위치', '건수', '시초가 평균', '시초가 중앙값', '1개월 평균', '6개월 평균', '6개월 하회'], pos.map((r) => `<tr><td class="st"><b>${esc(r.label)}</b></td><td>${r.n}</td><td>${mkPct(r.open_mean)}</td><td>${mkPct(r.open_median)}</td><td>${part(r.m1_mean, r.n_m1, r.n)}</td><td>${part(r.m6_mean, r.n_m6, r.n)}</td><td>${lkShare(r.m6_below)}</td></tr>`)) : '<div class="empty">데이터가 없습니다.</div>';
  return `${mkSec('공모가 확정 위치', '', `${stack}<div class="mk-sub">연도별 분포</div>${dist}`)}
    ${mkSec('확정 위치별 수익률', mkSeg('bandEra', [['all', '전체'], ['pre', '23.6 이전'], ['post', '23.6 이후']], era), ret)}`;
}

// ---------- 공모가 산정 멀티플 ----------
/* 공모주 통계 탭 › 공모가 산정 멀티플 — 증권신고서 '인수인의 의견'의 비교기업·멀티플·할인율·밴드.
   데이터: mkS.ipoVal = OneDrive data/ipo_val.json (00. 대시보드\market\ipo_val.py, 평일 19:10).
   market.js 도우미 사용: mkSec·mkTile·mkNum·mkPct·mkBars·esc. 시장 필터는 상단 mkS.ipoMk를 따른다.
   상태: mkS.valQ(종목 검색), mkS.valAll(전체 보기). */

const vlMed = (a, d = 1) => { const v = a.filter((x) => x != null && !Number.isNaN(+x)).map(Number).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return +(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2).toFixed(d); };
const vlShare = (a) => { const v = a.filter((x) => x != null); return v.length ? Math.round((100 * v.filter(Boolean).length) / v.length) : null; };
const vlX = (v, d = 1) => (v == null ? '-' : `${mkNum(v, d)}배`);
const vlP = (v, d = 1) => (v == null ? '-' : `${mkNum(v, d)}%`);
const vlOk = (x) => !(x.flag && x.flag.includes('검증 불일치'));

function vlStat(g) {
  const per = g.filter((x) => x.method === 'PER'), ok = g.filter(vlOk);
  return {
    n: g.length, perN: per.length,
    per: vlMed(per.map((x) => x.peer_mult), 2),
    mult: vlMed(g.map((x) => x.peer_mult), 2),
    dlo: vlMed(ok.map((x) => x.disc_lo)), dhi: vlMed(ok.map((x) => x.disc_hi)),
    odisc: vlMed(ok.map((x) => x.offer_disc)),
    omult: vlMed(per.map((x) => x.offer_mult), 2),
    est: vlShare(g.map((x) => x.applied_metric?.est)),
    special: vlShare(g.map((x) => (x.track ? x.track === '기술특례' : null))),
    top: vlShare(g.map((x) => (x.offer_pos ? ['상단', '상단 초과'].includes(x.offer_pos) : null))),
    pv: vlMed(g.map((x) => x.applied_metric?.pv_rate)),
    open: vlMed(g.map((x) => x.r_open)),
  };
}
const vlGroup = (items, key) => { const m = new Map(); items.forEach((x) => { const k = key(x); if (k == null) return; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()]; };
const vlTbl = (head, rows) => `<div class="mk-scroll"><table class="mk-tbl vl-tbl"><thead><tr>${head.map((h, i) => `<th${i ? '' : ' class="st"'}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const vlRow = (label, s, cols) => `<tr><td class="st"><b>${esc(String(label))}</b></td>${cols.map((c) => `<td>${c(s)}</td>`).join('')}</tr>`;

function vlMetric(m) {
  if (!m) return '-';
  const y = (m.years || []).map((v) => `'${String(v).slice(2)}`).join('·');
  const k = m.est == null ? '' : m.est ? '추정' : (m.kind || '실적');
  return `${esc([y, k].filter(Boolean).join(' ') || '-')}${m.pv_rate != null ? `<small>현가 ${mkNum(m.pv_rate, 0)}%</small>` : ''}`;
}

function mkValHTML() {
  const d = mkS.ipoVal;
  if (!d?.items?.length) return '';
  const mk = mkS.ipoMk || 'ALL';
  const all = d.items.filter((x) => mk === 'ALL' || x.market === mk);
  const base = all.filter((x) => x.method && x.peer_mult != null);
  if (!base.length) return '';
  const T = vlStat(base);
  const tiles = [
    mkTile('PER 중앙값', mkNum(T.per, 1), '배', `${T.perN}건`),
    mkTile('할인율 중앙값', `${mkNum(T.dlo, 1)}~${mkNum(T.dhi, 1)}`, '%', `공모가 ${vlP(T.odisc)}`),
    mkTile('확정가 PER 중앙값', mkNum(T.omult, 1), '배', ''),
    mkTile('기술특례 비중', T.special ?? '-', '%', `추정이익 ${vlP(T.est, 0)}`),
  ].join('');

  // PER 분포
  const B = [['~15', 0, 15], ['15', 15, 20], ['20', 20, 25], ['25', 25, 30], ['30', 30, 35], ['35', 35, 40], ['40~', 40, 1e9]];
  const pers = base.filter((x) => x.method === 'PER').map((x) => x.peer_mult);
  const dist = pers.length ? `<div class="mk-sub">PER 분포</div><div class="vl-dist">${mkBars(B.map(([l, a, b]) => [l, pers.filter((v) => v >= a && v < b).length]))}</div>` : '';

  const C = {
    n: (s) => s.n, per: (s) => vlX(s.per), mult: (s) => vlX(s.mult), dlo: (s) => vlP(s.dlo), dhi: (s) => vlP(s.dhi),
    odisc: (s) => vlP(s.odisc), omult: (s) => vlX(s.omult), est: (s) => vlP(s.est, 0), special: (s) => vlP(s.special, 0),
    top: (s) => vlP(s.top, 0), pv: (s) => vlP(s.pv, 0), open: (s) => mkPct(s.open), share: (s) => vlP(Math.round((100 * s.n) / base.length), 0),
  };
  const years = vlGroup(base, (x) => String(x.listed).slice(0, 4)).sort((a, b) => b[0].localeCompare(a[0]));
  const byYear = vlTbl(['연도', '건수', 'PER', '최소 할인율', '최대 할인율', '공모가 할인율', '확정가 PER', '추정이익', '기술특례', '상단 확정'],
    years.map(([y, g]) => vlRow(y, vlStat(g), [C.n, C.per, C.dlo, C.dhi, C.odisc, C.omult, C.est, C.special, C.top])));
  const meths = vlGroup(base, (x) => x.method).sort((a, b) => b[1].length - a[1].length);
  const byMethod = vlTbl(['방법', '건수', '비중', '멀티플', '최소 할인율', '최대 할인율', '공모가 할인율', '추정이익', '시초가'],
    meths.map(([m, g]) => vlRow(m, vlStat(g), [C.n, C.share, C.mult, C.dlo, C.dhi, C.odisc, C.est, C.open])));
  const tracks = vlGroup(base, (x) => x.track).sort((a, b) => b[1].length - a[1].length);
  const byTrack = vlTbl(['구분', '건수', 'PER', '최소 할인율', '최대 할인율', '공모가 할인율', '추정이익', '현가 할인율', '시초가'],
    tracks.map(([t, g]) => vlRow(t, vlStat(g), [C.n, C.per, C.dlo, C.dhi, C.odisc, C.est, C.pv, C.open])));
  const secs = vlGroup(base, (x) => x.sector || '기타').sort((a, b) => b[1].length - a[1].length);
  const bySector = vlTbl(['업종', '건수', 'PER 건수', 'PER', '멀티플', '최소 할인율', '최대 할인율', '확정가 PER', '시초가'],
    secs.map(([s, g]) => { const st = vlStat(g); return vlRow(s, st, [C.n, (z) => z.perN, C.per, C.mult, C.dlo, C.dhi, C.omult, C.open]); }));

  // 종목별
  const q = String(mkS.valQ || '').trim().toLowerCase();
  const rows = all.filter((x) => !q || `${x.name} ${x.code} ${(x.peers || []).join(' ')} ${x.method || ''} ${x.sector || ''}`.toLowerCase().includes(q))
    .sort((a, b) => String(b.listed).localeCompare(String(a.listed)));
  const shown = mkS.valAll || q ? rows : rows.slice(0, 20);
  const list = !shown.length ? '<div class="empty">검색 결과가 없습니다.</div>' : vlTbl(['회사', '방법', '비교기업', '멀티플', '적용 이익', '할인율', '밴드', '공모가', '시초가'], shown.map((x) => {
    const peers = (x.peers || []).join(', ');
    const sub = [x.market === 'KOSPI' ? '코스피' : '코스닥', x.track === '기술특례' ? '기술특례' : '', String(x.listed || '').slice(2).replace(/-/g, '.')].filter(Boolean).join(' · ');
    const band = x.band_lo ? `${mkNum(x.band_lo, 0)}~${mkNum(x.band_hi, 0)}` : '-';
    return `<tr>
      <td class="st"><a class="vl-co" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(x.name)}</b></a><small>${esc(sub)}</small></td>
      <td>${esc(x.method || '-')}</td>
      <td class="vl-peers" title="${esc(peers)}">${esc(peers || '-')}</td>
      <td class="${vlOk(x) ? '' : 'vl-flag'}"${x.flag ? ` title="${esc(x.flag)}"` : ''}>${vlX(x.peer_mult, 2)}</td>
      <td>${vlMetric(x.applied_metric)}</td>
      <td>${x.disc_lo == null ? '-' : `${mkNum(x.disc_lo, 1)}~${mkNum(x.disc_hi, 1)}%`}</td>
      <td>${band}</td>
      <td>${mkNum(x.offer, 0)}${x.offer_pos ? `<small>${esc(x.offer_pos)}</small>` : ''}</td>
      <td>${mkPct(x.r_open)}</td></tr>`;
  })) + (!q && rows.length > 20 ? `<button type="button" class="btn mk-more in" data-mk-valall>${mkS.valAll ? '최근 20건만' : `전체 ${rows.length}건 보기`}</button>` : '');

  const search = `<div class="nw-search mk-q"><span class="nw-sic">${ico('search', 'sm')}</span><input class="input" id="mk-valq" type="search" placeholder="회사·비교기업 검색" value="${esc(mkS.valQ || '')}"></div>`;
  return `${mkSec('공모가 산정 멀티플', '', `<div class="mk-tiles mk-tiles4">${tiles}</div>${dist}
      <div class="mk-sub">연도별</div>${byYear}
      <div class="mk-sub">평가 방법별</div>${byMethod}
      <div class="mk-sub">기술특례 · 일반</div>${byTrack}
      <div class="mk-sub">업종별</div>${bySector}`)}
    ${mkSec('종목별 공모가 산정', search, list)}`;
}

// ---------- PE 동향 ----------
// 공표 통계(2026-11-04 조사): [항목, 기간, 수치, 출처 URL, 출처]
const MK_PE_REF = [
  ['국내 M&A(완료 기준)', '2026 상반기', '46.98조, 244건 (전년 동기 28.39조, 222건)', 'https://v.daum.net/v/20260703053219409', '서울경제 시그널'],
  ['국내 M&A(발표 기준)', '2026 상반기', '20.06조 (전년 동기 9.33조)', 'https://v.daum.net/v/20260703053219409', '서울경제 시그널'],
  ['국내 M&A 중 PEF 비중', '2024 무렵', '50% 이상', 'https://www.bain.com/contentassets/9229ac35d4b04498b18b97057f878dd4/bain-251112--pef--20------final.pdf', 'Bain'],
  ['상장사 메자닌 발행액', '2024 / 2025 / 2026 상반기', '8.51조 / 10.73조 / 8조 초과', 'https://news.mtn.co.kr/news-detail/2026083115593299777', '예탁결제원(MTN)'],
  ['신규 벤처투자 · 업력 7년 초과 비중', '2025', '13.6조, 8,542건 · 54.4%(7.4조)', 'https://www.etoday.co.kr/news/view/2556683', '중기부(이투데이)'],
  ['VC 회수 중 IPO 비중', '2026.1~5', '40.6%', 'https://www.hankyung.com/article/2026071325041', '벤처캐피탈협회(한국경제)'],
  ['모태펀드 1차 정시 선정', '2026', '8,750억 출자, 60개 펀드 1.75조', 'https://www.newsis.com/view/NISX20260429_0003610980', '중기부(뉴시스)'],
  ['국민연금 국내 벤처 위탁', '2026', '4,000억, 최대 6곳 (예년 약 2,000억)', 'https://news.bizwatch.co.kr/article/finance/2026/04/03/0025', '비즈워치'],
  ['우정사업본부 PEF 출자', '2026', '2,450억 (루키 450억 이내)', 'https://dealsite.co.kr/articles/171281', '딜사이트'],
  ['글로벌 바이아웃 EV/EBITDA 중앙값', '최근', '약 12배 (국내 단독 공개치 없음)', 'https://www.bain.com/contentassets/9229ac35d4b04498b18b97057f878dd4/bain-251112--pef--20------final.pdf', 'Bain'],
];
// 금감원 기관전용 사모펀드 현황(2025년 말, 2026-06-17 발표)
const MK_PEF = [['신규 출자약정', '27.8', '조', '역대 최대, +44.8%'], ['미집행 약정', '43.2', '조', '2024년 말 36.1조'], ['신설 펀드', '211', '개', '2024년 173개'],
  ['투자 집행', '28.1', '조', '경영참여형 23.7조'], ['회수', '20.6', '조', '최종 회수 13.9조'], ['GP', '455', '곳', '대형 45 · 중형 163 · 소형 247']];
const mkMed = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const mkBars = (rows) => { const mx = Math.max(1, ...rows.map((r) => r[1])); return `<div class="mk-bars">${rows.map(([l, v]) => `<div class="b"><span class="v">${v}</span><i style="height:${Math.round((v / mx) * 100)}%"></i><span class="l">${esc(l)}</span></div>`).join('')}</div>`; };
const mkMd = (s) => esc(String(s || '').slice(5).replace('-', '/'));
function mkYesimHTML() {
  const d = mkS.yesim; if (!d?.items) return '';
  const it = d.items.filter((x) => x.type !== '스팩합병');
  const months = []; for (let i = 11; i >= 0; i--) { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - i); months.push(`${t.getFullYear()}-${pad(t.getMonth() + 1)}`); }
  const bars = months.map((m) => [`${+m.slice(5)}월`, it.filter((x) => String(x.filed).startsWith(m)).length]);
  const q3 = ymd(addDays(new Date(), -91)), y1 = ymd(addDays(new Date(), -365));
  const dur = it.filter((x) => x.decided && x.filed && ['승인', '미승인', '상장'].includes(x.status)).map((x) => diffDays(x.decided, x.filed));
  const cnt = (s) => it.filter((x) => x.status === s).length;
  const brk = {}; it.filter((x) => x.filed >= y1).forEach((x) => String(x.broker || '').split(/,\s*/).filter(Boolean).forEach((b) => { brk[b] = (brk[b] || 0) + 1; }));
  const top = Object.entries(brk).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const sig = (d.signals || []).slice().sort((a, b) => String(b.dt).localeCompare(String(a.dt))).slice(0, 6);
  return mkSec('예비심사 파이프라인', '<span class="mk-dim mk-hd">KIND · 스팩 제외</span>', `
    <div class="mk-tiles mk-tiles4">${mkTile('심사 중', cnt('심사중'), '곳', '')}${mkTile('최근 3개월 청구', it.filter((x) => x.filed >= q3).length, '곳', '')}${mkTile('청구→결과 중앙값', mkMed(dur) ?? '-', '일', `결과 나온 ${dur.length}곳`)}${mkTile('철회', cnt('철회'), '곳', `승인 ${cnt('승인')} · 상장 ${cnt('상장')}`)}</div>
    <div class="mk-sub">월별 청구 건수</div>${mkBars(bars)}
    <div class="mk-two">${top.length ? `<div><div class="mk-sub">최근 1년 상장주선인</div><ul class="mk-rank">${top.map(([n, v]) => `<li><span>${esc(n)}</span><b>${v}</b></li>`).join('')}</ul></div>` : ''}
    ${sig.length ? `<div><div class="mk-sub">청구 전 신호</div><ul class="mk-rank">${sig.map((s) => `<li><a href="${esc(s.url || '#')}" target="_blank" rel="noopener noreferrer"><b class="nm">${esc(s.name)}</b> ${esc(s.kind)}</a><span class="mk-dim">${mkMd(s.dt)}</span></li>`).join('')}</ul></div>` : ''}</div>`);
}
/* 상장까지 걸리는 기간 — data/yesim.json timeline(딜레이더가 매일 09:10 계산, 형식은 딜레이더\CONTRACT.md).
   stages: [{key,label,n,median,p25,p75,mean}], pending: {n,over4m,median}, mandateCases: [{name,selected,filed,months}]. 표본 4곳 미만이면 범위는 '표본 부족' */
function mkTimelineHTML() {
  const t = mkS.yesim?.timeline; if (!t || !Array.isArray(t.stages) || !t.stages.length) return '';
  const u = t.unit || '개월', mo = (v) => (v == null ? '-' : mkNum(v, 1));
  const st = (k) => t.stages.find((s) => s.key === k);
  const tile = (k, label) => { const s = st(k); return s ? mkTile(label, mo(s.median), u, `중앙값 · ${s.n ?? 0}곳`) : ''; };
  const p = t.pending || {};
  const tiles = [tile('filed_listed', '청구 → 상장'), tile('filed_approved', '청구 → 승인'), tile('approved_listed', '승인 → 상장'),
    p.n != null ? mkTile('지금 심사 중', p.n, '곳', `4개월 넘은 곳 ${p.over4m ?? 0}곳${p.median != null ? ` · 중앙 ${mo(p.median)}${esc(u)}째` : ''}`) : ''].join('');
  const range = (s) => ((s.n ?? 0) < 4 || s.p25 == null || s.p75 == null ? '<span class="mk-dim">표본 부족</span>' : `${mo(s.p25)} ~ ${mo(s.p75)}${esc(u)}`);
  const table = `<div class="mk-scroll"><table class="mk-tbl mk-tl"><thead><tr><th class="st">구간</th><th>중앙값</th><th>보통 범위(25~75%)</th><th>평균</th><th>표본</th></tr></thead><tbody>${t.stages.map((s) => `<tr>
    <td class="st" title="${esc(s.label)}"><b>${esc(s.label)}</b></td><td class="strong">${s.median == null ? '-' : `${mo(s.median)}${esc(u)}`}</td><td>${range(s)}</td>
    <td>${s.mean == null ? '-' : `${mo(s.mean)}${esc(u)}`}</td><td>${s.n ?? 0}곳</td></tr>`).join('')}</tbody></table></div>`;
  const mc = Array.isArray(t.mandateCases) ? t.mandateCases.filter((c) => c && c.name) : [];
  const ym = (s) => esc(String(s || '').slice(2, 7).replace('-', '.')); // 해를 넘기는 사례가 많아 연·월로(24.11)
  const cases = mc.length ? `<div class="mk-sub">주관사 선정 → 청구 사례</div><ul class="mk-rank mk-inline">${mc.map((c) => `<li><span>${esc(c.name)} <span class="mk-dim">${ym(c.selected)} → ${ym(c.filed)}</span></span><b>${mo(c.months)}${esc(u)}</b></li>`).join('')}</ul>` : '';
  const foot = [t.note, t.basis].filter(Boolean).map((s) => `<p class="mk-tl-note">${esc(s)}</p>`).join('');
  return mkSec('상장까지 걸리는 기간', `<span class="mk-dim mk-hd">${t.asof ? `${esc(t.asof)} 기준 · ` : ''}KIND 예심 결과</span>`, `
    <div class="mk-tiles mk-tiles4">${tiles}</div><div class="mk-sub">구간별 기간</div>${table}${cases}${foot}`);
}
function mkBidsHTML() {
  const d = mkS.bids; if (!d?.items) return '';
  const it = d.items, live = ['매각 추진', '주관사 선정', '예비입찰', '숏리스트', '본입찰', '우선협상'];
  const n = (f) => it.filter(f).length;
  const pick = it.filter((x) => x.fit === '상' || (x.fit === '중' && live.includes(x.stage))).sort((a, b) => String(b.last).localeCompare(String(a.last))).slice(0, 8);
  const adv = (d.advisors || []).map((a) => [a.name, (a.ids || []).length]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return mkSec('바이아웃 · 입찰 딜', '<span class="mk-dim mk-hd">뉴스 · DART · 법원 공고</span>', `
    <div class="mk-tiles mk-tiles4">${mkTile('진행 중 매각', n((x) => live.includes(x.stage)), '건', '')}${mkTile('계약·우선협상', n((x) => ['계약', '우선협상'].includes(x.stage)), '건', '')}${mkTile('회생 M&A', n((x) => x.stage === '회생 M&A'), '건', '')}${mkTile('우리가 낄 여지 상', n((x) => x.fit === '상'), '건', `중 ${n((x) => x.fit === '중')}건`)}</div>
    ${pick.length ? `<div class="mk-sub">눈여겨볼 딜</div><div class="mk-scroll"><table class="mk-tbl"><thead><tr><th class="st">대상</th><th>단계</th><th>매각자</th><th>자문사</th><th>최근</th></tr></thead><tbody>${pick.map((x) => `<tr><td class="st"><b>${esc(x.name)}</b><small>${esc(x.sector || '')}</small></td><td>${esc(x.stage)}</td><td>${esc(x.seller || '-')}</td><td>${esc(x.advisor || '-')}</td><td class="mk-dim">${mkMd(x.last)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${adv.length ? `<div class="mk-sub">자문사별 딜 수</div><ul class="mk-rank mk-inline">${adv.map(([a, v]) => `<li><span>${esc(a)}</span><b>${v}</b></li>`).join('')}</ul>` : ''}`);
}
/* PE 동향 › 메자닌 · 유상증자 — data/mezz.json(00. 대시보드\market\mezz.py, 평일 19:00)을 mkS.mezz로 읽어 그림.
   market.js 도우미(mkSec·mkTile·mkBars·mkSeg·mkNum·mkMd·esc)를 그대로 씀. 필터 상태는 mkS.mzBar·mzType·mzAll·mzInv
   (market.js의 [data-mk-seg] 클릭 처리가 mkS[key]=값 → mkDraw() 하므로 따로 핸들러가 필요 없음). */
const MZ_TYPES = [['all', '전체'], ['CB', 'CB'], ['BW', 'BW'], ['EB', 'EB'], ['유증', '유증']];
const MZ_INV = [['all', '전체'], ['pv', 'PEF·VC'], ['fund', '자산운용'], ['sec', '증권사']];
const mzEok = (v) => (v == null ? '-' : Math.abs(v) >= 10000 ? `${mkNum(v / 10000, 2)}조` : `${mkNum(v, 0)}억`);
const mzTileAmt = (label, v, n) => (v != null && Math.abs(v) >= 10000 ? mkTile(label, mkNum(v / 10000, 2), '조', `${n ?? 0}건`) : mkTile(label, mkNum(v, 0), '억', `${n ?? 0}건`));
const mzRate = (v) => (v == null ? '-' : `${mkNum(v, 1)}%`);

function mzInvShort(list) {
  if (!list?.length) return '';
  const g = {};
  list.forEach((i) => { const k = i.house || i.name; g[k] = (g[k] || 0) + (i.amt || 0) + 1e-6; });
  const names = Object.entries(g).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  return `${names.slice(0, 2).join(' · ')}${names.length > 2 ? ` 외 ${names.length - 2}` : ''}`;
}
function mzCond(x) {
  if (x.type === '유증') return [x.method, x.pref ? '우선주' : '', x.conv_price ? `${mkNum(x.conv_price, 0)}원` : ''].filter(Boolean).join(' · ');
  const a = [`표면 ${mzRate(x.coupon)}`, `만기 ${mzRate(x.ytm)}`];
  if (x.type === 'EB') a.push(x.ex?.self ? '자사주' : x.ex?.target || '');
  else if (x.refix_pct) a.push(`하한 ${x.refix_pct}%`);
  return a.filter(Boolean).join(' · ');
}
function mzCondFull(x) {
  const a = [mzCond(x)];
  if (x.type !== '유증' && x.conv_price) a.push(`${x.type === 'CB' ? '전환가' : x.type === 'BW' ? '행사가' : '교환가'} ${mkNum(x.conv_price, 0)}원`);
  if (x.maturity) a.push(`만기일 ${x.maturity}`);
  if (x.pay) a.push(`납입 ${x.pay}`);
  if (x.ex?.shares) a.push(`교환대상 ${mkNum(x.ex.shares, 0)}주${x.ex.pct_calc ?? x.ex.pct ? ` ${mkNum(x.ex.pct_calc ?? x.ex.pct, 2)}%` : ''}`);
  return a.join(' · ');
}

function mkMezzHTML() {
  const d = mkS.mezz; if (!d?.summary?.last3m) return '';
  const s = d.summary.last3m, bar = mkS.mzBar || 'mezz', ty = mkS.mzType || 'all', inv = mkS.mzInv || 'all';
  const tiles = [
    mzTileAmt('CB', s.cb, s.cb_n), mzTileAmt('BW', s.bw, s.bw_n), mzTileAmt('EB', s.eb, s.eb_n), mzTileAmt('제3자배정 유증', s.rights_3rd_ex ?? s.rights_3rd, s.rights_3rd_ex_n ?? s.rights_3rd_n),
    mkTile('사모 비중', s.private_pct == null ? '-' : mkNum(s.private_pct, 0), '%', ''),
    mkTile('평균 표면이자율', s.coupon_avg == null ? '-' : mkNum(s.coupon_avg, 2), '%', ''),
    mkTile('평균 만기이자율', s.ytm_avg == null ? '-' : mkNum(s.ytm_avg, 2), '%', ''),
    mkTile('리픽싱 70%', s.refix70_pct == null ? '-' : mkNum(s.refix70_pct, 0), '%', ''),
  ].join('');

  const months = (d.monthly || []).slice(-12);
  const bars = months.map((m) => [`${+m.ym.slice(5)}월`, +(((bar === 'r3' ? (m.rights_3rd_ex ?? m.rights_3rd) : m.mezz) || 0) / 10000).toFixed(1)]);

  const rows = (d.recent || []).filter((x) => ty === 'all' || x.type === ty);
  const shown = mkS.mzAll ? rows : rows.slice(0, 20);
  const table = rows.length ? `<div class="mk-scroll"><table class="mk-tbl mz-tbl"><thead><tr><th class="st">회사</th><th>종류</th><th>금액</th><th>조건</th><th>투자자</th><th>날짜</th></tr></thead><tbody>${shown.map((x) => `<tr>
    <td class="st"><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><b>${esc(x.corp)}</b></a><small>${esc(x.market || '')}</small></td>
    <td>${esc(x.type)}<small>${esc(x.method || '')}</small></td><td class="strong">${mzEok(x.amount)}</td>
    <td title="${esc(mzCondFull(x))}">${esc(mzCond(x))}</td><td title="${esc((x.investors || []).map((i) => i.name).join(', '))}">${esc(mzInvShort(x.investors)) || '<span class="mk-dim">-</span>'}</td>
    <td class="mk-dim">${mkMd(x.filed || x.dt)}</td></tr>`).join('')}</tbody></table></div>
    ${rows.length > 20 ? `<button type="button" class="btn mk-more in" data-mk-seg="mzAll" data-v="${mkS.mzAll ? '' : '1'}">${mkS.mzAll ? '최근 20건만' : `전체 ${rows.length}건 보기`}</button>` : ''}` : '<div class="empty">공시가 없습니다.</div>';

  const pick = { all: () => true, pv: (a) => a.kind === 'PEF' || a.kind === '신기사·VC', fund: (a) => a.kind === '자산운용', sec: (a) => a.kind === '증권사' }[inv] || (() => true);
  const top = (d.top_investors || []).filter(pick).slice(0, 10);
  const mkt = (d.by_market || []).filter((m) => m.mezz_n || m.rights_3rd_n);
  const y = d.summary.last12m || {};

  return mkSec('메자닌 · 유상증자', '<span class="mk-dim mk-hd">DART 주요사항보고서</span>', `
    <div class="mk-sub">최근 3개월</div>
    <div class="mk-tiles mk-tiles4">${tiles}</div>
    <div class="mz-subrow"><div class="mk-sub">월별 발행액 · 조원</div>${mkSeg('mzBar', [['mezz', '메자닌'], ['r3', '제3자배정 유증']], bar)}</div>${mkBars(bars)}
    <div class="mz-subrow"><div class="mk-sub">최근 공시</div>${mkSeg('mzType', MZ_TYPES, ty)}</div>${table}
    <div class="mk-two">
      <div><div class="mz-subrow"><div class="mk-sub">최근 12개월 투자자</div>${mkSeg('mzInv', MZ_INV, inv)}</div>
        ${top.length ? `<ul class="mk-rank mz-rank">${top.map((a) => `<li><span class="nm">${esc(a.name)}<small>${esc(a.kind)}</small></span><b>${a.n}건 · ${mzEok(a.amt)}</b></li>`).join('')}</ul>` : '<div class="empty">데이터가 없습니다.</div>'}</div>
      <div><div class="mz-subrow"><div class="mk-sub">최근 12개월 시장별</div></div>
        <ul class="mk-rank mz-rank">${mkt.map((m) => `<li><span class="nm">${esc(m.market)}<small>메자닌 ${m.mezz_n}건 · 제3자배정 ${m.rights_3rd_ex_n ?? m.rights_3rd_n}건</small></span><b>${mzEok(m.mezz)} · ${mzEok(m.rights_3rd_ex ?? m.rights_3rd)}</b></li>`).join('')}
        <li><span class="nm">합계<small>메자닌 ${y.mezz_n ?? 0}건 · 제3자배정 ${y.rights_3rd_ex_n ?? y.rights_3rd_n ?? 0}건</small></span><b>${mzEok(y.mezz)} · ${mzEok(y.rights_3rd_ex ?? y.rights_3rd)}</b></li></ul></div>
    </div>`);
}

function mkPeHTML() {
  const pef = `<div class="mk-tiles mk-tiles3">${MK_PEF.map(([l, v, u, s]) => mkTile(l, v, u, esc(s))).join('')}</div>`;
  const ref = `<div class="mk-scroll"><table class="mk-tbl mk-ref"><thead><tr><th class="st">항목</th><th>기간</th><th>수치</th><th>출처</th></tr></thead><tbody>${MK_PE_REF.map((r) => `<tr><td class="st"><b>${esc(r[0])}</b></td><td class="mk-dim">${esc(r[1])}</td><td class="strong">${esc(r[2])}</td><td class="mk-dim"><a href="${esc(r[3])}" target="_blank" rel="noopener noreferrer">${esc(r[4])}</a></td></tr>`).join('')}</tbody></table></div>`;
  return `${mkYesimHTML()}${mkTimelineHTML()}${mkBidsHTML()}${mkMezzHTML()}
    ${mkSec('PEF 시장', '<a class="mk-dim mk-hd" href="https://core.asiae.co.kr/article/2026061710083948025" target="_blank" rel="noopener noreferrer">금감원 · 2025년 말</a>', pef)}
    ${mkSec('M&A · 벤처 · 출자 동향', '', ref)}
    <p class="mk-foot">예비심사·입찰 딜은 딜레이더 목록, 메자닌·유상증자는 DART 주요사항보고서를 집계한 것이고, 나머지는 발표 수치입니다.</p>`;
}

// ---------- 화면 ----------
function mkDraw() {
  const host = $('#mk-host'); if (!host) return;
  host.innerHTML = mkS.tab === 'ipo' ? mkIpoHTML() : mkS.tab === 'pe' ? mkPeHTML() : mkMarketHTML();
  host.querySelectorAll('.mk-tbl').forEach((t) => { t.style.minWidth = `${150 + (t.tHead.rows[0].cells.length - 1) * 104}px`; }); // 첫 열 150px + 나머지 같은 폭, 좁으면 카드 안에서 가로 스크롤
  mkChartHover(host);
  [['#mk-q', 'ipoQ'], ['#mk-valq', 'valQ']].forEach(([sel, k]) => { const q = $(sel, host); if (q) q.addEventListener('input', (e) => { mkS[k] = e.target.value; const pos = e.target.selectionStart; mkDraw(); const n = $(sel); n.focus(); n.setSelectionRange(pos, pos); }); });
}
async function renderMarket() {
  const r = route(); mkS.tab = r === 'market/ipo' ? 'ipo' : r === 'market/pe' ? 'pe' : 'market';
  const tabs = [['market', '시장 지표', 'chart'], ['ipo', '공모주 통계', 'spark'], ['pe', 'PE 동향', 'flag']];
  PAGE.innerHTML = `<div class="page-head"><h1>시장동향</h1><span class="mk-upd" id="mk-upd"></span></div>
    <div class="deal-seg mk-tabs" role="tablist">${tabs.map(([k, t, i]) => `<button type="button" role="tab" data-mt="${k}" aria-selected="${mkS.tab === k}" class="${mkS.tab === k ? 'on' : ''}">${ico(i)}${t}</button>`).join('')}</div>
    <div id="mk-host" class="mk"><div class="card"><div class="empty">불러오는 중…</div></div></div>`;
  PAGE.querySelectorAll('[data-mt]').forEach((b) => b.addEventListener('click', () => { if (mkS.tab !== b.dataset.mt) location.hash = b.dataset.mt === 'market' ? '#market' : `#market/${b.dataset.mt}`; }));
  $('#mk-host').addEventListener('click', (e) => {
    const s = e.target.closest('[data-mk-seg]');
    if (s) { const k = s.dataset.mkSeg, v = s.dataset.v; mkS[k] = v === 'null' ? null : ['dd', 'rate'].includes(k) ? +v : v; mkDraw(); return; }
    if (e.target.closest('[data-mk-more]')) { mkS.more = !mkS.more; mkDraw(); return; }
    if (e.target.closest('[data-mk-ipoall]')) { mkS.ipoAll = !mkS.ipoAll; mkDraw(); return; }
    if (e.target.closest('[data-mk-valall]')) { mkS.valAll = !mkS.valAll; mkDraw(); }
  });
  try { await mkLoad(); } catch (e) { toast(e.message); }
  const u = mkS.market?.updated_at || mkS.market?.meta?.updated_at, t = u ? new Date(u) : null;
  if (t && !isNaN(t)) $('#mk-upd').textContent = `${t.getMonth() + 1}/${t.getDate()} ${pad(t.getHours())}:${pad(t.getMinutes())} 업데이트`;
  mkDraw();
}
