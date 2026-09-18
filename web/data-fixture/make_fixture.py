# web/data-fixture 생성 — 개역한글 원문 그대로, mention 인덱스만 계산
import json, re
from pathlib import Path

ROOT = Path('/Users/snow/Workspace/Antilego')
OUT = ROOT / 'web' / 'data-fixture'

raw = json.loads((ROOT / 'data/raw/krv/bluesaurel_1961_krv.json').read_text(encoding='utf-8'))
josh10 = None
for b in raw:
    if b['book'] == 'Joshua':
        for ch in b['chapters']:
            if ch['chapter'] == 10:
                josh10 = ch['verses']
assert josh10

# place_id는 OpenBible ancient id (data/derived/places.ko.json 실제 키)
KO2ID = {'예루살렘': 'a15257a', '여리고': 'a231f80', '기브온': 'aede336', '아세가': 'af2ca0c'}

verses = []
counts = {}
order = []
for v in josh10[:11]:                       # 1–11절
    text = v['text'].strip()
    ms = []
    for ko, pid in KO2ID.items():
        for m in re.finditer(re.escape(ko), text):
            ms.append({'s': m.start(), 'e': m.end(), 'p': pid})
            counts[pid] = counts.get(pid, 0) + 1
            if pid not in order:
                order.append(pid)
    ms.sort(key=lambda x: x['s'])
    verses.append({'v': v['verse'], 'text': text, 'mentions': ms})

# 첫 등장 순으로 다시 정렬
first = {}
for vv in verses:
    for m in vv['mentions']:
        first.setdefault(m['p'], (vv['v'], m['s']))
order = sorted(counts, key=lambda p: first[p])

chapter = {'book': 'Josh', 'chapter': 10, 'verses': verses,
           'places': [{'p': p, 'n': counts[p]} for p in order]}

index = {'books': [
    {'id': 'Gen', 'ko': '창세기', 'abbr': '창', 'testament': 'OT', 'chapters': 50},
    {'id': 'Josh', 'ko': '여호수아', 'abbr': '수', 'testament': 'OT', 'chapters': 24},
]}

places = {
    'a15257a': {'ko': '예루살렘', 'en': 'Jerusalem',  'lat': 31.778, 'lon': 35.235, 'n': 955, 'conf': 0.833},
    'a231f80': {'ko': '여리고',   'en': 'Jericho 1',  'lat': 31.870, 'lon': 35.444, 'n': 63,  'conf': 0.868},
    'aede336': {'ko': '기브온',   'en': 'Gibeon',     'lat': 31.847, 'lon': 35.184, 'n': 39,  'conf': 0.877},
    'af2ca0c': {'ko': '아세가',   'en': 'Azekah',     'lat': 31.700, 'lon': 34.935, 'n': 7,   'conf': 0.99},
}

attribution = [
    '성경전서 개역한글판 © 대한성서공회',
    'Place data: OpenBible.info Bible Geocoding (CC BY 4.0)',
    'Proper names: STEPBible TIPNR (CC BY 4.0)',
    'Basemap: Natural Earth (public domain)',
]

# --- 손으로 그린 지형 (정확도 무관, 모양만 그럴듯하게) ---
# 레반트 해안: 지중해 동안을 따라 남북으로, 내륙은 bbox 동쪽 끝까지 덮는 덩어리
coast = [
    [34.55, 29.5], [34.48, 30.4], [34.53, 31.1], [34.65, 31.6], [34.83, 32.1],
    [34.95, 32.5], [35.05, 32.9], [35.10, 33.1], [35.25, 33.4], [35.45, 33.9],
    [35.62, 34.4], [35.90, 34.9], [36.15, 35.4], [36.60, 35.9],
    [40.0, 36.6], [44.0, 36.2], [46.5, 33.5], [46.0, 30.0], [43.0, 28.0],
    [39.0, 27.5], [36.0, 28.2], [34.9, 29.0], [34.55, 29.5],
]
land = {'type': 'FeatureCollection', 'features': [
    {'type': 'Feature', 'properties': {'name': 'Levant'},
     'geometry': {'type': 'Polygon', 'coordinates': [coast]}},
]}

dead_sea = [[35.47, 31.75], [35.55, 31.55], [35.58, 31.30], [35.52, 31.10],
            [35.42, 30.98], [35.35, 31.15], [35.38, 31.45], [35.42, 31.68], [35.47, 31.75]]
galilee = [[35.55, 32.88], [35.65, 32.82], [35.66, 32.72], [35.58, 32.68],
           [35.50, 32.72], [35.49, 32.82], [35.55, 32.88]]
lakes = {'type': 'FeatureCollection', 'features': [
    {'type': 'Feature', 'properties': {'name': 'Dead Sea'},
     'geometry': {'type': 'Polygon', 'coordinates': [dead_sea]}},
    {'type': 'Feature', 'properties': {'name': 'Sea of Galilee'},
     'geometry': {'type': 'Polygon', 'coordinates': [galilee]}},
]}

jordan = [[35.62, 33.25], [35.60, 33.00], [35.57, 32.88], [35.57, 32.68],
          [35.53, 32.45], [35.55, 32.20], [35.52, 31.95], [35.50, 31.78]]
rivers = {'type': 'FeatureCollection', 'features': [
    {'type': 'Feature', 'properties': {'name': 'Jordan'},
     'geometry': {'type': 'LineString', 'coordinates': jordan}},
]}

meta = {'bbox': [25, 25, 50, 42],
        'source': 'hand-drawn fixture (개발용 — Natural Earth 아님)',
        'simplify_tolerance': None}

def w(rel, obj):
    p = OUT / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(rel, p.stat().st_size)

w('index.json', index)
w('books/Josh/10.json', chapter)
w('places.json', places)
w('attribution.json', attribution)
w('geo/land.json', land)
w('geo/lakes.json', lakes)
w('geo/rivers.json', rivers)
w('geo/meta.json', meta)
print(json.dumps(chapter['places'], ensure_ascii=False))
print(json.dumps(verses[0], ensure_ascii=False))
