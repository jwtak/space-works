/* UNIVERSE WORKS — 딜소싱 › 상폐 위험·CB (#deals/delist)
   매일 09:30 PC 작업(05. 딜소싱\_자동화\딜레이더\delist.py)이 회사 OneDrive SPACE WORKS/data/delist.json 을 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT_delist.md).
   상장폐지 시총 요건 위험 회사 목록(items)과 Claude가 고른 오늘의 후보(picks). 연락 상태·메모는 따로 두지 않고 파이프라인(ref = delist:<종목코드>)에서 관리한다.
   진입: renderDelist(host) — host 안에만 그린다. 다른 화면에서 한 회사를 펼쳐 열 때: delistFocus(ref)가 돌려준 주소로 이동.
   app.js 전역($, esc, pad, ymd, yymd, today, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn)과 graph.js 의 STORE, ipo.css·radar.css 클래스(목록·상자·좁은 폭 배치)를 쓴다.
   파이프라인은 pipeline.js 의 pipeAdd·pipeHas·pipeLoad(있을 때만 버튼이 보인다). */

const DL_FILE = 'data/delist.json';
const DL_TTL = 5 * 60000;
const DL_PIPE_SRC = '상폐 위험·CB';
const DL_F = [['pass', '후보만'], ['all', '전체']];
const DL_MKTS = [['', '전체'], ['코스피', '코스피'], ['코스닥', '코스닥']];
const DL_SORT = [['score', '점수순'], ['mcap', '시총순'], ['gap', '부족분순'], ['turnover', '거래대금순']];

// 새로 고친 뒤에도 보던 검색어·필터·정렬·펼친 행을 이어 보게 창마다 기억한다(app.js viewGet·viewSet)
const DL_VIEW = ['q', 'f', 'stage', 'mkt', 'sort'];
const dlS = (() => {
  const s = { data: null, at: 0, loading: null, q: '', f: 'pass', stage: '', mkt: '', sort: 'score', open: new Set(), focus: null, host: null };
  const v = viewGet('dl', null) || {};
  DL_VIEW.forEach((k) => { if (typeof v[k] === 'string') s[k] = v[k]; });
  s.open = new Set(Array.isArray(v.open) ? v.open : []);
  return s;
})();
const dlViewSave = () => viewSet('dl', { ...Object.fromEntries(DL_VIEW.map((k) => [k, dlS[k]])), open: [...dlS.open] });

/* ---------- 데이터 ---------- */
const dlStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const dlNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const dlArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const dlDay = (v) => { const s = dlStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };

function dlNorm(raw) {
  const r = raw.rules && typeof raw.rules === 'object' ? raw.rules : {};
  const rule = (o) => (o && typeof o === 'object' ? { from: dlStr(o.from), 코스피: dlNum(o['코스피']), 코스닥: dlNum(o['코스닥']) } : { from: '', 코스피: null, 코스닥: null });
  const fl = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  const seen = new Set();
  const items = dlArr(raw.items).map((x, i) => {
    const code = dlStr(x.code), name = dlStr(x.name);
    if (!code || !name || seen.has(code)) return null;
    seen.add(code);
    const fin = dlArr(x.fin).filter((f) => dlNum(f.y) != null).map((f) => ({ y: f.y, rev: dlNum(f.rev), op: dlNum(f.op), ni: dlNum(f.ni), assets: dlNum(f.assets), liab: dlNum(f.liab), equity: dlNum(f.equity), fs: dlStr(f.fs) }))
      .sort((a, b) => a.y - b.y).slice(-3);
    const h = x.holder && typeof x.holder === 'object' ? x.holder : {};
    const fg = x.flags && typeof x.flags === 'object' ? x.flags : {};
    const mz = x.mezz && typeof x.mezz === 'object' ? x.mezz : {};
    const mlist = dlArr(mz.list).map((m) => ({ dt: dlDay(m.dt), type: dlStr(m.type), amount: dlNum(m.amount), conv: dlNum(m.conv_price), refix: dlNum(m.refix),
      investors: (Array.isArray(m.investors) ? m.investors : [m.investors]).map(dlStr).filter(Boolean) })).sort((a, b) => b.dt.localeCompare(a.dt));
    const st = [1, 2, 3].includes(x.stage) ? x.stage : null;
    const o = {
      code, name, idx: i, market: dlStr(x.market), sector: dlStr(x.sector), biz: dlStr(x.biz), close: dlNum(x.close), mcap: dlNum(x.mcap),
      stage: st, rule: dlNum(x.rule), gap: dlNum(x.gap), gapPct: dlNum(x.gap_pct), gapNext: dlNum(x.gap_next) ?? dlNum(x.gap), gapNextPct: dlNum(x.gap_next_pct) ?? dlNum(x.gap_pct), below: dlNum(x.below_days), turnover: dlNum(x.turnover),
      fin, last: fin.length ? fin[fin.length - 1] : null, profitYears: dlNum(x.profit_years), pbr: dlNum(x.pbr), netCash: dlNum(x.net_cash), ppe: dlNum(x.ppe),
      holder: { name: dlStr(h.name), pct: dlNum(h.pct), fund: h.fund === true },
      flags: { mgmt: fg.mgmt === true, halted: fg.halted === true, impaired: fg.impaired === true },
      mezz: { n: dlNum(mz.n), amt: dlNum(mz.amt_3y), ratio: dlNum(mz.ratio), list: mlist },
      pass: x.pass === true, reasons: (Array.isArray(x.reasons) ? x.reasons : []).map(dlStr).filter(Boolean), score: dlNum(x.score),
    };
    o.q = [code, name, o.market, o.sector, o.biz, o.holder.name, ...mlist.flatMap((m) => m.investors)].join(' ').toLowerCase();
    return o;
  }).filter(Boolean);
  const p = raw.picks && typeof raw.picks === 'object' ? raw.picks : {};
  const picks = {
    at: dlStr(p.at), stale: p.stale === true, summary: dlStr(p.summary),
    items: dlArr(p.items).map((k) => ({ code: dlStr(k.code), name: dlStr(k.name), why: dlStr(k.why), structure: dlStr(k.structure), risk: dlStr(k.risk), next: dlStr(k.next) })).filter((k) => k.code || k.name),
  };
  const run = raw.run && typeof raw.run === 'object' ? raw.run : {};
  return {
    generated: dlStr(raw.generated), asof: dlDay(raw.asof),
    rules: { now: rule(r.now), next: rule(r.next), near: dlNum(r.near_pct), note: dlStr(r.note) },
    filters: { profit: dlNum(fl.profit_years_min), mezz: dlNum(fl.mezz_ratio_max), gap: dlNum(fl.gap_ratio_max), exclude: (Array.isArray(fl.exclude) ? fl.exclude : []).map(dlStr).filter(Boolean) },
    items, picks, byCode: new Map(items.map((x) => [x.code, x])),
    sources: dlArr(raw.sources).map((s) => ({ name: dlStr(s.name), use: dlStr(s.use) })).filter((s) => s.name),
    errors: (Array.isArray(run.errors) ? run.errors : []).map(dlStr).filter(Boolean),
  };
}

function dlLoad(force) {
  if (!force && dlS.at && Date.now() - dlS.at < DL_TTL) return Promise.resolve();
  if (!dlS.loading) {
    dlS.loading = (async () => {
      const d = await STORE.readText(DL_FILE);
      let raw = null;
      if (d.text) { try { raw = JSON.parse(d.text); } catch { throw new Error('상폐 위험 자료 형식이 올바르지 않습니다'); } }
      dlS.data = raw && typeof raw === 'object' ? dlNorm(raw) : null;
      dlS.at = Date.now();
      TAB_INFO['deals/delist'] = dlInfo(dlS.data);
    })().finally(() => { dlS.loading = null; });
  }
  return dlS.loading;
}

/* ---------- 표시 형식 ---------- */
const DL_NA = '<span class="muted">–</span>';
const dlFmt = (n, d = 1) => n.toLocaleString('ko-KR', { maximumFractionDigits: d });
const dlEok = (v) => (dlNum(v) == null ? '–' : `${dlFmt(v)}억`);
const dlPct = (v) => (dlNum(v) == null ? '–' : `${dlFmt(v)}%`);
const dlPbr = (v) => (dlNum(v) == null ? '–' : v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dlWon = (v) => (dlNum(v) == null ? '–' : `${dlFmt(v, 0)}원`);
const dlNeg = (v) => (dlNum(v) != null && v < 0 ? ' dl-neg' : '');
const dlNm = (s) => esc(s).replace(/·(?=[가-힣])/g, '$&<wbr>');
const dlFrom = (s) => (/^\d{4}-\d{2}$/.test(s) ? s : '');
// 단계 이름: 1 현행 미달 / 2 <상향 시점> 미달 / 3 여유 n%
function dlStageName(n) {
  const r = dlS.data?.rules;
  if (n === 1) return '현행 미달';
  if (n === 2) return `${dlFrom(r?.next.from) || '상향 기준'} 미달`;
  if (n === 3) return `여유 ${r?.near != null ? dlFmt(r.near) : 20}%`;
  return '';
}
const dlStages = () => [['', '전체'], ...[1, 2, 3].map((n) => [String(n), dlStageName(n)])];
function dlTime(s) {
  const g = s ? new Date(s) : null;
  if (!g || isNaN(g)) return '';
  return `${ymd(g) === today() ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())}`;
}
const dlFlags = (x) => [x.flags.mgmt && '관리종목', x.flags.halted && '거래정지', x.flags.impaired && '자본잠식'].filter(Boolean);
const dlBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const dlKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');

/* ---------- 목록 ---------- */
function dlList() {
  const d = dlS.data; if (!d) return [];
  const q = dlS.q.trim().toLowerCase(), st = Number(dlS.stage) || 0;
  const by = {
    score: (a, b) => (b.pass - a.pass) || ((b.score ?? -1) - (a.score ?? -1)),
    mcap: (a, b) => (b.mcap ?? -1) - (a.mcap ?? -1),
    gap: (a, b) => (a.gapNextPct ?? Infinity) - (b.gapNextPct ?? Infinity) || (a.gapNext ?? Infinity) - (b.gapNext ?? Infinity),
    turnover: (a, b) => (b.turnover ?? -1) - (a.turnover ?? -1),
  }[dlS.sort] || (() => 0);
  return d.items.filter((x) => (dlS.f !== 'pass' || x.pass) && (!st || x.stage === st) && (!dlS.mkt || x.market === dlS.mkt) && (!q || x.q.includes(q)))
    .sort((a, b) => by(a, b) || a.idx - b.idx);
}

const dlNextY = () => dlFrom(dlS.data?.rules.next.from).slice(0, 4) || '2027';
const DL_HEAD = '<div class="ipo-head ipo-cols"><div>단계</div><div>회사</div><div>시총</div><div>@Y 부족분</div><div class="rd-c2">영업이익</div><div class="rd-c2">PBR</div><div>메자닌</div><div class="rd-c2">거래대금</div><div>판정</div></div>';

function dlRow(x) {
  const open = dlS.open.has(x.code), f = x.last;
  const stage = x.stage ? `<span class="dl-s${x.stage}">${x.stage}단계</span>` : DL_NA;
  const gn = x.gapNext != null && x.gapNext > 0;
  const gap = gn ? `${dlEok(x.gapNext)}<div class="ipo-sub">${dlPct(x.gapNextPct)}</div>` : DL_NA;
  const op = f && f.op != null ? `<span class="${dlNeg(f.op).trim()}">${dlEok(f.op)}</span><div class="ipo-sub">${esc(f.y)}</div>` : DL_NA;
  const mz = x.mezz.ratio != null ? `${dlPct(x.mezz.ratio)}<div class="ipo-sub">${x.mezz.n ? `${dlFmt(x.mezz.n, 0)}건 · ${dlEok(x.mezz.amt)}` : '없음'}</div>` : DL_NA;
  const rs = x.reasons.join(', ');
  const verdict = x.pass ? '<span class="rd-ok">후보</span>' : rs ? `<span class="dl-rs" title="${esc(rs)}">${esc(rs)}</span>` : DL_NA;
  // 카드가 좁아 영업이익·PBR·거래대금 칸을 접으면 회사 칸 보조 줄(rd-alt), 더 좁으면(폰) 한 줄 요약(rd-mob)
  const alt = [f && f.op != null ? `영업이익 ${dlEok(f.op)}` : '', x.pbr != null ? `PBR ${dlPbr(x.pbr)}` : '', x.turnover != null ? `거래대금 ${dlEok(x.turnover)}` : ''].filter(Boolean).join(' · ');
  const mob = [`시총 ${dlEok(x.mcap)}`, gn ? `${dlNextY()} 부족 ${dlEok(x.gapNext)} · ${dlPct(x.gapNextPct)}` : '', x.mezz.ratio != null ? `메자닌 ${dlPct(x.mezz.ratio)}` : '', alt].filter(Boolean).join(' · ');
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.code)}">
    <div class="ipo-line ipo-cols">
      <div>${stage}<div class="ipo-sub">${esc(dlStageName(x.stage))}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${dlNm(x.name)}</button><div class="ipo-sub">${esc([x.market, x.sector].filter(Boolean).join(' · '))}</div>${alt ? `<div class="ipo-sub rd-alt">${alt}</div>` : ''}<div class="rd-mob">${mob}</div>${!x.pass && rs ? `<div class="rd-mob dl-rsm">탈락 · ${esc(x.reasons.join(' · '))}</div>` : ''}</div>
      <div class="rd-mh">${dlEok(x.mcap)}<div class="ipo-sub">기준 ${dlEok(x.rule)}</div></div>
      <div class="rd-mh">${gap}</div>
      <div class="rd-mh rd-c2">${op}</div>
      <div class="rd-mh rd-c2">${x.pbr != null ? dlPbr(x.pbr) : DL_NA}</div>
      <div class="rd-mh">${mz}</div>
      <div class="rd-mh rd-c2">${x.turnover != null ? dlEok(x.turnover) : DL_NA}</div>
      <div class="ipo-c-st">${verdict}<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span></div>
    </div>${open ? dlDetail(x) : ''}</div>`;
}

/* ---------- 펼친 행 ---------- */
const DL_FS = { CFS: '연결', OFS: '별도' };
function dlFinBox(x) {
  if (!x.fin.length) return dlBox('재무', '<p class="ipo-p muted">없음</p>');
  const n = (v) => (v == null ? '–' : v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const row = (k, key) => `<tr><td>${k}</td>${x.fin.map((f) => `<td class="${dlNeg(f[key]).trim()}">${n(f[key])}</td>`).join('')}</tr>`;
  const basis = [...new Set(x.fin.map((f) => DL_FS[f.fs] || f.fs).filter(Boolean))].join(' · ');
  return dlBox('재무', `<table class="ipo-tbl dl-fin"><thead><tr><th>억 원</th>${x.fin.map((f) => `<th>${esc(f.y)}</th>`).join('')}</tr></thead><tbody>
    ${row('매출액', 'rev')}${row('영업이익', 'op')}${row('당기순이익', 'ni')}${row('자산총계', 'assets')}${row('부채총계', 'liab')}${row('자본총계', 'equity')}
    </tbody></table>`, esc(basis));
}

function dlStateBox(x) {
  const h = x.holder, fl = dlFlags(x), r = dlS.data.rules;
  const ruleFrom = x.stage === 1 ? dlFrom(r.now.from) : dlFrom(r.next.from);
  const holder = h.name ? `${dlNm(h.name)}${h.pct != null ? ` ${dlPct(h.pct)}` : ''}${h.fund ? ' · <span class="dl-bad">투자조합</span>' : ''}` : '';
  const links = [
    { url: `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(x.name)}`, label: 'DART' },
    { url: `https://finance.naver.com/item/main.naver?code=${encodeURIComponent(x.code)}`, label: '네이버 금융' },
  ].map((l) => `<a class="ipo-a" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${ico('ext', 'sm')}</a>`).join('');
  const body = `${dlKv('최대주주', holder)}${dlKv('순현금', x.netCash != null ? `<span class="${dlNeg(x.netCash).trim()}">${dlEok(x.netCash)}</span>` : DL_NA)}${dlKv('유형자산', x.ppe != null ? dlEok(x.ppe) : DL_NA)}
    ${dlKv('시총', `${dlEok(x.mcap)}${x.close != null ? ` · 종가 ${dlWon(x.close)}` : ''}`)}
    ${dlKv('적용 기준', x.rule != null ? `${dlEok(x.rule)}${ruleFrom ? ` · ${ruleFrom}~` : ''}` : '')}
    ${dlKv(`${dlNextY()} 부족분`, x.gapNext != null ? (x.gapNext > 0 ? `${dlEok(x.gapNext)} · 시총의 ${dlPct(x.gapNextPct)}` : '없음') : '')}
    ${dlKv('현행 부족분', x.stage === 1 && x.gap != null ? `${dlEok(x.gap)} · 시총의 ${dlPct(x.gapPct)}` : '')}
    ${dlKv('연속 미달', x.below ? `${dlFmt(x.below, 0)}거래일` : '')}
    ${dlKv('영업흑자', x.profitYears != null ? `${x.fin.length || 3}년 중 ${dlFmt(x.profitYears, 0)}년` : '')}
    ${dlKv('PBR', x.pbr != null ? dlPbr(x.pbr) : '')}${dlKv('거래대금', x.turnover != null ? `${dlEok(x.turnover)} · 20일 평균` : '')}
    ${dlKv('관리·정지·잠식', fl.length ? `<span class="dl-bad">${fl.join(' · ')}</span>` : '없음')}
    ${dlKv('종목코드', esc(x.code))}<div class="ipo-links">${links}</div>`;
  return dlBox('지분·상태', body);
}

function dlMezzBox(x) {
  const m = x.mezz;
  const sub = m.n != null || m.amt != null ? `최근 3년 ${dlFmt(m.n || 0, 0)}건 · ${dlEok(m.amt)} · 시총의 ${dlPct(m.ratio)}` : '';
  if (!m.list.length) return dlBox('메자닌·유증 이력', '<p class="ipo-p muted">없음</p>', esc(sub));
  return dlBox('메자닌·유증 이력', `<table class="ipo-tbl dl-mz"><thead><tr><th>날짜</th><th>종류</th><th>금액</th><th>전환가</th><th>리픽싱 하한</th><th>투자자</th></tr></thead><tbody>${m.list.map((e) => `<tr>
    <td>${e.dt ? yymd(e.dt) : '–'}</td><td>${esc(e.type) || '–'}</td><td>${dlEok(e.amount)}</td><td data-k="전환가">${dlWon(e.conv)}</td><td data-k="리픽싱 하한">${dlWon(e.refix)}</td><td>${e.investors.map(dlNm).join(', ') || '–'}</td></tr>`).join('')}</tbody></table>`, esc(sub));
}

const dlPickOf = (code) => dlS.data?.picks.items.find((k) => k.code === code);
function dlPickKv(k) {
  return `${dlKv('왜 보나', esc(k.why))}${dlKv('구조', esc(k.structure))}${dlKv('위험', esc(k.risk))}${dlKv('다음 할 일', esc(k.next))}`;
}

// '파이프라인에 있음' 링크의 data-pp-ref = 파이프라인 화면이 그 딜을 펼쳐 보여 줄 때 쓰는 ref
function dlPipe(x) {
  if (typeof pipeAdd !== 'function') return '';
  const ref = `delist:${x.code}`;
  let has = false;
  try { has = typeof pipeHas === 'function' && !!pipeHas(ref); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(ref)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-dl-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}

function dlDetail(x) {
  const pk = dlPickOf(x.code);
  return `<div class="ipo-detail"><div class="ipo-dhead">${x.biz ? `<p class="ipo-sum1">${esc(x.biz)}</p>` : '<p></p>'}${dlPipe(x)}</div>
    <div class="ipo-pane"><div class="ipo-stack">
      ${pk ? dlBox('오늘의 후보', dlPickKv(pk)) : ''}
      <div class="ipo-two-col">${dlFinBox(x)}${dlStateBox(x)}</div>
      ${dlMezzBox(x)}
    </div></div>
  </div>`;
}

/* ---------- 오늘의 후보 ---------- */
function dlPicks() {
  const d = dlS.data, p = d?.picks;
  if (!p || !p.items.length) return '';
  const t = dlTime(p.at);
  const card = (k) => {
    const x = d.byCode.get(k.code);
    const meta = x ? [x.market, `시총 ${dlEok(x.mcap)}`, x.stage ? `${x.stage}단계` : ''].filter(Boolean).join(' · ') : '';
    return `<div class="dl-pk${x ? '' : ' off'}" ${x ? `role="button" tabindex="0" data-dl-go="${esc(k.code)}"` : ''}>
      <div class="dl-pk-h"><b>${dlNm(k.name || x?.name || k.code)}</b>${x ? `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>` : ''}</div>
      ${meta ? `<div class="dl-pk-m">${esc(meta)}</div>` : ''}
      <div class="dl-pk-kv">${dlPickKv(k)}</div></div>`;
  };
  return `<section class="card dl-picks"><div class="card-head"><h2>오늘의 후보 <span class="n">${p.items.length}</span></h2>
      ${t ? `<span class="meta dl-pk-at${p.stale ? ' ipo-stale' : ''}"${p.stale ? ' title="오늘 선정이 실패해 직전 선정을 보여 줍니다"' : ''}>${t} 선정</span>` : ''}</div>
    ${p.summary ? `<p class="dl-pk-sum">${esc(p.summary)}</p>` : ''}
    <div class="dl-pk-grid">${p.items.map(card).join('')}</div></section>`;
}

/* ---------- 요약 줄·필터 ---------- */
function dlSummary() {
  const d = dlS.data; if (!d) return '';
  const g = dlTime(d.generated), gd = d.generated ? new Date(d.generated) : null;
  const n = (f) => d.items.filter(f).length;
  return `${g ? `<span class="${gd && Date.now() - gd > 36 * 3600000 ? 'ipo-stale' : ''}">${g} 수집</span>` : ''}${d.asof ? `<span>기준일 ${yymd(d.asof)}</span>` : ''}<span>${d.items.length}곳</span>`
    + [1, 2, 3].map((s) => `<span>${s}단계 <b>${n((x) => x.stage === s)}</b></span>`).join('') + `<span>후보 <b>${n((x) => x.pass)}</b></span>`
    + (d.errors.length ? `<span class="ipo-stale" title="${esc(d.errors.join('\n'))}">수집 오류 ${d.errors.length}</span>` : '');
}

const dlSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([k, l]) => `<button type="button" data-${attr}="${esc(k)}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('')}</div>`;
function dlFilterHtml() {
  return `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="dl-q" type="search" placeholder="회사·업종·최대주주·투자자 검색" value="${esc(dlS.q)}" autocomplete="off" aria-label="검색"></div>
      ${dlSeg('dl-f', DL_F, dlS.f)}
      <select class="select" id="dl-sort" aria-label="정렬">${DL_SORT.map(([k, l]) => `<option value="${k}"${dlS.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="ipo-filter rd-finf"><div class="rd-fing"><span class="rd-finl">단계</span>${dlSeg('dl-st', dlStages(), dlS.stage)}</div>
      <div class="rd-fing"><span class="rd-finl">시장</span>${dlSeg('dl-mk', DL_MKTS, dlS.mkt)}</div></div>`;
}

/* ---------- 그리기 ---------- */
function dlBody() {
  if (!dlS.data) return '<div class="empty">아직 수집된 상폐 위험 자료가 없습니다.</div>';
  const list = dlList();
  if (!list.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  return DL_HEAD.replace('@Y', dlNextY()) + list.map(dlRow).join('');
}
const dlRowEl = (root, id) => [...root.querySelectorAll('.ipo-row[data-id]')].find((r) => r.dataset.id === id);

// 펼친 행을 보여 줄 때: 보이는 높이(스크롤 칸 − 폰 아래 탭 막대)에 다 들어가면 가운데, 길면 머리 줄이 맨 위(8 띄움) — radar.js rdReveal과 같은 방식
function dlReveal(r) {
  const sc = r.closest('.scroll');
  if (!sc) { r.scrollIntoView({ block: 'start' }); return; }
  const tb = document.querySelector('.tabbar'), vis = sc.clientHeight - (tb ? tb.offsetHeight : 0), h = r.offsetHeight;
  const top = r.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  sc.scrollTop = h <= vis ? top - (vis - h) / 2 : top - 8;
}

function dlDraw() {
  const host = dlS.host; if (!host || !host.isConnected) return;
  const b = host.querySelector('#dl-body'); if (!b) return;
  const sum = host.querySelector('#dl-sum'); if (sum) sum.innerHTML = dlSummary();
  const pk = host.querySelector('#dl-picks'); if (pk) pk.innerHTML = dlPicks();
  // 단계 이름은 자료의 기준(상향 시점·여유 %)으로 정해지므로 읽은 뒤 다시 쓴다
  host.querySelectorAll('[data-dl-st]').forEach((bt) => { bt.textContent = dlStages().find(([k]) => k === bt.dataset.dlSt)?.[1] || bt.textContent; });
  b.innerHTML = dlBody();
  dlViewSave();
  if (dlS.focus != null) {
    const r = dlRowEl(b, dlS.focus);
    dlS.focus = null;
    if (r) dlReveal(r);
  }
}

function dlRefreshRow(id) {
  const x = dlS.data?.byCode.get(id), b = dlS.host?.querySelector('#dl-body'), r = b && dlRowEl(b, id);
  if (x && r) r.outerHTML = dlRow(x);
}

// 펼친 행의 파이프라인 버튼만 다시 그린다. id가 없으면 펼친 행 전부
function dlPipeDraw(id) {
  if (!dlS.host || !dlS.host.isConnected) return;
  dlS.host.querySelectorAll('#dl-body .ipo-row.open[data-id]').forEach((r) => {
    if (id != null && r.dataset.id !== id) return;
    const x = dlS.data?.byCode.get(r.dataset.id), p = r.querySelector('.ipo-dhead > .rd-pipe');
    if (!x || !p) return;
    const t = document.createElement('template'); t.innerHTML = dlPipe(x).trim();
    const n = t.content.firstElementChild;
    if (n && !n.isEqualNode(p)) p.replaceWith(n);
  });
}

async function dlPipeAdd(btn) {
  const x = dlS.data?.byCode.get(btn.closest('.ipo-row')?.dataset.id);
  if (!x || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  try { await pipeAdd({ src: DL_PIPE_SRC, ref: `delist:${x.code}`, name: x.name }); }
  catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  dlPipeDraw(x.code);
}

// 오늘의 후보 카드 → 목록에서 그 회사를 펼쳐 보여 준다(검색·필터에 걸려 빠져 있으면 그 조건만 푼다)
function dlGo(code) {
  const x = dlS.data?.byCode.get(code); if (!x) return;
  if (dlS.f === 'pass' && !x.pass) dlS.f = 'all';
  if (dlS.stage && Number(dlS.stage) !== x.stage) dlS.stage = '';
  if (dlS.mkt && dlS.mkt !== x.market) dlS.mkt = '';
  if (dlS.q && !x.q.includes(dlS.q.trim().toLowerCase())) dlS.q = '';
  const f = dlS.host.querySelector('#dl-filter'); if (f) f.innerHTML = dlFilterHtml();
  dlS.open.add(code); dlS.focus = code;
  dlDraw();
}

function dlBind(root) {
  const seg = (attr, key, bt) => { dlS[key] = bt.dataset[attr]; root.querySelectorAll(`[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`).forEach((b) => { const on = b === bt; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); dlDraw(); };
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const fb = t.closest('[data-dl-f]'); if (fb) { seg('dlF', 'f', fb); return; }
    const sb = t.closest('[data-dl-st]'); if (sb) { seg('dlSt', 'stage', sb); return; }
    const mb = t.closest('[data-dl-mk]'); if (mb) { seg('dlMk', 'mkt', mb); return; }
    if (t.closest('#dl-ref')) {
      dlLoad(true).then(dlDraw).catch((e) => toast(e.message));
      if (typeof pipeLoad === 'function') pipeLoad(true).then(() => dlPipeDraw()).catch(() => {}); // 다른 분이 그사이 올린 딜도 '있음'으로
      return;
    }
    const pb = t.closest('[data-dl-pipe]'); if (pb) { dlPipeAdd(pb); return; }
    const go = t.closest('[data-dl-go]'); if (go) { dlGo(go.dataset.dlGo); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]');
    if (row) {
      const id = row.dataset.id;
      if (dlS.open.has(id)) dlS.open.delete(id); else dlS.open.add(id);
      dlViewSave();
      dlRefreshRow(id);
    }
  });
  root.addEventListener('keydown', (ev) => {
    const go = ev.target.closest?.('[data-dl-go]');
    if (go && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); dlGo(go.dataset.dlGo); }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'dl-q') { dlS.q = ev.target.value; dlDraw(); } });
  root.addEventListener('change', (ev) => { if (ev.target.id === 'dl-sort') { dlS.sort = ev.target.value; dlDraw(); } });
}

async function renderDelist(host) {
  dlS.host = host;
  host.innerHTML = `<div class="ipo-page rd-page dl-page" id="dl-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="dl-sum"></div>
      ${infoBtn('deals/delist')}
      <button class="btn ghost" type="button" id="dl-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <div id="dl-picks"></div>
    <section class="card ipo-card">
      <div id="dl-filter">${dlFilterHtml()}</div>
      <div class="ipo-body" id="dl-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  dlBind(host.querySelector('#dl-root'));
  try { await dlLoad(); }
  catch (e) {
    const b = dlS.host === host && host.querySelector('#dl-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (dlS.host === host && host.isConnected) dlDraw();
  // '파이프라인에 있음' 표시가 처음부터 맞게 미리 읽고, 다 읽으면 펼친 행의 버튼만 다시 그림
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (dlS.host === host) dlPipeDraw(); }).catch(() => {});
}

/* 다른 화면(파이프라인 등)에서 ref('delist:<종목코드>')로 한 회사를 펼쳐 보여 줄 때: 탭 열기 전에 부르고 돌려준 주소로 이동 */
function delistFocus(ref) {
  const m = /^delist:(.+)$/.exec(String(ref || ''));
  if (!m) return '';
  dlS.q = ''; dlS.f = 'all'; dlS.stage = ''; dlS.mkt = '';
  dlS.open.add(m[1]); dlS.focus = m[1];
  dlViewSave();
  return '#deals/delist';
}

/* ---------- 화면 설명(ⓘ) — 판단 근거는 딜레이더 판단·데이터 노트 6절 '필터 초안 점검'. 거르는 기준 값은 delist.json filters에서 읽는다 ---------- */
function dlInfo(d) {
  const r = d?.rules, f = d?.filters;
  const amt = (o) => (o && o['코스피'] != null && o['코스닥'] != null ? `코스피 ${dlFmt(o['코스피'])}억·코스닥 ${dlFmt(o['코스닥'])}억` : '');
  const now = amt(r?.now), next = amt(r?.next), nf = dlFrom(r?.now.from) || '2026-07', xf = dlFrom(r?.next.from) || '2027-07', near = r?.near != null ? dlFmt(r.near) : '20';
  const v = (x, unit) => (x != null ? `${dlFmt(x)}${unit}` : '–');
  const src = d?.sources.length ? ` · 출처 ${d.sources.map((s) => s.name).join(', ')}` : '';
  return {
    title: '상폐 위험·CB',
    asof: `${d?.asof ? `기준일 ${d.asof}` : '기준일 –'}${src} · 판단 근거는 딜레이더 판단·데이터 노트 6절`,
    rows: [
      ['무엇인가', [
        `상장폐지 시가총액 요건에 걸렸거나 곧 걸릴 수 있는 코스피·코스닥 회사 목록입니다. 시총 기준은 ${nf}부터 ${now || '코스피 300억·코스닥 200억'}, ${xf}부터 ${next || '코스피 500억·코스닥 300억'}입니다.`,
        { table: [
          ['단계', '뜻'],
          ['1단계 현행 미달', `지금 기준(${now || '–'})보다 시총이 작음`],
          [`2단계 ${xf} 미달`, `지금 기준은 넘지만 ${xf} 기준(${next || '–'})보다 작음`],
          [`3단계 여유 ${near}%`, `${xf} 기준은 넘지만 그 ${100 + Number(near)}% 안`],
        ] },
        '보통주만 봅니다. 스팩·리츠·우선주·ETF·ETN은 뺍니다.',
        `일정은 확정이 아닙니다${r?.note ? `(${r.note})` : ''}.`,
      ]],
      ['왜 보나', [
        '시총 요건을 못 맞추면 상장폐지 사유가 됩니다. 회사는 시총을 올릴 자금이 급하고, 우리는 그 자금을 대는 쪽으로 들어갈 수 있습니다.',
        'CB만으로는 시총 요건을 제때 못 채웁니다. 시총은 상장 주식 수 기준이라 CB는 전환돼야 반영되는데, 사모 CB는 발행 후 1년 안에 전환청구를 못 합니다(증권의 발행 및 공시 등에 관한 규정 제5-21조). 지금 발행해도 상향 판정 전에 전환이 안 됩니다.',
        '시총을 바로 올리는 것은 제3자배정 유상증자입니다(투자자 주식은 1년 전매제한). 그래서 제안할 구조는 CB 단독이 아니라 유상증자 + CB, 또는 유증 여력을 보여 주는 CB입니다.',
        '상폐되면 CB는 조기상환으로 가고 회수는 회사의 현금·자산에 달립니다. PBR이 낮은 것만으로는 회수 근거가 못 돼 순현금(현금성자산·단기금융상품 − 차입금·사채)을 따로 봅니다.',
      ]],
      ['어떻게 보나', [
        '아래 기준을 모두 통과한 회사가 후보입니다. 걸린 기준은 목록 끝 판정 칸에 나옵니다.',
        { table: [
          ['기준', '값'],
          ['영업흑자', `최근 3개 사업연도 중 ${v(f?.profit, '년')} 이상`],
          ['미전환 메자닌', `최근 3년 CB·BW·EB·제3자배정 유증 발행액이 시총의 ${v(f?.mezz, '%')} 이하`],
          [`${xf} 부족분`, `${xf} 기준까지 모자란 시총이 지금 시총의 ${v(f?.gap, '%')} 이하`],
          ['제외', f?.exclude.length ? f.exclude.join(', ') : '–'],
        ] },
        `부족분은 ${xf} 기준 − 현재 시총입니다. 지금 기준을 맞춰도 ${xf}에 다시 걸리므로 모든 단계를 ${xf} 기준으로 잽니다. 시총 250억 코스피사가 500억을 맞추려면 250억을 새로 넣어야 해 현실성이 없어, 부족분이 시총의 ${v(f?.gap, '%')} 이하인 곳만 PE로 풀 수 있는 곳으로 봅니다. 1단계는 펼친 행에 현행 기준 부족분도 함께 나옵니다.`,
        '투자조합이 최대주주인 상장사는 메자닌 투자를 하지 않기로 해 뺍니다.',
        '오늘의 후보는 후보 중 점수 상위 10곳을 Claude가 다시 읽고 5곳 안팎을 고른 것입니다. 왜 보나·제안할 구조·가장 큰 위험·다음 할 일이 붙습니다. 선정이 실패한 날은 직전 결과를 두고 선정 시각을 빨간색으로 표시합니다. 카드를 누르면 목록에서 그 회사가 펼쳐집니다.',
        `필터: 후보만·전체, 단계, 시장. 정렬: 점수순, 시총순, 부족분순(${xf} 기준, 작은 순), 거래대금순. 행을 펼치면 3개년 재무, 최대주주 지분, 순현금, 유형자산(유형자산+투자부동산), 관리종목·거래정지·자본잠식 여부, 메자닌·유증 이력(전환가·리픽싱 하한·투자자), DART·네이버 금융 링크가 나옵니다.`,
        '자료는 매일 09:30에 새로 받습니다. 순현금·유형자산은 후보만 채웁니다.',
      ]],
      ['그래서 할 일', [
        '매일: 오늘의 후보를 보고, 펼쳐서 재무·순현금·메자닌 이력을 확인합니다.',
        '볼 회사는 파이프라인에 올립니다. 연락 상태·메모는 파이프라인에서 관리합니다.',
        '컨택할 때는 유상증자 + CB로 시총 기준을 언제까지 맞출 수 있는지부터 확인합니다.',
        '확인할 것: CB 컨택 기준(시총 500억 이상·흑자·미전환 메자닌 시총 20% 이하)과 달리 이 목록은 정의상 시총 500억 아래입니다. 이 탭을 그 기준의 예외로 둘지, 일평균 거래대금 기준 금액을 얼마로 할지는 대표님 확인이 필요합니다.',
      ]],
    ],
  };
}
TAB_INFO['deals/delist'] = dlInfo(null);
