# UNIVERSE WORKS

개인 업무용 웹앱 화면 코드입니다. 데이터는 이 저장소에 없고, 회사 Microsoft 365 계정으로 로그인한 사용자 본인의 Outlook·OneDrive에서만 읽고 씁니다.

- 로그인: MSAL.js (`vendor/msal-browser.min.js`, @azure/msal-browser 3.28.1, MIT License)
- 빌드 없음: 정적 파일 그대로 GitHub Pages로 제공
- 딜소싱 › 타깃 › 소비재(`#deals/cons`, `tgt.js`·`tgt.css`): `data/consumer.json`의 소비재 회사 목록(영업이익 기준), 컨택 상태와 파이프라인, 팩트시트 연결
- 딜소싱 › 타깃 › 딥테크(`#deals/deep`, `tgt.js`·`tgt.css`): `data/deeptech.json`의 젊은 창업자 딥테크 스타트업 목록(시리즈 B 이상, 우주항공 포함)
