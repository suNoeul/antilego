"""영문 지명 -> 개역한글 지명 매핑 (Spike 00 pass 1 + pass 2).

pass 1  Wikidata ko 레이블. 그 장소가 나오는 개역한글 구절에 실제로 나타나는지 검증한다.
        (Wikidata 의 ko 는 현대 지명인 경우가 많아서 — "바라다강" — 검증 없이는 못 쓴다)
pass 2  구절 제약. 그 장소가 나오는 구절들의 개역한글 본문에서
        접두 매칭으로 공통 토큰을 찾는다. 조사는 접두 매칭으로 흡수된다.

점수:  L = 그 장소의 구절 중 후보가 나오는 구절 수
       G = 성경 전체에서 후보가 나오는 구절 수
       recall = L/|V|, precision = L/G, score = 2PR/(P+R)   (F1)
G 를 쓰기 때문에 "하나님", "사람" 같은 흔한 말은 precision 이 0 에 가까워 저절로 걸러진다.

출력: data/derived/places.ko.json, data/raw/work/report.json
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import krv  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "data" / "raw" / "work"
DERIVED = ROOT / "data" / "derived"
DERIVED.mkdir(parents=True, exist_ok=True)

HANGUL = re.compile(r"[가-힣]+")
MINLEN, MAXLEN = 2, 8

# 지명 후보로 올라오기 쉬운 기능어·일반명사. precision 으로 대부분 걸러지지만 안전판.
STOP = {
    "하나님", "여호와", "이스라엘", "사람", "자손", "가로되", "가라사대", "왕이", "왕의",
    "저희", "우리", "너희", "그들", "모든", "이르", "말씀", "땅에", "땅의", "성읍", "백성",
    "아들", "이르되", "그리", "이것", "저것", "때에", "거기", "여기", "지파", "자기",
    "제사", "왕은", "왕과", "성전", "예언", "선지", "아니", "하여", "하고", "하는", "이는",
    "나라", "임금", "주의", "주께", "사방", "지경", "골짜", "광야", "시내", "바다", "강가",
}


def prefixes(tok):
    n = min(len(tok), MAXLEN)
    return {tok[:i] for i in range(MINLEN, n + 1)}


def build_index(text):
    """접두어 -> 그 접두어로 시작하는 토큰을 가진 절들의 집합. + 단독 토큰 빈도"""
    idx = defaultdict(set)
    toks = {}
    bare = Counter()
    for ref, body in text.items():
        ts = HANGUL.findall(body)
        toks[ref] = ts
        seen = set()
        for t in ts:
            seen |= prefixes(t)
            bare[t[:MAXLEN]] += 1
        for p in seen:
            idx[p].add(ref)
    return idx, toks, bare


BETA = 2.0  # 재현율 쪽에 무게. 지명에서 파생된 종족명("블레셋 사람")이
            # 그 장소의 구절 밖에도 널리 나오기 때문에 정밀도는 구조적으로 낮다.


def fbeta(L, G, V):
    if L == 0:
        return 0.0
    p, r = L / G, L / V
    b2 = BETA * BETA
    return (1 + b2) * p * r / (b2 * p + r)


# 조사. 후보 끝에서 떼어낸다. 뗀 형태가 본문에 단독 토큰으로 나타날 때만 뗀다.
JOSA = ["에서부터", "으로부터", "에게서", "이라도", "까지", "부터", "에서", "에게",
        "으로", "에는", "에도", "이라", "이요", "이며", "이니", "에", "와", "과",
        "을", "를", "은", "는", "이", "가", "의", "로", "도", "만"]


def strip_josa(c, bare):
    """'디르사에' -> '디르사'. 단, '디르사'가 본문에 단독으로 나온 적이 있어야 한다.
    (그렇지 않으면 '구브로' -> '구브' 같은 오절단이 난다)"""
    cur = c
    for _ in range(2):
        for j in JOSA:
            if cur.endswith(j) and len(cur) - len(j) >= MINLEN:
                cand = cur[:-len(j)]
                if bare.get(cand, 0) > 0:
                    cur = cand
                    break
        else:
            break
    return cur


def best_candidates(idx, verses, bare, extra=(), topn=6):
    """verses 안의 접두 후보 + extra(위키데이터 레이블 등)를 같은 척도로 점수매긴다."""
    V = len(verses)
    if V == 0:
        return []
    cnt = Counter()
    for ref in verses:
        seen = set()
        for t in idx["__toks__"][ref]:
            seen |= prefixes(t)
        for p in seen:
            cnt[p] += 1
    for e in extra:                      # 위키데이터 레이블도 후보 풀에 넣는다
        for tok in HANGUL.findall(e or ""):
            for k in (tok, tok[:MAXLEN]):
                if k and len(k) >= MINLEN and k not in cnt:
                    cnt[k] = len(idx.get(k, set()) & set(verses))

    scored = {}
    for p, L in cnt.items():
        if p in STOP or L == 0:
            continue
        if L < 2 and V > 1:
            continue
        scored[p] = (fbeta(L, len(idx[p]), V), L, len(idx[p]))

    # 더 긴 후보가 거의 같은 점수면 긴 쪽을 쓴다 (바벨 -> 바벨론)
    promoted = {}
    for p, (sc, L, G) in scored.items():
        best = (sc, p)
        for q, (sc2, _, _) in scored.items():
            if q != p and q.startswith(p) and sc2 >= sc - 0.03 and len(q) > len(best[1]):
                best = (sc2, q)
        promoted[p] = best[1]

    ranked = sorted({promoted[p] for p in scored},
                    key=lambda q: (-scored[q][0], -len(q)))
    out, taken = [], []
    for q in ranked:
        if any(t.startswith(q) for t in taken):
            continue
        taken.append(q)
        sc, L, G = scored[q]
        stripped = strip_josa(q, bare)
        out.append({"ko": stripped, "surface": q, "score": round(sc, 4),
                    "L": L, "G": G, "V": V,
                    "josa_suspect": stripped == q and any(
                        q.endswith(j) and len(q) - len(j) >= MINLEN for j in JOSA)})
        if len(out) >= topn:
            break
    return out


def verify(idx, ko, verses):
    """후보 문자열이 실제로 그 구절들에 나타나는가."""
    if not ko:
        return 0, 0
    core = HANGUL.findall(ko)
    if not core:
        return 0, 0
    key = core[0][:MAXLEN]
    while len(key) > MINLEN and key not in idx:
        key = key[:-1]
    hit = idx.get(key, set())
    return len(hit & set(verses)), len(hit)


def main():
    text, alt = krv.load("bluesaurel")
    # 두 전자본에서 표기가 다른 절은 둘 다 본다 (표기 현대화 차이 흡수)
    merged = {r: (text[r] if text[r] == alt.get(r) else text[r] + " " + alt.get(r, ""))
              for r in text}
    idx, toks, bare = build_index(merged)
    idx["__toks__"] = toks
    print(f"색인: 절 {len(merged)}개, 접두어 {len(idx)-1}개")

    places = json.loads((WORK / "places.json").read_text(encoding="utf-8"))
    wdlabels = json.loads((WORK / "wikidata.json").read_text(encoding="utf-8"))

    total_mentions = sum(p["n_mentions"] for p in places)
    result = {}
    report = []

    for p in places:
        ob_verses = [v for v in p["verses"] if v in merged]
        tip = [v for v in p["tipnr_verses"] if v in merged]
        # TIPNR id 가 다른 장소를 가리키는 경우가 있다(Bochim -> Bethel).
        # OpenBible 구절과 절반 이상 겹칠 때만 보강으로 쓴다.
        if ob_verses and tip:
            ov = len(set(ob_verses) & set(tip)) / len(ob_verses)
            verses = list(dict.fromkeys(ob_verses + tip)) if ov >= 0.5 else ob_verses
        else:
            verses = ob_verses or tip
        n = p["n_mentions"]
        entry = {
            "en": p["en"],
            "ko": None,
            "source": "none",
            "confidence": 0.0,
            "n_mentions": n,
            "sample_ref": (p["verses"] or [None])[0],
        }
        rec = {"id": p["id"], "en": p["en"], "n_mentions": n,
               "wikidata": p["wikidata"], "wikidata_via": p["wikidata_via"],
               "n_verses_usable": len(verses)}

        # --- pass 1: Wikidata ko 레이블 ---
        wd = wdlabels.get(p["wikidata"] or "", {})
        wd_labels = [c for c in [wd.get("ko")] + list(wd.get("ko_aliases") or []) if c]
        rec["wd_ko"] = wd.get("ko")

        # pass 1 + pass 2 후보를 같은 척도(F1)로 매긴다
        cands = best_candidates(idx, verses, bare, extra=wd_labels) if verses else []
        rec["verse_cands"] = cands[:3]

        # 위키데이터 레이블에서 나온 한글 토큰들 (접두 기준)
        wd_toks = set()
        for lab in wd_labels:
            for tok in HANGUL.findall(lab):
                wd_toks.add(tok)
        def from_wd(k):
            return any(t.startswith(k) or k.startswith(t) for t in wd_toks)

        wd_verified = any(from_wd(c["ko"]) and c["L"] > 0 for c in cands)
        rec["wd_verified"] = wd_verified

        if cands:
            top = cands[0]
            src = "wikidata" if from_wd(top["ko"]) else "verse"
            conf = min(0.99, top["score"])
            if top["score"] >= 0.2:
                entry.update(ko=top["ko"], source=src, confidence=round(conf, 3))
                if top.get("josa_suspect"):
                    entry["josa_suspect"] = True

        rec["chosen"] = entry["ko"]
        rec["source"] = entry["source"]
        rec["confidence"] = entry["confidence"]
        rec["ob_verses"] = ob_verses[:5]
        result[p["id"]] = entry
        report.append(rec)

    (DERIVED / "places.ko.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8")
    (WORK / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1),
                                      encoding="utf-8")

    # --- 커버리지 ---
    def cov(pred):
        d = [r for r in report if pred(r)]
        return len(d), sum(r["n_mentions"] for r in d)

    n_places = len(report)
    print(f"\n장소 {n_places}개 / 언급 {total_mentions}개")
    rows = [
        ("pass1 Wikidata ko 레이블 존재", lambda r: bool(r["wd_ko"])),
        ("pass1 + 본문 검증 통과 (단독)", lambda r: r["wd_verified"]),
        ("pass1 채택 (최종 후보=위키데이터)", lambda r: r["source"] == "wikidata"),
        ("pass2 채택 (최종 후보=구절만)", lambda r: r["source"] == "verse"),
        ("pass1+2 합계", lambda r: r["source"] != "none"),
        ("  그중 confidence>=0.5", lambda r: r["source"] != "none" and r["confidence"] >= 0.5),
        ("  그중 confidence>=0.7", lambda r: r["source"] != "none" and r["confidence"] >= 0.7),
        ("매핑 실패", lambda r: r["source"] == "none"),
    ]
    print(f"\n{'':32s} {'장소':>10s} {'':>8s} {'언급':>10s}")
    for label, pred in rows:
        np_, nm = cov(pred)
        print(f"{label:32s} {np_:6d} {np_/n_places:7.1%} {nm:8d} {nm/total_mentions:7.1%}")


if __name__ == "__main__":
    main()
