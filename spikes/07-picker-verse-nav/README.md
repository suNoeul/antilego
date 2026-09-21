# Spike 07-a — 성경 찾기: 피커가 옮기는 시점을 바꾼다

> 장을 눌렀을 때 바로 옮기지 말자. 권 → 장 → 절을 다 고르고 **한 번** 바뀌는 게 더 직관적이다.
> (Snow, 2026-09-22)

Spike 04 의 결정을 뒤집는다. 그때는 장을 누르면 곧바로 `#Book.N` 으로 옮기고(뒤 본문이 바뀌고)
피커는 열린 채로 절 열이 찼다. 고르는 도중에 화면이 먼저 바뀌니 "아직 고르는 중인데 왜 벌써
넘어갔지" 가 된다.

## 규칙 (07-a)

| 동작 | 옮기나 | 무엇이 일어나나 |
|---|:--:|---|
| 권 클릭/탭 | ✗ | 장 열이 찬다 (모바일은 장 단계로) |
| **장 클릭/탭** | **✗** | **절 열이 찬다. 해시도 뒤 본문도 그대로.** 모바일은 절 단계로 |
| 절 클릭/탭 | ✓ | `#Book.ch` 로 옮기고 그 절로 스크롤 + 2초 표시, 닫는다 |
| 장 격자에서 `Enter` | ✓ | 그 장 **1절**로 옮기고 닫는다 — "장만" 보는 길 (데스크톱) |
| 절 단계의 `N장 처음부터 보기` | ✓ | 위와 같다 (모바일) |
| 검색 `삿 9` + `Enter` | ✓ | 사사기 9장 1절로 옮기고 닫는다 |
| 검색 `삿 9:3` + `Enter` | ✓ | 사사기 9장 + 3절 스크롤, 닫는다 |
| 검색 `삿` + `Enter` · 권 목록 `Enter` | ✗ | 그 권을 골라 두고 장 격자로 포커스 |

장을 누르면 **방금 누른 숫자에 포커스를 돌려준다**. 다시 그리면서 버튼이 사라지기 때문이고,
그래야 이어지는 `Enter` 가 그 장으로 간다.

절 수를 못 받으면 절 열에 `절 목록을 불러오지 못했습니다` 를 띄우되, `Enter` ·
`N장 처음부터 보기` 로 나가는 길은 열어 둔다.

## 바뀐 파일

| 파일 | 무엇 |
|---|---|
| `web/app.js` | `chooseChapter` 에서 `go()` 제거 · `goChapterStart()` 신설 · 장 격자 `Enter` · `applyQuery` 분기 · 절 수 실패(`-1`) 구분 |
| `web/index.html` | 절 열 맨 위에 `#pick-whole` 버튼 하나 |
| `web/styles.css` | `.pick-whole` — 데스크톱 숨김, 모바일 3단계에서만 글자 링크로 |
| `docs/03-prototype-spec.md` | "성경 찾기" 절 개정 (장 클릭 · 모바일 단계 · 검색 · 키보드 표) |

데이터는 건드리지 않았다. 해시 문법(`#Book.ch/<placeId>`)도 그대로다.

## 돌리는 법

```
cd web && python3 -m http.server 8000
open http://localhost:8000/#Judg.9
```

빌드 단계 없음, 의존성 없음.

## 검증 돌리는 법

```
# 1) 정적 서버 (루트 web/)
cd web && python3 -m http.server 8765 &

# 2) 헤드리스 Chrome + CDP
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/antilego-chrome \
  --no-first-run --disable-gpu --hide-scrollbars about:blank &

# 3) 판정 (Node 25 내장 WebSocket 만 쓴다 — 의존성 없음)
cd spikes/07-picker-verse-nav/verify
node desktop.mjs      # 1400×900
node mobile.mjs       # 360×800 (mobile: true)
node fetchfail.mjs    # 절 수 fetch 실패 경로
```

각 스크립트는 `PASS/FAIL` 한 줄씩과 `console.error` 건수, 마지막에 `FAILS: n` 을 찍고
스크린샷을 `../shots/` 에 남긴다. `verify/cdp.mjs` 는 얇은 CDP 드라이버다
(`Input.dispatchMouseEvent` · `Input.dispatchKeyEvent` 로 **실제 클릭·타이핑**).

판정과 수치는 [RESULT.md](RESULT.md).
