/* 딜 뉴스: 매일 아침 수집기(00. 대시보드\news)가 OneDrive data/news.json에 올린다.
   cat 'deal' = 사모펀드·M&A·Pre-IPO·출자 등, 'space' = 우주·항공·방산(모회사 분야, 따로 모아 본다).
   화면은 딜소싱 > 뉴스 탭(renderNews: 맨 위 시사점 + 주요 기사 1~5위, 아래 날짜별 점수순), 대시보드 요약 카드(newsHomeBlock).
   주요 기사·시사점은 수집기가 정한다(news.json picks·brief, 점수 자체는 화면에 안 보임).
   중요(☆) 체크는 data/news_marks.json — 세 분이 같이 쓰고(편집 공유), 기사 내용을 함께 저장해 2주 보관이 지나도 '중요'에 남는다. */
const NW_TTL = 300000;
const NW_CATS = [['all', '전체'], ['deal', '딜'], ['space', '우주·항공·방산'], ['star', '중요']];
const NW_PERIODS = [['1', '오늘'], ['3', '최근 3일'], ['7', '최근 7일'], ['14', '최근 2주']];
const NW_PICK = 5;
const NW_STAR = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l2.3 4.6 5.1.8-3.7 3.6.9 5.1L12 16.2l-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z"/></svg>';
const nwS = { data: null, at: 0, loading: null, cat: 'all', q: viewGet('nwQ', ''), period: '3' };
const nwM = { items: [], version: null, ok: false, dirty: new Map(), saving: Promise.resolve() }; // 중요 체크
try { Object.assign(nwS, JSON.parse(localStorage.getItem('nwFilter') || '{}')); } catch { /* 기본값 */ }
const nwSave = () => { try { localStorage.setItem('nwFilter', JSON.stringify({ cat: nwS.cat, period: nwS.period })); } catch { /* 기억 못 해도 됨 */ } };

function nwLoad(force) {
  if (!force && nwS.at && Date.now() - nwS.at < NW_TTL) return Promise.resolve();
  nwS.loading ||= (async () => {
    const [r] = await Promise.all([STORE.readText('data/news.json'), nwLoadMarks()]);
    let d = null;
    if (r.text) { try { d = JSON.parse(r.text); } catch { throw new Error('news.json 형식이 올바르지 않습니다'); } }
    nwS.data = d && Array.isArray(d.items) ? { ...d, items: d.items.filter((x) => x && x.title && /^https?:\/\//i.test(x.url || '')) } : null;
    nwS.at = Date.now();
  })().finally(() => { nwS.loading = null; });
  return nwS.loading;
}

// ---------- 중요 체크 ----------
const nwMarkVal = (m) => m && m.id && m.title && /^https?:\/\//i.test(m.url || '');
async function nwLoadMarks(inSave) {
  try {
    if (!inSave) await nwM.saving.catch(() => {}); // 저장 중이면 끝난 뒤 읽는다(저장 안에서 부를 때는 기다리면 멈춘다)
    const r = await STORE.readJSON('news_marks');
    nwM.items = (Array.isArray(r.items) ? r.items : []).filter(nwMarkVal);
    for (const [id, snap] of nwM.dirty) nwM.items = nwApplyMark(nwM.items, id, snap); // 아직 못 보낸 체크는 화면에 남긴다
    nwM.version = r.version; nwM.ok = true;
  } catch { nwM.ok = false; } // 체크 파일을 못 읽어도 뉴스는 보인다
}
const nwApplyMark = (items, id, snap) => (snap ? [...items.filter((m) => m.id !== id), snap] : items.filter((m) => m.id !== id));
const nwMarked = (id) => nwM.items.some((m) => m.id === id);
const nwMe = () => PEOPLE.find((p) => myName().includes(p)) || myName();

function nwToggleMark(id) {
  if (!nwM.ok) return toast('중요 체크 파일을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  const on = nwMarked(id);
  const x = nwS.data?.items.find((y) => y.id === id) || nwM.items.find((m) => m.id === id); if (!x) return;
  const snap = on ? null : { id, title: x.title, url: x.url, source: x.source, published: x.published, cat: x.cat, tags: x.tags || [], companies: x.companies || [], why: x.why || '', score: x.score || 0, by: nwMe(), at: today() };
  nwM.items = nwApplyMark(nwM.items, id, snap);
  nwM.dirty.set(id, snap);
  nwDraw();
  nwSaveMarks();
}
/* 저장은 차례로 하나씩: 최신 파일을 읽어 아직 못 보낸 체크만 얹어 쓴다(다른 분이 동시에 체크해도 서로 지우지 않게). */
function nwSaveMarks() {
  nwM.saving = nwM.saving.catch(() => {}).then(async () => {
    if (!nwM.dirty.size) return;
    const sent = new Map(nwM.dirty);
    for (let i = 0; i < 3; i++) {
      try {
        const r = await STORE.readJSON('news_marks');
        let items = (Array.isArray(r.items) ? r.items : []).filter(nwMarkVal);
        for (const [id, snap] of sent) items = nwApplyMark(items, id, snap);
        nwM.version = await STORE.writeJSON('news_marks', items, r.version);
        for (const [id, snap] of sent) if (nwM.dirty.get(id) === snap) nwM.dirty.delete(id);
        nwM.items = items;
        for (const [id, snap] of nwM.dirty) nwM.items = nwApplyMark(nwM.items, id, snap);
        nwDraw();
        if (nwM.dirty.size) nwSaveMarks();
        return;
      } catch (e) { if (e.status !== 409 || i === 2) { toast(`중요 체크를 저장하지 못했습니다: ${e.message}`); break; } }
    }
    for (const [id, snap] of sent) if (nwM.dirty.get(id) === snap) nwM.dirty.delete(id);
    await nwLoadMarks(true); nwDraw();
  });
}

// ---------- 목록 ----------
const nwDay = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : ymd(d); };
const nwTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nwHit = (x, q) => !q || [x.title, x.source, x.why, ...(x.tags || []), ...(x.companies || [])].join(' ').toLowerCase().includes(q);
const nwFrom = () => ymd(addDays(new Date(), -(Number(nwS.period) - 1)));
function nwList() {
  const q = nwS.q.trim().toLowerCase();
  if (nwS.cat === 'star') { // 중요: 기간과 상관없이 체크한 기사 전부(지금 목록에 있으면 최신 내용으로)
    const live = new Map((nwS.data?.items || []).map((x) => [x.id, x]));
    return nwM.items.map((m) => ({ ...m, ...(live.get(m.id) || {}) })).filter((x) => nwHit(x, q));
  }
  const from = nwFrom();
  return (nwS.data?.items || []).filter((x) => (nwS.cat === 'all' || x.cat === nwS.cat) && nwDay(x.published) >= from && nwHit(x, q));
}

// 주요 기사 1~5위: 수집기가 정한 순서(picks), 없으면 최근 이틀 점수순. 검색 중에는 숨긴다
function nwPicksOf(cat) {
  const d = nwS.data, by = new Map((d?.items || []).map((x) => [x.id, x]));
  if (Array.isArray(d?.picks?.[cat])) return d.picks[cat].map((i) => by.get(i)).filter(Boolean).slice(0, NW_PICK);
  const from = ymd(addDays(new Date(), -1));
  return (d?.items || []).filter((x) => (cat === 'all' || x.cat === cat) && nwDay(x.published) >= from)
    .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, NW_PICK);
}
// 시사점(so what) 2~3줄: 분류별로 그 분류의 1~5위를 근거로 쓴 줄
function nwBriefOf(cat) {
  const b = nwS.data?.brief; if (!b) return [];
  const lines = cat === 'all' ? b.lines : b[cat];
  if (Array.isArray(lines)) return lines.filter((l) => l && l.text);
  const by = new Map((nwS.data.items || []).map((x) => [x.id, x])); // 예전 형식(전체 한 묶음)
  return (Array.isArray(b.lines) ? b.lines : []).filter((l) => l && l.text && (l.ids || []).some((i) => by.get(i)?.cat === cat));
}
function nwBriefLine(l) { // "주체: 상황 — 액션" → 주체 굵게, 액션 강조. 누르면 근거 기사
  const t = l.text, x = (l.ids || []).map((i) => nwS.data.items.find((y) => y.id === i)).find(Boolean);
  const m = /^([^:]{1,30}):\s*(.*)$/.exec(t), subj = m ? m[1] : '', rest = m ? m[2] : t;
  const k = rest.lastIndexOf(' — '), body = k > 0 ? rest.slice(0, k) : rest, act = k > 0 ? rest.slice(k + 3) : '';
  const inner = `${subj ? `<b>${esc(subj)}</b> ` : ''}${esc(body)}${act ? ` <span class="act">— ${esc(act)}</span>` : ''}`;
  return `<li>${x ? `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" title="${esc(x.title)}">${inner}</a>` : inner}</li>`;
}

function nwRow(x, pick) { // 아침 메일과 같은 모양: 점수, 제목, 출처, 요약
  const meta = [x.source, `${pick && nwDay(x.published) !== today() ? '어제 ' : ''}${nwTime(x.published)}`, (x.also || []).length ? `외 ${x.also.length}곳` : '', nwS.cat !== 'space' && x.cat === 'space' ? '우주·항공·방산' : ''].filter(Boolean);
  const on = nwMarked(x.id), mk = on ? nwM.items.find((m) => m.id === x.id) : null;
  return `<li class="nw-row"><span class="nw-score" title="딜 소싱 관점 점수">${x.score ?? ''}</span>
    <div class="nw-main"><a class="nw-ttl" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>
      <div class="nw-meta" title="${esc((x.also || []).join(', '))}">${meta.map(esc).join(' · ')}</div>
      ${x.why ? `<div class="nw-why">${esc(x.why)}</div>` : ''}</div>
    <button type="button" class="nw-star${on ? ' on' : ''}" data-nw-star="${esc(x.id)}" aria-pressed="${on}" aria-label="중요" title="${on && mk?.by ? esc(`${mk.by} 체크`) : '중요'}">${NW_STAR}</button></li>`;
}

function nwDraw() {
  const body = $('#nw-body'); if (!body) return;
  const d = nwS.data, star = nwS.cat === 'star';
  if (!d && !star) { body.innerHTML = '<div class="empty">아직 수집 전입니다. 매일 아침 7시 45분에 모읍니다.</div>'; return; }
  const all = d?.items || [], list = nwList(), td = today(), q = nwS.q.trim();
  const g = new Date(d?.generated);
  $('#nw-sum').innerHTML = `${isNaN(g) ? '' : `<span>${ymd(g) === td ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집</span>`}<span>${list.length}건</span>`;
  $('#nw-period').disabled = star;
  const from = nwFrom();
  document.querySelectorAll('[data-nw-cat]').forEach((b) => {
    const k = b.dataset.nwCat, n = k === 'star' ? nwM.items.length : all.filter((x) => (k === 'all' || x.cat === k) && nwDay(x.published) >= from).length;
    b.classList.toggle('on', nwS.cat === k); b.querySelector('.n').textContent = n;
  });
  if (!list.length) { body.innerHTML = `<div class="empty">${q ? '검색 결과가 없습니다.' : star ? '중요 체크한 기사가 없습니다.' : '이 기간에 모은 기사가 없습니다.'}</div>`; return; }
  const picks = star || q ? [] : nwPicksOf(nwS.cat), brief = star || q ? [] : nwBriefOf(nwS.cat);
  const picked = new Set(picks.map((x) => x.id)), rest = list.filter((x) => !picked.has(x.id));
  const by = (a, b) => (b.score || 0) - (a.score || 0) || String(b.published).localeCompare(String(a.published)); // 날짜 안에서는 점수순
  const days = [...new Set(rest.map((x) => nwDay(x.published)))].sort().reverse();
  body.innerHTML = (picks.length || brief.length ? `<section class="nw-pick"><div class="nw-pick-h"><b>주요 기사</b><span class="n">${picks.length}건</span></div>${brief.length ? `<ul class="nw-brief">${brief.map(nwBriefLine).join('')}</ul>` : ''}${picks.length ? `<ul class="nw-list">${picks.map((x) => nwRow(x, true)).join('')}</ul>` : ''}</section>` : '') + days.map((k) => {
    const its = rest.filter((x) => nwDay(x.published) === k).sort(by), dd = parse(k);
    const lbl = k === td ? '오늘' : k === ymd(addDays(new Date(), -1)) ? '어제' : '';
    return `<div class="nw-grp"><b>${dd.getMonth() + 1}월 ${dd.getDate()}일 (${WD[dd.getDay()]})</b>${lbl ? `<span>${lbl}</span>` : ''}<span class="n">${its.length}건</span></div><ul class="nw-list">${its.map((x) => nwRow(x)).join('')}</ul>`;
  }).join('');
}

async function renderNews(host) {
  host.innerHTML = `<section class="card nw-card" id="nw-root">
      <div class="nw-filter">
        <div class="nw-seg">${NW_CATS.map(([k, l]) => `<button type="button" data-nw-cat="${k}" class="${nwS.cat === k ? 'on' : ''}">${k === 'star' ? NW_STAR : ''}${l}<span class="n"></span></button>`).join('')}</div>
        <div class="nw-search"><span class="nw-sic">${ico('search', 'sm')}</span><input class="input" id="nw-q" type="search" placeholder="기사·매체·회사 검색" value="${esc(nwS.q)}"></div>
        <select class="select" id="nw-period" aria-label="기간">${NW_PERIODS.map(([k, l]) => `<option value="${k}"${nwS.period === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <span class="nw-sum" id="nw-sum"></span>
        <button class="iconbtn" type="button" id="nw-ref" aria-label="새로고침">${ico('refresh', 'sm')}</button>
      </div>
      <div class="nw-body" id="nw-body"><div class="empty">불러오는 중…</div></div></section>`;
  host.querySelectorAll('[data-nw-cat]').forEach((b) => b.addEventListener('click', () => { nwS.cat = b.dataset.nwCat; nwSave(); nwDraw(); }));
  $('#nw-q').addEventListener('input', (e) => { nwS.q = e.target.value; viewSet('nwQ', nwS.q); nwDraw(); });
  $('#nw-period').addEventListener('change', (e) => { nwS.period = e.target.value; nwSave(); nwDraw(); });
  $('#nw-ref').addEventListener('click', async () => { $('#nw-body').innerHTML = '<div class="empty">불러오는 중…</div>'; try { await nwLoad(true); } catch (e) { toast(e.message); } nwDraw(); });
  $('#nw-body').addEventListener('click', (e) => { const b = e.target.closest('[data-nw-star]'); if (b) nwToggleMark(b.dataset.nwStar); });
  await nwLoad();
  nwDraw();
}

// ---------- 대시보드 카드 맨 위 시사점 칸(딜 뉴스·다가오는 행사·락업 해제 공통) ----------
// 칸 머리표: Claude가 쓴 칸(딜 뉴스·행사)은 별+AI 요약, 규칙으로 만든 칸(락업 해제)은 체크+할 일 요약
const homeBrief = (lines, [ic, lbl] = ['spark', 'AI 요약']) => (lines.length ? `<ul class="nw-brief home-brief"><li class="brief-h">${ico(ic, `sm ${ic}`)}${lbl}</li>${lines.join('')}</ul>` : '');
const homeBriefLine = (subj, body, act, attr) => `<li><span class="lnk" ${attr}><b>${esc(subj)}</b> ${esc(body)}${act ? ` <span class="act">— ${esc(act)}</span>` : ''}</span></li>`;
// 락업 해제 카드: 2주 안에 풀리는 3곳과 컨택 상태별 할 일 (카드 자체는 ipo.js, 여기서는 맨 위 칸만)
function ipoHomeBrief() {
  const d = typeof ipoState !== 'undefined' && ipoState.data; if (!d) return '';
  const lim = ymd(addDays(new Date(), 14));
  const list = d.items.filter((x) => x.next && x.next.d <= lim).sort((a, b) => a.next.d.localeCompare(b.next.d)).slice(0, 3);
  return homeBrief(list.map((x) => {
    const who = String(x.next['대상'] || ''), st = ipoSt(x.code), w = x.writer?.name ? `${x.writer.title || ''} ${x.writer.name}`.trim() : '';
    const tag = /최대주주/.test(who) ? ' (최대주주)' : /FI|벤처|조합|펀드|투자/.test(who) ? ' (FI)' : '';
    const act = { 미접촉: `${w ? `${w} ` : ''}컨택, 블록딜·구주 물량 확인`, 연락함: '후속 연락, 블록딜 물량 확인', 미팅: '미팅 후속, 물량 확인', 보류: '보류 중' }[st] || '';
    return homeBriefLine(x.name, `${ipoMd(x.next.d)} ${x.next['지분율'] || ''} 해제${tag}`, act, `data-ipo-go="${esc(x.code)}"`);
  }), ['check', '할 일 요약']);
}

// 대시보드: 맨 위 시사점 + 주요 기사 1~5위 + 우주·항공·방산 3개(위에 나온 기사 빼고)
async function newsHomeBlock() {
  try { await nwLoad(); } catch { return ''; }
  const d = nwS.data; if (!d) return '';
  const lines = nwBriefOf('all'), top = nwPicksOf('all'), shown = new Set(top.map((x) => x.id));
  const space = nwPicksOf('space').filter((x) => !shown.has(x.id)).slice(0, 3);
  if (!top.length && !space.length && !lines.length) return '';
  const li = (x) => `<li><a class="nw-hl" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><span class="ttl">${esc(x.title)}</span><span class="meta">${esc([x.source, `${nwDay(x.published) === today() ? '' : '어제 '}${nwTime(x.published)}`].filter(Boolean).join(' · '))}</span></a></li>`;
  return `<section class="card nw-home">
    <div class="card-head"><h2>딜 뉴스</h2><a class="btn sm act" href="#deals/news">전체 보기</a></div>
    <div class="card-body">${homeBrief(lines.map(nwBriefLine))}${top.length ? `<ul class="list">${top.map(li).join('')}</ul>` : ''}
      ${space.length ? `<div class="sec-label">우주·항공·방산</div><ul class="list">${space.map(li).join('')}</ul>` : ''}</div></section>`;
}
