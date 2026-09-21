// Antilego 읽기 뷰. 본문이 주인공, 지도는 각주.
// 지도는 패널 하나뿐이다. 기본 닫힘 → 플로팅 버튼이나 지명 클릭으로 연다.
import { renderScene, clampView, zoomAt, sceneFrame, BASE_VIEW, DEF_W, DEF_H }
  from './map.js?v=__V__';
// 권 경계 이동과 해시 검증은 DOM 없는 순수 함수로 뺐다 (06-b, 리뷰 F3·F10).
import { stepRef, isValidRef } from './nav.js?v=__V__';

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
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

// --- PoC 07 (실험): 동시대 한반도 한 줄. 플래그 뒤에 숨겨 둔다 ---
// `?korea=1` 로 켜고 localStorage 에 기억한다. `?korea=0` 은 끄고 기억도 지운다.
// 주소에 아무것도 없으면 기억한 값을 쓴다. 기본은 꺼짐 — 그냥 들어온 사람은 존재를 모른다.
const KOREA = (() => {
  const v = new URLSearchParams(location.search).get('korea');
  if (v === '1') { ls.set('korea', '1'); return true; }
  if (v === '0') { ls.del('korea'); return false; }
  return ls.get('korea') === '1';
})();

const state = {
  index: null, places: {}, layers: {}, attr: [],
  book: null, ch: null, data: null, sel: null,   // book=null → 첫 apply()에서 무조건 로드
  open: false,                                   // 패널 열림 여부
  panelW: 400,                                   // 패널 폭(02-c). ≥1200px 에서만 바뀐다
  view: { ...BASE_VIEW },                        // 지도 확대·이동
  // 시대 (Spike 03-d). 못 받으면 전부 null 인 채로 조용히 동작한다 — 캡션도 레이어도 없다.
  eras: null, chapterEras: null, regionsByEra: null,
  eraLayer: false,                               // 시대 영역 레이어. 기본 꺼짐
  korea: null,                                   // PoC 07. 플래그가 켜졌을 때만 채운다
  pendingVerse: null,                            // 성경 찾기에서 고른 절 (장 이동 후 스크롤)
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

// --- PoC 07: 동시대 한반도 데이터 ---
// 플래그가 켜졌을 때만, 그리고 캡션을 처음 그릴 때 한 번만 받는다. 꺼져 있으면 요청 자체가 없다.
// 못 받으면 빈 객체로 두고 아무것도 띄우지 않는다 (에러 문구 없음 — 03-d 와 같은 태도).
let koreaPending = null;
function ensureKorea() {
  if (!KOREA || state.korea || koreaPending) return;
  koreaPending = getJSON('korea_parallel.json')
    .then(d => { state.korea = d?.eras || {}; renderEra(); })
    .catch(() => { state.korea = {}; });
}
const koreaOf = era => (KOREA && era && state.korea?.[era.id]) || null;

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
// 잘못된 해시를 고칠 때만 쓴다 (F10). 히스토리에 새 칸을 만들지 않으므로
// 뒤로를 눌러도 잘못된 주소로 되돌아갔다가 다시 튕기는 고리가 생기지 않는다.
function goReplace(book, ch) {
  const h = '#' + book + '.' + ch;
  if (location.hash === h) return;
  location.replace(location.pathname + location.search + h);
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

// 휠·드래그·핀치도 같은 방식으로 묶는다 (리뷰 운영 보충). state.view 는 이벤트마다
// 그대로 갱신하고, 실제로 SVG 를 다시 그리는 것만 프레임당 한 번 — 언제나 최신 view 로.
// 버튼(+ − ⟲)·더블클릭은 한 번뿐이라 그냥 즉시 그린다.
let drawRaf = 0;
function scheduleDraw() {
  if (drawRaf) return;
  drawRaf = requestAnimationFrame(() => { drawRaf = 0; drawMap(); });
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
  ensureKorea();                              // PoC 07. 플래그가 꺼져 있으면 아무 일도 하지 않는다

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

    // --- PoC 07 (실험): 동시대 한반도 한 줄 ---
    // 플래그가 켜져 있고 **이 시대에 기록이 있을 때만** DOM 을 만든다.
    // 기록이 없는 시대에는 토글도 줄도 없다 — 빈칸이 없는 확신보다 낫다 (AGENTS.md).
    // 캡션이 숨는 원시사·시대 불특정에서는 이 블록 자체에 오지 않는다.
    const kor = koreaOf(era);
    if (kor) {
      const kline = document.createElement('p');
      kline.className = 'korea-line';
      kline.id = 'korea-line';
      kline.hidden = true;                      // 기본 접힘. 상태는 기억하지 않는다
      kline.append(`이 무렵 한반도 — ${kor.title}: ${kor.caption}`);
      if (kor.basis) {
        const b = document.createElement('span');
        b.className = 'korea-basis';
        b.textContent = ` (${kor.basis})`;
        kline.append(b);
      }
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'korea-toggle';
      t.textContent = '한반도는?';
      t.setAttribute('aria-expanded', 'false');
      t.setAttribute('aria-controls', 'korea-line');
      t.addEventListener('click', () => {
        kline.hidden = !kline.hidden;
        t.setAttribute('aria-expanded', String(!kline.hidden));
      });
      line.append(t);
      cap.append(kline);
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

// 장 요청 토큰 (F2). apply() 마다 하나씩 올라간다. 응답이 돌아왔을 때 이 값이
// 그 사이에 바뀌었으면 — 더 새로운 장을 이미 요청했다는 뜻이므로 — 아무것도 하지 않는다.
// 상태·DOM·스크롤·선택 어느 것도 옛 응답이 건드리지 못한다.
let reqToken = 0;
const stale = token => token !== reqToken;

async function loadChapter(token) {
  const book = state.book, ch = state.ch;        // 요청 시점의 장을 묶어 둔다
  const b = bookOf(book);
  $('title').textContent = (b ? b.ko : book) + ' ' + ch + '장';
  $('verses').textContent = '';
  state.data = null;
  let data;
  try {
    data = await getJSON(`books/${book}/${ch}.json`);
  } catch {
    if (stale(token)) return;                    // 진 요청의 실패는 화면에 띄우지 않는다
    showMsg('이 장을 불러오지 못했습니다. 데이터가 아직 없을 수 있습니다.');
    return;
  }
  if (stale(token)) return;                      // 이긴 응답만 본문을 그린다
  state.data = data;
  $('verses').textContent = '';
  const frag = document.createDocumentFragment();
  for (const v of data.verses) frag.append(renderVerse(v));
  $('verses').append(frag);
}

// --- 상단바 ---
// 셀렉트 두 개는 Spike 04 에서 사라졌다. 지금 위치를 글자로 보여 주는 버튼 하나뿐이고,
// 누르면 `성경 찾기` 가 열린다.
// 계산은 nav.js 의 stepRef 가 한다. 여기는 결과를 해시에 옮기기만 한다 (F3).
function step(d) {
  const r = stepRef(state.index, state.book, state.ch, d);
  if (!r) return;
  go(r.book, r.ch, null);
}
function syncNav() {
  const books = state.index.books;
  const i = books.findIndex(b => b.id === state.book);
  const b = books[i];
  $('loc-text').textContent = (b ? b.ko : state.book) + ' ' + state.ch + '장';
  $('btn-prev').disabled = i < 0 || (i === 0 && state.ch <= 1);
  $('btn-next').disabled = i < 0 || (i === books.length - 1 && state.ch >= books[i].chapters);
}

// --- 라우트 적용 ---
// 돌아갈 곳: 지금 읽던 장 → 저장된 last → 창 1. 셋 다 isValidRef 를 통과한 것만 쓴다 (F10).
function lastValidRef() {
  if (isValidRef(state.index, state.book, state.ch)) return { book: state.book, ch: state.ch };
  const m = /^(\w+)\.(\d+)$/.exec(ls.get('last') || '');
  if (m && isValidRef(state.index, m[1], +m[2])) return { book: m[1], ch: +m[2] };
  return { book: 'Gen', ch: 1 };
}

async function apply() {
  const r = parseHash();
  // 형식이 맞아도 없는 권·범위 밖 장이면 상태에도 localStorage 에도 넣지 않는다 (F10).
  if (!r || !isValidRef(state.index, r.book, r.ch)) {
    const f = lastValidRef();                  // 되돌아갈 곳을 먼저 정한다 (state 를 지우기 전에)
    showMsg('이 장을 불러오지 못했습니다. 데이터가 아직 없을 수 있습니다.');
    state.ch = null;                           // 본문을 지웠으니 되돌아갈 때 다시 그리게 한다
    goReplace(f.book, f.ch);
    return;
  }
  const changed = r.book !== state.book || r.ch !== state.ch;
  const selChanged = r.sel !== state.sel;
  state.book = r.book; state.ch = r.ch;
  state.sel = r.sel;

  if (changed) {
    // 토큰은 **실제로 장을 부를 때만** 올린다. 같은 장을 가리키는 apply() (부팅 직후 해시
    // 이벤트가 한 번 더 오는 경우)가 이미 뜬 요청을 죽이지 않게 하려는 것이다.
    const token = ++reqToken;
    syncNav();
    ls.set('last', state.book + '.' + state.ch);
    await loadChapter(token);
    if (stale(token)) return;       // 그 사이 다른 장으로 옮겼다 — 여기서 멈춘다
    window.scrollTo(0, 0);          // 장 이동 시 맨 위
  } else {
    syncNav();
  }
  if (changed || selChanged) resetView();   // 새 장면 → 확대 초기화
  applySel();
  pickSync();
  // 성경 찾기에서 절을 골라 장을 옮겨 온 경우, 그 장이 그려진 지금 스크롤한다.
  if (state.pendingVerse) {
    const v = state.pendingVerse;
    state.pendingVerse = null;
    requestAnimationFrame(() => scrollToVerse(v));
  }
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
    scheduleDraw();
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
      scheduleDraw();
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
      scheduleDraw();
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

// ===========================================================================
// 성경 찾기 (Spike 04) — 권·장·절 하나의 UI 로. 상단바의 셀렉트 두 개를 대신한다.
// 데스크톱(≥900px)은 상단바 아래 팝오버 3열, 그 아래는 전체 화면 시트 3단계.
// 해시 문법(#Book.ch/<placeId>)은 건드리지 않는다 — 절로 가는 것은 스크롤 + 2초 표시다.
// ===========================================================================

const PICK_WIDE = () => window.innerWidth >= 900;

// --- 한글 초성 ---
// 완성형 음절 U+AC00 + (초성 × 588) + (중성 × 28) + 종성.
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ',
  'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const DOUBLE = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
// 모바일 초성 칩 줄. 쌍자음은 넣지 않는다 (권 이름에 쓰이지 않는다).
const CHIPS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const isSyllable = c => c >= 0xac00 && c <= 0xd7a3;
// 낱자 자음(호환 자모 ㄱ..ㅎ)이면 쌍자음을 홑자음으로 접어서 돌려준다. 아니면 null.
function jamo(ch) {
  const c = ch.charCodeAt(0);
  if (c < 0x3131 || c > 0x314e) return null;
  return DOUBLE[ch] || ch;
}
// 음절의 초성(쌍자음은 접는다). 음절이 아니면 null.
function choOf(ch) {
  const c = ch.charCodeAt(0);
  if (!isSyllable(c)) return null;
  const j = CHO[Math.floor((c - 0xac00) / 588)];
  return DOUBLE[j] || j;
}

// 질의가 대상의 **앞부분**과 맞는가. 질의의 한 글자가
//   낱자 자음이면 → 그 자리 글자의 초성과 비교 (`ㅅㅅ` → 사사기)
//   완성 음절이면 → 그 글자 그대로 비교 (`사` → 사사기·사도행전)
function koPrefix(q, target) {
  const a = [...q], b = [...target];
  if (!a.length || a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const j = jamo(a[i]);
    if (j) { if (choOf(b[i]) !== j) return false; }
    else if (a[i] !== b[i]) return false;
  }
  return true;
}
// 초성만으로 된 질의 (모바일 칩이 쓰는 길)
const choPrefix = (q, target) => koPrefix(q, target);

const enKey = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HAS_KO = /[ㄱ-ㆎ가-힣]/;

// 한 권이 질의와 맞는가. 한글이면 약어·한글 이름 둘 다, 아니면 영문 이름·OSIS id.
function matchBook(b, text) {
  if (!text) return true;
  if (HAS_KO.test(text)) return koPrefix(text, b.abbr) || koPrefix(text, b.ko);
  const k = enKey(text);
  return !!k && (enKey(b.en).startsWith(k) || b.id.toLowerCase().startsWith(text.toLowerCase()));
}

// `삿 9:3` · `9 3` · `9.3` · `9` · `gen` · `1co` 를 {text, ch, v} 로 가른다.
// 끝에 붙은 숫자만 장·절로 본다 — `1co` 의 `1` 은 글자 쪽에 남는다.
function parseQuery(raw) {
  const s = (raw || '').trim();
  let m = /^(.*?)\s*(\d+)\s*(?::|\.|\s)\s*(\d+)$/.exec(s);
  if (m) return { text: m[1].trim(), ch: +m[2], v: +m[3] };
  m = /^(.*?)\s*(\d+)$/.exec(s);
  if (m) return { text: m[1].trim(), ch: +m[2], v: null };
  return { text: s, ch: null, v: null };
}

const pick = {
  open: false,
  book: null,      // 장 열이 보여 주는 권 (선택)
  ch: null,        // 절 열이 보여 주는 장 (선택)
  v: null,         // 질의가 가리키는 절
  nv: 0,           // pick.ch 의 절 수 (0 = 아직 모름)
  cho: null,       // 모바일 초성 칩
  step: 1,         // 모바일 단계 1=권 2=장 3=절
  list: [],        // 필터된 권 목록
  hi: -1,          // 키보드 커서 (pick.list 의 인덱스)
  q: { text: '', ch: null, v: null },
};

// 장별 절 수 캐시. 지금 읽는 장은 이미 받아 둔 state.data 를 그대로 쓴다.
const vcount = new Map();
async function verseCount(book, ch) {
  if (!book || !ch) return 0;
  const key = book + '/' + ch;
  if (vcount.has(key)) return vcount.get(key);
  if (state.book === book && state.ch === ch && state.data) {
    const n = state.data.verses.length;
    vcount.set(key, n);
    return n;
  }
  try {
    const d = await getJSON(`books/${book}/${ch}.json`);
    const n = (d.verses || []).length;
    vcount.set(key, n);
    return n;
  } catch { return 0; }
}

// --- 절로 가기. 해시는 그대로 두고 스크롤 + 2초 표시. ---
let hlTimer = 0;
function scrollToVerse(n) {
  const el = document.querySelector(`.verse[data-v="${n}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  clearTimeout(hlTimer);
  for (const o of document.querySelectorAll('.verse-hl')) o.classList.remove('verse-hl');
  el.classList.add('verse-hl');
  hlTimer = setTimeout(() => el.classList.remove('verse-hl'), 2000);
  return true;
}
// 다른 장이면 먼저 옮기고, 그 장이 그려진 뒤에 스크롤한다 (apply() 가 마무리한다).
function navVerse(book, ch, v) {
  if (state.book === book && state.ch === ch) { scrollToVerse(v); return; }
  state.pendingVerse = v;
  go(book, ch, null);
}

// --- 그리기 ---
function rebuildList() {
  let list = state.index?.books || [];
  if (pick.cho) list = list.filter(b => choPrefix(pick.cho, b.abbr) || choPrefix(pick.cho, b.ko));
  if (pick.q.text) list = list.filter(b => matchBook(b, pick.q.text));
  pick.list = list;
  const i = list.findIndex(b => b.id === pick.book);
  pick.hi = i >= 0 ? i : (list.length ? 0 : -1);
}

function renderBooks() {
  const col = $('col-book');
  col.textContent = '';
  if (!pick.list.length) {
    const p = document.createElement('p');
    p.className = 'pick-empty';
    p.textContent = '일치하는 책이 없습니다';
    col.append(p);
    return;
  }
  let grp = null;
  // `group` 이 없는 데이터(픽스처)에서도 무너지지 않게 구약/신약으로 물러선다.
  const groupOf = b => b.group || (b.testament === 'OT' ? '구약' : '신약');
  pick.list.forEach((b, i) => {
    if (groupOf(b) !== grp) {
      grp = groupOf(b);
      const h = document.createElement('div');
      h.className = 'grp';
      h.textContent = grp;
      col.append(h);
    }
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'bk' + (b.id === state.book ? ' cur' : '') + (i === pick.hi ? ' hi' : '');
    row.dataset.id = b.id;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(b.id === pick.book));
    row.tabIndex = i === pick.hi ? 0 : -1;
    const chip = document.createElement('span');
    chip.className = 'chip ' + (b.testament === 'OT' ? 'chip-ot' : 'chip-nt');
    chip.textContent = b.abbr;
    const ko = document.createElement('span');
    ko.className = 'bk-ko';
    ko.textContent = b.ko;
    const en = document.createElement('span');
    en.className = 'bk-en';
    en.textContent = b.en || '';
    row.append(chip, ko, en);
    col.append(row);
  });
  const sel = col.querySelector('.bk.hi') || col.querySelector('.bk[aria-selected="true"]');
  sel?.scrollIntoView({ block: 'nearest' });
}

function numGrid(col, n, cur, hint) {
  col.textContent = '';
  if (!n) {
    const p = document.createElement('p');
    p.className = 'pick-hint';
    p.textContent = hint;
    col.append(p);
    return;
  }
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= n; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'num';
    b.dataset.n = i;
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(i === cur));
    b.tabIndex = i === (cur || 1) ? 0 : -1;
    b.textContent = i;
    frag.append(b);
  }
  col.append(frag);
  col.querySelector('.num[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function renderChapters() {
  const b = pick.book && bookOf(pick.book);
  $('head-ch').textContent = b ? b.ko : '';
  numGrid($('col-ch'), b ? b.chapters : 0, pick.ch, '책을 고르세요');
}
function renderVerses() {
  const b = pick.book && bookOf(pick.book);
  $('head-v').textContent = b && pick.ch ? b.ko + ' ' + pick.ch + '장' : '';
  numGrid($('col-v'), pick.book && pick.ch ? pick.nv : 0, pick.v, '장을 고르세요');
}

function renderChips() {
  const box = $('pick-chips');
  box.textContent = '';
  for (const c of CHIPS) {
    const on = pick.cho === c;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kchip';
    b.dataset.cho = c;
    b.setAttribute('aria-pressed', String(on));
    b.append(document.createTextNode(c));
    if (on) {
      const x = document.createElement('span');
      x.className = 'kchip-x';
      x.textContent = '×';
      b.append(x);
    }
    box.append(b);
  }
}

function renderCrumb() {
  const b = pick.book && bookOf(pick.book);
  const parts = [];
  if (b) parts.push(b.ko);
  if (b && pick.ch) parts.push(pick.ch + '장');
  $('pick-crumb').textContent = parts.join(' › ') || '성경 찾기';
  $('pick-back').hidden = pick.step <= 1;
  $('picker').dataset.step = String(pick.step);
}

function renderPicker() {
  renderBooks();
  renderChapters();
  renderVerses();
  renderCrumb();
}

// pick.ch 의 절 수를 받아 절 열만 다시 그린다 (경쟁 조건 방지용 토큰).
let vseq = 0;
async function refreshVerses() {
  const my = ++vseq;
  const n = await verseCount(pick.book, pick.ch);
  if (my !== vseq) return;
  pick.nv = n;
  if (pick.v && pick.v > n) pick.v = null;
  if (pick.open) renderVerses();
}

// --- 고르기 ---
function setBook(id, { step = false } = {}) {
  pick.book = id;
  const i = pick.list.findIndex(b => b.id === id);
  if (i >= 0) pick.hi = i;
  pick.ch = id === state.book ? state.ch : null;
  pick.v = null;
  pick.nv = 0;
  if (step && !PICK_WIDE()) pick.step = 2;
  renderPicker();
  if (pick.ch) refreshVerses();
}

function chooseChapter(n) {
  if (!pick.book) return;
  pick.ch = n;
  pick.v = null;
  pick.nv = 0;
  if (!PICK_WIDE()) pick.step = 3;
  go(pick.book, n, null);          // 바로 옮긴다. 피커는 열린 채로 둔다
  renderPicker();
  refreshVerses();
}

function chooseVerse(n) {
  if (!pick.book || !pick.ch) return;
  pick.v = n;
  navVerse(pick.book, pick.ch, n);
  closePicker();
}

// 입력줄의 Enter. 권만 → 1장 · 권+장 → 그 장 · 절까지 → 그 장 + 절로 스크롤 후 닫기.
function applyQuery() {
  const b = pick.list[pick.hi] || (pick.book && bookOf(pick.book));
  if (!b) return;
  const ch = Math.min(Math.max(1, pick.q.ch || 1), b.chapters);
  pick.book = b.id;
  pick.ch = ch;
  if (pick.q.v) {
    closePicker();
    navVerse(b.id, ch, pick.q.v);
    return;
  }
  go(b.id, ch, null);
  if (!PICK_WIDE()) pick.step = 3;
  renderPicker();
  refreshVerses();
  ($('col-ch').querySelector('.num[tabindex="0"]') || $('col-ch').querySelector('.num'))?.focus();
}

function moveHi(d) {
  if (!pick.list.length) return;
  pick.hi = Math.max(0, Math.min(pick.list.length - 1, (pick.hi < 0 ? 0 : pick.hi) + d));
  renderBooks();
  if ($('col-book').contains(document.activeElement)) {
    $('col-book').querySelector('.bk.hi')?.focus();
  }
}

// --- 열기 · 닫기 ---
function openPicker() {
  if (pick.open) return;
  pick.open = true;
  pick.book = state.book;
  pick.ch = state.ch;
  pick.v = null;
  pick.nv = 0;
  pick.cho = null;
  pick.step = 1;
  pick.q = { text: '', ch: null, v: null };
  $('pick-q').value = '';
  rebuildList();
  renderChips();
  $('picker').hidden = false;
  $('loc').setAttribute('aria-expanded', 'true');
  renderPicker();
  refreshVerses();
  if (PICK_WIDE()) $('pick-q').focus();
}

function closePicker() {
  if (!pick.open) return;
  pick.open = false;
  $('picker').hidden = true;
  $('loc').setAttribute('aria-expanded', 'false');
  $('loc').focus();
}
const togglePicker = () => (pick.open ? closePicker() : openPicker());

// 장이 바뀌면 `현재 권` 표시와 breadcrumb 만 따라 고친다 (열려 있을 때).
function pickSync() {
  if (!pick.open) return;
  for (const r of $('col-book').querySelectorAll('.bk')) {
    r.classList.toggle('cur', r.dataset.id === state.book);
  }
  renderCrumb();
}

// --- Tab 으로 열을 돈다: 입력 → 성경권 → 장 → 절 → × → 입력 ---
function tabTargets() {
  const first = el => el.querySelector('[tabindex="0"]') || el.querySelector('button');
  return [$('pick-q'), first($('col-book')), first($('col-ch')), first($('col-v')), $('pick-x')]
    .filter(Boolean);
}
function cycleTab(back) {
  const t = tabTargets();
  const cur = t.findIndex(el => el === document.activeElement || el.contains?.(document.activeElement));
  const i = cur < 0 ? 0 : (cur + (back ? -1 : 1) + t.length) % t.length;
  t[i].focus();
}

function bindPicker() {
  const q = $('pick-q');

  $('loc').addEventListener('click', togglePicker);
  $('pick-x').addEventListener('click', closePicker);
  $('pick-back').addEventListener('click', () => {
    pick.step = Math.max(1, pick.step - 1);
    renderCrumb();
  });

  q.addEventListener('input', () => {
    pick.q = parseQuery(q.value);
    rebuildList();
    if (pick.list.length === 1 && pick.list[0].id !== pick.book) {
      // 정확히 한 권으로 좁혀지면 그 권을 골라 둔다 (옮기지는 않는다)
      pick.book = pick.list[0].id;
      pick.ch = null;
      pick.nv = 0;
    }
    const b = pick.book && bookOf(pick.book);
    if (b && pick.q.ch) {
      pick.ch = Math.min(pick.q.ch, b.chapters);
      pick.v = pick.q.v || null;
      renderPicker();
      refreshVerses();
      return;
    }
    if (!pick.q.ch) pick.v = null;
    renderPicker();
    if (pick.book && pick.ch) refreshVerses();
  });

  $('picker').addEventListener('click', e => {
    const bk = e.target.closest?.('.bk');
    if (bk) { setBook(bk.dataset.id, { step: true }); return; }
    const num = e.target.closest?.('.num');
    if (num) {
      const n = +num.dataset.n;
      if ($('col-ch').contains(num)) chooseChapter(n);
      else chooseVerse(n);
      return;
    }
    const chip = e.target.closest?.('.kchip');
    if (chip) {
      pick.cho = pick.cho === chip.dataset.cho ? null : chip.dataset.cho;
      rebuildList();
      renderChips();
      renderPicker();
    }
  });

  $('picker').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); return; }
    if (e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey); return; }
    const inList = e.target === q || $('col-book').contains(e.target);
    if (inList && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      moveHi(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key === 'Enter' && e.target === q) { e.preventDefault(); applyQuery(); return; }
    if (e.key === 'Enter' && $('col-book').contains(e.target)) {
      e.preventDefault();
      applyQuery();
    }
  });

  // 바깥 누르면 닫힘 (데스크톱 팝오버). 모바일 시트는 화면을 다 덮으니 해당 없음.
  document.addEventListener('mousedown', e => {
    if (!pick.open) return;
    if ($('picker').contains(e.target) || $('loc').contains(e.target)) return;
    closePicker();
  });
}

/* ==========================================================================
   피드백 (Spike 05-b) — 알약 하나 + 카드 하나
   읽던 자리를 **따로 한 줄**로 채워 두고(지우고 싶으면 `×`), 내용은 빈 칸으로 시작한다.
   보낸 글은 Vercel 함수(api/)를 거쳐 Notion 📮 Feedback DB 로 간다.
   실패하면 글을 지우지 않고 `복사해서 보내기` 를 내민다 — 카톡으로라도 닿게.
   ========================================================================== */

const FEEDBACK_URL = 'https://antilego-api.vercel.app/api/feedback';
const FB_TIMEOUT = 8000;      // fetch 제한 시간
const FB_THANKS = 2000;       // 고맙습니다 → 닫힘
const FB_COOL = 60000;        // 429 뒤 보내기 잠금

const fb = {
  open: false,
  loc: '',                    // 보낼 위치 문자열. `×` 로 빼면 ''
  sending: false,
  blockUntil: 0,              // 429 잠금이 풀리는 시각
  thanksTimer: 0,
  blockTimer: 0,
};

// 폰 <600 · 태블릿 <1024 · 데스크톱. 함수가 아는 이름은 이 셋뿐이다(그 밖은 '모름').
function fbDevice() {
  if (window.matchMedia('(max-width: 599px)').matches) return '폰';
  if (window.matchMedia('(max-width: 1023px)').matches) return '태블릿';
  return '데스크톱';
}

// 지금 화면에 보이는 첫 절. 상단바 아래에서부터 재고, 절 하나가 화면보다 길면
// 화면 위로 지나간 마지막 절을 쓴다. 본문을 못 받았으면 null.
function fbVerse() {
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
  const h = window.innerHeight;
  let last = null;
  for (const el of document.querySelectorAll('.verse')) {
    const t = el.getBoundingClientRect().top;
    if (t >= top && t <= h) return +el.dataset.v;
    if (t < top) last = +el.dataset.v;
  }
  return last;
}

// `사사기 9장 21절 · 브엘` — 장은 언제나, 절은 보일 때, 지명은 골랐을 때.
function fbLocText() {
  const b = bookOf(state.book);
  let s = (b ? b.ko : state.book) + ' ' + state.ch + '장';
  const v = fbVerse();
  if (v) s += ' ' + v + '절';
  const p = state.sel && state.places[state.sel];
  if (p && p.ko) s += ' · ' + p.ko;
  return s;
}

function fbSetLoc(text) {
  fb.loc = text || '';
  $('fb-loc-t').textContent = fb.loc;
  $('fb-loc').hidden = !fb.loc;
}

function fbMsg(text, bad = false) {
  const el = $('fb-msg');
  el.textContent = text || '';
  el.classList.toggle('fb-bad', !!bad && !!text);
  el.hidden = !text;
}

// 보내기가 눌리는 조건: 내용이 있고, 보내는 중이 아니고, 429 잠금이 풀려 있을 것.
function fbSync() {
  const blocked = Date.now() < fb.blockUntil;
  const empty = !$('fb-text').value.trim();
  $('fb-send').disabled = empty || fb.sending || blocked;
  $('fb-send').textContent = fb.sending ? '보내는 중…' : '보내기';
  // 보내는 동안은 내용·이름·위치를 잠근다 (F9). 응답을 기다리는 사이에 쓴 글이
  // 남의 성공 응답에 지워지는 일을 애초에 만들지 않는다. 취소·닫기는 그대로 열려 있다.
  $('fb-text').disabled = fb.sending;
  $('fb-name').disabled = fb.sending;
  $('fb-loc-x').disabled = fb.sending;
}

// 5줄로 시작해 12줄까지만 자란다.
function fbGrow() {
  const t = $('fb-text');
  const cs = getComputedStyle(t);
  const lh = parseFloat(cs.lineHeight) || 22;
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  t.style.height = 'auto';
  const rows = Math.max(5, Math.min(12, Math.round((t.scrollHeight - pad) / lh)));
  t.style.height = (rows * lh + pad) + 'px';
}

function openFb() {
  if (fb.open) return;
  fb.open = true;
  clearTimeout(fb.thanksTimer);
  $('fb-card').hidden = false;
  $('btn-fb').setAttribute('aria-expanded', 'true');
  $('fb-name').value = ls.get('fbName') || '';
  $('fb-hp').value = '';
  fbSetLoc(fbLocText());
  fbMsg('');
  $('fb-copy').hidden = true;
  fbGrow();
  fbSync();
  if (window.innerWidth >= 900) $('fb-text').focus();
}

// 바깥을 눌러 닫을 때는 포커스를 되돌리지 않는다 — 누른 자리에 그대로 두는 게 맞다.
function closeFb(refocus = true) {
  if (!fb.open) return;
  fb.open = false;
  clearTimeout(fb.thanksTimer);
  $('fb-card').hidden = true;
  $('btn-fb').setAttribute('aria-expanded', 'false');
  if (refocus) $('btn-fb').focus();
}
const toggleFb = () => (fb.open ? closeFb() : openFb());

// 보내지 못했을 때 내미는 글. 카톡·메일 어디에 붙여도 그대로 읽힌다.
function fbCopyText() {
  const name = $('fb-name').value.trim() || '익명';
  return `[Antilego 피드백] 위치: ${fb.loc || '(없음)'} / 이름: ${name} / 내용: ${$('fb-text').value.trim()}`;
}

async function fbCopy() {
  const text = fbCopyText();
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // 권한이 없거나 옛 브라우저면 숨은 textarea 로 물러선다.
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.append(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch { ok = false; }
  }
  fbMsg(ok ? '복사됨 — 카톡 등으로 보내 주세요' : '복사하지 못했습니다. 글을 직접 긁어 주세요.', !ok);
}

function fbFail(error, cool = false) {
  fbMsg(error || '보내지 못했습니다.', true);   // 글은 그대로 둔다
  $('fb-copy').hidden = false;
  if (cool) {
    fb.blockUntil = Date.now() + FB_COOL;
    clearTimeout(fb.blockTimer);
    fb.blockTimer = setTimeout(() => { fb.blockUntil = 0; fbSync(); }, FB_COOL);
  }
  fbSync();
}

async function fbSend() {
  if (fb.sending || Date.now() < fb.blockUntil) return;
  const text = $('fb-text').value.trim();
  if (!text) return;
  const name = $('fb-name').value.trim();
  ls.set('fbName', name);
  const sent = $('fb-text').value;              // 보낸 글 그대로. 성공 후 비울지 이걸로 가린다
  const hadFocus = document.activeElement === $('fb-text');

  fb.sending = true;
  fbMsg('');
  $('fb-copy').hidden = true;
  fbSync();                                     // 여기서 내용·이름·위치가 잠긴다

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FB_TIMEOUT);
  try {
    const r = await fetch(FEEDBACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, text, loc: fb.loc,
        url: location.href,
        device: fbDevice(),
        hp: $('fb-hp').value,
        ts: new Date().toISOString(),
      }),
      signal: ac.signal,
    });
    let data = null;
    try { data = await r.json(); } catch { /* 본문이 JSON 이 아닐 수도 있다 */ }
    if (r.ok && data && data.ok === true) {
      // 이름은 남기고 내용만 비운다 — 단, 지금 칸에 든 것이 **보낸 그 글일 때만**.
      // 잠금(F9)이 이미 막고 있지만, 잠금을 빠져나간 경로가 있어도 글이 사라지지 않게 한 겹 더 둔다.
      if ($('fb-text').value === sent) $('fb-text').value = '';
      fbGrow();
      fbMsg('고맙습니다. 잘 받았습니다.');
      fb.thanksTimer = setTimeout(() => closeFb(), FB_THANKS);
    } else {
      fbFail(data?.error, r.status === 429);
    }
  } catch {
    fbFail('보내지 못했습니다.');               // 네트워크 실패·시간 초과
  } finally {
    clearTimeout(timer);
    fb.sending = false;
    fbSync();                                   // 잠금 해제
    // 잠기는 순간 포커스가 body 로 밀려난다. 카드가 아직 열려 있으면 제자리로 돌려놓는다.
    if (hadFocus && fb.open && document.activeElement !== $('fb-text')) $('fb-text').focus();
  }
}

function bindFeedback() {
  $('btn-fb').addEventListener('click', toggleFb);
  $('fb-x').addEventListener('click', () => closeFb());
  $('fb-cancel').addEventListener('click', () => closeFb());
  $('fb-loc-x').addEventListener('click', () => fbSetLoc(''));
  $('fb-send').addEventListener('click', fbSend);
  $('fb-copy').addEventListener('click', fbCopy);
  $('fb-text').addEventListener('input', () => { fbGrow(); fbSync(); });
  $('fb-name').addEventListener('input', () => ls.set('fbName', $('fb-name').value.trim()));
  $('fb-card').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFb(); }
  });
  // 바깥 누르면 닫힘 — 데스크톱 팝오버만. 모바일 시트는 아래에 붙어 있어 오발이 잦다.
  document.addEventListener('mousedown', e => {
    if (!fb.open || window.innerWidth < 900) return;
    if ($('fb-card').contains(e.target) || $('btn-fb').contains(e.target)) return;
    closeFb(false);
  });
}

// --- 출처 표기 (F11) ---
// CC BY 4.0 은 출처 이름만으로는 모자란다 — 원본 링크 · 라이선스 링크 · 변경 고지가 있어야 한다.
// attribution.json 두 형식을 다 받는다:
//   새 형식 { sources: [{ text, author, url, license, license_url, changes }], legacy: ["…"] }
//     — 06-a 가 쓰는 키는 `sources` 다. `items` 도 같은 뜻으로 받아 준다.
//   옛 형식 ["…", "…"]  (배포본·픽스처가 아직 옛 것일 수 있다)
function attrItems(data) {
  if (Array.isArray(data)) return data.map(text => ({ text }));
  const objs = data?.sources ?? data?.items;
  if (Array.isArray(objs)) return objs;
  if (Array.isArray(data?.legacy)) return data.legacy.map(text => ({ text }));
  return [];
}

// 새 탭으로 여는 링크. rel="noopener" 는 원본 탭을 넘겨주지 않기 위해서다.
function extLink(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  return a;
}

// 출처 하나 = `이름 (저작자, 라이선스) — 변경: …`.
// 이름과 라이선스는 링크가 있으면 링크로. 저작자가 이름에 이미 들어 있으면 두 번 쓰지 않는다
// (`OpenBible.info Bible Geocoding` 의 저작자는 `OpenBible.info`). TIPNR 의
// `Tyndale House, Cambridge` 처럼 이름에 없는 저작자는 반드시 남긴다.
function attrNode(it) {
  const s = document.createElement('span');
  s.className = 'attr-item';
  const txt = t => document.createTextNode(t);
  s.append(it.url ? extLink(it.url, it.text) : txt(it.text));
  const showAuthor = it.author && !String(it.text || '').includes(it.author);
  if (showAuthor || it.license) {
    s.append(txt(' ('));
    if (showAuthor) s.append(txt(it.author));
    if (showAuthor && it.license) s.append(txt(', '));
    if (it.license) {
      s.append(it.license_url ? extLink(it.license_url, it.license) : txt(it.license));
    }
    s.append(txt(')'));
  }
  if (it.changes) s.append(txt(' — 변경: ' + it.changes));
  return s;
}

// 푸터는 링크가 붙은 긴 형태 한 줄(옅은 글씨, 넘치면 줄바꿈).
// 패널은 자리가 좁으니 예전처럼 이름만 짧게 — 링크는 푸터 한 곳에만 둔다.
function renderAttr(items) {
  const foot = $('attr-line');
  foot.textContent = '';
  items.forEach((it, i) => {
    if (i) foot.append(document.createTextNode(' · '));
    foot.append(attrNode(it));
  });
  $('panel-attr').textContent = items.map(it => it.text).join(' · ');
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
  renderAttr(attrItems(state.attr));

  bindPicker();
  bindFeedback();
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
    if (fb.open) {                               // 피드백 카드가 제일 위(70)다 — Esc 를 먼저 받는다
      if (e.key === 'Escape') { e.preventDefault(); closeFb(); }
      return;
    }
    if (pick.open) return;                       // 피커가 열려 있으면 피커가 먼저 받는다
    if (e.key === 'Escape' && state.open) { setPanel(false); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === '/' || e.key === 'g' || e.key === 'G') { e.preventDefault(); openPicker(); }
  });
  window.addEventListener('hashchange', apply);
  // 창이 좁아지면 패널도 따라 줄어든다(본문 640px 을 지키느라). 저장된 폭은 그대로 둔다 —
  // 다시 넓어지면 원래 폭으로 돌아온다.
  window.addEventListener('resize', () => { setPanelW(storedW()); scheduleRelayout(); });

  if (!location.hash) {
    // 저장된 last 도 해시와 같은 검증을 통과해야 쓴다 (F10). 손상됐으면 창 1.
    const f = lastValidRef();
    location.hash = `#${f.book}.${f.ch}`;
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
    KOREA, koreaOf, ensureKorea,               // PoC 07 (실험)
    setPanelW, saveW, panelMax, relayout, mapSize, scene,
    // 성경 찾기 (Spike 04)
    pick, openPicker, closePicker, renderPicker, rebuildList,
    parseQuery, matchBook, koPrefix, choOf, scrollToVerse, verseCount,
    // 피드백 (Spike 05-b)
    fb, openFb, closeFb, fbLocText, fbVerse, fbDevice, fbCopyText, fbSetLoc, FEEDBACK_URL,
    fbSend, fbSync,
    // 06-b (리뷰 반영): 순수 네비게이션·해시 검증·출처
    stepRef, isValidRef, step, lastValidRef, parseHash,
    attrItems, renderAttr, scheduleDraw,
  };
  await apply();
}

boot();
