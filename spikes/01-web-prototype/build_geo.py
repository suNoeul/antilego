"""Natural Earth 1:10m -> web/data/geo/*.json (양식화 맵 배경).

입력: data/raw/naturalearth/ne_10m_{land,lakes,rivers_lake_centerlines}.shp
      (`bash spikes/01-web-prototype/fetch_geo.sh` 로 받는다. 퍼블릭 도메인)
출력: web/data/geo/land.json · lakes.json · rivers.json · meta.json

규칙(docs/03-prototype-spec.md):
  - bbox [8, 24, 50, 43] 로 클리핑, WGS84 유지 (이탈리아·시칠리아·몰타·크레테 포함)
  - Douglas-Peucker 단순화, 세 파일 합계 <= 600KB
  - rivers 는 properties.name 유지
  - OSM 계열 데이터는 쓰지 않는다 (ODbL)

멱등: 같은 입력이면 바이트 단위로 같은 결과가 나온다.
"""
from __future__ import annotations

import json
from pathlib import Path

import shapefile
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
NE = ROOT / "data" / "raw" / "naturalearth"

BBOX = [8.0, 24.0, 50.0, 43.0]            # lon_min, lat_min, lon_max, lat_max
BUDGET = 600 * 1024                       # 세 파일 합계 상한
COORD_DECIMALS = 4                        # 1e-4 deg ~= 11 m
# 단순화 허용오차 후보 (deg). 앞에서부터 시도해 예산에 맞는 첫 값을 쓴다.
TOLERANCES = [0.002, 0.003, 0.005, 0.008, 0.012, 0.02, 0.03]

LAYERS = {
    "land": "ne_10m_land",
    "lakes": "ne_10m_lakes",
    "rivers": "ne_10m_rivers_lake_centerlines",
}


def _version(layer_file: str) -> str:
    p = NE / f"{layer_file}.VERSION.txt"
    return p.read_text(encoding="utf-8").strip() if p.exists() else "unknown"


def _read(layer_file: str):
    """[(properties_dict, shapely_geom)] — bbox 와 겹치는 것만."""
    clip = box(*BBOX)
    r = shapefile.Reader(str(NE / layer_file))
    fields = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        geom = shape(sr.shape.__geo_interface__)
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty or not geom.intersects(clip):
            continue
        out.append((dict(zip(fields, sr.record)), geom))
    return out


def _round_geojson(obj, nd: int):
    if isinstance(obj, (list, tuple)):
        return [_round_geojson(x, nd) for x in obj]
    if isinstance(obj, float):
        return round(obj, nd)
    return obj


def _feature(geom, props: dict) -> dict:
    g = mapping(geom)
    return {
        "type": "Feature",
        "properties": props,
        "geometry": {"type": g["type"], "coordinates": _round_geojson(g["coordinates"], COORD_DECIMALS)},
    }


def _dedup_rings(geom):
    """좌표 반올림 후 무너진 조각을 걷어낸다."""
    if geom.is_empty:
        return geom
    return geom


def _build(tol: float):
    """허용오차 tol 로 세 레이어를 만들어 {name: (bytes, obj)} 로 돌려준다."""
    clip = box(*BBOX)
    out = {}

    # --- land: 폴리곤을 전부 합쳐 하나의 MultiPolygon 으로 (렌더러가 path 하나로 그린다)
    geoms = []
    for _props, g in _read(LAYERS["land"]):
        gc = g.intersection(clip)
        if not gc.is_empty:
            geoms.append(gc)
    land = unary_union(geoms).simplify(tol, preserve_topology=True)
    out["land"] = {
        "type": "FeatureCollection",
        "features": [_feature(land, {})] if not land.is_empty else [],
    }

    # --- lakes: bbox 안, 너무 작은 것은 버린다
    feats = []
    for props, g in _read(LAYERS["lakes"]):
        gc = g.intersection(clip)
        if gc.is_empty:
            continue
        gs = gc.simplify(tol, preserve_topology=True)
        if gs.is_empty or gs.area < (tol * tol * 4):
            continue
        feats.append((props.get("name") or "", props.get("scalerank") or 99,
                      _feature(gs, {"name": props.get("name") or None})))
    feats.sort(key=lambda t: (t[1], t[0]))
    out["lakes"] = {"type": "FeatureCollection", "features": [f[2] for f in feats]}

    # --- rivers: 선. name 유지
    feats = []
    for props, g in _read(LAYERS["rivers"]):
        gc = g.intersection(clip)
        if gc.is_empty:
            continue
        gs = gc.simplify(tol, preserve_topology=True)
        if gs.is_empty or gs.length < tol * 2:
            continue
        feats.append((props.get("name") or "", props.get("scalerank") or 99,
                      _feature(gs, {"name": props.get("name") or None})))
    feats.sort(key=lambda t: (t[1], t[0]))
    out["rivers"] = {"type": "FeatureCollection", "features": [f[2] for f in feats]}

    sized = {}
    for k, v in out.items():
        sized[k] = (len(json.dumps(v, ensure_ascii=False, separators=(",", ":")).encode("utf-8")), v)
    return sized


def build(web_data: Path) -> dict:
    geo_dir = web_data / "geo"
    geo_dir.mkdir(parents=True, exist_ok=True)

    chosen_tol, sized = None, None
    for tol in TOLERANCES:
        sized = _build(tol)
        total = sum(s for s, _ in sized.values())
        print(f"  geo tol={tol:<6} land={sized['land'][0]:>7}  lakes={sized['lakes'][0]:>7}  "
              f"rivers={sized['rivers'][0]:>7}  합계={total:>7} ({total/1024:.0f}KB)")
        if total <= BUDGET:
            chosen_tol = tol
            break
    if chosen_tol is None:
        chosen_tol = TOLERANCES[-1]
        print(f"  ! 예산 {BUDGET}B 를 못 맞췄다. tol={chosen_tol} 결과를 그대로 쓴다.")

    sizes = {}
    for name, (nbytes, obj) in sized.items():
        p = geo_dir / f"{name}.json"
        p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        sizes[name] = nbytes

    meta = {
        "bbox": BBOX,
        "source": "Natural Earth 1:10m v5.1.x (public domain)",
        "source_url": "https://www.naturalearthdata.com/",
        "layers": {
            "land": {"shapefile": LAYERS["land"], "version": _version(LAYERS["land"])},
            "lakes": {"shapefile": LAYERS["lakes"], "version": _version(LAYERS["lakes"])},
            "rivers": {"shapefile": LAYERS["rivers"], "version": _version(LAYERS["rivers"])},
        },
        "simplify_tolerance": chosen_tol,
        "coord_decimals": COORD_DECIMALS,
        "crs": "EPSG:4326",
    }
    (geo_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    sizes["meta"] = (geo_dir / "meta.json").stat().st_size

    # --- 확인용: 있어야 하는 것들
    lakes = json.loads((geo_dir / "lakes.json").read_text(encoding="utf-8"))
    rivers = json.loads((geo_dir / "rivers.json").read_text(encoding="utf-8"))
    lake_names = {f["properties"].get("name") for f in lakes["features"]}
    river_names = {f["properties"].get("name") for f in rivers["features"]}
    checks = {
        "lakes": {n: (n in lake_names) for n in ["Sea of Galilee", "Dead Sea"]},
        "rivers": {n: (n in river_names) for n in ["Jordan", "Nile", "Euphrates", "Tigris"]},
    }
    return {"tolerance": chosen_tol, "sizes": sizes, "checks": checks,
            "n_lakes": len(lakes["features"]), "n_rivers": len(rivers["features"]),
            "versions": meta["layers"]}


if __name__ == "__main__":
    import pprint
    pprint.pprint(build(ROOT / "web" / "data"))
