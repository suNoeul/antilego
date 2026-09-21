// 배포본 확인. 로컬 서버가 아니라 GitHub Pages 를 본다.
import { connect, evalJs, clickSel, key, shot, metrics, goTo, sleep } from './cdp.mjs';
const SHOTS = new URL('../shots', import.meta.url).pathname;
const BASE = 'https://sunoeul.github.io/antilego/';
const out = []; const errs = []; let fails = 0;
const ok = (n, g, w) => { const p = JSON.stringify(g) === JSON.stringify(w); if (!p) fails++;
  out.push(`${p ? 'PASS' : 'FAIL'} | ${n} | got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

const cdp = await connect();
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
cdp.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error: ' + JSON.stringify(m.params.args).slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') errs.push('exception: ' + JSON.stringify(m.params.exceptionDetails.text || ''));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push('log: ' + m.params.entry.text.slice(0, 160));
});

const snap = () => evalJs(cdp, `return {
  hash: location.hash, title: document.getElementById('title').textContent,
  loc: document.getElementById('loc-text').textContent,
  open: !document.getElementById('picker').hidden,
  step: document.getElementById('picker').dataset.step,
  crumb: document.getElementById('pick-crumb').textContent,
  nv: document.querySelectorAll('#col-v .num').length,
  headV: (() => { const h=document.querySelector('.pick-colwrap[data-col="3"] .pick-colhead'), u=h.querySelector('.colhead-sub');
    const s=getComputedStyle(u,'::before').content.replace(/^"|"$/g,''); return h.firstChild.textContent + (s==='none'?'':s) + u.textContent; })(),
  whole: document.getElementById('pick-whole').textContent,
  scrollY: Math.round(window.scrollY), sw: document.documentElement.scrollWidth,
};`);

// ---------- 데스크톱 1400×900 ----------
await metrics(cdp, { width: 1400, height: 900, mobile: false });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
await goTo(cdp, BASE + '#Judg.9');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(2500);
ok('배포 버전', await evalJs(cdp, `return window.__antilego.V;`), 'f670e90');
ok('출발', (await snap()).hash, '#Judg.9');

await clickSel(cdp, '#loc');
await sleep(400);
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
await sleep(300);
ok('권 클릭: hash 그대로', (await snap()).hash, '#Judg.9');
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(900);
let s = await snap();
ok('장 클릭: hash 그대로', s.hash, '#Judg.9');
ok('장 클릭: 뒤 본문 사사기', /^사사기 9장/.test(s.title), true);
ok('장 클릭: 상단바 그대로', s.loc, '사사기 9장');
ok('장 클릭: 피커 열린 채', s.open, true);
ok('장 클릭: 절 열 20', s.nv, 20);
ok('장 클릭: 절 머리', s.headV, '절 · 창세기 12장');
await shot(cdp, `${SHOTS}/live-desktop-chapter-picked.png`);

await clickSel(cdp, '#col-v .num[data-n="9"]');
await sleep(1500);
s = await snap();
ok('절 클릭: hash', s.hash, '#Gen.12');
ok('절 클릭: 피커 닫힘', s.open, false);
ok('절 클릭: 본문 창세기 12장', /^창세기 12장/.test(s.title), true);
ok('절 클릭: 9절', await evalJs(cdp, `const el=document.querySelector('.verse[data-v="9"]'); const r=el.getBoundingClientRect();
  return [el.classList.contains('verse-hl'), r.top > 0 && r.bottom < innerHeight];`), [true, true]);
await shot(cdp, `${SHOTS}/live-desktop-verse-jump.png`);

// Enter 로 장만
await goTo(cdp, BASE + '#Judg.9');
await sleep(1200);
await clickSel(cdp, '#loc');
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(500);
await key(cdp, 'Enter');
await sleep(1500);
s = await snap();
ok('Enter(장): hash · 닫힘 · scrollY', [s.hash, s.open, s.scrollY], ['#Gen.12', false, 0]);

// 검색
await goTo(cdp, BASE + '#Gen.1');
await sleep(1200);
await clickSel(cdp, '#loc');
await evalJs(cdp, `const q=document.getElementById('pick-q'); q.value='삿 9:3'; q.dispatchEvent(new Event('input',{bubbles:true})); q.focus(); return 1;`);
await key(cdp, 'Enter');
await sleep(1800);
s = await snap();
ok('`삿 9:3` + Enter', [s.hash, s.open], ['#Judg.9', false]);
ok('`삿 9:3` + Enter: 3절 하이라이트', await evalJs(cdp, `return document.querySelector('.verse[data-v="3"]').classList.contains('verse-hl');`), true);

// ---------- 모바일 360×800 ----------
await metrics(cdp, { width: 360, height: 800, mobile: true });
await goTo(cdp, BASE + '#Judg.9');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(2500);
await clickSel(cdp, '#loc');
await sleep(400);
ok('모바일 열림: 1단계', (await snap()).step, '1');
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
await sleep(300);
ok('모바일 권 탭: 2단계 · hash 그대로', [(await snap()).step, (await snap()).hash], ['2', '#Judg.9']);
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(900);
s = await snap();
ok('모바일 장 탭: 3단계', s.step, '3');
ok('모바일 장 탭: hash 그대로', s.hash, '#Judg.9');
ok('모바일 장 탭: 뒤 본문 사사기', /^사사기 9장/.test(s.title), true);
ok('모바일 장 탭: breadcrumb · 절', [s.crumb, s.nv], ['창세기 › 12장', 20]);
ok('모바일 장 탭: 링크', s.whole, '12장 처음부터 보기');
ok('모바일: 가로 스크롤 없음', s.sw, 360);
await shot(cdp, `${SHOTS}/live-mobile-verses.png`);
await clickSel(cdp, '#pick-whole');
await sleep(1800);
s = await snap();
ok('모바일 `12장 처음부터 보기`', [s.hash, s.open, s.scrollY], ['#Gen.12', false, 0]);
ok('모바일: 본문 창세기 12장', /^창세기 12장/.test(s.title), true);
await shot(cdp, `${SHOTS}/live-mobile-after.png`);

out.push('');
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close(); process.exit(0);
