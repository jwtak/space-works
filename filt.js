/* UNIVERSE WORKS — 딜소싱·팩트시트 공용 필터 틀 (2026-11-24 사용자 "필터 쪽이 너무 난잡해. 밑으로 좀 내리든지" → "ㅇㅇ ㄱㄱ")
   각 화면이 그리는 칩 묶음 줄(.ipo-filter.rd-finf 안의 .rd-fing = 묶음 이름 .rd-finl + 단추들)을 그대로 두고 모양과 보조 기능만 더한다.
   - 한 줄에 한 묶음, 왼쪽 묶음 이름 고정 폭(filt.css). 묶음은 늘 다 보인다(11/24 오후 사용자 "필터는 그냥 항상 전체 다 볼 수 있게", 더보기 없앰)
   - 맨 위에 고른 필터 칩(누르면 그 묶음을 '전체'로)과 '초기화'
   - 매출·영업이익·매출 성장은 칩 대신 슬라이더(ffRangeHtml, 11/24 사용자 "bar로 해서 몇 억 이상, 10% 이렇게"). 화면이 FF_RG[id]에 상태와 다시 그리기를 걸고,
     거를 때 ffOk(상태, {rev 억, op 억, gr %})를 부른다. 상태 값: rev = '300'(억 이상), op = 'a:10'(영업이익 10억 이상) · 'm:5'(영업이익률 5% 이상), gr = '20'(% 이상),
     nn = '1'(값이 없는 회사도 보기), sp = '1'(테마 우주·방산만, space.js). 끌 때마다 목록만 다시 그린다(필터 줄은 그대로 두어야 끌기가 끊기지 않는다).
   단추를 누르는 일은 각 화면의 원래 클릭 처리(data-rd-*·data-fs-fl 등)를 그대로 탄다: 칩·초기화는 그 묶음의 '전체' 단추(없으면 켜진 단추)를 대신 누른다.
   화면이 필터 줄을 다시 그려도 #page 변화를 보고 다시 붙인다(app.js mfApply와 같은 방식). 폰(760 이하)은 app.js의 '필터' 단추 시트 안이다. */

const FF_ALL = '전체';
// 슬라이더 눈금(맨 앞 null = 전체). 매출은 넓게 퍼져 구간 눈금, 이익률은 5% 단위
const FF_STOPS = {
  rev: [null, 50, 100, 200, 300, 500, 1000, 3000],
  opa: [null, -100, -50, -20, -10, 0, 10, 20, 50, 100, 300],
  opm: [null, ...Array.from({ length: 21 }, (_, i) => -50 + i * 5)],
  gr: [null, -50, -20, 0, 10, 20, 30, 50, 100],
};
const FF_RG = {}; // 화면 id → { st: () => 상태 객체, apply: () => 저장하고 목록만 다시 그리기 }

const ffRoute = () => (typeof route === 'function' ? route() : location.hash.slice(1)).split('?')[0];
const ffTxt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
// 묶음 하나의 고른 단추: '전체'가 있는 묶음은 '전체' 말고 켜진 것, 없는 묶음(켜고 끄는 조건)은 켜진 것 전부
function ffOn(g) {
  const bs = [...g.querySelectorAll(':scope > .seg button, :scope > button')].filter((b) => !b.closest('.ff-on'));
  const hasAll = bs.some((b) => ffTxt(b).startsWith(FF_ALL));
  return bs.filter((b) => b.classList.contains('on') && !(hasAll && ffTxt(b).startsWith(FF_ALL)));
}
const ffLabel = (g) => ffTxt(g.querySelector(':scope > .rd-finl'));
const ffBtnName = (b) => ffTxt(b).replace(/\s*\d[\d,]*$/, ''); // 'K-뷰티 61'처럼 숫자가 붙은 단추는 이름만

/* ---------- 슬라이더 ---------- */
const ffNum = (v) => (v === '' || v == null || !Number.isFinite(+v) ? null : +v);
const ffFmt = (mode, v) => (mode === 'rev' || mode === 'opa' ? `${v.toLocaleString('ko-KR')}억` : `${v}%`);
// 묶음 k(rev·op·gr)의 지금 눈금 종류와 값
function ffCur(s, k) {
  if (k !== 'op') return { mode: k, v: ffNum(s[k]) };
  const [m, n] = String(s.op || '').split(':');
  return { mode: (s.op ? m : s.opMode) === 'm' ? 'opm' : 'opa', v: s.op ? ffNum(n) : null };
}
const ffChipText = (k, label, mode, v) => (v == null ? '' : `${k === 'op' ? (mode === 'opm' ? '영업이익률' : '영업이익') : label} ${ffFmt(mode, v)} 이상`);
function ffRangeHtml(id, k, label) {
  const s = FF_RG[id]?.st(); if (!s) return '';
  if (k === 'sp') { // 테마 묶음(2026-11-25 우주·방산, space.js spTag). 화면이 FF_RG[id].spN()으로 우주·방산 수를 준다
    const on = s.sp === '1', n = FF_RG[id].spN?.();
    return `<div class="rd-fing ff-rg" data-ff-id="${id}" data-ff-k="sp" data-ff-label="${esc(label)}" data-ff-on="${on ? '우주·방산' : ''}"><span class="rd-finl">${esc(label)}</span><div class="seg">${[['', '전체'], ['1', '우주·방산']].map(([v, l]) => `<button type="button" data-ff-sp="${v}" class="${(s.sp || '') === v ? 'on' : ''}" aria-pressed="${(s.sp || '') === v}">${l}${v && n != null ? `<span class="rd-qn">${n}</span>` : ''}</button>`).join('')}</div></div>`;
  }
  if (k === 'nn') {
    const on = s.nn === '1';
    return `<div class="rd-fing ff-rg" data-ff-id="${id}" data-ff-k="nn" data-ff-on="${on ? '값 없는 회사 포함' : ''}"><span class="rd-finl">${esc(label)}</span><label class="ff-nn"><input type="checkbox" class="ff-nnc"${on ? ' checked' : ''}>확인 불가 회사도 보기</label></div>`;
  }
  const { mode, v } = ffCur(s, k), stops = FF_STOPS[mode];
  const idx = v == null ? 0 : stops.reduce((b, x, i) => (x != null && x <= v ? i : b), 1);
  const sw = k === 'op' ? `<div class="seg ff-mode">${[['a', '금액'], ['m', '이익률']].map(([m, l]) => `<button type="button" data-ff-mode="${m}" class="${(mode === 'opm') === (m === 'm') ? 'on' : ''}" aria-pressed="${(mode === 'opm') === (m === 'm')}">${l}</button>`).join('')}</div>` : '';
  return `<div class="rd-fing ff-rg" data-ff-id="${id}" data-ff-k="${k}" data-ff-label="${esc(label)}" data-ff-on="${esc(ffChipText(k, label, mode, v))}"><span class="rd-finl">${esc(label)}</span>
    <div class="ff-rgb"><input type="range" class="ff-range" min="0" max="${stops.length - 1}" step="1" value="${idx}" aria-label="${esc(label)}" style="--p:${(idx / (stops.length - 1)) * 100}%">
      <output class="ff-out">${v == null ? '전체' : `${esc(ffFmt(mode, v))} 이상`}</output>
      <span class="ff-numw"><input type="number" class="input ff-num" inputmode="decimal" value="${v ?? ''}" placeholder="직접" aria-label="${esc(label)} 직접 입력"><span class="ff-unit">${mode === 'rev' || mode === 'opa' ? '억' : '%'}</span></span>${sw}</div></div>`;
}
// 화면이 거를 때: 고른 조건마다 값이 있으면 비교, 없으면 nn(값 없는 회사도 보기)일 때만 남긴다. rev·op는 억, gr은 %
function ffOk(s, x) {
  const keep = s.nn === '1', chk = (v, ok) => (v == null || !Number.isFinite(v) ? keep : ok(v));
  if (s.rev && !chk(x.rev, (v) => v >= +s.rev)) return false;
  if (s.op) {
    const [m, n] = String(s.op).split(':');
    const v = m === 'm' ? (x.rev > 0 && x.op != null ? (x.op / x.rev) * 100 : null) : x.op;
    if (!chk(v, (y) => y >= +n)) return false;
  }
  if (s.gr && !chk(x.gr, (v) => v >= +s.gr)) return false;
  return true;
}
const ffAnyRange = (s) => !!(s.rev || s.op || s.gr);
// 값 바꾸기: 상태에 쓰고 화면의 목록만 다시 그린다(끄는 동안은 프레임마다 한 번)
const ffPend = new Map();
function ffSet(id, k, val, redrawGroup) {
  const r = FF_RG[id]; if (!r) return;
  const s = r.st();
  if (k === 'op') { s.op = val; if (val) s.opMode = val.split(':')[0]; } else s[k] = val;
  if (redrawGroup) document.querySelectorAll(`.ff-rg[data-ff-id="${id}"][data-ff-k="${k}"]`).forEach((g) => { g.outerHTML = ffRangeHtml(id, k, g.dataset.ffLabel || ffLabel(g)); });
  if (!ffPend.has(id)) ffPend.set(id, requestAnimationFrame(() => { ffPend.delete(id); r.apply(); }));
}
function ffRangeInput(inp) {
  const g = inp.closest('.ff-rg'), { ffId: id, ffK: k } = g.dataset, s = FF_RG[id]?.st(); if (!s) return;
  const { mode } = ffCur(s, k), stops = FF_STOPS[mode], v = stops[+inp.value] ?? null;
  inp.style.setProperty('--p', `${(+inp.value / (stops.length - 1)) * 100}%`);
  g.querySelector('.ff-out').textContent = v == null ? '전체' : `${ffFmt(mode, v)} 이상`;
  g.querySelector('.ff-num').value = v ?? '';
  g.dataset.ffOn = ffChipText(k, g.dataset.ffLabel, mode, v);
  ffSet(id, k, v == null ? '' : k === 'op' ? `${mode === 'opm' ? 'm' : 'a'}:${v}` : String(v));
}
document.addEventListener('input', (ev) => { if (ev.target.matches?.('.ff-range')) ffRangeInput(ev.target); }, true);
document.addEventListener('change', (ev) => {
  const t = ev.target, g = t.closest?.('.ff-rg'); if (!g) return;
  const { ffId: id, ffK: k } = g.dataset, s = FF_RG[id]?.st(); if (!s) return;
  ev.stopPropagation();
  if (t.matches('.ff-nnc')) { ffSet(id, 'nn', t.checked ? '1' : '', true); return; }
  if (t.matches('.ff-num')) {
    const v = ffNum(t.value), { mode } = ffCur(s, k);
    ffSet(id, k, v == null ? '' : k === 'op' ? `${mode === 'opm' ? 'm' : 'a'}:${v}` : String(v), true);
  }
}, true);

/* ---------- 묶음 줄 꾸미기: 고른 필터 칩 + 초기화 ---------- */
function ffApply() {
  document.querySelectorAll('#page .ipo-filter.rd-finf').forEach((box) => {
    const groups = [...box.querySelectorAll(':scope > .rd-fing')];
    if (!groups.length) return;
    if (!box.classList.contains('ff')) box.classList.add('ff'); // 같은 값으로 다시 쓰면 변화 감시가 또 부른다
    box.querySelector(':scope > .ff-tgl')?.remove();
    groups.forEach((g) => { if (g.hidden) g.hidden = false; });
    // 내용이 같으면 손대지 않는다(변화 감시가 다시 부르지 않게)
    const on = groups.flatMap((g) => (g.classList.contains('ff-rg')
      ? (g.dataset.ffOn ? [[g.dataset.ffOn, `rg:${g.dataset.ffId}:${g.dataset.ffK}`]] : [])
      : ffOn(g).map((b) => [`${ffLabel(g)} ${ffBtnName(b)}`, `bt:${ffLabel(g)}:${ffBtnName(b)}`])));
    const sig = JSON.stringify(on);
    let head = box.querySelector(':scope > .ff-on');
    if (!on.length) { head?.remove(); } else if (!head || head.dataset.sig !== sig) {
      const html = on.map(([t, c]) => `<button type="button" class="ff-chip" data-ff-clr="${esc(c)}" aria-label="${esc(t)} 풀기">${esc(t)}<span aria-hidden="true">×</span></button>`).join('')
        + '<button type="button" class="btn ghost sm ff-reset" data-ff-clr="*">초기화</button>';
      if (!head) { head = document.createElement('div'); head.className = 'ff-on'; box.prepend(head); }
      head.innerHTML = html; head.dataset.sig = sig;
    }
  });
}

// 칩 하나 풀기. 단추 묶음은 그 묶음의 '전체'(없으면 켜진 그 단추)를 누르고, 슬라이더는 값을 비운다
function ffClear(c) {
  const [kind, a, ...rest] = c.split(':'), b = rest.join(':');
  if (kind === 'rg') { ffSet(a, b, '', true); return; }
  const box = document.querySelector('#page .ipo-filter.rd-finf'); if (!box) return;
  const g = [...box.querySelectorAll(':scope > .rd-fing')].find((x) => ffLabel(x) === a); if (!g) return;
  const bs = [...g.querySelectorAll(':scope > .seg button, :scope > button')];
  const all = bs.find((x) => ffTxt(x).startsWith(FF_ALL));
  const btn = all || bs.find((x) => x.classList.contains('on') && ffBtnName(x) === b);
  if (btn) btn.click();
}

document.addEventListener('click', (ev) => {
  const t = ev.target, box = t.closest?.('.ipo-filter.rd-finf'); if (!box) return;
  const sb = t.closest('[data-ff-sp]');
  if (sb) { ev.stopPropagation(); const g = sb.closest('.ff-rg'); ffSet(g.dataset.ffId, 'sp', sb.dataset.ffSp, true); return; }
  const mb = t.closest('[data-ff-mode]');
  if (mb) { // 영업이익 금액 ↔ 이익률: 값은 비우고 눈금만 바꾼다
    ev.stopPropagation();
    const g = mb.closest('.ff-rg'), s = FF_RG[g.dataset.ffId]?.st(); if (!s) return;
    s.opMode = mb.dataset.ffMode; ffSet(g.dataset.ffId, 'op', '', true); return;
  }
  const c = t.closest('[data-ff-clr]');
  if (!c) return;
  ev.stopPropagation();
  if (c.dataset.ffClr !== '*') { ffClear(c.dataset.ffClr); return; }
  JSON.parse(box.querySelector(':scope > .ff-on')?.dataset.sig || '[]').forEach(([, k]) => ffClear(k));
}, true);

let ffQ = 0;
const ffWatch = () => { const p = document.getElementById('page'); if (!p) return; new MutationObserver(() => { if (!ffQ) ffQ = requestAnimationFrame(() => { ffQ = 0; ffApply(); }); }).observe(p, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ffWatch); else ffWatch();
