// Recipe Box on the web: the phone app's tabs and screens, reading and writing the same sync file.
// Screens live in the v-*.js modules; this draws the one the address asks for, inside the phone's
// layout (tabs along the bottom) or, on a big screen, a wide one (sections down the side).

import {
  box, settings, ui, sync, views, actions, holds, forms, hooks, route, go, back, esc, btn, glyph, notice, hint, polish, applySettings, saveSettings,
  dropPagers, pageKeys, wide, icons, canFind, canList, plural, paged, DEV_BOOK,
} from './core.js';
import { openRecipes, syncDevBook, timers, beep, say, addCardToList, setKeep } from './ops.js';
import './v-card.js';
import './v-books.js';
import './v-open.js';
import './v-list.js';
import './v-prep.js';
import './v-find.js';
import './v-setup.js';
import './v-print.js';
import { cardOf, startCook, startEdit, newCard, timerBarHtml } from './v-card.js';
import { railBooks } from './v-books.js';
import { prepOpened } from './v-prep.js';
import { takeFile } from './v-find.js';
import { syncCall } from './v-setup.js';

// ---------------------------------------------------------------- the tabs

/** Every tab, in the phone's order. Open shows only with something open; Prep with meal prep on. */
const TABS = [['open', 'Open'], ['books', 'Books'], ['cards', 'Cards'], ['prep', 'Prep'], ['list', 'List'], ['find', 'Find'], ['setup', 'Setup']];
function visibleTabs() {
  const hasOpen = openRecipes().length > 0 || ui.timers.length > 0;
  return TABS.filter(([k]) => ({
    open: hasOpen, list: canList(), find: canFind(), prep: settings.mealPrep && !settings.simpleMode, setup: !settings.simpleMode,
  }[k] ?? true));
}
function goTab(t) {
  if (t === 'prep') prepOpened();
  go(`#/${t}`);
}

// ---------------------------------------------------------------- drawing

let wake = null;
async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}

/** Screens that need editing, Setup or a switch someone hasn't got go back to the books. */
function allowed(view) {
  if (settings.simpleMode && ['setup', 'edit', 'print', 'prep', 'link', 'layout', 'deletebook', 'meal', 'prepplan', 'cupboard', 'importfile'].includes(view)) return false;
  if (view === 'find' && !canFind()) return false;
  if (view === 'list' && !canList()) return false;
  if (['prep', 'prepplan'].includes(view) && !settings.mealPrep) return false;
  return true;
}

function render() {
  const app = document.getElementById('app');
  dropPagers();
  ui.focusCard = null;
  ui.cookAction = null;
  ui.holdAction = null;
  applySettings();
  let r = route();
  if (!settings.welcomed && r.view !== 'welcome' && r.view !== 'take') { location.replace('#/welcome'); r = route(); }
  if (!views[r.view] || !allowed(r.view)) { location.replace('#/books'); r = route(); }
  const view = views[r.view](r.id, r.rest) || views.books();
  const tabs = visibleTabs();
  const tab = view.tab || (TABS.some(([k]) => k === r.view) ? r.view : 'books');
  const bare = !!view.bare;
  const isWide = wide();
  const showTimers = tab !== 'open' && ui.timers.length && !bare;
  const tabButtons = (cls) => tabs.map(([k, label]) => `
    <button class="${cls} ${tab === k ? 'on' : ''}" data-act="tab" data-to="${k}" aria-current="${tab === k ? 'page' : 'false'}" aria-label="${label}" data-hint="${label}">${glyph[k]}<span class="word">${label}</span>${cls === 'rail-tab' ? `<kbd data-raw>${TABS.findIndex(([x]) => x === k) + 1}</kbd>` : ''}</button>`).join('');
  const main = `
    <div id="timers">${showTimers ? timerBarHtml() : ''}</div>
    ${bare ? '' : conflictHtml()}
    <div id="screen" class="v-${r.view}">${view.html}</div>
    ${ui.hint ? `<div class="hint" role="status">${esc(ui.hint)}</div>` : ''}
    ${ui.notice ? `<div class="notice" role="status"><span>${esc(ui.notice)}</span>${btn('notice-ok', 'OK', { cls: 'small', icon: false })}</div>` : ''}`;
  document.documentElement.dataset.bare = bare ? '1' : '0';
  if (isWide && !bare) {
    const books = ['books', 'cards', 'card'].includes(r.view) && !(settings.simpleMode && box.scopes().length <= 2);
    app.innerHTML = `<nav class="rail" aria-label="Sections">
        <div class="brand"><b>Recipe Box</b>${sync.on ? `<span class="dim small" title="${esc(sync.state.message || '')}">${sync.busy ? 'Syncing…' : sync.conflict ? 'Sync: choose' : 'Synced'}</span>` : ''}</div>
        <div class="rail-tabs">${tabButtons('rail-tab')}</div>
        ${books ? railBooks() : ''}
      </nav><main class="main">${main}</main>`;
  } else {
    app.innerHTML = `${main}${bare ? '' : `<nav class="tabs" aria-label="Sections">${tabButtons('')}</nav>`}`;
  }
  view.mount?.(document.getElementById('screen'));
  const rb = app.querySelector('.rail-books');
  if (rb) paged(rb, `railbooks:${box.folders.length}`, { viewport: rb.querySelector('.pages'), keys: false })?.reveal(rb.querySelector('.rail-book.on')?.closest('.a'));
  polish(app);
  fitTabLabels();
  keepAwake(settings.keepAwake && ['card', 'cards', 'cook', 'full', 'open'].includes(r.view));
  document.title = ['card', 'cook', 'full'].includes(r.view) && (box.find(r.id) || ui.preview) ? `${(box.find(r.id) || ui.preview).title} · Recipe Box` : 'Recipe Box';
}
hooks.draw = () => render();

/** Tab names go when any would wrap (a narrow phone, big text): icons for all, rather than some broken. */
function fitTabLabels() {
  for (const bar of document.querySelectorAll('.tabs, .cardtabs')) {
    const words = bar.querySelectorAll('.word, .cardtabs button > span');
    if (!words.length) continue;
    if (icons()) { words.forEach((w) => { w.style.display = 'none'; }); continue; }
    words.forEach((w) => { w.style.display = ''; });
    // A name cut short (or on two lines) anywhere means icons everywhere on that bar.
    const tooWide = [...words].some((w) => w.scrollWidth > w.clientWidth + 1 || w.getBoundingClientRect().height > parseFloat(getComputedStyle(w).lineHeight) * 1.5);
    if (tooWide) {
      words.forEach((w) => { w.style.display = 'none'; });
      bar.querySelectorAll('button').forEach((b) => { if (!b.querySelector('svg')) return; b.setAttribute('aria-label', b.dataset.hint || b.dataset.tab || ''); });
    }
  }
}

/** When this browser and the sync file both changed: which to keep, Steam style. */
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
    <div class="row-btns">${btn('keep-side', 'Keep this browser’s', { cls: 'grow', attrs: `data-keep="device" ${sync.readOnly ? 'disabled title="The link is read only"' : ''}`, icon: false })}${btn('keep-side', 'Use the file’s', { cls: 'grow', attrs: 'data-keep="file"', icon: false })}</div></div>`;
}

actions.tab = (el) => goTab(el.dataset.to);
actions['notice-ok'] = () => notice(null);
actions.back = () => back();

// ---------------------------------------------------------------- taps, holds, keys

/** Held, not tapped (or right-clicked): what [data-hold] says; an icon's name, in icon mode. */
let holdTimer = null;
let held = false;
document.addEventListener('pointerdown', (e) => {
  held = false;
  clearTimeout(holdTimer);
  if (e.button !== 0) return;
  const el = e.target.closest('[data-hold], [data-hint]');
  if (!el) return;
  const hold = el.dataset.hold;
  // A name only when it isn't already showing.
  if (!hold && el.querySelector('.word') && el.querySelector('.word').style.display !== 'none' && !wide()) return;
  holdTimer = setTimeout(() => {
    held = true;
    if (hold && holds[hold]) holds[hold](el);
    else if (el.dataset.hint) hint(el.dataset.hint);
  }, 550);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => document.addEventListener(t, () => clearTimeout(holdTimer)));
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-hold]');
  if (!el || !holds[el.dataset.hold] || e.target.closest('input, textarea')) return;
  e.preventDefault();
  holds[el.dataset.hold](el);
});

document.addEventListener('click', (e) => {
  // A hold that did something isn't also a tap.
  if (held) { held = false; e.preventDefault(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const f = actions[el.dataset.act];
  if (f) { e.preventDefault(); f(el, e); }
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form]?.(form, new FormData(form));
});

/** The keyboard does what the phone's volume keys do, and more (Setup → Buttons & keys). */
document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, select');
  if (e.key === 'Escape') {
    if (typing) { e.target.blur(); return; }
    if (ui.notice) { notice(null); return; }
    if (route().view !== 'books') back();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=checkbox][data-act], [role=button][data-act]')) { e.preventDefault(); e.target.click(); return; }
  if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
  const dir = { ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1 }[e.key];
  if (dir && pageKeys() && !(e.key === ' ' && e.target.closest('button'))) { e.preventDefault(); pageKeys()(e.shiftKey && e.key === ' ' ? -1 : dir); return; }
  const said = shortcut(e.key);
  if (said) {
    e.preventDefault();
    if (settings.keyLog) notice(`${e.key.length === 1 ? e.key.toUpperCase() : e.key} → ${said}`);
  }
});

function shortcut(key) {
  const r = ui.focusCard;
  const k = key.length === 1 ? key.toLowerCase() : key;
  const n = TABS[+k - 1];
  if (n && /^[1-7]$/.test(k)) {
    if (!visibleTabs().some(([t]) => t === n[0])) return null;
    goTab(n[0]);
    return n[1];
  }
  if (ui.cookAction && (k === 'c' || k === 'Enter')) { ui.cookAction(); return 'Next'; }
  if (k === 'Enter' && ui.holdAction) { const [label, f] = ui.holdAction; f(); return label; }
  if (k === '/') { const q = document.querySelector('#q, #find-q, #book-find, #link-find, #meal-find, #pantry-find, [name=item]'); if (q) { q.focus(); return 'Search'; } return null; }
  if (k === 'n' && !settings.simpleMode) { newCard(); return 'New card'; }
  if (!r) return null;
  const el = document.querySelector(`[data-card="${CSS.escape(r.id)}"]`);
  if (k === '[' || k === ']') {
    const tabs = [...(el?.querySelectorAll('.cardtabs [data-tab]') || [])];
    if (!tabs.length) return null;
    const at = Math.max(0, tabs.findIndex((t) => t.classList.contains('on')));
    const next = tabs[(at + (k === ']' ? 1 : -1) + tabs.length) % tabs.length];
    next.click();
    return next.getAttribute('aria-label') || next.textContent.trim();
  }
  const press = (act) => { const b = el?.querySelector(`[data-act="${act}"]:not([disabled])`); if (b) { b.click(); return true; } return false; };
  if (k === 'c' && press('cook')) return `Cook ${r.title}`;
  if (k === 'k' && press('keep')) return r.keepProgress ? 'Put away' : 'Kept open';
  if (k === 'l' && press('to-list')) return 'Added to the list';
  if (k === 'e' && press('edit')) return 'Edit';
  if (k === 'f' && (press('full') || press('close-full'))) return 'Full';
  if (k === 'p' && press('print')) return 'Print';
  return null;
}

// ---------------------------------------------------------------- timers tick

setInterval(() => {
  if (!ui.timers.length) return;
  let finished = false;
  for (const t of ui.timers) if (!t.done && Date.now() >= t.end) { t.done = true; finished = true; }
  if (finished) {
    beep();
    if (settings.readAloud) say('Time’s up.');
    render();
    return;
  }
  // Only the bars move: nothing else on the page is redrawn, so typing and pages stay put.
  const bar = document.getElementById('timers');
  if (bar && bar.children.length) { bar.innerHTML = timerBarHtml(); polish(bar); }
  document.querySelectorAll('#screen .meter').forEach((m) => {
    const id = +(m.dataset.id || 0);
    const t = ui.timers.find((x) => x.id === id) || ui.timers.find((x) => m.closest('.cook') && x.key.startsWith(`${m.closest('[data-card]')?.dataset.card}#`));
    if (!t || t.done) return;
    const fill = m.querySelector('.fill');
    if (fill) fill.style.width = `${100 * timers.fraction(t)}%`;
    const span = m.querySelector('span');
    if (span && !ui.armed) span.textContent = span.textContent.replace(/^\d+(:\d+)+/, timers.left(t));
  });
}, 1000);
// A finished timer keeps calling every few seconds until it's dismissed, as on the phone.
setInterval(() => { if (ui.timers.some((t) => t.done)) beep(); }, 3000);

// ---------------------------------------------------------------- a file dropped on the page

document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); document.documentElement.dataset.drop = '1'; } });
document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) delete document.documentElement.dataset.drop; });
document.addEventListener('drop', (e) => {
  delete document.documentElement.dataset.drop;
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  e.preventDefault();
  if (settings.simpleMode) return;
  takeFile(file);
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
  if (route().view === 'setup' || sync.conflict || document.querySelector('[role=alertdialog]') || wide()) render();
});

/** A sync nobody asked for: only news (something came in, something went wrong) is said. */
async function quietSync() {
  const said = await sync.run();
  if (said && (said.startsWith('Synced') || said.startsWith('Couldn'))) notice(said);
}
actions['keep-side'] = (el) => syncCall(() => sync.run(el.dataset.keep), true);
document.addEventListener('visibilitychange', () => { if (sync.on) quietSync(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());
let resizeSoon = null;
let wasWide = wide();
window.addEventListener('resize', () => {
  clearTimeout(resizeSoon);
  resizeSoon = setTimeout(() => {
    // Crossing into or out of the wide layout redraws everything; otherwise only the tab names refit.
    if (wide() !== wasWide) { wasWide = wide(); render(); } else fitTabLabels();
  }, 150);
});
window.addEventListener('hashchange', () => { ui.confirm = null; ui.typingServes = null; render(); });

syncDevBook();
render();
sync.restore().then(() => quietSync());

export { startCook, startEdit, cardOf, addCardToList, setKeep, saveSettings, DEV_BOOK };
