import { connect, evalJs, clickSel, metrics, sleep, mockFetch, clearMocks, shot } from '../../09-a11y-esv/verify/cdp.mjs';
const c = await connect(), failures = []; let count = 0;
const js = code => evalJs(c, code);
const check = (value, label) => { count++; console.log(`${value ? 'PASS' : 'FAIL'} | ${label}`); if (!value) failures.push(label); };
const until = async expr => {
  for (let i = 0; i < 100; i++) { if (await js(`return !!(${expr})`)) return; await sleep(70); }
  await shot(c, 'context-failure.png');
  console.log(await js('return {hash:location.hash,story:document.getElementById("story-block").textContent,highlight:document.querySelector(".verse-hl")?.dataset.v,focus:document.activeElement?.outerHTML,errors:document.querySelector(".msg")?.textContent}'));
  throw new Error('Timeout: ' + expr);
};
await c.send('Runtime.enable');
try {
  for (const mobile of [false, true]) {
    const tag = mobile ? 'mobile' : 'desktop';
    await metrics(c, { width: mobile ? 390 : 1400, height: mobile ? 844 : 950, mobile });
    await c.send('Page.navigate', { url: 'http://127.0.0.1:8765/?map=simple#Judg.13/a08174b' });
    await until('window.__antilego?.state.data?.chapter === 13');
    await js("localStorage.clear(); if(document.documentElement.dataset.theme!=='light') document.getElementById('btn-theme').click(); if(!__antilego.state.open) __antilego.setPanel(true);");
    await sleep(300); // 실제 포인터를 보내기 전에 패널 열림 전환을 마친다.
    check(await js('return !document.getElementById("story-entry").hidden'), `${tag}: 삼손 진입점`);
    check(await js('return [...document.querySelectorAll(".verse-link")].map(b=>b.textContent).join(",")==="2절,25절"'), `${tag}: 소라 구절 색인`);
    check(await js('return !document.querySelector(".context-more").open && !document.querySelector(".map-details").open && !document.querySelector(".era-details").open'), `${tag}: 상세 정보 기본 접힘`);
    check(await js('return !performance.getEntriesByType("resource").some(r=>r.name.includes("place-refs.json"))'), `${tag}: 전체 색인 지연 로딩`);
    await clickSel(c, '.verse-link[data-verse="25"]');
    await until('document.querySelector(".verse-hl")?.dataset.v === "25"');
    check(await js('return document.querySelectorAll(".place-link").length === 3'), `${tag}: 같은 절의 세 장소`);
    check(await js('return !document.getElementById("reading-return").hidden'), `${tag}: 탐색 중 돌아가기`);
    check(await js('return document.getElementById("reading-status").textContent.includes("25절")'), `${tag}: 이동한 구절 접근성 알림`);
    if (mobile) check(await js('const r=document.querySelector(".verse-hl").getBoundingClientRect();return r.top>=48 && r.top<document.getElementById("panel").getBoundingClientRect().top'), `${tag}: 구절이 시트 위에 보임`);
    const camera = await js('return JSON.stringify(__antilego.state.view)');
    await clickSel(c, '.place-link', 1); await until('__antilego.state.sel === "a355b6e"');
    check(await js('return document.querySelector(".context-label-title:last-of-type") !== null && document.querySelectorAll(".place-link").length===3'), `${tag}: 함께 나온 지명 선택`);
    check(await js(`return JSON.stringify(__antilego.state.view)===${JSON.stringify(camera)}`), `${tag}: 지명 변경 시 시점 유지`);
    await clickSel(c, '.context-more summary'); await until('document.querySelector(".reference-link")');
    check(await js('return document.querySelectorAll(".reference-link").length <= 12'), `${tag}: 긴 목록은 나누어 표시`);
    await clickSel(c, '.reference-link'); await until('__antilego.state.book !== "Judg" || __antilego.state.ch !== 13');
    await until('document.querySelector(".verse-hl")');
    check(await js('return __antilego.state.sel === "a355b6e"'), `${tag}: 다른 장에서도 같은 장소`);
    await clickSel(c, '#reading-return'); await until('__antilego.state.book === "Judg" && __antilego.state.ch === 13 && __antilego.state.data?.chapter === 13');
    check(await js('return document.getElementById("reading-return").hidden && __antilego.state.sel === "a08174b"'), `${tag}: 첫 읽던 곳으로 복귀`);
    await sleep(150); // 복귀 스크롤 프레임 뒤의 실제 위치로 다음 버튼을 클릭한다.
    await clickSel(c, '#story-entry'); await until('document.querySelector(".verse-hl")?.dataset.v === "2"');
    check(await js('return !document.getElementById("story-block").hidden'), `${tag}: 이야기 열기`);
    check(await js('const r=document.querySelector(".story-controls").getBoundingClientRect(),p=document.getElementById("panel").getBoundingClientRect();return r.top>=p.top && r.bottom<=p.bottom'), `${tag}: 장면 조작부가 패널 안에 보임`);
    if (mobile) check(await js('return document.querySelector(".zoom-ctl").getBoundingClientRect().bottom <= innerHeight'), `${tag}: 데모에서도 지도 버튼이 시트 안에 보임`);
    await shot(c, `${tag}-story-start.png`);
    for (const [i, ch, v] of [[2,13,25],[3,14,1],[4,14,19],[5,15,14],[6,16,4],[7,16,21],[8,16,31]]) {
      await clickSel(c, '.story-controls button:last-child');
      await until(`__antilego.state.data?.chapter===${ch} && document.querySelector('.verse-hl')?.dataset.v==='${v}'`);
      check(await js(`return document.querySelector('.context-eyebrow').textContent.includes('${i} / 8')`), `${tag}: 삼손 장면 ${i}`);
    }
    check(await js('return document.querySelector(".story-controls button:last-child").disabled'), `${tag}: 마지막 장면 다음 버튼 비활성`);
    check(await js('return !document.querySelector("#map .journey-route")'), `${tag}: 추정 경로 추가 안 함`);
    await clickSel(c, '.story-controls button:first-child'); await until('__antilego.state.sel === "aa8edd2"');
    check(await js('return document.querySelector(".context-eyebrow").textContent.includes("7 / 8")'), `${tag}: 이전 장면`);
    await clickSel(c, '#reading-return'); await until('__antilego.state.data?.chapter === 13');
    check(await js('return document.getElementById("story-block").hidden'), `${tag}: 돌아가면 이야기 종료`);
    await clickSel(c, '.verse-link[data-verse="25"]'); await until('document.querySelectorAll(".place-link").length===3');
    await shot(c, `${tag}-context-light.png`);
    await clickSel(c, '#btn-theme'); await shot(c, `${tag}-context-dark.png`);
    check(await js('return document.documentElement.scrollWidth <= innerWidth'), `${tag}: 가로 넘침 없음`);
    await c.send('Page.reload', { ignoreCache: true }); await until('window.__antilego?.state.data');
    check(await js('return document.getElementById("reading-return").hidden && document.getElementById("story-block").hidden'), `${tag}: 재실행 절 복원·이야기 자동 시작 없음`);
    await js('location.hash="#Gen.1"'); await until('__antilego.state.book === "Gen" && __antilego.state.data');
    check(await js('return document.getElementById("story-entry").hidden'), `${tag}: 다른 책에 데모 진입점 없음`);
    await js('location.hash="#Judg.13"'); await until('__antilego.state.data?.book==="Judg" && __antilego.state.data?.chapter===13');
    await js('__antilego.setPanel(false)'); await sleep(250);
    await clickSel(c, '.verse[data-v="25"] .place'); await until('__antilego.state.sel==="a08174b"');
    check(await js('return document.querySelectorAll(".place-link").length===3'), `${tag}: 닫힌 지도에서 25절을 눌러도 그 절의 동반 지명`);
  }
  // 색인 실패는 본문·선택에 영향을 주지 않고 같은 자리에서 재시도한다.
  await mockFetch(c, '*place-refs.json*', () => ({ status: 503, body: {} }));
  await c.send('Page.navigate', { url: 'http://127.0.0.1:8765/?map=simple#Judg.13/a08174b' });
  await until('window.__antilego?.state.data'); await js('if(!__antilego.state.open) __antilego.setPanel(true)');
  await sleep(300);
  await clickSel(c, '.context-more summary'); await until('document.querySelector(".other-references").textContent.includes("다시 시도")');
  check(await js('return document.querySelectorAll(".verse").length===25'), '색인 실패에도 본문 유지');
  await clearMocks(c); await clickSel(c, '.other-references button'); await until('document.querySelector(".reference-link")');
  check(true, '색인 재시도 복구');
  await js('__antilego.setVersion("kjv")'); await until('__antilego.state.ver === "kjv" && __antilego.state.data?.verses?.[0]?.text.startsWith("And")');
  check(await js('return [...document.querySelectorAll(".verse-link")].map(b=>b.textContent).join(",")==="2절,25절"'), '영문 역본도 구절 연결');
  const errors = c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  check(errors.length===0, `JS 예외·console.error ${errors.length}건`);
  if(errors.length) console.log(JSON.stringify(errors).slice(0,2000));
  console.log(`Reading context browser: ${count-failures.length}/${count} PASS`);
  if(failures.length) process.exitCode=1;
} finally { c.close(); }
