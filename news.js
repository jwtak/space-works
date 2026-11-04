/* 딜 뉴스: 매일 아침 수집기(00. 대시보드\news)가 OneDrive data/news.json에 올린다.
   cat 'deal' = 사모펀드·M&A·Pre-IPO·출자 등, 'space' = 우주·항공·방산(모회사 분야, 따로 모아 본다).
   화면은 딜소싱 > 뉴스 탭(renderNews), 대시보드 요약 카드(newsHomeBlock). */
const NW_TTL = 300000;
const NW_CATS = [['all', '전체'], ['deal', '딜'], ['space', '우주·항공·방산']];
const NW_PERIODS = [['1', '오늘'], ['3', '최근 3일'], ['7', '최근 7일'], ['14', '최근 2주']];
const NW_SORTS = [['score', '중요도순'], ['time', '최신순']];
const nwS = { data: null, at: 0, loading: null, cat: 'all', q: '', period: '3', sort: 'score' };
try { Object.assign(nwS, JSON.parse(localStorage.getItem('nwFilter') || '{}')); } catch { /* 기본값 */ }
const nwSave = () => { try { localStorage.setItem('nwFilter', JSON.stringify({ cat: nwS.cat, period: nwS.period, sort: nwS.sort })); } catch { /* 기억 못 해도 됨 */ } };

function nwLoad(force) {
  if (!force && nwS.at && Date.now() - nwS.at < NW_TTL) return Promise.resolve();
  nwS.loading ||= (async () => {
    const r = await STORE.readText('data/news.json');
    let d = null;
    if (r.text) { try { d = JSON.parse(r.text); } catch { throw new Error('news.json 형식이 올바르지 않습니다'); } }
    nwS.data = d && Array.isArray(d.items) ? { ...d, items: d.items.filter((x) => x && x.title && /^https?:\/\//i.test(x.url || '')) } : null;
    nwS.at = Date.now();
  })().finally(() => { nwS.loading = null; });
  return nwS.loading;
}

const nwDay = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : ymd(d); };
const nwTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const nwSc = (n) => `<span class="ev-sc ${n >= 80 ? 't1' : n >= 60 ? 't2' : 't3'}" title="딜 관점 중요도">${Number(n) || 0}</span>`;
function nwList() {
  const items = nwS.data?.items || [], q = nwS.q.trim().toLowerCase();
  const from = ymd(addDays(new Date(), -(Number(nwS.period) - 1)));
  return items.filter((x) => (nwS.cat === 'all' || x.cat === nwS.cat) && nwDay(x.published) >= from
    && (!q || [x.title, x.source, x.why, ...(x.tags || []), ...(x.companies || [])].join(' ').toLowerCase().includes(q)));
}

function nwRow(x) {
  const meta = [x.source, nwTime(x.published), (x.also || []).length ? `외 ${x.also.length}곳` : ''].filter(Boolean);
  const tags = [...(nwS.cat === 'all' && x.cat === 'space' ? ['우주·항공·방산'] : []), ...(x.tags || [])].slice(0, 4);
  return `<li class="nw-row">${nwSc(x.score)}
    <div class="nw-main"><a class="nw-ttl" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>
      ${x.why ? `<div class="nw-why">${esc(x.why)}</div>` : ''}
      <div class="nw-meta"><span title="${esc((x.also || []).join(', '))}">${meta.map(esc).join(' · ')}</span>${tags.map((t) => `<span class="chip ${t === '우주·항공·방산' ? 'blue' : 'line'}">${esc(t)}</span>`).join('')}</div></div></li>`;
}

function nwDraw() {
  const body = $('#nw-body'); if (!body) return;
  const d = nwS.data;
  if (!d) { body.innerHTML = '<div class="empty">아직 수집 전입니다. 매일 아침 7시 45분에 모읍니다.</div>'; return; }
  const all = d.items, list = nwList(), td = today();
  const g = new Date(d.generated);
  $('#nw-sum').innerHTML = `${isNaN(g) ? '' : `<span>${ymd(g) === td ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집</span>`}<span>${list.length}건</span>`;
  document.querySelectorAll('[data-nw-cat]').forEach((b) => {
    const k = b.dataset.nwCat, n = all.filter((x) => (k === 'all' || x.cat === k) && nwDay(x.published) >= ymd(addDays(new Date(), -(Number(nwS.period) - 1)))).length;
    b.classList.toggle('on', nwS.cat === k); b.querySelector('.n').textContent = n;
  });
  if (!list.length) { body.innerHTML = `<div class="empty">${nwS.q ? '검색 결과가 없습니다.' : '이 기간에 모은 기사가 없습니다.'}</div>`; return; }
  const by = (a, b) => (nwS.sort === 'score' ? (b.score || 0) - (a.score || 0) : 0) || String(b.published).localeCompare(String(a.published));
  const days = [...new Set(list.map((x) => nwDay(x.published)))].sort().reverse();
  body.innerHTML = days.map((k) => {
    const its = list.filter((x) => nwDay(x.published) === k).sort(by), dd = parse(k);
    const lbl = k === td ? '오늘' : k === ymd(addDays(new Date(), -1)) ? '어제' : '';
    return `<div class="nw-grp"><b>${dd.getMonth() + 1}월 ${dd.getDate()}일 (${WD[dd.getDay()]})</b>${lbl ? `<span>${lbl}</span>` : ''}<span class="n">${its.length}건</span></div><ul class="nw-list">${its.map(nwRow).join('')}</ul>`;
  }).join('');
}

async function renderNews(host) {
  host.innerHTML = `<section class="card nw-card" id="nw-root">
      <div class="nw-filter">
        <div class="nw-seg">${NW_CATS.map(([k, l]) => `<button type="button" data-nw-cat="${k}" class="${nwS.cat === k ? 'on' : ''}">${l}<span class="n"></span></button>`).join('')}</div>
        <div class="nw-search"><span class="nw-sic">${ico('search', 'sm')}</span><input class="input" id="nw-q" type="search" placeholder="기사·매체·회사 검색" value="${esc(nwS.q)}"></div>
        <select class="select" id="nw-period" aria-label="기간">${NW_PERIODS.map(([k, l]) => `<option value="${k}"${nwS.period === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <select class="select" id="nw-sort" aria-label="정렬">${NW_SORTS.map(([k, l]) => `<option value="${k}"${nwS.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <span class="nw-sum" id="nw-sum"></span>
        <button class="iconbtn" type="button" id="nw-ref" aria-label="새로고침">${ico('refresh', 'sm')}</button>
      </div>
      <div class="nw-body" id="nw-body"><div class="empty">불러오는 중…</div></div></section>`;
  host.querySelectorAll('[data-nw-cat]').forEach((b) => b.addEventListener('click', () => { nwS.cat = b.dataset.nwCat; nwSave(); nwDraw(); }));
  $('#nw-q').addEventListener('input', (e) => { nwS.q = e.target.value; nwDraw(); });
  $('#nw-period').addEventListener('change', (e) => { nwS.period = e.target.value; nwSave(); nwDraw(); });
  $('#nw-sort').addEventListener('change', (e) => { nwS.sort = e.target.value; nwSave(); nwDraw(); });
  $('#nw-ref').addEventListener('click', async () => { $('#nw-body').innerHTML = '<div class="empty">불러오는 중…</div>'; try { await nwLoad(true); } catch (e) { toast(e.message); } nwDraw(); });
  await nwLoad();
  nwDraw();
}

// 대시보드: 최근 이틀 중요한 기사 5개 + 우주·항공·방산 3개
async function newsHomeBlock() {
  try { await nwLoad(); } catch { return ''; }
  const d = nwS.data; if (!d) return '';
  const from = ymd(addDays(new Date(), -1)), recent = d.items.filter((x) => nwDay(x.published) >= from).sort((a, b) => (b.score || 0) - (a.score || 0));
  const deal = recent.filter((x) => x.cat !== 'space').slice(0, 5), space = recent.filter((x) => x.cat === 'space').slice(0, 3);
  if (!deal.length && !space.length) return '';
  const li = (x) => `<li><a class="nw-hl" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer"><span class="ttl">${esc(x.title)}</span><span class="meta">${esc([x.source, `${nwDay(x.published) === today() ? '' : '어제 '}${nwTime(x.published)}`].filter(Boolean).join(' · '))}</span></a>${nwSc(x.score)}</li>`;
  return `<section class="card nw-home">
    <div class="card-head"><h2>딜 뉴스</h2><a class="btn sm act" href="#deals/news">전체 보기</a></div>
    <div class="card-body">${deal.length ? `<ul class="list">${deal.map(li).join('')}</ul>` : ''}
      ${space.length ? `<div class="sec-label">우주·항공·방산</div><ul class="list">${space.map(li).join('')}</ul>` : ''}</div></section>`;
}
