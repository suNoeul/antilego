import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { regionLabels, regionOpacity, layoutRegionLabels } from '../../../web/region-labels.js';
let count = 0;
const check = (v, label) => { assert.ok(v, label); count++; };
const read = path => JSON.parse(readFileSync(new URL('../../../web/data/' + path, import.meta.url)));
const eras = read('eras.json').eras, features = read('geo/era_regions.json').features;
const byEra = Object.groupBy(features, f => f.properties.era);
const original = JSON.stringify(byEra);
for (const era of eras) {
  const labels = regionLabels(era, byEra);
  check(era.undated ? labels.length === 0 : labels.length > 0, `${era.id}: 시대 판정 존중`);
  check(labels.every(m => m.at.every(Number.isFinite)), `${era.id}: 유효한 대표점`);
  check(new Set(labels.map(m => m.key)).size === labels.length, `${era.id}: 중복 없음`);
}
const judges = regionLabels(eras.find(e => e.id === 'conquest_judges'), byEra);
check(judges.find(m => m.label === '애굽')?.at.join(',') === '31.25,29.95', '사사기의 애굽은 기존 검토된 대표점');
check(!judges.some(m => /북이스라엘|남유다|로마/.test(m.label)), '사사기에는 다른 시대 정치명칭을 섞지 않음');
check(JSON.stringify(byEra) === original, '기존 시대 영역 데이터 불변');
check(regionLabels(null, byEra).length === 0, '시대 정보 없음');
check(regionLabels({ id: 'missing' }, byEra).length === 0, '알 수 없는 시대');
check(regionLabels({ id: 'conquest_judges' }, {}).length === 0, '출처 없는 애굽 좌표를 생성하지 않음');
check(regionOpacity(90) === .72 && regionOpacity(420) === 0, '일정한 중간 진하기·근경 숨김');
check([20,90,150,300,419].every(v => regionOpacity(v) === .72), '확대해도 표시 중 진하기 고정');
check([0, NaN, Infinity, -1].every(v => regionOpacity(v) === 0), '잘못된 축척은 숨김');
const item = { key: 'a', x: 150, y: 100, w: 80, h: 25 };
const crowded = layoutRegionLabels([item, { ...item, key: 'b', y: 108 }], 320, 240);
check(crowded.size === 2, '가까운 배경 이름은 소폭 이동으로 배치');
const [a,b] = [...crowded.values()];
check(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], '배경 이름끼리 겹치지 않음');
check(layoutRegionLabels([item],320,240,[[90,40,210,160]]).size === 0, '본문 라벨이 배경보다 우선');
check(layoutRegionLabels([{...item,x:-5}],320,240).size === 0, '화면 밖 이름을 안으로 끌어오지 않음');
check(layoutRegionLabels([item],40,40).size === 0, '작은 화면에서 넘침 없이 생략');
const workflow = readFileSync(new URL('../../../.github/workflows/pages.yml', import.meta.url),'utf8');
const stamp = workflow.split('\n').find(l => l.includes('sed -i'));
for (const path of ['app.js','map.js','terrain.js']) {
  check(stamp.includes('web/' + path), `${path}: 중첩 모듈도 배포 버전 치환`);
  check(readFileSync(new URL('../../../web/' + path, import.meta.url),'utf8').includes("./region-labels.js?v=__V__"), `${path}: 배경 모듈 캐시 버전`);
}
console.log(`context unit: ${count} PASS`);
