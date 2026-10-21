// Bringing recipes in: a web page's schema.org Recipe (what nearly every recipe site embeds for
// search engines), the two WordPress recipe-card plugins, recipe files from other apps (Paprika,
// Mealie, schema.org, Recipe Box backups, zipped or not), TheMealDB, and an AI chat's reply.
// Ported from the Android app's RecipeParser, FileImport, Sources and AiCard.
//
// A web page can't read other sites the way the phone app can: a site has to allow it. The sites
// below that do (TheMealDB, BBC Good Food, and WordPress blogs through their own API) search and
// import right here; the rest open in a new tab, and the "Send to Recipe Box" bookmark brings a
// recipe back from any page.

import { fullRecipe, hostOf, normUrl, uuid } from './box.js';
import { formatAmount } from './units.js';

// ---------------------------------------------------------------- text

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', deg: '°', frac12: '½', frac14: '¼', frac34: '¾' };
function decode(s) {
  if (typeof DOMParser !== 'undefined') return new DOMParser().parseFromString(`<body>${s}`, 'text/html').body.textContent || '';
  return s.replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return entities[e.toLowerCase()] ?? all;
  });
}

/** HTML entities and tags decoded, spaces tidied. */
export function clean(s) {
  if (s == null) return '';
  const t = String(s);
  if (!t.trim()) return '';
  return (/[<&]/.test(t) ? decode(t) : t).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Recipe plugins wrap notes in extra brackets: "salmon (, cut into cubes)" → "salmon (cut into cubes)". */
export const tidyNotes = (s) => s.replace(/\(\s*,\s*/g, '(').replace(/\(\(([^()]*)\)\)/g, '($1)');

/** ISO-8601 durations ("PT1H30M", "P0DT0H20M") in minutes. */
export function isoMinutes(s) {
  const m = /P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?/i.exec(String(s || '').trim());
  if (!m || m[0].length <= 1) return null;
  const r = Math.round((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0) + (+m[4] || 0) / 60);
  return r > 0 ? r : null;
}

/** A time from another app, in whatever words: "PT20M", "1 hour 5 mins", "45". */
function looseMinutes(text) {
  const iso = isoMinutes(text);
  if (iso) return iso;
  const t = String(text || '').toLowerCase().replace(/hours?|hrs?/g, 'h').replace(/minutes?|mins?/g, 'm');
  if (/^\s*\d+\s*$/.test(t)) return +t;
  let total = 0;
  let any = false;
  for (const m of t.matchAll(/(\d+)\s*(d|h|m)/g)) { any = true; total += +m[1] * { d: 1440, h: 60, m: 1 }[m[2]]; }
  return any ? total : null;
}

const firstInt = (s) => { const m = /\d+/.exec(String(s ?? '')); return m ? +m[0] : null; };

// ---------------------------------------------------------------- schema.org

const isType = (t, name) => (Array.isArray(t) ? t.some((x) => isType(x, name)) : typeof t === 'string' && (t.toLowerCase() === name.toLowerCase() || t.toLowerCase().endsWith(`/${name.toLowerCase()}`)));

/** Depth first, an object whose @type is (or includes) Recipe. */
export function findRecipe(node) {
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n); if (r) return r; }
  } else if (node && typeof node === 'object') {
    if (isType(node['@type'], 'Recipe')) return node;
    for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
      const r = findRecipe(node[k]);
      if (r) return r;
    }
  }
  return null;
}

const text = (n) => {
  if (n == null) return '';
  if (Array.isArray(n)) return n.length ? text(n[0]) : '';
  if (typeof n === 'object') return text(n['@value'] ?? n.name);
  return String(n);
};
const flat = (n) => {
  if (n == null) return [];
  if (Array.isArray(n)) return n.flatMap(flat);
  if (typeof n === 'object') return n.name ? [text(n.name)] : [];
  return [String(n)];
};
const people = (n) => (Array.isArray(n) ? n.map(people).filter(Boolean).join(', ') : n && typeof n === 'object' ? clean(text(n.name)) : clean(n));
const image = (n) => (Array.isArray(n) ? (n.length ? image(n[0]) : '') : n && typeof n === 'object' ? text(n.url) : n ? String(n) : '');

function instructions(node) {
  const out = [];
  const walk = (n) => {
    if (n == null) return;
    if (typeof n === 'string') {
      // A single blob: HTML with <li>/<p>, or plain text with newlines.
      if (/<(li|p)\b/i.test(n) && typeof DOMParser !== 'undefined') {
        const items = [...new DOMParser().parseFromString(n, 'text/html').querySelectorAll('li, p')].map((e) => clean(e.textContent)).filter(Boolean);
        if (items.length) { out.push(...items); return; }
      }
      out.push(...n.split(/\r?\n+/).map(clean).filter(Boolean));
    } else if (Array.isArray(n)) n.forEach(walk);
    else if (typeof n === 'object') {
      if (isType(n['@type'], 'HowToSection')) {
        const name = clean(text(n.name));
        if (name) out.push(`## ${name}`);
        walk(n.itemListElement);
      } else if (n.itemListElement) walk(n.itemListElement);
      else {
        const t = clean(text(n.text) || text(n.name));
        if (t) out.push(t);
      }
    }
  };
  walk(node);
  return out;
}

function nutritionOf(o) {
  if (!o || typeof o !== 'object') return [];
  return Object.keys(o).filter((k) => !k.startsWith('@')).map((k) => {
    const v = clean(text(o[k]));
    return v ? `${k.replace(/Content$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}: ${v}` : null;
  }).filter(Boolean);
}

function ratingOf(o) {
  if (!o || typeof o !== 'object') return '';
  const v = parseFloat(text(o.ratingValue));
  if (!Number.isFinite(v)) return '';
  const count = text(o.ratingCount) || text(o.reviewCount);
  return `${v.toFixed(1)}${count ? ` (${count} ratings)` : ''}`;
}

/** A schema.org Recipe object as a card. */
export function fromNode(o, pageUrl = '', siteName = '') {
  const own = text(o.url);
  const url = own.startsWith('http') ? own : pageUrl;
  const yields = flat(o.recipeYield);
  const servings = yields.map(firstInt).find((n) => n != null);
  return fullRecipe({
    id: uuid(),
    title: clean(text(o.name)) || 'Untitled recipe',
    description: clean(text(o.description)),
    ingredients: flat(o.recipeIngredient ?? o.ingredients).map((s) => tidyNotes(clean(s))).filter(Boolean),
    steps: instructions(o.recipeInstructions),
    servings: servings >= 1 && servings <= 500 ? servings : null,
    yieldText: yields.map(clean).sort((a, b) => b.length - a.length)[0] || '',
    prepMin: isoMinutes(text(o.prepTime)), cookMin: isoMinutes(text(o.cookTime)), totalMin: isoMinutes(text(o.totalTime)),
    sourceName: siteName || hostOf(url), sourceUrl: url,
    author: people(o.author), imageUrl: image(o.image),
    cuisine: flat(o.recipeCuisine).map(clean).join(', '), category: flat(o.recipeCategory).map(clean).join(', '),
    keywords: flat(o.keywords).map(clean).join(', '),
    nutrition: nutritionOf(o.nutrition), rating: ratingOf(o.aggregateRating), published: text(o.datePublished).slice(0, 10),
  });
}

function parseJson(raw) {
  const t = String(raw || '').trim().replace(/^<!--/, '').replace(/-->$/, '').replace(/^\/\/<!\[CDATA\[/, '').replace(/\/\/\]\]>$/, '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** The recipe in a set of JSON-LD blocks, or null. */
export function fromJsonLd(blocks, pageUrl, siteName = '') {
  for (const b of blocks) {
    const node = findRecipe(parseJson(b));
    if (node) return fromNode(node, pageUrl, siteName);
  }
  return null;
}

// ---------------------------------------------------------------- sub-recipes on the page

const equipment = /\b(pans?|pots?|skillets?|saucepans?|tins?|trays?|sheets?|dish|knife|knives|processor|blender|mixer|oven|grill|thermometer|scales?|sieve|whisk|spatula|board|bowl|mould|mold|casserole dish|dutch oven|air ?fryer|slow cooker|instant pot)\b/i;
const notRecipeLink = /\/(category|categories|tag|tags|shop|store|product|products|author|about|contact|privacy|cart|search|collections?|course|cuisine|glossary|ingredients?|how-?to|guides?|techniques?|equipment|reviews?|videos?|content|best|buying-guides?)\/|\/(top|best)-[^/]*$|[?&](s|p)=|amazon\.|amzn\.|\.(jpe?g|png|webp|gif|pdf)$/i;
const wordSet = (s) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));

/** Other recipes this one uses: same-site links whose text sits in an ingredient or step ("1 cup <a>homemade salsa</a>"). */
export function findSubRecipes(doc, recipe, pageUrl) {
  const host = hostOf(pageUrl);
  const self = normUrl(pageUrl);
  const anchors = [...doc.querySelectorAll('a[href]')].map((a) => {
    let url;
    try { url = new URL(a.getAttribute('href'), pageUrl).toString().split('#')[0]; } catch { return null; }
    const t = (a.textContent || '').trim();
    const h = hostOf(url);
    const ok = url.startsWith('http') && t.length >= 3 && t.length <= 80 && !equipment.test(t) && (h === host || h.endsWith(`.${host}`))
      && normUrl(url) !== self && normUrl(url) !== host && !notRecipeLink.test(url);
    return ok ? [a, url, t] : null;
  }).filter(Boolean);
  if (!anchors.length) return [];
  const found = new Map();
  const scan = (lines, kind) => lines.forEach((line, i) => {
    if (line.startsWith('## ')) return;
    const lw = [...wordSet(line)];
    if (!lw.length) return;
    for (const [a, url, t] of anchors) {
      if (!line.toLowerCase().includes(t.toLowerCase())) continue;
      // The link must live in the page's copy of this line, not a menu or footer.
      const block = a.closest('li, p');
      if (!block) continue;
      const bw = wordSet(block.textContent || '');
      if (lw.filter((w) => bw.has(w)).length < lw.length * 0.6) continue;
      if (!found.has(normUrl(url))) found.set(normUrl(url), { name: t.charAt(0).toUpperCase() + t.slice(1), url, kind, index: i });
    }
  });
  scan(recipe.ingredients, 'i');
  // Links on most ingredient lines are a glossary ("onion" → what an onion is), not sub-recipes.
  const lines = recipe.ingredients.filter((l) => !l.startsWith('## ')).length;
  if (found.size >= 3 && found.size * 10 >= lines * 4) return [];
  scan(recipe.steps, 's');
  return [...found.values()];
}

/** A whole page's recipe (schema.org, or a recipe-card plugin's markup), with its sub-recipe links. */
export function parseHtml(html, pageUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const site = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() || '';
  const r = fromJsonLd([...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent), pageUrl, site)
    || fromTasty(doc, pageUrl, site) || fromWprmHtml(doc, pageUrl, site);
  if (!r) return null;
  r.subRecipes = findSubRecipes(doc, r, pageUrl);
  return r;
}

// ---------------------------------------------------------------- WordPress recipe cards

/** WP Recipe Maker's own API answer (/wp-json/wp/v2/wprm_recipe/ID) as a card. */
export function fromWprm(w, pageUrl, siteName = '') {
  const ingredients = [];
  for (const g of w.ingredients || []) {
    if (g.name) ingredients.push(`## ${clean(g.name)}`);
    for (const i of g.ingredients || []) {
      const line = [i.amount, i.unit, i.name].map(clean).filter(Boolean).join(' ');
      const notes = clean(i.notes);
      if (line) ingredients.push(tidyNotes(notes ? `${line}${/^[(,]/.test(notes) ? ' ' : ', '}${notes}` : line));
    }
  }
  const steps = [];
  for (const g of w.instructions || []) {
    if (g.name) steps.push(`## ${clean(g.name)}`);
    for (const s of g.instructions || []) { const t = clean(s.text || s.name); if (t) steps.push(t); }
  }
  const nut = w.nutrition && typeof w.nutrition === 'object' ? Object.entries(w.nutrition)
    .filter(([k, v]) => v !== '' && v != null && !/^(serving_size|serving_unit)$/.test(k) && /^(calories|carbohydrates|protein|fat|saturated_fat|sodium|fiber|sugar|cholesterol)$/.test(k))
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}${k === 'calories' ? ' kcal' : /sodium|cholesterol/.test(k) ? ' mg' : ' g'}`) : [];
  const tagNames = (k) => (w.tags?.[k] || []).map((t) => clean(t.name)).join(', ');
  const n = (v) => (v === '' || v == null || +v <= 0 ? null : Math.round(+v));
  return fullRecipe({
    id: uuid(), title: clean(w.name) || 'Untitled recipe', description: clean(w.summary),
    ingredients, steps, notes: clean(String(w.notes || '').replace(/<\/(p|li)>/gi, '\n')),
    servings: n(w.servings), yieldText: [w.servings, w.servings_unit].filter(Boolean).join(' '),
    prepMin: n(w.prep_time), cookMin: n(w.cook_time), totalMin: n(w.total_time),
    sourceName: siteName || hostOf(pageUrl), sourceUrl: pageUrl, author: clean(w.author_name),
    imageUrl: w.image_url || '', cuisine: tagNames('cuisine'), category: tagNames('course'), keywords: tagNames('keyword'),
    nutrition: nut, rating: w.rating?.average ? `${(+w.rating.average).toFixed(1)} (${w.rating.count} ratings)` : '',
  });
}

/** WP Recipe Maker's card as markup, for a page without schema.org. */
function fromWprmHtml(doc, pageUrl, site) {
  const box = doc.querySelector('.wprm-recipe');
  if (!box) return null;
  const t = (sel, root = box) => clean(root.querySelector(sel)?.textContent || '');
  const ingredients = [];
  for (const g of box.querySelectorAll('.wprm-recipe-ingredient-group')) {
    const h = t('.wprm-recipe-group-name', g);
    if (h) ingredients.push(`## ${h}`);
    for (const li of g.querySelectorAll('.wprm-recipe-ingredient')) ingredients.push(tidyNotes(clean(li.textContent).replace(/^▢\s*/, '')));
  }
  const steps = [];
  for (const g of box.querySelectorAll('.wprm-recipe-instruction-group')) {
    const h = t('.wprm-recipe-group-name', g);
    if (h) steps.push(`## ${h}`);
    for (const li of g.querySelectorAll('.wprm-recipe-instruction-text')) steps.push(clean(li.textContent));
  }
  if (!ingredients.length && !steps.length) return null;
  return fullRecipe({ id: uuid(), title: t('.wprm-recipe-name') || 'Untitled recipe', description: t('.wprm-recipe-summary'), ingredients, steps, sourceName: site || hostOf(pageUrl), sourceUrl: pageUrl, servings: firstInt(t('.wprm-recipe-servings')) });
}

/** Tasty Recipes' card (Pinch of Yum and others), from its markup. */
export function fromTasty(doc, pageUrl, site = '') {
  const box = doc.querySelector('.tasty-recipes');
  if (!box) return null;
  const t = (sel) => clean(box.querySelector(sel)?.textContent || '');
  const lines = (sel) => {
    const root = box.querySelector(sel);
    if (!root) return [];
    const out = [];
    for (const el of root.querySelectorAll('h4, h3, li, p')) {
      if (el.closest('.tasty-recipes-ingredients-header, .tasty-recipes-instructions-header')) continue;
      const s = clean(el.textContent);
      if (!s) continue;
      // A group's name ("For the Broth:"), whether a heading or a short line ending in a colon, is a section.
      if (/^H[34]$/.test(el.tagName) || (s.length < 40 && s.endsWith(':') && !el.querySelector('li'))) out.push(`## ${s.replace(/:$/, '')}`);
      else if (el.tagName === 'LI' || !el.closest('li')) out.push(s);
    }
    return out;
  };
  const ingredients = lines('.tasty-recipes-ingredients-body, .tasty-recipes-ingredients').map(tidyNotes);
  const steps = lines('.tasty-recipes-instructions-body, .tasty-recipes-instructions');
  if (!ingredients.length && !steps.length) return null;
  return fullRecipe({
    id: uuid(), title: t('.tasty-recipes-title') || 'Untitled recipe', description: t('.tasty-recipes-description-body, .tasty-recipes-description'),
    ingredients, steps, notes: t('.tasty-recipes-notes-body, .tasty-recipes-notes'),
    servings: firstInt(t('.tasty-recipes-yield')), yieldText: t('.tasty-recipes-yield'),
    prepMin: looseMinutes(t('.tasty-recipes-prep-time')), cookMin: looseMinutes(t('.tasty-recipes-cook-time')), totalMin: looseMinutes(t('.tasty-recipes-total-time')),
    sourceName: site || hostOf(pageUrl), sourceUrl: pageUrl, author: t('.tasty-recipes-author-name'),
  });
}

// ---------------------------------------------------------------- recipe files from other apps

function paprika(o) {
  const s = (k) => String(o[k] ?? '').trim();
  const lines = (t) => t.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return fullRecipe({
    id: uuid(), title: s('name') || 'Untitled recipe', description: s('description'),
    ingredients: lines(s('ingredients')), steps: lines(s('directions')),
    notes: [s('notes'), s('nutritional_info') ? `Nutrition: ${s('nutritional_info')}` : ''].filter(Boolean).join('\n\n'),
    servings: firstInt(s('servings')), yieldText: s('servings'),
    prepMin: looseMinutes(s('prep_time')), cookMin: looseMinutes(s('cook_time')), totalMin: looseMinutes(s('total_time')),
    sourceName: s('source') || hostOf(s('source_url')), sourceUrl: s('source_url'),
    category: Array.isArray(o.categories) ? o.categories.join(', ') : '', rating: o.rating > 0 ? `${o.rating}/5 (Paprika)` : '',
  });
}

function mealie(o) {
  const s = (x, k) => String(x?.[k] ?? '').trim();
  const ingredients = (o.recipeIngredient || []).flatMap((i) => {
    const line = s(i, 'display') || s(i, 'originalText') || [i.quantity > 0 ? formatAmount(i.quantity) : '', s(i.unit, 'name'), s(i.food, 'name'), s(i, 'note')].filter(Boolean).join(' ');
    return [s(i, 'title') ? `## ${s(i, 'title')}` : null, line || null].filter(Boolean);
  });
  const steps = (o.recipeInstructions || []).flatMap((st) => [s(st, 'title') ? `## ${s(st, 'title')}` : null, s(st, 'text') || null].filter(Boolean));
  const url = s(o, 'orgURL');
  return fullRecipe({
    id: uuid(), title: s(o, 'name') || 'Untitled recipe', description: s(o, 'description'), ingredients, steps,
    notes: (o.notes || []).map((n) => [s(n, 'title'), s(n, 'text')].filter(Boolean).join(': ')).join('\n\n'),
    servings: o.recipeServings > 0 ? Math.round(o.recipeServings) : firstInt(s(o, 'recipeYield')), yieldText: s(o, 'recipeYield'),
    prepMin: looseMinutes(s(o, 'prepTime')), cookMin: looseMinutes(s(o, 'performTime') || s(o, 'cookTime')), totalMin: looseMinutes(s(o, 'totalTime')),
    sourceName: hostOf(url) || 'Mealie', sourceUrl: url,
  });
}

function recipeFrom(o) {
  if (!o || typeof o !== 'object') return null;
  if ('directions' in o && typeof o.ingredients === 'string') return [paprika(o), 'Paprika'];
  if (Array.isArray(o.recipeIngredient) && o.recipeIngredient[0] && typeof o.recipeIngredient[0] === 'object') return [mealie(o), 'Mealie'];
  if ('recipeIngredient' in o || 'recipeInstructions' in o) { const r = fromNode(o, o.url || ''); r.sourceName = hostOf(o.url || ''); return [r, 'schema.org']; }
  return null;
}

const isZip = (b) => b.length > 3 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isGzip = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files in a zip (stored or deflated), read from its central directory. */
async function unzip(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return [];
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = [];
  for (let n = 0; n < count && v.getUint32(p, true) === 0x02014b50; n++) {
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (name.endsWith('/')) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = b.subarray(start, start + size);
    if (method === 0) out.push(data);
    else if (method === 8) out.push(await inflate(data, 'deflate-raw'));
  }
  return out;
}

/**
 * A recipe file from anywhere: a Recipe Box backup or shared book, Paprika (.paprikarecipes zip or a
 * gzipped .paprikarecipe), Mealie, or schema.org JSON. { library, format, config }.
 */
export async function readRecipeFile(bytes) {
  const found = [];
  let native = null;
  let config = null;
  const formats = new Set();
  const handleJson = (t) => {
    let value;
    try { value = JSON.parse(t.trim().replace(/^﻿/, '')); } catch { return; }
    if (value && !Array.isArray(value) && value.format === 'recipebox') {
      native = { folders: [...(native?.folders || []), ...(value.folders || [])], recipes: [...(native?.recipes || []), ...(value.recipes || []).map(fullRecipe)] };
      if (value.config) config = value.config;
      formats.add('Recipe Box');
    } else {
      for (const o of Array.isArray(value) ? value : [value]) {
        const got = recipeFrom(o);
        if (got) { found.push(got[0]); formats.add(got[1]); }
      }
    }
  };
  const handle = async (data, depth = 0) => {
    if (depth > 2) return;
    if (isZip(data)) for (const f of await unzip(data)) await handle(f, depth + 1);
    else if (isGzip(data)) await handle(await inflate(data, 'gzip'), depth + 1);
    else handleJson(new TextDecoder().decode(data));
  };
  await handle(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const library = { folders: native?.folders || [], recipes: [...(native?.recipes || []), ...found] };
  if (!library.recipes.length) throw new Error('No recipes in that file.');
  return { library, format: [...formats].join(' + '), config };
}

// ---------------------------------------------------------------- an AI chat's card

export const AI_PROMPT = `You turn a recipe described in plain conversation into one Recipe Box card.

Reply with ONLY a JSON object. No other words, no code fences. Use exactly this shape:

{"format":"recipebox","version":2,"recipes":[{
  "title": "",
  "description": "",
  "servings": null,
  "yieldText": "",
  "prepMin": null,
  "cookMin": null,
  "totalMin": null,
  "ingredients": [],
  "steps": [],
  "notes": "",
  "sourceName": "",
  "author": "",
  "cuisine": "",
  "category": "",
  "keywords": ""
}]}

Rules:
1. Use only what the recipe text says or clearly implies. Never invent ingredients, amounts, times or temperatures. If something isn't given, leave it as "" or null.
2. title: short and plain, in Title Case. No "best", "easy" or "amazing" unless the cook said it.
3. ingredients: one item per string, amount first, then unit, then ingredient, then any prep after a comma: "2 cups flour", "1 onion, finely chopped", "salt, to taste". Keep the cook's units. Write fractions as ½ or 1/2. If the ingredients come in groups, put a heading string before each group that starts with "## ", like "## For the sauce".
4. steps: one action per string, in order, short and direct: "Heat the oven to 350°F." Write every duration as a number and a unit, like "Bake for 25 minutes.", because the app turns those into timers. Never combine units: write "75 minutes", not "1 hour 15 minutes". Keep temperatures with °F or °C exactly as given. Only use "## " heading steps for separate parts, like "## Frosting".
5. servings: a whole number of people, only if stated or obvious. Use yieldText for anything else, like "1 loaf" or "24 cookies".
6. prepMin, cookMin, totalMin: whole minutes, only if given or clearly implied.
7. description: one sentence saying what the dish is. notes: the cook's tips, swaps, storage advice and "next time" advice. Leave out stories, chit-chat and anything not needed to cook it.
8. sourceName: who or where it came from if mentioned, like "Grandma" or "Mom". Otherwise "".
9. cuisine, category, keywords: short, comma separated, only if obvious from the text.
10. The output must be valid JSON: double quotes, no trailing commas, no comments.

The recipe:
`;

/** An AI's reply: the outermost { … } (code fences and chatter around it ignored), as cards. */
export async function readAiCard(reply) {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No card in that text.');
  if (reply.includes('You turn a recipe described in plain conversation')) throw new Error('That’s the prompt. Paste it into an AI chat, then copy the AI’s reply.');
  const json = reply.slice(start, end + 1);
  let lib;
  try { lib = (await readRecipeFile(new TextEncoder().encode(json))).library; } catch {
    // Some chat apps "smarten" the quotes on copy; straighten them and try again.
    lib = (await readRecipeFile(new TextEncoder().encode(json.replace(/[“”]/g, '"')))).library;
  }
  const real = lib.recipes.filter((r) => r.title.trim() || r.ingredients.length || r.steps.length);
  if (!real.length) throw new Error('That card is empty.');
  return { ...lib, recipes: real };
}

// ---------------------------------------------------------------- the recipe sites

/** TheMealDB's meal as a card (it comes whole, no page to read). */
export function fromMealDb(m) {
  const s = (k) => String(m[k] ?? '').trim();
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ing = s(`strIngredient${i}`);
    if (ing) ingredients.push([s(`strMeasure${i}`), ing].filter(Boolean).join(' '));
  }
  const steps = s('strInstructions').split(/\r?\n+/).map((x) => x.trim().replace(/^(step\s*)?\d+[.):]?\s*$/i, '')).filter(Boolean);
  return fullRecipe({
    id: uuid(), title: s('strMeal'), ingredients, steps, sourceName: 'TheMealDB',
    sourceUrl: s('strSource') || `https://www.themealdb.com/meal/${s('idMeal')}`, imageUrl: s('strMealThumb'),
    cuisine: s('strArea'), category: s('strCategory'), keywords: s('strTags').replace(/,/g, ', '),
    notes: s('strYoutube') ? `Video: ${s('strYoutube')}` : '',
  });
}

const enc = encodeURIComponent;
async function getJson(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`answered ${res.status}`);
  return res.json();
}

const wordpress = (id, name, base) => ({
  id, name, note: 'Food blog', base,
  browseUrl: (q) => `${base}/?s=${enc(q)}`,
  async search(q) {
    const list = await getJson(`${base}/wp-json/wp/v2/posts?search=${enc(q)}&per_page=20&_fields=title,link,excerpt`);
    return list.map((o) => ({ title: clean(o.title?.rendered), url: o.link, blurb: clean(o.excerpt?.rendered).slice(0, 160) }));
  },
});
const elsewhere = (id, name, host) => ({ id, name, note: 'Opens on the site', browseUrl: (q) => `https://${host}/search?q=${enc(q)}`, search: null });

/** The phone's recipe sites. Those with `search` answer a web page; the rest open in a new tab. */
export const sources = [
  elsewhere('allrecipes', 'Allrecipes', 'www.allrecipes.com'),
  elsewhere('simplyrecipes', 'Simply Recipes', 'www.simplyrecipes.com'),
  elsewhere('seriouseats', 'Serious Eats', 'www.seriouseats.com'),
  elsewhere('eatingwell', 'EatingWell', 'www.eatingwell.com'),
  {
    id: 'bbcgoodfood', name: 'BBC Good Food', note: 'UK recipes, metric',
    browseUrl: (q) => `https://www.bbcgoodfood.com/search?q=${enc(q)}`,
    async search(q) {
      const o = await getJson(`https://www.bbcgoodfood.com/api/search-frontend/search?search=${enc(q)}`);
      return (o.searchResults?.items || []).filter((i) => i.postType === 'recipe')
        .map((i) => ({ title: clean(i.title), url: i.url?.startsWith('http') ? i.url : `https://www.bbcgoodfood.com${i.url}`, blurb: clean(i.description).slice(0, 160) }));
    },
  },
  { id: 'epicurious', name: 'Epicurious', note: 'Opens on the site', browseUrl: (q) => `https://www.epicurious.com/search?q=${enc(q)}`, search: null },
  wordpress('recipetineats', 'RecipeTin Eats', 'https://www.recipetineats.com'),
  wordpress('loveandlemons', 'Love and Lemons', 'https://www.loveandlemons.com'),
  wordpress('pinchofyum', 'Pinch of Yum', 'https://pinchofyum.com'),
  wordpress('minimalistbaker', 'Minimalist Baker', 'https://minimalistbaker.com'),
  {
    id: 'themealdb', name: 'TheMealDB', note: 'Open recipe database',
    browseUrl: () => null,
    async search(q) {
      const o = await getJson(`https://www.themealdb.com/api/json/v1/1/search.php?s=${enc(q)}`);
      return (o.meals || []).map((m) => { const r = fromMealDb(m); return { title: r.title, url: r.sourceUrl, blurb: [r.cuisine, r.category].filter(Boolean).join(' · '), recipe: r }; });
    },
  },
];
/** Off unless switched on, as on the phone. */
export const offByDefault = ['simplyrecipes', 'seriouseats', 'eatingwell'];

/** A WordPress blog's recipe, through its own API (any blog with WP Recipe Maker or Tasty Recipes). */
async function fromWordPress(url) {
  const u = new URL(url);
  const slug = u.pathname.split('/').filter(Boolean).pop();
  if (!slug) return null;
  let posts;
  try { posts = await getJson(`${u.origin}/wp-json/wp/v2/posts?slug=${enc(slug)}&_fields=link,content,title`); } catch { return null; }
  const post = Array.isArray(posts) ? posts[0] : null;
  if (!post) return null;
  const html = post.content?.rendered || '';
  const site = hostOf(url);
  const id = /wprm-recipe-container-(\d+)/.exec(html)?.[1] || /data-recipe-id=["']?(\d+)/.exec(html)?.[1];
  if (id) {
    try {
      const w = await getJson(`${u.origin}/wp-json/wp/v2/wprm_recipe/${id}`);
      if (w?.recipe) {
        const r = fromWprm(w.recipe, post.link || url, site);
        r.subRecipes = findSubRecipes(new DOMParser().parseFromString(html, 'text/html'), r, post.link || url);
        return r;
      }
    } catch { /* no recipe API: read the card's markup instead */ }
  }
  const r = parseHtml(html, post.link || url);
  if (r && !r.sourceName) r.sourceName = site;
  return r;
}

/** Fetches a page's text through the proxy an organisation set up, if any ("{url}" marks where it goes). */
function proxied(proxy, url) {
  return proxy.includes('{url}') ? proxy.replace('{url}', enc(url)) : proxy + enc(url);
}

/**
 * A recipe from a web address: the site's own API where it has one, the page itself where the site
 * allows it, then the proxy. Throws a message to show when none works.
 */
export async function fetchRecipe(url, { proxy = '' } = {}) {
  // Sites known not to be WordPress skip asking its API.
  const notWp = /(^|\.)(bbcgoodfood\.com|themealdb\.com|allrecipes\.com|epicurious\.com|seriouseats\.com|simplyrecipes\.com|eatingwell\.com)$/.test(hostOf(url));
  const wp = notWp ? null : await fromWordPress(url).catch(() => null);
  if (wp) return wp;
  const tries = [url, ...(proxy ? [proxied(proxy, url)] : [])];
  let blocked = false;
  for (const t of tries) {
    try {
      const res = await fetch(t, { credentials: 'omit' });
      if (!res.ok) { blocked = true; continue; }
      const r = parseHtml(await res.text(), url);
      if (r) return r;
      throw new Error('No recipe on that page.');
    } catch (e) {
      if (e.message === 'No recipe on that page.') throw e;
      blocked = true;
    }
  }
  throw new Error(blocked ? 'That site doesn’t let other web pages read it.' : 'No recipe on that page.');
}

// ---------------------------------------------------------------- the bookmark

/**
 * "Send to Recipe Box": a bookmark that, on any recipe page, gathers the page's recipe data and
 * opens it here (the page's schema.org blocks, or its recipe card's markup).
 */
export function bookmarklet(appUrl) {
  const code = `(()=>{const d={u:location.href,s:(document.querySelector('meta[property="og:site_name"]')||{}).content||'',l:[...document.querySelectorAll('script[type="application/ld+json"]')].map(e=>e.textContent).filter(t=>/Recipe/.test(t))};if(!d.l.length){const c=document.querySelector('.wprm-recipe,.tasty-recipes');if(c)d.h=c.outerHTML;else{alert('No recipe on this page. Open a single recipe.');return}}const b=btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');window.open(${JSON.stringify(appUrl)}+'#/take/'+b,'_blank')})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

/** What the bookmark sent, as a card (or null). */
export function fromSent(data) {
  try {
    const json = decodeURIComponent(escape(atob(data.replace(/-/g, '+').replace(/_/g, '/'))));
    const d = JSON.parse(json);
    const r = fromJsonLd(d.l || [], d.u, d.s) || (d.h ? parseHtml(d.h, d.u) : null);
    return r;
  } catch {
    return null;
  }
}
