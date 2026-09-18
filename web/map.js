// 양식화 미니맵 렌더러. 순수 함수 — fetch·전역 상태 없음.
// renderScene(svgEl, scene, layers, tokens, view)
//   scene  = { focus: [placeId], others: [placeId], places: { id: {ko, lat, lon} },
//              regions: [GeoJSON Feature] }   ← Spike 03-d. 이 장의 시대 영역.
//            regions 는 비어 있는 것이 정상이다(시대 불특정·원시사, 또는 레이어 꺼짐).
//            properties.render 는 'blob'(폴리곤) 또는 'label_only'(이름만) 두 가지뿐.
//   layers = { land, lakes, rivers, bbox }  GeoJSON FeatureCollection (없으면 생략).
//            bbox 는 지형 데이터가 덮는 전체 범위 [lonMin, latMin, lonMax, latMax]
//            (geo/meta.json). 이동 한계를 여기에 맞춘다.
//   tokens = { sea, land, coast, river, dot, dotDim, label }  색 문자열
//            app.js는 'var(--sea)' 꼴을 넘긴다 → 다크 전환 시 재렌더 불필요.
//   view   = { z, px, py }  확대·이동. z=1, px=py=0 이 scene bbox 그대로(기본값).
//            좌표는 viewBox 픽셀 단위. 매 렌더마다 점·라벨을 다시 계산하므로
//            점 크기와 글자 크기는 화면에서 항상 같고, 확대하면 겹침이 풀려
//            숨어 있던 라벨이 되살아난다(LOD).
//
// 규칙 (Spike 02-b): **이름 없는 점은 그리지 않는다.** 라벨을 놓지 못한 non-focus
// 지명은 점도 그리지 않는다. focus 는 언제나 그린다.

export const W = 320, H = 240;   // viewBox. 카드 4:3
export const ZOOM_MIN = 1, ZOOM_MAX = 8;

const MIN_DEG = 1.8;             // 최소 폭 200km ≈ 위도 1.8°
const PAD = 0.25;                // 양쪽 25% 패딩
const SVG = 'http://www.w3.org/2000/svg';
const CLAMP = 20000;             // 화면 밖 좌표 잘라내기 (SVG가 clip)
const EDGE = 8;                  // 라벨은 이 여백 안쪽에 통째로 들어와야 한다
const KEEP = 0.25;               // 아무리 밀어도 화면의 25%에는 데이터가 남는다
const GAP = 3;                   // 점과 라벨 사이

export const R_DOT = 2, R_FOCUS = 4;        // 점 반지름 (viewBox 단위 고정)
export const SZ_DOT = 11, SZ_FOCUS = 13;    // 글자 크기 (viewBox 단위 고정)
export const R_REGION = 3, SZ_REGION = 10;  // 시대 영역: 빈 동그라미 / 라벨

// 지형 데이터가 덮는 범위 (geo/meta.json 의 bbox). layers.bbox 가 있으면 그쪽이 이긴다.
export const GEO_BBOX = [8, 24, 50, 43];

const DEFAULT_TOKENS = {
  sea: 'var(--sea)', land: 'var(--land)', coast: 'var(--coast)', river: 'var(--river)',
  dot: 'var(--dot)', dotDim: 'var(--dot-dim)', label: 'var(--label)',
  labelDim: 'var(--label-dim)',
  // 시대 영역: 2~3색 순환. 나라마다 다른 색을 주면 지도가 시끄러워진다.
  regionFill: ['var(--region-a)', 'var(--region-b)', 'var(--region-c)'],
  regionLine: ['var(--region-a-line)', 'var(--region-b-line)', 'var(--region-c-line)'],
};

export const BASE_VIEW = { z: 1, px: 0, py: 0 };

// 이동 한계. bounds 는 z=1·이동 0 일 때 데이터가 차지하는 viewBox 사각형
// ({x0,y0,x1,y1}). 없으면 scene bbox(= 화면 전체)로 본다.
const DEFAULT_BOUNDS = { x0: 0, y0: 0, x1: W, y1: H };

// 한 축: 데이터가 화면의 KEEP 비율만큼은 남도록 이동량을 자른다.
function clampAxis(p, z, b0, b1, size) {
  const lo = size * KEEP - b1 * z;          // 데이터 오른쪽 끝이 화면 왼쪽 25% 안
  const hi = size * (1 - KEEP) - b0 * z;    // 데이터 왼쪽 끝이 화면 오른쪽 25% 안
  if (lo > hi) return (lo + hi) / 2;        // 데이터가 KEEP 보다 좁으면 가운데
  return Math.max(lo, Math.min(hi, p));
}

// 확대 배율과 이동량을 허용 범위로 자른다.
export function clampView(v, bounds) {
  const b = bounds || DEFAULT_BOUNDS;
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (v && v.z) || 1));
  return {
    z,
    px: clampAxis((v && v.px) || 0, z, b.x0, b.x1, W),
    py: clampAxis((v && v.py) || 0, z, b.y0, b.y1, H),
  };
}

// (cx, cy) 를 제자리에 둔 채 factor 배 확대한다. viewBox 픽셀 좌표.
export function zoomAt(v, cx, cy, factor, bounds) {
  const cur = clampView(v, bounds);
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cur.z * factor));
  const k = z / cur.z;
  return clampView({ z, px: cx - (cx - cur.px) * k, py: cy - (cy - cur.py) * k }, bounds);
}

const el = (name, attrs) => {
  const n = document.createElementNS(SVG, name);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
};
const r1 = v => Math.round(Math.max(-CLAMP, Math.min(CLAMP, v)) * 10) / 10;
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const inside = b =>
  b[0] >= EDGE && b[2] <= W - EDGE && b[1] >= EDGE && b[3] <= H - EDGE;

export function renderScene(svgEl, scene, layers, tokens, view) {
  const t = { ...DEFAULT_TOKENS, ...(tokens || {}) };
  const L = layers || {};
  const all = scene.places || {};
  const focus = (scene.focus || []).filter(id => all[id]);
  const others = (scene.others || []).filter(id => all[id] && !focus.includes(id));
  const shown = [...focus, ...others];

  svgEl.textContent = '';
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgEl.setAttribute('role', 'img');

  // --- 투영: 등장방형. x = (lon−lon0)·cos(lat0), y = −(lat−lat0) ---
  const lats = shown.map(id => all[id].lat), lons = shown.map(id => all[id].lon);
  const lat0 = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 31.8;
  const lon0 = lons.length ? (Math.min(...lons) + Math.max(...lons)) / 2 : 35.2;
  const k = Math.cos(lat0 * Math.PI / 180);
  const proj = (lon, lat) => [(lon - lon0) * k, -(lat - lat0)];

  // --- bbox: 25% 패딩 → 최소 폭 → 4:3 ---
  const pts = shown.map(id => proj(all[id].lon, all[id].lat));
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  if (pts.length) {
    x0 = Math.min(...pts.map(p => p[0])); x1 = Math.max(...pts.map(p => p[0]));
    y0 = Math.min(...pts.map(p => p[1])); y1 = Math.max(...pts.map(p => p[1]));
  }
  let w = x1 - x0, h = y1 - y0;
  x0 -= w * PAD; x1 += w * PAD; y0 -= h * PAD; y1 += h * PAD;
  w = x1 - x0; h = y1 - y0;
  if (w < MIN_DEG) { const c = (x0 + x1) / 2; x0 = c - MIN_DEG / 2; x1 = c + MIN_DEG / 2; w = MIN_DEG; }
  if (h <= 0 || w / h > W / H) { const c = (y0 + y1) / 2; h = w * H / W; y0 = c - h / 2; y1 = c + h / 2; }
  else { const c = (x0 + x1) / 2; w = h * W / H; x0 = c - w / 2; x1 = c + w / 2; }

  // --- 이동 한계: scene bbox 가 아니라 **지형 데이터 전체 범위** ---
  // scene bbox 는 처음(⟲) 그림만 정하고, 이동은 지도가 있는 곳 어디로든 갈 수 있다.
  const su = W / w;                                   // z=1 에서 도(度) → viewBox 픽셀
  const gb = L.bbox && L.bbox.length === 4 ? L.bbox : GEO_BBOX;
  const gMin = proj(gb[0], gb[3]);                    // lon 최소 · lat 최대 → x,y 최소
  const gMax = proj(gb[2], gb[1]);
  const bounds = {
    x0: (gMin[0] - x0) * su, x1: (gMax[0] - x0) * su,
    y0: (gMin[1] - y0) * su, y1: (gMax[1] - y0) * su,
  };

  const v = clampView(view || BASE_VIEW, bounds);
  const s = su * v.z;
  const P = (lon, lat) => {
    const [x, y] = proj(lon, lat);
    return [(x - x0) * s + v.px, (y - y0) * s + v.py];
  };

  // --- 1. 바다 ---
  svgEl.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: t.sea }));

  // --- 2~4. 지형 ---
  const addGeo = (fc, attrs) => {
    const d = geoPath(fc, P);
    if (d) svgEl.append(el('path', { d, 'vector-effect': 'non-scaling-stroke', ...attrs }));
  };
  addGeo(L.land, { fill: t.land, stroke: t.coast, 'stroke-width': 0.8, 'stroke-linejoin': 'round' });

  // --- 3. 시대 영역(blob). land 위 · lakes 아래. 점선 테두리 + 옅은 채움.
  // 실선 금지 — 실선은 국경으로 읽힌다. 색은 2~3색 순환(나라마다 다른 색은 시끄럽다).
  // 겹치는 것은 겹친 채로 둔다.
  const regions = (scene.regions || []).filter(f => f && f.geometry && f.properties);
  const blobs = regions.filter(f => f.properties.render === 'blob');
  const marks = regions.filter(f => f.properties.render === 'label_only');
  blobs.forEach((f, i) => {
    const d = geoPath({ features: [f] }, P);
    if (!d) return;
    svgEl.append(el('path', {
      d, class: 'region-blob',
      fill: t.regionFill[i % t.regionFill.length], 'fill-rule': 'evenodd',
      stroke: t.regionLine[i % t.regionLine.length], 'stroke-width': 1,
      'stroke-dasharray': '2 2', 'stroke-linejoin': 'round',
      'vector-effect': 'non-scaling-stroke',
    }));
  });

  addGeo(L.lakes, { fill: t.sea, stroke: t.coast, 'stroke-width': 0.6, 'stroke-linejoin': 'round' });
  addGeo(L.rivers, { fill: 'none', stroke: t.river, 'stroke-width': 1, 'stroke-linecap': 'round' });

  // --- 5. 점 + 라벨을 함께 결정한다 ---
  // 라벨 자리는 아래 → 위 → 오른쪽 → 왼쪽 순으로 찾는다. 네 자리 모두
  // 화면(여백 EDGE) 밖으로 나가거나 이미 놓인 라벨과 겹치면 **점도 라벨도 그리지 않는다.**
  // focus 는 예외 — 자리를 못 찾아도 아래쪽에 그대로 놓는다(app.js 가 시야를 맞춘다).
  const boxes = [];
  const drawn = [];
  let focusBox = null;

  const boxOf = (anchor, tx, ty, bw, bh) => {
    const left = anchor === 'middle' ? tx - bw / 2 : anchor === 'start' ? tx : tx - bw;
    return [left, ty - bh, left + bw, ty];
  };
  // 후보 자리를 순서대로 훑어 화면 안이고 겹치지 않는 첫 자리를 고른다. 없으면 null.
  const fit = (cands, bw, bh) => {
    for (const [anchor, tx, ty] of cands) {
      const b = boxOf(anchor, tx, ty, bw, bh);
      if (!inside(b)) continue;
      if (boxes.some(o => hit(o, b))) continue;
      return { anchor, tx, ty, b };
    }
    return null;
  };
  // 점과 라벨의 네 자리: 아래 → 위 → 오른쪽 → 왼쪽
  const around = (x, y, rad, size) => [
    ['middle', x, y + rad + GAP + size],       // 아래
    ['middle', x, y - rad - GAP],              // 위
    ['start', x + rad + GAP, y + size * 0.36], // 오른쪽
    ['end', x - rad - GAP, y + size * 0.36],   // 왼쪽
  ];

  const put = (id, bold) => {
    const p = all[id];
    const [x, y] = P(p.lon, p.lat);
    if (!isFinite(x) || !isFinite(y)) return;
    const size = bold ? SZ_FOCUS : SZ_DOT;
    const rad = bold ? R_FOCUS : R_DOT;
    const text = p.ko || p.en || id;
    const bw = text.length * size * 0.92, bh = size * 1.25;
    const cands = around(x, y, rad, size);
    let pick = bold
      ? (() => {                                  // focus 는 겹쳐도 그린다
        for (const [anchor, tx, ty] of cands) {
          const b = boxOf(anchor, tx, ty, bw, bh);
          if (inside(b)) return { anchor, tx, ty, b };
        }
        return null;
      })()
      : fit(cands, bw, bh);
    if (!pick) {
      if (!bold) return;                          // 이름 없는 점은 그리지 않는다
      const [anchor, tx, ty] = cands[0];
      pick = { anchor, tx, ty, b: boxOf(anchor, tx, ty, bw, bh) };
    }
    boxes.push(pick.b);
    drawn.push({ x, y, rad, bold, size, text, ...pick });
    if (bold && !focusBox) {
      focusBox = [
        Math.min(pick.b[0], x - rad), Math.min(pick.b[1], y - rad),
        Math.max(pick.b[2], x + rad), Math.max(pick.b[3], y + rad),
      ];
    }
  };
  focus.forEach(id => put(id, true));
  others.forEach(id => put(id, false));

  // --- 6. 시대 영역의 이름. 지명 라벨이 **먼저** 자리를 잡은 뒤에 고르므로
  // 우선순위가 낮다(겹치면 지명이 이긴다). 자리를 못 찾으면 그리지 않는다 —
  // blob 은 이름 없이 색만 남고, label_only 는 아예 사라진다(이름 없는 표시는 없다).
  const regionDrawn = [];
  for (const f of regions) {
    const pr = f.properties;
    const mark = pr.render === 'label_only';
    const at = mark
      ? (f.geometry.type === 'Point' ? f.geometry.coordinates : null)
      : pr.rep;
    if (!at || at.length < 2) continue;
    const [x, y] = P(at[0], at[1]);
    if (!isFinite(x) || !isFinite(y)) continue;
    const text = pr.polity_ko || '';
    if (!text) continue;
    // 상자를 조금 넉넉히 잡는다(+4). 지명 라벨과 딱 붙어 한 줄처럼 읽히는 것을 막는다.
    const bw = text.length * SZ_REGION * 0.92 + 6, bh = SZ_REGION * 1.25 + 2;
    const cands = mark
      ? around(x, y, R_REGION, SZ_REGION)
      : [['middle', x, y + SZ_REGION * 0.36],      // blob 은 대표점 위에 얹는다
        ['middle', x, y + GAP + SZ_REGION],
        ['middle', x, y - GAP],
        ['start', x + GAP, y + SZ_REGION * 0.36],
        ['end', x - GAP, y + SZ_REGION * 0.36]];
    const pick = fit(cands, bw, bh);
    if (!pick) continue;
    boxes.push(pick.b);
    regionDrawn.push({ x, y, rad: mark ? R_REGION : 0, text, ...pick });
  }

  // 빈 동그라미(label_only) → 영역 이름 → 지명 점 → 지명 라벨 순으로 쌓는다.
  for (const d of regionDrawn) {
    if (!d.rad) continue;
    svgEl.append(el('circle', {
      cx: r1(d.x), cy: r1(d.y), r: d.rad, class: 'region-mark',
      fill: 'none', stroke: t.labelDim, 'stroke-width': 1,
      'vector-effect': 'non-scaling-stroke',
    }));
  }
  for (const d of regionDrawn) {
    const n = el('text', {
      x: r1(d.tx), y: r1(d.ty), fill: t.labelDim, 'text-anchor': d.anchor,
      'font-size': SZ_REGION, 'font-weight': 400, class: 'region-label',
      'font-family': 'system-ui, sans-serif',
    });
    n.textContent = d.text;
    svgEl.append(n);
  }

  // 점을 먼저 전부, 그 다음 라벨 — 라벨이 점 위로 온다.
  for (const d of drawn) {
    svgEl.append(el('circle', {
      cx: r1(d.x), cy: r1(d.y), r: d.rad, fill: d.bold ? t.dot : t.dotDim,
    }));
  }
  for (const d of drawn) {
    const n = el('text', {
      x: r1(d.tx), y: r1(d.ty), fill: t.label, 'text-anchor': d.anchor,
      'font-size': d.size, 'font-weight': d.bold ? 700 : 400,
      'font-family': 'system-ui, sans-serif',
    });
    n.textContent = d.text;
    svgEl.append(n);
  }

  const names = shown.map(id => all[id].ko || id).join(', ');
  svgEl.setAttribute('aria-label', names ? `지도: ${names}` : '지도');
  // project 는 확대 버튼이 '지명이 모인 자리'를 기준으로 확대할 수 있게,
  // bounds·focusBox 는 app.js 가 이동 한계와 focus 시야를 맞출 수 있게 돌려준다.
  return {
    view: v, labels: drawn.length, shown: shown.length, project: P, bounds, focusBox,
    // 시대 영역: 데이터가 몇 개고 그중 몇 개가 실제로 그려졌는지(라벨 자리·화면 밖 때문에 준다)
    regions: {
      blobs: blobs.length, marks: marks.length,
      labels: regionDrawn.length, drawnMarks: regionDrawn.filter(d => d.rad).length,
    },
  };
}

// GeoJSON → SVG path d. Polygon / MultiPolygon / LineString / MultiLineString만.
function geoPath(fc, P) {
  if (!fc || !fc.features) return '';
  const out = [];
  const ring = (coords, close) => {
    let d = '';
    for (let i = 0; i < coords.length; i++) {
      const [x, y] = P(coords[i][0], coords[i][1]);
      d += (i ? 'L' : 'M') + r1(x) + ' ' + r1(y);
    }
    if (close) d += 'Z';
    return d;
  };
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') g.coordinates.forEach(r => out.push(ring(r, true)));
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => out.push(ring(r, true))));
    else if (g.type === 'LineString') out.push(ring(g.coordinates, false));
    else if (g.type === 'MultiLineString') g.coordinates.forEach(l => out.push(ring(l, false)));
  }
  return out.join('');
}
