# Spike 00 — 한글 지명 매핑

**질문:** 영문 지명(OpenBible / TIPNR) → 개역한글(1961) 지명 매핑을 실용 수준으로 만들 수 있는가?
**성공 기준:** 성경 전체 지명 *언급 횟수* 의 80% 이상.
**판정:** 통과. 언급의 98.9%에 후보가 붙었고, 표본 검증 기준 정확 매핑은 **95.9%**.

판정 근거·수치·실패 사례는 **[RESULT.md](RESULT.md)**. 명세는 `docs/02-plan.md` → Spike 00.

## 돌리는 법

```bash
uv venv .venv && uv pip install --python .venv/bin/python requests
bash fetch.sh                      # data/raw/ 로 원본 5종 (멱등)
.venv/bin/python krv.py            # 개역한글 전자본 무결성 리포트
.venv/bin/python build_places.py   # OpenBible + TIPNR -> 장소 표
.venv/bin/python wikidata.py       # pass 1: Wikidata ko 레이블
.venv/bin/python map_ko.py         # pass 1+2 -> data/derived/places.ko.json
.venv/bin/python eval.py           # 표본 판정으로 정확도 추정
```

## 파일

| 파일 | 역할 |
|---|---|
| `fetch.sh` | 원본 수집. 커밋 해시 고정 |
| `krv.py` | 개역한글 로더(전자본 3종) + 판본/정렬/일치율 점검 |
| `build_places.py` | 장소 1,342곳 + 언급 8,742건 + 외부 ID |
| `wikidata.py` | `wbgetentities` 배치 조회. 재실행 시 이미 받은 QID 건너뜀 |
| `map_ko.py` | 접두어 역색인 + F2 점수 + 조사 제거 |
| `eval_manual.json` / `eval.py` | 눈으로 본 표본 판정, 정확도 추정 |

## 주의

- **`seven1m/open-bibles` 의 `kor-korean.osis.xml` 을 본문으로 쓰면 안 된다.**
  역대하 21~36장이 통째로 없고 여호수아 10장은 절 번호가 밀려 있다. 판본 대조용으로만.
- 개역한글 본문은 `data/raw/` 에만 두고 파생물에 담지 않는다. 수정하지 않는다.
