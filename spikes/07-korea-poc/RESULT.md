# Spike 07 (PoC) — 동시대 한반도 한 줄

2026-09-21 · Fable (Claude Code) · 상태: **실험. 플래그 `?korea=1` 뒤에 숨긴 채 배포. 판정 대기**
스펙: [`docs/03-prototype-spec.md`](../../docs/03-prototype-spec.md) "PoC — 동시대 한반도" ·
무엇/왜: [`README.md`](README.md)

## 범위

- 기록이 있는 **세 시대에만** 한 줄 — `return`(고조선 후기) · `new_testament` · `early_church`(삼국 초기).
- 나머지 시대에는 **아무것도 없다.** 토글도, 줄도, DOM 도 없다.
- **글자뿐이다. 지도는 손대지 않았다.** 기존 시대 캡션·영역 레이어(03-d)는 한 줄도 고치지 않았다.
- 본문·지명·빌드 산출물은 그대로다. 빌드를 다시 돌려 **`web/data/books/` 해시가 그대로임을 확인했다**
  (`de560273…a43c8c`, 빌드 전후 동일 · 본문 무수정 검사 OK · 31,102절).

## 쓴 문장 (정본: `data/derived/korea_parallel.json`)

| era | title | caption | basis |
|---|---|---|---|
| `return` | 고조선 후기 | 『위략』은 이 무렵 조선의 군주가 스스로 왕을 칭하고 서쪽의 연(燕)과 맞섰다고 전한다(기원전 4세기경 — 『삼국지』 인용). 영역과 도읍은 학설이 갈려 여기서는 적지 않는다. | 『위략』(『삼국지』 위서 동이전 인용) — 연(燕)과의 충돌 기원전 4세기경 |
| `new_testament` | 삼국 초기 | 삼국사기 전통 연대로는 신라가 기원전 57년, 고구려가 기원전 37년, 백제가 기원전 18년에 선다. 북쪽에는 한(漢)이 설치한 낙랑군이 그대로 있었다. | 『삼국사기』 전통 건국 연대 — 신라 기원전 57 · 고구려 기원전 37 · 백제 기원전 18. 낙랑군은 기원전 108년 설치 |
| `early_church` | 삼국 초기 | 삼국은 아직 초기였고, 북쪽의 낙랑군은 기원후 313년까지 이어진다(삼국사기 전통 연대 기준). 남쪽에서는 가야가 기원후 42년에 섰다고 『삼국유사』 가락국기가 전한다 — 전승이다. | 『삼국사기』 전통 연대 · 낙랑군 존속(기원전 108–기원후 313) · 가야 건국 기원후 42년은 『삼국유사』 「가락국기」의 전승 |

원문을 옮기지 않고 직접 썼다. 연대의 **기준**을 캡션 안이나 바로 뒤 괄호에 항상 적었다.
고조선의 영역·중심지, 삼국 건국의 실제 시점, 가야 42년 — 논쟁 중이거나 전승인 것은
그렇다고 밝히거나 아예 쓰지 않았다. 더 긴 근거 메모는 정본의 `note` 에 있고 **UI 로는 나가지 않는다**.

## 데이터 · 빌드

| 파일 | 크기 | 내용 |
|---|---:|---|
| `data/derived/korea_parallel.json` | 3,202 B | 정본. `_notes` + 3개 시대 (`title`·`caption`·`basis`·`note`) |
| `web/data/korea_parallel.json` | **1,472 B** | 파생물. `version`·`basis` + 3개 시대 (`title`·`caption`·`basis`) |

- `spikes/03-eras/export_web.py` 가 시대 3종과 같은 실행에서 내보낸다. 멱등.
  **정본이 없으면 조용히 건너뛴다** — 실험을 지워도 빌드는 돌아간다.
- `build.py` 의 완료 검사(F4) 목록에 `korea_parallel.json` 추가 → 필수 파일 **11개**.
- `validate.py` 가 ① era id 가 `eras.json` 에 실재하는지 ② `title`/`caption`/`basis` 가 비지 않았는지
  ③ derived ↔ web 시대 목록이 같은지 본다. 결과: **PASS**
  (`korea_parallel : 3개 시대 (early_church, new_testament, return) (PoC 07)`).

## 검증 (헤드리스 Chrome 153.0.8010.52 + CDP, Node 25.8.1)

`cd web && python3 -m http.server 8032`, `--headless=new --remote-debugging-port=9352`,
`Network.setCacheDisabled`, 시나리오마다 `localStorage.clear()` 후 **about:blank 를 거쳐** 새로 로드
(해시만 바뀌면 문서가 다시 로드되지 않는다). 캡션은 지도 패널 안에 있어 `setPanel(true)` 로 연다.

| # | 창 | 주소 | `한반도는?` | 캡션 | `localStorage['korea']` | 펼침 | `console.error` |
|---|---|---|---|---|---|---|---|
| 1 | 1400×900 | `#Matt.4` (플래그 없음) | **0개** | 보임 | `null` | — | 0 |
| 2 | 1400×900 | `?korea=1#Matt.4` | **1개**, 12px | 보임 | `"1"` | 눌러서 `aria-expanded=true`, 높이 79px, 삼국 줄 | 0 |
| 3 | 1400×900 | `?korea=1#1Kgs.12` (분열왕국) | **0개** | 보임 | `"1"` | — | 0 |
| 4 | 1400×900 | `?korea=1#Ps.23` (시대 불특정) | **0개** | **숨음** | `"1"` | — | 0 |
| 5 | 1400×900 | `?korea=1#Ezra.1` (귀환) | **1개** | 보임 | `"1"` | 눌러서 `true`, 높이 79px, 고조선 줄 | 0 |
| 6 | 1400×900 | `#Matt.4` (쿼리 없이 재적재) | **1개** | 보임 | `"1"` | — | 0 |
| 7 | 1400×900 | `?korea=0#Matt.4` | **0개** | 보임 | **`null`** | — | 0 |
| 8 | 1400×900 | `#Matt.4` (끈 뒤 재적재) | **0개** | 보임 | `null` | — | 0 |
| 9 | 360×800 | `#Matt.4` (플래그 없음) | **0개** | 보임 | `null` | — | 0 |
| 10 | 360×800 | `?korea=1#Matt.4` | **1개** | 보임 | `"1"` | 눌러서 `true`, 높이 99px | 0 |
| 11 | 1400×900 | `?korea=1&data=data-fixture#Matt.4` | **0개** | 숨음 | `"1"` | — | 0 (404는 네트워크 로그) |

- **가로 스크롤 없음**: 360×800 에서 `document.documentElement.scrollWidth === 360` (접힘·펼침 둘 다).
  1400 에서는 1385(세로 스크롤바) 또는 1400.
- **펼친 줄**: `이 무렵 한반도 — 삼국 초기: …` + `.korea-basis` 가 더 옅은 괄호로 근거를 단다.
  기본 접힘(`hidden`, 높이 0), 두 번 누르면 다시 접힌다. 상태는 기억하지 않는다.
- **지연 로딩** (`performance.getEntriesByType('resource')` 로 확인):
  플래그 없음 → `korea_parallel.json` 요청 **0**, `?korea=1` → **1**, 장을 세 번 옮겨도 **1**,
  `?korea=0` → **0**. 캡션이 숨는 `#Ps.23` 에서도 플래그가 켜져 있으면 1회 받는다(한 번뿐).
- **데이터를 못 받는 경우**(11번, 픽스처에 시대·한반도 파일이 없음): 404 5건이 나지만
  `console.error` 는 0 이고 캡션도 토글도 뜨지 않는다. 에러 문구를 대신 띄우지 않는다.

스크린샷 `shots/`: `01-matt4-noflag-1400` · `02-matt4-korea-1400(-collapsed)` ·
`03-1kgs12-korea-1400` · `04-ps23-korea-1400` · `05-ezra1-korea-1400(-collapsed)` ·
`06-matt4-noflag-360` · `07-matt4-korea-360(-collapsed)` · `08-matt4-korea-360-expanded`.

## 알려진 것

- 토글은 시대 캡션 안에 있고, 캡션은 **지도 패널 안**이다. 패널을 닫아 두면 보이지 않는다(03-d 그대로).
- `new_testament` 와 `early_church` 의 `title` 이 둘 다 `삼국 초기`다. 의도한 것이다 —
  같은 시기이고, 다른 이름을 붙이면 없는 구분을 만든다.
- 라이브 사용자는 이 기능의 존재를 모른다. 주소에 `?korea=1` 을 직접 붙여야만 보인다.

## 되돌리기

세 가지 중 아무거나.

1. **커밋 하나만 되돌린다** (권장, 원격 포함):
   ```
   git revert $(git log --format=%H --grep '^PoC(korea):' -1)
   git push
   ```
   이 PoC 는 **커밋 하나**다 — 데이터·빌드·UI·문서·스크린샷 전부 그 안에 있다.
2. **로컬에서 통째로 되돌린다** (체크포인트 태그):
   ```
   git reset --hard checkpoint/pre-korea-poc      # ede17eb — PoC 직전
   ```
3. **아무것도 안 한다.** 플래그가 꺼져 있는 한 라이브 사용자는 이것을 보지 않는다.
   급하지 않다.

`data/derived/korea_parallel.json` 만 지워도 UI 는 조용히 사라진다 — 단, `build.py` 의 완료 검사
목록에서도 `korea_parallel.json` 을 빼야 빌드가 통과한다.

## 노션 반영 필요

이 결과를 `Decisions` DB 에 한 줄로. (이 에이전트는 노션 접근 없이 작업했다.)
