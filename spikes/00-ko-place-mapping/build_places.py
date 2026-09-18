"""OpenBible ancient.jsonl + modern.jsonl + TIPNR 를 하나의 장소 표로 합친다.

출력: data/raw/work/places.json   (중간 산출물이라 data/raw 밑 = git 제외)
  [{id, en, url_slug, types, wikidata, wikidata_via, pleiades, tipnr, verses[], n_mentions,
    aliases[], tipnr_verses[]}]
"""
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
WORK = RAW / "work"
WORK.mkdir(parents=True, exist_ok=True)

SRC_WIKIDATA = "s7cc8b2"
SRC_PLEIADES = "s2428ed"
SRC_TIPNR = "s3b25cf"

# TIPNR 책 약어 -> OSIS
TIPNR2OSIS = {
    "Gen": "Gen", "Exo": "Exod", "Lev": "Lev", "Num": "Num", "Deu": "Deut",
    "Jos": "Josh", "Jdg": "Judg", "Rut": "Ruth", "1Sa": "1Sam", "2Sa": "2Sam",
    "1Ki": "1Kgs", "2Ki": "2Kgs", "1Ch": "1Chr", "2Ch": "2Chr", "Ezr": "Ezra",
    "Neh": "Neh", "Est": "Esth", "Job": "Job", "Psa": "Ps", "Pro": "Prov",
    "Ecc": "Eccl", "Sng": "Song", "Isa": "Isa", "Jer": "Jer", "Lam": "Lam",
    "Ezk": "Ezek", "Dan": "Dan", "Hos": "Hos", "Jol": "Joel", "Amo": "Amos",
    "Oba": "Obad", "Jon": "Jonah", "Mic": "Mic", "Nam": "Nah", "Hab": "Hab",
    "Zep": "Zeph", "Hag": "Hag", "Zec": "Zech", "Mal": "Mal",
    "Mat": "Matt", "Mrk": "Mark", "Luk": "Luke", "Jhn": "John", "Act": "Acts",
    "Rom": "Rom", "1Co": "1Cor", "2Co": "2Cor", "Gal": "Gal", "Eph": "Eph",
    "Php": "Phil", "Col": "Col", "1Th": "1Thess", "2Th": "2Thess",
    "1Ti": "1Tim", "2Ti": "2Tim", "Tit": "Titus", "Phm": "Phlm", "Heb": "Heb",
    "Jas": "Jas", "1Pe": "1Pet", "2Pe": "2Pet", "1Jn": "1John", "2Jn": "2John",
    "3Jn": "3John", "Jud": "Jude", "Rev": "Rev",
}

REF_RE = re.compile(r"^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)")


def parse_tipnr():
    """TIPNR PLACE 섹션 -> {unique_name: {osis_refs:set, names:set, openbible_name:str}}"""
    text = (RAW / "stepbible" / "TIPNR.txt").read_text(encoding="utf-8-sig", errors="replace")
    lines = text.split("\n")
    places = {}
    cur = None
    for i, raw in enumerate(lines):
        line = raw.rstrip("\r")
        if line.startswith("$========== PLACE") or line.startswith("$==========PLACE"):
            cur = "NEW"
            continue
        if cur == "NEW":
            f = [x for x in line.split("\t")]
            uname = f[0].strip()
            if not uname:
                continue
            key = uname.split("=")[0]          # Jericho@Num.22.1-Heb
            openbible = f[1].strip() if len(f) > 1 else ""
            places[key] = {"openbible_name": openbible, "refs": set(), "names": set()}
            cur = key
            continue
        if cur and cur != "NEW" and line.startswith("–"):
            f = [x for x in line.split("\t")]
            if f[0].strip() == "– Total":
                cur = None
                continue
            if len(f) >= 5:
                nm = f[3].strip()
                if nm:
                    places[cur]["names"].add(nm)
                for ref in f[4].split(";"):
                    m = REF_RE.match(ref.strip())
                    if m and m.group(1) in TIPNR2OSIS:
                        places[cur]["refs"].add(
                            f"{TIPNR2OSIS[m.group(1)]}.{int(m.group(2))}.{int(m.group(3))}")
    return places


def main():
    modern = {}
    for line in (RAW / "openbible" / "modern.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            d = json.loads(line)
            modern[d["id"]] = d

    tipnr = parse_tipnr()
    print(f"TIPNR PLACE 항목 {len(tipnr)}개, 참조 붙은 항목 {sum(1 for v in tipnr.values() if v['refs'])}개")

    out = []
    for line in (RAW / "openbible" / "ancient.jsonl").read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        ld = d.get("linked_data", {})
        qid = (ld.get(SRC_WIKIDATA) or {}).get("id")
        via = "ancient" if qid else None

        # 고대 장소에 Wikidata 가 없으면 연결된 현대 지명의 Wikidata 로 대체(신뢰도 낮춤)
        if not qid:
            assoc = sorted((d.get("modern_associations") or {}).items(),
                           key=lambda kv: -(kv[1].get("score") or 0))
            for mid, meta in assoc:
                m = modern.get(mid) or {}
                cs = m.get("coordinates_source") or {}
                if cs.get("type") == "wikidata" and cs.get("id"):
                    qid, via = cs["id"], f"modern:{mid}"
                    break

        tipnr_id = (ld.get(SRC_TIPNR) or {}).get("id")
        tref = []
        if tipnr_id:
            for k in (tipnr_id, tipnr_id + "-Heb", tipnr_id + "-Grk"):
                if k in tipnr:
                    tref = sorted(tipnr[k]["refs"])
                    break
            else:
                cand = [k for k in tipnr if k.split("=")[0].startswith(tipnr_id)]
                if cand:
                    tref = sorted(tipnr[cand[0]]["refs"])

        verses = [v["osis"] for v in (d.get("verses") or [])]
        out.append({
            "id": d["id"],
            "en": d.get("friendly_id") or d.get("url_slug"),
            "url_slug": d.get("url_slug"),
            "types": d.get("types") or [],
            "wikidata": qid,
            "wikidata_via": via,
            "pleiades": (ld.get(SRC_PLEIADES) or {}).get("id"),
            "tipnr": tipnr_id,
            "aliases": sorted((d.get("translation_name_counts") or {}).keys()),
            "verses": verses,
            "n_mentions": len(verses),
            "tipnr_verses": tref,
        })

    out.sort(key=lambda p: -p["n_mentions"])
    (WORK / "places.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    tot = sum(p["n_mentions"] for p in out)
    wd = [p for p in out if p["wikidata"]]
    wda = [p for p in out if p["wikidata_via"] == "ancient"]
    print(f"장소 {len(out)}개, 언급(구절-장소 쌍) {tot}개")
    print(f"Wikidata QID 있음: {len(wd)}개 ({len(wd)/len(out):.1%}), "
          f"언급 기준 {sum(p['n_mentions'] for p in wd)/tot:.1%}")
    print(f"  그중 고대 장소에 직접 붙은 것: {len(wda)}개, "
          f"언급 기준 {sum(p['n_mentions'] for p in wda)/tot:.1%}")
    print(f"TIPNR 참조 확보: {sum(1 for p in out if p['tipnr_verses'])}개")
    print(f"언급 0인 장소: {sum(1 for p in out if not p['n_mentions'])}개")


if __name__ == "__main__":
    main()
