# Spike 04 — 성경 찾기 (권·장·절 선택)

상단바의 네이티브 `<select>` 두 개(`권 ▾` `장 ▾`)를 버리고 **성경 찾기** 하나로 바꾼다.

> 셀렉트 두 개는 쓰기 불편하고 이 앱의 결과 맞지 않는다. (Snow, 2026-09-21)

- 상단바에는 지금 위치를 글자로 보여 주는 버튼 하나 (`사사기 9장 ▸`). 누르면 찾기가 열린다.
- **데스크톱 ≥900px**: 상단바 아래 팝오버. 검색 한 줄 + **[성경권] [장] [절]** 3열.
- **모바일 <900px**: 전체 화면 시트. 검색 + **초성 칩 줄** + 권 → 장 → 절 3단계.
- 검색은 **한글 초성**(`ㄱ` → 겔·고전·고후·갈·골·계), **약어·한글 이름**(`사사기`, `삿`),
  **영문**(`gen`, `1co`), **장·절**(`삿 9:3`, `9:3`, `9 3`, `9.3`)을 함께 받는다.

`‹ ›` 장 이동, 다크 토글, 해시 라우팅, 마지막 읽은 장 기억, 지도 패널·시대 레이어·리사이즈
손잡이는 **그대로**다. 해시 문법(`#Book.ch/<placeId>`)도 그대로다 — 절로 가는 것은
URL 이 아니라 **스크롤 + 2초 표시**다.

## 바뀐 파일

| 파일 | 무엇 |
|---|---|
| `spikes/01-web-prototype/build.py` | `EN_NAMES`(영문 권명 66) · `BOOK_GROUPS`(분류 10종) 정적 표 추가, `index.json` 에 `en`·`group` 을 넣는다 |
| `spikes/04-picker/rebuild_index.py` | `index.json` 에만 두 필드를 채우는 부분 재생성 (아래) |
| `web/data/index.json` | 권마다 `en`·`group` 추가 (5,085 B → 7,554 B) |
| `web/index.html` | 셀렉트 두 개 → `#loc` 버튼, `#picker` 다이얼로그 추가 |
| `web/styles.css` | 칩 색 토큰 4개 + `--pick-shadow`, 위치 버튼·팝오버·시트·칩·숫자 격자, `select` 규칙 삭제 |
| `web/app.js` | `fillBooks`/`fillChapters`/셀렉트 바인딩 삭제, 성경 찾기 한 절(초성 매칭·질의 파싱·3열·단계) |
| `docs/03-prototype-spec.md` | `index.json` 스키마 + "성경 찾기" UI 절 (상단바 셀렉트 설명 교체) |

## 데이터: `index.json` 부분 재생성

정본 표는 `build.py` 하나다. 그런데 `build.py` 는 `data/raw/`(커밋하지 않는 원본)와
`shapefile` 패키지를 필요로 해서 전체 재생성이 늘 되지는 않는다. 그래서:

```
python3 spikes/04-picker/rebuild_index.py      # 의존성 없음, 멱등
```

이 스크립트는 **build.py 를 실행하지도 import 하지도 않는다.** 소스를 `ast` 로 파싱해
`KO_NAMES` · `KO_ABBR` · `EN_NAMES` · `BOOK_GROUPS` · `N_OT` 만 꺼내 오고, 기존
`index.json` 의 `chapters` 는 그대로 둔 채 `en` · `group` · `testament` 만 다시 쓴다.
권 순서와 `ko`/`abbr` 이 표와 어긋나면 그 자리에서 멈춘다. 원본이 있는 환경에서
`build.py` 를 통째로 돌리면 같은 결과가 나온다.

## 돌리는 법

```
cd web && python3 -m http.server 8000
open http://localhost:8000/#Judg.9
```

빌드 단계 없음, 의존성 없음. 픽스처(`?data=data-fixture`)도 그대로 동작한다 —
`group` 이 없으면 `구약`/`신약` 으로 물러선다.

## 키보드

| 키 | 무엇 |
|---|---|
| `/` · `g` | 찾기를 연다 (입력 칸에 포커스가 없을 때) |
| `↑` `↓` | 걸러진 권 목록에서 커서 이동 |
| `Enter` | 권만 → 1장 · 권+장 → 그 장 · `삿 9:3` → 그 장 + 3절로 스크롤 후 닫기 |
| `Tab` | 입력 → 성경권 → 장 → 절 → `×` → 입력 |
| `Esc` | 닫는다 (지도 패널보다 먼저 받는다) |

## 검증

Spike 02 와 같은 방법 — `python3 -m http.server` +
`Google Chrome --headless=new --remote-debugging-port=…`, Node 25 내장 WebSocket 으로 CDP 직접 호출.
1400×900 · 360×800(`mobile: true`) + 경계 899/900/1000. 수치는 [RESULT.md](RESULT.md),
스크린샷은 `shots/`.

디버그 핸들에 `window.__antilego.{pick, openPicker, closePicker, parseQuery, matchBook,
koPrefix, choOf, scrollToVerse, verseCount}` 를 더했다. 앱 동작에는 관여하지 않는다.
