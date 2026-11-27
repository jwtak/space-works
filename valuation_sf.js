/* 투자업무 › 가치평가 › 업종 실적(#valuation/sf, 2026-11-26 사용자 「기업들 매출, 영업이익, 에비따, 당기순이익, 마진율까지 해서 각 업종의 평균」).
   FnGuide 분류(대분류 sector, 중분류 industryGroup, 소분류 industry, PER 시장 탭과 같은 단계)마다 회사 수, 영업적자 수, 매출, 영업이익, EBITDA, 순이익(중앙값, 평균, 합계. 처음엔 중앙값),
   영업이익률, EBITDA 마진, 순이익률(합계 기준, 평균, 중앙값). 맨 위는 전체 상장사, 맨 아래는 업종 미지정(FnGuide 업종 없는 '미분류', 11/26 사용자 「추천대로」). 머리글을 누르면 정렬(내림 → 오름 → 기본 순서), 업종 줄을 누르면 그 업종 회사 목록.
   금융(financial: true)은 EBITDA와 마진 칸 '해당 없음'. 데이터는 data/valuation_sector_fin.json(가치평가 폴더, 형식은 작업 지시의 계약: groups, all, cols, rows).
   11/26 저녁 사용자 「분류 상세하게(2차전지 등)」「적자기업 제외 버튼」「차트로도」: 분류에 테마(네이버 증권 테마, level theme, 처음 열면 테마, 회사 수 많은 순 30개 뒤 더 보기),
   적자 제외(groups_ex_loss, all_ex_loss, 회사 줄도 영업적자 숨김), 표와 차트 전환(업종별 마진 가로 막대, 막대를 누르면 그 업종 회사의 매출(로그)과 이익률 점 분포).
   valuation.js 전역(vaS, vaSave, vaSeg, vaNum, vaSec, vaCode, vaRow, vaCw, VA_SEC_ORD)과 market.css .mk-tbl 을 쓴다. */
const SF_FILE = 'data/valuation_sector_fin.json';
const SF_LV = [['sector', '대분류'], ['industryGroup', '중분류'], ['industry', '소분류']];
const SF_COLS = [ // [키, 머리글, 종류(amt 금액 | mg 마진), 금융이면 해당 없음, 머리글 툴팁]
  ['rev', '매출', 'amt', false, ''], ['op', '영업이익', 'amt', false, ''], ['ebitda', 'EBITDA', 'amt', true, '영업이익 + 감가상각비'], ['ni', '순이익', 'amt', false, ''],
  ['opm', '영업이익률', 'mg', true, ''], ['ebitdam', 'EBITDA 마진', 'mg', true, ''], ['npm', '순이익률', 'mg', true, ''],
];
const SF_MG = { opm: 'op', ebitdam: 'ebitda', npm: 'ni' }; // 회사 줄 마진 = 분자 ÷ 매출
const SF_GMAX = 30; // 테마 처음 보이는 묶음 수(252개라)
const SF_ROWS = 20; // 펼친 업종에 처음 보이는 회사 수
const SF_STEP = 200; // 「더 보기」 한 번에 더 그리는 회사 수(전체 상장사 2천여 곳을 한 번에 그리면 정렬마다 0.5초 넘게 걸려서, 11/26 점검)
const SF_FS = { CFS: '연결', OFS: '별도' };
const sfBasis = (b) => String(b).replace(/^TTM (\d{4})-(\d{2})$/, (m, y, mm) => `TTM ${y}-${Math.ceil(+mm / 3)}Q`); // 회사 줄 'TTM 2026-09'를 머리 'TTM 2026-3Q' 꼴로
vaS.sf = { lv: 'theme', amt: 'median', mg: 'median', k: null, dir: -1, open: {}, more: {}, xl: false, view: 'tbl', cm: 'opm', cg: null, gmore: 0, ...(vaS.sf || {}) };
if (vaS.sf.v !== 2) Object.assign(vaS.sf, { amt: 'median', v: 2 }); // 11/26 오후 금액 기본을 중앙값으로. 오전에 저장된 '평균'을 한 번 덮음
if (vaS.sf.v2 !== 3) Object.assign(vaS.sf, { lv: 'theme', v2: 3 }); // 11/26 저녁 기본을 테마로(그 전엔 고른 적 없어도 대분류가 저장돼 있었음). 한 번만 덮음
const SF_NONE = '미분류', sfNone = (n) => !n || n === SF_NONE || n === '업종 미지정', sfName = (n) => (sfNone(n) ? '업종 미지정' : n), sfLvOf = (y, lv) => y[lv] || SF_NONE; // 업종 없는 회사(데이터 이름 '미분류' 또는 '업종 미지정')
const sfHas = (y, lv, name) => (lv === 'theme' ? !!y.themes?.includes(name) : sfNone(name) ? !y[lv] || sfNone(y[lv]) : y[lv] === name); // 회사가 그 묶음에 드는지
const sfHasTh = (d) => !!d?.cols?.includes('themes') && (d.groups || []).some((g) => g.level === 'theme');
const sfLvs = (d) => [...SF_LV, ...(sfHasTh(d) ? [['theme', '테마']] : [])];
const sfXl = () => !!vaS.sf.xl && !!vaS.sfd?.groups_ex_loss; // 적자 제외(데이터에 있을 때만)
const sfOk = (y) => !sfXl() || (y.op != null && y.op >= 0); // 적자 제외면 영업이익 0 이상만

function sfLoad() {
  if (vaS.sfAt && Date.now() - vaS.sfAt < VA_TTL) return Promise.resolve();
  vaS.sfLoading ||= STORE.readText(SF_FILE)
    .then((r) => {
      const d = r.text ? JSON.parse(r.text) : null;
      if (d) {
        const ix = Object.fromEntries((d.cols || []).map((k, i) => [k, i]));
        d.list = (d.rows || []).map((x) => Object.fromEntries(Object.entries(ix).map(([k, i]) => [k, x[i]]))).filter((y) => ['rev', 'op', 'ebitda', 'ni'].some((k) => y[k] != null)); // 실적을 못 구한 회사는 뺌(업종 n 과 같게)
        d.fin = {}; // 금융 업종 이름(단계별). 회사 줄의 해당 없음 판정에 씀
        for (const g of d.groups || []) if (g.financial) (d.fin[g.level] ||= new Set()).add(g.name);
      }
      vaS.sfd = d; vaS.sfErr = ''; vaS.sfAt = Date.now();
    })
    .catch((e) => { vaS.sfd = null; vaS.sfErr = e instanceof SyntaxError ? '업종 실적 파일을 읽지 못했습니다.' : e.message; })
    .finally(() => { vaS.sfLoading = null; });
  return vaS.sfLoading;
}

const sfAmt = (v) => (v == null || !Number.isFinite(+v) ? '-' : vaNum(Math.round(v)));
const sfPct = (v) => (v == null || !Number.isFinite(+v) ? '-' : `${vaNum(Math.round(v * 10) / 10 || 0, 1)}%`); // -0.0% 대신 0.0%
const sfFinRow = (y) => !!vaS.sfd?.fin && SF_LV.some(([lv]) => vaS.sfd.fin[lv]?.has(y[lv]));
function sfGv(g, k) { // 업종 줄 값. 금융은 해당 없음(null 로 정렬 맨 뒤)
  const s = vaS.sf, c = SF_COLS.find((x) => x[0] === k);
  if (k === 'n') return g.n;
  if (g.financial && c[3]) return null;
  return g[k]?.[c[2] === 'amt' ? s.amt : s.mg] ?? null;
}
function sfYv(y, k) { // 회사 줄 값. 마진은 매출이 0보다 클 때만
  if (k === 'n') return y.rev;
  const c = SF_COLS.find((x) => x[0] === k);
  if (c[3] && sfFinRow(y)) return null;
  if (c[2] === 'amt') return y[k] ?? null;
  const top = y[SF_MG[k]];
  return y.rev > 0 && top != null ? (top / y.rev) * 100 : null;
}
function sfSort(xs, val, base) { // 고른 열로 정렬(값 없는 줄은 맨 뒤). 고른 열이 없으면 base
  const s = vaS.sf;
  if (!s.k) return base ? [...xs].sort(base) : xs;
  return [...xs].sort((a, b) => { const p = val(a, s.k), q = val(b, s.k); return p == null ? (q == null ? 0 : 1) : q == null ? -1 : (p - q) * s.dir; });
}
function sfCell(fin, c, v, g) { // g: 업종 줄이면 계산에 들어간 회사 수가 업종 회사 수보다 적을 때 툴팁(EBITDA n_ebitda, 마진 n·n_mean)
  if (fin && c[3]) return '<td class="sf-na">해당 없음</td>';
  const cnt = !g || v == null ? null : c[0] === 'ebitda' ? g.n_ebitda : c[2] === 'mg' ? g[c[0]]?.[vaS.sf.mg === 'agg' ? 'n' : 'n_mean'] : null;
  const m = g && c[2] === 'mg' ? g[c[0]] : null; // 마진 칸 툴팁: 세 가지 값을 같이(합계 기준은 큰 회사 몇 곳에 끌려갈 수 있어서)
  const tip = [m ? `중앙값 ${sfPct(m.median)}, 평균 ${sfPct(m.mean)}, 합계 기준 ${sfPct(m.agg)}` : '', cnt != null && cnt < g.n ? `${vaNum(cnt)}곳 기준` : ''].filter(Boolean).join(', ');
  return `<td${tip && v != null ? ` title="${tip}"` : ''}>${c[2] === 'amt' ? sfAmt(v) : sfPct(v)}</td>`;
}

const sfGs = (d, lv) => ((sfXl() ? d.groups_ex_loss : d.groups) || []).filter((g) => g.level === lv); // 고른 단계 묶음(적자 제외면 그 통계)
const sfAllG = (d) => { const a = sfXl() ? d.all_ex_loss : d.all; return a ? { ...a, level: 'all', name: '전체 상장사' } : null; };
const SF_ALL_ID = 'all|전체 상장사', sfGid = (g) => `${g.level}|${g.name}`;
const sfGMore = (rest) => (rest > 0 ? `<div class="more-wrap"><button type="button" class="btn sm" data-sf-gmore="1">나머지 ${vaNum(rest)}개 보기</button></div>` : ''); // 더 보기 모양은 app.js moreList와 같게

function sfTab(only) { // only: 표 안(머리와 본문)만 돌려줌. 정렬, 펼치기, 더 보기는 표만 갈아 끼움(sfRedraw)
  const d = vaS.sfd, s = vaS.sf;
  if (!d) return `<div class="card"><div class="empty">${esc(vaS.sfErr || '업종 실적 자료가 아직 없습니다.')}</div></div>`;
  const lvs = sfLvs(d), lv = lvs.some(([k]) => k === s.lv) ? s.lv : 'sector', xl = sfXl();
  const code = vaCode(), me = code ? d.list.find((y) => y.code === code) || vaRow(code) : null;
  const si = (sec) => { const k = VA_SEC_ORD.indexOf(sec); return k < 0 ? 99 : k; };
  const secOf = (g) => (lv === 'theme' ? null : lv === 'sector' ? g.name : lv === 'industryGroup' ? g.parent : d.list.find((y) => y.industry === g.name)?.sector);
  const base = (a, b) => si(secOf(a)) - si(secOf(b)) || b.n - a.n; // 기본 순서: PER 시장과 같은 대분류 순서 안에서 회사 수 순(테마는 회사 수 순)
  const lg = sfGs(d, lv), named = lg.filter((g) => !sfNone(g.name)), none = lg.filter((g) => sfNone(g.name)); // 업종 미지정은 정렬과 상관없이 맨 아래
  const srt = sfSort(named, sfGv, base), lim = lv === 'theme' && !s.gmore ? SF_GMAX : Infinity, rest = Math.max(0, srt.length - lim);
  const th = (k, label, tip, cls = '') => {
    const on = s.k === k;
    return `<th class="${cls}" aria-sort="${on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}"${tip ? ` title="${esc(tip)}"` : ''}><button type="button" class="sf-sort${on ? ' on' : ''}" data-sf-sort="${k}">${label}<span class="sf-dir" aria-hidden="true">${on ? (s.dir > 0 ? '▴' : '▾') : ''}</span></button></th>`;
  };
  const head = `<thead><tr><th class="st"><span class="sf-h0">업종</span></th>${th('n', '회사 수', xl ? '' : '아래 작은 글씨는 영업적자 회사 수')}${SF_COLS.map(([k, l, , , t]) => th(k, l, k === 'ebitda' && d.rule?.ebitda ? d.rule.ebitda : t)).join('')}</tr></thead>`;
  const grow = (g, all) => {
    const id = sfGid(g), open = !!s.open[id], mine = !!me && (all || sfHas(me, lv, g.name));
    const sub = all ? '' : lv !== 'sector' && g.parent && g.parent !== g.name ? `<small>${esc(g.parent)}</small>` : '';
    let h = `<tr class="sf-g${open ? ' open' : ''}${all ? ' sf-all' : ''}${mine && !all ? ' me' : ''}" data-sf-open="${esc(id)}"><td class="st"><button type="button" class="sf-open" aria-expanded="${open}" title="${esc(sfName(g.name))} 회사 목록 ${open ? '접기' : '펼치기'}"><span class="sf-chev" aria-hidden="true">${ico('right', 'sm')}</span><b>${esc(sfName(g.name))}</b></button>${sub}</td>`
      + `<td${g.n_all > g.n ? ` title="${xl ? '흑자' : '실적 있는'} 회사 ${vaNum(g.n)}곳, 전체 ${vaNum(g.n_all)}곳"` : ''}>${vaNum(g.n)}${xl ? '' : `<small>적자 ${vaNum(g.n_loss || 0)}</small>`}</td>${SF_COLS.map((c) => sfCell(g.financial, c, sfGv(g, c[0]), g)).join('')}</tr>`;
    if (open) h += sfCos(g, all, lv, me);
    return h;
  };
  const allG = sfAllG(d), allRow = allG ? grow(allG, true) : '';
  const gm = rest ? `<tr class="sf-more more-tr"><td colspan="${SF_COLS.length + 2}">${sfGMore(rest)}</td></tr>` : '';
  const inner = `${head}<tbody>${allRow}${srt.slice(0, lim).map((g) => grow(g, false)).join('')}${gm}${none.map((g) => grow(g, false)).join('')}</tbody>`;
  if (only) return inner;
  const view = s.view === 'chart' ? 'chart' : 'tbl';
  const body = view === 'chart' ? sfChart(d, lv, named, me) : `<div class="mk-scroll"><table class="mk-tbl sf-tbl">${inner}</table></div>`;
  const cm = SF_COLS.filter((c) => c[2] === 'mg').map(([k, l]) => [k, l]);
  const xlBox = d.groups_ex_loss ? `<label class="sf-xl"><input type="checkbox" data-sf-xl${xl ? ' checked' : ''}>적자 제외</label>` : '';
  const ctl = `<div class="va-mctl">${sfSeg('view', [['tbl', '표'], ['chart', '차트']], view)}${view === 'chart' ? `<div><span class="va-lab">지표</span>${sfSeg('cm', cm, cm.some(([k]) => k === s.cm) ? s.cm : 'opm')}</div>` : `<div><span class="va-lab">금액</span>${sfSeg('amt', [['median', '중앙값'], ['mean', '평균'], ['sum', '합계']], s.amt)}</div>`}<div><span class="va-lab">마진</span>${sfSeg('mg', [['median', '중앙값'], ['mean', '평균'], ['agg', '합계 기준']], s.mg)}</div>${xlBox}</div>`;
  const meta = [d.basis ? `${esc(d.basis)} 기준` : '', `단위 ${esc(d.unit || '억원')}`].filter(Boolean).join(', ');
  return vaSec(`업종 실적 <span class="meta">${vaNum(lg.length)}개 ${lv === 'theme' ? '테마' : '업종'}, ${meta}</span>`, sfSeg('lv', lvs, lv), `${ctl}${body}`, 'sf');
}
const sfSeg = (key, opts, cur) => `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-sf-seg="${key}" data-v="${esc(v)}" class="${cur === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;

function sfCos(g, all, lv, me) { // 펼친 업종의 회사 줄. 회사 수 칸은 시장, 기준이 다른 회사는 그 기준을 작게. 적자 제외면 영업적자 회사 숨김
  const d = vaS.sfd, s = vaS.sf, id = sfGid(g);
  const ys = sfSort(d.list.filter((y) => (all || sfHas(y, lv, g.name)) && sfOk(y)), sfYv, (a, b) => (b.rev ?? -Infinity) - (a.rev ?? -Infinity));
  const lim = s.more[id] === true ? SF_ROWS + SF_STEP : +s.more[id] || SF_ROWS; // 11/26 전엔 true(전부)로 저장됨
  const shown = ys.slice(0, lim), rest = ys.length - shown.length;
  const ML = { KOSPI: '코스피', KOSDAQ: '코스닥' };
  const row = (y) => {
    const fin = sfFinRow(y), note = [SF_FS[y.fs] || y.fs, y.basis && sfBasis(y.basis) !== d.basis ? sfBasis(y.basis) : ''].filter(Boolean).join(', ');
    return `<tr class="sf-c${me?.code === y.code ? ' me' : ''}" data-sf-in="${esc(id)}"><td class="st"><button type="button" class="sf-co" data-va-pick="${esc(y.code)}" title="${esc(`${y.name} 보기`)}"><b>${esc(y.name)}</b></button>${all || lv !== 'industry' ? `<small>${esc(y.industry || '')}</small>` : ''}</td>`
      + `<td>${esc(ML[y.market] || y.market || '')}${note ? `<small>${esc(note)}</small>` : ''}</td>${SF_COLS.map((c) => sfCell(fin, c, sfYv(y, c[0]))).join('')}</tr>`;
  };
  const step = Math.min(SF_STEP, rest), more = rest > 0 ? `<tr class="sf-more more-tr"><td colspan="${SF_COLS.length + 2}"><div class="more-wrap"><button type="button" class="btn sm" data-sf-more="${esc(id)}" data-n="${shown.length}">${rest > step ? `${vaNum(step)}건 더 보기` : `나머지 ${vaNum(rest)}건 보기`}</button>${rest > step ? `<span class="more-rest">남은 ${vaNum(rest)}건</span>` : ''}</div></td></tr>` : ''; // 더 보기 모양은 app.js moreList와 같게
  return shown.map(row).join('') + more;
}

/* 차트(11/26 저녁): 왼쪽은 고른 마진 지표의 업종별 가로 막대(큰 순, 0 기준선, 음수는 왼쪽, 회사 5곳 미만은 흐리게, 맨 위 전체 상장사, 업종 미지정은 뺌),
   오른쪽은 고른 막대 업종의 회사 점 분포(가로 매출 로그 눈금, 세로 이익률, 점선은 고른 기준 값). 좁은 화면은 점 분포가 위 */
const SF_FEW = 5;
const sfRevLab = (p) => ({ '-1': '0.1억', 0: '1억', 1: '10억', 2: '100억', 3: '1천억', 4: '1조', 5: '10조', 6: '100조', 7: '1천조' })[p] ?? `1e${p}억`;
function sfChart(d, lv, named, me) {
  const s = vaS.sf, k = SF_COLS.some((c) => c[0] === s.cm && c[2] === 'mg') ? s.cm : 'opm', lab = SF_COLS.find((c) => c[0] === k)[1];
  const val = (g) => (!g || g.financial ? null : g[k]?.[s.mg] ?? null);
  const allG = sfAllG(d), ranked = named.filter((g) => val(g) != null).sort((a, b) => val(b) - val(a));
  const ids = new Set([SF_ALL_ID, ...ranked.map(sfGid)]), meG = me ? ranked.find((g) => sfHas(me, lv, g.name)) : null;
  const cg = (s.cg && ids.has(s.cg) && s.cg) || Object.keys(s.open).find((id) => id.startsWith(`${lv}|`) && ids.has(id)) || (meG && sfGid(meG)) || SF_ALL_ID;
  const lim = lv === 'theme' && !s.gmore ? SF_GMAX : Infinity, shown = ranked.slice(0, lim);
  const keep = ranked.find((g) => sfGid(g) === cg && !shown.includes(g)); // 고른 업종이 더 보기 뒤에 있으면 맨 아래에 붙임
  const vs = [...shown, ...(keep ? [keep] : []), ...(val(allG) != null ? [allG] : [])].map(val), lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), span = hi - lo || 1;
  const P = (v) => ((v - lo) / span) * 100, z = P(0);
  const bar = (g, isAll) => {
    const id = isAll ? SF_ALL_ID : sfGid(g), v = val(g), p = P(v), on = id === cg, mine = !!me && !isAll && sfHas(me, lv, g.name);
    const cls = ['sf-br', isAll ? 'all' : '', on ? 'on' : '', mine ? 'me' : '', !isAll && g.n < SF_FEW ? 'few' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-sf-cg="${esc(id)}" aria-pressed="${on}" title="${esc(`${sfName(g.name)} ${lab} ${sfPct(v)}, ${vaNum(g.n)}곳`)}"><span class="nm">${esc(sfName(g.name))}</span>`
      + `<span class="bar"><b style="left:${z.toFixed(2)}%"></b><i class="${v < 0 ? 'neg' : ''}" style="left:${Math.min(z, p).toFixed(2)}%;width:${Math.abs(p - z).toFixed(2)}%"></i></span><em>${sfPct(v)}</em><small>${vaNum(g.n)}곳</small></button>`;
  };
  const bars = `<div class="sf-bars" role="group" aria-label="${esc(`업종별 ${lab}`)}">${val(allG) != null ? bar(allG, true) : ''}${shown.map((g) => bar(g, false)).join('')}${keep ? bar(keep, false) : ''}${sfGMore(ranked.length - shown.length)}</div>`;
  const full = vaCw(true), two = full >= 840, W = two ? Math.floor((full - 32) / 2) : full;
  const cgG = cg === SF_ALL_ID ? allG : ranked.find((g) => sfGid(g) === cg);
  return `<div class="sf-ch${two ? ' two' : ''}">${bars}<div class="sf-scbox">${sfScatter(d, lv, cgG, cg === SF_ALL_ID, k, lab, val(cgG), me, W)}</div></div>`;
}

function sfScatter(d, lv, g, isAll, k, lab, gv, me, W) { // 고른 업종 회사들: 가로 매출(로그), 세로 이익률. 눈금 밖 이익률은 가장자리에 속 빈 점
  const head = (n) => `<div class="sf-sch"><b>${esc(sfName(g?.name || ''))}</b><span class="meta">${vaNum(n)}곳</span></div>`;
  const os = !g ? [] : d.list.filter((y) => (isAll || sfHas(y, lv, g.name)) && sfOk(y) && y.rev > 0).map((y) => ({ y, v: sfYv(y, k) })).filter((o) => o.v != null);
  vaS.sfPts = null;
  if (!os.length) return `${head(0)}<div class="empty">${esc(lab)} 값이 있는 회사가 없습니다.</div>`;
  const H = W < 480 ? 280 : 340, M = { l: 48, r: 16, t: 28, b: 44 };
  const lx = os.map((o) => Math.log10(o.y.rev)), xa = Math.min(...lx), xb = Math.max(...lx), xw = Math.max(xb - xa + 0.3, 2), x0 = (xa + xb - xw) / 2, x1 = x0 + xw; // 가로는 적어도 두 자릿수 폭
  const sv = os.map((o) => o.v).sort((a, b) => a - b), q = (p) => sv[Math.min(sv.length - 1, Math.max(0, Math.round(p * (sv.length - 1))))];
  let lo = Math.max(-50, Math.min(0, q(0.05), gv ?? 0)), hi = Math.min(60, Math.max(0, q(0.95), gv ?? 0)); // 아래위 5%는 가장자리 속 빈 점(큰 적자 회사에 눈금이 끌려가지 않게)
  const st = [1, 2, 5, 10, 20, 25, 50].find((x) => (hi - lo) / x <= 6) || 50;
  lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st; if (hi === lo) hi += st;
  const X = (r) => M.l + ((Math.log10(r) - x0) / (x1 - x0)) * (W - M.l - M.r), cl = (v) => Math.min(hi, Math.max(lo, v)), Y = (v) => M.t + ((hi - cl(v)) / (hi - lo)) * (H - M.t - M.b);
  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += st) grid += `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="${Math.abs(v) < 1e-9 ? 'z' : 'gl'}"/><text x="${M.l - 6}" y="${(Y(v) + 4).toFixed(1)}" class="yl">${vaNum(v)}%</text>`;
  const xs = Array.from({ length: Math.floor(x1) - Math.ceil(x0) + 1 }, (_, i) => Math.ceil(x0) + i), xstep = W < 420 && xs.length > 5 ? 2 : 1;
  grid += xs.filter((p, i) => i % xstep === 0).map((p) => `<text x="${X(10 ** p).toFixed(1)}" y="${H - 24}" class="xl">${sfRevLab(p)}</text>`).join('');
  grid += `<text x="4" y="14" class="at">${esc(lab)}</text><text x="${((M.l + W - M.r) / 2).toFixed(1)}" y="${H - 4}" class="at mid">매출</text>`;
  const bn = { median: '중앙값', mean: '평균', agg: '합계 기준' }[vaS.sf.mg] || '';
  const ref = gv == null ? '' : `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(gv).toFixed(1)}" y2="${Y(gv).toFixed(1)}" class="md"/><text x="${W - M.r}" y="${(Y(gv) - 6).toFixed(1)}" class="ml">${bn} ${sfPct(gv)}</text>`;
  const pts = os.map((o) => ({ cx: +X(o.y.rev).toFixed(1), cy: +Y(o.v).toFixed(1), y: o.y, v: o.v, out: o.v < lo || o.v > hi }));
  const mp = me ? pts.find((p) => p.y.code === me.code) : null, rt = mp && mp.cx > W * 0.7;
  const dots = pts.filter((p) => p !== mp).map((p) => `<circle cx="${p.cx}" cy="${p.cy}" r="${os.length > 60 ? 3 : 4.5}" class="${p.out ? 'p out' : 'p'}${os.length > 60 ? '' : ' big'}"/>`).join('');
  const mine = mp ? `<circle cx="${mp.cx}" cy="${mp.cy}" r="5.5" class="me"/><text x="${rt ? mp.cx - 9 : mp.cx + 9}" y="${mp.cy + 4}" class="dl${rt ? ' end' : ''}">${esc(mp.y.name)}</text>` : '';
  vaS.sfPts = { W, lab, pts };
  return `${head(os.length)}<div class="sf-scw"><svg viewBox="0 0 ${W} ${H}" class="sf-sc" role="img" aria-label="${esc(`${sfName(g.name)} 회사 ${os.length}곳의 매출과 ${lab}`)}">${grid}${dots}${ref}${mine}<circle r="7" class="hl" cx="-20" cy="-20"/></svg><div class="sf-tip" hidden></div></div>`;
}
function sfTip(e) { // 점에 마우스(손가락)를 올리면 가장 가까운 회사 이름과 값. 점보다 넓게(16px 안) 잡음
  const box = e.target.closest?.('.sf-scw'), tip = box?.querySelector('.sf-tip'), svg = box?.querySelector('svg'), S = vaS.sfPts;
  if (!box || !S || !svg) return;
  const r = svg.getBoundingClientRect(), sc = r.width / S.W, mx = (e.clientX - r.left) / sc, my = (e.clientY - r.top) / sc;
  let best = null, bd = (16 / sc) ** 2;
  for (const p of S.pts) { const dd = (p.cx - mx) ** 2 + (p.cy - my) ** 2; if (dd < bd) { bd = dd; best = p; } }
  const hl = svg.querySelector('.hl');
  if (!best) { tip.hidden = true; hl.setAttribute('cx', -20); return; }
  hl.setAttribute('cx', best.cx); hl.setAttribute('cy', best.cy);
  tip.innerHTML = `<b>${esc(best.y.name)}</b><span>매출 ${sfAmt(best.y.rev)}억</span><span>${esc(S.lab)} ${sfPct(best.v)}</span>`;
  tip.hidden = false;
  const px = best.cx * sc, py = best.cy * sc, left = px > r.width / 2;
  tip.style.left = `${px}px`; tip.style.top = `${py}px`; tip.classList.toggle('l', left);
}

/* 표만 다시 그림(머리 단추, 회사 줄은 그대로). 표가 없으면 전체. 그린 뒤 pick(host)이 돌려준 요소에 초점(누른 단추가 새로 그려져 초점이 사라지지 않게) */
function sfRedraw(host, pick) {
  const t = host.querySelector('.sf-tbl');
  if (t) { t.innerHTML = sfTab(true); vaSave(); } else vaDraw();
  pick?.(host)?.focus({ preventScroll: true });
}
const sfQ = (host, attr, v) => [...host.querySelectorAll(`[${attr}]`)].find((el) => el.getAttribute(attr) === v) || null;
function sfBind(host) {
  host.addEventListener('click', (e) => {
    if (vaS.vt !== 'sf') return;
    const s = vaS.sf;
    const sg = e.target.closest('[data-sf-seg]');
    if (sg) { const k = sg.dataset.sfSeg, v = sg.dataset.v; if (k === 'lv' && s.lv !== v) s.gmore = 0; s[k] = v; vaDraw(); host.querySelector(`[data-sf-seg="${k}"][data-v="${CSS.escape(v)}"]`)?.focus({ preventScroll: true }); return; }
    const cb = e.target.closest('[data-sf-cg]');
    if (cb) { // 차트 막대: 그 업종 회사 분포. 좁은 화면은 위에 있는 점 분포로 올려 줌
      const id = cb.dataset.sfCg; s.cg = id; vaDraw(); sfQ(host, 'data-sf-cg', id)?.focus({ preventScroll: true });
      const ch = host.querySelector('.sf-ch'); if (ch && !ch.classList.contains('two')) host.querySelector('.sf-scbox')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
    if (e.target.closest('[data-sf-gmore]')) { s.gmore = 1; if (s.view === 'chart') vaDraw(); else sfRedraw(host); return; }
    const so = e.target.closest('[data-sf-sort]');
    if (so) { const k = so.dataset.sfSort; if (s.k !== k) { s.k = k; s.dir = -1; } else if (s.dir < 0) s.dir = 1; else s.k = null; sfRedraw(host, (h) => sfQ(h, 'data-sf-sort', k)); return; } // 내림 → 오름 → 기본 순서
    const mo = e.target.closest('[data-sf-more]');
    if (mo) { // 다음 SF_STEP곳. 초점은 남은 「더」 단추, 다 펼쳤으면 새로 보인 첫 회사
      const id = mo.dataset.sfMore, n0 = +mo.dataset.n || SF_ROWS; s.more[id] = n0 + SF_STEP;
      sfRedraw(host, (h) => sfQ(h, 'data-sf-more', id) || [...h.querySelectorAll('tr[data-sf-in]')].filter((r) => r.dataset.sfIn === id)[n0]?.querySelector('.sf-co'));
      return;
    }
    if (e.target.closest('[data-va-pick]')) return; // 회사 이름은 valuation.js vaBind 가 그 회사로 바꿈
    const op = e.target.closest('[data-sf-open]');
    if (op) { const k = op.dataset.sfOpen; if (s.open[k]) delete s.open[k]; else s.open[k] = true; sfRedraw(host, (h) => sfQ(h, 'data-sf-open', k)?.querySelector('.sf-open')); }
  });
  host.addEventListener('change', (e) => { // 적자 제외
    if (vaS.vt !== 'sf' || !e.target.matches('[data-sf-xl]')) return;
    vaS.sf.xl = e.target.checked; vaDraw(); host.querySelector('[data-sf-xl]')?.focus({ preventScroll: true });
  });
  host.addEventListener('pointermove', (e) => { if (vaS.vt === 'sf') sfTip(e); });
  host.addEventListener('pointerdown', (e) => { if (vaS.vt === 'sf' && e.pointerType !== 'mouse') sfTip(e); });
  host.addEventListener('pointerout', (e) => { const b = e.target.closest?.('.sf-scw'); if (b && !b.contains(e.relatedTarget)) { b.querySelector('.sf-tip').hidden = true; b.querySelector('.hl')?.setAttribute('cx', -20); } });
}
