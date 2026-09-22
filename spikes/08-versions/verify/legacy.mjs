// 08-b 물러서기 — `versions.json` 이 **없는** 데이터에서 예전과 똑같이 읽히는가.
// 옛 배포본(08-a 이전의 `web/data/`)이나 배포 중간 상태에서도 화면이 멈추면 안 된다.
//   · 역본 버튼은 아예 숨는다
//   · 장은 옛 경로 `books/{Book}/{ch}.json` 에서 받는다
//   · 출처 줄에 역본 줄을 덧붙이지 않는다 (예전 화면 그대로)
// `versions.json` 요청을 CDP 로 가로채 404 로 돌려주어 그 상태를 만든다. 데이터는 픽스처
// (`books/Josh/10.json` 이 옛 자리에 그대로 있다).
import { connect, evalJs, clickSel, key, shot, metrics, goTo, sleep, mockFetch } from './cdp.mjs';

const SHOTS = new URL('../shots', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8765/?data=data-fixture';
const out = [];
const errs = [];
const net = [];
let fails = 0;
function ok(name, got, want) {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) fails++;
  out.push(`${pass ? 'PASS' : 'FAIL'} | ${name} | got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

const cdp = await connect();
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
cdp.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + JSON.stringify(m.params.args).slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') errs.push('exception: ' + JSON.stringify(m.params.exceptionDetails.text || '').slice(0, 200));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    if (m.params.entry.source === 'network') { net.push((m.params.entry.url || '?') + ' — ' + m.params.entry.text.slice(0, 80)); return; }
    errs.push('log: ' + m.params.entry.text.slice(0, 200));
  }
});

await mockFetch(cdp, '*versions.json*', () => ({ status: 404, body: { error: 'not found' } }));

await metrics(cdp, { width: 1400, height: 900, mobile: false });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
await goTo(cdp, BASE + '#Josh.10');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1400);

const snap = () => evalJs(cdp, `return {
  hash: location.hash,
  legacy: window.__antilego.state.legacyData,
  ver: window.__antilego.state.ver,
  btnHidden: document.getElementById('verbtn').hidden,
  path: window.__antilego.chapterPath('krv','Josh',10),
  title: document.getElementById('title').textContent,
  nverses: document.querySelectorAll('.verse').length,
  nplaces: document.querySelectorAll('.place').length,
  lang: document.getElementById('verses').classList.contains('lang-en'),
  attrVer: document.getElementById('attr-ver').hidden ? null : document.getElementById('attr-ver').textContent,
  attrLine: document.getElementById('attr-line').textContent.slice(0, 40),
  panelAttr: document.getElementById('panel-attr').textContent.slice(0, 40),
  era: document.getElementById('era-caption').hidden ? null
    : document.querySelector('.era-name')?.textContent ?? null,
};`);

const s0 = await snap();
ok('versions.json 이 없으면 물러선다', s0.legacy, true);
ok('역본 버튼은 숨는다', s0.btnHidden, true);
ok('역본은 개역한글 하나', s0.ver, 'krv');
ok('장 경로는 예전 그대로', s0.path, 'books/Josh/10.json');
ok('본문 제목', s0.title, '여호수아 10장');
ok('픽스처 여호수아 10장 11절', s0.nverses, 11);
ok('지명 버튼이 있다', s0.nplaces > 0, true);
ok('한글 본문 (lang-en 없음)', s0.lang, false);
ok('역본 출처 줄은 뜨지 않는다', s0.attrVer, null);
ok('출처 줄은 예전 그대로', s0.attrLine.startsWith('성경전서 개역한글판'), true);
ok('패널 출처에 역본 이름을 붙이지 않는다', s0.panelAttr.startsWith('성경전서 개역한글판'), true);

// --- 회귀 ---
await clickSel(cdp, '#btn-map');
await sleep(600);
ok('지도 패널', await evalJs(cdp, `return document.querySelectorAll('#map *').length > 5;`), true);
await shot(cdp, `${SHOTS}/b-legacy-desktop.png`);
await clickSel(cdp, '#btn-map');
await sleep(300);

await clickSel(cdp, '#loc');
await sleep(400);
ok('피커 열림', await evalJs(cdp, `return !document.getElementById('picker').hidden;`), true);
ok('피커 절 열 11', await evalJs(cdp, `return document.querySelectorAll('#col-v .num').length;`), 11);
await key(cdp, 'Escape');
await sleep(200);

await clickSel(cdp, '#btn-fb');
await sleep(400);
ok('피드백 카드', await evalJs(cdp, `return !document.getElementById('fb-card').hidden;`), true);
await clickSel(cdp, '#fb-cancel');
await sleep(300);

// 예상된 404 셋 말고는 네트워크 오류가 없어야 한다:
//   ① 일부러 404 로 만든 versions.json  ② 픽스처에 없는 시대 3종
//   ③ 첫 진입(해시 없음)의 Gen 1 — 픽스처에는 여호수아 10장 하나뿐이다 (08-b 이전과 같다)
ok('네트워크 오류는 예상된 404 뿐',
  [...new Set(net.filter(t => !/versions\.json|eras\.json|chapter_eras\.json|era_regions\.json|books\/Gen\/1\.json/.test(t)))], []);

out.push('');
out.push(`예상된 404: ${net.length}`);
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close();
process.exit(0);
