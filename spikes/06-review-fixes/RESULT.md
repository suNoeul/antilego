# Spike 06 — 코드 리뷰(review-01-codex) 반영

`spikes/review-01-codex/REVIEW.md` 의 발견을 영역별로 나눠 고친 기록. 에이전트별로 한 절씩 쓴다.

## 06-c — 리뷰 반영 (API · CI)

2026-09-21 · 대상 `api/**`, `.github/workflows/pages.yml` · 기준 리뷰 `spikes/review-01-codex/REVIEW.md`

리뷰의 **F13 · F15 와 "운영·성능 판정 보충" 4행**(레이트 리밋 / 입력 총량 / 로그·토큰 / Notion API 버전)을 닫았다.
의존성은 그대로 0개, Node 20+ 전역 `fetch` 만 쓴다.

### 무엇을 고쳤나

| 항목 | 전 | 후 |
|---|---|---|
| **F13 저장 URL 검증** | `/^(https:\/\/sunoeul\.github\.io\/antilego\/\|http:\/\/localhost)/` 문자열 prefix | `new URL()` 로 파싱 — origin·pathname·자격정보를 따로 본다. 300자 상한 |
| **입력 총량** | 스트림을 다 모은 뒤 파싱 (자체 상한 없음) | 16KB 상한. 읽으면서 세다가 넘으면 끊고 **413** + 한국어 문구 |
| **로그·토큰** | upstream 본문 400자 + 예외 메시지를 그대로 출력 | 고정 문구 + HTTP 상태 + 걸러 낸 `code` 만. 본문·예외 메시지는 안 찍는다 |
| **Notion 버전** | `2022-06-28` 하드코딩 | `NOTION_DATA_SOURCE_ID` 가 있으면 `2025-09-03` + `parent.data_source_id`, 없으면 그대로 |
| **F15 CI 권한** | 최상위 `pages: write` · `id-token: write` 를 build 도 상속 | 최상위 `contents: read`. 쓰기·OIDC 는 deploy job 에만 |
| **레이트 리밋** | (리뷰: 문서와 일치, 수정 불필요) | 코드는 그대로. README 에 "CORS·허니팟은 인증이 아니다" 한계를 명시 |

### F13 — 왜 prefix 검사로는 안 되나

문자열 prefix 에는 **호스트 끝 경계가 없다.** `http://localhost` 로 시작하기만 하면
`http://localhost.evil.example/x`(다른 도메인)와 `http://localhost@evil.example/`(자격정보로 위장한
`evil.example`)가 둘 다 통과해서 Notion `링크` 칸에 남았다. 파싱해서 보면 둘 다 hostname 이
`localhost` 가 아니다. **CORS 우회나 서버 측 접속(SSRF)은 아니고, 저장되는 링크의 신뢰 문제다.**

```js
function safeUrl(raw) {
  if (!raw || raw.length > URL_MAX) return '';           // 300자
  let u; try { u = new URL(raw); } catch { return ''; }
  if (u.username || u.password) return '';               // user:pw@ 는 버린다
  if (u.origin === SITE_ORIGIN && u.pathname.startsWith('/antilego/')) return raw;
  if (u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname)) return raw;  // 포트는 안 가린다
  return '';
}
```

조건에 안 맞으면 **링크만 버리고 나머지 필드는 그대로 저장한다** (기존 동작 유지).

### 로그 마스킹 — 무엇을 남기나

| 상황 | 남는 줄 |
|---|---|
| Notion 이 4xx/5xx | `[feedback] notion 저장 실패 <status> <code|->` |
| fetch 가 던짐 | `[feedback] notion 요청 실패` (예외 메시지 없음) |
| 토큰 미설정 | `[feedback] NOTION_TOKEN 이 설정되지 않았습니다` |
| 정상 | 아무것도 안 남는다 |

`code` 는 `/^[a-z_]{1,40}$/` 를 통과할 때만 남기고 아니면 `-`. upstream 응답 본문과 예외 메시지는
어느 경로에서도 로그에 들어가지 않는다 — 우리가 내용물을 보장할 수 없기 때문이다.

### Notion 데이터 소스 — 코드가 아니라 환경변수로 전환

| `NOTION_DATA_SOURCE_ID` | Notion-Version | parent |
|---|---|---|
| 비어 있음 (지금) | `2022-06-28` | `{ database_id }` |
| 값이 있음 | `2025-09-03` | `{ type: "data_source_id", data_source_id }` |

properties · children 은 두 경우가 같다. 지금은 **끄고 배포한다** — 리뷰 판정대로 현재 상태를 장애로
보지 않는다. DB 에 두 번째 데이터 소스가 붙는 날 환경변수만 넣으면 된다. 넣을 값은 DB 의
`data_sources` 에서 의도한 소스를 직접 확인해 고른다 (DB ID 재사용·첫 소스 자동선택 금지).

### F15 — CI 최소 권한

```yaml
permissions:
  contents: read        # 최상위 기본
jobs:
  build:   { permissions: { contents: read } }
  deploy:  { permissions: { contents: read, pages: write, id-token: write } }
```

`__V__` → 커밋 SHA 치환 step 은 **그대로 두었다** (캐시 버스팅이 없으면 흰 화면이 난다).
`ruby -ryaml` 로 파싱을 확인했고, job 별 권한이 위 표대로 읽힌다.

### 검사

`node api/test/notion-mock.mjs` — **36개 통과, 0 실패** (기존 24 + 12개 추가). 네트워크를 안 쓴다.

추가한 12개:
- 저장 URL 검증 3개 — 버릴 링크 9종(`localhost.evil.example`, `localhost@evil.example`,
  `user:pw@localhost:8000`, `sunoeul.github.io/other/`, `sunoeul.github.io/antilego`(끝 슬래시 없음),
  400자 URL, `https://localhost/`, `javascript:`, 비-URL) · 남길 링크 6종 · 300/301자 경계
- 본문 총량 3개 — 16KB 초과 → 413 + Notion 미호출 / 16KB 안쪽 통과 / `req.body` 문자열 경로에도 상한
- 로그 마스킹 4개 — 가짜 `ntn_FAKE_LEAKED_TOKEN_…` 이 든 401 본문을 흘려 넣고 `console.error` 를
  가로채 출력에 `ntn_` 과 upstream 메시지가 없는지 확인 / 이상한 `code` 는 `-` 로 / fetch 예외 메시지
  차단 / 정상 경로는 로그 0줄
- 데이터 소스 2개 — 환경변수 없을 때와 있을 때의 헤더·parent 모양

```
── 저장 URL 검증 (F13) ──
  ok   버려야 할 링크는 버리고 나머지 필드는 저장한다
  ok   정상 링크는 그대로 남긴다
  ok   300자 경계 — 300자는 남고 301자는 버린다

── 본문 총량 상한 ──
  ok   16KB 를 넘는 요청 → 413, Notion 은 안 부른다
  ok   16KB 안쪽은 통과한다
  ok   req.body 가 미리 문자열로 들어와도 상한이 걸린다

── 로그 마스킹 ──
  ok   Notion 오류 본문은 로그에 남지 않는다 — status + code 만
  ok   code 가 이상하면 남기지 않는다
  ok   fetch 예외 메시지는 로그에 안 남는다
  ok   요청 본문·토큰은 어떤 로그에도 안 나온다 (정상 경로)

── Notion 데이터 소스 전환 준비 ──
  ok   NOTION_DATA_SOURCE_ID 없음 → 2022-06-28 + parent.database_id
  ok   NOTION_DATA_SOURCE_ID 있음 → 2025-09-03 + parent.data_source_id

36 통과, 0 실패
```

### 판정

**F13 · F15 닫힘. 운영·성능 4행 중 3행(입력 총량 · 로그·토큰 · Notion 버전)은 코드로 닫았고,
레이트 리밋은 리뷰 판정대로 수정 없이 한계를 문서에 적었다.** API 를 재배포해야 반영된다
(배포는 조율자가 한다). `pages.yml` 변경은 다음 `web/` 푸시 때 처음 돌아간다.

남은 것:
- 데이터 소스 전환은 **준비만** 해 뒀다. 실제 소스 수·권한은 전환할 때 Notion 에서 확인한다.
- 레이트 리밋의 공유 카운터는 필요해질 때. 지금은 친구 3–4명 규모라 best-effort 로 충분하다.
- 노션 반영 필요 (Decisions 한 줄).
