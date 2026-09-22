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

**2026-09-21 (리뷰 F11) 부터 빌드가 객체 형식으로 쓴다.** CC BY 4.0 은 이름만으로 모자라고
저작자 · 원본 링크 · 라이선스 링크 · **변경 고지**가 있어야 한다.

```json
{ "sources": [ { "text": "OpenBible.info Bible Geocoding", "author": "OpenBible.info",
                 "url": "https://www.openbible.info/geo/", "license": "CC BY 4.0",
                 "license_url": "https://creativecommons.org/licenses/by/4.0/",
                 "changes": "장소 선별·좌표 대표점 선택·한글 지명 매핑" }, … ],
  "legacy": ["성경전서 개역한글판 © 대한성서공회", … ] }
```

- `sources[]` 가 정본. 여섯 필드(`text` `author` `url` `license` `license_url` `changes`)를
  모두 쓴다. 퍼블릭 도메인·저작권 만료면 `license_url` 은 `null`.
- 네 출처: 개역한글(대한성서공회 · 저작재산권 만료·성명표시 · 변경 `없음 — 원문 그대로`) ·
  OpenBible.info(CC BY 4.0) · STEPBible TIPNR(Tyndale House, Cambridge · CC BY 4.0 ·
  `동명이지 식별에 사용`) · Natural Earth(public domain · `bbox 클리핑·단순화`).
- `legacy` 는 옛 문자열 배열 그대로. UI 가 `sources` 로 옮겨 간 뒤에도 당분간 둔다.
- 정본 표는 `spikes/01-web-prototype/build.py` 의 `ATTRIBUTION_SOURCES` · `ATTRIBUTION_LEGACY`.
- UI 가 두 형식을 어떻게 고르고 그리는지는 아래 "출처 표기 (06-b)" 참조.

옛 형식 (아직 배포본에 남아 있을 수 있다) — 표시용 문자열 배열. 최소:
<!-- 06-b: 링크·라이선스·변경 고지를 담는 객체 형식이 추가됐다. 두 형식 모두 UI 가 받는다 —
     아래 "출처 표기 (06-b) — `attribution.json` 두 형식" 참조. -->
- "성경전서 개역한글판 © 대한성서공회"
- "Place data: OpenBible.info Bible Geocoding (CC BY 4.0)"
- "Proper names: STEPBible TIPNR (CC BY 4.0)"
- "Basemap: Natural Earth (public domain)"

### 밑줄 규칙 보강 — 낱말 경계 (2026-09-21, 리뷰 F6·F12)

위 "밑줄 규칙 (핵심)" 의 조건 2 는 단순 부분문자열 찾기였다. 그래서 `유대인` 안의 `유대`,
`워단` 안의 `단`, `바벨론` 안의 `바벨` 이 전부 지명으로 표시됐다. 후보 span `[s, e)` 는
이제 **둘 다** 통과해야 남는다.

1. **앞** — `text[s-1]` 이 한글 음절(U+AC00–U+D7A3)이면 버린다. 지명은 어절 처음에서 시작한다.
   죽는 예: 겔 27:19 `워[단]`, 대상 11:47 `므[소바]`, 창 35:7 `엘[벧엘]`.
2. **뒤** — `e` 부터 이어지는 한글 덩어리(공백·문장부호 전까지)가 셋 중 하나면 받는다.
   - a) **조사 조각의 이어붙임**으로 전부 쪼개진다:
     `에 / 에서 / 으로 / 로 / 에게 / 을 / 를 / 이 / 가 / 과 / 와 / 의 / 은 / 는 / 도 / 까지 /
     부터 / 이나 / 나 / 이며 / 며 / 이라 / 라 / 이요 / 요 / 에는 / 에서는 / 으로는 / 이라도 /
     라도 / 보다 / 처럼 / 같이 / 마다 / 조차 / 부터는 / 에게서 / 으로부터 / 이든 / 든 / 만 /
     뿐 / 마저 / 밖에 / 여 / 아 / 야 / 니 / 니라 / 더라 / 로다 / 로서 / 으로서 / 리라 / 리로다 / 란 / 이란`.
     이어붙임을 허용하므로 `…에서부터` · `…까지요` · `…까지리로다` 도 통과한다.
   - b) **서술격·호격 조사**로 시작한다 (`이` `여` `아` `야`) — 마 11:21 `고라신아`, 사 52:1 `시온이여`.
   - c) **지명 + 보통명사**로 시작한다:
     `산 / 강 / 성 / 땅 / 왕 / 국 / 골 / 섬 / 들 / 못 / 샘 / 굴 / 문 / 해 / 속 / 길 / 궁 / 등 /
     동산 / 골짜기 / 성읍 / 광야 / 산지 / 지방 / 바다 / 시내 / 평지 / 고개 / 수풀 / 언덕 / 사람 / 거민`.
     `요단강` · `세일산` · `예루살렘성` · `애굽땅` · `소돔왕` · `에덴동산` · `수산궁` 은 여전히 그 지명이다.
   - 그 밖은 버린다. **`인` 은 일부러 넣지 않았다** — `유대인` · `갈대아인` · `거라사인` 은
     사람이지 장소가 아니다. 그래서 개역한글이 `거라사인` 으로만 적는 Gerasa 는 밑줄이
     하나도 남지 않는다 (정상 — 오버라이드로 억제하고 시대 앵커에서도 뺐다).
- "긴 것이 이긴다"는 겹침 규칙은 그대로다.
- **1음절 지명 (F12)** — 조사를 뗀 뒤 남아야 하는 길이 하한은 2다. 예외는 **수동 오버라이드로
  확정된(`conf: 1.0`) 1음절 지명**뿐이고, 그때만 1음절 후보를 쓴다. 자동 매핑이 조사를 떼다가
  우연히 1음절이 되는 경우는 여전히 버린다. 현재 대상은 `단`(Dan) · `놉`(Nob) · `함`(Ham).
- 규칙의 정본은 `build.py` 의 `JOSA_OK` · `SUFFIX_OK` · `tail_ok()` · `find_all()` 이다.

### 빌드 계약 (2026-09-21, 리뷰 F4·F5)

`spikes/01-web-prototype/build.py` **한 번**이 `web/data/` 전부를 만든다. 이 스크립트는
`web/data/` 를 통째로 지우고 다시 쓰므로 시대 3종도 반드시 같은 실행 안에서 만들어야 한다.

- 차례: 본문 → `books/` → `index.json` → `places.json` → `attribution.json` → `geo/`
  → **`spikes/03-eras/export_web.py`(시대 3종)** → 검증.
- **본문 무수정 보장 (F5)** — 빌드 끝에 `web/data/books/*/*.json` 을 **다시 읽어** 원본 JSON
  문자열과 전수 대조한다. ① 절 키 집합이 같다(31,102) ② 절마다 문자열이 완전히 같다
  (strip·정규화 없음) ③ 모든 문자가 BMP 안이다 — 그래야 파이썬 인덱스 == JS UTF-16 인덱스라
  `s`/`e` 가 맞는다 ④ 원본 해시 == 산출물 해시. 해시는 `osisID \t text \n` 을 이어붙인
  sha256 이고 **양쪽을 같은 포맷으로 계산해 둘 다 찍는다.** 하나라도 어긋나면 `sys.exit(1)`.
  주 로더 `krv.load_bluesaurel()` 은 `.strip()` 도 하지 않는다 (동일성유지권).
- **완료 검사 (F4)** — `index.json` · `places.json` · `attribution.json` · `eras.json` ·
  `chapter_eras.json` · `geo/{land,lakes,rivers,meta,era_regions}.json` 10개가 있고 JSON 으로
  읽히는지 확인한다. 하나라도 없으면 빌드 실패.
- `spikes/03-eras/validate.py` 도 web 시대 파일 3개를 검사한다 — 있는지, 장→시대 배정
  1,189개가 `data/derived` 와 한 장도 빠짐없이 같은지, Feature 68개인지, blob 마다 `rep` 가
  있는지. 셋 중 하나라도 없으면 FAIL.

### 역본 축 (Spike 08-a, 2026-09-22) — `versions.json` · `{ver}/books/…`

읽는 역본을 고를 수 있게 데이터에 축을 하나 더 뒀다. **장 스키마는 바뀌지 않는다** — 역본마다
같은 모양의 `books/` 가 하나씩 있을 뿐이다.

```
web/data/
  versions.json               역본 목록 (아래)
  krv/books/{BookId}/{ch}.json   개역한글 — **`books/` 에서 여기로 옮겼다**
  kjv/books/{BookId}/{ch}.json   King James Version
  bsb/books/{BookId}/{ch}.json   Berean Standard Bible
  places.json  index.json  attribution.json  eras.json  chapter_eras.json  geo/   ← 역본과 무관, 공유
```

UI 는 `${DATA_BASE}${ver}/books/{BookId}/{ch}.json` 을 읽는다. `web/data/books/` 는 더 이상 없다.

#### `versions.json`
```json
{ "default": "krv",
  "versions": [
    { "id": "krv", "name": "개역한글", "short": "개역한글", "lang": "ko", "type": "static",
      "attribution": "성경전서 개역한글판 © 대한성서공회" },
    { "id": "kjv", "name": "King James Version", "short": "KJV", "lang": "en", "type": "static",
      "attribution": "King James Version (public domain)" },
    { "id": "bsb", "name": "Berean Standard Bible", "short": "BSB", "lang": "en", "type": "static",
      "attribution": "Berean Standard Bible (public domain, CC0)" },
    { "id": "esv", "name": "English Standard Version", "short": "ESV", "lang": "en", "type": "online",
      "attribution": "Scripture quotations are from the ESV® Bible …, © 2001 by Crossway. Used by permission.",
      "attribution_url": "https://www.esv.org",
      "note": "온라인 전용 — 읽을 때마다 ESV API에서 받아옵니다" } ] }
```
- `type: "static"` 은 위 경로에 본문이 있다. `type: "online"` 은 **저장소에 본문이 한 글자도 없다** —
  ESV 는 메타데이터(이름·출처 문구)뿐이고 본문은 읽을 때마다 ESV API 에서 받는다.
  저작권 있는 역본을 저장소에 넣지 않는다는 규칙(AGENTS.md)의 데이터 쪽 표현이다.
- 배열 순서가 곧 표시 순서. 정본은 `spikes/08-versions/versions.py` 의 `VERSIONS`.

#### 영문 본문 (KJV · BSB)
- 원본은 eBible.org 의 USFX (`eng-kjv2006` · `engbsb`), 둘 다 **퍼블릭 도메인**.
  받는 법은 `bash spikes/08-versions/fetch_versions.sh` (멱등, URL 고정).
- 절은 `<v …/>` 와 `<ve/>` 사이만 담는다 — 각주 `<f>` · 상호참조 `<x>` · 표제 · 시편 표제는 뺀다.
  KJV 의 이탤릭 보충어 `<add>` 는 본문의 일부라 **남긴다**. KJV 의 단락 기호 `¶` 는 낱말이 아니라
  조판 기호라 지운다. 공백은 하나로 접는다.
- 절 수: KJV 31,102 (개역한글과 같다) · BSB 31,086. BSB 에 없는 16절은
  마 17:21 · 18:11 · 23:14 · 막 7:16 · 9:44 · 9:46 · 11:26 · 15:28 · 눅 17:36 · 23:17 ·
  요 5:4 · 행 8:37 · 15:34 · 24:7 · 28:29 · 롬 16:24 — BSB 가 본문에 넣지 않는 사본 이문이다.
  **그 절은 장 JSON 에 아예 없다** (빈 문자열로 채우지 않는다).
- `s`,`e` 는 개역한글과 똑같이 JS(UTF-16) 인덱스다. 두 역본 모두 BMP 밖 문자가 없음을 빌드가 검사한다.

#### 영문 밑줄 규칙
조건 1(OpenBible 이 그 절을 나열함)은 개역한글과 같다. 조건 2만 영어식으로 바꾼다.

1. **이름 목록** — 장소마다 세 소스를 합친다.
   ① OpenBible `friendly_id` 의 기본형 (`Beer 1` → `Beer`)
   ② OpenBible `translation_name_counts` 의 키 (역본별 표기가 여기 다 있다 — `Abanah` · `Tyrus`)
   ③ STEPBible TIPNR 의 영문 표기 (`Kirjath-jearim` · `Sion` · `Kiriath-baal`)
   ④ `data/derived/alt_names_en.json` — 손으로 확인해 더한 표기
   KJV 1769 의 합자(`Caesarea` → `Cæsarea`, `Judaea` → `Judæa`)는 자동으로 만들어 붙인다.
2. **이름꼴 거르개** — 대문자로 시작하면 받는다. 소문자로 시작해도 여러 낱말이고 그중 하나가
   대문자면 받는다 (KJV `tower of Hananeel` · `wilderness of Sin`). 고유명사가 하나도 없는
   번역어(`wood` · `stone` · `the fair havens`)는 버린다.
3. **보통명사 거르개** — 한 낱말짜리 이름인데 그 낱말의 **소문자꼴이 본문에 쓰이면** 버린다.
   사전 없이 본문 스스로 가려낸다. 지금 걸리는 31개: `Angle Beautiful Beer Cherub East Ephah
   Foundation Guard Holiest Hollow Iron Lower Madmen Mortar Mount No North On Pavement Plain
   Proud Put River Sea Shittim Sin Skull South Straight Temple Token`. **여러 낱말 이름 안에서는
   그대로 산다** — `Salt Sea` 는 남고 `Sea` 만 죽는다. 되살려야 하는 것은
   `alt_names_en.json` 의 `names_cs`(대소문자를 그대로만 맞춘다)로 하나씩 근거를 적어 넣는다.
4. **낱말 경계** — 앞뒤가 라틴 글자가 아니어야 하고, **붙임표 합성어의 조각이면 안 된다**:
   `El-beth-el` 의 `beth-el`, `Mahaneh-dan` 의 `dan`, `Kirjath-jearim` 의 `Kirjath` 는 죽는다.
   아포스트로피는 경계라 `Jerusalem’s` 에서 `Jerusalem` 만 잡힌다.
5. **대소문자** — 그대로 먼저 찾고, 그 장소를 그 절에서 하나도 못 찾았을 때만 무시하고 한 번 더
   찾는다. KJV 행 27:8 `The fair havens` (BSB `Fair Havens`) 가 이 재시도로 잡힌다.
6. **한 절 · 한 장소 · 한 표기** — 한 절에서 같은 장소의 서로 다른 표기가 여럿 걸리면 대표 이름
   (없으면 가장 긴 것) 하나만 쓴다. 대상 4:32 `Etam, and Ain, Rimmon, and Tochen, and Ashan` 에서
   OpenBible 이 Ashan 의 다른 표기로 들고 있는 `Ain` 까지 긋는 걸 막는다. 같은 표기가 한 절에
   여러 번 나오면 **전부** 긋는다.
7. **겹침** — 긴 것이 이긴다. 개역한글과 같은 규칙.
8. 한국어와 달리 **confidence 문턱이 없다** — 이름이 본문 소스(OpenBible·TIPNR)에서 직접 온다.
   대신 **밑줄을 다는 장소는 `places.json` 에 있는 918곳으로 한정한다**: `p` 가 `places.json` 에
   없으면 UI 가 카드를 못 그리기 때문. 한국어 이름이 확실하지 않아 빠진 장소는 영문에서도 빠진다.

#### `places.json` 의 `alt_en`
```json
{ "a58735e": { "ko": "가이사랴", "en": "Caesarea", "lat": …, "lon": …, "n": …, "conf": …,
               "alt_en": ["Cæsarea"] } }
```
- **영문 역본 본문에서 실제로 이 장소로 밑줄이 그어진 표기** 중 `en` 과 다른 것 (KJV·BSB 합집합).
  `places.json` 의 918곳 중 512곳에 붙는다.
- 다른 장소의 대표 이름이기도 한 표기는 뺐다 (예루살렘의 `Zion` — 혼동한다).
- 표기 그대로라 이명·종족명이 섞인다 (`Jerusalem` → `Jews`, `Egypt` → `Egyptians`).
  UI 가 보여준다면 "다른 이름"이 아니라 **"역본이 쓴 표기"** 로 적는 게 맞다.

#### 빌드 계약에 더해진 것
- 진입점은 여전히 `build.py` 하나다. `spikes/08-versions/versions.py` 를 `build_geo` 처럼 부른다.
- 차례: 본문 → `krv/books/` → `index.json` → **영문 역본(`kjv/` `bsb/` `versions.json`)** →
  `places.json`(`alt_en` 포함) → `attribution.json` → `geo/` → 시대 3종 → 검증.
- 검증이 셋 늘었다.
  ① **역본마다** 본문 해시·재독해 전수 대조·BMP 검사 (개역한글과 같은 포맷으로 둘 다 찍는다).
  ② **밑줄 검사** — 세 역본의 모든 span 이 `0 ≤ s < e ≤ len(text)`, 한 절 안에서 안 겹치고
     `s` 오름차순, `p` 가 `places.json` 에 있고, 장의 `places[].n` 합이 mention 수와 같다.
  ③ 완료 검사에 `versions.json` 과 역본별 첫·끝 장 6개가 들어갔다 (필수 파일 17개).

## UI 스펙 (B) — Spike 02 개정 (2026-09-18), 02-b 다듬기 (2026-09-18), 02-c 패널 리사이즈 (2026-09-21), 05-b 피드백 (2026-09-21), 06-b 리뷰 반영 (2026-09-21)

Spike 01 의 "데스크톱 사이드 카드 + 모바일 인라인 카드 + 접힌 지도 + 크게 보기 모달"을 전부 버리고
**지도 패널 하나**로 통일했다. 지명의 밑줄도 없앴다. 데이터 스키마(위)는 그대로다.
02-b 에서 지도 세부(이름 없는 점·크기·이동 범위·가장자리·라벨 자리)와 캐시 버스팅을 손봤다.

### 레이아웃
- 상단바(높이 48px, sticky): **현재 위치 버튼 `#loc`**(`사사기 9장` + 아주 작은 쉐브론 — `▸` 를 90° 돌린 것),
  `‹ ›` 장 이동, 오른쪽 끝 다크모드 토글 `☾`. 셀렉트는 없다 (Spike 04 에서 `성경 찾기` 로 바뀌었다).
- **`‹ ›` 권 경계 (06-b).** 권의 첫 장에서 `‹` 는 **앞 권의 마지막 장**으로, 마지막 장에서 `›` 는
  **다음 권의 1장**으로 간다 (출 1 `‹` → 창 50, 창 50 `›` → 출 1). 성경의 양 끝(창 1 `‹`,
  계 22 `›`)에서는 버튼이 꺼져 있고 눌러도 움직이지 않는다.
  계산은 `web/nav.js` 의 순수 함수 `stepRef(index, book, ch, dir)` 하나가 하고 — DOM 도 전역도 쓰지
  않는다 — `app.js` 의 `step()` 은 결과를 해시에 옮기기만 한다. 66권 앞뒤 경계 130건 회귀 테스트는
  `spikes/06-review-fixes/b-nav-test.mjs` (Node 로 바로 실행).
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
- **Spike 05-b 부터 알약이 둘이다.** `#btn-map` 과 `#btn-fb`(`피드백`)를 묶음 `.fabs` 에 넣어
  자리는 묶음이 잡고 `.fab` 은 모양만 맡는다. 아래 "피드백" 참고.

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
- **다시 그리는 것은 프레임당 한 번 (06-b).** 휠·드래그·핀치는 `state.view` 를 이벤트마다 그대로
  갱신하되, SVG 를 실제로 다시 그리는 일만 `requestAnimationFrame` 하나로 묶는다 — 언제나 **최신
  view** 로 한 번. 리사이즈(`scheduleRelayout`)와 같은 방식이다. 버튼(`+` `−` `⟲`)과 더블클릭은
  한 번뿐이라 그냥 즉시 그린다.

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

### 성경 찾기 (Spike 04, 07-a 개정 2026-09-22) — 권·장·절

**장을 눌러도 옮기지 않는다** (2026-09-22, Snow — Spike 04 의 "장 클릭 시 바로 이동" 을 뒤집었다).
권 → 장 → 절을 다 고르고 **절을 눌렀을 때 화면이 한 번** 바뀐다. 장까지만 보고 싶으면
데스크톱은 장 격자에서 `Enter`, 모바일은 절 단계 맨 위의 `N장 처음부터 보기` 다 —
둘 다 그 장 **1절**로 옮기고 피커를 닫는다.

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
  - **장**: 숫자 격자(한 줄 5–6개). **누르면 고르기만 한다** — 해시도 뒤의 본문도 그대로다.
    절 열이 그 장의 절 수만큼 차고, 열 머리가 `절 · 사사기 9장` 이 된다. 방금 누른 숫자로
    포커스를 돌려주므로 이어지는 `Enter` 가 **그 장 1절**로 옮기고 닫는다.
  - **절**: 그 장의 절 수만큼. **해시는 그 장(`#Book.N`)으로 바뀌고**, 그 절로 스크롤한 뒤
    2초 동안 `.verse-hl` 로 표시하고 닫는다. 같은 장이면 해시를 건드리지 않고 스크롤만 한다.
    절 수는 장 JSON 에서 센다(읽고 있는 장은 이미 받은 것을 쓴다).
    **못 받으면** 절 열에 `절 목록을 불러오지 못했습니다` 를 띄우고, `Enter` ·
    `N장 처음부터 보기` 로 나가는 길은 그대로 열어 둔다.

#### 모바일 < 900px — 전체 화면 시트
- `inset: 0`, `z-index: 60` — **지도 시트(40)와 플로팅 버튼(45) 위**에 앉는다.
- 머리: `← 뒤로`(1단계에서는 숨김) · breadcrumb `사사기 › 9장` · `×`.
- 검색 입력, 그 아래 **초성 칩 줄** `ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅅ ㅇ ㅈ ㅊ ㅋ ㅌ ㅍ ㅎ`(가로로 넘치면 그 줄만 스크롤).
  켜진 칩은 `ㄱ ×` 로 보이고 다시 누르면 풀린다. **칩과 입력은 곱해진다.**
  칩 줄은 권 목록만 거르므로 2·3단계에서는 감춘다.
- 단계: 권 → 장 → 절. 장을 누르면 **절 단계로 넘어가기만 한다** — 해시도 뒤 본문도 그대로다.
  절 단계 맨 위에 작은 글자 링크 `N장 처음부터 보기` (그 장 1절로 옮기고 닫는다 — 데스크톱 `Enter` 와 같은 길).
  절을 누르면 옮기고 스크롤한 뒤 닫는다. `← 뒤로` 로 되돌아간다.
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
- 입력에 **장을 적었으면**(`삿 9`) `Enter` 는 적용이다 — 그 장 1절로 옮기고 닫는다.
  `삿 9:3` 은 3절로 스크롤한 뒤 닫는다. 장을 적지 않았으면(`삿`) 고르기만 하고 장 격자로 포커스를 넘긴다.
- 일치가 없으면 `일치하는 책이 없습니다` (옅은 글자).

#### 키보드
`↑`/`↓` 커서 이동 · `Tab` 입력 → 성경권 → 장 → 절 → `×` → 입력 · `Esc` 닫기.

`Enter` 는 **어디에 포커스가 있느냐**로 갈린다 (07-a):

| 포커스 | `Enter` |
|---|---|
| 입력 — `삿 9:3` | 사사기 9장으로 옮기고 3절로 스크롤, 닫는다 |
| 입력 — `삿 9` | 사사기 9장 1절로 옮기고 닫는다 |
| 입력 — `삿` (장이 없다) | 사사기를 골라 두고 장 격자로 포커스. **옮기지 않는다** |
| 성경권 열 | 그 권을 골라 두고 장 격자로 포커스. **옮기지 않는다** |
| 장 격자 | **그 장 1절로 옮기고 닫는다** — "장만" 보는 길 |
| 절 격자 | 그 절로 옮기고 스크롤, 닫는다 (버튼 기본 동작 = 클릭) |

#### 토큰
칩 색이 이 앱의 **유일한 새 색**이다. 구약은 파랑 계열, 신약은 빨강 계열, 둘 다 낮은 채도로.
라이트 `--chip-ot-bg #e3ecf5` / `--chip-ot-fg #2b4f7e` · `--chip-nt-bg #f6e3e1` / `--chip-nt-fg #8a3b32`,
다크 `#1f2c3b` / `#9cb8d8` · `#3a2523` / `#e0a29a`. 네 조합 모두 대비 **6 : 1** 이상.
그림자는 `--pick-shadow` 하나뿐이다.

### 피드백 (Spike 05-b) — 알약 하나 + 카드 하나

읽다가 "여기 틀렸는데요" 를 **읽던 자리에서** 보낸다. 받은 글은 `api/` 의 Vercel 함수를 거쳐
Notion `📮 Feedback` DB 로 간다 (요청·응답 계약은 [`api/README.md`](../api/README.md)).

#### 버튼 `#btn-fb`

지도 알약 `#btn-map` 과 **같은 식구**다. 둘을 묶음 `.fabs` 에 넣어 자리는 묶음이 잡고
`.fab` 은 모양만 맡는다.

- **데스크톱·태블릿 ≥900px**: 오른쪽 가장자리 세로 중앙에 **세로로** 쌓인다 — `지도` 위, `피드백` 아래.
- **모바일 <900px**: 오른쪽 아래에 **가로로** (`flex-direction: row-reverse` — DOM 순서는 그대로여도
  `지도` 가 오른쪽, `피드백` 이 그 왼쪽).
- 지도 패널이 열리면 **둘이 함께** 패널 가장자리로 옮겨 붙는다 (`body.panel-open .fabs`).
- 글자는 언제나 `피드백` 이다(지도 알약처럼 바뀌지 않는다). `aria-expanded` 로 상태를 알린다.
  **단축키는 없다** — `/` 와 `g` 는 성경 찾기가 쓴다.

#### 카드 `#fb-card` — `z-index: 70`

피커(60) · 플로팅 알약(45) · 지도 패널(40) **위**에 앉는다.

- **데스크톱 ≥900px**: 알약 옆 **360px 팝오버**. `right: 84px`, 아래끝을 알약 묶음 아래끝에 맞춘다.
  패널이 열리면 `right: calc(var(--panel-w) + 84px)` 로 같이 옮겨 붙는다.
- **모바일 <900px**: 전체 폭 **바닥 시트** (`left:0; right:0; bottom:0`, 위 모서리만 둥글게).

칸은 위에서 아래로:

1. **위치 줄** `#fb-loc` — `위치: 사사기 9장 21절 · 브엘  ×`. 12px, 옅게.
   문자열은 `<권 한글> <장>장` + (보이는 첫 절이 있으면 ` <절>절`) + (지명을 골랐으면 ` · <한글>`).
   **보이는 첫 절**은 `.verse` 중 상단바 아래에서 시작하는 첫 것이고, 절 하나가 화면보다 길면
   화면 위로 지나간 마지막 절을 쓴다. `×` 를 누르면 줄이 사라지고 `loc` 가 **빈 문자열**로 나간다.
   카드를 다시 열면 지금 자리로 새로 채워진다.
2. **이름** `#fb-name` — `maxlength=40`, placeholder `이름 (선택)`.
   `localStorage['fbName']` 에 기억한다(try/catch). 보낸 뒤에도 남는다.
3. **내용** `#fb-text` — `maxlength=2000`, 5줄로 시작해 **12줄까지** 자란다.
   placeholder `읽다가 느낀 점, 이상한 지명, 지도에서 헷갈린 것…`. **빈 칸으로 시작한다.**
4. **허니팟** `#fb-hp` — 눈에 안 보이는 칸(1×1 clip), `tabindex="-1"`, `autocomplete="off"`.
5. **알림 줄** `#fb-msg` (`role="status"`), **버튼 줄** — `복사해서 보내기`(실패했을 때만) ·
   `취소` · `보내기`(내용이 비었거나 보내는 중이거나 429 잠금이면 눌리지 않는다).

**위치를 따로 한 줄로 뽑은 이유.** 내용 칸에 위치를 반투명한 글자로 미리 박아 두는 길도 있었지만
(뒤에 `<div>` 거울을 깔아 접두사만 옅게 칠하는 식), 그러면 사용자가 그 글자를 지우거나 가운데를
고쳤을 때 "어디까지가 위치인가" 를 계속 다시 재야 하고, 노션으로 가는 `loc` 도 본문과 섞인다.
**위치 줄을 따로 두면** 주인장이 말한 것("기본으로 현재 위치가 적혀 있고, 원하면 지우고 처음부터")을
그대로 지키면서 `loc` 가 깨끗하게 남는다. 그래서 이쪽을 골랐다.

#### 보내기

`app.js` 의 `const FEEDBACK_URL = 'https://antilego-api.vercel.app/api/feedback'`.
`AbortController` 로 **8초** 제한을 건다.

```json
{ "name": "눈", "text": "…", "loc": "사사기 9장 21절 · 브엘",
  "url": "https://sunoeul.github.io/antilego/#Judg.9/a520374",
  "device": "데스크톱", "hp": "", "ts": "2026-09-21T03:59:31.029Z" }
```

`device` 는 `matchMedia` 로 고른다 — **폰 <600px · 태블릿 <1024px · 데스크톱**.
(함수가 아는 이름은 이 셋뿐이고 그 밖은 `모름` 으로 저장된다.) `ts` 는 보내기만 하고
**시각은 서버가 찍는다**.

| 결과 | UI |
|---|---|
| `200 {ok:true}` | `고맙습니다. 잘 받았습니다.` → **2초 뒤 닫힘**. 내용만 비우고 **이름은 남긴다** |
| 그 밖(네트워크 실패·시간 초과·비200·`ok:false`) | 서버가 준 `error`, 없으면 `보내지 못했습니다.` **글은 지우지 않는다** + `복사해서 보내기` 가 나타난다 |
| `429` | 위와 같고 **`보내기` 를 60초 동안 잠근다** |

**복사 폴백.** `복사해서 보내기` 는 아래 한 줄을 클립보드에 넣고 `복사됨 — 카톡 등으로 보내 주세요`
를 띄운다. `navigator.clipboard` 가 막히면 숨은 `textarea` + `execCommand('copy')` 로 물러선다.

```
[Antilego 피드백] 위치: 사사기 9장 21절 · 브엘 / 이름: 눈 / 내용: 브엘 점이 안 보입니다
```

#### 보내는 중 잠금 (06-b)

보내는 동안은 `#fb-send` 뿐 아니라 **내용 · 이름 · 위치 `×` 까지 잠근다**(`disabled`, `opacity: .6`).
응답을 기다리는 사이에 쓴 글이 성공 응답에 지워지는 일을 애초에 만들지 않기 위해서다.
`취소` · `×` 는 잠그지 않는다 — 닫는 길은 항상 열려 있어야 한다.
성공해서 내용 칸을 비울 때도 **보낼 때 찍어 둔 값과 지금 값이 같을 때만** 비운다(한 겹 더).
실패하면 글은 손대지 않는다(전과 같다). 잠금이 풀리면 내용 칸에 있던 포커스를 돌려준다.

#### 닫는 길 · 키보드

`Esc` · `취소` · `×` · **데스크톱에서 바깥 클릭**(`mousedown`). 바깥 클릭만 포커스를 되돌리지
않는다 — 누른 자리에 그대로 둔다. 나머지는 `#btn-fb` 로 포커스가 돌아온다.
**`Esc` 는 피드백 카드가 피커보다 먼저 받는다** (70 > 60).
데스크톱에서는 열면 내용 칸에 포커스가 간다. **모바일은 자동 포커스하지 않는다** — 열자마자
키보드가 올라와 시트를 덮기 때문이다(성경 찾기와 같은 판단).

#### 푸터

출처 줄 아래에 한 줄을 더 둔다 (11px, `opacity: .8`, 선은 한 번만 긋는다):
`읽다가 이상하면 오른쪽 '피드백' 버튼을 눌러 주세요.`

#### 토큰

**새 색은 없다.** 카드는 피커와 같은 `--card` · `--line` · `--pick-shadow`,
`보내기` 는 `--accent` 바탕에 `--bg` 글자(플로팅 알약과 같은 조합)다.

### 출처 표기 (06-b) — `attribution.json` 두 형식

CC BY 4.0 은 이름만으로 모자란다. 원본 링크 · 라이선스 링크 · **변경 고지**가 있어야 한다.
그래서 `attribution.json` 이 **객체**를 담을 수 있게 하고, UI 는 두 형식을 다 받는다.

```jsonc
// 새 형식 — sources 가 있으면 이것을 쓴다 (같은 뜻으로 items 도 받는다)
{ "sources": [ { "text": "STEPBible TIPNR",
                 "author": "Tyndale House, Cambridge",
                 "url": "https://github.com/STEPBible/STEPBible-Data",
                 "license": "CC BY 4.0",
                 "license_url": "https://creativecommons.org/licenses/by/4.0/",
                 "changes": "동명이지 식별에 사용" } ],
  "legacy": ["…"] }          // 옛 문자열도 함께 둔다 (다른 곳에서 쓸 수 있게)

// 옛 형식 — 배열이면 그대로 문자열로 그린다
["성경전서 개역한글판 © 대한성서공회", "…"]
```

- 고르는 순서: `Array.isArray(data)` → 문자열 배열 · `data.sources ?? data.items` → 객체 ·
  `data.legacy` → 문자열 배열. 어느 쪽도 없으면 빈 줄.
  **배포본이 아직 옛 배열이어도 화면이 깨지지 않는다.**
- 푸터(`#attr-line`)는 출처 하나를 `이름 (저작자, 라이선스) — 변경: …` 로 그린다. `url` ·
  `license_url` 이 있으면 그 자리가 링크가 되고, 링크는 `target="_blank" rel="noopener"` 로 새 탭에 연다.
  **저작자가 이름 안에 이미 들어 있으면 두 번 쓰지 않는다** (`OpenBible.info Bible Geocoding` ←
  저작자 `OpenBible.info`). 이름에 없는 저작자는 반드시 남긴다 — TIPNR 의 `Tyndale House, Cambridge`.
  여전히 **옅은 글씨 한 줄**이고, 좁아지면 줄바꿈한다 (색은 본문 글자색을 빌려 밑줄만 옅게).
- 지도 패널(`#panel-attr`)은 자리가 좁으니 **짧은 형태 그대로** — 이름만 ` · ` 로 이어 붙인다.
  링크는 푸터 한 곳에만 둔다.

### 라우팅 / 상태
- URL 해시: `#Josh.10` (장), `#Josh.10/a231f80` (선택 지명 — `places.json` 키).
  로드 시 해시가 없으면 **유효한 `last` 를 먼저 쓰고, 없거나 망가졌으면 `#Gen.1`**.
- 마지막 읽은 장·다크모드·**지도 패널 열림 여부**는 `localStorage`. 실패해도 동작.
  (`last` `theme` `panel` `panelW` `eraLayer` `fbName`)
- 장 이동 시 스크롤 맨 위.
- **해시 검증 (06-b).** 정규식을 통과해도 그것만으로는 받아들이지 않는다. `index.json` 에 맞춰
  **알려진 권 + `1 ≤ ch ≤ chapters`** 를 `nav.js` 의 `isValidRef(index, book, ch)` 로 확인한다.
  통과하지 못하면 (`#Foo.999` · `#Gen.0` · `#Gen.999` · 형식이 깨진 해시) `state` 에도
  `localStorage['last']` 에도 쓰지 않고, 본문에 기존 한국어 에러를 띄운 뒤
  **마지막 유효한 위치 → 유효한 `last` → `#Gen.1`** 순서로 되돌아간다.
  되돌릴 때는 `location.replace` 라서 히스토리에 칸이 생기지 않는다 — 뒤로를 눌러도 잘못된
  주소로 갔다가 다시 튕기는 고리가 없다. 부팅 때 읽는 저장된 `last` 도 같은 함수로 검증한다.
  그래서 `localStorage['last']` 에는 유효한 참조만 남는다.
- **장 요청 토큰 (06-b).** 장을 실제로 부를 때마다 단조 증가하는 토큰을 하나 잡는다.
  응답이 돌아왔을 때 토큰이 이미 바뀌었으면 — 더 새로운 장을 요청했다는 뜻이므로 —
  **상태·DOM·스크롤·선택 어느 것도 건드리지 않고 그대로 버린다**. 실패 문구도 띄우지 않는다.
  본문을 그리는 것은 이긴 응답 하나뿐이라, 응답 순서가 뒤집혀도 다른 장의 본문이 섞이지 않는다.
  토큰은 `changed` 일 때만 올린다 — 같은 장을 가리키는 `apply()`(부팅 직후 해시 이벤트가 한 번 더
  오는 경우)가 이미 떠 있는 요청을 죽이지 않게 하려는 것이다.

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
