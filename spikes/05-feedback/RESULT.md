# Spike 05-a — 피드백 API · 결과

2026-09-21 · Fable (Claude Code). 돌리는 법은 [README.md](README.md),
코드·배포는 [`api/README.md`](../../api/README.md).

**판정: 된다.** 배포만 남았다 (`vercel login` + 토큰은 Snow 가 쥐고 있다).
**노션 반영 필요** — `Decisions` 에 "피드백 수집은 Vercel Hobby 함수 한 개 + Notion REST" 한 줄.

---

## 무엇을 만들었나

| 파일 | 무엇 |
|---|---|
| `api/api/feedback.js` | 함수 하나. 의존성 0, 196줄 |
| `api/package.json` | `antilego-api`, `"type": "module"`, `engines.node >= 20` |
| `api/vercel.json` | `regions: ["icn1"]`, `maxDuration: 10` |
| `api/README.md` | 폴더 구조 · 환경변수 · Notion 준비 · 배포 명령 · curl |
| `api/test/notion-mock.mjs` | `fetch` 를 가로채 요청 본문을 검사. 24개 |
| `api/test/local.mjs` | Vercel 없이 `:3300` 에 띄우는 어댑터 (`MOCK_NOTION=1` 지원) |
| `.gitignore` | `.vercel/` 추가 |

`web/` 은 건드리지 않았다.

## 폴더 구조 — `api/api/feedback.js`

Vercel 은 **프로젝트 루트 바로 아래의 `api/` 폴더**를 함수 폴더로 본다. 이 저장소는
루트를 `Antilego/api` 로 잡으므로 함수 파일은 `api/api/feedback.js` 다. 앞의 `api/` 는
저장소 안에서의 프로젝트 루트, 뒤의 `api/` 는 Vercel 이 정한 이름이다. 배포하면
`https://<프로젝트>.vercel.app/api/feedback`.

`regions: ["icn1"]`(서울)은 **Hobby 에서도 된다** — Hobby 는 한 지역까지다.
두 개 이상 적으면 빌드 전에 배포가 실패한다.

## Notion API 버전 — 걸리는 데가 하나 있다

2025-09-03 버전부터 DB 하나가 **데이터 소스 여러 개**를 가질 수 있게 됐고, 페이지를
만들 때 `parent.database_id` 대신 `parent.data_source_id` 를 쓴다. 우리는
`Notion-Version: 2022-06-28` 로 고정하고 `database_id` 를 쓴다.

- **데이터 소스가 하나뿐인 DB 에서는 계속 동작한다.** 옛 버전을 끄겠다는 일정은 아직 없다.
- 📮 Feedback DB 에 **두 번째 데이터 소스가 붙는 순간** 400 이 난다
  (`Databases with multiple data sources are not supported in this API version`).
- 그때 고칠 곳은 두 줄뿐이다 — `NOTION_VERSION` 을 `2025-09-03` 이상으로,
  `parent` 를 `{ type: 'data_source_id', data_source_id: 'ecef24df-41c2-43d1-aecf-76ce0052908d' }` 로.
  properties · children 은 그대로다.

출처: https://developers.notion.com/docs/upgrade-faqs-2025-09-03

`시각` 에 `is_datetime` 같은 필드는 API 에 **없다.** 시간이 붙은 ISO 문자열
(`2026-09-21T03:16:23.996Z`)을 보내면 Notion 이 날짜+시간으로 받는다.

## 결정한 것들

- **시각은 서버가 찍는다.** 클라이언트 `ts` 는 받기만 하고 버린다 — 시계를 못 믿는다.
- **제목 100자 + 본문 전문.** `내용`(title)에 앞 100자, 같은 글 전체를 페이지 본문
  paragraph 블록에 넣는다. 길어도 잃어버리지 않는다.
- **남의 URL 은 버리고 나머지는 저장한다.** 링크 한 칸 때문에 글 전체를 버리는 건 과하다.
- **허용 목록 밖 `Origin` 은 403**, `Origin` 헤더 자체가 없는 요청(curl)은 통과.
- **localhost 는 포트를 안 가린다.** 개발 중 포트가 계속 바뀐다.
- **레이트 리밋은 best-effort.** 인스턴스 메모리 `Map` 이라 인스턴스가 여럿이면 각각
  따로 세고 콜드 스타트에 초기화된다. 실수·단순 스팸만 거른다.

## 검사 1 — `node test/notion-mock.mjs`

네트워크를 쓰지 않는다. Notion 으로 나가는 `fetch` 를 가로채 **보내려던 본문**을 검사한다.

```
── 정상 경로 ──
  ok   200 {ok:true} 를 돌려주고 Notion 을 한 번 부른다
  ok   요청 본문 모양 — title · rich_text · url · select · date · children
  ok   시각은 서버가 찍는다 — 클라이언트 ts 는 무시
  ok   제목은 100자, 본문 블록에는 전문
  ok   이름 없으면 익명

── 검증 실패 ──
  ok   빈 내용 → 400
  ok   2001자 → 400
  ok   2000자 → 통과
  ok   41자 이름 → 400
  ok   남의 URL 은 버리고 나머지는 저장한다
  ok   localhost URL 은 남긴다
  ok   모르는 기기 → 모름
  ok   긴 위치는 120자로 자른다
  ok   JSON 이 아니면 400

── 허니팟 ──
  ok   hp 가 채워져 있으면 200 이지만 아무것도 안 쓴다

── 레이트 리밋 ──
  ok   1분에 6번째 → 429
  ok   IP 가 다르면 따로 센다

── CORS · 메서드 ──
  ok   OPTIONS 프리플라이트 → 204 + 허용 헤더
  ok   localhost 는 포트를 가리지 않는다
  ok   허용 목록 밖 출처 → CORS 헤더 없음 + 403
  ok   Origin 없는 요청(curl)은 통과
  ok   GET → 405 + Allow

── 실패 처리 ──
[feedback] notion 400 {"code":"validation_error"}
  ok   Notion 이 400 이면 502, 토큰은 새지 않는다
[feedback] NOTION_TOKEN 이 설정되지 않았습니다
  ok   NOTION_TOKEN 이 없으면 500

24 통과, 0 실패
```

로그 두 줄은 일부러 찍은 것이다 — 실패 경로가 **토큰 없이** 기록되는지 같이 본다.

## 검사 2 — 진짜 HTTP (`MOCK_NOTION=1 node test/local.mjs`)

`:3300` 에 띄우고 curl 로 때렸다.

```
### 1. OPTIONS 프리플라이트
HTTP/1.1 204 No Content
Vary: Origin
Access-Control-Allow-Origin: https://sunoeul.github.io
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400

### 2. 정상 제출
HTTP/1.1 200 OK
Vary: Origin
Access-Control-Allow-Origin: https://sunoeul.github.io
Content-Type: application/json; charset=utf-8
{"ok":true}

### 3. 빈 내용
HTTP/1.1 400 Bad Request
{"ok":false,"error":"내용을 적어 주세요."}

### 4. 2001자
{"ok":false,"error":"내용이 너무 깁니다 (2000자까지)."} [400]

### 5. 남의 URL (버려지고 나머지는 저장)
{"ok":true} [200]

### 6. 허니팟
{"ok":true} [200]

### 7. GET
{"ok":false,"error":"POST 만 받습니다."} [405]

### 8. 허용 안 된 출처
{"ok":false,"error":"허용되지 않은 출처입니다."} [403]
```

### 2번이 Notion 으로 보내려던 본문

```json
{
  "parent": { "database_id": "8a563b39-003e-4616-89f4-fb2144f90e4f" },
  "properties": {
    "내용":   { "title": [{ "text": { "content": "사사기 9장 지도에서 세겜 점이 안 보입니다." } }] },
    "작성자": { "rich_text": [{ "text": { "content": "눈" } }] },
    "시각":   { "date": { "start": "2026-09-21T03:16:23.996Z" } },
    "기기":   { "select": { "name": "폰" } },
    "상태":   { "select": { "name": "새로 옴" } },
    "위치":   { "rich_text": [{ "text": { "content": "사사기 9:1" } }] },
    "링크":   { "url": "https://sunoeul.github.io/antilego/#Judg.9" }
  },
  "children": [{
    "object": "block", "type": "paragraph",
    "paragraph": { "rich_text": [{ "type": "text",
      "text": { "content": "사사기 9장 지도에서 세겜 점이 안 보입니다." } }] }
  }]
}
```

5번(남의 URL)에서는 `링크` 가 아예 빠지고 `작성자` 는 `익명`, `기기` 는 `모름` 으로 갔다.
`종류` · `반영` · `메모` 는 어느 경우에도 보내지 않는다.

### 레이트 리밋 (같은 IP 연속 7번)

```
### 9. 같은 IP 로 연속 7번
  1번째 → {"ok":true} [200]
  2번째 → {"ok":true} [200]
  3번째 → {"ok":true} [200]
  4번째 → {"ok":true} [200]
  5번째 → {"ok":true} [200]
  6번째 → {"ok":false,"error":"잠시만요 — 1분에 5개까지 보낼 수 있습니다."} [429]
  7번째 → {"ok":false,"error":"잠시만요 — 1분에 5개까지 보낼 수 있습니다."} [429]

### 10. 429 의 Retry-After
HTTP/1.1 429 Too Many Requests
Retry-After: 60

(서버가 Notion 을 부른 횟수: 5)
```

429 가 난 두 번은 Notion 을 부르지 않았다 — 막히는 지점이 우리 쪽이다.

## 아직 안 한 것

- **실제 Notion 에 쓰기.** 토큰이 없어서 못 했다. 배포 뒤 curl 한 번이 남았다.
- **Vercel 배포.** `vercel login` 은 Snow 가 한다.
- **하루 30개 제한**은 코드에는 있지만 시간이 걸려서 실제로는 안 돌려 봤다
  (1분 제한과 같은 함수·같은 자료구조다).
- **`web/` 의 버튼** — 05-b.

## 다음 사람이 칠 명령

```bash
cd /Users/snow/Workspace/Antilego
vercel link --cwd api                              # 프로젝트 이름: antilego-api
vercel env add NOTION_TOKEN production --cwd api   # ntn_… 붙여넣기
vercel --prod --cwd api
```

그 전에 Notion 에서 **📮 Feedback DB → `⋯` → 연결 → 통합 추가**. 이걸 빼면 `object_not_found` 다.
