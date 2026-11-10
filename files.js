/* 공용 폴더: Teams "스페이스인베스트먼트" 팀 파일함(SharePoint 문서 라이브러리)을 탐색기처럼.
   경로는 ui.filesPath('' = 맨 위, 예 '00. 전체 공유/01. 명함'), 폴더 이동은 #files/<경로>로 해서 뒤로가기가 된다. */
const FL_ROOT = '유니버스인베스트먼트';
const FL_LOCK = ['주간회의']; // 맨 위의 Teams 채널 폴더: 이름 바꾸기·삭제를 막는다(바꾸면 Teams 파일 탭이 끊김)
const FL_SMALL = 4 * 1024 * 1024; // 이보다 크면 업로드 세션으로 나눠 올린다
const FL_CHUNK = 3276800; // 320KiB의 10배(업로드 세션 조각 크기 규칙)
const FL_SEL = 'id,name,size,folder,file,lastModifiedDateTime,lastModifiedBy,webUrl,parentReference';
const FL_OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx'];
const FL_APP = { doc: 'ms-word', docx: 'ms-word', xls: 'ms-excel', xlsx: 'ms-excel', xlsm: 'ms-excel', ppt: 'ms-powerpoint', pptx: 'ms-powerpoint' };
const FL_PREVIEW = { img: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'], pdf: ['pdf'], txt: ['txt', 'csv', 'md', 'json', 'log'] };

// 같은 화면을 두 메뉴로 쓴다: 공용 폴더(파일함 전체, 주간회의 폴더는 뺌) · 주간회의(그 폴더만)
const FL_MODES = { files: { base: '', root: FL_ROOT, title: '공용 폴더' }, weekly: { base: '주간회의', root: '주간회의', title: '주간회의' } };
let flM = FL_MODES.files, flRoute = 'files';
const flRel = (p) => (flM.base ? (p === flM.base ? '' : p.slice(flM.base.length + 1)) : p); // 파일함 경로 → 메뉴 안 경로
const flOnScreen = () => ['files', 'weekly'].includes(document.body.dataset.route);
const flS = { path: null, items: [], sort: viewGet('fl.sort', { k: 'name', dir: 1 }), sel: new Set(), q: '', results: null, loading: false, at: 0 };
let flQ0 = viewGet('fl.q', null); // F5 전 검색 { path, q }: 처음 그릴 때 그 폴더면 다시 찾는다(한 번만)
const flDrive = () => (typeof CFG !== 'undefined' && CFG.teamDrive) || 'b!j-FPAIUPjU6AnBcIJNprMgAfPOR1jCVOvR6mVssjMWkyr34wYSj7Rp-_wJU9Subr';
const flEnc = (p) => p.split('/').map(encodeURIComponent).join('/');
const flBase = (p) => (p ? `/drives/${flDrive()}/root:/${flEnc(p)}:` : `/drives/${flDrive()}/root`);
const flExt = (n) => (/\.([a-z0-9]+)$/i.exec(n || '') || [, ''])[1].toLowerCase();
const flKind = (it) => { const e = flExt(it.name); return Object.keys(FL_PREVIEW).find((k) => FL_PREVIEW[k].includes(e)) || ''; };
const FL_HIDE = [...FL_LOCK, '_홈페이지 미리보기', '_웍스']; // 맨 위에서 안 보이는 폴더: 주간회의(주간회의 메뉴), 홈페이지 빌드(홈페이지 메뉴)
const flHidden = (it) => !flM.base && flS.path === '' && FL_HIDE.includes(it.name); // 공용 폴더 맨 위에선 주간회의를 안 보인다(주간회의 메뉴로)
const flInHidden = (p) => !flM.base && FL_HIDE.some((n) => p === n || p.startsWith(`${n}/`)); // 공용 폴더에서 숨긴 폴더 안(주소로 들어온 경우)
const flLocked = (it) => !flS.results && ((flS.path === '' && FL_LOCK.includes(it.name)) || flInHidden(flS.path));
const flItems = () => flS.results || flS.items;
const flGo = (p) => { const r = flRel(p); location.hash = r ? `#${flRoute}/${encodeURIComponent(r)}` : `#${flRoute}`; };
const flPathOf = (it) => { // 검색 결과의 폴더 경로: parentReference.path = /drives/{id}/root:/a/b
  if (typeof it._where === 'string') return it._where; // 검색에서 직접 채운 경로(이미 풀린 글자라 다시 풀지 않는다)
  const m = /root:(.*)$/.exec(it.parentReference?.path || ''); if (!m) return '';
  let p = m[1]; try { p = decodeURIComponent(p); } catch { /* '%'가 든 이름: 그대로 */ }
  return p.replace(/^\//, '');
};
const flPids = new Map(); // 검색 결과 부모 폴더 id → 경로(이름 바꾸면 비운다)
window.flUploading = 0; // 올리는 중인 파일 수: app.js가 0보다 크면 새 버전 자동 새로 고침을 미룬다
window.addEventListener('beforeunload', (e) => { if (window.flUploading > 0) { e.preventDefault(); e.returnValue = ''; } });

function flSize(it) {
  if (it.folder) return `${it.folder.childCount}개 항목`;
  const b = it.size || 0;
  return b < 1024 ? `${b}B` : b < 1048576 ? `${Math.round(b / 1024)}KB` : `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)}MB`;
}
function flDate(s) {
  const d = new Date(s), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function flIcon(it) {
  if (it.folder) return '<span class="fl-ic fold" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg></span>';
  const e = flExt(it.name);
  const [cls, t] = ['xls', 'xlsx', 'xlsm', 'csv'].includes(e) ? ['x', 'X'] : ['doc', 'docx'].includes(e) ? ['w', 'W'] : ['ppt', 'pptx'].includes(e) ? ['p', 'P']
    : e === 'pdf' ? ['pdf', 'PDF'] : e === 'hwp' || e === 'hwpx' ? ['h', 'H'] : e === 'loop' ? ['loop', 'L'] : FL_PREVIEW.img.includes(e) ? ['img', 'IMG']
      : ['zip', '7z', 'rar'].includes(e) ? ['zip', 'ZIP'] : ['etc', (e || '').slice(0, 3).toUpperCase() || '·'];
  return `<span class="fl-ic ${cls}" aria-hidden="true">${t}</span>`;
}
function flSorted(list) {
  const { k, dir } = flS.sort;
  return [...list].sort((a, b) => (!!b.folder - !!a.folder) || (k === 'date'
    ? (a.lastModifiedDateTime < b.lastModifiedDateTime ? -1 : 1) * dir
    : a.name.localeCompare(b.name, 'ko', { numeric: true, sensitivity: 'base' }) * dir));
}

/* ---------- 화면 ---------- */
async function renderFiles(host, mode = 'files') {
  flRoute = FL_MODES[mode] ? mode : 'files'; flM = FL_MODES[flRoute];
  const rel = typeof ui !== 'undefined' && typeof ui.filesPath === 'string' ? ui.filesPath : '';
  const path = [flM.base, rel].filter(Boolean).join('/');
  if (path !== flS.path) { flS.path = path; flS.items = []; flS.sel.clear(); flS.results = null; flS.q = ''; flS.at = 0; viewSet('fl.q', null); }
  const q0 = flQ0?.path === path && flQ0.q; flQ0 = null;
  if (q0) flS.q = q0;
  host.innerHTML = `
    <div class="page-head"><h1>${flM.title}</h1></div>
    <section class="card fl-card" id="fl-card">
      <div class="fl-top">
        <nav class="fl-crumb" id="fl-crumb" aria-label="경로"></nav>
        <div class="fl-tools">
          <label class="fl-search">${ico('search', 'sm')}<input class="input" id="fl-q" type="search" placeholder="${flM.title} 검색" value="${esc(flS.q)}" enterkeyhint="search"></label>
          <button class="btn" type="button" id="fl-mkdir">${ico('plus', 'sm')}<span>새 폴더</span></button>
          <button class="btn primary fl-upbtn" type="button" id="fl-upbtn">${ico('upload', 'sm')}<span>파일 올리기</span></button>
          <button class="btn fl-share" type="button" id="fl-share" title="이 폴더를 바로 여는 웍스 링크">${ico('link', 'sm')}<span>링크 복사</span></button>
          <button class="iconbtn fl-ref" type="button" id="fl-ref" aria-label="새로고침">${ico('refresh')}</button>
        </div>
      </div>
      <div class="fl-selbar" id="fl-selbar" hidden></div>
      <div class="fl-list" id="fl-list"></div>
    </section>
    <button class="fab fl-fab" type="button" id="fl-fab" aria-label="파일 올리기">${ico('plus')}</button>
    <input type="file" id="fl-file" multiple hidden>`;
  const q = $('#fl-q');
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); flSearch(q.value.trim()); } });
  q.addEventListener('search', () => { if (!q.value.trim()) flSearch(''); });
  $('#fl-mkdir').onclick = flMkdir;
  $('#fl-share').onclick = () => flCopyText(flWorksLink(flS.path), '이 폴더 링크를 복사했습니다. 카톡·메일에 붙여 넣어 보내세요');
  $('#fl-ref').onclick = () => { flS.at = 0; flLoad(true); };
  $('#fl-fab').onclick = filesUpload;
  $('#fl-upbtn').onclick = filesUpload;
  $('#fl-file').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) flUpload(fs); });
  flDraw();
  flCheckApps();
  // 같은 경로를 다시 열면 1분 동안은 받아 둔 목록을 그대로 쓴다
  if (q0) flSearch(q0);
  else if (!flS.results && (Date.now() - flS.at > 60000 || !flS.items.length)) flLoad();
}

async function flLoad(force) {
  flS.loading = !flS.items.length || force;
  if (flS.loading) flDraw();
  const path = flS.path;
  try {
    const out = [];
    let url = `${flBase(path)}/children?$select=${FL_SEL}&$top=500`;
    while (url) { const j = await G.get(url); out.push(...j.value); url = j['@odata.nextLink'] || null; }
    if (path !== flS.path) return;
    flS.items = out.filter((x) => !flHidden(x)); flS.at = Date.now();
    const ids = new Set(out.map((x) => x.id)); [...flS.sel].forEach((id) => { if (!ids.has(id)) flS.sel.delete(id); });
  } catch (e) {
    if (path !== flS.path) return;
    flS.items = [];
    toast(e.status === 404 ? '폴더를 찾을 수 없습니다' : e.status === 403 ? '이 폴더를 볼 권한이 없습니다' : e.message);
    if (e.status === 404 && path !== flM.base) { flGo(path.split('/').slice(0, -1).join('/')); return; }
  }
  flS.loading = false;
  flDraw();
}

function flDraw() {
  const list = $('#fl-list'); if (!list) return;
  if (flS.renaming?.isConnected) return; // 그 자리 이름 바꾸기 중엔 다시 그리지 않는다(끝나면 그린다)
  flS.renaming = null;
  const segs = flRel(flS.path) ? flRel(flS.path).split('/') : [], full = (i) => [flM.base, ...segs.slice(0, i + 1)].filter(Boolean).join('/');
  $('#fl-crumb').innerHTML = [`<button type="button" data-crumb="${esc(flM.base)}">${flM.root}</button>`,
    ...segs.map((s, i) => `<span class="sep" aria-hidden="true">›</span><button type="button" data-crumb="${esc(full(i))}"${i === segs.length - 1 ? ' aria-current="page"' : ''}>${esc(s)}</button>`)].join('');
  $('#fl-crumb').querySelectorAll('[data-crumb]').forEach((b) => b.addEventListener('click', () => flGo(b.dataset.crumb)));
  const cur = $('#fl-crumb [aria-current]'); if (cur && isMobile()) cur.scrollIntoView({ inline: 'end', block: 'nearest' });

  const items = flSorted(flItems());
  const sortBtn = (k, label) => `<button type="button" class="fl-sort${flS.sort.k === k ? ' on' : ''}" data-sort="${k}">${label}${flS.sort.k === k ? `<span class="ar">${flS.sort.dir > 0 ? '↑' : '↓'}</span>` : ''}</button>`;
  const selectable = items.filter((it) => !flLocked(it));
  const allOn = selectable.length && selectable.every((it) => flS.sel.has(it.id));
  const head = flS.results
    ? `<div class="fl-res">검색 결과 <b>${items.length}</b>건<button type="button" class="btn sm" data-clear-q>검색 닫기</button></div>`
    : '';
  list.innerHTML = `${head}
    <div class="fl-row fl-head" role="row">
      <span class="c-ck"><input type="checkbox" class="check" id="fl-all" aria-label="전체 선택" ${allOn ? 'checked' : ''} ${selectable.length ? '' : 'disabled'}></span>
      <span class="c-nm">${sortBtn('name', '이름')}</span><span class="c-dt">${sortBtn('date', '수정한 날짜')}</span><span class="c-by">수정한 사람</span><span class="c-sz">크기</span><span class="c-mo"></span>
    </div>
    ${flS.loading ? '<div class="empty">불러오는 중…</div>' : items.length ? items.map(flRowHTML).join('') : `<div class="empty">${flS.results ? '검색 결과가 없습니다' : '빈 폴더'}</div>`}`;

  list.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort; flS.sort = flS.sort.k === k ? { k, dir: -flS.sort.dir } : { k, dir: k === 'date' ? -1 : 1 }; viewSet('fl.sort', flS.sort); flDraw();
  }));
  list.querySelector('[data-clear-q]')?.addEventListener('click', () => { $('#fl-q').value = ''; flSearch(''); });
  $('#fl-all')?.addEventListener('change', (e) => { selectable.forEach((it) => (e.target.checked ? flS.sel.add(it.id) : flS.sel.delete(it.id))); flDraw(); });
  list.querySelectorAll('.fl-item').forEach((row) => {
    const it = items.find((x) => x.id === row.dataset.id); if (!it) return;
    row.querySelector('.check')?.addEventListener('change', (e) => { e.target.checked ? flS.sel.add(it.id) : flS.sel.delete(it.id); flDraw(); });
    const nm = row.querySelector('.fl-name');
    if (it.folder && !flLocked(it)) { // 폴더: 한 번은 열기, 두 번은 그 자리에서 이름 바꾸기
      let t = null;
      nm.addEventListener('click', () => { clearTimeout(t); t = setTimeout(() => flOpen(it), 250); });
      nm.addEventListener('dblclick', () => { clearTimeout(t); flInlineRename(row, it); });
    } else nm.addEventListener('click', (e) => { if (e.detail <= 1) flOpen(it); }); // 두 번 눌러도 한 번만 연다
    row.querySelector('.fl-more').addEventListener('click', (e) => { e.stopPropagation(); flMenu(e.currentTarget, [it]); });
    row.addEventListener('click', (e) => { if (isMobile() && !e.target.closest('button,input,a')) flOpen(it); });
  });
  flSelBar();
}

function flRowHTML(it) {
  const by = it.lastModifiedBy?.user?.displayName || '';
  const where = flS.results ? flPathOf(it) : '';
  return `<div class="fl-row fl-item${flS.sel.has(it.id) ? ' on' : ''}" role="row" data-id="${esc(it.id)}">
    <span class="c-ck">${flLocked(it) ? '' : `<input type="checkbox" class="check" aria-label="${esc(it.name)} 선택" ${flS.sel.has(it.id) ? 'checked' : ''}>`}</span>
    <span class="c-nm">${flIcon(it)}<span class="fl-nmw"><button type="button" class="fl-name" title="${esc(it.name)}">${esc(it.name)}</button>
      ${where !== '' || flS.results ? `<span class="fl-where">${esc(flRel(where) ? `${flM.root} › ${flRel(where).replace(/\//g, ' › ')}` : flM.root)}</span>` : ''}
      <span class="fl-meta">${flDate(it.lastModifiedDateTime)} · ${flSize(it)}</span></span></span>
    <span class="c-dt">${flDate(it.lastModifiedDateTime)}</span>
    <span class="c-by">${esc(by)}</span>
    <span class="c-sz">${flSize(it)}</span>
    <span class="c-mo"><button type="button" class="iconbtn fl-more" aria-label="${esc(it.name)} 메뉴"><svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg></button></span>
  </div>`;
}

/* 선택 막대: 고른 항목에 할 수 있는 일만 */
function flSelBar() {
  const bar = $('#fl-selbar'); if (!bar) return;
  const sel = flItems().filter((it) => flS.sel.has(it.id));
  bar.hidden = !sel.length;
  if (!sel.length) { bar.innerHTML = ''; return; }
  const acts = flActions(sel);
  bar.innerHTML = `<span class="n"><b>${sel.length}</b>개 선택</span>${acts.map((a) => `<button type="button" class="btn sm${a.danger ? ' fl-danger' : ''}" data-act="${a.k}">${a.label}</button>`).join('')}
    <button type="button" class="btn ghost sm fl-unsel" data-unsel>선택 해제</button>`;
  bar.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => acts.find((a) => a.k === b.dataset.act).run()));
  bar.querySelector('[data-unsel]').onclick = () => { flS.sel.clear(); flDraw(); };
}

function flActions(sel) {
  const one = sel.length === 1 ? sel[0] : null, files = sel.filter((it) => !it.folder), locked = sel.some(flLocked);
  return [
    one && { k: 'open', label: one.folder ? '열기' : FL_APP[flExt(one.name)] && flDesk() ? '웹에서 열기' : '새 창에서 열기', run: () => (one.folder ? flOpen(one) : window.open(one.webUrl, '_blank', 'noopener')) },
    files.length === sel.length && { k: 'down', label: '다운로드', run: () => flDownload(files) },
    one && { k: 'link', label: '링크 복사', run: () => flCopyLink(one) },
    one && !locked && { k: 'ren', label: '이름 바꾸기', run: () => flRename(one) },
    !locked && { k: 'del', label: '삭제', danger: true, run: () => flDelete(sel) },
  ].filter(Boolean);
}

/* 행 ⋯ 메뉴: PC는 그 자리 작은 메뉴, 폰은 아래 패널 */
function flMenu(anchor, sel) {
  const acts = flActions(sel);
  if (isMobile()) {
    openSheet(`<h3 class="fl-sheet-t">${esc(sel[0].name)}</h3><ul class="menu">${acts.map((a) => `<li><button type="button" data-act="${a.k}"${a.danger ? ' class="fl-danger"' : ''}>${a.label}</button></li>`).join('')}</ul>`,
      (el, close) => el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { close(); acts.find((a) => a.k === b.dataset.act).run(); })));
    return;
  }
  document.querySelector('.fl-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'fl-pop'; pop.setAttribute('role', 'menu');
  pop.innerHTML = acts.map((a) => `<button type="button" role="menuitem" data-act="${a.k}"${a.danger ? ' class="fl-danger"' : ''}>${a.label}</button>`).join('');
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect(), h = pop.offsetHeight;
  pop.style.top = `${r.bottom + 4 + h > innerHeight ? r.top - h - 4 : r.bottom + 4}px`;
  pop.style.left = `${Math.max(8, r.right - pop.offsetWidth)}px`;
  const off = (e) => { if (!pop.contains(e.target)) close(); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { pop.remove(); document.removeEventListener('mousedown', off, true); document.removeEventListener('keydown', esc_); removeEventListener('scroll', close, true); };
  pop.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => { close(); acts.find((a) => a.k === b.dataset.act).run(); }));
  setTimeout(() => { document.addEventListener('mousedown', off, true); document.addEventListener('keydown', esc_); addEventListener('scroll', close, true); });
  pop.querySelector('button')?.focus();
}

/* ---------- 열기·미리보기·다운로드 ---------- */
// PC는 설치된 Word·Excel·PowerPoint로 바로 연다. 파일함 원본을 직접 열어서 앱에서 저장하면 그대로 반영된다
// 설치형 Office가 라이선스에 없는 계정(Business Basic: 대표님들)은 웹 오피스로 연다
let flLib = '', flApps = null, flAppsReq = null;
const flDesk = () => flApps === true && !isMobile();
// 확인에 실패하면 flApps는 null 그대로(다음에 다시 확인). 확인 중이면 같은 요청을 나눠 쓴다
function flCheckApps() {
  if (flApps !== null) return Promise.resolve();
  return (flAppsReq ||= G.get('/me/licenseDetails?$select=servicePlans')
    .then((j) => { flApps = j.value.some((l) => l.servicePlans.some((p) => ['OFFICE_BUSINESS', 'OFFICESUBSCRIPTION'].includes(p.servicePlanName) && p.provisioningStatus === 'Success')); })
    .catch(() => {}).finally(() => { flAppsReq = null; }));
}
async function flAppOpen(it, app) {
  try {
    flLib ||= (await G.get(`/drives/${flDrive()}?$select=webUrl`)).webUrl;
    const dir = flPathOf(it); // 맨 위 항목이면 '' → '//'가 생기지 않게
    const url = `${flLib.replace(/\/$/, '')}${dir ? `/${flEnc(dir)}` : ''}/${encodeURIComponent(it.name)}`;
    const a = document.createElement('a'); a.href = `${app}:ofe|u|${url}`; a.click();
  } catch { window.open(it.webUrl, '_blank', 'noopener'); }
}
// 앱에서 저장하고 웍스로 돌아오면 목록(수정한 날짜·크기)을 다시 받는다
window.addEventListener('focus', () => { if (flOnScreen() && $('#fl-list') && !flS.results && Date.now() - flS.at > 5000) flLoad(); });

async function flOpen(it) {
  if (it.folder) { flGo(flS.results ? [flPathOf(it), it.name].filter(Boolean).join('/') : [flS.path, it.name].filter(Boolean).join('/')); return; }
  const e = flExt(it.name);
  // 라이선스 확인 중이면 잠깐 기다린다(누른 뒤 몇 초 안이라 앱·새 창 열기는 그대로 된다)
  if (FL_APP[e] && flApps === null && !isMobile()) await Promise.race([flCheckApps(), new Promise((r) => setTimeout(r, 3000))]);
  if (FL_APP[e] && flDesk()) { flAppOpen(it, FL_APP[e]); return; }
  if (FL_OFFICE.includes(e) || e === 'loop') { window.open(it.webUrl, '_blank', 'noopener'); return; }
  if (flKind(it)) { flPreview(it); return; }
  flDownload([it]);
}

async function flDownload(list) {
  for (const it of list) {
    try {
      const full = await G.get(`/drives/${flDrive()}/items/${it.id}`); // 미리 인증된 주소: 브라우저가 바로 내려받는다(메모리에 안 올림)
      const a = document.createElement('a');
      a.href = full['@microsoft.graph.downloadUrl']; a.download = it.name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      if (list.length > 1) await new Promise((r) => setTimeout(r, 600));
    } catch (e) { toast(`${it.name}: ${e.message}`); }
  }
}

async function flPreview(it) {
  const kind = flKind(it);
  const wrap = document.createElement('div');
  wrap.className = 'fl-pv-wrap';
  wrap.innerHTML = `<div class="fl-pv" role="dialog" aria-modal="true" aria-label="${esc(it.name)}">
      <div class="fl-pv-head"><h3>${esc(it.name)}</h3>
        <button type="button" class="btn sm" data-pv="down">다운로드</button><button type="button" class="btn sm" data-pv="open">새 창에서 열기</button>
        <button type="button" class="iconbtn" data-pv="x" aria-label="닫기"><svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="fl-pv-body"><div class="empty">불러오는 중…</div></div></div>`;
  document.body.appendChild(wrap);
  let url = null;
  const close = (viaBack) => { if (!wrap.isConnected) return; wrap.remove(); if (url) URL.revokeObjectURL(url); document.removeEventListener('keydown', onKey); if (viaBack !== true) off(); };
  const off = pushLayer(() => close(true), () => close(true));
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-pv="x"]').onclick = close;
  wrap.querySelector('[data-pv="down"]').onclick = () => flDownload([it]);
  wrap.querySelector('[data-pv="open"]').onclick = () => window.open(it.webUrl, '_blank', 'noopener');
  const body = wrap.querySelector('.fl-pv-body');
  try {
    const blob = await G.get(`/drives/${flDrive()}/items/${it.id}/content`, { type: 'blob' });
    if (!wrap.isConnected) return;
    if (kind === 'txt') { // UTF-8로 깨지면(엑셀에서 저장한 CSV 등) EUC-KR로 다시 읽는다
      const buf = await blob.arrayBuffer();
      let t = new TextDecoder().decode(buf);
      if (t.includes('\uFFFD')) { try { t = new TextDecoder('euc-kr').decode(buf); } catch { /* 그대로 */ } }
      if (!wrap.isConnected) return;
      body.innerHTML = '<pre class="fl-pv-txt"></pre>'; body.firstChild.textContent = t.slice(0, 400000); return;
    }
    url = URL.createObjectURL(kind === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob);
    body.innerHTML = kind === 'pdf' ? `<iframe class="fl-pv-frame" src="${url}" title="${esc(it.name)}"></iframe>` : `<img class="fl-pv-img" src="${url}" alt="${esc(it.name)}">`;
  } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

// 웍스 안에서 그 폴더를 바로 여는 주소(대표님께 보내면 로그인 뒤 그 폴더가 열린다). 파일은 SharePoint 주소(웹 오피스로 열림)
const WORKS_URL = 'https://jwtak.github.io/space-works/';
const flWorksLink = (p) => { const r = flRel(p); return `${WORKS_URL}#${flRoute}${r ? `/${encodeURIComponent(r)}` : ''}`; };
async function flCopyText(t, msg) { try { await navigator.clipboard.writeText(t); toast(msg); } catch { toast('링크를 복사하지 못했습니다'); } }
function flCopyLink(it) {
  if (it.folder) return flCopyText(flWorksLink([flS.results ? flPathOf(it) : flS.path, it.name].filter(Boolean).join('/')), '폴더 링크를 복사했습니다. 카톡·메일에 붙여 넣어 보내세요');
  return flCopyText(it.webUrl, '파일 링크를 복사했습니다');
}

/* ---------- 이름 바꾸기·새 폴더·삭제 ---------- */
function flNameSheet(title, value, okLabel, onOk) {
  openSheet(`<h3>${title}</h3><form class="fl-form"><input class="input" name="n" value="${esc(value)}" autocomplete="off" required maxlength="200">
    <div class="fl-form-act"><button type="button" class="btn grey" data-cancel>취소</button><button class="btn primary">${okLabel}</button></div></form>`, (el, close) => {
    const f = el.querySelector('form'), inp = f.n;
    el.querySelector('[data-cancel]').onclick = close;
    setTimeout(() => { inp.focus(); const dot = value.lastIndexOf('.'); inp.setSelectionRange(0, dot > 0 ? dot : value.length); }, 30);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = inp.value.trim();
      if (!n) return;
      if (/[\\/:*?"<>|#%]/.test(n) || /^\.|\.$/.test(n)) { toast('이름에 쓸 수 없는 글자가 있습니다'); return; }
      const btn = f.querySelector('.primary'); btn.disabled = true;
      try { await onOk(n); close(); } catch (er) { btn.disabled = false; toast(er.status === 409 ? '같은 이름이 이미 있습니다' : er.message); }
    });
  });
}

function flRename(it) {
  flNameSheet('이름 바꾸기', it.name, '바꾸기', async (n) => {
    if (n === it.name) return;
    await G.patch(`/drives/${flDrive()}/items/${it.id}`, { name: n, '@microsoft.graph.conflictBehavior': 'fail' });
    toast('이름을 바꿨습니다'); flS.sel.clear(); flAfterChange({ ren: [it, n] });
  });
}

function flInlineRename(row, it) {
  const w = row.querySelector('.fl-nmw'), nm = w?.querySelector('.fl-name');
  if (!nm || w.querySelector('.fl-ren')) return;
  const inp = document.createElement('input');
  inp.className = 'input fl-ren'; inp.value = it.name; inp.maxLength = 200; inp.setAttribute('aria-label', '새 이름');
  nm.hidden = true; w.prepend(inp); inp.focus(); inp.select();
  flS.renaming = inp; // 이 동안 목록을 다시 그리지 않는다
  let busy = false;
  const undo = () => { inp.remove(); nm.hidden = false; flS.renaming = null; flDraw(); };
  const finish = async (save, viaBlur) => {
    if (busy || !inp.isConnected) return;
    const n = inp.value.trim();
    if (!save || !n || n === it.name) return undo();
    if (/[\\/:*?"<>|#%]/.test(n) || /^\.|\.$/.test(n)) { toast('이름에 쓸 수 없는 글자가 있습니다'); if (viaBlur) undo(); else inp.focus(); return; } // 다른 곳을 눌렀으면 되돌린다(포커스를 뺏지 않게)
    busy = true; inp.disabled = true;
    try {
      await G.patch(`/drives/${flDrive()}/items/${it.id}`, { name: n, '@microsoft.graph.conflictBehavior': 'fail' });
      flS.renaming = null; toast('이름을 바꿨습니다'); flAfterChange({ ren: [it, n] });
    } catch (er) { busy = false; undo(); toast(er.status === 409 ? '같은 이름이 이미 있습니다' : er.message); }
  };
  inp.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => { if (document.hasFocus()) finish(true, true); }); // 다른 창으로 옮긴 건 무시(돌아오면 그대로 이어서)
  ['click', 'dblclick'].forEach((k) => inp.addEventListener(k, (e) => e.stopPropagation()));
}

function flMkdir() {
  flNameSheet('새 폴더', '', '만들기', async (n) => {
    await G.post(`${flBase(flS.path)}/children`, { name: n, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' });
    toast('폴더를 만들었습니다'); flAfterChange();
  });
}

function flDelete(sel) {
  const list = sel.filter((it) => !flLocked(it));
  if (!list.length) return;
  openSheet(`<h3>휴지통으로 이동할까요?</h3><ul class="fl-del-list">${list.slice(0, 8).map((it) => `<li>${flIcon(it)}<span>${esc(it.name)}</span></li>`).join('')}${list.length > 8 ? `<li class="more">외 ${list.length - 8}개</li>` : ''}</ul>
    <div class="fl-form-act"><button type="button" class="btn grey" data-cancel>취소</button><button type="button" class="btn primary fl-del-ok">삭제</button></div>`, (el, close) => {
    el.querySelector('[data-cancel]').onclick = close;
    el.querySelector('.fl-del-ok').onclick = async (e) => {
      e.currentTarget.disabled = true;
      const gone = [];
      for (const it of list) { try { await G.del(`/drives/${flDrive()}/items/${it.id}`); gone.push(it.id); } catch (er) { toast(er.status === 423 ? `${it.name}: 누군가 열어 둔 파일입니다` : `${it.name}: ${er.message}`); } }
      close(); if (gone.length) toast(`${gone.length}개를 휴지통으로 옮겼습니다`);
      flS.sel.clear(); flAfterChange({ del: gone });
    };
  });
}

// 검색 중이면 검색 색인이 늦게 바뀌어서 다시 검색하지 않고 결과를 그 자리에서 고친다. 폴더 목록은 다음에 열 때 다시 받는다
function flAfterChange(ch = {}) {
  if (ch.ren) { const [it, n] = ch.ren; if (it.folder) flPids.clear(); it.name = n; }
  if (flS.results) {
    if (ch.del) flS.results = flS.results.filter((x) => !ch.del.includes(x.id));
    if (ch.ren) flS.results.forEach((x) => { if (x.id === ch.ren[0].id) x.name = ch.ren[1]; });
    flS.at = 0; flDraw();
  } else { flS.at = 0; flLoad(); }
}

/* ---------- 검색 ---------- */
async function flSearch(q) {
  flS.q = q; flS.sel.clear(); viewSet('fl.q', q ? { path: flS.path, q } : null);
  // 검색 결과 = 한 겹: 뒤로 가면 폴더 목록으로
  if (q && !flS.searchOff) flS.searchOff = pushLayer(() => { flS.searchOff = null; const i = $('#fl-q'); if (i) i.value = ''; flSearch(''); }, () => { flS.searchOff = null; });
  if (!q && flS.searchOff) { flS.searchOff(); flS.searchOff = null; }
  if (!q) { flS.results = null; flS.loading = false; flDraw(); if (!flS.items.length || !flS.at) flLoad(); return; } // 진행 중이던 검색은 결과를 버린다
  flS.results = []; flS.loading = true; flDraw();
  try {
    const out = [];
    // 주간회의 메뉴는 그 폴더 안에서만 찾는다
    let url = `${flM.base ? flBase(flM.base) : `/drives/${flDrive()}/root`}/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')?$select=${FL_SEL}&$top=200`;
    for (let i = 0; url && i < 3; i++) { const j = await G.get(url); out.push(...j.value); url = j['@odata.nextLink'] || null; }
    if (flS.q !== q) return;
    // 검색 결과에는 폴더 경로가 안 와서, 부모 폴더를 한 번씩 물어 경로를 채운다(물어본 건 기억)
    const pids = [...new Set(out.filter((x) => !x.parentReference?.path).map((x) => x.parentReference?.id).filter((id) => id && !flPids.has(id)))];
    await Promise.all(pids.map(async (id) => {
      try { const p = await G.get(`/drives/${flDrive()}/items/${id}?$select=name,root,parentReference`); flPids.set(id, p.root ? '' : [flPathOf(p), p.name].filter(Boolean).join('/')); } catch { /* 다음 검색 때 다시 */ }
    }));
    if (flS.q !== q) return;
    out.forEach((x) => { if (x.parentReference && !x.parentReference.path) x._where = flPids.get(x.parentReference.id) || ''; });
    // 주간회의 메뉴는 그 폴더 안 결과만, 공용 폴더는 숨긴 폴더(주간회의·_웍스·_홈페이지 미리보기)와 그 안 결과는 뺀다
    const inBase = (x) => { const w = flPathOf(x); return w === flM.base || w.startsWith(`${flM.base}/`); };
    flS.results = out.filter((x) => x.name && (flM.base ? inBase(x) : !FL_HIDE.some((n) => { const w = flPathOf(x); return (w === '' && x.name === n) || w === n || w.startsWith(`${n}/`); })));
  } catch (e) { if (flS.q === q) { flS.results = []; toast(e.message); } }
  flS.loading = false; flDraw();
}

/* ---------- 올리기: 버튼·끌어놓기, 4MB 넘으면 나눠 올리기 ---------- */
function filesUpload() {
  let inp = $('#fl-file');
  if (!inp) { // 공용 폴더 화면 밖에서 불렸을 때: 지금 경로(없으면 맨 위)에 올린다
    inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.hidden = true;
    inp.addEventListener('change', () => { const fs = [...inp.files]; inp.remove(); if (fs.length) flUpload(fs); });
    document.body.appendChild(inp);
  }
  inp.click();
}

// 공용 폴더 화면이면 카드 밖 빈 곳에 놓아도 지금 폴더에 올린다
let flDepth = 0, flDragT = null;
const flHasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const flDropCard = () => (flOnScreen() && !document.querySelector('.fl-pv-wrap') ? $('#fl-card') : null);
const flDropEnd = () => { flDepth = 0; clearTimeout(flDragT); $('#fl-card')?.classList.remove('drop'); };
const flDropShow = (card) => {
  if (card.classList.contains('drop')) return;
  const segs = flRel(flS.path) ? flRel(flS.path).split('/') : [];
  card.dataset.drop = `${segs[segs.length - 1] || flM.root}에 올리기`;
  card.classList.add('drop');
};
document.addEventListener('dragenter', (e) => {
  const card = flHasFiles(e) && flDropCard(); if (!card) return;
  e.preventDefault(); flDepth++; flDropShow(card);
});
// 공용 폴더·주간회의 화면에선 파일을 어디에 놓아도 브라우저가 그 파일로 이동하지 않게 막는다(미리보기가 열려 있어도)
document.addEventListener('dragover', (e) => {
  if (!flHasFiles(e) || !flOnScreen()) return;
  const card = flDropCard();
  e.preventDefault(); e.dataTransfer.dropEffect = card ? 'copy' : 'none';
  if (card) flDropShow(card); // dragleave로 잘못 꺼졌으면 다시 켠다
  clearTimeout(flDragT); flDragT = setTimeout(flDropEnd, 1000); // dragleave를 놓쳐도 덮개가 남지 않게
});
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) flDropEnd(); else if (flDepth && !--flDepth) flDropEnd(); }); // relatedTarget 없음 = 창 밖으로 나감
document.addEventListener('dragend', flDropEnd);
document.addEventListener('drop', (e) => {
  if (!flHasFiles(e) || !flOnScreen()) return;
  e.preventDefault(); flDropEnd();
  if (!flDropCard()) { if (document.querySelector('.fl-pv-wrap')) toast('미리보기를 닫고 놓아 주세요'); return; }
  const entries = [...(e.dataTransfer.items || [])].filter((x) => x.kind === 'file').map((x) => x.webkitGetAsEntry?.());
  const files = [...e.dataTransfer.files].filter((f, i) => !entries[i]?.isDirectory);
  if (files.length < e.dataTransfer.files.length) toast('폴더는 끌어놓을 수 없습니다. 파일만 올립니다');
  if (files.length) flUpload(files);
});

async function flUpload(files) {
  const path = flS.path || '';
  let box = document.querySelector('.fl-up');
  if (!box) { box = document.createElement('div'); box.className = 'fl-up'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
  const rows = files.map((f) => {
    const r = document.createElement('div'); r.className = 'fl-up-row';
    r.innerHTML = `<span class="nm">${esc(f.name)}</span><span class="pc">대기</span><span class="bar"><i></i></span>`;
    box.appendChild(r); return r;
  });
  let ok = 0;
  window.flUploading += files.length;
  for (let i = 0; i < files.length; i++) {
    const f = files[i], r = rows[i], set = (p, t) => { r.querySelector('i').style.width = `${p}%`; r.querySelector('.pc').textContent = t ?? `${Math.round(p)}%`; };
    let s = null;
    try {
      const target = `/drives/${flDrive()}/root:/${flEnc([path, f.name].filter(Boolean).join('/'))}:`;
      if (f.size <= FL_SMALL) {
        set(30);
        await G.put(`${target}/content?@microsoft.graph.conflictBehavior=rename`, f, { headers: { 'Content-Type': f.type || 'application/octet-stream' } });
      } else {
        s = await G.post(`${target}/createUploadSession`, { item: { '@microsoft.graph.conflictBehavior': 'rename' } });
        for (let at = 0; at < f.size; at += FL_CHUNK) {
          const end = Math.min(at + FL_CHUNK, f.size);
          // 업로드 주소는 미리 인증돼 있어 Authorization을 붙이면 안 된다. 조각마다 네트워크 오류·5xx·429면 잠시 뒤 두 번 더
          let res = null;
          for (let k = 0; k < 3; k++) {
            if (k) await new Promise((w) => setTimeout(w, 1500 * 2 ** (k - 1)));
            try { res = await fetch(s.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${at}-${end - 1}/${f.size}` }, body: f.slice(at, end), signal: AbortSignal.timeout ? AbortSignal.timeout(180000) : undefined }); } catch { res = null; continue; }
            if (res.ok || (res.status < 500 && res.status !== 429)) break;
          }
          if (!res?.ok) throw new Error(res ? `올리기 실패 (${res.status})` : '올리기 실패 (네트워크)');
          set((end / f.size) * 100);
        }
        s = null;
      }
      set(100, '완료'); r.classList.add('done'); ok++;
    } catch (e) {
      set(100, '실패'); r.classList.add('fail'); r.title = e.message;
      if (s?.uploadUrl) fetch(s.uploadUrl, { method: 'DELETE' }).catch(() => {}); // 끝내 실패한 업로드 세션은 지운다(조각이 남지 않게)
    } finally { window.flUploading--; }
  }
  if (ok) toast(`${ok}개를 올렸습니다`);
  if (path === flS.path && $('#fl-list')) { flS.at = 0; flLoad(); }
  setTimeout(() => { rows.forEach((r) => r.remove()); if (!box.children.length) box.remove(); }, 2500);
}
