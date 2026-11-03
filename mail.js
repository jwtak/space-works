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
const mailAddr = (r) => (r?.emailAddress ? (r.emailAddress.name && r.emailAddress.name !== r.emailAddress.address ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress.address) : '');
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
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/* iframe 안에 들어갈 문서. 스크립트·폼·외부 요청은 막고, 외부 이미지는 사용자가 허용할 때만 */
function mailFrameDoc(html, allowRemote) {
  const csp = `default-src 'none'; img-src ${allowRemote ? 'https: http: ' : ''}data:; style-src 'unsafe-inline'; font-src data:`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">
<style>html,body{margin:0}body{padding:20px 24px;font:14px/1.6 Pretendard,'Malgun Gothic',sans-serif;color:#111827;word-break:break-word;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;font:inherit}a{color:#2563EB}
blockquote{margin:0 0 0 4px;padding-left:12px;border-left:2px solid #E5E7EB;color:#4B5563}
@media (max-width:600px){body{padding:16px;font-size:15px;line-height:1.65}}</style></head><body>${html}</body></html>`;
}

function mailConfirm({ title, rows, ok }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'mail-modal';
    wrap.innerHTML = `<div class="mail-dialog" role="dialog" aria-modal="true" aria-labelledby="mail-dlg-t">
      <h3 id="mail-dlg-t">${esc(title)}</h3>
      <dl>${rows.filter((r) => r[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="mail-dialog-actions"><button class="btn" type="button" data-r="0">취소</button><button class="btn primary" type="button" data-r="1">${esc(ok)}</button></div></div>`;
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-r="1"]').focus();
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
  mailDrawFolders();
  mailDrawPane();
  mailLoadCounts();
  await mailLoadList();
}

function mailDrawShell() {
  const sh = $('#mail-shell'); if (!sh) return;
  sh.dataset.view = ui.mail.compose ? 'compose' : ui.mail.view;
  sh.classList.toggle('composing', !!ui.mail.compose);
  mailSyncBody();
}

/* 폰에서 읽기·쓰기 화면은 하단 탭바 자리에 메일 전용 바를 쓴다 (mail.css가 body 클래스로 탭바를 가린다) */
function mailSyncBody() {
  const m = ui.mail, on = route() === 'mail' && !!m;
  document.body.classList.toggle('mail-reading', on && !m.compose && m.view === 'read');
  document.body.classList.toggle('mail-composing', on && !!m.compose);
}
window.addEventListener('hashchange', () => { if (route() !== 'mail') document.body.classList.remove('mail-reading', 'mail-composing'); });

function mailDrawFolders() {
  const nav = $('#mail-fnav'); if (!nav) return;
  const m = ui.mail;
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
  if (!more) { m.list = []; m.next = null; m.checked.clear(); box.innerHTML = '<li class="empty">불러오는 중…</li>'; }
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
    if (route() !== 'mail') return;
    m.list = more ? m.list.concat(j.value) : j.value;
    m.next = j['@odata.nextLink'] || null;
    mailDrawList();
  } catch (e) {
    box.innerHTML = `<li class="empty">${esc(e.message)}</li>`;
  } finally { m.loading = false; }
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
  const box = $('#mail-items'); if (box) m.scroll = box.scrollTop; // ← 목록으로 돌아올 때 같은 위치
  m.sel = id; m.msg = null; m.atts = []; m.remote = false; m.view = 'read';
  mailDrawShell(); mailDrawList(); mailDrawPane();
  try {
    const [msg, atts] = await Promise.all([
      G.get(`/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,body,hasAttachments,isRead,isDraft,webLink,flag`),
      G.get(`/me/messages/${encodeURIComponent(id)}/attachments?$select=id,name,size,contentType,isInline`).then((r) => r.value).catch(() => []),
    ]);
    if (m.sel !== id) return;
    // 본문 속 cid: 이미지(서명 로고 등)는 첨부에서 꺼내 data: 주소로 바꾼다
    if (msg.body?.contentType === 'html' && /cid:/i.test(msg.body.content)) {
      for (const a of atts.filter((x) => x.isInline && x.size < MAIL_MAX_ATTACH)) {
        try {
          const full = await G.get(`/me/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(a.id)}`);
          if (full.contentId && full.contentBytes) msg.body.content = msg.body.content.split(`cid:${full.contentId}`).join(`data:${full.contentType || 'image/png'};base64,${full.contentBytes}`);
        } catch { /* 이미지 하나 실패해도 본문은 보인다 */ }
      }
    }
    m.msg = msg; m.atts = atts.filter((a) => !a.isInline);
    mailDrawPane();
    if (!msg.isRead) {
      G.patch(`/me/messages/${encodeURIComponent(id)}`, { isRead: true }).then(() => {
        if (item) item.isRead = true;
        const c = m.counts[m.folder]; if (c && c.unread) c.unread -= 1;
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
    const done = (v) => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
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
  const attTotal = m.atts.reduce((s, a) => s + (a.size || 0), 0);
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
        <button class="btn sm mail-back" type="button" id="mail-back" aria-label="목록">${ico('left', 'sm')}<span>목록</span></button>
        <button class="btn sm" type="button" data-act="reply">${ico('reply', 'sm')}답장</button>
        <button class="btn sm" type="button" data-act="replyAll">전체 답장</button>
        <button class="btn sm" type="button" data-act="forward">${ico('forward', 'sm')}전달</button>
        <span class="mail-tools-r">
          <button class="btn sm ghost" type="button" data-act="unread">안 읽음</button>
          <button class="iconbtn" type="button" data-act="${inTrash ? 'purge' : 'delete'}" title="${inTrash ? '영구 삭제' : '삭제'}" aria-label="${inTrash ? '영구 삭제' : '삭제'}">${ico('trash', 'sm')}</button>
          ${x.webLink ? `<a class="iconbtn" href="${esc(x.webLink)}" target="_blank" rel="noopener" title="Outlook에서 열기" aria-label="Outlook에서 열기">${ico('ext', 'sm')}</a>` : ''}
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
        <dt>날짜</dt><dd>${mailFullTime(x.receivedDateTime || x.sentDateTime)}</dd>
      </dl>
      ${m.atts.length ? `<div class="mail-atts">${m.atts.map((a) => `<button type="button" class="mail-att" data-att="${esc(a.id)}">${ico('clip', 'sm')}<span>${esc(a.name)}</span><span class="muted">${mailSize(a.size)}</span></button>`).join('')}</div>
      <div class="mail-matts">
        <div class="mail-matts-h"><span>첨부 ${m.atts.length}개 <span class="muted">(${mailSize(attTotal)})</span></span><button type="button" class="mail-linkbtn" id="mail-dlall">모두 저장</button></div>
        ${m.atts.map((a) => `<button type="button" class="mail-matt" data-att="${esc(a.id)}"><span class="mail-fic" style="color:${mailExtColor(a.name)}">${mi('doc')}</span><span class="mail-matt-n">${esc(a.name)}</span><span class="muted">(${mailSize(a.size)})</span><span class="mail-matt-dl">${mi('dl')}</span></button>`).join('')}
      </div>` : ''}
      ${hasRemote && !m.remote ? '<div class="mail-remote">외부 이미지 차단됨 <button class="btn sm ghost" type="button" id="mail-remote">이미지 보기</button></div>' : ''}
    </div>
    <iframe class="mail-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="메일 본문"></iframe>`;
  pane.querySelector('.mail-frame').srcdoc = mailFrameDoc(html, m.remote);
  const back = () => {
    m.view = 'list'; mailDrawShell();
    const box = $('#mail-items'); if (box) box.scrollTop = m.scroll || 0;
  };
  $('#mail-back').addEventListener('click', back);
  $('#mail-mback').addEventListener('click', back);
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
  const dlAll = $('#mail-dlall');
  if (dlAll) dlAll.addEventListener('click', async () => { for (const a of m.atts) await mailDownload(x.id, a); });
  const rb = $('#mail-remote'); if (rb) rb.addEventListener('click', () => { m.remote = true; mailDrawPane(); });
  pane.querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => mailDownload(x.id, m.atts.find((a) => a.id === b.dataset.att))));
  pane.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => mailAction(b.dataset.act, x)));
}

async function mailDownload(msgId, att) {
  if (!att) return;
  try {
    const blob = await G.get(`/me/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(att.id)}/$value`, { type: 'blob' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = att.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast(e.message); }
}

async function mailAction(act, x) {
  const m = ui.mail;
  try {
    if (act === 'reply' || act === 'replyAll' || act === 'forward') return mailOpenCompose({ mode: act, id: x.id });
    if (act === 'unread') {
      await G.patch(`/me/messages/${encodeURIComponent(x.id)}`, { isRead: false });
      const it = m.list.find((i) => i.id === x.id); if (it) it.isRead = false;
      const c = m.counts[m.folder]; if (c) c.unread += 1;
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
  if (m.compose && !(await mailLeaveCompose())) return;
  const c = { mode, draftId: null, auto: false, saved: false, to: '', cc: '', bcc: '', subject: '', text: '', quote: '', existing: [], files: [], busy: false };
  m.compose = c; m.view = 'compose';
  mailDrawShell(); mailDrawFolders(); mailDrawPane();
  try {
    if (mode === 'reply' || mode === 'replyAll' || mode === 'forward') {
      const fn = { reply: 'createReply', replyAll: 'createReplyAll', forward: 'createForward' }[mode];
      const d = await G.post(`/me/messages/${encodeURIComponent(id)}/${fn}`, {});
      Object.assign(c, { draftId: d.id, auto: true, to: mailAddrList(d.toRecipients), cc: mailAddrList(d.ccRecipients), subject: d.subject || '', quote: d.body?.content || '' });
    } else if (mode === 'draft') {
      const d = await G.get(`/me/messages/${encodeURIComponent(id)}?$select=id,subject,toRecipients,ccRecipients,bccRecipients,body`);
      Object.assign(c, { draftId: d.id, saved: true, to: mailAddrList(d.toRecipients), cc: mailAddrList(d.ccRecipients), bcc: mailAddrList(d.bccRecipients), subject: d.subject || '',
        text: d.body?.contentType === 'html' ? mailHtmlToText(d.body.content) : d.body?.content || '' });
    }
    if (c.draftId) c.existing = (await G.get(`/me/messages/${encodeURIComponent(c.draftId)}/attachments?$select=id,name,size,isInline`)).value.filter((a) => !a.isInline);
  } catch (e) { toast(e.message); }
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
    chips.innerHTML = toks().map((t, i) => `<span class="mail-chip ${mailTokOk(t) ? '' : 'bad'}" title="${esc(t)}">${esc(mailTokLabel(t))}<button type="button" data-x="${i}" aria-label="${esc(mailTokLabel(t))} 빼기">×</button></span>`).join('');
    chips.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const a = toks(); a.splice(Number(b.dataset.x), 1); set(a); inp.focus(); }));
  };
  const commit = () => { const v = inp.value.trim(); if (!v) return; inp.value = ''; set([...toks(), ...mailTokens(v)]); };
  inp.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ';') && inp.value.trim()) { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && !inp.value && toks().length) { const a = toks(); a.pop(); set(a); }
  });
  inp.addEventListener('input', () => { if (/[,;]/.test(inp.value)) commit(); });
  inp.addEventListener('blur', () => setTimeout(commit, 160));
  box.mailAdd = (t) => { inp.value = ''; set([...toks(), t]); };
  box.mailCommit = commit;
  draw();
}

function mailDrawCompose() {
  const c = ui.mail.compose, pane = $('#mail-pane'); if (!pane || !c) return;
  const title = { new: '메일 쓰기', reply: '답장', replyAll: '전체 답장', forward: '전달', draft: '임시 저장한 메일' }[c.mode];
  const tokField = (key, label, pre = '', post = '') => `<div class="mail-field mail-addrf ${key === 'cc' || key === 'bcc' ? 'mail-ccf' : ''}"><span class="mail-flbl">${label}${pre}</span>
    <div class="mail-ac mail-tok"><input type="hidden" name="${key}" value="${esc(c[key])}"><span class="mail-chips"></span><input class="mail-tok-in" autocomplete="off" aria-label="${label}" enterkeyhint="next"><ul class="mail-sug" hidden></ul></div>${post}</div>`;
  const files = [...c.existing.map((a) => ({ k: `e:${a.id}`, name: a.name, size: a.size })), ...c.files.map((f, i) => ({ k: `f:${i}`, name: f.name, size: f.size }))];
  const ccOpen = c.ccOpen || !!(c.cc.trim() || c.bcc.trim());
  const me = typeof G !== 'undefined' && G.account ? G.account : null;
  const myAddr = me?.username || '', myName = me?.name || '';
  pane.innerHTML = `
    <form class="mail-compose ${ccOpen ? 'cc-open' : ''}" id="mail-cf" novalidate>
      <div class="mail-chead">
        <button class="iconbtn mail-back" type="button" data-c="cancel" aria-label="닫기">${ico('left')}</button>
        <span class="mail-cbtns">
          <button class="btn primary mail-send" type="submit">${ico('send', 'sm')}보내기</button>
          <button class="btn mail-dsave" type="button" data-c="save">임시 저장</button>
          <button class="btn mail-dcancel" type="button" data-c="cancel">취소</button>
        </span>
        <h2>${title}</h2>
        <span class="mail-tools-r">
          <button class="iconbtn mail-send-m" type="submit" aria-label="보내기">${ico('send')}</button>
          <button class="iconbtn mail-cmore" type="button" id="mail-cmore" aria-label="더보기">${mi('more')}</button>
        </span>
      </div>
      ${myAddr ? `<div class="mail-field mail-fromf"><span class="mail-flbl">보낸 사람</span><span class="mail-chip mail-chip-ro">${esc(myName ? `${myName} <${myAddr}>` : myAddr)}</span></div>` : ''}
      ${tokField('to', '받는 사람', `<button type="button" class="iconbtn mail-cc-tg" id="mail-cc-tg" aria-expanded="${ccOpen}" aria-label="참조·숨은참조">${mi('down')}</button>`, `<button type="button" class="iconbtn mail-addr-add" id="mail-addr-add" aria-label="주소 추가">${mi('plusc')}</button>`)}
      ${tokField('cc', '참조')}${tokField('bcc', '숨은참조')}
      <label class="mail-field mail-subjf"><span class="mail-flbl">제목</span><input class="input" name="subject" value="${esc(c.subject)}" placeholder="제목을 입력해주세요."></label>
      <div class="mail-field mail-files ${files.length ? 'has-files' : ''}"><span class="mail-flbl">파일 첨부</span><div class="mail-drop" id="mail-drop">
        <div class="mail-drop-top">
          <label class="btn sm mail-dfile">${ico('clip', 'sm')}파일 추가<input type="file" multiple hidden id="mail-file"></label>
          <span class="mail-drop-tx">여기로 파일을 끌어놓으세요</span>
          <span class="mail-drop-sz">${files.length ? `${files.length}개 · ${mailSize(files.reduce((s, f) => s + (f.size || 0), 0))}` : '파일당 3MB까지'}</span>
        </div>
        ${files.length ? `<div class="mail-flist">${files.map((f) => `<span class="mail-file">${esc(f.name)}<span class="muted">${mailSize(f.size)}</span><button type="button" class="iconbtn" data-rm="${f.k}" aria-label="첨부 빼기">${ico('trash', 'sm')}</button></span>`).join('')}</div>` : ''}
      </div></div>
      <textarea class="mail-body" name="text" placeholder="내용">${esc(c.text)}</textarea>
      ${c.quote ? `<details class="mail-quote"><summary>원문 보기</summary><iframe class="mail-frame" sandbox referrerpolicy="no-referrer" title="원문"></iframe></details>` : ''}
      <div class="mail-ctools">
        <label class="iconbtn mail-ctool" aria-label="사진 첨부">${mi('camera')}<input type="file" accept="image/*" capture="environment" hidden id="mail-cam"></label>
        <label class="iconbtn mail-ctool" aria-label="파일 첨부">${ico('clip')}<input type="file" multiple hidden id="mail-file2"></label>
      </div>
    </form>`;
  const f = $('#mail-cf');
  if (c.quote) f.querySelector('.mail-quote .mail-frame').srcdoc = mailFrameDoc(c.quote, false);
  const sync = () => { for (const k of ['to', 'cc', 'bcc', 'subject', 'text']) c[k] = f.elements[k].value; };
  f.addEventListener('input', sync);
  const toggleCc = (open) => { c.ccOpen = f.classList.toggle('cc-open', open); $('#mail-cc-tg').setAttribute('aria-expanded', String(c.ccOpen)); };
  f.querySelectorAll('[data-c=cancel]').forEach((b) => b.addEventListener('click', async () => { if (await mailLeaveCompose()) mailAfterCompose(); }));
  f.querySelectorAll('[data-c=save]').forEach((b) => b.addEventListener('click', async () => { sync(); await mailSaveDraft(true); }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    f.querySelectorAll('.mail-tok').forEach((b) => b.mailCommit && b.mailCommit());
    sync(); await mailSend();
  });
  $('#mail-cc-tg').addEventListener('click', (e) => { e.preventDefault(); toggleCc(!f.classList.contains('cc-open')); if (c.ccOpen) f.querySelector('.mail-ccf .mail-tok-in').focus(); });
  $('#mail-addr-add').addEventListener('click', (e) => { e.preventDefault(); f.querySelector('.mail-addrf .mail-tok-in').focus(); });
  $('#mail-cmore').addEventListener('click', async () => {
    const k = await mailSheet([{ k: 'save', label: '임시 저장' }, { k: 'cc', label: c.ccOpen ? '참조·숨은참조 숨기기' : '참조·숨은참조 추가' }, { k: 'cancel', label: '쓰기 취소' }]);
    if (k === 'save') { sync(); await mailSaveDraft(true); }
    else if (k === 'cc') toggleCc(!c.ccOpen);
    else if (k === 'cancel' && await mailLeaveCompose()) mailAfterCompose();
  });
  for (const id of ['mail-file', 'mail-file2', 'mail-cam']) $(`#${id}`).addEventListener('change', (e) => mailAddFiles(e.target.files));
  // 첨부 칸에 파일을 끌어다 놓기 (데스크톱)
  const drop = $('#mail-drop');
  drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('over'); } });
  drop.addEventListener('dragleave', (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('over'); });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) { sync(); mailAddFiles(e.dataTransfer.files); } });
  f.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => mailRemoveFile(b.dataset.rm)));
  f.querySelectorAll('.mail-ac').forEach(mailAutocomplete);
  f.querySelectorAll('.mail-tok').forEach(mailTokInit);
  (c.mode === 'reply' || c.mode === 'replyAll' ? f.elements.text : c.to ? f.elements.subject : f.querySelector('.mail-addrf .mail-tok-in')).focus();
}

function mailAddFiles(list) {
  const c = ui.mail.compose;
  for (const file of list) {
    if (file.size > MAIL_MAX_ATTACH) { toast(`${file.name}: 3MB 이하 파일만 첨부할 수 있습니다`); continue; }
    c.files.push(file);
  }
  mailDrawCompose();
}

async function mailRemoveFile(k) {
  const c = ui.mail.compose;
  if (k.startsWith('f:')) c.files.splice(Number(k.slice(2)), 1);
  else {
    const aid = k.slice(2);
    try { await G.del(`/me/messages/${encodeURIComponent(c.draftId)}/attachments/${encodeURIComponent(aid)}`); c.existing = c.existing.filter((a) => a.id !== aid); }
    catch (e) { toast(e.message); }
  }
  mailDrawCompose();
}

/* 받는이 칸: 마지막 주소 조각으로 /me/people 검색 */
function mailAutocomplete(box) {
  const input = box.querySelector('input:not([type=hidden])'), sug = box.querySelector('.mail-sug');
  let timer = null, items = [], idx = -1;
  const close = () => { sug.hidden = true; items = []; idx = -1; };
  const pick = (i) => {
    const p = items[i]; if (!p) return;
    const label = p.name && p.name !== p.address ? `${p.name} <${p.address}>` : p.address;
    if (box.mailAdd) { box.mailAdd(label); close(); input.focus(); return; }
    const parts = input.value.split(/[,;]/); parts.pop();
    input.value = [...parts.map((s) => s.trim()).filter(Boolean), p.name && p.name !== p.address ? `${p.name} <${p.address}>` : p.address].join(', ') + ', ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    close(); input.focus();
  };
  const draw = () => {
    sug.innerHTML = items.map((p, i) => `<li class="${i === idx ? 'on' : ''}" data-i="${i}"><b>${esc(p.name)}</b><span class="muted">${esc(p.address)}</span></li>`).join('');
    sug.hidden = !items.length;
    sug.querySelectorAll('[data-i]').forEach((li) => li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(Number(li.dataset.i)); }));
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const term = input.value.split(/[,;]/).pop().trim();
    if (term.length < 1 || term.includes('@')) return close();
    timer = setTimeout(async () => {
      try {
        const j = await G.get(`/me/people?$search=${encodeURIComponent(`"${term.replace(/"/g, '')}"`)}&$top=6&$select=displayName,scoredEmailAddresses`);
        items = j.value.flatMap((p) => (p.scoredEmailAddresses || []).slice(0, 1).map((s) => ({ name: p.displayName || '', address: s.address }))).filter((p) => p.address);
        idx = -1; draw();
      } catch { close(); }
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (sug.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); idx = (idx + 1) % items.length; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); idx = (idx - 1 + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); e.stopImmediatePropagation(); pick(idx); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
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
async function mailSaveDraft(notify) {
  const c = ui.mail.compose;
  if (c.busy) return null;
  let msg;
  try {
    msg = {
      subject: c.subject.trim(),
      toRecipients: mailParseAddrs(c.to, '받는 사람'), ccRecipients: mailParseAddrs(c.cc, '참조'), bccRecipients: mailParseAddrs(c.bcc, '숨은참조'),
      body: { contentType: 'HTML', content: mailMergeBody(mailTextToHtml(c.text), c.quote) },
    };
  } catch (e) { toast(e.message); return null; }
  c.busy = true;
  try {
    if (c.draftId) await G.patch(`/me/messages/${encodeURIComponent(c.draftId)}`, msg);
    else { const d = await G.post('/me/messages', msg); c.draftId = d.id; }
    while (c.files.length) {
      const file = c.files[0];
      const a = await G.post(`/me/messages/${encodeURIComponent(c.draftId)}/attachments`, {
        '@odata.type': '#microsoft.graph.fileAttachment', name: file.name, contentType: file.type || 'application/octet-stream', contentBytes: await mailFileB64(file),
      });
      c.existing.push({ id: a.id, name: a.name, size: a.size });
      c.files.shift();
    }
    c.saved = true;
    if (notify) { toast('임시보관함에 저장했습니다'); mailLoadCounts(); mailDrawCompose(); }
    return c.draftId;
  } catch (e) { toast(e.message); return null; }
  finally { c.busy = false; }
}

async function mailSend() {
  const c = ui.mail.compose;
  let to, cc, bcc;
  try { to = mailParseAddrs(c.to, '받는 사람'); cc = mailParseAddrs(c.cc, '참조'); bcc = mailParseAddrs(c.bcc, '숨은참조'); }
  catch (e) { return toast(e.message); }
  if (!to.length) return toast('받는 사람을 입력하세요');
  const names = (arr) => arr.map((r) => r.emailAddress.name ? `${r.emailAddress.name} <${r.emailAddress.address}>` : r.emailAddress.address).join(', ');
  const ok = await mailConfirm({
    title: '이 메일을 보낼까요?',
    rows: [['받는 사람', names(to)], ['참조', names(cc)], ['숨은참조', names(bcc)], ['제목', c.subject.trim() || '(제목 없음)'],
      ['첨부', c.existing.length + c.files.length ? `${c.existing.length + c.files.length}개` : '']],
    ok: '보내기',
  });
  if (!ok) return;
  const btn = document.querySelector('#mail-cf [type=submit]'); if (btn) btn.disabled = true;
  const id = await mailSaveDraft(false);
  if (!id) { if (btn) btn.disabled = false; return; }
  try {
    await G.post(`/me/messages/${encodeURIComponent(id)}/send`, {}, { type: 'none' });
    toast('보냈습니다');
    ui.mail.compose = null;
    mailAfterCompose(true);
  } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
}

/* 쓰던 메일을 닫아도 되는지 확인. 답장·전달로 자동 생성된 초안은 저장하지 않았으면 지운다 */
async function mailLeaveCompose() {
  const c = ui.mail.compose; if (!c) return true;
  const typed = c.text.trim() || (c.mode === 'new' && (c.to.trim() || c.subject.trim())) || c.files.length;
  if (typed && !c.saved && !(await mailConfirm({ title: '작성 중인 메일을 닫을까요?', rows: [['제목', c.subject.trim() || '(제목 없음)']], ok: '닫기' }))) return false;
  if (c.auto && !c.saved && c.draftId) G.del(`/me/messages/${encodeURIComponent(c.draftId)}`).catch(() => {});
  ui.mail.compose = null;
  return true;
}

function mailAfterCompose(sent) {
  const m = ui.mail;
  m.view = m.sel ? 'read' : 'list';
  if (sent && m.folder === 'drafts') { m.sel = null; m.msg = null; m.view = 'list'; }
  mailDrawShell(); mailDrawFolders(); mailDrawPane();
  if (sent || m.folder === 'drafts') { mailLoadList(); mailLoadCounts(); }
}
