// F3 회귀 테스트 — `web/nav.js` 의 stepRef / isValidRef 를 진짜 index.json 으로 전수 시험.
// 실행: node spikes/06-review-fixes/b-nav-test.mjs
// 브라우저도 DOM 도 쓰지 않는다. 순수 함수라서 가능하다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stepRef, isValidRef } from '../../web/nav.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const index = JSON.parse(readFileSync(join(ROOT, 'web/data/index.json'), 'utf8'));
const books = index.books;

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.log(`  FAIL ${name}\n    got  ${g}\n    want ${w}`);
};

console.log(`index.json: ${books.length}권, ${books.reduce((a, b) => a + b.chapters, 0)}장`);

// --- 1. 권 경계 65 + 65 ---
// 뒤로: 각 권 1장에서 ‹ → 앞 권의 마지막 장.
for (let i = 1; i < books.length; i++) {
  eq(`${books[i].id} 1 ‹`, stepRef(index, books[i].id, 1, -1),
    { book: books[i - 1].id, ch: books[i - 1].chapters });
}
// 앞으로: 각 권 마지막 장에서 › → 다음 권 1장.
for (let i = 0; i < books.length - 1; i++) {
  eq(`${books[i].id} ${books[i].chapters} ›`, stepRef(index, books[i].id, books[i].chapters, 1),
    { book: books[i + 1].id, ch: 1 });
}

// --- 2. 성경의 양 끝 ---
eq('창 1 ‹ (갈 곳 없음)', stepRef(index, books[0].id, 1, -1), null);
eq('계 22 › (갈 곳 없음)',
  stepRef(index, books.at(-1).id, books.at(-1).chapters, 1), null);

// --- 3. 리뷰가 콕 집은 사례 ---
eq('출 1 ‹ → 창 50', stepRef(index, 'Exod', 1, -1), { book: 'Gen', ch: 50 });
eq('창 50 › → 출 1', stepRef(index, 'Gen', 50, 1), { book: 'Exod', ch: 1 });

// --- 4. 권 안쪽은 그냥 ±1 ---
for (const b of books) {
  for (let ch = 2; ch <= b.chapters; ch++) {
    eq(`${b.id} ${ch} ‹`, stepRef(index, b.id, ch, -1), { book: b.id, ch: ch - 1 });
  }
  for (let ch = 1; ch < b.chapters; ch++) {
    eq(`${b.id} ${ch} ›`, stepRef(index, b.id, ch, 1), { book: b.id, ch: ch + 1 });
  }
}

// --- 5. 잘못된 입력은 움직이지 않는다 ---
eq('없는 권', stepRef(index, 'Foo', 1, -1), null);
eq('0장', stepRef(index, 'Gen', 0, 1), null);
eq('범위 밖 장', stepRef(index, 'Gen', 999, -1), null);
eq('정수 아님', stepRef(index, 'Gen', 1.5, 1), null);

// --- 6. isValidRef (F10) ---
eq('isValidRef Gen.1', isValidRef(index, 'Gen', 1), true);
eq('isValidRef Gen.50', isValidRef(index, 'Gen', 50), true);
eq('isValidRef Gen.0', isValidRef(index, 'Gen', 0), false);
eq('isValidRef Gen.51', isValidRef(index, 'Gen', 51), false);
eq('isValidRef Gen.999', isValidRef(index, 'Gen', 999), false);
eq('isValidRef Foo.999', isValidRef(index, 'Foo', 999), false);
eq('isValidRef Rev.22', isValidRef(index, 'Rev', 22), true);
eq('isValidRef Rev.23', isValidRef(index, 'Rev', 23), false);
// 모든 권의 1장과 마지막 장은 유효, 0장과 마지막+1 장은 무효.
for (const b of books) {
  eq(`valid ${b.id}.1`, isValidRef(index, b.id, 1), true);
  eq(`valid ${b.id}.${b.chapters}`, isValidRef(index, b.id, b.chapters), true);
  eq(`invalid ${b.id}.0`, isValidRef(index, b.id, 0), false);
  eq(`invalid ${b.id}.${b.chapters + 1}`, isValidRef(index, b.id, b.chapters + 1), false);
}

console.log(`\n${fail ? 'FAIL' : 'PASS'} — ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
