// 지명 비교 회귀: 전용 Chrome 9222, web/ 서버 8765. 실제 DEM만 외부 요청.
import { connect, evalJs, sleep, metrics, clickSel, shot } from '../../07-picker-verse-nav/verify/cdp.mjs';
import { join } from 'node:path';
const c = await connect();
const js = code => evalJs(c, code);
let total = 0;
const failures = [];
function check(ok, name) { total++; console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}`); if (!ok) failures.push(name); }
async function wait(code) {
  for (let i = 0; i < 180; i++) { if (await js(`return !!(${code})`)) return; await sleep(100); }
  throw new Error('Timeout: ' + code);
}
const camera = () => js('const m=__antilego.terrain.map; return {center:m.getCenter().toArray(),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()}');
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const ids = ['a08174b','a355b6e','ab3fd96'];
async function select(id) {
  await js(`document.querySelector('.place[data-p="${id}"]').scrollIntoView({block:'start'}); scrollBy(0,-80);`);
  await clickSel(c, `.place[data-p="${id}"]`);
  await wait(`__antilego.state.sel === '${id}'`);
  await wait('!__antilego.terrain?.map.isMoving()');
  await sleep(200);
}
async function labels() {
  return js(`return ${JSON.stringify(ids)}.map(id=>{
    const m=__antilego.terrain.markers.find(m=>m.id===id);
    const r=m.name.getBoundingClientRect();
    return {id,point:getComputedStyle(m.el).visibility==='visible',name:getComputedStyle(m.name).visibility==='visible',
      rect:[r.left,r.top,r.right,r.bottom],at:m.marker.getLngLat().toArray()};
  });`);
}
function separated(rows) {
  return rows.every((a,i) => rows.slice(i+1).every(b =>
    a.rect[2]<=b.rect[0] || a.rect[0]>=b.rect[2] || a.rect[3]<=b.rect[1] || a.rect[1]>=b.rect[3]));
}
c.on(async e => {
  if (e.method !== 'Fetch.requestPaused') return;
  const {requestId,request} = e.params;
  if (new URL(request.url).hostname === 'tiles.mapterhorn.com') await c.send('Fetch.continueRequest',{requestId});
  else await c.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/css'}],body:''});
});
try {
  await c.send('Runtime.enable'); await c.send('Page.enable');
  await c.send('Fetch.enable',{patterns:[{urlPattern:'https://*'}]});
  await c.send('Page.navigate',{url:'about:blank'});
  await c.send('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:8765',storageTypes:'all'});
  await c.send('Runtime.discardConsoleEntries'); c.events.length = 0;
  for (const mobile of [false,true]) {
    const tag=mobile?'mobile':'desktop';
    await metrics(c,{width:mobile?390:1400,height:mobile?844:950,mobile});
    await c.send('Page.navigate',{url:`http://127.0.0.1:8765/#Judg.13/${ids[0]}`});
    await wait('window.__antilego?.state.data');
    if (!await js('return __antilego.state.open')) await clickSel(c, '#btn-map');
    await wait('__antilego.terrainActive()');
    await sleep(1000);
    check(await js('return document.documentElement.scrollWidth<=innerWidth'),`${tag}: 가로 넘침 없음`);
    let rows=await labels();
    check(rows.every(r=>r.point&&r.name), `${tag}: 첫 선택부터 세 지명 점·이름 모두 표시`);
    check(separated(rows), `${tag}: 세 이름 겹침 없음`);
    check(await js(`return __antilego.terrain.markers.filter(m=>m.id).every(m=>{
      const p=__antilego.state.places[m.id],at=m.marker.getLngLat();return at.lng===p.lon&&at.lat===p.lat;
    })`), `${tag}: 실제 좌표를 변경하지 않음`);
    await js('window.__compareMap=__antilego.terrain.map; window.__compareMarker=__antilego.terrain.markers[0].el;');
    await clickSel(c,'#z-in'); await clickSel(c,'#z-terrain'); await sleep(650);
    const before=await camera();
    for (const id of ids.slice(1)) {
      await select(id);
      const after=await camera();
      check(same(before,after),`${tag}: ${id} 선택 시 확대·중심·기울기·회전 유지`);
      rows=await labels();
      check(rows.every(r=>r.point&&r.name)&&separated(rows),`${tag}: 선택 전환 후 세 지명 비교 가능`);
    }
    check(await js('return __compareMap===__antilego.terrain.map && __compareMarker.isConnected'),`${tag}: 지도·마커 DOM 재사용`);
    // 지도 라벨을 직접 선택하는 경로도 같아야 한다.
    await clickSel(c,`.terrain-label[data-place="${ids[0]}"] span`);
    await wait(`__antilego.state.sel==='${ids[0]}'`);
    check(same(before,await camera()),`${tag}: 지도 이름 클릭도 시점 유지`);
    if (process.env.SHOTS_DIR) await shot(c,join(process.env.SHOTS_DIR,`${tag}-comparison-selected.png`));
    await js('location.hash="#Judg.13"'); await wait('!__antilego.state.sel');
    check(same(before,await camera()),`${tag}: 선택 해제도 시점 유지`);
    if (process.env.SHOTS_DIR) await shot(c,join(process.env.SHOTS_DIR,`${tag}-comparison.png`));
    // 지명이 실제 화면 밖일 때만 이동. 줌·기울기·회전은 유지한다.
    await js('const m=__antilego.terrain.map; m.jumpTo({center:[35.3,31.5],zoom:11.3,pitch:38,bearing:23});');
    await sleep(700);
    const outside=await camera();
    await js('window.__moves=0; __antilego.terrain.map.on("movestart",()=>window.__moves++);');
    await select(ids[1]);
    const moved=await camera();
    check(await js('return __moves>0'),`${tag}: 화면 밖 선택은 이동 발생`);
    check(Math.abs(moved.zoom-outside.zoom)<.001 && moved.pitch===outside.pitch && moved.bearing===outside.bearing,
      `${tag}: 화면 밖 이동도 배율·기울기·회전 유지`);
    check(await js(`const p=__antilego.state.places['${ids[1]}'],m=__antilego.terrain.map,q=m.project([p.lon,p.lat]);
      return q.x>20&&q.x<m.getCanvas().clientWidth-20&&q.y>20&&q.y<m.getCanvas().clientHeight-40;`),`${tag}: 이동 후 선택 지명 화면 안`);
    // 이어지는 선택은 이동 중에도 최신 선택이 이긴다.
    await js(`const a=document.querySelector('.place[data-p="${ids[0]}"]');a.click();`);
    await select(ids[2]);
    check(await js(`return document.querySelector('.terrain-label[data-place="${ids[2]}"]').getAttribute('aria-pressed')==='true'`),`${tag}: 연속 선택 최종 강조`);
    await clickSel(c,'#z-reset'); await sleep(500);
    check(await js('return __antilego.terrain.map.getPitch()===0&&__antilego.terrain.map.getBearing()===0'),`${tag}: 명시적 초기화만 평면·북쪽 복귀`);
    await clickSel(c,'#btn-theme'); await sleep(200);
    rows=await labels();
    check(rows.every(r=>r.point&&r.name)&&separated(rows),`${tag}: 다크 모드에서도 지명 관계 유지`);
    if (process.env.SHOTS_DIR) await shot(c,join(process.env.SHOTS_DIR,`${tag}-comparison-dark.png`));
    await js('__antilego.setPanel(false); window.__closedCamera={center:__antilego.terrain.map.getCenter().toArray(),zoom:__antilego.terrain.map.getZoom()}; __antilego.setPanel(true);');
    check(await js('return JSON.stringify(__closedCamera)===JSON.stringify({center:__antilego.terrain.map.getCenter().toArray(),zoom:__antilego.terrain.map.getZoom()})'),`${tag}: 닫았다 열어도 시점 유지`);
  }
  await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await js('__antilego.terrain.map.jumpTo({center:[35.3,31.5],zoom:11});');
  await select(ids[0]);
  check(await js('return !__antilego.terrain.map.isMoving()'), '동작 줄이기에서는 즉시 이동');
  await c.send('Emulation.setEmulatedMedia',{features:[]});
  await clickSel(c,'#map-mode');
  await clickSel(c,'#z-in');
  const view=await js('return __antilego.state.view');
  await select(ids[1]); await sleep(400);
  check(await js(`return __antilego.state.sel==='${ids[1]}'`), '간단 지도 본문 지명 실제 클릭 성공');
  check(same(view,await js('return __antilego.state.view')), '간단 지도도 화면 안 선택 시 배율·위치 유지');
  check(await js('return document.querySelectorAll("#map circle[data-place]").length===3'), '간단 지도 세 위치 점 유지');
  check(await js('return __antilego.state.render.labels===3'), '간단 지도 세 이름 표시');
  await js('const s=__antilego.state; s.view={...s.view,px:s.view.px+500,py:s.view.py+300}; __antilego.drawMap();');
  const offView=await js('return __antilego.state.view');
  await select(ids[2]); await sleep(450);
  const onView=await js('return __antilego.state.view');
  check(onView.z===offView.z && !same(offView,onView), '간단 지도 화면 밖 선택도 확대 유지하며 이동');
  check(await js('const b=__antilego.state.render.focusBox,r=__antilego.state.render; return b[0]>=23&&b[1]>=23&&b[2]<=r.W-23&&b[3]<=r.H-23'), '간단 지도 이동 완료 후 점·이름 화면 안');
  if (process.env.SHOTS_DIR) await shot(c,join(process.env.SHOTS_DIR,'mobile-comparison-simple.png'));
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  check(errors.length===0,`JS 예외·console.error ${errors.length}건`);
  if(errors.length) console.log(JSON.stringify(errors).slice(0,2400));
  console.log(`comparison browser: ${total-failures.length}/${total} PASS`);
  if(failures.length) process.exitCode=1;
} finally { await c.send('Fetch.disable'); c.close(); }
