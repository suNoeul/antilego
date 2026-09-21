"""Spike 01 — web/data/ 전체를 만든다.

  개역한글(bluesaurel) 본문 + OpenBible 언급 구절 + Spike 00 의 한글 지명 매핑
  + Natural Earth 1:10m  ->  web/data/

계약: docs/03-prototype-spec.md "데이터 스키마 (A → B)". 스키마를 바꾸려면 그 문서를 먼저 고친다.

돌리는 법:
    bash spikes/01-web-prototype/fetch_geo.sh          # 최초 1회 (Natural Earth)
    spikes/01-web-prototype/.venv/bin/python spikes/01-web-prototype/build.py

멱등: 두 번 돌리면 바이트 단위로 같은 결과. 입력에 날짜/난수가 섞이지 않는다.
본문은 한 글자도 고치지 않는다 (동일성유지권).
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPIKE00 = ROOT / "spikes" / "00-ko-place-mapping"
sys.path.insert(0, str(SPIKE00))

import krv  # noqa: E402  (Spike 00 의 개역한글 로더를 그대로 재사용)
import build_geo  # noqa: E402

RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"
WEB_DATA = ROOT / "web" / "data"

MIN_CONF = 0.6          # 스펙: places.ko.json 의 confidence >= 0.6 만 밑줄에 쓴다
# 스펙에 적힌 흔한 조사. 긴 것부터 시도한다.
JOSA = ["까지", "부터", "에서", "에게", "으로", "에", "을", "를", "이", "가",
        "과", "와", "의", "로", "은", "는", "도"]
JOSA = sorted(JOSA, key=len, reverse=True)
MIN_KO_LEN = 2          # 조사를 뗀 뒤 남는 길이 하한 (1음절 오매칭 방지)

# 개역한글 권명(대한성서공회 표기)과 한글 약어. krv.OSIS_BOOKS 와 같은 순서.
KO_NAMES = [
    "창세기", "출애굽기", "레위기", "민수기", "신명기", "여호수아", "사사기", "룻기",
    "사무엘상", "사무엘하", "열왕기상", "열왕기하", "역대상", "역대하", "에스라",
    "느헤미야", "에스더", "욥기", "시편", "잠언", "전도서", "아가", "이사야",
    "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스",
    "오바댜", "요나", "미가", "나훔", "하박국", "스바냐", "학개", "스가랴", "말라기",
    "마태복음", "마가복음", "누가복음", "요한복음", "사도행전", "로마서",
    "고린도전서", "고린도후서", "갈라디아서", "에베소서", "빌립보서", "골로새서",
    "데살로니가전서", "데살로니가후서", "디모데전서", "디모데후서", "디도서",
    "빌레몬서", "히브리서", "야고보서", "베드로전서", "베드로후서",
    "요한일서", "요한이서", "요한삼서", "유다서", "요한계시록",
]
KO_ABBR = [
    "창", "출", "레", "민", "신", "수", "삿", "룻", "삼상", "삼하", "왕상", "왕하",
    "대상", "대하", "스", "느", "에", "욥", "시", "잠", "전", "아", "사", "렘", "애",
    "겔", "단", "호", "욜", "암", "옵", "욘", "미", "나", "합", "습", "학", "슥", "말",
    "마", "막", "눅", "요", "행", "롬", "고전", "고후", "갈", "엡", "빌", "골",
    "살전", "살후", "딤전", "딤후", "딛", "몬", "히", "약", "벧전", "벧후",
    "요일", "요이", "요삼", "유", "계",
]
N_OT = 39

# 영문 권명 (성경 찾기 UI 의 영문 검색용). KO_NAMES 와 같은 순서.
EN_NAMES = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges",
    "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles",
    "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
    "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
    "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
    "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
    "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
    "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians",
    "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus",
    "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John",
    "3 John", "Jude", "Revelation",
]

# 권 분류 (성경 찾기 UI 의 섹션). (분류명, 권 수) 를 정경 순서대로 늘어놓은 것.
# 합계 66 이어야 한다. 구약 5분류(39권) + 신약 5분류(27권).
BOOK_GROUPS = [
    ("율법서", 5),      # 창–신
    ("역사서", 12),     # 수–에
    ("시가서", 5),      # 욥–아
    ("대선지서", 5),    # 사–단
    ("소선지서", 12),   # 호–말
    ("복음서", 4),      # 마–요
    ("사도행전", 1),    # 행
    ("바울서신", 13),   # 롬–몬
    ("공동서신", 8),    # 히–유
    ("요한계시록", 1),  # 계
]


def group_per_book():
    """BOOK_GROUPS 를 66개짜리 평평한 분류명 리스트로 편다."""
    out = []
    for name, n in BOOK_GROUPS:
        out.extend([name] * n)
    return out

ATTRIBUTION = [
    "성경전서 개역한글판 © 대한성서공회",
    "Place data: OpenBible.info Bible Geocoding (CC BY 4.0)",
    "Proper names: STEPBible TIPNR (CC BY 4.0)",
    "Basemap: Natural Earth (public domain)",
]


# --------------------------------------------------------------------------- 입력

def load_text():
    """{osisID: 개역한글 본문} — Spike 00 의 bluesaurel 로더 그대로."""
    return krv.load_bluesaurel()


def load_openbible():
    """{place_id: {"verses": [osisID], "lat": float|None, "lon": float|None, "en": str}}

    좌표는 identifications 중 점수가 가장 높은 것의 첫 resolution 의 대표점(lonlat).
    """
    out = {}
    path = RAW / "openbible" / "ancient.jsonl"
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        lat = lon = None
        best_key = None
        for ident in d.get("identifications") or []:
            sc = ident.get("score") or {}
            key = (sc.get("vote_average") or 0, sc.get("time_total") or 0)
            for res in ident.get("resolutions") or []:
                ll = res.get("lonlat")
                if not ll:
                    continue
                if best_key is None or key > best_key:
                    best_key = key
                    lon, lat = (float(x) for x in ll.split(","))
                break
        out[d["id"]] = {
            "en": d.get("friendly_id") or d.get("url_slug"),
            "verses": [v["osis"] for v in (d.get("verses") or [])],
            "lat": lat,
            "lon": lon,
        }
    return out


def load_places_ko():
    """Spike 00 의 자동 매핑 + 수동 오버라이드 사전.

    오버라이드는 별도 파일(`places.ko.overrides.json`)에 있다. 자동 파이프라인을 다시
    돌려도 살아남게 하려고 `places.ko.json` 자체는 건드리지 않는다.
      {place_id: {"ko": "구브로", "conf": 1.0, "note": …, "evidence": …}}
      ko 가 null 이면 그 장소는 밑줄에서 통째로 뺀다(억제).
    반환값은 (ko_map, n_applied, suppressed) — suppressed 는 억제된 place_id 집합.
    """
    ko_map = json.loads((DERIVED / "places.ko.json").read_text(encoding="utf-8"))
    path = DERIVED / "places.ko.overrides.json"
    if not path.exists():
        return ko_map, 0, set()
    ov = json.loads(path.read_text(encoding="utf-8"))
    suppressed = set()
    for pid, o in sorted(ov.items()):
        entry = dict(ko_map.get(pid) or {})
        entry["ko"] = o["ko"]
        entry["confidence"] = o.get("conf") or 0.0
        entry["source"] = "manual"
        ko_map[pid] = entry
        if o["ko"] is None:
            suppressed.add(pid)
    return ko_map, len(ov), suppressed


# ----------------------------------------------------------------- 밑줄 (mention)

def josa_stripped(ko: str):
    """조사 하나를 뗀 형태들 (긴 조사 우선). 스펙의 재시도 후보."""
    out = []
    for j in JOSA:
        if ko.endswith(j) and len(ko) - len(j) >= MIN_KO_LEN:
            out.append(ko[: -len(j)])
    return out


def find_all(text: str, needle: str):
    """겹치지 않는 전체 출현 위치 [(s, e)]."""
    spans, i = [], 0
    while True:
        i = text.find(needle, i)
        if i < 0:
            return spans
        spans.append((i, i + len(needle)))
        i += len(needle)


def locate(text: str, ko: str):
    """스펙 밑줄 규칙 2. (spans, used_form) — 못 찾으면 ([], None)."""
    spans = find_all(text, ko)
    if spans:
        return spans, ko
    for cand in josa_stripped(ko):
        spans = find_all(text, cand)
        if spans:
            return spans, cand
    return [], None


def resolve_overlaps(cands):
    """[(s, e, pid)] -> 겹치지 않는 목록. 긴 것이 이긴다. s 오름차순 반환."""
    cands = sorted(cands, key=lambda c: (-(c[1] - c[0]), c[0], c[2]))
    taken = []
    for s, e, pid in cands:
        if all(e <= ts or s >= te for ts, te, _ in taken):
            taken.append((s, e, pid))
    return sorted(taken)


# --------------------------------------------------------------------------- 빌드

def main():
    print("입력 읽는 중 …")
    text = load_text()
    ob = load_openbible()
    ko_map, n_overrides, suppressed = load_places_ko()
    print(f"  절 {len(text):,}  OpenBible 장소 {len(ob):,}  ko 매핑 {len(ko_map):,}")
    print(f"  수동 오버라이드 적용 {n_overrides:,}건 (그중 억제 {len(suppressed):,}곳)")

    # 좌표 없는 장소는 places.json 에 넣을 수 없다 (스펙). 밑줄도 달지 않는다
    # — p 가 places.json 에 없으면 UI 가 카드를 못 그리기 때문.
    no_coord = sorted(pid for pid, v in ob.items() if v["lat"] is None)

    # --- 후보 수집: (OpenBible 이 나열한 절) x (conf >= 0.6 인 ko)
    cand_by_verse = defaultdict(list)     # osis -> [(s, e, pid)]
    unlocated = []                        # 스펙 조건 1 은 맞는데 본문에서 못 찾은 것
    skipped_no_ko = Counter()
    skipped_no_coord = Counter()
    used_josa_fallback = Counter()

    for pid in sorted(ob):
        info = ob[pid]
        km = ko_map.get(pid) or {}
        ko = km.get("ko")
        conf = km.get("confidence") or 0.0
        if not ko or conf < MIN_CONF:
            skipped_no_ko[pid] = len(info["verses"])
            continue
        if info["lat"] is None:
            skipped_no_coord[pid] = len(info["verses"])
            continue
        for osis in info["verses"]:
            t = text.get(osis)
            if t is None:
                unlocated.append({"p": pid, "en": info["en"], "ko": ko, "ref": osis,
                                  "why": "본문에 그 절이 없음"})
                continue
            spans, used = locate(t, ko)
            if not spans:
                unlocated.append({"p": pid, "en": info["en"], "ko": ko, "ref": osis,
                                  "why": "본문에서 못 찾음"})
                continue
            if used != ko:
                used_josa_fallback[pid] += 1
            for s, e in spans:
                cand_by_verse[osis].append((s, e, pid))

    # --- 겹침 해소
    mentions_by_verse = {}
    n_mentions = 0
    n_dropped_overlap = 0
    place_total = Counter()
    for osis, cands in cand_by_verse.items():
        kept = resolve_overlaps(cands)
        n_dropped_overlap += len(cands) - len(kept)
        mentions_by_verse[osis] = kept
        n_mentions += len(kept)
        for _s, _e, pid in kept:
            place_total[pid] += 1

    # --- 장별 JSON
    if WEB_DATA.exists():
        shutil.rmtree(WEB_DATA)
    (WEB_DATA / "books").mkdir(parents=True)

    by_chapter = defaultdict(list)
    for osis, t in text.items():
        b, c, v = osis.rsplit(".", 2)
        by_chapter[(b, int(c))].append((int(v), osis, t))

    chapters_of = Counter()
    for (b, c) in by_chapter:
        chapters_of[b] = max(chapters_of[b], c)

    total_bytes = 0
    for b in krv.OSIS_BOOKS:
        bdir = WEB_DATA / "books" / b
        bdir.mkdir(parents=True, exist_ok=True)
        for c in range(1, chapters_of[b] + 1):
            verses = sorted(by_chapter[(b, c)])
            ch_places, seen = [], {}
            out_verses = []
            for vn, osis, t in verses:
                ms = mentions_by_verse.get(osis, [])
                vo = {"v": vn, "text": t}
                if ms:
                    vo["mentions"] = [{"s": s, "e": e, "p": p} for s, e, p in ms]
                    for _s, _e, p in ms:
                        if p not in seen:
                            seen[p] = len(ch_places)
                            ch_places.append({"p": p, "n": 0})
                        ch_places[seen[p]]["n"] += 1
                out_verses.append(vo)
            obj = {"book": b, "chapter": c, "verses": out_verses, "places": ch_places}
            blob = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
            (bdir / f"{c}.json").write_text(blob, encoding="utf-8")
            total_bytes += len(blob.encode("utf-8"))

    # --- index.json
    groups = group_per_book()
    index = {"books": [
        {"id": b, "ko": KO_NAMES[i], "abbr": KO_ABBR[i], "en": EN_NAMES[i],
         "testament": "OT" if i < N_OT else "NT", "group": groups[i],
         "chapters": chapters_of[b]}
        for i, b in enumerate(krv.OSIS_BOOKS)
    ]}
    (WEB_DATA / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # --- places.json (mention 이 1개 이상 있는 장소만)
    places = {}
    for pid, n in place_total.items():
        km = ko_map[pid]
        info = ob[pid]
        places[pid] = {"ko": km["ko"], "en": info["en"],
                       "lat": round(info["lat"], 5), "lon": round(info["lon"], 5),
                       "n": n, "conf": km["confidence"]}
    (WEB_DATA / "places.json").write_text(
        json.dumps(places, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        encoding="utf-8")

    # --- attribution.json
    (WEB_DATA / "attribution.json").write_text(
        json.dumps(ATTRIBUTION, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # --- geo/
    print("geo 만드는 중 …")
    geo = build_geo.build(WEB_DATA)

    # --- 요약
    web_bytes = sum(p.stat().st_size for p in WEB_DATA.rglob("*") if p.is_file())
    n_files = sum(1 for p in WEB_DATA.rglob("*") if p.is_file())
    listed = sum(len(v["verses"]) for v in ob.values())

    print()
    print("=" * 66)
    print(f"절            {len(text):,}   (기준 31,102)")
    print(f"장            {sum(chapters_of.values()):,}   책 {len(krv.OSIS_BOOKS)}권")
    print(f"OpenBible 언급 {listed:,}  (장소-구절 쌍)")
    print(f"밑줄 mention   {n_mentions:,}   겹쳐서 버림 {n_dropped_overlap:,}")
    print(f"못 찾은 언급   {len(unlocated):,}")
    print(f"  conf<{MIN_CONF} / ko 없음으로 제외: 장소 {len(skipped_no_ko):,} · 언급 {sum(skipped_no_ko.values()):,}")
    print(f"    그중 오버라이드가 억제한 것:  장소 {len(suppressed):,} · "
          f"언급 {sum(n for p, n in skipped_no_ko.items() if p in suppressed):,}")
    print(f"  좌표 없어 제외:            장소 {len(skipped_no_coord):,} · 언급 {sum(skipped_no_coord.values()):,}")
    print(f"  조사 제거 재시도로 찾음:    장소 {len(used_josa_fallback):,} · 언급 {sum(used_josa_fallback.values()):,}")
    print(f"places.json   {len(places):,} 곳   좌표 없는 장소(전체) {len(no_coord):,}")
    print(f"web/data/     파일 {n_files:,}개 · {web_bytes:,} B ({web_bytes/1024/1024:.2f} MB)")
    print(f"geo           tol={geo['tolerance']}  " +
          "  ".join(f"{k}={v:,}B" for k, v in sorted(geo["sizes"].items())))
    print(f"  lakes 확인  {geo['checks']['lakes']}")
    print(f"  rivers 확인 {geo['checks']['rivers']}")
    print("=" * 66)

    # 리포트용 상세는 data/raw/work/ 에 (git 제외)
    work = RAW / "work"
    work.mkdir(parents=True, exist_ok=True)
    (work / "spike01_report.json").write_text(json.dumps({
        "n_verses": len(text),
        "n_chapters": sum(chapters_of.values()),
        "openbible_listed": listed,
        "n_mentions": n_mentions,
        "n_dropped_overlap": n_dropped_overlap,
        "unlocated": unlocated,
        "skipped_no_ko": dict(skipped_no_ko),
        "skipped_no_coord": {pid: {"en": ob[pid]["en"], "ko": (ko_map.get(pid) or {}).get("ko"),
                                   "n": n} for pid, n in skipped_no_coord.items()},
        "no_coord_all": [{"id": pid, "en": ob[pid]["en"],
                          "ko": (ko_map.get(pid) or {}).get("ko"),
                          "n_verses": len(ob[pid]["verses"])} for pid in no_coord],
        "josa_fallback": dict(used_josa_fallback),
        "n_overrides": n_overrides,
        "suppressed": sorted(suppressed),
        "n_places": len(places),
        "web_bytes": web_bytes,
        "geo": geo,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"상세 리포트: {work / 'spike01_report.json'}")

    # 무결성: 본문이 원본과 한 글자도 다르지 않은지
    h = hashlib.sha256()
    for osis in sorted(text):
        h.update(osis.encode() + b"\t" + text[osis].encode() + b"\n")
    print(f"본문 해시(sha256, 31,102절): {h.hexdigest()}")


if __name__ == "__main__":
    main()
