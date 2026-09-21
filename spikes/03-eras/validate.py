#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Spike 03 검증: 시대 데이터가 성경 전체를 빠짐없이 덮는지, 앵커 지명이 실제로 있는지 확인한다.

정본은 `data/derived/` 이고 `web/data/` 는 파생물이다. 2026-09-21(리뷰 F4)부터
**web 으로 나간 시대 파일 3개도 함께 검사한다** — 있고, JSON 으로 읽히고,
장→시대 배정 1,189개가 derived 와 한 장도 빠짐없이 같고, Feature 수가 같은지.
빌드가 web/data/ 를 통째로 지우고 다시 만들기 때문에 이 검사가 없으면
시대 파일이 사라진 채로도 PASS 가 나온다.

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

    # 3c) web/data/ 로 나간 시대 파일 3개 (F4)
    WEB_ERA_FILES = [("web", "data", "eras.json"),
                     ("web", "data", "chapter_eras.json"),
                     ("web", "data", "geo", "era_regions.json")]
    web = {}
    web_msgs = []
    for parts in WEB_ERA_FILES:
        rel = "/".join(parts)
        try:
            web[parts[-1] if parts[-1] != "era_regions.json" else "era_regions"] = load(parts)
        except FileNotFoundError:
            errors.append(f"web 시대 파일 없음: {rel} — build.py 가 export_web.py 를 부르지 않았다")
        except json.JSONDecodeError as exc:
            errors.append(f"web 시대 파일 JSON 파싱 실패: {rel} ({exc})")

    def expand(chspec):
        """{book: {default, ranges}} -> {(book, chapter): era_id}. 1,189개가 나와야 한다."""
        out = {}
        for bid, spec in chspec.items():
            if bid.startswith("_") or bid not in books:
                continue
            n = books[bid]["chapters"]
            slots = [spec.get("default")] * n
            for a, b, eid in spec.get("ranges", []):
                if 1 <= a <= b <= n:
                    for c in range(a, b + 1):
                        slots[c - 1] = eid
            for i, eid in enumerate(slots, 1):
                out[(bid, i)] = eid
        return out

    if "eras.json" in web:
        d_ids = [e["id"] for e in eras["eras"]]
        w_ids = [e["id"] for e in web["eras.json"]["eras"]]
        if d_ids != w_ids:
            errors.append(f"web/eras.json 시대 목록이 derived 와 다르다: {w_ids} != {d_ids}")
        web_msgs.append(f"eras {len(w_ids)}개")
    if "chapter_eras.json" in web:
        d_map, w_map = expand(chmap), expand(web["chapter_eras.json"])
        if len(w_map) != 1189:
            errors.append(f"web/chapter_eras.json 장 수 {len(w_map)} — 1189 이어야 한다")
        bad = sorted(k for k in set(d_map) | set(w_map) if d_map.get(k) != w_map.get(k))
        if bad:
            errors.append(f"web/chapter_eras.json 배정 불일치 {len(bad)}장 (예: {bad[:5]})")
        web_msgs.append(f"장→시대 {len(w_map)}개 일치")
    if "era_regions" in web and reg:
        w_feats = web["era_regions"]["features"]
        if len(w_feats) != len(reg["features"]):
            errors.append(f"web/geo/era_regions.json Feature {len(w_feats)}개 — "
                          f"derived 는 {len(reg['features'])}개")
        if len(w_feats) != 68:
            errors.append(f"web/geo/era_regions.json Feature {len(w_feats)}개 — 68 이어야 한다")
        d_pairs = sorted((f["properties"]["era"], f["properties"]["polity_ko"])
                         for f in reg["features"])
        w_pairs = sorted((f["properties"]["era"], f["properties"]["polity_ko"])
                         for f in w_feats)
        if d_pairs != w_pairs:
            errors.append("web/geo/era_regions.json 의 (era, polity_ko) 목록이 derived 와 다르다")
        for f in w_feats:
            pr = f["properties"]
            if pr.get("render") == "blob" and "rep" not in pr:
                errors.append(f"web/geo/era_regions: {pr.get('polity_ko')} blob 인데 rep 가 없다")
        web_msgs.append(f"era_regions Feature {len(w_feats)}개")

    # 3d) korea_parallel.json (PoC 07 — 동시대 한반도). 정본이 없으면 실험이 꺼진 것이라 건너뛴다.
    kor_msg = ""
    try:
        kor = load(("data", "derived", "korea_parallel.json"))
    except FileNotFoundError:
        kor = None
    if kor is not None:
        d_kor = kor.get("eras") or {}
        for eid, v in d_kor.items():
            if eid not in era_by_id:
                errors.append(f"korea_parallel: 알 수 없는 era id {eid!r} "
                              f"— eras.json 에 있는 id 여야 한다")
            for k in ("title", "caption", "basis"):
                if not v.get(k):
                    errors.append(f"korea_parallel[{eid}]: {k} 가 비어 있다")
        try:
            w_kor = load(("web", "data", "korea_parallel.json"))
        except FileNotFoundError:
            w_kor = None
            errors.append("web 파일 없음: web/data/korea_parallel.json — "
                          "build.py 가 export_web.py 를 부르지 않았다")
        except json.JSONDecodeError as exc:
            w_kor = None
            errors.append(f"web/data/korea_parallel.json JSON 파싱 실패 ({exc})")
        if w_kor is not None:
            w_ids = w_kor.get("eras") or {}
            for eid in w_ids:
                if eid not in era_by_id:
                    errors.append(f"web/korea_parallel: 알 수 없는 era id {eid!r}")
            if sorted(w_ids) != sorted(d_kor):
                errors.append(f"web/korea_parallel 시대 목록이 derived 와 다르다: "
                              f"{sorted(w_ids)} != {sorted(d_kor)}")
            kor_msg = f"{len(w_ids)}개 시대 ({', '.join(sorted(w_ids))})"

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
    print(f"web/data 시대 3종  : {' · '.join(web_msgs) if web_msgs else '없음'}"
          f"  ({len(web)}/3 파일)")
    print(f"korea_parallel     : {kor_msg or ('없음(건너뜀)' if kor is None else '웹 파일 확인 실패')}"
          "  (PoC 07)")
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
    ok = (not errors and assigned == total_chapters == 1189 and not misses
          and len(web) == 3)
    print("결과: " + ("PASS" if ok else "FAIL"))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
