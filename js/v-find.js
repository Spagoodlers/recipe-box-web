// Find: search the recipe sites, then preview a recipe and name and file it. Sites that let a web
// page read them are searched here; the rest open in a new tab, and the "Send to Recipe Box"
// bookmark brings a recipe back from there (or any page). Also: a pasted link, recipe files from
// other apps, and (developer mode) an AI chat's card.

import { box, settings, ui, views, actions, forms, esc, plural, btn, glyph, notice, go, back, swap, route, paged, wide, draw, canFind, saveSettings, backBar, cardHash, applyBoxConfig, setFolder, DEV_BOOK } from './core.js';
import { sources, fetchRecipe, readRecipeFile, readAiCard, AI_PROMPT, bookmarklet, fromSent } from './importer.js';
import { hostOf } from './box.js';
import { linkCard } from './ops.js';
import { cardView } from './v-card.js';
import { importResult } from './v-books.js';

const on = () => sources.filter((s) => !settings.disabledSources.includes(s.id));
const appUrl = () => location.href.split('#')[0];
export const bookmarkHtml = () => `<a class="btn small bookmark" href="${esc(bookmarklet(appUrl()))}" data-raw title="Drag me to your bookmarks bar" onclick="event.preventDefault();">${glyph.share}<span>Send to Recipe Box</span></a>`;

// ---------------------------------------------------------------- searching

export function search() {
  const f = ui.find;
  const q = f.query.trim();
  if (!q) return;
  f.last = q;
  f.expanded = new Set();
  const run = ++f.run || (f.run = 1);
  f.results = on().map((s) => ({ source: s, status: s.search ? 'searching' : 'elsewhere', items: [] }));
  draw();
  f.results.forEach((row) => {
    if (!row.source.search) return;
    row.source.search(q).then((items) => {
      if (f.run !== run) return;
      row.items = items.filter((x) => x.title && x.url);
      row.status = 'done';
      // Searching for a card's line: open the first site with something, so there's a recipe to pick straight away.
      if (ui.pendingLink && !f.expanded.size && row.items.length) f.expanded.add(row.source.id);
      draw();
    }).catch(() => {
      if (f.run !== run) return;
      row.status = 'failed';
      draw();
    });
  });
}

function resultRows() {
  const f = ui.find;
  if (f.mixed) {
    // Round the sites: each one's first, then each one's second… up to five apiece.
    const lists = f.results.filter((r) => r.status === 'done').map((r) => r.items.slice(0, 5).map((it) => [it, r.source]));
    const rows = [];
    for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) rows.push(hit(l[i][0], l[i][1].name));
    if (rows.length) return rows.join('') + f.results.filter((r) => r.status !== 'done' || !r.items.length).map(header).join('');
  }
  return f.results.map((r) => header(r) + (f.expanded.has(r.source.id) ? r.items.map((it) => hit(it)).join('') : '')).join('');
}

/** A site's row: tap to open or close its list (or the site itself, if it can't be searched from here). */
function header(r) {
  const f = ui.find;
  const n = r.items.length;
  const open = f.expanded.has(r.source.id);
  const browse = r.source.browseUrl(f.last);
  const status = { searching: 'searching…', done: n ? `${n} found` : 'none', failed: browse ? 'open on the site ↗' : 'no answer', elsewhere: browse ? 'open on the site ↗' : '' }[r.status];
  const outward = (r.status === 'failed' || r.status === 'elsewhere') && browse;
  return outward
    ? `<a class="srchead a" href="${esc(browse)}" target="_blank" rel="noopener"><span class="arrow"></span><b class="grow nm">${esc(r.source.name)}</b><span class="small">${status}</span></a>`
    : `<button class="srchead a ${open ? 'on' : ''}" data-act="find-toggle" data-id="${r.source.id}" ${n ? '' : 'disabled'}><span class="arrow" data-raw>${n ? (open ? '▼' : '▶') : ''}</span><b class="grow nm">${esc(r.source.name)}</b><span class="small">${status}</span></button>`;
}

function hit(it, site = null) {
  const picked = ui.importing?.url === it.url;
  return `<button class="hit a ${picked ? 'on' : ''}" data-act="find-pick" data-url="${esc(it.url)}" data-src="${esc(site || '')}"><b class="rx nm">${esc(it.title)}</b>${site ? `<span class="dim small nm">${esc(site)}</span>` : ''}${it.blurb ? `<span class="dim small rx clamp2">${esc(it.blurb)}</span>` : ''}</button>`;
}

const ideas = ['Soup', 'Chicken', 'Pasta', 'Banana bread', 'Cookies', 'Curry', 'Salad', 'Pancakes'];

views.find = () => {
  if (!canFind()) return views.books();
  const f = ui.find;
  const simple = settings.simpleMode;
  const searchable = on().filter((s) => s.search).length;
  const elsewhere = on().length - searchable;
  const linking = ui.pendingLink;
  const start = `<div class="a">${linking ? `<div class="label">Finding a recipe for</div><p class="bold rx" style="margin:0 0 4px;font-size:1.15em">${esc(linking.line)}</p><p class="dim small">Pick one, check it, then Save: it’s linked to this line.</p>` : `<p class="dim" style="margin:0">${simple ? 'Tap a dish below, or type one at the bottom.' : `Searches ${plural(searchable, 'recipe site')} here${elsewhere ? `; ${elsewhere} more open on their own site` : ''}. Or paste a link to any recipe page.`}</p>`}</div>
    <div class="label a">Try</div><div class="flow a">${ideas.map((i) => btn('find-idea', i, { cls: 'small', attrs: `data-q="${esc(i.toLowerCase())}"`, icon: false })).join('')}</div>
    ${simple ? '' : `<div class="a bookmark-help"><div class="label">From any recipe page</div><p class="dim small" style="margin:0 0 6px">Drag this to your bookmarks bar. On a recipe page anywhere, click it and the recipe comes here to name and file.</p>${bookmarkHtml()}</div>`}`;
  const results = f.results.length ? resultRows() : start;
  const preview = wide() && ui.importing && !ui.importing.setup ? previewPane() : null;
  const controls = `
    ${ui.findSites ? `<div class="flow">${sources.map((s) => btn('find-site', s.name, { cls: 'small', on: !settings.disabledSources.includes(s.id), attrs: `data-id="${s.id}"`, icon: false })).join('')}</div><p class="dim small" style="margin:0">Sites marked ↗ can’t be read by a web page, so they open on their own site.</p>` : ''}
    ${ui.findLink ? `<form class="search" data-form="find-link"><input class="field" name="url" placeholder="https://… any recipe page" autocomplete="off" autofocus>${btn('find-link-go', 'Import', { cls: 'primary', icon: false })}</form>` : ''}
    ${settings.aiCards && !simple ? `<div class="row-btns">${btn('ai-copy', 'Copy AI prompt', { g: 'spark', cls: 'grow', icon: false })}${btn('ai-paste', 'Paste AI card', { g: 'spark', cls: 'grow primary', icon: false })}</div>` : ''}
    <div class="row-btns">
      ${simple ? '' : btn('find-sites', `Sites: ${on().length}`, { cls: 'small grow', on: ui.findSites, icon: false })}
      ${f.results.length ? btn('find-mixed', f.mixed ? 'Mixed' : 'By site', { cls: 'small grow', icon: false }) : ''}
      ${simple ? '' : btn('find-showlink', 'Paste link', { g: 'clip', cls: 'small grow', on: ui.findLink })}
      ${simple || linking ? '' : btn('find-write', 'Write my own', { g: 'pencil', cls: 'small grow' })}
    </div>
    <form class="search" data-form="find"><input class="field" id="find-q" name="q" placeholder="Search recipe sites" value="${esc(f.query)}" autocomplete="off" aria-label="Search recipe sites">${btn('find-go', 'Search', { g: 'find', cls: 'primary', icon: false })}</form>
    ${linking ? backBar('Find a recipe', 'find-cancel-link') : ''}`;
  return {
    tab: 'find',
    html: preview
      ? `<div class="twopane find-two"><div class="pane"><div class="pages" id="pg-find"><div class="content">${results}</div></div><div class="count" data-for="pg-find"></div>${controls}</div><div class="pane">${preview.html}</div></div>`
      : `<div class="pages" id="pg-find"><div class="content ${wide() ? 'find-grid' : ''}">${results}</div></div><div class="count" data-for="pg-find"></div>${controls}`,
    mount(el) {
      paged(el, `find:${f.last}:${f.mixed}:${[...f.expanded].join()}`, { viewport: el.querySelector('#pg-find'), keys: !preview });
      preview?.mount(el);
      el.querySelector('#find-q')?.addEventListener('input', (e) => { f.query = e.target.value; });
    },
  };
};

actions['find-idea'] = (el) => { ui.find.query = el.dataset.q; search(); };
actions['find-search'] = () => search();
actions['find-go'] = (el) => el.closest('form').requestSubmit();
forms.find = (form, data) => { ui.find.query = String(data.get('q') || ''); search(); };
actions['find-toggle'] = (el) => { const x = ui.find.expanded; if (x.has(el.dataset.id)) x.delete(el.dataset.id); else x.add(el.dataset.id); draw(); };
actions['find-mixed'] = () => { ui.find.mixed = !ui.find.mixed; draw(); };
actions['find-sites'] = () => { ui.findSites = !ui.findSites; draw(); };
actions['find-site'] = (el) => {
  const id = el.dataset.id;
  settings.disabledSources = settings.disabledSources.includes(id) ? settings.disabledSources.filter((x) => x !== id) : [...settings.disabledSources, id];
  saveSettings();
  draw();
};
actions['find-showlink'] = () => { ui.findLink = !ui.findLink; draw(); };
actions['find-link-go'] = (el) => el.closest('form').requestSubmit();
forms['find-link'] = (form, data) => {
  const url = /https?:\/\/\S+/.exec(String(data.get('url') || ''))?.[0];
  if (!url) return;
  ui.findLink = false;
  openImport(url, null);
};
actions['find-write'] = () => actions.new();
actions['find-cancel-link'] = () => { ui.pendingLink = null; back(); };
actions['find-pick'] = (el) => {
  const url = el.dataset.url;
  const row = ui.find.results.find((r) => r.items.some((it) => it.url === url));
  const it = row?.items.find((x) => x.url === url);
  if (wide()) { ui.importing = { url, recipe: it?.recipe || null, error: null, setup: false }; loadImport(); draw(); } else openImport(url, it?.recipe || null);
};

// ---------------------------------------------------------------- the preview, then name and file it

export function openImport(url, recipe) {
  ui.importing = { url, recipe, error: null, setup: false };
  loadImport();
  go('#/import');
}
function loadImport() {
  const im = ui.importing;
  if (im.recipe || im.loading) return;
  im.loading = true;
  fetchRecipe(im.url, { proxy: settings.proxy }).then((r) => { if (ui.importing === im) { im.recipe = r; im.loading = false; draw(); } })
    .catch((e) => { if (ui.importing === im) { im.error = e.message || 'Couldn’t read that page.'; im.loading = false; draw(); } });
}

function previewPane() {
  const im = ui.importing;
  if (im.error) {
    return { html: `<div class="box-panel import-err"><b>${esc(im.error)}</b><div class="dim small" data-raw style="word-break:break-all">${esc(im.url)}</div>
      <p class="small" style="margin:6px 0">Open the page, then click <b>Send to Recipe Box</b> in your bookmarks bar to bring the recipe here.</p>
      <div class="row-btns"><a class="btn" href="${esc(im.url)}" target="_blank" rel="noopener">Open the page ↗</a>${bookmarkHtml()}</div></div>`, mount() {} };
  }
  if (!im.recipe) return { html: `<div class="a"><b>Reading recipe…</b><p class="dim">Some sites take a few seconds.</p></div>`, mount() {} };
  ui.preview = im.recipe;
  const existing = box.findByUrl(im.recipe.sourceUrl);
  const c = cardView(im.recipe, { mode: 'preview', width: wide() ? (window.innerWidth - 250) / 2 - 40 : window.innerWidth - 40 });
  return {
    html: `<div class="previewpane">${existing ? `<div class="bar"><b class="grow">Already saved as “<span class="rx">${esc(existing.title)}</span>”.</b>${btn('open-card', 'Open it', { cls: 'small', attrs: `data-to="${esc(existing.id)}"`, icon: false })}</div>` : ''}
      ${c.html}<button class="btn primary big wide-btn" data-act="import-setup">Name &amp; file ▶</button></div>`,
    mount: c.mount,
  };
}

views.import = () => {
  const im = ui.importing;
  if (!im) return views.find();
  loadImport();
  if (im.setup && im.recipe) return importSetup();
  const p = previewPane();
  return { tab: 'find', html: `${p.html}${backBar('Preview', 'import-back')}`, mount: p.mount };
};
actions['import-back'] = () => { ui.importing = null; back(); };
actions['import-setup'] = () => {
  const im = ui.importing;
  im.setup = true;
  im.title = im.recipe.title;
  im.keep = false;
  im.chosen = new Set((im.recipe.subRecipes || []).filter((s) => !box.resolve(s) && s.kind === 'i').map((s) => s.url));
  if (route().view !== 'import') go('#/import'); else draw();
};

/** Last stop before a card goes in the box: its name, its book, its linked sub-recipes. */
function importSetup() {
  const im = ui.importing;
  const r = im.recipe;
  const folderId = box.folders.some((f) => f.id === ui.importFolder) ? ui.importFolder : null;
  const existing = box.findByUrl(r.sourceUrl);
  const mentioned = box.recipes.filter((o) => o.title.length >= 5 && r.ingredients.some((l) => l.toLowerCase().includes(o.title.toLowerCase())));
  return {
    tab: 'find',
    html: `<div class="narrow-col"><div class="pages"><div class="content form">
      <div class="a"><label for="imp-title">Name</label><input class="field" id="imp-title" value="${esc(im.title)}"></div>
      <p class="dim small a" style="margin:0">Originally “<span class="rx">${esc(r.title)}</span>” · ${esc(r.sourceName || hostOf(r.sourceUrl))}</p>
      <div class="label a">Book</div>
      <div class="flow a">${btn('imp-book', 'Loose cards', { cls: 'small', on: folderId == null, attrs: 'data-to=""', icon: false })}${box.folders.filter((f) => f.id !== DEV_BOOK).map((f) => btn('imp-book', f.name, { cls: 'small', on: folderId === f.id, attrs: `data-to="${esc(f.id)}"`, icon: false })).join('')}</div>
      <form class="search a" data-form="imp-newbook"><input class="field" name="name" placeholder="New book" autocomplete="off">${btn('imp-newbook-go', 'Add', { icon: false })}</form>
      <div class="label a">While cooking</div>
      <div class="a">${btn('imp-keep', `Remember progress: ${im.keep ? 'on' : 'off'}`, { cls: 'small', on: im.keep, icon: false })}<div class="dim small">Keeps your place until cleared (it’s on the Open tab).</div></div>
      ${(r.subRecipes || []).length ? `<div class="label a">Sub-recipes</div>${r.subRecipes.map((s) => {
        const have = box.resolve(s);
        const chosen = im.chosen.has(s.url);
        return `<div class="box-panel a bar"><span class="grow"><b class="rx">${esc(s.name)}</b><span class="dim small" style="display:block">${have ? `Saved as “${esc(have.title)}”. Linked.` : `From ${s.kind === 'i' ? 'ingredients' : 'method'} · ${esc(hostOf(s.url))}`}</span></span>${have ? '' : btn('imp-sub', chosen ? 'Import too' : 'Skip', { cls: 'small', on: chosen, attrs: `data-url="${esc(s.url)}"`, icon: false })}</div>`;
      }).join('')}<p class="dim small a">Skipped ones stay as links.</p>` : ''}
      ${mentioned.length ? `<div class="label a">Uses your cards</div>${mentioned.map((m) => `<div class="a rx">→ ${esc(m.title)}</div>`).join('')}` : ''}
      ${existing ? `<div class="label a">Heads up</div><p class="a">Already saved as “<span class="rx">${esc(existing.title)}</span>”. This makes a copy.</p>` : ''}
    </div></div><div class="count"></div>
    <button class="btn big primary wide-btn" data-act="imp-save">Save</button>
    ${backBar('Name & file it', 'imp-unsetup')}</div>`,
    mount(el) {
      paged(el, 'import-setup');
      el.querySelector('#imp-title').addEventListener('input', (e) => { im.title = e.target.value; });
    },
  };
}
actions['imp-book'] = (el) => { ui.importFolder = el.dataset.to || null; draw(); };
actions['imp-newbook-go'] = (el) => el.closest('form').requestSubmit();
forms['imp-newbook'] = (form, data) => { const n = String(data.get('name') || '').trim(); if (n) { ui.importFolder = box.addBook(n); draw(); } };
actions['imp-keep'] = () => { ui.importing.keep = !ui.importing.keep; draw(); };
actions['imp-sub'] = (el) => { const c = ui.importing.chosen; if (c.has(el.dataset.url)) c.delete(el.dataset.url); else c.add(el.dataset.url); draw(); };
actions['imp-unsetup'] = () => { ui.importing.setup = false; draw(); };
actions['imp-save'] = () => {
  const im = ui.importing;
  const r = im.recipe;
  const folderId = box.folders.some((f) => f.id === ui.importFolder) ? ui.importFolder : null;
  const now = Date.now();
  const saved = { ...r, title: im.title.trim() || r.title, folderId, keepProgress: im.keep, created: now, updated: now };
  box.saveRecipe(saved);
  importSubRecipes((r.subRecipes || []).filter((s) => im.chosen.has(s.url)), folderId);
  ui.importing = null;
  ui.preview = null;
  // Found for a line on another card: linked there, and back to that card.
  const p = ui.pendingLink;
  if (p) {
    ui.pendingLink = null;
    const to = box.find(p.recipeId);
    if (to) {
      linkCard(to, p.kind, p.index, box.find(saved.id));
      swap(cardHash(to.id));
      notice(`Saved “${saved.title}” and linked it to “${p.line}”.`);
      return;
    }
  }
  swap(cardHash(saved.id));
};

/** Fetches and saves linked sub-recipes in the background; their cards link up by their pages. */
async function importSubRecipes(subs, folderId) {
  if (!subs.length) return;
  const names = [];
  const failed = [];
  for (const s of subs) {
    if (!s.url || box.resolve(s)) continue;
    try {
      const r = await fetchRecipe(s.url, { proxy: settings.proxy });
      const now = Date.now();
      box.saveRecipe({ ...r, folderId, created: now, updated: now });
      names.push(r.title);
    } catch { failed.push(s.name); }
  }
  const said = [names.length && `Also saved: ${names.join(', ')}.`, failed.length && `Couldn’t read: ${failed.join(', ')}.`].filter(Boolean).join(' ');
  if (said) notice(said);
}

// ---------------------------------------------------------------- the bookmark brings a recipe

views.take = (data) => {
  const r = fromSent(data || '');
  if (!r) { setTimeout(() => notice('No recipe came with that link.'), 0); return views.find(); }
  ui.importing = { url: r.sourceUrl, recipe: r, error: null, setup: false };
  history.replaceState(null, '', '#/import');
  return views.import();
};

// ---------------------------------------------------------------- recipe files from other apps

/** Picks a recipe file and asks how its recipes should come in. */
export function openFile() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,.paprikarecipes,.paprikarecipe,.zip,.gz,application/json' });
  input.addEventListener('change', () => { if (input.files?.[0]) takeFile(input.files[0]); });
  input.click();
}

export async function takeFile(file) {
  try {
    const got = await readRecipeFile(new Uint8Array(await file.arrayBuffer()));
    const name = file.name.replace(/\.[^.]+$/, '').replace(/\.recipebox$|\.book$/, '').replace(/[-_]+/g, ' ').trim();
    ui.importFile = { ...got, fileName: file.name, name: name.charAt(0).toUpperCase() + name.slice(1) || 'Imported', useSettings: false };
    go('#/importfile');
  } catch {
    notice(`No recipes in ${file.name}.`);
  }
}

/** A picked file: add its recipes to the box, or make them a new book. */
views.importfile = () => {
  const f = ui.importFile;
  if (!f) return views.books();
  const lib = f.library;
  return {
    html: `<div class="narrow-col"><div class="pages"><div class="content">
      <h1 class="title a">${plural(lib.recipes.length, 'recipe')} · ${esc(f.format)}</h1>
      <div class="a">${lib.recipes.slice(0, 12).map((r) => `<div class="dim rx">${esc(r.title)}</div>`).join('')}${lib.recipes.length > 12 ? `<div class="dim">…and ${lib.recipes.length - 12} more</div>` : ''}</div>
      ${f.config ? `${toggleRow()}<p class="dim small a">Modes, units, casing and sites. Text size and colours stay as they are.</p>` : ''}
      <div class="a form"><label for="if-name">New book name</label><input class="field" id="if-name" value="${esc(f.name)}"></div>
      <div class="a">${btn('if-asbook', 'Import as a new book', { g: 'books', cls: 'wide-btn primary', icon: false })}</div>
      <div class="a">${btn('if-add', lib.folders.length ? 'Add, keeping its books' : 'Add as loose cards', { cls: 'wide-btn', icon: false })}</div>
      <p class="dim small a">Recipes you already have are skipped.</p>
    </div></div><div class="count"></div>${backBar('Import')}</div>`,
    mount(el) { paged(el, 'importfile'); el.querySelector('#if-name').addEventListener('input', (e) => { f.name = e.target.value; }); },
  };
};
function toggleRow() {
  const on2 = ui.importFile.useSettings;
  return `<button class="toggle a" role="switch" aria-checked="${on2}" data-act="if-settings"><span class="what"><b>Also use this backup’s settings</b></span><span class="sw ${on2 ? 'on' : ''}">${on2 ? 'ON' : 'OFF'}</span></button>`;
}
actions['if-settings'] = () => { ui.importFile.useSettings = !ui.importFile.useSettings; draw(); };
function finishFile(asBook) {
  const f = ui.importFile;
  const res = box.importLibrary(f.library, asBook);
  if (f.useSettings && f.config) applyBoxConfig(f.config);
  ui.importFile = null;
  const msg = importResult(res);
  if (asBook) { const b = box.folders.find((x) => x.name.toLowerCase().startsWith(asBook.trim().toLowerCase())); if (b) setFolder(b.id); }
  swap('#/books');
  notice(`${msg.charAt(0).toUpperCase()}${msg.slice(1)}.${f.useSettings && f.config ? ' Settings applied.' : ''}`);
}
actions['if-asbook'] = () => { if (ui.importFile.name.trim()) finishFile(ui.importFile.name); };
actions['if-add'] = () => finishFile(null);
actions['open-file'] = () => openFile();

// ---------------------------------------------------------------- an AI chat's card (developer mode)

actions['ai-copy'] = async () => {
  try { await navigator.clipboard.writeText(AI_PROMPT); notice('Prompt copied. Paste it into any AI chat, add your recipe in your own words, then copy the reply.'); } catch { notice('The browser didn’t allow copying.'); }
};
actions['ai-paste'] = async () => {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch { text = prompt('Paste the AI’s whole reply here') || ''; }
  try {
    const lib = await readAiCard(text);
    if (lib.recipes.length === 1) {
      const r = lib.recipes[0];
      ui.importing = { url: '', recipe: { ...r, sourceName: r.sourceName || 'AI card' }, error: null, setup: false };
      go('#/import');
    } else {
      ui.importFile = { library: lib, format: 'AI card', config: null, fileName: 'AI cards', name: 'AI cards', useSettings: false };
      go('#/importfile');
    }
  } catch (e) {
    notice(e.message || 'No card on the clipboard. Copy the AI’s whole reply first.');
  }
};

export { search as findSearch };
