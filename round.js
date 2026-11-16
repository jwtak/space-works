/* UNIVERSE WORKS — 딜소싱 › 상장 › 투자 라운드(#deals/round) (2026-11-16 사용자: "상장 준비 전에 시리즈 B, 시리즈 C도 있으면 좋을 듯")
   상장 흐름 '투자 라운드 → 상장 준비 → 신규상장'의 첫 탭. 비상장 회사 중 시리즈 B, 시리즈 C~Pre-IPO까지 온 곳을 두 묶음으로 본다.
   자료는 tgt.js(소비재·딥테크)가 읽는 data/deeptech.json·consumer.json을 그대로 쓴다(tgLoad·tgS·정규화 결과). tgt.js는 고치지 않고 함수만 부른다.
   단계: 딥테크는 stage(tgStageN), 소비재는 rounds 중 가장 높은 단계. 2 = 시리즈 B, 3 이상(C·D…·프리IPO 9) = 시리즈 C~Pre-IPO. 상장사·공모 이력이 있는 곳은 뺀다.
   컨택 상태는 tgt.js와 같은 radar_marks.json(키 cons:…·deep:…)을 칩으로 보여만 주고, 바꾸는 건 원래 화면(딥테크·소비재에서 보기 → tgtFocus).
   펼친 칸 머리에는 fsq.js fqHead(같은 키라 팩트시트·관심 기업·파이프라인이 같은 회사로 본다), 아래는 tgt.js 상자(투자 라운드·주요 손익)를 다시 쓴다.
   진입: renderRound(host) — host 안에만 그린다. 목록·펼친 행은 ipo.css, 좁은 폭 배치·묶음 제목은 radar.css(.rd-page·.rd-grp), 여기 것만 round.css. */

const RN_F = [['', '전체'], ['b', '시리즈 B'], ['c', '시리즈 C~Pre-IPO']];
const RN_K = [['', '전체'], ['deep', '딥테크'], ['cons', '소비재']];
const RN_SORT = [['round', '최근 라운드순'], ['inv', '누적 투자순']];
const RN_GRP = { b: '시리즈 B', c: '시리즈 C~Pre-IPO' };

const rnS = (() => {
  const v = viewGet('rn', null) || {}, s = { q: '', f: '', k: '', sort: 'round', open: new Set(), host: null, err: '' };
  if (typeof v.q === 'string') s.q = v.q;
  if (RN_F.some(([x]) => x === v.f)) s.f = v.f;
  if (RN_K.some(([x]) => x === v.k)) s.k = v.k;
  if (RN_SORT.some(([x]) => x === v.sort)) s.sort = v.sort;
  if (Array.isArray(v.open)) s.open = new Set(v.open.filter((x) => typeof x === 'string'));
  return s;
})();
const rnSave = () => viewSet('rn', { q: rnS.q, f: rnS.f, k: rnS.k, sort: rnS.sort, open: [...rnS.open] });

/* ---------- 자료: 두 화면 자료에서 시리즈 B 이상 비상장만 ---------- */
// 최근 라운드: 딥테크는 last_round, 없으면(소비재) rounds 중 시기가 가장 늦은 것. 시기는 YYYY·YYYY-MM이 섞여 글자 비교로 충분
function rnLast(x) {
  if (x.round) return x.round;
  const r = [...x.rounds].filter((y) => y.date).sort((a, b) => b.date.localeCompare(a.date))[0] || x.rounds[x.rounds.length - 1];
  return r ? { date: r.date, round: r.round, amount: r.amount, investors: r.investors } : null;
}
function rnStage(k, x) {
  if (k === 'deep' && x.stageN != null) return x.stageN;
  const ns = x.rounds.map((r) => tgStageN(r.round)).filter((n) => n != null);
  return ns.length ? Math.max(...ns) : null;
}
function rnItems() {
  const out = [];
  ['deep', 'cons'].forEach((k) => {
    (tgS[k].data?.items || []).forEach((x) => {
      if (x.listed && x.listed !== '비상장') return;
      if (x.rounds.some((r) => /공모/.test(r.round))) return;
      const n = rnStage(k, x);
      if (n == null || n < 2) return;
      out.push({ k, x, n, g: n >= 3 ? 'c' : 'b', last: rnLast(x) });
    });
  });
  return out;
}
function rnRows(all) {
  const q = rnS.q.trim().toLowerCase(), lo = (v) => (v == null ? -Infinity : v);
  const dt = (a, b) => (b.last?.date || '').localeCompare(a.last?.date || '');
  const by = rnS.sort === 'inv' ? (a, b) => lo(b.x.inv) - lo(a.x.inv) || dt(a, b) : (a, b) => dt(a, b) || lo(b.x.inv) - lo(a.x.inv);
  return all.filter((e) => (!rnS.f || e.g === rnS.f) && (!rnS.k || e.k === rnS.k) && (!q || e.x.q.includes(q))).sort((a, b) => by(a, b) || a.x.name.localeCompare(b.x.name, 'ko'));
}

/* ---------- 목록 ---------- */
// 시리즈 B 묶음에서 '시리즈B' 라운드 이름은 묶음 제목과 같아 빼고, C~Pre-IPO 묶음은 C·D·프리IPO가 섞이니 남긴다
const rnLbl = (e) => (e.last?.round && !(e.g === 'b' && tgStageN(e.last.round) === 2) ? e.last.round : '');
const rnDate = (d) => (d ? tgYmd(d) || d : '');
const RN_HEAD = '<div class="ipo-head ipo-cols"><div>시기</div><div>회사</div><div>최근 라운드</div><div>누적 투자</div><div class="rd-h-st">컨택 상태</div></div>';

function rnRow(e) {
  const x = e.x, r = e.last, open = rnS.open.has(x.id), lbl = rnLbl(e);
  const main = r?.amount ? esc(r.amount) : lbl ? esc(lbl) : TG_NA;
  const sub = r?.amount && lbl ? esc(lbl) : '';
  const p1 = [rnDate(r?.date), lbl, r?.amount].filter(Boolean).join(' ');
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div class="rd-mh">${r?.date ? esc(rnDate(r.date)) : TG_NA}</div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${tgNm(x.name)}</button><div class="rn-pair"><span class="rn-p1">${p1 ? esc(p1) : '–'}</span><span><span class="rd-lb">누적</span> ${esc(tgEok(x.inv))}</span></div></div>
      <div class="rd-mh">${main}${sub ? `<div class="ipo-sub">${sub}</div>` : ''}</div>
      <div class="rd-mh">${x.inv != null ? tgEok(x.inv) : TG_NA}</div>
      <div class="ipo-c-st">${tgChip(tgSt(x.id))}${tgChev()}</div>
    </div>${open ? rnDetail(e) : ''}</div>`;
}

/* ---------- 펼친 행 ---------- */
function rnDetail(e) {
  const x = e.x, k = e.k, deep = k === 'deep', f = x.founder, r = e.last, title = TG_CFG[k].title;
  const invs = x.investors.length ? x.investors : [...new Set(x.rounds.flatMap((y) => y.investors.split(/,\s*/)).map((s) => s.trim()).filter(Boolean))];
  const inv = `${tgKv('단계', x.stage ? tgStage(x) : '')}${tgKv('누적 투자', x.inv != null ? tgEok(x.inv) : '')}${tgKv('최근 라운드', r ? esc(tgRoundTxt(r)) : '')}${tgKv('라운드 투자자', esc(r?.investors))}
    ${tgKv('투자사', invs.length ? invs.map(tgNm).join(', ') : '')}${tgKv('기업가치', esc(x.valuation))}`;
  const est = x.est ? `${esc(x.est)}${x.years != null ? `, 업력 ${x.years}년` : ''}` : x.years != null ? `업력 ${x.years}년` : '';
  const links = [x.home ? tgA(x.home, '홈페이지') : '', tgA(`https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(x.name)}`, 'DART 검색')].join('');
  const co = `${tgKv('분야', esc([title, x.tags.join(', ')].filter(Boolean).join(', ')))}${tgKv(deep ? '기술' : '브랜드', esc(deep ? x.tech : x.brand))}${tgKv('대표', x.ceo ? tgNm(x.ceo) : '')}
    ${tgKv('창업자', f && tgAge(f) ? `${tgAge(f)}${x.young === true ? ' <span class="tgt-yg">젊은 창업자</span>' : ''}` : '')}${tgKv('설립', est)}${tgKv('지역', esc(x.region))}<div class="ipo-links">${links}</div>`;
  const rounds = tgRoundsBox(x).replace('ipo-tbl tgt-rounds', 'ipo-tbl tgt-rounds rd-tbl-r');
  return `<div class="ipo-detail">
    <div class="ipo-dhead">${x.why ? `<p class="ipo-sum1">${esc(x.why)}</p>` : '<p></p>'}
      <div class="ipo-acts">${typeof fqHead === 'function' ? fqHead(x.id, x) : ''}</div>
      <a class="ipo-a rd-pipe rn-go" href="#deals/${k}" data-rn-go="${esc(x.id)}">${esc(title)}에서 보기${ico('right', 'sm')}</a>
    </div>
    <div class="ipo-pane"><div class="ipo-stack">${typeof fqBox === 'function' ? fqBox(x.id, x, title) : ''}${rounds}
      <div class="ipo-two-col">
        <div class="ipo-stack">${tgBox('투자', inv.trim() || TG_NONE)}${tgFinBox(x)}</div>
        <div class="ipo-stack">${tgBox('회사 정보', co)}</div>
      </div>
    </div></div>
  </div>`;
}

/* ---------- 요약 줄·필터 ---------- */
function rnAsof() {
  const a = ['deep', 'cons'].map((k) => tgS[k].data?.asof).filter(Boolean).sort();
  return a[0] || '';
}
function rnSummary(all) {
  if (!tgS.deep.data && !tgS.cons.data) return '';
  const asof = rnAsof(), old = asof && (Date.parse(today()) - Date.parse(asof)) / 86400000 > TG_CFG.deep.stale;
  return [
    asof ? `<span class="${old ? 'ipo-stale' : ''}">기준일 ${esc(yymd(asof))}</span>` : '',
    `<span><b>${all.length}</b>곳</span>`,
    `<span>컨택 <b>${all.filter((e) => tgSt(e.x.id) !== '미접촉').length}</b></span>`,
  ].join('');
}
function rnFilterHtml(all) {
  const s = rnS, cnt = { '': all.length, b: all.filter((e) => e.g === 'b').length, c: all.filter((e) => e.g === 'c').length };
  const seg = (attr, opts, cur, fc) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${v}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}${fc ? `<span class="rn-fc">${fc[v]}</span>` : ''}</button>`).join('')}</div>`;
  return `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="rn-q" type="search" placeholder="회사, 기술, 투자사로 검색" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>
    ${seg('rn-f', RN_F, s.f, all.length ? cnt : null)}
    <select class="select" id="rn-sort" aria-label="정렬">${RN_SORT.map(([v, l]) => `<option value="${v}"${s.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="ipo-filter rd-finf"><div class="rd-fing"><span class="rd-finl">분야</span>${seg('rn-k', RN_K, s.k)}</div></div>`;
}

/* ---------- 그리기 ---------- */
function rnBody(all) {
  if (rnS.err) return `<div class="empty">${esc(rnS.err)}</div>`;
  if (!tgS.deep.data && !tgS.cons.data) return '<div class="empty">투자 라운드 목록을 준비하고 있습니다. 자료가 올라오면 여기에 보입니다.</div>';
  const list = rnRows(all);
  if (!list.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  return RN_HEAD + ['b', 'c'].map((g) => {
    const a = list.filter((e) => e.g === g);
    return a.length ? `<div class="rd-grp"><b>${RN_GRP[g]}</b><span>${a.length}곳</span></div>${a.map(rnRow).join('')}` : '';
  }).join('');
}

function rnDraw(full) {
  const h = rnS.host; if (!h || !h.isConnected) return;
  const all = rnItems();
  if (full) h.querySelector('#rn-filter').innerHTML = rnFilterHtml(all); // 칩 옆 개수는 자료를 읽을 때만 바뀐다(검색과 무관한 묶음 크기)
  h.querySelector('#rn-sum').innerHTML = rnSummary(all);
  h.querySelector('#rn-body').innerHTML = rnBody(all);
  rnSave();
}

function rnToggle(row) {
  const id = row.dataset.id, was = rnS.open.has(id);
  if (was) rnS.open.delete(id); else rnS.open.add(id);
  rnSave();
  const e = rnItems().find((y) => y.x.id === id);
  if (!e) { row.remove(); return; }
  const t = document.createElement('template'); t.innerHTML = rnRow(e).trim();
  const n = t.content.firstElementChild;
  row.replaceWith(n);
  if (!was) {
    const sc = n.closest('.scroll'), top = n.getBoundingClientRect().top;
    if (sc && top < sc.getBoundingClientRect().top) n.scrollIntoView({ block: 'start' });
  }
}

function rnBind(root) {
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const fb = t.closest('[data-rn-f]'); if (fb) { rnS.f = fb.dataset.rnF; segOn('[data-rn-f]', fb); rnDraw(); return; }
    const kb = t.closest('[data-rn-k]'); if (kb) { rnS.k = kb.dataset.rnK; segOn('[data-rn-k]', kb); rnDraw(); return; }
    const go = t.closest('[data-rn-go]');
    if (go) { ev.preventDefault(); const to = typeof tgtFocus === 'function' ? tgtFocus(go.dataset.rnGo) : ''; location.hash = to || go.getAttribute('href'); return; }
    if (t.closest('#rn-ref')) { rnLoad(true); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]'); if (row) rnToggle(row);
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'rn-q') { rnS.q = ev.target.value; rnDraw(); } });
  root.addEventListener('change', (ev) => { if (ev.target.id === 'rn-sort') { rnS.sort = ev.target.value; rnDraw(); } });
}

async function rnLoad(force) {
  const host = rnS.host;
  const r = await Promise.allSettled([tgLoad('deep', force), tgLoad('cons', force)]);
  if (rnS.host !== host || !host.isConnected) return;
  const bad = r.find((y) => y.status === 'rejected');
  rnS.err = bad && !tgS.deep.data && !tgS.cons.data ? (bad.reason?.message || '자료를 불러오지 못했습니다') : '';
  if (bad && !rnS.err) toast(bad.reason?.message || '자료 일부를 불러오지 못했습니다');
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
      <div id="rn-filter">${rnFilterHtml([])}</div>
      <div class="ipo-body" id="rn-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  rnBind(host.querySelector('#rn-root'));
  await rnLoad(false);
}

/* ---------- 화면 설명(ⓘ) ---------- */
function rnInfo() {
  const asof = rnAsof();
  return {
    title: '투자 라운드',
    asof: asof ? `기준일 ${asof}` : '기준일 –',
    rows: [
      ['무엇인가', ['시리즈 B, 시리즈 C에서 Pre-IPO까지 투자를 받은 비상장 회사 목록입니다. 딥테크와 소비재 목록에서 모았고 상장한 곳은 뺐습니다.']],
      ['왜 보나', ['상장 준비에 들어가기 전 단계의 회사를 미리 찾아 다음 라운드나 구주 투자 기회를 보기 위한 목록입니다.']],
      ['어떻게 보나', [
        '시리즈 B와 시리즈 C~Pre-IPO 두 묶음으로 나눠 최근 라운드가 늦은 순으로 보입니다. 누적 투자순으로도 바꿀 수 있습니다.',
        '행을 펼치면 투자 라운드 이력, 투자사, 회사 정보, 주요 손익이 나옵니다.',
        '컨택 상태는 딥테크, 소비재 화면과 같이 씁니다. 상태와 메모는 펼친 칸의 딥테크에서 보기, 소비재에서 보기로 가서 바꿉니다.',
      ]],
      ['그래서 할 일', ['볼 곳은 팩트시트를 요청하고, 원래 화면에서 컨택 상태를 남긴 뒤 파이프라인에 올립니다.']],
    ],
  };
}
TAB_INFO['deals/round'] = rnInfo();
