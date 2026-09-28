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

// DOM 없는 계산: 선택 지명은 근경, 장 전체는 모든 지명을 담는 범위.
export function sceneBounds(scene) {
  const focus = (scene.focus || []).map(id => scene.places[id]).filter(valid);
  const points = focus.length ? focus : (scene.others || []).map(id => scene.places[id]).filter(valid);
  if (!points.length) return [[34.7, 31.3], [35.7, 32.3]];
  const lons = points.map(p => p.lon), lats = points.map(p => p.lat);
  const x = (Math.min(...lons) + Math.max(...lons)) / 2;
  const y = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dx = Math.max(focus.length ? .13 : .3, (Math.max(...lons) - Math.min(...lons)) * .65);
  const dy = Math.max(focus.length ? .1 : .22, (Math.max(...lats) - Math.min(...lats)) * .65);
  return [[Math.max(8, x - dx), Math.max(24, y - dy)],
    [Math.min(50, x + dx), Math.min(43, y + dy)]];
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
    const overlays = force || changed || this.scene.regions !== scene.regions;
    this.scene = scene;
    this.key = key;
    if (!this.loaded) return;
    if (overlays) {
      this.map.getSource('regions').setData(regionData(scene.regions || []));
      this.makeLabels();
    }
    if (changed || force) this.fit(false);
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
        el.type = 'button';
        el.setAttribute('aria-label', text + ' 위치 선택');
        el.setAttribute('aria-pressed', String(focus));
        el.addEventListener('click', e => { e.stopPropagation(); this.options.onSelect(id); });
      }
      const marker = new this.lib.Marker({ element: el, anchor: 'bottom', offset: [0, -3] })
        .setLngLat(at).addTo(this.map);
      this.markers.push({ marker, el, focus, at });
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
    const placed = [];
    // 점·글자를 한 묶음으로 숨긴다. 선택 지명 > 이 장의 지명 > 시대 이름.
    for (const m of this.markers) {
      const r = m.el.getBoundingClientRect();
      const inside = r.left >= bounds.left + 8 && r.right <= bounds.right - 8
        && r.top >= bounds.top + 8 && r.bottom <= bounds.bottom - 46;
      const collision = placed.some(b => r.left < b.right + 4 && r.right > b.left - 4
        && r.top < b.bottom + 4 && r.bottom > b.top - 4);
      const show = inside && (m.focus || !collision);
      m.el.style.visibility = show ? '' : 'hidden';
      if (show) placed.push(r);
    }
  }

  fit(animate = true) {
    this.map.fitBounds(sceneBounds(this.scene), {
      padding: { top: 42, bottom: 60, left: 35, right: 35 }, maxZoom: 10,
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
