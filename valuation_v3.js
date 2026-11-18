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
const V3_REP_ORD = ['sum', 'typ', 'det', 'sens', 'scen', 'rev', 'ff', 'mc', 'lbo']; // 보고서 안 화면 순서(조각이 어떤 순서로 등록하든)
/* show(x)를 주면 참일 때만 단추가 보임(유형별은 일반 기업이 아닐 때, LBO는 켜졌을 때) */
function v3Rep(k, label, fn, show) {
  const i = V3_REP.findIndex((r) => r.k === k); if (i >= 0) V3_REP[i] = { k, label, fn, show }; else V3_REP.push({ k, label, fn, show });
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
const v3Up = (u, d = 1) => { if (!v3Ok(u)) return ''; const r = +(u * 100).toFixed(d), s = r > 0 ? 1 : r < 0 ? -1 : 0; return `<span class="${s > 0 ? 'up' : s < 0 ? 'dn' : ''}">${s > 0 ? '+' : ''}${v3Num(u * 100, d)}%</span>`; }; // 반올림해 0이면 부호와 색 없이
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
  const all = { ...plain }, aK = {}; // 가정 키 → {시나리오 또는 *: 칸}
  for (const [b, subs] of Object.entries(cells)) {
    if (b.startsWith('a.')) {
      const j = b.lastIndexOf('.'); (aK[b.slice(2, j)] ||= {})[b.slice(j + 1)] = subs;
    } else {
      const cur = b.startsWith('sw.') ? c.switches[b.slice(3)] : v3Path(c.input, b.slice(2));
      const o = Array.isArray(cur) ? [...cur] : { ...(cur || {}) };
      for (const [s, v] of Object.entries(subs)) o[s] = v;
      all[b] = o;
    }
  }
  /* 「세 시나리오」로 고친 칸(*)은 시나리오마다 그 해 값만 같게 하고 나머지 해는 그 시나리오 값 그대로. 시나리오 하나로 고친 칸이 그 위에 덮임 */
  for (const [K, bySc] of Object.entries(aK)) {
    for (const S of V3_SCEN) {
      if (!bySc['*'] && !bySc[S]) continue;
      const base = rows0?.[S]?.[`CTL.a.${K}`]; if (!base) continue;
      const arr = [...base];
      for (const subs of [bySc['*'], bySc[S]]) for (const [i, v] of Object.entries(subs || {})) if (+i < arr.length) arr[+i] = v;
      all[`a.${K}.${S}`] = { by_year: arr };
    }
  }
  const ord =(k) => ['sw.', 'i.', 'm.', 'a.', 'o.'].findIndex((p) => k.startsWith(p)), ov = {};
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
function v3In(x, key, base, { fmt = 'num', d, lab = '', ph = '', cell = false, dis = false, u, cur } = {}) {
  const e = cur !== undefined ? cur : x.st.ov[key], b = v3Fi(base, fmt, d), unit = u ?? V3_UNIT[fmt] ?? '';
  const inp = `<input type="text" inputmode="decimal" autocomplete="off" data-k="${esc(key)}" data-b="${esc(b)}" data-sc="${fmt === 'pct' ? 100 : 1}" value="${esc(e ? e.t : b)}"${ph ? ` placeholder="${esc(ph)}"` : ''}${dis ? ' disabled' : ''} class="${e ? 'chg' : ''}" aria-label="${esc(lab)}">`;
  return cell ? `<span class="v3-ci">${inp}</span>` : `<span class="v3-iw ${unit ? '' : 'nu'}">${inp}${unit ? `<em>${unit}</em>` : ''}</span>`;
}
const v3F = (lab, html, cls = '') => `<label class="v3-f ${cls}"><span>${lab}</span>${html}</label>`;
/* 가정 한 칸: 가정 키 K의 i번째 추정 연도. 처음 값은 연도별 칸 덮기 전 계산값.
   머리의 「입력 적용」이 세 시나리오(x.st.scope = 'all')면 칸 키가 a.K.*#i(세 시나리오의 그 해 값을 같게). 보이는 값은 고른 시나리오 기준 */
const v3All = (x) => x.st.scope === 'all';
const v3AKey = (x, K, i, S) => `a.${K}.${(!S || S === x.sc) && v3All(x) ? '*' : S || x.sc}#${i}`; // S가 고른 시나리오면 기본 칸으로 봄
const v3AHas = (x, K, i) => !!(x.st.ov[`a.${K}.*#${i}`] || x.st.ov[`a.${K}.${x.sc}#${i}`]);
function v3ACell(x, K, i, fmt, S, lab = '') {
  const s = S || x.sc, base = x.rows0?.[s]?.[`CTL.a.${K}`]?.[i], key = v3AKey(x, K, i, S);
  const cur = s === x.sc && v3All(x) ? x.st.ov[`a.${K}.${s}#${i}`] || x.st.ov[key] : undefined; // 시나리오 하나로 고친 칸이 덮고 있으면 그 값을 보여 줌
  return v3In(x, key, base, { fmt, cell: true, lab: `${lab} ${x.tl.fc[i]}년`, d: fmt === 'pct' ? 2 : fmt === 'days' ? 1 : fmt === 'amt' ? 1 : undefined, cur });
}
/* 가정 표: 줄마다 가정 키 하나, 열은 추정 연도(입력 칸). items [{key, name, fmt, hist: 과거 값을 보여 줄 행 ID, why: 근거, sub: 이름 아래 작은 글}]
   opt {S, hist: true면 과거 열을 보여 줌, why: false면 근거 열 숨김, first: 첫 열 머리글} */
function v3ATable(x, items, { S, hist = true, why = true, first = '항목' } = {}) {
  const s = S || x.sc, its = items.filter((it) => x.R[`CTL.a.${it.key}`]);
  if (!its.length) return '<div class="empty">이 사례에는 해당 가정이 없습니다.</div>';
  const anyH = hist && its.some((it) => it.hist && x.R[it.hist]), hs = anyH ? x.tl.hist : [];
  /* 근거는 오른쪽 열이 아니라 그 줄 바로 아래 한 줄(표가 옆으로 밀려도 보이는 폭에 머묾). 열로 두면 좁은 본문에서 근거 열이 잘려 보였음(11-17) */
  const head = `<tr><th class="st">${first}</th>${hs.map((y) => `<th>${y}</th>`).join('')}${x.tl.fc.map((y, i) => `<th class="${i === 0 && anyH ? 'bl' : ''}">${y}E</th>`).join('')}</tr>`, n = 1 + hs.length + x.tl.fc.length;
  const rows = its.map((it) => {
    const L = v3Lab(x, `CTL.a.${it.key}`), fmt = it.fmt || L.fmt, nm = it.name || L.name, hr = it.hist ? x.R[it.hist] : null, unit = V3_UNIT[fmt];
    const w = why ? it.why ?? v3Note(x, it.key) : '';
    return `<tr class="${w ? 'v3-atr' : ''}"><td class="st"><b>${esc(nm)}</b>${unit ? `<small>${fmt === 'pct' ? '%' : unit}</small>` : ''}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</td>${hs.map((_, i) => `<td class="h">${hr ? v3Fmt(hr[i], fmt, fmt === 'pct' ? 1 : undefined) : ''}</td>`).join('')}${x.tl.fc.map((_, i) => `<td class="in ${i === 0 && anyH ? 'bl' : ''}">${v3ACell(x, it.key, i, fmt, s, nm)}</td>`).join('')}</tr>${w ? `<tr class="v3-atn"><td colspan="${n}"><div>${v3Why(w)}</div></td></tr>` : ''}`;
  }).join('');
  return `<div class="mk-scroll v3-atsc"><table class="mk-tbl v3-t v3-at"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
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

// ---------- 프리셋 ----------
/* c.presets = {이름: {name, about, changes, switches}}(v3\presets.py web_presets). switches는 어느 프리셋에서든 바뀌는 키 전부라
   고르면 그 키를 모두 sw.<키> 덮기로 넣고, 사례의 프리셋(c.preset)을 고르면 그 키의 덮기를 지움 */
const v3Presets = (c) => (c.presets && typeof c.presets === 'object' && Object.keys(c.presets).length ? c.presets : null);
const v3PresetKeys = (P) => [...new Set(Object.values(P).flatMap((p) => Object.keys(p?.switches || {})))];
function v3PresetCur(c, x) {
  const P = v3Presets(c); if (!P) return '';
  const keys = v3PresetKeys(P), J = (v) => JSON.stringify(v ?? null);
  if (!keys.some((k) => Object.keys(x.st.ov).some((o) => o === `sw.${k}` || o.startsWith(`sw.${k}#`)))) return P[c.preset] ? c.preset : '';
  return Object.keys(P).find((n) => n !== c.preset && keys.every((k) => J(x.sw[k]) === J(P[n].switches?.[k]))) || '';
}
function v3PresetSet(c, name) {
  const P = v3Presets(c); if (!P || !P[name]) return;
  const st = v3St(c), keys = v3PresetKeys(P);
  for (const o of Object.keys(st.ov)) if (keys.some((k) => o === `sw.${k}` || o.startsWith(`sw.${k}#`))) delete st.ov[o];
  if (name !== c.preset) for (const k of keys) v3SetOv(c, `sw.${k}`, P[name].switches?.[k] ?? null);
}
function v3PresetPick(c, x) {
  const P = v3Presets(c); if (!P) return '';
  const cur = v3PresetCur(c, x);
  return `<div><span>프리셋</span><select class="va-case v3-pre" data-v3-preset aria-label="프리셋">${cur ? '' : '<option value="" selected>직접 바꿈</option>'}${Object.entries(P).map(([n, p]) => `<option value="${esc(n)}"${n === cur ? ' selected' : ''} title="${esc(p.about || '')}">${esc(p.name || n)}</option>`).join('')}</select></div>`;
}

/* 결합 목표주가의 DCF 자리 이름. 회사 유형이 일반이 아니면 유형별 주당 가치(blend.dcf_src = 방법)가 그 자리에 들어감 */
const V3_DSRC = { rim: 'RIM', ddm: 'DDM', dcf_p: '부도 가중 DCF', dcf: 'DCF', nav: 'NAV' };
const v3DcfTyp = (x) => { const s = x.res.blend?.dcf_src; return !!s && s !== 'dcf'; };
/* 사업부별 합산을 목표주가에 쓰는 상태(sw.sotp = target이고 합산 결과가 있음). 이때 주당 가치와 가중평균이 합산 값 */
const v3Sotp = (x) => x.res.sotp?.mode === 'target';
const v3DcfName = (x) => { const s = x.res.blend?.dcf_src; return v3Sotp(x) && !v3DcfTyp(x) ? '사업부별 합산 가중평균' : !v3DcfTyp(x) ? 'DCF 가중평균' : s === 'blocked' ? '유형별 가치' : `유형별 가치(${V3_DSRC[s] || (x.res.typ?.type === 'private' ? '비상장 DCF' : s)})`; };

// ---------- 머리 ----------
/* 기본 정보 한 줄(target.founded 등). 수집한 문서(target.info_src가 있음)에서만 보이고, 수집했는데 못 찾은 값은 「확인 불가」. 출처는 툴팁 */
function v3Binfo(t) {
  const src = t.info_src; if (!src || typeof src !== 'object') return '';
  const keys = [['founded', '설립'], ['listed', '상장'], ['employees', '임직원'], ['ceo', '대표이사'], ['hq', '본사']].filter(([k]) => k in t);
  if (!keys.some(([k]) => t[k] != null && t[k] !== '')) return '';
  const val = (k) => (t[k] == null || t[k] === '' ? '확인 불가' : k === 'employees' ? `${v3Num(t[k])}명${t.employees_date ? `(${esc(t.employees_date)})` : ''}` : esc(t[k]));
  return `<p class="v3-binfo">${keys.map(([k, nm]) => `<span${k === 'hq' || k === 'ceo' ? ' class="w"' : ''}${src[k] ? ` title="${esc(src[k])}"` : ''}>${nm} ${val(k)}</span>`).join(', ')}</p>`;
}
function v3Head(c, x) {
  const t = x.t, cs = v3Cases().filter((y) => y.target.code === t.code), r = x.res, bl = r.blend || {}, wv = r.wavg || {}, errs = (r.checks || []).filter((k) => k.level === 'err').length, n = v3Chg(x);
  const typ = v3DcfTyp(x), dv = typ ? bl.dcf : wv.ok === false ? null : wv.ps;
  const pick = cs.length > 1 ? `<select class="va-case" data-v3-case aria-label="평가 사례">${cs.map((y) => `<option value="${esc(y.id)}" ${y.id === c.id ? 'selected' : ''}>${esc(y.target.name)} ${esc(y.target.val_date || '')}</option>`).join('')}</select>` : '';
  const kpi = `<div class="v3-kpi" data-o="kpi"><div class="tp"><span>목표주가</span><b>${v3Won(bl.target)}</b><em>${v3Up(bl.up)}${errs ? '<i class="v3-bad">점검 오류</i>' : ''}</em></div>
      <div><span>${esc(v3DcfName(x))}</span><b>${v3Won(dv)}</b><em>${v3Up(typ ? (v3Ok(dv) && t.close ? dv / t.close - 1 : null) : wv.up)}</em></div>
      <div><span>상대가치</span><b>${v3Won(bl.rel)}</b><em>${bl.rel_blocked ? '유형에 맞지 않아 뺌' : v3Up(v3Ok(bl.rel) && t.close ? bl.rel / t.close - 1 : null)}</em></div>
      <div><span>현재가</span><b>${v3Won(t.close)}</b><em>${esc(t.val_date || '')}</em></div></div>`;
  return `<section class="card va-head v3-head"><div class="va-ttl"><div>${c.mock ? '<h2><span class="chip v3-mock" title="화면 확인용으로 만든 합성 입력입니다. 숫자를 평가로 읽지 않습니다.">시험용 합성 값</span></h2>' : ''}
      <p>기준일 ${esc(t.val_date || '')}${t.bs_date ? `, 재무상태표 ${esc(t.bs_date)}` : ''}${t.wics ? `, ${esc(t.wics)}` : ''}</p>${v3Binfo(t)}</div>
      <div class="va-tools">${pick}${infoBtn('valuation_v3')}<button class="btn ghost" type="button" id="v3-json">입력 내려받기</button><button class="btn ghost" type="button" id="v3-xlsx">엑셀 받기</button></div></div>
    ${kpi}
    <div class="va-ctrl">${v3PresetPick(c, x)}<div><span>명시 기간</span>${v3Sw(x, 'sw.fc_years', [3, 5, 7, 10].map((y) => [y, `${y}년`]), x.sw.fc_years)}</div>
      <div><span>전환 기간</span>${v3Sw(x, 'sw.fade_years', [0, 5, 10].map((y) => [y, `${y}년`]), x.sw.fade_years)}</div>
      <div><span>시나리오</span>${v3Seg('sc', V3_SCEN.map((s) => [s, s]), x.sc)}</div>
      <div><span>입력 적용</span>${v3Seg('scope', [['one', '고른 시나리오'], ['all', '세 시나리오']], v3All(x) ? 'all' : 'one')}</div>
      <button class="btn ghost sm" type="button" data-v3-reset${n ? '' : ' disabled'}>처음 값으로${n ? ` <b class="v3-n">${n}</b>` : ''}</button></div>
    ${x.err ? `<p class="v3-err">지금 입력으로는 계산하지 못해 처음 값을 보여 줍니다. ${esc(x.err)}</p>` : ''}</section>`;
}

// ---------- 단계 상태 ----------
/* 점검 id → 단계 번호. 엔진 맵(v3eMAP_CHECKS)이 단계 상태를 warn으로 주고, 화면은 이 표로 그 단계 머리에 주의와 오류 문장을 보여 줌(설계서 7-2).
   엔진 표에 없는 id도 주의나 오류면 그 단계를 「확인 필요」로 바꿈. 매출원가율이 튄 것은 cogs_jump(매출원가), 판관비 묶음이 튄 것은 ratio_jump(판관비) */
const V3_CHK_STEP = { cons_gap: 1, rseg_checks: 1, basis_mix: 1, hist_tie: 1, fy1_stale: 1, rev_check: 1, assump_range: 1, rev_sanity: 1, cons_n: 1, pv_hist: 1,
  gpm_range: 2, cogs_jump: 2, asp_vs_ucost: 2, seg_cost_hist: 2, resid_no_cost: 2, cost_key_name: 2, ratio_jump: 3, labor_scope: 3, labor_ratio: 3, sga_spike: 3, share_le_1: 3, sga_resid: 3, tax_outlier: 4,
  capex_da: 5, nwc_jump: 5, dep_rate_trend: 5, reinv_neg: 5, ppe_xfer_sum: 5, fcff_cross: 5, ppe_check: 5, ppe_roll_short: 5, capex_exp_unused: 5, nwc_avg_gap: 5, nwc_scope: 5, loan_dep: 5, rou_life: 5, capex_drv: 5,
  neg_cash: 6, bs_balance: 6, cash_roll: 6, re_roll: 6, rate_jump: 6, circ_converge: 6, cb_schedule: 6,
  premium_evidence: 7, erp_fallback: 7, stable_beta: 7, beta_index: 7, manual_missing: 7, ke_model: 7, beta_px_tie: 7, peer_self: 7, rf_fallback: 7, prem_overlap: 7, beta_px_basis: 7, kd_missing: 8, kd_consistency: 8,
  override: 9, model_rate_pair: 9, stable_vs_peer: 9, mcap_basis: 9, wacc_vs_broker: 9, g_vs_rate: 10, stable_rr: 10, tv_share: 10, dcf_fit: 10, g_fallback: 10, tv_avg: 10,
  nonop_loan_dup: 11, ev_def_align: 12, bridge_basis: 12, dilution: 13, dilution_src: 13, shares_align: 13, double_count: 13, weights: 14, upside_big: 14, type_block: 15, dcf_rel_gap: 15, rel_scen_src: 15,
  sotp_input: 15, sotp_why: 15, sotp_cover: 15, sotp_margin: 15, sotp_double: 15, sotp_gap: 15, fin_ddm_low: 15 };
/* 끝값 하나만 준 가정 점검(to_no_fy0, to_unused)은 가정 키마다 단계가 다름. 엔진이 k.value = [{key, step: 맵 단계 이름 또는 null}]로 줌(11-17 오후 판).
   옛 문서(k.value가 가정 키 글자 목록)는 접두어로 봄. step이 null이거나 어느 단계에도 안 맞는 키(물가상승률 등)는 점검 탭에만 나옴 */
const V3_KEY_STEP = [[/^rev\./, 1], [/^(cogs|ucost|gpm)/, 2], [/^(sga_|hc\.|wage_g|labor_|rev_per_hc|dep_sga_share|amort_sga_share)/, 3], [/^tax_/, 4],
  [/^(capex|dep_rate|rou_|int_|amort_rate|rnd_|dso$|dio$|dpo$|oca_pct|ocl_pct|cip_|ic_turnover|reinv|noncash)/, 5], [/^(debt_rate|cash_rate|payout|buyback|equity_iss|nci_share|lease_|cb_|st_fin_release)/, 6]];
function v3ChkSteps(x, k) {
  const fix = V3_CHK_STEP[k.id]; if (fix) return [fix];
  if (k.id !== 'to_no_fy0' && k.id !== 'to_unused') return [];
  const names = (x.res.map || []).map((m) => m.step), num = (s) => (typeof s === 'number' ? s : names.indexOf(s) + 1), given = k.steps ?? k.step;
  const out = given != null ? (Array.isArray(given) ? given : typeof given === 'object' ? Object.values(given) : [given]).map(num)
    : (Array.isArray(k.value) ? k.value : []).map((v) => (v && typeof v === 'object' ? (v.step == null ? 0 : num(v.step)) : (V3_KEY_STEP.find(([re]) => re.test(String(v))) || [])[1]));
  return [...new Set(out.filter((n) => n >= 1))];
}
/* n단계 머리에 보여 줄 점검(주의, 오류). 같은 문장은 한 번만 */
const v3StepChk = (x, n) => [...new Set((x.res.checks || []).filter((k) => k.level !== 'info' && v3ChkSteps(x, k).includes(n)).map((k) => k.text))];
function v3Stat(x) {
  if (x._stat) return x._stat;
  const st = (x.res.map || []).map((m) => m.status || 'todo');
  for (const k of x.res.checks || []) if (k.level === 'warn' || k.level === 'err') for (const n of v3ChkSteps(x, k)) if (st[n - 1] === 'done') st[n - 1] = 'warn';
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
  const ps = one('DCF.ps'), ok = v3Ok(ps), sot = v3Sotp(x) && v3Ok(one('DCF.sotp.eq')) && v3Ok(one('DCF.sotp.ev'));
  const body = `<div data-o="flow"><div class="v3-fl-h"><span>연도별 FCFF와 현재가치</span><span>단위 억원</span></div>
    <div class="v3-fcf">${yrs}${fd}${tv}</div>
    <button type="button" class="v3-wacc" data-v3-go="9"><span>할인율</span><b>WACC ${v3Pct(one('WACC.wacc'), 2)}</b><span>안정기 ${v3Pct(one('WACC.wacc_s'), 2)}, 영구성장률 ${v3Pct(one('DCF.g_s'), 2)}, 종료가치 비중 ${v3Pct(one('DCF.tv_share'))}</span></button>
    <div class="v3-eq">${sot ? `${card(15, '합산 영업가치', v3Eok(one('DCF.sotp.ev')), '사업부 + 보유 자산 − 본사 비용')}<i class="v3-op">+</i>${card(12, '주주가치 다리', v3Eok(one('DCF.sotp.net')), '비영업자산 − 비주주청구권', '', '+')}<i class="v3-op">=</i>${card(15, '주주가치', v3Eok(one('DCF.sotp.eq')), '', 'sum', '=')}`
      : `${card(10, '영업가치', v3Eok(one('DCF.ev')))}<i class="v3-op">+</i>${card(11, '비영업자산', v3Eok(nonop), '', '', '+')}<i class="v3-op">−</i>${card(12, '비주주청구권', v3Eok(claim), '', '', '−')}<i class="v3-op">=</i>${card(12, '주주가치', v3Eok(one('DCF.eq')), '', 'sum', '=')}`}</div>
    <div class="v3-eq r2"><i class="v3-op">÷</i>${card(13, '주식 수', `${v3Num(one('DCF.shares'))}주`, '', '', '÷')}<i class="v3-op">=</i>${card(14, `${x.sc} 내재 가치`, ok ? v3Won(ps) : '계산 불가', ok ? `현재가 대비 ${v3Up(one('DCF.up'))}` : '영구성장률이 할인율 이상', `res ${x.sc}`)}</div></div>`;
  return v3Sec('가치 산정 흐름', `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc}${sot ? ', 사업부별 합산 기준' : ''}</span>`, body, 'v3-flow', 'v3-flow');
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
      <div data-o="stepwarn">${v3Stat(x)[n - 1] === 'warn' && v3StepChk(x, n).length ? `<p class="v3-warnl">${v3StepChk(x, n).map(esc).join('<br>')}</p>` : ''}</div>
      ${fn ? v3Try(fn, x, c) : '<div class="card"><div class="empty">이 단계 화면은 준비 중입니다.</div></div>'}</div>
    <aside class="card v3-mapw ${x.st.map ? 'open' : ''}"><button type="button" class="v3-map-t" data-v3-mapt aria-expanded="${!!x.st.map}">DCF 맵 <span>${v3Stat(x).filter((y) => y === 'done').length}/${map.length} 완료</span></button>${v3Map(c, x)}</aside></div>`;
}
function v3RepTab(c, x) {
  const reps = V3_REP.filter((r) => { try { return !r.show || r.show(x); } catch { return false; } });
  if (!reps.length) return '<div class="card"><div class="empty">보고서 화면은 준비 중입니다.</div></div>';
  const cur = reps.find((r) => r.k === x.st.rep) || reps[0];
  return `<div class="va-tabs v3-sub">${v3Seg('rep', reps.map((r) => [r.k, r.label]), cur.k)}</div>${v3Try(cur.fn, x, c)}`;
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
    const st = v3St(c), k = el.dataset.k, v = v3NumOf(el.value), am = /^a\.(.+)\.\*#(\d+)$/.exec(k);
    if (am) V3_SCEN.forEach((S) => { delete st.ov[`a.${am[1]}.${S}#${am[2]}`]; }); // 세 시나리오로 고치면 시나리오 하나로 고쳐 둔 같은 칸은 지움
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
    const st = v3St(c), am = /^a\.(.+)\.\*#(\d+)$/.exec(el.dataset.k);
    if (am) V3_SCEN.forEach((S) => { delete st.ov[`a.${am[1]}.${S}#${am[2]}`]; });
    delete st.ov[el.dataset.k]; el.value = el.dataset.b; el.classList.remove('chg'); v3Later();
  });
  host.addEventListener('change', (e) => {
    const c = v3Case(); if (!c) return;
    const el = e.target;
    if (el.matches('[data-v3-case]')) { v3S.cid = el.value; v3Draw(); return; }
    if (el.matches('[data-v3-preset]')) { v3PresetSet(c, el.value); v3Draw(); return; }
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
function v3cRowLabel(s, cy, max, wrap, tip, cls = 'rl') {
  const ls = wrap ? v3cWrap(s, max) : [v3cFit(s, max)];
  return ls.map((t, j) => v3cText(1, cy + 4 + (j - (ls.length - 1) / 2) * 14, t, cls, '', tip)).join('');
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
  // 선 이름: 넓은 폭에서 선이 둘 이상이면 마지막 칸까지 이어진 선의 이름을 오른쪽 바깥 끝에 붙임(o.ends === false면 뺌). 가로 기준선 이름표가 있는 차트는 겹쳐 보여 범례만
  const ends = !nar && o.ends !== false && !hs.length && lines.length > 1 ? lines.map((s, j) => {
    const v = s.values?.[n - 1];
    return s.name && v3cOk(v) ? { v, text: String(s.name), cls: s.cls || V3C_LINE[j % 5] } : null;
  }).filter(Boolean) : [];
  const gls = nar ? [] : [...hs, ...ends];
  const tl = ticks.map(fmt), gut = gls.length ? Math.max(...gls.map((x) => v3cTw(x.text))) + 12 : 0;
  const P = { l: Math.max(0, ...tl.map(v3cTw)) + 10, r: gut || 10, t: 14, b: 26 };
  const pw = w - P.l - P.r, dots = n === 1 || (n > 1 && pw / (n - 1) >= 14), ins = dots ? 6 : 0;
  const X = (i) => P.l + ins + (n > 1 ? i / (n - 1) : 0.5) * (pw - 2 * ins), Y = (v) => P.t + (hi - v) / (hi - lo) * (h - P.t - P.b);
  const grid = ticks.map((t, j) => `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(Y(t))}" y2="${v3cR(Y(t))}" class="${t ? 'gl' : 'zl'}"/>${v3cText(P.l - 6, Y(t) + 4, tl[j], 'yl', 'end')}`).join('');
  // 가로 기준선: 넓으면 오른쪽 바깥에, 좁으면 선 위 안쪽에 라벨. 서로 겹치면 위아래로 밀어냄
  [...hs, ...ends].forEach((x) => { x.y = Y(x.v); x.ty = gut ? x.y + 4 : x.y - 5; });
  const so = [...hs, ...ends].sort((p, q) => p.ty - q.ty);
  so.forEach((x, i) => {
    if (i && !gut && x.ty < so[i - 1].ty + 14) x.ty = x.y + 13;
    x.ty = Math.max(x.ty, i ? so[i - 1].ty + 14 : 11);
  });
  for (let i = so.length - 1; i >= 0; i--) so[i].ty = Math.min(so[i].ty, i === so.length - 1 ? h - P.b - 3 : so[i + 1].ty - 14);
  const hl = hs.map((x) => `<line x1="${v3cR(P.l)}" x2="${v3cR(w - P.r)}" y1="${v3cR(x.y)}" y2="${v3cR(x.y)}" class="hl ${esc(x.cls || 's5')}"><title>${esc(`${x.text} ${fmt(x.v)}`)}</title></line>`).join('');
  const hx = hs.map((x) => (gut ? v3cText(w - P.r + 6, x.ty, x.text, `ml ${esc(x.cls || 's5')}`) : v3cText(w - P.r - 2, x.ty, x.text, `ml ${esc(x.cls || 's5')}`, 'end'))).join('')
    + ends.map((e) => v3cText(w - P.r + 6, e.ty, e.text, `ml ${esc(e.cls)}`)).join('');
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
  // 막대 → 표시선 → 글자 순으로 그림(선은 막대 위에 보이고, 값 글자는 바탕색 테두리로 선 위에 뜸)
  let shapes = '', texts = '';
  rows.forEach((r, i) => {
    const cy = top + i * RH + RH / 2, cls = esc(r.cls || 's1'), lab = String(r.label ?? ''), note = r.note ? String(r.note) : '';
    const tip = `${lab}${r.ok ? ` ${fmt(r.a)}～${fmt(r.b)}` : ''}${v3cOk(r.mid) ? `, 중간 ${fmt(r.mid)}` : ''}${note ? `, ${note}` : ''}`;
    texts += two && note ? v3cText(1, cy - 3, v3cFit(lab, lc - 8), 'rl', '', tip) + v3cText(1, cy + 12, v3cFit(note, lc - 8), 'rn') : v3cRowLabel(lab, cy, lc - 8, nar, tip);
    if (r.ok) {
      const xa = X(r.a), xb = Math.max(X(r.b), xa + 2);
      shapes += `<rect x="${v3cR(xa)}" y="${cy - 7}" width="${v3cR(xb - xa)}" height="14" rx="3" class="rg ${cls}"><title>${esc(tip)}</title></rect>`;
      texts += v3cText(xa - 6, cy + 4, fmt(r.a), 'v', 'end') + v3cText(xb + 6, cy + 4, fmt(r.b), 'v');
    }
    if (v3cOk(r.mid)) shapes += `<rect x="${v3cR(X(r.mid) - 1.5)}" y="${cy - 10}" width="3" height="20" rx="1.5" class="md ${cls}"><title>${esc(`${lab} 중간 ${fmt(r.mid)}`)}</title></rect>`;
  });
  return v3cSvg('v3c-ff', w, h, o.title || '가치 범위 비교', grid + shapes + v3cMarks(ms, top, bot) + texts);
}

// 7. 토네이도. 폭이 큰 순으로 정렬, 기준보다 높은 쪽 up, 낮은 쪽 dn
// o = {w, base, rows:[{label, lo_label, hi_label, ps_lo, ps_hi, tip}], fmt, baseLabel='기준'}. tip을 주면 줄 이름 툴팁이 그 글이 되고 이름에 점선 밑줄이 붙음
function v3cTornado(o) {
  const w = o.w || 720, nar = w < 560, fmt = v3cFmt(o), RH = 32, base = v3cOk(o.base) ? o.base : 0;
  const rows = (o.rows || []).filter((r) => r && (v3cOk(r.ps_lo) || v3cOk(r.ps_hi))).map((r) => {
    const es = [[r.ps_lo, r.lo_label], [r.ps_hi, r.hi_label]].filter(([v]) => v3cOk(v)).map(([v, t]) => ({ v, t: nar || t == null ? '' : String(t), name: t == null ? '' : String(t) })).sort((p, q) => p.v - q.v);
    const a = Math.min(base, es[0].v), b = Math.max(base, es[es.length - 1].v);
    return { label: String(r.label ?? ''), tip: r.tip ? String(r.tip) : '', es, a, b, L: es[0].v < base ? es[0] : null, R: es[es.length - 1].v > base ? es[es.length - 1] : null };
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
    let s = v3cRowLabel(r.label, cy, lc - 8, nar, r.tip || r.label, r.tip ? 'rl tp' : 'rl');
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
// 표 오른쪽 끝 두 열은 과거 CAGR, 추정 CAGR(엔진 행 <행>.cagr_h, .cagr_f 그대로. 엑셀 시트와 같은 자리). 그 두 열 몫만큼 폭이 모자라면 오래된 과거 연도부터 접고(v3rFit), 「이전 연도 펴기」로 다 봄(x.st.v3r.hall).
// 가정 꼴 표시(끝값 지정, 과거 실적 규칙)는 엔진 글 notes.form, 「평균에 넣을 해」 카드는 엔진의 notes.avg 가정 키를 22_steps_ops.js 의 v3oExTbl 에 넘겨 그림.
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
const v3rAsk = (list) => `<p class="v3r-ask"><span>살펴볼 것</span>${list.map((s) => esc(s)).join(', ')}</p>`;   // 누르는 것이 아니라 글이라 칩 모양 없이 쉼표로
const v3rIsOpen = (x, id) => !!x.st.v3r?.open?.[id];
/* 보일 과거 연도. 본문 폭에서 이름 열, 가운데 열(mid), 추정 열, CAGR 두 열을 뺀 자리에 들어가는 만큼만 최근 해부터(적어도 두 해). 좁은 화면(620 미만)은 두 해.
   열 폭은 표 글자 크기 기준 어림값(금액 자릿수에 따라 늘림). 「이전 연도 펴기」를 누르면 전부(표만 가로로 밀림) */
function v3rFit(x, { mid = 0, cg = false, re = null } = {}) {
  const { H, N } = x.tl, all = x.tl.hist.map((_, i) => i), min = Math.min(2, H);
  let keep = min;
  if (x.w >= 620) {
    const mx = Math.max(0, ...['REV.total', 'OPX.sga'].flatMap((id) => (x.R[id] || []).filter(v3Ok).map((v) => Math.abs(v)))), t = v3Num(mx), dg = t.replace(/\D/g, '').length;
    const col = 10 + 8.3 * dg + 4.2 * (t.length - dg), hw = Math.max(47.4, col), fw = Math.max(51.4, col);
    let wide = 0;   // 입력값이 일곱 자 이상인 추정 열은 칸이 넓어짐(v3rTr 의 w7. 여섯 자는 칸 여백을 줄여 같은 폭에 넣음)
    if (re) for (let i = 0; i < N; i++) { let n = 0; for (const id of Object.keys(x.R)) if (re.test(id)) { const L = x.lab[id], fmt = L?.fmt; n = Math.max(n, v3Fi(x.R[id][i], fmt, fmt === 'pct' ? 2 : fmt === 'days' || fmt === 'amt' ? 1 : undefined).length); } wide += Math.max(0, (n >= 7 ? 62 : 0) - fw); }
    keep = Math.max(min, Math.min(H, Math.floor((x.w - 50 - v3rSide(x) - 152 - (mid ? Math.max(59, col) + fw : 0) - N * fw - wide - (cg ? 92 : 0)) / hw)));
  }
  const fold = keep < H, hall = fold && !!x.st.v3r?.hall;
  return { hi: hall ? all : all.slice(H - keep), fold, hall };
}
/* 사례 스위치에 키가 없으면 엔진 기본값(JS 엔진에는 기본값 표가 따로 없어 여기서 맞춤) */
const V3R_SWD = { adj_fc: false, scn_base_rule: 'avg4', ucost_interp: 'linear', hc_basis: 'eop', hc_rnd: 'exclude', share_years: 1, resid_cost: 'none', freight_class: 'sales' };
const v3rSwV = (x, k) => x.sw[k] ?? V3R_SWD[k];
const v3rAny = (x, id) => (x.R[id] || []).some(v3Ok);
const V3R_TIP = {
  backlog: '수주 잔고처럼 계약으로 매출이 정해진 사업(발전소 전력공급계약 등)은 추정 기간을 20～30년까지 늘려도 받아들여집니다.',
  scn_base_rule: '수량, 단가 성장률 가정을 따로 넣지 않은 줄에 쓰는 과거 실적 기준',
  ucost_interp: '끝값만 정한 단위원가를 직전 실적에서 끝값까지 잇는 방식',
  hc_basis: '인당 인건비를 구할 때 전체 인건비를 나누는 직원 수',
  hc_rnd: '부서 표의 R&D 부서를 인원 합계에 넣을지 여부',
  share_years: '감가상각비, 무형자산상각비, 인건비의 판관비 몫 기본값에 쓰는 과거 기간',
  resid_cost: '줄 합에 잡히지 않는 체계 차이 매출에 붙이는 원가. 기타 잔여 원가율이 없으면 전사 원가율을 씁니다.',
  freight_class: '입력을 만들 때 정해지는 분류라 여기서는 바꿀 수 없습니다. 바꾸려면 파이썬에서 입력을 다시 받아야 합니다.',
};
/* 엔진이 낸 글(가정 꼴 form, 평균에 실제로 넣은 해 avg): 다시 계산한 결과가 먼저이고 엔진을 끈 화면은 사례의 notes */
const v3rNotes = (x) => x.res.notes ?? x.c.notes ?? {};
/* 「평균에 넣을 해」 카드: 엔진이 평균 창을 알려 준 가정 키(notes.avg) 가운데 이 단계 것만. 표와 체크는 22_steps_ops.js 의 v3oExTbl 이 그림(없거나 줄이 없으면 카드를 안 냄) */
function v3rAvgSec(x, re, name) {
  const items = Object.keys(v3rNotes(x).avg || {}).filter((k) => re.test(k)).map((k) => ({ key: k, name: name(k) }));
  const body = items.length && typeof v3oExTbl === 'function' ? v3oExTbl(x, items) : '';
  return body ? v3Sec('평균에 넣을 해', '', body, 'v3o') : '';
}

/* v3Sw 에 「이 사례에서 쓸 수 없는 값」을 더한 것. opts [[값, 이름, 쓸 수 없는 까닭]]. 까닭이 있는 단추는 눌리지 않음 */
function v3rSw(x, key, opts, cur) {
  const j = JSON.stringify(cur ?? null);
  return `<div class="mk-seg">${opts.map(([v, l, no]) => { const on = JSON.stringify(v ?? null) === j; return `<button type="button" data-v3-ov="${esc(key)}" data-v="${esc(JSON.stringify(v ?? null))}" class="${on ? 'on' : ''}" aria-pressed="${on}"${no && !on ? ` disabled title="${esc(no)}"` : ''}>${esc(l)}</button>`; }).join('')}</div>`;
}

/* 표 틀: 첫 열(이름) + 과거 열(fit.hi 번호만) + 가운데 열(mid: FY1 누적, 남은 분기) + 추정 열 + CAGR 두 열(cg: 머리 툴팁에 쓸 행 ID. 없으면 열을 안 만듦) */
function v3rT(x, { fit, mid = [], cg = '' } = {}) {
  const hs = x.tl.hist, fs = x.tl.fc, idx = fit?.hi || hs.map((_, i) => i);
  const tog = fit?.fold ? `<button type="button" class="v3r-hb" data-v3r-hall aria-pressed="${fit.hall}">${fit.hall ? '이전 연도 접기' : '이전 연도 펴기'}</button>` : '';
  const cgh = cg ? `<th class="cg bl" title="${esc(v3rCgTail(x, `${cg}.cagr_h`) || '과거 CAGR')}">과거<br>CAGR</th><th class="cg" title="${esc(v3rCgTail(x, `${cg}.cagr_f`) || '명시 기간 CAGR')}">추정<br>CAGR</th>` : '';
  const head = `<thead><tr><th class="st">${tog}</th>${idx.map((i) => `<th>${hs[i]}</th>`).join('')}${mid.map((m, j) => `<th class="${j ? '' : 'bl'}" title="${esc(m.tip || '')}">${esc(m.label)}</th>`).join('')}${fs.map((y, i) => `<th class="${i === 0 && !mid.length && idx.length ? 'bl' : ''}">${y}E</th>`).join('')}${cgh}</tr></thead>`;
  return { hi: idx, mid, fs, H: hs.length, n: 1 + idx.length + mid.length + fs.length + (cg ? 2 : 0), head, cg: !!cg, cgh: cg ? [v3rCgTail(x, `${cg}.cagr_h`), v3rCgTail(x, `${cg}.cagr_f`)] : [] };
}
/* CAGR 두 칸: 엔진 행 <행>.cagr_h, <행>.cagr_f 값 그대로(행이 없으면 빈칸, 값이 없으면 -). 툴팁은 그 행 이름(연수 포함). 머리글과 연수가 다른 칸은 점선 밑줄 */
function v3rCg(x, T, id) {
  if (!T.cg) return null;
  return ['cagr_h', 'cagr_f'].map((sfx, j) => {
    const cid = `${id}.${sfx}`, r = x.R[cid]; if (!r) return '';
    const t = v3rCgTail(x, cid);
    return `<span data-o="cg.${esc(cid)}" title="${esc(x.lab[cid]?.name || '')}"${t && T.cgh[j] && t !== T.cgh[j] ? ' class="v3r-cgd"' : ''}>${v3Ok(r[0]) ? v3Pct(r[0]) : '-'}</span>`;
  });
}
/* 표 한 줄. h 과거 칸(H개), m 가운데 칸, f 추정 칸. 칸 안에 입력 칸이 있으면 td.in. o 를 주면 줄 전체가 계산 결과 */
function v3rTr(T, { cls = '', st = '', h = [], m = [], f = [], o = '', cg = null }) {
  const td = (s, c) => { const t = s == null ? '' : String(s), inp = t.includes('class="v3-ci"'), n = inp ? (/ value="([^"]*)"/.exec(t)?.[1] || '').length : 0; // 입력값이 길면 칸 여백을 줄이고(여섯 자, 예 -16.95) 일곱 자부터는 칸을 넓힘
    return `<td class="${c}${inp ? ' in' : ''}${n >= 7 ? ' w7' : n === 6 ? ' w6' : ''}">${t}</td>`; };
  return `<tr class="${cls}"${o ? ` data-o="${esc(o)}"` : ''}><td class="st">${st}</td>${T.hi.map((i) => td(h[i], 'h')).join('')}${T.mid.map((_, j) => td(m[j], j ? '' : 'bl')).join('')}${T.fs.map((_, i) => td(f[i], i === 0 && !T.mid.length && T.hi.length ? 'bl' : '')).join('')}${T.cg ? `<td class="cg bl">${cg?.[0] || ''}</td><td class="cg">${cg?.[1] || ''}</td>` : ''}</tr>`;
}
/* 계산 행 한 줄(hist+fc 또는 fc 행). pct 비율, sign 부호, dash 없는 값을 - 로 */
function v3rRow(x, T, id, { name = '', cls = '', pct = false, d, sign = false, dash = false, nz = false } = {}) {
  const a = x.R[id]; if (!a) return '';
  const off = a.length > T.fs.length ? T.H : 0;
  const f = (v) => (v3Ok(v) && !(nz && Math.abs(v) < 0.05) ? `${sign && v > 0 ? '+' : ''}${pct ? v3Num(v * 100, d ?? 1) : v3Num(v, d ?? 0)}` : dash ? '-' : '');
  return v3rTr(T, { cls, o: `r.${id}`, st: name, h: off ? a.slice(0, T.H).map((v) => f(v)) : [], f: T.fs.map((_, i) => f(a[off + i])), cg: v3rCg(x, T, id) });
}
const v3rSub = (name, unit = '%', d = 0, tail = '') => `<div class="v3r-c sub d${d}">${esc(name)}${unit ? `<small>${unit}</small>` : ''}${tail || ''}</div>`;
/* 이름 칸: 근거가 있으면 눌러서 펴는 단추 */
function v3rName(x, id, name, why, kind = '', d = 0, tail = '', tip = '') {
  const nm = why ? `<button type="button" class="v3r-nm" data-v3r-open="${esc(id)}" aria-expanded="${v3rIsOpen(x, id)}">${esc(name)}</button>` : `<b>${esc(name)}</b>`;
  return `<div class="v3r-c d${d}">${nm}${kind ? `<small${tip ? ` class="v3r-tip" title="${esc(tip)}"` : ''}>${esc(kind)}</small>` : ''}${tail}</div>`;
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
/* 엔진 행 이름 끝의 「과거 CAGR(4년)」, 「명시 기간 CAGR(5년)」(CAGR 열 머리 툴팁과 연수 견주기) */
const v3rCgTail = (x, id) => /(?:과거|명시 기간) CAGR\(\d+년\)$/.exec(x.lab[id]?.name || '')?.[0] || '';
/* 가정이 어떤 꼴로 정해졌는지(끝값 하나, 과거 실적 규칙): 엔진이 만든 글 notes.form[<가정 키>].text 그대로(화면이 입력을 보고 추정하지 않음).
   표에는 엔진이 준 짧은 이름(notes.form[키].short)만 두고 전문은 title. 칸을 고쳐 연도별 값이 되면 엔진 글이 없어져 표시도 사라짐. {txt, tip} 또는 null */
function v3rForm(x, key) {
  const fm = v3rNotes(x).form?.[key]; if (!fm || !fm.text) return null;
  const t = String(fm.text); // 짧은 이름도 엔진 값(short). 없는 문서는 글 전문을 그대로
  return { txt: fm.short || t, tip: t };
}
const v3rFm = (fm) => (fm ? `<small class="v3r-fm" title="${esc(fm.tip)}">${esc(fm.txt)}</small>` : '');
/* 이름 옆 표시. 입력하는 동안에도 바뀌게 data-o 로 감쌈(글이 없어도 자리는 둠) */
const v3rFmW = (x, key) => `<span data-o="fm.${esc(key)}">${v3rFm(v3rForm(x, key))}</span>`;
/* 과거 성장률 표: REV.hist_g.<지표>.<방법>(산술평균, 기하평균, 로그 회귀). 시작값이 0 이하라 못 구한 칸은 NM */
const V3R_HG = { rev: '매출', ebit: '영업이익', ni: '지배순이익', eps: 'EPS' };
const V3R_HGM = { arith: '산술평균', geo: '기하평균', reg: '로그 회귀' };
function v3rHistG(x) {
  const ms = [], ks = [];
  for (const id of Object.keys(x.lab)) { const m = /^REV\.hist_g\.([^.]+)\.([^.]+)$/.exec(id); if (m && x.R[id]) { if (!ms.includes(m[1])) ms.push(m[1]); if (!ks.includes(m[2])) ks.push(m[2]); } }
  if (!ms.length) return '';
  const span = /최근 \d+년/.exec(x.lab[`REV.hist_g.${ms[0]}.${ks[0]}`]?.name || '')?.[0] || '';
  const cell = (m, k) => { const id = `REV.hist_g.${m}.${k}`, r = x.R[id]; return r ? `<td title="${esc(x.lab[id]?.name || '')}">${v3Ok(r[0]) ? v3Pct(r[0]) : 'NM'}</td>` : '<td></td>'; };
  const name = (m) => V3R_HG[m] || /^과거 (.+) 성장률/.exec(x.lab[`REV.hist_g.${m}.${ks[0]}`]?.name || '')?.[1] || m;
  return `<h3 class="v3-h3">과거 성장률${span ? `<small>${span}</small>` : ''}</h3><div class="mk-scroll" data-o="r1.hg"><table class="mk-tbl v3-t v3r-t v3r-cmp v3r-cg"><thead><tr><th class="st"></th>${ks.map((k) => `<th>${esc(V3R_HGM[k] || k)}</th>`).join('')}</tr></thead><tbody>${ms.map((m) => `<tr><td class="st">${esc(name(m))}</td>${ks.map((k) => cell(m, k)).join('')}</tr>`).join('')}</tbody></table></div>`;
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
  const cgId = R['REV.total.cagr_h'] || R['REV.total.cagr_f'] ? 'REV.total' : '';
  const T = v3rT(x, { fit: v3rFit(x, { mid: mid.length, cg: !!cgId, re: /^CTL\.a\.rev\./ }), mid, cg: cgId });
  const gids = new Set(groups.map((g) => g.id));
  const aK = {}, vo = Object.keys(V3R_VAR), vi = (k) => { const i = vo.indexOf(k); return i < 0 ? vo.length : i; };   // 줄 id → 가정 변수(엔진이 만든 가정 행 기준)
  for (const k of Object.keys(R)) { const m = /^CTL\.a\.rev\.(.+)\.([^.]+)$/.exec(k); if (m) (aK[m[1]] ||= []).push(m[2]); }
  const LV = { g_vol: ['vol', '수량', ''], g_price: ['price', '단가', '원'] };                                           // 성장률 가정 위에 보여 줄 값 행
  const kids = (gid) => groups.filter((g) => g.parent === gid), own = (gid) => lines.filter((l) => l.group === gid);
  const gYtd = (gid) => { const a = [...own(gid).map((l) => ytd(l.id)), ...kids(gid).map((g) => gYtd(g.id))]; return a.length && a.every((v) => v != null) ? a.reduce((s, v) => s + v, 0) : null; };
  const pos = (g) => Math.min(lines.length, ...own(g.id).map((l) => lines.indexOf(l)), ...kids(g.id).map(pos));
  const ordered = (ls, gs, d) => [...ls.map((l) => ({ i: lines.indexOf(l), l })), ...gs.map((g) => ({ i: pos(g), g }))].sort((a, b) => a.i - b.i).map((n) => (n.l ? lineRows(n.l, d) : groupRows(n.g, d))).join('');

  const baseNm = (ln) => { const b = 'a_base' in ln ? ln.a_base : ln.a?.base_line, bl = typeof b === 'string' ? lines.find((l) => l.id === b) : null; return bl ? bl.name || bl.id : typeof b === 'string' ? b : ''; };
  function lineRows(ln, d) {
    const id = ln.id, idx = lines.indexOf(ln), rid = `REV.l.${id}`, v = R[`${rid}.val`] || [], g = R[`${rid}.g`] || [], oid = `rev.${id}`;
    const A = (k) => R[`CTL.a.rev.${id}.${k}`] || [], keys = (aK[id] || []).slice().sort((a, b) => vi(a) - vi(b));
    const y = ytd(id), fix = ytdOn && y != null && v3Ok(v3rPick(ln.fy1_override, S));   // 첫해 = 누적 실적 + 남은 분기 직접 입력(그해 가정 칸은 쓰이지 않음)
    const est = !v3Ok(I.hist?.[`${rid}.val`]?.[H - 1]) && v3Ok(v3rPick(ln.fy0, S));
    const inV = ln.type === 'manual' && keys.includes('val'), inG = ln.type === 'growth' && keys.includes('g');
    // 입력값과 반영된 값이 다르면(전체 성장률 가산, 컨센서스 맞춤) 반영된 값을 입력 칸 아래 작게
    const ap = (k, res, inp, pct) => v3rO(k, v3Ok(res) && v3Ok(inp) && Math.abs(res - inp) > (pct ? 0.00005 : 0.05) ? `<small>${pct ? v3rP(res) : v3rN(res)}</small>` : '');
    const why = ln.why || v3Note(x, `rev.${id}`);
    const rowA = v3rTr(T, { cls: 'v3r-a',
      st: v3rName(x, oid, ln.name || id, why, inG ? '' : V3R_DRV[ln.type] || ln.type, d, '', ln.type === 'backlog' ? V3R_TIP.backlog : ln.type === 'share_of' && baseNm(ln) ? `기준 줄 ${baseNm(ln)}` : ''),
      h: v.slice(0, H).map((a, i) => (est && i === H - 1 ? `<i class="v3r-est" title="${esc(ln.fy0_why || '추정 출발')}">${v3rO(`r1.${id}.h0`, v3rN(a))}</i>` : v3rN(a))),
      m: [v3rN(y), fix ? v3rLineIn(x, idx, 'fy1_override', `${ln.name} ${mid[1]?.label || ''}`, true) : y != null && ytdOn ? v3rO(`r1.${id}.q`, v3rN(v[H] - y)) : ''],
      f: T.fs.map((_, i) => (inV && !(fix && i === 0) ? v3ACell(x, `rev.${id}.val`, i, 'amt', S, ln.name) + ap(`r1.${id}.av${i}`, v[H + i], A('val')[i]) : v3rO(`r1.${id}.v${i}`, v3rN(v[H + i])))), cg: v3rCg(x, T, `${rid}.val`) });
    const vars = keys.filter((k) => !(inV && k === 'val') && !(inG && k === 'g')).map((k) => {
      const fmt = x.lab[`CTL.a.rev.${id}.${k}`]?.fmt || V3R_VAR[k]?.[1] || 'num', nm = V3R_VAR[k]?.[0] || k;
      const lv = LV[k] && R[`${rid}.${LV[k][0]}`] ? v3rRow(x, T, `${rid}.${LV[k][0]}`, { name: v3rSub(LV[k][1], LV[k][2], d), cls: 'v3r-b' }) : '';
      const fk = `rev.${id}.${k}`, fm = v3rForm(x, fk), hq = [];   // 가정 꼴 표시는 비어 있는 과거 칸 끝에(추정 첫 칸 바로 앞)
      if (T.hi.length) hq[H - 1] = `<span data-o="fmh.${esc(fk)}">${fm ? `<span class="v3r-tagw"><span class="v3r-tag n" title="${esc(fm.tip)}">${esc(fm.txt)}</span></span>` : ''}</span>`;
      return lv + v3rTr(T, { cls: 'v3r-b', st: v3rSub(nm, fmt === 'pct' ? '%' : '', d, T.hi.length ? '' : v3rFmW(x, fk)), h: hq, f: T.fs.map((_, i) => v3ACell(x, `rev.${id}.${k}`, i, fmt, S, `${ln.name} ${nm}`)) });
    }).join('');
    const extra = est ? `<div class="v3r-x"><label class="v3-f"><span>${x.tl.hist[H - 1]}년 출발값</span>${v3rLineIn(x, idx, 'fy0', `${ln.name} 출발값`, false)}</label>${ln.fy0_why ? `<p>${esc(ln.fy0_why)}</p>` : ''}</div>` : '';
    const note = v3rNote(x, T, oid, why, extra);
    const rowB = v3rTr(T, { cls: `v3r-b${note ? '' : ' end'}`, st: v3rSub(inG ? '성장률' : '전년 대비', '%', d, inG ? v3rFmW(x, `rev.${id}.g`) : ''), h: g.slice(0, H).map((a, i) => (est && i === H - 1 ? '<span class="v3r-tagw"><span class="v3r-tag">추정 출발</span></span>' : v3rP(a))),
      f: T.fs.map((_, i) => (inG && !(fix && i === 0) ? v3ACell(x, `rev.${id}.g`, i, 'pct', S, `${ln.name} 성장률`) + ap(`r1.${id}.ag${i}`, g[H + i], A('g')[i], 1) : v3rO(`r1.${id}.g${i}`, v3rP(g[H + i])))) });
    return rowA + vars + rowB + note;
  }
  function groupRows(g, d) {
    const v = R[`REV.g.${g.id}.val`] || [], y = gYtd(g.id);
    const gv = `REV.g.${g.id}.vol`, gp = `REV.g.${g.id}.mix_asp`;
    return v3rTr(T, { cls: `v3r-g d${d}`, o: `r1.g.${g.id}`, st: `<div class="v3r-c d${d}"><b>${esc(g.name || g.id)}</b></div>`, h: v.slice(0, H).map((a) => v3rN(a)), m: [v3rN(y), y != null && ytdOn ? v3rN(v[H] - y) : ''], f: T.fs.map((_, i) => v3rN(v[H + i])), cg: v3rCg(x, T, `REV.g.${g.id}.val`) })
      + (v3rAny(x, gv) ? v3rRow(x, T, gv, { name: v3rSub('총수량', '', d), cls: `v3r-b${v3rAny(x, gp) ? '' : ' end'}` }) : '')
      + (v3rAny(x, gp) ? v3rRow(x, T, gp, { name: `<div class="v3r-c sub d${d}" title="수량 가중 평균">혼합 단가<small>원</small></div>`, cls: 'v3r-b end' }) : '')
      + ordered(own(g.id), kids(g.id), d + 1);
  }
  let rows = ordered(lines.filter((l) => !l.group || !gids.has(l.group)), groups.filter((g) => !g.parent || !gids.has(g.parent)), 0);
  const tot = R['REV.total'] || [], ys = v3Ok(v3V(x, 'REV.ytd')) ? v3V(x, 'REV.ytd') : null;
  rows += v3rTr(T, { cls: 'key', o: 'r1.tot', st: '<b>매출 합계</b>', h: tot.slice(0, H).map((a) => v3rN(a)), m: [v3rN(ys), ys != null && ytdOn ? v3rN(tot[H] - ys) : ''], f: T.fs.map((_, i) => v3rN(tot[H + i])), cg: v3rCg(x, T, 'REV.total') });
  rows += v3rRow(x, T, 'REV.growth', { name: v3rSub('전년 대비'), cls: 'v3r-b end', pct: true });
  const adjOn = !!v3rSwV(x, 'adj_fc'), adjFc = (I.adj || []).filter((a) => a && a.account === 'rev' && x.tl.fc.includes(a.year));   // 진행 연도 매출 보정(켜면 체계 차이 줄에 더해짐)
  if ((R['REV.resid'] || []).some((a) => v3Ok(a) && Math.abs(a) >= 0.05)) rows += v3rRow(x, T, 'REV.resid', { name: adjOn && adjFc.length ? '체계 차이와 보정' : '체계 차이', cls: 'end', d: 1, nz: true });
  const cons = [['REV.cons', '컨센서스', {}], ['REV.cons_hi', v3rSub('최고', ''), { cls: 'v3r-b' }], ['REV.cons_lo', v3rSub('최저', ''), { cls: 'v3r-b' }], ['REV.cons_n', v3rSub('추정 기관 수', ''), { cls: 'v3r-b' }], ['REV.cons_gap', '컨센서스 대비', { sign: true }]].filter(([id]) => v3rAny(x, id));
  cons.forEach(([id, name, o], j) => { rows += v3rRow(x, T, id, { name, dash: true, ...o, cls: `${o.cls || ''}${j === cons.length - 1 ? ' end' : ''}`.trim() }); });

  const opt = [];
  if (hasMid) opt.push(['첫해 매출', v3Sw(x, 'sw.fy1_mode', [['ytd_plus_rest', '누적 실적 + 남은 분기'], ['full', '연간 추정']], x.sw.fy1_mode)]);
  if ((I.cons?.rev || []).some(v3Ok)) opt.push(['컨센서스 맞춤', v3Sw(x, 'sw.cons_anchor', [['off', '안 함'], ['fy1', '첫해'], ['fy1_fy2', '첫해와 다음 해']], x.sw.cons_anchor)]);
  if (Math.abs((R['REV.resid'] || [])[H - 1] || 0) >= 0.5) opt.push(['체계 차이', v3Sw(x, 'sw.resid_fwd', [['zero', '추정에서 0'], ['hold_share', '비중 유지']], x.sw.resid_fwd)]);
  if (lines.some((l) => l.type === 'price_volume')) opt.push(['가정 없는 수량, 단가 성장률 기본값', v3Sw(x, 'sw.scn_base_rule', [['avg4', '최근 4년 평균'], ['cagr5', '최근 5년 연평균(CAGR)']], v3rSwV(x, 'scn_base_rule')), V3R_TIP.scn_base_rule]);
  if (adjFc.length) opt.push(['진행 연도 매출 보정', v3Sw(x, 'sw.adj_fc', [[false, '참고만'], [true, '계산에 반영']], adjOn), (x.res.checks || []).filter((k) => k.id === 'adj_fc').map((k) => k.text).join('\n')]);
  opt.push(['전체 성장률 가산', v3In(x, 'o.growth_add', 0, { fmt: 'pct', u: '%p', lab: '전체 매출 성장률 가산' })]);
  return `${v3rAsk(['TTM', '최근 3～5년 평균', '가이던스', '산업 평균', '이벤트'])}${v3rTable(T, rows)}<div class="v3-opt v3r-opt">${opt.map(([l, h, tip]) => `<div${tip ? ` title="${esc(tip)}"` : ''}><span>${l}</span>${h}</div>`).join('')}</div>`;
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
  const tr = (key, name, g, sh0, shL, scen, cls = '') => `<tr class="${cls}" data-o="${esc(key)}"><td class="st">${name}</td>${gy.map((i) => `<td class="h">${v3Ok(g[i]) ? v3Pct(g[i]) : ''}</td>`).join('')}<td class="bl">${v3Ok(sh0) ? v3Pct(sh0) : ''}</td><td>${v3Ok(shL) ? v3Pct(shL) : ''}</td>${scen.map((v, j) => `<td class="${j ? '' : 'bl'}${V3_SCEN[j] === x.sc ? ' v3r-on' : ''}">${v3Ok(v) ? v3Num(v) : '-'}</td>`).join('')}</tr>`;
  const body = N < 1 ? '' : lines.map((l) => { const rid = `REV.l.${l.id}`; return tr(`r1.cmp.${l.id}`, esc(l.name || l.id), R[`${rid}.g`] || [], R[`${rid}.share`]?.[H - 1], R[`${rid}.share`]?.[L], V3_SCEN.map((s) => v3V(x, `${rid}.val`, L, s))); }).join('')
    + tr('r1.cmp.tot', '<b>매출 합계</b>', R['REV.growth'] || [], null, null, V3_SCEN.map((s) => v3V(x, 'REV.total', L, s)), 'sum');
  const cmp = !body ? '' : `<h3 class="v3-h3">줄별 비교</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3r-t v3r-cmp"><thead>
      <tr><th class="st" rowspan="2"></th>${gy.length ? `<th colspan="${gy.length}">과거 성장률</th>` : ''}<th class="bl" colspan="2">매출 비중</th><th class="bl" colspan="${V3_SCEN.length}">${yL}E 매출</th></tr>
      <tr>${gy.map((i) => `<th>${x.tl.hist[i]}</th>`).join('')}<th class="bl">${x.tl.hist[H - 1]}</th><th>${yL}E</th>${V3_SCEN.map((s, j) => `<th class="${j ? '' : 'bl'}${s === x.sc ? ' v3r-on' : ''}">${s}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
  const hgT = v3rHistG(x), gr = hgT ? `<div class="v3-two v3r-two"><div>${hgT}</div></div>` : '';   // 연평균 성장률은 본표의 CAGR 두 열
  return `<h3 class="v3-h3">사업부별 매출</h3>${leg1}<div data-o="r1.c1">${c1}</div>
    <div class="v3-two v3r-two"><div><h3 class="v3-h3">합계와 컨센서스</h3>${leg2}<div data-o="r1.c2">${c2}</div></div>${donut}</div>${cmp}${gr}`;
}
function v3rRev(x) {
  return v3Sec('사업부 매출', v3rMeta(x), v3rRevTable(x), 'v3r') + v3Sec('참고 데이터', '<span class="meta">단위 억원</span>', v3rRevRef(x), 'v3r');
}

// ---------- 2단계 매출원가 ----------
function v3rCogs(x) {
  const R = x.R, S = x.sc, { H } = x.tl, mode = x.sw.cogs_mode, lines = x.I.revbuild?.lines || [], groups = x.I.revbuild?.groups || [];
  const cgId = R['OPX.gp.cagr_h'] || R['OPX.gp.cagr_f'] ? 'OPX.gp' : '', T = v3rT(x, { fit: v3rFit(x, { cg: !!cgId, re: /^CTL\.a\.(cogs|ucost|gpm)/ }), cg: cgId });
  const find = (re) => Object.keys(R).filter((k) => re.test(k)).map((k) => k.slice(6));
  const segK = find(/^CTL\.a\.cogs_r\../), ucK = find(/^CTL\.a\.ucost\../), lname = (id) => lines.find((l) => l.id === id)?.name || id;
  const keys = ({ ratio: ['cogs_r'], seg_ratio: [...segK, 'cogs_r'], gpm_step: ['gpm_step'], unit_cost: [...ucK, ...segK, 'cogs_r'], components: ['cogs_mat_pct', 'cogs_other_pct'] }[mode] || ['cogs_r']).filter((k) => R[`CTL.a.${k}`]);
  const item = (k) => {
    if (k === 'cogs_r') return { name: mode === 'ratio' ? '매출원가율' : '전사 매출원가율', fmt: 'pct', hist: 'OPX.cogs_r' };
    if (k === 'gpm_step') return { name: '매출총이익률 증가폭', fmt: 'pct', unit: '%p' };
    if (k === 'cogs_mat_pct') return { name: '재료비 매출 대비', fmt: 'pct' };
    if (k === 'cogs_other_pct') return { name: '기타 원가 매출 대비', fmt: 'pct' };
    if (k.startsWith('ucost.')) { const fmt = x.lab[`CTL.a.${k}`]?.fmt || 'won'; /* 화면에서 방식을 바꿔 새로 생긴 행은 사례 labels 에 없음. 단위원가는 원 */ return { name: `${lname(k.slice(6))} 단위원가`, fmt, unit: fmt === 'won' ? '원' : '', hist: `OPX.${k}` }; }
    return { name: `${ckName(k.slice(7))} 원가율`, fmt: 'pct', hist: `OPX.cogs_r.${k.slice(7)}` };
  };
  /* 원가 키 이름: 줄 하나면 그 줄, 같은 묶음의 줄들이면 묶음 이름. etc는 전사 원가에서 사업부 원가를 뺀 나머지 */
  function ckName(ck) {
    if (ck === 'etc') return '기타';
    const own = lines.filter((l) => l.cost?.cogs_r_key === ck);
    if (own.length === 1) return own[0].name || ck;
    const g = own.length && own.every((l) => l.group && l.group === own[0].group) ? groups.find((y) => y.id === own[0].group) : null;
    return g?.name || ck;
  }
  /* 사업부 원가: 금액 줄과 원가율 줄. 가정 키 k가 있으면 원가율이 입력 칸, 없으면 계산값(단위원가 방식 등) */
  const segRows = (ck, k) => {
    const nm = ckName(ck), amt = R[`OPX.cogs.${ck}`] || [], cr = R[`OPX.cogs_r.${ck}`] || [], why = k ? v3Note(x, k) : '', oid = `cogs.${k || ck}`, note = k ? v3rNote(x, T, oid, why) : '';
    return v3rTr(T, { cls: 'v3r-a', st: v3rName(x, oid, `${nm} 원가`, why, ck === 'etc' ? '잔여' : '', 0, '', ck === 'etc' ? '전사 매출원가에서 사업부 원가 합을 뺀 금액' : ''), h: amt.slice(0, H).map((v) => v3rN(v)), f: T.fs.map((_, i) => v3rO(`r2.${ck}.v${i}`, v3rN(amt[H + i]))) })
      + v3rTr(T, { cls: `v3r-b${note ? '' : ' end'}`, st: v3rSub('원가율', '%', 0, k ? v3rFmW(x, k) : ''), h: cr.slice(0, H).map((v) => v3rP(v)), f: T.fs.map((_, i) => (k ? v3ACell(x, k, i, 'pct', S, `${nm} 원가율`) : v3rO(`r2.${ck}.r${i}`, v3rP(cr[H + i])))) }) + note;
  };
  const segDone = new Set();
  let rows = v3rRow(x, T, 'REV.total', { name: '매출액', cls: 'end' });
  keys.forEach((k) => {
    const sm = /^cogs_r\.(.+)$/.exec(k);
    if (sm && v3rAny(x, `OPX.cogs.${sm[1]}`)) { rows += segRows(sm[1], k); segDone.add(sm[1]); return; }
    const it = item(k), why = v3Note(x, k), oid = `cogs.${k}`, note = v3rNote(x, T, oid, why), hr = it.hist ? R[it.hist] : null;
    rows += v3rTr(T, { cls: `v3r-a${note ? '' : ' end'}`, st: v3rName(x, oid, it.name, why, it.unit ?? '%', 0, v3rFmW(x, k)), h: hr ? hr.slice(0, H).map((v) => (it.fmt === 'pct' ? v3rP(v) : v3rN(v, it.fmt === 'won' ? 0 : 1))) : [],
      f: T.fs.map((_, i) => v3ACell(x, k, i, it.fmt, S, it.name)), cg: it.hist ? v3rCg(x, T, it.hist) : null }) + note;
  });
  for (const id of Object.keys(R)) { const m = /^OPX\.cogs_r\.([^.]+)$/.exec(id); if (m && !segDone.has(m[1]) && v3rAny(x, `OPX.cogs.${m[1]}`)) rows += segRows(m[1], ''); }   // 가정이 아닌 사업부 원가(과거 실적과 계산값)
  rows += v3rRow(x, T, 'OPX.cogs', { name: '매출원가', cls: mode === 'ratio' ? 'end' : '' });
  if (mode !== 'ratio') rows += v3rRow(x, T, 'OPX.cogs_r', { name: v3rSub('매출원가율'), cls: 'v3r-b end', pct: true });
  rows += v3rRow(x, T, 'OPX.gp', { name: '<b>매출총이익</b>', cls: 'key' }) + v3rRow(x, T, 'OPX.gpm', { name: v3rSub('매출총이익률'), cls: 'v3r-b end', pct: true });

  const hasMat = (x.I.hist?.['OPX.cogs.mat'] || []).some(v3Ok);
  const modes = [['ratio', '전사 원가율'], ['seg_ratio', '사업부 원가율', lines.some((l) => l.cost?.cogs_r_key) ? '' : '사업부 원가율을 정한 줄이 없는 사례'],
    ['unit_cost', '단위원가', lines.some((l) => l.type === 'price_volume') ? '' : '수량과 단가로 추정하는 줄이 없는 사례'], ['gpm_step', '총이익률 증가폭'],
    ['components', '성격별 구성', hasMat && x.sw.labor_mode === 'headcount' ? '' : '성격별 원가 자료와 인원 방식 인건비가 있어야 하는 방식']];
  // 끝값만 준 단위원가 가정(보간 방식을 따로 적지 않은 것)이 있을 때만 보간 단추
  const toU = mode === 'unit_cost' && Object.values(x.I.assump || {}).some((a) => a && Object.entries(a).some(([k, v]) => k.startsWith('ucost.') && v && typeof v === 'object' && !Array.isArray(v) && !('by_year' in v) && 'to' in v && !v.interp));
  // 체계 차이 매출의 원가: 사업부 원가율이나 단위원가 방식이고 추정 연도에 체계 차이 매출이 있을 때만 뜻이 있음
  const rsOn = (mode === 'seg_ratio' || mode === 'unit_cost') && (R['REV.resid'] || []).slice(H).some((v) => v3Ok(v) && Math.abs(v) > 1e-9);
  const resid = rsOn ? `<div title="${esc(V3R_TIP.resid_cost)}"><span>체계 차이 매출의 원가</span>${v3Sw(x, 'sw.resid_cost', [['none', '없음'], ['etc', '기타 잔여 원가율']], v3rSwV(x, 'resid_cost') === 'etc' ? 'etc' : 'none')}</div>` : '';
  const interp = toU ? `<div title="${esc(V3R_TIP.ucost_interp)}"><span>단위원가 끝값 보간</span>${v3Sw(x, 'sw.ucost_interp', [['linear', '직선'], ['cagr', '정률']], v3rSwV(x, 'ucost_interp'))}</div>` : '';
  const main = `<div class="v3-opt v3r-opt top"><div><span>원가 방식</span>${v3rSw(x, 'sw.cogs_mode', modes, mode)}</div>${interp}${resid}</div>${v3rAsk(['TTM', '최근 3～5년 평균', '산업 평균', '환율과 원자재 가격', '규모의 경제', '고정비 비중'])}${v3rTable(T, rows)}`;

  // 참고: 과거 원가율과 평균선, 세 시나리오 추정
  const cr = R['OPX.cogs_r'] || [];
  const two = x.w > 620, w2 = v3Wd(x, two ? 2 : 1, v3rSide(x)), labels = v3Years(x, 'hist+fc').map((y) => y.label);
  const ls = [{ name: '실적', values: cr.map((v, i) => (i < H ? v : null)), cls: 's5' }, ...V3_SCEN.map((s) => ({ name: s, values: (v3Row(x, 'OPX.cogs_r', s) || []).map((v, i) => (i >= H - 1 ? v : null)), cls: s.toLowerCase() }))];
  const ch = v3cLines({ w: w2, h: 220, labels, lines: ls, fmt: (v) => v3Pct(v), title: '매출원가율 실적과 시나리오별 추정' });
  const leg = v3cLegend([{ label: '실적', cls: 's5', kind: 'line' }, ...V3_SCEN.map((s) => ({ label: s, cls: s.toLowerCase(), kind: 'line' }))]);
  const ref = `<div class="v3-two"><div><h3 class="v3-h3">매출원가율 추이</h3>${leg}<div data-o="r2.c1">${ch}</div></div><div><h3 class="v3-h3">시나리오별 매출원가율</h3>${v3rScen(x, 'OPX.cogs_r', 'r2.s1')}<h3 class="v3-h3">시나리오별 매출총이익<small>억원</small></h3>${v3rScen(x, 'OPX.gp', 'r2.s2', { pct: false })}</div></div>`;
  const avg = v3rAvgSec(x, /^cogs_r(\.|$)/, (k) => item(k).name);
  return v3Sec('원가율 가정', v3rMeta(x), main, 'v3r') + avg + v3Sec('참고 데이터', '', ref, 'v3r');
}

// ---------- 3단계 판관비 ----------
/* 인원과 인건비(인원 방식일 때): 부서별 인원과 인당 매출, 인원 합계, 인당 인건비, 전체 인건비, 판관비 몫.
   부서는 x.I.opex.hc_depts. 변동 부서(V)는 인당 매출 증가분, 고정 부서(F)는 증가 인원이 가정 칸이고 고정 부서의 인당 매출은 참고 행.
   rnd 부서는 sw.hc_rnd 가 include 가 아니면 인원 합계에서 빠지고 추정 열이 빔 */
function v3rHc(x, fit) {
  const R = x.R, S = x.sc, { H } = x.tl;
  if (x.sw.labor_mode !== 'headcount' || !v3rAny(x, 'OPX.hc')) return '';
  const T = v3rT(x, { fit: fit || v3rFit(x) }), depts = (x.I.opex?.hc_depts || []).filter((d) => d && R[`OPX.hc.${d.id}`]), incl = v3rSwV(x, 'hc_rnd') === 'include';
  const aRow = (K, name, unit, lab, cls = 'v3r-b end') => { const fmt = x.lab[`CTL.a.${K}`]?.fmt || 'num'; return R[`CTL.a.${K}`] ? v3rTr(T, { cls, st: v3rSub(name, unit, 0, v3rFmW(x, K)), f: T.fs.map((_, i) => v3ACell(x, K, i, fmt, S, lab)) }) : ''; };
  let rows = '';
  for (const d of depts) {
    const id = d.id, name = d.name || id, vr = d.kind === 'V', out = !!d.rnd && !incl, hc = R[`OPX.hc.${id}`], rid = `OPX.rev_per_hc.${id}`, K = `hc.${id}.add`, hasK = !out && !!R[`CTL.a.${K}`];
    rows += v3rTr(T, { cls: 'v3r-a', o: `r3.hc.${id}`, st: v3rName(x, `hc.${id}`, name, '', out ? '합계에서 뺌' : vr ? '변동' : '고정', 0, '', out ? '' : vr ? '매출을 인당 매출로 나눠 인원을 구하는 부서' : '해마다 정한 인원만큼 느는 부서'), h: hc.slice(0, H).map((v) => v3rN(v)), f: T.fs.map((_, i) => v3rN(hc[H + i])) });
    if (R[rid]) rows += v3rRow(x, T, rid, { name: v3rSub(vr || out ? '인당 매출' : '참고 인당 매출', '억'), cls: `v3r-b${hasK ? '' : ' end'}`, d: 1 });
    if (hasK) rows += aRow(K, vr ? '인당 매출 증가분' : '증가 인원', vr ? '억' : '명', `${name} ${vr ? '인당 매출 증가분' : '증가 인원'}`);
  }
  rows += v3rRow(x, T, 'OPX.hc', { name: '<b>인원 합계</b>', cls: `sum${R['OPX.hc_all'] || R['OPX.hc_avg'] || (!depts.length && R['CTL.a.rev_per_hc_add']) ? '' : ' end'}` });
  if (!depts.length) rows += aRow('rev_per_hc_add', '인당 매출 증가분', '억', '인당 매출 증가분', `v3r-b${R['OPX.hc_all'] || R['OPX.hc_avg'] ? '' : ' end'}`);
  if (R['OPX.hc_all']) rows += v3rRow(x, T, 'OPX.hc_all', { name: v3rSub('R&D 포함 총원', ''), cls: `v3r-b${R['OPX.hc_avg'] ? '' : ' end'}` });
  if (R['OPX.hc_avg']) rows += v3rRow(x, T, 'OPX.hc_avg', { name: v3rSub('평균 인원', ''), cls: 'v3r-b end', d: 1 });
  const wWhy = v3Note(x, 'wage_g'), wNote = v3rNote(x, T, 'hc.wage', wWhy);
  rows += v3rTr(T, { cls: 'v3r-a', o: 'r3.hc.cph', st: v3rName(x, 'hc.wage', '인당 인건비', wWhy), h: (R['OPX.cost_per_hc'] || []).slice(0, H).map((v) => v3rN(v, 2)), f: T.fs.map((_, i) => v3rN((R['OPX.cost_per_hc'] || [])[H + i], 2)) })
    + aRow('wage_g', '임금상승률', '%', '임금상승률', `v3r-b${wNote ? '' : ' end'}`) + wNote;
  rows += v3rRow(x, T, 'OPX.labor_total', { name: '전체 인건비', cls: 'end' });
  const sWhy = v3Note(x, 'labor_sga_share'), sNote = v3rNote(x, T, 'hc.share', sWhy), sh = R['OPX.labor_sga_share'] || [], hasS = !!R['CTL.a.labor_sga_share'];
  if (sh.length) rows += v3rTr(T, { cls: `v3r-a${sNote ? '' : ' end'}`, st: v3rName(x, 'hc.share', '판관비 몫', sWhy, '%'), h: sh.slice(0, H).map((v) => v3rP(v)), f: T.fs.map((_, i) => (hasS ? v3ACell(x, 'labor_sga_share', i, 'pct', S, '인건비 판관비 몫') : v3rO(`r3.hc.sh${i}`, v3rP(sh[H + i])))) }) + sNote;
  rows += v3rRow(x, T, 'OPX.sga.labor', { name: '<b>판관비 인건비</b>', cls: 'key' });
  const ck = (x.res.checks || []).filter((k) => k.id === 'hc_dept_sum').map((k) => `<p class="v3r-ck">${esc(k.text)}</p>`).join('');
  const opt = [`<div title="${esc(V3R_TIP.hc_basis)}"><span>인당 인건비 직원 수 기준</span>${v3Sw(x, 'sw.hc_basis', [['eop', '기말'], ['avg', '기초와 기말 평균']], v3rSwV(x, 'hc_basis'))}</div>`];
  if ((x.I.opex?.hc_depts || []).some((d) => d && d.rnd)) opt.push(`<div title="${esc(V3R_TIP.hc_rnd)}"><span>R&amp;D 부서 인원</span>${v3Sw(x, 'sw.hc_rnd', [['exclude', '빼기'], ['include', '넣기']], incl ? 'include' : 'exclude')}</div>`);
  return `${v3rTable(T, rows)}<div data-o="r3.hc.ck">${ck}</div><div class="v3-opt v3r-opt">${opt.join('')}</div>`;
}
/* 인원 방식이 아닌 사례의 참고: 입력에 든 부서별 인원 실적과 총원(값 그대로), 부서 합 점검 문장(hc_dept_sum) */
function v3rHcRef(x) {
  if (x.sw.labor_mode === 'headcount') return '';
  const hs = x.tl.hist, Hh = x.I.hist || {}, depts = (x.I.opex?.hc_depts || []).filter((d) => d && (Hh[`OPX.hc.${d.id}`] || []).some(v3Ok)), tot = x.R['OPX.hc'] || Hh['OPX.hc'] || [];
  if (!depts.length) return '';
  const row = (name, a, cls = '') => `<tr class="${cls}"><td class="st">${name}</td>${hs.map((_, i) => `<td class="h">${v3rN(a[i])}</td>`).join('')}</tr>`;
  const ck = (x.res.checks || []).filter((k) => k.id === 'hc_dept_sum').map((k) => `<p class="v3r-ck">${esc(k.text)}</p>`).join('');
  const body = `<h3 class="v3-h3">부서별 인원<small>명</small></h3><div class="mk-scroll"><table class="mk-tbl v3-t v3r-t v3r-cmp v3r-cg"><thead><tr><th class="st"></th>${hs.map((y) => `<th>${y}</th>`).join('')}</tr></thead>
    <tbody>${depts.map((d) => row(esc(d.name || d.id), Hh[`OPX.hc.${d.id}`])).join('')}${tot.some(v3Ok) ? row('<b>총원</b>', tot, 'sum') : ''}</tbody></table></div><div data-o="r3.hcr.ck">${ck}</div>`;
  return hs.length <= 5 ? `<div class="v3-two v3r-two"><div>${body}</div></div>` : `<div class="v3r-two">${body}</div>`;   // 과거 성장률 표처럼 반 폭(연도가 많으면 온 폭)
}
function v3rSga(x) {
  const R = x.R, S = x.sc, { H, N } = x.tl, cfg = x.I.opex?.groups || {}, lines = x.I.revbuild?.lines || [];
  const cgId = R['OPX.sga.cagr_h'] || R['OPX.sga.cagr_f'] ? 'OPX.sga' : '', fit = v3rFit(x, { cg: !!cgId, re: /^CTL\.a\.sga_/ }), T = v3rT(x, { fit, cg: cgId });
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
      f: T.fs.map((_, i) => (K === 'val' ? v3ACell(x, key, i, 'amt', S, name) : v3rO(`r3.${g}.v${i}`, v3rN(amt[H + i])))), cg: v3rCg(x, T, `OPX.sga.${g}`) });
    let lab = '매출 대비', h = pct.slice(0, H).map((v) => v3rP(v)), f = T.fs.map((_, i) => v3rO(`r3.${g}.p${i}`, v3rP(pct[H + i])));
    if (K === 'pct') f = T.fs.map((_, i) => v3ACell(x, key, i, 'pct', S, `${name} 매출 대비`));
    else if (K === 'g') { lab = '증가율'; h = amt.slice(0, H).map((v, i) => (i && v3Ok(v) && v3Ok(amt[i - 1]) && amt[i - 1] ? v3rP(v / amt[i - 1] - 1) : '')); f = T.fs.map((_, i) => v3ACell(x, key, i, 'pct', S, `${name} 증가율`)); }
    else if (K === 'ratio') { const lv = R[`REV.l.${cfg[g]?.line}.val`] || []; lab = `${lname(cfg[g]?.line)} 매출 대비`; h = amt.slice(0, H).map((v, i) => (v3Ok(v) && v3Ok(lv[i]) && lv[i] ? v3rP(v / lv[i]) : '')); f = T.fs.map((_, i) => v3ACell(x, key, i, 'pct', S, `${name} ${lab}`)); }
    rows += v3rTr(T, { cls: `v3r-b${note ? '' : ' end'}`, st: v3rSub(lab, '%', 0, key && K !== 'val' ? v3rFmW(x, key) : ''), h, f }) + note;
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
  // 운반비 묶음은 입력을 만들 때 정해지는 분류라 지금 값만 보여 줌(운반비 묶음이 있거나 기타관리비로 옮긴 사례)
  const fc = v3rSwV(x, 'freight_class'), frt = gs.includes('freight') || fc === 'other' ? `<div title="${esc(V3R_TIP.freight_class)}"><span>운반비 묶음</span><span class="v3r-res">${fc === 'other' ? '기타관리비(물가 연동)' : '매출 비례'}</span></div>` : '';
  const opt = `<div class="v3-opt v3r-opt"><div><span>인건비 방식</span>${v3rSw(x, 'sw.labor_mode', [['pct_sales', '매출 비례'], ['headcount', '인원 방식', scope ? scope.text : hcOk ? '' : '직원 수와 전체 인건비 자료가 없는 사례']], x.sw.labor_mode)}</div>
    <div title="가정을 따로 정하지 않은 항목의 기본값에 쓰는 기간"><span>과거 평균 기간</span>${v3Sw(x, 'sw.avg_years', yrs.map((y) => [y, `${y}년`]), +x.sw.avg_years)}</div>
    <div title="${esc(V3R_TIP.share_years)}"><span>판관비 몫 평균 연수</span>${v3Sw(x, 'sw.share_years', [[1, '직전 결산'], [2, '2년'], [3, '3년'], [5, '5년']], Math.trunc(+v3rSwV(x, 'share_years')) || 1)}</div>${frt}</div>`;
  const main = `${v3rAsk(['TTM', '최근 3～5년 평균', '산업 평균', '마케팅 비용', 'R&D 투자', '규모의 경제'])}${v3rTable(T, rows)}${opt}`;

  const n = H + N, labels = v3Years(x, 'hist+fc').map((y) => y.label);
  const ser = v3rStack(R, gs.map((g) => ({ name: gname(g), row: `OPX.sga.${g}` })), n);
  const ch = v3cBars({ w: v3Wd(x, 1, v3rSide(x)), h: 260, labels, bars: ser, stack: true, fc: H, vals: false, fmt: (v) => v3Num(v), lines: [{ name: '판관비율', values: (R['OPX.sga_r'] || []).slice(0, n), cls: 's3' }], title: '판관비 구성과 판관비율' });
  const leg = v3cLegend([...ser.map((s) => ({ label: s.name, cls: s.cls })), { label: '추정', cls: 's2', kind: 'fc' }, { label: '판관비율', cls: 's3', kind: 'line' }]);
  const ref = `<h3 class="v3-h3">판관비 구성과 판관비율</h3>${leg}<div data-o="r3.c1">${ch}</div>
    <div class="v3-two v3r-two"><div><h3 class="v3-h3">시나리오별 판관비율</h3>${v3rScen(x, 'OPX.sga_r', 'r3.s1')}</div><div><h3 class="v3-h3">시나리오별 영업이익률</h3>${v3rScen(x, 'OPX.ebit_m', 'r3.s2')}</div></div>${v3rHcRef(x)}`;
  const hc = v3rHc(x, fit);
  const avg = v3rAvgSec(x, /^(sga_|labor_sga_share$|dep_sga_share$|amort_sga_share$|wage_g$|hc\.|rev_per_hc)/, (k) => { const m = /^sga_(.+)_(pct|g|ratio|val)$/.exec(k); return m ? `${gname(m[1])} ${m[2] === 'pct' ? '매출 대비' : m[2] === 'g' ? '증가율' : ''}`.trim() : v3Lab(x, `CTL.a.${k}`).name; });
  return v3Sec('판관비 묶음', v3rMeta(x), main, 'v3r') + (hc ? v3Sec('인원과 인건비', `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc} 가정, 인원 명, 금액 억원</span>`, hc, 'v3r') : '') + avg + v3Sec('참고 데이터', '<span class="meta">단위 억원</span>', ref, 'v3r');
}

v3Step(1, v3rRev);
v3Step(2, v3rCogs);
v3Step(3, v3rSga);
v3On('click', '[data-v3r-hall]', (el, x) => { const o = (x.st.v3r ||= {}); if (o.hall) delete o.hall; else o.hall = 1; return true; });
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
/* 계산 입력을 바꾸는 단추 묶음. v3Sw와 같은 마크업에 opts [[값, 이름, 못 쓰는 까닭, 툴팁]]의 셋째 값이 있으면 비활성, 넷째 값은 누를 수 있는 단추의 툴팁 */
function v3oSw(x, key, opts, cur) {
  const j = JSON.stringify(cur ?? null);
  return `<div class="mk-seg">${opts.map(([v, l, off, tip]) => { const on = JSON.stringify(v ?? null) === j; return `<button type="button" data-v3-ov="${esc(key)}" data-v="${esc(JSON.stringify(v ?? null))}" class="${on ? 'on' : ''}" aria-pressed="${on}"${off ? ` disabled title="${esc(off)}"` : tip ? ` title="${esc(tip)}"` : ''}>${esc(l)}</button>`; }).join('')}</div>`;
}
v3On('click', '[data-v3o-hall]', (el, x) => { const o = (x.st.v3o ||= {}); if (o.hall) delete o.hall; else o.hall = 1; return true; });
const v3oOpt = (...items) => { const its = items.filter(Boolean); return its.length ? `<div class="v3-opt">${its.map((h) => (h.startsWith('<div') ? h : `<div>${h}</div>`)).join('')}</div>` : ''; };
/* 아주 작은 비율(토지 취득 ÷ 매출 0.00009% 등)이 0.00으로 보이지 않게 그 줄의 입력 칸만 자릿수를 늘려 다시 그림. 값은 가정 행 그대로 */
const v3oDig = (v) => (v3Ok(v) && v !== 0 && Math.abs(v * 100) < 0.005 ? Math.min(7, Math.ceil(-Math.log10(Math.abs(v * 100))) + 1) : 2);
/* 가정 표의 과거 열을 최근 keep 해만 남김(v3ATable 이 만든 표에서 오래된 해의 머리 칸과 과거 값 칸을 뺌) */
function v3oTrimH(x, h, keep) {
  const drop = x.tl.H - keep;
  if (drop <= 0) return h;
  let out = h;
  x.tl.hist.slice(0, drop).forEach((y) => { out = out.replace(`<th>${y}</th>`, ''); });
  return out.replace(/((?:<td class="h">[^<]*<\/td>)+)/g, (m) => m.split('</td>').filter(Boolean).slice(drop).map((t) => `${t}</td>`).join(''));
}
/* 가정 표. 좁은 폭(620 이하)은 과거 열 없이 입력 칸만. 그보다 넓어도 과거 열까지 다 놓으면 추정 연도 입력 칸이 가로 스크롤 뒤로 밀리는 폭이면
   오래된 과거 연도부터 접고 머리 칸의 「이전 연도 펴기」로 다 봄(x.st.v3o.hall. 1～3단계 표와 같은 방식). 열 폭은 이름 184, 과거 64, 입력 88 어림 */
function v3oAT(x, items, opt) {
  const its = items.filter((it) => it && x.R[`CTL.a.${it.key}`]);
  if (!its.length) return '';
  const { H, N } = x.tl, narrow = x.w <= 620, anyH = !narrow && opt?.hist !== false && its.some((it) => it.hist && x.R[it.hist]);
  const keep = anyH ? Math.max(0, Math.min(H, Math.floor((x.w - 50 - v3oSide(x) - 184 - N * 88) / 64))) : H, fold = keep < H, hall = fold && !!x.st.v3o?.hall;
  const first = fold ? `<button type="button" class="v3o-hb" data-v3o-hall aria-pressed="${hall}">${hall ? '이전 연도 접기' : '이전 연도 펴기'}</button>` : '';
  let h = v3ATable(x, its, { ...(opt || {}), ...(narrow || (fold && !hall && !keep) ? { hist: false } : {}), ...(first ? { first } : {}) });
  if (fold && !hall && keep) h = v3oTrimH(x, h, keep);
  const s = opt?.S || x.sc;
  for (const it of its) {
    const id = `CTL.a.${it.key}`, L = v3Lab(x, id), fmt = it.fmt || L.fmt, nm = it.name || L.name, b0 = x.rows0?.[s]?.[id] || [];
    const d = fmt === 'pct' ? Math.max(2, ...b0.map(v3oDig)) : 2;
    if (d <= 2) continue;
    x.tl.fc.forEach((_, i) => {
      const key = v3AKey(x, it.key, i, s), cur = s === x.sc && v3All(x) ? x.st.ov[`a.${it.key}.${s}#${i}`] || x.st.ov[key] : undefined;
      h = h.replace(v3ACell(x, it.key, i, fmt, s, nm), () => v3In(x, key, b0[i], { fmt, cell: true, lab: `${nm} ${x.tl.fc[i]}년`, d, cur }).replace('class="v3-ci"', 'class="v3-ci v3o-wd"'));
    });
  }
  return h;
}
/* 표 칸 값. 없는 열은 빈칸, 값이 없으면 -, 10억 미만 금액은 소수 한 자리 */
function v3oFmt(v, fmt) {
  if (v === undefined) return '';
  if (!v3Ok(v)) return '-';
  if (fmt === 'amt') { const a = Math.abs(v); return a < 0.05 ? '0' : v3Num(v, a < 10 ? 1 : 0); }
  return v3Fmt(v, fmt);
}
/* 검증 줄 칸: 차이가 0이면 「일치」, 어긋나면 주의 색 숫자, 값이 없는 해는 빈칸 */
const v3oChk = (v) => (!v3Ok(v) ? '' : Math.abs(v) > 1e-6 ? `<span class="v3o-out">${v3Num(v, Math.abs(v) < 10 ? 2 : 0)}</span>` : '일치');
/* 과거 열 번호 가운데 ids 행 어느 하나라도 값이 있는 해만(변동표 과거 값, DCF 과거 참고 3년처럼 일부 해만 있는 행의 열 고르기) */
const v3oHx = (x, ids) => { const { H, N } = x.tl, rs = ids.map((id) => x.R[id]).filter((r) => r && r.length === H + N); return x.tl.hist.map((_, i) => i).filter((i) => rs.some((r) => v3Ok(r[i]))); };
const v3oDcfHx = (x) => v3oHx(x, Object.keys(x.R).filter((id) => id.startsWith('DCF.hist.')));
/* 연도 열 결과 표. cols 'hist+fc' | 'fc' | 'dcf', specs [{id, name, fmt, cls, sub, pre: [이름 옆 칸], hist: 과거 칸에 쓸 다른 행, neg: 그 과거 값 부호 뒤집기, nb: 값 없는 과거 칸은 빈칸, ho: 과거 칸만 보임, chk: 검증 줄} | {grp: 묶음 제목}]
   opt.hx: 보여 줄 과거 열 번호(없으면 'hist+fc'는 과거 전부, 'fc'와 'dcf'는 과거 열 없음). 'dcf' 표 앞에 과거 참고 열을 붙일 때 씀
   행이 없으면 그 줄을 건너뜀. 표 전체가 data-o 한 구역이라 입력하는 동안 줄 수가 바뀌어도 따라감 */
function v3oTbl(x, key, cols, specs, { first = '항목', pre = [], hx = null } = {}) {
  const { H, N, M } = x.tl, R = x.R, gap = (n) => new Array(Math.max(0, n)).fill(undefined);
  const hi = hx || (cols === 'hist+fc' ? x.tl.hist.map((_, i) => i) : []), nh = hi.length;
  const ys = [...hi.map((i) => ({ y: x.tl.hist[i], e: false, k: 'h', label: `${x.tl.hist[i]}` })), ...v3Years(x, cols === 'hist+fc' ? 'fc' : cols)];
  const vals = (sp) => {
    const r = R[sp.id], kind = x.lab[sp.id]?.cols || (r.length === H + N ? 'hist+fc' : r.length === N ? 'fc' : 'dcf');
    const f = kind === 'hist+fc' ? r.slice(H) : kind === 'dcf' ? r.slice(0, N) : r;
    const tail = cols === 'dcf' ? (kind === 'dcf' ? r : [...f, ...gap(M + 1)]) : f;
    const hr = kind === 'hist+fc' ? r : sp.hist && R[sp.hist] ? R[sp.hist].slice(0, H).map((v) => (v3Ok(v) && sp.neg ? -v : v)) : null;
    return [...hi.map((i) => (!hr || (sp.nb && !v3Ok(hr[i])) ? undefined : hr[i])), ...(sp.ho ? gap(tail.length) : tail)];
  };
  const bl = (i) => { const j = i - nh; return (nh > 0 && j === 0) || (cols === 'dcf' && ((M > 0 && j === N) || j === N + M)); };
  const out = [];
  for (const sp of specs) {
    if (!sp) continue;
    if (sp.grp) { out.push({ grp: `<tr class="grp"><th class="st">${esc(sp.grp)}</th><td colspan="${pre.length + ys.length}"></td></tr>` }); continue; }
    if (!R[sp.id] || x.lab[sp.id]?.cols === 'one') continue;
    const L = v3Lab(x, sp.id), fmt = sp.fmt || L.fmt, unit = fmt === 'pct' ? '%' : fmt === 'amt' || fmt === 'won' ? '' : V3_UNIT[fmt] || '', vs = vals(sp);
    out.push({ row: `<tr class="${sp.cls || ''}"><td class="st${sp.sub ? ' v3o-sub' : ''}">${esc(sp.name || L.name.replace(/\s*\([^)]*\)\s*$/, ''))}${unit ? `<small>${unit}</small>` : ''}</td>${pre.map((_, i) => `<td>${sp.pre?.[i] ?? ''}</td>`).join('')}${ys.map((y, i) => `<td class="${y.k === 'h' ? 'h' : ''}${bl(i) ? ' bl' : ''}">${sp.chk ? v3oChk(vs[i]) : v3oFmt(vs[i], fmt)}</td>`).join('')}</tr>` });
  }
  const rows = out.filter((o, i) => o.row || (out[i + 1] && out[i + 1].row)).map((o) => o.row || o.grp);
  if (!out.some((o) => o.row)) return '';
  return `<div class="mk-scroll" data-o="v3o-${key}"><table class="mk-tbl v3-t v3o-t"><thead><tr><th class="st">${first}</th>${pre.map((p) => `<th>${p}</th>`).join('')}${ys.map((y, i) => `<th class="${bl(i) ? 'bl' : ''}">${y.label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
/* 표 옆에 띄울 점검 문장(엔진 문장 그대로). 주의와 오류 가운데 단계 머리 경고 줄(00_core V3_CHK_STEP)에 나오는 것은 빼 두 번 보이지 않게 */
const v3oNotes = (x, ids) => (x.res.checks || []).filter((k) => ids.includes(k.id) && k.text && (k.level === 'info' || !V3_CHK_STEP[k.id])).map((k) => `<p class="v3o-note${k.level === 'info' ? '' : ' wn'}">${esc(k.text)}</p>`).join('');
/* 평균에 넣을 해(input.avg_exclude). 엔진(v3eAvgExclude)이 읽는 꼴: 목록이면 모든 평균에서 뺌. dict면 all은 모든 평균에서,
   <가정 키>: {exclude: [...], include: [...]}는 그 가정 평균에서만 더 빼거나(exclude) all에서 빼 둔 해를 다시 넣음(include). 가정 키에 목록을 준 예전 꼴은 exclude.
   화면은 가정마다 「그 가정 평균에서 빠지는 해」 집합으로 읽어 다루고, 보낼 때 all과 견줘 exclude와 include로 다시 나눔(뜻이 같으면 늘 같은 글자라 처음 값으로 돌아오면 덮기가 지워짐).
   어느 가정이 평균을 쓰는지, 평균 창이 어느 해인지, 지금 어느 해가 들어갔는지는 엔진이 낸 notes.avg[가정 키] = {win, used}를 그대로 씀(없는 옛 문서에서는 표를 내지 않음) */
const v3oSortU = (a) => [...new Set(a)].sort((p, q) => p - q);
function v3oExRead(e) {
  const all = v3oSortU(Array.isArray(e) ? e : e && Array.isArray(e.all) ? e.all : []), by = {};
  if (e && typeof e === 'object' && !Array.isArray(e)) for (const [k, v] of Object.entries(e)) {
    if (k === 'all' || v == null || typeof v !== 'object') continue;
    const ex = Array.isArray(v) ? v : v.exclude || [], inc = Array.isArray(v) ? [] : v.include || [];
    by[k] = v3oSortU([...all, ...ex].filter((y) => !inc.includes(y)));
  }
  return { all, by };
}
function v3oExWrite({ all, by }) {
  const out = { all };
  for (const k of Object.keys(by).sort()) {
    const ex = by[k].filter((y) => !all.includes(y)), inc = all.filter((y) => !by[k].includes(y));
    if (ex.length || inc.length) out[k] = { ...(ex.length ? { exclude: ex } : {}), ...(inc.length ? { include: inc } : {}) };
  }
  return out;
}
const v3oAvg = (x) => (x.live ? x.res.notes?.avg : x.c.notes?.avg) || null;
/* 가정 하나의 평균 창과 체크 상태. ign: 창의 모든 해를 빼 엔진이 빼기를 무시한 상태(체크는 설정대로 모두 꺼진 것으로 보여 주고 점검 문장을 붙임) */
function v3oExRow(x, key) {
  const a = v3oAvg(x)?.[key];
  if (!a || !Array.isArray(a.win) || !a.win.length) return null;
  const E = v3oExRead(x.I.avg_exclude), off = E.by[key] || E.all, ign = a.win.every((y) => off.includes(y));
  return { win: a.win, on: ign ? [] : a.used || [], used: a.used || [], ign };
}
const v3oExCk = (x, key, y, on, off) => `<label class="v3-ck v3o-ck"${off ? ` title="${esc(off)}"` : ''}><input type="checkbox" data-v3o-ex="${esc(key)}" data-y="${y}" aria-label="${y}년"${on ? ' checked' : ''}${off || !x.live ? ' disabled' : ''}></label>`;
/* 체크하면 그 가정의 평균에 넣고 끄면 그 가정의 평균에서만 뺌. 다른 가정과 all은 그대로 */
v3On('change', '[data-v3o-ex]', (el, x) => {
  const c = x.c, key = el.dataset.v3oEx, y = +el.dataset.y, cur = v3oExRead(x.I.avg_exclude), set = new Set(cur.by[key] || cur.all);
  if (el.checked) set.delete(y); else set.add(y);
  cur.by[key] = v3oSortU([...set]);
  const nx = v3oExWrite(cur), st = v3St(c);
  if (JSON.stringify(nx) === JSON.stringify(v3oExWrite(v3oExRead(c.input?.avg_exclude)))) delete st.ov['i.avg_exclude']; else st.ov['i.avg_exclude'] = { t: '', v: nx };
  return true;
});
/* 가정별 「평균에 넣을 해」 표. items [{key, name}] 가운데 엔진이 평균을 낸 가정(notes.avg에 있는 키)만 줄로 그림. 줄이 없으면 빈 글자.
   사례 입력에 값이 지정된 가정은 평균을 쓰지 않아 뺌(끝값만 주고 직전 실적을 몰라 평균에서 출발한 가정은 둠). 다른 조각(2, 3단계)도 이 함수를 부름 */
const v3oExAll = (x) => { const ks = (x.res.checks || []).filter((k) => k.id === 'avg_exclude_all').flatMap((k) => (Array.isArray(k.value) ? k.value : [])); return ks.length ? ks : null; };
const v3oExIgn = (x, key, a) => { const ks = v3oExAll(x); return ks ? ks.includes(key) : !!a?.ign; };
function v3oExTbl(x, items) {
  const form = (x.live ? x.res.notes?.form : x.c.notes?.form) || {};
  const its = (items || []).filter(Boolean).map((it) => ({ ...it, a: v3oExRow(x, it.key) })).filter((it) => it.a && (!v3oGiven(x, it.key) || form[it.key]?.miss));
  if (!its.length) return '';
  const ys = v3oSortU(its.flatMap((it) => it.a.win));
  const all = (x.res.checks || []).find((k) => k.id === 'avg_exclude_all')?.text || '';
  const rows = its.map((it) => `<tr><td class="st"${v3oExIgn(x, it.key, it.a) && all ? ` title="${esc(all)}"` : ''}>${esc(it.name || v3Lab(x, `CTL.a.${it.key}`).name)}</td>${ys.map((y) => `<td>${it.a.win.includes(y) ? v3oExCk(x, it.key, y, it.a.on.includes(y)) : ''}</td>`).join('')}</tr>`).join('');
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3o-t v3o-ext"><thead><tr><th class="st">가정</th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${its.some((it) => v3oExIgn(x, it.key, it.a)) ? v3oNotes(x, ['avg_exclude_all']) : ''}`;
}
const v3oChart = (key, title, unit, legend, svg) => `<div class="v3o-ch"><h3 class="v3-h3">${title}${unit ? `<small>${unit}</small>` : ''}</h3>${legend || ''}<div data-o="v3o-${key}">${svg}</div></div>`;

// ---------- 4단계 법인세 ----------
/* 유효세율 평균에 들어가는 해. 평균 창과 사용자가 뺀 해는 엔진의 notes.avg.tax_eff, 엔진이 스스로 뺀 해(법정 세율 대비 0.5배 미만, 1.5배 초과)는 점검 tax_outlier의 값,
   세전 손실인 해는 엔진도 평균에 넣지 않음. state: used 평균에 들어감, ex 사용자가 뺌, old 평균 기간 밖, auto 법정 대비 범위 밖, loss 세전 손실.
   notes.avg가 없는 옛 문서는 state 없이 과거 값만 보여 줌 */
function v3oTaxYears(x) {
  const hist = x.tl.hist, a = v3oExRow(x, 'tax_eff'), T = x.I.market?.tax;
  const ebt = x.R['IS.ebt'] || [], tax = x.R['IS.tax'] || [];
  const drop = (x.res.checks || []).filter((k) => k.id === 'tax_outlier').flatMap((k) => (Array.isArray(k.value) ? k.value : []));
  const stat = (b) => {
    if (!T?.brackets || !(b > 0)) return null;
    let t = 0, lo = 0;
    for (const [up, r] of T.brackets) { t += Math.max((up == null ? b : Math.min(b, up / 1e8)) - lo, 0) * r; if (up != null) lo = up / 1e8; }
    return t * (1 + (T.local || 0)) / b;
  };
  const rows = hist.map((y, i) => {
    const eff = v3Ok(ebt[i]) && v3Ok(tax[i]) && ebt[i] !== 0 ? tax[i] / ebt[i] : null, s = stat(ebt[i]), ratio = eff != null && s ? eff / s : null;
    const bad = eff == null || ebt[i] <= 0 ? 'loss' : drop.includes(y) ? 'auto' : '';
    const state = !a ? '' : !a.win.includes(y) ? 'old' : !a.on.includes(y) ? 'ex' : bad || 'used';
    return { y, i, eff, ratio, state, inavg: !!a && a.used.includes(y) && !bad };
  });
  const used = rows.filter((r) => r.inavg);
  return { rows, a, avg: used.length ? used.reduce((s, r) => s + r.eff, 0) / used.length : null };
}
function v3oStepTax(x, c) {
  const R = x.R, T = x.I.market?.tax, ty = v3oTaxYears(x), given = v3oGiven(x, 'tax_eff');
  const mode = ['statutory', 'marginal'].includes(x.sw.tax_mode) ? x.sw.tax_mode : 'eff_avg';
  // 과거 유효세율과 평균에 넣을 해
  const tip = { old: '평균 기간 밖', auto: '법정 세율 대비 0.5배 미만이거나 1.5배 초과', loss: '세전 손실' };
  const ck = (r) => v3oExCk(x, 'tax_eff', r.y, r.state === 'used', tip[r.state]);
  const tr = (name, f, cls = '', last = ty.a ? '<td class="bl"></td>' : '') => `<tr class="${cls}"><td class="st">${name}</td>${ty.rows.map((r) => `<td>${f(r)}</td>`).join('')}${last}</tr>`;
  const hist = `<div class="mk-scroll"><table class="mk-tbl v3-t v3o-t"><thead><tr><th class="st">항목</th>${ty.rows.map((r) => `<th>${r.y}</th>`).join('')}${ty.a ? '<th class="bl">평균</th>' : ''}</tr></thead><tbody>
    ${tr('세전이익', (r) => v3oFmt((R['IS.ebt'] || [])[r.i] ?? null, 'amt'))}${tr('법인세', (r) => v3oFmt((R['IS.tax'] || [])[r.i] ?? null, 'amt'))}
    ${tr('유효세율<small>%</small>', (r) => v3oFmt(r.eff, 'pct'), 'sum', ty.a ? `<td class="bl" data-o="v3o-taxavg">${v3oFmt(ty.avg, 'pct')}</td>` : '')}
    ${T ? tr('법정 세율 대비<small>배</small>', (r) => `<span class="${r.state === 'auto' ? 'v3o-out' : ''}">${v3oFmt(r.ratio, 'x')}</span>`) : ''}
    ${given || !ty.a ? '' : tr('평균에 넣을 해', ck)}</tbody></table></div>${ty.a && v3oExIgn(x, 'tax_eff', ty.a) && !given ? v3oNotes(x, ['avg_exclude_all']) : ''}`;
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
  const dcf = v3oTbl(x, 'taxdcf', 'dcf', [{ id: 'DCF.tax_r', hist: 'DCF.hist.tax_r', nb: true }, { id: 'DCF.tax', hist: 'DCF.hist.tax', nb: true }], { hx: v3oDcfHx(x) });
  return v3Sec('과거 유효세율', V3O_UNIT, hist, 'v3o')
    + v3Sec('손익 법인세 가정', '', opt + at, 'v3o')
    + v3Sec('법인세 계산', V3O_UNIT, mopt + (calc || '<div class="empty">법인세 계산 행이 없습니다.</div>'), 'v3o')
    + v3Sec('FCFF 세율', V3O_UNIT, fopt + dcf, 'v3o');
}

// ---------- 5단계 재투자 ----------
/* 자산별 변동표(워터폴) 줄 이름. labels 에는 「건물 bop」처럼 영어 꼬리가 붙어 있어 엑셀 시트와 같은 우리말로 바꿔 씀(묶음 이름은 묶음 제목 줄에) */
/* 워터폴 묶음 줄의 순서. 이름은 엔진 labels(「건물 기초」 등)에서 묶음 이름을 떼고 씀(묶음 이름은 묶음 제목 줄에 있음) */
const V3O_PPE = ['bop', 'capex', 'xfer', 'dep', 'oth', 'eop'];
const v3oPpeNm = (x, id, grp) => { const n = v3Lab(x, id).name; return grp && n.startsWith(`${grp} `) ? n.slice(grp.length + 1) : n; };
const v3oPpeCls = (x) => (x.I.ppe_roll?.classes || []).filter((cl) => cl && x.R[`PPE.${cl.id}.eop`]);
/* 워터폴 표 둘: 자산별 변동(묶음마다 기초, 취득, 대체, 상각, 기말. 변동표 과거 값이 있는 해는 과거 열로, 끝에 묶음 합과 재무상태표 차이)과
   감가상각 내역(상각하는 묶음마다 내용연수, 기존 자산 상각, 취득 연도별 상각) */
function v3oWf(x) {
  const R = x.R, cls = v3oPpeCls(x), roll = [], dep = [];
  if (!cls.length) return ['', ''];
  for (const cl of cls) {
    const p = `PPE.${cl.id}.`, nm = cl.name || cl.id, life = v3V(x, `${p}life`);
    roll.push({ grp: nm });
    V3O_PPE.forEach((k) => { const id = p + k; if (R[id] && (k === 'bop' || k === 'eop' || v3oNz(x, id))) roll.push({ id, name: v3oPpeNm(x, id, nm), nb: true, ho: k === 'oth', cls: k === 'eop' ? 'sum' : '' }); });
    if (!R[`${p}dep_exist`]) continue;
    const lt = v3Ok(life) ? `${v3Num(life, Number.isInteger(life) ? 0 : 1)}년` : '';
    dep.push({ grp: nm }, { id: `${p}dep_exist`, name: '기존 자산', pre: [cl.life_src && lt ? `<span class="v3o-res" title="${esc(cl.life_src)}">${lt}</span>` : lt] });
    Object.keys(R).filter((id) => id.startsWith(`${p}dep_v.`) && v3oNz(x, id)).sort().forEach((id) => dep.push({ id, name: `${id.slice(p.length + 6)}년 취득분` }));
    dep.push({ id: `${p}dep`, name: '상각 합계', cls: 'sum' });
  }
  if (R['PPE.check']) roll.push({ grp: '검증' }, { id: 'PPE.check', name: '묶음 합 − 재무상태표', chk: true, nb: true });
  const ids = cls.flatMap((cl) => V3O_PPE.map((k) => `PPE.${cl.id}.${k}`)), hx = v3oHx(x, ids);
  return [v3oTbl(x, 'ppewf', hx.length ? 'hist+fc' : 'fc', roll, hx.length ? { hx } : {}), v3oTbl(x, 'ppedep', 'fc', dep, { pre: ['내용연수'] })];
}
function v3oStepReinv(x, c) {
  const R = x.R, { H, N } = x.tl, side = v3oSide(x);
  // 유형자산. 자산별 변동표 방식은 사례에 유형자산 변동표(ppe_roll)가 있어야 엔진이 씀. 약식(simple)은 CAPEX를 비율 하나로 보고 확장 CAPEX를 쓰지 않음
  const roll = v3oHas(x.I.ppe_roll), pm = x.sw.ppe_mode === 'simple' ? 'simple' : roll && ['auto', 'waterfall'].includes(x.sw.ppe_mode) ? 'waterfall' : 'maint_exp', bp = x.sw.capex_maint_base === 'ppe';
  const wfOff = pm === 'waterfall' ? '' : '자산별 변동표 방식에서만 씀', wfNo = pm === 'waterfall' ? '자산별 변동표 방식에서는 쓰지 않음' : '', vs = ['same', 'half'].includes(x.sw.vintage_start) ? x.sw.vintage_start : 'next';
  const VS = [['next', '다음 해'], ['same', '취득한 해'], ['half', '취득한 해 반년']];
  const wcls = pm === 'waterfall' ? x.I.ppe_roll?.classes || [] : [], hasRou = wcls.some((cl) => cl.id === 'rou'), wfHist = wcls.some((cl) => v3oHas(cl.hist));
  const popt = v3oOpt(`<span>방식</span>${v3oSw(x, 'sw.ppe_mode', [['maint_exp', '유지와 확장 CAPEX'], ['simple', '약식', '', 'CAPEX를 비율 하나로 추정하고 확장 CAPEX는 쓰지 않습니다.'], ['waterfall', '자산별 변동표', roll ? '' : '유형자산 변동표 입력 없음']], pm)}`,
    `<span>${pm === 'simple' ? 'CAPEX 기준' : '유지 CAPEX 기준'}</span>${v3oSw(x, 'sw.capex_maint_base', [['sales', '매출', wfNo], ['ppe', '기초 유형자산', wfNo]], bp ? 'ppe' : 'sales')}`,
    `<span>기존 자산 상각</span>${v3oSw(x, 'sw.exist_dep', [['straight', '정액', wfOff], ['step', '해마다 줄임', wfOff]], x.sw.exist_dep === 'step' ? 'step' : 'straight')}`,
    pm === 'waterfall' && `<span>신규 자산 상각 시작</span>${v3oSw(x, 'sw.vintage_start', VS, vs)}`,
    `<span>내용연수</span>${v3oSw(x, 'sw.life_pick', [['lower', '하한', wfOff], ['mid', '평균', wfOff], ['upper', '상한', wfOff]], ['mid', 'upper'].includes(x.sw.life_pick) ? x.sw.life_pick : 'lower')}`);
  const cwhy = v3Note(x, 'capex_exp') || v3Note(x, 'capex');
  // 확장 CAPEX 드라이버(증설 물량 × 단위 투자비, 출점 수 × 점포당 투자비). 가정 행이 있는 사례만. 드라이버가 있으면 확장 CAPEX = 직접 입력 + 드라이버라 직접 입력 줄 이름을 밝힘
  const drv = pm === 'simple' ? [] : [['capex_capa_add', '설비 능력 증설 물량', x.I.capex?.capa?.unit], ['capex_capa_unit', '증설 물량 1단위 투자비'], ['capex_store_open', '출점 수'], ['capex_store_unit', '점포당 투자비']]
    .filter(([k]) => R[`CTL.a.${k}`]).map(([key, name, sub]) => ({ key, name, sub: sub || '' }));
  const hasDrv = pm !== 'simple' && !!(R['PPE.capex_capa'] || R['PPE.capex_store']), expNm = hasDrv ? '확장 CAPEX 직접 입력' : '확장 CAPEX';
  const cmn = `${pm === 'simple' ? '' : '유지 '}CAPEX ÷ ${bp ? '기초 유형자산' : '매출'}`;
  const wkeys = wcls.filter((cl) => cl.id !== 'rou').map((cl) => ({ key: `capex_${cl.id}_pct`, name: `${cl.name || cl.id} 취득 ÷ 매출` }));
  const pat = v3oAT(x, pm === 'waterfall' ? [{ key: 'capex_exp', name: expNm, why: cwhy }, ...drv, ...wkeys,
    { key: 'cip_xfer_rate', name: '건설중인자산 대체 비율' }, { key: 'cip_to_bldg', name: '대체분 건물 몫' },
    hasRou && { key: 'rou_add_pct', name: '사용권자산 신규 ÷ 매출' }, hasRou && { key: 'rou_add_abs', name: '사용권자산 신규 금액' }] : [
    { key: 'capex_maint_pct', hist: bp ? '' : 'PPE.capex_pct', name: cmn },
    pm !== 'simple' && { key: 'capex_exp', name: expNm, why: cwhy }, ...drv, { key: 'rou_add_pct', name: '사용권자산 신규 ÷ 매출' }, { key: 'rou_add_abs', name: '사용권자산 신규 금액' },
    { key: 'dep_rate', name: '감가상각률' }]);
  // 내용연수: 묶음에 연수가 숫자 하나로 들어 있을 때만 입력 칸(범위로 들어 있으면 위 「내용연수」 단추로 고름)
  // 사용권자산처럼 기존 잔액의 남은 연수(remain_life)를 따로 준 묶음은 그 칸도 같이. 내용연수 근거(life_src)는 이름 툴팁
  const lifeIn = wcls.map((cl, n) => {
    const b0 = x.c.input.ppe_roll?.classes?.[n] || {}, nm = cl.name || cl.id, lab = cl.life_src ? `<span title="${esc(cl.life_src)}">${esc(nm)}</span>` : esc(nm);
    if (!R[`PPE.${cl.id}.life`]) return '';
    return (typeof b0.life === 'number' ? v3F(lab, v3In(x, `i.ppe_roll.classes.${n}.life`, b0.life, { fmt: 'cnt', u: '년', lab: `${nm} 내용연수` })) : '')
      + (typeof b0.remain_life === 'number' ? v3F(`${esc(nm)} 기존 잔액`, v3In(x, `i.ppe_roll.classes.${n}.remain_life`, b0.remain_life, { fmt: 'num', d: 1, u: '년', lab: `${nm} 기존 잔액 남은 연수` })) : '');
  }).join('');
  const ptb = v3oTbl(x, 'ppe', 'hist+fc', [{ id: 'PPE.bop' }, { id: 'PPE.capex', name: '유형 CAPEX' }, pm !== 'simple' && { id: 'PPE.capex_maint', sub: true },
    hasDrv && { id: 'CTL.a.capex_exp', name: '확장 CAPEX 직접 입력', sub: true }, hasDrv && { id: 'PPE.capex_capa', name: '설비 증설 CAPEX', sub: true }, hasDrv && { id: 'PPE.capex_store', name: '출점 CAPEX', sub: true },
    hasDrv && { id: 'PPE.capex_exp', name: '확장 CAPEX', sub: true },
    v3oNz(x, 'PPE.rou_add') && { id: 'PPE.rou_add', name: '사용권자산 신규' }, { id: 'PPE.dep', name: '감가상각비' },
    v3oNz(x, 'PPE.disp') && { id: 'PPE.disp', name: '처분과 대체' }, { id: 'PPE.eop', cls: 'sum' }, { id: 'PPE.capex_da' }]);
  const [wft, wfd] = pm === 'waterfall' ? v3oWf(x) : ['', ''];
  // 무형자산과 연구개발
  const am = x.sw.amort_mode === 'life' ? 'life' : 'rate', C0 = x.c.input.capex || {}, oa = v3oNz(x, 'CTL.a.int_other_add'), rca = !!x.sw.rnd_cap_adj;
  const iopt = v3oOpt(`<span>무형자산 상각</span>${v3oSw(x, 'sw.amort_mode', [['rate', '상각률'], ['life', '내용연수 정액', '', '새로 취득한 무형자산은 내용연수로, 기존 잔액은 남은 연수로 나눠 상각합니다.']], am)}`,
    am === 'life' && `<span>무형자산 내용연수</span>${v3In(x, 'i.capex.int_life', C0.int_life ?? 5, { fmt: 'cnt', u: '년', lab: '무형자산 내용연수' })}`,
    am === 'life' && `<span>기존 잔액 남은 연수</span>${v3Ok(C0.int_remain) ? v3In(x, 'i.capex.int_remain', C0.int_remain, { fmt: 'num', d: 1, u: '년', lab: '기존 잔액 남은 연수' }) : `<span class="v3o-res" data-o="v3o-intrem">${v3Ok(v3V(x, 'CTL.a.int_remain')) ? `${v3Num(v3V(x, 'CTL.a.int_remain'), 1)}년` : '-'}</span>`}`,
    `<span>R&D 자본화 보정</span>${v3oSw(x, 'sw.rnd_cap_adj', [[false, '미적용'], [true, '적용', '', '연구개발비를 자산으로 보고 세후영업이익과 재투자에 같은 금액을 더합니다. FCFF는 그대로이고 ROIC와 전환 기간 재투자가 바뀝니다.']], rca)}`,
    rca && `<span>연구자산 상각 연수</span>${v3In(x, 'i.rnd.cap_life', x.c.input.rnd?.cap_life ?? 5, { fmt: 'cnt', u: '년', lab: '연구자산 상각 연수' })}`,
    oa && `<span>계약관계 상각 연수</span>${v3In(x, 'i.capex.int_other_amort_years', C0.int_other_amort_years ?? 5, { fmt: 'cnt', u: '년', lab: '계약관계 상각 연수' })}`,
    oa && pm !== 'waterfall' && `<span>상각 시작</span>${v3oSw(x, 'sw.vintage_start', VS, vs)}`);
  const iat = v3oAT(x, [{ key: 'rnd_pct', hist: 'RND.pct', name: '연구개발비 ÷ 매출' }, { key: 'rnd_cap_share', name: '연구개발비 자산화 비중' },
    { key: 'int_capex_other_pct', name: '기타 무형자산 취득 ÷ 매출' }, { key: 'amort_rate', name: '무형자산 상각률' }, { key: 'int_other_add', name: '계약관계 등 취득' }]);
  const itb = v3oTbl(x, 'int', 'hist+fc', [{ grp: '연구개발비' }, { id: 'RND.total', name: '총액' }, { id: 'RND.cap', sub: true }, { id: 'RND.exp', sub: true },
    rca && { id: 'ADJ.rnd_asset', name: '자본화 보정 연구자산' }, rca && { id: 'ADJ.rnd_amort', name: '자본화 보정 상각' },
    { grp: '무형자산' }, { id: 'INT.bop', name: '기초' }, { id: 'INT.capex', name: '무형 CAPEX' }, v3oNz(x, 'INT.other_add') && { id: 'INT.other_add' },
    { id: 'INT.amort' }, { id: 'INT.eop', name: '기말', cls: 'sum' }, { id: 'INT.gw' }]);
  // 운전자본. 회전일수와 비율이 사례 입력에 모두 들어 있으면 기준 스위치는 값을 바꾸지 못함
  const nk = ['dso', 'dio', 'dpo', 'oca_pct', 'ocl_pct'].filter((k) => R[`CTL.a.${k}`]), lock = nk.length && nk.every((k) => v3oGiven(x, k)) ? '사례 입력에 지정된 값 사용' : '';
  const na = ['avg3', 'avg5', 'median5'].includes(x.sw.nwc_avg) ? x.sw.nwc_avg : 'last';
  const ne = x.I.nwc_excl, ld = x.I.loan_dep, RO = '입력을 만들 때 정해지는 분류라 여기서는 바꿀 수 없습니다. 바꾸려면 파이썬에서 입력을 다시 받아야 합니다.';
  const nopt = v3oOpt(`<span>가정 기준</span>${v3oSw(x, 'sw.nwc_avg', [['last', '직전 결산', lock], ['avg3', '3년 평균', lock], ['avg5', '5년 평균', lock], ['median5', '5년 중앙값', lock]], na)}`,
    `<span>잔액</span>${v3oSw(x, 'sw.nwc_basis', [['eop', '기말', lock], ['avg', '기초와 기말 평균', lock]], x.sw.nwc_basis === 'avg' ? 'avg' : 'eop')}`,
    v3oHas(ne?.cl) && `<span>${esc((ne.names || []).join(', ') || '당기법인세부채, 미지급배당금')}</span><span class="v3o-res" title="${RO}">${(ne.class || x.sw.taxpay_class) === 'nwc' ? '운전자본에 둠' : '운전자본에서 뺌'}</span>`,
    v3oHas(ld?.ca) && `<span>${esc((ld.names || []).join(', ') || '대여금, 보증금')}</span><span class="v3o-res" title="${RO}">${x.sw.loan_class === 'nonop' ? '비영업자산으로 옮김' : '운전자본에 둠'}</span>`);
  const nat = v3oAT(x, nk.map((k) => ({ key: k, hist: `NWC.${k}` })));
  const ntb = v3oTbl(x, 'nwc', 'hist+fc', [{ id: 'NWC.nwc' }, { id: 'NWC.dnwc' }, { id: 'NWC.nwc_pct' }]);
  // FCFF 재투자
  const rm = ['sales_pct', 'ic_turnover', 's2c'].includes(x.sw.reinv_mode) ? x.sw.reinv_mode : 'schedule';
  const ropt = v3oOpt(`<span>재투자 방식</span>${v3oSw(x, 'sw.reinv_mode', [['schedule', '스케줄'], ['sales_pct', '매출 대비'], ['ic_turnover', '투하자본회전율', '', '그해 매출을 회전율로 나눈 투하자본의 증가분을 재투자로 봅니다.'], ['s2c', '매출 증가분 기준', '', '매출 증가분을 투하자본회전율로 나눈 금액을 재투자로 봅니다.']], rm)}`);
  const rat = rm === 'sales_pct' ? v3oAT(x, [{ key: 'reinv_pct', name: '재투자 ÷ 매출', fmt: 'pct' }], { hist: false }) : rm === 'ic_turnover' || rm === 's2c' ? v3oAT(x, [{ key: 'ic_turnover', name: '투하자본회전율', fmt: 'x' }], { hist: false }) : '';
  const sch = rm === 'schedule';
  // 명시 기간 앞에 과거 참고 열(DCF.hist.*, 값이 있는 해만)
  const rtb = v3oTbl(x, 'reinv', 'dcf', [sch && { id: 'DCF.capex', name: 'CAPEX', hist: 'DCF.hist.capex', nb: true }, sch && { id: 'DCF.da', name: '유무형자산 상각비', hist: 'DCF.hist.da', nb: true },
    sch && { id: 'DCF.dnwc', hist: 'DCF.hist.dnwc', nb: true }, { id: 'DCF.reinv', cls: 'sum', hist: 'DCF.hist.reinv', nb: true }, { id: 'DCF.rr' }, { id: 'DCF.ic' }, { id: 'DCF.roic' }], { hx: v3oDcfHx(x) });
  // 가정별 평균에 넣을 해. 운전자본은 3년, 5년 평균이나 5년 중앙값일 때만 평균을 씀
  // 엔진이 평균을 낸 가정(notes.avg)만 줄이 됨. 지금 방식에서 가정 칸을 보여 주지 않는 가정은 여기서도 뺌
  const ext = v3oExTbl(x, [pm !== 'waterfall' && { key: 'capex_maint_pct', name: cmn }, (pm !== 'waterfall' || hasRou) && { key: 'rou_add_pct', name: '사용권자산 신규 ÷ 매출' }, pm !== 'waterfall' && { key: 'dep_rate', name: '감가상각률' },
    ...(wfHist ? [...wkeys, { key: 'cip_xfer_rate', name: '건설중인자산 대체 비율' }, { key: 'cip_to_bldg', name: '대체분 건물 몫' }] : []),
    x.sw.rnd_mode !== 'linear_to' && { key: 'rnd_pct', name: '연구개발비 ÷ 매출' }, { key: 'rnd_cap_share', name: '연구개발비 자산화 비중' }, { key: 'int_capex_other_pct', name: '기타 무형자산 취득 ÷ 매출' }, { key: 'amort_rate', name: '무형자산 상각률' },
    ...nk.map((k) => ({ key: k })), rm === 'sales_pct' && { key: 'reinv_pct', name: '재투자 ÷ 매출' }]);
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
  return v3Sec('유형자산', V3O_UNIT, popt + pat + (lifeIn ? h3('내용연수') + `<div class="v3-fs">${lifeIn}</div>` : '') + (ptb ? h3('유형자산 변동') + ptb : '') + `<div data-o="v3o-capexdrv">${hasDrv ? v3oNotes(x, ['capex_drv']) : ''}</div>` + (wft ? h3('자산별 변동') + wft : '') + (wfd ? h3('감가상각 내역') + wfd + v3oNotes(x, ['rou_life']) : ''), 'v3o')
    + v3Sec('무형자산과 연구개발', V3O_UNIT, iopt + iat + (itb ? h3('연구개발비와 무형자산 변동') + itb : ''), 'v3o')
    + v3Sec('운전자본', V3O_UNIT, nopt + nat + (ntb ? h3('순운전자본') + ntb : ''), 'v3o')
    + v3Sec('FCFF 재투자', V3O_UNIT, ropt + rat + rtb, 'v3o')
    + (ext ? v3Sec('평균에 넣을 해', '', ext, 'v3o') : '')
    + v3Sec('참고 데이터', '', charts, 'v3o');
}

// ---------- 6단계 재무 구조 ----------
function v3oStepFin(x, c) {
  const R = x.R, { H } = x.tl, D = x.I.debt || {}, side = v3oSide(x);
  // 차입금 트랜치: 행 ID(DEBT.<트랜치>.eop)에서 찾고, 잔액과 증감이 모두 0인 트랜치는 표에서 뺌
  const trs = Object.keys(R).map((id) => /^DEBT\.([^.]+)\.eop$/.exec(id)?.[1]).filter(Boolean);
  const tname = (r) => v3Lab(x, `DEBT.${r}.eop`).name.replace(/\s*기말$/, '');
  const live = (r) => ['bop', 'eop', 'draw', 'new', 'repay', 'conv'].some((k) => v3oNz(x, `DEBT.${r}.${k}`));
  const SUB = { bop: '기초', draw: '신규', new: '신규', repay: '상환', conv: '전환', accr: '비현금 이자', eop: '기말', rate: '이자율', int: '이자비용' };
  const specs = [];
  trs.filter(live).forEach((r) => {
    specs.push({ grp: tname(r) });
    Object.keys(SUB).forEach((k) => { const id = `DEBT.${r}.${k}`; if (R[id] && (k === 'bop' || k === 'eop' || v3oNz(x, id))) specs.push({ id, name: k === 'draw' && /인출/.test(v3Lab(x, id).name) ? '순인출' : SUB[k], cls: k === 'eop' ? 'sum' : '' }); });
  });
  const none = trs.filter((r) => !live(r)).map(tname);
  const dtb = (v3oTbl(x, 'debt', 'hist+fc', specs) || '<div class="empty">차입금이 없습니다.</div>') + `<p class="v3o-note" data-o="v3o-debtnone">${none.length && specs.length ? `잔액 없음: ${esc(none.join(', '))}` : ''}</p>`;
  const plan = x.sw.debt_plan === 'amort' ? 'amort' : x.sw.debt_plan === 'manual' && v3oHas(D.manual) ? 'manual' : 'hold';
  // 운용리스 보정은 약정 입력(input.lease_adj.commit)이 있는 사례에서만 보임
  const lz = v3oHas(x.I.lease_adj?.commit);
  const dopt = v3oOpt(`<span>차입 계획</span>${v3oSw(x, 'sw.debt_plan', [['hold', '잔액 유지'], ['amort', '균등 상환'], ['manual', '연도별 계획', v3oHas(D.manual) ? '' : '연도별 차입 계획 입력 없음']], plan)}`,
    (lz || x.sw.lease_adj) && `<span>운용리스 보정</span>${v3oSw(x, 'sw.lease_adj', [[false, '미적용'], [true, '적용', lz ? '' : '운용리스 약정 입력 없음', '약정 리스료의 현재가치를 부채로 보고 영업이익에 리스료를 더한 뒤 리스자산 상각을 뺍니다.']], !!x.sw.lease_adj)}`);
  const dat = v3oAT(x, [(live('cb') || v3oNz(x, 'CTL.a.cb_convert')) && { key: 'cb_convert', name: '전환사채 전환', why: v3Note(x, 'cb_convert') || v3Note(x, 'debt') },
    (live('lease') || v3oNz(x, 'PPE.rou_add')) && { key: 'lease_repay_rate', name: '리스부채 상환율' }], { hist: false });
  // 이자와 현금
  // 엔진은 int_rate 가 kd, manual 이어도 직전 결산 실효이자율로 계산함(WACC 세전 Kd를 끌어오지 않음). 그래서 「직전 결산」을 눌린 상태로 보여 줌
  const rlock = v3oGiven(x, 'debt_rate') ? '사례 입력에 지정된 값 사용' : '', rm = x.sw.int_rate === 'avg4' ? 'avg4' : 'last';
  const rtip = x.sw.int_rate === 'kd' ? '이 사례 스위치는 kd(WACC 세전 Kd)인데 엔진이 아직 연결하지 않아 직전 결산 실효이자율로 계산합니다.'
    : x.sw.int_rate === 'manual' ? '이 사례 스위치는 manual(직접 입력)이고 엔진은 직전 결산 실효이자율에서 출발합니다. 값은 아래 차입 이자율 가정 칸에서 바꿉니다.' : '';
  const sfl = v3oGiven(x, 'st_fin_release') ? '사례 입력에 지정된 값 사용' : '', sfm = x.sw.st_fin_fwd === 'release' ? 'release' : 'hold';
  const mc0 = x.c.input.debt?.min_cash, mcv = `<span class="v3o-res" data-o="v3o-mincash">${v3Eok(v3V(x, 'DEBT.min_cash'))}</span>`;
  const copt = v3oOpt(`<span>이자율 기준</span>${v3oSw(x, 'sw.int_rate', [['last', '직전 결산', rlock, rtip], ['avg4', '4년 평균', rlock]], rm)}`,
    v3oHas(mc0) ? `<span>최소 현금</span>${v3In(x, 'i.debt.min_cash', mc0, { fmt: 'amt', lab: '최소 현금' })}` : `<span>최소 현금 ÷ 매출</span>${v3In(x, 'sw.min_cash', x.c.switches.min_cash, { fmt: 'pct', lab: '최소 현금 ÷ 매출' })}${mcv}`,
    `<span>리볼버</span>${v3oSw(x, 'sw.revolver', [['on', '사용'], ['off', '미사용']], x.sw.revolver === 'on' ? 'on' : 'off')}`,
    `<span>순환 계산</span>${v3oSw(x, 'sw.circuit', [[1, '사용'], [0, '미사용']], Math.trunc(+x.sw.circuit) === 1 ? 1 : 0)}`,
    v3oNz(x, 'BS.st_fin') && `<span>단기금융자산</span>${v3oSw(x, 'sw.st_fin_fwd', [['hold', '잔액 유지', sfl], ['release', '명시 기간에 나눠 현금화', sfl, '직전 결산 잔액을 명시 기간에 똑같이 나눠 현금으로 돌립니다.']], sfm)}`);
  // 트랜치별 이자율: 사례 입력에 따로 준 트랜치(가정 debt_rate.<트랜치>)는 가정 표의 연도 칸으로, 나머지는 값 하나(세 시나리오 공통, 덮기 a.debt_rate.<트랜치>.*)
  const py0 = x.c.py?.rows?.[x.sc] || {}, tgiven = (r) => !!py0[`CTL.a.debt_rate.${r}`], rateR = x.R['CTL.a.debt_rate'] || [], rateU = rateR.every((v) => v3Ok(v) && Math.abs(v - rateR[0]) < 1e-9), rate0 = rateU ? rateR[0] : null;
  const cat = v3oAT(x, [{ key: 'debt_rate', hist: 'DEBT.rate', name: '차입 이자율' }, ...trs.filter(tgiven).map((r) => ({ key: `debt_rate.${r}`, name: `${tname(r)} 이자율` })),
    { key: 'cash_rate', hist: 'DEBT.cash_rate', name: '예금 이자율' }, { key: 'st_fin_release', name: '단기금융자산 현금화' }]);
  const trIn = trs.filter((r) => live(r) && !tgiven(r) && R[`DEBT.${r}.rate`]).map((r) => v3F(rateU ? esc(tname(r)) : `<span title="차입 이자율이 해마다 달라 이 트랜치도 해마다 그 값을 따릅니다. 값을 넣으면 전 기간 그 이자율로 계산합니다.">${esc(tname(r))}</span>`, v3In(x, `a.debt_rate.${r}.*`, rate0, { fmt: 'pct', d: 2, lab: `${tname(r)} 이자율`, ph: rateU ? '' : '연도별' }))).join('');
  // 배당과 자본
  const dm = x.sw.div_mode === 'none' ? 'none' : x.sw.div_mode === 'dps' ? 'dps' : 'payout', bm = x.sw.buyback_mode === 'ni_ratio' ? 'ni_ratio' : 'plan';
  const eopt = v3oOpt(`<span>배당</span>${v3oSw(x, 'sw.div_mode', [['payout', '배당성향'], ['dps', '주당 배당', v3oHas(D.dps) ? '' : '주당 배당 입력 없음'], ['none', '없음']], dm)}`,
    `<span>자사주 매입</span>${v3oSw(x, 'sw.buyback_mode', [['plan', '계획 금액'], ['ni_ratio', '순이익 비율']], bm)}`);
  const eat = v3oAT(x, [dm === 'payout' && { key: 'payout', hist: 'EQ.payout', name: '배당성향' },
    bm === 'ni_ratio' ? { key: 'buyback', name: '자사주 매입 ÷ 순이익', fmt: 'pct' } : { key: 'buyback', name: '자사주 매입', fmt: 'amt' },
    { key: 'equity_iss', name: '유상증자' }, { key: 'nci_share', name: '비지배지분 몫' }]);
  const ext = v3oExTbl(x, [dm === 'payout' && { key: 'payout', name: '배당성향' }, bm === 'ni_ratio' && { key: 'buyback', name: '자사주 매입 ÷ 순이익' }, { key: 'nci_share', name: '비지배지분 몫' }]);
  // 결과와 차트
  const res = v3oTbl(x, 'fin', 'hist+fc', [{ id: 'BS.cash', name: '현금' }, v3oNz(x, 'BS.st_fin') && { id: 'BS.st_fin', name: '단기금융자산' }, { id: 'DEBT.ibd', name: '이자부부채' }, { id: 'DEBT.int_exp', name: '이자비용' }, { id: 'DEBT.int_inc' },
    { id: 'IS.ni', cls: 'sum' }, { id: 'EQ.div', hist: 'CF.div', neg: true }, v3oNz(x, 'EQ.buyback') && { id: 'EQ.buyback', hist: 'CF.buyback', neg: true }, { id: 'EQ.re_eop', name: '이익잉여금', hist: 'BS.re' },
    v3oNz(x, 'EQ.treasury') && { id: 'EQ.treasury', name: '자기주식', hist: 'BS.treasury' }]);
  const chart = v3cBars({ w: v3Wd(x, 1, side), h: 240, labels: v3Years(x, 'hist+fc').map((y) => y.label), fc: H,
    bars: [{ name: '현금', cls: 's1', values: R['BS.cash'] || [] }, { name: '이자부부채', cls: 's5', values: R['DEBT.ibd'] || [] }] });
  return v3Sec('차입금', V3O_UNIT, dopt + dat + `<h3 class="v3-h3">트랜치별 잔액</h3>` + dtb, 'v3o')
    + v3Sec('이자와 현금', '', copt + cat + (trIn ? `<h3 class="v3-h3">트랜치별 이자율</h3><div class="v3-fs">${trIn}</div>` : ''), 'v3o')
    + v3Sec('배당과 자본', V3O_UNIT, eopt + eat, 'v3o')
    + (ext ? v3Sec('평균에 넣을 해', '', ext, 'v3o') : '')
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
const V3W_RF = { avg_3m: '3개월 평균', spot: '기준일', avg_1y: '1년 평균', avg_2y: '2년 평균', manual: '직접 입력' };
const V3W_RF_ORD = ['avg_3m', 'spot', 'avg_1y', 'avg_2y', 'manual']; // 고른 선택지 값이 없을 때 엔진(step_macro)이 대신 쓰는 순서
const V3W_IDX = { KQ11: 'KOSDAQ', KS11: 'KOSPI' };
const V3W_IMP = { earnings_yield: '이익수익률', dividend_growth: '배당 성장', two_stage: '지수 DCF' };
const V3W_KE = { capm: ['CAPM', ''], bond_rp: ['타인자본비용 + 가산', '세전 타인자본비용에 가산을 더합니다.'], ff3: ['3요인', '3요인(CAPM + SMB, HML 가산)'], firm_prem: ['기업 고유 프리미엄', 'CAPM + 기업 고유 프리미엄 + ESG 가산'] };
const v3wTenor = (t) => { const m = /^(?:(\d+)y)?(?:(\d+)m)?$/.exec(String(t)); return m && (m[1] || m[2]) ? [m[1] ? `${m[1]}년` : '', m[2] ? `${m[2]}개월` : ''].filter(Boolean).join(' ') : String(t); };
const V3W_ERP = { damodaran: 'Damodaran 국가 등급', damodaran_cds: 'Damodaran CDS', implied_kospi: 'KOSPI 내재', historical: '과거 평균', manual: '사례 입력' };
const V3W_ERP_K = { damodaran: 'total', damodaran_cds: 'total_cds', implied_kospi: 'implied', historical: 'historical', manual: 'manual' };
const V3W_MCAP = { spot: '기준일', avg1y: '1년 평균', avg2y: '2년 평균' };
const V3W_TIP = {
  fcff: 'FCFF = 세후영업이익 + 상각비 − CAPEX − 순운전자본 증가(이자 지급 전). 현금흐름표로 구한 FCF나 Bloomberg 같은 데이터 서비스의 FCF는 정의가 달라 값이 다를 수 있습니다.',
  years: (N, M) => `증권사 DCF의 추정 연수는 성숙 업종 5～6년, 소비재 7～8년, 플랫폼과 게임 9～10년, 바이오 11년 안팎입니다(KB증권 리포트 사례). 지금은 명시 ${N}년, 전환 ${M}년입니다.`,
  de: (kd, ke) => `세후 타인자본비용(${kd})이 자기자본비용(${ke})보다 낮아 부채 비중이 높을수록 WACC가 내려갑니다. 차입이 많아지면 베타와 신용 스프레드가 올라 다시 오릅니다(U자).`,
};
const V3W_FADE = [['DCF.rev', '매출'], ['DCF.g', '성장률'], ['DCF.ebit', '영업이익'], ['DCF.margin', '영업이익률'], ['DCF.tax_r', '세율'], ['DCF.nopat', '세후영업이익'], ['DCF.reinv', '재투자'], ['DCF.rr', '재투자율'],
  ['DCF.roic', 'ROIC'], ['DCF.fcff', 'FCFF', 'sum', V3W_TIP.fcff], ['DCF.wacc_t', '할인율'], ['DCF.df', '할인계수'], ['DCF.pv', '현재가치']];
const v3wJ = (v) => JSON.stringify(v ?? null);
const v3wP1 = (v) => v3Pct(v, 1);
const v3wP2 = (v) => v3Pct(v, 2);
const v3wB = (v, d = 3) => v3Num(v, d);
const v3wN = (v) => (v3Ok(v) ? String(+(+v).toFixed(2)) : '-');
const v3wWin = (k) => V3W_WIN[k] || String(k);
const v3wChk = (x, id) => (x.res.checks || []).filter((k) => k.id === id);
/* 섹션 안에 띄울 점검: 주의와 오류는 단계 머리 경고 줄(00_core V3_CHK_STEP)에 이미 나오므로 거기 없는 것만 */
const v3wChkS = (x, id) => v3wChk(x, id).filter((k) => k.level === 'info' || !V3_CHK_STEP[k.id]);
const v3wPeers = (x) => x.I.beta?.peers || [];
const v3wSide = (x) => (x.w >= 1000 ? 316 : 0);

/* 선택 단추 묶음(v3Sw와 같은 마크업). opts [[값, 이름, 못 쓰는지, 툴팁]]. 못 쓰는 선택지를 사례가 이미 골랐으면 눌린 채 흐리게(na).
   man {key, val, fmt, d, on = 'manual'}: on 값 단추를 누르면 val을 key에 채우고, 다른 단추를 누르면 key 덮기를 지움 */
function v3wSw(x, key, opts, cur, man) {
  const j = v3wJ(cur);
  return `<div class="mk-seg v3w-seg">${opts.filter(Boolean).map(([v, l, off, tip]) => {
    const on = v3wJ(v) === j, mo = man && v === (man.on || 'manual');
    const a = man ? `data-v3w-pick="${esc(key)}" data-mk="${esc(man.key)}"${mo ? ' data-mo' : ''}${mo && v3Ok(man.val) ? ` data-mt="${esc(v3Fi(man.val, man.fmt, man.d))}" data-sc="${man.fmt === 'pct' ? 100 : 1}"` : ''}` : `data-v3-ov="${esc(key)}"`;
    return `<button type="button" ${a} data-v="${esc(v3wJ(v))}" class="${on ? 'on' : ''}${on && off ? ' na' : ''}" aria-pressed="${on}"${off && !on ? ' disabled' : ''}${tip ? ` title="${esc(tip)}"` : ''}>${esc(l)}</button>`;
  }).join('')}</div>`;
}
/* 접어 두는 참고 표: 단추를 누르면 x.st.wf[키]가 바뀌고 다시 그림 */
const v3wFoldOn = (x, k) => !!x.st.wf?.[k];
const v3wFold = (x, k, name, html) => `<div class="v3w-fold"><button class="btn ghost sm" type="button" data-v3w-fold="${esc(k)}" aria-expanded="${v3wFoldOn(x, k)}">${esc(name)} ${v3wFoldOn(x, k) ? '접기' : '펴기'}</button>${v3wFoldOn(x, k) ? html : ''}</div>`;
function v3wSel(x, key, opts, cur, lab) {
  const j = v3wJ(cur);
  return `<select class="select v3w-sel ${x.st.ov[key] ? 'chg' : ''}" data-v3w-sel="${esc(key)}" aria-label="${esc(lab)}">${opts.map(([v, l, off]) => `<option value="${esc(v3wJ(v))}"${v3wJ(v) === j ? ' selected' : ''}${off && v3wJ(v) !== j ? ' disabled' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
const v3wMan = (x, key, fmt, d, lab) => v3In(x, key, v3Base(x.c, key) ?? null, { fmt, d, lab });
const v3wOpt = (items, cls = '') => `<div class="v3-opt v3w-opt ${cls}">${items.filter(Boolean).map(([l, h]) => `<div><span>${l}</span>${h}</div>`).join('')}</div>`;
/* 식을 보여 주는 표: 항목, 값, 근거 세 열. rows [[이름, 값 html, 근거 글, 줄 클래스, 줄 툴팁]]. o는 다시 계산할 때 바뀔 구역 키(없으면 바깥에서 감쌈) */
function v3wFt(o, rows) {
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-ft"><thead><tr><th class="st">항목</th><th>값</th><th class="tx">근거</th></tr></thead><tbody${o ? ` data-o="${o}"` : ''}>${rows.filter(Boolean).map(([n, v, w, cls, tip]) => `<tr class="${cls || ''}"${tip ? ` title="${esc(tip)}"` : ''}><td class="st">${esc(n)}</td><td>${v}</td><td class="tx">${esc(w || '')}</td></tr>`).join('')}</tbody></table></div>`;
}
const v3wNotes = (o, list) => `<div data-o="${o}" class="v3w-notes">${list.filter(Boolean).map(([t, lv]) => `<p class="v3w-note ${lv || ''}">${esc(t)}</p>`).join('')}</div>`;

v3On('click', '[data-v3w-pick]', (el, x) => {
  const mk = el.dataset.mk, mt = el.dataset.mt;
  v3SetOv(x.c, el.dataset.v3wPick, JSON.parse(el.dataset.v));
  if (el.dataset.mo == null) delete x.st.ov[mk];
  else if (mt != null && !x.st.ov[mk] && v3Base(x.c, mk) == null) v3SetOv(x.c, mk, +mt / (+el.dataset.sc || 1), mt);
  return true;
});
v3On('click', '[data-v3w-fold]', (el, x) => { const k = el.dataset.v3wFold; x.st.wf = { ...(x.st.wf || {}), [k]: x.st.wf?.[k] ? 0 : 1 }; return true; });
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
  const opts = Object.entries(V3W_RF).filter(([v]) => v !== 'manual' || k === 'manual' || v3Ok(rf.manual)).map(([v, l]) => [v, v3Ok(rf[v]) ? `${l} ${v3wP2(rf[v])}` : l, !v3Ok(rf[v])]);
  const kk = v3Ok(rf[k]) ? k : V3W_RF_ORD.find((q) => v3Ok(rf[q]));
  const b0 = kk ? rf[kk] - (x.sw.rf_cds ? +m.cds || 0 : 0) : null;
  return v3Sec('무위험이자율', `<span class="meta">국고채 10년${asof ? `, ${esc(String(asof).slice(0, 10))} 기준` : ''}</span>`,
    `<div class="v3w-st">${v3wOpt([['기간', v3wSw(x, 'sw.rf', opts, k)], ['적용 값', v3In(x, 'm.rf', b0, { fmt: 'pct', d: 2, lab: '무위험이자율' })]])}${v3wNotes('w7rn', v3wChkS(x, 'rf_fallback').map((c) => [c.text, c.level === 'err' ? 'err' : 'warn']))}</div>`);
}
/* 자동일 때 엔진이 고르는 쪽(step_wacc와 같은 규칙: 상장 2년 이상이고 자본구조 변경이 없으면 회귀) */
function v3wBetaUsed(x) {
  const B = x.I.beta || {}, mode = x.sw.beta_mode, reg = v3V(x, 'WACC.beta_reg'), bu = v3V(x, 'WACC.beta_bu');
  let u = mode !== 'auto' ? mode : (+B.listed_years || 0) >= 2 && !B.capital_change && v3Ok(reg) ? 'regression' : 'bottom_up';
  if ((u === 'regression' && !v3Ok(reg)) || (u === 'bottom_up' && !v3Ok(bu))) u = v3Ok(bu) ? 'bottom_up' : v3Ok(reg) ? 'regression' : u;
  return u;
}
function v3wBetaSec(x) {
  const B = x.I.beta || {}, sw = x.sw, peers = v3wPeers(x), win = sw.beta_window, w = +sw.beta_adj_w, V = (id) => v3V(x, id);
  /* 기준 지수가 KOSPI면 엔진(step_wacc)처럼 KOSPI 회귀 값을 보여 주고, 그 값이 없는 회사는 상장 시장 값 */
  const kospi = sw.beta_index === 'kospi', hasK = !!B.target_kospi && Object.keys(B.target_kospi).length > 0, tgt = (kospi && hasK ? B.target_kospi : B.target) || {};
  const rawSrc = (p) => (kospi && p.raw_kospi != null ? p.raw_kospi : p.raw), rawOf = (p, k) => { const r = rawSrc(p); return r != null && typeof r === 'object' ? r[k] : r; }, inc = (p) => (p.include === undefined ? true : !!p.include);
  const wins = [...new Set([...Object.keys(tgt), ...peers.flatMap((p) => (p.raw != null && typeof p.raw === 'object' ? Object.keys(p.raw) : []))])];
  const utax = sw.beta_u_tax || 'input', showTax = utax !== 'input' && peers.some((p) => v3Ok(V(`WACC.tax_u.${p.code ?? p.name}`)));
  const used = v3wBetaUsed(x), reg = V('WACC.beta_reg'), bu = V('WACC.beta_bu'), beta = V('WACC.beta'), fl = sw.beta_floor, tm = V('WACC.t_m'), au = sw.beta_adj_on === 'unlevered';
  const modes = [['auto', '자동'], ['regression', '회귀', !v3Ok(reg)], ['bottom_up', '바텀업', !v3Ok(bu)], ['manual', '직접 입력']];
  const top = v3wOpt([['방식', v3wSw(x, 'sw.beta_mode', modes, sw.beta_mode, { key: 'i.beta.manual', val: beta, fmt: 'num', d: 2 })],
    sw.beta_mode === 'manual' ? ['베타', v3wMan(x, 'i.beta.manual', 'num', 2, '베타 직접 입력')] : null,
    wins.length ? ['회귀 창', v3wSw(x, 'sw.beta_window', wins.map((k) => [k, v3wWin(k), !(v3Ok(tgt[k]?.raw) || peers.some((p) => v3Ok(rawOf(p, k))))]), win)] : null,
    ['기준 지수', v3wSw(x, 'sw.beta_index', [['listing', '상장 시장'], ['kospi', 'KOSPI', !hasK]], kospi ? 'kospi' : 'listing')]]);
  const regRows = wins.filter((k) => tgt[k]).map((k) => {
    const t = tgt[k];
    return `<tr class="${k === win ? 'v3w-on' : ''}"><td class="st">${esc(v3wWin(k))}</td><td>${v3wB(t.raw)}</td><td>${v3wB(t.se)}</td><td>${v3wB(t.r2, 2)}</td><td>${v3Num(t.n)}</td><td>${Array.isArray(t.ci95) ? `${v3wB(t.ci95[0], 2)}～${v3wB(t.ci95[1], 2)}` : '-'}</td></tr>`;
  }).join('');
  const regTbl = regRows ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-rt"><thead><tr><th class="st">창</th><th>원 베타</th><th>표준오차</th><th>R²</th><th>관측수</th><th>95% 구간</th></tr></thead><tbody>${regRows}</tbody></table></div>`
    : '<div class="empty">회귀 베타 자료가 없습니다.</div>';
  const n = peers.filter((p) => inc(p) && v3Ok(rawOf(p, win))).length;
  const peerRows = peers.map((p, i) => {
    const r = rawOf(p, win), on = inc(p);
    return `<tr class="${on ? '' : 'v3w-off'}"><td class="st">${v3Chk(x, `i.beta.peers.${i}.include`, on, esc(p.name || p.code || '') + (p.self ? '<i class="chip v3w-self">대상</i>' : ''))}</td><td>${v3wB(r)}</td><td data-o="w7pa${i}">${v3Ok(r) ? v3wB(r * w + (1 - w)) : '-'}</td><td>${v3wP1(p.de)}</td>${showTax ? `<td data-o="w7pt${i}">${on ? v3wP1(V(`WACC.tax_u.${p.code ?? p.name}`)) : '-'}</td>` : ''}<td data-o="w7pu${i}">${on ? v3wB(V(`WACC.beta_u.${p.code ?? p.name}`)) : '-'}</td></tr>`;
  }).join('');
  const peerTbl = peers.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-pt"><thead><tr><th class="st">회사</th><th>원 베타</th><th>조정 베타</th><th>D/E</th>${showTax ? '<th>세율</th>' : ''}<th>무차입 베타</th></tr></thead><tbody>${peerRows}
      <tr class="sum" data-o="w7pf"><td class="st">포함 ${n}곳 ${V3W_STAT[sw.beta_stat] || ''}</td><td></td><td></td><td></td>${showTax ? '<td></td>' : ''}<td>${v3wB(V('WACC.beta_u_peer'))}</td></tr></tbody></table></div>`
    : '<div class="empty">비교기업 베타 자료가 없습니다.</div>';
  const calc = used === 'regression' ? reg : bu, floored = fl != null && used !== 'manual' && v3Ok(calc) && calc < +fl;
  const flText = floored ? (v3wChk(x, 'beta_floor')[0]?.text || `베타 하한 ${v3wN(fl)} 적용`) : '';
  const lev = '× (1 + (1 − 한계세율) × 목표 D/E)';
  const ft = v3wFt('w7b', [
    ['원 베타', v3wB(V('WACC.beta_raw')), `${x.t.name || ''} ${v3wWin(win)} 회귀${kospi && hasK ? ', KOSPI 기준' : ''}`.trim()],
    ['조정 베타', v3wB(V('WACC.beta_adj')), `원 베타 × ${v3wP1(w)} + 1 × ${v3wP1(1 - w)}`],
    ['무차입 베타', v3wB(V('WACC.beta_u')), au ? '무차입한 원 베타에 조정 적용' : `조정 베타 ÷ (1 + (1 − 한계세율 ${v3wP1(tm)}) × D/E ${v3wP1(V('WACC.de'))})`],
    ['비교기업 무차입 베타', v3wB(V('WACC.beta_u_peer')), `포함 ${n}곳 ${V3W_STAT[sw.beta_stat] || ''}`],
    ['목표 D/E', v3wP1(V('WACC.de_target')), { current: '현재 자본구조', peer_median: '비교기업 D/E 중앙값', manual: '직접 입력' }[sw.cap_struct] || ''],
    ['회귀 재차입 베타', v3wB(reg), `무차입 베타 ${lev}`, used === 'regression' ? 'v3w-on' : ''],
    ['바텀업 재차입 베타', v3wB(bu), `비교기업 무차입 베타 ${lev}`, used === 'bottom_up' ? 'v3w-on' : ''],
    ['적용 베타', v3wB(beta), [sw.beta_mode === 'auto' ? `${V3W_BETA[used] || used} 자동 선택` : V3W_BETA[used] || used, flText].filter(Boolean).join(', '), 'sum']]);
  const adj = v3wOpt([['조정 비중', v3In(x, 'sw.beta_adj_w', x.c.switches.beta_adj_w, { fmt: 'pct', d: 2, lab: '조정 비중' })],
    ['하한', `${v3In(x, 'sw.beta_floor', x.c.switches.beta_floor ?? null, { fmt: 'num', d: 2, lab: '베타 하한', dis: fl == null })}<label class="v3-ck"><input type="checkbox" data-v3w-floor${fl == null ? ' checked' : ''}><span>하한 없음</span></label>`]]);
  /* 가격 표가 있으면 엔진이 고른 베타 기간과 지수의 표로 수익률과 기울기를 다시 계산해 둠(WACC.ret.n, WACC.ret.slope). 어느 표로 계산했는지는 결과의 wacc_matrix.px.
     표가 하나뿐인 옛 문서는 스위치를 못 따라가고(px.follow = false) 엔진이 beta_px_basis 문장을 냄 */
  const pxm = x.res.wacc_matrix?.px || null, rn = V('WACC.ret.n'), rs = V('WACC.ret.slope');
  const pxBase = pxm ? [pxm.window ? v3wWin(pxm.window) : '', pxm.index ? V3W_IDX[pxm.index] || pxm.index : ''].filter(Boolean).join(', ') : '';
  const pxNote = v3wNotes('w7px', [v3Ok(rn) && v3Ok(rs) ? [`주가와 지수 표본점 ${v3Num(rn)}개, 다시 계산한 원 베타 ${v3wB(rs)}${pxBase ? `(${pxBase} 기준)` : ''}`, ''] : null,
    ...['beta_px_basis', 'beta_px_tie', 'beta_index'].flatMap((id) => v3wChkS(x, id).map((k) => [k.text, k.level === 'info' ? '' : 'warn']))]);
  const utaxOpt = [['input', '입력 세율'], ['own', '회사별 구간 세율'], ['target', '대상 한계세율']];
  return v3Sec('베타', '', `<div class="v3w-st">${top}
    <h3 class="v3-h3">회귀 베타<small>${esc(x.t.name || '')}</small></h3>${regTbl}${pxNote}
    <div class="v3w-hd"><h3 class="v3-h3">바텀업 비교기업</h3>${v3wOpt([['대표값', v3wSw(x, 'sw.beta_stat', Object.entries(V3W_STAT), sw.beta_stat)], ['무차입 세율', v3wSw(x, 'sw.beta_u_tax', utaxOpt, utax)]])}</div>${peerTbl}${v3wNotes('w7ps', v3wChkS(x, 'peer_self').map((k) => [k.text, k.level === 'info' ? '' : 'warn']))}
    <div class="v3w-hd"><h3 class="v3-h3">적용 베타</h3>${adj}</div>${ft}</div>`);
}
function v3wErpSec(x) {
  const m = x.I.market || {}, e = m.erp || {}, k = x.sw.erp, EK = V3W_ERP_K;
  const is = e.implied_src || null, it = e.implied_table || null;
  const itip = is ? [[is.as_of ? `${is.as_of} 기준` : '', v3Ok(is.kospi) ? `KOSPI ${v3Num(is.kospi, 2)}` : '', v3Ok(is.per) ? `PER ${v3Num(is.per, 2)}배` : '', v3Ok(is.rf) ? `국고채 10년 ${v3wP2(is.rf)}` : ''].filter(Boolean).join(', '), is.note || ''].filter(Boolean).join('. ') : '';
  const opts = Object.entries(V3W_ERP).filter(([v]) => v !== 'manual' || k === 'manual' || v3Ok(e.manual)).map(([v, l]) => [v, v3Ok(e[EK[v]]) ? `${l} ${v3wP2(e[EK[v]])}` : l, !v3Ok(e[EK[v]]), v === 'implied_kospi' ? itip : '']);
  const itRows = it ? Object.keys(V3W_IMP).filter((q) => it[q] && v3Ok(it[q].erp)) : [];
  const itTbl = itRows.length ? v3wFold(x, 'erpi', '방법별 내재 프리미엄', `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-wt"><thead><tr><th class="st">방법</th><th>기대수익률</th><th>내재 프리미엄</th></tr></thead><tbody>${itRows.map((q) => `<tr class="${is?.pick === q ? 'v3w-on' : ''}"><td class="st"${is?.formula && typeof is.formula === 'object' && is.formula[q] ? ` title="${esc(is.formula[q])}"` : ''}>${V3W_IMP[q]}</td><td>${v3wP2(it[q].r)}</td><td>${v3wP2(it[q].erp)}</td></tr>`).join('')}</tbody></table></div>${is?.note ? `<p class="v3w-note">${esc(is.note)}</p>` : ''}`) : '';
  const b0 = v3Ok(e[EK[k]]) ? e[EK[k]] : null, erp = v3V(x, 'WACC.erp'), asof = typeof m.as_of === 'object' ? m.as_of?.erp : '';
  const dam = x.ov['m.erp'] == null && (k === 'damodaran' || k === 'damodaran_cds') && v3Ok(e.mature) && v3Ok(erp);
  const ft = dam ? v3wFt('', [['성숙시장 프리미엄', v3wP2(e.mature), 'Damodaran 성숙시장'], ['국가위험 프리미엄', v3wP2(erp - e.mature), k === 'damodaran' ? '한국 국가 등급 기준' : '한국 CDS 기준'],
    ['주식위험프리미엄', v3wP2(erp), '성숙시장 프리미엄 + 국가위험 프리미엄', 'sum']]) : '';
  return v3Sec('주식위험프리미엄', /^\d{4}-\d{2}-\d{2}/.test(asof || '') ? `<span class="meta">${esc(asof.slice(0, 10))} 기준</span>` : '',
    `<div class="v3w-st">${v3wOpt([['출처', v3wSw(x, 'sw.erp', opts, k)], ['적용 값', v3In(x, 'm.erp', b0, { fmt: 'pct', d: 2, lab: '주식위험프리미엄' })]])}${v3wNotes('w7en', v3wChkS(x, 'erp_fallback').map((c) => [c.text, 'warn']))}<div data-o="w7e">${ft}</div>${itTbl}</div>`);
}
function v3wPremSec(x) {
  const s = x.c.switches, ck = v3wChk(x, 'premium_evidence')[0];
  const firm = x.sw.ke_model === 'firm_prem', po = v3wChkS(x, 'prem_overlap').map((c) => [c.text, 'warn']);
  const ins = [['규모', 'prem_size'], ['개별', 'prem_spec'], ['국가', 'prem_country']].map(([l, k]) => { const off = firm && k !== 'prem_country'; return v3F(l, v3In(x, `sw.${k}`, s[k] ?? 0, { fmt: 'pct', d: 2, lab: `${l} 프리미엄`, dis: off }), off ? 'v3w-na' : ''); }).join('');
  return v3Sec('추가 위험', `<span class="meta" data-o="w7pm">${firm || v3Ok(v3V(x, 'WACC.ff3.smb')) ? '적용 합계' : '합계'} ${v3wP2(v3V(x, 'WACC.prem'))}</span>`, `<div class="v3w-st"><div class="v3-fs">${ins}</div>${v3wNotes('w7pn', [ck ? [ck.text, 'warn'] : null, ...po, firm && !v3wChk(x, 'prem_overlap').length ? ['규모, 개별 프리미엄은 기업 고유 프리미엄에 담겨 더하지 않습니다.', ''] : null])}</div>`);
}
function v3wKeSec(x) {
  const V = (id) => v3V(x, id), rf = v3wP2(V('WACC.rf')), erp = v3wP2(V('WACC.erp')), pr = v3wP2(V('WACC.prem')), km = x.sw.ke_model || 'capm', brp = km === 'bond_rp', rp = x.sw.ke_bond_rp ?? 0.04;
  const mk = x.I.market?.ff3 || {}, fb = x.I.beta?.ff3 || {}, ffOk = [mk.smb, mk.hml, fb.smb, fb.hml].every((v) => v3Ok(v));
  const smb = V('WACC.ff3.smb'), hml = V('WACC.ff3.hml'), firm = V('WACC.firm_prem'), kc = V('WACC.ke_capm'), ff = km === 'ff3' && v3Ok(smb) && v3Ok(hml), fp = km === 'firm_prem' && v3Ok(firm);
  /* 식은 엔진과 같이 무위험이자율 + 베타 × 주식위험프리미엄 + 가산 합(WACC.prem: 3요인은 요인 가산 포함, 기업 고유 프리미엄 모형은 국가 + 기업 고유 + ESG) */
  const capm = `무위험이자율 ${rf} + 베타 ${v3wB(V('WACC.beta'), 2)} × 주식위험프리미엄 ${erp} + ${ff ? '추가 위험과 요인 가산' : fp ? '국가, 기업 고유 프리미엄' : '추가 위험'} ${pr}`;
  const mo = Object.entries(V3W_KE).map(([k, [l, tip]]) => [k, l, k === 'ff3' && !ffOk, k === 'ff3' && !ffOk ? `${tip}. 요인 프리미엄과 대상 요인 베타 입력이 없습니다.` : tip]);
  if (!V3W_KE[km]) mo.push([km, km, true]);
  const top = v3wOpt([['모형', v3wSw(x, 'sw.ke_model', mo, km)],
    brp ? ['가산', v3In(x, 'sw.ke_bond_rp', x.c.switches.ke_bond_rp ?? 0.04, { fmt: 'pct', d: 2, lab: '타인자본비용에 더하는 가산' })] : null,
    km === 'firm_prem' ? ['기업 고유', v3In(x, 'sw.ke_firm_prem', x.c.switches.ke_firm_prem ?? 0, { fmt: 'pct', d: 2, lab: '기업 고유 프리미엄' })] : null,
    km === 'firm_prem' ? ['ESG 가산', v3In(x, 'sw.ke_esg_prem', x.c.switches.ke_esg_prem ?? 0, { fmt: 'pct', d: 2, lab: 'ESG 가산' })] : null]);
  const ref = v3Ok(kc) ? ['CAPM 참고', v3wP2(kc), ff ? '요인 가산을 더하기 전' : fp ? '규모, 개별, 국가 프리미엄을 더한 CAPM' : `무위험이자율 ${rf} + 베타 ${v3wB(V('WACC.beta'), 2)} × 주식위험프리미엄 ${erp} + 추가 위험 ${pr}`] : null;
  const ft = v3wFt('w7k', brp ? [
    ['자기자본비용', v3wP2(V('WACC.ke')), `세전 타인자본비용 ${v3wP2(V('WACC.kd_pre'))} + 가산 ${v3wP2(rp)}`, 'key'],
    ref,
    ['안정기 자기자본비용', v3wP2(V('WACC.ke_s')), '명시 기간과 같음']] : [
    ['자기자본비용', v3wP2(V('WACC.ke')), capm, 'key'],
    ff ? ['규모 요인 가산', v3wP2(smb), `SMB 요인 베타 ${v3wB(fb.smb, 2)} × 요인 프리미엄 ${v3wP2(mk.smb)}`] : null,
    ff ? ['가치 요인 가산', v3wP2(hml), `HML 요인 베타 ${v3wB(fb.hml, 2)} × 요인 프리미엄 ${v3wP2(mk.hml)}`] : null,
    fp ? ['기업 고유 프리미엄', v3wP2(firm), `기업 고유 ${v3wP2(x.sw.ke_firm_prem ?? 0)} + ESG 가산 ${v3wP2(x.sw.ke_esg_prem ?? 0)}`] : null,
    ff || fp ? ref : null,
    ['안정기 자기자본비용', v3wP2(V('WACC.ke_s')), `같은 식에 안정기 베타 ${v3wB(V('WACC.beta_s'), 2)}`]]);
  return v3Sec('자기자본비용', '', `<div class="v3w-st">${top}${v3wNotes('w7kn', v3wChkS(x, 'ke_model').map((c) => [c.text, 'warn']))}${ft}</div>`);
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
/* 자동 판정이 고른 타인자본비용 경로: 엔진 결과(runAll 결과나 사례 py)의 kd_path */
function v3wKdSec(x) {
  const m = x.I.market || {}, B = x.I.beta || {}, sw = x.sw, V = (id) => v3V(x, id), kr = m.spread?.kr_rating || {}, cr = B.credit_rating, hasR = !!cr && kr[cr] != null;
  const eff = V('CTL.a.debt_rate'), kdp = V('WACC.kd_pre'), rf = V('WACC.rf'), auto = sw.kd === 'auto';
  let path = auto ? x.res?.kd_path || null : sw.kd;
  if (!V3W_KD[path]) path = 'synthetic';
  const ri = m.kd_recent_issue_src || null, riText = ri ? [ri.date ? `${ri.date} 발행` : '', v3Ok(ri.amount) ? v3Eok(ri.amount) : '', v3Ok(ri.n) && ri.n > 1 ? `${v3Num(ri.n)}건` : '', ri.grade ? `${ri.grade} 등급` : ''].filter(Boolean).join(', ') : '';
  const opts = [['auto', '자동'], ['synthetic', '합성 등급'], ['rating', '실제 등급', !hasR], ['effective', '실효이자율', !v3Ok(eff)], ['market_yield', v3Ok(m.kd_market_yield) ? `회사채 수익률 ${v3wP2(m.kd_market_yield)}` : '회사채 수익률', m.kd_market_yield == null],
    ['recent_issue', v3Ok(m.kd_recent_issue) ? `최근 발행 금리 ${v3wP2(m.kd_recent_issue)}` : '최근 발행 금리', m.kd_recent_issue == null, riText], ['peer_avg', v3Ok(m.kd_peer_avg) ? `비교기업 평균 ${v3wP2(m.kd_peer_avg)}` : '비교기업 평균', m.kd_peer_avg == null], ['manual', '직접 입력']];
  const ibd = V('WACC.ibd'), mcap = V('WACC.mcap'), exl = v3Ok(ibd) ? ibd - (+x.I.bridge?.debt?.lease || 0) : null, low = v3Ok(exl) && v3Ok(mcap) && exl < 0.05 * mcap;
  const why = !auto ? '' : { market_yield: '회사채 시장 수익률이 있어 자동 선택', recent_issue: '최근 발행 금리가 있어 자동 선택', rating: '실제 신용등급이 있어 자동 선택', effective: '리스를 뺀 차입금이 시가총액의 5% 이상이라 자동 선택',
    synthetic: low ? '리스를 뺀 차입금이 시가총액의 5% 미만이라 자동 선택' : '자동 선택' }[path] || '자동 선택';
  const pre = { synthetic: [['무위험이자율', v3wP2(rf), ''], ['신용 스프레드', v3wP2(V('WACC.spread')), `합성 등급 ${v3wSyn(x).rating}`], ['세전 타인자본비용', v3wP2(kdp), '무위험이자율 + 신용 스프레드']],
    rating: [['무위험이자율', v3wP2(rf), ''], ['신용 스프레드', v3wP2(kr[cr]), `실제 등급 ${cr || ''} 국내 스프레드`], ['세전 타인자본비용', v3wP2(kdp), '무위험이자율 + 신용 스프레드']],
    effective: [['세전 타인자본비용', v3wP2(kdp), '직전 결산 차입 실효이자율']], market_yield: [['세전 타인자본비용', v3wP2(kdp), cr ? `${cr} 등급 회사채 시장 수익률` : '회사채 시장 수익률']],
    recent_issue: [['세전 타인자본비용', v3wP2(kdp), riText ? `최근 발행 금리(${riText})` : '최근 발행 금리']], peer_avg: [['세전 타인자본비용', v3wP2(kdp), '비교기업 타인자본비용 평균']],
    manual: [['세전 타인자본비용', v3wP2(kdp), '직접 입력']] }[path] || [['세전 타인자본비용', v3wP2(kdp), V3W_KD[path]]];
  const ft = v3wFt('w8k', [['적용 방식', esc(V3W_KD[path]), why], ...pre, ['한계세율', v3wP1(V('WACC.t_m')), ''], ['세후 타인자본비용', v3wP2(V('WACC.kd')), '세전 타인자본비용 × (1 − 한계세율)', 'key']]);
  const krs = Object.keys(kr);
  const top = v3wOpt([['방식', v3wSw(x, 'sw.kd', opts, sw.kd, { key: 'i.market.kd_manual', val: kdp, fmt: 'pct', d: 2 })],
    sw.kd === 'manual' ? ['세전 타인자본비용', v3wMan(x, 'i.market.kd_manual', 'pct', 2, '세전 타인자본비용 직접 입력')] : null,
    krs.length ? ['실제 등급', v3wSel(x, 'i.beta.credit_rating', [[null, '없음'], ...krs.map((r) => [r, `${r} ${v3wP2(kr[r])}`])], cr ?? null, '실제 신용등급')] : null]);
  /* 근거 글(notes.why.kd)은 문서를 만든 때의 경로 기준이라, 방식 스위치와 경로가 그때와 같을 때만 보여 줌 */
  const kwhy = sw.kd === x.c.switches.kd && path === (x.c.py?.kd_path || path) ? x.c.notes?.why?.kd || '' : '';
  const kr2 = m.kd_by_rating || null, tn = kr2 && Array.isArray(kr2.tenors) ? kr2.tenors : [], mx = kr2?.matrix || null;
  let grid = '';
  if (mx && tn.length) {
    const cols = tn.map((t, j) => [t, j]).filter(([t]) => x.w > 620 || ['1y', '2y', '3y', '5y', kr2.tenor].includes(t)); // 좁은 폭은 1년 이상 주요 만기만
    grid = v3wFold(x, 'kdr', '등급별 회사채 수익률', `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-kr"><thead><tr><th class="st">등급</th>${cols.map(([t]) => `<th class="${t === kr2.tenor ? 'c' : ''}">${esc(v3wTenor(t))}</th>`).join('')}</tr></thead>
      <tbody>${Object.keys(mx).map((g) => `<tr class="${g === cr ? 'v3w-on' : ''}"><td class="st">${esc(g)}</td>${cols.map(([t, j]) => `<td class="${t === kr2.tenor ? 'c' : ''}">${v3Ok(mx[g]?.[j]) ? v3wP2(mx[g][j]) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${kr2.as_of ? `<p class="v3w-cap2">${esc(kr2.as_of)} 기준${v3Ok(kr2.ktb) ? `, 국고채 ${esc(v3wTenor(kr2.tenor || ''))} ${v3wP2(kr2.ktb)}` : ''}</p>` : ''}`);
  }
  return v3Sec('타인자본비용', '', `<div class="v3w-st">${top}${kwhy ? v3Why(kwhy) : ''}${ft}${grid}</div>`);
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
  const V = (id) => v3V(x, id), sw = x.sw, t = x.t, we = V('WACC.we'), wd = V('WACC.wd'), det = V('WACC.de_target'), np = !v3wPeers(x).length;
  const mb = sw.mcap_basis || 'spot', mv = { spot: t.mcap, avg1y: t.mcap_avg1y, avg2y: t.mcap_avg2y }, mper = t.mcap_avg_src?.period?.[mb];
  const mbUsed = mb !== 'spot' && !v3Ok(mv[mb]) ? 'spot' : mb; // 값이 없는 기준은 엔진이 기준일 값으로 계산
  const mwhy = mbUsed === 'spot' ? (t.val_date ? `${t.val_date} 종가` : '') : `${V3W_MCAP[mbUsed]} 일평균${mper ? `, ${mper}` : ''}`;
  const kd = V('WACC.kd'), ke = V('WACC.ke'), ovr = x.ov['o.wacc'] != null || sw.wacc_override != null;
  const deTip = !ovr && v3Ok(kd) && v3Ok(ke) && kd < ke ? V3W_TIP.de(v3wP2(kd), v3wP2(ke)) : '';
  const donut = v3Ok(we) && v3Ok(wd) ? v3cDonut({ w: 168, title: '자본구조', items: [{ label: '자기자본', value: we, cls: 's1' }, { label: '부채', value: wd, cls: 's3' }], center: [v3wP1(we), '자기자본'], fmt: v3wP1 })
    + v3cLegend([{ label: `자기자본 ${v3wP1(we)}`, cls: 's1' }, { label: `부채 ${v3wP1(wd)}`, cls: 's3' }]) : '';
  const top = v3wOpt([!Object.values(mv).some(v3Ok) ? null : ['시가총액 기준', v3wSw(x, 'sw.mcap_basis', Object.entries(V3W_MCAP).map(([k, l]) => [k, v3Ok(mv[k]) ? `${l} ${v3Eok(mv[k])}` : l, !v3Ok(mv[k])]), mb)],
    ['목표 자본구조', v3wSw(x, 'sw.cap_struct', [['current', '현재'], ['peer_median', '비교기업 중앙값', np], ['manual', '직접 입력']], sw.cap_struct, { key: 'i.beta.de_manual', val: det, fmt: 'pct', d: 2 })],
    sw.cap_struct === 'manual' ? ['목표 D/E', v3wMan(x, 'i.beta.de_manual', 'pct', 2, '목표 D/E 직접 입력')] : null]);
  const ft = v3wFt('w9c', [['시가총액', v3Eok(V('WACC.mcap')), mwhy], ['이자부부채', v3Eok(V('WACC.ibd')), '리스부채 포함'], ['D/E', v3wP1(V('WACC.de')), '이자부부채 ÷ 시가총액'],
    ['목표 D/E', v3wP1(det), { current: '현재 D/E', peer_median: '비교기업 D/E 중앙값', manual: '직접 입력' }[sw.cap_struct] || '', '', deTip],
    ['자기자본 비중', v3wP1(we), '1 ÷ (1 + 목표 D/E)'], ['부채 비중', v3wP1(wd), '목표 D/E ÷ (1 + 목표 D/E)']]);
  return v3Sec('자본구조', '<span class="meta">단위 억원</span>', `<div class="v3w-cap"><div class="v3w-donut" data-o="w9d">${donut}</div><div class="v3w-st">${top}${v3wNotes('w9cn', v3wChkS(x, 'mcap_basis').map((c) => [c.text, 'warn']))}${ft}</div></div>`);
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
function v3wMatrixSec(x) {
  const mx = x.res.wacc_matrix;
  if (!mx || typeof mx !== 'object') return '';
  const cur = mx.cur || {}, B = mx.beta, cell = (v) => (v3Ok(v) ? v3wP2(v) : '');
  let bt = '';
  if (B && Array.isArray(B.x) && Array.isArray(B.y) && (B.wacc || []).some((r) => (r || []).some((v) => v3Ok(v)))) { // 회귀와 비교기업 값이 하나도 없으면(베타 직접 입력 사례) 표를 뺌
    const bu = B.x.filter((k) => k !== 'regression').length, reg = B.x.includes('regression');
    const head = `<tr><th class="st" rowspan="2">베타 기간</th>${reg ? '<th rowspan="2">회귀</th>' : ''}${bu ? `<th class="v3w-mg" colspan="${bu}">바텀업 비교기업</th>` : ''}</tr><tr>${B.x.filter((k) => k !== 'regression').map((k) => `<th>${esc(V3W_STAT[k] || k)}</th>`).join('')}</tr>`;
    const rows = B.y.map((w, i) => `<tr><td class="st">${esc(v3wWin(w))}</td>${B.x.map((k, j) => {
      const v = B.wacc?.[i]?.[j], b = B.beta?.[i]?.[j], p = B.beta_pre?.[i]?.[j], on = v3Ok(v) && cur.beta_window === w && cur.beta_col === k;
      const tip = v3Ok(v) ? [v3Ok(b) ? `적용 베타 ${v3wB(b)}` : '', v3Ok(p) && p !== b ? `계산 베타 ${v3wB(p)}` : ''].filter(Boolean).join(', ') : '';
      return `<td class="${on ? 'v3w-cur' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${cell(v)}</td>`;
    }).join('')}</tr>`).join('');
    const td = (i, j) => {
      const w = B.y[i], k = B.x[j], v = B.wacc?.[i]?.[j], b = B.beta?.[i]?.[j], p = B.beta_pre?.[i]?.[j], on = v3Ok(v) && cur.beta_window === w && cur.beta_col === k;
      const tip = v3Ok(v) ? [v3Ok(b) ? `적용 베타 ${v3wB(b)}` : '', v3Ok(p) && p !== b ? `계산 베타 ${v3wB(p)}` : ''].filter(Boolean).join(', ') : '';
      return `<td class="${on ? 'v3w-cur' : ''}"${tip ? ` title="${esc(tip)}"` : ''}>${cell(v)}</td>`;
    };
    if (x.w <= 620) { // 세로 방식(회귀, 바텀업 비교기업 넷), 가로 베타 기간
      const tr = (j) => `<tr><td class="st">${esc(B.x[j] === 'regression' ? '회귀' : V3W_STAT[B.x[j]] || B.x[j])}</td>${B.y.map((_, i) => td(i, j)).join('')}</tr>`;
      const body = B.x.map((k, j) => (k === 'regression' ? tr(j) : '')).join('') + (bu ? `<tr class="grp"><td class="tx" colspan="${B.y.length + 1}">바텀업 비교기업</td></tr>` : '') + B.x.map((k, j) => (k === 'regression' ? '' : tr(j))).join('');
      bt = `<h3 class="v3-h3">베타</h3><table class="mk-tbl v3-t v3w-t v3w-mt v3w-mtn"><thead><tr><th class="st">방식</th>${B.y.map((w) => `<th>${esc(v3wWin(w))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
    } else bt = `<h3 class="v3-h3">베타</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-mt"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }
  const one = (title, o, vals, names, ck) => (o && Array.isArray(o.x) && o.x.length ? `<div><h3 class="v3-h3">${title}</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3w-t v3w-wt"><thead><tr><th class="st">선택지</th><th>값</th><th>WACC</th></tr></thead><tbody>${o.x.map((k, i) => `<tr class="${ck === k ? 'v3w-on' : ''}"><td class="st">${esc(names[k] || k)}</td><td>${cell(vals?.[i])}</td><td>${cell(o.wacc?.[i])}</td></tr>`).join('')}</tbody></table></div></div>` : '');
  const rf = one('무위험이자율', mx.rf, mx.rf?.rf, V3W_RF, cur.rf), erp = one('주식위험프리미엄', mx.erp, mx.erp?.erp, V3W_ERP, cur.erp);
  if (!bt && !rf && !erp) return '';
  const note = mx.override ? '<p class="v3w-note">WACC를 직접 넣어 쓰고 있어 아래 표는 직접 입력 전 계산값입니다.</p>' : '';
  const rng = v3Ok(mx.min) && v3Ok(mx.max) && mx.max > mx.min ? `<span class="meta" data-o="w9mr">${v3wP2(mx.min)}～${v3wP2(mx.max)}</span>` : '';
  return v3Sec('선택지별 WACC', rng, `<div class="v3w-st" data-o="w9m">${note}${bt}${rf || erp ? `<div class="v3-two">${rf}${erp}</div>` : ''}</div>`);
}
v3Step(9, (x) => v3wCapSec(x) + v3wWaccSec(x) + v3wMatrixSec(x));

// ---------- 10단계 성장 단계와 종료가치 ----------
function v3wFadeTbl(x) {
  const ys = v3Years(x, 'dcf'), a = Math.max(0, x.tl.N - 1), cols = ys.slice(a), D = { 'DCF.wacc_t': 2 };
  const ids = V3W_FADE.filter(([id]) => (v3Row(x, id) || []).length === ys.length);
  if (!ids.length || !cols.length) return '<div class="empty">전환 기간 계산값이 없습니다.</div>';
  const bl = (i) => (i === 1 ? 'bl' : '');
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3w-t"><thead><tr><th class="st">항목</th>${cols.map((y, i) => `<th class="${bl(i)}">${y.label}</th>`).join('')}</tr></thead><tbody data-o="w10f">${ids.map(([id, nm, cls, tip]) => {
    const r = v3Row(x, id), f = v3Lab(x, id).fmt;
    return `<tr class="${cls || ''}"><td class="st"${tip ? ` title="${esc(tip)}"` : ''}>${nm}</td>${cols.map((_, i) => `<td class="${bl(i)}">${v3Fmt(r[a + i], f, D[id])}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;
}
function v3wFadeSec(x) {
  const sw = x.sw, { N, M } = x.tl, ys = v3Years(x, 'dcf'), g = v3Row(x, 'DCF.g') || [], mg = v3Row(x, 'DCF.margin') || [], gs = v3V(x, 'DCF.g_s');
  const fw = [['linear', '안정기까지 직선'], ['same', '명시 기간 유지'], sw.fade_wacc === 'from_start' ? ['from_start', '첫해부터 직선'] : null];
  const gman = sw.fade_growth === 'manual';
  const top = v3wOpt([['성장률', v3wSw(x, 'sw.fade_growth', [['linear', '영구성장률까지 직선'], ['avg_const', '평균으로 고정'], M || gman ? ['manual', '직접 입력'] : null], sw.fade_growth, { key: 'sw.fade_g_manual', val: M ? g[N] : null, fmt: 'pct', d: 2 })],
    gman ? ['성장률 값', v3wMan(x, 'sw.fade_g_manual', 'pct', 2, '전환 기간 성장률 직접 입력')] : null,
    ['이익률', v3wSw(x, 'sw.fade_margin', [['hold', '마지막 해 유지'], ['avg2', '마지막 두 해 평균', N < 2], ['to_target', '목표까지 직선']], sw.fade_margin, { key: 'sw.fade_margin_target', val: mg[mg.length - 1], fmt: 'pct', d: 2, on: 'to_target' })],
    sw.fade_margin === 'to_target' ? ['목표 이익률', v3wMan(x, 'sw.fade_margin_target', 'pct', 2, '목표 이익률')] : null,
    ['재투자', v3wSw(x, 'sw.fade_reinv', [['g_over_roc', '성장률 ÷ ROC'], ['grow', '성장률만큼 증가'], ['sales_pct', '매출 대비 비율']], sw.fade_reinv)],
    ['할인율', v3wSw(x, 'sw.fade_wacc', fw, sw.fade_wacc)]]);
  const pf = (v) => v3Pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? 0 : 1);
  const chart = g.length ? `<h3 class="v3-h3">성장률과 영업이익률</h3><div data-o="w10c">${v3cLines({ w: v3Wd(x, 1, v3wSide(x)), h: 220, labels: ys.map((y) => y.label), fc: N, fmt: pf,
    lines: [{ name: '성장률', values: g, cls: 's1' }, { name: '영업이익률', values: mg, cls: 's3' }], hlines: v3Ok(gs) ? [{ v: gs, label: `영구성장률 ${v3wP2(gs)}`, cls: 's5' }] : [] })}
    ${v3cLegend([{ label: '성장률', cls: 's1', kind: 'line' }, { label: '영업이익률', cls: 's3', kind: 'line' }, { label: M ? '전환 기간과 종료연도' : '종료연도', cls: 's5', kind: 'dash' }])}</div>` : '';
  return v3Sec(`<span title="${esc(V3W_TIP.years(N, M))}">전환 기간</span>`, '<span class="meta">단위 억원</span>', `<div class="v3w-st">${top}${M ? '' : '<p class="v3w-note">전환 기간이 0년이라 위 방식은 쓰이지 않습니다.</p>'}${v3wFadeTbl(x)}${chart}</div>`);
}
/* 직접 입력(o.g)이 없을 때의 영구성장률(step_macro와 같은 규칙: 출처 값, 상한을 켜면 무위험이자율 이하. avg는 물가, 명목 GDP, 업계 성숙기 가운데 값이 있는 것의 평균) */
function v3wG0(x) {
  const m = x.I.market || {}, rf = v3V(x, 'WACC.rf'), av = [m.cpi10, m.gdp10, m.g_peer_mature].filter((v) => v != null);
  const raw = { cpi10: m.cpi10, rf, gdp_nominal: m.gdp10, manual: m.g_manual, avg: av.length ? av.reduce((a, b) => a + b, 0) / av.length : null, peer_mature: m.g_peer_mature }[x.sw.g];
  return { raw, g: !v3Ok(raw) ? null : x.sw.g_cap && v3Ok(rf) ? Math.min(raw, rf) : raw, rf };
}
function v3wTvSec(x) {
  const m = x.I.market || {}, sw = x.sw, V = (id, i) => v3V(x, id, i), { N, M } = x.tl, L = N + M, tv = V('DCF.tv'), ok = v3Ok(tv), ex = sw.tv === 'exit_mult', avt = sw.tv === 'avg';
  const g0 = v3wG0(x), man = x.ov['o.g'] != null;
  const gav = [m.cpi10, m.gdp10, m.g_peer_mature].some((v) => v3Ok(v));
  const src = [['cpi10', '소비자물가 10년 평균', m.cpi10], ['rf', '무위험이자율', g0.rf], ['gdp_nominal', '명목 GDP 성장률 10년 평균', m.gdp10], ['peer_mature', '업계 성숙기 성장률', m.g_peer_mature],
    sw.g === 'manual' || v3Ok(m.g_manual) ? ['manual', '사례 입력', m.g_manual] : null].filter(Boolean).map(([k, l, v]) => [k, v3Ok(v) ? `${l} ${v3wP2(v)}` : l, !v3Ok(v)]);
  src.splice(3, 0, ['avg', '물가, 명목 GDP, 업계 성숙기 평균', !gav]);
  const cap = !man && sw.g_cap && v3Ok(g0.raw) && v3Ok(g0.rf) && g0.raw > g0.rf;
  const notes = [man ? ['직접 입력한 값을 출처와 상한보다 먼저 씁니다.', ''] : null, cap ? [`상한에 걸려 무위험이자율 ${v3wP2(g0.rf)}를 씁니다.`, ''] : null, ...v3wChkS(x, 'g_fallback').map((k) => [k.text, 'warn']), ...v3wChk(x, 'g_vs_rate').map((k) => [k.text, k.level === 'err' ? 'err' : 'warn'])];
  const mk = x.c.input.rel?.exit_mult != null ? 'i.rel.exit_mult' : 'sw.exit_mult', mult = x.I.rel?.exit_mult ?? sw.exit_mult;
  const mg = v3Row(x, 'DCF.margin') || [], m0 = x.c.switches.ty_margin ?? mg[L - 1], yl = M ? x.tl.fade[M - 1] : x.tl.fc[N - 1];
  const MET = { ev_ebitda: ['EV/EBITDA', 'EBITDA', v3Ok(tv) && +mult ? tv / mult : null], ev_ebit: ['EV/EBIT', '영업이익', V('DCF.ebit', L - 1)], ev_sales: ['EV/매출', '매출', V('DCF.rev', L - 1)] };
  const met = MET[sw.exit_metric] || MET.ev_ebitda;
  const left = `<div class="v3w-st"><h3 class="v3-h3">영구성장률</h3>${v3wOpt([['출처', v3wSw(x, 'sw.g', src, sw.g)], ['상한', v3Chk(x, 'sw.g_cap', !!sw.g_cap, '무위험이자율 이하')],
    ['적용 값', v3In(x, 'o.g', g0.g, { fmt: 'pct', d: 2, lab: '영구성장률' })]], 'v3w-col')}${v3wNotes('w10g', notes)}
    <h3 class="v3-h3">종료연도</h3>${v3wOpt([['종료가치 방식', v3wSw(x, 'sw.tv', [['gordon', '영구성장'], ['exit_mult', '배수'], ['avg', '영구성장과 배수법 평균'], sw.tv === 'finite' ? ['finite', '종료가치 없음'] : null], sw.tv)],
    ex || avt ? ['배수 기준', v3wSw(x, 'sw.exit_metric', Object.entries(MET).map(([k, v]) => [k, v[0]]), sw.exit_metric)] : null,
    ex || avt ? ['적용 배수', v3In(x, mk, v3Base(x.c, mk) ?? null, { fmt: 'x', d: 2, lab: '종료가치 배수' })] : null,
    ['안정기 ROC', v3wSw(x, 'sw.roc_s', [['wacc', '안정기 WACC'], ['manual', '직접 입력']], sw.roc_s, { key: 'sw.roc_s_manual', val: V('DCF.roic', L), fmt: 'pct', d: 2 })],
    sw.roc_s === 'manual' ? ['ROC 값', v3wMan(x, 'sw.roc_s_manual', 'pct', 2, '안정기 ROC 직접 입력')] : null,
    ['영업이익률', v3In(x, 'o.ty_margin', m0, { fmt: 'pct', d: 2, lab: '종료연도 영업이익률' })]], 'v3w-col')}${v3wNotes('w10tn', v3wChkS(x, 'tv_avg').map((k) => [k.text, 'warn']))}</div>`;
  const R = (k, v, cls = '') => `<tr class="${cls}"><th>${k}</th><td>${v}</td></tr>`;
  const ty = ex ? R(`${yl}년 ${met[1]}`, v3Eok(met[2])) + R(`적용 ${met[0]}`, v3X(mult))
    : R('종료연도 매출', v3Eok(V('DCF.rev', L))) + R('영구성장률', v3wP2(V('DCF.g_s'))) + R('영업이익률', v3wP1(V('DCF.margin', L))) + R('영업이익', v3Eok(V('DCF.ebit', L))) + R('세율', v3wP1(V('DCF.tax_r', L)))
      + R('세후영업이익', v3Eok(V('DCF.nopat', L))) + R('재투자율', v3wP1(V('DCF.rr', L))) + R('재투자', v3Eok(V('DCF.reinv', L))) + R('FCFF', v3Eok(V('DCF.fcff', L)), 'v3w-b') + R('안정기 WACC', v3wP2(V('WACC.wacc_s')));
  const tvg = V('DCF.tv_gordon'), tve = V('DCF.tv_exit'), parts = avt && v3Ok(tvg) && v3Ok(tve) ? R('영구성장 종료가치', v3Eok(tvg)) + R(`배수법 종료가치(${met[0]} ${v3X(mult)})`, v3Eok(tve)) : '';
  const res = ok ? parts + R('종료가치', v3Eok(tv), 'k') + R('할인계수', v3Num(V('DCF.df', L), 3)) + R('종료가치 현재가치', v3Eok(V('DCF.pv_tv')), 'k') + R('종료가치 비중', v3wP1(V('DCF.tv_share')))
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
// 엔진이 읽지 않아 입력으로 만들지 않은 것: bridge.date, shares.date(읽기 전용으로만 보여 줌)
// 다리 잔액 기준(sw.bridge_basis)이 fy0, avg2면 11, 12단계 표에 결산 말 잔액(input.bridge.bal) 열이 붙고 그 칸을 고침. 줄별 넣는 금액은 엔진 v3eBridgeOf 값
// 15단계 「사업부별 합산」 카드는 사업부 입력(input.sotp.units)이 있는 사례에서만 보임. 값은 x.res.sotp 그대로
const V3B_DEBT = { st: '단기차입금', lt: '장기차입금', bond: '사채', cb: '전환사채', lease: '리스부채', deriv: '파생상품부채', fvpl: 'FVPL 금융부채' };
const V3B_DEBT_HIDE = ['deriv', 'fvpl']; // 금액이 0이면 줄을 숨기는 부채 키
const V3B_REVV = { g: '성장률', val: '매출', qty: '수량', price: '단가', mkt: '시장 규모', share: '점유율', net_ratio: '순매출 비율', fx: '환율', g_vol: '수량 성장률', g_price: '단가 성장률' };
/* 시나리오 규칙(sw.scn_rule): [값, 단추 이름, 툴팁] */
const V3B_RULE = [['research', '리서치 값 우선', 'Bull, Bear 값은 리서치가 준 것을 쓰고 없는 가정만 규칙으로 채웁니다.'], ['v2', '규칙만', '리서치의 Bull, Bear 값을 쓰지 않고 모든 가정을 규칙으로 채웁니다.'],
  ['modellers', '원형(The Modellers)', 'Bull은 Base + 5%p, Bear는 최근 3년 실적 최저를 명시 기간 내내 같은 값으로 둡니다.']];
const V3B_ASSOC = { book: '장부가', market: '시가' };
/* 주주가치 다리 잔액 기준(sw.bridge_basis): [값, 단추 이름, 툴팁에 쓸 전체 이름] */
const V3B_BASIS = [['latest', '기준일', '재무상태표 기준일 잔액'], ['fy0', '직전 결산 말', '직전 결산 말 잔액'], ['avg2', '두 결산 말 평균', '직전 두 결산 말 평균']];
/* 사업부별 합산(sw.sotp): [값, 단추 이름, 툴팁] */
const V3B_SOTP = [['off', '끔'], ['show', '참고로만 표시', '사업부별 합산 값을 전사 DCF와 견주어 보기만 합니다.'],
  ['target', '목표주가에 씀', '결합 목표주가의 DCF 자리에 사업부별 합산 가중평균을 씁니다. 시나리오 주당 가치와 민감도도 합산 값 기준이 됩니다.']];
const V3B_SOTP_M = { multiple: '배수법', dcf: '사업부 DCF' };
const V3B_SOTP_K = { sales: '매출', ebit: '영업이익', ebitda: 'EBITDA' };
const V3B_SOTP_A = { listed: '상장', unlisted: '비상장' };
const v3bSotpTg = (x) => x.res.sotp?.mode === 'target'; // 목표주가의 DCF 자리에 사업부별 합산을 쓰는 중
const v3bDcfName = (x) => (v3bSotpTg(x) ? '사업부별 합산 가중평균' : v3DcfName(x));
const v3bNote = (x, ids, lv) => (x.res.checks || []).filter((k) => ids.includes(k.id) && (!lv || lv.includes(k.level))).map((k) => `<p class="${k.level === 'info' ? 'v3b-note' : 'v3b-warn'}">${esc(k.text)}</p>`).join('');
/* 상대가치 「모델 실적 기준」의 실적 이름(평가 배수별. 엔진 rel_model과 같은 대응) */
const V3B_RELM = { PER: '지배순이익', PBR: '지배주주 자본', PSR: '매출', 'EV/EBITDA': 'EBITDA', 'EV/EBIT': '영업이익', 'EV/Sales': '매출' };
const V3B_EPS_TIP = { avg: '그해 기초와 기말 유통주식수의 평균으로 나눕니다. 자사주 매입 계획이 있을 때만 기준일 주식수와 달라지고, 그때는 공시 EPS와 조금 다른 것이 정상입니다.', spot: '모든 추정 연도를 기준일 유통주식수로 나눕니다.',
  tbl: '과거 열은 연도별 주식수 입력이 없으면 어느 쪽을 골라도 기준일 유통주식수로 나눈 값입니다.' };
/* 계산 입력 단추 묶음(v3Sw와 같은 마크업에 툴팁과 못 고르는 선택지를 더함). opts [[값, 이름, 툴팁, 못 고름]] */
function v3bSw(x, key, opts, cur) {
  const j = JSON.stringify(cur ?? null);
  return `<div class="mk-seg">${opts.map(([v, l, tip, dis]) => { const on = JSON.stringify(v ?? null) === j; return `<button type="button" data-v3-ov="${esc(key)}" data-v="${esc(JSON.stringify(v ?? null))}" class="${on ? 'on' : ''}" aria-pressed="${on}"${tip ? ` title="${esc(tip)}"` : ''}${dis ? ' disabled' : ''}>${esc(l)}</button>`; }).join('')}</div>`;
}
const v3bRnd = (v, u) => (v3Ok(v) ? Math.round(v / (+u || 1)) * (+u || 1) : null); // 표시용 반올림(주당 가치 반올림 단위)
const v3bSum = (a) => (a || []).reduce((s, v) => s + (+v || 0), 0);
const v3bSh = (v) => (v3Ok(v) ? `${v3Num(v)}주` : '-');
const v3bUp = (u) => v3Up(u) || '-';
const v3bScDot = (x, extra = '') => `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc}${extra ? `, ${extra}` : ''}</span>`;
const v3bRo = (lab, val) => `<div><span>${lab}</span><b class="v3b-ro">${esc(val)}</b></div>`;

/* 항목 표. cols {first, val: 입력 열 머리, ex: 결산 말 잔액 열 머리 목록(다리 잔액 기준이 fy0, avg2일 때), put: 넣는 금액 열 머리(없으면 그 열 없음)}
   rows [{grp: 묶음 제목} | {name, sub, inp: 입력 칸 html, ro: inp가 읽기만 하는 값, ex: 결산 말 잔액 칸 html 목록, put: 넣는 금액 html, o: data-o 키, off: 스위치가 꺼져 0으로 들어감, why}]
   ex 열이 있으면 근거는 그 줄 아래로 내리고, 좁은 폭에서는 항목 이름 줄 아래에 값 칸을 나란히 둠 */
const v3bNar = () => ($('#va-host')?.clientWidth || 1000) <= 620; // 좁은 폭(x.w와 같은 기준)
function v3bItems(cols, rows) {
  const nar = v3bNar(), ex = cols.ex || [], anyWhy = rows.some((r) => r.why), under = nar || ex.length > 0, hasWhy = anyWhy && !under, n = 2 + ex.length + (cols.put ? 1 : 0) + (hasWhy ? 1 : 0);
  const exTd = (r) => ex.map((_, i) => `<td class="${r.ex?.[i] ? 'in' : ''}">${r.ex?.[i] || ''}</td>`).join('');
  if (nar && ex.length) { // 좁은 폭 + 결산 말 잔액 열: 이름 줄 아래에 기준일, 결산 말, 넣는 금액 칸
    const m = 1 + ex.length + (cols.put ? 1 : 0), sh = (h) => String(h).replace(/^20(\d\d-\d\d-\d\d)$/, '$1');
    const b = rows.map((r) => (r.grp ? `<tr class="grp"><td class="tx" colspan="${m}">${esc(r.grp)}</td></tr>`
      : `<tr class="nm ${r.off ? 'off' : ''}"><td class="tx" colspan="${m}"><b>${esc(r.name)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td></tr><tr class="vl ${r.off ? 'off' : ''}"><td class="${r.ro ? '' : 'in'}">${r.inp || ''}</td>${exTd(r)}${cols.put ? `<td class="put" data-o="${esc(r.o)}">${r.put}</td>` : ''}</tr>${r.why ? `<tr class="wy"><td class="tx" colspan="${m}">${v3Why(r.why)}</td></tr>` : ''}`)).join('');
    return `<table class="mk-tbl v3-t v3b-it v3b-dl v3b-dln v3b-bsn"><thead><tr><th>${cols.val}</th>${ex.map((h) => `<th>${esc(sh(h))}</th>`).join('')}${cols.put ? `<th>${cols.put}</th>` : ''}</tr></thead><tbody>${b}</tbody></table>`;
  }
  const head = `<tr><th class="st">${cols.first || '항목'}</th><th>${cols.val}</th>${ex.map((h) => `<th>${esc(h)}</th>`).join('')}${cols.put ? `<th>${cols.put}</th>` : ''}${hasWhy ? '<th class="tx why">근거</th>' : ''}</tr>`;
  const body = rows.map((r) => (r.grp ? `<tr class="grp"><td class="tx" colspan="${n}">${esc(r.grp)}</td></tr>`
    : `<tr class="${r.off ? 'off' : ''}"><td class="st">${esc(r.name)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</td><td class="${r.ro ? 'ro' : 'in'}">${r.inp || ''}</td>${exTd(r)}${cols.put ? `<td class="put" data-o="${esc(r.o)}">${r.put}</td>` : ''}${hasWhy ? `<td class="tx why">${v3Why(r.why)}</td>` : ''}</tr>${under && r.why ? `<tr class="wy"><td class="tx" colspan="${n}">${v3Why(r.why)}</td></tr>` : ''}`)).join('');
  return `<div class="mk-scroll${anyWhy && !ex.length ? '' : ' v3b-nw'}${ex.length ? ' v3b-bsw' : ''}"><table class="mk-tbl v3-t v3b-it${under && anyWhy ? ' v3b-itn' : ''}${ex.length ? ' v3b-bs' : ''}"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
/* 계산표. 줄 [연산 기호, 이름, 값 html, 클래스(sum, off, k, big), 이름 옆 작은 글]. res는 결과 묶음(파란 바탕) */
const v3bRow = ([op, name, val, cls, sub]) => `<tr class="${cls || ''}"><th><i>${op || ''}</i>${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</th><td>${val}</td></tr>`;
const v3bCalc = (o, rows, res) => `<div class="v3b-calc" data-o="${o}"><table class="va-calc"><tbody>${rows.map(v3bRow).join('')}</tbody>${res && res.length ? `<tbody class="res">${res.map(v3bRow).join('')}</tbody>` : ''}</table></div>`;

// ---------- 다리 잔액 기준(11, 12단계 공통) ----------
/* {cur 지금 기준, on 결산 말 잔액으로 계산 중, ks 보여 줄 결산 말 키(fy0, fy0p), heads 그 열 머리(날짜), eff 줄별 넣는 금액(엔진 v3eBridgeOf), opt 단추 줄 html, meta 카드 오른쪽 글, note 점검 문장} */
function v3bBasis(x, c, step) {
  const br = x.I.bridge || {}, bal = br.bal || {}, cur = x.sw.bridge_basis || 'latest', dt = (k) => bal[k]?.date || (k === 'fy0' ? '직전 결산 말' : '그 전 결산 말');
  const can = { latest: true, fy0: !!bal.fy0, avg2: !!bal.fy0 && !!bal.fy0p }, on = cur !== 'latest' && can[cur], ks = !on ? [] : cur === 'avg2' ? ['fy0', 'fy0p'] : ['fy0'];
  const eff = on && typeof v3eBridgeOf === 'function' ? v3eBridgeOf(x.I, x.sw) : br;
  const tip = { latest: br.date ? `(${br.date})` : '', fy0: can.fy0 ? `(${dt('fy0')})` : '', avg2: can.avg2 ? `(${dt('fy0')}, ${dt('fy0p')})` : '' };
  const sw = c.switches.bridge_basis != null || bal.fy0 ? `<div><span>주주가치 다리 잔액</span>${v3bSw(x, 'sw.bridge_basis', V3B_BASIS.map(([v, l, t]) => [v, l, can[v] ? `${t}${tip[v]}` : '결산 말 잔액 입력이 없는 사례입니다.', !can[v] && cur !== v]), cur)}</div>` : '';
  const meta = `${on ? (cur === 'avg2' ? `${dt('fy0')}과 ${dt('fy0p')} 평균, ` : `${dt('fy0')} 잔액, `) : br.date ? `기준일 ${esc(br.date)}, ` : ''}단위 억원`;
  /* 점검 bridge_basis: 주의는 12단계 머리 경고 줄에 나오므로 12단계에서는 참고만 */
  const note = `<div class="v3b-bn" data-o="b${step}.bn">${v3bNote(x, ['bridge_basis'], step === 12 && V3_CHK_STEP.bridge_basis ? ['info'] : null)}</div>`;
  return { cur, on, ks, heads: ks.map(dt), eff, bal0: c.input.bridge?.bal || {}, sw, meta, note };
}

// ---------- 11 비영업자산 ----------
v3Step(11, (x, c) => {
  const br0 = c.input.bridge || {}, br = x.I.bridge || {}, sw = x.sw;
  const amt = (key, base, lab) => v3In(x, key, base, { fmt: 'amt', cell: true, lab });
  const B = v3bBasis(x, c, 11), E = B.eff || {};
  /* 결산 말 잔액으로 계산 중이면 기준일 잔액은 읽기만 하고 결산 말 잔액 칸을 고침 */
  const line = (name, k) => (B.on ? { name, inp: v3Num(br[k] || 0), ro: true, ex: B.ks.map((b) => amt(`i.bridge.bal.${b}.${k}`, B.bal0[b]?.[k], `${name} ${B.bal0[b]?.date || ''}`)), put: v3Num(E[k] || 0), o: `b11.p.${k}` } : { name, inp: amt(`i.bridge.${k}`, br0[k], name) });
  const rows = [line('현금 및 현금성자산', 'cash'), line('단기금융상품', 'st_fin')];
  const mk = sw.assoc_value === 'market', hasMk = (br.nonop || []).some((it) => it && it.market != null); // 시가가 있는 항목(상장 관계기업)이 있을 때만 고를 수 있음
  (br0.nonop || []).forEach((it, i) => {
    const cur = br.nonop?.[i] || it, nm = cur.name || `비영업자산 ${i + 1}`, sub = cur.market != null ? `시가 ${v3Eok(cur.market)}${mk ? ' 적용' : ''}` : '';
    const hb = B.on && it.bal && typeof it.bal === 'object', put = mk && cur.market != null ? cur.market : E.nonop?.[i]?.amount ?? cur.amount; // 결산 말 잔액(bal)이 있는 줄만 기준을 따름
    rows.push(hb ? { name: nm, sub, inp: v3Num(cur.amount || 0), ro: true, ex: B.ks.map((b) => amt(`i.bridge.nonop.${i}.bal.${b}`, it.bal[b], `${nm} ${B.bal0[b]?.date || ''}`)), put: v3Num(put || 0), o: `b11.p.n${i}`, why: cur.why }
      : { name: nm, sub, inp: amt(`i.bridge.nonop.${i}.amount`, it.amount, nm), put: B.on ? v3Num(put || 0) : '', o: `b11.p.n${i}`, why: cur.why });
  });
  const aopt = hasMk ? `<div><span>관계기업 평가</span>${v3bSw(x, 'sw.assoc_value', [['book', '장부가'], ['market', '시가', '시가가 있는 상장 관계기업은 시가로 넣습니다.']], sw.assoc_value || 'book')}</div>`
    : sw.assoc_value ? v3bRo('관계기업 평가', V3B_ASSOC[sw.assoc_value] || sw.assoc_value) : '';
  const opt = B.sw || aopt ? `<div class="v3-opt">${B.sw}${aopt}</div>` : '';
  const cash = v3V(x, 'DCF.cash'), nonop = v3V(x, 'DCF.nonop'), ev = v3V(x, 'DCF.ev'), tot = (cash || 0) + (nonop || 0);
  const calc = v3bCalc('b11', [['', '현금성자산', v3Eok(cash)], ['+', '비영업자산', v3Eok(nonop)]],
    [['=', '합계', v3Eok(tot), 'k big'], ['', '영업가치 대비 비중', v3Pct(v3Ok(ev) && ev ? tot / ev : null), '', `영업가치 ${v3Eok(ev)}`]]);
  return v3Sec('비영업자산 입력', `<span class="meta" data-o="b11.meta">${B.meta}</span>`, opt + B.note + v3bItems(B.on ? { val: '기준일 잔액', ex: B.heads, put: '넣는 금액' } : { val: '금액' }, rows))
    + v3Sec('합계', v3bScDot(x), calc);
});

// ---------- 12 비주주청구권 ----------
v3Step(12, (x, c) => {
  const br0 = c.input.bridge || {}, br = x.I.bridge || {}, sw = x.sw, one = (id) => v3V(x, id), rows = [];
  const amt = (key, base, lab) => v3In(x, key, base, { fmt: 'amt', cell: true, lab });
  const B = v3bBasis(x, c, 12), E = B.eff || {}, effD = E.debt || {}; // effD: 잔액 기준을 반영한 줄별 금액(기준일이면 입력 그대로)
  /* 결산 말 잔액으로 계산 중이면 기준일 잔액은 읽기만 하고 결산 말 잔액 칸을 고침 */
  const bex = (path, get, nm) => B.ks.map((b) => amt(`i.bridge.bal.${b}.${path}`, get(B.bal0[b] || {}), `${nm} ${B.bal0[b]?.date || ''}`));
  const curD = br.debt || {}, dk = Object.keys(br0.debt || {}).filter((k) => !V3B_DEBT_HIDE.includes(k) || br0.debt[k] || curD[k] || effD[k]);
  if (dk.length) rows.push({ grp: '이자부부채' });
  dk.forEach((k) => { const nm = V3B_DEBT[k] || k; rows.push(B.on ? { name: nm, inp: v3Num(curD[k] || 0), ro: true, ex: bex(`debt.${k}`, (o) => o.debt?.[k], nm), put: v3Num(effD[k] || 0), o: `b12.d.${k}` } : { name: nm, inp: amt(`i.bridge.debt.${k}`, br0.debt[k], nm), put: v3Num(curD[k] || 0), o: `b12.d.${k}` }); });
  const cbEq = v3Ok(one('DCF.debt')) ? v3bSum(Object.values(effD)) - one('DCF.debt') : 0; // 희석 주식으로 넣은 전환사채는 부채에서 빠짐
  if (cbEq > 0.005) rows.push({ name: '주식으로 본 전환 증권', put: `−${v3Num(cbEq)}`, o: 'b12.cbeq' });
  rows.push({ grp: '그 밖의 청구권' });
  const pbr = sw.nci_value === 'book_x_pbr';
  rows.push({ name: '비지배지분', sub: pbr ? `장부가 × ${v3X(sw.nci_pbr ?? 1)}` : '', ...(B.on ? { inp: v3Num(br.nci || 0), ro: true, ex: bex('nci', (o) => o.nci, '비지배지분') } : { inp: amt('i.bridge.nci', br0.nci, '비지배지분') }), put: v3Num(one('DCF.nci') || 0), o: 'b12.nci' });
  rows.push({ name: '우선주 시가', inp: amt('i.bridge.pref_mkt', br0.pref_mkt, '우선주 시가'), put: v3Num(one('DCF.pref') || 0), o: 'b12.pref', off: sw.pref !== 'market' });
  rows.push({ name: '퇴직급여 과소적립', ...(B.on ? { inp: v3Num(br.dbo || 0), ro: true, ex: bex('dbo', (o) => o.dbo, '퇴직급여 과소적립') } : { inp: amt('i.bridge.dbo', br0.dbo, '퇴직급여 과소적립') }), put: v3Num(one('DCF.dbo') || 0), o: 'b12.dbo', off: !sw.dbo_claim });
  (br0.claims || []).forEach((it, i) => { const cur = br.claims?.[i] || it, nm = cur.name || `기타 청구권 ${i + 1}`; rows.push({ name: nm, inp: amt(`i.bridge.claims.${i}.amount`, it.amount, nm), put: v3Num(cur.amount || 0), o: `b12.c.${i}`, why: cur.why }); });
  const opt = `<div class="v3-opt">${B.sw}<div><span>비지배지분</span>${v3Sw(x, 'sw.nci_value', [['book', '장부가'], ['book_x_pbr', '장부가 × PBR']], sw.nci_value)}${pbr ? `<span class="v3b-oi">${v3In(x, 'sw.nci_pbr', c.switches.nci_pbr ?? 1, { fmt: 'x', lab: '비지배지분 PBR' })}</span>` : ''}</div>
    <div><span>우선주</span>${v3Sw(x, 'sw.pref', [['as_common', '주식 수에 합산'], ['market', '시가로 차감']], sw.pref)}</div>
    <div><span>퇴직급여 과소적립</span>${v3Sw(x, 'sw.dbo_claim', [[false, '제외'], [true, '차감']], !!sw.dbo_claim)}</div></div>`;
  const calc = v3bCalc('b12', [['', '영업가치', v3Eok(one('DCF.ev'))], ['+', '현금성자산', v3Eok(one('DCF.cash'))], ['+', '비영업자산', v3Eok(one('DCF.nonop'))],
    ['−', '이자부부채', v3Eok(one('DCF.debt'))], ['−', '비지배지분', v3Eok(one('DCF.nci'))], ['−', '우선주', v3Eok(one('DCF.pref')), sw.pref !== 'market' ? 'off' : ''],
    ['−', '퇴직급여 과소적립', v3Eok(one('DCF.dbo')), sw.dbo_claim ? '' : 'off'], ['−', '기타 청구권', v3Eok(one('DCF.other_claim')), (br0.claims || []).length ? '' : 'off']],
  [['=', '주주가치', v3Eok(one('DCF.eq')), 'k big', v3bSotpTg(x) ? '전사 DCF' : '']]);
  return v3Sec('청구권 입력', `<span class="meta" data-o="b12.meta">${B.meta}</span>`, opt + B.note + v3bItems(B.on ? { val: '기준일 잔액', ex: B.heads, put: '넣는 금액' } : { val: '금액', put: '넣는 금액' }, rows))
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
  const nm = (o, i, a) => o.name || o.label || (o.id != null && o.id !== '' ? String(o.id) : a.length > 1 ? `${i + 1}번` : '');
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
    const tv = v3V(x, `SHR.cb.${String(b.id ?? i + 1).replace(/\./g, '_')}.test`); // 엔진의 건별 판정(1 전환, 0 상환)이 있으면 그 값을 따르고 사유는 툴팁으로
    let jt = '';
    if (tv === 1 || tv === 0) { jt = tv ? '' : j === '희석' ? '' : j; on = tv === 1; j = on ? '전환' : '상환'; }
    out.push({ kind: '전환사채', name: nm(b, i, a), sub: `권면 ${v3Eok(b.face)}`, qty: v3Num(nw), qo: true, px: inp('cb', i, 'conv_price', 'won', '전환가'), term: term(b.window?.[0], b.window?.[1]), j, jt, on, add: on ? nw : 0, o: `cb${i}` });
  });
  (sh.rcps || []).forEach((r, i, a) => {
    const on = sw.rcps === 'convert';
    out.push({ kind: '상환전환우선주', name: nm(r, i, a), sub: v3Ok(r.book) ? `장부 ${v3Eok(r.book)}` : '', qty: inp('rcps', i, 'shares', 'cnt', '상환전환우선주 전환 주식'), px: '', term: '', j: on ? '전환 가정' : '상환 가정', on, add: on ? +r.shares || 0 : 0, o: `rc${i}` });
  });
  return out;
}
function v3bEps(x) {
  const e = v3Row(x, 'SHR.eps'); if (!e) return '';
  const ys = v3Years(x, 'hist+fc'), H = x.tl.H, d = v3Row(x, 'SHR.eps_dil'), es = v3Row(x, 'SHR.eps_shares'); // es: EPS 분모(연도별 주식수 입력이 있을 때만 생김)
  const dif = d && d.some((v, i) => v3Ok(v) && v3Ok(e[H + i]) && Math.abs(v - e[H + i]) > 0.5);
  const cls = (i) => (i === H ? 'bl' : '');
  const tr = (name, f) => `<tr><td class="st">${name}</td>${ys.map((y, i) => `<td class="${y.e ? '' : 'h'} ${cls(i)}">${f(i)}</td>`).join('')}</tr>`;
  return `<h3 class="v3-h3" title="${esc(V3B_EPS_TIP.tbl)}">주당순이익<small>원</small></h3><div class="mk-scroll"><table class="mk-tbl v3-t"><thead><tr><th class="st">항목</th>${ys.map((y, i) => `<th class="${cls(i)}">${y.label}</th>`).join('')}</tr></thead>
    <tbody>${tr('주당순이익', (i) => v3Fmt(e[i], 'won'))}${dif ? tr('희석 주당순이익', (i) => (i < H ? '' : v3Fmt(d[i - H], 'won'))) : ''}${es ? tr('EPS 주식 수<small>주</small>', (i) => v3Fmt(es[i], 'cnt')) : ''}</tbody></table></div>`;
}
v3Step(13, (x, c) => {
  const sh0 = c.input.shares || {}, sh = x.I.shares || {}, sw = x.sw, one = (id) => v3V(x, id);
  const cnt = (key, base, lab) => v3In(x, key, base, { fmt: 'cnt', cell: true, lab });
  const rows = [{ name: '발행주식 총수', inp: cnt('i.shares.issued', sh0.issued, '발행주식 총수') }, { name: '자기주식', inp: cnt('i.shares.treasury', sh0.treasury, '자기주식') },
    { name: '우선주', inp: cnt('i.shares.pref', sh0.pref, '우선주') }];
  const dil = v3bDil(x, c), anyW = dil.some((d) => d.term), anyR = (sh.rcps || []).length > 0;
  const opt = `<div class="v3-opt"><div><span>우선주</span>${v3Sw(x, 'sw.pref', [['as_common', '주식 수에 합산'], ['market', '시가로 차감']], sw.pref)}</div>
    ${anyW ? `<div><span>행사 기간</span>${v3Sw(x, 'sw.exercise_window', [[true, '반영'], [false, '무시']], !!sw.exercise_window)}</div>` : ''}
    ${anyR ? `<div><span>상환전환우선주</span>${v3Sw(x, 'sw.rcps', [['convert', '전환'], ['redeem', '상환']], sw.rcps)}</div>` : ''}
    ${dil.length ? `<div><span>희석 판정 주가</span>${v3bSw(x, 'sw.dilution_iter', [[false, '기준일 종가'], [true, '모델 주당 가치', '계산된 주당 가치로 희석을 다시 판정해 주식 수를 정합니다. 아래 건별 판정은 기준일 종가 기준입니다.']], !!sw.dilution_iter)}</div>` : ''}</div>`;
  const dsum = (one('SHR.so_tsm') || 0) + (one('SHR.rsu') || 0) + (one('SHR.cb_add') || 0);
  const jsp = (d) => `<span class="v3b-j ${d.on ? 'on' : ''}"${d.jt ? ` title="${esc(d.jt)}"` : ''}>${d.j}</span>`;
  const dtblN = () => `<table class="mk-tbl v3-t v3b-dl v3b-dln"><thead><tr><th>수량</th><th>행사가</th><th>가산 주식</th></tr></thead><tbody>${dil.map((d) => `<tr class="nm"><td class="tx" colspan="3"><b>${d.kind}</b>${[d.name, d.sub, d.term].some(Boolean) ? `<small>${esc([d.name, d.sub, d.term].filter(Boolean).join(', '))}</small>` : ''}<span class="v3b-jn" data-o="b13.j.${d.o}">${jsp(d)}</span></td></tr>
      <tr class="vl"><td class="${d.qo ? '' : 'in'}"${d.qo ? ` data-o="b13.q.${d.o}"` : ''}>${d.qty}</td><td class="in">${d.px}</td><td data-o="b13.a.${d.o}">${v3Num(d.add)}</td></tr>`).join('')}
      <tr class="sum" data-o="b13.dsum"><td class="tx" colspan="2">합계</td><td>${v3Num(dsum)}</td></tr></tbody></table>`;
  const dtbl = dil.length && x.w <= 620 ? dtblN() : dil.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3b-dl"><thead><tr><th class="st">구분</th><th>수량</th><th>행사가</th><th class="tx">행사 기간</th><th class="tx">판정</th><th>가산 주식</th></tr></thead>
      <tbody>${dil.map((d) => `<tr><td class="st"><b>${d.kind}</b>${d.name || d.sub ? `<small>${esc([d.name, d.sub].filter(Boolean).join(', '))}</small>` : ''}</td><td class="${d.qo ? '' : 'in'}"${d.qo ? ` data-o="b13.q.${d.o}"` : ''}>${d.qty}</td><td class="in">${d.px}</td><td class="tx">${esc(d.term)}</td><td class="tx" data-o="b13.j.${d.o}"><span class="v3b-j ${d.on ? 'on' : ''}"${d.jt ? ` title="${esc(d.jt)}"` : ''}>${d.j}</span></td><td data-o="b13.a.${d.o}">${v3Num(d.add)}</td></tr>`).join('')}
      <tr class="sum" data-o="b13.dsum"><td class="st">합계</td><td></td><td></td><td class="tx"></td><td class="tx"></td><td>${v3Num(dsum)}</td></tr></tbody></table></div>`
    : '<div class="empty">스톡옵션, RSU, 전환사채 건별 자료가 없어 희석을 반영하지 못했습니다.</div>';
  const asC = sw.pref === 'as_common', basis = { diluted: '희석', basic: '유통', issued: '발행' }[sw.share_basis] || '';
  const calc = v3bCalc('b13', [['', '발행주식 총수', v3bSh(one('SHR.issued'))], ['−', '자기주식', v3bSh(one('SHR.treasury'))], ['=', '유통주식수', v3bSh(one('SHR.basic')), 'sum'],
    ['+', '우선주', v3bSh(asC ? one('SHR.pref') : 0), asC ? '' : 'off'], ['+', '자기주식법 순증', v3bSh(one('SHR.so_tsm')), '', v3Ok(one('SHR.so_itm')) && one('SHR.so_itm') ? `내가격 수량 ${v3bSh(one('SHR.so_itm'))}` : ''],
    ['+', '미가득 RSU', v3bSh(one('SHR.rsu'))], ['+', '전환 가산 주식', v3bSh(one('SHR.cb_add'))], ['=', '희석 주식수', v3bSh(one('SHR.diluted')), 'sum'],
    ...(v3Ok(one('SHR.diluted_iter')) ? [['', '다시 판정한 주식 수', v3bSh(one('SHR.diluted_iter')), '', '모델 주당 가치 기준']] : [])],
  [v3bSotpTg(x) && v3Ok(one('DCF.sotp.eq')) ? ['', '주주가치', v3Eok(one('DCF.sotp.eq')), '', '사업부별 합산'] : ['', '주주가치', v3Eok(one('DCF.eq'))], ['÷', '주식 수', v3bSh(one('DCF.shares')), '', basis], ['=', '주당 가치', v3Won(one('DCF.ps')), 'k big', v3Ok(one('DCF.ps_raw')) ? `반올림 전 ${v3Won(one('DCF.ps_raw'))}` : ''],
    ['', '상승여력', v3bUp(one('DCF.up')), '', `현재가 ${v3Won(x.t.close)}`]]);
  const copt = `<div class="v3-opt"><div><span>주식 수 기준</span>${v3Sw(x, 'sw.share_basis', [['diluted', '희석'], ['basic', '유통'], ['issued', '발행']], sw.share_basis)}</div>
    <div><span>반올림 단위</span>${v3Sw(x, 'sw.round', [[1, '1원'], [10, '10원'], [100, '100원'], [1000, '1,000원']], sw.round)}</div>
    ${v3Row(x, 'SHR.eps') ? `<div><span>EPS 주식 수</span>${v3bSw(x, 'sw.eps_basis', [['avg', '기초, 기말 평균', V3B_EPS_TIP.avg], ['spot', '기준일', V3B_EPS_TIP.spot]], sw.eps_basis || 'avg')}</div>` : ''}</div>`;
  return v3Sec('주식 수 입력', `<span class="meta">${sh.date ? `기준일 ${esc(sh.date)}, ` : ''}단위 주</span>`,
    `${opt}${v3bItems({ val: '주식 수' }, rows)}<h3 class="v3-h3">희석 증권<small>판정 기준가 ${v3Won(x.t.close)}</small></h3>${dtbl}<div data-o="b13.dn">${v3bNote(x, ['dilution_src'], ['info'])}</div>`)
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
  const rows = x.res.rows, B = rows.Base || {}, N = x.tl.N, H = x.tl.H, cols = N > 1 ? [0, N - 1] : [0], list = [], y0 = x.tl.hist[H - 1], nar = x.w <= 620;
  /* 매출 줄 성장률 가정의 실적 참고 한 줄: 직전 실적 성장률(REV.l.<줄>.g), 최근 3년 실적 최저와 최고(CTL.ref.rev.<줄>.<변수>.min3, max3). 같은 값은 한 번만 */
  const ref = (K, fmt) => {
    const m = /^rev\.(.+)\.([^.]+)$/.exec(K); if (!m) return '';
    const f = (v) => v3Fmt(v, fmt, fmt === 'pct' ? 1 : undefined), p = m[2] === 'g' ? B[`REV.l.${m[1]}.g`]?.[H - 1] : null, lo = B[`CTL.ref.${K}.min3`]?.[0], hi = B[`CTL.ref.${K}.max3`]?.[0], out = [];
    if (v3Ok(p)) out.push(`${y0}년 실적 ${f(p)}`);
    if (v3Ok(lo) && v3Ok(hi)) { if (f(lo) !== f(hi)) out.push(`최근 3년 ${f(lo)}～${f(hi)}`); else if (!v3Ok(p) || f(p) !== f(lo)) out.push(`최근 3년 ${f(lo)}`); }
    else if (v3Ok(lo)) out.push(`최근 3년 최저 ${f(lo)}`);
    else if (v3Ok(hi)) out.push(`최근 3년 최고 ${f(hi)}`);
    return out.join(', ');
  };
  for (const id of Object.keys(B)) {
    if (!id.startsWith('CTL.a.')) continue;
    const rs = V3_SCEN.map((S) => rows[S]?.[id]);
    if (rs.some((r) => !Array.isArray(r))) continue;
    if (!rs.some((r) => r.length !== rs[0].length || r.some((v, i) => Math.abs((v || 0) - (rs[0][i] || 0)) > 1e-9))) continue;
    const K = id.slice(6), L = v3Lab(x, id), one = rs[0].length === 1, src = ['Bull', 'Bear'].map((S) => v3bSrc(x, c, K, S)), rf = ref(K, L.fmt);
    const name = `${esc(v3bAName(x, K))}${L.fmt !== 'pct' && V3_UNIT[L.fmt] ? `<small>${V3_UNIT[L.fmt]}</small>` : ''}`, rfH = rf ? `<span class="v3b-rf" title="직전 실적 성장률과 최근 3년 실적 최저, 최고">${esc(rf)}</span>` : '';
    const vals = rs.map((r) => cols.map((j, n) => `<td class="${n === 0 ? 'bl' : ''}">${one && n ? '' : v3Fmt(r[one ? 0 : j], L.fmt, L.fmt === 'pct' ? 1 : undefined)}</td>`).join('')).join('');
    list.push(nar ? `<tr class="nm"><td class="tx" colspan="${3 * cols.length}"><b>${name}</b><span class="v3b-sr">${src[0] === src[1] ? src[0] : `Bull ${src[0]}, Bear ${src[1]}`}</span>${rfH}</td></tr><tr class="vl">${vals}</tr>`
      : `<tr><td class="st">${name}${rfH}</td>${vals}<td class="tx bl">${src[0] === src[1] ? src[0] : `Bull ${src[0]}<br>Bear ${src[1]}`}</td></tr>`);
  }
  if (!list.length) return '<div class="empty">세 시나리오의 가정이 모두 같습니다.</div>';
  const yl = cols.map((j) => `${x.tl.fc[j]}E`), g = V3_SCEN.map((S) => `<th class="g bl" colspan="${cols.length}"><span class="v3-dot ${S}"></span>${S}</th>`).join(''), ys = V3_SCEN.map(() => yl.map((l, n) => `<th class="${n === 0 ? 'bl' : ''}">${l}</th>`).join('')).join('');
  if (nar) return `<table class="mk-tbl v3-t v3b-as v3b-asn"><thead><tr>${g}</tr><tr>${ys}</tr></thead><tbody>${list.join('')}</tbody></table>`;
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3b-as"><thead><tr><th class="st" rowspan="2">가정</th>${g}<th class="tx bl" rowspan="2">출처</th></tr><tr>${ys}</tr></thead><tbody>${list.join('')}</tbody></table></div>`;
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
  const rule = `<div class="v3-opt v3b-rule"><div><span>시나리오 규칙</span>${v3bSw(x, 'sw.scn_rule', V3B_RULE, x.sw.scn_rule || 'research')}</div></div>`;
  const res = v3bScnRes(x);
  return v3Sec('근거와 가중치', v3bSotpTg(x) ? '<span class="meta">사업부별 합산 기준</span>' : '', tbl)
    + v3Sec('시나리오별로 다른 가정', '', `${rule}<div data-o="b14.as" class="v3b-asw">${v3bAssump(x, c)}</div>`)
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

// ---------- 15 사업부별 합산 ----------
/* 값 하나짜리 가정(배수, WACC, 영구성장률) 칸. 머리의 입력 적용을 따르는 가정 칸과 같은 키(a.<키>.<시나리오 또는 *>#0) */
function v3bAOne(x, K, fmt, lab) {
  const s = x.sc, base = x.rows0?.[s]?.[`CTL.a.${K}`]?.[0], key = v3AKey(x, K, 0);
  const cur = v3All(x) ? x.st.ov[`a.${K}.${s}#0`] || x.st.ov[key] : undefined;
  return v3In(x, key, base, { fmt, lab, d: fmt === 'pct' ? 2 : fmt === 'x' ? 1 : undefined, cur });
}
function v3bSotp(x, c) {
  const sp = x.I.sotp || {}, units = sp.units || [];
  if (!units.length) return ''; // 사업부 입력이 없는 사례는 카드 없음
  const mode = ['show', 'target'].includes(x.sw.sotp) ? x.sw.sotp : 'off', on = mode !== 'off', P = on ? x.res.sotp : null, nar = x.w <= 620, as0 = sp.assets || [];
  const disc = (k, lab, tip) => (on && as0.some((a) => (a.kind === 'listed') === (k === 'listed') && a.disc == null)
    ? `<div><span title="${tip}">${lab}</span><span class="v3b-oi">${v3In(x, `sw.sotp_disc_${k}`, c.switches[`sotp_disc_${k}`] ?? (k === 'listed' ? 0.5 : 0.3), { fmt: 'pct', d: 0, lab })}</span></div>` : '');
  const opt = `<div class="v3-opt"><div><span>사업부별 합산 평가</span>${v3bSw(x, 'sw.sotp', V3B_SOTP, mode)}</div>${disc('listed', '상장 자산 기본 할인', '할인을 따로 정하지 않은 상장 보유 자산에 씁니다.')}${disc('unlisted', '비상장 자산 기본 할인', '할인을 따로 정하지 않은 비상장 보유 자산에 씁니다.')}</div>`;
  if (!on) return v3Sec('사업부별 합산', '', opt, 'v3b-sotp');
  const note = `<div data-o="b15.sn">${v3bNote(x, ['sotp_target', 'sotp_input', 'sotp_why', 'sotp_cover', 'sotp_margin', 'sotp_double'], ['info'])}</div>`;
  if (!P || !P.scen) return v3Sec('사업부별 합산', v3bScDot(x, '단위 억원'), `${opt}${note}<div class="empty">합산 결과가 없습니다.</div>`, 'v3b-sotp');
  /* 결과 표: 세 시나리오 값, 계산 내용과 근거는 고른 시나리오 것 */
  const nc = 4 + (nar ? 0 : 1), tx = (basis, why) => `${basis ? `<p class="v3b-sb">${esc(basis)}</p>` : ''}${v3Why(why)}`;
  const vals = (f) => V3_SCEN.map((S) => `<td class="${S === x.sc ? 'c' : ''}">${f(S)}</td>`).join('');
  const tr = (cls, name, sub, f, t = '') => `<tr class="${cls}"><td class="st">${name}${sub ? `<small>${esc(sub)}</small>` : ''}</td>${vals(f)}${nar ? '' : `<td class="tx why">${t}</td>`}</tr>${nar && t ? `<tr class="wy"><td class="tx" colspan="${nc}">${t}</td></tr>` : ''}`;
  const grp = (g) => `<tr class="grp"><td class="tx" colspan="${nc}">${g}</td></tr>`, sc = (S) => P.scen[S] || {};
  const pc = (v) => (v3Ok(v) ? v3Pct(v, Math.abs(v * 100 - Math.round(v * 100)) > 1e-6 ? 1 : 0) : '-');
  const urows = (P.units || []).map((u) => tr('', esc(u.name || u.id), `${V3B_SOTP_M[u.method] || u.method || ''}${u.method === 'multiple' && u.metric ? ` ${V3B_SOTP_K[u.metric] || u.metric}` : ''}`, (S) => v3Num(u.ev?.[S]), tx(u.basis?.[x.sc], u.why))).join('');
  const arows = (P.assets || []).map((a, i) => tr('', esc(a.name || a.id), V3B_SOTP_A[a.kind] || '', () => v3Num(a.value), tx(`${a.kind === 'listed' ? '시가총액' : '평가액'} ${v3Eok(a.base)} × 지분율 ${pc(a.stake)} × (1 − 할인 ${pc(a.disc)})`, as0[i]?.why))).join('');
  const hqT = tx('', sp.hq?.why);
  const body = `${grp('사업부')}${urows}${tr('sum', '사업부 가치 합', '', (S) => v3Num(sc(S).units))}${arows ? `${grp('보유 자산')}${arows}${tr('sum', '보유 자산 가치 합', '', (S) => v3Num(sc(S).assets))}` : ''}
    ${grp('합산')}${v3Ok(sc(x.sc).hq) && (sc('Base').hq || sc('Bull').hq || sc('Bear').hq) ? tr('', '본사 비용', '차감', (S) => v3Num(sc(S).hq), hqT) : ''}${tr('sum', '합산 영업가치', '', (S) => v3Num(sc(S).ev))}
    ${tr('', '주주가치 다리 합', P.nonop === 'exclude' ? '비영업자산 제외' : '', (S) => v3Num(sc(S).net), '<p class="v3b-sb">현금성자산과 비영업자산에서 비주주청구권을 뺀 값. 전사 DCF와 같음</p>')}${tr('sum', '주주가치', '', (S) => v3Num(sc(S).eq))}
    ${tr('key', '주당 가치', '원', (S) => v3Num(sc(S).ps))}${tr('', '상승여력', '', (S) => v3bUp(sc(S).up))}${tr('', '전사 DCF 주당 가치', '원', (S) => v3Num(sc(S).dcf_ps))}${tr('', '전사 DCF 대비', '', (S) => v3bUp(sc(S).gap))}`;
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3b-so${nar ? ' v3b-itn' : ''}"><thead><tr><th class="st">구분</th>${V3_SCEN.map((S) => `<th class="${S === x.sc ? 'c' : ''}"><span class="v3-dot ${S}"></span>${S}</th>`).join('')}${nar ? '' : `<th class="tx why">계산 내용과 근거<small>${x.sc}</small></th>`}</tr></thead><tbody>${body}</tbody></table></div>`;
  const tg = mode === 'target', wv = P.wavg || {}, dw = P.dcf_wavg || {};
  const wcalc = v3bCalc('b15.sw', [['', '사업부별 합산 가중평균', v3Won(wv.ps), tg ? 'sum' : '', tg ? '목표주가에 씀' : ''], ['', '전사 DCF 가중평균', v3Won(dw.ps)]], [['', '전사 DCF 대비', v3bUp(P.gap)], ['', '상승여력', v3bUp(wv.up), '', `현재가 ${v3Won(x.t.close)}`]]);
  /* 사업부 가정: 값 하나짜리(배수, WACC, 영구성장률)는 칸으로, 연도별 가정은 가정 표로 */
  const ks = Object.keys(x.R).filter((id) => id.startsWith('CTL.a.sotp.')).map((id) => id.slice(6)), L = (K) => v3Lab(x, `CTL.a.${K}`);
  const ones = ks.filter((K) => L(K).cols === 'one'), fcs = ks.filter((K) => L(K).cols !== 'one');
  const fs = ones.length ? `<div class="v3-fs v3b-sof">${ones.map((K) => v3F(esc(L(K).name), v3bAOne(x, K, L(K).fmt, L(K).name))).join('')}</div>` : '';
  const its = fcs.map((K) => ({ key: K, name: L(K).name.replace(/\(배부하지 않은 판관비\)$/, '') }));
  /* 좁은 폭: 가정 이름 줄 아래에 연도 칸(명시 기간이 5년 이하면 가로 스크롤 없음) */
  const atN = () => { const t = `<table class="mk-tbl v3-t v3-at v3b-dl v3b-dln v3b-san"><thead><tr>${x.tl.fc.map((y) => `<th>${y}E</th>`).join('')}</tr></thead><tbody>${its.map((it) => `<tr class="nm"><td class="tx" colspan="${x.tl.N}"><b>${esc(it.name)}</b>${L(it.key).fmt === 'pct' ? '<small>%</small>' : ''}</td></tr><tr class="vl">${x.tl.fc.map((_, k) => `<td class="in">${v3ACell(x, it.key, k, L(it.key).fmt, null, it.name)}</td>`).join('')}</tr>`).join('')}</tbody></table>`; return x.tl.N > 5 ? `<div class="mk-scroll">${t}</div>` : t; };
  const at = !fcs.length ? '' : nar ? atN() : v3ATable(x, its, { hist: false, why: false, first: '가정' });
  return v3Sec('사업부별 합산', v3bScDot(x, '단위 억원'), `${opt}${note}<div data-o="b15.so">${tbl}</div><div class="v3-two v3b-two"><div><h3 class="v3-h3">가중평균</h3>${wcalc}</div><div></div></div>${fs || at ? `<h3 class="v3-h3">사업부 가정</h3>${fs}${at}` : ''}`, 'v3b-sotp');
}

// ---------- 15 상대가치 결합 ----------
v3Step(15, (x, c) => {
  const rel = x.I.rel || {}, rel0 = c.input.rel || {}, ps = rel.ps || {}, close = x.t.close, bl = x.res.blend || {}, wv = x.res.wavg || {}, has = v3Ok(ps.median);
  const upOf = (v) => v3bUp(v3Ok(v) && close ? v / close - 1 : null), y0 = x.tl.hist[x.tl.H - 1];
  const per = String(rel.period || '').replace(/^FY(\d)$/, (_, n) => `${y0 + +n}E`);
  /* 모델 실적 기준(x.res.rel_model): 평가 배수 중앙값에 엔진 시나리오 실적을 넣은 주당 가치. Base는 중앙값 줄에, Bull과 Bear는 시나리오 줄에. 없는 사례는 열을 뺌 */
  const rm = x.res.rel_model && x.res.rel_model.ps ? x.res.rel_model : null, rmN = rm ? V3B_RELM[rm.method] || '실적' : '';
  const rmPer = rm ? String(rm.period || '').replace(/^FY(\d)$/, (_, n) => `${y0 + +n}E`) : '', nar = x.w <= 620, rmC = rm && !nar; // rmC: 주당 가치 표에 열로 붙임(넓은 폭)
  const rmTip = rm ? `평가 배수 중앙값에 모델의 시나리오별 ${rmPer} ${rmN}을 넣은 주당 가치입니다.` : '';
  const mc = (S) => (rmC ? `<td class="bl" data-o="b15.rm.${S || 'x'}.ps">${S && v3Ok(rm.ps[S]) ? v3Num(v3bRnd(rm.ps[S], x.sw.round)) : ''}</td><td data-o="b15.rm.${S || 'x'}.m">${S && v3Ok(rm.metric?.[S]) ? v3Num(rm.metric[S]) : ''}</td>` : '');
  const drow = (name, v, S = '') => (v3Ok(v) || (S && rmC && v3Ok(rm.ps[S])) ? `<tr><td class="st">${name}</td><td>${v3Ok(v) ? v3Num(v) : ''}</td><td>${v3Ok(v) ? upOf(v) : ''}</td>${mc(S)}</tr>` : '');
  const scs = [...new Set([...V3_SCEN.filter((S) => S !== 'Base'), ...Object.keys(rel.scen || {})])];
  const dist = `<h3 class="v3-h3">주당 가치<small>원</small></h3><div class="mk-scroll"><table class="mk-tbl v3-t v3b-rel${rmC ? ' rm' : ''}"><thead><tr><th class="st">구분</th><th>주당 가치</th><th>상승여력</th>${rmC ? `<th class="bl" title="${esc(rmTip)} 중앙값 줄은 Base 실적입니다.">모델 실적 기준</th><th title="모델 ${esc(rmPer)} ${esc(rmN)}, 억원">${esc(rmN)}<small>억</small></th>` : ''}</tr></thead><tbody>
    <tr class="key"><td class="st">중앙값<small>결합에 사용</small></td><td class="in">${v3In(x, 'i.rel.ps.median', rel0.ps?.median, { fmt: 'won', cell: true, lab: '상대가치 주당 가치 중앙값' })}</td><td data-o="b15.mup">${upOf(ps.median)}</td>${mc('Base')}</tr>
    ${drow('25%', ps.q25)}${drow('75%', ps.q75)}${scs.map((S) => drow(esc(S), rel.scen?.[S], V3_SCEN.includes(S) ? S : '')).join('')}</tbody></table></div>${rm && nar ? `<h3 class="v3-h3" title="${esc(rmTip)}">모델 실적 기준<small>원</small></h3><table class="mk-tbl v3-t v3b-rel v3b-rmn"><thead><tr><th class="st">구분</th><th>주당 가치</th><th title="모델 ${esc(rmPer)} ${esc(rmN)}, 억원">${esc(rmN)}<small>억</small></th></tr></thead><tbody>${V3_SCEN.map((S) => `<tr><td class="st">${S}</td><td data-o="b15.rm.${S}.ps">${v3Ok(rm.ps[S]) ? v3Num(v3bRnd(rm.ps[S], x.sw.round)) : ''}</td><td data-o="b15.rm.${S}.m">${v3Ok(rm.metric?.[S]) ? v3Num(rm.metric[S]) : ''}</td></tr>`).join('')}</tbody></table>` : ''}`;
  const srcOpt = has && (rm || x.sw.rel_scen_src === 'model') ? `<div><span title="풋볼필드의 상대가치 범위에 쓰는 값입니다. 결합 목표주가는 중앙값을 그대로 씁니다.">Bull, Bear 기준</span>${v3bSw(x, 'sw.rel_scen_src', [['external', '외부 값'], ['model', '모델 연동', rm ? '모델의 Bull, Bear 실적에 평가 배수 중앙값을 곱한 값을 씁니다.' : '평가 배수 기간이 추정 1～3년차가 아니거나 배수, 주식 수가 없어 계산하지 못합니다.', !rm && x.sw.rel_scen_src !== 'model']], x.sw.rel_scen_src || 'external')}</div>` : '';
  const sp = Object.entries(rel.split || {});
  const split = sp.length ? `<h3 class="v3-h3">비교 집단별</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3b-rel"><thead><tr><th class="st">구분</th><th>기업 수</th><th>배수</th><th>주당 가치</th><th>상승여력</th></tr></thead><tbody>
    ${sp.map(([k, v]) => `<tr><td class="st">${esc(k)}</td><td>${v3Num(v.n)}</td><td>${v3Fmt(v.median, 'x', 1)}</td><td>${v3Num(v.per_share)}</td><td>${v3Ok(v.per_share) && close ? upOf(v.per_share) : v3bUp(v.upside)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const facts = `<div class="v3-opt">${rel.method ? v3bRo('평가 배수', rel.method) : ''}${per ? v3bRo('기준 기간', per) : ''}${v3Ok(rel.multiple) ? v3bRo('배수 중앙값', v3X(rel.multiple, 1)) : ''}${srcOpt}</div>`;
  const relCard = has || rel0.ps ? v3Sec('상대가치 결과', '', `${facts}<div class="v3-two v3b-two v3b-rt${rmC ? ' rm' : ''}"><div>${dist}</div><div>${split}</div></div>`)
    : v3Sec('상대가치 결과', '', `<div class="empty">상대가치 결과가 없어 ${v3bDcfName(x)}을 목표주가로 씁니다.</div>`);
  const w = Number(x.sw.blend_w), wp = Math.round(w * 100), w0 = c.switches.blend_w;
  const slider = `<div class="v3b-bw"><div class="v3b-bw-s"><div class="v3b-bw-l" data-o="b15.wl"><span>상대가치 ${v3Pct(1 - w, 0)}</span><span>${v3bDcfName(x)} ${v3Pct(w, 0)}</span></div>
      <input type="range" min="0" max="100" step="5" value="${v3Ok(wp) ? wp : 50}" data-v3b-bw aria-label="DCF 비중"${has ? '' : ' disabled'}></div>
    ${v3F('DCF 비중', v3In(x, 'sw.blend_w', w0, { fmt: 'pct', d: 0, lab: 'DCF 비중', dis: !has }))}</div>`;
  const wd = v3Ok(bl.w_dcf) ? bl.w_dcf : w, bad = wv.ok === false, one = (id) => v3V(x, id);
  const calc = v3bCalc('b15', [['', v3bDcfName(x), bad && !v3DcfTyp(x) ? '-' : v3Won(bl.dcf ?? wv.ps), '', `× ${v3Pct(wd, 0)}`], ['+', '상대가치', v3Won(bl.rel), has ? '' : 'off', `× ${v3Pct(1 - wd, 0)}`]],
    [['=', '목표주가', v3Won(bl.target), 'k big'], ['', '상승여력', v3bUp(bl.up), '', `현재가 ${v3Won(close)}`]]);
  const fy = (n) => (x.tl.fc[n] ? `${x.tl.fc[n]}E` : ''), im = [['SUM.implied_pe', `PER ${fy(0)}`], ['SUM.implied_pe_fy2', `PER ${fy(1)}`], ['SUM.implied_ev_ebitda', `EV/EBITDA ${fy(0)}`]].filter(([id]) => v3Ok(one(id)));
  const imp = im.length ? `<div data-o="b15.im"><h3 class="v3-h3">목표주가 기준 배수</h3><div class="v3b-calc"><table class="va-calc"><tbody>${im.map(([id, nm]) => v3bRow(['', nm, v3X(one(id), 1)])).join('')}</tbody></table></div></div>` : '';
  const warn = `<div data-o="b15.msg">${bad ? '<p class="v3b-warn">시나리오 가중치 합이 100%가 아니라 목표주가를 계산하지 않습니다.</p>' : ''}</div>`;
  return relCard + v3bSotp(x, c) + v3Sec('결합', '', `${slider}${warn}<div class="v3-two v3b-two"><div><h3 class="v3-h3">목표주가</h3>${calc}</div><div>${imp}</div></div>`);
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
   열은 과거 H년, 명시 N년, 전환 M년, 종료연도, 과거 CAGR, 추정 CAGR. 묶음(tbody)마다 접고 펴며, 접힌 묶음은 합계 줄만 만든다.
   CAGR 두 열은 엔진 행 <행>.cagr_h, <행>.cagr_f 값만 보여 준다(화면에서 계산하지 않음. 행이 없는 줄은 빈칸).
   DCF 과거 참고 3년(DCF.hist.<항목>)은 짝이 되는 DCF.<항목> 줄의 과거 칸에 넣어 한 줄로 보여 준다.
   상태: x.st.yo 편 묶음 키 배열, x.st.yh 과거 연도 보이기(0이면 추정만).
   묶음을 누르면 화면을 통째로 다시 그리지 않고 그 tbody만 바꾼다(표 안 스크롤 위치를 지키려고). */

/* 묶음 표. sheets: labels[id].sheet, sum: 접혔을 때 보일 합계 줄(sumRe: 줄 ID 규칙으로). DCF 시트는 FCFF 행까지(cut 0)와 그 뒤(cut 1)로 나누고,
   사업부별 합산 행(DCF.sotp.*)은 그 둘에 섞지 않고 「사업부별 합산」 묶음에 그 사업부 가정(CTL.a.sotp.*)과 함께 둠 */
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
  { k: 'fcff', name: 'FCFF', sheets: ['DCF'], cut: 0, sum: ['DCF.nopat', 'DCF.reinv', 'DCF.fcff'],
    tip: 'FCFF = 세후영업이익 + 상각비 − CAPEX − 순운전자본 증가(이자 지급 전). 현금흐름표로 구한 FCF나 Bloomberg 같은 데이터 서비스의 FCF는 정의가 달라 값이 다를 수 있습니다.' },
  { k: 'val', name: '할인과 가치', sheets: ['DCF'], cut: 1, sum: ['DCF.wacc_t', 'DCF.df', 'DCF.pv'] },
  { k: 'sotp', name: '사업부별 합산', sheets: ['DCF'], sum: ['DCF.sotp.hq_cost'], sumRe: /^DCF\.sotp\.u\.[^.]+\.(rev|ebit)$/ },
  { k: 'adj', name: '정상화 실적', sheets: ['ADJ'], sum: ['ADJ.rev_norm', 'ADJ.ebit_norm'] },
  { k: 'etc', name: '그 밖의 가정', sheets: [], sum: [] },
];
/* 가정 키 → 그 가정을 입력 칸으로 보여 줄 결과 행(이름과 값을 견줘 정함).
   표에 없는 키는 규칙으로 찾음: rev.<줄>.<변수> → REV.l.<줄>.<변수>, sga_<묶음>_pct → OPX.sga.<묶음>.pct, sga_<묶음>_val → OPX.sga.<묶음>,
   그 밖은 행 ID 뒷부분이 키와 같은 행(dso → NWC.dso, cogs_r → OPX.cogs_r, payout → EQ.payout, capex_exp → PPE.capex_exp, noncash_oth → DCF.noncash_oth 등).
   찾은 행의 서식이 다르거나 추정 연도 값이 가정 값과 한 해도 안 맞으면 짝으로 보지 않고 「그 밖의 가정」에 둠. 맞지 않는 해의 칸은 계산값으로 보여 줌 */
const V3Y_PAIR = { tax_eff: 'TAX.eff', tax_adj: 'TAX.adj', tax_credit: 'TAX.credit', debt_rate: 'DEBT.rate', rnd_pct: 'RND.pct', rou_add_abs: 'PPE.rou_add', cb_convert: 'DEBT.cb.conv' };
const V3Y_RATIO = { pct: 1, x: 1, days: 1 };

/* 사업부별 합산 계산표의 줄 이름(labels 이름에 붙은 풀이를 덜어 냄) */
const V3Y_SOTP = { 'DCF.sotp.ev': '합산 영업가치', 'DCF.sotp.net': '주주가치 다리 합', 'DCF.sotp.dcf_ps': '전사 DCF 주당 가치', 'DCF.sotp.gap': '전사 DCF 대비', 'DCF.sotp.hq': '본사 비용 가치' };
const v3yOpen = (x) => (Array.isArray(x.st.yo) ? x.st.yo : []);
/* 보일 과거 연도 수(x.st.yn). 처음은 사례의 과거 연도 전부(예전 상태 yh = 0이면 0) */
const v3yNH = (x) => { const H = x.tl.H, v = x.st.yn; if (v == null || v === '') return +x.st.yh === 0 && x.st.yh != null ? 0 : H; return Math.max(0, Math.min(H, Math.trunc(+v) || 0)); };
const v3yNear = (a, b) => v3Ok(a) && v3Ok(b) && Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a));
const v3yFmt = (v, fmt) => (fmt === 'amt' && v3Ok(v) && Math.abs(v) < 10 ? (Math.abs(v) < 0.05 ? '0' : v3Num(v, 1)) : v3Fmt(v, fmt).replace(/^-(0(?:\.0+)?%?)$/, '$1'));
/* 어색한 행 이름 다듬기: custom.<키>는 그 비용이 따라가는 매출 줄 이름으로, 가정 행의 「g」「val」 꼬리는 우리말로 */
function v3yName(x, id) {
  let n = v3Lab(x, id).name;
  if (n.includes('custom.')) n = n.replace(/custom\.([A-Za-z0-9_]+)/g, (m, k) => {
    const g = x.I.opex?.groups?.[`custom.${k}`], ln = g?.line && (x.I.revbuild?.lines || []).find((l) => l.id === g.line);
    return g?.name || (ln ? `${ln.name} 연동 비용` : k);
  });
  if (V3Y_SOTP[id]) n = V3Y_SOTP[id];
  return n.replace(/ g$/, ' 성장률').replace(/ val$/, '').replace(/\(차이\)$/, '');
}
/* 줄 이름 칸 툴팁. 기타비유동부채: 운전자본에서 뺀 당기법인세부채, 미지급배당금이 여기 들어 있음(input.nwc_excl, 분류가 nonop일 때) */
function v3yTip(x, id) {
  if (id !== 'BS.oncl') return '';
  const ne = x.I.nwc_excl, cl = ne?.cl;
  if (!Array.isArray(cl) || (ne.class || 'nonop') !== 'nonop') return '';
  const v = cl[cl.length - 1], y = x.tl.hist[x.tl.H - 1];
  return `${ne.names?.length ? ne.names.join(', ') : '당기법인세부채, 미지급배당금'} 포함(운전자본에서 뺀 금액)${v3Ok(v) && v ? `, ${y}년 말 ${v3Num(v, 1)}억` : ''}`;
}
/* CAGR 열 머리의 연수: 엔진 행 이름 끝의 「CAGR(4년)」에서 */
function v3yCgYears(x) {
  const yr = (suf) => { const id = Object.keys(x.lab).find((k) => k.endsWith(suf) && x.R[k]), m = id && /CAGR\((\d+)년\)/.exec(x.lab[id].name); return m ? +m[1] : null; };
  return { h: yr('.cagr_h'), f: yr('.cagr_f') };
}

/* 그릴 때마다 한 번: 열, 시트별 행, 가정과 결과 행의 짝 */
function v3yView(x) {
  const { H, N, M } = x.tl, nH = v3yNH(x), showH = nH > 0, cols = [];
  x.tl.hist.forEach((y, i) => { if (i >= H - nH) cols.push({ k: 'h', i, label: `${y}`, bl: '' }); });
  x.tl.fc.forEach((y, i) => cols.push({ k: 'f', i, label: `${y}E`, bl: i === 0 && showH ? ' bl' : '' }));
  x.tl.fade.forEach((y, i) => cols.push({ k: 'd', i, label: `${y}E`, bl: i === 0 ? ' bl' : '' }));
  cols.push({ k: 't', i: 0, label: '종료연도', bl: M ? '' : ' bl' });
  const sheet = {}, chk = {}, tail = {}, keys = [], dh = {};
  for (const id of Object.keys(x.lab)) {
    const L = x.lab[id];
    if (L.cols === 'one' || !x.R[id]) continue;
    if (id.startsWith('DCF.hist.')) { // 과거 참고 3년: 짝이 되는 DCF 줄이 있으면 그 줄의 과거 칸으로, 없으면 보통 줄로
      const p = `DCF.${id.slice(9)}`;
      if (x.lab[p] && x.R[p] && x.lab[p].cols === 'dcf') dh[p] = id; else (sheet[L.sheet] ||= []).push(id);
      continue;
    }
    if (id.startsWith('CTL.a.')) { if (L.cols === 'fc') keys.push(id.slice(6)); continue; }
    /* 검증 줄은 차이가 0이어야 하는 행만(이름이 「(차이)」로 끝나거나 ID가 .check). 고정 부서 인당 매출 같은 참고 행(kind check)은 보통 줄로 */
    if (L.kind === 'check' && L.fmt === 'amt' && (/\(차이\)$/.test(L.name) || /\.check(_[a-z]+)?$/.test(id))) (chk[L.sheet] ||= []).push(id); else (sheet[L.sheet] ||= []).push(id);
    tail[id.slice(id.indexOf('.') + 1)] ??= id;
  }
  const pair = {}, A = {}, rest = [], sotpA = [];
  const drv = !!(x.R['PPE.capex_capa'] || x.R['PPE.capex_store']); // 설비 능력, 점포 수 드라이버가 있으면 확장 CAPEX 행은 직접 입력 + 드라이버라 가정과 짝이 아님
  for (const K of keys) {
    if (K.startsWith('sotp.')) { A[K] = x.R[`CTL.a.${K}`]; pair[`CTL.a.${K}`] = K; sotpA.push(`CTL.a.${K}`); continue; }
    const a = x.R[`CTL.a.${K}`], fmt = x.lab[`CTL.a.${K}`].fmt;
    let rid = V3Y_PAIR[K], m;
    if (!rid) rid = (m = /^rev\.(.+)\.([^.]+)$/.exec(K)) ? `REV.l.${m[1]}.${m[2]}` : (m = /^sga_(.+)_pct$/.exec(K)) ? `OPX.sga.${m[1]}.pct` : (m = /^sga_(.+)_val$/.exec(K)) ? `OPX.sga.${m[1]}` : tail[K];
    const RL = rid && x.lab[rid], r = rid && x.R[rid], off = RL && RL.cols === 'hist+fc' ? H : 0;
    A[K] = a;
    if (RL && r && RL.fmt === fmt && RL.cols !== 'one' && !pair[rid] && !(drv && K === 'capex_exp') && a.some((v, i) => v3yNear(r[off + i], v))) pair[rid] = K;
    else { pair[`CTL.a.${K}`] = K; rest.push(`CTL.a.${K}`); }
  }
  return { cols, sheet, chk, pair, A, rest, sotpA, dh, showH, H, N, M };
}

/* 표 한 줄. o: {lv 들여쓰기 단계, name 바꿔 쓸 이름, sum 합계 줄} */
function v3yTr(x, V, id, o = {}) {
  const L = x.lab[id], r = x.R[id];
  if (!L || !r) return '';
  const { H, N, M } = V, T = L.cols, fmt = L.fmt, K = V.pair[id], ratio = V3Y_RATIO[fmt] && !id.startsWith('CTL.'), name = o.name || v3yName(x, id), eid = esc(id);
  const hr = T === 'dcf' && V.dh[id] ? x.R[V.dh[id]] : null; // DCF 과거 참고(값이 없는 해는 비움)
  let tds = '';
  for (const c of V.cols) {
    const v = c.k === 'h' ? (T === 'hist+fc' ? r[c.i] : hr && hr[c.i] != null ? hr[c.i] : undefined) : c.k === 'f' ? (T === 'hist+fc' ? r[H + c.i] : r[c.i]) : T !== 'dcf' ? undefined : c.k === 'd' ? r[N + c.i] : r[N + M];
    if (K && c.k === 'f' && (v3AHas(x, K, c.i) || v3yNear(v, V.A[K][c.i]))) tds += `<td class="in${c.bl}">${v3ACell(x, K, c.i, fmt, null, name)}</td>`;
    else tds += `<td${c.bl ? ' class="bl"' : ''}${K && c.k !== 'h' ? ` data-o="yr:${eid}:${c.k}${c.i}"` : ''}>${v === undefined ? '' : v3yFmt(v, fmt)}</td>`;
  }
  const cg = (suf) => { const g = x.R[`${id}.${suf}`]; return g ? v3Pct(g[0]) : ''; }; // 엔진 행 <행>.cagr_h, <행>.cagr_f
  const tip = v3yTip(x, id);
  const unit = L.unit && L.unit !== '억원' && L.unit !== '%' ? `<small>${esc(L.unit)}</small>` : '';
  const lv = o.lv ?? (ratio ? 1 : 0), cls = `${o.sum && !ratio ? 'sum' : ''}${ratio ? ' r' : ''}${lv ? ` l${Math.min(lv, 3)}` : ''}${o.sub ? ' sub' : ''}`.trim();
  return `<tr${cls ? ` class="${cls}"` : ''}${K ? '' : ` data-o="yr:${eid}"`}><td class="st" title="${esc(tip ? `${name}\n${tip}` : name)}">${esc(name)}${unit}</td>${tds}<td class="cg h"${K ? ` data-o="yr:${eid}:cgh"` : ''}>${cg('cagr_h')}</td><td class="cg"${K ? ` data-o="yr:${eid}:cg"` : ''}>${cg('cagr_f')}</td></tr>`;
}
/* 검증 줄: 차이가 0이면 「일치」, 어긋나면 빨간 숫자 */
function v3yChkTr(x, V, id) {
  const L = x.lab[id], r = x.R[id], { H } = V;
  let tds = '';
  for (const c of V.cols) {
    const v = c.k === 'h' ? r[c.i] : c.k === 'f' ? (L.cols === 'hist+fc' ? r[H + c.i] : r[c.i]) : undefined;
    tds += v == null ? `<td${c.bl ? ' class="bl"' : ''}></td>` : Math.abs(v) > 1e-6 ? `<td class="bad${c.bl}">${v3Num(v, Math.abs(v) < 10 ? 2 : 0)}</td>` : `<td${c.bl ? ' class="bl"' : ''}>일치</td>`;
  }
  return `<tr class="chk" data-o="yr:${esc(id)}"><td class="st">${esc(v3yName(x, id))}</td>${tds}<td class="cg h"></td><td class="cg"></td></tr>`;
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
  const isSum = (id) => g.sum.includes(id) || !!(g.sumRe && g.sumRe.test(id));
  if (g.k === 'sotp') { // 사업부마다 가정 줄 다음에 계산 줄, 끝에 본사 비용
    const d = ids.filter((id) => id.startsWith('DCF.sotp.')), all = [...V.sotpA, ...d], pre = (id) => { const m = /^(?:CTL\.a|DCF)\.sotp\.(u\.[^.]+|hq)/.exec(id); return m ? m[1] : 'z'; };
    const ord = [...new Set(all.map(pre))].sort((a, b) => (a === 'hq' || a === 'z') - (b === 'hq' || b === 'z'));
    return ord.flatMap((p) => all.filter((id) => pre(id) === p)).map((id) => ({ id, sum: isSum(id) }));
  }
  if (g.sheets.includes('DCF')) ids = ids.filter((id) => !id.startsWith('DCF.sotp.'));
  if (g.cut != null) { const i = ids.indexOf('DCF.fcff'); ids = i < 0 ? (g.cut ? [] : ids) : g.cut ? ids.slice(i + 1) : ids.slice(0, i + 1); }
  if (g.k === 'debt') {
    const live = {};
    for (const id of ids) { const m = /^DEBT\.([^.]+)\.([^.]+)$/.exec(id); if (m && m[2] !== 'rate' && x.R[id].some((v) => v)) live[m[1]] = 1; } // 이자율 줄은 늘 값이 있어 판정에서 뺌
    ids = ids.filter((id) => { const m = /^DEBT\.([^.]+)\.[^.]+$/.exec(id); return !m || live[m[1]]; });
  }
  return ids.map((id) => ({ id, sum: isSum(id) }));
}
function v3yBody(x, V, g) {
  const open = v3yOpen(x).includes(g.k), rows = v3yRows(x, V, g), chk = g.k === 'sotp' ? [] : g.sheets.flatMap((s) => V.chk[s] || []);
  if (!rows.length && !chk.length) return '';
  const shown = open ? rows : rows.filter((r) => g.sum.includes(r.id) || (g.sumRe && g.sumRe.test(r.id))).map((r) => ({ id: r.id, sum: true }));
  let h = `<tbody data-v3y-b="${g.k}"><tr class="grp"><td class="st"><button type="button" class="v3y-g" data-v3y-g="${g.k}" aria-expanded="${open}"${g.tip ? ` title="${esc(g.tip)}"` : ''}>${esc(g.name)}</button></td><td colspan="${V.cols.length + 2}"></td></tr>`;
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
    return `<tr${cls ? ` class="${cls}"` : ''}><th>${op ? `${op} ` : ''}${esc(v3yName(x, id))}</th><td>${/^DCF\.(up|sotp\.up|sotp\.gap)$/.test(id) ? v3Up(v) || '-' : v3yOne(v, L.fmt, cnt)}</td></tr>`;
  };
  const keC = v3V(x, 'WACC.ke_capm'), keD = v3Ok(keC) && Math.abs(keC - (v3V(x, 'WACC.ke') || 0)) > 1e-9; // CAPM 참고 줄은 자기자본비용과 다를 때만
  const tbl = (title, parts) => { const b = parts.map(([cls, rows]) => (rows ? `<tbody${cls ? ` class="${cls}"` : ''}>${rows}</tbody>` : '')).join(''); return b ? `<div><h3 class="v3-h3">${title}</h3><table class="va-calc">${b}</table></div>` : ''; };
  const wacc = tbl('WACC', [
    ['', row('WACC.rf') + row('WACC.beta', { op: '+' }) + row('WACC.erp', { op: '×' }) + row('WACC.prem', { op: '+', zero: false }) + row('WACC.ff3.smb', { zero: false, cls: 'sub' }) + row('WACC.ff3.hml', { zero: false, cls: 'sub' }) + row('WACC.firm_prem', { zero: false, cls: 'sub' })],
    ['', row('WACC.ke', { op: '=' }) + (keD ? row('WACC.ke_capm', { cls: 'sub' }) : '') + row('WACC.we')],
    ['', row('WACC.kd_pre') + row('WACC.t_m') + row('WACC.kd', { op: '=' }) + row('WACC.wd')],
    ['res', row('WACC.wacc', { cls: 'k' }) + row('WACC.wacc_s') + row('DCF.g_s')],
  ]);
  const eq = tbl('주주가치', [
    ['', row('DCF.pv_sum') + row('DCF.tv_gordon', { zero: false }) + row('DCF.tv_exit', { zero: false }) + row('DCF.tv') + row('DCF.pv_tv', { op: '+' }) + row('DCF.tv_share')],
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
  /* 사업부별 합산(켰고 사업부 입력이 있을 때만 행이 있음): 값 하나짜리 가정, 사업부와 보유 자산 가치, 합계 */
  const so = (re) => Object.keys(x.lab).filter((id) => re.test(id) && x.lab[id].cols === 'one' && x.R[id]);
  const sotp = x.R['DCF.sotp.ev'] ? tbl('사업부별 합산', [
    ['', so(/^CTL\.a\.sotp\./).map((id) => row(id)).join('')],
    ['', so(/^DCF\.sotp\.u\.[^.]+\.ev$/).map((id, i) => row(id, { op: i ? '+' : '' })).join('') + row('DCF.sotp.units', { op: '=' })],
    ['', so(/^DCF\.sotp\.h\./).map((id) => row(id, { op: '+' })).join('') + row('DCF.sotp.hq', { op: '−', zero: false })],
    ['res', row('DCF.sotp.ev', { op: '=' })],
    ['', row('DCF.sotp.net', { op: '+' })],
    ['res', row('DCF.sotp.eq', { op: '=' }) + row('DCF.sotp.ps', { cls: 'k' })],
    ['', row('DCF.sotp.up') + row('DCF.sotp.dcf_ps') + row('DCF.sotp.gap')],
  ]) : '';
  return wacc + eq + ps + sotp;
}

v3Tab('yr', (x) => {
  const V = v3yView(x), body = V3Y_G.map((g) => v3yBody(x, V, g)).join('');
  if (!body) return '<div class="card"><div class="empty">연도별 값이 없습니다.</div></div>';
  const cy = v3yCgYears(x), cgt = [cy.h ? `과거 ${cy.h}년` : '', cy.f ? `명시 기간 ${cy.f}년` : ''].filter(Boolean).join(', ');
  const tools = `<div class="v3y-tools"><button class="btn ghost sm" type="button" data-v3y-all="1">모두 펴기</button><button class="btn ghost sm" type="button" data-v3y-all="0">모두 접기</button>
    <div class="v3y-hn"><span>과거 연도</span>${v3Seg('yn', [0, ...Array.from({ length: V.H }, (_, i) => i + 1)].map((n) => [n, n ? `${n}년` : '없음']), v3yNH(x))}</div><span class="meta">단위 억원${cgt ? `, CAGR ${cgt}` : ''}</span></div>`;
  const head = `<tr><th class="st"><span class="v3-dot ${x.sc}"></span>${x.sc}</th>${V.cols.map((c) => `<th${c.bl ? ' class="bl"' : ''}>${c.label}</th>`).join('')}<th class="cg h"${cy.h ? ` title="과거 CAGR(${cy.h}년)"` : ''}>과거 CAGR</th><th class="cg"${cy.f ? ` title="명시 기간 CAGR(${cy.f}년)"` : ''}>추정 CAGR</th></tr>`;
  const table = `<div class="v3y-wrap" data-v3-keep="yr"><table class="mk-tbl v3-t v3y-t" style="--v3y-n: ${V.cols.length}"><colgroup><col class="c1">${'<col>'.repeat(V.cols.length)}<col class="cg"><col class="cg"></colgroup><thead>${head}</thead>${body}</table></div>`;
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
  nci_value: '비지배지분 평가', assoc_value: '관계기업 평가', dbo_claim: '퇴직급여 청구권 반영', dcf_model: '가치평가 모형', ddm_stage: '배당할인모형 단계', ddm_payout: 'DDM 배당 기준', rim_tv: 'RIM 종료가치', rim_omega: 'RIM 지속계수',
  fcfe_debt: 'FCFE 순차입', ty_margin: '종료연도 영업이익률', fade_margin_target: '전환 기간 목표 이익률', mid_first: '첫해 기중 할인', tv_mid: '종료가치 기중 할인',
  scn_rule: '시나리오 규칙', weights: '시나리오 가중치', sens_step: '민감도 간격', mc: '몬테카를로', mc_n: '몬테카를로 시행 횟수', mc_seed: '몬테카를로 시드', mc_wacc_sd: 'WACC 표준편차', mc_g_sd: '영구성장률 표준편차',
  mc_min_spread: 'WACC와 영구성장률 최소 차이', mc_bins: '히스토그램 구간 수', mc_up_th: '상승 확률 기준', rdcf_r: '리버스 할인율', rdcf_target: '리버스 목표 주가', blend_w: 'DCF 결합 비중',
  company_type: '회사 유형', purpose: '평가 목적', fye_month: '결산월', calendarize: '달력 연도 환산', calendarize_mode: '달력 연도 환산 방식', calendar_stock: '달력 연도 잔액 기준', total_beta: '총베타', total_beta_mode: '총베타 방식',
  dlom: '비유동성 할인', control_prem: '경영권 프리미엄', key_person: '핵심 인력 할인', holding_disc: '지주사 할인', holding_disc_scope: '지주사 할인 범위', typ_block: '유형별 제외 방법', lbo: 'LBO', lbo_preset: 'LBO 프리셋',
  alt_models: '다른 모형 계산', adj_fc: '진행 연도 매출 보정 반영', eps_basis: 'EPS 주식 수', beta_u_tax: '무차입 베타 세율', ucost_interp: '단위원가 보간', loan_class: '대여금, 보증금 분류',
  scn_base_rule: '가정 없는 수량, 단가 성장률 기본값', hc_basis: '인당 인건비 직원 수 기준', hc_rnd: 'R&D 부서 인원', share_years: '판관비 몫 평균 연수', taxpay_class: '당기법인세부채, 미지급배당금',
  fade_g_manual: '전환 기간 성장률 직접 입력', ke_bond_rp: '타인자본비용 가산', rel_scen_src: '상대가치 Bull, Bear', nci_pbr: '비지배지분 PBR', beta_adj_on: '베타 조정 대상', reinv_end: '재투자율 끝값', ty_reinv: '종료연도 재투자',
  sotp: '사업부별 합산 평가', sotp_disc_listed: '상장 보유 자산 기본 할인', sotp_disc_unlisted: '비상장 보유 자산 기본 할인', bridge_basis: '주주가치 다리 잔액', ke_firm_prem: '기업 고유 프리미엄', ke_esg_prem: 'ESG 가산',
  resid_cost: '체계 차이 매출의 원가', freight_class: '운반비 묶음', xl_calc: '엑셀 계산 방식',
  rim_fade_years: 'RIM 전환 기간', rim_blend_w: 'RIM 종료가치 혼합 비중', holding_hot_per: '지주사 과열 PER 기준', holding_hot_pbr: '지주사 과열 PBR 기준',
  rel_fund_basis: '펀더멘털 배수 이익 기준', rel_payout_basis: '펀더멘털 배수 배당성향', rel_roe_basis: '펀더멘털 배수 ROE', rel_matrix_line: '매트릭스 기준선', rel_reg_cut: '회귀 표본 PER 범위 규칙', rel_adj_on: '차이 조정 대상',
  rel_hist_n: '과거 평균 배수 연수', rel_th_spread: '배수별 가치 차이 기준', rel_th_ev_mcap: 'EV와 시가총액 차이 기준', rel_th_price_spike: '비교기업 주가 급등 기준', rel_th_cap_gap: '자본구조 차이 기준',
};
const V3Y_SW_SUB = { wacc: 'WACC', g: '영구성장률', margin: '영업이익률', growth: '성장률' };
const V3Y_SW_PCT = new Set(['min_cash', 'blend_w', 'beta_adj_w', 'prem_size', 'prem_spec', 'prem_country', 'wacc_override', 'ty_margin', 'fade_margin_target', 'dlom', 'control_prem', 'key_person', 'holding_disc', 'mc_wacc_sd', 'mc_g_sd', 'mc_min_spread', 'mc_up_th', 'weights', 'sens_step', 'fade_g_manual', 'ke_bond_rp', 'ke_firm_prem', 'ke_esg_prem', 'sotp_disc_listed', 'sotp_disc_unlisted',
  'rel_th_spread', 'rel_th_ev_mcap', 'rel_th_price_spike', 'rel_th_cap_gap']);
/* 시장 값(m.)과 한 값 덮기(o.): [이름, 처음 값] */
const V3Y_MO = {
  'm.rf': ['무위험이자율', (x) => x.c.py.rows.Base?.['WACC.rf']?.[0]], 'm.erp': ['주식위험프리미엄', (x) => x.c.py.rows.Base?.['WACC.erp']?.[0]],
  'o.g': ['영구성장률', (x) => x.c.py.rows.Base?.['DCF.g_s']?.[0]], 'o.ty_margin': ['종료연도 영업이익률', (x) => (x.c.py.rows[x.sc]?.['DCF.margin'] || []).slice(-1)[0]],
  'o.wacc': ['WACC 직접 입력', (x) => x.c.py.rows.Base?.['WACC.wacc']?.[0]], 'o.wacc_shift': ['WACC 가산', () => 0], 'o.growth_add': ['매출 성장률 가산', () => 0], 'o.fade_g_add': ['전환 기간 성장률 가산', () => 0],
  'o.fade_g_shift': ['전환 기간 성장률 일괄 가산', () => 0],
};
/* input 경로(i.)의 낱말. 경로에 모르는 낱말이 하나라도 있으면 키를 그대로 보여 줌 */
const V3Y_IN = {
  bridge: '주주가치 다리', shares: '주식 수', beta: '베타', rel: '상대가치', rdcf: '리버스', cons: '컨센서스', tax: '법인세', avg_exclude: '평균에서 뺀 연도',
  cash: '현금', st_fin: '단기금융자산', nonop: '비영업자산', debt: '이자부부채', nci: '비지배지분', pref_mkt: '우선주 시가', dbo: '퇴직급여 과소적립', claims: '기타 청구권', amount: '금액',
  st: '단기차입금', lt: '장기차입금', bond: '사채', cb: '전환사채', lease: '리스부채', deriv: '파생상품부채', issued: '발행주식 총수', treasury: '자기주식', pref: '우선주',
  peers: '비교기업', include: '포함', de: 'D/E', raw: '원 베타', ps: '주당 가치', median: '중앙값', q25: '25%', q75: '75%', multiple: '배수', exit_mult: '종료 배수', nol: '이월결손금',
  price: '주가', n: '기간', path: '성장 형태', npm: '순이익률', conv: 'FCF 전환 비율', pe: '최종 P/E', adj: '보정 항목',
  fvpl: 'FVPL 금융부채', market: '시장 값', g_peer_mature: '업계 성숙기 성장률', g_manual: '영구성장률 직접 입력', erp: '주식위험프리미엄', historical: '과거 수익률', implied: '내재 프리미엄', manual: '직접 입력',
  kd_market_yield: '회사채 수익률', kd_recent_issue: '최근 발행 금리', kd_peer_avg: '비교기업 타인자본비용 평균', kd_manual: '타인자본비용 직접 입력',
  capex: '투자', int_life: '무형자산 내용연수', int_remain: '기존 무형자산 남은 연수', rnd: '연구개발비', cap_life: '연구자산 상각 연수', ppe_roll: '유형자산', classes: '묶음', life: '내용연수',
  ltm: '최근 12개월', ebitda: 'EBITDA', ni: '순이익', old_terms: '승계 차입', rate: '금리', spread: '가산금리', floor: '금리 하한', mand_pct: '연 의무 상환', term: '만기 연수',
  ppa: '인수가격 배분', items: '항목', pct: '초과 인수가 대비', dtl_rate: '이연법인세 세율', tax_deductible: '세무상 상각 인정', tranches: '차입 구성', rcf: '리볼버', tla: 'Term Loan A', tlb: 'Term Loan B', sub: '후순위채',
  mult: 'EBITDA 배수', pik_rate: 'PIK 금리', sweep_pct: '임의 상환 비율', max_iter: '이자 순환 반복 한도', party_fee_to_lender: '금융 수수료 대주 수입', entry_basis: '진입 기준', min_cash: '최소 현금', base_rate: '기준금리',
  bal: '결산 말 잔액', fy0: '직전 결산 말', fy0p: '그 전 결산 말', sotp: '사업부별 합산',
  remain_life: '기존 잔액 남은 연수',
  party_irr: '참여자별 수익',
  lbo: 'LBO', close_gap: '종결일 간격', entry_net_debt: '종결일 순차입금', premium: '인수 프리미엄', stake: '인수 지분율', tx_fee_pct: '거래 수수료율', exit_year: '회수 연도', equity_value: '지분가치',
  options: '스톡옵션', bw: '신주인수권', rsu: 'RSU', rcps: '상환전환우선주', qty: '수량', strike: '행사가', conv_price: '전환가', basic_hist: '연도별 유통주식수', scen: '시나리오',
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
  if (Array.isArray(v)) return v.length ? (v.some((y) => y && typeof y === 'object') ? `${v.length}건` : v.join(', ')) : '없음';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
/* 스위치 값: 화면 설명 조각(60_info.js)의 V3I_SW 에 우리말 이름이 있으면 그것으로 */
const v3ySwVal = (n, v, pct) => {
  const T = typeof V3I_SW !== 'undefined' ? V3I_SW[n] : null;
  if (T && Array.isArray(v) && v.length) return v.map((y) => T[y] || y).join(', ');
  return (typeof v === 'string' && T?.[v]) || v3yVal(v, pct);
};
/* input 값 가운데 글자로 된 선택지 이름(경로의 마지막 낱말 기준) */
const V3Y_INV = { close_gap: { none: '조정 없음', stub: '첫해 기간 반영' }, entry_basis: { fy0: '직전 결산', ltm: '최근 12개월' } };
const V3Y_INP = new Set(['g_peer_mature', 'g_manual', 'kd_market_yield', 'kd_recent_issue', 'kd_peer_avg', 'kd_manual', 'historical', 'implied', 'premium', 'stake', 'tx_fee_pct', 'rate', 'spread', 'floor', 'mand_pct', 'pik_rate', 'sweep_pct', 'dtl_rate', 'pct', 'base_rate']); // 비율로 보여 줄 input 값
/* 평균에서 뺀 연도가 {all: [연도], <가정 키>: [연도] 또는 {exclude: [연도], include: [연도]}} 꼴일 때 「가정 이름 연도 뺌」, 「가정 이름 연도 다시 넣음」으로.
   include는 모든 평균에서 빼 둔 해(all)를 그 가정 평균에만 다시 넣은 것 */
function v3yExVal(x, v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v3yVal(v);
  const nm = (k) => (k === 'all' ? '모든 평균' : x.lab[`CTL.a.${k}`] ? v3yName(x, `CTL.a.${k}`) : k), ys = (a) => (Array.isArray(a) && a.length ? a.join(', ') : ''), out = [];
  for (const [k, o] of Object.entries(v)) {
    const ex = ys(Array.isArray(o) ? o : o?.exclude), inc = Array.isArray(o) ? '' : ys(o?.include);
    if (ex) out.push(`${nm(k)} ${ex} 뺌`);
    if (inc) out.push(`${nm(k)} ${inc} 다시 넣음`);
  }
  return out.length ? out.join('; ') : '없음';
}
/* 덮기 키 하나를 [이름, 처음 값, 바꾼 값]으로 */
function v3yOv(x, k, e) {
  const c = x.c, h = k.indexOf('#'), b = h < 0 ? k : k.slice(0, h), sub = h < 0 ? null : k.slice(h + 1);
  if (b.startsWith('a.')) {
    const j = b.lastIndexOf('.'), K = b.slice(2, j), S = b.slice(j + 1), id = `CTL.a.${K}`, L = v3Lab(x, id), r0 = x.rows0?.[S === '*' ? 'Base' : S]?.[id];
    if (sub == null || !x.lab[id]) {
      const tr = /^debt_rate\.(.+)$/.exec(K), nm = x.lab[id] ? v3yName(x, id) : tr && x.lab[`DEBT.${tr[1]}.rate`] ? v3yName(x, `DEBT.${tr[1]}.rate`) : K;
      return [`${nm} ${S === '*' ? '세 시나리오' : S}`, '', typeof e.v === 'number' ? v3yOne(e.v, x.lab[id] ? L.fmt : tr ? 'pct' : 'num') : '연도별 값'];
    }
    return [`${v3yName(x, id)} ${S === '*' ? '세 시나리오' : S}${L.cols === 'one' ? '' : ` ${x.tl.fc[+sub] ? `${x.tl.fc[+sub]}년` : `${+sub + 1}번째 해`}`}`, v3yOne(r0?.[+sub], L.fmt), v3yOne(e.v, L.fmt)];
  }
  if (b.startsWith('sw.')) {
    const n = b.slice(3), base = c.switches[n], pct = V3Y_SW_PCT.has(n);
    return [`${V3Y_SW[n] || n}${sub != null ? ` ${V3Y_SW_SUB[sub] || sub}` : ''}`, v3ySwVal(n, sub != null ? base?.[sub] : base, pct), v3ySwVal(n, e.v, pct)];
  }
  if (b.startsWith('i.')) {
    const base = v3Path(c.input, b.slice(2));
    const last = (sub ?? b).split('.').pop(), iv = (v) => (b === 'i.avg_exclude' ? v3yExVal(x, v) : (typeof v === 'string' && V3Y_INV[last]?.[v]) || v3yVal(v, V3Y_INP.has(last)));
    return [v3yIName(c, b.slice(2), sub) || k, iv(sub != null ? base?.[sub] : base), iv(e.v)];
  }
  const mo = V3Y_MO[k];
  return mo ? [mo[0], v3yVal(mo[1](x), true), v3yVal(e.v, true)] : [k, '', v3yVal(e.v)];
}
const V3Y_LV = { err: ['오류', 'red'], warn: ['주의', 'warn'], info: ['참고', ''] };
const V3Y_ACC = { rev: '매출', cogs: '매출원가', sga: '판관비', ebit: '영업이익', ebt: '세전이익', ni: '순이익' };

/* 보정 항목 편집(input.adj, 덮기 키 i.adj에 배열 통째로). 엔진이 읽는 계정은 rev, cogs, sga, ebit(금액은 실적에 더할 값, ebit는 판관비 차감으로 반영).
   과거 연도 항목만 평균(정상화 실적)에 들어가고, 추정 연도 항목은 점검 정보로만 남음 */
const V3Y_ADJ_ACC = ['rev', 'cogs', 'sga', 'ebit'];
const v3yAdjCur = (c) => JSON.parse(JSON.stringify(v3St(c).ov['i.adj']?.v ?? c.input?.adj ?? []));
function v3yAdj(x) {
  const c = x.c, adj = x.I.adj || [], b0 = c.input?.adj || [], hist = x.tl.hist, yrs = [...hist, ...x.tl.fc], sel = (n, f, opts, cur) => `<select class="select v3y-as${JSON.stringify(b0[n]?.[f]) === JSON.stringify(cur) ? '' : ' chg'}" data-v3y-adjs="${f}" data-n="${n}" aria-label="${f === 'year' ? '연도' : '계정'}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const rows = adj.map((a, n) => {
    const yo = yrs.includes(a.year) ? yrs : [a.year, ...yrs], ao = V3Y_ADJ_ACC.includes(a.account) ? V3Y_ADJ_ACC : [a.account, ...V3Y_ADJ_ACC];
    const amt = `<span class="v3-ci"><input type="text" inputmode="decimal" autocomplete="off" data-v3y-adj="amount" data-n="${n}" value="${esc(v3Ok(a.amount) ? String(a.amount) : '')}" class="${b0[n] && b0[n].amount === a.amount ? '' : 'chg'}" aria-label="금액"></span>`;
    const why = `<input type="text" autocomplete="off" class="input v3y-aw${b0[n] && (b0[n].why || '') === (a.why || '') ? '' : ' chg'}" data-v3y-adj="why" data-n="${n}" value="${esc(a.why || '')}" placeholder="근거" aria-label="근거"${a.why || a.src ? ` title="${esc([a.why, Array.isArray(a.src) ? a.src.join(', ') : a.src].filter(Boolean).join('\n'))}"` : ''}>`;
    return `<tr><td class="st">${sel(n, 'year', yo.map((y) => [y, hist.includes(y) ? `${y}` : `${y}E`]), a.year)}</td><td class="tx">${sel(n, 'account', ao.map((k) => [k, V3Y_ACC[k] || k]), a.account)}</td><td class="in">${amt}</td><td class="tx why">${why}</td>
      <td class="v3y-ad"><button class="btn ghost sm" type="button" data-v3y-adjdel="${n}" aria-label="${n + 1}번째 보정 삭제">${ico('trash', 'sm')}</button></td></tr>`;
  }).join('');
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3y-nt v3y-adj"><thead><tr><th class="st">연도</th><th class="tx">계정</th><th>금액</th><th class="tx why">근거</th><th class="v3y-ad"></th></tr></thead><tbody>${rows || `<tr><td class="st" colspan="5"><div class="empty">보정 항목이 없습니다.</div></td></tr>`}</tbody></table></div>`;
  const tools = `<div class="v3y-at"><button class="btn sm" type="button" data-v3y-adjadd>${ico('plus', 'sm')}보정 추가</button>${v3Chk(x, 'sw.use_norm', !!x.sw.use_norm, '평균에 정상화 실적 사용')}</div>`;
  // 정상화 결과: 과거 연도에 든 항목이 있을 때만
  const H = x.tl.H, has = adj.some((a) => hist.includes(a.year)), R = x.R;
  const nrow = (name, id, cls = '') => (R[id] ? `<tr class="${cls}"><td class="st">${name}</td>${hist.map((_, i) => `<td class="h">${v3Fmt(R[id][i], 'amt')}</td>`).join('')}</tr>` : '');
  const norm = has ? `<h3 class="v3-h3">정상화 실적</h3><div class="mk-scroll" data-o="yr:adjn"><table class="mk-tbl v3-t"><thead><tr><th class="st">항목</th>${hist.map((y) => `<th>${y}</th>`).join('')}</tr></thead><tbody>
    ${nrow('매출', 'IS.rev')}${nrow('정상화 매출', 'ADJ.rev_norm', 'sum')}${nrow('영업이익', 'IS.ebit')}${nrow('정상화 영업이익', 'ADJ.ebit_norm', 'sum')}</tbody></table></div>` : '';
  return `<h3 class="v3-h3">보정</h3>${tbl}${tools}${norm}`;
}
v3On('input', '[data-v3y-adj]', (el, x) => {
  const c = x.c, n = +el.dataset.n, f = el.dataset.v3yAdj, arr = v3yAdjCur(c);
  if (!arr[n]) return false;
  if (f === 'amount') { const v = v3NumOf(el.value); if (v == null) return false; arr[n].amount = v; } else arr[n].why = el.value;
  v3SetOv(c, 'i.adj', arr);
  const b = c.input?.adj?.[n]; el.classList.toggle('chg', !b || (f === 'amount' ? b.amount !== arr[n].amount : (b.why || '') !== arr[n].why));
  v3Later();
  return false;
});
v3On('change', '[data-v3y-adjs]', (el, x) => {
  const c = x.c, n = +el.dataset.n, f = el.dataset.v3yAdjs, arr = v3yAdjCur(c);
  if (!arr[n]) return false;
  arr[n][f] = f === 'year' ? +el.value : el.value;
  v3SetOv(c, 'i.adj', arr);
  return true;
});
v3On('click', '[data-v3y-adjdel]', (el, x) => { const arr = v3yAdjCur(x.c); arr.splice(+el.dataset.v3yAdjdel, 1); v3SetOv(x.c, 'i.adj', arr); return true; });
v3On('click', '[data-v3y-adjadd]', (el, x) => { const arr = v3yAdjCur(x.c); arr.push({ year: x.tl.hist[x.tl.H - 1], account: 'rev', amount: 0, why: '' }); v3SetOv(x.c, 'i.adj', arr); return true; });

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
  const oo = x.I.one_offs || [];
  const ooT = oo.length ? `<h3 class="v3-h3">일회성 항목</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3y-nt"><thead><tr><th class="st">시기</th><th class="tx">계정</th><th class="tx">구분</th><th>금액</th><th class="tx why">근거</th></tr></thead><tbody>${oo.map((a) => `<tr><td class="st">${esc(a.year ?? '')}</td><td class="tx">${esc(a.account || '')}</td><td class="tx">${esc([a.level, a.kind].filter(Boolean).join(', '))}</td><td>${v3Sgn(a.amount)}</td><td class="tx why">${esc(a.why || '')}</td></tr>`).join('')}</tbody></table></div>` : '';
  const todo = c.notes?.todo || [];
  return v3Sec('점검', '', sum + bad + list, 'v3y-chk')
    + v3Sec('바꾼 입력', ovs.length ? `<span class="meta">${ovs.length}건</span>` : '', ovT)
    + v3Sec('보정과 일회성 항목', '<span class="meta">단위 억원</span>', v3yAdj(x) + ooT)
    + (todo.length ? v3Sec('리서치가 더 필요한 것', `<span class="meta">${todo.length}건</span>`, `<ul class="v3y-todo">${todo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`) : '');
});
v3On('click', '[data-v3y-undo]', (el, x) => { delete v3St(x.c).ov[el.dataset.v3yUndo]; return true; });

// ---------- 보고서 탭: 요약(sum), 상세(det), 시나리오(scen) ----------
// 요약은 SK오션플랜트 IM 35쪽 구성(결론, 근거 숫자, 그림, 부록 순), 상세는 Valley 상세 보고서(실적 추정 차트와 단계별 근거), 시나리오는 세 값 비교와 가중치.
// 입력은 시나리오 가중치(sw.weights#<S>)뿐이고 나머지는 x.res 를 읽기만 함. 판단 메모는 x.st.memo
const V3P_SC = { Bull: 'bull', Base: 'base', Bear: 'bear' };
const V3P_KD = { synthetic: '이자보상배율로 정한 합성 등급', rating: '신용등급 스프레드', effective: '실효이자율', market_yield: '회사채 시장 수익률', recent_issue: '최근 발행 금리', peer_avg: '비교기업 평균', extra_spread: '합성 등급과 추가 스프레드', manual: '직접 입력', input: '직접 입력' };
const V3P_NOTE = { 매출원가: ['cogs_r'], 법인세: ['tax_eff'], 타인자본비용: ['kd'], 재투자: ['capex', 'capex_maint_pct', 'dep_rate', 'amort_rate', 'int_capex_other_pct', 'dso', 'dio', 'dpo', 'oca_pct', 'ocl_pct'], '재무 구조': ['debt', 'debt_rate', 'cash_rate', 'payout', 'nci_share', 'lease_repay_rate'] };
const V3P_NOTE_NM = { capex: 'CAPEX', debt: '차입', kd: '타인자본비용' };
const v3pAdd = (a) => (a || []).reduce((s, v) => s + (v3Ok(v) ? +v : 0), 0);
const v3pDot = (S) => `<i class="v3-dot v3p-dot ${S}"></i>`;
const v3pHead = (x, unit) => `<span class="v3-dot ${x.sc}"></span><span class="meta">${x.sc}</span>${unit ? `<span class="meta act">단위 ${unit}</span>` : ''}`;
const v3pAxPct = (v) => v3Pct(v, Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? 0 : 1); // 축 눈금은 정수 %, 값은 소수 한 자리
const v3pSumPct = (v) => (v3Ok(v) ? `${+(v * 100).toFixed(2)}%` : '-');
const v3pW2 = (x) => (x.w > 1000 ? v3Wd(x, 2) : v3Wd(x)); // 카드 한 장 안 두 칸(.v3p-two)의 한 칸 폭
const v3pWg = (x) => (x.w > 1000 ? Math.max(280, Math.floor((x.w - 16) / 2) - 48) : v3Wd(x)); // 카드 두 장을 나란히(.v3p-grid) 놓을 때 한 장 안쪽 폭
/* 사업부별 합산(x.res.sotp)이 목표주가의 DCF 자리에 들어간 사례(mode = target)는 시나리오 주당 가치, 가중평균, 민감도가 합산 값. 그 화면 머리에 표시 */
const v3pSotpOn = (x) => x.res.sotp?.mode === 'target';
const v3pSotpTag = (x) => (v3pSotpOn(x) ? '<span class="meta act">사업부별 합산 기준</span>' : '');
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
  if (wv.ok === false && !v3DcfTyp(x)) say = v3pWhyNot(wv);
  else if (!v3Ok(bl.rel) || !(wd < 1)) say = `${v3DcfName(x)} ${v3Won(bl.dcf)}을 목표주가로 반영${bl.rel_blocked ? `, 상대가치는 회사 유형에 맞지 않아 뺌` : ''}`;
  else if (!(wd > 0)) say = `상대가치 ${v3Won(bl.rel)}을 목표주가로 반영`;
  else say = `${v3DcfName(x)} ${v3Won(bl.dcf)}과 상대가치 ${v3Won(bl.rel)}을 ${v3Num(wd * 100)} : ${v3Num((1 - wd) * 100)} 비중으로 결합`;
  const cells = V3_SCEN.map((S) => {
    const y = sc[S] || {}, on = S === x.sc;
    return `<button type="button" class="v3p-sc ${on ? 'on' : ''}" data-v3-seg="sc" data-v="${S}" aria-pressed="${on}"><span>${v3pDot(S)}${S}</span><small>가중치 ${v3Pct(wt[S])}</small><b>${v3Ok(y.ps) ? v3Won(y.ps) : '계산 불가'}</b><em>${v3Up(y.up)}</em></button>`;
  }).join('');
  const rng = v3pRange(x, v3Wd(x)), cov = typeof v3qCover === 'function' ? v3qCover(x) : null;
  return v3Sec('평가 결과', v3pSotpTag(x), `<div data-o="p-top"><p class="v3p-say">${say}</p><div class="v3p-scs">${cells}</div>${rng ? `<div class="v3p-rng"${cov ? ` title="${esc(`${cov.text} ${cov.tip}`)}"` : ''}>${rng}</div>` : ''}</div>`, 'v3p-top');
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
  const ps = one('DCF.ps'), tg = v3pSotpOn(x), dps = tg ? one('DCF.sotp.dcf_ps') : ps, won = (v) => (v3Ok(v) ? v3Won(v) : '계산 불가');
  const bb = x.sw.bridge_basis && x.sw.bridge_basis !== 'latest' ? (x.res.checks || []).filter((k) => k.id === 'bridge_basis').map((k) => `<p class="v3p-bb${k.level === 'info' ? '' : ' warn'}">${esc(k.text)}</p>`).join('') : '';
  return v3Sec('가치 다리', v3pHead(x, '억원'), `<div data-o="p-br">${v3cWaterfall({ w, h: x.w > 1000 ? 440 : 280, items, fmt: (v) => v3Num(v), title: '영업가치에서 주주가치까지' })}
    <p class="v3p-cap"><span>주식 수 <b>${v3Num(one('DCF.shares'))}주</b></span><span>${tg ? '전사 DCF 주당 가치' : '주당 가치'} <b>${won(dps)}</b></span>${tg ? `<span>사업부별 합산 주당 가치 <b>${won(ps)}</b></span>` : ''}</p>${bb}</div>`);
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
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3p-mixt"><thead><tr><th class="st">구분</th>${amt ? `<th>${y0} 매출</th>` : ''}<th>비중</th>${hasLast ? `<th class="bl">${fc[N - 1]}E 비중</th>` : ''}</tr></thead><tbody>
    ${its.map((it) => `<tr><td class="st"><span class="v3c-leg"><span class="${it.cls}">${esc(it.label)}</span></span></td>${amt ? `<td>${v3Num(it.val)}</td>` : ''}<td>${v3Pct(it.share)}</td>${hasLast ? `<td class="bl">${v3Pct(it.last)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  return v3Sec('매출 구성', amt ? '<span class="meta act">단위 억원</span>' : '', `<div class="v3p-mix" data-o="p-mix">${donut}${tbl}</div>`);
}
/* 다른 모형(FCFE, 배당할인모형, 잔여이익모형, APV) 가운데 계산할 것. sw.alt_models는 'all' 또는 모형 키 목록(빈 목록은 엔진이 all로 읽어 하나는 남김).
   목표주가 모형(sw.dcf_model)은 늘 계산 */
const V3P_AM = [['fcfe', 'FCFE'], ['ddm', '배당할인모형'], ['rim', '잔여이익모형'], ['apv', 'APV']];
function v3pAmOn(x) {
  const am = x.sw.alt_models, all = V3P_AM.map(([k]) => k);
  return new Set(am == null || am === 'all' || (Array.isArray(am) && !am.length) ? all : all.filter((k) => (Array.isArray(am) ? am : [am]).includes(k)));
}
/* 다른 모형 스위치: [스위치, 모형 키, 이름, 주당 가치 행, [[값, 단추 이름, 툴팁]]]. 엔진 E19가 읽음(기본 schedule, two).
   「다른 가정」 표는 처음 값이라 바꿔도 그대로이고, 단추 옆 값(Base, 지금 입력)이 따라 바뀜 */
const V3P_AMS = [
  ['fcfe_debt', 'fcfe', 'FCFE 순차입', 'DCF.fcfe.ps', [['schedule', '차입 스케줄', '차입 스케줄의 인출과 상환을 순차입으로 봅니다.'], ['target_ratio', '목표 부채 비중', '재투자에 목표 부채 비중을 곱한 금액을 순차입으로 봅니다.'], ['current_ed', '지금 부채 비중', '재투자에 지금 부채 비중을 곱한 금액을 순차입으로 봅니다.']]],
  ['ddm_stage', 'ddm', '배당할인모형 단계', 'DCF.ddm.ps', [['two', '2단계', '명시 기간과 전환 기간 배당에 종료가치를 더합니다.'], ['gordon', '1단계', '첫해 배당을 자기자본비용과 영구성장률의 차이로 나눕니다.'], ['three', '3단계', '전환 기간이 0년이면 5년 전환 구간을 따로 둡니다. 전환 기간이 있으면 2단계와 같습니다.'], ['h', 'H 모형', '직전 배당의 영구성장 가치에 초과 성장분을 추정 기간의 절반만큼 더합니다.']]],
];
function v3pAmSw(x, on) {
  return V3P_AMS.filter(([, m, , id]) => (on.has(m) || x.sw.dcf_model === m) && v3Row(x, id, 'Base')).map(([sw, m, lab, id, opts]) => {
    const cur = x.sw[sw] ?? opts[0][0], ps = v3V(x, id, 0, 'Base');
    const seg = `<div class="mk-seg">${opts.map(([v, l, tip]) => `<button type="button" data-v3-ov="sw.${sw}" data-v="${esc(JSON.stringify(v))}" class="${v === cur ? 'on' : ''}" aria-pressed="${v === cur}" title="${esc(tip)}"${x.live ? '' : ' disabled'}>${l}</button>`).join('')}</div>`;
    return `<div><span>${lab}</span>${seg}<span class="v3p-amv" data-o="p-am-${m}">${v3Ok(ps) ? v3Won(ps) : '계산 불가'}</span></div>`;
  }).join('');
}
/* 스위치 하나만 바꾼 결과(파이썬이 처음 값으로 계산). 기본값은 처음 값의 Base 주당 가치 */
function v3pAlt(x) {
  const alt = x.res.alt || [], b = x.c.py?.scen?.Base?.ps;
  if (!alt.length) return '';
  const on = v3pAmOn(x), isAm = (k) => V3P_AM.some(([y]) => y === k), off = (a) => isAm(a.key) && !on.has(a.key) && x.sw.dcf_model !== a.key;
  const pick = alt.some((a) => isAm(a.key)) ? `<div class="v3-opt v3p-am"><div><span>다른 모형 계산</span>${V3P_AM.map(([k, nm]) => `<label class="v3-ck"><input type="checkbox" data-v3p-am="${k}"${on.has(k) ? ' checked' : ''}${!x.live || (on.has(k) && on.size === 1) ? ' disabled' : ''}><span>${nm}</span></label>`).join('')}</div>${v3pAmSw(x, on)}</div>` : '';
  const tr = (a) => {
    if (off(a)) return `<tr class="same"><td class="st">${esc(a.label || a.key || '')}</td><td colspan="4" class="tx">계산에서 뺌</td></tr>`;
    if (a.error || !v3Ok(a.ps)) return `<tr class="same"><td class="st">${esc(a.label || a.key || '')}</td><td colspan="4" class="tx">${esc(a.error || '계산 불가')}</td></tr>`;
    const d = v3Ok(b) ? a.ps - b : null, cls = d > 0 ? 'up' : d < 0 ? 'dn' : '';
    return `<tr class="${d === 0 ? 'same' : ''}"><td class="st">${esc(a.label || a.key || '')}</td><td>${v3Won(a.ps)}</td><td>${d == null ? '-' : `<span class="${cls}">${d > 0 ? '+' : ''}${v3Num(d)}원</span>`}</td><td>${d == null || !b ? '-' : d === 0 ? '0.0%' : v3Up(d / b)}</td><td>${v3Pct(a.wacc, 2)}</td></tr>`;
  };
  const tbl = (rows) => `<div class="mk-scroll"><table class="mk-tbl v3-t v3p-alt"><thead><tr><th class="st">바꾼 가정</th><th>주당 가치</th><th>기본값과 차이</th><th>차이율</th><th>WACC</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  const h = Math.ceil(alt.length / 2), two = x.w > 1000 && alt.length > 8;
  return v3Sec('다른 가정', `<span class="meta act">Base ${v3Won(b)}, 처음 값 기준</span>`, (two ? `<div class="v3p-two">${tbl(alt.slice(0, h))}${tbl(alt.slice(h))}</div>` : tbl(alt)) + pick);
}
v3On('change', '[data-v3p-am]', (el, x) => {
  const all = V3P_AM.map(([k]) => k), on = v3pAmOn(x);
  if (el.checked) on.add(el.dataset.v3pAm); else on.delete(el.dataset.v3pAm);
  const nx = all.filter((k) => on.has(k));
  if (!nx.length) return true;
  v3SetOv(x.c, 'sw.alt_models', nx.length === all.length ? 'all' : nx);
  return true;
});
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
  const tip = 'FCFF = 세후영업이익 + 상각비 − CAPEX − 순운전자본 증가(이자 지급 전). 현금흐름표로 구한 FCF나 Bloomberg 같은 데이터 서비스의 FCF는 정의가 달라 값이 다를 수 있습니다.';
  return v3Sec(`<span class="v3p-tip" title="${esc(tip)}">FCFF와 현재가치</span>`, v3pHead(x, '억원'), `<div data-o="p-fcff">${v3cLegend([{ label: 'FCFF', cls: 's2' }, { label: '현재가치', cls: 's1' }])}${ch}</div>`);
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
/* 사업부별 합산(x.res.sotp, 스위치 sotp가 show나 target이고 사업부 입력이 있을 때만). 읽기 전용이고 입력과 가정 칸은 입력 15단계.
   사업부 줄 아래 작은 글은 고른 시나리오의 계산 내용(엔진 문장), 보유 자산 줄 아래는 금액, 지분율, 할인. 금액은 억원 */
const V3P_SOTP_M = { sales: 'EV/Sales', ebit: 'EV/EBIT', ebitda: 'EV/EBITDA' };
function v3pSotp(x) {
  const sp = x.res.sotp, sc = sp?.scen;
  if (!sp || !sc || !V3_SCEN.every((S) => sc[S])) return '';
  const tr = (name, f, cls = '', sub = '') => `<tr class="${cls}"><td class="st">${name}</td>${V3_SCEN.map((S) => `<td class="${S === x.sc ? 'on' : ''}">${f(S)}</td>`).join('')}</tr>${sub ? `<tr class="v3p-sb"><td class="st" colspan="4">${sub}</td></tr>` : ''}`;
  const grp = (g) => `<tr class="grp"><th class="st">${g}</th><td colspan="3"></td></tr>`, sm = (t) => (t ? `<small>${esc(t)}</small>` : ''), amt = (v) => v3Num(v);
  const units = (sp.units || []).filter(Boolean), assets = (sp.assets || []).filter(Boolean), hq = sp.hq || {}, hasHq = V3_SCEN.some((S) => v3Ok(hq[S]) && Math.abs(hq[S]) > 1e-9);
  let body = units.length ? grp('사업부') : '';
  for (const u of units) body += tr(`<span${u.why ? ` class="v3p-tip" title="${esc(u.why)}"` : ''}>${esc(u.name || u.id)}</span>${sm(u.method === 'dcf' ? '사업부 DCF' : `배수법${V3P_SOTP_M[u.metric] ? ` ${V3P_SOTP_M[u.metric]}` : ''}`)}`, (S) => amt(u.ev?.[S]), '', esc(u.basis?.[x.sc] || ''));
  if (units.length > 1) body += tr('사업부 가치 합', (S) => amt(sc[S].units), 'sum');
  if (assets.length) {
    body += grp('보유 자산');
    for (const a of assets) body += tr(`${esc(a.name || a.id)}${sm(a.kind === 'listed' ? '상장' : a.kind === 'unlisted' ? '비상장' : '')}`, () => amt(a.value), '',
      [v3Ok(a.base) ? `금액 ${v3Eok(a.base)}` : '', v3Ok(a.stake) ? `지분율 ${v3Pct(a.stake, 1)}` : '', v3Ok(a.disc) ? `할인 ${v3Pct(a.disc, 1)}` : ''].filter(Boolean).join(', '));
    if (assets.length > 1) body += tr('보유 자산 가치 합', (S) => amt(sc[S].assets), 'sum');
  }
  body += grp('합계') + (hasHq ? tr('본사 비용<small>차감</small>', (S) => amt(hq[S])) : '') + tr('합산 영업가치', (S) => amt(sc[S].ev), 'sum')
    + tr(`<span class="v3p-tip" title="전사 DCF와 같은 값">주주가치 다리 합</span>${sp.nonop === 'exclude' ? sm('비영업자산 제외') : ''}`, (S) => amt(sc[S].net)) + tr('주주가치', (S) => amt(sc[S].eq), 'sum')
    + tr('주당 가치<small>원</small>', (S) => `<span${v3Ok(sc[S].ps_raw) ? ` title="반올림 전 ${esc(v3Won(sc[S].ps_raw))}"` : ''}>${v3Ok(sc[S].ps) ? amt(sc[S].ps) : '계산 불가'}</span>`, 'key') + tr('상승여력', (S) => v3Up(sc[S].up) || '-')
    + tr('전사 DCF 주당 가치<small>원</small>', (S) => amt(sc[S].dcf_ps)) + tr('전사 DCF 대비', (S) => v3Up(sc[S].gap) || '-');
  const kv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`, wv = sp.wavg || {}, dw = sp.dcf_wavg || {};
  const avg = v3Ok(wv.ps) || v3Ok(dw.ps) ? `<dl class="va-kv v3p-sokv">${kv('합산 가중평균', `${v3Won(wv.ps)}${v3Ok(wv.up) ? `<small>${v3Up(wv.up)}</small>` : ''}`)}${kv('전사 DCF 가중평균', v3Won(dw.ps))}${kv('전사 DCF 대비', v3Up(sp.gap) || '-')}</dl>` : '';
  const th = V3_SCEN.map((S) => `<th class="${S === x.sc ? 'on' : ''}">${v3pDot(S)}${S}</th>`).join('');
  return v3Sec('사업부별 합산', `<span class="meta">${sp.mode === 'target' ? '목표주가에 반영' : '참고'}</span><span class="meta act">단위 억원</span>`,
    `<div data-o="p-sotp"><div class="mk-scroll"><table class="mk-tbl v3-t v3p-kt v3p-sot"><thead><tr><th class="st">구분</th>${th}</tr></thead><tbody>${body}</tbody></table></div>${avg}</div>`, 'v3p-sotp');
}
function v3pDetScreen(x) {
  const wg = v3pWg(x);
  return `${v3pPerf(x)}<div class="v3p-grid">${v3pRevPath(x, wg)}${v3pFcff(x, wg)}</div>${v3pSotp(x)}${v3pStory(x)}`;
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
  // 현재가 이름은 첫째와 둘째 막대 사이 빈칸에서 선 바로 위에 씀. 자리가 모자라면 범례로
  const ct = `현재가 ${v3Won(close)}`, inl = v3Ok(close) && its.length > 1 && bw - b1 >= v3cTw(ct) + 12;
  const cx = inl ? v3cText(X(0) + bw / 2, Y(close) - 6, ct, 'ml s5', 'middle') : '';
  return (v3Ok(close) && !inl ? v3cLegend([{ label: ct, cls: 's5', kind: 'dash' }]) : '') + v3cSvg('v3c-bars', w, h, '시나리오별 주당 가치', grid + bars + cl + cx);
}
function v3pScenMain(x) {
  const c = x.c, r = x.res, sc = r.scen || {}, wv = r.wavg || {}, { H, N, fc } = x.tl, w0 = c.switches.weights || {}, ok = wv.ok !== false;
  const g = (S, k, fb) => v3V(x, `SCN.${S}.${k}`, 0, S) ?? fb;
  const row = (key, name, f, avg = '', cls = '') => `<tr data-o="p-sc-${key}" class="${cls}"><td class="st">${name}</td>${V3_SCEN.map((S) => `<td class="${S === x.sc ? 'on' : ''}">${f(S)}</td>`).join('')}<td class="bl">${avg}</td></tr>`;
  /* 좁은 폭에서는 다섯 열이 한 화면에 들어오게 금액 단위(원, 억)를 값에서 떼어 이름 옆 작은 글로 옮김 */
  const nar = v3Wd(x) < 560, won = (v) => (nar ? v3Num(v) : v3Won(v)), eok = (v) => (nar ? v3Num(v) : v3Eok(v)), sm = (...a) => { const t = a.filter(Boolean).join(' '); return t ? `<small>${t}</small>` : ''; };
  const yN = N ? `${fc[N - 1]}E` : '';
  const body = [row('ps', `내재 가치${sm(nar && '원')}`, (S) => (v3Ok(sc[S]?.ps) ? won(sc[S].ps) : '계산 불가'), ok ? won(wv.ps) : '-', 'sum'), row('up', '상승여력', (S) => v3Up(sc[S]?.up) || '-', ok ? v3Up(wv.up) : ''),
    N ? row('g1', `매출 성장률<small>${fc[0]}E</small>`, (S) => v3Pct(v3V(x, 'REV.growth', H, S))) : '', N ? row('rev', `매출${sm(yN, nar && '억')}`, (S) => eok(g(S, 'rev_last', v3V(x, 'IS.rev', H + N - 1, S)))) : '',
    N ? row('mg', `영업이익률${sm(yN)}`, (S) => v3Pct(g(S, 'ebit_m_last', v3V(x, 'IS.ebit_m', H + N - 1, S)))) : '',
    row('ni1', `지배순이익${sm('FY1', nar && '억')}`, (S) => eok(g(S, 'ni_fy1', null))), row('ni2', `지배순이익${sm('FY2', nar && '억')}`, (S) => eok(g(S, 'ni_fy2', null))),
    row('wacc', 'WACC', (S) => v3Pct(sc[S]?.wacc, 2)), row('tv', '종료가치 비중', (S) => v3Pct(sc[S]?.tv_share))].join('');
  const wrow = `<tr><td class="st">가중치<small>%</small></td>${V3_SCEN.map((S) => `<td class="in">${v3In(x, `sw.weights#${S}`, w0[S], { fmt: 'pct', cell: true, lab: `${S} 가중치` })}</td>`).join('')}<td class="bl" data-o="p-sc-wsum"><span class="${ok ? '' : 'v3p-bad'}">합 ${v3pSumPct(wv.sum)}</span></td></tr>`;
  const tbl = `<div><div class="mk-scroll"><table class="mk-tbl v3-t v3p-kt v3p-sct"><thead><tr><th class="st">항목</th>${V3_SCEN.map((S) => `<th class="${S === x.sc ? 'on' : ''}">${v3pDot(S)}${S}</th>`).join('')}<th class="bl">가중평균</th></tr></thead><tbody>${body}${wrow}</tbody></table></div>
    <div data-o="p-sc-msg">${ok ? '' : `<p class="v3p-warn">${v3pWhyNot(wv)}</p>`}</div></div>`;
  const cw = x.w > 1000 ? Math.max(280, Math.floor((x.w - 80) / 2.5)) : v3Wd(x);
  const why = x.I.notes_in?.scenario_why || {}, notes = V3_SCEN.map((S) => ({ S, text: why[S] || v3Note(x, `scenario.${S}`) })).filter((n) => n.text);
  return v3Sec('시나리오와 가중평균', v3pSotpTag(x), `<div class="v3p-scg">${tbl}<div data-o="p-sc-bars">${v3pScenBars(x, cw, x.w > 1000 ? 420 : 250)}</div></div>
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
/* 툴팁이 달린 글자(점선 밑줄) */
const v3qTip = (s, tip) => (tip ? `<span class="v3q-tip" title="${esc(tip)}">${s}</span>` : s);
const V3Q_TIP = {
  wacc: 'WACC는 높을수록 주당 가치가 내려갑니다. 현금흐름, 영구성장률, 추정 기간은 클수록 올라갑니다.',
  g: '영구성장률을 높이면 주당 가치가 올라갑니다.', gRoc: ' 안정기 ROC를 WACC와 같게 둔 기본 설정에서는 재투자도 같이 늘어 변화가 작습니다.',
  growth: '전환 기간이 없어 모든 매출 줄의 성장률에 같은 폭을 더해 본 값입니다.', fade_g: '전환 기간 성장률 전체에 같은 폭을 더해 본 값입니다.',
  tor: '영업이익을 움직이는 변수(매출 성장률, 영업이익률)가 대개 가장 크게 움직입니다. CAPEX는 길게 보면 감가상각과 맞물리고 운전자본 증가는 금액이 작아 영향이 작습니다.',
  cover: '모두 걸치면 평가가 현재가와 가깝다는 뜻입니다. 증권사 목표가는 높게 잡는 경향이 있고, 목표주가의 기준은 DCF입니다.',
};
/* 이중 변수 표 하나: 세로 WACC(o.yName), 가로 xName. 가운데 칸(mid, 지금 가정)보다 높으면 up(옅은 빨강), 낮으면 dn(옅은 파랑),
   차이가 표 안 가장 큰 차이에 가까울수록 진하게(--a 6～24%). 칸 툴팁은 현재가 대비.
   o = {yName, yTip, xTip 축 이름 툴팁, xt: (v) => 가로 칸 머리 툴팁} */
function v3qSensTbl(t, xName, xf, close, o = {}) {
  if (!t || !Array.isArray(t.x) || !Array.isArray(t.y) || !Array.isArray(t.z)) return '<div class="empty">표를 만들 값이 없습니다.</div>';
  const ci = Math.floor(t.y.length / 2), cj = Math.floor(t.x.length / 2), big = t.z.some((r) => (r || []).some((v) => v3Ok(v) && Math.abs(v) >= 1e6)); // 일곱 자리 값이 있으면 좁은 폭에서도 표 폭을 줄이지 않음
  const b = t.z[ci]?.[cj], eps = 1e-9, dv = (v) => (v3Ok(v) && v3Ok(b) && b ? v / b - 1 : 0);
  const mx = Math.max(0, ...t.z.flatMap((r) => (r || []).map((v) => Math.abs(dv(v)))));
  const cell = (v, i, j) => {
    const d = dv(v), mid = i === ci && j === cj, cls = mid ? 'mid' : d > eps ? 'up' : d < -eps ? 'dn' : '';
    const a = !mid && cls && mx > 0 ? Math.round(6 + 18 * Math.abs(d) / mx) : 0, up = v3qUpOf(v, close);
    return `<td${cls ? ` class="${cls}"` : ''}${a ? ` style="--a:${a}%"` : ''}${up != null ? ` title="현재가 대비 ${up > 0 ? '+' : up < 0 ? '−' : ''}${v3Num(Math.abs(up) * 100, 1)}%"` : ''}>${v3Num(v)}</td>`;
  };
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3q-st${big ? ' big' : ''}"><thead><tr><th class="st" rowspan="2">${v3qTip(esc(o.yName || 'WACC'), o.yTip)}</th><th class="ax" colspan="${t.x.length}">${v3qTip(esc(xName), o.xTip)}</th></tr>
    <tr>${t.x.map((v, j) => `<th class="${j === cj ? 'c' : ''}"${o.xt ? ` title="${esc(o.xt(v))}"` : ''}>${xf(v)}</th>`).join('')}</tr></thead>
    <tbody>${t.y.map((w, i) => `<tr><td class="st${i === ci ? ' c' : ''}">${v3Pct(w, 2)}</td>${(t.z[i] || []).map((v, j) => cell(v, i, j)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
/* 토네이도 WACC 줄 툴팁(M1-405). 1%p당 영향 비율은 엔진 값 sens.tornado_k.k(WACC ÷ 영구성장률. 없거나 null이면 배수 문장을 뺌).
   WACC가 가장 큰 줄이 아니면 가장 큰 줄 이름과 WACC 순위를 밝힘. 배수가 크면(안정기 ROC = WACC 설정) 까닭을 덧붙임 */
function v3qTorTip(x) {
  const nm = (r) => String(r.var ?? '').replace(/\s*\(.*?\)/g, ''), tr = (x.res.sens?.tornado || []).filter(Boolean);
  const wd = (r) => (v3Ok(r?.ps_lo) && v3Ok(r?.ps_hi) ? Math.abs(r.ps_hi - r.ps_lo) : 0);
  const w = tr.find((r) => nm(r) === 'WACC'), k = x.res.sens?.tornado_k?.k;
  if (!w || !wd(w)) return '';
  const ord = [...tr].sort((a, b) => wd(b) - wd(a)), rank = ord.indexOf(w) + 1;
  let t = rank === 1 ? '결과를 가장 크게 움직이는 단일 가정은 WACC입니다.' : `이 사례에서 결과를 가장 크게 움직이는 가정은 ${nm(ord[0])}이고 WACC는 ${rank}번째입니다.`;
  if (v3Ok(k) && k > 0) {
    const x1 = (v) => `${v3Num(v, 1)}배`; // 엔진 비율 그대로 소수 한 자리(휴젤 17.8배)
    t += k >= 1 ? ` 같은 1%p로 보면 WACC 영향이 영구성장률의 ${x1(k)}입니다.` : ` 같은 1%p로 보면 영구성장률 영향이 WACC의 ${x1(1 / k)}입니다.`;
    if (k > 5 && x.sw.roc_s === 'wacc') t += ' 안정기 ROC를 WACC와 같게 둔 설정에서는 영구성장률을 올려도 재투자가 같이 늘어 영향이 작게 나옵니다.';
  }
  return t;
}
/* 토네이도 줄: 엔진이 준 변수 이름에서 괄호 설명을 떼고, 움직인 폭을 단위에 맞춰 붙임(일수는 일, 베타는 숫자, 단위원가 끝값은 끝값 대비 %, 나머지는 %p) */
const V3Q_TOR_SHORT = { '종료연도 영업이익률': '종료 영업이익률', '매출채권 회전일수': '매출채권 일수', '유지 CAPEX 비율': '유지 CAPEX' };
function v3qTorRows(x, nar) {
  const wtip = v3qTorTip(x);
  return (x.res.sens?.tornado || []).filter((r) => r && (v3Ok(r.ps_lo) || v3Ok(r.ps_hi))).map((r) => {
    const nm = String(r.var ?? '').replace(/\s*\(.*?\)/g, ''), days = /일수/.test(nm), beta = /베타/.test(nm), rel = / 끝값$/.test(nm);
    const mag = (v) => (days ? `${v3Num(Math.abs(v))}일` : beta ? v3Num(Math.abs(v), 2) : `${v3Num(Math.abs(v) * 100, v3qD([r.lo, r.hi]))}${rel ? '%' : '%p'}`);
    const sg = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${mag(v)}`, sym = v3Ok(r.lo) && v3Ok(r.hi) && Math.abs(r.lo + r.hi) < 1e-12;
    return { label: nar ? `${V3Q_TOR_SHORT[nm] || nm}${sym ? ` ±${mag(r.hi)}` : ''}` : nm, lo_label: v3Ok(r.lo) ? sg(r.lo) : '', hi_label: v3Ok(r.hi) ? sg(r.hi) : '', ps_lo: r.ps_lo, ps_hi: r.ps_hi, tip: nm === 'WACC' ? wtip : '' };
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
  /* 표 2의 가로축은 엔진이 정함(x_kind): 전환 기간이 있으면 전환 기간 성장률 가산(fade_g), 없으면 명시 기간 매출 성장률 가산(growth). 이름은 x_name 그대로 */
  const wf = s.wacc_fade || {}, fk = wf.x_kind, fName = wf.x_name || '전환 기간 시작 성장률 가산';
  const steps = `<div class="v3q-step"><h3 class="v3-h3">간격</h3><div class="v3-fs">${[['wacc', 'WACC'], ['g', '영구성장률'], ['margin', '종료연도 영업이익률'], ['growth', fk === 'growth' ? '매출 성장률' : '전환 기간 성장률']]
    .map(([k, lab]) => v3F(lab, v3In(x, `sw.sens_step#${k}`, st0[k], { fmt: 'pct', d: 2, u: '%p', lab: `${lab} 간격`, dis: !x.live }))).join('')}</div></div>`;
  const tb = (key, xName, xf, o) => `<div data-o="q-s-${key}">${v3qSensTbl(s[key], xName, xf, close, o)}</div>`;
  const dm = v3qD(s.wacc_margin?.x), df = v3qD(s.wacc_fade?.x);
  const fo = { xTip: V3Q_TIP[fk] || '', xt: fk === 'fade_g' && v3Ok(wf.x_base) ? (v) => `전환 기간 첫해 성장률 ${v3Pct(wf.x_base + v, 2)}` : null };
  /* 다른 모형(배당할인모형, 잔여이익모형) 표: 세로 자기자본비용. 값이 없는 표는 뺌. 금융사이거나 목표주가 모형이 그 모형이면 처음부터 펴 둠 */
  const has = (t) => !!t && Array.isArray(t.z) && t.z.some((r) => (r || []).some(v3Ok));
  const am = [['ddm_ke_g', '배당할인모형', '영구성장률', (v) => v3Pct(v, 2)], ['rim_ke_roe', '잔여이익모형', '마지막 해 ROE', (v) => v3Pct(v, v3qD(s.rim_ke_roe?.x))]].filter(([k]) => has(s[k]));
  const amOpen = x.st.qam != null ? !!x.st.qam : x.sw.company_type === 'financial' || ['ddm', 'rim'].includes(x.sw.dcf_model);
  const amBtn = am.length ? `<div class="v3q-amb"><button class="btn ghost sm" type="button" data-v3q-am="${amOpen ? 0 : 1}" aria-expanded="${amOpen}">다른 모형 민감도 ${amOpen ? '접기' : '펴기'}</button></div>` : '';
  const amT = am.length && amOpen ? `<div class="v3q-sg v3q-am">${am.map(([k, nm, xn, xf]) => `<div data-o="q-s-${k}"><h3 class="v3-h3">${nm}<small>주당 가치</small></h3>${v3qSensTbl(s[k], xn, xf, close, { yName: 'Ke', yTip: '자기자본비용' })}</div>`).join('')}</div>` : '';
  const two = v3Sec('이중 변수', `<span class="meta">Base, 현재가 ${v3Won(close)}, 단위 원</span>${v3pSotpTag(x)}`, `<div class="v3q-sg">${steps}
    ${tb('wacc_g', '영구성장률', (v) => v3Pct(v, 2), { yTip: V3Q_TIP.wacc, xTip: V3Q_TIP.g + (x.sw.roc_s === 'wacc' ? V3Q_TIP.gRoc : '') })}${tb('wacc_margin', '종료연도 영업이익률', (v) => v3Pct(v, dm))}${tb('wacc_fade', fName, (v) => v3qPp(v, df), fo)}</div>${amBtn}${amT}`);
  const rows = v3qTorRows(x, nar);
  const tor = v3Sec(v3qTip('변수별 영향', V3Q_TIP.tor), `<span class="meta">Base, 단위 원</span>${v3pSotpTag(x)}`, `<div data-o="q-tor">${rows.length && v3Ok(b.ps)
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
v3On('click', '[data-v3q-am]', (el, x) => { x.st.qam = el.dataset.v3qAm === '1' ? 1 : 0; return true; });
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
/* 리버스 가정값 옆 과거 막대: 순이익률 = 지배순이익 ÷ 매출, FCF 전환 비율 = (영업현금흐름 − 유형자산 취득) ÷ 지배순이익(inputs.py rdcf의 직전 결산 값과 같은 정의) */
function v3qHist(x, kind) {
  const { hist, H } = x.tl, r = (id) => (v3Row(x, id) || []).slice(0, H), ni = r('IS.ni_parent'), rev = r('IS.rev'), cfo = r('CF.cfo'), cx = r('CF.capex_ppe');
  const vals = hist.map((_, i) => (kind === 'npm' ? (v3Ok(ni[i]) && rev[i] > 0 ? ni[i] / rev[i] : null)
    : v3Ok(cfo[i]) && v3Ok(cx[i]) && ni[i] > 0 ? (cfo[i] + cx[i]) / ni[i] : null));
  const ok = vals.filter(v3Ok);
  if (ok.length < 2) return '';
  const avg = ok.reduce((s, v) => s + v, 0) / ok.length;
  return `<span class="v3q-sp">${v3cSpark({ w: 96, h: 32, values: vals, labels: hist.map(String), avg, fmt: (v) => v3Pct(v, 1), title: `과거 ${kind === 'npm' ? '순이익률' : 'FCF 전환 비율'}` })}<small>평균 ${v3Pct(avg, 1)}</small></span>`;
}
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
    ${v3F('순이익률', v3In(x, 'i.rdcf.npm', R0.npm, { fmt: 'pct', lab: '순이익률', dis }) + v3qHist(x, 'npm'), 'v3q-hf')}${pe ? '' : v3F('FCF 전환 비율', v3In(x, 'i.rdcf.conv', R0.conv, { fmt: 'pct', lab: 'FCF 전환 비율', dis }) + v3qHist(x, 'conv'), 'v3q-hf')}</div>`;
  const why = !v3Ok(tgt) ? '맞출 주가를 입력해 주세요.' : !v3Ok(f0) || f0 <= 0 ? `${fName}가 0 이하라 성장률을 풀 수 없습니다.` : '이 주가와 맞는 성장률이 −90%에서 300% 사이에 없습니다.';
  const sN = v.rev_path?.length ? v.rev_path[v.rev_path.length - 1] : null;
  const res = v.ok ? `<div class="v3q-res"><div><span>내재 ${pe ? 'EPS' : 'FCF'} 성장률</span><b>${v3Pct(v.g, 2)}</b></div><div><span>내재 매출 성장률</span><b>${v3Pct(v.g_sales, 2)}</b></div><div><span>출구 가치 비중</span><b>${v3Pct(v.tv_share)}</b></div></div>
    <dl class="va-kv v3q-kv">${v3qKv('할인율', v3Pct(v.r, 2))}${v3qKv(`${v.n}년 뒤 ${fName}`, v3Won(v.fn))}${v3Ok(sN) ? v3qKv(`${v.n}년 뒤 매출`, v3Eok(sN)) : ''}</dl>` : `<div class="empty">${why}</div>`;
  return v3Sec('기본 입력치와 가정값', v3Seg('qrm', [['pfcf', 'P/FCF'], ['pe', 'P/E']], pe ? 'pe' : 'pfcf'), `<h3 class="v3-h3">기본 입력치</h3>${basic}<h3 class="v3-h3">가정값</h3>${asm}`, 'v3q-rvc')
    + v3Sec('결과', `<span class="meta">${pe ? 'P/E' : 'P/FCF'}</span>`, `<div data-o="q-rr">${res}${v3qRevChart(x, v)}</div>`)
    + v3Sec('모델 리버스', '<span class="meta">Base, 단위 억원</span>', `<div data-o="q-rm">${v3qModel(x)}</div>`);
}

// ===== 풋볼필드 =====
const V3Q_FF = { market: ['s5', '52주'], broker: ['s5', '증권사'], dcf: ['s1', 'DCF'], sotp: ['s3', '사업부 합산'], mc: ['s2', '몬테카를로'], typ: ['s3', '유형별'], rel: ['s4', '상대가치'] };
/* 현재가에 걸친 범위 수(요약 주가 범위 툴팁과 풋볼필드 표 아래 한 줄). 값 하나짜리 줄(최저 = 최고)은 범위로 세지 않음 */
function v3qCover(x) {
  const close = x.t.close, rs = (x.res.ff || []).filter((r) => r && v3Ok(r.lo) && v3Ok(r.hi) && r.lo < r.hi);
  if (!v3Ok(close) || !rs.length) return null;
  return { text: `범위 ${rs.length}개 가운데 ${rs.filter((r) => r.lo <= close && close <= r.hi).length}개가 현재가에 걸쳐 있습니다.`, tip: V3Q_TIP.cover };
}
function v3qFf(x) {
  const ff = (x.res.ff || []).filter((r) => r && v3Ok(r.lo) && v3Ok(r.hi)), close = x.t.close, tgt = x.res.blend?.target, sb = x.res.sotp?.scen?.Base;
  /* 줄 가운데 표시(Base): DCF 줄은 전사 DCF 값(사업부별 합산이 목표주가 자리에 들어간 사례는 scen.Base.ps가 합산 값이라 sotp의 dcf_ps), 사업부별 합산 줄은 합산 값 */
  const base = x.res.sotp?.mode === 'target' ? sb?.dcf_ps : x.res.scen?.Base?.ps, mids = { dcf: base, sotp: sb?.ps };
  if (!ff.length) return v3qEmpty('풋볼필드', '비교할 가치 범위가 없습니다.');
  const w = v3Wd(x), nar = w < 560, nb = (x.t.broker_targets || []).filter((b) => v3Ok(b?.goal)).length;
  const rows = ff.map((r) => { const [cls, short] = V3Q_FF[r.kind] || ['s5', r.label]; return { label: nar ? short : r.label, lo: r.lo, hi: r.hi, cls, mid: v3Ok(mids[r.kind]) ? mids[r.kind] : undefined,
    note: v3Ok(mids[r.kind]) ? `Base ${v3Num(mids[r.kind])}` : r.kind === 'broker' && nb ? `${nb}곳` : r.kind === 'typ' ? (/\((.+)\)$/.exec(v3DcfName(x)) || [])[1] || '' : '' }; });
  const cov = v3qCover(x);
  const marks = [v3Ok(close) ? { x: close, label: `현재가 ${v3Num(close)}`, cls: 's5', dash: true } : null, v3Ok(tgt) ? { x: tgt, label: `목표주가 ${v3Num(tgt)}`, cls: 's1', dash: true } : null];
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3q-ft"><thead><tr><th class="st">구분</th><th>최저</th><th>최고</th><th>현재가 대비</th></tr></thead>
    <tbody>${ff.map((r) => `<tr><td class="st">${esc(r.label)}</td><td>${v3Num(r.lo)}</td><td>${v3Num(r.hi)}</td><td>${r.lo === r.hi ? v3Up(v3qUpOf(r.lo, close)) || '-' : `${v3Up(v3qUpOf(r.lo, close)) || '-'}～${v3Up(v3qUpOf(r.hi, close)) || '-'}`}</td></tr>`).join('')}</tbody></table></div>`;
  return v3Sec('풋볼필드', '<span class="meta">단위 원</span>', `<div data-o="q-ff">${v3cFootball({ w, rows, marks, fmt: (v) => v3Num(v) })}${tbl}${cov ? `<p class="v3q-note v3q-cov"><span class="v3q-tip" title="${esc(cov.tip)}">${cov.text}</span></p>` : ''}</div>`);
}

// ===== 몬테카를로 =====
function v3qMcChk(x) {
  const own = (x.res.mc?.checks || []).filter((k) => k && k.text), ck = own.length ? own : (x.res.checks || []).filter((k) => k && k.text && String(k.id || '').startsWith('MC.'));
  const ord = ['err', 'warn', 'info'], seen = new Set();
  return ck.filter((k) => !seen.has(k.text) && seen.add(k.text)).sort((a, b) => ord.indexOf(a.level) - ord.indexOf(b.level)).map((k) => `<p class="v3q-note${k.level === 'info' ? '' : ' warn'}">${esc(k.text)}</p>`).join('');
}
function v3qMc(x) {
  const m = x.res.mc, close = x.t.close;
  if (!m || m.error || !m.hist || !Array.isArray(m.hist.counts) || !m.hist.counts.length) return v3Sec('몬테카를로', '', `<div class="empty">몬테카를로 결과가 없습니다.</div>${v3qMcChk(x) ? `<div class="v3q-mck">${v3qMcChk(x)}</div>` : ''}`);
  const wide = x.w >= 1100, w = wide ? Math.floor((x.w - 48 - 32) * 0.6) : v3Wd(x), won = (v) => v3Num(v), th = v3Ok(m.up_th) ? m.up_th : 0.15;
  const chart = `${v3cLegend([{ label: '25～75% 구간', cls: 's1' }, { label: '그 밖', cls: 's2' }])}${v3cHist({ w, h: wide ? 340 : 260, edges: m.hist.edges, counts: m.hist.counts, band: [m.p25, m.p75], fmt: won, title: '주당 가치 분포',
    marks: [v3Ok(close) ? { x: close, label: `현재가 ${won(close)}`, cls: 's5', dash: true } : null, { x: m.mean, label: `평균 ${won(m.mean)}`, cls: 's3' }, { x: m.median, label: `중앙값 ${won(m.median)}`, cls: 's4', dash: true }] })}`;
  const up = (v) => v3Up(v3qUpOf(v, close)) || '-', rng = (a, b) => [`${won(a)}～${won(b)}`, `${up(a)}～${up(b)}`];
  const rows = [['평균', won(m.mean), up(m.mean)], ['중앙값', won(m.median), up(m.median)], ['25～75%', ...rng(m.p25, m.p75)], ['5～95%', ...rng(m.p5, m.p95)],
    ['현재가보다 높을 확률', v3Pct(m.p_up0), ''], [`${v3Num(th * 100)}% 넘게 오를 확률`, v3Pct(m.p_up15), ''], ['시행 횟수', v3Ok(m.n) ? `${v3Num(m.n)}회` : '-', ''], ['시드', v3Ok(m.seed) ? String(m.seed) : '-', '']];
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3q-mt"><thead><tr><th class="st">항목</th><th>값</th><th>현재가 대비</th></tr></thead><tbody>${rows.map(([k, v, u]) => `<tr><td class="st">${k}</td><td>${v}</td><td>${u}</td></tr>`).join('')}</tbody></table></div>`;
  const note = Object.keys(x.st.ov).length > 0 ? '<p class="v3q-note warn">처음 값으로 계산한 분포입니다. 바꾼 입력은 파이썬에서 다시 계산해야 반영됩니다.</p>' : '';
  const ck = v3qMcChk(x);
  return v3Sec('주당 가치 분포', '<span class="meta">Base, 단위 원</span>', `${note}<div class="v3q-mc"><div>${chart}</div>${tbl}</div>${ck ? `<div class="v3q-mck">${ck}</div>` : ''}`);
}

v3Rep('sens', '민감도', v3qSens);
v3Rep('rev', '리버스', v3qRev);
v3Rep('ff', '풋볼필드', v3qFf);
v3Rep('mc', '몬테카를로', v3qMc);

// ---------- 보고서: 유형별 (v3t) ----------
// 데이터는 x.res.typ(= 사례 py.typ). 엔진은 typ을 다시 계산하지 않고 넘기기만 하므로 값은 세 갈래로 보여 줌.
//   1) 엔진이 읽는 입력(sw.rim_omega, sw.rim_tv, sw.fade_margin_target, i.beta.manual 등)은 덮기로 넣어 엔진 DCF가 다시 돔
//   2) 화면 재료로 정확히 다시 낼 수 있는 값(RIM, DDM 2단계와 고든, 적정 PBR, 부도 가중, VC, NAV, 비상장 단계별 할인)은 v3t*Calc가 다시 계산.
//      처음 값(c.py)으로 한 번 돌려 파이썬 행과 맞을 때만 씀(v3tLive). 안 맞거나 모양이 달라지면(명시 기간 변경 등) 파이썬 값과 안내
//   3) 그 밖(DDM 3단계와 H 모형, 총베타를 끈 값, 상증법 본 계산)은 처음 값 그대로
//   4) 파이썬만 정하는 설정(금융 전환 기간, 혼합 가중치, 적자 재투자 방식과 시나리오별 목표, 지주 과열 기준과 자동 초안)은 읽기만 하고 입력 칸을 두지 않음
// 덮기 키: i.typ.<유형>.<키>(파이썬 유형 모듈이 읽는 자리) 또는 sw.<키>. 목표 이익률과 ρ는 엔진 자리도 같이 바꿈(v3tMirror)
// 연도 열이 많은 표는 본문 폭에 맞춰 여러 표로 나눠 쌓음(v3tWide). 표 안 가로 스크롤을 만들지 않으려는 것
const V3T_NAME = { financial: '금융', loss: '적자', holding: '지주', private: '비상장' };
const V3T_P = { financial: 'TYP.fin.', loss: 'TYP.loss.', holding: 'TYP.hold.', private: 'TYP.priv.' };
const V3T_LV = { err: ['오류', 'red'], warn: ['주의', 'warn'], info: ['참고', ''] };
const V3T_PY = '처음 값으로 계산한 결과입니다. 바꾼 입력은 파이썬에서 다시 계산해야 반영됩니다.';
const V3T_RE = '바꾼 입력으로 다시 계산한 값입니다. 목표주가 결합에는 파이썬에서 다시 계산해야 반영됩니다.';
const v3tArr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const v3tN = (v) => (Array.isArray(v) ? (v.length ? v[0] : null) : v ?? null);
const v3tNum = (v) => (v == null || v === '' || typeof v === 'boolean' || !Number.isFinite(+v) ? null : +v);
const v3tE = (R, id) => v3tNum(v3tN(R?.[id]));
const v3tRound = (v, u) => (v3Ok(v) ? Math.floor(v / (u || 100) + 0.5) * (u || 100) : null);
const v3tOn = (v) => (typeof v === 'string' ? ['1', 'on', 'true', 'yes', '켬'].includes(v.trim().toLowerCase()) : !!v);
const v3tPs = (eq, sh) => (v3Ok(eq) && sh ? eq * 1e8 / sh : null);
const v3tSum = (a) => a.reduce((s, v) => s + (v || 0), 0);
const v3tWarn = (t) => (t ? `<p class="v3t-note warn">${t}</p>` : '');
const v3tKv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
const v3tUpOf = (v, close) => (v3Ok(v) && v3Ok(close) && close ? v / close - 1 : null);
/* 계산표 줄 [연산 기호, 이름, 값 html, 클래스(sum, k, big), 이름 옆 작은 글]. 이름과 작은 글은 호출하는 곳에서 esc */
const v3tRow = ([op, name, val, cls, sub]) => `<tr class="${cls || ''}"><th><i>${op || ''}</i>${name}${sub ? `<small>${sub}</small>` : ''}</th><td>${val}</td></tr>`;
const v3tCalc = (rows, res) => { const a = rows.filter(Boolean), b = (res || []).filter(Boolean); return `<table class="va-calc v3t-calc">${a.length ? `<tbody>${a.map(v3tRow).join('')}</tbody>` : ''}${b.length ? `<tbody class="res">${b.map(v3tRow).join('')}</tbody>` : ''}</table>`; };
/* 엔진 자리도 같이 바꿔야 하는 입력: data-v3t 종류(tm 목표 이익률, rho 상관계수) */
const v3tIn = (x, key, base, o, kind) => v3In(x, key, base, o).replace('<input ', `<input data-v3t="${kind}" `);
const V3T_MIR = { tm: ['sw.fade_margin_target'], rho: ['i.beta.manual', 'i.beta.stable_manual'] };

// ===== 다시 계산 =====
/* 계산 재료: R 엔진 Base 행, I input, sw 스위치, T py.typ, H 과거 햇수, N 명시 햇수, fc 명시 연도 */
function v3tSrc(R, I, sw, T, hist) {
  const H = hist.length, N = Math.max(0, (R?.['IS.rev'] || []).length - H), y0 = hist[H - 1];
  return { R: R || {}, I: I || {}, sw: sw || {}, T, H, N, fc: Array.from({ length: N }, (_, i) => y0 + 1 + i) };
}
function v3tSame(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) { const A = v3tArr(a), B = v3tArr(b); return A.length === B.length && A.every((v, i) => v3tSame(v, B[i])); }
  if (!v3Ok(a) || !v3Ok(b)) return !v3Ok(a) && !v3Ok(b);
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
}
/* 처음 값으로 돌려 파이썬 행(_chk 키)과 맞는지 한 번 보고(사례별 기억), 맞으면 지금 입력으로 계산한 결과. 아니면 null */
const v3tOkMemo = {};
function v3tLive(x, T, fn) {
  const c = x.c, P = V3T_P[T.type], key = `${c.id}|${c.generated_at}|${T.type}`;
  if (!(key in v3tOkMemo)) {
    let r = { ok: false, bad: 'calc' };
    try {
      const o = fn(v3tSrc(c.py.rows.Base, c.input, c.switches, T, c.timeline.hist));
      const bad = o ? o._chk.filter((k) => P + k in (T.rows || {}) && !v3tSame(o[k], T.rows[P + k])) : ['calc'];
      r = { ok: !bad.length, bad };
    } catch (e) { r = { ok: false, bad: e.message }; }
    v3tOkMemo[key] = r;
  }
  if (!v3tOkMemo[key].ok) return null;
  try { return fn(v3tSrc(x.res.rows?.Base, x.I, x.sw, T, x.tl.hist)); } catch { return null; }
}

/* 금융: RIM(지속계수, 영구성장, 목표 PBR, 혼합), DDM 2단계와 고든, 적정 PBR. financial.py rim_table, rim_tv, tv_mix, ddm_gordon과 같은 식. 전환 기간이 있는 판은 다시 계산하지 않음.
   혼합은 Σ 가중치 × 종료가치이고 가중치는 파이썬이 정리한 행(rim_blend_w)을 그대로 씀 */
function v3tFinCalc(s) {
  const T = s.T.rows || {}, r = (k) => T['TYP.fin.' + k], fi = s.I.typ?.financial || {};
  const tt = v3tArr(r('t')), n = tt.length, tvm = s.sw.rim_tv || 'persist', st = s.sw.ddm_stage || 'two';
  if (!n || s.N !== n || r('fade_roe') != null || v3tNum(fi.fade_years) > 0 || v3tNum(s.sw.rim_fade_years) > 0 || !['persist', 'gordon', 'pbr', 'blend'].includes(tvm)) return null;
  const ke = v3tE(s.R, 'WACC.ke'), ke_s = v3tE(s.R, 'WACC.ke_s') ?? ke, g = v3tE(s.R, 'DCF.g_s'), sh = v3tE(s.R, 'SHR.diluted') ?? v3tE(s.R, 'DCF.shares');
  const bv0 = v3tNum(v3tN(r('bv0'))), ni0 = v3tNum(v3tN(r('ni0'))), rs = v3tNum(fi.roe_start) ?? v3tNum(v3tN(r('roe_start')));
  if (![ke, ke_s, g, sh, bv0, rs].every(v3Ok) || bv0 <= 0) return null;
  const re = v3tNum(fi.roe_end) ?? ke_s + (v3tNum(fi.roe_excess) ?? 0);
  const roe = Array.isArray(fi.roe_path) && fi.roe_path.length === n ? fi.roe_path.map(Number) : n === 1 ? [rs] : Array.from({ length: n }, (_, k) => rs + (re - rs) * k / (n - 1));
  const pay = (s.sw.ddm_payout || 'div') === 'div' && fi.payout != null ? (Array.isArray(fi.payout) ? fi.payout.map(Number) : Array(n).fill(+fi.payout)) : v3tArr(r('payout'));
  if (pay.length !== n || !pay.every(v3Ok) || !roe.every(v3Ok)) return null;
  const f1 = v3tNum(v3tArr(r('frac'))[0]) ?? 1, o = { roe, payout: pay, frac: [], bv_bop: [], ni: [], ri: [], div: [], bv_eop: [], df: [], pv_ri: [], pv_div: [] };
  let b = bv0;
  for (let k = 0; k < n; k++) {
    const f = k ? 1 : f1, ni = b * roe[k] * f, ri = (roe[k] - ke) * b * f, dv = Math.max(0, ni * pay[k]), df = (1 + ke) ** -tt[k];
    o.frac.push(f); o.bv_bop.push(b); o.ni.push(ni); o.ri.push(ri); o.div.push(dv); o.bv_eop.push(b + ni - dv); o.df.push(df); o.pv_ri.push(ri * df); o.pv_div.push(dv * df);
    b += ni - dv;
  }
  const L = n - 1, dfn = o.df[L], bvn = o.bv_eop[L], ril = o.ri[L] / o.frac[L], nil = o.ni[L] / o.frac[L], U = +s.sw.round || 100;
  const pf = (ro, k, gg) => (k <= gg ? null : (ro - gg) / (k - gg)), gd = (bs, p, k, gg) => (k <= gg || p == null ? null : bs * (1 + gg) * p / (k - gg));
  const om = v3tNum(s.sw.rim_omega) ?? 0.7, pps = (eq) => v3tPs(eq, sh);
  o.pv_ri_sum = v3tSum(o.pv_ri); o.pv_div_sum = v3tSum(o.pv_div);
  o.target_pbr = v3tNum(fi.target_pbr) ?? pf(re, ke_s, g);
  const tvs = { persist: 1 + ke_s - om ? ril * om / (1 + ke_s - om) : null, gordon: ke_s <= g ? null : bvn * (re - ke_s) / (ke_s - g), pbr: o.target_pbr == null ? null : (o.target_pbr - 1) * bvn };
  const bw = v3tArr(r('rim_blend_w')).map(v3tNum), base = bv0 + o.pv_ri_sum, eqOf = (tv) => (tv == null ? null : base + tv * dfn);
  tvs.blend = bw.length === 3 && bw.every((w, i) => !w || tvs[['persist', 'gordon', 'pbr'][i]] != null) ? v3tSum(bw.map((w, i) => (w ? w * tvs[['persist', 'gordon', 'pbr'][i]] : 0))) : null;
  if (tvm === 'blend' && tvs.blend == null) return null;
  o.rim_tv_alt = ['persist', 'gordon', 'pbr'].map((m) => tvs[m]); o.rim_tv_blend = tvs.blend;
  o.rim_eq_alt = ['persist', 'gordon', 'pbr'].map((m) => eqOf(tvs[m]));
  o.rim_tv = tvs[tvm]; o.rim_pv_tv = o.rim_tv == null ? null : o.rim_tv * dfn; o.rim_eq = eqOf(o.rim_tv);
  o.payout_s = v3tNum(fi.payout_s) ?? (re > 0 ? Math.min(1, Math.max(0, 1 - g / re)) : null);
  o.ddm_tv = gd(nil, o.payout_s, ke_s, g); o.ddm_pv_tv = o.ddm_tv == null ? null : o.ddm_tv * dfn;
  const two = o.ddm_tv == null ? null : o.pv_div_sum + o.ddm_pv_tv, gor = ni0 == null ? null : gd(ni0, o.payout_s, ke_s, g);
  o.pbr_fair = pf(rs, ke, g);
  const pn = v3tNum(v3tN(r('pbr_now')));
  o.iroe = pn == null || ke <= g ? null : pn * (ke - g) + g;
  o.rim_ps_raw = pps(o.rim_eq); o.rim_ps = v3tRound(o.rim_ps_raw, U);
  o.pbr_ps_raw = o.pbr_fair == null ? null : pps(o.pbr_fair * bv0); o.pbr_ps = v3tRound(o.pbr_ps_raw, U);
  o._chk = ['rim_eq', 'pv_ri_sum', 'bv_eop', 'ri', 'ddm_tv', 'pbr_ps_raw', 'rim_ps_raw', 'iroe'];
  if (tvs.blend != null) o._chk.push('rim_tv_blend');
  if (st === 'two' || st === 'gordon') { o.ddm_eq = st === 'two' ? two : gor; o.ddm_ps_raw = pps(o.ddm_eq); o.ddm_ps = v3tRound(o.ddm_ps_raw, U); o._chk.push('ddm_eq', 'ddm_ps_raw'); }
  const ddm = s.T.method === 'ddm';
  if (ddm && o.ddm_eq === undefined) return null;
  o._alt = { 'rim_tv.persist': v3tRound(pps(o.rim_eq_alt[0]), U), 'rim_tv.gordon': v3tRound(pps(o.rim_eq_alt[1]), U), 'rim_tv.pbr': v3tRound(pps(o.rim_eq_alt[2]), U), 'rim_tv.blend': v3tRound(pps(eqOf(tvs.blend)), U),
    'ddm_stage.two': v3tRound(pps(two), U), 'ddm_stage.gordon': v3tRound(pps(gor), U), pbr_fair: o.pbr_ps };
  Object.assign(o, { ke, ke_s, g_s: g, shares: sh, roe_start: rs, roe_end: re, roe_excess: re - ke_s, omega: om, _ps: ddm ? o.ddm_ps : o.rim_ps });
  return o;
}

/* 적자: 부도 가중(DCF 주주가치 × (1 − p) + 청산가치 × p)과 VC 방식. loss.py value와 같은 식. DCF 주주가치와 목표연도 이익은 엔진 Base 행 */
function v3tLossCalc(s) {
  const T = s.T.rows || {}, r = (k) => T['TYP.loss.' + k], li = s.I.typ?.loss || {}, basis = s.T.loss?.liq_basis, U = +s.sw.round || 100;
  const v_dcf = v3tE(s.R, 'DCF.eq'), sh = v3tE(s.R, 'SHR.diluted') ?? v3tE(s.R, 'DCF.shares');
  if (!v3Ok(v_dcf) || !sh) return null;
  const pin = v3tNum(li.p_default), p = pin == null ? 0 : Math.min(1, Math.max(0, pin)), o = { v_dcf, p, shares: sh };
  let v_liq = 0;
  if (basis === 'input') v_liq = v3tNum(li.liq_value) ?? 0;
  else if (basis === 'assets' || basis === 'book_x_recovery') {
    const debt = basis === 'assets' ? v3tNum(li.liq_debt) ?? v3tNum(v3tN(r('liq_debt'))) : v3tNum(v3tN(r('liq_debt')));
    const as = basis === 'assets' ? (li.liq_assets || []).map((a, i) => ({ id: a.id || i + 1, book: v3tNum(a.book), rec: v3tNum(a.recovery) }))
      : [{ id: 1, book: v3tNum(v3tArr(r('liq.1'))[0]), rec: v3tNum(li.liq_recovery) }];
    if (basis === 'book_x_recovery' && (!v3Ok(as[0].book) || !v3Ok(as[0].rec))) return null;
    as.forEach((a) => { o[`liq.${a.id}`] = [a.book, a.rec, (a.book || 0) * (a.rec || 0)]; });
    o.liq_gross = v3tSum(as.map((a) => (a.book || 0) * (a.rec || 0))); o.liq_debt = debt || 0;
    v_liq = Math.max(0, o.liq_gross - o.liq_debt);
  }
  const dw = (v) => (v == null ? null : v * (1 - p) + v_liq * p);
  o.v_liq = v_liq; o.v_w = dw(v_dcf); o.ps_dcf_raw = v3tPs(v_dcf, sh); o.ps_raw = v3tPs(o.v_w, sh); o.ps = v3tRound(o.ps_raw, U); o._ps = o.ps;
  o._chk = ['v_dcf', 'v_liq', 'liq_gross', 'v_w', 'ps_raw'];
  const vc = li.vc;
  if (vc && typeof vc === 'object' && Object.keys(vc).length) {
    const idx = s.fc.indexOf(vc.exit_year), n = v3tNum(vc.n) ?? v3tNum(v3tN(r('vc_n'))), ret = v3tNum(vc.target_return), per = v3tNum(vc.per), psr = v3tNum(vc.psr);
    const at = (id) => (idx >= 0 ? v3tNum(s.R[id]?.[s.H + idx]) : null), ni = v3tNum(vc.ni) ?? at('IS.ni_parent'), rev = v3tNum(vc.rev) ?? at('IS.rev');
    const vv = (bs, m) => (bs == null || m == null || ret == null || n == null || ret <= -1 ? [null, null] : [bs * m, bs * m / (1 + ret) ** n]);
    const stack = v3tOn(vc.apply_p) && p > 0, [epe, vpe] = vv(ni > 0 ? ni : null, per), [eps, vps] = vv(rev, psr);
    Object.assign(o, { vc_n: n, vc_ret: ret, vc_ni: ni, vc_per_x: per, vc_exit_pe: epe, vc_pe: stack ? dw(vpe) : vpe, vc_rev: rev, vc_psr_x: psr, vc_exit_psr: eps, vc_psr: stack ? dw(vps) : vps });
    o.vc_pe_ps = v3tRound(v3tPs(o.vc_pe, sh), U); o.vc_psr_ps = v3tRound(v3tPs(o.vc_psr, sh), U);
    o._chk.push('vc_ni', 'vc_pe', 'vc_psr', 'vc_rev');
  }
  return o;
}

/* 지주: NAV = 자회사 지분가치 + 자체 사업가치 + 현금 − 차입 − 기타, 할인은 sw.holding_disc_scope 자리에. holding.py sub_value, nav와 같은 식 */
function v3tHoldCalc(s) {
  const hi = s.I.typ?.holding || {}, disc = v3tNum(s.sw.holding_disc) ?? 0.3, sc0 = s.sw.holding_disc_scope, scope = ['listed', 'subs', 'nav'].includes(sc0) ? sc0 : 'listed', U = +s.sw.round || 100, o = {};
  const subs = (hi.subs || []).map((x, i) => {
    const listed = !!x.listed, stake = v3tNum(x.stake) ?? 0, mcap = v3tNum(x.mcap), val = v3tNum(x.value), book = v3tNum(x.book);
    const whole = listed && mcap != null ? mcap : val != null ? val : null, bb = whole == null && book != null ? book : null;
    const gross = whole != null ? stake * whole : book || 0, d = v3tNum(x.disc) ?? (scope === 'subs' || (scope === 'listed' && listed) ? disc : 0);
    const v = { id: String(x.id || `s${i + 1}`), listed, gross, net: gross * (1 - d) };
    o[`sub.${v.id}`] = [listed ? 1 : 0, stake, whole, bb, d, gross, v.net];
    return v;
  });
  const ov = hi.own_value || {}, mode = ov.mode || (v3tNum(ov.amount) != null ? 'input' : 'none');
  const own = (mode === 'engine_ev' ? v3tE(s.R, 'DCF.ev') : mode === 'multiple' ? (v3tNum(ov.metric) != null && v3tNum(ov.multiple) != null ? ov.metric * ov.multiple : null) : mode === 'input' ? v3tNum(ov.amount) : null) || 0;
  let cash, debt;
  if (v3tNum(hi.net_cash) != null && hi.cash == null && hi.debt == null) { const nc = +hi.net_cash; [cash, debt] = nc >= 0 ? [nc, 0] : [0, -nc]; } else { cash = v3tNum(hi.cash) ?? 0; debt = v3tNum(hi.debt) ?? 0; }
  const other = v3tSum((hi.others || []).map((x) => v3tNum(x.amount) ?? 0)), sg = v3tSum(subs.map((v) => v.gross)), sn = v3tSum(subs.map((v) => v.net));
  const ng = sg + own + cash - debt - other, nn = (sn + own + cash - debt - other) * (1 - (scope === 'nav' ? disc : 0));
  const sh = v3tNum(hi.shares) ?? v3tE(s.R, 'SHR.diluted') ?? v3tE(s.R, 'DCF.shares'), close = v3tNum(s.T.rows?.['TYP.hold.price']);
  Object.assign(o, { subs_listed: v3tSum(subs.filter((v) => v.listed).map((v) => v.gross)), subs_unlisted: v3tSum(subs.filter((v) => !v.listed).map((v) => v.gross)), subs_gross: sg, subs_net: sn,
    own, cash, debt, other, disc_rate: disc, nav_gross: ng, nav: nn, disc_amt: ng - nn, disc_eff: ng > 0 ? (ng - nn) / ng : null, shares: sh });
  o.nav_ps_gross = v3tPs(ng, sh); o.nav_ps_raw = v3tPs(nn, sh); o.nav_ps = v3tRound(o.nav_ps_raw, U); o._ps = o.nav_ps;
  o.mkt_disc = close && o.nav_ps_gross > 0 ? 1 - close / o.nav_ps_gross : null;
  o._chk = ['subs_gross', 'subs_net', 'own', 'nav_gross', 'nav', 'nav_ps_raw', ...subs.map((v) => `sub.${v.id}`)];
  return o;
}

/* 비상장: 총베타 = 시장 베타 × (1 + (1 ÷ ρ − 1) × (1 − 매수자 분산)), 주주가치에 경영권 프리미엄, 비유동성 할인, 핵심 인물 할인을 순서대로. private.py _plan, chain과 같은 식 */
function v3tPrivCalc(s) {
  const T = s.T.rows || {}, r = (k) => v3tNum(v3tN(T['TYP.priv.' + k])), pi = s.I.typ?.private || {}, sm = s.T.private?.summary || {}, U = +s.sw.round || 100;
  const rho = v3tNum(pi.rho) ?? r('rho'), on = (k) => r(k) === 1, bm = r('beta_mkt'), div = r('buyer_div') ?? 0, bsm = r('beta_s_mkt');
  if (!v3Ok(rho) || rho <= 0 || rho > 1) return null;
  const f = on('tb_on') ? 1 + (1 / rho - 1) * (1 - div) : 1, o = { rho, tb_factor: f, beta_total: v3Ok(bm) ? bm / rho : null, beta: v3Ok(bm) ? bm * f : null };
  o.beta_s = v3Ok(bsm) ? (r('stable_keep') !== 0 ? bsm * f : bsm) : null;
  const eq0 = v3tE(s.R, 'DCF.eq'), sh = v3tE(s.R, 'DCF.shares') ?? v3tE(s.R, 'SHR.diluted');
  if (!v3Ok(eq0) || !sh) return null;
  const swd = s.sw.dlom, dlIn = swd === 'silber' ? r('dlom_silber') : v3tNum(swd) ?? 0.3;
  const rate = { control: (v3tNum(s.sw.control_prem) ?? 0) * (on('ctrl_on') ? 1 : 0), dlom: dlIn == null ? null : dlIn * (on('dlom_on') ? 1 : 0), key_person: v3tNum(s.sw.key_person) ?? 0 };
  const STEP = { control: ['control_prem', 'control_amt', 'eq_control', 1], dlom: ['dlom', 'dlom_amt', 'eq_dlom', -1], key_person: ['key_person', 'key_person_amt', 'eq_key_person', -1] };
  const ord = Array.isArray(sm.order) && [...sm.order].sort().join() === 'control,dlom,key_person' ? sm.order : ['control', 'dlom', 'key_person'];
  let eq = eq0;
  o.eq_dcf = eq0; o.control_in = v3tNum(s.sw.control_prem) ?? 0; o.dlom_in = dlIn; o._order = ord;
  for (const k of ord) {
    const [kr, ka, kq, sg] = STEP[k], amt = eq == null || rate[k] == null ? null : eq * rate[k];
    eq = amt == null ? null : eq + sg * amt; o[kr] = rate[k]; o[ka] = amt; o[kq] = eq;
  }
  o.eq = eq; o.disc_total = eq == null || !eq0 ? null : eq / eq0 - 1; o.shares = sh;
  o.ps_raw = v3tPs(eq, sh); o.ps = v3tRound(o.ps_raw, U); o._ps = o.ps;
  const d = rate.dlom, pw = (dl) => (o.ps_raw == null || dl == null || d == null || d >= 1 ? null : v3tRound(o.ps_raw * (1 - dl) / (1 - d), U));
  o.ps_dlom_lo = pw(r('dlom_ref_lo')); o.ps_dlom_hi = pw(r('dlom_ref_hi'));
  const sj = r('sj_value_major');
  o.sj_dcf_ratio = v3Ok(o.ps_raw) && sj ? o.ps_raw / sj : null;
  o._chk = ['beta', 'beta_s', 'eq_dcf', 'eq', 'ps_raw', 'ps_dlom_lo', 'ps_dlom_hi', 'sj_dcf_ratio'];
  return o;
}
const V3T_CALC = { financial: v3tFinCalc, loss: v3tLossCalc, holding: v3tHoldCalc, private: v3tPrivCalc };

/* 화면 묶음: T py.typ, L 다시 계산한 값(없으면 null), g(키) 지금 보여 줄 값(다시 계산한 값 먼저, 없으면 파이썬 행), n(키) 숫자 하나 */
function v3tCtx(x) {
  const T = x.res.typ || x.c.py?.typ;
  if (!T || !T.type || T.type === 'general' || !V3T_P[T.type]) return null;
  const P = V3T_P[T.type], L = x.res.rows?.Base ? v3tLive(x, T, V3T_CALC[T.type]) : null;
  const g = (k) => (L && k in L ? L[k] : T.rows?.[P + k] ?? null);
  return { T, P, L, g, x, n: (k) => v3tNum(v3tN(g(k))), chg: Object.keys(x.ov || {}).length > 0, sub: T[T.type] || {} };
}

// ===== 공통: 맨 위 결과, 점검 =====
function v3tPsLab(T) {
  if (T.type === 'financial') return T.method === 'ddm' ? 'DDM 주당 가치' : 'RIM 주당 가치';
  if (T.type === 'loss') return T.method === 'dcf_p' ? '부도 가중 주당 가치' : 'DCF 주당 가치';
  return T.type === 'holding' ? '할인 뒤 주당 NAV' : '조정 뒤 주당 가치';
}
function v3tTop(x, k) {
  const T = k.T, ps = k.L ? k.L._ps : v3tNum(T.ps), close = x.t.close, eng = x.res.scen?.Base?.ps, d = v3Ok(ps) && v3Ok(eng) && eng ? ps / eng - 1 : null;
  const re = k.L && v3Ok(ps) && v3Ok(T.ps) && Math.abs(ps - T.ps) >= 1, src = x.res.blend?.dcf_src;
  const cell = (lab, b, em, cls = '') => `<div class="${cls}"><span>${lab}</span><b>${b}</b><em>${em || ''}</em></div>`;
  const body = `<div data-o="t-top"><div class="v3t-top">${cell(v3tPsLab(T), v3Ok(ps) ? v3Won(ps) : '계산 불가', v3Ok(close) ? `현재가 대비 ${v3Up(v3tUpOf(ps, close)) || '-'}` : '현재가 없음', 'm')}
    ${cell('DCF Base', v3Won(eng), v3Ok(close) && v3Ok(eng) ? `현재가 대비 ${v3Up(eng / close - 1)}` : '')}
    ${cell('DCF 대비', v3Up(d) || '-', src && src !== 'dcf' && src !== 'blocked' ? '목표주가에 반영' : '')}</div>${v3tWarn(re ? V3T_RE : !k.L && k.chg ? V3T_PY : '')}</div>`;
  return v3Sec('유형별 가치', `<span class="meta">${V3T_NAME[T.type]}, Base</span>`, body);
}
function v3tChecks(T) {
  const ck = (T.checks || []).filter((y) => y && y.text);
  if (!ck.length) return '';
  const ord = ['err', 'warn', 'info'], s = [...ck].sort((a, b) => (ord.indexOf(a.level) + 4) % 4 - (ord.indexOf(b.level) + 4) % 4);
  return v3Sec('유형 점검', `<span class="meta">${s.length}건</span>`, `<ul class="v3t-cl">${s.map((y) => { const [nm, cls] = V3T_LV[y.level] || V3T_LV.info; return `<li><span class="chip v3t-lv ${cls}">${nm}</span><p>${esc(y.text)}</p></li>`; }).join('')}</ul>`);
}
/* 열이 많은 표를 본문 폭에 맞춰 나눔. cols [{h 머리글, cls}], rows [{nm 이름 html, cls, cells: [칸 html]}].
   한 표에 들어갈 열 수 = (본문 폭 − 이름 열) ÷ 열 폭. 넘으면 열을 고르게 나눠 표를 아래로 쌓고, 열 수가 모자란 마지막 표는 빈 칸으로 맞춤 */
function v3tWide(x, first, cols, rows) {
  const nar = x.w <= 620, cap = Math.max(2, Math.floor((x.w - (nar ? 32 : 50) - (nar ? 104 : 128)) / (nar ? 62 : 74)));
  const n = cols.length, parts = Math.max(1, Math.ceil(n / cap)), per = Math.ceil(n / parts), out = [];
  if (!n || !rows.length) return '';
  for (let p = 0; p < parts; p++) {
    const a = p * per, b = Math.min(n, a + per), pad = per - (b - a);
    out.push(`<div class="mk-scroll"><table class="mk-tbl v3-t v3t-yt${parts > 1 ? ' v3t-ch' : ''}"><thead><tr><th class="st">${first}</th>${cols.slice(a, b).map((c) => `<th${c.cls ? ` class="${c.cls}"` : ''}>${c.h}</th>`).join('')}${'<th></th>'.repeat(pad)}</tr></thead><tbody>${rows.map((r) => `<tr class="${r.cls || ''}"><td class="st">${r.nm}</td>${r.cells.slice(a, b).map((v, i) => `<td${cols[a + i].cls ? ` class="${cols[a + i].cls}"` : ''}>${v}</td>`).join('')}${'<td></td>'.repeat(pad)}</tr>`).join('')}</tbody></table></div>`);
  }
  return parts > 1 ? `<div class="v3t-chw">${out.join('')}</div>` : out[0];
}
const v3tCellFmt = (v, f) => (f === 'pct2' ? v3Pct(v, 2) : f === 'pct' ? v3Pct(v, 1) : f === 'num4' ? v3Num(v, 4) : f === 'x' ? v3Num(v, 2) : f === 'won' ? v3Num(v) : v3Num(v));
/* 연도 열 표: rows [[키, 이름, 서식(pct, pct2, amt, num4, x), 클래스]], ys 열 머리 */
function v3tYTable(k, rows, ys, first) {
  const rs = rows.filter(([id]) => v3tArr(k.g(id)).length).map(([id, nm, f, cls]) => { const a = v3tArr(k.g(id)); return { nm, cls, cells: ys.map((_, i) => v3tCellFmt(a[i], f)) }; });
  return v3tWide(k.x, first, ys.map((y) => ({ h: esc(String(y)) })), rs);
}
/* 파이썬만 계산하는 표 아래 안내: 바꾼 입력이 있을 때만 */
const v3tPyOnly = (k) => (k.chg ? '<p class="v3t-note">이 표는 처음 값으로 계산한 결과입니다. 바꾼 입력은 파이썬에서 다시 계산해야 반영됩니다.</p>' : '');

// ===== 금융 =====
const V3T_ALT = { 'rim_tv.persist': 'RIM 지속계수', 'rim_tv.gordon': 'RIM 영구성장', 'rim_tv.pbr': 'RIM 목표 PBR', 'rim_tv.blend': 'RIM 혼합', 'ddm_stage.two': 'DDM 2단계', 'ddm_stage.gordon': 'DDM 고든', 'ddm_stage.three': 'DDM 3단계', 'ddm_stage.h': 'DDM H 모형', pbr_fair: '적정 PBR' };
const V3T_DDM = { two: '2단계', gordon: '고든', three: '3단계', h: 'H 모형' };
const V3T_TVM = [['persist', '지속계수'], ['gordon', '영구성장'], ['pbr', '목표 PBR']];
function v3tFin(x, c, k) {
  const { n, g, L, T, sub } = k, fi0 = c.input.typ?.financial || {}, dis = !x.live, ddm = T.method === 'ddm', close = x.t.close, pr = (id) => v3tN(T.rows?.['TYP.fin.' + id]);
  const tvm = x.sw.rim_tv || 'persist', st = x.sw.ddm_stage || 'two', pay0 = v3tArr(pr('payout')), out = [];
  // 입력
  const f = [];
  if (!Array.isArray(fi0.roe_path)) {
    f.push(v3F('시작 ROE', v3In(x, 'i.typ.financial.roe_start', fi0.roe_start ?? pr('roe_start'), { fmt: 'pct', d: 2, lab: '시작 ROE', dis })));
    if (fi0.roe_end == null) f.push(v3F('안정기 초과 ROE', v3In(x, 'i.typ.financial.roe_excess', fi0.roe_excess ?? 0, { fmt: 'pct', d: 2, u: '%p', lab: '안정기 초과 ROE', dis })));
  }
  if ((x.sw.ddm_payout || 'div') === 'div' && !Array.isArray(fi0.payout) && (fi0.payout != null || (pay0.length && pay0.every((v) => v === pay0[0]))))
    f.push(v3F('배당성향', v3In(x, 'i.typ.financial.payout', fi0.payout ?? pay0[0], { fmt: 'pct', d: 2, lab: '배당성향', dis })));
  const bw = v3tArr(T.rows?.['TYP.fin.rim_blend_w']).map(v3tNum), mix = !ddm && tvm === 'blend', fm = n('fade_years'); // 혼합 가중치(지속계수, 영구성장, 목표 PBR), 전환 기간 햇수
  if (!ddm && (tvm === 'persist' || (mix && bw[0] > 0))) f.push(v3F('지속계수 ω', v3In(x, 'sw.rim_omega', c.switches.rim_omega ?? 0.7, { fmt: 'num', d: 2, lab: '지속계수', dis })));
  if (!ddm && (tvm === 'pbr' || (mix && bw[2] > 0))) f.push(v3F('목표 PBR', v3In(x, 'i.typ.financial.target_pbr', fi0.target_pbr ?? pr('target_pbr'), { fmt: 'x', d: 2, lab: '목표 PBR', dis })));
  if (ddm) f.push(v3F('안정기 배당성향', v3In(x, 'i.typ.financial.payout_s', fi0.payout_s ?? pr('payout_s'), { fmt: 'pct', d: 2, lab: '안정기 배당성향', dis })));
  const opt = ddm ? `<div class="v3-opt"><div><span>DDM 단계</span><b class="v3t-ro">${V3T_DDM[st] || esc(st)}</b></div></div>`
    : `<div class="v3-opt"><div><span>종료가치</span>${v3Sw(x, 'sw.rim_tv', [...V3T_TVM, ['blend', '혼합']], tvm)}</div></div>`;
  /* 혼합: 방식별 가중치와 종료가치, 가중합. 가중치는 파이썬이 정리한 값(입력 typ.financial.rim_blend_w) */
  const tva = v3tArr(g('rim_tv_alt')), blend = mix && bw.length === 3 ? `<h3 class="v3-h3">종료가치 혼합</h3><div class="mk-scroll" data-o="t-f-mix"><table class="mk-tbl v3-t v3t-mt v3t-bw"><thead><tr><th class="st">방식</th><th>가중치</th><th>종료가치</th></tr></thead><tbody>
    ${V3T_TVM.map(([, nm], i) => `<tr><td class="st">${nm}</td><td>${v3Pct(bw[i], 1)}</td><td>${v3Num(tva[i])}</td></tr>`).join('')}<tr class="sum"><td class="st">가중합</td><td></td><td>${v3Num(n('rim_tv_blend'))}</td></tr></tbody></table></div>` : '';
  const ro = `<dl class="va-kv v3t-kv" data-o="t-f-ro">${v3tKv('자기자본비용', v3Pct(n('ke'), 2))}${v3tKv('안정기 자기자본비용', v3Pct(n('ke_s'), 2))}${v3tKv('영구성장률', v3Pct(n('g_s'), 2))}${v3tKv('끝 ROE', v3Pct(n('roe_end'), 2))}${fm != null ? v3tKv('전환 기간', fm > 0 ? `${v3Num(fm)}년` : '없음') : ''}</dl>`;
  const sh = `${v3Num(n('shares'))}주`, psM = ddm ? n('ddm_ps') : n('rim_ps');
  const fri = n('fade_pv_ri_sum'), fdv = n('fade_pv_div_sum');
  const calc = ddm ? v3tCalc(st === 'two' ? [['', '배당 현재가치', v3Eok(n('pv_div_sum'))], fdv != null ? ['+', '전환 기간 배당 현재가치', v3Eok(fdv)] : null, ['+', '종료가치 현재가치', v3Eok(n('ddm_pv_tv')), '', `종료가치 ${v3Eok(n('ddm_tv'))}`], ['=', '주주가치', v3Eok(n('ddm_eq')), 'sum'], ['÷', '주식수', sh]]
    : [['', `DDM ${V3T_DDM[st] || esc(st)} 주주가치`, v3Eok(n('ddm_eq')), 'sum'], ['÷', '주식수', sh]], [['=', '주당 가치', v3Won(psM), 'k big'], v3Ok(close) ? ['', '현재가 대비', v3Up(v3tUpOf(psM, close)) || '-'] : null])
    : v3tCalc([['', '지배주주 자본', v3Eok(n('bv0'))], ['+', '초과이익 현재가치', v3Eok(n('pv_ri_sum'))], fri != null ? ['+', '전환 기간 초과이익 현재가치', v3Eok(fri)] : null, ['+', '종료가치 현재가치', v3Eok(n('rim_pv_tv')), '', `종료가치 ${v3Eok(n('rim_tv'))}`], ['=', '주주가치', v3Eok(n('rim_eq')), 'sum'], ['÷', '주식수', sh]],
      [['=', '주당 가치', v3Won(psM), 'k big'], v3Ok(close) ? ['', '현재가 대비', v3Up(v3tUpOf(psM, close)) || '-'] : null]);
  out.push(v3Sec(ddm ? '배당할인모형' : '초과이익모형', '<span class="meta">Base, 단위 억원</span>', `<div class="v3t-io"><div>${opt}<div class="v3-fs">${f.join('')}</div>${ro}${blend}</div><div data-o="t-f-calc">${calc}</div></div>`));
  // 방법별 주당 가치
  const pick = ddm ? `ddm_stage.${st}` : `rim_tv.${tvm}`, alt = (sub.alt || []).filter((a) => a && V3T_ALT[a.key]);
  const keys = alt.length ? alt.map((a) => a.key) : Object.keys(L?._alt || {});
  if (keys.length) {
    const val = (key) => (L?._alt && key in L._alt ? [L._alt[key], false] : [alt.find((a) => a.key === key)?.ps ?? null, true]);
    const rows = keys.map((key) => { const [v, py] = val(key); return `<tr class="${key === pick ? 'sum' : ''}"><td class="st">${V3T_ALT[key]}${key === pick ? '<small>선택</small>' : ''}${py && k.chg ? '<small>처음 값</small>' : ''}</td><td>${v3Won(v)}</td><td>${v3Up(v3tUpOf(v, close)) || '-'}</td></tr>`; }).join('');
    const kv = `<dl class="va-kv v3t-kv">${v3tKv('현재 PBR', v3X(n('pbr_now')))}${v3tKv('적정 PBR', v3X(n('pbr_fair')))}${v3tKv('내재 ROE', v3Pct(n('iroe'), 2))}${n('pbr_floor') != null ? v3tKv('저평가 기준 PBR', v3X(n('pbr_floor'))) : ''}</dl>`;
    out.push(v3Sec('방법별 주당 가치', '<span class="meta">Base</span>', `<div data-o="t-f-alt"><div class="mk-scroll"><table class="mk-tbl v3-t v3t-mt"><thead><tr><th class="st">방법</th><th>주당 가치</th><th>현재가 대비</th></tr></thead><tbody>${rows}</tbody></table></div>${kv}</div>`));
  }
  // BV와 ROE 경로
  const ys = (sub.years || []).length === v3tArr(g('roe')).length ? sub.years.map((y) => `${y}E`) : v3tArr(g('roe')).map((_, i) => `${i + 1}년`);
  const path = v3tYTable(k, [['roe', 'ROE', 'pct2'], ['payout', '배당성향', 'pct2'], ['bv_bop', '기초 자본', 'amt'], ['ni', '지배주주 순이익', 'amt'], ['ri', '초과이익', 'amt'], ['div', '배당', 'amt'],
    ['bv_eop', '기말 자본', 'amt', 'sum'], ['df', '할인계수', 'num4'], ['pv_ri', '초과이익 현재가치', 'amt'], ['pv_div', '배당 현재가치', 'amt']], ys, '항목');
  /* 전환 기간(m > 0): 명시 기간 뒤 ROE, 배당성향, 자기자본비용이 안정기 값으로 가는 해. 파이썬 행 그대로 */
  const fl = (sub.rim_fade?.year_list || []), fn = v3tArr(g('fade_roe')).length, fys = fl.length === fn ? fl.map((y) => `${y}E`) : Array.from({ length: fn }, (_, i) => `전환 ${i + 1}년`);
  const fade = fn ? v3tYTable(k, [['fade_roe', 'ROE', 'pct2'], ['fade_payout', '배당성향', 'pct2'], ['fade_ke', '자기자본비용', 'pct2'], ['fade_bv_bop', '기초 자본', 'amt'], ['fade_ni', '지배주주 순이익', 'amt'], ['fade_ri', '초과이익', 'amt'], ['fade_div', '배당', 'amt'],
    ['fade_bv_eop', '기말 자본', 'amt', 'sum'], ['fade_df', '할인계수', 'num4'], ['fade_pv_ri', '초과이익 현재가치', 'amt'], ['fade_pv_div', '배당 현재가치', 'amt']], fys, '항목') : '';
  if (path || fade) out.push(v3Sec('BV와 ROE 경로', '<span class="meta">단위 억원</span>', `<div data-o="t-f-path">${fade ? '<h3 class="v3-h3">명시 기간</h3>' : ''}${path}${fade ? `<h3 class="v3-h3">전환 기간</h3>${fade}` : ''}</div>`));
  /* 성장률 후보: 후보마다 고든 모형 주당 가치 둘(지금 배당성향 유지, 배당성향 = 1 − g ÷ ROE). 파이썬만 계산 */
  const gc = (sub.growth_candidates || []).filter((y) => y && v3Ok(y.g));
  if (gc.length) {
    const rows = gc.map((y) => `<tr><td class="st">${esc(y.label || y.key)}</td><td>${v3Pct(y.g, 2)}</td><td>${v3Num(y.ps_keep)}</td><td>${v3Num(y.ps_stable)}</td></tr>`).join('');
    out.push(v3Sec('성장률 후보', '<span class="meta">고든 모형 주당 가치, 단위 원</span>', `<div class="mk-scroll"><table class="mk-tbl v3-t v3t-gc"><thead><tr><th class="st">후보</th><th>성장률</th><th title="지금 배당성향을 그대로 둔 값">배당성향 유지</th><th title="배당성향을 1 − 성장률 ÷ ROE로 맞춘 값">배당성향 조정</th></tr></thead><tbody>${rows}</tbody></table></div>${v3tPyOnly(k)}`));
  }
  return out.join('');
}

// ===== 적자 =====
const V3T_S2C = { incremental: '매출 증가분에 비율 적용', level: '첫해부터 목표 비율' };
/* 재투자 경로: 엔진에 넘긴 투하자본 경로와 회전율, 식으로 낸 재투자와 엔진 재투자. 파이썬 행 그대로(연도는 사례의 명시 기간) */
function v3tLossReinv(x, c, k) {
  const { g, n, sub } = k, A = (id) => v3tArr(g(id)), ic = A('ic_path'), to = A('turnover'), rs = A('reinv_s2c'), re = A('reinv_eng'), rev = A('rev');
  const m = Math.max(ic.length, to.length, rs.length, re.length);
  if (!m) return '';
  const tl = c.timeline || {}, hy = (tl.hist || []).slice(-1)[0], fc = (tl.fc || []).length >= m ? tl.fc.slice(0, m) : null;
  const cols = [{ h: hy != null ? esc(String(hy)) : '직전 실적', cls: 'h' }, ...Array.from({ length: m }, (_, i) => ({ h: fc ? `${fc[i]}E` : `${i + 1}년`, cls: i ? '' : 'bl' }))];
  const row = (nm, h0, a, d, cls) => (a.length ? { nm, cls, cells: [h0 == null ? '' : v3Num(h0, d), ...Array.from({ length: m }, (_, i) => v3Num(a[i], d))] } : null);
  const rows = [rev.length === m + 1 ? row('매출', rev[0], rev.slice(1), 0) : null, row('투하자본', n('ic0'), ic, 0), row('투하자본회전율<small>배</small>', null, to, 2),
    row('재투자<small>매출 증가 ÷ 비율</small>', null, rs, 0), row('반영 재투자', null, re, 0, 'sum')].filter(Boolean);
  const rv = sub.reinv || {}, md = rv.mode ?? rv.applied, asked = rv.requested && md && rv.requested !== md ? `<small>요청 ${esc(V3T_S2C[rv.requested] || rv.requested)}</small>` : '';
  const opt = md ? `<div class="v3-opt"><div><span>재투자 방식</span><b class="v3t-ro">${esc(V3T_S2C[md] || md)}${asked}</b></div></div>` : '';
  return v3Sec('재투자 경로', '<span class="meta">Base, 단위 억원</span>', `${opt}${v3tWide(x, 'Base', cols, rows)}${v3tPyOnly(k)}`);
}
/* 시나리오별 목표 이익률(목표가 시나리오마다 다를 때만): Bull, Base, Bear 순서 세 칸 행(TYP.loss.sc.*). 엔진 본 계산은 Base 목표 하나 */
function v3tLossScen(x, k) {
  const { g, sub } = k, sc = sub.scen;
  if (!sc) return '';
  const A = (id) => v3tArr(g(id)), has = (id) => A(id).some(v3Ok), tg = A('sc.target_margin').length ? A('sc.target_margin') : V3_SCEN.map((S) => sc.targets?.[S]);
  const tr = (nm, a, f, cls = '', tip) => `<tr class="${cls}"><td class="st">${nm}</td>${V3_SCEN.map((_, i) => `<td${tip ? ` title="${esc(tip(i))}"` : ''}>${f(a[i])}</td>`).join('')}</tr>`;
  const same = (a) => V3_SCEN.every((_, i) => v3Ok(a[i]) && a[i] === a[0]), tr1 = (nm, a, f) => (same(a) ? `<tr><td class="st">${nm}</td><td class="v3t-all" colspan="${V3_SCEN.length}">${f(a[0])}<small>세 시나리오 같음</small></td></tr>` : tr(nm, a, f));
  const amt = (v) => v3Num(v), raw = A('sc.ps_raw');
  let body = tr('목표 영업이익률', tg, (v) => v3Pct(v, 1));
  if (has('sc.v_dcf')) body += tr('DCF 주주가치<small>억원</small>', A('sc.v_dcf'), amt) + tr('부도 가중 주주가치<small>억원</small>', A('sc.v_w'), amt) + (has('sc.shares') ? tr1('주식수<small>주</small>', A('sc.shares'), amt) : '')
    + tr('주당 가치<small>원</small>', A('sc.ps'), amt, 'sum', raw.some(v3Ok) ? (i) => `반올림 전 ${v3Won(raw[i])}` : null) + tr('현재가 대비', A('sc.up'), (v) => v3Up(v) || '-');
  if (has('sc.vc_pe')) body += tr('목표연도 순이익<small>억원</small>', A('sc.vc_ni'), amt) + tr('VC 현재가치<small>이익 × PER, 억원</small>', A('sc.vc_pe'), amt) + tr('VC 주당 가치<small>이익 × PER, 원</small>', A('sc.vc_pe_ps'), amt, 'sum');
  if (has('sc.vc_psr')) body += tr('목표연도 매출<small>억원</small>', A('sc.vc_rev'), amt) + tr('VC 현재가치<small>매출 × PSR, 억원</small>', A('sc.vc_psr'), amt) + tr('VC 주당 가치<small>매출 × PSR, 원</small>', A('sc.vc_psr_ps'), amt, 'sum');
  return v3Sec('시나리오별 목표 이익률', '', `<div class="mk-scroll"><table class="mk-tbl v3-t v3t-sc"><thead><tr><th class="st">구분</th>${V3_SCEN.map((S) => `<th>${S}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${v3tPyOnly(k)}`);
}
function v3tLoss(x, c, k) {
  const { n, g, T, sub } = k, li0 = c.input.typ?.loss || {}, dis = !x.live, close = x.t.close, out = [], R = x.res.rows?.Base || {};
  // 목표 이익률 경로
  const tm0 = li0.target_margin, tmo = tm0 && typeof tm0 === 'object', tmB = tmo ? tm0.Base : tm0, tmKey = tmo ? 'i.typ.loss.target_margin.Base' : 'i.typ.loss.target_margin';
  const toT = x.sw.fade_margin === 'to_target', tgt = v3tNum(x.sw.fade_margin_target), { hist, H, M } = x.tl;
  const mg = R['DCF.margin'] || [], hm = hist.map((_, i) => { const e = R['IS.ebit']?.[i], rv = R['IS.rev']?.[i]; return v3Ok(e) && rv ? e / rv : null; });
  if (mg.length) {
    const yd = v3Years(x, 'dcf'), lab = [...hist.map(String), ...yd.map((y) => (y.k === 't' ? '종료' : `${y.y}E`))];
    const fs = `${toT && v3Ok(tmB) ? v3F('목표 영업이익률', v3tIn(x, tmKey, tmB, { fmt: 'pct', d: 1, lab: '목표 영업이익률', dis }, 'tm')) : ''}${v3F('매출 ÷ 투하자본', `<b class="v3t-ro">${v3X(n('s2c'))}</b>`)}${v3F('전환 기간', `<b class="v3t-ro">${M}년</b>`)}`;
    const warn = toT && v3Ok(tgt) && !M ? v3tWarn('전환 기간이 0년이라 목표 이익률이 결과에 들어가지 않습니다.') : '';
    const cols = [...(H ? [{ h: `${hist[H - 1]}`, cls: 'h' }] : []), ...yd.map((y, i) => ({ h: y.k === 't' ? '종료연도' : `${y.y}E`, cls: `${i ? '' : 'bl'}${y.k === 'd' ? ' fd' : ''}`.trim() }))];
    const tr = (nm, hv, a, f, cls = '') => ({ nm, cls, cells: [...(H ? [f(hv)] : []), ...yd.map((_, i) => f(a[i]))] });
    const tbl = v3tWide(x, 'Base', cols, [tr('매출', R['IS.rev']?.[H - 1], R['DCF.rev'] || [], (v) => v3Num(v)), tr('영업이익', R['IS.ebit']?.[H - 1], R['DCF.ebit'] || [], (v) => v3Num(v)), tr('영업이익률', hm[H - 1], mg, (v) => v3Pct(v, 1), 'sum')]);
    const chart = `${v3cLegend([{ label: '영업이익률', cls: 's1', kind: 'line' }, v3Ok(tgt) && toT ? { label: '목표 영업이익률', cls: 's3', kind: 'dash' } : null].filter(Boolean))}${v3cLines({ w: v3Wd(x), h: 220, labels: lab, fc: H, fmt: (v) => v3Pct(v, 0),
      lines: [{ name: '영업이익률', cls: 's1', values: [...hm, ...mg] }], hlines: v3Ok(tgt) && toT ? [{ v: tgt, label: `목표 ${v3Pct(tgt, 1)}`, cls: 's3' }] : [], title: '영업이익률 경로' })}`;
    out.push(v3Sec('목표 이익률 경로', '<span class="meta">단위 억원</span>', `<div class="v3-fs">${fs}</div><div data-o="t-l-path">${warn}${chart}${tbl}</div>`));
  }
  out.push(v3tLossReinv(x, c, k));
  // 부도 가중
  const basis = sub.liq_basis, li = x.I.typ?.loss || {}, p = n('p'), liq = [];
  const fs2 = [v3F('누적 부도 확률', v3In(x, 'i.typ.loss.p_default', li0.p_default, { fmt: 'pct', d: 1, lab: '누적 부도 확률', dis, ph: '0' }))];
  if (basis === 'book_x_recovery') fs2.push(v3F('자산 회수율', v3In(x, 'i.typ.loss.liq_recovery', li0.liq_recovery, { fmt: 'pct', d: 1, lab: '자산 회수율', dis })));
  if (basis === 'input') fs2.push(v3F('청산가치', v3In(x, 'i.typ.loss.liq_value', li0.liq_value, { fmt: 'amt', lab: '청산가치', dis })));
  if (basis === 'assets') (li0.liq_assets || []).forEach((a, i) => fs2.push(v3F(`${esc(a.name || `자산 ${i + 1}`)} 회수율`, v3In(x, `i.typ.loss.liq_assets.${i}.recovery`, a.recovery, { fmt: 'pct', d: 1, lab: `${a.name || ''} 회수율`, dis }))));
  if (basis === 'assets' || basis === 'book_x_recovery') {
    const as = basis === 'assets' ? (li.liq_assets || []).map((a, i) => [a.id || i + 1, a.name || `자산 ${i + 1}`]) : [[1, '자산총계 장부가']];
    as.forEach(([id, nm]) => { const a = v3tArr(g(`liq.${id}`)); if (a.length) liq.push(['', esc(nm), v3Eok(a[2]), '', `${v3Eok(a[0])} × ${v3Pct(a[1], 1)}`]); });
    liq.push(['=', '자산 회수액', v3Eok(n('liq_gross')), 'sum'], ['−', '먼저 갚을 부채', v3Eok(n('liq_debt'))]);
  }
  const lc = v3tCalc(liq, [['=', '청산가치', v3Eok(n('v_liq')), 'k']]);
  const vw = v3tCalc([['', 'DCF 주주가치', v3Eok(n('v_dcf'))], ['×', '생존 확률', v3Pct(v3Ok(p) ? 1 - p : null, 1)], ['+', '청산가치 × 부도 확률', v3Eok(v3Ok(p) && v3Ok(n('v_liq')) ? n('v_liq') * p : null)], ['=', '부도 가중 주주가치', v3Eok(n('v_w')), 'sum'], ['÷', '주식수', `${v3Num(n('shares'))}주`]],
    [['=', '주당 가치', v3Won(n('ps')), 'k big'], ['', 'DCF 주당 가치', v3Won(v3tRound(n('ps_dcf_raw'), +x.sw.round || 100))]]);
  out.push(v3Sec('부도 가중 가치', '<span class="meta">Base, 단위 억원</span>', `<div class="v3-fs">${fs2.join('')}</div><div class="v3t-io v3t-gap" data-o="t-l-pw"><div><h3 class="v3-h3">청산가치</h3>${lc}</div><div><h3 class="v3-h3">부도 가중</h3>${vw}</div></div>`));
  // VC 방식
  const vc0 = li0.vc;
  if (vc0 && typeof vc0 === 'object' && (n('vc_pe') != null || n('vc_psr') != null || n('vc_ret') != null)) {
    const fs3 = [];
    if (vc0.per != null) fs3.push(v3F('목표 PER', v3In(x, 'i.typ.loss.vc.per', vc0.per, { fmt: 'x', d: 1, lab: '목표 PER', dis })));
    if (vc0.psr != null) fs3.push(v3F('목표 PSR', v3In(x, 'i.typ.loss.vc.psr', vc0.psr, { fmt: 'x', d: 1, lab: '목표 PSR', dis })));
    fs3.push(v3F('VC 목표수익률', v3In(x, 'i.typ.loss.vc.target_return', vc0.target_return, { fmt: 'pct', d: 1, lab: 'VC 목표수익률', dis })));
    const ey = sub.vc?.exit_year ?? vc0.exit_year, nn = n('vc_n'), ret = n('vc_ret'), dfac = v3Ok(ret) && v3Ok(nn) ? (1 + ret) ** nn : null;
    const one = (base, bl, mult, ml, ex, pv, ps) => v3tCalc([['', `${ey ? `${esc(String(ey))}년 ` : ''}${bl}`, v3Eok(base)], ['×', ml, v3X(mult, 1)], ['=', '회수 가치', v3Eok(ex), 'sum'], ['÷', '목표수익률 할인', v3X(dfac, 2), '', v3Ok(nn) ? `${v3Pct(ret, 0)}, ${v3Num(nn, 2)}년` : '']],
      [['=', '현재가치', v3Eok(pv), 'k'], ['', '주당 가치', v3Won(ps)]]);
    const cs = [];
    if (n('vc_per_x') != null) cs.push(`<div><h3 class="v3-h3">이익 × PER</h3>${one(n('vc_ni'), '순이익', n('vc_per_x'), '목표 PER', n('vc_exit_pe'), n('vc_pe'), n('vc_pe_ps'))}</div>`);
    if (n('vc_psr_x') != null) cs.push(`<div><h3 class="v3-h3">매출 × PSR</h3>${one(n('vc_rev'), '매출', n('vc_psr_x'), '목표 PSR', n('vc_exit_psr'), n('vc_psr'), n('vc_psr_ps'))}</div>`);
    out.push(v3Sec('VC 방식', '<span class="meta">Base, 단위 억원</span>', `<div class="v3-fs">${fs3.join('')}</div><div class="v3t-io v3t-gap" data-o="t-l-vc">${cs.join('') || '<div class="empty">VC 방식 값이 없습니다.</div>'}</div>`));
  }
  out.push(v3tLossScen(x, k));
  return out.join('');
}

// ===== 지주 =====
function v3tHold(x, c, k) {
  const { n, g } = k, hi0 = c.input.typ?.holding || {}, dis = !x.live, out = [], sc = x.sw.holding_disc_scope || 'listed';
  const subs = hi0.subs || [], hs = k.sub, py = {}; (hs.subs || []).forEach((y) => { if (y) py[String(y.id)] = y; });
  /* 자동 초안(DART 타법인 출자 현황)으로 채운 줄과 종목코드, 과열 기준을 넘은 자회사. 모두 파이썬 결과를 읽기만 함 */
  const autoOf = (s, id) => !!(s.auto ?? py[id]?.auto), nAuto = subs.filter((s, i) => autoOf(s, String(s.id || `s${i + 1}`))).length, hot = (hs.hot?.subs || []).filter(Boolean);
  const hotOf = (s) => hot.find((h) => s.name && String(h).startsWith(String(s.name))), hotRest = hot.filter((h) => !subs.some((s) => hotOf(s) === h));
  const rows = subs.map((s, i) => {
    const id = String(s.id || `s${i + 1}`), a = v3tArr(g(`sub.${id}`)), key = s.listed && s.mcap != null ? 'mcap' : s.value != null ? 'value' : s.book != null ? 'book' : 'value';
    const code = s.code ?? py[id]?.code, tag = `${code ? `<small>${esc(String(code))}</small>` : ''}${autoOf(s, id) && nAuto < subs.length ? '<small>자동 초안</small>' : ''}${hotOf(s) ? `<small class="v3t-hot" title="${esc(String(hotOf(s)))}">과열 기준 초과</small>` : ''}`;
    const whole = v3In(x, `i.typ.holding.subs.${i}.${key}`, s[key], { fmt: 'amt', cell: true, lab: `${s.name || id} ${key === 'book' ? '지분 장부가' : '전체 가치'}`, dis });
    const stake = key === 'book' ? '<span class="v3t-ro">-</span>' : v3In(x, `i.typ.holding.subs.${i}.stake`, s.stake, { fmt: 'pct', d: 1, cell: true, lab: `${s.name || id} 지분율`, dis });
    return `<tr><td class="st">${esc(s.name || id)}${tag}</td><td class="tx" data-l="구분">${s.listed ? '상장' : '비상장'}</td><td class="in" data-l="지분율">${stake}</td><td class="in" data-l="${key === 'book' ? '지분 장부가' : '전체 가치'}">${whole}</td>
      <td data-l="지분가치" data-o="t-h-g${i}">${v3Num(a[5])}</td><td data-l="할인율" data-o="t-h-d${i}">${v3Pct(a[4], 1)}</td><td data-l="할인 뒤" data-o="t-h-n${i}">${v3Num(a[6])}</td></tr>`;
  }).join('');
  const sum = `<tr class="sum" data-o="t-h-sum"><td class="st">합계</td><td class="tx"></td><td></td><td></td><td data-l="지분가치">${v3Num(n('subs_gross'))}</td><td></td><td data-l="할인 뒤">${v3Num(n('subs_net'))}</td></tr>`;
  const opt = `<div class="v3-opt"><div><span>할인 적용 범위</span>${v3Sw(x, 'sw.holding_disc_scope', [['listed', '상장 자회사'], ['subs', '자회사 전체'], ['nav', 'NAV 전체']], sc)}</div></div>
    <div class="v3-fs">${v3F('지주사 할인율', v3In(x, 'sw.holding_disc', c.switches.holding_disc ?? 0.3, { fmt: 'pct', d: 1, lab: '지주사 할인율', dis }))}</div>`;
  const tbl = subs.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3t-st"><thead><tr><th class="st">자회사</th><th class="tx">구분</th><th>지분율</th><th>전체 가치</th><th>지분가치</th><th>할인율</th><th>할인 뒤</th></tr></thead><tbody>${rows}${sum}</tbody></table></div>` : '<div class="empty">자회사 표가 없습니다.</div>';
  const am = hs.subs_auto, amT = am ? ['DART 타법인 출자 현황 자동 초안', am.report ? `보고서 ${am.report}` : '', am.stlm_dt ? `결산일 ${am.stlm_dt}` : '', am.rcept_no ? `접수번호 ${am.rcept_no}` : ''].filter(Boolean).join(', ') : '';
  const hp = n('hot_per') ?? v3tNum(hs.hot?.per), hb = n('hot_pbr') ?? v3tNum(hs.hot?.pbr), hotT = [v3Ok(hp) ? `PER ${v3Num(hp, hp % 1 ? 1 : 0)}배` : '', v3Ok(hb) ? `PBR ${v3Num(hb, hb % 1 ? 1 : 0)}배` : ''].filter(Boolean).join(', ');
  const notes = `${amT ? `<p class="v3t-note">${esc(amT)}</p>` : ''}${hs.subs_auto_err ? v3tWarn(`DART 자동 초안 실패: ${esc(String(hs.subs_auto_err))}`) : ''}${hotT && subs.length ? `<p class="v3t-note">자회사 과열 기준 ${hotT}</p>` : ''}${hotRest.length ? v3tWarn(`과열 기준을 넘는 자회사: ${esc(hotRest.join(', '))}`) : ''}`;
  out.push(v3Sec('자회사 지분가치', '<span class="meta">단위 억원</span>', opt + tbl + notes));
  // NAV
  const ov = hi0.own_value || {}, mode = ov.mode || (v3tNum(ov.amount) != null ? 'input' : 'none'), it = [];
  it.push(['자체 사업가치', mode === 'input' ? v3In(x, 'i.typ.holding.own_value.amount', ov.amount, { fmt: 'amt', cell: true, lab: '자체 사업가치', dis }) : `<span class="v3t-ro" data-o="t-h-own">${v3Num(n('own'))}</span>`, mode === 'engine_ev' ? 'DCF 영업가치' : mode === 'multiple' ? '배수' : '']);
  if (v3tNum(hi0.net_cash) != null && hi0.cash == null && hi0.debt == null) it.push(['순현금', v3In(x, 'i.typ.holding.net_cash', hi0.net_cash, { fmt: 'amt', cell: true, lab: '순현금', dis }), '']);
  else { it.push(['현금', v3In(x, 'i.typ.holding.cash', hi0.cash, { fmt: 'amt', cell: true, lab: '지주 별도 현금', dis, ph: '0' }), '']); it.push(['차입', v3In(x, 'i.typ.holding.debt', hi0.debt, { fmt: 'amt', cell: true, lab: '지주 별도 차입', dis, ph: '0' }), '']); }
  (hi0.others || []).forEach((o, i) => it.push([esc(o.name || `기타 ${i + 1}`), v3In(x, `i.typ.holding.others.${i}.amount`, o.amount, { fmt: 'amt', cell: true, lab: o.name || '기타 차감', dis }), '차감']));
  const items = `<div class="mk-scroll"><table class="mk-tbl v3-t v3t-it"><thead><tr><th class="st">지주 별도</th><th>금액</th></tr></thead><tbody>${it.map(([nm, inp, sb]) => `<tr><td class="st">${nm}${sb ? `<small>${sb}</small>` : ''}</td><td class="in">${inp}</td></tr>`).join('')}</tbody></table></div>`;
  const close = x.t.close, other = n('other');
  const calc = v3tCalc([['', '자회사 지분가치', v3Eok(n('subs_gross'))], ['+', '자체 사업가치', v3Eok(n('own'))], ['+', '현금', v3Eok(n('cash'))], ['−', '차입', v3Eok(n('debt'))], other ? ['−', '기타 차감', v3Eok(other)] : null,
    ['=', 'NAV 할인 전', v3Eok(n('nav_gross')), 'sum'], ['−', '지주사 할인', v3Eok(n('disc_amt')), '', `NAV 대비 ${v3Pct(n('disc_eff'), 1)}`], ['=', 'NAV 할인 뒤', v3Eok(n('nav')), 'sum'], ['÷', '주식수', `${v3Num(n('shares'))}주`]],
  [['=', '주당 NAV', v3Won(n('nav_ps')), 'k big'], ['', '할인 전 주당 NAV', v3Won(v3tRound(n('nav_ps_gross'), +x.sw.round || 100))], v3Ok(close) ? ['', '시장이 매기는 할인율', v3Pct(n('mkt_disc'), 1)] : null]);
  out.push(v3Sec('NAV와 지주사 할인', '<span class="meta">단위 억원</span>', `<div class="v3t-io"><div>${items}</div><div data-o="t-h-calc">${calc}</div></div>`));
  return out.join('');
}

// ===== 비상장 =====
const V3T_PURPOSE = { minority: '소수지분 매각', control: '경영권 매각', ipo: 'IPO', longterm: '장기 보유' };
function v3tPriv(x, c, k) {
  const { n, g, T, sub } = k, sm = sub.summary || {}, pi0 = c.input.typ?.private || {}, dis = !x.live, out = [], on = (id) => n(id) === 1, U = +x.sw.round || 100;
  // 총베타
  const rhoIn = on('tb_on') && x.sw.beta_mode === 'manual' ? v3F('상관계수 ρ', v3tIn(x, 'i.typ.private.rho', pi0.rho ?? v3tN(T.rows?.['TYP.priv.rho']), { fmt: 'num', d: 4, lab: '상관계수', dis }, 'rho')) : '';
  const purpose = sm.purpose || x.sw.purpose, mb = (sub.alt || []).find((a) => a?.key === 'market_beta');
  const ro = `<dl class="va-kv v3t-kv">${v3tKv('비교기업 R² 평균', `${v3Num(n('r2_avg'), 4)}${n('r2_n') != null ? `<small>${v3Num(n('r2_n'))}곳</small>` : ''}`)}${sm.tb_mode === 'partial' ? v3tKv('매수자 분산 정도', v3Num(n('buyer_div'), 2)) : ''}</dl>`;
  const bwarn = x.ov['i.beta.manual'] != null ? v3tWarn('총베타를 바꾸면 시가총액 반복 계산은 파이썬에서 다시 해야 반영됩니다.') : '';
  const calc = v3tCalc([['', '바텀업 시장 베타', v3Num(n('beta_bu'), 2)], ['', '하한 적용 시장 베타', v3Num(n('beta_mkt'), 2), '', n('beta_floor') != null ? `하한 ${v3Num(n('beta_floor'), 2)}` : ''],
    ['×', '베타 배수', v3X(n('tb_factor'), 2), '', rhoIn ? '' : `ρ ${v3Num(n('rho'), 4)}`]],
  [['=', '총베타', v3Num(n('beta'), 2), 'k big'], ['', '안정기 베타', v3Num(n('beta_s'), 2)], ['', '자기자본비용', v3Pct(v3V(x, 'WACC.ke', 0, 'Base'), 2), '', 'DCF Base'],
    mb ? ['', '시장 베타로 계산한 주당 가치', v3Won(mb.ps), '', k.chg ? '처음 값' : ''] : null]);
  out.push(v3Sec('총베타', '<span class="meta">Base</span>', `<div class="v3t-io"><div><div class="v3-fs">${rhoIn}</div>${ro}</div><div data-o="t-p-beta">${bwarn}${calc}</div></div>`));
  // 단계별 가치
  const fs = [];
  if (on('dlom_on') && x.sw.dlom !== 'silber') fs.push(v3F('비유동성 할인', v3In(x, 'sw.dlom', c.switches.dlom ?? 0.3, { fmt: 'pct', d: 1, lab: '비유동성 할인', dis })));
  if (on('ctrl_on')) fs.push(v3F('경영권 프리미엄', v3In(x, 'sw.control_prem', c.switches.control_prem ?? 0, { fmt: 'pct', d: 1, lab: '경영권 프리미엄', dis })));
  fs.push(v3F('핵심 인물 할인', v3In(x, 'sw.key_person', c.switches.key_person ?? 0, { fmt: 'pct', d: 1, lab: '핵심 인물 할인', dis })));
  const STEP = { control: ['경영권 프리미엄', 'control_prem', 'control_amt', 'eq_control', 1], dlom: ['비유동성 할인', 'dlom', 'dlom_amt', 'eq_dlom', -1], key_person: ['핵심 인물 할인', 'key_person', 'key_person_amt', 'eq_key_person', -1] };
  const ord = k.L?._order || (Array.isArray(sm.order) ? sm.order : ['control', 'dlom', 'key_person']);
  const st = ord.filter((s) => STEP[s] && !(s === 'control' && !on('ctrl_on'))).map((s) => {
    const [nm, kr, ka, kq, sg] = STEP[s], rt = n(kr), am = n(ka);
    return `<tr><td class="st">${nm}</td><td>${v3Ok(rt) ? `${rt ? (sg > 0 ? '+' : '−') : ''}${v3Pct(rt, 1)}` : '-'}</td><td>${v3Ok(am) ? `${am ? (sg > 0 ? '+' : '−') : ''}${v3Num(am)}` : '-'}</td><td>${v3Num(n(kq))}</td></tr>`;
  }).join('');
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3t-sg"><thead><tr><th class="st">단계</th><th>비율</th><th>금액</th><th>단계 뒤 주주가치</th></tr></thead><tbody>
    <tr><td class="st">DCF 주주가치</td><td></td><td></td><td>${v3Num(n('eq_dcf'))}</td></tr>${st}<tr class="sum"><td class="st">조정 뒤 주주가치</td><td>${v3Ok(n('disc_total')) ? `${n('disc_total') < 0 ? '−' : n('disc_total') > 0 ? '+' : ''}${v3Pct(Math.abs(n('disc_total')), 1)}` : '-'}</td><td></td><td>${v3Num(n('eq'))}</td></tr></tbody></table></div>`;
  const lo = n('dlom_ref_lo'), hi = n('dlom_ref_hi');
  const kv = `<dl class="va-kv v3t-kv">${v3tKv('주식수', `${v3Num(n('shares'))}주`)}${v3tKv('주당 가치', v3Won(n('ps')))}${v3Ok(lo) ? v3tKv(`연구 할인율 ${v3Pct(lo, 2)}`, v3Won(n('ps_dlom_lo'))) : ''}${v3Ok(hi) ? v3tKv(`연구 할인율 ${v3Pct(hi, 2)}`, v3Won(n('ps_dlom_hi'))) : ''}</dl>`;
  out.push(v3Sec('단계별 가치', '<span class="meta">Base, 단위 억원</span>', `<div class="v3-opt"><div><span>평가 목적</span><b class="v3t-ro">${esc(V3T_PURPOSE[purpose] || purpose || '-')}</b></div></div><div class="v3-fs">${fs.join('')}</div><div data-o="t-p-st">${tbl}${kv}</div>`));
  // 상증법 대조
  if (n('sj_value') != null) {
    const H = x.tl.H, ys = [0, 1, 2].map((i) => x.tl.hist[H - 1 - i]).filter((y) => y != null);
    const yt = ys.length === 3 ? v3tYTable(k, [['sj_ni', '순손익액<small>억원</small>', 'amt'], ['sj_sh', '사업연도 말 주식수<small>주</small>', 'amt'], ['sj_eps', '1주당 순손익액<small>원</small>', 'amt', 'sum'], ['sj_w_year', '가중치', 'amt']], ys, '구분') : '';
    const rt = n('sj_dcf_ratio'), inR = v3Ok(rt) ? rt >= 0.7 && rt <= 1.3 : null, maj = n('sj_major_rate');
    const calc2 = v3tCalc([['', '1주당 순손익액 가중평균', v3Won(n('sj_eps_wavg'))], ['÷', '환원율', v3Pct(n('sj_rate'), 0)], ['=', '1주당 순손익가치', v3Won(n('sj_earn')), 'sum'],
      ['', '1주당 순자산가치', v3Won(n('sj_nav')), '', `순자산 ${v3Eok(n('sj_net_asset'))}, 영업권 ${v3Eok(n('sj_goodwill'))}`], ['', '가중평균 가액', v3Won(n('sj_wavg')), '', n('sj_w_earn') != null ? `${v3Num(n('sj_w_earn'))} : ${v3Num(n('sj_w_nav'))}` : ''],
      ['', '하한', v3Won(n('sj_floor')), '', `순자산가치의 ${v3Pct(n('sj_floor_rate'), 0)}`], maj ? ['+', '최대주주 할증', v3Pct(maj, 0)] : null],
    [['=', '1주당 평가액', v3Won(n('sj_value_major')), 'k'], ['', 'DCF 주당 가치 ÷ 평가액', v3X(rt, 2), '', inR == null ? '' : inR ? '70～130% 안' : '70～130% 밖']]);
    out.push(v3Sec('상증법 대조', '<span class="meta">단위 원</span>', `${yt}<div class="v3t-sj" data-o="t-p-sj">${calc2}</div>`));
  }
  return out.join('');
}

function v3tRep(x, c) {
  const k = v3tCtx(x);
  if (!k) return v3Sec('유형별 가치', '', '<div class="empty">유형별 결과가 없습니다.</div>');
  const body = { financial: v3tFin, loss: v3tLoss, holding: v3tHold, private: v3tPriv }[k.T.type](x, c, k);
  return v3tTop(x, k) + body + v3tChecks(k.T);
}

/* 목표 이익률은 sw.fade_margin_target(엔진)도, ρ는 총베타 자리(i.beta.manual, 안정기 i.beta.stable_manual)도 같이 바꿈 */
function v3tMirror(x, kind, v) {
  if (!v3Ok(v)) return {};
  if (kind === 'tm') return { 'sw.fade_margin_target': v };
  if (kind === 'rho') {
    const r = (id) => v3tNum(v3tN(x.res.typ?.rows?.['TYP.priv.' + id])), bm = r('beta_mkt'), sm = r('beta_s_mkt');
    if (!v3Ok(bm) || v <= 0 || v > 1) return {};
    const f = 1 + (1 / v - 1) * (1 - (r('buyer_div') ?? 0)), o = { 'i.beta.manual': bm * f };
    if (x.sw.stable_beta === 'manual' && v3Ok(sm)) o['i.beta.stable_manual'] = r('stable_keep') !== 0 ? sm * f : sm;
    return o;
  }
  return {};
}
v3On('input', 'input[data-v3t]', (el, x) => {
  const c = x.c, st = v3St(c), k = el.dataset.k, kind = el.dataset.v3t, raw = v3NumOf(el.value), off = raw == null || raw === v3NumOf(el.dataset.b);
  const v = off ? null : raw / (+el.dataset.sc || 1), mir = v3tMirror(x, kind, v);
  for (const m of V3T_MIR[kind] || []) delete st.ov[m];
  if (off) delete st.ov[k]; else { st.ov[k] = { t: el.value, v }; for (const [m, mv] of Object.entries(mir)) v3SetOv(c, m, mv); }
  el.classList.toggle('chg', !off);
  v3Later();
  return false;
});

v3Rep('typ', '유형별', v3tRep, (x) => x.sw.company_type && x.sw.company_type !== 'general');

// ---------- 보고서: LBO (v3l) ----------
// x.res.lbo(= 사례 py.lbo, lbo.py run_core 결과)를 읽기만 함. py.lbo는 파이썬만 계산하고 JS 엔진은 다시 계산하지 않음(평균 잔액 이자 순환 포함).
// 거래 가정 입력 칸은 덮기 키 i.lbo.<py.lbo.input 키>로 「입력 내려받기」에만 실리고 화면 값은 그대로. 바꾼 입력이 있으면 맨 위에 안내(몬테카를로와 같은 방식).
// 화면 상태: x.st.lyt(연도별 표 보기: debt 차입 상환, pl 손익과 현금, bs 재무상태표)
// 대안 선택지를 켠 사례만 더 보이는 것: 최근 12개월 진입(entry.ebitda_fy0), 기존 차입 승계(su.sources.assumed, LBO.old.*), 금리 하한, 임의 상환 비율, 인수가격 배분(ppa), 참여자별 수익(party)
// 가정 근거(notes.why)는 칸 이름 툴팁과 거래 가정 아래 「가정 근거」 목록(x.st.lwhy)에. 본문 폭 620 미만에서는 차입 구성이 트랜치별 묶음으로, 조달 시나리오가 가로세로 바뀐 표로 바뀜
// 종결일 간격(py.lbo.input.close_gap, 대조표 M3-203)이 있는 사례만: 보유 기간 소수 표시, 첫 추정 연도 머리에 종결일 뒤 기간(LBO.yf), 거래 가정과 진입 표에 종결일 칸
const V3L_TR = ['rcf', 'tla', 'tlb', 'sub', 'cb']; // lbo.py TR 순서(LBO.t.* 트랜치 열 순서와 같음)
const V3L_TRF = { bop: '기초', draw: '인출과 상환', pik: 'PIK 가산', mand: '의무 상환', opt: '임의 상환', end: '기말', rate: '금리', int: '이자비용', over: '한도 초과액' };
const V3L_KEEP = new Set(['bop', 'end', 'rate', 'int']); // 값이 모두 0이어도 남기는 트랜치 줄
const V3L_ADJ = ['cash', 'st_fin', 'op_ca', 'ppe', 'intang', 'ppa', 'goodwill', 'dff', 'onca', 'ta', 'op_cl', 'old_debt', 'oncl', 'dtl', 'new_debt', 'tl', 'equity', 'check'];
const V3L_ADJ_NM = { goodwill: '영업권', check: '대차 차이' };
const V3L_LV = { err: ['오류', 'red'], warn: ['주의', 'warn'], info: ['참고', ''] };
/* 연도별 표 묶음. [묶음 이름, [[행 id, 화면 이름(없으면 labels), 줄 클래스, 0이어도 남김]]] */
const V3L_PL = [
  ['손익', [['rev'], ['ebitda', '', 'sum', 1], ['dep'], ['amort'], ['ppa_amort'], ['ebit', '', '', 1], ['fee_exp', '금융 수수료 상각'], ['int_inc'], ['int_exp', '', '', 1], ['ebt', '', '', 1], ['nol_use'], ['tax_base'], ['tax', '', '', 1], ['tax_cur'], ['dtl_rel'], ['ni', '', 'sum', 1]]],
  ['현금흐름', [['cfo', '', '', 1], ['cfi', '', '', 1], ['div'], ['cff', '', '', 1], ['dcash'], ['cash', '', 'sum', 1], ['nol_eop']]],
  ['비율', [['tax_rate'], ['base_rate']]],
];
const V3L_BS = [
  ['자산', [['cash', '현금', '', 1], ['bs.op_ca'], ['bs.ppe'], ['bs.intang'], ['bs.ppa'], ['bs.goodwill'], ['bs.dff'], ['bs.onca'], ['bs.ta', '', 'sum', 1]]],
  ['부채와 자본', [['bs.op_cl'], ['debt', '신규 차입', '', 1], ['bs.oncl'], ['bs.dtl'], ['bs.tl', '', 'sum', 1], ['bs.equity', '', 'sum', 1], ['bs.check']]],
];
/* 가정 근거 항목 이름(notes.why 키 순서), 승계 차입 항목, 참여자 묶음 */
const V3L_WHY = [['premium', '인수 프리미엄'], ['tranches', '차입 구성'], ['tx_fee_pct', '거래 수수료율'], ['min_cash', '최소 현금'], ['cash_spread', '예금 가산금리'], ['base_rate', '기준금리'], ['exit_mult', '회수 배수'],
  ['scope', '범위'], ['debt_items', '기존 차입'], ['ebitda_def', 'EBITDA 정의'], ['ops', '영업 가정'], ['tax_rate', '세율'], ['extras', '원형에 없는 장치']];
const V3L_OLD = { st: '단기차입금', lt: '장기차입금', bond: '사채', cb: '전환사채', lease: '리스부채' };
const V3L_PTY = { senior: '선순위', mezz: '메자닌', equity: '재무적 투자자' };
const V3L_CASH = [['ebitda', '', '', 1], ['cfo', '', '', 1], ['cfi', '투자현금흐름', '', 1], ['div'], ['mand', '', '', 1], ['pre_rcf'], ['sweep', '임의 상환에 쓸 현금', '', 1], ['cash', '', 'sum', 1]];

const v3lRow = (L, id) => L.rows?.[`LBO.${id}`];
const v3lOne = (L, id) => { const r = v3lRow(L, id); return Array.isArray(r) ? r[0] ?? null : r ?? null; };
const v3lNm = (L, id) => L.labels?.[`LBO.${id}`]?.name || id;
const v3lFm = (L, id) => L.labels?.[`LBO.${id}`]?.fmt || 'amt';
function v3lF(v, fmt) {
  if (!v3Ok(v)) return '-';
  if (fmt === 'pct') return v3Pct(v, 1);
  if (fmt === 'pct2') return v3Pct(v, 2);
  if (fmt === 'x') return v3Num(v, 2);
  return v3Num(v);
}
const v3lZero = (a) => !(Array.isArray(a) ? a : [a]).some((v) => v3Ok(v) && Math.abs(v) > 1e-9);
const v3lKv = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
/* 계산표 한 줄: [이름, 값 html, 클래스(sum), 연산 기호, 이름 옆 작은 글] */
const v3lCr = ([name, val, cls, op, sub]) => `<tr class="${cls || ''}"><th><i>${op || ''}</i>${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</th><td>${val}</td></tr>`;
const v3lCalc = (rows) => `<table class="va-calc v3l-calc"><tbody>${rows.filter(Boolean).map(v3lCr).join('')}</tbody></table>`;
const v3lTrNm = (L, k) => v3lNm(L, `${k}.end`).replace(/\s*기말$/, '') || k;
const v3lTrs = (L) => V3L_TR.filter((k) => L.input?.tranches?.[k] || Object.keys(L.rows || {}).some((id) => id.startsWith(`LBO.${k}.`)));
const v3lYs = (L, n) => Array.from({ length: n }, (_, j) => (j ? `${L.years?.[j] ?? ''}E` : '인수 직후'));
/* 종결일 간격이 있으면 LBO.yf(연도별 기간, 년)에서 한 해가 안 되는 해의 머리에 붙일 글 */
const v3lYf = (L, j) => { const yf = L.input?.close_gap ? v3lRow(L, 'yf') : null, v = Array.isArray(yf) ? yf[j] : null; return v3Ok(v) && Math.abs(v - 1) > 1e-9 ? `<small class="v3l-yf">종결일 뒤 ${v3Num(v, 2)}년</small>` : ''; };
/* 칸 이름에 근거 툴팁(notes.why[k]) */
const v3lTip = (L, lab, k) => { const w = L.notes?.why?.[k]; return w ? `<span class="v3l-tip" title="${esc(w)}">${lab}</span>` : lab; };
/* 덮기 경로 i.lbo.<p>.<칸>을 써도 되는지: 사례 입력의 그 자리가 비었거나 객체일 때만(null이면 엔진 덮기가 경로를 못 만듦) */
const v3lPathOk = (c, p) => { const v = v3Path(c.input?.lbo || {}, p); return v === undefined || (v !== null && typeof v === 'object'); };
const v3lUnit = (L) => `<span class="meta">단위 ${esc(L.unit || '억원')}</span>`;

/* 연도별 표. groups [[묶음 이름, [[행 id, 이름, 클래스, 0이어도 남김]]]]. 회수 연도 뒤 열은 흐리게 */
function v3lYT(L, groups) {
  const n = Math.max(0, ...Object.values(L.rows || {}).filter(Array.isArray).map((a) => a.length)), ys = v3lYs(L, (L.years || []).length || n);
  const ei = (L.years || []).indexOf(L.exit_year ?? L.returns?.exit_year), pst = (j) => (ei > 0 && j > ei ? 'pst' : '');
  let body = '';
  for (const [g, rows] of groups) {
    const tr = rows.map(([id, nm, cls, keep]) => {
      const r = v3lRow(L, id);
      if (!Array.isArray(r) || (!keep && v3lZero(r))) return '';
      const f = v3lFm(L, id);
      return `<tr class="${cls || ''}"><td class="st">${esc(nm || v3lNm(L, id))}</td>${ys.map((_, j) => `<td class="${pst(j)}">${v3lF(r[j], f)}</td>`).join('')}</tr>`;
    }).join('');
    if (tr) body += `${g ? `<tr class="grp"><td class="tx" colspan="${ys.length + 1}">${esc(g)}</td></tr>` : ''}${tr}`;
  }
  if (!body) return '<div class="empty">표를 만들 값이 없습니다.</div>';
  return `<div class="mk-scroll" data-v3-keep="l-yt"><table class="mk-tbl v3-t v3l-yt"><thead><tr><th class="st">항목</th>${ys.map((y, j) => `<th class="${j === ei ? 'ex' : pst(j)}">${y}${v3lYf(L, j)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
/* 차입 상환 보기: 현금 흐름, 트랜치별 기초에서 기말, 합계 */
function v3lDebtGroups(L) {
  const gs = [['현금 흐름', V3L_CASH]];
  for (const k of [...v3lTrs(L), ...(Array.isArray(v3lRow(L, 'old.end')) ? ['old'] : [])]) {
    const ids = Object.keys(L.rows || {}).filter((id) => id.startsWith(`LBO.${k}.`)).map((id) => id.slice(5 + k.length));
    if (['bop', 'draw', 'end'].every((f) => v3lZero(v3lRow(L, `${k}.${f}`)))) continue; // 쓰지 않은 트랜치
    const ord = Object.keys(V3L_TRF), sorted = [...ids].sort((a, b) => (ord.indexOf(a) + 1 || 99) - (ord.indexOf(b) + 1 || 99));
    gs.push([v3lTrNm(L, k), sorted.map((f) => [`${k}.${f}`, V3L_TRF[f] || v3lNm(L, `${k}.${f}`), f === 'end' ? 'sum' : '', V3L_KEEP.has(f)])]);
  }
  gs.push(['합계', [['debt', '', 'sum', 1], ['net_debt', '', 'sum', 1]]]);
  return gs;
}

// ===== 회수와 수익률 =====
function v3lTop(x, L) {
  const r = L.returns || {}, att = L.attribution || {}, e = L.entry || {}, stake = v3Ok(e.stake) ? e.stake : 1;
  const gap = L.input?.close_gap, stub = gap && v3Ok(gap.frac) ? 1 - gap.frac : 0; // 첫해가 종결일 뒤 기간뿐이면 그만큼 보유 기간이 짧음
  const hold = v3Ok(r.exit_year) && v3Ok(L.base_year) ? r.exit_year - L.base_year - stub : null;
  const note = Object.keys(x.st.ov).length > 0 ? '<p class="v3l-note">처음 값으로 계산한 결과입니다. 바꾼 입력은 파이썬에서 다시 계산해야 반영됩니다.</p>' : '';
  const top = `<div class="v3l-top"><div class="v3l-irr"><span>IRR</span><b>${v3Pct(r.irr, 1)}</b></div>
    <dl class="va-kv">${v3lKv('MoM', v3X(r.mom))}${v3lKv('사모펀드 출자', v3Eok(r.equity))}${v3lKv('회수 연도', v3Ok(r.exit_year) ? `${r.exit_year}년${v3Ok(hold) ? `<small>${v3Num(hold, stub > 1e-9 ? 1 : 0)}년 보유</small>` : ''}` : '-')}${v3Ok(att.gain) ? v3lKv('가치 증가', v3Eok(att.gain)) : ''}</dl></div>`;
  const ex = v3lCalc([['회수 연도 EBITDA', v3Eok(r.exit_ebitda), '', '', v3Ok(r.exit_year) ? `${r.exit_year}E` : ''], ['회수 EV/EBITDA', v3X(r.exit_mult), '', '×'], ['회수 기업가치', v3Eok(r.exit_ev), 'sum', '='],
    ['순차입금', v3Eok(r.exit_net_debt), '', '−'], ['회수 지분가치', v3Eok(r.exit_eq), 'sum', '='],
    stake < 1 ? ['인수 지분율', v3Pct(stake, 1), '', '×'] : null, stake < 1 && v3Ok(r.exit_eq) ? ['사모펀드 몫', v3Eok(r.exit_eq * stake), 'sum', '='] : null]);
  const items = [['ebitda'], ['mult', '', 1], ['debt'], ['fees'], ['div'], ['resid']].filter(([k, , keep]) => v3Ok(att[k]) && (keep || Math.abs(att[k]) > 1e-6));
  const tot = att.total, share = (v) => (v3Ok(tot) && Math.abs(tot) > 1e-9 ? v3Pct(v / tot, 1) : '-');
  const at = items.length && v3Ok(tot) ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3l-at"><thead><tr><th class="st">항목</th><th>금액</th><th>비중</th></tr></thead>
    <tbody>${items.map(([k]) => `<tr><td class="st">${esc(k === 'resid' ? '나머지' : v3lNm(L, `att.${k}`).replace(/^수익 분해:\s*/, ''))}</td><td>${v3Num(att[k])}</td><td>${share(att[k])}</td></tr>`).join('')}
    <tr class="sum"><td class="st">합계</td><td>${v3Num(tot)}</td><td>${share(tot)}</td></tr></tbody></table></div>` : '<div class="empty">수익 분해 결과가 없습니다.</div>';
  return v3Sec('회수와 수익률', v3lUnit(L), `<div data-o="l-note">${note}</div>${top}<div class="v3l-two"><div><h3 class="v3-h3">회수 가치</h3>${ex}</div><div><h3 class="v3-h3">수익 분해</h3>${at}</div></div>`, 'v3l-ret');
}

// ===== 거래 가정 =====
/* 거래 가정의 글자 선택지: 누르면 덮기 i.lbo.<키>(처음 값과 같으면 덮기에서 뺌). 엔진을 끈 화면에서는 지금 값만 */
function v3lSw(x, key, opts, base) {
  const k = `i.lbo.${key}`, e = x.st.ov[k], J = (v) => JSON.stringify(v ?? null), cur = J(e ? e.v : base);
  if (!x.live) return `<span class="v3-iw nu"><input type="text" value="${esc((opts.find(([v]) => J(v) === cur) || [])[1] || '')}" disabled></span>`;
  return `<div class="mk-seg">${opts.map(([v, l]) => `<button type="button" data-v3l-sw="${esc(k)}" data-v="${esc(J(v))}" data-b="${esc(J(base))}" class="${J(v) === cur ? 'on' : ''}" aria-pressed="${J(v) === cur}">${esc(l)}</button>`).join('')}</div>`;
}
v3On('click', '[data-v3l-sw]', (el, x) => { const k = el.dataset.v3lSw; if (el.dataset.v === el.dataset.b) delete x.st.ov[k]; else x.st.ov[k] = { t: '', v: JSON.parse(el.dataset.v) }; return true; });
v3On('click', '[data-v3l-why]', (el, x) => { x.st.lwhy = el.dataset.v3lWhy === '1' ? 1 : 0; return true; });
const v3lRo = (lab, val) => v3F(lab, `<span class="v3-iw nu"><input type="text" value="${esc(val ?? '')}" disabled aria-label="${esc(lab)}"></span>`);
/* 종결일 간격 칸: 거래 종결일(날짜라 읽기만), 종결일 간격, 종결일 순차입금. 다른 거래 가정처럼 파이썬에서 다시 계산해야 반영 */
function v3lGapF(x, L, F) {
  const I = L.input || {}, g = I.close_gap;
  if (!g) return '';
  return v3lRo('거래 종결일', I.entry_date || '') + v3F('종결일 간격', v3lSw(x, 'close_gap', [['none', '조정 없음'], ['stub', '첫해 기간 반영']], g.mode ?? 'stub'))
    + F('종결일 순차입금', 'entry_net_debt', g.entry_net_debt, { fmt: 'amt', ph: v3Ok(g.nd_fy0) ? v3Num(g.nd_fy0) : '' });
}
/* 대안 선택지 칸(켠 사례만): 진입 기준과 최근 12개월 실적, 임의 상환 비율, 이자 순환 반복 한도 */
function v3lAltF(x, L, F) {
  const I = L.input || {}, lt = I.ltm || {}, ok = v3lPathOk(x.c, 'ltm');
  let h = '';
  if (I.entry_basis) {
    h += v3F('진입 기준', v3lSw(x, 'entry_basis', [['fy0', '직전 결산'], ['ltm', '최근 12개월']], I.entry_basis));
    h += ok ? F('최근 12개월 EBITDA', 'ltm.ebitda', lt.ebitda, { fmt: 'amt' }) + F('최근 12개월 순이익', 'ltm.ni', lt.ni, { fmt: 'amt' }) : v3lRo('최근 12개월 EBITDA', v3lF(lt.ebitda, 'amt')) + v3lRo('최근 12개월 순이익', v3lF(lt.ni, 'amt'));
    if (lt.end) h += v3lRo('최근 12개월 기준일', lt.end);
  }
  if (v3Ok(I.sweep_pct)) h += F('임의 상환 비율', 'sweep_pct', I.sweep_pct, { fmt: 'pct' });
  if (typeof I.party_irr === 'boolean') h += v3F('참여자별 수익', v3lSw(x, 'party_irr', [[false, '끔'], [true, '계산']], I.party_irr));
  if (I.circ && v3Ok(I.circ.max_iter)) h += F('이자 순환 반복 한도', 'max_iter', I.circ.max_iter, { fmt: 'num', d: 0, u: '회' });
  return h;
}
/* 가정 근거(py.lbo.notes.why, method, memo): 문장은 엔진이 준 그대로. 칸이 있는 항목은 칸 이름 툴팁에도 같은 글 */
function v3lWhyList(x, L) {
  const W = L.notes?.why || {}, known = V3L_WHY.map(([k]) => k), memo = (L.notes?.memo || []).filter(Boolean), method = L.notes?.method;
  const items = [...V3L_WHY.filter(([k]) => W[k]), ...Object.keys(W).filter((k) => !known.includes(k) && W[k]).map((k) => [k, k])];
  if (!items.length && !memo.length && !method) return '';
  const open = !!x.st.lwhy, row = (nm, tx) => `<div><dt>${esc(nm)}</dt><dd>${tx}</dd></div>`;
  return `<div class="v3l-wb"><button class="btn ghost sm" type="button" data-v3l-why="${open ? 0 : 1}" aria-expanded="${open}">가정 근거 ${open ? '접기' : '펴기'}</button></div>${open
    ? `<dl class="v3l-why">${method ? row('계산 방식', esc(method)) : ''}${items.map(([k, nm]) => row(nm, esc(W[k]))).join('')}${memo.length ? row('입력 메모', memo.map(esc).join('<br>')) : ''}</dl>` : ''}`;
}
function v3lDeal(x, L) {
  const I = L.input || {}, e = L.entry || {}, dis = !x.live, F = (lab, key, base, o = {}) => v3F(o.why ? v3lTip(L, lab, o.why) : lab, v3In(x, `i.lbo.${key}`, base, { lab, dis, ...o }));
  const br = v3lRow(L, 'base_rate'), brv = Array.isArray(br) ? br.slice(1).filter(v3Ok) : [], brOne = brv.length && brv.every((v) => Math.abs(v - brv[0]) < 1e-12);
  const fs = [I.entry_mode === 'equity' ? F('지분가치', 'equity_value', I.equity_value, { fmt: 'amt' }) : F('인수 프리미엄', 'premium', I.premium, { fmt: 'pct', why: 'premium' }),
    F('인수 지분율', 'stake', I.stake, { fmt: 'pct' }), F('거래 수수료율', 'tx_fee_pct', I.tx_fee_pct, { fmt: 'pct', why: 'tx_fee_pct' }), F('최소 현금', 'min_cash', I.min_cash, { fmt: 'amt', why: 'min_cash' }),
    brOne ? F('기준금리', 'base_rate', brv[0], { fmt: 'pct', d: 3, why: 'base_rate' }) : '', F('회수 연도', 'exit_year', I.exit_year ?? L.exit_year, { fmt: 'num', d: 0 }),
    F('회수 EV/EBITDA', 'exit_mult', I.exit_mult, { fmt: 'x', ph: v3Ok(e.mult) ? v3Num(e.mult, 2) : '', why: 'exit_mult' }), v3lAltF(x, L, F), v3lGapF(x, L, F)].join('');
  const T = I.tranches || {}, ks = v3lTrs(L), amt = v3lRow(L, 't.amt') || [], pik = ks.some((k) => Array.isArray(v3lRow(L, `${k}.pik`)));
  const od = I.old, FL = I.floors, odOk = v3lPathOk(x.c, 'old_terms');
  /* 칸마다 data-l(좁은 폭에서 트랜치별 묶음으로 바뀔 때 칸 이름). 해당 없는 칸(na)은 좁은 폭에서 숨김 */
  const td = (lab, html) => `<td data-l="${lab}">${html}</td>`, na = (lab) => `<td class="na" data-l="${lab}">-</td>`;
  const cell = (path, nm, base, fmt, lab, d) => `<td class="in" data-l="${lab}">${v3In(x, `i.lbo.${path}`, base, { fmt, cell: true, lab: `${nm} ${lab}`, dis, d })}</td>`;
  const rows = ks.map((k) => {
    const t = T[k] || {}, a = amt[V3L_TR.indexOf(k)], rate = v3lRow(L, `${k}.rate`)?.[1], fl = t.float !== false, rcf = k === 'rcf', nm = v3lTrNm(L, k), p = `tranches.${k}.`;
    const mult = t.amount != null ? td('EBITDA 배수', v3Ok(a) && e.ebitda ? v3Num(a / e.ebitda, 2) : '-') : cell(`${p}mult`, nm, t.mult, 'x', 'EBITDA 배수');
    return `<tr><td class="st">${esc(nm)}</td>${mult}${td('금액', v3lF(a, 'amt'))}${fl ? cell(`${p}spread`, nm, t.spread, 'pct', '가산금리', 2) : na('가산금리')}${fl ? na('고정금리') : cell(`${p}spread`, nm, t.spread, 'pct', '고정금리', 2)}
      ${FL ? (fl ? cell(`${p}floor`, nm, FL[k], 'pct', '금리 하한', 2) : na('금리 하한')) : ''}${td('첫해 금리', v3lF(rate, 'pct2'))}${pik ? (Array.isArray(v3lRow(L, `${k}.pik`)) ? cell(`${p}pik_rate`, nm, t.pik_rate, 'pct', 'PIK 금리', 2) : na('PIK 금리')) : ''}${rcf ? na('연 의무 상환') : cell(`${p}mand_pct`, nm, t.mand_pct, 'pct', '연 의무 상환', 2)}${cell(`${p}term`, nm, t.term, 'num', '만기 연수', 0)}</tr>`;
  }).join('');
  /* 승계한 기존 차입(input.old): 금액은 기준 연도 잔액, 조건은 old_terms */
  const oc = (f, base, fmt, lab, d) => (odOk ? cell(`old_terms.${f}`, '승계 차입', base, fmt, lab, d) : td(lab, v3lF(base, fmt === 'pct' ? 'pct2' : fmt)));
  const picked = od ? Object.keys(od.items || {}).filter((k) => od.pick?.[k] && Math.abs(od.items[k] || 0) > 1e-9).map((k) => V3L_OLD[k] || k) : [];
  const orow = od ? `<tr><td class="st">승계 차입${picked.length ? `<small>${esc(picked.join(', '))}</small>` : ''}</td>${na('EBITDA 배수')}${td('금액', v3lF(od.amt, 'amt'))}${od.float ? oc('spread', od.spread, 'pct', '가산금리', 2) : na('가산금리')}${od.float ? na('고정금리') : oc('rate', od.rate_fix, 'pct', '고정금리', 2)}
      ${FL ? (od.float ? oc('floor', od.floor, 'pct', '금리 하한', 2) : na('금리 하한')) : ''}${td('첫해 금리', v3lF(v3lRow(L, 'old.rate')?.[1], 'pct2'))}${pik ? na('PIK 금리') : ''}${oc('mand_pct', od.mand_pct, 'pct', '연 의무 상환', 2)}${oc('term', od.term, 'num', '만기 연수', 0)}</tr>` : '';
  const sumA = L.su?.sources?.debt, sumX = L.su?.lev_x; // 합계는 엔진 값(신규 차입, 신규 차입 ÷ 진입 기준 EBITDA)
  const tt = ks.length ? `<h3 class="v3-h3">${v3lTip(L, '차입 구성', 'tranches')}</h3><div class="mk-scroll"><table class="mk-tbl v3-t v3l-tt${FL ? ' w10' : ''}"><thead><tr><th class="st">트랜치</th><th>EBITDA 배수</th><th>금액</th><th>가산금리</th><th>고정금리</th>${FL ? '<th>금리 하한</th>' : ''}<th>첫해 금리</th>${pik ? '<th>PIK 금리</th>' : ''}<th>연 의무 상환</th><th>만기 연수</th></tr></thead>
    <tbody>${rows}<tr class="sum"><td class="st">${od ? '신규 합계' : '합계'}</td>${td('EBITDA 배수', v3Ok(sumX) ? v3Num(sumX, 2) : '')}${td('금액', v3Ok(sumA) ? v3Num(sumA) : '')}<td></td><td></td>${FL ? '<td></td>' : ''}<td></td>${pik ? '<td></td>' : ''}<td></td><td></td></tr>${orow}</tbody></table></div>` : '';
  return v3Sec('거래 가정', L.preset === 'modellers' ? '<span class="meta">원형 재현</span>' : '', `<div class="v3-fs">${fs}</div>${tt}${v3lWhyList(x, L)}`, 'v3l-deal');
}

// ===== 진입과 조달 =====
function v3lEntry(x, L) {
  const e = L.entry || {}, I = L.input || {}, su = L.su || {}, u = su.uses || {}, s = su.sources || {}, stake = v3Ok(e.stake) ? e.stake : 1;
  const px = I.entry_mode !== 'equity' && v3Ok(I.price), ltm = I.entry_basis === 'ltm', asm = !v3lZero(s.assumed);
  const nd0 = v3lOne(L, 'close.nd_fy0'), ndg = v3lOne(L, 'close.nd_gap'), gapOn = !!I.close_gap && v3Ok(nd0) && v3Ok(ndg) && Math.abs(ndg) > 1e-9; // 종결일까지 순차입금이 달라졌을 때만
  const en = v3lCalc([px ? ['기준 주가', v3Won(I.price)] : null, px ? ['인수 프리미엄', v3Pct(e.premium, 1), '', '+'] : null, px ? ['인수 주가', v3Won(e.price_ps), 'sum', '='] : null,
    px && v3Ok(I.shares) ? ['주식 수', `${v3Num(I.shares)}주`, '', '×'] : null, ['지분가치', v3Eok(e.eq_value), 'sum', px ? '=' : '', '지분 100%'],
    ['순차입금', v3Eok(e.net_debt), '', '+', gapOn ? '종결일' : ''], ['기업가치', v3Eok(e.ev), 'sum', '='],
    ltm ? ['최근 12개월 EBITDA', v3Eok(e.ebitda), '', '÷', I.ltm?.end || ''] : ['기준 연도 EBITDA', v3Eok(e.ebitda), '', '÷', L.base_year ? String(L.base_year) : ''],
    ['진입 EV/EBITDA', v3X(e.mult), 'sum', '='], v3Ok(e.pe) ? ['진입 P/E', v3X(e.pe)] : null,
    ltm && v3Ok(e.ebitda_fy0) ? ['직전 결산 EBITDA', v3Eok(e.ebitda_fy0), '', '', L.base_year ? String(L.base_year) : ''] : null]);
  const cg = gapOn ? `<h3 class="v3-h3">종결일 순차입금</h3>${v3lCalc([[v3lNm(L, 'close.nd_fy0'), v3Eok(nd0), '', '', I.close_gap.fy_end || ''], [v3lNm(L, 'close.nd_gap'), v3Eok(ndg), '', '−'], ['종결일 순차입금', v3Eok(e.net_debt), 'sum', '=', I.entry_date || '']])}` : '';
  const uses = v3lCalc([['인수 대금', v3Eok(u.purchase), '', '', stake < 1 ? `지분 ${v3Pct(stake, 1)}` : ''], v3lZero(u.refi) ? null : ['기존 차입 상환', v3Eok(u.refi), '', '+'],
    ['금융 수수료', v3Eok(u.fin_fee), '', '+'], ['거래 수수료', v3Eok(u.tx_fee), '', '+'], ['총 사용', v3Eok(u.total), 'sum', '=']]);
  const src = v3lCalc([['신규 차입', v3Eok(s.debt)], v3lZero(s.excess_cash) ? null : ['초과 현금', v3Eok(s.excess_cash), '', '+'], ['사모펀드 출자', v3Eok(s.equity), '', '+'],
    ['총 조달', v3Eok(s.total), 'sum', '='], asm ? ['승계 차입', v3Eok(s.assumed), '', '', '총 조달 밖'] : null,
    ['차입 비중', v3Pct(su.lev_pct, 1), '', '', asm ? '신규와 승계' : ''], v3Ok(su.equity_pct) ? ['출자 비중', v3Pct(su.equity_pct, 1)] : null]);
  return v3Sec('진입과 조달', '', `<div class="v3l-two"><div><h3 class="v3-h3">진입 가격</h3>${en}${cg}</div><div><h3 class="v3-h3">사용</h3>${uses}<h3 class="v3-h3">조달</h3>${src}</div></div>`);
}

// ===== 인수가격 배분(PPA. py.lbo.ppa가 있는 사례만) =====
function v3lPpa(x, L) {
  const P = L.ppa;
  if (!P || !Array.isArray(P.items) || !P.items.length) return '';
  const dis = !x.live, ok = Array.isArray(x.c.input?.lbo?.ppa?.items), okP = ok || v3lPathOk(x.c, 'ppa');
  const cell = (n, f, base, fmt, lab, nm, d) => (ok ? `<td class="in">${v3In(x, `i.lbo.ppa.items.${n}.${f}`, base, { fmt, cell: true, lab: `${nm} ${lab}`, dis, d })}</td>` : `<td>${fmt === 'num' ? (v3Ok(base) ? v3Num(base, Number.isInteger(+base) ? 0 : 1) : '-') : v3lF(base, fmt)}</td>`);
  const rows = P.items.map((it, n) => `<tr><td class="st">${esc(it.name || `무형자산 ${n + 1}`)}</td>${it.amount != null ? cell(n, 'amount', it.amount, 'amt', '공정가치 증가분', it.name) : '<td>-</td>'}${it.pct != null ? cell(n, 'pct', it.pct, 'pct', '초과 인수가 대비', it.name) : '<td>-</td>'}
    ${cell(n, 'life', it.life, 'num', '내용연수', it.name, 1)}<td>${v3lF(it.value, 'amt')}</td></tr>`).join('');
  const tbl = `<div class="mk-scroll"><table class="mk-tbl v3-t v3l-pt"><thead><tr><th class="st">항목</th><th>공정가치 증가분</th><th>초과 인수가 대비</th><th title="0이면 상각하지 않는 비한정 자산">내용연수</th><th>배분 금액</th></tr></thead>
    <tbody>${rows}<tr class="sum"><td class="st">합계</td><td></td><td></td><td></td><td>${v3lF(P.total, 'amt')}</td></tr></tbody></table></div>`;
  const calc = v3lCalc([[v3lNm(L, 'ppa.excess').replace(/\(.*\)$/, ''), v3Eok(P.excess), '', '', 'PPA 전 영업권'], [v3lNm(L, 'ppa.total'), v3Eok(P.total), '', '−'],
    v3lZero(P.dtl0) ? null : [v3lNm(L, 'ppa.dtl0').replace(/\(.*\)$/, ''), v3Eok(P.dtl0), '', '+', v3Ok(P.dtl_rate) ? `세율 ${v3Pct(P.dtl_rate, 1)}` : ''], v3Ok(L.goodwill) ? ['영업권', v3Eok(L.goodwill), 'sum', '='] : null]);
  const opt = `<div class="v3-fs v3l-pf">${v3F('세무상 상각', okP ? v3lSw(x, 'ppa.tax_deductible', [[false, '손금 불인정'], [true, '손금 인정']], !!P.tax_ded) : `<span class="v3-iw nu"><input type="text" value="${P.tax_ded ? '손금 인정' : '손금 불인정'}" disabled></span>`)}
    ${P.tax_ded ? '' : okP ? v3F('이연법인세 세율', v3In(x, 'i.lbo.ppa.dtl_rate', P.dtl_rate, { fmt: 'pct', lab: '이연법인세 세율', dis })) : v3lRo('이연법인세 세율', v3Pct(P.dtl_rate, 1))}</div>`;
  return v3Sec('인수가격 배분', v3lUnit(L), `<h3 class="v3-h3">식별 무형자산</h3>${tbl}<div class="v3l-two v3l-p2"><div>${opt}</div><div><h3 class="v3-h3">영업권</h3>${calc}</div></div>`, 'v3l-ppa');
}

// ===== 연도별 표 =====
function v3lYear(x, L) {
  const k = ['debt', 'pl', 'bs'].includes(x.st.lyt) ? x.st.lyt : 'debt';
  const bs = L.input?.old ? V3L_BS.map(([nm, rows]) => [nm, rows.map((r) => (r[0] === 'debt' ? ['debt', '', r[2], r[3]] : r))]) : V3L_BS;
  const g = k === 'pl' ? V3L_PL : k === 'bs' ? bs : v3lDebtGroups(L);
  return v3Sec('연도별 추정', v3lUnit(L), `<div class="v3l-seg">${v3Seg('lyt', [['debt', '차입 상환'], ['pl', '손익과 현금'], ['bs', '재무상태표']], k)}</div>${v3lYT(L, g)}`, 'v3l-year');
}

// ===== 신용 지표 =====
function v3lCredit(x, L) {
  const cr = L.credit || {}, keys = Object.keys(cr).filter((k) => Array.isArray(cr[k]));
  const nd = v3lRow(L, 'net_debt'), de = cr.debt_ebitda, n = Math.max(nd?.length || 0, de?.length || 0), ys = v3lYs(L, n);
  const chart = n && (Array.isArray(nd) || Array.isArray(de)) ? `${v3cLegend([Array.isArray(nd) ? { label: '순차입금', cls: 's2' } : null, Array.isArray(de) ? { label: v3lNm(L, 'cr.debt_ebitda'), cls: 's1', kind: 'line' } : null])}
    ${v3cBars({ w: v3Wd(x), h: 240, labels: ys, bars: Array.isArray(nd) ? [{ name: '순차입금', values: nd, cls: 's2' }] : [], lines: Array.isArray(de) ? [{ name: v3lNm(L, 'cr.debt_ebitda'), values: de, cls: 's1' }] : [], fmt: (v) => v3Num(v), lineFmt: (v) => `${v3Num(v, 1)}배`, title: '순차입금과 총차입 배수' })}` : '';
  const I = L.input || {}, low = v3Ok(I.cov_warn) ? I.cov_warn : null, okr = Array.isArray(I.cov_ok) && I.cov_ok.every(v3Ok) ? I.cov_ok : null; // 이자보상배율 경고선과 안정 구간은 엔진 값(py.lbo.input)
  const covTip = [low != null ? `${v3Num(low, 1)}배 미만 주의` : '', okr ? `${v3Num(okr[0], 1)}～${v3Num(okr[1], 1)}배 안정 구간` : ''].filter(Boolean).join(', ');
  const tbl = keys.length ? `<div class="mk-scroll"><table class="mk-tbl v3-t v3l-yt"><thead><tr><th class="st">지표</th>${ys.map((y) => `<th>${y}</th>`).join('')}</tr></thead>
    <tbody>${keys.map((k) => `<tr><td class="st"${/_int$/.test(k) && covTip ? ` title="${esc(covTip)}"` : ''}>${esc(v3lNm(L, `cr.${k}`))}</td>${ys.map((_, j) => { const v = cr[k][j]; return `<td class="${/_int$/.test(k) && low != null && v3Ok(v) && v < low ? 'v3l-bad' : ''}">${v3Ok(v) ? v3Num(v, 2) : '-'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="empty">신용 지표가 없습니다.</div>';
  return v3Sec('신용 지표', `<span class="meta">단위 배${chart && Array.isArray(nd) ? ', 순차입금 억원' : ''}</span>`, `${chart ? `<div class="v3l-ch">${chart}</div>` : ''}${tbl}`);
}

// ===== 민감도 =====
/* 세로 회수 배수, 가로 인수 프리미엄. 가운데 칸이 지금 가정이고 그보다 높으면 빨강, 낮으면 파랑 */
function v3lSensT(s, key, cf) {
  const z = s?.[key], xs = s?.premium, ys = s?.exit_mult;
  if (!Array.isArray(z) || !Array.isArray(xs) || !Array.isArray(ys)) return '<div class="empty">표를 만들 값이 없습니다.</div>';
  const ci = Math.floor(ys.length / 2), cj = Math.floor(xs.length / 2), b = z[ci]?.[cj], eps = 1e-9;
  const pd = xs.every((v) => !v3Ok(v) || Math.abs(v * 100 - Math.round(v * 100)) < 1e-6) ? 0 : 1;
  const cell = (v, i, j) => `<td class="${[v3Ok(v) && v3Ok(b) ? (v > b + eps ? 'up' : v < b - eps ? 'dn' : '') : '', i === ci && j === cj ? 'mid' : ''].join(' ').trim()}">${v3Ok(v) ? cf(v) : '-'}</td>`;
  return `<div class="mk-scroll"><table class="mk-tbl v3-t v3l-st"><thead><tr><th class="st" rowspan="2">회수 배수</th><th class="ax" colspan="${xs.length}">인수 프리미엄</th></tr>
    <tr>${xs.map((v, j) => `<th class="${j === cj ? 'c' : ''}">${v3Pct(v, pd)}</th>`).join('')}</tr></thead>
    <tbody>${ys.map((m, i) => `<tr><td class="st${i === ci ? ' c' : ''}">${v3X(m, 2)}</td>${(z[i] || []).map((v, j) => cell(v, i, j)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function v3lSens(x, L) {
  const s = L.sens;
  if (!s) return '';
  return v3Sec('민감도', '', `<div class="v3l-sg"><div><h3 class="v3-h3">IRR</h3>${v3lSensT(s, 'irr', (v) => v3Pct(v, 1))}</div><div><h3 class="v3-h3">MoM<small>단위 배</small></h3>${v3lSensT(s, 'mom', (v) => v3Num(v, 2))}</div></div>`);
}

// ===== 참여자별 수익(py.lbo.party가 있는 사례만) =====
/* 묶음(선순위, 메자닌, 재무적 투자자) 줄 아래에 그 묶음의 트랜치. 현금흐름 열은 returns.cash_flows와 같은 날짜 */
function v3lParty(x, L) {
  const P = L.party;
  if (!P || !P.groups) return '';
  const T = P.tranches || {}, cfs = L.returns?.cash_flows || [], n = Math.max(0, ...Object.values(P.groups).map((g) => (g?.cf || []).length)), ys = v3lYs(L, n);
  const tr = (nm, o, cls) => `<tr class="${cls}"><td class="st">${esc(nm)}</td><td>${v3Pct(o.irr, 1)}</td><td>${v3X(o.mom)}</td>${ys.map((_, j) => `<td>${v3lF(o.cf?.[j], 'amt')}</td>`).join('')}</tr>`;
  const seen = new Set();
  let body = '';
  for (const g of [...Object.keys(V3L_PTY).filter((k) => P.groups[k]), ...Object.keys(P.groups).filter((k) => !V3L_PTY[k])]) {
    const G = P.groups[g];
    if (!G) continue;
    body += tr(V3L_PTY[g] || g, G, 'sum');
    for (const k of G.keys || []) { if (!T[k] || v3lZero(T[k].cf)) continue; seen.add(k); body += tr(v3lTrNm(L, k), T[k], 'sub'); }
  }
  for (const k of Object.keys(T)) if (!seen.has(k) && !v3lZero(T[k].cf)) body += tr(v3lTrNm(L, k), T[k], '');
  const opt = `<div class="v3-opt v3l-po"><div><span>금융 수수료</span>${v3lSw(x, 'party_fee_to_lender', [[true, '대주 수입에 포함'], [false, '제외']], !!P.fee_to_lender)}</div></div>`;
  return v3Sec('참여자별 수익', v3lUnit(L), `${opt}<div class="mk-scroll" data-v3-keep="l-pty"><table class="mk-tbl v3-t v3l-yt v3l-pty"><thead><tr><th class="st">참여자</th><th>IRR</th><th>MoM</th>${ys.map((y, j) => `<th${cfs[j]?.[0] ? ` title="${esc(cfs[j][0])}"` : ''}>${y}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`, 'v3l-party');
}

// ===== 조달 시나리오 =====
function v3lScen(x, L) {
  const fs = (L.fin_scen || []).filter(Boolean);
  if (!fs.length) return '';
  const eq0 = L.su?.sources?.equity, ks = v3lTrs(L), peak = fs.some((r) => v3Ok(r.rcf_peak) && r.rcf_peak > 1e-9);
  const cur = (r) => v3Ok(eq0) && v3Ok(r.equity) && Math.abs(r.equity - eq0) <= 1e-6 * Math.max(1, Math.abs(eq0));
  const tipOf = (r) => ks.map((k) => `${v3lTrNm(L, k)} ${v3X(r.mult?.[k], 2)}`).join(', '), tagOf = (r) => (cur(r) ? '지금 구조' : v3Ok(r.lev_x) && r.lev_x === 0 ? '무차입' : '');
  if (x.w < 620) { // 좁은 폭: 시나리오를 열로 세워 가로로 밀지 않고 견줌
    const M = [['총차입 배수', (r) => v3Num(r.lev_x, 2), '배'], ['신규 차입', (r) => v3Num(r.debt)], ['사모펀드 출자', (r) => v3Num(r.equity)], ['차입 비중', (r) => v3Pct(r.lev_pct, 1), '', (r) => (r.warn ? 'v3l-bad' : '')],
      ['회수 순차입금', (r) => v3Num(r.exit_net_debt)], ['회수 지분가치', (r) => v3Num(r.exit_eq)], ['IRR', (r) => v3Pct(r.irr, 1)], ['MoM', (r) => (v3Ok(r.mom) ? v3Num(r.mom, 2) : '-'), '배'], peak ? ['리볼버 최대 잔액', (r) => v3Num(r.rcf_peak)] : null].filter(Boolean);
    const head = `<tr><th class="st">시나리오</th>${fs.map((r) => `<th class="${cur(r) ? 'on' : ''}" title="${esc(tipOf(r))}">${esc(r.no ?? '')}${tagOf(r) ? `<small>${tagOf(r).replace(' 구조', '')}</small>` : ''}</th>`).join('')}</tr>`;
    const body = M.map(([nm, fn, u, cls]) => `<tr><td class="st">${nm}${u ? `<small>${u}</small>` : ''}</td>${fs.map((r) => `<td class="${[cur(r) ? 'on' : '', cls ? cls(r) : ''].join(' ').trim()}">${fn(r)}</td>`).join('')}</tr>`).join('');
    return v3Sec('조달 시나리오', v3lUnit(L), `<div class="mk-scroll"><table class="mk-tbl v3-t v3l-fsn"><thead>${head}</thead><tbody>${body}</tbody></table></div>`);
  }
  const rows = fs.map((r) => {
    const on = cur(r), tag = tagOf(r);
    return `<tr class="${on ? 'on' : ''}"><td class="st">시나리오 ${esc(r.no ?? '')}${tag ? `<small>${tag}</small>` : ''}</td><td title="${esc(tipOf(r))}">${v3X(r.lev_x, 2)}</td><td>${v3Num(r.debt)}</td><td>${v3Num(r.equity)}</td>
      <td class="${r.warn ? 'v3l-bad' : ''}">${v3Pct(r.lev_pct, 1)}</td><td>${v3Num(r.exit_net_debt)}</td><td>${v3Num(r.exit_eq)}</td><td>${v3Pct(r.irr, 1)}</td><td>${v3X(r.mom, 2)}</td>${peak ? `<td>${v3Num(r.rcf_peak)}</td>` : ''}</tr>`;
  }).join('');
  return v3Sec('조달 시나리오', v3lUnit(L), `<div class="mk-scroll"><table class="mk-tbl v3-t v3l-fs"><thead><tr><th class="st">구분</th><th>총차입 배수</th><th>신규 차입</th><th>사모펀드 출자</th><th${v3Ok(L.input?.lev_warn) ? ` title="${esc(v3Pct(L.input.lev_warn, 0))} 초과 주의"` : ''}>차입 비중</th><th>회수 순차입금</th><th>회수 지분가치</th><th>IRR</th><th>MoM</th>${peak ? '<th>리볼버 최대 잔액</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>`);
}

// ===== 조정 재무상태표 =====
function v3lAdj(x, L) {
  const a = L.adj_bs || {}, ks = [...V3L_ADJ.filter((k) => k in a), ...Object.keys(a).filter((k) => !V3L_ADJ.includes(k))];
  const rows = ks.filter((k) => Array.isArray(a[k]) && (['ta', 'tl', 'equity'].includes(k) || !v3lZero(a[k]))).map((k) => {
    const nm = V3L_ADJ_NM[k] || v3lNm(L, `adj.${k}`).replace(/^조정 재무상태표\s*/, '');
    return `<tr class="${['ta', 'tl', 'equity'].includes(k) ? 'sum' : ''}"><td class="st">${esc(nm)}</td>${[0, 1, 2].map((j) => `<td>${v3Num(a[k][j])}</td>`).join('')}</tr>`;
  }).join('');
  if (!rows) return '';
  return v3Sec('조정 재무상태표', v3lUnit(L), `<div class="mk-scroll"><table class="mk-tbl v3-t v3l-adj"><thead><tr><th class="st">항목</th><th>인수 전</th><th>조정</th><th>인수 직후</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

// ===== LBO 점검 =====
function v3lChk(x, L) {
  const ord = ['err', 'warn', 'info'], ck = (L.checks || []).filter((k) => k && k.text).map((k, i) => ({ k, i })).sort((a, b) => (ord.indexOf(a.k.level) + 1 || 9) - (ord.indexOf(b.k.level) + 1 || 9) || a.i - b.i).map((y) => y.k);
  const list = ck.length ? `<ul class="v3l-cl">${ck.map((k) => { const [nm, cls] = V3L_LV[k.level] || V3L_LV.info; return `<li><span class="chip v3l-lv ${cls}">${nm}</span><p>${esc(k.text)}</p></li>`; }).join('')}</ul>` : '<div class="empty">점검할 것이 없습니다.</div>';
  return v3Sec('LBO 점검', ck.length ? `<span class="meta">${ck.length}건</span>` : '', list);
}

function v3lRep(x) {
  const L = x.res.lbo;
  if (!L || !L.rows) return v3Sec('LBO', '', '<div class="empty">LBO 결과가 없습니다.</div>');
  return v3lTop(x, L) + v3lDeal(x, L) + v3lEntry(x, L) + v3lPpa(x, L) + v3lYear(x, L) + v3lCredit(x, L) + v3lParty(x, L) + v3lSens(x, L) + v3lScen(x, L) + v3lAdj(x, L) + v3lChk(x, L);
}
v3Rep('lbo', 'LBO', v3lRep, (x) => !!x.sw.lbo && !!x.res.lbo);

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
  g: { cpi10: '소비자물가 10년 평균', rf: '무위험이자율', gdp_nominal: '명목 GDP 성장률 10년 평균', avg: '물가, 명목 GDP, 업계 성숙기 평균', peer_mature: '업계 성숙기 성장률', manual: '직접 입력' },
  tv: { gordon: '영구성장', exit_mult: '배수', avg: '영구성장과 배수법 평균', liquidation: '청산가치', finite: '유한 기간' },
  discount: { end: '기말', mid: '기중' },
  share_basis: { diluted: '희석 주식수', basic: '유통주식수', issued: '발행주식 총수' },
  fcff_tax: { is_eff: '그해 손익 유효세율', marginal: '한계세율', is_total: '손익 법인세 전체' },
  ty_tax: { statutory: 'EBIT 기준 법정 유효세율', eff: '유효세율', marginal: '한계세율' },
  /* 2026-11-17 엔진 변경으로 늘어난 스위치. 점검 탭 「바꾼 입력」과 아래 설정 표가 씀 */
  int_rate: { last: '직전 결산 실효이자율', avg4: '4년 평균 실효이자율', kd: '직전 결산 실효이자율(Kd 연결 전)', manual: '직전 결산 실효이자율(값은 차입 이자율 가정 칸)' },
  scn_rule: { research: '리서치 값 우선', v2: '규칙만', modellers: '원형(The Modellers)' },
  scn_base_rule: { avg4: '최근 4년 평균', cagr5: '최근 5년 연평균(CAGR)' },
  ucost_interp: { linear: '직선', cagr: '정률' },
  hc_basis: { eop: '기말', avg: '기초와 기말 평균' },
  hc_rnd: { exclude: '빼기', include: '넣기' },
  amort_mode: { rate: '상각률', life: '내용연수 정액' },
  reinv_mode: { schedule: '스케줄', sales_pct: '매출 대비', ic_turnover: '투하자본회전율', s2c: '매출 증가분 기준' },
  st_fin_fwd: { hold: '잔액 유지', release: '명시 기간에 나눠 현금화' },
  taxpay_class: { nonop: '운전자본에서 뺌', nwc: '운전자본에 둠' },
  loan_class: { nwc: '운전자본에 둠', nonop: '비영업자산으로 옮김' },
  beta_index: { listing: '상장 시장 지수', kospi: 'KOSPI' },
  beta_u_tax: { input: '입력 세율', own: '회사별 구간 세율', target: '대상 한계세율' },
  mcap_basis: { spot: '기준일', avg1y: '1년 평균', avg2y: '2년 평균' },
  ke_model: { capm: 'CAPM', bond_rp: '타인자본비용 + 가산', ff3: '3요인(CAPM + SMB, HML 가산)', firm_prem: 'CAPM + 기업 고유 프리미엄 + ESG 가산' },
  fade_growth: { linear: '영구성장률까지 직선', avg_const: '평균으로 고정', manual: '직접 입력' },
  eps_basis: { avg: '기초, 기말 평균', spot: '기준일' },
  rel_scen_src: { external: '외부 값', model: '모델 연동' },
  assoc_value: { book: '장부가', market: '시가' },
  alt_models: { all: '모두', fcfe: 'FCFE', ddm: '배당할인모형', rim: '잔여이익모형', apv: 'APV' },
  fcfe_debt: { schedule: '차입 스케줄', target_ratio: '목표 부채 비중', current_ed: '지금 부채 비중' },
  ddm_stage: { two: '2단계', gordon: '1단계', three: '3단계', h: 'H 모형' },
  rim_tv: { persist: '지속계수', gordon: '영구성장', pbr: '목표 PBR', blend: '혼합' },
  /* 2026-11-17 오후 엔진 변경 */
  sotp: { off: '끔', show: '참고로만 표시', target: '목표주가에 씀' },
  bridge_basis: { latest: '재무상태표 기준일 잔액', fy0: '직전 결산 말 잔액', avg2: '직전 두 결산 말 평균' },
  resid_cost: { none: '없음', etc: '기타 잔여 원가율' },
  freight_class: { sales: '매출 비례', other: '기타관리비(물가 연동)' },
  xl_calc: { auto: '자동', auto_no_table: '데이터 표 제외 자동', manual: '수동' },
};
function v3Info(c) {
  const ov = (c && v3S.st[c.id]?.ov) || {}, sw = (k) => (ov[`sw.${k}`] ? ov[`sw.${k}`].v : c?.switches?.[k]);
  const nm = (k) => { const v = sw(k); return v == null ? null : V3I_SW[k]?.[v] || String(v); };
  const t = c?.target || {}, tl = c?.timeline || {}, mk = c?.input?.market || {}, rb = c?.input?.revbuild || {}, pct = (v, d = 2) => (v3Ok(v) ? v3Pct(v, d) : null);
  const br = (mk.tax?.brackets || []).map(([lim, r], i, a) => `${lim == null ? `${v3Num((a[i - 1]?.[0] || 0) / 1e8)}억 초과` : `${v3Num(lim / 1e8)}억 이하`} ${v3Pct(r, 0)}`).join(', ');
  const w = sw('weights'), ws = w ? V3_SCEN.map((s) => `${s} ${v3Pct(w[s], 1)}`).join(', ') : null;
  const pre = c?.presets?.[c.preset]?.name || c?.preset, TY = { general: '일반', financial: '금융', loss: '적자', holding: '지주', private: '비상장' };
  const set = c ? [['항목', '지금 값'], ['프리셋', pre], ['회사 유형', TY[sw('company_type')] || sw('company_type')], ['LBO', sw('lbo') ? '켬' : null],
    ['평가 기준일', t.val_date], ['재무상태표 기준일', t.bs_date], ['직전 결산일', t.fy0_end],
    ['과거 연도', tl.hist?.length ? `${tl.hist[0]}～${tl.hist[tl.hist.length - 1]}년` : null],
    ['명시 기간', sw('fc_years') != null ? `${sw('fc_years')}년` : null], ['전환 기간', sw('fade_years') != null ? `${sw('fade_years')}년` : null],
    ['매출 줄', rb.lines?.length ? `${rb.lines.length}개` : null], ['첫해 추정', nm('fy1_mode')],
    ['매출원가 방식', nm('cogs_mode')], ['인건비 방식', nm('labor_mode')], ['유형자산 방식', nm('ppe_mode')], ['운전자본 기준', nm('nwc_avg')], ['차입 계획', nm('debt_plan')],
    ['법인세 방식', nm('tax_mode')], ['FCFF 세율', nm('fcff_tax')], ['종료연도 세율', nm('ty_tax')],
    ['자기자본비용 모형', nm('ke_model')], ['베타 방식', nm('beta_mode')], ['베타 하한', sw('beta_floor') != null ? v3Num(sw('beta_floor'), 2) : '없음'], ['무위험이자율', nm('rf')], ['주식위험프리미엄', nm('erp')], ['타인자본비용', nm('kd')],
    ['영구성장률 기준', nm('g')], ['종료가치 방식', nm('tv')], ['할인 시점', nm('discount')], ['주식 수 기준', nm('share_basis')], ['주주가치 다리 잔액', sw('bridge_basis') && sw('bridge_basis') !== 'latest' ? nm('bridge_basis') : null], ['사업부별 합산', sw('sotp') && sw('sotp') !== 'off' ? nm('sotp') : null],
    ['EPS 주식 수', nm('eps_basis')], ['시나리오 규칙', nm('scn_rule')], ['시나리오 가중치', ws], ['DCF 결합 비중', pct(sw('blend_w'), 0)], ['주당 가치 반올림', sw('round') != null ? `${v3Num(sw('round'))}원 단위` : null],
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
      ['머리', '회사 이름 아래에 기준일과 기본 정보(설립, 상장, 임직원, 대표이사, 본사. 마우스를 올리면 출처, 수집하지 못한 값은 확인 불가). 목표주가, DCF 가중평균(유형별 기업은 유형별 가치, 사업부별 합산을 목표주가에 쓰면 합산 가중평균), 상대가치, 현재가. 프리셋, 명시 기간, 전환 기간, 시나리오, 입력 적용 단추와 처음 값으로 단추'],
      ['가치 산정 흐름', '연도별 FCFF와 현재가치, 종료가치, 할인율, 영업가치에서 주당 내재 가치까지. 카드를 누르면 그 값을 정하는 입력 단계로 이동'],
      ['입력', 'DCF 맵 15단계. 단계마다 가정 입력 칸, 근거, 참고 차트'],
      ['연도별 상세', '과거와 추정 연도를 한 표로. 매출, 비용, 3대 재무제표, 스케줄, FCFF, 할인을 묶음별로 접고 폄'],
      ['보고서', '요약, 상세, 민감도, 시나리오, 리버스, 풋볼필드, 몬테카를로. 회사 유형이 일반이 아니면 유형별, LBO를 켠 사례는 LBO 화면이 더 붙음'],
      ['점검', '점검 결과, 파이썬 대조, 바꾼 입력, 보정 항목 편집과 일회성 항목, 더 필요한 리서치']] }],
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
      '프리셋: v3 기본, Valley 방식, The Modellers 201과 301, SK오션플랜트 IM. 고르면 그 프리셋의 스위치 묶음으로 다시 계산하고, 사례의 프리셋을 다시 고르면 처음 스위치로 돌아감. 스위치를 따로 바꾸면 「직접 바꿈」으로 보임',
      '시나리오 Bull, Base, Bear. 입력 적용이 「고른 시나리오」면 연도별 가정 칸이 고른 시나리오만, 「세 시나리오」면 세 시나리오의 그 해 값을 같은 값으로 고침. 다른 해 값과 시나리오 사이 차이는 그대로',
      '입력 탭과 연도별 상세의 연한 파란 칸. 바꾼 칸은 진한 파란 바탕이 되고, 칸을 비우면 처음 값으로 돌아감',
      '「처음 값으로」 단추는 바꾼 입력을 모두 되돌림. 점검 탭의 바꾼 입력 목록에서는 한 줄씩 되돌림',
      '입력하는 동안 화면이 바로 다시 계산함. 몬테카를로, 다른 가정 표, LBO, 유형별 가치 가운데 화면에서 다시 낼 수 없는 값은 파이썬에서만 계산해 처음 값 그대로이며 그 화면에 안내가 뜸',
      '「입력 내려받기」는 바꾼 입력을 case_v3_override.json 파일로 저장함. 05. 딜소싱 > _자동화 > 가치평가 폴더에서 python -m v3.run run <사례> --override case_v3_override.json 을 돌리면 엑셀까지 다시 만듦',
      '「엑셀 받기」는 파이썬이 만든 모델 엑셀. 화면에서 바꾼 값은 들어 있지 않음. 요약 시트에 평가 방법(DCF와 상대가치 비중), 기본 정보(설립일, 본사, 임직원 수, 대표이사, 결산월, 상장일, 홈페이지), 차트 3개가 있고 매출, 비용, 재무제표 시트 오른쪽에 과거와 추정 CAGR, 가정 시트 시나리오 표 메모 열에 가정 근거가 있음']],
    ...(set ? [['이 사례의 설정', { table: set }]] : []),
    ['매출 추정', [
      '매출 합계 = 줄별 매출의 합. 줄을 어떻게 나누고 어떤 드라이버를 쓸지는 회사마다 리서치가 정함',
      '드라이버 종류: 성장률(전년 × (1 + 성장률)), 수량 × 단가, 시장 규모 × 점유율, 단위 수 × 단위당 매출, 생산능력 × 가동률 × 단가, 수주잔고 인식, 다른 줄 대비 비율, 고정, 직접 입력',
      '성장률과 비율 가정은 시작값과 끝값(사이는 직선) 또는 연도별 값으로 줌',
      '첫해가 진행 중이면 누적 실적 + 남은 분기 추정. 남은 분기는 드라이버로 구한 연간 값 × 남은 분기 비중(직전 3년 같은 분기 비중 평균)이고, 리서치가 준 분기 값이 있으면 그 값을 씀',
      '수량 × 단가 줄은 수량, 단가와 각각의 성장률을 함께 보여 줌. 성장률 가정을 주지 않은 줄은 과거 실적 규칙(최근 4년 평균 또는 최근 5년 연평균)으로 채움',
      '과거 줄 합과 공시 매출의 차이는 「체계 차이 조정」 줄 하나로만 흡수함. 진행 연도 매출 보정을 계산에 반영하면 그 금액이 이 줄에 더해짐',
      '표 오른쪽 끝의 과거 CAGR과 추정 CAGR은 모델이 계산한 값. 화면 폭이 모자라면 오래된 과거 연도부터 접히고 「이전 연도 펴기」로 모두 봄. 매출원가, 판관비 단계 표도 같음',
      '성장률 줄의 「끝값 지정」, 「최근 5년 연평균」 같은 표시는 엔진이 적은 가정 꼴. 마우스를 올리면 출발값과 끝값, 규칙이 보임. 칸을 고치면 연도별 값으로 바뀌어 표시가 사라짐',
      '참고 데이터의 과거 성장률(산술평균, 기하평균, 로그 회귀)은 모델이 계산한 값. NM은 시작 값이 0 이하라 구할 수 없다는 뜻',
      '컨센서스 매출은 참고 줄. 합계가 컨센서스와 10% 넘게 다르면 점검에 주의로 표시']],
    ['비용', [
      '매출원가 방식: 전사 원가율, 사업부 원가율, 단위원가, 매출총이익률 단계, 성격별 구성 가운데 하나',
      '사업부 원가 자료가 있으면 사업부별 원가와 원가율의 과거 값을 함께 보여 줌. 끝값만 정한 단위원가는 직전 실적에서 끝값까지 직선 또는 정률로 이음',
      '체계 차이 매출의 원가를 기타 잔여 원가율로 두면 줄 합에 잡히지 않는 추정 매출에도 원가를 붙임(사업부 원가율, 단위원가 방식)',
      '매출원가, 판관비 단계의 「평균에 넣을 해」에서 가정별로 평균에 넣을 해를 고름. 운반비 묶음 분류는 입력을 만들 때 정해져 지금 값만 보임',
      '인원 방식이 아닌 사례는 참고 데이터에 부서별 인원 실적과 총원을 보여 줌',
      '판관비는 주석의 계정을 묶음(인건비, 주식보상비용, 감가상각비, 연구개발비, 광고판촉, 지급수수료, 운반비, 대손상각비, 기타관리비)으로 모으고 묶음마다 드라이버를 정함',
      '묶음 드라이버: 매출 비례, 물가 연동, 스케줄 연결, 특정 매출 줄 비례, 직접 입력',
      '감가상각비 묶음 = 감가상각 합계 × 판관비 몫, 연구개발비 묶음 = R&D 가운데 비용 처리분. 둘 다 유무형자산 스케줄에서 넘어옴',
      '기타관리비는 물가상승률만큼 늘어나는 고정비',
      '인건비 방식: 매출 비례 또는 인원 × 인당 인건비. 직원 수와 인건비의 범위(연결, 별도)가 다르면 인원 방식을 쓰지 않음',
      '인원 방식: 부서별 인원 합 × 인당 인건비 = 전체 인건비, 그 가운데 판관비 몫만 판관비 인건비. 변동 부서는 매출 ÷ 인당 매출, 고정 부서는 해마다 정한 인원만큼 늘림. 인당 인건비의 직원 수는 기말 또는 기초와 기말 평균, R&D 부서 인원은 합계에서 빼는 것이 기본',
      '영업이익 = 매출총이익 − 판관비. EBITDA = 영업이익 + 감가상각비 + 무형자산상각비']],
    ['재투자', [
      '유형자산 방식: 변동표, 약식(CAPEX = 매출 × 비율, 감가상각 = 기초 × 상각률), 유지 CAPEX + 확장 CAPEX',
      '사용권자산 신규는 현금이 나가지 않는 취득이며 리스부채와 함께 늘어남',
      '무형자산: 기타 무형 취득 = 매출 × 비율, R&D 자산화분 = 총 연구개발비 × 자산화 비중, 계약관계 같은 일회성 취득은 따로 입력. 상각 = 기초 × 상각률, 계약관계는 정한 연수로 정액',
      '운전자본: 매출채권 = 매출 × 회전일수 ÷ 365, 재고자산과 매입채무 = 매출원가 × 회전일수 ÷ 365, 기타 영업 유동자산과 부채 = 매출 × 비율',
      '유지 CAPEX 기준은 매출 또는 기초 유형자산. 자산별 변동표 방식에서는 기존 자산 상각(정액 또는 해마다 줄임), 신규 자산 상각 시작(다음 해, 취득한 해, 취득한 해 반년), 내용연수(자산별 범위의 하한, 평균, 상한)를 고름. 계약관계 같은 일회성 무형자산의 상각 시작도 같은 스위치를 씀',
      '자산별 변동표 방식의 표: 묶음별 기초, 취득, 대체, 상각, 처분과 손상, 기말. 취득 비율, 건설중인자산 대체 비율과 건물 몫, 내용연수를 바꾸면 감가상각 내역(기존 자산, 연도별 취득분)이 따라 바뀜. 검증 줄은 묶음 합과 재무상태표 유형자산의 차이이며 「일치」가 정상',
      '「평균에 넣을 해」에서 체크를 끄면 그 가정의 평균에서만 그 해가 빠짐. 평균 창은 최근 평균 연수 안에서만 줄고 과거로 늘어나지 않음. 모든 평균에서 빼 둔 해도 한 가정에만 다시 넣을 수 있고, 창의 모든 해를 빼면 빼기를 무시하고 평균을 냄',
      '설비 능력 증설 물량 × 단위 투자비, 출점 수 × 점포당 투자비를 넣은 사례는 확장 CAPEX = 직접 입력 + 설비 증설 CAPEX + 출점 CAPEX',
      '자산별 변동표의 사용권자산은 새 리스는 내용연수, 기존 잔액은 남은 연수로 상각. 내용연수 이름에 마우스를 올리면 근거가 보임',
      '가정 표는 화면 폭이 모자라면 오래된 과거 연도부터 접히고 「이전 연도 펴기」로 모두 봄',
      '현금, 단기금융자산, 차입금, 리스부채는 운전자본에 넣지 않음. 당기법인세부채와 미지급배당금, 대여금과 보증금을 운전자본에 둘지는 입력을 만들 때 정해져 화면에서는 지금 분류만 보임',
      '재투자 = CAPEX − 감가상각비 + 순운전자본 증가. ROIC = 세후영업이익 ÷ 기초 투하자본']],
    ['3대 재무제표와 순환 계산', [
      '손익계산서, 재무상태표, 현금흐름표를 스케줄(운전자본, 유무형자산, 차입과 이자, 법인세, 자본)과 이어 함께 추정함',
      '재무상태표 현금 = 전년 현금 + 현금흐름표의 현금 순증감. 대차 검증(자산 − 부채 − 자본)과 현금 검증이 모든 추정 연도에서 0이어야 함',
      '이자수익과 리볼버 이자는 평균 잔액으로 계산해 이자, 순이익, 현금이 서로 물림. 변화가 없어질 때까지 반복 계산하며, 순환 스위치를 끄면 기초 잔액 기준으로 바뀜',
      '현금이 최소 현금보다 모자라면 리볼버에서 인출하고, 남으면 리볼버 잔액을 상환함',
      '차입은 기말 잔액 유지가 기본. 이자비용 = 평균 잔액 × 직전 결산 실효이자율. 트랜치별 이자율을 넣으면 그 트랜치만 그 이자율로 계산하고 나머지는 차입 이자율을 따름',
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
      '자기자본비용 = 무위험이자율 + 베타 × 주식위험프리미엄 + 추가 프리미엄. 모형은 CAPM, 타인자본비용 + 가산(세전 타인자본비용에 기본 4%p), 3요인(규모, 가치 요인 가산), 기업 고유 프리미엄(기업 고유 + ESG 가산. 규모, 개별 프리미엄은 더하지 않음) 가운데 고르고 CAPM 값은 참고로 남음',
      'KOSPI 내재 프리미엄은 지수 이익수익률에서 국고채 10년을 뺀 값. 방법별 값은 접힌 표에 있음',
      '값이 없는 선택지를 사례가 골랐으면 그 단추가 흐리게 눌려 있고 엔진이 대신 쓴 값이 단계 머리에 나옴',
      '무위험이자율은 국고채 10년 최근 3개월 평균, 주식위험프리미엄은 Damodaran 성숙 시장 프리미엄 + 한국 국가위험이 기본',
      '베타 자동 선택: 상장 2년 이상이고 자본구조가 크게 바뀌지 않았으면 회귀 베타, 아니면 비교기업 바텀업 베타',
      '회귀 표 아래 대조 줄은 주가와 지수 표로 다시 계산한 원 베타. 베타 기간과 기준 지수를 바꾸면 같이 바뀌고, 가격 표가 한 벌뿐인 옛 문서는 표 기준 값 그대로',
      '회귀 베타: 2년 주간 수익률을 상장 시장 지수(바꾸면 KOSPI)에 회귀한 값. 조정 베타 = 원 베타 × 2/3 + 1 × 1/3. 표준오차, R², 관측수를 점검에 함께 표시',
      '바텀업 베타: 비교기업 조정 베타를 회사마다 무차입화한 값의 중앙값을 목표 D/E로 재차입. 무차입 베타 = 조정 베타 ÷ (1 + (1 − 세율) × D/E). 세율은 입력 세율, 회사별 구간 세율, 대상 한계세율 가운데 고름',
      `베타 하한${sw('beta_floor') != null ? ` ${v3Num(sw('beta_floor'), 2)}` : ' 0.8'}: 계산한 베타가 이보다 낮으면 하한을 쓰고 점검에 참고로 남김`,
      '타인자본비용 단계의 「등급별 회사채 수익률 펴기」에서 대상 등급과 만기별 수익률을 봄. 최근 발행 금리에는 발행일과 금액이 붙음',
      '세전 타인자본비용 자동 순서: 회사채 시장 수익률, 최근 발행 금리, 실제 신용등급 스프레드, 실효이자율(리스를 뺀 차입금이 시가총액의 5% 이상일 때), 이자보상배율로 정한 합성 등급 스프레드',
      '자본 비중은 시가총액과 이자부부채(리스 포함)의 지금 비율. 시가총액은 기준일 값 대신 1년, 2년 일평균으로 바꿀 수 있음',
      '선택지별 WACC 표: 베타 기간과 방식, 무위험이자율, 주식위험프리미엄을 하나씩 바꿨을 때의 WACC. 굵은 칸이 지금 조합이고 칸에 마우스를 올리면 적용 베타와 계산 베타가 보임',
      '안정기 WACC: 안정기 베타를 0.8에서 1.2 사이로 잘라 다시 계산함. 전환 기간 할인율은 명시 기간 WACC에서 안정기 WACC까지 직선',
      'WACC를 직접 입력하면 계산값 대신 그 값을 쓰고 점검에 주의로 표시']],
    ['FCFF와 전환 기간', [
      'FCFF = 세후영업이익 − 재투자 + 기타 비현금 비용. 세후영업이익 = 영업이익 × (1 − FCFF 세율)',
      '주식보상비용은 실제 비용으로 보아 더하지 않음. 희석은 주식 수에서 반영',
      '전환 기간 성장률은 명시 마지막 해 값에서 영구성장률까지 직선(직접 입력으로 바꾸면 전환 기간 내내 넣은 값), 영업이익률은 마지막 해 값 유지',
      '전환 기간 재투자 = 세후영업이익 × 성장률 ÷ ROIC. ROIC는 명시 마지막 해 값에서 안정기 ROC까지 직선',
      '할인 시점 = 연차 − 직전 결산 뒤 지난 기간(기말 할인). 할인계수는 해마다 그해 할인율로 누적해 곱함',
      '첫해 FCFF는 재무상태표 기준일 뒤 남은 기간만큼만 반영함. 현금과 부채가 기준일 잔액이라 그 전 현금흐름은 이미 들어 있음']],
    ['종료가치', [
      '종료연도 매출 = 전환 마지막 해 매출 × (1 + 영구성장률). 영업이익률은 전환 마지막 해 값',
      '종료연도 재투자 = 세후영업이익 × 영구성장률 ÷ 안정기 ROC. 안정기 ROC 기본은 안정기 WACC(초과수익 없음)',
      '종료가치 = 종료연도 FCFF ÷ (안정기 WACC − 영구성장률). 마지막 해 기말 할인계수로 할인',
      '영구성장률은 소비자물가 10년 평균이 기본이며 무위험이자율보다 높으면 무위험이자율로 낮춤. 출처는 명목 GDP, 업계 성숙기 성장률, 셋의 평균으로 바꿀 수 있고 값이 없는 출처는 흐리게 보임',
      '영구성장률이 안정기 WACC 이상이면 계산하지 않고 오류로 표시',
      '종료가치 비중 = 종료가치 현재가치 ÷ 영업가치. 85%가 넘으면 점검에 참고로 표시',
      '배수 방식: 종료연도 직전 EBITDA × 배수. 평균 방식은 영구성장과 배수법 값의 평균']],
    ['주주가치 다리와 주식 수', [
      '영업가치 = 명시와 전환 기간 FCFF 현재가치 합 + 종료가치 현재가치',
      '주주가치 = 영업가치 + 현금성자산 + 비영업자산 − 이자부부채 − 비지배지분 − 우선주 − 퇴직급여 과소적립 − 기타 청구권',
      '현금성자산 = 현금 + 단기금융상품 + 유동 금융자산. 비영업자산 = 관계기업투자, 장기금융자산, 투자부동산과 사례에서 정한 항목',
      '다리의 잔액은 재무상태표 기준일 값이 기본. 직전 결산 말이나 두 결산 말 평균으로 바꾸면 비영업자산, 비주주청구권 표에 그 결산 말 잔액 열이 붙고 그 칸을 고침(기준일 잔액은 읽기만). 우선주 시가, 기타 청구권처럼 결산 말 잔액이 없는 줄은 기준을 바꿔도 그대로',
      '유통주식수 = 발행주식 − 자기주식. 희석 주식수 = 유통주식수 + 우선주 + 스톡옵션 순증(자기주식법) + 미가득 RSU + 전환 가산 주식',
      '전환사채를 주식으로 본 경우 이자부부채에서 그 잔액을 뺌',
      '희석 판정 주가를 모델 주당 가치로 바꾸면 계산된 주당 가치로 희석을 다시 판정함',
      'EPS 주식 수: 그해 기초와 기말 유통주식수 평균 또는 기준일 유통주식수. 자사주 매입 계획이 있을 때만 둘이 달라짐',
      '주당 가치 = 주주가치 ÷ 주식 수, 100원 단위 반올림. 상승여력 = 내재 가치 ÷ 현재가 − 1']],
    ['시나리오와 가중평균', [
      '세 시나리오를 늘 함께 계산함. Bull과 Bear 가정은 리서치가 근거와 함께 준 값이고, 리서치 값이 없는 가정은 규칙으로 채움(매출 성장률 ±5%p, 비용률은 최근 3년 최저와 최고)',
      '시나리오 규칙: 리서치 값 우선, 규칙만, 원형(The Modellers. Bull은 Base + 5%p, Bear는 최근 3년 최저를 5년 내내)',
      '가정 표에서 가정 이름 아래 작은 글은 매출 줄 성장률의 직전 실적과 최근 3년 최저, 최고',
      '할인율과 종료가치 가정은 시나리오와 무관하며 민감도에서 봄',
      '가중평균 = 시나리오별 주당 가치 × 가중치의 합. 가중치 합이 100%가 아니면 계산하지 않고 오류로 표시']],
    ['민감도', [
      '이중 변수 표: WACC × 영구성장률, WACC × 종료연도 영업이익률, 셋째 표는 전환 기간이 있으면 WACC × 전환 기간 성장률 가산, 없으면 WACC × 명시 기간 매출 성장률 가산(모든 매출 줄에 같은 폭). 5 × 5이며 가운데 칸이 지금 값',
      '다른 모형 민감도: 배당할인모형은 자기자본비용 × 영구성장률, 잔여이익모형은 자기자본비용 × 마지막 해 ROE',
      '변수별 영향의 WACC 줄 이름에 마우스를 올리면 영구성장률과 견준 1%p당 영향(엔진이 계산한 비율)이 보임',
      '요약의 「다른 가정」 표는 파이썬이 처음 값으로 계산한 결과. 그 아래 FCFE 순차입, 배당할인모형 단계 단추 옆 값은 지금 입력으로 다시 계산한 Base 주당 가치',
      'WACC를 움직이면 명시 기간과 안정기 WACC가 같은 폭으로 움직임',
      '토네이도: 변수 하나만 정한 폭으로 올리고 내렸을 때의 주당 가치',
      '이중 변수 표 색: 가운데 칸보다 높으면 빨강, 낮으면 파랑, 차이가 클수록 진하게. 칸에 마우스를 올리면 현재가 대비. Base 기준이며 그 밖의 입력은 지금 값']],
    ['리버스', [
      'P/FCF 방식: 지금 주가를 맞추는 주당 FCF 성장률을 거꾸로 풂. 주가 = Σ 주당 FCF ÷ (1 + 할인율)^t + n년 뒤 주당 FCF × 최종 P/FCF ÷ (1 + 할인율)^n',
      'P/E 방식: 주당 FCF 대신 EPS와 최종 P/E',
      '내재 매출 성장률 = (n년 뒤 주당 FCF ÷ (순이익률 × FCF 전환 비율) ÷ 지금 주당 매출)^(1/n) − 1',
      '모델 리버스: 모든 매출 줄 성장률에 같은 값을 더해 Base 주당 가치가 현재가와 같아지는 값을 찾음. 결과는 주가가 담은 매출 연평균 성장률과 컨센서스 대비 차이',
      '할인율 기본은 자기자본비용',
      '순이익률과 FCF 전환 비율 칸 옆 막대는 과거 값. 순이익률 = 지배주주 순이익 ÷ 매출, FCF 전환 비율 = (영업현금흐름 − 유형자산 취득) ÷ 지배주주 순이익. 점선은 과거 평균']],
    ['상대가치 결합', [
      '목표주가 = DCF 가중평균 × DCF 비중 + 상대가치 주당 가치 × (1 − DCF 비중). DCF 비중 기본 50%',
      '상대가치는 가치평가 > 상대가치 화면의 평가 배수 중앙값으로 구한 주당 가치',
      '모델 실적 기준: 평가 배수 중앙값에 모델의 시나리오별 실적을 넣은 주당 가치. Bull, Bear 기준을 모델 연동으로 바꾸면 풋볼필드의 상대가치 범위만 바뀌고 목표주가는 그대로',
      '회사 유형이 일반이 아니면 DCF 자리에 유형별 주당 가치(Base)가 들어가고 머리 이름도 「유형별 가치」로 바뀜. 그 유형에 맞지 않는 상대가치 배수(적자 기업의 PER 등)는 결합에서 빼고 DCF 비중을 100%로 둠',
      '점검에 오류가 있으면 목표주가 옆에 「점검 오류」가 붙음']],
    ['사업부별 합산', [
      '사업부 입력이 있는 사례에서만 상대가치 결합 단계에 카드가 보임. 사업부 가치(배수법 또는 사업부 DCF)와 보유 자산을 더하고 본사 비용을 뺀 뒤 전사 DCF와 같은 다리를 더함',
      '「참고로만 표시」면 전사 DCF와 견주기만 하고, 「목표주가에 씀」이면 결합의 DCF 자리에 합산 가중평균이 들어감. 이때 시나리오 주당 가치, 가중평균, 민감도가 합산 값이고 그 화면 머리에 「사업부별 합산 기준」이 붙음. 풋볼필드의 DCF 줄과 요약 가치 다리 그림은 전사 DCF 값',
      '보고서 상세 화면 아래 표는 사업부, 보유 자산, 본사 비용을 더한 주당 가치와 전사 DCF 대비 차이. 줄 아래 작은 글은 고른 시나리오의 계산 내용',
      '연도별 상세의 사업부별 합산 묶음은 사업부 가정과 계산 줄, 표 아래 계산표는 사업부와 보유 자산 가치의 합']],
    ['유형별', [
      '회사 유형이 금융, 적자, 지주, 비상장이면 보고서에 유형별 화면이 생김. 맨 위는 그 유형 방법으로 낸 주당 가치와 DCF Base의 비교',
      '금융: 장부가와 ROE 경로로 초과이익모형(RIM)이나 배당할인모형(DDM)을 계산. 연결 FCFF는 쓰지 않음',
      '적자: 영업이익률이 목표 이익률로 가는 경로로 DCF를 계산하고, 부도 확률만큼 청산가치를 가중함. VC 방식 값이 있으면 함께 보임',
      '지주: 자회사 지분가치와 자체 사업가치, 순차입금을 더한 NAV에 지주사 할인을 적용. 할인 범위는 상장 자회사, 자회사 전체, NAV 전체 가운데 고름',
      '비상장: 시장 베타를 시장 상관계수(ρ)로 나눈 총베타로 할인하고, 비유동성 할인과 핵심 인력 할인, 경영권 프리미엄을 차례로 반영. 상증법 평가액과 견줘 70%에서 130% 안인지 표시',
      '금융사 전환 기간을 둔 사례는 명시 기간 뒤 ROE, 배당성향, 자기자본비용이 안정기 값으로 가는 해를 따로 보여 줌. 종료가치 혼합은 지속계수, 영구성장, 목표 PBR 종료가치의 가중합',
      '적자 기업의 재투자 경로는 엔진에 넘긴 투하자본과 회전율. 시나리오마다 목표 이익률이 다르면 시나리오별 가치를 따로 보여 주며 엔진 본 계산은 Base 목표 하나를 씀',
      '지주사 자회사 가운데 DART 타법인 출자 현황으로 채운 줄은 「자동 초안」으로 표시. 과열 기준(PER, PBR)을 넘는 자회사는 표 아래에 따로 표시',
      '전환 기간, 혼합 가중치, 재투자 방식, 과열 기준은 사례 입력에서 정해져 화면에서는 읽기만 함. 연도 열이 많은 표는 화면 폭에 맞춰 여러 표로 나뉨',
      '화면에 보이는 재료로 다시 낼 수 있는 값(할인율, 단계별 할인, NAV 합 등)은 입력하면 바로 바뀌고, 그 밖의 값은 파이썬에서 다시 계산해야 바뀜. 결합 목표주가에 쓰이는 유형별 가치는 파이썬 값']],
    ['LBO', [
      'LBO를 켠 사례에서만 보임. 진입 가격, 조달과 사용, 트랜치별 차입 구성, 연도별 차입 상환과 현금 스윕, 신용 지표, 회수 가치, IRR과 MoM, 수익 분해, 민감도, 조달 시나리오 1에서 5, 조정 재무상태표, LBO 점검',
      '영업 가정(매출, 영업이익, 감가상각, CAPEX, 운전자본, 세율)은 엔진 Base 값을 씀. 법인세는 차입 구조에 맞춰 따로 계산',
      '이자는 평균 잔액 기준이라 이자, 현금, 상환이 서로 물려 반복 계산함',
      'IRR = 출자일에서 회수일까지 출자와 회수 지분가치의 내부수익률. MoM = 회수 지분가치 ÷ 출자',
      '민감도는 인수 프리미엄과 회수 배수를 움직인 IRR, MoM 표. 가운데 칸이 지금 가정',
      '최근 12개월 진입, 기존 차입 승계, 금리 하한, 임의 상환 비율, 인수가격 배분, 참여자별 수익은 그 선택지를 켠 사례에서만 보임',
      '인수가격 배분: 초과 인수가에서 식별 무형자산을 빼고 이연법인세부채를 더한 값이 영업권. 내용연수 0은 상각하지 않는 자산',
      '참여자별 수익: 선순위, 메자닌, 재무적 투자자 묶음과 트랜치별 IRR, MoM. 꺼진 사례는 거래 가정의 「참여자별 수익」을 「계산」으로 바꿔 입력을 내려받아 파이썬에서 다시 계산',
      '신용 지표의 이자보상배율 경고선과 안정 구간, 조달 시나리오의 차입 비중 주의선은 사례 입력 값. 줄 이름과 열 머리에 마우스를 올리면 보임',
      '「가정 근거 펴기」에서 거래 가정의 근거와 계산 방식을 봄. 밑줄 친 칸 이름에 마우스를 올려도 같은 글이 보임',
      '거래 종결일이 결산일과 다르고 종결일 간격을 반영한 사례: 첫 추정 연도는 종결일 뒤 기간만 반영해 연도 머리에 그 기간이 붙고, 보유 기간은 소수로 표시. 진입 표에 결산 순차입금과 종결일까지 달라진 금액이 나옴',
      '파이썬에서만 계산함. 거래 가정 칸을 바꾸면 입력 내려받기 파일에 실리고, 파이썬을 다시 돌려야 결과가 바뀜']],
    ['몬테카를로', [
      '매출 줄별 시작 성장률과 종료연도 이익률은 Bear, Base, Bull을 꼭짓점으로 한 삼각분포, WACC와 영구성장률은 정규분포에서 뽑아 주당 가치를 반복 계산함',
      `시행 ${v3Ok(sw('mc_n')) ? v3Num(sw('mc_n')) : '10,000'}회, WACC 표준편차 ${pct(sw('mc_wacc_sd'), 1) || '1.0%'}p, 영구성장률 표준편차 ${pct(sw('mc_g_sd'), 1) || '0.5%'}p. WACC와 영구성장률 차이가 1%p 미만인 표본은 다시 뽑음`,
      '결과: 평균, 중앙값, 25%에서 75% 구간, 5%에서 95% 구간, 현재가보다 15% 넘게 오를 확률',
      '화면 아래 글은 파이썬이 분포를 만들 때 남긴 점검',
      '파이썬에서만 계산함. 화면에서 가정을 바꿔도 분포는 처음 값 그대로이며, 입력 내려받기 파일로 파이썬을 다시 돌려야 바뀜']],
    ['연도별 상세 읽는 법', [
      '열은 과거 연도, 명시 기간, 전환 기간, 종료연도, 과거 CAGR, 추정 CAGR 순서. CAGR은 모델이 계산한 줄만 보이며 과거는 직전 실적까지 최대 5년, 추정은 직전 실적에서 명시 마지막 해까지',
      'FCFF 묶음의 과거 열은 최근 3년 실적으로 구한 참고 값',
      '재무제표와 스케줄 줄은 명시 기간까지, FCFF와 할인 줄은 종료연도까지 값이 있음',
      '묶음 이름을 누르면 펴고 접음. 접힌 묶음은 합계 줄만 보임',
      '과거 연도 단추로 보일 과거 연도 수를 고름(없음에서 전부까지)',
      '연한 파란 칸은 가정. 값을 바꾸면 고른 시나리오, 입력 적용이 세 시나리오면 세 시나리오의 그 해 가정이 바뀜. 금액 줄은 대부분 계산값이라 고칠 수 없음',
      '결과 줄과 짝이 없는 가정(감가상각률, 물가상승률 등)은 「그 밖의 가정」 묶음에 있음',
      '검증 줄은 차이가 0이면 「일치」, 어긋나면 빨간 숫자',
      '값이 하나인 항목(WACC, 주주가치 다리, 주식 수)은 표 아래 계산표에 있음']],
    ['점검 읽는 법', [
      '오류: 계산을 믿을 수 없는 상태. 대차 불일치, 영구성장률이 할인율 이상, 가중치 합이 100%가 아님 등',
      '주의: 계산은 되지만 가정을 다시 볼 것. 컨센서스와 10% 넘는 차이, 과거 범위를 벗어난 이익률, 직접 입력한 WACC 등',
      '참고: 적용된 규칙과 자료의 한계. 베타 하한 적용, 회귀 베타 통계, 희석 반영 내역 등',
      '파이썬 대조: 처음 값으로 화면이 다시 계산한 모든 칸을 파이썬 결과와 견줌. 다른 칸이 있으면 탭 이름에 오류로 세고 목록을 보여 줌',
      '바꾼 입력: 처음 값과 바꾼 값. 줄마다 되돌릴 수 있음',
      '보정: 과거 연도의 일회성 금액을 계정(매출, 매출원가, 판관비, 영업이익)별로 넣고 고치고 지움. 금액은 실적에 더할 값이며 영업이익 보정은 판관비에서 뺌. 과거 연도 항목만 정상화 실적과 평균에 들어가고 추정 연도 항목은 참고로만 남음. 근거가 비면 오류',
      'DCF 맵의 주황 표시는 그 단계에 확인할 점검이 있다는 뜻. 끝값 하나만 준 가정의 점검은 그 가정이 속한 단계에 걸림']],
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
