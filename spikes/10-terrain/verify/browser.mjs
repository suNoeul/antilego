// 전용 Chrome 9222 + web/ 서버 8765. 실제 DEM(읽기 전용)만 외부 접근한다.
import { connect, evalJs, sleep, metrics, clickSel, shot } from '../../07-picker-verse-nav/verify/cdp.mjs';
import { join } from 'node:path';
const c = await connect(Number(process.env.CDP_PORT || 9222));
let count = 0, blockDem = false;
const failures = [], requests = [], transferred = new Map();
const check = (v, label) => { count++; console.log(`${v ? 'PASS' : 'FAIL'} | ${label}`); if (!v) failures.push(label); };
const js = expression => evalJs(c, expression);
const wait = async expression => {
  for (let i = 0; i < 150; i++) { if (await js(`return !!(${expression})`)) return true; await sleep(100); }
  throw new Error('Timeout: ' + expression);
};
const snapshot = async name => { if (process.env.SHOTS_DIR) await shot(c, join(process.env.SHOTS_DIR, name + '.png')); };
c.on(async e => {
  if (e.method === 'Network.requestWillBeSent') requests.push(e.params.request.url);
  if (e.method === 'Network.responseReceived' && /tiles.mapterhorn.com/.test(e.params.response.url))
    transferred.set(e.params.requestId, { url: e.params.response.url });
  if (e.method === 'Network.loadingFinished' && transferred.has(e.params.requestId))
    transferred.get(e.params.requestId).bytes = e.params.encodedDataLength;
  if (e.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = e.params;
  const u = new URL(request.url);
  if (u.hostname === 'tiles.mapterhorn.com') {
    if (blockDem) await c.send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
    else await c.send('Fetch.continueRequest', { requestId });
  } else await c.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: '' });
});
try {
  await c.send('Runtime.enable'); await c.send('Page.enable'); await c.send('Network.enable');
  await c.send('Network.clearBrowserCache');
  await c.send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await c.send('Page.navigate', { url: 'about:blank' });
  await c.send('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:8765', storageTypes: 'all' });
  await c.send('Runtime.discardConsoleEntries'); c.events.length = 0;
  await metrics(c, { width: 1400, height: 950, mobile: false });
  await c.send('Page.navigate', { url: 'http://127.0.0.1:8765/#Josh.10' });
  await wait('window.__antilego?.state.data');
  await js('if (document.documentElement.dataset.theme !== "light") document.getElementById("btn-theme").click()');
  check(!requests.some(u => /terrain.js|maplibre-gl|mapterhorn/.test(u)), '닫힌 패널은 엔진·DEM 요청 0');
  const start = Date.now();
  await clickSel(c, '#btn-map');
  await wait('__antilego.terrainActive()');
  console.log(`METRIC first terrain ready: ${Date.now() - start}ms (headless software GPU)`);
  check(await js('return document.querySelectorAll("#terrain-map canvas").length === 1'), '지도 인스턴스 하나');
  check(await js('return __antilego.terrain.map.getPitch() === 0'), '기본 위에서 보기');
  check(await js('return __antilego.terrain.map.getTerrain().exaggeration === 1'), '실제 높이 배율 1');
  await js('window.__mapBefore = __antilego.terrain.map; __antilego.setPanelW(640); __antilego.relayout();');
  const selectionZoom = await js('return __antilego.terrain.map.getZoom()');
  const id = await js('return Object.keys(__antilego.state.places).find(k => __antilego.state.places[k].en === "Jerusalem")');
  await js(`location.hash = '#Josh.10/${id}'`);
  await wait(`__antilego.terrain.key === 'Josh.10/${id}'`);
  await sleep(1300);
  check(await js('return __antilego.terrain.map === window.__mapBefore'), '선택 변경 시 지도 재사용');
  check(await js(`return Math.abs(__antilego.terrain.map.getZoom() - ${selectionZoom}) < .001`), '선택 변경 시 확대 비율 유지');
  check(await js('return getComputedStyle(document.querySelector(".terrain-label.is-focus")).visibility === "visible"'), '선택 지명 라벨 표시');
  check(await js('const a=document.getElementById("terrain-map").getBoundingClientRect(), b=document.getElementById("map").getBoundingClientRect();return Math.abs(a.top-b.top)<1 && Math.abs(a.height-b.height)<1'), 'SVG·지형 캔버스 정렬');
  await snapshot('desktop-flat');
  const scroll = await js('return scrollY');
  await clickSel(c, '#z-terrain'); await sleep(600);
  check(await js('return __antilego.terrain.map.getPitch() >= 49'), '버튼으로 실제 3D 기울기');
  check(await js('return document.getElementById("z-terrain").getAttribute("aria-pressed") === "true"'), '기울기 버튼 접근성');
  check(await js(`return scrollY === ${scroll}`), '지형 조작 중 본문 스크롤 보존');
  await snapshot('desktop-3d');
  await clickSel(c, '#z-terrain'); await sleep(500);
  check(await js('return __antilego.terrain.map.getPitch() === 0'), '위에서 보기 복귀');
  const box = await js('return document.getElementById("terrain-map").getBoundingClientRect().toJSON()');
  const x=box.x+box.width/2, y=box.y+box.height/2;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, modifiers: 2, clickCount: 1 });
  for (let i=1;i<=8;i++) {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x:x+i*4, y:y-i*9, button:'left', buttons:1, modifiers:2 });
    await sleep(35);
  }
  await c.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:x+32, y:y-72, button:'left', modifiers:2, clickCount:1 });
  await sleep(300);
  check(await js('return __antilego.terrain.map.getPitch() > 5'), '실제 Ctrl+드래그 기울이기');
  await clickSel(c, '#z-reset'); await wait('!__antilego.terrain.map.isMoving()');
  console.log('METRIC reset camera:', await js('return [__antilego.terrain.map.getBearing(), __antilego.terrain.map.getPitch()]'));
  check(await js('return Math.abs(__antilego.terrain.map.getBearing()) < .01 && __antilego.terrain.map.getPitch() === 0'), '초기화는 북쪽·평면 복귀');
  await clickSel(c, '#z-era'); await sleep(300);
  check(await js('return __antilego.terrain.map.getSource("regions").serialize().data.features.length > 0'), '기존 시대 영역 연결');
  await clickSel(c, '#btn-theme'); await sleep(600);
  check(await js('return __antilego.terrain.map.getPaintProperty("land", "fill-color") === getComputedStyle(document.documentElement).getPropertyValue("--land").trim()'), '다크/라이트 지형 색상 동기화');
  await snapshot('desktop-dark');
  await js('__antilego.setPanel(false); window.__heldTerrain=__antilego.terrain');
  await sleep(500); const settled=requests.length; await sleep(600);
  check(requests.length === settled, '닫힌 지도에서 연속 네트워크 요청 없음');
  await js('__antilego.setPanel(true)');
  check(await js('return __antilego.terrain === window.__heldTerrain'), '패널 재열기 시 재사용');

  await metrics(c, { width: 390, height: 844, mobile: true });
  await js('if(document.documentElement.dataset.theme === "dark") document.getElementById("btn-theme").click(); __antilego.relayout();');
  await sleep(300);
  check(await js('return document.documentElement.scrollWidth <= innerWidth'), '모바일 가로 넘침 없음');
  check(await js('return __antilego.terrain.map.getCanvas().clientWidth < 390'), '모바일 지도 크기 갱신');
  const mb = await js('return document.getElementById("terrain-map").getBoundingClientRect().toJSON()');
  const tx=mb.x+mb.width/2, ty=mb.y+mb.height*.35;
  const touches = d => [{x:tx-35,y:ty+d,id:1},{x:tx+35,y:ty+d,id:2}];
  await c.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:touches(0) });
  for (let i=1;i<=8;i++) { await c.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:touches(-i*7) }); await sleep(40); }
  await c.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] }); await sleep(300);
  check(await js('return __antilego.terrain.map.getPitch() > 5'), '실제 두 손가락 기울이기');
  check(await js('return __antilego.terrain.map.getPitch() <= 55'), '최대 기울기 55도');
  await snapshot('mobile-3d');
  await c.send('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] });
  await clickSel(c, '#z-reset');
  check(await js('return !__antilego.terrain.map.isMoving()'), '동작 줄이기 설정 존중');
  await js('location.hash = "#Gen.1"');
  await wait('__antilego.state.book === "Gen" && __antilego.terrain?.key === "Gen.1/"');
  check(await js('return __antilego.terrain.map.getSource("regions").serialize().data.features.length === 0'), '원시사 시대 영역 생성 안 함');
  check(await js('const p=__antilego.terrain.map.getCenter();return Math.abs(p.lng-35.2)<.05&&Math.abs(p.lat-31.8)<.2'), '새 장으로 이동할 때는 기존처럼 해당 장의 첫 범위 표시');

  await clickSel(c, '#map-mode');
  check(await js('return !__antilego.terrain && !document.getElementById("map-wrap").classList.contains("terrain-ready")'), '간단 지도 선택 시 GPU 해제·SVG 복귀');
  await c.send('Page.reload'); await wait('window.__antilego?.state.data');
  check(await js('return !__antilego.terrain && localStorage.getItem("mapMode") === "simple"'), '간단 지도 설정 유지');
  blockDem = true; await c.send('Network.clearBrowserCache');
  await clickSel(c, '#map-mode');
  await wait('document.getElementById("terrain-status").textContent.includes("불러오지 못해")');
  check(await js('return !__antilego.terrain && document.querySelectorAll("#map path").length > 0'), 'DEM 장애 시 SVG 자동 복귀');
  check(await js('return document.querySelectorAll(".verse").length > 0'), 'DEM 장애에도 본문 읽기 가능');
  check(await js('return document.getElementById("z-terrain").disabled'), '불가능한 3D 조작 비활성화');
  await snapshot('mobile-fallback');
  blockDem = false;
  await clickSel(c, '#map-mode'); await wait('__antilego.terrainActive()');
  check(true, '다시 시도로 지형 복구');
  await js('__antilego.terrain.map.getCanvas().getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()');
  await wait('!__antilego.terrain');
  check(await js('return document.getElementById("terrain-status").textContent.includes("불러오지 못해")'), 'GPU 문맥 손실 시 복귀');

  const errors = c.events.filter(e => e.method === 'Runtime.exceptionThrown'
    || e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');
  check(errors.length === 0, `JS 예외·console.error ${errors.length}건`);
  if (errors.length) console.log(JSON.stringify(errors).slice(0,2400));
  console.log('METRIC DEM completed requests/bytes:', transferred.size,
    [...transferred.values()].reduce((sum,r)=>sum+(r.bytes||0),0));
  console.log(`terrain browser: ${count - failures.length}/${count} PASS`);
  if (failures.length) process.exitCode=1;
} finally { await c.send('Fetch.disable'); c.close(); }
