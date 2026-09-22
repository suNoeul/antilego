"""Spike 08-a — 역본 축. 영문 퍼블릭 도메인 본문(KJV · BSB) 로더 + 영어 지명 밑줄.

`spikes/01-web-prototype/build.py` 가 이 모듈을 부른다 (build_geo 와 같은 방식).
빌드 진입점은 여전히 `build.py` 하나다.

입력
  data/raw/kjv/eng-kjv2006_usfx.xml   eBible.org  퍼블릭 도메인 (1769 표준본문, 정경 66권)
  data/raw/bsb/engbsb_usfx.xml        eBible.org  퍼블릭 도메인 (BSB Publishing, LLC)
  data/raw/openbible/ancient.jsonl    OpenBible.info Bible Geocoding (CC BY 4.0)
  data/raw/stepbible/TIPNR.txt        STEPBible TIPNR (CC BY 4.0)
  data/derived/alt_names_en.json      손으로 더한 영문 표기 (이 spike 의 반복 결과)

출력
  web/data/versions.json
  web/data/{kjv,bsb}/books/{BookId}/{ch}.json   — 개역한글(krv)과 **같은 장 스키마**

계약: docs/03-prototype-spec.md "역본 축 (Spike 08-a)".
멱등: 두 번 돌리면 바이트 단위로 같은 결과.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"
SPIKE00 = ROOT / "spikes" / "00-ko-place-mapping"
if str(SPIKE00) not in sys.path:
    sys.path.insert(0, str(SPIKE00))

import build_places  # noqa: E402  (Spike 00 의 TIPNR 파서를 그대로 재사용)

# --------------------------------------------------------------- 역본 메타 (계약)
# 08-b 가 이 파일을 읽어 역본 셀렉터를 그린다. 순서가 곧 표시 순서다.
# ESV 는 **메타데이터만** — 본문은 어디에도 저장하지 않고 읽을 때마다 API 에서 받는다.
DEFAULT_VERSION = "krv"
VERSIONS = [
    {"id": "krv", "name": "개역한글", "short": "개역한글", "lang": "ko",
     "type": "static", "attribution": "성경전서 개역한글판 © 대한성서공회"},
    {"id": "kjv", "name": "King James Version", "short": "KJV", "lang": "en",
     "type": "static", "attribution": "King James Version (public domain)"},
    {"id": "bsb", "name": "Berean Standard Bible", "short": "BSB", "lang": "en",
     "type": "static", "attribution": "Berean Standard Bible (public domain, CC0)"},
    {"id": "esv", "name": "English Standard Version", "short": "ESV", "lang": "en",
     "type": "online",
     "attribution": "Scripture quotations are from the ESV® Bible (The Holy Bible, "
                    "English Standard Version®), © 2001 by Crossway. Used by permission.",
     "attribution_url": "https://www.esv.org",
     "note": "온라인 전용 — 읽을 때마다 ESV API에서 받아옵니다"},
]

# 정적 영문 역본: id -> (원본 USFX 파일, 절 수 기준값 or None)
STATIC_EN = {
    "kjv": RAW / "kjv" / "eng-kjv2006_usfx.xml",
    "bsb": RAW / "bsb" / "engbsb_usfx.xml",
}

# --------------------------------------------------------------------- USFX 파싱

USFM2OSIS = dict(zip(
    ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO "
     "ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT "
     "MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE "
     "2PE 1JN 2JN 3JN JUD REV").split(),
    ["Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam",
     "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job", "Ps", "Prov",
     "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos",
     "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
     "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph",
     "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb",
     "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev"]))

# 본문이 아닌 것 — 통째로 버린다. 각주·상호참조·그림, 그리고 절 안에 끼어드는
# 다른 번호 체계(va: 대체 절 번호, vp: 표시용 절 번호, cp: 표시용 장 번호).
DROP_SUBTREE = {"f", "x", "fig", "ide", "rem", "note", "va", "vp", "cp"}
# 표제·제목류 — 절 사이에만 온다. 여기서 열려 있던 절을 닫고, 안을 계속 훑는다
# (BSB 슥 12:1 처럼 <d> 안에서 절이 **시작**하는 경우가 있다).
HEADINGS = {"s", "ms", "mt", "mte", "d", "toc", "h", "id", "cl", "r", "sp",
            "imt", "is", "iot", "io", "ip", "ie", "periph"}


def parse_usfx(path: Path) -> dict[str, str]:
    """USFX XML -> {osisID: 본문 한 줄}.

    - 절 본문은 `<v .../>` 와 `<ve/>` 사이의 텍스트다. 그 밖(권명·표제·시편 표제)은 안 담는다.
    - 각주 `<f>` · 상호참조 `<x>` 는 통째로 버린다. KJV 의 이탤릭 보충어 `<add>` 는 **남긴다**
      (본문의 일부다).
    - Haiola 가 태그마다 넣은 줄바꿈이 있으므로 공백을 하나로 접는다.
    - KJV 의 단락 표시 `¶` 는 낱말이 아니라 조판 기호라 지운다 (RESULT 에 기록).
    """
    root = ET.parse(path).getroot()
    out: dict[str, list[str]] = {}
    st = {"book": None, "ch": None, "v": None, "buf": []}

    def close():
        if st["v"]:
            out.setdefault(st["v"], []).extend(st["buf"])
        st["v"] = None
        st["buf"] = []

    def emit(t):
        if t and st["v"]:
            st["buf"].append(t)

    def walk(el):
        tag = el.tag
        if tag in DROP_SUBTREE:
            emit(el.tail)
            return
        if tag == "book":
            close()
            st["book"] = USFM2OSIS.get(el.get("id"))
            st["ch"] = None
        elif tag == "c":
            close()
            st["ch"] = el.get("id")
        elif tag == "v":
            close()
            bcv = el.get("bcv")
            if bcv:
                b, c, v = bcv.split(".")
                st["v"] = f"{USFM2OSIS.get(b, b)}.{int(c)}.{v}"
            elif st["book"] and st["ch"]:
                st["v"] = f'{st["book"]}.{int(st["ch"])}.{el.get("id")}'
        elif tag == "ve":
            close()
        elif tag in HEADINGS:
            close()
        emit(el.text)
        for child in el:
            walk(child)
        emit(el.tail)

    walk(root)
    close()
    return {k: re.sub(r"\s+", " ", "".join(v).replace("¶", " ")).strip()
            for k, v in out.items()}


def load(vid: str) -> dict[str, str]:
    return parse_usfx(STATIC_EN[vid])


def text_hash(d: dict[str, str]) -> str:
    """{osisID: 본문} 의 sha256. build.py 의 개역한글 해시와 같은 포맷."""
    h = hashlib.sha256()
    for osis in sorted(d):
        h.update(osis.encode() + b"\t" + d[osis].encode() + b"\n")
    return h.hexdigest()


# ------------------------------------------------------------------- 영문 지명 이름

DISAMB = re.compile(r"\s+\d+$")                     # "Beer 1" -> "Beer"
# 이름의 꼴: 낱말은 라틴 글자·아포스트로피·점, 낱말 사이는 공백이나 붙임표.
NAME_SHAPE = re.compile(r"^[A-Za-zÀ-ɏ’'.]+"
                        r"(?:[ -][A-Za-zÀ-ɏ’'.]+)*$")
TIPNR_VERSIONS = re.compile(r"\s*=\s*[A-Za-z,;\s]+$")


def name_ok(n: str) -> bool:
    """이름으로 받아들일 꼴인가.

    - 대문자로 시작하면 받는다 (Jerusalem · Kirjath-jearim · Fair Havens).
    - 소문자로 시작해도 **여러 낱말이고 그중 하나가 대문자면** 받는다 —
      역본이 실제로 그렇게 쓰는 형태다 (KJV `tower of Hananeel` · `wilderness of Sin`).
      고유명사가 하나도 없는 번역어(`the fair havens` · `wood` · `stone`)는 여기서 죽는다.
    """
    if not NAME_SHAPE.match(n):
        return False
    tokens = re.split(r"[ -]", n)
    if n[:1].isupper():
        return True
    return len(tokens) > 1 and any(t[:1].isupper() for t in tokens)


def _tipnr_forms(raw: str) -> list[str]:
    """TIPNR 의 '번역된 이름' 칸을 표기 목록으로 편다.

    'Kiriath-jearim =ESV; Kirjath-jearim =KJV'  -> ['Kiriath-jearim', 'Kirjath-jearim']
    '(Mount )Zion =ESV,NIV; Sion =KJV'          -> ['Mount Zion', 'Zion', 'Sion']
    '/' 는 원본의 줄바꿈 자리 표시라 지운다.
    """
    out = []
    for piece in raw.split(";"):
        p = TIPNR_VERSIONS.sub("", piece.strip()).replace("/", "").strip()
        if not p:
            continue
        m = re.match(r"^\((.+?)\s?\)(.+)$", p)
        if m:
            out.append(f"{m.group(1)} {m.group(2)}".strip())
            out.append(m.group(2).strip())
        else:
            out.append(p)
    return [x for x in (s.strip() for s in out) if x]


def _ligatures(name: str) -> list[str]:
    """KJV 1769 의 합자 표기. 'Caesarea' -> 'Cæsarea', 'Judaea' -> 'Judæa'."""
    out = []
    for a, b in (("ae", "æ"), ("oe", "œ"), ("Ae", "Æ"), ("Oe", "Œ")):
        if a in name:
            out.append(name.replace(a, b))
    return out


def load_alt_names() -> dict[str, dict]:
    """손으로 더한 영문 표기.

      {place_id: {"en": 참고용, "names": [...], "names_cs": [...], "why": "근거"}}
        names     — 보통처럼 쓴다 (대소문자 그대로 → 못 찾으면 무시하고 재시도)
        names_cs  — **대소문자를 그대로만** 맞춘다. 소문자꼴이 보통명사인 이름
                    (`Beer` `Shittim` `On` `No` `Put` `Sin` `Ephah` `Madmen`)에 쓴다.

    여기 적힌 이름은 아래의 보통명사 거르개를 통과한다 — 사람이 구절을 보고 확인한 것이므로.
    """
    path = DERIVED / "alt_names_en.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def common_words(texts) -> set[str]:
    """본문에서 **소문자로 쓰이는 낱말** 집합. 보통명사 거르개의 근거다.

    'Sea' 'River' 'Salt' 'On' 처럼 한 낱말짜리 지명이 실제로는 보통명사인 경우를
    사전 없이 본문 스스로 가려낸다 — 소문자 형태가 본문에 쓰이면 보통명사로 본다.
    """
    words = set()
    for t in texts:
        for w in re.findall(r"[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ’'-]*", t):
            if w[:1].islower():
                words.add(w)
    return words


def build_name_index(ancient_path: Path, common: set[str], alt: dict):
    """{place_id: (이름 전부, 대소문자 무시 재시도에 쓸 이름)} — 긴 것부터. + 걸러낸 목록.

    이름의 출처 세 가지 + 손으로 더한 것:
      1. OpenBible `friendly_id` 의 기본형 ("Beer 1" -> "Beer")
      2. OpenBible `translation_name_counts` 의 키 (역본별 표기가 여기 다 있다)
      3. STEPBible TIPNR 의 영문 표기 (ESV/KJV/NIV 차이 — Kirjath-jearim, Sion …)
      4. `data/derived/alt_names_en.json`
    거르개:
      - 고유명사꼴이 아닌 것(소문자로 시작, 기호 섞임)은 버린다.
      - **한 낱말짜리인데 그 낱말의 소문자꼴이 본문에 보통명사로 쓰이면 버린다**
        (Sea · River · Salt · On · Mount …). 여러 낱말 이름 안에서는 그대로 산다
        ("Salt Sea" 는 남고 "Sea" 만 죽는다).
    """
    tipnr = build_places.parse_tipnr()
    idx, dropped = {}, Counter()
    for line in ancient_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        pid = d["id"]
        names = set()
        base = DISAMB.sub("", (d.get("friendly_id") or "")).strip()
        if base:
            names.add(base)
        for n in (d.get("translation_name_counts") or {}):
            names.add(n.strip())
        tid = ((d.get("linked_data") or {}).get(build_places.SRC_TIPNR) or {}).get("id")
        if tid and tid in tipnr:
            for n in tipnr[tid]["names"]:
                names.update(_tipnr_forms(n))
        keep = set()
        for n in names:
            if not n or not name_ok(n):
                continue
            if " " not in n and "-" not in n and n.lower() in common:
                dropped[n] += 1
                continue
            keep.add(n)
        a = alt.get(pid) or {}
        keep |= {n.strip() for n in a.get("names", []) if n.strip()}
        keep_cs = {n.strip() for n in a.get("names_cs", []) if n.strip()}
        keep |= {lig for n in list(keep) for lig in _ligatures(n)}
        keep_cs |= {lig for n in list(keep_cs) for lig in _ligatures(n)}
        order = lambda s: (-len(s), s)                                  # noqa: E731
        idx[pid] = (sorted(keep | keep_cs, key=order), sorted(keep, key=order))
    return idx, dropped


# ----------------------------------------------------------------- 영문 밑줄 규칙

def _left_ok(t: str, s: int) -> bool:
    if s == 0:
        return True
    c = t[s - 1]
    if c.isalpha():
        return False
    # 붙임표로 이어진 합성 이름의 뒷조각은 그 이름이 아니다 (El-beth-el 의 beth-el)
    return not (c == "-" and s >= 2 and t[s - 2].isalpha())


def _right_ok(t: str, e: int) -> bool:
    if e >= len(t):
        return True
    c = t[e]
    if c.isalpha():
        return False
    # 앞조각도 마찬가지 (Mahaneh-dan 의 Dan, Kirjath-jearim 의 Kirjath)
    return not (c == "-" and e + 1 < len(t) and t[e + 1].isalpha())


def find_all(text: str, name: str, ci: bool = False):
    """겹치지 않는 전체 출현 [(s, e)]. 영어 낱말 경계를 지킨 것만.

    경계 = 앞뒤가 라틴 글자가 아니고, 붙임표 합성어의 조각도 아니다.
    아포스트로피는 경계다 — "Jerusalem’s" 에서 `Jerusalem` 만 잡힌다.
    """
    hay = text.lower() if ci else text
    needle = name.lower() if ci else name
    spans, i = [], 0
    while True:
        i = hay.find(needle, i)
        if i < 0:
            return spans
        e = i + len(needle)
        if _left_ok(text, i) and _right_ok(text, e):
            spans.append((i, e))
            i = e
        else:
            i += 1


def locate(text: str, names, names_ci=None, primary: str = "") -> tuple[list, bool]:
    """(spans, ci_썼나). 대소문자 그대로 먼저, 하나도 못 찾으면 무시하고 한 번 더.

    KJV 의 `The fair havens`(행 27:8) 처럼 역본이 지명을 소문자로 쓰는 경우가 있다.
    한국어 쪽과 달리 confidence 문턱이 없다 — 이름이 본문 소스에서 온 것이기 때문.
    `names_ci` 는 재시도에 쓸 이름 — `names_cs` 로 손수 넣은 이름은 여기 없다.

    **한 절에서 한 장소의 서로 다른 표기가 여럿 걸리면 하나만 쓴다** (`primary` 와 같은
    이름, 없으면 가장 긴 이름). 대상1 4:32 KJV `Etam, and Ain, Rimmon, and Tochen, and
    Ashan` 에서 OpenBible 이 Ashan 의 다른 표기로 들고 있는 `Ain` 까지 긋는 걸 막는다.
    모호하면 보여주지 않는다.
    """
    def pick(by_name):
        if not by_name:
            return []
        key = primary if primary in by_name else max(by_name, key=lambda n: (len(n), n))
        return by_name[key]

    by_name = {}
    for n in names:
        got = find_all(text, n)
        if got:
            by_name[n] = got
    if by_name:
        return pick(by_name), False
    for n in (names if names_ci is None else names_ci):
        got = find_all(text, n, ci=True)
        if got:
            by_name[n] = got
    return pick(by_name), bool(by_name)


def resolve_overlaps(cands):
    """[(s, e, pid)] -> 겹치지 않는 목록. 긴 것이 이긴다. build.py 와 같은 규칙."""
    cands = sorted(set(cands), key=lambda c: (-(c[1] - c[0]), c[0], c[2]))
    taken = []
    for s, e, pid in cands:
        if all(e <= ts or s >= te for ts, te, _ in taken):
            taken.append((s, e, pid))
    return sorted(taken)


# --------------------------------------------------------------------------- 빌드

def write_chapters(web_data: Path, vid: str, text: dict, mentions_by_verse: dict,
                   books: list[str]):
    """web/data/{vid}/books/{BookId}/{ch}.json — 개역한글과 같은 스키마."""
    by_chapter = defaultdict(list)
    for osis, t in text.items():
        b, c, v = osis.rsplit(".", 2)
        by_chapter[(b, int(c))].append((int(v), osis, t))
    chapters_of = Counter()
    for (b, c) in by_chapter:
        chapters_of[b] = max(chapters_of[b], c)

    n_files = 0
    for b in books:
        bdir = web_data / vid / "books" / b
        bdir.mkdir(parents=True, exist_ok=True)
        for c in range(1, chapters_of[b] + 1):
            verses = sorted(by_chapter[(b, c)])
            ch_places, seen, out_verses = [], {}, []
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
            (bdir / f"{c}.json").write_text(
                json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8")
            n_files += 1
    return n_files, dict(chapters_of)


def build(web_data: Path, ob: dict, place_ids, books: list[str]):
    """정적 영문 역본을 만든다. build.py 가 부른다.

    ob        : {place_id: {"en", "verses": [osisID], "lat", "lon"}}  (build.py 가 읽은 것)
    place_ids : 밑줄을 달 장소 집합 = places.json 의 키.
                **개역한글에서 밑줄이 붙은 장소로 한정한다** — p 가 places.json 에 없으면
                UI 가 카드를 못 그리기 때문. (RESULT 에 이 판단의 대가를 적었다)
    반환: {"versions": {vid: stats}, "alt_en": {pid: [표기…]}, "common_dropped": [...]}
    """
    texts = {vid: load(vid) for vid in STATIC_EN}
    alt = load_alt_names()
    common = common_words(t for d in texts.values() for t in d.values())
    idx, dropped = build_name_index(RAW / "openbible" / "ancient.jsonl", common, alt)

    # OpenBible 이 "이름으로 불렀다"고 표시한 절 — 커버리지 분모를 둘로 나눠 보려고 쓴다
    named = set()
    for line in (RAW / "openbible" / "ancient.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        for v in d.get("verses") or []:
            if "name" in (v.get("instance_types") or {}):
                named.add((d["id"], v["osis"]))

    place_ids = sorted(place_ids)
    stats, surface = {}, defaultdict(set)
    for vid, text in sorted(texts.items()):
        cand = defaultdict(list)
        listed = located = listed_named = located_named = 0
        n_ci = 0
        unlocated = Counter()
        unlocated_named = Counter()
        missing_verse = Counter()
        for pid in place_ids:
            names, names_ci = idx.get(pid) or ([], [])
            primary = DISAMB.sub("", ob[pid]["en"] or "").strip()
            for osis in ob[pid]["verses"]:
                is_named = (pid, osis) in named
                listed += 1
                listed_named += is_named
                t = text.get(osis)
                if t is None:
                    missing_verse[osis] += 1
                    continue
                spans, ci = locate(t, names, names_ci, primary)
                if not spans:
                    unlocated[pid] += 1
                    unlocated_named[pid] += is_named
                    continue
                located += 1
                located_named += is_named
                n_ci += ci
                for s, e in spans:
                    cand[osis].append((s, e, pid))
                    surface[pid].add(t[s:e])

        mentions, n_ment, n_drop = {}, 0, 0
        for osis, cs in cand.items():
            kept = resolve_overlaps(cs)
            n_drop += len(set(cs)) - len(kept)
            mentions[osis] = kept
            n_ment += len(kept)

        n_files, chapters_of = write_chapters(web_data, vid, text, mentions, books)
        stats[vid] = {
            "n_verses": len(text), "n_chapters": sum(chapters_of.values()),
            "n_files": n_files, "hash": text_hash(text),
            "listed": listed, "located": located,
            "listed_named": listed_named, "located_named": located_named,
            "n_mentions": n_ment, "n_dropped_overlap": n_drop, "n_ci_fallback": n_ci,
            "n_places": len({p for ms in mentions.values() for _s, _e, p in ms}),
            "unlocated": unlocated, "unlocated_named": unlocated_named,
            "missing_verse": sum(missing_verse.values()),
        }

    # versions.json — 08-b 와의 계약
    (web_data / "versions.json").write_text(
        json.dumps({"default": DEFAULT_VERSION, "versions": VERSIONS},
                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    alt_en = {pid: sorted(s) for pid, s in surface.items()}
    return {"versions": stats, "alt_en": alt_en, "texts": texts,
            "common_dropped": sorted(dropped)}
