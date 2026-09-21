# Spike 01 — 웹 프로토타입 스펙 (데이터 계약 + UI)

2026-09-18 · 이 문서는 에이전트 A(데이터)와 B(UI)가 공유하는 **계약**이다. 여기 적힌 스키마를 양쪽이 그대로 따른다.
바꿔야 하면 이 파일을 먼저 고치고 상대에게 알린다.

목표: Snow가 브라우저에서 아무 장이나 열어 읽으면서 "지명에서 덜 끊기는가"를 판정할 수 있게. 프레임워크 없음, 서버 없음.

## 디렉토리

```
web/
  index.html            진입점. `cd web && python3 -m http.server 8000` 으로 연다
  app.js  map.js  styles.css   (ES 모듈, 번들러 없음)
  data/                 A가 build.py로 생성. 커밋한다 (전체 ~5MB 이하 목표)
    index.json
    books/{BookId}/{chapter}.json
    places.json
    geo/land.json  geo/lakes.json  geo/rivers.json  geo/meta.json
    attribution.json
  data-fixture/         B가 개발용으로 만드는 최소 데이터 (같은 스키마). A 완료 후에도 남겨둔다
spikes/01-web-prototype/
  build.py  (+ 보조 모듈)  README.md  RESULT.md(끝나면)
```

## 데이터 스키마 (A → B)

### `index.json`
```json
{ "books": [ { "id": "Gen", "ko": "창세기", "abbr": "창", "en": "Genesis",
               "testament": "OT", "group": "율법서", "chapters": 50 }, ... ] }
```
- `id`는 OSIS 약어 (Gen, Exod, Lev, Num, Deut, Josh, Judg, Ruth, 1Sam, 2Sam, 1Kgs, 2Kgs, 1Chr, 2Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal, Matt, Mark, Luke, John, Acts, Rom, 1Cor, 2Cor, Gal, Eph, Phil, Col, 1Thess, 2Thess, 1Tim, 2Tim, Titus, Phlm, Heb, Jas, 1Pet, 2Pet, 1John, 2John, 3John, Jude, Rev). 정경 순서.
- `ko`는 개역한글 권명, `abbr`는 한글 약어(창, 출, … 계).
- `en` 은 영문 권명(Genesis … Revelation). 성경 찾기의 영문 검색과 권 목록의 부제에 쓴다 (Spike 04).
- `group` 은 권 분류. **정경 순서대로 10종**, 합계 66권 (Spike 04):
  구약 `율법서`(창–신 5) `역사서`(수–에 12) `시가서`(욥–아 5) `대선지서`(사–단 5) `소선지서`(호–말 12) ·
  신약 `복음서`(마–요 4) `사도행전`(행 1) `바울서신`(롬–몬 13) `공동서신`(히–유 8) `요한계시록`(계 1).
- `en` · `group` 의 정본 표는 `spikes/01-web-prototype/build.py` 의 `EN_NAMES` · `BOOK_GROUPS` 다.
  전체 재생성이 `data/raw/` 와 `shapefile` 을 요구하므로, 이 파일만 다시 쓸 때는
  `python3 spikes/04-picker/rebuild_index.py` (build.py 소스를 `ast` 로 읽어 표만 꺼낸다. 멱등).

### `books/{BookId}/{chapter}.json`
```json
{
  "book": "Josh", "chapter": 10,
  "verses": [
    { "v": 1, "text": "여호수아가 아이를 취하여 …",
      "mentions": [ { "s": 12, "e": 15, "p": "a231f80" } ] }
  ],
  "places": [ { "p": "a231f80", "n": 2 } ]
}
```
- `text`는 개역한글 본문 **원문 그대로** (수정 금지 — 동일성유지권). 주 본문은 `bluesaurel`.
- `s`,`e`는 `text`의 JS 문자열 인덱스 (반열림 `[s,e)`). 한글은 BMP라 code unit == 문자.
- `mentions`는 `s` 오름차순, **서로 겹치지 않음**. 겹치면 긴 것을 남긴다.
- `places`는 이 장에 등장하는 장소와 횟수. 순서는 첫 등장 순.
- **밑줄 규칙 (핵심)**: 장소 P를 절 V에 표시하는 조건은 두 가지 모두:
  1. OpenBible이 P의 언급 구절로 V를 나열함 (권위)
  2. `places.ko.json`의 P.ko(confidence ≥ 0.6)가 V.text 안에서 발견됨. 못 찾으면 흔한 조사(에서/으로/에게/에/을/를/이/가/과/와/의/로/은/는/도/까지/부터) 하나를 뗀 형태로 재시도. 그래도 없으면 **표시하지 않는다** (RESULT.md에 누락 수 보고).
  - 한 절에 같은 P가 여러 번 나오면 전부 표시.
  - 이 규칙 때문에 `단 → 브엘세바` 류 오답은 절 안에서 "브엘세바"가 있어도 OpenBible이 Dan을 그 절에 나열할 때만 문제가 되고, 그 경우에도 ko가 틀린 것이지 절이 틀린 것은 아니다. 오답 지명은 별도 수정(오버라이드) 대상.

### `places.json`
```json
{ "a231f80": { "ko": "여리고", "en": "Jericho 1", "lat": 31.87172, "lon": 35.44456, "n": 57, "conf": 0.87 }, ... }
```
- 키는 `places.ko.json`의 place_id 그대로 = OpenBible ancient id (`a` + 16진수 6자리). **mention이 하나 이상 있는 장소만** 포함.
- `lat`,`lon`은 OpenBible 대표 좌표(WGS84). 좌표가 없는 장소(지역명 등)는 제외하고 RESULT.md에 수 보고.
  좌표가 없어 `places.json`에 못 들어가는 장소는 **장 JSON의 `mentions`에서도 뺀다** — 모든 `p`는 `places.json`에서 찾을 수 있다. (A, 2026-09-18 명확화)
- `n`은 성경 전체 mention 수(밑줄 실제 생성 기준).

### `geo/*.json` — 양식화 맵 배경
- 출처 **Natural Earth 1:10m** (퍼블릭 도메인): `land` (ne_10m_land), `lakes` (ne_10m_lakes), `rivers` (ne_10m_rivers_lake_centerlines).
- bbox `[8, 24, 50, 43]` (바울의 로마 항해 — 이탈리아·시칠리아·몰타·크레테 포함. 초안의 `[25,25,50,42]`는 로마(12.5°E)를 잘라냈음) (lon_min, lat_min, lon_max, lat_max)로 클리핑, WGS84 유지, 단순화(Douglas-Peucker 등)해서 **세 파일 합계 ≤ 600KB**.
- GeoJSON FeatureCollection. rivers는 `properties.name` 유지 (요단/나일/유프라테스/티그리스 확인용).
- 갈릴리 호수·사해가 `lakes`에 들어 있어야 한다. 없으면 RESULT.md에 명시.
- `geo/meta.json`: `{ "bbox": [...], "source": "Natural Earth 1:10m v5.x", "simplify_tolerance": ... }`
- 순수 파이썬으로 어려우면 `shapely`/`pyshp` 사용 가능 (venv). 다른 소스(OSM 등)는 **쓰지 않는다** (ODbL).

### 시대 3종 (Spike 03-d) — `eras.json` · `chapter_eras.json` · `geo/era_regions.json`

정본은 `data/derived/` 쪽이고 `web/data/` 는 파생물이다. 만드는 법:

```
python3 spikes/03-eras/export_web.py     # 의존성 없음. 멱등
```

`data/derived/{eras,chapter_eras,era_regions}.json` 에서 UI 가 쓰는 필드만 뽑아
공백 없이 쓴다. 크기: **eras 11.4 KB · chapter_eras 3.2 KB · era_regions 27.5 KB**.
`bust()` 가 붙는 일반 데이터 fetch 라 `?v=` 캐시 버스팅은 자동이다.

```json
// eras.json — 11개 항목(역사 9 + primeval + undated)
{ "eras": [ { "id": "divided_kingdom", "ko": "분열왕국 시대",
              "approx": "기원전 930–586년경",
              "caption": "솔로몬 이후 나라가 …",
              "note": "이 시대의 왕 연대는 틸레…",        // 연대 논쟁. 접어 둔다
              "undated": true,                            // primeval·undated 에만 있다
              "polities": [ { "ko": "북이스라엘", "render": "blob" }, … ] } ] }

// chapter_eras.json — 66권. ranges 가 default 를 이긴다. 범위는 겹치지 않는다
{ "1Kgs": { "default": "divided_kingdom", "ranges": [[1, 11, "united_kingdom"]] }, … }

// geo/era_regions.json — Feature 68개 (blob 40 · label_only 28)
{ "type": "FeatureCollection", "features": [
  { "properties": { "era": "divided_kingdom", "polity_ko": "북이스라엘",
                    "render": "blob", "rep": [35.572, 32.559] },   // rep = 라벨 자리
    "geometry": { "type": "Polygon", … } },
  { "properties": { "era": "divided_kingdom", "polity_ko": "앗수르 제국",
                    "render": "label_only" },
    "geometry": { "type": "Point", "coordinates": [43.15, 36.36] } } ] }
```

- `render` 는 **두 가지뿐**이다: `blob`(폴리곤) · `label_only`(이름만). 03-b 의 `wash` 는 없앴다.
- `rep` 는 blob 의 대표점(가장 큰 폴리곤의 면적중심, 폴리곤 밖이면 그 높이 가로선의 가장 긴
  내부 구간 중점). 브라우저가 매 렌더마다 계산하지 않게 내보낼 때 한 번 구한다.
- `undated`/`primeval` 시대에는 Feature 가 **하나도 없다.** UI 는 그것을 정상으로 다룬다.
- 상세와 판단 근거는 `spikes/03-eras/RESULT.md`.

### `attribution.json`
표시용 문자열 배열. 최소:
- "성경전서 개역한글판 © 대한성서공회"
- "Place data: OpenBible.info Bible Geocoding (CC BY 4.0)"
- "Proper names: STEPBible TIPNR (CC BY 4.0)"
- "Basemap: Natural Earth (public domain)"

## UI 스펙 (B) — Spike 02 개정 (2026-09-18), 02-b 다듬기 (2026-09-18), 02-c 패널 리사이즈 (2026-09-21)

Spike 01 의 "데스크톱 사이드 카드 + 모바일 인라인 카드 + 접힌 지도 + 크게 보기 모달"을 전부 버리고
**지도 패널 하나**로 통일했다. 지명의 밑줄도 없앴다. 데이터 스키마(위)는 그대로다.
02-b 에서 지도 세부(이름 없는 점·크기·이동 범위·가장자리·라벨 자리)와 캐시 버스팅을 손봤다.

### 레이아웃
- 상단바(높이 48px, sticky): **현재 위치 버튼 `#loc`**(`사사기 9장` + 아주 작은 쉐브론 — `▸` 를 90° 돌린 것),
  `‹ ›` 장 이동, 오른쪽 끝 다크모드 토글 `☾`. 셀렉트는 없다 (Spike 04 에서 `성경 찾기` 로 바뀌었다).
- 본문은 **한 컬럼**. max-width 640px, 화면 가운데.
- 하단에 attribution 한 줄 (작게).
- 지도는 화면 오른쪽의 **패널 하나**뿐이다 (아래 "지도 패널").

### 본문
- 글꼴: 본문 `"Noto Serif KR", serif` (Google Fonts 링크; 오프라인이면 시스템 serif), UI는 시스템 sans.
- 본문 17px / line-height 1.9 / 절 번호는 11px 회색 상첨자, 절마다 새 문단.
- **지명**: `<button class="place">` — **밑줄 없음**. `text-decoration` 도 `border-bottom` 도 두지 않는다.
  색만 토큰 `--accent` 로 다르게 한다. hover 는 아주 옅은 배경(`--hl-soft`),
  선택된 지명(`aria-pressed="true"`)은 배경 하이라이트(`--hl`).
- 절 텍스트는 `text`를 `mentions`로 잘라 렌더링. **텍스트 자체를 바꾸지 않는다.**

### 플로팅 버튼 (`#btn-map`)
- 화면에 고정. 데스크톱·태블릿은 오른쪽 가장자리 세로 중앙(왼쪽만 둥근 알약),
  모바일(< 900px)은 오른쪽 아래. 아이콘이 아니라 글자 — 닫혔을 때 `지도`, 열렸을 때 `닫기`.
- `aria-expanded` 로 상태를 알린다. 패널이 열리면 버튼이 패널 가장자리로 옮겨 붙어
  (데스크톱·태블릿 `right: 400px`, 모바일 시트 위) 계속 닿는다.

### 지도 패널 (`#panel`) — 화면에 하나뿐
- **데스크톱 ≥ 1200px**: 오른쪽 서랍, 기본 400px. 열리면 `body { margin-right: var(--panel-w) }` 로
  본문을 **밀어낸다** (본문 컬럼 max-width 640px 는 그대로 읽을 수 있는 폭을 유지한다).
  **패널 왼쪽 가장자리를 끌어 넓힐 수 있다 (02-c).** 아래 "패널 폭" 참고.
- **태블릿 900–1199px**: 같은 서랍이 본문을 **덮는다**. 뒤에 옅은 가림막(`#scrim`), 누르면 닫힌다.
- **모바일 < 900px**: 아래에서 올라오는 시트. 높이 55vh, 위쪽에 드래그 손잡이(아래로 끌면 닫힘).
  상단바를 가리지 않는다. 닫혀 있으면 본문의 지명 버튼이 그대로 눌린다.
- 기본은 **닫힘**. 여는 길은 두 가지 — 플로팅 버튼, 그리고 **본문의 지명을 누르면 자동으로 열리고
  그 지명이 강조된다**.
- 내용은 위에서 아래로:
  1. 지도 SVG — 폭은 패널 안쪽을 꽉 채우고, 높이는 `min(폭 × 0.75, 창 높이 × 0.7)` (02-c).
     좁은 패널에서는 4:3 그대로이고, 아주 넓힐 때만 높이가 막혀 가로로 길어진다.
  2. 확대·축소 버튼 `+` `−` `⟲` — 지도 오른쪽 아래 모서리에 작게
  3. 지명 블록 — 한글 18px 굵게 / 영문 12px 회색 / `이 장에서 N회 · 성경 전체 M회`
  4. `#era-caption` — 시대 캡션 한 줄 (03-d, 아래)
  5. 출처 한 줄 (작게)
- 선택 없음: 지도는 **이 장의 Scene**(이 장 지명 전부, 강조 없음), 지명 블록은
  "지명을 누르면 위치를 보여줍니다".
- 지명 선택 시: **그 지명 강조**(큰 점 r=4 + 13px 굵은 라벨), 같은 장의 다른 지명은 작은 점 r=2 + 11px 라벨.
  (02-b 에서 5/14/3/12 → 4/13/2/11 로 줄였다. 화면에서의 크기는 배율과 무관하게 고정.)
- 열림/닫힘 상태는 `localStorage` 에 저장한다(try/catch, 실패해도 동작). `Esc` 로 닫는다.
  장을 옮겨도 패널 상태는 유지되고, 새 장의 Scene 으로 다시 그린다.

### 패널 폭 (02-c) — 큰 화면에서만 끌어 넓힌다

큰 화면에서 지도가 400px 에 갇혀 있을 이유가 없다. **밀어내기 모드(≥ 1200px)에서만**
패널 왼쪽 가장자리를 끌어 넓힌다. 덮기(900–1199px)와 모바일 시트는 그대로다.

- **손잡이**: 패널 왼쪽 가장자리. 집는 자리 6px(`cursor: col-resize`), 그 안에 가는 1px 선
  (평소 `--line`, hover·드래그 중 `--accent`). 플로팅 `닫기` 버튼은 있던 자리 그대로이고
  계속 눌린다 — 손잡이 `z-index`(44)를 버튼(45)보다 낮게 두어 버튼이 이긴다.
  Pointer Events 하나로 마우스·터치·펜을 같이 받고, 끄는 동안 `user-select: none`.
- **범위**: 최소 **400px**, 최대 `window.innerWidth − 640(본문) − 2×24(여백) − 48(숨 쉴 자리)`.
  드래그 중에도, 창 크기가 바뀔 때도 이 범위로 자른다. **본문 컬럼은 640px 아래로 내려가지 않는다.**
- **기억**: `localStorage['panelW']`(try/catch). 손잡이를 **더블클릭하면 400px** 로 돌아온다.
  `⟲` 는 폭을 건드리지 않는다 — 그건 시야(배율·이동)만 되돌린다.
  창이 좁아지면 패널은 따라 줄지만 저장값은 그대로여서, 다시 넓어지면 원래 폭으로 돌아온다.
- **글자는 커지지 않는다.** 패널을 넓혀도 라벨 11/13px, 점 r 2/4 는 화면에서 그대로다.
  넓어진 화면에서 겹침 판정이 다시 돌아 **숨어 있던 라벨이 더 나타난다**(LOD 규칙 그대로).
  높이가 `0.7 × 창 높이` 에 막히면 화면 비율이 가로로 길어져 보이는 범위도 실제로 넓어진다.
- 키보드: 손잡이에 포커스를 두고 `←`/`→` 24px 씩, `Home` 이면 400px.

### 지도 렌더러 (`map.js`) — 순수 함수 `renderScene(svgEl, scene, layers, tokens, view)`
- **화면 크기는 상수가 아니다 (02-c).** `renderScene` 이 `svgEl.clientWidth/clientHeight` 를 재서
  그 픽셀 값을 그대로 `viewBox="0 0 w h"` 이자 `width`/`height` 속성으로 쓴다 — **SVG 를 픽셀 크기로
  그린다.** 그래야 글자가 CSS 로 늘어나지 않는다(패널을 넓혀도 11px 는 11px). 화면 공간 계산
  (라벨 겹침·점 반지름·이동 한계 25%·`fitFocus` 여백·가장자리 fade)은 전부 이 실측 크기로 돈다.
  `app.js` 가 렌더 직전에 인라인 `width`/`height` 를 픽셀로 박아 CSS 상자와 viewBox 를 1:1 로 맞춘다.
  틀 계산은 `sceneFrame(scene, W, H)` · 이동 한계는 `frameBounds(frame, layers)` 로 떼어 두었고,
  둘 다 DOM 을 만지지 않는 순수 함수다 — `app.js` 가 리사이즈 직전에 "새 크기의 틀"을 미리 구해
  **배율(z)은 그대로 두고 화면 중심이 같은 지점을 가리키도록 `px`·`py` 만 옮긴다**(장면이 튀지 않는다).
  리사이즈 렌더는 `requestAnimationFrame` 으로 묶는다(드래그 한 번에 렌더 한 번).
  `clampView(view, bounds)` 가 쓰는 화면 크기는 `bounds` 가 같이 들고 다닌다(`bounds.W/H`).
- `scene = { focus: [placeId], others: [placeId], places: {...} }`.
- `view = { z, px, py }` — 확대 배율과 이동량(viewBox 픽셀). 기본 `{ z:1, px:0, py:0 }` = scene bbox 그대로.
  `clampView(view, bounds)` / `zoomAt(view, cx, cy, factor, bounds)` 를 같이 export 한다.
  배율은 **1×–8×** 로 자른다.
- **이동 범위 (02-b)**: scene bbox 는 **처음 그림(⟲ 복귀)만 정한다.** 이동은 어느 배율에서든
  `geo/meta.json` 의 bbox(`[8, 24, 50, 43]`) 전체를 돌아다닐 수 있다 — **1× 에서도 끌 수 있다.**
  다만 화면의 **25%** 에는 지형이 남도록 자른다(빈 공간으로 나가지 못한다).
  `renderScene` 이 그 범위를 viewBox 픽셀로 계산해 `bounds` 로 돌려주고, `app.js` 가 그것을
  `clampView`/`zoomAt` 에 넘긴다. `layers.bbox` 가 없으면 `map.js` 의 `GEO_BBOX` 기본값.
- **focus 는 언제나 통째로 보인다 (02-b)**: 지명을 선택했을 때(그리고 ⟲ 로 되돌렸을 때)
  focus 의 점 + 라벨이 여백 24px 안에 들어오도록 **배율은 그대로 두고 최소한으로 이동**한다
  (`app.js` 의 `fitFocus`, 최대 3회 반복 — 라벨 자리가 바뀌면 다시 잰다).
- 투영: 등장방형(equirectangular). x = (lon − lon0)·cos(lat0), y = −(lat − lat0). Scene bbox에 맞춰 viewBox 설정.
- **bbox 규칙**: focus+others 좌표를 감싸고 25% 패딩, **최소 폭 200km**(≈ 위도 1.8°; 경도는 cos 보정), **화면 비율(W:H)** 로 확장. 지명이 하나면 그 지명이 중심.
- 그리는 순서: 바다(배경 rect) → land 폴리곤 → lakes → rivers(선) → 도시 점 → 라벨.
- 스타일 토큰(CSS 변수, 라이트 기본값): `--sea #cfe3e6` `--land #f6f1e7` `--coast #a08461`(0.8px) `--river #7fa7c9`(1px) `--dot #8a5a2b` `--dot-dim #c7b8a3` `--label #2b2b2b`. 다크: `--sea #1d2a30` `--land #2a2622` `--coast #6b5a45` `--river #4c6f8f` `--dot #d9a066` `--dot-dim #5a5048` `--label #e8e2d8`.
- 라벨: 한글, 11px(focus 13px bold). focus 를 먼저 놓고 **이미 놓인 라벨과 겹치는 non-focus 라벨은
  숨기는** 탐욕 규칙.
- **이름 없는 점은 그리지 않는다 (02-b).** 라벨을 놓지 못한 non-focus 지명은 **점도 그리지 않는다.**
  점과 이름은 언제나 함께 나타나고 함께 사라진다. 어느 배율에서든 non-focus `circle` 수 == `text` 수.
  focus(선택된 지명)는 예외 — 언제나 그린다.
- **라벨 자리 (02-b)**: 점의 아래 → 위 → 오른쪽 → 왼쪽 순으로 자리를 찾는다. 네 자리 모두
  화면 안(여백 8px)에 통째로 들어가지 못하거나 이미 놓인 라벨과 겹치면 그 지명은 그리지 않는다.
  **잘린 라벨은 없다.**
- **확대 시 LOD**: 확대·이동은 `<g transform>` 이 아니라 **좌표를 다시 계산해서** 그린다.
  그래서 점 반지름(3/5)과 글자 크기(12/14)는 viewBox 단위로 고정 = 화면에서 항상 같은 크기이고,
  겹침 판정도 매 배율마다 화면 공간에서 다시 돈다 → **확대하면 1× 에서 숨었던 라벨이 되살아난다.**
  화면 밖(여유 8px)으로 나간 점과 라벨은 그리지 않는다.
- **가장자리 fade (02-b)**: 지도 SVG 네 변에 24px 안쪽 그라디언트를 덮어(`.map-wrap::after`,
  `--panel-bg` → `--panel-bg-0`, `pointer-events: none`) 액자가 아니라 "더 있다"로 읽히게 한다.
  라이트·다크 토큰 양쪽에 `--panel-bg` / `--panel-bg-0`(같은 색의 alpha 0)을 둔다.
- 색은 위 토큰만 사용. 실제 타일·이미지 없음. `geo/*`는 렌더 전에 한 번만 fetch해 캐시.
- 폴리곤이 bbox 밖으로 나가도 그냥 그린다(SVG가 clip). 성능: 장별 Scene 렌더 < 50ms 목표. land 폴리곤은 path 하나로 합쳐도 됨.
- 반환값 `{ view, labels, shown, project, bounds, focusBox, regions, W, H, x0, y0, su }` —
  `project(lon, lat)` 는 현재 view 기준 viewBox 좌표. `W`/`H` 는 이번에 그린 픽셀 크기,
  `x0`/`y0`/`su` 는 틀(리사이즈 때 중심을 붙드는 데 쓴다).

### 지도 조작 (`app.js`)
- 휠: 커서 위치를 기준으로 확대·축소. 핀치(포인터 2개): 두 손가락 중점 기준.
- 드래그(포인터 1개): 이동. 더블클릭: 1.8배 확대.
- `+` `−`: **지명이 모인 자리**(선택된 지명, 없으면 이 장 지명들의 무게중심)를 기준으로 1.6배씩.
  화면 한가운데를 기준으로 삼으면 확대할수록 지명이 화면 밖으로 밀려나기 때문이다.
- `⟲`: scene bbox 로 되돌린다(그 다음 `fitFocus`). 장이 바뀌거나 선택이 바뀌면 자동으로 되돌아간다.

### 캐시 버스팅 (02-b)

GitHub Pages 는 10분 캐시를 준다. 새 `index.html` 과 옛 `app.js` 가 섞이면 흰 화면이 나온다
(2026-09-18 실제로 겪었다). 그래서 **모든 자기 자원에 `?v=` 를 붙인다.**

- 저장소의 소스에는 리터럴 `__V__` 가 그대로 남는다 — `styles.css?v=__V__`, `app.js?v=__V__`,
  `app.js` 안의 `import './map.js?v=__V__'`, 그리고 `const V = '__V__'` 로 만든 `bust()` 가
  **데이터 JSON 경로에도** 붙인다(`web/data` 만 다시 배포해도 옛 것이 안 나오게).
- `.github/workflows/pages.yml` 이 업로드 **직전에** 체크아웃 사본에서만
  `sed -i "s/__V__/${GITHUB_SHA::7}/g" web/index.html web/app.js` 로 커밋 SHA 앞 7자리로 바꾼다.
- 로컬에서는 `__V__` 그대로여도 동작한다(그냥 쿼리 문자열이다).
- 확인: `curl -s https://sunoeul.github.io/antilego/ | grep -o 'app.js?v=[0-9a-f]*'`.

### 시대 캡션 · 영역 레이어 (Spike 03-d)

데이터는 위 "시대 3종". **모호하면 보여주지 않는다**(AGENTS.md)를 UI 에서 지키는 자리다.

#### 캡션 `#era-caption` — 인라인 한 줄

```
분열왕국 시대 · 기원전 930–586년경 — 솔로몬 이후 나라가 … 눌러온다. (대략적인 구분)
```

- 지명 블록 **바로 아래**. 12px, `opacity: .7`, sans. 본문보다 확실히 약하게.
- 조각: `.era-name`(굵게) `·` `.era-date` `—` `.era-text` `.era-approx`(11px).
- **시대명을 누르면 `note`(연대 논쟁)가 한 줄 아래로 펼쳐진다.** 기본 접힘,
  `aria-expanded`. `note` 가 없으면 시대명은 버튼이 아니라 그냥 글자다.
- `undated: true`(원시사·시대 불특정)면 **캡션 전체를 숨긴다.** "시대 불특정"이라고
  띄우지 않는다. 시대 데이터를 못 받았을 때도 마찬가지로 숨긴다(에러 문구 없음).

#### 영역 레이어 — 기본 숨김, 토글로 켠다

- 지도 조작 줄에 글자 버튼 `시대`(`#z-era`, `aria-pressed`). 기본 꺼짐,
  `localStorage['eraLayer']` 에 기억한다.
- 켜면 지도 **왼쪽 위**에 `대략` 배지(10px pill). 이 장의 시대에 그릴 영역이 하나도 없으면
  지도 아래 한 줄: "이 장은 시대를 특정하지 않아 영역을 표시하지 않습니다"(12px, 옅게).
- 그리는 순서: 바다 → land → **시대 영역(blob)** → lakes → rivers →
  영역 표시(빈 동그라미) → 영역 이름 → 지명 점 → 지명 라벨.
- `blob`: 채움 22–26%(`--region-a/b/c` 3색 순환) + 같은 색 진한 **점선** 테두리 1px
  (`stroke-dasharray: 2 2`, `vector-effect: non-scaling-stroke`). **실선 금지** — 국경으로 읽힌다.
  겹침은 겹친 채로 둔다. 라벨은 `rep` 좌표에 10px `--label-dim` weight 400.
- `label_only`: **빈 동그라미 r=3**(1px) + 같은 10px 이름. 폴리곤 없음.
- **라벨 우선순위는 지명이 위**다. 지명 라벨이 먼저 자리를 잡고, 영역 이름은 남은 자리에서
  같은 탐욕 규칙으로 고른다. 자리가 없으면 그리지 않는다 — `label_only` 는 동그라미까지
  사라진다(이름 없는 표시는 없다, 02-b 규칙 그대로). 확대하면 겹침이 풀려 되살아난다.
- 크기는 배율과 무관하게 화면에서 고정(10px / r=3 / 1px). 영역은 지도와 함께 확대·이동한다.
- 토큰: `--label-dim`, `--region-a/b/c`, `--region-a/b/c-line` (라이트·다크 양쪽).

### 성경 찾기 (Spike 04) — 권·장·절

상단바의 셀렉트 두 개를 대신한다. 한 벌의 DOM(`#picker`, `role="dialog"`)이 폭에 따라 성격만 바꾼다.
여는 길은 셋 — `#loc` 버튼, `/`, `g`(입력 칸에 포커스가 없을 때). `Esc` · 바깥 클릭 · `×` 로 닫힌다.
**`Esc` 는 지도 패널보다 피커가 먼저 받는다.**

#### 데스크톱 ≥ 900px — 상단바 아래 팝오버
- `top: 상단바 + 8px`, 가운데 정렬, 폭 `min(880px, 100vw − 32px)`, 1px 테두리 + 옅은 그림자.
- 1줄: 검색 입력 `#pick-q` (자동 포커스, placeholder `책 이름 · 약어 · 영문 · 예: 삿 9:3`).
- 2줄: **[성경권] [장] [절]** 3열. 열 머리는 10px 옅은 글자이고, 장·절 머리에는 어느 권의
  숫자인지 옅게 덧붙인다 (`장 · 창세기`).
  - **성경권**: `group` 별 섹션 머리(옅게) + 권 한 줄 = **약어 칩 + 한글 + 영문(12px, 옅게)**.
    선택된 권은 배경(`--hl`), 지금 읽는 권은 한글이 `--accent`, 키보드 커서는 1px 테두리.
    열이 스크롤되고 선택은 늘 보이게 둔다.
  - **장**: 숫자 격자(한 줄 5–6개). **누르면 바로 옮긴다**(`#Book.N`). 피커는 열린 채로 있고 절 열이 찬다.
  - **절**: 그 장의 절 수만큼. **해시 문법은 건드리지 않는다** — 누르면 그 절로 스크롤하고
    2초 동안 `.verse-hl` 로 표시한 뒤 닫는다. 절 수는 장 JSON 에서 센다(읽고 있는 장은 이미 받은 것을 쓴다).

#### 모바일 < 900px — 전체 화면 시트
- `inset: 0`, `z-index: 60` — **지도 시트(40)와 플로팅 버튼(45) 위**에 앉는다.
- 머리: `← 뒤로`(1단계에서는 숨김) · breadcrumb `사사기 › 9장` · `×`.
- 검색 입력, 그 아래 **초성 칩 줄** `ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ`(가로로 넘치면 그 줄만 스크롤).
  켜진 칩은 `ㄱ ×` 로 보이고 다시 누르면 풀린다. **칩과 입력은 곱해진다.**
  칩 줄은 권 목록만 거르므로 2·3단계에서는 감춘다.
- 단계: 권 → 장 → 절. 장을 누르면 바로 옮기고(뒤 본문이 바뀐다) 절 단계로 간다. `← 뒤로` 로 되돌아간다.
- **360px 에서 가로 스크롤이 생기지 않는다.**

#### 검색 규칙
`parseQuery` 가 **끝에 붙은 숫자만** 장·절로 가른다(`1co` 의 `1` 은 글자 쪽에 남는다):
`삿 9:3` · `9:3` · `9 3` · `9.3` · `고전 9` · `9`.

- **한글 초성**: 낱자 자음(`ㄱ`)은 그 자리 글자의 **초성**과, 완성 음절(`사`)은 **그 글자 그대로**
  비교하는 접두 일치. 초성은 `U+AC00` 기준 `(code − 0xAC00) / 588` 로 19개 표에서 꺼내고
  쌍자음은 홑자음으로 접는다. **약어와 한글 이름 둘 다**에 재고 결과를 합쳐 **정경 순서**로 돌려준다.
  `ㄱ` → 겔·고전·고후·갈·골·계 · `ㅅㅅ` → 사사기·사무엘상 · `사` → 삿·삼상·삼하·사(이사야)·행.
- **영문**: `en` 과 OSIS `id` 에 대한 대소문자 무시 접두 일치. `en` 은 공백·기호를 지우고 잰다
  (`1 Corinthians` → `1corinthians`, 그래서 `1co` 가 맞는다).
- **정확히 한 권**으로 좁혀지면 그 권을 골라 둔다(장 열이 찬다). **옮기지는 않는다.**
- 일치가 없으면 `일치하는 책이 없습니다` (옅은 글자).

#### 키보드
`↑`/`↓` 커서 이동 · `Enter` 적용(권만 → 1장, 권+장 → 그 장, 절까지 → 그 장 + 절로 스크롤 후 닫기) ·
`Tab` 입력 → 성경권 → 장 → 절 → `×` → 입력 · `Esc` 닫기.

#### 토큰
칩 색이 이 앱의 **유일한 새 색**이다. 구약은 파랑 계열, 신약은 빨강 계열, 둘 다 낮은 채도로.
라이트 `--chip-ot-bg #e3ecf5` / `--chip-ot-fg #2b4f7e` · `--chip-nt-bg #f6e3e1` / `--chip-nt-fg #8a3b32`,
다크 `#1f2c3b` / `#9cb8d8` · `#3a2523` / `#e0a29a`. 네 조합 모두 대비 **6 : 1** 이상.
그림자는 `--pick-shadow` 하나뿐이다.

### 라우팅 / 상태
- URL 해시: `#Josh.10` (장), `#Josh.10/a231f80` (선택 지명 — `places.json` 키). 로드 시 해시 없으면 `#Gen.1`.
- 마지막 읽은 장·다크모드·**지도 패널 열림 여부**는 `localStorage`. 실패해도 동작.
- 장 이동 시 스크롤 맨 위.

### 접근성·기타
- 지명은 실제 `<button>`(키보드 포커스 가능, `aria-pressed`).
- 아이콘은 `‹ › ☾ ▸ + − ⟲ × ← ›` 로 제한. 그 밖은 글자로 쓴다.
  상단바 위치 버튼의 쉐브론은 새 글리프를 들이지 않고 `▸` 를 90° 돌려 쓴다.
- 모든 fetch 실패는 본문 영역에 짧은 한국어 에러로 표시.
- `console.error` 0개가 완료 조건 중 하나.
- 모바일 360px 에서 가로 스크롤이 생기지 않는다 (패널 열림/닫힘 둘 다).

## 판정 (Spike 01 종료 조건)
- 여호수아 10장 / 사도행전 27–28장 / 창세기 12장이 열리고, 지명 밑줄과 카드가 스펙대로 동작.
- Snow가 읽고 "덜 끊긴다 / 아니다"를 답한다. 그게 유일한 지표.
- RESULT.md에: 빌드 통계(절 수, mention 수, 표시 못 한 mention 수, 좌표 없는 장소 수), 알려진 결함, 스크린샷 경로.
