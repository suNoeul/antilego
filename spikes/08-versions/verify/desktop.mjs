// 08-b 데스크톱 — 역본 메뉴 · 정적 영문 역본(KJV) · 기억 · `?ver=` · 회귀.
// 픽스처(`?data=data-fixture`)로 돈다: krv/ kjv/ bsb/ 세 정적 역본 + esv(온라인).
import { connect, evalJs, clickSel, key, shot, metrics, goTo, sleep } from './cdp.mjs';

const SHOTS = new URL('../shots', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8765/?data=data-fixture';
const out = [];
const errs = [];
const net = [];   // 픽스처에 없는 파일(시대 3종)의 404 는 따로 센다
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

await metrics(cdp, { width: 1400, height: 900, mobile: false });
await goTo(cdp, BASE);
await evalJs(cdp, `localStorage.clear(); localStorage.setItem('theme','light');`);
await goTo(cdp, BASE + '#Josh.10');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1200);

const snap = () => evalJs(cdp, `return {
  hash: location.hash,
  ver: window.__antilego.state.ver,
  saved: localStorage.getItem('ver'),
  btnHidden: document.getElementById('verbtn').hidden,
  btnText: document.getElementById('verbtn-text').textContent,
  menuOpen: !document.getElementById('vermenu').hidden,
  expanded: document.getElementById('verbtn').getAttribute('aria-expanded'),
  items: [...document.querySelectorAll('.veritem')].map(b => ({
    id: b.dataset.id,
    name: b.querySelector('.ver-name').textContent,
    short: b.querySelector('.ver-short')?.textContent ?? null,
    tag: b.querySelector('.ver-tag')?.textContent ?? null,
    checked: b.getAttribute('aria-checked'),
  })),
  lang: document.getElementById('verses').classList.contains('lang-en'),
  font: getComputedStyle(document.getElementById('verses')).fontFamily.split(',')[0].replace(/"/g,''),
  lh: getComputedStyle(document.getElementById('verses')).lineHeight,
  v1: document.querySelector('.verse[data-v="1"]')?.textContent.slice(1, 40) ?? null,
  nplaces: document.querySelectorAll('.place').length,
  place1: [...document.querySelectorAll('.verse[data-v="1"] .place')].map(b => b.textContent),
  title: document.getElementById('title').textContent,
  attrVer: document.getElementById('attr-ver').hidden ? null : document.getElementById('attr-ver').textContent,
  panelAttr: document.getElementById('panel-attr').textContent,
};`);

let s = await snap();
// --- 1. 처음 상태 ---
ok('처음: 역본 = 기본값 krv', s.ver, 'krv');
ok('처음: 버튼이 보인다', s.btnHidden, false);
ok('처음: 버튼 글자', s.btnText, '개역한글');
ok('처음: 메뉴 닫힘', s.menuOpen, false);
ok('처음: 본문은 한글 (lang-en 없음)', s.lang, false);
ok('처음: 개역한글 본문', s.v1.startsWith('여호수아가 아이를'), true);
ok('처음: 역본 출처 줄은 숨어 있다 (출처 목록과 같은 문장)', s.attrVer, null);

// --- 2. 메뉴 ---
await clickSel(cdp, '#verbtn');
s = await snap();
ok('메뉴 열림', s.menuOpen, true);
ok('메뉴: aria-expanded', s.expanded, 'true');
ok('메뉴: 네 역본', s.items.map(i => i.id), ['krv', 'kjv', 'bsb', 'esv']);
ok('메뉴: 이름', s.items.map(i => i.name), ['개역한글', 'King James Version', 'Berean Standard Bible', 'English Standard Version']);
ok('메뉴: short (이름과 같으면 생략)', s.items.map(i => i.short), [null, 'KJV', 'BSB', 'ESV']);
ok('메뉴: 온라인 꼬리표는 esv 에만', s.items.map(i => i.tag), [null, null, null, '온라인']);
ok('메뉴: 지금 역본에 체크', s.items.map(i => i.checked), ['true', 'false', 'false', 'false']);
await shot(cdp, `${SHOTS}/b-desktop-menu.png`);

// --- 3. KJV 로 바꾼다 ---
await clickSel(cdp, '.veritem[data-id="kjv"]');
await sleep(600);
s = await snap();
ok('KJV: 메뉴 닫힘', s.menuOpen, false);
ok('KJV: 버튼 글자', s.btnText, 'KJV');
ok('KJV: state', s.ver, 'kjv');
ok('KJV: localStorage 에 기억', s.saved, 'kjv');
ok('KJV: 해시는 그대로 (역본은 주소에 없다)', s.hash, '#Josh.10');
ok('KJV: 제목은 한국어 그대로', s.title, '여호수아 10장');
ok('KJV: 영문 본문', s.v1.startsWith('Now it came to pass'), true);
ok('KJV: lang-en 클래스', s.lang, true);
ok('KJV: 한글 세리프가 아니다', s.font !== 'Noto Serif KR', true);
ok('KJV: line-height 1.7 (17px × 1.7)', s.lh, '28.9px');
ok('KJV: 1절 지명 버튼 셋', s.place1, ['Jerusalem', 'Jericho', 'Gibeon']);
ok('KJV: 장 전체 지명 버튼 수', s.nplaces, 5);
ok('KJV: 출처 줄', s.attrVer, '본문: King James Version (public domain)');
ok('KJV: 패널 출처에 역본 이름', s.panelAttr.startsWith('King James Version · '), true);
await shot(cdp, `${SHOTS}/b-desktop-kjv.png`);

// 지명 버튼은 예전과 같이 눌리고 패널이 열린다
const fetched = () => evalJs(cdp, `return window.performance.getEntriesByType('resource')
  .filter(e => e.name.includes('/books/')).map(e => e.name.split('/data-fixture/')[1]);`);
ok('KJV: kjv/books 에서 받아왔다',
  (await fetched()).includes('kjv/books/Josh/10.json?v=__V__'), true);

await clickSel(cdp, '.verse[data-v="1"] .place', 1);     // Jericho
await sleep(500);
ok('KJV: 지명 클릭 → 패널 열림', await evalJs(cdp, `return document.getElementById('btn-map').getAttribute('aria-expanded');`), 'true');
ok('KJV: 카드 이름은 한국어', await evalJs(cdp, `return document.querySelector('.card-name').textContent;`), '여리고');
ok('KJV: 카드 영문', await evalJs(cdp, `return document.querySelector('.card-en').textContent;`), 'Jericho 1');
ok('KJV: 해시에 지명', (await snap()).hash, '#Josh.10/a231f80');
await shot(cdp, `${SHOTS}/b-desktop-kjv-panel.png`);
await clickSel(cdp, '#btn-map');
await sleep(300);

// --- 4. 새로고침해도 기억한다 ---
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1300);
s = await snap();
ok('새로고침: KJV 그대로', s.ver, 'kjv');
ok('새로고침: 버튼 글자', s.btnText, 'KJV');
ok('새로고침: 영문 본문', s.v1.startsWith('Now it came to pass'), true);

// --- 5. `?ver=bsb` 한 번으로 바꾼다 ---
await goTo(cdp, BASE + '&ver=bsb#Josh.10');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1300);
s = await snap();
ok('?ver=bsb: 역본', s.ver, 'bsb');
ok('?ver=bsb: 버튼 글자', s.btnText, 'BSB');
ok('?ver=bsb: 저장까지 된다', s.saved, 'bsb');
ok('?ver=bsb: 영문 글꼴', s.lang, true);
ok('?ver=bsb: 출처 줄', s.attrVer, '본문: Berean Standard Bible (public domain, CC0)');

// 쿼리를 떼도 저장된 값이 남는다
await goTo(cdp, BASE + '#Josh.10');
await cdp.send('Page.reload', { ignoreCache: true });
await sleep(1300);
ok('쿼리를 떼도 BSB', (await snap()).ver, 'bsb');

// --- 6. 개역한글로 되돌리기 ---
await clickSel(cdp, '#verbtn');
await clickSel(cdp, '.veritem[data-id="krv"]');
await sleep(600);
s = await snap();
ok('되돌리기: krv', s.ver, 'krv');
ok('되돌리기: 한글 본문', s.v1.startsWith('여호수아가 아이를'), true);
ok('되돌리기: lang-en 없음', s.lang, false);
ok('되돌리기: 출처 줄 다시 숨음', s.attrVer, null);

// --- 7. 키보드 ---
await clickSel(cdp, '#verbtn');
ok('키보드: 열리면 지금 역본에 포커스', await evalJs(cdp, `return document.activeElement.dataset.id;`), 'krv');
await key(cdp, 'ArrowDown');
ok('키보드: ↓ 다음 역본', await evalJs(cdp, `return document.activeElement.dataset.id;`), 'kjv');
await key(cdp, 'Escape');
s = await snap();
ok('키보드: Esc 로 닫힘', s.menuOpen, false);
ok('키보드: Esc 는 역본을 바꾸지 않는다', s.ver, 'krv');
ok('키보드: Esc 뒤 포커스는 버튼', await evalJs(cdp, `return document.activeElement.id;`), 'verbtn');

// 바깥 클릭으로 닫힘
await clickSel(cdp, '#verbtn');
await clickSel(cdp, '#title');
ok('바깥 클릭으로 닫힘', (await snap()).menuOpen, false);

// --- 8. 회귀 (피커 · ‹ › · 지도 · 피드백) ---
await clickSel(cdp, '#loc');
await sleep(300);
ok('회귀: 피커 열림', await evalJs(cdp, `return !document.getElementById('picker').hidden;`), true);
ok('회귀: 절 열 (픽스처 여호수아 10장 = 11절)', await evalJs(cdp, `return document.querySelectorAll('#col-v .num').length;`), 11);
await key(cdp, 'Escape');
await sleep(200);

await clickSel(cdp, '#btn-map');
await sleep(500);
ok('회귀: 지도 패널', await evalJs(cdp, `return document.querySelectorAll('#map *').length > 5;`), true);
await clickSel(cdp, '#btn-fb');
await sleep(400);
ok('회귀: 피드백 카드', await evalJs(cdp, `return !document.getElementById('fb-card').hidden;`), true);
ok('회귀: 피드백 위치 줄', await evalJs(cdp, `return document.getElementById('fb-loc-t').textContent;`), '여호수아 10장 1절');
await clickSel(cdp, '#fb-cancel');
await sleep(300);
await clickSel(cdp, '#btn-map');
await sleep(300);

// --- 9. 다크 ---
await clickSel(cdp, '#verbtn');
await evalJs(cdp, `document.documentElement.dataset.theme='dark';`);
await sleep(250);
await shot(cdp, `${SHOTS}/b-desktop-dark-menu.png`);
await evalJs(cdp, `document.documentElement.dataset.theme='light';`);
await key(cdp, 'Escape');

// 픽스처에는 시대 3종이 없고, 해시 없이 처음 들어가면 창세기 1장을 찾는다(픽스처엔 없다).
// 그 404 말고 다른 네트워크 오류가 있으면 실패다.
ok('네트워크 오류는 픽스처에 없는 파일뿐',
  [...new Set(net.filter(t => !/eras\.json|chapter_eras\.json|era_regions\.json|books\/Gen\/1\.json/.test(t)))], []);

out.push('');
out.push(`픽스처 시대 파일 404: ${net.length}`);
out.push(`console.error / exception / error log: ${errs.length}`);
for (const e of errs) out.push('  ' + e);
out.push(`FAILS: ${fails}`);
console.log(out.join('\n'));
cdp.close();
process.exit(0);
