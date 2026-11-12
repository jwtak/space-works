/* SPACE WORKS — 딜소싱 › 팩트시트: 행사 참가기업 등 따로 조사한 회사별 PE 딜소싱 Fact Sheet 보기
   데이터: 팀 파일함 '_웍스/팩트시트/factsheets.json'(+ img/<no>_<n>.jpg) — 팀원이면 누구나 읽는다(읽기 전용 화면).
   만드는 곳: 스페이스인베\05. 딜소싱\K-Beauty Expo 2026\build_factsheets.py (엑셀과 같은 자료로 한 번에 만든다).
   엑셀 원본: 팀 파일함 '04. 딜소싱/03. K-Beauty Expo 2026/<xlsx>'.
   진입: renderFacts(host) — host 안에만 그린다. 다른 화면에서 한 회사를 펼칠 때: factsFocus(no).
   app.js 전역($, esc, pad, ico, toast, G, CFG, openSheet, TAB_INFO, infoBtn)과 ipo.css(목록·상자 클래스), pipeline.js 의 pipeAdd·pipeHas(있을 때만)를 쓴다. */

const FS_DIR = '_웍스/팩트시트';
const FS_XLSX_DIR = '04. 딜소싱/03. K-Beauty Expo 2026';
const FS_TTL = 10 * 60000;
const FS_FILTERS = [['all', '전체'], ['inv', '투자 이력 있음'], ['big', '매출 500억+'], ['opm', 'OPM 15%+'], ['grow', '매출 성장 20%+']];
const FS_SORTS = [['rev', '2025 매출순'], ['total', '누적 투자순'], ['op', '2025 영업이익순'], ['grow', '매출 성장률순'], ['opm', '영업이익률순'], ['no', '목록 번호순']];
const FS_TABS = [['inv', '투자유치·컨택'], ['ov', '개요'], ['biz', '사업·브랜드'], ['prod', '제품'], ['fin', '재무·주주'], ['view', '투자 판단']];
const fsS = { data: null, at: 0, loading: null, q: viewGet('fs.q', ''), f: viewGet('fs.f', 'all'), sort: viewGet('fs.sort', 'rev'), tab: viewGet('fs.tab', 'inv'), open: new Set(viewGet('fs.open', [])), focus: null, host: null, imgs: new Map(), set: viewGet('fs.set', 'kb') };

TAB_INFO['deals/facts'] = { title: '팩트시트', asof: '기준 2026-11-06 · K-Beauty Expo 2026 참가기업 목록에서 대표님이 노란색으로 고른 40곳', rows: [
  ['무엇인가', '대표님이 괜찮아 보인다고 고른 회사들을 공통 양식(PE 딜소싱 Fact Sheet)으로 한 장씩 조사한 자료입니다. 엑셀의 회사별 시트와 같은 내용입니다.'],
  ['왜 보나', '컨택 전에 회사가 무엇을 하고, 얼마나 벌고, 누가 지분을 갖고 있으며, 누구에게 어떻게 연락할지를 한 화면에서 봅니다.'],
  ['어떻게 보나', [
    '목록은 2025 매출순입니다. 필터로 투자 이력이 있는 회사, 매출 500억 이상, 영업이익률 15% 이상, 매출 성장(2023→2025 연평균) 20% 이상만 볼 수 있습니다.',
    '회사를 펼치면 첫 칸에 이전 투자유치 히스토리(VC·PE·정책금융·메자닌)와 컨택 방법(누구에게·어떤 창구로·누구를 통해·어떤 순서로)이 나옵니다. 이어서 개요·사업·브랜드·제품·재무·주주·투자 판단 칸이 있습니다.',
    '목록의 \'현재 투자 단계\'는 지금 지분·투자 상태이고, \'누적 투자\'는 외부 투자자가 신주·메자닌(RCPS·CB·BW)으로 넣은 돈의 합입니다. 창업자·가족 증자, 구주 거래, 경영권 인수 대금은 더하지 않고 단계에 적었습니다. 근거는 펼친 \'투자유치 히스토리\'에 있습니다.',
    '회사 이름 옆 \'PDF n\'은 회사 홈페이지에서 받은 회사소개서·브로슈어·카탈로그가 있다는 표시이고, 펼친 \'투자유치·컨택\' 칸에서 엽니다. 40곳 모두 비상장이라 KIND IR 자료실 자료는 없습니다.',
    '\'투자 이력 있음\'은 외부 투자 라운드가 확인된 회사만 보여 줍니다. 이력이 없다고 나온 회사도 어디까지 찾아봤는지 출처를 함께 적었습니다.',
    '재무는 DART 감사보고서(개별) 또는 사람인(NICE) 값이고 단위는 억원입니다. \'확인 필요\'는 공개 자료로 확인하지 못한 칸입니다.',
    '\'요청한 회사\'는 딜소싱 각 화면에서 회사를 펼쳐 \'팩트시트 요청\'을 누른 회사입니다. 요청은 매일 11:00·16:00에 처리되고, 펼치면 팩트시트와 원래 화면으로 가는 링크가 있습니다.',
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
const fsFind = (k) => fsS.data?.items.find((x) => x.key === String(k));

/* ---------- 표시 형식 ---------- */
const fsEok = (v) => (v == null ? '–' : `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`);
const fsPct = (r, sign) => (r == null ? '–' : `${sign && r > 0 ? '+' : ''}${(r * 100).toFixed(1)}%`);
const fsTotal = (v) => (v == null ? '–' : v === 0 ? '없음' : fsEok(v)); // 누적 투자: 0 = 외부 투자 없음
const fsT = (s) => esc(s == null || s === '' ? '–' : s).replace(/확인 필요/g, '<span class="fs-chk">확인 필요</span>');
const fsUrlOf = (u) => (u ? (/^https?:\/\//i.test(u) ? u : `http://${u.replace(/^https?:\/?\/?/i, '')}`) : '');
const fsKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${esc(k)}</div><div class="v">${fsT(v)}</div></div>` : '');
const fsKvs = (obj, keys) => keys.map((k) => fsKv(k, obj?.[k])).join('');
const fsList = (a) => (a?.length ? `<ul class="ipo-ul">${a.map((s) => `<li>${fsT(s)}</li>`).join('')}</ul>` : '<p class="ipo-p muted">없음</p>');
const fsNums = (s) => { const p = String(s || '').split(/\s*(?=[①②③④⑤⑥⑦⑧⑨]|Step \d)/).map((t) => t.replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '').replace(/\s*→\s*$/, '').trim()).filter(Boolean); return p.length > 1 ? `<ol class="ipo-ol">${p.map((t) => `<li>${fsT(t)}</li>`).join('')}</ol>` : `<p class="ipo-p">${fsT(s)}</p>`; };
const fsBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${esc(t)}${sub ? `<span class="muted">${esc(sub)}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;

/* ---------- 목록 ---------- */
function fsListItems() {
  const d = fsS.data; if (!d) return [];
  const q = fsS.q.trim().toLowerCase();
  let a = d.items.filter((x) => !q || x._q.includes(q));
  if (fsS.f === 'inv') a = a.filter((x) => x.rounds.length);
  if (fsS.f === 'big') a = a.filter((x) => x.r25 >= 500);
  if (fsS.f === 'opm') a = a.filter((x) => x.opm >= 0.15);
  if (fsS.f === 'grow') a = a.filter((x) => x.cagr >= 0.2);
  const n = (v) => (v == null ? -Infinity : v);
  const by = { rev: (x, y) => n(y.r25) - n(x.r25), total: (x, y) => n(y.total) - n(x.total), op: (x, y) => n(y.o25) - n(x.o25), grow: (x, y) => n(y.cagr) - n(x.cagr), opm: (x, y) => n(y.opm) - n(x.opm), no: (x, y) => x.no - y.no }[fsS.sort];
  return a.sort(by);
}

function fsRow(x, i) {
  const open = fsS.open.has(x.key), sec = x.overview?.['산업군 / 섹터'] || x.biz || '';
  return `<div class="ipo-row${open ? ' open' : ''}" data-fs="${esc(x.key)}">
    <div class="ipo-line fs-cols">
      <div class="fs-c-no">${i + 1}</div>
      <div class="fs-c-name"><div class="fs-name-l"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name)}</button>${x.ir.some((d) => d.file || d.url) ? `<span class="chip line fs-ir" title="IR·회사 자료 ${x.ir.length}건(펼치면 투자유치·컨택 칸에 있음)">PDF ${x.ir.length}</span>` : ''}</div><div class="ipo-sub">${esc(sec)}</div>
        <div class="ipo-sub fs-alt">${esc(`매출 ${fsEok(x.r25)} · 영업이익 ${fsEok(x.o25)} · 성장 ${fsPct(x.cagr, true)}`)}</div>
        <div class="ipo-sub fs-alt">${esc(`${x.stage || '단계 –'} · 누적 투자 ${fsTotal(x.total)}`)}</div></div>
      <div class="fs-c-rev">${fsEok(x.r25)}<div class="ipo-sub">영업이익 ${fsEok(x.o25)}</div></div>
      <div class="fs-c-opm">${fsPct(x.opm)}</div>
      <div class="fs-c-grow"><span class="${x.cagr > 0 ? 'fs-up' : x.cagr < 0 ? 'fs-dn' : ''}">${fsPct(x.cagr, true)}</span></div>
      <div class="fs-c-stage${x.rounds.length ? ' has' : ''}">${x.stage ? fsT(x.stage) : '<span class="muted">–</span>'}</div>
      <div class="fs-c-total">${fsTotal(x.total)}</div>
      <div class="fs-c-chev"><span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span></div>
    </div>${open ? fsDetail(x) : ''}</div>`;
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
  const tabs = FS_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${fsS.tab === k}" class="${fsS.tab === k ? 'on' : ''}" data-fs-tab="${k}">${l}</button>`).join('');
  return `<div class="ipo-detail">
    <div class="ipo-dhead"><p class="ipo-sum1">${esc(x.business?.['사업 정의'] || '')}</p>${fsPipe(x)}</div>
    <div class="ipo-tabs" role="tablist">${tabs}</div>
    <div class="ipo-pane">${fsPane(x)}</div>
  </div>`;
}

function fsPane(x) {
  try { return ({ inv: fsPaneInv, ov: fsPaneOv, biz: fsPaneBiz, prod: fsPaneProd, fin: fsPaneFin, view: fsPaneView }[fsS.tab] || fsPaneInv)(x); }
  catch { return '<div class="empty">이 회사 자료 형식이 올바르지 않습니다</div>'; }
}

function fsPnl(x) {
  const ys = ['2023', '2024', '2025'], f = x.fin || {};
  const n = (v) => (v == null ? '–' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const pct = (a, b) => (a == null || !b ? '–' : `${(a / b * 100).toFixed(1)}%`);
  const row = (k, g, cls = '') => `<tr class="${cls}"><td>${k}</td>${ys.map((y) => { const t = g(f[y] || []); return `<td${t.startsWith('-') ? ' class="neg"' : ''}>${t}</td>`; }).join('')}</tr>`;
  return fsBox('주요 손익', `<table class="ipo-pnl"><thead><tr><th>억 원</th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${row('매출액', (c) => n(c[0]))}${row('영업이익', (c) => n(c[1]))}${row('OPM', (c) => pct(c[1], c[0]), 'r')}${row('당기순이익', (c) => n(c[2]))}${row('NPM', (c) => pct(c[2], c[0]), 'r')}
    </tbody></table>`, '개별 기준');
}

function fsPaneOv(x) {
  const links = [[x.overview?.['홈페이지'] || x.home, '홈페이지']].filter(([u]) => u && !/확인 필요/.test(u))
    .map(([u, l]) => `<a class="ipo-a" href="${esc(fsUrlOf(String(u).split(/\s/)[0]))}" target="_blank" rel="noopener">${l}${ico('ext', 'sm')}</a>`).join('');
  return `<div class="ipo-two-col">
    ${fsBox('기업 개요', `${fsKvs(x.overview, ['기업명', '산업군 / 섹터', '대표자', '설립', '본사 소재지', '사업자등록번호', '상장 여부', '기업 형태'])}${fsKv('부스', x.booth)}${links ? `<div class="ipo-links">${links}</div>` : ''}`)}
    <div class="ipo-stack">${fsPnl(x)}${x.growth ? fsBox('성장 요약', `<p class="ipo-p">${fsT(x.growth)}</p>`) : ''}</div>
  </div>`;
}

function fsPaneBiz(x) {
  const b = x.business || {}, br = x.brand || {};
  return `<div class="ipo-two-col">
    ${fsBox('사업 개요 · 경쟁력', `${fsKv('주요 제품', b['주요 제품'])}<div class="ipo-kv"><div class="k">핵심 경쟁력</div><div class="v">${fsNums(b['핵심 경쟁력 / 차별점'])}</div></div>${fsKv('시장 전망', b['시장 전망'])}`)}
    ${fsBox('브랜드 스토리', fsKvs(br, ['브랜드 철학', '창업 배경 · 창업자', '네이밍', '공간 · 경험', '글로벌 확장']))}
  </div>`;
}

function fsPaneProd(x) {
  const imgs = x.images || [];
  const pics = imgs.length ? `<div class="fs-pics">${imgs.map((im) => `<figure class="fs-pic"><div class="fs-img" data-fs-img="${esc(im.file)}"></div><figcaption>${esc(im.caption || '')}</figcaption></figure>`).join('')}</div>` : '<p class="ipo-p muted">확보한 제품 이미지가 없습니다.</p>';
  const ps = x.products || [];
  const tbl = ps.length ? `<table class="ipo-tbl fs-prod"><thead><tr><th>제품명</th><th>카테고리</th><th>용량</th><th>가격</th><th>특징</th></tr></thead><tbody>${ps.map((p) => `<tr><td>${fsT(p.name)}</td><td>${fsT(p.category)}</td><td>${fsT(p.size)}</td><td>${fsT(p.price)}</td><td>${fsT(p.note)}</td></tr>`).join('')}</tbody></table>` : '<p class="ipo-p muted">없음</p>';
  return `<div class="ipo-stack">${fsBox('제품 · 브랜드 이미지', pics, '공식 홈페이지·공식몰, 내부 검토용')}${fsBox('대표 제품 라인업', `<div class="fs-scroll">${tbl}</div>`)}</div>`;
}

function fsPaneFin(x) {
  const s = x.shareholders || {}, rows = (s.rows || []).filter((r) => r && r.name && r.name !== '-');
  const tbl = rows.length ? `<table class="ipo-tbl fs-hold"><thead><tr><th>주주명</th><th>관계 · 구분</th><th>주식수</th><th>지분율</th><th>취득 · 발행</th><th>비고</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${fsT(r.name)}</td><td>${fsT(r.relation)}</td><td>${fsT(r.shares)}</td><td>${fsT(r.pct)}</td><td>${fsT(r.acquired)}</td><td>${fsT(r.note)}</td></tr>`).join('')}</tbody></table>` : '<p class="ipo-p muted">없음</p>';
  return `<div class="ipo-stack">
    <div class="ipo-two-col">${fsPnl(x)}${fsBox('재무 비고', `<p class="ipo-p">${fsT(x.fin_note || x.fin_src)}</p>`)}</div>
    ${fsBox('주주 현황 · 지분구조', `${fsKv('발행주식 총수', [s.total_shares, s.total_shares_note].filter(Boolean).join(' · '))}<div class="fs-scroll">${tbl}</div>
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
  const rounds = x.rounds.length ? `<div class="fs-scroll"><table class="ipo-tbl fs-rounds"><thead><tr><th>시기</th><th>라운드</th><th>금액</th><th>투자자</th><th>출처</th></tr></thead><tbody>${x.rounds.map((r) => `<tr><td>${fsT(r.date)}</td><td>${fsT(r.round)}</td><td>${fsT(r.amount)}</td><td>${fsT(r.investors)}</td><td class="muted">${fsT(r.source)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const kv = (label, val) => (val ? `<div class="ipo-kv"><div class="k">${esc(label)}</div><div class="v">${fsNums(val)}</div></div>` : '');
  return `<div class="ipo-stack fs-inv-pane">
    ${fsBox('투자유치 히스토리', `${fsKv('현재 투자 단계', x.stage)}${x.total != null ? fsKv('누적 투자', `${fsTotal(x.total)}${v.total_note ? ` · ${v.total_note}` : ''}`) : ''}<p class="ipo-p fs-inv-sum">${fsT(v.summary || x.shareholders?.fi_history)}</p>${rounds}
      ${fsKv('현재 FI', v.current_fi)}${fsKv('RCPS · CB · BW', v.mezz || x.shareholders?.mezz)}${fsKv('기존 투자자 활용', k['기존 투자자 (레버리지)'])}${fsKv('확인한 곳', v.checked)}`)}
    ${fsIrBox(x)}
    ${fsBox('컨택 방법', `${fsKv('누구에게', k['1순위 키맨 (대표)'])}${fsKv('재무 키맨', k['재무 키맨 (CFO급)'])}${fsKv('대표 연락처', c['대표 연락처'])}${fsKv('문의 창구', c['대표 이메일'])}${fsKv('본사 주소', c['본사 주소'])}
      ${kv('직접 채널', k['직접 채널'])}${kv('웜 인트로', k['웜 인트로 경로'])}${kv('콘택 순서', k['권장 콘택 순서'])}${fsKv('피칭 포인트', k['피칭 포인트'])}${fsKv('타이밍', k['타이밍 · 트리거'])}${fsKv('주의사항', k['주의사항'])}`)}
  </div>`;
}

/* IR·회사 자료: 회사 홈페이지에서 받은 회사소개서·브로슈어·카탈로그 PDF(팀 파일함 _웍스/팩트시트/ir/). 40곳 모두 비상장이라 KIND IR 자료실에는 없다 */
function fsIrBox(x) {
  const rows = x.ir.map((d) => `<li class="fs-ir-i"><span class="fs-ir-t">${esc(d.title || '자료')}</span><span class="muted">${esc([d.kind, d.date].filter(Boolean).join(' · '))}</span>
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
// 묶음: 행사별 팩트시트(지금은 K-Beauty Expo 2026 하나) | 요청한 회사(딜소싱 각 화면에서 '팩트시트 요청'한 회사, fsq.js)
function fsSetSeg() {
  const d = fsS.data, one = (k, l) => `<button type="button" data-fs-set="${k}" class="${fsS.set === k ? 'on' : ''}" aria-pressed="${fsS.set === k}">${l}</button>`;
  return `<div class="seg fs-set" role="group" aria-label="묶음">${d?.set ? one('kb', esc(d.set)) : ''}${one('req', `요청한 회사 <span data-fq-count>${fqCount()}</span>`)}</div>`;
}
function fsSummary() {
  const d = fsS.data;
  if (fsS.set === 'req' || !d) return fsSetSeg();
  const big = d.items.filter((x) => x.r25 >= 500).length, opm = d.items.filter((x) => x.opm >= 0.15).length;
  return `${fsSetSeg()}<span>${d.items.length}곳</span><span>매출 500억+ <b>${big}</b></span><span>OPM 15%+ <b>${opm}</b></span>${d.generated ? `<span>${esc(d.generated)} 작성</span>` : ''}`;
}
function fsBody() {
  if (!fsS.data) return '<div class="empty">아직 올라간 팩트시트가 없습니다.</div>';
  const a = fsListItems();
  if (!a.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  return `<div class="ipo-head fs-cols"><div>No.</div><div>회사</div><div class="fs-c-rev">2025 매출</div><div class="fs-c-opm">OPM</div><div class="fs-c-grow">매출 성장</div><div class="fs-c-stage">현재 투자 단계</div><div class="fs-c-total">누적 투자</div><div></div></div>${a.map((x, i) => fsRow(x, i)).join('')}`;
}
function fsDraw() {
  const b = fsS.host?.querySelector('#fs-body'); if (!b) return;
  const req = fsS.set === 'req';
  fsS.host.querySelectorAll('.fs-kb-only').forEach((el) => { el.hidden = req; });
  b.innerHTML = req ? fqList() : fsBody();
  const s = fsS.host.querySelector('#fs-sum'); if (s) s.innerHTML = fsSummary();
  if (req) return;
  fsPaintImgs(b);
  if (fsS.focus && b.isConnected) {
    const r = b.querySelector(`.ipo-row[data-fs="${CSS.escape(fsS.focus)}"]`); fsS.focus = null;
    if (r) r.scrollIntoView({ block: 'start' });
  }
}
function fsRefreshRow(k) {
  const x = fsFind(k); if (!x || !fsS.host) return;
  const i = fsListItems().findIndex((y) => y.key === k); // No.는 지금 목록에서의 순서
  fsS.host.querySelectorAll('.ipo-row[data-fs]').forEach((r) => { if (r.dataset.fs === k) { r.outerHTML = fsRow(x, Math.max(0, i)); } });
  const r = fsS.host.querySelector(`.ipo-row[data-fs="${CSS.escape(k)}"]`); if (r) fsPaintImgs(r);
}

async function fsDownload(btn) {
  const d = fsS.data; if (!d?.xlsx || btn.disabled) { if (!d?.xlsx) toast('아직 올라간 엑셀이 없습니다.'); return; }
  btn.disabled = true;
  try {
    const blob = await G.get(`${fsUrl(`${FS_XLSX_DIR}/${d.xlsx}`)}/content`, { type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = d.xlsx;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch (e) { toast(e.status === 404 ? '엑셀 파일을 찾지 못했습니다.' : e.message); } finally { btn.disabled = false; }
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
    const sb = t.closest('[data-fs-set]');
    if (sb) { fsS.set = sb.dataset.fsSet; viewSet('fs.set', fsS.set); fsDraw(); if (fsS.set === 'req') fqLoad(true); return; }
    const fb = t.closest('[data-fs-f]');
    if (fb) { fsS.f = fb.dataset.fsF; viewSet('fs.f', fsS.f); root.querySelectorAll('[data-fs-f]').forEach((b) => b.classList.toggle('on', b === fb)); fsDraw(); return; }
    if (t.closest('#fs-ref')) { if (fsS.set === 'req') { fqLoad(true); return; } fsLoad(true).then(fsDraw).catch((e) => toast(e.message)); return; }
    if (t.closest('#fs-xlsx')) { fsDownload(t.closest('#fs-xlsx')); return; }
    const tb = t.closest('[data-fs-tab]');
    if (tb) { fsS.tab = tb.dataset.fsTab; viewSet('fs.tab', fsS.tab); fsRefreshRow(tb.closest('.ipo-row').dataset.fs); return; }
    const pb = t.closest('[data-fs-pipe]');
    if (pb) { fsPipeAdd(pb); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-fs]');
    if (row) { const k = row.dataset.fs; if (fsS.open.has(k)) fsS.open.delete(k); else fsS.open.add(k); viewSet('fs.open', fsS.open); fsRefreshRow(k); }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'fs-q') { fsS.q = ev.target.value; viewSet('fs.q', fsS.q); fsDraw(); } });
  root.addEventListener('change', (ev) => { if (ev.target.id === 'fs-sort') { fsS.sort = ev.target.value; viewSet('fs.sort', fsS.sort); fsDraw(); } });
}

async function renderFacts(host) {
  fsS.host = host;
  host.innerHTML = `<div class="ipo-page fs-page" id="fs-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="fs-sum"></div>
      ${infoBtn('deals/facts')}
      <button class="btn ghost fs-kb-only" type="button" id="fs-xlsx">${ico('file', 'sm')}엑셀 다운로드</button>
      <button class="btn ghost" type="button" id="fs-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div class="ipo-filter fs-kb-only">
        <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="fs-q" type="search" placeholder="회사·브랜드·부스·대표 검색" value="${esc(fsS.q)}" autocomplete="off" aria-label="검색"></div>
        <div class="seg">${FS_FILTERS.map(([k, l]) => `<button type="button" data-fs-f="${k}" class="${fsS.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select class="select" id="fs-sort" aria-label="정렬">${FS_SORTS.map(([k, l]) => `<option value="${k}"${fsS.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="ipo-body" id="fs-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  fsBind(host.querySelector('#fs-root'));
  if (fsS.set === 'req') fsDraw();
  try { await fsLoad(); } catch (e) { const b = host.querySelector('#fs-body'); if (b && fsS.set !== 'req') b.innerHTML = `<div class="empty">${esc(e.message)}</div>`; const s = host.querySelector('#fs-sum'); if (s) s.innerHTML = fsSummary(); return; }
  if (fsS.host === host && host.isConnected) fsDraw();
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (fsS.host === host) fsS.open.forEach((k) => { const x = fsFind(k), p = host.querySelector(`.ipo-row[data-fs="${CSS.escape(k)}"] .ipo-dhead > .rd-pipe`); if (x && p) p.outerHTML = fsPipe(x); }); }).catch(() => {});
}

/* 다른 화면(파이프라인 '팩트시트에서 보기')에서 한 회사를 펼쳐 열 때. 주소 이동은 부르는 쪽이 한다 */
function factsFocus(no) {
  const k = String(no ?? ''); if (!k) return;
  fsS.q = ''; fsS.f = 'all'; fsS.open.add(k); fsS.focus = k;
  viewSet('fs.q', ''); viewSet('fs.f', 'all'); viewSet('fs.open', fsS.open);
}
