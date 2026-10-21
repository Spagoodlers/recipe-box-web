// Keeps the browser's box in step with the same sync file the phone uses, the same way: whichever
// copy changed since the last sync replaces the other, and if both did the person chooses.
//
// Two kinds of file:
// - a local file, picked once and remembered (Chrome and Edge): read and written in place, so a
//   Dropbox or Drive folder on this computer carries it to the phone;
// - a link (a Dropbox share link, any web address): read only.

import { parseBox, boxText, decide, lastEdit } from './box.js';

const STATE = 'recipebox.sync';
const DB = 'recipebox';

// ---------------------------------------------------------------- where the file handle lives

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db.transaction('handles').objectStore('handles').get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
/** Best effort: if the browser can't keep the file (a private window), sync still works until the page closes. */
async function idbSet(key, value) {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const tx = db.transaction('handles', 'readwrite');
      if (value == null) tx.objectStore('handles').delete(key); else tx.objectStore('handles').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    return undefined;
  }
}

async function hash(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A Dropbox share page as the file itself ("www.dropbox.com/…?dl=0" → "dl.dropboxusercontent.com/…"). */
export function directLink(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'www.dropbox.com' || u.hostname === 'dropbox.com') {
      u.hostname = 'dl.dropboxusercontent.com';
      u.searchParams.delete('dl');
    }
    return u.toString();
  } catch {
    return url.trim();
  }
}

export class Sync {
  constructor(box) {
    this.box = box;
    this.handle = null;
    this.busy = false;
    this.conflict = null;
    this.needsPermission = false;
    this.listeners = new Set();
    try { this.state = JSON.parse(localStorage.getItem(STATE)) || {}; } catch { this.state = {}; }
  }

  onChange(f) { this.listeners.add(f); }
  emit() { this.listeners.forEach((f) => f()); }
  save() { try { localStorage.setItem(STATE, JSON.stringify(this.state)); } catch { /* ignore */ } }

  static get canPickFiles() { return 'showOpenFilePicker' in window; }
  get on() { return !!this.state.kind; }
  get readOnly() { return this.state.kind === 'url'; }
  get name() { return this.state.kind === 'url' ? this.state.url : this.state.name || 'sync file'; }

  /** After a reload: the remembered file, and whether the browser still lets the page use it. */
  async restore() {
    if (this.state.kind !== 'file') return;
    this.handle = await idbGet('sync');
    if (!this.handle) { this.stop(); return; }
    const p = await this.handle.queryPermission({ mode: 'readwrite' });
    this.needsPermission = p !== 'granted';
    this.emit();
  }

  /** Asking again needs a tap (browsers allow it only then). */
  async reconnect() {
    if (!this.handle) return null;
    const p = await this.handle.requestPermission({ mode: 'readwrite' });
    this.needsPermission = p !== 'granted';
    this.emit();
    return this.needsPermission ? 'The browser didn’t allow the file.' : this.run();
  }

  async useHandle(handle) {
    const p = await handle.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') return 'The browser didn’t allow the file.';
    this.handle = handle;
    await idbSet('sync', handle);
    this.state = { kind: 'file', name: handle.name };
    this.needsPermission = false;
    this.save();
    return this.run();
  }

  async pickFile() {
    const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Recipe Box sync file', accept: { 'application/json': ['.json'] } }] });
    return this.useHandle(handle);
  }

  async createFile() {
    const handle = await window.showSaveFilePicker({ suggestedName: 'recipe-box-sync.json', types: [{ description: 'Recipe Box sync file', accept: { 'application/json': ['.json'] } }] });
    return this.useHandle(handle);
  }

  async useLink(url) {
    this.state = { kind: 'url', url: url.trim() };
    this.handle = null;
    await idbSet('sync', null);
    this.save();
    return this.run();
  }

  stop() {
    this.state = {};
    this.handle = null;
    this.conflict = null;
    this.needsPermission = false;
    idbSet('sync', null);
    this.save();
    this.emit();
  }

  async read() {
    if (this.state.kind === 'file') {
      const file = await this.handle.getFile();
      return file.size ? file.text() : null;
    }
    const res = await fetch(directLink(this.state.url), { cache: 'no-store' });
    if (!res.ok) throw new Error(`The link answered ${res.status}`);
    return res.text();
  }

  async write(text) {
    const w = await this.handle.createWritable();
    await w.write(text);
    await w.close();
  }

  /**
   * One round: read the file, then take it, write ours, or ask. `keep` settles a question
   * ('device' or 'file'). Returns a line to show, or null when there's nothing to say.
   */
  async run(keep = null) {
    if (!this.on || this.busy) return null;
    if (this.state.kind === 'file' && (!this.handle || this.needsPermission)) return null;
    this.busy = true;
    this.emit();
    let message = null;
    try {
      const text = await this.read();
      const remote = text && text.trim() ? parseBox(text) : null;
      const mine = this.box.syncData();
      const mineText = boxText(mine);
      const fileChanged = (text ? await hash(text) : null) !== this.state.seen;
      const boxChanged = (await hash(mineText)) !== this.state.base;
      let action = keep === 'device' ? 'upload' : keep === 'file' ? (remote ? 'download' : 'upload') : decide(remote, fileChanged, mine, boxChanged);
      if (action === 'upload' && this.readOnly) action = remote ? 'local' : 'nothing';
      let seen = text ? await hash(text) : null;
      this.conflict = null;
      if (action === 'ask') {
        this.conflict = {
          deviceCards: mine.recipes.length, deviceEdit: lastEdit(mine), deviceList: mine.shopping.length,
          fileCards: remote.recipes.length, fileEdit: lastEdit(remote), fileList: remote.shopping.length,
        };
        this.state.message = 'Both changed: choose which to keep.';
        this.save();
        return null;
      }
      if (action === 'upload') {
        await this.write(mineText);
        seen = await hash(mineText);
      } else if (action === 'download') {
        this.box.replaceSync(remote);
        const n = remote.recipes.length;
        message = `Synced from ${this.name}: ${n === 1 ? '1 card' : `${n} cards`}.`;
      } else if (action === 'local') {
        message = 'Changes here stay in this browser: the link is read only.';
      }
      // A read-only link that kept local changes keeps its old base, so the next file change asks.
      this.state.seen = seen;
      if (action !== 'local') this.state.base = await hash(boxText(this.box.syncData()));
      this.state.last = Date.now();
      this.state.message = message || 'Up to date.';
      this.save();
      return message;
    } catch (e) {
      const why = e instanceof TypeError ? 'the page couldn’t reach it (the host may not allow web pages to read it)' : e.message;
      this.state.message = `Couldn’t sync: ${why}.`;
      this.save();
      return this.state.message;
    } finally {
      this.busy = false;
      this.emit();
    }
  }
}
