// The recipe box: exactly the JSON the Android app keeps in its sync file, so either can read
// what the other wrote. Parts the web doesn't use yet (meal plans, plan layouts) travel untouched.

import { fold } from './units.js';

export const ALL = '__all__';
const KEY = 'recipebox.box';

export function emptyBox() {
  return { format: 'recipebox', version: 2, folders: [], recipes: [], shopping: [], deleted: {} };
}

/** A box read from a file, with every list present (older files leave some out). */
export function normalize(raw) {
  const b = { ...raw };
  b.format = 'recipebox';
  b.version = b.version || 2;
  for (const k of ['folders', 'recipes', 'shopping']) if (!Array.isArray(b[k])) b[k] = [];
  if (!b.deleted || typeof b.deleted !== 'object') b.deleted = {};
  // Settings stay on each device, as on the phone.
  delete b.config;
  b.recipes = b.recipes.map((r) => ({
    ...r,
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    nutrition: Array.isArray(r.nutrition) ? r.nutrition : [],
  }));
  return b;
}

export function parseBox(text) {
  const o = JSON.parse(text.replace(/^﻿/, ''));
  if (!o || o.format !== 'recipebox') throw new Error('Not a Recipe Box file');
  return normalize(o);
}

/** The file's layout, as the phone writes it (empty optional lists left out). */
export function boxText(b) {
  const out = { format: 'recipebox', version: b.version || 2, folders: b.folders, recipes: b.recipes, shopping: b.shopping };
  for (const k of ['meals', 'prepProfiles', 'prepSaved']) if (Array.isArray(b[k]) && b[k].length) out[k] = b[k];
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

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

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

  find(id) { return this.data.recipes.find((r) => r.id === id); }
  folderName(id) { return id === ALL ? 'All books' : this.data.folders.find((f) => f.id === id)?.name ?? 'Loose cards'; }

  /** A book's cards: A–Z, or in their own order for a book of lessons. Variants stay behind their original. */
  inBook(id) {
    const ids = new Set(this.data.recipes.map((r) => r.id));
    const cards = this.data.recipes.filter((r) => !r.variantOf || !ids.has(r.variantOf));
    const folder = this.data.folders.find((f) => f.id === id);
    const mine = id === ALL ? cards : cards.filter((r) => r.folderId === id || (r.alsoIn || []).includes(id) || (id === null && !r.folderId));
    return folder?.ordered ? mine : [...mine].sort((a, b) => fold(a.title.trim()).localeCompare(fold(b.title.trim())));
  }

  /** "All books", the books, and loose cards when there are any. */
  scopes() {
    const out = [ALL, ...this.data.folders.map((f) => f.id)];
    if (this.data.recipes.some((r) => !r.folderId)) out.push(null);
    return out;
  }

  saveRecipe(r) {
    const now = Date.now();
    this.update((b) => {
      const i = b.recipes.findIndex((x) => x.id === r.id);
      const next = { ...r, updated: now, created: r.created || now };
      if (i >= 0) b.recipes[i] = next; else b.recipes.push(next);
      delete b.deleted[r.id];
    });
  }

  newRecipe(folderId) {
    return {
      id: uuid(), title: '', description: '', ingredients: [], steps: [], notes: '', servings: null, yieldText: '',
      prepMin: null, cookMin: null, totalMin: null, folderId: folderId ?? null, sourceName: 'My own', sourceUrl: '',
      author: '', imageUrl: '', cuisine: '', category: '', keywords: '', nutrition: [], rating: '', published: '',
      subRecipes: [], keepProgress: false, checkedIngredients: [], checkedSteps: [], scale: 1,
    };
  }

  deleteRecipe(id) {
    // Remembered, so another device doesn't bring it back.
    this.update((b) => {
      b.recipes = b.recipes.filter((r) => r.id !== id);
      b.deleted[id] = Date.now();
    });
  }

  addBook(name) {
    const id = uuid();
    this.update((b) => { b.folders.push({ id, name }); });
    return id;
  }

  /** Adds lines from a card to the list, skipping ones already waiting there. */
  addToShopping(lines, from) {
    let n = 0;
    this.update((b) => {
      const have = new Set(b.shopping.filter((s) => !s.done).map((s) => `${s.from}\n${s.text.toLowerCase()}`));
      for (const text of lines) {
        if (have.has(`${from}\n${text.toLowerCase()}`)) continue;
        b.shopping.push({ id: uuid(), text, from, done: false });
        n++;
      }
    });
    return n;
  }

  toggleShopItem(id) { this.update((b) => { const s = b.shopping.find((x) => x.id === id); if (s) s.done = !s.done; }); }

  removeShopItem(id) {
    this.update((b) => { b.shopping = b.shopping.filter((s) => s.id !== id); b.deleted[id] = Date.now(); });
  }

  clearTicked() {
    this.update((b) => {
      const now = Date.now();
      b.shopping.filter((s) => s.done).forEach((s) => { b.deleted[s.id] = now; });
      b.shopping = b.shopping.filter((s) => !s.done);
    });
  }

  /** A starter book (or any Recipe Box file) added in: new cards only, its books by name. */
  importBox(other) {
    let added = 0;
    this.update((b) => {
      const byName = new Map(b.folders.map((f) => [f.name.toLowerCase(), f.id]));
      const map = new Map();
      for (const f of other.folders || []) {
        const have = b.folders.find((x) => x.id === f.id)?.id ?? byName.get(f.name.toLowerCase());
        if (have) map.set(f.id, have);
        else { b.folders.push({ ...f }); map.set(f.id, f.id); }
      }
      const ids = new Set(b.recipes.map((r) => r.id));
      for (const r of other.recipes || []) {
        if (ids.has(r.id)) continue;
        b.recipes.push({ ...r, folderId: r.folderId ? map.get(r.folderId) ?? null : null });
        added++;
      }
    });
    return added;
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

/** The newest card edit in a box, for "last edit …" when asking. */
export function lastEdit(b) {
  return Math.max(0, ...b.recipes.map((r) => r.updated || 0), ...(b.meals || []).map((m) => m.updated || 0));
}
