import assert from 'node:assert/strict';
import { sceneBounds, placeLabels, terrainStyle, MAX_PITCH, TERRAIN_BOUNDS } from '../../../web/terrain.js';
import { readFileSync } from 'node:fs';
let count = 0;
const check = (v, message) => { assert.ok(v, message); count++; };
const p = { j: { lon: 35.23, lat: 31.78 }, r: { lon: 35.46, lat: 31.87 },
  invalid: { lon: null, lat: null }, outside: { lon: 120, lat: 30 } };
const scene = { places: p, focus: ['j'], others: ['r'], regions: [] };
const before = JSON.stringify(scene);
const bounds = sceneBounds(scene);
check(bounds[0][0] < p.j.lon && bounds[1][0] > p.j.lon, '선택 지명 포함');
check(bounds[1][0] - bounds[0][0] < .4, '선택 지명은 근경');
const wide = sceneBounds({ ...scene, focus: [], others: ['j', 'r'] });
check(wide[0][0] < p.j.lon && wide[1][0] > p.r.lon, '장 지명 전체 포함');
check(JSON.stringify(scene) === before, '입력 불변');
check(sceneBounds({ places: p, focus: ['invalid', 'outside'] }).flat().every(Number.isFinite), '잘못된 좌표 배제');
check(sceneBounds({ places: {}, others: [] }).flat().every(Number.isFinite), '지명 없는 장');
const places = JSON.parse(readFileSync(new URL('../../../web/data/places.json', import.meta.url)));
const ids = ['a08174b', 'a355b6e', 'ab3fd96'];
for (const id of ids) {
  const b = sceneBounds({ places, focus: [id], others: ids.filter(x => x !== id) });
  check(ids.every(k => places[k].lon >= b[0][0] && places[k].lon <= b[1][0]
    && places[k].lat >= b[0][1] && places[k].lat <= b[1][1]), '사사기 13장 어느 선택도 세 지명 포함');
}
const close = ids.map((id,i) => ({id,x:150+i*3,y:100+i*2,w:55,h:20,focus:i===0,region:false}));
const unchanged = JSON.stringify(close);
const labels = [...placeLabels(close,320,240).values()];
check(labels.every(Boolean), '거의 겹친 세 좌표도 이름 배치');
check(labels.every((a,i) => labels.slice(i+1).every(b => a[2]<=b[0]||a[0]>=b[2]||a[3]<=b[1]||a[1]>=b[3])), '이름 사각형 충돌 없음');
check(labels.every(b => b[0]>=8&&b[1]>=8&&b[2]<=312&&b[3]<=194), '라벨은 화면·조작 버튼 여백 안');
check(JSON.stringify(close)===unchanged, '배치 계산이 좌표·입력을 바꾸지 않음');
check(placeLabels([],320,240).size===0, '빈 지도 배치');
check(placeLabels(close,40,40).get(ids[1])===null, '공간 부족은 이름만 생략 신호');
const colors = { sea: '#cfe3e6', land: '#f6f1e7', coast: '#a08461', river: '#7fa7c9',
  shadow: '#777c60', highlight: '#fffaf0', accent: '#b5aa8b',
  regionFill: ['#c9a227', '#7d8a3f', '#a8624a'], regionLine: ['#927012', '#566124', '#7c3e2a'] };
const regions = [
  { type: 'Feature', properties: { render: 'blob' }, geometry: { type: 'Polygon', coordinates: [[[34,31],[35,31],[35,32],[34,31]]] } },
  { type: 'Feature', properties: { render: 'label_only' }, geometry: { type: 'Point', coordinates: [35,32] } },
];
const style = terrainStyle({}, colors, regions);
check(style.terrain.exaggeration === 1, '높이 과장 없음');
check(MAX_PITCH === 55, '기울기 상한');
check(style.sources.elevation.encoding === 'terrarium', '실제 타일 인코딩');
check(style.sources.elevation.tileSize === 512, '타일 크기');
check(style.sources.elevation.maxzoom === 12, '요청 상세 단계 제한');
assert.deepEqual(style.sources.elevation.bounds, TERRAIN_BOUNDS); count++;
check(style.sources.regions.data.features.length === 1, 'label_only 영역을 폴리곤으로 만들지 않음');
check(style.layers.find(x => x.id === 'region-lines').paint['line-dasharray'].length === 2, '점선 영역');
check(style.layers.findIndex(x => x.id === 'relief') < style.layers.findIndex(x => x.id === 'lakes'), '물은 음영 위');
check(!style.glyphs && !style.sprite, '외부 지명·아이콘 서비스 없음');
check(!JSON.stringify(style).match(/openstreetmap|mapbox|satellite/i), 'OSM·위성 혼합 없음');
console.log(`terrain unit: ${count} PASS`);
