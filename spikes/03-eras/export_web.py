"""Spike 03-d — 시대 데이터를 web/data/ 로 내보낸다.

  data/derived/eras.json          -> web/data/eras.json          (UI 가 쓰는 필드만)
  data/derived/chapter_eras.json  -> web/data/chapter_eras.json  (주석·note 제거)
  data/derived/era_regions.json   -> web/data/geo/era_regions.json (blob 에 rep 좌표 추가)
  data/derived/korea_parallel.json-> web/data/korea_parallel.json  (PoC 07, 주석 제거)

돌리는 법 (의존성 없음, 표준 파이썬):
    python3 spikes/03-eras/export_web.py

멱등: 두 번 돌리면 바이트 단위로 같은 결과. 정본은 언제나 data/derived/ 쪽이고
web/data/ 는 파생물이다. data/derived 를 고쳤으면 이 스크립트를 다시 돌린다.

`rep` 는 blob 폴리곤의 라벨 자리(대표점)다. 브라우저에서 매 렌더마다 계산하지 않도록
여기서 한 번 구해 둔다 — 가장 큰 폴리곤의 면적 중심을 쓰되, 그 점이 폴리곤 밖이면
(오목한 모양) 중심 높이의 가로선에서 가장 긴 내부 구간의 중점을 쓴다(ST_PointOnSurface 식).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DERIVED = ROOT / "data" / "derived"
WEB = ROOT / "web" / "data"

# UI 가 쓰는 필드만 남긴다. en / approx_from / approx_to / anchor_places_en 는 빠진다.
ERA_FIELDS = ("id", "ko", "approx", "caption", "note")

# PoC 07 (동시대 한반도). UI 는 title / caption / basis 만 쓴다. note 는 근거 메모라 나가지 않는다.
KOREA_FIELDS = ("title", "caption", "basis")


def ring_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        a += x0 * y1 - x1 * y0
    return a / 2.0


def ring_centroid(ring):
    a = ring_area(ring)
    if abs(a) < 1e-12:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return [sum(xs) / len(xs), sum(ys) / len(ys)]
    cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        f = x0 * y1 - x1 * y0
        cx += (x0 + x1) * f
        cy += (y0 + y1) * f
    return [cx / (6 * a), cy / (6 * a)]


def in_ring(pt, ring):
    x, y = pt
    inside = False
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        if (y0 > y) != (y1 > y):
            xx = x0 + (y - y0) / (y1 - y0) * (x1 - x0)
            if x < xx:
                inside = not inside
    return inside


def in_polygon(pt, poly):
    """poly = [outer, hole, ...]"""
    if not in_ring(pt, poly[0]):
        return False
    return not any(in_ring(pt, h) for h in poly[1:])


def scan_point(poly, y):
    """y 높이의 가로선에서 폴리곤 내부 구간 중 가장 긴 것의 중점."""
    xs = []
    for ring in poly:
        for i in range(len(ring) - 1):
            x0, y0 = ring[i][0], ring[i][1]
            x1, y1 = ring[i + 1][0], ring[i + 1][1]
            if (y0 > y) != (y1 > y):
                xs.append(x0 + (y - y0) / (y1 - y0) * (x1 - x0))
    xs.sort()
    best, bw = None, -1.0
    for i in range(0, len(xs) - 1, 2):
        w = xs[i + 1] - xs[i]
        if w > bw:
            bw, best = w, (xs[i] + xs[i + 1]) / 2
    return None if best is None else [best, y]


def representative_point(geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else list(geom["coordinates"])
    poly = max(polys, key=lambda p: abs(ring_area(p[0])))
    c = ring_centroid(poly[0])
    if in_polygon(c, poly):
        return [round(c[0], 3), round(c[1], 3)]
    s = scan_point(poly, c[1])
    if s is None:
        return [round(c[0], 3), round(c[1], 3)]
    return [round(s[0], 3), round(s[1], 3)]


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    return path.stat().st_size


def main():
    src_eras = json.loads((DERIVED / "eras.json").read_text(encoding="utf-8"))
    src_ch = json.loads((DERIVED / "chapter_eras.json").read_text(encoding="utf-8"))
    src_reg = json.loads((DERIVED / "era_regions.json").read_text(encoding="utf-8"))

    # --- eras.json: id / ko / approx / caption / note / undated / polities(ko·render)
    eras = []
    for e in src_eras["eras"]:
        out = {k: e[k] for k in ERA_FIELDS if e.get(k)}
        if e.get("undated"):
            out["undated"] = True
        out["polities"] = [
            {"ko": p["ko"], "render": p["render"]} for p in e.get("polities", [])
        ]
        eras.append(out)
    n_eras = dump(WEB / "eras.json", {"eras": eras})

    # --- chapter_eras.json: _notes 와 책별 note 를 뺀 그대로 (장별 전개보다 훨씬 작다)
    ch = {
        b: {"default": v["default"], "ranges": v.get("ranges", [])}
        for b, v in src_ch.items()
        if not b.startswith("_")
    }
    n_ch = dump(WEB / "chapter_eras.json", ch)

    # --- geo/era_regions.json: blob 에 rep(라벨 자리) 추가, _note 류는 그대로 둔다
    feats = []
    for f in src_reg["features"]:
        pr = f["properties"]
        p = {
            "era": pr["era"],
            "polity_ko": pr["polity_ko"],
            "render": pr["render"],
        }
        g = f["geometry"]
        if pr["render"] == "blob":
            p["rep"] = representative_point(g)
        feats.append({"type": "Feature", "properties": p, "geometry": g})
    n_reg = dump(
        WEB / "geo" / "era_regions.json",
        {
            "type": "FeatureCollection",
            "_note": src_reg.get("_note", ""),
            "_source": "data/derived/era_regions.json (spikes/03-eras/export_web.py)",
            "features": feats,
        },
    )

    # --- korea_parallel.json (PoC 07): _notes 와 era 별 note 를 뺀 그대로.
    # 파일이 없으면 조용히 건너뛴다 — 실험이 꺼져 있어도 빌드는 돌아간다.
    src_kor_path = DERIVED / "korea_parallel.json"
    n_kor = 0
    n_kor_eras = 0
    if src_kor_path.exists():
        src_kor = json.loads(src_kor_path.read_text(encoding="utf-8"))
        kor_eras = {
            eid: {k: v[k] for k in KOREA_FIELDS if v.get(k)}
            for eid, v in (src_kor.get("eras") or {}).items()
        }
        n_kor_eras = len(kor_eras)
        n_kor = dump(
            WEB / "korea_parallel.json",
            {
                "version": src_kor.get("version", 1),
                "basis": src_kor.get("basis", ""),
                "eras": kor_eras,
            },
        )

    blob = sum(1 for f in feats if f["properties"]["render"] == "blob")
    print(f"web/data/eras.json            {n_eras:,} B   시대 {len(eras)}개")
    print(f"web/data/chapter_eras.json    {n_ch:,} B   책 {len(ch)}권")
    print(
        f"web/data/geo/era_regions.json {n_reg:,} B   Feature {len(feats)}개 "
        f"(blob {blob} · label_only {len(feats) - blob})"
    )
    if n_kor:
        print(f"web/data/korea_parallel.json  {n_kor:,} B   시대 {n_kor_eras}개 (PoC 07)")
    else:
        print("web/data/korea_parallel.json  없음 — data/derived/korea_parallel.json 이 없다 (PoC 07 꺼짐)")


if __name__ == "__main__":
    main()
