/* UNIVERSE WORKS — 우주·방산 테마 태그와 딜소싱 › 타깃 › 우주·방산 후보(#deals/space) (2026-11-25)
   기준: 05. 딜소싱\03. 섹터 리서치\우주·방산 (2026-11-25)\우주·방산 리서치 노트.md 4장(판정 순서, 업종 코드, 포함어, 제외어와 함정).
   업종 칸(sector 등)은 그대로 두고 태그만 따로 붙인다. 화면마다 spTag({...})를 불러 '우주·방산'·'이해상충 확인' 표시와 공용 필터(filt.js '테마' 묶음)에 쓴다.
   판정 순서
   ① 후보 207곳(data/space_cands.json) 이름과 같은 회사 ② 수집기 태그(rounds.json tags, Claude 분류) 또는 업종 '방산·항공우주'
   ③ 강한 업종 코드(항공기, 무인기, 항공기 부품, 무기 및 총포탄, 전투용 차량, 레이더) ④ 설명 칸의 강한 포함어
   ⑤ 약한 업종 코드나 약한 말(안테나, RF, GaN, 커넥터, 복합재 등)은 같은 글에 문맥어(군, 방산, 위성, 체계업체 이름 등)가 있을 때만
   ⑥ 조합 이름에 우주·스페이스·방산·국방(구주 매물)
   함정 말(방산시장, 위성방송, 로켓배송, 무기화학, '투자 레이더' 연재명, 차량 레이더, 드론 라이트쇼 등)은 먼저 지우고 본다. 회사 이름의 '스페이스'만으로는 붙이지 않는다.
   이해상충 확인: 후보 엑셀의 이해상충 칸이 '겹침'인 회사(자료 coi·coiWith). 저장소가 공개라 회사 이름과 관계는 코드에 두지 않고 자료 파일에만 둔다.
   후보 탭: 엑셀(우주·방산 후보 기업 (2026-11-25).xlsx)을 딜레이더 space_cands.py가 JSON으로 바꿔 올린다. 이 화면은 읽기만.
   팩트시트·관심(☆)은 ref space:<이름>(fs_req.py ANGLES 'space:'). ipo.css·radar.css·filt.css 클래스를 쓰고 새것만 space.css. */

const SP_TAG = '우주·방산';
const SP_FILE = 'data/space_cands.json';
const SP_TTL = 30 * 60000;

/* ---------- 태그 규칙 ---------- */
const spNorm = (s) => String(s || '').replace(/_/g, ',').replace(/\s+/g, ' ').trim(); // 금융위 업종명 '레이더_ 항행용' → '레이더, 항행용'
const spCo = (s) => String(s || '').replace(/\(주\)|㈜|주식회사/g, '').replace(/[\s·.,\-()[\]&]/g, '').toLowerCase();
const SP_IND_OUT = /위성 및 기타 방송업|무선 및 위성 통신업|항공 ?(여객|화물)? ?운송|항공 화물|무기 ?(화학|안료)|무기질/;
const SP_IND_STRONG = /항공기, ?우주선|유인 항공기|항공우주선|무인 항공기|무인 비행장치|항공기용 엔진|항공기용 부품|항공기 부품|무기 및 총포탄|전투용 차량|레이더, ?항행용/;
const SP_IND_WEAK = /무선 통신장비|방송장비|유선 통신장비|전자코일|변성기|그 외 기타 전자부품|측정|시험기|광학|통신.{0,3}방송 ?장비 도매|특수 ?목적용 기계/;
const SP_TRAP = new RegExp([
  '방산시장', '방산동', '위성\\s?방송', '셋톱박스', '위성\\s?TV', '위성\\s?도시', '위성\\s?사무실', '로켓\\s?(배송|펀치|그로스)', '무기\\s?(화학|안료|질|물)',
  '(투자|스타트업|벤처|딜|IPO|증시|공모주|VC|창업)\\s?레이더', '드론\\s?(라이트\\s?)?쇼', '(코딩|교육용|촬영)\\s?드론', '드론\\s?(촬영|교육)',
  '(차량|자율주행|자동차|모빌리티)\\s?(용\\s?)?(4D\\s?)?(이미징\\s?)?레이더', 'RFID', 'RF\\s?(미용|리프팅)', 'GaN\\s?충전', '탄소\\s?(중립|배출)', '(사업|상장|투자|IPO)\\s?추진',
  '항공권', '항공사', '파일\\s?탐색기', '전자파\\s?흡수율', '전차선', '전기\\s?추진\\s?(선|선박|여객선|어선)', '유럽우주국',
].join('|'), 'gi');
const SP_STRONG = new RegExp([
  '인공위성', '초소형\\s?위성', '소형\\s?위성', '큐브\\s?위성', '큐브샛', '위성\\s?(본체|버스|영상|통신|안테나|데이터|관제|탑재|발사|개발|제조)', '탑재체', '우주\\s?항공', '항공\\s?우주',
  '우주\\s?(부품|산업|발사|탐사|환경|용|급)', '뉴스페이스', '발사체', '누리호', '지상국', '저궤도', '궤도\\s?수송', '로켓\\s?엔진', '터보\\s?펌프',
  '방산', '방위\\s?(산업|사업청)', '국방', '군용', '군수', '유도\\s?무기', '유도탄', '미사일', '전자전(?!문|시|자)', 'AESA', '위상\\s?배열',
  '무인기(?!기|계|점)', '\\bUAV\\b', 'eVTOL', '\\bUAM\\b', '도심\\s?항공', '항공기\\s?(용\\s?)?(부품|구조|엔진)', '기체\\s?구조물', '탄약', '총포',
  '국방과학연구소', '한화에어로스페이스', '한화시스템', 'LIG\\s?(넥스원|디펜스)', '한국항공우주', '현대로템', '천궁', 'L-SAM', 'KF-21', '레드백', 'KDDX', 'K2\\s?전차', 'K9\\s?자주포',
  '대\\s?드론', '안티\\s?드론', '자폭\\s?드론', '배회형\\s?탄약', '군집\\s?드론', '드론\\s?탐지', '전술\\s?(통신|데이터링크)', 'Link-16', '사격\\s?통제', '전투\\s?체계', 'C4I',
  '항전\\s?장비', '레이돔', '재머', '합성\\s?개구\\s?레이더', 'SAR\\s?위성', '홀\\s?추력기', '열전지', '관성\\s?항법', '지구\\s?관측', 'GEOINT', '원격\\s?탐사',
  '잠수함', '전투기', '전차', '자주포', '군\\s?(위성|통신)', '육군', '해군', '공군', '국군', '해병',
].join('|'), 'i');
const SP_WEAK = /안테나|\bRF\b|GaN|질화갈륨|커넥터|복합재|CFRP|탄소섬유|전원\s?(장치|공급)|자이로|드론|레이더|시뮬레이터|정밀\s?(가공|주조)|초분광|마이크로파|도파관|EO\/IR|열상|적외선|GNSS|GPS|\bIMU\b|\bSAR\b|항공|전기\s?추진|탐색기|무기/gi;
const SP_CTX = /위성|우주|방산|국방|군용|군수|군사|육군|해군|공군|국군|해병|레이더|항공기|무인기|미사일|무기|전투|체계\s?업체|한화|LIG|KAI|한국항공우주|현대로템|풍산|방위|발사체/i;
const SP_FUND = /우주|스페이스|space|방산|국방|디펜스|defen[cs]e|에어로/i;

// 글 하나: 강한 말이 있으면 바로, 약한 말은 그 말을 뺀 나머지에 문맥어가 있을 때만
function spText(t) {
  const s = spNorm(t).replace(SP_TRAP, ' ');
  if (!s.trim()) return '';
  const m = SP_STRONG.exec(s);
  if (m) return `말 '${m[0]}'`;
  for (const w of s.matchAll(SP_WEAK)) {
    const rest = s.slice(0, w.index) + ' ' + s.slice(w.index + w[0].length), c = SP_CTX.exec(rest);
    if (c) return `말 '${w[0]}' + '${c[0]}'`;
  }
  return '';
}
/* o = {name, names: [다른 이름], ind: 업종명, text: 설명 글(여러 개면 배열), titles: 기사 제목들(강한 말만 봄), tags: 수집기 태그, sector: 웍스 업종, fund: 조합 이름}
   → {sp: 붙는지, coi: 이해상충 확인 대상, why: 붙은 까닭(검증용)} */
function spTag(o) {
  const names = [o.name, ...(o.names || [])].map(spCo).filter(Boolean);
  const cand = names.map((n) => spS.names.get(n)).find(Boolean);
  const coi = names.some((n) => spS.coi.has(n));
  const r = (why) => ({ sp: !!why, coi, why });
  if (cand) return r('후보 목록');
  if (Array.isArray(o.tags) && o.tags.includes(SP_TAG)) return r('수집기 태그');
  if (o.sector === '방산·항공우주') return r('업종 방산·항공우주');
  if (o.fund && SP_FUND.test(o.fund)) return r(`조합 이름 '${o.fund}'`);
  const ind = spNorm(o.ind);
  if (ind && !SP_IND_OUT.test(ind) && SP_IND_STRONG.test(ind)) return r(`업종 '${ind}'`);
  const text = (Array.isArray(o.text) ? o.text : [o.text]).filter(Boolean).join(' / ');
  const w = spText(text);
  if (w) return r(w);
  // 기사 제목은 강한 말만(약한 말과 '레이더'는 연재 이름·다른 회사 이야기가 섞여 설명 칸에서만 센다, 리서치 노트 4.4)
  const tt = (o.titles || []).filter(Boolean).join(' / '), m = tt && SP_STRONG.exec(spNorm(tt).replace(SP_TRAP, ' '));
  if (m) return r(`기사 제목 '${m[0]}'`);
  if (ind && !SP_IND_OUT.test(ind) && SP_IND_WEAK.test(ind) && SP_CTX.test(spNorm(text).replace(SP_TRAP, ' '))) return r(`약한 업종 '${ind}' + 설명 문맥`);
  return r('');
}
// 같은 행을 여러 번 그리므로 행 객체에 한 번만 계산해 둔다(후보 목록을 읽은 뒤에는 다시 계산)
function spOf(x, input) {
  if (!x) return { sp: false, coi: false, why: '' };
  if (x._sp && x._spV === spS.ver) return x._sp;
  x._sp = spTag(input(x)); x._spV = spS.ver;
  return x._sp;
}
const spCoiTip = () => `${spS.data?.coiWith ? `${spS.data.coiWith}와 ` : ''}사업이 겹치는 회사. 컨택 전 이해상충 확인`;
const SP_COI_B = () => `<span class="rd-fs-tag rd-coi" title="${esc(spCoiTip())}">이해상충 확인</span>`;
const spBadge = (t) => `${t.sp ? `<span class="rd-fs-tag rd-sp" title="${esc(t.why)}">${SP_TAG}</span>` : ''}${t.coi ? SP_COI_B() : ''}`;
// 공용 필터 줄의 '테마' 묶음(filt.js ffRangeHtml 'sp'). n = 지금 목록에서 우주·방산 수
const spOk = (s, t) => !s.sp || t.sp;

/* ---------- 후보 목록 ---------- */
const spS = {
  data: null, at: 0, loading: null, ver: 0, names: new Map(), coi: new Set(), host: null, open: new Set(), err: '',
  ...(() => { const v = viewGet('space', null) || {}; const s = { q: '', br: '', nara: '', lst: '', rev: '', op: '', opMode: 'a', nn: '' }; Object.keys(s).forEach((k) => { if (typeof v[k] === 'string') s[k] = v[k]; }); return s; })(),
};
const SP_KEYS = ['q', 'br', 'nara', 'lst', 'rev', 'op', 'opMode', 'nn'];
const spSave = () => viewSet('space', Object.fromEntries(SP_KEYS.map((k) => [k, spS[k]])));
const spStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const spNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function spNormData(raw) {
  const items = (Array.isArray(raw.items) ? raw.items : []).filter((x) => x && spStr(x.name)).map((x) => {
    const o = Object.fromEntries(['br', 'name', 'listed', 'product', 'rev', 'op', 'inv', 'ceo', 'works', 'src', 'sub', 'cust', 'angle', 'nara', 'why', 'heir', 'founded', 'region', 'also', 'finSrc', 'check', 'revY'].map((k) => [k, spStr(x[k])]));
    o.alt = (Array.isArray(x.alt) ? x.alt : []).map(spStr).filter(Boolean);
    o.brN = spNum(x.brN) || 0; o.revN = spNum(x.revN); o.opN = spNum(x.opN);
    o.id = `space:${o.name}`;
    o.q = [o.name, ...o.alt, o.br, o.product, o.ceo, o.cust, o.sub, o.angle, o.region, o.also].join(' ').toLowerCase();
    return o;
  });
  const list = (v) => (Array.isArray(v) ? v.map(spStr).filter(Boolean) : []);
  return { generated: spStr(raw.generated), source: spStr(raw.source), coiWith: spStr(raw.coiWith), coi: list(raw.coi), ambig: list(raw.ambig), items };
}
// 이름 대조표: 이름과 괄호 속 옛 이름. 영문 약칭(4자 이하)과 같은 이름 다른 회사가 흔한 이름(자료 ambig, 리서치 노트 5장)은 뺀다
function spIndex(d) {
  const names = new Map(), coi = new Set((d?.coi || []).map(spCo)), amb = new Set((d?.ambig || []).map(spCo));
  (d?.items || []).forEach((x) => {
    [x.name, ...x.alt].forEach((n) => {
      const k = spCo(n);
      if (!k || amb.has(k) || (/^[a-z0-9]+$/.test(k) && k.length <= 4 && !coi.has(k))) return;
      if (!names.has(k)) names.set(k, x);
      if (x.nara === '겹침') coi.add(k);
    });
  });
  spS.names = names; spS.coi = coi; spS.ver += 1;
}
spIndex(null);
// 다른 탭이 읽기 전에 부른다. 못 읽어도(파일 없음 등) 태그 규칙은 그대로 돈다
function spLoad(force) {
  if (!force && spS.at && Date.now() - spS.at < SP_TTL) return Promise.resolve();
  if (!spS.loading) {
    spS.loading = (async () => {
      try {
        const d = await STORE.readText(SP_FILE);
        spS.data = d.text ? spNormData(JSON.parse(d.text)) : null; spS.err = '';
      } catch (e) { spS.err = e.status === 404 ? '' : '우주·방산 후보 자료를 읽지 못했습니다'; if (!spS.data) spS.data = null; }
      spIndex(spS.data); spS.at = Date.now();
    })().finally(() => { spS.loading = null; });
  }
  return spS.loading;
}

const SP_NARA = [['', '전체'], ['겹침', '겹침'], ['보완', '보완'], ['무관', '무관']];
const SP_LST = [['', '전체'], ['n', '비상장'], ['y', '상장']];
const spListed = (x) => !/^비상장/.test(x.listed);
function spList() {
  const s = spS, q = s.q.trim().toLowerCase();
  return (s.data?.items || []).filter((x) => (!q || x.q.includes(q)) && (!s.br || String(x.brN) === s.br) && (!s.nara || x.nara === s.nara)
    && (!s.lst || (s.lst === 'y') === spListed(x)) && (typeof ffOk !== 'function' || ffOk(s, { rev: x.revN, op: x.opN })))
    .sort((a, b) => a.brN - b.brN || (b.revN ?? -1e9) - (a.revN ?? -1e9) || a.name.localeCompare(b.name, 'ko'));
}
const spBrName = (x) => x.br.replace(/^\d+\.\s*/, '').replace(/\(.*\)\s*$/, '').trim();

/* ---------- 그리기 ---------- */
const SP_NA = '<span class="muted">–</span>';
const spHead = () => `<div class="ipo-head ipo-cols"><div>회사</div><div>주력 제품</div><div>최근 매출</div><div>영업이익</div><div>${esc(spS.data?.coiWith || '이해상충')}</div><div></div></div>`;
const spCell = (v) => (v ? esc(v) : SP_NA);
const spChev = () => `<span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span>`;
const spKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const spLinks = (s) => s.split(/\s*;\s*/).filter(Boolean).map((u) => (/^https?:\/\/\S+$/i.test(u) ? `<a class="rd-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48))}</a>` : esc(u))).join('<br>');

function spRow(x) {
  const open = spS.open.has(x.id), coi = x.nara === '겹침';
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name)}</button>${coi ? SP_COI_B() : ''}<div class="ipo-sub">${esc([spBrName(x), x.listed].filter(Boolean).join(', '))}</div>
        <div class="rd-pair"><span class="sp-w1">${x.rev ? esc(x.rev) : SP_NA}</span><span class="rd-clamp">${spCell(x.product)}</span></div></div>
      <div class="rd-mh"><span class="rd-clamp">${spCell(x.product)}</span></div>
      <div class="rd-mh">${spCell(x.rev)}</div>
      <div class="rd-mh">${x.opN != null && x.opN < 0 ? `<span class="pe-dn">${esc(x.op)}</span>` : spCell(x.op)}</div>
      <div class="rd-mh">${spCell(x.nara)}</div>
      <div class="ipo-c-st">${spChev()}</div>
    </div>${open ? spDetail(x) : ''}</div>`;
}
function spDetail(x) {
  const hint = { name: x.name, alt: x.alt, br: x.br, listed: x.listed, product: x.product, sub: x.sub, cust: x.cust, ceo: x.ceo, founded: x.founded, region: x.region, rev: x.rev, op: x.op };
  const a = `${spKv('갈래', esc(x.br))}${spKv('같이 걸린 갈래', esc(x.also))}${spKv('상장', esc(x.listed))}${spKv('주력 제품', esc(x.product))}${spKv('세부', esc(x.sub))}${spKv('고객', esc(x.cust))}${spKv('대표', esc(x.ceo))}${spKv('설립', esc(x.founded))}${spKv('지역', esc(x.region))}`;
  const b = `${spKv('최근 매출', esc(x.rev))}${spKv('영업이익', esc(x.op))}${spKv('손익 출처', esc(x.finSrc))}${spKv('투자 이력', esc(x.inv))}`;
  const c = `${spKv('딜 앵글', esc(x.angle))}${spKv('승계 신호', esc(x.heir))}${spKv(esc(spS.data?.coiWith || '이해상충'), esc(x.nara))}${spKv('웍스에 이미 있음', esc(x.works))}${spKv('확인 필요', esc(x.check))}${spKv('출처', spLinks(x.src))}`;
  const box = (t, body) => (body ? `<section class="ipo-box"><div class="ipo-box-h">${t}</div><div class="ipo-box-b">${body}</div></section>` : '');
  return `<div class="ipo-detail"><div class="ipo-dhead">${x.why ? `<p class="ipo-sum1">${esc(x.why)}</p>` : '<p></p>'}<div class="ipo-acts">${typeof fqHead === 'function' ? fqHead(x.id, hint) : ''}</div></div>
    <div class="ipo-pane"><div class="ipo-stack">${typeof fqBox === 'function' ? fqBox(x.id, hint, '우주·방산 후보') : ''}
      <div class="ipo-two-col"><div class="ipo-stack">${box('회사', a)}</div><div class="ipo-stack">${box('손익과 투자', b)}${box('판단', c)}</div></div>
    </div></div></div>`;
}

function spSummary() {
  const d = spS.data; if (!d) return '';
  const n = d.items.length, coi = d.items.filter((x) => x.nara === '겹침').length, un = d.items.filter((x) => !spListed(x)).length;
  return `${d.generated ? `<span>${yymd(d.generated)} 조사</span>` : ''}<span>후보 <b>${n}</b></span><span>비상장 <b>${un}</b></span><span>이해상충 확인 <b>${coi}</b></span>`;
}
const spSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
function spFilterHtml() {
  const s = spS, items = s.data?.items || [];
  if (typeof FF_RG === 'object') FF_RG.space = { st: () => spS, apply: () => { spSave(); spDraw(); } };
  const rg = (k, l) => (typeof ffRangeHtml === 'function' ? ffRangeHtml('space', k, l) : '');
  const brs = [...new Map(items.map((x) => [String(x.brN), spBrName(x)])).entries()].sort((a, b) => +a[0] - +b[0]);
  const brOpts = [['', '갈래 전체'], ...brs.map(([k, l]) => [k, `${l} ${items.filter((x) => String(x.brN) === k).length}`])];
  return `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="sp-q" type="search" placeholder="회사, 제품, 고객으로 검색" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>
      <select class="select" id="sp-br" aria-label="갈래">${brOpts.map(([v, l]) => `<option value="${esc(v)}"${s.br === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="ipo-filter rd-finf"><div class="rd-fing"><span class="rd-finl">${esc(s.data?.coiWith || '이해상충')}</span>${spSeg('sp-nara', SP_NARA, s.nara)}</div>
      <div class="rd-fing"><span class="rd-finl">상장</span>${spSeg('sp-lst', SP_LST, s.lst)}</div>
      ${rg('rev', '최근 매출')}${rg('op', '영업이익')}${rg('nn', '값 없음')}</div>`;
}
function spBody() {
  if (!spS.data) return `<div class="empty">${spS.err || '아직 올라온 우주·방산 후보 자료가 없습니다.'}</div>`;
  const [list, skip] = typeof fvSplit === 'function' ? fvSplit(spList(), (x) => x.id) : [spList(), []];
  if (!list.length && !skip.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  let last = '';
  const rows = list.map((x) => { const g = spS.br ? '' : x.brN !== last ? (last = x.brN, `<div class="rd-grp"><b>${esc(spBrName(x))}</b><span>${list.filter((y) => y.brN === x.brN).length}곳</span></div>`) : ''; return g + spRow(x); }).join('');
  return spHead() + rows + (skip.length && typeof fvSkipTail === 'function' ? fvSkipTail(skip, 'space', spRow) : '');
}
function spDraw(full) {
  const h = spS.host; if (!h || !h.isConnected) return;
  if (full) h.querySelector('#sp-filter').innerHTML = spFilterHtml();
  h.querySelector('#sp-sum').innerHTML = spSummary();
  h.querySelector('#sp-body').innerHTML = spBody();
  spSave();
  if (spS.focus) {
    const r = [...h.querySelectorAll('#sp-body .ipo-row[data-id]')].find((x) => x.dataset.id === spS.focus);
    spS.focus = null;
    if (r) r.scrollIntoView({ block: 'start' });
  }
}
function spBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const sg = t.closest('[data-sp-nara], [data-sp-lst]');
    if (sg) { const k = 'spNara' in sg.dataset ? 'nara' : 'lst'; spS[k] = sg.dataset[k === 'nara' ? 'spNara' : 'spLst']; root.querySelectorAll(`[data-sp-${k}]`).forEach((b) => { b.classList.toggle('on', b === sg); b.setAttribute('aria-pressed', b === sg); }); spDraw(); return; }
    if (t.closest('#sp-ref')) { spLoad(true).then(() => spDraw(true)).catch((e) => toast(e.message)); return; }
    if (t.closest('a, input, select, button:not(.ipo-ttl), .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]'), x = row && spS.data?.items.find((y) => y.id === row.dataset.id);
    if (!x) return;
    if (spS.open.has(x.id)) spS.open.delete(x.id); else spS.open.add(x.id);
    row.outerHTML = spRow(x);
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'sp-q') { spS.q = ev.target.value; spDraw(); } });
  root.addEventListener('change', (ev) => { if (ev.target.id === 'sp-br') { spS.br = ev.target.value; spDraw(); } });
}
window.addEventListener('fv-change', () => { if (spS.host?.isConnected && spS.data) spDraw(); });

// 다른 화면(파이프라인·팩트시트)에서 ref 'space:<이름>'으로 한 회사를 펼쳐 보여 줄 때: 필터를 풀고 펼친 뒤 그 자리로
function spaceFocus(ref) {
  Object.assign(spS, { q: '', br: '', nara: '', lst: '', rev: '', op: '', nn: '', focus: String(ref) });
  spS.open.add(String(ref)); spSave();
  return '#deals/space';
}

async function renderSpace(host) {
  spS.host = host;
  host.innerHTML = `<div class="ipo-page rd-page sp-page" id="sp-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="sp-sum"></div>${infoBtn('deals/space')}
      <button class="btn ghost" type="button" id="sp-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card"><div id="sp-filter"></div><div class="ipo-body" id="sp-body"><div class="empty">불러오는 중…</div></div></section></div>`;
  spBind(host.querySelector('#sp-root'));
  await spLoad();
  if (spS.host === host && host.isConnected) spDraw(true);
}

TAB_INFO['deals/space'] = {
  title: '우주·방산 후보',
  asof: '2026-11-25 섹터 리서치(05. 딜소싱\\03. 섹터 리서치\\우주·방산 (2026-11-25)). 매출과 영업이익은 DART 감사보고서, 사람인 기업정보(NICE), 기사 순',
  rows: [
    ['무엇인가', [
      '우주·방산 9개 갈래(업스트림, 위성 안테나·RF, 방산 RF·레이더, 전력·추진·소재, 발사체, 다운스트림, 방산 전자, 드론·UAM, 기계 협력사)에서 고른 후보 회사입니다.',
      '이해상충을 볼 회사와 사업이 겹치는 곳은 이해상충 확인 표시가 붙습니다.',
    ]],
    ['다른 탭의 우주·방산 표시', [
      '투자 라운드, 상장 준비, 구주 매물, 오너기업, 매물장터에도 같은 기준으로 우주·방산 표시와 테마 필터가 있습니다. 업종 칸은 그대로입니다.',
      '기준은 업종 코드(항공기, 무인기, 항공기 부품, 무기 및 총포탄, 전투용 차량, 레이더), 설명 칸의 포함어, 이 후보 목록의 회사 이름입니다. 안테나, RF처럼 약한 말은 군, 방산, 위성 같은 말이 함께 있을 때만 봅니다.',
    ]],
  ],
};
