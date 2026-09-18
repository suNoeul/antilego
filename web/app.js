// Antilego 읽기 뷰. 본문이 주인공, 지도는 각주.
import { renderScene } from './map.js';

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
  book: null, ch: null, data: null, sel: null, selV: null,   // book=null → 첫 apply()에서 무조건 로드
};

const getJSON = async path => {
  const r = await fetch(DATA_BASE + path);
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

// --- 해시 라우팅: #Josh.10 / #Josh.10/jericho ---
function parseHash() {
  const m = /^#([\w]+)\.(\d+)(?:\/([\w-]+))?$/.exec(location.hash);
  return m ? { book: m[1], ch: +m[2], sel: m[3] || null } : null;
}
function go(book, ch, sel) {
  const h = '#' + book + '.' + ch + (sel ? '/' + sel : '');
  if (location.hash === h) return;
  location.hash = h;
}

// --- 장면 / 카드 ---
function scene(pid) {
  const inCh = (state.data?.places || []).map(x => x.p).filter(p => state.places[p]);
  return {
    focus: pid && state.places[pid] ? [pid] : [],
    others: inCh.filter(p => p !== pid),
    places: state.places,
  };
}

function makeCard(pid, bare) {
  const box = document.createElement('div');
  box.className = 'card' + (bare ? ' bare' : '');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'card-map');
  box.append(svg);
  renderScene(svg, scene(pid), state.layers, TOKENS);

  const p = pid && state.places[pid];
  if (p) {
    const chN = (state.data?.places || []).find(x => x.p === pid)?.n || 0;
    box.insertAdjacentHTML('beforeend',
      '<p class="card-name"></p><p class="card-en"></p><p class="card-n"></p>');
    box.querySelector('.card-name').textContent = p.ko || pid;
    box.querySelector('.card-en').textContent = p.en || '';
    box.querySelector('.card-n').textContent =
      `이 장에서 ${chN}회 · 성경 전체 ${p.n ?? '?'}회`;
  } else {
    const hint = document.createElement('p');
    hint.className = 'card-hint';
    hint.textContent = '지명을 누르면 위치를 보여줍니다';
    box.append(hint);
  }

  if (!bare) {
    const foot = document.createElement('div');
    foot.className = 'card-foot';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ghost'; b.textContent = '크게 보기';
    b.addEventListener('click', () => openModal(pid));
    foot.append(b);
    box.append(foot);
  }
  return box;
}

// --- 모달 ---
function openModal(pid) {
  const body = $('modal-body');
  body.textContent = '';
  body.append(makeCard(pid, true));
  $('modal').hidden = false;
  $('modal-close').focus();
}
const closeModal = () => { $('modal').hidden = true; };

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

const wide = () => window.matchMedia('(min-width: 900px)').matches;

function applySel() {
  for (const b of document.querySelectorAll('.place')) {
    b.setAttribute('aria-pressed', String(b.dataset.p === state.sel));
  }
  document.querySelector('.inline-card')?.remove();
  const side = $('side-card');
  side.textContent = '';
  side.append(makeCard(state.sel, false));

  const v = state.selV; state.selV = null;   // 탭한 절은 한 번만 쓴다
  if (!wide() && state.sel) {
    const host = v != null
      ? document.querySelector(`.verse[data-v="${v}"]`)
      : document.querySelector(`.place[data-p="${state.sel}"]`)?.closest('.verse');
    if (host) {
      const wrap = document.createElement('div');
      wrap.className = 'inline-card';
      wrap.append(makeCard(state.sel, false));
      host.after(wrap);
    }
  }
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
  $('chapmap-body').textContent = '';
  state.data = null;
  try {
    state.data = await getJSON(`books/${state.book}/${state.ch}.json`);
  } catch {
    showMsg('이 장을 불러오지 못했습니다. 데이터가 아직 없을 수 있습니다.');
    $('side-card').textContent = '';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const v of state.data.verses) frag.append(renderVerse(v));
  $('verses').append(frag);
  $('chapmap-body').append(makeCard(null, false));
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
  state.book = r.book; state.ch = r.ch;
  if (changed) state.selV = null;
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
  applySel();
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
  $('attr-line').textContent = (state.attr || []).join(' · ');

  fillBooks();
  $('sel-book').addEventListener('change', e => go(e.target.value, 1, null));
  $('sel-chapter').addEventListener('change', e => go(state.book, +e.target.value, null));
  $('btn-prev').addEventListener('click', () => step(-1));
  $('btn-next').addEventListener('click', () => step(1));

  document.addEventListener('click', e => {
    const b = e.target.closest?.('.place');
    if (b) {
      const on = b.dataset.p === state.sel;       // 같은 지명 → 닫기
      state.selV = on ? null : +b.closest('.verse').dataset.v;
      go(state.book, state.ch, on ? null : b.dataset.p);
      return;
    }
    if (e.target === $('modal')) closeModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  $('modal-close').addEventListener('click', closeModal);
  window.addEventListener('hashchange', apply);

  if (!location.hash) {
    const last = ls.get('last');
    const m = last && /^(\w+)\.(\d+)$/.exec(last);
    const b = m && bookOf(m[1]);
    location.hash = b ? `#${m[1]}.${m[2]}` : '#Gen.1';
  }
  await apply();
}

boot();
