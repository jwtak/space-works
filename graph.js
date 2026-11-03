/* SPACE WORKS — 회사 계정 로그인(MSAL)과 Microsoft Graph 호출, 회사 OneDrive 데이터 저장소
   데이터는 전부 jw.tak@spaceinve.com 계정 안에 있다. 이 웹앱은 화면만 제공하고 서버를 거치지 않는다. */
const CFG = {
  clientId: '2c67e04d-64be-427a-a651-4fbc5f7bdb22',
  authority: 'https://login.microsoftonline.com/7ab0e21f-beca-4d6d-8954-f7decc63ceb3',
  scopes: ['User.Read', 'Calendars.ReadWrite', 'Mail.ReadWrite', 'Mail.Send', 'Files.ReadWrite', 'People.Read'],
  user: 'jw.tak@spaceinve.com',
  root: 'SPACE WORKS',        // 회사 OneDrive 안 앱 폴더
  teamCalendar: '스페이스인베스트먼트',
};
const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, ''); // 앱 폴더 주소 = 로그인 리디렉션 주소

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
    const all = MS.getAllAccounts();
    const acc = res?.account || all.find((a) => a.username.toLowerCase() === CFG.user) || all[0] || null;
    if (acc && acc.username.toLowerCase() !== CFG.user) { G.wrongAccount = acc.username; return false; }
    G.account = acc;
    return !!acc;
  },
  login() { return MS.loginRedirect({ scopes: CFG.scopes, loginHint: CFG.user, prompt: 'select_account' }); },
  logout() { return MS.logoutRedirect({ account: G.account || undefined }); },

  async token() {
    try {
      return (await MS.acquireTokenSilent({ scopes: CFG.scopes, account: G.account })).accessToken;
    } catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError) await MS.acquireTokenRedirect({ scopes: CFG.scopes, account: G.account });
      throw e;
    }
  },

  /* type: 'json'(기본) | 'text' | 'blob' | 'none' */
  async raw(method, path, { body, headers = {}, type = 'json' } = {}) {
    const url = path.startsWith('https://') ? path : `https://graph.microsoft.com/v1.0${path}`;
    const h = { Authorization: `Bearer ${await G.token()}`, ...headers };
    let b = body;
    if (body !== undefined && typeof body !== 'string' && !(body instanceof Blob)) {
      b = JSON.stringify(body);
      h['Content-Type'] = h['Content-Type'] || 'application/json';
    }
    const r = await fetch(url, { method, headers: h, body: b });
    if (!r.ok) {
      let msg = `오류 ${r.status}`;
      try { const j = await r.json(); msg = j.error?.message || msg; } catch { /* 본문 없음 */ }
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
  path: (rel) => `/me/drive/root:/${[CFG.root, ...rel.split('/')].map(encodeURIComponent).join('/')}`,

  async meta(rel) {
    try { return await G.get(`${STORE.path(rel)}?$select=id,name,eTag,lastModifiedDateTime,size`); }
    catch (e) { if (e.status === 404) return null; throw e; }
  },
  async readText(rel) {
    const m = await STORE.meta(rel);
    if (!m) return { text: '', version: null, mtime: null };
    const text = await G.get(`${STORE.path(rel)}:/content`, { type: 'text' });
    return { text, version: m.eTag, mtime: Date.parse(m.lastModifiedDateTime) / 1000 };
  },
  /* version 이 있으면 그 버전일 때만 덮어쓴다(다른 기기·Claude Code가 먼저 고쳤으면 409로 알림). 없으면 새 파일만 만든다. */
  async writeText(rel, text, version, contentType = 'text/plain; charset=utf-8') {
    const headers = { 'Content-Type': contentType };
    if (version) headers['If-Match'] = version;
    const q = version ? '' : '?@microsoft.graph.conflictBehavior=fail';
    try {
      const r = await G.put(`${STORE.path(rel)}:/content${q}`, text, { headers });
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
    try { kids = (await G.get(`${STORE.path('업무일지')}:/children?$select=id,name,eTag,lastModifiedDateTime,size&$top=200`)).value; }
    catch (e) { if (e.status !== 404) throw e; }
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

/* ---------- 캘린더: 기본(내 일정) + 대표님 공유 캘린더 ---------- */
const OUTLOOK = {
  ids: null,
  async calendarIds() {
    if (OUTLOOK.ids) return OUTLOOK.ids;
    const ids = {};
    for (const c of (await G.get('/me/calendars?$select=id,name,isDefaultCalendar')).value) {
      if (c.isDefaultCalendar) ids.me = c.id;
      else if (c.name.trim() === CFG.teamCalendar) ids.team = c.id;
    }
    OUTLOOK.ids = ids;
    return ids;
  },
  async events(start, end) {
    const sel = 'id,subject,start,end,isAllDay,location,onlineMeeting,organizer,isOrganizer,attendees,webLink,isCancelled,bodyPreview';
    const q = new URLSearchParams({ startDateTime: start, endDateTime: end, $top: '200', $orderby: 'start/dateTime', $select: sel });
    const out = [];
    for (const [cal, cid] of Object.entries(await OUTLOOK.calendarIds())) {
      let url = `/me/calendars/${cid}/calendarView?${q}`;
      while (url) {
        const j = await G.get(url, { headers: G.KST });
        for (const e of j.value) {
          out.push({
            id: e.id, cal, organizer_me: !!e.isOrganizer,
            editable: !!e.isOrganizer && !(e.attendees || []).length, // 참석자 없는 내 일정만 (수정 시 상대에게 알림이 가지 않게)
            subject: e.subject || '(제목 없음)', start: e.start.dateTime.slice(0, 16), end: e.end.dateTime.slice(0, 16),
            allDay: !!e.isAllDay, location: e.location?.displayName || '', join: e.onlineMeeting?.joinUrl || '',
            organizer: e.organizer?.emailAddress?.name || '', link: e.webLink || '', cancelled: !!e.isCancelled,
          });
        }
        url = j['@odata.nextLink'] || null;
      }
    }
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
    const cid = (b.calendar === 'me' ? ids.me : ids.team) || ids.me;
    return G.post(`/me/calendars/${cid}/events`, OUTLOOK.body(b), { headers: G.KST });
  },
  async update(id, b) { await OUTLOOK.checkEditable(id); return G.patch(`/me/events/${encodeURIComponent(id)}`, OUTLOOK.body(b), { headers: G.KST }); },
  async remove(id) { await OUTLOOK.checkEditable(id); return G.del(`/me/events/${encodeURIComponent(id)}`); },
};
