// ESV 본문 프록시 — 정적 사이트가 못 가지는 비밀(API 키)을 서버에 두고 한 장씩 받아 준다.
// 외부 의존성 없음 (Node 20+ 전역 fetch).
//
// 라이선스 (https://api.esv.org — 무료 키, 비상업):
//   - 로컬에 **500절 넘게 저장하지 않는다.** 그래서 이 함수는 마지막 3장만 60초 동안
//     인스턴스 메모리에 두고, 브라우저에는 `Cache-Control: private, no-store` 를 준다.
//     web/ 쪽도 지금 보고 있는 한 장만 메모리에 두고 localStorage·IndexedDB 에 넣지 않는다.
//   - 하루 5,000 요청. 한 요청이 한 장이다.
//   - 고지문(`notice`)을 응답에 함께 실어 보낸다 — 화면에 그대로 띄우기 위해서다.

const ESV_API = 'https://api.esv.org/v3/passage/text/';

export const NOTICE =
  'Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), '
  + 'copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. '
  + 'Used by permission. All rights reserved.';

// ── OSIS id → ESV 질의 이름 · 장 수 ─────────────────────────────────────────
// 웹 쪽 `index.json` 의 66권 id 와 같은 표다. ESV API 는 "Joshua 10" 처럼 사람이 쓰는
// 이름을 받으므로 여기서 한 번 옮긴다. 장 수는 `Josh.99` 같은 요청을 upstream 까지
// 보내지 않고 여기서 400 으로 끊기 위한 것이다.
export const BOOKS = {
  Gen: ['Genesis', 50], Exod: ['Exodus', 40], Lev: ['Leviticus', 27], Num: ['Numbers', 36],
  Deut: ['Deuteronomy', 34], Josh: ['Joshua', 24], Judg: ['Judges', 21], Ruth: ['Ruth', 4],
  '1Sam': ['1 Samuel', 31], '2Sam': ['2 Samuel', 24], '1Kgs': ['1 Kings', 22],
  '2Kgs': ['2 Kings', 25], '1Chr': ['1 Chronicles', 29], '2Chr': ['2 Chronicles', 36],
  Ezra: ['Ezra', 10], Neh: ['Nehemiah', 13], Esth: ['Esther', 10], Job: ['Job', 42],
  Ps: ['Psalm', 150], Prov: ['Proverbs', 31], Eccl: ['Ecclesiastes', 12],
  Song: ['Song of Solomon', 8], Isa: ['Isaiah', 66], Jer: ['Jeremiah', 52],
  Lam: ['Lamentations', 5], Ezek: ['Ezekiel', 48], Dan: ['Daniel', 12], Hos: ['Hosea', 14],
  Joel: ['Joel', 3], Amos: ['Amos', 9], Obad: ['Obadiah', 1], Jonah: ['Jonah', 4],
  Mic: ['Micah', 7], Nah: ['Nahum', 3], Hab: ['Habakkuk', 3], Zeph: ['Zephaniah', 3],
  Hag: ['Haggai', 2], Zech: ['Zechariah', 14], Mal: ['Malachi', 4],
  Matt: ['Matthew', 28], Mark: ['Mark', 16], Luke: ['Luke', 24], John: ['John', 21],
  Acts: ['Acts', 28], Rom: ['Romans', 16], '1Cor': ['1 Corinthians', 16],
  '2Cor': ['2 Corinthians', 13], Gal: ['Galatians', 6], Eph: ['Ephesians', 6],
  Phil: ['Philippians', 4], Col: ['Colossians', 4], '1Thess': ['1 Thessalonians', 5],
  '2Thess': ['2 Thessalonians', 3], '1Tim': ['1 Timothy', 6], '2Tim': ['2 Timothy', 4],
  Titus: ['Titus', 3], Phlm: ['Philemon', 1], Heb: ['Hebrews', 13], Jas: ['James', 5],
  '1Pet': ['1 Peter', 5], '2Pet': ['2 Peter', 3], '1John': ['1 John', 5],
  '2John': ['2 John', 1], '3John': ['3 John', 1], Jude: ['Jude', 1], Rev: ['Revelation', 22],
};

const REF_RE = /^([1-3]?[A-Za-z]+)\.(\d{1,3})$/;

// `Josh.10` → { book:'Josh', ch:10, q:'Joshua 10' }. 형식·권·장 범위를 모두 본다.
export function parseRef(raw) {
  if (typeof raw !== 'string') return null;
  const m = REF_RE.exec(raw.trim());
  if (!m) return null;
  const rec = BOOKS[m[1]];
  if (!rec) return null;
  const ch = Number(m[2]);
  if (!Number.isInteger(ch) || ch < 1 || ch > rec[1]) return null;
  return { book: m[1], ch, q: `${rec[0]} ${ch}` };
}

// ── 본문 파싱 ────────────────────────────────────────────────────────────────
// ESV 평문은 `[1] 첫 절 [2] 둘째 절 …` 로 온다 (verse-numbers 켜짐, 머리글·각주 꺼짐).
// 대괄호 번호를 경계로 잘라 `{v,text}` 로 만든다. 줄바꿈은 공백 하나로 접는다.
export function parseVerses(passage) {
  const s = String(passage || '').replace(/\s+/g, ' ').trim();
  const re = /\[(\d{1,3})\]\s*/g;
  const out = [];
  let m, cur = null;
  while ((m = re.exec(s))) {
    if (cur) out.push({ v: cur.v, text: s.slice(cur.end, m.index).trim() });
    cur = { v: Number(m[1]), end: re.lastIndex };
  }
  if (cur) out.push({ v: cur.v, text: s.slice(cur.end).trim() });
  return out.filter(x => x.text);
}

// ── CORS ────────────────────────────────────────────────────────────────────
// feedback.js 와 같은 허용 목록이다. 함수 둘뿐이라 공유 모듈을 만들기보다 그대로 둔다 —
// 목록을 고칠 때는 두 파일을 같이 고친다.
const ORIGIN_EXACT = new Set([
  'https://sunoeul.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

// ── 레이트 리밋 (best-effort) ────────────────────────────────────────────────
// 인스턴스 메모리라 서버리스에서는 인스턴스마다 따로 센다. 실수·단순 스팸을 거르는 용도.
const MAX_PER_MIN = 60;
const MIN_MS = 60 * 1000;
const hits = new Map();

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length) return String(xff[0]).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimit(ip, now = Date.now()) {
  let e = hits.get(ip);
  if (!e || now - e.start >= MIN_MS) { e = { start: now, count: 0 }; hits.set(ip, e); }
  if (e.count >= MAX_PER_MIN) return false;
  e.count += 1;
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start >= MIN_MS) hits.delete(k);
  return true;
}

// ── 아주 짧은 캐시 ───────────────────────────────────────────────────────────
// 마지막 3장 · 60초. 장 셋이면 보통 100절 안쪽이지만 시편 119편(176절) 같은 장이 겹치면
// 500절을 넘을 수 있다 — 그래서 **담긴 절 수를 직접 세서** 500을 넘지 않게 오래된 것부터 버린다.
const CACHE_MAX = 3;
const CACHE_TTL = 60 * 1000;
const CACHE_VERSES_MAX = 500;
const cache = new Map();   // ref → { at, verses }

function cacheGet(ref, now = Date.now()) {
  const e = cache.get(ref);
  if (!e) return null;
  if (now - e.at >= CACHE_TTL) { cache.delete(ref); return null; }
  return e.verses;
}

function cachePut(ref, verses, now = Date.now()) {
  cache.delete(ref);
  cache.set(ref, { at: now, verses });
  const total = () => [...cache.values()].reduce((a, e) => a + e.verses.length, 0);
  while (cache.size > CACHE_MAX || (cache.size > 1 && total() > CACHE_VERSES_MAX)) {
    cache.delete(cache.keys().next().value);      // 가장 오래된 것부터 버린다
  }
  if (total() > CACHE_VERSES_MAX) cache.clear();  // 한 장만으로 넘치면 아예 두지 않는다
}

export function __reset() { hits.clear(); cache.clear(); }   // 테스트용

// ── 핸들러 ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const origin = allowedOrigin(req.headers.origin);
  setCors(res, origin);
  res.setHeader('Cache-Control', 'private, no-store');

  const send = (code, obj) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return send(405, { ok: false, error: 'GET 만 받습니다.' });
  }
  if (req.headers.origin && !origin) return send(403, { ok: false, error: '허용되지 않은 출처입니다.' });

  const url = new URL(req.url || '/', 'http://x');
  const ref = parseRef(url.searchParams.get('ref'));
  if (!ref) return send(400, { ok: false, error: '장을 알아볼 수 없습니다.' });

  if (!rateLimit(clientIp(req))) {
    res.setHeader('Retry-After', '60');
    return send(429, { ok: false, error: '잠시만요 — 조금 뒤에 다시 시도해 주세요.' });
  }

  const key = `${ref.book}.${ref.ch}`;
  const hit = cacheGet(key);
  if (hit) return send(200, { ok: true, ref: key, verses: hit, notice: NOTICE });

  const token = process.env.ESV_API_KEY;
  if (!token) {
    console.error('[esv] ESV_API_KEY 가 설정되지 않았습니다');
    return send(503, { ok: false, error: 'no_key' });
  }

  const params = new URLSearchParams({
    q: ref.q,
    'include-headings': 'false',
    'include-footnotes': 'false',
    'include-verse-numbers': 'true',
    'include-short-copyright': 'false',
    'include-passage-references': 'false',
    'indent-paragraphs': '0',
    'indent-poetry': 'false',
    'include-first-verse-numbers': 'true',
    'line-breaks': 'false',
  });

  let verses;
  try {
    const r = await fetch(`${ESV_API}?${params}`, {
      headers: { Authorization: `Token ${token}` },
    });
    if (!r.ok) {
      // 상태 코드만 남긴다. upstream 응답 본문은 찍지 않는다 (본문에 본문이 들어 있다).
      console.error('[esv] upstream 실패', r.status);
      return send(502, { ok: false, error: 'ESV 본문을 받지 못했습니다.' });
    }
    const j = await r.json();
    const passages = Array.isArray(j?.passages) ? j.passages : [];
    verses = parseVerses(passages.join(' '));
  } catch {
    // 예외 메시지에 URL·헤더 조각이 섞일 수 있다 → 고정 문구만.
    console.error('[esv] upstream 요청 실패');
    return send(502, { ok: false, error: 'ESV 본문을 받지 못했습니다.' });
  }

  if (!verses.length) {
    console.error('[esv] 절을 하나도 못 뽑았습니다', key);
    return send(502, { ok: false, error: 'ESV 본문을 받지 못했습니다.' });
  }

  cachePut(key, verses);
  return send(200, { ok: true, ref: key, verses, notice: NOTICE });
}
