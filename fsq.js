/* UNIVERSE WORKS — 딜소싱 공용: 팩트시트 요청·보기 (2026-11-12)
   각 탭 펼친 칸 맨 위 '팩트시트' 칸: 없으면 [팩트시트 요청], 요청 중이면 처리 예정 시각과 [요청 취소], 만들어졌으면 내용과 [다시 요청].
   요청: data/fs_req.json [{key, name, src, hint, at, by}] — 화면이 쌓는다(대표님 편집 공유). 만든 뒤에도 지우지 않아 '요청한 회사' 목록이 된다.
         key = 파이프라인 ref와 같은 꼴(yesim:<id> · yesim:mandate:<이름> · sell:<id> · bids:<id> · ipo:<code> · pe:heir:<cc> · pe:dup:<이름> · delist:<code> · cons:<id> · deep:<id>),
               직접 넣은 파이프라인 딜은 pp:<딜 id>(pipeline.js ppFsKey, fqEnsure로 자동 요청)
   결과: data/fs.json {generated, slots, items{key → 팩트시트}, fail{key → {at, n, err}}} — PC 딜레이더 fs_req.py가 하루 두 번(slots) 만든다(읽기 공유).
   형식: 딜레이더\CONTRACT_fs.md. 내용 그리기는 radar.js rdFsN·rdFsGroup, 원래 화면 이동은 pipeline.js PP_TABS·ppGoTab.
   진입: fqBox(ref, x, label) — 펼친 칸에 넣을 HTML(x = 그 행 자료, 요청 때 조사 단서로 보낸다). 팩트시트 탭 목록: fqItems()(facts.js fsAll이 엑스포 목록과 합친다, fqPaint 때 fsReqPaint로 다시 그림).
   요청 버튼은 펼친 칸 머리(컨택 상태 줄)에 둔다(2026-11-12 사용자 "너무 안 보여"): 머리를 그릴 때 fqHead(ref)를 넣고, 같은 펼친 칸에서 그 뒤에 fqBox(ref)를 부른다.
   그러면 팩트시트 칸에는 버튼 없이 상태·내용만 나온다. fqHead 없이 부른 fqBox(팩트시트 탭 목록 등)는 예전처럼 칸 안에 버튼.
   버튼 클릭은 document에서 받는다(각 탭 클릭 처리는 펼친 칸 안 클릭을 건너뛴다).
   fqHead는 '관심'(☆) 버튼도 같이 넣는다(fav.js fvHead, 사람별 관심 기업, 2026-11-16). 요청자는 by·byEmail(파이프라인 딜 자동 요청은 by '파이프라인 자동'), 팩트시트 탭 요청자 필터가 by로 거른다. */

const FQ_TTL = 5 * 60000;
const FQ_TRIES = 3; // fs_req.py TRIES와 같게: 이만큼 실패하면 다시 요청할 때까지 멈춘다
const fqS = { req: [], ver: null, out: null, at: 0, loading: null, err: '', saving: Promise.resolve(), ctx: new Map(), head: new Set() };

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

// 창으로 돌아오면 5분 지난 자료는 다시 읽는다(열어 둔 채 처리 시각이 지나도 결과가 보이게)
document.addEventListener('visibilitychange', () => { if (!document.hidden && fqS.at) fqLoad(); });

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
  if (!fqS.loading && (!fqS.at || Date.now() - fqS.at > FQ_TTL)) fqLoad(); // 열어 둔 화면도 5분이 지나면 다시 읽는다(11:00 처리 뒤에도 '요청됨'이 남던 문제, 2026-11-16)
  const head = fqS.head.delete(ref); // 바로 앞 머리에 요청 버튼을 넣었으면 칸에는 버튼을 빼고 그린다
  return `<div class="fq-box" data-fq="${esc(ref)}"${head ? ' data-fq-head="1"' : ''}>${fqInner(ref, '', head)}</div>`;
}

// 펼친 칸 머리(컨택 상태 줄)에 넣는 요청 버튼. 눌린 상태 = 요청됨(다시 누르면 취소)
function fqHead(ref, x) {
  if (!ref) return '';
  fqS.head.add(ref);
  const fav = typeof fvHead === 'function' ? fvHead(ref, x) : ''; // 관심(☆): fav.js
  return `${fav}<span class="fq-slot" data-fq="${esc(ref)}">${fqSlotInner(ref, x?.fs && typeof x.fs === 'object' ? x.fs : undefined)}</span>`;
}
function fqSlotInner(ref, legacy = fqS.ctx.get(ref)?.legacy) {
  if (!fqS.at || fqS.err) return '';
  const { fs, wait, failed } = fqState(ref, legacy);
  return wait && !failed ? fqBtn('팩트시트 요청', true) : fqBtn(fs || failed ? '팩트시트 다시 요청' : '팩트시트 요청');
}

function fqBtn(label, on) {
  return `<button type="button" class="btn sm rd-fs${on ? ' on' : ''}" data-fq-req aria-pressed="${!!on}">${on ? ico('done', 'sm') : ''}${label}</button>`;
}

// head = 요청 버튼이 머리에 있다: 버튼을 빼고, 알릴 상태도 내용도 없으면 칸을 비운다(.fq-box:empty는 숨김)
function fqInner(ref, nameLink = '', head = false) {
  const c = fqS.ctx.get(ref) || {};
  if (!fqS.at) return head ? '' : `<div class="fq-bar"><span class="fq-t">팩트시트</span><span class="muted">불러오는 중…</span></div>`;
  if (fqS.err) return `<div class="fq-bar"><span class="fq-t">팩트시트</span><span class="muted">${esc(fqS.err)}</span></div>`;
  const { fs, r, wait, failed, f } = fqState(ref, c.legacy);
  const who = r ? [r.by, fqWhen(r.at)].filter(Boolean).join(' ') : '';
  // 상태 글은 '·'로 잇지 않고 값마다 따로 띄운다(fq-bar 간격 12)
  let msg, btn;
  if (failed) { msg = ['만들지 못했습니다', f.err && esc(String(f.err).slice(0, 60))]; btn = fqBtn('다시 요청'); }
  else if (wait) { msg = [`${fs ? '다시 요청됨' : '요청됨'} ${esc(who)}`, `${fqNext()} 처리`]; btn = fqBtn('요청 취소', true); }
  else if (fs) { msg = [`작성 ${esc(fs.made || '')}`, fs.src && nameLink && esc(fs.src)]; btn = fqBtn('다시 요청'); }
  else { msg = []; btn = fqBtn('팩트시트 요청'); }
  msg = msg.filter(Boolean);
  if (head) { if (!msg.length && !fs) return ''; btn = ''; }
  const bar = `<div class="fq-bar"><span class="fq-t">팩트시트</span>${msg.map((m) => `<span class="muted">${m}</span>`).join('')}${nameLink}${btn}</div>`;
  if (!fs) return bar;
  // K-Beauty 팩트시트와 같은 탭 화면(facts.js fsReqBody, 11/16 사용자). 다른 화면 칸이면 아래 회사 정보와 나누는 머리를 붙인다
  const body = typeof fsReqBody === 'function' ? fsReqBody(ref, fs, c.name) : '';
  if (body) return `${bar}${body}${nameLink ? '' : '<div class="rd-fsh">회사 정보</div>'}`;
  return typeof rdFsGroup === 'function' ? `${bar}${rdFsGroup(rdFsN(fs), false)}` : bar;
}

// 화면에 있는 팩트시트 칸·머리 버튼을 다시 그린다(ref가 있으면 그것만)
function fqPaint(ref) {
  document.querySelectorAll('.fq-box[data-fq]').forEach((b) => { if (!ref || b.dataset.fq === ref) b.innerHTML = fqInner(b.dataset.fq, '', b.dataset.fqHead === '1'); });
  document.querySelectorAll('.fq-slot[data-fq]').forEach((s) => { if (!ref || s.dataset.fq === ref) s.innerHTML = fqSlotInner(s.dataset.fq); });
  if (typeof fsReqPaint === 'function') fsReqPaint(); // 팩트시트 탭 목록(facts.js)
}

/* ---------- 요청·취소 ---------- */
function fqToggle(ref) {
  const c = fqS.ctx.get(ref);
  if (!c || !fqS.at || fqS.err) return;
  const add = !fqState(ref, c.legacy).wait; // 요청 중이면 취소, 아니면 (다시) 요청
  const rec = add ? { key: ref, name: c.name, src: c.label, hint: c.hint(), at: fqNow(), by: G.account?.name || '', byEmail: fqMe().email } : null;
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

/* 여러 회사를 한 번에 요청(파이프라인 딜은 무조건 팩트시트, 2026-11-16 사용자). 팩트시트도 요청도 없는 것만 얹고, 다른 분 요청은 건드리지 않는다
   list = [{key, name, label, hint}] */
async function fqEnsure(list) {
  await fqLoad();
  if (fqS.err) return;
  const has = (k) => !!fqS.out?.items?.[k] || fqS.req.some((r) => r.key === k);
  const recs = list.filter((c) => c.key && c.name && !has(c.key))
    .map((c) => ({ key: c.key, name: c.name, src: c.label || '', hint: c.hint || '', at: fqNow(), by: '파이프라인 자동' }));
  if (!recs.length) return;
  const apply = (items) => [...items, ...recs.filter((r) => !items.some((x) => x.key === r.key))];
  fqS.req = apply(fqS.req);
  fqPaint();
  fqS.saving = fqS.saving.catch(() => {}).then(async () => {
    for (let i = 0; i < 3; i++) {
      try { fqS.ver = await STORE.writeJSON('fs_req', fqS.req, fqS.ver); return; } catch (e) {
        if (e.status !== 409) throw e;
        const r = await fqReadReq(); fqS.req = apply(r.items); fqS.ver = r.version;
      }
    }
  }).catch(() => fqLoad(true));
}

/* ---------- 팩트시트 탭 목록 자료 ---------- */
// 요청자 이메일: 옛 주소(@spaceinve.com)도 같은 사람
const fqMail = (s) => String(s || '').toLowerCase().replace(/@spaceinve\.com$/, '@universeinvest.co.kr');
const fqMe = () => ({ email: fqMail(G.account?.username), name: G.account?.name || '' });
// 요청한 회사 + 요청 없이 만들어진 것(옛 주관사 선정). 대기·실패 먼저, 그다음 최근 작성순
function fqItems() {
  const keys = new Set([...fqS.req.map((r) => r.key), ...Object.keys(fqS.out?.items || {})]);
  return [...keys].map((k) => {
    const r = fqS.req.find((x) => x.key === k), st = fqState(k, null), fs = st.fs;
    return { key: k, name: r?.name || fs?.name || k, src: r?.src || fs?.src || '', st, sortAt: st.wait ? `9${r?.at || ''}` : String(fs?.madeAt || '') };
  }).sort((a, b) => (a.sortAt < b.sortAt ? 1 : -1));
}
/* 펼친 칸 '파이프라인에 올리기'(11/16 사용자). ref = 팩트시트 키(다른 탭에서 올릴 때와 같은 키라 중복이 안 생긴다). 'pp:'는 이미 파이프라인 딜 */
function fqPipe(x) {
  if (typeof pipeAdd !== 'function') return '';
  const pp = x.key.startsWith('pp:');
  let has = pp;
  try { has = has || (typeof pipeHas === 'function' && !!pipeHas(x.key)); } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline"${pp ? '' : ` data-pp-ref="${esc(x.key)}"`}>${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-fq-pipe="${esc(x.key)}">${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}
async function fqPipeAdd(btn) {
  const x = fqItems().find((y) => y.key === btn.dataset.fqPipe);
  if (!x || btn.disabled) return;
  btn.disabled = true;
  try { await pipeAdd({ src: x.src || '팩트시트', ref: x.key, name: x.name }); } catch (e) { toast(e?.message || '파이프라인에 올리지 못했습니다.'); }
  fqPaint();
}

document.addEventListener('click', (ev) => {
  const t = ev.target;
  const b = t.closest('[data-fq-req]');
  if (b) { const box = b.closest('[data-fq]'); if (box) fqToggle(box.dataset.fq); return; }
  const tb = t.closest('[data-fq-tab]');
  if (tb) {
    const box = tb.closest('[data-fq-fs]'), ref = box?.dataset.fqFs, fs = ref && fqState(ref, fqS.ctx.get(ref)?.legacy).fs;
    if (!fs || typeof fsReqBody !== 'function') return;
    fsS.tab = tb.dataset.fqTab; viewSet('fs.tab', fsS.tab);
    box.outerHTML = fsReqBody(ref, fs, fqS.ctx.get(ref)?.name);
    return;
  }
  const pb = t.closest('[data-fq-pipe]');
  if (pb) { fqPipeAdd(pb); return; }
  const go = t.closest('[data-fq-go]');
  if (go) { if (typeof ppGoTab === 'function') ppGoTab(go.dataset.fqGo); return; } // 이동은 링크 주소로
});
