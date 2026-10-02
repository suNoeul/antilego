// 본문과 지명의 관계만 계산한다. 좌표·이동 경로·해석을 생성하지 않는다.
export function versePlaces(data, verse, places) {
  return [...new Set((data?.verses?.find(v => v.v === verse)?.mentions || []).map(m => m.p))]
    .filter(id => places[id]);
}

export function placeVerses(data, id) {
  return (data?.verses || []).filter(v => v.mentions?.some(m => m.p === id)).map(v => v.v);
}

export function otherReferences(index, version, id, book, ch) {
  // 온라인 역본의 본문을 저장하거나 색인하지 않는다. 기존 개역한글 위치 색인만 참고한다.
  return (index?.versions?.[version === 'esv' ? 'krv' : version]?.[id] || [])
    .filter(([b, c]) => b !== book || c !== ch);
}

// 기존 개역한글 사사기 13–16장과 지명 ID를 대조한 주요 장면. 전체 여정이나 경로가 아니다.
export const SAMSON = [
  { ch: 13, v: 2, p: 'a08174b', title: '소라의 마노아 집', note: '삼손의 부모가 소개되는 대목입니다.' },
  { ch: 13, v: 25, p: 'ab3fd96', title: '소라와 에스다올 사이', note: '마하네단과 그 양옆의 지명을 함께 살펴봅니다.' },
  { ch: 14, v: 1, p: 'a21f909', title: '딤나에 내려가다', note: '삼손이 딤나의 여인을 만나는 대목입니다.' },
  { ch: 14, v: 19, p: 'ac87d4c', title: '아스글론', note: '수수께끼 사건 뒤 아스글론이 등장합니다.' },
  { ch: 15, v: 14, p: 'aeeaca0', title: '레히에 이르다', note: '결박된 삼손이 레히에 도착하는 대목입니다.' },
  { ch: 16, v: 4, p: 'a339971', title: '소렉 골짜기', note: '들릴라가 소개되는 대목의 지명입니다.' },
  { ch: 16, v: 21, p: 'aa8edd2', title: '가사에 붙잡혀 가다', note: '붙잡힌 삼손이 가사로 끌려가는 대목입니다.' },
  { ch: 16, v: 31, p: 'a08174b', title: '다시 소라와 에스다올 사이', note: '가족이 삼손을 장사하는 마지막 대목입니다. 묘소의 좌표를 뜻하지 않습니다.' },
];

export const hasSamson = (book, ch) => book === 'Judg' && ch >= 13 && ch <= 16;

// 탐색 중에만 존재하는 돌아갈 자리. 저장소·재실행 복원과 무관하다.
export function createReadingTrail({ capture, navigate, restore, changed }) {
  let origin = null;
  return {
    get origin() { return origin; },
    visit(ref) {
      if (!origin) origin = capture();
      changed(origin);
      navigate(ref);
    },
    back() {
      if (!origin) return;
      const saved = origin;
      origin = null;
      changed(null);
      restore(saved);
    },
  };
}
