"""Wikidata 에서 한국어 레이블/별칭을 긁어온다 (Spike 00 pass 1).

wbgetentities 를 QID 50개씩 묶어 부른다. User-Agent 를 붙이고, 호출 사이에 쉰다.
결과: data/raw/work/wikidata.json  {qid: {ko, ko_aliases[], en, kowiki}}
이미 받은 QID 는 건너뛴다(멱등).
"""
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "data" / "raw" / "work"
OUT = WORK / "wikidata.json"

API = "https://www.wikidata.org/w/api.php"
UA = "Antilego-Spike00/0.1 (https://github.com/; Korean Bible place-name mapping research)"
BATCH = 50
SLEEP = 1.0


def fetch(session, qids):
    params = {
        "action": "wbgetentities",
        "ids": "|".join(qids),
        "props": "labels|aliases|sitelinks",
        "languages": "ko|en",
        "sitefilter": "kowiki",
        "format": "json",
    }
    for attempt in range(6):
        r = session.get(API, params=params, timeout=60)
        if r.status_code == 429:
            wait = int(r.headers.get("Retry-After", 5)) * (attempt + 1)
            print(f"  429 — {wait}s 대기", file=sys.stderr)
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json().get("entities", {})
    raise RuntimeError("Wikidata 재시도 초과")


def main():
    places = json.loads((WORK / "places.json").read_text(encoding="utf-8"))
    qids = sorted({p["wikidata"] for p in places if p.get("wikidata")})
    have = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    todo = [q for q in qids if q not in have]
    print(f"QID {len(qids)}개 중 {len(todo)}개 조회")

    s = requests.Session()
    s.headers["User-Agent"] = UA
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        ents = fetch(s, chunk)
        for qid, e in ents.items():
            if "missing" in e:
                have[qid] = {"ko": None, "ko_aliases": [], "en": None, "kowiki": None}
                continue
            labels = e.get("labels", {})
            aliases = e.get("aliases", {})
            sl = (e.get("sitelinks", {}) or {}).get("kowiki", {})
            have[qid] = {
                "ko": (labels.get("ko") or {}).get("value"),
                "ko_aliases": [a["value"] for a in aliases.get("ko", [])],
                "en": (labels.get("en") or {}).get("value"),
                "kowiki": sl.get("title"),
            }
        for q in chunk:            # 리다이렉트 등으로 응답에 없던 것
            have.setdefault(q, {"ko": None, "ko_aliases": [], "en": None, "kowiki": None})
        OUT.write_text(json.dumps(have, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"  {min(i + BATCH, len(todo))}/{len(todo)}")
        time.sleep(SLEEP)

    got = sum(1 for q in qids if have.get(q, {}).get("ko"))
    print(f"ko 레이블 확보 {got}/{len(qids)}")
    kw = sum(1 for q in qids if have.get(q, {}).get("kowiki") and not have.get(q, {}).get("ko"))
    print(f"ko 레이블은 없지만 한국어 위키백과 문서는 있는 항목: {kw}")


if __name__ == "__main__":
    main()
