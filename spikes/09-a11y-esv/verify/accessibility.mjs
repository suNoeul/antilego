import { connect, evalJs, clickSel, key, metrics, goTo, sleep, mockFetch, shot } from './cdp.mjs';

const cdp = await connect();
const errors = [], failures = [];
let assertions = 0;
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
cdp.on(m => {
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error');
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error'
      && !/\/api\/esv/.test(m.params.entry.url || '')) errors.push(m.params.entry.text);
});
const js = expression => evalJs(cdp, expression);
function ok(name, got, want) {
  assertions++;
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push({ name, got, want });
}
async function until(expression) {
  for (let i = 0; i < 80; i++) {
    if (await js(`return !!(${expression});`)) return;
    await sleep(50);
  }
  throw new Error('Timeout: ' + expression);
}
const focus = selector => js(`document.querySelector(${JSON.stringify(selector)}).focus();`);
const active = () => js(`return document.activeElement.dataset.n || document.activeElement.dataset.id || document.activeElement.id;`);
const hash = () => js('return location.hash;');
async function press(name, want) { await key(cdp, name); ok(name + ' focus', await active(), want); }
async function columns(id) { return js(`return getComputedStyle(document.getElementById('${id}')).gridTemplateColumns.split(' ').length;`); }
async function tabCycle(expected) {
  await focus('#pick-x');
  const seen = [];
  for (let i = 0; i < expected.length; i++) {
    await key(cdp, 'Tab');
    seen.push(await js(`const el = document.activeElement;
      return el.getClientRects().length && document.getElementById('picker').contains(el)
        ? (el.dataset.cho || el.closest('.pick-col')?.id || el.id) : 'OUTSIDE_OR_HIDDEN';`));
  }
  ok('visible Tab cycle', seen, expected);
  await key(cdp, 'Tab', true);
  ok('Shift+Tab reverses', await js(`return document.activeElement.closest('.pick-col')?.id || document.activeElement.id;`), expected.at(-2));
}

try {
  await metrics(cdp, { width: 1400, height: 900 });
  await goTo(cdp, 'http://127.0.0.1:8765/?ver=krv#Judg.9');
  await js(`localStorage.clear(); localStorage.setItem('theme','light');`);
  await cdp.send('Page.reload', { ignoreCache: true });
  await until('window.__antilego?.state.data');
  await clickSel(cdp, '#loc');
  ok('desktop search focus', await active(), 'pick-q');
  await press('Tab', 'Judg');
  await press('ArrowDown', 'Ruth');
  await press('ArrowUp', 'Judg');
  await press('End', 'Rev');
  await press('Home', 'Gen');
  await press('Enter', '1');
  const ncols = await columns('col-ch');
  await press('ArrowRight', '2');
  await press('ArrowDown', String(2 + ncols));
  await press('ArrowUp', '2');
  await press('ArrowLeft', '1');
  await press('End', '50');
  await press('ArrowRight', '50');
  await press('Home', '1');
  await press('ArrowUp', '1');
  ok('arrows do not navigate', await hash(), '#Judg.9');
  ok('one chapter Tab stop', await js(`return document.querySelectorAll('#col-ch [tabindex="0"]').length;`), 1);
  await press(' ', '1');
  await until('document.querySelectorAll("#col-v .num").length === 31');
  ok('Space selects chapter only', await hash(), '#Judg.9');
  await press('Tab', '1');
  const vcols = await columns('col-v');
  await press('ArrowRight', '2');
  await press('ArrowDown', String(2 + vcols));
  await press('ArrowUp', '2');
  await press('ArrowLeft', '1');
  await press('End', '31');
  await press('Home', '1');
  await press('End', '31');
  ok('one verse Tab stop', await js(`return document.querySelectorAll('#col-v [tabindex="0"]').length;`), 1);
  await key(cdp, 'Enter');
  await until('document.querySelector(".verse-hl")?.dataset.v === "31"');
  ok('verse Enter navigates', await hash(), '#Gen.1');
  ok('picker focus restored', await active(), 'loc');
  await clickSel(cdp, '#loc');
  await key(cdp, 'Tab'); await key(cdp, 'Tab'); await key(cdp, 'End');
  await key(cdp, 'Enter');
  await until('window.__antilego.state.data?.chapter === 50');
  ok('chapter Enter opens beginning', await hash(), '#Gen.50');
  ok('chapter Enter closes picker', await js('return document.getElementById("picker").hidden;'), true);

  // BSB: 실제 존재하는 버튼 순서로 20 → 22, 끝은 27. 번호를 다시 붙이지 않는다.
  await js(`window.__antilego.setVersion('bsb'); location.hash = '#Matt.17';`);
  await until('window.__antilego.state.data?.book === "Matt" && window.__antilego.state.data?.chapter === 17');
  await clickSel(cdp, '#loc');
  await until('document.querySelectorAll("#col-v .num").length === 26');
  await focus('#col-v .num[data-n="20"]');
  await press('ArrowRight', '22');
  await press('ArrowLeft', '20');
  await press('End', '27');
  await key(cdp, 'Enter');
  ok('BSB last verse reachable', await js('return document.querySelector(".verse-hl")?.dataset.v;'), '27');

  // 360px: 검색 입력 자동 포커스 없음, 단계별 보이는 컨트롤만 순환.
  await js(`window.__antilego.setVersion('krv'); location.hash='#Judg.9';`);
  await until('window.__antilego.state.data?.book === "Judg"');
  await metrics(cdp, { width: 360, height: 800, mobile: true });
  await clickSel(cdp, '#loc');
  ok('mobile initial close focus', await active(), 'pick-x');
  await tabCycle(['pick-q', 'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ', 'col-book', 'pick-x']);
  await clickSel(cdp, '.kchip[data-cho="ㄱ"]');
  ok('chip rerender focus kept', await js('return document.activeElement.dataset.cho;'), 'ㄱ');
  await clickSel(cdp, '.kchip[data-cho="ㄱ"]');
  await clickSel(cdp, '.bk[data-id="Gen"]');
  ok('mobile chapter focus', await js('return document.activeElement.closest(".pick-col")?.id;'), 'col-ch');
  await tabCycle(['pick-q', 'col-ch', 'pick-back', 'pick-x']);
  await clickSel(cdp, '#col-ch .num[data-n="12"]');
  await until('document.querySelectorAll("#col-v .num").length === 20');
  ok('mobile chapter selects without navigation', await hash(), '#Judg.9');
  ok('mobile verse step focus', await active(), 'pick-whole');
  await tabCycle(['pick-q', 'pick-whole', 'col-v', 'pick-back', 'pick-x']);
  await shot(cdp, '09-mobile-verses.png');
  await clickSel(cdp, '#pick-back');
  ok('back to chapter focus', await js('return document.activeElement.closest(".pick-col")?.id;'), 'col-ch');
  await clickSel(cdp, '#pick-back');
  ok('back to book focus', await js('return document.activeElement.closest(".pick-col")?.id;'), 'col-book');
  await key(cdp, 'Escape');
  ok('mobile Escape restores opener', await active(), 'loc');
  await metrics(cdp, { width: 1400, height: 900 });
  await clickSel(cdp, '#loc');
  await focus('#col-v .num');
  await metrics(cdp, { width: 360, height: 800, mobile: true });
  await sleep(150);
  ok('resize from desktop hidden column restores focus', await active(), 'pick-x');
  await key(cdp, 'Escape');

  // 피드백 > 피커 > 지도: 키 이벤트의 출발 위치와 관계없이 하나만 닫는다.
  await clickSel(cdp, '.place');
  const place = await js('return document.activeElement.dataset.p;');
  await clickSel(cdp, '#loc');
  await js('window.__antilego.openFb(); document.getElementById("pick-q").focus();');
  await key(cdp, 'Escape');
  ok('Escape closes feedback only', await js('return [window.__antilego.fb.open, window.__antilego.pick.open, window.__antilego.state.open];'), [false, true, true]);
  ok('feedback opener restored', await active(), 'btn-fb');
  await js('window.__antilego.openFb(); document.getElementById("fb-text").focus();');
  await key(cdp, 'Escape');
  ok('Escape inside feedback also closes only feedback', await js('return [window.__antilego.fb.open, window.__antilego.pick.open, window.__antilego.state.open];'), [false, true, true]);
  await key(cdp, 'Tab');
  ok('Tab returns to picker after feedback', await active(), 'pick-q');
  await focus('#btn-theme');
  await key(cdp, 'Escape');
  ok('Escape outside picker closes it only', await js('return [window.__antilego.pick.open, window.__antilego.state.open];'), [false, true]);
  ok('picker opener restored from outside', await active(), 'loc');
  await key(cdp, 'Escape');
  ok('map opener restored', await js('return document.activeElement.dataset.p;'), place);
  await clickSel(cdp, '#btn-map'); await focus('#z-in'); await key(cdp, 'Escape');
  ok('map button opener restored', await active(), 'btn-map');

  // ESV: 사전 안내·실패 유지·명시적 복귀·성공 후 꼬리표 해제·늦은 응답 차단.
  let response = { status: 503, body: { ok: false, error: 'no_key' } };
  let requests = 0;
  await mockFetch(cdp, '*/api/esv*', () => { requests++; return response; });
  await clickSel(cdp, '#verbtn');
  ok('ESV tag before selection', await js('return document.querySelector("[data-id=esv] .ver-tag").textContent;'), '온라인 · 키 없음');
  ok('no availability probe', requests, 0);
  ok('mobile menu width', await js('return document.documentElement.scrollWidth;'), 360);
  await shot(cdp, '09-mobile-version-menu.png');
  await key(cdp, 'Escape');
  ok('version Escape focus', await active(), 'verbtn');
  await js('window.__antilego.setVersion("kjv");');
  await until('window.__antilego.state.data');
  await js('window.__antilego.setVersion("esv");');
  await until('document.getElementById("ver-fallback")');
  ok('no automatic fallback', await js('return window.__antilego.state.ver;'), 'esv');
  ok('last static fallback', await js('return document.getElementById("ver-fallback").textContent;'), 'KJV로 보기');
  ok('no_key message unchanged', await js('return document.querySelector("#verses .msg").textContent;'), 'ESV API 키가 아직 설정되지 않았습니다');
  await clickSel(cdp, '#ver-fallback');
  await until('window.__antilego.state.data');
  ok('fallback returns to KJV', await js('return window.__antilego.state.ver;'), 'kjv');
  ok('fallback keeps keyboard focus', await active(), 'verbtn');
  await js('window.__antilego.setVersion("esv");');
  await until('document.getElementById("ver-fallback")');
  response = { body: { ok: true, verses: [{ v: 1, text: 'Fixture only.' }], notice: 'Fixture notice' } };
  const beforeRetry = requests;
  await js('window.__antilego.setVersion("esv");');
  await until('window.__antilego.state.data?.verses[0].text === "Fixture only."');
  ok('selecting current ESV retries', requests, beforeRetry + 1);
  ok('success clears stale tag', await js('return document.querySelector("[data-id=esv] .ver-tag").textContent;'), '온라인');
  ok('ESV text not stored', await js('return Object.values(localStorage).some(v => v.includes("Fixture only."));'), false);
  // 늦은 no_key 응답은 정적 역본과 메뉴에 영향을 주지 않는다.
  await js(`const realFetch = window.fetch;
    window.fetch = (url, opts) => String(url).includes('/api/esv')
      ? new Promise(resolve => window.finishOldESV = () => resolve(new Response(JSON.stringify({ok:false,error:'no_key'}),{status:503})))
      : realFetch(url, opts);
    window.__antilego.reloadChapter();`);
  await until('window.finishOldESV');
  await js('window.__antilego.setVersion("kjv"); window.finishOldESV();');
  await until('window.__antilego.state.data');
  ok('late error cannot switch version', await js('return window.__antilego.state.ver;'), 'kjv');
  ok('late error cannot restore stale tag', await js('return document.querySelector("[data-id=esv] .ver-tag").textContent;'), '온라인');
  ok('late error cannot replace static text', await js('return !!document.getElementById("ver-fallback");'), false);
  ok('mobile no horizontal overflow', await js('return document.documentElement.scrollWidth;'), 360);
  ok('console.error / exceptions / unexpected logs', errors, []);
  console.log(JSON.stringify({ assertions, failures, consoleErrors: errors.length }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} finally { cdp.close(); }
