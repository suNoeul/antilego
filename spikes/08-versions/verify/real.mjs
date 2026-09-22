// 08-b 실데이터 — 08-a 가 넣은 `web/data/{krv,kjv,bsb}/books/` + `versions.json` 위에서
// 역본 축이 통째로 도는가. 사사기 9장으로 본다 (세겜 · 아루마 · 도벨 …).
// ESV 만 가로채 가짜 응답을 준다 — 진짜 ESV 본문은 쓰지 않는다.
import { connect, evalJs, clickSel, shot, metrics, goTo, sleep, mockFetch } from './cdp.mjs';

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

// 개역한글 사사기 9:1 은 세겜(adf74d4) 하나를 가리키고, **4절에는 지명이 없다**.
// 그래서 아래 가짜 지문에서 4절의 Shechem 은 버튼이 되면 안 된다 — 가늠자는 개역한글이다.
const ESV = {
  ok: true, ref: 'Judg.9', notice: 'ESV® … Used by permission.',
  verses: [
    { v: 1, text: 'Fixture verse one goes to Shechem and speaks there.' },
    { v: 4, text: 'Fixture verse four also says Shechem but the Korean text names no place.' },
  ],
};

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
await mockFetch(cdp, '*/api/esv*', () => ({ status: 200, body: ESV }));

await metrics(cdp, { width: 1400, height: 900, mobile: false });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
await goTo(cdp, BASE + '#Judg.9');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1500);

const snap = () => evalJs(cdp, `return {
  hash: location.hash,
  legacy: window.__antilego.state.legacyData,
  ver: window.__antilego.state.ver,
  btnHidden: document.getElementById('verbtn').hidden,
  btnText: document.getElementById('verbtn-text').textContent,
  ids: window.__antilego.state.versions.map(v => v.id),
  lang: document.getElementById('verses').classList.contains('lang-en'),
  nverses: document.querySelectorAll('.verse').length,
  nplaces: document.querySelectorAll('.place').length,
  v1: document.querySelector('.verse[data-v="1"]')?.textContent.slice(1, 60) ?? null,
  p1: [...document.querySelectorAll('.verse[data-v="1"] .place')].map(b => b.textContent + '→' + b.dataset.p),
  p4: [...document.querySelectorAll('.verse[data-v="4"] .place')].map(b => b.textContent),
  era: document.getElementById('era-caption').hidden ? null : document.querySelector('.era-name')?.textContent ?? null,
  attrVer: document.getElementById('attr-ver').hidden ? null : document.getElementById('attr-ver').textContent,
  title: document.getElementById('title').textContent,
};`);

// --- 1. 개역한글 (기본) ---
let s = await snap();
ok('실데이터: versions.json 을 받았다', s.legacy, false);
ok('실데이터: 네 역본', s.ids, ['krv', 'kjv', 'bsb', 'esv']);
ok('실데이터: 기본 개역한글', s.ver, 'krv');
ok('실데이터: 버튼이 보인다', s.btnHidden, false);
ok('개역한글: 사사기 9장 57절', s.nverses, 57);
ok('개역한글: 1절', s.v1.startsWith('여룹바알의 아들 아비멜렉이 세겜에'), true);
ok('개역한글: 1절 지명 = 세겜', s.p1, ['세겜→adf74d4']);
await clickSel(cdp, '#btn-map');     // 시대 캡션은 지도 패널 안에 있다
await sleep(700);
s = await snap();
ok('개역한글: 시대 캡션', s.era, '정복·사사 시대');
await shot(cdp, `${SHOTS}/b-real-krv.png`);

// --- 2. KJV ---
await clickSel(cdp, '#verbtn');
await clickSel(cdp, '.veritem[data-id="kjv"]');
await sleep(800);
s = await snap();
ok('KJV: 57절 그대로', s.nverses, 57);
ok('KJV: 1절 영문', s.v1.startsWith('And Abimelech the son of Jerubbaal'), true);
ok('KJV: 1절 지명 = Shechem', s.p1, ['Shechem→adf74d4']);
ok('KJV: 영문 글꼴', s.lang, true);
ok('KJV: 시대 캡션은 그대로', s.era, '정복·사사 시대');
ok('KJV: 출처 줄', s.attrVer, '본문: King James Version (public domain)');
ok('KJV: 제목은 한국어', s.title, '사사기 9장');
await shot(cdp, `${SHOTS}/b-real-kjv.png`);
const kjv1 = s.v1;

// --- 3. BSB ---
await clickSel(cdp, '#verbtn');
await clickSel(cdp, '.veritem[data-id="bsb"]');
await sleep(800);
s = await snap();
ok('BSB: 57절', s.nverses, 57);
ok('BSB: 1절이 KJV 와 다르다', s.v1 !== kjv1, true);
ok('BSB: 1절 지명 = Shechem', s.p1, ['Shechem→adf74d4']);
ok('BSB: 출처 줄', s.attrVer, '본문: Berean Standard Bible (public domain, CC0)');
await shot(cdp, `${SHOTS}/b-real-bsb.png`);

// --- 4. ESV (가짜 응답) — 지명은 개역한글이 가리키는 절에서만 ---
await clickSel(cdp, '#verbtn');
await clickSel(cdp, '.veritem[data-id="esv"]');
await sleep(900);
s = await snap();
ok('ESV: 가짜 응답의 두 절', s.nverses, 2);
ok('ESV: 1절 지명 = Shechem (개역한글 1절이 가리킨다)', s.p1, ['Shechem→adf74d4']);
ok('ESV: 4절은 지명 없음 (개역한글 4절에 지명이 없다)', s.p4, []);
ok('ESV: 고지문', s.attrVer.includes('ESV®'), true);
// 지도는 역본과 상관없이 그 장의 지명을 그대로 그린다 (개역한글의 `places` 를 물려받는다).
ok('ESV: 지도에 이 장 지명이 그대로 있다',
  await evalJs(cdp, `return window.__antilego.state.data.places.length;`), 10);
ok('ESV: 카드의 `이 장에서 N회`', await evalJs(cdp, `
  document.querySelector('.verse[data-v="1"] .place').click();
  await new Promise(r => setTimeout(r, 400));
  return document.querySelector('.card-n').textContent;`), '이 장에서 22회 · 성경 전체 50회');
await shot(cdp, `${SHOTS}/b-real-esv.png`);

// --- 5. 역본을 유지한 채 장을 옮긴다 ---
await clickSel(cdp, '#verbtn');
await clickSel(cdp, '.veritem[data-id="kjv"]');
await sleep(800);
await clickSel(cdp, '#btn-next');
await sleep(900);
s = await snap();
ok('장 이동: 해시', s.hash, '#Judg.10');
ok('장 이동: 역본 유지', s.ver, 'kjv');
ok('장 이동: 영문 본문', s.lang, true);
ok('장 이동: 사사기 10장 18절', s.nverses, 18);
await clickSel(cdp, '#btn-prev');
await sleep(900);
ok('되돌아오기', (await snap()).hash, '#Judg.9');

// --- 6. 피커는 역본과 상관없이 절 수를 센다 ---
await clickSel(cdp, '#loc');
await sleep(500);
ok('피커: 절 열 57', await evalJs(cdp, `return document.querySelectorAll('#col-v .num').length;`), 57);
await clickSel(cdp, '#pick-x');
await sleep(300);

// --- 7. 실데이터 세 자리 (코디네이터 확인 요청) ---
// ① 여호수아 10장 KJV — 지명이 실제로 붙는가
await evalJs(cdp, `localStorage.setItem('ver','kjv'); location.hash = '#Josh.10';`);
await sleep(1200);
const josh = await evalJs(cdp, `return {
  ver: window.__antilego.state.ver,
  nverses: document.querySelectorAll('.verse').length,
  places: window.__antilego.state.data.places.length,
  buttons: document.querySelectorAll('.place').length,
  names: [...new Set([...document.querySelectorAll('.place')].map(b => b.textContent))].slice(0, 4),
};`);
ok('Josh.10 KJV: 43절', josh.nverses, 43);
ok('Josh.10 KJV: 이 장의 지명 19곳', josh.places, 19);
ok('Josh.10 KJV: 지명 버튼 68개', josh.buttons, 68);
ok('Josh.10 KJV: 첫 지명들', josh.names, ['Jerusalem', 'Ai', 'Jericho', 'Gibeon']);
await shot(cdp, `${SHOTS}/b-real-josh10-kjv.png`);

// ② 사도행전 27장 KJV — 여러 낱말로 된 지명(`The fair havens`)이 통째로 밑줄이 되는가
await evalJs(cdp, `location.hash = '#Acts.27';`);
await sleep(1200);
const acts = await evalJs(cdp, `return {
  nverses: document.querySelectorAll('.verse').length,
  v8: [...document.querySelectorAll('.verse[data-v="8"] .place')].map(b => b.textContent),
};`);
ok('Acts.27 KJV: 44절', acts.nverses, 44);
ok('Acts.27 KJV: 8절에 `The fair havens` 가 통째로', acts.v8.includes('The fair havens'), true);
await shot(cdp, `${SHOTS}/b-real-acts27-kjv.png`);

// ③ BSB 는 사본 이문 16절이 없다 (마 17:21 등). 절 번호가 건너뛰어도 조용해야 한다 —
//    빈 절도, 에러 문구도, 콘솔 오류도 없이.
await evalJs(cdp, `localStorage.setItem('ver','bsb'); location.hash = '#Matt.17';`);
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1500);
const matt = await evalJs(cdp, `return {
  ver: window.__antilego.state.ver,
  nums: [...document.querySelectorAll('.verse')].map(el => +el.dataset.v),
  empty: [...document.querySelectorAll('.verse')].filter(el => !el.textContent.replace(/^\d+/, '').trim()).length,
  msg: document.querySelector('#verses .msg')?.textContent ?? null,
};`);
ok('Matt.17 BSB: 26절 (21절이 없다)', matt.nums.length, 26);
ok('Matt.17 BSB: 21절을 건너뛴다', matt.nums.includes(21), false);
ok('Matt.17 BSB: 20 다음이 22', matt.nums.slice(19, 21), [20, 22]);
ok('Matt.17 BSB: 빈 절이 없다', matt.empty, 0);
ok('Matt.17 BSB: 에러 문구 없음', matt.msg, null);
// 피커도 **지금 읽는 장의 실제 절 번호**를 그린다 — 없는 21절 칸을 만들지 않고,
// 칸의 숫자가 곧 절 번호다 (개수만 세면 21번째 칸이 22절을 가리키게 된다).
await clickSel(cdp, '#loc');
await sleep(600);
const grid = await evalJs(cdp, `return [...document.querySelectorAll('#col-v .num')].map(b => +b.dataset.n);`);
ok('Matt.17 BSB: 피커 절 칸 26개', grid.length, 26);
ok('Matt.17 BSB: 21 칸이 없다', grid.includes(21), false);
ok('Matt.17 BSB: 20 다음 칸이 22', grid.slice(19, 21), [20, 22]);
ok('Matt.17 BSB: 마지막 칸이 27절', grid[grid.length - 1], 27);
// 마지막 절(27)로 간다 — 개수로만 세던 때는 닿을 수 없던 절이다.
await clickSel(cdp, '#col-v .num[data-n="27"]');
await sleep(700);
const v27 = await evalJs(cdp, `return {
  hash: location.hash,
  hl: [...document.querySelectorAll('.verse-hl')].map(el => +el.dataset.v),
  msg: document.querySelector('#verses .msg')?.textContent ?? null,
  open: !document.getElementById('picker').hidden,
};`);
ok('Matt.17 BSB: 27절로 간다', v27.hl, [27]);
ok('Matt.17 BSB: 해시 그대로 · 에러 없음', [v27.hash, v27.msg, v27.open], ['#Matt.17', null, false]);
await shot(cdp, `${SHOTS}/b-real-matt17-bsb.png`);

ok('네트워크 오류 없음', [...new Set(net)], []);

out.push('');
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close();
process.exit(0);
