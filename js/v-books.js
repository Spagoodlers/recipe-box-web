// Books: a book's cards as index cards, a page at a time, with the shelf of books under them (down
// the side, on a wide screen). Also the empty box, the starter books, managing books, and deleting
// one (its cards go where you say).

import {
  box, settings, ui, views, actions, holds, forms, esc, plural, recipeCount, btn, glyph, notice, go, back, route, paged, setPageKeys, swipe, wide,
  textWidth, scopes, bookName, setFolder, shownCards, canFind, draw, ALL, DEV_BOOK, backBar, cardHash, polish,
} from './core.js';
import { formatMinutes, fold, matches } from './units.js';
import { effectiveTotal } from './kitchen.js';
import { newCard, downloadText, fileName } from './v-card.js';

// ---------------------------------------------------------------- the tiles

/**
 * The book's recipes as index cards, a page at a time. Tap one to open it. Paging on past the last
 * page goes into the next book (and back past the first, into the one before).
 */
views.books = () => {
  const real = box.recipes.filter((r) => r.folderId !== DEV_BOOK);
  const inBook = box.inBook(ui.folder);
  if (!box.recipes.length || (ui.folder === ALL && !inBook.length && !ui.query && !real.length)) return viewEmpty();
  const name = bookName();
  const shownCount = shownCards().length;
  const sub = ui.query ? `${shownCount} of ${inBook.length} match` : recipeCount(inBook.length);
  const showShelf = !wide() && !(settings.simpleMode && scopes().length <= 2);
  return {
    tab: 'books',
    html: `
      ${wide() ? `<div class="bookhead"><h1 class="title nm ${ui.folder === ALL || ui.folder == null ? '' : 'rx'}">${esc(name)}</h1><span class="dim">${esc(sub)}</span></div>` : ''}
      <div class="pages" id="tiles"><div class="content"></div></div>
      <div class="count" id="tcount"></div>
      ${showShelf ? '<hr class="rule"><div class="shelf" role="list" id="shelf"></div>' : ''}
      <div class="search">
        <input class="field" id="q" type="search" placeholder="Search ${esc(name)}" value="${esc(ui.query)}" aria-label="Search">
        ${ui.query ? btn('clear-q', 'Clear', { icon: false }) : ''}
        ${settings.simpleMode ? '' : btn('new', 'New', { g: 'plus' })}
      </div>`,
    mount(el) {
      const tiles = el.querySelector('#tiles');
      const drawTiles = () => {
        const cards = shownCards();
        const w = tiles.clientWidth;
        const h = tiles.clientHeight;
        const gap = 10;
        const cols = Math.max(1, Math.min(wide() ? 8 : 5, Math.floor(w / ((wide() ? 175 : 150) * textWidth()))));
        const tileW = (w - gap * (cols - 1)) / cols;
        // Whole rows only, as many as suit the space; each card stretches or squats a little so the rows fill it.
        let rows = Math.max(1, Math.round((h + gap) / (tileW * 0.6 + gap)));
        if ((h - gap * (rows - 1)) / rows < tileW * 0.45) rows = Math.max(1, rows - 1);
        const tileH = Math.min(tileW * 0.7, Math.max(tileW * 0.45, (h - gap * (rows - 1)) / rows));
        const per = rows * cols;
        const pages = Math.max(1, Math.ceil(cards.length / per));
        if (ui.fromEnd) { ui.tilePage = pages - 1; ui.fromEnd = false; }
        ui.tilePage = Math.min(ui.tilePage, pages - 1);
        const shown = cards.slice(ui.tilePage * per, (ui.tilePage + 1) * per);
        tiles.querySelector('.content').innerHTML = cards.length
          ? `<div class="tiles" style="grid-template-columns: repeat(${cols}, 1fr); grid-auto-rows: ${tileH}px">${shown.map((r) => {
            const t = effectiveTotal(r);
            const from = ui.folder === ALL ? box.folderName(r.folderId ?? null) : '';
            return `<button class="tile" data-act="open" data-id="${esc(r.id)}"><span class="name rx nm">${esc(r.title || 'Untitled recipe')}</span>${r.keepProgress ? `<span class="keepmark">${glyph.keep}</span>` : ''}${settings.focus ? '' : `<span class="meta rx">${[t ? formatMinutes(t) : '', from].filter(Boolean).map(esc).join(' · ')}</span>`}</button>`;
          }).join('')}</div>`
          : `<p class="dim">${ui.query ? `Nothing in ${esc(name)} matches.` : `No cards in ${esc(name)} yet.`}</p>`;
        const count = el.querySelector('#tcount');
        count.textContent = pages > 1 ? `${ui.tilePage + 1} / ${pages}${ui.tilePage === 0 ? ' · more ▶' : ''}` : '';
        count.classList.toggle('more', pages > 1 && ui.tilePage === 0);
        polish(tiles);
        return pages;
      };
      const shelf = el.querySelector('#shelf');
      const drawShelf = () => { if (shelf) { shelf.innerHTML = shelfHtml(shelf.clientWidth, sub); polish(shelf); } };
      drawShelf();
      if (shelf) swipe(shelf, (dir) => { ui.shelf = (ui.shelf ?? 0) + dir; drawShelf(); });
      let pages = drawTiles();
      const turn = (dir) => {
        const p = ui.tilePage + dir;
        if (p >= 0 && p < pages) ui.tilePage = p;
        else {
          const all = scopes();
          if (all.length > 1 && !ui.query) {
            const i = all.indexOf(ui.folder);
            setFolder(all[(i + dir + all.length) % all.length]);
            ui.fromEnd = dir < 0;
            draw();
            return;
          }
          ui.tilePage = (p + pages) % pages;
        }
        pages = drawTiles();
      };
      setPageKeys(turn);
      swipe(tiles, turn);
      new ResizeObserver(() => { pages = drawTiles(); drawShelf(); }).observe(tiles);
      const q = el.querySelector('#q');
      q.addEventListener('input', () => {
        ui.query = q.value;
        ui.tilePage = 0;
        pages = drawTiles();
        const head = el.querySelector('.bookhead .dim');
        if (head) head.textContent = ui.query ? `${shownCards().length} of ${inBook.length} match` : recipeCount(inBook.length);
      });
    },
  };
};

/**
 * The shelf: two rows of covers under the cards, the one on show filled in. Tap a cover to open
 * that book (the open one again for the list of books). When the books don't all fit, the first
 * cover turns back a shelf and the last turns on. Manage books sits just before the last.
 */
function shelfHtml(width, subtitle) {
  const all = scopes();
  const cols = Math.max(3, Math.min(7, Math.floor((width + 6) / (104 * Math.max(1, textWidth()) + 6))));
  const manage = settings.simpleMode ? 0 : 1;
  const one = all.length <= cols * 2 - manage;
  const per = one ? Math.max(1, all.length) : Math.max(1, cols * 2 - 2 - manage);
  const shelves = Math.max(1, Math.ceil(all.length / per));
  if (ui.shelf == null || ui.shelfFor !== ui.folder) { ui.shelf = Math.floor(Math.max(0, all.indexOf(ui.folder)) / per); ui.shelfFor = ui.folder; }
  ui.shelf = ((ui.shelf % shelves) + shelves) % shelves;
  const cover = (id) => {
    const open = id === ui.folder;
    return `<button class="cover ${open ? 'on' : ''}" role="listitem" data-act="${open ? 'manage' : 'book'}" data-id="${id ?? ''}"><span class="bold nm ${id === ALL || id == null ? '' : 'rx'} clamp4">${esc(bookName(id))}</span><span class="n">${esc(open ? subtitle : recipeCount(box.inBook(id).length))}</span></button>`;
  };
  const turn = (dir) => `<button class="cover turn" data-act="shelf" data-dir="${dir}"><b data-raw>${dir < 0 ? '◀' : '▶'}</b><span class="bold nm">${dir < 0 ? 'Previous shelf' : 'Next shelf'}</span><span class="n">${((ui.shelf + dir + shelves) % shelves) + 1} of ${shelves}</span></button>`;
  const items = [
    ...(one ? [] : [turn(-1)]),
    ...all.slice(ui.shelf * per, (ui.shelf + 1) * per).map(cover),
    ...(manage ? [`<button class="cover manage" data-act="manage">${glyph.pencil}<span class="bold nm">Manage books</span><span class="n">Add, rename, order</span></button>`] : []),
    ...(one ? [] : [turn(1)]),
  ];
  // The shelf turns from its two ends: gaps go mid-shelf on the last row, so the end covers stay at the ends.
  if (!one && items.length > cols) {
    const second = items.slice(cols);
    while (second.length < cols) second.splice(second.length - (manage ? 2 : 1), 0, '<span></span>');
    return `<div class="shelf-grid" style="grid-template-columns:repeat(${cols},1fr)">${[...items.slice(0, cols), ...second].join('')}</div>`;
  }
  return `<div class="shelf-grid" style="grid-template-columns:repeat(${cols},1fr)">${items.join('')}</div>`;
}

/** On a wide screen, the shelf is a list down the side: every book, paged when there are many. */
export function railBooks() {
  const all = scopes();
  return `<div class="rail-books">
    <div class="label">Books</div>
    <div class="pages" id="pg-railbooks"><div class="content">${all.map((id) => `<div class="a"><button class="rail-book ${id === ui.folder ? 'on' : ''}" data-act="book" data-id="${id ?? ''}"><span class="nm ${id === ALL || id == null ? '' : 'rx'} clamp2">${esc(bookName(id))}</span><span class="n">${box.inBook(id).length}</span></button></div>`).join('')}</div></div>
    <div class="count" data-for="pg-railbooks"></div>
    ${settings.simpleMode ? '' : `<button class="rail-book manage" data-act="manage">${glyph.pencil}<span class="nm">Manage books</span></button>`}
  </div>`;
}

actions.book = (el) => {
  setFolder(el.dataset.id === '' ? null : el.dataset.id);
  ui.tilePage = 0;
  const v = route().view;
  if (v === 'card') go('#/books'); else draw();
};
actions.shelf = (el) => { ui.shelf = (ui.shelf ?? 0) + +el.dataset.dir; draw(); };
actions.new = () => newCard();
actions.open = (el) => go(cardHash(el.dataset.id));

// ---------------------------------------------------------------- an empty box

/** An empty box: start with a cookbook, find recipes, or write one. */
function viewEmpty() {
  ui.holdAction = ['Starter books', () => go('#/starters')];
  return {
    tab: 'books',
    html: `<div class="empty narrow-col"><div class="pages"><div class="content">
      <div class="title a nm">Empty box.</div>
      <p class="dim a" style="margin:0">Your recipes as cards in books. No ads, no life stories, no scrolling. Just the card.</p>
      <div class="a">${btn('starters', 'Start with a starter book', { g: 'books', cls: 'wide-btn primary', icon: false })}</div>
      ${canFind() ? `<div class="a">${btn('tab', 'Find recipes', { g: 'find', cls: 'wide-btn', attrs: 'data-to="find"', icon: false })}</div>` : ''}
      ${settings.simpleMode ? '' : `<div class="a">${btn('new', 'Write my own', { g: 'pencil', cls: 'wide-btn', icon: false })}</div>
      <div class="a">${btn('open-file', 'Bring in a file', { g: 'share', cls: 'wide-btn', icon: false })}<div class="dim small">A backup, or recipes from Paprika or Mealie.</div></div>
      <div class="a">${btn('setup-part', 'Connect the phone app’s sync file', { cls: 'wide-btn', attrs: 'data-part="recipes"', icon: false })}</div>`}
    </div></div><div class="count"></div></div>`,
    mount(el) { paged(el, 'empty', { bottom: true }); },
  };
}
actions.starters = () => go('#/starters');

// ---------------------------------------------------------------- starter books

export async function loadStarters() {
  if (ui.starter) return ui.starter;
  ui.starter = [];
  try {
    const ids = await (await fetch('books/index.json')).json();
    ui.starter = await Promise.all(ids.map(async (file) => {
      const book = await (await fetch(`books/${file}.json`)).json();
      return { file, id: book.folders?.[0]?.id, name: book.folders?.[0]?.name || file, about: book.about || '', library: book };
    }));
    draw();
  } catch { /* offline */ }
  return ui.starter;
}

/** Ready-made books: look inside each, add the ones you want; one added already offers its newer cards. */
views.starters = () => {
  loadStarters();
  const books = ui.starter || [];
  const missing = books.filter((b) => !box.folders.some((f) => f.id === b.id));
  ui.holdAction = missing.length ? ['Add all books', () => actions['starter-all']()] : null;
  return {
    html: `<div class="narrow-col"><div class="pages"><div class="content">
      <p class="dim a" style="margin:0 0 8px">Ready-made books to start from. Tap a book to see what’s in it.</p>
      ${missing.length > 1 ? `<div class="a">${btn('starter-all', `Add all ${missing.length} books`, { g: 'plus', cls: 'wide-btn', icon: false })}</div>` : ''}
      ${books.length ? '' : '<p class="dim a">Loading…</p>'}
      <div class="starter-grid">${books.map((b) => {
        const have = box.folders.some((f) => f.id === b.id);
        const open = ui.starterOpen === b.file;
        const updates = have ? box.starterUpdates(b.library).length : 0;
        const act = updates ? btn('starter-update', `Update · ${updates}`, { cls: 'small on', attrs: `data-file="${b.file}"`, icon: false })
          : have ? '<button class="btn small" disabled>Added</button>' : btn('starter', 'Add', { g: 'plus', cls: 'small', attrs: `data-file="${b.file}"`, icon: false });
        return `<div class="starter a"><div class="bar"><button class="grow starter-name" data-act="starter-open" data-file="${b.file}"><b class="nm">${open ? '▼' : '▶'} ${esc(b.name)}</b><span class="dim small">${esc(b.about)} ${plural(b.library.recipes.length, 'card')}.</span></button>${act}</div>
          ${open ? `<hr class="rule thin"><ul class="plain">${b.library.recipes.map((r) => `<li class="rx">· ${esc(r.title)}</li>`).join('')}</ul>` : ''}</div>`;
      }).join('')}</div>
    </div></div><div class="count"></div>${backBar('Starter books')}</div>`,
    mount(el) { paged(el, 'starters'); },
  };
};
const starterBook = (file) => (ui.starter || []).find((b) => b.file === file);
const importResult = (r) => [r.added && `added ${r.added}`, r.updated && `updated ${r.updated}`, r.had && `already had ${r.had}`].filter(Boolean).join(', ') || 'nothing new';
export { importResult };
actions.starter = (el) => {
  const b = starterBook(el.dataset.file);
  if (!b) return;
  const res = box.importLibrary(b.library);
  notice(`${b.name}: ${importResult(res)}.`);
};
actions['starter-all'] = () => {
  const missing = (ui.starter || []).filter((b) => !box.folders.some((f) => f.id === b.id));
  for (const b of missing) box.importLibrary(b.library);
  notice(`Added ${plural(missing.length, 'book')}.`);
};
actions['starter-update'] = (el) => {
  const b = starterBook(el.dataset.file);
  const n = box.applyStarterUpdates(b.library);
  notice(`${b.name}: updated ${plural(n, 'card')}. Cards you’ve changed were left alone.`);
};
actions['starter-open'] = (el) => { ui.starterOpen = ui.starterOpen === el.dataset.file ? null : el.dataset.file; draw(); };

// ---------------------------------------------------------------- managing books

/** Every book, to find and open one. Outside simple mode also: add, rename, reorder, share, print and delete. */
views.manage = () => {
  const needle = fold((ui.bookFind || '').trim());
  const shown = box.folders.filter((f) => !needle || fold(f.name).includes(needle));
  const row = (id, name, count, controls = '') => `<div class="bookrow a ${ui.folder === id ? 'on' : ''}">
    <button class="grow open" data-act="manage-open" data-id="${id ?? ''}"><b class="nm ${id === ALL || id == null ? '' : 'rx'}">${esc(name)}</b><span class="dim small">${recipeCount(count)}${ui.folder === id ? ' · open now' : ''}</span></button>${controls}</div>`;
  const controls = (f, at) => {
    if (settings.simpleMode) return '';
    if (ui.renaming === f.id) return '';
    return `<span class="row-btns">${needle ? '' : `${btn('book-move', '▲', { cls: 'small', attrs: `data-id="${f.id}" data-dir="-1"`, disabled: at === 0, icon: false })}${btn('book-move', '▼', { cls: 'small', attrs: `data-id="${f.id}" data-dir="1"`, disabled: at === box.folders.length - 1, icon: false })}`}
      ${btn('book-rename', 'Rename', { g: 'pencil', cls: 'small', attrs: `data-id="${f.id}"`, icon: true })}${btn('book-share', 'Share book', { g: 'share', cls: 'small', attrs: `data-id="${f.id}"`, icon: true })}
      ${btn('book-order', f.ordered ? 'In order' : 'A–Z', { cls: 'small', attrs: `data-id="${f.id}"`, icon: false })}${btn('book-print', 'Print book', { g: 'print', cls: 'small', attrs: `data-id="${f.id}"`, icon: true })}
      ${btn('book-delete', 'Delete', { cls: 'small', attrs: `data-id="${f.id}"`, icon: false })}</span>`;
  };
  const rows = shown.map((f) => (ui.renaming === f.id
    ? `<form class="search a" data-form="rename" data-id="${f.id}"><input class="field" name="name" value="${esc(f.name)}" autofocus>${btn('rename-save', 'Save', { cls: 'primary', icon: false })}${btn('rename-cancel', 'Cancel', { icon: false })}</form>`
    : row(f.id, f.name, box.recipes.filter((r) => r.folderId === f.id).length, controls(f, box.folders.indexOf(f))))).join('');
  const loose = box.recipes.filter((r) => !r.folderId).length;
  return {
    html: `<div class="narrow-col"><div class="pages"><div class="content">
      ${settings.simpleMode ? '' : `<p class="dim small a" style="margin:0 0 8px">One home book per card. Move cards from their Info tab.</p>`}
      ${needle ? '' : row(ALL, 'All books', box.inBook(ALL).length)}
      ${rows}
      ${!needle && loose && box.folders.length ? row(null, 'Loose cards', loose) : ''}
      ${needle && !shown.length ? `<p class="dim a">No book called “${esc(ui.bookFind.trim())}”.</p>` : ''}
    </div></div><div class="count"></div>
    <div class="search"><input class="field" id="book-find" placeholder="Find a book" value="${esc(ui.bookFind || '')}" autocomplete="off">${ui.bookFind ? btn('book-find-clear', 'Clear', { icon: false }) : ''}</div>
    ${settings.simpleMode ? '' : `<form class="search" data-form="new-book"><input class="field" name="name" placeholder="New book" autocomplete="off">${btn('new-book', 'Add', { g: 'plus', cls: 'primary', icon: false })}</form>`}
    ${backBar('Books')}</div>`,
    mount(el) {
      paged(el, `manage:${needle}`);
      const f = el.querySelector('#book-find');
      f.addEventListener('input', () => { ui.bookFind = f.value; clearTimeout(ui.bookSoon); ui.bookSoon = setTimeout(() => { draw(); const g = document.getElementById('book-find'); g?.focus(); g?.setSelectionRange(g.value.length, g.value.length); }, 200); });
    },
  };
};
actions['manage-open'] = (el) => { setFolder(el.dataset.id === '' ? null : el.dataset.id); ui.query = ''; ui.bookFind = ''; go('#/books'); };
actions['book-move'] = (el) => box.moveBook(el.dataset.id, +el.dataset.dir);
actions['book-rename'] = (el) => { ui.renaming = el.dataset.id; draw(); };
actions['rename-cancel'] = () => { ui.renaming = null; draw(); };
actions['rename-save'] = (el) => el.closest('form').requestSubmit();
actions['book-share'] = (el) => { const f = box.folders.find((x) => x.id === el.dataset.id); downloadText(box.bookText(f.id), `${fileName(f.name)}.book.json`); };
actions['book-order'] = (el) => { const f = box.folders.find((x) => x.id === el.dataset.id); box.setBookOrdered(f.id, !f.ordered); };
actions['book-print'] = (el) => {
  const f = box.folders.find((x) => x.id === el.dataset.id);
  ui.print = { items: box.inBook(f.id).map((r) => ({ recipe: r, factor: 1, units: settings.units })), title: f.name, extra: null };
  go('#/print');
};
actions['book-delete'] = (el) => { ui.deleting = { id: el.dataset.id, mode: '', target: null, each: new Map(), confirm: false }; go(`#/deletebook/${encodeURIComponent(el.dataset.id)}`); };
actions['book-find-clear'] = () => { ui.bookFind = ''; draw(); };
actions['new-book'] = (el) => el.closest('form').requestSubmit();

// ---------------------------------------------------------------- deleting a book

/** Where a deleted book's cards go: loose, all to another book, deleted with it, or each its own way. Nothing happens until the last tap. */
views.deletebook = (id) => {
  const book = box.folders.find((f) => f.id === id);
  if (!book) return views.manage();
  const d = ui.deleting?.id === id ? ui.deleting : (ui.deleting = { id, mode: '', target: null, each: new Map(), confirm: false });
  const cards = box.sorted().filter((r) => r.folderId === id);
  const others = box.folders.filter((f) => f.id !== id && f.id !== DEV_BOOK);
  if (!cards.length) d.mode = 'loose';
  if (d.target == null) d.target = others[0]?.id ?? null;
  const dest = (cid) => (d.mode === 'move' ? d.target : d.mode === 'drop' ? 'DROP' : d.mode === 'each' ? (d.each.has(cid) ? d.each.get(cid) : null) : null);
  const dropping = cards.filter((c) => dest(c.id) === 'DROP').length;
  const ready = d.mode && (d.mode !== 'move' || d.target);
  const opt = (mode, title, about) => `<button class="choice a ${d.mode === mode ? 'on' : ''}" data-act="del-mode" data-v="${mode}"><b>${d.mode === mode ? '●' : '○'} ${esc(title)}</b><span class="about">${esc(about)}</span></button>`;
  const main = !ready ? 'Choose where the cards go' : dropping && !d.confirm ? `Delete the book and ${recipeCount(dropping)}` : dropping ? `Tap again: ${recipeCount(dropping)} will be gone` : 'Delete the book';
  return {
    html: `<div class="narrow-col"><div class="pages"><div class="content">
      <h1 class="title a">Delete “<span class="rx">${esc(book.name)}</span>”</h1>
      <p class="dim a">${cards.length ? `It has ${recipeCount(cards.length)}. Where should they go?` : 'It’s empty.'}</p>
      ${cards.length ? `${opt('loose', 'Make them loose cards', 'They stay in your box, in no book.')}
        ${others.length ? opt('move', 'Move them all to another book', 'Pick the book below.') : ''}
        ${d.mode === 'move' ? `<div class="flow a" style="margin:0 0 8px 12px">${others.map((f) => btn('del-target', f.name, { cls: 'small', on: d.target === f.id, attrs: `data-to="${f.id}"`, icon: false })).join('')}</div>` : ''}
        ${opt('each', 'Choose for each card', 'Loose, another book, or delete, card by card.')}
        ${d.mode === 'each' ? cards.map((c) => `<div class="a" style="margin:6px 0 6px 12px"><b class="rx">${esc(c.title)}</b><div class="flow">${btn('del-each', 'Loose', { cls: 'small', on: dest(c.id) == null, attrs: `data-card="${c.id}" data-to=""`, icon: false })}${others.map((f) => btn('del-each', f.name, { cls: 'small', on: dest(c.id) === f.id, attrs: `data-card="${c.id}" data-to="${f.id}"`, icon: false })).join('')}${btn('del-each', 'Delete', { cls: 'small', on: dest(c.id) === 'DROP', attrs: `data-card="${c.id}" data-to="DROP"`, icon: false })}</div><hr class="rule thin"></div>`).join('') : ''}
        ${opt('drop', 'Delete them too', 'The cards are gone for good (on synced devices too).')}` : ''}
    </div></div><div class="count"></div>
    <div class="row-btns">${btn('back', 'Cancel', { cls: 'big', icon: false })}<button class="btn big grow ${ready ? 'primary' : ''}" data-act="del-go" ${ready ? '' : 'disabled'}>${esc(main)}</button></div>
    ${backBar('Delete book')}</div>`,
    mount(el) { paged(el, `delbook:${id}:${d.mode}`); },
  };
};
actions['del-mode'] = (el) => { ui.deleting.mode = el.dataset.v; ui.deleting.confirm = false; draw(); };
actions['del-target'] = (el) => { ui.deleting.target = el.dataset.to; draw(); };
actions['del-each'] = (el) => { ui.deleting.each.set(el.dataset.card, el.dataset.to === '' ? null : el.dataset.to); ui.deleting.confirm = false; draw(); };
actions['del-go'] = () => {
  const d = ui.deleting;
  const book = box.folders.find((f) => f.id === d.id);
  const cards = box.recipes.filter((r) => r.folderId === d.id);
  const dest = (cid) => (d.mode === 'move' ? d.target : d.mode === 'drop' ? 'DROP' : d.mode === 'each' ? (d.each.has(cid) ? d.each.get(cid) : null) : null);
  const dropping = cards.filter((c) => dest(c.id) === 'DROP');
  // Deleting cards takes a second tap; moving them doesn't.
  if (dropping.length && !d.confirm) { d.confirm = true; draw(); return; }
  const moves = new Map(cards.filter((c) => dest(c.id) !== 'DROP').map((c) => [c.id, dest(c.id)]));
  box.deleteBook(d.id, moves, new Set(dropping.map((c) => c.id)));
  if (ui.folder === d.id) setFolder(ALL);
  const loose = [...moves.values()].filter((v) => v == null).length;
  const to = new Map();
  for (const v of moves.values()) if (v) to.set(v, (to.get(v) || 0) + 1);
  ui.deleting = null;
  back();
  notice([`Deleted “${book.name}”`, loose && `${loose} loose`, ...[...to].map(([f, n]) => `${n} to ${box.folderName(f)}`), dropping.length && `${dropping.length} deleted`].filter(Boolean).join(' · ') + '.');
};

export { matches };

forms.rename = (form, data) => { box.renameBook(form.dataset.id, String(data.get('name') || '')); ui.renaming = null; draw(); };
forms['new-book'] = (form, data) => {
  const name = String(data.get('name') || '').trim();
  if (!name) return;
  box.addBook(name);
  notice(`Added the book “${name}”.`);
};
