// 순수 네비게이션 계산 (Spike 06-b, 리뷰 F3·F10).
// DOM 도 전역도 쓰지 않는다 — `index.json` 과 숫자만 받아 숫자를 돌려준다.
// 그래서 Node 에서 66권 경계를 전수로 시험할 수 있다 (`spikes/06-review-fixes/b-nav-test.mjs`).
// app.js 는 `./nav.js?v=__V__` 로, 테스트는 경로 그대로 import 한다.

// index.books 에서 권의 자리. 없으면 -1.
export function bookIndex(index, book) {
  const books = index?.books || [];
  return books.findIndex(b => b.id === book);
}

// 이 참조가 실제로 있는가 — 알려진 권 + 1 ≤ ch ≤ 그 권의 장 수.
// 형식만 맞는 `#Foo.999` · `#Gen.0` · `#Gen.999` 를 여기서 전부 거른다 (F10).
export function isValidRef(index, book, ch) {
  const i = bookIndex(index, book);
  if (i < 0) return false;
  return Number.isInteger(ch) && ch >= 1 && ch <= index.books[i].chapters;
}

// 한 장 앞(-1)·뒤(+1). 권 경계를 넘으면 이웃 권의 끝 장·첫 장으로 간다.
// 성경의 처음(창 1)에서 앞으로, 끝(계 22)에서 뒤로는 갈 곳이 없으므로 null.
//
// F3: 옛 코드는 `if (ch < 1) {...}` 다음에 독립된 `if (ch > books[i].chapters)` 를 두어,
// 앞 권 끝 장을 넣은 뒤 그 값을 **원래 권**의 장 수와 다시 비교했다. 앞 권이 더 길면
// 두 번째 분기가 참이 되어 다음 권 1장으로 덮어썼다 (출 1 ‹ → 레 1). 이제 갈래가 하나다.
export function stepRef(index, book, ch, dir) {
  const books = index?.books || [];
  const i = books.findIndex(b => b.id === book);
  if (i < 0) return null;
  if (!Number.isInteger(ch) || ch < 1 || ch > books[i].chapters) return null;
  const next = ch + dir;
  if (next < 1) {
    if (i === 0) return null;                        // 창 1 ‹ → 그대로
    return { book: books[i - 1].id, ch: books[i - 1].chapters };
  }
  if (next > books[i].chapters) {
    if (i === books.length - 1) return null;         // 계 22 › → 그대로
    return { book: books[i + 1].id, ch: 1 };
  }
  return { book: books[i].id, ch: next };
}
