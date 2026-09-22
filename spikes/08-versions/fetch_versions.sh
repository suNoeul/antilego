#!/usr/bin/env bash
# Spike 08-a — 영문 역본 원본 수집 (퍼블릭 도메인만). 멱등(이미 있으면 건너뜀).
# data/raw/ 는 git 에 넣지 않는다 — 이 스크립트가 재현 수단이다.
#
# 사용: bash spikes/08-versions/fetch_versions.sh [--force]
#
# 받는 것
#   KJV  eBible.org  eng-kjv2006  USFX  — 퍼블릭 도메인 (영국 밖). 1769 표준본문, 정경 66권
#   BSB  eBible.org  engbsb       USFX  — 퍼블릭 도메인 (BSB Publishing, LLC)
# 각 zip 안의 copr.htm 이 라이선스 원문이다. 받은 뒤 sha256 을 찍는다 (RESULT.md 에 기록).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="$ROOT/data/raw"

FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1

fetch() {  # fetch <url> <dest>
  local url="$1" dest="$2"
  if [[ -s "$dest" && $FORCE -eq 0 ]]; then
    echo "skip  ${dest#$RAW/}"
    return
  fi
  echo "get   ${dest#$RAW/}"
  curl -fsSL --retry 3 --max-time 600 -o "$dest.tmp" "$url"
  mv "$dest.tmp" "$dest"
}

get_version() {  # get_version <ebible_id> <dir>
  local id="$1" dir="$RAW/$2"
  mkdir -p "$dir"
  fetch "https://ebible.org/Scriptures/${id}_usfx.zip" "$dir/${id}_usfx.zip"
  # 멱등: 압축 해제 결과가 이미 있으면 다시 풀지 않는다
  if [[ ! -s "$dir/${id}_usfx.xml" || $FORCE -eq 1 ]]; then
    unzip -oq "$dir/${id}_usfx.zip" -d "$dir"
  fi
}

get_version eng-kjv2006 kjv
get_version engbsb      bsb

echo
echo "sha256 (RESULT.md 와 대조한다)"
shasum -a 256 "$RAW/kjv/eng-kjv2006_usfx.zip" "$RAW/bsb/engbsb_usfx.zip"
echo
echo "라이선스 원문: data/raw/kjv/copr.htm · data/raw/bsb/copr.htm"
