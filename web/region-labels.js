// 배경 이름은 나라/지역의 대략적인 위치 참고이지 영토·지배권 표시가 아니다.
// 출처: 기존 Spike 03의 검토된 era_regions + eras. 좌표와 시대 범위는 새로 추정하지 않는다.
const SHORT_NAMES = {
  '가나안 성읍들': '가나안', '가나안 성읍국가': '가나안',
  '블레셋 다섯 도시': '블레셋', '이스라엘 통일왕국': '이스라엘',
  '페니키아(두로·시돈)': '두로·시돈', '페니키아(두로)': '두로 일대',
  '요단 동편 왕국들(모압·암몬·에돔)': '요단 동편',
  '메소포타미아(우르·하란)': '메소포타미아',
  '아람(다메섹·소바)': '아람', '아람-다메섹': '아람',
  '앗수르 제국': '앗수르', '바벨론 제국(후기)': '바벨론',
  '신바벨론 제국': '바벨론', '황폐한 유다': '유다',
  '페르시아(신흥)': '페르시아', '페르시아 제국': '페르시아',
  '예후드(유다) 속주': '유다', '사마리아 속주': '사마리아',
  '아라비아(게셈)': '아라비아', '해안 도시(아스돗 등)': '해안 성읍들',
  '베레아(요단 동편)': '베레아', '수리아(로마 속주)': '수리아',
  '갈라디아·내륙 소아시아': '갈라디아·소아시아',
};
const valid = at => Array.isArray(at) && at.length === 2 && at.every(Number.isFinite)
  && at[0] >= 8 && at[0] <= 50 && at[1] >= 24 && at[1] <= 43;

export function regionLabels(era, regionsByEra = {}) {
  if (!era || era.undated) return [];
  const features = [...(regionsByEra[era.id] || [])];
  // 사사기의 주변 배경에도 애굽을 표시한다. 출애굽 자료의 검토된 이름/대표점만
  // 재사용한다. 왕조·연대·영역을 다른 시대로 복사하지 않는다.
  if (era.id === 'conquest_judges' && !features.some(f => f.properties?.polity_ko === '애굽')) {
    const egypt = (regionsByEra.exodus_wilderness || []).find(f =>
      f.properties?.polity_ko === '애굽' && f.properties.render === 'label_only');
    if (egypt) features.push(egypt);
  }
  const seen = new Set();
  return features.flatMap(f => {
    const p = f.properties || {};
    const at = p.render === 'label_only' && f.geometry?.type === 'Point' ? f.geometry.coordinates : p.rep;
    const name = p.polity_ko;
    if (!name || !valid(at) || seen.has(name)) return [];
    seen.add(name);
    return [{ key: name, label: SHORT_NAMES[name] || name, at: [...at] }];
  });
}

export const REGION_FONT_SIZE = 14;
export const REGION_LETTER_SPACING = .8;

// 표시 중에는 항상 같은 중간 진하기. 확대에 따른 강조/페이드는 없고 근경에서만 숨긴다.
export function regionOpacity(pixelsPerDegree) {
  if (!Number.isFinite(pixelsPerDegree) || pixelsPerDegree <= 0) return 0;
  return pixelsPerDegree < 420 ? .72 : 0;
}

// 본문 라벨과 위치 점을 먼저 배치한 뒤 남은 공간에만 배경 이름을 놓는다.
// 화면 밖 지역을 가장자리로 끌어오거나 먼 곳에 이름을 옮기지 않는다.
export function layoutRegionLabels(items, width, height, occupied = []) {
  const boxes = occupied.map(b => [...b]), result = new Map();
  const hit = (a, b) => a[0] < b[2] + 6 && a[2] > b[0] - 6
    && a[1] < b[3] + 6 && a[3] > b[1] - 6;
  for (const m of items) {
    if (![m.x, m.y, m.w, m.h].every(Number.isFinite) || m.x < 0 || m.x > width
      || m.y < 0 || m.y > height - 44) continue;
    for (const [dx, dy] of [[0, 0], [0, -24], [0, 24], [-24, 0], [24, 0]]) {
      const x = m.x - m.w / 2 + dx, y = m.y - m.h / 2 + dy;
      const b = [x, y, x + m.w, y + m.h];
      if (x < 10 || y < 12 || b[2] > width - 10 || b[3] > height - 46 || boxes.some(o => hit(b, o))) continue;
      result.set(m.key, b); boxes.push(b); break;
    }
  }
  return result;
}
