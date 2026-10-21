// Recipe Box on the web: the phone app's books, cards, cook mode, list and print, reading and
// writing the same sync file. Screens are drawn from the box and redrawn when it changes.

import { Box, ALL, parseBox, boxText } from './box.js';
import { Sync } from './sync.js';
import { Pager, swipe } from './paging.js';
import { printHtml, printDefaults, copyHtml } from './print.js';
import { scale, convert, convertTemps, ingredientsInStep, formatMinutes, stepTimers, matches, unitLabel, formatAmount, fold } from './units.js';
import { palette, palettes, paletteGroups, paletteVars, colourOf, highlight, applyCase, casings, toUs, defaultSpelling } from './look.js';

const VERSION = '0.2.0';
const KO_FI = 'https://ko-fi.com/spagoodlers';

// ---------------------------------------------------------------- settings (this browser only)

const region = (navigator.language || 'en-US').split('-')[1]?.toUpperCase();
const usCustomary = ['US', 'LR', 'MM', 'PR', 'GU', 'VI', 'AS', 'MP'];
const stored = (() => { try { return JSON.parse(localStorage.getItem('recipebox.settings')) || {}; } catch { return {}; } })();
const box = new Box();
const settings = {
  textScale: 1.15, typeface: 'Sans', theme: 'system', roomy: false, big: false,
  palette: 'Ink', accent: 'Full', highContrast: false, syntax: false, casing: 'AsWritten', spelling: defaultSpelling(region),
  focus: false, iconMode: false, controlsTop: false,
  units: usCustomary.includes(region) ? 'US' : 'Metric', readAloud: false, keepAwake: true, amountsInMethod: true,
  mode: 'Home', simple: false, simpleFor: 'Plain', simpleList: true, beforeSimple: null,
  // Someone who already has recipes has no need of the first-run questions.
  welcomed: box.recipes.length > 0,
  ...stored,
};
settings.print = { ...printDefaults, ...(stored.print || {}) };

function saveSettings() {
  try { localStorage.setItem('recipebox.settings', JSON.stringify(settings)); } catch { /* ignore */ }
  applySettings();
}

const typefaces = {
  Sans: { css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", about: 'Your device’s own.', width: 1 },
  Serif: { css: "Georgia, 'Times New Roman', serif", about: 'Your device’s own, with serifs.', width: 1 },
  Literata: { css: "'Literata', Georgia, serif", about: 'A book serif made for reading on screens. Good on e-ink.', width: 1.05 },
  'Atkinson Hyperlegible': { css: "'Atkinson Hyperlegible', sans-serif", about: 'For low vision: every letter clearly different (I l 1, O 0).', width: 1.1 },
  Lexend: { css: "'Lexend', sans-serif", about: 'Wide and even, to ease reading strain.', width: 1.15 },
  OpenDyslexic: { css: "'OpenDyslexic', sans-serif", about: 'Weighted letters that don’t flip or swim. For dyslexia.', width: 1.25 },
  Andika: { css: "'Andika', sans-serif", about: 'Plain, clear letters made for new readers.', width: 1.05 },
  'Comic Neue': { css: "'Comic Neue', sans-serif", about: 'Friendly and casual; easy for many dyslexic readers.', width: 1 },
};
const sizes = [[0.85, 'XS'], [1, 'S'], [1.15, 'M'], [1.3, 'L'], [1.5, 'XL'], [2, 'XXL']];
const modes = {
  Home: ['Home cook', 'Books, cards, cooking, a shopping list, and planning the week at home.'],
  Chef: ['Chef', 'Everything for a kitchen: prep sheets and receipt-printer prints, batch sizes, cards in several books.'],
};
const simpleFor = {
  Kid: ['A kid', 'Just books and cards, with icons. Nothing to change by accident.'],
  Plain: ['Someone who wants it plain', 'Big, plain cards with words on every button. Can still keep a shopping list.'],
};
const isDark = () => settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
/** Icons instead of words: icon mode, or a kid's simple mode. */
const icons = () => settings.iconMode || (settings.simple && settings.simpleFor === 'Kid');

function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--scale', settings.textScale);
  root.style.setProperty('--font', (typefaces[settings.typeface] || typefaces.Sans).css);
  const p = palette(settings.palette, isDark(), { highContrast: settings.highContrast, accent: settings.accent });
  for (const [k, v] of Object.entries(paletteVars(p))) root.style.setProperty(k, v);
  root.style.colorScheme = p.dark ? 'dark' : 'light';
  root.dataset.big = settings.big ? '1' : '0';
  root.dataset.roomy = settings.roomy ? '1' : '0';
  root.dataset.top = settings.controlsTop ? '1' : '0';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', colourOf(p, 'paper'));
}
/** How much wider than Sans a line runs (wide typefaces, roomy spacing), for choosing columns. */
const textWidth = () => (typefaces[settings.typeface]?.width || 1) * (settings.roomy ? 1.08 : 1) * settings.textScale;

// ---------------------------------------------------------------- state

const sync = new Sync(box);
const ui = {
  folder: ALL, query: '', notice: null, hint: null, tilePage: 0, fromEnd: false,
  sessions: new Map(), timers: [], pages: new Map(), confirm: null, starter: null,
  welcome: { page: 0, cook: null, picked: new Set(), who: null },
};
let pager = null;
let pageKeys = null;
let wake = null;

/** A card while it's open: tab, scale, units, ticks and the cook-mode step. Not saved. */
function session(r) {
  if (!ui.sessions.has(r.id)) {
    ui.sessions.set(r.id, { tab: 'ingredients', factor: r.scale || 1, units: settings.units, checked: new Set(r.checkedIngredients || []), done: new Set(r.checkedSteps || []), step: null });
  }
  return ui.sessions.get(r.id);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, many = `${one}s`) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
function notice(text) { ui.notice = text; render(); }
/** Recipe text: highlighted like code when that's on, as plain text otherwise. */
const rtext = (s) => (settings.syntax ? highlight(s) : esc(s));

// ---------------------------------------------------------------- routes (the back button works)

function route() {
  const [, view = 'books', id] = location.hash.replace(/^#/, '').split('/');
  return { view, id: id ? decodeURIComponent(id) : null };
}
const go = (hash) => { location.hash = hash; };
const back = () => (history.length > 1 ? history.back() : go('#/books'));
window.addEventListener('hashchange', () => { ui.confirm = null; render(); });

// ---------------------------------------------------------------- icons

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const glyph = {
  books: svg('<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 3 15-3.5 1z"/>'),
  list: svg('<path d="M3 4h2l2.5 11h10L20 7H6.5"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
  setup: svg('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--paper)"/><circle cx="15" cy="12" r="2" fill="var(--paper)"/><circle cx="8" cy="17" r="2" fill="var(--paper)"/>'),
  cook: svg('<path d="M7 4l13 8-13 8z"/>'),
  edit: svg('<path d="M4 20l4-1 11-11-3-3L5 16z"/>'),
  clear: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'),
  print: svg('<rect x="3" y="9" width="18" height="8" rx="1"/><rect x="7" y="3" width="10" height="6"/><rect x="7" y="14" width="10" height="7"/>'),
  read: svg('<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  close: svg('<path d="M5 5l14 14M19 5L5 19"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  ingredients: svg('<circle cx="5" cy="6" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="18" r="1.2"/><path d="M9 6h11M9 12h11M9 18h11"/>'),
  method: svg('<path d="M4 18h5v-5h5V8h6"/>'),
  notes: svg('<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  nutrition: svg('<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l8-8"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
};

/**
 * A button with an icon and its name. In icon mode the name goes (the icon says it, and holding
 * shows it); a screen reader always hears it.
 */
function btn(act, label, { g = null, cls = '', attrs = '', icon = icons() } = {}) {
  const showIcon = g && glyph[g];
  const bare = icon && showIcon;
  return `<button class="btn ${cls}" data-act="${act}" ${attrs} ${bare ? `aria-label="${esc(label)}" data-hint="${esc(label)}"` : ''}>${showIcon ? glyph[g] : ''}${bare ? '' : `<span>${esc(label)}</span>`}</button>`;
}

// ---------------------------------------------------------------- drawing

function render() {
  const app = document.getElementById('app');
  if (pager) { pager.destroy(); pager = null; }
  pageKeys = null;
  let r = route();
  if (!settings.welcomed && r.view !== 'welcome') { location.replace('#/welcome'); r = route(); }
  // Simple mode keeps Setup and editing out of reach.
  if (settings.simple && ['setup', 'edit', 'print'].includes(r.view)) { location.replace('#/books'); r = route(); }
  const views = { books: viewBooks, card: viewCard, cook: viewCook, edit: viewEdit, print: viewPrint, list: viewList, setup: viewSetup, welcome: viewWelcome };
  const view = (views[r.view] || viewBooks)(r.id);
  const tab = ['list', 'setup'].includes(r.view) ? r.view : 'books';
  const tabs = [['books', 'Books'], ...(settings.simple && !settings.simpleList ? [] : [['list', 'List']]), ...(settings.simple ? [] : [['setup', 'Setup']])];
  const showTabs = !['cook', 'print', 'edit', 'welcome'].includes(r.view);
  app.innerHTML = `
    <div id="timers">${timersHtml()}</div>
    ${conflictHtml()}
    <div id="screen">${view.html}</div>
    ${ui.hint ? `<div class="hint" role="status">${esc(ui.hint)}</div>` : ''}
    ${ui.notice ? `<div class="notice" role="status"><span>${esc(ui.notice)}</span><button class="btn small" data-act="notice-ok">OK</button></div>` : ''}
    ${showTabs ? `<nav class="tabs" aria-label="Sections">
      ${tabs.map(([k, label]) => `
        <button class="${tab === k ? 'on' : ''}" data-act="tab" data-to="${k}" aria-current="${tab === k ? 'page' : 'false'}" aria-label="${label}" data-hint="${label}" ${k === 'books' && settings.simple ? 'data-hold="leave-simple"' : ''}>${glyph[k]}<span class="word">${label}</span></button>`).join('')}
    </nav>` : ''}`;
  view.mount?.(document.getElementById('screen'));
  polish(app);
  fitTabLabels();
  keepAwake(['card', 'cook'].includes(r.view) && settings.keepAwake);
}

/**
 * The finishing pass over drawn text, as the app does in its Text: the app's own words in the
 * chosen spelling (recipes, marked .rx, stay as written), then the chosen casing (names take
 * Title Case; lowercase takes everything).
 */
const nameSel = 'button, h1, h2, .label, .title, .tabs, .cover, .section, .from, .nm';
function polish(root) {
  if (settings.spelling !== 'US' && settings.casing === 'AsWritten') return;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('[data-raw], textarea, style, script')) continue;
    let t = n.nodeValue;
    if (settings.spelling === 'US' && !el.closest('.rx')) t = toUs(t);
    // A line about something (under a switch, a Setup row) is body text, not a name.
    t = applyCase(t, settings.casing, !!el.closest(nameSel) && !el.closest('.about, .n, .meta, .dim'));
    if (t !== n.nodeValue) n.nodeValue = t;
  }
  for (const el of root.querySelectorAll('[placeholder]')) {
    let t = el.getAttribute('placeholder');
    if (settings.spelling === 'US') t = toUs(t);
    el.setAttribute('placeholder', applyCase(t, settings.casing, false));
  }
}

/** Tab names go when any would wrap (a narrow phone, big text): icons for all, rather than some broken. */
function fitTabLabels() {
  const tabs = document.querySelector('.tabs');
  if (!tabs) return;
  const words = tabs.querySelectorAll('.word');
  if (icons()) { words.forEach((w) => { w.style.display = 'none'; }); return; }
  words.forEach((w) => { w.style.display = ''; });
  const tooWide = [...tabs.querySelectorAll('button')].some((b) => {
    const w = b.querySelector('.word');
    return b.scrollWidth > b.clientWidth || w.getBoundingClientRect().height > parseFloat(getComputedStyle(w).lineHeight) * 1.5;
  });
  if (tooWide) words.forEach((w) => { w.style.display = 'none'; });
}

async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}

/** A paged area: the page turns with swipes, keys and the wheel; past its ends, onEdge. */
function paged(el, key, { onEdge = null, bottom = false, fromEnd = false } = {}) {
  const viewport = el.querySelector('.pages');
  const content = viewport.querySelector('.content');
  const count = el.querySelector('.count');
  // Content that fits sits by the thumb: at the foot (the head, with controls at the top).
  pager = new Pager(viewport, content, { onEdge, countEl: count, bottom: bottom && !settings.controlsTop, start: ui.pages.get(key) || 0, onTurn: (v) => ui.pages.set(key, v) });
  if (fromEnd) { pager.toEnd(); ui.pages.set(key, pager.v); }
  pageKeys = (dir) => pager.turn(dir);
  swipe(viewport, (dir) => pager.turn(dir));
}

// ---------------------------------------------------------------- first run

const cookChoices = {
  New: ['I’m new to cooking', 'Start with the basics, explained step by step.', ['learning-to-cook', 'weeknight-dinners']],
  Often: ['I cook most days', 'Quick dinners, soups and the sauces that go with them.', ['weeknight-dinners', 'soups-and-stews', 'sauces-and-staples']],
  Baker: ['I mostly bake', 'Bread, cakes, cookies and puddings.', ['baking-basics', 'desserts', 'breakfast-and-brunch']],
  Own: ['I’ve got my own recipes', 'Start empty: write yours in, bring them from a file, or connect the phone app’s sync file.', []],
};

function choice(act, value, title, about, on) {
  return `<button class="choice a ${on ? 'on' : ''}" data-act="${act}" data-v="${value}" role="radio" aria-checked="${on}">
    <span class="bold nm">${on ? '●' : '○'} ${esc(title)}</span><span class="about">${esc(about)}</span></button>`;
}

function viewWelcome() {
  loadStarters();
  const w = ui.welcome;
  const order = ['size', 'paging', 'units', 'cook', 'who', 'card'];
  const page = order[w.page];
  let body = '';
  if (page === 'size') {
    body = `<h1 class="title a">Recipe Box</h1>
      <p class="a" style="font-size:1.12em;margin:4px 0 16px">Your recipes as cards in books. No ads, no life stories, no scrolling. Just the card.</p>
      <h2 class="q a">How big should the words be?</h2>
      <p class="dim a">Pick one you can read from the counter. You can change it any time in Setup.</p>
      <div class="row-btns a">${sizes.slice(1).map(([v, l]) => `<button class="btn grow big ${Math.abs(settings.textScale - v) < 0.01 ? 'on' : ''}" data-act="size" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="a rx" style="margin-top:14px">2 cups flour<br>Bake for 25 minutes, until golden.</p>`;
  } else if (page === 'paging') {
    body = `<h2 class="q a">Turning pages</h2>
      ${[['↑ ←', 'Swipe up or left: the next page'], ['↓ →', 'Swipe down or right: back a page'], ['⌨', 'Arrow and page keys, or the mouse wheel: the same'], ['Esc', 'Go back']]
        .map(([k, v]) => `<div class="keyrow a"><b data-raw>${k}</b><span>${v}</span></div>`).join('')}
      <p class="dim a">Nothing scrolls. Past a card’s last page comes the next card.</p>
      <p class="bold a" style="font-size:1.1em">Try it now: swipe up or left, or press →, to go on to the next question.</p>`;
  } else if (page === 'units') {
    const sample = ['2 cups flour', '1 tbsp butter', '450 g chicken'];
    body = `<h2 class="q a">How do you measure?</h2>
      <p class="dim a">Cards show amounts this way; each card has a units button to switch.</p>
      ${[['US', 'Cups, ounces and °F'], ['Metric', 'Grams, millilitres and °C'], ['AsWritten', 'Left as each recipe has it']].map(([u, about]) =>
        choice('units-default', u, unitLabel[u], `${about}: ${sample.map((s) => convert(s, u)).join(', ')}`, settings.units === u)).join('')}`;
  } else if (page === 'cook') {
    body = `<h2 class="q a">How much do you cook?</h2>
      <p class="dim a">We’ll start your box with the books that suit you.</p>
      ${Object.entries(cookChoices).map(([k, [t, a]]) => choice('w-cook', k, t, a, w.cook === k)).join('')}
      <div class="a" style="margin-top:12px"><h2 class="q">Your starter books</h2>
        <p class="dim">${w.picked.size ? 'These suit you. Tap to add or take away.' : 'Tap any you’d like. You can add more later in Setup.'}</p>
        <div class="flow">${(ui.starter || []).map((b) => `<button class="btn small a ${w.picked.has(b.file) ? 'on' : ''}" data-act="w-book" data-file="${b.file}">${w.picked.has(b.file) ? '✓ ' : ''}${esc(b.name)}</button>`).join('')}</div>
        ${w.picked.size ? `<p class="small dim">${(ui.starter || []).filter((b) => w.picked.has(b.file)).reduce((n, b) => n + b.count, 0)} recipes to start with.</p>` : ''}</div>`;
  } else if (page === 'who') {
    body = `<h2 class="q a">Who’s it for?</h2>
      ${Object.entries(modes).map(([k, [t, a]]) => choice('w-who', k, t, a, (w.who ?? settings.mode) === k)).join('')}
      ${Object.entries(simpleFor).map(([k, [t, a]]) => choice('w-who', `simple:${k}`, t, a, w.who === `simple:${k}`)).join('')}
      ${w.who?.startsWith('simple') ? '<p class="small dim a">Editing and Setup stay locked. A grown-up leaves simple mode by pressing and holding the Books tab for three seconds.</p>' : ''}`;
  } else {
    body = `<h2 class="q a">How a card works</h2>
      ${[['ingredients', 'Tick', 'Tap a line to tick it off, so you don’t lose your place.'], ['cook', 'Cook', 'One big step at a time, with its timers.'], ['read', 'Read', 'In cook mode: the step, out loud.'], ['list', '+ List', 'The card’s ingredients onto the shopping list.']]
        .map(([g, n, a]) => `<div class="keyrow a"><span class="btn small" style="pointer-events:none">${glyph[g]}<span>${n}</span></span><span>${a}</span></div>`).join('')}
      <p class="a" style="margin-top:12px">That’s it. All of this, and more (colours, sync with the phone app), is in Setup.</p>`;
  }
  const last = w.page === order.length - 1;
  return {
    html: `<div class="dim bold small">Setting up · ${w.page + 1} of ${order.length}</div>
      <div class="welcome"><div class="pages"><div class="content">${body}</div></div><div class="count"></div></div>
      <div class="row-btns">${w.page ? '<button class="btn big" data-act="w-step" data-dir="-1">◀ Back</button>' : ''}
        <button class="btn big primary grow" data-act="w-step" data-dir="1">${last ? 'Start cooking' : 'Next ▶'}</button></div>
      ${w.page === 0 ? '<button class="linkish" data-act="w-finish">Skip setup</button>' : ''}`,
    mount(el) { paged(el, `welcome:${w.page}`, { onEdge: (dir) => welcomeStep(dir) }); },
  };
}

function welcomeStep(dir) {
  const w = ui.welcome;
  if (dir > 0 && w.page === 5) { finishWelcome(); return; }
  w.page = Math.max(0, Math.min(5, w.page + dir));
  render();
}

async function finishWelcome() {
  const w = ui.welcome;
  settings.welcomed = true;
  if (w.who?.startsWith('simple:')) {
    settings.simpleFor = w.who.split(':')[1];
    setSimple(true);
    // A kid's box starts with the kids' book.
    if (settings.simpleFor === 'Kid') w.picked.add('cooking-with-kids');
  } else if (w.who) settings.mode = w.who;
  saveSettings();
  const added = [];
  for (const file of w.picked) {
    try {
      const book = await (await fetch(`books/${file}.json`)).json();
      box.importBox(book);
      added.push(book.folders?.[0]?.name);
    } catch { /* offline: the books can be added later */ }
  }
  ui.folder = ALL;
  location.replace('#/books');
  if (added.length) notice(`Added ${added.join(', ')}. Swipe to turn pages.`);
  else render();
}

function setSimple(on) {
  if (on) {
    settings.beforeSimple = { iconMode: settings.iconMode };
    settings.simple = true;
    if (settings.simpleFor === 'Kid') settings.simpleList = false;
  } else {
    settings.simple = false;
    if (settings.beforeSimple) settings.iconMode = settings.beforeSimple.iconMode;
    settings.beforeSimple = null;
  }
  saveSettings();
}

// ---------------------------------------------------------------- Books

function viewBooks() {
  if (!box.recipes.length) return viewEmpty();
  const name = box.folderName(ui.folder);
  return {
    html: `
      <div class="pages" id="tiles"><div class="content"></div></div>
      <div class="count" id="tcount"></div>
      <hr class="rule">
      <div class="shelf" role="list" id="shelf"></div>
      <div class="search">
        <input class="field" id="q" type="search" placeholder="Search ${esc(name)}" value="${esc(ui.query)}" aria-label="Search">
        ${ui.query ? btn('clear-q', 'Clear', { icon: false }) : ''}
        ${settings.simple ? '' : btn('new', 'New', { g: 'plus' })}
      </div>`,
    mount(el) {
      const tiles = el.querySelector('#tiles');
      const draw = () => {
        const cards = box.inBook(ui.folder).filter((r) => matches(r, ui.query));
        const w = tiles.clientWidth;
        const h = tiles.clientHeight;
        const gap = 10;
        const cols = Math.max(1, Math.min(5, Math.floor(w / (150 * textWidth()))));
        const tileW = (w - gap * (cols - 1)) / cols;
        let rows = Math.max(1, Math.round((h + gap) / (tileW * 0.6 + gap)));
        if ((h - gap * (rows - 1)) / rows < tileW * 0.45) rows = Math.max(1, rows - 1);
        const tileH = Math.min(tileW * 0.7, Math.max(tileW * 0.45, (h - gap * (rows - 1)) / rows));
        const per = rows * cols;
        const pages = Math.max(1, Math.ceil(cards.length / per));
        if (ui.fromEnd) { ui.tilePage = pages - 1; ui.fromEnd = false; }
        ui.tilePage = Math.min(ui.tilePage, pages - 1);
        const shown = cards.slice(ui.tilePage * per, (ui.tilePage + 1) * per);
        const content = tiles.querySelector('.content');
        content.innerHTML = cards.length
          ? `<div class="tiles" style="grid-template-columns: repeat(${cols}, 1fr); grid-auto-rows: ${tileH}px">${shown.map((r) => {
            const t = r.totalMin || (r.prepMin || 0) + (r.cookMin || 0);
            const from = ui.folder === ALL ? box.folderName(r.folderId ?? null) : '';
            return `<button class="tile" data-act="open" data-id="${esc(r.id)}"><span class="name rx nm">${esc(r.title || 'Untitled recipe')}</span>${settings.focus ? '' : `<span class="meta rx">${[t ? formatMinutes(t) : '', from].filter(Boolean).map(esc).join(' · ')}</span>`}</button>`;
          }).join('')}</div>`
          : `<p class="dim">${ui.query ? `Nothing in ${esc(name)} matches.` : `No cards in ${esc(name)} yet.`}</p>`;
        const count = el.querySelector('#tcount');
        count.textContent = pages > 1 ? `${ui.tilePage + 1} / ${pages}${ui.tilePage === 0 ? ' · more ▶' : ''}` : '';
        count.classList.toggle('more', pages > 1 && ui.tilePage === 0);
        polish(tiles);
        return pages;
      };
      // The shelf: two rows of covers, as many across as fit. With more books than that, the first
      // cover turns back a shelf and the last turns on (a swipe on the shelf does too).
      const shelf = el.querySelector('#shelf');
      const drawShelf = () => {
        const all = box.scopes();
        const cols = Math.max(3, Math.min(7, Math.floor((shelf.clientWidth + 6) / (112 * textWidth() + 6))));
        const one = all.length <= cols * 2;
        const per = one ? all.length : cols * 2 - 2;
        const shelves = Math.max(1, Math.ceil(all.length / per));
        if (ui.shelf == null) ui.shelf = Math.floor(Math.max(0, all.indexOf(ui.folder)) / per);
        ui.shelf = ((ui.shelf % shelves) + shelves) % shelves;
        const cover = (id) => {
          const n = box.inBook(id).length;
          return `<button class="cover ${id === ui.folder ? 'on' : ''}" role="listitem" data-act="book" data-id="${id ?? ''}"><span class="bold ${id === ALL || id === null ? '' : 'rx'}">${esc(box.folderName(id))}</span><span class="n">${plural(n, 'recipe')}</span></button>`;
        };
        const turnCover = (dir) => `<button class="cover turn" data-act="shelf" data-dir="${dir}"><span class="bold">${dir < 0 ? '◀ Previous shelf' : 'Next shelf ▶'}</span><span class="n">${((ui.shelf + dir + shelves) % shelves) + 1} of ${shelves}</span></button>`;
        const books = all.slice(ui.shelf * per, (ui.shelf + 1) * per).map(cover);
        shelf.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        shelf.innerHTML = one ? books.join('') : [turnCover(-1), ...books, turnCover(1)].join('');
        polish(shelf);
      };
      drawShelf();
      swipe(shelf, (dir) => { ui.shelf = (ui.shelf ?? 0) + dir; drawShelf(); });
      let pages = draw();
      const turn = (dir) => {
        const p = ui.tilePage + dir;
        if (p >= 0 && p < pages) ui.tilePage = p;
        else {
          // Past the last page is the next book; back past the first, the one before.
          const scopes = box.scopes();
          if (scopes.length > 1 && !ui.query) {
            const i = scopes.indexOf(ui.folder);
            ui.folder = scopes[(i + dir + scopes.length) % scopes.length];
            ui.tilePage = 0;
            ui.fromEnd = dir < 0;
            render();
            return;
          }
          ui.tilePage = (p + pages) % pages;
        }
        pages = draw();
      };
      pageKeys = turn;
      swipe(tiles, turn);
      new ResizeObserver(() => { pages = draw(); drawShelf(); }).observe(tiles);
      const q = el.querySelector('#q');
      q.addEventListener('input', () => {
        ui.query = q.value;
        ui.tilePage = 0;
        pages = draw();
      });
    },
  };
}

function viewEmpty() {
  loadStarters();
  return {
    // The things to do sit by the thumb; a long list of books pages like the rest.
    html: `<div class="empty"><div class="pages"><div class="content">
      <div class="title a">Empty box.</div>
      <p class="dim a" style="margin:0">Your recipes as cards in books. No ads, no life stories, no scrolling. Just the card.</p>
      <div class="label keep a">Start with a starter book</div>
      <div class="flow a">${(ui.starter || []).map((b) => `<button class="btn small" style="width:auto" data-act="starter" data-file="${b.file}">+ ${esc(b.name)}</button>`).join('') || '<span class="dim">Loading…</span>'}</div>
      ${settings.simple ? '' : `<div class="label keep a">Or</div>
      <button class="btn a" data-act="setup-part" data-part="recipes">Connect your sync file</button>
      <button class="btn a" data-act="new">Write my own</button>
      <button class="btn a" data-act="open-file">Bring in a file</button>
      <p class="small dim a" style="margin:0">The sync file is the one the phone app uses. A file can be a backup or a shared book.</p>`}
    </div></div><div class="count"></div></div>`,
    mount(el) { paged(el, 'empty', { bottom: true }); },
  };
}

async function loadStarters() {
  if (ui.starter) return;
  ui.starter = [];
  try {
    const ids = await (await fetch('books/index.json')).json();
    ui.starter = await Promise.all(ids.map(async (file) => {
      const book = await (await fetch(`books/${file}.json`)).json();
      return { file, name: book.folders?.[0]?.name || file, about: book.about || '', count: (book.recipes || []).length };
    }));
    render();
  } catch { /* offline */ }
}

async function addStarter(file) {
  const book = await (await fetch(`books/${file}.json`)).json();
  const n = box.importBox(book);
  ui.folder = book.folders?.[0]?.id ?? ALL;
  ui.tilePage = 0;
  notice(n ? `Added ${book.folders?.[0]?.name}: ${plural(n, 'card')}.` : 'Those cards are already in your box.');
}

// ---------------------------------------------------------------- a card

function cardTabs(r) {
  const tabs = [['ingredients', 'Ingredients'], ['method', 'Method']];
  // Focus mode keeps only what you cook from.
  if (settings.focus) return tabs;
  if (r.notes || r.description) tabs.push(['notes', 'Notes']);
  if ((r.nutrition || []).length) tabs.push(['nutrition', 'Nutrition']);
  tabs.push(['info', 'Info']);
  return tabs;
}

function checkList(lines, set, { numbered, text, extra = () => '', kind }) {
  let n = 0;
  return `<ul class="checks rx">${lines.map((line, i) => {
    if (line.startsWith('## ')) return `<li class="heading a" style="border:0;cursor:default">${esc(line.slice(3))}</li>`;
    n++;
    const on = set.has(i);
    return `<li class="a ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}" tabindex="0" data-act="tick" data-kind="${kind}" data-i="${i}">
      <span class="box"></span>${numbered ? `<span class="n">${n}.</span>` : ''}<span class="txt">${on ? esc(text(line)) : rtext(text(line))}${extra(line, i)}</span></li>`;
  }).join('') || '<li class="dim" style="border:0">Nothing here yet.</li>'}</ul>`;
}

function cardBody(r, s) {
  const ing = (line) => convert(scale(line, s.factor), s.units);
  switch (s.tab) {
    case 'method':
      return checkList(r.steps, s.done, {
        numbered: true, kind: 'step', text: (line) => convertTemps(line, s.units),
        extra: (line) => {
          if (!settings.amountsInMethod) return '';
          const used = ingredientsInStep(line, r.ingredients);
          return used.length ? `<span class="amts" style="display:block">${used.map((i) => esc(ing(r.ingredients[i]))).join(' · ')}</span>` : '';
        },
      });
    case 'notes':
      return `<div class="rx">${[r.description, r.notes].filter(Boolean).map((p) => p.split('\n').filter(Boolean).map((line) => `<p class="a" style="margin:0 0 8px">${esc(line)}</p>`).join('')).join('')}</div>`;
    case 'nutrition':
      return `<ul class="checks rx">${r.nutrition.map((line) => `<li class="a" style="cursor:default"><span class="txt" style="flex:1">${esc(line.split(':')[0])}</span><b>${esc(line.split(':').slice(1).join(':').trim())}</b></li>`).join('')}</ul>
        <p class="small dim">Per serving${r.id.startsWith('starter-') ? ' · estimated' : ''}.</p>`;
    case 'info': {
      const rows = [
        ['Book', box.folderName(r.folderId ?? null)],
        ['Source', r.sourceName], ['By', r.author], ['Yield', r.yieldText], ['Cuisine', r.cuisine], ['Category', r.category],
        ['Added', r.created ? new Date(r.created).toLocaleDateString() : ''], ['Changed', r.updated ? new Date(r.updated).toLocaleDateString() : ''],
      ].filter(([, v]) => v);
      return `${rows.map(([k, v]) => `<div class="a"><span class="label">${k}</span><div class="rx">${esc(v)}</div></div>`).join('')}
        ${r.sourceUrl ? `<div class="a"><span class="label">Web page</span><div data-raw><a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.sourceUrl)}</a></div></div>` : ''}`;
    }
    default: {
      const about = r.description && !settings.focus ? `<p class="dim a small rx" style="margin:0 0 8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(r.description)}</p>` : '';
      return about + checkList(r.ingredients, s.checked, { numbered: false, kind: 'ing', text: ing });
    }
  }
}

const letterOf = (r) => { const c = fold(r.title.trim())[0]?.toUpperCase() || '#'; return c >= 'A' && c <= 'Z' ? c : '#'; };

/** Names around this card and the letters that have cards: a rolodex to jump about the book. */
function rolodexHtml(cards, i) {
  if (cards.length < 2 || i < 0) return '';
  const cols = Math.max(2, Math.min(5, Math.floor((document.getElementById('app')?.clientWidth || 600) / (150 * textWidth()))));
  const start = Math.max(0, Math.min(i - Math.floor(cols / 2), cards.length - cols));
  const names = cards.slice(start, start + cols).map((r, k) => `<button class="${start + k === i ? 'on' : ''}" data-act="open-swap" data-id="${esc(r.id)}"><span class="rx nm">${esc(r.title)}</span></button>`).join('');
  const ordered = box.folders.find((f) => f.id === ui.folder)?.ordered;
  const letters = [...new Set(cards.map(letterOf))];
  const current = letterOf(cards[i]);
  const showLetters = !ordered && letters.length > 1 && settings.textScale < 1.5;
  return `<div class="rolodex-block"><div class="rolodex">${names}</div>
    ${showLetters ? `<div class="letters" data-raw>${letters.map((l) => `<button class="${l === current ? 'on' : ''}" data-act="letter" data-l="${l}">${l}</button>`).join('')}</div>` : ''}</div>`;
}

function viewCard(id) {
  const r = box.find(id);
  if (!r) return { html: '<p>That card isn’t in the box any more.</p><button class="btn" data-act="tab" data-to="books">Back to Books</button>' };
  const s = session(r);
  const cards = box.inBook(ui.folder).filter((x) => matches(x, ui.query));
  const i = cards.findIndex((x) => x.id === r.id);
  const kid = settings.simple && settings.simpleFor === 'Kid';
  const times = [r.prepMin && `Prep ${formatMinutes(r.prepMin)}`, r.cookMin && `Cook ${formatMinutes(r.cookMin)}`,
    (r.totalMin || r.prepMin || r.cookMin) && `Total ${formatMinutes(r.totalMin || (r.prepMin || 0) + (r.cookMin || 0))}`].filter(Boolean);
  const serves = r.servings ? `Serves ${formatAmount(r.servings * s.factor)}` : s.factor === 1 ? 'Scale' : `${formatAmount(s.factor)}×`;
  const tabs = cardTabs(r);
  if (!tabs.some(([k]) => k === s.tab)) s.tab = 'ingredients';
  const key = `${r.id}:${s.tab}`;
  return {
    html: `
      <article class="card">
        <h1 class="title rx">${esc(r.title || 'Untitled recipe')}</h1>
        ${times.length && !settings.focus ? `<div class="times">${times.join('   ·   ')}</div>` : ''}
        ${kid ? (r.servings ? `<div class="bold">Serves ${r.servings}</div>` : '') : `<div class="scale">
          <button class="serves" data-act="serves">${serves}</button>
          ${[[0.5, '½×'], [1, '1×'], [2, '2×'], [3, '3×']].map(([f, l]) => `<button class="btn small ${s.factor === f ? 'on' : ''}" data-act="factor" data-f="${f}" data-raw>${l}</button>`).join('')}
          <button class="btn small on" data-act="units" title="Units: tap to change">${unitLabel[s.units]}</button>
        </div>`}
        <div class="pages" id="cardpages"><div class="content">${cardBody(r, s)}</div></div>
        <div class="count"></div>
        <div class="cardtabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${s.tab === k}" class="${s.tab === k ? 'on' : ''}" data-act="card-tab" data-tab="${k}" ${icons() ? `aria-label="${l}" data-hint="${l}"` : ''}>${icons() ? glyph[k] : l}</button>`).join('')}</div>
        <div class="row-btns card-actions">
          ${r.steps.some((x) => !x.startsWith('## ')) ? btn('cook', 'Cook', { g: 'cook', cls: 'small' }) : ''}
          ${settings.simple ? '' : btn('edit', 'Edit', { g: 'edit', cls: 'small' })}
          ${settings.simple && !settings.simpleList ? '' : btn('to-list', '+ List', { g: 'list', cls: 'small' })}
          ${btn('clear-ticks', 'Clear', { g: 'clear', cls: 'small', attrs: s.checked.size || s.done.size ? '' : 'disabled' })}
          ${settings.simple ? '' : btn('print', 'Print', { g: 'print', cls: 'small' })}
        </div>
      </article>
      ${rolodexHtml(cards, i)}
      <div class="bar">
        ${btn('back-books', 'Back', { g: 'back' })}
        <div class="grow bold"><span class="${ui.folder === ALL || ui.folder === null ? '' : 'rx'} nm">${esc(box.folderName(ui.folder))}</span>${i >= 0 ? ` · ${i + 1} / ${cards.length}` : ''}</div>
        ${i >= 0 ? `${btn('step-card', 'Previous card', { g: 'back', attrs: 'data-dir="-1"', icon: true })}${btn('step-card', 'Next card', { g: 'next', attrs: 'data-dir="1"', icon: true })}` : ''}
      </div>`,
    mount(el) {
      paged(el, key, {
        fromEnd: ui.fromEnd,
        // Past a card's last page is the next card; back past the first, the one before.
        onEdge: (dir) => stepCard(r.id, dir),
      });
      ui.fromEnd = false;
    },
  };
}

function stepCard(id, dir) {
  const cards = box.inBook(ui.folder).filter((x) => matches(x, ui.query));
  if (cards.length < 2) return;
  const i = cards.findIndex((x) => x.id === id);
  const next = cards[(i + dir + cards.length) % cards.length];
  ui.fromEnd = dir < 0;
  ui.pages.delete(`${next.id}:${session(next).tab}`);
  location.replace(`#/card/${encodeURIComponent(next.id)}`);
}

// ---------------------------------------------------------------- cook mode

const grownUp = /\b(oven|stove|hob|heat|boil|boiling|simmer|fry|frying|grill|broil|knife|chop|slice|dice|grate|hot|microwave|blender|bake|toast)\w*/i;
function cookSteps(r) { return r.steps.map((text, index) => ({ text, index })).filter((x) => !x.text.startsWith('## ')); }

function spoken(r, s) {
  const ing = (line) => convert(scale(line, s.factor), s.units);
  if (s.step < 0) return `Get these out. ${r.ingredients.filter((l, i) => !l.startsWith('## ') && !s.checked.has(i)).map(ing).join('. ')}`;
  const step = cookSteps(r)[s.step].text;
  const uses = ingredientsInStep(step, r.ingredients).map((i) => ing(r.ingredients[i]));
  return `Step ${s.step + 1}. ${convertTemps(step, s.units)}${uses.length ? `. You'll need: ${uses.join('. ')}` : ''}`;
}

function say(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function viewCook(id) {
  const r = box.find(id);
  if (!r) return viewCard(id);
  const s = session(r);
  const steps = cookSteps(r);
  const toGet = r.ingredients.map((l, i) => i).filter((i) => !r.ingredients[i].startsWith('## ') && !s.checked.has(i));
  if (s.step == null) s.step = toGet.length ? -1 : 0;
  s.step = Math.max(-1, Math.min(s.step, steps.length - 1));
  const ing = (line) => convert(scale(line, s.factor), s.units);
  const kid = settings.simple && settings.simpleFor === 'Kid';
  let body;
  let label;
  let primary;
  if (s.step < 0) {
    label = toGet.length ? `Gather first · ${toGet.length} to get out` : 'Got everything';
    body = `<ul class="checks gather rx">${r.ingredients.map((line, i) => (line.startsWith('## ') || (!toGet.includes(i) && !s.checked.has(i)) ? '' : `
      <li class="a ${s.checked.has(i) ? 'on' : ''}" role="checkbox" aria-checked="${s.checked.has(i)}" tabindex="0" data-act="tick" data-kind="ing" data-i="${i}"><span class="box"></span><span class="txt">${esc(ing(line))}</span></li>`)).join('')}</ul>`;
    primary = toGet.some((i) => !s.checked.has(i)) ? 'Start anyway' : 'Start cooking';
  } else {
    const { text, index } = steps[s.step];
    const heading = r.steps.slice(0, index).reverse().find((x) => x.startsWith('## '));
    label = [`Step ${s.step + 1} of ${steps.length}`, heading?.slice(3)].filter(Boolean).join(' · ');
    const done = s.done.has(index);
    const uses = ingredientsInStep(text, r.ingredients);
    const last = s.step === steps.length - 1;
    body = `<div class="step a rx ${done ? 'done' : ''}" data-act="tick" data-kind="step" data-i="${index}" role="checkbox" aria-checked="${done}" tabindex="0">${done ? esc(convertTemps(text, s.units)) : rtext(convertTemps(text, s.units))}</div>
      ${kid && grownUp.test(text) ? '<div class="warn a">⚠ Ask a grown-up to help with this one</div>' : ''}
      ${uses.length ? `<ul class="checks a rx" style="margin-top:14px">${uses.map((i) => `<li class="${s.checked.has(i) ? 'on' : ''}" data-act="tick" data-kind="ing" data-i="${i}"><span class="box"></span><span class="txt">${esc(ing(r.ingredients[i]))}</span></li>`).join('')}</ul>` : ''}
      ${stepTimers(text).length ? `<div class="row-btns a" style="margin-top:14px">${stepTimers(text).map((m) => btn('timer', `${formatMinutes(m)} timer`, { g: 'timer', attrs: `data-min="${m}"`, icon: false })).join('')}</div>` : ''}
      ${last && r.notes ? `<div class="box-panel a" style="margin-top:14px"><span class="label" style="margin:0">Notes</span><span class="rx">${esc(r.notes).replace(/\n/g, '<br>')}</span></div>` : ''}`;
    primary = last ? 'Done' : 'Next ▶';
  }
  return {
    html: `<section class="cook">
      <div class="bar cook-head"><div class="grow title rx" style="font-size:1.15em">${esc(r.title)}</div>
        ${'speechSynthesis' in window ? btn('read', 'Read', { g: 'read', cls: 'small' }) : ''}
        ${btn('close-cook', 'Close', { g: 'close', cls: 'small', icon: false })}</div>
      <div class="dim bold">${esc(label)}</div>
      <div class="pages"><div class="content">${body}</div></div>
      <div class="count"></div>
      <div class="row-btns cook-go">${s.step > (toGet.length ? -1 : 0) ? '<button class="btn big" data-act="cook-step" data-dir="-1" aria-label="Back a step">◀</button>' : ''}
        <button class="btn big primary grow" data-act="cook-step" data-dir="1">${primary}</button></div>
    </section>`,
    mount(el) {
      paged(el, `cook:${r.id}:${s.step}`, { onEdge: (dir) => cookStep(r, dir) });
      if (settings.readAloud && ui.spokenAt !== `${r.id}:${s.step}`) {
        ui.spokenAt = `${r.id}:${s.step}`;
        say(spoken(r, s));
      }
    },
  };
}

/** Moving on ticks off the step being left; on from the last finishes. */
function cookStep(r, dir) {
  const s = session(r);
  const steps = cookSteps(r);
  if (dir > 0 && s.step >= 0) s.done.add(steps[s.step].index);
  if (dir > 0 && s.step >= steps.length - 1) {
    s.step = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    location.replace(`#/card/${encodeURIComponent(r.id)}`);
    return;
  }
  s.step = Math.max(-1, s.step + dir);
  render();
}

// ---------------------------------------------------------------- timers

function startTimer(label, minutes) {
  ui.timers.push({ id: Date.now(), label, total: minutes * 60000, end: Date.now() + minutes * 60000, done: false });
  render();
}
function timersHtml() {
  return ui.timers.map((t) => {
    if (t.done) return `<div class="timer"><div class="meter up"><span style="mix-blend-mode:normal;color:inherit">TIME’S UP · ${esc(t.label)}</span></div><button class="btn" data-act="timer-off" data-id="${t.id}">OK</button></div>`;
    const left = Math.max(0, t.end - Date.now());
    const m = Math.floor(left / 60000);
    const sec = Math.floor((left % 60000) / 1000);
    return `<div class="timer"><div class="meter" data-timer="${t.id}"><div class="fill" style="width:${(100 * left) / t.total}%"></div><span>${m}:${String(sec).padStart(2, '0')} left · ${esc(t.label)}</span></div><button class="btn" data-act="timer-off" data-id="${t.id}">Stop</button></div>`;
  }).join('');
}
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.5, 1].forEach((at) => {
      const o = ctx.createOscillator();
      o.frequency.value = 880;
      o.connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.3);
    });
  } catch { /* no sound */ }
}
setInterval(() => {
  if (!ui.timers.length) return;
  let finished = false;
  for (const t of ui.timers) {
    if (!t.done && Date.now() >= t.end) { t.done = true; finished = true; }
  }
  if (finished) {
    beep();
    if (settings.readAloud) say('Time’s up.');
  }
  const el = document.getElementById('timers');
  if (el) { el.innerHTML = timersHtml(); polish(el); }
}, 1000);

// ---------------------------------------------------------------- the shopping list

function viewList() {
  const items = box.shopping;
  const groups = new Map();
  for (const s of items) {
    const k = s.from || 'Other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const left = items.filter((s) => !s.done).length;
  return {
    html: `
      <div class="dim bold">${items.length ? `${left} to get` : 'The list is empty.'}</div>
      <div class="pages"><div class="content">
        ${[...groups].map(([from, list]) => `<div class="from a keep ${from === 'Other' ? '' : 'rx'}">${esc(from)}</div>
          <ul class="checks list rx">${list.map((s) => `<li class="a ${s.done ? 'on' : ''}" role="checkbox" aria-checked="${s.done}" tabindex="0" data-act="shop" data-id="${s.id}">
            <span class="box"></span><span class="txt" style="flex:1">${esc(s.text)}</span>
            <button class="btn small" data-act="shop-remove" data-id="${s.id}" aria-label="Take ${esc(s.text)} off the list">×</button></li>`).join('')}</ul>`).join('')}
        ${items.length ? '<p class="small dim a">Tap to tick. × takes it off the list.</p>' : '<p class="dim">Add what you need below, or use + List on a card.</p>'}
      </div></div>
      <div class="count"></div>
      <form class="search" data-form="add-shop"><input class="field" name="item" placeholder="Add to the list: milk, eggs…" autocomplete="off" aria-label="Add to the list"><button class="btn">+ Add</button></form>
      <div class="row-btns"><button class="btn small" data-act="clear-ticked" ${items.some((s) => s.done) ? '' : 'disabled'}>Clear ticked</button>
        <button class="btn small" data-act="copy-list" ${left ? '' : 'disabled'}>Copy list</button></div>`,
    mount(el) { paged(el, 'list'); },
  };
}

// ---------------------------------------------------------------- Setup

function toggle(key, label, about, on) {
  return `<button class="toggle a" role="switch" aria-checked="${on}" data-act="toggle" data-key="${key}">
    <span class="what"><b class="nm">${label}</b>${about ? `<span class="about">${about}</span>` : ''}</span><span class="sw ${on ? 'on' : ''}">${on ? 'ON' : 'OFF'}</span></button>`;
}

function syncHtml() {
  if (!sync.on) {
    return `<p class="dim a">Use the same sync file as the phone app. Whichever copy changed wins; if both did, you choose which to keep.</p>
      ${Sync.canPickFiles
        ? `<div class="row-btns a"><button class="btn grow" data-act="sync-pick">Use my sync file…</button><button class="btn grow" data-act="sync-new">Make a new sync file…</button></div>
           <p class="small dim a">Pick it in your Dropbox or Google Drive folder on this computer; the page reads and writes it, and the folder carries it to your phone.</p>`
        : '<p class="small dim a">This browser can’t keep a file to read and write (Chrome or Edge on a computer can). A link works anywhere, to read.</p>'}
      <form class="search a" data-form="sync-link"><input class="field" name="url" placeholder="Or paste a link: Dropbox share link, …" aria-label="Sync file link"><button class="btn">Use link</button></form>
      <p class="small dim a">A link is read only: changes here stay in this browser.</p>`;
  }
  const when = sync.state.last ? new Date(sync.state.last).toLocaleString() : '';
  return `<div class="a"><span class="label">Syncing with${sync.readOnly ? ' (read only)' : ''}</span><div class="bold" style="word-break:break-all" data-raw>${esc(sync.name)}</div>
      <div class="small dim">${[when && `Last synced ${when}`, sync.state.message].filter(Boolean).map(esc).join(' · ')}</div></div>
    ${sync.needsPermission ? `<button class="btn primary a" data-act="sync-allow">Allow access to ${esc(sync.name)}</button><p class="small dim a">Browsers ask again after a restart: one tap.</p>` : ''}
    <div class="row-btns a"><button class="btn primary grow" data-act="sync-now" ${sync.busy || sync.needsPermission ? 'disabled' : ''}>${sync.busy ? 'Syncing…' : 'Sync now'}</button>
      <button class="btn grow" data-act="sync-stop">Stop syncing</button></div>`;
}

function conflictHtml() {
  const c = sync.conflict;
  if (!c) return '';
  const fmt = (t) => (t ? ` · last edit ${new Date(t).toLocaleString()}` : '');
  const list = (n) => (c.deviceList !== c.fileList ? ` · ${n} on the list` : '');
  return `<div class="box-panel" role="alertdialog" aria-label="Which copy to keep">
    <b>This browser and ${esc(sync.name)} both changed since the last sync. Which one should stay?</b>
    <div class="small dim">This browser: ${plural(c.deviceCards, 'card')}${list(c.deviceList)}${fmt(c.deviceEdit)}</div>
    <div class="small dim">${esc(sync.name)}: ${plural(c.fileCards, 'card')}${list(c.fileList)}${fmt(c.fileEdit)}</div>
    <div class="small dim">The other copy is replaced. Nothing is combined.</div>
    <div class="row-btns"><button class="btn grow" data-act="keep" data-keep="device" ${sync.readOnly ? 'disabled title="The link is read only"' : ''}>Keep this browser’s</button>
      <button class="btn grow" data-act="keep" data-keep="file">Use the file’s</button></div></div>`;
}

/** Setup's sections: a row each on Setup's first page, each opening on a page of its own. */
const setupParts = {
  reading: 'Reading', access: 'Accessibility', colours: 'Colours', cooking: 'Cooking', who: 'Who it’s for', recipes: 'Your recipes', about: 'About',
};

function setupSummary(k) {
  const s = settings;
  switch (k) {
    case 'reading': return [`${sizes.find(([v]) => Math.abs(v - s.textScale) < 0.01)?.[1] || 'M'} text`, s.typeface, s.roomy && 'Roomy', `${s.spelling} spelling`, { system: 'System', light: 'Light', dark: 'Dark' }[s.theme]].filter(Boolean).join(' · ');
    case 'access': return [s.big && 'Big buttons', s.highContrast && 'High contrast', s.readAloud && 'Reads steps aloud', s.focus && 'Focus', s.iconMode && 'Icons', s.controlsTop && 'Controls on top'].filter(Boolean).join(' · ') || 'Bigger buttons, reading aloud, focus, icons';
    case 'colours': return [palettes[s.palette]?.[0], { Full: 'Full', Soft: 'Soft', Ink: 'Ink only' }[s.accent], s.syntax && 'Highlighting'].filter(Boolean).join(' · ');
    case 'cooking': return [unitLabel[s.units], s.keepAwake ? 'Screen stays on' : 'Screen may sleep'].join(' · ');
    case 'who': return modes[s.mode][0];
    case 'recipes': return `${plural(box.recipes.length, 'card')} in ${plural(box.folders.length, 'book')} · ${sync.on ? 'Syncing' : 'Sync, backup, starter books'}`;
    default: return `Version ${VERSION} · Tip jar`;
  }
}

function viewSetup(part) {
  if (part && setupParts[part]) return viewSetupPart(part);
  return {
    html: `<h1 class="title">Setup</h1>
      <div class="pages"><div class="content">${Object.entries(setupParts).map(([k, label]) => `
        <button class="setup-row a" data-act="setup-part" data-part="${k}"><span><b class="nm">${label}</b><span class="about">${esc(setupSummary(k))}</span></span><span aria-hidden="true" data-raw>▶</span></button>`).join('')}
      </div></div><div class="count"></div>`,
    // The heading out of the way at the top; the rows (what you press) by the thumb.
    mount(el) { paged(el, 'setup', { bottom: true }); },
  };
}

function setupPartBody(part) {
  const s = settings;
  const pick = (act, opts, current) => `<div class="row-btns a">${opts.map(([v, l]) => `<button class="btn small grow ${current === v ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
  switch (part) {
    case 'reading': return `
      <div class="label keep">Text size</div>
      <div class="row-btns a">${sizes.map(([v, l]) => `<button class="btn small grow ${Math.abs(s.textScale - v) < 0.01 ? 'on' : ''}" data-act="size" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="a"><div class="label">Typeface</div>
        <div class="flow">${Object.keys(typefaces).map((t) => `<button class="btn small ${s.typeface === t ? 'on' : ''}" style="font-family:${typefaces[t].css}" data-act="typeface" data-v="${t}" data-raw>${t}</button>`).join('')}</div>
        <p class="small dim" style="margin:4px 0">${esc(typefaces[s.typeface]?.about || '')}</p></div>
      ${toggle('roomy', 'Roomier spacing', 'More space between lines and letters. Helps many dyslexic readers.', s.roomy)}
      <div class="label keep">Spelling</div>
      <div class="row-btns a" data-raw>${[['US', 'US: color, gray, liter'], ['UK', 'UK: colour, grey, litre']].map(([v, l]) => `<button class="btn small grow ${s.spelling === v ? 'on' : ''}" data-act="spelling" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="small dim a">For the app’s own words. Recipes stay as their cooks wrote them.</p>
      <div class="label keep">Casing</div>
      <div class="row-btns a" data-raw>${Object.entries(casings).map(([v, l]) => `<button class="btn small grow ${s.casing === v ? 'on' : ''}" data-act="casing" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="small dim a">How names and labels are shown. lowercase changes everything.</p>
      <div class="label keep">Light / dark</div>
      ${pick('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme)}`;
    case 'access': return `
      ${toggle('big', 'Bigger buttons', 'Larger tap targets everywhere, for unsteady or messy hands.', s.big)}
      ${toggle('highContrast', 'High contrast', 'Pure black (or white) text and darker greys.', s.highContrast)}
      <div class="a">${toggle('readAloud', 'Read steps aloud', 'Cook mode says each step as it comes up, with your device’s own voice. Read says it again.', s.readAloud)}
        ${'speechSynthesis' in window ? '<button class="btn" style="width:100%" data-act="test-voice">Test the voice</button>' : ''}</div>
      ${toggle('focus', 'Focus mode', 'Cards show just ingredients and method.', s.focus)}
      ${toggle('iconMode', 'Icon mode', 'Icons instead of words. Press and hold one to see its name.', s.iconMode)}
      ${toggle('controlsTop', 'Controls at the top', 'Tabs and buttons up top instead of under your thumb. This browser only.', s.controlsTop)}
      <div class="section a keep">Keys and screen readers</div>
      <p class="dim a">Turn pages with the arrow and page keys, the mouse wheel, or a swipe; Esc goes back. Ticks and switches say whether they’re on.</p>`;
    case 'colours': {
      const dark = isDark();
      return `<p class="dim a">${esc(palettes[s.palette]?.[0])}${palettes[s.palette]?.[2] ? `: ${esc(palettes[s.palette][2].toLowerCase())}` : ''}. Ink is best on e-ink.</p>
        ${paletteGroups.map((g) => `<div class="a"><div class="label">${g}</div><div class="flow">${Object.entries(palettes).filter(([, d]) => d[1] === g).map(([k, d]) => {
          const p = palette(k, dark);
          return `<button class="swatch ${s.palette === k ? 'on' : ''}" data-act="palette" data-v="${k}" style="background:${colourOf(p, 'paper')};color:${colourOf(p, 'ink')}" aria-pressed="${s.palette === k}"><span class="chip" style="background:${colourOf(p, 'accent')};border-color:${colourOf(p, 'ink')}"></span><span class="bold nm">${s.palette === k ? '✓ ' : ''}${d[0]}</span></button>`;
        }).join('')}</div></div>`).join('')}
        <div class="label keep">Colour strength</div>
        ${pick('accent', [['Full', 'Full'], ['Soft', 'Soft'], ['Ink', 'Ink only']], s.accent)}
        <p class="small dim a">Soft tones the colour down. Ink only keeps a scheme’s paper and type but makes buttons black, for e-ink screens.</p>
        <div class="a">${toggle('syntax', 'Syntax highlighting', 'Amounts, units, temperatures, times and cooking words, in each scheme’s own colours.', s.syntax)}
          ${s.syntax ? `<div class="box-panel rx">${highlight('Heat the oven to 400°F. Roast 2 lb potatoes for 35 minutes (turn them once).')}<br>${highlight('1½ cups flour, sifted')}</div>` : ''}</div>`;
    }
    case 'cooking': return `
      <div class="label keep">Amounts start in</div>
      ${pick('units-default', ['US', 'Metric', 'AsWritten'].map((u) => [u, unitLabel[u]]), s.units)}
      <p class="small dim a">Cards open in this. Each card’s units button goes round US → Metric → As written.</p>
      ${toggle('amountsInMethod', 'Amounts under each step', 'Each step lists the amounts of what it uses.', s.amountsInMethod)}
      ${toggle('keepAwake', 'Keep screen on', 'While a card or cook mode is open.', s.keepAwake)}`;
    case 'who': return `
      ${Object.entries(modes).map(([k, [t, a]]) => choice('mode', k, t, a, s.mode === k)).join('')}
      <div class="section a keep">Simple mode</div>
      <p class="a">Big, plain cards with nothing to change by accident: no editing and no Setup. A grown-up leaves it by pressing and holding the Books tab for three seconds.</p>
      ${Object.entries(simpleFor).map(([k, [t, a]]) => choice('simple-for', k, t, a, s.simpleFor === k)).join('')}
      ${toggle('simpleList', 'Can use the shopping list', '', s.simpleList)}
      <button class="btn a ${ui.confirm === 'simple' ? 'on' : ''}" style="width:100%" data-act="simple-on">${ui.confirm === 'simple' ? 'Tap again to turn on simple mode' : 'Turn on simple mode'}</button>`;
    case 'recipes': return `
      <div class="section a keep">Sync</div>${syncHtml()}
      <div class="section a keep">Starter books</div>
      <div class="flow a">${(ui.starter || []).map((b) => `<button class="btn small" data-act="starter" data-file="${b.file}">+ ${esc(b.name)}</button>`).join('')}</div>
      <div class="section a keep">Files</div>
      <div class="row-btns a"><button class="btn grow" data-act="open-file">Bring in a file…</button><button class="btn grow" data-act="save-copy">Save a copy…</button></div>
      <p class="small dim a">A copy is a Recipe Box file: the phone app opens it too. ${plural(box.recipes.length, 'card')} in ${plural(box.folders.length, 'book')} · ${plural(box.shopping.length, 'line')} on the list.</p>`;
    default: return `
      <p class="a"><b>Recipe Box</b>. The no-nonsense recipe box. No ads. No accounts. No life stories, pop-ups or autoplay videos. Just the card.</p>
      <div class="a">Recipe Box is free. If it’s earned a place in your kitchen, you can tip the cook.<br><a class="btn" style="margin-top:6px;text-decoration:none" href="${KO_FI}" target="_blank" rel="noopener">Support on Ko-fi</a></div>
      <div class="section a keep">Start again</div>
      <button class="btn a" style="width:100%" data-act="rewelcome">Run first-time setup again</button>
      <p class="small dim a">Version ${VERSION} · <a href="privacy.html" target="_blank">Privacy</a> · <a href="fonts/OFL.txt" target="_blank">Font licences</a> · <a href="https://github.com/Spagoodlers/recipe-box-web" target="_blank" rel="noopener">Source</a></p>`;
  }
}

function viewSetupPart(part) {
  if (part === 'recipes') loadStarters();
  return {
    html: `<div class="pages"><div class="content"><h1 class="title a">${setupParts[part]}</h1><hr class="rule a" style="margin:2px 0 8px">${setupPartBody(part)}</div></div>
      <div class="count"></div>
      <div class="bar">${btn('setup-back', 'Back', { g: 'back', icon: false })}<div class="grow bold">Setup</div></div>`,
    mount(el) { paged(el, `setup:${part}`); },
  };
}

// ---------------------------------------------------------------- editing

function viewEdit(id) {
  const isNew = id === 'new';
  const r = isNew ? box.newRecipe(ui.folder === ALL ? box.folders[0]?.id : ui.folder) : box.find(id);
  if (!r) return viewCard(id);
  ui.draft = r;
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  return {
    html: `<div class="title">${isNew ? 'New card' : 'Edit card'}</div>
      <div class="pages"><div class="content"><form class="form" data-form="edit" autocomplete="off">
        <div class="a"><label for="f-title">Name</label><input class="field" id="f-title" name="title" value="${esc(r.title)}" required></div>
        <div class="pair a">
          <div><label for="f-book">Book</label><select class="field" id="f-book" name="folderId">${opt('', 'No book', !r.folderId)}${box.folders.map((f) => opt(f.id, f.name, f.id === r.folderId)).join('')}${opt('__new__', '+ New book…', false)}</select></div>
          <div><label for="f-serves">Serves</label><input class="field" id="f-serves" name="servings" inputmode="numeric" value="${r.servings ?? ''}"></div>
          <div><label for="f-prep">Prep (min)</label><input class="field" id="f-prep" name="prepMin" inputmode="numeric" value="${r.prepMin ?? ''}"></div>
          <div><label for="f-cook">Cook (min)</label><input class="field" id="f-cook" name="cookMin" inputmode="numeric" value="${r.cookMin ?? ''}"></div>
        </div>
        <div class="a"><label for="f-ing">Ingredients · one a line · “## Sauce” starts a section</label><textarea class="field" id="f-ing" name="ingredients" rows="8">${esc(r.ingredients.join('\n'))}</textarea></div>
        <div class="a"><label for="f-steps">Method · one step a line</label><textarea class="field" id="f-steps" name="steps" rows="8">${esc(r.steps.join('\n'))}</textarea></div>
        <div class="a"><label for="f-notes">Notes</label><textarea class="field" id="f-notes" name="notes" rows="4">${esc(r.notes)}</textarea></div>
        <div class="a"><label for="f-url">Web page</label><input class="field" id="f-url" name="sourceUrl" value="${esc(r.sourceUrl)}"></div>
        ${isNew ? '' : `<button type="button" class="btn a ${ui.confirm === 'delete' ? 'on' : ''}" data-act="delete">${ui.confirm === 'delete' ? 'Tap again to delete this card' : 'Delete card…'}</button>`}
      </form></div></div>
      <div class="count"></div>
      <div class="row-btns"><button class="btn grow" data-act="edit-cancel">Close</button><button class="btn primary grow" data-act="edit-save">Save &amp; close</button></div>`,
    mount(el) {
      paged(el, `edit:${id}`);
      el.querySelector('.pages').style.touchAction = 'pan-y';
      el.querySelector('#f-book').addEventListener('change', (e) => {
        if (e.target.value !== '__new__') return;
        const name = prompt('Name of the new book');
        if (!name?.trim()) { e.target.value = r.folderId || ''; return; }
        const id2 = box.addBook(name.trim());
        e.target.insertAdjacentHTML('beforeend', opt(id2, name.trim(), true));
        e.target.value = id2;
      });
    },
  };
}

function saveEdit() {
  const form = document.querySelector('[data-form=edit]');
  const f = new FormData(form);
  const num = (k) => { const n = parseInt(f.get(k), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const lines = (k) => String(f.get(k) || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const r = {
    ...ui.draft,
    title: String(f.get('title') || '').trim(),
    folderId: f.get('folderId') && f.get('folderId') !== '__new__' ? f.get('folderId') : null,
    servings: num('servings'), prepMin: num('prepMin'), cookMin: num('cookMin'),
    ingredients: lines('ingredients'), steps: lines('steps'), notes: String(f.get('notes') || '').trim(), sourceUrl: String(f.get('sourceUrl') || '').trim(),
  };
  const empty = !r.title && !r.ingredients.length && !r.steps.length && !r.notes;
  if (empty && !box.find(r.id)) { back(); return; } // a blank new card isn't kept
  if (!r.title) r.title = 'Untitled recipe';
  if (r.prepMin || r.cookMin) r.totalMin = null;
  box.saveRecipe(r);
  location.replace(`#/card/${encodeURIComponent(r.id)}`);
}

// ---------------------------------------------------------------- print

function viewPrint(id) {
  const r = box.find(id);
  if (!r) return viewCard(id);
  const s = session(r);
  const o = settings.print;
  const html = printHtml([r], o, { factor: s.factor, units: s.units });
  ui.printHtml = html;
  const opt = (key, v, l) => `<button class="btn small ${o[key] === v ? 'on' : ''}" data-act="print-opt" data-key="${key}" data-v="${v}">${l}</button>`;
  const flag = (key, l) => `<button class="btn small ${o[key] ? 'on' : ''}" data-act="print-flag" data-key="${key}">${l}</button>`;
  return {
    html: `<div class="title"><span>Print · </span><span class="rx">${esc(r.title)}</span></div>
      <div style="flex:1;min-height:0"><iframe class="preview" title="Print preview" sandbox="allow-same-origin allow-modals" srcdoc="${esc(html)}"></iframe></div>
      <div class="flow">${opt('style', 'sheet', 'Kitchen sheet')}${opt('style', 'large', 'Large print')}${opt('paper', 'letter', 'Letter')}${opt('paper', 'a4', 'A4')}
        ${opt('size', 0, 'S')}${opt('size', 1, 'M')}${opt('size', 2, 'L')}${flag('serif', 'Serif')}</div>
      <div class="flow">${flag('notes', 'Notes')}${flag('info', 'Times & source')}${flag('boxes', 'Boxes to tick')}${flag('stepAmounts', 'Amounts under steps')}${flag('keepTogether', 'Keep things whole across pages')}</div>
      <div class="row-btns"><button class="btn primary grow" data-act="do-print">Print or save PDF</button><button class="btn" data-act="copy-html">Copy HTML</button>${btn('print-back', 'Back', { g: 'back', icon: false })}</div>`,
  };
}

// ---------------------------------------------------------------- what taps and keys do

const actions = {
  'notice-ok': () => notice(null),
  tab: (el) => { go(`#/${el.dataset.to}`); },
  book: (el) => { ui.folder = el.dataset.id === '' ? null : el.dataset.id; ui.tilePage = 0; render(); },
  shelf: (el) => { ui.shelf = (ui.shelf ?? 0) + +el.dataset.dir; render(); },
  'clear-q': () => { ui.query = ''; render(); },
  new: () => go('#/edit/new'),
  open: (el) => go(`#/card/${encodeURIComponent(el.dataset.id)}`),
  'open-swap': (el) => location.replace(`#/card/${encodeURIComponent(el.dataset.id)}`),
  letter: (el) => {
    const r = box.inBook(ui.folder).filter((x) => matches(x, ui.query)).find((x) => letterOf(x) === el.dataset.l);
    if (r) location.replace(`#/card/${encodeURIComponent(r.id)}`);
  },
  'back-books': () => go('#/books'),
  'step-card': (el) => { const { id } = route(); stepCard(id, +el.dataset.dir); },
  'card-tab': (el) => { const r = box.find(route().id); session(r).tab = el.dataset.tab; render(); },
  factor: (el) => { const r = box.find(route().id); session(r).factor = +el.dataset.f; render(); },
  serves: () => {
    const r = box.find(route().id);
    const s = session(r);
    const want = prompt(r.servings ? `Serves how many? (written for ${r.servings})` : 'Scale by how much? (2 = double)', r.servings ? String(Math.round(r.servings * s.factor)) : String(s.factor));
    const n = parseFloat(want);
    if (n > 0) { s.factor = r.servings ? n / r.servings : n; render(); }
  },
  units: () => { const s = session(box.find(route().id)); s.units = { US: 'Metric', Metric: 'AsWritten', AsWritten: 'US' }[s.units]; render(); },
  tick: (el) => {
    const r = box.find(route().id);
    const s = session(r);
    const set = el.dataset.kind === 'ing' ? s.checked : s.done;
    const i = +el.dataset.i;
    if (set.has(i)) set.delete(i); else set.add(i);
    render();
  },
  'clear-ticks': () => { const s = session(box.find(route().id)); s.checked.clear(); s.done.clear(); render(); },
  cook: () => { const r = box.find(route().id); session(r).step = null; ui.spokenAt = null; go(`#/cook/${encodeURIComponent(r.id)}`); },
  'cook-step': (el) => cookStep(box.find(route().id), +el.dataset.dir),
  'close-cook': () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); location.replace(`#/card/${encodeURIComponent(route().id)}`); },
  read: () => { const r = box.find(route().id); say(spoken(r, session(r))); },
  timer: (el) => { const r = box.find(route().id); startTimer(`${r.title} · step ${session(r).step + 1}`, +el.dataset.min); },
  'timer-off': (el) => { ui.timers = ui.timers.filter((t) => String(t.id) !== el.dataset.id); render(); },
  edit: () => go(`#/edit/${encodeURIComponent(route().id)}`),
  'edit-save': saveEdit,
  'edit-cancel': () => back(),
  delete: () => {
    if (ui.confirm !== 'delete') { ui.confirm = 'delete'; render(); return; }
    const { id } = route();
    box.deleteRecipe(id);
    ui.confirm = null;
    go('#/books');
    notice('Card deleted.');
  },
  'to-list': () => {
    const r = box.find(route().id);
    const s = session(r);
    const lines = r.ingredients.filter((l, i) => !l.startsWith('## ') && !s.checked.has(i)).map((l) => convert(scale(l, s.factor), s.units));
    const n = box.addToShopping(lines, r.title);
    notice(n ? `Added ${plural(n, 'line')} to the list.` : 'Already on the list.');
  },
  print: () => go(`#/print/${encodeURIComponent(route().id)}`),
  'print-back': () => location.replace(`#/card/${encodeURIComponent(route().id)}`),
  'print-opt': (el) => { const v = el.dataset.v; settings.print[el.dataset.key] = /^\d+$/.test(v) ? +v : v; saveSettings(); render(); },
  'print-flag': (el) => { settings.print[el.dataset.key] = !settings.print[el.dataset.key]; saveSettings(); render(); },
  'do-print': () => document.querySelector('.preview')?.contentWindow?.print(),
  'copy-html': async () => {
    try { await copyHtml(ui.printHtml); notice('Copied the HTML for this page.'); } catch { notice('The browser didn’t allow copying.'); }
  },
  shop: (el, e) => { if (e.target.closest('[data-act=shop-remove]')) return; box.toggleShopItem(el.dataset.id); },
  'shop-remove': (el) => box.removeShopItem(el.dataset.id),
  'clear-ticked': () => box.clearTicked(),
  'copy-list': async () => {
    const text = box.shopping.filter((s) => !s.done).map((s) => `• ${s.text}`).join('\n');
    try { await navigator.clipboard.writeText(text); notice('Copied the list.'); } catch { notice('The browser didn’t allow copying.'); }
  },
  starter: async (el) => { await addStarter(el.dataset.file); go('#/books'); },
  'setup-part': (el) => go(`#/setup/${el.dataset.part}`),
  'setup-back': () => go('#/setup'),
  toggle: (el) => { settings[el.dataset.key] = !settings[el.dataset.key]; saveSettings(); render(); },
  size: (el) => { settings.textScale = +el.dataset.v; saveSettings(); render(); },
  typeface: (el) => { settings.typeface = el.dataset.v; saveSettings(); render(); },
  theme: (el) => { settings.theme = el.dataset.v; saveSettings(); render(); },
  palette: (el) => { settings.palette = el.dataset.v; saveSettings(); render(); },
  accent: (el) => { settings.accent = el.dataset.v; saveSettings(); render(); },
  casing: (el) => { settings.casing = el.dataset.v; saveSettings(); render(); },
  spelling: (el) => { settings.spelling = el.dataset.v; saveSettings(); render(); },
  mode: (el) => { settings.mode = el.dataset.v; saveSettings(); render(); },
  'simple-for': (el) => { settings.simpleFor = el.dataset.v; settings.simpleList = el.dataset.v !== 'Kid'; saveSettings(); render(); },
  'simple-on': () => {
    if (ui.confirm !== 'simple') { ui.confirm = 'simple'; render(); return; }
    ui.confirm = null;
    setSimple(true);
    go('#/books');
  },
  'units-default': (el) => { settings.units = el.dataset.v; saveSettings(); ui.sessions.forEach((s) => { s.units = settings.units; }); render(); },
  'test-voice': () => say('Step 1. Heat the oven to 400 degrees. You’ll need: 2 cups flour.'),
  rewelcome: () => { settings.welcomed = false; ui.welcome = { page: 0, cook: null, picked: new Set(), who: null }; saveSettings(); go('#/welcome'); },
  'w-step': (el) => welcomeStep(+el.dataset.dir),
  'w-finish': () => finishWelcome(),
  'w-cook': (el) => { ui.welcome.cook = el.dataset.v; ui.welcome.picked = new Set(cookChoices[el.dataset.v][2]); render(); },
  'w-book': (el) => { const p = ui.welcome.picked; if (p.has(el.dataset.file)) p.delete(el.dataset.file); else p.add(el.dataset.file); render(); },
  'w-who': (el) => { ui.welcome.who = el.dataset.v; render(); },
  'open-file': () => openFile(),
  'save-copy': () => {
    const blob = new Blob([boxText(box.data)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `recipe-box-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  'sync-pick': () => syncCall(() => sync.pickFile()),
  'sync-new': () => syncCall(() => sync.createFile()),
  'sync-allow': () => syncCall(() => sync.reconnect()),
  'sync-now': () => syncCall(() => sync.run(), true),
  'sync-stop': () => { sync.stop(); notice('Sync off. The file is left as it is.'); },
  keep: (el) => syncCall(() => sync.run(el.dataset.keep), true),
};

/** Held, not tapped: shows a button's name (icon mode), or leaves simple mode (a grown-up, three seconds). */
const holds = {
  'leave-simple': () => {
    if (confirm('Leave simple mode? Editing and Setup come back.')) { setSimple(false); render(); }
  },
};
let holdTimer = null;
let held = false;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-hold], [data-hint]');
  held = false;
  clearTimeout(holdTimer);
  if (!el) return;
  const hold = el.dataset.hold;
  // A hint only when the name isn't already showing.
  if (!hold && el.querySelector('.word') && el.querySelector('.word').style.display !== 'none') return;
  holdTimer = setTimeout(() => {
    held = true;
    if (hold && holds[hold]) holds[hold]();
    else if (el.dataset.hint) { ui.hint = el.dataset.hint; render(); setTimeout(() => { ui.hint = null; render(); }, 1600); }
  }, hold ? 3000 : 550);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, () => clearTimeout(holdTimer)));

async function syncCall(f, sayUpToDate = false) {
  try {
    const said = await f();
    if (said) notice(said);
    else if (sync.conflict) render();
    else if (sayUpToDate) notice('Up to date.');
    else render();
  } catch (e) {
    if (e?.name !== 'AbortError') notice(`Couldn’t use that file: ${e.message}`);
  }
}

function openFile() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const other = parseBox(await file.text());
      const n = box.importBox(other);
      go('#/books');
      notice(n ? `Brought in ${plural(n, 'card')} from ${file.name}.` : `Nothing new in ${file.name}.`);
    } catch {
      notice(`${file.name} isn’t a Recipe Box file.`);
    }
  });
  input.click();
}

document.addEventListener('click', (e) => {
  // A hold that did something isn't also a tap.
  if (held) { held = false; e.preventDefault(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const f = actions[el.dataset.act];
  if (f) { e.preventDefault(); f(el, e); }
});
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, select');
  if (e.key === 'Escape' && !typing) { back(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=checkbox][data-act]')) { e.preventDefault(); e.target.click(); return; }
  if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
  const dir = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (dir && pageKeys && !(e.key === ' ' && e.target.closest('button'))) { e.preventDefault(); pageKeys(e.shiftKey && e.key === ' ' ? -1 : dir); }
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = new FormData(form);
  if (form.dataset.form === 'add-shop') {
    const text = String(data.get('item') || '').trim();
    if (text) { box.addToShopping([text], ''); setTimeout(() => document.querySelector('[name=item]')?.focus(), 0); }
  } else if (form.dataset.form === 'sync-link') {
    const url = String(data.get('url') || '').trim();
    if (url) syncCall(() => sync.useLink(url), true);
  }
});

// ---------------------------------------------------------------- start

let syncSoon = null;
box.onChange(() => {
  render();
  // Changes go to the file a moment later (and when the page is hidden).
  clearTimeout(syncSoon);
  syncSoon = setTimeout(() => quietSync(), 2500);
});
sync.onChange(() => {
  if (route().view === 'setup' || sync.conflict || document.querySelector('[role=alertdialog]')) render();
});

/** A sync nobody asked for: only news (something came in, something went wrong) is said. */
async function quietSync() {
  const said = await sync.run();
  if (said && (said.startsWith('Synced') || said.startsWith('Couldn'))) notice(said);
}
document.addEventListener('visibilitychange', () => { if (sync.on) quietSync(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applySettings(); render(); });
window.addEventListener('resize', () => fitTabLabels());

applySettings();
render();
sync.restore().then(() => quietSync());
