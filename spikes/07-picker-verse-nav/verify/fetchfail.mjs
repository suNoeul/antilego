import { connect, evalJs, clickSel, key, shot, metrics, goTo, sleep } from './cdp.mjs';
const SHOTS = new URL('../shots', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8765/';
const out = []; const errs = []; let fails = 0;
const ok = (n, g, w) => { const p = JSON.stringify(g) === JSON.stringify(w); if (!p) fails++;
  out.push(`${p ? 'PASS' : 'FAIL'} | ${n} | got=${JSON.stringify(g)} want=${JSON.stringify(w)}`); };

const cdp = await connect();
await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
cdp.on(m => {
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console.error');
  if (m.method === 'Runtime.exceptionThrown') errs.push('exception: ' + JSON.stringify(m.params.exceptionDetails.text || ''));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push('log: ' + m.params.entry.text.slice(0, 120));
});

await metrics(cdp, { width: 1400, height: 900, mobile: false });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
await goTo(cdp, BASE + '#Judg.9');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1200);

// 창세기 12장 JSON 만 실패시킨다 (절 수를 못 세는 상황).
await evalJs(cdp, `window.__realFetch = window.fetch;
  window.fetch = (u, o) => String(u).includes('books/Gen/12.json')
    ? Promise.resolve(new Response('', { status: 503 })) : window.__realFetch(u, o);
  return 1;`);

await clickSel(cdp, '#loc');
await clickSel(cdp, '#col-book .bk[data-id="Gen"]');
await clickSel(cdp, '#col-ch .num[data-n="12"]');
await sleep(700);
const s = await evalJs(cdp, `return {
  hint: document.querySelector('#col-v .pick-hint')?.textContent || null,
  nv: document.querySelectorAll('#col-v .num').length,
  whole: document.getElementById('pick-whole').hidden,
  wholeText: document.getElementById('pick-whole').textContent,
  open: !document.getElementById('picker').hidden,
  hash: location.hash,
};`);
ok('절 수 실패: 안내 글', s.hint, '절 목록을 불러오지 못했습니다');
ok('절 수 실패: 절 버튼 없음', s.nv, 0);
ok('절 수 실패: 피커 열린 채', s.open, true);
ok('절 수 실패: hash 그대로', s.hash, '#Judg.9');
ok('절 수 실패: 처음부터 보기 살아 있다', [s.whole, s.wholeText], [false, '12장 처음부터 보기']);
await shot(cdp, `${SHOTS}/desktop-verse-fetch-fail.png`);

// fetch 를 되돌리고 Enter — 나가는 길은 열려 있다
await evalJs(cdp, `window.fetch = window.__realFetch; return 1;`);
await evalJs(cdp, `document.querySelector('#col-ch .num[aria-selected="true"]').focus(); return 1;`);
await key(cdp, 'Enter');
await sleep(1200);
ok('절 수 실패 뒤에도 Enter 는 간다', await evalJs(cdp, `return [location.hash, document.getElementById('picker').hidden];`), ['#Gen.12', true]);

out.push('');
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close(); process.exit(0);
