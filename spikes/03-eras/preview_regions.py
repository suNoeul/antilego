#!/usr/bin/env python3
"""Spike 03-b — era_regions.json 을 눈으로 확인하는 정적 렌더.

시대마다 PNG 한 장 + 전체 3×3 격자 한 장.
UI 가 아니다. "이 모양이 말이 되나"를 사람이 판정하기 위한 것.

실행: spikes/01-web-prototype/.venv/bin/python spikes/03-eras/preview_regions.py
"""
from __future__ import annotations

import json
import math
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.patches import Polygon as MplPolygon
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REGIONS = os.path.join(ROOT, "data/derived/era_regions.json")
ERAS = os.path.join(ROOT, "data/derived/eras.json")
PLACES = os.path.join(ROOT, "web/data/places.json")
GEO = os.path.join(ROOT, "web/data/geo")
OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "previews")

SEA = "#dfe8ee"
LAND_C = "#f4efe4"
LAND_EDGE = "#ddd4c2"
LAKE = "#cfdde8"
COLORS = ["#c9a227", "#7fa7c9", "#a8624a"]
LABEL_ONLY_C = "#9a8b79"  # 이름만 있는 polity — 덩이 라벨보다 확실히 옅게

for cand in (
    "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
):
    if os.path.exists(cand):
        font_manager.fontManager.addfont(cand) if cand.endswith(".ttf") else None
        break
plt.rcParams["font.family"] = ["AppleGothic", "Apple SD Gothic Neo", "DejaVu Sans"]
plt.rcParams["axes.unicode_minus"] = False


def polys(geom):
    """shapely geometry → list of (exterior, [holes])"""
    out = []
    if geom.geom_type == "Polygon":
        out.append((list(geom.exterior.coords), [list(i.coords) for i in geom.interiors]))
    elif geom.geom_type == "MultiPolygon":
        for g in geom.geoms:
            out += polys(g)
    return out


def draw_layer(ax, path, face, edge, lw=0.4, z=1):
    fc = json.load(open(path, encoding="utf-8"))
    for f in fc["features"]:
        g = shape(f["geometry"])
        for ext, holes in polys(g):
            ax.add_patch(MplPolygon(ext, closed=True, facecolor=face, edgecolor=edge, linewidth=lw, zorder=z))


def era_bbox(feats):
    """03-c: 블롭과 라벨 점을 **둘 다** 담는 범위 + 10%.

    03-b 는 라벨 점을 범위에서 뺐다(끌면 레반트가 손톱만 해져서). 이제는 이름만 있는
    polity 가 다수라 그 규칙을 쓰면 판정할 그림이 안 나온다. 레반트가 작아 보이는 것은
    왜곡이 아니라 사실이다 — 그게 이 시대들의 실제 무대 크기다."""
    def box(fs):
        xs, ys = [], []
        for f in fs:
            a, b, c, d = shape(f["geometry"]).bounds
            xs += [a, c]
            ys += [b, d]
        return (min(xs), max(xs), min(ys), max(ys)) if xs else None

    blobs = [f for f in feats if f["geometry"]["type"] != "Point"]
    u = box(feats)
    pad = max((u[1] - u[0]) * 0.10, (u[3] - u[2]) * 0.10, 0.4)
    frame = (u[0] - pad, u[1] + pad, u[2] - pad, u[3] + pad)

    # 덩이가 4개 이상인데 틀의 15% 도 차지하지 못하면(귀환 시대처럼 레반트에 작은 속주가
    # 몰려 있고 라벨은 수사·애굽까지 뻗을 때) 덩이 기준으로 조여서 최소 30% 는 되게 한다.
    # 틀 밖으로 나간 이름은 가장자리에 → 와 함께 붙인다.
    p = box(blobs)
    if p and len(blobs) >= 4:
        fw, fh = frame[1] - frame[0], frame[3] - frame[2]
        if (p[1] - p[0]) / fw < 0.15 or (p[3] - p[2]) / fh < 0.15:
            cx, cy = (p[0] + p[1]) / 2, (p[2] + p[3]) / 2
            w = max((p[1] - p[0]) / 0.30, 0.8)
            h = max((p[3] - p[2]) / 0.30, 0.8)
            frame = (cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2)
    return frame


def draw_era(ax, era, feats, by_en, title):
    x0, x1, y0, y1 = era_bbox(feats)

    ax.set_facecolor(SEA)
    draw_layer(ax, os.path.join(GEO, "land.json"), LAND_C, LAND_EDGE, 0.5, 1)
    draw_layer(ax, os.path.join(GEO, "lakes.json"), LAKE, LAKE, 0.3, 4)

    labels = []  # [x, y, text, color, home_xy, size]
    ci = 0
    for f in feats:
        p = f["properties"]
        g = shape(f["geometry"])
        if p.get("render") == "label_only":
            # 이름만 있는 polity: 작은 빈 동그라미 + 블롭 라벨보다 옅고 작은 글씨.
            # 덩이가 아니라는 것이 한눈에 보여야 한다.
            px, py = g.x, g.y
            outside = not (x0 < px < x1 and y0 < py < y1)
            px = min(max(px, x0 + (x1 - x0) * 0.05), x1 - (x1 - x0) * 0.05)
            py = min(max(py, y0 + (y1 - y0) * 0.05), y1 - (y1 - y0) * 0.05)
            ax.plot([px], [py], marker=">" if outside else "o", ms=4.2,
                    mfc="none" if not outside else LABEL_ONLY_C, mew=0.9,
                    color=LABEL_ONLY_C, zorder=6)
            txt = p["polity_ko"] + (" →" if outside else "")
            labels.append([px, py + (y1 - y0) * 0.022, txt,
                           LABEL_ONLY_C, (px, py), 7.0])
            continue
        c = COLORS[ci % len(COLORS)]
        ci += 1
        alpha = 0.28
        for ext, holes in polys(g):
            ax.add_patch(MplPolygon(ext, closed=True, facecolor=c, edgecolor=c,
                                    linewidth=1.1, linestyle=(0, (2, 2)), alpha=alpha, zorder=3))
            ax.add_patch(MplPolygon(ext, closed=True, facecolor="none", edgecolor=c,
                                    linewidth=1.1, linestyle=(0, (2, 2)), alpha=0.85, zorder=5))
        # 라벨은 가장 큰 조각 위에 (흩어진 섬 polity 가 엉뚱한 바다에 이름을 놓지 않게)
        big = g
        if g.geom_type == "MultiPolygon":
            big = max(g.geoms, key=lambda q: q.area)
        rp = big.representative_point()
        labels.append([rp.x, rp.y, p["polity_ko"], "#4a3b2c", (rp.x, rp.y), 8.0])

    # 라벨 충돌 완화: 위아래로 밀어낸다 (미리보기 가독성용, UI 규칙 아님)
    step = (y1 - y0) * 0.035
    labels.sort(key=lambda L: -L[1])
    for a in range(len(labels)):
        for b in range(a):
            dx = abs(labels[a][0] - labels[b][0]) / max(x1 - x0, 1e-9)
            dy = abs(labels[a][1] - labels[b][1]) / max(y1 - y0, 1e-9)
            if dx < 0.20 and dy < 0.035:
                labels[a][1] -= step
    for lx, ly, txt, col, home, size in labels:
        if abs(ly - home[1]) > step * 0.2:
            ax.plot([home[0], lx], [home[1], ly], lw=0.5, color="#8d8072", zorder=7)
        ax.text(lx, ly, txt, ha="center", va="center", fontsize=size, color=col, zorder=8,
                bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none",
                          alpha=0.55 if size < 8 else 0.7))

    # 앵커 점 — 덩이를 가진 polity 것만. 이름만 있는 polity 의 앵커는 그리지 않는다
    # (그 앵커들이 덩이를 못 만든다는 것이 이번 판단의 내용이므로, 점으로도 주장하지 않는다)
    ax_lon, ax_lat = [], []
    for f in feats:
        if f["properties"].get("render") == "label_only":
            continue
        for n in f["properties"].get("_anchors", []):
            if n in by_en:
                ax_lon.append(by_en[n][0])
                ax_lat.append(by_en[n][1])
    ax.scatter(ax_lon, ax_lat, s=3.5, color="#6b5a48", zorder=7, linewidths=0)

    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    lat_mid = (y0 + y1) / 2
    ax.set_aspect(1 / max(math.cos(math.radians(lat_mid)), 0.2))
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_edgecolor("#c8c0b2")
        s.set_linewidth(0.6)
    ax.set_title(title, fontsize=11, color="#3d3025", pad=6)
    ax.text(0.985, 0.03, " 대략 ", transform=ax.transAxes, ha="right", va="bottom",
            fontsize=8, color="#5b4a3a", zorder=10,
            bbox=dict(boxstyle="round,pad=0.3", fc="white", ec="#b9ad99", alpha=0.85, lw=0.6))


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    fc = json.load(open(REGIONS, encoding="utf-8"))
    eras = json.load(open(ERAS, encoding="utf-8"))
    places = json.load(open(PLACES, encoding="utf-8"))
    by_en = {v["en"]: (v["lon"], v["lat"]) for v in places.values()}

    anchors_of = {}
    titles = {}
    order = []
    for e in eras["eras"]:
        if not e.get("polities"):
            continue
        order.append(e["id"])
        titles[e["id"]] = f"{e['ko']} · {e.get('approx','')}".strip(" ·")
        for p in e["polities"]:
            anchors_of[(e["id"], p["en"])] = p["anchor_places_en"]

    grouped = {k: [] for k in order}
    for f in fc["features"]:
        f["properties"]["_anchors"] = anchors_of.get((f["properties"]["era"], f["properties"]["polity_en"]), [])
        grouped[f["properties"]["era"]].append(f)

    for eid in order:
        bx0, bx1, by0, by1 = era_bbox(grouped[eid])
        latm = math.radians((by0 + by1) / 2)
        ratio = (by1 - by0) / max((bx1 - bx0) * math.cos(latm), 1e-9)
        h = min(max(7 * ratio, 4.0), 9.0)
        fig, ax = plt.subplots(figsize=(7, h), dpi=110)
        draw_era(ax, eid, grouped[eid], by_en, titles[eid])
        fig.tight_layout()
        fig.savefig(os.path.join(OUTDIR, f"{eid}.png"), facecolor="white")
        plt.close(fig)
        print("→", os.path.join("spikes/03-eras/previews", eid + ".png"))

    n = len(order)
    cols = 3
    rows = math.ceil(n / cols)
    fig, axes = plt.subplots(rows, cols, figsize=(15, 5 * rows), dpi=100)
    for i, eid in enumerate(order):
        draw_era(axes.flat[i], eid, grouped[eid], by_en, titles[eid])
    for j in range(n, rows * cols):
        axes.flat[j].axis("off")
    fig.tight_layout()
    fig.savefig(os.path.join(OUTDIR, "_all.png"), facecolor="white")
    plt.close(fig)
    print("→ spikes/03-eras/previews/_all.png")


if __name__ == "__main__":
    main()
