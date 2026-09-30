// Spike 10: 지형 렌더 어댑터. 본문·해시·시대 판정은 app.js가 소유한다.
// 외부 지도 스타일/도로/위성/OSM 없이 기존 Natural Earth + 공개 DEM만 사용한다.
export const TERRAIN_BOUNDS = [8, 24, 50, 43];
export const MAX_PITCH = 55;
export const DEM_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const VENDOR = './vendor/maplibre-gl-5.20.0/';
const empty = () => ({ type: 'FeatureCollection', features: [] });
const fc = features => ({ type: 'FeatureCollection', features });
const valid = p => p && Number.isFinite(p.lon) && Number.isFinite(p.lat)
  && p.lon >= 8 && p.lon <= 50 && p.lat >= 24 && p.lat <= 43;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 최초 열기·새 장·명시적 초기화의 범위. 선택 지명과 같은 장의 가까운 지명을 함께 담는다.
export function sceneBounds(scene) {
  const focus = (scene.focus || []).map(id => scene.places[id]).filter(valid);
  const others = (scene.others || []).map(id => scene.places[id]).filter(valid);
  const points = focus.length ? [...focus, ...others.filter(p => focus.some(f =>
    Math.abs(p.lon - f.lon) <= .15 && Math.abs(p.lat - f.lat) <= .12))] : others;
  if (!points.length) return [[34.7, 31.3], [35.7, 32.3]];
  const lons = points.map(p => p.lon), lats = points.map(p => p.lat);
  const x = (Math.min(...lons) + Math.max(...lons)) / 2;
  const y = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dx = Math.max(.045, (Math.max(...lons) - Math.min(...lons)) * .65);
  const dy = Math.max(.035, (Math.max(...lats) - Math.min(...lats)) * .65);
  return [[Math.max(8, x - dx), Math.max(24, y - dy)],
    [Math.min(50, x + dx), Math.min(43, y + dy)]];
}

// 화면의 이름만 옮긴다. 점은 실제 좌표에 유지하는 DOM 없는 라벨 배치 계산.
export function placeLabels(items, width, height) {
  const boxes = [], result = new Map();
  const intersects = (a, b, gap = 4) => a[0] < b[2] + gap && a[2] > b[0] - gap
    && a[1] < b[3] + gap && a[3] > b[1] - gap;
  const inside = b => b[0] >= 8 && b[1] >= 8 && b[2] <= width - 8 && b[3] <= height - 46;
  const points = items.filter(m => !m.region).map(m => [m.x - 5, m.y - 5, m.x + 5, m.y + 5]);
  for (const m of [...items].sort((a, b) => Number(a.region) - Number(b.region)
    || Number(b.focus) - Number(a.focus))) {
    let picked = null;
    for (const gap of [10, 24, 42, 64]) {
      const offsets = [[-m.w / 2, -gap - m.h], [gap, -m.h / 2], [-m.w / 2, gap],
        [-gap - m.w, -m.h / 2], [gap, -gap - m.h], [-gap - m.w, -gap - m.h],
        [gap, gap], [-gap - m.w, gap]];
      for (const [dx, dy] of offsets) {
        const b = [m.x + dx, m.y + dy, m.x + dx + m.w, m.y + dy + m.h];
        if (inside(b) && !boxes.some(r => intersects(b, r)) && !points.some(r => intersects(b, r, 2))) {
          picked = b; break;
        }
      }
      if (picked) break;
    }
    // 공간이 부족해도 선택 이름은 남긴다. 나머지는 점·접근성 이름을 유지한다.
    if (!picked && m.focus && width >= m.w + 16 && height >= m.h + 54) {
      const x = Math.max(8, Math.min(width - m.w - 8, m.x - m.w / 2));
      const y = Math.max(8, Math.min(height - m.h - 46, m.y - m.h - 10));
      picked = [x, y, x + m.w, y + m.h];
    }
    if (picked) boxes.push(picked);
    result.set(m.id, picked);
  }
  return result;
}

export function terrainStyle(layers, colors, regions = []) {
  const dem = { type: 'raster-dem', tiles: [DEM_URL], encoding: 'terrarium',
    tileSize: 512, maxzoom: 12, bounds: TERRAIN_BOUNDS };
  const geo = data => ({ type: 'geojson', data: data || empty(), tolerance: .2 });
  return {
    version: 8,
    transition: { duration: 0, delay: 0 },
    sources: {
      elevation: { ...dem }, relief: { ...dem },
      land: geo(layers.land), lakes: geo(layers.lakes), rivers: geo(layers.rivers),
      regions: geo(regionData(regions)),
    },
    terrain: { source: 'elevation', exaggeration: 1 },
    layers: [
      { id: 'sea', type: 'background', paint: { 'background-color': colors.sea } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': colors.land } },
      { id: 'relief', type: 'hillshade', source: 'relief', paint: {
        'hillshade-shadow-color': colors.shadow, 'hillshade-highlight-color': colors.highlight,
        'hillshade-accent-color': colors.accent, 'hillshade-exaggeration': .4,
        'hillshade-illumination-direction': 315, 'hillshade-illumination-anchor': 'map',
      } },
      { id: 'regions', type: 'fill', source: 'regions', paint: {
        'fill-color': ['match', ['get', 'tone'], 1, colors.regionFill[1], 2, colors.regionFill[2], colors.regionFill[0]],
      } },
      { id: 'region-lines', type: 'line', source: 'regions', paint: {
        'line-color': ['match', ['get', 'tone'], 1, colors.regionLine[1], 2, colors.regionLine[2], colors.regionLine[0]],
        'line-width': 1, 'line-dasharray': [2, 2],
      } },
      { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': colors.coast, 'line-width': .65 } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': colors.sea } },
      { id: 'lake-edge', type: 'line', source: 'lakes', paint: { 'line-color': colors.coast, 'line-width': .5 } },
      { id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': colors.river,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, .5, 11, 1.4] } },
    ],
  };
}

function regionData(regions) {
  return fc(regions.filter(f => f?.properties?.render === 'blob'
    && ['Polygon', 'MultiPolygon'].includes(f.geometry?.type))
    .map((f, i) => ({ ...f, properties: { ...f.properties, tone: i % 3 } })));
}

function palette() {
  const css = getComputedStyle(document.documentElement);
  const get = k => css.getPropertyValue('--' + k).trim();
  return { sea: get('sea'), land: get('land'), coast: get('coast'), river: get('river'),
    shadow: get('terrain-shadow'), highlight: get('terrain-highlight'), accent: get('terrain-accent'),
    regionFill: ['a', 'b', 'c'].map(k => get('region-' + k)),
    regionLine: ['a', 'b', 'c'].map(k => get('region-' + k + '-line')) };
}

let library;
function loadLibrary() {
  if (library) return library;
  library = Promise.all(['css', 'js'].map(ext => new Promise((resolve, reject) => {
    const el = document.createElement(ext === 'css' ? 'link' : 'script');
    const url = VENDOR + 'maplibre-gl.' + ext;
    if (ext === 'css') { el.rel = 'stylesheet'; el.href = url; }
    else { el.src = url; el.async = true; }
    const timer = setTimeout(() => { el.remove(); reject(new Error('지도 엔진 시간 초과')); }, 12000);
    el.onload = () => { clearTimeout(timer); resolve(); };
    el.onerror = () => { clearTimeout(timer); el.remove(); reject(new Error('지도 엔진 로드 실패')); };
    document.head.append(el);
  }))).then(() => {
    if (!window.maplibregl) throw new Error('지도 엔진 없음');
    return window.maplibregl;
  }).catch(e => { library = null; throw e; });
  return library;
}

export async function createTerrain(options) {
  const lib = await loadLibrary();
  if (!options.isOpen()) return null; // 내려받는 동안 닫혔으면 GPU/타일 요청을 시작하지 않는다.
  lib.setWorkerCount(2);
  lib.setMaxParallelImageRequests(6);
  return new TerrainMap(lib, options);
}

class TerrainMap {
  constructor(lib, options) {
    this.lib = lib;
    this.options = options;
    this.ready = false;
    this.disposed = false;
    this.markers = [];
    this.scene = options.scene;
    this.key = options.key;
    this.map = new lib.Map({
      container: options.container, style: terrainStyle(options.layers, palette(), this.scene.regions),
      center: [35.2, 31.8], zoom: 7, minZoom: 4, maxZoom: 12.5, maxPitch: MAX_PITCH,
      maxBounds: [[8, 24], [50, 43]], renderWorldCopies: false,
      attributionControl: false, canvasContextAttributes: { antialias: false },
      pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), maxTileCacheSize: 40,
      pitchWithRotate: true, touchPitch: true, fadeDuration: 0,
    });
    this.map.getCanvas().setAttribute('aria-label', '지형 지도. 방향키로 이동, 더하기·빼기로 확대·축소. 지형 보기 버튼으로 기울이기');
    // 키보드와 별도 버튼을 모두 제공한다. 제스처를 모르는 사용자도 같은 화면을 볼 수 있다.
    this.map.on('load', () => {
      if (this.disposed) return;
      this.loaded = true;
      this.update(this.scene, this.key, true);
      this.checkReady();
    });
    this.map.on('sourcedata', e => {
      if (e.sourceId === 'elevation' && e.tile?.state === 'loaded') this.demSeen = true;
      this.checkReady();
    });
    this.map.on('error', () => this.fail());
    this.map.on('webglcontextlost', () => this.fail());
    this.map.on('move', () => { this.layoutLabels(); options.onChange(this); });
    this.map.on('render', () => this.layoutLabels());
    this.map.on('idle', () => this.layoutLabels());
    // 초기 지형이 끝없이 대기해도 읽기를 막지 않는다.
    this.timer = setTimeout(() => this.fail(), 15000);
    this.fit(false);
  }

  checkReady() {
    if (this.disposed || this.ready || !this.loaded || !this.demSeen) return;
    clearTimeout(this.timer);
    this.ready = true;
    this.options.onReady(this);
    this.layoutLabels();
  }

  fail() {
    if (this.disposed || this.failing) return;
    this.failing = true;
    // MapLibre 이벤트 처리 중에 GPU 자원을 제거하지 않는다.
    queueMicrotask(() => {
      if (this.disposed) return;
      this.destroy();
      this.options.onFail();
    });
  }

  update(scene, key, force = false) {
    if (this.disposed) return;
    const changed = this.key !== key;
    const chapterChanged = this.key.split('/')[0] !== key.split('/')[0];
    const overlays = force || this.scene.regions !== scene.regions;
    const ids = s => [...new Set([...(s.focus || []), ...(s.others || [])])].sort().join('|');
    const labels = force || overlays || ids(this.scene) !== ids(scene) || this.scene.places !== scene.places;
    this.scene = scene;
    this.key = key;
    if (!this.loaded) return;
    if (overlays) this.map.getSource('regions').setData(regionData(scene.regions || []));
    if (labels) this.makeLabels();
    else this.selectLabels();
    if (force || chapterChanged) this.fit(false);
    else if (changed && this.options.isOpen()) this.revealSelection();
  }

  selectLabels() {
    for (const m of this.markers) {
      m.focus = !!m.id && (this.scene.focus || []).includes(m.id);
      m.el.classList.toggle('is-focus', m.focus);
      if (m.id) m.el.setAttribute('aria-pressed', String(m.focus));
    }
    this.layoutLabels();
  }

  revealSelection() {
    const id = this.scene.focus?.[0];
    const p = this.scene.places[id];
    // 연속 선택은 앞의 이동을 멈추고 최신 선택만 따른다.
    this.map.stop();
    if (!valid(p)) return; // 같은 장에서 선택만 해제하면 시점을 초기화하지 않는다.
    const pt = this.map.project([p.lon, p.lat]);
    const { clientWidth: w, clientHeight: h } = this.options.container;
    if (pt.x >= 32 && pt.x <= w - 32 && pt.y >= 32 && pt.y <= h - 56) return;
    this.map.easeTo({ center: [p.lon, p.lat], zoom: this.map.getZoom(),
      pitch: this.map.getPitch(), bearing: this.map.getBearing(),
      duration: reducedMotion() ? 0 : 400 });
  }

  makeLabels() {
    this.markers.forEach(m => m.marker.remove());
    this.markers = [];
    const add = (at, text, focus, id, region = false) => {
      const el = document.createElement(id ? 'button' : 'div');
      el.className = 'terrain-label' + (focus ? ' is-focus' : '') + (region ? ' is-region' : '');
      const name = document.createElement('span');
      name.textContent = text;
      el.append(name);
      if (id) {
        el.dataset.place = id;
        el.title = text;
        el.type = 'button';
        el.setAttribute('aria-label', text + ' 위치 선택');
        el.setAttribute('aria-pressed', String(focus));
        el.addEventListener('click', e => { e.stopPropagation(); this.options.onSelect(id); });
      }
      const marker = new this.lib.Marker({ element: el, anchor: 'center' })
        .setLngLat(at).addTo(this.map);
      this.markers.push({ marker, el, name, focus, at, id, region, layoutId: this.markers.length });
    };
    const { focus = [], others = [], places = {}, regions = [] } = this.scene;
    [...new Set([...focus, ...others])].forEach(id => {
      const p = places[id];
      if (valid(p)) add([p.lon, p.lat], p.ko || p.en || id, focus.includes(id), id);
    });
    for (const f of regions) {
      const p = f.properties;
      const at = p?.render === 'label_only' && f.geometry?.type === 'Point' ? f.geometry.coordinates : p?.rep;
      if (at && p?.polity_ko) add(at, p.polity_ko + ' · 대략', false, null, true);
    }
    this.layoutLabels();
  }

  layoutLabels() {
    if (this.disposed || !this.options.isOpen()) return;
    const bounds = this.options.container.getBoundingClientRect();
    // Marker가 지형 높이를 반영해 배치한 점을 기준으로 이름만 배치한다.
    const visible = [];
    for (const m of this.markers) {
      const r = m.el.getBoundingClientRect();
      const x = r.left + r.width / 2 - bounds.left, y = r.top + r.height / 2 - bounds.top;
      const inside = x >= 4 && x <= bounds.width - 4 && y >= 4 && y <= bounds.height - 40;
      m.el.style.visibility = inside ? '' : 'hidden';
      if (inside) visible.push({ ...m, id: m.layoutId, x, y, w: m.name.offsetWidth, h: m.name.offsetHeight });
      else { m.name.style.visibility = 'hidden'; m.el.style.setProperty('--leader-length', '0px'); }
    }
    const positions = placeLabels(visible, bounds.width, bounds.height);
    for (const m of visible) {
      const b = positions.get(m.id);
      m.name.style.visibility = b ? '' : 'hidden';
      if (m.region) m.el.style.visibility = b ? '' : 'hidden';
      if (!b) { m.el.style.setProperty('--leader-length', '0px'); continue; }
      m.name.style.transform = `translate(${b[0] - m.x}px, ${b[1] - m.y}px)`;
      const dx = Math.max(b[0], Math.min(b[2], m.x)) - m.x;
      const dy = Math.max(b[1], Math.min(b[3], m.y)) - m.y;
      m.el.style.setProperty('--leader-length', m.region ? '0px' : Math.hypot(dx, dy) + 'px');
      m.el.style.setProperty('--leader-angle', Math.atan2(dy, dx) + 'rad');
    }
  }

  fit(animate = true) {
    this.map.fitBounds(sceneBounds(this.scene), {
      padding: { top: 42, bottom: 60, left: 35, right: 35 }, maxZoom: 12,
      pitch: 0, bearing: 0, duration: animate && !reducedMotion() ? 300 : 0,
    });
  }

  tilt() {
    const tilted = this.map.getPitch() > 5;
    this.map.easeTo({ pitch: tilted ? 0 : 50, bearing: 0,
      duration: reducedMotion() ? 0 : 350 });
  }

  zoom(delta) {
    const id = this.scene.focus?.[0], p = this.scene.places[id];
    this.map.easeTo({ zoom: Math.max(4, Math.min(12.5, this.map.getZoom() + delta)),
      ...(valid(p) ? { around: [p.lon, p.lat] } : {}), duration: reducedMotion() ? 0 : 200 });
  }

  theme() {
    if (!this.loaded || this.disposed) return;
    // 3D에 드레이프한 색상 텍스처가 이전 팔레트를 캐시하지 않게 무효화한다.
    // 카메라·GeoJSON·이미 받아 둔 DEM 소스는 그대로 유지한다.
    this.map.setTerrain(null);
    for (const layer of terrainStyle(this.options.layers, palette()).layers) {
      for (const [key, value] of Object.entries(layer.paint || {})) this.map.setPaintProperty(layer.id, key, value);
    }
    this.map.setTerrain({ source: 'elevation', exaggeration: 1 });
  }

  resize() { if (!this.disposed) { this.map.resize(); this.layoutLabels(); } }
  stop() { if (!this.disposed) this.map.stop(); }
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    this.markers.forEach(m => m.marker.remove());
    this.map.remove();
  }
}
