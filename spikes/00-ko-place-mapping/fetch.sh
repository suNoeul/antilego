#!/usr/bin/env bash
# Spike 00 원본 데이터 수집. 멱등(이미 있으면 건너뜀). data/raw/ 는 git에 넣지 않는다.
# 사용: bash spikes/00-ko-place-mapping/fetch.sh [--force]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="$ROOT/data/raw"
mkdir -p "$RAW"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

# 재현성을 위해 커밋 해시로 고정한다. 갱신할 때는 해시만 바꾼다.
OPENBIBLE_SHA="7eb18a5ee62f27b9b93bd6689ea272d76dd23b8f"   # openbibleinfo/Bible-Geocoding-Data (2021-11-01)
STEP_SHA="f33902054f5189c8ab64940b11b36e883d9c7bd3"        # STEPBible/STEPBible-Data (2026-09-16)
OPENBIBLES_SHA="master"                                     # seven1m/open-bibles

fetch() {  # fetch <url> <dest>
  local url="$1" dest="$2"
  if [[ -s "$dest" && $FORCE -eq 0 ]]; then
    echo "skip  $(basename "$dest")"
    return
  fi
  echo "get   $(basename "$dest")"
  curl -fsSL --retry 3 --max-time 300 -o "$dest.tmp" "$url"
  mv "$dest.tmp" "$dest"
}

# 1) 한글 본문 — 개역한글(1961). seven1m/open-bibles 의 kor-korean.osis.xml
#    출처: The Unbound Bible (Biola University) / 대한성서공회 성경전서 개역한글판
fetch "https://raw.githubusercontent.com/seven1m/open-bibles/${OPENBIBLES_SHA}/kor-korean.osis.xml" \
      "$RAW/kor-korean.osis.xml"

# 참고용 영문(퍼블릭 도메인, 절 수 대조에 사용)
fetch "https://raw.githubusercontent.com/seven1m/open-bibles/${OPENBIBLES_SHA}/eng-kjv.osis.xml" \
      "$RAW/eng-kjv.osis.xml"

# 1-b) 개역한글 대체 전자본 2종.
#   Unbound(kor-korean.osis.xml)은 역대하 21~36장 등 18개 장이 통째로 빠져 있고
#   여호수아 10장 등에서 절 번호가 어긋난다(30,625절). 그래서 아래 둘을 함께 받아 대조한다.
#   (a) bluesaurel — 66권/1189장/31102절, 1961년 옛 표기(할찌니라) 보존
mkdir -p "$RAW/krv"
fetch "https://raw.githubusercontent.com/bluesaurel/Korean-Bible-1961-KRV/main/bible_1961_krv.json" \
      "$RAW/krv/bluesaurel_1961_krv.json"
fetch "https://raw.githubusercontent.com/bluesaurel/Korean-Bible-1961-KRV/main/README.md" \
      "$RAW/krv/bluesaurel_README.md"
#   (b) yuhwan/Bible-krv — 66권/31102절, 권별 JSON. 표기는 일부 현대화되어 있음
mkdir -p "$RAW/krv/yuhwan"
fetch "https://raw.githubusercontent.com/yuhwan/Bible-krv/master/books.json" "$RAW/krv/yuhwan/books.json"
python3 - "$RAW/krv/yuhwan" <<'PYEOF'
import json, os, sys, urllib.parse, urllib.request
d = sys.argv[1]
for b in json.load(open(os.path.join(d, "books.json"))):
    dst = os.path.join(d, b + ".json")
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        continue
    url = "https://raw.githubusercontent.com/yuhwan/Bible-krv/master/" + urllib.parse.quote(b + ".json")
    urllib.request.urlretrieve(url, dst)
    print("get   yuhwan/" + b + ".json")
PYEOF

# 2) OpenBible.info Bible Geocoding (CC BY 4.0)
OB="https://raw.githubusercontent.com/openbibleinfo/Bible-Geocoding-Data/${OPENBIBLE_SHA}"
mkdir -p "$RAW/openbible"
for f in ancient.jsonl modern.jsonl geometry.jsonl source.jsonl; do
  fetch "$OB/data/$f" "$RAW/openbible/$f"
done
fetch "$OB/readme.md"    "$RAW/openbible/readme.md"
fetch "$OB/license.txt"  "$RAW/openbible/license.txt"
for f in ancient.json modern.json geometry.json source.json; do
  fetch "$OB/schemas/$f" "$RAW/openbible/schema.$f"
done

# 3) STEPBible TIPNR (CC BY 4.0)
mkdir -p "$RAW/stepbible"
fetch "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/${STEP_SHA}/Proper%20Nouns/TIPNR%20-%20Translators%20Individualised%20Proper%20Names%20with%20all%20References%20-%20STEPBible.org%20CC%20BY.txt" \
      "$RAW/stepbible/TIPNR.txt"

echo
echo "완료. $RAW"
du -h "$RAW" | tail -1
