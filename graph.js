/* SPACE WORKS — 회사 계정 로그인(MSAL)과 Microsoft Graph 호출, 회사 OneDrive 데이터 저장소
   회사(spaceinve.com) 계정이면 누구나 로그인하고, 할 일·기록·메일·일정은 각자 계정 안의 것만 본다.
   딜소싱 수집 자료(events.json·ipo.json)만 만든 사람(owner) OneDrive에서 읽기 전용 공유로 읽는다. 서버는 거치지 않는다. */
const CFG = {
  clientId: '2c67e04d-64be-427a-a651-4fbc5f7bdb22',
  authority: 'https://login.microsoftonline.com/7ab0e21f-beca-4d6d-8954-f7decc63ceb3',
  tenantId: '7ab0e21f-beca-4d6d-8954-f7decc63ceb3',
  // .Shared = 공유받은 팀 캘린더 읽기, Files.ReadWrite.All = 공유받은 딜소싱 자료 읽기·같이 쓰는 표시 저장
  scopes: ['User.Read', 'Calendars.ReadWrite', 'Calendars.ReadWrite.Shared', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite', 'Files.ReadWrite.All', 'People.Read'],
  owner: 'jw.tak@spaceinve.com', // 수집 자료·팀 캘린더 주인
  shared: { // owner OneDrive의 딜소싱 파일. 수집 목록은 읽기 공유, ☆·연락 상태·메모는 세 사람이 같이 쓰도록 편집 공유
    drive: 'b!AOIm8WyRCEaHEz8d3nPj0QdQF2d_uLpKsXlm4s6pxDjlwjQDNFTyT7sRaG1Hqr9v',
    files: {
      'data/events.json': '012DPUXZQFZYHRAN7BNVG2IILT52OAVGS5', 'data/ipo.json': '012DPUXZU5TGCSCOXN4ZBZVZDWZC2NNGOE',
      'data/event_marks.json': '012DPUXZVI2AS22PVZMJGZP7MQLZDQU6F7', 'data/ipo_marks.json': '012DPUXZTFV2MMH3PHJRDYVR6J6BGIVZCX',
      'data/ipo_contact.xlsx': '012DPUXZUK5SFDL7IV5JAKFMWLNTENY6FT', 'data/news.json': '012DPUXZSPICTCTSCMJVD3JB5NCM76N4F5',
    },
    writable: ['data/event_marks.json', 'data/ipo_marks.json'], // 수집기는 같은 파일을 덮어쓰므로 id가 바뀌지 않는다
  },
  teamDrive: 'b!j-FPAIUPjU6AnBcIJNprMgAfPOR1jCVOvR6mVssjMWkyr34wYSj7Rp-_wJU9Subr', // 팀 '스페이스인베스트먼트' 파일함(공용 폴더) — 팀원이면 누구나 읽고 쓴다
  teamCalendarId: 'AAMkAGY5ZWRkMzlmLTNmYjUtNDE3NC04YTUxLTliZjgyYjU0Yjc1NQBGAAAAAAB2D1ON4THdQYUFMZAr45FEBwA217gkwboaRqzQAV2p_lEqAAAAAAEGAAA217gkwboaRqzQAV2p_lEqAAAAE7aBAAA=',
  root: 'SPACE WORKS',        // 회사 OneDrive 안 앱 폴더
  teamCalendar: '스페이스인베스트먼트',
};
const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, ''); // 앱 폴더 주소 = 로그인 리디렉션 주소

// 서비스워커가 홈페이지 미리보기 파일을 읽을 때 토큰을 달라고 하면 넘겨준다(sw.js hpToken)
navigator.serviceWorker?.addEventListener('message', async (e) => {
  if (e.data?.type !== 'need-token' || !e.ports[0]) return;
  try { const r = await MS.acquireTokenSilent({ scopes: CFG.scopes, account: G.account, forceRefresh: !!e.data.force }); e.ports[0].postMessage({ token: r.accessToken, exp: r.expiresOn.getTime() }); } catch { e.ports[0].postMessage(null); }
});
const MS = new msal.PublicClientApplication({
  auth: { clientId: CFG.clientId, authority: CFG.authority, redirectUri: APP_URL, postLogoutRedirectUri: APP_URL, navigateToLoginRequestUrl: false },
  cache: { cacheLocation: 'localStorage' },
});

const G = {
  account: null,
  wrongAccount: null,

  async init() {
    await MS.initialize();
    const res = await MS.handleRedirectPromise();
    if (res?.account && res.account.tenantId !== CFG.tenantId) { G.wrongAccount = res.account.username; return false; } // 회사 밖 계정으로 방금 로그인
    const act = MS.getActiveAccount();
    const acc = res?.account || (act?.tenantId === CFG.tenantId ? act : null) || MS.getAllAccounts().find((a) => a.tenantId === CFG.tenantId) || null;
    if (acc) MS.setActiveAccount(acc); // 한 브라우저에 여러 계정이 있어도 마지막에 고른 계정으로 연다
    G.account = acc;
    return !!acc;
  },
  get isOwner() { return (G.account?.username || '').toLowerCase() === CFG.owner; },
  login() { return MS.loginRedirect({ scopes: CFG.scopes, prompt: 'select_account' }); },
  logout() { return MS.logoutRedirect({ account: G.account || undefined }); },

  async token(force) {
    try {
      return (await MS.acquireTokenSilent({ scopes: CFG.scopes, account: G.account, forceRefresh: !!force })).accessToken;
    } catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError || /interaction_required|login_required|consent_required|no_tokens_found|monitor_window_timeout|timed_out|token_renewal/i.test(e.errorCode || '')) {
        G.relogin();
        const err = new Error('로그인이 만료되었습니다. 위쪽 "다시 로그인"을 눌러 주세요.'); err.status = 401; throw err;
      }
      throw e;
    }
  },
  // 다시 로그인 배너(한 번만). 누르면 쓰던 기록을 저장하고 로그인 화면으로
  relogin() {
    if (document.querySelector('.relogin')) return;
    const b = document.createElement('div');
    b.className = 'relogin'; b.setAttribute('role', 'alert');
    b.innerHTML = '<span>로그인이 만료되었습니다</span><button type="button" class="btn sm primary">다시 로그인</button>';
    b.querySelector('button').onclick = async () => {
      try { if (typeof flushNote === 'function') await flushNote(); } catch { /* 저장 못 해도 로그인은 진행 */ }
      MS.acquireTokenRedirect({ scopes: CFG.scopes, account: G.account });
    };
    document.body.appendChild(b);
  },

  /* 동시 요청 줄 세우기: Graph는 앱 하나가 한 메일함에 동시에 4개까지만 받는다(MailboxConcurrency).
     같은 앱으로 PC·폰이 함께 붙으므로 기기마다 3개로 묶는다. */
  busy: 0, waiting: [],
  async slot(fn) {
    if (G.busy >= 3) await new Promise((res) => G.waiting.push(res)); else G.busy++;
    try { return await fn(); } finally { const next = G.waiting.shift(); if (next) next(); else G.busy--; }
  },

  /* type: 'json'(기본) | 'text' | 'blob' | 'none' */
  async raw(method, path, { body, headers = {}, type = 'json' } = {}) {
    const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`;
    if (!url.startsWith('https://graph.microsoft.com/')) throw new Error('허용되지 않은 주소입니다'); // 토큰은 Graph에만 보낸다(nextLink 포함)
    const h = { Authorization: `Bearer ${await G.token()}`, ...headers };
    let b = body;
    if (body !== undefined && typeof body !== 'string' && !(body instanceof Blob)) {
      b = JSON.stringify(body);
      h['Content-Type'] = h['Content-Type'] || 'application/json';
    }
    // 429(요청 과다)는 서버가 알려 준 시간만큼 기다렸다 다시(최대 4번). 503·504는 GET만 다시 —
    // 메일 보내기·일정 만들기 같은 요청은 서버가 이미 처리했을 수 있어 두 번 보내지 않는다. 401은 토큰을 새로 받아 한 번만 다시.
    const again = method === 'GET' ? [429, 503, 504] : [429];
    const ms = type === 'blob' ? 0 : b !== undefined ? 120000 : 45000; // 응답 없는 요청이 자리를 계속 차지하지 않게
    let r, renewed = false;
    for (let i = 0; ; i++) {
      try { r = await G.slot(() => fetch(url, { method, headers: h, body: b, signal: ms && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined })); }
      catch (e) { if (e.name === 'TimeoutError' || e.name === 'AbortError') { const err = new Error('응답이 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.'); err.status = 0; throw err; } throw e; }
      if (r.status === 401 && !renewed) { renewed = true; h.Authorization = `Bearer ${await G.token(true)}`; continue; }
      if (!again.includes(r.status) || i >= 4) break;
      const wait = Math.min(Number(r.headers.get('Retry-After')) || 2 ** i, 20) * 1000 + Math.random() * 400;
      await new Promise((res) => setTimeout(res, wait));
    }
    if (!r.ok) {
      let msg = `오류 ${r.status}`;
      try { const j = await r.json(); msg = j.error?.message || msg; } catch { /* 본문 없음 */ }
      if (r.status === 429 || /concurrency|throttl/i.test(msg)) msg = '요청이 많아 잠시 지연되고 있습니다. 잠시 후 새로고침해 주세요.';
      const err = new Error(msg); err.status = r.status; throw err;
    }
    if (r.status === 204 || type === 'none') return null;
    if (type === 'text') return r.text();
    if (type === 'blob') return r.blob();
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  },
  get: (p, o) => G.raw('GET', p, o),
  post: (p, body, o) => G.raw('POST', p, { ...o, body }),
  patch: (p, body, o) => G.raw('PATCH', p, { ...o, body }),
  put: (p, body, o) => G.raw('PUT', p, { ...o, body }),
  del: (p, o) => G.raw('DELETE', p, o),
  KST: { Prefer: 'outlook.timezone="Korea Standard Time"' },
};

/* ---------- 회사 OneDrive 저장소: /SPACE WORKS/data/*.json, /SPACE WORKS/업무일지/*.txt ---------- */
const STORE = {
  // owner가 아니면 공유받은 딜소싱 파일은 owner OneDrive의 그 파일로(같이 쓰는 표시도 같은 파일에 저장)
  sharedItem: (rel) => (!G.isOwner && CFG.shared.files[rel] ? `/drives/${CFG.shared.drive}/items/${CFG.shared.files[rel]}` : null),
  path: (rel) => `/me/drive/root:/${[CFG.root, ...rel.split('/')].map(encodeURIComponent).join('/')}`,

  async meta(rel) {
    try { return await G.get(`${STORE.sharedItem(rel) || STORE.path(rel)}?$select=id,name,eTag,lastModifiedDateTime,size`); }
    catch (e) {
      if (STORE.sharedItem(rel) && [403, 404].includes(e.status)) { const err = new Error('공유받은 딜소싱 자료를 열 수 없습니다(권한 또는 파일 변경). 탁지원 대리에게 알려 주세요.'); err.status = e.status; throw err; }
      if (e.status === 404) return null;
      throw e;
    }
  },
  async readText(rel) {
    const m = await STORE.meta(rel);
    if (!m) return { text: '', version: null, mtime: null };
    const sh = STORE.sharedItem(rel);
    const text = await G.get(sh ? `${sh}/content` : `${STORE.path(rel)}:/content`, { type: 'text' });
    return { text, version: m.eTag, mtime: Date.parse(m.lastModifiedDateTime) / 1000 };
  },
  /* version 이 있으면 그 버전일 때만 덮어쓴다(다른 기기·Claude Code가 먼저 고쳤으면 409로 알림). 없으면 새 파일만 만든다. */
  async writeText(rel, text, version, contentType = 'text/plain; charset=utf-8') {
    const sh = STORE.sharedItem(rel);
    if (sh && !CFG.shared.writable.includes(rel)) throw new Error('공유받은 자료는 읽기 전용입니다');
    const headers = { 'Content-Type': contentType };
    if (version) headers['If-Match'] = version;
    const q = version ? '' : '?@microsoft.graph.conflictBehavior=fail';
    try {
      const r = await G.put(sh ? `${sh}/content` : `${STORE.path(rel)}:/content${q}`, text, { headers });
      return r.eTag;
    } catch (e) {
      if (e.status === 412 || e.status === 409) { const err = new Error('다른 기기에서 먼저 수정되었습니다. 최신 내용을 다시 불러옵니다.'); err.status = 409; throw err; }
      throw e;
    }
  },

  async readJSON(name) {
    const r = await STORE.readText(`data/${name}.json`);
    return { items: r.text ? JSON.parse(r.text) : [], version: r.version };
  },
  async writeJSON(name, items, version) {
    return STORE.writeText(`data/${name}.json`, JSON.stringify(items, null, 2), version, 'application/json; charset=utf-8');
  },

  async listNotes(prev = []) {
    let kids = [];
    try {
      let url = `${STORE.path('업무일지')}:/children?$select=id,name,eTag,lastModifiedDateTime,size&$top=200`;
      while (url) { const j = await G.get(url); kids.push(...j.value); url = j['@odata.nextLink'] || null; }
    } catch (e) { if (e.status !== 404) throw e; }
    const files = kids.filter((k) => /\.(txt|md)$/i.test(k.name) && !k.name.startsWith('~$'));
    const known = new Map(prev.map((n) => [n.name, n]));
    const previews = await Promise.all(files.map((f) => (known.get(f.name)?.version === f.eTag ? Promise.resolve(known.get(f.name).preview)
      : G.get(`/me/drive/items/${f.id}/content`, { type: 'text' }).then((t) => t.slice(0, 400)).catch(() => ''))));
    return files.map((f, i) => ({ name: f.name, id: f.id, version: f.eTag, mtime: Date.parse(f.lastModifiedDateTime) / 1000, preview: previews[i] }))
      .sort((a, b) => b.mtime - a.mtime);
  },
  async readNote(name) {
    const r = await STORE.readText(`업무일지/${name}`);
    return { name, text: r.text.replace(/\r\n/g, '\n'), version: r.version };
  },
  async writeNote(name, text, version) {
    return STORE.writeText(`업무일지/${name}`, text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), version);
  },
};

/* ---------- 캘린더: 기본(내 일정) + 팀 캘린더(owner의 '스페이스인베스트먼트', 대표님께 공유) ---------- */
const OUTLOOK = {
  ids: null, idsP: null,
  teamWritable: false, // owner만 팀 캘린더에 추가·수정(다른 사람은 보기만) — calendarIds()가 정한다
  /* 반환: { me: 캘린더 경로, team: 캘린더 경로 } — calendarView·events는 이 경로 뒤에 붙인다 */
  calendarIds() {
    if (OUTLOOK.ids) return Promise.resolve(OUTLOOK.ids);
    return (OUTLOOK.idsP ||= OUTLOOK.loadIds().finally(() => { OUTLOOK.idsP = null; }));
  },
  async loadIds() {
    const ids = {};
    let temporary = false;
    for (const c of (await G.get('/me/calendars?$select=id,name,isDefaultCalendar')).value) {
      if (c.isDefaultCalendar) ids.me = `/me/calendars/${c.id}`;
      else if (G.isOwner && c.name.trim() === CFG.teamCalendar) ids.team = `/me/calendars/${c.id}`;
    }
    OUTLOOK.teamWritable = G.isOwner;
    if (!G.isOwner) { // 공유받은 캘린더는 주인 사서함 쪽 경로로 읽는다(Outlook에 추가했는지와 무관)
      const p = `/users/${CFG.owner}/calendars/${CFG.teamCalendarId}`;
      try { await G.get(`${p}?$select=id`); ids.team = p; } catch (e) { if (![403, 404].includes(e.status)) temporary = true; /* 403·404 = 공유 안 됨: 내 일정만 */ }
    }
    if (!temporary) OUTLOOK.ids = ids; // 네트워크 오류 한 번으로 팀 캘린더가 계속 빠지지 않게
    return ids;
  },
  async events(start, end) {
    const sel = 'id,subject,start,end,isAllDay,location,onlineMeeting,organizer,isOrganizer,attendees,webLink,isCancelled,bodyPreview,categories';
    const kst = (t) => (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}+09:00`); // 시간대가 없으면 Graph가 UTC로 읽어 오전 9시 전 일정이 빠진다
    const q = new URLSearchParams({ startDateTime: kst(start), endDateTime: kst(end), $top: '200', $orderby: 'start/dateTime', $select: sel });
    const out = [], cals = Object.entries(await OUTLOOK.calendarIds());
    let failed = 0, lastErr = null;
    for (const [cal, cid] of cals) {
      let url = `${cid}/calendarView?${q}`;
      try { while (url) {
        const j = await G.get(url, { headers: G.KST });
        for (const e of j.value) {
          out.push({
            id: e.id, cal, organizer_me: !!e.isOrganizer,
            editable: !!e.isOrganizer && !(e.attendees || []).length && (cal !== 'team' || OUTLOOK.teamWritable), // 참석자 없는 내 일정만 (수정 시 상대에게 알림이 가지 않게)
            subject: e.subject || '(제목 없음)', start: e.start.dateTime.slice(0, 16), end: e.end.dateTime.slice(0, 16),
            allDay: !!e.isAllDay, location: e.location?.displayName || '', join: e.onlineMeeting?.joinUrl || '',
            organizer: e.organizer?.emailAddress?.name || '', link: e.webLink || '', cancelled: !!e.isCancelled, categories: e.categories || [],
          });
        }
        url = j['@odata.nextLink'] || null;
      } } catch (e) { failed++; lastErr = e; } // 팀 캘린더 하나가 막혀도 내 일정은 보여 준다
    }
    if (failed && failed === cals.length) throw lastErr;
    return out.sort((a, b) => a.start.localeCompare(b.start) || (a.cal === 'team' ? -1 : 1));
  },
  body(b) {
    const subject = (b.subject || '').trim();
    if (!subject) throw new Error('제목을 입력하세요');
    const sd = b.startDate, ed = b.endDate || b.startDate, KST = 'Korea Standard Time';
    let s, e;
    if (b.allDay) {
      const end = new Date(`${ed}T00:00:00`); end.setDate(end.getDate() + 1); // 종일 일정의 끝은 다음 날 0시
      s = `${sd}T00:00:00`; e = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}T00:00:00`;
    } else { s = `${sd}T${b.startTime}:00`; e = `${ed}T${b.endTime}:00`; }
    if (e <= s) throw new Error('끝나는 시간이 시작보다 늦어야 합니다');
    const out = { subject, isAllDay: !!b.allDay, start: { dateTime: s, timeZone: KST }, end: { dateTime: e, timeZone: KST }, location: { displayName: (b.location || '').trim() } };
    if ('important' in b) out.importance = b.important ? 'high' : 'normal';
    if ('categories' in b) out.categories = b.categories; // 담당자 이름을 Outlook 분류로 저장
    if ('note' in b) out.body = { contentType: 'text', content: b.note || '' };
    if ('reminder' in b) { // '' = 알림 없음, 숫자 = 시작 몇 분 전
      out.isReminderOn = b.reminder !== '';
      if (b.reminder !== '') out.reminderMinutesBeforeStart = Number(b.reminder);
    }
    if (b.repeat) { // 반복: 시작일 기준, 끝 없음
      const d = new Date(`${sd}T00:00:00`), WDN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const pattern = {
        daily: { type: 'daily', interval: 1 },
        weekly: { type: 'weekly', interval: 1, daysOfWeek: [WDN[d.getDay()]], firstDayOfWeek: 'sunday' },
        monthly: { type: 'absoluteMonthly', interval: 1, dayOfMonth: d.getDate() },
        yearly: { type: 'absoluteYearly', interval: 1, dayOfMonth: d.getDate(), month: d.getMonth() + 1 },
      }[b.repeat];
      if (pattern) out.recurrence = { pattern, range: { type: 'noEnd', startDate: sd } };
    }
    return out;
  },
  async detail(id) { // 수정 창에 채울 내용·중요·알림·반복
    return G.get(`/me/events/${encodeURIComponent(id)}?$select=body,importance,isReminderOn,reminderMinutesBeforeStart,recurrence,type`, { headers: { Prefer: 'outlook.timezone="Korea Standard Time", outlook.body-content-type="text"' } });
  },
  async checkEditable(id) {
    const e = await G.get(`/me/events/${encodeURIComponent(id)}?$select=isOrganizer,attendees`);
    if (!e.isOrganizer || (e.attendees || []).length) throw new Error('참석자가 있는 회의·받은 초대는 Outlook에서 수정하세요');
  },
  async create(b) {
    const ids = await OUTLOOK.calendarIds();
    const cid = (b.calendar === 'team' && OUTLOOK.teamWritable ? ids.team : ids.me) || ids.me;
    return G.post(`${cid}/events`, OUTLOOK.body(b), { headers: G.KST });
  },
  async update(id, b) { await OUTLOOK.checkEditable(id); return G.patch(`/me/events/${encodeURIComponent(id)}`, OUTLOOK.body(b), { headers: G.KST }); },
  async remove(id) { await OUTLOOK.checkEditable(id); return G.del(`/me/events/${encodeURIComponent(id)}`); },
};
