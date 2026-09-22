// 08-b 모바일 360×800 — 상단바에 글자가 하나 늘었다. 가로 스크롤이 생기면 안 된다.
// 실데이터(`web/data/`)로 돈다. ESV 만 가로채 실패를 만들어 되돌아가기 버튼까지 본다.
import { connect, evalJs, tapSel, shot, metrics, goTo, sleep, mockFetch } from './cdp.mjs';

const SHOTS = new URL('../shots', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8765/';
const out = [];
const errs = [];
const net = [];
let fails = 0;
function ok(name, got, want) {
  const pass = JSON.stringify(got) === JSON.stringify(want);
  if (!pass) fails++;
  out.push(`${pass ? 'PASS' : 'FAIL'} | ${name} | got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

let reply = () => ({ status: 503, body: { ok: false, error: 'no_key' } });

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
await mockFetch(cdp, '*/api/esv*', req => reply(req));

await metrics(cdp, { width: 360, height: 800, mobile: true });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
// 긴 권 이름으로 상단바를 가장 빡빡하게 만든다 (데살로니가전서).
await goTo(cdp, BASE + '#1Thess.1');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1500);

const snap = () => evalJs(cdp, `return {
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  ver: window.__antilego.state.ver,
  btnText: document.getElementById('verbtn-text').textContent,
  btnVisible: document.getElementById('verbtn').getBoundingClientRect().width > 0,
  barRight: Math.round(Math.max(...[...document.querySelectorAll('.topbar-in > *')]
    .map(el => el.getBoundingClientRect().right))),
  menuBox: (() => { const m = document.getElementById('vermenu');
    if (m.hidden) return null; const r = m.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right) }; })(),
  lang: document.getElementById('verses').classList.contains('lang-en'),
  v1: document.querySelector('.verse[data-v="1"]')?.textContent.slice(1, 30) ?? null,
  msg: document.querySelector('#verses .msg')?.textContent ?? null,
  fallback: document.getElementById('ver-fallback')?.textContent ?? null,
  loc: document.getElementById('loc-text').textContent,
};`);

let s = await snap();
ok('360: 가로 스크롤 없음 (패널 닫힘)', s.scrollW, 360);
ok('360: 상단바 위치 글자', s.loc, '데살로니가전서 1장');
ok('360: 역본 버튼이 보인다', s.btnVisible, true);
ok('360: 상단바가 화면을 넘지 않는다', s.barRight <= 360, true);
await shot(cdp, `${SHOTS}/b-mobile-topbar.png`);

// 메뉴
await tapSel(cdp, '#verbtn');
await sleep(300);
s = await snap();
ok('360: 메뉴가 화면 안에 있다', s.menuBox && s.menuBox.left >= 0 && s.menuBox.right <= 360, true);
ok('360: 메뉴를 열어도 가로 스크롤 없음', s.scrollW, 360);
await shot(cdp, `${SHOTS}/b-mobile-menu.png`);

// KJV 로
await tapSel(cdp, '.veritem[data-id="kjv"]');
await sleep(900);
s = await snap();
ok('360: KJV 로 바뀐다', s.ver, 'kjv');
ok('360: 영문 본문', s.lang, true);
ok('360: 버튼 글자', s.btnText, 'KJV');
ok('360: 영문 본문도 가로 스크롤 없음', s.scrollW, 360);
await shot(cdp, `${SHOTS}/b-mobile-kjv.png`);

// 지도 시트를 열어도
await tapSel(cdp, '#btn-map');
await sleep(800);
ok('360: 지도 시트 열림 + 가로 스크롤 없음', (await snap()).scrollW, 360);
await shot(cdp, `${SHOTS}/b-mobile-kjv-map.png`);
await tapSel(cdp, '#btn-map');
await sleep(400);

// ESV 실패 → 되돌아가기 버튼
await tapSel(cdp, '#verbtn');
await tapSel(cdp, '.veritem[data-id="esv"]');
await sleep(1000);
s = await snap();
ok('360: no_key 문구', s.msg, 'ESV API 키가 아직 설정되지 않았습니다');
ok('360: 되돌아가기 버튼', s.fallback, '개역한글로 보기');
ok('360: 실패 화면도 가로 스크롤 없음', s.scrollW, 360);
await shot(cdp, `${SHOTS}/b-mobile-esv-nokey.png`);
await tapSel(cdp, '#ver-fallback');
await sleep(900);
s = await snap();
ok('360: 개역한글로 돌아온다', s.ver, 'krv');
ok('360: 한글 본문', s.lang, false);

ok('네트워크 오류는 일부러 만든 /api/esv 실패뿐',
  [...new Set(net.filter(t => !/\/api\/esv/.test(t)))], []);

out.push('');
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close();
process.exit(0);
