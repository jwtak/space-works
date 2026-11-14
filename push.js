/* UNIVERSE WORKS 작은 서버(works-api, Supabase Edge Functions) 연결: 수신 확인 API, 폰 푸시(2026-11-14)
   - 서버에는 Microsoft 토큰을 저장하지 않는다. 요청 때 Graph 토큰을 보내면 서버가 /me 로 본인만 확인하고 버린다.
   - 폰 푸시: 이 기기를 Web Push로 등록하고, Graph 받은편지함 구독(리치 1일 + 일반 7일)을 이 화면이 열릴 때마다 연장한다.
     서버는 토큰이 없어 구독을 직접 연장하지 못하므로, 웍스가 열리는 기기(PC 포함) 아무 곳에서나 ensureGraphSub()가 맡는다.
   - 알림을 누르면 sw.js가 열린 창에 {type:'open-mail', id}를 보내거나 ./?mail=<id>#mail 로 새로 연다 → mailGoto(id)
   공개 함수: worksApi(action, body), pushMenuItem(), pushToggle(), ensureGraphSub() */
const WORKS_API = 'https://uhzophhzjwjjgoiwrmrh.supabase.co/functions/v1'; // 비우면 서버 기능을 모두 숨긴다
const VAPID_PUBLIC = 'BA1S8W0brPPz80gyDIxd6M__Zw6W_u9EnMuq9hOOQtPxOKg98aG7TjiLQJSNvFsMy2OEXjWz3vUQTtFfqt4kFzg';
// Graph 리치 알림 암호화용 자체 서명 인증서(공개키만, RSA 2048, 2036-11-11까지). 개인키는 서버 비밀값 NOTIFY_PRIVATE_KEY
const NOTIFY_CERT = 'MIIDITCCAgmgAwIBAgIULIEgFAS50j43OiSCwQI4+Y5GfC0wDQYJKoZIhvcNAQELBQAwIDEeMBwGA1UEAwwVVU5JVkVSU0UgV09SS1Mgbm90aWZ5MB4XDTI2MTExNDEyMDAzMVoXDTM2MTExMTEyMDAzMVowIDEeMBwGA1UEAwwVVU5JVkVSU0UgV09SS1Mgbm90aWZ5MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlU1LWGRKLSyoNOjeag/cqwfUYft2uumjEDkDEgjVJrUCnG+ex+XG6UShTnhV1jym+TPA8fN1UFOZqMuy9dH6i8rANAIsw2BklhTJaXnviXREZQgTV+GdPyCcHfOL6cgR2jyJ2qDZIfpWc3tsvqWlGKw8Mov/j790Td5RYq2Q5JKi64LTFxXYsIo5OFYVmQyblfVo0hUR2Kps+ktIrHkdGh94hpMP0gbGTgR2AwJUD9YwCrR/ZdjUVEW9jgJcQkS+t5rnnH2B3q2XKShi9rkURh09WkQaJuGtchVQ1zLXWp+tf1M8M6m9+07qpTEk2L8T5Wtdv5vE3UlN7SCzl301NQIDAQABo1MwUTAdBgNVHQ4EFgQUq61dcIEYy9Hws4shv2HPqLIouCEwHwYDVR0jBBgwFoAUq61dcIEYy9Hws4shv2HPqLIouCEwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAbz4OlwY9gyXM/j4GeCjmW2Yeo6SFv9iUNFgkjuS95srwX9KMFntHfx/kIwdJF4HIbK5ZzCsGJimojJgGA8aYZpRid+31jQDocd/pW2wxKGNnHK2XJa5G8KSZjKa/Cq+I05+4R/YhFQNIBt5LKRcJhW0UN8Py7YBGM8o/1zaKhoGyhymFfxjTNNxTVIFcPp72B90TF5t1SZ5JQCJwIsIsa0+c5FqtetfYDp/4b0J4McvGSLy8Pemmw/d9LQVJxefgiz/XwmkNUIGyRZxUfI4ddE1fvoTuupG4GQmIb50jU8IWOdQFn34iuc6YjiEvJ4NVp4j1x/oOs1lxkQ6ei4gHlA==';
const NOTIFY_CERT_ID = 'works-notify-2026-11';

/* 서버 호출. mail.js가 'track-new'·'opens'를 이 이름·시그니처로 부른다(바꾸지 말 것) */
async function worksApi(action, body = {}) {
  if (!WORKS_API) throw new Error('웍스 서버가 아직 연결되지 않았습니다');
  let r;
  try {
    r = await fetch(`${WORKS_API}/works`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await G.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, action }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
    });
  } catch (e) {
    if (e.status) throw e; // G.token()의 로그인 만료
    const err = new Error('웍스 서버가 응답하지 않습니다'); err.status = 0; throw err;
  }
  let j = null;
  try { j = await r.json(); } catch { /* 본문 없음 */ }
  if (!r.ok) { const err = new Error(j?.error || `웍스 서버 오류 ${r.status}`); err.status = r.status; throw err; }
  return j;
}

/* ---------- 폰 푸시 ---------- */
const PUSH = { on: null, busy: false, graphP: null, lastSync: 0 }; // on: 이 기기 구독 여부(아직 모르면 null)
const pushLs = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 저장 못 해도 된다 */ } return null; };
const pushB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const pushSupported = () => !!WORKS_API && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// PC는 1분 확인 알림(app.js mailNotify)이 이미 있어 폰에서만 보인다
const pushShown = () => pushSupported() && (typeof isMobile === 'function' ? isMobile() : matchMedia('(max-width: 760px)').matches);
const pushSay = (m) => { if (typeof toast === 'function') toast(m); };

/* 이름 메뉴에 넣을 한 줄. 누르면 app.js가 pushToggle()을 부른다 */
const pushLabel = () => `${typeof ico === 'function' ? ico('bell') : ''}${(PUSH.on ?? pushLs('worksPush') === '1') ? '폰 알림 끄기' : '폰 알림 켜기'}`;
function pushMenuItem() {
  if (!pushShown()) return '';
  return `<li><button type="button" data-push-toggle${PUSH.busy ? ' disabled' : ''}>${pushLabel()}</button></li>`;
}
function pushRedraw() { // 버튼은 그대로 두고 글자·상태만(app.js가 단 클릭 처리가 남게)
  document.querySelectorAll('[data-push-toggle]').forEach((b) => { b.innerHTML = pushLabel(); b.disabled = PUSH.busy; });
}

async function pushSubscribe(reg) {
  const key = pushB64(VAPID_PUBLIC);
  let sub = await reg.pushManager.getSubscription();
  const old = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
  if (sub && old && (old.length !== key.length || old.some((x, i) => x !== key[i]))) { await sub.unsubscribe().catch(() => {}); sub = null; } // 다른 서버 키로 등록돼 있던 것
  return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}
const pushGraphDel = (ids) => Promise.all(ids.filter(Boolean).map((id) => G.del(`/subscriptions/${encodeURIComponent(id)}`).catch(() => {})));

async function pushToggle() {
  if (!pushSupported() || PUSH.busy) return;
  PUSH.busy = true; pushRedraw();
  try {
    const reg = await navigator.serviceWorker.ready;
    const cur = await reg.pushManager.getSubscription();
    if (cur) { // 끄기
      let r = null;
      try { r = await worksApi('push-remove', { endpoint: cur.endpoint }); } catch (e) { pushSay(e.message); }
      await cur.unsubscribe().catch(() => {});
      if (r && !r.remaining) await pushGraphDel([r.subId, r.basicId]); // 마지막 기기를 끄면 메일 구독도 지운다
      pushLs('worksPush', null); pushLs('worksPushEp', null); PUSH.on = false;
      pushSay('폰 알림을 껐습니다');
      return;
    }
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') { pushSay('알림이 허용되지 않았습니다. 휴대폰 설정에서 허용해 주세요'); return; }
    const sub = await pushSubscribe(reg);
    await worksApi('push-add', { sub: sub.toJSON() });
    pushLs('worksPush', '1'); pushLs('worksPushEp', sub.endpoint); PUSH.on = true;
    // 앞서 돌던 확인(켜기 전 상태)이 끝난 뒤 다시
    try { await PUSH.graphP?.catch(() => {}); await ensureGraphSub(); } catch (e) { pushSay(`메일 알림 연결에 실패했습니다 (${e.message})`); return; }
    pushSay('폰 알림을 켰습니다');
    worksApi('push-test').catch(() => {});
  } catch (e) {
    pushSay(e.message || '폰 알림을 바꾸지 못했습니다');
  } finally {
    PUSH.busy = false; pushRedraw();
  }
}

/* Graph 받은편지함 구독 두 개
   rich : 보낸 사람·제목을 암호화해 담아 주는 구독. 최대 1440분(1일 미만)
   basic: 메일 id만 주는 구독. 최대 10080분(7일 미만). 리치 구독이 끊긴 동안(주말 등) "새 메일이 도착했습니다"만
   남은 시간이 최대의 절반보다 적으면 PATCH로 연장, 없거나 지났으면 새로 만든다. */
const PUSH_SUBS = {
  rich: { max: 1435 * 60e3, resource: "me/mailFolders('inbox')/messages?$select=subject,from,isRead", extra: () => ({ includeResourceData: true, encryptionCertificate: NOTIFY_CERT, encryptionCertificateId: NOTIFY_CERT_ID }) },
  basic: { max: 10070 * 60e3, resource: "me/mailFolders('inbox')/messages", extra: () => ({}) },
};
// 돌려주는 값: undefined = 그대로, { id, exp } = 새로 만들거나 연장함
async function pushKeep(kind, cur, clientState, reauth) {
  const k = PUSH_SUBS[kind], now = Date.now(), exp = new Date(now + k.max).toISOString();
  const left = cur?.exp ? Date.parse(cur.exp) - now : -1;
  if (cur && left > k.max / 2 && !reauth) return undefined;
  if (cur && left > 60e3) { // PATCH = 연장 + 재인증
    try { const r = await G.patch(`/subscriptions/${encodeURIComponent(cur.id)}`, { expirationDateTime: exp }); return { id: r?.id || cur.id, exp: r?.expirationDateTime || exp }; } catch (e) { if (e.status !== 404) throw e; }
  }
  const body = { changeType: 'created', notificationUrl: `${WORKS_API}/graph-notify`, lifecycleNotificationUrl: `${WORKS_API}/graph-notify?lc=1`, resource: k.resource, expirationDateTime: exp, clientState, ...k.extra() };
  let r;
  try { r = await G.post('/subscriptions', body); } catch (e) {
    if (e.status !== 409) throw e;
    // 같은 구독이 이미 있다(서버 기록이 지워진 뒤 등): 지우고 다시 만든다
    const list = (await G.get('/subscriptions')).value || [];
    await pushGraphDel(list.filter((s) => (s.resource || '').toLowerCase() === k.resource.toLowerCase() && (s.notificationUrl || '').startsWith(WORKS_API)).map((s) => s.id));
    r = await G.post('/subscriptions', body);
  }
  if (cur?.id && cur.id !== r.id) pushGraphDel([cur.id]);
  return { id: r.id, exp: r.expirationDateTime || exp };
}

async function ensureGraphSub() {
  if (!WORKS_API || !G.account) return null;
  if (PUSH.graphP) return PUSH.graphP;
  PUSH.lastSync = Date.now();
  PUSH.graphP = (async () => {
    const st = await worksApi('push-status');
    if (!st.enabled) { // 폰 알림을 켠 기기가 없다: 남은 메일 구독 정리
      if (st.sub || st.basic) { await pushGraphDel([st.sub?.id, st.basic?.id]); await worksApi('push-remove', {}); }
      return st;
    }
    if (!st.clientState) return st;
    const rich = await pushKeep('rich', st.sub, st.clientState, st.reauth);
    const basic = await pushKeep('basic', st.basic, st.clientState, st.reauth).catch(() => undefined); // 일반 구독은 실패해도 리치 구독만으로 간다
    const save = {};
    if (rich !== undefined) Object.assign(save, { id: rich.id, exp: rich.exp });
    if (basic !== undefined) Object.assign(save, { basicId: basic.id, basicExp: basic.exp });
    if (Object.keys(save).length) await worksApi('graph-sub-saved', save);
    return st;
  })().finally(() => { PUSH.graphP = null; });
  return PUSH.graphP;
}

/* ---------- 알림을 눌러 메일 열기 ---------- */
const pushLoggedIn = () => typeof S !== 'undefined' && !!S && !!G.account;
function pushOpenMail(id) {
  if (!id) return;
  if (!pushLoggedIn()) { try { sessionStorage.setItem('worksOpenMail', id); } catch { /* 못 기억하면 메일 화면만 */ } return; }
  Promise.resolve().then(() => (typeof mailGoto === 'function' ? mailGoto(id) : (location.hash = '#mail'))).catch(() => pushSay('메일을 열지 못했습니다'));
}
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open-mail') pushOpenMail(String(e.data.id || '')); });
// ./?mail=<id>#mail 로 열렸으면 id를 기억하고 주소에서 뺀다(로그인을 거쳐도 남게)
(() => {
  const id = new URLSearchParams(location.search).get('mail');
  if (!id) return;
  try { sessionStorage.setItem('worksOpenMail', id); } catch { /* 없으면 그냥 메일 화면 */ }
  history.replaceState(history.state, '', location.pathname + location.hash);
})();

/* ---------- 로그인 뒤 한 번, 다시 볼 때 30분마다 ---------- */
(async () => {
  await new Promise((res) => { const t = setInterval(() => { if (pushLoggedIn()) { clearInterval(t); res(); } }, 400); });
  try { const id = sessionStorage.getItem('worksOpenMail'); if (id) { sessionStorage.removeItem('worksOpenMail'); pushOpenMail(id); } } catch { /* 없음 */ }
  if (!WORKS_API) return;
  if (pushSupported()) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      let sub = reg ? await reg.pushManager.getSubscription() : null;
      // 브라우저가 구독을 새로 바꿨거나 지웠으면 다시 등록(켜 둔 기기만)
      if (!sub && reg && pushLs('worksPush') === '1' && Notification.permission === 'granted') sub = await pushSubscribe(reg);
      if (sub && sub.endpoint !== pushLs('worksPushEp')) { await worksApi('push-add', { sub: sub.toJSON() }); pushLs('worksPush', '1'); pushLs('worksPushEp', sub.endpoint); }
      PUSH.on = !!sub;
    } catch { /* 다음에 다시 */ }
  }
  ensureGraphSub().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - PUSH.lastSync > 30 * 60e3) ensureGraphSub().catch(() => {}); });
})();
