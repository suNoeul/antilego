# Spike 03 — 시대 데이터 초안

2026-09-18 · 담당: Opus S03 · 범위: `spikes/03-eras/`, `data/derived/eras.json`, `data/derived/chapter_eras.json`

## 왜

Snow의 요청:

> 지도 아래에 그 장의 시대와 당시 나라들에 대한 짧은 설명(캡션)이 있고,
> 지도에 그 시대의 큰 나라/지역 구분이 대략적으로 표시되면 좋겠다.

그리고 영역은 **"대략 영역을 직접 그린다"**로 정해졌다(Snow). 학술적 국경이 아니라
"이쯤이 모압이다" 수준의 뭉뚱그린 블롭이고, 지도에 그렇다고 써 붙인다.

## 이 spike가 하는 것 / 안 하는 것

| | |
|---|---|
| 한다 | 시대 목록(연대·캡션), 시대별 나라/지역 목록, 각 나라의 앵커 지명, 1,189장 전체의 시대 배정, 검증 스크립트 |
| 안 한다 | **폴리곤 자체**. 다음 단계(Spike 04 제안)에서 앵커 좌표를 힌트로 그린다 |
| 안 건드린다 | `web/` (다른 에이전트가 UI 재작성 중) |

## 산출물

```
data/derived/eras.json           11개 항목(역사 시대 9 + primeval + undated)
data/derived/chapter_eras.json   66권 × 기본 시대 + 장 범위 예외
spikes/03-eras/validate.py       커버리지·era id·앵커 지명 검증
spikes/03-eras/RESULT.md         결과, 검증 출력, 다음 단계 제안
```

## 스키마

### `eras.json`

```json
{ "version": 1, "generated": "2026-09-18", "_notes": [...],
  "eras": [
    { "id": "divided_kingdom", "ko": "분열왕국 시대", "en": "Divided Kingdom",
      "approx": "기원전 930–586년경", "approx_from": -930, "approx_to": -586,
      "caption": "한두 문장.",
      "polities": [
        { "ko": "북이스라엘", "en": "Israel (Northern Kingdom)",
          "anchor_places_en": ["Samaria 1", "Jezreel 2", "Dan", "Bethel 1"],
          "kind": "kingdom" }
      ],
      "note": "연대·구분 근거와 학설 차이" }
  ] }
```

- `approx_from` / `approx_to`: 기원전은 음수, 기원후는 양수, 0년 없음. 시대를 매기지 않는
  항목(`primeval`, `undated`)은 `null`이고 `"undated": true`가 붙는다.
- `kind`: `kingdom` / `empire` / `province` / `region` / `city-league` / `city-states` /
  `confederation` / `people` / `tetrarchy`. 라벨 스타일 구분용 힌트일 뿐 의미는 느슨하다.
- `anchor_places_en`: **경계가 아니라 "이 안에 들어가는 대표 지점"**이다. `web/data/places.json`의
  `en` 필드와 **정확히 일치**해야 한다(동명이지 번호까지: `Samaria 1`, `Bethel 1`, `Antioch 2`).
  다음 단계가 여기서 좌표를 뽑아 블롭을 만든다.

### `chapter_eras.json`

```json
{ "_notes": [...],
  "Gen":  { "default": "patriarchs", "ranges": [[1, 11, "primeval"]], "note": "..." },
  "1Kgs": { "default": "divided_kingdom", "ranges": [[1, 11, "united_kingdom"]] } }
```

- `ranges`의 `[시작장, 끝장, era_id]`가 `default`보다 우선한다. 범위끼리 겹치지 않는다.
- `_`로 시작하는 키는 메타데이터다. 소비하는 쪽은 건너뛴다.
- 조회: `era = range 중 chapter를 포함하는 것 ?? default`.

## 검증

```
python3 spikes/03-eras/validate.py     # 저장소 루트에서
```

확인 항목: 1,189장 전부 배정 / 참조된 era id가 전부 존재 / 범위 중복·범위 이탈 없음 /
모든 `anchor_places_en`이 `places.json`에 존재. 하나라도 어긋나면 종료 코드 1.

## 원칙

- 시대 구분은 **읽기 보조**다. 학술 연표가 아니다. 연대는 점이 아니라 폭으로 적는다.
- 학설이 갈리는 곳은 한쪽을 고르지 않고 `note`에 양쪽을 적는다.
- 캡션은 그 장의 줄거리가 아니라 **지리적 상황**을 말한다. 출처 문장을 옮기지 않고 우리말로 직접 썼다.
