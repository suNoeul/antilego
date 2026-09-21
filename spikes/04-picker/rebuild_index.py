"""Spike 04 — `web/data/index.json` 에만 `en` · `group` 을 채워 넣는다.

정본 표는 `spikes/01-web-prototype/build.py` 의 `KO_NAMES` · `KO_ABBR` · `EN_NAMES` ·
`BOOK_GROUPS` 다. build.py 는 `data/raw/`(커밋하지 않는 원본 다운로드)와 `shapefile`
패키지를 필요로 해서 전체 재생성이 늘 되지는 않는다. 그래서 이 스크립트는
**build.py 를 실행하지도 import 하지도 않고** 소스를 `ast` 로 읽어 표만 꺼내
기존 `index.json` 의 `chapters` 는 그대로 둔 채 필드만 덧붙인다.

즉 정본은 여전히 build.py 하나다. 전체 재생성이 가능한 환경에서는
`build.py` 를 돌리면 같은 결과가 나온다.

돌리는 법 (의존성 없음, 멱등):
    python3 spikes/04-picker/rebuild_index.py
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "spikes" / "01-web-prototype" / "build.py"
INDEX = ROOT / "web" / "data" / "index.json"


def tables_from_build():
    """build.py 를 import 하지 않고 최상위 상수 표만 꺼낸다."""
    tree = ast.parse(BUILD.read_text(encoding="utf-8"), str(BUILD))
    want = {"KO_NAMES", "KO_ABBR", "EN_NAMES", "BOOK_GROUPS", "N_OT"}
    out = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        t = node.targets[0]
        if isinstance(t, ast.Name) and t.id in want:
            out[t.id] = ast.literal_eval(node.value)
    missing = want - out.keys()
    if missing:
        raise SystemExit(f"build.py 에서 못 찾은 표: {sorted(missing)}")
    return out


def main():
    t = tables_from_build()
    groups = []
    for name, n in t["BOOK_GROUPS"]:
        groups.extend([name] * n)

    for k in ("KO_NAMES", "KO_ABBR", "EN_NAMES"):
        if len(t[k]) != 66:
            raise SystemExit(f"{k} 가 66권이 아니다: {len(t[k])}")
    if len(groups) != 66:
        raise SystemExit(f"BOOK_GROUPS 합계가 66이 아니다: {len(groups)}")

    index = json.loads(INDEX.read_text(encoding="utf-8"))
    books = index["books"]
    if len(books) != 66:
        raise SystemExit(f"index.json 이 66권이 아니다: {len(books)}")

    n_ot = t["N_OT"]
    for i, b in enumerate(books):
        if b["ko"] != t["KO_NAMES"][i] or b["abbr"] != t["KO_ABBR"][i]:
            raise SystemExit(f"{i}번째 권이 표와 어긋난다: {b}")
        # build.py 의 index.json 키 순서와 같게 다시 만든다
        books[i] = {
            "id": b["id"],
            "ko": b["ko"],
            "abbr": b["abbr"],
            "en": t["EN_NAMES"][i],
            "testament": "OT" if i < n_ot else "NT",
            "group": groups[i],
            "chapters": b["chapters"],
        }

    INDEX.write_text(
        json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"index.json {INDEX.stat().st_size:,} B · {len(books)}권 · "
          f"분류 {len(dict.fromkeys(groups))}종")


if __name__ == "__main__":
    main()
