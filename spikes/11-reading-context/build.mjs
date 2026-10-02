// 기존 배포 자료로 재현하는 읽기 색인. 새 외부 자료·본문·좌표를 생성하지 않는다.
// node spikes/11-reading-context/build.mjs [--check]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const checking = process.argv.includes('--check');
let changed = 0;
async function output(path, value) {
  const data = JSON.stringify(value), url = new URL(path, root);
  const before = await readFile(url, 'utf8').catch(() => null);
  if (before === data) return;
  if (checking) throw new Error(`재생성 필요: ${path}`);
  await writeFile(url, data); changed++; console.log('Generated', fileURLToPath(url));
}
const places = await read('web/data/places.json');
const overrides = await read('data/derived/places.ko.overrides.json');
// 기존 전체 빌더도 같은 overrides를 적용한다. 이번 보완은 영향을 받는 두 장만 재생성한다.
for (const [id, ch, verse] of [['a601121', 15, 17], ['a339971', 16, 4]]) {
  const name = overrides[id].ko;
  places[id].ko = name; places[id].conf = overrides[id].conf;
  const path = `web/data/krv/books/Judg/${ch}.json`, data = await read(path);
  const v = data.verses.find(v => v.v === verse), start = v.text.indexOf(name);
  if (start < 0 || v.text.indexOf(name, start + 1) >= 0) throw new Error('지명 구간을 유일하게 확인할 수 없음');
  const m = v.mentions.find(m => m.p === id);
  if (!m) throw new Error('기존 연결 없음');
  m.s = start; m.e = start + name.length;
  v.mentions.sort((a, b) => a.s - b.s);
  await output(path, data);
}
await output('web/data/places.json', places);
const books = (await read('web/data/index.json')).books;
const versions = (await read('web/data/versions.json')).versions.filter(v => v.type === 'static');
const index = { schema: 1, source: '기존 정적 역본의 지명 연결 색인 · OpenBible.info CC BY 4.0 · 출처: attribution.json', versions: {} };
for (const version of versions) {
  const refs = index.versions[version.id] = {};
  for (const book of books) for (let ch = 1; ch <= book.chapters; ch++) {
    const data = await read(`web/data/${version.id}/books/${book.id}/${ch}.json`);
    for (const v of data.verses) for (const id of new Set((v.mentions || []).map(m => m.p))) {
      if (!places[id]) throw new Error(`장소 없음: ${id}`);
      (refs[id] ||= []).push([book.id, ch, v.v]);
    }
  }
}
await output('web/data/place-refs.json', index);
console.log(`Reading index: ${Object.keys(index.versions).length} static versions; ${changed} files updated${checking ? ' (check)' : ''}`);
