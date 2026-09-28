# Spike 10 — 차분한 지형 음영과 기울일 수 있는 지도

2026-09-28 · Codex · 기준 HEAD `4f10644`의 기존 미커밋 Spike 09 변경 위에 적용.

**판정: 채택 — Snow 시각 방향 승인, 로컬 검증 통과.** 실사 대신 차분하면서 상세한 지형에
MapLibre GL JS + 공개 DEM을 연결했다. 2026-09-28 Snow가 현재 결과와 커밋·푸시·웹 배포를 승인했다.
이 기록은 배포 대상 커밋에 포함한다. 배포 성공 여부·커밋은 GitHub Actions와 연결된 Notion 결정에 기록한다.
실물 모바일 성능 판정은 남았다.

## 적용

- 기본은 북쪽이 위인 평면 시점 + 종이색 바탕·옅은 회녹색 지형 음영. 다크 모드는 별도 색상.
- `지형 보기`는 50° 기울이기, 다시 누르면 위에서 보기. 최대 55°, **높이 과장 1배**.
- 데스크톱 Ctrl/오른쪽 드래그, 모바일 두 손가락 평행 이동으로 기울이기. 기본 확대·이동 유지.
- 선택 지명 주변은 근경으로 맞추고, 선택 없으면 이 장의 장소들을 담는다. 기존 SVG보다 더 확대 가능.
- 장·지명·역본 변경 때 지도 인스턴스를 재사용한다. 읽던 본문 위치·해시·지명 데이터는 기존 흐름 유지.
- 기존 Natural Earth 해안선·호수·강, 기존 성경 지명과 시대 자료만 겹친다.
  현대 도로·건물·상호·위성사진·OSM은 도입하지 않았다.
- 지명 점·글자를 한 묶음으로 처리한다. 선택 지명 우선, 충돌하는 나머지는 점도 함께 숨긴다.
  시대 영역은 기존 판정을 그대로 쓰며 옅은 채움·점선·`대략` 표시를 유지한다.
- 지도 아래 현대 지형 참고/고대 복원 아님 안내, 조작 힌트, 원천별 출처를 표시한다.

## 구조·부하

- `web/terrain.js`: 엔진 로더·지형 스타일·카메라·라벨의 독립 어댑터.
  `sceneBounds`/`terrainStyle`은 DOM 없는 계산으로 테스트한다.
- `web/app.js`: 지도 패널에서만 동적 import. 패널이 한 번도 열리지 않으면 엔진·DEM 요청 **0**.
- 기존 `web/map.js`의 SVG를 로딩 중·실패 시 계속 제공한다. 원래 계산 API는 변경하지 않았다.
- 5.20.0 배포 파일을 `web/vendor/maplibre-gl-5.20.0/`에 고정. CDN 런타임 의존 없음.
  원본 라이선스·출처·SHA-256은 같은 폴더에 있다. JS 1,048,625 bytes, gzip 274,620 bytes;
  CSS 70,024 bytes. 실제 압축 전송 여부는 호스트에 달린다.
- 공개 Mapterhorn Terrarium 512px 타일을 현재 범위만 요청. 원천 상세 단계 12까지,
  카메라 확대 12.5까지, 기존 영역 `[8,24,50,43]` 안에서 이동한다.
- worker 2, 동시 이미지 요청 6, pixel ratio 최대 1.5, 소스별 타일 캐시 상한 40 설정.
  음영/입체의 품질을 위해 DEM 소스 둘을 사용하며 동일 URL은 브라우저 HTTP 캐시를 재사용한다.
- 닫힌 패널·숨겨진 탭은 카메라 애니메이션을 멈춘다. 이미 전송 중인 요청은 완료될 수 있다.
  정지 상태에서 연속 렌더링 루프를 추가하지 않았다. 닫힌 후 안정화 상태의 추가 요청 0 확인.
- `간단 지도` 선택은 GPU 인스턴스를 제거하고 선택을 저장한다. `?map=simple`로도 사용 가능.
- 엔진 로드 실패/초기 15초 지형 대기/DEM 오류/WebGL 문맥 손실은 SVG로 복귀한다.
  `지형 다시 시도`로 복구할 수 있다. 본문·역본 로드는 이 실패와 분리한다.
- 동작 줄이기 설정일 때 카메라 전환 애니메이션을 사용하지 않는다.

## 검증

Chrome 헤드리스 + SwiftShader(소프트웨어 GPU), Node 25.8.1. 실제 Mapterhorn 고도 타일 사용.
외부 폰트와 API는 검증 중 차단/대체. 라이브 ESV 본문·API 문의·결제는 하지 않았다.

| 검사 | 통과 |
|---|---:|
| 지형 순수 계산·스타일 계약 | 17 |
| 지형 브라우저: 실제 DEM·입력·실패 복구 | 32 |
| 기존 피커·접근성·ESV·역본 브라우저 회귀 | 351 |
| 기존 SVG 순수 계산 | 8 |
| 기존 CI 계약 | 5 |
| 합계 | **413** |

- 실제 마우스 Ctrl+드래그와 CDP의 두 손가락 touchStart/touchMove/touchEnd로 기울기 변화 확인.
- 선택 지명 표시, 위에서 보기, 시점 초기화, 본문 스크롤 유지, 지도 재사용, 다크 색상,
  모바일 가로 넘침, 원시사 시대 영역 비표시, 간단 지도 저장, 네트워크 장애·재시도·GPU 손실 확인.
- 브라우저 검사의 JS 미처리 예외·console.error **0**. 의도적인 네트워크 차단은 브라우저 네트워크 실패로 나타난다.
- 처음 테스트에서 타일 이벤트의 `sourceDataType`을 잘못 가정해 준비 판정이 늦어지는 문제와,
  지연 로드된 엔진 CSS의 position 우선순위 문제를 수정했다.
- 최종 육안 검사에서 테마 전환 후 지형에 입힌 색상 텍스처가 이전 팔레트를 유지하는 문제를 발견했다.
  테마 변경 시 지형 렌더 캐시를 다시 만들고 색상 전환을 즉시 적용하도록 수정했다.
  기존 소스·카메라는 유지하며, 수정 후 브라우저 32개 검사와 다크 화면을 다시 확인했다.
- 제스처 검사는 위에서 보기 상태에서 **위쪽**으로 드래그해야 기울기가 증가한다.
  아래쪽 드래그는 0° 하한에 머무르는 것이 정상이며, 검증 입력 방향을 정정했다.
- 첫 지형 준비: 약 1.0~2.4초 관측(로컬 정적 파일, 소프트웨어 GPU, 고정되지 않은 인터넷 상태).
  최종 지형 스위트 전체 DEM 요청 49건, 합산 encodedDataLength 4,394,260 bytes.
  **여러 장면·재시도·캐시 삭제를 포함한 전체 스위트 수치이며 최초 지도 용량이 아니다.**
  실물 모바일의 FPS·발열·배터리·메모리 성능으로 일반화하지 않는다.
- 1400×950 데스크톱 평면/3D/다크, 390×844 모바일 3D/실패 화면을 캡처해 육안 확인.
  임시 스크린샷: `/tmp/antilego-10-shots/`. 이전 spike 스크린샷은 보존했다.
- `node --check`, `git diff --check` 통과. Pages의 기존 버전 치환이 app.js의 새 동적 import에도 적용된다.

### 재현

저장소 루트에서:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

별도 터미널에서 전용 프로필의 Chrome을 실행한다. 사용자 기본 프로필을 사용하지 않는다.

```sh
VERIFY_PROFILE=$(mktemp -d /tmp/antilego-10-chrome.XXXXXX)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
  --user-data-dir="$VERIFY_PROFILE" --no-first-run --disable-background-networking \
  --disable-component-update --disable-sync --use-gl=angle --use-angle=swiftshader \
  --enable-unsafe-swiftshader --hide-scrollbars about:blank
```

세 번째 터미널에서 순차 실행(CDP 페이지 공유, 병렬 실행 금지):

```sh
node spikes/10-terrain/verify/unit.mjs
SHOTS_DIR=/tmp/antilego-10-shots node spikes/10-terrain/verify/browser.mjs
node spikes/09-a11y-esv/verify/accessibility.mjs
node spikes/09-a11y-esv/verify/regression.mjs
node spikes/09-a11y-esv/verify/map.mjs
ruby spikes/09-a11y-esv/verify/ci.rb
```

09 회귀 드라이버는 모든 외부 요청을 대체하므로 SVG 대체 경로를 검사한다.
10 브라우저 스위트는 실제 DEM으로 지형 경로를 검사한다. 두 경로를 혼동하지 않는다.

## 출처·판단 기록

Notion 지식 정리 스킬에 따라 기존 Resources DB의 스키마·중복을 확인한 뒤 신규 소스를 등록했다.
자료 등록 후 구현했으며, 엔진 라이선스와 원천별 고도 데이터 라이선스를 구분했다.

- [Resources: MapLibre GL JS](https://app.notion.com/p/3e9d1323042d813eb58bc9fcda0ed297)
- [Resources: Mapterhorn](https://app.notion.com/p/3e9d1323042d8151af64f478fcade3c7)
- [Decisions: Spike 10 채택·배포 기록](https://app.notion.com/p/3e9d1323042d818da724ff95d7f5f96b)
- [MapLibre 3D 공식 예제](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)
- [Mapterhorn 원천별 라이선스](https://mapterhorn.com/attribution/)
- [원천 목록](https://download.mapterhorn.com/attribution.json)

역할 경계 밖의 UI·출처 등록을 수행한 이유: Snow가 시각 방향에 동의하고 직접 구현·적용을 요청했다.
온라인 기록은 소스·결정만, 로컬 RESULT는 구현과 실험 근거를 담는다.

## 남은 한계

- 실물 iPhone/Android에서 조작·메모리·발열 측정 필요. 이번 검증은 기기 에뮬레이션이다.
- 고도는 현대 표면 자료이며 고대 지형 복원이 아니다. 기존 Natural Earth 물 경계와 DEM의
  시점·상세도가 달라 확대 시 일치하지 않을 수 있다. 역사적으로 모호한 정보를 추가 추정하지 않는다.
- 타일 서비스 지속성/SLA를 보장하지 않는다. 자체 호스팅·오프라인 DEM 묶음은 아직 도입하지 않았다.
- 위치 선택 시 주변으로 더 확대되므로 장 전체 비교는 선택 해제 후 확인한다.
- Snow의 로컬 시각 방향 평가는 승인됐다. 실물 갤럭시 S24+에서의 조작·성능 평가는 별도로 필요하다.
