/* UNIVERSE WORKS — 딜소싱 공용: 팩트시트 요청·보기 (2026-11-12)
   각 탭 펼친 칸 맨 위 '팩트시트' 칸: 없으면 [팩트시트 요청], 요청 중이면 처리 예정 시각과 [요청 취소], 만들어졌으면 내용과 [다시 요청].
   요청: data/fs_req.json [{key, name, src, hint, at, by}] — 화면이 쌓는다(대표님 편집 공유). 만든 뒤에도 지우지 않아 '요청한 회사' 목록이 된다.
         key = 파이프라인 ref와 같은 꼴(yesim:<id> · yesim:mandate:<이름> · sell:<id> · bids:<id> · ipo:<code> · pe:heir:<cc> · pe:dup:<이름> · delist:<code>)
   결과: data/fs.json {generated, slots, items{key → 팩트시트}, fail{key → {at, n, err}}} — PC 딜레이더 fs_req.py가 하루 두 번(slots) 만든다(읽기 공유).
   형식: 딜레이더\CONTRACT_fs.md. 내용 그리기는 radar.js rdFsN·rdFsGroup, 원래 화면 이동은 pipeline.js PP_TABS·ppGoTab.
   진입: fqBox(ref, x, label) — 펼친 칸에 넣을 HTML(x = 그 행 자료, 요청 때 조사 단서로 보낸다). 팩트시트 탭 '요청한 회사': fqList()·fqCount().
   버튼 클릭은 document에서 받는다(각 탭 클릭 처리는 펼친 칸 안 클릭을 건너뛴다). */

const FQ_TTL = 5 * 60000;
const FQ_TRIES = 3; // fs_req.py TRIES와 같게: 이만큼 실패하면 다시 요청할 때까지 멈춘다
const fqS = { req: [], ver: null, out: null, at: 0, loading: null, err: '', saving: Promise.resolve(), ctx: new Map(), open: new Set(viewGet('fq.open', [])) };

const fqNow = () => { const d = new Date(); return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fqWhen = (s) => (s ? `${md(s.slice(0, 10))} ${s.slice(11, 16)}`.trim() : '');

/* ---------- 데이터 ---------- */
async function fqReadReq() {
  let r;
  try { r = await STORE.readJSON('fs_req'); } catch (e) { if (!(e instanceof SyntaxError)) throw e; r = null; }
  // 깨진 목록 위에 저장하면 다른 분 요청이 지워지므로 멈춘다
  if (!r || !Array.isArray(r.items)) throw new Error('팩트시트 요청 목록 형식이 올바르지 않습니다');
  return { items: r.items.filter((x) => x && typeof x === 'object' && typeof x.key === 'string' && x.key), version: r.version };
}

function fqLoad(force) {
  if (!force && fqS.at && Date.now() - fqS.at < FQ_TTL) return Promise.resolve();
  if (!fqS.loading) {
    fqS.loading = (async () => {
      const [r, o] = await Promise.all([fqReadReq(), STORE.readText('data/fs.json')]);
      let out = null;
      try { out = o.text ? JSON.parse(o.text) : null; } catch { out = null; }
      fqS.req = r.items; fqS.ver = r.version;
      fqS.out = out && typeof out === 'object' && out.items && typeof out.items === 'object' ? out : null;
      fqS.at = Date.now(); fqS.err = '';
    })().catch((e) => { fqS.err = e.message || '팩트시트를 불러오지 못했습니다'; fqS.at = Date.now(); })
      .finally(() => { fqS.loading = null; fqPaint(); });
  }
  return fqS.loading;
}

// 다음 처리 시각: PC 작업(fs.json slots, 기본 11:00·16:00) 중 지금 뒤의 첫 시각
function fqNext() {
  const slots = Array.isArray(fqS.out?.slots) && fqS.out.slots.length ? fqS.out.slots : ['11:00', '16:00'];
  const d = new Date(), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`, s = slots.find((t) => t > hm);
  return s ? `오늘 ${s}` : `내일 ${slots[0]}`;
}

// legacy = 주관사 선정 행에 붙어 오던 옛 팩트시트(yesim.json mandates[].fs). fs.json에 없을 때만 쓴다
function fqState(ref, legacy) {
  const fs = fqS.out?.items?.[ref] || legacy || null, r = fqS.req.find((x) => x.key === ref);
  const madeAt = fs ? String(fs.madeAt || `${fs.made || ''}T00:00`) : '', at = String(r?.at || '');
  const wait = !!r && (!fs || at > madeAt), f = fqS.out?.fail?.[ref];
  const failed = wait && !!f && f.n >= FQ_TRIES && String(f.at || '') >= at;
  return { fs, r, wait, failed, f };
}

/* ---------- 조사 단서(hint): 그 행 자료를 짧은 JSON으로. 연락처 칸은 보내지 않는다 ---------- */
const FQ_SKIP = /phone|tel|mail|fax|contact|direct|^_|html|^open$|^key$/i;
function fqCut(v, d) {
  if (v == null || typeof v === 'function') return undefined;
  if (typeof v === 'string') return v.trim() ? v.trim().slice(0, 200) : undefined;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (d > 2) return undefined;
  if (Array.isArray(v)) { const a = v.slice(0, 5).map((y) => fqCut(y, d + 1)).filter((y) => y !== undefined); return a.length ? a : undefined; }
  if (typeof v === 'object') {
    const o = {};
    Object.entries(v).forEach(([k, y]) => { if (!FQ_SKIP.test(k)) { const z = fqCut(y, d + 1); if (z !== undefined) o[k] = z; } });
    return Object.keys(o).length ? o : undefined;
  }
  return undefined;
}
const fqHint = (x) => { try { return JSON.stringify(fqCut(x, 0) || {}).slice(0, 3000); } catch { return ''; } };

/* ---------- 그리기 ---------- */
function fqBox(ref, x, label) {
  if (!ref || !x) return '';
  fqS.ctx.set(ref, { name: x.name || '', label: label || '', legacy: x.fs && typeof x.fs === 'object' ? x.fs : null, hint: () => fqHint(x) });
  if (!fqS.at && !fqS.loading) fqLoad();
  return `<div class="fq-box" data-fq="${esc(ref)}">${fqInner(ref)}</div>`;
}

function fqBtn(label, on) {
  return `<button type="button" class="btn sm rd-fs${on ? ' on' : ''}" data-fq-req aria-pressed="${!!on}">${on ? ico('done', 'sm') : ''}${label}</button>`;
}

function fqInner(ref, nameLink = '') {
  const c = fqS.ctx.get(ref) || {};
  if (!fqS.at) return `<div class="fq-bar"><span class="fq-t">팩트시트</span><span class="muted">불러오는 중…</span></div>`;
  if (fqS.err) return `<div class="fq-bar"><span class="fq-t">팩트시트</span><span class="muted">${esc(fqS.err)}</span></div>`;
  const { fs, r, wait, failed, f } = fqState(ref, c.legacy);
  const who = r ? [r.by, fqWhen(r.at)].filter(Boolean).join(' ') : '';
  let msg, btn;
  if (failed) { msg = `만들지 못했습니다${f.err ? ` · ${esc(String(f.err).slice(0, 60))}` : ''}`; btn = fqBtn('다시 요청'); }
  else if (wait) { msg = `${fs ? '다시 요청됨' : '요청됨'} ${esc(who)} · ${fqNext()} 처리`; btn = fqBtn('요청 취소', true); }
  else if (fs) { msg = `작성 ${esc(fs.made || '')}${fs.src && nameLink ? ` · ${esc(fs.src)}` : ''}`; btn = fqBtn('다시 요청'); }
  else { msg = ''; btn = fqBtn('팩트시트 요청'); }
  const bar = `<div class="fq-bar"><span class="fq-t">팩트시트</span>${msg ? `<span class="muted">${msg}</span>` : ''}${nameLink}${btn}</div>`;
  return fs && typeof rdFsGroup === 'function' ? `${bar}${rdFsGroup(rdFsN(fs), false)}` : bar;
}

// 화면에 있는 팩트시트 칸을 다시 그린다(ref가 있으면 그것만)
function fqPaint(ref) {
  document.querySelectorAll('.fq-box[data-fq]').forEach((b) => { if (!ref || b.dataset.fq === ref) b.innerHTML = fqInner(b.dataset.fq); });
  document.querySelectorAll('.fq-list').forEach((l) => { l.innerHTML = fqListBody(); });
  document.querySelectorAll('[data-fq-count]').forEach((s) => { s.textContent = fqCount(); });
}

/* ---------- 요청·취소 ---------- */
function fqToggle(ref) {
  const c = fqS.ctx.get(ref);
  if (!c || !fqS.at || fqS.err) return;
  const add = !fqState(ref, c.legacy).wait; // 요청 중이면 취소, 아니면 (다시) 요청
  const rec = add ? { key: ref, name: c.name, src: c.label, hint: c.hint(), at: fqNow(), by: G.account?.name || '' } : null;
  // 요청을 지우면 '요청한 회사' 목록에서도 빠지므로, 만든 팩트시트가 있으면 취소는 예전 요청 시각으로 되돌린다
  const prev = fqS.req.find((x) => x.key === ref), fs = fqState(ref, c.legacy).fs;
  const apply = (items) => {
    const a = items.filter((x) => x.key !== ref);
    if (rec) a.push(rec); else if (fs) a.push({ ...(prev || { key: ref, name: c.name, src: c.label }), at: String(fs.madeAt || `${fs.made || ''}T00:00`) });
    return a;
  };
  fqS.req = apply(fqS.req);
  fqPaint(ref);
  fqS.saving = fqS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      try { fqS.ver = await STORE.writeJSON('fs_req', fqS.req, fqS.ver); return; } catch (e) {
        if (e.status !== 409) throw e;
        const r = await fqReadReq(); fqS.req = apply(r.items); fqS.ver = r.version; // 다른 분이 먼저 저장했으면 최신본에 다시 얹는다
      }
    }
    throw new Error('다른 분이 동시에 수정 중입니다. 잠시 후 다시 시도해 주세요.');
  }).then(() => { if (rec) toast(`${fqNext()}에 팩트시트를 만듭니다`); })
    .catch((e) => { toast(e.status === 403 ? '편집 권한이 없습니다.' : e.message || '저장하지 못했습니다.'); return fqLoad(true); });
}

/* ---------- 팩트시트 탭 '요청한 회사' ---------- */
// 요청한 회사 + 요청 없이 만들어진 것(옛 주관사 선정). 대기·실패 먼저, 그다음 최근 작성순
function fqItems() {
  const keys = new Set([...fqS.req.map((r) => r.key), ...Object.keys(fqS.out?.items || {})]);
  return [...keys].map((k) => {
    const r = fqS.req.find((x) => x.key === k), st = fqState(k, null), fs = st.fs;
    return { key: k, name: r?.name || fs?.name || k, src: r?.src || fs?.src || '', st, sortAt: st.wait ? `9${r?.at || ''}` : String(fs?.madeAt || '') };
  }).sort((a, b) => (a.sortAt < b.sortAt ? 1 : -1));
}
const fqCount = () => (fqS.at && !fqS.err ? String(fqItems().length) : '');

function fqListBody() {
  if (!fqS.at) return '<div class="empty">불러오는 중…</div>';
  if (fqS.err) return `<div class="empty">${esc(fqS.err)}</div>`;
  const a = fqItems();
  if (!a.length) return '<div class="empty">아직 요청한 회사가 없습니다. 딜소싱 각 화면에서 회사를 펼쳐 \'팩트시트 요청\'을 누르면 여기에 모입니다.</div>';
  return `<div class="ipo-head fq-cols"><div>회사</div><div>화면</div><div>상태</div><div>요청</div><div></div></div>${a.map(fqRow).join('')}`;
}

function fqRow(x) {
  const open = fqS.open.has(x.key), { st } = x, r = fqS.req.find((y) => y.key === x.key);
  const state = st.failed ? '<span class="fq-bad">만들지 못함</span>' : st.wait ? `<span class="fq-wait">${fqNext()} 처리</span>` : st.fs ? `작성 ${esc(yymd(st.fs.made || ''))}` : '–';
  const tab = typeof PP_TABS === 'object' ? PP_TABS[x.key.split(':')[0]] : null;
  const go = tab ? `<a class="ipo-a" href="${tab[0]}" data-fq-go="${esc(x.key)}">${esc(x.src || tab[1])}에서 보기${ico('right', 'sm')}</a>` : '';
  if (open && !fqS.ctx.has(x.key)) fqS.ctx.set(x.key, { name: x.name, label: x.src, legacy: null, hint: () => r?.hint || '' });
  return `<div class="ipo-row fq-row${open ? ' open' : ''}" data-fq-row="${esc(x.key)}">
    <div class="ipo-line fq-cols"><div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${esc(x.name)}</button></div>
      <div>${esc(x.src)}</div><div>${state}</div><div class="muted">${esc(r ? [r.by, fqWhen(r.at)].filter(Boolean).join(' ') : '')}</div><div class="ipo-c-st"><span class="ipo-chev" aria-hidden="true">${ico('right', 'sm')}</span></div></div>
    ${open ? `<div class="ipo-detail"><div class="ipo-pane"><div class="fq-box" data-fq="${esc(x.key)}">${fqInner(x.key, go)}</div></div></div>` : ''}</div>`;
}

function fqList() {
  if (!fqS.at && !fqS.loading) fqLoad();
  return `<div class="fq-list">${fqListBody()}</div>`;
}

document.addEventListener('click', (ev) => {
  const t = ev.target;
  const b = t.closest('[data-fq-req]');
  if (b) { const box = b.closest('[data-fq]'); if (box) fqToggle(box.dataset.fq); return; }
  const go = t.closest('[data-fq-go]');
  if (go) { if (typeof ppGoTab === 'function') ppGoTab(go.dataset.fqGo); return; } // 이동은 링크 주소로
  if (t.closest('a, input, select, .ipo-detail')) return;
  const row = t.closest('[data-fq-row]');
  if (row && row.closest('.fq-list')) {
    const k = row.dataset.fqRow;
    if (fqS.open.has(k)) fqS.open.delete(k); else fqS.open.add(k);
    viewSet('fq.open', fqS.open);
    fqPaint();
  }
});
