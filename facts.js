/* SPACE WORKS — 딜소싱 › 팩트시트: 행사 참가기업 등 따로 조사한 회사별 PE 딜소싱 Fact Sheet 보기
   데이터: 팀 파일함 '_웍스/팩트시트/factsheets.json'(+ img/<no>_<n>.jpg) — 팀원이면 누구나 읽는다(읽기 전용 화면).
   만드는 곳: 스페이스인베\05. 딜소싱\02. 행사·IR\K-Beauty Expo 2026\build_factsheets.py (엑셀과 같은 자료로 한 번에 만든다).
   엑셀 원본: 팀 파일함 '05. 딜소싱/02. 행사·IR/K-Beauty Expo 2026/<xlsx>'(11/18 옮김).
   진입: renderFacts(host) — host 안에만 그린다. 다른 화면에서 한 회사를 펼칠 때: factsFocus(no).
   app.js 전역($, esc, pad, ico, toast, G, CFG, openSheet, TAB_INFO, infoBtn)과 ipo.css(목록·상자 클래스), pipeline.js 의 pipeAdd·pipeHas(있을 때만)를 쓴다. */

const FS_DIR = '_웍스/팩트시트';
const FS_TTL = 10 * 60000;
// 묶음별 칩 줄(상장 준비 화면과 같은 방식, 묶음끼리는 함께 걸림). 값 = [키, 이름, 통과 조건]. 요청자 묶음은 자료에서 만든다(fsWhoList)
const fsInvested = (x) => x.rounds.length > 0 || x.total > 0;
const FS_FG = [
  ['rev', '최근 매출', [['', '전체'], ['100', '100억+', (x) => x.r25 >= 100], ['300', '300억+', (x) => x.r25 >= 300], ['500', '500억+', (x) => x.r25 >= 500], ['1000', '1,000억+', (x) => x.r25 >= 1000]]],
  ['opm', 'OPM', [['', '전체'], ['pos', '흑자', (x) => x.o25 > 0], ['5', '5%+', (x) => x.opm >= 0.05], ['10', '10%+', (x) => x.opm >= 0.1], ['15', '15%+', (x) => x.opm >= 0.15]]],
  ['gr', '매출 성장', [['', '전체'], ['neg', '역성장', (x) => x.cagr < 0], ['0', '0%+', (x) => x.cagr >= 0], ['20', '20%+', (x) => x.cagr >= 0.2], ['50', '50%+', (x) => x.cagr >= 0.5]]],
  ['stg', '투자 단계', [['', '전체'], ['none', '외부 투자 없음', (x) => !fsInvested(x)], ['inv', '투자 이력 있음', fsInvested], ['sale', '매각 추진', (x) => /매각/.test(x.stage)],
    ['ipo', 'IPO 준비', (x) => /IPO|상장 ?준비|주관사/i.test(x.stage)], ['own', 'PE·SI 보유', (x) => /PEF?\b|SI\b|자회사|계열|편입|바이아웃/.test(x.stage) && !/없음|미확인/.test(x.stage)]]],
];
const FS_SORTS = [['req', '최신 요청순'], ['rev', '최근 매출순'], ['total', '누적 투자순'], ['op', '영업이익순'], ['grow', '매출 성장률순'], ['opm', '영업이익률순'], ['no', '목록 번호순']];
const FS_EXPO = '엑스포 목록'; // K-Beauty Expo 2026 목록에서 온 회사의 요청자 칸
// 테마(2026-11-24 사용자 "팩트시트에 방산/항공우주 테마로 하나"): 요청 기록·팩트시트의 theme(fs_req.py THEMES 자동 요청), 엑스포 목록 회사는 K-Beauty. 묶음 단추 말고 필터로만
const FS_KB_THEME = 'K-Beauty';
const FS_TABS = [['inv', '투자유치·컨택'], ['ov', '개요'], ['biz', '사업·브랜드'], ['prod', '제품'], ['fin', '재무·주주'], ['view', '투자 판단']];
const fsS = { data: null, at: 0, loading: null, q: viewGet('fs.q', ''), fl: { thm: '', rev: '', opm: '', gr: '', stg: '', who: '', ...viewGet('fs.fl', {}) }, sort: viewGet('fs.sort2', 'req'), tab: viewGet('fs.tab', 'inv'), open: new Set(viewGet('fs.open', [])), focus: null, host: null, imgs: new Map() };

TAB_INFO['deals/facts'] = { title: '팩트시트', asof: '딜소싱 각 화면에서 요청한 회사와 K-Beauty Expo 2026 참가기업 목록(2026-11-06, 대표님이 고른 40곳)', rows: [
  ['무엇인가', '팩트시트를 요청한 회사와 엑스포 목록 회사를 공통 양식(PE 딜소싱 Fact Sheet)으로 한 장씩 조사한 자료입니다.'],
  ['왜 보나', '컨택 전에 회사가 무엇을 하고, 얼마나 벌고, 누가 지분을 갖고 있으며, 누구에게 어떻게 연락할지를 한 화면에서 봅니다.'],
  ['어떻게 보나', [
    '기본은 최신 요청순입니다. 요청 칸에 요청한 사람과 날짜가 나오고, 엑스포 목록 회사는 목록 작성일(2026-11-06)로 뒤에 옵니다. 파이프라인에 올린 딜은 자동으로 요청되어 \'파이프라인 자동\'으로 나옵니다.',
    '테마는 방산·항공우주와 K-Beauty(엑스포 목록)입니다. 투자 라운드에서 방산·항공우주로 분류된 회사는 새로 걸릴 때마다 요청자 \'방산 테마 자동\'으로 팩트시트가 요청됩니다.',
    '필터는 테마, 최근 매출, OPM, 매출 성장(최근 2년 연평균), 투자 단계, 요청자 묶음이고 묶음끼리는 함께 걸립니다. 매출은 가장 최근 연간 실적이고, 2025년이 아니면 연도를 같이 적었습니다.',
    '회사를 펼치면 첫 칸에 이전 투자유치 히스토리(VC·PE·정책금융·메자닌)와 컨택 방법이 나옵니다. 이어서 개요·사업·브랜드·제품·재무·주주·투자 판단 칸이 있습니다.',
    '목록의 \'현재 투자 단계\'는 지금 지분·투자 상태이고, \'누적 투자\'는 외부 투자자가 신주·메자닌(RCPS·CB·BW)으로 넣은 돈의 합입니다. 창업자·가족 증자, 구주 거래, 경영권 인수 대금은 더하지 않고 단계에 적었습니다.',
    '요청한 회사는 매일 11:00·16:00에 처리되고, 처리 전에는 투자 단계 칸에 처리 시각이 나옵니다. 펼치면 원래 화면으로 가는 링크와 다시 요청 단추가 있습니다.',
    '회사 이름 옆 \'PDF n\'은 회사 홈페이지에서 받은 회사소개서·브로슈어·카탈로그가 있다는 표시이고, 펼친 \'투자유치·컨택\' 칸에서 엽니다. 엑스포 목록 40곳의 회사별 엑셀은 팀 파일함 05. 딜소싱/02. 행사·IR/K-Beauty Expo 2026에 있습니다.',
    '재무는 DART 감사보고서, 사람인(NICE), IR 값이고 단위는 억원입니다. \'확인 필요\'는 공개 자료로 확인하지 못한 칸입니다.',
    '엑셀 다운로드는 지금 거른 목록을 보이는 순서대로 받습니다.',
  ]],
  ['그래서 할 일', [
    '볼 회사는 \'파이프라인에 올리기\'로 넘겨 단계와 다음 할 일을 관리합니다.',
    '주주 현황이 \'확인 필요\'인 회사는 미팅 전에 법인등기부와 감사보고서 주석으로 확인합니다.',
  ]],
] };

/* ---------- 데이터 ---------- */
const fsUrl = (rel) => `/drives/${CFG.teamDrive}/root:/${rel.split('/').map(encodeURIComponent).join('/')}:`;
function fsLoad(force) {
  if (!force && fsS.at && Date.now() - fsS.at < FS_TTL) return Promise.resolve();
  if (!fsS.loading) {
    fsS.loading = (async () => {
      let d;
      try { d = JSON.parse(await G.get(`${fsUrl(`${FS_DIR}/factsheets.json`)}/content`, { type: 'text' }) || 'null'); }
      catch (e) { if (e.status === 404) d = null; else if (e instanceof SyntaxError) throw new Error('팩트시트 자료 형식이 올바르지 않습니다'); else throw e; }
      if (d && (typeof d !== 'object' || !Array.isArray(d.items))) throw new Error('팩트시트 자료 형식이 올바르지 않습니다');
      if (d) d.items = d.items.filter((x) => x && typeof x === 'object' && x.no != null && x.name).map(fsNorm);
      fsS.data = d; fsS.at = Date.now();
    })().finally(() => { fsS.loading = null; });
  }
  return fsS.loading;
}

function fsNorm(x) {
  const f = x.fin || {}, v = (y, i) => { const n = (f[y] || [])[i]; return typeof n === 'number' ? n : null; };
  const r23 = v('2023', 0), r24 = v('2024', 0), r25 = v('2025', 0), o25 = v('2025', 1);
  const cagr = r23 > 0 && r25 > 0 ? (r25 / r23) ** 0.5 - 1 : r24 > 0 && r25 > 0 ? r25 / r24 - 1 : null;
  const top = (x.shareholders?.rows || [])[0] || {}, inv = x.invest && typeof x.invest === 'object' ? x.invest : {};
  const rounds = Array.isArray(inv.rounds) ? inv.rounds.filter((r) => r && typeof r === 'object') : [];
  const ir = Array.isArray(x.ir) ? x.ir.filter((o) => o && typeof o === 'object') : [];
  const stage = typeof inv.stage === 'string' ? inv.stage : '', total = typeof inv.total === 'number' ? inv.total : null;
  return { ...x, key: String(x.no), r25, o25, opm: r25 > 0 && o25 != null ? o25 / r25 : null, cagr, top, inv, rounds, ir, stage, total,
    _q: [x.name, x.title, x.eng, x.booth, x.overview?.['산업군 / 섹터'], x.overview?.['대표자'], x.business?.['주요 제품'], top.name, stage, inv.summary, inv.current_fi, rounds.map((r) => r.investors).join(' ')].join(' ').toLowerCase() };
}

/* ---------- 표시 형식 ---------- */
const fsEok = (v) => (v == null ? '–' : `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`);
const fsPct = (r, sign) => (r == null ? '–' : `${sign && r > 0 ? '+' : ''}${(r * 100).toFixed(1)}%`);
const fsTotal = (v) => (v == null ? '–' : v === 0 ? '없음' : fsEok(v)); // 누적 투자: 0 = 외부 투자 없음
const fsT = (s) => esc(s == null || s === '' ? '–' : s).replace(/확인 필요/g, '<span class="fs-chk">확인 필요</span>');
const fsUrlOf = (u) => (u ? (/^https?:\/\//i.test(u) ? u : `http://${u.replace(/^https?:\/?\/?/i, '')}`) : '');
const fsKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${esc(k)}</div><div class="v">${fsT(v)}</div></div>` : '');
// 값 + 그 아래 작은 보조 줄('·'로 잇지 않는다)
const fsKvSub = (k, v, s) => (v ? `<div class="ipo-kv"><div class="k">${esc(k)}</div><div class="v">${fsT(v)}${s ? `<div class="fs-vsub">${fsT(s)}</div>` : ''}</div></div>` : '');
const fsKvs = (obj, keys) => keys.map((k) => fsKv(k, obj?.[k])).join('');
const fsList = (a) => (a?.length ? `<ul class="ipo-ul">${a.map((s) => `<li>${fsT(s)}</li>`).join('')}</ul>` : '<p class="ipo-p muted">없음</p>');
const fsNums = (s) => { const p = String(s || '').split(/\s*(?=[①②③④⑤⑥⑦⑧⑨]|Step \d)/).map((t) => t.replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '').replace(/\s*→\s*$/, '').trim()).filter(Boolean); return p.length > 1 ? `<ol class="ipo-ol">${p.map((t) => `<li>${fsT(t)}</li>`).join('')}</ol>` : `<p class="ipo-p">${fsT(s)}</p>`; };
const fsBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${esc(t)}${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;

/* ---------- 목록: 요청한 회사(fs_req.json·fs.json, fsq.js)와 엑스포 목록(factsheets.json)을 한 목록으로 (2026-11-24 사용자 "K-Beauty 구분 없애")
   같은 회사가 둘 다 있으면 요청 쪽 한 줄로(kbKey = 엑스포 목록 번호. factsFocus·파이프라인 facts:<no>도 이 줄을 찾는다).
   요청자 = 요청 기록 by(파이프라인 딜은 올릴 때 자동 요청이라 '파이프라인 자동'), 요청 없이 만든 옛 주관사 선정 팩트시트는 '자동 작성', 엑스포 목록은 FS_EXPO와 목록 작성일 ---------- */
const fsNm = (s) => String(s || '').replace(/\(주\)|㈜|주식회사|유한회사|\s/g, '').toLowerCase();
// 요청 팩트시트 손익(finList 첫 회사)의 목록 수치: 가장 최근 연간 실적, 성장은 2년 전(없으면 1년 전) 대비 연평균
function fsReqNums(x) {
  const p = Array.isArray(x.finList) ? x.finList[0] : null, ys = p?.years && typeof p.years === 'object' ? p.years : {};
  const num = (y, i) => { const v = Array.isArray(ys[y]) ? ys[y][i] : null; return typeof v === 'number' ? v : null; };
  const fy = Object.keys(ys).filter((y) => /^\d{4}$/.test(y)).sort().reverse().find((y) => num(y, 0) != null) || '';
  const r = num(fy, 0), o = num(fy, 1), r2 = fy ? num(String(fy - 2), 0) : null, r1 = fy ? num(String(fy - 1), 0) : null;
  return { fy, r25: r, o25: o, opm: r > 0 && o != null ? o / r : null, cagr: r2 > 0 && r > 0 ? (r / r2) ** 0.5 - 1 : r1 > 0 && r > 0 ? r / r1 - 1 : null };
}
function fsAll() {
  const d = fsS.data, kb = d ? d.items.map((x) => ({ ...x, kind: 'kb', fy: '2025', theme: FS_KB_THEME, by: FS_EXPO, at: String(d.generated || ''), src: '' })) : [];
  const req = typeof fqItems === 'function' && fqS.at && !fqS.err ? fqItems() : [];
  const used = new Set();
  const rq = req.map((q) => {
    const r = fqS.req.find((y) => y.key === q.key), fs = q.st.fs;
    let x = null;
    try { x = fs ? fsFromReq(q.key, fs, q.name) : null; } catch { x = null; }
    const k = kb.find((y) => !used.has(y.key) && fsNm(y.name) === fsNm(q.name));
    if (k) used.add(k.key);
    const base = x ? { ...x, ...fsReqNums(x), ir: [] } : k || { r25: null, o25: null, opm: null, cagr: null, stage: '', total: null, rounds: [], ir: [], fy: '', overview: {}, _q: '' };
    return { ...base, key: q.key, kbKey: k?.key || '', name: q.name, kind: 'req', st: q.st, src: q.src, theme: String(r?.theme || fs?.theme || (k ? FS_KB_THEME : '')),
      by: r?.by || (fs ? '자동 작성' : ''), at: String(r?.at || fs?.madeAt || ''), _q: `${base._q || ''} ${q.name} ${q.src} ${r?.by || ''}`.toLowerCase() };
  });
  return [...rq, ...kb.filter((x) => !used.has(x.key))];
}
const fsFind = (k) => { const s = String(k); return fsAll().find((x) => x.key === s || x.kbKey === s); };
// 요청자 칩: 사람(많이 요청한 순), 자동 요청, 엑스포 목록 순
const fsWhoRank = (w) => (w === FS_EXPO ? 2 : /자동/.test(w) ? 1 : 0);
const fsWhoList = (a) => { const m = new Map(); a.forEach((x) => { if (x.by) m.set(x.by, (m.get(x.by) || 0) + 1); }); return [...m].sort((p, q) => fsWhoRank(p[0]) - fsWhoRank(q[0]) || q[1] - p[1]); };

function fsListItems() {
  const q = fsS.q.trim().toLowerCase();
  let a = fsAll().filter((x) => !q || x._q.includes(q));
  FS_FG.forEach(([g, , opts]) => { const o = opts.find(([k]) => k && k === fsS.fl[g]); if (o) a = a.filter(o[2]); });
  if (fsS.fl.who) a = a.filter((x) => x.by === fsS.fl.who);
  if (fsS.fl.thm) a = a.filter((x) => x.theme === fsS.fl.thm);
  const n = (v) => (v == null ? -Infinity : v), at = (x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0);
  const no = (x, y) => (x.kind !== y.kind ? (x.kind === 'kb' ? -1 : 1) : x.kind === 'kb' ? x.no - y.no : at(x, y));
  const by = { req: at, rev: (x, y) => n(y.r25) - n(x.r25), total: (x, y) => n(y.total) - n(x.total), op: (x, y) => n(y.o25) - n(x.o25), grow: (x, y) => n(y.cagr) - n(x.cagr), opm: (x, y) => n(y.opm) - n(x.opm), no }[fsS.sort] || at;
  return a.sort(by);
}

// 요청한 회사의 처리 상태(투자 단계 칸 아래 줄)
const fsReqState = (st) => (!st ? '' : st.failed ? '<span class="fq-bad">만들지 못함</span>' : st.wait ? `<span class="fq-wait">${fqNext()} 처리</span>` : '');
const fsOpen = (x) => fsS.open.has(x.key) || (!!x.kbKey && fsS.open.has(x.kbKey));
function fsRow(x, i) {
  const open = fsOpen(x), sec = x.overview?.['산업군 / 섹터'] || x.biz || x.src || '';
  const fy = x.fy && x.fy !== '2025' && x.r25 != null ? x.fy : '', stt = x.kind === 'req' ? fsReqState(x.st) : '';
  const day = x.at ? yymd(x.at.slice(0, 10)) : '';
  return `<div class="ipo-row${open ? ' open' : ''}" data-fs="${esc(x.key)}">
    <div class="ipo-line fs-cols">
      <div class="fs-c-no">${i + 1}</div>
      <div class="fs-c-name"><div class="fs-name-l"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name)}</button>${x.ir.some((d) => d.file || d.url) ? `<span class="chip line fs-ir" title="IR·회사 자료 ${x.ir.length}건(펼치면 투자유치·컨택 칸에 있음)">PDF ${x.ir.length}</span>` : ''}</div><div class="ipo-sub">${esc(sec)}</div>
        <dl class="fs-mg"><div><dt>${fy ? `${fy} ` : ''}매출</dt><dd>${fsEok(x.r25)}</dd></div><div><dt>요청${day ? ` ${esc(day)}` : ''}</dt><dd>${esc(x.by || '–')}</dd></div></dl></div>
      <div class="fs-c-by">${esc(x.by || '–')}<div class="ipo-sub">${esc(day)}</div></div>
      <div class="fs-c-rev">${fsEok(x.r25)}${x.r25 != null || x.o25 != null ? `<div class="ipo-sub">${fy ? `${fy}년 ` : ''}영업이익 ${fsEok(x.o25)}</div>` : ''}</div>
      <div class="fs-c-opm">${fsPct(x.opm)}</div>
      <div class="fs-c-grow"><span class="${x.cagr > 0 ? 'fs-up' : x.cagr < 0 ? 'fs-dn' : ''}">${fsPct(x.cagr, true)}</span></div>
      <div class="fs-c-stage${x.rounds.length ? ' has' : ''}">${x.stage ? fsT(x.stage) : stt ? '' : '<span class="muted">–</span>'}${stt ? `<div class="ipo-sub">${stt}</div>` : ''}</div>
      <div class="fs-c-total">${fsTotal(x.total)}</div>
      <div class="fs-c-chev"><span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span></div>
    </div>${open ? (x.kind === 'req' ? fsReqDetail(x) : fsDetail(x)) : ''}</div>`;
}

/* 요청한 회사 펼친 칸: 팩트시트 칸(fsq.js fqInner: 상태, 다시 요청, 탭 화면) + 원래 화면 링크·파이프라인 */
function fsReqDetail(x) {
  const r = fqS.req.find((y) => y.key === x.key);
  if (!fqS.ctx.has(x.key)) fqS.ctx.set(x.key, { name: x.name, label: x.src, legacy: null, hint: () => r?.hint || '' });
  const tab = typeof ppTabOf === 'function' ? ppTabOf(x.key) : null;
  const go = (tab ? `<a class="ipo-a" href="${tab[0]}" data-fq-go="${esc(x.key)}">${esc(x.src || tab[1])}에서 보기${ico('right', 'sm')}</a>` : '') + (typeof fqPipe === 'function' ? fqPipe(x) : '');
  return `<div class="ipo-detail"><div class="ipo-pane"><div class="fq-box" data-fq="${esc(x.key)}">${fqInner(x.key, go)}</div></div></div>`;
}

function fsPipe(x) {
  if (typeof pipeAdd !== 'function') return '';
  const ref = `facts:${x.key}`;
  let has = false;
  try { has = typeof pipeHas === 'function' && !!pipeHas(ref); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(ref)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-fs-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}

function fsDetail(x) {
  return `<div class="ipo-detail">
    <div class="ipo-dhead"><p class="ipo-sum1">${esc(x.business?.['사업 정의'] || '')}</p>${fsPipe(x)}</div>
    ${fsTabsPane(x)}
  </div>`;
}
// attr = 탭 버튼 속성(팩트시트 목록은 data-fs-tab, 요청한 회사·다른 화면 칸은 data-fq-tab). 탭 기억은 같이 쓴다
function fsTabsPane(x, attr = 'data-fs-tab') {
  const tabs = FS_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${fsS.tab === k}" class="${fsS.tab === k ? 'on' : ''}" ${attr}="${k}">${k === 'biz' && !fsHas(x.brand) ? '사업' : l}</button>`).join('');
  return `<div class="ipo-tabs" role="tablist">${tabs}</div>
    <div class="ipo-pane">${fsPane(x)}</div>`;
}
const fsHas = (o) => !!o && typeof o === 'object' && Object.values(o).some((v) => v != null && String(v).trim() && v !== '-');

/* 요청한 회사 팩트시트(fs.json, fs_req.py)를 K-Beauty와 같은 화면으로(2026-11-16 사용자 "동일한 형식이어야").
   새 형식(overview·invest 등 K-Beauty와 같은 키)은 그대로, 옛 형식(biz·product·deal 평면)은 칸을 옮겨 담는다.
   손익은 회사가 여럿일 수 있는 목록 형식([{co, basis, src, years}])이라 finList로 따로 두고 rdPnl로 그린다 */
function fsFromReq(ref, f, name) {
  if (!f || typeof f !== 'object') return null;
  const arr = (a) => (Array.isArray(a) ? a.filter((v) => v != null && v !== '') : []);
  let o;
  if (f.overview || f.invest) o = { ...f };
  else {
    const ct = arr(f.contact).filter((c) => c && typeof c === 'object' && (c.who || c.how));
    o = {
      business: { '사업 정의': f.biz, '주요 제품': f.product },
      invest: { stage: f.stage, total: f.total, total_note: f.totalNote, deal: f.deal, valuation: f.valuation, plan: f.plan, current_fi: f.fi,
        rounds: arr(f.rounds).filter((r) => r && typeof r === 'object').map((r) => ({ date: r.when, round: r.round, amount: typeof r.amount === 'number' ? fsEok(r.amount) : r.amount, investors: r.investors })) },
      keyman: ct.length ? { '권장 콘택 순서': ct.map((c, i) => `${'①②③④⑤⑥'[i] || ''} ${[c.who, c.how].filter(Boolean).join(': ')}`).join(' ') } : {},
      points: arr(f.points), risks: arr(f.risks), verification: arr(f.sources).length ? { sources: arr(f.sources).join(', ') } : {},
    };
  }
  return fsNorm({ ...o, no: ref, name: name || f.name || '', fin: {}, finList: Array.isArray(f.fin) ? f.fin : [], made: f.made, contact: o.contact && typeof o.contact === 'object' && !Array.isArray(o.contact) ? o.contact : {}, keyman: o.keyman || {} });
}
// 팩트시트 칸(fsq.js fqInner)에 넣을 몸통: 사업 정의 한 줄 + 탭
function fsReqBody(ref, f, name) {
  let x; try { x = fsFromReq(ref, f, name); } catch { return ''; }
  if (!x) return '';
  const sum = x.business?.['사업 정의'];
  return `<div class="fq-fs" data-fq-fs="${esc(ref)}">${sum ? `<p class="ipo-sum1">${esc(sum)}</p>` : ''}${fsTabsPane(x, 'data-fq-tab')}</div>`;
}

function fsPane(x) {
  try { return ({ inv: fsPaneInv, ov: fsPaneOv, biz: fsPaneBiz, prod: fsPaneProd, fin: fsPaneFin, view: fsPaneView }[fsS.tab] || fsPaneInv)(x); }
  catch { return '<div class="empty">이 회사 자료 형식이 올바르지 않습니다</div>'; }
}

function fsPnl(x) {
  if (Array.isArray(x.finList)) {
    const ps = typeof rdFinN === 'function' ? x.finList.map((p) => rdFinN({ fin: p })).filter((p) => p.fin && p.years.length).map((p) => rdPnl(p.fin, p.years, 4)).filter(Boolean) : [];
    return ps.length ? ps.join('') : fsBox('주요 손익', '<p class="ipo-p muted">확인 불가</p>');
  }
  const ys = ['2023', '2024', '2025'], f = x.fin || {};
  const n = (v) => (v == null ? '–' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const pct = (a, b) => (a == null || !b ? '–' : `${(a / b * 100).toFixed(1)}%`);
  const row = (k, g, cls = '') => `<tr class="${cls}"><td>${k}</td>${ys.map((y) => { const t = g(f[y] || []); return `<td${t.startsWith('-') ? ' class="neg"' : ''}>${t}</td>`; }).join('')}</tr>`;
  return fsBox('주요 손익', `<table class="ipo-pnl"><thead><tr><th>억 원</th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${row('매출액', (c) => n(c[0]))}${row('영업이익', (c) => n(c[1]))}${row('OPM', (c) => pct(c[1], c[0]), 'r')}${row('당기순이익', (c) => n(c[2]))}${row('NPM', (c) => pct(c[2], c[0]), 'r')}
    </tbody></table>${x.cagr != null ? fsKv('매출 성장', fsPct(x.cagr, true)) : ''}`, '개별 기준');
}

function fsPaneOv(x) {
  const links = [[x.overview?.['홈페이지'] || x.home, '홈페이지']].filter(([u]) => u && !/확인 필요/.test(u))
    .map(([u, l]) => `<a class="ipo-a" href="${esc(fsUrlOf(String(u).split(/\s/)[0]))}" target="_blank" rel="noopener">${l}${ico('ext', 'sm')}</a>`).join('');
  // 요청한 회사(finList)는 글이 길고 손익 칸이 4개까지라 반쪽 칸이면 숫자가 겹친다: 위아래로
  return `<div class="${x.finList ? 'ipo-stack' : 'ipo-two-col'}">
    ${fsBox('기업 개요', `${fsKvs(x.overview, ['기업명', '산업군 / 섹터', '대표자', '설립', '본사 소재지', '사업자등록번호', '상장 여부', '기업 형태'])}${fsKv('부스', x.booth)}${links ? `<div class="ipo-links">${links}</div>` : ''}` || '<p class="ipo-p muted">없음</p>')}
    <div class="ipo-stack">${fsPnl(x)}${x.growth ? fsBox('성장 요약', `<p class="ipo-p">${fsT(x.growth)}</p>`) : ''}</div>
  </div>`;
}

function fsPaneBiz(x) {
  const b = x.business || {}, br = x.brand || {};
  const biz = fsBox('사업 개요 · 경쟁력', `${fsKv('주요 제품', b['주요 제품'])}${b['핵심 경쟁력 / 차별점'] ? `<div class="ipo-kv"><div class="k">핵심 경쟁력</div><div class="v">${fsNums(b['핵심 경쟁력 / 차별점'])}</div></div>` : ''}${fsKv('시장 전망', b['시장 전망'])}`);
  if (!fsHas(x.brand)) return biz;
  return `<div class="ipo-two-col">
    ${biz}
    ${fsBox('브랜드 스토리', fsKvs(br, ['브랜드 철학', '창업 배경 · 창업자', '네이밍', '공간 · 경험', '글로벌 확장']))}
  </div>`;
}

function fsPaneProd(x) {
  const imgs = x.images || [];
  const pics = !Array.isArray(x.images) ? '' : imgs.length ? `<div class="fs-pics">${imgs.map((im) => `<figure class="fs-pic"><div class="fs-img" data-fs-img="${esc(im.file)}"></div><figcaption>${esc(im.caption || '')}</figcaption></figure>`).join('')}</div>` : '<p class="ipo-p muted">확보한 제품 이미지가 없습니다.</p>';
  const ps = x.products || [];
  const tbl = ps.length ? `<table class="ipo-tbl fs-prod"><thead><tr><th>제품명</th><th>카테고리</th><th>용량</th><th>가격</th><th>특징</th></tr></thead><tbody>${ps.map((p) => `<tr><td>${fsT(p.name)}</td><td data-k="카테고리">${fsT(p.category)}</td><td data-k="용량">${fsT(p.size)}</td><td data-k="가격">${fsT(p.price)}</td><td data-k="특징">${fsT(p.note)}</td></tr>`).join('')}</tbody></table>` : '<p class="ipo-p muted">없음</p>';
  return `<div class="ipo-stack">${pics ? fsBox('제품 · 브랜드 이미지', pics, '공식 홈페이지·공식몰, 내부 검토용') : ''}${fsBox('대표 제품 라인업', `<div class="fs-scroll">${tbl}</div>`)}</div>`;
}

function fsPaneFin(x) {
  const s = x.shareholders || {}, rows = (s.rows || []).filter((r) => r && r.name && r.name !== '-');
  const tbl = rows.length ? `<table class="ipo-tbl fs-hold"><thead><tr><th>주주명</th><th>관계 · 구분</th><th>주식수</th><th>지분율</th><th>취득 · 발행</th><th>비고</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${fsT(r.name)}</td><td data-k="관계 · 구분">${fsT(r.relation)}</td><td data-k="주식수">${fsT(r.shares)}</td><td data-k="지분율">${fsT(r.pct)}</td><td data-k="취득 · 발행">${fsT(r.acquired)}</td><td data-k="비고">${fsT(r.note)}</td></tr>`).join('')}</tbody></table>` : '<p class="ipo-p muted">없음</p>';
  return `<div class="ipo-stack">
    <div class="${x.finList ? 'ipo-stack' : 'ipo-two-col'}">${fsPnl(x)}${fsBox('재무 비고', `<p class="ipo-p">${fsT(x.fin_note || x.fin_src)}</p>`)}</div>
    ${fsBox('주주 현황 · 지분구조', `${s.total_shares ? fsKvSub('발행주식 총수', s.total_shares, s.total_shares_note) : fsKv('발행주식 총수', s.total_shares_note)}<div class="fs-scroll">${tbl}</div>
      ${fsKv('RCPS · CB · BW', s.mezz)}${fsKv('FI 투자 이력', s.fi_history)}${fsKv('특이사항', s.special)}`)}
  </div>`;
}

function fsPaneView(x) {
  const v = x.verification || {};
  return `<div class="ipo-stack"><div class="ipo-two-col">${fsBox('핵심 투자 포인트', fsList(x.points))}${fsBox('리스크 · 실사 체크리스트', fsList(x.risks))}</div>
    ${fsBox('검증 등급 · 출처', `${fsKv('검증 등급', v.grade)}${fsKv('데이터 출처', v.sources)}`)}</div>`;
}

function fsPaneInv(x) {
  const v = x.inv, c = x.contact || {}, k = x.keyman || {};
  const rounds = x.rounds.length ? `<div class="fs-scroll"><table class="ipo-tbl fs-rounds"><thead><tr><th>시기</th><th>라운드</th><th>금액</th><th>투자자</th><th>출처</th></tr></thead><tbody>${x.rounds.map((r) => `<tr><td>${fsT(r.date)}</td><td>${fsT(r.round)}</td><td data-k="금액">${fsT(r.amount)}</td><td data-k="투자자">${fsT(r.investors)}</td><td class="muted" data-k="출처">${fsT(r.source)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const kv = (label, val) => (val ? `<div class="ipo-kv"><div class="k">${esc(label)}</div><div class="v">${fsNums(val)}</div></div>` : '');
  return `<div class="ipo-stack fs-inv-pane">
    ${fsBox('투자유치 히스토리', `${fsKv('딜 상황', v.deal)}${fsKv('현재 투자 단계', x.stage)}${x.total != null ? fsKvSub('누적 투자', fsTotal(x.total), v.total_note) : ''}${v.summary || x.shareholders?.fi_history ? `<p class="ipo-p fs-inv-sum">${fsT(v.summary || x.shareholders?.fi_history)}</p>` : ''}${rounds}
      ${fsKv('현재 FI', v.current_fi)}${fsKv('최근 밸류', v.valuation)}${fsKv('계획', v.plan)}${fsKv('RCPS · CB · BW', v.mezz || x.shareholders?.mezz)}${fsKv('기존 투자자 활용', k['기존 투자자 (레버리지)'])}${fsKv('확인한 곳', v.checked)}`)}
    ${fsIrBox(x)}
    ${fsBox('컨택 방법', `${fsKv('누구에게', k['1순위 키맨 (대표)'])}${fsKv('재무 키맨', k['재무 키맨 (CFO급)'])}${fsKv('대표 연락처', c['대표 연락처'])}${fsKv('문의 창구', c['대표 이메일'])}${fsKv('본사 주소', c['본사 주소'])}
      ${kv('직접 채널', k['직접 채널'])}${kv('웜 인트로', k['웜 인트로 경로'])}${kv('콘택 순서', k['권장 콘택 순서'])}${fsKv('피칭 포인트', k['피칭 포인트'])}${fsKv('타이밍', k['타이밍 · 트리거'])}${fsKv('주의사항', k['주의사항'])}`)}
  </div>`;
}

/* IR·회사 자료: 회사 홈페이지에서 받은 회사소개서·브로슈어·카탈로그 PDF(팀 파일함 _웍스/팩트시트/ir/). 40곳 모두 비상장이라 KIND IR 자료실에는 없다 */
function fsIrBox(x) {
  const rows = x.ir.map((d) => `<li class="fs-ir-i"><span class="fs-ir-t">${esc(d.title || '자료')}</span>${d.kind ? `<span class="muted">${esc(d.kind)}</span>` : ''}${d.date ? `<span class="muted">${esc(d.date)}</span>` : ''}
    ${d.file ? `<button type="button" class="btn sm" data-fs-ir="${esc(d.file)}">${ico('file', 'sm')}열기</button>` : ''}${d.url && /^https?:\/\//i.test(d.url) ? `<a class="ipo-a" href="${esc(d.url)}" target="_blank" rel="noopener">원본${ico('ext', 'sm')}</a>` : ''}</li>`).join('');
  if (!rows && !x.ir_checked) return '';
  return fsBox('IR · 회사 자료', `${rows ? `<ul class="fs-ir-l">${rows}</ul>` : '<p class="ipo-p muted">찾은 자료 없음</p>'}${fsKv('찾아본 곳', x.ir_checked)}`, x.ir.length ? `${x.ir.length}건` : '');
}
/* 팀 파일함 PDF는 SharePoint 보기 화면으로 연다(폰에서도 열림). 받기 전에 창을 먼저 열어 팝업 차단을 피한다 */
async function fsIrOpen(f) {
  const w = window.open('', '_blank');
  try { const j = await G.get(`${fsUrl(`${FS_DIR}/ir/${f}`)}?$select=webUrl`); if (w) w.location = j.webUrl; else window.open(j.webUrl, '_blank', 'noopener'); }
  catch (e) { if (w) w.close(); toast(e.status === 404 ? '자료 파일을 찾지 못했습니다' : e.message); }
}

/* 제품 이미지: 팀 파일함에서 받아 blob 주소로(한 번 받은 것은 다시 받지 않음) */
function fsPaintImgs(root) {
  root.querySelectorAll('[data-fs-img]').forEach((el) => {
    const f = el.dataset.fsImg; if (el.firstChild) return;
    let p = fsS.imgs.get(f);
    if (!p) { p = G.get(`${fsUrl(`${FS_DIR}/${f}`)}/content`, { type: 'blob' }).then((b) => URL.createObjectURL(b)); p.catch(() => fsS.imgs.delete(f)); fsS.imgs.set(f, p); }
    p.then((u) => { if (!el.firstChild) { const im = new Image(); im.alt = ''; im.src = u; el.appendChild(im); } }).catch(() => { el.classList.add('fs-noimg'); });
  });
}

/* ---------- 그리기 ---------- */
// 자료에 있는 테마와 회사 수(많은 순)
const fsThemes = (a) => { const m = new Map(); a.forEach((x) => { if (x.theme) m.set(x.theme, (m.get(x.theme) || 0) + 1); }); return [...m].sort((p, q) => q[1] - p[1]); };
function fsSummary() {
  const a = fsAll(); if (!a.length) return '';
  const req = a.filter((x) => x.kind === 'req'), wait = req.filter((x) => x.st?.wait && !x.st.failed).length;
  return `<span>${a.length}곳</span><span>요청 <b>${req.length}</b></span>${fsThemes(a).map(([t, n]) => `<span>${esc(t)} <b>${n}</b></span>`).join('')}${wait ? `<span>처리 대기 <b>${wait}</b></span>` : ''}`;
}
// 필터 칩 줄: 묶음 이름 + 칩. 요청자 묶음은 지금 자료에 있는 사람만
function fsFilterHtml() {
  const seg = (g, opts) => `<div class="seg" role="group">${opts.map(([k, l]) => `<button type="button" data-fs-fl="${g}" data-v="${esc(k)}" class="${fsS.fl[g] === k ? 'on' : ''}" aria-pressed="${fsS.fl[g] === k}">${esc(l)}</button>`).join('')}</div>`;
  const who = fsWhoList(fsAll());
  if (fsS.fl.who && !who.some(([w]) => w === fsS.fl.who)) who.push([fsS.fl.who, 0]);
  const thm = fsThemes(fsAll()).map(([t]) => [t, t]);
  if (fsS.fl.thm && !thm.some(([t]) => t === fsS.fl.thm)) thm.push([fsS.fl.thm, fsS.fl.thm]);
  return `<div class="rd-fing"><span class="rd-finl">테마</span>${seg('thm', [['', '전체'], ...thm])}</div>`
    + FS_FG.map(([g, l, opts]) => `<div class="rd-fing"><span class="rd-finl">${l}</span>${seg(g, opts)}</div>`).join('')
    + `<div class="rd-fing"><span class="rd-finl">요청자</span>${seg('who', [['', '전체'], ...who.map(([w]) => [w, w])])}</div>`;
}
function fsBody() {
  if (!fsS.at || (typeof fqS === 'object' && !fqS.at)) return '<div class="empty">불러오는 중…</div>'; // 두 자료를 다 읽고 한 번에
  const a = fsListItems();
  if (!a.length) return fsAll().length ? '<div class="empty">조건에 맞는 회사가 없습니다.</div>' : '<div class="empty">아직 올라간 팩트시트가 없습니다.</div>';
  return `<div class="ipo-head fs-cols"><div>No.</div><div>회사</div><div class="fs-c-by">요청</div><div class="fs-c-rev">최근 매출</div><div class="fs-c-opm">OPM</div><div class="fs-c-grow">매출 성장</div><div class="fs-c-stage">현재 투자 단계</div><div class="fs-c-total">누적 투자</div><div></div></div>${a.map((x, i) => fsRow(x, i)).join('')}`;
}
function fsDraw() {
  const b = fsS.host?.querySelector('#fs-body'); if (!b || !b.isConnected) return;
  if (fsS.focus) { const x = fsFind(fsS.focus); if (x) { fsS.focus = x.key; fsS.open.add(x.key); } } // 엑스포 목록 번호로 왔으면 합친 줄로
  b.innerHTML = fsBody();
  const s = fsS.host.querySelector('#fs-sum'); if (s) s.innerHTML = fsSummary();
  const f = fsS.host.querySelector('#fs-finf'); if (f) f.innerHTML = fsFilterHtml();
  fsPaintImgs(b);
  if (fsS.focus) {
    const r = b.querySelector(`.ipo-row[data-fs="${CSS.escape(fsS.focus)}"]`);
    if (r) { fsS.focus = null; r.scrollIntoView({ block: 'start' }); }
  }
}
// 요청 목록·팩트시트(fsq.js)가 새로 읽히거나 바뀌면 fqPaint가 부른다
function fsReqPaint() { if (fsS.host?.isConnected) fsDraw(); }
function fsRefreshRow(k) {
  const x = fsFind(k); if (!x || !fsS.host) return;
  const i = fsListItems().findIndex((y) => y.key === x.key); // No.는 지금 목록에서의 순서
  fsS.host.querySelectorAll('.ipo-row[data-fs]').forEach((r) => { if (r.dataset.fs === x.key) { r.outerHTML = fsRow(x, Math.max(0, i)); } });
  const r = fsS.host.querySelector(`.ipo-row[data-fs="${CSS.escape(x.key)}"]`); if (r) fsPaintImgs(r);
}

/* 엑셀(CSV): 지금 거른 목록을 보이는 순서대로(tgt.js tgCsv와 같은 방식) */
function fsCsv() {
  const a = fsListItems(); if (!a.length) { toast('받을 회사가 없습니다.'); return; }
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const r1 = (v) => (v == null ? '' : Math.round(v * 10) / 10), pc = (v) => (v == null ? '' : Math.round(v * 1000) / 10);
  const head = ['번호', '회사', '테마', '요청자', '요청일', '요청 화면', '업종', '매출 연도', '매출(억)', '영업이익(억)', 'OPM(%)', '매출 성장(%)', '현재 투자 단계', '누적 투자(억)', '처리 상태'];
  const rows = a.map((x, i) => [i + 1, x.name, x.theme, x.by, x.at.slice(0, 10), x.kind === 'req' ? x.src : FS_EXPO, x.overview?.['산업군 / 섹터'] || x.biz || '', x.r25 != null ? x.fy : '',
    r1(x.r25), r1(x.o25), pc(x.opm), pc(x.cagr), x.stage, x.total, x.kind === 'req' ? (x.st?.failed ? '만들지 못함' : x.st?.wait ? '처리 대기' : '작성') : '작성']);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  el.download = `팩트시트_${today().replace(/-/g, '').slice(2)}.csv`;
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(el.href), 4000);
}

async function fsPipeAdd(btn) {
  const k = btn.closest('.ipo-row')?.dataset.fs, x = k && fsFind(k);
  if (!x || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  try { await pipeAdd({ src: '행사·IR', ref: `facts:${x.key}`, name: x.name }); } catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  const p = fsS.host?.querySelector(`.ipo-row[data-fs="${CSS.escape(k)}"] .ipo-dhead > .rd-pipe`);
  if (p) p.outerHTML = fsPipe(x);
}

function fsBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const irb = t.closest('[data-fs-ir]');
    if (irb) { fsIrOpen(irb.dataset.fsIr); return; }
    const fb = t.closest('[data-fs-fl]');
    if (fb) { fsS.fl[fb.dataset.fsFl] = fb.dataset.v; viewSet('fs.fl', fsS.fl); fsDraw(); return; }
    if (t.closest('#fs-ref')) { Promise.all([fsLoad(true), fqLoad(true)]).then(fsDraw).catch((e) => toast(e.message)); return; }
    if (t.closest('#fs-xlsx')) { fsCsv(); return; }
    const tb = t.closest('[data-fs-tab]');
    if (tb) { fsS.tab = tb.dataset.fsTab; viewSet('fs.tab', fsS.tab); fsRefreshRow(tb.closest('.ipo-row').dataset.fs); return; }
    const pb = t.closest('[data-fs-pipe]');
    if (pb) { fsPipeAdd(pb); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-fs]');
    if (row) {
      const x = fsFind(row.dataset.fs); if (!x) return;
      if (fsOpen(x)) { fsS.open.delete(x.key); if (x.kbKey) fsS.open.delete(x.kbKey); } else fsS.open.add(x.key);
      viewSet('fs.open', fsS.open); fsRefreshRow(x.key);
    }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'fs-q') { fsS.q = ev.target.value; viewSet('fs.q', fsS.q); fsDraw(); } });
  root.addEventListener('change', (ev) => { if (ev.target.id === 'fs-sort') { fsS.sort = ev.target.value; viewSet('fs.sort2', fsS.sort); fsDraw(); } });
}

async function renderFacts(host) {
  fsS.host = host;
  host.innerHTML = `<div class="ipo-page fs-page" id="fs-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="fs-sum"></div>
      ${infoBtn('deals/facts')}
      <button class="btn ghost" type="button" id="fs-xlsx">${ico('file', 'sm')}엑셀 다운로드</button>
      <button class="btn ghost" type="button" id="fs-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div class="ipo-filter">
        <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="fs-q" type="search" placeholder="회사·업종·대표·요청자 검색" value="${esc(fsS.q)}" autocomplete="off" aria-label="검색"></div>
        <select class="select" id="fs-sort" aria-label="정렬">${FS_SORTS.map(([k, l]) => `<option value="${k}"${fsS.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="ipo-filter rd-finf fs-finf" id="fs-finf">${fsFilterHtml()}</div>
      <div class="ipo-body" id="fs-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  fsBind(host.querySelector('#fs-root'));
  if (typeof fqLoad === 'function') fqLoad(); // 다 읽으면 fqPaint → fsReqPaint로 다시 그린다
  try { await fsLoad(); } catch (e) { const b = host.querySelector('#fs-body'); if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (fsS.host === host && host.isConnected) fsDraw();
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (fsS.host === host && host.isConnected) fsDraw(); }).catch(() => {}); // '파이프라인에 있음' 표시
}

/* 다른 화면(파이프라인 '팩트시트에서 보기')에서 한 회사를 펼쳐 열 때. 주소 이동은 부르는 쪽이 한다. 엑스포 목록 번호로 오면 fsDraw가 합친 줄로 바꾼다 */
function factsFocus(no) {
  const k = String(no ?? ''); if (!k) return;
  fsS.q = ''; fsS.fl = { thm: '', rev: '', opm: '', gr: '', stg: '', who: '' }; fsS.open.add(k); fsS.focus = k;
  viewSet('fs.q', ''); viewSet('fs.fl', fsS.fl); viewSet('fs.open', fsS.open);
}
