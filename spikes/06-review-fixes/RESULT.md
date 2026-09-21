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

## 06-a — 리뷰 반영 (데이터 · 빌드)

2026-09-21 · 대상 `spikes/**/*.py`, `data/derived/*`, `web/data/**`, 스키마 문서 ·
기준 리뷰 `spikes/review-01-codex/REVIEW.md`

리뷰의 **F1 · F4 · F5 · F6 · F11(데이터) · F12** 를 닫았다. `build.py` 한 번이 이제
시대 파일까지 만들고, 끝에 본문 무수정·파일 완비를 **스스로 검사하고 틀리면 실패한다.**

### 한눈에

| | 전 | 후 |
|---|---|---|
| 밑줄 mention | 7,417 | **7,347** (−70) |
| `places.json` 장소 | 882 | **918** (+36) |
| 수동 오버라이드 | 72 | **233** (+161 — 고침 148 · 억제 13) |
| 본문 검증 | 입력 해시만 출력 | **산출물 재독해 + 원본 전수 대조 + BMP 검사 + 해시 양쪽** |
| 시대 파일 | `build.py` 가 지우고 안 만듦 | `build.py` 가 `export_web.py` 를 부른다 · 검증기가 3개를 본다 |
| `attribution.json` | 문자열 4개 | `sources[]` 객체 4개 + `legacy[]` |

### F1 — 오답 지명 (높음)

지정된 세 곳을 개역한글 본문을 읽고 고쳤다.

| place_id | en | auto | 고침 | 근거 |
|---|---|---|---|---|
| `a8f60f3` | Patmos | `동참하는` | **밧모** | 계 1:9 「… 인하여 **밧모**라 하는 섬에 있었더니」 |
| `a593a48` | Chorazin | `회개하였으리라` | **고라신** | 마 11:21 「화가 있을찐저 **고라신**아」 (눅 10:13 동일) |
| `afed46a` | Gadara | `없을만하더라` | **가다라** | 마 8:28 「건너편 **가다라** 지방에 가시매」 — 개역한글 표기는 `가다라`가 맞다 |

**같은 부류 사냥.** `places.ko.json` 에서 confidence ≥ 0.9 이고 아직 수동 검증이 없는 항목을
두 가지 잣대로 걸렀다 — ① `ko` 가 동사·서술 어미로 끝난다(`하는/하여/더라/이라/니라/으로/지라/…`)
② `ko` 가 그 장소의 OpenBible 구절 어디에서도 **어절 경계에서 시작하지 않는다**.
1차로 91건이 걸렸고, 낱말 경계 규칙을 켠 뒤 **산출된 918곳 전체를 같은 잣대로 두 번 더 훑어**
(어미형 잔여 · 같은 한글인데 n 격차 20배 이상인 충돌) 각각 35건 · 19건을 더 찾았다.
합계 **161건**을 구절 본문을 보고 하나씩 판정했다 (전부 `evidence` 필드에 근거 절을 남겼다).

판정 기준: 개역한글이 **고유명사로 음역한 것**은 그 표기로 고치고, **보통명사로 뜻을 옮긴 것**
(`상수리나무` `남방` `눈물 골짜기` `애굽 해고` `용사들`)이나 **아예 이름이 없는 것**(Kue · Leb-kamai ·
Uzal · Helech · Ramah 8)은 `ko: null` 로 억제했다 — "모호하면 보여주지 않는다".

| place_id | en | auto (틀린 값) | 고친 값 | 근거 절 | n |
|---|---|---|---|---|---|
| `a8e53d5` | Ezion-geber | `에시온` | `에시온게벨` | Num.33.35 | 6 |
| `a505743` | Meribah 1 | `므리` | `므리바` | Num.20.13 | 6 |
| `afdda14` | Nob | `놉에` | `놉` | 1Sam.21.1 | 6 |
| `a68aa8f` | Corner Gate | `문까지` | `모퉁이 문` | 2Kgs.14.13 | 5 |
| `a079b21` | Rameses | `라암` | `라암셋` | Exod.1.11 | 4 |
| `a6c3859` | Ahava | `아하` | `아하와` | Ezra.8.15 | 3 |
| `a6bf059` | Baal-perazim | `바알브라심이라` | `바알브라심` | 2Sam.5.20 | 3 |
| `a26c8f2` | Havvoth-jair | `야일` | `하봇야일` | Num.32.41 | 3 |
| `ae7836a` | Kibroth-hattaavah | `기브롯` | `기브롯 핫다아와` | Num.11.34 | 3 |
| `aae8a95` | Avith | `아윗이며` | `아윗` | Gen.36.35 | 2 |
| `ab8fdbc` | Babel | `바벨론` | `바벨` | Gen.10.10 | 2 |
| `a859268` | Bochim | `벧엘` | `보김` | Judg.2.1 | 2 |
| `ab7bf48` | Caesarea Philippi | `누구라` | `가이사랴 빌립보` | Matt.16.13 | 2 |
| `a2bb265` | Chinnereth | `긴네` | `긴네렛` | Deut.3.17 | 2 |
| `a593a48` | Chorazin | `회개하였으리라` | `고라신` | Matt.11.21 | 2 |
| `ae8badb` | Dibon 3 | `디본` | `디몬` | Isa.15.9 | 2 |
| `a1ce1b7` | Hazar-enan | `하살` | `하살에난` | Num.34.9 | 2 |
| `a057d59` | King’s Highway | `나가기까지` | `왕의 대로` | Num.20.17 | 2 |
| `aac759d` | Mount Bashan | `바산` | `바산의 산` | Ps.68.15 | 2 |
| `a4b9865` | Pekod | `바벨론` | `브곳` | Jer.50.21 | 2 |
| `ad27541` | Ramah 5 | `방문하였더라` | `라마` | 2Kgs.8.29 | 2 |
| `ae89331` | Shaalbim | `사알` | `사알빔` | Judg.1.35 | 2 |
| `a38ebfd` | Tigris | `힛데겔이라` | `힛데겔` | Gen.2.14 | 2 |
| `a71f834` | Valley of Beracah | `송축한지라` | `브라가 골짜기` | 2Chr.20.26 | 2 |
| `a957c5b` | Abel-keramim | `그라밈까지` | `아벨 그라밈` | Judg.11.33 | 1 |
| `a51d1fa` | Abel-shittim | `벧여시못에서부터` | `아벨싯딤` | Num.33.49 | 1 |
| `a8b7a6b` | Accad | `시작되었으며` | `악갓` | Gen.10.10 | 1 |
| `a2c780b` | Adami-nekeb | `상수리나무에서부` | `아다미 네겝` | Josh.19.33 | 1 |
| `a845493` | Adithaim | `그데로다임이니` | `아디다임` | Josh.15.36 | 1 |
| `a112fe3` | Aenon | `애논에서` | `애논` | John.3.23 | 1 |
| `a040ba5` | Akeldama | `피밭이라` | `아겔다마` | Acts.1.19 | 1 |
| `a84cafa` | Allammelech | `시홀림낫에` | `알람멜렉` | Josh.19.26 | 1 |
| `af9a894` | Allon-bacuth | `알론바굿이라` | `알론바굿` | Gen.35.8 | 1 |
| `a2f1fa1` | Amad | `시홀림낫에` | `아맛` | Josh.19.26 | 1 |
| `a105543` | Armageddon | `므깃도` | `아마겟돈` | Rev.16.16 | 1 |
| `a2c34ce` | Atharim | `사로잡은지라` | `아다림` | Num.21.1 | 1 |
| `af3ccdf` | Aven | `벧엘` | `아웬` | Hos.10.8 | 1 |
| `ad041dd` | Azal | `함께하리라` | `아셀` | Zech.14.5 | 1 |
| `a366989` | Baal-hazor | `바알하솔에서` | `바알하솔` | 2Sam.13.23 | 1 |
| `ad3d9fc` | Baal-shalishah | `바알살리사에서부` | `바알 살리사` | 2Kgs.4.42 | 1 |
| `aa3ff18` | Bered | `브엘라해로이라` | `베렛` | Gen.16.14 | 1 |
| `aa2fea1` | Beth-anoth | `엘드곤이니` | `벧 아놋` | Josh.15.59 | 1 |
| `a2da675` | Beth-arbel | `부숴졌도다` | `벧아벨` | Hos.10.14 | 1 |
| `a0cc925` | Beth-dagon 2 | `가불좌편으로` | `벧 다곤` | Josh.19.27 | 1 |
| `a84c5a4` | Beth-eden | `벧에던에서` | `벧에던` | Amos.1.5 | 1 |
| `a587ea0` | Beth-emek | `가불좌편으로` | `벧에멕` | Josh.19.27 | 1 |
| `aea5552` | Beth-gilgal | `길갈` | `벧길갈` | Neh.12.29 | 1 |
| `a289a5b` | Beth-lebaoth | `사루헨이니` | `벧 르바옷` | Josh.19.6 | 1 |
| `ac9fb6d` | Bether 1 | `산에서` | `베데르 산` | Song.2.17 | 1 |
| `a206291` | Bezek 2 | `삼만이더라` | `베섹` | 1Sam.11.8 | 1 |
| `a5983ec` | Brook of the Arabah | `학대하리라` | `아라바 시내` | Amos.6.14 | 1 |
| `a978a24` | Cabul 1 | `가불좌편으로` | `가불` | Josh.19.27 | 1 |
| `abf6e12` | Caleb Ephrathah | `에브라다에서` | `갈렙 에브라다` | 1Chr.2.24 | 1 |
| `a961693` | Chilmad | `장사들이라` | `길맛` | Ezek.27.23 | 1 |
| `a898f06` | Chisloth-tabor | `사릿에서부터` | `기슬롯 다볼` | Josh.19.12 | 1 |
| `a44cac9` | Cozeba | `야수비네헴이니` | `고세바` | 1Chr.4.22 | 1 |
| `ab9580e` | Dragon Spring | `소화되었더라` | `용정` | Neh.2.13 | 1 |
| `a0a6365` | Dumah 2 | `파숫군이여` | `두마` | Isa.21.11 | 1 |
| `af7eb92` | Eglath-shelishiyah | `에글랏` | `에글랏셀리시야` | Jer.48.34 | 1 |
| `a30b045` | El-bethel | `나타나셨음이더라` | `엘벧엘` | Gen.35.7 | 1 |
| `a738bf1` | El-paran | `엘바란까지` | `엘바란` | Gen.14.6 | 1 |
| `a26cd81` | Eltekon | `엘드곤이니` | `엘드곤` | Josh.15.59 | 1 |
| `a0e33a3` | En-hakkore | `솟아나오는지라` | `엔학고레` | Judg.15.19 | 1 |
| `ad44943` | Eneglaim | `에네글라임까지` | `에네글라임` | Ezek.47.10 | 1 |
| `a507da9` | Ephraim 1 | `바알하솔에서` | `에브라임` | 2Sam.13.23 | 1 |
| `a43608b` | Esek | `에섹이라` | `에섹` | Gen.26.20 | 1 |
| `a2ca712` | Eth-kazin | `네아까지` | `엣 가신` | Josh.19.13 | 1 |
| `afed46a` | Gadara | `없을만하더라` | `가다라` | Matt.8.28 | 1 |
| `a2d3ca1` | Geba 2 | `기브온` | `게바` | 2Sam.5.25 | 1 |
| `a58df35` | Gebim | `피난하며` | `게빔` | Isa.10.31 | 1 |
| `ac36af4` | Gederothaim | `그데로다임이니` | `그데로다임` | Josh.15.36 | 1 |
| `a1c28f1` | Geruth Chimham | `머무렀으니` | `게롯김함` | Jer.41.17 | 1 |
| `af0ee3a` | Gibbar | `기브온` | `깁발` | Ezra.2.20 | 1 |
| `a97126d` | Gibeath-haaraloth | `길갈` | `할례산` | Josh.5.3 | 1 |
| `a3cefc6` | Goiim 2 | `길갈` | `고임` | Josh.12.23 | 1 |
| `ae1d208` | Haeleph | `기업이었더라` | `엘렙` | Josh.18.28 | 1 |
| `a7a5f29` | Ham 1 | `가르나임에서` | `함` | Gen.14.5 | 1 |
| `abd2a8d` | Hammath 2 | `족속이더라` | `함맛` | 1Chr.2.55 | 1 |
| `ab786f4` | Hara | `옮긴지라` | `하라` | 1Chr.5.26 | 1 |
| `ad7e819` | Havilah 1 | `비손이라` | `하윌라` | Gen.2.11 | 1 |
| `ab270f6` | Hazar-susah | `하살수` | `하살수사` | Josh.19.5 | 1 |
| `aae18d7` | Hazer-hatticon | `하셀핫디곤이라` | `하셀핫디곤` | Ezek.47.16 | 1 |
| `a8687ff` | Heleph | `요단` | `헬렙` | Josh.19.33 | 1 |
| `ac722b9` | Helkath-hazzurim | `헬갓핫수림이라` | `헬갓핫수림` | 2Sam.2.16 | 1 |
| `a7df136` | Hereth | `유다땅으로` | `헤렛` | 1Sam.22.5 | 1 |
| `a6779cd` | Hobah | `호바까지` | `호바` | Gen.14.15 | 1 |
| `a5a846f` | Humtah | `시올이니` | `훔다` | Josh.15.54 | 1 |
| `ac405c0` | Illyricum | `일루리곤까지` | `일루리곤` | Rom.15.19 | 1 |
| `aedf531` | Jabez | `족속이더라` | `야베스` | 1Chr.2.55 | 1 |
| `abff89f` | Jabneel 2 | `상수리나무에서부` | `얍느엘` | Josh.19.33 | 1 |
| `ab15bb3` | Japhia | `사릿에서부터` | `야비아` | Josh.19.12 | 1 |
| `a8ccbf2` | Jeruel | `올라오리니` | `여루엘` | 2Chr.20.16 | 1 |
| `adbbb54` | Jotbah | `므술레멧이라` | `욧바` | 2Kgs.21.19 | 1 |
| `a7e39d2` | Laishah | `아나돗이여` | `라이사` | Isa.10.30 | 1 |
| `abe5dde` | Lakkum | `상수리나무에서부` | `락굼` | Josh.19.33 | 1 |
| `a422a1f` | Luz 2 | `이름이더라` | `루스` | Judg.1.26 | 1 |
| `ae60c0c` | Maarath | `엘드곤이니` | `마아랏` | Josh.15.59 | 1 |
| `a67297a` | Madmenah | `피난하며` | `맛메나` | Isa.10.31 | 1 |
| `ac041e2` | Magbish | `일백오십육` | `막비스` | Ezra.2.30 | 1 |
| `a1ba491` | Maroth | `임함이니라` | `마롯` | Mic.1.12 | 1 |
| `a7d1972` | Me-jarkon | `경계까지라` | `메얄곤` | Josh.19.46 | 1 |
| `a6b4fb2` | Mesha | `메사에서부터` | `메사` | Gen.10.30 | 1 |
| `a0a52ec` | Metheg-ammah | `가드` | `메덱암마` | 2Sam.8.1 | 1 |
| `a2f0a70` | Michmethath | `믹므` | `믹므닷` | Josh.17.7 | 1 |
| `abee1b4` | Middle Gate | `방백들이었더라` | `중문` | Jer.39.3 | 1 |
| `a7719f8` | Misgab | `파괴되었으니` | `미스갑` | Jer.48.1 | 1 |
| `a5bf0bd` | Misrephoth-maim | `미스르봇` | `미스르봇마임` | Josh.13.6 | 1 |
| `a694ea2` | Mizpah 4 | `갈르엣이라` | `미스바` | Gen.31.49 | 1 |
| `abcd5f2` | Mortar | `끊어졌음이니라` | `막데스` | Zeph.1.11 | 1 |
| `a954735` | Mount Gilead | `일만명이었더라` | `길르앗산` | Judg.7.3 | 1 |
| `a597123` | Mount Mizar | `기억하나이다` | `미살산` | Ps.42.6 | 1 |
| `ac69561` | Nahalal | `나할` | `나할랄` | Josh.19.15 | 1 |
| `ab571de` | Neiel | `가불좌편으로` | `느이엘` | Josh.19.27 | 1 |
| `af43cde` | Nicopolis | `작정하였노라` | `니고볼리` | Titus.3.12 | 1 |
| `a8f60f3` | Patmos | `동참하는` | `밧모` | Rev.1.9 | 1 |
| `ae67841` | Perez-uzzah | `충돌하시므로` | `베레스웃사` | 2Sam.6.8 | 1 |
| `a19b076` | Pishon | `비손이라` | `비손` | Gen.2.11 | 1 |
| `a3870fe` | Pithom | `감독들을` | `비돔` | Exod.1.11 | 1 |
| `a446973` | Racal | `갈멜` | `라갈` | 1Sam.30.29 | 1 |
| `aa3e5ae` | Rakkon | `경계까지라` | `락곤` | Josh.19.46 | 1 |
| `a813f22` | Rimmon 3 | `네아까지` | `림몬` | Josh.19.13 | 1 |
| `a897bdb` | Rock of Escape | `셀라하마느곳이라` | `셀라하마느곳` | 1Sam.23.28 | 1 |
| `a86e0b0` | Salim | `애논에서` | `살렘` | John.3.23 | 1 |
| `a3cae2c` | Sephar | `메사에서부터` | `스발` | Gen.10.30 | 1 |
| `a0a98de` | Sepharad | `사르밧까지` | `스바랏` | Obad.1.20 | 1 |
| `a5d4629` | Shallecheth | `파수하였으니` | `살래겟` | 1Chr.26.16 | 1 |
| `a887d36` | Sharuhen | `사루헨이니` | `사루헨` | Josh.19.6 | 1 |
| `a86d49f` | Shaveh-kiriathaim | `가르나임에서` | `사웨 기랴다임` | Gen.14.5 | 1 |
| `ac53696` | Shebarim | `스바림까지` | `스바림` | Josh.7.5 | 1 |
| `ac6b338` | Shihor-libnath | `시홀림낫에` | `시홀 림낫` | Josh.19.26 | 1 |
| `ae71673` | Shiloah | `르말라야의` | `실로아` | Isa.8.6 | 1 |
| `ad16b1e` | Shual | `노략꾼들이` | `수알` | 1Sam.13.17 | 1 |
| `ab5d319` | Sibraim | `하셀핫디곤이라` | `시브라임` | Ezek.47.16 | 1 |
| `ab56451` | Silla | `밀로궁에서` | `실라` | 2Kgs.12.20 | 1 |
| `af23dbb` | Straight Street | `중이다` | `직가` | Acts.9.11 | 1 |
| `a8530e9` | Tabor 3 | `세덩이를` | `다볼` | 1Sam.10.3 | 1 |
| `ae3f164` | Timnah 2 | `기브아` | `딤나` | Josh.15.57 | 1 |
| `aab8f2d` | Tiphsah 1 | `딥사에서부터` | `딥사` | 1Kgs.4.24 | 1 |
| `abf2443` | Tiphsah 2 | `갈랐더라` | `딥사` | 2Kgs.15.16 | 1 |
| `a0c71dc` | Valley of Aven | `벧에던에서` | `아웬 골짜기` | Amos.1.5 | 1 |
| `a8c579d` | Valley of Gibeon | `기브온` | `기브온 골짜기` | Isa.28.21 | 1 |
| `a01769f` | Valley of Shittim | `대리라` | `싯딤 골짜기` | Joel.3.18 | 1 |
| `a7c5927` | Valley of Zeboim | `향하였더라` | `스보임 골짜기` | 1Sam.13.18 | 1 |
| `a74c453` | Zair | `소알` | `사일` | 2Kgs.8.21 | 1 |
| `a07ae2d` | Zeredah 1 | `대적하였으니` | `스레다` | 1Kgs.11.26 | 1 |
| `ac2907d` | Zior | `시올이니` | `시올` | Josh.15.54 | 1 |
| `a4446f1` | Ziz | `올라오리니` | `시스` | 2Chr.20.16 | 1 |
| `a00de1e` | Allon | `상수리나무에서부` | **억제(null)** | Josh.19.33 | 0 |
| `a849ca2` | Bamah | `기브온` | `바마` | Ezek.20.29 | 0 |
| `a4e39f6` | Galilee 2 | `갈릴리` | **억제(null)** | Josh.12.23 | 0 |
| `a764256` | Gamad | `있었음이여` | **억제(null)** | Ezek.27.11 | 0 |
| `ab5f357` | Helech | `있었음이여` | **억제(null)** | Ezek.27.11 | 0 |
| `af133c0` | Kue | `내어왔으니` | **억제(null)** | 1Kgs.10.28 | 0 |
| `a9de8b7` | Leb-kamai | `처하는` | **억제(null)** | Jer.51.1 | 0 |
| `a9ea180` | Lehem | `베들레헴` | **억제(null)** | 1Chr.4.22 | 0 |
| `a15bdfd` | Ramah 8 | `신하들은` | **억제(null)** | 1Sam.22.6 | 0 |
| `a702ab6` | Sea of Egypt | `말리우시고` | **억제(null)** | Isa.11.15 | 0 |
| `a092025` | South Gate | `당첨되었으며` | **억제(null)** | 1Chr.26.15 | 0 |
| `a217cc5` | Uzal | `무역하였음이여` | **억제(null)** | Ezek.27.19 | 0 |
| `a1f363e` | Valley of Baca | `입히나이다` | **억제(null)** | Ps.84.6 | 0 |
| `a61d405` | West Gate | `파수하였으니` | **억제(null)** | 1Chr.26.16 | 0 |

남은 한계: 개역한글이 **띄어쓰기·표기를 절마다 다르게** 쓰는 곳은 한 문자열로 다 잡지 못한다
(`기브롯 핫다아와`/`기브롯핫다아와`, `에시온게벨`/`에시온 게벨`, `하살에난`/`하살에논`,
`라암셋`/`라암세스`, `긴네렛`/`긴네롯`, `사알빔`/`사알랍빈`, `나할랄`/`나할롤`, `믹므닷`/`믹므다`,
`하살수사`/`하살수심`, `에글랏셀리시야`/`에글랏 슬리시야`). 더 많이 맞는 쪽을 골랐고,
표기 이형 목록은 다음 단계 과제로 남긴다.

### F6 — 낱말 경계 규칙 (`build.py` `locate()`)

`build.py:298-360` 을 갈아 끼웠다. `find_all()` 이 이제 경계를 본다.

- **앞** (`build.py:339`): `text[s-1]` 이 한글 음절(U+AC00–U+D7A3)이면 버린다.
- **뒤** (`tail_ok()`, `build.py:309`): `e` 부터의 한글 덩어리가 ① 조사 조각의 이어붙임
  (`JOSA_OK`, `build.py:55`) ② 서술격·호격 조사 `이/여/아/야` 로 시작 ③ 지명+보통명사
  (`SUFFIX_OK`, `build.py:66`) 중 하나여야 한다.
- 겹침 "긴 것이 이긴다" 는 그대로.

**왜 ②③ 가 필요했나.** 지시받은 규칙(앞 경계 + 조사 허용목록)만 켜면 **398개**가 죽는데,
그중 상당수가 **정당한 밑줄**이었다 — `요단강`·`세일산`·`예루살렘성`·`애굽땅`·`소돔왕`·
`에덴동산`·`수산궁`(지명+보통명사), `시온이여`·`예루살렘이니라`·`고라신아`(서술격·호격),
`시돈까지리로다`·`바알 살리사에서부터`·`락굼까지요`(조사 이어붙임). 좁은 예외 셋을 더해
**−70개**로 줄였고, 그 −70 의 내역은 아래처럼 전부 확인했다.

**제거된 span 98개 / 29곳 (ko 는 그대로, 순수하게 경계 규칙 때문)**

| place_id | en | ko | 제거 | n 전→후 | 예 | 판정 |
|---|---|---|---|---|---|---|
| `a32a4f8` | Chaldea | 갈대아 | 45 | 87 → 42 | `갈대아인에게` | 사람 — 맞게 버림 |
| `af301ca` | Egypt | 애굽 | 12 | 678 → 666 | `애굽인의 손` | 사람 — 맞게 버림 |
| `a149f13` | Judea 1 | 유대 | 7 | 51 → 44 | `유대인들과` | **리뷰가 지목한 7개** — 맞게 버림 |
| `afa9d8e` | Thessalonica | 데살로니가 | 2 | 8 → 6 | `데살로니가인의 교회` | 사람 |
| `ac5a1ec` | Cush 1 | 구스 | 2 | 19 → 17 | `구스인과` | 사람 |
| `a69e1b8` | Macedonia | 마게도냐 | 2 | 26 → 24 | `마게도냐인들에게` | 사람 |
| `a282dce` | Samaria 2 | 사마리아 | 2 | 15 → 13 | `사마리아인과` | 사람 |
| `a26aa94` | Crete | 그레데 | 2 | 7 → 5 | `그레데인들은` | 사람 |
| `abffcaa` | Abel-beth-maacah | 아벨 | 2 | 5 → 3 | `아벨벧마아가` · `아벨마임` | 표기 이형 — **잃은 게 맞다**(한계) |
| `a0d784a` | Dibon 1 | 디본 | 2 | 10 → 8 | `디본갓` | **다른 지명** — 맞게 버림 |
| `a4e8401` | East Gate | 동문 | 2 | 3 → 1 | `동문지기` | 사람(문지기) |
| `aee7248`·`a81cdb5`·`ad2fadf`·`acc6d8e`·`a9cf1e8`·`a97b595`·`a83fb1e`·`ab95484`·`a3d1321` | Alexandria·Cyrene·Media·Midian·Galilee 1·Libnah 1·Laodicea·Amalek·Assyria | — | 각 1 | — | `…인` | 사람 — 맞게 버림 |
| `ab9696f` | Persia | 바사 | 1 | 30 → 29 | `바사군과` | 군대 — 버려도 무방 |
| `ae73b90` | Gilead 1 | 길르앗 | 1 | 95 → 94 | `길르앗라못` | **다른 지명**(Ramoth-gilead) — 맞게 버림 |
| `a64f355` | Bethel 1 | 벧엘 | 1 | 65 → 64 | `엘벧엘` | **다른 지명** — 맞게 버림. El-bethel 쪽이 새로 잡는다 |
| `a4aa78a` | Zobah | 소바 | 1 | 13 → 12 | `므소바 사람` | 다른 낱말 — 맞게 버림 |
| `a513646` | Dan | 단 | 1 | 26 → 25 | `워단과` | **리뷰가 지목한 `워단`** — 맞게 버림 |
| `ac5ba1a` | Senaah | 스나아 | 1 | 3 → 2 | `하스나아의` | 표기 이형(Hassenaah) |
| `a6ac675` | Moresheth-gath | 모레셋 | 1 | 3 → 2 | `가드모레셋에` | 같은 곳의 긴 표기 — **잃은 게 맞다**(한계) |
| `ac2cef0` | Kadesh-barnea | 가데스 | 1 | 24 → 23 | `가데스바네아에서` | 같은 곳의 긴 표기 — **잃은 게 맞다**(한계) |
| `af92088` | Jabesh-gilead | 야베스 | 1 | 20 → 19 | `길르앗야베스` | 같은 곳의 긴 표기 — **잃은 게 맞다**(한계) |

정당한 손실은 **넷뿐**이고(`가드모레셋` · `가데스바네아` · `길르앗야베스` · `아벨벧마아가/아벨마임`),
모두 "같은 장소의 더 긴 표기"라 한 문자열로는 둘 다 못 잡는 표기 이형 문제다. 각 장소는
짧은 표기로 여전히 19~23회 밑줄이 남는다. `인`(사람)은 리뷰 지침대로 **버리는 게 맞다** —
그래서 개역한글이 `거라사인` 으로만 적는 Gerasa 는 밑줄이 0이 되어 억제하고,
`data/derived/eras.json` 의 데가볼리 앵커에서도 뺐다(남은 앵커 `Decapolis`·`Gadara`·`Beth-shan`).

**20% 넘게 줄어든 장소**는 위 표의 Chaldea(−52%) · East Gate(−67%) · Abel-beth-maacah(−40%) ·
Dibon 1(−20%) · Moresheth-gath(−33%) · Senaah(−33%) 뿐이고, 나머지 20%+ 하락은 전부
`ko` 자체가 틀려서 오버라이드로 고친 것들이다(위 F1 표).

### F12 — 조사 제거 뒤 1음절

`josa_stripped(ko, min_len)` (`build.py:318`) · `locate(text, ko, allow_one)` (`build.py:346`).
하한은 여전히 2음절이고, **수동 오버라이드로 확정된(`conf: 1.0`) 1음절 지명**일 때만 1을 쓴다
(`load_places_ko()` 가 `one_syl` 집합을 돌려준다 — `build.py:248`). 현재 대상 3곳:
`단`(Dan, n=25) · `놉`(Nob, n=6) · `함`(Ham 1, n=1). 규칙은 스펙 "밑줄 규칙 보강" 에 적었다.

### F5 — 본문 무수정 보장

- `krv.load_bluesaurel()` 에서 `.strip()` 제거 (`spikes/00-ko-place-mapping/krv.py:60`).
  비교·정규화용 `load_yuhwan`/`load_unbound` 의 strip 은 남겼다(web 으로 나가지 않는다).
  실제로 strip 이 바꾸던 절은 **0개**였다 — 값이 아니라 계약을 고친 것.
- `build.py` 에 `read_emitted_text()` · `verify_text()` (`build.py:373`·`384`) 추가.
  산출된 `web/data/books/*/*.json` 을 **다시 읽어** 원본 JSON 문자열과 전수 대조한다:
  ① 절 키 집합(31,102) ② 절마다 문자열 완전 일치 ③ 전부 BMP(파이썬 인덱스 == JS UTF-16 인덱스)
  ④ 원본·산출물 해시를 **같은 포맷으로 계산해 둘 다 출력**. 어긋나면 `sys.exit(1)`.

```
본문 해시 원본   (sha256, 31,102절): 68d7c7e6cec9cb446a468c512b8dea6da34ce73e1f5d561948f07c4c8f1c850c
본문 해시 산출물 (sha256, 31,102절): 68d7c7e6cec9cb446a468c512b8dea6da34ce73e1f5d561948f07c4c8f1c850c
본문 무수정 검사: OK  (절 31,102 · BMP 전용 · 원본 == 산출물)
```

실패 모드도 시험했다 — 산출 JSON 의 한 절 앞에 공백 하나를 넣으니
`본문이 다른 절 1개 (예: ['Josh.10.1'])` · `해시 불일치` 로 잡혔다.

### F4 — 시대 파일

- `build.py` 가 geo 다음에 `runpy.run_path(".../03-eras/export_web.py", run_name="__main__")`
  를 부른다 (`build.py:573`). 이제 `build.py` 한 번이면 시대 3종이 항상 다시 생긴다.
- **완료 검사** `verify_files()` (`build.py:420`) — `EXPECTED_FILES` 10개(`build.py:176`)가
  있고 JSON 으로 읽히는지 확인하고, 없으면 빌드 실패.
- `spikes/03-eras/validate.py` 에 `3c)` 절 추가 (`validate.py:136`) — web 시대 파일 3개가
  있는지, `eras.json` 시대 목록이 derived 와 같은지, **장→시대 배정 1,189개가 한 장도 빠짐없이
  같은지**, Feature 68개인지, blob 마다 `rep` 가 있는지. 3개가 다 있어야 PASS.
  실패 모드 시험: `web/data/eras.json` 을 지우니
  `x web 시대 파일 없음: web/data/eras.json — build.py 가 export_web.py 를 부르지 않았다` → FAIL.

### F11 — 출처 표기 (데이터 쪽)

`build.py` 의 `ATTRIBUTION_SOURCES`(`build.py:134`) · `ATTRIBUTION_LEGACY`(`build.py:168`) 가
`{"sources": [...], "legacy": [...]}` 를 쓴다. `sources[]` 는 `text` · `author` · `url` ·
`license` · `license_url` · `changes` 여섯 필드.

| 출처 | 저작자 | 라이선스 | 변경 고지 |
|---|---|---|---|
| 성경전서 개역한글판 | 대한성서공회 | 저작재산권 만료 · 성명표시 | 없음 — 원문 그대로 |
| OpenBible.info Bible Geocoding | OpenBible.info | CC BY 4.0 | 장소 선별·좌표 대표점 선택·한글 지명 매핑 |
| STEPBible TIPNR | Tyndale House, Cambridge | CC BY 4.0 | 동명이지 식별에 사용 |
| Natural Earth 1:10m | Natural Earth | public domain | bbox 클리핑·단순화 |

`legacy` 는 옛 문자열 4개 그대로 — 06-b 가 `sources` 를 그리도록 바꿨지만, 배포본이 아직
옛 형식일 수 있으므로 양쪽을 다 둔다.

### 다시 만들고 확인한 것

```
spikes/01-web-prototype/.venv/bin/python spikes/01-web-prototype/build.py
python3 spikes/03-eras/validate.py
```

- 절 31,102 · 장 1,189 · 66권. 밑줄 mention **7,347** (겹쳐 버림 233) · 못 찾은 언급 892.
- `places.json` **918곳** · `web/data/` 파일 1,199개 · **5,898,942 B (5.63 MB)**.
- 시대 3종 존재: `eras.json` 11,432 B(시대 11) · `chapter_eras.json` 3,203 B(66권) ·
  `geo/era_regions.json` 27,506 B(Feature 68 = blob 40 + label_only 28).
- 본문 해시 원본 == 산출물 (위). 완료 검사 OK(필수 파일 10개).
- `validate.py` **PASS** — 배정 1,189 · 앵커 322/실패 0 · web 시대 3/3 · 장→시대 1,189 일치.
- **멱등**: 두 번 돌려 `places.json` · `index.json` · `attribution.json` 의 md5 동일.
- **Spike 01 sanity set 그대로**: 수 10(mention 70 · 장소 20) · 창 12(14 · 8) ·
  행 27(25 · 20) · 행 28(11 · 10) — 수치도 장소 목록도 전과 동일.
  행 27:27 `아드리아 바다`, 행 28:15 `압비오 저자`+`삼관` 도 그대로.
- 리뷰가 지목한 세 절: 계 1:9 → `밧모`, 마 11:21 → `고라신`(+벳새다·두로·시돈), 마 8:28 → `가다라`.
  행 2:14 는 `유대인들` 밑줄이 사라지고 `예루살렘` 만, 겔 27:19 는 `워단` 밑줄이 사라져 밑줄 0.

### 남은 것 · 넘긴 것

- 표기 이형(위 F1 한계) — 한 장소에 **여러 표기**를 허용하는 스키마가 필요하다. 다음 spike.
- `ko` 가 다른 장소와 같은 한글인 경우 3건(`남방` Negeb/South 1, `바벨론` Babylon 1/Babylonia,
  `앗수르` Assyria/Asshur)은 **정상**이라 두었다.
- `docs/03-prototype-spec.md` 는 데이터 스키마 절만 건드렸다 — `attribution.json` 본문,
  그리고 새 절 "밑줄 규칙 보강 — 낱말 경계", "빌드 계약". UI 절은 06-b 것.
- 노션 반영 필요 (Decisions 한 줄).
