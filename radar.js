/* SPACE WORKS — 딜소싱 › 예심청구(4번)·매각희망(3번)·입찰딜(5번) = 딜레이더
   매일 09:10 PC 작업(05. 딜소싱\_자동화\딜레이더\run_radar.py)이 회사 OneDrive SPACE WORKS/data/ 에
   yesim.json·sell.json·bids.json 을 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT.md).
   컨택 상태·메모는 세 탭이 data/radar_marks.json 하나를 같이 쓴다(key = yesim:<id> · sell:<id> · bids:<id>, 탁지원·대표님 두 분 편집 공유).
   진입: renderYesim(host) · renderSell(host) · renderBids(host) — host 안에만 그린다. 다른 화면에서 한 건을 펼쳐 열 때: radarFocus(ref).
   app.js 전역($, esc, pad, ymd, parse, today, addDays, diffDays, md, ico, toast, G)과 graph.js 의 STORE, ipo.css 클래스를 쓴다.
   엑셀은 ipo.js 의 ipoDownload(통합 엑셀), 파이프라인은 pipeline.js 의 pipeAdd·pipeHas·pipeLoad(있을 때만 버튼이 보인다). */

const RD_STATUS = ['미접촉', '연락함', '미팅', '보류'];
const RD_TTL = 5 * 60000;
const RD_TAB = {
  yesim: { file: 'data/yesim.json', label: '예심청구', unit: '곳' },
  sell: { file: 'data/sell.json', label: '매각희망', unit: '건' },
  bids: { file: 'data/bids.json', label: '입찰딜', unit: '건' },
};
const RD_YS_F = [['all', '전체'], ['review', '심사 중'], ['ok', '승인'], ['drop', '철회·미승인'], ['new', '새 소식']];
const RD_YS_SORT = [['filed', '청구일순'], ['decided', '결과일순'], ['rev', '매출순']];
const RD_KINDS = ['철회', '만기', '지분축소', '락업', 'EB', '뉴스'];
const RD_SELL_SORT = [['near', '가까운 날짜순'], ['pct', '지분율순'], ['name', '회사명순']];
const RD_STAGES = ['매각 추진', '주관사 선정', '예비입찰', '숏리스트', '본입찰', '우선협상', '계약', '무산', '공시 검토', '회생 M&A'];
const RD_FITS = ['상', '중', '하'];

// 머리줄 ⓘ 설명(app.js infoOpen)
Object.assign(TAB_INFO, {
  'deals/yesim': { title: '예심청구', rows: [
    ['무엇인가', '비상장 회사가 상장하려고 거래소에 상장예비심사를 신청한 것입니다. 심사(실제로는 60~120영업일)와 승인을 거쳐 보통 3~6개월 안에 상장합니다.'],
    ['왜 보나', [
      '청구한 뒤에는 신주 투자가 막힙니다(청구 뒤 제3자배정 신주를 발행하면 예심 효력을 잃습니다).',
      '이 탭에서 노리는 것은 세 가지입니다: 청구 전 신호 회사의 신주 Pre-IPO, 심사 중 회사의 기존 FI 구주, 철회 회사의 밸류 리셋 라운드.',
    ]],
    ['어떻게 보나', [
      '\'새 소식\'으로 새로 청구·승인·철회된 회사를 봅니다.',
      '회사를 펼치면 3개년 실적, 주관사, 주주(FI 표시), 대표 연락처, 관련 기사가 나옵니다.',
      '목록 위 \'청구 전 신호\'는 아직 청구 전인데 기술성평가·주관사 선정·상장 추진 기사가 난 회사입니다.',
    ]],
    ['그래서 할 일', [
      '청구 전 신호: 라운드가 열려 있는지 먼저 확인합니다. 가장 값진 구간입니다.',
      '심사 중: FI 조합이 매각희망 \'만기\'에도 있으면 구주 매입을 제안합니다.',
      '철회: 낮아진 밸류로 들어갈 수 있는지 봅니다. 승인된 회사는 신규상장 탭에서 봅니다.',
      '연락하면 상태(연락함·미팅)와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
    ]],
    ['주의', '청구 뒤 구주를 사면 의무보유가 걸리는지는 딜 전에 주관사에 확인해야 합니다.'],
  ] },
  'deals/sell': { title: '매각희망', rows: [
    ['무엇인가', '다른 PE·VC나 주주가 지분을 팔아야 하거나 팔려는 신호를 모은 목록입니다.'],
    ['왜 보나', '파는 쪽이 급할수록 구주·세컨더리를 할인된 값에 살 수 있습니다. 신생 GP가 딜을 얻는 현실적인 경로입니다.'],
    ['어떻게 보나', [
      '만기: 만기가 2년 안인 투자조합과 그 조합이 가진 회사. 매도 후보는 그 조합입니다.',
      '지분축소: VC·PE·조합이 상장사 지분을 줄였다는 공시입니다.',
      'EB: 다른 회사 주식을 교환 대상으로 EB를 발행한 것으로, 그 지분을 정리하려는 신호입니다.',
      '락업: 신규상장사 FI의 의무보유가 90일 안에 풀리는 것입니다.',
      '뉴스: 매각 기사, 철회: 예심을 철회해 FI 회수가 늦어진 회사입니다.',
      '펼치면 근거 한 줄, 매도 후보, DART 원문 링크가 나옵니다.',
    ]],
    ['그래서 할 일', [
      '매도 후보(조합 운용사·발행사)에 지분 매입 의사를 타진합니다.',
      '만기 조합이 예심청구 회사의 주주이기도 하면 우선순위를 높입니다.',
      '연락하면 상태와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
    ]],
  ] },
  'deals/bids': { title: '입찰딜', rows: [
    ['무엇인가', '회계법인·증권사가 매각 주관을 맡아 여러 인수 후보에게 입찰을 받는 딜입니다. 법원 회생 M&A 공고도 들어 있습니다.'],
    ['왜 보나', '혼자 사기 어려운 딜도 SI(전략적 투자자) 공동투자, 메자닌, 소수지분으로 들어갈 여지가 있습니다. 매각 자문사와 관계를 쌓는 통로이기도 합니다.'],
    ['어떻게 보나', [
      '단계: 매각 추진 → 주관사 선정 → 예비입찰 → 숏리스트 → 본입찰 → 우선협상 → 계약. 공시 검토(회사가 검토 중이라고 답한 것)와 회생 M&A는 따로 묶습니다.',
      '적합도 상·중·하는 우리가 낄 여지입니다.',
      '\'자문사별\'로 바꾸면 어느 자문사가 어떤 딜을 맡았는지 봅니다.',
      '출처는 기사, DART 조회공시 답변, 법원 공고입니다.',
    ]],
    ['그래서 할 일', [
      '적합도가 상·중이고 예비입찰 전이면 자문사에 자료(티저·IM)를 요청하고, 함께 들어갈 SI 후보를 찾습니다.',
      '연락하면 상태와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
    ]],
  ] },
});

const rdS = {
  tab: null, host: null, field: null, // field = 쓰고 있는 메모 칸 {el, tab}
  marks: { items: [], version: null }, dirty: new Map(), saving: Promise.resolve(),
  yesim: { data: null, at: 0, loading: null, q: '', f: 'all', sort: 'filed', open: new Set(), focus: null },
  sell: { data: null, at: 0, loading: null, q: '', f: 'all', sort: 'near', open: new Set(), focus: null },
  bids: { data: null, at: 0, loading: null, q: '', view: 'deal', fit: '', stage: '', open: new Set(), focus: null },
};

/* ---------- 데이터 ---------- */
function rdLoad(tab, force) {
  const s = rdS[tab];
  if (!force && s.at && Date.now() - s.at < RD_TTL) return Promise.resolve();
  if (!s.loading) {
    s.loading = (async () => {
      // 저장 대기 중에 읽으면 대기 변경이 덮이므로 저장이 끝난 뒤 읽고, 아직 못 보낸 변경은 다시 얹는다
      let d, mk, sv;
      do {
        sv = rdS.saving; await sv.catch(() => {});
        [d, mk] = await Promise.all([STORE.readText(RD_TAB[tab].file), rdReadMarks()]);
      } while (sv !== rdS.saving);
      let raw = null;
      if (d.text) { try { raw = JSON.parse(d.text); } catch { throw new Error(`${RD_TAB[tab].label} 자료 형식이 올바르지 않습니다`); } }
      s.data = raw && typeof raw === 'object' ? RD_NORM[tab](raw) : null;
      rdS.marks = { items: rdApplyDirty(mk.items), version: mk.version };
      s.at = Date.now();
    })().finally(() => { s.loading = null; });
  }
  return s.loading;
}

/* 수집 결과는 칸이 비거나 형식이 어긋날 수 있어 화면에 쓰기 전에 한 번 고른다 */
const rdStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const rdArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const rdNum = (v) => {
  if (v == null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const rdDay = (v) => { const s = rdStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const rdHttp = (u) => /^https?:\/\/\S+$/i.test(u || '');
// 홈페이지는 'www.회사.co.kr'처럼 주소만 오기도 해 http:// 를 붙인다. 그 밖의 형식(javascript: 등)은 버린다
const rdUrl = (u) => { const s = rdStr(u); return rdHttp(s) ? s : /^[\w-]+(\.[\w-]+)+([/?#:]\S*)?$/.test(s) ? `http://${s}` : ''; };
const rdSplit = (s) => rdStr(s).split(/\s*[,，、/·]\s*/).filter(Boolean);
const rdFlag = (v) => (v === true ? '해당' : v === false ? '' : rdStr(v));
const rdQ = (...a) => a.flat().map(rdStr).join(' ').toLowerCase();
const rdMoney = (v) => { const n = typeof v === 'number' ? v : null; return n != null && Number.isFinite(n) ? `${n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억` : rdStr(v); };
const rdUniq = (list) => { const seen = new Set(); return list.filter((x) => !seen.has(x.id) && seen.add(x.id)); };

const rdNewsN = (a) => rdArr(a).filter((n) => rdStr(n.title))
  .map((n) => ({ dt: rdDay(n.dt), src: rdStr(n.src), title: rdStr(n.title), url: rdHttp(rdStr(n.url)) ? rdStr(n.url) : '' }))
  .sort((a, b) => b.dt.localeCompare(a.dt));

function rdHost(u) {
  let h = '';
  try { h = new URL(u).hostname.replace(/^www\./, ''); } catch { return '원문'; }
  if (/(^|\.)dart\.fss\.or\.kr$/.test(h)) return 'DART 원문';
  if (/(^|\.)kind\.krx\.co\.kr$/.test(h)) return 'KIND';
  if (/(^|\.)scourt\.go\.kr$/.test(h)) return '법원 공고';
  return h;
}
// 링크는 {label, url} 또는 주소 문자열. http(s)만 남긴다
const rdLinksN = (a) => (Array.isArray(a) ? a : [])
  .map((l) => (typeof l === 'string' ? { label: '', url: l.trim() } : l && typeof l === 'object' ? { label: rdStr(l.label), url: rdStr(l.url) } : null))
  .filter((l) => l && rdHttp(l.url)).map((l) => ({ url: l.url, label: l.label || rdHost(l.url) }));

const RD_YS_LABEL = { 심사중: '심사 중' };
const rdYsLabel = (s) => RD_YS_LABEL[s] || s;

function rdNormYesim(raw) {
  const d7 = ymd(addDays(new Date(), -7));
  const items = rdArr(raw.items).filter((x) => rdStr(x.name)).map((x) => {
    const filed = rdDay(x.filed), decided = rdDay(x.decided), changedAt = rdDay(x.changedAt), news = rdNewsN(x.news);
    const fin = x.fin && typeof x.fin === 'object' && x.fin.years && typeof x.fin.years === 'object' ? x.fin : null;
    const years = fin ? Object.keys(fin.years).filter((y) => Array.isArray(fin.years[y])).sort() : [];
    const fy = [...years].reverse().find((y) => rdNum(fin.years[y][0]) != null) || '';
    const holders = rdArr(x.holders).filter((h) => rdStr(h.name)).map((h) => ({ name: rdStr(h.name), pct: rdNum(h.pct), fi: h.fi === true }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    // 주주 목록이 없으면 KIND 최대주주(topHolder) 한 줄이라도 보여 준다. 상장 뒤에는 종목코드(code)·상장일(listed)이 온다
    const th = x.topHolder && typeof x.topHolder === 'object' && rdStr(x.topHolder.name) ? { name: rdStr(x.topHolder.name), pct: rdNum(x.topHolder.pct), fi: x.topHolder.fi === true, top: true } : null;
    const o = {
      id: rdStr(x.id) || `${rdStr(x.name)}|${filed}`, name: rdStr(x.name), type: rdStr(x.type), market: rdStr(x.market),
      filed, decided, changedAt, status: rdStr(x.status).replace(/\s+/g, ''), broker: rdStr(x.broker), techSpecial: rdFlag(x.techSpecial),
      sector: rdStr(x.sector), product: rdStr(x.product), ceo: rdStr(x.ceo), founded: rdStr(x.founded), addr: rdStr(x.addr),
      phone: rdStr(x.phone), home: rdStr(x.home), fin, years, fy, rev: fy ? rdNum(fin.years[fy][0]) : null,
      holders: holders.length ? holders : th ? [th] : [], code: rdStr(x.code), listed: rdDay(x.listed),
      dartUrl: rdStr(x.dartUrl), kindUrl: rdStr(x.kindUrl), news,
    };
    o.isNew = [filed, decided, changedAt, ...news.map((n) => n.dt)].some((t) => t && t >= d7);
    o.q = rdQ(o.name, o.sector, o.product, o.broker, o.ceo, o.addr, o.market, o.type, rdYsLabel(o.status), o.techSpecial, holders.map((h) => h.name));
    return o;
  });
  const signals = rdArr(raw.signals).filter((x) => rdStr(x.name) || rdStr(x.title)).map((x) => {
    const o = { id: rdStr(x.id), name: rdStr(x.name), dt: rdDay(x.dt), kind: rdStr(x.kind), title: rdStr(x.title), src: rdStr(x.src), url: rdHttp(rdStr(x.url)) ? rdStr(x.url) : '' };
    o.q = rdQ(o.name, o.kind, o.title, o.src);
    return o;
  }).sort((a, b) => b.dt.localeCompare(a.dt));
  return { generated: raw.generated, sources: raw.sources, items: rdUniq(items), signals };
}

function rdNormSell(raw) {
  const td = today();
  const items = rdArr(raw.items).filter((x) => rdStr(x.name)).map((x) => {
    const f = x.fund && typeof x.fund === 'object' ? x.fund : null;
    const fund = f ? { name: rdStr(f.name), gp: rdStr(f.gp), formed: rdStr(f.formed), expiry: rdStr(f.expiry), size: rdMoney(f.size) } : null;
    const o = {
      id: rdStr(x.id) || `${rdStr(x.kind)}|${rdStr(x.name)}`, kind: rdStr(x.kind), name: rdStr(x.name), code: rdStr(x.code), seller: rdStr(x.seller),
      date: rdDay(x.date), pct: rdNum(x.pct), detail: rdStr(x.detail), fund, links: rdLinksN(x.links), news: rdNewsN(x.news),
    };
    o.dd = o.date ? diffDays(o.date, td) : null;
    o.q = rdQ(o.name, o.code, o.seller, o.kind, o.detail, fund ? [fund.name, fund.gp] : []);
    return o;
  });
  // 조합 행에는 운용 단계(stage: 투자중·회수중·청산중 등)·출처 원문(url)·보유 회사(companies)가 함께 올 수 있다
  // 순서: 다가오는 만기를 가까운 순으로 먼저, 이미 지난 조합은 그 아래에 최근에 지난 순으로
  const funds = rdArr(raw.funds).filter((f) => rdStr(f.name)).map((f) => {
    const o = { name: rdStr(f.name), gp: rdStr(f.gp), formed: rdStr(f.formed), expiry: rdStr(f.expiry), size: rdMoney(f.size), src: rdStr(f.src),
      stage: rdStr(f.stage), url: rdHttp(rdStr(f.url)) ? rdStr(f.url) : '', companies: (Array.isArray(f.companies) ? f.companies : []).map(rdStr).filter(Boolean) };
    o.q = rdQ(o.name, o.gp, o.src, o.stage, o.companies);
    return o;
  }).sort((a, b) => {
    const x = rdDay(a.expiry) || '9999', y = rdDay(b.expiry) || '9999', px = x < td, py = y < td;
    return px !== py ? (px ? 1 : -1) : px ? y.localeCompare(x) : x.localeCompare(y);
  });
  return { generated: raw.generated, sources: raw.sources, items: rdUniq(items), funds };
}

function rdNormBids(raw) {
  const items = rdUniq(rdArr(raw.items).filter((x) => rdStr(x.name)).map((x) => {
    const o = {
      id: rdStr(x.id) || rdStr(x.name), name: rdStr(x.name), seller: rdStr(x.seller), advisor: rdStr(x.advisor), stage: rdStr(x.stage),
      schedule: rdStr(x.schedule), size: rdMoney(x.size), sector: rdStr(x.sector), fit: rdStr(x.fit), summary: rdStr(x.summary),
      first: rdDay(x.first), last: rdDay(x.last), src: (Array.isArray(x.src) ? x.src : [x.src]).map(rdStr).filter(Boolean),
      bidders: (Array.isArray(x.bidders) ? x.bidders : []).map(rdStr).filter(Boolean), // 인수 후보(우선협상대상자 등)
      links: rdLinksN(x.links), news: rdNewsN(x.news),
      guess: x.guess === true, // 분류 전 임시 카드: 분류 뒤 id가 바뀔 수 있어 컨택 상태·파이프라인을 남기지 않는다
    };
    o.q = rdQ(o.name, o.seller, o.advisor, o.sector, o.stage, o.summary, o.size, o.schedule, o.bidders);
    return o;
  }));
  let advisors = rdArr(raw.advisors).filter((a) => rdStr(a.name)).map((a) => ({ name: rdStr(a.name), ids: (Array.isArray(a.ids) ? a.ids : []).map(rdStr) }));
  if (!advisors.length) { // 자문사 목록이 없으면 딜의 자문사 칸으로 묶는다
    const m = new Map();
    items.forEach((x) => rdSplit(x.advisor).forEach((n) => { if (!m.has(n)) m.set(n, []); m.get(n).push(x.id); }));
    advisors = [...m].map(([name, ids]) => ({ name, ids }));
  }
  return { generated: raw.generated, sources: raw.sources, items, advisors };
}

const RD_NORM = { yesim: rdNormYesim, sell: rdNormSell, bids: rdNormBids };

/* ---------- 컨택 상태·메모 (radar_marks.json, 세 탭 공용) ----------
   dirty = 아직 저장 안 된 변경 {key → {patch(서버에 아직 없는 바뀐 필드만), seq, base(되돌릴 원본 = 서버에 있는 그 항목, 없으면 null), tab, name, at, by}}.
   다른 사람이 먼저 저장했으면(409) 최신본을 다시 읽고 바뀐 필드만 얹어 한 번 더 저장한다.
   그 밖의 실패는 화면을 저장 전으로 되돌린다. */
const rdKey = (tab, id) => `${tab}:${id}`;
const rdFind = (tab, id) => rdS[tab].data?.items.find((x) => x.id === id);
const rdMark = (key) => rdS.marks.items.find((m) => m && m.key === key);
const rdSt = (key) => { const s = rdMark(key)?.status; return RD_STATUS.includes(s) ? s : '미접촉'; };
const rdNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
let rdSeq = 0;

// 표시 파일은 배열이다. 깨졌거나 배열이 아니면(객체·null) 빈 목록으로 보고 저장하면 다른 분 표시가 지워지므로 읽기를 멈추고 짧은 오류만 낸다(bad)
const RD_MARKS_BAD = '컨택 상태 자료 형식이 올바르지 않습니다';
async function rdReadMarks() {
  let r;
  try { r = await STORE.readJSON('radar_marks'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; r = null; }
  if (!r || !Array.isArray(r.items)) { const err = new Error(RD_MARKS_BAD); err.bad = true; throw err; }
  return r;
}

function rdApplyDirty(items) {
  rdS.dirty.forEach((e, key) => {
    const k = items.findIndex((x) => x && x.key === key);
    const m = { ...(k >= 0 ? items[k] : { key, status: '미접촉', note: '' }), ...e.patch, tab: e.tab, name: e.name, at: e.at, by: e.by };
    if (k >= 0) items[k] = m; else items.push(m);
  });
  return items;
}

function rdRollback(msg) {
  rdS.dirty.forEach((e, key) => {
    const items = rdS.marks.items, k = items.findIndex((x) => x && x.key === key);
    if (e.base) { if (k >= 0) items[k] = e.base; else items.push(e.base); } else if (k >= 0) items.splice(k, 1);
  });
  rdS.dirty.clear();
  toast(msg);
  rdDraw();
}

function rdSaveMarks() {
  let merged = false;
  rdS.saving = rdS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      if (!rdS.dirty.size) return;
      const sent = new Map([...rdS.dirty].map(([key, e]) => [key, e.seq]));
      const body = rdS.marks.items.filter((m) => m && typeof m === 'object').map((m) => ({ ...m }));
      try {
        rdS.marks.version = await STORE.writeJSON('radar_marks', body, rdS.marks.version);
        // 보내는 동안 또 바뀐 항목은 남겨 두고 다음 저장에 태운다. 이때 방금 보낸 그 항목을 되돌릴 원본(base)으로, 그 뒤에 바뀐 필드만 patch로 둔다
        // (안 그러면 다음 저장이 실패할 때 이미 저장된 값까지 되돌린 채 다음 저장이 서버를 덮고, 409 때는 이미 저장한 필드를 다시 얹어 다른 분 변경을 덮는다)
        sent.forEach((seq, key) => {
          const d = rdS.dirty.get(key); if (!d) return;
          if (d.seq === seq) { rdS.dirty.delete(key); return; }
          const b = body.find((m) => m.key === key);
          d.base = b ? { ...b } : null;
          d.patch = Object.fromEntries(Object.entries(d.patch).filter(([f, v]) => !b || b[f] !== v));
        });
        return;
      } catch (e) {
        if (e.status !== 409) { rdRollback(e.status === 403 ? '편집 권한이 없습니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
        try {
          const r = await rdReadMarks(), items = r.items;
          rdS.dirty.forEach((d, key) => { const x = items.find((m) => m && m.key === key); d.base = x ? { ...x } : null; });
          rdS.marks = { items: rdApplyDirty(items), version: r.version };
          merged = true;
        } catch (e2) { rdRollback(e2.bad ? `저장하지 못했습니다. ${RD_MARKS_BAD}.` : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
      }
    }
    rdRollback('다른 분이 동시에 수정 중입니다. 잠시 후 다시 시도해 주세요.');
  }).finally(() => { if (merged) rdDraw(); }); // 다른 분이 바꾼 내용도 화면에 반영
  return rdS.saving;
}

function rdTouch(tab, id, patch) {
  const x = rdFind(tab, id); if (!x || x.guess) return false;
  const key = rdKey(tab, id);
  let m = rdMark(key);
  const prev = rdS.dirty.get(key);
  const base = prev ? prev.base : (m ? { ...m } : null);
  if (!m) { m = { key, tab, name: x.name, status: '미접촉', note: '' }; rdS.marks.items.push(m); }
  const e = { patch: { ...prev?.patch, ...patch }, seq: ++rdSeq, base, tab, name: x.name, at: rdNow(), by: G.account?.name || '' };
  Object.assign(m, patch, { tab, name: e.name, at: e.at, by: e.by });
  rdS.dirty.set(key, e);
  return true;
}

function rdSetStatus(tab, id, status) {
  if (!RD_STATUS.includes(status) || rdSt(rdKey(tab, id)) === status) return;
  if (!rdTouch(tab, id, { status })) return;
  rdRefreshRow(tab, id);
  rdSumDraw();
  rdSaveMarks();
}

function rdSetNote(tab, id, v) {
  const note = String(v || '').trim().slice(0, 300), key = rdKey(tab, id);
  if ((rdMark(key)?.note || '') === note) return;
  if (!rdTouch(tab, id, { note })) return;
  const by = rdS.tab === tab && rdS.host && rdRowEl(rdS.host, id)?.querySelector('.ipo-by');
  if (by) by.textContent = rdByText(rdMark(key));
  rdSaveMarks();
}

/* ---------- 표시 형식 ---------- */
// 이름 칸(회사·매도 후보·조합·운용사·주주·주관사·자문사·인수 후보·대표): Firefox·WebKit은 keep-all에서 '·'·'-' 뒤를 줄바꿈 자리로 보지 않아
// 긴 이름을 음절 가운데서 꺾으므로, Chromium이 줄을 바꾸는 자리('·' 뒤 한글·한자, '-' 뒤 한글·한자·영문·여는 괄호, 영문·숫자 뒤 '-' 다음 숫자)에만 <wbr>
const rdNm = (s) => esc(s).replace(/[A-Za-z0-9]-(?=\d)|-(?=[A-Za-z(가-힣ㄱ-ㅣ一-鿿])|·(?=[가-힣ㄱ-ㅣ一-鿿])/g, '$&<wbr>');
const RD_NA = '<span class="muted">–</span>';
// 목록 날짜: 올해는 11/4, 다른 해는 2025.12.30 — 신규상장·파이프라인과 같은 형식 (상세는 YYYY-MM-DD)
const rdMd = (s) => { const d = rdDay(s); if (!d) return ''; return d.slice(0, 4) === today().slice(0, 4) ? md(d) : `${d.slice(0, 4)}.${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`; };
const rdYmd = (s) => rdDay(s) || rdStr(s);
const rdEok = (v) => { const n = rdNum(v); return n == null ? '–' : `${n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`; };
const rdPct = (v) => { const n = rdNum(v); return n == null ? '' : `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}%`; };
const rdTel = (t) => (t ? `<a class="ipo-tel" href="tel:${esc(String(t).replace(/[^\d+]/g, ''))}">${esc(t)}</a>` : '');
// 다가오는 날은 D-n(2주 안은 주황), 지난 날은 n일 전(두 달까지)
function rdDday(s) {
  const d = rdDay(s); if (!d) return '';
  const n = diffDays(d, today());
  if (n > 0) return `<span class="${n <= 14 ? 'ipo-soon' : ''}">D-${n}</span>`;
  if (n === 0) return '<span class="ipo-soon">오늘</span>';
  return -n <= 60 ? `${-n}일 전` : '';
}
// 조합 만기: 지난 만기는 기간 제한 없이 n일 지남, 다가오는 만기는 rdDday와 같게
const rdExp = (s) => { const d = rdDay(s); if (!d) return ''; const n = diffDays(d, today()); return n < 0 ? `${-n}일 지남` : rdDday(d); };
const rdByText = (m) => (m && typeof m.at === 'string' && m.at ? `${rdStr(m.by)} ${rdMd(m.at.slice(0, 10))} ${m.at.slice(11, 16)}`.trim() : '');
const rdChip = (st) => `<span class="ipo-st s-${RD_STATUS.indexOf(st)}">${esc(st)}</span>`;
const rdChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
const rdClamp = (t, f = esc) => (t ? `<div class="rd-clamp">${f(t)}</div>` : RD_NA);

/* 묶음 = 제목 줄 + 본문의 라운드 박스 (ipo.js ipoBox와 같은 모양) */
const rdBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const RD_NONE = '<p class="ipo-p muted">없음</p>';
const rdKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');

function rdLinkRow(list) {
  const a = list.filter((l) => l.url).map((l) => `<a class="ipo-a" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}${ico('ext', 'sm')}</a>`).join('');
  return a ? `<div class="ipo-links">${a}</div>` : '';
}

function rdNewsTbl(ns) {
  if (!ns.length) return RD_NONE;
  return `<table class="ipo-tbl rd-tbl-n"><thead><tr><th>날짜</th><th>기사</th><th>매체</th></tr></thead><tbody>${ns.map((n) => `<tr>
    <td>${esc(n.dt) || '–'}</td><td>${n.url ? `<a class="rd-link" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>` : esc(n.title)}</td><td>${esc(n.src)}</td></tr>`).join('')}</tbody></table>`;
}
const rdNewsBox = (ns) => rdBox('관련 기사', rdNewsTbl(ns), ns.length ? `${ns.length}건` : '');

/* 주요 손익: ipo.js 연락처 탭 표와 같은 모양(억 원, 숫자만 오른쪽 정렬). 연도는 자료에 있는 최근 3개 */
function rdPnl(fin, years) {
  const ys = years.slice(-3), cols = ys.map((y) => [y, ...fin.years[y].slice(0, 3).map(rdNum)]);
  if (!cols.some((c) => c.slice(1).some((v) => v != null))) return '';
  const n = (v) => (v == null ? '–' : v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const pct = (a, b) => (a == null || !b ? '–' : `${(a / b * 100).toFixed(1)}%`);
  const row = (k, f, cls = '') => `<tr class="${cls}"><td>${k}</td>${cols.map((c) => { const t = f(c); return `<td${t.startsWith('-') ? ' class="neg"' : ''}>${t}</td>`; }).join('')}</tr>`;
  return rdBox('주요 손익', `<table class="ipo-pnl"><thead><tr><th>억 원</th>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>
    ${row('매출액', (c) => n(c[1]))}
    ${row('영업이익', (c) => n(c[2]))}
    ${row('OPM', (c) => pct(c[2], c[1]), 'r')}
    ${row('당기순이익', (c) => n(c[3]))}
    ${row('NPM', (c) => pct(c[3], c[1]), 'r')}
    </tbody></table>`, esc([fin.basis, fin.src].map(rdStr).filter(Boolean).join(' · ')));
}

/* 펼친 행 머리: 요약 한 줄 + 컨택 상태 + 메모 + 작성자, 그리고 파이프라인(좁으면 요약 줄 오른쪽) */
function rdDhead(tab, x, sum) {
  const key = rdKey(tab, x.id), m = rdMark(key), st = rdSt(key);
  const off = x.guess ? ' disabled' : ''; // 분류 전 임시 카드는 컨택 상태·메모를 막는다
  return `<div class="ipo-dhead">
      ${sum ? `<p class="ipo-sum1">${esc(sum)}</p>` : '<p></p>'}
      <div class="ipo-acts"${x.guess ? ' title="분류가 끝난 뒤 남길 수 있습니다"' : ''}><div class="seg ipo-seg">${RD_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" aria-pressed="${s === st}" data-rd-st="${s}"${off}>${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-rd-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모"${off}>
        <span class="ipo-by">${esc(rdByText(m))}</span></div>${rdPipe(tab, x)}
    </div>`;
}

const RD_PIPE_SRC = { yesim: '예심청구', sell: '매각희망', bids: '입찰딜' };
// '있음' 링크의 data-pp-ref = 파이프라인 화면이 그 딜을 펼쳐 보여 줄 때 쓰는 ref. 분류 전 임시 카드는 올리기 버튼이 없다
function rdPipe(tab, x) {
  if (typeof pipeAdd !== 'function') return '';
  const ref = rdKey(tab, x.id);
  let has = false;
  try { has = typeof pipeHas === 'function' && !!pipeHas(ref); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(ref)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : x.guess ? '' : `<button type="button" class="btn sm rd-pipe" data-rd-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}

// 다시 그린 조각이 지금과 같으면 그대로 둔다 — WebKit은 화면 위쪽 밖에서 같은 것으로 갈아 끼워도 스크롤 자리를 밀어, 보기 링크로 맞춘 자리가 어긋난다.
// 다르면 바꾸되, 조각이 화면 위 가장자리보다 위에서 시작하면 그 행 아래 끝이 움직인 만큼 .scroll을 되돌려 보던 줄을 그대로 둔다('올리기' 버튼과 '있음' 링크는 높이가 다르다.
// 높이 차가 아니라 아래 끝 위치를 재므로, 스크롤 맨 아래에서 브라우저가 이미 당긴 만큼은 다시 빼지 않는다)
function rdSwap(el, html) {
  const t = document.createElement('template'); t.innerHTML = html.trim();
  const n = t.content.firstElementChild;
  if (n && n.isEqualNode(el)) return;
  const sc = el.closest('.scroll'), row = el.closest('.ipo-row');
  const above = sc && row && el.getBoundingClientRect().top < sc.getBoundingClientRect().top, b0 = above ? row.getBoundingClientRect().bottom : 0;
  if (n) el.replaceWith(n); else el.remove();
  const dy = above ? row.getBoundingClientRect().bottom - b0 : 0;
  if (Math.abs(dy) >= 0.5) sc.scrollTop += dy;
}

/* 행을 갈아 끼울 때 보던 자리를 지킨다 — .ipo-page는 브라우저 스크롤 고정을 꺼 두었으므로(ipo.css) 직접 맞춘다.
   기준 행은 key 행이 화면에 조금이라도 보이면 그 행, 아니면 머리가 화면 안에 있는 맨 위 행(없으면 화면 맨 위에 걸친 행).
   재는 자리는 기준 행 바로 위(앞에 보이는 형제의 아래 바깥 여백 끝, 없으면 자기 위 바깥 여백 끝)라, 기준 행 자신이 펼쳐지며 생기는 여백·테두리는 그대로 두고
   그 위에서 바뀐 높이만 .scroll로 되돌린다(위 행이 접혀도 보던 줄이 그대로). 바뀐 것이 없으면 scrollTop을 쓰지 않는다(하던 스크롤이 끊기지 않게) */
function rdHold(b, key, fn) {
  const sc = b && b.closest('.scroll'); if (!sc) return fn();
  const tb = document.querySelector('.tabbar'), t = sc.getBoundingClientRect().top, e = t + sc.clientHeight - (tb ? tb.offsetHeight : 0);
  const rows = [...b.querySelectorAll('.ipo-row[data-id]')], at = (r) => r.getBoundingClientRect(), k = key == null ? null : rows.find((r) => r.dataset.id === key);
  const pin = (k && at(k).bottom > t && at(k).top < e ? k : null) || rows.find((r) => at(r).top >= t && at(r).top < e) || rows.find((r) => at(r).top < t && at(r).bottom > t);
  if (!pin) return fn();
  const up = (r) => { let p = r.previousElementSibling; while (p && !p.getClientRects().length) p = p.previousElementSibling;
    return p ? at(p).bottom + (parseFloat(getComputedStyle(p).marginBottom) || 0) : at(r).top - (parseFloat(getComputedStyle(r).marginTop) || 0); };
  const id = pin.dataset.id, y0 = up(pin), out = fn();
  const now = [...b.querySelectorAll('.ipo-row[data-id]')].find((r) => r.dataset.id === id), dy = now ? up(now) - y0 : 0;
  if (Math.abs(dy) >= 0.5) sc.scrollTop += dy;
  return out;
}

// 펼친 행의 파이프라인 버튼만 다시 그린다(행을 통째로 다시 그리면 그사이 같은 행에 치던 메모가 사라진다). id가 없으면 펼친 행 전부
function rdPipeDraw(tab, id) {
  if (rdS.tab !== tab || !rdS.host || !rdS.host.isConnected) return;
  rdS.host.querySelectorAll('#rd-body .ipo-row.open[data-id]').forEach((r) => {
    if (id != null && r.dataset.id !== id) return;
    const x = rdFind(tab, r.dataset.id), p = r.querySelector('.ipo-dhead > .rd-pipe');
    if (x && p) rdSwap(p, rdPipe(tab, x)); // 화면 위에 걸치거나 위 밖이면 rdSwap이 그 행 아래 끝이 움직인 만큼 되돌린다
  });
}

async function rdPipeAdd(tab, btn) {
  const id = btn.closest('.ipo-row')?.dataset.id, x = id != null ? rdFind(tab, id) : null;
  if (!x || x.guess || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  try { await pipeAdd({ src: RD_PIPE_SRC[tab], ref: rdKey(tab, x.id), name: x.name }); }
  catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  rdPipeDraw(tab, x.id);
}

/* ---------- 예심청구 ---------- */
// 진행 칸: 상태 + (상장은 상장일, 결과가 났으면 결과일, 심사 중이면 청구 후 며칠째)
function rdYsProg(x) {
  const st = x.status, n = st === '심사중' && x.filed ? diffDays(today(), x.filed) + 1 : 0;
  const d = st === '상장' && x.listed ? x.listed : x.decided;
  return {
    label: rdYsLabel(st), cls: st === '승인' ? 'rd-ok' : st === '철회' || st === '미승인' ? 'rd-off' : '',
    sub: d ? rdMd(d) : n > 0 ? `${n}일째` : '',
  };
}

function rdYsList() {
  const s = rdS.yesim, d = s.data; if (!d) return [];
  const q = s.q.trim().toLowerCase();
  let list = d.items.filter((x) => !q || x.q.includes(q));
  if (s.f === 'review') list = list.filter((x) => x.status === '심사중');
  if (s.f === 'ok') list = list.filter((x) => x.status === '승인');
  if (s.f === 'drop') list = list.filter((x) => x.status === '철회' || x.status === '미승인');
  if (s.f === 'new') list = list.filter((x) => x.isNew);
  const byFiled = (a, b) => b.filed.localeCompare(a.filed) || a.name.localeCompare(b.name, 'ko');
  const by = {
    filed: byFiled,
    decided: (a, b) => b.decided.localeCompare(a.decided) || byFiled(a, b),
    rev: (a, b) => (b.rev ?? -1e15) - (a.rev ?? -1e15) || byFiled(a, b),
  }[s.sort] || byFiled;
  return list.sort(by);
}

const RD_YS_HEAD = '<div class="ipo-head ipo-cols"><div>청구일</div><div>회사</div><div>진행</div><div class="rd-c2">주관사</div><div class="rd-c2">최근 매출</div><div>대표전화</div><div class="rd-h-st">컨택 상태</div></div>';

function rdYsRow(x) {
  const open = rdS.yesim.open.has(x.id), st = rdSt(rdKey('yesim', x.id)), p = rdYsProg(x), br = rdSplit(x.broker);
  const f = x.fy ? x.fin.years[x.fy] : [];
  const mob = [esc(p.label), esc(p.sub), br.length ? rdNm(br[0]) : ''].filter(Boolean).join(' · ');
  // rd-alt = 카드가 좁아 주관사·최근 매출 칸을 접었을 때 남은 칸에 보이는 보조 줄
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div>${rdMd(x.filed) || RD_NA}<div class="ipo-sub">${esc(x.market)}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${rdNm(x.name)}</button><div class="ipo-sub">${esc(x.product || x.sector)}</div>${x.rev != null ? `<div class="ipo-sub rd-alt">매출 ${rdEok(x.rev)}</div>` : ''}${mob ? `<div class="rd-mob">${mob}</div>` : ''}</div>
      <div class="rd-mh">${p.label ? `<span class="${p.cls}">${esc(p.label)}</span>` : RD_NA}<div class="ipo-sub">${esc(p.sub)}</div>${br.length ? `<div class="ipo-sub rd-alt">${rdNm(br[0])}</div>` : ''}</div>
      <div class="rd-mh rd-c2">${br.length ? rdNm(br[0]) : RD_NA}<div class="ipo-sub">${br.slice(1).map(rdNm).join(', ')}</div></div>
      <div class="rd-mh rd-c2">${x.rev != null ? rdEok(x.rev) : RD_NA}<div class="ipo-sub rd-sub2">${x.fy ? `${esc(x.fy)} 영업이익 ${rdEok(f[1])}` : ''}</div></div>
      <div class="rd-mh">${x.phone ? esc(x.phone) : RD_NA}<div class="ipo-sub">${x.ceo ? `대표 ${rdNm(x.ceo)}` : ''}</div></div>
      <div class="ipo-c-st">${rdChip(st)}${rdChev()}</div>
    </div>${open ? rdYsDetail(x) : ''}</div>`;
}

function rdYsDetail(x) {
  const p = rdYsProg(x);
  const links = rdLinkRow([{ url: rdUrl(x.home), label: '홈페이지' }, { url: rdHttp(x.kindUrl) ? x.kindUrl : '', label: 'KIND' }, { url: rdHttp(x.dartUrl) ? x.dartUrl : '', label: 'DART 원문' }]);
  const contact = `${x.ceo ? `<div class="ipo-lead"><div class="ipo-lead-k">대표이사</div><div class="ipo-lead-v">${rdNm(x.ceo)}</div></div>` : ''}
      ${rdKv('대표전화', rdTel(x.phone))}${rdKv('주소', esc(x.addr))}${rdKv('주관사', rdNm(x.broker))}${rdKv('설립', esc(rdYmd(x.founded)))}${links}`;
  // 상장한 회사는 신규상장 탭에서 그 회사를 펼쳐 보여 준다(ipo.js data-ipo-go). 신규상장 자료를 이미 읽었으면 그 목록에 있는 회사만
  const ipoItems = typeof ipoState === 'object' && Array.isArray(ipoState.data?.items) ? ipoState.data.items : null;
  const toIpo = x.code && typeof renderIpo === 'function' && (!ipoItems || ipoItems.some((i) => i.code === x.code)) ? `<div class="ipo-links"><a class="ipo-a" href="#deals/ipo" data-ipo-go="${esc(x.code)}">신규상장에서 보기${ico('right', 'sm')}</a></div>` : '';
  const flow = `${rdKv('상태', esc(p.label))}${rdKv('청구일', esc(x.filed))}${rdKv('결과일', esc(x.decided))}${rdKv('상장일', esc(x.listed))}${rdKv('종목코드', esc(x.code))}
      ${rdKv('상태 변경', esc(x.changedAt))}${rdKv('상장 유형', esc(x.type))}${rdKv('시장', esc(x.market))}${rdKv('기술특례', esc(x.techSpecial))}${toIpo}`;
  const fi = x.holders.filter((h) => h.fi), fiPct = fi.filter((h) => h.pct != null);
  const fiSub = fi.length ? [`FI ${fi.length}곳`, fiPct.length ? rdPct(Math.round(fiPct.reduce((a, h) => a + h.pct, 0) * 100) / 100) : ''].filter(Boolean).join(' · ') : '';
  const holders = x.holders.length ? `<table class="ipo-tbl rd-tbl-h"><thead><tr><th>주주</th><th>지분율</th><th>구분</th></tr></thead><tbody>${x.holders.map((h) => `<tr><td>${rdNm(h.name)}</td><td>${h.pct != null ? rdPct(h.pct) : '–'}</td><td>${h.top ? '최대주주' : h.fi ? 'FI' : ''}</td></tr>`).join('')}</tbody></table>` : RD_NONE;
  return `<div class="ipo-detail">${rdDhead('yesim', x, [x.sector, x.product].filter(Boolean).join(' · '))}
    <div class="ipo-pane"><div class="ipo-stack">
      <div class="ipo-two-col">
        <div class="ipo-stack">${rdBox('컨택 포인트', contact.trim() ? contact : RD_NONE)}${rdBox('진행', flow.trim() ? flow : RD_NONE)}</div>
        <div class="ipo-stack">${x.fin ? rdPnl(x.fin, x.years) : ''}${rdBox('주주·FI', holders, fiSub)}</div>
      </div>
      ${rdNewsBox(x.news)}
    </div></div>
  </div>`;
}

/* 목록 아래: KIND 목록에 아직 없는 회사의 청구 전 신호(뉴스) */
function rdSignals() {
  const s = rdS.yesim, d = s.data;
  if (!d || !d.signals.length || !['all', 'new'].includes(s.f)) return '';
  const q = s.q.trim().toLowerCase(), d7 = ymd(addDays(new Date(), -7));
  const list = d.signals.filter((x) => (!q || x.q.includes(q)) && (s.f !== 'new' || (x.dt && x.dt >= d7)));
  const row = (x) => `<div class="ipo-row rd-static"><div class="ipo-line ipo-cols">
      <div>${rdMd(x.dt) || RD_NA}${x.kind ? `<div class="ipo-sub rd-mi rd-alt">${esc(x.kind)}</div>` : ''}${x.src ? `<div class="ipo-sub rd-mi">${esc(x.src)}</div>` : ''}</div>
      <div class="ipo-c-name"><span class="rd-strong">${rdNm(x.name) || RD_NA}</span></div>
      <div class="rd-mh rd-c2">${esc(x.kind) || RD_NA}</div>
      <div class="rd-span3">${x.url ? `<a class="rd-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>` : esc(x.title) || RD_NA}</div>
      <div class="rd-mh">${esc(x.src) || RD_NA}</div>
    </div></div>`;
  return `<section class="card ipo-card rd-card2"><div class="card-head"><h2>청구 전 신호 <span class="n">${list.length}</span></h2></div>
    ${list.length ? `<div class="ipo-head ipo-cols"><div>날짜</div><div>회사</div><div class="rd-c2">신호</div><div class="rd-span3">기사</div><div>매체</div></div>${list.map(row).join('')}` : '<div class="empty">조건에 맞는 신호가 없습니다.</div>'}</section>`;
}

/* ---------- 매각희망 ---------- */
function rdSellList() {
  const s = rdS.sell, d = s.data; if (!d) return [];
  const q = s.q.trim().toLowerCase();
  let list = d.items.filter((x) => !q || x.q.includes(q));
  if (s.f !== 'all') list = list.filter((x) => x.kind === s.f);
  const near = (a, b) => Math.abs(a.dd ?? 1e9) - Math.abs(b.dd ?? 1e9) || b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'ko');
  const by = {
    near,
    pct: (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || near(a, b),
    name: (a, b) => a.name.localeCompare(b.name, 'ko') || near(a, b),
  }[s.sort] || near;
  return list.sort(by);
}

const RD_SELL_HEAD = '<div class="ipo-head ipo-cols"><div>날짜</div><div>회사</div><div>신호</div><div>매도 후보</div><div class="rd-c2">근거</div><div class="rd-c2">지분율</div><div class="rd-h-st">컨택 상태</div></div>';

// 날짜 보조 줄: 만기는 지난 만기도 기간 제한 없이 n일 지남(만기 임박 조합과 같은 기준)
// 펼친 행 날짜 + D-day: 사이에 줄바꿈 자리(<wbr>)를 두고 간격 8은 날짜 쪽 오른쪽 여백으로 — 칸이 좁으면 D-day만 한 덩어리로 다음 줄 첫머리에(radar.css .rd-dt·.rd-dd)
const rdDateDd = (d, dd) => (dd ? `<span class="rd-dt">${esc(d)}</span><wbr><span class="rd-dd">${dd}</span>` : esc(d));
const rdSellDd = (x) => (x.kind === '만기' ? rdExp(x.date) : rdDday(x.date));

function rdSellRow(x) {
  const open = rdS.sell.open.has(x.id), st = rdSt(rdKey('sell', x.id)), pct = rdPct(x.pct);
  // 매도 후보에 운용사 이름(' · '로 이어 쓴 각각)이 모두 들어 있으면('조합명 (운용사)') 보조 줄에 다시 쓰지 않는다
  const gp = x.fund?.gp && !x.fund.gp.split(/\s+·\s+/).every((g) => x.seller.includes(g.trim())) ? x.fund.gp : '';
  // 폰 한 줄: 지분율을 긴 매도 후보보다 앞에 둔다. 매도 후보에 없는 운용사는 '조합명 (운용사)'로 붙인다
  const mob = [esc(x.kind), esc(pct), gp ? (x.seller ? `${rdNm(x.seller)} (${rdNm(gp)})` : rdNm(gp)) : rdNm(x.seller)].filter(Boolean).join(' · ');
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div>${rdMd(x.date) || RD_NA}<div class="ipo-sub">${rdSellDd(x)}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${rdNm(x.name)}</button><div class="ipo-sub">${esc(x.code)}</div>${mob ? `<div class="rd-mob">${mob}</div>` : ''}</div>
      <div class="rd-mh">${esc(x.kind) || RD_NA}${pct ? `<div class="ipo-sub rd-alt">${esc(pct)}</div>` : ''}</div>
      <div class="rd-mh">${rdClamp(x.seller, rdNm)}<div class="ipo-sub">${rdNm(gp)}</div></div>
      <div class="rd-mh rd-c2">${rdClamp(x.detail)}</div>
      <div class="rd-mh rd-c2">${rdPct(x.pct) || RD_NA}</div>
      <div class="ipo-c-st">${rdChip(st)}${rdChev()}</div>
    </div>${open ? rdSellDetail(x) : ''}</div>`;
}

function rdSellDetail(x) {
  const f = x.fund, dd = rdSellDd(x);
  const ev = `${rdKv('신호', esc(x.kind))}${rdKv('날짜', x.date ? rdDateDd(x.date, dd) : '')}
      ${rdKv('매도 후보', rdNm(x.seller))}${rdKv('지분율', esc(rdPct(x.pct)))}${rdKv('종목코드', esc(x.code))}${rdLinkRow(x.links)}`;
  const fdd = f ? rdExp(f.expiry) : '';
  const fb = f ? `${rdKv('조합명', rdNm(f.name))}${rdKv('운용사', rdNm(f.gp))}${rdKv('결성일', esc(rdYmd(f.formed)))}${rdKv('만기일', f.expiry ? rdDateDd(rdYmd(f.expiry), fdd) : '')}${rdKv('결성액', esc(f.size))}` : '';
  const base = rdBox('근거', ev.trim() ? ev : RD_NONE);
  return `<div class="ipo-detail">${rdDhead('sell', x, x.detail)}
    <div class="ipo-pane"><div class="ipo-stack">
      ${fb ? `<div class="ipo-two-col">${base}${rdBox('조합', fb)}</div>` : base}
      ${rdNewsBox(x.news)}
    </div></div>
  </div>`;
}

/* 목록 아래: 만기 2년 안 조합(참고). 전체·만기 보기에서만 */
function rdFunds() {
  const s = rdS.sell, d = s.data;
  if (!d || !d.funds.length || !['all', '만기'].includes(s.f)) return '';
  const q = s.q.trim().toLowerCase(), list = d.funds.filter((x) => !q || x.q.includes(q));
  const row = (x) => {
    const mob = [rdNm(x.gp), esc(x.size), esc(x.src)].filter(Boolean).join(' · ');
    const src = x.src || (x.url ? rdHost(x.url) : '');
    const sub = [x.stage, x.companies.length ? `보유 ${x.companies.join(', ')}` : ''].filter(Boolean).join(' · ');
    const subH = [esc(x.stage), x.companies.length ? `보유 ${x.companies.map(rdNm).join(', ')}` : ''].filter(Boolean).join(' · '); // 보이는 글(이름 칸 <wbr>), title은 sub 그대로
    return `<div class="ipo-row rd-static"><div class="ipo-line ipo-cols rd-g6">
      <div>${rdMd(x.expiry) || esc(x.expiry) || RD_NA}<div class="ipo-sub">${rdExp(x.expiry)}</div>${x.formed ? `<div class="ipo-sub rd-mi">결성 ${esc(rdMd(x.formed) || x.formed)}</div>` : ''}</div>
      <div class="ipo-c-name"><span class="rd-strong">${rdNm(x.name)}</span>${sub ? `<div class="ipo-sub" title="${esc(sub)}">${subH}</div>` : ''}${mob ? `<div class="rd-mob">${mob}</div>` : ''}</div>
      <div class="rd-mh">${rdNm(x.gp) || RD_NA}</div>
      <div class="rd-mh rd-c2">${esc(rdMd(x.formed) || x.formed) || RD_NA}</div>
      <div class="rd-mh">${esc(x.size) || RD_NA}${x.formed ? `<div class="ipo-sub rd-alt">결성 ${esc(rdMd(x.formed) || x.formed)}</div>` : ''}</div>
      <div class="rd-mh rd-c2">${!src ? RD_NA : x.url ? `<a class="rd-link rd-clamp" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(src)}</a>` : `<div class="rd-clamp">${esc(src)}</div>`}</div>
    </div></div>`;
  };
  return `<section class="card ipo-card rd-card2"><div class="card-head"><h2>만기 임박 조합 <span class="n">${list.length}</span></h2></div>
    ${list.length ? `<div class="ipo-head ipo-cols rd-g6"><div>만기일</div><div>조합</div><div>운용사</div><div class="rd-c2">결성일</div><div>결성액</div><div class="rd-c2">출처</div></div>${list.map(row).join('')}` : '<div class="empty">조건에 맞는 조합이 없습니다.</div>'}</section>`;
}

/* ---------- 입찰딜 ---------- */
function rdBidsList() {
  const s = rdS.bids, d = s.data; if (!d) return [];
  const q = s.q.trim().toLowerCase();
  return d.items.filter((x) => (!q || x.q.includes(q)) && (!s.fit || x.fit === s.fit) && (!s.stage || x.stage === s.stage))
    .sort((a, b) => b.last.localeCompare(a.last) || RD_FITS.indexOf(a.fit) - RD_FITS.indexOf(b.fit) || a.name.localeCompare(b.name, 'ko'));
}

const RD_BIDS_HEAD = '<div class="ipo-head ipo-cols"><div>최근일</div><div>대상</div><div>단계</div><div class="rd-c2">매도자</div><div>자문사</div><div class="rd-c2">규모</div><div class="rd-h-st">컨택 상태</div></div>';

// go = 자문사별 보기의 행(누르면 딜별 보기에서 그 딜을 펼친다)
function rdBidsRow(x, go) {
  const open = !go && rdS.bids.open.has(x.id), st = rdSt(rdKey('bids', x.id)), adv = rdSplit(x.advisor);
  const mob = [esc(x.stage), x.fit ? `적합도 ${esc(x.fit)}` : '', rdNm(x.seller)].filter(Boolean).join(' · ');
  const fit = x.fit ? `<span class="${x.fit === '상' ? 'rd-ok' : ''}">적합도 ${esc(x.fit)}</span>` : '';
  const alt = [fit, esc(x.size)].filter(Boolean).join(' · '); // 카드가 좁아 매도자·규모 칸을 접었을 때 단계 칸 보조 줄
  return `<div class="ipo-row${open ? ' open' : ''}" ${go ? 'data-rd-go' : 'data-id'}="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div>${rdMd(x.last) || RD_NA}<div class="ipo-sub">${esc(x.src.join('·'))}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl"${go ? '' : ` aria-expanded="${open}"`}>${rdNm(x.name)}</button><div class="ipo-sub">${esc(x.sector)}</div>${x.seller ? `<div class="ipo-sub rd-alt">매도자 ${rdNm(x.seller)}</div>` : ''}${mob ? `<div class="rd-mob">${mob}</div>` : ''}</div>
      <div class="rd-mh">${esc(x.stage) || RD_NA}<div class="ipo-sub">${esc(x.schedule)}</div>${alt ? `<div class="ipo-sub rd-alt">${alt}</div>` : ''}</div>
      <div class="rd-mh rd-c2">${rdClamp(x.seller, rdNm)}</div>
      <div class="rd-mh">${adv.length ? rdNm(adv[0]) : RD_NA}<div class="ipo-sub">${adv.slice(1).map(rdNm).join(', ')}</div></div>
      <div class="rd-mh rd-c2">${esc(x.size) || RD_NA}<div class="ipo-sub">${fit}</div></div>
      <div class="ipo-c-st">${rdChip(st)}${rdChev()}</div>
    </div>${open ? rdBidsDetail(x) : ''}</div>`;
}

function rdBidsDetail(x) {
  const ov = `${rdKv('매도자', rdNm(x.seller))}${rdKv('자문사', rdNm(x.advisor))}${rdKv('인수 후보', x.bidders.map(rdNm).join(', '))}${rdKv('단계', esc(x.stage))}${rdKv('일정', esc(x.schedule))}
      ${rdKv('규모', esc(x.size))}${rdKv('업종', esc(x.sector))}${rdKv('적합도', esc(x.fit))}`;
  const src = `${rdKv('출처', esc(x.src.join(' · ')))}${rdKv('처음 포착', esc(x.first))}${rdKv('최근 소식', esc(x.last))}${rdLinkRow(x.links)}`;
  const base = rdBox('딜 개요', ov.trim() ? ov : RD_NONE);
  return `<div class="ipo-detail">${rdDhead('bids', x, x.summary)}
    <div class="ipo-pane"><div class="ipo-stack">
      ${src.trim() ? `<div class="ipo-two-col">${base}${rdBox('출처', src)}</div>` : base}
      ${rdNewsBox(x.news)}
    </div></div>
  </div>`;
}

function rdAdvBody(list) {
  const groups = rdS.bids.data.advisors.map((a) => { const ids = new Set(a.ids); return { name: a.name, items: list.filter((x) => ids.has(x.id)) }; })
    .filter((g) => g.items.length).sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'ko'));
  if (!groups.length) return '<div class="empty">조건에 맞는 자문사가 없습니다.</div>';
  return RD_BIDS_HEAD + groups.map((g) => `<div class="rd-grp"><b>${rdNm(g.name)}</b><span>${g.items.length}건</span></div>${g.items.map((x) => rdBidsRow(x, true)).join('')}`).join('');
}

// 단계 선택지: 자료에 있는 단계만, 정해 둔 순서대로
function rdStageOpts() {
  const have = new Set((rdS.bids.data?.items || []).map((x) => x.stage).filter(Boolean));
  return [['', '단계 전체'], ...RD_STAGES.filter((k) => have.has(k)), ...[...have].filter((k) => !RD_STAGES.includes(k)).sort()].map((k) => (Array.isArray(k) ? k : [k, k]));
}

/* ---------- 그리기 ---------- */
const RD_LIST = { yesim: rdYsList, sell: rdSellList, bids: rdBidsList };
const RD_ROW = { yesim: rdYsRow, sell: rdSellRow, bids: (x) => rdBidsRow(x, false) };
const RD_HEAD = { yesim: RD_YS_HEAD, sell: RD_SELL_HEAD, bids: RD_BIDS_HEAD };
const rdRowEl = (root, id) => [...root.querySelectorAll('.ipo-row[data-id]')].find((r) => r.dataset.id === id);

function rdSummary(tab) {
  const d = rdS[tab].data; if (!d) return '';
  const g = d.generated ? new Date(d.generated) : null, ok = g && !isNaN(g), it = d.items;
  const gl = ok ? `${ymd(g) === today() ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집` : '';
  const n = (f) => it.filter(f).length;
  const parts = {
    yesim: () => [['심사 중', n((x) => x.status === '심사중')], ['승인', n((x) => x.status === '승인')], ['새 소식', n((x) => x.isNew)]],
    sell: () => RD_KINDS.map((k) => [k, n((x) => x.kind === k)]),
    bids: () => [['적합도 상', n((x) => x.fit === '상')], ['자문사', d.advisors.length]],
  }[tab]();
  const done = n((x) => rdSt(rdKey(tab, x.id)) !== '미접촉');
  // 실패한 출처만 이름으로. 분류(Claude 단계)는 출처가 아니라 뺀다(sheets.py와 같은 기준), '출처 · 운용사' 같은 세부 출처는 앞 이름으로 묶고, 실패 원문은 싣지 않는다
  const fails = d.sources && typeof d.sources === 'object'
    ? [...new Set(Object.entries(d.sources).filter(([k, v]) => k !== '분류' && /^실패/.test(rdStr(v))).map(([k]) => k.split(' · ')[0]))] : [];
  return `${gl ? `<span class="${ok && Date.now() - g > 36 * 3600000 ? 'ipo-stale' : ''}">${gl}</span>` : ''}<span>${it.length}${RD_TAB[tab].unit}</span>`
    + `${parts.map(([l, v]) => `<span>${l} <b>${v}</b></span>`).join('')}<span>컨택 <b>${done}</b></span>`
    + fails.map((k) => `<span class="ipo-stale">${esc(k)} 실패</span>`).join('');
}

function rdSumDraw() {
  const el = rdS.host && rdS.tab && rdS.host.querySelector('#rd-sum');
  if (el) el.innerHTML = rdSummary(rdS.tab);
}

function rdBody(tab) {
  const s = rdS[tab];
  if (!s.data) return `<div class="empty">아직 수집된 ${RD_TAB[tab].label} 데이터가 없습니다.</div>`;
  const list = RD_LIST[tab]();
  if (tab === 'bids' && s.view === 'adv') return rdAdvBody(list);
  if (!list.length) return `<div class="empty">조건에 맞는 ${tab === 'yesim' ? '회사가' : tab === 'sell' ? '신호가' : '딜이'} 없습니다.</div>`;
  return RD_HEAD[tab] + list.map(RD_ROW[tab]).join('');
}

/* 다시 그릴 때(다른 분 저장 합치기·저장 실패 되돌리기 등) 쓰고 있던 메모 칸을 지킨다 — ipo.js ipoDraw와 같은 방식.
   그 행이 목록에서 빠져 되살릴 칸이 없으면 쓰던 메모를 저장한다(Safari·Firefox는 칸이 지워질 때 change를 내지 않는다).
   다시 그리는 동안(rdDrawing) 빠지는 칸의 change·focusout(Chromium은 이때도 낸다)으로는 저장하지 않는다 — 쓰던 값은 되살린 칸에 남고,
   저장이 계속 실패할 때 되돌림 → 다시 그리기 → 저장 → 실패가 끝없이 돌지 않게 */
let rdDrawing = false;
function rdKeepNote(scope) {
  const ae = document.activeElement;
  return ae && ae.matches && ae.matches('[data-rd-note]') && scope.contains(ae) ? { id: ae.closest('.ipo-row')?.dataset.id, v: ae.value, a: ae.selectionStart, z: ae.selectionEnd } : null;
}
function rdKeepBack(tab, keep) {
  if (!keep || keep.id == null) return;
  const i = rdRowEl(rdS.host, keep.id)?.querySelector('[data-rd-note]');
  if (!i) { rdSetNote(tab, keep.id, keep.v); return; }
  i.value = keep.v; i.focus({ preventScroll: true });
  try { i.setSelectionRange(keep.a, keep.z); } catch { /* 커서 위치는 못 지켜도 됨 */ }
}

/* 메모 칸에서 한글을 조합하는 중(compositionstart~compositionend)에 칸을 갈아 끼우면 글자는 남아도 조합이 끊긴다.
   그 칸을 지우는 다시 그리기는 조합이 끝난 뒤로 미룬다(같은 일은 한 번만) */
const rdIme = { el: null, todo: new Map() };
function rdImeWait(scope, key, fn) {
  const el = rdIme.el;
  if (!el || !el.isConnected || document.activeElement !== el || !scope.contains(el)) return false;
  rdIme.todo.set(key, fn);
  return true;
}
function rdImeDone() {
  rdIme.el = null;
  setTimeout(() => { // 조합이 마무리된 뒤에. 그사이 다음 글자 조합이 시작됐으면 그것이 끝날 때
    if (rdIme.el) return;
    const todo = [...rdIme.todo.values()]; rdIme.todo.clear();
    todo.forEach((f) => f());
  });
}

/* 보기 링크로 펼친 행을 보여 줄 때: 행이 보이는 높이(스크롤 칸에서 폰 아래 탭 막대를 뺀 높이)에 다 들어가면 행 전체를 가운데에,
   길면 머리 줄이 맨 위(8 띄움)에 오게 — ipo.js ipoReveal·pipeline.js ppReveal과 같은 방식 */
function rdReveal(r) {
  const sc = r.closest('.scroll');
  if (!sc) { r.scrollIntoView({ block: r.offsetHeight <= innerHeight ? 'center' : 'start' }); return; }
  const tb = document.querySelector('.tabbar'), vis = sc.clientHeight - (tb ? tb.offsetHeight : 0), h = r.offsetHeight;
  const top = r.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  sc.scrollTop = h <= vis ? top - (vis - h) / 2 : top - 8;
}

function rdDraw() {
  const tab = rdS.tab, host = rdS.host;
  if (!tab || !host || !host.isConnected) return;
  const b = host.querySelector('#rd-body'); if (!b) return;
  if (rdImeWait(b, 'draw', rdDraw)) return;
  const s = rdS[tab];
  const keep = rdKeepNote(b);
  if (tab === 'bids') {
    const sel = host.querySelector('#rd-stage'), opts = rdStageOpts();
    if (s.stage && !opts.some(([k]) => k === s.stage)) s.stage = '';
    if (sel) { sel.innerHTML = opts.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join(''); sel.value = s.stage; }
  }
  rdDrawing = true;
  try {
    b.innerHTML = rdBody(tab);
    const ex = host.querySelector('#rd-extra');
    if (ex) ex.innerHTML = tab === 'yesim' ? rdSignals() : tab === 'sell' ? rdFunds() : '';
  } finally { rdDrawing = false; }
  rdSumDraw();
  rdKeepBack(tab, keep);
  if (s.focus != null) {
    const r = rdRowEl(b, s.focus);
    s.focus = null;
    if (r) rdReveal(r);
  }
}

function rdRefreshRow(tab, id) {
  const x = rdFind(tab, id);
  if (!x || rdS.tab !== tab || !rdS.host || !rdS.host.isConnected) return;
  const b = rdS.host.querySelector('#rd-body'), r = b && rdRowEl(b, id); if (!r) return;
  if (rdImeWait(r, `row:${id}`, () => rdRefreshRow(tab, id))) return;
  const keep = rdKeepNote(r);
  rdDrawing = true;
  try { rdHold(b, id, () => { r.outerHTML = RD_ROW[tab](x); }); } finally { rdDrawing = false; }
  rdKeepBack(tab, keep);
}

function rdFilterHtml(tab) {
  const s = rdS[tab];
  const search = (ph) => `<div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="rd-q" type="search" placeholder="${ph}" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>`;
  const seg = (attr, opts, cur) => `<div class="seg">${opts.map(([k, l]) => `<button type="button" data-${attr}="${esc(k)}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('')}</div>`;
  const sel = (id, label, opts, cur) => `<select class="select" id="${id}" aria-label="${label}">${opts.map(([k, l]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (tab === 'yesim') return search('회사·업종·주관사·주주 검색') + seg('rd-f', RD_YS_F, s.f) + sel('rd-sort', '정렬', RD_YS_SORT, s.sort);
  if (tab === 'sell') return search('회사·매도 후보·조합 검색') + seg('rd-f', [['all', '전체'], ...RD_KINDS.map((k) => [k, k])], s.f) + sel('rd-sort', '정렬', RD_SELL_SORT, s.sort);
  return search('대상·매도자·자문사 검색') + seg('rd-view', [['deal', '딜별'], ['adv', '자문사별']], s.view)
    + sel('rd-fit', '적합도', [['', '적합도 전체'], ...RD_FITS.map((k) => [k, `적합도 ${k}`])], s.fit) + sel('rd-stage', '단계', rdStageOpts(), s.stage);
}

function rdBind(root, tab) {
  const s = rdS[tab];
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const fb = t.closest('[data-rd-f]');
    if (fb) { s.f = fb.dataset.rdF; segOn('[data-rd-f]', fb); rdDraw(); return; }
    const vb = t.closest('[data-rd-view]');
    if (vb) { if (s.view !== vb.dataset.rdView) { s.view = vb.dataset.rdView; segOn('[data-rd-view]', vb); rdDraw(); } return; }
    if (t.closest('#rd-ref')) {
      rdLoad(tab, true).then(rdDraw).catch((e) => toast(e.message));
      if (typeof pipeLoad === 'function') pipeLoad(true).then(() => rdPipeDraw(tab)).catch(() => {}); // 다른 분이 그사이 올린 딜도 '있음'으로
      return;
    }
    const xb = t.closest('#rd-xlsx');
    if (xb) { if (typeof ipoDownload === 'function') ipoDownload(xb); return; }
    const sb = t.closest('[data-rd-st]');
    if (sb) { rdSetStatus(tab, sb.closest('.ipo-row').dataset.id, sb.dataset.rdSt); return; }
    const pb = t.closest('[data-rd-pipe]');
    if (pb) { rdPipeAdd(tab, pb); return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const go = t.closest('[data-rd-go]');
    if (go) { // 자문사별 → 딜별 보기에서 그 딜을 펼쳐 보여 준다
      const id = go.dataset.rdGo;
      s.view = 'deal'; s.open.add(id); s.focus = id;
      segOn('[data-rd-view]', root.querySelector('[data-rd-view="deal"]'));
      rdDraw(); return;
    }
    const row = t.closest('.ipo-row[data-id]');
    if (row) {
      const id = row.dataset.id;
      if (s.open.has(id)) s.open.delete(id); else s.open.add(id);
      rdRefreshRow(tab, id);
    }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'rd-q') { s.q = ev.target.value; rdDraw(); } });
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'rd-sort') { s.sort = t.value; rdDraw(); }
    if (t.id === 'rd-fit') { s.fit = t.value; rdDraw(); }
    if (t.id === 'rd-stage') { s.stage = t.value; rdDraw(); }
    if (t.matches('[data-rd-note]') && !rdDrawing) rdSetNote(tab, t.closest('.ipo-row').dataset.id, t.value);
  });
  // 메모를 쓰다가 다른 분 저장으로 칸이 다시 그려졌으면 change가 안 올 수 있어 칸을 떠날 때도 저장한다
  root.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!t.matches || !t.matches('[data-rd-note]') || !t.isConnected) return;
    if (rdIme.el === t) rdImeDone(); // 조합을 마치지 않고 떠나도 미룬 다시 그리기는 한다
    if (!rdDrawing) rdSetNote(tab, t.closest('.ipo-row').dataset.id, t.value);
    if (rdS.field?.el === t) rdS.field = null;
  });
  root.addEventListener('focusin', (ev) => { if (ev.target.matches?.('[data-rd-note]')) rdS.field = { el: ev.target, tab }; });
  root.addEventListener('compositionstart', (ev) => { if (ev.target.matches?.('[data-rd-note]')) rdIme.el = ev.target; });
  root.addEventListener('compositionend', (ev) => { if (rdIme.el === ev.target) rdImeDone(); });
}

// 메모 칸을 떠나지 않은 채 뒤로 가기·주소 이동으로 옮기거나 앱을 내릴 때도 쓰던 메모를 저장한다(pipeline.js ppFlush와 같은 방식).
// Safari·Firefox는 칸이 사라질 때 focusout을 내지 않고, app.js가 hashchange에서 먼저 화면을 갈아 끼워 rdS.tab도 바뀌어 있으므로 focusin 때 기억한 칸·탭을 쓴다
function rdFlush(leave) {
  const f = rdS.field; if (!f) return;
  if (leave || !f.el.isConnected) rdS.field = null; // 사라진 칸은 한 번만 저장
  const id = f.el.closest('.ipo-row')?.dataset.id;
  if (id != null) rdSetNote(f.tab, id, f.el.value);
}
window.addEventListener('hashchange', () => rdFlush(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) rdFlush(false); });

async function rdRender(tab, host) {
  rdS.host = host; rdS.tab = tab;
  rdIme.el = null; rdIme.todo.clear(); // 화면을 새로 그리므로 미뤄 둔 다시 그리기는 버린다
  host.innerHTML = `<div class="ipo-page rd-page rd-${tab}" id="rd-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="rd-sum"></div>
      ${typeof ipoDownload === 'function' ? `<button class="btn ghost" type="button" id="rd-xlsx">${ico('file', 'sm')}엑셀 다운로드</button>` : ''}
      <button class="btn ghost" type="button" id="rd-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div class="ipo-filter">${rdFilterHtml(tab)}</div>
      <div class="ipo-body" id="rd-body"><div class="empty">불러오는 중…</div></div>
    </section>
    <div id="rd-extra"></div></div>`;
  rdBind(host.querySelector('#rd-root'), tab);
  try { await rdLoad(tab); }
  catch (e) {
    const b = rdS.host === host && rdS.tab === tab && host.querySelector('#rd-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (rdS.host === host && rdS.tab === tab && host.isConnected) rdDraw();
  // '파이프라인에 있음' 표시가 처음부터 맞게 미리 읽고, 다 읽으면 펼친 행의 버튼만 다시 그림(ipo.js와 같이)
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (rdS.host === host && rdS.tab === tab) rdPipeDraw(tab); }).catch(() => {});
}

function renderYesim(host) { return rdRender('yesim', host); }
function renderSell(host) { return rdRender('sell', host); }
function renderBids(host) { return rdRender('bids', host); }

/* 다른 화면(파이프라인 등)에서 ref('yesim:<id>' 등)로 한 건을 펼쳐 보여 줄 때: 탭 열기 전에 부르고 돌려준 주소로 이동 */
function radarFocus(ref) {
  const m = /^(yesim|sell|bids):(.+)$/.exec(String(ref || ''));
  if (!m) return '';
  const s = rdS[m[1]];
  s.q = ''; // 검색·필터에 걸려 목록에서 빠져 있으면 펼칠 수 없으므로 풀어 둔다
  if (m[1] === 'bids') { s.view = 'deal'; s.fit = ''; s.stage = ''; } else s.f = 'all';
  s.open.add(m[2]); s.focus = m[2];
  return `#deals/${m[1]}`;
}
