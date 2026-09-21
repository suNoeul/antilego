// 피드백 수집 함수 — 정적 사이트(GitHub Pages)에서 POST 를 받아 Notion DB 에 한 줄 쓴다.
// 토큰은 서버에만 있다. 외부 의존성 없음 (Node 20+ 전역 fetch).

const NOTION_API = 'https://api.notion.com/v1/pages';
// 2022-06-28 은 "데이터 소스가 하나뿐인 DB" 에서 parent.database_id 를 그대로 받는다.
// DB 에 두 번째 데이터 소스가 생기면 400 이 난다 → README 의 "Notion API 버전" 참고.
const NOTION_VERSION = '2022-06-28';
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
const URL_OK = /^(https:\/\/sunoeul\.github\.io\/antilego\/|http:\/\/localhost)/;

function str(v) { return typeof v === 'string' ? v.trim() : ''; }

function validate(body) {
  const text = str(body?.text);
  if (!text) return { error: '내용을 적어 주세요.' };
  if (text.length > 2000) return { error: '내용이 너무 깁니다 (2000자까지).' };

  let name = str(body?.name);
  if (name.length > 40) return { error: '이름이 너무 깁니다 (40자까지).' };
  if (!name) name = '익명';

  const loc = str(body?.loc).slice(0, 120);
  const rawUrl = str(body?.url);
  const url = URL_OK.test(rawUrl) ? rawUrl : ''; // 남의 주소는 버린다
  const device = DEVICES.has(str(body?.device)) ? str(body.device) : '모름';

  return { value: { text, name, loc, url, device } };
}

// ── Notion 페이지 만들기 ─────────────────────────────────────────────────────
function notionPayload(v, dbId, nowIso) {
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
    parent: { database_id: dbId },
    properties: props,
    children: [{
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: v.text } }] },
    }],
  };
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
  const dbId = process.env.NOTION_DB_ID || DEFAULT_DB_ID;

  try {
    // ts(클라이언트 시각)는 신뢰하지 않는다. 시각은 서버가 찍는다.
    const r = await fetch(NOTION_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notionPayload(value, dbId, new Date().toISOString())),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      // 토큰은 절대 찍지 않는다. Notion 이 돌려준 본문에는 토큰이 들어가지 않는다.
      console.error('[feedback] notion', r.status, detail.slice(0, 400));
      return send(502, { ok: false, error: '저장에 실패했습니다. 잠시 뒤 다시 시도해 주세요.' });
    }
    return send(200, { ok: true });
  } catch (e) {
    console.error('[feedback] fetch 실패:', e?.message || e);
    return send(502, { ok: false, error: '저장에 실패했습니다. 잠시 뒤 다시 시도해 주세요.' });
  }
}

// Vercel 은 JSON 본문을 미리 파싱해 req.body 에 넣어 준다. 로컬 테스트 서버는 안 그래서 둘 다 받는다.
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (!req.body) return {};
    try { return JSON.parse(req.body); } catch { return null; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}
