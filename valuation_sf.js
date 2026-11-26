/* 투자업무 › 가치평가 › 업종 실적(#valuation/sf, 2026-11-26 사용자 「기업들 매출, 영업이익, 에비따, 당기순이익, 마진율까지 해서 각 업종의 평균」).
   FnGuide 분류(대분류 sector, 중분류 industryGroup, 소분류 industry, PER 시장 탭과 같은 단계)마다 회사 수, 영업적자 수, 매출, 영업이익, EBITDA, 순이익(중앙값, 평균, 합계. 처음엔 중앙값),
   영업이익률, EBITDA 마진, 순이익률(합계 기준, 평균, 중앙값). 맨 위는 전체 상장사, 맨 아래는 업종 미지정(FnGuide 업종 없는 '미분류', 11/26 사용자 「추천대로」). 머리글을 누르면 정렬(내림 → 오름 → 기본 순서), 업종 줄을 누르면 그 업종 회사 목록.
   금융(financial: true)은 EBITDA와 마진 칸 '해당 없음'. 데이터는 data/valuation_sector_fin.json(가치평가 폴더, 형식은 작업 지시의 계약: groups, all, cols, rows).
   valuation.js 전역(vaS, vaSave, vaSeg, vaNum, vaSec, vaCode, vaRow, VA_SEC_ORD)과 market.css .mk-tbl 을 쓴다. */
const SF_FILE = 'data/valuation_sector_fin.json';
const SF_LV = [['sector', '대분류'], ['industryGroup', '중분류'], ['industry', '소분류']];
const SF_COLS = [ // [키, 머리글, 종류(amt 금액 | mg 마진), 금융이면 해당 없음, 머리글 툴팁]
  ['rev', '매출', 'amt', false, ''], ['op', '영업이익', 'amt', false, ''], ['ebitda', 'EBITDA', 'amt', true, '영업이익 + 감가상각비'], ['ni', '순이익', 'amt', false, ''],
  ['opm', '영업이익률', 'mg', true, ''], ['ebitdam', 'EBITDA 마진', 'mg', true, ''], ['npm', '순이익률', 'mg', true, ''],
];
const SF_MG = { opm: 'op', ebitdam: 'ebitda', npm: 'ni' }; // 회사 줄 마진 = 분자 ÷ 매출
const SF_ROWS = 20; // 펼친 업종에 처음 보이는 회사 수
const SF_STEP = 200; // 「더 보기」 한 번에 더 그리는 회사 수(전체 상장사 2천여 곳을 한 번에 그리면 정렬마다 0.5초 넘게 걸려서, 11/26 점검)
const SF_FS = { CFS: '연결', OFS: '별도' };
const sfBasis = (b) => String(b).replace(/^TTM (\d{4})-(\d{2})$/, (m, y, mm) => `TTM ${y}-${Math.ceil(+mm / 3)}Q`); // 회사 줄 'TTM 2026-09'를 머리 'TTM 2026-3Q' 꼴로
vaS.sf = { lv: 'sector', amt: 'median', mg: 'median', k: null, dir: -1, open: {}, more: {}, ...(vaS.sf || {}) };
if (vaS.sf.v !== 2) Object.assign(vaS.sf, { amt: 'median', v: 2 }); // 11/26 오후 금액 기본을 중앙값으로. 오전에 저장된 '평균'을 한 번 덮음
const SF_NONE = '미분류', sfName = (n) => (n === SF_NONE ? '업종 미지정' : n), sfLvOf = (y, lv) => y[lv] || SF_NONE; // 업종 없는 회사(데이터 이름 '미분류')

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

function sfTab(only) { // only: 표 안(머리와 본문)만 돌려줌. 정렬, 펼치기, 더 보기는 표만 갈아 끼움(sfRedraw)
  const d = vaS.sfd, s = vaS.sf;
  if (!d) return `<div class="card"><div class="empty">${esc(vaS.sfErr || '업종 실적 자료가 아직 없습니다.')}</div></div>`;
  const lv = SF_LV.some(([k]) => k === s.lv) ? s.lv : 'sector';
  const code = vaCode(), me = code ? d.list.find((y) => y.code === code) || vaRow(code) : null;
  const si = (sec) => { const k = VA_SEC_ORD.indexOf(sec); return k < 0 ? 99 : k; };
  const secOf = (g) => (lv === 'sector' ? g.name : lv === 'industryGroup' ? g.parent : d.list.find((y) => y.industry === g.name)?.sector);
  const base = (a, b) => si(secOf(a)) - si(secOf(b)) || b.n - a.n; // 기본 순서: PER 시장과 같은 대분류 순서 안에서 회사 수 순
  const lg = (d.groups || []).filter((g) => g.level === lv);
  const gs = [...sfSort(lg.filter((g) => g.name !== SF_NONE), sfGv, base), ...lg.filter((g) => g.name === SF_NONE)]; // 업종 미지정은 정렬과 상관없이 맨 아래
  const th = (k, label, tip, cls = '') => {
    const on = s.k === k;
    return `<th class="${cls}" aria-sort="${on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none'}"${tip ? ` title="${esc(tip)}"` : ''}><button type="button" class="sf-sort${on ? ' on' : ''}" data-sf-sort="${k}">${label}<span class="sf-dir" aria-hidden="true">${on ? (s.dir > 0 ? '▴' : '▾') : ''}</span></button></th>`;
  };
  const head = `<thead><tr><th class="st"><span class="sf-h0">업종</span></th>${th('n', '회사 수', '아래 작은 글씨는 영업적자 회사 수')}${SF_COLS.map(([k, l, , , t]) => th(k, l, k === 'ebitda' && d.rule?.ebitda ? d.rule.ebitda : t)).join('')}</tr></thead>`;
  const gid = (g) => `${g.level}|${g.name}`;
  const grow = (g, all) => {
    const id = gid(g), open = !!s.open[id], mine = !!me && (all || sfLvOf(me, lv) === g.name);
    const sub = all ? '' : lv !== 'sector' && g.parent && g.parent !== g.name ? `<small>${esc(g.parent)}</small>` : '';
    let h = `<tr class="sf-g${open ? ' open' : ''}${all ? ' sf-all' : ''}${mine && !all ? ' me' : ''}" data-sf-open="${esc(id)}"><td class="st"><button type="button" class="sf-open" aria-expanded="${open}" title="${esc(sfName(g.name))} 회사 목록 ${open ? '접기' : '펼치기'}"><span class="sf-chev" aria-hidden="true">${ico('right', 'sm')}</span><b>${esc(sfName(g.name))}</b></button>${sub}</td>`
      + `<td${g.n_all > g.n ? ` title="실적 있는 회사 ${vaNum(g.n)}곳, 전체 ${vaNum(g.n_all)}곳"` : ''}>${vaNum(g.n)}<small>적자 ${vaNum(g.n_loss || 0)}</small></td>${SF_COLS.map((c) => sfCell(g.financial, c, sfGv(g, c[0]), g)).join('')}</tr>`;
    if (open) h += sfCos(g, all, lv, me);
    return h;
  };
  const allRow = d.all ? grow({ ...d.all, level: 'all', name: '전체 상장사' }, true) : '';
  const inner = `${head}<tbody>${allRow}${gs.map((g) => grow(g, false)).join('')}</tbody>`;
  if (only) return inner;
  const body = `<div class="mk-scroll"><table class="mk-tbl sf-tbl">${inner}</table></div>`;
  const ctl = `<div class="va-mctl"><div><span class="va-lab">금액</span>${sfSeg('amt', [['median', '중앙값'], ['mean', '평균'], ['sum', '합계']], s.amt)}</div><div><span class="va-lab">마진</span>${sfSeg('mg', [['median', '중앙값'], ['mean', '평균'], ['agg', '합계 기준']], s.mg)}</div></div>`;
  const meta = [d.basis ? `${esc(d.basis)} 기준` : '', `단위 ${esc(d.unit || '억원')}`].filter(Boolean).join(', ');
  return vaSec(`업종 실적 <span class="meta">${vaNum(gs.length)}개 업종, ${meta}</span>`, sfSeg('lv', SF_LV, lv), `${ctl}${body}`, 'sf');
}
const sfSeg = (key, opts, cur) => `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-sf-seg="${key}" data-v="${esc(v)}" class="${cur === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;

function sfCos(g, all, lv, me) { // 펼친 업종의 회사 줄. 회사 수 칸은 시장, 기준이 다른 회사는 그 기준을 작게
  const d = vaS.sfd, s = vaS.sf, id = `${g.level}|${g.name}`;
  const ys = sfSort(d.list.filter((y) => all || sfLvOf(y, lv) === g.name), sfYv, (a, b) => (b.rev ?? -Infinity) - (a.rev ?? -Infinity));
  const lim = s.more[id] === true ? SF_ROWS + SF_STEP : +s.more[id] || SF_ROWS; // 11/26 전엔 true(전부)로 저장됨
  const shown = ys.slice(0, lim), rest = ys.length - shown.length;
  const ML = { KOSPI: '코스피', KOSDAQ: '코스닥' };
  const row = (y) => {
    const fin = sfFinRow(y), note = [SF_FS[y.fs] || y.fs, y.basis && sfBasis(y.basis) !== d.basis ? sfBasis(y.basis) : ''].filter(Boolean).join(', ');
    return `<tr class="sf-c${me?.code === y.code ? ' me' : ''}" data-sf-in="${esc(id)}"><td class="st"><button type="button" class="sf-co" data-va-pick="${esc(y.code)}" title="${esc(`${y.name} 보기`)}"><b>${esc(y.name)}</b></button>${all || lv !== 'industry' ? `<small>${esc(y.industry || '')}</small>` : ''}</td>`
      + `<td>${esc(ML[y.market] || y.market || '')}${note ? `<small>${esc(note)}</small>` : ''}</td>${SF_COLS.map((c) => sfCell(fin, c, sfYv(y, c[0]))).join('')}</tr>`;
  };
  const more = rest > 0 ? `<tr class="sf-c sf-more"><td class="st"><button type="button" class="va-more" data-sf-more="${esc(id)}" data-n="${shown.length}">${rest > SF_STEP ? `${vaNum(SF_STEP)}곳 더` : `나머지 ${vaNum(rest)}곳`}</button></td><td colspan="${SF_COLS.length + 1}">${rest > SF_STEP ? `<span class="meta">나머지 ${vaNum(rest)}곳</span>` : ''}</td></tr>` : '';
  return shown.map(row).join('') + more;
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
    if (sg) { const k = sg.dataset.sfSeg, v = sg.dataset.v; s[k] = v; vaDraw(); host.querySelector(`[data-sf-seg="${k}"][data-v="${CSS.escape(v)}"]`)?.focus({ preventScroll: true }); return; }
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
}
