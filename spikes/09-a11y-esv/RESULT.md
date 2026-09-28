# Spike 09 — 피커 접근성 · ESV 키 미설정 안내 · CI

2026-09-28 · Codex · 기준 HEAD `4f10644` · 워킹 트리에서 검증, 커밋·푸시·배포 없음.

같은 날 후속 승인: Snow가 Spike 10 지도 결과와 함께 현재 변경의 커밋·푸시·웹 배포를 요청했다.
아래는 배포 전 검증 기록이며, 배포 결과는 GitHub Actions와 Spike 10의 연결된 Notion 결정에서 확인한다.

**판정: 로컬 통과.** 브라우저 **351 단언**, DOM 없는 지도 계산 **8 단언**,
CI **5 계약** 모두 PASS. `console.error`·미처리 예외 **0건**.
리뷰 F7·F8·F14의 이번 범위를 반영했다. 실제 Pages 실행과 ESV 운영 검증은 배포 후 확인 대상이다.

## 변경과 근거

| 항목 | 변경 | 주요 위치 |
|---|---|---|
| F7 | 권 목록 재렌더 전 포커스 기억, Home/End 지원. 장·절은 실제 버튼 순서의 roving tabindex + ←→↑↓/Home/End | `web/app.js`: `moveHi`, `numGrid`, `moveNumber`, `bindPicker` |
| F8 | 모바일 열림은 닫기 버튼, 단계 이동·칩 재렌더·화면 폭 변경 후 포커스 복원. 보이는 컨트롤만 Tab/Shift+Tab 순환 | `web/app.js`: `openPicker`, `tabTargets`, `cycleTab`, `bindPicker`, resize |
| Esc | 전역 처리 하나로 피드백 → 피커 → 역본 메뉴 → 지도 순서. 각 UI의 내부 Esc/stopPropagation 제거. 닫으면 연 버튼으로 복원 | `web/app.js`: boot keydown, `setPanel`, `closePicker`, `closeFb` |
| F14 | `renderScene`을 DOM 렌더 어댑터로 정정. 순수 계산 API 네 개와 DOM 적용 API의 경계를 주석·스펙에 표시 | `web/map.js`, `docs/03-prototype-spec.md` |
| ESV | 선택 전 `온라인 · 키 없음` 꼬리표. 실패 시 마지막 정적 역본 복귀 버튼, 동일 ESV 선택으로 재시도. 실제 성공 시 태그 해제 | `web/index.html`, `web/app.js`: 역본 메뉴·`showOnlineError`·`loadChapter` |
| CI | checkout v7 / configure-pages v6 / upload-pages-artifact v5 / deploy-pages v5 | `.github/workflows/pages.yml` |

`web/styles.css`와 `web/nav.js`는 수정할 필요가 없었다. 기존 CSS 격자의 계산된 열 수를 사용한다.
본문·장 해시·장 클릭과 Enter의 기존 의미는 유지한다. 방향키는 **커서만** 움직이고,
Space는 선택, 장 Enter는 그 장 처음으로 이동, 절 Enter는 실제 번호의 절로 이동한다.
BSB 마태 17장의 20 → 22와 마지막 27절도 확인했다.

## 판단

1. **ESV는 자동 복귀하지 않는다.** 실패 이유를 읽기도 전에 역본이 바뀌는 것을 피한다.
   사용자가 버튼을 누르면 마지막으로 선택한 정적 역본으로 돌아간다. 기록이 없는 첫 방문은
   개역한글이다. 복귀 이력은 이 탭의 메모리에만 두고 새 저장소 키는 만들지 않았다.
2. **사전 태그는 배포 상태 선언이다.** 서버 키 유무를 알려 주는 별도 상태 API가 없고,
   상태 확인만을 위한 성경 본문 요청도 추가하지 않았다. `web/index.html`의
   `<meta name="antilego-esv-status" content="no_key">`가 현재 키 대기 상태를 선언한다.
   **키 설정 후 웹 배포 때 `content=""`로 바꿔야 한다.** 실제 성공 응답은 이 탭에서 즉시 태그를
   해제하며, no_key면 다시 표시한다. 502·네트워크 오류로 키 유무를 단정하지 않는다.
   태그는 메뉴 노드를 교체하지 않고 갱신해 포커스를 보존한다. 오래된 응답은 태그도 바꾸지 못한다.
3. **Home/End는 목록 전체의 처음/끝.** ↑↓는 화면의 실제 열 수만큼, ←→는 실제 버튼 한 칸만큼.
   끝에서는 멈춘다. 선택은 따로 적용하므로 방향키로 본문이 갑자기 바뀌지 않는다.
4. **Esc에는 역본 메뉴도 포함한다.** 피드백·피커의 우선순위를 먼저 지키고 기존 역본 메뉴
   닫기 동작을 유지했다. 피커 위 피드백 클릭은 피커의 바깥 클릭으로 처리하지 않는다.
5. **지도 전면 재작성은 하지 않았다.** 공개 함수 이름을 바꾸지 않고 계산 API와 DOM 적용 API를
   명확히 했다. 전체 레이아웃의 순수 계산 추출은 다음 코어 라이브러리 단계의 과제다.
6. **docs/ 수정 이유:** 요청된 UI 계약·F14의 잘못된 순수 함수 표현을 구현과 맞추기 위해
   Codex 기본 담당 디렉터리 밖의 로컬 스냅샷을 갱신했다. **노션 반영 필요.**

## CI 확인

2026-09-28 공식 릴리스·태그의 `action.yml`을 읽어 Node 24 사용을 확인했다.
upload-pages-artifact는 composite이며 내부 upload-artifact v7을 사용한다.

- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [configure-pages v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0)
- [upload-pages-artifact v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0)
- [deploy-pages v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1)

`__V__` 치환, `web/`만 업로드, build의 contents:read, deploy만 pages:write/id-token:write를 유지했다.
`ubuntu-latest`는 유지했다. [공식 전환 공지](https://github.com/actions/runner-images/issues/14748)는
2026-10-19~11-19의 Ubuntu 26.04 전환 예고다. 이 워크플로에는 OS별 컴파일·런타임 의존성이 없고,
요청 범위도 액션 버전 점검이므로 OS 고정은 추가하지 않았다. 공지 자체가 사라진다는 뜻은 아니다.
원격 workflow를 실행하지 않아 실제 배포 성공이나 모든 경고 제거를 주장하지 않는다.

## 검증

Node 25.8.1 + 헤드리스 Chrome/CDP. 로컬 `web/` 서버 8765, 전용 Chrome 프로필·9222 사용.
`verify/cdp.mjs`가 페이지 요청을 가로채 **외부 폰트·라이브 사이트·API로 나가는 요청을 로컬 응답으로 대체**한다.
ESV는 합성 문장·503 no_key·실패·늦은 응답만 사용했다. 실제 본문을 내려받거나 저장하지 않았다.

| 검사 | 단언 | 실패 | console.error / 예외 |
|---|---:|---:|---:|
| 09 `verify/accessibility.mjs` | 76 | 0 | 0 |
| 07 desktop / mobile / fetchfail | 53 / 49 / 6 | 0 | 0 |
| 08 desktop / esv / legacy / real / mobile | 58 / 27 / 16 / 49 / 17 | 0 | 0 |
| 브라우저 합계 | **351** | **0** | **0** |
| 09 `verify/map.mjs` | 8 | 0 | — |
| 09 `verify/ci.rb` | 5 + YAML 파싱 | 0 | — |

- 추가 검사: 실제 키 입력으로 권 재렌더 포커스, 숫자 행 이동·끝 경계, BSB 누락 절,
  모바일 3단계의 Tab/Shift+Tab 순서, 칩·뒤로·리사이즈 포커스, 피커 안팎/피드백 내부의 Esc,
  지도 지명·지도 버튼으로 포커스 복원, ESV 사전 태그·추가 상태 요청 없음·KJV 복귀·재시도·
  성공 후 태그 해제·오래된 no_key 응답 무시·본문 미저장·360px 가로 넘침 없음.
- 지도 계산 검사는 `document` 없는 Node에서 입력 불변·프레임·배율 제한·줌 중심 보존을 확인한다.
- `node --check`(app/map), `git diff --check` PASS.
- 첫 회귀 실행에서 앞 검사에 저장된 Gen.12가 다음 픽스처 검사에 넘어가 404가 한 건 발생했다.
  검사 시작마다 전용 프로필의 로컬 origin 저장 상태를 비워 분리했고 해당 스위트 재실행 58/58 PASS.
- 08 기존 테스트 두 곳은 변경된 사전 꼬리표·KJV 복귀 기대값만 갱신했다. 기존 스크린샷은 보존했다.
- 360px 메뉴와 절 단계 스크린샷을 눈으로 확인했다. 스크린 리더·실물 모바일 기기 검증은 하지 않았다.

### 재현

저장소 루트에서 서버와 전용 Chrome을 각각 실행한 뒤 검증한다. Chrome 기본 프로필은 사용하지 않는다.

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

별도 터미널:

```sh
VERIFY_PROFILE=$(mktemp -d /tmp/antilego-09-chrome.XXXXXX)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 \
  --user-data-dir="$VERIFY_PROFILE" --no-first-run --disable-background-networking \
  --disable-component-update --disable-sync --disable-gpu --hide-scrollbars about:blank
```

세 번째 터미널:

```sh
node spikes/09-a11y-esv/verify/accessibility.mjs
node spikes/09-a11y-esv/verify/regression.mjs
node spikes/09-a11y-esv/verify/map.mjs
ruby spikes/09-a11y-esv/verify/ci.rb
```

스크린샷은 기본 저장하지 않는다. `SHOTS_DIR`를 임시 폴더로 지정하면 그곳에만 저장한다.
이번 실행 출력: `/tmp/antilego-09.EqbCh2/shots/` (임시 산출물, git에 포함하지 않음).
브라우저 스위트는 같은 CDP 페이지를 쓰므로 **순차 실행**한다.

## 남은 것 / 범위

- ESV 서버 키 설정·실제 운영 API 검증, Pages 배포 후 확인, 노션 결정 반영은 남았다.
- 현재 no_key 배포 선언은 마지막 알려진 키 대기 상태를 따랐고, 라이브 서버를 다시 조회하지 않았다.
- `web/data/**`, `data/**`, `api/**` 변경 없음. 전체 데이터 빌드·라이브 검증·외부 문의 없음.
- 시작 시 CLI 0.157.1, Node 25.8.1, 깨끗한 작업 트리 확인. 기존 세션의 삭제된 0.157.0
  실행 경로 오류는 재현되지 않았고, 0.157.0 고정은 당시 진단 조건으로 보고 현재 버전에서 이어갔다.

## 변경 파일 인덱스

줄 번호는 이번 워킹 트리 기준이다.

- `web/app.js:85` (ESV 상태), `:525` (지도 포커스), `:592` (실패 복귀), `:1065` (격자),
  `:1241` (권 포커스), `:1301` (방향키), `:1317` (Tab), `:1798` (Esc).
- `web/index.html:6` — ESV 배포 상태 meta.
- `web/map.js:1` — 계산/DOM 경계 설명; `:140` — DOM 적용 API 설명.
- `docs/03-prototype-spec.md:381` — F14; `:494` — 피커 계약; `:748` — 역본 메뉴; `:802` — ESV 실패.
- `.github/workflows/pages.yml:26` — 액션 4종 갱신.
- `spikes/08-versions/verify/desktop.mjs:81`, `spikes/08-versions/verify/mobile.mjs:98` — 새 UX 기대값.
- `spikes/09-a11y-esv/verify/accessibility.mjs:1` — 76 단언.
- `spikes/09-a11y-esv/verify/cdp.mjs:1` — 외부 요청 대체·실제 키 입력·임시 스크린샷.
- `spikes/09-a11y-esv/verify/regression.mjs:1` — 기존 8개 스위트 순차 실행·실패 판정.
- `spikes/09-a11y-esv/verify/map.mjs:1`, `spikes/09-a11y-esv/verify/ci.rb:1` — 계산·CI 계약 검사.
- `spikes/09-a11y-esv/RESULT.md:1` — 이 결과와 판단 기록.

`AGENTS.md` 작업 중 행은 종료 후 비워 원래 상태로 복구했다.
