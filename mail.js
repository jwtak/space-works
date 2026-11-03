/* SPACE WORKS — 메일 (받은편지함·읽기·쓰기·답장·전달·보내기)
   본문 HTML은 메인 화면에 넣지 않고 스크립트가 막힌 iframe(sandbox, CSP) 안에서만 보여 준다.
   보내기는 항상 확인창을 거친다. */
const MAIL_FOLDERS = [
  { id: 'inbox', name: '받은편지함', icon: 'inbox' },
  { id: 'sentitems', name: '보낸편지함', icon: 'send' },
  { id: 'drafts', name: '임시보관함', icon: 'file' },
  { id: 'deleteditems', name: '지운편지함', icon: 'trash' },
];
const MAIL_LIST_SEL = 'id,subject,from,toRecipients,receivedDateTime,sentDateTime,bodyPreview,isRead,hasAttachments,isDraft';
const MAIL_MAX_ATTACH = 3 * 1024 * 1024; // 한 번에 올릴 수 있는 첨부 크기 (그보다 큰 파일은 업로드 세션이 필요)

const mailState = () => (ui.mail = ui.mail || { folder: 'inbox', q: '', list: [], next: null, sel: null, msg: null, atts: [], counts: {}, compose: null, view: 'list', remote: false, loading: false });

/* ---------- 유틸 ---------- */
function mailTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), n = new Date();
  if (d.toDateString() === n.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === n.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
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
blockquote{margin:0 0 0 4px;padding-left:12px;border-left:2px solid #E5E7EB;color:#4B5563}</style></head><body>${html}</body></html>`;
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
    <div class="page-head"><h1>메일</h1></div>
    <div class="card mail-shell" id="mail-shell">
      <aside class="mail-folders">
        <button class="btn primary mail-write" type="button" id="mail-new">${ico('plus', 'sm')}메일 쓰기</button>
        <nav class="mail-fnav" id="mail-fnav"></nav>
      </aside>
      <section class="mail-list">
        <form class="mail-search" id="mail-sf">
          <span class="mail-search-ic">${ico('search', 'sm')}</span>
          <input class="input" id="mail-q" placeholder="메일 검색" value="${esc(m.q)}" autocomplete="off">
        </form>
        <div class="mail-list-head"><b id="mail-ltitle"></b><button class="iconbtn" type="button" id="mail-ref" title="새로고침" aria-label="새로고침">${ico('refresh', 'sm')}</button></div>
        <ul class="mail-items" id="mail-items"></ul>
      </section>
      <section class="mail-pane" id="mail-pane"></section>
    </div>`;
  $('#mail-new').addEventListener('click', () => mailOpenCompose({ mode: 'new' }));
  $('#mail-ref').addEventListener('click', () => { mailLoadCounts(); mailLoadList(); });
  $('#mail-sf').addEventListener('submit', (e) => { e.preventDefault(); m.q = $('#mail-q').value.trim(); m.sel = null; m.msg = null; mailLoadList(); });
  $('#mail-q').addEventListener('search', () => { if (!$('#mail-q').value) { m.q = ''; mailLoadList(); } });
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
}

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
    m.folder = b.dataset.f; m.sel = null; m.msg = null; m.q = ''; m.view = 'list';
    const q = $('#mail-q'); if (q) q.value = '';
    mailDrawShell(); mailDrawFolders(); mailDrawPane(); mailLoadList();
  }));
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
  if (!more) { m.list = []; m.next = null; box.innerHTML = '<li class="empty">불러오는 중…</li>'; }
  m.loading = true;
  try {
    let url;
    if (more && m.next) url = m.next;
    else {
      const q = new URLSearchParams({ $top: '50', $select: MAIL_LIST_SEL });
      if (m.q) q.set('$search', `"${m.q.replace(/"/g, '')}"`); // $search 는 $orderby 와 함께 못 쓴다 (관련도 순)
      else q.set('$orderby', { sentitems: 'sentDateTime desc', drafts: 'lastModifiedDateTime desc' }[m.folder] || 'receivedDateTime desc');
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
  if (!m.list.length) { box.innerHTML = `<li class="empty">${m.q ? '검색 결과 없음' : '메일 없음'}</li>`; return; }
  box.innerHTML = m.list.map((x) => {
    const who = toSide ? (x.toRecipients || []).map(mailWho).join(', ') || '(받는 사람 없음)' : mailWho(x.from) || '(보낸 사람 없음)';
    return `<li class="mail-item ${x.isRead || toSide ? '' : 'unread'} ${m.sel === x.id ? 'on' : ''}" data-id="${esc(x.id)}">
      <div class="mail-r1"><span class="mail-who">${x.isDraft && m.folder === 'drafts' ? '<span class="mail-draft">임시</span>' : ''}${esc(who)}</span><span class="mail-tm">${mailTime(toSide ? x.sentDateTime || x.receivedDateTime : x.receivedDateTime)}</span></div>
      <div class="mail-subj">${x.hasAttachments ? `<span class="mail-clip" title="첨부">${ico('clip', 'sm')}</span>` : ''}${esc(x.subject || '(제목 없음)')}</div>
      <div class="mail-pv">${esc((x.bodyPreview || '').replace(/\s+/g, ' ').slice(0, 120))}</div></li>`;
  }).join('') + (m.next ? '<li class="mail-more"><button class="btn sm" type="button" id="mail-more">더 보기</button></li>' : '');
  box.querySelectorAll('[data-id]').forEach((li) => li.addEventListener('click', () => mailOpen(li.dataset.id)));
  const more = $('#mail-more'); if (more) more.addEventListener('click', () => { more.disabled = true; mailLoadList(true); });
}

async function mailOpen(id) {
  const m = ui.mail;
  if (m.compose && !(await mailLeaveCompose())) return;
  const item = m.list.find((x) => x.id === id);
  if (m.folder === 'drafts' && item?.isDraft) return mailOpenCompose({ mode: 'draft', id });
  m.sel = id; m.msg = null; m.atts = []; m.remote = false; m.view = 'read';
  mailDrawShell(); mailDrawList(); mailDrawPane();
  try {
    const [msg, atts] = await Promise.all([
      G.get(`/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,body,hasAttachments,isRead,isDraft,webLink`),
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

function mailDrawPane() {
  const m = ui.mail, pane = $('#mail-pane'); if (!pane) return;
  if (m.compose) return mailDrawCompose();
  if (!m.sel) { pane.innerHTML = `<div class="mail-blank">${ico('mail', 'lg')}<span>메일을 선택하세요</span></div>`; return; }
  if (!m.msg) { pane.innerHTML = '<div class="empty">불러오는 중…</div>'; return; }
  const x = m.msg, html = x.body?.contentType === 'html' ? x.body.content : `<pre>${esc(x.body?.content || '')}</pre>`;
  const hasRemote = /<img[^>]+src\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i.test(html);
  const inTrash = m.folder === 'deleteditems';
  pane.innerHTML = `
    <div class="mail-rhead">
      <div class="mail-tools">
        <button class="iconbtn mail-back" type="button" id="mail-back" aria-label="목록">${ico('left')}</button>
        <button class="btn sm" type="button" data-act="reply">${ico('reply', 'sm')}답장</button>
        <button class="btn sm" type="button" data-act="replyAll">전체 답장</button>
        <button class="btn sm" type="button" data-act="forward">${ico('forward', 'sm')}전달</button>
        <span class="mail-tools-r">
          <button class="btn sm ghost" type="button" data-act="unread">안 읽음</button>
          <button class="iconbtn" type="button" data-act="${inTrash ? 'purge' : 'delete'}" title="${inTrash ? '영구 삭제' : '삭제'}" aria-label="${inTrash ? '영구 삭제' : '삭제'}">${ico('trash', 'sm')}</button>
          ${x.webLink ? `<a class="iconbtn" href="${esc(x.webLink)}" target="_blank" rel="noopener" title="Outlook에서 열기" aria-label="Outlook에서 열기">${ico('ext', 'sm')}</a>` : ''}
        </span>
      </div>
      <h2 class="mail-rsubj">${esc(x.subject || '(제목 없음)')}</h2>
      <dl class="mail-meta">
        <dt>보낸 사람</dt><dd>${esc(mailAddr(x.from))}</dd>
        <dt>받는 사람</dt><dd>${esc(mailAddrList(x.toRecipients))}</dd>
        ${x.ccRecipients?.length ? `<dt>참조</dt><dd>${esc(mailAddrList(x.ccRecipients))}</dd>` : ''}
        ${x.bccRecipients?.length ? `<dt>숨은참조</dt><dd>${esc(mailAddrList(x.bccRecipients))}</dd>` : ''}
        <dt>날짜</dt><dd>${mailFullTime(x.receivedDateTime || x.sentDateTime)}</dd>
      </dl>
      ${m.atts.length ? `<div class="mail-atts">${m.atts.map((a) => `<button type="button" class="mail-att" data-att="${esc(a.id)}">${ico('clip', 'sm')}<span>${esc(a.name)}</span><span class="muted">${mailSize(a.size)}</span></button>`).join('')}</div>` : ''}
      ${hasRemote && !m.remote ? '<div class="mail-remote">외부 이미지 차단됨 <button class="btn sm ghost" type="button" id="mail-remote">이미지 보기</button></div>' : ''}
    </div>
    <iframe class="mail-frame" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" title="메일 본문"></iframe>`;
  pane.querySelector('.mail-frame').srcdoc = mailFrameDoc(html, m.remote);
  $('#mail-back').addEventListener('click', () => { m.view = 'list'; mailDrawShell(); });
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

function mailDrawCompose() {
  const c = ui.mail.compose, pane = $('#mail-pane'); if (!pane || !c) return;
  const title = { new: '메일 쓰기', reply: '답장', replyAll: '전체 답장', forward: '전달', draft: '임시 저장한 메일' }[c.mode];
  const field = (key, label) => `<label class="mail-field"><span>${label}</span><div class="mail-ac"><input class="input" name="${key}" value="${esc(c[key])}" autocomplete="off" ${key === 'to' ? 'required' : ''}><ul class="mail-sug" hidden></ul></div></label>`;
  const files = [...c.existing.map((a) => ({ k: `e:${a.id}`, name: a.name, size: a.size })), ...c.files.map((f, i) => ({ k: `f:${i}`, name: f.name, size: f.size }))];
  pane.innerHTML = `
    <form class="mail-compose" id="mail-cf" novalidate>
      <div class="mail-chead">
        <button class="iconbtn mail-back" type="button" data-c="cancel" aria-label="닫기">${ico('left')}</button>
        <h2>${title}</h2>
        <span class="mail-tools-r">
          <button class="btn sm" type="button" data-c="save">임시 저장</button>
          <button class="btn sm" type="button" data-c="cancel">취소</button>
          <button class="btn sm primary" type="submit">${ico('send', 'sm')}보내기</button>
        </span>
      </div>
      ${field('to', '받는 사람')}${field('cc', '참조')}${field('bcc', '숨은참조')}
      <label class="mail-field"><span>제목</span><input class="input" name="subject" value="${esc(c.subject)}"></label>
      <div class="mail-field mail-files"><span>첨부</span><div>
        <label class="btn sm">${ico('clip', 'sm')}파일 추가<input type="file" multiple hidden id="mail-file"></label>
        ${files.map((f) => `<span class="mail-file">${esc(f.name)}<span class="muted">${mailSize(f.size)}</span><button type="button" class="iconbtn" data-rm="${f.k}" aria-label="첨부 빼기">${ico('trash', 'sm')}</button></span>`).join('')}
      </div></div>
      <textarea class="mail-body" name="text" placeholder="내용">${esc(c.text)}</textarea>
      ${c.quote ? `<details class="mail-quote"><summary>원문 보기</summary><iframe class="mail-frame" sandbox referrerpolicy="no-referrer" title="원문"></iframe></details>` : ''}
    </form>`;
  const f = $('#mail-cf');
  if (c.quote) f.querySelector('.mail-quote .mail-frame').srcdoc = mailFrameDoc(c.quote, false);
  const sync = () => { for (const k of ['to', 'cc', 'bcc', 'subject', 'text']) c[k] = f.elements[k].value; };
  f.addEventListener('input', sync);
  f.querySelectorAll('[data-c=cancel]').forEach((b) => b.addEventListener('click', async () => { if (await mailLeaveCompose()) mailAfterCompose(); }));
  f.querySelector('[data-c=save]').addEventListener('click', async () => { sync(); await mailSaveDraft(true); });
  f.addEventListener('submit', async (e) => { e.preventDefault(); sync(); await mailSend(); });
  $('#mail-file').addEventListener('change', (e) => mailAddFiles(e.target.files));
  f.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => mailRemoveFile(b.dataset.rm)));
  f.querySelectorAll('.mail-ac').forEach(mailAutocomplete);
  (c.mode === 'reply' || c.mode === 'replyAll' ? f.elements.text : f.elements.to.value ? f.elements.subject : f.elements.to).focus();
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
  const input = box.querySelector('input'), sug = box.querySelector('.mail-sug');
  let timer = null, items = [], idx = -1;
  const close = () => { sug.hidden = true; items = []; idx = -1; };
  const pick = (i) => {
    const p = items[i]; if (!p) return;
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
    else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); pick(idx); }
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
