/* UNIVERSE WORKS — 딜소싱 › 섹터 (#deals/sector): 어느 업종을 볼지 정하는 화면. 보기 둘
   섹터 지도: 전방 업종이 크는데 후방 업종은 어떤지(sector_map.json chains)를 갈래(모멘텀·소외·관찰)별로 묶어 본다
   PE 딜: 업종별 최근 PE 딜 수·8분기 추세·금액·인수자(sector_pe.json by_sector)와 그 업종 딜 목록(deals)
   딜레이더 sector_pe.py → sector_map.py가 주 1회 회사 OneDrive SPACE WORKS/data/ 에 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT_sector.md).
   진입: renderSector(host) — host 안에만 그린다. 오너기업 후보는 pe.js peFocus로 오너기업 탭의 그 회사를 펼쳐 연다(이름은 pe.json에서, 없으면 코드만).
   app.js 전역($, esc, yymd, today, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn)과 graph.js 의 STORE,
   ipo.css(목록·펼친 행·상자)·radar.css(.rd-grp·.rd-clamp·.rd-fing·.rd-finl·.rd-link)·pe.css(.pe-grp·.pe-gn·.pe-ds·.pe-up·.pe-dn) 클래스를 쓴다. */

const SEC_FILES = { map: 'data/sector_map.json', pe: 'data/sector_pe.json' };
const SEC_TTL = 5 * 60000;
const SEC_STALE = 8; // 주 1회 갱신이므로 기준일이 8일 넘게 지나면 빨간 글씨
const SEC_VIEWS = [['map', '섹터 지도'], ['deal', 'PE 딜']];
const SEC_LANES = [['모멘텀', '전방 성장, PE 딜 몰림'], ['소외', '전방 성장, PE 덜 몰림, 후방 저평가'], ['관찰', '두 갈래 기준 밖']];
const SEC_TYPES = ['경영권 인수', '소수지분', '볼트온', '구주·세컨더리', '회수 매각'];
const SEC_STAGES = ['추진', '우선협상', '계약', '완료', '무산'];
const SEC_DEAL_N = 10; // 펼친 업종의 딜은 최근 10건만 보이고 나머지는 '나머지 n건 보기'로
// 업종 분류(CONTRACT_sector.md 표, 두 파일 공용)
const SEC_NAMES = {
  beauty: '뷰티·화장품', food: '식품·외식', consumer: '소비재·유통', medtech: '의료기기·헬스케어', bio: '바이오·제약', semi: '반도체·디스플레이',
  battery: '2차전지', power: '전력기기·에너지', ship: '조선·해양', defense: '방산·항공우주', auto: '자동차·모빌리티 부품', machine: '기계·로봇·자동화',
  chem: '화학·소재', build: '건설·건자재', logistics: '물류·운송', it: 'IT서비스·SW', platform: '플랫폼·인터넷', content: '콘텐츠·엔터',
  fin: '금융·핀테크', env: '환경·폐기물', edu: '교육', etc: '기타',
};

// 새로 고친 뒤에도 보던 보기·검색어·필터·펼친 행을 이어 보게 창마다 기억한다(app.js viewGet·viewSet, 키 sec.view·sec.map·sec.deal)
function secView(k, s) {
  const v = viewGet(`sec.${k}`, null) || {};
  ['q', 'type', 'stage'].forEach((f) => { if (f in s && typeof v[f] === 'string') s[f] = v[f]; });
  if ('type' in s && s.type && !SEC_TYPES.includes(s.type)) s.type = '';
  if ('stage' in s && s.stage && !SEC_STAGES.includes(s.stage)) s.stage = '';
  s.open = new Set(Array.isArray(v.open) ? v.open : []);
  return s;
}
const secS = {
  map: null, pe: null, err: { map: '', pe: '' }, at: 0, loading: null, host: null, focus: null,
  view: viewGet('sec.view', 'map') === 'deal' ? 'deal' : 'map',
  m: secView('map', { q: '', open: new Set() }),
  d: secView('deal', { q: '', type: '', stage: '', open: new Set() }),
};
function secViewSave() {
  viewSet('sec.view', secS.view);
  viewSet('sec.map', { q: secS.m.q, open: [...secS.m.open] });
  viewSet('sec.deal', { q: secS.d.q, type: secS.d.type, stage: secS.d.stage, open: [...secS.d.open] });
}

/* ---------- 데이터 ---------- */
const secStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const secNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const secObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const secArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const secList = (v) => (Array.isArray(v) ? v : []).map(secStr).filter(Boolean);
const secDay = (v) => { const s = secStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const secHttp = (v) => { const s = secStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const secName = (id) => SEC_NAMES[id] || id;
const secPeers = (v) => secArr(v).map((p) => ({ name: secStr(p.name), code: secStr(p.code) })).filter((p) => p.name);

function secNormMap(raw) {
  const seen = new Set();
  const chains = secArr(raw.chains).map((c, i) => {
    const id = secStr(c.id) || `chain-${i}`;
    if (seen.has(id)) return null;
    seen.add(id);
    const f = secObj(c.front_ind), b = secObj(c.back_ind), pe = secObj(c.pe), gap = secObj(c.gap), lane = secStr(c.lane);
    const o = {
      id, idx: i, front: secStr(c.front), back: secStr(c.back), ksic: secList(c.ksic),
      f: { exp: secNum(f.export_yoy), hs: secList(f.export_hs), rev: secNum(f.rev_yoy), ret: secNum(f.ret_1y), per: secNum(f.per), peers: secPeers(f.peers) },
      b: { rev: secNum(b.rev_yoy), ret: secNum(b.ret_1y), per: secNum(b.per), peers: secPeers(b.peers), pn: secNum(b.private_n), pcagr: secNum(b.private_rev_cagr), on: secNum(b.owner_n) },
      pe: { n12: secNum(pe.n12), prev: secNum(pe.n_prev12) }, gap: { per: secNum(gap.per), growth: secNum(gap.growth) },
      lane: SEC_LANES.some(([k]) => k === lane) ? lane : '관찰', why: secStr(c.why), owners: [...new Set(secList(c.owners))].slice(0, 30),
    };
    o.frontName = secStr(c.front_name) || secName(o.front);
    o.backName = secStr(c.back_name) || secName(o.back);
    o.q = [o.frontName, o.backName, secName(o.front), secName(o.back), o.why, ...o.f.peers.map((p) => p.name), ...o.b.peers.map((p) => p.name)].join(' ').toLowerCase();
    return o;
  }).filter(Boolean);
  return { generated: secStr(raw.generated), checked: secDay(raw.checked) || secDay(raw.generated), sources: secObj(raw.sources), chains, byId: new Map(chains.map((c) => [c.id, c])) };
}

function secNormPe(raw) {
  const seen = new Set();
  const deals = secArr(raw.deals).map((x, i) => {
    const id = secStr(x.id) || `deal-${i}`, target = secStr(x.target), sector = secStr(x.sector) || 'etc';
    if (!target || seen.has(id)) return null;
    seen.add(id);
    const news = secArr(x.news).filter((n) => secStr(n.title)).map((n) => ({ title: secStr(n.title), url: secHttp(n.url), date: secDay(n.date), src: secStr(n.src) }))
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      id, date: secDay(x.date), first: secDay(x.first), target, sector, sub: secStr(x.sub), buyer: secStr(x.buyer), seller: secStr(x.seller), sellerKind: secStr(x.seller_kind),
      type: secStr(x.type), stage: secStr(x.stage), size: secNum(x.size), sizeText: secStr(x.size_text), listed: x.listed === true, why: secStr(x.why), news,
    };
  }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  const by = secArr(raw.by_sector).filter((s) => secStr(s.sector)).map((s) => ({
    sector: secStr(s.sector), n12: secNum(s.n12), prev: secNum(s.n_prev12), nq: (Array.isArray(s.n_q) ? s.n_q : []).slice(-8).map((v) => secNum(v) ?? 0),
    amt: secNum(s.amt12), buyers: secList(s.top_buyers), why: secList(s.why),
  }));
  const range = Array.isArray(raw.range) ? raw.range.map(secDay) : [];
  return { generated: secStr(raw.generated), checked: secDay(raw.checked) || secDay(raw.generated), range, sources: secObj(raw.sources), deals, by };
}

// 파일이 아직 없으면(첫 실행 전) 오류가 아니라 '자료 없음'. 한 파일이 깨져도 다른 보기는 그린다
async function secRead(k, norm) {
  let d;
  try { d = await STORE.readText(SEC_FILES[k]); }
  catch (e) { if (e.status === 404) return { data: null, err: '' }; return { data: null, err: e.message || '자료를 읽지 못했습니다' }; }
  if (!d.text) return { data: null, err: '' };
  let raw;
  try { raw = JSON.parse(d.text); } catch { return { data: null, err: `${k === 'map' ? '섹터 지도' : 'PE 딜'} 자료 형식이 올바르지 않습니다` }; }
  return { data: raw && typeof raw === 'object' && !Array.isArray(raw) ? norm(raw) : null, err: '' };
}

function secLoad(force) {
  if (!force && secS.at && Date.now() - secS.at < SEC_TTL) return Promise.resolve();
  if (!secS.loading) {
    secS.loading = (async () => {
      const [m, p] = await Promise.all([secRead('map', secNormMap), secRead('pe', secNormPe)]);
      secS.map = m.data; secS.pe = p.data; secS.err = { map: m.err, pe: p.err };
      secS.at = Date.now();
      TAB_INFO['deals/sector'] = secInfo();
    })().finally(() => { secS.loading = null; });
  }
  return secS.loading;
}

/* ---------- 표시 형식 ---------- */
const SEC_NA = '<span class="muted">–</span>';
const secFmt = (n, d = 1) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });
const secEok = (v) => (v == null ? '–' : `${secFmt(v, 0)}억`);
const secPer = (v) => (v == null ? '–' : `${v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}배`);
// 증감률: 오르면 빨강·내리면 파랑, 부호를 붙인다
const secPct = (v) => {
  if (v == null) return '–';
  const s = `${v > 0 ? '+' : ''}${v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return v === 0 ? s : `<span class="${v > 0 ? 'pe-up' : 'pe-dn'}">${s}</span>`;
};
// 건수 증감 칩(전년 대비)
const secChg = (n, prev) => {
  if (n == null || prev == null || n === prev) return '';
  const d = n - prev;
  return `<span class="ipo-chg ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d}</span>`;
};
const secChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
const secBox = (t, body, sub = '', cls = '') => `<section class="ipo-box${cls ? ` ${cls}` : ''}"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const secKv = (k, v) => `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v || SEC_NA}</div></div>`;
const SEC_NONE = '<p class="ipo-p muted">없음</p>';
const secLane = (l) => `<span class="pe-ds sec-lane sec-l${SEC_LANES.findIndex(([k]) => k === l)}">${esc(l)}</span>`;
const secStageChip = (st) => (st ? `<span class="pe-ds${st === '완료' ? ' on' : st === '무산' ? ' off' : ''}">${esc(st)}</span>` : SEC_NA);
// 값 칸: 넓으면 표 칸(머리글이 이름) + 보조 줄, 좁으면 이름표 + 값 + 보조를 한 줄로(kmx.js kmxCell과 같은 방식)
const secCell = (k, main, sub = '', cls = '') => `<div class="sec-c${cls ? ` ${cls}` : ''}${main || sub ? '' : ' sec-none'}"><span class="sec-k">${k}</span><div class="sec-v"><span>${main || SEC_NA}</span>${sub ? `<span class="ipo-sub">${sub}</span>` : ''}</div></div>`;
const secPeerLinks = (peers) => (peers.length ? peers.map((p) => (/^\d{6}$/.test(p.code)
  ? `<a class="rd-link" href="https://finance.naver.com/item/main.naver?code=${encodeURIComponent(p.code)}" target="_blank" rel="noopener noreferrer">${esc(p.name)}</a>` : esc(p.name))).join(', ') : '');

/* ---------- 섹터 지도 ---------- */
const SEC_MAP_HEAD = '<div class="ipo-head ipo-cols sec-mcols"><div>후방 업종</div><div>전방 성장</div><div>후방 PER</div><div>PE 딜 12개월</div><div class="sec-h-chip">갈래</div></div>';

function secMapList() {
  const d = secS.map; if (!d) return [];
  const q = secS.m.q.trim().toLowerCase();
  return d.chains.filter((c) => !q || c.q.includes(q));
}

function secMapRow(c) {
  const open = secS.m.open.has(c.id), f = c.f, b = c.b;
  const grow = f.exp != null ? `수출 ${secPct(f.exp)}` : f.rev != null ? `매출 ${secPct(f.rev)}` : '';
  const growSub = f.exp != null && f.rev != null ? `매출 ${secPct(f.rev)}` : '';
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(c.id)}">
    <div class="ipo-line ipo-cols sec-mcols">
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(c.backName)}</button><div class="ipo-sub">전방 ${esc(c.frontName)}</div></div>
      ${secCell('전방 성장', grow, growSub)}
      ${secCell('후방 PER', b.per != null ? secPer(b.per) : '', f.per != null ? `전방 ${secPer(f.per)}` : '')}
      ${secCell('PE 딜', c.pe.n12 != null ? `${c.pe.n12}건${secChg(c.pe.n12, c.pe.prev)}` : '', c.pe.prev != null ? `전년 ${c.pe.prev}건` : '')}
      <div class="ipo-c-st">${secLane(c.lane)}${secChev()}</div>
    </div>${open ? secMapDetail(c) : ''}</div>`;
}

// 오너기업 후보: pe.json에 있으면 이름·매출·점수와 함께 오너기업 탭으로 가는 링크, 없으면 코드만
const secPeOk = () => typeof peFocus === 'function' && typeof peS === 'object';
function secOwners(c) {
  if (!c.owners.length) return SEC_NONE;
  const heir = secPeOk() ? peS.data?.heir : null;
  const li = c.owners.map((id) => {
    const x = heir?.byId.get(id), code = id.replace(/^heir:/, '');
    if (!x) return `<li class="sec-own sec-own-x"><b>${esc(code)}</b>${heir ? '<span>오너기업 목록에 없음</span>' : ''}</li>`;
    const sub = [x.last?.rev != null ? `매출 ${secEok(x.last.rev)}` : '', x.score != null ? `${secFmt(x.score, 0)}점` : '', x.pass ? '' : '근접'].filter(Boolean).map((t) => `<span>${t}</span>`).join('');
    return `<li><a class="sec-own" href="#deals/pe" data-sec-own="${esc(id)}"><b>${esc(x.name)}</b>${sub ? `<span class="sec-own-s">${sub}</span>` : ''}</a></li>`;
  }).join('');
  return `<ul class="sec-owns">${li}</ul>`;
}

function secMapDetail(c) {
  const f = c.f, b = c.b;
  const front = `${secKv('업종', esc(secName(c.front)))}${secKv('수출 증가율', f.exp != null ? `${secPct(f.exp)}${f.hs.length ? ` <span class="muted">HS ${esc(f.hs.join(', '))}</span>` : ''}` : '')}
    ${secKv('매출 증가율', f.rev != null ? secPct(f.rev) : '')}${secKv('1년 주가', f.ret != null ? secPct(f.ret) : '')}${secKv('PER', f.per != null ? secPer(f.per) : '')}${secKv('대표 상장사', secPeerLinks(f.peers))}`;
  const back = `${secKv('업종', esc(secName(c.back)))}${secKv('매출 증가율', b.rev != null ? secPct(b.rev) : '')}${secKv('1년 주가', b.ret != null ? secPct(b.ret) : '')}
    ${secKv('PER', b.per != null ? secPer(b.per) : '')}${secKv('대표 상장사', secPeerLinks(b.peers))}
    ${secKv('비상장 외감', b.pn != null ? `${secFmt(b.pn, 0)}곳` : '')}${secKv('비상장 CAGR', b.pcagr != null ? secPct(b.pcagr) : '')}
    ${secKv('PE 딜 12개월', c.pe.n12 != null ? `${c.pe.n12}건${c.pe.prev != null ? `, 전년 ${c.pe.prev}건` : ''}` : '')}`;
  const on = b.on, n = c.owners.length;
  const ownSub = on != null && on > n ? `상위 ${n}곳, 전체 ${secFmt(on, 0)}곳` : on != null ? `${secFmt(on, 0)}곳` : n ? `${n}곳` : '';
  const go = secS.pe ? `<button type="button" class="btn sm sec-go" data-sec-go="${esc(c.back)}">${ico('right', 'sm')}PE 딜에서 보기</button>` : '';
  return `<div class="ipo-detail">
    <div class="ipo-dhead"><p class="ipo-sum1">${c.why ? esc(c.why) : ''}</p>${go}</div>
    <div class="ipo-pane"><div class="ipo-stack">
      <div class="ipo-two-col">${secBox('전방', front, esc(c.frontName))}${secBox('후방', back, esc(c.backName))}</div>
      ${secBox('오너기업 후보', secOwners(c), ownSub)}
    </div></div>
  </div>`;
}

function secMapBody() {
  if (secS.err.map) return `<div class="empty">${esc(secS.err.map)}</div>`;
  const d = secS.map;
  if (!d || !d.chains.length) return '<div class="empty">아직 만들어진 섹터 지도 자료가 없습니다.</div>';
  const list = secMapList();
  if (!list.length) return '<div class="empty">조건에 맞는 업종이 없습니다.</div>';
  return SEC_MAP_HEAD + SEC_LANES.map(([l, t]) => {
    const g = list.filter((c) => c.lane === l);
    return g.length ? `<div class="rd-grp"><b>${l}</b><span>${g.length}개</span><span>${t}</span></div>${g.map(secMapRow).join('')}` : '';
  }).join('');
}

/* ---------- PE 딜 ---------- */
const SEC_DEAL_HEAD = '<div class="ipo-head ipo-cols sec-dcols"><div>업종</div><div>최근 12개월</div><div>8분기 추세</div><div>금액</div><div>주요 인수자</div><div></div></div>';
const secQIdx = (s) => +s.slice(0, 4) * 4 + Math.floor((+s.slice(5, 7) - 1) / 3);
const secQName = (i) => `${String(Math.floor(i / 4)).slice(2)}년 ${(i % 4) + 1}분기`;
const secRef = () => secS.pe?.checked || today();

// 유형·단계 필터를 걸면 by_sector 대신 걸러 낸 딜로 다시 센다(무산 제외는 단계로 무산을 고른 때만 뺀다). 기준은 sector_pe.json checked
function secAgg(deals, stage) {
  const ref = Date.parse(secRef()), rq = secQIdx(secRef()), nq = Array(8).fill(0), bc = new Map();
  let n12 = 0, prev = 0, amt = 0, known = 0;
  deals.forEach((x) => {
    if (!x.date || (x.stage === '무산' && stage !== '무산')) return;
    const age = (ref - Date.parse(x.date)) / 864e5, k = rq - secQIdx(x.date);
    if (k >= 0 && k < 8) nq[7 - k] += 1;
    if (age >= 0 && age < 365) {
      n12 += 1;
      if (x.size != null) { amt += x.size; known += 1; }
      x.buyer.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => bc.set(t, (bc.get(t) || 0) + 1));
    } else if (age >= 365 && age < 730) prev += 1;
  });
  return { n12, prev, nq, amt: known ? amt : null, buyers: [...bc].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t) };
}

function secDealList() {
  const p = secS.pe; if (!p) return [];
  const s = secS.d, q = s.q.trim().toLowerCase(), filt = !!(s.type || s.stage);
  const ds = p.deals.filter((x) => (!s.type || x.type === s.type) && (!s.stage || x.stage === s.stage));
  const by = new Map(p.by.map((b) => [b.sector, b]));
  p.deals.forEach((x) => { if (!by.has(x.sector)) by.set(x.sector, null); });
  return [...by].map(([k, b]) => {
    const deals = ds.filter((x) => x.sector === k), a = filt || !b ? secAgg(deals, s.stage) : b;
    const subs = new Map(); deals.forEach((x) => { if (x.sub) subs.set(x.sub, (subs.get(x.sub) || 0) + 1); });
    const r = { id: k, name: secName(k), n12: a.n12, prev: a.prev, nq: a.nq, amt: a.amt, buyers: a.buyers, why: b?.why || [], deals, subs: [...subs].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([t]) => t) };
    r.q = [k, r.name, ...r.why, ...r.buyers, ...deals.map((x) => `${x.target} ${x.sub} ${x.buyer}`)].join(' ').toLowerCase();
    return r;
  }).filter((r) => (!filt || r.deals.length) && (!q || r.q.includes(q)))
    .sort((a, b) => (b.n12 ?? -1) - (a.n12 ?? -1) || (b.amt ?? -1) - (a.amt ?? -1) || a.name.localeCompare(b.name, 'ko'));
}

// 8분기 막대: 그 업종 안에서 가장 많은 분기를 꽉 찬 높이로, 마지막(이번) 분기만 진하게
function secBars(nq) {
  if (!nq.length) return '';
  const max = Math.max(...nq, 1), rq = secQIdx(secRef());
  const bars = nq.map((v, i) => { const t = `${secQName(rq - (nq.length - 1 - i))} ${v}건`; return `<i class="${v ? '' : 'z'}" style="height:${v ? Math.max(4, Math.round((v / max) * 24)) : 2}px" title="${t}"></i>`; }).join('');
  return `<span class="sec-bars" role="img" aria-label="${esc(nq.map((v, i) => `${secQName(rq - (nq.length - 1 - i))} ${v}건`).join(', '))}">${bars}</span>`;
}

function secDealRow(r) {
  const open = secS.d.open.has(r.id);
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(r.id)}">
    <div class="ipo-line ipo-cols sec-dcols">
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(r.name)}</button>${r.subs.length ? `<div class="ipo-sub">${esc(r.subs.join(', '))}</div>` : ''}</div>
      ${secCell('12개월', r.n12 != null ? `${r.n12}건${secChg(r.n12, r.prev)}` : '', r.prev != null ? `전년 ${r.prev}건` : '')}
      ${secCell('추세', secBars(r.nq), '', 'sec-c-bar')}
      ${secCell('금액', r.amt != null ? secEok(r.amt) : '')}
      <div class="sec-c${r.buyers.length ? '' : ' sec-none'}"><span class="sec-k">인수자</span><div class="sec-v"><span class="rd-clamp">${r.buyers.length ? esc(r.buyers.join(', ')) : SEC_NA}</span></div></div>
      <div class="ipo-c-st">${secChev()}</div>
    </div>${open ? secDealDetail(r) : ''}</div>`;
}

function secDealTr(x, i) {
  const n = x.news[0], more = x.news.length - 1;
  const news = n ? `${n.url ? `<a class="rd-link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer" title="${esc(n.title)}">${esc(n.src || '기사')}</a>` : esc(n.src || '기사')}${more > 0 ? ` <span class="muted sec-n2">외 ${more}</span>` : ''}` : SEC_NA;
  const size = x.size != null ? secEok(x.size) : x.sizeText ? esc(x.sizeText) : SEC_NA;
  return `<tr${i >= SEC_DEAL_N ? ' class="sec-more"' : ''}>
    <td>${x.date ? yymd(x.date) : '–'}</td>
    <td><b class="sec-tgt">${esc(x.target)}</b>${x.sub ? `<div class="ipo-sub">${esc(x.sub)}</div>` : ''}${x.why ? `<div class="sec-why">${esc(x.why)}</div>` : ''}</td>
    <td${x.buyer ? '' : ' class="sec-none"'}><span class="sec-tk">인수</span>${x.buyer ? esc(x.buyer) : SEC_NA}${x.seller ? `<div class="ipo-sub">매도 ${esc(x.seller)}</div>` : ''}</td>
    <td${x.type ? '' : ' class="sec-none"'}>${x.type ? esc(x.type) : SEC_NA}</td><td${x.stage ? '' : ' class="sec-none"'}>${secStageChip(x.stage)}</td><td${size === SEC_NA ? ' class="sec-none"' : ''}>${size}</td><td${x.news.length ? '' : ' class="sec-none"'}>${news}</td></tr>`;
}

function secDealDetail(r) {
  const more = r.deals.length - SEC_DEAL_N;
  const tbl = r.deals.length ? `<table class="ipo-tbl sec-dt"><thead><tr><th>날짜</th><th>대상</th><th>인수자</th><th>유형</th><th>단계</th><th>금액</th><th>기사</th></tr></thead>
    <tbody>${r.deals.map(secDealTr).join('')}</tbody></table>${more > 0 ? `<button type="button" class="btn sm sec-morebtn" data-sec-more>나머지 ${more}건 보기</button>` : ''}` : SEC_NONE;
  const why = r.why.length ? secBox('인수 이유', `<ul class="ipo-ul">${r.why.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`, '최근 12개월') : '';
  return `<div class="ipo-detail"><div class="ipo-stack">${why}${secBox('딜', tbl, r.deals.length ? `${r.deals.length}건` : '', 'sec-dbox')}</div></div>`;
}

function secDealBody() {
  if (secS.err.pe) return `<div class="empty">${esc(secS.err.pe)}</div>`;
  const p = secS.pe;
  if (!p || (!p.deals.length && !p.by.length)) return '<div class="empty">아직 수집된 PE 딜 자료가 없습니다.</div>';
  const list = secDealList();
  if (!list.length) return '<div class="empty">조건에 맞는 딜이 없습니다.</div>';
  return SEC_DEAL_HEAD + list.map(secDealRow).join('');
}

/* ---------- 요약 줄·보기 전환·필터 ---------- */
function secSummary() {
  const map = secS.view === 'map', d = map ? secS.map : secS.pe; if (!d) return '';
  const old = d.checked && (Date.now() - new Date(`${d.checked}T00:00:00`)) / 864e5 > SEC_STALE;
  const parts = map
    ? SEC_LANES.map(([l]) => `<span>${l} <b>${d.chains.filter((c) => c.lane === l).length}</b></span>`)
    : (() => { const l = secDealList(); return [`<span>최근 12개월 딜 <b>${l.reduce((a, r) => a + (r.n12 || 0), 0)}</b></span>`, `<span>업종 <b>${l.length}</b></span>`]; })();
  // ok로 시작하지 않는 출처만 이름으로(값은 마우스를 올리면) — pe.js·kmx.js와 같다
  const bad = Object.entries(d.sources).filter(([, v]) => !/^ok/i.test(secStr(v))).map(([k, v]) => `<span class="ipo-stale" title="${esc(secStr(v))}">${esc(k)} 확인 필요</span>`);
  return `${d.checked ? `<span class="${old ? 'ipo-stale' : ''}">기준일 ${yymd(d.checked)}</span>` : ''}${parts.join('')}${bad.join('')}`;
}

function secViewHtml() {
  const n = { map: secS.map ? secS.map.chains.length : null, deal: secS.pe ? secS.pe.by.reduce((a, b) => a + (b.n12 || 0), 0) : null };
  return `<div class="seg" role="tablist">${SEC_VIEWS.map(([k, l]) => `<button type="button" role="tab" data-sec-v="${k}" class="${secS.view === k ? 'on' : ''}" aria-selected="${secS.view === k}">${l}${n[k] != null ? `<span class="pe-gn">${n[k]}</span>` : ''}</button>`).join('')}</div>`;
}

const secSeg = (attr, opts, cur) => `<div class="seg">${[['', '전체'], ...opts.map((o) => [o, o])].map(([k, l]) => `<button type="button" data-${attr}="${esc(k)}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('')}</div>`;
function secFilterHtml() {
  const map = secS.view === 'map', s = map ? secS.m : secS.d;
  const search = `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="sec-q" type="search" placeholder="${map ? '업종 검색' : '업종·회사 검색'}" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div></div>`;
  if (map) return search;
  return `${search}<div class="ipo-filter sec-finf"><div class="rd-fing"><span class="rd-finl">유형</span>${secSeg('sec-type', SEC_TYPES, s.type)}</div>
    <div class="rd-fing"><span class="rd-finl">단계</span>${secSeg('sec-stage', SEC_STAGES, s.stage)}</div></div>`;
}

/* ---------- 그리기 ---------- */
function secDraw() {
  const h = secS.host; if (!h || !h.isConnected) return;
  const b = h.querySelector('#sec-body'); if (b) b.innerHTML = secS.view === 'map' ? secMapBody() : secDealBody();
  const s = h.querySelector('#sec-sum'); if (s) s.innerHTML = secSummary();
  const v = h.querySelector('#sec-view'); if (v) v.innerHTML = secViewHtml();
  secViewSave();
  if (secS.focus != null && b) {
    const r = [...b.querySelectorAll('.ipo-row[data-id]')].find((x) => x.dataset.id === secS.focus);
    secS.focus = null;
    if (r) r.scrollIntoView({ block: 'start' });
  }
}

function secViewSet(v) {
  if (secS.view === v || !secS.host) return;
  secS.view = v;
  const root = secS.host.querySelector('#sec-root');
  root.classList.toggle('sec-map', v === 'map'); root.classList.toggle('sec-deal', v === 'deal');
  root.querySelector('#sec-filter').innerHTML = secFilterHtml();
  secDraw();
}

function secRowRedraw(row) {
  const id = row.dataset.id;
  if (secS.view === 'map') { const c = secS.map?.byId.get(id); if (c) row.outerHTML = secMapRow(c); return; }
  const r = secDealList().find((x) => x.id === id); if (r) row.outerHTML = secDealRow(r);
}

function secBind(root) {
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const vb = t.closest('[data-sec-v]'); if (vb) { secViewSet(vb.dataset.secV); return; }
    const tb = t.closest('[data-sec-type]'); if (tb) { secS.d.type = tb.dataset.secType; segOn('[data-sec-type]', tb); secDraw(); return; }
    const sb = t.closest('[data-sec-stage]'); if (sb) { secS.d.stage = sb.dataset.secStage; segOn('[data-sec-stage]', sb); secDraw(); return; }
    if (t.closest('#sec-ref')) {
      secLoad(true).then(secDraw).catch((e) => toast(e.message));
      if (secPeOk() && typeof peLoad === 'function') peLoad(true).then(secDraw).catch(() => {});
      return;
    }
    // 오너기업 이동은 링크(#deals/pe)가 한다. 그 전에 오너기업 탭이 필터를 풀고 그 회사를 펼쳐 두게
    const ob = t.closest('[data-sec-own]'); if (ob) { if (secPeOk()) peFocus(`pe:${ob.dataset.secOwn}`); return; }
    const gb = t.closest('[data-sec-go]');
    if (gb) {
      const k = gb.dataset.secGo, s = secS.d;
      s.q = ''; s.type = ''; s.stage = ''; s.open.add(k); secS.focus = k;
      secS.view = 'deal';
      root.classList.remove('sec-map'); root.classList.add('sec-deal');
      root.querySelector('#sec-filter').innerHTML = secFilterHtml();
      secDraw();
      return;
    }
    const mb = t.closest('[data-sec-more]'); if (mb) { mb.closest('.sec-dbox')?.classList.add('sec-all'); mb.remove(); return; }
    if (t.closest('a, input, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]'); if (!row) return;
    const s = secS.view === 'map' ? secS.m : secS.d, id = row.dataset.id;
    if (s.open.has(id)) s.open.delete(id); else s.open.add(id);
    secViewSave();
    secRowRedraw(row);
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'sec-q') { (secS.view === 'map' ? secS.m : secS.d).q = ev.target.value; secDraw(); } });
}

async function renderSector(host) {
  secS.host = host;
  host.innerHTML = `<div class="ipo-page sec-page sec-${secS.view}" id="sec-root">
    <div class="pe-grp" id="sec-view">${secViewHtml()}</div>
    <div class="ipo-top"><div class="ipo-sumrow" id="sec-sum">${secSummary()}</div>
      ${infoBtn('deals/sector')}
      <button class="btn ghost" type="button" id="sec-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div id="sec-filter">${secFilterHtml()}</div>
      <div class="ipo-body" id="sec-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  secBind(host.querySelector('#sec-root'));
  // 오너기업 후보 이름은 pe.json에서(5분 캐시). 다 읽으면 펼친 행을 다시 그린다
  if (secPeOk() && typeof peLoad === 'function') peLoad().then(() => { if (secS.host === host && secS.at) secDraw(); }).catch(() => { if (secS.host === host && secS.at) secDraw(); });
  try { await secLoad(); }
  catch (e) {
    const b = secS.host === host && host.querySelector('#sec-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (secS.host === host && host.isConnected) secDraw();
}

/* ---------- 화면 설명(ⓘ) — 판단 기준은 딜레이더 sector_map.py 머리 주석과 노트 10절 ---------- */
function secInfo() {
  const m = secS.map, p = secS.pe;
  const asof = [m?.checked ? `섹터 지도 기준일 ${m.checked}` : '', p?.checked ? `PE 딜 기준일 ${p.checked}` : '', p?.range?.[0] ? `기사 ${p.range[0]}부터` : ''].filter(Boolean).join(', ');
  return {
    title: '섹터',
    asof: `${asof || '기준일 –'}, 출처 관세청 품목별 수출, DART 재무, 시세, 감사보고서, PE 딜 기사`,
    rows: [
      ['무엇인가', [
        '어느 업종의 회사를 찾아볼지 정하는 화면입니다. 섹터 지도와 PE 딜 두 보기로 나뉩니다.',
        '섹터 지도는 완제품을 파는 전방 업종과 그 전방에 부품, 소재, 포장재를 대는 후방 업종을 짝지어 봅니다. 우리가 찾는 회사는 후방 업종의 비상장 회사입니다.',
        'PE 딜은 최근 2년 동안 기사로 나온 PE의 인수, 소수지분 투자, 회수 매각을 업종별로 센 것입니다.',
      ]],
      ['왜 보나', [
        '전방이 크면 후방 회사의 주문도 따라 늘어납니다. 이런 업종에서 오너기업을 찾으면 성장 이야기가 분명합니다.',
        '모멘텀은 전방이 크고 PE 딜도 몰리는 업종입니다. 이미 경쟁이 있지만 다른 PE가 몰린다는 것 자체가 업종이 뜨고 있다는 신호라 같이 봅니다.',
        '소외는 전방은 크는데 PE가 덜 몰리고 후방 상장사가 싸게 거래되는 업종입니다. K-화장품은 잘 팔리는데 화장품 용기 회사는 시장에서 소외된 경우가 예입니다. 경쟁이 적고 가격이 낮을 때 들어갈 수 있습니다.',
        '관찰은 두 갈래 기준에 들지 않은 업종입니다. 숫자가 바뀌면 다음 주에 갈래가 바뀔 수 있습니다.',
      ]],
      ['어떻게 보나', [
        '섹터 지도는 갈래별로 묶여 있습니다. 행에는 후방 업종과 전방 업종 이름, 전방 수출과 매출 증가율, 후방 상장사 PER과 전방 PER, 후방 업종의 최근 12개월 PE 딜 수와 전년 대비 증감이 있습니다.',
        '전방 수출 증가율은 관세청 품목 기준 최근 12개월 값이고, 매출 증가율과 PER은 대표 상장사 값의 중앙값입니다. 오르면 빨강, 내리면 파랑입니다.',
        '행을 누르면 판단 이유, 전방과 후방의 대표 상장사, 후방 업종의 비상장 외감 회사 수, 오너기업 후보가 나옵니다. 오너기업 후보를 누르면 오너기업 탭의 그 회사가 펼쳐집니다. PE 딜에서 보기를 누르면 그 업종의 딜 목록으로 갑니다.',
        'PE 딜은 업종별 최근 12개월 딜 수, 전년 같은 기간 대비 증감, 최근 8분기 추세, 알려진 금액 합계, 자주 나온 인수자입니다. 무산된 딜은 세지 않습니다. 막대는 업종마다 가장 많은 분기를 기준으로 그리고 이번 분기만 진하게 표시합니다.',
        '유형과 단계를 고르면 그 조건에 맞는 딜만으로 다시 셉니다. 행을 누르면 그 업종의 인수 이유와 딜 목록이 나오고, 기사 이름을 누르면 원문이 열립니다.',
        '자료는 매주 월요일에 새로 만듭니다. 기준일이 8일 넘게 지나면 빨간 글씨로 표시합니다.',
      ]],
      ['그래서 할 일', [
        '소외 업종은 오너기업 후보를 펼쳐 재무와 주주를 보고, 경쟁이 붙기 전에 먼저 연락할 곳을 고릅니다.',
        '모멘텀 업종은 PE 딜 목록에서 어느 운용사가 어떤 이유로 샀는지 보고, 같은 논리가 통하는 비상장 회사를 찾습니다.',
        '관찰 업종은 숫자 변화만 봐 두고, 갈래가 바뀌면 다시 살펴봅니다.',
      ]],
    ],
  };
}
TAB_INFO['deals/sector'] = secInfo();
