// What every screen shares: the settings, the box and its sync, what's on screen right now, each
// card's ticks and place, the routes, icons, buttons, and pages. Screens register themselves in
// `views` and what their buttons do in `actions`; app.js draws them.

import { Box, ALL, DEV_BOOK } from './box.js';
import { Sync } from './sync.js';
import { Pager, swipe } from './paging.js';
import { upgradeOptions } from './print.js';
import { palette, paletteVars, colourOf, highlight, applyCase, toUs, defaultSpelling } from './look.js';
import { offByDefault } from './importer.js';
import { matches } from './units.js';

export const VERSION = '0.3.0';
export const KO_FI = 'https://ko-fi.com/spagoodlers';
export { ALL, DEV_BOOK };

// ---------------------------------------------------------------- settings (this browser only)

const region = (navigator.language || 'en-US').split('-')[1]?.toUpperCase();
const usCustomary = ['US', 'LR', 'MM', 'PR', 'GU', 'VI', 'AS', 'MP'];
const stored = (() => { try { return JSON.parse(localStorage.getItem('recipebox.settings')) || {}; } catch { return {}; } })();
export const box = new Box();
export const defaultUnits = usCustomary.includes(region) ? 'US' : 'Metric';

export const settings = {
  // This browser.
  textScale: 1.15, typeface: 'Sans', theme: 'system', roomy: false, big: false, palette: 'Ink', accent: 'Full',
  highContrast: false, syntax: false, controlsTop: false, readAloud: false, keepAwake: true, layout: 'auto',
  // What a backup carries, as on the phone.
  casing: 'AsWritten', spelling: defaultSpelling(region), focus: false, iconMode: false, units: defaultUnits, amountsInMethod: true,
  autoSubRecipes: true, branches: false, multiBook: false, mealPrep: false, prepNow: true, prepProfile: 'home',
  mode: 'Home', simpleMode: false, simpleFor: 'Plain', simpleFind: true, simpleList: true, beforeSimple: null,
  disabledSources: [...offByDefault], proxy: '',
  devMode: false, devCasings: false, codeFont: false, rawJson: false, debugInfo: false, steppers: false, aiCards: false, variants: false, keyLog: false,
  // Someone who already has recipes has no need of the first-run questions.
  welcomed: box.recipes.some((r) => r.folderId !== DEV_BOOK),
  ...stored,
};
settings.print = upgradeOptions(stored.print || {});

/** The settings a backup carries (the phone's box config): everything but how this screen looks. */
export const BOX_KEYS = ['disabledSources', 'simpleMode', 'simpleFor', 'simpleFind', 'simpleList', 'focus', 'iconMode', 'amountsInMethod', 'autoSubRecipes',
  'branches', 'mealPrep', 'keyLog', 'multiBook', 'mode', 'prepNow', 'prepProfile', 'units', 'spelling', 'casing', 'devMode', 'devCasings', 'rawJson',
  'debugInfo', 'steppers', 'aiCards', 'variants', 'beforeSimple'];
export function boxConfig() {
  const c = Object.fromEntries(BOX_KEYS.map((k) => [k, settings[k]]));
  c.mono = settings.codeFont;
  c.beforeSimple = settings.beforeSimple || '';
  return c;
}
export function applyBoxConfig(c) {
  for (const k of BOX_KEYS) if (k in c) settings[k] = c[k];
  if ('mono' in c) settings.codeFont = !!c.mono;
  if (!settings.beforeSimple) settings.beforeSimple = null;
  saveSettings();
}

export function saveSettings() {
  try { localStorage.setItem('recipebox.settings', JSON.stringify(settings)); } catch { /* private window: this visit only */ }
  applySettings();
}

export const typefaces = {
  Sans: { css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", about: 'Your device’s own.', width: 1 },
  Serif: { css: "Georgia, 'Times New Roman', serif", about: 'Your device’s own, with serifs.', width: 1 },
  Literata: { css: "'Literata', Georgia, serif", about: 'A book serif made for reading on screens. Good on e-ink.', width: 1.05 },
  'Atkinson Hyperlegible': { css: "'Atkinson Hyperlegible', sans-serif", about: 'For low vision: every letter clearly different (I l 1, O 0).', width: 1.1 },
  Lexend: { css: "'Lexend', sans-serif", about: 'Wide and even, to ease reading strain.', width: 1.15 },
  OpenDyslexic: { css: "'OpenDyslexic', sans-serif", about: 'Weighted letters that don’t flip or swim. For dyslexia.', width: 1.25 },
  Andika: { css: "'Andika', sans-serif", about: 'Plain, clear letters made for new readers.', width: 1.05 },
  'Comic Neue': { css: "'Comic Neue', sans-serif", about: 'Friendly and casual; easy for many dyslexic readers.', width: 1 },
  Code: { css: "ui-monospace, 'Cascadia Mono', Consolas, 'Courier New', monospace", about: '', width: 1.2, dev: true },
};
export const sizes = [[0.85, 'XS'], [1, 'S'], [1.15, 'M'], [1.3, 'L'], [1.5, 'XL'], [2, 'XXL']];
export const modes = {
  Home: ['Home cook', 'Books, cards, cooking, a shopping list and a cupboard, and planning the week at home.'],
  Chef: ['Chef', 'Everything for a kitchen: plan layouts for services and prep, a cupboard per kitchen, cards in several books, prep sheets and receipt-printer prints, batch sizes.'],
};
export const simpleForOpts = {
  Kid: ['A kid', 'Just books and cards, with icons. No searching the web, no list, nothing to change by accident.', { find: false, list: false, icons: true }],
  Plain: ['Someone who wants it plain', 'Grandparents and anyone who wants big, plain cards with words on every button. Can still find recipes online and keep a list.', { find: true, list: true, icons: false }],
};

export const isDark = () => settings.theme === 'dark' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
/** Icons instead of words: icon mode (simple mode for a kid turns it on). */
export const icons = () => !!settings.iconMode;
export const kid = () => settings.simpleMode && settings.simpleFor === 'Kid';
/** The rule: developer mode has everything; simple mode none of these; a chef all; a home cook branches. */
export const allows = (f) => settings.devMode || (!settings.simpleMode && (settings.mode === 'Chef' || f === 'Branches'));
export const canFind = () => !settings.simpleMode || settings.simpleFind;
export const canList = () => !settings.simpleMode || settings.simpleList;
export const branchesOn = () => settings.branches && allows('Branches');
export const multiBookOn = () => settings.multiBook && allows('MultiBook');
/** A big screen gets the wide layout: the sections down the side, panes side by side. */
export const wide = () => settings.layout !== 'phone' && window.innerWidth >= 1000;

export function applySettings() {
  const root = document.documentElement;
  root.style.setProperty('--scale', settings.textScale);
  const face = settings.typeface === 'Code' && !settings.codeFont ? 'Sans' : settings.typeface;
  root.style.setProperty('--font', (typefaces[face] || typefaces.Sans).css);
  const p = palette(settings.palette, isDark(), { highContrast: settings.highContrast, accent: settings.accent });
  for (const [k, v] of Object.entries(paletteVars(p))) root.style.setProperty(k, v);
  root.style.colorScheme = p.dark ? 'dark' : 'light';
  root.dataset.big = settings.big ? '1' : '0';
  root.dataset.roomy = settings.roomy ? '1' : '0';
  root.dataset.top = settings.controlsTop ? '1' : '0';
  root.dataset.wide = wide() ? '1' : '0';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', colourOf(p, 'paper'));
}
/** How much wider than Sans a line runs (wide typefaces, roomy spacing), for choosing columns. */
export const textWidth = () => (typefaces[settings.typeface]?.width || 1) * (settings.roomy ? 1.08 : 1) * settings.textScale;

// ---------------------------------------------------------------- what's on screen

export const sync = new Sync(box);
export const ui = {
  folder: ALL, query: '', notice: null, hint: null, tilePage: 0, fromEnd: false, cardIndex: 0,
  timers: [], pages: new Map(), confirm: null, starter: null, shelf: null,
  welcome: { page: 0, cook: null, picked: new Set(), who: null },
  prepSpan: 'Week', prepAnchor: null, panel: null, draft: null, print: null, importing: null, importFile: null,
  find: { query: '', last: '', results: [], expanded: new Set(), mixed: false, link: '' },
  pendingLink: null, lastBook: null, shownVariant: new Map(), wipeArmed: false, spokenAt: null,
};

/** Every place the book arrows go, in order: all books, each book, loose cards. */
export const scopes = () => box.scopes({ hideDev: settings.simpleMode && ui.folder !== DEV_BOOK });
export const bookName = (id = ui.folder) => box.folderName(id);
/** The cards on show: the book's, matching the search. */
export const shownCards = () => box.inBook(ui.folder).filter((r) => matches(r, ui.query));
export function setFolder(id) {
  if (id !== ui.folder) { ui.cardIndex = 0; ui.tilePage = 0; }
  ui.folder = id;
  if (id !== ALL && id != null && id !== DEV_BOOK) ui.lastBook = id;
}

// ---------------------------------------------------------------- card sessions

// Every card's ticks, scale, tab and cook-mode step, kept in this browser between visits until
// cleared (units aren't kept: cards open in Setup's choice). A card kept open carries its ticks in
// the box itself, so they sync.
const SESSIONS = 'recipebox.sessions';
const sessions = new Map();
try {
  for (const [id, s] of Object.entries(JSON.parse(localStorage.getItem(SESSIONS)) || {})) {
    sessions.set(id, { tab: s.tab || 'ingredients', factor: s.factor > 0 ? s.factor : 1, checked: new Set(s.checked || []), done: new Set(s.done || []), step: s.step ?? null, complete: !!s.complete, units: settings.units });
  }
} catch { /* nothing kept */ }
let saveSoon = null;
function saveSessions() {
  clearTimeout(saveSoon);
  saveSoon = setTimeout(() => {
    const o = {};
    for (const [id, s] of sessions) {
      if (id.startsWith('dev-palette') || id.startsWith('dev-feature')) continue;
      o[id] = { tab: s.tab, factor: s.factor, step: s.step, checked: [...s.checked], done: [...s.done], complete: s.complete };
    }
    try { localStorage.setItem(SESSIONS, JSON.stringify(o)); } catch { /* ignore */ }
  }, 400);
}

/** A card while it's open: tab, scale, units, ticks, the cook-mode step, and Done on the Open tab. */
export function session(r) {
  if (!sessions.has(r.id)) {
    sessions.set(r.id, {
      tab: 'ingredients', factor: r.keepProgress ? r.scale || 1 : 1, units: String(r.id).startsWith('dev-') ? 'AsWritten' : settings.units,
      checked: new Set(r.keepProgress ? r.checkedIngredients : []), done: new Set(r.keepProgress ? r.checkedSteps : []), step: null, complete: false,
    });
  }
  return sessions.get(r.id);
}
/** A change to a card's session: kept here, and (kept open) in the box too. */
export function touched(r) {
  const s = session(r);
  saveSessions();
  if (r.keepProgress && box.find(r.id)) box.setProgress(r.id, true, s.checked, s.done, s.factor);
  hooks.touched?.(r, s);
}
export function resetSession(r) {
  sessions.delete(r.id);
  saveSessions();
  if (r.keepProgress) box.setProgress(r.id, true, [], [], 1);
}
export function dropSession(id) { sessions.delete(id); saveSessions(); }
export const allSessions = () => sessions;

// ---------------------------------------------------------------- text

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, one, many = `${one}s`) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
export const recipeCount = (n) => plural(n, 'recipe');
/** Recipe text: highlighted like code when that's on, as plain text otherwise. */
export const rtext = (s) => (settings.syntax ? highlight(s) : esc(s));

let noticeTimer = null;
/** One line at the foot of the screen; it clears itself after a few seconds. */
export function notice(text) {
  ui.notice = text;
  clearTimeout(noticeTimer);
  if (text) noticeTimer = setTimeout(() => { ui.notice = null; draw(); }, 6000);
  draw();
}
let hintTimer = null;
/** A button's name, shown briefly (icon mode, a press and hold). */
export function hint(text) {
  ui.hint = text;
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { ui.hint = null; draw(); }, 2500);
  draw();
}

/**
 * The finishing pass over drawn text, as the app does in its Text: the app's own words in the
 * chosen spelling (recipes, marked .rx, stay as written), then the chosen casing (names take Title
 * Case and the programmer casings; lowercase takes everything).
 */
const nameSel = 'button, h1, h2, h3, .label, .title, .tabs, .rail-tab, .cover, .section, .from, .nm';
export function polish(root) {
  if (!root || (settings.spelling !== 'US' && settings.casing === 'AsWritten')) return;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('[data-raw], textarea, style, script, input')) continue;
    let t = n.nodeValue;
    if (settings.spelling === 'US' && !el.closest('.rx')) t = toUs(t);
    // A line about something (under a switch, a Setup row) is body text, not a name.
    t = applyCase(t, settings.casing, !!el.closest(nameSel) && !el.closest('.about, .n, .meta, .dim, .rx-body'));
    if (t !== n.nodeValue) n.nodeValue = t;
  }
  for (const el of root.querySelectorAll('[placeholder]')) {
    let t = el.getAttribute('placeholder');
    if (settings.spelling === 'US') t = toUs(t);
    el.setAttribute('placeholder', applyCase(t, settings.casing, false));
  }
}

// ---------------------------------------------------------------- routes (the back button works)

export function route() {
  const [, view = 'books', ...rest] = location.hash.replace(/^#/, '').split('/');
  return { view, id: rest.length ? decodeURIComponent(rest[0]) : null, rest: rest.map(decodeURIComponent) };
}
export const go = (hash) => { if (location.hash === hash) draw(); else location.hash = hash; };
export const swap = (hash) => { location.replace(hash); draw(); };
export const back = () => (history.length > 1 ? history.back() : go('#/books'));
export const cardHash = (id) => `#/card/${encodeURIComponent(id)}`;

// ---------------------------------------------------------------- icons and buttons

const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const glyph = {
  open: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  books: svg('<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-1 3 15-3.5 1z"/>'),
  cards: svg('<rect x="3" y="7" width="15" height="13" rx="1"/><path d="M7 4h13v13"/>'),
  prep: svg('<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  list: svg('<path d="M3 4h2l2.5 11h10L20 7H6.5"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
  find: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>'),
  setup: svg('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="var(--paper)"/><circle cx="15" cy="12" r="2" fill="var(--paper)"/><circle cx="8" cy="17" r="2" fill="var(--paper)"/>'),
  cook: svg('<path d="M7 4l13 8-13 8z"/>'),
  edit: svg('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0"/>'),
  pencil: svg('<path d="M4 20l4-1 11-11-3-3L5 16z"/>'),
  clear: svg('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'),
  keep: svg('<path d="M6 3h12v18l-6-4-6 4z"/>'),
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  print: svg('<rect x="3" y="9" width="18" height="8" rx="1"/><rect x="7" y="3" width="10" height="6"/><rect x="7" y="14" width="10" height="7"/>'),
  read: svg('<path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  close: svg('<path d="M5 5l14 14M19 5L5 19"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  share: svg('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>'),
  clip: svg('<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2h6v2"/>'),
  spark: svg('<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>'),
  ingredients: svg('<circle cx="5" cy="6" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="5" cy="18" r="1.2"/><path d="M9 6h11M9 12h11M9 18h11"/>'),
  method: svg('<path d="M4 18h5v-5h5V8h6"/>'),
  recipe: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M10 4v16M5 9h3M5 13h3M13 9h6M13 13h6M13 17h4"/>'),
  notes: svg('<path d="M4 20l4-1 11-11-3-3L5 16z"/>'),
  nutrition: svg('<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14zM5 19l8-8"/>'),
  info: svg('<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V2h6v2M9 10h6M9 14h6"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  check: svg('<path d="M4 12l5 5L20 6"/>'),
};

/**
 * A button with an icon and its name. In icon mode the name goes (the icon says it, and holding
 * shows it); a screen reader always hears it.
 */
export function btn(act, label, { g = null, cls = '', attrs = '', icon = icons(), on = false, disabled = false } = {}) {
  const showIcon = g && glyph[g];
  const bare = icon && showIcon;
  return `<button class="btn ${cls} ${on ? 'on' : ''}" data-act="${act}" ${attrs} ${disabled ? 'disabled' : ''} ${bare ? `aria-label="${esc(label)}" data-hint="${esc(label)}"` : ''}>${showIcon ? glyph[g] : ''}${bare ? '' : `<span>${esc(label)}</span>`}</button>`;
}

/** A switch: a name, a line on what it does, and ON / OFF. The whole row taps. */
export function toggle(key, label, about, on = settings[key], act = 'toggle') {
  return `<button class="toggle a" role="switch" aria-checked="${!!on}" data-act="${act}" data-key="${key}">
    <span class="what"><b class="nm">${esc(label)}</b>${about ? `<span class="about">${esc(about)}</span>` : ''}</span><span class="sw ${on ? 'on' : ''}">${on ? 'ON' : 'OFF'}</span></button>`;
}

/** A big answer to tap. */
export function choice(act, value, title, about, on) {
  return `<button class="choice a ${on ? 'on' : ''}" data-act="${act}" data-v="${esc(value)}" role="radio" aria-checked="${on}">
    <span class="bold nm">${on ? '●' : '○'} ${esc(title)}</span><span class="about">${esc(about)}</span></button>`;
}

/** A row of choices, one picked. */
export const pick = (act, opts, current, cls = 'small grow') => `<div class="row-btns a">${opts.map(([v, l]) => `<button class="btn ${cls} ${current === v ? 'on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;

/** The way back, at the foot of a pushed screen. */
export const backBar = (title, act = 'back') => `<div class="bar backbar">${btn(act, 'Back', { g: 'back', icon: false })}<div class="grow bold nm">${esc(title)}</div></div>`;

// ---------------------------------------------------------------- pages

let pagers = [];
let primaryKeys = null;
export const pageKeys = () => primaryKeys;
export function setPageKeys(f) { primaryKeys = f; }
export function dropPagers() { pagers.forEach((p) => p.destroy()); pagers = []; primaryKeys = null; }

/**
 * A paged area: the page turns with swipes, keys and the wheel; past its ends, onEdge. `keys`
 * false leaves the arrow keys to another area on the same screen.
 */
export function paged(el, key, { onEdge = null, bottom = false, fromEnd = false, keys = true, viewport = null } = {}) {
  const vp = viewport || el.querySelector('.pages');
  if (!vp) return null;
  const content = vp.querySelector('.content');
  const count = vp.parentElement.querySelector(`.count[data-for="${vp.id}"]`) || (vp.nextElementSibling?.classList.contains('count') ? vp.nextElementSibling : null);
  // Content that fits sits by the thumb: at the foot (the head, with controls at the top).
  const pager = new Pager(vp, content, { onEdge, countEl: count, bottom: bottom && !settings.controlsTop, start: ui.pages.get(key) || 0, onTurn: (v) => ui.pages.set(key, v) });
  if (fromEnd) { pager.toEnd(); ui.pages.set(key, pager.v); }
  pagers.push(pager);
  if (keys) primaryKeys = (dir) => pager.turn(dir);
  swipe(vp, (dir) => pager.turn(dir));
  return pager;
}
export { swipe };

// ---------------------------------------------------------------- the registries

/** Screens: name → (route) → { html, mount?(el), wide?: bool, title?, tab? }. */
export const views = {};
/** What a tap does: data-act → (el, event). */
export const actions = {};
/** What a press and hold (or a right-click) does: data-hold → (el). */
export const holds = {};
/** What Enter in a form does: data-form → (form, data). */
export const forms = {};
/** Late-bound: app.js fills these in. */
export const hooks = { draw: () => {}, touched: null };
export const draw = () => hooks.draw();

/** The card a route is about. */
export const routeCard = () => box.find(route().id) || ui.draft;
