// 08-b 온라인 역본(ESV) — `/api/esv` 를 CDP 로 가로채 우리가 정한 응답으로 채운다.
// 진짜 ESV 본문은 쓰지 않는다. 여기 지문은 지명만 심어 둔 가짜다.
//
// 보는 것: 본문이 그려지는가 · 지명이 **개역한글이 가리키는 절에서만** 잡히는가 ·
//          고지문이 뜨는가 · 키 없음/502 문구와 `개역한글로 보기` 가 동작하는가 ·
//          ESV 본문이 localStorage 에 남지 않는가.
import { connect, evalJs, clickSel, shot, metrics, goTo, sleep, mockFetch } from './cdp.mjs';

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

// 개역한글 픽스처가 가리키는 지명 (여호수아 10장):
//   1절 여리고·기브온·예루살렘 · 2절 기브온 · 3절 예루살렘
// 그래서 아래 가짜 지문에서 **3절의 Gibeon 과 1절의 Azekah 는 버튼이 되면 안 된다.**
const NOTICE = 'Scripture quotations are from the ESV® Bible … Used by permission. All rights reserved.';
const GOOD = {
  ok: true, ref: 'Josh.10', notice: NOTICE,
  verses: [
    { v: 1, text: 'Fixture verse one names Jerusalem and Jericho and Gibeon, and also Azekah.' },
    { v: 2, text: 'Fixture verse two names Gibeon only, though Jericho appears here too.' },
    { v: 3, text: 'Fixture verse three names Jebus, and mentions Gibeon as well.' },
  ],
};

let reply = () => ({ status: 200, body: GOOD });

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
// `reply` 는 바뀌는 변수다 — 가로채기는 한 번만 켜고 시나리오마다 이 함수를 갈아끼운다.
await mockFetch(cdp, '*/api/esv*', req => reply(req));

await metrics(cdp, { width: 1400, height: 900, mobile: false });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light'); localStorage.setItem('ver','esv');`);
await goTo(cdp, BASE + '#Josh.10');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1400);

const snap = () => evalJs(cdp, `return {
  ver: window.__antilego.state.ver,
  btnText: document.getElementById('verbtn-text').textContent,
  lang: document.getElementById('verses').classList.contains('lang-en'),
  nverses: document.querySelectorAll('.verse').length,
  v1: document.querySelector('.verse[data-v="1"]')?.textContent.slice(1) ?? null,
  places: [1,2,3].map(n => [...document.querySelectorAll('.verse[data-v="'+n+'"] .place')]
    .map(b => b.textContent + '→' + b.dataset.p)),
  msg: document.querySelector('#verses .msg')?.textContent ?? null,
  fallback: document.getElementById('ver-fallback')?.textContent ?? null,
  attrVer: document.getElementById('attr-ver').hidden ? null : document.getElementById('attr-ver').textContent,
  attrLink: document.querySelector('#attr-ver a')?.href ?? null,
  store: Object.fromEntries(Object.entries(localStorage)),
};`);

// --- 1. 잘 받아온 경우 ---
let s = await snap();
ok('ESV: 역본', s.ver, 'esv');
ok('ESV: 버튼 글자', s.btnText, 'ESV');
ok('ESV: 절 셋이 그려졌다', s.nverses, 3);
ok('ESV: 1절 본문', s.v1.startsWith('Fixture verse one names Jerusalem'), true);
ok('ESV: 영문 글꼴', s.lang, true);
ok('ESV: 1절 지명 — 개역한글이 가리키는 셋만 (Azekah 는 아니다)',
  s.places[0], ['Jerusalem→a15257a', 'Jericho→a231f80', 'Gibeon→aede336']);
ok('ESV: 2절은 기브온만 (Jericho 는 개역한글 2절에 없다)', s.places[1], ['Gibeon→aede336']);
ok('ESV: 3절은 alt_en `Jebus` 가 잡히고 Gibeon 은 걸러진다', s.places[2], ['Jebus→a15257a']);
ok('ESV: 고지문이 출처 줄에 그대로', s.attrVer.includes(NOTICE), true);
ok('ESV: 온라인 안내', s.attrVer.includes('온라인 전용 — 읽을 때마다 ESV API에서 받아옵니다'), true);
ok('ESV: 출처 링크', s.attrLink, 'https://www.esv.org/');
ok('ESV: 본문을 저장하지 않는다 (localStorage 키)',
  Object.keys(s.store).sort(), ['last', 'theme', 'ver']);
ok('ESV: 저장된 값 어디에도 본문이 없다',
  Object.values(s.store).some(v => String(v).includes('Fixture verse')), false);
await shot(cdp, `${SHOTS}/b-desktop-esv.png`);

// 지명 버튼은 예전과 같이 눌린다
await clickSel(cdp, '.verse[data-v="1"] .place', 2);    // Gibeon
await sleep(500);
ok('ESV: 지명 클릭 → 패널', await evalJs(cdp, `return document.querySelector('.card-name').textContent;`), '기브온');
await shot(cdp, `${SHOTS}/b-desktop-esv-panel.png`);
await clickSel(cdp, '#btn-map');
await sleep(300);

// --- 2. 키가 아직 없을 때 ---
reply = () => ({ status: 503, body: { ok: false, error: 'no_key' } });
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1400);
s = await snap();
ok('no_key: 문구', s.msg, 'ESV API 키가 아직 설정되지 않았습니다');
ok('no_key: 되돌아가기 버튼', s.fallback, '개역한글로 보기');
ok('no_key: 본문은 비어 있다', s.nverses, 0);
await shot(cdp, `${SHOTS}/b-desktop-esv-nokey.png`);

// 버튼을 누르면 개역한글로 간다
await clickSel(cdp, '#ver-fallback');
await sleep(700);
s = await snap();
ok('no_key → 개역한글: 역본', s.ver, 'krv');
ok('no_key → 개역한글: 본문', s.v1.startsWith('여호수아가 아이를'), true);
ok('no_key → 개역한글: 기억까지 바뀐다', s.store.ver, 'krv');
ok('no_key → 개역한글: 버튼 글자', s.btnText, '개역한글');

// --- 3. upstream 이 죽었을 때 (502) ---
reply = () => ({ status: 502, body: { ok: false, error: 'ESV 본문을 받지 못했습니다.' } });
await evalJs(cdp, `localStorage.setItem('ver','esv');`);
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1400);
s = await snap();
ok('502: 문구', s.msg, 'ESV 본문을 불러오지 못했습니다 (온라인 전용)');
ok('502: 되돌아가기 버튼', s.fallback, '개역한글로 보기');
ok('502: 출처 줄에는 여전히 ESV 고지문', s.attrVer.includes('ESV'), true);
await shot(cdp, `${SHOTS}/b-desktop-esv-fail.png`);

// --- 4. 아예 못 닿았을 때 (연결 실패) ---
reply = () => ({ status: 500, body: '<html>oops</html>' });   // JSON 이 아닌 응답
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1400);
s = await snap();
ok('JSON 이 아닌 응답: 같은 문구', s.msg, 'ESV 본문을 불러오지 못했습니다 (온라인 전용)');
await clickSel(cdp, '#ver-fallback');
await sleep(700);
ok('되돌아가기는 언제나 열려 있다', (await snap()).ver, 'krv');

// 502·503·500 을 일부러 만들었으니 /api/esv 의 네트워크 오류는 예상된 것이다.
// 픽스처에 없는 시대 3종과, 해시 없이 처음 들어갈 때 찾는 창세기 1장도 마찬가지다.
ok('네트워크 오류는 예상된 것뿐',
  [...new Set(net.filter(t => !/eras\.json|chapter_eras\.json|era_regions\.json|\/api\/esv|books\/Gen\/1\.json/.test(t)))], []);

out.push('');
out.push(`픽스처 시대 파일 404: ${net.length}`);
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close();
process.exit(0);
