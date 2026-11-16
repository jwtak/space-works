/* 투자업무 › 가치평가 › DCF (모델 v3). Valley AI 「DCF 실전형」 흐름(DCF 맵 단계 입력, 연도별 상세, 보고서)에 The Modellers 식 시트 구조를 얹은 화면.
   데이터: OneDrive data/valuation_v3.json {updated_at, cases: [model_web.json]}. 05. 딜소싱\_자동화\가치평가 에서 python -m v3.run run 뒤 publish.py --v3 로 올린다.
   계산은 valuation_v3_engine.js(V3E, 파이썬 v3\engine.py 와 같은 단계와 식)가 하고 이 파일은 화면만 그린다. 처음 값은 사례의 py 값과 모든 행을 대조한다(v3Ver).
   valuation.js renderValuation()이 #valuation/dcf 에서 renderV3(#va-host)를 부르고, v3 사례가 없으면 예전 화면 renderDcf 로 넘긴다.
   app.js 전역($, esc, pad, ico, toast, viewGet, viewSet, TAB_INFO, infoBtn), graph.js STORE·G, market.css(.mk-*), valuation.css(.va-*) 클래스를 쓴다.
   구역: 공통(상태, 포맷, 입력 칸, 머리, 도식, 맵, 이벤트) → 차트(v3c*) → 단계 화면(v3Step) → 연도별 상세, 점검(v3Tab) → 보고서(v3Rep) → 화면 설명(v3Info) */
const V3_FILE = 'data/valuation_v3.json';
const V3_TTL = 600000;
const V3_SCEN = ['Bull', 'Base', 'Bear'];
const V3_UNIT = { pct: '%', amt: '억', won: '원', days: '일', x: '배', cnt: '', num: '' };
const v3S = { data: null, at: 0, loading: null, err: '', cid: null, st: {} };
Object.assign(v3S, viewGet('v3', {}));
const v3Save = () => viewSet('v3', { cid: v3S.cid, st: v3S.st });
const V3_STEP = {}, V3_TABS = {}, V3_REP = [], V3_ON = [];
/* 조각 등록: 단계 화면 v3Step(번호, (x, c) => html), 탭 v3Tab('yr' | 'chk', fn), 보고서 화면 v3Rep(키, 이름, fn), 조각 전용 이벤트 v3On(종류, 선택자, (el, x, e) => 다시 그릴지) */
function v3Step(n, fn) { V3_STEP[n] = fn; }
function v3Tab(k, fn) { V3_TABS[k] = fn; }
const V3_REP_ORD = ['sum', 'det', 'sens', 'scen', 'rev', 'ff', 'mc']; // 보고서 안 화면 순서(조각이 어떤 순서로 등록하든)
function v3Rep(k, label, fn) {
  const i = V3_REP.findIndex((r) => r.k === k); if (i >= 0) V3_REP[i] = { k, label, fn }; else V3_REP.push({ k, label, fn });
  const o = (r) => { const j = V3_REP_ORD.indexOf(r.k); return j < 0 ? 99 : j; }; V3_REP.sort((a, b) => o(a) - o(b));
}
function v3On(type, sel, fn) { V3_ON.push({ type, sel, fn }); }

function v3Load(force) {
  if (!force && v3S.at && Date.now() - v3S.at < V3_TTL) return Promise.resolve();
  v3S.loading ||= STORE.readText(V3_FILE)
    .then((r) => { const d = r.text ? JSON.parse(r.text) : null; v3S.data = d && d.version === 3 ? { updated_at: d.generated_at, cases: [d] } : d; v3S.err = ''; v3S.at = Date.now(); })
    .catch((e) => { v3S.data = null; v3S.err = e instanceof SyntaxError ? '모델 파일을 읽지 못했습니다.' : e.message; })
    .finally(() => { v3S.loading = null; });
  return v3S.loading;
}
const v3Cases = () => (v3S.data?.cases || []).filter((c) => c && c.version === 3 && c.input && c.py?.rows);
const v3Case = () => { const cs = v3Cases(); return cs.find((c) => c.id === v3S.cid) || cs[0] || null; };
const v3St = (c) => { const s = (v3S.st[c.id] ||= {}); s.ov ||= {}; return s; };

// ---------- 포맷 ----------
const v3Ok = (v) => v != null && Number.isFinite(+v);
const v3Num = (v, d = 0) => { if (!v3Ok(v)) return '-'; const s = Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }); return /^-0(.0+)?$/.test(s) ? s.slice(1) : s; }; // 반올림해 0이면 음수 부호를 뗌
const v3Pct = (v, d = 1) => (v3Ok(v) ? `${v3Num(v * 100, d)}%` : '-');
const v3Won = (v) => (v3Ok(v) ? `${v3Num(v)}원` : '-');
const v3X = (v, d = 2) => (v3Ok(v) ? `${v3Num(v, d)}배` : '-');
const v3Eok = (v, d = 0) => (v3Ok(v) ? `${v3Num(v, d)}억` : '-');
const v3Sgn = (v) => (v3Ok(v) ? `${v < 0 ? '−' : '+'}${v3Num(Math.abs(v))}억` : '-');
const v3Up = (u, d = 1) => (v3Ok(u) ? `<span class="${u > 0 ? 'up' : u < 0 ? 'dn' : ''}">${u > 0 ? '+' : ''}${v3Num(u * 100, d)}%</span>` : '');
/* 행 서식(labels[id].fmt)대로. 표 칸용이라 단위는 붙이지 않음(%만 붙임). d를 주면 그 자릿수 */
function v3Fmt(v, fmt, d) {
  if (typeof v === 'string') return esc(v);
  if (!v3Ok(v)) return '-';
  if (fmt === 'pct') return v3Pct(v, d ?? 1);
  if (fmt === 'x') return v3Num(v, d ?? 2);
  if (fmt === 'num') return v3Num(v, d ?? (Math.abs(v) >= 100 ? 0 : 3));
  if (fmt === 'days') return v3Num(v, d ?? 1);
  return v3Num(v, d ?? 0);
}
function v3Fi(v, fmt, d) { // 입력 칸에 넣을 값. 금액, 주식 수, 원은 천 단위 쉼표
  if (!v3Ok(v)) return '';
  const n = +(v * (fmt === 'pct' ? 100 : 1)).toFixed(d ?? (fmt === 'pct' || fmt === 'x' || fmt === 'num' ? 2 : fmt === 'cnt' || fmt === 'won' ? 0 : 1));
  return fmt === 'amt' || fmt === 'cnt' || fmt === 'won' ? n.toLocaleString('ko-KR', { maximumFractionDigits: 6 }) : String(n);
}
const v3NumOf = (s) => { if (s == null) return null; const t = String(s).replace(/,/g, '').trim(); return t === '' || !Number.isFinite(+t) ? null : +t; };
const v3Sec = (title, right, body, cls = '', id = '') => `<section class="card mk-sec ${cls}"${id ? ` id="${id}"` : ''}><div class="card-head"><h2>${title}</h2>${right || ''}</div><div class="mk-body">${body}</div></section>`;
/* 화면 상태를 바꾸는 단추 묶음(탭, 시나리오 등). 계산 입력을 바꾸는 묶음은 v3Sw */
const v3Seg = (key, opts, cur) => `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-v3-seg="${key}" data-v="${esc(v)}" class="${String(cur) === String(v) ? 'on' : ''}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
const v3Why = (text) => (text ? `<p class="v3-why" data-v3-more title="${esc(text)}">${esc(text)}</p>` : '');

// ---------- 덮기(바꾼 입력) ----------
/* 화면 키 → 엔진 덮기 키. 화면 키는 엔진 키 그대로이거나 「엔진 키#칸」.
   a.<가정 키>.<시나리오>#<연차>: 그 가정의 연도별 값 한 칸(나머지 해는 지금 값 그대로 by_year로 넘김)
   sw.<키>#<이름>, i.<경로>#<이름>: 객체 한 칸(예: sw.weights#Bull) */
const v3Path = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function v3OvSplit(st) {
  const plain = {}, cells = {};
  for (const [k, e] of Object.entries(st.ov || {})) { const i = k.indexOf('#'); if (i < 0) plain[k] = e.v; else (cells[k.slice(0, i)] ||= {})[k.slice(i + 1)] = e.v; }
  return { plain, cells };
}
function v3OvBuild(c, plain, cells, rows0) {
  const all = { ...plain };
  for (const [b, subs] of Object.entries(cells)) {
    if (b.startsWith('a.')) {
      const j = b.lastIndexOf('.'), K = b.slice(2, j), S = b.slice(j + 1), base = rows0?.[S === '*' ? 'Base' : S]?.[`CTL.a.${K}`];
      if (!base) continue;
      const arr = [...base];
      for (const [i, v] of Object.entries(subs)) if (+i < arr.length) arr[+i] = v;
      all[b] = { by_year: arr };
    } else {
      const cur = b.startsWith('sw.') ? c.switches[b.slice(3)] : v3Path(c.input, b.slice(2));
      const o = Array.isArray(cur) ? [...cur] : { ...(cur || {}) };
      for (const [s, v] of Object.entries(subs)) o[s] = v;
      all[b] = o;
    }
  }
  const ord = (k) => ['sw.', 'i.', 'm.', 'a.', 'o.'].findIndex((p) => k.startsWith(p)), ov = {};
  Object.keys(all).sort((a, b) => ord(a) - ord(b)).forEach((k) => { ov[k] = all[k]; });
  return ov;
}
const v3Ver = (c) => (c._ver ||= (typeof V3E !== 'undefined' && V3E.ready ? (() => { try { return V3E.verify(c); } catch (e) { return { n: 0, bad: [{ id: e.message }], max: 0, err: e.message }; } })() : null));

/* x: 화면이 쓰는 계산 결과 묶음.
   c 사례, st 화면 상태, sc 고른 시나리오, res 결과(c.py와 같은 모양 + checks, map, ms), R 고른 시나리오의 행, rows0 연도별 칸 덮기 전 행,
   tl {hist, fc, fade, ty, H, N, M}, sw 지금 스위치, I 지금 input, t 대상 회사, ov 엔진 덮기, live 엔진으로 다시 계산했는지, err 계산 오류, w 본문 폭 */
let v3Memo = null;
function v3Model(c) {
  const st = v3St(c), key = `${c.id}|${c.generated_at}|${JSON.stringify(st.ov)}`;
  if (!v3Memo || v3Memo.key !== key) {
    const m = { key, res: null, rows0: null, ov: {}, eff: c, live: false, err: '' };
    if (typeof V3E !== 'undefined' && V3E.ready) {
      try {
        const { plain, cells } = v3OvSplit(st), hasA = Object.keys(cells).some((b) => b.startsWith('a.'));
        if (hasA) { const p1 = v3OvBuild(c, plain, {}, null); m.rows0 = {}; V3_SCEN.forEach((S) => { m.rows0[S] = V3E.run(c, S, p1).rows; }); }
        m.ov = v3OvBuild(c, plain, cells, m.rows0);
        m.res = V3E.runAll(c, m.ov); m.eff = V3E.applyOverrides(c, m.ov); m.live = true;
      } catch (e) { m.err = e.message || String(e); m.res = null; m.rows0 = null; m.ov = {}; }
    }
    if (!m.res) m.res = { ...c.py, checks: c.checks || [], map: c.map || [] };
    m.rows0 ||= m.res.rows;
    v3Memo = m;
  }
  const m = v3Memo, sc = V3_SCEN.includes(st.sc) ? st.sc : 'Base', R = m.res.rows[sc] || {};
  const hist = c.timeline.hist, H = hist.length, N = Math.max(0, (R['IS.rev'] || []).length - H), M = Math.max(0, (R['DCF.fcff'] || []).length - N - 1), y0 = hist[H - 1];
  const fc = Array.from({ length: N }, (_, i) => y0 + 1 + i), fade = Array.from({ length: M }, (_, i) => y0 + N + 1 + i);
  return { c, st, sc, res: m.res, R, rows0: m.rows0, tl: { ...c.timeline, hist, fc, fade, ty: y0 + N + M + 1, H, N, M }, sw: m.eff.switches, I: m.eff.input, t: c.target, ov: m.ov, live: m.live, err: m.err,
    lab: c.labels || {}, w: $('#va-host')?.clientWidth || 1000 };
}
/* 행 꺼내기: v3Row(x, 'IS.rev') 배열, v3V(x, 'DCF.ps') 한 값(i번째 열), S를 주면 그 시나리오 */
const v3Row = (x, id, S) => (S ? x.res.rows[S] : x.R)?.[id] || null;
const v3V = (x, id, i = 0, S) => { const r = v3Row(x, id, S); return r ? r[i] ?? null : null; };
const v3Lab = (x, id) => x.lab[id] || { name: id, fmt: 'amt', cols: 'one', unit: '' };
/* 열 머리: cols = 'hist+fc' | 'fc' | 'dcf'. [{y, e(추정 여부), k: 'h' | 'f' | 'd' | 't', label}] */
function v3Years(x, cols) {
  const h = x.tl.hist.map((y) => ({ y, e: false, k: 'h', label: `${y}` })), f = x.tl.fc.map((y) => ({ y, e: true, k: 'f', label: `${y}E` }));
  if (cols === 'fc') return f;
  if (cols === 'dcf') return [...f, ...x.tl.fade.map((y) => ({ y, e: true, k: 'd', label: `${y}E` })), { y: x.tl.ty, e: true, k: 't', label: '종료연도' }];
  return [...h, ...f];
}
/* 차트 폭: 본문 폭에서 카드 안쪽 여백(48)과 옆 칸을 뺀 값. cols 칸으로 나란히 놓을 때 한 칸 폭 */
const v3Wd = (x, cols = 1, side = 0) => Math.max(280, Math.floor((x.w - 48 - side - 32 * (cols - 1)) / cols));
const v3Note = (x, key) => x.c.notes?.why?.[key] || x.c.input?.notes_in?.why?.[key] || '';
const v3Chg = (x) => Object.keys(x.st.ov).length;

// ---------- 입력 칸 ----------
/* v3In(x, 화면 키, 처음 값(모델 단위), {fmt, d, lab, ph, cell, dis, u})
   fmt 가 pct 면 화면에는 ×100 으로 보이고 저장은 소수. cell: 표 안 칸(단위 표시 없음) */
function v3In(x, key, base, { fmt = 'num', d, lab = '', ph = '', cell = false, dis = false, u } = {}) {
  const e = x.st.ov[key], b = v3Fi(base, fmt, d), unit = u ?? V3_UNIT[fmt] ?? '';
  const inp = `<input type="text" inputmode="decimal" autocomplete="off" data-k="${esc(key)}" data-b="${esc(b)}" data-sc="${fmt === 'pct' ? 100 : 1}" value="${esc(e ? e.t : b)}"${ph ? ` placeholder="${esc(ph)}"` : ''}${dis ? ' disabled' : ''} class="${e ? 'chg' : ''}" aria-label="${esc(lab)}">`;
  return cell ? `<span class="v3-ci">${inp}</span>` : `<span class="v3-iw ${unit ? '' : 'nu'}">${inp}${unit ? `<em>${unit}</em>` : ''}</span>`;
}
const v3F = (lab, html, cls = '') => `<label class="v3-f ${cls}"><span>${lab}</span>${html}</label>`;
/* 가정 한 칸: 가정 키 K의 i번째 추정 연도. 처음 값은 연도별 칸 덮기 전 계산값 */
function v3ACell(x, K, i, fmt, S, lab = '') {
  const s = S || x.sc, base = x.rows0?.[s]?.[`CTL.a.${K}`]?.[i];
  return v3In(x, `a.${K}.${s}#${i}`, base, { fmt, cell: true, lab: `${lab} ${x.tl.fc[i]}년`, d: fmt === 'pct' ? 2 : fmt === 'days' ? 1 : fmt === 'amt' ? 1 : undefined });
}
/* 가정 표: 줄마다 가정 키 하나, 열은 추정 연도(입력 칸). items [{key, name, fmt, hist: 과거 값을 보여 줄 행 ID, why: 근거, sub: 이름 아래 작은 글}]
   opt {S, hist: true면 과거 열을 보여 줌, why: false면 근거 열 숨김, first: 첫 열 머리글} */
function v3ATable(x, items, { S, hist = true, why = true, first = '항목' } = {}) {
  const s = S || x.sc, its = items.filter((it) => x.R[`CTL.a.${it.key}`]);
  if (!its.length) return '<div class="empty">이 사례에는 해당 가정이 없습니다.</div>';
  const anyH = hist && its.some((it) => it.hist && x.R[it.hist]), hs = anyH ? x.tl.hist : [];
  const head = `<tr><th class="st">${first}</th>${hs.map((y) => `<th>${y}</th>`).join('')}${x.tl.fc.map((y, i) => `<th class="${i === 0 && anyH ? 'bl' : ''}">${y}E</th>`).join('')}${why ? '<th class="tx why">근거</th>' : ''}</tr>`;
  const rows = its.map((it) => {
    const L = v3Lab(x, `CTL.a.${it.key}`), fmt = it.fmt || L.fmt, nm = it.name || L.name, hr = it.hist ? x.R[it.hist] : null, unit = V3_UNIT[fmt];
    const w = it.why ?? v3Note(x, it.key);
    return `<tr><td class="st"><b>${esc(nm)}</b>${unit ? `<small>${fmt === 'pct' ? '%' : unit}</small>` : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</td>${hs.map((_, i) => `<td class="h">${hr ? v3Fmt(hr[i], fmt, fmt === 'pct' ? 1 : undefined) : ''}</td>`).join('')}${x.tl.fc.map((_, i) => `<td class="in ${i === 0 && anyH ? 'bl' : ''}">${v3ACell(x, it.key, i, fmt, s, nm)}</td>`).join('')}${why ? `<td class="tx why">${v3Why(w)}</td>` : ''}</tr>`;
  }).join('');
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3-at"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}
/* 계산 입력을 바꾸는 단추 묶음. key 는 엔진 덮기 키(sw.beta_mode 등), opts [[값, 이름]], cur 지금 값. 값은 JSON 으로 실어 불린, null 도 됨 */
function v3Sw(x, key, opts, cur) {
  const j = JSON.stringify(cur ?? null);
  return `<div class="mk-seg">${opts.map(([v, l]) => { const on = JSON.stringify(v ?? null) === j; return `<button type="button" data-v3-ov="${esc(key)}" data-v="${esc(JSON.stringify(v ?? null))}" class="${on ? 'on' : ''}" aria-pressed="${on}">${esc(l)}</button>`; }).join('')}</div>`;
}
const v3SwCur = (x, k) => x.sw[k];
/* 체크박스: 켜면 on, 끄면 off 값을 덮기 키에 넣음(처음 값과 같으면 덮기에서 뺌). 배열에 값을 넣고 빼는 체크는 v3SetChk */
const v3Chk = (x, key, cur, lab, on = true, off = false) => `<label class="v3-ck"><input type="checkbox" data-v3-ck="${esc(key)}" data-on="${esc(JSON.stringify(on))}" data-off="${esc(JSON.stringify(off))}"${JSON.stringify(cur) === JSON.stringify(on) ? ' checked' : ''}><span>${lab}</span></label>`;
const v3SetChk = (x, key, cur, val, lab, inv = false) => { const has = (cur || []).includes(val); return `<label class="v3-ck"><input type="checkbox" data-v3-set="${esc(key)}" data-v="${esc(JSON.stringify(val))}"${has !== inv ? ' checked' : ''}><span>${lab}</span></label>`; };
/* 덮기에 쓸 처음 값: sw.* 는 사례 스위치, i.* 는 사례 input 경로 */
const v3Base = (c, key) => (key.startsWith('sw.') ? c.switches[key.slice(3)] : key.startsWith('i.') ? v3Path(c.input, key.slice(2)) : undefined);
function v3SetOv(c, key, v, t = '') {
  const st = v3St(c), b = v3Base(c, key);
  if (b !== undefined && JSON.stringify(b ?? null) === JSON.stringify(v ?? null)) delete st.ov[key]; else st.ov[key] = { t, v };
}

// ---------- 머리 ----------
function v3Head(c, x) {
  const t = x.t, cs = v3Cases(), r = x.res, bl = r.blend || {}, wv = r.wavg || {}, errs = (r.checks || []).filter((k) => k.level === 'err').length, n = v3Chg(x);
  const pick = cs.length > 1 ? `<select class="va-case" data-v3-case aria-label="평가 사례">${cs.map((y) => `<option value="${esc(y.id)}" ${y.id === c.id ? 'selected' : ''}>${esc(y.target.name)} ${esc(y.target.val_date || '')}</option>`).join('')}</select>` : '';
  const kpi = `<div class="v3-kpi" data-o="kpi"><div class="tp"><span>목표주가</span><b>${v3Won(bl.target)}</b><em>${v3Up(bl.up)}${errs ? '<i class="v3-bad">점검 오류</i>' : ''}</em></div>
      <div><span>DCF 가중평균</span><b>${wv.ok === false ? '-' : v3Won(wv.ps)}</b><em>${v3Up(wv.up)}</em></div>
      <div><span>상대가치</span><b>${v3Won(bl.rel)}</b><em>${v3Up(v3Ok(bl.rel) && t.close ? bl.rel / t.close - 1 : null)}</em></div>
      <div><span>현재가</span><b>${v3Won(t.close)}</b><em>${esc(t.val_date || '')}</em></div></div>`;
  return `<section class="card va-head v3-head"><div class="va-ttl"><div><h2>${esc(t.name)} <small>${esc(t.code || '')}</small></h2>
      <p>기준일 ${esc(t.val_date || '')}${t.bs_date ? `, 재무상태표 ${esc(t.bs_date)}` : ''}${t.wics ? `, ${esc(t.wics)}` : ''}</p></div>
      <div class="va-tools">${pick}${infoBtn('valuation_v3')}<button class="btn ghost" type="button" id="v3-json">입력 내려받기</button><button class="btn ghost" type="button" id="v3-xlsx">${ico('file', 'sm')}엑셀 받기</button></div></div>
    ${kpi}
    <div class="va-ctrl"><div><span>명시 기간</span>${v3Sw(x, 'sw.fc_years', [3, 5, 7, 10].map((y) => [y, `${y}년`]), x.sw.fc_years)}</div>
      <div><span>전환 기간</span>${v3Sw(x, 'sw.fade_years', [0, 5, 10].map((y) => [y, `${y}년`]), x.sw.fade_years)}</div>
      <div><span>시나리오</span>${v3Seg('sc', V3_SCEN.map((s) => [s, s]), x.sc)}</div>
      <button class="btn ghost sm" type="button" data-v3-reset${n ? '' : ' disabled'}>처음 값으로${n ? ` <b class="v3-n">${n}</b>` : ''}</button></div>
    ${x.err ? `<p class="v3-err">지금 입력으로는 계산하지 못해 처음 값을 보여 줍니다. ${esc(x.err)}</p>` : ''}</section>`;
}

// ---------- 단계 상태 ----------
/* 엔진 맵은 값이 있으면 완료로만 주므로, 주의와 오류 점검이 걸린 단계를 화면에서 「확인 필요」로 바꿈(설계서 7-2). 점검 id → 단계 번호 */
const V3_CHK_STEP = { cons_gap: 1, rseg_checks: 1, basis_mix: 1, hist_tie: 1, fy1_stale: 1, gpm_range: 2, ratio_jump: 3, labor_scope: 3, labor_ratio: 3, tax_outlier: 4, capex_da: 5, nwc_jump: 5, dep_rate_trend: 5,
  neg_cash: 6, bs_balance: 6, cash_roll: 6, re_roll: 6, premium_evidence: 7, erp_fallback: 7, stable_beta: 7, kd_missing: 8, override: 9, model_rate_pair: 9, g_vs_rate: 10, stable_rr: 10, tv_share: 10, dcf_fit: 10,
  dilution: 13, weights: 14, upside_big: 14, type_block: 15 };
function v3Stat(x) {
  if (x._stat) return x._stat;
  const st = (x.res.map || []).map((m) => m.status || 'todo');
  for (const k of x.res.checks || []) { const n = V3_CHK_STEP[k.id]; if (n && (k.level === 'warn' || k.level === 'err') && st[n - 1] === 'done') st[n - 1] = 'warn'; }
  return (x._stat = st);
}

// ---------- 가치 다리 도식 ----------
function v3Flow(c, x) {
  const R = x.R, { N, M } = x.tl, f = R['DCF.fcff'] || [], pv = R['DCF.pv'] || [], sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
  const one = (id) => v3V(x, id), nonop = (one('DCF.cash') || 0) + (one('DCF.nonop') || 0), claim = ['debt', 'nci', 'pref', 'dbo', 'other_claim'].reduce((s, k) => s + (one(`DCF.${k}`) || 0), 0);
  const stat = v3Stat(x), card = (go, top, val, sub, cls = '', op = '') => `<button type="button" class="v3-fc ${cls} ${stat[go - 1] === 'warn' ? 'wn' : ''}" data-v3-go="${go}"${stat[go - 1] === 'warn' ? ' title="확인 필요"' : ''}><span${op ? ` data-op="${op}"` : ''}>${top}</span><b>${val}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  const yrs = x.tl.fc.map((y, i) => card(1, `${y}E`, v3Eok(f[i]), `현가 ${v3Eok(pv[i])}`)).join('');
  const fd = M ? card(10, `${x.tl.fade[0]}～${x.tl.fade[M - 1]}E`, v3Eok(sum(f.slice(N, N + M))), `현가 ${v3Eok(sum(pv.slice(N, N + M)))}`, 'fd') : '';
  const tv = card(10, '종료가치', v3Eok(one('DCF.tv')), `현가 ${v3Eok(one('DCF.pv_tv'))}`, 'tv');
  const ps = one('DCF.ps'), ok = v3Ok(ps);
  const body = `<div data-o="flow"><div class="v3-fl-h"><span>연도별 FCFF와 현재가치</span><span>단위 억원</span></div>
    <div class="v3-fcf">${yrs}${fd}${tv}</div>
    <button type="button" class="v3-wacc" data-v3-go="9"><span>할인율</span><b>WACC ${v3Pct(one('WACC.wacc'), 2)}</b><span>안정기 ${v3Pct(one('WACC.wacc_s'), 2)}, 영구성장률 ${v3Pct(one('DCF.g_s'), 2)}, 종료가치 비중 ${v3Pct(one('DCF.tv_share'))}</span></button>
    <div class="v3-eq">${card(10, '영업가치', v3Eok(one('DCF.ev')))}<i class="v3-op">+</i>${card(11, '비영업자산', v3Eok(nonop), '', '', '+')}<i class="v3-op">−</i>${card(12, '비주주청구권', v3Eok(claim), '', '', '−')}<i class="v3-op">=</i>${card(12, '주주가치', v3Eok(one('DCF.eq')), '', 'sum', '=')}</div>
    <div class="v3-eq r2"><i class="v3-op">÷</i>${card(13, '주식 수', `${v3Num(one('DCF.shares'))}주`, '', '', '÷')}<i class="v3-op">=</i>${card(14, `${x.sc} 내재 가치`, ok ? v3Won(ps) : '계산 불가', ok ? `현재가 대비 ${v3Up(one('DCF.up'))}` : '영구성장률이 할인율 이상', `res ${x.sc}`)}</div></div>`;
  return v3Sec('가치 산정 흐름', `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc}</span>`, body, 'v3-flow', 'v3-flow');
}

const v3Try = (fn, x, c) => { try { return fn(x, c); } catch (e) { console.error(e); return `<div class="card"><div class="empty">이 화면을 그리지 못했습니다. ${esc(e.message)}</div></div>`; } };

// ---------- DCF 맵과 탭 ----------
function v3Map(c, x) {
  const map = x.res.map || [], cur = v3StepNo(x), groups = [...new Set(map.map((m) => m.group))], stat = v3Stat(x), done = stat.filter((y) => y === 'done').length;
  const li = (m, i) => `<li><button type="button" class="${esc(stat[i])} ${i + 1 === cur ? 'on' : ''}" data-v3-go="${i + 1}" ${i + 1 === cur ? 'aria-current="step"' : ''}${stat[i] === 'warn' ? ' title="확인 필요"' : ''}>${ico(stat[i] === 'warn' ? 'alert' : 'done', 'sm')}<b>${esc(m.step)}</b><span>${esc(m.value_text || '')}</span></button></li>`;
  return `<div class="v3-map" data-o="map"><div class="v3-map-h"><h3>DCF 맵</h3><span>${done}/${map.length} 완료</span></div>${groups.map((g) => `<div class="v3-mg"><h4>${esc(g)}</h4><ol>${map.map((m, i) => (m.group === g ? li(m, i) : '')).join('')}</ol></div>`).join('')}</div>`;
}
const v3StepNo = (x) => { const n = +x.st.step || 1, max = (x.res.map || []).length || 15; return Math.min(Math.max(1, n), max); };
function v3InTab(c, x) {
  const n = v3StepNo(x), map = x.res.map || [], m = map[n - 1] || { step: '', group: '' }, fn = V3_STEP[n];
  const nav = `<div class="v3-nav"><span>${n} / ${map.length || 15}</span><button class="btn sm" type="button" data-v3-go="${n - 1}"${n <= 1 ? ' disabled' : ''} aria-label="이전 단계">${ico('left', 'sm')}</button><button class="btn sm" type="button" data-v3-go="${n + 1}"${n >= (map.length || 15) ? ' disabled' : ''} aria-label="다음 단계">${ico('right', 'sm')}</button></div>`;
  return `<div class="v3-in"><div class="v3-stepw" id="v3-step"><div class="v3-step-h"><h2>${esc(m.step)}<small>${esc(m.group)}</small></h2>${nav}</div>
      <div data-o="stepwarn">${v3Stat(x)[n - 1] === 'warn' ? `<p class="v3-warnl">${(x.res.checks || []).filter((k) => V3_CHK_STEP[k.id] === n && k.level !== 'info').map((k) => esc(k.text)).join('<br>')}</p>` : ''}</div>
      ${fn ? v3Try(fn, x, c) : '<div class="card"><div class="empty">이 단계 화면은 준비 중입니다.</div></div>'}</div>
    <aside class="card v3-mapw ${x.st.map ? 'open' : ''}"><button type="button" class="v3-map-t" data-v3-mapt aria-expanded="${!!x.st.map}">DCF 맵 <span>${v3Stat(x).filter((y) => y === 'done').length}/${map.length} 완료</span></button>${v3Map(c, x)}</aside></div>`;
}
function v3RepTab(c, x) {
  if (!V3_REP.length) return '<div class="card"><div class="empty">보고서 화면은 준비 중입니다.</div></div>';
  const cur = V3_REP.find((r) => r.k === x.st.rep) || V3_REP[0];
  return `<div class="va-tabs v3-sub">${v3Seg('rep', V3_REP.map((r) => [r.k, r.label]), cur.k)}</div>${v3Try(cur.fn, x, c)}`;
}
function v3Body(c, x) {
  const tab = ['in', 'yr', 'rep', 'chk'].includes(x.st.tab) ? x.st.tab : 'in';
  if (tab === 'in') return v3InTab(c, x);
  if (tab === 'rep') return v3RepTab(c, x);
  return V3_TABS[tab] ? v3Try(V3_TABS[tab], x, c) : '<div class="card"><div class="empty">준비 중입니다.</div></div>';
}
function v3Html(c, x) {
  const tab = ['in', 'yr', 'rep', 'chk'].includes(x.st.tab) ? x.st.tab : 'in', ck = x.res.checks || [], ver = v3Ver(c);
  const bad = ck.filter((k) => k.level === 'err').length + (ver && ver.bad.length ? 1 : 0), warn = ck.filter((k) => k.level === 'warn').length;
  const tabs = [['in', '입력'], ['yr', '연도별 상세'], ['rep', '보고서'], ['chk', `점검${bad ? ` 오류 ${bad}` : warn ? ` ${warn}` : ''}`]];
  return `${v3Head(c, x)}${v3Flow(c, x)}<div class="va-tabs v3-tabs" id="v3-tabs">${v3Seg('tab', tabs, tab)}</div><div id="v3-body" class="v3-body">${v3Body(c, x)}</div>`;
}

// ---------- 그리기 ----------
function v3Host() { const h = $('#va-host'); return h && h.hasAttribute('data-v3') ? h : null; }
function v3Draw() {
  const host = v3Host(); if (!host) return;
  const c = v3Case();
  if (!c) { host.innerHTML = '<div class="card"><div class="empty">아직 모델 평가가 없습니다.</div></div>'; return; }
  v3S.cid = c.id;
  if (typeof v3Info === 'function') TAB_INFO.valuation_v3 = v3Info(c);
  const x = v3Model(c);
  const a = document.activeElement, fk = host.contains(a) ? a.dataset?.k : null, s0 = a?.selectionStart, s1 = a?.selectionEnd;
  const keep = {}; host.querySelectorAll('[data-v3-keep]').forEach((el) => { keep[el.dataset.v3Keep] = [el.scrollLeft, el.scrollTop]; }); // 표 안 스크롤 자리
  host.innerHTML = v3Html(c, x);
  host.querySelectorAll('[data-v3-keep]').forEach((el) => { const k = keep[el.dataset.v3Keep]; if (k) { el.scrollLeft = k[0]; el.scrollTop = k[1]; } });
  if (fk) { const el = host.querySelector(`[data-k="${CSS.escape(fk)}"]`); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(s0, s1); } catch { /* */ } } }
  v3Save();
}
/* 입력 중 다시 계산: 화면을 통째로 다시 그리지 않고 data-o 구역만 바꿈. 손대지 않은 입력 칸의 처음 값도 새 계산값으로 맞춤 */
function v3Patch() {
  const host = v3Host(), c = v3Case(); if (!host || !c) return;
  const x = v3Model(c), t = document.createElement('template'), act = document.activeElement;
  t.innerHTML = v3Html(c, x);
  const fresh = {}; t.content.querySelectorAll('[data-o]').forEach((el) => { fresh[el.dataset.o] = el; });
  host.querySelectorAll('[data-o]').forEach((el) => { const f = fresh[el.dataset.o]; if (f && host.contains(el) && !el.contains(act) && f.innerHTML !== el.innerHTML) el.innerHTML = f.innerHTML; });
  const fi = {}; t.content.querySelectorAll('input[data-k]').forEach((el) => { fi[el.dataset.k] = el; });
  host.querySelectorAll('input[data-k]').forEach((el) => {
    const f = fi[el.dataset.k]; if (!f || el === act) return;
    el.dataset.b = f.dataset.b;
    if (!el.classList.contains('chg') && el.value !== f.value) el.value = f.value;
  });
  const rb = host.querySelector('[data-v3-reset]'), fb = t.content.querySelector('[data-v3-reset]');
  if (rb && fb) { rb.innerHTML = fb.innerHTML; rb.disabled = fb.disabled; }
  const tb = host.querySelector('#v3-tabs'), ft = t.content.querySelector('#v3-tabs');
  if (tb && ft && tb.innerHTML !== ft.innerHTML) tb.innerHTML = ft.innerHTML;
  v3Save();
}
let v3Timer = 0;
const v3Later = () => { clearTimeout(v3Timer); v3Timer = setTimeout(v3Patch, 150); };

function v3Go(host, c, n) {
  const st = v3St(c); st.tab = 'in'; st.step = n; v3Draw();
  const el = host.querySelector('#v3-tabs'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function v3Bind(host) {
  const hook = (type, e) => { for (const h of V3_ON) { if (h.type !== type) continue; const el = e.target.closest?.(h.sel); if (el && host.contains(el)) { const c = v3Case(); if (c && h.fn(el, v3Model(c), e) === true) v3Draw(); return true; } } return false; };
  host.addEventListener('click', (e) => {
    const c = v3Case(); if (!c) return;
    const st = v3St(c);
    if (hook('click', e)) return;
    const sg = e.target.closest('[data-v3-seg]');
    if (sg) { st[sg.dataset.v3Seg] = sg.dataset.v; v3Draw(); return; }
    const sw = e.target.closest('[data-v3-ov]');
    if (sw) { v3SetOv(c, sw.dataset.v3Ov, JSON.parse(sw.dataset.v)); v3Draw(); return; }
    const go = e.target.closest('[data-v3-go]');
    if (go) { v3Go(host, c, +go.dataset.v3Go); return; }
    const mt = e.target.closest('[data-v3-mapt]'); // 좁은 화면에서 접어 둔 DCF 맵
    if (mt) { st.map = !st.map; mt.parentElement.classList.toggle('open', st.map); mt.setAttribute('aria-expanded', st.map); v3Save(); return; }
    const mo = e.target.closest('[data-v3-more]');
    if (mo) { mo.classList.toggle('open'); return; }
    if (e.target.closest('[data-v3-reset]')) { st.ov = {}; v3Draw(); return; } // 바꾼 입력만 지우고 화면 상태(탭, 편 묶음, 메모)는 둠
    if (e.target.closest('#v3-xlsx')) { v3Download(e.target.closest('#v3-xlsx'), c); return; }
    if (e.target.closest('#v3-json')) v3Export(c);
  });
  host.addEventListener('input', (e) => {
    const c = v3Case(); if (!c) return;
    if (hook('input', e)) return;
    const el = e.target; if (!el.matches('input[data-k]')) return;
    const st = v3St(c), k = el.dataset.k, v = v3NumOf(el.value);
    if (v == null || v === v3NumOf(el.dataset.b)) delete st.ov[k]; else st.ov[k] = { t: el.value, v: v / (+el.dataset.sc || 1) };
    el.classList.toggle('chg', !!st.ov[k]);
    v3Later();
  });
  let w0 = host.clientWidth, rt = 0; // 폭이 바뀌면 차트 폭을 다시 잡음
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { const w = host.clientWidth; if (!w || Math.abs(w - w0) < 40) return; w0 = w; clearTimeout(rt); rt = setTimeout(v3Draw, 200); }).observe(host);
  host.addEventListener('keydown', (e) => { // 표 칸에서 Enter 는 아래 칸으로
    if (e.key !== 'Enter' || !e.target.matches?.('.v3-ci input')) return;
    const td = e.target.closest('td'); let tr = td?.parentElement?.nextElementSibling, nx = null;
    for (let i = 0; tr && i < 40 && !nx; i++, tr = tr.nextElementSibling) nx = tr.children[td.cellIndex]?.querySelector('input:not(:disabled)'); // 계산 줄은 건너뛰고 다음 입력 줄로
    e.preventDefault(); if (nx) { nx.focus(); nx.select(); } else e.target.blur();
  });
  host.addEventListener('focusout', (e) => { // 비우거나 숫자가 아닌 칸은 나갈 때 처음 값으로
    const el = e.target; if (!el.matches?.('input[data-k]') || v3NumOf(el.value) != null) return;
    const c = v3Case(); if (!c) return;
    delete v3St(c).ov[el.dataset.k]; el.value = el.dataset.b; el.classList.remove('chg'); v3Later();
  });
  host.addEventListener('change', (e) => {
    const c = v3Case(); if (!c) return;
    const el = e.target;
    if (el.matches('[data-v3-case]')) { v3S.cid = el.value; v3Draw(); return; }
    if (hook('change', e)) return;
    if (el.matches('[data-v3-ck]')) { v3SetOv(c, el.dataset.v3Ck, JSON.parse(el.checked ? el.dataset.on : el.dataset.off)); v3Draw(); return; }
    if (el.matches('[data-v3-set]')) {
      const k = el.dataset.v3Set, val = JSON.parse(el.dataset.v), cur = v3St(c).ov[k]?.v ?? v3Base(c, k) ?? [];
      const nx = cur.includes(val) ? cur.filter((y) => y !== val) : [...cur, val].sort();
      v3SetOv(c, k, nx); v3Draw(); return;
    }
    if (el.matches('select[data-v3-ov]')) { v3SetOv(c, el.dataset.v3Ov, JSON.parse(el.value)); v3Draw(); }
  });
}

// ---------- 내려받기 ----------
async function v3Download(btn, c) {
  if (btn.disabled) return;
  btn.disabled = true;
  const rel = c.xlsx || `data/valuation/${c.id}_모델.xlsx`;
  try {
    const meta = await STORE.meta(rel);
    if (!meta) { toast('아직 올라간 엑셀이 없습니다.'); return; }
    const sh = STORE.sharedItem(rel);
    const blob = await G.get(sh ? `${sh}/content` : `${STORE.path(rel)}:/content`, { type: 'blob' });
    v3SaveBlob(blob, `[유니버스인베스트먼트] ${c.target.name} 가치평가_${String(c.target.val_date || '').replace(/-/g, '').slice(2)}.xlsx`);
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; }
}
function v3SaveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
/* 바꾼 입력을 파일로: python -m v3.run run <사례> --override case_v3_override.json 이 받아 다시 계산 */
function v3Export(c) {
  const x = v3Model(c);
  if (!Object.keys(x.ov).length) { toast('바꾼 입력이 없습니다.'); return; }
  v3SaveBlob(new Blob([JSON.stringify({ id: c.id, name: c.name, generated_at: c.generated_at, overrides: x.ov, memo: x.st.memo || '' }, null, 2)], { type: 'application/json' }), 'case_v3_override.json');
}

async function renderV3(host) {
  await v3Load();
  if (!v3Cases().length) { // v3 사례가 없으면 예전 화면
    if (typeof renderDcf === 'function') return renderDcf(host);
    host.innerHTML = `<div class="card"><div class="empty">${esc(v3S.err || '아직 모델 평가가 없습니다.')}</div></div>`; return;
  }
  host.setAttribute('data-v3', '');
  v3Bind(host);
  const u = v3S.data?.updated_at ? new Date(v3S.data.updated_at) : null, upd = $('#va-upd');
  if (upd && u && !isNaN(u)) upd.textContent = `${u.getMonth() + 1}/${u.getDate()} ${pad(u.getHours())}:${pad(u.getMinutes())} 업데이트`;
  v3Draw();
}

// ---------- v3 차트: 입력 객체를 받아 SVG 문자열을 돌려주는 순수 함수 ----------
// 색과 글자 크기는 05_charts.css의 클래스로만 정함. 폭 o.w는 그릴 칸의 실제 px(글자가 줄지 않게), o.w < 560이면 좁은 배치.
// 공통 옵션: fmt(값 → 문자열, 없으면 천 단위 쉼표 정수), title(aria-label). 값이 null이면 그 칸은 건너뜀.
const V3C_BAR = ['s1', 's2', 's3', 's4', 's5'];
const V3C_LINE = ['s1', 's3', 's4', 's5', 's2'];
const V3C_PIE = ['s1', 's2', 's3', 's4', 's5', 's3 lt', 's4 lt', 's5 lt'];

function v3cOk(v) { return typeof v === 'number' && Number.isFinite(v); }
function v3cR(x) { return Math.round(x * 10) / 10; }
function v3cFix(x) { return +x.toPrecision(12); }
function v3cFmt(o) { return typeof o.fmt === 'function' ? o.fmt : (v) => (Math.round(v) || 0).toLocaleString('ko-KR'); }
function v3cClamp(x, a, b) { return b < a ? (a + b) / 2 : Math.min(Math.max(x, a), b); }

// 12px Pretendard 기준 글자 폭 어림(자리 잡기용, 조금 넉넉하게)
function v3cTw(s) {
  let w = 0;
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0);
    w += c >= 0x1100 ? 10.8 : c >= 48 && c <= 57 ? 7.1 : " .,:;'|!()".includes(ch) ? 3.6 : (c >= 65 && c <= 90) || '+~=#@&'.includes(ch) ? 8.2 : ch === '%' ? 10.2 : 6.4;
  }
  return w;
}
function v3cFit(s, max) {
  s = String(s ?? '');
  if (v3cTw(s) <= max) return s;
  let t = s;
  while (t.length > 1 && v3cTw(`${t}…`) > max) t = t.slice(0, -1);
  return `${t}…`;
}
// 두 줄까지 나눔: 띄어쓰기에서 먼저, 안 되면 글자 수로 자르고 넘치면 말줄임
function v3cWrap(s, max) {
  s = String(s ?? '');
  if (v3cTw(s) <= max) return [s];
  let best = null;
  for (let i = s.indexOf(' '); i > 0; i = s.indexOf(' ', i + 1)) {
    const a = s.slice(0, i), b = s.slice(i + 1), m = Math.max(v3cTw(a), v3cTw(b));
    if (m <= max && (!best || m < best.m)) best = { m, r: [a, b] };
  }
  if (best) return best.r;
  const hf = Math.ceil(s.length / 2);
  if (!s.includes(' ') && v3cTw(s.slice(0, hf)) <= max && v3cTw(s.slice(hf)) <= max) return [s.slice(0, hf), s.slice(hf)];
  let k = 1;
  while (k < s.length - 1 && v3cTw(s.slice(0, k + 1)) <= max) k++;
  return [s.slice(0, k), v3cFit(s.slice(k).trim(), max)];
}
// 눈금 간격: 1, 2, 2.5, 5, 10 배수
function v3cStep(span, n) {
  const raw = span / n;
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const m = 10 ** Math.floor(Math.log10(raw)), f = raw / m - 1e-9;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * m;
}
function v3cTicks(lo, hi, step) {
  const out = [];
  for (let k = Math.ceil(lo / step - 1e-9); k * step <= hi + step * 1e-9; k++) out.push(v3cFix(k * step));
  return out;
}
function v3cSvg(cls, w, h, label, body, fixed) {
  return `<svg class="v3c ${cls}" viewBox="0 0 ${v3cR(w)} ${v3cR(h)}" ${fixed ? `width="${v3cR(w)}" height="${v3cR(h)}"` : 'width="100%"'} role="img" aria-label="${esc(label)}">${body}</svg>`;
}
function v3cText(x, y, s, cls, anchor, tip) {
  return `<text x="${v3cR(x)}" y="${v3cR(y)}"${anchor ? ` text-anchor="${anchor}"` : ''} class="${cls}">${esc(s)}${tip ? `<title>${esc(tip)}</title>` : ''}</text>`;
}
// 막대 하나. ya가 기준선 쪽, yb가 값 쪽(둥근 끝). cut은 쌓기 조각 사이 틈
function v3cBar(x, ya, yb, bw, r, cut, cls, tip) {
  const s = yb <= ya ? 1 : -1;
  if (Math.abs(ya - yb) < 1) yb = ya - s;
  ya -= s * Math.min(cut, Math.abs(ya - yb) / 2);
  r = Math.min(r, bw / 2, Math.abs(ya - yb));
  const x1 = v3cR(x), x2 = v3cR(x + bw), a = v3cR(ya), b = v3cR(yb), q = v3cR(yb + s * r);
  const d = r > 0.5 ? `M${x1},${a}V${q}Q${x1},${b} ${v3cR(x + r)},${b}H${v3cR(x + bw - r)}Q${x2},${b} ${x2},${q}V${a}Z` : `M${x1},${a}V${b}H${x2}V${a}Z`;
  return `<path d="${d}" class="${esc(cls)}"><title>${esc(tip)}</title></path>`;
}
// 선 하나. pts는 {i, x, y, tip} 또는 null(끊김). fc부터는 점선과 빈 점
function v3cLine(pts, cls, dash, fc, dots) {
  let a = '', b = '', pa = false, pb = false;
  pts.forEach((p) => {
    if (!p) { pa = pb = false; return; }
    const c = `${p.x},${p.y}`;
    if (dash || p.i >= fc - 1) { b += (pb ? 'L' : 'M') + c; pb = true; }
    if (!dash && p.i < fc) { a += (pa ? 'L' : 'M') + c; pa = true; }
  });
  const c = esc(cls);
  return (a ? `<path d="${a}" class="ln ${c}"/>` : '') + (b ? `<path d="${b}" class="ln da ${c}"/>` : '')
    + (dots ? pts.filter(Boolean).map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" class="d ${c}${p.i >= fc ? ' fc' : ''}"><title>${esc(p.tip)}</title></circle>`).join('') : '');
}
// 표시선 라벨 자리 잡기. ms: [{x, text}] → 각자 sd(선의 오른쪽 1, 왼쪽 -1), lane(0이 그림 쪽)을 채우고 줄 수를 돌려줌
// 먼저 양옆으로 벌려 한 줄에 놓아 보고, 선이 남의 라벨을 지나가게 되면 모두 오른쪽에 붙여 계단처럼 쌓음
function v3cLanes(ms, w) {
  ms.forEach((m) => { m.tw = v3cTw(m.text) * 1.06; });
  const place = (both) => {
    const done = [];
    let bad = 0;
    [...ms].sort((p, q) => q.x - p.x).forEach((m) => {
      const fitR = m.x + 5 + m.tw <= w - 2, fitL = m.x - 5 - m.tw >= 2;
      const sides = both && fitR && fitL ? [1, -1] : [fitR || !fitL ? 1 : -1];
      let pick = null, soft = null;
      for (let k = 0; k <= done.length && !pick; k++) for (const sd of sides) {
        const a = sd > 0 ? m.x - 1 : m.x - 11 - m.tw, b = sd > 0 ? m.x + 11 + m.tw : m.x + 1;
        if (done.some((d) => (d.lane === k && d.a < b && d.b > a) || (d.lane >= k && d.m.x > a && d.m.x < b))) continue;
        const c = { m, lane: k, sd, a, b };
        if (done.some((d) => d.lane < k && m.x > d.a && m.x < d.b)) { soft = soft || c; continue; }
        pick = c;
        break;
      }
      if (!pick) bad++;
      done.push(pick || soft);
    });
    return { done, bad };
  };
  let r = place(true);
  if (r.bad) r = place(false);
  r.done.forEach((d) => { d.m.lane = d.lane; d.m.sd = d.sd; });
  return Math.max(0, ...r.done.map((d) => d.lane + 1));
}
// 줄 이름(왼쪽 칸). 좁은 폭에서는 두 줄까지 나눠 씀
function v3cRowLabel(s, cy, max, wrap, tip) {
  const ls = wrap ? v3cWrap(s, max) : [v3cFit(s, max)];
  return ls.map((t, j) => v3cText(1, cy + 4 + (j - (ls.length - 1) / 2) * 14, t, 'rl', '', tip)).join('');
}
// 세로 표시선과 라벨. top은 라벨 줄이 시작되는 y(그림 위 끝), bot은 선이 끝나는 y
function v3cMarks(ms, top, bot) {
  return ms.map((m) => {
    const ty = top - 7 - m.lane * 15, x = v3cR(m.x), c = esc(m.cls || '');
    return `<line x1="${x}" x2="${x}" y1="${v3cR(ty - 10)}" y2="${v3cR(bot)}" class="mk ${c}${m.dash ? ' da' : ''}"/>${v3cText(m.x + m.sd * 5, ty, m.text, `ml ${c}`, m.sd > 0 ? '' : 'end')}`;
  }).join('');
}

// 1. 막대(묶음 또는 쌓기) + 오른쪽 축 선
// o = {w, h=260, labels, bars:[{name, values, cls}], stack, lines:[{name, values, cls, dash}], lineFmt, fmt, fc, marks:[{i, label}], vals=true}
function v3cBars(o) {
  const w = o.w || 720, h = o.h || 260, nar = w < 560, fmt = v3cFmt(o);
  const lf = typeof o.lineFmt === 'function' ? o.lineFmt : (v) => `${v3cR(v * 100)}%`;
  const labels = o.labels || [], bars = o.bars || [], lines = o.lines || [], n = labels.length, fc = v3cOk(o.fc) ? o.fc : Infinity;
  const val = (s, i) => (v3cOk(s.values?.[i]) ? s.values[i] : null);
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    let p = 0, q = 0;
    bars.forEach((s) => {
      const v = val(s, i);
      if (v == null) return;
      if (o.stack) { if (v > 0) p += v; else q += v; } else { p = Math.max(p, v); q = Math.min(q, v); }
    });
    hi = Math.max(hi, p); lo = Math.min(lo, q);
  }
  // 왼쪽 축과 오른쪽 축은 0과 눈금선을 같이 씀(눈금 한 칸 = 왼쪽 stepL = 오른쪽 stepR)
  const noBar = hi === lo, stepL = noBar ? 1 : v3cStep(hi - lo, nar ? 3 : 4);
  let uLo = lo / stepL, uHi = hi / stepL, stepR = 0;
  const lv = lines.flatMap((s) => (s.values || []).filter(v3cOk));
  if (lv.length) {
    const rHi = Math.max(0, ...lv), rLo = Math.min(0, ...lv);
    if (noBar) stepR = v3cStep(rHi - rLo, nar ? 3 : 4);
    else { const cap = Math.max(uHi, -uLo); stepR = v3cStep(Math.max(rHi / (uHi > 0 ? uHi : cap), -rLo / cap), 1); }
    uHi = Math.max(uHi, rHi / stepR); uLo = Math.min(uLo, rLo / stepR);
  }
  const flat = uHi === uLo; // 값이 모두 0이면 0 기준선만
  if (flat) uHi = uLo + 1;
  const ks = [];
  for (let k = Math.ceil(uLo - 1e-9); k <= (flat ? uLo : uHi) + 1e-9; k++) ks.push(k);
  const lt = ks.map((k) => (noBar ? '' : fmt(v3cFix(k * stepL)))), rt = ks.map((k) => (stepR ? lf(v3cFix(k * stepR)) : ''));
  const P = { l: noBar ? 10 : Math.max(...lt.map(v3cTw)) + 10, r: stepR ? Math.max(...rt.map(v3cTw)) + 10 : 10, b: 26 };
  const bw = (w - P.l - P.r) / Math.max(n, 1), X = (i) => P.l + (i + 0.5) * bw;
  const ms = (o.marks || []).filter((m) => m && m.i >= 0 && m.i < n).map((m) => { const text = String(m.label ?? labels[m.i] ?? ''); return { ...m, text, x: X(m.i), dash: m.dash !== false }; });
  P.t = 20 + v3cLanes(ms, w) * 15;
  const y1 = h - P.b - (uLo < 0 ? 14 : 0), Y = (u) => P.t + (uHi - u) / (uHi - uLo) * (y1 - P.t);
  const hline = (k) => `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(Y(k))}" y2="${v3cR(Y(k))}" class="${k ? 'gl' : 'zl'}"/>`;
  const grid = ks.filter((k) => k).map(hline).join('') + ks.map((k, j) => (lt[j] ? v3cText(P.l - 6, Y(k) + 4, lt[j], 'yl', 'end') : '') + (rt[j] ? v3cText(w - P.r + 6, Y(k) + 4, rt[j], 'yl') : '')).join('');

  const k = o.stack ? 1 : Math.max(bars.length, 1), gap = k > 1 ? 2 : 0;
  const gw = Math.min(bw * (nar ? 0.76 : 0.64), k * 44 + (k - 1) * gap), b1 = Math.max(1, (gw - (k - 1) * gap) / k);
  const tops = [];
  let bs = '';
  for (let i = 0; i < n; i++) {
    const f = i >= fc ? ' fc' : '', lab = labels[i] ?? '';
    if (o.stack) {
      let p = 0, q = 0, any = false;
      bars.forEach((s, j) => {
        const v = val(s, i);
        if (v == null) return;
        any = true;
        if (!v) return;
        const a = v > 0 ? p : q;
        if (v > 0) p += v; else q += v;
        bs += v3cBar(X(i) - b1 / 2, Y(a / stepL), Y((a + v) / stepL), b1, 0, a ? 1.5 : 0, `b ${s.cls || V3C_BAR[j % 5]}${f}`, `${lab} ${s.name ?? ''} ${fmt(v)}`);
      });
      if (any) tops.push({ i, x: X(i), y: p + q >= 0 ? Y(p / stepL) - 5 : Y(q / stepL) + 14, text: fmt(p + q) });
    } else bars.forEach((s, j) => {
      const v = val(s, i);
      if (v == null) return;
      const x = X(i) - gw / 2 + j * (b1 + gap);
      bs += v3cBar(x, Y(0), Y(v / stepL), b1, 3, 0, `b ${s.cls || V3C_BAR[j % 5]}${f}`, `${lab} ${s.name ?? ''} ${fmt(v)}`);
      tops.push({ i, x: x + b1 / 2, y: v >= 0 ? Y(v / stepL) - 5 : Y(v / stepL) + 14, text: fmt(v) });
    });
  }
  // 값 라벨: 칸에 다 들어가면 모두, 아니면 격년(끝에서부터), 그래도 안 되면 생략
  let vs = '';
  if (o.vals !== false && tops.length) {
    const mw = Math.max(...tops.map((t) => v3cTw(t.text))), slot = k > 1 ? b1 + gap : bw;
    const ev = mw <= slot - 3 ? 1 : k === 1 && mw <= 2 * bw - 4 ? 2 : 0;
    if (ev) vs = tops.filter((t) => (n - 1 - t.i) % ev === 0).map((t) => v3cText(t.x, t.y, t.text, 'v', 'middle')).join('');
  }
  const dots = bw >= 14;
  const ls = lines.map((s, j) => v3cLine(Array.from({ length: n }, (_, i) => {
    const v = val(s, i);
    return v == null ? null : { i, x: v3cR(X(i)), y: v3cR(Y(v / stepR)), tip: `${labels[i] ?? ''} ${s.name ?? ''} ${lf(v)}` };
  }), s.cls || V3C_LINE[(j + 1) % 5], s.dash, fc, dots)).join('');
  const xw = Math.max(0, ...labels.map(v3cTw)), ev = Math.max(1, Math.ceil((xw + 8) / bw));
  const xs = labels.map((s, i) => ((n - 1 - i) % ev ? '' : v3cText(v3cClamp(X(i), v3cTw(s) / 2 + 1, w - v3cTw(s) / 2 - 1), h - 8, s, 'xl', 'middle'))).join('');
  const title = o.title || [...bars, ...lines].map((s) => s.name).filter(Boolean).join(', ') || '막대 차트';
  return v3cSvg(`v3c-bars${dots ? '' : ' dense'}`, w, h, title, grid + v3cMarks(ms, P.t - 14, y1) + bs + hline(0) + ls + vs + xs);
}

// 2. 선 여러 개(같은 축) + 가로 기준선
// o = {w, h=260, labels, lines:[{name, values, cls, dash}], hlines:[{v, label, cls}], fmt, xTicks, fc, zero}
function v3cLines(o) {
  const w = o.w || 720, h = o.h || 260, nar = w < 560, fmt = v3cFmt(o), labels = o.labels || [], lines = o.lines || [];
  const n = Math.max(labels.length, ...lines.map((s) => s.values?.length || 0)), fc = v3cOk(o.fc) ? o.fc : Infinity;
  const hs = (o.hlines || []).filter((x) => x && v3cOk(x.v)).map((x) => ({ ...x, text: String(x.label ?? fmt(x.v)) }));
  const all = [...lines.flatMap((s) => (s.values || []).filter(v3cOk)), ...hs.map((x) => x.v)];
  let lo = 0, hi = 0, ticks = [0];
  if (all.length) { lo = all.reduce((a, v) => Math.min(a, v), Infinity); hi = all.reduce((a, v) => Math.max(a, v), -Infinity); }
  if (lo === hi && !lo) hi = 1;
  else {
    if (lo === hi) { const p = Math.abs(lo) * 0.1; lo -= p; hi += p; }
    const sp = hi - lo;
    if (lo >= 0 && (o.zero || lo <= sp * 0.5)) lo = 0; else lo -= sp * 0.06;
    if (hi <= 0 && (o.zero || -hi <= sp * 0.5)) hi = 0; else hi += sp * 0.06;
    ticks = v3cTicks(lo, hi, v3cStep(hi - lo, nar ? 3 : 4));
  }
  const tl = ticks.map(fmt), gut = !nar && hs.length ? Math.max(...hs.map((x) => v3cTw(x.text))) + 12 : 0;
  const P = { l: Math.max(0, ...tl.map(v3cTw)) + 10, r: gut || 10, t: 14, b: 26 };
  const pw = w - P.l - P.r, dots = n === 1 || (n > 1 && pw / (n - 1) >= 14), ins = dots ? 6 : 0;
  const X = (i) => P.l + ins + (n > 1 ? i / (n - 1) : 0.5) * (pw - 2 * ins), Y = (v) => P.t + (hi - v) / (hi - lo) * (h - P.t - P.b);
  const grid = ticks.map((t, j) => `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(Y(t))}" y2="${v3cR(Y(t))}" class="${t ? 'gl' : 'zl'}"/>${v3cText(P.l - 6, Y(t) + 4, tl[j], 'yl', 'end')}`).join('');
  // 가로 기준선: 넓으면 오른쪽 바깥에, 좁으면 선 위 안쪽에 라벨. 서로 겹치면 위아래로 밀어냄
  hs.forEach((x) => { x.y = Y(x.v); x.ty = gut ? x.y + 4 : x.y - 5; });
  const so = [...hs].sort((p, q) => p.ty - q.ty);
  so.forEach((x, i) => {
    if (i && !gut && x.ty < so[i - 1].ty + 14) x.ty = x.y + 13;
    x.ty = Math.max(x.ty, i ? so[i - 1].ty + 14 : 11);
  });
  for (let i = so.length - 1; i >= 0; i--) so[i].ty = Math.min(so[i].ty, i === so.length - 1 ? h - P.b - 3 : so[i + 1].ty - 14);
  const hl = hs.map((x) => `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(x.y)}" y2="${v3cR(x.y)}" class="hl ${esc(x.cls || 's5')}"><title>${esc(`${x.text} ${fmt(x.v)}`)}</title></line>`).join('');
  const hx = hs.map((x) => (gut ? v3cText(w - P.r + 6, x.ty, x.text, `ml ${esc(x.cls || 's5')}`) : v3cText(w - P.r - 2, x.ty, x.text, `ml ${esc(x.cls || 's5')}`, 'end'))).join('');
  const ls = lines.map((s, j) => v3cLine(Array.from({ length: n }, (_, i) => {
    const v = s.values?.[i];
    return v3cOk(v) ? { i, x: v3cR(X(i)), y: v3cR(Y(v)), tip: `${labels[i] ?? ''} ${s.name ?? ''} ${fmt(v)}` } : null;
  }), s.cls || V3C_LINE[j % 5], s.dash, fc, dots)).join('');
  // 점이 촘촘하면 점 대신 칸마다 보이지 않는 띠를 깔아 값 툴팁을 줌
  const st = n > 1 ? pw / (n - 1) : pw;
  const hit = !dots && n <= 800 ? Array.from({ length: n }, (_, i) => {
    const tips = lines.map((s) => (v3cOk(s.values?.[i]) ? `${s.name ?? ''} ${fmt(s.values[i])}`.trim() : '')).filter(Boolean);
    return tips.length ? `<rect x="${v3cR(X(i) - st / 2)}" y="${P.t}" width="${v3cR(st)}" height="${h - P.t - P.b}" class="hit"><title>${esc(`${labels[i] ?? ''} ${tips.join(', ')}`.trim())}</title></rect>` : '';
  }).join('') : '';
  const xw = Math.max(0, ...labels.map(v3cTw));
  // x 라벨: 다 들어가면 모두, 점이 촘촘하면 고르게 m개, 그 사이면 끝에서부터 일정한 간격
  const m = Math.max(2, Math.min(n, Math.floor((pw - 2 * ins) / (xw + 12)) + 1, o.xTicks || (dots ? n : nar ? 4 : 8))), sd = Math.ceil((n - 1) / (m - 1));
  const idx = n <= 1 ? (n ? [0] : []) : m >= n ? labels.map((_, i) => i) : n >= 3 * m ? [...new Set(Array.from({ length: m }, (_, k) => Math.round(k * (n - 1) / (m - 1))))] : Array.from({ length: n }, (_, i) => i).filter((i) => (n - 1 - i) % sd === 0);
  const xs = idx.filter((i) => labels[i] != null).map((i) => v3cText(v3cClamp(X(i), v3cTw(labels[i]) / 2 + 1, w - v3cTw(labels[i]) / 2 - 1), h - 8, labels[i], 'xl', 'middle')).join('');
  const title = o.title || lines.map((s) => s.name).filter(Boolean).join(', ') || '선 차트';
  return v3cSvg(`v3c-lines${dots ? '' : ' dense'}`, w, h, title, grid + hl + ls + hit + hx + xs);
}

// 3. 폭포(가치 다리). kind: start(0에서 시작), add(더함), sub(뺌), total(누계. value를 주면 그 값)
// o = {w, h=280, items:[{label, value, kind}], fmt}
function v3cWaterfall(o) {
  const w = o.w || 720, h = o.h || 280, fmt = v3cFmt(o);
  let run = 0;
  const bs = (o.items || []).filter((it) => it && (v3cOk(it.value) || it.kind === 'total')).map((it) => {
    const kind = ['start', 'add', 'sub', 'total'].includes(it.kind) ? it.kind : it.value < 0 ? 'sub' : 'add';
    let a = 0;
    if (kind === 'start') run = it.value;
    else if (kind === 'total') run = v3cOk(it.value) ? it.value : run;
    else { a = run; run += kind === 'sub' ? -Math.abs(it.value) : it.value; }
    return { label: String(it.label ?? ''), kind, a, b: run };
  });
  const n = bs.length, lo = Math.min(0, ...bs.map((b) => Math.min(b.a, b.b)));
  let hi = Math.max(0, ...bs.map((b) => Math.max(b.a, b.b)));
  if (hi === lo) hi = lo + 1;
  const CLS = { start: 'st', add: 'ad', sub: 'sb', total: 'tt' }, title = o.title || '가치 다리';
  bs.forEach((b) => { const d = b.b - b.a; b.abs = b.kind === 'start' || b.kind === 'total'; b.text = b.abs ? fmt(b.b) : (d > 0 ? '+' : '') + fmt(d); });
  if (w < 560 && n > 4) { // 좁은 폭: 이름을 왼쪽에 두고 막대를 가로로(높이는 줄 수로 정해짐)
    const RH = 30, lc = Math.min(Math.max(...bs.map((b) => v3cTw(b.label))) + 12, w * 0.4), x1 = w - Math.max(...bs.map((b) => v3cTw(b.text))) - 8;
    const HX = (v) => lc + (v - lo) / (hi - lo) * Math.max(10, x1 - lc);
    const rows = bs.map((b, i) => {
      const xa = Math.min(HX(b.a), HX(b.b)), wd = Math.max(1, Math.abs(HX(b.a) - HX(b.b))), y = 4 + i * RH + 7;
      return v3cText(1, y + 12, v3cFit(b.label, lc - 8), 'rl', '', b.label)
        + `<rect x="${v3cR(xa)}" y="${y}" width="${v3cR(wd)}" height="16" rx="${Math.min(2, wd / 2)}" class="b ${CLS[b.kind]}"><title>${esc(`${b.label} ${b.text}`)}</title></rect>`
        + (i < n - 1 ? `<line x1="${v3cR(HX(b.b))}" x2="${v3cR(HX(b.b))}" y1="${y + 16}" y2="${y + RH}" class="cn"/>` : '') + v3cText(xa + wd + 5, y + 12, b.text, 'v');
    }).join('');
    return v3cSvg('v3c-wf', w, n * RH + 8, title, `<line x1="${v3cR(HX(0))}" x2="${v3cR(HX(0))}" y1="4" y2="${n * RH + 4}" class="zl"/>` + rows);
  }
  const P = { l: 6, r: 6, t: 22 }, bw = (w - P.l - P.r) / Math.max(n, 1), b1 = Math.min(bw * 0.62, 64), X = (i) => P.l + (i + 0.5) * bw;
  const wr = bs.map((b) => v3cWrap(b.label, bw - 6));
  P.b = wr.some((x) => x.length > 1) ? 40 : 26;
  const y1 = h - P.b - (lo < 0 ? 16 : 0), Y = (v) => P.t + (hi - v) / (hi - lo) * (y1 - P.t);
  let out = '';
  bs.forEach((b, i) => {
    const ya = Y(b.a), yb = Y(b.b), top = Math.min(ya, yb), ht = Math.max(1, Math.abs(ya - yb)), { abs, text } = b;
    out += `<rect x="${v3cR(X(i) - b1 / 2)}" y="${v3cR(top)}" width="${v3cR(b1)}" height="${v3cR(ht)}" rx="${Math.min(2, ht / 2)}" class="b ${CLS[b.kind]}"><title>${esc(`${b.label} ${text}`)}</title></rect>`;
    if (i < n - 1) out += `<line x1="${v3cR(X(i) + b1 / 2)}" x2="${v3cR(X(i + 1) - b1 / 2)}" y1="${v3cR(yb)}" y2="${v3cR(yb)}" class="cn"/>`;
    if (v3cTw(text) <= bw + 6) out += v3cText(X(i), abs && b.b < 0 ? top + ht + 14 : top - 5, text, 'v', 'middle');
    wr[i].forEach((s, j) => { out += v3cText(X(i), h - P.b + 18 + j * 14, s, 'xl', 'middle', wr[i].length > 1 ? b.label : ''); });
  });
  const zero = `<line x1="${P.l}" x2="${v3cR(w - P.r)}" y1="${v3cR(Y(0))}" y2="${v3cR(Y(0))}" class="zl"/>`;
  return v3cSvg('v3c-wf', w, h, title, zero + out);
}

// 4. 도넛. 조각 색은 cls가 없으면 s1부터 차례로. 8% 미만 조각은 비율 글자를 뺌(범례로)
// o = {w=220, items:[{label, value, cls}], center:[큰 글자, 작은 글자], fmt}
function v3cDonut(o) {
  const w = o.w || 220, c = w / 2, R = c - 1, r = R * 0.62, fmt = v3cFmt(o);
  const its = (o.items || []).filter((it) => it && v3cOk(it.value) && it.value > 0), sum = its.reduce((a, it) => a + it.value, 0);
  const pt = (rad, a) => `${v3cR(c + rad * Math.sin(a))},${v3cR(c - rad * Math.cos(a))}`;
  let a0 = 0;
  const sl = its.map((it, j) => {
    const f = it.value / sum, a1 = a0 + f * 2 * Math.PI, am = (a0 + a1) / 2, big = f > 0.5 ? 1 : 0, H = Math.PI;
    const d = f > 0.9999 ? `M${pt(R, 0)}A${R},${R} 0 1 1 ${pt(R, H)}A${R},${R} 0 1 1 ${pt(R, 0)}ZM${pt(r, 0)}A${r},${r} 0 1 0 ${pt(r, H)}A${r},${r} 0 1 0 ${pt(r, 0)}Z`
      : `M${pt(R, a0)}A${R},${R} 0 ${big} 1 ${pt(R, a1)}L${pt(r, a1)}A${r},${r} 0 ${big} 0 ${pt(r, a0)}Z`;
    a0 = a1;
    const pct = `${Math.round(f * 100)}%`, mid = (R + r) / 2;
    return `<g class="${esc(it.cls || V3C_PIE[j % V3C_PIE.length])}"><path d="${d}" class="sl"><title>${esc(`${it.label ?? ''} ${fmt(it.value)} (${v3cR(f * 100)}%)`)}</title></path>${f >= 0.08 && R - r >= 28 ? v3cText(c + mid * Math.sin(am), c - mid * Math.cos(am) + 4, pct, 'pl', 'middle') : ''}</g>`;
  }).join('');
  const none = sum > 0 ? '' : `<circle cx="${c}" cy="${c}" r="${v3cR((R + r) / 2)}" stroke-width="${v3cR(R - r)}" class="e0"/>`;
  const [c1, c2] = o.center || [];
  const mid = (c1 != null ? v3cText(c, c + (c2 != null ? 1 : 7), c1, 'c1', 'middle') : '') + (c2 != null ? v3cText(c, c + (c1 != null ? 20 : 4), c2, 'c2', 'middle') : '');
  return v3cSvg('v3c-donut', w, w, o.title || its.map((it) => it.label).filter(Boolean).join(', ') || '구성', none + sl + mid, true);
}

// 5. 히스토그램. band 안쪽 막대는 진하게, marks는 세로선과 위쪽 라벨
// o = {w, h=240, edges:[n+1], counts:[n], marks:[{x, label, cls, dash}], band:[lo, hi], fmt}
function v3cHist(o) {
  const w = o.w || 720, h = o.h || 240, nar = w < 560, fmt = v3cFmt(o), ed = o.edges || [];
  const n = Math.max(0, Math.min((o.counts || []).length, ed.length - 1)), cs = Array.from({ length: n }, (_, i) => (v3cOk(o.counts[i]) ? Math.max(0, o.counts[i]) : 0));
  const ms = (o.marks || []).filter((m) => m && v3cOk(m.x)).map((m) => ({ ...m, v: m.x, text: String(m.label ?? fmt(m.x)) }));
  let d0 = n ? ed[0] : 0, d1 = n ? ed[n] : 1;
  ms.forEach((m) => { d0 = Math.min(d0, m.v); d1 = Math.max(d1, m.v); });
  if (!(d1 > d0)) d1 = d0 + 1;
  const cm = Math.max(1, ...cs), tot = cs.reduce((a, b) => a + b, 0) || 1, P = { l: 10, r: 10, b: 26 };
  const X = (v) => P.l + (v - d0) / (d1 - d0) * (w - P.l - P.r);
  ms.forEach((m) => { m.x = X(m.v); });
  P.t = 8 + v3cLanes(ms, w) * 15;
  const y1 = h - P.b, Y = (c) => P.t + (1 - c / cm) * (y1 - P.t);
  const band = Array.isArray(o.band) && v3cOk(o.band[0]) && v3cOk(o.band[1]) ? o.band : null;
  const bars = cs.map((c, i) => {
    if (!c) return '';
    const xa = X(ed[i]), xb = X(ed[i + 1]), mid = (ed[i] + ed[i + 1]) / 2, on = !band || (mid >= band[0] && mid <= band[1]);
    return v3cBar(xa + 0.5, y1, Y(c), Math.max(1, xb - xa - 1), 2, 0, `b ${on ? 's1' : 's2'}`, `${fmt(ed[i])}～${fmt(ed[i + 1])}: ${c.toLocaleString('ko-KR')} (${v3cR(c / tot * 100)}%)`);
  }).join('');
  const xs = v3cTicks(d0, d1, v3cStep(d1 - d0, nar ? 3 : 5)).map((t) => {
    const s = fmt(t), x = X(t);
    return `<line x1="${v3cR(x)}" x2="${v3cR(x)}" y1="${y1}" y2="${y1 + 4}" class="zl"/>${v3cText(v3cClamp(x, v3cTw(s) / 2 + 1, w - v3cTw(s) / 2 - 1), h - 8, s, 'xl', 'middle')}`;
  }).join('');
  const zero = `<line x1="${P.l}" x2="${v3cR(w - P.r)}" y1="${y1}" y2="${y1}" class="zl"/>`;
  return v3cSvg('v3c-hist', w, h, o.title || '분포', bars + zero + xs + v3cMarks(ms, P.t, y1));
}

// 6. 풋볼필드(가로 범위 막대). mid는 굵은 눈금, marks는 세로선과 위쪽 라벨
// o = {w, rows:[{label, lo, hi, mid, cls, note}], marks:[{x, label, cls, dash}], fmt}
function v3cFootball(o) {
  const w = o.w || 720, nar = w < 560, fmt = v3cFmt(o), RH = 36;
  const rows = (o.rows || []).filter(Boolean).map((r) => { const ok = v3cOk(r.lo) && v3cOk(r.hi); return { ...r, ok, a: ok ? Math.min(r.lo, r.hi) : null, b: ok ? Math.max(r.lo, r.hi) : null }; });
  const ms = (o.marks || []).filter((m) => m && v3cOk(m.x)).map((m) => ({ ...m, v: m.x, text: String(m.label ?? fmt(m.x)) }));
  const all = [...rows.flatMap((r) => [r.a, r.b, r.mid]), ...ms.map((m) => m.v)].filter(v3cOk);
  let d0 = all.length ? Math.min(...all) : 0, d1 = all.length ? Math.max(...all) : 1;
  if (d0 === d1) { const p = Math.abs(d0) * 0.1 || 1; d0 -= p; d1 += p; }
  const two = !nar && rows.some((r) => r.note), okr = rows.filter((r) => r.ok);
  const lc = Math.min(Math.max(0, ...rows.map((r) => Math.max(v3cTw(r.label), two ? v3cTw(r.note) : 0))) + 14, nar ? 96 : 190);
  const el = Math.max(0, ...okr.map((r) => v3cTw(fmt(r.a)))) + 8, er = Math.max(0, ...okr.map((r) => v3cTw(fmt(r.b)))) + 8;
  const x0 = lc + el, x1 = Math.max(x0 + 10, w - er - 2), X = (v) => x0 + (v - d0) / (d1 - d0) * (x1 - x0);
  ms.forEach((m) => { m.x = X(m.v); });
  const top = 6 + v3cLanes(ms, w) * 15, bot = top + rows.length * RH, h = bot + 26;
  const grid = v3cTicks(d0, d1, v3cStep(d1 - d0, nar ? 2 : 4)).map((t) => {
    const s = fmt(t), x = X(t);
    return `<line x1="${v3cR(x)}" x2="${v3cR(x)}" y1="${top}" y2="${bot}" class="gl"/>${v3cText(v3cClamp(x, v3cTw(s) / 2 + 1, w - v3cTw(s) / 2 - 1), bot + 17, s, 'xl', 'middle')}`;
  }).join('');
  const body = rows.map((r, i) => {
    const cy = top + i * RH + RH / 2, cls = esc(r.cls || 's1'), lab = String(r.label ?? ''), note = r.note ? String(r.note) : '';
    const tip = `${lab}${r.ok ? ` ${fmt(r.a)}～${fmt(r.b)}` : ''}${v3cOk(r.mid) ? `, 중간 ${fmt(r.mid)}` : ''}${note ? `, ${note}` : ''}`;
    let s = two && note ? v3cText(1, cy - 3, v3cFit(lab, lc - 8), 'rl', '', tip) + v3cText(1, cy + 12, v3cFit(note, lc - 8), 'rn') : v3cRowLabel(lab, cy, lc - 8, nar, tip);
    if (r.ok) {
      const xa = X(r.a), xb = Math.max(X(r.b), xa + 2);
      s += `<rect x="${v3cR(xa)}" y="${cy - 7}" width="${v3cR(xb - xa)}" height="14" rx="3" class="rg ${cls}"><title>${esc(tip)}</title></rect>`
        + v3cText(xa - 6, cy + 4, fmt(r.a), 'v', 'end') + v3cText(xb + 6, cy + 4, fmt(r.b), 'v');
    }
    if (v3cOk(r.mid)) s += `<rect x="${v3cR(X(r.mid) - 1.5)}" y="${cy - 10}" width="3" height="20" rx="1.5" class="md ${cls}"><title>${esc(`${lab} 중간 ${fmt(r.mid)}`)}</title></rect>`;
    return s;
  }).join('');
  return v3cSvg('v3c-ff', w, h, o.title || '가치 범위 비교', grid + body + v3cMarks(ms, top, bot));
}

// 7. 토네이도. 폭이 큰 순으로 정렬, 기준보다 높은 쪽 up, 낮은 쪽 dn
// o = {w, base, rows:[{label, lo_label, hi_label, ps_lo, ps_hi}], fmt, baseLabel='기준'}
function v3cTornado(o) {
  const w = o.w || 720, nar = w < 560, fmt = v3cFmt(o), RH = 32, base = v3cOk(o.base) ? o.base : 0;
  const rows = (o.rows || []).filter((r) => r && (v3cOk(r.ps_lo) || v3cOk(r.ps_hi))).map((r) => {
    const es = [[r.ps_lo, r.lo_label], [r.ps_hi, r.hi_label]].filter(([v]) => v3cOk(v)).map(([v, t]) => ({ v, t: nar || t == null ? '' : String(t), name: t == null ? '' : String(t) })).sort((p, q) => p.v - q.v);
    const a = Math.min(base, es[0].v), b = Math.max(base, es[es.length - 1].v);
    return { label: String(r.label ?? ''), es, a, b, L: es[0].v < base ? es[0] : null, R: es[es.length - 1].v > base ? es[es.length - 1] : null };
  }).sort((p, q) => (q.b - q.a) - (p.b - p.a));
  let d0 = Math.min(base, ...rows.map((r) => r.a)), d1 = Math.max(base, ...rows.map((r) => r.b));
  if (d0 === d1) { const p = Math.abs(d0) * 0.1 || 1; d0 -= p; d1 += p; }
  const ew = (e) => (e ? v3cTw(fmt(e.v)) + (e.t ? v3cTw(e.t) + 5 : 0) : 0);
  const lc = Math.min(Math.max(0, ...rows.map((r) => v3cTw(r.label))) + 14, nar ? 96 : 190);
  const el = Math.max(0, ...rows.map((r) => ew(r.L))) + 8, er = Math.max(0, ...rows.map((r) => ew(r.R))) + 8;
  const x0 = lc + el, x1 = Math.max(x0 + 10, w - er - 2), X = (v) => x0 + (v - d0) / (d1 - d0) * (x1 - x0);
  const top = 24, bot = top + rows.length * RH, h = bot + 6, xb = X(base);
  const body = rows.map((r, i) => {
    const cy = top + i * RH + RH / 2;
    let s = v3cRowLabel(r.label, cy, lc - 8, nar, r.label);
    [...r.es].sort((p, q) => Math.abs(q.v - base) - Math.abs(p.v - base)).forEach((e) => {
      if (e.v === base) return;
      const x = X(e.v);
      s += `<rect x="${v3cR(Math.min(x, xb))}" y="${cy - 8}" width="${v3cR(Math.max(1, Math.abs(x - xb)))}" height="16" rx="2" class="b ${e.v > base ? 'up' : 'dn'}"><title>${esc(`${r.label} ${e.name} ${fmt(e.v)}`.replace(/\s+/g, ' '))}</title></rect>`;
    });
    if (r.L) s += `<text x="${v3cR(X(r.L.v) - 6)}" y="${cy + 4}" text-anchor="end" class="v">${r.L.t ? `<tspan class="sub">${esc(r.L.t)}</tspan> ` : ''}${esc(fmt(r.L.v))}</text>`;
    if (r.R) s += `<text x="${v3cR(X(r.R.v) + 6)}" y="${cy + 4}" class="v">${esc(fmt(r.R.v))}${r.R.t ? ` <tspan class="sub">${esc(r.R.t)}</tspan>` : ''}</text>`;
    return s;
  }).join('');
  const bt = `${o.baseLabel ?? '기준'} ${fmt(base)}`.trim(), tw = v3cTw(bt);
  const mid = `<line x1="${v3cR(xb)}" x2="${v3cR(xb)}" y1="${top - 6}" y2="${bot}" class="bl"/>${v3cText(v3cClamp(xb, tw / 2 + 2, w - tw / 2 - 2), 12, bt, 'ml', 'middle')}`;
  return v3cSvg('v3c-tor', w, h, o.title || '민감도 토네이도', body + mid);
}

// 8. 작은 막대 줄(표 칸 옆). 축 글자 없이 막대와 툴팁만, avg는 가로 점선
// o = {w=160, h=44, values, labels, cls='s2', avg, fmt}
function v3cSpark(o) {
  const w = o.w || 160, h = o.h || 44, fmt = v3cFmt(o), vs = o.values || [], n = vs.length, ok = vs.filter(v3cOk), av = v3cOk(o.avg) ? o.avg : null;
  const lo = Math.min(0, ...ok, av ?? 0);
  let hi = Math.max(0, ...ok, av ?? 0);
  if (hi === lo) hi = lo + 1;
  const Y = (v) => 2 + (hi - v) / (hi - lo) * (h - 4), bw = w / Math.max(n, 1), b1 = Math.max(1, Math.min(bw - 2, 14)), cls = o.cls || 's2';
  const bars = vs.map((v, i) => (v3cOk(v) ? v3cBar(i * bw + (bw - b1) / 2, Y(0), Y(v), b1, 1.5, 0, `b ${cls}`, `${o.labels?.[i] ?? ''} ${fmt(v)}`.trim()) : '')).join('');
  const zero = lo < 0 ? `<line x1="0" x2="${w}" y1="${v3cR(Y(0))}" y2="${v3cR(Y(0))}" class="zl"/>` : '';
  const avg = av == null ? '' : `<line x1="0" x2="${w}" y1="${v3cR(Y(av))}" y2="${v3cR(Y(av))}" class="av"><title>${esc(`평균 ${fmt(av)}`)}</title></line>`;
  return v3cSvg('v3c-spark', w, h, o.title || '추이', bars + zero + avg, true);
}

// 9. 범례(SVG 밖 HTML). kind: bar(기본), line, dash, fc(추정 막대)
function v3cLegend(items) {
  return `<div class="v3c-leg">${(items || []).filter(Boolean).map((it) => `<span class="${esc(it.cls || 's1')} k-${['line', 'dash', 'fc'].includes(it.kind) ? it.kind : 'bar'}">${esc(it.label)}</span>`).join('')}</div>`;
}

// ---------- 입력 탭 1～3단계: 매출액, 매출원가, 판관비 (v3r*) ----------
// 세 단계 모두 「연도 표 한 장 + 참고 데이터」. 표는 The Modellers 시트처럼 줄마다 금액 줄과 그 줄을 정하는 가정 줄을 붙여 놓고, 가정이 들어가는 칸만 입력 칸.
// 줄, 묶음, 판관비 묶음, 연도 수는 사례에서 읽음(x.I.revbuild, x.R 의 OPX.sga.<묶음>.pct 행, x.tl). 펴 둔 근거는 x.st.v3r.open 에 기억.
const V3R_DRV = { growth: '성장률', price_volume: '수량과 단가', market_share: '시장 점유율', units_x_per: '단위 수와 단위당 매출', capacity: '생산능력과 가동률', backlog: '수주 잔고', share_of: '기준 줄 대비', fixed: '고정', manual: '직접 입력' };
const V3R_VAR = { g: ['성장률', 'pct'], val: ['직접 입력', 'amt'], g_vol: ['수량 증가율', 'pct'], g_price: ['단가 상승률', 'pct'], mkt: ['시장 규모', 'amt'], share: ['점유율', 'pct'], net_ratio: ['순매출 비율', 'pct'], fx: ['환율', 'num'], units: ['단위 수', 'num'], per_unit: ['단위당 매출', 'num'], cap: ['생산능력', 'num'], util: ['가동률', 'pct'], price: ['단가', 'num'], ratio: ['기준 줄 대비', 'pct'] };
const V3R_SGA = { pct_sales: '매출 비례', cpi: '물가 연동', labor: '인원 방식', schedule: '스케줄', per_line: '특정 줄 대비', manual: '직접 입력' };
const V3R_BAR = ['s1', 's2', 's4', 's4 lt', 's3 lt'];

const v3rO = (k, h) => `<span data-o="${esc(k)}">${h}</span>`;                 // 입력하는 동안 값만 바뀌는 칸
const v3rN = (v, d = 0) => (v3Ok(v) ? v3Num(v, d) : '');                        // 금액 칸(없으면 빈칸)
const v3rP = (v, d = 1) => (v3Ok(v) ? v3Num(v * 100, d) : '');                  // 비율 칸(% 기호 없이. 줄 이름에 단위)
const v3rPick = (d, S) => (d == null || typeof d !== 'object' || Array.isArray(d) || !V3_SCEN.some((k) => k in d) ? d : S in d ? d[S] : 'Base' in d ? d.Base : d[Object.keys(d)[0]]);
const v3rSide = (x) => (x.w >= 1000 ? 316 : 0);
const v3rMeta = (x) => `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc} 가정, 단위 억원</span>`;
const v3rAsk = (list) => `<p class="v3r-ask"><span>살펴볼 것</span>${list.map((s) => `<i>${esc(s)}</i>`).join('')}</p>`;
const v3rIsOpen = (x, id) => !!x.st.v3r?.open?.[id];
const v3rHi = (x) => { const a = x.tl.hist.map((_, i) => i); return x.w < 620 ? a.slice(-2) : a; };   // 좁은 화면에서는 과거 두 해만(입력 칸이 먼저 보이게)

/* v3Sw 에 「이 사례에서 쓸 수 없는 값」을 더한 것. opts [[값, 이름, 쓸 수 없는 까닭]]. 까닭이 있는 단추는 눌리지 않음 */
function v3rSw(x, key, opts, cur) {
  const j = JSON.stringify(cur ?? null);
  return `<div class="mk-seg">${opts.map(([v, l, no]) => { const on = JSON.stringify(v ?? null) === j; return `<button type="button" data-v3-ov="${esc(key)}" data-v="${esc(JSON.stringify(v ?? null))}" class="${on ? 'on' : ''}" aria-pressed="${on}"${no && !on ? ` disabled title="${esc(no)}"` : ''}>${esc(l)}</button>`; }).join('')}</div>`;
}

/* 표 틀: 첫 열(이름) + 과거 열(hi 번호만) + 가운데 열(mid: FY1 누적, 남은 분기) + 추정 열 */
function v3rT(x, { hi, mid = [] } = {}) {
  const hs = x.tl.hist, fs = x.tl.fc, idx = hi || hs.map((_, i) => i);
  const head = `<thead><tr><th class="st"></th>${idx.map((i) => `<th>${hs[i]}</th>`).join('')}${mid.map((m, j) => `<th class="${j ? '' : 'bl'}" title="${esc(m.tip || '')}">${esc(m.label)}</th>`).join('')}${fs.map((y, i) => `<th class="${i === 0 && !mid.length && idx.length ? 'bl' : ''}">${y}E</th>`).join('')}</tr></thead>`;
  return { hi: idx, mid, fs, H: hs.length, n: 1 + idx.length + mid.length + fs.length, head };
}
/* 표 한 줄. h 과거 칸(H개), m 가운데 칸, f 추정 칸. 칸 안에 입력 칸이 있으면 td.in. o 를 주면 줄 전체가 계산 결과 */
function v3rTr(T, { cls = '', st = '', h = [], m = [], f = [], o = '' }) {
  const td = (s, c) => { const t = s == null ? '' : String(s); return `<td class="${c}${t.includes('class="v3-ci"') ? ' in' : ''}">${t}</td>`; };
  return `<tr class="${cls}"${o ? ` data-o="${esc(o)}"` : ''}><td class="st">${st}</td>${T.hi.map((i) => td(h[i], 'h')).join('')}${T.mid.map((_, j) => td(m[j], j ? '' : 'bl')).join('')}${T.fs.map((_, i) => td(f[i], i === 0 && !T.mid.length && T.hi.length ? 'bl' : '')).join('')}</tr>`;
}
/* 계산 행 한 줄(hist+fc 또는 fc 행). pct 비율, sign 부호, dash 없는 값을 - 로 */
function v3rRow(x, T, id, { name = '', cls = '', pct = false, d, sign = false, dash = false, nz = false } = {}) {
  const a = x.R[id]; if (!a) return '';
  const off = a.length > T.fs.length ? T.H : 0;
  const f = (v) => (v3Ok(v) && !(nz && Math.abs(v) < 0.05) ? `${sign && v > 0 ? '+' : ''}${pct ? v3Num(v * 100, d ?? 1) : v3Num(v, d ?? 0)}` : dash ? '-' : '');
  return v3rTr(T, { cls, o: `r.${id}`, st: name, h: off ? a.slice(0, T.H).map((v) => f(v)) : [], f: T.fs.map((_, i) => f(a[off + i])) });
}
const v3rSub = (name, unit = '%', d = 0) => `<div class="v3r-c sub d${d}">${esc(name)}${unit ? `<small>${unit}</small>` : ''}</div>`;
/* 이름 칸: 근거가 있으면 눌러서 펴는 단추 */
function v3rName(x, id, name, why, kind = '', d = 0, tail = '') {
  const nm = why ? `<button type="button" class="v3r-nm" data-v3r-open="${esc(id)}" aria-expanded="${v3rIsOpen(x, id)}">${esc(name)}</button>` : `<b>${esc(name)}</b>`;
  return `<div class="v3r-c d${d}">${nm}${kind ? `<small>${esc(kind)}</small>` : ''}${tail}</div>`;
}
/* 근거 줄: 접으면 한 줄, 펴면 전문과 덧붙일 내용(extra). 표가 옆으로 밀려도 글은 보이는 폭에 머묾 */
function v3rNote(x, T, id, why, extra = '') {
  if (!why && !extra) return '';
  const open = v3rIsOpen(x, id);
  const p = !why ? '' : open ? `<p class="v3r-full" data-v3r-open="${esc(id)}">${esc(why)}</p>` : `<div data-v3r-open="${esc(id)}">${v3Why(why)}</div>`;
  return `<tr class="v3r-n"><td colspan="${T.n}"><div class="v3r-nd">${p}${open || !why ? extra : ''}</div></td></tr>`;
}
const v3rTable = (T, rows, cls = '') => `<div class="mk-scroll v3r-sc"><table class="mk-tbl v3-t v3r-t ${cls}">${T.head}<tbody>${rows}</tbody></table></div>`;
/* 세 시나리오를 추정 연도별로 견주는 작은 표 */
function v3rScen(x, id, okey, { pct = true, d } = {}) {
  const fs = x.tl.fc, H = x.tl.H;
  const cell = (s, i) => { const a = v3Row(x, id, s) || [], v = a[a.length > fs.length ? H + i : i]; return v3Ok(v) ? (pct ? v3Pct(v, d ?? 1) : v3Num(v, d ?? 0)) : '-'; };
  return `<div class="mk-scroll" data-o="${esc(okey)}"><table class="mk-tbl v3-t v3r-t v3r-s"><thead><tr><th class="st"></th>${fs.map((y) => `<th>${y}E</th>`).join('')}</tr></thead><tbody>${V3_SCEN.map((s) => `<tr class="${s === x.sc ? 'sum' : ''}"><td class="st"><span class="v3-dot ${s}"></span>${s}</td>${fs.map((_, i) => `<td>${cell(s, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/* 쌓은 막대 계열: 마디가 색 수보다 많으면 마지막 값이 큰 넷만 두고 나머지는 「그 밖」 */
function v3rStack(R, nodes, n) {
  const vals = (nd) => Array.from({ length: n }, (_, i) => (v3Ok(R[nd.row]?.[i]) ? R[nd.row][i] : null));
  const last = (nd) => { const a = vals(nd).filter(v3Ok); return a.length ? Math.abs(a[a.length - 1]) : 0; };
  const keep = nodes.length <= V3R_BAR.length ? nodes : nodes.filter((nd) => [...nodes].sort((a, b) => last(b) - last(a)).slice(0, 4).includes(nd));
  const out = keep.map((nd, j) => ({ name: nd.name, values: vals(nd), cls: V3R_BAR[j] }));
  const rest = nodes.filter((nd) => !keep.includes(nd)).map(vals);
  if (rest.length) out.push({ name: '그 밖', cls: 's5', values: Array.from({ length: n }, (_, i) => { const a = rest.map((v) => v[i]).filter(v3Ok); return a.length ? a.reduce((s, v) => s + v, 0) : null; }) });
  return out;
}

// ---------- 1단계 매출액 ----------
/* 줄의 시나리오별 값 한 칸(fy0, fy1_override)을 고치는 입력. {시나리오: 값} 꼴이면 고른 시나리오 칸, 숫자면 그 값 */
function v3rLineIn(x, idx, field, lab, cell) {
  const s0 = x.c.input.revbuild?.lines?.[idx]?.[field], obj = s0 != null && typeof s0 === 'object';
  return v3In(x, `i.revbuild.lines.${idx}.${field}${obj ? `.${x.sc}` : ''}`, v3rPick(s0, x.sc), { fmt: 'amt', cell, lab });
}
function v3rRevTable(x) {
  const I = x.I, R = x.R, S = x.sc, rb = I.revbuild || {}, lines = rb.lines || [], groups = rb.groups || [], { H, N } = x.tl;
  const ytdOn = x.sw.fy1_mode === 'ytd_plus_rest';
  const ytd = (id) => { const v = I.ytd?.[`REV.l.${id}.val`]; return v3Ok(v) ? v : null; };
  const hasMid = N > 0 && lines.some((l) => ytd(l.id) != null), q = +x.tl.fy1_ytd_quarters || 0, y1 = x.tl.fc[0];
  const mid = hasMid ? [{ label: q > 1 && q < 4 ? `1～${q}분기` : q === 1 ? '1분기' : '누적', tip: `${y1}년 누적 실적` }, { label: q === 3 ? '4분기E' : q > 0 && q < 3 ? `${q + 1}～4분기E` : '남은 기간E', tip: `${y1}년 남은 기간 추정` }] : [];
  // 좁은 화면에서는 줄 실적이 있는 해부터(적어도 최근 두 해)
  const anyH = (i) => lines.some((l) => v3Ok(R[`REV.l.${l.id}.val`]?.[i])) || groups.some((g) => v3Ok(R[`REV.g.${g.id}.val`]?.[i]));
  let hi = x.tl.hist.map((_, i) => i);
  if (x.w < 620) { const f = hi.find(anyH); hi = hi.slice(Math.max(0, Math.min(f ?? H, H - 2))); }
  const T = v3rT(x, { hi, mid });
  const gids = new Set(groups.map((g) => g.id));
  const kids = (gid) => groups.filter((g) => g.parent === gid), own = (gid) => lines.filter((l) => l.group === gid);
  const gYtd = (gid) => { const a = [...own(gid).map((l) => ytd(l.id)), ...kids(gid).map((g) => gYtd(g.id))]; return a.length && a.every((v) => v != null) ? a.reduce((s, v) => s + v, 0) : null; };
  const pos = (g) => Math.min(lines.length, ...own(g.id).map((l) => lines.indexOf(l)), ...kids(g.id).map(pos));
  const ordered = (ls, gs, d) => [...ls.map((l) => ({ i: lines.indexOf(l), l })), ...gs.map((g) => ({ i: pos(g), g }))].sort((a, b) => a.i - b.i).map((n) => (n.l ? lineRows(n.l, d) : groupRows(n.g, d))).join('');

  function lineRows(ln, d) {
    const id = ln.id, idx = lines.indexOf(ln), rid = `REV.l.${id}`, v = R[`${rid}.val`] || [], g = R[`${rid}.g`] || [], oid = `rev.${id}`;
    const A = (k) => R[`CTL.a.rev.${id}.${k}`] || [], keys = Object.keys(ln.a || {}).filter((k) => R[`CTL.a.rev.${id}.${k}`]);
    const y = ytd(id), fix = ytdOn && y != null && v3Ok(v3rPick(ln.fy1_override, S));   // 첫해 = 누적 실적 + 남은 분기 직접 입력(그해 가정 칸은 쓰이지 않음)
    const est = !v3Ok(I.hist?.[`${rid}.val`]?.[H - 1]) && v3Ok(v3rPick(ln.fy0, S));
    const inV = ln.type === 'manual' && keys.includes('val'), inG = ln.type === 'growth' && keys.includes('g');
    // 입력값과 반영된 값이 다르면(전체 성장률 가산, 컨센서스 맞춤) 반영된 값을 입력 칸 아래 작게
    const ap = (k, res, inp, pct) => v3rO(k, v3Ok(res) && v3Ok(inp) && Math.abs(res - inp) > (pct ? 0.00005 : 0.05) ? `<small>${pct ? v3rP(res) : v3rN(res)}</small>` : '');
    const why = ln.why || v3Note(x, `rev.${id}`);
    const rowA = v3rTr(T, { cls: 'v3r-a',
      st: v3rName(x, oid, ln.name || id, why, inG ? '' : V3R_DRV[ln.type] || ln.type, d),
      h: v.slice(0, H).map((a, i) => (est && i === H - 1 ? `<i class="v3r-est" title="${esc(ln.fy0_why || '추정 출발')}">${v3rO(`r1.${id}.h0`, v3rN(a))}</i>` : v3rN(a))),
      m: [v3rN(y), fix ? v3rLineIn(x, idx, 'fy1_override', `${ln.name} ${mid[1]?.label || ''}`, true) : y != null && ytdOn ? v3rO(`r1.${id}.q`, v3rN(v[H] - y)) : ''],
      f: T.fs.map((_, i) => (inV && !(fix && i === 0) ? v3ACell(x, `rev.${id}.val`, i, 'amt', S, ln.name) + ap(`r1.${id}.av${i}`, v[H + i], A('val')[i]) : v3rO(`r1.${id}.v${i}`, v3rN(v[H + i])))) });
    const vars = keys.filter((k) => !(inV && k === 'val') && !(inG && k === 'g')).map((k) => {
      const fmt = x.lab[`CTL.a.rev.${id}.${k}`]?.fmt || V3R_VAR[k]?.[1] || 'num', nm = V3R_VAR[k]?.[0] || k;
      return v3rTr(T, { cls: 'v3r-b', st: v3rSub(nm, fmt === 'pct' ? '%' : '', d), f: T.fs.map((_, i) => v3ACell(x, `rev.${id}.${k}`, i, fmt, S, `${ln.name} ${nm}`)) });
    }).join('');
    const extra = est ? `<div class="v3r-x"><label class="v3-f"><span>${x.tl.hist[H - 1]}년 출발값</span>${v3rLineIn(x, idx, 'fy0', `${ln.name} 출발값`, false)}</label>${ln.fy0_why ? `<p>${esc(ln.fy0_why)}</p>` : ''}</div>` : '';
    const note = v3rNote(x, T, oid, why, extra);
    const rowB = v3rTr(T, { cls: `v3r-b${note ? '' : ' end'}`, st: v3rSub(inG ? '성장률' : '전년 대비', '%', d), h: g.slice(0, H).map((a, i) => (est && i === H - 1 ? '<span class="v3r-tagw"><span class="v3r-tag">추정 출발</span></span>' : v3rP(a))),
      f: T.fs.map((_, i) => (inG && !(fix && i === 0) ? v3ACell(x, `rev.${id}.g`, i, 'pct', S, `${ln.name} 성장률`) + ap(`r1.${id}.ag${i}`, g[H + i], A('g')[i], 1) : v3rO(`r1.${id}.g${i}`, v3rP(g[H + i])))) });
    return rowA + vars + rowB + note;
  }
  function groupRows(g, d) {
    const v = R[`REV.g.${g.id}.val`] || [], y = gYtd(g.id);
    return v3rTr(T, { cls: `v3r-g d${d}`, o: `r1.g.${g.id}`, st: `<div class="v3r-c d${d}"><b>${esc(g.name || g.id)}</b></div>`, h: v.slice(0, H).map((a) => v3rN(a)), m: [v3rN(y), y != null && ytdOn ? v3rN(v[H] - y) : ''], f: T.fs.map((_, i) => v3rN(v[H + i])) })
      + ordered(own(g.id), kids(g.id), d + 1);
  }
  let rows = ordered(lines.filter((l) => !l.group || !gids.has(l.group)), groups.filter((g) => !g.parent || !gids.has(g.parent)), 0);
  const tot = R['REV.total'] || [], ys = v3Ok(v3V(x, 'REV.ytd')) ? v3V(x, 'REV.ytd') : null;
  rows += v3rTr(T, { cls: 'key', o: 'r1.tot', st: '<b>매출 합계</b>', h: tot.slice(0, H).map((a) => v3rN(a)), m: [v3rN(ys), ys != null && ytdOn ? v3rN(tot[H] - ys) : ''], f: T.fs.map((_, i) => v3rN(tot[H + i])) });
  rows += v3rRow(x, T, 'REV.growth', { name: v3rSub('전년 대비'), cls: 'v3r-b end', pct: true });
  if ((R['REV.resid'] || []).some((a) => v3Ok(a) && Math.abs(a) >= 0.05)) rows += v3rRow(x, T, 'REV.resid', { name: '체계 차이', cls: 'end', d: 1, nz: true });
  if ((R['REV.cons'] || []).some(v3Ok)) rows += v3rRow(x, T, 'REV.cons', { name: '컨센서스', dash: true }) + v3rRow(x, T, 'REV.cons_gap', { name: '컨센서스 대비', cls: 'end', sign: true, dash: true });

  const opt = [];
  if (hasMid) opt.push(['첫해 매출', v3Sw(x, 'sw.fy1_mode', [['ytd_plus_rest', '누적 실적 + 남은 분기'], ['full', '연간 추정']], x.sw.fy1_mode)]);
  if ((I.cons?.rev || []).some(v3Ok)) opt.push(['컨센서스 맞춤', v3Sw(x, 'sw.cons_anchor', [['off', '안 함'], ['fy1', '첫해'], ['fy1_fy2', '첫해와 다음 해']], x.sw.cons_anchor)]);
  if (Math.abs((R['REV.resid'] || [])[H - 1] || 0) >= 0.5) opt.push(['체계 차이', v3Sw(x, 'sw.resid_fwd', [['zero', '추정에서 0'], ['hold_share', '비중 유지']], x.sw.resid_fwd)]);
  opt.push(['전체 성장률 가산', v3In(x, 'o.growth_add', 0, { fmt: 'pct', u: '%p', lab: '전체 매출 성장률 가산' })]);
  return `${v3rAsk(['TTM', '최근 3～5년 평균', '가이던스', '산업 평균', '이벤트'])}${v3rTable(T, rows)}<div class="v3-opt v3r-opt">${opt.map(([l, h]) => `<div><span>${l}</span>${h}</div>`).join('')}</div>`;
}
function v3rRevRef(x) {
  const R = x.R, rb = x.I.revbuild || {}, lines = rb.lines || [], groups = rb.groups || [], { H, N } = x.tl, n = H + N;
  const two = x.w > 620, w1 = v3Wd(x, 1, v3rSide(x)), w2 = v3Wd(x, two ? 2 : 1, v3rSide(x));
  const labels = v3Years(x, 'hist+fc').map((y) => y.label), tot = R['REV.total'] || [], fmt = (v) => v3Num(v);
  const gids = new Set(groups.map((g) => g.id));
  const top = [...groups.filter((g) => !g.parent || !gids.has(g.parent)).map((g) => ({ name: g.name || g.id, row: `REV.g.${g.id}.val` })), ...lines.filter((l) => !l.group || !gids.has(l.group)).map((l) => ({ name: l.name || l.id, row: `REV.l.${l.id}.val` }))];
  const ser = v3rStack(R, top, n);
  const none = Array.from({ length: n }, (_, i) => (ser.every((s) => s.values[i] == null) && v3Ok(tot[i]) ? tot[i] : null));
  const bars = none.some((v) => v != null) && ser.length ? [...ser, { name: '사업부 구분 없음', values: none, cls: 's5 lt' }] : ser.length ? ser : [{ name: '매출', values: tot.slice(0, n), cls: 's2' }];
  const c1 = v3cBars({ w: w1, h: 240, labels, bars, stack: true, fc: H, fmt, title: '사업부별 매출' });
  const leg1 = v3cLegend([...bars.map((s) => ({ label: s.name, cls: s.cls })), { label: '추정', cls: 's2', kind: 'fc' }]);
  // 세 시나리오 합계와 컨센서스(같은 축)
  const cons = R['REV.cons'] || [], hasC = cons.some(v3Ok);
  const ls = [{ name: '실적', values: tot.map((v, i) => (i < H ? v : null)), cls: 's5' }, ...V3_SCEN.map((s) => ({ name: s, values: (v3Row(x, 'REV.total', s) || []).map((v, i) => (i >= H - 1 ? v : null)), cls: s.toLowerCase() })),
    ...(hasC ? [{ name: '컨센서스', values: [...Array(H).fill(null), ...cons], cls: 's1', dash: true }] : [])];
  const c2 = v3cLines({ w: w2, h: 220, labels, lines: ls, fmt, title: '시나리오별 매출 합계와 컨센서스' });
  const leg2 = v3cLegend([{ label: '실적', cls: 's5', kind: 'line' }, ...V3_SCEN.map((s) => ({ label: s, cls: s.toLowerCase(), kind: 'line' })), hasC && { label: '컨센서스', cls: 's1', kind: 'dash' }]);
  // 직전 실적 연도 구성
  const its = ser.map((s) => ({ label: s.name, value: s.values[H - 1], cls: s.cls })).filter((it) => v3Ok(it.value) && it.value > 0), sum = its.reduce((s, it) => s + it.value, 0);
  const donut = its.length > 1 ? `<div><h3 class="v3-h3">${x.tl.hist[H - 1]}년 매출 구성</h3><div class="v3r-dn">${v3cDonut({ w: 168, items: its, center: [v3Num(sum), '억원'], fmt })}${v3cLegend(its.map((it) => ({ label: `${it.label} ${v3Pct(it.value / sum)}`, cls: it.cls })))}</div></div>` : '';

  // 줄별: 과거 성장률(값 있는 해만), 매출 비중, 시나리오별 마지막 해 매출
  const gy = x.tl.hist.map((_, i) => i).filter((i) => lines.some((l) => v3Ok(R[`REV.l.${l.id}.g`]?.[i]))), L = H + N - 1, yL = x.tl.fc[N - 1];
  const mean = (a) => { const b = a.filter(v3Ok); return b.length ? b.reduce((s, v) => s + v, 0) / b.length : null; };
  const avg = gy.length > 1;
  const tr = (key, name, g, sh0, shL, scen, cls = '') => `<tr class="${cls}" data-o="${esc(key)}"><td class="st">${name}</td>${gy.map((i) => `<td class="h">${v3Ok(g[i]) ? v3Pct(g[i]) : ''}</td>`).join('')}${avg ? `<td class="h">${v3Ok(mean(gy.map((i) => g[i]))) ? v3Pct(mean(gy.map((i) => g[i]))) : ''}</td>` : ''}<td class="bl">${v3Ok(sh0) ? v3Pct(sh0) : ''}</td><td>${v3Ok(shL) ? v3Pct(shL) : ''}</td>${scen.map((v, j) => `<td class="${j ? '' : 'bl'}${V3_SCEN[j] === x.sc ? ' v3r-on' : ''}">${v3Ok(v) ? v3Num(v) : '-'}</td>`).join('')}</tr>`;
  const body = N < 1 ? '' : lines.map((l) => { const rid = `REV.l.${l.id}`; return tr(`r1.cmp.${l.id}`, esc(l.name || l.id), R[`${rid}.g`] || [], R[`${rid}.share`]?.[H - 1], R[`${rid}.share`]?.[L], V3_SCEN.map((s) => v3V(x, `${rid}.val`, L, s))); }).join('')
    + tr('r1.cmp.tot', '<b>매출 합계</b>', R['REV.growth'] || [], null, null, V3_SCEN.map((s) => v3V(x, 'REV.total', L, s)), 'sum');
  const cmp = !body ? '' : `<h3 class="v3-h3">줄별 비교</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3r-t v3r-cmp"><thead>
      <tr><th class="st" rowspan="2"></th>${gy.length ? `<th colspan="${gy.length + (avg ? 1 : 0)}">과거 성장률</th>` : ''}<th class="bl" colspan="2">매출 비중</th><th class="bl" colspan="${V3_SCEN.length}">${yL}E 매출</th></tr>
      <tr>${gy.map((i) => `<th>${x.tl.hist[i]}</th>`).join('')}${avg ? '<th>평균</th>' : ''}<th class="bl">${x.tl.hist[H - 1]}</th><th>${yL}E</th>${V3_SCEN.map((s, j) => `<th class="${j ? '' : 'bl'}${s === x.sc ? ' v3r-on' : ''}">${s}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  return `<h3 class="v3-h3">사업부별 매출</h3>${leg1}<div data-o="r1.c1">${c1}</div>
    <div class="v3-two v3r-two"><div><h3 class="v3-h3">합계와 컨센서스</h3>${leg2}<div data-o="r1.c2">${c2}</div></div>${donut}</div>${cmp}`;
}
function v3rRev(x) {
  return v3Sec('사업부 매출', v3rMeta(x), v3rRevTable(x), 'v3r') + v3Sec('참고 데이터', '<span class="meta">단위 억원</span>', v3rRevRef(x), 'v3r');
}

// ---------- 2단계 매출원가 ----------
function v3rCogs(x) {
  const R = x.R, S = x.sc, { H } = x.tl, mode = x.sw.cogs_mode, lines = x.I.revbuild?.lines || [], T = v3rT(x, { hi: v3rHi(x) });
  const find = (re) => Object.keys(R).filter((k) => re.test(k)).map((k) => k.slice(6));
  const segK = find(/^CTL\.a\.cogs_r\../), ucK = find(/^CTL\.a\.ucost\../), lname = (id) => lines.find((l) => l.id === id)?.name || id;
  const keys = ({ ratio: ['cogs_r'], seg_ratio: [...segK, 'cogs_r'], gpm_step: ['gpm_step'], unit_cost: [...ucK, ...segK, 'cogs_r'], components: ['cogs_mat_pct', 'cogs_other_pct'] }[mode] || ['cogs_r']).filter((k) => R[`CTL.a.${k}`]);
  const item = (k) => {
    if (k === 'cogs_r') return { name: mode === 'ratio' ? '매출원가율' : '전사 매출원가율', fmt: 'pct', hist: 'OPX.cogs_r' };
    if (k === 'gpm_step') return { name: '매출총이익률 증가폭', fmt: 'pct', unit: '%p' };
    if (k === 'cogs_mat_pct') return { name: '재료비 매출 대비', fmt: 'pct' };
    if (k === 'cogs_other_pct') return { name: '기타 원가 매출 대비', fmt: 'pct' };
    if (k.startsWith('ucost.')) return { name: `${lname(k.slice(6))} 단위원가`, fmt: 'num', unit: '', hist: `OPX.${k}` };
    const ck = k.slice(7), own = lines.filter((l) => l.cost?.cogs_r_key === ck);
    return { name: `${own.length === 1 ? own[0].name : ck} 원가율`, fmt: 'pct', hist: `OPX.cogs_r.${ck}` };
  };
  let rows = v3rRow(x, T, 'REV.total', { name: '매출액', cls: 'end' });
  keys.forEach((k) => {
    const it = item(k), why = v3Note(x, k), oid = `cogs.${k}`, note = v3rNote(x, T, oid, why), hr = it.hist ? R[it.hist] : null;
    rows += v3rTr(T, { cls: `v3r-a${note ? '' : ' end'}`, st: v3rName(x, oid, it.name, why, it.unit ?? '%'), h: hr ? hr.slice(0, H).map((v) => (it.fmt === 'pct' ? v3rP(v) : v3rN(v, 1))) : [],
      f: T.fs.map((_, i) => v3ACell(x, k, i, it.fmt, S, it.name)) }) + note;
  });
  rows += v3rRow(x, T, 'OPX.cogs', { name: '매출원가', cls: mode === 'ratio' ? 'end' : '' });
  if (mode !== 'ratio') rows += v3rRow(x, T, 'OPX.cogs_r', { name: v3rSub('매출원가율'), cls: 'v3r-b end', pct: true });
  rows += v3rRow(x, T, 'OPX.gp', { name: '<b>매출총이익</b>', cls: 'key' }) + v3rRow(x, T, 'OPX.gpm', { name: v3rSub('매출총이익률'), cls: 'v3r-b end', pct: true });

  const hasMat = (x.I.hist?.['OPX.cogs.mat'] || []).some(v3Ok);
  const modes = [['ratio', '전사 원가율'], ['seg_ratio', '사업부 원가율', lines.some((l) => l.cost?.cogs_r_key) ? '' : '사업부 원가율을 정한 줄이 없는 사례'],
    ['unit_cost', '단위원가', lines.some((l) => l.type === 'price_volume') ? '' : '수량과 단가로 추정하는 줄이 없는 사례'], ['gpm_step', '총이익률 증가폭'],
    ['components', '성격별 구성', hasMat && x.sw.labor_mode === 'headcount' ? '' : '성격별 원가 자료와 인원 방식 인건비가 있어야 하는 방식']];
  const main = `<div class="v3-opt v3r-opt top"><div><span>원가 방식</span>${v3rSw(x, 'sw.cogs_mode', modes, mode)}</div></div>${v3rAsk(['TTM', '최근 3～5년 평균', '산업 평균', '환율과 원자재 가격', '규모의 경제', '고정비 비중'])}${v3rTable(T, rows)}`;

  // 참고: 과거 원가율과 평균선, 세 시나리오 추정
  const cr = R['OPX.cogs_r'] || [], hv = cr.slice(0, H).filter(v3Ok), av = hv.length ? hv.reduce((s, v) => s + v, 0) / hv.length : null;
  const two = x.w > 620, w2 = v3Wd(x, two ? 2 : 1, v3rSide(x)), labels = v3Years(x, 'hist+fc').map((y) => y.label);
  const ls = [{ name: '실적', values: cr.map((v, i) => (i < H ? v : null)), cls: 's5' }, ...V3_SCEN.map((s) => ({ name: s, values: (v3Row(x, 'OPX.cogs_r', s) || []).map((v, i) => (i >= H - 1 ? v : null)), cls: s.toLowerCase() }))];
  const ch = v3cLines({ w: w2, h: 220, labels, lines: ls, fmt: (v) => v3Pct(v), hlines: av == null ? [] : [{ v: av, label: '', cls: 's5' }], title: '매출원가율 실적과 시나리오별 추정' });
  const leg = v3cLegend([{ label: '실적', cls: 's5', kind: 'line' }, ...V3_SCEN.map((s) => ({ label: s, cls: s.toLowerCase(), kind: 'line' })), av != null && { label: `${hv.length}년 평균 ${v3Pct(av)}`, cls: 's5', kind: 'dash' }]);
  const ref = `<div class="v3-two"><div><h3 class="v3-h3">매출원가율 추이</h3>${leg}<div data-o="r2.c1">${ch}</div></div><div><h3 class="v3-h3">시나리오별 매출원가율</h3>${v3rScen(x, 'OPX.cogs_r', 'r2.s1')}<h3 class="v3-h3">시나리오별 매출총이익<small>억원</small></h3>${v3rScen(x, 'OPX.gp', 'r2.s2', { pct: false })}</div></div>`;
  return v3Sec('원가율 가정', v3rMeta(x), main, 'v3r') + v3Sec('참고 데이터', '', ref, 'v3r');
}

// ---------- 3단계 판관비 ----------
function v3rSga(x) {
  const R = x.R, S = x.sc, { H, N } = x.tl, T = v3rT(x, { hi: v3rHi(x) }), cfg = x.I.opex?.groups || {}, lines = x.I.revbuild?.lines || [];
  const gs = Object.keys(R).map((k) => /^OPX\.sga\.(.+)\.pct$/.exec(k)?.[1]).filter((g) => g && R[`OPX.sga.${g}`]);
  const go = (x.res.map || []).findIndex((m) => m.step === '재투자') + 1 || 5, lname = (id) => lines.find((l) => l.id === id)?.name || id;
  const gname = (g) => { const nm = x.lab[`OPX.sga.${g}`]?.name; return nm && !nm.startsWith('custom.') ? nm : cfg[g]?.name || (cfg[g]?.line ? `${lname(cfg[g].line)} 연동 비용` : g.replace(/^custom\./, '')); };
  let rows = '';
  for (const g of gs) {
    const amt = R[`OPX.sga.${g}`], pct = R[`OPX.sga.${g}.pct`] || [], name = gname(g), oid = `sga.${g}`;
    const K = ['pct', 'g', 'ratio', 'val'].find((s) => R[`CTL.a.sga_${g}_${s}`]), key = K ? `sga_${g}_${K}` : '';
    const sched = g === 'dna' || g === 'rnd', drv = sched ? 'schedule' : K ? { pct: 'pct_sales', g: 'cpi', ratio: 'per_line', val: 'manual' }[K] : g === 'labor' ? 'labor' : cfg[g]?.driver || '';
    const why = sched ? '' : cfg[g]?.why || v3Note(x, key) || v3Note(x, `sga_${g}`), note = v3rNote(x, T, oid, why);
    const tail = sched ? `<button type="button" class="v3r-lk" data-v3-go="${go}">재투자 단계에서 정함</button>` : '';
    rows += v3rTr(T, { cls: 'v3r-a', st: v3rName(x, oid, name, why, sched ? '' : V3R_SGA[drv] || '', 0, tail), h: amt.slice(0, H).map((v) => v3rN(v)),
      f: T.fs.map((_, i) => (K === 'val' ? v3ACell(x, key, i, 'amt', S, name) : v3rO(`r3.${g}.v${i}`, v3rN(amt[H + i])))) });
    let lab = '매출 대비', h = pct.slice(0, H).map((v) => v3rP(v)), f = T.fs.map((_, i) => v3rO(`r3.${g}.p${i}`, v3rP(pct[H + i])));
    if (K === 'pct') f = T.fs.map((_, i) => v3ACell(x, key, i, 'pct', S, `${name} 매출 대비`));
    else if (K === 'g') { lab = '증가율'; h = amt.slice(0, H).map((v, i) => (i && v3Ok(v) && v3Ok(amt[i - 1]) && amt[i - 1] ? v3rP(v / amt[i - 1] - 1) : '')); f = T.fs.map((_, i) => v3ACell(x, key, i, 'pct', S, `${name} 증가율`)); }
    else if (K === 'ratio') { const lv = R[`REV.l.${cfg[g]?.line}.val`] || []; lab = `${lname(cfg[g]?.line)} 매출 대비`; h = amt.slice(0, H).map((v, i) => (v3Ok(v) && v3Ok(lv[i]) && lv[i] ? v3rP(v / lv[i]) : '')); f = T.fs.map((_, i) => v3ACell(x, key, i, 'pct', S, `${name} ${lab}`)); }
    rows += v3rTr(T, { cls: `v3r-b${note ? '' : ' end'}`, st: v3rSub(lab), h, f }) + note;
  }
  rows += v3rRow(x, T, 'OPX.sga', { name: '<b>판관비 합계</b>', cls: 'sum' }) + v3rRow(x, T, 'OPX.sga_r', { name: v3rSub('판관비율'), cls: 'v3r-b end', pct: true });
  if ((R['OPX.sga.resid'] || []).some((v) => v3Ok(v) && Math.abs(v) >= 0.5)) rows += v3rRow(x, T, 'OPX.sga.resid', { name: '주석과 본문 차이', cls: 'end', d: 1, nz: true });
  rows += v3rRow(x, T, 'OPX.gp', { name: '매출총이익', cls: 'end' }) + v3rRow(x, T, 'OPX.ebit', { name: '<b>영업이익</b>', cls: 'key' }) + v3rRow(x, T, 'OPX.ebit_m', { name: v3rSub('영업이익률'), cls: 'v3r-b end', pct: true })
    + v3rRow(x, T, 'OPX.ebitda', { name: 'EBITDA', cls: 'end' });
  const ce = R['OPX.ebit_cons'] || [], eb = R['OPX.ebit'] || [];
  if (ce.some(v3Ok)) rows += v3rRow(x, T, 'OPX.ebit_cons', { name: '컨센서스 영업이익', dash: true })
    + v3rTr(T, { cls: 'end', o: 'r3.gap', st: '컨센서스 대비', f: T.fs.map((_, i) => (v3Ok(ce[i]) && v3Ok(eb[H + i]) ? `${eb[H + i] - ce[i] > 0 ? '+' : ''}${v3Num(eb[H + i] - ce[i])}` : '-')) });

  const scope = (x.res.checks || []).find((k) => k.id === 'labor_scope'), hcOk = v3Ok((x.I.hist?.['OPX.hc'] || [])[H - 1]) && v3Ok((x.I.hist?.['OPX.labor_total'] || [])[H - 1]);
  const yrs = [...new Set([3, 5, +x.sw.avg_years].filter((y) => y > 0 && (y <= H || y === +x.sw.avg_years)))].sort((a, b) => a - b);
  const opt = `<div class="v3-opt v3r-opt"><div><span>인건비 방식</span>${v3rSw(x, 'sw.labor_mode', [['pct_sales', '매출 비례'], ['headcount', '인원 방식', scope ? scope.text : hcOk ? '' : '직원 수와 전체 인건비 자료가 없는 사례']], x.sw.labor_mode)}</div>
    <div title="가정을 따로 정하지 않은 항목의 기본값에 쓰는 기간"><span>과거 평균 기간</span>${v3Sw(x, 'sw.avg_years', yrs.map((y) => [y, `${y}년`]), +x.sw.avg_years)}</div></div>`;
  const main = `${v3rAsk(['TTM', '최근 3～5년 평균', '산업 평균', '마케팅 비용', 'R&D 투자', '규모의 경제'])}${v3rTable(T, rows)}${opt}`;

  const n = H + N, labels = v3Years(x, 'hist+fc').map((y) => y.label);
  const ser = v3rStack(R, gs.map((g) => ({ name: gname(g), row: `OPX.sga.${g}` })), n);
  const ch = v3cBars({ w: v3Wd(x, 1, v3rSide(x)), h: 260, labels, bars: ser, stack: true, fc: H, vals: false, fmt: (v) => v3Num(v), lines: [{ name: '판관비율', values: (R['OPX.sga_r'] || []).slice(0, n), cls: 's3' }], title: '판관비 구성과 판관비율' });
  const leg = v3cLegend([...ser.map((s) => ({ label: s.name, cls: s.cls })), { label: '추정', cls: 's2', kind: 'fc' }, { label: '판관비율', cls: 's3', kind: 'line' }]);
  const ref = `<h3 class="v3-h3">판관비 구성과 판관비율</h3>${leg}<div data-o="r3.c1">${ch}</div>
    <div class="v3-two v3r-two"><div><h3 class="v3-h3">시나리오별 판관비율</h3>${v3rScen(x, 'OPX.sga_r', 'r3.s1')}</div><div><h3 class="v3-h3">시나리오별 영업이익률</h3>${v3rScen(x, 'OPX.ebit_m', 'r3.s2')}</div></div>`;
  return v3Sec('판관비 묶음', v3rMeta(x), main, 'v3r') + v3Sec('참고 데이터', '<span class="meta">단위 억원</span>', ref, 'v3r');
}

v3Step(1, v3rRev);
v3Step(2, v3rCogs);
v3Step(3, v3rSga);
v3On('click', '[data-v3r-open]', (el, x) => { const o = ((x.st.v3r ||= {}).open ||= {}), id = el.dataset.v3rOpen; if (o[id]) delete o[id]; else o[id] = 1; return true; });

// ---------- 입력 탭 4～6단계: 법인세, 재투자, 재무 구조 ----------
// 카드마다 위에 방식 선택(v3oSw)과 가정 입력(v3ATable), 아래에 결과 표(v3oTbl), 단계 끝에 참고 차트.
// 선택지는 엔진(valuation_v3_engine.js)이 실제로 가르는 값만 두고, 이 사례에 필요한 입력이 없는 선택지는 비활성으로 둠.
const V3O_UNIT = '<span class="meta">단위 억원</span>';
const v3oHas = (v) => v != null && v !== false && v !== 0 && v !== '' && !(typeof v === 'object' && !Object.keys(v).length);
const v3oNz = (x, id) => (x.R[id] || []).some((v) => v3Ok(v) && Math.abs(v) > 1e-9);
const v3oSide = (x) => (x.w >= 1000 ? 316 : 0);
/* 사례 입력(assump)에 그 가정이 들어 있는지. 들어 있으면 엔진이 기본값 규칙(평균, 직전 결산 등)을 쓰지 않음 */
const v3oGiven = (x, key) => { const A = x.c.input?.assump || {}, m = A[x.sc] || {}, b = A.Base || {}; return (key in m ? m[key] : b[key]) != null; };
/* 계산 입력을 바꾸는 단추 묶음. v3Sw와 같은 마크업에 opts [[값, 이름, 못 쓰는 까닭]]의 셋째 값이 있으면 비활성 */
function v3oSw(x, key, opts, cur) {
  const j = JSON.stringify(cur ?? null);
  return `<div class="mk-seg">${opts.map(([v, l, off]) => { const on = JSON.stringify(v ?? null) === j; return `<button type="button" data-v3-ov="${esc(key)}" data-v="${esc(JSON.stringify(v ?? null))}" class="${on ? 'on' : ''}" aria-pressed="${on}"${off ? ` disabled title="${esc(off)}"` : ''}>${esc(l)}</button>`; }).join('')}</div>`;
}
const v3oOpt = (...items) => { const its = items.filter(Boolean); return its.length ? `<div class="v3-opt">${its.map((h) => (h.startsWith('<div') ? h : `<div>${h}</div>`)).join('')}</div>` : ''; };
const v3oAT = (x, items, opt) => { const its = items.filter((it) => it && x.R[`CTL.a.${it.key}`]); return its.length ? v3ATable(x, its, opt) : ''; };
/* 표 칸 값. 없는 열은 빈칸, 값이 없으면 -, 10억 미만 금액은 소수 한 자리 */
function v3oFmt(v, fmt) {
  if (v === undefined) return '';
  if (!v3Ok(v)) return '-';
  if (fmt === 'amt') { const a = Math.abs(v); return a < 0.05 ? '0' : v3Num(v, a < 10 ? 1 : 0); }
  return v3Fmt(v, fmt);
}
/* 연도 열 결과 표. cols 'hist+fc' | 'fc' | 'dcf', specs [{id, name, fmt, cls, sub, pre: [이름 옆 칸], hist: 과거 칸에 쓸 다른 행, neg: 그 과거 값 부호 뒤집기} | {grp: 묶음 제목}]
   행이 없으면 그 줄을 건너뜀. 표 전체가 data-o 한 구역이라 입력하는 동안 줄 수가 바뀌어도 따라감 */
function v3oTbl(x, key, cols, specs, { first = '항목', pre = [] } = {}) {
  const ys = v3Years(x, cols), { H, N, M } = x.tl, R = x.R, gap = (n) => new Array(Math.max(0, n)).fill(undefined);
  const vals = (sp) => {
    const r = R[sp.id], kind = x.lab[sp.id]?.cols || (r.length === H + N ? 'hist+fc' : r.length === N ? 'fc' : 'dcf');
    const f = kind === 'hist+fc' ? r.slice(H) : kind === 'dcf' ? r.slice(0, N) : r;
    if (cols === 'fc') return f;
    if (cols === 'dcf') return kind === 'dcf' ? r : [...f, ...gap(M + 1)];
    if (kind === 'hist+fc') return r;
    const h = sp.hist && R[sp.hist] ? R[sp.hist].slice(0, H).map((v) => (v3Ok(v) && sp.neg ? -v : v)) : gap(H);
    return [...h, ...f];
  };
  const bl = (i) => (cols === 'hist+fc' ? i === H : cols === 'dcf' ? (M > 0 && i === N) || i === N + M : false);
  const out = [];
  for (const sp of specs) {
    if (!sp) continue;
    if (sp.grp) { out.push({ grp: `<tr class="grp"><th class="st">${esc(sp.grp)}</th><td colspan="${pre.length + ys.length}"></td></tr>` }); continue; }
    if (!R[sp.id] || x.lab[sp.id]?.cols === 'one') continue;
    const L = v3Lab(x, sp.id), fmt = sp.fmt || L.fmt, unit = fmt === 'pct' ? '%' : fmt === 'amt' || fmt === 'won' ? '' : V3_UNIT[fmt] || '', vs = vals(sp);
    out.push({ row: `<tr class="${sp.cls || ''}"><td class="st${sp.sub ? ' v3o-sub' : ''}">${esc(sp.name || L.name.replace(/\s*\([^)]*\)\s*$/, ''))}${unit ? `<small>${unit}</small>` : ''}</td>${pre.map((_, i) => `<td>${sp.pre?.[i] ?? ''}</td>`).join('')}${ys.map((y, i) => `<td class="${y.k === 'h' ? 'h' : ''}${bl(i) ? ' bl' : ''}">${v3oFmt(vs[i], fmt)}</td>`).join('')}</tr>` });
  }
  const rows = out.filter((o, i) => o.row || (out[i + 1] && out[i + 1].row)).map((o) => o.row || o.grp);
  if (!out.some((o) => o.row)) return '';
  return `<div class="mk-scroll" data-o="v3o-${key}"><table class="mk-tbl v3-t v3o-t"><thead><tr><th class="st">${first}</th>${pre.map((p) => `<th>${p}</th>`).join('')}${ys.map((y, i) => `<th class="${bl(i) ? 'bl' : ''}">${y.label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
const v3oChart = (key, title, unit, legend, svg) => `<div class="v3o-ch"><h3 class="v3-h3">${title}${unit ? `<small>${unit}</small>` : ''}</h3>${legend || ''}<div data-o="v3o-${key}">${svg}</div></div>`;

// ---------- 4단계 법인세 ----------
/* 유효세율 평균에 들어가는 해를 엔진(E04 hist)과 같은 규칙으로 가림: 뺀 해(avg_exclude)를 빼고 최근 avg_years 개,
   그 가운데 세전 손실인 해와 유효세율이 법정 세율의 0.5배 미만, 1.5배 초과인 해는 엔진이 스스로 뺌.
   state: used 평균에 들어감, ex 사용자가 뺌, old 최근 기간 밖, auto 법정 대비 범위 밖, loss 세전 손실 */
function v3oTaxYears(x) {
  const hist = x.tl.hist, ex = x.I.avg_exclude || [], T = x.I.market?.tax, n = Math.max(1, Math.trunc(+x.sw.avg_years || 3));
  const ebt = x.R['IS.ebt'] || [], tax = x.R['IS.tax'] || [], win = hist.filter((y) => !ex.includes(y)).slice(-n);
  const stat = (b) => {
    if (!T?.brackets || !(b > 0)) return null;
    let t = 0, lo = 0;
    for (const [up, r] of T.brackets) { t += Math.max((up == null ? b : Math.min(b, up / 1e8)) - lo, 0) * r; if (up != null) lo = up / 1e8; }
    return t * (1 + (T.local || 0)) / b;
  };
  const rows = hist.map((y, i) => {
    const eff = v3Ok(ebt[i]) && v3Ok(tax[i]) && ebt[i] !== 0 ? tax[i] / ebt[i] : null, s = stat(ebt[i]), ratio = eff != null && s ? eff / s : null;
    const state = ex.includes(y) ? 'ex' : !win.includes(y) ? 'old' : eff == null || ebt[i] <= 0 ? 'loss' : ratio != null && (ratio < 0.5 || ratio > 1.5) ? 'auto' : 'used';
    return { y, i, eff, ratio, state };
  });
  const used = rows.filter((r) => r.state === 'used');
  return { rows, n, avg: used.length ? used.reduce((s, r) => s + r.eff, 0) / used.length : null };
}
function v3oStepTax(x, c) {
  const R = x.R, T = x.I.market?.tax, ty = v3oTaxYears(x), given = v3oGiven(x, 'tax_eff');
  const mode = ['statutory', 'marginal'].includes(x.sw.tax_mode) ? x.sw.tax_mode : 'eff_avg';
  // 과거 유효세율과 평균에 넣을 해
  const tip = { old: `최근 ${ty.n}년 밖`, auto: '법정 세율 대비 0.5배 미만이거나 1.5배 초과', loss: '세전 손실' };
  const ck = (r) => { const off = tip[r.state]; return `<label class="v3-ck v3o-ck"${off ? ` title="${off}"` : ''}><input type="checkbox" data-v3-set="i.avg_exclude" data-v="${r.y}" aria-label="${r.y}년"${r.state === 'used' ? ' checked' : ''}${off ? ' disabled' : ''}></label>`; };
  const tr = (name, f, cls = '', last = '<td class="bl"></td>') => `<tr class="${cls}"><td class="st">${name}</td>${ty.rows.map((r) => `<td>${f(r)}</td>`).join('')}${last}</tr>`;
  const hist = `<div class="mk-scroll"><table class="mk-tbl v3-t v3o-t"><thead><tr><th class="st">항목</th>${ty.rows.map((r) => `<th>${r.y}</th>`).join('')}<th class="bl">평균</th></tr></thead><tbody>
    ${tr('세전이익', (r) => v3oFmt((R['IS.ebt'] || [])[r.i] ?? null, 'amt'))}${tr('법인세', (r) => v3oFmt((R['IS.tax'] || [])[r.i] ?? null, 'amt'))}
    ${tr('유효세율<small>%</small>', (r) => v3oFmt(r.eff, 'pct'), 'sum', `<td class="bl" data-o="v3o-taxavg">${v3oFmt(ty.avg, 'pct')}</td>`)}
    ${T ? tr('법정 세율 대비<small>배</small>', (r) => `<span class="${r.state === 'auto' ? 'v3o-out' : ''}">${v3oFmt(r.ratio, 'x')}</span>`) : ''}
    ${given ? '' : tr('평균에 넣을 해', ck)}</tbody></table></div>`;
  // 손익 법인세 가정
  const mwhy = (x.res.map || []).find((m) => m.step === '법인세')?.why;
  const opt = v3oOpt(`<span>세율 방식</span>${v3oSw(x, 'sw.tax_mode', [['eff_avg', '평균 유효세율'], ['statutory', '법정 누진'], ['marginal', '한계세율']], mode)}`,
    `<span>이월결손금</span>${v3In(x, 'i.tax.nol', x.c.input.tax?.nol ?? 0, { fmt: 'amt', lab: '이월결손금' })}`,
    `<div data-o="v3o-sme">${+x.I.tax?.nol > 0 ? `<span>결손금 공제 한도</span>${v3oSw(x, 'sw.sme', [[false, '80%'], [true, '100%']], !!x.sw.sme)}` : ''}</div>`);
  const at = v3oAT(x, [mode === 'eff_avg' && { key: 'tax_eff', hist: 'IS.tax_r', name: '유효세율', why: (!given && mwhy) || v3Note(x, 'tax_eff') },
    { key: 'tax_credit', name: '세액공제와 감면' }, { key: 'tax_adj', name: '세무조정' }]);
  // 법정 누진 계산
  const br = T?.brackets || [], eok = (v) => `${v3Num(v / 1e8)}억`, rp = (r) => (v3Ok(r) ? v3Pct(r, Math.abs(r * 100 - Math.round(r * 100)) < 1e-9 ? 0 : 1) : '');
  const bname = (i) => { const up = br[i][0], lo = i ? br[i - 1][0] : null; return lo == null ? `${eok(up)} 이하` : up == null ? `${eok(lo)} 초과` : `${eok(lo)} 초과 ${eok(up)} 이하`; };
  const nol = ['TAX.nol_bop', 'TAX.nol_use', 'TAX.nol_add', 'TAX.nol_eop'].some((id) => v3oNz(x, id));
  const calc = v3oTbl(x, 'taxcalc', 'fc', [{ id: 'TAX.ebt' }, v3oNz(x, 'TAX.adj') && { id: 'TAX.adj' },
    nol && { id: 'TAX.nol_bop' }, nol && { id: 'TAX.nol_use' }, nol && v3oNz(x, 'TAX.nol_add') && { id: 'TAX.nol_add' }, nol && { id: 'TAX.nol_eop' },
    { id: 'TAX.base', cls: 'sum' }, ...br.map((b, i) => ({ id: `TAX.b${i + 1}`, name: bname(i), sub: true, pre: [rp(b[1])] })),
    { id: 'TAX.corp' }, { id: 'TAX.local', pre: [rp(T?.local)] }, v3oNz(x, 'TAX.credit') && { id: 'TAX.credit', name: '세액공제와 감면' },
    { id: 'TAX.stat', cls: 'sum' }, { id: 'TAX.total', cls: 'sum' }, mode !== 'eff_avg' && { id: 'TAX.eff' },
    { id: 'TAX.stat_rate_ebit' }, { id: 'TAX.marginal' }], { pre: ['세율'] });
  const mopt = v3oOpt(`<span>한계세율</span>${v3oSw(x, 'sw.tax_marginal', [['bracket', '과세표준 구간'], ['top', '최고 구간']], x.sw.tax_marginal === 'top' ? 'top' : 'bracket')}`);
  // FCFF 세율
  const ft = ['marginal', 'is_total'].includes(x.sw.fcff_tax) ? x.sw.fcff_tax : 'is_eff', tt = ['statutory', 'marginal'].includes(x.sw.ty_tax) ? x.sw.ty_tax : 'eff';
  const fopt = v3oOpt(`<span>FCFF 세율</span>${v3oSw(x, 'sw.fcff_tax', [['is_eff', '손익 유효세율'], ['marginal', '한계세율'], ['is_total', '손익 법인세 전액']], ft)}`,
    `<span>종료연도 세율</span>${v3oSw(x, 'sw.ty_tax', [['statutory', '법정 유효세율'], ['eff', '명시 마지막 해'], ['marginal', '한계세율']], tt)}`);
  const dcf = v3oTbl(x, 'taxdcf', 'dcf', [{ id: 'DCF.tax_r' }, { id: 'DCF.tax' }]);
  return v3Sec('과거 유효세율', V3O_UNIT, hist, 'v3o')
    + v3Sec('손익 법인세 가정', '', opt + at, 'v3o')
    + v3Sec('법인세 계산', V3O_UNIT, mopt + (calc || '<div class="empty">법인세 계산 행이 없습니다.</div>'), 'v3o')
    + v3Sec('FCFF 세율', V3O_UNIT, fopt + dcf, 'v3o');
}

// ---------- 5단계 재투자 ----------
function v3oStepReinv(x, c) {
  const R = x.R, { H, N } = x.tl, side = v3oSide(x);
  // 유형자산. 자산별 변동표 방식은 사례에 유형자산 변동표(ppe_roll)가 있어야 엔진이 씀
  const roll = v3oHas(x.I.ppe_roll), pm = roll && ['auto', 'waterfall'].includes(x.sw.ppe_mode) ? 'waterfall' : 'maint_exp', bp = x.sw.capex_maint_base === 'ppe';
  const popt = v3oOpt(`<span>방식</span>${v3oSw(x, 'sw.ppe_mode', [['maint_exp', '유지와 확장 CAPEX'], ['waterfall', '자산별 변동표', roll ? '' : '유형자산 변동표 입력 없음']], pm)}`);
  const cwhy = v3Note(x, 'capex_exp') || v3Note(x, 'capex');
  const pat = v3oAT(x, pm === 'waterfall' ? [{ key: 'capex_exp', name: '확장 CAPEX', why: cwhy }] : [
    { key: 'capex_maint_pct', hist: bp ? '' : 'PPE.capex_pct', name: bp ? '유지 CAPEX ÷ 기초 유형자산' : '유지 CAPEX ÷ 매출' },
    { key: 'capex_exp', name: '확장 CAPEX', why: cwhy }, { key: 'rou_add_pct', name: '사용권자산 신규 ÷ 매출' }, { key: 'rou_add_abs', name: '사용권자산 신규 금액' },
    { key: 'dep_rate', name: '감가상각률' }]);
  const ptb = v3oTbl(x, 'ppe', 'hist+fc', [{ id: 'PPE.bop' }, { id: 'PPE.capex', name: '유형 CAPEX' }, { id: 'PPE.capex_maint', sub: true },
    v3oNz(x, 'PPE.rou_add') && { id: 'PPE.rou_add', name: '사용권자산 신규' }, { id: 'PPE.dep', name: '감가상각비' },
    v3oNz(x, 'PPE.disp') && { id: 'PPE.disp', name: '처분과 대체' }, { id: 'PPE.eop', cls: 'sum' }, { id: 'PPE.capex_da' }]);
  // 무형자산과 연구개발
  const iopt = v3oNz(x, 'CTL.a.int_other_add') ? v3oOpt(`<span>계약관계 상각 연수</span>${v3In(x, 'i.capex.int_other_amort_years', x.c.input.capex?.int_other_amort_years ?? 5, { fmt: 'cnt', u: '년', lab: '계약관계 상각 연수' })}`) : '';
  const iat = v3oAT(x, [{ key: 'rnd_pct', hist: 'RND.pct', name: '연구개발비 ÷ 매출' }, { key: 'rnd_cap_share', name: '연구개발비 자산화 비중' },
    { key: 'int_capex_other_pct', name: '기타 무형자산 취득 ÷ 매출' }, { key: 'amort_rate', name: '무형자산 상각률' }, { key: 'int_other_add', name: '계약관계 등 취득' }]);
  const itb = v3oTbl(x, 'int', 'hist+fc', [{ grp: '연구개발비' }, { id: 'RND.total', name: '총액' }, { id: 'RND.cap', sub: true }, { id: 'RND.exp', sub: true },
    { grp: '무형자산' }, { id: 'INT.bop', name: '기초' }, { id: 'INT.capex', name: '무형 CAPEX' }, v3oNz(x, 'INT.other_add') && { id: 'INT.other_add' },
    { id: 'INT.amort' }, { id: 'INT.eop', name: '기말', cls: 'sum' }, { id: 'INT.gw' }]);
  // 운전자본. 회전일수와 비율이 사례 입력에 모두 들어 있으면 기준 스위치는 값을 바꾸지 못함
  const nk = ['dso', 'dio', 'dpo', 'oca_pct', 'ocl_pct'].filter((k) => R[`CTL.a.${k}`]), lock = nk.length && nk.every((k) => v3oGiven(x, k)) ? '사례 입력에 지정된 값 사용' : '';
  const na = ['avg3', 'avg5', 'median5'].includes(x.sw.nwc_avg) ? x.sw.nwc_avg : 'last';
  const nopt = v3oOpt(`<span>가정 기준</span>${v3oSw(x, 'sw.nwc_avg', [['last', '직전 결산', lock], ['avg3', '3년 평균', lock], ['avg5', '5년 평균', lock], ['median5', '5년 중앙값', lock]], na)}`,
    `<span>잔액</span>${v3oSw(x, 'sw.nwc_basis', [['eop', '기말', lock], ['avg', '기초와 기말 평균', lock]], x.sw.nwc_basis === 'avg' ? 'avg' : 'eop')}`);
  const nat = v3oAT(x, nk.map((k) => ({ key: k, hist: `NWC.${k}` })));
  const ntb = v3oTbl(x, 'nwc', 'hist+fc', [{ id: 'NWC.nwc' }, { id: 'NWC.dnwc' }, { id: 'NWC.nwc_pct' }]);
  // FCFF 재투자
  const rm = ['sales_pct', 'ic_turnover'].includes(x.sw.reinv_mode) ? x.sw.reinv_mode : 'schedule';
  const ropt = v3oOpt(`<span>재투자 방식</span>${v3oSw(x, 'sw.reinv_mode', [['schedule', '스케줄'], ['sales_pct', '매출 대비'], ['ic_turnover', '투하자본회전율']], rm)}`);
  const rat = rm === 'sales_pct' ? v3oAT(x, [{ key: 'reinv_pct', name: '재투자 ÷ 매출', fmt: 'pct' }], { hist: false }) : rm === 'ic_turnover' ? v3oAT(x, [{ key: 'ic_turnover', name: '투하자본회전율', fmt: 'x' }], { hist: false }) : '';
  const sch = rm === 'schedule';
  const rtb = v3oTbl(x, 'reinv', 'dcf', [sch && { id: 'DCF.capex', name: 'CAPEX' }, sch && { id: 'DCF.da', name: '유무형자산 상각비' }, sch && { id: 'DCF.dnwc' },
    { id: 'DCF.reinv', cls: 'sum' }, { id: 'DCF.rr' }, { id: 'DCF.ic' }, { id: 'DCF.roic' }]);
  // 참고 차트
  const hf = v3Years(x, 'hist+fc'), labs = hf.map((y) => y.label), dy = v3Years(x, 'dcf'), two = x.w <= 620 ? 1 : 2;
  const hsum = (...ids) => Array.from({ length: H }, (_, i) => { let s = null; ids.forEach((id) => { const v = (R[id] || [])[i]; if (v3Ok(v)) s = (s || 0) + v; }); return s; });
  const fcv = (id) => Array.from({ length: N }, (_, k) => (R[id] || [])[k] ?? null), neg = (a) => a.map((v) => (v3Ok(v) ? -v : null));
  const mix = v3cBars({ w: v3Wd(x, 1, side), h: 240, labels: labs, stack: true, fc: H, bars: [
    { name: 'CAPEX', cls: 's1', values: [...hsum('PPE.capex', 'INT.capex', 'PPE.rou_add'), ...fcv('DCF.capex')] },
    { name: '감가상각', cls: 's5', values: neg([...(R['OPX.da'] || []).slice(0, H), ...fcv('DCF.da')]) },
    { name: '운전자본 증가', cls: 's3', values: [...(R['NWC.dnwc'] || []).slice(0, H), ...fcv('DCF.dnwc')] }] });
  const wacc = v3V(x, 'WACC.wacc');
  const roic = v3cLines({ w: v3Wd(x, two, side), h: 220, labels: dy.map((y) => y.label), zero: true, fmt: (v) => v3Pct(v, 0),
    lines: [{ name: 'ROIC', cls: 's1', values: R['DCF.roic'] || [] }], hlines: v3Ok(wacc) ? [{ v: wacc, label: `WACC ${v3Pct(wacc, 1)}`, cls: 's3' }] : [] });
  const ratio = v3cBars({ w: v3Wd(x, two, side), h: 220, labels: labs, fc: H, fmt: (v) => v3Pct(v, 0), lineFmt: (v) => `${v3Num(v, 1)}배`,
    bars: [{ name: 'CAPEX ÷ 매출', cls: 's2', values: R['PPE.capex_pct'] || [] }], lines: [{ name: 'CAPEX ÷ 감가상각', cls: 's3', values: R['PPE.capex_da'] || [] }] });
  const charts = v3oChart('ch-mix', sch ? '재투자 구성' : '스케줄 기준 재투자 구성', '억원', v3cLegend([{ label: 'CAPEX', cls: 's1' }, { label: '감가상각', cls: 's5' }, { label: '운전자본 증가', cls: 's3' }, { label: '추정', cls: 's1', kind: 'fc' }]), mix)
    + `<div class="v3-two">${v3oChart('ch-roic', 'ROIC', '', v3cLegend([{ label: 'ROIC', cls: 's1', kind: 'line' }, { label: 'WACC', cls: 's3', kind: 'dash' }]), roic)}
      ${v3oChart('ch-capex', '유형 CAPEX 비율', '', v3cLegend([{ label: 'CAPEX ÷ 매출', cls: 's2' }, { label: 'CAPEX ÷ 감가상각', cls: 's3', kind: 'line' }]), ratio)}</div>`;
  const h3 = (t) => `<h3 class="v3-h3">${t}</h3>`;
  return v3Sec('유형자산', V3O_UNIT, popt + pat + (ptb ? h3('유형자산 변동') + ptb : ''), 'v3o')
    + v3Sec('무형자산과 연구개발', V3O_UNIT, iopt + iat + (itb ? h3('연구개발비와 무형자산 변동') + itb : ''), 'v3o')
    + v3Sec('운전자본', V3O_UNIT, nopt + nat + (ntb ? h3('순운전자본') + ntb : ''), 'v3o')
    + v3Sec('FCFF 재투자', V3O_UNIT, ropt + rat + rtb, 'v3o')
    + v3Sec('참고', '', charts, 'v3o');
}

// ---------- 6단계 재무 구조 ----------
function v3oStepFin(x, c) {
  const R = x.R, { H } = x.tl, D = x.I.debt || {}, side = v3oSide(x);
  // 차입금 트랜치: 행 ID(DEBT.<트랜치>.eop)에서 찾고, 잔액과 증감이 모두 0인 트랜치는 표에서 뺌
  const trs = Object.keys(R).map((id) => /^DEBT\.([^.]+)\.eop$/.exec(id)?.[1]).filter(Boolean);
  const tname = (r) => v3Lab(x, `DEBT.${r}.eop`).name.replace(/\s*기말$/, '');
  const live = (r) => ['bop', 'eop', 'draw', 'new', 'repay', 'conv'].some((k) => v3oNz(x, `DEBT.${r}.${k}`));
  const SUB = { bop: '기초', draw: '신규', new: '신규', repay: '상환', conv: '전환', accr: '비현금 이자', eop: '기말', int: '이자비용' };
  const specs = [];
  trs.filter(live).forEach((r) => {
    specs.push({ grp: tname(r) });
    Object.keys(SUB).forEach((k) => { const id = `DEBT.${r}.${k}`; if (R[id] && (k === 'bop' || k === 'eop' || v3oNz(x, id))) specs.push({ id, name: k === 'draw' && /인출/.test(v3Lab(x, id).name) ? '순인출' : SUB[k], cls: k === 'eop' ? 'sum' : '' }); });
  });
  const none = trs.filter((r) => !live(r)).map(tname);
  const dtb = (v3oTbl(x, 'debt', 'hist+fc', specs) || '<div class="empty">차입금이 없습니다.</div>') + `<p class="v3o-note" data-o="v3o-debtnone">${none.length && specs.length ? `잔액 없음: ${esc(none.join(', '))}` : ''}</p>`;
  const plan = x.sw.debt_plan === 'amort' ? 'amort' : x.sw.debt_plan === 'manual' && v3oHas(D.manual) ? 'manual' : 'hold';
  const dopt = v3oOpt(`<span>차입 계획</span>${v3oSw(x, 'sw.debt_plan', [['hold', '잔액 유지'], ['amort', '균등 상환'], ['manual', '연도별 계획', v3oHas(D.manual) ? '' : '연도별 차입 계획 입력 없음']], plan)}`);
  const dat = v3oAT(x, [(live('cb') || v3oNz(x, 'CTL.a.cb_convert')) && { key: 'cb_convert', name: '전환사채 전환', why: v3Note(x, 'cb_convert') || v3Note(x, 'debt') },
    (live('lease') || v3oNz(x, 'PPE.rou_add')) && { key: 'lease_repay_rate', name: '리스부채 상환율' }], { hist: false });
  // 이자와 현금
  const rlock = v3oGiven(x, 'debt_rate') ? '사례 입력에 지정된 값 사용' : '', rm = x.sw.int_rate === 'avg4' ? 'avg4' : x.sw.int_rate === 'kd' ? null : 'last';
  const mc0 = x.c.input.debt?.min_cash, mcv = `<span class="v3o-res" data-o="v3o-mincash">${v3Eok(v3V(x, 'DEBT.min_cash'))}</span>`;
  const copt = v3oOpt(`<span>이자율 기준</span>${v3oSw(x, 'sw.int_rate', [['last', '직전 결산', rlock], ['avg4', '4년 평균', rlock]], rm)}`,
    v3oHas(mc0) ? `<span>최소 현금</span>${v3In(x, 'i.debt.min_cash', mc0, { fmt: 'amt', lab: '최소 현금' })}` : `<span>최소 현금 ÷ 매출</span>${v3In(x, 'sw.min_cash', x.c.switches.min_cash, { fmt: 'pct', lab: '최소 현금 ÷ 매출' })}${mcv}`,
    `<span>리볼버</span>${v3oSw(x, 'sw.revolver', [['on', '사용'], ['off', '미사용']], x.sw.revolver === 'on' ? 'on' : 'off')}`,
    `<span>순환 계산</span>${v3oSw(x, 'sw.circuit', [[1, '사용'], [0, '미사용']], Math.trunc(+x.sw.circuit) === 1 ? 1 : 0)}`);
  const cat = v3oAT(x, [{ key: 'debt_rate', hist: 'DEBT.rate', name: '차입 이자율' }, { key: 'cash_rate', hist: 'DEBT.cash_rate', name: '예금 이자율' }]);
  // 배당과 자본
  const dm = x.sw.div_mode === 'none' ? 'none' : x.sw.div_mode === 'dps' ? 'dps' : 'payout', bm = x.sw.buyback_mode === 'ni_ratio' ? 'ni_ratio' : 'plan';
  const eopt = v3oOpt(`<span>배당</span>${v3oSw(x, 'sw.div_mode', [['payout', '배당성향'], ['dps', '주당 배당', v3oHas(D.dps) ? '' : '주당 배당 입력 없음'], ['none', '없음']], dm)}`,
    `<span>자사주 매입</span>${v3oSw(x, 'sw.buyback_mode', [['plan', '계획 금액'], ['ni_ratio', '순이익 비율']], bm)}`);
  const eat = v3oAT(x, [dm === 'payout' && { key: 'payout', hist: 'EQ.payout', name: '배당성향' },
    bm === 'ni_ratio' ? { key: 'buyback', name: '자사주 매입 ÷ 순이익', fmt: 'pct' } : { key: 'buyback', name: '자사주 매입', fmt: 'amt' },
    { key: 'equity_iss', name: '유상증자' }, { key: 'nci_share', name: '비지배지분 몫' }]);
  // 결과와 차트
  const res = v3oTbl(x, 'fin', 'hist+fc', [{ id: 'BS.cash', name: '현금' }, { id: 'DEBT.ibd', name: '이자부부채' }, { id: 'DEBT.int_exp', name: '이자비용' }, { id: 'DEBT.int_inc' },
    { id: 'IS.ni', cls: 'sum' }, { id: 'EQ.div', hist: 'CF.div', neg: true }, v3oNz(x, 'EQ.buyback') && { id: 'EQ.buyback', hist: 'CF.buyback', neg: true }, { id: 'EQ.re_eop', name: '이익잉여금', hist: 'BS.re' }]);
  const chart = v3cBars({ w: v3Wd(x, 1, side), h: 240, labels: v3Years(x, 'hist+fc').map((y) => y.label), fc: H,
    bars: [{ name: '현금', cls: 's1', values: R['BS.cash'] || [] }, { name: '이자부부채', cls: 's5', values: R['DEBT.ibd'] || [] }] });
  return v3Sec('차입금', V3O_UNIT, dopt + dat + `<h3 class="v3-h3">트랜치별 잔액</h3>` + dtb, 'v3o')
    + v3Sec('이자와 현금', '', copt + cat, 'v3o')
    + v3Sec('배당과 자본', V3O_UNIT, eopt + eat, 'v3o')
    + v3Sec('재무 결과', V3O_UNIT, res + v3oChart('ch-cash', '현금과 차입 추이', '억원', v3cLegend([{ label: '현금', cls: 's1' }, { label: '이자부부채', cls: 's5' }, { label: '추정', cls: 's1', kind: 'fc' }]), chart), 'v3o');
}

v3Step(4, v3oStepTax);
v3Step(5, v3oStepReinv);
v3Step(6, v3oStepFin);

// ---------- 입력 탭 7～10단계: 자기자본비용, 타인자본비용, 할인율 확정, 성장 단계와 종료가치 (v3w*) ----------
// 스위치는 엔진(step_macro, step_wacc, step_fade, step_value)이 읽는 것만 단추로 만듦. 이 사례에 값이 없는 선택지는 비활성.
// 값을 따로 넣어야 하는 방식(베타, 타인자본비용, 목표 D/E, 안정기 베타, 안정기 ROC, 목표 이익률)은 단추를 누를 때 지금 계산값을 그 키에 채워 결과가 튀지 않게 함(v3wSw의 man).
// 식을 보여 주는 표는 모두 v3wFt(항목, 값, 근거 세 열).
const V3W_WIN = { '2y_w': '2년 주간', '3y_w': '3년 주간', '5y_m': '5년 월간', '1y_d': '1년 일간' };
const V3W_STAT = { median: '중앙값', mean: '평균', high: '최고', low: '최저' };
const V3W_BETA = { regression: '회귀 베타', bottom_up: '바텀업 베타', manual: '직접 입력', accounting: '회계 베타' };
const V3W_KD = { synthetic: '합성 등급', rating: '실제 등급', effective: '실효이자율', market_yield: '회사채 수익률', manual: '직접 입력', recent_issue: '최근 발행 금리', peer_avg: '비교기업 평균', extra_spread: '합성 등급과 추가 스프레드' };
const V3W_FADE = [['DCF.rev', '매출'], ['DCF.g', '성장률'], ['DCF.ebit', '영업이익'], ['DCF.margin', '영업이익률'], ['DCF.tax_r', '세율'], ['DCF.nopat', '세후영업이익'], ['DCF.reinv', '재투자'], ['DCF.rr', '재투자율'],
  ['DCF.roic', 'ROIC'], ['DCF.fcff', 'FCFF', 'sum'], ['DCF.wacc_t', '할인율'], ['DCF.df', '할인계수'], ['DCF.pv', '현재가치']];
const v3wJ = (v) => JSON.stringify(v ?? null);
const v3wP1 = (v) => v3Pct(v, 1);
const v3wP2 = (v) => v3Pct(v, 2);
const v3wB = (v, d = 3) => v3Num(v, d);
const v3wN = (v) => (v3Ok(v) ? String(+(+v).toFixed(2)) : '-');
const v3wWin = (k) => V3W_WIN[k] || String(k);
const v3wChk = (x, id) => (x.res.checks || []).filter((k) => k.id === id);
const v3wPeers = (x) => x.I.beta?.peers || [];
const v3wSide = (x) => (x.w >= 1000 ? 316 : 0);

/* 선택 단추 묶음(v3Sw와 같은 마크업). opts [[값, 이름, 못 쓰는지]].
   man {key, val, fmt, d, on = 'manual'}: on 값 단추를 누르면 val을 key에 채우고, 다른 단추를 누르면 key 덮기를 지움 */
function v3wSw(x, key, opts, cur, man) {
  const j = v3wJ(cur);
  return `<div class="mk-seg v3w-seg">${opts.filter(Boolean).map(([v, l, off]) => {
    const on = v3wJ(v) === j, mo = man && v === (man.on || 'manual');
    const a = man ? `data-v3w-pick="${esc(key)}" data-mk="${esc(man.key)}"${mo ? ' data-mo' : ''}${mo && v3Ok(man.val) ? ` data-mt="${esc(v3Fi(man.val, man.fmt, man.d))}" data-sc="${man.fmt === 'pct' ? 100 : 1}"` : ''}` : `data-v3-ov="${esc(key)}"`;
    return `<button type="button" ${a} data-v="${esc(v3wJ(v))}" class="${on ? 'on' : ''}" aria-pressed="${on}"${off && !on ? ' disabled' : ''}>${esc(l)}</button>`;
  }).join('')}</div>`;
}
function v3wSel(x, key, opts, cur, lab) {
  const j = v3wJ(cur);
  return `<select class="select v3w-sel ${x.st.ov[key] ? 'chg' : ''}" data-v3w-sel="${esc(key)}" aria-label="${esc(lab)}">${opts.map(([v, l, off]) => `<option value="${esc(v3wJ(v))}"${v3wJ(v) === j ? ' selected' : ''}${off && v3wJ(v) !== j ? ' disabled' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
const v3wMan = (x, key, fmt, d, lab) => v3In(x, key, v3Base(x.c, key) ?? null, { fmt, d, lab });
const v3wOpt = (items, cls = '') => `<div class="v3-opt v3w-opt ${cls}">${items.filter(Boolean).map(([l, h]) => `<div><span>${l}</span>${h}</div>`).join('')}</div>`;
/* 식을 보여 주는 표: 항목, 값, 근거 세 열. rows [[이름, 값 html, 근거 글, 줄 클래스]]. o는 다시 계산할 때 바뀔 구역 키(없으면 바깥에서 감쌈) */
function v3wFt(o, rows) {
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-ft"><thead><tr><th class="st">항목</th><th>값</th><th class="tx">근거</th></tr></thead><tbody${o ? ` data-o="${o}"` : ''}>${rows.filter(Boolean).map(([n, v, w, cls]) => `<tr class="${cls || ''}"><td class="st">${esc(n)}</td><td>${v}</td><td class="tx">${esc(w || '')}</td></tr>`).join('')}</tbody></table></div>`;
}
const v3wNotes = (o, list) => `<div data-o="${o}" class="v3w-notes">${list.filter(Boolean).map(([t, lv]) => `<p class="v3w-note ${lv || ''}">${esc(t)}</p>`).join('')}</div>`;

v3On('click', '[data-v3w-pick]', (el, x) => {
  const mk = el.dataset.mk, mt = el.dataset.mt;
  v3SetOv(x.c, el.dataset.v3wPick, JSON.parse(el.dataset.v));
  if (el.dataset.mo == null) delete x.st.ov[mk];
  else if (mt != null && !x.st.ov[mk] && v3Base(x.c, mk) == null) v3SetOv(x.c, mk, +mt / (+el.dataset.sc || 1), mt);
  return true;
});
v3On('change', '[data-v3w-sel]', (el, x) => {
  const k = el.dataset.v3wSel, v = JSON.parse(el.value);
  if (v == null && v3Base(x.c, k) == null) delete x.st.ov[k]; else v3SetOv(x.c, k, v);
  return true;
});
v3On('change', '[data-v3w-floor]', (el, x) => {
  const b = x.c.switches.beta_floor, v = el.checked ? null : (b ?? 0.8);
  v3SetOv(x.c, 'sw.beta_floor', v, v == null ? '' : v3Fi(v, 'num', 2));
  return true;
});

// ---------- 7단계 자기자본비용 ----------
function v3wRfSec(x) {
  const m = x.I.market || {}, rf = m.rf || {}, k = x.sw.rf, asof = typeof m.as_of === 'object' ? m.as_of?.rf : m.as_of;
  const opts = [['avg_3m', '3개월 평균'], ['spot', '기준일'], ['avg_1y', '1년 평균'], ['avg_2y', '2년 평균']].map(([v, l]) => [v, v3Ok(rf[v]) ? `${l} ${v3wP2(rf[v])}` : l, !v3Ok(rf[v])]);
  const b0 = v3Ok(rf[k]) ? rf[k] - (x.sw.rf_cds ? +m.cds || 0 : 0) : null;
  return v3Sec('무위험이자율', `<span class="meta">국고채 10년${asof ? `, ${esc(String(asof).slice(0, 10))} 기준` : ''}</span>`,
    v3wOpt([['기간', v3wSw(x, 'sw.rf', opts, k)], ['적용 값', v3In(x, 'm.rf', b0, { fmt: 'pct', d: 2, lab: '무위험이자율' })]]));
}
/* 자동일 때 엔진이 고르는 쪽(step_wacc와 같은 규칙: 상장 2년 이상이고 자본구조 변경이 없으면 회귀) */
function v3wBetaUsed(x) {
  const B = x.I.beta || {}, mode = x.sw.beta_mode, reg = v3V(x, 'WACC.beta_reg'), bu = v3V(x, 'WACC.beta_bu');
  let u = mode !== 'auto' ? mode : (+B.listed_years || 0) >= 2 && !B.capital_change && v3Ok(reg) ? 'regression' : 'bottom_up';
  if ((u === 'regression' && !v3Ok(reg)) || (u === 'bottom_up' && !v3Ok(bu))) u = v3Ok(bu) ? 'bottom_up' : v3Ok(reg) ? 'regression' : u;
  return u;
}
function v3wBetaSec(x) {
  const B = x.I.beta || {}, sw = x.sw, tgt = B.target || {}, peers = v3wPeers(x), win = sw.beta_window, w = +sw.beta_adj_w, V = (id) => v3V(x, id);
  const rawOf = (p, k) => (p.raw != null && typeof p.raw === 'object' ? p.raw[k] : p.raw), inc = (p) => (p.include === undefined ? true : !!p.include);
  const wins = [...new Set([...Object.keys(tgt), ...peers.flatMap((p) => (p.raw != null && typeof p.raw === 'object' ? Object.keys(p.raw) : []))])];
  const used = v3wBetaUsed(x), reg = V('WACC.beta_reg'), bu = V('WACC.beta_bu'), beta = V('WACC.beta'), fl = sw.beta_floor, tm = V('WACC.t_m'), au = sw.beta_adj_on === 'unlevered';
  const modes = [['auto', '자동'], ['regression', '회귀', !v3Ok(reg)], ['bottom_up', '바텀업', !v3Ok(bu)], ['manual', '직접 입력']];
  const top = v3wOpt([['방식', v3wSw(x, 'sw.beta_mode', modes, sw.beta_mode, { key: 'i.beta.manual', val: beta, fmt: 'num', d: 2 })],
    sw.beta_mode === 'manual' ? ['베타', v3wMan(x, 'i.beta.manual', 'num', 2, '베타 직접 입력')] : null,
    wins.length ? ['회귀 창', v3wSw(x, 'sw.beta_window', wins.map((k) => [k, v3wWin(k), !(v3Ok(tgt[k]?.raw) || peers.some((p) => v3Ok(rawOf(p, k))))]), win)] : null]);
  const regRows = wins.filter((k) => tgt[k]).map((k) => {
    const t = tgt[k];
    return `<tr class="${k === win ? 'v3w-on' : ''}"><td class="st">${esc(v3wWin(k))}</td><td>${v3wB(t.raw)}</td><td>${v3wB(t.se)}</td><td>${v3wB(t.r2, 2)}</td><td>${v3Num(t.n)}</td><td>${Array.isArray(t.ci95) ? `${v3wB(t.ci95[0], 2)}～${v3wB(t.ci95[1], 2)}` : '-'}</td></tr>`;
  }).join('');
  const regTbl = regRows ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t"><thead><tr><th class="st">창</th><th>원 베타</th><th>표준오차</th><th>R²</th><th>관측수</th><th>95% 구간</th></tr></thead><tbody>${regRows}</tbody></table></div>`
    : '<div class="empty">회귀 베타 자료가 없습니다.</div>';
  const n = peers.filter((p) => inc(p) && v3Ok(rawOf(p, win))).length;
  const peerRows = peers.map((p, i) => {
    const r = rawOf(p, win), on = inc(p);
    return `<tr class="${on ? '' : 'v3w-off'}"><td class="st">${v3Chk(x, `i.beta.peers.${i}.include`, on, esc(p.name || p.code || ''))}</td><td>${v3wB(r)}</td><td data-o="w7pa${i}">${v3Ok(r) ? v3wB(r * w + (1 - w)) : '-'}</td><td>${v3wP1(p.de)}</td><td data-o="w7pu${i}">${on ? v3wB(V(`WACC.beta_u.${p.code ?? p.name}`)) : '-'}</td></tr>`;
  }).join('');
  const peerTbl = peers.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-pt"><thead><tr><th class="st">회사</th><th>원 베타</th><th>조정 베타</th><th>D/E</th><th>무차입 베타</th></tr></thead><tbody>${peerRows}
      <tr class="sum" data-o="w7pf"><td class="st">포함 ${n}곳 ${V3W_STAT[sw.beta_stat] || ''}</td><td></td><td></td><td></td><td>${v3wB(V('WACC.beta_u_peer'))}</td></tr></tbody></table></div>`
    : '<div class="empty">비교기업 베타 자료가 없습니다.</div>';
  const calc = used === 'regression' ? reg : bu, floored = fl != null && used !== 'manual' && v3Ok(calc) && calc < +fl;
  const flText = floored ? (v3wChk(x, 'beta_floor')[0]?.text || `베타 하한 ${v3wN(fl)} 적용`) : '';
  const lev = '× (1 + (1 − 한계세율) × 목표 D/E)';
  const ft = v3wFt('w7b', [
    ['원 베타', v3wB(V('WACC.beta_raw')), `${x.t.name || ''} ${v3wWin(win)} 회귀`.trim()],
    ['조정 베타', v3wB(V('WACC.beta_adj')), `원 베타 × ${v3wP1(w)} + 1 × ${v3wP1(1 - w)}`],
    ['무차입 베타', v3wB(V('WACC.beta_u')), au ? '무차입한 원 베타에 조정 적용' : `조정 베타 ÷ (1 + (1 − 한계세율 ${v3wP1(tm)}) × D/E ${v3wP1(V('WACC.de'))})`],
    ['비교기업 무차입 베타', v3wB(V('WACC.beta_u_peer')), `포함 ${n}곳 ${V3W_STAT[sw.beta_stat] || ''}`],
    ['목표 D/E', v3wP1(V('WACC.de_target')), { current: '현재 자본구조', peer_median: '비교기업 D/E 중앙값', manual: '직접 입력' }[sw.cap_struct] || ''],
    ['회귀 재차입 베타', v3wB(reg), `무차입 베타 ${lev}`, used === 'regression' ? 'v3w-on' : ''],
    ['바텀업 재차입 베타', v3wB(bu), `비교기업 무차입 베타 ${lev}`, used === 'bottom_up' ? 'v3w-on' : ''],
    ['적용 베타', v3wB(beta), [sw.beta_mode === 'auto' ? `${V3W_BETA[used] || used} 자동 선택` : V3W_BETA[used] || used, flText].filter(Boolean).join(', '), 'sum']]);
  const adj = v3wOpt([['조정 비중', v3In(x, 'sw.beta_adj_w', x.c.switches.beta_adj_w, { fmt: 'pct', d: 2, lab: '조정 비중' })],
    ['하한', `${v3In(x, 'sw.beta_floor', x.c.switches.beta_floor ?? null, { fmt: 'num', d: 2, lab: '베타 하한', dis: fl == null })}<label class="v3-ck"><input type="checkbox" data-v3w-floor${fl == null ? ' checked' : ''}><span>하한 없음</span></label>`]]);
  return v3Sec('베타', '', `<div class="v3w-st">${top}
    <h3 class="v3-h3">회귀 베타<small>${esc(x.t.name || '')}</small></h3>${regTbl}
    <div class="v3w-hd"><h3 class="v3-h3">바텀업 비교기업</h3>${v3wOpt([['대표값', v3wSw(x, 'sw.beta_stat', Object.entries(V3W_STAT), sw.beta_stat)]])}</div>${peerTbl}
    <div class="v3w-hd"><h3 class="v3-h3">적용 베타</h3>${adj}</div>${ft}</div>`);
}
function v3wErpSec(x) {
  const m = x.I.market || {}, e = m.erp || {}, k = x.sw.erp, EK = { damodaran: 'total', damodaran_cds: 'total_cds', implied_kospi: 'implied', historical: 'historical' };
  const opts = [['damodaran', 'Damodaran 국가 등급'], ['damodaran_cds', 'Damodaran CDS'], ['implied_kospi', 'KOSPI 내재'], ['historical', '과거 평균']].map(([v, l]) => [v, v3Ok(e[EK[v]]) ? `${l} ${v3wP2(e[EK[v]])}` : l, !v3Ok(e[EK[v]])]);
  const b0 = v3Ok(e[EK[k]]) ? e[EK[k]] : null, erp = v3V(x, 'WACC.erp'), asof = typeof m.as_of === 'object' ? m.as_of?.erp : '';
  const dam = x.ov['m.erp'] == null && (k === 'damodaran' || k === 'damodaran_cds') && v3Ok(e.mature) && v3Ok(erp);
  const ft = dam ? v3wFt('', [['성숙시장 프리미엄', v3wP2(e.mature), 'Damodaran 성숙시장'], ['국가위험 프리미엄', v3wP2(erp - e.mature), k === 'damodaran' ? '한국 국가 등급 기준' : '한국 CDS 기준'],
    ['주식위험프리미엄', v3wP2(erp), '성숙시장 프리미엄 + 국가위험 프리미엄', 'sum']]) : '';
  return v3Sec('주식위험프리미엄', /^\d{4}-\d{2}-\d{2}/.test(asof || '') ? `<span class="meta">${esc(asof.slice(0, 10))} 기준</span>` : '',
    `<div class="v3w-st">${v3wOpt([['출처', v3wSw(x, 'sw.erp', opts, k)], ['적용 값', v3In(x, 'm.erp', b0, { fmt: 'pct', d: 2, lab: '주식위험프리미엄' })]])}<div data-o="w7e">${ft}</div></div>`);
}
function v3wPremSec(x) {
  const s = x.c.switches, ck = v3wChk(x, 'premium_evidence')[0];
  const ins = [['규모', 'prem_size'], ['개별', 'prem_spec'], ['국가', 'prem_country']].map(([l, k]) => v3F(l, v3In(x, `sw.${k}`, s[k] ?? 0, { fmt: 'pct', d: 2, lab: `${l} 프리미엄` }))).join('');
  return v3Sec('추가 위험', `<span class="meta" data-o="w7pm">합계 ${v3wP2(v3V(x, 'WACC.prem'))}</span>`, `<div class="v3w-st"><div class="v3-fs">${ins}</div>${v3wNotes('w7pn', [ck ? [ck.text, 'warn'] : null])}</div>`);
}
function v3wKeSec(x) {
  const V = (id) => v3V(x, id), rf = v3wP2(V('WACC.rf')), erp = v3wP2(V('WACC.erp')), pr = v3wP2(V('WACC.prem'));
  return v3Sec('자기자본비용', '', v3wFt('w7k', [
    ['자기자본비용', v3wP2(V('WACC.ke')), `무위험이자율 ${rf} + 베타 ${v3wB(V('WACC.beta'), 2)} × 주식위험프리미엄 ${erp} + 추가 위험 ${pr}`, 'key'],
    ['안정기 자기자본비용', v3wP2(V('WACC.ke_s')), `같은 식에 안정기 베타 ${v3wB(V('WACC.beta_s'), 2)}`]]));
}
v3Step(7, (x) => v3wRfSec(x) + v3wBetaSec(x) + v3wErpSec(x) + v3wPremSec(x) + v3wKeSec(x));

// ---------- 8단계 타인자본비용 ----------
/* 합성 등급 표에서 지금 줄(엔진 v3eSynthetic과 같은 규칙: 시가총액이 기준 미만이면 소형사 표, 이자보상배율이 하한 이상인 첫 줄) */
function v3wSyn(x) {
  const sp = x.I.market?.spread || {}, mcap = v3V(x, 'WACC.mcap'), cov = v3V(x, 'WACC.cov');
  const small = v3Ok(mcap) && !!sp.large_cap_krw && mcap * 1e8 < sp.large_cap_krw, rows = (small ? sp.small : sp.large) || [];
  let i = v3Ok(cov) ? rows.findIndex(([lo]) => lo == null || cov >= lo) : 0;
  if (i < 0) i = rows.length - 1;
  return { rows, small, i, cap: sp.large_cap_krw, rating: rows[i]?.[1] ?? '-' };
}
function v3wKdSec(x) {
  const m = x.I.market || {}, B = x.I.beta || {}, sw = x.sw, V = (id) => v3V(x, id), kr = m.spread?.kr_rating || {}, cr = B.credit_rating, hasR = !!cr && kr[cr] != null;
  const eff = V('CTL.a.debt_rate'), kdp = V('WACC.kd_pre'), rf = V('WACC.rf'), auto = sw.kd === 'auto';
  let path = auto ? (x.res.map || [])[7]?.why : sw.kd;
  if (!V3W_KD[path]) path = 'synthetic';
  const opts = [['auto', '자동'], ['synthetic', '합성 등급'], ['rating', '실제 등급', !hasR], ['effective', '실효이자율', !v3Ok(eff)], ['market_yield', '회사채 수익률', m.kd_market_yield == null], ['manual', '직접 입력']];
  const ibd = V('WACC.ibd'), mcap = V('WACC.mcap'), exl = v3Ok(ibd) ? ibd - (+x.I.bridge?.debt?.lease || 0) : null, low = v3Ok(exl) && v3Ok(mcap) && exl < 0.05 * mcap;
  const why = !auto ? '' : { market_yield: '회사채 시장 수익률이 있어 자동 선택', rating: '실제 신용등급이 있어 자동 선택', effective: '리스를 뺀 차입금이 시가총액의 5% 이상이라 자동 선택',
    synthetic: low ? '리스를 뺀 차입금이 시가총액의 5% 미만이라 자동 선택' : '자동 선택' }[path] || '자동 선택';
  const pre = { synthetic: [['무위험이자율', v3wP2(rf), ''], ['신용 스프레드', v3wP2(V('WACC.spread')), `합성 등급 ${v3wSyn(x).rating}`], ['세전 타인자본비용', v3wP2(kdp), '무위험이자율 + 신용 스프레드']],
    rating: [['무위험이자율', v3wP2(rf), ''], ['신용 스프레드', v3wP2(kr[cr]), `실제 등급 ${cr || ''} 국내 스프레드`], ['세전 타인자본비용', v3wP2(kdp), '무위험이자율 + 신용 스프레드']],
    effective: [['세전 타인자본비용', v3wP2(kdp), '직전 결산 차입 실효이자율']], market_yield: [['세전 타인자본비용', v3wP2(kdp), '회사채 시장 수익률']],
    manual: [['세전 타인자본비용', v3wP2(kdp), '직접 입력']] }[path] || [['세전 타인자본비용', v3wP2(kdp), V3W_KD[path]]];
  const ft = v3wFt('w8k', [['적용 방식', esc(V3W_KD[path]), why], ...pre, ['한계세율', v3wP1(V('WACC.t_m')), ''], ['세후 타인자본비용', v3wP2(V('WACC.kd')), '세전 타인자본비용 × (1 − 한계세율)', 'key']]);
  const krs = Object.keys(kr);
  const top = v3wOpt([['방식', v3wSw(x, 'sw.kd', opts, sw.kd, { key: 'i.market.kd_manual', val: kdp, fmt: 'pct', d: 2 })],
    sw.kd === 'manual' ? ['세전 타인자본비용', v3wMan(x, 'i.market.kd_manual', 'pct', 2, '세전 타인자본비용 직접 입력')] : null,
    krs.length ? ['실제 등급', v3wSel(x, 'i.beta.credit_rating', [[null, '없음'], ...krs.map((r) => [r, `${r} ${v3wP2(kr[r])}`])], cr ?? null, '실제 신용등급')] : null]);
  return v3Sec('타인자본비용', '', `<div class="v3w-st">${top}${ft}</div>`);
}
function v3wSynSec(x) {
  const W = x.I.wacc_in || {}, sw = x.sw, s = v3wSyn(x), cov = v3V(x, 'WACC.cov'), mcap = v3V(x, 'WACC.mcap');
  const M = { ebit_ltm_int_fy0: ['최근 12개월 영업이익', W.ebit_ltm, '직전 결산 이자비용', W.int_fy0], ltm_ltm: ['최근 12개월 영업이익', W.ebit_ltm, '최근 12개월 이자비용', W.int_ltm],
    fy0_fy0: ['직전 결산 영업이익', v3V(x, 'IS.ebit', x.tl.H - 1), '직전 결산 이자비용', W.int_fy0], ebitda: ['최근 12개월 EBITDA', W.ebitda_ltm, '직전 결산 이자비용', W.int_fy0] };
  const cur = M[sw.cov_basis] || ['영업이익', null, '이자비용', null];
  const opts = Object.entries(M).map(([k, [a, av, b, bv]]) => [k, `${a} ÷ ${b}`, !(v3Ok(av) && v3Ok(bv) && +bv !== 0)]);
  const ft = v3wFt('w8c', [[cur[0], v3Eok(cur[1]), ''], [cur[2], v3Eok(cur[3], 1), ''], ['이자보상배율', v3X(cov, 1), `${cur[0]} ÷ ${cur[2]}`],
    ['등급 표', s.small ? '소형사' : '대형사', s.cap ? `시가총액 ${v3Eok(mcap)}, 대형사 기준 ${v3Eok(s.cap / 1e8)} 이상` : ''],
    ['합성 등급', esc(s.rating), ''], ['신용 스프레드', v3wP2(v3V(x, 'WACC.spread')), '', 'sum']]);
  const gt = s.rows.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-gt"><thead><tr><th class="st">이자보상배율</th><th>등급</th><th>스프레드</th></tr></thead><tbody>${s.rows.map(([lo, rt, spd], i) => `<tr class="${i === s.i ? 'v3w-on' : ''}"><td class="st">${lo != null ? `${v3wN(lo)}배 이상` : i ? `${v3wN(s.rows[i - 1][0])}배 미만` : '전 구간'}</td><td>${esc(rt)}</td><td>${v3wP2(spd)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">등급별 스프레드 표가 없습니다.</div>';
  return v3Sec('합성 등급', `<span class="meta">${s.small ? '소형사' : '대형사'} 표</span>`, `<div class="v3w-st">${v3wOpt([['이자보상배율 기준', v3wSel(x, 'sw.cov_basis', opts, sw.cov_basis, '이자보상배율 기준')]])}
    <div class="v3-two"><div>${ft}</div><div>${gt}</div></div></div>`);
}
v3Step(8, (x) => v3wKdSec(x) + v3wSynSec(x));

// ---------- 9단계 할인율 확정 ----------
function v3wCapSec(x) {
  const V = (id) => v3V(x, id), sw = x.sw, we = V('WACC.we'), wd = V('WACC.wd'), det = V('WACC.de_target'), np = !v3wPeers(x).length;
  const donut = v3Ok(we) && v3Ok(wd) ? v3cDonut({ w: 168, title: '자본구조', items: [{ label: '자기자본', value: we, cls: 's1' }, { label: '부채', value: wd, cls: 's3' }], center: [v3wP1(we), '자기자본'], fmt: v3wP1 })
    + v3cLegend([{ label: `자기자본 ${v3wP1(we)}`, cls: 's1' }, { label: `부채 ${v3wP1(wd)}`, cls: 's3' }]) : '';
  const top = v3wOpt([['목표 자본구조', v3wSw(x, 'sw.cap_struct', [['current', '현재'], ['peer_median', '비교기업 중앙값', np], ['manual', '직접 입력']], sw.cap_struct, { key: 'i.beta.de_manual', val: det, fmt: 'pct', d: 2 })],
    sw.cap_struct === 'manual' ? ['목표 D/E', v3wMan(x, 'i.beta.de_manual', 'pct', 2, '목표 D/E 직접 입력')] : null]);
  const ft = v3wFt('w9c', [['시가총액', v3Eok(V('WACC.mcap')), x.t.val_date ? `${x.t.val_date} 종가` : ''], ['이자부부채', v3Eok(V('WACC.ibd')), '리스부채 포함'], ['D/E', v3wP1(V('WACC.de')), '이자부부채 ÷ 시가총액'],
    ['목표 D/E', v3wP1(det), { current: '현재 D/E', peer_median: '비교기업 D/E 중앙값', manual: '직접 입력' }[sw.cap_struct] || ''],
    ['자기자본 비중', v3wP1(we), '1 ÷ (1 + 목표 D/E)'], ['부채 비중', v3wP1(wd), '목표 D/E ÷ (1 + 목표 D/E)']]);
  return v3Sec('자본구조', '<span class="meta">단위 억원</span>', `<div class="v3w-cap"><div class="v3w-donut" data-o="w9d">${donut}</div><div class="v3w-st">${top}${ft}</div></div>`);
}
function v3wWaccSec(x) {
  const V = (id) => v3V(x, id), sw = x.sw, np = !v3wPeers(x).length, we = V('WACC.we'), wd = V('WACC.wd'), ke = V('WACC.ke'), kd = V('WACC.kd'), des = V('WACC.de_s'), wds = v3Ok(des) ? des / (1 + des) : null;
  const w0 = x.c.switches.wacc_override ?? (v3Ok(we) && v3Ok(ke) && v3Ok(kd) ? we * ke + wd * kd : null), ovr = x.ov['o.wacc'] != null || sw.wacc_override != null;
  const fw = [['linear', '안정기까지 직선'], ['same', '명시 기간 유지'], sw.fade_wacc === 'from_start' ? ['from_start', '첫해부터 직선'] : null];
  const top = v3wOpt([['안정기 베타', v3wSw(x, 'sw.stable_beta', [['clamp', '0.8～1.2 범위'], ['one', '1.0'], ['same', '명시 기간과 같음'], ['manual', '직접 입력']], sw.stable_beta, { key: 'i.beta.stable_manual', val: V('WACC.beta_s'), fmt: 'num', d: 2 })],
    sw.stable_beta === 'manual' ? ['베타', v3wMan(x, 'i.beta.stable_manual', 'num', 2, '안정기 베타 직접 입력')] : null,
    ['안정기 자본구조', v3wSw(x, 'sw.stable_cap', [['same', '명시 기간과 같음'], ['peer_median', '비교기업 중앙값', np]], sw.stable_cap)],
    ['전환 기간 할인율', v3wSw(x, 'sw.fade_wacc', fw, sw.fade_wacc)],
    ['WACC 적용 값', v3In(x, 'o.wacc', w0, { fmt: 'pct', d: 2, lab: 'WACC 직접 입력' })]]);
  const rows = [['베타', v3wB(V('WACC.beta'), 2), v3wB(V('WACC.beta_s'), 2)], ['자기자본비용', v3wP2(ke), v3wP2(V('WACC.ke_s'))], ['세후 타인자본비용', v3wP2(kd), v3wP2(kd)],
    ['자기자본 비중', v3wP1(we), v3wP1(v3Ok(wds) ? 1 - wds : null)], ['부채 비중', v3wP1(wd), v3wP1(wds)], ['WACC', v3wP2(V('WACC.wacc')), v3wP2(V('WACC.wacc_s')), 'key']];
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-wt"><thead><tr><th class="st">항목</th><th>명시 기간</th><th>안정기</th></tr></thead><tbody data-o="w9w">${rows.map(([n, a, b, cls]) => `<tr class="${cls || ''}"><td class="st">${n}</td><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table></div>`;
  const ys = v3Years(x, 'dcf'), wt = v3Row(x, 'DCF.wacc_t') || [], N = x.tl.N;
  const yt = wt.length ? `<h3 class="v3-h3">연도별 할인율</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3w-t"><thead><tr><th class="st">연도</th>${ys.map((y, i) => `<th class="${i === N && N ? 'bl' : ''}">${y.label}</th>`).join('')}</tr></thead>
    <tbody data-o="w9y"><tr><td class="st">할인율</td>${ys.map((_, i) => `<td class="${i === N && N ? 'bl' : ''}">${v3wP2(wt[i])}</td>`).join('')}</tr></tbody></table></div>` : '';
  return v3Sec('WACC', '', `<div class="v3w-st">${top}${v3wNotes('w9n', [ovr ? ['직접 입력한 WACC를 명시 기간과 안정기에 같이 씁니다.', 'warn'] : null])}${tbl}${yt}</div>`);
}
v3Step(9, (x) => v3wCapSec(x) + v3wWaccSec(x));

// ---------- 10단계 성장 단계와 종료가치 ----------
function v3wFadeTbl(x) {
  const ys = v3Years(x, 'dcf'), a = Math.max(0, x.tl.N - 1), cols = ys.slice(a), D = { 'DCF.wacc_t': 2 };
  const ids = V3W_FADE.filter(([id]) => (v3Row(x, id) || []).length === ys.length);
  if (!ids.length || !cols.length) return '<div class="empty">전환 기간 계산값이 없습니다.</div>';
  const bl = (i) => (i === 1 ? 'bl' : '');
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t"><thead><tr><th class="st">항목</th>${cols.map((y, i) => `<th class="${bl(i)}">${y.label}</th>`).join('')}</tr></thead><tbody data-o="w10f">${ids.map(([id, nm, cls]) => {
    const r = v3Row(x, id), f = v3Lab(x, id).fmt;
    return `<tr class="${cls || ''}"><td class="st">${nm}</td>${cols.map((_, i) => `<td class="${bl(i)}">${v3Fmt(r[a + i], f, D[id])}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;
}
function v3wFadeSec(x) {
  const sw = x.sw, { N, M } = x.tl, ys = v3Years(x, 'dcf'), g = v3Row(x, 'DCF.g') || [], mg = v3Row(x, 'DCF.margin') || [], gs = v3V(x, 'DCF.g_s');
  const fw = [['linear', '안정기까지 직선'], ['same', '명시 기간 유지'], sw.fade_wacc === 'from_start' ? ['from_start', '첫해부터 직선'] : null];
  const top = v3wOpt([['성장률', v3wSw(x, 'sw.fade_growth', [['linear', '영구성장률까지 직선'], ['avg_const', '평균으로 고정']], sw.fade_growth)],
    ['이익률', v3wSw(x, 'sw.fade_margin', [['hold', '마지막 해 유지'], ['avg2', '마지막 두 해 평균', N < 2], ['to_target', '목표까지 직선']], sw.fade_margin, { key: 'sw.fade_margin_target', val: mg[mg.length - 1], fmt: 'pct', d: 2, on: 'to_target' })],
    sw.fade_margin === 'to_target' ? ['목표 이익률', v3wMan(x, 'sw.fade_margin_target', 'pct', 2, '목표 이익률')] : null,
    ['재투자', v3wSw(x, 'sw.fade_reinv', [['g_over_roc', '성장률 ÷ ROC'], ['grow', '성장률만큼 증가'], ['sales_pct', '매출 대비 비율']], sw.fade_reinv)],
    ['할인율', v3wSw(x, 'sw.fade_wacc', fw, sw.fade_wacc)]]);
  const pf = (v) => v3Pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? 0 : 1);
  const chart = g.length ? `<h3 class="v3-h3">성장률과 영업이익률</h3><div data-o="w10c">${v3cLines({ w: v3Wd(x, 1, v3wSide(x)), h: 220, labels: ys.map((y) => y.label), fc: N, fmt: pf,
    lines: [{ name: '성장률', values: g, cls: 's1' }, { name: '영업이익률', values: mg, cls: 's3' }], hlines: v3Ok(gs) ? [{ v: gs, label: `영구성장률 ${v3wP2(gs)}`, cls: 's5' }] : [] })}
    ${v3cLegend([{ label: '성장률', cls: 's1', kind: 'line' }, { label: '영업이익률', cls: 's3', kind: 'line' }, { label: M ? '전환 기간과 종료연도' : '종료연도', cls: 's5', kind: 'dash' }])}</div>` : '';
  return v3Sec('전환 기간', '<span class="meta">단위 억원</span>', `<div class="v3w-st">${top}${M ? '' : '<p class="v3w-note">전환 기간이 0년이라 위 방식은 쓰이지 않습니다.</p>'}${v3wFadeTbl(x)}${chart}</div>`);
}
/* 직접 입력(o.g)이 없을 때의 영구성장률(step_macro와 같은 규칙: 출처 값, 상한을 켜면 무위험이자율 이하) */
function v3wG0(x) {
  const m = x.I.market || {}, rf = v3V(x, 'WACC.rf'), raw = { cpi10: m.cpi10, rf, gdp_nominal: m.gdp10, manual: m.g_manual }[x.sw.g];
  return { raw, g: !v3Ok(raw) ? null : x.sw.g_cap && v3Ok(rf) ? Math.min(raw, rf) : raw, rf };
}
function v3wTvSec(x) {
  const m = x.I.market || {}, sw = x.sw, V = (id, i) => v3V(x, id, i), { N, M } = x.tl, L = N + M, tv = V('DCF.tv'), ok = v3Ok(tv), ex = sw.tv === 'exit_mult';
  const g0 = v3wG0(x), man = x.ov['o.g'] != null;
  const src = [['cpi10', '소비자물가 10년 평균', m.cpi10], ['rf', '무위험이자율', g0.rf], ['gdp_nominal', '명목 GDP 성장률 10년 평균', m.gdp10], sw.g === 'manual' ? ['manual', '사례 입력', m.g_manual] : null].filter(Boolean)
    .map(([k, l, v]) => [k, v3Ok(v) ? `${l} ${v3wP2(v)}` : l, !v3Ok(v)]);
  const cap = !man && sw.g_cap && v3Ok(g0.raw) && v3Ok(g0.rf) && g0.raw > g0.rf;
  const notes = [man ? ['직접 입력한 값을 출처와 상한보다 먼저 씁니다.', ''] : null, cap ? [`상한에 걸려 무위험이자율 ${v3wP2(g0.rf)}를 씁니다.`, ''] : null, ...v3wChk(x, 'g_vs_rate').map((k) => [k.text, k.level === 'err' ? 'err' : 'warn'])];
  const mk = x.c.input.rel?.exit_mult != null ? 'i.rel.exit_mult' : 'sw.exit_mult', mult = x.I.rel?.exit_mult ?? sw.exit_mult;
  const mg = v3Row(x, 'DCF.margin') || [], m0 = x.c.switches.ty_margin ?? mg[L - 1], yl = M ? x.tl.fade[M - 1] : x.tl.fc[N - 1];
  const MET = { ev_ebitda: ['EV/EBITDA', 'EBITDA', v3Ok(tv) && +mult ? tv / mult : null], ev_ebit: ['EV/EBIT', '영업이익', V('DCF.ebit', L - 1)], ev_sales: ['EV/매출', '매출', V('DCF.rev', L - 1)] };
  const met = MET[sw.exit_metric] || MET.ev_ebitda;
  const left = `<div class="v3w-st"><h3 class="v3-h3">영구성장률</h3>${v3wOpt([['출처', v3wSw(x, 'sw.g', src, sw.g)], ['상한', v3Chk(x, 'sw.g_cap', !!sw.g_cap, '무위험이자율 이하')],
    ['적용 값', v3In(x, 'o.g', g0.g, { fmt: 'pct', d: 2, lab: '영구성장률' })]], 'v3w-col')}${v3wNotes('w10g', notes)}
    <h3 class="v3-h3">종료연도</h3>${v3wOpt([['종료가치 방식', v3wSw(x, 'sw.tv', [['gordon', '영구성장'], ['exit_mult', '배수'], sw.tv === 'finite' ? ['finite', '종료가치 없음'] : null], sw.tv)],
    ex ? ['배수 기준', v3wSw(x, 'sw.exit_metric', Object.entries(MET).map(([k, v]) => [k, v[0]]), sw.exit_metric)] : null,
    ex ? ['적용 배수', v3In(x, mk, v3Base(x.c, mk) ?? null, { fmt: 'x', d: 2, lab: '종료가치 배수' })] : null,
    ['안정기 ROC', v3wSw(x, 'sw.roc_s', [['wacc', '안정기 WACC'], ['manual', '직접 입력']], sw.roc_s, { key: 'sw.roc_s_manual', val: V('DCF.roic', L), fmt: 'pct', d: 2 })],
    sw.roc_s === 'manual' ? ['ROC 값', v3wMan(x, 'sw.roc_s_manual', 'pct', 2, '안정기 ROC 직접 입력')] : null,
    ['영업이익률', v3In(x, 'o.ty_margin', m0, { fmt: 'pct', d: 2, lab: '종료연도 영업이익률' })]], 'v3w-col')}</div>`;
  const R = (k, v, cls = '') => `<tr class="${cls}"><th>${k}</th><td>${v}</td></tr>`;
  const ty = ex ? R(`${yl}년 ${met[1]}`, v3Eok(met[2])) + R(`적용 ${met[0]}`, v3X(mult))
    : R('종료연도 매출', v3Eok(V('DCF.rev', L))) + R('영구성장률', v3wP2(V('DCF.g_s'))) + R('영업이익률', v3wP1(V('DCF.margin', L))) + R('영업이익', v3Eok(V('DCF.ebit', L))) + R('세율', v3wP1(V('DCF.tax_r', L)))
      + R('세후영업이익', v3Eok(V('DCF.nopat', L))) + R('재투자율', v3wP1(V('DCF.rr', L))) + R('재투자', v3Eok(V('DCF.reinv', L))) + R('FCFF', v3Eok(V('DCF.fcff', L)), 'v3w-b') + R('안정기 WACC', v3wP2(V('WACC.wacc_s')));
  const res = ok ? R('종료가치', v3Eok(tv), 'k') + R('할인계수', v3Num(V('DCF.df', L), 3)) + R('종료가치 현재가치', v3Eok(V('DCF.pv_tv')), 'k') + R('종료가치 비중', v3wP1(V('DCF.tv_share')))
    + (v3Ok(V('DCF.tv_implied')) && !(ex && met === MET.ev_ebitda) ? R('환산 EV/EBITDA', v3X(V('DCF.tv_implied'), 1)) : '') : '';
  const calc = `<div data-o="w10t"><table class="va-calc"><tbody>${ty}</tbody>${ok ? `<tbody class="res">${res}</tbody>` : ''}</table>${ok ? '' : '<div class="empty">영구성장률이 안정기 WACC 이상이라 종료가치를 계산할 수 없습니다.</div>'}</div>`;
  return v3Sec('영구성장률과 종료가치', '<span class="meta">단위 억원</span>', `<div class="v3-two">${left}${calc}</div>`);
}
function v3wDiscSec(x) {
  const sw = x.sw, V = (id, i) => v3V(x, id, i), t = x.t, ytd = x.I.ytd?.['DCF.fcff'] != null;
  const top = v3wOpt([['할인 시점', v3wSw(x, 'sw.discount', [['end', '기말'], ['mid', '기중']], sw.discount)],
    ['첫해 반영', v3wSw(x, 'sw.stub', [['bs', '남은 기간'], ['full', '한 해 전부'], ['ytd_actual', '누적 실적 차감', !ytd]], sw.stub)],
    ['반올림 단위', v3wSw(x, 'sw.round', [1, 10, 100, 1000].map((u) => [u, `${v3Num(u)}원`]), sw.round)]]);
  const ft = v3wFt('w10d', [['결산 뒤 지난 기간', `${v3Num(V('CTL.elapsed'), 2)}년`, [t.fy0_end ? `결산일 ${t.fy0_end}` : '', t.val_date ? `기준일 ${t.val_date}` : ''].filter(Boolean).join(', ')],
    ['첫해 반영 비율', v3wP1(V('CTL.stub')), { bs: t.bs_date ? `재무상태표 ${t.bs_date} 뒤 남은 기간` : '재무상태표 기준일 뒤 남은 기간', full: '첫해 FCFF 전부', ytd_actual: '첫해 FCFF에서 누적 실적 차감' }[sw.stub] || ''],
    ['첫해 할인 시점', `${v3Num(V('DCF.t', 0), 2)}년`, sw.discount === 'mid' ? '남은 기간의 가운데' : '첫해 말'],
    ['주당 가치', v3Won(V('DCF.ps')), `반올림 전 ${v3Won(V('DCF.ps_raw'))}`, 'sum']]);
  return v3Sec('할인 방식', '', `<div class="v3w-st">${top}${ft}</div>`);
}
v3Step(10, (x) => v3wFadeSec(x) + v3wTvSec(x) + v3wDiscSec(x));

// ---------- 입력 탭 11～15단계: 비영업자산, 비주주청구권, 주식 수, 시나리오 근거, 상대가치 결합 (v3b*) ----------
// 11～13단계는 같은 틀: 항목 표(v3bItems: 항목, 입력, 넣는 금액, 근거) + 계산표(v3bCalc: table.va-calc).
// 다리 항목은 시나리오 공통이고 영업가치, 주주가치, 주당 가치만 고른 시나리오 값.
// 엔진이 읽지 않아 입력으로 만들지 않은 것: sw.assoc_value, sw.scn_rule, bridge.date, shares.date(읽기 전용으로만 보여 줌)
const V3B_DEBT = { st: '단기차입금', lt: '장기차입금', bond: '사채', cb: '전환사채', lease: '리스부채', deriv: '파생상품부채' };
const V3B_REVV = { g: '성장률', val: '매출', qty: '수량', price: '단가', mkt: '시장 규모', share: '점유율', net_ratio: '순매출 비율', fx: '환율' };
const V3B_RULE = { research: '리서치 값 우선' };
const V3B_ASSOC = { book: '장부가', market: '시가' };
const v3bSum = (a) => (a || []).reduce((s, v) => s + (+v || 0), 0);
const v3bSh = (v) => (v3Ok(v) ? `${v3Num(v)}주` : '-');
const v3bUp = (u) => v3Up(u) || '-';
const v3bScDot = (x, extra = '') => `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc}${extra ? `, ${extra}` : ''}</span>`;
const v3bRo = (lab, val) => `<div><span>${lab}</span><b class="v3b-ro">${esc(val)}</b></div>`;

/* 항목 표. cols {first, val: 입력 열 머리, put: 넣는 금액 열 머리(없으면 그 열 없음)}
   rows [{grp: 묶음 제목} | {name, sub, inp: 입력 칸 html, put: 넣는 금액 html, o: data-o 키, off: 스위치가 꺼져 0으로 들어감, why}] */
function v3bItems(cols, rows) {
  const hasWhy = rows.some((r) => r.why), n = 2 + (cols.put ? 1 : 0) + (hasWhy ? 1 : 0);
  const head = `<tr><th class="st">${cols.first || '항목'}</th><th>${cols.val}</th>${cols.put ? `<th>${cols.put}</th>` : ''}${hasWhy ? '<th class="tx why">근거</th>' : ''}</tr>`;
  const body = rows.map((r) => (r.grp ? `<tr class="grp"><td class="tx" colspan="${n}">${esc(r.grp)}</td></tr>`
    : `<tr class="${r.off ? 'off' : ''}"><td class="st">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td><td class="in">${r.inp || ''}</td>${cols.put ? `<td class="put" data-o="${esc(r.o)}">${r.put}</td>` : ''}${hasWhy ? `<td class="tx why">${v3Why(r.why)}</td>` : ''}</tr>`)).join('');
  return `<div class="mk-scroll${hasWhy ? '' : ' v3b-nw'}"><table class="mk-tbl v3-t v3b-it"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
/* 계산표. 줄 [연산 기호, 이름, 값 html, 클래스(sum, off, k, big), 이름 옆 작은 글]. res는 결과 묶음(파란 바탕) */
const v3bRow = ([op, name, val, cls, sub]) => `<tr class="${cls || ''}"><th><i>${op || ''}</i>${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</th><td>${val}</td></tr>`;
const v3bCalc = (o, rows, res) => `<div class="v3b-calc" data-o="${o}"><table class="va-calc"><tbody>${rows.map(v3bRow).join('')}</tbody>${res && res.length ? `<tbody class="res">${res.map(v3bRow).join('')}</tbody>` : ''}</table></div>`;

// ---------- 11 비영업자산 ----------
v3Step(11, (x, c) => {
  const br0 = c.input.bridge || {}, br = x.I.bridge || {}, sw = x.sw;
  const amt = (key, base, lab) => v3In(x, key, base, { fmt: 'amt', cell: true, lab });
  const rows = [{ name: '현금 및 현금성자산', inp: amt('i.bridge.cash', br0.cash, '현금 및 현금성자산') },
    { name: '단기금융상품', inp: amt('i.bridge.st_fin', br0.st_fin, '단기금융상품') }];
  (br0.nonop || []).forEach((it, i) => { const nm = (br.nonop?.[i] || it).name || `비영업자산 ${i + 1}`; rows.push({ name: nm, inp: amt(`i.bridge.nonop.${i}.amount`, it.amount, nm), why: (br.nonop?.[i] || it).why }); });
  const opt = sw.assoc_value ? `<div class="v3-opt">${v3bRo('관계기업 평가', V3B_ASSOC[sw.assoc_value] || sw.assoc_value)}</div>` : '';
  const cash = v3V(x, 'DCF.cash'), nonop = v3V(x, 'DCF.nonop'), ev = v3V(x, 'DCF.ev'), tot = (cash || 0) + (nonop || 0);
  const calc = v3bCalc('b11', [['', '현금성자산', v3Eok(cash)], ['+', '비영업자산', v3Eok(nonop)]],
    [['=', '합계', v3Eok(tot), 'k big'], ['', '영업가치 대비 비중', v3Pct(v3Ok(ev) && ev ? tot / ev : null), '', `영업가치 ${v3Eok(ev)}`]]);
  return v3Sec('항목', `<span class="meta">${br.date ? `기준일 ${esc(br.date)}, ` : ''}단위 억원</span>`, opt + v3bItems({ val: '금액' }, rows))
    + v3Sec('합계', v3bScDot(x), calc);
});

// ---------- 12 비주주청구권 ----------
v3Step(12, (x, c) => {
  const br0 = c.input.bridge || {}, br = x.I.bridge || {}, sw = x.sw, one = (id) => v3V(x, id), rows = [];
  const amt = (key, base, lab) => v3In(x, key, base, { fmt: 'amt', cell: true, lab });
  const dk = Object.keys(br0.debt || {}), curD = br.debt || {};
  if (dk.length) rows.push({ grp: '이자부부채' });
  dk.forEach((k) => { const nm = V3B_DEBT[k] || k; rows.push({ name: nm, inp: amt(`i.bridge.debt.${k}`, br0.debt[k], nm), put: v3Num(curD[k] || 0), o: `b12.d.${k}` }); });
  const cbEq = v3Ok(one('DCF.debt')) ? v3bSum(Object.values(curD)) - one('DCF.debt') : 0; // 희석 주식으로 넣은 전환사채는 부채에서 빠짐
  if (cbEq > 0.005) rows.push({ name: '주식으로 본 전환 증권', put: `−${v3Num(cbEq)}`, o: 'b12.cbeq' });
  rows.push({ grp: '그 밖의 청구권' });
  const pbr = sw.nci_value === 'book_x_pbr';
  rows.push({ name: '비지배지분', sub: pbr ? `장부가 × ${v3X(sw.nci_pbr ?? 1)}` : '', inp: amt('i.bridge.nci', br0.nci, '비지배지분'), put: v3Num(one('DCF.nci') || 0), o: 'b12.nci' });
  rows.push({ name: '우선주 시가', inp: amt('i.bridge.pref_mkt', br0.pref_mkt, '우선주 시가'), put: v3Num(one('DCF.pref') || 0), o: 'b12.pref', off: sw.pref !== 'market' });
  rows.push({ name: '퇴직급여 과소적립', inp: amt('i.bridge.dbo', br0.dbo, '퇴직급여 과소적립'), put: v3Num(one('DCF.dbo') || 0), o: 'b12.dbo', off: !sw.dbo_claim });
  (br0.claims || []).forEach((it, i) => { const cur = br.claims?.[i] || it, nm = cur.name || `기타 청구권 ${i + 1}`; rows.push({ name: nm, inp: amt(`i.bridge.claims.${i}.amount`, it.amount, nm), put: v3Num(cur.amount || 0), o: `b12.c.${i}`, why: cur.why }); });
  const opt = `<div class="v3-opt"><div><span>비지배지분</span>${v3Sw(x, 'sw.nci_value', [['book', '장부가'], ['book_x_pbr', '장부가 × PBR']], sw.nci_value)}${pbr ? `<span class="v3b-oi">${v3In(x, 'sw.nci_pbr', c.switches.nci_pbr ?? 1, { fmt: 'x', lab: '비지배지분 PBR' })}</span>` : ''}</div>
    <div><span>우선주</span>${v3Sw(x, 'sw.pref', [['as_common', '주식 수에 합산'], ['market', '시가로 차감']], sw.pref)}</div>
    <div><span>퇴직급여 과소적립</span>${v3Sw(x, 'sw.dbo_claim', [[false, '제외'], [true, '차감']], !!sw.dbo_claim)}</div></div>`;
  const calc = v3bCalc('b12', [['', '영업가치', v3Eok(one('DCF.ev'))], ['+', '현금성자산', v3Eok(one('DCF.cash'))], ['+', '비영업자산', v3Eok(one('DCF.nonop'))],
    ['−', '이자부부채', v3Eok(one('DCF.debt'))], ['−', '비지배지분', v3Eok(one('DCF.nci'))], ['−', '우선주', v3Eok(one('DCF.pref')), sw.pref !== 'market' ? 'off' : ''],
    ['−', '퇴직급여 과소적립', v3Eok(one('DCF.dbo')), sw.dbo_claim ? '' : 'off'], ['−', '기타 청구권', v3Eok(one('DCF.other_claim')), (br0.claims || []).length ? '' : 'off']],
  [['=', '주주가치', v3Eok(one('DCF.eq')), 'k big']]);
  return v3Sec('항목', `<span class="meta">${br.date ? `기준일 ${esc(br.date)}, ` : ''}단위 억원</span>`, opt + v3bItems({ val: '금액', put: '넣는 금액' }, rows))
    + v3Sec('주주가치 계산', v3bScDot(x), calc);
});

// ---------- 13 주식 수 ----------
/* 희석 판정에 쓰는 한계세율: 엔진 step_shares와 같은 값(직전 결산 세전이익이 드는 구간 세율 × (1 + 지방소득세)) */
function v3bTm(x) {
  const T = x.I.market?.tax, br = T?.brackets;
  if (!br || !br.length) return v3V(x, 'TAX.marginal') || 0;
  const top = br[br.length - 1][1], loc = 1 + (T.local || 0);
  if (x.sw.tax_marginal === 'top') return top * loc;
  const base = Math.max(v3V(x, 'IS.ebt', x.tl.H - 1) || 0, 0), b = br.find(([up]) => up == null || base <= up / 1e8);
  return (b ? b[1] : top) * loc;
}
/* 희석 증권 건별 판정(엔진 step_shares와 같은 규칙). [{kind, name, sub, qty: 수량 칸 html, px: 행사가 칸 html, term, j: 판정, on: 가산 여부, add: 가산 주식, o}] */
function v3bDil(x, c) {
  const sh = x.I.shares || {}, sh0 = c.input.shares || {}, sw = x.sw, price = x.t.close, vd = x.t.val_date || '', win = !!sw.exercise_window, out = [];
  const inp = (k, i, f, fmt, lab) => v3In(x, `i.shares.${k}.${i}.${f}`, sh0[k]?.[i]?.[f], { fmt, cell: true, lab });
  const term = (a, b) => (a || b ? `${a || ''}～${b || ''}` : '');
  const nm = (o, i, a) => o.name || o.label || (a.length > 1 ? `${i + 1}번` : '');
  const tsm = (q, k) => (v3Ok(price) && price ? q - q * k / price : q);
  (sh.options || []).forEach((o, i, a) => {
    let j = '내가격', on = v3Ok(price) && price > o.strike;
    if (!on) j = '외가격';
    else if (o.start && vd < o.start) { on = false; j = '행사 기간 전'; }
    else if (win && o.end && vd > o.end) { on = false; j = '행사 기간 지남'; }
    out.push({ kind: '스톡옵션', name: nm(o, i, a), qty: inp('options', i, 'qty', 'cnt', '스톡옵션 수량'), px: inp('options', i, 'strike', 'won', '스톡옵션 행사가'), term: term(o.start, o.end), j, on, add: on ? tsm(o.qty, o.strike) : 0, o: `so${i}` });
  });
  (sh.bw || []).forEach((w, i, a) => {
    const on = v3Ok(price) && price > w.strike;
    out.push({ kind: '신주인수권', name: nm(w, i, a), qty: inp('bw', i, 'qty', 'cnt', '신주인수권 수량'), px: inp('bw', i, 'strike', 'won', '신주인수권 행사가'), term: '', j: on ? '내가격' : '외가격', on, add: on ? tsm(w.qty, w.strike) : 0, o: `bw${i}` });
  });
  (sh.rsu || []).forEach((r, i, a) => out.push({ kind: 'RSU', name: nm(r, i, a), qty: inp('rsu', i, 'qty', 'cnt', 'RSU 수량'), px: '', term: '', j: '전량 가산', on: true, add: +r.qty || 0, o: `rs${i}` }));
  const ni0 = v3V(x, 'IS.ni_parent', x.tl.H - 1), basic = v3V(x, 'SHR.basic'), tm = v3bTm(x);
  (sh.cb || []).forEach((b, i, a) => {
    if (!b.face || !b.conv_price) return;
    const nw = b.face * 1e8 / b.conv_price;
    let j = '희석', on = v3Ok(price) && price > b.conv_price;
    if (!on) j = '외가격';
    else if (win && b.window && b.window[0] && !(b.window[0] <= vd && vd <= (b.window[1] || '9999'))) { on = false; j = '전환 기간 밖'; }
    else if (!((ni0 + b.face * (b.coupon || 0) * (1 - tm)) * 1e8 / (basic + nw) <= ni0 * 1e8 / basic)) { on = false; j = '반희석'; }
    out.push({ kind: '전환사채', name: nm(b, i, a), sub: `권면 ${v3Eok(b.face)}`, qty: v3Num(nw), qo: true, px: inp('cb', i, 'conv_price', 'won', '전환가'), term: term(b.window?.[0], b.window?.[1]), j, on, add: on ? nw : 0, o: `cb${i}` });
  });
  (sh.rcps || []).forEach((r, i, a) => {
    const on = sw.rcps === 'convert';
    out.push({ kind: '상환전환우선주', name: nm(r, i, a), sub: v3Ok(r.book) ? `장부 ${v3Eok(r.book)}` : '', qty: inp('rcps', i, 'shares', 'cnt', '상환전환우선주 전환 주식'), px: '', term: '', j: on ? '전환 가정' : '상환 가정', on, add: on ? +r.shares || 0 : 0, o: `rc${i}` });
  });
  return out;
}
function v3bEps(x) {
  const e = v3Row(x, 'SHR.eps'); if (!e) return '';
  const ys = v3Years(x, 'hist+fc'), H = x.tl.H, d = v3Row(x, 'SHR.eps_dil');
  const dif = d && d.some((v, i) => v3Ok(v) && v3Ok(e[H + i]) && Math.abs(v - e[H + i]) > 0.5);
  const cls = (i) => (i === H ? 'bl' : '');
  const tr = (name, f) => `<tr><td class="st">${name}</td>${ys.map((y, i) => `<td class="${y.e ? '' : 'h'} ${cls(i)}">${f(i)}</td>`).join('')}</tr>`;
  return `<h3 class="v3-h3">주당순이익<small>원</small></h3><div class="mk-scroll"><table class="mk-tbl v3-t"><thead><tr><th class="st">항목</th>${ys.map((y, i) => `<th class="${cls(i)}">${y.label}</th>`).join('')}</tr></thead>
    <tbody>${tr('주당순이익', (i) => v3Fmt(e[i], 'won'))}${dif ? tr('희석 주당순이익', (i) => (i < H ? '' : v3Fmt(d[i - H], 'won'))) : ''}</tbody></table></div>`;
}
v3Step(13, (x, c) => {
  const sh0 = c.input.shares || {}, sh = x.I.shares || {}, sw = x.sw, one = (id) => v3V(x, id);
  const cnt = (key, base, lab) => v3In(x, key, base, { fmt: 'cnt', cell: true, lab });
  const rows = [{ name: '발행주식 총수', inp: cnt('i.shares.issued', sh0.issued, '발행주식 총수') }, { name: '자기주식', inp: cnt('i.shares.treasury', sh0.treasury, '자기주식') },
    { name: '우선주', inp: cnt('i.shares.pref', sh0.pref, '우선주') }];
  const dil = v3bDil(x, c), anyW = dil.some((d) => d.term), anyR = (sh.rcps || []).length > 0;
  const opt = `<div class="v3-opt"><div><span>우선주</span>${v3Sw(x, 'sw.pref', [['as_common', '주식 수에 합산'], ['market', '시가로 차감']], sw.pref)}</div>
    ${anyW ? `<div><span>행사 기간</span>${v3Sw(x, 'sw.exercise_window', [[true, '반영'], [false, '무시']], !!sw.exercise_window)}</div>` : ''}
    ${anyR ? `<div><span>상환전환우선주</span>${v3Sw(x, 'sw.rcps', [['convert', '전환'], ['redeem', '상환']], sw.rcps)}</div>` : ''}</div>`;
  const dsum = (one('SHR.so_tsm') || 0) + (one('SHR.rsu') || 0) + (one('SHR.cb_add') || 0);
  const dtbl = dil.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3b-dl"><thead><tr><th class="st">구분</th><th>수량</th><th>행사가</th><th class="tx">행사 기간</th><th class="tx">판정</th><th>가산 주식</th></tr></thead>
      <tbody>${dil.map((d) => `<tr><td class="st"><b>${d.kind}</b>${d.name || d.sub ? `<small>${esc([d.name, d.sub].filter(Boolean).join(', '))}</small>` : ''}</td><td class="${d.qo ? '' : 'in'}"${d.qo ? ` data-o="b13.q.${d.o}"` : ''}>${d.qty}</td><td class="in">${d.px}</td><td class="tx">${esc(d.term)}</td><td class="tx" data-o="b13.j.${d.o}"><span class="v3b-j ${d.on ? 'on' : ''}">${d.j}</span></td><td data-o="b13.a.${d.o}">${v3Num(d.add)}</td></tr>`).join('')}
      <tr class="sum" data-o="b13.dsum"><td class="st">합계</td><td></td><td></td><td class="tx"></td><td class="tx"></td><td>${v3Num(dsum)}</td></tr></tbody></table></div>`
    : '<div class="empty">스톡옵션, RSU, 전환사채 건별 자료가 없어 희석을 반영하지 못했습니다.</div>';
  const asC = sw.pref === 'as_common', basis = { diluted: '희석', basic: '유통', issued: '발행' }[sw.share_basis] || '';
  const calc = v3bCalc('b13', [['', '발행주식 총수', v3bSh(one('SHR.issued'))], ['−', '자기주식', v3bSh(one('SHR.treasury'))], ['=', '유통주식수', v3bSh(one('SHR.basic')), 'sum'],
    ['+', '우선주', v3bSh(asC ? one('SHR.pref') : 0), asC ? '' : 'off'], ['+', '자기주식법 순증', v3bSh(one('SHR.so_tsm')), '', v3Ok(one('SHR.so_itm')) && one('SHR.so_itm') ? `내가격 수량 ${v3bSh(one('SHR.so_itm'))}` : ''],
    ['+', '미가득 RSU', v3bSh(one('SHR.rsu'))], ['+', '전환 가산 주식', v3bSh(one('SHR.cb_add'))], ['=', '희석 주식수', v3bSh(one('SHR.diluted')), 'sum']],
  [['', '주주가치', v3Eok(one('DCF.eq'))], ['÷', '주식 수', v3bSh(one('DCF.shares')), '', basis], ['=', '주당 가치', v3Won(one('DCF.ps')), 'k big', v3Ok(one('DCF.ps_raw')) ? `반올림 전 ${v3Won(one('DCF.ps_raw'))}` : ''],
    ['', '상승여력', v3bUp(one('DCF.up')), '', `현재가 ${v3Won(x.t.close)}`]]);
  const copt = `<div class="v3-opt"><div><span>주식 수 기준</span>${v3Sw(x, 'sw.share_basis', [['diluted', '희석'], ['basic', '유통'], ['issued', '발행']], sw.share_basis)}</div>
    <div><span>반올림 단위</span>${v3Sw(x, 'sw.round', [[1, '1원'], [10, '10원'], [100, '100원'], [1000, '1,000원']], sw.round)}</div></div>`;
  return v3Sec('항목', `<span class="meta">${sh.date ? `기준일 ${esc(sh.date)}, ` : ''}단위 주</span>`,
    `${opt}${v3bItems({ val: '주식 수' }, rows)}<h3 class="v3-h3">희석 증권<small>판정 기준가 ${v3Won(x.t.close)}</small></h3>${dtbl}`)
    + v3Sec('주당 가치 계산', v3bScDot(x), `${copt}${calc}<div data-o="b13.eps">${v3bEps(x)}</div>`);
});

// ---------- 14 시나리오 근거 ----------
/* 가정 이름: 매출 줄은 「줄 이름 + 변수」, 특정 줄에 딸린 판관비 묶음은 줄 이름으로 풀어 씀 */
function v3bAName(x, K) {
  const lines = x.I.revbuild?.lines || [], m = /^rev\.(.+)\.([^.]+)$/.exec(K);
  if (m) { const ln = lines.find((l) => l.id === m[1]); if (ln) return `${ln.name} ${V3B_REVV[m[2]] || m[2]}`; }
  const cu = /^sga_(custom\..+)_ratio$/.exec(K);
  if (cu) { const g = x.I.opex?.groups?.[cu[1]], ln = g?.line && lines.find((l) => l.id === g.line); if (ln) return `${ln.name} 매출 연동 판관비율`; }
  return v3Lab(x, `CTL.a.${K}`).name;
}
/* 그 시나리오 값의 출처: 화면에서 고친 값, 리서치가 준 값, 규칙으로 채운 값 */
function v3bSrc(x, c, K, S) {
  if (Object.keys(x.st.ov).some((k) => k.startsWith(`a.${K}.${S}`) || k.startsWith(`a.${K}.*`))) return '직접 입력';
  if (c.input.assump?.[S] && K in c.input.assump[S]) return '리서치';
  const m = /^rev\.(.+)\.([^.]+)$/.exec(K), sp = m && (c.input.revbuild?.lines || []).find((l) => l.id === m[1])?.a?.[m[2]];
  return sp && typeof sp === 'object' && !Array.isArray(sp) && S in sp ? '리서치' : '규칙';
}
function v3bAssump(x, c) {
  const rows = x.res.rows, B = rows.Base || {}, N = x.tl.N, cols = N > 1 ? [0, N - 1] : [0], out = [];
  for (const id of Object.keys(B)) {
    if (!id.startsWith('CTL.a.')) continue;
    const rs = V3_SCEN.map((S) => rows[S]?.[id]);
    if (rs.some((r) => !Array.isArray(r))) continue;
    if (!rs.some((r) => r.length !== rs[0].length || r.some((v, i) => Math.abs((v || 0) - (rs[0][i] || 0)) > 1e-9))) continue;
    const K = id.slice(6), L = v3Lab(x, id), one = rs[0].length === 1, src = ['Bull', 'Bear'].map((S) => v3bSrc(x, c, K, S));
    out.push(`<tr><td class="st">${esc(v3bAName(x, K))}${L.fmt !== 'pct' && V3_UNIT[L.fmt] ? `<small>${V3_UNIT[L.fmt]}</small>` : ''}</td>${rs.map((r) => cols.map((j, n) => `<td class="${n === 0 ? 'bl' : ''}">${one && n ? '' : v3Fmt(r[one ? 0 : j], L.fmt, L.fmt === 'pct' ? 1 : undefined)}</td>`).join('')).join('')}<td class="tx bl">${src[0] === src[1] ? src[0] : `Bull ${src[0]}, Bear ${src[1]}`}</td></tr>`);
  }
  if (!out.length) return '<div class="empty">세 시나리오의 가정이 모두 같습니다.</div>';
  const yl = cols.map((j) => `${x.tl.fc[j]}E`);
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3b-as"><thead><tr><th class="st" rowspan="2">가정</th>${V3_SCEN.map((S) => `<th class="g bl" colspan="${cols.length}"><span class="v3-dot ${S}"></span>${S}</th>`).join('')}<th class="tx bl" rowspan="2">출처</th></tr>
    <tr>${V3_SCEN.map(() => yl.map((l, n) => `<th class="${n === 0 ? 'bl' : ''}">${l}</th>`).join('')).join('')}</tr></thead><tbody>${out.join('')}</tbody></table></div>`;
}
function v3bScnRes(x) {
  const y0 = x.tl.hist[x.tl.H - 1], ks = Object.keys(x.lab).filter((k) => k.startsWith('SCN.Base.')).map((k) => k.slice(9)).filter((k) => k !== 'ps' && k !== 'up');
  const body = ks.map((k) => {
    const L = v3Lab(x, `SCN.Base.${k}`), vs = V3_SCEN.map((S) => v3V(x, `SCN.${S}.${k}`));
    if (!vs.some(v3Ok)) return '';
    const nm = L.name.replace(/^Base\s*/, '').replace(/FY(\d)/, (_, n) => `${y0 + +n}E`);
    return `<tr><td class="st">${esc(nm)}${L.fmt !== 'pct' && V3_UNIT[L.fmt] ? `<small>${V3_UNIT[L.fmt]}</small>` : ''}</td>${vs.map((v) => `<td>${v3Fmt(v, L.fmt, L.fmt === 'pct' ? (k.startsWith('wacc') ? 2 : 1) : undefined)}</td>`).join('')}</tr>`;
  }).join('');
  if (!body) return '';
  return `<div class="mk-scroll v3b-nw"><table class="mk-tbl v3-t"><thead><tr><th class="st">항목</th>${V3_SCEN.map((S) => `<th><span class="v3-dot ${S}"></span>${S}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
v3Step(14, (x, c) => {
  const w0 = c.switches.weights || {}, wv = x.res.wavg || {}, why = x.I.notes_in?.scenario_why || {};
  const blocks = V3_SCEN.map((S) => {
    const s = x.res.scen?.[S] || {}, t = why[S] || v3Note(x, `scenario.${S}`);
    return `<tr class="s"><td class="tx"><span class="v3-dot ${S}"></span><b>${S}</b></td><td data-o="b14.ps.${S}">${v3Won(s.ps)}</td><td data-o="b14.up.${S}">${v3bUp(s.up)}</td><td class="in">${v3In(x, `sw.weights#${S}`, w0[S], { fmt: 'pct', d: 1, lab: `${S} 가중치` })}</td><td></td></tr>
      ${t ? `<tr class="w"><td class="tx" colspan="5"><p>${esc(t)}</p></td></tr>` : ''}`;
  }).join('');
  const bad = wv.ok === false;
  const sum = `<tr class="sum"><td class="tx">가중평균</td><td>${bad ? '-' : v3Won(wv.ps)}</td><td>${bad ? '-' : v3bUp(wv.up)}</td><td class="${bad ? 'v3b-bad' : ''}">${v3Pct(wv.sum, 1)}</td><td></td></tr>
    ${bad ? '<tr class="msg"><td class="tx" colspan="5">가중치 합이 100%가 아니라 가중평균을 계산하지 않습니다.</td></tr>' : ''}`;
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3b-sct"><thead><tr><th class="tx">시나리오</th><th>내재 가치</th><th>상승여력</th><th>가중치</th><th></th></tr></thead><tbody>${blocks}</tbody><tbody data-o="b14.sum">${sum}</tbody></table></div>`;
  const rule = x.sw.scn_rule ? `<span class="meta">빈 가정 채우기 ${esc(V3B_RULE[x.sw.scn_rule] || x.sw.scn_rule)}</span>` : '';
  const res = v3bScnRes(x);
  return v3Sec('근거와 가중치', '', tbl)
    + v3Sec('시나리오별로 다른 가정', rule, `<div data-o="b14.as">${v3bAssump(x, c)}</div>`)
    + (res ? v3Sec('시나리오별 결과', '', `<div data-o="b14.res">${res}</div>`) : '');
});

/* 가중치 칸: 화면 값의 합이 100%인데 소수 끝자리(33.3 × 3 등) 때문에 엔진의 합 검사(오차 1e-6)에 걸리지 않게, 합이 0.15%p 안이면 방금 고친 칸에서 남는 끝자리를 덜어 냄 */
v3On('input', '.v3b-sct input[data-k]', (el, x) => {
  const ins = [...el.closest('table').querySelectorAll('input[data-k^="sw.weights#"]')], base = x.c.switches.weights || {}, ov = x.st.ov;
  const rows = ins.map((i) => { const v = v3NumOf(i.value), S = i.dataset.k.split('#')[1], same = v == null || i.value === i.dataset.b; return { i, same, v: same ? +base[S] || 0 : v / 100 }; });
  const d = v3bSum(rows.map((r) => r.v)) - 1, fix = rows.find((r) => r.i === el && !r.same) || rows.find((r) => !r.same);
  if (fix && Math.abs(d) < 0.0015) fix.v -= d;
  rows.forEach((r) => { if (r.same) delete ov[r.i.dataset.k]; else ov[r.i.dataset.k] = { t: r.i.value, v: r.v }; r.i.classList.toggle('chg', !r.same); });
  v3Later();
});

// ---------- 15 상대가치 결합 ----------
v3Step(15, (x, c) => {
  const rel = x.I.rel || {}, rel0 = c.input.rel || {}, ps = rel.ps || {}, close = x.t.close, bl = x.res.blend || {}, wv = x.res.wavg || {}, has = v3Ok(ps.median);
  const upOf = (v) => v3bUp(v3Ok(v) && close ? v / close - 1 : null), y0 = x.tl.hist[x.tl.H - 1];
  const per = String(rel.period || '').replace(/^FY(\d)$/, (_, n) => `${y0 + +n}E`);
  const drow = (name, v) => (v3Ok(v) ? `<tr><td class="st">${name}</td><td>${v3Num(v)}</td><td>${upOf(v)}</td></tr>` : '');
  const dist = `<h3 class="v3-h3">주당 가치<small>원</small></h3><div class="mk-scroll"><table class="mk-tbl v3-t v3b-rel"><thead><tr><th class="st">구분</th><th>주당 가치</th><th>상승여력</th></tr></thead><tbody>
    <tr class="key"><td class="st">중앙값<small>결합에 사용</small></td><td class="in">${v3In(x, 'i.rel.ps.median', rel0.ps?.median, { fmt: 'won', cell: true, lab: '상대가치 주당 가치 중앙값' })}</td><td data-o="b15.mup">${upOf(ps.median)}</td></tr>
    ${drow('25%', ps.q25)}${drow('75%', ps.q75)}${Object.entries(rel.scen || {}).map(([S, v]) => drow(esc(S), v)).join('')}</tbody></table></div>`;
  const sp = Object.entries(rel.split || {});
  const split = sp.length ? `<h3 class="v3-h3">비교 집단별</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3b-rel"><thead><tr><th class="st">구분</th><th>기업 수</th><th>배수</th><th>주당 가치</th><th>상승여력</th></tr></thead><tbody>
    ${sp.map(([k, v]) => `<tr><td class="st">${esc(k)}</td><td>${v3Num(v.n)}</td><td>${v3Fmt(v.median, 'x', 1)}</td><td>${v3Num(v.per_share)}</td><td>${v3Ok(v.per_share) && close ? upOf(v.per_share) : v3bUp(v.upside)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const facts = `<div class="v3-opt">${rel.method ? v3bRo('평가 배수', rel.method) : ''}${per ? v3bRo('기준 기간', per) : ''}${v3Ok(rel.multiple) ? v3bRo('배수 중앙값', v3X(rel.multiple, 1)) : ''}</div>`;
  const relCard = has || rel0.ps ? v3Sec('상대가치 결과', '', `${facts}<div class="v3-two v3b-two v3b-rt"><div>${dist}</div><div>${split}</div></div>`)
    : v3Sec('상대가치 결과', '', '<div class="empty">상대가치 결과가 없어 DCF 가중평균을 목표주가로 씁니다.</div>');
  const w = Number(x.sw.blend_w), wp = Math.round(w * 100), w0 = c.switches.blend_w;
  const slider = `<div class="v3b-bw"><div class="v3b-bw-s"><div class="v3b-bw-l" data-o="b15.wl"><span>상대가치 ${v3Pct(1 - w, 0)}</span><span>DCF 가중평균 ${v3Pct(w, 0)}</span></div>
      <input type="range" min="0" max="100" step="5" value="${v3Ok(wp) ? wp : 50}" data-v3b-bw aria-label="DCF 비중"${has ? '' : ' disabled'}></div>
    ${v3F('DCF 비중', v3In(x, 'sw.blend_w', w0, { fmt: 'pct', d: 0, lab: 'DCF 비중', dis: !has }))}</div>`;
  const wd = v3Ok(bl.w_dcf) ? bl.w_dcf : w, bad = wv.ok === false, one = (id) => v3V(x, id);
  const calc = v3bCalc('b15', [['', 'DCF 가중평균', bad ? '-' : v3Won(bl.dcf ?? wv.ps), '', `× ${v3Pct(wd, 0)}`], ['+', '상대가치', v3Won(bl.rel), has ? '' : 'off', `× ${v3Pct(1 - wd, 0)}`]],
    [['=', '목표주가', v3Won(bl.target), 'k big'], ['', '상승여력', v3bUp(bl.up), '', `현재가 ${v3Won(close)}`]]);
  const fy = (n) => (x.tl.fc[n] ? `${x.tl.fc[n]}E` : ''), im = [['SUM.implied_pe', `PER ${fy(0)}`], ['SUM.implied_pe_fy2', `PER ${fy(1)}`], ['SUM.implied_ev_ebitda', `EV/EBITDA ${fy(0)}`]].filter(([id]) => v3Ok(one(id)));
  const imp = im.length ? `<div data-o="b15.im"><h3 class="v3-h3">목표주가 기준 배수</h3><div class="v3b-calc"><table class="va-calc"><tbody>${im.map(([id, nm]) => v3bRow(['', nm, v3X(one(id), 1)])).join('')}</tbody></table></div></div>` : '';
  const warn = `<div data-o="b15.msg">${bad ? '<p class="v3b-warn">시나리오 가중치 합이 100%가 아니라 목표주가를 계산하지 않습니다.</p>' : ''}</div>`;
  return relCard + v3Sec('결합', '', `${slider}${warn}<div class="v3-two v3b-two"><div><h3 class="v3-h3">목표주가</h3>${calc}</div><div>${imp}</div></div>`);
});
/* 결합 가중치 슬라이더: 끄는 동안 결과 구역만 다시 계산. 숫자 칸과 서로 맞춤(0～100%로 자름) */
v3On('input', '[data-v3b-bw]', (el, x) => {
  const v = Math.min(100, Math.max(0, +el.value || 0));
  v3SetOv(x.c, 'sw.blend_w', v / 100, String(v));
  const n = el.closest('.v3b-bw')?.querySelector('input[data-k]'), on = !!x.st.ov['sw.blend_w'];
  if (n) { n.value = on ? String(v) : n.dataset.b; n.classList.toggle('chg', on); }
  v3Later();
});
v3On('input', '.v3b-bw input[data-k]', (el, x) => {
  let v = v3NumOf(el.value);
  if (v != null && (v < 0 || v > 100)) { v = Math.min(100, Math.max(0, v)); el.value = String(v); }
  if (v == null || el.value === el.dataset.b) delete x.st.ov[el.dataset.k]; else x.st.ov[el.dataset.k] = { t: el.value, v: v / 100 };
  el.classList.toggle('chg', !!x.st.ov[el.dataset.k]);
  const r = el.closest('.v3b-bw')?.querySelector('[data-v3b-bw]');
  if (r) r.value = v ?? +el.dataset.b;
  v3Later();
});
v3On('change', '.v3b-bw input[data-k]', (el) => {
  const r = el.closest('.v3b-bw')?.querySelector('[data-v3b-bw]'), v = v3NumOf(el.value);
  if (r) r.value = v ?? +el.dataset.b;
});

// ---------- 연도별 상세 탭(yr), 점검 탭(chk) ----------
/* 연도별 상세: Valley 「입력값 세부 조정」 표에 The Modellers 시트 구조를 얹은 큰 표 하나(설계서 7-3).
   열은 과거 H년, 명시 N년, 전환 M년, 종료연도, CAGR. 묶음(tbody)마다 접고 펴며, 접힌 묶음은 합계 줄만 만든다.
   상태: x.st.yo 편 묶음 키 배열, x.st.yh 과거 연도 보이기(0이면 추정만).
   묶음을 누르면 화면을 통째로 다시 그리지 않고 그 tbody만 바꾼다(표 안 스크롤 위치를 지키려고). */

/* 묶음 표. sheets: labels[id].sheet, sum: 접혔을 때 보일 합계 줄. DCF 시트는 FCFF 행까지(cut 0)와 그 뒤(cut 1)로 나눔 */
const V3Y_G = [
  { k: 'rev', name: '매출', sheets: ['REV'], sum: ['REV.total', 'REV.growth'] },
  { k: 'opx', name: '비용', sheets: ['OPX'], sum: ['OPX.cogs', 'OPX.sga', 'OPX.ebit', 'OPX.ebitda'] },
  { k: 'is', name: '손익계산서', sheets: ['IS'], sum: ['IS.rev', 'IS.ebit', 'IS.ni'] },
  { k: 'bs', name: '재무상태표', sheets: ['BS'], sum: ['BS.ta', 'BS.tl', 'BS.te'] },
  { k: 'cf', name: '현금흐름표', sheets: ['CF'], sum: ['CF.cfo', 'CF.cfi', 'CF.cff', 'CF.net'] },
  { k: 'ppe', name: '유형자산', sheets: ['PPE'], sum: ['PPE.capex', 'PPE.dep', 'PPE.eop'] },
  { k: 'int', name: '무형자산과 R&D', sheets: ['INT', 'RND'], sum: ['INT.capex', 'INT.amort', 'INT.eop', 'RND.total'] },
  { k: 'nwc', name: '운전자본', sheets: ['NWC'], sum: ['NWC.nwc', 'NWC.dnwc'] },
  { k: 'debt', name: '차입과 이자', sheets: ['DEBT'], sum: ['DEBT.ibd', 'DEBT.int_exp', 'DEBT.int_inc'] },
  { k: 'tax', name: '법인세', sheets: ['TAX'], sum: ['TAX.base', 'TAX.total', 'TAX.eff'] },
  { k: 'eq', name: '자본', sheets: ['EQ'], sum: ['EQ.div', 'EQ.re_eop', 'EQ.nci_eop'] },
  { k: 'shr', name: '주식수', sheets: ['SHR'], sum: ['SHR.eps', 'SHR.eps_dil'] },
  { k: 'fcff', name: 'FCFF', sheets: ['DCF'], cut: 0, sum: ['DCF.nopat', 'DCF.reinv', 'DCF.fcff'] },
  { k: 'val', name: '할인과 가치', sheets: ['DCF'], cut: 1, sum: ['DCF.wacc_t', 'DCF.df', 'DCF.pv'] },
  { k: 'adj', name: '정상화 실적', sheets: ['ADJ'], sum: ['ADJ.rev_norm', 'ADJ.ebit_norm'] },
  { k: 'etc', name: '그 밖의 가정', sheets: [], sum: [] },
];
/* 가정 키 → 그 가정을 입력 칸으로 보여 줄 결과 행(이름과 값을 견줘 정함).
   표에 없는 키는 규칙으로 찾음: rev.<줄>.<변수> → REV.l.<줄>.<변수>, sga_<묶음>_pct → OPX.sga.<묶음>.pct, sga_<묶음>_val → OPX.sga.<묶음>,
   그 밖은 행 ID 뒷부분이 키와 같은 행(dso → NWC.dso, cogs_r → OPX.cogs_r, payout → EQ.payout, capex_exp → PPE.capex_exp, noncash_oth → DCF.noncash_oth 등).
   찾은 행의 서식이 다르거나 추정 연도 값이 가정 값과 한 해도 안 맞으면 짝으로 보지 않고 「그 밖의 가정」에 둠. 맞지 않는 해의 칸은 계산값으로 보여 줌 */
const V3Y_PAIR = { tax_eff: 'TAX.eff', tax_adj: 'TAX.adj', tax_credit: 'TAX.credit', debt_rate: 'DEBT.rate', rnd_pct: 'RND.pct', rou_add_abs: 'PPE.rou_add', cb_convert: 'DEBT.cb.conv' };
const V3Y_RATIO = { pct: 1, x: 1, days: 1 };
const V3Y_CAGR = { amt: 1, won: 1, cnt: 1 };

const v3yOpen = (x) => (Array.isArray(x.st.yo) ? x.st.yo : []);
const v3yNear = (a, b) => v3Ok(a) && v3Ok(b) && Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a));
const v3yFmt = (v, fmt) => (fmt === 'amt' && v3Ok(v) && Math.abs(v) < 10 ? (Math.abs(v) < 0.05 ? '0' : v3Num(v, 1)) : v3Fmt(v, fmt).replace(/^-(0(?:\.0+)?%?)$/, '$1'));
/* 어색한 행 이름 다듬기: custom.<키>는 그 비용이 따라가는 매출 줄 이름으로, 가정 행의 「g」「val」 꼬리는 우리말로 */
function v3yName(x, id) {
  let n = v3Lab(x, id).name;
  if (n.includes('custom.')) n = n.replace(/custom\.([A-Za-z0-9_]+)/g, (m, k) => {
    const g = x.I.opex?.groups?.[`custom.${k}`], ln = g?.line && (x.I.revbuild?.lines || []).find((l) => l.id === g.line);
    return g?.name || (ln ? `${ln.name} 연동 비용` : k);
  });
  return n.replace(/ g$/, ' 성장률').replace(/ val$/, '').replace(/\(차이\)$/, '');
}

/* 그릴 때마다 한 번: 열, 시트별 행, 가정과 결과 행의 짝 */
function v3yView(x) {
  const { H, N, M } = x.tl, showH = !(x.st.yh === 0 || x.st.yh === '0'), cols = [];
  if (showH) x.tl.hist.forEach((y, i) => cols.push({ k: 'h', i, label: `${y}`, bl: '' }));
  x.tl.fc.forEach((y, i) => cols.push({ k: 'f', i, label: `${y}E`, bl: i === 0 && showH ? ' bl' : '' }));
  x.tl.fade.forEach((y, i) => cols.push({ k: 'd', i, label: `${y}E`, bl: i === 0 ? ' bl' : '' }));
  cols.push({ k: 't', i: 0, label: '종료연도', bl: M ? '' : ' bl' });
  const sheet = {}, chk = {}, tail = {}, keys = [];
  for (const id of Object.keys(x.lab)) {
    const L = x.lab[id];
    if (L.cols === 'one' || !x.R[id]) continue;
    if (id.startsWith('CTL.a.')) { if (L.cols === 'fc') keys.push(id.slice(6)); continue; }
    if (L.kind === 'check' && L.fmt === 'amt') (chk[L.sheet] ||= []).push(id); else (sheet[L.sheet] ||= []).push(id);
    tail[id.slice(id.indexOf('.') + 1)] ??= id;
  }
  const pair = {}, A = {}, rest = [];
  for (const K of keys) {
    const a = x.R[`CTL.a.${K}`], fmt = x.lab[`CTL.a.${K}`].fmt;
    let rid = V3Y_PAIR[K], m;
    if (!rid) rid = (m = /^rev\.(.+)\.([^.]+)$/.exec(K)) ? `REV.l.${m[1]}.${m[2]}` : (m = /^sga_(.+)_pct$/.exec(K)) ? `OPX.sga.${m[1]}.pct` : (m = /^sga_(.+)_val$/.exec(K)) ? `OPX.sga.${m[1]}` : tail[K];
    const RL = rid && x.lab[rid], r = rid && x.R[rid], off = RL && RL.cols === 'hist+fc' ? H : 0;
    A[K] = a;
    if (RL && r && RL.fmt === fmt && RL.cols !== 'one' && !pair[rid] && a.some((v, i) => v3yNear(r[off + i], v))) pair[rid] = K;
    else { pair[`CTL.a.${K}`] = K; rest.push(`CTL.a.${K}`); }
  }
  return { cols, sheet, chk, pair, A, rest, showH, H, N, M };
}

/* 표 한 줄. o: {lv 들여쓰기 단계, name 바꿔 쓸 이름, sum 합계 줄} */
function v3yTr(x, V, id, o = {}) {
  const L = x.lab[id], r = x.R[id];
  if (!L || !r) return '';
  const { H, N, M } = V, T = L.cols, fmt = L.fmt, K = V.pair[id], ratio = V3Y_RATIO[fmt] && !id.startsWith('CTL.'), name = o.name || v3yName(x, id), eid = esc(id);
  let tds = '';
  for (const c of V.cols) {
    const v = c.k === 'h' ? (T === 'hist+fc' ? r[c.i] : undefined) : c.k === 'f' ? (T === 'hist+fc' ? r[H + c.i] : r[c.i]) : T !== 'dcf' ? undefined : c.k === 'd' ? r[N + c.i] : r[N + M];
    if (K && c.k === 'f' && (x.st.ov[`a.${K}.${x.sc}#${c.i}`] || v3yNear(v, V.A[K][c.i]))) tds += `<td class="in${c.bl}">${v3ACell(x, K, c.i, fmt, null, name)}</td>`;
    else tds += `<td${c.bl ? ' class="bl"' : ''}${K && c.k !== 'h' ? ` data-o="yr:${eid}:${c.k}${c.i}"` : ''}>${v === undefined ? '' : v3yFmt(v, fmt)}</td>`;
  }
  const a = r[H - 1], b = r[H + N - 1], cg = T === 'hist+fc' && V3Y_CAGR[fmt] && N > 0 && a > 0 && b > 0 ? v3Pct((b / a) ** (1 / N) - 1) : '';
  const unit = L.unit && L.unit !== '억원' && L.unit !== '%' ? `<small>${esc(L.unit)}</small>` : '';
  const lv = o.lv ?? (ratio ? 1 : 0), cls = `${o.sum && !ratio ? 'sum' : ''}${ratio ? ' r' : ''}${lv ? ` l${Math.min(lv, 3)}` : ''}${o.sub ? ' sub' : ''}`.trim();
  return `<tr${cls ? ` class="${cls}"` : ''}${K ? '' : ` data-o="yr:${eid}"`}><td class="st" title="${esc(name)}">${esc(name)}${unit}</td>${tds}<td class="cg"${K ? ` data-o="yr:${eid}:cg"` : ''}>${cg}</td></tr>`;
}
/* 검증 줄: 차이가 0이면 「일치」, 어긋나면 빨간 숫자 */
function v3yChkTr(x, V, id) {
  const L = x.lab[id], r = x.R[id], { H } = V;
  let tds = '';
  for (const c of V.cols) {
    const v = c.k === 'h' ? r[c.i] : c.k === 'f' ? (L.cols === 'hist+fc' ? r[H + c.i] : r[c.i]) : undefined;
    tds += v == null ? `<td${c.bl ? ' class="bl"' : ''}></td>` : Math.abs(v) > 1e-6 ? `<td class="bad${c.bl}">${v3Num(v, Math.abs(v) < 10 ? 2 : 0)}</td>` : `<td${c.bl ? ' class="bl"' : ''}>일치</td>`;
  }
  return `<tr class="chk" data-o="yr:${esc(id)}"><td class="st">${esc(v3yName(x, id))}</td>${tds}<td class="cg"></td></tr>`;
}

/* 매출 묶음: 합계, 묶음(상위 묶음 아래 하위 묶음), 줄, 줄의 성장률과 비중 순서로 */
function v3yRevRows(x, V) {
  const rb = x.I.revbuild || {}, lines = rb.lines || [], groups = rb.groups || [], all = V.sheet.REV || [], out = [], seen = new Set();
  const push = (id, o) => { if (x.R[id] && all.includes(id) && !seen.has(id)) { seen.add(id); out.push({ id, ...o }); } };
  const line = (l, lv) => {
    const p = `REV.l.${l.id}.`;
    push(`${p}val`, { lv, name: l.name });
    for (const id of all) if (id.startsWith(p)) { const n = v3Lab(x, id).name; push(id, { lv: lv + 1, name: l.name && n.startsWith(`${l.name} `) ? n.slice(l.name.length + 1) : null }); }
  };
  const grp = (g, lv) => {
    push(`REV.g.${g.id}.val`, { lv, sub: true });
    lines.filter((l) => l.group === g.id).forEach((l) => line(l, lv + 1));
    groups.filter((y) => y.parent === g.id).forEach((y) => grp(y, lv + 1));
  };
  push('REV.total', { sum: true }); push('REV.growth', {});
  groups.filter((g) => !g.parent || !groups.some((y) => y.id === g.parent)).forEach((g) => grp(g, 0));
  lines.filter((l) => !groups.some((g) => g.id === l.group)).forEach((l) => line(l, 0));
  all.forEach((id) => push(id, {}));
  return out;
}
/* 묶음의 줄 목록(폈을 때). 차입 트랜치는 모든 칸이 0이면 통째로 뺌 */
function v3yRows(x, V, g) {
  if (g.k === 'etc') return V.rest.map((id) => ({ id }));
  if (g.k === 'rev') return v3yRevRows(x, V);
  let ids = g.sheets.flatMap((s) => V.sheet[s] || []);
  if (g.cut != null) { const i = ids.indexOf('DCF.fcff'); ids = i < 0 ? (g.cut ? [] : ids) : g.cut ? ids.slice(i + 1) : ids.slice(0, i + 1); }
  if (g.k === 'debt') {
    const live = {};
    for (const id of ids) { const m = /^DEBT\.([^.]+)\.[^.]+$/.exec(id); if (m && x.R[id].some((v) => v)) live[m[1]] = 1; }
    ids = ids.filter((id) => { const m = /^DEBT\.([^.]+)\.[^.]+$/.exec(id); return !m || live[m[1]]; });
  }
  return ids.map((id) => ({ id, sum: g.sum.includes(id) }));
}
function v3yBody(x, V, g) {
  const open = v3yOpen(x).includes(g.k), rows = v3yRows(x, V, g), chk = g.sheets.flatMap((s) => V.chk[s] || []);
  if (!rows.length && !chk.length) return '';
  const shown = open ? rows : rows.filter((r) => g.sum.includes(r.id)).map((r) => ({ id: r.id, sum: true }));
  let h = `<tbody data-v3y-b="${g.k}"><tr class="grp"><td class="st"><button type="button" class="v3y-g" data-v3y-g="${g.k}" aria-expanded="${open}">${esc(g.name)}</button></td><td colspan="${V.cols.length + 1}"></td></tr>`;
  for (const r of shown) h += v3yTr(x, V, r.id, r);
  for (const id of chk) h += v3yChkTr(x, V, id);
  return `${h}</tbody>`;
}

/* 값 하나짜리 행: 표 아래 계산표(WACC, 주주가치 다리, 주식 수와 주당 가치) */
const v3yOne = (v, fmt, cnt = '') => (fmt === 'pct' ? v3Pct(v, 2) : fmt === 'amt' ? v3Eok(v, v3Ok(v) && v !== 0 && Math.abs(v) < 10 ? 1 : 0) : fmt === 'won' ? v3Won(v) : fmt === 'x' ? v3X(v) : fmt === 'days' ? (v3Ok(v) ? `${v3Num(v, 1)}일` : '-') : fmt === 'cnt' ? (v3Ok(v) ? `${v3Num(v)}${cnt}` : '-') : v3Fmt(v, fmt));
function v3yCalc(x) {
  const row = (id, { op = '', zero = true, cnt = '', cls = '' } = {}) => {
    const L = x.lab[id], v = v3V(x, id);
    if (!L || !x.R[id] || (!zero && !v)) return '';
    return `<tr${cls ? ` class="${cls}"` : ''}><th>${op ? `${op} ` : ''}${esc(v3yName(x, id))}</th><td>${id === 'DCF.up' ? v3Up(v) || '-' : v3yOne(v, L.fmt, cnt)}</td></tr>`;
  };
  const tbl = (title, parts) => { const b = parts.map(([cls, rows]) => (rows ? `<tbody${cls ? ` class="${cls}"` : ''}>${rows}</tbody>` : '')).join(''); return b ? `<div><h3 class="v3-h3">${title}</h3><table class="va-calc">${b}</table></div>` : ''; };
  const wacc = tbl('WACC', [
    ['', row('WACC.rf') + row('WACC.beta', { op: '+' }) + row('WACC.erp', { op: '×' }) + row('WACC.prem', { op: '+', zero: false })],
    ['', row('WACC.ke', { op: '=' }) + row('WACC.we')],
    ['', row('WACC.kd_pre') + row('WACC.t_m') + row('WACC.kd', { op: '=' }) + row('WACC.wd')],
    ['res', row('WACC.wacc', { cls: 'k' }) + row('WACC.wacc_s') + row('DCF.g_s')],
  ]);
  const eq = tbl('주주가치', [
    ['', row('DCF.pv_sum') + row('DCF.tv') + row('DCF.pv_tv', { op: '+' }) + row('DCF.tv_share')],
    ['res', row('DCF.ev', { op: '=' })],
    ['', row('DCF.cash', { op: '+' }) + row('DCF.nonop', { op: '+' }) + row('DCF.debt', { op: '−' }) + row('DCF.nci', { op: '−' }) + row('DCF.pref', { op: '−', zero: false }) + row('DCF.dbo', { op: '−', zero: false }) + row('DCF.other_claim', { op: '−', zero: false })],
    ['res', row('DCF.eq', { op: '=', cls: 'k' })],
  ]);
  const ps = tbl('주식 수와 주당 가치', [
    ['', row('SHR.issued', { cnt: '주' }) + row('SHR.treasury', { op: '−', cnt: '주' }) + row('SHR.basic', { op: '=', cnt: '주' })],
    ['', row('SHR.pref', { op: '+', zero: false, cnt: '주' }) + row('SHR.so_tsm', { op: '+', zero: false, cnt: '주' }) + row('SHR.rsu', { op: '+', zero: false, cnt: '주' }) + row('SHR.cb_add', { op: '+', zero: false, cnt: '주' }) + row('DCF.shares', { cnt: '주' })],
    ['res', row('DCF.ps', { cls: 'k' })],
    ['', row('CTL.price') + row('DCF.up')],
  ]);
  return wacc + eq + ps;
}

v3Tab('yr', (x) => {
  const V = v3yView(x), body = V3Y_G.map((g) => v3yBody(x, V, g)).join('');
  if (!body) return '<div class="card"><div class="empty">연도별 값이 없습니다.</div></div>';
  const y0 = x.tl.hist[V.H - 1], y1 = x.tl.fc[V.N - 1];
  const tools = `<div class="v3y-tools"><button class="btn ghost sm" type="button" data-v3y-all="1">모두 펴기</button><button class="btn ghost sm" type="button" data-v3y-all="0">모두 접기</button>
    <label class="v3-ck"><input type="checkbox" data-v3y-hist${V.showH ? ' checked' : ''}><span>과거 연도</span></label><span class="meta">단위 억원${y0 && y1 ? `, CAGR ${y0}～${y1}년` : ''}</span></div>`;
  const head = `<tr><th class="st"><span class="v3-dot ${x.sc}"></span>${x.sc}</th>${V.cols.map((c) => `<th${c.bl ? ' class="bl"' : ''}>${c.label}</th>`).join('')}<th class="cg">CAGR</th></tr>`;
  const table = `<div class="v3y-wrap" data-v3-keep="yr"><table class="mk-tbl v3-t v3y-t" style="--v3y-n: ${V.cols.length}"><colgroup><col class="c1">${'<col>'.repeat(V.cols.length)}<col class="cg"></colgroup><thead>${head}</thead>${body}</table></div>`;
  const calc = v3yCalc(x);
  return v3Sec('연도별 상세', tools, table, 'v3y-sec') + (calc ? v3Sec('할인율과 주당 가치', `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc}</span>`, `<div class="v3y-calc" data-o="yr:calc">${calc}</div>`) : '');
});
v3On('click', '[data-v3y-g]', (el, x) => {
  const k = el.dataset.v3yG, g = V3Y_G.find((y) => y.k === k), tb = el.closest('tbody'), host = tb?.closest('table'), open = v3yOpen(x);
  x.st.yo = open.includes(k) ? open.filter((y) => y !== k) : [...open, k];
  if (!g || !host) return true;
  tb.outerHTML = v3yBody(x, v3yView(x), g);
  host.querySelector(`[data-v3y-g="${k}"]`)?.focus({ preventScroll: true });
  v3Save();
  return false;
});
v3On('click', '[data-v3y-all]', (el, x) => { x.st.yo = el.dataset.v3yAll === '1' ? V3Y_G.map((g) => g.k) : []; return true; });
v3On('change', '[data-v3y-hist]', (el, x) => { x.st.yh = el.checked ? 1 : 0; return true; });

// ---------- 점검 탭 ----------
/* 스위치 이름(설계서 3-2). 바꾼 입력 목록에서 덮기 키 sw.<스위치>를 사람이 읽는 이름으로 */
const V3Y_SW = {
  fc_years: '명시 기간', fade_years: '전환 기간', hist_years: '과거 연도 수', fy1_mode: '첫해 추정 방식', season: '남은 분기 비중', resid_fwd: '체계 차이 추정', cons_anchor: '컨센서스 맞춤',
  avg_years: '평균 연수', avg_method: '평균 방식', use_norm: '정상화 실적 사용', cogs_mode: '매출원가 방식', labor_mode: '인건비 방식', ppe_mode: '유형자산 방식', capex_maint_base: '유지 CAPEX 기준',
  exist_dep: '기존 자산 상각', vintage_start: '신규 자산 상각 시작', life_pick: '내용연수 선택', amort_mode: '무형자산 상각 방식', rnd_mode: '연구개발비 방식', rnd_cap_adj: 'R&D 자본화 보정', lease_adj: '리스 보정',
  nwc_avg: '운전자본 기준 기간', nwc_basis: '운전자본 잔액 기준', debt_plan: '차입 계획', int_rate: '이자율 기준', revolver: '리볼버', min_cash: '최소 현금 비율', circuit: '순환 계산',
  tax_mode: '법인세 방식', tax_marginal: '한계세율 방식', sme: '중소기업', nol_wacc: '결손금 할인율 반영', div_mode: '배당 방식', buyback_mode: '자사주 매입 방식', buyback_cancel: '자사주 소각',
  other_pl: '기타손익 추정', eqm_fwd: '지분법손익 추정', st_fin_fwd: '단기금융자산 추정', share_basis: '주식 수 기준', pref: '우선주 처리', rcps: '상환전환우선주 처리', cb_split: '전환사채 분리',
  exercise_window: '행사 가능 기간 판정', dilution_iter: '희석 반복 계산', beta_mode: '베타 방식', beta_window: '베타 기간', beta_index: '베타 기준 지수', beta_adj_w: '베타 조정 비중', beta_stat: '비교기업 베타 대표값',
  beta_cash_adj: '베타 현금 보정', beta_bu_weight: '바텀업 가중 기준', beta_floor: '베타 하한', cap_struct: '자본구조', mcap_basis: '시가총액 기준', debt_value: '부채 가치 기준',
  rf: '무위험이자율 기준', rf_cds: '국가 부도 스프레드 차감', erp: '주식위험프리미엄 출처', crp_exposure: '국가위험 노출', crp_basis: '국가위험 기준', ke_model: '자기자본비용 모형', kd: '타인자본비용 방식',
  cov_basis: '이자보상배율 기준', stable_beta: '안정기 베타', stable_cap: '안정기 자본구조', prem_size: '규모 프리미엄', prem_spec: '개별 프리미엄', prem_country: '국가 프리미엄', wacc_override: 'WACC 직접 입력',
  reinv_mode: '재투자 방식', fcff_tax: 'FCFF 세율', ty_tax: '종료연도 세율', fade_growth: '전환 기간 성장률', fade_margin: '전환 기간 이익률', fade_reinv: '전환 기간 재투자', fade_wacc: '전환 기간 할인율',
  g: '영구성장률 기준', g_cap: '영구성장률 상한', roc_s: '안정기 ROC', tv: '종료가치 방식', exit_metric: '종료 배수 지표', discount: '할인 시점', stub: '첫해 반영 방식', round: '주당 가치 반올림 단위',
  nci_value: '비지배지분 평가', assoc_value: '관계기업 평가', dbo_claim: '퇴직급여 청구권 반영', dcf_model: '가치평가 모형', ddm_stage: 'DDM 단계', ddm_payout: 'DDM 배당 기준', rim_tv: 'RIM 종료가치', rim_omega: 'RIM 지속계수',
  fcfe_debt: 'FCFE 차입 가정', ty_margin: '종료연도 영업이익률', fade_margin_target: '전환 기간 목표 이익률', mid_first: '첫해 기중 할인', tv_mid: '종료가치 기중 할인',
  scn_rule: '시나리오 규칙', weights: '시나리오 가중치', sens_step: '민감도 간격', mc: '몬테카를로', mc_n: '몬테카를로 시행 횟수', mc_seed: '몬테카를로 시드', mc_wacc_sd: 'WACC 표준편차', mc_g_sd: '영구성장률 표준편차',
  mc_min_spread: 'WACC와 영구성장률 최소 차이', mc_bins: '히스토그램 구간 수', mc_up_th: '상승 확률 기준', rdcf_r: '리버스 할인율', rdcf_target: '리버스 목표 주가', blend_w: 'DCF 결합 비중',
  company_type: '회사 유형', purpose: '평가 목적', fye_month: '결산월', calendarize: '달력 연도 환산', calendarize_mode: '달력 연도 환산 방식', calendar_stock: '달력 연도 잔액 기준', total_beta: '총베타', total_beta_mode: '총베타 방식',
  dlom: '비유동성 할인', control_prem: '경영권 프리미엄', key_person: '핵심 인력 할인', holding_disc: '지주사 할인', holding_disc_scope: '지주사 할인 범위', typ_block: '유형별 제외 방법', lbo: 'LBO', lbo_preset: 'LBO 프리셋',
};
const V3Y_SW_SUB = { wacc: 'WACC', g: '영구성장률', margin: '영업이익률', growth: '성장률' };
const V3Y_SW_PCT = new Set(['min_cash', 'blend_w', 'beta_adj_w', 'prem_size', 'prem_spec', 'prem_country', 'wacc_override', 'ty_margin', 'fade_margin_target', 'dlom', 'control_prem', 'key_person', 'holding_disc', 'mc_wacc_sd', 'mc_g_sd', 'mc_min_spread', 'mc_up_th', 'weights', 'sens_step']);
/* 시장 값(m.)과 한 값 덮기(o.): [이름, 처음 값] */
const V3Y_MO = {
  'm.rf': ['무위험이자율', (x) => x.c.py.rows.Base?.['WACC.rf']?.[0]], 'm.erp': ['주식위험프리미엄', (x) => x.c.py.rows.Base?.['WACC.erp']?.[0]],
  'o.g': ['영구성장률', (x) => x.c.py.rows.Base?.['DCF.g_s']?.[0]], 'o.ty_margin': ['종료연도 영업이익률', (x) => (x.c.py.rows[x.sc]?.['DCF.margin'] || []).slice(-1)[0]],
  'o.wacc': ['WACC 직접 입력', (x) => x.c.py.rows.Base?.['WACC.wacc']?.[0]], 'o.wacc_shift': ['WACC 가산', () => 0], 'o.growth_add': ['매출 성장률 가산', () => 0], 'o.fade_g_add': ['전환 기간 성장률 가산', () => 0],
};
/* input 경로(i.)의 낱말. 경로에 모르는 낱말이 하나라도 있으면 키를 그대로 보여 줌 */
const V3Y_IN = {
  bridge: '주주가치 다리', shares: '주식 수', beta: '베타', rel: '상대가치', rdcf: '리버스', cons: '컨센서스', tax: '법인세', avg_exclude: '평균에서 뺀 연도',
  cash: '현금', st_fin: '단기금융자산', nonop: '비영업자산', debt: '이자부부채', nci: '비지배지분', pref_mkt: '우선주 시가', dbo: '퇴직급여 과소적립', claims: '기타 청구권', amount: '금액',
  st: '단기차입금', lt: '장기차입금', bond: '사채', cb: '전환사채', lease: '리스부채', deriv: '파생상품부채', issued: '발행주식 총수', treasury: '자기주식', pref: '우선주',
  peers: '비교기업', include: '포함', de: 'D/E', raw: '원 베타', ps: '주당 가치', median: '중앙값', q25: '25%', q75: '75%', multiple: '배수', exit_mult: '종료 배수', nol: '이월결손금',
  price: '주가', n: '기간', path: '성장 형태', npm: '순이익률', conv: 'FCF 전환 비율', pe: '최종 P/E',
};
function v3yIName(c, path, sub) {
  const out = [];
  let o = c.input;
  for (const k of path.split('.').concat(sub != null ? [sub] : [])) {
    const nx = o == null ? undefined : o[k];
    const w = /^\d+$/.test(k) ? (nx && typeof nx === 'object' && nx.name ? nx.name : `${+k + 1}번째`) : V3Y_IN[k];
    if (!w) return null;
    if (out[out.length - 1] !== w) out.push(w);
    o = nx;
  }
  return out.join(' ');
}
function v3yVal(v, pct) {
  if (v == null) return '없음';
  if (v === true) return '켬';
  if (v === false) return '끔';
  if (typeof v === 'number') return pct ? v3Pct(v, 2) : v.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(v) >= 100 ? 2 : 4 });
  if (Array.isArray(v)) return v.length ? v.join(', ') : '없음';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
/* 스위치 값: 화면 설명 조각(60_info.js)의 V3I_SW 에 우리말 이름이 있으면 그것으로 */
const v3ySwVal = (n, v, pct) => (typeof v === 'string' && typeof V3I_SW !== 'undefined' && V3I_SW[n]?.[v]) || v3yVal(v, pct);
/* 덮기 키 하나를 [이름, 처음 값, 바꾼 값]으로 */
function v3yOv(x, k, e) {
  const c = x.c, h = k.indexOf('#'), b = h < 0 ? k : k.slice(0, h), sub = h < 0 ? null : k.slice(h + 1);
  if (b.startsWith('a.')) {
    const j = b.lastIndexOf('.'), K = b.slice(2, j), S = b.slice(j + 1), id = `CTL.a.${K}`, L = v3Lab(x, id), r0 = x.rows0?.[S === '*' ? 'Base' : S]?.[id];
    if (sub == null || !x.lab[id]) return [`${x.lab[id] ? v3yName(x, id) : K} ${S === '*' ? '모든 시나리오' : S}`, '', '연도별 값'];
    return [`${v3yName(x, id)} ${S === '*' ? '모든 시나리오' : S} ${x.tl.fc[+sub] ? `${x.tl.fc[+sub]}년` : `${+sub + 1}번째 해`}`, v3yOne(r0?.[+sub], L.fmt), v3yOne(e.v, L.fmt)];
  }
  if (b.startsWith('sw.')) {
    const n = b.slice(3), base = c.switches[n], pct = V3Y_SW_PCT.has(n);
    return [`${V3Y_SW[n] || n}${sub != null ? ` ${V3Y_SW_SUB[sub] || sub}` : ''}`, v3ySwVal(n, sub != null ? base?.[sub] : base, pct), v3ySwVal(n, e.v, pct)];
  }
  if (b.startsWith('i.')) {
    const base = v3Path(c.input, b.slice(2));
    return [v3yIName(c, b.slice(2), sub) || k, v3yVal(sub != null ? base?.[sub] : base), v3yVal(e.v)];
  }
  const mo = V3Y_MO[k];
  return mo ? [mo[0], v3yVal(mo[1](x), true), v3yVal(e.v, true)] : [k, '', v3yVal(e.v)];
}
const V3Y_LV = { err: ['오류', 'red'], warn: ['주의', 'warn'], info: ['참고', ''] };
const V3Y_ACC = { rev: '매출', cogs: '매출원가', sga: '판관비', ebit: '영업이익', ebt: '세전이익', ni: '순이익' };

v3Tab('chk', (x, c) => {
  const ck = x.res.checks || [], ver = v3Ver(c), cnt = (lv) => ck.filter((k) => k.level === lv).length, nb = ver ? ver.bad.length : 0;
  const tl = c.timeline || {}, colName = (id, col) => {
    const T = v3Lab(x, id).cols, ys = T === 'one' ? [] : [...(T === 'hist+fc' ? tl.hist || [] : []), ...(tl.fc || []).map((y) => `${y}E`), ...(T === 'dcf' ? [...(tl.fade || []).map((y) => `${y}E`), '종료연도'] : [])];
    return ys[col] ?? '';
  };
  const verText = !ver ? '엔진 없이 파이썬 값만 표시' : ver.err ? `대조 실패: ${esc(ver.err)}` : nb ? `처음 값 ${v3Num(ver.n)}칸 가운데 ${v3Num(nb)}칸이 파이썬 결과와 다름` : `처음 값 ${v3Num(ver.n)}칸이 파이썬 결과와 같음`;
  const sum = `<div class="v3y-cs"><div><span>오류</span><b class="${cnt('err') ? 'bad' : ''}">${cnt('err')}</b></div><div><span>주의</span><b>${cnt('warn')}</b></div><div><span>참고</span><b>${cnt('info')}</b></div>
    <div class="tx"><span>파이썬 대조</span><b class="${nb || ver?.err ? 'bad' : ''}">${verText}</b></div><div><span>다시 계산</span><b>${v3Ok(x.res.ms) ? `${Math.round(x.res.ms)}ms` : '-'}</b></div></div>`;
  const bad = ver && nb && !ver.err ? `<h3 class="v3-h3">파이썬과 다른 칸</h3><div class="mk-scroll"><table class="mk-tbl v3-t"><thead><tr><th class="st">행</th><th class="tx">시나리오</th><th class="tx">열</th><th>화면 값</th><th>파이썬 값</th></tr></thead><tbody>${ver.bad.slice(0, 50).map((b) => { const L = v3Lab(x, b.id); return `<tr><td class="st" title="${esc(b.id)}">${esc(v3yName(x, b.id))}</td><td class="tx">${esc(b.S || '')}</td><td class="tx">${esc(colName(b.id, b.col))}</td><td>${v3Fmt(b.js, L.fmt, 4)}</td><td>${v3Fmt(b.py, L.fmt, 4)}</td></tr>`; }).join('')}</tbody></table></div>${nb > 50 ? `<p class="v3y-more">그 밖에 ${v3Num(nb - 50)}칸이 더 있습니다.</p>` : ''}` : '';
  const first = {}; ck.forEach((k, i) => { first[k.id] ??= i; });
  const ord = ['err', 'warn', 'info'], sorted = ck.map((k, i) => ({ k, i })).sort((a, b) => ord.indexOf(a.k.level) - ord.indexOf(b.k.level) || first[a.k.id] - first[b.k.id] || a.i - b.i).map((y) => y.k);
  const list = sorted.length ? `<ul class="v3y-cl">${sorted.map((k, i) => { const [nm, cls] = V3Y_LV[k.level] || V3Y_LV.info; return `<li class="${i && sorted[i - 1].level !== k.level ? 'gap' : ''}"><span class="chip v3y-lv ${cls}">${nm}</span><p>${esc(k.text)}</p></li>`; }).join('')}</ul>` : '<div class="empty">점검할 것이 없습니다.</div>';
  const ovs = Object.entries(x.st.ov);
  const ovT = ovs.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3y-ov"><thead><tr><th class="st">항목</th><th>처음 값</th><th>바꾼 값</th><th></th></tr></thead><tbody>${ovs.map(([k, e]) => { const [n, was, now] = v3yOv(x, k, e); return `<tr><td class="st">${esc(n)}</td><td>${esc(was)}</td><td class="now">${esc(now)}</td><td><button class="btn ghost sm" type="button" data-v3y-undo="${esc(k)}">되돌리기</button></td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">바꾼 입력이 없습니다.</div>';
  const adj = x.I.adj || [], oo = x.I.one_offs || [], src = (s) => (Array.isArray(s) ? s.join(', ') : s || '');
  const adjT = adj.length ? `<h3 class="v3-h3">보정</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3y-nt"><thead><tr><th class="st">연도</th><th class="tx">계정</th><th>금액</th><th class="tx why">근거</th></tr></thead><tbody>${adj.map((a) => `<tr><td class="st">${esc(a.year ?? '')}</td><td class="tx">${esc(V3Y_ACC[a.account] || a.account || '')}</td><td>${v3Sgn(a.amount)}</td><td class="tx why">${esc(a.why || '')}</td></tr>`).join('')}</tbody></table></div>` : '';
  const ooT = oo.length ? `<h3 class="v3-h3">일회성 항목</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3y-nt"><thead><tr><th class="st">시기</th><th class="tx">계정</th><th class="tx">구분</th><th>금액</th><th class="tx why">근거</th></tr></thead><tbody>${oo.map((a) => `<tr><td class="st">${esc(a.year ?? '')}</td><td class="tx">${esc(a.account || '')}</td><td class="tx">${esc([a.level, a.kind].filter(Boolean).join(', '))}</td><td>${v3Sgn(a.amount)}</td><td class="tx why">${esc(a.why || '')}</td></tr>`).join('')}</tbody></table></div>` : '';
  const todo = c.notes?.todo || [];
  return v3Sec('점검', '', sum + bad + list, 'v3y-chk')
    + v3Sec('바꾼 입력', ovs.length ? `<span class="meta">${ovs.length}건</span>` : '', ovT)
    + (adjT || ooT ? v3Sec('보정과 일회성 항목', '<span class="meta">단위 억원</span>', adjT + ooT) : '')
    + (todo.length ? v3Sec('리서치가 더 필요한 것', `<span class="meta">${todo.length}건</span>`, `<ul class="v3y-todo">${todo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`) : '');
});
v3On('click', '[data-v3y-undo]', (el, x) => { delete v3St(x.c).ov[el.dataset.v3yUndo]; return true; });

// ---------- 보고서 탭: 요약(sum), 상세(det), 시나리오(scen) ----------
// 요약은 SK오션플랜트 IM 35쪽 구성(결론, 근거 숫자, 그림, 부록 순), 상세는 Valley 상세 보고서(실적 추정 차트와 단계별 근거), 시나리오는 세 값 비교와 가중치.
// 입력은 시나리오 가중치(sw.weights#<S>)뿐이고 나머지는 x.res 를 읽기만 함. 판단 메모는 x.st.memo
const V3P_SC = { Bull: 'bull', Base: 'base', Bear: 'bear' };
const V3P_KD = { synthetic: '이자보상배율로 정한 합성 등급', rating: '신용등급 스프레드', effective: '실효이자율', market_yield: '회사채 시장 수익률', manual: '직접 입력', input: '직접 입력' };
const V3P_NOTE = { 매출원가: ['cogs_r'], 법인세: ['tax_eff'], 재투자: ['capex', 'capex_maint_pct', 'dep_rate', 'amort_rate', 'int_capex_other_pct', 'dso', 'dio', 'dpo', 'oca_pct', 'ocl_pct'], '재무 구조': ['debt', 'debt_rate', 'cash_rate', 'payout', 'nci_share', 'lease_repay_rate'] };
const V3P_NOTE_NM = { capex: 'CAPEX', debt: '차입' };
const v3pAdd = (a) => (a || []).reduce((s, v) => s + (v3Ok(v) ? +v : 0), 0);
const v3pDot = (S) => `<i class="v3-dot v3p-dot ${S}"></i>`;
const v3pHead = (x, unit) => `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc}</span>${unit ? `<span class="meta act">단위 ${unit}</span>` : ''}`;
const v3pAxPct = (v) => v3Pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? 0 : 1); // 축 눈금은 정수 %, 값은 소수 한 자리
const v3pSumPct = (v) => (v3Ok(v) ? `${+(v * 100).toFixed(2)}%` : '-');
const v3pW2 = (x) => (x.w > 1000 ? v3Wd(x, 2) : v3Wd(x)); // 카드 한 장 안 두 칸(.v3p-two)의 한 칸 폭
const v3pWg = (x) => (x.w > 1000 ? Math.max(280, Math.floor((x.w - 16) / 2) - 48) : v3Wd(x)); // 카드 두 장을 나란히(.v3p-grid) 놓을 때 한 장 안쪽 폭
const v3pWhyNot = (wv) => (Math.abs((wv.sum ?? 1) - 1) > 1e-6 ? `가중치 합 ${v3pSumPct(wv.sum)}라 계산하지 않음` : '계산되지 않은 시나리오가 있어 가중평균을 내지 않음');

// ===== 요약 =====
/* 주가 범위 위에 현재가, 시나리오별 내재 가치, 목표주가. 1년 주가(x.t.price_hist)가 있으면 주가 선 위에 가치 선 */
function v3pRange(x, w) {
  const t = x.t, sc = x.res.scen || {}, bl = x.res.blend || {};
  const ph = (t.price_hist || []).map((p) => (Array.isArray(p) ? { d: p[0], v: p[1] } : { d: p.date ?? p.d, v: p.close ?? p.c ?? p.v })).filter((p) => v3Ok(p.v));
  if (ph.length > 20) {
    const hl = [...V3_SCEN.map((S) => ({ v: sc[S]?.ps, label: `${S} ${v3Num(sc[S]?.ps)}`, cls: V3P_SC[S] })), { v: bl.target, label: `목표주가 ${v3Num(bl.target)}`, cls: 's1' }];
    return v3cLines({ w, h: 260, labels: ph.map((p) => String(p.d ?? '').slice(2)), lines: [{ name: '주가', values: ph.map((p) => +p.v), cls: 's5' }], hlines: hl, fmt: (v) => v3Num(v), xTicks: 6, title: '1년 주가와 내재 가치' });
  }
  const goals = (t.broker_targets || []).map((b) => b.goal).filter(v3Ok);
  const rows = [v3Ok(t.low52) && v3Ok(t.high52) ? { label: '52주 최저～최고', lo: t.low52, hi: t.high52, cls: 's5' } : null,
    goals.length ? { label: '증권사 목표가', lo: Math.min(...goals), hi: Math.max(...goals), cls: 's2', note: `${goals.length}곳` } : null].filter(Boolean);
  if (!rows.length) return '';
  const marks = [{ x: t.close, label: '현재가', cls: 's5' }, ...V3_SCEN.map((S) => ({ x: sc[S]?.ps, label: S, cls: V3P_SC[S], dash: true })), { x: bl.target, label: '목표주가', cls: 's1' }];
  return v3cFootball({ w, rows, marks, fmt: (v) => v3Num(v), title: '주가 범위와 내재 가치' });
}
function v3pTop(x) {
  const r = x.res, bl = r.blend || {}, wv = r.wavg || {}, sc = r.scen || {}, wt = x.sw.weights || {}, wd = bl.w_dcf;
  let say;
  if (wv.ok === false) say = v3pWhyNot(wv);
  else if (!v3Ok(bl.rel) || !(wd < 1)) say = `DCF 가중평균 ${v3Won(bl.dcf)}을 목표주가로 반영`;
  else if (!(wd > 0)) say = `상대가치 ${v3Won(bl.rel)}을 목표주가로 반영`;
  else say = `DCF 가중평균 ${v3Won(bl.dcf)}과 상대가치 ${v3Won(bl.rel)}을 ${v3Num(wd * 100)} : ${v3Num((1 - wd) * 100)} 비중으로 결합`;
  const cells = V3_SCEN.map((S) => {
    const y = sc[S] || {}, on = S === x.sc;
    return `<button type="button" class="v3p-sc ${on ? 'on' : ''}" data-v3-seg="sc" data-v="${S}" aria-pressed="${on}"><span>${v3pDot(S)}${S}</span><small>가중치 ${v3Pct(wt[S])}</small><b>${v3Ok(y.ps) ? v3Won(y.ps) : '계산 불가'}</b><em>${v3Up(y.up)}</em></button>`;
  }).join('');
  const rng = v3pRange(x, v3Wd(x));
  return v3Sec('평가 결과', '', `<div data-o="p-top"><p class="v3p-say">${say}</p><div class="v3p-scs">${cells}</div>${rng ? `<div class="v3p-rng">${rng}</div>` : ''}</div>`, 'v3p-top');
}
function v3pKey(x) {
  const { H, N, M, fc } = x.tl;
  if (!N) return '';
  const one = (id, d) => (S) => v3Pct(v3V(x, id, 0, S), d), yr = (id, i) => (S) => v3Pct(v3V(x, id, i, S));
  const rows = [['매출 성장률', fc[0], yr('REV.growth', H)], N > 1 ? ['매출 성장률', fc[N - 1], yr('REV.growth', H + N - 1)] : null,
    ['영업이익률', fc[0], yr('IS.ebit_m', H)], N > 1 ? ['영업이익률', fc[N - 1], yr('IS.ebit_m', H + N - 1)] : null,
    ['유효세율', 0, (S) => v3Pct(v3V(x, 'TAX.eff', 0, S) ?? v3V(x, 'IS.tax_r', H, S))], ['WACC', 0, one('WACC.wacc', 2)], ['안정기 WACC', 0, one('WACC.wacc_s', 2)],
    ['베타', 0, (S) => v3Num(v3V(x, 'WACC.beta', 0, S), 2)], ['영구성장률', 0, one('DCF.g_s', 2)], ['종료가치 비중', 0, one('DCF.tv_share', 1)]].filter(Boolean);
  const th = V3_SCEN.map((S) => `<th class="${S === x.sc ? 'on' : ''}">${v3pDot(S)}${S}</th>`).join('');
  const body = rows.map(([nm, y, f]) => `<tr><td class="st">${nm}${y ? `<small>${y}E</small>` : ''}</td>${V3_SCEN.map((S) => `<td class="${S === x.sc ? 'on' : ''}">${f(S)}</td>`).join('')}</tr>`).join('');
  return v3Sec('핵심 가정', '', `<div class="mk-scroll" data-o="p-key"><table class="mk-tbl v3-t v3p-kt"><thead><tr><th class="st">항목</th>${th}</tr></thead><tbody>${body}
    <tr><td class="st">추정 기간</td><td colspan="3">명시 ${N}년, 전환 ${M}년</td></tr></tbody></table></div>`);
}
function v3pBridge(x, w) {
  const { N, M } = x.tl, pv = x.R['DCF.pv'] || [], one = (id) => v3V(x, id);
  if (!v3Ok(one('DCF.ev'))) return v3Sec('가치 다리', v3pHead(x), '<div class="empty" data-o="p-br">영구성장률이 할인율 이상이라 계산하지 못했습니다.</div>');
  const claim = ['debt', 'nci', 'pref', 'dbo', 'other_claim'].reduce((s, k) => s + (one(`DCF.${k}`) || 0), 0);
  const items = [{ label: '명시 기간 현재가치', value: v3pAdd(pv.slice(0, N)), kind: 'start' }, M ? { label: '전환 기간 현재가치', value: v3pAdd(pv.slice(N, N + M)), kind: 'add' } : null,
    { label: '종료가치 현재가치', value: one('DCF.pv_tv'), kind: 'add' }, { label: '영업가치', value: one('DCF.ev'), kind: 'total' },
    { label: '현금성자산과 비영업자산', value: (one('DCF.cash') || 0) + (one('DCF.nonop') || 0), kind: 'add' }, { label: '비주주청구권', value: claim, kind: 'sub' }, { label: '주주가치', value: one('DCF.eq'), kind: 'total' }];
  const ps = one('DCF.ps');
  return v3Sec('가치 다리', v3pHead(x, '억원'), `<div data-o="p-br">${v3cWaterfall({ w, h: x.w > 1000 ? 440 : 280, items, fmt: (v) => v3Num(v), title: '영업가치에서 주주가치까지' })}
    <p class="v3p-cap"><span>주식 수 <b>${v3Num(one('DCF.shares'))}주</b></span><span>주당 가치 <b>${v3Ok(ps) ? v3Won(ps) : '계산 불가'}</b></span></p></div>`);
}
function v3pFin(x) {
  const ys = v3Years(x, 'hist+fc'), H = x.tl.H;
  const G = [['손익계산서', [['IS.rev'], ['REV.growth', '성장률', 1], ['IS.ebit'], ['IS.ebit_m', '영업이익률', 1], ['IS.ni']]], ['재무상태표', [['BS.ta'], ['BS.tl'], ['BS.te']]], ['현금흐름표', [['CF.cfo'], ['CF.cfi'], ['CF.cff']]]];
  const body = G.map(([g, rs]) => {
    const trs = rs.filter(([id]) => x.R[id]).map(([id, nm, sub]) => {
      const L = v3Lab(x, id), row = x.R[id];
      return `<tr class="${sub ? 'v3p-r' : ''}"><td class="st">${esc(nm || L.name)}</td>${ys.map((y, i) => `<td class="${y.e ? '' : 'h'}${i === H ? ' bl' : ''}">${v3Fmt(row[i], L.fmt)}</td>`).join('')}</tr>`;
    }).join('');
    return trs ? `<tr class="grp"><th class="st">${g}</th><td colspan="${ys.length}"></td></tr>${trs}` : '';
  }).join('');
  if (!body) return '';
  return v3Sec('재무 요약', v3pHead(x, '억원'), `<div class="mk-scroll" data-o="p-fin"><table class="mk-tbl v3-t v3p-fin"><thead><tr><th class="st">항목</th>${ys.map((y, i) => `<th class="${i === H ? 'bl' : ''}">${y.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`);
}
/* 직전 실적 연도 줄별 매출 비중. SUM.mix.* 행이 있으면 그것, 없으면 REV.l.<줄>.share. 조각이 8개를 넘으면 작은 줄은 「그 밖」으로 묶음 */
function v3pMix(x) {
  const { H, N, hist, fc } = x.tl, y0 = hist[H - 1], mix = Object.keys(x.R).filter((k) => k.startsWith('SUM.mix.'));
  let its = mix.length ? mix.map((k) => ({ label: v3Lab(x, k).name, share: v3V(x, k), val: null, last: null }))
    : (x.I.revbuild?.lines || []).map((l) => ({ label: l.name, share: v3V(x, `REV.l.${l.id}.share`, H - 1), val: v3V(x, `REV.l.${l.id}.val`, H - 1), last: N ? v3V(x, `REV.l.${l.id}.share`, H + N - 1) : null }));
  its = its.filter((it) => v3Ok(it.share) && it.share > 0).sort((a, b) => b.share - a.share);
  if (!its.length) return '';
  const cut = its.length > V3C_PIE.length ? V3C_PIE.length - 1 : its.length, amt = its.every((it) => v3Ok(it.val));
  its.forEach((it, i) => { it.cls = V3C_PIE[Math.min(i, cut)]; });
  const pie = its.slice(0, cut).map((it) => ({ label: it.label, value: amt ? it.val : it.share, cls: it.cls }));
  if (cut < its.length) pie.push({ label: '그 밖', value: v3pAdd(its.slice(cut).map((it) => (amt ? it.val : it.share))), cls: V3C_PIE[cut] });
  const tot = v3V(x, 'REV.total', H - 1) ?? v3V(x, 'IS.rev', H - 1), hasLast = its.some((it) => v3Ok(it.last));
  const donut = v3cDonut({ w: 200, items: pie, center: [amt && v3Ok(tot) ? v3Eok(tot) : `${y0}`, amt && v3Ok(tot) ? `${y0}년 매출` : '매출 비중'], fmt: amt ? (v) => v3Eok(v) : (v) => v3Pct(v), title: `${y0}년 매출 구성` });
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t"><thead><tr><th class="st">줄</th>${amt ? `<th>${y0} 매출</th>` : ''}<th>비중</th>${hasLast ? `<th class="bl">${fc[N - 1]}E 비중</th>` : ''}</tr></thead><tbody>
    ${its.map((it) => `<tr><td class="st"><span class="v3c-leg"><span class="${it.cls}">${esc(it.label)}</span></span></td>${amt ? `<td>${v3Num(it.val)}</td>` : ''}<td>${v3Pct(it.share)}</td>${hasLast ? `<td class="bl">${v3Pct(it.last)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  return v3Sec('매출 구성', amt ? '<span class="meta act">단위 억원</span>' : '', `<div class="v3p-mix" data-o="p-mix">${donut}${tbl}</div>`);
}
/* 스위치 하나만 바꾼 결과(파이썬이 처음 값으로 계산). 기본값은 처음 값의 Base 주당 가치 */
function v3pAlt(x) {
  const alt = x.res.alt || [], b = x.c.py?.scen?.Base?.ps;
  if (!alt.length) return '';
  const tr = (a) => {
    if (a.error || !v3Ok(a.ps)) return `<tr class="same"><td class="st">${esc(a.label || a.key || '')}</td><td colspan="4" class="tx">${esc(a.error || '계산 불가')}</td></tr>`;
    const d = v3Ok(b) ? a.ps - b : null, cls = d > 0 ? 'up' : d < 0 ? 'dn' : '';
    return `<tr class="${d === 0 ? 'same' : ''}"><td class="st">${esc(a.label || a.key || '')}</td><td>${v3Won(a.ps)}</td><td>${d == null ? '-' : `<span class="${cls}">${d > 0 ? '+' : ''}${v3Num(d)}원</span>`}</td><td>${d == null || !b ? '-' : d === 0 ? '0.0%' : v3Up(d / b)}</td><td>${v3Pct(a.wacc, 2)}</td></tr>`;
  };
  const tbl = (rows) => `<div class="mk-scroll"><table class="mk-tbl v3-t v3p-alt"><thead><tr><th class="st">바꾼 가정</th><th>주당 가치</th><th>기본값과 차이</th><th>차이율</th><th>WACC</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  const h = Math.ceil(alt.length / 2), two = x.w > 1000 && alt.length > 8;
  return v3Sec('다른 가정', `<span class="meta act">Base ${v3Won(b)}, 처음 값 기준</span>`, two ? `<div class="v3p-two">${tbl(alt.slice(0, h))}${tbl(alt.slice(h))}</div>` : tbl(alt));
}
function v3pMemo(x) {
  return v3Sec('판단 메모', '', `<textarea class="v3p-memo" data-v3p-memo rows="5" placeholder="투자 판단과 남은 확인 사항" aria-label="판단 메모">${esc(x.st.memo || '')}</textarea>`);
}
function v3pSumScreen(x) {
  return `${v3pTop(x)}<div class="v3p-grid">${v3pKey(x)}${v3pBridge(x, v3pWg(x))}</div>${v3pFin(x)}${v3pMix(x)}${v3pAlt(x)}${v3pMemo(x)}`;
}

// ===== 상세 =====
function v3pPerf(x) {
  const { H } = x.tl, R = x.R, ys = v3Years(x, 'hist+fc'), dy = v3Years(x, 'dcf'), w = v3pW2(x), pad = Array(H).fill(null);
  const bars = v3cBars({ w, h: 260, labels: ys.map((y) => y.label), bars: [{ name: '매출액', values: R['IS.rev'] || [], cls: 's2' }, { name: '영업이익', values: R['IS.ebit'] || [], cls: 's1' }], fc: H, fmt: (v) => v3Num(v), title: '매출액과 영업이익' });
  const rev = R['DCF.rev'] || [], fm = (R['DCF.fcff'] || []).map((v, i) => (v3Ok(v) && rev[i] ? v / rev[i] : null));
  const lines = [{ name: '영업이익률', values: [...(R['IS.ebit_m'] || []).slice(0, H), ...(R['DCF.margin'] || [])], cls: 's1' }, { name: 'ROIC', values: [...pad, ...(R['DCF.roic'] || [])], cls: 's3' },
    { name: '재투자율', values: [...pad, ...(R['DCF.rr'] || [])], cls: 's4' }, { name: 'FCFF ÷ 매출', values: [...pad, ...fm], cls: 's5' }].filter((l) => l.values.some(v3Ok));
  const ratio = v3cLines({ w, h: 260, labels: [...x.tl.hist.map(String), ...dy.map((y) => y.label)], lines, fc: H, fmt: v3pAxPct, zero: true, title: '이익률, ROIC, 재투자율' });
  return v3Sec('실적과 추정', v3pHead(x), `<div class="v3p-two" data-o="p-perf"><div><h3 class="v3-h3">매출액과 영업이익<small>억원</small></h3>${v3cLegend([{ label: '매출액', cls: 's2' }, { label: '영업이익', cls: 's1' }, { label: '추정', cls: 's2', kind: 'fc' }])}${bars}</div>
    <div><h3 class="v3-h3">수익성과 재투자<small>종료연도까지</small></h3>${v3cLegend(lines.map((l) => ({ label: l.name, cls: l.cls, kind: 'line' })))}${ratio}</div></div>`);
}
function v3pRevPath(x, w) {
  const { H, N } = x.tl, ys = v3Years(x, 'hist+fc'), base = v3Row(x, 'IS.rev', 'Base') || [], cons = x.R['REV.cons'] || [];
  const lines = [{ name: '실적', values: [...base.slice(0, H), ...Array(N).fill(null)], cls: 's5' },
    ...V3_SCEN.map((S) => { const r = v3Row(x, 'IS.rev', S) || []; return { name: S, values: [...Array(Math.max(0, H - 1)).fill(null), ...r.slice(Math.max(0, H - 1))], cls: V3P_SC[S] }; }),
    cons.some(v3Ok) ? { name: '컨센서스', values: [...Array(H).fill(null), ...cons], cls: 's1', dash: true } : null].filter(Boolean);
  return v3Sec('시나리오별 매출', '<span class="meta act">단위 억원</span>', `<div data-o="p-rev">${v3cLegend(lines.map((l) => ({ label: l.name, cls: l.cls, kind: l.dash ? 'dash' : 'line' })))}${v3cLines({ w, h: 260, labels: ys.map((y) => y.label), lines, fmt: (v) => v3Num(v), zero: true, title: '시나리오별 매출 경로' })}</div>`);
}
function v3pFcff(x, w) {
  const { N, M } = x.tl, dy = v3Years(x, 'dcf'), R = x.R;
  const ch = v3cBars({ w, h: 260, labels: dy.map((y) => y.label), bars: [{ name: 'FCFF', values: R['DCF.fcff'] || [], cls: 's2' }, { name: '현재가치', values: R['DCF.pv'] || [], cls: 's1' }], marks: M ? [{ i: N, label: '전환 기간' }] : [], fmt: (v) => v3Num(v), title: 'FCFF와 현재가치' });
  return v3Sec('FCFF와 현재가치', v3pHead(x, '억원'), `<div data-o="p-fcff">${v3cLegend([{ label: 'FCFF', cls: 's2' }, { label: '현재가치', cls: 's1' }])}${ch}</div>`);
}
/* 단계에 딸린 근거 문장 [{name, text}]. 같은 글은 이름을 묶어 한 줄로 */
function v3pNotes(x, m) {
  const I = x.I, nt = (k) => v3Note(x, k), nm = (k) => V3P_NOTE_NM[k] || x.lab[`CTL.a.${k}`]?.name || k, out = [];
  const push = (name, text) => { if (text) out.push({ name, text: String(text) }); };
  if (m.step === '매출액') (I.revbuild?.lines || []).forEach((l) => { push(l.name, l.why || nt(`rev.${l.id}`)); push(`${l.name} 출발값`, nt(`rev.${l.id}.fy0`)); });
  else if (m.step === '판관비') {
    const og = I.opex?.groups || {}, ln = Object.fromEntries((I.revbuild?.lines || []).map((l) => [l.id, l.name]));
    Object.entries(og).forEach(([k, g]) => push(k.startsWith('custom.') ? (ln[g.line] ? `${ln[g.line]} 연동 비용` : k.slice(7)) : x.lab[`OPX.sga.${k}`]?.name || k, g.why || nt(`sga_${k}`)));
    [...Object.keys(x.c.notes?.why || {}).filter((k) => k.startsWith('sga_') && !og[k.slice(4)]), 'rnd_pct', 'rnd_cap_share', 'dep_sga_share', 'amort_sga_share'].forEach((k) => push(nm(k), nt(k)));
  } else if (m.step === '시나리오 근거') V3_SCEN.forEach((S) => push(S, I.notes_in?.scenario_why?.[S] || nt(`scenario.${S}`)));
  else (V3P_NOTE[m.step] || []).forEach((k) => push(nm(k), nt(k)));
  const by = new Map();
  out.forEach((o) => { const e = by.get(o.text); if (e) e.name += `, ${o.name}`; else by.set(o.text, { ...o }); });
  return [...by.values()];
}
function v3pStory(x) {
  const map = x.res.map || [];
  if (!map.length) return '';
  const step = (m, i) => {
    const notes = v3pNotes(x, m), w0 = V3P_KD[m.why] || m.why || '';
    const why = !w0 || /^[\w.\s-]+$/.test(w0) || notes.some((n) => n.text === w0) || (notes.length && /^(revbuild 줄별 근거|묶음별 드라이버|리서치 값)$/.test(w0)) ? '' : w0;
    return `<div class="v3p-step"><button type="button" class="v3p-go" data-v3-go="${i + 1}"><span>${i + 1}</span>${esc(m.step)}</button><div><p class="v3p-val">${esc(m.value_text || '')}</p>${why ? `<p class="v3p-wy">${esc(why)}</p>` : ''}
      ${notes.length ? `<dl class="v3p-notes">${notes.map((n) => `<div class="${n.text.length <= 40 ? 's' : ''}"><dt>${V3_SCEN.includes(n.name) ? v3pDot(n.name) : ''}${esc(n.name)}</dt><dd>${esc(n.text)}</dd></div>`).join('')}</dl>` : ''}</div></div>`;
  };
  const groups = [...new Set(map.map((m) => m.group))];
  return v3Sec('단계별 근거', v3pHead(x), `<div data-o="p-story">${groups.map((g) => `<div class="v3p-grp"><h3 class="v3-h3">${esc(g)}</h3>${map.map((m, i) => (m.group === g ? step(m, i) : '')).join('')}</div>`).join('')}</div>`, 'v3p-story');
}
function v3pDetScreen(x) {
  const wg = v3pWg(x);
  return `${v3pPerf(x)}<div class="v3p-grid">${v3pRevPath(x, wg)}${v3pFcff(x, wg)}</div>${v3pStory(x)}`;
}

// ===== 시나리오 =====
/* 시나리오별 주당 가치 세로 막대와 현재가 가로선(v3cBars 는 가로 기준선이 없어 여기서 그림) */
function v3pScenBars(x, w, h = 250) {
  const sc = x.res.scen || {}, wv = x.res.wavg || {}, close = x.t.close, fmt = (v) => v3Num(v);
  const its = [...V3_SCEN.map((S) => ({ label: S, v: sc[S]?.ps, cls: V3P_SC[S] })), { label: '가중평균', v: wv.ok === false ? null : wv.ps, cls: 's1' }].filter((it) => v3Ok(it.v));
  if (!its.length) return '';
  const all = [...its.map((it) => it.v), v3Ok(close) ? close : 0, 0], step = v3cStep(Math.max(...all) - Math.min(...all), w < 560 ? 3 : 4);
  const lo = Math.floor(Math.min(...all) / step) * step, hi = Math.max(Math.ceil(Math.max(...all) / step) * step, lo + step), ticks = v3cTicks(lo, hi, step);
  const P = { l: Math.max(...ticks.map((t) => v3cTw(fmt(t)))) + 10, r: 8, t: 22, b: 26 }, bw = (w - P.l - P.r) / its.length, b1 = Math.min(bw * 0.5, 56);
  const X = (i) => P.l + (i + 0.5) * bw, Y = (v) => P.t + (hi - v) / (hi - lo) * (h - P.t - P.b);
  const grid = ticks.map((t) => `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(Y(t))}" y2="${v3cR(Y(t))}" class="${t ? 'gl' : 'zl'}"/>${v3cText(P.l - 6, Y(t) + 4, fmt(t), 'yl', 'end')}`).join('');
  const bars = its.map((it, i) => v3cBar(X(i) - b1 / 2, Y(0), Y(it.v), b1, 3, 0, `b ${it.cls}`, `${it.label} ${fmt(it.v)}원`) + v3cText(X(i), it.v >= 0 ? Y(it.v) - 5 : Y(it.v) + 14, fmt(it.v), 'v', 'middle') + v3cText(X(i), h - 8, it.label, 'xl', 'middle')).join('');
  const cl = v3Ok(close) ? `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(Y(close))}" y2="${v3cR(Y(close))}" class="hl s5"><title>${esc(`현재가 ${fmt(close)}원`)}</title></line>` : '';
  return (v3Ok(close) ? v3cLegend([{ label: `현재가 ${v3Won(close)}`, cls: 's5', kind: 'dash' }]) : '') + v3cSvg('v3c-bars', w, h, '시나리오별 주당 가치', grid + bars + cl);
}
function v3pScenMain(x) {
  const c = x.c, r = x.res, sc = r.scen || {}, wv = r.wavg || {}, { H, N, fc } = x.tl, w0 = c.switches.weights || {}, ok = wv.ok !== false;
  const g = (S, k, fb) => v3V(x, `SCN.${S}.${k}`, 0, S) ?? fb;
  const row = (key, name, f, avg = '', cls = '') => `<tr data-o="p-sc-${key}" class="${cls}"><td class="st">${name}</td>${V3_SCEN.map((S) => `<td class="${S === x.sc ? 'on' : ''}">${f(S)}</td>`).join('')}<td class="bl">${avg}</td></tr>`;
  const yN = N ? `<small>${fc[N - 1]}E</small>` : '';
  const body = [row('ps', '내재 가치', (S) => (v3Ok(sc[S]?.ps) ? v3Won(sc[S].ps) : '계산 불가'), ok ? v3Won(wv.ps) : '-', 'sum'), row('up', '상승여력', (S) => v3Up(sc[S]?.up) || '-', ok ? v3Up(wv.up) : ''),
    N ? row('g1', `매출 성장률<small>${fc[0]}E</small>`, (S) => v3Pct(v3V(x, 'REV.growth', H, S))) : '', N ? row('rev', `매출${yN}`, (S) => v3Eok(g(S, 'rev_last', v3V(x, 'IS.rev', H + N - 1, S)))) : '',
    N ? row('mg', `영업이익률${yN}`, (S) => v3Pct(g(S, 'ebit_m_last', v3V(x, 'IS.ebit_m', H + N - 1, S)))) : '',
    row('ni1', '지배순이익<small>FY1</small>', (S) => v3Eok(g(S, 'ni_fy1', null))), row('ni2', '지배순이익<small>FY2</small>', (S) => v3Eok(g(S, 'ni_fy2', null))),
    row('wacc', 'WACC', (S) => v3Pct(sc[S]?.wacc, 2)), row('tv', '종료가치 비중', (S) => v3Pct(sc[S]?.tv_share))].join('');
  const wrow = `<tr><td class="st">가중치<small>%</small></td>${V3_SCEN.map((S) => `<td class="in">${v3In(x, `sw.weights#${S}`, w0[S], { fmt: 'pct', cell: true, lab: `${S} 가중치` })}</td>`).join('')}<td class="bl" data-o="p-sc-wsum"><span class="${ok ? '' : 'v3p-bad'}">합 ${v3pSumPct(wv.sum)}</span></td></tr>`;
  const tbl = `<div><div class="mk-scroll"><table class="mk-tbl v3-t v3p-kt v3p-sct"><thead><tr><th class="st">항목</th>${V3_SCEN.map((S) => `<th class="${S === x.sc ? 'on' : ''}">${v3pDot(S)}${S}</th>`).join('')}<th class="bl">가중평균</th></tr></thead><tbody>${body}${wrow}</tbody></table></div>
    <div data-o="p-sc-msg">${ok ? '' : `<p class="v3p-warn">${v3pWhyNot(wv)}</p>`}</div></div>`;
  const cw = x.w > 1000 ? Math.max(280, Math.floor((x.w - 80) / 2.5)) : v3Wd(x);
  const why = x.I.notes_in?.scenario_why || {}, notes = V3_SCEN.map((S) => ({ S, text: why[S] || v3Note(x, `scenario.${S}`) })).filter((n) => n.text);
  return v3Sec('시나리오와 가중평균', '', `<div class="v3p-scg">${tbl}<div data-o="p-sc-bars">${v3pScenBars(x, cw, x.w > 1000 ? 420 : 250)}</div></div>
    ${notes.length ? `<h3 class="v3-h3">시나리오 근거</h3><dl class="v3p-notes">${notes.map((n) => `<div><dt>${v3pDot(n.S)}${n.S}</dt><dd>${esc(n.text)}</dd></div>`).join('')}</dl>` : ''}`);
}
function v3pScenPath(x) {
  const { H, hist, fc } = x.tl;
  if (!H) return '';
  const cols = [{ i: H - 1, label: `${hist[H - 1]}`, h: true }, ...fc.map((y, k) => ({ i: H + k, label: `${y}E` }))];
  const body = [['IS.rev', '매출액', 'amt'], ['IS.ebit', '영업이익', 'amt'], ['IS.ebit_m', '영업이익률', 'pct']].filter(([id]) => x.R[id]).map(([id, nm, fmt]) => `<tr class="grp"><th class="st">${nm}</th><td colspan="${cols.length}"></td></tr>${V3_SCEN.map((S) => {
    const r = v3Row(x, id, S) || [];
    return `<tr class="${S === x.sc ? 'on' : ''}"><td class="st">${v3pDot(S)}${S}</td>${cols.map((k, j) => `<td class="${k.h ? 'h' : ''}${j === 1 ? ' bl' : ''}">${v3Fmt(r[k.i], fmt)}</td>`).join('')}</tr>`;
  }).join('')}`).join('');
  if (!body) return '';
  return v3Sec('시나리오별 경로', '<span class="meta act">단위 억원</span>', `<div class="mk-scroll" data-o="p-sc-path"><table class="mk-tbl v3-t v3p-pt"><thead><tr><th class="st">항목</th>${cols.map((k, j) => `<th class="${j === 1 ? 'bl' : ''}">${k.label}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`);
}

v3Rep('sum', '요약', (x) => v3pSumScreen(x));
v3Rep('det', '상세', (x) => v3pDetScreen(x));
v3Rep('scen', '시나리오', (x) => v3pScenMain(x) + v3pScenPath(x));
v3On('input', '[data-v3p-memo]', (el, x) => { x.st.memo = el.value; v3Save(); });

// ---------- 보고서: 민감도, 리버스, 풋볼필드, 몬테카를로 (v3q) ----------
// 민감도 표와 토네이도는 x.res.sens(Base 기준, 간격은 sw.sens_step)를 그대로 그림. 단일 변수 슬라이더는 V3E.valueOnly로 결과 칸만 바꾸고 모델 입력은 그대로 둠(슬라이더 자리는 x.st.qsl).
// 모델 리버스는 V3E.reverseModel 결과를 사례와 덮기별로 v3qRM에 기억(x.st에는 넣지 않음). 몬테카를로는 파이썬 결과(x.res.mc)만 보여 줌.
const v3qPp = (v, d = 1) => (v3Ok(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${v3Num(Math.abs(v) * 100, d)}%p` : '-');
const v3qD = (vs) => ((vs || []).every((v) => !v3Ok(v) || Math.abs(v * 100 - +(v * 100).toFixed(1)) < 1e-7) ? 1 : 2); // % 로 보일 때 필요한 소수 자리
const v3qUpOf = (v, close) => (v3Ok(v) && close ? v / close - 1 : null);
const v3qKv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
const v3qEmpty = (title, text) => v3Sec(title, '', `<div class="empty">${text}</div>`);

// ===== 민감도 =====
/* 이중 변수 표 하나: 세로 WACC, 가로 xName. 현재가보다 높으면 up(빨강), 낮으면 dn(파랑), 가운데 칸 mid */
function v3qSensTbl(t, xName, xf, close) {
  if (!t || !Array.isArray(t.x) || !Array.isArray(t.y) || !Array.isArray(t.z)) return '<div class="empty">표를 만들 값이 없습니다.</div>';
  const ci = Math.floor(t.y.length / 2), cj = Math.floor(t.x.length / 2);
  const cell = (v, i, j) => `<td class="${[v3Ok(v) && close ? (v > close ? 'up' : v < close ? 'dn' : '') : '', i === ci && j === cj ? 'mid' : ''].join(' ').trim()}">${v3Num(v)}</td>`;
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3q-st"><thead><tr><th class="st" rowspan="2">WACC</th><th class="ax" colspan="${t.x.length}">${xName}</th></tr>
    <tr>${t.x.map((v, j) => `<th class="${j === cj ? 'c' : ''}">${xf(v)}</th>`).join('')}</tr></thead>
    <tbody>${t.y.map((w, i) => `<tr><td class="st${i === ci ? ' c' : ''}">${v3Pct(w, 2)}</td>${(t.z[i] || []).map((v, j) => cell(v, i, j)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/* 토네이도 줄: 엔진이 준 변수 이름에서 괄호 설명을 떼고, 움직인 폭을 단위에 맞춰 붙임(일수는 일, 베타는 숫자, 나머지는 %p) */
const V3Q_TOR_SHORT = { '종료연도 영업이익률': '종료 영업이익률', '매출채권 회전일수': '매출채권 일수', '유지 CAPEX 비율': '유지 CAPEX' };
function v3qTorRows(x, nar) {
  return (x.res.sens?.tornado || []).filter((r) => r && (v3Ok(r.ps_lo) || v3Ok(r.ps_hi))).map((r) => {
    const nm = String(r.var ?? '').replace(/\s*\(.*?\)/g, ''), days = /일수/.test(nm), beta = /베타/.test(nm);
    const mag = (v) => (days ? `${v3Num(Math.abs(v))}일` : beta ? v3Num(Math.abs(v), 2) : `${v3Num(Math.abs(v) * 100, v3qD([r.lo, r.hi]))}%p`);
    const sg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${mag(v)}`, sym = v3Ok(r.lo) && v3Ok(r.hi) && Math.abs(r.lo + r.hi) < 1e-12;
    return { label: nar ? `${V3Q_TOR_SHORT[nm] || nm}${sym ? ` ±${mag(r.hi)}` : ''}` : nm, lo_label: v3Ok(r.lo) ? sg(r.lo) : '', hi_label: v3Ok(r.hi) ? sg(r.hi) : '', ps_lo: r.ps_lo, ps_hi: r.ps_hi };
  });
}
/* 단일 변수 슬라이더: 변수별 지금 값, 범위(지금 값 ±span), 엔진에 넘길 덮기 */
const V3Q_SV = [['wacc', 'WACC', 'WACC'], ['g', '영구성장률', '영구성장률'], ['margin', '영업이익률', '종료연도 영업이익률'], ['growth', '매출 성장률', '매출 성장률 가산']]; // [키, 단추 이름, 결과 칸 이름]
function v3qSvDef(x) {
  const k = V3Q_SV.some(([v]) => v === x.st.qsv) ? x.st.qsv : 'wacc', b = x.res.scen?.Base || {}, mx = x.res.sens?.wacc_margin?.x || [], mr = v3Row(x, 'DCF.margin', 'Base') || [];
  const sh0 = +x.ov['o.wacc_shift'] || 0, pct = (v) => v3Pct(v, 2);
  const def = {
    wacc: { cur: b.wacc, span: 0.03, step: 0.0005, fmt: pct, ov: (v, cur) => ({ 'o.wacc_shift': sh0 + v - cur }) },
    g: { cur: b.g_s, span: 0.02, step: 0.0005, fmt: pct, ov: (v) => ({ 'o.g': v }) },
    margin: { cur: mx[Math.floor(mx.length / 2)] ?? mr[mr.length - 1], span: 0.1, step: 0.001, fmt: pct, ov: (v) => ({ 'o.ty_margin': v }) },
    growth: { cur: +x.ov['o.growth_add'] || 0, span: 0.1, step: 0.001, fmt: (v) => v3qPp(v, 1), ov: (v) => ({ 'o.growth_add': v }) },
  }[k];
  const d = x.st.qsl && x.st.qsl.k === k && v3Ok(x.st.qsl.d) ? Math.min(def.span, Math.max(-def.span, x.st.qsl.d)) : 0;
  return { ...def, k, name: V3Q_SV.find(([v]) => v === k)[2], ok: v3Ok(def.cur), d };
}
function v3qSvOut(x, sv, v) {
  let ps = null;
  try { ps = V3E.valueOnly(x.c, { ...x.ov, ...sv.ov(v, sv.cur) }, 'ps'); } catch { ps = null; }
  const d = v - sv.cur, same = Math.abs(d) < 1e-9;
  return `${v3qKv(sv.name, `${sv.fmt(v)}${sv.k === 'growth' ? '' : `<small>${same ? '지금 값' : v3qPp(d, 2)}</small>`}`)}${v3qKv('조정 내재 가치', v3Ok(ps) ? v3Won(ps) : '계산 불가')}${v3qKv('상승여력', v3Up(v3qUpOf(ps, x.t.close)) || '-')}`;
}
function v3qSens(x, c) {
  const s = x.res.sens, close = x.t.close, b = x.res.scen?.Base || {};
  if (!s) return v3qEmpty('민감도', '민감도 결과가 없습니다.');
  const st0 = c.switches.sens_step || {}, nar = v3Wd(x) < 560;
  const steps = `<div class="v3q-step"><h3 class="v3-h3">간격</h3><div class="v3-fs">${[['wacc', 'WACC'], ['g', '영구성장률'], ['margin', '종료연도 영업이익률'], ['growth', '전환 기간 성장률']]
    .map(([k, lab]) => v3F(lab, v3In(x, `sw.sens_step#${k}`, st0[k], { fmt: 'pct', d: 2, u: '%p', lab: `${lab} 간격`, dis: !x.live }))).join('')}</div></div>`;
  const tb = (key, xName, xf) => `<div data-o="q-s-${key}">${v3qSensTbl(s[key], xName, xf, close)}</div>`;
  const dm = v3qD(s.wacc_margin?.x), df = v3qD(s.wacc_fade?.x);
  const two = v3Sec('이중 변수', `<span class="meta">Base, 현재가 ${v3Won(close)}, 단위 원</span>`, `<div class="v3q-sg">${steps}
    ${tb('wacc_g', '영구성장률', (v) => v3Pct(v, 2))}${tb('wacc_margin', '종료연도 영업이익률', (v) => v3Pct(v, dm))}${tb('wacc_fade', '전환 기간 시작 성장률 가산', (v) => v3qPp(v, df))}</div>`);
  const rows = v3qTorRows(x, nar);
  const tor = v3Sec('변수별 영향', '<span class="meta">Base, 단위 원</span>', `<div data-o="q-tor">${rows.length && v3Ok(b.ps)
    ? `${v3cLegend([{ label: 'Base보다 높음', cls: 'up' }, { label: 'Base보다 낮음', cls: 'dn' }])}${v3cTornado({ w: v3Wd(x), base: b.ps, baseLabel: 'Base', rows, fmt: (v) => v3Num(v) })}`
    : '<div class="empty">Base 내재 가치를 계산하지 못해 그리지 않았습니다.</div>'}</div>`);
  let one = '';
  if (x.live) {
    const sv = v3qSvDef(x);
    one = v3Sec('단일 변수', v3Seg('qsv', V3Q_SV.map(([v, l]) => [v, l]), sv.k), sv.ok ? `<div class="v3q-sv">
      <input type="range" data-v3q-sl min="${-Math.round(sv.span / sv.step)}" max="${Math.round(sv.span / sv.step)}" step="1" value="${Math.round(sv.d / sv.step)}" aria-label="${sv.name}" aria-valuetext="${sv.fmt(sv.cur + sv.d)}">
      <div class="v3q-svax"><span>${sv.fmt(sv.cur - sv.span)}</span><span>${sv.fmt(sv.cur + sv.span)}</span></div>
      <dl class="va-kv v3q-svo" data-o="q-sv">${v3qSvOut(x, sv, sv.cur + sv.d)}</dl></div>` : '<div class="empty">지금 값을 계산하지 못해 움직일 수 없습니다.</div>', 'v3q-svc');
  }
  return two + tor + one;
}
v3On('input', '[data-v3q-sl]', (el, x) => {
  const sv = v3qSvDef(x), d = +el.value * sv.step, out = el.closest('.v3q-sv')?.querySelector('.v3q-svo'); // 슬라이더 값은 지금 값에서 몇 칸 움직였는지(정수)
  if (!sv.ok || !Number.isFinite(d)) return false;
  x.st.qsl = { k: sv.k, d };
  el.setAttribute('aria-valuetext', sv.fmt(sv.cur + d));
  if (out) out.innerHTML = v3qSvOut(x, sv, sv.cur + d);
  return false;
});

// ===== 리버스 =====
/* 막대와 선을 같은 축에 그림(v3cBars는 선이 오른쪽 축을 따로 써서 매출 막대와 매출 선을 겹칠 수 없음)
   o = {w, h=260, labels, bar: {name, values, cls}, lines: [{name, values, cls, dash}], fmt} */
function v3qCombo(o) {
  const w = o.w || 720, h = o.h || 260, nar = w < 560, fmt = v3cFmt(o), labels = o.labels || [], n = labels.length, bar = o.bar || {}, lines = o.lines || [];
  const all = [...(bar.values || []), ...lines.flatMap((s) => s.values || [])].filter(v3cOk);
  const hi0 = Math.max(0, ...all), lo0 = Math.min(0, ...all), step = v3cStep(hi0 - lo0 || 1, nar ? 3 : 4);
  const hi = Math.ceil(hi0 / step - 1e-9) * step || step, lo = Math.floor(lo0 / step + 1e-9) * step, ticks = v3cTicks(lo, hi, step), tl = ticks.map(fmt);
  const P = { l: Math.max(0, ...tl.map(v3cTw)) + 10, r: 10, t: 14, b: 26 }, bw = (w - P.l - P.r) / Math.max(n, 1), X = (i) => P.l + (i + 0.5) * bw, Y = (v) => P.t + (hi - v) / (hi - lo) * (h - P.t - P.b);
  const grid = ticks.map((t, j) => `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(Y(t))}" y2="${v3cR(Y(t))}" class="${t ? 'gl' : 'zl'}"/>${v3cText(P.l - 6, Y(t) + 4, tl[j], 'yl', 'end')}`).join('');
  const b1 = Math.max(1, Math.min(bw * (nar ? 0.76 : 0.64), 44)), dots = bw >= 14;
  const bars = (bar.values || []).map((v, i) => (i < n && v3cOk(v) ? v3cBar(X(i) - b1 / 2, Y(0), Y(v), b1, 3, 0, `b ${bar.cls || 's2'}`, `${labels[i]} ${bar.name ?? ''} ${fmt(v)}`) : '')).join('');
  const ls = lines.map((s) => v3cLine(Array.from({ length: n }, (_, i) => {
    const v = s.values?.[i];
    return v3cOk(v) ? { i, x: v3cR(X(i)), y: v3cR(Y(v)), tip: `${labels[i]} ${s.name ?? ''} ${fmt(v)}` } : null;
  }), s.cls || 's1', s.dash, Infinity, dots)).join('');
  const xw = Math.max(0, ...labels.map(v3cTw)), ev = Math.max(1, Math.ceil((xw + 8) / bw));
  const xs = labels.map((s, i) => ((n - 1 - i) % ev ? '' : v3cText(v3cClamp(X(i), v3cTw(s) / 2 + 1, w - v3cTw(s) / 2 - 1), h - 8, s, 'xl', 'middle'))).join('');
  return v3cSvg(`v3c-bars${dots ? '' : ' dense'}`, w, h, o.title || [bar, ...lines].map((s) => s.name).filter(Boolean).join(', '), grid + bars + ls + xs);
}
/* 매출 실적 막대, 내재 매출 경로(출발은 최근 12개월 매출), 모델 Base, 컨센서스 */
function v3qRevChart(x, v) {
  const { hist, H } = x.tl, rev = v3Row(x, 'IS.rev', 'Base') || [], R = x.I.rdcf || {}, cons = x.I.cons || {};
  if (!H || !v3Ok(rev[H - 1])) return '';
  const yl = hist[H - 1], bs = String(x.t.bs_date || ''), by = parseInt(bs.slice(0, 4), 10), bm = parseInt(bs.slice(5, 7), 10);
  const yb = Number.isFinite(by) ? Math.max(yl, by - (bm < 7 ? 1 : 0)) : yl; // 최근 12개월이 가장 가까운 회계연도
  const path = v.ok && Array.isArray(v.rev_path) ? v.rev_path : [], ttm = v3Ok(R.rev_ttm) ? R.rev_ttm : v3Ok(R.s0) && v3Ok(R.shares) ? R.s0 * R.shares / 1e8 : null;
  const cy = (cons.years || []).map((y, i) => [y, cons.rev?.[i]]).filter(([y, val]) => y > yl && v3Ok(val));
  const y1 = Math.max(yl + Math.max(0, rev.length - H), yb + path.length, ...cy.map(([y]) => y)), ys = Array.from({ length: y1 - hist[0] + 1 }, (_, i) => hist[0] + i);
  const at = (pts) => ys.map((y) => { const p = pts.find(([py]) => py === y); return p ? p[1] : null; });
  const lines = [{ name: '모델 Base', cls: 's3', values: at([[yl, rev[H - 1]], ...rev.slice(H).map((val, i) => [yl + 1 + i, val])]) }];
  if (cy.length) lines.push({ name: '컨센서스', cls: 's5', dash: true, values: at([[yl, rev[H - 1]], ...cy]) });
  if (path.length) lines.push({ name: '내재 매출 경로', cls: 's1', values: at([[yb, ttm], ...path.map((val, i) => [yb + 1 + i, val])]) });
  return `<h3 class="v3-h3">매출 경로<small>단위 억원</small></h3>${v3cLegend([{ label: '매출 실적', cls: 's2' }, path.length ? { label: '내재 매출 경로', cls: 's1', kind: 'line' } : null, { label: '모델 Base', cls: 's3', kind: 'line' }, cy.length ? { label: '컨센서스', cls: 's5', kind: 'dash' } : null])}
    ${v3qCombo({ w: v3Wd(x), labels: ys.map(String), bar: { name: '매출 실적', cls: 's2', values: ys.map((y, i) => (i < H ? rev[i] : null)) }, lines, fmt: (val) => v3Num(val), title: '매출 실적과 내재 매출 경로' })}`;
}
/* 모델 리버스: 덮기가 없으면 사례의 값, 덮기가 있으면 「다시 계산」으로 구한 값(v3qRM). 덮기가 달라졌으면 처음 값과 안내 */
let v3qRM = null;
const v3qRmKey = (x) => `${x.c.id}|${x.c.generated_at}|${JSON.stringify(x.ov)}`;
function v3qModel(x) {
  const has = Object.keys(x.ov).length > 0, fresh = has && !!v3qRM && v3qRM.key === v3qRmKey(x), m = fresh ? v3qRM.m : x.res.rdcf?.model, stale = has && !fresh;
  const btn = x.live ? `<button class="btn sm" type="button" data-v3q-rm${stale ? '' : ' disabled'}>다시 계산</button>` : '';
  if (!m) return `<div class="v3q-rmh"><p class="v3q-note">${fresh ? '맞출 주가가 없어 계산하지 못했습니다.' : '모델 리버스 결과가 없습니다.'}</p>${btn}</div>`;
  const src = (fresh ? x.res.rows.Base : x.c.py?.rows?.Base) || x.res.rows.Base || {}, rev = src['REV.total'] || src['IS.rev'] || [], H = x.tl.H, yl = x.tl.hist[H - 1], cons = x.I.cons || {};
  const n = Math.max((m.rev_path || []).length, rev.length - H, 0), ys = Array.from({ length: n }, (_, i) => yl + 1 + i);
  const tr = (name, vals, cls = '') => `<tr class="${cls}"><td class="st">${name}</td><td class="h">${v3Fmt(rev[H - 1], 'amt')}</td>${ys.map((_, i) => `<td class="${i ? '' : 'bl'}">${v3Fmt(vals[i], 'amt')}</td>`).join('')}</tr>`;
  const cv = ys.map((y) => { const i = (cons.years || []).indexOf(y); return i < 0 ? null : cons.rev?.[i]; });
  const tbl = n ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3q-rt"><thead><tr><th class="st">매출</th><th>${yl}</th>${ys.map((y, i) => `<th class="${i ? '' : 'bl'}">${y}E</th>`).join('')}</tr></thead>
    <tbody>${v3Ok(m.x) && m.rev_path ? tr('내재 매출 경로', m.rev_path, 'sum') : ''}${tr('모델 Base', rev.slice(H))}${cv.some(v3Ok) ? tr('컨센서스', cv) : ''}</tbody></table></div>` : '';
  const kv = v3Ok(m.x) ? `${v3qKv('매출 성장률 가산', v3qPp(m.x, 2))}${v3qKv('내재 연평균 성장률', v3Pct(m.cagr, 2))}` : '';
  return `<div class="v3q-rmh"><dl class="va-kv">${kv}${v3qKv('모델 Base', v3Pct(m.base_cagr, 2))}${v3Ok(m.cons_cagr) ? v3qKv('컨센서스', v3Pct(m.cons_cagr, 2)) : ''}</dl>${btn}</div>
    ${stale ? '<p class="v3q-note warn">입력이 바뀌어 다시 계산이 필요합니다. 아래는 처음 값입니다.</p>' : ''}${v3Ok(m.x) ? '' : '<p class="v3q-note">성장률 가산 −30%p에서 60%p 사이에 이 주가와 맞는 값이 없습니다.</p>'}${tbl}`;
}
v3On('click', '[data-v3q-rm]', (el, x) => {
  let m = null;
  try { m = V3E.reverseModel(x.c, x.ov) ?? null; } catch (e) { console.error(e); toast('모델 리버스를 계산하지 못했습니다.'); return false; }
  v3qRM = { key: v3qRmKey(x), m };
  return true;
});
const V3Q_PATH = [['compound', '복리'], ['linear', '단리'], ['log', '로그']];
function v3qRev(x, c) {
  const R = x.I.rdcf, rd = x.res.rdcf;
  if (!R || !rd) return v3qEmpty('리버스', '리버스 DCF 입력이 없습니다.');
  const R0 = c.input.rdcf || {}, pe = (x.st.qrm || (x.sw.company_type === 'financial' ? 'pe' : 'pfcf')) === 'pe', v = (pe ? rd.pe : rd.pfcf) || { ok: false }, dis = !x.live;
  const relps = x.I.rel?.ps?.median, tk = x.sw.rdcf_target || 'close', tgt = { close: x.t.close, manual: x.sw.rdcf_price, relval: relps }[tk];
  const f0 = pe ? R.eps0 : R.f0, fName = pe ? 'EPS' : '주당 FCF', nCur = v3Ok(R.n) ? Math.trunc(R.n) : 10, ns = [...new Set([5, 10, 15, nCur])].sort((a, b) => a - b);
  const seg = (lab, html) => `<div><span>${lab}</span>${html}</div>`;
  const basic = `<dl class="va-kv" data-o="q-rb">${v3qKv('주가', v3Won(tgt))}${v3qKv(fName, v3Won(f0))}${v3qKv('주당 매출', v3Won(R.s0))}${v3qKv('주식 수', v3Ok(R.shares) ? `${v3Num(R.shares)}주` : '-')}</dl>`;
  const asm = `<div class="v3-opt">${seg('주가 기준', v3Sw(x, 'sw.rdcf_target', [['close', '현재가'], ...(v3Ok(relps) ? [['relval', '상대가치']] : []), ['manual', '직접 입력']], tk))}
    ${seg('기간', v3Sw(x, 'i.rdcf.n', ns.map((y) => [y, `${y}년`]), nCur))}${seg('성장 형태', v3Sw(x, 'i.rdcf.path', V3Q_PATH, R.path || 'compound'))}
    ${seg('할인율', v3Sw(x, 'sw.rdcf_r', [['ke', '자기자본비용'], ['wacc', 'WACC'], ['fixed10', '10%']], x.sw.rdcf_r))}</div>
    <div class="v3-fs">${tk === 'manual' ? v3F('주가', v3In(x, 'sw.rdcf_price', c.switches.rdcf_price, { fmt: 'won', lab: '맞출 주가', ph: v3Num(x.t.close), dis })) : ''}
    ${pe ? v3F('최종 P/E', v3In(x, 'i.rdcf.pe', R0.pe, { fmt: 'x', lab: '최종 P/E', dis })) : v3F('최종 P/FCF', v3In(x, 'i.rdcf.multiple', R0.multiple, { fmt: 'x', lab: '최종 P/FCF', dis }))}
    ${v3F('순이익률', v3In(x, 'i.rdcf.npm', R0.npm, { fmt: 'pct', lab: '순이익률', dis }))}${pe ? '' : v3F('FCF 전환 비율', v3In(x, 'i.rdcf.conv', R0.conv, { fmt: 'pct', lab: 'FCF 전환 비율', dis }))}</div>`;
  const why = !v3Ok(tgt) ? '맞출 주가를 입력해 주세요.' : !v3Ok(f0) || f0 <= 0 ? `${fName}가 0 이하라 성장률을 풀 수 없습니다.` : '이 주가와 맞는 성장률이 −90%에서 300% 사이에 없습니다.';
  const sN = v.rev_path?.length ? v.rev_path[v.rev_path.length - 1] : null;
  const res = v.ok ? `<div class="v3q-res"><div><span>내재 ${pe ? 'EPS' : 'FCF'} 성장률</span><b>${v3Pct(v.g, 2)}</b></div><div><span>내재 매출 성장률</span><b>${v3Pct(v.g_sales, 2)}</b></div><div><span>출구 가치 비중</span><b>${v3Pct(v.tv_share)}</b></div></div>
    <dl class="va-kv v3q-kv">${v3qKv('할인율', v3Pct(v.r, 2))}${v3qKv(`${v.n}년 뒤 ${fName}`, v3Won(v.fn))}${v3Ok(sN) ? v3qKv(`${v.n}년 뒤 매출`, v3Eok(sN)) : ''}</dl>` : `<div class="empty">${why}</div>`;
  return v3Sec('기본 입력치와 가정값', v3Seg('qrm', [['pfcf', 'P/FCF'], ['pe', 'P/E']], pe ? 'pe' : 'pfcf'), `<h3 class="v3-h3">기본 입력치</h3>${basic}<h3 class="v3-h3">가정값</h3>${asm}`, 'v3q-rvc')
    + v3Sec('결괏값', `<span class="meta">${pe ? 'P/E' : 'P/FCF'}</span>`, `<div data-o="q-rr">${res}${v3qRevChart(x, v)}</div>`)
    + v3Sec('모델 리버스', '<span class="meta">Base, 단위 억원</span>', `<div data-o="q-rm">${v3qModel(x)}</div>`);
}

// ===== 풋볼필드 =====
const V3Q_FF = { market: ['s5', '52주'], broker: ['s5', '증권사'], dcf: ['s1', 'DCF'], mc: ['s2', '몬테카를로'], rel: ['s4', '상대가치'] };
function v3qFf(x) {
  const ff = (x.res.ff || []).filter((r) => r && v3Ok(r.lo) && v3Ok(r.hi)), close = x.t.close, tgt = x.res.blend?.target, base = x.res.scen?.Base?.ps;
  if (!ff.length) return v3qEmpty('풋볼필드', '비교할 가치 범위가 없습니다.');
  const w = v3Wd(x), nar = w < 560, nb = (x.t.broker_targets || []).filter((b) => v3Ok(b?.goal)).length;
  const rows = ff.map((r) => { const [cls, short] = V3Q_FF[r.kind] || ['s5', r.label]; return { label: nar ? short : r.label, lo: r.lo, hi: r.hi, cls, mid: r.kind === 'dcf' && v3Ok(base) ? base : undefined,
    note: r.kind === 'dcf' && v3Ok(base) ? `Base ${v3Num(base)}` : r.kind === 'broker' && nb ? `${nb}곳` : '' }; });
  const marks = [v3Ok(close) ? { x: close, label: `현재가 ${v3Num(close)}`, cls: 's5', dash: true } : null, v3Ok(tgt) ? { x: tgt, label: `목표주가 ${v3Num(tgt)}`, cls: 's1', dash: true } : null];
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3q-ft"><thead><tr><th class="st">구분</th><th>최저</th><th>최고</th><th>현재가 대비</th></tr></thead>
    <tbody>${ff.map((r) => `<tr><td class="st">${esc(r.label)}</td><td>${v3Num(r.lo)}</td><td>${v3Num(r.hi)}</td><td>${v3Up(v3qUpOf(r.lo, close)) || '-'}～${v3Up(v3qUpOf(r.hi, close)) || '-'}</td></tr>`).join('')}</tbody></table></div>`;
  return v3Sec('풋볼필드', '<span class="meta">단위 원</span>', `<div data-o="q-ff">${v3cFootball({ w, rows, marks, fmt: (v) => v3Num(v) })}${tbl}</div>`);
}

// ===== 몬테카를로 =====
function v3qMc(x) {
  const m = x.res.mc, close = x.t.close;
  if (!m || m.error || !m.hist || !Array.isArray(m.hist.counts) || !m.hist.counts.length) return v3qEmpty('몬테카를로', '몬테카를로 결과가 없습니다.');
  const wide = x.w >= 1100, w = wide ? Math.floor((x.w - 48 - 32) * 0.6) : v3Wd(x), won = (v) => v3Num(v), th = v3Ok(m.up_th) ? m.up_th : 0.15;
  const chart = `${v3cLegend([{ label: '25～75% 구간', cls: 's1' }, { label: '그 밖', cls: 's2' }])}${v3cHist({ w, h: wide ? 340 : 260, edges: m.hist.edges, counts: m.hist.counts, band: [m.p25, m.p75], fmt: won, title: '주당 가치 분포',
    marks: [v3Ok(close) ? { x: close, label: `현재가 ${won(close)}`, cls: 's5', dash: true } : null, { x: m.mean, label: `평균 ${won(m.mean)}`, cls: 's3' }, { x: m.median, label: `중앙값 ${won(m.median)}`, cls: 's4', dash: true }] })}`;
  const up = (v) => v3Up(v3qUpOf(v, close)) || '-', rng = (a, b) => [`${won(a)}～${won(b)}`, `${up(a)}～${up(b)}`];
  const rows = [['평균', won(m.mean), up(m.mean)], ['중앙값', won(m.median), up(m.median)], ['25～75%', ...rng(m.p25, m.p75)], ['5～95%', ...rng(m.p5, m.p95)],
    ['현재가보다 높을 확률', v3Pct(m.p_up0), ''], [`${v3Num(th * 100)}% 넘게 오를 확률`, v3Pct(m.p_up15), ''], ['시행 횟수', v3Ok(m.n) ? `${v3Num(m.n)}회` : '-', ''], ['시드', v3Ok(m.seed) ? String(m.seed) : '-', '']];
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3q-mt"><thead><tr><th class="st">항목</th><th>값</th><th>현재가 대비</th></tr></thead><tbody>${rows.map(([k, v, u]) => `<tr><td class="st">${k}</td><td>${v}</td><td>${u}</td></tr>`).join('')}</tbody></table></div>`;
  const note = Object.keys(x.st.ov).length > 0 ? '<p class="v3q-note warn">처음 값으로 계산한 분포입니다. 바꾼 입력은 파이썬에서 다시 계산해야 반영됩니다.</p>' : '';
  return v3Sec('주당 가치 분포', '<span class="meta">Base, 단위 원</span>', `${note}<div class="v3q-mc"><div>${chart}</div>${tbl}</div>`);
}

v3Rep('sens', '민감도', v3qSens);
v3Rep('rev', '리버스', v3qRev);
v3Rep('ff', '풋볼필드', v3qFf);
v3Rep('mc', '몬테카를로', v3qMc);

// ---------- 화면 설명 (사례를 그릴 때마다 그 사례의 설정과 출처로 다시 채움. c 가 없어도 열림) ----------
const V3I_SW = {
  fy1_mode: { ytd_plus_rest: '누적 실적 + 남은 분기 추정', full: '연간 전체 추정', ttm: '최근 4분기' },
  cogs_mode: { ratio: '전사 원가율', seg_ratio: '사업부 원가율', unit_cost: '단위원가', gpm_step: '매출총이익률 단계', components: '성격별 구성' },
  labor_mode: { pct_sales: '매출 비례', headcount: '인원 × 인당 인건비' },
  ppe_mode: { waterfall: '변동표', simple: '약식', maint_exp: '유지 CAPEX + 확장 CAPEX', capacity: '생산능력', store: '매장 수' },
  nwc_avg: { last: '직전 결산 연도', avg3: '3년 평균', avg5: '5년 평균', median5: '5년 중앙값', manual: '직접 입력' },
  debt_plan: { hold: '기말 잔액 유지', amort: '만기표대로 상환', avg: '최근 5년 평균', manual: '직접 입력' },
  tax_mode: { eff_avg: '유효세율 평균', statutory: '법정 세액', marginal: '한계세율', manual: '직접 입력' },
  beta_mode: { auto: '자동', regression: '회귀', bottom_up: '바텀업', manual: '직접 입력', accounting: '회계 베타' },
  rf: { avg_3m: '국고채 10년 최근 3개월 평균', spot: '국고채 10년 기준일 값', avg_1y: '국고채 10년 1년 평균', avg_2y: '국고채 10년 2년 평균', manual: '직접 입력' },
  erp: { damodaran: 'Damodaran 성숙 시장 + 국가위험', damodaran_cds: 'Damodaran CDS 기준', historical: '과거 수익률', implied_kospi: 'KOSPI 내재 프리미엄', manual: '직접 입력' },
  kd: { auto: '자동', synthetic: '합성 등급', rating: '실제 신용등급', effective: '실효이자율', market_yield: '회사채 수익률', recent_issue: '최근 발행 금리', peer_avg: '비교기업 평균', extra_spread: '가산 스프레드', manual: '직접 입력' },
  g: { cpi10: '소비자물가 10년 평균', rf: '무위험이자율', gdp_nominal: '명목 GDP 성장률 10년 평균', manual: '직접 입력' },
  tv: { gordon: '영구성장', exit_mult: '배수', liquidation: '청산가치', finite: '유한 기간' },
  discount: { end: '기말', mid: '기중' },
  share_basis: { diluted: '희석 주식수', basic: '유통주식수', issued: '발행주식 총수' },
  fcff_tax: { is_eff: '그해 손익 유효세율', marginal: '한계세율', is_total: '손익 법인세 전체' },
  ty_tax: { statutory: 'EBIT 기준 법정 유효세율', eff: '유효세율', marginal: '한계세율' },
};
function v3Info(c) {
  const ov = (c && v3S.st[c.id]?.ov) || {}, sw = (k) => (ov[`sw.${k}`] ? ov[`sw.${k}`].v : c?.switches?.[k]);
  const nm = (k) => { const v = sw(k); return v == null ? null : V3I_SW[k]?.[v] || String(v); };
  const t = c?.target || {}, tl = c?.timeline || {}, mk = c?.input?.market || {}, rb = c?.input?.revbuild || {}, pct = (v, d = 2) => (v3Ok(v) ? v3Pct(v, d) : null);
  const br = (mk.tax?.brackets || []).map(([lim, r], i, a) => `${lim == null ? `${v3Num((a[i - 1]?.[0] || 0) / 1e8)}억 초과` : `${v3Num(lim / 1e8)}억 이하`} ${v3Pct(r, 0)}`).join(', ');
  const w = sw('weights'), ws = w ? V3_SCEN.map((s) => `${s} ${v3Pct(w[s], 1)}`).join(', ') : null;
  const set = c ? [['항목', '지금 값'],
    ['평가 기준일', t.val_date], ['재무상태표 기준일', t.bs_date], ['직전 결산일', t.fy0_end],
    ['과거 연도', tl.hist?.length ? `${tl.hist[0]}～${tl.hist[tl.hist.length - 1]}년` : null],
    ['명시 기간', sw('fc_years') != null ? `${sw('fc_years')}년` : null], ['전환 기간', sw('fade_years') != null ? `${sw('fade_years')}년` : null],
    ['매출 줄', rb.lines?.length ? `${rb.lines.length}개` : null], ['첫해 추정', nm('fy1_mode')],
    ['매출원가 방식', nm('cogs_mode')], ['인건비 방식', nm('labor_mode')], ['유형자산 방식', nm('ppe_mode')], ['운전자본 기준', nm('nwc_avg')], ['차입 계획', nm('debt_plan')],
    ['법인세 방식', nm('tax_mode')], ['FCFF 세율', nm('fcff_tax')], ['종료연도 세율', nm('ty_tax')],
    ['베타 방식', nm('beta_mode')], ['베타 하한', sw('beta_floor') != null ? v3Num(sw('beta_floor'), 2) : '없음'], ['무위험이자율', nm('rf')], ['주식위험프리미엄', nm('erp')], ['타인자본비용', nm('kd')],
    ['영구성장률 기준', nm('g')], ['종료가치 방식', nm('tv')], ['할인 시점', nm('discount')], ['주식 수 기준', nm('share_basis')],
    ['시나리오 가중치', ws], ['DCF 결합 비중', pct(sw('blend_w'), 0)], ['주당 가치 반올림', sw('round') != null ? `${v3Num(sw('round'))}원 단위` : null],
  ].filter((r) => r[1] != null && r[1] !== '').map((r) => r.map(String)) : null;
  const srcs = (c?.notes?.sources || []).map((s) => (typeof s === 'string' ? s : [s.title || s.name || s.id, s.date, s.url].filter(Boolean).join(', '))).filter(Boolean);
  const asof = mk.as_of || {};
  const src = [
    ...srcs,
    '재무제표와 분기 누적 실적: DART 연결 재무제표. 주석 표(판관비 계정, 유무형자산, 차입금, 주식)는 사업보고서 원문',
    `무위험이자율: 한국은행 ECOS 국고채 10년${mk.rf ? `. 기준일 값 ${pct(mk.rf.spot)}, 3개월 평균 ${pct(mk.rf.avg_3m)}, 1년 평균 ${pct(mk.rf.avg_1y)}${asof.rf ? `, ${asof.rf} 기준` : ''}` : ''}`,
    `주식위험프리미엄: Damodaran 국가별 위험프리미엄${mk.erp ? `. 성숙 시장 ${pct(mk.erp.mature)} + 한국 국가위험 ${pct(mk.erp.crp)} = ${pct(mk.erp.total)}${asof.erp ? `, ${asof.erp}` : ''}` : ''}`,
    `거시 지표: 한국은행 ECOS와 KOSIS${mk.cpi10 != null ? `. 소비자물가 10년 평균 ${pct(mk.cpi10)}, 5년 평균 ${pct(mk.cpi5)}, 명목 GDP 성장률 10년 평균 ${pct(mk.gdp10)}, 임금상승률 5년 평균 ${pct(mk.wage5)}` : ''}`,
    `법인세율: 법인세법 55조${br ? `. ${br}` : ''}${mk.tax?.local != null ? `, 지방소득세 ${v3Pct(mk.tax.local, 0)}` : ''}`,
    '합성 등급 스프레드: Damodaran 교재의 이자보상배율 경계와 Valley AI 화면의 스프레드. 국내 등급별 스프레드는 금융투자협회 채권정보센터',
    '주가와 지수: FinanceDataReader 일별 주가. 컨센서스: 와이즈리포트. 증권사 목표가: 네이버 리포트',
    '매출 줄과 드라이버, 비용 가정의 근거: 사례 폴더의 리서치 파일. 입력 단계의 근거 칸에 그대로 표시',
    '화면 흐름: Valley AI 「DCF 실전형」. 시트 구조: The Modellers 201, 301 모델. 계산 원본과 설계서: 05. 딜소싱 > _자동화 > 가치평가 > v3, MODEL_SPEC.md',
  ];
  const rows = [
    ['이 화면', '매출을 사업부와 지역 줄마다 따로 추정하고, 비용과 재투자, 차입과 세금을 스케줄로 이어 손익계산서, 재무상태표, 현금흐름표를 함께 만든 뒤 FCFF를 WACC로 할인해 주당 내재 가치를 구합니다. Valley AI 「DCF 실전형」의 단계별 입력 흐름에 The Modellers 엑셀 모델의 시트 구조를 얹었습니다. 파이썬 엔진, 엑셀 수식, 이 화면이 같은 식으로 계산하며, 처음 값은 화면이 다시 계산한 결과를 파이썬 결과와 칸마다 대조합니다.'],
    ['화면 구성', { table: [['영역', '내용'],
      ['머리', '목표주가, DCF 가중평균, 상대가치, 현재가. 명시 기간, 전환 기간, 시나리오 단추와 처음 값으로 단추'],
      ['가치 산정 흐름', '연도별 FCFF와 현재가치, 종료가치, 할인율, 영업가치에서 주당 내재 가치까지. 카드를 누르면 그 값을 정하는 입력 단계로 이동'],
      ['입력', 'DCF 맵 15단계. 단계마다 가정 입력 칸, 근거, 참고 차트'],
      ['연도별 상세', '과거와 추정 연도를 한 표로. 매출, 비용, 3대 재무제표, 스케줄, FCFF, 할인을 묶음별로 접고 폄'],
      ['보고서', '요약, 상세, 민감도, 시나리오, 리버스, 풋볼필드, 몬테카를로 7화면'],
      ['점검', '점검 결과, 파이썬 대조, 바꾼 입력, 보정과 일회성 항목, 더 필요한 리서치']] }],
    ['입력 15단계', { table: [['묶음', '단계', '정하는 것'],
      ['내러티브', '1 매출액', '사업부와 지역 줄별 드라이버, 시나리오별 성장률이나 금액, 근거'],
      ['', '2 매출원가', '원가 방식과 원가율'],
      ['', '3 판관비', '묶음별 드라이버와 비율, 인건비 방식'],
      ['', '4 법인세', '유효세율 평균에 넣을 해, 세액공제와 감면, 결손금'],
      ['', '5 재투자', 'CAPEX, 감가상각, 무형자산과 R&D, 운전자본 회전일수'],
      ['', '6 재무 구조', '차입 계획, 이자율, 최소 현금, 리볼버, 배당성향, 자사주'],
      ['할인율', '7 자기자본비용', '무위험이자율, 베타, 주식위험프리미엄, 추가 프리미엄'],
      ['', '8 타인자본비용', '합성 등급, 실제 등급, 직접 입력'],
      ['', '9 할인율 확정', '자본구조, 명시 기간과 안정기 WACC'],
      ['종료가치', '10 성장 단계와 종료가치', '전환 기간 방식, 영구성장률, 안정기 ROC, 종료가치 방식'],
      ['내재 가치', '11 비영업자산', '현금성자산과 비영업자산 항목'],
      ['', '12 비주주청구권', '이자부부채, 비지배지분, 우선주, 퇴직급여, 기타 청구권'],
      ['', '13 주식 수', '발행주식, 자기주식, 희석'],
      ['마무리', '14 시나리오 근거', '시나리오별 근거와 가중치'],
      ['', '15 상대가치 결합', '상대가치 결과와 결합 비중']] }],
    ['바꿔 볼 수 있는 것', [
      '명시 기간 3, 5, 7, 10년과 전환 기간 0, 5, 10년. 연도별로 준 가정은 모자라는 해를 마지막 값으로 채움',
      '시나리오 Bull, Base, Bear. 입력 칸은 고른 시나리오의 값을 고침',
      '입력 탭과 연도별 상세의 연한 파란 칸. 바꾼 칸은 진한 파란 바탕이 되고, 칸을 비우면 처음 값으로 돌아감',
      '「처음 값으로」 단추는 바꾼 입력을 모두 되돌림. 점검 탭의 바꾼 입력 목록에서는 한 줄씩 되돌림',
      '입력하는 동안 화면이 바로 다시 계산함. 몬테카를로, 다른 가정 표, 유형별 조정은 파이썬에서만 계산해 처음 값 그대로',
      '「입력 내려받기」는 바꾼 입력을 case_v3_override.json 파일로 저장함. 05. 딜소싱 > _자동화 > 가치평가 폴더에서 python -m v3.run run <사례> --override case_v3_override.json 을 돌리면 엑셀까지 다시 만듦',
      '「엑셀 받기」는 파이썬이 만든 모델 엑셀. 화면에서 바꾼 값은 들어 있지 않음']],
    ...(set ? [['이 사례의 설정', { table: set }]] : []),
    ['매출 추정', [
      '매출 합계 = 줄별 매출의 합. 줄을 어떻게 나누고 어떤 드라이버를 쓸지는 회사마다 리서치가 정함',
      '드라이버 종류: 성장률(전년 × (1 + 성장률)), 수량 × 단가, 시장 규모 × 점유율, 단위 수 × 단위당 매출, 생산능력 × 가동률 × 단가, 수주잔고 인식, 다른 줄 대비 비율, 고정, 직접 입력',
      '성장률과 비율 가정은 시작값과 끝값(사이는 직선) 또는 연도별 값으로 줌',
      '첫해가 진행 중이면 누적 실적 + 남은 분기 추정. 남은 분기는 드라이버로 구한 연간 값 × 남은 분기 비중(직전 3년 같은 분기 비중 평균)이고, 리서치가 준 분기 값이 있으면 그 값을 씀',
      '과거 줄 합과 공시 매출의 차이는 「체계 차이 조정」 줄 하나로만 흡수함',
      '컨센서스 매출은 참고 줄. 합계가 컨센서스와 10% 넘게 다르면 점검에 주의로 표시']],
    ['비용', [
      '매출원가 방식: 전사 원가율, 사업부 원가율, 단위원가, 매출총이익률 단계, 성격별 구성 가운데 하나',
      '판관비는 주석의 계정을 묶음(인건비, 주식보상비용, 감가상각비, 연구개발비, 광고판촉, 지급수수료, 운반비, 대손상각비, 기타관리비)으로 모으고 묶음마다 드라이버를 정함',
      '묶음 드라이버: 매출 비례, 물가 연동, 스케줄 연결, 특정 매출 줄 비례, 직접 입력',
      '감가상각비 묶음 = 감가상각 합계 × 판관비 몫, 연구개발비 묶음 = R&D 가운데 비용 처리분. 둘 다 유무형자산 스케줄에서 넘어옴',
      '기타관리비는 물가상승률만큼 늘어나는 고정비',
      '인건비 방식: 매출 비례 또는 인원 × 인당 인건비. 직원 수와 인건비의 범위(연결, 별도)가 다르면 인원 방식을 쓰지 않음',
      '영업이익 = 매출총이익 − 판관비. EBITDA = 영업이익 + 감가상각비 + 무형자산상각비']],
    ['재투자', [
      '유형자산 방식: 변동표, 약식(CAPEX = 매출 × 비율, 감가상각 = 기초 × 상각률), 유지 CAPEX + 확장 CAPEX',
      '사용권자산 신규는 현금이 나가지 않는 취득이며 리스부채와 함께 늘어남',
      '무형자산: 기타 무형 취득 = 매출 × 비율, R&D 자산화분 = 총 연구개발비 × 자산화 비중, 계약관계 같은 일회성 취득은 따로 입력. 상각 = 기초 × 상각률, 계약관계는 정한 연수로 정액',
      '운전자본: 매출채권 = 매출 × 회전일수 ÷ 365, 재고자산과 매입채무 = 매출원가 × 회전일수 ÷ 365, 기타 영업 유동자산과 부채 = 매출 × 비율',
      '현금, 단기금융자산, 차입금, 리스부채는 운전자본에 넣지 않음',
      '재투자 = CAPEX − 감가상각비 + 순운전자본 증가. ROIC = 세후영업이익 ÷ 기초 투하자본']],
    ['3대 재무제표와 순환 계산', [
      '손익계산서, 재무상태표, 현금흐름표를 스케줄(운전자본, 유무형자산, 차입과 이자, 법인세, 자본)과 이어 함께 추정함',
      '재무상태표 현금 = 전년 현금 + 현금흐름표의 현금 순증감. 대차 검증(자산 − 부채 − 자본)과 현금 검증이 모든 추정 연도에서 0이어야 함',
      '이자수익과 리볼버 이자는 평균 잔액으로 계산해 이자, 순이익, 현금이 서로 물림. 변화가 없어질 때까지 반복 계산하며, 순환 스위치를 끄면 기초 잔액 기준으로 바뀜',
      '현금이 최소 현금보다 모자라면 리볼버에서 인출하고, 남으면 리볼버 잔액을 상환함',
      '차입은 기말 잔액 유지가 기본. 이자비용 = 평균 잔액 × 직전 결산 실효이자율',
      '기타수익과 비용, 지분법손익, 중단영업손익은 추정 연도에 0이 기본',
      '배당 = 지배주주 순이익 × 배당성향. 이익잉여금 = 기초 + 지배주주 순이익 − 배당']],
    ['법인세', [
      '손익계산서 법인세 = 세전이익 × 유효세율. 유효세율은 최근 3년 평균이며 법정 세율의 0.5배 미만이거나 1.5배가 넘는 해는 평균에서 뺌',
      `법정 세액 = 과세표준에 구간별 세율${br ? `(${br})` : ''}을 적용한 법인세 + 지방소득세 − 세액공제와 감면`,
      '이월결손금은 과세표준의 80%(중소기업 100%)까지 공제함',
      '한계세율 = 과세표준이 속한 구간 세율 × 1.1. 세후 타인자본비용과 베타의 무차입, 재차입 계산에 씀',
      'FCFF 세율은 그해 손익 유효세율, 종료연도 세율은 EBIT 기준 법정 유효세율이 기본. 전환 기간은 둘 사이를 직선으로 이음']],
    ['WACC와 베타', [
      'WACC = 자기자본 비중 × 자기자본비용 + 부채 비중 × 세전 타인자본비용 × (1 − 한계세율)',
      '자기자본비용 = 무위험이자율 + 베타 × 주식위험프리미엄 + 추가 프리미엄',
      '무위험이자율은 국고채 10년 최근 3개월 평균, 주식위험프리미엄은 Damodaran 성숙 시장 프리미엄 + 한국 국가위험이 기본',
      '베타 자동 선택: 상장 2년 이상이고 자본구조가 크게 바뀌지 않았으면 회귀 베타, 아니면 비교기업 바텀업 베타',
      '회귀 베타: 2년 주간 수익률을 상장 시장 지수에 회귀한 값. 조정 베타 = 원 베타 × 2/3 + 1 × 1/3. 표준오차, R², 관측수를 점검에 함께 표시',
      '바텀업 베타: 비교기업 조정 베타를 회사마다 무차입화한 값의 중앙값을 목표 D/E로 재차입. 무차입 베타 = 조정 베타 ÷ (1 + (1 − 세율) × D/E)',
      `베타 하한${sw('beta_floor') != null ? ` ${v3Num(sw('beta_floor'), 2)}` : ' 0.8'}: 계산한 베타가 이보다 낮으면 하한을 쓰고 점검에 참고로 남김`,
      '세전 타인자본비용 자동 순서: 회사채 시장 수익률, 실제 신용등급 스프레드, 실효이자율(리스를 뺀 차입금이 시가총액의 5% 이상일 때), 이자보상배율로 정한 합성 등급 스프레드',
      '자본 비중은 시가총액과 이자부부채(리스 포함)의 지금 비율',
      '안정기 WACC: 안정기 베타를 0.8에서 1.2 사이로 잘라 다시 계산함. 전환 기간 할인율은 명시 기간 WACC에서 안정기 WACC까지 직선',
      'WACC를 직접 입력하면 계산값 대신 그 값을 쓰고 점검에 주의로 표시']],
    ['FCFF와 전환 기간', [
      'FCFF = 세후영업이익 − 재투자 + 기타 비현금 비용. 세후영업이익 = 영업이익 × (1 − FCFF 세율)',
      '주식보상비용은 실제 비용으로 보아 더하지 않음. 희석은 주식 수에서 반영',
      '전환 기간 성장률은 명시 마지막 해 값에서 영구성장률까지 직선, 영업이익률은 마지막 해 값 유지',
      '전환 기간 재투자 = 세후영업이익 × 성장률 ÷ ROIC. ROIC는 명시 마지막 해 값에서 안정기 ROC까지 직선',
      '할인 시점 = 연차 − 직전 결산 뒤 지난 기간(기말 할인). 할인계수는 해마다 그해 할인율로 누적해 곱함',
      '첫해 FCFF는 재무상태표 기준일 뒤 남은 기간만큼만 반영함. 현금과 부채가 기준일 잔액이라 그 전 현금흐름은 이미 들어 있음']],
    ['종료가치', [
      '종료연도 매출 = 전환 마지막 해 매출 × (1 + 영구성장률). 영업이익률은 전환 마지막 해 값',
      '종료연도 재투자 = 세후영업이익 × 영구성장률 ÷ 안정기 ROC. 안정기 ROC 기본은 안정기 WACC(초과수익 없음)',
      '종료가치 = 종료연도 FCFF ÷ (안정기 WACC − 영구성장률). 마지막 해 기말 할인계수로 할인',
      '영구성장률은 소비자물가 10년 평균이 기본이며 무위험이자율보다 높으면 무위험이자율로 낮춤',
      '영구성장률이 안정기 WACC 이상이면 계산하지 않고 오류로 표시',
      '종료가치 비중 = 종료가치 현재가치 ÷ 영업가치. 85%가 넘으면 점검에 참고로 표시',
      '배수 방식: 종료연도 직전 EBITDA × 배수']],
    ['주주가치 다리와 주식 수', [
      '영업가치 = 명시와 전환 기간 FCFF 현재가치 합 + 종료가치 현재가치',
      '주주가치 = 영업가치 + 현금성자산 + 비영업자산 − 이자부부채 − 비지배지분 − 우선주 − 퇴직급여 과소적립 − 기타 청구권',
      '현금성자산 = 현금 + 단기금융상품 + 유동 금융자산. 비영업자산 = 관계기업투자, 장기금융자산, 투자부동산과 사례에서 정한 항목',
      '다리의 잔액은 재무상태표 기준일 값',
      '유통주식수 = 발행주식 − 자기주식. 희석 주식수 = 유통주식수 + 우선주 + 스톡옵션 순증(자기주식법) + 미가득 RSU + 전환 가산 주식',
      '전환사채를 주식으로 본 경우 이자부부채에서 그 잔액을 뺌',
      '주당 가치 = 주주가치 ÷ 주식 수, 100원 단위 반올림. 상승여력 = 내재 가치 ÷ 현재가 − 1']],
    ['시나리오와 가중평균', [
      '세 시나리오를 늘 함께 계산함. Bull과 Bear 가정은 리서치가 근거와 함께 준 값이고, 리서치 값이 없는 가정은 규칙으로 채움(매출 성장률 ±5%p, 비용률은 최근 3년 최저와 최고)',
      '할인율과 종료가치 가정은 시나리오와 무관하며 민감도에서 봄',
      '가중평균 = 시나리오별 주당 가치 × 가중치의 합. 가중치 합이 100%가 아니면 계산하지 않고 오류로 표시']],
    ['민감도', [
      '이중 변수 표: WACC × 영구성장률, WACC × 종료연도 영업이익률, WACC × 전환 기간 시작 성장률 가산. 5 × 5이며 가운데 칸이 지금 값',
      'WACC를 움직이면 명시 기간과 안정기 WACC가 같은 폭으로 움직임',
      '토네이도: 변수 하나만 정한 폭으로 올리고 내렸을 때의 주당 가치',
      '현재가보다 높으면 빨강, 낮으면 파랑. Base 기준이며 그 밖의 입력은 지금 값']],
    ['리버스', [
      'P/FCF 방식: 지금 주가를 맞추는 주당 FCF 성장률을 거꾸로 풂. 주가 = Σ 주당 FCF ÷ (1 + 할인율)^t + n년 뒤 주당 FCF × 최종 P/FCF ÷ (1 + 할인율)^n',
      'P/E 방식: 주당 FCF 대신 EPS와 최종 P/E',
      '내재 매출 성장률 = (n년 뒤 주당 FCF ÷ (순이익률 × FCF 전환 비율) ÷ 지금 주당 매출)^(1/n) − 1',
      '모델 리버스: 모든 매출 줄 성장률에 같은 값을 더해 Base 주당 가치가 현재가와 같아지는 값을 찾음. 결과는 주가가 담은 매출 연평균 성장률과 컨센서스 대비 차이',
      '할인율 기본은 자기자본비용']],
    ['상대가치 결합', [
      '목표주가 = DCF 가중평균 × DCF 비중 + 상대가치 주당 가치 × (1 − DCF 비중). DCF 비중 기본 50%',
      '상대가치는 가치평가 > 상대가치 화면의 평가 배수 중앙값으로 구한 주당 가치',
      '점검에 오류가 있으면 목표주가 옆에 「점검 오류」가 붙음']],
    ['몬테카를로', [
      '매출 줄별 시작 성장률과 종료연도 이익률은 Bear, Base, Bull을 꼭짓점으로 한 삼각분포, WACC와 영구성장률은 정규분포에서 뽑아 주당 가치를 반복 계산함',
      `시행 ${v3Ok(sw('mc_n')) ? v3Num(sw('mc_n')) : '10,000'}회, WACC 표준편차 ${pct(sw('mc_wacc_sd'), 1) || '1.0%'}p, 영구성장률 표준편차 ${pct(sw('mc_g_sd'), 1) || '0.5%'}p. WACC와 영구성장률 차이가 1%p 미만인 표본은 다시 뽑음`,
      '결과: 평균, 중앙값, 25%에서 75% 구간, 5%에서 95% 구간, 현재가보다 15% 넘게 오를 확률',
      '파이썬에서만 계산함. 화면에서 가정을 바꿔도 분포는 처음 값 그대로이며, 입력 내려받기 파일로 파이썬을 다시 돌려야 바뀜']],
    ['연도별 상세 읽는 법', [
      '열은 과거 연도, 명시 기간, 전환 기간, 종료연도, CAGR 순서. CAGR은 직전 실적 연도에서 명시 마지막 해까지이며 금액 줄만 계산',
      '재무제표와 스케줄 줄은 명시 기간까지, FCFF와 할인 줄은 종료연도까지 값이 있음',
      '묶음 이름을 누르면 펴고 접음. 접힌 묶음은 합계 줄만 보임',
      '연한 파란 칸은 가정. 값을 바꾸면 고른 시나리오의 그 해 가정이 바뀜. 금액 줄은 대부분 계산값이라 고칠 수 없음',
      '결과 줄과 짝이 없는 가정(감가상각률, 물가상승률 등)은 「그 밖의 가정」 묶음에 있음',
      '검증 줄은 차이가 0이면 「일치」, 어긋나면 빨간 숫자',
      '값이 하나인 항목(WACC, 주주가치 다리, 주식 수)은 표 아래 계산표에 있음']],
    ['점검 읽는 법', [
      '오류: 계산을 믿을 수 없는 상태. 대차 불일치, 영구성장률이 할인율 이상, 가중치 합이 100%가 아님 등',
      '주의: 계산은 되지만 가정을 다시 볼 것. 컨센서스와 10% 넘는 차이, 과거 범위를 벗어난 이익률, 직접 입력한 WACC 등',
      '참고: 적용된 규칙과 자료의 한계. 베타 하한 적용, 회귀 베타 통계, 희석 반영 내역 등',
      '파이썬 대조: 처음 값으로 화면이 다시 계산한 모든 칸을 파이썬 결과와 견줌. 다른 칸이 있으면 탭 이름에 오류로 세고 목록을 보여 줌',
      '바꾼 입력: 처음 값과 바꾼 값. 줄마다 되돌릴 수 있음',
      'DCF 맵의 주황 표시는 그 단계에 확인할 점검이 있다는 뜻']],
    ['용어', { table: [['용어', '뜻'],
      ['명시 기간', '재무제표를 줄마다 추정하는 기간. 3, 5, 7, 10년'],
      ['전환 기간', '명시 기간 뒤 성장률과 수익성이 안정기 수준으로 내려가는 기간. 0, 5, 10년'],
      ['종료연도', '전환 기간 다음 해. 이 해의 FCFF로 종료가치를 계산'],
      ['종료가치', '종료연도부터 그 뒤 현금흐름 전체의 가치'],
      ['영업가치', '영업 현금흐름의 현재가치 합. 현금과 차입금을 반영하기 전 가치'],
      ['비영업자산', '영업에 쓰지 않는 현금성자산, 투자자산, 투자부동산'],
      ['비주주청구권', '주주보다 먼저 가져가는 몫. 이자부부채, 비지배지분, 우선주 등'],
      ['내재 가치', '모델이 계산한 주당 가치'],
      ['상승여력', '내재 가치 ÷ 현재가 − 1'],
      ['FY1, FY2', '첫 추정 연도와 그다음 해. FY1은 진행 중인 회계연도'],
      ['연도 뒤 E', '추정 연도']] }],
    ['출처', src],
  ];
  return { title: 'DCF 모델', asof: c ? `${t.name || ''} 기준일 ${t.val_date || ''}${t.bs_date ? `, 재무상태표 ${t.bs_date}` : ''}` : '', rows };
}
