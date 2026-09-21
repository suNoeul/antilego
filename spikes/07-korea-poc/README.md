# Spike 07 — PoC: 동시대 한반도 한 줄 (플래그 `?korea=1`)

**실험이다.** 라이브에 올라가 있지만 **플래그 뒤에 숨어 있어서** 그냥 들어온 사람에게는 보이지 않는다.
판정이 나면 정식으로 올리거나 통째로 되돌린다. 되돌리는 법은 [`RESULT.md`](RESULT.md) 맨 아래.

## 무엇

성경을 읽다가 그 장의 시대 캡션 끝에 작은 글자 **`한반도는?`** 이 붙는다. 누르면 한 줄이 펼쳐진다.

```
신약 시대(예수·로마) · 기원전 4년–기원후 30년경 — … (대략적인 구분)  한반도는?
이 무렵 한반도 — 삼국 초기: 삼국사기 전통 연대로는 신라가 기원전 57년, 고구려가 기원전 37년,
백제가 기원전 18년에 선다. 북쪽에는 한(漢)이 설치한 낙랑군이 그대로 있었다.
(『삼국사기』 전통 건국 연대 — 신라 기원전 57 · 고구려 기원전 37 · 백제 기원전 18. 낙랑군은 기원전 108년 설치)
```

지도는 없다. 글자 한 줄뿐이다.

## 왜 세 시대뿐인가

**기록이 남아 있는 시대에만 붙인다** (Snow 결정, 2026-09-21).

| era id | 한반도 | 근거 |
|---|---|---|
| `return` (귀환·페르시아) | 고조선 후기 | 『위략』(『삼국지』 위서 동이전 인용) — 연(燕)과의 충돌 기원전 4세기경 |
| `new_testament` (신약) | 삼국 초기 | 『삼국사기』 전통 건국 연대 — 신라 BC 57 · 고구려 BC 37 · 백제 BC 18, 낙랑군 존속 |
| `early_church` (초대교회) | 삼국 초기 | 위와 같음 + 가야 건국 AD 42 은 『삼국유사』 「가락국기」의 **전승** |

나머지 여덟 시대(족장·출애굽·정복사사·통일왕국·분열왕국·포로·원시사·시대 불특정)에는
**항목 자체가 없고, 항목이 없으면 토글도 줄도 만들지 않는다.** 그 시기 한반도는 문헌 연대를 못
박는다. 고고학 시대구분(청동기·초기 철기)만 가지고 "이 무렵 한반도는"을 쓰면 없는 확신을 만든다 —
AGENTS.md "모호하면 보여주지 않는다".

같은 이유로 **연대의 기준을 캡션 안이나 바로 뒤 괄호에 반드시 적는다**. 고조선의 영역·도읍처럼
논쟁 중인 것은 아예 쓰지 않았다.

## 어디에 있나

| 파일 | 역할 |
|---|---|
| `data/derived/korea_parallel.json` | **정본.** 캡션·근거·메모. era id 로 묶는다 |
| `spikes/03-eras/export_web.py` | → `web/data/korea_parallel.json` (`title`·`caption`·`basis` 만) |
| `spikes/01-web-prototype/build.py` | 완료 검사(F4) 목록에 `korea_parallel.json` 추가 |
| `spikes/03-eras/validate.py` | era id 가 `eras.json` 에 실재하는지 · derived ↔ web 목록이 같은지 |
| `web/app.js` | 플래그 `KOREA`, `ensureKorea()`(지연 로딩), `renderEra()` 안의 토글 |
| `web/styles.css` | `.korea-toggle` · `.korea-line` · `.korea-basis` |
| `docs/03-prototype-spec.md` | "PoC — 동시대 한반도" (실험 표시) |

## 켜는 법

```
https://sunoeul.github.io/antilego/?korea=1        # 켜고 기억한다
https://sunoeul.github.io/antilego/?korea=0        # 끄고 기억도 지운다
```

`localStorage['korea'] = '1'` 에 기억한다. 주소에 아무것도 없으면 기억한 값을 쓰고, 기본은 꺼짐.
꺼져 있으면 `korea_parallel.json` 을 **받지도 않는다**.

## 다시 만들기

```
python3 spikes/03-eras/export_web.py     # web/data/korea_parallel.json
python3 spikes/03-eras/validate.py       # PASS 여야 한다
```

빌드 전체(`spikes/01-web-prototype/.venv/bin/python spikes/01-web-prototype/build.py`)를 돌려도
같다 — `build.py` 가 `export_web.py` 를 부른다.
