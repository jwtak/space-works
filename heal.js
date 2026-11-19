/* 맨 마지막에 읽는 파일. app.js가 실행되지 않아 화면이 비면(2026-11-19: 서비스워커가 app.js를 못 내줘 본문이 빈 채로 뜸)
   화면 파일 캐시를 지우고 한 번 다시 불러온다. 1분 안에 또 비면 다시 불러오기 버튼만 둔다.
   서비스워커는 등록을 풀지 않는다(풀면 폰 푸시 구독도 사라짐). 캐시가 비면 서비스워커가 서버에서 새로 받는다 */
(() => {
  if (typeof viewGet === 'function') return;
  let auto = false;
  try {
    auto = Date.now() - (Number(sessionStorage.getItem('works:heal')) || 0) > 60000;
    if (auto) sessionStorage.setItem('works:heal', String(Date.now()));
  } catch { auto = false; }
  const clear = async () => {
    try { for (const k of await caches.keys()) if (k !== 'works-data') await caches.delete(k); } catch { /* 캐시를 못 지워도 다시 불러온다 */ }
  };
  if (auto) { clear().finally(() => location.reload()); return; }
  const p = document.getElementById('page') || document.body;
  p.innerHTML = '<div class="empty">화면을 불러오지 못했습니다<br><br><button type="button" class="btn">다시 불러오기</button></div>';
  p.querySelector('button').addEventListener('click', () => { clear().finally(() => location.reload()); });
})();
