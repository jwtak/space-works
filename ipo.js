/* SPACE WORKS — 딜소싱 › 신규상장: 신규 상장사 컨택 리스트 (작성책임자·재무·FI·락업·자금수요)
   매일 07:00 PC 작업(05. 딜소싱\_자동화\신규상장\daily.py)이 회사 OneDrive SPACE WORKS/data/ipo.json 을 올린다(이 화면은 읽기만).
   컨택 상태·메모는 data/ipo_marks.json — 다음 날 엑셀(딜소싱 리스트.xlsx)에도 반영된다.
   진입: renderIpo(host) — host 안에만 그린다. 홈 카드: ipoHomeBlock().
   app.js 전역($, esc, pad, ymd, parse, today, addDays, diffDays, md, ico, toast)과 graph.js 의 STORE 를 쓴다. */

const IPO_STATUS = ['미접촉', '연락함', '미팅', '보류'];
const IPO_FILTERS = [['all', '전체'], ['lock', '락업 30일'], ['direct', '직통번호'], ['todo', '미접촉'], ['fund', '조달 공시']];
const IPO_SORTS = [['listed', '상장일순'], ['lock', '락업 임박순'], ['mcap', '시총순']];
const IPO_TTL = 5 * 60000;
const IPO_FUND = /전환사채|교환사채|신주인수권부사채|유상증자/;

const ipoState = {
  data: null, marks: { items: [], version: null }, at: 0, loading: null,
  q: '', f: 'all', sort: 'listed', tab: 'contact', open: new Set(), dirty: new Map(), saving: Promise.resolve(), focus: null, host: null, field: null,
};

/* ---------- 데이터 ---------- */
function ipoLoad(force) {
  if (!force && ipoState.at && Date.now() - ipoState.at < IPO_TTL) return Promise.resolve();
  if (!ipoState.loading) {
    ipoState.loading = (async () => {
      // 저장 대기 중에 읽으면 대기 변경이 덮이므로 저장이 끝난 뒤 읽고, 아직 못 보낸 변경은 다시 얹는다
      let d, mk, s;
      do {
        s = ipoState.saving; await s.catch(() => {});
        [d, mk] = await Promise.all([STORE.readText('data/ipo.json'), ipoReadMarks()]);
      } while (s !== ipoState.saving);
      let data = null;
      if (d.text) { try { data = JSON.parse(d.text); } catch { throw new Error('신규상장 자료 형식이 올바르지 않습니다'); } }
      if (data !== null && (typeof data !== 'object' || Array.isArray(data) || (data.items != null && !Array.isArray(data.items)))) throw new Error('신규상장 자료 형식이 올바르지 않습니다');
      if (data) data.items = (data.items || []).filter((x) => x && typeof x === 'object' && !Array.isArray(x) && typeof x.code === 'string' && typeof x.listed === 'string').map(ipoNorm);
      ipoState.data = data;
      ipoState.marks = { items: ipoApplyDirty(mk.items), version: mk.version };
      ipoState.at = Date.now();
    })().finally(() => { ipoState.loading = null; });
  }
  return ipoState.loading;
}

function ipoNorm(x) {
  const td = today();
  const arr = (v) => (Array.isArray(v) ? v.filter((o) => o && typeof o === 'object') : []);
  const locks = arr(x.lockups).map((l) => ({ ...l, d: String(l['해제일'] || '').slice(0, 10) })).filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.d));
  // 상장일 당일 '유통가능' 행은 해제가 아니므로 다음 락업에서 뺀다
  const next = locks.filter((l) => l.d >= td && l.d > x.listed).sort((a, b) => a.d.localeCompare(b.d))[0] || null;
  const fund = arr(x.events).filter((e) => IPO_FUND.test(e.nm));
  const w = x.writer || {};
  return { ...x, locks, next, fund,
    _q: [x.name, x.code, x.sector, x.product, x.summary, x.fi, x.broker, w.name, x.discloser?.['성명']].join(' ').toLowerCase() };
}

const ipoFind = (code) => ipoState.data?.items.find((x) => x.code === code);
const ipoMark = (code) => ipoState.marks.items.find((m) => m.code === code);
const ipoSt = (code) => ipoMark(code)?.status || '미접촉';
const ipoNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/* 표시 저장: ipo_marks.json 은 탁지원·대표님 두 분이 같이 쓴다(편집 공유).
   dirty = 아직 저장 안 된 변경 {code → {patch(바뀐 필드만), seq, base(되돌릴 원본)}}.
   다른 사람이 먼저 저장했으면(409) 최신본을 다시 읽고 바뀐 필드만 얹어 한 번 더 저장한다.
   그 밖의 실패는 화면을 저장 전으로 되돌린다. */
let ipoSeq = 0;

// 표시 파일은 배열이다. 깨졌거나 배열이 아니면(객체·null) 빈 목록으로 보고 저장하면 다른 분 표시가 지워지므로 읽기를 멈추고 짧은 오류만 낸다(bad) — radar.js rdReadMarks와 같은 방식.
// 배열 안의 잡값(null·숫자 등)은 누구의 표시도 아니므로 빼고 읽는다(그대로 두면 목록을 그리다 멈춘다)
const IPO_MARKS_BAD = '컨택 상태 자료 형식이 올바르지 않습니다';
async function ipoReadMarks() {
  let r;
  try { r = await STORE.readJSON('ipo_marks'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; r = null; }
  if (!r || !Array.isArray(r.items)) { const err = new Error(IPO_MARKS_BAD); err.bad = true; throw err; }
  return { items: r.items.filter((m) => m && typeof m === 'object'), version: r.version };
}

function ipoApplyDirty(items) {
  ipoState.dirty.forEach((e, code) => {
    const k = items.findIndex((x) => x.code === code);
    const m = { ...(k >= 0 ? items[k] : { code, status: '미접촉', note: '' }), ...e.patch, name: e.name, at: e.at, by: e.by };
    if (k >= 0) items[k] = m; else items.push(m);
  });
  return items;
}

function ipoRollback(msg) {
  ipoState.dirty.forEach((e, code) => {
    const items = ipoState.marks.items, k = items.findIndex((x) => x.code === code);
    if (e.base) { if (k >= 0) items[k] = e.base; else items.push(e.base); } else if (k >= 0) items.splice(k, 1);
  });
  ipoState.dirty.clear();
  toast(msg);
  ipoDraw();
}

function ipoSaveMarks() {
  let merged = false;
  ipoState.saving = ipoState.saving.catch(() => {}).then(async () => { // 앞 저장이 예외로 끝나도 다음 저장은 돈다
    for (let i = 0; i < 3; i++) {
      if (!ipoState.dirty.size) return;
      const sent = new Map([...ipoState.dirty].map(([code, e]) => [code, { seq: e.seq, patch: { ...e.patch } }]));
      const body = ipoState.marks.items.map((m) => ({ ...m }));
      try {
        ipoState.marks.version = await STORE.writeJSON('ipo_marks', body, ipoState.marks.version);
        // 보내는 동안 또 바뀐 회사는 남겨 두고 다음 저장에 태운다. 이때 방금 보낸 그 회사를 되돌릴 기준(base)으로, 그 뒤에 바뀐 필드만 patch로 둔다
        // (안 그러면 다음 저장이 실패할 때 이미 저장된 값까지 되돌린 채 다음 저장이 서버를 덮고, 409 때는 이미 저장한 필드를 다시 얹어 다른 분 변경을 덮는다)
        sent.forEach((s, code) => {
          const d = ipoState.dirty.get(code); if (!d) return;
          if (d.seq === s.seq) { ipoState.dirty.delete(code); return; }
          const b = body.find((m) => m.code === code);
          d.base = b ? { ...b } : null;
          d.patch = Object.fromEntries(Object.entries(d.patch).filter(([k, v]) => !(k in s.patch) || s.patch[k] !== v));
        });
        return;
      } catch (e) {
        if (e.status !== 409) { ipoRollback(e.status === 403 ? '편집 권한이 없습니다.' : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
        try {
          const r = await ipoReadMarks();
          const items = r.items;
          ipoState.dirty.forEach((d, code) => { const x = items.find((m) => m.code === code); d.base = x ? { ...x } : null; });
          ipoState.marks = { items: ipoApplyDirty(items), version: r.version };
          merged = true;
        } catch (e2) { ipoRollback(e2.bad ? `저장하지 못했습니다. ${IPO_MARKS_BAD}.` : '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'); return; }
      }
    }
    ipoRollback('다른 분이 동시에 수정 중입니다. 잠시 후 다시 시도해 주세요.');
  }).finally(() => { if (merged) ipoDraw(); }); // 다른 분이 바꾼 내용도 화면에 반영
  return ipoState.saving;
}

function ipoTouch(code, patch) {
  const x = ipoFind(code); if (!x) return;
  let m = ipoMark(code);
  const prev = ipoState.dirty.get(code);
  const base = prev ? prev.base : (m ? { ...m } : null);
  if (!m) { m = { code, name: x.name, status: '미접촉', note: '' }; ipoState.marks.items.push(m); }
  const e = { patch: { ...prev?.patch, ...patch }, seq: ++ipoSeq, base, name: x.name, at: ipoNow(), by: G.account?.name || '' };
  Object.assign(m, patch, { name: e.name, at: e.at, by: e.by });
  ipoState.dirty.set(code, e);
}

function ipoSetStatus(code, status) {
  ipoTouch(code, { status });
  ipoRefreshRow(code);
  const s = $('#ipo-sum'); if (s) s.innerHTML = ipoSummary();
  ipoSaveMarks();
}

function ipoSetNote(code, v) {
  const note = v.trim();
  if ((ipoMark(code)?.note || '') === note) return;
  ipoTouch(code, { note });
  ipoSaveMarks();
}

/* 메모를 치다가 칸을 벗어나지 않은 채 다른 메뉴로 옮기거나(뒤로 가기·주소 이동) 앱을 내려도 쓰던 메모는 저장한다.
   Safari·Firefox는 칸이 화면에서 빠질 때 change·focusout을 내지 않아, 칸에 들어올 때 기억해 둔 요소로 저장한다(pipeline.js ppFlush와 같은 방식) */
function ipoFlush() {
  const el = ipoState.field; if (!el) return;
  const code = el.closest('.ipo-row')?.dataset.code;
  if (code) ipoSetNote(code, el.value);
  if (!el.isConnected) ipoState.field = null;
}
window.addEventListener('hashchange', ipoFlush);
document.addEventListener('visibilitychange', () => { if (document.hidden) ipoFlush(); });

/* 엑셀 다운로드: 매일 PC 작업이 만든 통합 엑셀(신규상장 목록 + 예심청구·매각희망·입찰딜·파이프라인 + 회사별 Fact Sheet)을
   OneDrive data/ipo_contact.xlsx 에서 받는다. 딜소싱 다른 탭(radar.js)도 이 함수를 쓴다. */
const IPO_XLSX = 'data/ipo_contact.xlsx';
async function ipoDownload(btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const m = await STORE.meta(IPO_XLSX);
    if (!m) { toast('아직 올라간 엑셀이 없습니다.'); return; }
    const sh = STORE.sharedItem(IPO_XLSX);
    const blob = await G.get(sh ? `${sh}/content` : `${STORE.path(IPO_XLSX)}:/content`, { type: 'blob' });
    const d = new Date(m.lastModifiedDateTime);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `[스페이스인베스트먼트] 딜소싱 리스트_${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}.xlsx`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; }
}

/* ---------- 표시 형식 ---------- */
const ipoMd = (s) => { const d = parse(s); return s.slice(0, 4) === today().slice(0, 4) ? md(s) : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
const ipoEok = (v) => (v == null || v === '' ? '–' : `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억`);
// 재무 탭 손익표 값: 상자 안이 좁으면(ipo.css ipo-fin 420 미만) 칸마다 붙는 '억'은 숨긴다(상자 제목에 '억원')
const ipoEokU = (v) => ipoEok(v).replace(/억$/, '<span class="ipo-u">억</span>');
const ipoWon = (v) => (v == null ? '–' : `${Number(v).toLocaleString('ko-KR')}원`);
const ipoTel = (t) => (t ? `<a class="ipo-tel" href="tel:${esc(String(t).replace(/[^\d+]/g, ''))}">${esc(t)}</a>` : '–');
const ipoUrl = (u) => (u ? (/^https?:\/\//i.test(u) ? u : `http://${u}`) : '');
// 이름 칸(회사·작성책임자·담당자·주관사·FI·락업 대상)은 '·'·'-' 뒤에서도 줄을 바꿀 수 있게 esc() 한 뒤 <wbr>를 넣는다 — Firefox는 keep-all에서 '·' 뒤를,
// WebKit은 '-' 뒤를 줄바꿈 자리로 보지 않아 '55호·에스엘아이·위청년'처럼 이어 쓴 이름이 음절 중간에서 꺾인다. 숫자 앞 '-'(날짜·번호)와 띄어 쓴 '·'는 그대로.
// '-' 앞 글자는 lookbehind 대신 직접 본다(옛 Safari는 lookbehind가 있으면 파일째 읽지 못한다)
const ipoNm = (s) => esc(s).replace(/·(?=\S)/g, '·<wbr>').replace(/-(?=[^\s\d])/g, (m, i, t) => (i && /\S/.test(t[i - 1]) ? '-<wbr>' : '-'));

function ipoChange(x) {
  if (!x.mcapNow || !x.mcapOffer) return '';
  const r = x.mcapNow / x.mcapOffer - 1;
  return `<span class="ipo-chg ${r < 0 ? 'dn' : 'up'}">${r >= 0 ? '+' : ''}${(r * 100).toFixed(0)}%</span>`;
}

function ipoLockCell(x) {
  if (!x.next) return '<span class="muted">–</span>';
  const n = diffDays(x.next.d, today());
  return `<span class="${n <= 14 ? 'ipo-soon' : ''}">${ipoMd(x.next.d)} · ${n ? `D-${n}` : '오늘'}</span><div class="ipo-sub">${esc(x.next['지분율'] || '')}</div>`;
}

function ipoWriterCell(x) {
  const w = x.writer || {};
  if (!w.name) return '<span class="muted">–</span>';
  // 전화번호는 한 덩어리(ipo-pn)로 — 칸이 좁으면 번호를 자르지 않고 '직통'만 다음 줄로
  return `<div>${ipoNm(w.title)} ${ipoNm(w.name)}</div><div class="ipo-sub">${w.phone ? `<span class="ipo-pn">${esc(w.phone)}</span>` : ''}${w.direct ? ' <span class="ipo-direct">직통</span>' : ''}</div>`;
}

/* ---------- 목록 ---------- */
function ipoList() {
  const d = ipoState.data; if (!d) return [];
  const q = ipoState.q.trim().toLowerCase(), d30 = ymd(addDays(new Date(), 30));
  let list = d.items.filter((x) => !q || x._q.includes(q));
  const f = ipoState.f;
  if (f === 'lock') list = list.filter((x) => x.next && x.next.d <= d30);
  if (f === 'direct') list = list.filter((x) => x.writer?.direct);
  if (f === 'todo') list = list.filter((x) => ipoSt(x.code) === '미접촉');
  if (f === 'fund') list = list.filter((x) => x.fund.length);
  const by = {
    listed: (a, b) => b.listed.localeCompare(a.listed),
    lock: (a, b) => (a.next?.d || '9999').localeCompare(b.next?.d || '9999') || b.listed.localeCompare(a.listed),
    mcap: (a, b) => (b.mcapNow || 0) - (a.mcapNow || 0),
  }[ipoState.sort];
  return list.sort(by);
}

function ipoRow(x) {
  const open = ipoState.open.has(x.code), st = ipoSt(x.code), f25 = x.fin?.years?.['2025'] || [];
  // ipo-alt = 카드가 좁아 현재 시총·2025 매출 칸을 접었을 때 회사 칸에 보이는 보조 줄(radar.js rd-alt와 같은 방식)
  const alt = [x.mcapNow != null && `시총 ${ipoEok(x.mcapNow)} ${ipoChange(x)}`, f25[0] != null && `매출 ${ipoEok(f25[0])}`].filter(Boolean)
    .map((t, i, a) => `<span>${t}${i < a.length - 1 ? ' ·' : ''}</span>`).join(' ');
  return `<div class="ipo-row${open ? ' open' : ''}" data-code="${esc(x.code)}">
    <div class="ipo-line ipo-cols">
      <div class="ipo-c-date">${md(x.listed)}<div class="ipo-sub">${esc(x.market)}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${ipoNm(x.name)}</button><div class="ipo-sub">${esc(x.product || x.sector)}</div>${alt ? `<div class="ipo-sub ipo-alt">${alt}</div>` : ''}</div>
      <div class="ipo-c-cap">${ipoEok(x.mcapNow)} ${ipoChange(x)}<div class="ipo-sub">공모가 기준 ${ipoEok(x.mcapOffer)}</div></div>
      <div class="ipo-c-rev">${ipoEok(f25[0])}<div class="ipo-sub">영업이익 ${ipoEok(f25[1])}</div></div>
      <div class="ipo-c-writer">${ipoWriterCell(x)}</div>
      <div class="ipo-c-lock">${ipoLockCell(x)}</div>
      <div class="ipo-c-st"><span class="ipo-st s-${IPO_STATUS.indexOf(st)}">${esc(st)}</span><span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span></div>
    </div>${open ? ipoDetail(x) : ''}</div>`;
}

const IPO_TABS = [['contact', '연락처'], ['signal', '자금수요·포인트'], ['fin', '재무'], ['holders', '주주·락업'], ['disc', '공시']];

/* ①②… 또는 ' · '로 이어 쓴 문장을 줄 목록으로 */
const ipoSplitNum = (s) => String(s || '').split(/\s*(?=[①②③④⑤⑥⑦⑧⑨])/).map((t) => t.replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '').trim()).filter(Boolean);
const ipoSplitDot = (s) => String(s || '').replace(/\)\s*,\s*/g, ')\0').split(/\s+·\s+|\0/).map((t) => t.trim()).filter(Boolean); // ')' 뒤 쉼표에서도 나눈다(lookbehind 없이)

/* 파이프라인(pipeline.js)에 올리기 — 예심청구·매각희망·입찰딜(radar.js)과 같은 버튼. pipeline.js가 없으면 안 보임 */
function ipoPipe(x) {
  if (typeof pipeAdd !== 'function') return '';
  let has = false;
  try { has = typeof pipeHas === 'function' && !!pipeHas(`ipo:${x.code}`); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(`ipo:${x.code}`)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-ipo-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}

async function ipoPipeAdd(btn) {
  const code = btn.closest('.ipo-row')?.dataset.code, x = code && ipoFind(code);
  if (!x || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  try { await pipeAdd({ src: '신규상장', ref: `ipo:${code}`, name: x.name, type: '메자닌' }); } // 신규상장 컨택 = 상장 후 메자닌 제안
  catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  ipoPipeRefresh(code);
}

// 그 회사 행의 파이프라인 버튼만 다시 그린다(행을 통째로 다시 그리면 그 사이 쓰던 메모 칸까지 새로 그려진다)
// 다시 그린 조각이 지금과 같으면 그대로 둔다 — WebKit은 화면 위쪽 밖에서 같은 것으로 갈아 끼워도 스크롤 자리를 밀어, 보기 링크로 맞춘 자리가 어긋난다(radar.js rdSwap과 같음).
// 다르면 바꾸되, 조각이 화면 위 가장자리보다 위에서 시작하면 그 행 아래 끝이 움직인 만큼 .scroll을 되돌려 보던 줄을 그대로 둔다('올리기' 버튼과 '있음' 링크는 높이가 다르다.
// 높이 차가 아니라 아래 끝 위치를 재므로, 스크롤 맨 아래에서 브라우저가 이미 당긴 만큼은 다시 빼지 않는다)
function ipoSwap(el, html) {
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
function ipoHold(b, key, fn) {
  const sc = b && b.closest('.scroll'); if (!sc) return fn();
  const tb = document.querySelector('.tabbar'), t = sc.getBoundingClientRect().top, e = t + sc.clientHeight - (tb ? tb.offsetHeight : 0);
  const rows = [...b.querySelectorAll('.ipo-row[data-code]')], at = (r) => r.getBoundingClientRect(), k = key == null ? null : rows.find((r) => r.dataset.code === key);
  const pin = (k && at(k).bottom > t && at(k).top < e ? k : null) || rows.find((r) => at(r).top >= t && at(r).top < e) || rows.find((r) => at(r).top < t && at(r).bottom > t);
  if (!pin) return fn();
  const up = (r) => { let p = r.previousElementSibling; while (p && !p.getClientRects().length) p = p.previousElementSibling;
    return p ? at(p).bottom + (parseFloat(getComputedStyle(p).marginBottom) || 0) : at(r).top - (parseFloat(getComputedStyle(r).marginTop) || 0); };
  const id = pin.dataset.code, y0 = up(pin), out = fn();
  const now = [...b.querySelectorAll('.ipo-row[data-code]')].find((r) => r.dataset.code === id), dy = now ? up(now) - y0 : 0;
  if (Math.abs(dy) >= 0.5) sc.scrollTop += dy;
  return out;
}

function ipoPipeRefresh(code) {
  const x = ipoFind(code); if (!x || !ipoState.host) return;
  ipoState.host.querySelectorAll('.ipo-row').forEach((r) => { const p = r.dataset.code === code && r.querySelector('.ipo-dhead > .rd-pipe'); if (p) ipoSwap(p, ipoPipe(x)); }); // 화면 위에 걸치거나 위 밖이면 ipoSwap이 그 행 아래 끝이 움직인 만큼 되돌린다
}

function ipoDetail(x) {
  const m = ipoMark(x.code), st = ipoSt(x.code), tab = ipoState.tab;
  const tabs = IPO_TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-ipo-tab="${k}">${l}</button>`).join('');
  return `<div class="ipo-detail">
    <div class="ipo-dhead">
      ${x.summary ? `<p class="ipo-sum1">${esc(x.summary)}</p>` : '<p></p>'}
      <div class="ipo-acts"><div class="seg ipo-seg">${IPO_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" data-ipo-st="${s}">${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-ipo-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모">
        ${m?.at ? `<span class="ipo-by">${esc(m.by || '')} ${esc(ipoMd(m.at.slice(0, 10)))} ${esc(m.at.slice(11, 16))}</span>` : ''}</div>${ipoPipe(x)}
    </div>
    <div class="ipo-tabs" role="tablist">${tabs}</div>
    <div class="ipo-pane">${ipoPane(x, tab)}</div>
  </div>`;
}

// 하위 탭 본문: 수집 자료 모양이 어긋나 그리다 멈추면 그 칸만 한글 문구로(목록·다른 회사·다른 탭은 그대로)
function ipoPane(x, tab) {
  try { return ({ contact: ipoPaneContact, signal: ipoPaneSignal, fin: ipoPaneFin, holders: ipoPaneHolders, disc: ipoPaneDisc }[tab] || ipoPaneContact)(x); }
  catch { return '<div class="empty">이 회사 자료 형식이 올바르지 않습니다</div>'; }
}

/* 묶음 = 제목 줄 + 본문의 라운드 박스 (모든 하위 탭 공통) */
const ipoBox = (t, body, sub = '') => `<section class="ipo-box"><div class="ipo-box-h">${t}${sub ? `<span class="muted">${sub}</span>` : ''}</div><div class="ipo-box-b">${body}</div></section>`;
const ipoNone = '<p class="ipo-p muted">없음</p>';
const ipoKv = (k, v) => (v ? `<div class="ipo-kv"><div class="k">${k}</div><div class="v">${v}</div></div>` : '');
const ipoPerson = (p) => [p?.['직책'], p?.['성명']].filter((s) => s && s !== '확인 필요').map(ipoNm).join(' ');

/* 연락처 탭 요약: 3개년(+반기) 매출·영익·순이익과 이익률. 억 원, 숫자는 오른쪽 정렬 */
function ipoPnl(x) {
  const fin = x.fin || {}, h = fin.half && fin.half.label ? fin.half : null;
  const cols = [...['2023', '2024', '2025'].map((y) => [y, ...(fin.years?.[y] || [])]), ...(h ? [[h.label, h.rev, h.op, h.ni]] : [])];
  if (!cols.some((c) => c.slice(1).some((v) => v != null))) return '';
  const n = (v) => (v == null || v === '' ? '–' : Number(v).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const pct = (a, b) => (a == null || !b ? '–' : `${(a / b * 100).toFixed(1)}%`);
  const row = (k, f, cls = '') => `<tr class="${cls}"><td>${k}</td>${cols.map((c) => { const t = f(c); return `<td${t.startsWith('-') ? ' class="neg"' : ''}>${t}</td>`; }).join('')}</tr>`;
  return ipoBox('주요 손익', `<table class="ipo-pnl"><thead><tr><th>억 원</th>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>
    ${row('매출액', (c) => n(c[1]))}
    ${row('영업이익', (c) => n(c[2]))}
    ${row('OPM', (c) => pct(c[2], c[1]), 'r')}
    ${row('당기순이익', (c) => n(c[3]))}
    ${row('NPM', (c) => pct(c[3], c[1]), 'r')}
    </tbody></table>`, esc(fin.basis || ''));
}

function ipoPaneContact(x) {
  const w = x.writer || {};
  const staff = (x.staff || []).map((s) => [s['구분'], s['성명'], s['직책']].filter(Boolean).map(ipoNm).join(' ')).filter(Boolean).join('<br>');
  const links = [[x.home, '홈페이지'], [x.ir, 'IR'], [x.contactPage, '문의'], [x.dartUrl, 'DART 원문']]
    .filter(([u]) => u).map(([u, l]) => `<a class="ipo-a" href="${esc(ipoUrl(u))}" target="_blank" rel="noopener">${l}${ico('ext', 'sm')}</a>`).join('');
  const route = ipoSplitNum(x.route);
  const people = `${w.name ? `<div class="ipo-lead"><div class="ipo-lead-k">작성책임자</div>
        <div class="ipo-lead-v">${ipoNm(w.title)} ${ipoNm(w.name)}</div>
        <div class="ipo-lead-s">${ipoTel(w.phone)}${w.direct ? '<span class="ipo-direct">직통</span>' : ''}</div></div>` : ''}
      ${ipoKv('공시책임자', ipoPerson(x.discloser))}
      ${ipoKv('공시담당자', staff)}
      ${ipoKv('CFO', ipoPerson(x.cfo))}
      ${ipoKv('대표전화', x.phone ? ipoTel(x.phone) : '')}
      ${ipoKv('팩스', esc(x.fax))}
      ${ipoKv('주관사', ipoNm(x.broker))}
      ${links ? `<div class="ipo-links">${links}</div>` : ''}`;
  return `<div class="ipo-two-col">
    ${ipoBox('컨택 포인트', people)}
    <div class="ipo-stack">${ipoPnl(x)}${route.length ? ipoBox('접촉 경로', `<ol class="ipo-ol">${route.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`) : ''}</div>
  </div>`;
}

function ipoPaneSignal(x) {
  const lst = (a) => (a || []).map((s) => `<li>${esc(s)}</li>`).join('');
  return `<div class="ipo-stack">${ipoBox('자금수요 신호', `<p class="ipo-p">${esc(x.signal || '–')}</p>`)}
    <div class="ipo-two-col">
      ${ipoBox('투자 포인트', x.points?.length ? `<ul class="ipo-ul">${lst(x.points)}</ul>` : ipoNone)}
      ${ipoBox('리스크', x.risks?.length ? `<ul class="ipo-ul">${lst(x.risks)}</ul>` : ipoNone)}
    </div></div>`;
}

function ipoPaneFin(x) {
  const fin = x.fin || {}, years = ['2023', '2024', '2025'], half = fin.half && fin.half.label;
  const fv = (y, i) => ipoEokU((fin.years?.[y] || [])[i]);
  return `<div class="ipo-stack">${ipoBox('손익', `<table class="ipo-fin"><thead><tr><th></th>${years.map((y) => `<th>${y}</th>`).join('')}${half ? `<th>${esc(half)}</th>` : ''}</tr></thead>
    <tbody><tr><td>매출</td>${years.map((y) => `<td>${fv(y, 0)}</td>`).join('')}${half ? `<td>${ipoEokU(fin.half.rev)}</td>` : ''}</tr>
    <tr><td>영업이익</td>${years.map((y) => `<td>${fv(y, 1)}</td>`).join('')}${half ? `<td>${ipoEokU(fin.half.op)}</td>` : ''}</tr></tbody></table>`, `${esc(fin.basis || '')} · 억원`)}
    ${ipoBox('유동성', `${ipoKv('현금성자산', esc(fin.cash))}${ipoKv('차입금', esc(fin.debt))}${ipoKv('부채비율', esc(fin.lev))}
    ${ipoKv('시가총액', `${ipoEok(x.mcapNow)} · 공모가 기준 ${ipoEok(x.mcapOffer)} ${ipoChange(x)}`)}`)}
    ${fin.note ? ipoBox('재무 특징', `<p class="ipo-p">${esc(fin.note)}</p>`) : ''}</div>`;
}

function ipoPaneHolders(x) {
  const fi = ipoSplitDot(x.fi);
  const locks = x.locks.map((l) => `<tr class="${l.d < today() ? 'past' : ''}"><td>${esc(l.d)}</td><td>${esc(l['지분율'] || '')}</td><td>${ipoNm(l['대상'] || '')}</td></tr>`).join('');
  return `<div class="ipo-two-col">
    ${ipoBox('주요 FI', fi.length ? `<ul class="ipo-ul">${fi.map((f) => `<li>${ipoNm(f)}</li>`).join('')}</ul>` : ipoNone)}
    ${ipoBox('락업 해제', locks ? `<table class="ipo-tbl"><thead><tr><th>해제일</th><th>지분율</th><th>대상</th></tr></thead><tbody>${locks}</tbody></table>` : ipoNone)}
  </div>`;
}

function ipoPaneDisc(x) {
  const evs = (x.events || []).map((e) => `<tr><td>${esc(e.dt.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))}</td><td><a class="ipo-a" href="${esc(ipoUrl(e.url))}" target="_blank" rel="noopener">${esc(e.nm)}</a></td></tr>`).join('');
  return ipoBox('상장 후 공시', `${evs ? `<table class="ipo-tbl ipo-tbl-2"><thead><tr><th>접수일</th><th>보고서</th></tr></thead><tbody>${evs}</tbody></table>` : ipoNone}
    ${x.dartUrl ? `<div class="ipo-links"><a class="ipo-a" href="${esc(ipoUrl(x.dartUrl))}" target="_blank" rel="noopener">투자설명서 원문${ico('ext', 'sm')}</a></div>` : ''}`);
}

function ipoSummary() {
  const d = ipoState.data; if (!d) return '';
  const g = d.generated ? new Date(d.generated) : null, ok = g && !isNaN(g), td = today(), d30 = ymd(addDays(new Date(), 30));
  const gl = ok ? `${ymd(g) === td ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집` : '';
  const lock = d.items.filter((x) => x.next && x.next.d <= d30).length;
  const done = d.items.filter((x) => ipoSt(x.code) !== '미접촉').length;
  return `${gl ? `<span class="${ok && Date.now() - g > 36 * 3600000 ? 'ipo-stale' : ''}">${gl}</span>` : ''}<span>${d.items.length}곳</span><span>락업 30일 <b>${lock}</b></span><span>컨택 <b>${done}</b></span>`;
}

function ipoBody() {
  const list = ipoList();
  if (!ipoState.data) return '<div class="empty">아직 수집된 신규상장 데이터가 없습니다.</div>';
  if (!list.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  return `<div class="ipo-head ipo-cols"><div>상장일</div><div>회사</div><div class="ipo-c-cap">현재 시총</div><div class="ipo-c-rev">2025 매출</div><div>작성책임자</div><div>다음 락업</div><div class="ipo-h-st">컨택 상태</div></div>${list.map(ipoRow).join('')}`;
}

/* 다시 그릴 때(다른 분 저장 합치기·저장 실패 되돌리기 등) 쓰고 있던 메모 칸을 지킨다 — radar.js rdDraw와 같은 방식.
   그 행이 목록에서 빠져 되살릴 칸이 없으면 쓰던 메모를 저장한다(Safari·Firefox는 칸이 지워질 때 change를 내지 않는다).
   다시 그리는 동안(ipoDrawing) 빠지는 칸의 change·focusout(Chromium은 이때도 낸다)으로는 저장하지 않는다 — 쓰던 값은 되살린 칸에 남고,
   저장이 계속 실패할 때 되돌림 → 다시 그리기 → 저장 → 실패가 끝없이 돌지 않게 */
let ipoDrawing = false;
function ipoKeepNote(scope) {
  const ae = document.activeElement;
  return ae && ae.matches && ae.matches('[data-ipo-note]') && scope.contains(ae) ? { code: ae.closest('.ipo-row')?.dataset.code, v: ae.value, a: ae.selectionStart, z: ae.selectionEnd } : null;
}
function ipoKeepBack(keep) {
  if (!keep || keep.code == null) return;
  const r = ipoState.host && [...ipoState.host.querySelectorAll('.ipo-row')].find((x) => x.dataset.code === keep.code);
  const i = r && r.querySelector('[data-ipo-note]');
  if (!i) { ipoSetNote(keep.code, keep.v); return; }
  i.value = keep.v; i.focus({ preventScroll: true });
  try { i.setSelectionRange(keep.a, keep.z); } catch { /* 커서 위치는 못 지켜도 됨 */ }
}

/* 메모 칸에서 한글을 조합하는 중(compositionstart~compositionend)에 칸을 갈아 끼우면 글자는 남아도 조합이 끊긴다('한'이 '하한'으로).
   그 칸을 지우는 다시 그리기는 조합이 끝난 뒤로 미룬다(같은 일은 한 번만) — radar.js rdIme와 같은 방식 */
const ipoIme = { el: null, todo: new Map() };
function ipoImeWait(scope, key, fn) {
  const el = ipoIme.el;
  if (!el || !el.isConnected || document.activeElement !== el || !scope.contains(el)) return false;
  ipoIme.todo.set(key, fn);
  return true;
}
function ipoImeDone() {
  ipoIme.el = null;
  setTimeout(() => { // 조합이 마무리된 뒤에. 그사이 다음 글자 조합이 시작됐으면 그것이 끝날 때
    if (ipoIme.el) return;
    const todo = [...ipoIme.todo.values()]; ipoIme.todo.clear();
    todo.forEach((f) => f());
  });
}

/* 보기 링크로 펼친 행을 보여 줄 때: 행이 보이는 높이(스크롤 칸에서 폰 아래 탭 막대를 뺀 높이)에 다 들어가면 행 전체를 가운데에,
   길면 머리 줄이 맨 위(8 띄움)에 오게 — radar.js rdReveal·pipeline.js ppReveal과 같은 방식 */
function ipoReveal(r) {
  const sc = r.closest('.scroll');
  if (!sc) { r.scrollIntoView({ block: r.offsetHeight <= innerHeight ? 'center' : 'start' }); return; }
  const tb = document.querySelector('.tabbar'), vis = sc.clientHeight - (tb ? tb.offsetHeight : 0), h = r.offsetHeight;
  const top = r.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
  sc.scrollTop = h <= vis ? top - (vis - h) / 2 : top - 8;
}

function ipoDraw() {
  const b = ipoState.host && ipoState.host.querySelector('#ipo-body'); if (!b) return;
  if (ipoImeWait(b, 'draw', ipoDraw)) return;
  const keep = ipoKeepNote(b);
  ipoDrawing = true;
  try { b.innerHTML = ipoBody(); } finally { ipoDrawing = false; }
  const s = ipoState.host.querySelector('#ipo-sum'); if (s) s.innerHTML = ipoSummary();
  ipoKeepBack(keep);
  if (ipoState.focus && b.isConnected) { // 다른 화면으로 옮겨 떨어져 나간 목록을 다시 그릴 때는 남겨 두고 다음에 그릴 때 쓴다
    const c = ipoState.focus, r = b.querySelector(`.ipo-row[data-code="${CSS.escape(c)}"]`);
    ipoState.focus = null;
    if (r) ipoReveal(r);
    else if (ipoState.data && !ipoFind(c)) toast('신규상장 목록에 없는 회사입니다.'); // 예심청구에서 상장했지만 신규상장 자료에 없는 회사
  }
}

function ipoRefreshRow(code) {
  const x = ipoFind(code); if (!x || !ipoState.host) return;
  if ([...ipoState.host.querySelectorAll('.ipo-row')].some((r) => r.dataset.code === code && ipoImeWait(r, `row:${code}`, () => ipoRefreshRow(code)))) return;
  const keep = ipoKeepNote(ipoState.host);
  ipoDrawing = true;
  try { ipoHold(ipoState.host.querySelector('#ipo-body'), code, () => ipoState.host.querySelectorAll('.ipo-row').forEach((r) => { if (r.dataset.code === code) r.outerHTML = ipoRow(x); })); } finally { ipoDrawing = false; }
  if (keep?.code === code) ipoKeepBack(keep);
}

function ipoBind(root) {
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const fb = t.closest('[data-ipo-f]');
    if (fb) { ipoState.f = fb.dataset.ipoF; root.querySelectorAll('[data-ipo-f]').forEach((b) => b.classList.toggle('on', b === fb)); ipoDraw(); return; }
    if (t.closest('#ipo-ref')) { ipoLoad(true).then(ipoDraw).catch((e) => toast(e.message)); return; }
    if (t.closest('#ipo-xlsx')) { ipoDownload(t.closest('#ipo-xlsx')); return; }
    const tb = t.closest('[data-ipo-tab]');
    if (tb) { ipoState.tab = tb.dataset.ipoTab; ipoRefreshRow(tb.closest('.ipo-row').dataset.code); return; }
    const sb = t.closest('[data-ipo-st]');
    if (sb) { ipoSetStatus(sb.closest('.ipo-row').dataset.code, sb.dataset.ipoSt); return; }
    const pb = t.closest('[data-ipo-pipe]');
    if (pb) { ipoPipeAdd(pb); return; }
    if (t.closest('a, input, details, .ipo-detail')) return;
    const row = t.closest('.ipo-row');
    if (row) {
      const c = row.dataset.code;
      if (ipoState.open.has(c)) ipoState.open.delete(c); else ipoState.open.add(c);
      ipoRefreshRow(c);
    }
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'ipo-q') { ipoState.q = ev.target.value; ipoDraw(); } });
  root.addEventListener('change', (ev) => {
    if (ev.target.id === 'ipo-sort') { ipoState.sort = ev.target.value; ipoDraw(); }
    if (ev.target.matches('[data-ipo-note]') && !ipoDrawing) ipoSetNote(ev.target.closest('.ipo-row').dataset.code, ev.target.value);
  });
  // 메모 칸: 들어오면 기억해 두고(ipoFlush), 다시 그리며 되살린 칸은 change가 안 날 수 있어 칸을 떠날 때도 저장한다
  root.addEventListener('focusin', (ev) => { if (ev.target.matches?.('[data-ipo-note]')) ipoState.field = ev.target; });
  root.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!t.matches?.('[data-ipo-note]')) return;
    if (ipoIme.el === t) ipoImeDone(); // 조합을 마치지 않고 떠나도 미룬 다시 그리기는 한다
    if (t.isConnected && !ipoDrawing) ipoSetNote(t.closest('.ipo-row').dataset.code, t.value);
    if (ipoState.field === t) ipoState.field = null;
  });
  root.addEventListener('compositionstart', (ev) => { if (ev.target.matches?.('[data-ipo-note]')) ipoIme.el = ev.target; });
  root.addEventListener('compositionend', (ev) => { if (ipoIme.el === ev.target) ipoImeDone(); });
}

async function renderIpo(host) {
  ipoState.host = host;
  host.innerHTML = `<div class="ipo-page" id="ipo-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="ipo-sum"></div>
      <button class="btn ghost" type="button" id="ipo-xlsx">${ico('file', 'sm')}엑셀 다운로드</button>
      <button class="btn ghost" type="button" id="ipo-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div class="ipo-filter">
        <div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="ipo-q" type="search" placeholder="회사·FI·담당자 검색" value="${esc(ipoState.q)}" autocomplete="off" aria-label="검색"></div>
        <div class="seg">${IPO_FILTERS.map(([k, l]) => `<button type="button" data-ipo-f="${k}" class="${ipoState.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <select class="select" id="ipo-sort" aria-label="정렬">${IPO_SORTS.map(([k, l]) => `<option value="${k}"${ipoState.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="ipo-body" id="ipo-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  ipoBind(host.querySelector('#ipo-root'));
  try { await ipoLoad(); }
  catch (e) {
    ipoState.focus = null; // 못 읽은 채 남겨 두면 나중에 신규상장 탭을 그냥 열 때 지난 이동이 되살아난다
    const b = host.querySelector('#ipo-body');
    if (b) b.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  if (ipoState.host === host && host.isConnected) ipoDraw();
  // '파이프라인에 있음' 표시가 처음부터 맞게 미리 읽고, 다 읽으면 펼친 행의 파이프라인 버튼만 다시 그림
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (ipoState.host === host) ipoState.open.forEach(ipoPipeRefresh); }).catch(() => {});
}

/* 홈 카드: 2주 안 락업 해제가 있는 회사 최대 5곳. ipo.json 이 없거나 못 읽으면 '' */
async function ipoHomeBlock() {
  try { await ipoLoad(); } catch { return ''; }
  const d = ipoState.data; if (!d) return '';
  const lim = ymd(addDays(new Date(), 14));
  const list = d.items.filter((x) => x.next && x.next.d <= lim).sort((a, b) => a.next.d.localeCompare(b.next.d));
  const li = (x) => `<li class="click" data-ipo-go="${esc(x.code)}"><span class="time">${ipoMd(x.next.d)}</span>
    <div class="t"><div class="ttl">${esc(x.name)}</div><div class="meta">${esc([x.next['지분율'], x.writer?.name && `${x.writer.title} ${x.writer.name}`].filter(Boolean).join(' · '))}</div></div>
    <span class="ipo-st s-${IPO_STATUS.indexOf(ipoSt(x.code))}">${esc(ipoSt(x.code))}</span></li>`;
  return `<section class="card ipo-home">
    <div class="card-head"><h2>신규상장 락업 해제 <span class="n">${list.length}</span></h2><a class="btn sm act" href="#deals/ipo">신규상장 전체 보기</a></div>
    <div class="card-body">${list.length ? `<ul class="list">${list.slice(0, 5).map(li).join('')}</ul>` : '<div class="empty">2주 안에 락업이 풀리는 회사가 없습니다.</div>'}</div></section>`;
}

/* 다른 화면(홈 락업 카드·홈 브리핑 줄·예심청구 '신규상장에서 보기'·파이프라인)에서 한 회사를 펼쳐 보여 줄 때: 신규상장 탭을 그리기 전에 부르고, 주소 이동은 부르는 쪽(링크·location.hash)이 한다.
   검색어·필터에 걸려 목록에서 빠져 있으면 펼칠 수 없으므로 풀어 둔다 — radar.js radarFocus와 같은 방식 */
function ipoFocus(code) {
  const c = String(code ?? ''); if (!c) return;
  ipoState.q = ''; ipoState.f = 'all';
  ipoState.open.add(c); ipoState.focus = c;
}

/* 홈 카드 등에서 회사를 누르면 신규상장 목록에서 그 회사를 펼쳐 보여 준다 */
document.addEventListener('click', (ev) => {
  const li = ev.target.closest('[data-ipo-go]'); if (!li) return;
  ipoFocus(li.dataset.ipoGo);
  location.hash = '#deals/ipo';
});
