// Antilego 읽기 뷰. 본문이 주인공, 지도는 각주.
// 지도는 패널 하나뿐이다. 기본 닫힘 → 플로팅 버튼이나 지명 클릭으로 연다.
import { renderScene, clampView, zoomAt, sceneFrame, BASE_VIEW, DEF_W, DEF_H }
  from './map.js?v=__V__';

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
  labelDim: 'var(--label-dim)',
  regionFill: ['var(--region-a)', 'var(--region-b)', 'var(--region-c)'],
  regionLine: ['var(--region-a-line)', 'var(--region-b-line)', 'var(--region-c-line)'],
};

const $ = id => document.getElementById(id);
// 지금 그려진 지도의 픽셀 크기. 02-c 이후 320×240 상수가 아니라 패널에서 잰 값이다.
const vw = () => state.render?.W || DEF_W;
const vh = () => state.render?.H || DEF_H;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } },
};

const state = {
  index: null, places: {}, layers: {}, attr: [],
  book: null, ch: null, data: null, sel: null,   // book=null → 첫 apply()에서 무조건 로드
  open: false,                                   // 패널 열림 여부
  panelW: 400,                                   // 패널 폭(02-c). ≥1200px 에서만 바뀐다
  view: { ...BASE_VIEW },                        // 지도 확대·이동
  // 시대 (Spike 03-d). 못 받으면 전부 null 인 채로 조용히 동작한다 — 캡션도 레이어도 없다.
  eras: null, chapterEras: null, regionsByEra: null,
  eraLayer: false,                               // 시대 영역 레이어. 기본 꺼짐
};

// --- 시대 (Spike 03-d) ---
// 이 장의 시대. chapter_eras.json 의 ranges 가 default 를 이긴다.
function eraOf(book, ch) {
  const rec = state.chapterEras?.[book];
  if (!rec) return null;
  for (const [a, b, id] of rec.ranges || []) {
    if (ch >= a && ch <= b) return state.eras?.[id] || null;
  }
  return state.eras?.[rec.default] || null;
}
// 이 시대의 영역. 시대를 특정하지 않는 장(원시사·시대 불특정)은 빈 배열이 정상이다.
const regionsOf = era => (era && state.regionsByEra?.[era.id]) || [];

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
    regions: state.eraLayer ? regionsOf(eraOf(state.book, state.ch)) : [],
  };
}

// --- 패널 폭 (02-c) ---
// 밀어내기 모드(≥1200px)에서만 패널 왼쪽 가장자리를 끌어 넓힌다. 덮기(900–1199)와
// 모바일 시트는 손대지 않는다 — CSS 가 ≥1200 에서만 `--panel-w-user` 를 쓴다.
// 본문 컬럼은 어떤 경우에도 640px 아래로 내려가지 않는다.
const PANEL_MIN = 400;                 // 기본이자 최소
const TEXT_MIN = 640;                  // 본문 컬럼 최소 폭
const GUTTER = 24, BREATH = 48;        // 양쪽 여백 + 숨 쉴 자리
const pushMode = () => window.innerWidth >= 1200;
const panelMax = () =>
  Math.max(PANEL_MIN, Math.round(window.innerWidth - TEXT_MIN - 2 * GUTTER - BREATH));
const clampPanelW = w =>
  Math.round(Math.max(PANEL_MIN, Math.min(panelMax(), Number(w) || PANEL_MIN)));
const storedW = () => { const n = Number(ls.get('panelW')); return n > 0 ? n : PANEL_MIN; };

function setPanelW(w) {
  state.panelW = clampPanelW(w);
  document.documentElement.style.setProperty('--panel-w-user', state.panelW + 'px');
  const r = $('resizer');
  r.setAttribute('aria-valuenow', String(state.panelW));
  r.setAttribute('aria-valuemin', String(PANEL_MIN));
  r.setAttribute('aria-valuemax', String(panelMax()));
}
const saveW = () => ls.set('panelW', String(state.panelW));

// --- 지도 패널 ---
// 지도 픽셀 크기: 폭 = 패널 안쪽 폭, 높이 = min(폭 × 0.75, 창 높이 × 0.7).
// SVG 를 이 크기 그대로 그린다 → viewBox 와 CSS 상자가 1:1, 글자가 늘어나지 않는다.
function mapSize() {
  const svg = $('map');
  svg.style.width = '';                       // 먼저 풀어야 패널 폭을 다시 잰다
  svg.style.height = '';
  const w = Math.max(160, Math.round(svg.clientWidth) || DEF_W);
  const h = Math.max(120, Math.round(Math.min(w * 0.75, window.innerHeight * 0.7)));
  svg.style.width = w + 'px';
  svg.style.height = h + 'px';
  return [w, h];
}

function drawMap() {
  mapSize();
  state.view = clampView(state.view, state.render?.bounds);
  state.render = renderScene($('map'), scene(), state.layers, TOKENS, state.view);
  state.view = state.render.view;
  $('z-out').disabled = state.view.z <= 1.001;
  $('z-in').disabled = state.view.z >= 7.999;
}

// 크기가 바뀌어도 보던 자리와 배율은 그대로. 새 크기에서 화면 한가운데가 같은 지점을
// 가리키도록 px·py 만 옮긴다(배율 z 는 건드리지 않는다). 그래서 장면이 튀지 않는다.
function keepCenter(nextW, nextH) {
  const r = state.render;
  if (!r || !r.su) return;
  const s = r.su * state.view.z;
  const sx = (r.W / 2 - state.view.px) / s + r.x0;      // 화면 한가운데의 장면 좌표
  const sy = (r.H / 2 - state.view.py) / s + r.y0;
  const f = sceneFrame(scene(), nextW, nextH);
  const s2 = f.su * state.view.z;
  state.view = {
    z: state.view.z,
    px: nextW / 2 - (sx - f.x0) * s2,
    py: nextH / 2 - (sy - f.y0) * s2,
  };
}

// 리사이즈는 애니메이션 프레임으로 묶는다 — 드래그 한 번에 렌더 한 번.
let relayoutRaf = 0;
function relayout() {
  if (!state.open) return;
  const [w, h] = mapSize();
  if (state.render && (state.render.W !== w || state.render.H !== h)) keepCenter(w, h);
  drawMap();
}
function scheduleRelayout() {
  if (relayoutRaf) return;
  relayoutRaf = requestAnimationFrame(() => { relayoutRaf = 0; relayout(); });
}

// 선택된 지명은 점과 라벨이 통째로 화면 안(여백 FIT)에 들어와야 한다.
// 배율은 건드리지 않고 **최소한으로 이동만** 한다. 라벨 자리가 바뀌면 다시 재어
// 최대 세 번까지 맞춘다.
const FIT = 24;
function fitFocus() {
  for (let i = 0; i < 3; i++) {
    const b = state.render?.focusBox;
    if (!b) return;
    const W = vw(), H = vh();
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
  if (!proj || !ids.length) return [vw() / 2, vh() / 2];
  const lon = ids.reduce((a, p) => a + state.places[p].lon, 0) / ids.length;
  const lat = ids.reduce((a, p) => a + state.places[p].lat, 0) / ids.length;
  const [x, y] = proj(lon, lat);
  return [Math.max(0, Math.min(vw(), x)), Math.max(0, Math.min(vh(), y))];
}

function renderPanel() {
  drawMap();
  fitFocus();          // 선택된 지명이 잘리지 않게 시야를 맞춘다
  renderEra();
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

// --- 시대 캡션 · 영역 레이어 UI (Spike 03-d) ---
// 캡션은 인라인 한 줄이다: 시대명 · 연대 — 캡션 (대략적인 구분)
// undated/primeval 이거나 데이터를 못 받았으면 **아무것도 띄우지 않는다**.
// "시대 불특정"이라고 쓰는 것보다 안 쓰는 게 낫다 (AGENTS.md 원칙).
function renderEra() {
  const cap = $('era-caption');
  const era = eraOf(state.book, state.ch);
  const regions = regionsOf(era);

  cap.textContent = '';
  const show = !!era && !era.undated;
  cap.hidden = !show;
  if (show) {
    const line = document.createElement('p');
    line.className = 'era-line';
    const name = document.createElement(era.note ? 'button' : 'span');
    name.className = 'era-name';
    name.textContent = era.ko;
    if (era.note) {
      name.type = 'button';
      name.setAttribute('aria-expanded', 'false');
      name.setAttribute('aria-controls', 'era-note');
    }
    line.append(name);
    const add = (cls, text) => {
      const n = document.createElement('span');
      if (cls) n.className = cls;
      n.textContent = text;
      line.append(n);
    };
    if (era.approx) { add(null, ' · '); add('era-date', era.approx); }
    if (era.caption) { add(null, ' — '); add('era-text', era.caption); }
    add('era-approx', ' (대략적인 구분)');
    cap.append(line);
    if (era.note) {
      const note = document.createElement('p');
      note.className = 'era-note';
      note.id = 'era-note';
      note.hidden = true;                       // 기본 접힘
      note.textContent = era.note;
      cap.append(note);
      name.addEventListener('click', () => {
        note.hidden = !note.hidden;
        name.setAttribute('aria-expanded', String(!note.hidden));
      });
    }
  }

  // 레이어를 켰을 때만: 지도 왼쪽 위 `대략` 배지, 그리고 그릴 영역이 없으면 한 줄 안내.
  // 시대 데이터를 못 받았으면 둘 다 띄우지 않는다 — 이유가 다른 안내를 대신 띄우지 않는다.
  const has = !!state.eras;
  $('era-badge').hidden = !(state.eraLayer && has);
  $('era-empty').hidden = !(state.eraLayer && has && era && regions.length === 0);
}

function setEraLayer(on, remember = true) {
  state.eraLayer = !!on;
  $('z-era').setAttribute('aria-pressed', String(state.eraLayer));
  if (remember) ls.set('eraLayer', state.eraLayer ? '1' : '0');
  if (state.open) { drawMap(); renderEra(); }
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
    if (!r.width || !r.height) return [vw() / 2, vh() / 2];
    return [(clientX - r.left) / r.width * vw(), (clientY - r.top) / r.height * vh()];
  };
  const pxPerUnit = () => {
    const r = svg.getBoundingClientRect();
    return r.width ? r.width / vw() : 1;
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

// 패널 왼쪽 가장자리를 끌어 폭을 바꾼다 (02-c). 마우스·터치·펜 모두 Pointer Events 하나로.
// 더블클릭하면 400px 로 돌아온다. `⟲` 는 폭을 건드리지 않는다 — 그건 시야만 되돌린다.
function bindResizer() {
  const r = $('resizer');
  let id = null, x0 = 0, w0 = 0;
  r.addEventListener('pointerdown', e => {
    if (!pushMode() || e.button > 0) return;
    id = e.pointerId; x0 = e.clientX; w0 = state.panelW;
    r.setPointerCapture?.(id);
    document.body.classList.add('resizing');
    r.classList.add('on');
    e.preventDefault();
  });
  r.addEventListener('pointermove', e => {
    if (id === null || e.pointerId !== id) return;
    setPanelW(w0 - (e.clientX - x0));        // 왼쪽으로 끌면 넓어진다
    scheduleRelayout();
  });
  const end = e => {
    if (id === null || (e && e.pointerId !== id)) return;
    id = null;
    document.body.classList.remove('resizing');
    r.classList.remove('on');
    saveW();
    scheduleRelayout();
  };
  r.addEventListener('pointerup', end);
  r.addEventListener('pointercancel', end);
  r.addEventListener('dblclick', () => { setPanelW(PANEL_MIN); saveW(); scheduleRelayout(); });
  r.addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24
      : e.key === 'Home' ? -1e6 : 0;
    if (!d) return;
    e.preventDefault();
    setPanelW(state.panelW + d);
    saveW();
    scheduleRelayout();
  });
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
  // 시대 (Spike 03-d). 못 받으면 캡션도 레이어도 없이 그대로 읽힌다 — 에러 문구는 띄우지 않는다.
  try {
    const [eras, chapterEras, regions] = await Promise.all([
      getJSON('eras.json'), getJSON('chapter_eras.json'), getJSON('geo/era_regions.json'),
    ]);
    state.eras = Object.fromEntries((eras.eras || []).map(e => [e.id, e]));
    state.chapterEras = chapterEras;
    state.regionsByEra = {};
    for (const f of regions.features || []) {
      (state.regionsByEra[f.properties.era] ||= []).push(f);
    }
  } catch {
    state.eras = null; state.chapterEras = null; state.regionsByEra = null;
  }
  const attrLine = (state.attr || []).join(' · ');
  $('attr-line').textContent = attrLine;
  $('panel-attr').textContent = attrLine;

  fillBooks();
  $('sel-book').addEventListener('change', e => go(e.target.value, 1, null));
  $('sel-chapter').addEventListener('change', e => go(state.book, +e.target.value, null));
  $('btn-prev').addEventListener('click', () => step(-1));
  $('btn-next').addEventListener('click', () => step(1));

  $('btn-map').addEventListener('click', () => setPanel(!state.open));
  $('z-era').addEventListener('click', () => setEraLayer(!state.eraLayer));
  $('scrim').addEventListener('click', () => setPanel(false));
  bindMapGestures();
  bindResizer();
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
  // 창이 좁아지면 패널도 따라 줄어든다(본문 640px 을 지키느라). 저장된 폭은 그대로 둔다 —
  // 다시 넓어지면 원래 폭으로 돌아온다.
  window.addEventListener('resize', () => { setPanelW(storedW()); scheduleRelayout(); });

  if (!location.hash) {
    const last = ls.get('last');
    const m = last && /^(\w+)\.(\d+)$/.exec(last);
    const b = m && bookOf(m[1]);
    location.hash = b ? `#${m[1]}.${m[2]}` : '#Gen.1';
  }
  // 패널 폭도 기억한다. 저장된 값이 없으면 400px.
  setPanelW(storedW());
  // 시대 영역 레이어도 기억한다. 저장된 값이 없으면 꺼짐.
  setEraLayer(ls.get('eraLayer') === '1', false);
  // 패널 열림 상태는 기억한다. 저장된 값이 없으면 닫힘.
  setPanel(ls.get('panel') === '1', false);
  // 검증(헤드리스 CDP)과 다음 스파이크를 위한 디버그 핸들. 앱 동작에는 관여하지 않는다.
  window.__antilego = {
    state, drawMap, setPanel, anchor, fitFocus, renderPanel, V,
    setEraLayer, renderEra, eraOf, regionsOf,
    setPanelW, saveW, panelMax, relayout, mapSize, scene,
  };
  await apply();
}

boot();
