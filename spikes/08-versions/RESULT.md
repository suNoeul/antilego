# Spike 08 — 역본 축 · 결과

2026-09-22. 스펙: [`docs/03-prototype-spec.md`](../../docs/03-prototype-spec.md) "역본 선택" · "ESV 온라인 역본".
두 에이전트가 나눠 맡았다 — **08-a 데이터**(`web/data/**` 변환·생성), **08-b UI + ESV 함수**.

---

## 08-a — 역본 축 데이터 (KJV · BSB)

2026-09-22 · 대상 `spikes/08-versions/**`, `spikes/01-web-prototype/build.py`,
`data/derived/alt_names_en.json`, `web/data/**`, `docs/03-prototype-spec.md` "역본 축"

**판정: 된다.** 퍼블릭 도메인 영문 역본 두 종을 개역한글과 **같은 장 스키마**로 넣었고,
영어 본문에도 지명 밑줄이 붙는다. 빌드는 여전히 `build.py` 한 번이고, 끝에 스스로 검사한다.
`web/data/` 는 5.63 MB → **15.19 MB** (+9.56 MB).

### 한눈에

| | 개역한글 (krv) | KJV | BSB |
|---|---|---|---|
| 절 | 31,102 | **31,102** | **31,086** |
| 장 | 1,189 | 1,189 | 1,189 |
| 밑줄 mention | 7,347 | **7,397** | **7,480** |
| 밑줄이 붙은 장소 | 918 | 887 | 900 |
| 찾음 / OpenBible 나열 | 7,347 / 8,742 (84.0%)\* | **7,027 / 7,740 (90.8%)** | **7,154 / 7,740 (92.4%)** |
| 크기 | 5.16 MB | 4.90 MB | 4.65 MB |

\* 개역한글의 분모는 OpenBible 전체(8,742). 영문의 분모 7,740 은 `places.json` 에 있는
918곳으로 한정한 것이다 — 아래 "판단 3" 참조.

경로: `web/data/{krv,kjv,bsb}/books/{BookId}/{ch}.json`.
**개역한글을 `web/data/books/` → `web/data/krv/books/` 로 옮겼다.** 공용 파일
(`places.json` `index.json` `attribution.json` `versions.json` `eras*.json` `geo/`)은 그대로
`web/data/` 바로 밑에 있다.

### 원본과 라이선스

둘 다 **eBible.org 의 USFX**. `bash spikes/08-versions/fetch_versions.sh` (멱등, URL 고정).
`data/raw/` 는 커밋하지 않는다 — 이 스크립트가 재현 수단이다.

| 역본 | URL | sha256 (2026-09-22 받은 것) | 라이선스 (zip 안 `copr.htm` 원문) |
|---|---|---|---|
| KJV | `https://ebible.org/Scriptures/eng-kjv2006_usfx.zip` | `4ffc59aee7be6eac10ef274e1b4e245e4e720c86ede556d986216d32078e4c7d` | **Public Domain.** "The King James Version or Authorized Version of the Holy Bible, using the standardized text of 1769, protocanon only, with Strong's numbers added." |
| BSB | `https://ebible.org/Scriptures/engbsb_usfx.zip` | `7ec2e485d4127fa6b6f49a02dc1f1ab8faf7aca94294a0501cd338a66258577e` | **Public Domain.** "The Holy Bible in English: Berean Standard Bible / Contributor: BSB Publishing, LLC" |

- KJV 의 영국 특허(letters patent) 고지도 `copr.htm` 에 있다 — **영국 안에서 인쇄·수입할 때만**
  Cambridge/Oxford/Collins 의 권리가 걸린다. 영국 밖에서는 퍼블릭 도메인이고, 우리는 인쇄하지
  않는다. 그래도 사실이니 여기 남긴다.
- **외부 문의·결제·계약 없음** (AGENTS.md 2026-09-22). 두 역본 모두 공개 다운로드다.
- `web/data/attribution.json` 의 `sources[]` 에 두 줄을 더했다 (개역한글 바로 뒤).
  `changes` 는 `USFX → 절 단위 본문 · 각주 제외 · 단락 기호(¶) 제거`.

기존 `data/raw/eng-kjv.osis.xml`(seven1m/open-bibles 경유 OSIS)은 **쓰지 않았다.** 36,820절로
외경이 섞여 있고 milestone 마크업이라 파싱이 지저분하다. USFX 하나로 두 역본을 같은 코드로 읽는다.

### 본문을 어떻게 꺼냈나

`spikes/08-versions/versions.py` 의 `parse_usfx()`.

- 절 본문은 `<v …/>` 와 `<ve/>` 사이만. 권명·표제·시편 표제는 안 담는다.
- 각주 `<f>` · 상호참조 `<x>` · 그림 · 대체 절번호(`va` `vp` `cp`)는 통째로 버린다.
- KJV 의 이탤릭 보충어 `<add>` 는 **남긴다** (본문의 일부다). Strong 번호 `<w s="H…">` 는
  태그만 벗기고 낱말은 남긴다.
- Haiola 가 태그마다 넣은 줄바꿈이 있어 공백을 하나로 접는다.
- **KJV 의 단락 기호 `¶` 는 지웠다** (2,970절에 있었다). 낱말이 아니라 조판 기호이고, 읽기 화면에
  그대로 나오면 본문이 깨져 보인다. 개역한글의 "본문 무수정" 규칙은 동일성유지권 때문이고
  퍼블릭 도메인 KJV 의 조판 기호에는 걸리지 않는다 — 그래도 고친 것이니 `attribution.json` 의
  `changes` 에 적었다.

**함정 하나 — BSB 슥 12:1.** USFX 에서 이 절은 표제 요소 `<d>` **안에서 시작한다.** 표제를
통째로 버리면 절이 통째로 없어진다. 그래서 표제류는 "버린다"가 아니라 "열린 절을 닫고 안을 계속
훑는다"로 했다. 이걸 놓쳤을 때 BSB 는 31,085절이었다.

**절 수 확인.** KJV 31,102 = 개역한글과 정확히 같다. BSB 는 31,086 으로 **16절이 없다**:
마 17:21 · 18:11 · 23:14 · 막 7:16 · 9:44 · 9:46 · 11:26 · 15:28 · 눅 17:36 · 23:17 ·
요 5:4 · 행 8:37 · 15:34 · 24:7 · 28:29 · 롬 16:24. 전부 BSB 가 본문에 넣지 않는 사본 이문이다
(KJV 에는 있다). **그 절은 장 JSON 에 아예 없다** — 빈 문자열로 채우지 않았다.
읽을 때 절 번호가 건너뛰므로 UI 가 표시를 더할지는 08-b/코디네이터 판단.

**눈으로 확인 (요구된 세 절)**

| | KJV | BSB |
|---|---|---|
| 창 1:1 | In the beginning God created the heaven and the earth. | In the beginning God created the heavens and the earth. |
| 요 3:16 | For God so loved the world, that he gave his only begotten Son, … | For God so loved the world that He gave His one and only Son, … |
| 수 10:12 | … Sun, stand thou still upon Gibeon; and thou, Moon, in the valley of Ajalon. | … “O sun, stand still over Gibeon, O moon, over the Valley of Aijalon.” |

### 영어 지명 밑줄 — 규칙과 그 이유

조건 1(OpenBible 이 그 절을 나열함)은 개역한글과 같다. 조건 2만 영어식이다.
전체 규칙은 `docs/03-prototype-spec.md` "역본 축 → 영문 밑줄 규칙". 여기엔 **왜**만 적는다.

1. **이름은 소스에서 온다** — OpenBible `friendly_id`(동명이지 번호 제거) + OpenBible
   `translation_name_counts` 키 + STEPBible TIPNR 영문 표기. 그래서 한국어 쪽의 confidence
   문턱이 필요 없다. KJV 의 옛 철자는 대부분 `translation_name_counts` 와 TIPNR 이 이미 들고 있다
   (`Kirjath-jearim` · `Sion` · `Tyrus` · `Abanah`).
2. **KJV 의 합자** — `Judæa` `Cæsarea` `Galilæans` `Arimathæa` `Ænon` `Chaldæans` 등 14낱말.
   이름마다 `ae→æ` · `oe→œ` 변형을 자동으로 만들어 붙였다. 이거 없이는 가이사랴가 18절, 유대가
   22절 통째로 안 잡혔다.
3. **보통명사 거르개는 사전 없이 본문이 판정한다** — 한 낱말짜리 이름인데 그 낱말의 **소문자꼴이
   본문에 쓰이면** 버린다. 지금 걸리는 31개: `Angle Beautiful Beer Cherub East Ephah Foundation
   Guard Holiest Hollow Iron Lower Madmen Mortar Mount No North On Pavement Plain Proud Put River
   Sea Shittim Sin Skull South Straight Temple Token`. 여러 낱말 이름 안에서는 산다
   (`Salt Sea` 는 남고 `Sea` 만 죽는다). 되살릴 것은 `data/derived/alt_names_en.json` 의
   `names_cs`(대소문자를 그대로만 맞춘다)로 하나씩 근거를 적어 넣는다 — 14곳 넣었다.
4. **붙임표 합성어의 조각은 그 지명이 아니다** — `El-beth-el` 의 `beth-el`,
   `Mahaneh-dan` 의 `dan`, `Kirjath-jearim` 의 `Kirjath` 를 막는다. 아포스트로피는 경계라
   `Jerusalem’s` 에서 `Jerusalem` 만 잡힌다.
5. **대소문자 재시도** — 그대로 먼저, 그 절에서 그 장소를 하나도 못 찾았을 때만 무시하고 한 번 더.
   KJV 56절 · BSB 11절이 이걸로 잡혔고, 전부 `water gate` `corner gate` `gate of the fountain`
   `king’s high way` 처럼 **KJV 가 고유명사를 소문자로 적은 자리**였다 (전수 확인했다).
6. **한 절 · 한 장소 · 한 표기** — 대상 4:32 KJV `Etam, and Ain, Rimmon, and Tochen, and Ashan`
   에서 OpenBible 이 Ashan 의 다른 표기로 들고 있는 `Ain` 이 Ashan 으로 그어졌다(오답).
   한 절에서 같은 장소의 서로 다른 표기가 여럿 걸리면 대표 이름 하나만 쓴다. 이걸 켜면서
   KJV 7,771 → 7,397, BSB 7,837 → 7,480 으로 줄었고 **커버리지는 한 절도 안 줄었다** —
   줄어든 건 전부 `Egypt` 옆의 `Egyptians` 같은 중복이다. 같은 표기가 한 절에 여러 번이면 전부 긋는다.

### 손으로 더한 표기 — `data/derived/alt_names_en.json`

14곳. 전부 구절을 읽고 근거(`why`)를 적었다. 한 번 반복(iterate)한 결과다.

| 장소 | 더한 표기 | 왜 |
|---|---|---|
| Fountain Gate | `Gate of the Fountain` | KJV 느 2:14·3:15 `the gate of the fountain` |
| Gate of the Guard | `Prison Gate` | KJV 느 12:39 `the prison gate` |
| King’s Highway | `King’s high way` | KJV 민 20:17·21:22 (띄어 쓴다) |
| Tower of Hananel | `Tower of Hananeel` | KJV 느 3:1·12:39, 렘 31:38 |
| Tower of the Hundred | `Tower of Meah` | KJV 느 3:1·12:39 |
| Beer 1 · Beer 2 | `Beer` (대소문자 고정) | 민 21:16 · 삿 9:21 |
| Madmen · Ephah · Shittim | 같은 낱말 (대소문자 고정) | 렘 48:2 · 사 60:6 · 민 25:1 등 |
| Heliopolis | `On` (대소문자 고정) | 창 41:45·41:50·46:20 `priest of On` |
| Thebes | `No` (대소문자 고정) | KJV 렘 46:25 · 겔 30:14–16 · 나 3:8 |
| Pelusium | `Sin` (대소문자 고정) | KJV 겔 30:15–16 |
| Put | `Put` (대소문자 고정) | BSB 사 66:19 · 겔 27:10 등 |

이 반복으로 KJV 90.3% → **90.8%**, BSB 92.2% → **92.4%**, 밑줄이 붙은 장소 KJV 870 → 887 ·
BSB 893 → 900. (Thebes · Pelusium · Put 등 일부는 개역한글 쪽에서 한국어 이름이 확실하지 않아
`places.json` 에 없어서 아직 화면에 안 나온다 — 판단 3 참조.)

### 못 찾은 언급 상위 20 — 거의 다 "본문이 이름을 안 부른다"

| KJV | | BSB | |
|---|---|---|---|
| Jerusalem | 170 | Jerusalem | 164 |
| Egypt | 71 | Egypt | 59 |
| Babylon 1 | 48 | Babylon 1 | 44 |
| Negeb | 43 | Jordan | 20 |
| Jordan | 25 | East | 18 |
| Arabah | 23 | Canaan | 13 |
| East | 18 | Moab 1 | 13 |
| Assyria · Canaan · Moab 1 | 각 14 | Assyria | 11 |
| Edom | 12 | Galilee 1 | 10 |
| Bethel 1 | 11 | Samaria 1 · Jericho 1 | 각 9 |
| Nineveh · Galilee 1 | 각 10 | Edom | 9 |
| Samaria 1 · Jericho 1 | 각 9 | Chaldea | 8 |
| Tyre · Zion | 각 8 | Tyre · Bethel 1 · Nineveh · Babylonia | 각 7 |
| Babylonia | 7 | Red Sea 1 · Millo · City of David · Rome | 각 6 |
| Red Sea 1 · Rome | 각 6 | Negeb · Arabah · Zion · Shittim | 각 5 |

구절을 직접 열어 보니 **철자 문제가 아니다.** 세 갈래다.

1. **본문이 대명사·대체 표현을 쓴다.** OpenBible 은 문맥으로 그 절을 그 장소에 매단다 —
   수 10:2(예루살렘 왕이 주어인데 절 안엔 기브온만), 삼하 11:22 `the messenger … came`,
   나 1:8 `the place thereof`. 이름이 없으니 긋지 않는 게 맞다.
   (OpenBible `instance_types` 의 `name` 으로 걸러 봐도 거의 그대로였다 — KJV 90.7% ·
   BSB 92.5%. 이 필드로는 갈라지지 않는다.)
2. **역본이 보통명사로 옮겼다.** KJV 는 Negeb 을 `the south`(38절), Arabah 를 `the plain`(19절),
   East 를 `the east country` 로 적는다. BSB 는 Millo 를 `the supporting terraces`,
   Chaldea 를 `astrologers` 로 적는다. **이건 일부러 긋지 않는다** — "모호하면 보여주지 않는다".
3. **시편 표제에만 있다.** Aram-naharaim 은 시 60편 표제에만 나오는데 표제는 절이 아니다.

### 검사 (빌드가 스스로, 틀리면 실패)

```
개역한글 해시 원본/산출물 (31,102절): 68d7c7e6…c850c   무수정 검사 OK
BSB      해시 원본/산출물 (31,086절): e6c805b6…940d7   무수정 검사 OK
KJV      해시 원본/산출물 (31,102절): 121cb758…44791   무수정 검사 OK
밑줄 검사: OK  (역본 3종 · span 22,224개 · 범위·겹침·장소·장 합계)
완료 검사: OK  (필수 파일 17개)
```

- **역본마다** 산출물을 다시 읽어 로더가 준 절 사전과 전수 대조 + BMP 검사 + 해시 양쪽 출력
  (06-a 의 F5 규칙을 그대로 확장했다). 영문 두 역본 모두 BMP 밖 문자가 **없다** —
  파이썬 인덱스 == JS UTF-16 인덱스가 성립한다.
- **밑줄 검사(새것)** — 세 역본의 모든 span 이 `0 ≤ s < e ≤ len(text)`, 한 절 안에서 안 겹치고
  `s` 오름차순, `p` 가 `places.json` 에 있고, 장의 `places[].n` 합이 mention 수와 같다.
- 완료 검사 목록에 `versions.json` + 역본별 첫·끝 장 6개가 들어가 필수 파일 10 → **17**개.
- **멱등** — 두 번 돌려 `web/data/` 전체 해시가 같았다 (`9474d57e…f02f`).

### 눈으로 확인

- **수 10 (KJV)** — 요구된 10곳이 전부 있다: Jerusalem · Jericho · Gibeon · Azekah · Makkedah ·
  Libnah · Lachish · Eglon · Hebron · Debir (+ Ai · Jarmuth · Gilgal · Beth-horon ·
  Valley of Aijalon · Gezer · Kadesh-barnea · Gaza · Goshen).
- **행 27:8 (요구된 확인)** — KJV 는 `The fair havens` **소문자**로 적는다. 대소문자 재시도로
  잡았고 밑줄은 `The fair havens` 전체에 붙는다. BSB 는 `Fair Havens`, 개역한글은 `미항`.
- **창 12** — KJV 7곳 (Haran · Canaan · Shechem · Moreh · Bethel · Ai · Egypt),
  BSB·개역한글 8곳. KJV 만 하나 적은 건 Negeb 을 `the south` 로 옮겨서다 (위 갈래 2).
- **행 27 전체** — 개역한글·BSB 20곳, KJV 19곳(Syrtis 를 `the quicksands` 로 옮긴다).

### 판단 (왜 이렇게 했나)

1. **역본은 디렉토리 한 칸, 스키마는 그대로.** 장 JSON 의 모양을 바꾸지 않았다. 08-b 는
   `${DATA_BASE}${ver}/books/…` 로 접두사만 갈아끼우면 된다. 개역한글을 `krv/` 로 옮긴 건
   "기본 역본이 특별하지 않다"는 걸 경로에서도 지키려는 것이다.
2. **ESV 본문은 한 글자도 저장하지 않았다.** `versions.json` 에 `type: "online"` 메타데이터만
   있다. 저작권 있는 역본을 저장소에 넣지 않는다는 규칙의 데이터 쪽 표현이다.
3. **영문 밑줄은 `places.json` 의 918곳으로 한정했다 — 이게 이번 판단의 가장 큰 대가다.**
   `p` 가 `places.json` 에 없으면 UI 가 카드를 못 그리기 때문인데, `places.json` 은
   **한국어 이름이 확실한(conf ≥ 0.6) 장소만** 담는다. 그래서 한국어 이름이 불확실해 빠진
   243곳(언급 757개)은 KJV·BSB 에서도 밑줄이 안 붙는다 — 영어로는 이름이 분명한데도.
   고치려면 `places.json` 에 `ko: null` 인 장소를 넣어야 하고 그건 08-b 의 카드 UI 계약을
   건드린다. **다음 spike 감**이고, 이번에는 계약을 지켰다.
4. **`alt_en` 은 "다른 이름"이 아니라 "역본이 쓴 표기"다.** 영문 본문에서 실제로 그 장소로 밑줄이
   그어진 표기를 모은 것이라 이명·종족명이 섞인다(`Jerusalem` → `Jews`, `Egypt` → `Egyptians`).
   다른 장소의 대표 이름이기도 한 표기는 뺐다(예루살렘의 `Zion`). 918곳 중 512곳에 붙는다.
   UI 가 보여준다면 그 말로 적는 게 맞다. (08-b 의 ESV 지명 찾기가 이 필드를 쓴다.)
5. **크기 +9.56 MB 를 받아들였다.** 15.19 MB 는 GitHub Pages 가 통째로 받는 양이 아니라
   장 단위로 받는 양이라 실사용에는 영향이 없다 (장 하나 평균 4.5 KB). 저장소 크기는 커진다.

### 남은 것 · 다음 사람에게

- 판단 3 — 한국어 이름이 불확실한 장소를 영문에서도 살릴지. `places.json` 계약 변경이 필요하다.
- BSB 에 없는 16절을 UI 가 어떻게 보일지 (지금은 그냥 없다).
- KJV `the south`(Negeb) · `the plain`(Arabah) 류는 **의도적으로** 안 긋는다. 되살리자는 의견이
  나오면 "모호하면 보여주지 않는다" 원칙과 함께 논의할 것.
- 자세한 수치는 `data/raw/work/spike08_versions_report.json` (빌드가 매번 새로 쓴다, git 제외).
- **노션 반영 필요** — `Resources` DB 에 eBible.org KJV(eng-kjv2006) · BSB(engbsb) 두 줄,
  `Decisions` 에 "역본 축: 퍼블릭 도메인 2종을 정적으로, ESV 는 온라인 전용" 한 줄.

---

## 08-b — 역본 선택 UI + ESV 온라인 역본

2026-09-22 · Fable (Claude Code). 맡은 곳: `web/*.js` · `web/index.html` · `web/styles.css` ·
`web/data-fixture/**` · `api/**` · 스펙 UI 절.

**판정: 통과.** 헤드리스 Chrome 148 단언 전부 PASS, `console.error` · 예외 · error 로그 **0건**.
함수 단위 검사 33개 PASS (기존 피드백 36개도 그대로 PASS).

### 무엇을 만들었나

| 곳 | 무엇 |
|---|---|
| `web/index.html` | 위치 버튼 옆 역본 버튼 `#verbtn` + 메뉴 `#vermenu`, 푸터 출처 줄 `#attr-ver` |
| `web/app.js` | `versions.json` 읽기 · 역본 메뉴 · `localStorage['ver']` · `?ver=` · 역본별 장 경로 · 온라인 역본(ESV) 로딩 · 영어 지명 매칭 · 실패 화면 |
| `web/styles.css` | `.verbtn` · `.vermenu` · `.veritem` · `.ver-tag`(온라인) · `.ver-fallback` · `.verses.lang-en` · 폰 배치 |
| `api/api/esv.js` | `/api/esv?ref=Josh.10` — 66권 표 · 평문 파싱 · CORS · 레이트 리밋 · 짧은 캐시 |
| `api/test/esv-mock.mjs` | 33개 (네트워크 안 씀) |
| `web/data-fixture/**` | `versions.json` · `krv/` · `kjv/`(실제 KJV 3절) · `bsb/`(자리표시) · `alt_en` |

### 결정 다섯

**1. 역본은 주소에 넣지 않는다.** 해시 문법(`#Book.ch/<placeId>`)은 그대로고 고른 역본은
`localStorage['ver']` 에 남는다. 링크를 주고받을 때 상대가 자기 역본으로 읽는 게 맞다고 봤다.
`?ver=kjv` 는 시대 플래그처럼 **한 번 정하는** 길로만 둔다 (정해지면 저장된다).

**2. ESV 는 받아서 그리고 버린다.** 라이선스가 로컬 500절을 넘기지 말라고 한다. 그래서
지금 보고 있는 **한 장만** 메모리에 두고 `localStorage` · IndexedDB 에 **넣지 않는다.**
함수 쪽도 마지막 3장 · 60초(담긴 절 수를 세어 500 이하)만 두고 `Cache-Control: private, no-store`.
고지문은 함수가 `notice` 로 함께 내려보내고 푸터에 그대로 띄운다.

**3. 온라인 역본의 지명은 개역한글이 정한다 — 새 색인을 만들지 않았다.**
영어 본문에서 지명을 마구 찾으면 OpenBible 판정 밖의 것이 섞인다. 그래서 같은 장의 `krv`
파일을 받아 **절마다 어느 지명이 있는지**를 먼저 읽고, 그 절에 있다고 적힌 지명만
`en`·`alt_en` 으로 찾는다. 낱말 경계를 맞추고, **대소문자를 가리고**(`On` ↔ `on`),
긴 이름이 이기고, 겹치면 버린다. 동명이지 번호(`Jericho 1`)는 떼고 쓴다.

> 검증에서 이 규칙이 실제로 작동한다: 가짜 ESV 지문의 `Azekah`(개역한글 1절이 가리키지 않는다)와
> 사사기 9:4 의 `Shechem`(개역한글 4절에 지명이 없다)은 **버튼이 되지 않았다.**

**4. `versions.json` 이 없으면 물러선다.** 못 받으면 옛 배포본으로 보고 `books/…` 를 예전 그대로
읽는다. 역본 버튼은 숨고 출처 줄도 예전 그대로다. 08-a 의 데이터가 아직 안 올라갔거나
배포가 반만 넘어간 순간에도 **읽기가 멈추지 않는다.**

**5. 역본 출처 줄은 겹치면 안 띄운다.** 푸터에 `본문: <attribution>` 한 줄을 더하되,
출처 목록에 이미 같은 문장이 있으면(개역한글이 그렇다) 띄우지 않는다.

### 바뀐 화면

- 상단바: `사사기 9장 ▾` **`개역한글 ▾`** `‹ ›` … `☾`
- 메뉴 한 줄 = 이름 + 짧은 이름, 온라인 역본에는 옅은 꼬리표 `온라인`.
- 영문 역본이면 본문 글꼴만 시스템 세리프로, 줄 사이 1.9 → 1.7.
  **제목·지도·카드·피커는 언제나 한국어 그대로.**
- 폰(≤599px)에서는 메뉴를 `position: fixed` 로 화면 폭에 맞춘다 — 긴 권 이름일 때 버튼이 밀려
  메뉴가 화면 밖으로 나가고 가로 스크롤이 2px 생기는 것을 검증에서 잡아 고쳤다.

### `/api/esv`

`GET /api/esv?ref=Josh.10` → `{ ok, ref, verses:[{v,text}], notice }`.

- `ref` 는 OSIS id + 장. 함수 안의 **66권 표**가 ESV 질의 이름으로 옮긴다
  (`Josh`→`Joshua`, `1Sam`→`1 Samuel`, `Ps`→`Psalm`, `Song`→`Song of Solomon`, `Phlm`→`Philemon`).
  같은 표가 장 수도 들고 있어 `Josh.25` · `Ps.151` 은 **upstream 까지 가지 않고** 400.
- 평문 `[1] … [2] …` 을 대괄호 번호로 갈라 절을 만든다. 하나도 못 뽑으면 200 대신 **502**.
- 키 없음 → 503 `{ok:false,error:"no_key"}`. upstream 비정상 → 502 고정 문구(**로그는 상태 코드만**).
- CORS 는 `feedback.js` 와 같은 허용 목록. 레이트 리밋 IP 1분 60개(best-effort).
- 키는 Snow 가 https://api.esv.org 에서 **가입만 하면 무료**로 받는다 (결제·문의 없음 — AGENTS.md).
  키가 없는 동안에도 다른 역본은 멀쩡하고, ESV 화면에는 안내 + `개역한글로 보기` 가 뜬다.

### 검증 (헤드리스 Chrome + CDP)

`python3 -m http.server 8765`(루트 `web/`) + `Chrome --headless=new --remote-debugging-port=9222`.
`Input.dispatchMouseEvent` 로 **실제 클릭**, `Fetch.fulfillRequest` 로 `/api/esv` 를 가로채
성공·`no_key`·502·JSON 아님을 각각 만들었다. 오류는 `Runtime.consoleAPICalled(error)` ·
`Runtime.exceptionThrown` · `Log.entryAdded(error)` 를 모두 모았다.

```
cd web && python3 -m http.server 8765 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9222 --user-data-dir=/tmp/antilego-chrome-08 \
  --no-first-run --disable-gpu --hide-scrollbars about:blank &

cd spikes/08-versions/verify
node desktop.mjs   # 픽스처 1400×900 — 메뉴 · KJV · 기억 · ?ver=bsb · 키보드 · 회귀
node esv.mjs       # 픽스처 + 가짜 ESV — 지명 가늠자 · 고지문 · 저장 안 함 · 실패 셋
node legacy.mjs    # versions.json 을 404 로 만들어 옛 경로로 물러서는지
node real.mjs      # 실데이터(08-a) — krv/kjv/bsb 전환 · 시대 캡션 · 장 이동
node mobile.mjs    # 360×800 실데이터 — 가로 스크롤 0 · 메뉴 · 실패 화면

cd api && npm test  # notion-mock 36 + esv-mock 33
```

| 스크립트 | 단언 | FAIL | console.error |
|---|---:|---:|---:|
| `desktop.mjs` | 58 | 0 | 0 |
| `esv.mjs` | 27 | 0 | 0 |
| `legacy.mjs` | 16 | 0 | 0 |
| `real.mjs` | 30 | 0 | 0 |
| `mobile.mjs` | 17 | 0 | 0 |
| **합계** | **148** | **0** | **0** |
| `api/test/esv-mock.mjs` | 33 | 0 | — |

확인한 것 중 굵직한 것:

- 메뉴에 네 역본이 이름·짧은 이름·`온라인` 꼬리표까지 제대로 뜬다. 고른 역본에 `aria-checked`.
- KJV 를 고르면 `kjv/books/Josh/10.json` 에서 받아오고(리소스 타이밍으로 확인), 영문 글꼴 ·
  줄 사이 28.9px(=17×1.7), 지명 버튼은 그대로 눌리고 카드 이름은 **한국어**(`여리고`).
- 새로고침해도 KJV. `?ver=bsb` 로 한 번 정하면 쿼리를 떼도 BSB.
- ESV(가짜 응답): 절이 그려지고 지명은 개역한글이 가리키는 절에서만, `alt_en`(`Jebus`)도 잡힌다.
  `localStorage` 에 남은 키는 `last` `theme` `ver` 뿐 — **본문은 어디에도 없다.**
- `no_key` → `ESV API 키가 아직 설정되지 않았습니다` + `개역한글로 보기` (누르면 실제로 돌아간다).
  502 · JSON 아님 → `ESV 본문을 불러오지 못했습니다 (온라인 전용)`.
- 회귀: 피커(절 열) · 지도 패널 · 시대 캡션(`정복·사사 시대`) · 피드백 카드 · `‹ ›` · 다크 모드.
- 모바일 360: 상단바가 화면을 넘지 않고 `scrollWidth` 가 언제나 360.

스크린샷: [`shots/`](shots) — `b-desktop-*` · `b-real-*` · `b-mobile-*` · `b-legacy-*`.

### 알려진 것 · 남은 것

- **키가 아직 없다.** `ESV_API_KEY` 를 Vercel 에 넣고 재배포해야 ESV 가 실제로 뜬다.
  그 전까지 ESV 를 고르면 안내 + 되돌아가기 버튼이다 (다른 역본은 영향 없음).
- **배포 전 확인 하나**: `web/` 은 GitHub Pages, `api/` 는 Vercel 로 따로 올라간다.
  `/api/esv` 가 뜨기 전에 `web/` 만 먼저 올라가면 ESV 는 502 화면이 된다 — 순서는 코디네이터가 잡는다.
- 픽스처의 `bsb/books/Josh/10.json` 은 **자리표시**다. 본문을 지어내지 않았다 —
  실제 BSB 는 08-a 가 `web/data/bsb/` 로 넣는다 (넣었고, `real.mjs` 가 그것으로 검증한다).
- 역본 메뉴는 상단바(`z-index: 20`) 안에 있어 그 쌓임 맥락에 갇힌다. 지금은 메뉴와
  지도 패널이 화면에서 겹치지 않아 문제가 없지만, 패널 배치가 바뀌면 메뉴를 상단바 밖으로 빼야 한다.
- ESV 응답의 `notice` 는 400자까지만 쓴다 (화면에 그대로 붙이므로 길이를 잘라 둔다).
