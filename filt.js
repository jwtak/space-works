/* UNIVERSE WORKS — 딜소싱·팩트시트 공용 필터 틀 (2026-11-24 사용자 "필터 쪽이 너무 난잡해. 밑으로 좀 내리든지" → "ㅇㅇ ㄱㄱ")
   각 화면이 그리는 칩 묶음 줄(.ipo-filter.rd-finf 안의 .rd-fing = 묶음 이름 .rd-finl + 단추들)을 그대로 두고 모양과 보조 기능만 더한다.
   - 한 줄에 한 묶음, 왼쪽 묶음 이름 고정 폭(filt.css)
   - 묶음이 셋보다 많으면 FF_MAIN의 묶음만 늘 보이고 나머지는 '필터 더보기'에 접는다(고른 개수 표시, 화면별로 펼침 기억 viewGet ff.more.<화면>)
   - 맨 위에 고른 필터 칩(누르면 그 묶음을 '전체'로)과 '초기화'
   단추를 누르는 일은 각 화면의 원래 클릭 처리(data-rd-*·data-fs-fl 등)를 그대로 탄다: 칩·초기화는 그 묶음의 '전체' 단추(없으면 켜진 단추)를 대신 누른다.
   화면이 필터 줄을 다시 그려도 #page 변화를 보고 다시 붙인다(app.js mfApply와 같은 방식). 폰(760 이하)은 app.js의 '필터' 단추 시트 안이라 묶음을 다 보인다. */

// 화면 → 늘 보일 묶음 이름(없으면 전부). 묶음이 셋 이하인 화면은 다 보인다
const FF_MAIN = {
  'deals/facts': ['테마', '최근 매출', '투자 단계'],
  'deals/round': ['라운드', '금액'],
  'deals/sell': ['최근 매출', '영업이익', '매출 성장'],
};
const FF_ALL = '전체';

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

function ffApply() {
  const r = ffRoute();
  document.querySelectorAll('#page .ipo-filter.rd-finf').forEach((box) => {
    const groups = [...box.querySelectorAll(':scope > .rd-fing')];
    if (!groups.length) return;
    if (!box.classList.contains('ff')) box.classList.add('ff'); // 같은 값으로 다시 쓰면 변화 감시가 또 부른다
    const main = groups.length > 3 ? FF_MAIN[r] || groups.slice(0, 3).map(ffLabel) : null;
    const more = viewGet(`ff.more.${r}`, false) === true;
    groups.forEach((g) => {
      const m = !main || main.includes(ffLabel(g));
      const hide = !m && !more;
      if (g.hidden !== hide) g.hidden = hide;
      if (g.classList.contains('ff-more') === m) g.classList.toggle('ff-more', !m);
    });
    // 고른 필터 칩 + 초기화(맨 위). 내용이 같으면 손대지 않는다(변화 감시가 다시 부르지 않게)
    const on = groups.flatMap((g) => ffOn(g).map((b) => [ffLabel(g), ffBtnName(b)]));
    const sig = JSON.stringify(on);
    let head = box.querySelector(':scope > .ff-on');
    if (!on.length) { head?.remove(); } else if (!head || head.dataset.sig !== sig) {
      const html = on.map(([l, v]) => `<button type="button" class="ff-chip" data-ff-clr="${esc(l)}" data-ff-v="${esc(v)}" aria-label="${esc(l)} ${esc(v)} 풀기">${esc(l)} ${esc(v)}<span aria-hidden="true">×</span></button>`).join('')
        + '<button type="button" class="btn ghost sm ff-reset" data-ff-clr="*">초기화</button>';
      if (!head) { head = document.createElement('div'); head.className = 'ff-on'; box.prepend(head); }
      head.innerHTML = html; head.dataset.sig = sig;
    }
    // 필터 더보기(숨는 묶음이 있을 때만)
    let tg = box.querySelector(':scope > .ff-tgl');
    if (!main || groups.every((g) => !g.classList.contains('ff-more'))) { tg?.remove(); return; }
    const hid = groups.filter((g) => g.classList.contains('ff-more') && ffOn(g).length).length;
    const html = `${more ? '필터 접기' : '필터 더보기'}${!more && hid ? `<b class="ff-n">${hid}</b>` : ''}${ico('right', 'sm')}`;
    if (!tg) { tg = document.createElement('button'); tg.type = 'button'; tg.className = 'ff-tgl'; tg.dataset.ffMore = '1'; box.append(tg); }
    else if (tg !== box.lastElementChild) box.append(tg);
    if (tg.dataset.sig !== html) { tg.innerHTML = html; tg.dataset.sig = html; } // innerHTML은 svg를 다르게 적어 비교하지 않는다
    if (tg.classList.contains('open') !== more) tg.classList.toggle('open', more);
    if (tg.getAttribute('aria-expanded') !== String(more)) tg.setAttribute('aria-expanded', more);
  });
}

// 칩 하나 풀기: 그 묶음의 '전체'(없으면 켜진 그 단추)를 누른다. 다시 그려진 뒤의 단추를 찾으려고 매번 이름으로 찾는다
function ffClear(box, label, val) {
  const g = [...box.querySelectorAll(':scope > .rd-fing')].find((x) => ffLabel(x) === label); if (!g) return;
  const bs = [...g.querySelectorAll(':scope > .seg button, :scope > button')];
  const all = bs.find((b) => ffTxt(b).startsWith(FF_ALL));
  const b = all || bs.find((x) => x.classList.contains('on') && (val == null || ffBtnName(x) === val));
  if (b) b.click();
}

document.addEventListener('click', (ev) => {
  const t = ev.target, box = t.closest?.('.ipo-filter.rd-finf'); if (!box) return;
  const c = t.closest('[data-ff-clr]');
  if (c) {
    ev.stopPropagation();
    if (c.dataset.ffClr !== '*') { ffClear(box, c.dataset.ffClr, c.dataset.ffV); return; }
    const list = JSON.parse(box.querySelector(':scope > .ff-on')?.dataset.sig || '[]');
    list.forEach(([l, v]) => { const b = document.querySelector('#page .ipo-filter.rd-finf'); if (b) ffClear(b, l, v); });
    return;
  }
  if (t.closest('[data-ff-more]')) { ev.stopPropagation(); const k = `ff.more.${ffRoute()}`; viewSet(k, viewGet(k, false) !== true); ffApply(); }
}, true);

let ffQ = 0;
const ffWatch = () => { const p = document.getElementById('page'); if (!p) return; new MutationObserver(() => { if (!ffQ) ffQ = requestAnimationFrame(() => { ffQ = 0; ffApply(); }); }).observe(p, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ffWatch); else ffWatch();
