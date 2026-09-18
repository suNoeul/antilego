"""수동 판정 표본(eval_manual.json)으로 정확도를 추정한다."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1] / "data" / "raw" / "work"

rep = json.loads((WORK / "report.json").read_text(encoding="utf-8"))
rep.sort(key=lambda r: -r["n_mentions"])
ev = json.loads((HERE / "eval_manual.json").read_text(encoding="utf-8"))
by_en = {}
for r in rep:
    by_en.setdefault(r["en"], r)

total = sum(r["n_mentions"] for r in rep)
top = rep[:80]
top_m = sum(r["n_mentions"] for r in top)
tw = sum(by_en[e]["n_mentions"] for e in ev["top80_wrong"])
tp = sum(by_en[e]["n_mentions"] for e in ev["top80_partial"])
print(f"전체 언급 {total}")
print(f"상위 80개 = 언급 {top_m} ({top_m/total:.1%})   오답 {tw} ({tw/top_m:.1%})  "
      f"부분일치 {tp} ({tp/top_m:.1%})")

cat = {"ok": 0, "partial": 0, "josa": 0, "wrong": 0}
n = {"ok": 0, "partial": 0, "josa": 0, "wrong": 0}
for en, ko, c, _ in ev["tail_sample"]:
    m = by_en[en]["n_mentions"]
    cat[c] += m
    n[c] += 1
s = sum(cat.values())
print(f"\n꼬리(81위 이하) 표본 {len(ev['tail_sample'])}곳, 표본 언급 {s}")
for c in ("ok", "josa", "partial", "wrong"):
    print(f"  {c:8s} {n[c]:3d}곳  언급 {cat[c]:4d}  {cat[c]/s:6.1%}")
tail_m = total - top_m
tail_ok = (cat["ok"] + cat["josa"] + cat["partial"]) / s
print(f"\n꼬리 전체 추정: 언급 {tail_m} ({tail_m/total:.1%}), 쓸 만한 비율 {tail_ok:.1%}")

good_top = top_m - tw
good_tail = tail_m * tail_ok
print(f"\n=== 언급 가중 추정 정확 매핑률 ===")
print(f"  상위 80  {good_top:7.0f}")
print(f"  꼬리     {good_tail:7.0f}")
print(f"  합계     {good_top + good_tail:7.0f} / {total} = {(good_top + good_tail)/total:.1%}")
strict_tail = (cat["ok"] + cat["josa"]) / s
print(f"  (부분일치를 실패로 치면 {(top_m - tw - tp + tail_m*strict_tail)/total:.1%})")

# 조사 의심 비율
sus = [r for r in rep if r["chosen"] and any(
    r["chosen"].endswith(j) for j in ["에서", "에게", "으로", "까지", "부터", "에", "와", "과",
                                      "을", "를", "은", "는", "이", "가", "의", "로", "도"])]
print(f"\n조사가 붙었을 가능성이 있는 후보: {len(sus)}곳, 언급 "
      f"{sum(r['n_mentions'] for r in sus)} ({sum(r['n_mentions'] for r in sus)/total:.1%})")
