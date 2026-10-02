import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { placeVerses, versePlaces, otherReferences, SAMSON, hasSamson, createReadingTrail } from '../../../web/reading-context.js';
const json = path => JSON.parse(readFileSync(new URL('../../../' + path, import.meta.url)));
const places = json('web/data/places.json'), index = json('web/data/place-refs.json');
const chapter = (c, ver = 'krv') => json(`web/data/${ver}/books/Judg/${c}.json`);
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
equal(placeVerses(chapter(13), 'a08174b'), [2, 25], '소라의 등장 절');
equal(versePlaces(chapter(13), 25, places), ['a08174b', 'a355b6e', 'ab3fd96'], '같은 절의 세 장소');
equal(placeVerses(chapter(14), 'a21f909'), [1, 2, 5], '한 절에 두 번 나와도 중복 절 없음');
equal(versePlaces(null, 25, places), [], '본문 실패');
equal(versePlaces(chapter(13), 25, {}), [], '알 수 없는 장소 제외');
equal(placeVerses(chapter(13), null), [], '선택 없음');
equal(otherReferences(null, 'krv', 'a08174b', 'Judg', 13), [], '색인 실패');
const refs = otherReferences(index, 'krv', 'a08174b', 'Judg', 13);
equal(refs.some(([b,c]) => b === 'Judg' && c === 13), false, '현재 장 제외');
equal(refs.some(([b,c,v]) => b === 'Judg' && c === 16 && v === 31), true, '다른 장의 동일 장소');
equal(otherReferences(index, 'esv', 'a08174b', 'Judg', 13), refs, '온라인 본문 저장 없이 명시된 기준 색인');
equal(Object.keys(index.versions), ['krv', 'kjv', 'bsb'], '정적 역본만 색인');
equal(SAMSON.length, 8, '8개 주요 장면');
equal(hasSamson('Judg', 13), true, '이야기 진입점');
equal(hasSamson('Judg', 17), false, '이야기 밖');
equal(hasSamson('Gen', 13), false, '다른 책');
for (const s of SAMSON) for (const ver of Object.keys(index.versions)) {
  equal(versePlaces(chapter(s.ch, ver), s.v, places).includes(s.p), true, `${ver} ${s.ch}:${s.v} 근거 지명`);
  equal('at' in s || 'coordinates' in s || 'route' in s, false, '새 좌표·경로 없음');
}
for (const [id, ch, v, name, wrong] of [
  ['a601121', 15, 17, '라맛 레히', '내어던지고'], ['a339971', 16, 4, '소렉 골짜기', '들릴라라'],
]) {
  const verse = chapter(ch).verses.find(x => x.v === v), mention = verse.mentions.find(m => m.p === id);
  equal(places[id].ko, name, '검토된 한글 지명');
  equal(verse.text.slice(mention.s, mention.e), name, '지명만 링크');
  equal(verse.text.includes(wrong), true, '기존 본문 낱말은 삭제·수정하지 않음');
  equal(json('data/derived/places.ko.overrides.json')[id].ko, name, '전체 재빌드에도 수정 유지');
}
const events = [], saved = { book: 'Judg', ch: 13, y: 200 };
const trail = createReadingTrail({ capture: () => saved, navigate: r => events.push(r), restore: r => events.push(r), changed: () => {} });
trail.back(); equal(events.length, 0, '빈 돌아가기');
trail.visit({ book: 'Josh', ch: 15 }); trail.visit({ book: 'Judg', ch: 16 });
equal(trail.origin, saved, '연속 탐색에도 첫 자리 유지');
trail.back(); equal(events.at(-1), saved, '첫 자리 복귀'); equal(trail.origin, null, '복귀 후 해제');
equal(createReadingTrail({}).origin, null, '새 실행은 복원하지 않음');
for (const [ch, expected] of [[15, 'b86a775be7858979746ec6ee4ddfc2493bb09edd9bb7d85fab57df90296f71d4'],
  [16, 'c409264a8ffc3571f8488e9912ba466774cb7fbd4dcbca3133a3f1dce1ca2e1e']]) {
  equal(createHash('sha256').update(JSON.stringify(chapter(ch).verses.map(v => [v.v, v.text]))).digest('hex'), expected, '수정 전 본문 해시 불변');
}
console.log(`Reading context unit: ${checks} PASS`);
