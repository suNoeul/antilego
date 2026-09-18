#!/usr/bin/env bash
# Spike 01 — Natural Earth 1:10m 물리 레이어 수집 (퍼블릭 도메인).
# 사용: bash spikes/01-web-prototype/fetch_geo.sh [--force]
# 받는 곳: data/raw/naturalearth/  (git 제외)
#
# 1차: naciscdn.org (Natural Earth 공식 CDN). 2차: nvkelso/natural-earth-vector GitHub 미러.
# OSM 데이터는 쓰지 않는다 (ODbL).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DST="$ROOT/data/raw/naturalearth"
mkdir -p "$DST"

NE_VERSION="5.1.2"          # geo/meta.json 에 박히는 버전. 미러 태그와 동일.
UA="antilego-spike01/0.1 (https://github.com/; contact: rlatnsgh0708@snu.ac.kr)"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

LAYERS=(ne_10m_land ne_10m_lakes ne_10m_rivers_lake_centerlines)

for L in "${LAYERS[@]}"; do
  ZIP="$DST/$L.zip"
  if [[ -s "$ZIP" && $FORCE -eq 0 ]]; then
    echo "skip  $L.zip"
  else
    echo "get   $L.zip"
    if ! curl -fsSL --retry 3 --max-time 300 -A "$UA" \
         -o "$ZIP.tmp" "https://naciscdn.org/naturalearth/10m/physical/$L.zip"; then
      echo "      naciscdn 실패 → GitHub 미러(nvkelso v$NE_VERSION)"
      rm -f "$ZIP.tmp"
      TMPD="$(mktemp -d)"
      for EXT in shp shx dbf prj; do
        curl -fsSL --retry 3 --max-time 300 -A "$UA" -o "$TMPD/$L.$EXT" \
          "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v$NE_VERSION/10m_physical/$L.$EXT"
      done
      (cd "$TMPD" && zip -q "$ZIP.tmp" "$L".*)
      rm -rf "$TMPD"
    fi
    mv "$ZIP.tmp" "$ZIP"
  fi
  # 압축 해제 (shapefile 은 .shp/.shx/.dbf 가 한 벌이어야 한다)
  if [[ ! -s "$DST/$L.shp" || $FORCE -eq 1 ]]; then
    unzip -o -q -j "$ZIP" -d "$DST"
  fi
done

echo "$NE_VERSION" > "$DST/VERSION"
echo
echo "완료. $DST"
ls -la "$DST" | tail -n +2
