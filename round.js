/* UNIVERSE WORKS — 딜소싱 › 상장 › 투자 라운드(#deals/round)
   2026-11-16 처음(사용자: "상장 준비 전에 시리즈 B, 시리즈 C도 있으면 좋을 듯") — 딥테크·소비재 자료에서 시리즈 B 이상만.
   2026-11-18 업종 무관 전체로(사용자: "후보 기준을 좁히지 말고, 라운드 도는 애들 다 리스트업한 뒤 필터로 거르면 된다", 캐치테이블이 들어올 길이 없었던 일. 딜레이더 노트 17.2).
   자료: data/rounds.json(딜레이더, 형식은 CONTRACT.md 「11/18 변경」 rounds.json). 파일이 아직 없으면 예전처럼 딥테크·소비재 자료(tgt.js tgS)에서 모은다.
   딥테크·소비재 보기는 빠른 보기 버튼(from에 '딥테크'·'소비재'가 든 회사)으로 남긴다.
   컨택 상태·메모는 다른 딜소싱 화면과 같은 data/radar_marks.json(키 = round:<이름> 또는 예전 자료면 deep:…·cons:…). 합친 회사는 aliases(예전 id)의 표시·파이프라인 ref도 이 행으로 본다(11/18).
   dt는 YYYY-MM-DD 또는 연월만(YYYY-MM, 딥테크·소비재 웹 조사). 연월만이면 목록에 yy.mm, 최근순 정렬은 같은 달 일자 있는 행 뒤(rnDk). 저장은 tgt.js 의 tgS.marks·tgSaveMarks를 같이 쓴다.
   펼친 칸 머리에는 fsq.js fqHead(같은 키라 팩트시트·관심 기업·파이프라인이 같은 회사로 본다), 파이프라인은 pipeline.js pipeAdd·pipeHas.
   홈 카드 '이번 주 새로 걸린 후보'(prenew.json)도 여기서 그린다: prenewHomeBlock().
   진입: renderRound(host) — host 안에만 그린다. 목록·펼친 행은 ipo.css, 좁은 폭 배치·묶음 제목은 radar.css(.rd-page·.rd-grp), 여기 것만 round.css. */

const RN_FILE = 'data/rounds.json';
const RN_TTL = 5 * 60000;
// co: 주요 투자사(딜레이더 major_investors.json) VC·PE 두 곳 이상, 펀드 만기 › 공동 투자와 같은 자료(radar.js coOfRound, 2026-11-25)
const RN_QUICK = [['all', '전체'], ['pe', 'PE 참여'], ['co', '주요 투자사 2곳 이상'], ['deep', '딥테크'], ['cons', '소비재'], ['good', '흑자']];
const rnCoOf = (e) => (typeof coOfRound === 'function' ? coOfRound([e.id, ...(e.aliases || [])]) : null);
const RN_ST = [['', '전체'], ['완료', '완료'], ['진행 중', '진행 중'], ['추진', '추진']];
const RN_STG = [['', '전체'], ['a', 'A 이하'], ['b', 'B'], ['c', 'C'], ['d', 'D 이상'], ['pre', 'Pre-IPO']];
const RN_AMT = [['', '전체'], ['100', '100억+'], ['300', '300억+'], ['1000', '1,000억+']];
const RN_PROF = [['', '전체'], ['turn', '흑자 전환']]; // 흑자(영업이익 0억 이상)·매출·성장률은 공용 슬라이더(filt.js, 2026-11-24)
const RN_IPO = [['', '전체'], ['1', '있음']];
const RN_SORT = [['dt', '최근 라운드순'], ['amt', '금액순'], ['val', '기업가치순'], ['rev', '매출순'], ['op', '영업이익순'], ['gr', '성장률순']];
const RN_BIG = 3000; // 기업가치 3,000억 이상은 '대형' 표시만(거르지 않음)
const RN_KEYS = ['q', 'k', 'st', 'sec', 'stg', 'amt', 'rev', 'op', 'opMode', 'gr', 'nn', 'prof', 'ipo', 'sp', 'sort'];

const rnS = (() => {
  const v = viewGet('rn2', null) || {};
  const s = { q: '', k: 'all', st: '', sec: '', stg: '', amt: '', rev: '', op: '', opMode: 'a', gr: '', nn: '', prof: '', ipo: '', sp: '', sort: 'dt', open: new Set(), host: null, err: '', data: null, at: 0, loading: null, field: null };
  RN_KEYS.forEach((k) => { if (typeof v[k] === 'string') s[k] = v[k]; });
  if (!RN_QUICK.some(([x]) => x === s.k)) s.k = 'all';
  if (s.prof === 'black') { s.prof = ''; if (!s.op) s.op = 'a:0'; } // 옛 '흑자' 칩 → 영업이익 0억 이상
  if (!RN_SORT.some(([x]) => x === s.sort)) s.sort = 'dt';
  if (Array.isArray(v.open)) s.open = new Set(v.open.filter((x) => typeof x === 'string'));
  return s;
})();
const rnSave = () => viewSet('rn2', { ...Object.fromEntries(RN_KEYS.map((k) => [k, rnS[k]])), open: [...rnS.open] });

/* ---------- 자료 ---------- */
const rnStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const rnNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rnArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const rnDay = (v) => { const s = rnStr(v); return /^\d{4}-\d{2}(-\d{2})?/.exec(s)?.[0] || ''; };
const rnHttp = (v) => { const s = rnStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const RN_P0 = { rev: null, op: null, gr: null, turn: false, black: false, fin: null, years: [] };
const rnPerf = (v) => (typeof rdPerfN === 'function' ? rdPerfN(v) : null) || RN_P0;
// 날짜 정렬 키: 딥테크·소비재 웹 조사에서 온 라운드는 연월만(YYYY-MM)이라 그 달 1일보다 앞(00일)으로 본다. 최근순이면 같은 달 안에서 일자 있는 행 뒤에 온다
const rnDk = (d) => (d && d.length === 7 ? `${d}-00` : d || '');
const rnDesc = (a, b) => { const x = rnDk(a), y = rnDk(b); return x === y ? 0 : x < y ? 1 : -1; };
const rnCo = (s) => rnStr(s).replace(/\(주\)|㈜|주식회사/g, '').replace(/[\s·.,\-()[\]]/g, '').toLowerCase();

function rnNorm(raw) {
  const seen = new Set();
  const items = rnArr(raw.items).map((x) => {
    const id = rnStr(x.id), name = rnStr(x.name);
    if (!id || !name || seen.has(id)) return null;
    seen.add(id);
    // 같은 회사를 합친 행: 대표 id 하나에 예전 id(aliases). 예전 id로 남은 컨택 상태·메모·파이프라인 ref·이동 주소도 이 행으로 본다
    const aliases = [...new Set((Array.isArray(x.aliases) ? x.aliases : []).map(rnStr).filter(Boolean).map((a) => (a.startsWith('round:') ? a : `round:${a}`)))].filter((a) => a !== id);
    const news = rnArr(x.news).filter((n) => rnStr(n.title)).map((n) => ({ dt: rnDay(n.dt), src: rnStr(n.src), title: rnStr(n.title), url: rnHttp(n.url) })).sort((a, b) => rnDesc(a.dt, b.dt));
    const rounds = rnArr(x.rounds).map((r) => ({ dt: rnDay(r.dt), round: rnStr(r.round), status: rnStr(r.status), amount: rnNum(r.amount), val: rnNum(r.val), investors: rnStr(r.investors), src: rnStr(r.src), title: rnStr(r.title), url: rnHttp(r.url) }))
      .filter((r) => r.dt || r.round || r.amount != null).sort((a, b) => rnDesc(a.dt, b.dt));
    const e = {
      id, key: id, name, brand: rnStr(x.brand), cc: rnStr(x.cc), listed: x.listed === true, sector: rnStr(x.sector), line: rnStr(x.line),
      round: rnStr(x.round), n: rnNum(x.stageN), status: rnStr(x.status), dt: rnDay(x.dt), amount: rnNum(x.amount), amountTxt: rnStr(x.amountTxt), goal: rnNum(x.goal),
      val: rnNum(x.val), valTxt: rnStr(x.valTxt), investors: rnStr(x.investors), pe: x.pe === true, target: rnStr(x.target), broker: rnStr(x.broker),
      p: rnPerf(x.perf), inv: rnNum(x.inv), rounds, news, from: (Array.isArray(x.from) ? x.from : []).map(rnStr).filter(Boolean),
      isNew: x.isNew === true, newAt: rnDay(x.newAt), src: 'rounds', aliases, tags: (Array.isArray(x.tags) ? x.tags : []).map(rnStr).filter(Boolean),
    };
    e.q = [name, ...aliases.map((a) => a.slice(6)), e.brand, e.sector, e.line, e.round, e.status, e.investors, e.target, e.broker, ...e.from, ...rounds.map((r) => r.investors)].join(' ').toLowerCase();
    return e;
  }).filter(Boolean).filter((e) => !e.listed);
  const alias = new Map();
  items.forEach((e) => e.aliases.forEach((a) => { if (!seen.has(a) && !alias.has(a)) alias.set(a, e.id); }));
  return { generated: rnStr(raw.generated), sources: raw.sources && typeof raw.sources === 'object' ? raw.sources : {}, items, alias };
}
const rnId = (id) => rnS.data?.alias?.get(id) || id;
// 컨택 상태·메모를 읽고 쓸 키: 대표 id에 표시가 없고 예전 id에 있으면 그 키를 그대로 쓴다(같은 회사가 두 줄로 갈리지 않게)
const rnMk = (e) => (e.aliases?.length && typeof tgMark === 'function' && !tgMark(e.key) ? e.aliases.find((a) => tgMark(a)) || e.key : e.key);

// rounds.json이 아직 없을 때: 딥테크·소비재 자료에서 시리즈 B 이상 비상장(11/16 방식)
function rnLastTg(x) {
  if (x.round) return x.round;
  const r = [...x.rounds].filter((y) => y.date).sort((a, b) => b.date.localeCompare(a.date))[0] || x.rounds[x.rounds.length - 1];
  return r ? { date: r.date, round: r.round, amount: r.amount, investors: r.investors } : null;
}
function rnFromTg() {
  const out = [];
  ['deep', 'cons'].forEach((k) => {
    (tgS[k].data?.items || []).forEach((x) => {
      if (x.listed && x.listed !== '비상장') return;
      if (x.rounds.some((r) => /공모/.test(r.round))) return;
      const ns = x.rounds.map((r) => tgStageN(r.round)).filter((n) => n != null);
      const n = k === 'deep' && x.stageN != null ? x.stageN : ns.length ? Math.max(...ns) : null;
      if (n == null || n < 2) return;
      const r = rnLastTg(x), am = /([\d,.]+)\s*억/.exec(r?.amount || '');
      out.push({
        id: x.id, key: x.id, name: x.name, brand: x.brand, sector: TG_CFG[k].title, line: x.tags.join(', '), round: r?.round || x.stage, n, status: '완료', dt: r?.date || '',
        amount: am ? +am[1].replace(/,/g, '') : null, amountTxt: r?.amount || '', val: null, valTxt: x.valuation, investors: r?.investors || '', pe: false, target: '', broker: '',
        p: { ...RN_P0, rev: x.rev, op: x.op, black: x.op != null && x.op > 0 }, inv: x.inv, rounds: [], news: [], from: [TG_CFG[k].title], isNew: false, src: k, tg: x, q: x.q,
      });
    });
  });
  return out;
}

async function rnRead() {
  let d;
  try { d = await STORE.readText(RN_FILE); } catch (e) { if (e.status === 404) return null; throw e; }
  if (!d.text) return null;
  let raw;
  try { raw = JSON.parse(d.text); } catch { throw new Error('투자 라운드 자료 형식이 올바르지 않습니다'); }
  const d2 = raw && typeof raw === 'object' && !Array.isArray(raw) ? rnNorm(raw) : null;
  return d2 && d2.items.length ? d2 : null; // 빈 파일(첫 수집 전 자리)이면 딥테크·소비재 자료로
}

/* ---------- 거르기·정렬 ---------- */
const rnStgOf = (n) => (n == null ? '' : n >= 9 ? 'pre' : n >= 4 ? 'd' : n >= 3 ? 'c' : n >= 2 ? 'b' : 'a');
const rnHasIpo = (e) => !!(e.target || e.broker);
const rnTgOf = (e) => e.tg || (typeof tgS === 'object' ? ['deep', 'cons'].map((k) => (tgS[k].data?.items || []).find((x) => (e.cc && x.code === e.cc) || rnCo(x.name) === rnCo(e.name))).find(Boolean) : null);
// 우주·방산 테마(space.js): 이름·옛 이름·브랜드, 수집기 태그(Claude 분류), 업종, 회사 설명과 기사 제목(강한 말만)
const rnSpIn = (e) => ({ name: e.name, names: [e.brand, ...(e.aliases || []).map((a) => a.slice(6))], text: [e.line, e.brand], titles: [...e.news, ...e.rounds].map((n) => n.title), tags: e.tags, sector: e.sector });
const rnSp = (e) => (typeof spOf === 'function' ? spOf(e, rnSpIn) : { sp: false, coi: false });
function rnOk(e, s, skipQuick) {
  if (!skipQuick) {
    if (s.k === 'pe' && !e.pe) return false;
    if (s.k === 'co' && !rnCoOf(e)) return false;
    if (s.k === 'deep' && !e.from.includes('딥테크')) return false;
    if (s.k === 'cons' && !e.from.includes('소비재')) return false;
    if (s.k === 'good' && !e.p.black) return false;
  }
  if (s.st && e.status !== s.st) return false;
  if (s.sec && e.sector !== s.sec) return false;
  if (s.stg && rnStgOf(e.n) !== s.stg) return false;
  if (s.amt && !(e.amount != null && e.amount >= +s.amt)) return false;
  if (typeof ffOk === 'function' && !ffOk(s, { rev: e.p.rev, op: e.p.op, gr: e.p.gr })) return false;
  if (s.prof === 'turn' && !e.p.turn) return false;
  if (s.ipo && !rnHasIpo(e)) return false;
  if (s.sp && !rnSp(e).sp) return false;
  return true;
}
function rnAll() { return rnS.data ? rnS.data.items : rnFromTg(); }
// 관심 없음(사람별, fav.js): 펼친 칸 머리와 같은 ref(e.key = round:… 또는 예전 자료 deep:… · cons:…)로 본다. 합친 회사는 예전 id(aliases)로 표시한 것도 같은 회사
const rnRef = (e) => [e.key, ...(e.aliases || [])].find((r) => typeof fvSkip === 'function' && fvSkip(r)) || e.key;
const rnFv = (list) => (typeof fvSplit === 'function' ? fvSplit(list, rnRef) : [list, []]);
function rnRows(all) {
  const s = rnS, q = s.q.trim().toLowerCase();
  const dt = (a, b) => rnDesc(a.dt, b.dt);
  const v = { amt: (e) => e.amount, val: (e) => e.val, rev: (e) => e.p.rev, op: (e) => e.p.op, gr: (e) => e.p.gr }[s.sort];
  const by = v ? (a, b) => (v(b) ?? -Infinity) - (v(a) ?? -Infinity) || dt(a, b) : dt;
  return all.filter((e) => rnOk(e, s) && (!q || e.q.includes(q))).sort((a, b) => by(a, b) || a.name.localeCompare(b.name, 'ko'));
}

/* ---------- 표시 형식 ---------- */
const RN_NA = '<span class="muted">–</span>';
const rnEok = (v) => (v == null ? '' : `${v.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`);
const rnOp = (v) => (v == null ? '' : v < 0 ? `<span class="pe-dn">${rnEok(v)}</span>` : rnEok(v));
const rnYmd = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? yymd(d) : /^\d{4}-\d{2}$/.test(d) ? `${d.slice(2, 4)}.${d.slice(5, 7)}` : d);
const rnKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const rnBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const rnAmt = (e) => (e.amount != null ? rnEok(e.amount) : e.amountTxt ? esc(e.amountTxt) : '');
const rnSt = (e) => (typeof tgSt === 'function' ? tgSt(rnMk(e)) : '미접촉');
const rnChip = (e) => (typeof tgChip === 'function' ? tgChip(rnSt(e)) : '');
const rnChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
const rnStChip = (st) => (st ? `<span class="pe-ds${st === '완료' ? '' : ' on'}">${esc(st)}</span>` : '');
const RN_HEAD = '<div class="ipo-head ipo-cols"><div>날짜</div><div>회사</div><div>라운드</div><div>금액</div><div class="rd-c2">투자자</div><div>매출</div><div class="rd-h-st">컨택 상태</div></div>';

function rnRow(e) {
  const open = rnS.open.has(e.id), p = e.p;
  const tags = `${e.isNew ? '<span class="rd-fs-tag">새로 걸림</span>' : ''}${e.pe ? '<span class="rd-fs-tag">PE 참여</span>' : ''}${e.val != null && e.val >= RN_BIG ? '<span class="rd-fs-tag rd-big">대형</span>' : ''}${typeof spBadge === 'function' ? spBadge(rnSp(e)) : ''}${typeof coBadge === 'function' ? coBadge(rnCoOf(e)) : ''}`;
  const sub = [e.sector, e.line || e.brand].filter(Boolean).join(', ');
  const p1 = [rnYmd(e.dt), e.round, rnAmt(e)].filter(Boolean).join(' ');
  return `<div class="ipo-row${open ? ' open' : ''}${typeof tgDoneCls === 'function' ? tgDoneCls(rnSt(e)) : ''}" data-id="${esc(e.id)}">
    <div class="ipo-line ipo-cols">
      <div class="rd-mh">${e.dt ? esc(rnYmd(e.dt)) : RN_NA}</div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${tgNm(e.name)}</button>${tags}${sub ? `<div class="ipo-sub">${esc(sub)}</div>` : ''}<div class="rn-pair"><span class="rn-p1">${p1 ? esc(p1) : '–'}</span><span>${e.status ? esc(e.status) : ''}</span></div></div>
      <div class="rd-mh">${e.round ? esc(e.round) : RN_NA}${e.status ? `<div class="ipo-sub">${esc(e.status)}</div>` : ''}</div>
      <div class="rd-mh">${rnAmt(e) || (e.goal != null ? `목표 ${rnEok(e.goal)}` : RN_NA)}${e.val != null ? `<div class="ipo-sub">기업가치 ${rnEok(e.val)}</div>` : ''}</div>
      <div class="rd-mh rd-c2">${e.investors ? `<div class="rd-clamp">${esc(e.investors)}</div>` : RN_NA}</div>
      <div class="rd-mh">${p.rev != null ? rnEok(p.rev) : RN_NA}${p.op != null ? `<div class="ipo-sub">영업이익 ${rnOp(p.op)}${p.turn ? ' <span class="rd-turn">흑자 전환</span>' : ''}</div>` : ''}</div>
      <div class="ipo-c-st">${typeof ctSel === 'function' ? ctSel('rn', e.id, rnSt(e), e.key) : rnChip(e)}${rnChev()}</div>
    </div>${open ? rnDetail(e) : ''}</div>`;
}

/* ---------- 펼친 행 ---------- */
// 머리: 요약 + 컨택 상태 + 메모 + 팩트시트 요청 + 파이프라인(+ 딥테크·소비재에서 보기)
function rnPipe(e) {
  if (typeof pipeAdd !== 'function') return '';
  let has = '';
  try { has = typeof pipeHas === 'function' ? [e.key, ...(e.aliases || [])].find((r) => pipeHas(r)) || '' : ''; } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(has)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-rn-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}
function rnHead(e) {
  const st = rnSt(e), m = typeof tgMark === 'function' ? tgMark(rnMk(e)) : null, tg = rnTgOf(e);
  const sum = [e.line, e.valTxt].filter(Boolean).join(', ') || e.tg?.why || '';
  const go = tg ? `<a class="ipo-a rd-pipe rn-go" href="#deals/${tg.id.split(':')[0]}" data-rn-go="${esc(tg.id)}">${esc(TG_CFG[tg.id.split(':')[0]].title)}에서 보기${ico('right', 'sm')}</a>` : '';
  return `<div class="ipo-dhead">${sum ? `<p class="ipo-sum1">${esc(sum)}</p>` : '<p></p>'}
      <div class="ipo-acts"><div class="seg ipo-seg">${TG_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" aria-pressed="${s === st}" data-rn-cst="${s}">${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-rn-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모">
        <span class="ipo-by">${esc(typeof tgByText === 'function' ? tgByText(m) : '')}</span>${typeof fqHead === 'function' ? fqHead(e.key, e) : ''}${go}</div>${rnPipe(e)}
    </div>`;
}
function rnRoundsTbl(e) {
  if (!e.rounds.length) return '';
  const tr = (r) => `<tr><td>${esc(rnYmd(r.dt)) || '–'}</td><td>${esc(r.round) || '–'}${r.status ? `<div class="ipo-sub">${esc(r.status)}</div>` : ''}</td><td>${r.amount != null ? rnEok(r.amount) : '–'}${r.val != null ? `<div class="ipo-sub">기업가치 ${rnEok(r.val)}</div>` : ''}</td>
    <td>${esc(r.investors) || '–'}${r.url ? `<div class="ipo-sub"><a class="rd-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" title="${esc(r.title)}">${esc(r.src || '기사')}</a></div>` : r.src ? `<div class="ipo-sub">${esc(r.src)}</div>` : ''}</td></tr>`;
  return rnBox('투자 라운드', `<table class="ipo-tbl rd-tbl-r rn-tbl"><thead><tr><th>시기</th><th>라운드</th><th>금액</th><th>투자자</th></tr></thead><tbody>${e.rounds.map(tr).join('')}</tbody></table>`, `${e.rounds.length}건`);
}
function rnDetail(e) {
  if (e.tg && !e.rounds.length && typeof tgRoundsBox === 'function') return rnDetailTg(e);
  const p = e.p;
  const inv = `${rnKv('라운드', esc(e.round))}${rnKv('상태', rnStChip(e.status))}${rnKv('날짜', esc(e.dt))}${rnKv('금액', rnAmt(e))}${rnKv('목표 조달', e.goal != null ? rnEok(e.goal) : '')}
    ${rnKv('기업가치', esc(e.valTxt || (e.val != null ? rnEok(e.val) : '')))}${rnKv('투자자', esc(e.investors))}${rnKv('누적 투자', e.inv != null ? rnEok(e.inv) : '')}${rnKv('PE 참여', e.pe ? '라운드 참여 후보' : '')}`;
  const co = `${rnKv('업종', esc(e.sector))}${rnKv('내용', esc(e.line))}${rnKv('브랜드', esc(e.brand))}${rnKv('상장 목표', esc(e.target))}${rnKv('주관사', esc(e.broker))}${rnKv('출처', esc(e.from.join(', ')))}
    <div class="ipo-links"><a class="ipo-a" href="https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(e.name)}" target="_blank" rel="noopener noreferrer">DART 검색${ico('ext', 'sm')}</a></div>`;
  const pnl = p.fin && typeof rdPnl === 'function' ? rdPnl(p.fin, p.years) : '';
  const news = e.news.length && typeof rdNewsBox === 'function' ? rdNewsBox(e.news) : '';
  return `<div class="ipo-detail">${rnHead(e)}
    <div class="ipo-pane"><div class="ipo-stack">${typeof fqBox === 'function' ? fqBox(e.key, e, '투자 라운드') : ''}${rnRoundsTbl(e)}
      <div class="ipo-two-col">
        <div class="ipo-stack">${rnBox('투자', inv.trim())}</div>
        <div class="ipo-stack">${pnl}${rnBox('회사 정보', co)}</div>
      </div>${news}
    </div></div>
  </div>`;
}
// 예전 자료(딥테크·소비재)에서 온 행: tgt.js 상자를 그대로
function rnDetailTg(e) {
  const x = e.tg, deep = e.src === 'deep', f = x.founder, title = TG_CFG[e.src].title, r = rnLastTg(x);
  const invs = x.investors.length ? x.investors : [...new Set(x.rounds.flatMap((y) => y.investors.split(/,\s*/)).map((s) => s.trim()).filter(Boolean))];
  const inv = `${tgKv('단계', x.stage ? tgStage(x) : '')}${tgKv('누적 투자', x.inv != null ? tgEok(x.inv) : '')}${tgKv('최근 라운드', r ? esc(tgRoundTxt(r)) : '')}${tgKv('라운드 투자자', esc(r?.investors))}
    ${tgKv('투자사', invs.length ? invs.map(tgNm).join(', ') : '')}${tgKv('기업가치', esc(x.valuation))}`;
  const est = x.est ? `${esc(x.est)}${x.years != null ? `, 업력 ${x.years}년` : ''}` : x.years != null ? `업력 ${x.years}년` : '';
  const co = `${tgKv('분야', esc([title, x.tags.join(', ')].filter(Boolean).join(', ')))}${tgKv(deep ? '기술' : '브랜드', esc(deep ? x.tech : x.brand))}${tgKv('대표', x.ceo ? tgNm(x.ceo) : '')}
    ${tgKv('창업자', f && tgAge(f) ? `${tgAge(f)}${x.young === true ? ' <span class="tgt-yg">젊은 창업자</span>' : ''}` : '')}${tgKv('설립', est)}${tgKv('지역', esc(x.region))}`;
  return `<div class="ipo-detail">${rnHead(e)}
    <div class="ipo-pane"><div class="ipo-stack">${typeof fqBox === 'function' ? fqBox(e.key, x, title) : ''}${tgRoundsBox(x).replace('ipo-tbl tgt-rounds', 'ipo-tbl tgt-rounds rd-tbl-r')}
      <div class="ipo-two-col">
        <div class="ipo-stack">${tgBox('투자', inv.trim() || TG_NONE)}${tgFinBox(x)}</div>
        <div class="ipo-stack">${tgBox('회사 정보', co)}</div>
      </div>
    </div></div>
  </div>`;
}

/* ---------- 컨택 상태·메모: radar_marks.json(tgt.js 저장 줄을 같이 탄다) ---------- */
function rnTouch(e, patch) {
  if (typeof tgSaveMarks !== 'function' || !tgS.marks) return false;
  const key = rnMk(e), tab = key.split(':')[0];
  let m = tgMark(key);
  const prev = tgS.dirty.get(key), base = prev ? prev.base : (m ? { ...m } : null);
  if (!m) { m = { key, tab, name: e.name, status: '미접촉', note: '' }; tgS.marks.items.push(m); }
  const d = { patch: { ...prev?.patch, ...patch }, seq: ++tgSeq, base, name: e.name, tab, at: tgNow(), by: G.account?.name || '' };
  Object.assign(m, patch, { tab, name: d.name, at: d.at, by: d.by });
  tgS.dirty.set(key, d);
  tgSaveMarks().finally(() => rnDraw());
  return true;
}
function rnSetStatus(id, st) {
  const e = rnAll().find((y) => y.id === id); if (!e || !TG_STATUS.includes(st)) return;
  let v = st;
  if (rnSt(e) === v) { if (v !== TG_STATUS[4]) return; v = TG_STATUS[0]; }
  if (rnTouch(e, { status: v })) rnRedrawRow(id);
}
function rnSetNote(id, val) {
  const e = rnAll().find((y) => y.id === id); if (!e) return;
  const note = String(val || '').trim().slice(0, 300);
  if ((tgMark(rnMk(e))?.note || '') === note) return;
  rnTouch(e, { note });
}

/* ---------- 요약 줄·필터 ---------- */
function rnSummary(all) {
  const d = rnS.data;
  if (!d && !tgS.deep.data && !tgS.cons.data) return '';
  const g = d?.generated ? new Date(d.generated) : null, ok = g && !isNaN(g);
  const gl = ok ? `${ymd(g) === today() ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집` : '';
  const fails = d ? Object.entries(d.sources).filter(([, v]) => /^실패/.test(rnStr(v))).map(([k]) => `<span class="ipo-stale">${esc(k)} 실패</span>`) : [];
  return [gl ? `<span class="${ok && Date.now() - g > 36 * 3600000 ? 'ipo-stale' : ''}">${gl}</span>` : '',
    `<span><b>${all.length}</b>곳</span>`,
    d ? `<span>새로 걸림 <b>${all.filter((e) => e.isNew).length}</b></span>` : '',
    d ? `<span>PE 참여 <b>${all.filter((e) => e.pe).length}</b></span>` : '',
    `<span>컨택 <b>${all.filter((e) => rnSt(e) !== '미접촉').length}</b></span>`, ...fails].join('');
}
function rnQuickHtml(all) {
  return RN_QUICK.map(([k, l]) => { const n = all.filter((e) => rnOk(e, { ...rnS, k, st: '', sec: '', stg: '', amt: '', rev: '', op: '', gr: '', prof: '', ipo: '', sp: '' })).length;
    return `<button type="button" class="${rnS.k === k ? 'on' : ''}" aria-pressed="${rnS.k === k}" data-rn-k="${k}">${esc(l)}<span class="rd-qn">${n}</span></button>`; }).join('');
}
const rnSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
const rnSel = (id, label, opts, cur) => `<select class="select" id="${id}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
function rnFilterHtml(all) {
  const s = rnS, secs = new Map();
  if (typeof FF_RG === 'object') FF_RG.rn = { st: () => rnS, apply: () => rnDraw(), spN: () => all.filter((e) => rnSp(e).sp).length }; // 슬라이더: 끌 때는 목록만(필터 줄은 그대로)
  const rg = (k, l) => (typeof ffRangeHtml === 'function' ? ffRangeHtml('rn', k, l) : '');
  all.forEach((e) => { if (e.sector) secs.set(e.sector, (secs.get(e.sector) || 0) + 1); });
  if (s.sec && !secs.has(s.sec)) secs.set(s.sec, 0);
  const secOpts = [['', '업종 전체'], ...[...secs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')).map(([k, n]) => [k, `${k} ${n}`])];
  return `<div class="ipo-filter" id="rn-f1"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="rn-q" type="search" placeholder="회사, 업종, 투자사로 검색" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>
    ${rnSeg('rn-st', RN_ST, s.st)}${rnSel('rn-sec', '업종', secOpts, s.sec)}${rnSel('rn-sort', '정렬', RN_SORT, s.sort)}</div>
    <div class="ipo-filter rd-finf" id="rn-f2">${rg('sp', '테마')}<div class="rd-fing"><span class="rd-finl">라운드</span>${rnSeg('rn-stg', RN_STG, s.stg)}</div>
    <div class="rd-fing"><span class="rd-finl">금액</span>${rnSeg('rn-amt', RN_AMT, s.amt)}</div>
    ${rg('rev', '매출')}${rg('op', '영업이익')}${rg('gr', '매출 성장')}
    <div class="rd-fing"><span class="rd-finl">흑자 전환</span>${rnSeg('rn-prof', RN_PROF, s.prof)}</div>
    <div class="rd-fing"><span class="rd-finl">상장 목표</span>${rnSeg('rn-ipo', RN_IPO, s.ipo)}</div>${rg('nn', '값 없음')}</div>`;
}

/* ---------- 그리기 ---------- */
function rnBody(all) {
  if (rnS.err) return `<div class="empty">${esc(rnS.err)}</div>`;
  if (!rnS.data && !tgS.deep.data && !tgS.cons.data) return '<div class="empty">투자 라운드 목록을 준비하고 있습니다. 자료가 올라오면 여기에 보입니다.</div>';
  const [list, skip] = rnFv(rnRows(all));
  if (!list.length && !skip.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  return RN_HEAD + list.map((e) => rnRow(e)).join('') + (skip.length ? fvSkipTail(skip, 'round', (e) => rnRow(e)) : '');
}

function rnDraw(full) {
  const h = rnS.host; if (!h || !h.isConnected) return;
  const ae = document.activeElement;
  if (ae && ae.matches?.('[data-rn-note]') && h.contains(ae)) { rnS.redraw = true; return; } // 메모를 쓰는 중이면 칸을 떠날 때 다시 그린다
  const all = rnAll(), vis = rnFv(all)[0]; // 요약 숫자·빠른 보기·업종 숫자는 관심 없음을 뺀 목록으로
  if (full) h.querySelector('#rn-filter').innerHTML = rnFilterHtml(vis);
  h.querySelector('#rn-quick').innerHTML = rnQuickHtml(vis);
  h.querySelector('#rn-sum').innerHTML = rnSummary(vis);
  h.querySelector('#rn-body').innerHTML = rnBody(all);
  rnSave();
  if (rnS.focus) {
    const r = [...h.querySelectorAll('#rn-body .ipo-row[data-id]')].find((x) => x.dataset.id === rnS.focus);
    rnS.focus = null;
    if (r) r.scrollIntoView({ block: 'start' });
  }
}

function rnRedrawRow(id) {
  const h = rnS.host; if (!h) return;
  const row = [...h.querySelectorAll('#rn-body .ipo-row[data-id]')].find((r) => r.dataset.id === id);
  const e = rnAll().find((y) => y.id === id);
  if (!row) return;
  if (!e) { row.remove(); return; }
  const t = document.createElement('template'); t.innerHTML = rnRow(e).trim();
  row.replaceWith(t.content.firstElementChild);
}

function rnToggle(row) {
  const id = row.dataset.id, was = rnS.open.has(id);
  if (was) rnS.open.delete(id); else rnS.open.add(id);
  rnSave();
  rnRedrawRow(id);
  if (!was) {
    const n = [...rnS.host.querySelectorAll('#rn-body .ipo-row[data-id]')].find((r) => r.dataset.id === id);
    const sc = n?.closest('.scroll');
    if (n && sc && n.getBoundingClientRect().top < sc.getBoundingClientRect().top) n.scrollIntoView({ block: 'start' });
  }
}

async function rnPipeAdd(btn) {
  const id = btn.closest('.ipo-row')?.dataset.id, e = rnAll().find((y) => y.id === id);
  if (!e || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  const src = e.src === 'deep' ? '딥테크' : e.src === 'cons' ? '소비재' : '투자 라운드';
  try { await pipeAdd({ src, ref: e.key, name: e.name, type: '프리IPO' }); } catch (er) { toast(er?.message || '파이프라인에 올리지 못했습니다.'); }
  rnRedrawRow(id);
}

function rnBind(root) {
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const kb = t.closest('[data-rn-k]'); if (kb) { rnS.k = kb.dataset.rnK; rnDraw(); return; }
    const cb = t.closest('[data-rn-cst]'); if (cb) { rnSetStatus(cb.closest('.ipo-row').dataset.id, cb.dataset.rnCst); return; }
    for (const f of ['st', 'stg', 'amt', 'prof', 'ipo']) {
      const b = t.closest(`[data-rn-${f}]`);
      if (b) { rnS[f] = b.getAttribute(`data-rn-${f}`); segOn(`[data-rn-${f}]`, b); rnDraw(); return; }
    }
    const pb = t.closest('[data-rn-pipe]'); if (pb) { rnPipeAdd(pb); return; }
    const go = t.closest('[data-rn-go]');
    if (go) { ev.preventDefault(); const to = typeof tgtFocus === 'function' ? tgtFocus(go.dataset.rnGo) : ''; location.hash = to || go.getAttribute('href'); return; }
    if (t.closest('#rn-ref')) { rnLoad(true); if (typeof pipeLoad === 'function') pipeLoad(true).catch(() => {}); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]'); if (row) rnToggle(row);
  });
  let qt = 0; const qGo = () => { clearTimeout(qt); qt = setTimeout(() => rnDraw(), 150); }; // 검색: 150ms 모아서, 한글 조합 중엔 compositionend 때
  root.addEventListener('input', (ev) => { if (ev.target.id === 'rn-q') { rnS.q = ev.target.value; if (!ev.isComposing) qGo(); } });
  root.addEventListener('compositionend', (ev) => { if (ev.target.id === 'rn-q') qGo(); });
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'rn-sort') { rnS.sort = t.value; rnDraw(); }
    if (t.id === 'rn-sec') { rnS.sec = t.value; rnDraw(); }
    if (t.matches('[data-rn-note]')) rnSetNote(t.closest('.ipo-row').dataset.id, t.value);
  });
  root.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!t.matches?.('[data-rn-note]')) return;
    rnSetNote(t.closest('.ipo-row')?.dataset.id, t.value);
    if (rnS.redraw) { rnS.redraw = false; setTimeout(() => rnDraw(), 0); }
  });
}

// 관심 없음을 켜고 끄거나 처음 읽었을 때: 이 화면이 열려 있으면 목록을 다시 그린다(업종 숫자까지 맞추되 고르던 칸은 그대로)
window.addEventListener('fv-change', () => {
  const h = rnS.host;
  if (!h?.isConnected || !h.querySelector('#rn-body') || (!rnS.data && !tgS.deep.data && !tgS.cons.data)) return;
  const sc = h.closest('.scroll'), top = sc?.scrollTop;
  const ae = document.activeElement, keepF = ae && h.querySelector('#rn-filter')?.contains(ae);
  rnDraw(!keepF);
  if (sc) sc.scrollTop = top;
});

async function rnLoad(force) {
  const host = rnS.host;
  if (force || !rnS.at || Date.now() - rnS.at > RN_TTL) {
    if (!rnS.loading) rnS.loading = rnRead().then((d) => { rnS.data = d; rnS.at = Date.now(); rnFixIds(); }).finally(() => { rnS.loading = null; });
  }
  // 딥테크·소비재 자료는 컨택 상태(radar_marks)와 '딥테크에서 보기' 연결에, rounds.json이 없으면 목록 자체에 쓴다
  const r = await Promise.allSettled([rnS.loading || Promise.resolve(), tgLoad('deep', force), tgLoad('cons', force), typeof spLoad === 'function' ? spLoad(force) : null, typeof coLoad === 'function' ? coLoad(force) : null]);
  if (rnS.host !== host || !host || !host.isConnected) return;
  const bad = r.find((y) => y.status === 'rejected');
  rnS.err = bad && !rnS.data && !tgS.deep.data && !tgS.cons.data ? (bad.reason?.message || '자료를 불러오지 못했습니다') : '';
  if (bad && !rnS.err && r[0].status === 'rejected') toast(bad.reason?.message || '자료 일부를 불러오지 못했습니다');
  TAB_INFO['deals/round'] = rnInfo();
  rnDraw(true);
}

async function renderRound(host) {
  rnS.host = host; rnS.err = '';
  host.innerHTML = `<div class="ipo-page rd-page tgt-page rn-page" id="rn-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="rn-sum"></div>
      ${infoBtn('deals/round')}
      <button class="btn ghost" type="button" id="rn-ref">${ico('refresh', 'sm')}<span>새로고침</span></button></div>
    <section class="card ipo-card">
      <div class="rd-quick" id="rn-quick"></div>
      <div id="rn-filter">${rnFilterHtml([])}</div>
      <div class="ipo-body" id="rn-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  rnBind(host.querySelector('#rn-root'));
  if (typeof pipeLoad === 'function') pipeLoad().catch(() => {});
  await rnLoad(false);
}

// 펼친 행·이동할 행이 예전 id(합치기 전)로 남아 있으면 대표 id로
function rnFixIds() {
  if (!rnS.data?.alias?.size) return;
  rnS.open = new Set([...rnS.open].map(rnId));
  if (rnS.focus) rnS.focus = rnId(rnS.focus);
}

/* 다른 화면(파이프라인·홈 카드·섹터)에서 ref('round:<이름>')로 한 회사를 펼쳐 보여 줄 때: 필터를 풀고 펼친 뒤 돌려준 주소로 이동 */
function roundFocus(ref) {
  const id = rnId(String(ref || '').replace(/^round:(?=round:)/, '')); // 키가 round:<id>(id 자체도 round:…)로 와도 같은 행. 예전 id면 대표 id로(자료를 아직 안 읽었으면 읽은 뒤 rnFixIds)
  if (!id) return '';
  Object.assign(rnS, { q: '', k: 'all', st: '', sec: '', stg: '', amt: '', rev: '', op: '', gr: '', prof: '', ipo: '', sp: '' });
  rnS.open.add(id); rnS.focus = id;
  const e = rnAll().find((y) => y.id === id);
  if (typeof fvSkip === 'function' && fvSkip(e ? rnRef(e) : id)) viewSet('fv.sk.round', true); // 관심 없음 회사면 맨 아래 묶음을 펼쳐 둔다
  rnSave();
  return '#deals/round';
}

/* ---------- 홈 카드: 이번 주 새로 걸린 후보(prenew.json, 세 탭 모음) ----------
   행을 누르면 그 탭에서 그 회사를 펼친다(펀드 만기·상장 준비 = radar.js radarFocus, 투자 라운드 = roundFocus) */
const PN_FILE = 'data/prenew.json';
const PN_MAX = 5;
const PN_TAB = { sell: '펀드 만기', mandate: '상장 준비', round: '투자 라운드' };
async function prenewLoad() {
  let d;
  try { d = await STORE.readText(PN_FILE); } catch (e) { if (e.status === 404) return null; throw e; }
  if (!d.text) return null;
  let raw; try { raw = JSON.parse(d.text); } catch { return null; }
  const items = rnArr(raw?.items).map((x) => ({ tab: rnStr(x.tab), key: rnStr(x.key), name: rnStr(x.name), dt: rnDay(x.dt), why: rnStr(x.why) }))
    .filter((x) => x.name && x.key && PN_TAB[x.tab]).sort((a, b) => rnDesc(a.dt, b.dt));
  return { generated: rnStr(raw.generated), since: rnDay(raw.since), items };
}
function prenewGo(key) {
  if (key.startsWith('round:')) return roundFocus(key);
  return typeof radarFocus === 'function' ? radarFocus(key) : '';
}
async function prenewHomeBlock() {
  const d = await prenewLoad();
  if (!d || !d.items.length) return '';
  const rows = d.items.slice(0, PN_MAX).map((x) => `<li class="click" data-pn-go="${esc(x.key)}"><div class="t"><div class="ttl">${esc(x.name)}<span class="chip line pn-tab">${esc(PN_TAB[x.tab])}</span></div>${x.why ? `<div class="meta">${esc(x.why)}</div>` : ''}</div>${x.dt ? `<span class="meta">${esc(rnYmd(x.dt))}</span>` : ''}</li>`).join('');
  return `<section class="card pn-home" id="home-pn"><div class="card-head"><h2>이번 주 새로 걸린 후보 <span class="n">${d.items.length}</span></h2>${d.items.length > PN_MAX ? '<a class="btn sm act" href="#deals/sell" data-pn-all>전체 보기</a>' : ''}</div>
    <div class="card-body" style="padding-top:0"><ul class="list">${rows}</ul></div></section>`;
}
// 홈 카드 클릭(app.js가 카드를 끼운 뒤 한 번 부른다)
function prenewBind(root) {
  root?.addEventListener('click', (ev) => {
    const li = ev.target.closest('[data-pn-go]'); if (!li) return;
    const to = prenewGo(li.dataset.pnGo); if (to) location.hash = to;
  });
}

/* ---------- 화면 설명(ⓘ) ---------- */
function rnInfo() {
  const d = rnS.data;
  return {
    title: '투자 라운드',
    asof: d?.generated ? `기준 ${d.generated.slice(0, 10)}` : '',
    rows: [
      ['무엇인가', ['업종과 시리즈를 가리지 않고 투자 라운드를 돌았거나 도는 비상장 회사 목록입니다. 기사, 섹터 PE 딜, 딥테크, 소비재 자료에서 모읍니다.',
        '상태는 완료(투자 마감), 진행 중(1차 클로징 뒤 추가 모집), 추진(조달 추진 기사)으로 나눕니다.']],
      ['왜 보나', ['상장 준비에 들어가기 전 단계의 회사를 미리 찾아 다음 라운드, 구주, 공동투자 기회를 보기 위한 목록입니다.',
        'PE 참여는 사모펀드가 소수지분으로 들어가거나 PE 컨소시엄이 조달을 추진하는 라운드입니다. 컨소시엄 LP나 2차 클로징으로 같이 들어갈 여지가 있습니다.']],
      ['어떻게 보나', [
        '맨 위 버튼으로 전체, PE 참여, 주요 투자사 2곳 이상, 딥테크, 소비재, 흑자 회사를 바로 고릅니다.',
        '\'주요 투자사 n\'은 이름 있는 VC·PE 가운데 n곳이 이 회사에 들어가 있다는 표시입니다. 기준과 목록은 펀드 만기 › 공동 투자와 같습니다.',
        '상태, 업종, 라운드 단계, 금액, 영업이익(흑자, 흑자 전환), 상장 목표로 좁히고 최근 라운드, 금액, 기업가치, 매출, 영업이익, 성장률 순으로 정렬합니다.',
        '기업가치 3,000억 이상은 대형으로 표시만 하고 거르지 않습니다. 새로 걸림은 이번 주에 처음 들어온 회사입니다.',
        '행을 펼치면 라운드 이력, 투자, 주요 손익, 회사 정보, 기사가 나오고 컨택 상태와 메모를 바로 남깁니다.',
      ]],
      ['그래서 할 일', ['볼 곳은 팩트시트를 요청하고, PE 참여 라운드는 주관 PE에 공동투자 여지를 문의한 뒤 파이프라인에 올립니다.']],
    ],
  };
}
TAB_INFO['deals/round'] = rnInfo();
