/* 사용 안내(둘러보기): 처음 로그인한 사람에게 한 번 — 메뉴를 하나씩 밝게 짚으며 짧게 설명한다.
   계정마다 한 번만 자동으로 뜨고, 다시 보기는 오른쪽 위 이름 메뉴의 '사용 안내'. */
const GD_KEY = () => `guide1:${(G.account?.username || '').toLowerCase()}`;
const GD_STEPS = [
  { t: '대시보드', d: '이번 달 일정과 할 일을 한 화면에서 봅니다. 날짜 칸을 누르면 바로 일정을 추가할 수 있고, 딜 뉴스 카드 맨 위에는 오늘 챙길 시사점이 정리됩니다.', pc: '.nav [data-r="home"]', m: '.mh-it[href="#calendar"]' },
  { t: '메일', d: '회사 메일을 그대로 읽고 씁니다. 옆 숫자는 안 읽은 메일 수입니다.', pc: '.nav [data-r="mail"]', m: '.mh-it[href="#mail"]' },
  { t: '딜소싱', d: '행사·IR 일정, 신규상장 기업 정보, 딜 뉴스를 매일 아침 자동으로 모읍니다. 뉴스는 맨 위에 주요 기사 1~5위와 우리가 할 일(시사점)을 정리해 두고 우주·항공·방산을 따로 모아 보며, ☆로 체크한 기사는 기간이 지나도 ‘중요’에 남습니다. 관심 표시·중요 체크·연락 상태·메모는 세 분이 함께 봅니다.', pc: '.nav [data-r="deals"]', m: '.mh-it[href="#deals"], .mh-it[href="#deals/ipo"], .mh-it[href="#deals/news"]' },
  { t: '주간회의 · 공용 폴더', d: '팀 파일함입니다. 파일을 끌어다 놓으면 올라가고, PPT·엑셀은 누르면 바로 열립니다. ‘링크 복사’로 폴더 주소를 보내면 받는 분은 그 폴더가 바로 열립니다.', pc: '.nav [data-r="weekly"], .nav [data-r="files"]', m: '.mh-it[href="#weekly"], .mh-it[href="#files"]' },
  { t: '홈페이지', d: '만들고 있는 회사 홈페이지를 미리 봅니다. 공개 전이라 웍스 안에서만 보입니다.', pc: '.nav [data-r="homepage"]' },
  { t: '요청사항', d: '불편한 점이나 있었으면 하는 기능을 화면마다 남겨 주세요. 반영하면 그 아래에 답을 달아 드립니다.', pc: '#req:not([hidden])', m: '#me', mt: '요청사항 (이름 메뉴 안)' },
  { t: '앱으로 설치', install: true },
];
// 앱 설치: Chrome·Edge는 설치 창을 바로 띄울 수 있다(beforeinstallprompt), 아이폰은 Safari 공유 → 홈 화면에 추가
let gdInstall = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); gdInstall = e; });
addEventListener('appinstalled', () => { gdInstall = null; });
const gdStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const gdIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function gdInstallText() {
  if (gdIOS()) return 'Safari 아래쪽 공유 버튼을 누른 뒤 ‘홈 화면에 추가’를 고르면 휴대폰에서 앱처럼 바로 열립니다.';
  if (isMobile()) return '브라우저 오른쪽 위 메뉴(⋮)에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 누르면 휴대폰에서 앱처럼 바로 열립니다.';
  return '설치하면 바탕화면·작업 표시줄에서 앱처럼 바로 열립니다. 주소창 오른쪽의 ‘앱 설치’ 아이콘을 눌러도 됩니다.';
}
const gd = { i: -1, steps: [], el: null, off: null };

function gdTargets(step) {
  const sel = isMobile() ? step.m : step.pc;
  return sel ? [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden') : [];
}

function gdOpen(force) {
  if (!S || document.querySelector('.gd')) return;
  if (!force) { try { if (localStorage.getItem(GD_KEY())) return; } catch { return; } }
  if (isMobile() && route() !== 'home') location.hash = '#home'; // 폰은 첫 화면 메뉴 모음에서 짚는다
  gd.steps = GD_STEPS.filter((s) => !(s.install && gdStandalone())); gd.i = -1; // 이미 앱으로 쓰고 있으면 설치 안내는 뺀다
  gd.el = document.createElement('div');
  gd.el.className = 'gd'; gd.el.setAttribute('role', 'dialog'); gd.el.setAttribute('aria-modal', 'true'); gd.el.setAttribute('aria-label', '사용 안내');
  gd.el.innerHTML = '<div class="gd-hole" hidden></div><div class="gd-card"></div>';
  document.body.appendChild(gd.el);
  gd.el.addEventListener('click', gdClick);
  document.addEventListener('keydown', gdKey);
  addEventListener('resize', gdPlace);
  gd.off = pushLayer(() => gdClose(true), () => gdClose(true));
  setTimeout(gdDraw, isMobile() ? 400 : 0);
}

function gdClose(viaBack) {
  if (!gd.el) return;
  gd.el.remove(); gd.el = null;
  document.removeEventListener('keydown', gdKey); removeEventListener('resize', gdPlace);
  try { localStorage.setItem(GD_KEY(), '1'); } catch { /* 다음에 또 떠도 된다 */ }
  if (viaBack !== true) gd.off?.();
  gd.off = null;
}

function gdDraw() {
  if (!gd.el) return;
  const card = gd.el.querySelector('.gd-card'), n = gd.steps.length;
  if (gd.i < 0) { // 첫 인사
    gd.el.querySelector('.gd-hole').hidden = true;
    card.className = 'gd-card center';
    card.innerHTML = `<div class="gd-mark">SPACE WORKS</div><h2>${esc(myName())} 님, 반갑습니다</h2><p>주요 메뉴를 1분 안에 안내해 드립니다.</p>
      <div class="gd-act"><button type="button" class="btn grey" data-gd="skip">나중에</button><button type="button" class="btn primary" data-gd="next">둘러보기</button></div>`;
    card.querySelector('[data-gd="next"]').focus();
    return;
  }
  const s = gd.steps[gd.i], last = gd.i === n - 1;
  card.className = 'gd-card';
  card.innerHTML = `<div class="gd-step">${gd.i + 1} / ${n}</div><h3>${esc(isMobile() && s.mt ? s.mt : s.t)}</h3><p>${esc(s.install ? gdInstallText() : s.d)}</p>
    ${s.install && gdInstall ? `<button type="button" class="btn gd-inst" data-gd="install">${ico('ext', 'sm')}지금 앱으로 설치</button>` : ''}
    <div class="gd-act"><button type="button" class="gd-skip" data-gd="skip">건너뛰기</button><span class="gd-sp"></span>
      ${gd.i > 0 ? '<button type="button" class="btn" data-gd="prev">이전</button>' : ''}<button type="button" class="btn primary" data-gd="next">${last ? '시작하기' : '다음'}</button></div>`;
  if (s.install) { gd.el.querySelector('.gd-hole').hidden = true; card.classList.add('center'); card.style.left = card.style.top = ''; }
  else gdPlace();
  card.querySelector('[data-gd="next"]').focus();
}

// 짚을 메뉴 둘레를 밝히고, 설명 카드는 그 옆(자리 없으면 아래·위)에 둔다
function gdPlace() {
  if (!gd.el || gd.i < 0 || gd.steps[gd.i]?.install) return;
  const hole = gd.el.querySelector('.gd-hole'), card = gd.el.querySelector('.gd-card');
  const els = gdTargets(gd.steps[gd.i]);
  if (!els.length) { hole.hidden = true; card.classList.add('center'); card.style.left = card.style.top = ''; return; }
  els[0].scrollIntoView({ block: 'nearest' });
  const rs = els.map((e) => e.getBoundingClientRect()), pad = 6;
  const x = Math.min(...rs.map((r) => r.left)) - pad, y = Math.min(...rs.map((r) => r.top)) - pad;
  const w = Math.max(...rs.map((r) => r.right)) - x + pad, h = Math.max(...rs.map((r) => r.bottom)) - y + pad;
  Object.assign(hole.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` }); hole.hidden = false;
  card.classList.remove('center');
  const cw = card.offsetWidth, ch = card.offsetHeight, W = innerWidth, H = innerHeight, gap = 14;
  let left, top;
  if (x + w + gap + cw <= W - 12) { left = x + w + gap; top = y; } // 오른쪽
  else if (x - gap - cw >= 12) { left = x - gap - cw; top = y; } // 왼쪽
  else { left = Math.min(Math.max(12, x), W - cw - 12); top = y + h + gap + ch <= H - 12 ? y + h + gap : y - gap - ch; } // 아래·위
  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(Math.min(Math.max(12, top), H - ch - 12))}px`;
}

function gdGo(d) {
  gd.i += d;
  while (gd.i >= 0 && gd.i < gd.steps.length && !gd.steps[gd.i].install && !gdTargets(gd.steps[gd.i]).length && !(isMobile() && gd.steps[gd.i].m)) gd.i += d || 1; // 이 화면에 없는 메뉴는 건너뜀
  if (gd.i >= gd.steps.length) return gdClose();
  if (gd.i < -1) gd.i = -1;
  gdDraw();
}
function gdClick(e) {
  const b = e.target.closest('[data-gd]'); if (!b) return;
  ({ next: () => gdGo(1), prev: () => gdGo(-1), skip: () => gdClose(),
    install: async () => { const p = gdInstall; if (!p) return; gdInstall = null; p.prompt(); const r = await p.userChoice.catch(() => null); if (r?.outcome === 'accepted') toast('앱으로 설치했습니다'); gdDraw(); } })[b.dataset.gd]();
}
function gdKey(e) {
  if (e.key === 'Escape') gdClose();
  else if (e.key === 'ArrowRight') gdGo(1);
  else if (e.key === 'ArrowLeft' && gd.i > -1) gdGo(-1);
}
