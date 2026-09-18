# Spike 02 — 지도 패널 하나

Snow 피드백 1·2·3 을 Spike 01 의 웹 프로토타입(`web/`)에 반영한다.

1. **밑줄 제거.** 지명은 색만 다르게.
2. **지도는 하나만.** 데스크톱 사이드 카드 + 모바일 인라인 카드 + 접힌 "▸ 이 장의 지도" + "크게 보기"
   모달을 전부 버리고 **지도 패널 하나**로 통일. 본문이 항상 주인공.
   - 오른쪽에 **플로팅 버튼**이 떠 있고, 누르면 패널이 열리고 닫힌다. 기본은 닫힘.
   - 본문의 지명을 누르면 **패널이 자동으로 열리고 그 지명이 강조**된다.
3. **지도 확대·축소.** 휠/핀치/버튼으로 확대·축소, 드래그로 이동. 확대하면 더 작은 지명 라벨도 보인다.

피드백 4·5(시대 캡션 · 시대별 영역)는 Spike 03 이다. 지도 아래에 빈 `#era-caption` 만 자리로 남겨 뒀다.

이 스파이크는 **코드만 바꾼다.** `web/data/`(A·D·F 가 만든 데이터)와 `data/`, `spikes/01-web-prototype/`
빌드 스크립트는 한 글자도 건드리지 않았다.

## 바뀐 파일

| 파일 | 무엇 |
|---|---|
| `web/index.html` | 사이드 카드·접힌 지도·모달 제거, 플로팅 버튼 + 패널 + 가림막 추가 |
| `web/styles.css` | `.place` 밑줄 제거, 패널/시트/플로팅 버튼/확대 버튼 스타일, 반응형 3단 |
| `web/app.js` | 카드·모달·인라인 카드 코드 제거, 패널 상태 + 지도 조작(휠·드래그·핀치) |
| `web/map.js` | `renderScene(svg, scene, layers, tokens, **view**)` — 확대·이동과 배율별 라벨 LOD |
| `docs/03-prototype-spec.md` | "UI 스펙" 절을 위 내용으로 교체. **데이터 스키마 절은 그대로** |

## 돌리는 법

```
cd web && python3 -m http.server 8000
open http://localhost:8000/#Josh.10
```

빌드 단계 없음, 의존성 없음. 픽스처도 그대로 동작한다: `?data=data-fixture#Josh.10`.

## 검증

Spike 01 의 B·C·E 와 같은 방법 — `python3 -m http.server` +
`Google Chrome --headless=new --remote-debugging-port=…`, Node 25 내장 WebSocket 으로 CDP 직접 호출.
데스크톱 1400×900 · 태블릿 1000×800 · 모바일 360×800(`mobile: true`), 세 장(`#Josh.10` `#Acts.27` `#Gen.12`).
수치는 [RESULT.md](RESULT.md), 스크린샷은 `shots/`.

검증용 디버그 핸들 `window.__antilego = { state, drawMap, setPanel, anchor }` 를 `app.js` 끝에 두었다.
앱 동작에는 관여하지 않는다 (배율을 정확히 3× 로 맞춰 라벨 수를 세기 위해 필요했다).
