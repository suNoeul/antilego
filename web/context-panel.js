import { placeVerses, versePlaces, otherReferences, SAMSON, hasSamson } from './reading-context.js?v=__V__';

const node = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
const button = (text, cls, action) => {
  const el = node('button', cls, text); el.type = 'button';
  el.addEventListener('click', action); return el;
};

export function createContextPanel({ root, storyRoot, storyEntry, getState, loadReferences, visit, select, layout }) {
  let chapterKey = '', verse = null, requestedVerse = null, lastData, lastKey = '', story = -1;
  let referencesPromise = null;
  const references = () => referencesPromise ||= loadReferences().catch(e => { referencesPromise = null; throw e; });
  const bookName = id => getState().index?.books.find(b => b.id === id)?.ko || id;

  function renderStory() {
    const s = getState();
    storyEntry.hidden = !hasSamson(s.book, s.ch) || story >= 0;
    storyRoot.hidden = story < 0;
    storyRoot.replaceChildren();
    if (story < 0) { layout(); return; }
    const step = SAMSON[story];
    const head = node('div', 'story-head');
    head.append(node('span', 'context-eyebrow', `삼손 이야기 · ${story + 1} / ${SAMSON.length}`),
      button('끝내기', 'context-text-button', () => { story = -1; renderStory(); storyEntry.focus({ preventScroll: true }); }));
    const title = node('h2', 'story-title', step.title);
    const controls = node('div', 'story-controls');
    const prev = button('← 이전', 'context-text-button', () => openStory(story - 1, 'prev')); prev.disabled = story === 0;
    const next = button('다음 →', 'context-text-button', () => openStory(story + 1, 'next')); next.disabled = story === SAMSON.length - 1;
    const ref = button(`삿 ${step.ch}:${step.v} 본문`, 'context-text-button story-ref', () => visit({ book: 'Judg', ...step }));
    controls.append(prev, ref, next);
    storyRoot.append(head, title, node('p', 'story-note', step.note), controls,
      node('p', 'story-limit', '주요 장면 8개 · 실제 이동 경로를 그린 지도가 아닙니다.'));
    layout();
  }
  function openStory(index = 0, direction = '') {
    if (index < 0 || index >= SAMSON.length) return;
    story = index; renderStory();
    const step = SAMSON[index];
    visit({ book: 'Judg', ...step });
    // 다른 구절 목록을 보던 패널 스크롤이 남아도 장면 조작부부터 보인다.
    storyRoot.closest('aside').scrollTop = 0;
    const control = direction === 'next' ? storyRoot.querySelector('.story-controls button:last-child')
      : direction === 'prev' ? storyRoot.querySelector('.story-controls button:first-child') : null;
    (control && !control.disabled ? control : storyRoot.querySelector('.story-ref'))?.focus({ preventScroll: true });
  }
  storyEntry.addEventListener('click', () => openStory());

  function update() {
    const s = getState(), key = `${s.book}.${s.ch}`;
    if (chapterKey !== key) { verse = null; chapterKey = key; }
    if (requestedVerse && requestedVerse.key !== key) requestedVerse = null;
    storyEntry.hidden = !hasSamson(s.book, s.ch) || story >= 0;
    const vs = placeVerses(s.data, s.sel);
    if (requestedVerse && vs.includes(requestedVerse.v)) { verse = requestedVerse.v; requestedVerse = null; }
    if (!vs.includes(verse)) verse = vs[0] ?? null;
    const renderKey = `${key}/${s.ver}/${s.sel}/${verse}`;
    if (lastData === s.data && lastKey === renderKey) return;
    lastData = s.data; lastKey = renderKey;
    root.replaceChildren();
    const p = s.places[s.sel];
    if (!p) { root.append(node('p', 'card-hint', '본문의 지명을 눌러 함께 읽어 보세요.')); return; }
    const heading = node('div', 'place-heading');
    heading.append(node('h2', 'card-name', p.ko || p.en), node('span', 'card-en', p.en || ''));
    const count = s.data?.places?.find(x => x.p === s.sel)?.n || 0;
    root.append(heading, node('p', 'card-n', `이 장 ${count}회 · 성경 전체 ${p.n ?? '?'}회`));
    if (!s.data) { root.append(node('p', 'context-note', '본문을 불러오면 연결된 구절을 표시합니다.')); return; }
    const refs = node('div', 'context-row');
    refs.append(node('span', 'context-label-title', '이 장에서'));
    const refList = node('div', 'context-links');
    for (const v of vs) {
      const b = button(`${v}절`, 'verse-link', () => {
        verse = v; update(); visit({ book: s.book, ch: s.ch, v, p: s.sel });
        root.querySelector(`[data-verse="${v}"]`)?.focus({ preventScroll: true });
      });
      b.dataset.verse = v;
      b.setAttribute('aria-label', `${p.ko || p.en} · ${v}절 본문으로`);
      b.setAttribute('aria-pressed', String(v === verse)); refList.append(b);
    }
    refs.append(refList); root.append(refs);
    const companions = versePlaces(s.data, verse, s.places);
    if (companions.length > 1) {
      const row = node('div', 'context-row');
      row.append(node('span', 'context-label-title', `${verse}절 함께`));
      const links = node('div', 'context-links');
      for (const id of companions) {
        const b = button(s.places[id].ko || s.places[id].en, 'place-link', () => select(id, verse));
        b.setAttribute('aria-pressed', String(id === s.sel)); links.append(b);
      }
      row.append(links); root.append(row);
    }
    const more = node('details', 'context-more');
    more.append(node('summary', '', '다른 장에서도 찾아보기'));
    const list = node('div', 'other-references'); list.setAttribute('aria-live', 'polite');
    more.append(list); root.append(more);
    let loaded = false;
    more.addEventListener('toggle', async () => {
      if (!more.open || loaded) return;
      loaded = true; list.textContent = '구절을 찾는 중…';
      try {
        const index = await references();
        if (!more.isConnected) return;
        const items = otherReferences(index, s.ver, s.sel, s.book, s.ch);
        list.replaceChildren();
        list.append(node('p', 'context-note', s.ver === 'esv'
          ? '개역한글 지명 색인 기준 · 본문은 현재 역본으로 엽니다.' : '현재 역본에서 지명으로 연결된 구절입니다.'));
        if (!items.length) list.append(node('p', 'context-note', '다른 장에 연결된 구절이 없습니다.'));
        let shown = 0;
        const append = () => {
          const end = Math.min(shown + 12, items.length);
          for (; shown < end; shown++) {
            const [book, ch, v] = items[shown];
            list.append(button(`${bookName(book)} ${ch}:${v}`, 'reference-link', () => visit({ book, ch, v, p: s.sel })));
          }
          if (shown < items.length) {
            const next = button(`더 보기 · ${items.length - shown}개`, 'context-text-button more-references', () => { next.remove(); append(); });
            list.append(next);
          }
        };
        append();
      } catch {
        if (!more.isConnected) return;
        list.replaceChildren(node('p', 'context-note', '구절 목록을 불러오지 못했습니다.'),
          button('다시 시도', 'context-text-button', () => { loaded = false; more.open = false; more.open = true; }));
      }
    });
  }
  return {
    update,
    setVerse(v) { verse = v; const s = getState(); requestedVerse = { key: `${s.book}.${s.ch}`, v }; },
    stopStory() { story = -1; renderStory(); },
  };
}

// 기존 시대 캡션을 본문/탐색 코드에서 분리한다. 자세한 설명은 기본 접힘.
export function renderEraCaption(cap, era) {
  if (cap._era === era) return;
  cap._era = era;
  cap.replaceChildren(); cap.hidden = !era || !!era.undated;
  if (cap.hidden) return;
  const details = node('details', 'era-details'), summary = node('summary');
  summary.append(node('span', 'era-name', era.ko));
  if (era.approx) summary.append(node('span', 'era-date', ' · ' + era.approx));
  details.append(summary);
  if (era.caption) details.append(node('p', 'era-text', era.caption));
  if (era.note) details.append(node('p', 'era-note', era.note));
  details.append(node('p', 'context-note', '연대와 영역은 대략적인 구분입니다.'));
  cap.append(details);
}
