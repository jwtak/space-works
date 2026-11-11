/* UNIVERSE WORKS — 딜소싱 › 매물장터 (#deals/kmx): 한국M&A거래소 매경 매물장터 글에서 뽑은 익명 회사(A사·D사 등) 참고용 목록
   딜레이더 kmx.py가 주 1회 새 글만 받아 회사 OneDrive SPACE WORKS/data/kmx.json 을 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT_kmx.md).
   참고용이라 컨택 상태·메모·파이프라인은 없다. 매도 = 팔려는 회사, 매수 = 사업회사가 인수 대상을 찾는 글.
   진입: renderKmx(host) — host 안에만 그린다.
   app.js 전역($, esc, ico, yymd, toast, viewGet, viewSet, TAB_INFO, infoBtn)과 graph.js 의 STORE,
   ipo.css(목록·펼친 행)·radar.css(.rd-grp 날짜 묶음 줄·.rd-clamp)·pe.css(.pe-grp·.pe-gn 묶음 전환) 클래스를 쓴다. */

const KMX_FILE = 'data/kmx.json';
const KMX_TTL = 5 * 60000;
const KMX_SIDES = ['매도', '매수'];
const KMX_STALE = 8; // 주 1회 확인이므로 마지막 확인이 8일 넘게 지나면 빨간 글씨

const kmxS = {
  data: null, at: 0, loading: null, host: null, byId: new Map(), open: new Set(),
  side: viewGet('kmx.side', '매도') === '매수' ? '매수' : '매도',
  q: (() => { const v = viewGet('kmx.q', ''); return typeof v === 'string' ? v : ''; })(),
};

/* ---------- 데이터 ---------- */
const kmxStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const kmxDay = (v) => { const s = kmxStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const kmxHttp = (v) => { const s = kmxStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };

function kmxNorm(raw) {
  const seen = new Set();
  const items = (Array.isArray(raw.items) ? raw.items : []).map((x, i) => {
    if (!x || typeof x !== 'object') return null;
    const side = kmxStr(x.side), no = kmxStr(x.no);
    if (!KMX_SIDES.includes(side)) return null;
    const id = kmxStr(x.id) || `${no || 'kmx'}-${i}`;
    if (seen.has(id)) return null;
    seen.add(id);
    const o = {
      id, side, no, date: kmxDay(x.date), url: kmxHttp(x.url), name: kmxStr(x.name), corp: kmxStr(x.corp), industry: kmxStr(x.industry),
      size: kmxStr(x.size), price: kmxStr(x.price), want: kmxStr(x.want), point: kmxStr(x.point), text: kmxStr(x.text),
    };
    o.q = [o.industry, o.want, o.corp, o.point, o.text].join(' ').toLowerCase();
    return o;
  }).filter(Boolean);
  // 발행일 최신순, 같은 날이면 관리번호 큰 것 먼저, 같은 글 안에서는 이름순
  items.sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no) || a.name.localeCompare(b.name, 'ko'));
  const s = raw.sources && typeof raw.sources === 'object' && !Array.isArray(raw.sources) ? raw.sources : {};
  return { generated: kmxStr(raw.generated), checked: kmxDay(raw.checked), source: kmxStr(raw.source), sources: s, items };
}

function kmxLoad(force) {
  if (!force && kmxS.at && Date.now() - kmxS.at < KMX_TTL) return Promise.resolve();
  if (!kmxS.loading) {
    kmxS.loading = (async () => {
      const d = await STORE.readText(KMX_FILE);
      let raw = null;
      if (d.text) { try { raw = JSON.parse(d.text); } catch { throw new Error('매물장터 자료 형식이 올바르지 않습니다'); } }
      kmxS.data = raw && typeof raw === 'object' ? kmxNorm(raw) : null;
      kmxS.byId = new Map((kmxS.data?.items || []).map((x) => [x.id, x]));
      kmxS.at = Date.now();
      TAB_INFO['deals/kmx'] = kmxInfo(kmxS.data);
    })().finally(() => { kmxS.loading = null; });
  }
  return kmxS.loading;
}

function kmxList() {
  const d = kmxS.data; if (!d) return [];
  const q = kmxS.q.trim().toLowerCase();
  return d.items.filter((x) => x.side === kmxS.side && (!q || x.q.includes(q)));
}

/* ---------- 그리기 ---------- */
const KMX_COLS = { 매도: ['회사', '규모', '희망가', '특징'], 매수: ['회사', '인수 금액', '찾는 대상', '특징'] };
const kmxChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
// 값 칸: 넓으면 표 칸(머리글이 이름), 좁으면 이름표 + 값 한 줄. 값이 없으면 넓을 땐 –, 좁을 땐 줄을 뺀다
const kmxCell = (k, v) => `<div class="kmx-c${v ? '' : ' kmx-none'}"><span class="kmx-k">${k}</span><span class="kmx-v rd-clamp">${v ? esc(v) : '–'}</span></div>`;

function kmxRow(x) {
  const open = kmxS.open.has(x.id), [, c2, c3] = KMX_COLS[x.side];
  const meta = [x.corp, x.industry].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('');
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name || '분류 전 글')}</button>${meta ? `<div class="ipo-sub kmx-meta">${meta}</div>` : ''}</div>
      ${kmxCell(c2, x.size)}${kmxCell(c3, x.side === '매도' ? x.price : x.want)}
      <div class="kmx-c kmx-pt${x.point ? '' : ' kmx-none'}"><span class="kmx-v rd-clamp">${x.point ? esc(x.point) : '–'}</span></div>
      <div class="ipo-c-st">${kmxChev()}</div>
    </div>${open ? kmxDetail(x) : ''}</div>`;
}

function kmxDetail(x) {
  const link = x.url ? `<div class="ipo-links"><a class="ipo-a" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">원문 보기${ico('ext', 'sm')}</a></div>` : '';
  return `<div class="ipo-detail">${x.text ? `<p class="ipo-p kmx-text">${esc(x.text)}</p>` : ''}${link}</div>`;
}

function kmxBody() {
  const d = kmxS.data;
  if (!d || !d.items.length) return '<div class="empty">아직 수집된 매물장터 자료가 없습니다.</div>';
  const list = kmxList();
  if (!list.length) return `<div class="empty">${kmxS.q.trim() ? '조건에 맞는 회사가 없습니다.' : `${kmxS.side} 글이 없습니다.`}</div>`;
  // 같은 글(관리번호)끼리 묶어 발행일 소제목 아래에
  const groups = [];
  list.forEach((x) => {
    const k = x.no || `${x.date}|${x.url}`, g = groups[groups.length - 1];
    if (g && g.k === k) g.items.push(x); else groups.push({ k, date: x.date, no: x.no, items: [x] });
  });
  const head = `<div class="ipo-head ipo-cols">${KMX_COLS[kmxS.side].map((t) => `<div>${t}</div>`).join('')}<div></div></div>`;
  return head + groups.map((g) => `<div class="rd-grp"><b>${g.date ? yymd(g.date) : '발행일 없음'}</b>${g.no ? `<span>${esc(g.no)}</span>` : ''}<span>${g.items.length}곳</span></div>${g.items.map(kmxRow).join('')}`).join('');
}

function kmxSummary() {
  const d = kmxS.data; if (!d) return '';
  const it = d.items.filter((x) => x.side === kmxS.side), posts = new Set(it.map((x) => x.no || x.url)).size;
  const old = d.checked && (Date.now() - new Date(`${d.checked}T00:00:00`)) / 86400000 > KMX_STALE;
  // ok로 시작하지 않는 출처만 이름으로(값은 마우스를 올리면) — pe.js와 같다
  const bad = Object.entries(d.sources).filter(([, v]) => !/^ok/i.test(kmxStr(v))).map(([k, v]) => `<span class="ipo-stale" title="${esc(kmxStr(v))}">${esc(k)} 확인 필요</span>`);
  return `${d.checked ? `<span class="${old ? 'ipo-stale' : ''}">${yymd(d.checked)} 확인</span>` : ''}<span>글 <b>${posts}</b></span><span>회사 <b>${it.length}</b></span>${bad.join('')}`;
}

function kmxSideHtml() {
  const d = kmxS.data;
  return `<div class="seg" role="tablist">${KMX_SIDES.map((k) => `<button type="button" role="tab" data-kmx-side="${k}" class="${kmxS.side === k ? 'on' : ''}" aria-selected="${kmxS.side === k}">${k}${d ? `<span class="pe-gn">${d.items.filter((x) => x.side === k).length}</span>` : ''}</button>`).join('')}</div>`;
}

function kmxDraw() {
  const h = kmxS.host; if (!h || !h.isConnected) return;
  const b = h.querySelector('#kmx-body'); if (b) b.innerHTML = kmxBody();
  const s = h.querySelector('#kmx-sum'); if (s) s.innerHTML = kmxSummary();
  const g = h.querySelector('#kmx-side'); if (g) g.innerHTML = kmxSideHtml();
}

function kmxBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const sb = t.closest('[data-kmx-side]');
    if (sb) { if (kmxS.side !== sb.dataset.kmxSide) { kmxS.side = sb.dataset.kmxSide; viewSet('kmx.side', kmxS.side); kmxDraw(); } return; }
    if (t.closest('#kmx-ref')) { kmxLoad(true).then(kmxDraw).catch((e) => toast(e.message)); return; }
    if (t.closest('a, input, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]'), x = row && kmxS.byId.get(row.dataset.id);
    if (!x) return;
    if (kmxS.open.has(x.id)) kmxS.open.delete(x.id); else kmxS.open.add(x.id);
    row.outerHTML = kmxRow(x);
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'kmx-q') { kmxS.q = ev.target.value; viewSet('kmx.q', kmxS.q); kmxDraw(); } });
}

async function renderKmx(host) {
  kmxS.host = host;
  host.innerHTML = `<div class="ipo-page kmx-page" id="kmx-root">
    <div class="pe-grp" id="kmx-side">${kmxSideHtml()}</div>
    <div class="ipo-top"><div class="ipo-sumrow" id="kmx-sum">${kmxSummary()}</div>
      ${infoBtn('deals/kmx')}
      <button class="btn ghost" type="button" id="kmx-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="kmx-q" type="search" placeholder="업종 검색" value="${esc(kmxS.q)}" autocomplete="off" aria-label="업종 검색"></div></div>
      <div class="ipo-body" id="kmx-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  kmxBind(host.querySelector('#kmx-root'));
  try { await kmxLoad(); }
  catch (e) {
    const b = kmxS.host === host && host.querySelector('#kmx-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (kmxS.host === host && host.isConnected) kmxDraw();
}

/* ---------- 화면 설명(ⓘ) ---------- */
function kmxInfo(d) {
  return {
    title: '매물장터',
    asof: `${d?.checked ? `확인일 ${d.checked}` : '확인일 –'}, 출처 ${d?.source || '한국M&A거래소 매경 매물장터'}`,
    rows: [
      ['무엇인가', [
        '한국M&A거래소가 매일경제에 싣는 매물장터 글을 회사별로 나눈 참고용 목록입니다. 회사 이름은 A사, D사처럼 가려져 있습니다.',
        '매도는 팔려는 회사, 매수는 상장사나 외감 법인 같은 사업회사가 인수할 회사를 찾는 글입니다.',
      ]],
      ['어떻게 보나', [
        '위에서 매도와 매수를 고르고, 검색 칸에 업종을 넣어 좁힙니다.',
        '발행일 최신순이고, 같은 글에 실린 회사끼리 발행일 아래 묶입니다.',
        '행을 누르면 그 회사에 해당하는 원문 문장과 원문 링크가 나옵니다. 원문 안 표 이미지는 읽지 않으므로 숫자는 원문에서 확인합니다.',
        '새 글은 일주일에 한 번 받습니다.',
      ]],
      ['그래서 할 일', [
        '어떤 업종과 규모의 매물이 나오고 어떤 사업회사가 무엇을 사려는지 흐름을 참고합니다.',
        '더 볼 회사는 원문을 열어 조건을 확인합니다.',
      ]],
    ],
  };
}
TAB_INFO['deals/kmx'] = kmxInfo(null);
