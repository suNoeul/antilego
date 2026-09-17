# 데이터 소스 & 라이선스 조사

조사일: 2026-09-17

## 결론 요약

| 필요한 것 | 후보 | 라이선스 | 판정 |
|---|---|---|---|
| 지명 → 좌표 | OpenBible.info Bible Geocoding | CC BY 4.0 | ✅ 바로 사용 |
| 구절 → 등장 고유명사 | STEPBible TIPNR | CC BY 4.0 | ✅ 바로 사용 |
| 한글 성경 본문 | 개역한글 (1961) | 저작재산권 만료, 인격권 준수 조건 | ✅ 사용 가능 |
| 한글 성경 본문 | 개역개정 (1998) | 대한성서공회 저작권 유효 | ❌ 별도 계약 필요 |
| **영문 지명 → 한글 지명** | **없음** | — | ⚠️ **직접 구축해야 함** |

## 1. OpenBible.info Bible Geocoding

- https://github.com/openbibleinfo/Bible-Geocoding-Data
- 개신교 성경에 등장하는 모든 장소의 지리 데이터
- 약 **1,230개 장소**, **3,259개 식별(identification)** — 일반적인 성경 지도책의 약 6배
- 좌표 정밀도: 87%가 250m 이내 (통상 성경 참고서는 1km 수준)
- 각 장소마다 **그 장소를 언급하는 구절 목록**이 붙어 있음 ← 이 프로젝트의 핵심
- 책별/장별 KMZ도 제공
- 라이선스: **CC BY 4.0** (출처 표기만 하면 목적 제한 없음)

## 2. STEPBible TIPNR

- https://github.com/STEPBible/STEPBible-Data
- TIPNR = Translators Individualised Proper Names with all References
- 성경의 모든 고유명사를 히브리어/그리스어 원형과 연결하고 **개별 인물·장소·사물로 분리**
- 동명이인/동명이지(同名異地) 구분이 되어 있음 — "같은 이름 다른 장소" 문제를 해결해줌
- 장소에는 geolocation이 붙어 있고, **출처가 OpenBible** → 두 데이터가 서로 호환됨
- 라이선스: **CC BY 4.0**, 허락 요청 없이 소프트웨어/출판물에 포함 가능

## 3. 한글 성경 본문

### 개역한글 (1961) — 사용 가능
대한성서공회 저작권 FAQ 원문 확인:
- "저작재산권 보호기간은 50년이 경과되어 **저작권료 지급없이 사용 가능**"
- 단, 저작인격권 2가지는 계속 준수해야 함:
  - **성명표시권**: 저작자(대한성서공회) 표시
  - **동일성유지권**: 내용·형식·제호를 임의로 변경·수정 불가
- → 본문을 **그대로** 표시하는 것은 OK. 현대어로 고쳐 쓰거나 편집하는 것은 NO.

### 개역개정 (1998) — 계약 필요
- 대한성서공회가 2차 저작물 저작권자로 저작재산권 보유
- 이용 허락 + 저작권료 지급 필요
- 취미 프로젝트 범위를 벗어남 → **v1은 개역한글로 간다**

### 참고: 영문
- KJV / ASV / WEB(World English Bible)은 퍼블릭 도메인
- OpenBible·TIPNR이 영문 기준이므로 대조·검증용으로 유용

## 4. ⚠️ 진짜 빈 칸: 영문 지명 → 한글 지명 매핑

OpenBible과 TIPNR은 전부 영문("Jericho")이고, 개역한글 본문은 한글("여리고")이다.
**이 둘을 잇는 공개 데이터셋은 찾지 못했다.** 이게 이 프로젝트의 실질적 진입장벽이자,
동시에 남들이 안 해놓은 부분이라 만들어두면 그 자체로 가치가 있는 자산이다.

### 구축 전략 (spike 00에서 검증)
1. **Wikidata 경유 (자동, 1차)**
   - OpenBible 장소 → Wikidata 항목 (영문 레이블 / Pleiades ID로 연결)
   - Wikidata의 한국어 레이블(`ko`) 추출
   - 커버리지가 얼마나 나오는지가 관건
2. **구절 제약 이용 (자동, 2차)**
   - OpenBible이 "이 장소는 이 구절들에 나온다"를 알려줌
   - 해당 구절들의 개역한글 본문에서 공통으로 등장하는 한글 토큰 = 강력한 후보
   - 여러 구절에 걸친 교집합이라 노이즈가 잘 걸러짐
3. **수동 검증 (3차)**
   - 등장 빈도 상위 ~200개 장소가 전체 언급의 대부분을 차지할 것으로 예상
   - 이것만 손으로 확인해도 실사용 품질 확보 가능

### 알려진 함정
- 개역한글은 옛 표기 사용 → 개역개정과 지명 표기가 다름 (나중에 개역개정 붙일 때 재매핑 필요)
- 한글 지명에 조사가 붙음 ("여리고에서", "여리고를") → 형태소 분석 또는 접두 매칭 필요
- 동명이지: "가데스"가 여러 곳 → TIPNR의 개별 ID로 구분해야 함

## 출처

- [OpenBible.info Bible Geocoding Data (GitHub)](https://github.com/openbibleinfo/Bible-Geocoding-Data)
- [Bible Geocoding — OpenBible.info](https://www.openbible.info/geo/)
- [STEPBible-Data (GitHub)](https://github.com/STEPBible/STEPBible-Data)
- [STEPBible Data Repository CC BY 4.0](https://stepbible.github.io/STEPBible-Data/)
- [대한성서공회 저작권 FAQ — 개역한글판](https://www.bskorea.or.kr/bbs/board.php?bo_table=copyright_faq&wr_id=5)
- [대한성서공회 — 성경의 저작권](https://www.bskorea.or.kr/bbs/content.php?co_id=subpage2_3_4_1)
