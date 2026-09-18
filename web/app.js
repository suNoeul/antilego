// Antilego 읽기 뷰. 본문이 주인공, 지도는 각주.
// 지도는 패널 하나뿐이다. 기본 닫힘 → 플로팅 버튼이나 지명 클릭으로 연다.
import { renderScene, clampView, zoomAt, BASE_VIEW, W, H } from './map.js?v=__V__';

// 배포 버전. GitHub Pages 워크플로가 __V__ 를 커밋 SHA 앞 7자리로 바꾼다.
// 로컬에서는 바뀌지 않은 채로도 그냥 동작한다 (그냥 쿼리 문자열이다).
const V = '__V__';
window.__V = V;
const bust = path => path + (path.includes('?') ? '&' : '?') + 'v=' + V;

// 데이터 경로. 기본 ./data/ , ?data=data-fixture 로 픽스처.
const q = new URLSearchParams(location.search).get('data');
const DATA_BASE = q ? './' + q.replace(/[^\w.-]/g, '') + '/' : './data/';

// 지도 색은 CSS 변수로 넘긴다 → 다크 전환 시 재렌더 불필요.
const TOKENS = {
  sea: 'var(--sea)', land: 'var(--land)', coast: 'var(--coast)', river: 'var(--river)',
  dot: 'var(--dot)', dotDim: 'var(--dot-dim)', label: 'var(--label)',
};

const $ = id => document.getElementById(id);
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
};

const state = {
  index: null, places: {}, layers: {}, attr: [],
  book: null, ch: null, data: null, sel: null,   // book=null → 첫 apply()에서 무조건 로드
  open: false,                                   // 패널 열림 여부
  view: { ...BASE_VIEW },                        // 지도 확대·이동
};

const getJSON = async path => {
  const r = await fetch(bust(DATA_BASE + path));
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
};
const bookOf = id => (state.index?.books || []).find(b => b.id === id);

// --- 다크 모드 ---
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('btn-theme').setAttribute('aria-pressed', String(t === 'dark'));
  ls.set('theme', t);
}

// --- 해시 라우팅: #Josh.10 / #Josh.10/a231f80 ---
function parseHash() {
  const m = /^#([\w]+)\.(\d+)(?:\/([\w-]+))?$/.exec(location.hash);
  return m ? { book: m[1], ch: +m[2], sel: m[3] || null } : null;
}
function go(book, ch, sel) {
  const h = '#' + book + '.' + ch + (sel ? '/' + sel : '');
  if (location.hash === h) return;
  location.hash = h;
}

// --- 장면 ---
function scene() {
  const pid = state.sel;
  const inCh = (state.data?.places || []).map(x => x.p).filter(p => state.places[p]);
  return {
    focus: pid && state.places[pid] ? [pid] : [],
    others: inCh.filter(p => p !== pid),
    places: state.places,
  };
}

// --- 지도 패널 ---
function drawMap() {
  state.view = clampView(state.view, state.render?.bounds);
  state.render = renderScene($('map'), scene(), state.layers, TOKENS, state.view);
  state.view = state.render.view;
  $('z-out').disabled = state.view.z <= 1.001;
  $('z-in').disabled = state.view.z >= 7.999;
}

// 선택된 지명은 점과 라벨이 통째로 화면 안(여백 FIT)에 들어와야 한다.
// 배율은 건드리지 않고 **최소한으로 이동만** 한다. 라벨 자리가 바뀌면 다시 재어
// 최대 세 번까지 맞춘다.
const FIT = 24;
function fitFocus() {
  for (let i = 0; i < 3; i++) {
    const b = state.render?.focusBox;
    if (!b) return;
    const dx = b[0] < FIT ? FIT - b[0] : (b[2] > W - FIT ? (W - FIT) - b[2] : 0);
    const dy = b[1] < FIT ? FIT - b[1] : (b[3] > H - FIT ? (H - FIT) - b[3] : 0);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const next = clampView(
      { z: state.view.z, px: state.view.px + dx, py: state.view.py + dy },
      state.render.bounds);
    if (Math.abs(next.px - state.view.px) < 0.5 && Math.abs(next.py - state.view.py) < 0.5) return;
    state.view = next;
    drawMap();
  }
}

// `+` `−` 버튼이 기준으로 삼는 점: 선택된 지명, 없으면 이 장 지명들의 무게중심.
// 화면 한가운데를 기준으로 삼으면 확대할수록 지명이 화면 밖으로 밀려난다.
function anchor() {
  const proj = state.render?.project;
  const ids = state.sel && state.places[state.sel]
    ? [state.sel]
    : (state.data?.places || []).map(x => x.p).filter(p => state.places[p]);
  if (!proj || !ids.length) return [W / 2, H / 2];
  const lon = ids.reduce((a, p) => a + state.places[p].lon, 0) / ids.length;
  const lat = ids.reduce((a, p) => a + state.places[p].lat, 0) / ids.length;
  const [x, y] = proj(lon, lat);
  return [Math.max(0, Math.min(W, x)), Math.max(0, Math.min(H, y))];
}

function renderPanel() {
  drawMap();
  fitFocus();          // 선택된 지명이 잘리지 않게 시야를 맞춘다
  const box = $('place-block');
  box.textContent = '';
  const p = state.sel && state.places[state.sel];
  if (p) {
    const chN = (state.data?.places || []).find(x => x.p === state.sel)?.n || 0;
    box.insertAdjacentHTML('beforeend',
      '<p class="card-name"></p><p class="card-en"></p><p class="card-n"></p>');
    box.querySelector('.card-name').textContent = p.ko || state.sel;
    box.querySelector('.card-en').textContent = p.en || '';
    box.querySelector('.card-n').textContent =
      `이 장에서 ${chN}회 · 성경 전체 ${p.n ?? '?'}회`;
  } else {
    const hint = document.createElement('p');
    hint.className = 'card-hint';
    hint.textContent = '지명을 누르면 위치를 보여줍니다';
    box.append(hint);
  }
}

function setPanel(open, remember = true) {
  state.open = !!open;
  document.body.classList.toggle('panel-open', state.open);
  $('btn-map').setAttribute('aria-expanded', String(state.open));
  $('btn-map').textContent = state.open ? '닫기' : '지도';
  $('panel').setAttribute('aria-hidden', String(!state.open));
  if (remember) ls.set('panel', state.open ? '1' : '0');
  if (state.open) renderPanel();
}

const resetView = () => { state.view = { ...BASE_VIEW }; };

// --- 본문 ---
function renderVerse(v) {
  const p = document.createElement('p');
  p.className = 'verse';
  p.dataset.v = v.v;
  const n = document.createElement('sup');
  n.className = 'vnum';
  n.textContent = v.v;
  p.append(n);
  let cur = 0;
  for (const m of v.mentions || []) {
    if (m.s > cur) p.append(document.createTextNode(v.text.slice(cur, m.s)));
    if (!state.places[m.p]) {          // places.json에 없는 p → 그냥 본문
      p.append(document.createTextNode(v.text.slice(m.s, m.e)));
      cur = m.e;
      continue;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'place';
    b.dataset.p = m.p;
    b.setAttribute('aria-pressed', 'false');
    b.textContent = v.text.slice(m.s, m.e);   // 본문 그대로
    p.append(b);
    cur = m.e;
  }
  if (cur < v.text.length) p.append(document.createTextNode(v.text.slice(cur)));
  return p;
}

function applySel() {
  for (const b of document.querySelectorAll('.place')) {
    b.setAttribute('aria-pressed', String(b.dataset.p === state.sel));
  }
  if (state.open) renderPanel();
}

function showMsg(text) {
  $('verses').textContent = '';
  const p = document.createElement('p');
  p.className = 'msg';
  p.textContent = text;
  $('verses').append(p);
}

async function loadChapter() {
  const b = bookOf(state.book);
  $('title').textContent = (b ? b.ko : state.book) + ' ' + state.ch + '장';
  $('verses').textContent = '';
  state.data = null;
  try {
    state.data = await getJSON(`books/${state.book}/${state.ch}.json`);
  } catch {
    showMsg('이 장을 불러오지 못했습니다. 데이터가 아직 없을 수 있습니다.');
    return;
  }
  const frag = document.createDocumentFragment();
  for (const v of state.data.verses) frag.append(renderVerse(v));
  $('verses').append(frag);
}

// --- 상단바 ---
function fillBooks() {
  const s = $('sel-book');
  s.textContent = '';
  for (const b of state.index.books) {
    const o = document.createElement('option');
    o.value = b.id; o.textContent = b.ko;
    s.append(o);
  }
}
function fillChapters() {
  const b = bookOf(state.book);
  const s = $('sel-chapter');
  s.textContent = '';
  for (let i = 1; i <= (b?.chapters || 1); i++) {
    const o = document.createElement('option');
    o.value = i; o.textContent = i + '장';
    s.append(o);
  }
  s.value = state.ch;
}
function step(d) {
  const books = state.index.books;
  const i = books.findIndex(b => b.id === state.book);
  if (i < 0) return;
  let ch = state.ch + d, bi = i;
  if (ch < 1) { bi = i - 1; if (bi < 0) return; ch = books[bi].chapters; }
  if (ch > books[i].chapters) { bi = i + 1; if (bi >= books.length) return; ch = 1; }
  go(books[bi].id, ch, null);
}
function syncNav() {
  const books = state.index.books;
  const i = books.findIndex(b => b.id === state.book);
  $('sel-book').value = state.book;
  $('sel-chapter').value = state.ch;
  $('btn-prev').disabled = i < 0 || (i === 0 && state.ch <= 1);
  $('btn-next').disabled = i < 0 || (i === books.length - 1 && state.ch >= books[i].chapters);
}

// --- 라우트 적용 ---
async function apply() {
  const r = parseHash();
  if (!r) { location.hash = '#Gen.1'; return; }
  const changed = r.book !== state.book || r.ch !== state.ch;
  const selChanged = r.sel !== state.sel;
  state.book = r.book; state.ch = r.ch;
  state.sel = r.sel;

  if (changed) {
    fillChapters();
    syncNav();
    ls.set('last', state.book + '.' + state.ch);
    await loadChapter();
    window.scrollTo(0, 0);          // 장 이동 시 맨 위
  } else {
    syncNav();
  }
  if (changed || selChanged) resetView();   // 새 장면 → 확대 초기화
  applySel();
}

// --- 지도 조작 (휠·드래그·핀치·더블클릭) ---
function bindMapGestures() {
  const svg = $('map');
  const toView = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return [W / 2, H / 2];
    return [(clientX - r.left) / r.width * W, (clientY - r.top) / r.height * H];
  };
  const pxPerUnit = () => {
    const r = svg.getBoundingClientRect();
    return r.width ? r.width / W : 1;
  };

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const [cx, cy] = toView(e.clientX, e.clientY);
    state.view = zoomAt(state.view, cx, cy, Math.exp(-e.deltaY * 0.0022), state.render?.bounds);
    drawMap();
  }, { passive: false });

  svg.addEventListener('dblclick', e => {
    e.preventDefault();
    const [cx, cy] = toView(e.clientX, e.clientY);
    state.view = zoomAt(state.view, cx, cy, 1.8, state.render?.bounds);
    drawMap();
  });

  // 포인터 1개 = 이동, 2개 = 핀치
  const pts = new Map();
  let last = null, pinch = null;
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { last = { x: e.clientX, y: e.clientY }; pinch = null; }
    if (pts.size === 2) { last = null; pinch = pinchState(); }
    svg.classList.add('grabbing');
  });
  const pinchState = () => {
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = toView((a.x + b.x) / 2, (a.y + b.y) / 2);
    return { d: d || 1, mid };
  };
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && pinch) {
      const now = pinchState();
      state.view = zoomAt(state.view, now.mid[0], now.mid[1], now.d / pinch.d, state.render?.bounds);
      pinch = now;
      drawMap();
      return;
    }
    if (pts.size === 1 && last) {
      const k = pxPerUnit();
      state.view = clampView({
        z: state.view.z,
        px: state.view.px + (e.clientX - last.x) / k,
        py: state.view.py + (e.clientY - last.y) / k,
      }, state.render?.bounds);
      last = { x: e.clientX, y: e.clientY };
      drawMap();
    }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const [p] = [...pts.values()]; last = { x: p.x, y: p.y }; }
    if (pts.size === 0) { last = null; svg.classList.remove('grabbing'); }
  };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);

  const zoomBtn = f => () => {
    const [ax, ay] = anchor();
    state.view = zoomAt(state.view, ax, ay, f, state.render?.bounds);
    drawMap();
  };
  $('z-in').addEventListener('click', zoomBtn(1.6));
  $('z-out').addEventListener('click', zoomBtn(1 / 1.6));
  $('z-reset').addEventListener('click', () => { resetView(); drawMap(); fitFocus(); });
}

// 모바일 시트: 손잡이를 아래로 끌면 닫힌다
function bindGrip() {
  const grip = $('grip');
  let y0 = null;
  grip.addEventListener('pointerdown', e => { y0 = e.clientY; grip.setPointerCapture?.(e.pointerId); });
  grip.addEventListener('pointerup', e => {
    if (y0 != null && e.clientY - y0 > 50) setPanel(false);
    y0 = null;
  });
  grip.addEventListener('pointercancel', () => { y0 = null; });
}

// --- 부팅 ---
async function boot() {
  setTheme(ls.get('theme')
    || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  $('btn-theme').addEventListener('click', () =>
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

  try {
    const [index, places, attr] = await Promise.all([
      getJSON('index.json'), getJSON('places.json'), getJSON('attribution.json'),
    ]);
    state.index = index; state.places = places; state.attr = attr;
  } catch (e) {
    showMsg('데이터를 불러오지 못했습니다. ' + DATA_BASE + ' 경로를 확인해 주세요.');
    return;
  }
  // 지형은 한 번만 받아 캐시. 없어도 본문은 읽힌다.
  for (const k of ['land', 'lakes', 'rivers']) {
    try { state.layers[k] = await getJSON(`geo/${k}.json`); } catch { state.layers[k] = null; }
  }
  // 지형이 덮는 범위 = 이동 한계. 못 받으면 map.js 의 기본값(GEO_BBOX)을 쓴다.
  try {
    const meta = await getJSON('geo/meta.json');
    if (Array.isArray(meta?.bbox) && meta.bbox.length === 4) state.layers.bbox = meta.bbox;
  } catch { /* 기본값 */ }
  const attrLine = (state.attr || []).join(' · ');
  $('attr-line').textContent = attrLine;
  $('panel-attr').textContent = attrLine;

  fillBooks();
  $('sel-book').addEventListener('change', e => go(e.target.value, 1, null));
  $('sel-chapter').addEventListener('change', e => go(state.book, +e.target.value, null));
  $('btn-prev').addEventListener('click', () => step(-1));
  $('btn-next').addEventListener('click', () => step(1));

  $('btn-map').addEventListener('click', () => setPanel(!state.open));
  $('scrim').addEventListener('click', () => setPanel(false));
  bindMapGestures();
  bindGrip();

  document.addEventListener('click', e => {
    const b = e.target.closest?.('.place');
    if (!b) return;
    const on = b.dataset.p === state.sel;       // 같은 지명 → 선택 해제
    go(state.book, state.ch, on ? null : b.dataset.p);
    if (!state.open) setPanel(true);            // 지명을 누르면 패널이 열린다
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open) setPanel(false);
  });
  window.addEventListener('hashchange', apply);
  window.addEventListener('resize', () => { if (state.open) drawMap(); });

  if (!location.hash) {
    const last = ls.get('last');
    const m = last && /^(\w+)\.(\d+)$/.exec(last);
    const b = m && bookOf(m[1]);
    location.hash = b ? `#${m[1]}.${m[2]}` : '#Gen.1';
  }
  // 패널 열림 상태는 기억한다. 저장된 값이 없으면 닫힘.
  setPanel(ls.get('panel') === '1', false);
  // 검증(헤드리스 CDP)과 다음 스파이크를 위한 디버그 핸들. 앱 동작에는 관여하지 않는다.
  window.__antilego = { state, drawMap, setPanel, anchor, fitFocus, renderPanel, V };
  await apply();
}

boot();
