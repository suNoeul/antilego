// 양식화 미니맵 렌더러. 순수 함수 — fetch·전역 상태 없음.
// renderScene(svgEl, scene, layers, tokens, view)
//   scene  = { focus: [placeId], others: [placeId], places: { id: {ko, lat, lon} } }
//   layers = { land, lakes, rivers }  GeoJSON FeatureCollection (없으면 생략)
//   tokens = { sea, land, coast, river, dot, dotDim, label }  색 문자열
//            app.js는 'var(--sea)' 꼴을 넘긴다 → 다크 전환 시 재렌더 불필요.
//   view   = { z, px, py }  확대·이동. z=1, px=py=0 이 scene bbox 그대로(기본값).
//            좌표는 viewBox 픽셀 단위. 매 렌더마다 점·라벨을 다시 계산하므로
//            점 크기와 글자 크기는 화면에서 항상 같고, 확대하면 겹침이 풀려
//            숨어 있던 라벨이 되살아난다(LOD).

export const W = 320, H = 240;   // viewBox. 카드 4:3
export const ZOOM_MIN = 1, ZOOM_MAX = 8;

const MIN_DEG = 1.8;             // 최소 폭 200km ≈ 위도 1.8°
const PAD = 0.25;                // 양쪽 25% 패딩
const SVG = 'http://www.w3.org/2000/svg';
const CLAMP = 20000;             // 화면 밖 좌표 잘라내기 (SVG가 clip)
const MARGIN = 8;                // 이 만큼 밖으로 나간 점·라벨은 그리지 않는다

const DEFAULT_TOKENS = {
  sea: 'var(--sea)', land: 'var(--land)', coast: 'var(--coast)', river: 'var(--river)',
  dot: 'var(--dot)', dotDim: 'var(--dot-dim)', label: 'var(--label)',
};

export const BASE_VIEW = { z: 1, px: 0, py: 0 };

// 확대 배율과 이동량을 허용 범위로 자른다. z=1 이면 이동량은 0 으로 고정된다.
export function clampView(v) {
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (v && v.z) || 1));
  const px = Math.max(W - W * z, Math.min(0, (v && v.px) || 0));
  const py = Math.max(H - H * z, Math.min(0, (v && v.py) || 0));
  return { z, px, py };
}

// (cx, cy) 를 제자리에 둔 채 factor 배 확대한다. viewBox 픽셀 좌표.
export function zoomAt(v, cx, cy, factor) {
  const cur = clampView(v);
  const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cur.z * factor));
  const k = z / cur.z;
  return clampView({ z, px: cx - (cx - cur.px) * k, py: cy - (cy - cur.py) * k });
}

const el = (name, attrs) => {
  const n = document.createElementNS(SVG, name);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
};
const r1 = v => Math.round(Math.max(-CLAMP, Math.min(CLAMP, v)) * 10) / 10;

export function renderScene(svgEl, scene, layers, tokens, view) {
  const t = { ...DEFAULT_TOKENS, ...(tokens || {}) };
  const L = layers || {};
  const all = scene.places || {};
  const focus = (scene.focus || []).filter(id => all[id]);
  const others = (scene.others || []).filter(id => all[id] && !focus.includes(id));
  const shown = [...focus, ...others];
  const v = clampView(view || BASE_VIEW);

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

  // scene bbox 스케일 × 확대 배율. 이동량은 viewBox 픽셀이라 그대로 더한다.
  const s = (W / w) * v.z;
  const P = (lon, lat) => {
    const [x, y] = proj(lon, lat);
    return [(x - x0) * s + v.px, (y - y0) * s + v.py];
  };
  const visible = (x, y) => x >= -MARGIN && x <= W + MARGIN && y >= -MARGIN && y <= H + MARGIN;

  // --- 1. 바다 ---
  svgEl.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: t.sea }));

  // --- 2~4. 지형 ---
  const addGeo = (fc, attrs) => {
    const d = geoPath(fc, P);
    if (d) svgEl.append(el('path', { d, 'vector-effect': 'non-scaling-stroke', ...attrs }));
  };
  addGeo(L.land, { fill: t.land, stroke: t.coast, 'stroke-width': 0.8, 'stroke-linejoin': 'round' });
  addGeo(L.lakes, { fill: t.sea, stroke: t.coast, 'stroke-width': 0.6, 'stroke-linejoin': 'round' });
  addGeo(L.rivers, { fill: 'none', stroke: t.river, 'stroke-width': 1, 'stroke-linecap': 'round' });

  // --- 5. 점. 반지름은 viewBox 단위 고정 → 확대해도 화면 크기 그대로 ---
  for (const id of others) {
    const [x, y] = P(all[id].lon, all[id].lat);
    if (!visible(x, y)) continue;
    svgEl.append(el('circle', { cx: r1(x), cy: r1(y), r: 3, fill: t.dotDim }));
  }
  for (const id of focus) {
    const [x, y] = P(all[id].lon, all[id].lat);
    if (!visible(x, y)) continue;
    svgEl.append(el('circle', { cx: r1(x), cy: r1(y), r: 5, fill: t.dot }));
  }

  // --- 6. 라벨. focus를 먼저 놓고, 이미 놓인 라벨과 겹치는 non-focus는 숨긴다.
  //     글자 크기도 viewBox 단위 고정이라 확대하면 점 사이가 벌어져 겹침이 풀린다. ---
  const boxes = [];
  let placed = 0;
  const label = (id, size, bold) => {
    const p = all[id];
    const [x, y] = P(p.lon, p.lat);
    if (!visible(x, y)) return;
    const text = p.ko || p.en || id;
    const bw = text.length * size * 0.92, bh = size * 1.25;
    const cx = bw + 4 < W ? Math.max(bw / 2 + 2, Math.min(W - bw / 2 - 2, x)) : x;
    const cy = y + size + 5;
    const box = [cx - bw / 2, cy - bh, cx + bw / 2, cy];
    if (!bold && boxes.some(b => hit(b, box))) return;   // 충돌 → 숨김
    boxes.push(box);
    placed++;
    const n = el('text', {
      x: r1(cx), y: r1(cy), fill: t.label, 'text-anchor': 'middle',
      'font-size': size, 'font-weight': bold ? 700 : 400,
      'font-family': 'system-ui, sans-serif',
    });
    n.textContent = text;
    svgEl.append(n);
  };
  focus.forEach(id => label(id, 14, true));
  others.forEach(id => label(id, 12, false));

  const names = shown.map(id => all[id].ko || id).join(', ');
  svgEl.setAttribute('aria-label', names ? `지도: ${names}` : '지도');
  // project 는 확대 버튼이 '지명이 모인 자리'를 기준으로 확대할 수 있게 돌려준다.
  return { view: v, labels: placed, shown: shown.length, project: P };
}

const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

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
