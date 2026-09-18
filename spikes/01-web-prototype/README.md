# Spike 01 — 웹 프로토타입 · 데이터 빌드 (A)

`web/data/` 트리 전체를 만드는 빌드. 계약은 [`docs/03-prototype-spec.md`](../../docs/03-prototype-spec.md)
의 "데이터 스키마 (A → B)" 절이다. 스키마를 바꾸려면 그 문서를 먼저 고친다.

결과 수치는 [RESULT.md](RESULT.md) 의 `## A · 데이터 빌드 결과`.

## 돌리는 법

```bash
# 0) 의존성 (한 번)
uv venv spikes/01-web-prototype/.venv
uv pip install --python spikes/01-web-prototype/.venv/bin/python shapely pyshp

# 1) 원본 수집 (멱등. 이미 있으면 건너뜀)
bash spikes/00-ko-place-mapping/fetch.sh      # 개역한글 본문 + OpenBible + TIPNR
bash spikes/01-web-prototype/fetch_geo.sh     # Natural Earth 1:10m 물리 레이어
#   둘 다 --force 로 재다운로드

# 2) 빌드
spikes/01-web-prototype/.venv/bin/python spikes/01-web-prototype/build.py
```

약 2초. 끝에 요약을 찍는다. **멱등** — 두 번 돌리면 `web/data/` 가 바이트 단위로 같다
(`build.py` 는 시작할 때 `web/data/` 를 통째로 지우고 다시 만든다).

지도만 다시 만들려면 `… /python spikes/01-web-prototype/build_geo.py`.

## 입력

| 경로 | 무엇 | 라이선스 |
|---|---|---|
| `data/raw/krv/bluesaurel_1961_krv.json` | 개역한글(1961) 본문 31,102절. Spike 00 의 `krv.load_bluesaurel()` 로 읽는다 | 저작재산권 만료 · 성명표시/동일성유지 |
| `data/raw/openbible/ancient.jsonl` | 고대 지명 1,342곳 — 언급 구절 목록(`verses[].osis`)과 대표 좌표(`identifications[].resolutions[].lonlat`) | CC BY 4.0 |
| `data/derived/places.ko.json` | Spike 00 산출 `{place_id: {en, ko, confidence, …}}` | 우리 것 |
| `data/raw/naturalearth/ne_10m_{land,lakes,rivers_lake_centerlines}.shp` | 지도 배경 | 퍼블릭 도메인 |

`data/raw/` 는 git 에 넣지 않는다. 재현은 두 `fetch` 스크립트로.

## 출력 — `web/data/`

```
index.json                 66권 · OSIS id · 개역한글 권명 · 한글 약어 · 장 수(본문에서 실측)
books/{BookId}/{ch}.json   1,189개. 절 본문 + mentions + 이 장의 places
places.json                mention 이 1건 이상인 장소만. 좌표·전체 mention 수·confidence
geo/land.json              Natural Earth land, bbox 클리핑 + 단순화, MultiPolygon 하나
geo/lakes.json             갈릴리 호수·사해 포함
geo/rivers.json            properties.name 유지 (Jordan / Nile / Euphrates / Tigris)
geo/meta.json              bbox · NE 레이어별 버전 · simplify_tolerance · 좌표 소수 자릿수
attribution.json           표시용 문자열 배열
```

전부 minify (들여쓰기 없음). 상세 리포트(못 찾은 언급 794건 전량 등)는 빌드가
`data/raw/work/spike01_report.json` 에 따로 쓴다 (git 제외).

## 파일

| 파일 | 역할 |
|---|---|
| `build.py` | 본문 + 언급 + places + index + attribution. `build_geo` 를 불러 지도까지 |
| `build_geo.py` | Natural Earth shapefile → `geo/*.json`. 예산(600KB) 안에 드는 허용오차를 자동 선택 |
| `fetch_geo.sh` | Natural Earth 수집. naciscdn.org 1차, nvkelso GitHub 미러 2차 |

## 밑줄(mention) 규칙 — 스펙 그대로

장소 P를 절 V에 표시하려면 둘 다 참이어야 한다.

1. OpenBible 이 P의 언급 구절로 V를 나열 (권위)
2. `places.ko.json` 의 `P.ko` (confidence ≥ 0.6) 가 `V.text` 안에 나타남.
   못 찾으면 흔한 조사 하나를 뗀 형태로 재시도. 그래도 없으면 표시하지 않는다.

한 절에 같은 P가 여러 번 나오면 전부 표시하고, 겹치는 span 은 **긴 쪽이 이긴다**.
좌표가 없어 `places.json` 에 못 들어가는 장소는 `mentions` 에서도 뺀다
(모든 `p` 가 `places.json` 에서 찾아져야 하므로 — 스펙에 명확화해 두었다).

## 주의

- **본문을 고치지 않는다.** `text` 는 bluesaurel 원문 그대로. 빌드가 끝나면
  31,102절 전수를 원본과 대조해 0건 불일치를 확인한다.
- 개역개정 본문은 어디에도 넣지 않는다.
- 지도 데이터에 OSM 계열을 섞지 않는다 (ODbL). Natural Earth 만 쓴다.
- `web/index.html` · `web/*.js` · `web/*.css` · `web/data-fixture/` 는 B의 영역이다. 건드리지 않는다.
