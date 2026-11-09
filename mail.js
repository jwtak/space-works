/* SPACE WORKS — 메일 (받은편지함·읽기·쓰기·답장·전달·보내기)
   본문 HTML은 메인 화면에 넣지 않고 스크립트가 막힌 iframe(sandbox, CSP) 안에서만 보여 준다.
   보내기는 항상 확인창을 거친다. */
const MAIL_FOLDERS = [
  { id: 'inbox', name: '받은편지함', icon: 'inbox' },
  { id: 'sentitems', name: '보낸편지함', icon: 'send' },
  { id: 'drafts', name: '임시보관함', icon: 'file' },
  { id: 'deleteditems', name: '지운편지함', icon: 'trash' },
];
const MAIL_LIST_SEL = 'id,subject,from,toRecipients,receivedDateTime,sentDateTime,lastModifiedDateTime,bodyPreview,isRead,hasAttachments,isDraft,flag';
const MAIL_MAX_ATTACH = 3 * 1024 * 1024; // 한 번에 올릴 수 있는 첨부 크기 (그보다 큰 파일은 업로드 세션이 필요)
const MAIL_FILTERS = [{ k: 'all', label: '모든 메일' }, { k: 'unread', label: '안 읽은 메일' }, { k: 'att', label: '첨부 있는 메일' }];

const mailState = () => {
  const m = (ui.mail = ui.mail || { folder: 'inbox', q: '', list: [], next: null, sel: null, msg: null, atts: [], counts: {}, compose: null, view: 'list', remote: false, loading: false });
  m.checked = m.checked || new Set(); // 목록에서 체크한 메일 (일괄 읽음·삭제)
  m.filter = m.filter || 'all';
  return m;
};

/* ---------- 유틸 ---------- */
function mailTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
/* 데스크톱 목록 시각: 오늘 HH:MM, 올해 MM-DD HH:MM, 그 전 YY-MM-DD */
function mailTimeD(iso) {
  if (!iso) return '';
  const d = new Date(iso), n = new Date(), hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === n.toDateString()) return hm;
  if (d.getFullYear() === n.getFullYear()) return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
  return `${String(d.getFullYear()).slice(2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mailFullTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const mailWho = (r) => (r?.emailAddress ? r.emailAddress.name || r.emailAddress.address : '');
// "이름 <주소>" 문자열의 이름: 주소 칸은 , ; 로 나누므로 이름에 든 구분 기호는 공백으로 ("Smith, John" → Smith John)
const mailName = (n) => String(n || '').replace(/[,;<>"]+/g, ' ').replace(/\s+/g, ' ').trim();
const mailLabel = (name, address) => { const n = mailName(name); return n && n !== address ? `${n} <${address}>` : address; };
const mailAddr = (r) => (r?.emailAddress ? mailLabel(r.emailAddress.name, r.emailAddress.address) : '');
const mailAddrList = (arr) => (arr || []).map(mailAddr).join(', ');
const mailSize = (b) => (b < 1024 ? `${b}B` : b < 1048576 ? `${Math.round(b / 1024)}KB` : `${(b / 1048576).toFixed(1)}MB`);
const mailIsMobile = () => window.matchMedia('(max-width: 760px)').matches;

/* "이름 <주소>, 주소; 주소" → Graph recipients. 잘못된 주소가 있으면 오류 */
function mailParseAddrs(str, label) {
  const out = [];
  for (const raw of (str || '').split(/[,;\n]/)) {
    const t = raw.trim();
    if (!t) continue;
    const m = t.match(/^(.*?)\s*<([^>]+)>$/);
    const address = (m ? m[2] : t).trim(), name = m ? m[1].replace(/^"|"$/g, '').trim() : '';
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) throw new Error(`${label} 주소를 확인하세요: ${t}`);
    out.push({ emailAddress: name ? { address, name } : { address } });
  }
  return out;
}

function mailTextToHtml(text) {
  return `<div style="font-family:Pretendard,'Malgun Gothic',sans-serif;font-size:14px;line-height:1.6">${esc(text).replace(/\r?\n/g, '<br>')}</div>`;
}
/* 답장·전달 초안 본문(원문 인용 포함) 맨 앞에 내가 쓴 내용을 넣는다 */
function mailMergeBody(userHtml, quoteHtml) {
  if (!quoteHtml) return userHtml;
  const m = quoteHtml.match(/<body[^>]*>/i);
  return m ? quoteHtml.replace(m[0], `${m[0]}${userHtml}<br>`) : `${userHtml}<br>${quoteHtml}`;
}
/* HTML 초안을 편집용 텍스트로 (DOMParser는 스크립트를 실행하지 않는다) */
function mailHtmlToText(html) {
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<\/td>/gi, ' '), 'text/html');
  return (doc.body.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const mailTextHtml = (text) => (text || '').split(/\r?\n/).map((l) => `<div>${esc(l) || '<br>'}</div>`).join('');

/* 편집기(메인 문서의 contenteditable)에 넣을 HTML 정리: 스크립트·폼·프레임·이벤트 속성·위험한 주소를 뺀다.
   class·id도 지워 앱 스타일과 섞이지 않게 한다. 초안 불러오기·붙여넣기·서명에 쓴다. */
const MAIL_DROP_TAGS = 'script,style,link,meta,title,head,base,iframe,frame,frameset,object,embed,applet,form,input,button,textarea,select,option,svg,math,template,noscript,audio,video,source,track,portal';
function mailSanitize(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  doc.body.querySelectorAll(MAIL_DROP_TAGS).forEach((n) => n.remove());
  doc.body.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase(), v = a.value.trim().toLowerCase();
      if (n.startsWith('on') || ['id', 'class', 'srcdoc', 'formaction', 'contenteditable', 'tabindex'].includes(n)) el.removeAttribute(a.name);
      else if (['href', 'src', 'action', 'background', 'xlink:href'].includes(n) && !/^(https?:|mailto:|tel:|#|cid:)/.test(v) && !(n === 'src' && v.startsWith('data:image/'))) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

/* 서명: 회사 OneDrive /SPACE WORKS/data/signature.html (공개 저장소에 연락처를 올리지 않으려고 코드에 넣지 않는다) */
async function mailLoadSig() {
  const m = mailState();
  if (m.sig == null) {
    try { m.sig = mailSanitize((await STORE.readText('data/signature.html')).text || '').trim(); }
    catch { /* 못 읽었으면 다음에 다시 읽는다 */ }
  }
  return m.sig || '';
}
const mailSigBlock = (sig) => `<div data-sig="1">${sig}</div>`;
const mailHasSig = (html) => /data-sig=|SPACE(&nbsp;|\s| )INVESTMENT/i.test(html || '');
const MAIL_FONT = "Pretendard,'Malgun Gothic','맑은 고딕',sans-serif";

/* 쓰기 상태 → Graph body. 일반 텍스트 모드는 원문 인용이 없을 때만 Text로 보낸다 */
function mailComposeBody(c) {
  if (c.plain) return c.quote ? { contentType: 'HTML', content: mailMergeBody(mailTextToHtml(c.text), c.quote) } : { contentType: 'Text', content: c.text };
  return { contentType: 'HTML', content: mailMergeBody(`<div style="font-family:${MAIL_FONT};font-size:14px;line-height:1.6;color:#111827">${mailFixHtml(c.html)}</div>`, c.quote) };
}
/* 서명을 뺀 본문에 쓴 내용이 있는지 */
function mailTyped(c) {
  if (c.plain) return !!c.text.trim();
  const doc = new DOMParser().parseFromString(c.html || '', 'text/html');
  doc.body.querySelectorAll('[data-sig]').forEach((n) => n.remove());
  return !!(doc.body.textContent || '').trim() || !!doc.body.querySelector('img');
}
/* 닫으면 잃는 내용이 있는지: 마지막 저장 뒤 한 번이라도 고쳤거나(rev — 서명 칸만 고친 경우 포함, 사용자 11/9 '새로고침 때 물어야'),
   본문을 썼거나 첨부를 붙였거나 주소·제목이 처음과 다르면 */
const mailBase = (c) => [c.to, c.cc, c.bcc, c.subject].map((s) => (s || '').trim()).join('\n');
const mailDirty = (c) => !c.saved && !!(c.rev || mailTyped(c) || c.files.length || mailBase(c) !== c.base);
const mailEdited = (c) => { c.saved = false; c.rev = (c.rev || 0) + 1; };
const mailLockFiles = (c) => document.querySelectorAll('#mail-cf [data-rm]').forEach((b) => { b.disabled = !!(c.busy || c.sending); });

/* iframe 안에 들어갈 문서. 스크립트·폼·외부 요청은 막고, 외부 이미지는 사용자가 허용할 때만 */
function mailFrameDoc(html, allowRemote) {
  const csp = `default-src 'none'; img-src ${allowRemote ? 'https: http: ' : ''}data:; style-src 'unsafe-inline'; font-src data:`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="color-scheme" content="only light"><base target="_blank">
<style>:root{color-scheme:only light}html,body{margin:0}body{padding:20px 24px;font:14px/1.6 Pretendard,'Malgun Gothic',sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;font:inherit}a{color:#2563EB}
blockquote{margin:0 0 0 4px;padding-left:12px;border-left:2px solid #E5E7EB;color:#4B5563}
@media (max-width:600px){body{padding:16px;font-size:15px;line-height:1.65}}</style></head><body>${html}</body></html>`;
}

/* 폭을 고정해 만든 메일(안내문·뉴스레터)이 본문 칸보다 넓으면 칸 폭에 맞게 줄인다(폰에서 오른쪽이 잘리던 문제, 11/6).
   칸 안 스크립트는 여전히 막혀 있고(sandbox에 allow-scripts 없음, CSP), 바깥에서 폭만 재서 zoom을 건다. 이미지가 늦게 오면 다시 잰다 */
function mailFitFrame(fr) {
  const d = fr.contentDocument; if (!d || !d.documentElement) return;
  const fit = () => {
    const de = d.documentElement; de.style.zoom = '';
    const w = de.scrollWidth, cw = fr.clientWidth;
    if (cw && w > cw + 8) de.style.zoom = String(Math.max(0.4, cw / w));
  };
  fit();
  d.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', fit, { once: true }); });
  new ResizeObserver(fit).observe(fr); // 폰 가로·세로 전환, PC 창 크기 변경
}

/* 답장·전달 원문(Outlook createReply 본문)을 보통 메일처럼: 구분선(hr) 자리에 '-----Original Message-----' 줄, 원문 전체 왼쪽에 진한 세로선.
   보내는 메일에도 그대로 들어간다(사용자 11/9). hr이 없으면 머리글(divRplyFwdMsg)부터, 그것도 없으면 본문 전체를 감싼다 */
function mailQuoteWrap(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html'), body = doc.body;
  const top = (el) => { while (el && el.parentNode !== body) el = el.parentNode; return el; };
  let start = top(body.querySelector('hr')), drop = !!start;
  if (!start) start = top(body.querySelector('#divRplyFwdMsg, [id^="divRplyFwdMsg"]'));
  if (!start) start = [...body.childNodes].find((n) => n.nodeType === 1 && n.textContent.trim()) || body.firstChild;
  if (!start) return html;
  const box = doc.createElement('div');
  box.setAttribute('style', 'margin:16px 0 0 2px;padding-left:12px;border-left:2px solid #1F2937');
  const head = doc.createElement('div');
  head.setAttribute('style', 'margin-bottom:8px;color:#111827');
  head.textContent = '-----Original Message-----';
  box.appendChild(head);
  body.insertBefore(box, start);
  for (let n = box.nextSibling; n;) { const next = n.nextSibling; if (!(drop && n === start)) box.appendChild(n); else n.remove(); n = next; }
  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

/* 답장·전달의 원문 칸: 폭은 mailFitFrame처럼 줄이고, 높이는 내용만큼 늘려 칸 안 스크롤 없이 본문 아래로 이어지게 */
function mailFitQuote(fr) {
  const d = fr.contentDocument; if (!d || !d.documentElement) return;
  // 편집기 안에서는 원문 글 시작선을 입력 칸 글자와 맞춘다(입력 칸 왼쪽 여백 그대로, 위는 서명과 붙게)
  const rte = document.querySelector('#mail-rte');
  if (rte && fr.closest('.mail-editor')) d.body.style.padding = `4px ${getComputedStyle(rte).paddingRight} 20px ${getComputedStyle(rte).paddingLeft}`;
  mailFitFrame(fr);
  const fit = () => { fr.style.height = `${Math.ceil(d.documentElement.getBoundingClientRect().height * (Number(d.documentElement.style.zoom) || 1)) + 4}px`; };
  fit();
  d.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', fit, { once: true }); });
  new ResizeObserver(fit).observe(d.documentElement);
}

function mailConfirm({ title, rows, ok }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'mail-modal';
    wrap.innerHTML = `<div class="mail-dialog" role="dialog" aria-modal="true" aria-labelledby="mail-dlg-t">
      <h3 id="mail-dlg-t">${esc(title)}</h3>
      <dl>${rows.filter((r) => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="mail-dialog-actions"><button class="btn" type="button" data-r="0">취소</button><button class="btn primary" type="button" data-r="1">${esc(ok)}</button></div></div>`;
    const done = (v, viaBack) => { if (!wrap.isConnected) return; wrap.remove(); document.removeEventListener('keydown', onKey); if (viaBack !== true) off(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    const off = pushLayer(() => done(false, true), () => done(false, true)); // 뒤로 가기 = 취소
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="1"]').focus();
  });
}

/* 일반 창(미리보기·주소록·원문). [data-close]나 바깥을 누르면 닫힌다 */
function mailModal(html, cls = '') {
  const wrap = document.createElement('div');
  wrap.className = 'mail-modal';
  wrap.innerHTML = `<div class="mail-dialog ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  const onKey = (e) => { if (e.key === 'Escape') wrap.close(); };
  wrap.close = (viaBack) => { if (!wrap.isConnected) return; wrap.remove(); document.removeEventListener('keydown', onKey); if (viaBack !== true) off(); };
  const off = pushLayer(() => wrap.close(true), () => wrap.close(true));
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  return wrap;
}

/* 버튼 아래로 펼치는 메뉴(이동·다른 작업). 고른 항목의 k, 닫으면 null */
function mailMenu(anchor, items) {
  return new Promise((resolve) => {
    if (Date.now() - (anchor.mailClosedAt || 0) < 400) return resolve(null); // 열린 메뉴의 버튼을 다시 누른 것 = 닫기
    document.querySelectorAll('.mail-menu').forEach((x) => x.dispatchEvent(new Event('mail-close')));
    const menu = document.createElement('div');
    menu.className = 'mail-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items.map((it) => (it.sep ? '<hr>' : `<button type="button" role="menuitem" data-k="${esc(it.k)}">${it.icon ? mi(it.icon) : ''}<span>${esc(it.label)}</span></button>`)).join('');
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 248))}px`;
    menu.style.top = `${r.bottom + 6}px`;
    anchor.setAttribute('aria-expanded', 'true');
    const done = (v, viaBack) => {
      if (!menu.isConnected) return;
      menu.remove(); anchor.setAttribute('aria-expanded', 'false'); anchor.mailClosedAt = Date.now();
      document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey);
      if (viaBack !== true) off();
      resolve(v);
    };
    const onDown = (e) => { if (!menu.contains(e.target)) done(null); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    const off = pushLayer(() => done(null, true), () => done(null, true));
    menu.addEventListener('mail-close', () => done(null));
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) done(b.dataset.k); });
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(menu);
    menu.querySelector('button')?.focus();
  });
}

/* ---------- 화면 ---------- */
async function renderMail() {
  const m = mailState();
  PAGE.innerHTML = `
    <div class="card mail-shell" id="mail-shell">
      <aside class="mail-folders">
        <button class="btn primary mail-write" type="button" id="mail-new">${ico('plus', 'sm')}메일 쓰기</button>
        <nav class="mail-fnav" id="mail-fnav"></nav>
      </aside>
      <section class="mail-list">
        <div class="mail-dhead">
          <h2 id="mail-ltitle"></h2><span class="mail-cnt" id="mail-cnt"></span>
          <form class="mail-search" id="mail-sf" role="search">
            <span class="mail-search-ic">${ico('search', 'sm')}</span>
            <input class="input" id="mail-q" type="search" placeholder="메일 검색" value="${esc(m.q)}" autocomplete="off">
            <button class="iconbtn mail-ref-m" type="button" data-ref aria-label="새로고침">${ico('refresh', 'sm')}</button>
          </form>
        </div>
        <div class="mail-bar">
          <input type="checkbox" class="check mail-ckall" id="mail-ckall" aria-label="전체 선택">
          <select class="select mail-filter" id="mail-filter" aria-label="보기">${MAIL_FILTERS.map((f) => `<option value="${f.k}" ${m.filter === f.k ? 'selected' : ''}>${f.label}</option>`).join('')}</select>
          <span class="mail-bulk" id="mail-bulk" hidden><span class="mail-bulk-n" id="mail-bulk-n"></span>
            <button class="btn sm" type="button" data-bulk="read">읽음 표시</button>
            <button class="btn sm" type="button" data-bulk="delete">삭제</button></span>
          <button class="iconbtn mail-bar-r" type="button" data-ref title="새로고침" aria-label="새로고침">${ico('refresh', 'sm')}</button>
        </div>
        <ul class="mail-items" id="mail-items"></ul>
      </section>
      <section class="mail-pane" id="mail-pane"></section>
      <button class="mail-fab" type="button" id="mail-fab" aria-label="메일 쓰기">${ico('plus', 'lg')}</button>
    </div>`;
  $('#mail-new').addEventListener('click', () => mailOpenCompose({ mode: 'new' }));
  $('#mail-fab').addEventListener('click', () => mailOpenCompose({ mode: 'new' }));
  PAGE.querySelectorAll('[data-ref]').forEach((b) => b.addEventListener('click', () => { mailLoadCounts(); mailLoadList(); }));
  $('#mail-sf').addEventListener('submit', (e) => { e.preventDefault(); m.q = $('#mail-q').value.trim(); m.sel = null; m.msg = null; mailLoadList(); });
  $('#mail-q').addEventListener('search', () => { if (!$('#mail-q').value) { m.q = ''; mailLoadList(); } });
  $('#mail-filter').addEventListener('change', (e) => { m.filter = e.target.value; mailLoadList(); });
  $('#mail-ckall').addEventListener('change', (e) => {
    m.checked = new Set(e.target.checked ? m.list.map((x) => x.id) : []);
    mailDrawList();
  });
  PAGE.querySelectorAll('[data-bulk]').forEach((b) => b.addEventListener('click', () => mailBulk(b.dataset.bulk)));
  mailDrawShell();
  setTimeout(() => { if (route() === 'mail') mailSyncLayers(); }); // 다른 메뉴에서 돌아왔으면 그 기록에 번호가 붙은 뒤 겹을 다시 쌓는다
  mailDrawFolders();
  mailDrawPane();
  mailLoadCounts();
  mailLoadSig();
  await mailLoadList();
}

function mailDrawShell() {
  const sh = $('#mail-shell'); if (!sh) return;
  sh.dataset.view = ui.mail.compose ? 'compose' : ui.mail.view;
  sh.classList.toggle('composing', !!ui.mail.compose);
  mailSyncBody();
  mailSyncLayers();
}

/* 폰에서 읽기·쓰기 화면은 하단 탭바 자리에 메일 전용 바를 쓴다 (mail.css가 body 클래스로 탭바를 가린다) */
function mailSyncBody() {
  const m = ui.mail, on = route() === 'mail' && !!m;
  document.body.classList.toggle('mail-reading', on && !m.compose && m.view === 'read');
  document.body.classList.toggle('mail-composing', on && !!m.compose);
}
window.addEventListener('hashchange', () => { if (route() !== 'mail') document.body.classList.remove('mail-reading', 'mail-composing'); });
// 쓰던 메일이 있으면 창 닫기·새로 고침 전에 묻는다 (다른 메뉴로 옮겨도 쓰기 상태는 남아 있다)
window.addEventListener('beforeunload', (e) => {
  const c = typeof ui !== 'undefined' && ui.mail?.compose;
  if (c && (c.busy || c.sending || mailDirty(c))) { e.preventDefault(); e.returnValue = ''; }
});

/* 뒤로 가기: 메일 읽기·쓰기는 각각 한 겹(pushLayer) — 뒤로 가면 쓰기 → 읽던 메일 → 목록 순으로 닫힌다 */
const mailReadOn = (m) => m.view === 'read' || (!!m.compose && m.backTo === 'read');
function mailSyncLayers() { // 앱 안 버튼(목록·취소·보내기·삭제)으로 닫았으면 그 겹을 내린다
  const m = ui.mail;
  if (m.composeOff && !m.compose) { m.composeOff(); m.composeOff = null; }
  if (m.readOff && !mailReadOn(m)) { m.readOff(); m.readOff = null; }
  // 열려 있는데 겹이 없으면(새로 열었거나 다른 메뉴에 다녀옴) 읽기 → 쓰기 순으로 쌓는다. 메뉴를 막 옮겨 기록 번호가 없으면 renderMail이 뒤에 다시 부른다
  if (route() !== 'mail' || !history.state?.seq) return;
  if (!m.readOff && mailReadOn(m)) m.readOff = pushLayer(() => { m.readOff = null; if (m.view === 'read') mailBackToList(); }, () => { m.readOff = null; if (!m.compose) m.view = 'list'; });
  if (!m.composeOff && m.compose) {
    m.composeOff = pushLayer(async () => {
      if (!(await mailLeaveCompose())) return false;
      m.composeOff = null; mailAfterCompose();
    }, () => { m.composeOff = null; });
  }
}
function mailBackToList() {
  const m = ui.mail;
  m.view = 'list'; mailDrawShell();
  const box = $('#mail-items'); if (box) box.scrollTop = m.scroll || 0;
}

function mailDrawFolders() {
  const m = ui.mail;
  if (m.counts.inbox && typeof setMailCnt === 'function') setMailCnt(m.counts.inbox.unread);
  const nav = $('#mail-fnav'); if (!nav) return;
  nav.innerHTML = MAIL_FOLDERS.map((f) => {
    const c = m.counts[f.id];
    const n = f.id === 'drafts' ? c?.total : c?.unread;
    return `<button type="button" class="mail-f ${m.folder === f.id && !m.compose ? 'on' : ''}" data-f="${f.id}">${ico(f.icon, 'sm')}<span>${f.name}</span>${n ? `<span class="mail-fc">${n}</span>` : ''}</button>`;
  }).join('');
  nav.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', async () => {
    if (m.compose && !(await mailLeaveCompose())) return;
    m.folder = b.dataset.f; m.sel = null; m.msg = null; m.q = ''; m.view = 'list'; m.scroll = 0;
    const q = $('#mail-q'); if (q) q.value = '';
    mailDrawShell(); mailDrawFolders(); mailDrawPane(); mailLoadList();
  }));
  mailDrawCount();
}

/* 본문 머리의 개수 알약: 안 읽음 / 전체 (임시보관함은 전체만) */
function mailDrawCount() {
  const el = $('#mail-cnt'); if (!el) return;
  const m = ui.mail, c = m.counts[m.folder];
  if (!c || m.q) { el.hidden = true; return; }
  el.hidden = false;
  const n = (v) => Number(v || 0).toLocaleString('ko-KR');
  el.innerHTML = m.folder === 'drafts' || m.folder === 'sentitems' ? n(c.total) : `<b>${n(c.unread)}</b> / ${n(c.total)}`;
}

/* 체크한 메일 일괄 처리: read = 읽음 표시, delete = 지운편지함으로(지운편지함에선 영구 삭제) */
async function mailBulk(act) {
  const m = ui.mail, ids = [...m.checked];
  if (!ids.length) return;
  const purge = act === 'delete' && m.folder === 'deleteditems';
  if (purge && !(await mailConfirm({ title: `${ids.length}개를 영구 삭제할까요?`, rows: [], ok: '영구 삭제' }))) return;
  try {
    const enc = encodeURIComponent;
    if (act === 'read') {
      await Promise.all(ids.map((id) => G.patch(`/me/messages/${enc(id)}`, { isRead: true })));
      m.list.forEach((x) => { if (m.checked.has(x.id)) x.isRead = true; });
    } else {
      await Promise.all(ids.map((id) => (purge ? G.del(`/me/messages/${enc(id)}`) : G.post(`/me/messages/${enc(id)}/move`, { destinationId: 'deleteditems' }))));
      m.list = m.list.filter((x) => !m.checked.has(x.id));
      toast(purge ? '삭제했습니다' : '지운편지함으로 옮겼습니다');
    }
    m.checked.clear();
    mailDrawList(); mailLoadCounts();
  } catch (e) { toast(e.message); mailLoadList(); }
}

async function mailLoadCounts() {
  try {
    const res = await Promise.all(MAIL_FOLDERS.map((f) => G.get(`/me/mailFolders/${f.id}?$select=unreadItemCount,totalItemCount`).catch(() => null)));
    MAIL_FOLDERS.forEach((f, i) => { if (res[i]) ui.mail.counts[f.id] = { unread: res[i].unreadItemCount, total: res[i].totalItemCount }; });
    if (route() === 'mail') mailDrawFolders();
  } catch { /* 개수는 없어도 된다 */ }
}

async function mailLoadList(more) {
  const m = ui.mail;
  const box = $('#mail-items'); if (!box) return;
  const folderName = MAIL_FOLDERS.find((f) => f.id === m.folder)?.name || '';
  $('#mail-ltitle').textContent = m.q ? `"${m.q}" 검색 결과` : folderName;
  mailDrawCount();
  // 늦게 온 이전 요청(다른 폴더·검색·보기, 지난 "더 보기")이 새 목록을 덮지 않게 마지막 요청만 반영
  const my = (m.listSeq = (m.listSeq || 0) + 1), key = [m.folder, m.q, m.filter].join('\n');
  if (!more) { m.list = []; m.next = null; m.checked.clear(); m.listKey = key; box.innerHTML = '<li class="empty">불러오는 중…</li>'; }
  m.loading = true;
  const flt = $('#mail-filter'); if (flt) flt.disabled = !!m.q; // $search 는 $filter 와 같이 못 쓴다
  try {
    let url;
    if (more && m.next) url = m.next;
    else {
      const q = new URLSearchParams({ $top: '50', $select: MAIL_LIST_SEL });
      if (m.q) q.set('$search', `"${m.q.replace(/"/g, '')}"`); // $search 는 $orderby·$filter 와 함께 못 쓴다 (관련도 순)
      else {
        const dateKey = { sentitems: 'sentDateTime', drafts: 'lastModifiedDateTime' }[m.folder] || 'receivedDateTime';
        q.set('$orderby', `${dateKey} desc`);
        // $filter 와 $orderby 를 같이 쓰려면 정렬 속성이 $filter 맨 앞에 있어야 한다 (Graph 제약)
        const extra = { unread: 'isRead eq false', att: 'hasAttachments eq true' }[m.filter];
        if (extra) q.set('$filter', `${dateKey} ge 1900-01-01T00:00:00Z and ${extra}`);
      }
      url = `/me/mailFolders/${m.folder}/messages?${q}`;
    }
    const j = await G.get(url);
    if (my !== m.listSeq || m.listKey !== key || route() !== 'mail') return;
    m.list = more ? m.list.concat(j.value) : j.value;
    m.next = j['@odata.nextLink'] || null;
    mailDrawList();
  } catch (e) {
    if (my === m.listSeq && box.isConnected) box.innerHTML = `<li class="empty">${esc(e.message)}</li>`;
  } finally { if (my === m.listSeq) m.loading = false; }
}

function mailDrawList() {
  const m = ui.mail, box = $('#mail-items'); if (!box) return;
  const toSide = m.folder === 'sentitems' || m.folder === 'drafts';
  mailDrawBulk();
  if (!m.list.length) { box.innerHTML = `<li class="empty">${m.q ? '검색 결과 없음' : '메일 없음'}</li>`; return; }
  box.innerHTML = m.list.map((x) => {
    const who = toSide ? (x.toRecipients || []).map(mailWho).join(', ') || '(받는 사람 없음)' : mailWho(x.from) || '(보낸 사람 없음)';
    const unread = !x.isRead && !toSide, flagged = x.flag?.flagStatus === 'flagged';
    const iso = toSide ? x.sentDateTime || x.lastModifiedDateTime || x.receivedDateTime : x.receivedDateTime;
    return `<li class="mail-item ${unread ? 'unread' : ''} ${m.sel === x.id ? 'on' : ''} ${m.checked.has(x.id) ? 'ck' : ''}" data-id="${esc(x.id)}">
      <input type="checkbox" class="check mail-ck" data-ck="${esc(x.id)}" ${m.checked.has(x.id) ? 'checked' : ''} aria-label="선택">
      <button type="button" class="mail-lstar ${flagged ? 'on' : ''}" data-star="${esc(x.id)}" aria-pressed="${flagged}" aria-label="중요 표시">${mi('star')}</button>
      <span class="mail-st ${unread ? 'unread' : ''}" title="${unread ? '안 읽음' : '읽음'}">${mi(unread ? 'env' : 'envo')}</span>
      <div class="mail-r1"><span class="mail-who">${x.isDraft && m.folder === 'drafts' ? '<span class="mail-draft">임시</span>' : ''}${esc(who)}</span><span class="mail-tm"><span class="m">${mailTime(iso)}</span><span class="d">${mailTimeD(iso)}</span></span></div>
      <span class="mail-lclip">${x.hasAttachments ? `<span title="첨부">${ico('clip', 'sm')}</span>` : ''}</span>
      <div class="mail-subj">${x.hasAttachments ? `<span class="mail-clip" title="첨부">${ico('clip', 'sm')}</span>` : ''}<span class="mail-subj-t">${esc(x.subject || '(제목 없음)')}</span></div>
      <div class="mail-pv">${esc((x.bodyPreview || '').replace(/\s+/g, ' ').slice(0, 120))}</div></li>`;
  }).join('') + (m.next ? '<li class="mail-more"><button class="btn sm" type="button" id="mail-more">더 보기</button></li>' : '');
  box.querySelectorAll('[data-id]').forEach((li) => li.addEventListener('click', (e) => {
    if (e.target.closest('.mail-ck, .mail-lstar')) return;
    mailOpen(li.dataset.id);
  }));
  box.querySelectorAll('[data-ck]').forEach((ck) => ck.addEventListener('change', () => {
    if (ck.checked) m.checked.add(ck.dataset.ck); else m.checked.delete(ck.dataset.ck);
    ck.closest('.mail-item').classList.toggle('ck', ck.checked);
    mailDrawBulk();
  }));
  box.querySelectorAll('[data-star]').forEach((b) => b.addEventListener('click', async () => {
    const x = m.list.find((i) => i.id === b.dataset.star); if (!x) return;
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    try { await G.patch(`/me/messages/${encodeURIComponent(x.id)}`, { flag: { flagStatus: on ? 'flagged' : 'notFlagged' } }); x.flag = { flagStatus: on ? 'flagged' : 'notFlagged' }; }
    catch (err) { b.classList.toggle('on', !on); b.setAttribute('aria-pressed', String(!on)); toast(err.message); }
  }));
  const more = $('#mail-more'); if (more) more.addEventListener('click', () => { more.disabled = true; mailLoadList(true); });
}

/* 도구 줄: 체크한 게 있으면 일괄 작업 버튼을 보인다 */
function mailDrawBulk() {
  const m = ui.mail, n = m.checked.size;
  const bulk = $('#mail-bulk'), all = $('#mail-ckall');
  if (bulk) { bulk.hidden = !n; $('#mail-bulk-n').textContent = `${n}개 선택`; }
  if (all) { all.checked = !!n && n === m.list.length; all.indeterminate = !!n && n < m.list.length; }
}

async function mailOpen(id) {
  const m = ui.mail;
  if (m.compose && !(await mailLeaveCompose())) return;
  const item = m.list.find((x) => x.id === id);
  if (m.folder === 'drafts' && item?.isDraft) return mailOpenCompose({ mode: 'draft', id });
  const box = $('#mail-items'); if (box && m.view !== 'read') m.scroll = box.scrollTop; // ← 목록으로 돌아올 때 같은 위치
  m.sel = id; m.msg = null; m.atts = []; m.view = 'read';
  m.remote = m.folder !== 'junkemail'; // 외부 이미지는 기본으로 보여 주고(사용자 11/9), 스팸 메일함만 막아 둔다(추적 이미지)
  const folder = m.folder; // 안 읽음 개수는 연 폴더 기준 (읽음 처리 응답 전에 폴더를 옮겨도)
  mailDrawShell(); mailDrawList(); mailDrawPane();
  try {
    const [msg, atts] = await Promise.all([
      G.get(`/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,body,hasAttachments,isRead,isDraft,webLink,flag`),
      G.get(`/me/messages/${encodeURIComponent(id)}/attachments?$select=id,name,size,contentType,isInline`).then((r) => r.value).catch(() => []),
    ]);
    if (m.sel !== id) return;
    // 본문 속 cid: 이미지(서명 로고 등)는 첨부에서 꺼내 data: 주소로 바꾼다. 본문에 실제로 쓰인 것만 첨부 목록에서 숨긴다
    const used = new Set();
    if (msg.body?.contentType === 'html' && /cid:/i.test(msg.body.content)) {
      for (const a of atts.filter((x) => x.isInline && x.size < MAIL_MAX_ATTACH)) {
        try {
          const full = await G.get(`/me/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(a.id)}`);
          if (full.contentId && full.contentBytes && msg.body.content.includes(`cid:${full.contentId}`)) {
            msg.body.content = msg.body.content.split(`cid:${full.contentId}`).join(`data:${full.contentType || 'image/png'};base64,${full.contentBytes}`);
            used.add(a.id);
          }
        } catch { /* 이미지 하나 실패해도 본문은 보인다 */ }
      }
    }
    if (m.sel !== id) return;
    m.msg = msg; m.atts = atts.filter((a) => !used.has(a.id));
    mailDrawPane();
    if (!msg.isRead) {
      G.patch(`/me/messages/${encodeURIComponent(id)}`, { isRead: true }).then(() => {
        const it = m.list.find((x) => x.id === id) || item;
        if (msg.isRead || (it && it.isRead)) return; // 그새 다른 데서 읽음 처리했으면 개수를 또 빼지 않는다
        msg.isRead = true; if (it) it.isRead = true;
        const c = m.counts[folder]; if (c && c.unread) c.unread -= 1;
        if (route() === 'mail') { mailDrawList(); mailDrawFolders(); }
      }).catch(() => {});
    }
  } catch (e) {
    const p = $('#mail-pane'); if (p) p.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* 메일 화면 전용 아이콘 (index.html 공용 심볼에 없는 것) */
const MAIL_ICONS = {
  more: '<circle cx="12" cy="5.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.2" fill="currentColor" stroke="none"/>',
  star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  plusc: '<circle cx="12" cy="12" r="8"/><path d="M12 8.5v7M8.5 12h7"/>',
  camera: '<path d="M4.5 8.5h3l1.5-2.5h6l1.5 2.5h3v10h-15z"/><circle cx="12" cy="13" r="3.2"/>',
  dl: '<path d="M12 4.5v10M8 10.5l4 4 4-4M5 19.5h14"/>',
  doc: '<path d="M7 3.5h7l4 4v13H7z"/><path d="M14 3.5v4h4"/>',
  env: '<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="m4 7 8 6 8-6"/>', // 안 읽음: 닫힌 봉투
  envo: '<path d="M3.5 10.5 12 5l8.5 5.5V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="m4 11 8 5.5 8-5.5"/>', // 읽음: 열린 봉투
  caret: '<path d="M7 10h10l-5 6z" fill="currentColor" stroke="none"/>',
  up: '<path d="m7 14 5-5 5 5"/>',
  list: '<path d="M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
  pc: '<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M9 19.5h6M12 15.5v4"/>',
  starx: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/><path d="M4 4l16 16"/>',
  src: '<path d="m9 8-4 4 4 4M15 8l4 4-4 4"/>',
  ul: '<path d="M10 7h10M10 12h10M10 17h10"/><circle cx="5.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="5.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="5.5" cy="17" r="1.2" fill="currentColor" stroke="none"/>',
  ol: '<path d="M10 7h10M10 12h10M10 17h10M4.5 5.5 6 5v4M4.5 14h2l-2 3.5h2"/>',
  alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  outdent: '<path d="M4 6h16M11 10h9M11 14h9M4 18h16M7.5 9.5 4.5 12l3 2.5"/>',
  indent: '<path d="M4 6h16M11 10h9M11 14h9M4 18h16M4.5 9.5l3 2.5-3 2.5"/>',
  link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
  hr: '<path d="M4 12h16"/>',
  undo: '<path d="M9 6 5 10l4 4"/><path d="M5 10h9.5a4.5 4.5 0 0 1 0 9H11"/>',
  redo: '<path d="m15 6 4 4-4 4"/><path d="M19 10H9.5a4.5 4.5 0 0 0 0 9H13"/>',
  clear: '<path d="M5 7V5h12v2M11 5 8 19M5 19h6M15 13l5 5M20 13l-5 5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  marker: '<path d="m14.5 4.5 4 4-7.5 7.5H7v-4z"/><path d="M5 19.5h5"/>',
  table: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 10h16M4 14.5h16M9.5 5v14M14.5 5v14"/>',
  rowUp: '<rect x="4" y="11" width="16" height="8" rx="1"/><path d="M12 3.5v5M9.5 6h5"/>',
  rowDown: '<rect x="4" y="5" width="16" height="8" rx="1"/><path d="M12 15.5v5M9.5 18h5"/>',
  colLeft: '<rect x="11" y="4" width="8" height="16" rx="1"/><path d="M3.5 12h5M6 9.5v5"/>',
  colRight: '<rect x="5" y="4" width="8" height="16" rx="1"/><path d="M15.5 12h5M18 9.5v5"/>',
  rowDel: '<rect x="4" y="8" width="16" height="8" rx="1"/><path d="M9.5 12h5"/>',
  colDel: '<rect x="8" y="4" width="8" height="16" rx="1"/><path d="M10 12h4"/>',
  cell: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M4 12h16M12 5v14"/><path d="M4.5 5.5h7v6h-7z" fill="currentColor" stroke="none" opacity=".35"/>',
  tableDel: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M9 9.5l6 5M15 9.5l-6 5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
};
const mi = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${MAIL_ICONS[n]}</svg>`;
function mailExtColor(name) {
  const e = (name.split('.').pop() || '').toLowerCase();
  if (e === 'pdf') return '#DC2626';
  if (['xls', 'xlsx', 'csv'].includes(e)) return '#15803D';
  if (['doc', 'docx', 'hwp', 'hwpx', 'txt'].includes(e)) return '#2563EB';
  if (['ppt', 'pptx'].includes(e)) return '#EA580C';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(e)) return '#7C3AED';
  return '#6B7280';
}
function mailDateLine(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}<span>${WD[d.getDay()]}요일</span>${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/* 폰용 동작 목록(바텀시트). 고른 항목의 k, 닫으면 null */
function mailSheet(items) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'mail-modal mail-sheet-wrap';
    wrap.innerHTML = `<div class="mail-dialog mail-sheet" role="menu">${items.map((it) => `<button type="button" role="menuitem" data-k="${it.k}">${esc(it.label)}</button>`).join('')}<button type="button" class="mail-sheet-x" data-k="">닫기</button></div>`;
    const done = (v, viaBack) => { if (!wrap.isConnected) return; wrap.remove(); document.removeEventListener('keydown', onKey); if (viaBack !== true) off(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    const off = pushLayer(() => done(null, true), () => done(null, true));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) return done(null); const b = e.target.closest('[data-k]'); if (b) done(b.dataset.k || null); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
  });
}

function mailDrawPane() {
  const m = ui.mail, pane = $('#mail-pane'); if (!pane) return;
  if (m.compose) return mailDrawCompose();
  if (!m.sel) { pane.innerHTML = `<div class="mail-blank">${ico('mail', 'lg')}<span>메일을 선택하세요</span></div>`; return; }
  if (!m.msg) { pane.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
  const x = m.msg, html = x.body?.contentType === 'html' ? x.body.content : `<pre>${esc(x.body?.content || '')}</pre>`;
  const hasRemote = /<img[^>]+src\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i.test(html);
  const inTrash = m.folder === 'deleteditems';
  const flagged = x.flag?.flagStatus === 'flagged';
  const fromName = x.from?.emailAddress?.name || x.from?.emailAddress?.address || '(보낸 사람 없음)';
  const big = mailBigFiles(html), attN = m.atts.length + big.length;
  const attTotal = [...m.atts, ...big].reduce((s, a) => s + (a.size || 0), 0);
  const bigTag = (b) => `<span class="mail-big${b.expired ? ' x' : ''}">${b.expired ? '기한 지남' : `대용량${b.exp ? ` ~${b.exp.slice(5)}` : ''}`}</span>`;
  const idx = m.list.findIndex((i) => i.id === x.id);
  const prevId = idx > 0 ? m.list[idx - 1].id : null, nextId = idx >= 0 && idx < m.list.length - 1 ? m.list[idx + 1].id : null;
  pane.innerHTML = `
    <div class="mail-mhead">
      <button class="iconbtn" type="button" id="mail-mback" aria-label="목록">${ico('left')}</button>
      <span class="mail-mhead-r">
        <button class="iconbtn" type="button" data-act="reply" aria-label="답장">${ico('reply')}</button>
        <button class="iconbtn" type="button" data-act="${inTrash ? 'purge' : 'delete'}" aria-label="${inTrash ? '영구 삭제' : '삭제'}">${ico('trash')}</button>
        <button class="iconbtn" type="button" id="mail-rmore" aria-label="더보기">${mi('more')}</button>
      </span>
    </div>
    <div class="mail-rhead" id="mail-rhead">
      <div class="mail-tools">
        <button class="mail-tbtn mail-tlist" type="button" id="mail-back">${mi('list')}목록</button>
        <button class="mail-tbtn" type="button" data-act="reply">답장</button>
        <button class="mail-tbtn" type="button" data-act="replyAll">전체답장</button>
        <button class="mail-tbtn" type="button" data-act="forward">전달</button>
        <button class="mail-tbtn" type="button" data-act="${inTrash ? 'purge' : 'delete'}">${inTrash ? '영구 삭제' : '삭제'}</button>
        <button class="mail-tbtn" type="button" id="mail-move" aria-haspopup="menu" aria-expanded="false">이동${mi('caret', 'caret')}</button>
        <button class="mail-tbtn" type="button" id="mail-print">인쇄</button>
        <button class="mail-tbtn" type="button" id="mail-other" aria-haspopup="menu" aria-expanded="false">다른 작업${mi('caret', 'caret')}</button>
        <span class="mail-tools-r">
          <button class="iconbtn mail-sq" type="button" id="mail-prev" title="이전 메일" aria-label="이전 메일" ${prevId ? '' : 'disabled'}>${mi('up')}</button>
          <button class="iconbtn mail-sq" type="button" id="mail-next" title="다음 메일" aria-label="다음 메일" ${nextId ? '' : 'disabled'}>${mi('down')}</button>
        </span>
      </div>
      <div class="mail-rsubj-row">
        <h2 class="mail-rsubj">${esc(x.subject || '(제목 없음)')}</h2>
        <button class="iconbtn mail-flag ${flagged ? 'on' : ''}" type="button" id="mail-flag" aria-pressed="${flagged}" aria-label="중요 표시">${mi('star')}</button>
      </div>
      <div class="mail-mdate">${mailDateLine(x.receivedDateTime || x.sentDateTime)}</div>
      <div class="mail-mfrom">
        <span class="mail-mlbl">보낸 사람</span>
        <span class="mail-chip">${esc(fromName)}</span>
        <button class="iconbtn mail-more-tg" type="button" id="mail-more-tg" aria-expanded="false" aria-label="주소 자세히">${mi('down')}</button>
      </div>
      <dl class="mail-meta">
        <dt>보낸 사람</dt><dd>${esc(mailAddr(x.from))}</dd>
        <dt>받는 사람</dt><dd>${esc(mailAddrList(x.toRecipients))}</dd>
        ${x.ccRecipients?.length ? `<dt>참조</dt><dd>${esc(mailAddrList(x.ccRecipients))}</dd>` : ''}
        ${x.bccRecipients?.length ? `<dt>숨은참조</dt><dd>${esc(mailAddrList(x.bccRecipients))}</dd>` : ''}
        <dt class="mail-meta-d">날짜</dt><dd class="mail-meta-d">${mailFullTime(x.receivedDateTime || x.sentDateTime)}</dd>
      </dl>
      ${attN ? `<div class="mail-abox ${m.attFold ? '' : 'open'}" id="mail-abox">
        <div class="mail-abox-h"><button type="button" class="mail-abox-tg" id="mail-abox-tg" aria-expanded="${!m.attFold}">${mi('caret', 'caret')}<b>첨부 ${attN}개</b><span class="muted">(${mailSize(attTotal)})</span></button><button type="button" class="mail-tbtn" data-saveall>모두 저장</button></div>
        <ul class="mail-abox-l">${m.atts.map((a) => `<li><span class="mail-fic" style="color:${mailExtColor(a.name)}">${mi('doc')}</span><span class="mail-abox-n">${esc(a.name)}</span><span class="muted">${mailSize(a.size)}</span><span class="mail-abox-a">${mailPvKind(a.name) ? `<button type="button" class="mail-linkbtn" data-pv="${esc(a.id)}">미리보기</button>` : ''}<button type="button" class="mail-linkbtn" data-att="${esc(a.id)}">저장</button></span></li>`).join('')}${big.map((b, i) => `<li><span class="mail-fic" style="color:${mailExtColor(b.name)}">${mi('doc')}</span><span class="mail-abox-n">${esc(b.name)}</span><span class="muted">${mailSize(b.size)}</span>${bigTag(b)}<span class="mail-abox-a">${b.expired ? '' : `<button type="button" class="mail-linkbtn" data-big="${i}">저장</button>`}</span></li>`).join('')}</ul>
      </div>
      <div class="mail-matts">
        <div class="mail-matts-h"><span>첨부 ${attN}개 <span class="muted">(${mailSize(attTotal)})</span></span><button type="button" class="mail-linkbtn" data-saveall>모두 저장</button></div>
        ${m.atts.map((a) => `<button type="button" class="mail-matt" data-${mailPvKind(a.name) ? 'pv' : 'att'}="${esc(a.id)}"><span class="mail-fic" style="color:${mailExtColor(a.name)}">${mi('doc')}</span><span class="mail-matt-n">${esc(a.name)}</span><span class="muted">(${mailSize(a.size)})</span><span class="mail-matt-dl">${mi(mailPvKind(a.name) ? 'eye' : 'dl')}</span></button>`).join('')}
        ${big.map((b, i) => `<button type="button" class="mail-matt" ${b.expired ? 'disabled' : `data-big="${i}"`}><span class="mail-fic" style="color:${mailExtColor(b.name)}">${mi('doc')}</span><span class="mail-matt-n">${esc(b.name)}</span><span class="muted">(${mailSize(b.size)})</span>${bigTag(b)}<span class="mail-matt-dl">${mi('dl')}</span></button>`).join('')}
      </div>` : ''}
      ${hasRemote && !m.remote ? '<div class="mail-remote">외부 이미지 차단됨 <button class="btn sm ghost" type="button" id="mail-remote">이미지 보기</button></div>' : ''}
    </div>
    <iframe class="mail-frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerpolicy="no-referrer" title="메일 본문"></iframe>`;
  const frame = pane.querySelector('.mail-frame');
  frame.addEventListener('load', () => mailFitFrame(frame), { once: true });
  frame.srcdoc = mailFrameDoc(html, m.remote);
  $('#mail-back').addEventListener('click', mailBackToList);
  $('#mail-mback').addEventListener('click', mailBackToList);
  $('#mail-prev').addEventListener('click', () => prevId && mailOpen(prevId));
  $('#mail-next').addEventListener('click', () => nextId && mailOpen(nextId));
  $('#mail-print').addEventListener('click', () => mailPrint(x, html));
  $('#mail-move').addEventListener('click', async (e) => {
    const b = e.currentTarget, folders = await mailMoveTargets();
    const k = await mailMenu(b, folders.map((f) => ({ k: f.id, label: f.name })));
    if (k) mailAction('move', x, folders.find((f) => f.id === k));
  });
  $('#mail-other').addEventListener('click', async (e) => {
    const k = await mailMenu(e.currentTarget, [
      { k: 'read', label: '읽음으로 표시', icon: 'envo' }, { k: 'unread', label: '안 읽음으로 표시', icon: 'env' },
      { k: 'star', label: '별 표시', icon: 'star' }, { k: 'unstar', label: '별 제거', icon: 'starx' },
      { k: 'eml', label: '다운로드(PC 저장)', icon: 'dl' }, { k: 'source', label: '원문보기', icon: 'doc' },
      ...(x.webLink ? [{ k: 'outlook', label: 'Outlook에서 열기', icon: 'src' }] : []),
    ]);
    if (k === 'outlook') window.open(x.webLink, '_blank', 'noopener');
    else if (k) mailAction(k, x);
  });
  $('#mail-more-tg').addEventListener('click', (e) => {
    const open = $('#mail-rhead').classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });
  $('#mail-flag').addEventListener('click', async (e) => {
    const b = e.currentTarget, on = !b.classList.contains('on');
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    try { await G.patch(`/me/messages/${encodeURIComponent(x.id)}`, { flag: { flagStatus: on ? 'flagged' : 'notFlagged' } }); x.flag = { flagStatus: on ? 'flagged' : 'notFlagged' }; }
    catch (err) { b.classList.toggle('on', !on); b.setAttribute('aria-pressed', String(!on)); toast(err.message); }
  });
  $('#mail-rmore').addEventListener('click', async () => {
    const k = await mailSheet([
      { k: 'replyAll', label: '전체 답장' }, { k: 'forward', label: '전달' }, { k: 'unread', label: '안 읽음으로 표시' },
      ...(x.webLink ? [{ k: 'outlook', label: 'Outlook에서 열기' }] : []),
    ]);
    if (k === 'outlook') window.open(x.webLink, '_blank', 'noopener');
    else if (k) mailAction(k, x);
  });
  pane.querySelectorAll('[data-saveall]').forEach((b) => b.addEventListener('click', () => mailSaveAll(x, m.atts, b, big)));
  pane.querySelectorAll('[data-big]').forEach((b) => b.addEventListener('click', () => mailBigSave(big[Number(b.dataset.big)].url)));
  const pvList = m.atts.filter((a) => mailPvKind(a.name));
  pane.querySelectorAll('[data-pv]').forEach((b) => b.addEventListener('click', () => mailPreviewAtt(x, pvList, Math.max(0, pvList.findIndex((a) => a.id === b.dataset.pv)))));
  const atg = $('#mail-abox-tg');
  if (atg) atg.addEventListener('click', () => { m.attFold = !m.attFold; $('#mail-abox').classList.toggle('open', !m.attFold); atg.setAttribute('aria-expanded', String(!m.attFold)); });
  const rb = $('#mail-remote'); if (rb) rb.addEventListener('click', () => { m.remote = true; mailDrawPane(); });
  pane.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => mailDownload(x.id, m.atts.find((a) => a.id === b.dataset.att))));
  pane.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => mailAction(b.dataset.act, x)));
}

/* ---------- 첨부: 저장·모두 저장(3개 이상은 zip)·미리보기 ---------- */
const mailExt = (name) => (String(name).split('.').pop() || '').toLowerCase();
const MAIL_PV = { img: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'], pdf: ['pdf'], txt: ['txt', 'csv', 'log', 'md', 'json', 'tsv'] };
const mailPvKind = (name) => Object.keys(MAIL_PV).find((k) => MAIL_PV[k].includes(mailExt(name))) || null;

/* 받은 첨부 바이트는 메일 열려 있는 동안 기억 (미리보기 후 저장할 때 다시 받지 않게) */
async function mailAttBlob(msgId, att) {
  const m = ui.mail;
  m.attCache = m.attCache && m.attCache.msg === msgId ? m.attCache : { msg: msgId, map: new Map() };
  if (!m.attCache.map.has(att.id)) m.attCache.map.set(att.id, await G.get(`/me/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(att.id)}/$value`, { type: 'blob' }));
  return m.attCache.map.get(att.id);
}
function mailSaveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function mailDownload(msgId, att) {
  if (!att) return;
  try { mailSaveBlob(await mailAttBlob(msgId, att), att.name); } catch (e) { toast(e.message); }
}

/* 무압축(STORE) zip. CRC32 포함, 파일 이름은 UTF-8 표시(bit 11) */
const MAIL_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function mailCrc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = MAIL_CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function mailZip(files) {
  const enc = new TextEncoder(), local = [], central = [], used = new Set();
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let off = 0;
  for (const f of files) {
    let name = f.name, k = 1;
    while (used.has(name.toLowerCase())) name = f.name.replace(/(\.[^.]*)?$/, (x) => ` (${k++})${x}`);
    used.add(name.toLowerCase());
    const nm = enc.encode(name), crc = mailCrc32(f.data), sz = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20], [6, 0x0800], [8, 0], [10, time], [12, date], [14, crc, 4], [18, sz, 4], [22, sz, 4], [26, nm.length], [28, 0]]
      .forEach(([o, v, n]) => (n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true)));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20], [6, 20], [8, 0x0800], [10, 0], [12, time], [14, date], [16, crc, 4], [20, sz, 4], [24, sz, 4], [28, nm.length], [30, 0], [32, 0], [34, 0], [36, 0], [38, 0, 4], [42, off, 4]]
      .forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    local.push(h, nm, f.data); central.push(c, nm);
    off += 30 + nm.length + sz;
  }
  const cdSize = central.reduce((s, x) => s + x.byteLength, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...local, ...central, e], { type: 'application/zip' });
}

/* 네이버 대용량 첨부: 본문에 든 bigfile 다운로드 링크(이름·크기·기한). 파일 바이트는 CORS 로 못 읽어 zip 에는 못 넣고 링크로 받는다 */
function mailBigFiles(html) {
  if (!html.includes('bigfile.mail.naver.com')) return [];
  const d = new DOMParser().parseFromString(html, 'text/html'), map = new Map(), today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
  d.querySelectorAll('a[href^="https://bigfile.mail.naver.com/download?"]').forEach((a) => {
    const url = a.href, f = map.get(url) || { url, name: '', size: 0, exp: '' };
    const sz = a.querySelector('span')?.textContent.trim();
    if (!f.name) f.name = (a.title || a.textContent.replace(sz || '', '')).trim();
    if (!f.size && /^\d+$/.test(sz || '')) f.size = Number(sz);
    if (!f.exp) f.exp = (a.closest('tr')?.textContent.match(/~\s*(\d{4}\/\d{2}\/\d{2})/) || [])[1] || '';
    map.set(url, f);
  });
  return [...map.values()].map((f) => ({ ...f, name: f.name || '대용량 첨부', expired: !!f.exp && f.exp < today }));
}
/* 숨은 빈 iframe 을 만든 뒤 주소를 넣어 받는다. 여러 개를 동시에 받아도 서로 취소되지 않고, 기한이 지나 HTML 이 와도 화면이 안 바뀐다.
   (iframe src 에 바로 넣으면 '다른 출처 iframe 다운로드'로 막히고, 이 탭에서 링크를 열면 다음 링크가 앞 다운로드를 취소한다) */
function mailBigSave(url) {
  const f = document.createElement('iframe');
  f.style.display = 'none'; document.body.appendChild(f);
  f.contentWindow.location.href = url;
  setTimeout(() => f.remove(), 60000);
}

/* 모두 저장: 1~2개는 하나씩, 3개 이상은 "제목.zip" 하나로. 대용량 첨부는 링크로 따로 하나씩 */
async function mailSaveAll(x, atts, btn, big = []) {
  const live = big.filter((b) => !b.expired);
  if (!atts.length && !live.length) return;
  live.forEach((b) => mailBigSave(b.url));
  if (live.length < big.length) toast(`기한 지난 대용량 첨부 ${big.length - live.length}개는 받지 못합니다`);
  if (!atts.length) return;
  if (btn) btn.disabled = true;
  const bad = []; // 하나 실패해도 나머지는 저장한다
  try {
    if (atts.length < 3) { for (const a of atts) { try { mailSaveBlob(await mailAttBlob(x.id, a), a.name); } catch { bad.push(a.name); } } return; }
    const files = [];
    for (const a of atts) {
      try { files.push({ name: String(a.name || '첨부파일').replace(/[\\/]+/g, '_'), data: new Uint8Array(await (await mailAttBlob(x.id, a)).arrayBuffer()) }); } // zip 안 이름의 / \ 는 폴더가 된다
      catch { bad.push(a.name); }
    }
    if (files.length) mailSaveBlob(mailZip(files), `${(x.subject || '첨부파일').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || '첨부파일'}.zip`);
  } catch (e) { toast(e.message); }
  finally { if (btn) btn.disabled = false; if (bad.length) toast(`받지 못한 첨부: ${bad.join(', ')}`); }
}

/* 미리보기 창: 이미지 <img>, PDF <iframe src=blob:>, 텍스트 <pre>. 미리보기 되는 첨부끼리 ←/→ */
function mailPreviewAtt(x, list, start) {
  let i = start, url = null;
  const w = mailModal(`<div class="mail-pv-head"><h3 class="mail-apv-n"></h3>
      <button class="btn sm" type="button" data-save>저장</button>
      <button class="iconbtn" type="button" data-close aria-label="닫기">${mi('close')}</button></div>
    <div class="mail-apv-body"></div>
    ${list.length > 1 ? `<button class="mail-apv-nav prev" type="button" data-nav="-1" aria-label="이전 첨부">${ico('left')}</button><button class="mail-apv-nav next" type="button" data-nav="1" aria-label="다음 첨부">${ico('right')}</button>` : ''}`, 'mail-pvw mail-apv');
  const body = w.querySelector('.mail-apv-body'), title = w.querySelector('.mail-apv-n');
  const show = async () => {
    const a = list[i], kind = mailPvKind(a.name), my = i;
    title.textContent = list.length > 1 ? `${a.name}  (${i + 1}/${list.length})` : a.name;
    body.innerHTML = '<div class="empty">불러오는 중…</div>';
    if (url) { URL.revokeObjectURL(url); url = null; }
    try {
      const blob = await mailAttBlob(x.id, a);
      if (my !== i || !w.isConnected) return;
      if (kind === 'txt') {
        const text = await blob.text();
        body.innerHTML = '<pre class="mail-apv-txt"></pre>';
        body.firstChild.textContent = text.slice(0, 500000);
        return;
      }
      // 첨부의 contentType을 믿지 않고 확장자로 정한 형식만 쓴다 (HTML 등이 앱 출처에서 열리지 않게)
      url = URL.createObjectURL(new Blob([blob], { type: kind === 'pdf' ? 'application/pdf' : `image/${mailExt(a.name) === 'jpg' ? 'jpeg' : mailExt(a.name)}` }));
      body.innerHTML = kind === 'pdf' ? `<iframe class="mail-apv-pdf" src="${url}" title="${esc(a.name)}"></iframe>` : `<img class="mail-apv-img" src="${url}" alt="${esc(a.name)}">`;
    } catch (e) { if (my === i) body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  const go = (d) => { if (list.length < 2) return; i = (i + d + list.length) % list.length; show(); };
  w.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.nav))));
  w.querySelector('[data-save]').addEventListener('click', () => mailDownload(x.id, list[i]));
  const onKey = (e) => { if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); };
  document.addEventListener('keydown', onKey);
  const close = w.close;
  w.close = () => { document.removeEventListener('keydown', onKey); if (url) URL.revokeObjectURL(url); close(); };
  show();
}

/* 이동할 수 있는 폴더: 기본 폴더 + 내가 만든 맨 위 폴더 (지금 폴더·임시보관함·보낼 편지함 등 제외). 한 번 읽고 기억 */
const MAIL_MOVE_WK = [['inbox', '받은편지함'], ['sentitems', '보낸편지함'], ['junkemail', '스팸 메일함'], ['deleteditems', '지운편지함']];
const MAIL_HIDE_WK = ['drafts', 'outbox', 'archive', 'conversationhistory', 'syncissues', 'scheduled'];
async function mailMoveTargets() {
  const m = ui.mail;
  if (!m.moveList) {
    const enc = encodeURIComponent;
    const [all, ...wk] = await Promise.all([
      G.get('/me/mailFolders?$top=100&$select=id,displayName').then((j) => j.value).catch(() => []),
      ...[...MAIL_MOVE_WK.map((w) => w[0]), ...MAIL_HIDE_WK].map((k) => G.get(`/me/mailFolders/${enc(k)}?$select=id`).then((j) => j.id).catch(() => null)),
    ]);
    const known = new Set(wk.filter(Boolean));
    m.moveList = [
      ...MAIL_MOVE_WK.map(([id, name]) => ({ id, name })),
      ...all.filter((f) => !known.has(f.id)).map((f) => ({ id: f.id, name: f.displayName })),
    ];
  }
  return m.moveList.filter((f) => f.id !== m.folder);
}

/* 인쇄: 스크립트가 못 도는 iframe(같은 출처·모달만 허용)에 머리글+본문을 넣고 인쇄 창을 연다 */
function mailPrint(x, html) {
  const head = `<h2 style="margin:0 0 12px;font-size:20px">${esc(x.subject || '(제목 없음)')}</h2>
    <table style="font-size:13px;color:#4B5563;margin-bottom:16px;border-collapse:collapse">
    ${[['보낸 사람', mailAddr(x.from)], ['받는 사람', mailAddrList(x.toRecipients)], ['참조', mailAddrList(x.ccRecipients)], ['날짜', mailFullTime(x.receivedDateTime || x.sentDateTime)]]
      .filter((r) => r[1]).map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join('')}</table><hr style="border:0;border-top:1px solid #E5E7EB;margin:0 0 16px">`;
  const fr = document.createElement('iframe');
  fr.className = 'mail-printf';
  fr.setAttribute('sandbox', 'allow-same-origin allow-modals');
  fr.setAttribute('referrerpolicy', 'no-referrer');
  fr.addEventListener('load', () => {
    try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast(e.message); }
    setTimeout(() => fr.remove(), 1000);
  }, { once: true });
  fr.srcdoc = mailFrameDoc(head + html, ui.mail.remote);
  document.body.appendChild(fr);
}

async function mailAction(act, x, arg) {
  const m = ui.mail;
  const enc = encodeURIComponent;
  try {
    if (act === 'reply' || act === 'replyAll' || act === 'forward') return mailOpenCompose({ mode: act, id: x.id });
    if (act === 'read') {
      const it = m.list.find((i) => i.id === x.id), was = it ? it.isRead : x.isRead;
      await G.patch(`/me/messages/${enc(x.id)}`, { isRead: true });
      x.isRead = true; if (it) it.isRead = true;
      const c = m.counts[m.folder]; if (!was && c && c.unread) c.unread -= 1; // 실제로 바뀐 때만
      if (route() === 'mail') { mailDrawList(); mailDrawFolders(); }
      return toast('읽음으로 표시했습니다');
    }
    if (act === 'star' || act === 'unstar') {
      const flag = { flagStatus: act === 'star' ? 'flagged' : 'notFlagged' };
      await G.patch(`/me/messages/${enc(x.id)}`, { flag });
      x.flag = flag; const it = m.list.find((i) => i.id === x.id); if (it) it.flag = flag;
      const b = $('#mail-flag'); if (b) { b.classList.toggle('on', act === 'star'); b.setAttribute('aria-pressed', String(act === 'star')); }
      return;
    }
    if (act === 'eml') {
      const blob = await G.get(`/me/messages/${enc(x.id)}/$value`, { type: 'blob' });
      const url = URL.createObjectURL(new Blob([blob], { type: 'message/rfc822' })), a = document.createElement('a');
      a.href = url; a.download = `${(x.subject || '메일').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)}.eml`;
      document.body.appendChild(a); a.click(); a.remove();
      return setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    if (act === 'source') {
      const w = mailModal(`<div class="mail-pv-head"><h3>원문보기</h3><button class="iconbtn" type="button" data-close aria-label="닫기">${mi('close')}</button></div>
        <iframe class="mail-frame" sandbox referrerpolicy="no-referrer" title="원문"></iframe>`, 'mail-pvw');
      const text = await G.get(`/me/messages/${enc(x.id)}/$value`, { type: 'text' });
      const fr = w.querySelector('iframe'); if (fr) fr.srcdoc = mailFrameDoc(`<pre style="font:12px/1.55 Consolas,monospace;white-space:pre-wrap;word-break:break-all">${esc(text)}</pre>`, false);
      return;
    }
    if (act === 'move') {
      await G.post(`/me/messages/${enc(x.id)}/move`, { destinationId: arg.id });
      // 삭제처럼 목록으로 (다음 메일을 저절로 열면 읽음 처리돼 버린다)
      m.list = m.list.filter((i) => i.id !== x.id); m.sel = null; m.msg = null; m.view = 'list';
      mailDrawShell(); mailDrawList(); mailDrawPane(); mailLoadCounts();
      toast(`${arg.name}(으)로 옮겼습니다`);
      return;
    }
    if (act === 'unread') {
      const it = m.list.find((i) => i.id === x.id), was = it ? it.isRead : x.isRead;
      await G.patch(`/me/messages/${encodeURIComponent(x.id)}`, { isRead: false });
      x.isRead = false; if (it) it.isRead = false;
      const c = m.counts[m.folder]; if (c && was) c.unread += 1; // 실제로 바뀐 때만
      m.sel = null; m.msg = null; m.view = 'list';
      mailDrawShell(); mailDrawList(); mailDrawFolders(); mailDrawPane();
      return;
    }
    if (act === 'delete' || act === 'purge') {
      if (act === 'purge' && !(await mailConfirm({ title: '영구 삭제할까요?', rows: [['제목', x.subject || '(제목 없음)']], ok: '영구 삭제' }))) return;
      if (act === 'delete') await G.post(`/me/messages/${encodeURIComponent(x.id)}/move`, { destinationId: 'deleteditems' });
      else await G.del(`/me/messages/${encodeURIComponent(x.id)}`);
      m.list = m.list.filter((i) => i.id !== x.id); m.sel = null; m.msg = null; m.view = 'list';
      mailDrawShell(); mailDrawList(); mailDrawPane(); mailLoadCounts();
      toast(act === 'delete' ? '지운편지함으로 옮겼습니다' : '삭제했습니다');
    }
  } catch (e) { toast(e.message); }
}

/* ---------- 쓰기 ---------- */
/* mode: new | reply | replyAll | forward | draft */
async function mailOpenCompose({ mode, id }) {
  const m = mailState();
  if (m.opening || (m.compose?.loading && m.compose.mode === mode && m.compose.src === id)) return; // 두 번 누름
  m.opening = true;
  let sig, back;
  try {
    back = m.compose ? m.backTo : m.view === 'read' ? 'read' : 'list'; // 답장 쓰다 새 메일을 열어도 돌아갈 곳은 그대로
    if (m.compose && !(await mailLeaveCompose())) return;
    sig = await mailLoadSig();
  } finally { m.opening = false; }
  const c = { mode, src: id, loading: mode !== 'new', draftId: null, auto: false, saved: false, kept: false, to: '', cc: '', bcc: '', subject: '', text: '', html: '', quote: '', existing: [], files: [], busy: false,
    plain: false, important: false, each: false, sched: null, sigOn: !!sig && mode !== 'draft' };
  if (mode !== 'draft') c.html = `<div><br></div><div><br></div>${sig ? mailSigBlock(sig) : ''}`;
  c.base = mailBase(c);
  m.backTo = back;
  m.compose = c; m.view = 'compose';
  mailDrawShell(); mailDrawFolders(); mailDrawPane();
  try {
    if (mode === 'reply' || mode === 'replyAll' || mode === 'forward') {
      const fn = { reply: 'createReply', replyAll: 'createReplyAll', forward: 'createForward' }[mode];
      const d = await G.post(`/me/messages/${encodeURIComponent(id)}/${fn}`, {});
      if (m.compose !== c) { G.del(`/me/messages/${encodeURIComponent(d.id)}`).catch(() => {}); return; } // 만드는 사이 쓰기를 닫았으면 남은 초안을 지운다
      Object.assign(c, { draftId: d.id, auto: true, to: mailAddrList(d.toRecipients), cc: mailAddrList(d.ccRecipients), subject: d.subject || '', quote: mailQuoteWrap(d.body?.content || '') });
    } else if (mode === 'draft') {
      const d = await G.get(`/me/messages/${encodeURIComponent(id)}?$select=id,subject,toRecipients,ccRecipients,bccRecipients,body,importance`);
      if (m.compose !== c) return;
      const html = d.body?.contentType === 'html' ? mailSanitize(d.body.content) : mailTextHtml(d.body?.content || '');
      Object.assign(c, { draftId: d.id, saved: true, to: mailAddrList(d.toRecipients), cc: mailAddrList(d.ccRecipients), bcc: mailAddrList(d.bccRecipients), subject: d.subject || '',
        html, sigOn: mailHasSig(html), important: d.importance === 'high' });
    }
    c.base = mailBase(c);
    if (c.draftId) c.existing = (await G.get(`/me/messages/${encodeURIComponent(c.draftId)}/attachments?$select=id,name,size,isInline`)).value.filter((a) => !a.isInline);
  } catch (e) { toast(e.message); }
  c.loading = false;
  if (m.compose === c) mailDrawCompose();
}

/* 주소 칸: 쓴 주소는 칩으로, 값은 숨은 입력(name=to/cc/bcc)에 "a, b" 문자열로 */
const mailTokens = (s) => (s || '').split(/[,;\n]/).map((t) => t.trim()).filter(Boolean);
const mailTokLabel = (t) => { const mm = t.match(/^(.*?)\s*<([^>]+)>$/); return mm && mm[1] ? mm[1].replace(/^"|"$/g, '') : t; };
const mailTokOk = (t) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test((t.match(/<([^>]+)>$/) || [, t])[1].trim());
function mailTokInit(box) {
  const hidden = box.querySelector('input[type=hidden]'), inp = box.querySelector('.mail-tok-in'), chips = box.querySelector('.mail-chips');
  const toks = () => mailTokens(hidden.value);
  const set = (arr) => { hidden.value = arr.join(', '); hidden.dispatchEvent(new Event('input', { bubbles: true })); draw(); };
  const draw = () => {
    chips.innerHTML = toks().map((t, i) => `<span class="mail-chip ${mailTokOk(t) ? '' : 'bad'}" title="${esc(t)}" draggable="true" data-i="${i}">${esc(mailTokLabel(t))}<button type="button" data-x="${i}" aria-label="${esc(mailTokLabel(t))} 빼기">×</button></span>`).join('');
    chips.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const a = toks(); a.splice(Number(b.dataset.x), 1); set(a); inp.focus(); }));
    chips.querySelectorAll('.mail-chip').forEach((el) => {
      el.addEventListener('dragstart', (e) => { mailDrag = { box, i: Number(el.dataset.i) }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', toks()[mailDrag.i] || ''); el.classList.add('drag'); });
      el.addEventListener('dragend', () => { mailDrag = null; document.querySelectorAll('.mail-chip.drag').forEach((x) => x.classList.remove('drag')); mailDropMark(null); });
    });
  };
  // 칩을 끌어 놓을 자리: 포인터보다 오른쪽(또는 아래 줄)에 있는 첫 칩 앞, 없으면 맨 끝
  const dropAt = (e) => { const cs = [...chips.querySelectorAll('.mail-chip')]; const k = cs.findIndex((el) => { const r = el.getBoundingClientRect(); return e.clientY < r.top || (e.clientY <= r.bottom && e.clientX < r.left + r.width / 2); }); return k < 0 ? cs.length : k; };
  box.addEventListener('dragover', (e) => { if (!mailDrag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; mailDropMark(box, dropAt(e)); });
  box.addEventListener('dragleave', (e) => { if (mailDrag && !box.contains(e.relatedTarget)) mailDropMark(null); });
  box.addEventListener('drop', (e) => {
    if (!mailDrag) return; e.preventDefault();
    const src = mailDrag, at = dropAt(e); mailDrag = null; mailDropMark(null);
    if (src.box === box) { const a = toks(), [t] = a.splice(src.i, 1); a.splice(at > src.i ? at - 1 : at, 0, t); set(a); return; }
    const from = src.box.mailToks(), [t] = from.splice(src.i, 1), a = toks(); a.splice(at, 0, t); src.box.mailSet(from); set(a);
  });
  const commit = () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; set([...toks(), ...mailTokens(v)]); };
  inp.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && inp.value.trim()) { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && !inp.value && toks().length) { const a = toks(); a.pop(); set(a); }
  });
  inp.addEventListener('input', () => { if (/[,;]/.test(inp.value)) commit(); });
  inp.addEventListener('blur', () => setTimeout(commit, 160));
  box.mailAdd = (t) => { inp.value = ''; set([...toks(), t]); };
  box.mailCommit = commit;
  box.mailToks = toks; box.mailSet = set;
  draw();
}
// 받는 사람·참조·숨은 참조 칩 끌어 옮기기(순서 바꾸기, 칸 사이 이동)
let mailDrag = null;
function mailDropMark(box, at) {
  document.querySelectorAll('.mail-tok .drop-b, .mail-tok .drop-a').forEach((x) => x.classList.remove('drop-b', 'drop-a'));
  if (!box) return;
  const cs = box.querySelectorAll('.mail-chip');
  if (at < cs.length) cs[at].classList.add('drop-b'); else if (cs.length) cs[cs.length - 1].classList.add('drop-a');
}

const MAIL_SIZES = [12, 13, 14, 15, 16, 18, 20, 24];
const MAIL_STATE_CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight'];
const mailSchedDate = (s) => Date.parse(`${s.date}T${s.h}:${s.m}:00+09:00`);
const mailSchedLabel = (s) => `${Number(s.date.slice(5, 7))}/${Number(s.date.slice(8, 10))} ${s.h}:${s.m}`;

function mailDrawCompose() {
  const c = ui.mail.compose, pane = $('#mail-pane'); if (!pane || !c) return;
  const title = { new: '메일 쓰기', reply: '답장', replyAll: '전체 답장', forward: '전달', draft: '임시 저장한 메일' }[c.mode];
  const book = (key) => `<button type="button" class="mail-book" data-book="${key}" aria-label="주소록">${mi('plusc', 'bk-m')}${ico('plus', 'bk-d')}</button>`;
  const tokField = (key, label, pre = '', cls = '') => `<div class="mail-field mail-addrf ${cls}"><span class="mail-flbl">${label}${pre}</span>
    <div class="mail-ac mail-tok"><input type="hidden" name="${key}" value="${esc(c[key])}"><span class="mail-chips"></span><input class="mail-tok-in" autocomplete="off" aria-label="${label}" enterkeyhint="next"><ul class="mail-sug" hidden></ul></div>${book(key)}</div>`;
  const files = [...c.existing.map((a) => ({ att: a, name: a.name, size: a.size })), ...c.files.map((f) => ({ file: f, name: f.name, size: f.size }))];
  const ccOpen = c.ccOpen || !!(c.cc.trim() || c.bcc.trim());
  const bccOpen = c.bccOpen || !!c.bcc.trim();
  const me = typeof G !== 'undefined' && G.account ? G.account : null;
  const myAddr = me?.username || '', myName = me?.name || '';
  const tb = (cmd, label, inner) => `<button type="button" data-ex="${cmd}" title="${label}" aria-label="${label}">${inner}</button>`;
  pane.innerHTML = `
    <form class="mail-compose ${ccOpen ? 'cc-open' : ''} ${bccOpen ? 'bcc-open' : ''} ${c.each ? 'each' : ''}" id="mail-cf" novalidate>
      <div class="mail-chead">
        <button class="iconbtn mail-back" type="button" data-c="cancel" aria-label="닫기">${ico('left')}</button>
        <span class="mail-cbtns">
          <button class="btn mail-send" type="submit">보내기</button>
          <button class="mail-tbtn" type="button" data-c="preview">미리보기</button>
          <button class="mail-tbtn" type="button" data-c="save">저장하기</button>
          <span class="mail-optw"><button class="mail-tbtn" type="button" id="mail-opt" aria-haspopup="dialog" aria-expanded="false">옵션${mi('caret', 'caret')}</button></span>
          <label class="mail-each"><input type="checkbox" class="check" id="mail-each" ${c.each ? 'checked' : ''}>개인별 보내기</label>
          ${c.important ? '<span class="mail-optchip imp">중요</span>' : ''}${c.sched ? `<span class="mail-optchip">예약 ${mailSchedLabel(c.sched)}</span>` : ''}${c.plain ? '<span class="mail-optchip">텍스트</span>' : ''}
        </span>
        <h2>${title}</h2>
        <button class="mail-tbtn mail-dcancel" type="button" data-c="cancel">취소</button>
        <span class="mail-tools-r">
          <button class="iconbtn mail-send-m" type="submit" aria-label="보내기">${ico('send')}</button>
          <button class="iconbtn mail-cmore" type="button" id="mail-cmore" aria-label="더보기">${mi('more')}</button>
        </span>
      </div>
      ${myAddr ? `<div class="mail-field mail-fromf"><span class="mail-flbl">보낸 사람</span><span class="mail-chip mail-chip-ro">${esc(myName ? `${myName} <${myAddr}>` : myAddr)}</span></div>` : ''}
      ${tokField('to', '받는 사람', `<button type="button" class="iconbtn mail-cc-tg" id="mail-cc-tg" aria-expanded="${ccOpen}" aria-label="참조·숨은참조">${mi('down')}</button>`)}
      ${tokField('cc', '참조', `<button type="button" class="mail-bcc-tg" id="mail-bcc-tg" aria-expanded="${bccOpen}" aria-label="숨은참조">${mi('caret')}</button>`, 'mail-ccf')}
      ${tokField('bcc', '숨은참조', '', 'mail-ccf mail-bccf')}
      <label class="mail-field mail-subjf"><span class="mail-flbl">제목</span><input class="input" name="subject" value="${esc(c.subject)}" placeholder="제목을 입력해주세요."></label>
      <div class="mail-field mail-files ${files.length ? 'has-files' : ''}"><span class="mail-flbl">파일 첨부</span><div class="mail-drop" id="mail-drop">
        <div class="mail-drop-top">
          <label class="btn sm mail-dfile">${mi('pc')}내 컴퓨터<input type="file" multiple hidden id="mail-file"></label>
          <span class="mail-drop-tx">에서 첨부하거나, 여기로 파일을 끌어놓으세요.</span>
        </div>
        ${files.length ? `<div class="mail-flist">${files.map((f, i) => `<span class="mail-file">${mi('doc')}<span class="mail-file-n">${esc(f.name)}</span><span class="muted">${mailSize(f.size)}</span><button type="button" class="iconbtn" data-rm="${i}" aria-label="첨부 빼기" ${c.busy || c.sending ? 'disabled' : ''}>${mi('close')}</button></span>`).join('')}</div>
        <div class="mail-drop-sz">${files.length}개 · ${mailSize(files.reduce((s, f) => s + (f.size || 0), 0))}</div>` : ''}
      </div></div>
      ${c.plain ? `<textarea class="mail-body" name="text" placeholder="내용">${esc(c.text)}</textarea>` : `
      <div class="mail-editor${c.quote ? ' has-quote' : ''}">
        ${mailToolbarHTML(c)}
        <div class="mail-rte" id="mail-rte" contenteditable="true" role="textbox" aria-multiline="true" aria-label="내용" spellcheck="false"></div>
        ${c.quote ? '<div class="mail-quote"><iframe class="mail-frame" sandbox="allow-same-origin" referrerpolicy="no-referrer" scrolling="no" title="원문"></iframe></div>' : ''}
      </div>`}
      ${c.plain && c.quote ? '<div class="mail-quote"><iframe class="mail-frame" sandbox="allow-same-origin" referrerpolicy="no-referrer" scrolling="no" title="원문"></iframe></div>' : ''}
      <div class="mail-ctools">
        <label class="iconbtn mail-ctool" aria-label="사진 첨부">${mi('camera')}<input type="file" accept="image/*" capture="environment" hidden id="mail-cam"></label>
        <label class="iconbtn mail-ctool" aria-label="파일 첨부">${ico('clip')}<input type="file" multiple hidden id="mail-file2"></label>
      </div>
    </form>`;
  const f = $('#mail-cf'), rte = $('#mail-rte');
  if (c.quote) { // 원문은 보통 메일처럼 본문 아래에 펼쳐 둔다(사용자 11/9). 보낼 때는 mailMergeBody가 그대로 붙인다
    const qf = f.querySelector('.mail-quote .mail-frame');
    qf.addEventListener('load', () => mailFitQuote(qf), { once: true });
    qf.srcdoc = mailFrameDoc(c.quote, ui.mail.folder !== 'junkemail');
  }
  if (rte) { rte.innerHTML = c.html; mailRteInit(rte, c); }
  // 도구막대는 위 버튼 줄 바로 아래에 붙는다 (버튼 줄이 두 줄로 접혀도)
  if (c.ro) c.ro.disconnect();
  const chead = f.querySelector('.mail-chead');
  c.ro = new ResizeObserver(() => f.style.setProperty('--ch', `${chead.offsetHeight}px`));
  c.ro.observe(chead);
  const sync = () => {
    for (const k of ['to', 'cc', 'bcc', 'subject']) c[k] = f.elements[k].value;
    if (c.plain) c.text = f.elements.text.value; else if (rte) c.html = rte.innerHTML;
  };
  c.sync = sync;
  f.addEventListener('input', () => { sync(); mailEdited(c); });
  // 받는이 칸에 치다 만 주소를 칩으로 확정 (칸을 벗어날 때의 확정은 늦게 돌아서 저장·옵션·첨부·닫기보다 뒤에 온다)
  const commit = () => { f.querySelectorAll('.mail-tok').forEach((b) => b.mailCommit && b.mailCommit()); sync(); };
  // 입력칸에서 Enter = 보내기(폼 제출)가 되지 않게. 제목에서 Enter는 본문으로
  f.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    if (e.target.name === 'subject') (rte || f.elements.text).focus();
  });
  const toggleCc = (open) => { c.ccOpen = f.classList.toggle('cc-open', open); $('#mail-cc-tg').setAttribute('aria-expanded', String(c.ccOpen)); };
  f.querySelectorAll('[data-c=cancel]').forEach((b) => b.addEventListener('click', async () => { commit(); if (await mailLeaveCompose()) mailAfterCompose(); }));
  f.querySelectorAll('[data-c=save]').forEach((b) => b.addEventListener('click', async () => { commit(); await mailSaveDraft(c, true); }));
  f.querySelector('[data-c=preview]').addEventListener('click', () => { commit(); mailPreview(); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    commit(); await mailSend(c);
  });
  $('#mail-cc-tg').addEventListener('click', (e) => { e.preventDefault(); toggleCc(!f.classList.contains('cc-open')); if (c.ccOpen) f.querySelector('.mail-ccf .mail-tok-in').focus(); });
  $('#mail-bcc-tg').addEventListener('click', (e) => {
    e.preventDefault();
    c.bccOpen = f.classList.toggle('bcc-open');
    e.currentTarget.setAttribute('aria-expanded', String(c.bccOpen));
    if (c.bccOpen) f.querySelector('.mail-bccf .mail-tok-in').focus();
  });
  $('#mail-each').addEventListener('change', (e) => { c.each = e.target.checked; f.classList.toggle('each', c.each); });
  $('#mail-opt').addEventListener('click', (e) => { commit(); mailOptions(e.currentTarget); });
  f.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); mailBook(b.closest('.mail-field').querySelector('.mail-tok')); }));
  $('#mail-cmore').addEventListener('click', async () => {
    const k = await mailSheet([{ k: 'save', label: '임시 저장' }, { k: 'cc', label: c.ccOpen ? '참조·숨은참조 숨기기' : '참조·숨은참조 추가' }, { k: 'cancel', label: '쓰기 취소' }]);
    if (k === 'save') { commit(); await mailSaveDraft(c, true); }
    else if (k === 'cc') toggleCc(!c.ccOpen);
    else if (k === 'cancel') { commit(); if (await mailLeaveCompose()) mailAfterCompose(); }
  });
  for (const id of ['mail-file', 'mail-file2', 'mail-cam']) $(`#${id}`).addEventListener('change', (e) => { commit(); mailAddFiles(e.target.files); });
  // 첨부 칸에 파일을 끌어다 놓기 (데스크톱)
  const drop = $('#mail-drop');
  drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) { commit(); mailAddFiles(e.dataTransfer.files); } });
  f.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { commit(); mailRemoveFile(c, files[Number(b.dataset.rm)]); }));
  f.querySelectorAll('.mail-ac').forEach(mailAutocomplete);
  f.querySelectorAll('.mail-tok').forEach(mailTokInit);
  if (c.mode === 'reply' || c.mode === 'replyAll') {
    if (rte) { rte.focus(); const r = document.createRange(); r.setStart(rte, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    else f.elements.text.focus();
  } else (c.to ? f.elements.subject : f.querySelector('.mail-addrf .mail-tok-in')).focus();
}

/* 서식 편집기 도구막대. 표 도구 묶음은 커서가 표 안에 있을 때만 보인다 */
const MAIL_FONTS = [
  ['기본', MAIL_FONT], ['맑은 고딕', "'Malgun Gothic','맑은 고딕',sans-serif"], ['돋움', "Dotum,'돋움',sans-serif"], ['굴림', "Gulim,'굴림',sans-serif"],
  ['바탕', "Batang,'바탕',serif"], ['Arial', 'Arial,Helvetica,sans-serif'], ['Times New Roman', "'Times New Roman',Times,serif"], ['Courier New', "'Courier New',monospace"],
];
const MAIL_CELL = 'border:1px solid #D6D6D6;padding:6px 8px;vertical-align:top;';
function mailToolbarHTML(c) {
  const tb = (cmd, label, inner, cls = '') => `<button type="button" class="${cls}" data-ex="${cmd}" title="${label}" aria-label="${label}">${inner}</button>`;
  const color = (id, label, inner, val) => `<label class="mail-ecolor" title="${label}">${inner}<i data-bar="${id}"></i><input type="color" id="${id}" value="${val}" aria-label="${label}"></label>`;
  const sep = '<span class="mail-esep"></span>';
  return `<div class="mail-etools" role="toolbar" aria-label="서식">
    <select class="mail-esel mail-efont" id="mail-efont" aria-label="글꼴"><option value="" hidden>글꼴</option>${MAIL_FONTS.map(([n], i) => `<option value="${i}">${n}</option>`).join('')}</select>
    <select class="mail-esel" id="mail-esize" aria-label="글자 크기"><option value="" hidden>크기</option>${MAIL_SIZES.map((px) => `<option value="${px}">${px}px</option>`).join('')}</select>
    ${sep}${tb('bold', '굵게', '<b>B</b>')}${tb('italic', '기울임', '<i>I</i>')}${tb('underline', '밑줄', '<u>U</u>')}${tb('strikeThrough', '취소선', '<s>S</s>')}
    ${color('mail-ecolor', '글자 색', '<span class="mail-ec-a">A</span>', c.color || '#DC2626')}${color('mail-ebg', '배경 색', mi('marker'), c.bg || '#FFF3B0')}
    ${sep}${tb('justifyLeft', '왼쪽 정렬', mi('alignL'))}${tb('justifyCenter', '가운데 정렬', mi('alignC'))}${tb('justifyRight', '오른쪽 정렬', mi('alignR'))}
    ${sep}${tb('insertOrderedList', '번호 매기기', mi('ol'))}${tb('insertUnorderedList', '글머리 기호', mi('ul'))}${tb('outdent', '내어쓰기', mi('outdent'))}${tb('indent', '들여쓰기', mi('indent'))}
    ${sep}${tb('createLink', '링크', mi('link'))}${tb('insertHorizontalRule', '구분선', mi('hr'))}<span class="mail-tblw">${tb('table', '표 넣기', mi('table'))}</span>${tb('removeFormat', '서식 지우기', mi('clear'))}
    ${sep}${tb('undo', '실행 취소', mi('undo'))}${tb('redo', '다시 실행', mi('redo'))}
    <span class="mail-etbl">${sep}${tb('rowAbove', '위에 행 추가', mi('rowUp'))}${tb('rowBelow', '아래에 행 추가', mi('rowDown'))}${tb('colLeft', '왼쪽에 열 추가', mi('colLeft'))}${tb('colRight', '오른쪽에 열 추가', mi('colRight'))}${tb('rowDel', '행 삭제', mi('rowDel'))}${tb('colDel', '열 삭제', mi('colDel'))}${color('mail-ecell', '셀 배경 색', mi('cell'), c.cellBg || '#F3F4F6')}${tb('tableDel', '표 삭제', mi('tableDel'))}</span>
  </div>`;
}

/* 표 정리: 붙여넣은 표·직접 넣은 표에 테두리·여백을 인라인으로 (서명 표는 건드리지 않는다) */
function mailFixTables(root) {
  root.querySelectorAll('table').forEach((t) => {
    if (t.closest('[data-sig]')) return;
    t.setAttribute('data-tbl', '1');
    t.style.borderCollapse = 'collapse';
    t.querySelectorAll('td,th').forEach((td) => {
      if (!td.style.border && !td.style.borderTop && !td.style.borderBottom && !td.style.borderLeft && !td.style.borderRight) td.style.border = '1px solid #D6D6D6';
      if (!td.style.padding) td.style.padding = '6px 8px';
      if (!td.style.verticalAlign) td.style.verticalAlign = 'top';
    });
  });
  return root;
}
function mailFixHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  return mailFixTables(doc.body).innerHTML;
}

/* 서식 편집기: 도구 버튼은 execCommand, 붙여넣은 HTML은 정리해서, 표는 직접 DOM으로 다룬다 */
function mailRteInit(rte, c) {
  const tools = rte.previousElementSibling;
  let saved = null;
  const restore = () => {
    if (document.activeElement === rte) return;
    rte.focus();
    if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); }
  };
  const cellOf = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); const td = el && el.closest('td,th'); return td && rte.contains(td) && !td.closest('[data-sig]') ? td : null; };
  const onSel = () => {
    if (!rte.isConnected) { document.removeEventListener('selectionchange', onSel); return; }
    const s = getSelection(); if (!s.rangeCount || !rte.contains(s.anchorNode)) return;
    saved = s.getRangeAt(0).cloneRange();
    tools.querySelectorAll('[data-ex]').forEach((b) => b.classList.toggle('on', MAIL_STATE_CMDS.includes(b.dataset.ex) && document.queryCommandState(b.dataset.ex)));
    const el = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
    const cs = getComputedStyle(el), px = Math.round(parseFloat(cs.fontSize));
    tools.querySelector('#mail-esize').value = MAIL_SIZES.includes(px) ? String(px) : '';
    const fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
    const fi = MAIL_FONTS.findIndex(([, v]) => v.split(',')[0].replace(/['"]/g, '').trim().toLowerCase() === fam);
    tools.querySelector('#mail-efont').value = fi >= 0 ? String(fi) : '';
    tools.classList.toggle('in-table', !!cellOf(s.anchorNode));
  };
  document.addEventListener('selectionchange', onSel);
  const done = () => { c.html = rte.innerHTML; mailEdited(c); onSel(); };
  const exec = (cmd, val = null, css = false) => { restore(); document.execCommand('styleWithCSS', false, css); document.execCommand(cmd, false, val); done(); };

  /* 표 */
  const curCell = () => cellOf(saved ? saved.startContainer : null);
  const setCol = (table, i, pct) => [...table.rows].forEach((r) => { if (r.cells[i]) r.cells[i].style.width = `${pct.toFixed(2)}%`; });
  const colPct = (table, i) => parseFloat(table.rows[0]?.cells[i]?.style.width) || 100 / (table.rows[0]?.cells.length || 1);
  const blank = (cell) => { const n = cell.cloneNode(false); n.innerHTML = '<br>'; return n; };
  const placeIn = (cell) => { if (!cell) return; const r = document.createRange(); r.selectNodeContents(cell); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  const tableOp = (op) => {
    const td = curCell(); if (!td) return;
    const tr = td.parentElement, table = td.closest('table'), i = td.cellIndex;
    if (op === 'rowAbove' || op === 'rowBelow') {
      const nr = tr.cloneNode(false); [...tr.cells].forEach((x) => nr.appendChild(blank(x)));
      tr.parentElement.insertBefore(nr, op === 'rowAbove' ? tr : tr.nextSibling); placeIn(nr.cells[i]);
    } else if (op === 'colLeft' || op === 'colRight') {
      const half = colPct(table, i) / 2;
      [...table.rows].forEach((r) => { const ref = r.cells[Math.min(i, r.cells.length - 1)]; if (!ref) return; const n = blank(ref); n.style.backgroundColor = ''; r.insertBefore(n, op === 'colLeft' ? ref : ref.nextSibling); });
      setCol(table, i, half); setCol(table, i + 1, half); placeIn(tr.cells[op === 'colLeft' ? i : i + 1]);
    } else if (op === 'rowDel') {
      const next = tr.nextElementSibling || tr.previousElementSibling;
      tr.remove(); if (!table.rows.length) table.remove(); else placeIn(next?.cells[Math.min(i, next.cells.length - 1)]);
    } else if (op === 'colDel') {
      const w = colPct(table, i), nb = i > 0 ? i - 1 : 0;
      [...table.rows].forEach((r) => r.cells[i]?.remove());
      if (!table.rows[0]?.cells.length) table.remove(); else { setCol(table, nb, colPct(table, nb) + w); placeIn(tr.cells[nb]); }
    } else if (op === 'tableDel') table.remove();
    rte.focus(); done();
  };
  const insertTable = (rows, cols) => {
    const w = (100 / cols).toFixed(2);
    const row = `<tr>${`<td style="${MAIL_CELL}width:${w}%;"><br></td>`.repeat(cols)}</tr>`;
    exec('insertHTML', `<table data-tbl="1" style="border-collapse:collapse;width:100%;"><tbody>${row.repeat(rows)}</tbody></table><div><br></div>`);
    const t = [...rte.querySelectorAll('table[data-tbl]')].pop(); placeIn(t?.rows[0]?.cells[0]); onSel();
  };
  // 표 크기 고르기: 행×열 격자
  const tablePicker = (btn) => {
    const wrap = btn.parentElement, old = wrap.querySelector('.mail-tgrid');
    if (old) { old.close(); return; }
    const R = 8, C = 10, box = document.createElement('div');
    box.className = 'mail-tgrid';
    box.innerHTML = `<div class="mail-tgrid-c">${Array.from({ length: R * C }, (_, k) => `<span data-r="${Math.floor(k / C) + 1}" data-c="${(k % C) + 1}"></span>`).join('')}</div><div class="mail-tgrid-n">표 넣기</div>`;
    const lbl = box.querySelector('.mail-tgrid-n');
    const onDown = (e) => { if (!box.contains(e.target) && !btn.contains(e.target)) box.close(); };
    const onKey = (e) => { if (e.key === 'Escape') box.close(); };
    box.close = () => { box.remove(); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); };
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-r]'); if (!t) return;
      const r = +t.dataset.r, cc = +t.dataset.c;
      box.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', +x.dataset.r <= r && +x.dataset.c <= cc));
      lbl.textContent = `${r} × ${cc}`;
    });
    box.addEventListener('click', (e) => { const t = e.target.closest('[data-r]'); if (!t) return; box.close(); insertTable(+t.dataset.r, +t.dataset.c); });
    wrap.appendChild(box);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
  };

  tools.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  tools.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => {
    const cmd = b.dataset.ex;
    if (cmd === 'table') return tablePicker(b);
    if (['rowAbove', 'rowBelow', 'colLeft', 'colRight', 'rowDel', 'colDel', 'tableDel'].includes(cmd)) return tableOp(cmd);
    if (cmd !== 'createLink') return exec(cmd);
    restore();
    const range = saved && saved.cloneRange();
    const raw = (window.prompt('링크 주소', 'https://') || '').trim();
    if (!raw || raw === 'https://') return;
    const url = /^(https?:|mailto:)/i.test(raw) ? raw : `https://${raw}`;
    rte.focus(); if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
    if (getSelection().isCollapsed) exec('insertHTML', `<a href="${esc(url)}">${esc(url)}</a>`);
    else exec('createLink', url);
  }));
  const size = tools.querySelector('#mail-esize');
  size.addEventListener('change', () => {
    const px = size.value; if (!px) return;
    restore();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    rte.querySelectorAll('font[size="7"]').forEach((n) => { const sp = document.createElement('span'); sp.style.fontSize = `${px}px`; sp.append(...n.childNodes); n.replaceWith(sp); });
    done();
  });
  const font = tools.querySelector('#mail-efont');
  font.addEventListener('change', () => { const f = MAIL_FONTS[Number(font.value)]; if (f) exec('fontName', f[1], true); });
  const bindColor = (id, key, apply) => {
    const inp = tools.querySelector(`#${id}`), bar = tools.querySelector(`[data-bar="${id}"]`);
    bar.style.background = inp.value;
    inp.addEventListener('change', () => { c[key] = inp.value; bar.style.background = inp.value; apply(inp.value); });
  };
  bindColor('mail-ecolor', 'color', (v) => exec('foreColor', v, true));
  bindColor('mail-ebg', 'bg', (v) => exec('hiliteColor', v, true));
  bindColor('mail-ecell', 'cellBg', (v) => {
    const td = curCell(); if (!td) return;
    const table = td.closest('table');
    const picked = saved && !saved.collapsed ? [...table.querySelectorAll('td,th')].filter((x) => saved.intersectsNode(x)) : [];
    (picked.length ? picked : [td]).forEach((x) => { x.style.backgroundColor = v; });
    rte.focus(); done();
  });

  // 열 경계 끌어서 너비 조절 (표 오른쪽 끝 열은 제외)
  let hover = null, drag = false;
  rte.addEventListener('mousemove', (e) => {
    if (drag) return;
    const td = e.target.closest && e.target.closest('td,th');
    const ok = td && td.closest('table[data-tbl]') && rte.contains(td) && td.nextElementSibling && td.getBoundingClientRect().right - e.clientX <= 5;
    hover = ok ? td : null;
    rte.classList.toggle('col-rs', !!ok);
  });
  rte.addEventListener('mousedown', (e) => {
    if (!hover) return;
    e.preventDefault();
    const td = hover, nx = td.nextElementSibling, table = td.closest('table'), i = td.cellIndex;
    const tw = table.getBoundingClientRect().width, w1 = td.getBoundingClientRect().width, w2 = nx.getBoundingClientRect().width, x0 = e.clientX;
    drag = true; rte.classList.add('col-drag');
    const move = (ev) => {
      const d = Math.max(30 - w1, Math.min(w2 - 30, ev.clientX - x0));
      setCol(table, i, ((w1 + d) / tw) * 100); setCol(table, i + 1, ((w2 - d) / tw) * 100);
    };
    const up = () => {
      drag = false; rte.classList.remove('col-drag', 'col-rs'); hover = null;
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      done();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  rte.addEventListener('paste', (e) => {
    const html = e.clipboardData?.getData('text/html'); if (!html) return;
    e.preventDefault();
    exec('insertHTML', mailFixHtml(mailSanitize(html.replace(/<!--(Start|End)Fragment-->/g, ''))));
  });
  rte.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  rte.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); c.html = rte.innerHTML; mailAddFiles(e.dataTransfer.files); } });
}

/* 옵션: 발송 예약 · 서명 · 일반 텍스트 모드 · 중요. [확인]을 눌러야 적용 */
function mailOptions(btn) {
  const c = ui.mail.compose, wrap = btn.parentElement, sig = ui.mail.sig;
  const old = wrap.querySelector('.mail-opt');
  if (old) { old.close(); return; }
  const n = new Date(Date.now() + 3600e3), today = new Date();
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const s = c.sched || { date: ymd(n), h: pad(n.getHours()), m: '00' };
  const box = document.createElement('div');
  box.className = 'mail-opt';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '옵션');
  box.innerHTML = `
    <div class="mail-opt-g"><div class="mail-opt-t">발송 예약</div>
      <div class="mail-opt-row"><input type="checkbox" class="check" id="op-sched" ${c.sched ? 'checked' : ''} aria-label="발송 예약">
        <input type="date" class="input" id="op-date" value="${s.date}" min="${ymd(today)}" aria-label="날짜">
        <select class="select" id="op-h" aria-label="시">${Array.from({ length: 24 }, (_, i) => pad(i)).map((v) => `<option value="${v}" ${v === s.h ? 'selected' : ''}>${v}시</option>`).join('')}</select>
        <select class="select" id="op-m" aria-label="분">${Array.from({ length: 12 }, (_, i) => pad(i * 5)).map((v) => `<option value="${v}" ${v === s.m ? 'selected' : ''}>${v}분</option>`).join('')}</select></div>
      <div class="mail-opt-tz">GMT+09:00</div></div>
    <div class="mail-opt-g"><div class="mail-opt-t">서명</div>
      <select class="select" id="op-sig" ${sig ? '' : 'disabled'}>${sig ? `<option value="1" ${c.sigOn ? 'selected' : ''}>메일 명함</option><option value="0" ${c.sigOn ? '' : 'selected'}>사용 안 함</option>` : '<option value="0">등록된 서명 없음</option>'}</select></div>
    <div class="mail-opt-g"><div class="mail-opt-t">쓰기 옵션</div><label class="mail-opt-ck"><input type="checkbox" class="check" id="op-plain" ${c.plain ? 'checked' : ''}>일반 텍스트 모드</label></div>
    <div class="mail-opt-g"><div class="mail-opt-t">보내기 옵션</div><label class="mail-opt-ck"><input type="checkbox" class="check" id="op-imp" ${c.important ? 'checked' : ''}>중요!</label></div>
    <button type="button" class="btn primary sm mail-opt-ok" id="op-ok">확인</button>`;
  const q = (sel) => box.querySelector(sel);
  const lock = () => { const on = q('#op-sched').checked; ['#op-date', '#op-h', '#op-m'].forEach((k) => { q(k).disabled = !on; }); };
  const onDown = (e) => { if (!box.contains(e.target) && !btn.contains(e.target)) box.close(); };
  const onKey = (e) => { if (e.key === 'Escape') box.close(); };
  box.close = () => { box.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); };
  q('#op-sched').addEventListener('change', lock);
  q('#op-ok').addEventListener('click', () => {
    let sched = null;
    if (q('#op-sched').checked) {
      sched = { date: q('#op-date').value, h: q('#op-h').value, m: q('#op-m').value };
      if (!sched.date || !(mailSchedDate(sched) > Date.now() + 60e3)) return toast('예약 시간은 지금 이후로 정하세요');
    }
    box.close();
    mailApplyOptions(c, { sched, sigOn: q('#op-sig').value === '1', plain: q('#op-plain').checked, important: q('#op-imp').checked });
  });
  lock();
  wrap.appendChild(box);
  btn.setAttribute('aria-expanded', 'true');
  document.addEventListener('mousedown', onDown, true);
  document.addEventListener('keydown', onKey);
}

function mailApplyOptions(c, o) {
  const sig = ui.mail.sig;
  const sigText = sig ? mailHtmlToText(sig) : '';
  const cutSig = (t) => { const i = sigText ? t.lastIndexOf(sigText) : -1; return i < 0 ? null : (t.slice(0, i) + t.slice(i + sigText.length)).replace(/\s+$/, ''); };
  c.sched = o.sched; c.important = o.important;
  if (o.plain !== c.plain) {
    if (o.plain) c.text = mailHtmlToText(c.html);
    else {
      const cut = c.sigOn ? cutSig(c.text) : null;
      c.html = `${mailTextHtml(cut ?? c.text)}<div><br></div>${cut != null ? mailSigBlock(sig) : ''}`;
      c.sigOn = cut != null;
    }
    c.plain = o.plain;
  }
  if (sig && o.sigOn !== c.sigOn) {
    if (c.plain) c.text = o.sigOn ? `${c.text.replace(/\s+$/, '')}\n\n${sigText}` : cutSig(c.text) ?? c.text;
    else {
      const doc = new DOMParser().parseFromString(c.html, 'text/html');
      doc.body.querySelectorAll('[data-sig]').forEach((x) => x.remove());
      c.html = doc.body.innerHTML + (o.sigOn ? mailSigBlock(sig) : '');
    }
    c.sigOn = o.sigOn;
  }
  mailEdited(c);
  mailDrawCompose();
}

/* 미리보기: 받는 사람·제목·본문(서명·원문 포함)을 보내질 모양 그대로 */
function mailPreview() {
  const c = ui.mail.compose, b = mailComposeBody(c);
  const rows = [['받는 사람', c.to], ...(c.each ? [] : [['참조', c.cc], ['숨은참조', c.bcc]])].filter((r) => r[1].trim());
  const files = [...c.existing, ...c.files].map((x) => x.name).join(', ');
  const w = mailModal(`<div class="mail-pv-head"><h3>${c.important ? '<span class="mail-optchip imp">중요</span>' : ''}${esc(c.subject.trim() || '(제목 없음)')}</h3><button class="iconbtn" type="button" data-close aria-label="닫기">${mi('close')}</button></div>
    <dl class="mail-pv-meta">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(mailTokens(v).join(', '))}</dd>`).join('')}${files ? `<dt>첨부</dt><dd>${esc(files)}</dd>` : ''}${c.sched ? `<dt>발송</dt><dd>${mailSchedLabel(c.sched)} 예약</dd>` : ''}</dl>
    <iframe class="mail-frame" sandbox referrerpolicy="no-referrer" title="미리보기"></iframe>`, 'mail-pvw');
  w.querySelector('iframe').srcdoc = mailFrameDoc(b.contentType === 'Text' ? `<pre>${esc(b.content)}</pre>` : b.content, false);
}

/* 주소록: 자주 연락한 사람(/me/people)에서 골라 해당 칸에 넣는다 */
function mailBook(tok) {
  const label = tok.closest('.mail-field').querySelector('.mail-flbl').firstChild.textContent.trim();
  const picked = new Map();
  const w = mailModal(`<div class="mail-pv-head"><h3>주소록<span class="mail-book-to">${esc(label)}</span></h3><button class="iconbtn" type="button" data-close aria-label="닫기">${mi('close')}</button></div>
    <div class="mail-book-s"><span class="mail-search-ic">${ico('search', 'sm')}</span><input class="input" type="search" placeholder="이름·메일 검색" autocomplete="off" aria-label="주소록 검색"></div>
    <ul class="mail-book-l"><li class="empty">불러오는 중…</li></ul>
    <div class="mail-dialog-actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-add disabled>추가</button></div>`, 'mail-bookw');
  const list = w.querySelector('.mail-book-l'), inp = w.querySelector('input'), add = w.querySelector('[data-add]');
  let rows = [], timer = null, seq = 0;
  const draw = () => {
    list.innerHTML = rows.length ? rows.map((p, i) => `<li><label><input type="checkbox" class="check" data-i="${i}" ${picked.has(p.address) ? 'checked' : ''}><b>${esc(p.name || p.address)}</b><span class="muted">${esc(p.address)}</span></label></li>`).join('') : '<li class="empty">결과 없음</li>';
  };
  const load = async (term) => {
    const my = ++seq;
    try {
      const qs = term ? `$search=${encodeURIComponent(`"${term.replace(/"/g, '')}"`)}&` : '';
      const j = await G.get(`/me/people?${qs}$top=40&$select=displayName,scoredEmailAddresses`);
      if (my !== seq) return;
      rows = (j.value || []).flatMap((p) => (p.scoredEmailAddresses || []).slice(0, 1).map((s) => ({ name: p.displayName || '', address: s.address }))).filter((p) => p.address);
      draw();
    } catch (e) { if (my === seq) list.innerHTML = `<li class="empty">${esc(e.message)}</li>`; }
  };
  list.addEventListener('change', (e) => {
    const i = e.target.dataset.i; if (i == null) return;
    const p = rows[Number(i)];
    if (e.target.checked) picked.set(p.address, p); else picked.delete(p.address);
    add.disabled = !picked.size; add.textContent = picked.size ? `${picked.size}명 추가` : '추가';
  });
  inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load(inp.value.trim()), 250); });
  add.addEventListener('click', () => {
    for (const p of picked.values()) tok.mailAdd(mailLabel(p.name, p.address));
    w.close();
  });
  inp.focus();
  load('');
}

function mailAddFiles(list) {
  const c = ui.mail.compose; if (!c) return;
  if (c.sending) return toast('보내는 중입니다');
  for (const file of list) {
    if (file.size > MAIL_MAX_ATTACH) { toast(`${file.name}: 3MB 이하 파일만 첨부할 수 있습니다`); continue; }
    c.files.push(file); mailEdited(c);
  }
  mailDrawCompose();
}

/* it: 그릴 때의 첨부 항목 { att: 올린 첨부 } | { file: 올릴 파일 } — 번호가 아니라 그 객체로 뺀다 (올리는 중에 순서가 바뀌어도) */
async function mailRemoveFile(c, it) {
  if (!it || c.busy || c.sending) return;
  if (it.file) c.files = c.files.filter((x) => x !== it.file);
  else {
    try { await G.del(`/me/messages/${encodeURIComponent(c.draftId)}/attachments/${encodeURIComponent(it.att.id)}`); c.existing = c.existing.filter((a) => a.id !== it.att.id); }
    catch (e) { toast(e.message); }
  }
  if (ui.mail.compose === c) mailDrawCompose();
}

/* 받는이 칸: 마지막 주소 조각으로 /me/people 검색. 후보가 뜨면 첫 번째가 기본 선택이라 Enter 한 번에 들어간다.
   한글 조합 중 Enter는 조합이 끝난 뒤 그 글자로 다시 찾아 첫 후보를 넣고, 후보가 없으면 입력값을 주소로 확정한다. */
function mailAutocomplete(box) {
  const input = box.querySelector('input:not([type=hidden])'), sug = box.querySelector('.mail-sug');
  let timer = null, items = [], idx = -1, seq = 0, pending = false, loading = false;
  const close = () => { sug.hidden = true; items = []; idx = -1; };
  const pick = (i) => {
    const p = items[i]; if (!p) return;
    const label = mailLabel(p.name, p.address);
    close();
    if (box.mailAdd) { box.mailAdd(label); input.focus(); return; }
    const parts = input.value.split(/[,;]/); parts.pop();
    input.value = [...parts.map((s) => s.trim()).filter(Boolean), label].join(', ') + ', ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  };
  const draw = () => {
    sug.innerHTML = items.map((p, i) => `<li class="${i === idx ? 'on' : ''}" data-i="${i}"><b>${esc(p.name)}</b><span class="muted">${esc(p.address)}</span></li>`).join('');
    sug.hidden = !items.length;
    sug.querySelectorAll('[data-i]').forEach((li) => li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(Number(li.dataset.i)); }));
  };
  // 조합 중 눌린 Enter의 마무리: 후보가 있으면 첫 번째, 없으면 쓴 그대로 주소 칩
  const finish = (my) => {
    if (!pending || my !== seq) return;
    pending = false;
    if (items.length) pick(0); else if (box.mailCommit) box.mailCommit();
  };
  const search = (immediate) => {
    clearTimeout(timer);
    const my = ++seq;
    const term = input.value.split(/[,;]/).pop().trim();
    if (term.length < 1 || term.includes('@')) { loading = false; close(); finish(my); return; }
    loading = true;
    timer = setTimeout(async () => {
      try {
        const j = await G.get(`/me/people?$search=${encodeURIComponent(`"${term.replace(/"/g, '')}"`)}&$top=6&$select=displayName,scoredEmailAddresses`);
        if (my !== seq) return;
        items = (j.value || []).flatMap((p) => (p.scoredEmailAddresses || []).slice(0, 1).map((s) => ({ name: p.displayName || '', address: s.address }))).filter((p) => p.address);
        idx = items.length ? 0 : -1; draw();
      } catch { if (my === seq) close(); }
      if (my === seq) loading = false;
      finish(my);
    }, immediate ? 0 : 250);
  };
  input.addEventListener('input', () => search(false));
  input.addEventListener('compositionend', () => { if (pending) search(true); });
  input.addEventListener('keydown', (e) => {
    const enter = e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter';
    if (enter && (e.isComposing || e.keyCode === 229)) { e.stopImmediatePropagation(); pending = true; return; }
    // 검색 결과가 오기 전에 누른 Enter도 결과를 기다렸다 첫 후보를 넣는다
    if (enter && (pending || loading)) { e.preventDefault(); e.stopImmediatePropagation(); pending = true; return; }
    if (sug.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; draw(); }
    else if (enter && items.length) { e.preventDefault(); e.stopImmediatePropagation(); pick(Math.max(idx, 0)); }
    else if (e.key === 'Escape') close();
  }, true); // 캡처: 주소 칩 칸의 Enter(입력값 그대로 확정)보다 먼저
  input.addEventListener('blur', () => setTimeout(() => { if (!pending) close(); }, 120));
}

function mailFileB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error(`${file.name} 읽기 실패`));
    r.readAsDataURL(file);
  });
}

/* 초안을 만들거나 고친다. 첨부도 올린다. 반환: 초안 id */
async function mailSaveDraft(c, notify) {
  if (c.loading) { toast('불러오는 중입니다'); return null; }
  if (c.busy || (notify && c.sending)) { if (notify) toast(c.sending ? '보내는 중입니다' : '저장 중입니다'); return null; }
  let msg;
  try {
    msg = {
      subject: c.subject.trim(),
      toRecipients: mailParseAddrs(c.to, '받는 사람'),
      ccRecipients: c.each ? [] : mailParseAddrs(c.cc, '참조'), bccRecipients: c.each ? [] : mailParseAddrs(c.bcc, '숨은참조'),
      body: mailComposeBody(c),
      importance: c.important ? 'high' : 'normal',
    };
  } catch (e) { toast(e.message); return null; }
  // 발송 예약: PidTagDeferredSendTime. 예약을 껐으면 지난 시각으로 덮어 바로 보내지게 한다
  const at = c.sched ? mailSchedDate(c.sched) : c.schedSaved ? Date.now() - 60e3 : 0;
  if (at) msg.singleValueExtendedProperties = [{ id: 'SystemTime 0x3FEF', value: new Date(at).toISOString() }];
  const rev = c.rev;
  c.busy = true; mailLockFiles(c);
  try {
    if (c.draftId) await G.patch(`/me/messages/${encodeURIComponent(c.draftId)}`, msg);
    else { const d = await G.post('/me/messages', msg); c.draftId = d.id; }
    c.schedSaved = !!c.sched;
    while (c.files.length) {
      const file = c.files[0];
      const a = await G.post(`/me/messages/${encodeURIComponent(c.draftId)}/attachments`, {
        '@odata.type': '#microsoft.graph.fileAttachment', name: file.name, contentType: file.type || 'application/octet-stream', contentBytes: await mailFileB64(file),
      });
      c.existing.push({ id: a.id, name: a.name, size: a.size });
      c.files = c.files.filter((x) => x !== file);
    }
    c.saved = c.rev === rev; c.kept = true; // 저장하는 사이에 고쳤으면 아직 저장 안 된 것
    if (notify) { toast('임시보관함에 저장했습니다'); mailLoadCounts(); if (ui.mail.compose === c) mailDrawCompose(); }
    return c.draftId;
  } catch (e) { toast(e.message); return null; }
  finally { c.busy = false; mailLockFiles(c); }
}

async function mailSend(c) {
  if (c.sending) return;
  if (c.busy) return toast('저장 중입니다. 잠시 후 다시 눌러 주세요');
  let to, cc, bcc;
  try { to = mailParseAddrs(c.to, '받는 사람'); cc = c.each ? [] : mailParseAddrs(c.cc, '참조'); bcc = c.each ? [] : mailParseAddrs(c.bcc, '숨은참조'); }
  catch (e) { return toast(e.message); }
  if (!to.length) return toast('받는 사람을 입력하세요');
  if (c.sched && !(mailSchedDate(c.sched) > Date.now() + 60e3)) return toast('예약 시간이 지났습니다. 옵션에서 다시 정하세요');
  const each = c.each && to.length > 1;
  const names = (arr) => arr.map((r) => r.emailAddress.name ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress.address).join(', ');
  const ok = await mailConfirm({
    title: c.sched ? '예약 발송할까요?' : each ? `${to.length}명에게 각각 보낼까요?` : '이 메일을 보낼까요?',
    rows: [['받는 사람', names(to)], ['참조', names(cc)], ['숨은참조', names(bcc)], ['제목', c.subject.trim() || '(제목 없음)'],
      ['첨부', c.existing.length + c.files.length ? `${c.existing.length + c.files.length}개` : ''],
      ['발송', c.sched ? `${mailSchedLabel(c.sched)} 예약` : ''],
      ['옵션', [c.important && '중요', each && '개인별 보내기'].filter(Boolean).join(' · ')]],
    ok: c.sched ? '예약' : '보내기',
  });
  if (!ok || c.sending || ui.mail.compose !== c) return;
  c.sending = true; mailLockFiles(c); // 보내는 동안(첨부 올리기 포함) 닫기·첨부 빼기·저장을 막는다
  const btns = document.querySelectorAll('#mail-cf [type=submit]'); btns.forEach((b) => { b.disabled = true; });
  const enc = encodeURIComponent, sent = [];
  try {
    const id = await mailSaveDraft(c, false);
    if (!id) { btns.forEach((b) => { b.disabled = false; }); return; }
    try {
      // 개인별 보내기: 첨부까지 올린 초안을 받는 사람 수만큼 복사해 한 명씩 보낸다
      if (each) {
        for (const r of to.slice(1)) {
          const cp = await G.post(`/me/messages/${enc(id)}/copy`, { destinationId: 'drafts' });
          try {
            await G.patch(`/me/messages/${enc(cp.id)}`, { toRecipients: [r], ccRecipients: [], bccRecipients: [] });
            await G.post(`/me/messages/${enc(cp.id)}/send`, {}, { type: 'none' });
          } catch (err) { G.del(`/me/messages/${enc(cp.id)}`).catch(() => {}); throw err; } // 못 보낸 복사본은 임시보관함에 남기지 않는다
          sent.push(r);
        }
        await G.patch(`/me/messages/${enc(id)}`, { toRecipients: [to[0]] });
      }
      await G.post(`/me/messages/${enc(id)}/send`, {}, { type: 'none' });
      toast(c.sched ? `${mailSchedLabel(c.sched)}에 보냅니다` : each ? `${to.length}명에게 보냈습니다` : '보냈습니다');
      c.sending = false;
      if (ui.mail.compose === c) { ui.mail.compose = null; mailAfterCompose(true); }
    } catch (e) {
      if (sent.length) {
        // 이미 보낸 사람은 빼고 남은 사람만 받는 사람에 남긴다 (다시 눌러도 두 번 가지 않게)
        const done = new Set(sent.map((r) => r.emailAddress.address.toLowerCase()));
        c.to = mailTokens(c.to).filter((t) => !done.has(((t.match(/<([^>]+)>$/) || [, t])[1]).trim().toLowerCase())).join(', ');
        mailEdited(c); c.sending = false;
        if (ui.mail.compose === c) mailDrawCompose();
        toast(`${sent.length}명에게 보냈고 나머지는 실패했습니다: ${e.message}`);
      } else toast(e.message);
      btns.forEach((b) => { if (b.isConnected) b.disabled = false; });
    }
  } finally { c.sending = false; mailLockFiles(c); }
}

/* 쓰던 메일을 닫아도 되는지 확인. 답장·전달로 자동 생성된 초안은 저장하지 않았으면 지운다 */
async function mailLeaveCompose() {
  const c = ui.mail.compose; if (!c) return true;
  if (c.busy || c.sending) { toast(c.sending ? '보내는 중입니다' : '저장 중입니다'); return false; }
  if (mailDirty(c) && !(await mailConfirm({ title: '작성 중인 메일을 닫을까요?', rows: [['제목', c.subject.trim() || '(제목 없음)']], ok: '닫기' }))) return false;
  if (ui.mail.compose !== c) return true;
  if (c.auto && !c.kept && c.draftId) G.del(`/me/messages/${encodeURIComponent(c.draftId)}`).catch(() => {}); // 한 번도 저장하지 않은 답장·전달 초안
  ui.mail.compose = null;
  return true;
}

function mailAfterCompose(sent) {
  const m = ui.mail;
  m.view = m.sel && m.backTo === 'read' ? 'read' : 'list';
  if (sent && m.folder === 'drafts') { m.sel = null; m.msg = null; m.view = 'list'; }
  mailDrawShell(); mailDrawFolders(); mailDrawPane();
  if (sent || m.folder === 'drafts') { mailLoadList(); mailLoadCounts(); }
}
