/* UNIVERSE WORKS — 딜소싱 › 타깃 › SI 타깃(#deals/si) (2026-11-18 사용자 요청)
   SI(전략적 인수자)별로 들고 갈 만한 회사. 자료는 data/si_targets.json(딜레이더 si_targets.py → export.py, 형식은 딜레이더 CONTRACT.md 「SI 타깃」), 이 화면은 읽기만.
   맨 위 SI 요약 카드(지배구조, 인수 업종·규모·구조·자금, 리서치 PDF = 팀 파일함 경로) → 목록(사내 딜 pin 고정, 나머지 점수순).
   컨택 상태·메모: radar_marks.json(key = item.id 'si:<SI>|<회사>', tab 'si'). 저장은 tgt.js 의 tgS.marks·tgSaveMarks를 같이 탄다(round.js와 같다).
   팩트시트·관심(☆)은 원래 탭 ref(refs 첫 값)로 같은 회사를 본다. 조사 단서(hint)에는 회사 사실만 넣고 SI 판단 문장(why·pos·signals)은 넣지 않는다.
   사내 대화(사내 딜, 회의에서 들은 내용, 사내 대화로 넣은 업종에서 SI 이름을 든 문장)는 표시를 붙이고 엑셀 다운로드에서 뺀다(상장사 미공개 정보, 2026-11-18 사용자).
   진입: renderSi(host). 다른 화면에서 한 회사를 펼쳐 열 때: siFocus(ref)가 돌려준 주소로 이동.
   ipo.css(목록·펼친 행·상자)·radar.css(.rd-page 배치·필터·묶음 제목)·tgt.css(.tgt-page 폰 배치)·pe.css(.pe-mg·.pe-ds·.pe-dn) 클래스를 쓰고, 새것만 si.css. */

const SI_FILE = 'data/si_targets.json';
const SI_TTL = 5 * 60000;
const SI_FIT = [['', '전체'], ['상', '상'], ['중', '중']];
const SI_SORT = [['score', '점수순'], ['rev', '매출순'], ['op', '영업이익순']];
const SI_KEYS = ['si', 'q', 'fit', 'bk', 'from', 'sort'];
const SI_INH = '사내 대화';

// 새로 고친 뒤에도 보던 SI·검색어·필터·정렬·펼친 행을 이어 보게 창마다 기억한다(app.js viewGet·viewSet, 키 si)
const siS = (() => {
  const v = viewGet('si', null) || {};
  const s = { si: '', q: '', fit: '', bk: '', from: '', sort: 'score', top: false, open: new Set(), host: null, data: null, err: '', at: 0, loading: null, focus: null, redraw: false, field: null };
  SI_KEYS.forEach((k) => { if (typeof v[k] === 'string') s[k] = v[k]; });
  if (typeof v.top === 'boolean') s.top = v.top;
  if (!SI_FIT.some(([x]) => x === s.fit)) s.fit = '';
  if (!SI_SORT.some(([x]) => x === s.sort)) s.sort = 'score';
  if (Array.isArray(v.open)) s.open = new Set(v.open.filter((x) => typeof x === 'string'));
  return s;
})();
const siSave = () => viewSet('si', { ...Object.fromEntries(SI_KEYS.map((k) => [k, siS[k]])), top: siS.top, open: [...siS.open] });

/* ---------- 자료 ---------- */
const siStr = (v) => (v == null || typeof v === 'object' ? '' : String(v).trim());
const siNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const siObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const siArr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const siList = (v) => (Array.isArray(v) ? v : []).map(siStr).filter(Boolean);
const siDay = (v) => { const s = siStr(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const siHttp = (v) => { const s = siStr(v); return /^https?:\/\/\S+$/i.test(s) ? s : ''; };
const siCount = (list) => { const m = new Map(); list.forEach((k) => { if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')); };

function siNormOne(raw) {
  const name = siStr(raw.name);
  if (!name) return null;
  const pt = siObj(raw.pattern), sectors = siList(pt.sectors), summary = siStr(raw.summary);
  // 지배구조 한 줄: 자료에 gov가 있으면 그대로, 없으면 요약에서 '최대주주' 문장을 떼어 낸다
  let gov = siStr(raw.gov), sum = summary;
  if (!gov) {
    const parts = summary.split(/\.\s+/).map((t) => t.trim()).filter(Boolean), k = parts.findIndex((t) => /최대주주|지배구조/.test(t));
    if (k >= 0) { gov = parts[k].replace(/\.$/, ''); sum = parts.filter((_, i) => i !== k).join('. '); }
  }
  // 사내 대화로 넣은 업종(pattern.sectors 에 '(사내 대화)'): 그 업종 회사 문장에 SI 이름이 나오면 사내 대화로 본다
  const inBk = new Set(sectors.filter((t) => /사내/.test(t)).map((t) => t.replace(/\s*\(.*\)\s*$/, '')));
  const nick = name.replace(/(전자|홀딩스|그룹|산업)$/, '') || name;
  const seen = new Set();
  const items = siArr(raw.items).map((x, i) => {
    const id = siStr(x.id), nm = siStr(x.name);
    if (!id || !nm || seen.has(id)) return null;
    seen.add(id);
    const p = siObj(x.perf);
    const perf = { fy: siNum(p.fy), rev: siNum(p.rev), op: siNum(p.op), ni: siNum(p.ni), gr: siNum(p.growth), opm: siNum(p.opm), cash: siNum(p.cash) };
    if (perf.opm == null && perf.op != null && perf.rev) perf.opm = Math.round((perf.op / perf.rev) * 1000) / 10;
    const e = {
      id, name: nm, idx: i, cc: siStr(x.cc), listed: x.listed === true, bucket: siStr(x.bucket), line: siStr(x.line), region: siStr(x.region),
      deal: siStr(x.deal), stage: siStr(x.stage), signals: siList(x.signals), from: siList(x.from), refs: siList(x.refs), perf,
      owner: siStr(x.owner), customers: siStr(x.customers), size: siStr(x.size), score: siNum(x.score), fit: siStr(x.fit),
      top: x.top === true, pin: x.pin === true, pos: siStr(x.pos), why: siStr(x.why), link: siHttp(x.link),
    };
    const txt = [e.why, e.pos, e.stage, ...e.signals].join(' ');
    e.inh = e.from.includes('사내 딜') || /회의|사내/.test(txt) || (inBk.has(e.bucket) && (txt.includes(name) || txt.includes(nick)));
    // 자동 문장(업종, 매출 …)은 목록 칸과 겹치므로 사람이 쓴 이유만 회사 칸 아래에
    e.whyOwn = !!e.why && !e.why.startsWith(`${e.bucket}, `);
    e.q = [nm, e.bucket, e.line, e.region, e.deal, e.stage, e.owner, e.customers, e.why, ...e.signals, ...e.from].join(' ').toLowerCase();
    return e;
  }).filter(Boolean);
  const fy = siCount(items.map((e) => (e.perf.fy != null ? String(e.perf.fy) : '')))[0]?.[0];
  return {
    id: siStr(raw.id) || `si:${name}`, name, code: siStr(raw.code), cc: siStr(raw.cc), asof: siDay(raw.asof), gov, summary: sum, report: siStr(raw.report),
    pattern: { sectors, size: siStr(pt.size), deal: siStr(pt.deal), funding: siStr(pt.funding) }, owned: siList(raw.owned),
    sources: siObj(raw.sources), items, byId: new Map(items.map((e) => [e.id, e])), fy: fy ? +fy : null,
    buckets: siCount(items.map((e) => e.bucket)), froms: siCount(items.flatMap((e) => e.from)),
  };
}

async function siRead() {
  let d;
  try { d = await STORE.readText(SI_FILE); } catch (e) { if (e.status === 404) return null; throw e; }
  if (!d.text) return null;
  let raw;
  try { raw = JSON.parse(d.text); } catch { throw new Error('SI 타깃 자료 형식이 올바르지 않습니다'); }
  const sis = siArr(raw?.sis).map(siNormOne).filter(Boolean);
  return sis.length ? { generated: siStr(raw.generated), sis } : null; // 빈 자리 파일이면 '준비 중'
}

function siLoad(force) {
  if (!force && siS.at && Date.now() - siS.at < SI_TTL) return Promise.resolve();
  if (!siS.loading) {
    siS.loading = (async () => {
      // 저장 대기 중에 읽으면 대기 변경이 덮이므로 저장이 끝난 뒤 읽고, 아직 못 보낸 변경은 다시 얹는다(tgt.js tgLoad와 같다)
      let d, mk, sv;
      do {
        sv = tgS.saving; await sv.catch(() => {});
        [d, mk] = await Promise.all([siRead(), tgReadMarks()]);
      } while (sv !== tgS.saving);
      siS.data = d; siS.err = '';
      tgS.marks = { items: tgApplyDirty(mk.items), version: mk.version };
      siS.at = Date.now();
      TAB_INFO['deals/si'] = siInfo();
    })().finally(() => { siS.loading = null; });
  }
  return siS.loading;
}

const siCur = () => siS.data?.sis.find((x) => x.name === siS.si) || siS.data?.sis[0] || null;
const siFind = (id) => { const m = /^si:([^|]+)\|/.exec(String(id || '')); return (siS.data?.sis.find((x) => x.name === m?.[1]) || siCur())?.byId.get(id) || null; };

/* ---------- 원래 탭 ---------- */
function siTabOf(ref) {
  const r = String(ref || ''), k = r.split(':')[0];
  if (/^pe:heir:/.test(r)) return '오너기업';
  if (/^pe:dup:/.test(r)) return '중복상장';
  if (k === 'pe') return '섹터';
  return { cons: '소비재', deep: '딥테크', round: '투자 라운드', sell: '구주 매물', bids: '입찰딜', kmx: '매물장터', yesim: '상장 준비' }[k] || '';
}
// 원래 탭이 그 회사를 펼쳐 두게 하고 이동할 주소를 돌려준다
function siGoTo(ref, name) {
  const r = String(ref || ''), k = r.split(':')[0];
  if (/^pe:(heir|dup):/.test(r)) return (typeof peFocus === 'function' && peFocus(r)) || '#deals/heir';
  if (k === 'pe') { // 섹터 PE 딜(id가 pe:<인수자>|<대상>): PE 딜 보기에서 회사 이름으로 찾고, 자료를 읽어 둔 뒤면 그 업종을 펼친다
    if (typeof secS === 'object') {
      const s = secS.d, d = secS.pe?.deals.find((x) => x.target === name);
      Object.assign(s, { q: name, type: '', stage: '', rn: '' });
      secS.view = 'deal';
      if (d) { s.open.add(d.sector); secS.focus = d.sector; }
      if (typeof secViewSave === 'function') secViewSave();
    }
    return '#deals/sector';
  }
  if (['yesim', 'sell', 'bids'].includes(k)) return (typeof radarFocus === 'function' && radarFocus(r)) || `#deals/${k}`;
  if (k === 'cons' || k === 'deep') return (typeof tgtFocus === 'function' && tgtFocus(r)) || `#deals/${k}`;
  if (k === 'round') return (typeof roundFocus === 'function' && roundFocus(r)) || '#deals/round';
  if (k === 'kmx') { if (typeof ppGoTab === 'function') ppGoTab(r); return '#deals/kmx'; }
  return '';
}

/* ---------- 컨택 상태·메모 ---------- */
const siSt = (e) => tgSt(e.id);
function siTouch(e, patch) {
  let m = tgMark(e.id);
  const prev = tgS.dirty.get(e.id), base = prev ? prev.base : (m ? { ...m } : null);
  if (!m) { m = { key: e.id, tab: 'si', name: e.name, status: '미접촉', note: '' }; tgS.marks.items.push(m); }
  const d = { patch: { ...prev?.patch, ...patch }, seq: ++tgSeq, base, name: e.name, tab: 'si', at: tgNow(), by: G.account?.name || '' };
  Object.assign(m, patch, { tab: 'si', name: d.name, at: d.at, by: d.by });
  tgS.dirty.set(e.id, d);
  // 저장이 되돌려졌으면(권한·충돌) 그 행 표시를 다시 맞춘다
  tgSaveMarks().finally(() => { siSumDraw(); const r = siRowEl(e.id); if (r && r.dataset.st !== siSt(e)) siRedrawRow(e.id); });
}
// 상태를 바꾼 행은 펼친 채 그 자리에 두고(메모를 이어 쓸 수 있게), 접을 때 연락함·미팅·보류면 목록 아래 '컨택한 곳'으로. 검토 완료를 한 번 더 누르면 미접촉
function siSetStatus(id, st) {
  const e = siFind(id); if (!e || !TG_STATUS.includes(st)) return;
  let v = st;
  if (siSt(e) === v) { if (v !== TG_DONE) return; v = TG_STATUS[0]; }
  siTouch(e, { status: v });
  siRedrawRow(id);
  siSumDraw();
}
function siSetNote(id, val) {
  const e = siFind(id); if (!e) return;
  const note = String(val || '').trim().slice(0, 300);
  if ((tgMark(e.id)?.note || '') === note) return;
  siTouch(e, { note });
  const by = siRowEl(id)?.querySelector('.ipo-by');
  if (by) by.textContent = tgByText(tgMark(e.id));
}

/* ---------- 거르기·정렬 ---------- */
// 관심 없음(사람별, fav.js): 펼친 칸 머리와 같은 ref(원래 탭 ref = refs 첫 값)로 떼어 맨 아래 접힌 묶음으로. SI 칩·요약·업종 숫자도 뺀 목록으로 센다
const siFv = (list) => (typeof fvSplit === 'function' ? fvSplit(list, (e) => e.refs[0] || null) : [list, []]);
const siVis = (list) => siFv(list)[0];
function siRows(si) {
  const s = siS, q = s.q.trim().toLowerCase(), lo = (v) => (v == null ? -Infinity : v);
  const hit = (e) => !q || e.q.includes(q);
  const by = { rev: (e) => e.perf.rev, op: (e) => e.perf.op }[s.sort];
  const cmp = (a, b) => (by ? lo(by(b)) - lo(by(a)) : 0) || lo(b.score) - lo(a.score) || a.idx - b.idx;
  // 사내 딜(pin)은 필터와 관계없이 맨 위에 고정, 검색어만 따른다
  const [pins, skipP] = siFv(si.items.filter((e) => e.pin && hit(e)).sort((a, b) => a.idx - b.idx));
  const [rest, skipR] = siFv(si.items.filter((e) => !e.pin && hit(e) && (!s.fit || e.fit === s.fit) && (!s.bk || e.bucket === s.bk) && (!s.from || e.from.includes(s.from)) && (!s.top || e.top)).sort(cmp));
  const low = rest.filter((e) => tgLowSt(siSt(e)));
  return { pins, main: rest.filter((e) => !low.includes(e)), low, skip: [...skipP, ...skipR] };
}

/* ---------- 표시 형식 ---------- */
const siFitChip = (e) => (e.fit ? `<span class="pe-ds${e.fit === '상' ? ' on' : ''}">${esc(e.fit)}</span>` : TG_NA);
const siEok = (v) => (v == null ? TG_NA : tgDn(v, tgEok(v)));
const siGrp = (t, n, cls = '') => `<div class="rd-grp${cls}"><b>${t}</b><span>${n}곳</span></div>`;
const SI_HEAD = '<div class="ipo-head ipo-cols"><div class="pe-h-chip">적합도</div><div>회사</div><div class="rd-c2">업종</div><div>매출</div><div>딜</div><div class="rd-c2">출처</div><div class="rd-h-st">컨택 상태</div></div>';

function siRow(e, fy) {
  const open = siS.open.has(e.id), p = e.perf, st = siSt(e);
  const tags = `${e.inh ? `<span class="rd-fs-tag si-in">${SI_INH}</span>` : ''}${e.top ? '<span class="rd-fs-tag">상위 10</span>' : ''}`;
  const alt = [e.bucket, e.from.join(', ')].filter(Boolean).join(', ');
  const ty = p.fy != null && p.fy !== fy ? `${p.fy}년` : '';
  const mg = tgMg([['적합도', siFitChip(e)], ['매출', siEok(p.rev)], ['영업이익', siEok(p.op)], ['딜', e.deal ? esc(e.deal) : TG_NA]]);
  return `<div class="ipo-row${open ? ' open' : ''}${tgDoneCls(st)}" data-id="${esc(e.id)}" data-st="${esc(st)}">
    <div class="ipo-line ipo-cols">
      <div class="rd-mh">${siFitChip(e)}<div class="ipo-sub">${e.score != null ? `${e.score}점` : ''}</div></div>
      <div class="ipo-c-name"><button type="button" class="ipo-ttl" aria-expanded="${open}">${tgNm(e.name)}</button>${tags}${e.line ? `<div class="ipo-sub tgt-s">${esc(e.line)}</div>` : ''}${alt ? `<div class="ipo-sub rd-alt">${esc(alt)}</div>` : ''}${e.whyOwn ? `<div class="ipo-sub si-why">${esc(e.why)}</div>` : ''}${mg}</div>
      <div class="rd-mh rd-c2">${e.bucket ? esc(e.bucket) : TG_NA}<div class="ipo-sub">${esc(e.region)}</div></div>
      <div class="rd-mh">${siEok(p.rev)}<div class="ipo-sub">${p.op != null ? `영업이익 ${siEok(p.op)}` : ''}${ty ? ` ${ty}` : ''}</div></div>
      <div class="rd-mh">${e.deal ? `<div class="rd-clamp">${esc(e.deal)}</div>` : TG_NA}<div class="ipo-sub">${esc(e.stage)}</div></div>
      <div class="rd-mh rd-c2">${e.from.length ? esc(e.from.join(', ')) : TG_NA}${e.signals.length ? `<div class="ipo-sub rd-clamp">${esc(e.signals.slice(0, 2).join(', '))}</div>` : ''}</div>
      <div class="ipo-c-st">${tgChip(st)}${tgChev()}</div>
    </div>${open ? siDetail(e) : ''}</div>`;
}

/* ---------- 펼친 행 ---------- */
// 팩트시트 요청 때 보내는 조사 단서: 회사 사실만(SI 판단 문장은 빼서 콜드 컨택 자료로 새지 않게)
const siFsX = (e) => ({ name: e.name, cc: e.cc, listed: e.listed, 업종: e.bucket, 주력: e.line, 지역: e.region, 최대주주: e.owner, perf: e.perf, link: e.link });
function siPipe(e) {
  if (typeof pipeAdd !== 'function') return '';
  let has = '';
  try { has = typeof pipeHas === 'function' ? [e.id, ...e.refs].find((r) => pipeHas(r)) || '' : ''; } catch { /* 모르면 올리기 버튼 */ }
  return has ? `<a class="ipo-a rd-pipe" href="#deals/pipeline" data-pp-ref="${esc(has)}">${ico('done', 'sm')}파이프라인에 있음</a>`
    : `<button type="button" class="btn sm rd-pipe" data-si-pipe>${ico('plus', 'sm')}파이프라인에 올리기</button>`;
}
function siHead(e) {
  const st = siSt(e), m = tgMark(e.id), ref = e.refs[0] || '';
  // 원래 탭으로: 출처마다 하나씩, 그 탭에서 남긴 컨택 상태가 있으면 옆에
  const go = e.refs.map((r) => { const t = siTabOf(r); return t ? `<a class="ipo-a rd-pipe si-go" href="#deals" data-si-go="${esc(r)}">${esc(t)}에서 보기${tgChip(tgSt(r))}${ico('right', 'sm')}</a>` : ''; }).join('');
  const sum = e.why || e.pos;
  return `<div class="ipo-dhead">${sum ? `<p class="ipo-sum1">${esc(sum)}</p>` : '<p></p>'}
      <div class="ipo-acts"><div class="seg ipo-seg">${TG_STATUS.map((s) => `<button type="button" class="${s === st ? 'on' : ''}" aria-pressed="${s === st}" data-si-st="${s}">${s}</button>`).join('')}</div>
        <input class="input ipo-note" data-si-note placeholder="메모" maxlength="300" value="${esc(m?.note || '')}" aria-label="메모">
        <span class="ipo-by">${esc(tgByText(m))}</span>${ref && typeof fqHead === 'function' ? fqHead(ref, siFsX(e)) : ''}${go}</div>${siPipe(e)}
    </div>`;
}
function siDetail(e) {
  const p = e.perf, ref = e.refs[0] || '';
  const sig = `${tgKv('적합도', `${siFitChip(e)}${e.score != null ? ` ${e.score}점` : ''}`)}${tgKv('자리', esc(e.pos))}${tgKv('딜', esc(e.deal))}${tgKv('단계', esc(e.stage))}
    ${tgKv('신호', e.signals.length ? tgLines(e.signals) : '')}${tgKv('출처', esc(e.from.join(', ')))}`;
  const pf = p.rev != null || p.op != null || p.ni != null || p.cash != null
    ? `${tgKv('매출', p.rev != null ? siEok(p.rev) : '')}${tgKv('영업이익', p.op != null ? `${siEok(p.op)}${p.opm != null ? ` <span class="muted">OPM ${tgDn(p.opm, tgPct(p.opm))}</span>` : ''}` : '')}
      ${tgKv('순이익', p.ni != null ? siEok(p.ni) : '')}${tgKv('매출 성장', p.gr != null ? tgChg(p.gr) : '')}${tgKv('현금', p.cash != null ? tgEok(p.cash) : '')}` : TG_NONE;
  const links = [e.link ? tgA(e.link, /dart\.fss/.test(e.link) ? 'DART 공시' : '원문') : '', e.cc || !/\(MKS/.test(e.name) ? tgA(`https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(e.name)}`, 'DART 검색') : ''].join('');
  const co = `${tgKv('주력', esc(e.line))}${tgKv('업종', esc(e.bucket))}${tgKv('지역', esc(e.region))}${tgKv('최대주주', esc(e.owner))}${tgKv('고객', esc(e.customers))}
    ${tgKv('규모', esc(e.size))}${tgKv('상장', e.listed ? '상장' : '')}${links ? `<div class="ipo-links">${links}</div>` : ''}`;
  return `<div class="ipo-detail">${siHead(e)}
    <div class="ipo-pane"><div class="ipo-stack">${ref && typeof fqBox === 'function' ? fqBox(ref, siFsX(e), siTabOf(ref)) : ''}
      <div class="ipo-two-col">
        <div class="ipo-stack">${tgBox('SI 적합', sig.trim())}${tgBox('실적', pf, p.fy != null ? `${p.fy}년` : '')}</div>
        <div class="ipo-stack">${tgBox('회사 정보', co.trim() || TG_NONE)}</div>
      </div>
    </div></div>
  </div>`;
}

/* ---------- SI 요약 카드·요약 줄·필터 ---------- */
function siCard(si) {
  if (!si) return '';
  const pick = `<div class="rd-quick si-pick">${siS.data.sis.map((x) => `<button type="button" data-si-pick="${esc(x.name)}" class="${x === si ? 'on' : ''}" aria-pressed="${x === si}">${esc(x.name)}<span class="rd-qn">${siVis(x.items).length}</span></button>`).join('')}</div>`;
  const secs = si.pattern.sectors.map((t) => `<span class="pe-ds${/사내/.test(t) ? ' si-in' : ''}">${esc(t)}</span>`).join('');
  const kv = `${tgKv('지배구조', esc(si.gov))}${tgKv('요약', esc(si.summary))}${tgKv('인수 업종', secs ? `<div class="tgt-flags">${secs}</div>` : '')}
    ${tgKv('인수 규모', esc(si.pattern.size))}${tgKv('인수 구조', esc(si.pattern.deal))}${tgKv('인수 자금', esc(si.pattern.funding))}
    ${tgKv('보유 회사', si.owned.length ? `<div class="si-own" title="${esc(si.owned.join(', '))}">${esc(si.owned.join(', '))}</div>` : '')}`;
  return `<section class="card si-card">${pick}
    <div class="si-h"><h2>${esc(si.name)}</h2>${si.code ? `<span class="muted">${esc(si.code)}</span>` : ''}${si.asof ? `<span class="muted">기준일 ${esc(yymd(si.asof))}</span>` : ''}
      ${si.report ? `<button type="button" class="btn sm si-rep" data-si-rep>${ico('file', 'sm')}리서치 PDF</button>` : ''}</div>
    <div class="si-kv">${kv}</div></section>`;
}
// 리서치 PDF는 팀 파일함 경로. SharePoint 보기 화면으로 연다(받기 전에 창을 먼저 열어 팝업 차단을 피한다, facts.js fsIrOpen과 같다)
async function siReport(path) {
  const w = window.open('', '_blank');
  try {
    const j = await G.get(`/drives/${CFG.teamDrive}/root:/${path.split('/').map(encodeURIComponent).join('/')}:?$select=webUrl`);
    if (w) w.location = j.webUrl; else window.open(j.webUrl, '_blank', 'noopener');
  } catch (e) { if (w) w.close(); toast(e.status === 404 ? '리서치 파일을 찾지 못했습니다' : e.message); }
}

function siSummary(si) {
  if (!si) return '';
  const it = siVis(si.items), n = (f) => it.filter(f).length, t = tgTime(siS.data?.generated);
  const bad = Object.entries(si.sources).filter(([, v]) => !/^ok/i.test(siStr(v))).map(([s, v]) => `<span class="ipo-stale" title="${esc(siStr(v))}">${esc(s)} 확인 필요</span>`);
  return [si.asof ? `<span${t ? ` title="${esc(t)} 생성"` : ''}>기준일 ${esc(yymd(si.asof))}</span>` : '', `<span><b>${it.length}</b>곳</span>`,
    `<span>상 <b>${n((e) => e.fit === '상')}</b></span>`, `<span>중 <b>${n((e) => e.fit === '중')}</b></span>`,
    `<span>컨택 <b>${n((e) => siSt(e) !== TG_STATUS[0])}</b></span>`, ...bad].join('');
}

const siSeg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-${attr}="${esc(v)}" class="${cur === v ? 'on' : ''}" aria-pressed="${cur === v}">${esc(l)}</button>`).join('')}</div>`;
const siSel = (id, label, opts, cur) => `<select class="select" id="${id}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
function siFilterHtml(si) {
  const s = siS, vis = si ? siVis(si.items) : [], bks = siCount(vis.map((e) => e.bucket)), froms = siCount(vis.flatMap((e) => e.from));
  const bk = [['', '전체'], ...bks.map(([k, n]) => [k, `${k} ${n}`])];
  if (s.bk && !bks.some(([k]) => k === s.bk)) bk.push([s.bk, s.bk]); // 자료에서 빠진 업종을 고른 채로 남아 있으면 풀 수 있게
  const fr = [['', '출처 전체'], ...froms.map(([k, n]) => [k, `${k} ${n}`])];
  if (s.from && !froms.some(([k]) => k === s.from)) fr.push([s.from, s.from]);
  return `<div class="ipo-filter"><div class="ipo-search"><span class="ipo-sic">${ico('search', 'sm')}</span><input class="input" id="si-q" type="search" placeholder="회사, 주력, 최대주주로 검색" value="${esc(s.q)}" autocomplete="off" aria-label="검색"></div>
      ${siSeg('si-fit', SI_FIT, s.fit)}${siSel('si-from', '출처', fr, s.from)}${siSel('si-sort', '정렬', SI_SORT, s.sort)}</div>
    <div class="ipo-filter rd-finf"><div class="rd-fing"><span class="rd-finl">업종</span>${siSeg('si-bk', bk, s.bk)}</div>
      <div class="rd-fing"><span class="rd-finl">보기</span><div class="seg"><button type="button" data-si-top class="${s.top ? 'on' : ''}" aria-pressed="${s.top}">상위 10곳만</button></div></div></div>`;
}

/* ---------- 엑셀(CSV): 지금 보이는 목록 그대로, 사내 대화 표시 회사는 뺀다(밖으로 나갈 수 있는 파일) ---------- */
function siCsv(si) {
  if (!si) return;
  const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const { pins, main, low, skip } = siRows(si), list = [...pins, ...main, ...low, ...skip].filter((e) => !e.inh);
  const head = ['번호', '회사', '업종', '주력', '지역', '딜', '단계', '적합도', '점수', '기준 연도', '매출(억)', '영업이익(억)', 'OPM(%)', '매출 성장(%)', '최대주주', '출처', '신호', '고른 이유', '컨택 상태', '메모'];
  const rows = list.map((e, i) => [i + 1, e.name, e.bucket, e.line, e.region, e.deal, e.stage, e.fit, e.score, e.perf.fy, e.perf.rev, e.perf.op, e.perf.opm, e.perf.gr, e.owner,
    e.from.join(', '), e.signals.join(', '), e.why, siSt(e), tgMark(e.id)?.note || '']);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `SI 타깃_${si.name}_${(si.asof || today()).replace(/-/g, '').slice(2)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------- 그리기 ---------- */
function siBody(si) {
  if (siS.err) return `<div class="empty">${esc(siS.err)}</div>`;
  if (!si) return '<div class="empty">SI 타깃 목록을 준비하고 있습니다. 자료가 올라오면 여기에 보입니다.</div>';
  const { pins, main, low, skip } = siRows(si);
  if (!pins.length && !main.length && !low.length && !skip.length) return '<div class="empty">조건에 맞는 회사가 없습니다.</div>';
  const row = (e) => siRow(e, si.fy);
  return SI_HEAD
    + (pins.length ? siGrp('사내 딜', pins.length) + pins.map(row).join('') : '')
    + (main.length ? (pins.length ? siGrp('후보', main.length) : '') + main.map(row).join('') : '')
    + (low.length ? siGrp('컨택한 곳', low.length, ' rd-low') + low.map(row).join('') : '')
    + (skip.length ? fvSkipTail(skip, 'si', row) : '');
}
const siRowEl = (id) => (siS.host ? [...siS.host.querySelectorAll('#si-body .ipo-row[data-id]')].find((r) => r.dataset.id === id) : null);
const siNoteOn = () => { const ae = document.activeElement; return !!(ae && ae.matches?.('[data-si-note]') && siS.host?.contains(ae)); };

function siSumDraw() {
  const h = siS.host; if (!h || !h.isConnected) return;
  const el = h.querySelector('#si-sum'); if (el) el.innerHTML = siSummary(siCur());
}
function siDraw(full) {
  const h = siS.host; if (!h || !h.isConnected) return;
  if (siNoteOn()) { siS.redraw = true; return; } // 메모를 쓰는 중이면 칸을 떠날 때 다시 그린다
  const si = siCur();
  if (si) siS.si = si.name;
  if (full) { h.querySelector('#si-card').innerHTML = siCard(si); h.querySelector('#si-filter').innerHTML = siFilterHtml(si); }
  siSumDraw();
  h.querySelector('#si-body').innerHTML = siBody(si);
  siSave();
  if (siS.focus != null) {
    const r = siRowEl(siS.focus);
    siS.focus = null;
    if (r && typeof tgReveal === 'function') tgReveal(r);
  }
}
function siRedrawRow(id) {
  const r = siRowEl(id), e = siFind(id), si = siCur();
  if (!r || !e || !si) return;
  const keep = siNoteOn() && r.contains(document.activeElement) ? document.activeElement.value : null;
  const t = document.createElement('template'); t.innerHTML = siRow(e, si.fy).trim();
  r.replaceWith(t.content.firstElementChild);
  if (keep != null) { const i = siRowEl(id)?.querySelector('[data-si-note]'); if (i) { i.value = keep; i.focus({ preventScroll: true }); } }
}
// 접을 때 상태 때문에 묶음(컨택한 곳 ↔ 위 목록)이 바뀌면 목록을 다시 그리고, 그 행 바로 다음 행이 그 자리에 오게 한다(tgt.js tgFold와 같다)
function siToggle(row) {
  const id = row.dataset.id, e = siFind(id), was = siS.open.has(id);
  if (was) siS.open.delete(id); else siS.open.add(id);
  siSave();
  const low = row.parentElement.querySelector('.rd-low');
  const inLow = !!low && !!(low.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (!was || !e || e.pin || row.closest('.fv-skiprows') || tgLowSt(siSt(e)) === inLow) { siRedrawRow(id); return; }
  const sc = row.closest('.scroll');
  let nx = row.nextElementSibling; while (nx && !nx.matches('.ipo-row[data-id]')) nx = nx.nextElementSibling;
  const y0 = row.getBoundingClientRect().top - (parseFloat(getComputedStyle(row).marginTop) || 0), nid = nx?.dataset.id;
  siDraw();
  const n = nid != null && siRowEl(nid);
  if (sc && n) { const dy = n.getBoundingClientRect().top - y0; if (Math.abs(dy) >= 0.5) sc.scrollTop += dy; }
}

// 펼친 행의 파이프라인 버튼만 다시 그린다(행을 통째로 다시 그리면 그사이 치던 메모가 사라진다)
function siPipeDraw(id) {
  if (!siS.host || !siS.host.isConnected) return;
  siS.host.querySelectorAll('#si-body .ipo-row.open[data-id]').forEach((r) => {
    if (id != null && r.dataset.id !== id) return;
    const e = siFind(r.dataset.id), p = r.querySelector('.ipo-dhead > .rd-pipe');
    if (!e || !p) return;
    const t = document.createElement('template'); t.innerHTML = siPipe(e).trim();
    const n = t.content.firstElementChild;
    if (n && !n.isEqualNode(p)) p.replaceWith(n);
  });
}
async function siPipeAdd(btn) {
  const e = siFind(btn.closest('.ipo-row')?.dataset.id);
  if (!e || btn.disabled || typeof pipeAdd !== 'function') return;
  btn.disabled = true;
  const type = /경영권/.test(e.deal) ? '경영권' : /프리IPO/i.test(e.stage) ? '프리IPO' : '구주';
  try { await pipeAdd({ src: 'SI 타깃', ref: e.id, name: e.name, type }); } catch (er) { toast(er?.message || '파이프라인에 올리지 못했습니다.'); }
  siPipeDraw(e.id);
}

function siBind(root) {
  const segOn = (sel, on) => root.querySelectorAll(sel).forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', b === on); });
  root.addEventListener('click', (ev) => {
    const t = ev.target;
    const pk = t.closest('[data-si-pick]');
    if (pk) { if (siS.si !== pk.dataset.siPick) { siS.si = pk.dataset.siPick; siS.bk = ''; siS.from = ''; siDraw(true); } return; }
    if (t.closest('[data-si-rep]')) { const si = siCur(); if (si?.report) siReport(si.report); return; }
    for (const [attr, f] of [['si-fit', 'fit'], ['si-bk', 'bk']]) {
      const b = t.closest(`[data-${attr}]`);
      if (b) { siS[f] = b.getAttribute(`data-${attr}`); segOn(`[data-${attr}]`, b); siDraw(); return; }
    }
    const tb = t.closest('[data-si-top]'); if (tb) { siS.top = !siS.top; tb.classList.toggle('on', siS.top); tb.setAttribute('aria-pressed', siS.top); siDraw(); return; }
    if (t.closest('#si-xls')) { siCsv(siCur()); return; }
    if (t.closest('#si-ref')) {
      siLoad(true).then(() => siDraw(true)).catch((e) => toast(e.message));
      if (typeof pipeLoad === 'function') pipeLoad(true).then(() => siPipeDraw()).catch(() => {}); // 다른 분이 그사이 올린 딜도 '있음'으로
      return;
    }
    const sb = t.closest('[data-si-st]'); if (sb) { siSetStatus(sb.closest('.ipo-row').dataset.id, sb.dataset.siSt); return; }
    const pb = t.closest('[data-si-pipe]'); if (pb) { siPipeAdd(pb); return; }
    const go = t.closest('[data-si-go]');
    if (go) { ev.preventDefault(); const to = siGoTo(go.dataset.siGo, siFind(go.closest('.ipo-row')?.dataset.id)?.name || ''); if (to) location.hash = to; return; }
    if (t.closest('a, input, select, .ipo-detail')) return;
    const row = t.closest('.ipo-row[data-id]'); if (row) siToggle(row);
  });
  root.addEventListener('input', (ev) => { if (ev.target.id === 'si-q') { siS.q = ev.target.value; siDraw(); } });
  root.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'si-from') { siS.from = t.value; siDraw(); }
    if (t.id === 'si-sort') { siS.sort = t.value; siDraw(); }
    if (t.matches('[data-si-note]')) siSetNote(t.closest('.ipo-row').dataset.id, t.value);
  });
  root.addEventListener('focusin', (ev) => { if (ev.target.matches?.('[data-si-note]')) siS.field = ev.target; });
  root.addEventListener('focusout', (ev) => {
    const t = ev.target; if (!t.matches?.('[data-si-note]')) return;
    siSetNote(t.closest('.ipo-row')?.dataset.id, t.value);
    if (siS.field === t) siS.field = null;
    if (siS.redraw) { siS.redraw = false; setTimeout(() => siDraw(), 0); }
  });
}
// 메모 칸을 떠나지 않은 채 다른 화면으로 옮기거나 앱을 내릴 때도 쓰던 메모를 저장한다(tgt.js tgFlush와 같다)
function siFlush() {
  const el = siS.field; if (!el) return;
  const id = el.closest('.ipo-row')?.dataset.id;
  if (id != null) siSetNote(id, el.value);
  if (!el.isConnected) siS.field = null;
}
window.addEventListener('hashchange', () => { siFlush(); siS.field = null; });
// 관심 없음을 켜고 끄거나 처음 읽었을 때: 이 화면이 열려 있으면 목록을 다시 그린다(SI 칩·업종 숫자까지 맞추되 고르던 칸은 그대로)
window.addEventListener('fv-change', () => {
  const h = siS.host;
  if (!h?.isConnected || !h.querySelector('#si-body') || !siS.data) return;
  const sc = h.closest('.scroll'), top = sc?.scrollTop;
  const ae = document.activeElement, keepF = ae && h.querySelector('#si-filter')?.contains(ae);
  siDraw(!keepF);
  if (sc) sc.scrollTop = top;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) siFlush(); });

async function renderSi(host) {
  siS.host = host; siS.err = '';
  host.innerHTML = `<div class="ipo-page rd-page tgt-page si-page" id="si-root">
    <div class="ipo-top"><div class="ipo-sumrow" id="si-sum"></div>
      ${infoBtn('deals/si')}
      <button class="btn ghost" type="button" id="si-xls">${ico('file', 'sm')}<span>엑셀 다운로드</span></button>
      <button class="btn ghost" type="button" id="si-ref">${ico('refresh', 'sm')}<span>새로고침</span></button></div>
    <div id="si-card"></div>
    <section class="card ipo-card">
      <div id="si-filter">${siFilterHtml(null)}</div>
      <div class="ipo-body" id="si-body"><div class="empty">불러오는 중…</div></div>
    </section></div>`;
  siBind(host.querySelector('#si-root'));
  // '파이프라인에 있음' 표시가 처음부터 맞게 미리 읽고, 다 읽으면 펼친 행의 버튼만 다시 그림
  if (typeof pipeLoad === 'function') pipeLoad().then(() => { if (siS.host === host) siPipeDraw(); }).catch(() => {});
  try { await siLoad(false); } catch (e) { siS.err = e.message || '자료를 불러오지 못했습니다'; }
  if (siS.host !== host || !host.isConnected) return;
  siDraw(true);
}

/* 다른 화면(파이프라인 등)에서 ref('si:<SI>|<회사>' = item.id)로 한 회사를 펼쳐 보여 줄 때: 필터를 풀고 펼친 뒤 돌려준 주소로 이동 */
function siFocus(ref) {
  const id = String(ref || ''), m = /^si:([^|]+)\|.+/.exec(id);
  if (!m) return '';
  Object.assign(siS, { si: m[1], q: '', fit: '', bk: '', from: '', top: false });
  siS.open.add(id); siS.focus = id;
  const r = siFind(id)?.refs[0];
  if (r && typeof fvSkip === 'function' && fvSkip(r)) viewSet('fv.sk.si', true); // 관심 없음 회사면 맨 아래 묶음을 펼쳐 둔다
  siSave();
  return '#deals/si';
}

/* ---------- 화면 설명(ⓘ) ---------- */
function siInfo() {
  const si = siCur();
  return {
    title: 'SI 타깃',
    asof: [si?.asof ? `기준일 ${si.asof}` : '기준일 –', '출처 딜소싱 각 탭 자료, SI 리서치'].join(', '),
    rows: [
      ['무엇인가', [
        'SI(전략적 인수자)별로 들고 갈 만한 회사 목록입니다. 오너기업, 입찰딜, 매물장터, 섹터 PE 딜, 소비재, 딥테크, 투자 라운드, 구주 매물 탭의 회사 중 그 SI의 인수 업종과 규모에 맞는 곳을 골랐습니다.',
        '오너기업 후보는 업종과 실적으로 고른 것이라 매각 의사는 확인 전입니다.',
      ]],
      ['왜 보나', [
        'SI에게 먼저 제안할 딜을 고르고, 우리가 공동 인수나 재무 투자로 같이 들어갈 자리를 찾기 위한 목록입니다.',
      ]],
      ['어떻게 보나', [
        '맨 위에서 SI를 고르면 지배구조, 인수 업종, 규모, 구조, 자금과 리서치 PDF가 나옵니다.',
        '사내 딜은 필터와 관계없이 목록 맨 위에 고정됩니다. 나머지는 적합도 점수 순이고, 점수는 업종, 규모, 이익률, 성장, 승계와 매각 신호로 매깁니다. 상은 66점 이상, 중은 56점 이상입니다.',
        '적합도, 출처 탭, 업종, 상위 10곳으로 좁혀 봅니다. 상위 10곳은 리서치 보고서에 올린 회사입니다.',
        '행을 펼치면 고른 이유, SI에게 어떤 자리인지, 실적, 회사 정보가 나오고, 오너기업에서 보기 같은 버튼으로 원래 탭의 같은 회사로 갑니다.',
        '사내 대화 표시는 회의에서 들은 내용이 들어간 회사입니다. 상장사 미공개 정보일 수 있어 엑셀 다운로드에서 빠집니다.',
        '연락함, 미팅, 보류로 바꾼 회사는 행을 접으면 목록 맨 아래 컨택한 곳으로 내려갑니다. 검토 완료는 제자리에서 진한 회색으로 보이고, 한 번 더 누르면 풀립니다.',
      ]],
      ['그래서 할 일', [
        '볼 곳은 팩트시트를 요청하고, SI에 제안할 딜은 파이프라인에 올립니다.',
        '사내 대화 표시가 붙은 내용은 밖으로 보내는 메일이나 자료에 넣지 않습니다.',
      ]],
    ],
  };
}
TAB_INFO['deals/si'] = siInfo();
