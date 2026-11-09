/* SPACE WORKS — 딜소싱 › 예심청구(4번)·매각희망(3번)·입찰딜(5번) = 딜레이더
   매일 09:10 PC 작업(05. 딜소싱\_자동화\딜레이더\run_radar.py)이 회사 OneDrive SPACE WORKS/data/ 에
   yesim.json·sell.json·bids.json 을 올린다(이 화면은 읽기만, 형식은 딜레이더\CONTRACT.md).
   컨택 상태·메모는 세 탭이 data/radar_marks.json 하나를 같이 쓴다(key = yesim:<id> · sell:<id> · bids:<id>, 탁지원·대표님 두 분 편집 공유).
   예심청구 화면의 주관사 선정 회사(yesim.json mandates, id = mandate:<정규화 이름>)는 key·파이프라인 ref = yesim:mandate:<정규화 이름>, 팩트시트 요청일은 그 항목의 fs.
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
const RD_YS_F = [['all', '전체'], ['mandate', '주관사 선정'], ['review', '심사 중'], ['ok', '승인'], ['drop', '철회·미승인'], ['new', '새 소식'], ['hidden', '가린 회사']];
// 재무 필터(최근 연도 기준, 억원·%) — 고르면 재무가 없는 회사('확인 불가')는 빠진다
const RD_YS_REV = [['', '전체'], ['100', '100억+'], ['300', '300억+'], ['500', '500억+'], ['1000', '1,000억+']];
const RD_YS_OPM = [['', '전체'], ['0', '흑자'], ['5', '5%+'], ['10', '10%+'], ['15', '15%+']];
function rdFinOk(x, s) {
  if (!s.rev && !s.opm) return true;
  const f = x.fy ? x.fin.years[x.fy] : null, rev = f ? rdNum(f[0]) : null, op = f ? rdNum(f[1]) : null;
  if (s.rev && !(rev != null && rev >= +s.rev)) return false;
  if (s.opm && !(op != null && rev > 0 && (s.opm === '0' ? op > 0 : (op / rev) * 100 >= +s.opm))) return false;
  return true;
}
const RD_YS_SORT = [['filed', '청구일순'], ['decided', '결과일순'], ['rev', '매출순'], ['broker', '주관사순']];
const RD_YS_ORDER = ['주관사선정', '심사중', '승인', '상장', '미승인', '철회']; // 전체 보기 묶음 순서 = 진행 순서
const RD_EYE_OFF = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="12" cy="12" r="2.5"/><path d="M4.5 4.5l15 15"/></svg>';
const RD_EYE = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"/><circle cx="12" cy="12" r="2.5"/></svg>';
const RD_KINDS = ['철회', '만기', '뉴스'];
const RD_SELL_SORT = [['prio', '우선순'], ['near', '가까운 날짜순'], ['pct', '지분율순'], ['name', '회사명순']];
const RD_STAGES = ['매각 추진', '주관사 선정', '예비입찰', '숏리스트', '본입찰', '우선협상', '계약', '무산', '공시 검토', '회생 M&A'];
const RD_FITS = ['상', '중']; // 하는 bids.json에 넣지 않음
const RD_BIDS_DONE = ['우선협상', '계약', '무산']; // 인수자가 정해졌거나 끝난 단계 — 목록 아래로

// 머리줄 ⓘ 설명(app.js infoOpen)
Object.assign(TAB_INFO, {
  'deals/yesim': { title: '예심청구', asof: '기준 2026-11-09 · 규정 원문 대조: KRX 법무포털(rule.krx.co.kr) 현행 코스닥·유가증권 상장규정(2026.9.23 개정)·시행세칙(2026.10.2 개정), 금투협 인수업무규정(2025.9.3 시행). 실무 해석: 거래소 「2026 코스닥 상장심사 이해와 실무」(K26)·「2025 유가증권시장 상장심사 가이드북」(Y25). 통계는 언론·증권사 집계. \'판단\'이라고 쓴 곳은 자료가 아닌 해석입니다.', rows: [
    ['무엇인가', [
      '비상장 회사가 상장하려고 거래소에 상장예비심사를 신청한 것입니다. 청구 사실은 KIND에 공개되고, 청구서에 주주 구성과 재무가 들어 있습니다.',
      '청구하면 회사가 몇 달 안에 상장하겠다고 공식적으로 밝힌 것과 같습니다. 이 탭의 회사들은 상장 일정의 막바지에 있습니다.',
      '청구 전 단계인 주관사 선정도 함께 봅니다. 주관사 선정(기사로 확인) → 청구(심사 중) → 승인 순서로 진행됩니다. 신주 Pre-IPO는 주관사 선정부터 청구 전까지 가능하고, 청구 뒤에는 제3자배정 신주가 예심 효력 불인정 사유라 사실상 구주만 살 수 있습니다(코스닥 세칙 제13조①1호).',
      { table: [
        ['단계', '규정·실무', '근거'],
        ['대표주관계약', '지정감사 신청 때 상장 추진을 입증하는 서류(대표주관계약서, 이사회 의사록 등)로 냄', 'K26 p.22'],
        ['지정감사', '결산일 3개월 전까지 금감원에 신청(12월 결산이면 9월 말)', 'K26 p.22(실무 안내)'],
        ['기술성평가', '결과를 통보받고 6개월 안에 예심을 신청해야 평가 효력 인정', '코스닥 세칙 제11조④'],
        ['예심', '결과 통지 기한 45영업일(연기 가능). 실제로는 60~120영업일이 흔함', '코스닥 규정 제6조④, K26 p.10'],
        ['승인 효력', '결과 통보 후 6개월 안에 상장신청을 하지 않으면 효력 불인정 사유. 거래소가 승인하면 6개월 안에서 연장', '코스닥 규정 제8조①5호'],
        ['청구~상장', '약 4개월(가이드북 안내치, 법정 기한 아님)', 'Y25 p.21'],
      ] },
    ]],
    ['왜 보나', [
      '청구한 뒤에는 신주 투자가 사실상 막힙니다. 예심 신청일부터 상장 전날까지 제3자배정으로 주식등을 발행하면 거래소가 예심 결과의 효력을 인정하지 않을 수 있습니다(코스닥 규정 제8조①7호·세칙 제13조①1호, 유가 규정 제23조①1호바목·세칙 제17조②1호). 자동 상실은 아니고 거래소 재량이지만, 신주 Pre-IPO는 청구 전에 끝나야 합니다.',
      '그래서 이 탭은 회사가 상장 일정의 어디에 있는지 보여 주는 지도이고, 실제 기회는 단계마다 다릅니다.',
      { table: [
        ['회사 단계', '현실적인 투자', '우리가 할 일'],
        ['주관사 선정 전후, 상장 1~2년 전', 'RCPS·CPS·CB·구주, 공모가 70% 리픽싱', '신주 Pre-IPO 검토(청구 전 신호)'],
        ['주관사 선정 후~청구 전', '막차 라운드, 증권사 PI, 자본잠식 해소용 증자', '잔여 라운드 확인'],
        ['청구 후~승인(심사 중)', '신주는 사실상 불가', '기존 FI 구주 매입 여지'],
        ['승인 후~상장', '공모 참여, 코너스톤(2026.11.13~)', '신규상장 탭에서 공모·블록딜 관점'],
        ['철회·연기 후', '밸류 리셋 라운드, FI 지분 세컨더리', '낮아진 밸류로 진입 검토'],
      ] },
      '판단: 회수 목표가 투자 후 1~1.5년이면 가장 맞는 진입 구간은 주관사 선정 이후~청구 직전입니다. 심사 중 구주는 상장까지 짧아 수익이 기간보다 할인 폭에서 나옵니다.',
    ]],
    ['어떻게 보나', [
      '필터: 전체, 주관사 선정, 심사 중, 승인, 철회·미승인, 새 소식(최근 상태가 바뀐 회사), 가린 회사. 정렬: 청구일순, 결과일순, 매출순, 주관사순.',
      '전체는 진행 순서대로 주관사 선정 → 심사 중 → 승인 → 상장 → 미승인 → 철회로 묶어 보여 줍니다. 주관사순은 대표주관사별로 묶고, 많이 맡은 주관사가 위에 옵니다.',
      '주관사 선정은 주관사를 정했다는 기사가 난 청구 전 회사이고 선정일 최근순입니다. 이미 청구한 회사는 펼친 칸 \'진행\'에 주관사 선정일이 나옵니다.',
      '볼 필요 없는 회사는 행 오른쪽 눈 아이콘으로 가립니다. 가린 회사는 \'가린 회사\'에서 다시 보이게 할 수 있고, 대표님 두 분도 같은 목록을 봅니다.',
      '회사를 펼치면 3개년 매출·영업이익·순이익, 주관사, 기술특례 여부, 주요 주주(VC·조합은 FI 표시), 대표 연락처, 관련 기사, KIND·DART 원문 링크가 나옵니다.',
      '목록 위 \'청구 전 신호\'는 아직 청구 전인데 기술성평가·주관사 선정·프리IPO·상장 추진 기사가 난 회사입니다. KIND 목록이나 주관사 선정 목록에 이미 있는 회사는 뺍니다.',
      '스팩과 재상장은 뺐습니다. 자료는 매일 09:10에 KIND·DART·딜 뉴스에서 새로 받습니다.',
    ]],
    ['그래서 할 일', [
      '매일: \'새 소식\'으로 새로 청구·승인·철회된 회사를 훑습니다.',
      '주관사 선정이나 청구 전 신호가 새로 뜨면 우선순위 1번입니다. 회사나 주관사 쪽에 라운드가 열려 있는지 확인합니다.',
      '주관사 선정 회사 중 더 볼 곳은 펼친 칸에서 \'팩트시트 요청\'을 누릅니다. 요청한 회사는 수집기가 팩트시트를 만듭니다.',
      '심사 중 회사: 주주 목록의 FI 조합을 보고, 그 조합이 매각희망 탭 \'만기\'에도 있으면 구주 매입을 제안합니다. 만기가 가까운 조합은 상장 뒤 락업과 블록딜 할인을 기다리기보다 지금 넘길 이유가 있습니다.',
      '철회 회사: 밸류를 낮춘 라운드나 FI 지분 세컨더리를 봅니다. 같은 회사가 매각희망 탭에 \'철회\'로도 뜹니다.',
      '승인 회사: 이 탭에서는 정리하고 신규상장 탭에서 공모·락업 관점으로 봅니다.',
      '연락하면 상태(연락함·미팅·보류)와 메모를 남기고, 진행할 딜은 \'파이프라인에 올리기\'로 넘깁니다. 대표님 두 분도 같은 기록을 봅니다.',
    ]],
    ['락업(의무보유): 누가 얼마나 묶이나', [
      '근거는 코스닥시장 상장규정 제26조①, 유가증권시장 상장규정 제27조①입니다. 기준일은 예심 신청일이고, 기간은 상장일부터 셉니다(유가증권 신주는 발행일부터).',
      { table: [
        ['대상', '코스닥', '유가증권'],
        ['최대주주 등', '6개월(기술성장기업·신속이전기업 1년)', '6개월(최대주주가 사모집합투자기구면 1년)'],
        ['청구 전 1년 안에 최대주주 등에게서 구주 취득', '6개월(기술성장 1년)', '6개월'],
        ['청구 전 1년 안에 제3자배정 신주 취득', '6개월(기술성장 1년). 벤처금융·전문투자자 등은 세칙 제23조④로 제외', '발행일부터 1년, 단 상장 후 최소 6개월'],
        ['벤처금융·전문투자자가 모집·매출이 아닌 방법으로 취득, 투자기간 2년 미만', '1개월(각 자본금 10% 한도). 대형법인이면 제외(세칙 제23조⑤2호)', '조항 없음'],
        ['상장주선인(주관사)이 상장 전 취득', '6개월, 공모가 괴리율 30% 미만이면 3개월(2025.7.10 이후 예심분)', '조항 없음(외국기업 상장주선인 투자의무는 별도, 규정 제13조③)'],
        ['거래소가 필요하다고 인정하는 주주 등', '2년 이내', '2년 이내 연장 가능(제27조②)'],
      ] },
      '\'최대주주 등\'의 임원에는 업무집행지시자(상법 제401조의2)도 들어갑니다. 2026.7.2부터 복수의결권주식을 발행한 회사는 최다의결권자 등도 포함됩니다.',
      '코스닥에서 기관전용 PEF는 \'벤처금융\'입니다(규정 제2조①14호 → 벤처기업법 시행령). 세칙 제23조④는 벤처금융·전문투자자가 받은 제3자배정 신주를 6개월 대상에서 빼 줍니다. 실무서(K26 p.41)는 이를 \'신주를 직접 받아 청구일까지 보유한 경우\'로 해석해, 이미 발행된 주식을 중간에 산 경우는 빼 주지 않습니다. 면제돼도 투자기간 2년 미만이면 1개월은 남습니다.',
      '대형법인이면 그 1개월도 없습니다. 대형법인은 예심 신청일 자기자본 1,000억원 이상이거나 상장신청일 기준시가총액(공모가 × 상장예정 주식 수) 2,000억원 이상인 국내기업입니다(규정 제2조42호, 세칙 제23조⑤2호). 판단: 시총은 공모가가 나와야 정해지므로, 투자할 때 확실히 하려면 자기자본 기준을 봅니다.',
      '구주로 들어가면 누구에게서 사느냐로 갈립니다(코스닥).',
      { table: [
        ['산 구주', '일반', '대형법인'],
        ['최대주주 등(특수관계인·임원 포함)의 구주, 청구 전 1년 안', '6개월(기술성장 1년)', '6개월(예외 없음)'],
        ['최대주주가 아닌 주주(FI 등)의 구주, 투자기간 2년 미만', '1개월(자본금 10% 한도)', '없음'],
        ['위 FI 구주가 청구 전 1년 안 제3자배정 발행분', '6개월일 수 있음(실무서는 직접 받아 보유한 경우만 면제로 해석)', '같음. 거래소 사전 확인'],
        ['청구 뒤에 산 구주', '규정 문언상 대상 아님. 거래소가 필요하다고 보면 2년 이내(제26조①8호)', '같음'],
      ] },
      '실제 락업은 규정보다 깁니다. 주관사와 협의해 2년 안에서 늘릴 수 있고(제26조① 단서), 수요예측 때 기관이 스스로 확약을 겁니다. 최근 상장 39곳의 FI 395건은 락업 없음 9%, 1개월 34%, 2개월 9%, 3개월 30%, 6개월 9%, 12개월 이상 7%였고 중앙값은 2개월입니다(2026-11-09 집계).',
      'CB·BW: 코스닥은 사채를 취득한 시점(K26 p.41), 유가증권 가이드북은 사채 발행 시점(Y25 p.129)으로 판단합니다. 청구 1년 전보다 먼저 발행·취득한 CB는 1년 안에 전환해도 신주 6개월 규정 대상이 아닙니다. 다만 최대주주에게서 산 CB나 투자기간 2년 미만 벤처금융 지분이면 다른 호가 적용될 수 있고, 유가증권에서 이미 발행된 CB를 나중에 산 경우는 결과가 다를 수 있습니다.',
      '규정 의무보유와 별개로 수요예측 때 기관이 스스로 거는 확약이 있습니다. 2025.7부터 확약한 기관에 기관투자자 배정물량의 30%를 먼저 배정하고, 2026.1.1 이후 증권신고서 제출분부터 40%입니다. 모자라면 대표주관회사가 공모물량의 1%(상한 30억원)를 사서 6개월 보유합니다. 2026.3부터 스팩은 대상에서 빠졌습니다.',
    ]],
    ['언제 사면 언제 팔 수 있나 (예시)', [
      '아래는 청구~상장 약 4개월을 가정한 계산입니다. 실제 심사가 길어지면 그만큼 늦어집니다.',
      { table: [
        ['진입', '락업', '팔 수 있는 때(투자 시점부터)'],
        ['청구 3개월 전 신주, 코스닥 일반', '상장 후 6개월', '약 13개월'],
        ['청구 3개월 전 신주, 코스닥 PEF 벤처금융 면제', '상장 후 1개월', '약 8개월'],
        ['청구 3개월 전 신주, 코스닥 대형법인 PEF', '규정상 없음', '약 7개월'],
        ['청구 3개월 전 신주, 유가증권', '발행일부터 1년(상장 후 최소 6개월)', '약 13개월'],
        ['청구 1년 넘게 전에 신주·CB', '최대주주 등이 아니면 1년 규정은 없음. 코스닥 벤처금융·전문투자자는 투자기간 2년 미만이면 1개월', '약 1년 4개월 이상'],
        ['상장 후 블록딜·장내', '규정상 없음', '바로'],
      ] },
    ]],
    ['락업을 줄이는 구조', [
      '청구 1년 전보다 먼저 들어갑니다. 신주·최대주주 구주에 걸리는 1년 규정 밖입니다(코스닥 벤처금융은 투자기간 2년 미만이면 1개월은 남음). 다만 상장까지 기간이 길어집니다.',
      'CB·BW로 들어갑니다. 코스닥은 사채를 산 날, 유가증권은 발행 시점이 기준이라 청구 1년 전보다 먼저 확보한 CB는 그 뒤 전환해도 신주 6개월 규정 대상이 아닙니다.',
      '코스닥 막차 라운드는 기관전용 PEF로 신주를 직접 받고 청구일까지 보유합니다. 6개월이 1개월로 줄어듭니다. 판단: 같은 막차라도 구주보다 신주가 유리합니다.',
      '코스닥 대형법인(자기자본 1,000억원 또는 기준시가총액 2,000억원 이상)에 들어갑니다. 벤처금융 1개월도 없고, 최대주주가 아닌 FI의 구주를 사도 규정상 락업이 없습니다. 최대주주 쪽 구주는 6개월입니다.',
      '상장 뒤 블록딜로 삽니다. 의무보유는 없지만 공모가 대비 할인 여지가 줄어듭니다.',
    ]],
    ['막힌 길', [
      '청구 뒤 제3자배정 신주: 예심 결과 효력 불인정 사유입니다(거래소 재량, 주관사 의무인수분 제외).',
      '유가증권: 2025.7.10 이후 예심 신청분부터, 청구 전 1년 안에 제3자배정으로 받거나 최대주주 등에게서 산 지분은 공모 구주매출로 팔아도 의무보유가 면제되지 않습니다(유가 세칙 제21조②2호가목 삭제).',
      '코스닥: 투자기간 2년 미만 벤처금융 지분 중 의무보유 대상분은 구주매출을 허용하지 않습니다(거래소 심사 실무, K26 p.158).',
      '회사 명의의 원금·수익 보장 약정은 주주평등원칙 위반으로 무효입니다(대법원 2020.8.13 2018다236241). 보장이 필요하면 최대주주나 대표 개인이 지게 해야 합니다. 다만 차등 취급을 정당화할 특별한 사정이 있으면 사전동의권 등은 허용됩니다(대법원 2023.7.13 2021다293213).',
    ]],
    ['함께 알아둘 제도', [
      '주관사 지분 제한(금투협 인수업무규정 제6조·제15조): 증권사와 이해관계인이 합쳐 5% 이상이면 공동주관해야 하고, 단독 5% 또는 합산 10% 이상이면 주관할 수 없습니다(중소·벤처·일부 중견·신성장 기업은 10%·10%·15%). 예심 신청 전에 취득하고 상장일부터 6개월 의무보유를 확약한 지분은 계산에서 빠집니다. 창투조합·신기술조합 등 펀드 지분은 출자비율만큼만 출자자 지분으로 봅니다. 판단: 우리 펀드 LP에 증권사가 있으면 그 증권사가 포트폴리오사 주관을 맡을 수 있는지에 영향을 줍니다.',
      '코너스톤투자자 제도(개정 자본시장법 2026.11.13 시행 예정, 시행령 11.3 국무회의 의결, 11월 중 공포 예정): 배정분의 50%는 6개월, 30%는 8개월, 20%는 10개월 보호예수. 대주주·특수관계인 등 이해관계 있는 기관은 참여할 수 없습니다. 배정 한도는 잔여 기관 배정물량 기준 코스피 전체 20%·개별 10%, 코스닥 전체 30%·개별 20%입니다. 참여하려면 사전수요예측 자격에 더해 사전 청약 물량의 20배 이상 자기자본(고유재산으로 참여) 또는 위탁재산(위탁재산으로 참여)이 있어야 합니다(금융위 보도자료 기준).',
      '사전수요예측(코너스톤과 같은 2026.11.13 시행 예정): 희망 공모가 밴드를 정하기 전에 주관사가 기관투자자 수요를 미리 파악하는 절차입니다. 주관사는 참여 기관과 비밀유지계약을 맺고 정보 제공 일시·상대방·내용을 기록해야 합니다. 일반 사모운용사·투자일임업자는 총 위탁재산 300억원 이상이어야 참여할 수 있습니다(금융위 2026.7.30 입법예고 기준).',
      '중복상장 규제(2026.8.3 시행): 상장사 자회사 상장은 원칙 금지, 예외 허용입니다. 물적분할·영업양도·현물출자로 세운 자회사는 모회사 주주 동의가 필수이고, 그 밖의 자회사는 동의를 받으면 주주보호 노력을 한 것으로 추정합니다. FI 회수만을 위한 상장은 심사에서 불리하게 작용할 수 있습니다(가이드라인 해석).',
      'AI·에너지·우주 업종별 질적심사기준(2025.12.31 시행, 코스닥 세칙 별표7): 우주는 위성·발사체 및 구성부품 제조, 지상국, 위성서비스 기업 중 거래소가 인정한 곳에 적용합니다. 별도 특례 트랙이 아니라 심사기준입니다.',
      '기술평가 개편 추진(거래소 2026.10.19 설명회, 보도 기준): 기술모듈 4개→7개(반도체 설계·IP, 사이버보안, 우주항공, 로보틱스 신설), 12월 운영지침 개정, 2027년 2분기 이후 적용 예정. 의무보유·예심 기간은 바뀌지 않습니다.',
      '2026.7.2 이후 예심 신청분부터: 기술성장기업이 상장 후 5년 안에 사업목적을 바꾸면 상장적격성 실질심사 사유가 되고, 특례상장기업의 매출·손실 관리종목 면제는 기업가치 제고 계획을 공시해야 받습니다.',
      '벤처투자법 개정(2027.3.30 시행, 시행 후 새로 맺는 계약부터): 벤처투자조합 운용사가 맺는 계약에서 IPO 실패를 이유로 시행령 범위를 넘는 가격조정 등을 무효로 합니다. 표준계약서 IPO 조항 완화는 법과 별개로 2026.6.30 나온 권고안입니다. 판단: 기관전용 PEF는 법문상 적용 대상이 아닙니다.',
    ]],
    ['시장 숫자', [
      '2024년 코스닥 예심 청구 102곳 중 34곳이 자진 철회했습니다(언론 집계). 2025년~2026년 상반기 철회·미승인 기업의 83%가 실적 관련 이슈였습니다(삼정KPMG). 심사 중 회사라도 상장이 확정된 것은 아닙니다.',
      '2026년 하반기 코스닥 예심을 통과한 39곳의 평균 심사 기간은 63.8영업일로, 상반기 24곳의 78.5영업일보다 14.7영업일 줄었습니다(거래소 자료, CBC뉴스 2026.11.5 보도).',
      '2026년 상반기 신규상장 17곳(공모 규모 -48.7%) 중 13곳이 공모가를 밑돌았습니다(신영증권 집계, 6/30 종가 기준).',
      '공모가가 Pre-IPO 단가보다 낮았던 사례: 지아이이노베이션 -64%, 오가노이드사이언스 -31%.',
    ]],
    ['딜 전에 확인할 것', [
      '청구 뒤에 기존 FI 구주를 사면 의무보유가 걸리는지, 심사에 영향이 있는지(주관사·거래소). 심사 중 신주 발행은 승인 전에도 불리하게 반영될 수 있습니다(해석상 주의).',
      'SPC를 거쳐 투자해도 코스닥 벤처금융으로 인정되는지(거래소 사전 확인).',
      '기관전용 PEF가 사전수요예측·수요예측·코너스톤에 참여할 수 있는지(입법예고 자격 요건에 기관전용 PEF는 따로 적혀 있지 않음), 시행령 공포 여부.',
      '규정은 매번 바뀔 수 있습니다. 딜 뉴스에 \'상장 규정\' 태그 기사가 뜨거나 실무서 새 판이 나오면 이 설명을 고칩니다.',
    ]],
  ] },
  'deals/sell': { title: '매각희망', rows: [
    ['무엇인가', '다른 PE·VC가 비상장 지분(구주)을 팔아야 하거나 팔려는 신호를 모은 목록입니다. 상장 주식 블록은 사지 않으므로 지분 축소 공시, 락업 해제, 타법인 EB는 넣지 않습니다.'],
    ['왜 보나', '파는 쪽이 급할수록 구주·세컨더리를 할인된 값에 살 수 있습니다. 신생 GP가 딜을 얻는 현실적인 경로입니다.'],
    ['어떻게 보나', [
      '만기: 만기가 1년 안에 지났거나 2년 안에 오는 투자조합과 그 조합이 가진 회사입니다. 매도 후보는 그 조합입니다.',
      '근거의 \'예심 주주\'는 예심을 청구한 회사의 주주, \'투자설명서 주주\'는 상장했거나 상장 직전인 회사의 주주입니다.',
      '철회: 예심을 철회해 FI 회수가 늦어진 회사입니다. 매도 후보는 그 회사의 FI입니다.',
      '뉴스: 매각 기사 중 우선협상 전이고 우리가 낄 여지(입찰딜 적합도 상·중)가 있는 것만 남깁니다.',
      '기본 정렬은 우선순입니다. 만기가 지난 조합이 가진 비상장 회사, 그 밖의 비상장 회사, 나머지 순이고 같은 묶음 안에서는 날짜가 가까운 순입니다.',
      '펼치면 근거 한 줄, 매도 후보, 원문 링크가 나옵니다.',
    ]],
    ['그래서 할 일', [
      '매도 후보(조합 운용사, 철회 회사의 FI)에 지분 매입 의사를 타진합니다.',
      '만기가 지난 조합은 연장 기간이라 팔 압박이 가장 큽니다. 먼저 연락합니다.',
      '예심을 청구한 회사의 구주를 사면 의무보유가 걸리는지 주관사에 먼저 확인합니다.',
      '연락하면 상태와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
    ]],
  ] },
  'deals/bids': { title: '입찰딜', rows: [
    ['무엇인가', '회계법인·증권사가 매각 주관을 맡아 여러 인수 후보에게 입찰을 받는 딜입니다. 법원 회생 M&A 공고와 회사가 매각을 검토 중이라고 답한 공시도 들어 있습니다. 대기업 대형 거래, 부동산 매각처럼 우리가 낄 여지가 없는 딜(적합도 하)은 넣지 않습니다.'],
    ['왜 보나', '혼자 사기 어려운 딜도 SI(전략적 투자자) 공동투자, 메자닌, 소수지분으로 들어갈 여지가 있습니다. 매각 자문사와 관계를 쌓는 통로이기도 합니다.'],
    ['어떻게 보나', [
      '단계: 매각 추진 → 주관사 선정 → 예비입찰 → 숏리스트 → 본입찰 → 우선협상 → 계약. 공시 검토(회사가 검토 중이라고 답한 것)와 회생 M&A는 따로 묶습니다.',
      '적합도 상·중은 우리가 낄 여지(메자닌·구주·소수지분·SI 공동투자)입니다.',
      '정렬: 아직 들어갈 수 있는 딜이 위, 우선협상·계약 단계와 입찰 일정(인수의향서 마감·본입찰)이 다 지난 딜이 아래입니다. 같은 묶음 안에서는 적합도 상, 최근 소식 순입니다.',
      '\'자문사별\'로 바꾸면 어느 자문사가 어떤 딜을 맡았는지 봅니다.',
      '출처는 기사, DART 조회공시 답변, 법원 공고입니다.',
    ]],
    ['그래서 할 일', [
      '적합도가 상·중이고 예비입찰 전이면 자문사에 자료(티저·IM)를 요청하고, 함께 들어갈 SI 후보를 찾습니다.',
      '우선협상·계약 단계나 최대주주 지분 매각처럼 인수자가 정해지는 딜은 인수자에게 공동투자나 인수 자금(CB 등 메자닌)을 제안할 수 있는지 봅니다.',
      '회생 M&A는 공고의 입찰 마감일을 확인하고, 인수 의향이 있는 SI와 함께 들어갈지 봅니다.',
      '연락하면 상태와 메모를 남기고, 진행할 딜은 파이프라인에 올립니다.',
    ]],
  ] },
});

const rdS = {
  tab: null, host: null, field: null, // field = 쓰고 있는 메모 칸 {el, tab}
  marks: { items: [], version: null }, dirty: new Map(), saving: Promise.resolve(),
  yesim: { data: null, at: 0, loading: null, q: '', f: 'all', sort: 'filed', rev: '', opm: '', open: new Set(), focus: null },
  sell: { data: null, at: 0, loading: null, q: '', f: 'all', sort: 'prio', open: new Set(), focus: null },
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

// 재무(fin)·주주(holders)는 예심 items와 주관사 선정 mandates가 같은 형식
function rdFinN(x) {
  const fin = x.fin && typeof x.fin === 'object' && x.fin.years && typeof x.fin.years === 'object' ? x.fin : null;
  const years = fin ? Object.keys(fin.years).filter((y) => Array.isArray(fin.years[y])).sort() : [];
  const fy = [...years].reverse().find((y) => rdNum(fin.years[y][0]) != null) || '';
  return { fin, years, fy, rev: fy ? rdNum(fin.years[fy][0]) : null };
}
const rdHoldersN = (a) => rdArr(a).filter((h) => rdStr(h.name)).map((h) => ({ name: rdStr(h.name), pct: rdNum(h.pct), fi: h.fi === true }))
  .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
// 회사 이름 비교용: 수집기 base.norm_name과 같은 규칙(mandate id 뒷부분과 같은 값)
const rdCo = (s) => rdStr(s).replace(/\(주\)|㈜|주식회사|\(유\)|유한회사|\(사\)/g, '').replace(/[\s·.,\-()[\]]/g, '').toLowerCase();
const rdIsMn = (id) => String(id).startsWith('mandate:');
// 팩트시트(mandates[].fs): 수집기가 요청된 회사만 만든다. 없으면 null
function rdFsN(f) {
  if (!f || typeof f !== 'object') return null;
  const ss = (a) => (Array.isArray(a) ? a : []).map(rdStr).filter(Boolean);
  return {
    made: rdDay(f.made), biz: rdStr(f.biz), product: rdStr(f.product), stage: rdStr(f.stage), total: rdNum(f.total), totalNote: rdStr(f.totalNote),
    fi: rdStr(f.fi), preIpo: rdStr(f.preIpo), valuation: rdStr(f.valuation), plan: rdStr(f.plan),
    rounds: rdArr(f.rounds).map((r) => ({ when: rdStr(r.when), round: rdStr(r.round), amount: typeof r.amount === 'number' ? rdEok(r.amount) : rdStr(r.amount), investors: rdStr(r.investors) }))
      .filter((r) => r.when || r.round || r.amount || r.investors),
    contact: rdArr(f.contact).map((c) => ({ who: rdStr(c.who), how: rdStr(c.how) })).filter((c) => c.who || c.how),
    points: ss(f.points), risks: ss(f.risks), sources: ss(f.sources),
  };
}

function rdNormYesim(raw) {
  const d7 = ymd(addDays(new Date(), -7));
  const items = rdArr(raw.items).filter((x) => rdStr(x.name)).map((x) => {
    const filed = rdDay(x.filed), decided = rdDay(x.decided), changedAt = rdDay(x.changedAt), news = rdNewsN(x.news);
    const { fin, years, fy, rev } = rdFinN(x), holders = rdHoldersN(x.holders);
    // 주주 목록이 없으면 KIND 최대주주(topHolder) 한 줄이라도 보여 준다. 상장 뒤에는 종목코드(code)·상장일(listed)이 온다
    const th = x.topHolder && typeof x.topHolder === 'object' && rdStr(x.topHolder.name) ? { name: rdStr(x.topHolder.name), pct: rdNum(x.topHolder.pct), fi: x.topHolder.fi === true, top: true } : null;
    const o = {
      id: rdStr(x.id) || `${rdStr(x.name)}|${filed}`, name: rdStr(x.name), type: rdStr(x.type), market: rdStr(x.market),
      filed, decided, changedAt, status: rdStr(x.status).replace(/\s+/g, ''), broker: rdStr(x.broker), techSpecial: rdFlag(x.techSpecial),
      sector: rdStr(x.sector), product: rdStr(x.product), ceo: rdStr(x.ceo), founded: rdStr(x.founded), addr: rdStr(x.addr),
      phone: rdStr(x.phone), home: rdStr(x.home), fin, years, fy, rev,
      holders: holders.length ? holders : th ? [th] : [], code: rdStr(x.code), listed: rdDay(x.listed),
      dartUrl: rdStr(x.dartUrl), kindUrl: rdStr(x.kindUrl), news,
    };
    o.isNew = [filed, decided, changedAt, ...news.map((n) => n.dt)].some((t) => t && t >= d7);
    o.q = rdQ(o.name, o.sector, o.product, o.broker, o.ceo, o.addr, o.market, o.type, rdYsLabel(o.status), o.techSpecial, holders.map((h) => h.name));
    return o;
  });
  // 주관사 선정(mandates): pre = 아직 청구 전('주관사 선정' 단계)이라 주관사 선정 필터에 보이는 회사. 이미 청구한 회사는 yesimId로 예심 행에 선정일을 붙인다
  const strs = (v) => (Array.isArray(v) ? v : [v]).map(rdStr).filter(Boolean);
  const mandates = rdUniq(rdArr(raw.mandates).filter((x) => rdStr(x.name)).map((x) => {
    const name = rdStr(x.name), id = rdStr(x.id), stage = rdStr(x.stage), yesimId = rdStr(x.yesimId), holders = rdHoldersN(x.holders);
    let lead = strs(x.lead), co = strs(x.co);
    if (!lead.length && !co.length) { const b = rdSplit(x.broker); lead = b.slice(0, 1); co = b.slice(1); }
    const o = {
      id: rdIsMn(id) ? id : `mandate:${id || rdCo(name)}`, mn: true, name, selected: rdDay(x.selected), broker: rdStr(x.broker), lead, co,
      market: rdStr(x.market), target: rdStr(x.target), tech: x.tech === true ? '해당' : x.tech === false ? '해당 없음' : '', line: rdStr(x.line),
      stage, pre: stage ? stage.replace(/\s+/g, '') === '주관사선정' : !yesimId, yesimId, filed: rdDay(x.filed),
      sector: rdStr(x.sector), ceo: rdStr(x.ceo), addr: rdStr(x.addr), phone: rdStr(x.phone), home: rdStr(x.home), founded: rdStr(x.founded),
      ...rdFinN(x), finNote: rdStr(x.finNote), holders, dartUrl: rdStr(x.dartUrl), dartName: rdStr(x.dartName), news: rdNewsN(x.news), fs: rdFsN(x.fs),
    };
    o.q = rdQ(o.name, o.dartName, o.sector, o.broker, lead, co, o.ceo, o.addr, o.market, o.target, o.line, '주관사 선정', holders.map((h) => h.name),
      o.fs ? ['팩트시트', o.fs.biz, o.fs.product, o.fs.fi] : []);
    return o;
  }));
  const byYs = new Map(mandates.filter((m) => m.yesimId && m.selected).map((m) => [m.yesimId, m.selected]));
  items.forEach((x) => { x.mnDay = byYs.get(x.id) || ''; });
  // 청구 전 신호 중 주관사 선정 기사는 같은 회사가 주관사 선정 목록에 있으면 뺀다
  const mnCo = new Set(mandates.flatMap((m) => [rdCo(m.name), m.id.slice(8), ...(m.dartName ? [rdCo(m.dartName)] : [])]));
  const signals = rdArr(raw.signals).filter((x) => rdStr(x.name) || rdStr(x.title)).map((x) => {
    const o = { id: rdStr(x.id), name: rdStr(x.name), dt: rdDay(x.dt), kind: rdStr(x.kind), title: rdStr(x.title), src: rdStr(x.src), url: rdHttp(rdStr(x.url)) ? rdStr(x.url) : '' };
    o.q = rdQ(o.name, o.kind, o.title, o.src);
    return o;
  }).filter((x) => !(x.kind.replace(/\s+/g, '') === '주관사선정' && x.name && mnCo.has(rdCo(x.name))))
    .sort((a, b) => b.dt.localeCompare(a.dt));
  return { generated: raw.generated, sources: raw.sources, items: rdUniq(items), signals, mandates, hasMn: Array.isArray(raw.mandates) };
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
// 예심청구 화면의 주관사 선정 행(id = mandate:…)은 mandates에서 찾는다. key는 rdKey 그대로 yesim:mandate:… 라 예심 행 key와 겹치지 않는다
const rdFind = (tab, id) => (tab === 'yesim' && rdIsMn(id) ? rdS.yesim.data?.mandates : rdS[tab].data?.items)?.find((x) => x.id === id);
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

// 팩트시트 요청(주관사 선정 행): 그 행 항목에 fs = 요청일, 다시 누르면 지운다(undefined는 저장할 때 JSON에서 빠진다). 수집기가 요청된 회사의 팩트시트를 만든다.
// 요청 뒤 팩트시트가 만들어졌으면(made ≥ 요청일) '다시 요청'이 되고, 누르면 요청일을 오늘로 바꾼다
function rdFsState(x) {
  const v = x ? rdMark(rdKey('yesim', x.id))?.fs : null, d = rdDay(v), made = x?.fs?.made || '';
  return { v, d, again: !!x?.fs && (!v || (!!made && !!d && made >= d)) };
}
function rdSetFs(id) {
  const key = rdKey('yesim', id), st = rdFsState(rdFind('yesim', id));
  if (!rdTouch('yesim', id, { fs: st.v && !st.again ? undefined : today() })) return;
  const r = rdS.tab === 'yesim' && rdS.host && rdRowEl(rdS.host, id), b = r && r.querySelector('[data-rd-fs]'), by = r && r.querySelector('.ipo-by');
  if (b) { const f = document.activeElement === b; rdSwap(b, rdFsBtn(rdFind('yesim', id))); if (f) r.querySelector('[data-rd-fs]')?.focus({ preventScroll: true }); }
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

/* 펼친 행 머리: 요약 한 줄 + 컨택 상태 + 메모 + 작성자(+ extra = 주관사 선정 행의 팩트시트 요청), 그리고 파이프라인(좁으면 요약 줄 오른쪽) */
function rdDhead(tab, x, sum, extra = '') {
  const key = rdKey(tab, x.id), m = rdMark(key), st = rdSt(key);
  const off = x.guess ? ' disabled' : ''; // 분류 전 임시 카드는 컨택 상태·메모를 막는다
  return `<div class="ipo-dhead">
      ${sum ? `<p class="ipo-sum1">${esc(sum)}</p>` : '<p></p>'}
      <div class="ipo-acts"${x.guess ? ' title="분류가 끝난 뒤 남길 수 있습니다"' : ''}><div class="seg ipo-seg">${RD_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" aria-pressed="${s === st}" data-rd-st="${s}"${off}>${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-rd-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모"${off}>
        <span class="ipo-by">${esc(rdByText(m))}</span>${extra}</div>${rdPipe(tab, x)}
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

// 가림 표시(radar_marks 의 hide)와 대표주관사(주관사순 묶음 기준)
const rdHid = (x) => rdMark(rdKey('yesim', x.id))?.hide === true;
const rdLead = (x) => (x.mn ? x.lead[0] : rdSplit(x.broker)[0]) || '';
// 목록을 묶음 머리({grp, n}) + 행으로 펼친다. order: 묶음 이름 정렬
function rdGroups(list, keyOf, order) {
  const m = new Map();
  list.forEach((x) => { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return [...m.keys()].sort((a, b) => order(a, b, m)).flatMap((k) => [{ grp: k, n: m.get(k).length }, ...m.get(k)]);
}

/* 전체·가린 회사: 주관사 선정(청구 전)도 함께, 진행 순서 묶음으로. 주관사순은 어느 필터에서든 대표주관사 묶음(맡은 곳이 많은 순).
   주관사 선정 행의 날짜는 선정일이라 청구일순·결과일순에서는 선정일로 비교한다 */
function rdYsList() {
  const s = rdS.yesim, d = s.data; if (!d) return [];
  const q = s.q.trim().toLowerCase(), hid = s.f === 'hidden';
  const keep = (x) => (!q || x.q.includes(q)) && rdHid(x) === hid && rdFinOk(x, s);
  const mns = d.mandates.filter((x) => x.pre && keep(x)), its = d.items.filter(keep);
  const pick = { review: (x) => x.status === '심사중', ok: (x) => x.status === '승인', drop: (x) => x.status === '철회' || x.status === '미승인', new: (x) => x.isNew }[s.f];
  const mixed = s.f === 'all' || hid;
  const list = s.f === 'mandate' ? mns : mixed ? [...mns, ...its] : its.filter(pick || (() => true));
  const day = (x) => (x.mn ? x.selected : x.filed);
  const byDay = (a, b) => day(b).localeCompare(day(a)) || a.name.localeCompare(b.name, 'ko');
  list.sort({
    decided: (a, b) => (b.decided || day(b)).localeCompare(a.decided || day(a)) || byDay(a, b),
    rev: (a, b) => (b.rev ?? -1e15) - (a.rev ?? -1e15) || byDay(a, b),
  }[s.sort] || byDay);
  if (s.sort === 'broker') return rdGroups(list, (x) => rdLead(x) || '주관사 미정', (a, b, m) => (a === '주관사 미정') - (b === '주관사 미정') || m.get(b).length - m.get(a).length || a.localeCompare(b, 'ko'));
  if (!mixed) return list;
  const rank = (k) => { const i = RD_YS_ORDER.indexOf(k); return i < 0 ? RD_YS_ORDER.length : i; };
  return rdGroups(list, (x) => (x.mn ? '주관사선정' : x.status || '기타'), (a, b) => rank(a) - rank(b) || a.localeCompare(b, 'ko'));
}
const rdGrpRow = (x) => `<div class="rd-grp"><b>${esc(x.grp === '주관사선정' ? '주관사 선정' : rdYsLabel(x.grp))}</b><span>${x.n}곳</span></div>`;
const rdHideBtn = (x) => { const h = rdHid(x); return `<button type="button" class="iconbtn rd-hide${h ? ' on' : ''}" data-rd-hide aria-label="${h ? '다시 보이기' : '가리기'}" title="${h ? '다시 보이기' : '가리기'}">${h ? RD_EYE : RD_EYE_OFF}</button>`; };

function rdSetHide(id) {
  const x = rdFind('yesim', id); if (!x) return;
  const on = !rdHid(x);
  if (!rdTouch('yesim', id, { hide: on })) return;
  rdS.yesim.open.delete(id);
  rdDraw();
  rdSaveMarks();
  toast(on ? `${x.name}: 가렸습니다. '가린 회사'에서 다시 볼 수 있습니다` : `${x.name}: 다시 보이게 했습니다`);
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
      <div class="ipo-c-st">${rdChip(st)}${rdHideBtn(x)}${rdChev()}</div>
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
  const flow = `${rdKv('상태', esc(p.label))}${rdKv('주관사 선정', x.mnDay ? rdDateDd(x.mnDay, rdMnGap(x.mnDay, x.filed)) : '')}${rdKv('청구일', esc(x.filed))}${rdKv('결과일', esc(x.decided))}${rdKv('상장일', esc(x.listed))}${rdKv('종목코드', esc(x.code))}
      ${rdKv('상태 변경', esc(x.changedAt))}${rdKv('상장 유형', esc(x.type))}${rdKv('시장', esc(x.market))}${rdKv('기술특례', esc(x.techSpecial))}${toIpo}`;
  return `<div class="ipo-detail">${rdDhead('yesim', x, [x.sector, x.product].filter(Boolean).join(' · '))}
    <div class="ipo-pane"><div class="ipo-stack">
      <div class="ipo-two-col">
        <div class="ipo-stack">${rdBox('컨택 포인트', contact.trim() ? contact : RD_NONE)}${rdBox('진행', flow.trim() ? flow : RD_NONE)}</div>
        <div class="ipo-stack">${x.fin ? rdPnl(x.fin, x.years) : ''}${rdHoldersBox(x.holders)}</div>
      </div>
      ${rdNewsBox(x.news)}
    </div></div>
  </div>`;
}

function rdHoldersBox(hs) {
  const fi = hs.filter((h) => h.fi), fiPct = fi.filter((h) => h.pct != null);
  const fiSub = fi.length ? [`FI ${fi.length}곳`, fiPct.length ? rdPct(Math.round(fiPct.reduce((a, h) => a + h.pct, 0) * 100) / 100) : ''].filter(Boolean).join(' · ') : '';
  const holders = hs.length ? `<table class="ipo-tbl rd-tbl-h"><thead><tr><th>주주</th><th>지분율</th><th>구분</th></tr></thead><tbody>${hs.map((h) => `<tr><td>${rdNm(h.name)}</td><td>${h.pct != null ? rdPct(h.pct) : '–'}</td><td>${h.top ? '최대주주' : h.fi ? 'FI' : ''}</td></tr>`).join('')}</tbody></table>` : RD_NONE;
  return rdBox('주주·FI', holders, fiSub);
}

/* ---------- 주관사 선정(예심청구 화면 '주관사 선정' 필터) ---------- */
// a부터 b까지 꽉 찬 개월 수(YYYY-MM-DD)
const rdMonths = (a, b) => { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return (y2 - y1) * 12 + m2 - m1 - (d2 < d1 ? 1 : 0); };
// 예심 행 진행 상자: 주관사 선정일부터 청구일까지(한 달이 안 되면 일수)
function rdMnGap(sel, filed) {
  const n = filed ? diffDays(filed, sel) : -1;
  if (n < 0) return '';
  const m = rdMonths(sel, filed);
  return m >= 1 ? `청구까지 ${m}개월` : `청구까지 ${n}일`;
}
// 진행 칸: 선정일부터 n개월째(선정한 달 = 1개월째)
function rdMnProg(x) {
  const n = x.selected && x.selected <= today() ? rdMonths(x.selected, today()) + 1 : 0;
  return { label: '주관사 선정', sub: n > 0 ? `${n}개월째` : '' };
}

const RD_MN_HEAD = RD_YS_HEAD.replace('청구일', '선정일');

function rdMnRow(x) {
  const open = rdS.yesim.open.has(x.id), st = rdSt(rdKey('yesim', x.id)), p = rdMnProg(x);
  const f = x.fy ? x.fin.years[x.fy] : [];
  const mob = [esc(p.label), esc(p.sub), x.lead.length ? rdNm(x.lead[0]) : ''].filter(Boolean).join(' · ');
  return `<div class="ipo-row${open ? ' open' : ''}" data-id="${esc(x.id)}">
    <div class="ipo-line ipo-cols">
      <div>${rdMd(x.selected) || RD_NA}<div class="ipo-sub">${esc(x.market)}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${rdNm(x.name)}</button>${x.fs ? '<span class="rd-fs-tag">팩트시트</span>' : ''}<div class="ipo-sub">${esc(x.sector)}</div>${x.rev != null ? `<div class="ipo-sub rd-alt">매출 ${rdEok(x.rev)}</div>` : ''}${mob ? `<div class="rd-mob">${mob}</div>` : ''}</div>
      <div class="rd-mh">${esc(p.label)}<div class="ipo-sub">${esc(p.sub)}</div>${x.lead.length ? `<div class="ipo-sub rd-alt">${rdNm(x.lead[0])}</div>` : ''}</div>
      <div class="rd-mh rd-c2">${x.lead.length ? x.lead.map(rdNm).join(', ') : RD_NA}<div class="ipo-sub">${x.co.map(rdNm).join(', ')}</div></div>
      <div class="rd-mh rd-c2">${x.rev != null ? rdEok(x.rev) : '<span class="muted">확인 불가</span>'}<div class="ipo-sub rd-sub2">${x.fy ? `${esc(x.fy)} 영업이익 ${rdEok(f[1])}` : ''}</div></div>
      <div class="rd-mh">${x.phone ? esc(x.phone) : RD_NA}<div class="ipo-sub">${x.ceo ? `대표 ${rdNm(x.ceo)}` : ''}</div></div>
      <div class="ipo-c-st">${rdChip(st)}${rdHideBtn(x)}${rdChev()}</div>
    </div>${open ? rdMnDetail(x) : ''}</div>`;
}

function rdFsBtn(x) {
  const { v, d, again } = rdFsState(x), on = !!v && !again;
  const tip = on ? '다음 수집(매일 09:10) 때 만들어집니다. 다시 누르면 요청을 취소합니다' : '누르면 다음 수집(매일 09:10) 때 팩트시트를 만듭니다';
  return `<button type="button" class="btn sm rd-fs${on ? ' on' : ''}" data-rd-fs aria-pressed="${on}" title="${tip}">${on ? `${ico('done', 'sm')}팩트시트 요청됨${d ? ` ${md(d)}` : ''}` : again ? '팩트시트 다시 요청' : '팩트시트 요청'}</button>`;
}

// 팩트시트 값 끝의 출처('[한국경제 2026.03]')는 흐리게
const rdFsT = (s) => esc(s).replace(/\[[^[\]]{1,40}\]/g, '<span class="muted">$&</span>');
const rdFsKv = (k, v) => rdKv(k, v ? rdFsT(v) : '');
const rdFsUl = (a) => `<ul class="ipo-ul">${a.map((s) => `<li>${rdFsT(s)}</li>`).join('')}</ul>`;

/* 펼친 칸 맨 위 팩트시트 묶음: 사업·제품 / 투자 현황 / 라운드 / 컨택 경로 / 포인트·리스크 / 출처 */
function rdFsGroup(f) {
  const total = f.total != null ? (f.total === 0 ? '없음' : rdEok(f.total)) : '';
  const inv = `${rdFsKv('투자 단계', f.stage)}${rdKv('누적 투자', [esc(total), rdFsT(f.totalNote)].filter(Boolean).join(' · '))}${rdFsKv('최근 밸류', f.valuation)}
      ${rdFsKv('Pre-IPO', f.preIpo)}${rdFsKv('주요 FI', f.fi)}${rdFsKv('상장 계획', f.plan)}`;
  const biz = `${rdFsKv('사업', f.biz)}${rdFsKv('주요 제품', f.product)}`;
  const rounds = f.rounds.length ? rdBox('투자 라운드', `<table class="ipo-tbl rd-tbl-r"><thead><tr><th>시기</th><th>라운드</th><th>금액</th><th>투자자</th></tr></thead><tbody>${f.rounds.map((r) => `<tr>
    <td>${rdFsT(r.when) || '–'}</td><td>${rdFsT(r.round) || '–'}</td><td>${rdFsT(r.amount) || '–'}</td><td>${rdFsT(r.investors) || '–'}</td></tr>`).join('')}</tbody></table>`, `${f.rounds.length}건`) : '';
  const contact = f.contact.length ? `<ul class="ipo-ul">${f.contact.map((c) => `<li>${c.who ? `<span class="rd-strong">${rdFsT(c.who)}</span>${c.how ? ' · ' : ''}` : ''}${rdFsT(c.how)}</li>`).join('')}</ul>` : RD_NONE;
  const pr = [['포인트', f.points], ['리스크', f.risks]].filter(([, a]) => a.length).map(([k, a]) => `<div class="rd-fs-k">${k}</div>${rdFsUl(a)}`).join('');
  return `<div class="rd-fsh">팩트시트${f.made ? `<span class="muted">작성 ${esc(f.made)}</span>` : ''}</div>
      <div class="ipo-two-col">${rdBox('사업·제품', biz.trim() ? biz : RD_NONE)}${rdBox('투자 현황', inv.trim() ? inv : RD_NONE)}</div>
      ${rounds}
      <div class="ipo-two-col">${rdBox('컨택 경로', contact)}${rdBox('포인트·리스크', pr || RD_NONE)}</div>
      ${f.sources.length ? rdBox('출처', rdFsUl(f.sources)) : ''}
      <div class="rd-fsh">회사 정보</div>`;
}

function rdMnDetail(x) {
  const p = rdMnProg(x);
  const links = rdLinkRow([{ url: rdUrl(x.home), label: '홈페이지' }, { url: rdHttp(x.dartUrl) ? x.dartUrl : '', label: 'DART 원문' }]);
  // 기사 속 이름과 DART 법인명이 다르면 법인명을 맨 위에
  const contact = `${x.dartName && x.dartName !== x.name ? rdKv('DART 법인명', rdNm(x.dartName)) : ''}${x.ceo ? `<div class="ipo-lead"><div class="ipo-lead-k">대표이사</div><div class="ipo-lead-v">${rdNm(x.ceo)}</div></div>` : ''}
      ${rdKv('대표전화', rdTel(x.phone))}${rdKv('주소', esc(x.addr))}${rdKv('설립', esc(rdYmd(x.founded)))}${links}`;
  const flow = `${rdKv('선정일', x.selected ? rdDateDd(x.selected, p.sub) : '')}${rdKv('대표주관사', x.lead.map(rdNm).join(', '))}${rdKv('공동주관사', x.co.map(rdNm).join(', '))}
      ${rdKv('목표 시장', esc(x.market))}${rdKv('목표 시기', esc(x.target))}${rdKv('기술특례', esc(x.tech))}${rdKv('내용', esc(x.line))}`;
  const pnl = (x.fin && rdPnl(x.fin, x.years)) || rdBox('주요 손익', `<p class="ipo-p muted">${esc(x.finNote || '확인 불가')}</p>`);
  return `<div class="ipo-detail">${rdDhead('yesim', x, x.sector, rdFsBtn(x))}
    <div class="ipo-pane"><div class="ipo-stack">${x.fs ? rdFsGroup(x.fs) : ''}
      <div class="ipo-two-col">
        <div class="ipo-stack">${rdBox('컨택 포인트', contact.trim() ? contact : RD_NONE)}${rdBox('진행', flow.trim() ? flow : RD_NONE)}</div>
        <div class="ipo-stack">${pnl}${x.holders.length ? rdHoldersBox(x.holders) : ''}</div>
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
  // 우선순: 만기 지난 조합의 비상장 회사 → 그 밖의 비상장(만기·철회, 종목코드 없음) → 나머지
  const grp = (x) => (x.kind === '뉴스' || x.code ? 2 : x.kind === '만기' && x.dd != null && x.dd < 0 ? 0 : 1);
  const prio = (a, b) => grp(a) - grp(b) || near(a, b);
  const by = {
    prio,
    near,
    pct: (a, b) => (b.pct ?? -1) - (a.pct ?? -1) || near(a, b),
    name: (a, b) => a.name.localeCompare(b.name, 'ko') || near(a, b),
  }[s.sort] || prio;
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
  // 아래로: 인수자가 정해진 단계, 또는 일정의 입찰 날짜(인수의향서 마감·예비입찰·본입찰)가 모두 지난 딜
  const td = today(), shut = (x) => {
    const ds = [...x.schedule.matchAll(/(\d{4}-\d{2}-\d{2}) (?:인수의향서 마감|예비입찰|본입찰)/g)].map((m) => m[1]);
    return RD_BIDS_DONE.includes(x.stage) || (ds.length > 0 && ds.every((d) => d < td));
  };
  return d.items.filter((x) => (!q || x.q.includes(q)) && (!s.fit || x.fit === s.fit) && (!s.stage || x.stage === s.stage))
    .sort((a, b) => shut(a) - shut(b) || RD_FITS.indexOf(a.fit) - RD_FITS.indexOf(b.fit)
      || b.last.localeCompare(a.last) || a.name.localeCompare(b.name, 'ko'));
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
const RD_ROW = { yesim: (x) => (x.grp != null ? rdGrpRow(x) : x.mn ? rdMnRow(x) : rdYsRow(x)), sell: rdSellRow, bids: (x) => rdBidsRow(x, false) };
const RD_HEAD = { yesim: RD_YS_HEAD, sell: RD_SELL_HEAD, bids: RD_BIDS_HEAD };
const rdRowEl = (root, id) => [...root.querySelectorAll('.ipo-row[data-id]')].find((r) => r.dataset.id === id);

function rdSummary(tab) {
  const d = rdS[tab].data; if (!d) return '';
  const g = d.generated ? new Date(d.generated) : null, ok = g && !isNaN(g), it = d.items;
  const gl = ok ? `${ymd(g) === today() ? '오늘' : `${g.getMonth() + 1}/${g.getDate()}`} ${pad(g.getHours())}:${pad(g.getMinutes())} 수집` : '';
  const n = (f) => it.filter(f).length;
  const mn = tab === 'yesim' ? d.mandates.filter((x) => x.pre) : []; // 주관사 선정(청구 전)은 items 밖이라 따로 센다
  const parts = {
    yesim: () => [...(d.hasMn ? [['주관사 선정', mn.length]] : []), ['심사 중', n((x) => x.status === '심사중')], ['승인', n((x) => x.status === '승인')], ['새 소식', n((x) => x.isNew)]],
    sell: () => RD_KINDS.map((k) => [k, n((x) => x.kind === k)]),
    bids: () => [['적합도 상', n((x) => x.fit === '상')], ['자문사', d.advisors.length]],
  }[tab]();
  const done = [...it, ...mn].filter((x) => rdSt(rdKey(tab, x.id)) !== '미접촉').length;
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
  // 예심청구 전체·가린 회사는 주관사 선정(선정일)과 예심(청구일)이 섞이므로 첫 칸 머리를 '날짜'로
  const head = tab !== 'yesim' ? RD_HEAD[tab] : s.f === 'mandate' ? RD_MN_HEAD : s.f === 'all' || s.f === 'hidden' ? RD_YS_HEAD.replace('청구일', '날짜') : RD_HEAD[tab];
  return head + list.map(RD_ROW[tab]).join('');
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
  if (tab === 'yesim') {
    // 보기 링크로 온 주관사 선정 회사가 그사이 청구했으면 그 예심 행을 펼친다. 자료에 mandates가 없으면 주관사 선정 필터를 숨긴다
    const m = s.focus != null && rdIsMn(s.focus) ? rdFind('yesim', s.focus) : null;
    if (m && !m.pre && m.yesimId) { s.open.add(m.yesimId); s.focus = m.yesimId; s.f = 'all'; }
    if (s.data && !s.data.hasMn && s.f === 'mandate') s.f = 'all';
    const fx = s.focus != null && rdFind('yesim', s.focus); // 보기 링크로 온 회사를 가려 두었으면 '가린 회사'에서 펼친다
    if (fx && rdHid(fx) && s.f !== 'hidden') s.f = 'hidden';
    host.querySelectorAll('[data-rd-f]').forEach((bt) => {
      const on = bt.dataset.rdF === s.f;
      bt.classList.toggle('on', on); bt.setAttribute('aria-pressed', on);
      if (bt.dataset.rdF === 'mandate') bt.hidden = !!s.data && !s.data.hasMn;
    });
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
  const s = rdS[tab] || {};
  const search = (ph) => `<div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="rd-q" type="search" placeholder="${ph}" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>`;
  const seg = (attr, opts, cur) => `<div class="seg">${opts.map(([k, l]) => `<button type="button" data-${attr}="${esc(k)}" class="${cur === k ? 'on' : ''}" aria-pressed="${cur === k}">${esc(l)}</button>`).join('')}</div>`;
  const sel = (id, label, opts, cur) => `<select class="select" id="${id}" aria-label="${label}">${opts.map(([k, l]) => `<option value="${esc(k)}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  if (tab === 'yesim') return search('회사·업종·주관사·주주 검색') + seg('rd-f', RD_YS_F, s.f) + sel('rd-sort', '정렬', RD_YS_SORT, s.sort);
  if (tab === 'yesim-fin') return `<div class="rd-fing"><span class="rd-finl">최근 매출</span>${seg('rd-rev', RD_YS_REV, rdS.yesim.rev)}</div>`
    + `<div class="rd-fing"><span class="rd-finl">영업이익률</span>${seg('rd-opm', RD_YS_OPM, rdS.yesim.opm)}</div>`;
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
    const rb = t.closest('[data-rd-rev]') || t.closest('[data-rd-opm]');
    if (rb) { const k = 'rdRev' in rb.dataset ? 'rev' : 'opm'; s[k] = rb.dataset[k === 'rev' ? 'rdRev' : 'rdOpm']; segOn(`[data-rd-${k}]`, rb); rdDraw(); return; }
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
    const hb = t.closest('[data-rd-hide]');
    if (hb) { rdSetHide(hb.closest('.ipo-row').dataset.id); return; }
    const fsb = t.closest('[data-rd-fs]');
    if (fsb) { rdSetFs(fsb.closest('.ipo-row').dataset.id); return; }
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
      ${infoBtn(`deals/${tab}`)}
      ${typeof ipoDownload === 'function' ? `<button class="btn ghost" type="button" id="rd-xlsx">${ico('file', 'sm')}엑셀 다운로드</button>` : ''}
      <button class="btn ghost" type="button" id="rd-ref">${ico('refresh', 'sm')}새로고침</button></div>
    <section class="card ipo-card">
      <div class="ipo-filter">${rdFilterHtml(tab)}</div>
      ${tab === 'yesim' ? `<div class="ipo-filter rd-finf">${rdFilterHtml('yesim-fin')}</div>` : ''}
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
  if (m[1] === 'bids') { s.view = 'deal'; s.fit = ''; s.stage = ''; } else s.f = m[1] === 'yesim' && rdIsMn(m[2]) ? 'mandate' : 'all';
  s.open.add(m[2]); s.focus = m[2];
  return `#deals/${m[1]}`;
}
