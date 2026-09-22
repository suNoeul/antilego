// Vercel 없이 핸들러를 돌려 보는 작은 서버. Vercel 의 Node 런타임처럼 (req, res) 를 그대로 넘긴다.
//   node test/local.mjs                  → 진짜 Notion·ESV 로 쏜다 (NOTION_TOKEN · ESV_API_KEY 필요)
//   MOCK_NOTION=1 node test/local.mjs    → Notion 호출을 가로채 본문만 찍는다 (토큰 불필요)
//   MOCK_ESV=1 node test/local.mjs       → ESV 호출을 가로채 가짜 지문을 돌려준다 (키 불필요)
// 주소: http://localhost:3300/api/feedback · http://localhost:3300/api/esv?ref=Josh.10
import http from 'node:http';

const PORT = Number(process.env.PORT || 3300);

// 핸들러를 import 하기 **전에** fetch 를 갈아끼운다.
if (process.env.MOCK_NOTION) {
  process.env.NOTION_TOKEN ||= 'mock_token';
  globalThis.fetch = async (url, init) => {
    console.log('\n── Notion 으로 보낼 뻔한 것 ──');
    console.log(url);
    console.log(JSON.stringify(JSON.parse(init.body), null, 2));
    console.log('──\n');
    return { ok: true, status: 200, text: async () => '{"object":"page"}' };
  };
}

// ESV 도 같은 방식으로 가로챈다. 진짜 ESV 본문은 넣지 않는다 — 파싱만 보는 가짜 지문이다.
if (process.env.MOCK_ESV) {
  process.env.ESV_API_KEY ||= 'mock_key';
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.esv.org/')) {
      console.log('\n── ESV 로 보낼 뻔한 것 ──\n' + url + '\n──\n');
      return { ok: true, status: 200, json: async () => ({
        passages: ['[1] Fixture line one about Jerusalem and Jericho. '
          + '[2] Fixture line two about Gibeon. [3] Fixture line three about Jerusalem.'],
      }) };
    }
    return real(url, init);
  };
}

const { default: handler } = await import('../api/feedback.js');
const { default: esvHandler } = await import('../api/esv.js');

const server = http.createServer(async (req, res) => {
  const fn = req.url.startsWith('/api/feedback') ? handler
    : req.url.startsWith('/api/esv') ? esvHandler : null;
  if (!fn) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'not found' }));
  }
  try {
    await fn(req, res);
  } catch (e) {
    console.error('[local] 핸들러가 던졌습니다:', e);
    if (!res.headersSent) res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: 'server error' }));
  }
  console.log(`${req.method} ${req.url} → ${res.statusCode}`);
});

server.listen(PORT, () => {
  console.log(`피드백 함수 로컬: http://localhost:${PORT}/api/feedback${process.env.MOCK_NOTION ? '  (MOCK_NOTION)' : ''}`);
  console.log(`ESV 함수 로컬:    http://localhost:${PORT}/api/esv?ref=Josh.10${process.env.MOCK_ESV ? '  (MOCK_ESV)' : ''}`);
  if (!process.env.NOTION_TOKEN) console.log('NOTION_TOKEN 없음 → 저장 단계는 500 으로 끝납니다 (검증까지는 확인 가능).');
  if (!process.env.ESV_API_KEY) console.log('ESV_API_KEY 없음 → /api/esv 는 503 {error:"no_key"} 로 끝납니다.');
});
