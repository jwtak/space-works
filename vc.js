/* UNIVERSE WORKS — 시장동향 › 벤처투자 (#market/vc): 한국벤처캐피탈협회 DIVA 수시공시 '투자현황'(운용사별 업종·업력·지역 투자 업체수·금액, 연초부터 공시월까지 누적)
   큐직(QXIG) 홈페이지 '2026년 벤처투자 투자동향' 대시보드를 옮긴 것(2026-11-17). 딜레이더가 회사 OneDrive SPACE WORKS/data/vc_trend.json 을 올린다(이 화면은 읽기만, 형식은 vc_contract.md).
   진입: renderVc(host) — market.js 탭 줄 아래 #mk-host 안에만 그린다.
   app.js 전역($, esc, ico, toast, pad, isMobile, viewGet, viewSet, TAB_INFO, infoBtn), graph.js STORE, market.js 도우미(mkSec·mkTile·mkKv·mkNum·mkPct·mkChart·mkChartHover·mkLegend),
   ipo.css(요약 줄·필터)·radar.css(.rd-fing·.rd-finl) 클래스를 쓴다. 차트는 market.js와 같은 인라인 SVG·막대. */

const VC_FILE = 'data/vc_trend.json';
const VC_TTL = 10 * 60000;
const VC_STALE = 2; // 최근 공시월이 지금보다 두 달 넘게 앞이면 빨간 글씨
const VC_TOP = 10, VC_PAGE = 20;
const VC_SORTS = ['amt', 'cnt', 'name'];
const VC_HOLD_TOP = 15; // 펼친 보유 회사는 15곳까지, 나머지는 버튼으로

// 새로 고친 뒤에도 고른 달·필터·정렬을 이어 보게 창마다 기억한다(app.js viewGet·viewSet, 키 vc)
const vcS = (() => {
  const v = viewGet('vc', null) || {};
  const s = (k) => (typeof v[k] === 'string' ? v[k] : '');
  return {
    data: null, err: '', at: 0, loading: null, host: null, more: false,
    f: { mon: s('mon'), mode: v.mode === 'mon' ? 'mon' : 'cum', major: s('major'), minor: s('minor'), stage: s('stage'), region: s('region'), q: s('q') },
    sort: VC_SORTS.includes(v.sort) ? v.sort : 'amt', dir: v.dir === 'asc' ? 'asc' : 'desc',
    open: new Set(Array.isArray(v.open) ? v.open.filter((x) => typeof x === 'string') : []), hmore: new Set(),
  };
})();
const vcViewSave = () => viewSet('vc', { ...vcS.f, sort: vcS.sort, dir: vcS.dir, open: [...vcS.open] });

/* ---------- 데이터 ---------- */
const vcStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const vcObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const vcYm = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const vcPair = (x) => (Array.isArray(x) && x.length >= 2 && Number.isFinite(+x[0]) && Number.isFinite(+x[1]) ? [+x[0], +x[1]] : null);
const vcMap = (o) => { const out = {}; for (const [k, x] of Object.entries(vcObj(o))) { const p = vcPair(x); if (p && k) out[k] = p; } return out; };
const vcSum = (m) => Object.values(m).reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]);
const vcList = (a) => [...new Set((Array.isArray(a) ? a : []).map(vcStr).filter(Boolean))];
const vcNum = (v) => (v == null || v === '' || !Number.isFinite(+v) ? null : +v);

// 보유 회사(공시): hold[운용사 id] = [{co, cc, listed, pct, via, basis, date}]. 비상장 먼저, 그다음 지분율 큰 순(지분율 없으면 뒤)
function vcHoldNorm(o) {
  const out = {};
  for (const [id, a] of Object.entries(vcObj(o))) {
    if (!Array.isArray(a)) continue;
    const list = a.map(vcObj).map((x) => ({
      co: vcStr(x.co), listed: x.listed === true, pct: vcNum(x.pct), via: vcList(x.via), basis: vcStr(x.basis),
      date: /^\d{4}-\d{2}-\d{2}/.test(vcStr(x.date)) ? vcStr(x.date).slice(0, 10) : '',
    })).filter((x) => x.co);
    list.sort((p, q) => p.listed - q.listed || (q.pct ?? -1) - (p.pct ?? -1));
    if (list.length) out[id] = list;
  }
  return out;
}

function vcNorm(raw) {
  const vcs = (Array.isArray(raw.vcs) ? raw.vcs : []).map((x, i) => {
    x = vcObj(x);
    const name = vcStr(x.name); if (!name) return null;
    const m = {};
    for (const [k, r] of Object.entries(vcObj(x.m))) {
      if (!vcYm(k)) continue;
      const o = vcObj(r), rec = { ind: vcMap(o.ind), stage: vcMap(o.stage), region: vcMap(o.region), tot: vcPair(o.tot) };
      if (!rec.tot) rec.tot = vcSum(rec.ind); // 합계 행이 없으면 업종 합
      m[k] = rec;
    }
    return { id: vcStr(x.id) || `vc-${i}`, name, q: name.toLowerCase(), m };
  }).filter(Boolean);
  const months = new Set((Array.isArray(raw.months) ? raw.months : []).map(vcStr).filter(vcYm));
  vcs.forEach((v) => Object.keys(v.m).forEach((k) => months.add(k)));
  // 필터 순서는 파일의 dims(원자료 표 순서). 빠진 항목은 자료에서 찾아 뒤에 붙인다
  const dims = vcObj(raw.dims);
  const ind = (Array.isArray(dims.ind) ? dims.ind : []).filter((g) => Array.isArray(g) && vcStr(g[0])).map((g) => [vcStr(g[0]), vcList(g[1])]);
  const stage = vcList(dims.stage), region = vcList(dims.region);
  vcs.forEach((v) => Object.values(v.m).forEach((r) => {
    Object.keys(r.ind).forEach((k) => {
      const [mj, mn] = k.split('|'); if (!mj || !mn) return;
      let g = ind.find((x) => x[0] === mj); if (!g) ind.push(g = [mj, []]);
      if (!g[1].includes(mn)) g[1].push(mn);
    });
    Object.keys(r.stage).forEach((k) => { if (!stage.includes(k)) stage.push(k); });
    Object.keys(r.region).forEach((k) => { if (!region.includes(k)) region.push(k); });
  }));
  const ms = [...months].sort();
  return {
    generated: vcStr(raw.generated), asof: vcYm(vcStr(raw.asof)) ? vcStr(raw.asof) : ms.at(-1) || '', months: ms,
    basis: vcStr(raw.basis), sources: vcObj(raw.sources), ind, stage, region, vcs,
    hold: vcHoldNorm(raw.hold), holdNote: vcStr(raw.hold_note),
  };
}

// 파일이 아직 없으면(첫 수집 전) 오류가 아니라 '준비 중'
function vcLoad(force) {
  if (!force && vcS.at && Date.now() - vcS.at < VC_TTL) return Promise.resolve();
  vcS.loading ||= (async () => {
    let d = null, err = '';
    try {
      const r = await STORE.readText(VC_FILE);
      if (r.text) {
        let raw = null;
        try { raw = JSON.parse(r.text); } catch { err = '벤처투자 자료 형식이 올바르지 않습니다'; }
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) d = vcNorm(raw);
        else if (!err) err = '벤처투자 자료 형식이 올바르지 않습니다';
      }
    } catch (e) { if (e.status !== 404) err = e.message || '자료를 읽지 못했습니다'; }
    vcS.data = d && d.vcs.length && d.months.length ? d : null; vcS.err = err; vcS.at = Date.now();
    TAB_INFO['market/vc'] = vcInfo();
  })().finally(() => { vcS.loading = null; });
  return vcS.loading;
}

/* ---------- 달·집계 ---------- */
const vcPrev = (m) => { let [y, mm] = m.split('-').map(Number); mm -= 1; if (!mm) { y -= 1; mm = 12; } return `${y}-${pad(mm)}`; };
const vcMonLabel = (m) => `${m.slice(0, 4)}년 ${+m.slice(5)}월`;
// '그 달만'은 1월이거나 지난달 자료가 파일에 있을 때만
const vcMonOk = (m) => m.endsWith('-01') || vcS.data.months.includes(vcPrev(m));
const vcMonth = () => { const d = vcS.data; return d.months.includes(vcS.f.mon) ? vcS.f.mon : d.asof; };
const vcMode = (m) => (vcS.f.mode === 'mon' && vcMonOk(m) ? 'mon' : 'cum');

const vcDiff = (a, b) => {
  const o = {};
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => { const x = a[k] || [0, 0], y = b[k] || [0, 0], r = [x[0] - y[0], x[1] - y[1]]; if (r[0] || Math.abs(r[1]) > 1e-9) o[k] = r; });
  return o;
};
// 운용사 한 곳의 그 달 값. 그 달 공시가 없으면 null. '그 달만'은 같은 해에 그보다 앞서 공시한 가장 최근 달의 누적을 뺀다(1월이면 그대로)
function vcRec(v, m, mode) {
  const cur = v.m[m]; if (!cur || mode !== 'mon') return cur || null;
  const y = m.slice(0, 5); let base = '';
  for (const k of Object.keys(v.m)) if (k < m && k.startsWith(y) && k > base) base = k;
  if (!base) return cur;
  const b = v.m[base];
  return { ind: vcDiff(cur.ind, b.ind), stage: vcDiff(cur.stage, b.stage), region: vcDiff(cur.region, b.region), tot: [cur.tot[0] - b.tot[0], cur.tot[1] - b.tot[1]] };
}
const vcNz = (p) => !!p && (p[0] !== 0 || Math.abs(p[1]) > 1e-9);
const vcAxisOn = (f) => [f.major || f.minor ? 'ind' : '', f.stage ? 'stage' : '', f.region ? 'region' : ''].filter(Boolean);

/* 그 달 집계. 업종·업력·지역은 공시 표가 따로라 교차가 안 된다(큐직 dashboard.py와 같은 뜻):
   고른 축마다 그 표의 값을 보고, 모두 0이 아닌 투자사만 남긴다. 투자사 값은 업종 → 업력 → 지역 순으로 먼저 고른 축의 값, 아무것도 안 골랐으면 합계 */
function vcAgg(m, mode) {
  const f = vcS.f, q = f.q.trim().toLowerCase();
  const rows = []; let disclosed = 0, cnt = 0, amt = 0;
  for (const v of vcS.data.vcs) {
    const rec = vcRec(v, m, mode); if (!rec) continue;
    disclosed += 1;
    if (q && !v.q.includes(q)) continue;
    const ax = {};
    if (f.major || f.minor) { const s = [0, 0]; for (const [k, p] of Object.entries(rec.ind)) if (f.minor ? k === f.minor : k.startsWith(`${f.major}|`)) { s[0] += p[0]; s[1] += p[1]; } ax.ind = s; }
    if (f.stage) ax.stage = rec.stage[f.stage] || [0, 0];
    if (f.region) ax.region = rec.region[f.region] || [0, 0];
    if (Object.values(ax).some((p) => !vcNz(p))) continue;
    const p = ax.ind || ax.stage || ax.region || rec.tot;
    if (!vcNz(p)) continue;
    cnt += p[0]; amt += p[1]; rows.push({ v, rec, p });
  }
  return { disclosed, n: rows.length, cnt, amt, rows };
}

/* ---------- 표시 형식 ---------- */
const vcAmt = (v) => (v == null || !Number.isFinite(v) ? '-' : Math.abs(v) >= 100 ? Math.round(v).toLocaleString('ko-KR') : (Math.round(v * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 }));
const vcShare = (v, all) => (all > 0 ? `${mkNum((v / all) * 100, 0)}%` : '');
// 업력 이름: '1년초과 ~ 3년이하' → '1～3년'(원래 이름은 마우스를 올리면)
function vcStageL(s) {
  const t = s.replace(/\s+/g, ''); let m;
  if ((m = t.match(/^(\d+)년초과[~\-–～](\d+)년이하$/))) return `${m[1]}～${m[2]}년`;
  if ((m = t.match(/(\d+)년이하$/))) return `${m[1]}년 이하`;
  if ((m = t.match(/^(\d+)년초과$/))) return `${m[1]}년 초과`;
  return s;
}
const vcYoy = (cur, ly) => (ly == null || !ly ? null : ((cur - ly) / Math.abs(ly)) * 100);

/* ---------- 조각 ---------- */
// 가로 막대: items [{k, label, title, amt, cnt}]. pick이 있으면 누르면 그 항목으로 거르는 버튼
function vcHbars(items, { pick = '', on = '', empty = '조건에 맞는 투자사가 없습니다.' } = {}) {
  if (!items.length) return `<div class="empty">${empty}</div>`;
  const mx = Math.max(1e-9, ...items.map((x) => x.amt)), all = items.reduce((s, x) => s + Math.max(0, x.amt), 0);
  return `<div class="vc-hb">${items.map((x, i) => {
    const inner = `<span class="l"${x.title ? ` title="${esc(x.title)}"` : ''}>${pick ? '' : `<em>${i + 1}</em>`}${esc(x.label)}</span><span class="bar"><i style="width:${Math.max(0, (x.amt / mx) * 100).toFixed(1)}%"></i></span><span class="v"><b>${vcAmt(x.amt)}억</b><small>${pick ? vcShare(x.amt, all) : `${x.cnt.toLocaleString('ko-KR')}건`}</small></span>`;
    return pick
      ? `<button type="button" class="vc-hr${on === x.k ? ' on' : ''}" data-vc-pick="${pick}" data-v="${esc(x.k)}" aria-pressed="${on === x.k}" title="${esc(`${x.title || x.label} ${vcAmt(x.amt)}억, ${x.cnt.toLocaleString('ko-KR')}건`)}">${inner}</button>`
      : `<div class="vc-hr">${inner}</div>`;
  }).join('')}</div>`;
}

// 월별 막대(market.js mk-bars 모양). rows [[라벨, 값, 고른 달?]]
function vcBars(rows) {
  const mx = Math.max(1e-9, ...rows.map((r) => r[1]));
  return `<div class="mk-bars vc-bars">${rows.map(([l, v, on]) => `<div class="b${on ? ' on' : ''}" title="${esc(`${l} ${vcAmt(v)}억`)}"><span class="v">${vcAmt(v)}</span><i style="height:${Math.max(0, Math.round((v / mx) * 100))}%"></i><span class="l">${esc(l)}</span></div>`).join('')}</div>`;
}

/* ---------- 합계 ---------- */
function vcTiles(cur, ly) {
  const kv = (pairs) => mkKv(pairs.filter(Boolean));
  const yo = (a, b) => { const v = ly ? vcYoy(a, b) : null; return v == null ? null : ['전년 대비', mkPct(v, 1)]; };
  const avg = cur.cnt ? cur.amt / cur.cnt : null, per = cur.n ? cur.amt / cur.n : null;
  const lyAvg = ly && ly.cnt ? ly.amt / ly.cnt : null;
  return `<div class="mk-tiles mk-tiles4">
    ${mkTile('투자사', cur.n.toLocaleString('ko-KR'), '곳', kv([['공시', `${cur.disclosed.toLocaleString('ko-KR')}곳`], ly && yo(cur.n, ly.n)]))}
    ${mkTile('총 투자금액', vcAmt(cur.amt), '억', kv([ly && yo(cur.amt, ly.amt)]))}
    ${mkTile('총 투자건수', cur.cnt.toLocaleString('ko-KR'), '건', kv([ly && yo(cur.cnt, ly.cnt)]))}
    ${mkTile('평균 투자금액', avg == null ? '-' : vcAmt(avg), '억', kv([per != null && ['투자사당', `${vcAmt(per)}억`], ly && lyAvg != null && avg != null && yo(avg, lyAvg)]))}
  </div>`;
}

/* ---------- 비중 ---------- */
function vcIndItems(rows) {
  const f = vcS.f, d = vcS.data, acc = {};
  rows.forEach(({ rec }) => Object.entries(rec.ind).forEach(([k, p]) => {
    const [mj, mn] = k.split('|');
    if (f.major && mj !== f.major) return;
    const key = f.major ? k : mj, a = acc[key] ||= [0, 0]; a[0] += p[0]; a[1] += p[1];
  }));
  const order = f.major ? (d.ind.find((g) => g[0] === f.major)?.[1] || []).map((mn) => `${f.major}|${mn}`) : d.ind.map((g) => g[0]);
  return Object.entries(acc).filter(([, p]) => p[1] > 1e-9)
    .map(([k, p]) => ({ k, label: f.major ? k.split('|')[1] : k, amt: p[1], cnt: p[0], o: order.indexOf(k) }))
    .sort((a, b) => b.amt - a.amt || a.o - b.o);
}
function vcAxisItems(rows, key, ordered) {
  const acc = {};
  rows.forEach(({ rec }) => Object.entries(rec[key]).forEach(([k, p]) => { const a = acc[k] ||= [0, 0]; a[0] += p[0]; a[1] += p[1]; }));
  const order = vcS.data[key];
  const items = Object.entries(acc).filter(([, p]) => p[1] > 1e-9).map(([k, p]) => ({ k, label: key === 'stage' ? vcStageL(k) : k, title: key === 'stage' ? k : '', amt: p[1], cnt: p[0], o: order.indexOf(k) }));
  return items.sort(ordered ? (a, b) => a.o - b.o : (a, b) => b.amt - a.amt || a.o - b.o);
}

/* ---------- 월별 추이 ---------- */
function vcTrend(m, mode) {
  const d = vcS.data, y = +m.slice(0, 4);
  const yms = d.months.filter((k) => k.startsWith(`${y}-`) && (mode === 'cum' || vcMonOk(k)));
  if (!yms.length) return '<div class="empty">자료가 없습니다.</div>';
  const pts = yms.map((k) => ({ k, v: vcAgg(k, mode).amt }));
  if (mode === 'mon' || pts.length < 3) return `${vcBars(pts.map((p) => [`${+p.k.slice(5)}월`, p.v, p.k === m]))}`;
  const ser = [{ name: `${y}년`, color: '#2563EB', freq: 'M', data: pts.map((p) => ({ t: Date.UTC(y, +p.k.slice(5) - 1, 1), v: p.v })) }];
  const lyMs = d.months.filter((k) => k.startsWith(`${y - 1}-`));
  if (lyMs.length) ser.push({ name: `${y - 1}년`, color: '#9CA3AF', freq: 'M', data: lyMs.map((k) => ({ t: Date.UTC(y, +k.slice(5) - 1, 1), v: vcAgg(k, 'cum').amt })) });
  return `${mkChart(ser, { h: 180, zero: true, fmt: (v) => `${vcAmt(v)}억` })}${mkLegend(ser.map((s) => ({ name: s.name, color: s.color, value: `${vcAmt(s.data.at(-1).v)}억` })))}`;
}

/* ---------- 투자사 목록 ---------- */
// 주력 업종: 그 투자사의 그 달 업종 표에서 금액이 가장 큰 중분류와 비중
function vcMain(rec) {
  let best = null, all = 0;
  for (const [k, p] of Object.entries(rec.ind)) { if (p[1] <= 0) continue; all += p[1]; if (!best || p[1] > best[1][1]) best = [k, p]; }
  if (!best) return null;
  const [mj, mn] = best[0].split('|');
  return { mj, mn, share: vcShare(best[1][1], all) };
}
function vcTable(rows) {
  if (!rows.length) return '<div class="empty">조건에 맞는 투자사가 없습니다.</div>';
  const k = vcS.sort, sg = vcS.dir === 'asc' ? 1 : -1;
  const list = rows.slice().sort((a, b) => (k === 'name' ? a.v.name.localeCompare(b.v.name, 'ko') : k === 'cnt' ? a.p[0] - b.p[0] || a.p[1] - b.p[1] : a.p[1] - b.p[1]) * sg);
  const shown = vcS.more ? list : list.slice(0, VC_PAGE), rest = list.length - shown.length;
  const th = (key, label, cls = '') => `<th class="${cls}" aria-sort="${k === key ? (vcS.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="vc-sort${k === key ? ' on' : ''}" data-vc-sort="${key}">${label}<span class="vc-dir" aria-hidden="true">${k === key ? (vcS.dir === 'asc' ? '▴' : '▾') : ''}</span></button></th>`;
  return `<div class="mk-scroll"><table class="mk-tbl vc-tbl"><thead><tr>${th('name', '투자사', 'st')}${th('amt', '투자금액')}${th('cnt', '건수')}<th class="vc-c-main">주력 업종</th></tr></thead><tbody>${shown.map((r, i) => {
    const x = vcMain(r.rec), open = vcS.open.has(r.v.id), hid = `vc-hold-${i}`;
    return `<tr class="vc-row${open ? ' open' : ''}" data-vc-row="${esc(r.v.id)}"><td class="st"><button type="button" class="vc-open" aria-expanded="${open}"${open ? ` aria-controls="${hid}"` : ''} title="보유 회사(공시) ${open ? '접기' : '펼치기'}"><span class="vc-chev" aria-hidden="true">${ico('right', 'sm')}</span><b>${esc(r.v.name)}</b></button>${x ? `<small class="vc-alt">${esc(x.mn)} ${x.share}</small>` : ''}</td><td class="strong">${vcAmt(r.p[1])}억</td><td>${r.p[0].toLocaleString('ko-KR')}건</td><td class="vc-c-main">${x ? `${esc(x.mn)}<small>${esc(x.mj)} ${x.share}</small>` : '<span class="mk-dim">-</span>'}</td></tr>${open ? `<tr class="vc-drow" id="${hid}"><td class="vc-dcell" colspan="4">${vcHold(r.v)}</td></tr>` : ''}`;
  }).join('')}</tbody></table></div>${rest > 0 ? `<div class="vc-morewrap"><button type="button" class="btn sm" data-vc-more>나머지 ${rest.toLocaleString('ko-KR')}곳 보기</button></div>` : ''}`;
}

/* ---------- 보유 회사(공시) ---------- */
// 회사 쪽 서류 주주 명단에서 그 운용사나 그 조합 이름이 나온 회사(vc_contract.md '추가'). DIVA에는 피투자기업 명단이 없다
const vcDart = (n) => `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(n)}`;
function vcVia(a) {
  if (!a.length) return '<span class="mk-dim">-</span>';
  const one = (x) => `<span class="vc-via">${esc(x === '직접' ? '직접 보유' : x)}</span>`;
  return a.length > 2 ? `${a.slice(0, 2).map(one).join('')}<span class="vc-via mk-dim" title="${esc(a.slice(2).join(', '))}">외 ${a.length - 2}개</span>` : a.map(one).join('');
}
function vcHold(v) {
  const d = vcS.data, list = d.hold[v.id] || [];
  const note = d.holdNote ? `<p class="vc-hnote">${esc(d.holdNote)}</p>` : '';
  const head = `<div class="ipo-box-h">보유 회사(공시)${list.length ? `<span class="muted">${list.length.toLocaleString('ko-KR')}곳</span>` : ''}</div>`;
  if (!list.length) return `<div class="ipo-box vc-hold">${head}<div class="ipo-box-b">${note}<div class="empty">공시 주주 명단에서 찾은 회사가 없습니다.</div></div></div>`;
  const shown = vcS.hmore.has(v.id) ? list : list.slice(0, VC_HOLD_TOP), rest = list.length - shown.length;
  const pct = (p) => (p == null ? '<span class="mk-dim">-</span>' : `${p.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`);
  return `<div class="ipo-box vc-hold">${head}<div class="ipo-box-b">${note}<table class="ipo-tbl vc-htbl"><thead><tr><th>회사</th><th>지분율</th><th>보유 조합</th><th>근거</th><th>기준일</th></tr></thead><tbody>${shown.map((x) => `<tr>
      <td class="vc-hco"><a class="vc-hname" href="${esc(vcDart(x.co))}" target="_blank" rel="noopener noreferrer" title="DART에서 회사 찾기">${esc(x.co)}${ico('ext', 'sm')}</a><span class="vc-lst${x.listed ? '' : ' un'}">${x.listed ? '상장' : '비상장'}</span></td>
      <td class="vc-hpct">${pct(x.pct)}</td><td class="vc-hvia">${vcVia(x.via)}</td><td class="vc-hbasis">${x.basis ? esc(x.basis) : '<span class="mk-dim">-</span>'}</td><td class="vc-hdate">${x.date ? yymd(x.date) : '<span class="mk-dim">-</span>'}</td></tr>`).join('')}</tbody></table>${rest > 0 ? `<div class="vc-morewrap"><button type="button" class="btn sm" data-vc-hmore="${esc(v.id)}">나머지 ${rest.toLocaleString('ko-KR')}곳 보기</button></div>` : ''}</div></div>`;
}

/* ---------- 본문 ---------- */
function vcBody() {
  if (vcS.err) return `<div class="card"><div class="empty">${esc(vcS.err)}</div></div>`;
  const d = vcS.data;
  if (!d) return '<div class="card"><div class="empty">벤처투자 자료를 준비하고 있습니다.</div></div>';
  const f = vcS.f, m = vcMonth(), mode = vcMode(m), mm = +m.slice(5), y = m.slice(0, 4);
  const cur = vcAgg(m, mode);
  const lym = `${+y - 1}${m.slice(4)}`;
  const ly = d.months.includes(lym) && (mode === 'cum' || vcMonOk(lym)) ? vcAgg(lym, mode) : null;
  const title = mode === 'mon' ? `${y}년 ${mm}월 한 달` : mm === 1 ? `${y}년 1월` : `${y}년 1～${mm}월 누적`;
  const monOk = vcMonOk(m);
  const ctl = `<div class="vc-per"><select class="select" id="vc-mon" aria-label="공시월">${d.months.slice().reverse().map((k) => `<option value="${k}"${k === m ? ' selected' : ''}>${vcMonLabel(k)}</option>`).join('')}</select>
    <div class="mk-seg" role="group" aria-label="기간"><button type="button" data-vc-mode="cum" class="${mode === 'cum' ? 'on' : ''}" aria-pressed="${mode === 'cum'}">누적</button><button type="button" data-vc-mode="mon" class="${mode === 'mon' ? 'on' : ''}" aria-pressed="${mode === 'mon'}"${monOk ? '' : ' disabled title="지난달 자료가 없어 볼 수 없습니다"'}>그 달만</button></div></div>`;
  const axes = vcAxisOn(f);
  const hint = axes.length > 1 ? '<p class="vc-note">업종, 업력, 지역은 공시 표가 따로라 교차 집계가 되지 않습니다. 금액은 업종, 업력, 지역 순으로 먼저 고른 표의 값입니다.</p>' : '';
  const top = cur.rows.slice().sort((a, b) => b.p[1] - a.p[1]).slice(0, VC_TOP).map((r) => ({ k: r.v.id, label: r.v.name, amt: r.p[1], cnt: r.p[0] }));
  const indT = f.major ? `${esc(f.major)} 중분류별` : '업종별';
  return `
    ${mkSec(title, ctl, `${vcTiles(cur, ly)}${hint}`, 'vc-sum')}
    ${mkSec('투자금액 상위 10곳', '<span class="mk-dim mk-hd">억원</span>', vcHbars(top))}
    <div class="vc-grid">
      ${mkSec(indT, '', vcHbars(vcIndItems(cur.rows), { pick: f.major ? 'minor' : 'major', on: f.major ? f.minor : f.major }))}
      ${mkSec('업력별', '', vcHbars(vcAxisItems(cur.rows, 'stage', true), { pick: 'stage', on: f.stage }))}
      ${mkSec('지역별', '', vcHbars(vcAxisItems(cur.rows, 'region', false), { pick: 'region', on: f.region }))}
    </div>
    ${mkSec(mode === 'mon' ? `${y}년 월별 투자금액` : `${y}년 누적 투자금액 추이`, '<span class="mk-dim mk-hd">억원</span>', vcTrend(m, mode))}
    ${mkSec('투자사 목록', `<span class="mk-dim mk-hd">${cur.n.toLocaleString('ko-KR')}곳</span>`, vcTable(cur.rows), 'vc-list')}`;
}

/* ---------- 요약 줄·필터 ---------- */
function vcSummary() {
  const d = vcS.data; if (!d) return '';
  const now = new Date(), [ay, am] = d.asof.split('-').map(Number);
  const old = d.asof && now.getFullYear() * 12 + now.getMonth() + 1 - (ay * 12 + am) > VC_STALE;
  // ok로 시작하지 않는 출처만 이름으로(값은 마우스를 올리면) — ma.js와 같다
  const bad = Object.entries(d.sources).filter(([, v]) => !/^ok/i.test(vcStr(v))).map(([k, v]) => `<span class="ipo-stale" title="${esc(vcStr(v))}">${esc(k)} 확인 필요</span>`);
  return `${d.asof ? `<span class="${old ? 'ipo-stale' : ''}">최근 공시 ${vcMonLabel(d.asof)}</span>` : ''}${bad.join('')}`;
}

function vcFilterHtml() {
  const d = vcS.data, f = vcS.f; if (!d) return '';
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const minors = f.major
    ? (d.ind.find((g) => g[0] === f.major)?.[1] || []).map((mn) => opt(`${f.major}|${mn}`, mn, f.minor)).join('')
    : d.ind.map(([mj, ms]) => `<optgroup label="${esc(mj)}">${ms.map((mn) => opt(`${mj}|${mn}`, mn, f.minor)).join('')}</optgroup>`).join('');
  const any = f.major || f.minor || f.stage || f.region || f.q;
  return `<div class="ipo-filter">
      <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="vc-q" type="search" placeholder="투자사 검색" value="${esc(f.q)}" autocomplete="off" aria-label="투자사 검색"></div>
      <select class="select vc-sel" id="vc-major" aria-label="업종 대분류">${opt('', '전체 업종', f.major)}${d.ind.map(([mj]) => opt(mj, mj, f.major)).join('')}</select>
      <select class="select vc-sel" id="vc-minor" aria-label="업종 중분류">${opt('', '전체 중분류', f.minor)}${minors}</select>
      <select class="select vc-sel" id="vc-stage" aria-label="업력">${opt('', '전체 업력', f.stage)}${d.stage.map((s) => opt(s, vcStageL(s), f.stage)).join('')}</select>
      ${any ? '<button type="button" class="btn ghost" id="vc-reset">초기화</button>' : ''}
    </div>
    <div class="ipo-filter vc-regf"><div class="rd-fing"><span class="rd-finl">지역</span><div class="vc-chips" role="group" aria-label="지역">${['', ...d.region].map((r) => `<button type="button" data-vc-region="${esc(r)}" class="${f.region === r ? 'on' : ''}" aria-pressed="${f.region === r}">${esc(r || '전체')}</button>`).join('')}</div></div></div>`;
}

/* ---------- 그리기 ---------- */
function vcDraw(filter) {
  const h = vcS.host; if (!h || !h.isConnected) return;
  const set = (sel, html) => { const el = h.querySelector(sel); if (el) el.innerHTML = html; };
  set('#vc-sum', vcSummary());
  if (filter) set('#vc-filter', vcFilterHtml());
  const fb = h.querySelector('#vc-fcard'); if (fb) fb.hidden = !vcS.data;
  set('#vc-body', vcBody());
  const b = h.querySelector('#vc-body'); if (b) mkChartHover(b);
  vcViewSave();
}

function vcBind(root) {
  const refilter = (filter) => { vcS.more = false; vcDraw(filter); };
  root.addEventListener('click', (ev) => {
    const t = ev.target, f = vcS.f;
    const mb = t.closest('[data-vc-mode]'); if (mb) { if (!mb.disabled) { f.mode = mb.dataset.vcMode; refilter(); } return; }
    const rb = t.closest('[data-vc-region]'); if (rb) { f.region = rb.dataset.vcRegion; refilter(true); return; }
    const pb = t.closest('[data-vc-pick]');
    if (pb) {
      const k = pb.dataset.vcPick, v = pb.dataset.v;
      if (k === 'major') { f.major = f.major === v ? '' : v; f.minor = ''; }
      else if (k === 'minor') f.minor = f.minor === v ? '' : v;
      else f[k] = f[k] === v ? '' : v;
      refilter(true); return;
    }
    const sb = t.closest('[data-vc-sort]');
    if (sb) { const k = sb.dataset.vcSort; if (vcS.sort === k) vcS.dir = vcS.dir === 'asc' ? 'desc' : 'asc'; else { vcS.sort = k; vcS.dir = k === 'name' ? 'asc' : 'desc'; } vcDraw(); return; }
    if (t.closest('[data-vc-more]')) { vcS.more = true; vcDraw(); return; }
    if (t.closest('#vc-reset')) { Object.assign(f, { major: '', minor: '', stage: '', region: '', q: '' }); refilter(true); return; }
    if (t.closest('#vc-ref')) { vcLoad(true).then(() => vcDraw(true)).catch((e) => toast(e.message)); return; }
    const hm = t.closest('[data-vc-hmore]'); if (hm) { vcS.hmore.add(hm.dataset.vcHmore); vcDraw(); return; }
    // 투자사 행을 누르면 보유 회사(공시)를 펼치고 접는다. 펼친 칸 안(링크·표)은 그대로
    if (t.closest('a, .vc-drow')) return;
    const row = t.closest('[data-vc-row]');
    if (row) {
      const id = row.dataset.vcRow, kb = !!t.closest('.vc-open');
      if (vcS.open.has(id)) vcS.open.delete(id); else vcS.open.add(id);
      vcDraw();
      if (kb) [...root.querySelectorAll('[data-vc-row]')].find((r) => r.dataset.vcRow === id)?.querySelector('.vc-open')?.focus();
    }
  });
  root.addEventListener('change', (ev) => {
    const id = ev.target.id, v = ev.target.value, f = vcS.f;
    if (id === 'vc-mon') { f.mon = v; refilter(); }
    else if (id === 'vc-major') { f.major = v; f.minor = ''; refilter(true); }
    else if (id === 'vc-minor') { f.minor = v; if (v) f.major = v.split('|')[0]; refilter(true); }
    else if (id === 'vc-stage') { f.stage = v; refilter(true); }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'vc-q') { vcS.f.q = ev.target.value; refilter(); } });
}

async function renderVc(host) {
  vcS.host = host;
  host.innerHTML = `<div class="ipo-page vc-page" id="vc-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="vc-sum">${vcSummary()}</div>
      ${infoBtn('market/vc')}
      <button class="btn ghost" type="button" id="vc-ref">${ico('refresh', 'sm')}<span>새로고침</span></button></div>
    <section class="card ipo-card vc-fcard" id="vc-fcard"${vcS.data ? '' : ' hidden'}><div id="vc-filter">${vcFilterHtml()}</div></section>
    <div class="vc-body" id="vc-body"><div class="card"><div class="empty">불러오는 중…</div></div></div></div>`;
  vcBind(host.querySelector('#vc-root'));
  try { await vcLoad(); }
  catch (e) {
    const b = vcS.host === host && host.querySelector('#vc-body');
    if (b) b.innerHTML = `<div class="card"><div class="empty">${esc(e.message)}</div></div>`;
    return;
  }
  if (vcS.host !== host || !host.isConnected) return;
  vcDraw(true);
}

/* ---------- 화면 설명(ⓘ) — 형식은 vc_contract.md ---------- */
function vcInfo() {
  const d = vcS.data;
  return {
    title: '벤처투자',
    asof: `${d?.asof ? `최근 공시 ${vcMonLabel(d.asof)}` : '최근 공시 –'}, 출처 한국벤처캐피탈협회 DIVA 수시공시`,
    rows: [
      ['무엇인가', [
        '벤처캐피탈이 DIVA에 올리는 수시공시 투자현황을 모았습니다. 투자사마다 업종, 업력, 지역별로 투자한 업체 수와 금액을 공시합니다.',
        '공시 값은 그해 1월부터 공시월까지의 누적입니다. 그 달만을 고르면 앞선 공시와의 차이로 한 달 투자를 계산합니다.',
      ]],
      ['왜 보나', [
        'VC 돈이 어느 업종과 어느 업력의 회사에 몰리는지 달마다 확인할 수 있습니다.',
        '돈이 몰린 업종은 몇 년 뒤 후속 라운드와 구주 매각(세컨더리) 수요가 생기는 곳입니다. 프리IPO, 세컨더리, 경영권 인수 기회를 미리 짚어 보는 데 씁니다.',
      ]],
      ['어떻게 보나', [
        '총 투자건수는 투자사별 투자 업체 수의 합입니다. 한 회사에 여러 투자사가 함께 넣었으면 투자사마다 셉니다.',
        '평균 투자금액은 건당 금액이고, 투자사 한 곳당 금액은 아래 작은 글씨입니다. 전년 대비는 작년 같은 공시월 자료가 있을 때만 나옵니다.',
        '업종, 업력, 지역은 공시 표가 따로라 교차 집계가 되지 않습니다. 두 가지 이상 고르면 모두 해당하는 투자사만 남고, 금액은 업종, 업력, 지역 순으로 먼저 고른 표의 값입니다.',
        '비중 막대를 누르면 그 항목으로 거르고, 한 번 더 누르면 풀립니다.',
        '공시가 아직 안 올라온 투자사는 그 달 숫자에서 빠집니다. 최근 달은 공시가 다 모이기 전이라 작게 나올 수 있습니다.',
        '최근 공시월이 두 달 넘게 지나면 빨간 글씨로 표시합니다.',
        '투자사 목록에서 투자사를 누르면 보유 회사(공시)가 펼쳐집니다. 회사의 감사보고서, 예심, 투자설명서, 대량보유 공시의 주주 명단에서 그 운용사나 운용 조합 이름을 찾은 것이라, 주요 주주로 적힌 회사만 나오고 전체 포트폴리오는 아닙니다.',
      ]],
      ['그래서 할 일', [
        '비중이 커진 업종에서 1～2년 전 시리즈 A, B를 받은 회사를 딜소싱 후보로 봅니다.',
        '한 업종에 많이 넣은 투자사는 그 업종의 구주 매각이나 공동투자를 물어볼 상대입니다.',
        '업력 7년 넘는 회사로 가는 돈이 늘면 프리IPO 경쟁이 세진다는 신호로 봅니다.',
      ]],
    ],
  };
}
TAB_INFO['market/vc'] = vcInfo();
