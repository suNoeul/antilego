# `api/` — 서버 함수 둘 (피드백 · ESV 본문)

정적 사이트(GitHub Pages)는 비밀을 못 가진다. 그래서 비밀이 필요한 일만 Vercel 함수로 뺀다.

| 함수 | 하는 일 | 비밀 |
|---|---|---|
| `/api/feedback` | "피드백" 버튼의 POST 를 받아 Notion DB 에 한 줄 쓴다 | `NOTION_TOKEN` |
| `/api/esv` | ESV 한 장을 받아 `{v,text}` 로 갈라 돌려준다 (Spike 08-b) | `ESV_API_KEY` |

- 비상업 전용 (AGENTS.md). Vercel **Hobby** 플랜만 쓴다.
- 외부 패키지 없음. Node 20+ 의 전역 `fetch` 만 쓴다.
- 이 디렉토리는 **정적 사이트와 별개의 Vercel 프로젝트**다. `web/` 은 그대로 GitHub Pages 에 있다.

## 폴더 구조

Vercel 은 프로젝트 루트 바로 아래의 `api/` 폴더에 있는 파일을 함수로 만든다.
이 저장소는 루트를 `Antilego/api` 로 잡으므로 함수는 **`api/api/feedback.js`** 에 있다.
배포되면 주소는 `https://<프로젝트>.vercel.app/api/feedback` 이다.

```
api/                     ← Vercel 프로젝트 루트 (vercel --cwd api)
├── package.json         name: antilego-api, "type": "module"
├── vercel.json          regions: ["icn1"], maxDuration 10
├── api/
│   ├── feedback.js      ← /api/feedback
│   └── esv.js           ← /api/esv   (Spike 08-b)
└── test/
    ├── local.mjs        Vercel 없이 :3300 에 띄우는 어댑터 (둘 다 라우팅한다)
    ├── notion-mock.mjs  fetch 를 가로채 요청 본문을 검사 (36개)
    └── esv-mock.mjs     ESV 로 나가는 fetch 를 가로채 검사 (33개)
```

헷갈리기 쉬운 곳: `api/feedback.js` (루트 바로 아래) 가 아니라 `api/api/feedback.js` 다.
앞의 `api/` 는 저장소 안에서의 프로젝트 루트, 뒤의 `api/` 는 Vercel 이 정한 함수 폴더 이름이다.

`regions: ["icn1"]`(서울)은 Hobby 에서도 된다 — Hobby 는 **한 지역**까지 허용한다.
두 개 이상 적으면 빌드 전에 배포가 실패한다.

## 환경변수

| 이름 | 필수 | 설명 |
|---|---|---|
| `NOTION_TOKEN` | 예 | Notion 내부 통합(internal integration)의 토큰 (`ntn_…`). 서버에만 둔다 |
| `NOTION_DB_ID` | 아니오 | 기본값 `8a563b39-003e-4616-89f4-fb2144f90e4f` (📮 Feedback) |
| `NOTION_DATA_SOURCE_ID` | 아니오 | **설정하면** `Notion-Version: 2025-09-03` + `parent.data_source_id` 로 갈아탄다. 비워 두면 지금까지 하던 대로 (아래 "Notion API 버전") |
| `ESV_API_KEY` | `/api/esv` 에만 | ESV API 키. https://api.esv.org 에서 **가입만 하면 무료**로 발급된다 (결제 없음). 없으면 `/api/esv` 가 503 `{"error":"no_key"}` 를 준다 — 피드백 함수는 영향 없다 |

토큰은 응답에도 로그에도 절대 나오지 않는다. 저장 실패 시 로그에 남는 것은 **고정 문구 + HTTP 상태
코드 + Notion 이 준 `code` 필드**뿐이다 — upstream 응답 본문과 예외 메시지는 찍지 않는다.
`code` 도 `[a-z_]` 로만 된 값일 때만 남기고, 아니면 `-` 로 적는다.

## Notion 쪽 준비 (한 번만)

1. https://www.notion.so/profile/integrations → **New integration** → 내부 통합,
   워크스페이스 선택. Capabilities 는 **Insert content** 만 있으면 된다 (읽기 불필요).
2. 토큰(`ntn_…`)을 복사한다.
3. Notion 에서 **📮 Feedback DB 를 열고** → 오른쪽 위 `⋯` → **연결(Connections)** →
   방금 만든 통합을 고른다. **이걸 빼먹으면 `object_not_found` 가 난다.**
4. DB 속성이 아래와 같은지 확인한다 (이름·타입이 정확히 맞아야 한다).

| 속성 | 타입 | 함수가 넣는 값 |
|---|---|---|
| `내용` | title | 본문 앞 100자 |
| `작성자` | rich_text | 이름, 없으면 `익명` |
| `위치` | rich_text | 읽던 자리 (예: `사사기 9:1`) |
| `링크` | url | 보낸 페이지 주소 |
| `시각` | date | **서버**가 찍는 ISO 시각 |
| `기기` | select | 폰 / 태블릿 / 데스크톱 / 모름 |
| `상태` | select | 항상 `새로 옴` |
| `종류` · `반영` · `메모` | select · rich_text · rich_text | 비워 둔다 (사람이 채운다) |

`시각` 의 "시간 포함" 은 보내는 문자열이 정한다 — 함수는 `2026-09-21T03:16:23.996Z` 처럼
시간이 붙은 ISO 를 보내므로 Notion 이 날짜+시간으로 받는다. API 본문에 `is_datetime`
같은 필드는 없다. DB 속성 쪽 "시간 포함" 토글도 켜 두면 표에서 시간이 보인다.

## Notion API 버전 — `database_id` vs `data_source_id`

코드는 `Notion-Version: 2022-06-28` 으로 `parent: { database_id }` 를 쓴다.

Notion 이 2025-09-03 버전에서 **데이터 소스(data source)** 를 도입했다. DB 하나가
데이터 소스 여러 개를 가질 수 있게 되면서, 새 버전에서는 페이지를 만들 때
`parent: { type: "data_source_id", data_source_id: "…" }` 를 쓴다.

- `2022-06-28` 로 고정해 두면 **데이터 소스가 하나뿐인 DB** 에서는 `database_id` 가 계속 동작한다.
  옛 버전을 끄겠다는 일정은 Notion 이 아직 내놓지 않았다.
- 누군가 📮 Feedback DB 에 **두 번째 데이터 소스를 붙이는 순간** 400
  (`Databases with multiple data sources are not supported in this API version`) 이 난다.

### 전환 스위치 — 코드를 안 고친다

**`NOTION_DATA_SOURCE_ID` 환경변수 하나로 갈아탄다.** 코드는 이미 두 모양을 다 만들 줄 안다.

| `NOTION_DATA_SOURCE_ID` | Notion-Version | parent |
|---|---|---|
| 비어 있음 (지금) | `2022-06-28` | `{ database_id: <NOTION_DB_ID 또는 기본값> }` |
| 값이 있음 | `2025-09-03` | `{ type: "data_source_id", data_source_id: <값> }` |

```bash
vercel env add NOTION_DATA_SOURCE_ID production --cwd api   # 값을 붙여넣고 재배포
vercel env rm  NOTION_DATA_SOURCE_ID production --cwd api   # 되돌리기
```

properties · children 은 두 경우가 똑같다. `notion-mock.mjs` 가 양쪽 payload 모양을 모두 검사한다.

넣을 값은 DB 의 `data_sources` 에서 **의도한 소스를 직접 확인**해서 고른다 — DB ID 를 그대로
재사용하거나 첫 번째 소스를 무조건 고르면 안 된다 (리뷰 "Notion API 버전" 항목).
2026-09-21 기준 📮 Feedback DB 의 데이터 소스는 **`ecef24df-41c2-43d1-aecf-76ce0052908d`**
하나이고, 실제 소스 수·권한은 그때 다시 확인한다.

참고: https://developers.notion.com/docs/upgrade-faqs-2025-09-03

## 요청 · 응답 (`/api/feedback`)

`POST /api/feedback`, `Content-Type: application/json`

```json
{ "name": "눈", "text": "…", "loc": "사사기 9:1",
  "url": "https://sunoeul.github.io/antilego/#Judg.9",
  "device": "폰", "hp": "", "ts": 1758400000000 }
```

| 필드 | 규칙 |
|---|---|
| `text` | **필수**, 2000자까지 |
| `name` | 40자까지. 비면 `익명` |
| `loc` | 120자까지 (넘으면 자른다) |
| `url` | `new URL()` 로 파싱해 검사한다. **300자까지.** 저장하는 건 ① origin 이 정확히 `https://sunoeul.github.io` 이고 경로가 `/antilego/` 로 시작하거나 ② 호스트가 정확히 `localhost`·`127.0.0.1` 인 `http://` (포트 무관). 자격정보(`user:pw@`)가 붙으면 버린다. 조건에 안 맞으면 **링크만** 버리고 나머지는 저장한다 |
| `device` | `폰`·`태블릿`·`데스크톱` 중 하나. 아니면 `모름` |
| `hp` | **허니팟.** 사람 눈에 안 보이는 칸. 채워져 있으면 200 을 주고 아무것도 저장하지 않는다 |
| `ts` | 받기만 하고 **무시**한다. 시각은 서버가 찍는다 |

응답은 `{"ok":true}` 또는 `{"ok":false,"error":"한국어 문장"}`.

| 코드 | 언제 |
|---|---|
| 200 | 저장됨 (또는 허니팟에 걸림) |
| 400 | 검증 실패 · JSON 아님 |
| 403 | `Origin` 이 허용 목록 밖 |
| 405 | POST·OPTIONS 아님 |
| 413 | 요청 본문이 16KB 를 넘음 |
| 429 | 레이트 리밋 (`Retry-After` 붙음) |
| 500 | `NOTION_TOKEN` 미설정 |
| 502 | Notion 이 거절했거나 닿지 않음 |

## 입력 총량

요청 본문은 **16KB** 까지 받는다. 스트림을 읽으면서 세다가 넘으면 그 자리에서 끊고 413 을 준다
(플랫폼 상한에 기대지 않는다 — 로컬과 배포가 같게 동작하도록). 그 안쪽에서 `text` 2000자,
`name` 40자, `loc` 120자, `url` 300자가 각각 걸린다.

## CORS

`Access-Control-Allow-Origin` 은 아래에만 그대로 되돌려 준다. 그 밖의 `Origin` 은 403.
`Origin` 헤더가 아예 없는 요청(curl 등)은 통과시킨다.

- `https://sunoeul.github.io`
- `http://localhost:*` · `http://127.0.0.1:*` (개발 중 포트가 바뀌어서 포트는 안 가린다)

프리플라이트(`OPTIONS`)는 204 에 `POST, OPTIONS` / `Content-Type` / `Max-Age: 86400`.

## 레이트 리밋 — best-effort

`/api/feedback` 은 `x-forwarded-for` 첫 값 기준으로 **1분 5개 · 하루 30개** (`/api/esv` 는 1분 60개). 인스턴스 메모리의 `Map` 이라
서버리스에서 인스턴스가 여러 개 뜨면 **각각 따로 센다**. 콜드 스타트에도 초기화된다.
그래서 정확한 방어가 아니라 실수·단순 스팸을 거르는 용도다. 진짜로 막아야 할 일이
생기면 Vercel WAF 의 rate limit 나 외부 KV 로 옮긴다.

CORS 와 허니팟은 **인증이 아니다** — `Origin` 헤더를 안 붙이는 직접 요청(curl 등)은 그대로 통과한다.
엄격한 상한이 필요해지면 공유 원자 카운터나 플랫폼 쪽 방어가 있어야 한다. `x-forwarded-for` 의
신뢰 경계도 배포 환경에서 확인한 뒤에 단정한다 (리뷰 "레이트 리밋" 항목).

## 배포

`vercel login` 은 미리 해 둔다.

```bash
cd /Users/snow/Workspace/Antilego

# 1. 프로젝트 연결 (처음 한 번). 루트를 api/ 로 잡는다
vercel link --cwd api            # 대화형: 프로젝트 이름 antilego-api 권장

# 2. 환경변수 (붙여넣기 프롬프트가 뜬다)
vercel env add NOTION_TOKEN production --cwd api
vercel env add NOTION_TOKEN preview    --cwd api     # 미리보기에서도 쓰려면
vercel env add NOTION_DB_ID production --cwd api     # 기본값을 쓸 거면 생략 가능

# 3. 배포
vercel --cwd api                 # 미리보기
vercel --prod --cwd api          # 운영

# 4. 확인
vercel env ls --cwd api
vercel logs <배포주소> --cwd api
```

`--cwd api` 대신 `cd api && vercel …` 도 똑같다. `.vercel/` 은 `.gitignore` 에 넣는다.

배포된 주소를 `web/` 의 피드백 버튼에 적어 넣는다 (그쪽은 다른 에이전트 담당).

## 확인용 curl

```bash
API=https://<프로젝트>.vercel.app/api/feedback

# 프리플라이트
curl -i -X OPTIONS "$API" \
  -H 'Origin: https://sunoeul.github.io' \
  -H 'Access-Control-Request-Method: POST'

# 제출
curl -i -X POST "$API" \
  -H 'Origin: https://sunoeul.github.io' \
  -H 'Content-Type: application/json' \
  -d '{"name":"눈","text":"사사기 9장 지도에서 세겜 점이 안 보입니다.","loc":"사사기 9:1","url":"https://sunoeul.github.io/antilego/#Judg.9","device":"폰","hp":"","ts":0}'
# → {"ok":true}
```

## 로컬에서 돌려 보기 (Vercel 불필요)

```bash
cd api
node test/notion-mock.mjs          # 36개 검사. 네트워크 안 씀
MOCK_NOTION=1 node test/local.mjs  # :3300. Notion 으로 보낼 본문을 콘솔에 찍는다
NOTION_TOKEN=ntn_… node test/local.mjs   # 진짜 Notion 에 쓴다
```

`MOCK_NOTION=1` 모드는 `web/` 쪽에서 버튼을 붙일 때 쓰면 된다 —
`http://localhost:3300/api/feedback` 로 쏘면 CORS 도 그대로 확인된다.


---

# `/api/esv` — ESV 본문 프록시 (Spike 08-b)

`GET /api/esv?ref=Josh.10` → 그 장의 ESV 본문을 절 단위로 돌려준다.

```json
{ "ok": true, "ref": "Josh.10",
  "verses": [ { "v": 1, "text": "…" }, { "v": 2, "text": "…" } ],
  "notice": "Scripture quotations are from the ESV® Bible … Used by permission. All rights reserved." }
```

| 코드 | 언제 |
|---|---|
| 200 | 받았다 |
| 400 | `ref` 형식이 틀렸거나 없는 권·범위 밖 장 (`Josh.25`, `Ps.151`, `Foo.1`) |
| 403 | `Origin` 이 허용 목록 밖 |
| 405 | GET·OPTIONS 아님 |
| 429 | 레이트 리밋 (IP 기준 **1분 60개**, best-effort, `Retry-After: 60`) |
| 502 | ESV 가 거절했거나 닿지 않았다 (고정 문구. 로그에는 **상태 코드만**) |
| 503 | `{"ok":false,"error":"no_key"}` — 키가 아직 없다 |

`ref` 는 `web/data/index.json` 과 같은 **OSIS id**(`Josh` · `1Sam` · `Ps` · `Phlm` …)와 장 번호다.
함수 안의 66권 표가 이것을 ESV 질의 이름으로 옮긴다 (`Josh`→`Joshua`, `1Sam`→`1 Samuel`,
`Ps`→`Psalm`, `Song`→`Song of Solomon`, `Phlm`→`Philemon`). 같은 표가 장 수도 들고 있어서
범위 밖 장은 **upstream 까지 가지 않고** 400 으로 끊긴다.

## upstream 질의

```
GET https://api.esv.org/v3/passage/text/?q=Joshua+10
    &include-headings=false&include-footnotes=false&include-verse-numbers=true
    &include-short-copyright=false&include-passage-references=false
    &indent-paragraphs=0&indent-poetry=false&include-first-verse-numbers=true&line-breaks=false
Authorization: Token $ESV_API_KEY
```

돌아온 평문은 `[1] … [2] …` 꼴이다. 대괄호 번호를 경계로 잘라 `{v,text}` 로 만들고,
줄바꿈은 공백 하나로 접는다. 절을 하나도 못 뽑으면 200 으로 빈 본문을 주지 않고 502 로 끝낸다.

## 라이선스와 캐시 — 500절 상한

ESV API 는 **가입만 하면 무료**이고 비상업 용도로 쓸 수 있다 (AGENTS.md: 결제·문의 없음).
대신 지켜야 할 선이 둘이다.

- **로컬에 500절 넘게 저장하지 않는다.** 그래서
  - 응답 헤더는 `Cache-Control: private, no-store` — 브라우저·CDN 이 쌓아 두지 못한다.
  - 함수는 **마지막 3장 · 60초**만 인스턴스 메모리에 둔다. 담긴 절 수를 직접 세어
    500을 넘으면 오래된 것부터 버린다 (시편 119편 같은 장이 겹칠 때).
  - `web/` 쪽은 **지금 보고 있는 한 장만** 메모리에 둔다. `localStorage` · IndexedDB 에 넣지 않고,
    역본을 바꾸거나 장을 옮기면 그 자리에서 사라진다.
- **하루 5,000 요청.** 한 요청이 한 장이다. IP 기준 1분 60개 리밋이 그 앞을 한 겹 막는다.

고지문은 응답의 `notice` 로 함께 내려보내고, 화면 아래 출처 줄에 그대로 띄운다.

## 키 받기 (Snow)

1. https://api.esv.org 에서 가입 → API 키 발급 (무료, 결제 정보 없음).
2. `vercel env add ESV_API_KEY production --cwd api` (필요하면 `preview` 도).
3. 재배포. 키가 없는 동안 화면에는 `ESV API 키가 아직 설정되지 않았습니다` 가 뜨고
   `개역한글로 보기` 버튼이 함께 나온다 — 다른 역본은 영향을 받지 않는다.

## 확인용 curl

```bash
API=https://<프로젝트>.vercel.app/api/esv

curl -i "$API?ref=Josh.10" -H 'Origin: https://sunoeul.github.io'
curl -i "$API?ref=Josh.25"            # → 400
curl -i -X OPTIONS "$API" -H 'Origin: https://sunoeul.github.io'   # → 204
```

## 로컬

```bash
cd api
node test/esv-mock.mjs             # 33개 검사. 네트워크 안 씀
MOCK_ESV=1 node test/local.mjs     # :3300. ESV 대신 가짜 지문을 돌려준다 (키 불필요)
ESV_API_KEY=… node test/local.mjs  # 진짜 ESV 에 붙는다
npm test                           # notion-mock + esv-mock
```
