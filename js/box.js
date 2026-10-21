// The recipe box: exactly the JSON the Android app keeps in its sync file, so either can read
// what the other wrote: cards, books, the shopping list, meal plans, plan layouts, saved preps and
// what was deleted. Every change goes through here (as the app's Store), saved in this browser.

import { fold } from './units.js';

export const ALL = '__all__';
/** The book of the app's own developer cards: kept out of sync, as on the phone. */
export const DEV_BOOK = 'developer-recipes';
const KEY = 'recipebox.box';

export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function emptyBox() {
  return { format: 'recipebox', version: 2, folders: [], recipes: [], shopping: [], deleted: {} };
}

/** A card with every field present (older files and other apps leave some out). */
export function fullRecipe(r) {
  const now = Date.now();
  return {
    id: r.id || uuid(), title: r.title || '', description: r.description || '', notes: r.notes || '',
    servings: r.servings ?? null, yieldText: r.yieldText || '', prepMin: r.prepMin ?? null, cookMin: r.cookMin ?? null, totalMin: r.totalMin ?? null,
    folderId: r.folderId ?? null, alsoIn: Array.isArray(r.alsoIn) ? r.alsoIn : [],
    sourceName: r.sourceName || '', sourceUrl: r.sourceUrl || '', author: r.author || '', imageUrl: r.imageUrl || '',
    cuisine: r.cuisine || '', category: r.category || '', keywords: r.keywords || '', rating: r.rating || '', published: r.published || '',
    keepProgress: !!r.keepProgress, scale: r.scale > 0 ? r.scale : 1,
    created: r.created ?? now, updated: r.updated ?? now,
    ...r,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients.map(String) : [],
    steps: Array.isArray(r.steps) ? r.steps.map(String) : [],
    nutrition: Array.isArray(r.nutrition) ? r.nutrition.map(String) : [],
    subRecipes: Array.isArray(r.subRecipes) ? r.subRecipes : [],
    checkedIngredients: Array.isArray(r.checkedIngredients) ? r.checkedIngredients : [],
    checkedSteps: Array.isArray(r.checkedSteps) ? r.checkedSteps : [],
  };
}

/** A box read from a file, with every list present. */
export function normalize(raw) {
  const b = { ...raw };
  b.format = 'recipebox';
  b.version = b.version || 2;
  for (const k of ['folders', 'recipes', 'shopping']) if (!Array.isArray(b[k])) b[k] = [];
  if (!b.deleted || typeof b.deleted !== 'object') b.deleted = {};
  // Settings stay on each device, as on the phone (a backup's are offered when it's brought in).
  delete b.config;
  b.recipes = b.recipes.map(fullRecipe);
  return b;
}

export function parseBox(text) {
  const o = JSON.parse(text.replace(/^﻿/, ''));
  if (!o || o.format !== 'recipebox') throw new Error('Not a Recipe Box file');
  return normalize(o);
}

/** The file's layout, as the phone writes it (empty optional lists left out). Settings only in backups. */
export function boxText(b, { config = null } = {}) {
  const out = { format: 'recipebox', version: b.version || 2, folders: b.folders, recipes: b.recipes, shopping: b.shopping };
  for (const k of ['meals', 'prepProfiles', 'prepSaved']) if (Array.isArray(b[k]) && b[k].length) out[k] = b[k];
  if (config) out.config = config;
  if (b.deleted && Object.keys(b.deleted).length) out.deleted = b.deleted;
  for (const [k, v] of Object.entries(b)) if (!(k in out) && !['meals', 'prepProfiles', 'prepSaved', 'deleted', 'config'].includes(k)) out[k] = v;
  return JSON.stringify(out, null, 1);
}

/** Key order doesn't matter: the same box written by the phone or the web compares equal. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** Same cards, books, list, plans and deletions, whatever the order (the app's SyncPlan.same). */
export function sameBox(a, b) {
  const set = (xs) => (xs || []).map(canonical).sort().join('\n');
  return set(a.recipes) === set(b.recipes)
    && set((a.folders || []).map((f) => [f.id, f.name])) === set((b.folders || []).map((f) => [f.id, f.name]))
    && set(a.shopping) === set(b.shopping)
    && set(a.meals) === set(b.meals)
    && set(a.prepProfiles) === set(b.prepProfiles)
    && set(a.prepSaved) === set(b.prepSaved)
    && canonical(a.deleted || {}) === canonical(b.deleted || {});
}

/** Comparable form of a web address: no scheme, "www.", query, fragment or trailing slash. */
export function normUrl(url) {
  try {
    const u = new URL(String(url).trim());
    return (u.hostname.toLowerCase().replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')) || String(url).trim();
  } catch {
    return String(url || '').trim().toLowerCase();
  }
}
export function hostOf(url) {
  try { return new URL(String(url).trim()).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/** A card's sort key: "Éclair" files with the E's. */
export const sortKey = (r) => fold((r.title || '').trim());
/** Rolodex letter: A–Z, or # for anything else. */
export const letterOf = (r) => { const c = sortKey(r)[0]?.toUpperCase() || '#'; return c >= 'A' && c <= 'Z' ? c : '#'; };
export const isDev = (r) => r.folderId === DEV_BOOK || String(r.id).startsWith('dev-') || ['developer-soup', 'scorched-earth-stew'].includes(r.id);
const versionKey = (v) => (v || '0.0.0').split('.').map((n) => +n || 0).reduce((a, n, i) => a + n * [1e6, 1e3, 1][i], 0);

/** The box kept in this browser, and every change to it. */
export class Box {
  constructor() {
    this.listeners = new Set();
    try {
      const t = localStorage.getItem(KEY);
      this.data = t ? normalize(JSON.parse(t)) : emptyBox();
    } catch {
      this.data = emptyBox();
    }
  }

  onChange(f) { this.listeners.add(f); }

  /** Replaces or changes the box, saves it, and tells the screen. */
  set(next, { quiet = false } = {}) {
    this.data = normalize(next);
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* full or blocked: the session still works */ }
    if (!quiet) this.listeners.forEach((f) => f(this.data));
  }

  update(change) {
    const b = structuredClone(this.data);
    change(b);
    this.set(b);
  }

  get recipes() { return this.data.recipes; }
  get folders() { return this.data.folders; }
  get shopping() { return this.data.shopping; }
  get meals() { return this.data.meals || []; }

  find(id) { return this.data.recipes.find((r) => r.id === id); }
  findByUrl(url) {
    if (!url) return null;
    const n = normUrl(url);
    return this.data.recipes.find((r) => r.sourceUrl && !r.variantOf && normUrl(r.sourceUrl) === n) || null;
  }
  /** The card a link points at, if it's in the box. */
  resolve(s) { return (s.recipeId && this.find(s.recipeId)) || this.findByUrl(s.url); }
  folderName(id) {
    if (id === ALL) return 'All books';
    if (id == null) return 'Loose cards';
    return this.data.folders.find((f) => f.id === id)?.name ?? 'Loose cards';
  }

  /** Every card once, A–Z, variants behind their original. */
  sorted() {
    const ids = new Set(this.data.recipes.map((r) => r.id));
    return this.data.recipes.filter((r) => !r.variantOf || !ids.has(r.variantOf)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }

  /** A card's original and its variants, oldest version first. */
  family(r) {
    const root = r.variantOf || r.id;
    return this.data.recipes.filter((x) => x.id === root || x.variantOf === root)
      .sort((a, b) => (a.variantOf ? 1 : 0) - (b.variantOf ? 1 : 0) || versionKey(a.version) - versionKey(b.version));
  }
  nextVersion(r) {
    const minor = Math.max(0, ...this.family(r).map((x) => +(x.version || '0.0.0').split('.')[1] || 0));
    return `0.${minor + 1}.0`;
  }

  /**
   * A book's cards: A–Z, or in their own order for a book of lessons. "All books" leaves out
   * Developer Recipes (that book is opened on purpose); null is the loose cards.
   */
  inBook(id) {
    const shown = this.sorted();
    const folder = this.data.folders.find((f) => f.id === id);
    if (folder?.ordered) {
      const set = new Set(shown);
      return this.data.recipes.filter((r) => set.has(r) && (r.folderId === id || (r.alsoIn || []).includes(id)));
    }
    if (id === ALL) return shown.filter((r) => !isDev(r));
    if (id == null) return shown.filter((r) => !r.folderId);
    return shown.filter((r) => r.folderId === id || (r.alsoIn || []).includes(id));
  }

  /** "All books", the books, and loose cards when there are any. */
  scopes({ hideDev = false } = {}) {
    const out = [ALL, ...this.data.folders.filter((f) => !hideDev || f.id !== DEV_BOOK).map((f) => f.id)];
    if (this.data.folders.length && this.data.recipes.some((r) => !r.folderId)) out.push(null);
    return out;
  }

  // ---------------------------------------------------------------- cards

  /** Saves a card. Whether it's kept open stays as the box has it (only setProgress changes that). */
  saveRecipe(r) {
    const now = Date.now();
    this.update((b) => {
      const i = b.recipes.findIndex((x) => x.id === r.id);
      const keep = i >= 0 ? b.recipes[i].keepProgress : !!r.keepProgress;
      const next = { ...r, keepProgress: keep, updated: now, created: r.created || now };
      if (i >= 0) b.recipes[i] = next; else b.recipes.push(next);
      delete b.deleted[r.id];
    });
  }

  /** Several cards in one change (a part made its own card, a starter book's updates). */
  saveRecipes(list) {
    const now = Date.now();
    this.update((b) => {
      for (const r of list) {
        const i = b.recipes.findIndex((x) => x.id === r.id);
        const next = { ...r, updated: now, created: r.created || now };
        if (i >= 0) b.recipes[i] = { ...next, keepProgress: b.recipes[i].keepProgress }; else b.recipes.push(next);
        delete b.deleted[r.id];
      }
    });
  }

  /** Kept open (or not), with its ticks and scale. Not an edit, so the card's date stays. */
  setProgress(id, keep, ingredients, steps, scale) {
    this.update((b) => {
      const r = b.recipes.find((x) => x.id === id);
      if (!r) return;
      Object.assign(r, keep
        ? { keepProgress: true, checkedIngredients: [...ingredients].sort((x, y) => x - y), checkedSteps: [...steps].sort((x, y) => x - y), scale }
        : { keepProgress: false, checkedIngredients: [], checkedSteps: [], scale: 1 });
    });
  }

  newRecipe(folderId) {
    return fullRecipe({ id: uuid(), folderId: folderId ?? null, sourceName: 'My own' });
  }

  /** Deletes one card (remembered for sync). Deleting an original makes its first variant the new original. */
  deleteRecipe(id, { remember = true } = {}) {
    this.update((b) => {
      const now = Date.now();
      b.recipes = b.recipes.filter((r) => r.id !== id);
      const heir = b.recipes.find((r) => r.variantOf === id);
      if (heir) {
        for (const r of b.recipes) {
          if (r.id === heir.id) Object.assign(r, { variantOf: null, updated: now });
          else if (r.variantOf === id) Object.assign(r, { variantOf: heir.id, updated: now });
        }
      }
      if (remember) b.deleted[id] = now;
    });
  }

  // ---------------------------------------------------------------- books

  addBook(name) {
    const have = this.data.folders.find((f) => f.name.toLowerCase() === name.trim().toLowerCase());
    if (have) return have.id;
    const id = uuid();
    this.update((b) => { b.folders.push({ id, name: name.trim() }); });
    return id;
  }
  renameBook(id, name) { this.update((b) => { const f = b.folders.find((x) => x.id === id); if (f && name.trim()) f.name = name.trim(); }); }
  moveBook(id, dir) {
    this.update((b) => {
      const i = b.folders.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.folders.length) return;
      const [f] = b.folders.splice(i, 1);
      b.folders.splice(j, 0, f);
    });
  }
  setBookOrdered(id, on) {
    this.update((b) => {
      const f = b.folders.find((x) => x.id === id);
      if (!f) return;
      if (on) f.ordered = true; else delete f.ordered;
    });
  }

  /** Deletes a book; each of its cards goes where asked: `moves` card → book id (null: loose), `drop` deleted with it. */
  deleteBook(id, moves, drop, { remember = true } = {}) {
    this.update((b) => {
      const now = Date.now();
      b.folders = b.folders.filter((f) => f.id !== id);
      b.recipes = b.recipes.filter((r) => !drop.has(r.id)).map((r) => {
        if (r.folderId === id) return { ...r, folderId: moves.get(r.id) ?? null, alsoIn: (r.alsoIn || []).filter((x) => x !== id), updated: now };
        if ((r.alsoIn || []).includes(id)) return { ...r, alsoIn: r.alsoIn.filter((x) => x !== id), updated: now };
        return r;
      });
      if (remember) {
        b.deleted[id] = now;
        for (const d of drop) b.deleted[d] = now;
      }
    });
  }

  /** One book as a file to share: its cards (and ones that also live in it), with it as their home. */
  bookText(id) {
    const book = this.data.folders.filter((f) => f.id === id);
    const recipes = this.data.recipes.filter((r) => r.folderId === id || (r.alsoIn || []).includes(id))
      .map((r) => ({ ...r, folderId: id, alsoIn: [], keepProgress: false, checkedIngredients: [], checkedSteps: [] }));
    return boxText({ folders: book, recipes, shopping: [] });
  }

  /** One card as a file to share. */
  cardText(r) {
    return boxText({ folders: [], recipes: [{ ...r, folderId: null, alsoIn: [], keepProgress: false, checkedIngredients: [], checkedSteps: [] }], shopping: [] });
  }

  // ---------------------------------------------------------------- the shopping list

  /** Adds lines to the list, skipping ones already waiting there from the same card. */
  addToShopping(lines, from) {
    let n = 0;
    this.update((b) => {
      const have = new Set(b.shopping.filter((s) => !s.done).map((s) => `${s.from}\n${s.text.toLowerCase()}`));
      for (const text of lines) {
        const k = `${from}\n${text.toLowerCase()}`;
        if (have.has(k)) continue;
        have.add(k);
        b.shopping.push({ id: uuid(), text, from, done: false });
        n++;
      }
    });
    return n;
  }
  toggleShopItem(id) { this.update((b) => { const s = b.shopping.find((x) => x.id === id); if (s) s.done = !s.done; }); }
  removeShopItem(id) { this.update((b) => { b.shopping = b.shopping.filter((s) => s.id !== id); b.deleted[id] = Date.now(); }); }
  /** Clears the ticked lines, or (`onlyDone` false) all of them. */
  clearShopping(onlyDone = true) {
    this.update((b) => {
      const now = Date.now();
      b.shopping.filter((s) => !onlyDone || s.done).forEach((s) => { b.deleted[s.id] = now; });
      b.shopping = b.shopping.filter((s) => onlyDone && !s.done);
    });
  }

  // ---------------------------------------------------------------- meal prep

  saveMeal(m) {
    this.update((b) => {
      const next = { ...m, updated: Date.now() };
      b.meals = b.meals || [];
      const i = b.meals.findIndex((x) => x.id === m.id);
      if (i >= 0) b.meals[i] = next; else b.meals.push(next);
      delete b.deleted[m.id];
    });
  }
  addMeals(ms) { this.update((b) => { const now = Date.now(); b.meals = [...(b.meals || []), ...ms.map((m) => ({ ...m, updated: now }))]; }); }
  deleteMeals(ids) {
    this.update((b) => {
      const now = Date.now();
      b.meals = (b.meals || []).filter((m) => !ids.has(m.id));
      for (const id of ids) b.deleted[id] = now;
    });
  }
  saveProfile(p) {
    this.update((b) => {
      const next = { ...p, updated: Date.now() };
      b.prepProfiles = b.prepProfiles || [];
      const i = b.prepProfiles.findIndex((x) => x.id === p.id);
      if (i >= 0) b.prepProfiles[i] = next; else b.prepProfiles.push(next);
      delete b.deleted[p.id];
    });
  }
  /** A plan layout and the meals planned in it (never the household). */
  deleteProfile(id) {
    if (id === 'home') return;
    this.update((b) => {
      const now = Date.now();
      const gone = (b.meals || []).filter((m) => m.profile === id).map((m) => m.id);
      b.prepProfiles = (b.prepProfiles || []).filter((p) => p.id !== id);
      b.meals = (b.meals || []).filter((m) => m.profile !== id);
      b.deleted[id] = now;
      for (const g of gone) b.deleted[g] = now;
    });
  }
  savePrep(p) {
    this.update((b) => {
      b.prepSaved = [...(b.prepSaved || []).filter((x) => x.id !== p.id), { ...p, updated: Date.now() }];
      delete b.deleted[p.id];
    });
  }
  deleteSaved(id) { this.update((b) => { b.prepSaved = (b.prepSaved || []).filter((x) => x.id !== id); b.deleted[id] = Date.now(); }); }

  // ---------------------------------------------------------------- bringing cards in

  /**
   * Adds cards from a file or a starter book, as the phone does: the same card is replaced only
   * by a newer copy; one from a page already in the box counts as had; books match by id, then
   * name. With `asBook`, everything goes into a new book of that name.
   */
  importLibrary(source, asBook = null) {
    let incoming = { folders: source.folders || [], recipes: (source.recipes || []).map(fullRecipe) };
    if (asBook && asBook.trim()) {
      const taken = new Set(this.data.folders.map((f) => f.name.toLowerCase()));
      let name = asBook.trim();
      for (let n = 2; taken.has(name.toLowerCase()) && n < 100; n++) name = `${asBook.trim()} (${n})`;
      const book = { id: uuid(), name };
      incoming = { folders: [book], recipes: incoming.recipes.map((r) => ({ ...r, folderId: book.id, alsoIn: [] })) };
    }
    const result = { added: 0, updated: 0, had: 0 };
    this.update((b) => {
      const map = new Map();
      for (const f of incoming.folders) {
        const match = b.folders.find((x) => x.id === f.id) || b.folders.find((x) => x.name.toLowerCase() === (f.name || '').toLowerCase());
        if (match) {
          map.set(f.id, match.id);
          // A book that comes in ordered (Learning to Cook) keeps its course order.
          if (f.ordered && !match.ordered) match.ordered = true;
        } else {
          b.folders.push({ ...f });
          map.set(f.id, f.id);
        }
      }
      const ids = new Set(b.folders.map((f) => f.id));
      for (const r0 of incoming.recipes) {
        const r = { ...r0, folderId: r0.folderId ? (map.get(r0.folderId) ?? (ids.has(r0.folderId) ? r0.folderId : null)) : null };
        const i = b.recipes.findIndex((x) => x.id === r.id);
        if (i >= 0) {
          if ((r.updated || 0) > (b.recipes[i].updated || 0)) { b.recipes[i] = r; result.updated++; } else result.had++;
        } else if (!r.variantOf && r.sourceUrl && b.recipes.some((x) => x.sourceUrl && normUrl(x.sourceUrl) === normUrl(r.sourceUrl))) {
          result.had++;
        } else {
          b.recipes.push(r);
          result.added++;
        }
        // Brought in on purpose: it doesn't count as deleted any more.
        delete b.deleted[r.id];
      }
      for (const f of b.folders) delete b.deleted[f.id];
    });
    return result;
  }

  /** A starter book's newer cards: ones still exactly as they came (never saved since) that differ, and ones not here yet. */
  starterUpdates(book) {
    const fields = ['title', 'description', 'notes', 'prepMin', 'cookMin', 'servings'];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return (book.recipes || []).filter((r) => {
      const mine = this.find(r.id);
      if (!mine) return !(r.id in this.data.deleted);
      return mine.updated === mine.created && (fields.some((k) => !same(mine[k] ?? null, r[k] ?? null))
        || !same(mine.ingredients, r.ingredients || []) || !same(mine.steps, r.steps || []) || !same(mine.nutrition, r.nutrition || []));
    });
  }
  applyStarterUpdates(book) {
    const news = this.starterUpdates(book);
    if (!news.length) return 0;
    this.update((b) => {
      for (const r of news.map(fullRecipe)) {
        const i = b.recipes.findIndex((x) => x.id === r.id);
        if (i < 0) b.recipes.push(r);
        else {
          const mine = b.recipes[i];
          b.recipes[i] = { ...r, folderId: mine.folderId, keepProgress: mine.keepProgress, checkedIngredients: [], checkedSteps: [], scale: mine.scale, subRecipes: mine.subRecipes };
        }
      }
    });
    return news.length;
  }

  /** Every card, book, list line and plan gone (on synced devices too). */
  wipe() {
    this.update((b) => {
      const now = Date.now();
      for (const x of [...b.recipes, ...b.folders, ...b.shopping, ...(b.meals || [])]) if (!isDev(x) && x.id !== DEV_BOOK) b.deleted[x.id] = now;
      b.recipes = b.recipes.filter(isDev);
      b.folders = b.folders.filter((f) => f.id === DEV_BOOK);
      b.shopping = [];
      b.meals = [];
    });
  }

  // ---------------------------------------------------------------- sync

  /** The box as the sync file holds it: none of the app's own Developer Recipes. */
  syncData() {
    const d = this.data;
    const deleted = Object.fromEntries(Object.entries(d.deleted).filter(([k]) => !isDev({ id: k }) && k !== DEV_BOOK));
    return { ...d, recipes: d.recipes.filter((r) => !isDev(r)), folders: d.folders.filter((f) => f.id !== DEV_BOOK), deleted };
  }

  /** The sync file's cards, books, list and plans in place of this box's; Developer Recipes stay. */
  replaceSync(remote) {
    const d = this.data;
    const devDeleted = Object.fromEntries(Object.entries(d.deleted).filter(([k]) => isDev({ id: k }) || k === DEV_BOOK));
    this.set({
      ...remote,
      recipes: [...remote.recipes.filter((r) => !isDev(r)), ...d.recipes.filter(isDev)],
      folders: [...remote.folders.filter((f) => f.id !== DEV_BOOK), ...d.folders.filter((f) => f.id === DEV_BOOK)],
      deleted: { ...remote.deleted, ...devDeleted },
    });
  }
}

// ---------------------------------------------------------------- the sync rule

/**
 * Sync the Steam way, as on the phone: no merging. Whichever copy changed since the last sync
 * wins; if both did, the person picks. `file` is null when there's no file yet.
 */
export function decide(file, fileChanged, box, boxChanged) {
  const empty = (b) => !b.recipes.length && !b.shopping.length && !(b.meals || []).length;
  if (!file) return 'upload';
  if (sameBox(file, box)) return 'nothing';
  if (fileChanged && boxChanged) {
    if (empty(box)) return 'download';
    if (empty(file)) return 'upload';
    return 'ask';
  }
  return fileChanged ? 'download' : 'upload';
}

/** The newest edit in a box (cards, meals, plans), for "last edit …" when asking. */
export function lastEdit(b) {
  return Math.max(0, ...b.recipes.map((r) => r.updated || 0), ...(b.meals || []).map((m) => m.updated || 0),
    ...(b.prepProfiles || []).map((p) => p.updated || 0), ...(b.prepSaved || []).map((p) => p.updated || 0));
}
