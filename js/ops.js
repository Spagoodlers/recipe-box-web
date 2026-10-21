// What the app does, as the phone's AppState: keeping cards open (their sub-recipes with them),
// the Open tab's time estimates, linking one card to a line of another, adding a card to the list
// past the cupboard, saving edits so links keep their lines, branches and variants, simple mode,
// home cook or chef, developer mode and its book of secrets, and kitchen timers.

import { box, settings, ui, session, touched, resetSession, dropSession, notice, saveSettings, allows, setFolder, draw, go, hint, ALL, DEV_BOOK } from './core.js';
import { scale, convert } from './units.js';
import { uuid } from './box.js';
import { profilesOf, cupboardOf, Pantry, HOME, kitchen as newKitchen, effectiveTotal } from './kitchen.js';
import { devRecipes, SOUP, STEW, MENUS, SECRETS, FLAGS, FLAG_NOTICES, PALETTE_LINES, PAELLA, FONDUE, DEV_NAME, seedLibrary, SEED_BOOK } from './devbook.js';

// ---------------------------------------------------------------- kept open, and the Open tab

/** Recipes kept open with Keep, A–Z. */
export const openRecipes = () => box.sorted().filter((r) => r.keepProgress);

/** The cards a card links to as sub-recipes (the salsa for the tacos), once each. */
export function subRecipesOf(r) {
  const seen = new Set();
  return (r.subRecipes || []).map((s) => box.resolve(s)).filter((x) => x && x.id !== r.id && !seen.has(x.id) && seen.add(x.id));
}

/** The sub-recipes the Open tab lists under a card: the ones kept open (with the setting off, all, as reminders). */
export const openChildren = (r) => subRecipesOf(r).filter((c) => c.keepProgress || !settings.autoSubRecipes);

/** Every card under a card: its sub-recipes, theirs, and so on (each once; not through `skip`). */
export function descendantsOf(r, skip = null) {
  const found = new Map();
  const walk = (x, depth) => {
    if (depth > 6) return;
    for (const c of subRecipesOf(x)) {
      if (c.id !== r.id && c.id !== skip && !found.has(c.id)) { found.set(c.id, c); walk(c, depth + 1); }
    }
  };
  walk(r, 0);
  return [...found.values()];
}

/**
 * Keeps a card open (or not). With the setting on, everything it links to goes along with it;
 * closing it leaves open any that another open card still needs.
 */
export function setKeep(r, keep) {
  const s = session(r);
  box.setProgress(r.id, keep, s.checked, s.done, s.factor);
  if (!settings.autoSubRecipes) return;
  const tree = descendantsOf(r);
  const treeIds = new Set([r.id, ...tree.map((t) => t.id)]);
  const others = openRecipes().filter((o) => !treeIds.has(o.id));
  for (const c of tree) {
    if (!!box.find(c.id)?.keepProgress === keep) continue;
    if (!keep && others.some((o) => descendantsOf(o, r.id).some((d) => d.id === c.id))) continue;
    const cs = session(c);
    box.setProgress(c.id, keep, cs.checked, cs.done, cs.factor);
  }
}

/** Done on the Open tab: it moves down to Complete (and out of the time estimate). */
export function setComplete(r, done) { session(r).complete = done; touched(r); draw(); }

/**
 * A good-faith estimate of the cooking left on the Open tab: each recipe's (and listed
 * sub-recipe's) time, less the share of its steps already ticked; done ones don't count.
 */
export function minutesLeft(active) {
  const counted = new Set();
  const left = (r, depth) => {
    if (counted.has(r.id) || depth > 6) return 0;
    counted.add(r.id);
    const s = session(r);
    let own = 0;
    if (!s.complete) {
      const total = effectiveTotal(r) || 0;
      const steps = r.steps.filter((x) => !x.startsWith('## ')).length;
      own = steps ? Math.floor(total * (1 - s.done.size / steps)) : total;
    }
    return own + openChildren(r).reduce((n, c) => n + left(c, depth + 1), 0);
  };
  return active.reduce((n, r) => n + left(r, 0), 0);
}

// ---------------------------------------------------------------- links between cards

/** Links a card to one line of another ("hot sauce" on the wings → your Hot Sauce card). */
export function linkCard(to, kind, index, card) {
  const link = { name: card.title, url: card.sourceUrl || '', kind, index, recipeId: card.id };
  box.saveRecipe({ ...to, subRecipes: [...(to.subRecipes || []).filter((s) => !(s.kind === kind && s.index === index && box.resolve(s)?.id === card.id)), link] });
  // Kept open already: the new sub-recipe joins it on the Open tab.
  const now = box.find(to.id);
  if (now?.keepProgress && settings.autoSubRecipes) setKeep(now, true);
  notice(`Linked “${card.title}”.`);
}
export function unlinkCard(from, link) {
  box.saveRecipe({ ...from, subRecipes: (from.subRecipes || []).filter((s) => !(s.kind === link.kind && s.index === link.index && s.name === link.name && s.url === link.url && s.recipeId === link.recipeId)) });
}

/** The links on one line: its own sub-recipes, then other cards it names ("1 cup pico de gallo" → your Pico de Gallo). */
export function linksOn(r, kind, index, line, mentionable) {
  const subs = (r.subRecipes || []).filter((s) => s.kind === kind && s.index === index).map((s) => {
    const have = box.resolve(s);
    return { label: have?.title || s.name, recipeId: have?.id || null, url: s.url || null };
  });
  const linked = new Set(subs.map((s) => s.recipeId).filter(Boolean));
  const lower = line.toLowerCase();
  return [...subs, ...mentionable.filter(([c, rx]) => !linked.has(c.id) && rx.test(lower)).map(([c]) => ({ label: c.title, recipeId: c.id, url: null }))];
}

/** Cards another card could mention by name. */
export function mentionable(r) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return box.recipes.filter((c) => c.id !== r.id && !c.id.startsWith('dev-') && c.folderId !== DEV_BOOK && c.title.trim().length >= 5)
    .map((c) => [c, new RegExp(`(?<![\\p{L}\\d])${esc(c.title.trim().toLowerCase())}(?![\\p{L}\\d])`, 'u')]);
}

// ---------------------------------------------------------------- the cupboard and the list

/** The plan layout Prep is showing (the household for a home cook). */
export function activeProfile() {
  const all = profilesOf(box.data);
  if (!allows('Kitchens')) return all[0];
  return all.find((p) => p.id === settings.prepProfile) || all[0];
}
export const profiles = () => (allows('Kitchens') ? profilesOf(box.data) : profilesOf(box.data).slice(0, 1));

/** A plan layout's cupboard (or the one Prep is showing). */
export function cupboard(profileId = null) {
  const all = profilesOf(box.data);
  const p = all.find((x) => x.id === (profileId ?? activeProfile().id)) || all[0];
  return cupboardOf(p.cupboard);
}
export function saveCupboard(profileId, c) {
  const p = profilesOf(box.data).find((x) => x.id === profileId);
  if (p) box.saveProfile({ ...p, cupboard: c });
}
/** Something was bought off the list: any cupboard low on it has it again. */
export function restocked(text) {
  for (const p of profilesOf(box.data)) {
    const c = cupboard(p.id);
    const key = Pantry.staples.find((s) => s.label.toLowerCase() === text.toLowerCase())?.key
      ?? (c.extra.find((w) => w.toLowerCase() === text.toLowerCase()) ? Pantry.extraKey(text) : null);
    if (key && c.low.includes(key)) saveCupboard(p.id, { ...c, low: c.low.filter((k) => k !== key), have: [...new Set([...c.have, key])] });
  }
}

/** A card's not-yet-ticked ingredients onto the list, as scaled and converted; the cupboard's left off. */
export function addCardToList(r) {
  const s = session(r);
  const lines = r.ingredients.map((l, i) => [l, i]).filter(([l, i]) => !l.startsWith('## ') && !s.checked.has(i)).map(([l]) => convert(scale(l, s.factor), s.units));
  const c = cupboard();
  const have = lines.filter((l) => Pantry.has(l, c));
  const buy = lines.filter((l) => !Pantry.has(l, c));
  const n = box.addToShopping(buy, r.title);
  const skipped = have.length ? ` (${have.length} from the cupboard left off)` : '';
  notice(n ? `Added ${n} to the list.${skipped}` : `Already on the list.${skipped}`);
}

// ---------------------------------------------------------------- saving, branches, variants

/** Saves an edited card. Line numbers shift when the lists change, so ticks go and links follow their line. */
export function saveEdited(old, next) {
  const changed = JSON.stringify(old.ingredients) !== JSON.stringify(next.ingredients) || JSON.stringify(old.steps) !== JSON.stringify(next.steps);
  if (!changed) { box.saveRecipe(next); return; }
  dropSession(old.id);
  const subs = (next.subRecipes || []).map((s) => {
    const oldLines = s.kind === 'i' ? old.ingredients : old.steps;
    const newLines = s.kind === 'i' ? next.ingredients : next.steps;
    const text = oldLines[s.index];
    const atNew = text == null ? -1 : newLines.indexOf(text);
    return atNew < 0 ? null : { ...s, index: atNew };
  }).filter(Boolean);
  box.saveRecipe({ ...next, checkedIngredients: [], checkedSteps: [], subRecipes: subs });
}

/** A new recipe made from another (Spicy Ketchup from Ketchup), opened in the editor as "Ketchup (2)". */
export function branchDraft(from) {
  const base = from.title.trim().replace(/\s*\(\d+\)$/, '');
  const taken = new Set(box.recipes.map((r) => r.title.trim().toLowerCase()));
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase()) && n < 999) n++;
  const now = Date.now();
  return { ...structuredClone(from), id: uuid(), title: `${base} (${n})`, branchOf: from.id, variantOf: null, version: '', keepProgress: false, checkedIngredients: [], checkedSteps: [], scale: 1, created: now, updated: now };
}

/** Saves an edit as a new variant of a card, next version up, and shows it. */
export function saveVariant(from, edited) {
  const now = Date.now();
  const v = { ...edited, id: uuid(), variantOf: from.variantOf || from.id, version: box.nextVersion(from), keepProgress: false, checkedIngredients: [], checkedSteps: [], scale: 1, created: now, updated: now };
  box.saveRecipe(v);
  ui.shownVariant.set(v.variantOf, v.id);
  notice(`Saved as version ${v.version}.`);
}

// ---------------------------------------------------------------- modes

/** Home cook or chef, with the setup that suits: a chef gets Prep with a kitchen plan, cards in several books and branches. */
export function chooseMode(m) {
  if (m === 'Chef') {
    let k = profilesOf(box.data).find((p) => p.id !== HOME);
    if (!k) { k = newKitchen(); box.saveProfile(k); }
    Object.assign(settings, { mode: m, mealPrep: true, multiBook: true, branches: true, prepProfile: k.id });
    saveSettings();
    notice(`Chef mode: Prep is set up for ${k.name} (services, mise en place, a dry store). Change it in Setup.`);
  } else {
    Object.assign(settings, { mode: m, prepProfile: HOME });
    saveSettings();
    notice('Home cook mode.');
  }
}

export function chooseSimpleFor(who) {
  const o = { Kid: { find: false, list: false }, Plain: { find: true, list: true } }[who];
  Object.assign(settings, { simpleFor: who, simpleFind: o.find, simpleList: o.list });
  saveSettings();
}

/** Developer mode off, and every developer feature with it. */
function withoutDeveloper() {
  Object.assign(settings, { devMode: false, devCasings: false, codeFont: false, rawJson: false, debugInfo: false, steppers: false, aiCards: false, variants: false, keyLog: false });
  if (['Snake', 'Camel', 'Pascal', 'Kebab', 'Screaming', 'Sponge'].includes(settings.casing)) settings.casing = 'AsWritten';
  if (settings.typeface === 'Code') settings.typeface = 'Sans';
  if (settings.palette && !['Ink', 'Paper', 'Newsprint', 'Charcoal'].includes(settings.palette) && isWeird(settings.palette)) settings.palette = 'Ink';
}
const isWeird = (p) => ['Terminal', 'Amber', 'Blueprint', 'Parchment', 'Vaporwave', 'HiVis', 'NightShift', 'GameBoy', 'Commodore', 'Cyberpunk', 'Bubblegum', 'Diner', 'PunchCard', 'Desktop', 'Syntax', 'SyntaxLight', 'Monokai', 'Dracula', 'SolarizedDark', 'SolarizedLight', 'Nord'].includes(p);

/** Simple mode also turns on focus and (for a kid) icon mode, and puts them back as they were when it ends. */
export function setSimpleMode(on) {
  if (on) withoutDeveloper();
  if (on) {
    settings.beforeSimple = `${settings.focus},${settings.iconMode}`;
    Object.assign(settings, { simpleMode: true, focus: true, iconMode: settings.simpleFor === 'Kid' });
  } else {
    const [f, i] = (settings.beforeSimple || 'false,false').split(',').map((x) => x === 'true');
    Object.assign(settings, { simpleMode: false, focus: f, iconMode: i, beforeSimple: null });
  }
  saveSettings();
  dropSession(SOUP);
  syncDevBook();
  if (on) {
    setFolder(ALL);
    ui.query = '';
    go('#/books');
    // A kid shouldn't be told the way out; grown-ups find it in Setup.
    notice(settings.simpleFor === 'Kid' ? 'Simple mode on.' : 'Simple mode on (someone who wants it plain). To leave it: open Developer Recipes on the shelf and tick every line of Developer Soup.');
  } else notice('Simple mode off.');
}

/** Seven taps on the version number. Turning it off also resets every secret. */
export function setDevMode(on) {
  if (on) settings.devMode = true; else withoutDeveloper();
  saveSettings();
  syncDevBook();
  notice(on ? 'You’re a developer now. Developer Recipes is in your Books.' : 'Developer mode off.');
}

/**
 * Puts in the box exactly the Developer Recipes cards that should be there: all of them in
 * developer mode; otherwise just the ones in use (Developer Soup in simple mode, the stew while a
 * delete-all is waiting). The book goes when it's empty.
 */
export function syncDevBook() {
  const wanted = devRecipes().filter((r) => settings.devMode || (r.id === SOUP && settings.simpleMode) || (r.id === STEW && ui.wipeArmed));
  const ids = new Set(wanted.map((r) => r.id));
  const d = box.data;
  const stale = d.recipes.filter((r) => r.folderId === DEV_BOOK && !ids.has(r.id));
  const hasBook = d.folders.some((f) => f.id === DEV_BOOK);
  const fresh = wanted.filter((w) => {
    const have = box.find(w.id);
    return !have || have.title !== w.title || JSON.stringify(have.ingredients) !== JSON.stringify(w.ingredients) || JSON.stringify(have.steps) !== JSON.stringify(w.steps) || have.description !== w.description;
  });
  if (!stale.length && !fresh.length && hasBook === !!wanted.length) return;
  box.update((b) => {
    b.recipes = b.recipes.filter((r) => !(r.folderId === DEV_BOOK && !ids.has(r.id)));
    if (!wanted.length) b.folders = b.folders.filter((f) => f.id !== DEV_BOOK);
    else if (!b.folders.some((f) => f.id === DEV_BOOK)) b.folders.push({ id: DEV_BOOK, name: DEV_NAME });
    for (const w of fresh) {
      const i = b.recipes.findIndex((r) => r.id === w.id);
      if (i >= 0) b.recipes[i] = w; else b.recipes.push(w);
    }
  });
  stale.forEach((r) => dropSession(r.id));
  if (!wanted.length && ui.folder === DEV_BOOK) setFolder(ALL);
}

/** Which lines of a menu card are ticked: the scheme in use, or the flags that are on. */
export function menuTicks(id) {
  if (id === PAELLA) return new Set([1 + PALETTE_LINES.findIndex(([k]) => k === settings.palette)]);
  if (id === FONDUE) return new Set(FLAGS.map(([f], i) => (isOn(f) ? i + 1 : -1)).filter((i) => i > 0));
  return new Set();
}
const isOn = (f) => (f === 'seedData' ? box.folders.some((x) => x.id === SEED_BOOK) : !!settings[f]);

/** A menu card's line tapped: choose that scheme, or flip that flag. */
export function pickMenu(id, line) {
  if (id === PAELLA) {
    const p = PALETTE_LINES[line - 1];
    if (p) { settings.palette = p[0]; saveSettings(); notice(`Colours: ${p[1]}.`); }
  } else if (id === FONDUE) {
    const f = FLAGS[line - 1];
    if (f) flip(f[0]);
  }
}

/** Switches a developer feature on or off, and says where to find it. */
export function flip(f) {
  const on = !isOn(f);
  if (f === 'seedData') {
    box.update((b) => {
      b.recipes = b.recipes.filter((r) => r.folderId !== SEED_BOOK && !String(r.id).startsWith('seed-'));
      b.folders = b.folders.filter((x) => x.id !== SEED_BOOK);
      b.meals = (b.meals || []).map((m) => ({ ...m, cards: m.cards.filter((c) => !c.startsWith('seed-')) }));
      if (on) { const seed = seedLibrary(); b.recipes.push(...seed.recipes); b.folders.push(...seed.folders); }
    });
  } else {
    settings[f] = on;
    if (f === 'devCasings' && !on && ['Snake', 'Camel', 'Pascal', 'Kebab', 'Screaming', 'Sponge'].includes(settings.casing)) settings.casing = 'AsWritten';
    if (f === 'codeFont') settings.typeface = on ? 'Code' : settings.typeface === 'Code' ? 'Sans' : settings.typeface;
    saveSettings();
  }
  notice(FLAG_NOTICES[f][on ? 0 : 1]);
}

/** A Developer Recipes card was ticked: a finished secret card flips its feature, then its ticks reset. */
export function devTicked(r) {
  const s = session(r);
  const all = r.ingredients.map((l, i) => i).filter((i) => !r.ingredients[i].startsWith('## '));
  if (!all.every((i) => s.checked.has(i))) return;
  dropSession(r.id);
  if (r.id === SOUP) setSimpleMode(!settings.simpleMode);
  else if (r.id === STEW) {
    if (settings.simpleMode) { notice('Not in simple mode.'); return; }
    box.wipe();
    ui.wipeArmed = false;
    syncDevBook();
    go('#/books');
    notice('All recipes deleted.');
  } else if (SECRETS.has(r.id)) flip(SECRETS.get(r.id));
}

/** Shows Scorched Earth Stew; finishing it deletes everything. */
export function armWipe() {
  ui.wipeArmed = true;
  syncDevBook();
  dropSession(STEW);
  setFolder(DEV_BOOK);
  ui.query = '';
  go('#/books');
  notice('Check every ingredient on Scorched Earth Stew to delete everything.');
}
/** OH GOD, DELETE THIS: clears the stew's checks so nothing happens. */
export function cancelWipe() {
  ui.wipeArmed = false;
  syncDevBook();
  dropSession(STEW);
  go('#/books');
  ui.notice = null;
  draw();
}

export { MENUS, resetSession };

// ---------------------------------------------------------------- kitchen timers

// Started from method steps; any number run at once; one that's finished beeps until dismissed.
// [key] ties a timer to the step that started it ("card#line#minutes").
export const timers = {
  running: (key) => ui.timers.find((t) => t.key === key) || null,
  start(key, label, minutes) {
    if (timers.running(key)) return;
    const now = Date.now();
    ui.timers.push({ id: now + Math.random(), key, label, start: now, end: now + minutes * 60000, done: false });
    draw();
  },
  dismiss(id) { ui.timers = ui.timers.filter((t) => t.id !== id); draw(); },
  /** Share of the time still left, 1 → 0 (the bar drains). */
  fraction: (t) => (t.done ? 0 : Math.max(0, Math.min(1, (t.end - Date.now()) / Math.max(1, t.end - t.start)))),
  /** Time left as a clock: "4:07", "1:02:30". */
  left(t) {
    const secs = Math.ceil(Math.max(0, t.end - Date.now()) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = String(secs % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  },
};

let audio = null;
export function beep() {
  try {
    audio = audio || new AudioContext();
    [0, 0.5, 1].forEach((at) => {
      const o = audio.createOscillator();
      o.frequency.value = 880;
      o.connect(audio.destination);
      o.start(audio.currentTime + at);
      o.stop(audio.currentTime + at + 0.3);
    });
  } catch { /* no sound */ }
}

export function say(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export { hint };
