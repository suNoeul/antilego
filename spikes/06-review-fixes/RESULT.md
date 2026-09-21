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

## 06-b — 리뷰 반영 (프런트)

2026-09-21 · 대상 `web/**`, `docs/03-prototype-spec.md` · 기준 리뷰 `spikes/review-01-codex/REVIEW.md`
(리뷰 줄 번호는 `7672b49` 기준. 아래 줄 번호는 이 커밋 기준)

리뷰의 **F2 · F3 · F9 · F10 · F11(UI 쪽)** 과 "운영·성능 판정 보충"의 **지도 재렌더 비용** 한 행을 닫았다.
**F7 · F8(피커 키보드·모달 포커스)은 손대지 않았다** — 다음 라운드.

### 무엇을 고쳤나

| # | 전 | 후 | 자리 |
|---|---|---|---|
| **F3** | `step()` 안에서 `if (ch < 1)` 다음에 **독립된** `if (ch > books[i].chapters)` 가 원래 권의 장 수와 다시 비교 → 출 1 `‹` 가 레 1 로 | 순수 함수 `stepRef(index, book, ch, dir)` 하나로 갈래를 합쳤다. `step()` 은 결과를 해시에 옮기기만 | `web/nav.js:26`, `web/app.js:400` |
| **F2** | `state.data = await getJSON(...)` 뒤 무조건 `append` — 세대 확인 없음 | 장을 부를 때마다 단조 증가 토큰. 응답 시점에 토큰이 바뀌었으면 상태·DOM·스크롤·선택 **아무것도** 안 건드린다 | `web/app.js:371`, `:374`, `:423` |
| **F10** | 정규식만 통과하면 `state` 와 `localStorage['last']` 에 그대로 저장 | `isValidRef()` 로 알려진 권 + `1 ≤ ch ≤ chapters` 검사. 실패하면 상태·저장소에 안 쓰고 **마지막 유효 위치 → 유효한 `last` → `#Gen.1`** 로 되돌린다 | `web/nav.js:14`, `web/app.js:416`, `:423`, `:87` |
| **F9** | 잠그는 건 `#fb-send` 뿐. 성공하면 **지금** 값을 비움 | 보내는 동안 내용·이름·위치 `×` 까지 잠그고, 비울 때는 **보낸 값과 같을 때만** | `web/app.js:1108`, `:1204`, `:1232` |
| **F11** | `attribution.json` 문자열 4개를 `textContent` 로만 삽입 — 따라갈 링크도 변경 고지도 없음 | 객체 형식 `{text, author, url, license, license_url, changes}` (`sources` 또는 `items`) 를 링크로 그린다. 옛 배열도 그대로 받는다 | `web/app.js:1275`–`:1320`, `:1358`, `web/styles.css:231` |
| 지도 재렌더 | 휠·pointermove 가 직접 `drawMap()` | `scheduleDraw()` — `state.view` 는 이벤트마다, SVG 다시 그리기는 **프레임당 한 번** (최신 view) | `web/app.js:186`, `:478`, `:511`, `:522` |

새 파일 하나: **`web/nav.js`** — DOM 도 전역도 안 쓰는 네비게이션 계산 3개(`bookIndex` ·
`isValidRef` · `stepRef`). F14 가 지적한 "순수 함수라고 부르는데 DOM 을 쓴다" 를 이쪽에서는 만들지
않으려고 처음부터 분리했다. 덕분에 66권 경계를 Node 에서 바로 전수 시험할 수 있다.

### F3 — 옛 코드가 정확히 몇 개를 틀렸나

고치기 전 `step()` 을 그대로 떼어 실제 `web/data/index.json` 으로 돌렸다:

```
옛 step() 뒤로 경계 실패: 34 / 65
Exod 1 ‹ → {"book":"Lev","ch":1}   (want {"book":"Gen","ch":50})
Lev  1 ‹ → {"book":"Num","ch":1}   (want {"book":"Exod","ch":40})
Deut 1 ‹ → {"book":"Josh","ch":1}  (want {"book":"Num","ch":36})
```

리뷰의 "65개 중 34개 실패" 와 같다. **앞 권이 지금 권보다 길 때만** 두 번째 `if` 가 참이 되기
때문이다(창 50 > 출 40 이 아니라, 넣어 둔 `ch=50` 이 *출애굽기의* 40장보다 크다고 비교한다).

회귀 테스트 `spikes/06-review-fixes/b-nav-test.mjs` — `node spikes/06-review-fixes/b-nav-test.mjs`:

```
index.json: 66권, 1189장

PASS — 2656 pass, 0 fail
```

2,656건 = 권 경계 65+65 · 성경 양 끝 2 · 리뷰가 집은 2 · 권 안쪽 ±1 전수(2,246) · 잘못된 입력 4 ·
`isValidRef` 271. 브라우저·DOM 없이 돈다.

### F2 — 재현과 확인

헤드리스 Chrome 안에서 장 JSON fetch 만 가로채 **손으로 풀어 주는** 프로미스로 바꿨다.
Gen.1 요청 → (응답 전) Gen.2 요청 → **2번을 먼저** 풀고 → 1번을 나중에 푼다.

```
ok  요청 두 개가 떠 있다 — got ["Gen.1","Gen.2"]
ok  해시 — #Gen.2
ok  state.data.chapter — 2
ok  절 수 = 창 2장 25절 (1장 31절이 섞이지 않았다) — got 25
ok  절 번호 중복 없음
ok  제목 — 창세기 2장
ok  첫 절 본문 — "천지와 만물이 다 이루니라…"
ok  토큰 붙인 뒤에도 평범한 이동은 그대로 (수 10장 43절)
```

고치기 전에는 리뷰가 적은 대로 2장 뒤에 1장이 **덧붙고** `state.data.chapter` 가 1 이었다.

**본문 비우기는 await 앞에 그대로 뒀다** (로딩 중 빈 화면 = 기존 동작). 대신 그리는 쪽에 토큰 문을
달아서, 진 응답은 `append` 도 `showMsg` 도 하지 못한다. 그래서 섞임이 없다.

한 가지 함정을 밟았다가 고쳤다: 토큰을 `apply()` 진입마다 올렸더니 **부팅이 깨졌다.** `boot()` 이
`location.hash` 를 세팅한 뒤 `await apply()` 를 직접 부르기 때문에, 같은 장을 가리키는 `hashchange`
가 한 번 더 들어와 토큰을 올리고, 먼저 뜬 요청이 자기 응답을 버려서 본문이 영영 비었다.
**토큰은 `changed` 일 때만 올린다** (`app.js:434` 주석). 같은 장을 다시 적용하는 `apply()` 는
이미 떠 있는 요청을 죽이지 않는다.

### F10 — 검증 대상과 되돌아가는 규칙

`isValidRef(index, book, ch)` 하나를 **해시 · 부팅 시 저장된 `last` 양쪽에** 쓴다.
되돌아가는 순서는 `lastValidRef()`: 지금 읽던 장(유효하면) → 저장된 `last`(유효하면) → `#Gen.1`.
되돌릴 때는 `location.replace` 다 (`app.js:87`) — 히스토리에 칸을 만들지 않아서, 뒤로를 눌러도
잘못된 주소로 갔다가 다시 튕기는 고리가 생기지 않는다.

```
ok  #Foo.999 → #Josh.10   · state 유효 · localStorage.last 유효
ok  #Gen.0   → #Josh.10   · state 유효 · localStorage.last 유효
ok  #Gen.999 → #Josh.10   · state 유효 · localStorage.last 유효
ok  #Gen.1.2 → #Josh.10   · state 유효 · localStorage.last 유효   (형식부터 안 맞는 해시)
ok  빈 해시 → #Josh.10
ok  last=Zzz.42 로 부팅 → #Gen.1   (망가진 last 는 유효한 값으로 덮인다)
ok  last=Gen.0  로 부팅 → #Gen.1
ok  멀쩡한 last 는 그대로 복원 → #Josh.10
ok  #Foo.999 로 바로 부팅 → #Josh.10
```

**`localStorage['last']` 에 무효한 참조가 들어가는 경로는 남아 있지 않다.** 잘못된 해시는
`ls.set('last', …)` 에 닿기 전에 끊긴다.

### F9 — 잠그는 것과 잠그지 않는 것

잠근다: `#fb-text` · `#fb-name` · `#fb-loc-x` · `#fb-send`.
**잠그지 않는다: `취소` · `×`** — 닫는 길은 언제나 열려 있어야 한다.
성공해서 내용을 비울 때도 `if ($('fb-text').value === sent)` 로 한 겹 더 가린다(`app.js:1232`).
잠기는 순간 밀려난 포커스는 풀릴 때 내용 칸으로 돌려준다(`:1246`).

```
ok  전송 중 내용 칸 잠김 / 이름 칸 잠김 / 위치 × 잠김 / 보내기 잠김 ("보내는 중…")
ok  취소·닫기는 열려 있다
ok  서버로 간 글 — "첫 번째 글"
ok  보낸 것과 다른 글은 지우지 않는다 — "보내는 사이에 쓴 새 글"
ok  바뀌지 않은 글은 성공 후 비운다 / 이름은 남는다
ok  실패해도 글은 그대로 · 복사 버튼이 나온다 · 잠금 해제
```

(느린 응답은 CDP 가 아니라 페이지 안에서 `fetch` 를 붙잡아 두는 방식으로 흉내 냈다. 실제 API 는
안 불렀다.)

### F11 — 두 형식을 다 받는다

```
Array.isArray(data)          → 문자열 배열 그대로
data.sources ?? data.items   → 객체 [{ text, author, url, license, license_url, changes }]
data.legacy                  → 문자열 배열
그 밖                         → 빈 줄
```

푸터는 `이름 (저작자, 라이선스) — 변경: …`, 링크는 `target="_blank" rel="noopener"`.
**저작자가 이름 안에 이미 들어 있으면 두 번 쓰지 않는다** (`OpenBible.info Bible Geocoding` ←
저작자 `OpenBible.info`). 이름에 없는 저작자는 반드시 남긴다 — 리뷰가 짚은
TIPNR 의 `Tyndale House, Cambridge`. 패널(`#panel-attr`)은 좁으니 **이름만 짧게** —
링크는 푸터 한 곳에만 둔다.

06-a 가 실제로 쓴 키는 `items` 가 아니라 **`sources`** 였다 (그리고 `author` 필드가 있다).
둘 다 받게 고쳤다(`data.sources ?? data.items`). 조율 때 약속한 `items` 도 그대로 동작한다.

06-a 가 새 파일을 커밋한 뒤 그 파일 그대로 확인한 결과:

```
실제 attribution.json: sources,legacy / 출처 4개 / 앵커 6개 (원본 4 + 라이선스 2)
푸터: 성경전서 개역한글판 (대한성서공회, 저작재산권 만료 · 성명표시) — 변경: 없음 — 원문 그대로 ·
      OpenBible.info Bible Geocoding (CC BY 4.0) — 변경: 장소 선별·좌표 대표점 선택·한글 지명 매핑 ·
      STEPBible TIPNR (Tyndale House, Cambridge, CC BY 4.0) — 변경: 동명이지 식별에 사용 ·
      Natural Earth 1:10m (public domain) — 변경: bbox 클리핑·단순화
패널: 성경전서 개역한글판 · OpenBible.info Bible Geocoding · STEPBible TIPNR · Natural Earth 1:10m
```

```
ok  실제 파일로 출처 줄이 그려진다 · 링크는 전부 새 탭 + noopener · 패널은 이름만
ok  옛 배열: 앵커 0개 · 네 줄이 · 로 이어진다 · 패널도 같은 줄
ok  sources 키를 읽는다: 앵커 4개
ok  이름에 없는 저작자는 남긴다 (Tyndale House, Cambridge)
ok  이름에 이미 있는 저작자는 두 번 쓰지 않는다
ok  (items 키) 새 객체: 앵커 6개 · 모두 target=_blank · 모두 rel=noopener · 변경 고지가 들어 있다
ok  items 없이 legacy 만 있어도 그린다
ok  픽스처(?data=data-fixture, 아직 배열)도 그대로 그려진다
```

스크린샷은 실제 파일 그대로다 (`shots/b-f11-attr-object-1400.png`, `shots/b-360-attr-object.png`).
`web/data-fixture/attribution.json` 은 **옛 배열인 채로 뒀다** — 두 경로를 계속 시험할 수 있게.

### 지도 재렌더 — 프레임당 한 번

`scheduleDraw()` 는 `scheduleRelayout()` 과 같은 모양이다. `state.view` 는 이벤트마다 그대로
갱신하고 실제 렌더만 묶으므로 **언제나 최신 view 가 그려진다**. 버튼(`+` `−` `⟲`)과 더블클릭은
한 번뿐이라 즉시 그린다(원래대로).

```
ok  휠 확대가 먹는다 (rAF 묶음) — z=4.874   (휠 12번)
ok  휠 뒤에도 지도가 그려져 있다 — 15 노드 (확대 전 41)
ok  render.view 가 최신 view 와 같다
ok  ⟲ 로 배율 복귀 — z=1
```

### 검증 (헤드리스 Chrome, CDP)

`cd web && python3 -m http.server 8061` + `Google Chrome --headless=new --remote-debugging-port=9361`
(Chrome 153.0.8010.52), Node 25.8.1 내장 WebSocket 으로 CDP 직접 호출. 1400×900 / 360×800(`mobile:true`).
스크립트는 임시 디렉토리에 뒀다(이전 스파이크와 같은 방식). 커밋한 테스트는 브라우저가 필요 없는
`b-nav-test.mjs` 하나다. 브라우저 캐시는 `Network.setCacheDisabled` 로 껐다 — 껐다 켜지 않았을 때
06-a 가 막 바꾼 `attribution.json?v=__V__` 의 **옛 응답**을 Chrome 이 그대로 내주는 걸 한 번 겪었다.

**총 86개 확인, 0 실패.** 회귀 부분:

```
ok  피커 열림 · 권 목록이 66개 · 피커 닫힘
ok  패널 열림 · 지도가 그려졌다 (34 노드) · 시대 레이어 켜짐/꺼짐
ok  900–1199 에서도 패널이 열려 있다 · 패널 닫힘
ok  360px 닫힘 / 패널 열림 / 피커 / 피드백 / 출처 줄 — scrollWidth 전부 360
ok  360px 에서도 출 1 ‹ → 창 50
네트워크 4xx: 3  (전부 ?data=data-fixture 의 시대 파일 3개 — 픽스처에 원래 없다. 설계대로 조용히 숨긴다)
console.error / 예외: 0
```

스크린샷 `spikes/06-review-fixes/shots/`:
`b-f3-exod1-1400` · `b-f3-gen50-1400` · `b-f2-gen2-only-1400` · `b-f10-recovered-1400` ·
`b-f11-attr-object-1400` · `b-f9-sending-locked-1400` · `b-reg-picker-1400` · `b-reg-panel-era-1400` ·
`b-360-closed` · `b-360-panel` · `b-360-picker` · `b-360-feedback` · `b-360-f3-gen50` · `b-360-attr-object`

### 벗어난 점 · 남은 것

- **잘못된 해시의 한국어 에러는 잠깐만 보인다.** 기존 문구("이 장을 불러오지 못했습니다…")를
  띄운 직후 유효한 위치로 되돌아가면서 그 장의 본문이 덮는다. 로컬 데이터에서는 거의 한 프레임,
  느린 망에서는 요청 한 번만큼 남는다. 새 문구를 만들지 않으려고 이렇게 뒀다 — 상시 배너가 필요하면
  별도로 정하는 게 낫다.
- **`F7` · `F8` 은 손대지 않았다** (피커 숫자 격자 roving tabindex, 모바일 모달 포커스·Tab·Esc 일원화).
  다음 라운드.
- **스펙 드리프트 중 UI 쪽만 정리했다.** `docs/03-prototype-spec.md` 에 "‹ › 권 경계"(레이아웃),
  "다시 그리는 것은 프레임당 한 번"(지도 조작), "보내는 중 잠금"(피드백), "출처 표기 — attribution.json
  두 형식", "해시 검증 · 장 요청 토큰"(라우팅/상태)을 더했다. `:198` 의 `renderScene` 순수 함수 표현(F14),
  `:234` LOD 수치, 다크 `--region-b` 는 **그대로 뒀다** — 지도/데이터 쪽 담당 영역이다.
- 데이터 스키마 절의 `### attribution.json` ("표시용 문자열 배열")에는 새 절을 가리키는 주석 한 줄만
  넣었다. 본문 수정은 `attribution.json` 을 실제로 바꾸는 06-a 가 하는 게 맞다.
- 노션 반영 필요 (Decisions 한 줄).
