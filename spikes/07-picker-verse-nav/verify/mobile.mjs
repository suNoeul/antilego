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

await metrics(cdp, { width: 360, height: 800, mobile: true });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
await goTo(cdp, BASE + '#Judg.9');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1400);

const snap = () => evalJs(cdp, `return {
  hash: location.hash,
  title: document.getElementById('title').textContent,
  open: !document.getElementById('picker').hidden,
  step: document.getElementById('picker').dataset.step,
  crumb: document.getElementById('pick-crumb').textContent,
  back: !document.getElementById('pick-back').hidden,
  nbk: document.querySelectorAll('#col-book .bk').length,
  nch: document.querySelectorAll('#col-ch .num').length,
  nv: document.querySelectorAll('#col-v .num').length,
  whole: { text: document.getElementById('pick-whole').textContent,
           show: getComputedStyle(document.getElementById('pick-whole')).display },
  cols: [...document.querySelectorAll('.pick-colwrap')].map(c => getComputedStyle(c).display),
  sw: document.documentElement.scrollWidth,
  scrollY: Math.round(window.scrollY),
};`);

ok('출발 hash', (await snap()).hash, '#Judg.9');
ok('출발: 지도 패널 닫힘', await evalJs(cdp, `return document.getElementById('btn-map').getAttribute('aria-expanded');`), 'false');

// --- 1. 열기 ---
await clickSel(cdp, '#loc');
let s = await snap();
ok('열림: 1단계', s.step, '1');
ok('열림: breadcrumb', s.crumb, '사사기 › 9장');
ok('열림: ← 뒤로 숨김', s.back, false);
ok('열림: 권 66', s.nbk, 66);
ok('열림: 가로 스크롤 없음', s.sw, 360);
await shot(cdp, `${SHOTS}/mobile-books.png`);

// --- 2. 권 탭 → 2단계 ---
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
s = await snap();
ok('권 탭: 2단계', s.step, '2');
ok('권 탭: hash 그대로', s.hash, '#Judg.9');
ok('권 탭: breadcrumb', s.crumb, '창세기');
ok('권 탭: ← 뒤로 보임', s.back, true);
ok('권 탭: 장 50', s.nch, 50);
ok('권 탭: 보이는 열', s.cols, ['none', 'flex', 'none']);
ok('권 탭: 가로 스크롤 없음', s.sw, 360);
await shot(cdp, `${SHOTS}/mobile-chapters.png`);

// --- 3. 장 탭 → 3단계만. 옮기지 않는다 ---
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(500);
s = await snap();
ok('장 탭: 3단계', s.step, '3');
ok('장 탭: hash 그대로', s.hash, '#Judg.9');
ok('장 탭: 본문 그대로 사사기', /^사사기 9장/.test(s.title), true);
ok('장 탭: 상단바 그대로', await evalJs(cdp, `return document.getElementById('loc-text').textContent;`), '사사기 9장');
ok('장 탭: breadcrumb', s.crumb, '창세기 › 12장');
ok('장 탭: 절 20', s.nv, 20);
ok('장 탭: 처음부터 보기 글자', s.whole.text, '12장 처음부터 보기');
ok('장 탭: 처음부터 보기 보인다', s.whole.show, 'block');
ok('장 탭: 보이는 열', s.cols, ['none', 'none', 'flex']);
ok('장 탭: 가로 스크롤 없음', s.sw, 360);
await shot(cdp, `${SHOTS}/mobile-verses.png`);

// --- 4. `12장 처음부터 보기` → 옮긴다 ---
await clickSel(cdp, '#pick-whole');
await sleep(1000);
s = await snap();
ok('처음부터 보기: hash', s.hash, '#Gen.12');
ok('처음부터 보기: 피커 닫힘', s.open, false);
ok('처음부터 보기: 본문 창세기 12장', /^창세기 12장/.test(s.title), true);
ok('처음부터 보기: scrollY 0', s.scrollY, 0);
ok('처음부터 보기: 하이라이트 없음', await evalJs(cdp, `return document.querySelectorAll('.verse-hl').length;`), 0);

// --- 5. 절 탭 → 옮기고 스크롤 ---
await goTo(cdp, BASE + '#Judg.9');
await sleep(900);
await clickSel(cdp, '#loc');
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(500);
ok('절 탭 전: hash 그대로', (await snap()).hash, '#Judg.9');
await clickSel(cdp, '#col-v .num[data-n="9"]');
await sleep(1200);
s = await snap();
ok('절 탭: hash', s.hash, '#Gen.12');
ok('절 탭: 피커 닫힘', s.open, false);
const v9 = await evalJs(cdp, `const el=document.querySelector('.verse[data-v="9"]'); const r=el.getBoundingClientRect();
  return { hl: el.classList.contains('verse-hl'), inView: r.top > 0 && r.bottom < innerHeight };`);
ok('절 탭: 9절 하이라이트', v9.hl, true);
ok('절 탭: 9절 화면 안', v9.inView, true);
ok('절 탭 뒤: 가로 스크롤 없음', s.sw, 360);
await shot(cdp, `${SHOTS}/mobile-verse-jump.png`);

// --- 6. 회귀: ← 뒤로 · 초성 칩 ---
await clickSel(cdp, '#loc');
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(400);
ok('뒤로 전 단계', (await snap()).step, '3');
await clickSel(cdp, '#pick-back');
ok('뒤로 → 2', (await snap()).step, '2');
await clickSel(cdp, '#pick-back');
s = await snap();
ok('뒤로 → 1', s.step, '1');
ok('1단계에서 ← 뒤로 숨김', s.back, false);
await clickSel(cdp, '.kchip[data-cho="ㄱ"]');
ok('칩 ㄱ: 6권', await evalJs(cdp, `return [...document.querySelectorAll('#col-book .bk')].map(b=>b.dataset.id);`),
  ['Ezek', '1Cor', '2Cor', 'Gal', 'Col', 'Rev']);
ok('칩 ㄱ: 가로 스크롤 없음', (await snap()).sw, 360);
await shot(cdp, `${SHOTS}/mobile-chip-ga.png`);
await clickSel(cdp, '.kchip[data-cho="ㄱ"]');
ok('칩 해제: 66권', await evalJs(cdp, `return document.querySelectorAll('#col-book .bk').length;`), 66);
out.push('  (참고) 모바일에는 하드웨어 Esc 가 없고 탭한 버튼에 포커스가 남지 않는다 — `×` 로 닫는다.');
await clickSel(cdp, '#pick-x');
ok('× 로 닫힘', (await snap()).open, false);

// --- 7. 회귀: 지도 시트 ---
ok('지도 클릭 전: 닫혀 있다', await evalJs(cdp, `return document.getElementById('btn-map').getAttribute('aria-expanded');`), 'false');
await clickSel(cdp, '#btn-map');
await sleep(800);
ok('지도 시트 열림', await evalJs(cdp, `return document.getElementById('btn-map').getAttribute('aria-expanded');`), 'true');
ok('지도에 원', await evalJs(cdp, `return document.querySelectorAll('#map circle').length > 0;`), true);
await clickSel(cdp, '#loc');
await sleep(300);
s = await snap();
ok('지도 시트 위에 피커', s.open, true);
ok('피커가 시트를 덮는다', await evalJs(cdp, `const e=document.elementFromPoint(180, 600); return !!e && !!e.closest('#picker');`), true);
await clickSel(cdp, '#pick-x');
ok('× : 피커만 닫힌다 (지도 시트는 그대로)', await evalJs(cdp, `return [document.getElementById('picker').hidden, document.getElementById('btn-map').getAttribute('aria-expanded')];`), [true, 'true']);
await clickSel(cdp, '#btn-map');
await sleep(400);

out.push('');
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close();
process.exit(0);
