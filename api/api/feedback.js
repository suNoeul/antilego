// 피드백 수집 함수 — 정적 사이트(GitHub Pages)에서 POST 를 받아 Notion DB 에 한 줄 쓴다.
// 토큰은 서버에만 있다. 외부 의존성 없음 (Node 20+ 전역 fetch).

const NOTION_API = 'https://api.notion.com/v1/pages';
// 2022-06-28 은 "데이터 소스가 하나뿐인 DB" 에서 parent.database_id 를 그대로 받는다.
// DB 에 두 번째 데이터 소스가 생기면 400 이 난다 → NOTION_DATA_SOURCE_ID 를 넣으면
// 2025-09-03 + parent.data_source_id 로 갈아탄다. README 의 "Notion API 버전" 참고.
const NOTION_VERSION = '2022-06-28';
const NOTION_VERSION_DS = '2025-09-03';
const DEFAULT_DB_ID = '8a563b39-003e-4616-89f4-fb2144f90e4f'; // 📮 Feedback

// ── CORS ────────────────────────────────────────────────────────────────────
const ORIGIN_EXACT = new Set([
  'https://sunoeul.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);
// 개발 중에는 포트가 자주 바뀌어서 localhost 는 포트를 가리지 않는다.
const ORIGIN_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function allowedOrigin(origin) {
  if (!origin) return null;
  if (ORIGIN_EXACT.has(origin)) return origin;
  if (ORIGIN_LOCAL.test(origin)) return origin;
  return null;
}

function setCors(res, origin) {
  res.setHeader('Vary', 'Origin');
  if (!origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ── 레이트 리밋 ──────────────────────────────────────────────────────────────
// 인스턴스 메모리. 서버리스라 인스턴스가 여럿이면 각각 따로 센다 → best-effort.
const MAX_PER_MIN = 5;
const MAX_PER_DAY = 30;
const MIN_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const hits = new Map(); // ip → { mStart, mCount, dStart, dCount }

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimit(ip, now = Date.now()) {
  let e = hits.get(ip);
  if (!e) { e = { mStart: now, mCount: 0, dStart: now, dCount: 0 }; hits.set(ip, e); }
  if (now - e.mStart >= MIN_MS) { e.mStart = now; e.mCount = 0; }
  if (now - e.dStart >= DAY_MS) { e.dStart = now; e.dCount = 0; }
  if (e.mCount >= MAX_PER_MIN) return { ok: false, scope: 'min' };
  if (e.dCount >= MAX_PER_DAY) return { ok: false, scope: 'day' };
  e.mCount += 1; e.dCount += 1;
  // 맵이 무한정 커지지 않게 하루 지난 항목은 버린다.
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.dStart >= DAY_MS) hits.delete(k);
  return { ok: true };
}

export function __resetLimits() { hits.clear(); } // 테스트용

// ── 입력 검증 ────────────────────────────────────────────────────────────────
const DEVICES = new Set(['폰', '태블릿', '데스크톱']);
const URL_MAX = 300;
const SITE_ORIGIN = 'https://sunoeul.github.io';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

// 저장할 링크인지 본다. 문자열 prefix 검사는 호스트 경계가 없어서
// `http://localhost.evil.example/` 이나 `http://localhost@evil.example/` 을 통과시킨다.
// 그래서 new URL() 로 파싱해 origin·경로·자격정보를 따로 본다. 아니면 링크만 버린다.
function safeUrl(raw) {
  if (!raw || raw.length > URL_MAX) return '';
  let u;
  try { u = new URL(raw); } catch { return ''; }
  if (u.username || u.password) return '';
  if (u.origin === SITE_ORIGIN && u.pathname.startsWith('/antilego/')) return raw;
  if (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname)) return raw; // 포트는 안 가린다
  return '';
}

function validate(body) {
  const text = str(body?.text);
  if (!text) return { error: '내용을 적어 주세요.' };
  if (text.length > 2000) return { error: '내용이 너무 깁니다 (2000자까지).' };

  let name = str(body?.name);
  if (name.length > 40) return { error: '이름이 너무 깁니다 (40자까지).' };
  if (!name) name = '익명';

  const loc = str(body?.loc).slice(0, 120);
  const url = safeUrl(str(body?.url)); // 남의 주소는 버린다
  const device = DEVICES.has(str(body?.device)) ? str(body.device) : '모름';

  return { value: { text, name, loc, url, device } };
}

// ── Notion 페이지 만들기 ─────────────────────────────────────────────────────
// parent 는 호출부가 정한다 — database_id(구버전) 또는 data_source_id(2025-09-03+).
function notionPayload(v, parent, nowIso) {
  const props = {
    // title 은 100자로 자른다. 전문은 본문 블록에 그대로 남는다.
    '내용': { title: [{ text: { content: v.text.slice(0, 100) } }] },
    '작성자': { rich_text: [{ text: { content: v.name } }] },
    '시각': { date: { start: nowIso } },
    '기기': { select: { name: v.device } },
    '상태': { select: { name: '새로 옴' } },
  };
  if (v.loc) props['위치'] = { rich_text: [{ text: { content: v.loc } }] };
  if (v.url) props['링크'] = { url: v.url };
  // '종류' · '반영' · '메모' 는 비워 둔다 (사람이 채운다).

  return {
    parent,
    properties: props,
    children: [{
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: v.text } }] },
    }],
  };
}

// Notion 이 돌려준 본문에서 code 필드 하나만 뽑는다. 본문 자체는 절대 로그에 넣지 않는다 —
// upstream 응답에 무엇이 들어 있을지 우리가 보장할 수 없다.
const CODE_OK = /^[a-z_]{1,40}$/;
async function notionCode(r) {
  try {
    const j = JSON.parse(await r.text());
    return typeof j?.code === 'string' && CODE_OK.test(j.code) ? j.code : '-';
  } catch { return '-'; }
}

// ── 핸들러 ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const origin = allowedOrigin(req.headers.origin);
  setCors(res, origin);

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const send = (code, obj) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(405, { ok: false, error: 'POST 만 받습니다.' });
  }
  // 브라우저에서 왔는데 허용 목록 밖이면 거절 (curl 등 Origin 없는 요청은 통과).
  if (req.headers.origin && !origin) return send(403, { ok: false, error: '허용되지 않은 출처입니다.' });

  let body;
  try { body = await readJson(req); } catch { return send(400, { ok: false, error: '본문을 읽지 못했습니다.' }); }
  if (body === TOO_LARGE) return send(413, { ok: false, error: '보낸 내용이 너무 큽니다 (16KB까지).' });
  if (body === null) return send(400, { ok: false, error: 'JSON 형식이 아닙니다.' });

  // 허니팟: 사람 눈에 안 보이는 칸이 채워져 있으면 봇이다. 조용히 성공한 척한다.
  if (str(body?.hp)) return send(200, { ok: true });

  const rl = rateLimit(clientIp(req));
  if (!rl.ok) {
    res.setHeader('Retry-After', rl.scope === 'min' ? '60' : '3600');
    return send(429, {
      ok: false,
      error: rl.scope === 'min'
        ? '잠시만요 — 1분에 5개까지 보낼 수 있습니다.'
        : '오늘 보낼 수 있는 만큼 다 보냈습니다. 내일 다시 부탁드립니다.',
    });
  }

  const { value, error } = validate(body);
  if (error) return send(400, { ok: false, error });

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error('[feedback] NOTION_TOKEN 이 설정되지 않았습니다');
    return send(500, { ok: false, error: '서버 설정이 아직 끝나지 않았습니다.' });
  }
  // NOTION_DATA_SOURCE_ID 가 있으면 새 버전으로 간다. 없으면 지금까지 하던 대로.
  const dsId = str(process.env.NOTION_DATA_SOURCE_ID);
  const version = dsId ? NOTION_VERSION_DS : NOTION_VERSION;
  const parent = dsId
    ? { type: 'data_source_id', data_source_id: dsId }
    : { database_id: process.env.NOTION_DB_ID || DEFAULT_DB_ID };

  try {
    // ts(클라이언트 시각)는 신뢰하지 않는다. 시각은 서버가 찍는다.
    const r = await fetch(NOTION_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notionPayload(value, parent, new Date().toISOString())),
    });
    if (!r.ok) {
      // 상태 코드와 걸러 낸 code 만 남긴다. 응답 본문은 찍지 않는다.
      console.error('[feedback] notion 저장 실패', r.status, await notionCode(r));
      return send(502, { ok: false, error: '저장에 실패했습니다. 잠시 뒤 다시 시도해 주세요.' });
    }
    return send(200, { ok: true });
  } catch {
    // 예외 메시지에 URL·헤더 조각이 섞여 들어올 수 있다 → 고정 문구만.
    console.error('[feedback] notion 요청 실패');
    return send(502, { ok: false, error: '저장에 실패했습니다. 잠시 뒤 다시 시도해 주세요.' });
  }
}

// 요청 본문 총량 상한. 플랫폼 상한에 기대지 않고 여기서 먼저 끊는다.
const MAX_BODY_BYTES = 16 * 1024;
const TOO_LARGE = Symbol('too_large');

// Vercel 은 JSON 본문을 미리 파싱해 req.body 에 넣어 준다. 로컬 테스트 서버는 안 그래서 둘 다 받는다.
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (!req.body) return {};
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) return TOO_LARGE;
    try { return JSON.parse(req.body); } catch { return null; }
  }
  const chunks = [];
  let bytes = 0;
  for await (const c of req) {
    bytes += c.length;
    // 여기서 req.destroy() 를 부르면 소켓이 끊겨 413 응답이 못 나간다. 읽기만 멈춘다.
    if (bytes > MAX_BODY_BYTES) return TOO_LARGE;
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}
