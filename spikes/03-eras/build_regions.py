#!/usr/bin/env python3
"""Spike 03-b — 시대별 '대략 영역' 블롭 생성.

eras.json 의 polity 앵커 좌표 → 볼록껍질 → 성격별 버퍼 → Chaikin 스무딩 → 육지 클립
 → data/derived/era_regions.json (GeoJSON FeatureCollection).

원칙(AGENTS.md): 모호하면 그리지 않는다. 이것은 국경이 아니라 "이쯤"이다.

03-c: 무엇을 덩이로 그릴지는 이 스크립트가 정하지 않는다. eras.json 의 polity 마다
`"render": "blob" | "label_only"` 가 박혀 있고 여기서는 그대로 따른다.
  blob       → 앵커 껍질 + 버퍼 + 스무딩 + 육지 클립 (레반트 코어만)
  label_only → eras.json 의 `label_at` 좌표에 Point 하나. 폴리곤 없음.

실행:  spikes/01-web-prototype/.venv/bin/python spikes/03-eras/build_regions.py
"""
from __future__ import annotations

import json
import math
import os
import sys

from shapely.geometry import MultiPolygon, Point, Polygon, shape
from shapely.geometry import mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ERAS = os.path.join(ROOT, "data/derived/eras.json")
PLACES = os.path.join(ROOT, "web/data/places.json")
LAND = os.path.join(ROOT, "web/data/geo/land.json")
OUT = os.path.join(ROOT, "data/derived/era_regions.json")

KM_PER_DEG = 111.32

# polity 성격 → 버퍼 반경(km). RESULT.md §5.1 의 제안(도시국가/속주 30, 왕국 40, 제국 60).
BUFFER_KM = {
    "city-states": 30,
    "city-league": 30,
    "province": 30,
    "kingdom": 40,
    "region": 40,
    "people": 40,
    "confederation": 40,
    "tetrarchy": 40,
    "empire": 60,
}

# 앵커들이 한 덩어리가 아니라 흩어진 섬/점들인 polity.
# 볼록껍질을 씌우면 지중해 전체를 덮어 버리므로 앵커마다 따로 부풀려 합친다.
# 03-b 에는 세 개가 있었다(지중해 섬들·애굽 / 암몬·아라비아 / 미디안·아말렉).
# 03-c 에서 셋 다 쪼개져 label_only 가 되었으므로 지금은 비어 있다. 장치는 남겨 둔다.
SCATTERED: set = set()

# 03-b 에서는 label_only 목록이 여기 하드코딩되어 있었다. 03-c 부터는 eras.json 이 정본이다.
# (환경변수 NO_LABEL_ONLY=1 을 주면 label_only 를 무시하고 전부 덩이로 그려 본다 — 디버그용)
FORCE_BLOB = bool(os.environ.get("NO_LABEL_ONLY"))


# 앵커 하나가 너무 멀고 근거가 약해서 뺀 것. 그리지 않는 쪽이 낫다는 판단.
# 03-b 에서는 게달(Kedar)을 여기서 뺐다. 지금은 게달이 든 polity 자체가 label_only 라 필요 없다.
ANCHOR_SKIP: dict = {}

# 육지 클립을 건너뛰는 polity (섬/해양). 지금은 흩어진 섬 polity 만 부분 예외.
NO_CLIP: set = set()

SIMPLIFY_DEG = 0.01  # ≈1.1 km. 블롭은 대략이므로 이 정도는 잃어도 된다.


# ---------------------------------------------------------------- 좌표 보조


def scale_funcs(lat0: float):
    """위도 보정된 국소 평면 좌표계. 1 단위 = 1 위도 = 약 111.32 km."""
    k = math.cos(math.radians(lat0))
    k = max(k, 0.2)

    def fwd(lon, lat):
        return (lon * k, lat)

    def inv(x, y):
        return (x / k, y)

    return fwd, inv


def to_plane(geom, fwd):
    return transform_coords(geom, lambda c: fwd(c[0], c[1]))


def transform_coords(geom, fn):
    def ring(coords):
        return [fn(c) for c in coords]

    if geom.geom_type == "Polygon":
        return Polygon(ring(geom.exterior.coords), [ring(i.coords) for i in geom.interiors])
    if geom.geom_type == "MultiPolygon":
        return MultiPolygon([transform_coords(g, fn) for g in geom.geoms])
    raise TypeError(geom.geom_type)


def chaikin_ring(coords, closed=True):
    """Chaikin corner cutting 1회. 꼭짓점이 살아 있으면 '정확한 국경'으로 읽힌다."""
    pts = list(coords)
    if closed and pts[0] == pts[-1]:
        pts = pts[:-1]
    if len(pts) < 3:
        return coords
    out = []
    n = len(pts)
    for i in range(n):
        p = pts[i]
        q = pts[(i + 1) % n]
        out.append((0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]))
        out.append((0.25 * p[0] + 0.75 * q[0], 0.75 * q[1] + 0.25 * p[1]))
    out.append(out[0])
    return out


def chaikin(geom, times=2):
    for _ in range(times):
        if geom.geom_type == "Polygon":
            geom = Polygon(
                chaikin_ring(list(geom.exterior.coords)),
                [chaikin_ring(list(i.coords)) for i in geom.interiors],
            )
        elif geom.geom_type == "MultiPolygon":
            geom = MultiPolygon([chaikin(g, 1) for g in geom.geoms])
        geom = geom.buffer(0)
    return geom


def area_km2(geom):
    """국소 평면 근사 면적(km²)."""
    if geom.is_empty:
        return 0.0
    lat0 = geom.centroid.y
    fwd, _ = scale_funcs(lat0)
    return to_plane(geom, fwd).area * KM_PER_DEG * KM_PER_DEG


def round_geom(geom, nd=3):
    return transform_coords(geom, lambda c: (round(c[0], nd), round(c[1], nd)))


# ---------------------------------------------------------------- 본체


def build():
    eras = json.load(open(ERAS, encoding="utf-8"))
    places = json.load(open(PLACES, encoding="utf-8"))
    by_en = {v["en"]: (v["lon"], v["lat"]) for v in places.values()}

    land_fc = json.load(open(LAND, encoding="utf-8"))
    land = unary_union([shape(f["geometry"]) for f in land_fc["features"]]).buffer(0)

    features = []
    report = []

    for era in eras["eras"]:
        for pol in era.get("polities", []):
            key = (era["id"], pol["en"])
            anchors = []
            skip = ANCHOR_SKIP.get(key, set())
            for name in pol["anchor_places_en"]:
                if name in skip:
                    continue
                if name not in by_en:
                    print(f"  ! 앵커 없음: {name}", file=sys.stderr)
                    continue
                anchors.append(by_en[name])
            uniq = sorted(set(anchors))
            row = {
                "era": era["id"],
                "era_ko": era["ko"],
                "polity_ko": pol["ko"],
                "polity_en": pol["en"],
                "kind": pol["kind"],
                "anchors_n": len(anchors),
                "anchors_uniq": len(uniq),
            }

            lat0 = sum(p[1] for p in uniq) / len(uniq)
            lon0 = sum(p[0] for p in uniq) / len(uniq)

            if pol.get("render") == "label_only" and not FORCE_BLOB:
                at = pol.get("label_at")
                if at:
                    pt = (float(at[0]), float(at[1]))
                else:
                    print(f"  ! label_at 없음, 앵커 중심을 쓴다: {key}", file=sys.stderr)
                    pt = (lon0, lat0)
                features.append(
                    {
                        "type": "Feature",
                        "properties": {
                            "era": era["id"],
                            "polity_ko": pol["ko"],
                            "polity_en": pol["en"],
                            "kind": pol["kind"],
                            "render": "label_only",
                            "approx": True,
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [round(pt[0], 3), round(pt[1], 3)],
                        },
                    }
                )
                row.update(render="label_only", area=0.0, clipped=False)
                report.append(row)
                continue

            fwd, inv = scale_funcs(lat0)
            pts = [Point(*fwd(lon, lat)) for lon, lat in uniq]
            r = BUFFER_KM.get(pol["kind"], 40) / KM_PER_DEG

            if key in SCATTERED:
                blob = unary_union([p.buffer(r * 1.5, quad_segs=16) for p in pts])
                row["mode"] = "scattered"
            else:
                hull = unary_union(pts).convex_hull
                blob = hull.buffer(r, quad_segs=16)
                row["mode"] = {1: "point", 2: "line"}.get(len(uniq), "hull")

            blob = chaikin(blob, 2)
            blob = transform_coords(blob, lambda c: inv(c[0], c[1]))

            raw_area = area_km2(blob)
            clipped = blob.intersection(land).buffer(0)
            clip_area = area_km2(clipped)
            if key in NO_CLIP or clipped.is_empty or clip_area < 0.05 * raw_area:
                final = blob
                row["clipped"] = False
            else:
                final = clipped
                row["clipped"] = True

            # 클립이 만든 실오라기 조각 제거 (최대 조각의 2% 미만).
            # 단, 앵커 지명이 들어 있는 조각은 작아도 살린다(밧모 같은 작은 섬).
            if final.geom_type == "MultiPolygon":
                anchor_pts = [Point(*by_en[n]) for n in pol["anchor_places_en"]
                              if n not in skip and n in by_en]
                parts = sorted(final.geoms, key=lambda g: g.area, reverse=True)
                keep = [g for g in parts
                        if g.area >= parts[0].area * 0.02
                        or any(g.buffer(0.02).contains(q) for q in anchor_pts)]
                final = MultiPolygon(keep) if len(keep) > 1 else keep[0]

            final = final.simplify(SIMPLIFY_DEG, preserve_topology=True).buffer(0)
            final = round_geom(final, 3).buffer(0)

            row["area"] = area_km2(final)
            row["parts"] = 1 if final.geom_type == "Polygon" else len(final.geoms)

            # 위생 검사: 앵커가 블롭 안(또는 5 km 이내)에 있는가
            out = []
            for name in pol["anchor_places_en"]:
                if name in skip or name not in by_en:
                    continue
                lon, lat = by_en[name]
                p = Point(lon, lat)
                if final.contains(p):
                    continue
                d_deg = final.distance(p)
                d_km = d_deg * KM_PER_DEG * math.cos(math.radians(lat))
                if d_km > 5:
                    out.append((name, round(d_km, 1)))
            row["anchors_out"] = out
            row["render"] = "blob"

            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "era": era["id"],
                        "polity_ko": pol["ko"],
                        "polity_en": pol["en"],
                        "kind": pol["kind"],
                        "render": "blob",
                        "approx": True,
                        "anchors_n": len(anchors),
                    },
                    "geometry": json.loads(json.dumps(mapping(final))),
                }
            )
            report.append(row)

    fc = {
        "type": "FeatureCollection",
        "_note": "대략적인 시대 영역. 국경이 아니다. render=blob 은 앵커 껍질+버퍼+스무딩+육지 클립(레반트 코어만), render=label_only 는 Point 하나에 이름만.",
        "_generated": "2026-09-18",
        "_ui": "영역 레이어는 UI에서 기본 숨김. 사용자가 토글로 켠다.",
        "_source": "data/derived/eras.json, web/data/places.json, web/data/geo/land.json (Natural Earth)",
        "features": features,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))

    size = os.path.getsize(OUT)
    print(f"→ {OUT}  {size/1024:.1f} KB  features={len(features)}")

    # ----- 보고 -----
    print("\n%-18s %-24s %-12s %5s %11s %-11s %s" % ("era", "polity", "kind", "anc", "area km²", "render", "note"))
    for r in report:
        note = []
        if r.get("render") != "label_only":
            if r["area"] < 500:
                note.append("DEGENERATE")
            if r["area"] > 400000:
                note.append("OVERSIZE")
            if r.get("anchors_out"):
                note.append("anchors_out=" + ",".join(f"{n}({d}km)" for n, d in r["anchors_out"]))
            if not r.get("clipped"):
                note.append("no-clip")
            if r.get("parts", 1) > 1:
                note.append("parts=%d" % r["parts"])
        print(
            "%-18s %-24s %-12s %5d %11.0f %-11s %s"
            % (r["era"], r["polity_en"][:24], r["kind"], r["anchors_n"], r["area"], r.get("render"), "; ".join(note))
        )

    rp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "regions_report.json")
    json.dump(report, open(rp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return report


if __name__ == "__main__":
    build()
