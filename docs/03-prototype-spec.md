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
{ "books": [ { "id": "Gen", "ko": "창세기", "abbr": "창", "testament": "OT", "chapters": 50 }, ... ] }
```
- `id`는 OSIS 약어 (Gen, Exod, Lev, Num, Deut, Josh, Judg, Ruth, 1Sam, 2Sam, 1Kgs, 2Kgs, 1Chr, 2Chr, Ezra, Neh, Esth, Job, Ps, Prov, Eccl, Song, Isa, Jer, Lam, Ezek, Dan, Hos, Joel, Amos, Obad, Jonah, Mic, Nah, Hab, Zeph, Hag, Zech, Mal, Matt, Mark, Luke, John, Acts, Rom, 1Cor, 2Cor, Gal, Eph, Phil, Col, 1Thess, 2Thess, 1Tim, 2Tim, Titus, Phlm, Heb, Jas, 1Pet, 2Pet, 1John, 2John, 3John, Jude, Rev). 정경 순서.
- `ko`는 개역한글 권명, `abbr`는 한글 약어(창, 출, … 계).

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

### `attribution.json`
표시용 문자열 배열. 최소:
- "성경전서 개역한글판 © 대한성서공회"
- "Place data: OpenBible.info Bible Geocoding (CC BY 4.0)"
- "Proper names: STEPBible TIPNR (CC BY 4.0)"
- "Basemap: Natural Earth (public domain)"

## UI 스펙 (B) — Spike 02 개정 (2026-09-18)

Spike 01 의 "데스크톱 사이드 카드 + 모바일 인라인 카드 + 접힌 지도 + 크게 보기 모달"을 전부 버리고
**지도 패널 하나**로 통일했다. 지명의 밑줄도 없앴다. 데이터 스키마(위)는 그대로다.

### 레이아웃
- 상단바(높이 48px, sticky): `권 ▾` `장 ▾` 셀렉트 두 개, `‹ ›` 장 이동, 오른쪽 끝 다크모드 토글 `☾`.
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
- **데스크톱 ≥ 1200px**: 오른쪽 서랍 400px. 열리면 `body { margin-right: 400px }` 로 본문을 **밀어낸다**
  (본문 컬럼 max-width 640px 는 그대로 읽을 수 있는 폭을 유지한다).
- **태블릿 900–1199px**: 같은 서랍이 본문을 **덮는다**. 뒤에 옅은 가림막(`#scrim`), 누르면 닫힌다.
- **모바일 < 900px**: 아래에서 올라오는 시트. 높이 55vh, 위쪽에 드래그 손잡이(아래로 끌면 닫힘).
  상단바를 가리지 않는다. 닫혀 있으면 본문의 지명 버튼이 그대로 눌린다.
- 기본은 **닫힘**. 여는 길은 두 가지 — 플로팅 버튼, 그리고 **본문의 지명을 누르면 자동으로 열리고
  그 지명이 강조된다**.
- 내용은 위에서 아래로:
  1. 지도 SVG — 패널 폭을 꽉 채우고 4:3 (최소 높이 240px)
  2. 확대·축소 버튼 `+` `−` `⟲` — 지도 오른쪽 아래 모서리에 작게
  3. 지명 블록 — 한글 18px 굵게 / 영문 12px 회색 / `이 장에서 N회 · 성경 전체 M회`
  4. `#era-caption` — **빈 컨테이너**. Spike 03(시대 캡션)이 채운다. 비어 있으면 보이지 않는다
  5. 출처 한 줄 (작게)
- 선택 없음: 지도는 **이 장의 Scene**(이 장 지명 전부, 강조 없음), 지명 블록은
  "지명을 누르면 위치를 보여줍니다".
- 지명 선택 시: **그 지명 강조**(큰 점 r=5 + 14px 굵은 라벨), 같은 장의 다른 지명은 작은 점 r=3 + 12px 라벨.
- 열림/닫힘 상태는 `localStorage` 에 저장한다(try/catch, 실패해도 동작). `Esc` 로 닫는다.
  장을 옮겨도 패널 상태는 유지되고, 새 장의 Scene 으로 다시 그린다.

### 지도 렌더러 (`map.js`) — 순수 함수 `renderScene(svgEl, scene, layers, tokens, view)`
- `scene = { focus: [placeId], others: [placeId], places: {...} }`.
- `view = { z, px, py }` — 확대 배율과 이동량(viewBox 픽셀). 기본 `{ z:1, px:0, py:0 }` = scene bbox 그대로.
  `clampView` / `zoomAt` 를 같이 export 한다. 배율은 **1×–8×** 로 자르고, 이동은 내용이
  화면 밖으로 완전히 빠지지 않게 자른다.
- 투영: 등장방형(equirectangular). x = (lon − lon0)·cos(lat0), y = −(lat − lat0). Scene bbox에 맞춰 viewBox 설정.
- **bbox 규칙**: focus+others 좌표를 감싸고 25% 패딩, **최소 폭 200km**(≈ 위도 1.8°; 경도는 cos 보정), 비율 4:3으로 확장. 지명이 하나면 그 지명이 중심.
- 그리는 순서: 바다(배경 rect) → land 폴리곤 → lakes → rivers(선) → 도시 점 → 라벨.
- 스타일 토큰(CSS 변수, 라이트 기본값): `--sea #cfe3e6` `--land #f6f1e7` `--coast #a08461`(0.8px) `--river #7fa7c9`(1px) `--dot #8a5a2b` `--dot-dim #c7b8a3` `--label #2b2b2b`. 다크: `--sea #1d2a30` `--land #2a2622` `--coast #6b5a45` `--river #4c6f8f` `--dot #d9a066` `--dot-dim #5a5048` `--label #e8e2d8`.
- 라벨: 한글, 12px(focus 14px bold). focus 를 먼저 놓고 **이미 놓인 라벨과 겹치는 non-focus 라벨은
  숨기는** 탐욕 규칙.
- **확대 시 LOD**: 확대·이동은 `<g transform>` 이 아니라 **좌표를 다시 계산해서** 그린다.
  그래서 점 반지름(3/5)과 글자 크기(12/14)는 viewBox 단위로 고정 = 화면에서 항상 같은 크기이고,
  겹침 판정도 매 배율마다 화면 공간에서 다시 돈다 → **확대하면 1× 에서 숨었던 라벨이 되살아난다.**
  화면 밖(여유 8px)으로 나간 점과 라벨은 그리지 않는다.
- 색은 위 토큰만 사용. 실제 타일·이미지 없음. `geo/*`는 렌더 전에 한 번만 fetch해 캐시.
- 폴리곤이 bbox 밖으로 나가도 그냥 그린다(SVG가 clip). 성능: 장별 Scene 렌더 < 50ms 목표. land 폴리곤은 path 하나로 합쳐도 됨.
- 반환값 `{ view, labels, shown, project }` — `project(lon, lat)` 는 현재 view 기준 viewBox 좌표.

### 지도 조작 (`app.js`)
- 휠: 커서 위치를 기준으로 확대·축소. 핀치(포인터 2개): 두 손가락 중점 기준.
- 드래그(포인터 1개): 이동. 더블클릭: 1.8배 확대.
- `+` `−`: **지명이 모인 자리**(선택된 지명, 없으면 이 장 지명들의 무게중심)를 기준으로 1.6배씩.
  화면 한가운데를 기준으로 삼으면 확대할수록 지명이 화면 밖으로 밀려나기 때문이다.
- `⟲`: scene bbox 로 되돌린다. 장이 바뀌거나 선택이 바뀌면 자동으로 되돌아간다.

### 라우팅 / 상태
- URL 해시: `#Josh.10` (장), `#Josh.10/a231f80` (선택 지명 — `places.json` 키). 로드 시 해시 없으면 `#Gen.1`.
- 마지막 읽은 장·다크모드·**지도 패널 열림 여부**는 `localStorage`. 실패해도 동작.
- 장 이동 시 스크롤 맨 위.

### 접근성·기타
- 지명은 실제 `<button>`(키보드 포커스 가능, `aria-pressed`).
- 아이콘은 `‹ › ☾ ▸ + − ⟲` 로 제한. 그 밖은 글자로 쓴다.
- 모든 fetch 실패는 본문 영역에 짧은 한국어 에러로 표시.
- `console.error` 0개가 완료 조건 중 하나.
- 모바일 360px 에서 가로 스크롤이 생기지 않는다 (패널 열림/닫힘 둘 다).

## 판정 (Spike 01 종료 조건)
- 여호수아 10장 / 사도행전 27–28장 / 창세기 12장이 열리고, 지명 밑줄과 카드가 스펙대로 동작.
- Snow가 읽고 "덜 끊긴다 / 아니다"를 답한다. 그게 유일한 지표.
- RESULT.md에: 빌드 통계(절 수, mention 수, 표시 못 한 mention 수, 좌표 없는 장소 수), 알려진 결함, 스크린샷 경로.
