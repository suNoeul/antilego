# Spike 07-a — 성경 찾기: 장 클릭은 선택만 · 결과

2026-09-22 · Fable (Claude Code). 스펙: [`docs/03-prototype-spec.md`](../../docs/03-prototype-spec.md)
"성경 찾기". 돌리는 법은 [README.md](README.md).

**판정: 통과.** 로컬 108 단언 전부 PASS, `console.error` · 예외 · error 로그 **0건**.

---

## 결정

**장을 눌러도 옮기지 않는다.** (2026-09-22, Snow — Spike 04 의 "장 클릭 시 바로 이동" 을 뒤집는다)

> 권 → 장 → 절을 고르고 화면이 **한 번** 바뀌는 게 더 직관적이다.

Spike 04 의 판정(`장 클릭 → 바로 `#Book.N``)은 **폐기**다. `spikes/04-picker/RESULT.md` 의
"장 클릭(12) → hash `#Gen.12`" 줄은 이제 그때의 기록으로만 읽는다.

## 무엇을 바꿨나

### 1. `chooseChapter` 에서 `go()` 를 뺐다

```
- go(pick.book, n, null);   // 바로 옮긴다. 피커는 열린 채로 둔다
```

남은 일은 `pick.ch` 를 정하고 절 열을 채우는 것뿐이다. 해시도, 뒤의 본문도, 상단바 글자도
그대로다. 모바일은 절 단계(`data-step="3"`)로만 넘어간다.

다시 그릴 때 누른 버튼이 사라지므로 **방금 고른 장으로 포커스를 돌려준다**
(`col-ch .num[aria-selected="true"].focus()`, 데스크톱만). 그래야 이어지는 `Enter` 가 먹는다.

### 2. `goChapterStart()` — "장만" 보는 길 하나

```js
function goChapterStart() {
  const same = state.book === pick.book && state.ch === pick.ch;
  go(pick.book, pick.ch, null);
  if (same) window.scrollTo(0, 0);   // 이미 그 장이면 해시가 그대로다 — 맨 위로만
  closePicker();
}
```

여기로 오는 길은 셋이다 — 장 격자의 `Enter`(데스크톱) · `N장 처음부터 보기`(모바일) ·
검색창에 장을 적고 누른 `Enter`. 셋 다 **그 장 1절 + 피커 닫힘**으로 끝난다.

장 격자의 `Enter` 는 `preventDefault()` 로 버튼의 기본 활성화(=`click`)를 막는다.
막지 않으면 keydown 뒤에 click 이 따라와 `chooseChapter` 가 겹쳐 돈다.

### 3. 모바일 `N장 처음부터 보기`

절 단계 맨 위의 작은 글자 링크(`#pick-whole`, 밑줄 + `--accent`). 데스크톱에서는
`display: none` 이다 — 거기서는 `Enter` 가 그 길이다.

### 4. 절 수를 못 받았을 때

`verseCount()` 가 실패를 **`-1`** 로 알린다(0 = "아직 장을 안 골랐다" 와 구별해야 한다).
실패는 캐시하지 않는다. 절 열에는 `절 목록을 불러오지 못했습니다` 가 뜨고,
`Enter` · `N장 처음부터 보기` 로 나가는 길은 그대로 열려 있다.

### 5. 검색창 `Enter` 의 갈래

| 입력 | `Enter` |
|---|---|
| `삿 9:3` | 사사기 9장 + 3절 스크롤, 닫는다 (Spike 04 와 같다) |
| `삿 9` | 사사기 9장 1절로 옮기고 **닫는다** |
| `삿` (장이 없다) | 사사기를 골라 두고 장 격자로 포커스. **옮기지 않는다** |
| 권 목록에서 `Enter` | 그 권을 골라 두고 장 격자로 포커스. **옮기지 않는다** |

Spike 04 는 마지막 두 경우에 1장으로 옮기고 피커를 **열어 둔** 채였다. 장을 적지 않았는데
1장으로 옮기는 것은 "장 클릭은 선택만" 과 어긋나서 **옮기지 않는 쪽으로 바꿨다** (아래 "판단").

---

## 검증 (헤드리스 Chrome, CDP)

`python3 -m http.server 8765`(루트 `web/`) + `Chrome --headless=new --remote-debugging-port=9222`.
`Emulation.setDeviceMetricsOverride` 로 크기·모바일 지정, `Input.dispatchMouseEvent` ·
`Input.dispatchKeyEvent` 로 **실제 클릭·타이핑**. 오류는
`Runtime.consoleAPICalled(error)` · `Runtime.exceptionThrown` · `Log.entryAdded(error)` 를 모두 모았다.
스크립트는 `verify/` 에 있다.

### 데스크톱 1400×900 — `verify/desktop.mjs` (53/53)

`#Judg.9` 에서 시작. `localStorage` 를 턴 뒤 **새로고침**하고(해시만 바꾸면 리로드가 아니다)
`theme=light` 로 고정했다.

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 열림: 현재 권·장 미리 선택 | `aria-selected` = `Judg` · `9` | ✅ |
| 열림: 절 열 | **57** (사사기 9장), 머리 `절 · 사사기 9장` | ✅ |
| **권 클릭(창세기)**: hash | **`#Judg.9` 그대로** | ✅ |
| 권 클릭: 장 열 / 절 열 | 50 / 0 + `장을 고르세요` | ✅ |
| **장 클릭(12)**: hash | **`#Judg.9` 그대로** | ✅ |
| 장 클릭: 뒤 본문 | `사사기 9장 …` 그대로 | ✅ |
| 장 클릭: 상단바 | `사사기 9장` 그대로 | ✅ |
| 장 클릭: 피커 | **열린 채** | ✅ |
| 장 클릭: 절 열 | **20** (창세기 12장) | ✅ |
| 장 클릭: 열 머리 | `절 · 창세기 12장` · `장 · 창세기` | ✅ |
| 장 클릭: 포커스 | 방금 누른 `.num` (`data-n=12`) | ✅ |
| 장 클릭: `처음부터 보기` | `display: none` (데스크톱) | ✅ |
| **절 클릭(9)**: hash | **`#Gen.12`** | ✅ |
| 절 클릭: 피커·본문·9절 | 닫힘 · `창세기 12장` · `verse-hl` + 화면 안 | ✅ |
| 2초 뒤 | `.verse-hl` 0개 | ✅ |
| **`Enter`(장 격자)** | `#Gen.12`, 피커 닫힘, **`scrollY 0`**, 하이라이트 없음, 포커스 `#loc` | ✅ |
| `삿 9` + `Enter` | `#Judg.9`, `scrollY 0` | ✅ |
| `삿 9:3` + `Enter` | `#Judg.9`, 피커 닫힘, 3절 `verse-hl` + 화면 안 | ✅ |
| 회귀 `ㄱ` | 겔·고전·고후·갈·골·계 (6권, 정경 순서) | ✅ |
| 회귀 `Esc` · 바깥 클릭 | 둘 다 닫힘, 바깥 클릭 뒤 hash 그대로 | ✅ |
| 회귀 `‹ ›` | `#Judg.10` → `#Judg.9` | ✅ |
| 회귀 지도 패널 · 시대 토글 | 열림 + `#map circle` > 0, `aria-pressed` on/off | ✅ |
| 회귀 피드백 카드 | 열림 · 위치 줄 `사사기 9장 1절` · 닫힘 | ✅ |
| `console.error` / 예외 / error 로그 | **0건** | ✅ |

### 모바일 360×800 (`mobile: true`) — `verify/mobile.mjs` (49/49)

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 열림 | `data-step="1"`, breadcrumb `사사기 › 9장`, `← 뒤로` 숨김, 권 66 | ✅ |
| **권 탭(창세기)** | `step 2`, hash `#Judg.9` 그대로, breadcrumb `창세기`, 장 50, 보이는 열 `[none, flex, none]` | ✅ |
| **장 탭(12)** | `step 3`, **hash `#Judg.9` 그대로**, 뒤 본문·상단바 `사사기 9장` 그대로 | ✅ |
| 장 탭: breadcrumb · 절 | `창세기 › 12장` · 20 | ✅ |
| 장 탭: 링크 | `12장 처음부터 보기`, `display: block` | ✅ |
| **`12장 처음부터 보기`** | `#Gen.12`, 닫힘, 본문 `창세기 12장`, `scrollY 0`, 하이라이트 없음 | ✅ |
| **절 탭(9)** | 누르기 전 `#Judg.9` → 누른 뒤 `#Gen.12`, 닫힘, 9절 `verse-hl` + 화면 안 | ✅ |
| `← 뒤로` | 3 → 2 → 1, 1단계에서 숨김 | ✅ |
| 칩 `ㄱ` · 해제 | 6권 / 66권 | ✅ |
| 지도 시트 위 | 시트를 연 채 피커를 열면 `(180, 600)` 이 `#picker` 안, `×` 로 피커만 닫히고 시트는 그대로 | ✅ |
| **가로 스크롤** | 모든 단계에서 `document.documentElement.scrollWidth` = **360** | ✅ |
| `console.error` / 예외 / error 로그 | **0건** | ✅ |

> 모바일에서는 `Esc` 를 재지 않았다. 하드웨어 키가 없고, 탭한 버튼에 포커스가 남지 않아
> `keydown` 이 `#picker` 밖(body)으로 간다. 닫는 길은 `×` 다. 이건 Spike 04 부터 그랬다.

### 절 수 fetch 실패 — `verify/fetchfail.mjs` (6/6)

`window.fetch` 를 갈아 끼워 `books/Gen/12.json` 만 503 으로 만든 뒤 장을 골랐다.

| 단언 | 관측값 | 판정 |
|---|---|:--:|
| 절 열 안내 | `절 목록을 불러오지 못했습니다` | ✅ |
| 절 버튼 | 0개 | ✅ |
| 피커 · hash | 열린 채 · `#Judg.9` 그대로 | ✅ |
| `12장 처음부터 보기` | 살아 있다 (`hidden=false`) | ✅ |
| 그 상태에서 `Enter` | `#Gen.12`, 피커 닫힘 | ✅ |
| `console.error` / 예외 | **0건** | ✅ |

## 스크린샷 (`shots/`)

| 파일 | 무엇 |
|---|---|
| `desktop-chapter-picked.png` | 1400×900. 창세기 → 12 를 눌렀는데 **뒤 본문은 사사기 9장**, 상단바도 `사사기 9장`. 절 열 20, 머리 `절 · 창세기 12장` |
| `desktop-verse-jump.png` | 이어서 9절 클릭 — `#Gen.12`, 9절 하이라이트, 피커 닫힘 |
| `desktop-search-verse.png` | `삿 9:3` + `Enter` |
| `desktop-verse-fetch-fail.png` | 절 수를 못 받았을 때의 절 열 |
| `desktop-filter-ga.png` · `desktop-regression-map.png` · `desktop-dark.png` | 회귀 — `ㄱ` 필터 · 지도 패널 + 시대 레이어 · 다크 |
| `mobile-books.png` · `mobile-chapters.png` | 360×800 1·2단계 |
| `mobile-verses.png` | 3단계 — `12장 처음부터 보기` 링크가 절 격자 위에 |
| `mobile-verse-jump.png` | 절 탭 뒤 |
| `mobile-chip-ga.png` | 초성 칩 `ㄱ` |
| `live-*.png` | 배포본 확인 (아래) |

## 판단 — 스펙에 없어서 정한 것

- **검색창 `삿 9` + `Enter` 는 피커를 닫는다.** Spike 04 는 옮기고도 열어 뒀다. 이제 옮김이
  곧 "다 골랐다" 라서, 옮기는 길은 전부 닫는 쪽으로 맞췄다. 결과 해시(`#Judg.9`)는 같다.
- **장을 적지 않은 `Enter`(`삿`, 권 목록)는 옮기지 않는다.** Spike 04 는 1장으로 옮겼다.
  장을 고르지 않았는데 옮기는 것은 이번 결정의 반대쪽이라, 권만 골라 두고 장 격자로
  포커스를 넘긴다. 사용자가 이어서 장을 고르고 `Enter` 를 누르면 그때 옮긴다.
- **장을 누른 뒤 포커스를 그 숫자로 돌려준다** (데스크톱). 스펙의 "focus in 장 grid" 를
  클릭으로도 만족시키려면 필요하다 — 안 그러면 클릭 직후의 `Enter` 가 먹지 않는다.
- **`N장 처음부터 보기` 는 모바일 전용**이다. 데스크톱 팝오버에서는 `Enter` 가 같은 일을 하고,
  3열 위에 링크를 하나 더 얹으면 열 머리와 겹쳐 보인다.
- **이미 읽고 있는 장에서 `Enter` 를 누르면** 해시가 그대로여서 `go()` 가 아무 일도 안 한다.
  그 경우만 `window.scrollTo(0, 0)` 을 직접 부른다 ("1절로" 를 지키려고).

## 남은 것 / 벗어난 점

- `spikes/04-picker/RESULT.md` 는 **고치지 않았다.** 그때의 관측 기록이고, 뒤집힌 결정은
  이 문서와 스펙이 말한다 (AGENTS.md: "실패한 spike 를 지우지 않는다"와 같은 뜻).
- 모바일 `Esc` 는 여전히 포커스가 피커 안에 있을 때만 먹는다 (Spike 04 와 동일, 이번 범위 밖).
- 절 수는 여전히 장 JSON 을 받아 센다. `index.json` 에 절 수를 넣는 안은 그대로 보류
  (66권 1,189장 → 파일이 서너 배).
- **노션 반영 필요** — `🧭 Decisions` 에 "피커: 장 클릭은 선택만, 절 클릭에서 이동
  (2026-09-22, Spike 04 결정 대체)" 한 줄.

## 배포

<!-- 배포 기록은 라이브 검증 커밋에서 채운다 -->
