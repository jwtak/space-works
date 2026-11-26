/* 자금(2026-11-20 사용자 요청, #cash): 계좌·수입·지출·자금계획. 장부(전표·결산·신고)는 회계법인이 아마란스10에서 하고,
   이 화면은 관리용 참고 값이다(01. 법인 설립\기장·ERP 노트 4절).
   자료: 내 OneDrive SPACE WORKS/data/cash/{accounts,tx,plan}.json. 지금은 탁지원만 보고(CS_USERS) 공유하지 않는다.
   나중에 대표님과 같이 볼 때: CS_USERS에 주소를 더하고, 세 파일을 OneDrive에서 공유한 뒤 graph.js CFG.shared.files와 writable에 등록.
   공개 저장소라 금액·계좌 자료는 코드에 두지 않는다. 계좌번호는 끝 4자리만 받는다.
   accounts.json { items[{ id, name, bank, kind, last4, bal, balAt, balSrc: '수기'|'거래내역', tb?{ bal, date }(올린 거래내역의 마지막 잔액), rate, due, memo }] }
   tx.json { cats[{ name, type: '지출'|'수입'|'제외', pay?(합계만 저장) }], items[{ id, k(중복 확인 열쇠), imp, src: 'bank'|'card', acct, card, date, time, desc, desc2, in, out, bal, cat, sug, memo }
             급여 합계 줄은 { id: 'pay:…', pay: true, desc: '급여 YYYY-MM', in, out, ks[] }],
             imports[{ id, at, file, src, acct, card, n }], maps{ <머리글 서명>: 열 고른 값 } }
   plan.json { items[{ id, name, type: '지출'|'수입', cat, amt, freq, start: 'YYYY-MM', end, memo }], wc[{ id, name, type: '받을 돈'|'줄 돈', amt, due, memo }] } */
const CS_USERS = ['jw.tak@universeinvest.co.kr', 'jw.tak@spaceinve.com'];
const csAllowed = () => CS_USERS.includes((G.account?.username || '').toLowerCase());
const CS_DIR = 'data/cash/';
const CS_KINDS = ['보통예금', 'CMA', '정기예금', '적금', 'MMF', '기타'];
const CS_BANKS = ['신한은행', 'KB국민은행', '우리은행', '하나은행', 'IBK기업은행', 'NH농협은행', 'KDB산업은행', '한국투자증권', '미래에셋증권', 'NH투자증권', '삼성증권', 'KB증권', '키움증권', '신한투자증권'];
// 시작 분류. 모회사 계정체계를 받으면 '분류 관리'에서 바꾼다. 제외 = 계좌끼리 옮긴 돈·자본금·카드대금처럼 수입·지출 합계에 넣지 않는 것
const CS_CATS0 = [
  { name: '급여', type: '지출', pay: true },
  ...['임차료', '관리비', '4대보험', '복리후생비', '접대비', '여비교통비', '통신비', '소모품비', '도서인쇄비', '지급수수료', '세금과공과', '차량유지비', '교육훈련비', '기타 지출'].map((name) => ({ name, type: '지출' })),
  ...['관리보수', '이자수익', '기타 수입'].map((name) => ({ name, type: '수입' })),
  ...['자본금', '계좌 이체', '카드대금'].map((name) => ({ name, type: '제외' })),
];
const CS_FREQ = ['매월', '분기', '반기', '매년', '한 번'];
const CS_TABS = [['accounts', '계좌', 'wallet'], ['tx', '수입·지출', 'file'], ['plan', '자금계획', 'chart']];
const csNew = { acc: () => ({ items: [] }), tx: () => ({ cats: CS_CATS0.map((c) => ({ ...c })), items: [], imports: [], maps: {} }), plan: () => ({ items: [], wc: [] }) };
const CS_FILE = { acc: 'accounts', tx: 'tx', plan: 'plan' };
const CS = {
  f: { acc: { d: null, v: null }, tx: { d: null, v: null }, plan: { d: null, v: null } },
  loaded: false, loading: null, err: '', busy: 0, q: Promise.resolve(),
  mon: viewGet('cash.mon', ''), cat: viewGet('cash.cat', ''), src: viewGet('cash.src', ''), q2: viewGet('cash.q', ''), sum: viewGet('cash.sum', 'mon'), pva: viewGet('cash.pva', ''), lim: 300,
};
const csOn = () => route() === 'cash' || route().startsWith('cash/');
const csTab = () => { const t = route().split('/')[1]; return CS_TABS.some(([k]) => k === t) ? t : viewGet('cash.tab', 'accounts'); };

// ---------- 숫자·날짜 ----------
const csWon = (n) => (Math.round(Number(n) || 0)).toLocaleString('ko-KR');
const csAmt = (n) => (n ? csWon(n) : '');
const csNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
  let s = String(v ?? '').trim(); if (!s || s === '-') return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  s = s.replace(/[^\d.]/g, '');
  const n = parseFloat(s); return Number.isFinite(n) ? Math.round(neg ? -n : n) : 0;
};
const csYm = (d) => d.slice(0, 7);
const csYmAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number), d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const csYmDiff = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const csYmTxt = (ym) => `${ym.slice(2, 4)}.${ym.slice(5, 7)}`;
const csThisYm = () => today().slice(0, 7);
// 엑셀 날짜: 일련번호(1900 기준), 20261126, '2026.11.26', '2026-11-26 14:03', '26/11/26'
function csDate(v) {
  if (v instanceof Date && !isNaN(v)) return { d: ymd(v), t: `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}` };
  if (typeof v === 'number') {
    if (v > 19000101 && v < 21001231) { const s = String(Math.floor(v)); return { d: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, t: '' }; }
    if (v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * 86400000), d = new Date(ms);
      const t = v % 1 ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : '';
      return { d: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, t };
    }
    return null;
  }
  const s = String(v ?? '').trim(); if (!s) return null;
  let m = /^(\d{4}|\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(s) || /^(\d{4})(\d{2})(\d{2})(?!\d)/.exec(s);
  if (!m) return null;
  const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || y < 2000 || y > 2100) return null;
  const tm = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s.slice(m[0].length));
  return { d: `${y}-${pad(mo)}-${pad(da)}`, t: tm ? `${pad(tm[1])}:${tm[2]}:${pad(tm[3] || 0)}` : '' };
}
function csTime(v) {
  if (typeof v === 'number') {
    if (v >= 0 && v < 1) { const s = Math.round(v * 86400); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; }
    if (v >= 0 && v < 240000) { const s = String(Math.floor(v)).padStart(6, '0'); return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`; }
    return '';
  }
  const m = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(v ?? '')); return m ? `${pad(m[1])}:${m[2]}:${pad(m[3] || 0)}` : '';
}
// 같은 거래를 알아보는 열쇠(FNV-1a 두 갈래)
function csHash(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; }
  return a.toString(36) + b.toString(36);
}
const csNorm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* 급여(2026-11-20 사용자 "추천대로"): 보수 정보는 OneDrive에 두지 않는 규칙이라, 합계만 저장(pay) 분류 거래는 개별 줄 없이
   계좌와 달별 '급여 YYYY-MM' 합계 한 줄로만 저장한다. 받는 사람, 적요, 건별 금액, 시각은 남기지 않고,
   같은 계좌 같은 달 다른 거래의 잔액도 지운다(앞뒤 잔액 차이로 건별 금액이 보이지 않게). 계좌 잔고는 accounts.json tb로 따로 둔다.
   다시 올려도 두 번 더하지 않도록 거래 열쇠를 한 번 더 해시한 32비트 값(ks)만 남긴다. 값이 짧아 이름, 금액을 넣어 맞혀 보는 식으로는 되살릴 수 없다.
   4대보험, 원천세처럼 회사 단위로 나가는 돈은 대상이 아니다 */
const CS_PAY_RE = /급여|급료|상여|성과급|퇴직금|퇴직급여|월급|임금|인센티브/;
const csH32 = (s) => { let a = 0x811c9dc5; for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 16777619) >>> 0; return a.toString(16).padStart(8, '0'); };
const csShort = (k) => csH32(`pay|${k}`);
const csIsPay = (cat) => !!cat && !!CS.f.tx.d.cats.find((c) => c.name === cat)?.pay;
const csPayCat = () => CS.f.tx.d.cats.find((c) => c.pay)?.name || '';
const csMonEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(y, m, 0).getDate())}`; };
const csPayId = (src, who, cat, ym) => `pay:${src}:${who}:${cat}:${ym}`;
// 이미 있는 거래인지: 보통 거래는 열쇠, 급여 합계에 들어간 거래는 짧은 해시로
function csSeen(d) { const full = new Set(), short = new Set(); for (const x of d.items) { full.add(x.k); for (const h of x.ks || []) short.add(h); } return (k) => full.has(k) || short.has(csShort(k)); }
// 거래 x를 그 달 급여 합계에 넣고, 저장돼 있던 원래 줄은 지운다. 이미 넣은 거래면 금액은 그대로. 다시 적용해도 같은 결과
function csPayAdd(d, x, cat) {
  const ym = csYm(x.date), acct = x.src === 'bank' ? x.acct || '' : '', card = x.src === 'card' ? x.card || '' : '', id = csPayId(x.src, acct || card, cat, ym);
  let g = d.items.find((y) => y.id === id);
  if (!g) { g = { id, k: id, pay: true, src: x.src, acct, card, date: csMonEnd(ym), time: '', desc: `${cat} ${ym}`, desc2: '', in: 0, out: 0, bal: null, seq: 0, cat, sug: false, memo: '', ks: [] }; d.items.push(g); }
  const h = csShort(x.k);
  if (!g.ks.includes(h)) { g.ks.push(h); g.in += x.in || 0; g.out += x.out || 0; }
  d.items = d.items.filter((y) => y === g || y.id !== x.id);
}
function csPayStrip(d) {
  const pm = new Set(d.items.filter((g) => g.pay).map((g) => `${g.src}|${g.acct || ''}|${csYm(g.date)}`));
  for (const y of d.items) if (!y.pay && y.bal != null && pm.has(`${y.src}|${y.acct || ''}|${csYm(y.date)}`)) y.bal = null;
}

// ---------- 저장 ----------
async function csRead(k) {
  const r = await STORE.readText(`${CS_DIR}${CS_FILE[k]}.json`);
  let d = null; try { d = r.text ? JSON.parse(r.text) : null; } catch { d = null; }
  const base = csNew[k]();
  const out = d && typeof d === 'object' ? { ...base, ...d } : base;
  if (k === 'tx' && !out.cats.some((c) => 'pay' in c)) { const c = out.cats.find((y) => y.name === '급여'); if (c) c.pay = true; }
  return { d: out, v: r.version };
}
function csLoad() {
  return (CS.loading ||= Promise.all(['acc', 'tx', 'plan'].map(async (k) => { CS.f[k] = await csRead(k); }))
    .then(() => { CS.loaded = true; CS.err = ''; })
    .catch((e) => { CS.err = e.message; })
    .finally(() => { CS.loading = null; }));
}
// 화면에 먼저 적용하고 저장은 줄을 세운다. 다른 기기가 먼저 고쳤으면(409) 새로 읽어 fn을 다시 적용. fn은 다시 적용해도 같은 결과여야 한다
function csAct(k, fn, redraw = true) {
  fn(CS.f[k].d); CS.busy++;
  if (redraw) csDraw();
  CS.q = CS.q.then(async () => {
    try {
      for (let i = 0; ; i++) {
        try { CS.f[k].v = await STORE.writeText(`${CS_DIR}${CS_FILE[k]}.json`, JSON.stringify(CS.f[k].d), CS.f[k].v, 'application/json; charset=utf-8'); return; }
        catch (e) {
          if (e.status !== 409 || i >= 3) throw e;
          CS.f[k] = await csRead(k); fn(CS.f[k].d);
        }
      }
    } catch (e) {
      toast(e.message || '저장하지 못했습니다');
      try { CS.f[k] = await csRead(k); } catch { /* 다음에 다시 읽는다 */ }
      if (csOn() && !csTyping()) csDraw();
    } finally { CS.busy--; }
  });
}
const csTyping = () => !!document.activeElement?.closest('#cs-root') && document.activeElement.matches('input,textarea');

// ---------- 공통 계산 ----------
const csAccs = () => CS.f.acc.d.items;
const csTotal = () => csAccs().reduce((a, x) => a + (Number(x.bal) || 0), 0);
const csCats = () => CS.f.tx.d.cats;
const csCatType = (name) => csCats().find((c) => c.name === name)?.type || '';
// 수입·지출 합계: '제외' 분류는 빼고, 미분류는 금액 방향대로 넣는다
function csSums(items) {
  let inn = 0, out = 0, un = 0;
  for (const x of items) { if (csCatType(x.cat) === '제외') continue; inn += x.in || 0; out += x.out || 0; if (!x.cat) un++; }
  return { inn, out, un };
}
const csMonths = () => [...new Set([...CS.f.tx.d.items.map((x) => csYm(x.date)), csThisYm()])].sort().reverse();
function csLastBal(acct) { // 그 계좌의 거래내역 중 가장 늦은 잔액(올릴 때 계좌에 적어 둔 tb, 없으면 남은 거래 잔액)
  const tb = csAccs().find((a) => a.id === acct)?.tb; if (tb) return tb;
  let best = null;
  for (const x of CS.f.tx.d.items) if (x.acct === acct && x.bal != null && x.src === 'bank') { const key = `${x.date} ${x.time || ''} ${String(x.seq ?? 0).padStart(6, '0')}`; if (!best || key > best.key) best = { key, bal: x.bal, date: x.date }; }
  return best;
}

// ---------- 화면 ----------
function renderCash(host) {
  if (!csAllowed()) { location.hash = '#home'; return; }
  const t = csTab(); viewSet('cash.tab', t);
  host.innerHTML = `<div id="cs-root"><div class="page-head"><h1>자금</h1><div class="tools">${infoBtn('cash')}</div></div>
    <div class="deal-seg cs-tabs" role="tablist">${CS_TABS.map(([k, n, i]) => `<button type="button" role="tab" data-cst="${k}" aria-selected="${t === k}" class="${t === k ? 'on' : ''}">${ico(i)}${n}</button>`).join('')}</div>
    <div id="cs-body"><section class="card"><div class="empty">불러오는 중…</div></section></div></div>`;
  if (CS.loaded) csDraw();
  if (!CS.busy) csLoad().then(() => { if (csOn() && !csTyping()) csDraw(); });
}
function csDraw() {
  const b = $('#cs-body'); if (!b) return;
  if (!CS.loaded) { b.innerHTML = `<section class="card"><div class="empty">${esc(CS.err || '불러오는 중…')}</div></section>`; return; }
  const t = csTab(), y = $('.scroll')?.scrollTop;
  b.innerHTML = t === 'tx' ? csTxHTML() : t === 'plan' ? csPlanHTML() : csAccHTML();
  if (y != null) $('.scroll').scrollTop = y;
}
const csTile = (h, v, cls = 'blue', s2 = '') => `<div class="tile ${cls}"><div class="top"><span class="h">${esc(h)}</span></div><div><div class="v">${v}</div>${s2 ? `<div class="s2">${s2}</div>` : ''}</div></div>`;
const csV = (n, unit = '원') => `${csWon(n)}<small>${unit}</small>`;
const csTd = (h, v, cls = '') => `<td data-h="${esc(h)}"${cls ? ` class="${cls}"` : ''}>${v}</td>`;

/* 1. 계좌 */
function csAccHTML() {
  const xs = csAccs(), tot = csTotal();
  const byKind = CS_KINDS.map((k) => [k, xs.filter((x) => x.kind === k)]).filter(([, a]) => a.length);
  const td = today();
  const rows = xs.map((x) => {
    const dd = x.due ? diffDays(x.due, td) : null;
    return `<tr class="row" data-acc="${esc(x.id)}">
      ${csTd('계좌', `<div class="name">${esc(x.name || '이름 없음')}</div>${x.last4 ? `<div class="cs-sub">끝자리 ${esc(x.last4)}</div>` : ''}`)}
      ${csTd('금융기관', esc(x.bank || ''))}${csTd('종류', esc(x.kind || ''))}
      ${csTd('잔고', `<b class="cs-n">${csWon(x.bal)}</b>`)}
      ${csTd('금리', x.rate !== '' && x.rate != null ? `<span class="cs-n">${esc(x.rate)}%</span>` : '')}
      ${csTd('만기', x.due ? `<span class="cs-n ${dd != null && dd >= 0 && dd <= 30 ? 'cs-warn' : ''}">${yymd(x.due)}</span>` : '')}
      ${csTd('잔고 기준일', x.balAt ? `<span class="cs-n">${yymd(x.balAt)}</span> <span class="cs-sub">${esc(x.balSrc || '')}</span>` : '')}
      ${csTd('메모', `<span class="cs-memo-t">${esc(x.memo || '')}</span>`)}</tr>`;
  }).join('');
  return `<div class="tiles cs-tiles">${csTile('합계', csV(tot))}${byKind.map(([k, a]) => csTile(k, csV(a.reduce((s, x) => s + (Number(x.bal) || 0), 0)), 'violet', `${a.length}개`)).join('')}</div>
    <section class="card"><div class="card-head"><h2>계좌<span class="n">${xs.length}</span></h2><div class="act"><button type="button" class="btn primary sm" data-acc-add>${ico('plus', 'sm')}계좌 추가</button></div></div>
    ${xs.length ? `<table class="tbl cs-tbl"><thead><tr><th>계좌</th><th>금융기관</th><th>종류</th><th>잔고</th><th>금리</th><th>만기</th><th>잔고 기준일</th><th>메모</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">등록한 계좌 없음</div>'}</section>`;
}
function csAccEdit(id) {
  const x = csAccs().find((a) => a.id === id) || { id: '', name: '', bank: '', kind: '보통예금', last4: '', bal: '', balAt: today(), rate: '', due: '', memo: '' };
  const lb = x.id ? csLastBal(x.id) : null;
  openSheet(`<h3>${x.id ? '계좌 수정' : '계좌 추가'}</h3><form class="cs-form" id="cs-accf">
    <div class="field"><label>이름</label><input class="input" name="name" value="${esc(x.name)}" maxlength="40" required autocomplete="off"></div>
    <div class="cs-pair"><div class="field"><label>금융기관</label><input class="input" name="bank" value="${esc(x.bank)}" list="cs-banks" maxlength="30" autocomplete="off"><datalist id="cs-banks">${CS_BANKS.map((b) => `<option value="${esc(b)}">`).join('')}</datalist></div>
      <div class="field"><label>종류</label><select class="select" name="kind">${CS_KINDS.map((k) => `<option ${k === x.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div></div>
    <div class="cs-pair"><div class="field"><label>계좌번호 끝 4자리</label><input class="input" name="last4" value="${esc(x.last4)}" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off"></div>
      <div class="field"><label>금리 %</label><input class="input" name="rate" value="${esc(x.rate ?? '')}" inputmode="decimal" autocomplete="off"></div></div>
    <div class="cs-pair"><div class="field"><label>잔고</label><input class="input cs-money" name="bal" value="${x.bal === '' ? '' : csWon(x.bal)}" inputmode="numeric" autocomplete="off"></div>
      <div class="field"><label>잔고 기준일</label><input class="input" type="date" name="balAt" value="${esc(x.balAt || '')}"></div></div>
    ${lb ? `<div class="cs-lb">거래내역 잔액 <b class="cs-n">${csWon(lb.bal)}</b> <span class="cs-sub">${yymd(lb.date)}</span><button type="button" class="btn sm" data-lb>적용</button></div>` : ''}
    <div class="field"><label>만기</label><input class="input" type="date" name="due" value="${esc(x.due || '')}"></div>
    <div class="field"><label>메모</label><input class="input" name="memo" value="${esc(x.memo || '')}" maxlength="200" autocomplete="off"></div>
    <div class="cs-foot">${x.id ? '<button type="button" class="btn ghost cs-del" data-del>삭제</button>' : ''}<button type="button" class="btn" data-close>취소</button><button type="submit" class="btn primary">저장</button></div></form>`, (el, close) => {
    const f = el.querySelector('form');
    let src = x.balSrc || '수기';
    const mark = csSheetGuard(el, close);
    csMoneyInputs(f);
    f.last4.addEventListener('input', () => { f.last4.value = f.last4.value.replace(/\D/g, '').slice(0, 4); });
    f.querySelector('[data-close]').onclick = () => close();
    f.querySelector('[data-lb]')?.addEventListener('click', () => { f.bal.value = csWon(lb.bal); f.balAt.value = lb.date; src = '거래내역'; mark(); });
    f.bal.addEventListener('input', () => { src = '수기'; });
    f.querySelector('[data-del]')?.addEventListener('click', () => {
      if (!confirm(`${x.name} 계좌를 지울까요? 올린 거래내역은 남습니다.`)) return;
      close(); csAct('acc', (d) => { d.items = d.items.filter((a) => a.id !== x.id); });
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      if (v.last4 && !/^\d{4}$/.test(v.last4)) { toast('계좌번호는 끝 4자리만'); return; }
      const rec = { id: x.id || uid(), name: v.name.trim(), bank: v.bank.trim(), kind: v.kind, last4: v.last4, bal: csNum(v.bal), balAt: fixYmd(v.balAt) || today(), balSrc: src, rate: v.rate.trim() === '' ? '' : Number(v.rate.replace(/[^\d.]/g, '')) || 0, due: fixYmd(v.due) || '', memo: v.memo.trim() };
      close();
      csAct('acc', (d) => { const i = d.items.findIndex((a) => a.id === rec.id); if (i >= 0) d.items[i] = rec; else d.items.push(rec); });
    });
  });
}
// 고친 내용이 있는 창을 Esc나 바깥 클릭으로 닫으려 하면 확인한다. 돌려주는 함수는 입력 말고 바뀐 것(추가·삭제 단추)을 알릴 때
function csSheetGuard(el, close) {
  let dirty = false, downOut = false;
  const wrap = el.parentElement, mark = () => { dirty = true; };
  el.addEventListener('input', mark); el.addEventListener('change', mark);
  const ask = () => !dirty || confirm('고친 내용이 저장되지 않습니다. 닫을까요?');
  const onKey = (e) => {
    if (!wrap.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
    if (e.key !== 'Escape' || !dirty || wrap.nextElementSibling?.classList.contains('sheet-wrap')) return; // 위에 다른 창이 있으면 그 창 몫
    e.stopPropagation(); e.preventDefault();
    if (ask()) close();
  };
  window.addEventListener('keydown', onKey, true);
  wrap.addEventListener('mousedown', (e) => { downOut = e.target === wrap; }, true);
  wrap.addEventListener('click', (e) => {
    if (e.target !== wrap || !dirty) return;
    e.stopPropagation();
    if (downOut && ask()) close();
  }, true);
  return mark;
}
function csMoneyInputs(f) {
  f.querySelectorAll('.cs-money').forEach((i) => {
    i.addEventListener('blur', () => { if (i.value.trim()) i.value = csWon(csNum(i.value)); });
    i.addEventListener('focus', () => { if (i.value) i.value = String(csNum(i.value)); });
  });
}

/* 2. 수입·지출 */
function csTxView() {
  const all = CS.f.tx.d.items, mons = csMonths();
  if (CS.mon && CS.mon !== 'all' && !mons.includes(CS.mon)) CS.mon = '';
  const mon = CS.mon || mons.find((m) => all.some((x) => csYm(x.date) === m)) || csThisYm();
  const inMon = mon === 'all' ? all : all.filter((x) => csYm(x.date) === mon);
  const q = CS.q2.trim().toLowerCase();
  const list = inMon.filter((x) => (!CS.src || x.src === CS.src) && (!CS.cat || (CS.cat === '_none' ? !x.cat : x.cat === CS.cat))
    && (!q || `${x.desc} ${x.desc2} ${x.memo} ${x.cat}`.toLowerCase().includes(q)))
    .sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`) || (b.seq ?? 0) - (a.seq ?? 0));
  return { mon, mons, inMon, list };
}
function csCatOpts(cur) {
  const g = (t) => csCats().filter((c) => c.type === t).map((c) => `<option ${c.name === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const lost = cur && !csCats().some((c) => c.name === cur) ? `<option selected>${esc(cur)}</option>` : '';
  return `<option value="">미분류</option>${lost}<optgroup label="지출">${g('지출')}</optgroup><optgroup label="수입">${g('수입')}</optgroup><optgroup label="제외">${g('제외')}</optgroup>`;
}
const csSrcName = (x) => (x.src === 'card' ? x.card || '카드' : csAccs().find((a) => a.id === x.acct)?.name || '계좌');
const csSugBtn = (list) => { const n = list.filter((x) => x.sug).length; return n ? `<button type="button" class="btn sm" data-sug-ok>제안 확정 ${n}건</button>` : ''; };
function csTxListHTML(list) {
  const shown = list.slice(0, CS.lim);
  const rows = shown.map((x) => `<tr data-tx="${esc(x.id)}">
    ${csTd('날짜', `<span class="cs-n">${x.pay ? csYmTxt(csYm(x.date)) : yymd(x.date)}</span>${x.time ? `<div class="cs-sub cs-n">${esc(x.time.slice(0, 5))}</div>` : ''}`)}
    ${csTd('내용', `<div class="cs-desc">${esc(x.desc || x.desc2 || '')}</div><div class="cs-sub">${esc([x.desc && x.desc2 ? x.desc2 : '', csSrcName(x)].filter(Boolean).join(' / '))}</div>`)}
    ${csTd('입금', `<span class="cs-n cs-in">${csAmt(x.in)}</span>`)}${csTd('출금', `<span class="cs-n">${csAmt(x.out)}</span>`)}
    ${csTd('잔액', `<span class="cs-n cs-sub">${x.bal != null ? csWon(x.bal) : ''}</span>`)}
    ${csTd('분류', x.pay ? `<span class="cs-payc">${esc(x.cat || '급여')}</span><button type="button" class="btn ghost sm cs-paydel" data-paydel="${esc(x.id)}" aria-label="급여 합계 줄 지우기">${ico('trash', 'sm')}</button>` : `<select class="select cs-cat ${x.sug ? 'sug' : ''}" data-cat="${esc(x.id)}" aria-label="분류"${x.sug ? ' title="지난 분류 제안"' : ''}>${csCatOpts(x.cat)}</select>`)}
    ${csTd('메모', `<input class="input cs-memo" data-memo="${esc(x.id)}" value="${esc(x.memo || '')}" maxlength="200" aria-label="메모" autocomplete="off">`)}</tr>`).join('');
  return list.length ? `<table class="tbl cs-tbl cs-txt"><thead><tr><th>날짜</th><th>내용</th><th>입금</th><th>출금</th><th>잔액</th><th>분류</th><th>메모</th></tr></thead><tbody>${rows}</tbody></table>
        ${list.length > shown.length ? `<div class="cs-more"><button type="button" class="btn sm" data-more>${list.length - shown.length}건 더 보기</button></div>` : ''}`
    : `<div class="empty">${CS.f.tx.d.items.length ? '해당 거래 없음' : '올린 거래내역 없음'}</div>`;
}
function csTxHTML() {
  const { mon, mons, inMon, list } = csTxView(), s = csSums(inMon);
  return `<div class="tiles cs-tiles">${csTile('수입', csV(s.inn), 'green')}${csTile('지출', csV(s.out), 'red')}${csTile('순수입', csV(s.inn - s.out), s.inn - s.out < 0 ? 'amber' : 'blue')}${csTile('미분류', `${s.un}<small>건</small>`, 'violet')}</div>
    ${csSumHTML(mon, mons)}
    <section class="card" id="cs-drop"><div class="card-head cs-head"><h2>거래<span class="n" id="cs-txn">${list.length}</span></h2>
      <div class="act cs-acts"><span class="cs-sugb" id="cs-sugb">${csSugBtn(list)}</span><button type="button" class="btn sm" data-cats>분류 관리</button><button type="button" class="btn sm" data-imps>올린 파일</button><button type="button" class="btn primary sm" data-up>${ico('upload', 'sm')}엑셀 올리기</button><input type="file" id="cs-file" accept=".xlsx,.xls,.csv,.htm,.html" hidden></div></div>
      <div class="cs-filters">
        <select class="select" data-f="mon" aria-label="달"><option value="all" ${mon === 'all' ? 'selected' : ''}>전체 기간</option>${mons.map((m) => `<option value="${m}" ${m === mon ? 'selected' : ''}>${m.slice(0, 4)}.${m.slice(5)}</option>`).join('')}</select>
        <select class="select" data-f="src" aria-label="출처"><option value="">은행·카드</option><option value="bank" ${CS.src === 'bank' ? 'selected' : ''}>은행</option><option value="card" ${CS.src === 'card' ? 'selected' : ''}>카드</option></select>
        <select class="select" data-f="cat" aria-label="분류"><option value="">모든 분류</option><option value="_none" ${CS.cat === '_none' ? 'selected' : ''}>미분류</option>${csCats().map((c) => `<option ${c.name === CS.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <input class="input" type="search" data-f="q" value="${esc(CS.q2)}" placeholder="내용, 메모" aria-label="검색" autocomplete="off">
      </div>
      <div id="cs-txlist">${csTxListHTML(list)}</div></section>`;
}
function csSumHTML(mon, mons) {
  const items = CS.f.tx.d.items, cats = csCats();
  const seg = `<div class="seg cs-seg">${[['mon', '이 달'], ['grid', '월별']].map(([k, t]) => `<button type="button" data-sum="${k}" class="${CS.sum === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const by = (xs) => { const m = new Map(); for (const x of xs) { const k = x.cat || ''; const o = m.get(k) || { in: 0, out: 0, n: 0 }; o.in += x.in || 0; o.out += x.out || 0; o.n++; m.set(k, o); } return m; };
  const order = (m) => [...m.keys()].sort((a, b) => { const r = (k) => ({ 지출: 0, 수입: 1, 제외: 2 }[csCatType(k)] ?? 3); return r(a) - r(b) || (m.get(b).out + m.get(b).in) - (m.get(a).out + m.get(a).in); });
  let body;
  if (CS.sum === 'grid') {
    const ms = [...new Set(items.map((x) => csYm(x.date)))].sort().slice(-12);
    if (!ms.length) body = '<div class="empty">올린 거래내역 없음</div>';
    else {
      const per = ms.map((m) => by(items.filter((x) => csYm(x.date) === m)));
      const keys = [...new Set(per.flatMap((m) => [...m.keys()]))].filter((k) => csCatType(k) !== '제외')
        .sort((a, b) => ({ 지출: 0, 수입: 1 }[csCatType(a)] ?? 2) - ({ 지출: 0, 수입: 1 }[csCatType(b)] ?? 2) || a.localeCompare(b));
      const val = (k, o) => (!o ? '' : csCatType(k) === '수입' ? csAmt(o.in - o.out) : csCatType(k) === '지출' ? csAmt(o.out - o.in) : csAmt(o.in - o.out));
      const tot = (f) => per.map((m) => `<td><b class="cs-n">${csAmt([...m.entries()].filter(([k]) => csCatType(k) !== '제외').reduce((s, [, o]) => s + o[f], 0))}</b></td>`).join('');
      body = `<div class="cs-wide"><table class="tbl cs-grid" style="min-width:${(ms.length + 1) * 112}px"><thead><tr><th>분류</th>${ms.map((m) => `<th class="cs-n">${csYmTxt(m)}</th>`).join('')}</tr></thead><tbody>
        ${keys.map((k) => `<tr><td>${esc(k || '미분류')}<span class="cs-sub"> ${esc(csCatType(k))}</span></td>${per.map((m) => `<td><span class="cs-n">${val(k, m.get(k))}</span></td>`).join('')}</tr>`).join('')}
        <tr class="cs-totr"><td>입금 합계</td>${tot('in')}</tr><tr class="cs-totr"><td>출금 합계</td>${tot('out')}</tr></tbody></table></div>`;
    }
  } else {
    const xs = mon === 'all' ? items : items.filter((x) => csYm(x.date) === mon), m = by(xs), keys = order(m);
    body = keys.length ? `<table class="tbl cs-tbl cs-sumt"><thead><tr><th>분류</th><th>구분</th><th>입금</th><th>출금</th><th>건수</th></tr></thead><tbody>
      ${keys.map((k) => { const o = m.get(k); return `<tr class="row" data-catgo="${esc(k || '_none')}">${csTd('분류', esc(k || '미분류'))}${csTd('구분', esc(csCatType(k) || ''))}${csTd('입금', `<span class="cs-n cs-in">${csAmt(o.in)}</span>`)}${csTd('출금', `<span class="cs-n">${csAmt(o.out)}</span>`)}${csTd('건수', `<span class="cs-n">${o.n}</span>`)}</tr>`; }).join('')}</tbody></table>`
      : '<div class="empty">해당 거래 없음</div>';
  }
  return `<section class="card cs-sum"><div class="card-head"><h2>분류별 합계</h2><span class="meta">${CS.sum === 'grid' ? '최근 12개월' : mon === 'all' ? '전체 기간' : `${mon.slice(0, 4)}.${mon.slice(5)}`}</span><div class="act">${seg}</div></div>${body}</section>`;
}
function csCatsEdit() {
  const used = (n) => CS.f.tx.d.items.filter((x) => x.cat === n).length;
  const list = csCats().map((c) => ({ ...c, old: c.name }));
  openSheet(`<h3>분류 관리</h3><div class="cs-cats" id="cs-cats"></div><button type="button" class="btn sm" data-catadd>${ico('plus', 'sm')}분류 추가</button>
    <div class="cs-foot"><button type="button" class="btn" data-close>취소</button><button type="button" class="btn primary" data-catsave>저장</button></div>`, (el, close) => {
    const box = el.querySelector('#cs-cats'), mark = csSheetGuard(el, close);
    const draw = () => { box.innerHTML = list.map((c, i) => `<div class="cs-catrow"><input class="input" data-cn="${i}" value="${esc(c.name)}" maxlength="30" aria-label="분류 이름"><select class="select" data-ct="${i}" aria-label="구분">${['지출', '수입', '제외'].map((t) => `<option ${t === c.type ? 'selected' : ''}>${t}</option>`).join('')}</select><label class="cs-sub cs-pl" title="받는 분, 건별 금액 없이 달별 합계로만 저장"><input type="checkbox" data-cpay="${i}" ${c.pay ? 'checked' : ''}>합계만</label><span class="cs-sub cs-n">${c.old ? `${used(c.old)}건` : ''}</span><button type="button" class="btn ghost sm" data-cd="${i}" aria-label="지우기">${ico('trash', 'sm')}</button></div>`).join(''); };
    draw();
    box.addEventListener('input', (e) => { const i = e.target.dataset.cn; if (i != null) list[i].name = e.target.value; });
    box.addEventListener('change', (e) => { const i = e.target.dataset.ct; if (i != null) list[i].type = e.target.value; const j = e.target.dataset.cpay; if (j != null) list[j].pay = e.target.checked; });
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-cd]'); if (!b) return; const c = list[b.dataset.cd]; if (c.old && used(c.old) && !confirm(`${c.old} 분류 거래 ${used(c.old)}건은 미분류가 됩니다. 지울까요?`)) return; list.splice(Number(b.dataset.cd), 1); mark(); draw(); });
    el.querySelector('[data-catadd]').onclick = () => { list.push({ name: '', type: '지출', old: '' }); mark(); draw(); box.querySelector(`[data-cn="${list.length - 1}"]`)?.focus(); };
    el.querySelector('[data-close]').onclick = () => close();
    el.querySelector('[data-catsave]').onclick = () => {
      const out = list.map((c) => ({ ...c, name: csNorm(c.name) })).filter((c) => c.name);
      if (new Set(out.map((c) => c.name)).size !== out.length) { toast('같은 이름의 분류가 있습니다'); return; }
      const ren = Object.fromEntries(out.filter((c) => c.old && c.old !== c.name).map((c) => [c.old, c.name]));
      const gone = new Set(list.filter((c) => c.old).map((c) => c.old).filter((n) => !out.some((c) => c.old === n)));
      const cats = out.map(({ name, type, pay }) => ({ name, type, pay: !!pay }));
      const payNew = new Set(out.filter((c) => c.pay).map((c) => c.name)), wasPay = new Set(csCats().filter((c) => c.pay).map((c) => c.name));
      const np = CS.f.tx.d.items.filter((x) => !x.pay && x.cat && payNew.has(ren[x.cat] || x.cat) && !wasPay.has(x.cat)).length;
      if (np && !confirm(`합계만 저장으로 바꾼 분류의 거래 ${np}건은 받는 분, 건별 금액 없이 달별 합계에 합쳐집니다. 되돌릴 수 없습니다. 저장할까요?`)) return;
      close();
      csAct('tx', (d) => {
        d.cats = cats;
        for (const x of d.items) { if (ren[x.cat]) x.cat = ren[x.cat]; else if (gone.has(x.cat)) { x.cat = ''; x.sug = false; } if (x.pay) { x.id = x.k = csPayId(x.src, x.acct || x.card || '', x.cat, csYm(x.date)); x.desc = `${x.cat || '급여'} ${csYm(x.date)}`; } }
        for (const x of [...d.items]) if (!x.pay && x.cat && payNew.has(x.cat)) csPayAdd(d, x, x.cat);
        csPayStrip(d);
      });
      if (Object.keys(ren).length || gone.size) csAct('plan', (d) => { for (const x of d.items) { if (ren[x.cat]) x.cat = ren[x.cat]; else if (gone.has(x.cat)) x.cat = ''; } });
    };
  });
}
function csImpsList() {
  const imps = [...CS.f.tx.d.imports].reverse();
  const cnt = (id) => CS.f.tx.d.items.filter((x) => x.imp === id).length;
  openSheet(`<h3>올린 파일</h3>${imps.length ? `<div class="cs-imps">${imps.map((m) => `<div class="cs-imp"><div><div class="cs-desc">${esc(m.file)}</div><div class="cs-sub">${esc(m.src === 'card' ? m.card || '카드' : csAccs().find((a) => a.id === m.acct)?.name || '계좌')} / ${csWhen(m.at)} / ${cnt(m.id)}건</div></div><button type="button" class="btn sm" data-impdel="${esc(m.id)}">거래 지우기</button></div>`).join('')}</div>` : '<div class="empty">올린 파일 없음</div>'}`, (el, close) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-impdel]'); if (!b) return;
      const id = b.dataset.impdel, m = CS.f.tx.d.imports.find((x) => x.id === id);
      if (!confirm(`${m?.file || ''}에서 올린 거래 ${cnt(id)}건을 지울까요? 붙인 분류와 메모도 지워지고, 급여 합계 줄은 남습니다.`)) return;
      close(); csAct('tx', (d) => { d.items = d.items.filter((x) => x.imp !== id); d.imports = d.imports.filter((x) => x.id !== id); });
    });
  });
}
const csWhen = (iso) => { const d = new Date(iso); return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* 엑셀 올리기: 열 이름으로 날짜·내용·입금·출금·잔액(은행) 또는 금액(카드)을 찾고, 못 찾으면 사용자가 고른다.
   주거래 은행은 신한은행(11/20 확정). 신한 거래내역 엑셀은 맨 위에 계좌·조회기간 줄이 몇 줄 있고 그 아래 머리글
   '거래일자, 거래시간, 적요, 출금(원), 입금(원), 내용, 잔액(원), 거래점'이 오는 것으로 보고 맞춤(공개 자료로 추정, 실물 파일로 확인 전).
   그래서 머리글 줄은 위 40줄에서 열 이름이 가장 많이 맞는 줄로 찾는다. 열 이름의 (원)·공백은 떼고 비교 */
const CS_COLS = {
  date: [/^(거래|이용|승인|매출|사용|결제)?(일자|일시|날짜|년월일)$/, /^(거래일|이용일|승인일|매출일|사용일|date|transactiondate)$/],
  time: [/^(거래|이용|승인)?(시간|시각)$/, /^time$/],
  desc: [/^(이용)?(가맹점|가맹점명)$|^(이용처|사용처|상호|상호명|거래처|거래처명)$/, /^(내용|거래내용|기재내용|입금자|입금자명|받는분|보낸분|받는분통장표시|내통장표시|의뢰인|수취인|통장메모|description)$/],
  desc2: [/^(적요|거래구분|거래종류|거래방법|입출금구분|구분|memo)$/],
  in: [/^(입금|입금액|입금금액|맡기신금액|맡긴금액|받으신금액|deposit|credit)$/],
  out: [/^(출금|출금액|출금금액|찾으신금액|지급|지급액|지급금액|withdrawal|debit)$/],
  amt: [/^(이용|승인|결제|거래|매출|사용|청구)?금액$|^이용금액원화$|^amount$/],
  bal: [/^(거래후)?(잔액|잔고)$|^balance$/],
  appr: [/^승인번호$/],
  cancel: [/^(취소|취소여부|취소구분|승인상태|매출구분|거래상태|승인구분|상태)$/],
};
const CS_FLD = { bank: [['date', '날짜'], ['time', '시간'], ['desc', '내용'], ['desc2', '적요'], ['in', '입금'], ['out', '출금'], ['bal', '잔액']], card: [['date', '날짜'], ['time', '시간'], ['desc', '가맹점'], ['amt', '금액'], ['appr', '승인번호'], ['cancel', '취소 구분']] };
const csHN = (v) => String(v ?? '').replace(/\(.*?\)|\[.*?\]|※|\*/g, '').replace(/\s+/g, '').toLowerCase();
function csGuess(rows) {
  let best = { i: -1, n: 0, map: null };
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const hs = rows[i].map(csHN), map = {}, used = new Set();
    for (const [f, res] of Object.entries(CS_COLS)) for (const re of res) { const j = hs.findIndex((h, k) => h && !used.has(k) && re.test(h)); if (j >= 0) { map[f] = j; used.add(j); break; } }
    const n = Object.keys(map).length;
    if (map.date != null && n > best.n) best = { i, n, map };
  }
  if (best.i < 0) return { hdr: 0, src: 'bank', map: {} };
  const m = best.map;
  return { hdr: best.i, src: m.in != null || m.out != null ? 'bank' : 'card', map: m };
}
function csParse(rows, cfg) {
  const m = cfg.map, out = [], at = (r, f) => (m[f] != null && m[f] >= 0 ? r[m[f]] : '');
  let bad = 0;
  for (let i = cfg.hdr + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r || r.every((c) => c === '' || c == null)) continue;
    const dt = csDate(at(r, 'date'));
    if (!dt) { bad++; continue; }
    const time = csTime(at(r, 'time')) || dt.t;
    let inn = 0, outv = 0;
    if (cfg.src === 'bank') { inn = Math.abs(csNum(at(r, 'in'))); outv = Math.abs(csNum(at(r, 'out'))); }
    else {
      let a = csNum(at(r, 'amt')); if (/취소/.test(String(at(r, 'cancel')))) a = -Math.abs(a);
      if (a >= 0) outv = a; else inn = -a;
    }
    if (!inn && !outv) { bad++; continue; }
    const bv = at(r, 'bal');
    out.push({ date: dt.d, time, desc: csNorm(at(r, 'desc')), desc2: cfg.src === 'bank' ? csNorm(at(r, 'desc2')) : '', in: inn, out: outv,
      bal: cfg.src === 'bank' && m.bal != null && m.bal >= 0 && String(bv).trim() !== '' ? csNum(bv) : null, appr: csNorm(at(r, 'appr')), row: i });
  }
  // 열쇠: 같은 파일 안 똑같은 거래(같은 날 같은 가맹점 같은 금액)는 몇 번째인지까지 넣어 따로 친다
  const seen = new Map();
  for (const x of out) {
    const base = cfg.src === 'bank' ? ['bank', cfg.acct || '', x.date, x.time, x.desc, x.desc2, x.in, x.out, x.bal ?? ''].join('|') : ['card', x.date, x.time, x.desc, x.in, x.out, x.appr].join('|');
    const n = seen.get(base) || 0; seen.set(base, n + 1); x.k = csHash(`${base}#${n}`);
  }
  return { rows: out, bad };
}
// 같은 거래처는 지난번 분류를 먼저 제안. 처음 보는 곳은 몇 가지 낱말로만
function csSuggest(x, src) {
  if (x.out && csPayCat() && CS_PAY_RE.test(`${x.desc} ${x.desc2}`)) return csPayCat();
  const items = CS.f.tx.d.items, key = csNorm(x.desc || x.desc2).toLowerCase();
  if (key) {
    let best = null;
    for (const y of items) if (y.cat && !y.sug && csNorm(y.desc || y.desc2).toLowerCase() === key && (!best || y.date > best.date)) best = y;
    if (best) return best.cat;
  }
  const has = (n) => csCats().some((c) => c.name === n);
  const t = `${x.desc} ${x.desc2}`;
  if (src === 'bank' && x.out && /카드/.test(t) && has('카드대금')) return '카드대금';
  if (x.in && /이자|결산/.test(t) && has('이자수익')) return '이자수익';
  return '';
}
async function csLoadXlsx() {
  if (window.XLSX) return;
  const v = (/[?&]v=([^&]+)/.exec(document.querySelector('script[src*="app.js"]')?.src || '') || [])[1];
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = `vendor/xlsx.full.min.js${v ? `?v=${v}` : ''}`; s.onload = res; s.onerror = () => rej(new Error('엑셀 읽기 도구를 불러오지 못했습니다')); document.head.appendChild(s); });
}
async function csReadBook(file) {
  await csLoadXlsx();
  const buf = new Uint8Array(await file.arrayBuffer());
  let i = 0; while (i < buf.length && i < 64 && (buf[i] <= 32 || buf[i] === 0xEF || buf[i] === 0xBB || buf[i] === 0xBF)) i++;
  const texty = buf[i] === 0x3C /* < */ || /\.(csv|txt|html?)$/i.test(file.name);
  if (texty) { // 은행 엑셀 중에는 .xls 이름의 HTML이 많다. UTF-8이 아니면 EUC-KR로
    let s; try { s = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { s = new TextDecoder('euc-kr').decode(buf); }
    return XLSX.read(s.replace(/^﻿/, ''), { type: 'string', raw: false });
  }
  return XLSX.read(buf, { type: 'array', codepage: 949 });
}
const csColName = (j) => { let s = ''; j++; while (j) { const r = (j - 1) % 26; s = String.fromCharCode(65 + r) + s; j = Math.floor((j - 1) / 26); } return s; };
async function csImport(file) {
  let wb;
  try { wb = await csReadBook(file); } catch (e) { toast(e.message?.includes('도구') ? e.message : '엑셀 파일을 읽지 못했습니다'); return; }
  const sheets = wb.SheetNames.map((n) => ({ n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
  let si = sheets.reduce((b, s, i) => (s.rows.length > sheets[b].rows.length ? i : b), 0);
  if (!sheets[si]?.rows.length) { toast('빈 파일입니다'); return; }
  const sigOf = (rows, h) => (rows[h] || []).map(csHN).join('|');
  let cfg;
  const setSheet = () => {
    const g = csGuess(sheets[si].rows), saved = CS.f.tx.d.maps[sigOf(sheets[si].rows, g.hdr)];
    cfg = { hdr: g.hdr, src: saved?.src || g.src, map: { ...g.map, ...(saved?.map || {}) }, acct: cfg?.acct ?? (csAccs()[0]?.id || ''), card: cfg?.card ?? '법인카드' };
  };
  setSheet();
  openSheet('<h3>엑셀 올리기</h3><div id="cs-imp"></div>', (el, close) => {
    const box = el.querySelector('#cs-imp');
    const draw = () => {
      const rows = sheets[si].rows, hs = rows[cfg.hdr] || [], ncol = Math.max(...rows.slice(cfg.hdr, cfg.hdr + 30).map((r) => r.length), hs.length);
      const p = csParse(rows, cfg), seen = csSeen(CS.f.tx.d), pc = csPayCat();
      const fresh = p.rows.filter((x) => !seen(x.k)), payN = pc ? fresh.filter((x) => csSuggest(x, cfg.src) === pc).length : 0;
      const colOpts = (f) => `<option value="-1">없음</option>${Array.from({ length: ncol }, (_, j) => `<option value="${j}" ${cfg.map[f] === j ? 'selected' : ''}>${csColName(j)} ${esc(String(hs[j] ?? '').slice(0, 20))}</option>`).join('')}`;
      box.innerHTML = `<div class="cs-sub cs-file">${esc(file.name)}</div>
        ${sheets.length > 1 ? `<div class="field"><label>시트</label><select class="select" data-is aria-label="시트">${sheets.map((s, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${esc(s.n)}</option>`).join('')}</select></div>` : ''}
        <div class="cs-pair"><div class="field"><label>종류</label><div class="seg">${[['bank', '은행'], ['card', '카드']].map(([k, t]) => `<button type="button" data-isrc="${k}" class="${cfg.src === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
          <div class="field"><label>머리글 줄</label><input class="input" type="number" min="1" max="${rows.length}" data-ihdr value="${cfg.hdr + 1}" aria-label="머리글 줄"></div></div>
        ${cfg.src === 'bank' ? `<div class="field"><label>계좌</label><select class="select" data-iacct aria-label="계좌">${csAccs().map((a) => `<option value="${esc(a.id)}" ${a.id === cfg.acct ? 'selected' : ''}>${esc(a.name)}${a.last4 ? ` ${esc(a.last4)}` : ''}</option>`).join('')}<option value="" ${!cfg.acct ? 'selected' : ''}>계좌 지정 안 함</option></select></div>`
          : `<div class="field"><label>카드 이름</label><input class="input" data-icard value="${esc(cfg.card)}" maxlength="30" autocomplete="off" aria-label="카드 이름"></div>`}
        <div class="cs-map">${CS_FLD[cfg.src].map(([f, t]) => `<div class="field"><label>${t}</label><select class="select" data-im="${f}" aria-label="${t}">${colOpts(f)}</select></div>`).join('')}</div>
        <div class="cs-prev">${p.rows.length ? `<table class="tbl"><thead><tr><th>날짜</th><th>내용</th><th>입금</th><th>출금</th><th>잔액</th></tr></thead><tbody>${p.rows.slice(0, 5).map((x) => `<tr><td class="cs-n">${yymd(x.date)}</td><td class="cs-desc">${esc(x.desc || x.desc2)}</td><td class="cs-n">${csAmt(x.in)}</td><td class="cs-n">${csAmt(x.out)}</td><td class="cs-n">${x.bal != null ? csWon(x.bal) : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">읽은 거래 없음</div>'}</div>
        <div class="cs-cnt">새 거래 <b>${fresh.length}</b>건 / 이미 있음 ${p.rows.length - fresh.length}건${p.bad ? ` / 건너뛴 줄 ${p.bad}` : ''}</div>
        ${payN ? `<label class="cs-paychk"><input type="checkbox" data-ipay ${cfg.pay !== false ? 'checked' : ''}>${esc(pc)} ${payN}건은 받는 분, 건별 금액 없이 달별 합계로 저장</label>` : ''}
        <div class="cs-foot"><button type="button" class="btn" data-close>취소</button><button type="button" class="btn primary" data-igo ${fresh.length && cfg.map.date >= 0 ? '' : 'disabled'}>올리기</button></div>`;
    };
    draw();
    box.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-is]')) { si = Number(t.value); setSheet(); }
      else if (t.matches('[data-ihdr]')) { cfg.hdr = Math.max(0, Math.min(sheets[si].rows.length - 1, (Number(t.value) || 1) - 1)); const g = csGuess([sheets[si].rows[cfg.hdr]]); if (g.map.date != null) cfg.map = g.map; }
      else if (t.matches('[data-iacct]')) cfg.acct = t.value;
      else if (t.matches('[data-icard]')) cfg.card = t.value.trim();
      else if (t.matches('[data-im]')) cfg.map[t.dataset.im] = Number(t.value);
      else if (t.matches('[data-ipay]')) { cfg.pay = t.checked; return; }
      else return;
      draw();
    });
    box.addEventListener('click', (e) => {
      const s = e.target.closest('[data-isrc]'); if (s) { cfg.src = s.dataset.isrc; draw(); return; }
      if (e.target.closest('[data-close]')) { close(); return; }
      if (!e.target.closest('[data-igo]')) return;
      const rows = sheets[si].rows, p = csParse(rows, cfg), sig = sigOf(rows, cfg.hdr), at = new Date().toISOString();
      const imp = { id: uid(), at, file: file.name.slice(0, 120), src: cfg.src, acct: cfg.src === 'bank' ? cfg.acct : '', card: cfg.src === 'card' ? cfg.card || '카드' : '', n: 0 };
      const recs = p.rows.map((x) => ({ id: x.k, k: x.k, imp: imp.id, src: cfg.src, acct: imp.acct, card: imp.card, date: x.date, time: x.time, desc: x.desc, desc2: x.desc2, in: x.in, out: x.out, bal: x.bal, seq: x.row, cat: '', sug: false, memo: '' }));
      const pay = cfg.pay !== false;
      // 은행 파일은 최근 거래가 위에 오기도 하고 아래에 오기도 한다. 같은 시각이면 파일 안 순서로 가장 늦은 줄을 고른다
      const desc = recs.length > 1 && `${recs[0].date}${recs[0].time}` > `${recs[recs.length - 1].date}${recs[recs.length - 1].time}`;
      if (desc) recs.forEach((x) => { x.seq = rows.length - x.seq; });
      close();
      // 계좌 잔고는 저장 전 거래(메모리)에서 고른다: 급여가 든 달은 거래 잔액을 지우기 때문
      let lb = null;
      for (const x of recs) if (x.bal != null) { const key = `${x.date} ${x.time || ''} ${String(x.seq).padStart(6, '0')}`; if (!lb || key > lb.key) lb = { key, bal: x.bal, date: x.date }; }
      let added = 0, paid = 0;
      csAct('tx', (d) => {
        const seen = csSeen(d), add = recs.filter((x) => !seen(x.k)), pc = csPayCat();
        added = add.length; paid = 0;
        for (const x of add) {
          x.cat = ''; x.sug = false;
          const c = csSuggest(x, cfg.src);
          if (c && c === pc) { if (pay) { csPayAdd(d, x, pc); paid++; continue; } }
          else if (c) { x.cat = c; x.sug = true; }
          d.items.push(x);
        }
        csPayStrip(d);
        if (add.length && !d.imports.some((m) => m.id === imp.id)) d.imports.push({ ...imp, n: add.length });
        d.maps[sig] = { src: cfg.src, map: cfg.map };
      });
      toast(paid ? `${added}건 올림, 급여 ${paid}건은 합계로` : `${added}건 올림`);
      if (cfg.src === 'bank' && cfg.acct && cfg.map.bal >= 0 && lb) {
        const tb = { bal: lb.bal, date: lb.date };
        csAct('acc', (d) => { const y = d.items.find((z) => z.id === cfg.acct); if (!y) return; if (!y.tb || tb.date >= y.tb.date) y.tb = tb; if (!y.balAt || tb.date >= y.balAt) { y.bal = tb.bal; y.balAt = tb.date; y.balSrc = '거래내역'; } });
      }
    });
  }, 'cs-impsheet');
}

/* 3. 자금계획 */
function csOccurs(p, ym) {
  const st = p.start || csThisYm();
  if (ym < st || (p.end && ym > p.end)) return false;
  const n = csYmDiff(st, ym);
  return { 매월: true, 분기: n % 3 === 0, 반기: n % 6 === 0, 매년: n % 12 === 0, '한 번': n === 0 }[p.freq || '매월'] ?? false;
}
function csActual(ym) { // 그 달 분류별 실제 금액(지출 분류는 출금-입금, 수입 분류는 입금-출금)
  const m = new Map();
  for (const x of CS.f.tx.d.items) {
    if (csYm(x.date) !== ym) continue;
    const t = csCatType(x.cat); if (t === '제외') continue;
    const k = x.cat || '', o = m.get(k) || 0;
    m.set(k, o + (t === '수입' ? (x.in || 0) - (x.out || 0) : t === '지출' ? (x.out || 0) - (x.in || 0) : (x.in || 0) - (x.out || 0)));
  }
  return m;
}
function csForecast() {
  const P = CS.f.plan.d, ym0 = csThisYm(), act0 = csActual(ym0), used = new Map(), rows = [];
  let bal = csTotal();
  for (let i = 0; i < 12; i++) {
    const ym = csYmAdd(ym0, i);
    let inn = 0, out = 0;
    for (const p of P.items) {
      if (!csOccurs(p, ym)) continue;
      let a = Number(p.amt) || 0;
      if (i === 0 && p.cat) { const done = act0.get(p.cat) || 0, u = used.get(p.cat) || 0, take = Math.min(a, Math.max(0, done - u)); used.set(p.cat, u + take); a -= take; } // 이번 달은 이미 나간·들어온 만큼 뺀다
      if (p.type === '수입') inn += a; else out += a;
    }
    for (const w of P.wc) { const wy = w.due ? csYm(w.due) : ym0; if ((i === 0 && wy <= ym0) || wy === ym) { if (w.type === '받을 돈') inn += Number(w.amt) || 0; else out += Number(w.amt) || 0; } }
    bal += inn - out; rows.push({ ym, inn, out, bal });
  }
  const avg = (t) => { let s = 0; for (let i = 0; i < 12; i++) { const ym = csYmAdd(ym0, i); for (const p of P.items) if (p.type === t && csOccurs(p, ym)) s += Number(p.amt) || 0; } return s / 12; };
  const aOut = avg('지출'), aIn = avg('수입'), burn = aOut - aIn;
  return { rows, aOut, aIn, burn, runway: burn > 0 ? csTotal() / burn : null, short: rows.find((r) => r.bal < 0)?.ym || '' };
}
function csPlanHTML() {
  const P = CS.f.plan.d, f = csForecast(), tot = csTotal();
  const recv = P.wc.filter((w) => w.type === '받을 돈').reduce((s, w) => s + (Number(w.amt) || 0), 0), pay = P.wc.filter((w) => w.type === '줄 돈').reduce((s, w) => s + (Number(w.amt) || 0), 0);
  const lastAt = csAccs().map((a) => a.balAt).filter(Boolean).sort().pop();
  const tiles = `<div class="tiles cs-tiles">${csTile('계좌 잔고', csV(tot), 'blue', lastAt ? `${yymd(lastAt)} 기준` : '')}${csTile('월 고정 지출', csV(f.aOut), 'red', '12개월 평균')}${csTile('월 예정 수입', csV(f.aIn), 'green', '12개월 평균')}
    ${csTile('버티는 개월 수', f.runway == null ? (P.items.length ? '흑자' : '-') : `${f.runway >= 100 ? '100+' : f.runway.toFixed(1)}<small>개월</small>`, f.runway != null && f.runway < 6 ? 'red' : 'violet', f.short ? `잔고 부족 ${csYmTxt(f.short)}` : '')}</div>`;
  const plan = `<section class="card"><div class="card-head"><h2>고정비·수입 계획<span class="n">${P.items.length}</span></h2><div class="act"><button type="button" class="btn primary sm" data-padd>${ico('plus', 'sm')}항목 추가</button></div></div>
    ${P.items.length ? `<table class="tbl cs-tbl"><thead><tr><th>항목</th><th>구분</th><th>분류</th><th>금액</th><th>주기</th><th>기간</th><th>메모</th></tr></thead><tbody>
      ${P.items.map((p) => `<tr class="row" data-pid="${esc(p.id)}">${csTd('항목', `<span class="name">${esc(p.name)}</span>`)}${csTd('구분', esc(p.type))}${csTd('분류', esc(p.cat || ''))}${csTd('금액', `<span class="cs-n ${p.type === '수입' ? 'cs-in' : ''}">${csWon(p.amt)}</span>`)}${csTd('주기', esc(p.freq || '매월'))}${csTd('기간', `<span class="cs-n">${esc(p.freq === '한 번' ? (p.start ? csYmTxt(p.start) : '') : `${p.start ? csYmTxt(p.start) : ''} ～ ${p.end ? csYmTxt(p.end) : ''}`.trim())}</span>`)}${csTd('메모', esc(p.memo || ''))}</tr>`).join('')}</tbody></table>` : '<div class="empty">계획 항목 없음</div>'}</section>`;
  const wc = `<section class="card"><div class="card-head"><h2>운전자본</h2><div class="act"><button type="button" class="btn sm" data-wadd>${ico('plus', 'sm')}받을 돈, 줄 돈</button></div></div>
    <div class="cs-wc">${[['현금성 자산', tot], ['받을 돈', recv], ['줄 돈', pay], ['순운전자본', tot + recv - pay]].map(([k, v]) => `<div><span>${k}</span><b class="cs-n ${v < 0 ? 'cs-neg' : ''}">${csWon(v)}</b></div>`).join('')}</div>
    ${P.wc.length ? `<table class="tbl cs-tbl"><thead><tr><th>항목</th><th>구분</th><th>금액</th><th>예정일</th><th>메모</th></tr></thead><tbody>
      ${P.wc.map((w) => `<tr class="row" data-wid="${esc(w.id)}">${csTd('항목', `<span class="name">${esc(w.name)}</span>`)}${csTd('구분', esc(w.type))}${csTd('금액', `<span class="cs-n">${csWon(w.amt)}</span>`)}${csTd('예정일', w.due ? `<span class="cs-n">${yymd(w.due)}</span>` : '')}${csTd('메모', esc(w.memo || ''))}</tr>`).join('')}</tbody></table>` : ''}</section>`;
  const fc = `<section class="card"><div class="card-head"><h2>12개월 월말 잔고</h2></div>
    <table class="tbl cs-tbl cs-fc"><thead><tr><th>월</th><th>들어올 돈</th><th>나갈 돈</th><th>순</th><th>월말 잔고</th></tr></thead><tbody>
    ${f.rows.map((r, i) => `<tr>${csTd('월', `<span class="cs-n">${csYmTxt(r.ym)}</span>${i === 0 ? ' <span class="cs-sub" title="이번 달 이미 오간 금액을 뺀 남은 계획">남은 금액</span>' : ''}`)}${csTd('들어올 돈', `<span class="cs-n cs-in">${csAmt(r.inn)}</span>`)}${csTd('나갈 돈', `<span class="cs-n">${csAmt(r.out)}</span>`)}${csTd('순', `<span class="cs-n ${r.inn - r.out < 0 ? 'cs-neg' : ''}">${csWon(r.inn - r.out)}</span>`)}${csTd('월말 잔고', `<b class="cs-n ${r.bal < 0 ? 'cs-neg' : ''}">${csWon(r.bal)}</b>`)}</tr>`).join('')}</tbody></table></section>`;
  return tiles + plan + fc + csPvaHTML() + wc;
}
function csPvaHTML() {
  const P = CS.f.plan.d, mons = [...new Set(CS.f.tx.d.items.map((x) => csYm(x.date)))].filter((m) => m <= csThisYm()).sort().reverse();
  const prev = csYmAdd(csThisYm(), -1), ym = CS.pva && mons.includes(CS.pva) ? CS.pva : mons.includes(prev) ? prev : mons[0] || prev;
  const plan = new Map(), act = csActual(ym);
  for (const p of P.items) if (csOccurs(p, ym)) { const k = p.cat || p.name, o = plan.get(k) || { amt: 0, type: p.type }; o.amt += Number(p.amt) || 0; plan.set(k, o); }
  const keys = [...new Set([...plan.keys(), ...act.keys()])].sort((a, b) => ((plan.get(a)?.type || csCatType(a)) === '수입') - ((plan.get(b)?.type || csCatType(b)) === '수입') || (plan.get(b)?.amt || 0) - (plan.get(a)?.amt || 0));
  const rows = keys.map((k) => {
    const type = plan.get(k)?.type || csCatType(k) || '', pl = plan.get(k)?.amt || 0, ac = act.get(k) || 0, df = ac - pl;
    const bad = type === '수입' ? df < 0 : type === '지출' && df > 0;
    return `<tr>${csTd('분류', esc(k || '미분류'))}${csTd('구분', esc(type))}${csTd('계획', `<span class="cs-n">${plan.has(k) ? csWon(pl) : ''}</span>`)}${csTd('실적', `<span class="cs-n">${csWon(ac)}</span>`)}${csTd('차이', `<span class="cs-n ${df && bad ? 'cs-neg' : ''}">${df > 0 ? '+' : ''}${csWon(df)}</span>`)}</tr>`;
  }).join('');
  return `<section class="card"><div class="card-head"><h2>계획 대비 실적</h2><div class="act"><select class="select" data-pva aria-label="달">${(mons.length ? mons : [prev]).map((m) => `<option value="${m}" ${m === ym ? 'selected' : ''}>${m.slice(0, 4)}.${m.slice(5)}</option>`).join('')}</select></div></div>
    ${keys.length ? `<table class="tbl cs-tbl"><thead><tr><th>분류</th><th>구분</th><th>계획</th><th>실적</th><th>차이</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">계획, 실적 없음</div>'}</section>`;
}
function csPlanEdit(id) {
  const x = CS.f.plan.d.items.find((p) => p.id === id) || { id: '', name: '', type: '지출', cat: '', amt: '', freq: '매월', start: csThisYm(), end: '', memo: '' };
  openSheet(`<h3>${x.id ? '계획 항목 수정' : '계획 항목 추가'}</h3><form class="cs-form">
    <div class="field"><label>항목</label><input class="input" name="name" value="${esc(x.name)}" maxlength="40" required autocomplete="off"></div>
    <div class="cs-pair"><div class="field"><label>구분</label><select class="select" name="type">${['지출', '수입'].map((t) => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>분류</label><select class="select" name="cat">${csCatOpts(x.cat).replace('>미분류<', '>없음<')}</select></div></div>
    <div class="cs-pair"><div class="field"><label>금액</label><input class="input cs-money" name="amt" value="${x.amt === '' ? '' : csWon(x.amt)}" inputmode="numeric" required autocomplete="off"></div>
      <div class="field"><label>주기</label><select class="select" name="freq">${CS_FREQ.map((t) => `<option ${t === (x.freq || '매월') ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
    <div class="cs-pair"><div class="field"><label>시작 월</label><input class="input" type="month" name="start" value="${esc(x.start || '')}"></div>
      <div class="field"><label>끝 월</label><input class="input" type="month" name="end" value="${esc(x.end || '')}"></div></div>
    <div class="field"><label>메모</label><input class="input" name="memo" value="${esc(x.memo || '')}" maxlength="200" autocomplete="off"></div>
    <div class="cs-foot">${x.id ? '<button type="button" class="btn ghost cs-del" data-del>삭제</button>' : ''}<button type="button" class="btn" data-close>취소</button><button type="submit" class="btn primary">저장</button></div></form>`, (el, close) => {
    const f = el.querySelector('form'); csMoneyInputs(f); csSheetGuard(el, close);
    const nm = f.querySelector('[name=name]'); nm.addEventListener('change', () => { if (!f.cat.value && csCats().some((c) => c.name === nm.value.trim())) f.cat.value = nm.value.trim(); }); // 항목 이름이 분류와 같으면 분류로
    f.querySelector('[data-close]').onclick = () => close();
    f.querySelector('[data-del]')?.addEventListener('click', () => { if (!confirm(`${x.name} 항목을 지울까요?`)) return; close(); csAct('plan', (d) => { d.items = d.items.filter((p) => p.id !== x.id); }); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      if (v.end && v.start && v.end < v.start) { toast('끝 월이 시작 월보다 앞입니다'); return; }
      const rec = { id: x.id || uid(), name: v.name.trim(), type: v.type, cat: v.cat, amt: csNum(v.amt), freq: v.freq, start: v.start || csThisYm(), end: v.end || '', memo: v.memo.trim() };
      close(); csAct('plan', (d) => { const i = d.items.findIndex((p) => p.id === rec.id); if (i >= 0) d.items[i] = rec; else d.items.push(rec); });
    });
  });
}
function csWcEdit(id) {
  const x = CS.f.plan.d.wc.find((w) => w.id === id) || { id: '', name: '', type: '받을 돈', amt: '', due: '', memo: '' };
  openSheet(`<h3>${x.id ? '운전자본 항목 수정' : '운전자본 항목 추가'}</h3><form class="cs-form">
    <div class="field"><label>항목</label><input class="input" name="name" value="${esc(x.name)}" maxlength="40" required autocomplete="off"></div>
    <div class="cs-pair"><div class="field"><label>구분</label><select class="select" name="type">${['받을 돈', '줄 돈'].map((t) => `<option ${t === x.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>금액</label><input class="input cs-money" name="amt" value="${x.amt === '' ? '' : csWon(x.amt)}" inputmode="numeric" required autocomplete="off"></div></div>
    <div class="field"><label>예정일</label><input class="input" type="date" name="due" value="${esc(x.due || '')}"></div>
    <div class="field"><label>메모</label><input class="input" name="memo" value="${esc(x.memo || '')}" maxlength="200" autocomplete="off"></div>
    <div class="cs-foot">${x.id ? '<button type="button" class="btn ghost cs-del" data-del>삭제</button>' : ''}<button type="button" class="btn" data-close>취소</button><button type="submit" class="btn primary">저장</button></div></form>`, (el, close) => {
    const f = el.querySelector('form'); csMoneyInputs(f); csSheetGuard(el, close);
    f.querySelector('[data-close]').onclick = () => close();
    f.querySelector('[data-del]')?.addEventListener('click', () => { if (!confirm(`${x.name} 항목을 지울까요?`)) return; close(); csAct('plan', (d) => { d.wc = d.wc.filter((w) => w.id !== x.id); }); });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      const rec = { id: x.id || uid(), name: v.name.trim(), type: v.type, amt: csNum(v.amt), due: fixYmd(v.due) || '', memo: v.memo.trim() };
      close(); csAct('plan', (d) => { const i = d.wc.findIndex((w) => w.id === rec.id); if (i >= 0) d.wc[i] = rec; else d.wc.push(rec); });
    });
  });
}

// ---------- 이벤트 ----------
document.addEventListener('click', (e) => {
  if (!csOn() || !e.target.closest('#cs-root')) return;
  const t = e.target;
  const tab = t.closest('[data-cst]'); if (tab) { location.hash = `#cash/${tab.dataset.cst}`; return; }
  if (t.closest('[data-acc-add]')) { csAccEdit(''); return; }
  const ar = t.closest('[data-acc]'); if (ar) { csAccEdit(ar.dataset.acc); return; }
  if (t.closest('[data-up]')) { $('#cs-file')?.click(); return; }
  if (t.closest('[data-cats]')) { csCatsEdit(); return; }
  if (t.closest('[data-imps]')) { csImpsList(); return; }
  if (t.closest('[data-more]')) { CS.lim += 300; csDraw(); return; }
  const sm = t.closest('[data-sum]'); if (sm) { CS.sum = sm.dataset.sum; viewSet('cash.sum', CS.sum); csDraw(); return; }
  const cg = t.closest('[data-catgo]'); if (cg) { CS.cat = cg.dataset.catgo; viewSet('cash.cat', CS.cat); CS.lim = 300; csDraw(); $('#cs-drop')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
  if (t.closest('[data-sug-ok]')) {
    const sl = csTxView().list.filter((x) => x.sug), ids = new Set(sl.map((x) => x.id)), np = sl.filter((x) => csIsPay(x.cat)).length;
    if (np && !confirm(`급여 제안 ${np}건은 받는 분, 건별 금액 없이 달별 합계에 합쳐집니다. 되돌릴 수 없습니다. 확정할까요?`)) return;
    csAct('tx', (d) => { for (const x of [...d.items]) if (ids.has(x.id) && !x.pay) { if (csIsPay(x.cat)) csPayAdd(d, x, x.cat); else x.sug = false; } csPayStrip(d); }); return;
  }
  const pd = t.closest('[data-paydel]');
  if (pd) { if (!confirm('이 달 급여 합계 줄을 지울까요? 다시 넣으려면 그 달 거래내역을 다시 올립니다.')) return; const id = pd.dataset.paydel; csAct('tx', (d) => { d.items = d.items.filter((x) => x.id !== id); }); return; }
  if (t.closest('[data-padd]')) { csPlanEdit(''); return; }
  const pr = t.closest('[data-pid]'); if (pr) { csPlanEdit(pr.dataset.pid); return; }
  if (t.closest('[data-wadd]')) { csWcEdit(''); return; }
  const wr = t.closest('[data-wid]'); if (wr) { csWcEdit(wr.dataset.wid); }
});
document.addEventListener('change', (e) => {
  if (!csOn() || !e.target.closest('#cs-root')) return;
  const t = e.target;
  if (t.id === 'cs-file') { const fl = t.files?.[0]; t.value = ''; if (fl) csImport(fl); return; }
  if (t.matches('[data-cat]')) {
    const id = t.dataset.cat, v = t.value;
    if (csIsPay(v)) {
      if (!confirm(`${v} 거래는 받는 분, 적요, 건별 금액 없이 그 달 ${v} 합계에 합쳐집니다. 되돌릴 수 없습니다. 합칠까요?`)) { t.value = CS.f.tx.d.items.find((y) => y.id === id)?.cat || ''; return; }
      csAct('tx', (d) => { const x = d.items.find((y) => y.id === id && !y.pay); if (x) { csPayAdd(d, x, v); csPayStrip(d); } }); return;
    }
    csAct('tx', (d) => { const x = d.items.find((y) => y.id === id); if (x) { x.cat = v; x.sug = false; } }); return;
  }
  if (t.matches('[data-memo]')) { const id = t.dataset.memo, v = t.value.trim(); csAct('tx', (d) => { const x = d.items.find((y) => y.id === id); if (x) x.memo = v; }, false); return; }
  if (t.matches('[data-pva]')) { CS.pva = t.value; viewSet('cash.pva', CS.pva); csDraw(); return; }
  const f = t.dataset.f;
  if (f === 'mon') { CS.mon = t.value; viewSet('cash.mon', CS.mon); }
  else if (f === 'src') { CS.src = t.value; viewSet('cash.src', CS.src); }
  else if (f === 'cat') { CS.cat = t.value; viewSet('cash.cat', CS.cat); }
  else return;
  CS.lim = 300; csDraw();
});
// 검색: 목록 부분만 다시 그려 검색칸은 그대로 둔다. 한글 조합 중엔 미루고 조합이 끝나면 반영(2026-11-26 규격 점검)
let csQT = null;
function csQApply(v) {
  CS.q2 = v; viewSet('cash.q', v); CS.lim = 300;
  const box = $('#cs-txlist'); if (!box) { csDraw(); return; }
  const { list } = csTxView();
  box.innerHTML = csTxListHTML(list);
  const n = $('#cs-txn'); if (n) n.textContent = list.length;
  const sb = $('#cs-sugb'); if (sb) sb.innerHTML = csSugBtn(list);
}
const csQSched = (i) => { clearTimeout(csQT); csQT = setTimeout(() => csQApply(i.value), 150); };
document.addEventListener('input', (e) => {
  if (!csOn() || !e.target.matches('#cs-root [data-f="q"]')) return;
  if (e.isComposing) { clearTimeout(csQT); return; }
  csQSched(e.target);
});
document.addEventListener('compositionend', (e) => { if (csOn() && e.target.matches?.('#cs-root [data-f="q"]')) csQSched(e.target); });
// 거래 카드에 엑셀 파일을 끌어다 놓아도 올린다. 자금 화면에선 카드 밖에 놓아도 브라우저가 그 파일로 이동하지 않게 막는다
let csDragT = null;
const csHasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const csDropEnd = () => { clearTimeout(csDragT); $('#cs-drop')?.classList.remove('drop', 'drop-in'); };
document.addEventListener('dragover', (e) => {
  if (!csOn() || !csHasFiles(e)) return;
  e.preventDefault();
  const z = $('#cs-drop'), inZ = !!e.target.closest?.('#cs-drop');
  e.dataTransfer.dropEffect = inZ ? 'copy' : 'none';
  if (z) { z.classList.add('drop'); z.classList.toggle('drop-in', inZ); }
  clearTimeout(csDragT); csDragT = setTimeout(csDropEnd, 1000); // dragleave를 놓쳐도 표시가 남지 않게
});
document.addEventListener('dragleave', (e) => { if (csOn() && !e.relatedTarget) csDropEnd(); });
document.addEventListener('dragend', () => { if (csOn()) csDropEnd(); });
document.addEventListener('drop', (e) => {
  if (!csOn() || !csHasFiles(e)) return;
  e.preventDefault(); csDropEnd();
  if (!e.target.closest?.('#cs-drop')) return;
  const fl = e.dataTransfer?.files?.[0]; if (fl) csImport(fl);
});

TAB_INFO.cash = {
  title: '자금',
  rows: [
    ['계좌', ['예치 통장, CMA, 정기예금을 직접 등록. 계좌번호는 끝 4자리만', '잔고는 직접 고치거나, 은행 거래내역을 올리면 그 계좌의 마지막 잔액으로 바뀜', '만기 30일 안은 주황색']],
    ['수입·지출', ['은행 거래내역과 법인카드 이용내역 엑셀(xlsx, xls, csv)을 올림. 같은 거래는 다시 올려도 한 번만 들어감', '열 이름으로 날짜, 내용, 입금, 출금, 잔액(카드는 금액)을 찾고, 못 찾으면 직접 고름. 고른 열은 같은 양식에 다시 씀', '같은 거래처는 지난 분류를 제안(회색). 분류를 고르거나 제안 확정을 누르면 확정', '급여, 상여, 성과급, 퇴직금 거래는 받는 분, 적요, 건별 금액 없이 계좌와 달별 급여 합계 한 줄로만 저장. 그 달 다른 거래의 잔액도 지움. 다른 거래를 급여로 바꾸면 그때 합쳐지고 되돌릴 수 없음', '제외 분류(자본금, 계좌 이체, 카드대금)는 수입, 지출 합계에서 뺌. 카드로 쓴 돈과 그 카드대금 출금이 두 번 잡히지 않게 하려는 것', '장부는 회계법인이 아마란스10에서 작성. 여기 숫자는 월 결산과 맞춰 보는 참고 값']],
    ['자금계획', ['매달 나가는 고정비와 들어올 돈을 주기별로 넣으면 앞으로 12개월 월말 잔고를 계산', '이번 달은 이미 오간 금액을 뺀 남은 계획만 반영', '버티는 개월 수 = 계좌 잔고 / (월 고정 지출 - 월 예정 수입), 12개월 평균', '계획 대비 실적은 수입·지출 탭의 분류별 실제 금액과 비교', '운전자본 = 계좌 잔고 + 받을 돈 - 줄 돈. 받을 돈, 줄 돈은 예정일 달의 잔고 계산에도 들어감']],
    ['저장 위치', '내 OneDrive SPACE WORKS/data/cash. 지금은 탁지원 계정에서만 보임'],
  ],
};
