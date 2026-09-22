// ESV 로 나가는 fetch 를 가로채서 "무엇을 보내려 했고 무엇을 돌려주는지"를 검사한다.
// 네트워크를 쓰지 않는다. 실행: node test/esv-mock.mjs
//
// 진짜 ESV 본문은 이 파일에 넣지 않는다 (라이선스). 파싱을 보려고 쓰는 지문은
// 우리가 지어낸 몇 낱말짜리 가짜다.
import assert from 'node:assert/strict';
import handler, { __reset, BOOKS, parseRef, parseVerses, NOTICE } from '../api/esv.js';

// ── fetch 목 ────────────────────────────────────────────────────────────────
let calls = [];
const FAKE = '[1] Fixture line one. [2] Fixture line two\nwrapped. [3] Fixture line three.';
let nextResponse = () => ({ ok: true, status: 200, json: async () => ({ passages: [FAKE] }) });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return nextResponse();
};

// ── 가짜 req / res ──────────────────────────────────────────────────────────
function mkReq({ method = 'GET', ref = 'Josh.10', query = null, headers = {} } = {}) {
  const qs = query === null ? (ref === null ? '' : `?ref=${encodeURIComponent(ref)}`) : query;
  return {
    method,
    url: '/api/esv' + qs,
    headers: { 'x-forwarded-for': '203.0.113.9', ...headers },
    socket: { remoteAddress: '203.0.113.9' },
  };
}
function mkRes() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(s) { this.body = s || ''; this.done = true; },
  };
}
async function call(opts) {
  const req = mkReq(opts), res = mkRes();
  await handler(req, res);
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch { /* 본문이 없을 수도 있다 */ }
  return { res, json };
}

// ── 러너 ────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
async function t(name, fn) {
  calls = [];
  __reset();
  process.env.ESV_API_KEY = 'test_key';
  nextResponse = () => ({ ok: true, status: 200, json: async () => ({ passages: [FAKE] }) });
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

const ORIGIN = { origin: 'https://sunoeul.github.io' };

console.log('\n── 정상 경로 ──');
await t('200 {ok:true} + verses + notice, ESV 를 한 번 부른다', async () => {
  const { res, json } = await call({ headers: ORIGIN });
  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
  assert.equal(json.ref, 'Josh.10');
  assert.equal(json.notice, NOTICE);
  assert.match(json.notice, /Crossway/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, 'Token test_key');
  assert.ok(calls[0].url.startsWith('https://api.esv.org/v3/passage/text/?'));
});

await t('`[1] … [2] …` 를 절로 가른다 — 대괄호 번호는 본문에 남지 않는다', async () => {
  const { json } = await call({ headers: ORIGIN });
  assert.deepEqual(json.verses, [
    { v: 1, text: 'Fixture line one.' },
    { v: 2, text: 'Fixture line two wrapped.' },   // 줄바꿈은 공백 하나로 접힌다
    { v: 3, text: 'Fixture line three.' },
  ]);
  for (const v of json.verses) assert.ok(!v.text.includes('['), v.text);
});

await t('질의 매개변수 — 머리글·각주 끄고 절 번호 켠다', async () => {
  await call({ headers: ORIGIN });
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('q'), 'Joshua 10');
  assert.equal(u.searchParams.get('include-headings'), 'false');
  assert.equal(u.searchParams.get('include-footnotes'), 'false');
  assert.equal(u.searchParams.get('include-verse-numbers'), 'true');
  assert.equal(u.searchParams.get('include-first-verse-numbers'), 'true');
  assert.equal(u.searchParams.get('include-passage-references'), 'false');
  assert.equal(u.searchParams.get('include-short-copyright'), 'false');
  assert.equal(u.searchParams.get('indent-paragraphs'), '0');
  assert.equal(u.searchParams.get('indent-poetry'), 'false');
  assert.equal(u.searchParams.get('line-breaks'), 'false');
});

await t('공백이 들어간 권은 `+` 로 실려 나간다 (1Sam.3 → 1+Samuel+3)', async () => {
  await call({ ref: '1Sam.3', headers: ORIGIN });
  assert.ok(calls[0].url.includes('q=1+Samuel+3'), calls[0].url);
});

await t('60초 캐시 — 같은 장을 두 번 불러도 upstream 은 한 번', async () => {
  await call({ headers: ORIGIN });
  const { json } = await call({ headers: ORIGIN });
  assert.equal(calls.length, 1);
  assert.equal(json.ok, true);
  assert.equal(json.verses.length, 3);
});

await t('저장하지 말라고 못 박는다 — Cache-Control: private, no-store', async () => {
  const { res } = await call({ headers: ORIGIN });
  assert.equal(res.getHeader('Cache-Control'), 'private, no-store');
});

console.log('\n── 권 이름 표 (66권) ──');
await t('66권이 모두 있고 장 수가 맞는다', async () => {
  assert.equal(Object.keys(BOOKS).length, 66);
  const spot = {
    Gen: ['Genesis', 50], Josh: ['Joshua', 24], '1Sam': ['1 Samuel', 31],
    Ps: ['Psalm', 150], Song: ['Song of Solomon', 8], Phlm: ['Philemon', 1],
    '3John': ['3 John', 1], Rev: ['Revelation', 22], Obad: ['Obadiah', 1],
    '2Chr': ['2 Chronicles', 36], Eccl: ['Ecclesiastes', 12], Jas: ['James', 5],
  };
  for (const [id, want] of Object.entries(spot)) assert.deepEqual(BOOKS[id], want, id);
});

await t('66권 모두 parseRef 로 1장·마지막 장이 통과하고 그 다음 장은 막힌다', async () => {
  for (const [id, [name, n]] of Object.entries(BOOKS)) {
    assert.equal(parseRef(`${id}.1`)?.q, `${name} 1`, id);
    assert.equal(parseRef(`${id}.${n}`)?.q, `${name} ${n}`, id);
    assert.equal(parseRef(`${id}.${n + 1}`), null, id + ' 범위 밖');
    assert.equal(parseRef(`${id}.0`), null, id + ' 0장');
  }
});

await t('66권 이름에 중복이 없다', async () => {
  const names = Object.values(BOOKS).map(x => x[0]);
  assert.equal(new Set(names).size, 66);
});

console.log('\n── 나쁜 요청 ──');
for (const bad of ['Foo.1', 'Josh', 'Josh.', 'Josh.0', 'Josh.25', 'Gen.9999', '../etc', 'Ps.151', '']) {
  await t(`ref=${JSON.stringify(bad)} → 400`, async () => {
    const { res, json } = await call({ ref: bad, headers: ORIGIN });
    assert.equal(res.statusCode, 400);
    assert.equal(json.ok, false);
    assert.equal(calls.length, 0);
  });
}

await t('ref 자체가 없으면 400', async () => {
  const { res } = await call({ ref: null, headers: ORIGIN });
  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 0);
});

await t('POST → 405 + Allow', async () => {
  const { res, json } = await call({ method: 'POST', headers: ORIGIN });
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader('Allow'), 'GET, OPTIONS');
  assert.equal(json.ok, false);
});

console.log('\n── 키 · upstream ──');
await t('키가 없으면 503 {ok:false,error:"no_key"} — upstream 을 부르지 않는다', async () => {
  delete process.env.ESV_API_KEY;
  const { res, json } = await call({ headers: ORIGIN });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(json, { ok: false, error: 'no_key' });
  assert.equal(calls.length, 0);
});

await t('upstream 500 → 502 고정 문구 (상태 코드만 로그)', async () => {
  nextResponse = () => ({ ok: false, status: 500, json: async () => ({ detail: 'secret' }) });
  const { res, json } = await call({ headers: ORIGIN });
  assert.equal(res.statusCode, 502);
  assert.equal(json.ok, false);
  assert.equal(json.error, 'ESV 본문을 받지 못했습니다.');
  assert.ok(!JSON.stringify(json).includes('secret'));
});

await t('upstream 401 → 502 (키가 틀려도 밖으로는 같은 문구)', async () => {
  nextResponse = () => ({ ok: false, status: 401, json: async () => ({}) });
  const { res, json } = await call({ headers: ORIGIN });
  assert.equal(res.statusCode, 502);
  assert.equal(json.error, 'ESV 본문을 받지 못했습니다.');
});

await t('upstream 이 던지면 502', async () => {
  nextResponse = () => { throw new Error('ECONNRESET https://api.esv.org?key=…'); };
  const { res, json } = await call({ headers: ORIGIN });
  assert.equal(res.statusCode, 502);
  assert.ok(!json.error.includes('api.esv.org'));
});

await t('절을 하나도 못 뽑으면 502 — 빈 본문을 200 으로 주지 않는다', async () => {
  nextResponse = () => ({ ok: true, status: 200, json: async () => ({ passages: [''] }) });
  const { res, json } = await call({ headers: ORIGIN });
  assert.equal(res.statusCode, 502);
  assert.equal(json.ok, false);
});

await t('응답 어디에도 키가 섞이지 않는다', async () => {
  const { res } = await call({ headers: ORIGIN });
  assert.ok(!res.body.includes('test_key'));
  assert.ok(!JSON.stringify(res.headers).includes('test_key'));
});

console.log('\n── CORS ──');
await t('허용된 출처는 그대로 돌려준다', async () => {
  const { res } = await call({ headers: ORIGIN });
  assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'https://sunoeul.github.io');
  assert.equal(res.getHeader('Vary'), 'Origin');
});

await t('localhost 는 포트를 가리지 않는다', async () => {
  const { res } = await call({ headers: { origin: 'http://localhost:8765' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader('Access-Control-Allow-Origin'), 'http://localhost:8765');
});

await t('허용 목록 밖 → 403, upstream 을 부르지 않는다', async () => {
  const { res, json } = await call({ headers: { origin: 'https://evil.example' } });
  assert.equal(res.statusCode, 403);
  assert.equal(json.ok, false);
  assert.equal(res.getHeader('Access-Control-Allow-Origin'), undefined);
  assert.equal(calls.length, 0);
});

await t('Origin 없는 요청(curl)은 통과', async () => {
  const { res, json } = await call({});
  assert.equal(res.statusCode, 200);
  assert.equal(json.ok, true);
});

await t('OPTIONS → 204 + GET, OPTIONS', async () => {
  const { res } = await call({ method: 'OPTIONS', headers: ORIGIN });
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader('Access-Control-Allow-Methods'), 'GET, OPTIONS');
  assert.equal(res.getHeader('Access-Control-Max-Age'), '86400');
});

console.log('\n── 레이트 리밋 ──');
await t('1분 60개까지, 61번째는 429 + Retry-After', async () => {
  for (let i = 0; i < 60; i++) {
    const { res } = await call({ ref: `Gen.${(i % 50) + 1}`, headers: ORIGIN });
    assert.equal(res.statusCode, 200, `${i}번째`);
  }
  const { res, json } = await call({ ref: 'Exod.1', headers: ORIGIN });
  assert.equal(res.statusCode, 429);
  assert.equal(res.getHeader('Retry-After'), '60');
  assert.equal(json.ok, false);
});

console.log('\n── 파서 단위 ──');
await t('parseVerses — 첫 절 번호가 붙어 있고, 번호 없는 앞말은 버린다', async () => {
  assert.deepEqual(parseVerses('[1] a [2] b'), [{ v: 1, text: 'a' }, { v: 2, text: 'b' }]);
  assert.deepEqual(parseVerses('junk [1] a'), [{ v: 1, text: 'a' }]);
  assert.deepEqual(parseVerses(''), []);
  assert.deepEqual(parseVerses(null), []);
  assert.deepEqual(parseVerses('[10] ten'), [{ v: 10, text: 'ten' }]);
  assert.deepEqual(parseVerses('[1]   spaced   out  '), [{ v: 1, text: 'spaced out' }]);
});

console.log(`\n합계 ${pass + fail}개 — PASS ${pass} · FAIL ${fail}`);
console.log(`FAILS: ${fail}`);
process.exit(fail ? 1 : 0);
