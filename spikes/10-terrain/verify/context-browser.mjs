// 전용 Chrome 9222 + web/ 서버 8765. 지도 타일만 실제 네트워크, 외부 폰트/API는 대체.
import { connect, evalJs, sleep, metrics, clickSel, shot } from '../../07-picker-verse-nav/verify/cdp.mjs';
import { join } from 'node:path';
const c = await connect(), failures = [];
let count = 0, blockEra = false;
const js = code => evalJs(c, code);
const check = (v, label) => { count++; console.log(`${v ? 'PASS' : 'FAIL'} | ${label}`); if (!v) failures.push(label); };
const wait = async code => {
  for (let i=0;i<160;i++) { if (await js(`return !!(${code})`)) return; await sleep(100); }
  throw new Error('Timeout: ' + code);
};
const picture = async name => { if (process.env.SHOTS_DIR) await shot(c,join(process.env.SHOTS_DIR,name+'.png')); };
const wide = async () => {
  await js('__antilego.terrain.map.jumpTo({center:[33.6,31],zoom:5,pitch:0,bearing:0})');
  await sleep(900);
};
const visible = `Array.from(document.querySelectorAll('.terrain-context')).filter(el=>getComputedStyle(el).visibility==='visible' && Number(getComputedStyle(el.firstChild).opacity)>.01)`;
c.on(async e => {
  if (e.method !== 'Fetch.requestPaused') return;
  const {requestId,request} = e.params, url = new URL(request.url);
  if (blockEra && url.pathname.endsWith('/eras.json')) await c.send('Fetch.failRequest',{requestId,errorReason:'InternetDisconnected'});
  else if (url.hostname === 'tiles.mapterhorn.com' || url.hostname === '127.0.0.1') await c.send('Fetch.continueRequest',{requestId});
  else await c.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/css'}],body:''});
});
try {
  await c.send('Runtime.enable'); await c.send('Page.enable');
  await c.send('Fetch.enable',{patterns:[{urlPattern:'https://*'},{urlPattern:'*/eras.json*'}]});
  await c.send('Page.navigate',{url:'about:blank'});
  await c.send('Storage.clearDataForOrigin',{origin:'http://127.0.0.1:8765',storageTypes:'all'});
  await c.send('Runtime.discardConsoleEntries'); c.events.length=0;
  for (const mobile of [false,true]) {
    const tag=mobile?'mobile':'desktop';
    await metrics(c,{width:mobile?390:1400,height:mobile?844:950,mobile});
    await c.send('Page.navigate',{url:'http://127.0.0.1:8765/#Judg.13/a08174b'});
    await wait('window.__antilego?.state.data');
    await js(`if(document.documentElement.dataset.theme!=='light') document.getElementById('btn-theme').click(); __antilego.setEraLayer(false); if(!${mobile}) __antilego.setPanelW(640);`);
    if (!await js('return __antilego.state.open')) await clickSel(c,'#btn-map');
    await wait('__antilego.terrainActive()');
    check(await js(`return ${visible}.length===0`),`${tag}: 세부 지명 근경에서 배경 숨김`);
    await wide();
    check(await js(`return ${visible}.some(el=>el.textContent==='애굽')`),`${tag}: 시대 토글 off에서도 애굽 기본 표시`);
    check(await js(`return ${visible}.length>=3`),`${tag}: 넓은 지도에서 여러 지역 표시`);
    check(await js('return __antilego.terrain.map.getSource("regions").serialize().data.features.length===0'),`${tag}: 기본 경계 없음`);
    check(await js('return !document.getElementById("region-context-note").hidden'),`${tag}: 위치 참고/영토 아님 안내`);
    const textStyle=await js(`const el=${visible}[0],s=getComputedStyle(el),text=getComputedStyle(el.firstChild); return {pointer:s.pointerEvents,opacity:Number(text.opacity),family:text.fontFamily,size:parseFloat(text.fontSize)}`);
    console.log('METRIC background style:',textStyle);
    check(textStyle.pointer==='none' && textStyle.opacity===.72 && textStyle.family.includes('Serif') && textStyle.size===14,`${tag}: 14px 명조체·중간 진하기 고정·조작 통과`);
    await js(`window.__egyptStyle=()=>{const m=__antilego.terrain.contextMarkers.find(m=>m.label==='애굽'),s=getComputedStyle(m.name);return [s.fontSize,s.fontWeight,s.color,s.opacity,getComputedStyle(m.el).opacity,s.transitionDuration,s.animationName]};window.__egyptBefore=__egyptStyle();`);
    const hoverPoint=await js(`const r=__antilego.terrain.contextMarkers.find(m=>m.label==='애굽').name.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}`);
    await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',...hoverPoint}); await sleep(180);
    check(await js('return JSON.stringify(__egyptStyle())===JSON.stringify(__egyptBefore)'),`${tag}: 나라 이름 hover에도 글꼴·진하기 불변`);
    const heldHash=await js('return location.hash');
    for(const type of ['mousePressed','mouseReleased']) await c.send('Input.dispatchMouseEvent',{type,...hoverPoint,button:'left',clickCount:1});
    await sleep(180);
    check(await js(`return location.hash===${JSON.stringify(heldHash)} && JSON.stringify(__egyptStyle())===JSON.stringify(__egyptBefore)`),`${tag}: 나라 이름 클릭에 선택·강조 없음`);
    check(await js(`const backgrounds=${visible}.map(el=>el.firstChild.getBoundingClientRect());
      const places=__antilego.terrain.markers.filter(m=>getComputedStyle(m.name).visibility==='visible').map(m=>m.name.getBoundingClientRect());
      const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
      return backgrounds.every((a,i)=>!backgrounds.slice(i+1).some(b=>overlap(a,b))&&!places.some(b=>overlap(a,b)))`),`${tag}: 실제 글자 상자끼리 겹침 없음`);
    await picture(tag+'-context-light');
    await js('window.__contextMap=__antilego.terrain.map; window.__contextNode=__antilego.terrain.contextMarkers[0].el; window.__contextCamera=[__contextMap.getCenter().toArray(),__contextMap.getZoom(),__contextMap.getPitch(),__contextMap.getBearing()];');
    await clickSel(c,'#z-era');
    check(await js('return __antilego.terrain.map.getSource("regions").serialize().data.features.length>0'),`${tag}: 시대 버튼은 영역만 추가`);
    check(await js(`return ${visible}.some(el=>el.textContent==='애굽') && !document.querySelector('.terrain-label.is-region')`),`${tag}: 영역 on에도 배경 유지·중복 이름 없음`);
    await clickSel(c,'#z-era');
    await js('location.hash="#Judg.13/a355b6e"'); await wait('__antilego.state.sel==="a355b6e"'); await sleep(450);
    check(await js('const m=__antilego.terrain.map; return m===__contextMap && __contextNode.isConnected && JSON.stringify(__contextCamera)===JSON.stringify([m.getCenter().toArray(),m.getZoom(),m.getPitch(),m.getBearing()])'),`${tag}: 선택 전환에도 배경 DOM·시점 유지`);
    check(await js('return JSON.stringify(__egyptStyle())===JSON.stringify(__egyptBefore)'),`${tag}: 본문 지명 선택에도 나라 이름 진하기 불변`);
    await js('__antilego.terrain.map.jumpTo({center:[31.25,29.95],zoom:7,pitch:0,bearing:0})'); await sleep(450);
    check(await js(`const el=${visible}.find(el=>el.textContent==='애굽');return el && +getComputedStyle(el.firstChild).opacity===.72`),`${tag}: 확대 도중에도 진하기 고정`);
    await js('__antilego.terrain.map.jumpTo({zoom:10})'); await sleep(350);
    check(await js(`return ${visible}.length===0`),`${tag}: 확대하면 완전히 숨김`);
    await wide(); await clickSel(c,'#btn-theme'); await sleep(600);
    check(await js(`return ${visible}.some(el=>el.textContent==='애굽') && getComputedStyle(${visible}[0].firstChild).color==='rgb(200, 188, 169)'`),`${tag}: 다크 모드 배경 가독성 색상`);
    await picture(tag+'-context-dark');
    await js('__antilego.terrain.map.jumpTo({pitch:40,bearing:17})'); await sleep(500);
    check(await js(`return ${visible}.length>0`),`${tag}: 기울이기·회전에서도 배경 표시`);
    check(await js(`return ${visible}.every(el=>+getComputedStyle(el).opacity===1 && +getComputedStyle(el.firstChild).opacity===.72)`),`${tag}: 지형 가림 처리에도 배경 진하기 고정`);
    await picture(tag+'-context-tilted');
    check(await js('return document.documentElement.scrollWidth<=innerWidth'),`${tag}: 가로 넘침 없음`);
    await js('location.hash="#Matt.2"'); await wait('__antilego.terrain?.key==="Matt.2/"');
    check(await js('const names=__antilego.terrain.contextMarkers.map(m=>m.label);return names.includes("갈릴리")&&!names.includes("이스라엘 지파 연합")'),`${tag}: 새 시대 이름으로 교체`);
    for (const ref of ['Ps.23','Gen.1']) {
      await js(`location.hash=${JSON.stringify('#'+ref)}`); await wait(`__antilego.terrain?.key===${JSON.stringify(ref+'/')}`);
      check(await js('return __antilego.terrain.contextMarkers.length===0 && document.getElementById("region-context-note").hidden'),`${tag}: ${ref} 시대 불특정이면 생략`);
    }
    // 간단 지도도 같은 배경 이름을 그린다. 광역 본문 장면의 실제 SVG 렌더 확인.
    await js('location.hash="#Acts.13"'); await wait('__antilego.terrain?.key==="Acts.13/"');
    await clickSel(c,'#map-mode'); await sleep(250);
    check(await js('return !__antilego.terrain && document.querySelectorAll("#map .context-label").length>0'),`${tag}: SVG에서도 영역 off 배경 표시`);
    check(await js('return Array.from(document.querySelectorAll("#map .context-label")).every(el=>getComputedStyle(el).fontSize==="14px" && +getComputedStyle(el).opacity===.72)'),`${tag}: SVG도 같은 크기·진하기`);
    check(await js('return document.getElementById("map").getAttribute("aria-label").includes("대략적 위치")'),`${tag}: SVG 접근성 설명에 지역 이름 포함`);
    await picture(tag+'-context-simple');
    await js('location.hash="#Judg.13/a08174b"'); await wait('__antilego.state.book==="Judg"'); await sleep(300);
    check(await js('return document.querySelectorAll("#map .context-label").length===0'),`${tag}: SVG 근경에서도 배경 숨김`);
    await clickSel(c,'#map-mode'); await wait('__antilego.terrainActive()');
  }
  blockEra=true;
  await c.send('Page.reload',{ignoreCache:true}); await wait('window.__antilego?.state.data');
  check(await js('return __antilego.state.labelsByEra===null && __antilego.scene().contextLabels.length===0 && document.querySelectorAll(".verse").length>0'), '시대 데이터 실패에도 본문 유지·추정 이름 생성 안 함');
  const errors=c.events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  check(errors.length===0,`JS 예외·console.error ${errors.length}건`);
  if(errors.length) console.log(JSON.stringify(errors).slice(0,2000));
  console.log(`context browser: ${count-failures.length}/${count} PASS`);
  if(failures.length) process.exitCode=1;
} finally { await c.send('Fetch.disable'); c.close(); }
