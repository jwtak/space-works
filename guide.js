/* 사용 안내(둘러보기): 처음 로그인한 사람에게 한 번 — 메뉴를 하나씩 밝게 짚으며 짧게 설명한다.
   계정마다 한 번만 자동으로 뜨고, 다시 보기는 오른쪽 위 이름 메뉴의 '사용 안내'. */
/* 본 기록(나중에·건너뛰기·끝까지 포함)은 이 기기 localStorage와 내 OneDrive data/guide_seen.json 둘 다에 남긴다(11/14 사용자: 한 번 넘긴 사람은 다시 안 띄움).
   기기·브라우저를 바꿔도 OneDrive 기록을 보고 안 띄운다. 옛 주소(@spaceinve.com)로 남은 계정도 같은 사람으로 본다. */
const GD_KEY = () => `guide1:${(G.account?.username || '').toLowerCase().replace(/@spaceinve\.com$/, '@universeinvest.co.kr')}`;
const GD_STEPS = [
  { t: '대시보드', d: '이번 달 일정과 할 일을 한 화면에서 봅니다. 날짜 칸을 누르면 바로 일정을 추가할 수 있고, 딜 뉴스 카드 맨 위에는 오늘 챙길 시사점이 정리됩니다. 이번 주 새로 걸린 Pre-IPO 후보 카드를 누르면 그 회사가 있는 딜소싱 화면으로 갑니다. 팀 캘린더와 회의록은 세 분이 함께 쓰고, 일정 창에서 캘린더를 바꾸면 내 일정과 팀 캘린더 사이로 옮기며 Teams 회의도 링크가 바뀌지 않습니다. 할 일은 담당을 골라 맡길 수 있습니다. 업무일지·회의록 제목은 글 위 제목을 눌러 바로 고칩니다.', pc: '.nav [data-r="home"]', m: '.mh-it[href="#calendar"]' },
  { t: '메일', d: '회사 메일을 그대로 읽고 씁니다. 옆 숫자는 안 읽은 메일 수이고, PC에서는 새 메일이 오면 알림이 뜹니다. 휴대폰은 이름 메뉴의 ‘폰 알림 켜기’로 알림을 받을 수 있습니다. 받는 사람, 참조, 숨은참조 칸에 이름이나 주소 일부를 치면 주고받은 적 있는 주소가 최근 순으로 뜨고, 방향키와 Enter나 클릭으로 고릅니다. 메일 쓰기에서 넣은 표는 오른쪽 끝 선을 끌어 너비를 줄이거나, 표 안을 누르면 나오는 단추로 내용에 맞춤과 전체 너비를 고를 수 있습니다. 본문에 넣거나 붙여 넣은 그림은 누른 뒤 모서리를 끌어 크기를 바꿀 수 있습니다.', pc: '.nav [data-r="mail"]', m: '.mh-it[href="#mail"]' },
  { t: '딜 뉴스', d: '딜 뉴스를 매일 아침 모읍니다. 맨 위에 주요 기사 1~5위와 우리가 할 일(시사점)을 정리하고 우주·항공·방산을 따로 모아 보며, ☆로 체크한 기사는 기간이 지나도 ‘중요’에 남습니다.', pc: '.nav [data-r="news"]', m: '.mh-it[href="#deals/news"]' },
  { t: '시장동향', d: '주요 지수·업종 대표 ETF·고점 대비 낙폭·금리·환율과, 2021년 이후 공모주의 시초가·6개월·1년 수익률 통계를 매일 아침 갱신합니다. 공모주 통계 탭에서 연도·시장별 수익률, 보호예수 해제 전후 주가, 공모가 확정 위치, 증권신고서의 비교기업·PER·할인율을 보고 회사별 기록도 찾을 수 있고, PE 동향 탭에는 예비심사 청구 흐름·입찰 딜, 상장사 CB·BW·EB·유상증자 발행과 투자자, PEF 시장 통계를 모았습니다. M&A 거래 탭에서는 최근 5년 국내 경영권 거래의 금액, 추정 EV, EV/EBITDA와 업종별 중앙값을 보고 엑셀로 받을 수 있습니다. 벤처투자 탭에서는 DIVA 수시공시로 모은 벤처캐피탈의 투자금액과 업종, 업력, 지역별 비중을 공시월마다 봅니다.', pc: '.nav [data-r="market"]', m: '.mh-it[href="#market"]' },
  { t: '딜소싱', d: '연락할 회사와 출자사업을 다섯 묶음으로 봅니다. 행사에는 콥데이·기업설명회·전시회 일정이 있고, 참가사를 보고 만날 자리를 고릅니다. 상장에는 업종과 관계없이 투자 라운드를 돌았거나 도는 비상장 회사(투자 라운드, PE가 소수지분으로 들어가는 라운드는 PE 참여로 표시), 주관사를 뽑았거나 예비심사를 청구한 회사(상장 준비), 신규상장 회사가 있습니다. 매물에는 입찰딜, 다른 PE·VC가 펀드 만기를 앞두고 지분을 팔아야 하는 펀드 만기 신호, 한국M&A거래소 매물장터(참고용, 일주일에 한 번 갱신)가 있습니다. 펀드 만기는 두 보기로 나뉩니다. VC 앵글은 벤처 조합 만기와 예심 철회로 FI가 팔아야 하는 회사이고, 실적 좋은 Pre-IPO 후보를 표시하며 기사 투자사로 이은 조합은 출처: 기사, 운용사로 추정한 조합은 조합 추정으로 표시합니다. PE 앵글은 PE가 경영권을 인수한 지 3년에서 7년 된 포트폴리오 회사이고, DART 최대주주로 아직 들고 있는지와 매각 추진 기사가 났는지를 함께 보여 드립니다. 타깃에는 승계 시점의 비상장 오너기업, IPO가 막힌 상장사 자회사(중복상장), 상장폐지 시총 요건에 걸릴 수 있지만 실적이 좋은 회사(상폐 위험·CB, 맨 위에 Claude AI 추천), 어느 업종을 볼지 정하는 섹터, 소비재, 딥테크, 우주·방산, SI 타깃이 있습니다. 소비재는 화장품, 향수, 방향제처럼 영업이익을 20억 원 넘게 내는 소비재 회사 목록입니다. 딥테크는 젊은 창업자가 세운 반도체, 우주항공 같은 딥테크 스타트업 중 시리즈 B 이상인 곳의 목록입니다. 우주·방산은 섹터 리서치로 고른 위성, 발사체, 방산 RF, 방산 전자, 드론, 항공 부품 회사 목록이고, 사업이 겹쳐 이해상충을 먼저 볼 회사는 이해상충 확인으로 표시됩니다. 투자 라운드, 상장 준비, 펀드 만기, 오너기업, 매물장터에서도 우주·방산 회사에 표시가 붙고, 필터 맨 위 테마에서 우주·방산만 골라 볼 수 있습니다. SI 타깃은 SI(전략적 인수자)에게 들고 갈 만한 회사를 SI별로 모은 목록이고, 사내 딜은 맨 위에 고정됩니다. 회의에서 들은 내용이 들어간 회사는 사내 대화로 표시되고 엑셀 다운로드에서 빠집니다. 섹터의 PE 딜에서 조달을 추진하는 소수지분 딜은 라운드 참여 후보로 표시되고, 투자 라운드나 파이프라인으로 바로 넘길 수 있습니다. 이번 주에 새로 걸린 후보는 대시보드 카드와 아침 딜 뉴스 메일 맨 위에 모아 보여 드립니다. 컨택 상태는 목록의 컨택 상태 칸에서 바로 고르고, 상태와 메모는 세 분이 함께 봅니다. 검토 완료로 둔 회사는 진한 회색으로 남습니다. 이미 봤거나 관심 없는 회사는 같은 칸에서 ‘관심 없음’을 고르면 내 화면에서만 목록 맨 아래로 접힙니다. 행사는 펼쳐서 ‘관심 없음’을 누릅니다. 필터는 한 줄에 한 묶음씩 늘 펼쳐 있고, 매출·영업이익·매출 성장은 막대를 끌어 ‘몇 억 이상’, ‘몇 % 이상’으로 고릅니다. 고른 필터는 위에 모여 한 번에 초기화합니다. 펀드 만기의 VC 앵글은 만기 가까운 순, PE 앵글은 매각 신호가 있는 회사 먼저 인수한 지 오래된 순으로 보입니다. 출자사업에는 우주항공과 방산 쪽 펀드 출자 공고가 다가오는 접수순으로 있고, 기관전용 PEF와 Co-GP로 지원할 수 있는지, 2027 일정, 출자기관 게시판에서 받은 새 공고를 함께 봅니다.', pc: '.nav [data-r="deals"]', m: '.mh-it[href^="#deals/events"], .mh-it[href^="#deals/listing"], .mh-it[href^="#deals/offer"], .mh-it[href^="#deals/target"], .mh-it[href^="#deals/fund"]' },
  { t: '파이프라인', d: '어느 화면에서든 ‘파이프라인에 올리기’로 챙길 딜을 모아 단계와 다음 연락일을 관리합니다. 딜을 펼치면 검토 노트, 딜 노트, IR 등 자료를 한곳에서 보고, 세 분이 함께 고칩니다. 딜 자료는 공용 폴더 ‘06. 진행중인 딜’에 주간회의 순서대로 번호가 붙은 딜 폴더로 모입니다. 딜 노트는 업무일지·회의록의 ‘딜 노트’ 버튼으로도 씁니다. 옆 팩트시트 탭에는 요청한 회사와 엑스포 목록 회사의 팩트시트가 최신 요청순으로 한 목록에 모여 있고, 요청자와 매출, OPM, 매출 성장, 투자 단계로 거를 수 있습니다. 딜소싱 화면에서 회사를 펼쳐 ☆관심을 누르면 관심 기업 탭에 나만 보는 목록으로 모입니다.', pc: '.nav [data-r="pipeline"]', m: '.mh-it[href="#deals/pipeline"]' },
  { t: '가치평가', d: 'PER 시장, 재무분석, 평가 결과 세 탭이고 평가 결과 안에 요약, 상대가치평가, 절대가치평가가 있습니다. 처음에는 회사를 고르지 않은 상태라 PER 시장에서 전 상장사 PER 분포, 코스피와 코스닥 PER 추이, 업종별 PER 비교(처음엔 세부 업종, 줄을 누르면 업종 안 분포와 업종 PER 추이)를 봅니다. 회사를 검색하거나 평가한 회사 단추를 누르면 모든 탭이 그 회사를 함께 보고, PER 시장에는 그 회사 위치가 표시됩니다. 비상장 회사는 이름 옆에 「비상장」이 붙고, 현재가 대신 최근 투자 라운드(예: 시리즈 C) 주당 가격과 그 가격 대비 상승여력을 봅니다. 비상장 회사의 상대가치평가는 비슷한 업종 상장사 배수와 유사거래(M&A) 배수를 상장 직전 해 이익에 곱한 뒤 지금 시점으로 할인한 값입니다. 평가 결과 › 요약에서는 결합 목표주가, 풋볼필드, 상대가치평가와 절대가치평가 핵심 값을 한 화면에 봅니다. 재무분석에서는 성장성, 수익성, 효율성, 안정성 지표를 비교기업 평균과 견주고 5년 추세를 봅니다. 상대가치평가에서는 비교기업을 넣고 빼거나 범위, 기준 기간, 배수 조정을 바꿔 적정 주가를 다시 계산하고 같은 계산이 담긴 엑셀을 받습니다. 절대가치평가에서는 사업부별 매출부터 비용, 재투자, 할인율까지 15단계로 가정을 바꿔 DCF 적정 주가를 다시 계산하고, 연도별 재무제표와 민감도, 시나리오, 리버스 DCF 보고서를 봅니다. 할인율 단계의 선택지별 WACC 표에서는 베타, 무위험이자율, 주식위험프리미엄 선택에 따라 WACC가 얼마나 달라지는지 봅니다. 매출, 원가, 판관비 단계 표의 오른쪽 두 열은 과거와 추정 CAGR이고, 접힌 과거 연도는 표 왼쪽 위 「이전 연도 펴기」로 봅니다. 가정마다 평균에 넣을 해를 켜고 끌 수 있고, 상대가치 결합 단계에서는 사업부별 합산 가치를 봅니다.', pc: '.nav [data-r="valuation"]', m: '.mh-it[href="#valuation"]' },
  { t: '주간회의와 공용 폴더', d: '팀 파일함입니다. 파일을 끌어다 놓으면 올라가고, PPT·엑셀은 누르면 바로 열립니다. ‘링크 복사’로 폴더 주소를 보내면 받는 분은 그 폴더가 바로 열립니다.', pc: '.nav [data-r="weekly"], .nav [data-r="files"]', m: '.mh-it[href="#weekly"], .mh-it[href="#files"]' },
  { t: '법인 설립과 금감원 면담', d: '법인 설립은 위쪽에서 날짜별과 서류별 보기를 고르고, 금감원 면담은 준비서류를 체크합니다. 날짜별에서는 오늘 할 일이 파란 테두리로 보이고, 다 끝난 지난 날짜는 접혀 있습니다. 두 보기의 체크는 같습니다. 사람별 칸을 누르면 미준비, 준비됨, 해당 없음 순으로 바뀌고, 회사 일은 담당을 정해 체크합니다. 진행 상황을 ‘메모’에 남기면 세 분이 같이 봅니다.', pc: '.nav [data-r="corp"], .nav [data-r="fss"]', m: '.mh-it[href="#corp"], .mh-it[href="#fss"]' },
  { t: '자금', d: '계좌 잔고와 수입·지출, 자금계획을 봅니다. 계좌 탭에 통장과 CMA를 등록하고, 수입·지출 탭에 은행 거래내역이나 법인카드 이용내역 엑셀을 올리면 거래가 쌓여 분류별 월 합계가 나옵니다. 같은 거래를 다시 올려도 한 번만 들어가고, 같은 거래처는 지난번 분류를 제안합니다. 급여 거래는 받는 분과 건별 금액 없이 달별 합계 한 줄로만 저장됩니다. 자금계획 탭에 매달 나가는 고정비와 들어올 돈을 넣으면 12개월 월말 잔고, 버티는 개월 수, 계획 대비 실적, 운전자본을 봅니다.', pc: '.nav [data-r="cash"]', m: '.mh-it[href="#cash"]', when: () => typeof csAllowed === 'function' && csAllowed() },
  { t: '홈페이지', d: '만들고 있는 회사 홈페이지를 미리 봅니다. 공개 전이라 웍스 안에서만 보입니다.', pc: '.nav [data-r="homepage"]' },
  { t: '요청사항', d: '불편한 점이나 있었으면 하는 기능을 화면마다 남겨 주세요. 반영하면 그 아래에 답을 달아 드립니다. 오류가 떴으면 이름 메뉴의 오류 기록을 캡처해 같이 남겨 주세요.', pc: '#req:not([hidden])', m: '#me', mt: '요청사항, 오류 기록 (이름 메뉴 안)' },
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

async function gdOpen(force) {
  if (!S || document.querySelector('.gd')) return;
  if (!force) {
    try { const v = localStorage.getItem(GD_KEY()); if (v) { if (v !== '2') gdSeen(); return; } } catch { return; } // '1' = 예전에 이 기기에서만 남긴 기록: OneDrive에도 옮긴다
    try { if ((await STORE.readJSON('guide_seen')).items?.seen) { try { localStorage.setItem(GD_KEY(), '1'); } catch { /* 없어도 됨 */ } return; } } catch { return; } // 못 읽으면 띄우지 않는다
    if (!S || document.querySelector('.gd')) return;
  }
  if (isMobile() && route() !== 'home') location.hash = '#home'; // 폰은 첫 화면 메뉴 모음에서 짚는다
  gd.steps = GD_STEPS.filter((s) => !(s.install && gdStandalone()) && (!s.when || s.when())); gd.i = -1; // 이미 앱으로 쓰고 있으면 설치 안내는 뺀다
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

// 본 기록 남기기: OneDrive 파일은 없을 때만 만든다(이미 있으면 409로 끝, 그래도 본 것으로 친다). 실패하면 이 기기에만 '1'로 두고 다음에 다시
function gdSeen() {
  try { localStorage.setItem(GD_KEY(), '1'); } catch { /* 없어도 됨 */ }
  STORE.writeJSON('guide_seen', { seen: new Date().toISOString() }).then(() => true, (e) => e.status === 409 || e.status === 412)
    .then((ok) => { if (ok) try { localStorage.setItem(GD_KEY(), '2'); } catch { /* 없어도 됨 */ } });
}
function gdClose(viaBack) {
  if (!gd.el) return;
  gd.el.remove(); gd.el = null;
  document.removeEventListener('keydown', gdKey); removeEventListener('resize', gdPlace);
  try { if (localStorage.getItem(GD_KEY()) !== '2') gdSeen(); } catch { /* 다음에 또 떠도 된다 */ }
  if (viaBack !== true) gd.off?.();
  gd.off = null;
}

function gdDraw() {
  if (!gd.el) return;
  const card = gd.el.querySelector('.gd-card'), n = gd.steps.length;
  if (gd.i < 0) { // 첫 인사
    gd.el.querySelector('.gd-hole').hidden = true;
    card.className = 'gd-card center';
    card.innerHTML = `<div class="gd-mark">UNIVERSE WORKS</div><h2>${esc(myName())} 님, 반갑습니다</h2><p>주요 메뉴를 1분 안에 안내해 드립니다.</p>
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
