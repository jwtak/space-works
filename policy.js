/* UNIVERSE WORKS — 시장동향 › 정책자금 (#market/policy, 2026-11-27)
   "정책자금과 국민성장펀드 때문에 27년 말부터 코스닥 붐" 주장을 팩트체크하는 화면. 자료는 시장동향 담당이 만들고 회사 OneDrive SPACE WORKS/data/에 올린다(이 화면은 읽기만).
     data/policy_fund.json      연도별 정책자금(펀드·예산·정책금융·제도) series[].points[] + events + unknown
     data/fund_maturity.json    연도별 펀드 결성(vc·ngf·pef)과 만기(vc·pef) + basis·sources·unknown
     data/kosdaq_factcheck.json 주장 판정(claims), 과거 정책 랠리(history), 자금이 들어오는 경로(paths), summary
   파일이 없거나 형식이 틀리면 그 칸만 숨긴다. 진입: renderPolicy(host) — market.js 탭 줄 아래 #mk-host 안에만 그린다.
   app.js 전역($, esc, ico, pad, isMobile, viewGet, viewSet, TAB_INFO, infoBtn, yymd), graph.js STORE, market.js(mkSec·mkKv·mkNum·mkCls·mkTblW), ipo.css(.ipo-top·.ipo-sumrow) 클래스를 쓴다. */

const POL_FILES = { fund: 'data/policy_fund.json', mat: 'data/fund_maturity.json', fc: 'data/kosdaq_factcheck.json' };
const POL_TTL = 10 * 60000;
const POL_HOT = [2027, 2028]; // 주장이 말하는 해: 차트 열과 표 줄을 칠한다
const POL_GROUPS = ['펀드', '예산', '정책금융', '제도'];
const POL_KINDS = { 실적: 'act', 예산: 'bud', 계획: 'plan' };
const POL_JUDGE = { 맞음: 'ok', '일부 맞음': 'part', 과장: 'over', '확인 불가': 'na' };

const polS = (() => {
  const v = viewGet('pol', null) || {};
  return {
    d: { fund: null, mat: null, fc: null }, at: 0, loading: null, host: null,
    grp: typeof v.grp === 'string' ? v.grp : '', more: v.more === true, evAll: v.evAll === true, v1: v.v1 === 'tbl' ? 'tbl' : 'chart', v2: v.v2 === 'tbl' ? 'tbl' : 'chart', unk: v.unk === true,
  };
})();
const polViewSave = () => viewSet('pol', { grp: polS.grp, more: polS.more, evAll: polS.evAll, v1: polS.v1, v2: polS.v2, unk: polS.unk });

/* ---------- 데이터 ---------- */
const polStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const polObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const polArr = (v) => (Array.isArray(v) ? v : []);
const polNum = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);
const polYear = (v) => { const n = parseInt(v, 10); return n >= 1990 && n <= 2100 ? n : null; };
const polUrl = (u) => (/^https?:\/\//i.test(polStr(u)) ? polStr(u) : '');
const polList = (a) => polArr(a).map(polStr).filter(Boolean);

function polNormFund(raw) {
  const series = polArr(raw.series).map(polObj).map((s, i) => ({
    key: polStr(s.key) || `s${i}`, name: polStr(s.name), group: polStr(s.group) || '기타',
    points: polArr(s.points).map(polObj).map((p) => ({
      year: polYear(p.year), amount: polNum(p.amount), kind: polStr(p.kind), src: polStr(p.src), url: polUrl(p.url), asof: polStr(p.asof), note: polStr(p.note),
    })).filter((p) => p.year && p.amount != null).sort((a, b) => a.year - b.year),
  })).filter((s) => s.name && s.points.length);
  const events = polArr(raw.events).map(polObj).map((e) => ({ date: polStr(e.date), title: polStr(e.title), src: polStr(e.src), url: polUrl(e.url) }))
    .filter((e) => e.title).sort((a, b) => a.date.localeCompare(b.date));
  return series.length || events.length ? { updated: polStr(raw.updated), unit: polStr(raw.unit) || '억원', series, events, unknown: polList(raw.unknown) } : null;
}
function polNormMat(raw) {
  const part = (o, keys) => { o = polObj(o); return Object.fromEntries(keys.map((k) => [k, polNum(o[k])])); };
  const years = polArr(raw.years).map(polObj).map((y) => ({
    year: polYear(y.year), partial: y.partial === true, formed: part(y.formed, ['vc', 'ngf', 'pef', 'total']), maturing: part(y.maturing, ['vc', 'pef', 'total']), count: part(y.count, ['formed', 'maturing']),
  })).filter((y) => y.year).sort((a, b) => a.year - b.year);
  years.forEach((y) => { // 합계가 비어 있으면 나눈 값의 합
    for (const [k, ks] of [['formed', ['vc', 'pef']], ['maturing', ['vc', 'pef']]]) if (y[k].total == null && ks.some((x) => y[k][x] != null)) y[k].total = ks.reduce((s, x) => s + (y[k][x] || 0), 0);
  });
  const sources = polArr(raw.sources).map(polObj).map((s) => ({ name: polStr(s.name), url: polUrl(s.url), asof: polStr(s.asof) })).filter((s) => s.name);
  return years.length ? { updated: polStr(raw.updated), unit: polStr(raw.unit) || '억원', years, basis: polStr(raw.basis), sources, unknown: polList(raw.unknown) } : null;
}
function polNormFc(raw) {
  const claims = polArr(raw.claims).map(polObj).map((c) => ({
    claim: polStr(c.claim), judge: polStr(c.judge), why: polStr(c.why),
    src: polArr(c.src).map(polObj).map((s) => ({ name: polStr(s.name), url: polUrl(s.url) })).filter((s) => s.name || s.url),
  })).filter((c) => c.claim);
  const history = polArr(raw.history).map(polObj).map((h) => ({
    period: polStr(h.period), policy: polStr(h.policy), start: polStr(h.start), ks: polNum(h.kosdaq_start), kp: polNum(h.kosdaq_peak),
    peak: polStr(h.peak_month), mo: polNum(h.months_to_peak), drop: polNum(h.after_drop_pct), src: polStr(h.src),
  })).filter((h) => h.period || h.policy);
  const paths = polArr(raw.paths).map(polObj).map((p) => ({ name: polStr(p.name), lag: polStr(p.lag), size: polStr(p.size), note: polStr(p.note) })).filter((p) => p.name);
  const summary = polStr(raw.summary);
  return claims.length || history.length || paths.length || summary ? { updated: polStr(raw.updated), claims, history, paths, summary, unknown: polList(raw.unknown) } : null;
}
const POL_NORM = { fund: polNormFund, mat: polNormMat, fc: polNormFc };

// 세 파일을 같이 읽는다. 없는 파일(404)·읽기 실패·형식 오류는 그 칸만 null
function polLoad(force) {
  if (!force && polS.at && Date.now() - polS.at < POL_TTL) return Promise.resolve();
  const one = async (k) => {
    try {
      const r = await STORE.readText(POL_FILES[k]);
      const raw = r.text ? JSON.parse(r.text) : null;
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? POL_NORM[k](raw) : null;
    } catch { return null; }
  };
  polS.loading ||= Promise.all(Object.keys(POL_FILES).map(one)).then(([fund, mat, fc]) => { polS.d = { fund, mat, fc }; polS.at = Date.now(); })
    .finally(() => { polS.loading = null; });
  return polS.loading;
}

/* ---------- 표시 형식 ---------- */
// 억원: 1조 이상은 '12.3조', 아래는 '4,500억'. 다른 단위면 숫자 + 단위
function polAmt(v, unit = '억원') {
  if (v == null) return '-';
  if (unit !== '억원') return `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ''}`;
  return Math.abs(v) >= 10000 ? `${(v / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}조` : `${Math.round(v).toLocaleString('ko-KR')}억`;
}
const polDay = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? yymd(s) : /^\d{4}-\d{2}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(5, 7)}` : s); // 달까지만 있으면 2027.09(27.09는 날짜로 읽혀서)
const polIdx = (v) => (v == null ? '-' : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 }));
const polDim = '<span class="mk-dim">-</span>';
const polLink = (txt, url, cls = '') => (url ? `<a class="pol-a ${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(txt || '출처')}</a>` : txt ? `<span class="${cls}">${esc(txt)}</span>` : '');
const polSeg = (key, opts, cur, label) => `<div class="mk-seg" role="group" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button type="button" data-pol-${key}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
const polViewSeg = (key, cur) => polSeg(key, [['chart', '차트'], ['tbl', '표']], cur, '보기');

/* ---------- 결론: 요약과 주장 판정 ---------- */
function polFc(fc) {
  if (!fc || (!fc.summary && !fc.claims.length)) return '';
  const cl = fc.claims.map((c) => `<li class="pol-cl"><span class="pol-j j-${POL_JUDGE[c.judge] || 'na'}">${esc(c.judge || '확인 불가')}</span><div class="pol-cb"><b>${esc(c.claim)}</b>${c.why ? `<p>${esc(c.why)}</p>` : ''}${c.src.length ? `<div class="pol-srcs">${c.src.map((s) => polLink(s.name || '출처', s.url)).join('')}</div>` : ''}</div></li>`).join('');
  return mkSec('팩트체크', fc.updated ? `<span class="mk-dim mk-hd">${esc(polDay(fc.updated))}</span>` : '', `${fc.summary ? `<p class="pol-sum">${esc(fc.summary)}</p>` : ''}${cl ? `<ul class="pol-cls">${cl}</ul>` : ''}`, 'pol-fc');
}

/* ---------- 정책자금 연도별 ---------- */
// 첫 화면에 보일 항목(시장동향 노트 7절 끝 권장 10개). 나머지는 '나머지 n개 보기'
const POL_TOP = ['ngf', 'ngf_budget', 'mofund_budget', 'mofund_formed', 'innogrowth', 'newdeal', 'startup_notice', 'modoo', 'mss_budget', 'nps_kosdaq'];
const POL_EV_TOP = 10;
const POL_KORD = ['실적', '예산', '계획'];
const polGroups = (f) => [...new Set(f.series.map((s) => s.group))].sort((a, b) => (POL_GROUPS.indexOf(a) + 1 || 99) - (POL_GROUPS.indexOf(b) + 1 || 99) || a.localeCompare(b, 'ko'));
const polPtTitle = (s, p, unit) => [`${s.name} ${p.year}년 ${p.kind || ''} ${polAmt(p.amount, unit)}`.replace(/\s+/g, ' '), p.src && `출처 ${p.src}`, p.asof && `기준 ${p.asof}`, p.note].filter(Boolean).join(', ');
const polYears = (list) => [...new Set(list.flatMap((s) => s.points.map((p) => p.year)))].sort((a, b) => a - b);
// 같은 해에 정의가 다른 값이 여럿일 수 있다(예: 국민성장펀드 2026 실적 승인액과 계획). 실적, 예산, 계획 순으로 다 보인다
const polAt = (s, y) => s.points.filter((p) => p.year === y).sort((a, b) => ((POL_KORD.indexOf(a.kind) + 1 || 9) - (POL_KORD.indexOf(b.kind) + 1 || 9)) || a.amount - b.amount);
const polVal = (s, p, unit, cls) => { const t = polPtTitle(s, p, unit), v = polAmt(p.amount, unit); return p.url ? `<a class="${cls}" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" title="${esc(t)}" aria-label="${esc(t)}">${v}</a>` : `<span class="${cls}" title="${esc(t)}">${v}</span>`; };
// 한 묶음: 줄 = 항목, 열 = 연도. 막대 높이는 그 항목의 가장 큰 값 기준(항목마다 규모가 달라서). 금액 글자가 출처 링크
function polFundChart(list, unit, years) {
  const hot = (y) => (POL_HOT.includes(y) ? ' hot' : '');
  const rows = list.map((s) => {
    const mx = Math.max(1e-9, ...s.points.map((p) => Math.abs(p.amount)));
    const n = Math.max(1, ...years.map((y) => polAt(s, y).length)), h = 92 + 18 * (n - 1), room = h - 20 * n - 12; // 한 칸에 값이 여럿이면 줄을 키우고 막대를 줄인다
    const cells = years.map((y) => {
      const ps = polAt(s, y);
      if (!ps.length) return `<span class="pol-c${hot(y)}"></span>`;
      const k = (p) => POL_KINDS[p.kind] || 'act';
      return `<span class="pol-c${hot(y)}">${ps.map((p) => polVal(s, p, unit, `v t-${k(p)}`)).join('')}<span class="bars">${ps.map((p) => `<i class="k-${k(p)}" style="height:${Math.max(2, Math.round((Math.abs(p.amount) / mx) * room))}px"></i>`).join('')}</span></span>`;
    }).join('');
    return `<div class="pol-sr" style="--h:${h}px"><span class="pol-sn" title="${esc(s.name)}">${esc(s.name)}</span>${cells}</div>`;
  }).join('');
  return `<div class="mk-scroll"><div class="pol-sc" style="--n:${years.length}" role="group" aria-label="${esc(`연도별 ${list[0].group}`)}">${rows}<div class="pol-sr pol-yr"><span class="pol-sn"></span>${years.map((y) => `<span class="pol-c${hot(y)}">${y}</span>`).join('')}</div></div></div>`;
}
function polFundTable(list, unit, years) {
  return `<div class="mk-scroll"><table class="mk-tbl pol-tbl"><thead><tr><th class="st">항목</th>${years.map((y) => `<th class="${POL_HOT.includes(y) ? 'pol-hot' : ''}">${y}</th>`).join('')}</tr></thead><tbody>${list.map((s) => `<tr><td class="st pol-wrap"><b title="${esc(s.name)}">${esc(s.name)}</b></td>${years.map((y) => {
    const ps = polAt(s, y); if (!ps.length) return `<td>${polDim}</td>`;
    return `<td>${ps.map((p) => `<div class="pol-tv${p.kind === '실적' ? ' strong' : ''}">${polVal(s, p, unit, 'pol-a')}<small>${esc(p.kind || '')}</small></div>`).join('')}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function polEvents(evs) {
  if (!evs.length) return '';
  const list = evs.slice().reverse(), shown = polS.evAll ? list : list.slice(0, POL_EV_TOP), rest = list.length - shown.length; // 최근 것부터
  return `<div class="pol-sub">주요 일정</div><ul class="pol-ev">${shown.map((e) => `<li><span class="d">${esc(polDay(e.date))}</span>${e.url ? `<a class="pol-a" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a>` : `<span>${esc(e.title)}</span>`}${e.src ? `<small>${esc(e.src)}</small>` : ''}</li>`).join('')}</ul>${list.length > POL_EV_TOP ? `<div class="pol-more"><button type="button" class="btn sm" data-pol-evall aria-expanded="${!!polS.evAll}">${rest > 0 ? `나머지 ${rest.toLocaleString('ko-KR')}개 보기` : '접기'}</button></div>` : ''}`;
}
function polFund(f) {
  if (!f) return '';
  const gs = polGroups(f), grp = gs.includes(polS.grp) ? polS.grp : '';
  const pool = grp ? f.series.filter((s) => s.group === grp) : f.series;
  let top = pool.filter((s) => POL_TOP.includes(s.key)); if (!top.length) top = pool.slice(0, 5); // 그 구분에 권장 항목이 없으면 앞 5개
  const vis = polS.more ? pool : top, rest = pool.length - vis.length;
  const years = polYears(vis); // 묶음이 여럿이어도 연도 열을 같은 자리에
  const blocks = gs.filter((g) => vis.some((s) => s.group === g)).map((g, i, a) => {
    const list = vis.filter((s) => s.group === g);
    return `<div class="pol-grp">${a.length > 1 ? `<div class="pol-sub">${esc(g)}</div>` : ''}${polS.v1 === 'tbl' ? polFundTable(list, f.unit, years) : polFundChart(list, f.unit, years)}</div>`;
  }).join('');
  const more = pool.length > top.length ? `<div class="pol-more"><button type="button" class="btn sm" data-pol-more aria-expanded="${!!polS.more}">${rest > 0 ? `나머지 ${rest.toLocaleString('ko-KR')}개 보기` : '접기'}</button></div>` : '';
  const legend = polS.v1 === 'chart' && vis.length ? `<div class="mk-legend pol-lg">${Object.entries(POL_KINDS).filter(([k]) => vis.some((s) => s.points.some((p) => (POL_KINDS[p.kind] ? p.kind : '실적') === k))).map(([k, c]) => `<span><i class="k-${c}"></i>${k}</span>`).join('')}</div>` : '';
  const right = `<div class="pol-ctl">${gs.length > 1 ? polSeg('grp', [['', '전체'], ...gs.map((g) => [g, g])], grp, '구분') : ''}${polViewSeg('v1', polS.v1)}</div>`;
  return mkSec('정책자금 연도별', right, `${vis.length ? `${blocks}${legend}${more}` : ''}${polEvents(f.events)}`, 'pol-fund');
}

/* ---------- 펀드 결성과 만기 ---------- */
// ngf는 vc 가운데 모태(국민성장 포함) 출자 조합이라 vc 안에 나눠 칠하고 따로 더하지 않는다. total = vc + pef
function polMatParts(y, side) {
  const o = y[side];
  const parts = side === 'formed'
    ? [['ngf', o.ngf], ['vc', o.vc != null ? o.vc - (o.ngf || 0) : null], ['pef', o.pef]]
    : [['vc', o.vc], ['pef', o.pef]];
  return parts.filter(([, v]) => v != null && v > 0);
}
function polMatChart(m) {
  const mx = Math.max(1e-9, ...m.years.flatMap((y) => [y.formed.total || 0, y.maturing.total || 0]));
  const H = (v) => `${Math.max(0, ((v || 0) / mx) * 72).toFixed(1)}%`; // 위아래 칸 140px에서 금액 글자 자리를 뺀 만큼
  const stack = (y, side) => {
    const o = y[side], parts = polMatParts(y, side);
    const known = parts.reduce((s, [, v]) => s + v, 0), rest = (o.total || 0) - known; // 나눈 값이 없거나 모자라면 합계 회색
    const segs = [...parts.map(([k, v]) => `<i class="m-${k}" style="height:${H(v)}"></i>`), ...(rest > 1e-9 ? [`<i class="m-etc" style="height:${H(rest)}"></i>`] : [])];
    return (side === 'formed' ? segs.reverse() : segs).join(''); // 결성은 기준선(아래)부터 모태 출자, VC, PEF
  };
  const amt = (v) => (v ? polAmt(v, m.unit) : '');
  const tip = (y) => `${y.year}년 결성 ${polAmt(y.formed.total, m.unit)}${y.count.formed ? ` ${y.count.formed}개` : ''}, 만기 ${polAmt(y.maturing.total, m.unit)}${y.count.maturing ? ` ${y.count.maturing}개` : ''}${y.partial ? ' 일부' : ''}`;
  const aria = `연도별 펀드 결성과 만기, 단위 ${m.unit}. ${m.years.map(tip).join('. ')}`;
  const cols = m.years.map((y) => `<div class="pol-mc${POL_HOT.includes(y.year) ? ' hot' : ''}" title="${esc(tip(y))}">
      <div class="up"><span class="v">${amt(y.formed.total)}</span>${stack(y, 'formed')}</div>
      <span class="yr">${y.year}</span>
      <div class="dn${y.partial ? ' part' : ''}">${stack(y, 'maturing')}<span class="v">${amt(y.maturing.total)}</span>${y.partial && y.maturing.total ? '<small class="pol-part">일부</small>' : ''}</div></div>`).join('');
  const used = new Set(m.years.flatMap((y) => ['formed', 'maturing'].flatMap((s) => polMatParts(y, s).map(([k]) => k))));
  const lg = [['vc', 'VC'], ['ngf', 'VC 중 모태 출자'], ['pef', 'PEF']].filter(([k]) => used.has(k)).map(([k, l]) => `<span><i class="m-${k}"></i>${l}</span>`).join('');
  return `<div class="mk-scroll"><div class="pol-mat" style="--n:${m.years.length}" role="img" aria-label="${esc(aria)}"><div class="pol-ml"><span>결성</span><span>만기</span></div>${cols}</div></div>${lg ? `<div class="mk-legend pol-lg">${lg}</div>` : ''}`;
}
function polMatTable(m) {
  const ngf = m.years.some((y) => y.formed.ngf != null && y.formed.ngf > 0);
  const a = (v) => (!v ? polDim : polAmt(v, m.unit)), n = (v) => (!v ? polDim : `${v.toLocaleString('ko-KR')}개`); // 0은 그 해에 해당 없음(결성 2027년 뒤, 만기 2025년 앞)
  const head = ['연도', '결성 VC', ...(ngf ? ['결성 VC 중 모태'] : []), '결성 PEF', '결성 합계', '결성 수', '만기 VC', '만기 PEF', '만기 합계', '만기 수'];
  return `<div class="mk-scroll"><table class="mk-tbl pol-tbl"><thead><tr>${head.map((h, i) => `<th class="${i ? '' : 'st'}" title="${esc(h)}">${h}</th>`).join('')}</tr></thead><tbody>${m.years.map((y) => `<tr class="${POL_HOT.includes(y.year) ? 'mk-bm' : ''}"><td class="st"><b>${y.year}</b></td><td>${a(y.formed.vc)}</td>${ngf ? `<td>${a(y.formed.ngf)}</td>` : ''}<td>${a(y.formed.pef)}</td><td class="strong">${a(y.formed.total)}</td><td>${n(y.count.formed)}</td><td>${a(y.maturing.vc)}</td><td>${a(y.maturing.pef)}</td><td class="strong">${a(y.maturing.total)}${y.partial ? '<small>일부</small>' : ''}</td><td>${n(y.count.maturing)}</td></tr>`).join('')}</tbody></table></div>`;
}
function polMat(m) {
  if (!m) return '';
  const src = m.sources.length ? `<div class="pol-srcs">${m.sources.map((s) => polLink(`${s.name}${s.asof ? ` ${polDay(s.asof)}` : ''}`, s.url)).join('')}</div>` : '';
  return mkSec('펀드 결성과 만기', `<div class="pol-ctl">${polViewSeg('v2', polS.v2)}</div>`, `${polS.v2 === 'tbl' ? polMatTable(m) : polMatChart(m)}${m.basis ? `<p class="pol-basis">${esc(m.basis)}</p>` : ''}${src}`, 'pol-matsec');
}

/* ---------- 과거 사례·경로 ---------- */
function polHist(fc) {
  if (!fc?.history.length) return '';
  const drop = (v) => (v == null ? polDim : `<span class="dn">-${mkNum(Math.abs(v), 1)}%</span>`); // 낙폭: 부호와 상관없이 내린 폭
  const src = (s) => (polUrl(s) ? polLink('출처', s) : esc(s));
  const notes = fc.history.filter((h) => h.src); // 출처 글이 길어 표 아래에 시기별로
  return mkSec('과거 사례', '', `<div class="mk-scroll"><table class="mk-tbl pol-tbl"><thead><tr><th class="st">시기</th><th>정책</th><th>시작</th><th>시작 지수</th><th>고점</th><th>고점 월</th><th>고점까지</th><th>고점 뒤 낙폭</th></tr></thead><tbody>${fc.history.map((h) => `<tr>
    <td class="st"><b title="${esc(h.period)}">${esc(h.period || '-')}</b></td><td class="pol-wrap">${h.policy ? esc(h.policy) : polDim}</td><td>${h.start ? esc(polDay(h.start)) : polDim}</td><td>${polIdx(h.ks)}</td><td class="strong">${polIdx(h.kp)}</td><td>${h.peak ? esc(polDay(h.peak)) : polDim}</td><td>${h.mo == null ? polDim : `${mkNum(h.mo, 0)}개월`}</td><td>${drop(h.drop)}</td></tr>`).join('')}</tbody></table></div>${notes.length ? `<ul class="pol-notes">${notes.map((h) => `<li><b>${esc(h.period)}</b><span>${src(h.src)}</span></li>`).join('')}</ul>` : ''}`, 'pol-hist');
}
function polPaths(fc) {
  if (!fc?.paths.length) return '';
  const c = (v) => (v ? esc(v) : polDim);
  return mkSec('자금 경로', '', `<div class="mk-scroll"><table class="mk-tbl pol-tbl"><thead><tr><th class="st">경로</th><th>시차</th><th>규모</th><th>비고</th></tr></thead><tbody>${fc.paths.map((p) => `<tr><td class="st pol-wrap"><b>${esc(p.name)}</b></td><td class="pol-wrap">${c(p.lag)}</td><td class="pol-wrap">${c(p.size)}</td><td class="pol-wrap">${c(p.note)}</td></tr>`).join('')}</tbody></table></div>`, 'pol-paths');
}

/* ---------- 확인 불가(접힌 칸) ---------- */
function polUnk(d) {
  const gs = [['정책자금', d.fund], ['펀드 결성과 만기', d.mat], ['팩트체크', d.fc]].filter(([, x]) => x?.unknown.length);
  if (!gs.length) return '';
  const n = gs.reduce((s, [, x]) => s + x.unknown.length, 0);
  return `<details class="card pol-unk" id="pol-unk"${polS.unk ? ' open' : ''}><summary><span class="pol-chev" aria-hidden="true">${ico('right', 'sm')}</span><h2>확인 불가</h2><span class="mk-dim">${n}건</span></summary><div class="mk-body">${gs.map(([t, x]) => `${gs.length > 1 ? `<div class="pol-sub">${t}</div>` : ''}<ul class="pol-ul">${x.unknown.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>`).join('')}</div></details>`;
}

/* ---------- 그리기 ---------- */
function polSummary() {
  const d = polS.d;
  return [['정책자금', d.fund], ['결성과 만기', d.mat], ['팩트체크', d.fc]].filter(([, x]) => x?.updated).map(([l, x]) => `<span>${l} <b>${esc(polDay(x.updated))}</b></span>`).join('');
}
function polBody() {
  const d = polS.d;
  const html = `${polFc(d.fc)}${polFund(d.fund)}${polMat(d.mat)}${polHist(d.fc)}${polPaths(d.fc)}${polUnk(d)}`;
  return html || '<div class="card"><div class="empty">자료가 없습니다.</div></div>';
}
function polDraw() {
  const h = polS.host; if (!h || !h.isConnected) return;
  const s = h.querySelector('#pol-sum'); if (s) s.innerHTML = polSummary();
  const b = h.querySelector('#pol-body'); if (b) { b.innerHTML = polBody(); mkTblW(b); polHotScroll(b); }
  polViewSave();
}
// 폭이 좁아 가로로 밀리는 차트·표는 2027년 열이 보이게 처음부터 옮겨 둔다
function polHotScroll(root) {
  root.querySelectorAll('.mk-scroll').forEach((sc) => {
    const hot = sc.querySelector('.hot, th.pol-hot'); if (!hot || sc.scrollWidth <= sc.clientWidth) return;
    const l = hot.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft;
    if (l + hot.offsetWidth > sc.clientWidth) sc.scrollLeft = Math.max(0, l - sc.clientWidth / 2);
  });
}
const polRefocus = (sel) => polS.host?.querySelector(sel)?.focus(); // 다시 그린 뒤 같은 단추로
function polBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const g = t.closest('[data-pol-grp]'); if (g) { polS.grp = g.dataset.polGrp; polDraw(); return; }
    const v1 = t.closest('[data-pol-v1]'); if (v1) { polS.v1 = v1.dataset.polV1; polDraw(); return; }
    const v2 = t.closest('[data-pol-v2]'); if (v2) { polS.v2 = v2.dataset.polV2; polDraw(); return; }
    const mo = t.closest('[data-pol-more]'); if (mo) { polS.more = !polS.more; polDraw(); polRefocus('[data-pol-more]'); return; }
    const ea = t.closest('[data-pol-evall]'); if (ea) { polS.evAll = !polS.evAll; polDraw(); polRefocus('[data-pol-evall]'); return; }
    if (t.closest('#pol-ref')) polLoad(true).then(polDraw);
  });
  root.addEventListener('toggle', (ev) => { if (ev.target.id === 'pol-unk') { polS.unk = ev.target.open; polViewSave(); } }, true);
}
async function renderPolicy(host) {
  polS.host = host;
  host.innerHTML = `<div class="ipo-page pol-page" id="pol-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="pol-sum">${polSummary()}</div>${infoBtn('market/policy')}
      <button class="btn ghost" type="button" id="pol-ref">${ico('refresh', 'sm')}<span>새로고침</span></button></div>
    <div class="pol-body" id="pol-body"><div class="card"><div class="empty">불러오는 중…</div></div></div></div>`;
  polBind(host.querySelector('#pol-root'));
  await polLoad();
  if (polS.host !== host || !host.isConnected) return;
  polDraw();
}

/* ---------- 화면 설명(ⓘ) ---------- */
TAB_INFO['market/policy'] = { title: '정책자금', rows: [
  ['무엇인가', '정책자금과 국민성장펀드가 2027년 말부터 코스닥을 끌어올린다는 주장을 자료로 확인하는 화면입니다.'],
  ['정책자금 연도별', ['진한 막대는 실적, 옅은 막대는 예산, 빗금 막대는 계획입니다. 막대 높이는 항목마다 따로 잡았습니다.', '금액을 누르면 출처가 열립니다. 같은 해에 실적과 계획이 함께 있으면 나란히 보입니다.', '처음에는 주요 항목 10개만 보이고, 나머지는 아래 단추로 펼칩니다.']],
  ['펀드 결성과 만기', ['위는 그해 결성된 펀드, 아래는 그해 만기가 오는 펀드입니다. 2027년과 2028년을 칠했습니다.', 'VC 중 모태 출자는 VC 안에 나눠 칠한 몫이라 따로 더하지 않습니다.', '일부라고 적힌 만기 막대는 이미 청산돼 공시에서 빠진 조합이 있어 실제보다 작게 잡힌 값입니다.']],
  ['확인 불가', '자료를 찾지 못한 항목은 맨 아래 확인 불가 칸에 모았습니다.'],
] };
