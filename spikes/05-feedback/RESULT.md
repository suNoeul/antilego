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

---

# 05-b · UI — 피드백 버튼

2026-09-21 · Fable (Claude Code). 스펙: [`docs/03-prototype-spec.md`](../../docs/03-prototype-spec.md)
"피드백 (Spike 05-b)". API 쪽은 위 05-a.

**판정: 된다.** `web/` 에 알약 하나와 카드 하나를 붙였고, 05-a 의 라이브 엔드포인트로
**실제 한 건을 보내 `{"ok":true}` 를 받았다**(아래 "성공 경로" — 검증 중에 주인장이 토큰을 꽂았다).
실패 경로(비200 · `ok:false` · 429)는 CDP 로 응답을 갈아 끼워 확인했다.

---

## 무엇을 만들었나

| 파일 | 무엇 |
|---|---|
| `web/index.html` | `.fabs` 묶음(알약 둘) · `#fb-card` · 푸터 안내 한 줄 |
| `web/app.js` | 피드백 모듈 (`FEEDBACK_URL` · `fbLocText` · `fbSend` · `fbCopy` …) 약 190줄 |
| `web/styles.css` | `.fabs` 로 알약 자리 옮김 + `.fb-*` 카드 스타일. **새 색 토큰 없음** |
| `docs/03-prototype-spec.md` | "피드백 (Spike 05-b)" 절 |

`api/` 는 건드리지 않았다.

## 고른 길 — 위치는 **따로 한 줄**

주인장 요청은 "내용 칸에 현재 위치가 기본으로 반투명하게 적혀 있고, 원하면 지우고 처음부터"였다.
두 길이 있었다.

1. **텍스트에어리어 안에 접두사로 박고 반투명하게 보이기** — 뒤에 `<div>` 거울을 깔아 첫 줄만
   50% 로 칠한다.
2. **위치를 그 위의 작은 옅은 줄로 따로 두기** — `위치: 사사기 9장 21절 · 브엘  ×`,
   내용 칸은 빈 채로 placeholder 만.

**2번을 골랐다.** 1번은 사용자가 그 첫 줄을 지우거나 가운데를 고치는 순간 "어디까지가 위치인가"를
계속 다시 재야 하고, 캐럿·IME·되돌리기까지 얽힌다. 게다가 노션으로 가는 `loc` 가 본문과 섞여
나중에 표에서 위치로 거를 수 없게 된다. 2번은 주인장이 말한 것("기본으로 적혀 있다 / 원하면 지운다")을
`×` 하나로 그대로 지키면서 `loc` 를 깨끗하게 남긴다.

## 알약이 둘 — `.fabs` 묶음

`#btn-map` 의 `position: fixed` 를 걷어 **묶음 `.fabs` 이 자리를, `.fab` 이 모양을** 맡게 했다.

| 폭 | 묶음 | 결과 |
|---|---|---|
| ≥900px | `flex-direction: column` · 오른쪽 가장자리 세로 중앙 | `지도` 위(top 409) · `피드백` 아래(top 454) |
| <900px | `row-reverse` · 오른쪽 아래 | `피드백`(left 214) 이 `지도`(left 289) 왼쪽 |

`body.panel-open .fabs { right: var(--panel-w) }` 하나로 **둘이 함께** 패널 가장자리로 옮겨 붙는다
(1400×900 패널 열림에서 둘 다 오른쪽에서 400px). 모바일 시트가 열리면 둘 다 시트 위(bottom 452)로 올라간다.

## 검증 (헤드리스 Chrome, CDP)

`cd web && python3 -m http.server 8051` + `--headless=new --remote-debugging-port=9351`
(Chrome 153.0.8010.52, Node 25.8.1 내장 WebSocket 으로 CDP 직접 호출).
`Emulation.setDeviceMetricsOverride` 로 1400×900 · 360×800(`mobile:true`),
`setEmulatedMedia` 로 라이트/다크 고정. 매 적재 전에 `localStorage.clear()`.
실제 클릭·타이핑은 `Input.*`, 응답 갈아 끼우기는 `Fetch.enable` + `Fetch.fulfillRequest`,
클립보드는 `Browser.grantPermissions(clipboardReadWrite)` 뒤 `navigator.clipboard.readText()`.

### 1. 알약과 카드 (1400×900, `#Judg.9`)

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 알약 글자 | `피드백` | ✅ |
| 기본 `aria-expanded` | `false` | ✅ |
| 알약 자리 | 지도 `{top 409, right 0, 53×37}` · 피드백 `{top 454, right 0, 65×37}` | ✅ |
| 피드백이 지도 **아래** | true | ✅ |
| 카드 기본 닫힘 | `#fb-card.hidden === true` | ✅ |
| 클릭 → 열림 · `aria-expanded` | `hidden false` · `"true"` | ✅ |
| 위치 줄 (스크롤 맨 위) | **`사사기 9장 1절`** | ✅ |
| 내용 칸 | 빈 문자열 + placeholder `읽다가 느낀 점, 이상한 지명, 지도에서 헷갈린 것…` | ✅ |
| 이름 placeholder | `이름 (선택)` | ✅ |
| `maxlength` | 이름 **40** · 내용 **2000** | ✅ |
| 보내기 잠김(빈 내용) | `disabled === true` | ✅ |
| 허니팟 | `1×1` · `tabIndex -1` · `autocomplete="off"` | ✅ |
| 카드 `z-index` / 폭 | **70** / **360px** | ✅ |
| `fbDevice()` | `데스크톱` | ✅ |
| 푸터 줄 | `읽다가 이상하면 오른쪽 '피드백' 버튼을 눌러 주세요.` | ✅ |
| `FEEDBACK_URL` | `https://antilego-api.vercel.app/api/feedback` | ✅ |

`z-index` 실측 — 피커 **60** · 카드 **70** · 알약 **45** · 지도 패널 **40**.

### 2. 위치 줄이 따라온다

21절을 화면 위로 올리고 본문의 `브엘` 을 실제 마우스로 눌렀다.

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 해시 · 패널 | `#Judg.9/a520374`, `panel-open` | ✅ |
| 보이는 첫 절 (`fbVerse()`) | **21** | ✅ |
| 위치 줄 | **`사사기 9장 21절 · 브엘`** | ✅ |
| 패널 열린 채 카드 자리 | `right 484` (= 패널 400 + 84), 폭 360 | ✅ |
| `×` 클릭 | 줄 사라짐, `fb.loc === ""` | ✅ |
| 그대로 보낸 본문 | `{"name":"","text":"위치 뺀 글","loc":"", …}` — **`loc` 가 빈 문자열로 나간다** | ✅ |
| 다시 열면 | `사사기 9장 21절 · 브엘` 로 새로 채워진다 | ✅ |

### 3. 실패 경로 → 복사 폴백

`Fetch.fulfillRequest` 로 `500 {"ok":false,"error":"서버 설정이 아직 끝나지 않았습니다."}` 를 돌려줬다.
(이 문구는 **검증 초반에 라이브 엔드포인트가 실제로 준 것**이다 — 아래 "토큰이 중간에 꽂혔다".)

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 타이핑 → 보내기 열림 | `disabled false` | ✅ |
| 이름이 `localStorage['fbName']` 에 | `"눈"` | ✅ |
| 보낸 본문 | `{"name":"눈","text":"브엘 점이 안 보입니다","loc":"사사기 9장 21절 · 브엘","url":"…#Judg.9/a520374","device":"데스크톱","hp":"","ts":"2026-09-21T03:59:26.612Z"}` | ✅ |
| 실패 문구 | **서버가 준 `error` 를 그대로** 보여준다 | ✅ |
| `복사해서 보내기` 나타남 | `hidden false` | ✅ |
| **글은 그대로** | `브엘 점이 안 보입니다` | ✅ |
| 보내기는 다시 눌린다 (429 아님) | `disabled false` | ✅ |
| `error` 없는 502(JSON 아님) | `보내지 못했습니다.` | ✅ |
| 복사 → 문구 | `복사됨 — 카톡 등으로 보내 주세요` | ✅ |
| 클립보드 실제 내용 | `[Antilego 피드백] 위치: 사사기 9장 21절 · 브엘 / 이름: 눈 / 내용: 브엘 점이 안 보입니다` | ✅ |

### 4. 429

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 문구 | `잠시만요 — 1분에 5개까지 보낼 수 있습니다.` (서버 문구 그대로) | ✅ |
| `보내기` 잠김 | `disabled true`, 남은 시간 **58.9초** | ✅ |
| 내용을 더 쳐도 | 잠김 유지 | ✅ |
| 복사 버튼 | 나타나 있다 | ✅ |

### 5. 성공 경로 — **라이브 엔드포인트에 실제로 보냈다**

`Fetch.disable` 로 가로채기를 끄고 진짜 `https://antilego-api.vercel.app/api/feedback` 로 쐈다.

```
{"name":"눈","text":"[05-b 검증] 피드백 버튼 UI 테스트입니다. 지우셔도 됩니다.",
 "loc":"사사기 9장 21절 · 브엘","url":"http://127.0.0.1:8051/#Judg.9/a520374",
 "device":"데스크톱","hp":"","ts":"2026-09-21T03:59:31.029Z"}
```

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 문구 | `고맙습니다. 잘 받았습니다.` | ✅ |
| 내용만 비워진다 | `""` | ✅ |
| 이름은 남는다 | `눈` | ✅ |
| 2초 뒤 닫힘 | `hidden true` | ✅ |
| `localStorage['fbName']` | `눈` | ✅ |

### 6. 닫는 길 · 자동 성장

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| `Esc` | 닫힘 + 포커스 `btn-fb` | ✅ |
| `취소` | 닫힘 + 포커스 `btn-fb` | ✅ |
| `×` | 닫힘 | ✅ |
| 바깥 클릭(데스크톱) | 닫힘. **포커스는 옮기지 않는다** (누른 자리에 둔다) | ✅ |
| 닫아도 쓰던 글은 남아 있다 | 그대로 | ✅ |
| 내용 칸 자동 성장 | 5줄 **130px** → 15줄 입력 뒤 **287px** 에서 멈춤 (12줄 상한) | ✅ |

### 7. 모바일 360×800

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 알약 자리 | 피드백 `left 214`(right 281) · 지도 `left 289` — **피드백이 왼쪽** | ✅ |
| 지도 시트 열림 뒤 | 피드백 `left 214`, `bottom 452` (시트 위) | ✅ |
| 카드 상자 | `left 0 · width 360 · bottom 0` — 전체 폭 바닥 시트 | ✅ |
| 지도 시트 위 | `elementFromPoint(180, 780)` → **`#fb-card`** | ✅ |
| 피커(60)를 열어도 | 같은 점이 여전히 `#fb-card` | ✅ |
| 가로 스크롤 | `documentElement.scrollWidth` · `body.scrollWidth` 모두 **360** (열림·닫힘·다크 전부) | ✅ |
| `fbDevice()` | `폰` | ✅ |
| 위치 줄 | `사사기 9장 1절` | ✅ |
| 자동 포커스 없음 | `activeElement.id === "btn-fb"` | ✅ |
| `Esc` → 닫힘, 지도 시트는 유지 | ✅ | ✅ |

### 8. `device` 경계

| 폭 | 값 |
|---:|---|
| 599 | `폰` |
| 600 | `태블릿` |
| 1023 | `태블릿` |
| 1024 | `데스크톱` |

### 9. 회귀 (1400×900)

피커(권 66 · 장 21 · 절 57) · `Esc` 로 피커만 닫힘 · 지도 패널 · `#map circle` · 리사이저
`display: block`(≥1200) · 본문 폭 **640** · 알약 둘 다 패널 가장자리(`right 400`) — 전부 그대로.

### 10. `console.error`

**모든 세션에서 `console.error` 0건, uncaught exception 0건.**

실패 경로를 돌린 세션에서는 브라우저가 찍는 **`Log.entryAdded(level: error)` 가 3건** 나온다:

```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
Failed to load resource: the server responded with a status of 502 (Bad Gateway)
Failed to load resource: the server responded with a status of 429 (Too Many Requests)
```

이건 우리 코드가 찍는 게 아니라 **네트워크 계층이 찍는 줄**이다. 비200 을 `fetch` 로 받으면
브라우저가 무조건 남기며 끌 방법이 없다. 모바일·회귀 세션(실패 경로 없음)에서는 **0건**이다.

## 스크린샷 (`shots/`)

| 파일 | 무엇 |
|---|---|
| `desktop-card.png` | 1400×900 `#Judg.9`, 막 연 카드. 위치 줄 `사사기 9장 1절` |
| `desktop-card-fail-copy.png` | 실패(500) — 에러 문구 + `복사해서 보내기`. 지도 패널 열린 채 |
| `desktop-thanks.png` | 라이브 엔드포인트 성공 — `고맙습니다. 잘 받았습니다.` |
| `mobile-card.png` | 360×800 — 지도 시트 **위**에 앉은 바닥 시트, 알약 둘이 시트 위로 |
| `mobile-card-dark.png` | 같은 화면 다크 |
| `live-desktop-card.png` | **배포본** https://sunoeul.github.io/antilego/#Judg.9 |

## 벗어난 점 / 남은 것

- **위치는 텍스트에어리어 안이 아니라 따로 한 줄**이다. 이유는 위 "고른 길".
- **토큰이 검증 중간에 꽂혔다.** 12:51 에는 라이브 엔드포인트가
  `500 {"ok":false,"error":"서버 설정이 아직 끝나지 않았습니다."}` 였는데 12:58 에 `{"ok":true}` 가 됐다.
  그래서 실패 경로는 CDP 로 응답을 갈아 끼워(`Fetch.fulfillRequest`) 확인했고, 성공 경로는
  **진짜 네트워크로** 확인했다. 스펙이 시킨 것보다 좋은 그림이다 — 양쪽을 다 봤다.
- **검증이 노션 DB 에 네 줄을 남겼다.** 지워도 된다:
  `probe` 2건(curl) · `브엘 점이 안 보입니다`(작성자 `눈`) 1건 ·
  `[05-b 검증] 피드백 버튼 UI 테스트입니다. 지우셔도 됩니다.` 1건.
- **모바일에서 내용 칸에 자동 포커스하지 않는다.** 열자마자 키보드가 올라와 시트를 덮는다.
  성경 찾기(04)와 같은 판단이다.
- **바깥 클릭은 데스크톱(≥900px)에서만** 닫는다. 모바일 바닥 시트는 본문을 스크롤하려다
  닫히는 오발이 잦아서 `×`·`취소`·`Esc` 만 남겼다. 받는 쪽도 `mousedown` 이다(피커와 같다).
- **바깥 클릭만 포커스를 되돌리지 않는다.** `mousedown` 뒤 브라우저가 누른 자리로 포커스를
  옮기므로 되돌려 봐야 곧바로 빼앗긴다. `Esc`·`취소`·`×` 는 `#btn-fb` 로 돌아온다.
- **`복사해서 보내기` 는 실패한 뒤에만 보인다.** 늘 띄워 두면 "이걸 눌러야 하나" 로 읽힌다.
- **429 잠금은 60초 고정**이다. 서버가 주는 `Retry-After` 는 읽지 않는다 —
  CORS 로 노출된 헤더가 아니라 브라우저에서 못 읽는다.
- **`ts` 는 보내지만 서버가 버린다**(05-a 결정). 그래도 계약대로 채워 보낸다.
- **`aria-modal` 을 걸지 않았다.** 카드는 본문을 가두지 않는 팝오버라서, 뒤 본문을 읽으면서
  쓰는 게 자연스럽다. 포커스 트랩도 없다 — `Tab` 이면 카드 밖으로 나간다.
- **스크린 리더로 실제 읽어 보지 않았다.** `role="status"` 로 알림 줄을 표시했을 뿐이다.

## 배포

`5bd78d9` 푸시 → Pages 워크플로 **success** (run 35559578065).
`curl -s https://sunoeul.github.io/antilego/ | grep -o 'app.js?v=[0-9a-f]*'` → `app.js?v=5bd78d9`.
배포된 `app.js` 안에 `FEEDBACK_URL` 3회.

배포본을 헤드리스 Chrome 으로 확인 (`localStorage` 비우고 hard reload):

| | 관측값 |
|---|---|
| `window.__antilego.V` | `5bd78d9` |
| 상단바 | `사사기 9장` |
| `피드백` 알약 | 있다 |
| `FEEDBACK_URL` | `https://antilego-api.vercel.app/api/feedback` |
| 푸터 안내 | `읽다가 이상하면 오른쪽 '피드백' 버튼을 눌러 주세요.` |
| 카드 열림 · 위치 줄 | `사사기 9장 1절` |
| 카드 `z-index` / 폭 | **70** / **360px** |
| 타이핑 → `보내기` | 눌린다 |
| **CORS 프리플라이트** (배포본에서 실제 `OPTIONS`) | **204** — 출처 `https://sunoeul.github.io` 가 허용 목록에 있다 |
| `Esc` | 닫힘 |
| 모바일 360×800 바닥 시트 | `left 0 · width 360 · bottom 0`, 가로 스크롤 **360** |
| `console.error` | **0건** (데스크톱·모바일 둘 다, error 수준 `Log` 도 0건) |

스크린샷 `shots/live-desktop-card.png`.

**노션 반영 필요** — `Decisions` 에 "피드백 위치는 텍스트에어리어 접두사가 아니라 따로 한 줄
(`위치: … ×`)로 둔다 — `loc` 를 깨끗하게 남기려고" 한 줄.
