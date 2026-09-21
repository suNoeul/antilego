// Notion 으로 나가는 fetch 를 가로채서 "무엇을 보내려 했는지"를 검사한다. 네트워크를 쓰지 않는다.
// 실행: node test/notion-mock.mjs
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';
import handler, { __resetLimits } from '../api/feedback.js';

process.env.NOTION_TOKEN = 'secret_TEST_TOKEN';
process.env.NOTION_DB_ID = '8a563b39-003e-4616-89f4-fb2144f90e4f';

// ── fetch 목 ────────────────────────────────────────────────────────────────
let calls = [];
let nextResponse = () => ({ ok: true, status: 200, text: async () => '{}' });
globalThis.fetch = async (url, init) => {
  calls.push({ url, init, body: JSON.parse(init.body) });
  return nextResponse();
};

// ── 가짜 req / res ──────────────────────────────────────────────────────────
function mkReq({ method = 'POST', body, headers = {} } = {}) {
  const raw = body === undefined ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const req = Readable.from(raw ? [Buffer.from(raw, 'utf8')] : []);
  req.method = method;
  req.url = '/api/feedback';
  req.headers = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers };
  req.socket = { remoteAddress: '203.0.113.9' };
  return req;
}
function mkRes() {
  const res = {
    statusCode: 200, headers: {}, body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    end(s) { this.body = s || ''; this.done = true; },
  };
  return res;
}
async function call(opts) {
  const req = mkReq(opts), res = mkRes();
  await handler(req, res);
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch {}
  return { res, json };
}

// ── 러너 ────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
async function t(name, fn) {
  calls = []; __resetLimits();
  nextResponse = () => ({ ok: true, status: 200, text: async () => '{}' });
  try { await fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

const ORIGIN = { origin: 'https://sunoeul.github.io' };
const GOOD = {
  name: '눈', text: '사사기 9장 지도에서 세겜 점이 안 보입니다.',
  loc: '사사기 9:1', url: 'https://sunoeul.github.io/antilego/#Judg.9',
  device: '폰', hp: '', ts: 1758400000000,
};

console.log('\n── 정상 경로 ──');
await t('200 {ok:true} 를 돌려주고 Notion 을 한 번 부른다', async () => {
  const { res, json } = await call({ body: GOOD, headers: ORIGIN });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(json, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.notion.com/v1/pages');
  assert.equal(calls[0].init.headers['Notion-Version'], '2022-06-28');
  assert.equal(calls[0].init.headers['Authorization'], 'Bearer secret_TEST_TOKEN');
});

await t('요청 본문 모양 — title · rich_text · url · select · date · children', async () => {
  await call({ body: GOOD, headers: ORIGIN });
  const b = calls[0].body;
  assert.deepEqual(b.parent, { database_id: '8a563b39-003e-4616-89f4-fb2144f90e4f' });
  const p = b.properties;
  assert.equal(p['내용'].title[0].text.content, GOOD.text);
  assert.equal(p['작성자'].rich_text[0].text.content, '눈');
  assert.equal(p['위치'].rich_text[0].text.content, '사사기 9:1');
  assert.equal(p['링크'].url, GOOD.url);
  assert.equal(p['기기'].select.name, '폰');
  assert.equal(p['상태'].select.name, '새로 옴');
  assert.match(p['시각'].date.start, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  assert.equal(p['종류'], undefined);
  assert.equal(b.children[0].type, 'paragraph');
  assert.equal(b.children[0].paragraph.rich_text[0].text.content, GOOD.text);
});

await t('시각은 서버가 찍는다 — 클라이언트 ts 는 무시', async () => {
  await call({ body: { ...GOOD, ts: 0 }, headers: ORIGIN });
  const started = calls[0].body.properties['시각'].date.start;
  assert.ok(Math.abs(Date.parse(started) - Date.now()) < 5000, `서버 시각이 아님: ${started}`);
});

await t('제목은 100자, 본문 블록에는 전문', async () => {
  const long = '가'.repeat(400);
  await call({ body: { ...GOOD, text: long }, headers: ORIGIN });
  const b = calls[0].body;
  assert.equal(b.properties['내용'].title[0].text.content.length, 100);
  assert.equal(b.children[0].paragraph.rich_text[0].text.content.length, 400);
});

await t('이름 없으면 익명', async () => {
  await call({ body: { ...GOOD, name: '' }, headers: ORIGIN });
  assert.equal(calls[0].body.properties['작성자'].rich_text[0].text.content, '익명');
});

console.log('\n── 검증 실패 ──');
await t('빈 내용 → 400', async () => {
  const { res, json } = await call({ body: { ...GOOD, text: '   ' }, headers: ORIGIN });
  assert.equal(res.statusCode, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error, '내용을 적어 주세요.');
  assert.equal(calls.length, 0);
});

await t('2001자 → 400', async () => {
  const { res, json } = await call({ body: { ...GOOD, text: 'ㄱ'.repeat(2001) }, headers: ORIGIN });
  assert.equal(res.statusCode, 400);
  assert.match(json.error, /2000자/);
  assert.equal(calls.length, 0);
});

await t('2000자 → 통과', async () => {
  const { res } = await call({ body: { ...GOOD, text: 'ㄱ'.repeat(2000) }, headers: ORIGIN });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
});

await t('41자 이름 → 400', async () => {
  const { res, json } = await call({ body: { ...GOOD, name: '가'.repeat(41) }, headers: ORIGIN });
  assert.equal(res.statusCode, 400);
  assert.match(json.error, /이름/);
});

await t('남의 URL 은 버리고 나머지는 저장한다', async () => {
  const { res } = await call({ body: { ...GOOD, url: 'https://evil.example/x' }, headers: ORIGIN });
  assert.equal(res.statusCode, 200);
  assert.equal(calls[0].body.properties['링크'], undefined);
});

await t('localhost URL 은 남긴다', async () => {
  await call({ body: { ...GOOD, url: 'http://localhost:8000/#Judg.9' }, headers: ORIGIN });
  assert.equal(calls[0].body.properties['링크'].url, 'http://localhost:8000/#Judg.9');
});

await t('모르는 기기 → 모름', async () => {
  await call({ body: { ...GOOD, device: '시계' }, headers: ORIGIN });
  assert.equal(calls[0].body.properties['기기'].select.name, '모름');
});

await t('긴 위치는 120자로 자른다', async () => {
  await call({ body: { ...GOOD, loc: 'ㅁ'.repeat(300) }, headers: ORIGIN });
  assert.equal(calls[0].body.properties['위치'].rich_text[0].text.content.length, 120);
});

await t('JSON 이 아니면 400', async () => {
  const { res, json } = await call({ body: '{ 망가진', headers: ORIGIN });
  assert.equal(res.statusCode, 400);
  assert.match(json.error, /JSON/);
});

console.log('\n── 허니팟 ──');
await t('hp 가 채워져 있으면 200 이지만 아무것도 안 쓴다', async () => {
  const { res, json } = await call({ body: { ...GOOD, hp: 'http://spam' }, headers: ORIGIN });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(json, { ok: true });
  assert.equal(calls.length, 0);
});

console.log('\n── 레이트 리밋 ──');
await t('1분에 6번째 → 429', async () => {
  const codes = [];
  for (let i = 0; i < 6; i++) {
    const { res } = await call({ body: GOOD, headers: ORIGIN });
    codes.push(res.statusCode);
  }
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal(calls.length, 5, 'Notion 은 5번만 불려야 한다');
  const { res, json } = await call({ body: GOOD, headers: ORIGIN });
  assert.equal(res.statusCode, 429);
  assert.match(json.error, /1분에 5개/);
  assert.equal(res.getHeader('retry-after'), '60');
});

await t('IP 가 다르면 따로 센다', async () => {
  for (let i = 0; i < 5; i++) await call({ body: GOOD, headers: ORIGIN });
  const { res } = await call({ body: GOOD, headers: { ...ORIGIN, 'x-forwarded-for': '198.51.100.7, 10.0.0.1' } });
  assert.equal(res.statusCode, 200);
});

console.log('\n── CORS · 메서드 ──');
await t('OPTIONS 프리플라이트 → 204 + 허용 헤더', async () => {
  const { res } = await call({ method: 'OPTIONS', headers: ORIGIN });
  assert.equal(res.statusCode, 204);
  assert.equal(res.getHeader('access-control-allow-origin'), 'https://sunoeul.github.io');
  assert.equal(res.getHeader('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(res.getHeader('access-control-allow-headers'), 'Content-Type');
  assert.equal(res.getHeader('vary'), 'Origin');
});

await t('localhost 는 포트를 가리지 않는다', async () => {
  for (const o of ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://localhost:5173']) {
    const { res } = await call({ method: 'OPTIONS', headers: { origin: o } });
    assert.equal(res.getHeader('access-control-allow-origin'), o, o);
  }
});

await t('허용 목록 밖 출처 → CORS 헤더 없음 + 403', async () => {
  const { res, json } = await call({ body: GOOD, headers: { origin: 'https://evil.example' } });
  assert.equal(res.getHeader('access-control-allow-origin'), undefined);
  assert.equal(res.statusCode, 403);
  assert.equal(json.ok, false);
  assert.equal(calls.length, 0);
});

await t('Origin 없는 요청(curl)은 통과', async () => {
  const req = mkReq({ body: GOOD }); const res = mkRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
});

await t('GET → 405 + Allow', async () => {
  const { res, json } = await call({ method: 'GET', headers: ORIGIN });
  assert.equal(res.statusCode, 405);
  assert.equal(res.getHeader('allow'), 'POST, OPTIONS');
  assert.match(json.error, /POST/);
});

console.log('\n── 실패 처리 ──');
await t('Notion 이 400 이면 502, 토큰은 새지 않는다', async () => {
  nextResponse = () => ({ ok: false, status: 400, text: async () => '{"code":"validation_error"}' });
  const { res, json } = await call({ body: GOOD, headers: ORIGIN });
  assert.equal(res.statusCode, 502);
  assert.equal(json.ok, false);
  assert.ok(!res.body.includes('secret_'), '응답에 토큰이 들어감');
});

await t('NOTION_TOKEN 이 없으면 500', async () => {
  const keep = process.env.NOTION_TOKEN;
  delete process.env.NOTION_TOKEN;
  const { res, json } = await call({ body: GOOD, headers: ORIGIN });
  process.env.NOTION_TOKEN = keep;
  assert.equal(res.statusCode, 500);
  assert.equal(json.ok, false);
  assert.equal(calls.length, 0);
});

console.log('\n── 저장 URL 검증 (F13) ──');
const LONG_URL = 'https://sunoeul.github.io/antilego/' + 'a'.repeat(365); // 정확히 400자
const DROP_URLS = [
  'http://localhost.evil.example/x',      // 호스트 끝 경계 없음
  'http://localhost@evil.example/',       // 자격정보로 위장
  'http://user:pw@localhost:8000/',       // 자격정보는 localhost 여도 버린다
  'https://sunoeul.github.io/other/',     // 우리 사이트지만 다른 경로
  'https://sunoeul.github.io/antilego',   // /antilego/ 로 시작하지 않는다
  LONG_URL,                               // 400자
  'https://localhost/',                   // 개발 호스트는 http 만
  'javascript:alert(1)',
  '주소 아님',
];
await t('버려야 할 링크는 버리고 나머지 필드는 저장한다', async () => {
  assert.equal(LONG_URL.length, 400);
  for (const u of DROP_URLS) {
    __resetLimits(); calls = [];
    const { res } = await call({ body: { ...GOOD, url: u }, headers: ORIGIN });
    assert.equal(res.statusCode, 200, u);
    assert.equal(calls.length, 1, u);
    assert.equal(calls[0].body.properties['링크'], undefined, `링크가 남았다: ${u}`);
    assert.equal(calls[0].body.properties['내용'].title[0].text.content, GOOD.text, u);
  }
});

const KEEP_URLS = [
  'https://sunoeul.github.io/antilego/',
  'https://sunoeul.github.io/antilego/#Judg.9',
  'https://sunoeul.github.io/antilego/index.html?v=1',
  'http://localhost/',
  'http://localhost:5173/#Judg.9',
  'http://127.0.0.1:8000/antilego/',
];
await t('정상 링크는 그대로 남긴다', async () => {
  for (const u of KEEP_URLS) {
    __resetLimits(); calls = [];
    await call({ body: { ...GOOD, url: u }, headers: ORIGIN });
    assert.equal(calls[0].body.properties['링크'].url, u, u);
  }
});

await t('300자 경계 — 300자는 남고 301자는 버린다', async () => {
  const base = 'https://sunoeul.github.io/antilego/#';
  const at = (n) => base + 'a'.repeat(n - base.length);
  __resetLimits(); calls = [];
  await call({ body: { ...GOOD, url: at(300) }, headers: ORIGIN });
  assert.equal(calls[0].body.properties['링크'].url.length, 300);
  __resetLimits(); calls = [];
  await call({ body: { ...GOOD, url: at(301) }, headers: ORIGIN });
  assert.equal(calls[0].body.properties['링크'], undefined);
});

console.log('\n── 본문 총량 상한 ──');
await t('16KB 를 넘는 요청 → 413, Notion 은 안 부른다', async () => {
  const body = JSON.stringify({ ...GOOD, loc: 'ㅁ'.repeat(20000) });
  assert.ok(Buffer.byteLength(body, 'utf8') > 16 * 1024);
  const { res, json } = await call({ body, headers: ORIGIN });
  assert.equal(res.statusCode, 413);
  assert.equal(json.ok, false);
  assert.match(json.error, /너무 큽니다/);
  assert.equal(calls.length, 0);
});

await t('16KB 안쪽은 통과한다', async () => {
  const body = JSON.stringify({ ...GOOD, text: 'ㄱ'.repeat(2000) }); // ≈6KB
  assert.ok(Buffer.byteLength(body, 'utf8') < 16 * 1024);
  const { res } = await call({ body, headers: ORIGIN });
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
});

await t('req.body 가 미리 문자열로 들어와도 상한이 걸린다', async () => {
  const req = mkReq({ headers: ORIGIN }); const res = mkRes();
  req.body = JSON.stringify({ ...GOOD, loc: 'x'.repeat(20000) });
  await handler(req, res);
  assert.equal(res.statusCode, 413);
  assert.equal(calls.length, 0);
});

console.log('\n── 로그 마스킹 ──');
// console.error 를 가로채서 "무엇이 로그에 남는지" 그대로 본다.
async function captureErr(fn) {
  const keep = console.error; const lines = [];
  console.error = (...a) => lines.push(a.map(String).join(' '));
  try { await fn(); } finally { console.error = keep; }
  return lines.join('\n');
}

await t('Notion 오류 본문은 로그에 남지 않는다 — status + code 만', async () => {
  const leak = '{"object":"error","status":401,"code":"unauthorized",'
    + '"message":"API token is invalid: ntn_FAKE_LEAKED_TOKEN_0123456789"}';
  const out = await captureErr(async () => {
    nextResponse = () => ({ ok: false, status: 401, text: async () => leak });
    const { res } = await call({ body: GOOD, headers: ORIGIN });
    assert.equal(res.statusCode, 502);
  });
  assert.ok(!out.includes('ntn_'), `로그에 토큰이 남았다: ${out}`);
  assert.ok(!out.includes('API token'), `로그에 upstream 메시지가 남았다: ${out}`);
  assert.ok(out.includes('401'), `상태 코드가 없다: ${out}`);
  assert.ok(out.includes('unauthorized'), `code 가 없다: ${out}`);
});

await t('code 가 이상하면 남기지 않는다', async () => {
  const out = await captureErr(async () => {
    nextResponse = () => ({ ok: false, status: 400, text: async () => '{"code":"ntn_FAKE 붙은 값"}' });
    await call({ body: GOOD, headers: ORIGIN });
  });
  assert.ok(!out.includes('ntn_'), out);
  assert.match(out, /\[feedback\] notion 저장 실패 400 -/);
});

await t('fetch 예외 메시지는 로그에 안 남는다', async () => {
  const out = await captureErr(async () => {
    nextResponse = () => { throw new Error('connect ECONNREFUSED — Bearer ntn_FAKE_LEAKED'); };
    const { res } = await call({ body: GOOD, headers: ORIGIN });
    assert.equal(res.statusCode, 502);
  });
  assert.ok(!out.includes('ntn_'), out);
  assert.ok(!out.includes('ECONNREFUSED'), out);
  assert.equal(out.trim(), '[feedback] notion 요청 실패');
});

await t('요청 본문·토큰은 어떤 로그에도 안 나온다 (정상 경로)', async () => {
  const out = await captureErr(async () => { await call({ body: GOOD, headers: ORIGIN }); });
  assert.equal(out, '');
});

console.log('\n── Notion 데이터 소스 전환 준비 ──');
const DS_ID = 'ecef24df-41c2-43d1-aecf-76ce0052908d';
await t('NOTION_DATA_SOURCE_ID 없음 → 2022-06-28 + parent.database_id', async () => {
  assert.equal(process.env.NOTION_DATA_SOURCE_ID, undefined);
  await call({ body: GOOD, headers: ORIGIN });
  assert.equal(calls[0].init.headers['Notion-Version'], '2022-06-28');
  assert.deepEqual(calls[0].body.parent, { database_id: '8a563b39-003e-4616-89f4-fb2144f90e4f' });
});

await t('NOTION_DATA_SOURCE_ID 있음 → 2025-09-03 + parent.data_source_id', async () => {
  process.env.NOTION_DATA_SOURCE_ID = DS_ID;
  try {
    await call({ body: GOOD, headers: ORIGIN });
    assert.equal(calls[0].init.headers['Notion-Version'], '2025-09-03');
    assert.deepEqual(calls[0].body.parent, { type: 'data_source_id', data_source_id: DS_ID });
    // 나머지 payload 는 그대로여야 한다
    const p = calls[0].body.properties;
    assert.equal(p['내용'].title[0].text.content, GOOD.text);
    assert.equal(p['링크'].url, GOOD.url);
    assert.equal(calls[0].body.children[0].paragraph.rich_text[0].text.content, GOOD.text);
  } finally { delete process.env.NOTION_DATA_SOURCE_ID; }
});

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
