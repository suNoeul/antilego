# Antilego 코드 리뷰

2026-09-21 · 기준 `7672b4916b979c49a6762f364606b82ae353330c` (`main`의 검토 시작 시 HEAD)

## 1. 총평

**지금 상태 그대로의 공유는 보류 권장. 아래 세 묶음을 먼저 고치면 친구 3–4명에게 비상업 테스트용으로 공유할 만하다.** ① 잘못된 지명 매핑·부분 문자열 밑줄을 억제한다(F1·F6). ② 이전 장 이동과 비동기 장 로딩을 바로잡는다(F2·F3). ③ 전체 빌드에서 시대 파일 3개를 반드시 다시 만들고 검사한다(F4). 현재 31,102절의 본문은 로컬 원문과 모두 같고, 데이터 참조·수량·시대 배정도 일관적이다. 다만 일반 동사가 지명으로 표시되고, 제목과 다른 장의 본문이 붙으며, 이전 버튼이 다음 권으로 가는 오류는 읽기 도구의 신뢰를 직접 해친다. UI의 큰 구조를 바꾸기보다 이 오류들과 본문 무수정 검증부터 닫는 편이 좋다.

검토 범위: 지정 순서의 `AGENTS.md`, 문서 4개, spike 6개의 `RESULT.md`, HEAD까지 전체 이력 **22개 커밋**, 지정 코드·산출 데이터. 문서는 이번 요청대로 로컬 스냅샷을 정본으로 삼았다. 모든 코드·산출 데이터는 고정 HEAD에서 읽었고 `web/` 작업 트리는 사용하지 않았다. 로컬 `data/raw/`는 읽기만 했다. 라이브 사이트·피드백 API·Notion 워크스페이스에는 요청하지 않았다. 서버·빌드 실행·설치·커밋 없이, HEAD 소스의 함수와 가짜 응답을 메모리에서 시험했다. 외부 확인은 Notion·라이선스의 공식 공개 문서뿐이다. 아래 줄 번호는 모두 이 HEAD 기준이다.

## 2. 발견

| # | 심각도 | 영역 | 파일:줄 | 문제 | 근거(코드 인용) | 재현 | 최소 수정안 |
|---|---|---|---|---|---|---|---|
| F1 | 높음 | A | [places.ko.json:6248](/Users/snow/Workspace/Antilego/data/derived/places.ko.json:6248), [동일:3786](/Users/snow/Workspace/Antilego/data/derived/places.ko.json:3786), [동일:11090](/Users/snow/Workspace/Antilego/data/derived/places.ko.json:11090), [map_ko.py:224](/Users/snow/Workspace/Antilego/spikes/00-ko-place-mapping/map_ko.py:224) | **지명이 아닌 동사가 높은 신뢰도로 통과한다.** 구절 일치 점수를 이름의 정확성으로 취급한다. | `"en":"Patmos"`에 `"ko":"동참하는"`, `confidence: 0.99`; Chorazin은 `회개하였으리라`, Gadara는 `없을만하더라`. `conf = min(0.99, top["score"])`. | HEAD 장 JSON에서 계 1:9 `[29,33)`=동참하는, 마 11:21 `[77,84)`=회개하였으리라, 마 8:28 `[79,85)`=없을만하더라가 실제 mention. 각각 밧모·고라신·가다라로 연결된다. | 우선 세 ID `a8f60f3`, `a593a48`, `afed46a`를 검증된 오버라이드로 교정하거나 `ko:null`로 억제. 후보 점수와 수동 검증 여부를 분리하고, 같은 형태의 미검증 고신뢰 후보를 점검한다. 본문은 손대지 않는다. |
| F2 | 높음 | A·C | [app.js:350](/Users/snow/Workspace/Antilego/web/app.js:350), [동일:388](/Users/snow/Workspace/Antilego/web/app.js:388) | **장 요청의 응답 순서가 뒤집히면 다른 장 본문이 섞인다.** | `state.data = await getJSON(...)` → `$('verses').append(frag)`; 요청 세대·라우트 확인이 없다. 본문 비우기는 await 이전뿐이다. | 실제 HEAD 함수에 가짜 fetch: Gen.1 요청 → Gen.2 요청 → 2 응답 → 1 응답. 결과 해시·제목은 2장, `state.data.chapter`는 1, 본문은 2장 뒤에 1장이 추가됨. 네트워크 요청 없이 재현. | 요청 시 book/ch와 증가 토큰을 캡처하고, 최신 요청만 상태·DOM·오류·후속 선택/스크롤에 반영. 오래된 `apply()`도 중단. 취소만 믿지 말고 토큰 검사도 둔다. |
| F3 | 높음 | C | [app.js:369](/Users/snow/Workspace/Antilego/web/app.js:369) | **권 첫 장에서 이전을 누르면 다음 권으로 가는 경우가 있다.** | 첫 `if`에서 이전 권의 끝 장을 넣은 뒤, 독립된 다음 `if (ch > books[i].chapters)`가 원래 권의 장 수와 비교하고 `bi = i + 1`로 덮는다. | 실제 HEAD `step(-1)`에 66권 index를 입력: 출 1 → 레 1(정답 창 50). 이전 권이 있는 65개 경계 중 **34개 실패**. | 두 번째 분기를 `else if`로 바꾼다. 66권 앞뒤 경계 회귀 테스트를 추가한다. |
| F4 | 중간 | A·E | [build.py:283](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:283), [동일:347](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:347), [export_web.py:128](/Users/snow/Workspace/Antilego/spikes/03-eras/export_web.py:128), [validate.py:17](/Users/snow/Workspace/Antilego/spikes/03-eras/validate.py:17) | **알려진 시대 파일 삭제 버그가 HEAD에도 남아 있고 검증기가 놓친다.** | `shutil.rmtree(WEB_DATA)` 뒤에는 본문·index·places·attribution·기본 geo만 생성. 시대 export 호출 없음. 검증기는 시대 정보를 `data/derived/`에서 읽는다. | 코드 경로: `build.py` 단독 실행 → `eras.json`, `chapter_eras.json`, `geo/era_regions.json` 삭제 → 재생성 없음. 실제 파괴적 빌드는 실행하지 않음. 별도 메모리 시험에서 web 시대 3개를 읽을 수 없게 해도 HEAD 검증기는 **PASS**. UI는 [app.js:1249](/Users/snow/Workspace/Antilego/web/app.js:1249)의 catch로 조용히 시대 기능을 숨김. | 가장 작은 통합 수정: `build_geo.build` 다음에 `runpy.run_path(str(ROOT / "spikes/03-eras/export_web.py"), run_name="__main__")` 호출(`import runpy` 추가). 완료 검사에 web 시대 3개 존재·JSON 해석·derived와의 배정 일치를 추가. 수동 복사에 의존하지 않는다. |
| F5 | 중간 | A | [krv.py:64](/Users/snow/Workspace/Antilego/spikes/00-ko-place-mapping/krv.py:64), [동일:75](/Users/snow/Workspace/Antilego/spikes/00-ko-place-mapping/krv.py:75), [build.py:401](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:401) | **본문 무수정은 현재 데이터에서는 성립하지만 파이프라인이 보장하지 않는다. 해시도 비교가 아니다.** | 주 로더가 `v["text"].strip()`. 해시는 `for osis in sorted(text)`로 이미 읽은 입력만 순회해 출력한다. 산출 JSON 재독해·원본 대조·assert 없음; `31,102절`은 출력 문자열의 상수. | 원문 앞뒤에 공백이 있는 입력이면 로더가 제거한다. 산출 JSON이 달라도 현재 해시 코드는 입력만 보므로 발견하지 못한다. **이번 전수 대조에서 실제 공백 제거·본문 차이는 0건**. | 주 로더에서 strip 제거. 변환 전 원문과 다시 읽은 산출물의 절 키 집합·절별 문자열을 전수 비교하고 실패 시 종료. 해시는 양쪽을 같은 포맷으로 계산. BMP 또는 UTF-16 오프셋 변환도 빌드 검사에 포함. |
| F6 | 중간 | A | [build.py:188](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:188), [overrides:210](/Users/snow/Workspace/Antilego/data/derived/places.ko.overrides.json:210), [동일:65](/Users/snow/Workspace/Antilego/data/derived/places.ko.overrides.json:65) | **1음절·접두어 매핑이 다른 단어와 인물·지파까지 표시한다. 알려진 결함이 그대로다.** | `i = text.find(needle, i)`에는 단어 경계·의미 구분이 없다. 오버라이드 자체도 `워단`, `단 자손`, `유대인` 오탐을 명시한다. | 겔 27:19의 `워[단]` `[1,2)`가 Dan. 행 2:14의 `[유대]인들` `[30,32)`이 Judea. 유대인 내부 밑줄은 전수 검사에서 7개. | 즉시 안전책은 해당 매핑 억제. 유지하려면 검토한 절·출현별 제외표를 추가한다. 한글 어절 경계+조사 허용 규칙으로 접두어 오탐을 막되, 지파·인명처럼 문자열만으로 구별 못 하는 것은 별도 억제한다. |
| F7 | 중간 | C | [app.js:724](/Users/snow/Workspace/Antilego/web/app.js:724), [동일:859](/Users/snow/Workspace/Antilego/web/app.js:859), [동일:971](/Users/snow/Workspace/Antilego/web/app.js:971) | **피커의 장·절 격자는 키보드로 다른 숫자를 고를 수 없고, 권 목록은 화살표 후 포커스를 잃는다.** | 숫자는 `b.tabIndex = i === (cur \|\| 1) ? 0 : -1`; 화살표 핸들러는 검색 입력·`col-book`만 처리. `moveHi()`는 `renderBooks()`로 노드를 지운 뒤 `contains(document.activeElement)`를 검사한다. | 코드상 키 경로: Tab으로 장의 현재 숫자 진입 → 다른 숫자는 Tab 대상도 아니고 방향키 처리도 없음. 권 버튼에 포커스 → ↓ → 기존 버튼 교체 후 재포커스 조건 실패. 실브라우저 조작은 미실시. | 각 목록에 roving tabindex와 방향키·Home/End 이동 추가. 권 목록 재렌더 전에 포커스 위치를 기억하고 새 항목에 복원. |
| F8 | 중간 | C | [app.js:886](/Users/snow/Workspace/Antilego/web/app.js:886), [동일:908](/Users/snow/Workspace/Antilego/web/app.js:908), [동일:972](/Users/snow/Workspace/Antilego/web/app.js:972), [동일:1275](/Users/snow/Workspace/Antilego/web/app.js:1275), [styles.css:830](/Users/snow/Workspace/Antilego/web/styles.css:830) | **모바일 피커의 포커스·Tab·Esc 경로가 모달 선언과 맞지 않는다. Esc 우선순위도 포커스 위치에 따라 달라진다.** | 모바일은 `.focus()` 없음. 전역 키 처리에서 `if (pick.open) return`. `tabTargets()`는 `display:none`인 열도 포함. 피커 Esc는 `stopPropagation()` 후 즉시 닫기. | 모바일에서 loc에 포커스를 둔 채 열면 Esc가 피커에 도달하지 않고 전역에서도 무시됨. 피커 내부 Tab은 숨은 열에 포커스를 시도. 피드백과 피커가 열린 상태에서 피커에 포커스가 있으면 위의 피드백보다 피커가 먼저 닫힘. | 모바일은 검색 입력 대신 닫기 버튼/컨테이너에 포커스(키보드 자동 노출 없이). Tab 대상은 현재 보이는 열·뒤로·칩만. Esc는 전역 한 곳에서 최상위 열린 UI를 닫고 포커스 복원. |
| F9 | 중간 | C | [app.js:1062](/Users/snow/Workspace/Antilego/web/app.js:1062), [동일:1147](/Users/snow/Workspace/Antilego/web/app.js:1147) | **피드백 전송 중 새로 쓴 글이 성공 응답에 지워진다.** | 잠그는 것은 `$('fb-send').disabled`뿐. 전송할 `text`를 캡처한 뒤 await하고 성공하면 현재 `$('fb-text').value = ''`. | HEAD 함수+가짜 fetch로 기존 글 전송 시작 → 응답 전 새 글 입력 → 성공. 서버로 보낸 것은 기존 글, 현재 새 글은 빈 문자열이 됨. 실제 API 호출 없음. | 전송 중 내용·위치 편집을 잠그거나, 제출 당시 값/편집 버전과 같을 때만 비우고 자동 닫기. |
| F10 | 중간 | C | [app.js:74](/Users/snow/Workspace/Antilego/web/app.js:74), [동일:393](/Users/snow/Workspace/Antilego/web/app.js:393), [동일:1292](/Users/snow/Workspace/Antilego/web/app.js:1292) | **형식이 맞는 잘못된 해시가 상태·마지막 위치에 저장된다.** | 정규식은 권 존재·장 범위를 검사하지 않는다. `state.book = r.book; state.ch = r.ch` 후 `ls.set('last', ...)`. 복원 시에도 책만 확인. | `#Foo.999`, `#Gen.0`, `#Gen.999` 모두 파싱 성공. 존재하지 않는 JSON 요청 후 한국어 실패 문구; Foo는 앞뒤 버튼 모두 비활성. Gen.0/999는 빈 해시 재방문에도 복원됨. | index를 이용해 알려진 book·정수 `1..chapters` 검사 후 상태/저장소 갱신. 오류는 유효한 기본 위치로 복구. 저장된 last도 같은 검증 함수 사용. |
| F11 | 중간 | D | [attribution.json:1](/Users/snow/Workspace/Antilego/web/data/attribution.json:1), [app.js:1252](/Users/snow/Workspace/Antilego/web/app.js:1252), [build.py:103](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:103) | **CC BY 출처 이름은 있지만 라이선스 링크·가공 표시가 없다.** | 문자열은 `OpenBible.info ... (CC BY 4.0)`, `STEPBible TIPNR (CC BY 4.0)`뿐. `attrLine`을 `textContent`로만 삽입; 사용자가 따라갈 소스/라이선스 링크 없음. | 커밋된 footer/panel 경로와 attribution 4문자열 확인. 소스 선별·한글 매핑·좌표 선택을 한 파생물인데 변경 고지가 없다. 아래 CC 공식 조건 참조. | 출처별 저작자·원본 링크·CC BY 4.0 링크와 “선별·한글 매핑·좌표 가공” 등의 변경 고지를 연결된 출처 안내에 둔다. TIPNR 원문의 Tyndale House Cambridge 표기도 함께 보존. |
| F12 | 낮음 | A·E | [build.py:183](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:183) | **조사 제거 후 1음절이 되면 재시도하지 않는다. 스펙에 없는 예외다.** | `len(ko) - len(j) >= MIN_KO_LEN`, `MIN_KO_LEN = 2`. 원래부터 `ko='단'`이면 길이 제한 없이 찾는 것과 다름. | 메모리 시험: `locate('단으로', '단에서')` → 빈 목록. 두 낱말 원형은 정상. 현재 단 오버라이드는 `ko='단'`이므로 이 누락에 해당하지 않음. | 안전 우선이면 문서에 “조사 제거 후 2음절 이상, 검증된 1음절 별도 허용”을 명시. 계약대로 바꿀 경우 단순히 문턱만 낮추지 말고 F6의 출현별 검증과 함께 허용. |
| F13 | 낮음 | B | [feedback.js:67](/Users/snow/Workspace/Antilego/api/api/feedback.js:67), [동일:82](/Users/snow/Workspace/Antilego/api/api/feedback.js:82) | **피드백 링크의 localhost 검사로 외부 주소가 통과한다.** | 정규식 localhost 분기에 호스트 끝 경계가 없고, 허용된 URL의 길이 제한도 없다. | HEAD `validate()`에 `http://localhost.evil.example/x`, `http://localhost@evil.example/` 입력 → 둘 다 Notion 링크로 보존. **CORS 우회나 서버 측 URL 접속/SSRF는 아님**; 저장 링크 검증 문제. | `new URL()`로 프로토콜·hostname·pathname·자격정보를 분리 검사하고 URL 최대 길이 추가. production은 정확한 origin과 `/antilego/` 경로, 개발 호스트는 정확히 localhost/127.0.0.1만. |
| F14 | 낮음 | C·E | [map.js:85](/Users/snow/Workspace/Antilego/web/map.js:85), [동일:139](/Users/snow/Workspace/Antilego/web/map.js:139) | **`renderScene`은 순수 함수/DOM 독립 함수가 아니다.** | `document.createElementNS`, `svgEl.clientWidth/clientHeight`, `svgEl.textContent = ''`. 입력 밖 전역 DOM을 쓰고 대상 DOM을 변경한다. | DOM 없는 환경에서 유효한 SVG 대역을 넘겨도 첫 요소 생성에 전역 `document`가 필요. 반면 `sceneFrame`·`frameBounds`·`clampView`·`zoomAt`은 분리 가능한 계산부. | 현재 명칭을 “DOM 렌더 어댑터”로 정정. 다음 단계에서 W/H를 받는 순수 레이아웃 계산과 SVG 적용을 나눈다. 당장 지도 전면 재작성은 불필요. |
| F15 | 낮음 | B | [pages.yml:11](/Users/snow/Workspace/Antilego/.github/workflows/pages.yml:11) | **Pages 쓰기·OIDC 권한이 빌드 job에도 배포된다.** | 최상위 `permissions`에 `pages: write`, `id-token: write`; build에서 덮어쓰지 않음. | workflow의 권한 상속으로 build와 deploy가 같은 권한을 받음. 악용/유출을 관찰했다는 뜻은 아님. | 기본은 `contents: read`; deploy job에만 `pages: write`, `id-token: write` 부여. 필요한 read 권한은 job별로 명시. |

### 확인함 — 문제 없는 부분

- **밑줄 기본 계약:** `build.py:242–267`의 OB 구절 목록 ∧ ko 존재 ∧ confidence ≥0.6 ∧ 좌표 조건과 산출 mentions를 전수 대조했다. 7,417개 모두 일치; 정렬·겹침·없는 place 참조·장별/전체 횟수 불일치 0건. 이것은 매핑의 의미 정확성을 보증하지 않는다(F1·F6).
- **반복·두 낱말·긴 것 우선:** 같은 절/지명이 여러 번 등장하는 466쌍을 포함해 일치. 행 27:27의 `아드리아 바다` `[18,25)` 정상. 합성 입력의 두 번 출현도 둘 다 반환. `resolve_overlaps()`는 길이 내림차순 채택 후 시작순 정렬이다.
- **오버라이드:** 자동 사전 → 수동 72건 순서. 수동 `conf:1.0`이 자동 점수를 대체하여 낮은 자동 점수를 넘긴다. **manual이라는 이유로 문턱을 무조건 건너뛰지는 않는다**; conf 생략 시 0이다. `ko:null`인 `af084cf`는 ko 검사에서 제외되며 실제 산출 mentions/places 모두 0건이다.
- **현재 본문·인덱스:** 로컬 bluesaurel 원문을 strip 없이 직접 읽어 HEAD 1,189장/31,102절과 대조. 절 키·문자열 차이 0, strip으로 달라질 원문 0, 비BMP 문자 포함 절 0. 같은 `OSIS + TAB + text + LF`를 OSIS 정렬로 해시한 양쪽 값은 `68d7c7e6cec9cb446a468c512b8dea6da34ce73e1f5d561948f07c4c8f1c850c`. [krv.py:102](/Users/snow/Workspace/Antilego/spikes/00-ko-place-mapping/krv.py:102)의 구두점 제거·옛 표기 정규화는 판본 비교용이며 web 본문 export 경로에서 호출하지 않는다.
- **현재 UTF-16·XSS:** 현재 본문 전체가 BMP여서 Python 인덱스와 JS UTF-16 인덱스가 같다. 본문은 [app.js:306](/Users/snow/Workspace/Antilego/web/app.js:306)의 TextNode/`textContent`/`slice` 경로, 지도 지명도 [map.js:326](/Users/snow/Workspace/Antilego/web/map.js:326)의 `textContent`. 유일한 `insertAdjacentHTML`([app.js:217](/Users/snow/Workspace/Antilego/web/app.js:217))은 고정 빈 요소 템플릿이고 외부 문자열 보간이 없다. 피드백 위치·오류도 `textContent`, 전송은 JSON, API는 Notion plain rich_text를 사용한다. 본문·지명·피드백 입력을 HTML로 실행하는 경로는 발견하지 못했다.
- **시대 배정:** 1,189장 모두 derived와 web의 default+ranges 해석이 같다. range 중복·범위 밖·미등록 era·미등록/누락 권 검사 존재. ranges 사이 빈 구간은 default가 덮으므로 그 자체는 누락이 아니다. web Feature 68개=blob 40+label_only 28, blob 대표점 모두 내부, primeval/undated Feature 0개. 배포 파일 검사는 별개로 F4.
- **리스너·저장소:** 지도/피커/피드백 리스너는 boot에서 한 번 묶고 열기·닫기·장 이동에서 재등록하지 않는다([app.js:1256](/Users/snow/Workspace/Antilego/web/app.js:1256)). `map.js`는 매번 바뀌는 SVG 자식에 리스너를 붙이지 않는다. 반복 조작에 따른 명백한 누수 경로 없음. 모든 직접 `localStorage` 접근은 [app.js:29](/Users/snow/Workspace/Antilego/web/app.js:29)의 try/catch 두 곳뿐이다.
- **CORS·입력·에러:** origin 허용은 production의 정확한 origin 및 http localhost/127.0.0.1의 임의 포트; 악성 접미 호스트는 CORS 정규식에서 거절. Origin 없는 POST는 의도적으로 허용. 비허용 OPTIONS도 204지만 Allow-Origin이 없어 브라우저 사용은 허용되지 않는다. 허니팟은 저장 없이 200. 내용 2,000/이름 40은 거절, 위치 120은 절삭. Notion 오류는 고정 한국어 502로 바뀌어 클라이언트에 상세가 새지 않는다. HEAD API 모의 테스트 **24/24 통과**(fetch 대역, 외부 쓰기 없음).
- **ignore·이력:** `git check-ignore --no-index`로 `api/.env`, `.env.local`, `.env.production`, 루트/api의 `.vercel/`, `data/raw/`, `.venv/` 차단 확인. HEAD 추적 파일에 해당 비밀 경로 없음. HEAD 도달 가능 22개 커밋에서 `ntn_`/긴 `secret_`/GitHub 토큰/개인키 패턴 발견 0. `git log -p -- api`의 `ntn_` 3건은 모두 `ntn_…` 문서 예시다. 모든 종류의 비밀이 없다는 증명은 아니다.
- **배포:** [pages.yml:24](/Users/snow/Workspace/Antilego/.github/workflows/pages.yml:24)의 checkout 후 `sed`가 runner 사본의 `web/index.html`, `web/app.js`만 치환한다. git commit/push 단계 없음. artifact는 `path: web`만 업로드하므로 api/raw를 배포하지 않는다.
- **금지 소스·표기:** 주 본문 로더는 KRV를 선택하고 산출 전수 대조도 일치. 개역개정 별도 로더/산출본·광고/결제 코드는 발견하지 못했다. [build_geo.py:25](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build_geo.py:25)의 입력은 Natural Earth 3종이고 커밋된 geo meta도 같은 출처다. 직접 OSM 입력·타일 경로 없음. 개역한글 제목·대한성서공회 성명표시, Natural Earth PD 표기는 존재한다. CC 조건의 빈틈은 F11.

### 검토 항목별 판정 (1–17)

| 항목 | 판정 | 요약 |
|---|---|---|
| A1 밑줄 규칙·경계 | 문제 있음 | 기본 AND·반복·두 낱말·겹침은 일치. 의미 오답 F1·F6, 1음절 조사 재시도 예외 F12. |
| A2 오버라이드 순서·억제 | 확인함 | 자동→수동, 수동 conf로 재평가. null 억제 확실. |
| A3 시대 파일 삭제 | 문제 있음 | F4. 삭제·재생성 누락 경로 확인, 파괴적 실실행은 하지 않음. |
| A4 본문 무수정·해시 | 문제 있음 | 현재 전수 동일. 로더 strip과 입력만 해시하는 보장 결함 F5. |
| A5 UTF-16·XSS | 확인함 | 현재 데이터 BMP 전수 확인, 동적 문자열 HTML sink 없음. 미래 입력의 BMP를 강제하는 코드는 없어 F5의 검사 필요. |
| A6 시대 ranges·검증 | 문제 있음 | 해석과 구간 검사는 충분하고 현재 전수 일치. 배포 산출물을 검사하지 않아 F4를 놓침. |
| B7 API 보안·운영 | 문제 있음 | 저장 URL 검사 F13. 나머지 방어는 위 확인함, 서버리스/Notion/로그 한계는 아래 운영 판정. |
| B8 ignore·비밀 이력 | 확인함 | 지정 경로 차단 및 도달 가능한 전체 이력 패턴 검사. 삭제된 원격 이력·운영 비밀은 판단 불가. |
| B9 CI 권한·치환 | 문제 있음 | job별 최소 권한은 F15. 치환은 체크아웃 사본에만 적용됨. |
| C10 지도 순수성·비용·누수 | 문제 있음 | 순수성 F14. 입력 이벤트마다 전체 SVG 재생성은 확인; 성능 목표 달성·장시간 메모리는 판단 불가. |
| C11 localStorage | 확인함 | 전부 try/catch 래퍼 경유. 실기기 Safari 시험은 하지 않음. |
| C12 라우팅 | 문제 있음 | F10, 앞뒤 이동 F3, 요청 경쟁 F2. 문법 불일치는 Gen.1 복구. 빈 해시는 유효 권의 last 또는 Gen.1. |
| C13 접근성 | 문제 있음 | 실제 button·aria-pressed/expanded·dialog/listbox·이름은 존재. 키 이동·포커스·Esc는 F7·F8. 패널도 [app.js:293](/Users/snow/Workspace/Antilego/web/app.js:293)에서 `setAttribute('aria-hidden', String(!state.open))`만 갱신하고 focus 복원은 없다. 내부 확대 버튼에서 Esc로 닫을 때 지도 열기 버튼으로 돌려줄 필요가 있다. |
| C14 360px 가로 스크롤 | 판단 불가 | CSS 근거는 아래. 실제 렌더링의 scrollWidth/키보드/폰트 조합 미측정. |
| D15 라이선스·금지 소스 | 문제 있음 | F11. 성명표시·NE PD·KRV 선택·직접 OSM 미사용은 확인. 원본 판본의 권위까지 독립 감정하지는 않음. |
| E16 중복·분리 경계 | 확인함 | 아래 5줄 제안. import 부작용도 경계 밖으로 이동할 대상. |
| E17 스펙 드리프트 | 문제 있음 | 아래 문서↔코드 대조표. |

### 운영·성능 판정 보충

| 대상 | 확인한 사실 / 최소 대응 |
|---|---|
| 레이트 리밋 | [feedback.js:35](/Users/snow/Workspace/Antilego/api/api/feedback.js:35)의 Map은 인스턴스별 5회/분·30회/일. cold start/다중 인스턴스에서 합산되지 않는다. CORS·허니팟은 인증이 아니므로 Origin을 생략하는 직접 요청을 막지 못한다. 소규모 테스트의 best-effort로는 문서와 일치; 엄격한 상한이 필요하면 공유 원자 카운터 또는 플랫폼 방어가 필요하다. X-Forwarded-For의 실제 신뢰 경계는 운영 환경 확인 전 단정하지 않는다. |
| 입력 총량 | 텍스트/이름 제한은 있지만 URL 길이와 전체 요청 바이트 제한은 자체 코드에 없다. [feedback.js:192](/Users/snow/Workspace/Antilego/api/api/feedback.js:192)의 스트림 경로는 모든 chunk를 모은 뒤 파싱한다. 배포 플랫폼의 상한은 이번에 검증하지 않았다. 명시적 본문 바이트 상한과 URL 제한을 두면 로컬/배포 차이를 줄일 수 있다. |
| 로그·토큰 | 토큰은 환경변수에서 Authorization 헤더로만 전달하며 직접 출력하지 않는다. 다만 [feedback.js:175](/Users/snow/Workspace/Antilego/api/api/feedback.js:175)는 upstream 본문 400자를, :180은 예외 메시지를 무마스킹 출력한다. “어떤 에러에도 비밀이 로그에 남지 않는다”는 보장은 없다. 실제 토큰 유출 증거는 없음. status·허용된 error code만 기록하거나 토큰/민감값 제거 후 기록하고, 모의 오류 로그 검사를 추가하는 것이 안전하다. |
| Notion API 버전 | [feedback.js:7](/Users/snow/Workspace/Antilego/api/api/feedback.js:7)의 `2022-06-28` + :103의 `parent.database_id`는 단일 데이터 소스 조건에서 동작한다. **현재 장애라고 판정하지 않는다.** 두 번째 소스 추가 시 구버전 요청이 실패하는 조건은 [Notion 공식 FAQ](https://developers.notion.com/guides/get-started/upgrade-faqs-2025-09-03)와 코드 주석이 일치한다. 즉시 완화는 피드백 DB를 단일 소스로 유지. 이전할 때는 `2025-09-03` 이상 버전과 `parent.data_source_id`, 명시적 `NOTION_DATA_SOURCE_ID`를 함께 바꾸고 payload 테스트도 갱신한다. DB ID를 재사용하거나 첫 소스를 무조건 선택하지 말고 DB의 `data_sources`에서 의도한 소스를 확인한다. 실제 소스 수/권한은 미조회. |
| 지도 재렌더 비용 | [map.js:150](/Users/snow/Workspace/Antilego/web/map.js:150)에서 SVG를 비우고 :173 이하 및 :346의 geoPath로 모든 좌표/path·라벨을 다시 계산한다. [app.js:428](/Users/snow/Workspace/Antilego/web/app.js:428)의 wheel과 :458의 pointermove는 직접 drawMap 호출; resize만 :160에서 rAF로 묶는다. 프레임당 한 번으로 제한된 구조는 아니다. 성능 저하를 측정했다는 뜻은 아니며, 느린 기기에서 확인되면 이동/휠도 최신 view를 rAF 한 번에 반영하는 것이 작은 개선이다. |
| Esc 계약 | 사용자 점검 항목의 나열 순서와 별개로, 최신 정본 문서 :305는 피커>패널, :429는 피드백>피커라고 정한다. 따라서 기대 순서는 **피드백 → 피커 → 패널**. 현재 전역 처리는 이 순서지만 피커 내부 stopPropagation과 외부 포커스 때문에 일관되지 않는다(F8). |
| 360px CSS | 전역 border-box(:84), 본문/열의 축소 가능 폭, 모바일 panel `left/right:0; width:auto`(:498), picker `inset:0; width:auto`(:737), feedback 모바일 폭 덮어쓰기(:995)가 고정폭 초과를 막는다. 데스크톱 picker의 `min(880px, calc(100vw - 32px))`(:554), feedback의 `max-width`(:847), 초성 줄 내부 overflow도 제한돼 있다. 단 `html { overflow-x:hidden }`(:95)은 넘침을 가릴 수 있으므로 실제 가로 넘침 0의 증거로 삼지 않았다. 줄 번호는 [styles.css](/Users/snow/Workspace/Antilego/web/styles.css) 기준. |
| 출처 의무 | [CC BY 4.0 공식 안내](https://creativecommons.org/licenses/by/4.0/deed.ko)는 출처·라이선스 링크·변경 고지를 요구한다(F11). [Natural Earth 공식 약관](https://www.naturalearthdata.com/about/terms-of-use/)상 데이터는 PD이고 성명표시는 의무가 아니다. [대한성서공회 FAQ](https://www.bskorea.or.kr/bbs/board.php?bo_table=copyright_faq&wr_id=5)의 성명표시·동일성유지 조건에 대해 전자는 화면 문자열로 확인, 후자는 로컬 원문 대비 전수 동일만 확인했다. 법률 자문이나 판본 인증이 아닌 구현/고지 점검이다. |

## 3. 스펙 드리프트

문서는 [docs/03-prototype-spec.md](/Users/snow/Workspace/Antilego/docs/03-prototype-spec.md) 기준. 고쳐야 할 코드와 오래된 설명을 구분했다.

| 문서 문장 | 코드 위치·현재 동작 | 정리 방향 |
|---|---|---|
| :53 “text는 … 원문 그대로” | [krv.py:64](/Users/snow/Workspace/Antilego/spikes/00-ko-place-mapping/krv.py:64) `v["text"].strip()` | F5. 코드에서 변형 제거·전수 대조. 현재 출력은 동일. |
| :54 “s,e는 … JS 문자열 인덱스” | [build.py:195](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:195) Python 문자열 길이 사용 | 현재 BMP라 일치하지만 조건부 구현. BMP 불변식 검증 또는 UTF-16 변환을 계약에 명시. |
| :59 “조사 … 하나를 뗀 형태로 재시도” | [build.py:183](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:183) 제거 후 2음절 미만 제외 | F12. 안전 예외를 문서화하거나 검증된 1음절만 허용. |
| :14 “data/ A가 build.py로 생성”, :80 이하 시대 3종 추가 | [build.py:283](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:283)는 전부 삭제, [export_web.py:113](/Users/snow/Workspace/Antilego/spikes/03-eras/export_web.py:113)는 별도 실행 | F4. 전체 산출물 생성 진입점 하나로 연결. |
| :198 “순수 함수 renderScene” | [map.js:85](/Users/snow/Workspace/Antilego/web/map.js:85) 전역 document, :144 실측, :150 DOM 변경 | F14. 렌더 어댑터로 정정; 순수 계산부만 따로 지칭. |
| :234 점 반지름 3/5, 글자 12/14 | [map.js:35](/Users/snow/Workspace/Antilego/web/map.js:35)의 상수는 2/4, 11/13. 문서 :174–175도 이미 새 수치 | 오래된 LOD 설명을 새 수치로 통일. 구현을 되돌릴 이유 없음. |
| :291 blob 채움 22–26% | [styles.css:60](/Users/snow/Workspace/Antilego/web/styles.css:60) 다크 `--region-b`는 .20 | 다크 예외 명시 또는 토큰 통일. 낮은 영향. |
| :342–343 “↑/↓ 커서 이동 … Tab 입력→성경권→장→절” | [app.js:741](/Users/snow/Workspace/Antilego/web/app.js:741), :974 숫자 키 이동 없음; :908 숨은 열까지 Tab 대상 | F7·F8. 숫자 roving focus 및 모바일별 대상 구현. |
| :429 “Esc는 피드백 카드가 피커보다 먼저” | [app.js:972](/Users/snow/Workspace/Antilego/web/app.js:972) 피커 내부에서 전파 중단 | F8. 단일 우선순위 처리로 통일. |
| :444 “로드 시 해시 없으면 #Gen.1” | [app.js:1292](/Users/snow/Workspace/Antilego/web/app.js:1292) last가 있으면 복원 | 의도된 기억 기능으로 보임. “유효한 last 우선, 없으면 Gen.1”로 문서 정정 + F10 검증. |
| :453 “모든 fetch 실패는 본문 … 에러” | [app.js:648](/Users/snow/Workspace/Antilego/web/app.js:648)의 절 수 실패는 0, :1249 시대 실패는 조용히 숨김 | 문서 :280–281은 시대 무음 실패를 이미 의도한다. 일반 문장을 필수 데이터/선택 데이터로 나누고 피커 실패 표시는 별도 정한다. |

## 4. 코어 라이브러리 분리 제안 (5줄)

1. 중복된 OpenBible JSONL 읽기([build_places.py:80](/Users/snow/Workspace/Antilego/spikes/00-ko-place-mapping/build_places.py:80), [build.py:118](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:118))와 `krv.py`의 원문·권 메타를 입력 어댑터로 모으되, 좌표 선택 정책과 원문 보존은 분리한다.
2. 조사 후보 처리([map_ko.py:82](/Users/snow/Workspace/Antilego/spikes/00-ko-place-mapping/map_ko.py:82), [build.py:179](/Users/snow/Workspace/Antilego/spikes/01-web-prototype/build.py:179))의 공통 부분·오버라이드·`locate`·겹침 해소를 순수 mention 코어로 뽑는다. 후보 검색용 정규화와 실제 본문/최종 표시 정책은 섞지 않고 spans+제외 사유를 반환한다.
3. 시대 `default+ranges` 해석·검증·export 필드 계약을 한 모듈로 묶는다. `build_geo.py`/`build_regions.py`의 읽기·클리핑·직렬화는 재사용하되 지형 단순화와 역사 영역 추정은 분리한다.
4. `build.py`, `export_web.py`, `rebuild_index.py`는 코어를 부르는 얇은 CLI로 만든다. AST로 다른 스크립트 상수를 꺼내는 결합과 import 시 mkdir를 없애고, 산출물 소유권/검증을 한 곳에서 조정한다.
5. `map.js`의 scene/frame/투영/배치와 `app.js`의 라우트·검색 파서를 DOM 없는 코어로 옮긴다. SVG·fetch·storage·이벤트·Notion은 경계 밖 어댑터로 남긴다.

## 5. 판단 불가와 범위

| 항목 | 이유 |
|---|---|
| 라이브 배포가 이 HEAD와 같은지, 실제 API/Notion DB 상태·권한·데이터 소스 수 | 요청에 따라 라이브/워크스페이스 미접속. Vercel 환경변수·배포 로그도 읽지 않음. |
| Safari private mode, 360px 실제 가로 넘침, 화면 키보드·스크린리더·포커스의 브라우저별 동작 | 서버·브라우저 렌더 실행 없이 정적 검토. 키보드 결함은 코드 경로상 근거가 있지만 실기기 접근성 적합 판정은 별개. |
| 지도 50ms 목표, 지속 제스처 FPS, 장시간 heap 누수 | 프로파일링 미실시. 전체 재생성 비용과 리스너 등록 위치까지만 확인. |
| 실제 upstream 에러에 비밀이 포함된 적 있는지, 모든 과거 비밀 유출 여부 | 도달 가능한 HEAD 이력의 지정 패턴 검사만 실시. reflog·지워진/원격 전용 이력·운영 로그·미지의 비밀 형식은 검사하지 않음. |
| 지도 모든 위치·역사 영역의 학술적 정확성, KRV 전자본이 공인 판본과 완전히 같은지 | 선택된 로컬 소스와 파생물 일치 및 명백한 매핑 오류를 검토했을 뿐, 공인 전자본/전문가 전수 감정은 아님. 시대 전역 묶음은 스펙대로이며 장별 정밀 연대표로 해석하면 안 됨. |
| 전체 빌드·배포 재현 | 빌드는 web/data와 spike 보고서를 쓰므로 금지 범위. destructive 경로는 코드 추적, 검증기/비동기 동작은 메모리 대역으로만 시험. `data/raw/`는 존재했으므로 원문·mention 전수 대조 자체에는 제한 없었음. |

이번 리뷰가 만든 파일은 이 `REVIEW.md` 하나다. 코드 수정안은 제안만 했으며 적용하지 않았다.
