import { connect, evalJs, clickSel, key, type, shot, metrics, goTo, sleep } from './cdp.mjs';

const SHOTS = new URL('../shots', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8765/';
const out = [];
const errs = [];
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
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push('log: ' + m.params.entry.text.slice(0, 200));
});

await metrics(cdp, { width: 1400, height: 900, mobile: false });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
// 해시만 바꾸면 새로고침이 아니다 — localStorage 를 턴 상태로 **다시 띄운다**.
await goTo(cdp, BASE + '#Judg.9');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1200);
ok('출발: 지도 패널 닫힘', await evalJs(cdp, `return document.getElementById('btn-map').getAttribute('aria-expanded');`), 'false');

const snap = () => evalJs(cdp, `return {
  hash: location.hash,
  title: document.getElementById('title').textContent,
  open: !document.getElementById('picker').hidden,
  step: document.getElementById('picker').dataset.step,
  nch: document.querySelectorAll('#col-ch .num').length,
  nv: document.querySelectorAll('#col-v .num').length,
  headV: (() => { const h = document.querySelector('.pick-colwrap[data-col="3"] .pick-colhead'), u = h.querySelector('.colhead-sub');
    const sep = getComputedStyle(u, '::before').content.replace(/^"|"$/g, ''); return h.firstChild.textContent + (sep === 'none' ? '' : sep) + u.textContent; })(),
  headCh: (() => { const h = document.querySelector('.pick-colwrap[data-col="2"] .pick-colhead'), u = h.querySelector('.colhead-sub');
    const sep = getComputedStyle(u, '::before').content.replace(/^"|"$/g, ''); return h.firstChild.textContent + (sep === 'none' ? '' : sep) + u.textContent; })(),
  selBook: document.querySelector('#col-book .bk[aria-selected="true"]')?.dataset.id || null,
  selCh: document.querySelector('#col-ch .num[aria-selected="true"]')?.dataset.n || null,
  scrollY: Math.round(window.scrollY),
  active: document.activeElement.id || document.activeElement.className,
  whole: (() => { const w = document.getElementById('pick-whole'); return { hidden: w.hidden, text: w.textContent }; })(),
  hint: document.querySelector('#col-v .pick-hint')?.textContent || null,
};`);

// --- 1. 열기 ---
ok('start hash', (await snap()).hash, '#Judg.9');
await clickSel(cdp, '#loc');
let s = await snap();
ok('open: picker', s.open, true);
ok('open: 현재 권 선택', s.selBook, 'Judg');
ok('open: 현재 장 선택', s.selCh, '9');
ok('open: 절 열 = 사사기 9장 57절', s.nv, 57);
ok('open: 절 머리', s.headV, '절 · 사사기 9장');

// --- 2. 권 클릭 (창세기) ---
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
s = await snap();
ok('권 클릭: hash 그대로', s.hash, '#Judg.9');
ok('권 클릭: 장 열 50', s.nch, 50);
ok('권 클릭: 절 열 비었다', s.nv, 0);
ok('권 클릭: 절 열 안내', s.hint, '장을 고르세요');

// --- 3. 장 클릭 (12) — 옮기지 않는다 ---
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(400);
s = await snap();
ok('장 클릭: hash 그대로', s.hash, '#Judg.9');
ok('장 클릭: 본문 그대로 사사기', /^사사기 9장/.test(s.title), true);
ok('장 클릭: 상단바 그대로', await evalJs(cdp, `return document.getElementById('loc-text').textContent;`), '사사기 9장');
ok('장 클릭: 피커 열린 채', s.open, true);
ok('장 클릭: 절 열 20 (창 12)', s.nv, 20);
ok('장 클릭: 절 머리', s.headV, '절 · 창세기 12장');
ok('장 클릭: 장 머리', s.headCh, '장 · 창세기');
ok('장 클릭: 포커스가 그 장 숫자로', await evalJs(cdp, `const a=document.activeElement; return a.classList.contains('num') && a.dataset.n;`), '12');
ok('장 클릭: 데스크톱에서 처음부터 보기 감춤', await evalJs(cdp, `return getComputedStyle(document.getElementById('pick-whole')).display;`), 'none');
await shot(cdp, `${SHOTS}/desktop-chapter-picked.png`);

// --- 4. 절 클릭 (9) → 옮긴다 ---
await clickSel(cdp, '#col-v .num[data-n="9"]');
await sleep(900);
s = await snap();
ok('절 클릭: hash', s.hash, '#Gen.12');
ok('절 클릭: 피커 닫힘', s.open, false);
ok('절 클릭: 본문 창세기 12장', /^창세기 12장/.test(s.title), true);
const v9 = await evalJs(cdp, `const el=document.querySelector('.verse[data-v="9"]'); const r=el.getBoundingClientRect();
  return { hl: el.classList.contains('verse-hl'), inView: r.top > 0 && r.bottom < innerHeight, top: Math.round(r.top) };`);
ok('절 클릭: 9절 하이라이트', v9.hl, true);
ok('절 클릭: 9절 화면 안', v9.inView, true);
await shot(cdp, `${SHOTS}/desktop-verse-jump.png`);
await sleep(2200);
ok('2초 뒤 하이라이트 사라짐', await evalJs(cdp, `return document.querySelectorAll('.verse-hl').length;`), 0);

// --- 5. Enter 로 장만 ---
await goTo(cdp, BASE + '#Judg.9');
await sleep(700);
await evalJs(cdp, `window.scrollTo(0, 600);`);
await clickSel(cdp, '#loc');
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(300);
await key(cdp, 'Enter');
await sleep(900);
s = await snap();
ok('Enter(장): hash', s.hash, '#Gen.12');
ok('Enter(장): 피커 닫힘', s.open, false);
ok('Enter(장): scrollY 0', s.scrollY, 0);
ok('Enter(장): 하이라이트 없음', await evalJs(cdp, `return document.querySelectorAll('.verse-hl').length;`), 0);
ok('Enter(장): 포커스 #loc 복귀', s.active, 'loc');

// --- 6. 검색창 `삿 9` + Enter ---
await goTo(cdp, BASE + '#Gen.1');
await sleep(700);
await clickSel(cdp, '#loc');
await type(cdp, '삿 9');
await key(cdp, 'Enter');
await sleep(900);
s = await snap();
ok('`삿 9` + Enter: hash', s.hash, '#Judg.9');
ok('`삿 9` + Enter: scrollY 0', s.scrollY, 0);

// --- 7. 검색창 `삿 9:3` + Enter ---
await goTo(cdp, BASE + '#Gen.1');
await sleep(700);
await clickSel(cdp, '#loc');
await type(cdp, '삿 9:3');
await key(cdp, 'Enter');
await sleep(1200);
s = await snap();
ok('`삿 9:3` + Enter: hash', s.hash, '#Judg.9');
ok('`삿 9:3` + Enter: 피커 닫힘', s.open, false);
const v3 = await evalJs(cdp, `const el=document.querySelector('.verse[data-v="3"]'); const r=el.getBoundingClientRect();
  return { hl: el.classList.contains('verse-hl'), inView: r.top > 0 && r.bottom < innerHeight };`);
ok('`삿 9:3` + Enter: 3절 하이라이트', v3.hl, true);
ok('`삿 9:3` + Enter: 3절 화면 안', v3.inView, true);
await shot(cdp, `${SHOTS}/desktop-search-verse.png`);

// --- 8. 회귀: ㄱ 필터 ---
await goTo(cdp, BASE + '#Judg.9');
await sleep(700);
await clickSel(cdp, '#loc');
await type(cdp, 'ㄱ');
ok('필터 ㄱ: 권 목록', await evalJs(cdp, `return [...document.querySelectorAll('#col-book .bk')].map(b=>b.dataset.id);`),
  ['Ezek', '1Cor', '2Cor', 'Gal', 'Col', 'Rev']);
await shot(cdp, `${SHOTS}/desktop-filter-ga.png`);

// --- 9. 회귀: Esc / 바깥 클릭 ---
await key(cdp, 'Escape');
ok('Esc 로 닫힘', (await snap()).open, false);
await clickSel(cdp, '#loc');
ok('다시 열림', (await snap()).open, true);
ok('바깥 지점(30,750)이 본문 지명이 아니다', await evalJs(cdp, `const e=document.elementFromPoint(30,750); return !!e && !e.closest('.place');`), true);
await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 30, y: 750, button: 'left', clickCount: 1 });
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 30, y: 750, button: 'left', clickCount: 1 });
await sleep(200);
ok('바깥 클릭으로 닫힘', (await snap()).open, false);
ok('바깥 클릭: hash 그대로', (await snap()).hash, '#Judg.9');

// --- 10. 회귀: ‹ › ---
await goTo(cdp, BASE + '#Judg.9');
await sleep(700);
await clickSel(cdp, '#btn-next');
await sleep(700);
ok('› 다음 장', (await snap()).hash, '#Judg.10');
await clickSel(cdp, '#btn-prev');
await sleep(700);
ok('‹ 이전 장', (await snap()).hash, '#Judg.9');

// --- 11. 회귀: 지도 패널 · 시대 토글 ---
ok('지도 클릭 전: 닫혀 있다', await evalJs(cdp, `return document.getElementById('btn-map').getAttribute('aria-expanded');`), 'false');
await clickSel(cdp, '#btn-map');
await sleep(700);
ok('지도 패널 열림', await evalJs(cdp, `return document.getElementById('btn-map').getAttribute('aria-expanded');`), 'true');
ok('지도에 원이 그려진다', await evalJs(cdp, `return document.querySelectorAll('#map circle').length > 0;`), true);
await clickSel(cdp, '#z-era');
await sleep(500);
ok('시대 토글 on', await evalJs(cdp, `return document.getElementById('z-era').getAttribute('aria-pressed');`), 'true');
await shot(cdp, `${SHOTS}/desktop-regression-map.png`);
await clickSel(cdp, '#z-era');
await sleep(300);
ok('시대 토글 off', await evalJs(cdp, `return document.getElementById('z-era').getAttribute('aria-pressed');`), 'false');

// --- 12. 회귀: 피드백 카드 ---
await clickSel(cdp, '#btn-fb');
await sleep(400);
ok('피드백 카드 열림', await evalJs(cdp, `return !document.getElementById('fb-card').hidden;`), true);
ok('피드백 위치 줄', await evalJs(cdp, `return document.getElementById('fb-loc-t').textContent;`), '사사기 9장 1절');
await clickSel(cdp, '#fb-cancel');
await sleep(300);
ok('피드백 카드 닫힘', await evalJs(cdp, `return document.getElementById('fb-card').hidden;`), true);

// --- 13. 다크 ---
await clickSel(cdp, '#loc');
await sleep(200);
await evalJs(cdp, `document.documentElement.dataset.theme='dark';`);
await sleep(200);
await shot(cdp, `${SHOTS}/desktop-dark.png`);
await evalJs(cdp, `document.documentElement.dataset.theme='light';`);
await key(cdp, 'Escape');

await evalJs(cdp, `if (document.getElementById('btn-map').getAttribute('aria-expanded') === 'true') document.getElementById('btn-map').click();`);

out.push('');
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close();
process.exit(0);
