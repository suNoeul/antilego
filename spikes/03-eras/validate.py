#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Spike 03 검증: 시대 데이터가 성경 전체를 빠짐없이 덮는지, 앵커 지명이 실제로 있는지 확인한다.

사용:  python3 spikes/03-eras/validate.py     (저장소 루트에서)
"""
import json, os, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
J = lambda *p: os.path.join(ROOT, *p)

def load(path):
    with open(J(*path), encoding="utf-8") as f:
        return json.load(f)

def main():
    index   = load(("web", "data", "index.json"))
    places  = load(("web", "data", "places.json"))
    eras    = load(("data", "derived", "eras.json"))
    chmap   = load(("data", "derived", "chapter_eras.json"))

    errors, warnings = [], []
    era_by_id = {e["id"]: e for e in eras["eras"]}
    books = {b["id"]: b for b in index["books"]}
    total_chapters = sum(b["chapters"] for b in index["books"])

    # 1) 장 커버리지
    assigned = 0
    per_era = collections.Counter()
    for bid, spec in chmap.items():
        if bid.startswith("_"):
            continue
        if bid not in books:
            errors.append(f"chapter_eras: 알 수 없는 책 id {bid}")
            continue
        n = books[bid]["chapters"]
        default = spec.get("default")
        if default not in era_by_id:
            errors.append(f"{bid}: 알 수 없는 era id {default!r}")
        slots = [default] * n
        seen = set()
        for r in spec.get("ranges", []):
            a, b, eid = r
            if eid not in era_by_id:
                errors.append(f"{bid} {a}-{b}: 알 수 없는 era id {eid!r}")
            if not (1 <= a <= b <= n):
                errors.append(f"{bid}: 범위 {a}-{b}가 1..{n} 밖이다")
                continue
            for c in range(a, b + 1):
                if c in seen:
                    errors.append(f"{bid} {c}장: 범위가 겹친다")
                seen.add(c)
                slots[c - 1] = eid
        for eid in slots:
            per_era[eid] += 1
        assigned += n

    missing_books = sorted(set(books) - {k for k in chmap if not k.startswith("_")})
    if missing_books:
        errors.append(f"chapter_eras에 없는 책: {missing_books}")

    # 2) 앵커 지명 조회 (places.json의 en 필드와 정확히 일치해야 한다)
    en_index = collections.defaultdict(list)
    for pid, p in places.items():
        en_index[p["en"]].append(pid)

    hits, misses = 0, []
    for e in eras["eras"]:
        for pol in e.get("polities", []):
            if not pol.get("anchor_places_en"):
                warnings.append(f"{e['id']} / {pol['ko']}: 앵커가 없다")
            for name in pol.get("anchor_places_en", []):
                if name in en_index:
                    hits += 1
                else:
                    misses.append((e["id"], pol["ko"], name))

    # 3) render / label_at  (03-c)
    #    지리 자료(web/data/geo/*.json)는 bbox [8,24,50,43] 로 잘려 있다.
    #    label_at 이 그 밖이면 지도에 그릴 수 없다.
    GEO_BBOX = (8.0, 24.0, 50.0, 43.0)
    render_count = collections.Counter()
    for e in eras["eras"]:
        for pol in e.get("polities", []):
            tag = f"{e['id']} / {pol['ko']}"
            r = pol.get("render")
            if r not in ("blob", "label_only"):
                errors.append(f"{tag}: render 값이 {r!r} — blob 또는 label_only 여야 한다")
                continue
            render_count[r] += 1
            at = pol.get("label_at")
            if r == "label_only":
                if not (isinstance(at, list) and len(at) == 2
                        and all(isinstance(v, (int, float)) for v in at)):
                    errors.append(f"{tag}: label_only 인데 label_at 이 [lon, lat] 가 아니다 ({at!r})")
                    continue
                lon, lat = at
                if not (GEO_BBOX[0] <= lon <= GEO_BBOX[2] and GEO_BBOX[1] <= lat <= GEO_BBOX[3]):
                    errors.append(f"{tag}: label_at {at} 가 지리 자료 bbox {list(GEO_BBOX)} 밖이다")
            elif at is not None:
                errors.append(f"{tag}: render=blob 인데 label_at 이 붙어 있다 ({at!r})")

    # 3b) era_regions.json 과 대조 (있을 때만)
    reg_msg = None
    try:
        reg = load(("data", "derived", "era_regions.json"))
    except FileNotFoundError:
        reg = None
    if reg:
        want = {(e["id"], p["en"]): p["render"]
                for e in eras["eras"] for p in e.get("polities", [])}
        got = {}
        for f in reg["features"]:
            pr = f["properties"]
            got[(pr["era"], pr["polity_en"])] = pr.get("render")
            gt = f["geometry"]["type"]
            if pr.get("render") == "label_only" and gt != "Point":
                errors.append(f"era_regions: {pr['polity_ko']} label_only 인데 geometry 가 {gt}")
            if pr.get("render") == "blob" and gt not in ("Polygon", "MultiPolygon"):
                errors.append(f"era_regions: {pr['polity_ko']} blob 인데 geometry 가 {gt}")
            for k in ("era", "polity_ko", "polity_en", "kind", "render", "approx"):
                if k not in pr:
                    errors.append(f"era_regions: {pr.get('polity_ko')} 에 {k} 가 없다")
        if want != got:
            for k in sorted(set(want) | set(got)):
                if want.get(k) != got.get(k):
                    errors.append(f"era_regions 불일치 {k}: eras.json={want.get(k)} / regions={got.get(k)}")
        reg_msg = f"Feature {len(reg['features'])}개"

    # 4) 출력
    print("=== Spike 03 시대 데이터 검증 ===")
    print(f"시대 수            : {len(eras['eras'])}  ({', '.join(era_by_id)})")
    print(f"성경 전체 장 수    : {total_chapters}")
    print(f"배정된 장 수       : {assigned}  -> {'OK' if assigned == total_chapters == 1189 else 'FAIL'}")
    print()
    print("시대별 장 수:")
    for eid in era_by_id:
        print(f"  {eid:18s} {per_era.get(eid, 0):5d}")
    print(f"  {'합계':18s} {sum(per_era.values()):5d}")
    print()
    print(f"앵커 지명          : 확인 {hits}개 / 실패 {len(misses)}개")
    print(f"render             : blob {render_count['blob']}개 / label_only {render_count['label_only']}개"
          f"  (합계 {sum(render_count.values())})")
    print(f"era_regions.json   : {reg_msg or '없음(건너뜀)'}")
    if misses:
        print("  places.json에 없는 앵커:")
        for eid, ko, name in misses:
            print(f"    - {eid} / {ko}: {name!r}")
    if warnings:
        print("\n경고:")
        for w in warnings:
            print(f"  ! {w}")
    if errors:
        print("\n오류:")
        for e in errors:
            print(f"  x {e}")
    print()
    ok = not errors and assigned == total_chapters == 1189 and not misses
    print("결과: " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
