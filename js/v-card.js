// A card: its title, times and scale, its tabs (Ingredients, Method, Notes, Nutrition, Info), and
// the buttons under it. Every card in the app goes through here, so they all behave the same. On a
// wide screen a card shows ingredients beside the method, and a card opened from a book has the
// book's index beside it. Also here: the card editor, linking a line to another card, cook mode.

import {
  box, settings, ui, views, actions, holds, session, touched, resetSession, esc, plural, rtext, btn, toggle, glyph, notice, go, swap, back, route,
  paged, setPageKeys, wide, textWidth, icons, kid, canList, canFind, branchesOn, multiBookOn, bookName, scopes, shownCards, setFolder, cardHash,
  draw, ALL, DEV_BOOK, backBar, pageKeys, allSessions, hint,
} from './core.js';
import {
  setKeep, addCardToList, linkCard, unlinkCard, linksOn, mentionable, saveEdited, branchDraft, saveVariant, menuTicks, pickMenu, devTicked,
  cancelWipe, timers, say, MENUS,
} from './ops.js';
import { scale, convert, convertTemps, ingredientsInStep, formatMinutes, stepTimers, unitLabel, formatAmount, parseMinutes, ingredientName, fold } from './units.js';
import { cardParts, extractPart, effectiveTotal } from './kitchen.js';
import { letterOf, sortKey, uuid } from './box.js';
import { DEV_IDS, STEW } from './devbook.js';

// ---------------------------------------------------------------- which card, which tabs

/** The card a button belongs to: the card it sits in (one not yet saved is the preview). */
export function cardOf(el) {
  const id = el?.closest('[data-card]')?.dataset.card ?? route().id;
  return box.find(id) || (ui.preview?.id === id ? ui.preview : null) || (ui.draft?.recipe?.id === id ? ui.draft.recipe : null);
}

const TAB = { recipe: ['Recipe', 'recipe'], ingredients: ['Ingredients', 'ingredients'], method: ['Method', 'method'], notes: ['Notes', 'notes'], nutrition: ['Nutrition', 'nutrition'], info: ['Info', 'info'] };

/** The tabs a card shows, in order: on a wide card, Recipe (ingredients beside the method). Focus mode keeps only what you cook from. */
export function cardTabs(r, spread) {
  const first = spread ? ['recipe'] : ['ingredients', 'method'];
  if (settings.focus) return first;
  return [...first, 'notes', ...(r.nutrition.length ? ['nutrition'] : []), 'info'];
}

/** Room for ingredients beside the method. */
const spreadFits = (width) => wide() && width >= 760 * textWidth();
/** The variant on show for a card's family (developer mode). */
function shown(card) {
  if (!settings.variants || !box.find(card.id)) return card;
  const fam = box.family(card);
  return fam.find((x) => x.id === ui.shownVariant.get(card.variantOf || card.id)) || card;
}

// ---------------------------------------------------------------- lines

function heading(text) { return `<li class="heading a keep"><span class="nm rx">${esc(text)}</span></li>`; }

/** Ingredients and method share one look: a box to tick, then the line, struck through when done. */
function checkList(r, lines, set, { numbered, kind, text, extra = () => '', hold = false, big = false }) {
  if (!lines.length) return `<p class="dim a">${kind === 'ing' ? 'No ingredients.' : 'No method.'}</p>`;
  let n = 0;
  return `<ul class="checks rx ${big ? 'big' : ''}">${lines.map((line, i) => {
    if (line.startsWith('## ')) return heading(line.slice(3));
    n++;
    const on = set.has(i);
    return `<li class="a ${on ? 'on' : ''}" role="checkbox" aria-checked="${on}" tabindex="0" data-act="tick" data-kind="${kind}" data-i="${i}" ${hold ? `data-hold="link-line" data-line-kind="${kind === 'ing' ? 'i' : 's'}"` : ''}>
      <span class="box"></span>${numbered ? `<span class="n">${n}.</span>` : ''}<span class="txt">${on ? esc(text(line)) : rtext(text(line))}${extra(line, i)}</span></li>`;
  }).join('')}</ul>`;
}

function linkRows(links) {
  return links.map((l, k) => `<button class="linkrow" data-act="follow-link" data-k="${k}" data-to="${esc(l.recipeId || '')}" data-url="${esc(l.url || '')}">→ <span class="rx">${esc(l.label)}</span> ${l.recipeId ? '(card)' : '(web)'}</button>`).join('');
}

function stepTimer(r, i, m) {
  const key = `${r.id}#${i}#${m}`;
  const t = timers.running(key);
  const n = r.steps.slice(0, i + 1).filter((x) => !x.startsWith('## ')).length;
  if (!t) return `<button class="btn small timer-btn" data-act="step-timer" data-key="${esc(key)}" data-min="${m}" data-label="${esc(`${r.title} · step ${n}`)}">${glyph.timer}<span>Timer ${formatMinutes(m)}</span></button>`;
  if (t.done) return `<button class="btn small on timer-btn" data-act="timer-off" data-id="${t.id}">Time’s up · OK</button>`;
  return `<div class="meter small" data-act="timer-off" data-id="${t.id}" role="button" tabindex="0"><div class="fill" style="width:${100 * timers.fraction(t)}%"></div><span>${timers.left(t)} · tap to stop</span></div>`;
}

const ingText = (s) => (line) => convert(scale(line, s.factor), s.units);

function ingredientsBody(r, s, { canLink, compact, mention }) {
  let about = '';
  if (!compact && !settings.focus && r.description) about += `<p class="dim a small rx clamp3" style="margin:0 0 8px">${esc(r.description)}</p>`;
  if (!compact && canLink) {
    const parts = cardParts(r);
    if (parts.length) {
      const names = parts.map((p) => p.name.toLowerCase()).join(' and ');
      about += `<button class="linkish a" style="align-self:flex-start;padding:0 0 6px" data-act="card-tab" data-tab="info">Its ${esc(names)} could be ${parts.length === 1 ? 'a card' : 'cards'} of ${parts.length === 1 ? 'its' : 'their'} own · see Info</button>`;
    }
  }
  return about + checkList(r, r.ingredients, s.checked, {
    numbered: false, kind: 'ing', text: ingText(s), hold: canLink,
    extra: (line, i) => linkRows(linksOn(r, 'i', i, line, mention)),
  });
}

function methodBody(r, s, { canLink, mention }) {
  const ing = ingText(s);
  return checkList(r, r.steps, s.done, {
    numbered: true, kind: 'step', text: (line) => convertTemps(line, s.units), hold: canLink,
    extra: (line, i) => {
      let out = '';
      if (settings.amountsInMethod) {
        const used = ingredientsInStep(line, r.ingredients);
        if (used.length) out += `<span class="amts">${used.map((u) => `<span class="${s.checked.has(u) ? 'got' : ''}">· ${esc(ing(r.ingredients[u]))}</span>`).join('')}</span>`;
      }
      out += linkRows(linksOn(r, 's', i, line, mention));
      const ts = stepTimers(line);
      if (ts.length) out += `<span class="row-btns timers-row">${ts.map((m) => stepTimer(r, i, m)).join('')}</span>`;
      return out;
    },
  });
}

function notesBody(r) {
  return `<div class="rx">${r.description ? `<div class="label a keep">About</div><p class="a" style="margin:2px 0 14px">${esc(r.description)}</p>` : ''}
    <div class="label a keep">Notes</div>${r.notes ? r.notes.split('\n').filter(Boolean).map((l) => `<p class="a" style="margin:2px 0 8px">${esc(l)}</p>`).join('') : '<p class="dim a">No notes.</p>'}</div>`;
}

function nutritionBody(r) {
  return `<div class="a"><h2 class="title" style="font-size:1.3em">Nutrition facts</h2>
    <div class="dim small">Per serving${r.servings ? ` · serves ${r.servings}` : ''}${r.id.startsWith('starter-') ? ' · estimated by Recipe Box' : ''}</div><hr class="rule thick"></div>
    <ul class="checks rx nut">${r.nutrition.map((line) => {
      const [name, ...v] = line.split(':');
      return `<li class="a" style="cursor:default"><span class="txt" style="flex:1;${/^calories$/i.test(name.trim()) ? 'font-weight:700' : ''}">${esc(name.trim())}</span><b>${esc(v.join(':').trim())}</b></li>`;
    }).join('')}</ul>`;
}

function infoRow(label, value) { return value ? `<div class="a"><div class="label">${esc(label)}</div><div class="rx" style="margin-bottom:6px">${esc(value)}</div></div>` : ''; }

function infoBody(r, { readOnly, saved, locked }) {
  const df = (t) => (t ? new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
  let h = '';
  if (!readOnly) {
    const also = (r.alsoIn || []).map((id) => box.folders.find((f) => f.id === id)?.name).filter(Boolean);
    const moving = ui.moving === r.id;
    h += `<div class="a"><div class="label">Book</div><div class="bar"><b class="nm rx grow">${esc(box.folderName(r.folderId ?? null))}${also.length ? ` · also in ${esc(also.join(', '))}` : ''}</b>${btn('move-open', moving ? 'Done' : 'Move…', { cls: 'small', on: moving, icon: false })}</div></div>`;
    if (moving) {
      h += `<div class="a">${multiBookOn() ? '<div class="dim small">Home book</div>' : ''}<div class="flow">${btn('move-to', 'Loose cards', { cls: 'small', on: !r.folderId, attrs: 'data-to=""', icon: false })}${box.folders.map((f) => btn('move-to', f.name, { cls: 'small', on: r.folderId === f.id, attrs: `data-to="${esc(f.id)}"`, icon: false })).join('')}</div></div>`;
      if (multiBookOn()) {
        h += `<div class="a"><div class="dim small" style="margin-top:6px">Also in</div><div class="flow">${box.folders.filter((f) => f.id !== r.folderId).map((f) => {
          const on = (r.alsoIn || []).includes(f.id);
          return btn('also-in', `${on ? '✓ ' : ''}${f.name}`, { cls: 'small', on, attrs: `data-to="${esc(f.id)}"`, icon: false });
        }).join('')}</div></div>`;
      }
    }
  }
  const from = r.branchOf && box.find(r.branchOf);
  if (from) h += `<div class="a"><div class="label">Branched from</div><button class="linkish" style="padding:0" data-act="open-card" data-to="${esc(from.id)}"><span class="rx">${esc(from.title)}</span></button></div>`;
  h += infoRow('Source', r.sourceName);
  if (r.sourceUrl) h += `<div class="a"><div class="label">Link</div><div data-raw style="margin-bottom:6px;word-break:break-all"><a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.sourceUrl)}</a></div></div>`;
  if (!readOnly) h += '<p class="dim small a">Press and hold (or right-click) an ingredient or step to link another of your cards to it.</p>';
  const parts = !readOnly && saved && !locked && !settings.simpleMode ? cardParts(r) : [];
  if (parts.length) {
    const asking = ui.extract?.card === r.id ? parts.find((p) => p.name === ui.extract.name) : null;
    h += `<div class="a"><div class="label">Could be its own card</div><div class="flow">${parts.map((p) => btn('extract-ask', `Make “${p.name}” a card…`, { cls: 'small', on: asking?.name === p.name, attrs: `data-name="${esc(p.name)}"`, icon: false })).join('')}</div>
      ${asking ? `<div class="box-panel thick" style="margin-top:6px"><b class="nm">A new card: <span class="rx">${esc(r.title)} ${esc(asking.name.toLowerCase())}</span></b>
        <span class="dim small">Its ${asking.ingredients.length - 1} ingredients and ${asking.steps.filter((i) => !r.steps[i].startsWith('## ')).length} step(s) move there. This card gets one linked line in their place, so the ${esc(asking.name.toLowerCase())} can be made ahead, scaled and reused.</span>
        <div class="row-btns">${btn('extract-do', 'Make the card', { cls: 'primary', icon: false })}${btn('extract-ask', 'Not now', { attrs: `data-name=""`, icon: false })}</div></div>` : ''}</div>`;
  }
  if ((r.subRecipes || []).length) {
    h += `<div class="a"><div class="label">Sub-recipes</div>${r.subRecipes.map((s) => {
      const have = box.resolve(s);
      return `<div class="small rx">${esc(s.name)} — ${have ? `in your box as “${esc(have.title)}”` : 'not in your box'}</div>`;
    }).join('')}</div>`;
  }
  h += infoRow('Author', r.author) + infoRow('Yield', r.yieldText) + infoRow('Servings (base)', r.servings ? String(r.servings) : '');
  if (r.prepMin || r.cookMin || r.totalMin) h += infoRow('Prep / Cook / Total', [r.prepMin, r.cookMin, r.totalMin].map((m) => formatMinutes(m)).join(' / '));
  h += infoRow('Cuisine', r.cuisine) + infoRow('Category', r.category) + infoRow('Keywords', r.keywords) + infoRow('Rating at source', r.rating) + infoRow('Published', r.published);
  h += infoRow('Added', df(r.created)) + infoRow('Last edited', df(r.updated));
  if (!readOnly && !r.nutrition.length && saved && !locked) h += `<div class="a">${btn('add-nutrition', 'Add nutrition facts…', { cls: 'wide-btn', icon: false })}</div>`;
  h += `<div class="a"><div class="label">Card ID</div><div class="dim small" data-raw>${esc(r.id)}</div></div>`;
  if (!locked) h += `<div class="a">${btn('print', 'Print or save PDF', { g: 'print', cls: 'wide-btn', icon: false })}</div>`;
  if (saved && branchesOn() && !locked && !settings.simpleMode) h += `<div class="a">${btn('branch', 'Branch this recipe…', { cls: 'wide-btn', icon: false })}<div class="dim small">A new recipe made from this one, to change as you like. This one stays as it is.</div></div>`;
  if (saved && !locked) h += `<div class="a">${btn('share-card', 'Share this card…', { g: 'share', cls: 'wide-btn', icon: false })}<div class="dim small">A Recipe Box file of just this card: the phone app opens it too.</div></div>`;
  if (settings.rawJson) h += `<div class="a"><div class="label">Raw card</div><pre class="raw" data-raw>${esc(JSON.stringify(r, null, 1))}</pre></div>`;
  return h;
}

// ---------------------------------------------------------------- scale

function scaleControls(r, s) {
  if (kid()) return r.servings ? `<div class="bold">Serves ${r.servings}</div>` : '';
  let h = '<div class="scale">';
  if (r.servings) {
    const now = r.servings * s.factor;
    if (settings.steppers) h += btn('stepper', '−', { cls: 'small', attrs: 'data-dir="-1"', disabled: now <= 1, icon: false });
    if (ui.typingServes === r.id) {
      h += `<form class="serves-form" data-form="serves"><b>Serves</b><input class="field small" name="n" inputmode="numeric" maxlength="4" placeholder="${esc(formatAmount(now))}" aria-label="Serves how many" autofocus>${btn('serves-ok', 'OK', { cls: 'small primary', icon: false })}</form>`;
    } else h += `<button class="serves" data-act="serves" title="Type how many it serves">Serves ${esc(formatAmount(now))}</button>`;
    if (settings.steppers) h += btn('stepper', '+', { cls: 'small', attrs: 'data-dir="1"', icon: false });
  } else h += `<b>Scale ×${esc(formatAmount(s.factor))}</b>`;
  h += `<span class="gap"></span>${[[0.5, '½×'], [1, '1×'], [2, '2×'], [3, '3×']].map(([f, l]) => `<button class="btn small ${s.factor === f ? 'on' : ''}" data-act="factor" data-f="${f}" data-raw>${l}</button>`).join('')}`;
  // One button, three ways round: US → Metric → As written. Cards start in Setup's choice.
  h += `<span class="gap"></span><button class="btn small ${s.units !== 'AsWritten' ? 'on' : ''}" data-act="units" title="Units: tap to change">${unitLabel[s.units]}</button></div>`;
  return h;
}

// ---------------------------------------------------------------- the card

/**
 * A card as HTML, and what to do once it's on the page. `ctx`: where it's shown ('detail',
 * 'cards', 'full', 'preview'), its width (for ingredients beside the method), whether it pages on
 * to the next card at its ends.
 */
export function cardView(card, ctx) {
  const r = shown(card);
  const s = session(r);
  if (MENUS.has(r.id)) s.checked = menuTicks(r.id);
  const saved = !!box.find(r.id);
  const locked = DEV_IDS.has(r.id);
  const readOnly = ctx.mode === 'preview' || settings.simpleMode || locked;
  const canLink = saved && !locked && !readOnly;
  const spread = spreadFits(ctx.width ?? window.innerWidth);
  const tabs = cardTabs(r, spread);
  if (spread && (s.tab === 'ingredients' || s.tab === 'method')) s.tab = 'recipe';
  if (!spread && s.tab === 'recipe') s.tab = 'ingredients';
  if (!tabs.includes(s.tab)) s.tab = tabs[0];
  const mention = mentionable(r);
  const times = [r.prepMin && `Prep ${formatMinutes(r.prepMin)}`, r.cookMin && `Cook ${formatMinutes(r.cookMin)}`, effectiveTotal(r) && `Total ${formatMinutes(effectiveTotal(r))}`].filter(Boolean);
  const family = settings.variants && saved ? box.family(r) : [r];
  const any = s.checked.size || s.done.size;
  const hasSteps = r.steps.some((x) => !x.startsWith('## '));

  let body;
  if (s.tab === 'recipe') {
    body = `<div class="spread">
      <div class="col"><div class="label">Ingredients</div><div class="pages" id="pg-ing"><div class="content">${ingredientsBody(r, s, { canLink, mention })}</div></div><div class="count" data-for="pg-ing"></div></div>
      <div class="col"><div class="label">Method</div><div class="pages" id="pg-method"><div class="content">${methodBody(r, s, { canLink, mention })}</div></div><div class="count" data-for="pg-method"></div></div></div>`;
  } else {
    const inner = { ingredients: () => ingredientsBody(r, s, { canLink, mention, compact: ctx.mode === 'preview' }), method: () => methodBody(r, s, { canLink, mention }), notes: () => notesBody(r), nutrition: () => nutritionBody(r), info: () => infoBody(r, { readOnly, saved, locked }) }[s.tab]();
    body = `<div class="pages" id="pg-card"><div class="content ${s.tab === 'info' ? 'info' : ''}">${inner}</div></div><div class="count" data-for="pg-card"></div>`;
  }

  const actionsRow = [
    r.id === STEW ? btn('cancel-wipe', 'OH GOD, DELETE THIS', { cls: 'small on', icon: false }) : '',
    ctx.mode === 'full' ? btn('close-full', 'Close', { g: 'close', cls: 'small' }) : ctx.mode !== 'preview' ? btn('full', 'Full', { g: 'full', cls: 'small' }) : '',
    hasSteps && !locked ? btn('cook', 'Cook', { g: 'cook', cls: 'small' }) : '',
    !readOnly ? btn('edit', 'Edit', { g: 'edit', cls: 'small' }) : '',
    !locked && saved && canList() ? btn('to-list', 'List', { g: 'list', cls: 'small' }) : '',
    !locked && saved && ctx.mode !== 'preview' ? btn('clear-ticks', 'Clear', { g: 'clear', cls: 'small', disabled: !any }) + btn('keep', 'Keep', { g: 'keep', cls: 'small', on: r.keepProgress }) : '',
    !locked && !settings.simpleMode ? btn('print', 'Print', { g: 'print', cls: 'small' }) : '',
  ].join('');

  const html = `<article class="card ${spread ? 'is-spread' : ''}" data-card="${esc(r.id)}">
    <h1 class="title rx">${esc(r.title || 'Untitled recipe')}${r.keepProgress ? `<span class="keepmark" title="Kept open">${glyph.keep}</span>` : ''}</h1>
    ${times.length && !settings.focus ? `<div class="times">${times.join('   ·   ')}</div>` : ''}
    ${scaleControls(r, s)}
    ${family.length > 1 ? `<div class="flow">${family.map((v) => `<button class="btn small ${v.id === r.id ? 'on' : ''}" data-act="variant" data-to="${esc(v.id)}" data-raw>${esc(v.version || '0.0.0')}</button>`).join('')}</div>` : ''}
    ${body}
    <div class="cardtabs" role="tablist">${tabs.map((k) => {
      const [label, g] = TAB[k];
      return `<button role="tab" aria-selected="${s.tab === k}" class="${s.tab === k ? 'on' : ''}" data-act="card-tab" data-tab="${k}" aria-label="${label}" data-hint="${label}">${icons() ? glyph[g] : `${glyph[g]}<span>${label}</span>`}</button>`;
    }).join('')}</div>
    <div class="row-btns card-actions">${actionsRow}</div>
  </article>`;

  const mount = (el) => {
    const root = el.querySelector(`[data-card="${CSS.escape(r.id)}"]`);
    const key = `${r.id}:${s.tab}`;
    const edge = ctx.onEdge || null;
    if (s.tab === 'recipe') {
      paged(root, `${key}:ing`, { viewport: root.querySelector('#pg-ing'), keys: false });
      paged(root, `${key}:method`, { viewport: root.querySelector('#pg-method'), onEdge: edge, fromEnd: ui.fromEnd });
    } else paged(root, key, { viewport: root.querySelector('#pg-card'), onEdge: edge, fromEnd: ui.fromEnd });
    ui.fromEnd = false;
    ui.focusCard = r;
    root.querySelector('[data-form=serves] input')?.focus();
  };
  return { html, mount, recipe: r };
}

// ---------------------------------------------------------------- the book's cards around a card

/** Rolodex tabs under a card: the names around it, then every letter that has cards. Tap to jump. */
function rolodex(cards, index, rows, letters, act) {
  if (cards.length < 2) return '';
  const cols = Math.max(2, Math.min(5, Math.floor((document.getElementById('screen')?.clientWidth || 600) / (150 * Math.max(1, textWidth())))));
  const slots = cols * rows;
  const many = rows > 1 && cards.length > slots;
  const per = many ? slots - 2 : Math.min(cards.length, slots);
  const current = cards[index];
  const letterStart = letters ? cards.findIndex((c) => letterOf(c) === letterOf(current)) : index;
  let start = rows === 1 || !letters ? Math.max(0, Math.min(index - Math.floor(per / 2), cards.length - per)) : index - letterStart < per ? letterStart : index - Math.floor(per / 2);
  if (ui.rolodexStart != null && ui.rolodexFor === current.id) start = ui.rolodexStart;
  const win = [...new Set(Array.from({ length: per }, (_, k) => (((start + k) % cards.length) + cards.length) % cards.length))];
  const tabs = [
    ...(many ? [`<button data-act="rolo-turn" data-dir="${-per}" data-start="${start}">◀</button>`] : []),
    ...win.map((i) => `<button class="${i === index ? 'on' : ''}" data-act="${act}" data-i="${i}" data-to="${esc(cards[i].id)}" role="tab" aria-selected="${i === index}"><span class="rx nm clamp2">${esc(cards[i].title)}</span></button>`),
    ...(many ? [`<button data-act="rolo-turn" data-dir="${per}" data-start="${start}">▶</button>`] : []),
  ];
  let h = `<div class="rolodex-block"><div class="rolodex" style="grid-template-columns:repeat(${cols},1fr)">${tabs.join('')}</div>`;
  const initials = letters ? [...new Set(cards.map(letterOf))].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))) : [];
  if (initials.length > 1) h += `<div class="letters" data-raw>${initials.map((l) => `<button class="${l === letterOf(current) ? 'on' : ''}" data-act="letter" data-l="${l}" data-go="${act}">${l}</button>`).join('')}</div>`;
  return `${h}</div>`;
}

/** One bar for getting about the books: the book on show in the middle (tap for every book), the books either side at the ends. */
function bookStrip(subtitle, extra = '') {
  const all = scopes();
  const i = Math.max(0, all.indexOf(ui.folder));
  const prev = all[(i - 1 + all.length) % all.length];
  const next = all[(i + 1) % all.length];
  const names = window.innerWidth > (extra ? 760 : 480);
  return `<div class="bookstrip"><div class="strip" id="strip">
    ${all.length > 2 ? `<button class="side" data-act="step-book" data-dir="-1"><b data-raw>◀</b>${names ? `<span class="nm dim clamp2">${esc(bookName(prev))}</span>` : ''}</button>` : ''}
    <button class="mid" data-act="manage">${glyph.books}<span class="grow"><b class="nm one">${esc(bookName())}</b><span class="dim small one">${esc(subtitle)}</span></span></button>
    ${all.length > 1 ? `<button class="side end" data-act="step-book" data-dir="1">${names ? `<span class="nm dim clamp2">${esc(bookName(next))}</span>` : ''}<b data-raw>▶</b></button>` : ''}
  </div>${extra}</div>`;
}

/** On a wide screen: the book's cards down the side of the card, the one on show marked. */
function indexColumn(cards, index, act, { search = false } = {}) {
  const ordered = box.folders.find((f) => f.id === ui.folder)?.ordered;
  const initials = ordered ? [] : [...new Set(cards.map(letterOf))].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
  return `<aside class="index">
    <div class="index-head"><b class="nm rx">${esc(bookName())}</b><span class="dim small">${index >= 0 ? `${index + 1} / ${cards.length}` : plural(cards.length, 'card')}</span></div>
    ${initials.length > 1 ? `<div class="letters compact" data-raw>${initials.map((l) => `<button class="${index >= 0 && l === letterOf(cards[index]) ? 'on' : ''}" data-act="letter" data-l="${l}" data-go="${act}">${l}</button>`).join('')}</div>` : ''}
    <div class="pages" id="pg-index"><div class="content"><ul class="index-list">${cards.map((c, i) => `<li class="a"><button class="${i === index ? 'on' : ''}" data-act="${act}" data-i="${i}" data-to="${esc(c.id)}"><span class="rx nm">${esc(c.title)}</span>${c.keepProgress ? glyph.keep : ''}</button></li>`).join('')}</ul></div></div>
    <div class="count" data-for="pg-index"></div>
    ${search ? `<div class="search"><input class="field" id="q" type="search" placeholder="Search ${esc(bookName())}" value="${esc(ui.query)}" aria-label="Search">${ui.query ? btn('clear-q', 'Clear', { icon: false }) : ''}</div>` : ''}
  </aside>`;
}

function mountIndex(el) {
  const vp = el.querySelector('#pg-index');
  if (!vp) return;
  const p = paged(el, `index:${ui.folder}:${ui.query}`, { viewport: vp, keys: false });
  p?.reveal(vp.querySelector('button.on')?.closest('li'));
}

const cardWidth = (indexed) => window.innerWidth - (wide() ? 250 : 0) - (indexed && wide() ? 330 : 0) - 60;
/** The book's index beside the card, when there's room for both to read well. */
const indexed = () => wide() && window.innerWidth >= 1280;

/**
 * A card opened from Books. It sits in its book's rolodex: page on past its end for the next card,
 * tap a letter or a name to jump, a side book to go to that book.
 */
views.card = (id) => {
  const recipe = box.find(id);
  if (!recipe) return { html: `<p class="a">That card isn’t in the box any more.</p>${btn('tab', 'Back to Books', { attrs: 'data-to="books"', icon: false })}` };
  const cards = shownCards();
  const index = cards.findIndex((c) => c.id === (recipe.variantOf || recipe.id));
  const go2 = (i, fromEnd = false) => { ui.fromEnd = fromEnd; ui.rolodexStart = null; swap(cardHash(cards[((i % cards.length) + cards.length) % cards.length].id)); };
  const onEdge = cards.length > 1 && index >= 0 ? (dir) => go2(index + dir, dir < 0) : null;
  if (indexed() && index >= 0) {
    const c = cardView(recipe, { mode: 'detail', width: cardWidth(true), onEdge });
    return {
      tab: 'books',
      html: `<div class="cardview">${indexColumn(cards, index, 'open-swap')}<div class="cardpane">${c.html}${backBar(bookName(), 'back-books')}</div></div>`,
      mount(el) { mountIndex(el); c.mount(el); },
    };
  }
  const c = cardView(recipe, { mode: 'detail', width: cardWidth(false), onEdge });
  if (index < 0) return { tab: 'books', html: `${c.html}${backBar(box.folderName(recipe.folderId ?? null))}`, mount: c.mount };
  const letters = settings.textScale < 1.5 && !box.folders.find((f) => f.id === ui.folder)?.ordered;
  return {
    tab: 'books',
    html: `${c.html}${rolodex(cards, index, 1, letters, 'open-swap')}${bookStrip(`${index + 1} / ${cards.length}`, btn('back-books', 'Back', { g: 'back', cls: 'small' }))}`,
    mount(el) { c.mount(el); },
  };
};

/**
 * The Cards tab: the book's cards one at a time. Page or swipe through a card; past its last page
 * comes the next card, and after the last card the first again. Search stays within the book.
 */
views.cards = () => {
  const real = box.recipes.filter((r) => r.folderId !== DEV_BOOK);
  if (!real.length && !box.recipes.length) return views.books();
  const cards = shownCards();
  const inBook = box.inBook(ui.folder);
  ui.cardIndex = Math.max(0, Math.min(ui.cardIndex, cards.length - 1));
  const index = ui.cardIndex;
  const onEdge = cards.length > 1 ? (dir) => { ui.fromEnd = dir < 0; ui.cardIndex = (index + dir + cards.length) % cards.length; ui.rolodexStart = null; draw(); } : null;
  const empty = `<p class="dim a grow-1">${inBook.length ? `Nothing in ${esc(bookName())} matches “${esc(ui.query)}”.` : `No cards in ${esc(bookName())}.`}</p>`;
  if (indexed()) {
    const c = cards.length ? cardView(cards[index], { mode: 'cards', width: cardWidth(true), onEdge }) : null;
    return {
      html: `<div class="cardview">${indexColumn(cards, cards.length ? index : -1, 'cards-go', { search: true })}<div class="cardpane">${c ? c.html : empty}</div></div>`,
      mount(el) { mountIndex(el); c?.mount(el); liveSearch(el); },
    };
  }
  const c = cards.length ? cardView(cards[index], { mode: 'cards', width: cardWidth(false), onEdge }) : null;
  const scaleNow = settings.textScale;
  const letters = !box.folders.find((f) => f.id === ui.folder)?.ordered && scaleNow < 1.5;
  const searching = ui.cardsSearch || !!ui.query;
  const extra = `${btn('cards-search', `Search ${bookName()}`, { g: 'find', cls: `small ${searching ? 'on' : ''}`, icon: true })}${btn('cards-all', 'All', { cls: 'small', on: ui.folder === ALL, icon: false })}`;
  return {
    html: `${c ? c.html : empty}${c ? rolodex(cards, index, scaleNow <= 1.4 ? 3 : scaleNow <= 1.8 ? 2 : 1, letters, 'cards-go') : ''}
      ${bookStrip(cards.length ? `${index + 1} / ${cards.length}` : plural(0, 'recipe'), extra)}
      ${searching ? `<div class="search"><input class="field" id="q" type="search" placeholder="Search ${esc(bookName())}" value="${esc(ui.query)}" aria-label="Search">${ui.query ? btn('clear-q', 'Clear', { icon: false }) : ''}</div>` : ''}`,
    mount(el) { c?.mount(el); liveSearch(el); },
  };
};

function liveSearch(el) {
  const q = el.querySelector('#q');
  if (!q) return;
  q.addEventListener('input', () => {
    ui.query = q.value;
    ui.cardIndex = 0;
    clearTimeout(ui.searchSoon);
    ui.searchSoon = setTimeout(() => { draw(); const again = document.getElementById('q'); again?.focus(); again?.setSelectionRange(again.value.length, again.value.length); }, 250);
  });
}

/** The card alone, filling the screen. Close comes back. */
views.full = (id) => {
  const r = box.find(id) || (ui.preview?.id === id ? ui.preview : null);
  if (!r) return views.books();
  const c = cardView(r, { mode: 'full', width: window.innerWidth - 60 });
  return { bare: true, html: c.html, mount: c.mount };
};

// ---------------------------------------------------------------- what a card's buttons do

const rerender = () => draw();
actions.tick = (el) => {
  const r = cardOf(el);
  if (!r) return;
  const i = +el.dataset.i;
  if (MENUS.has(r.id)) { pickMenu(r.id, i); return; }
  const s = session(r);
  const set = el.dataset.kind === 'ing' ? s.checked : s.done;
  if (set.has(i)) set.delete(i); else set.add(i);
  touched(r);
  if (DEV_IDS.has(r.id)) devTicked(r);
  rerender();
};
actions['card-tab'] = (el) => { const r = cardOf(el); session(r).tab = el.dataset.tab; touched(r); rerender(); };
actions.factor = (el) => { const r = cardOf(el); session(r).factor = +el.dataset.f; touched(r); rerender(); };
actions.stepper = (el) => {
  const r = cardOf(el);
  const s = session(r);
  const now = r.servings * s.factor;
  s.factor = (+el.dataset.dir < 0 ? Math.max(1, Math.ceil(now) - 1) : Math.floor(now) + 1) / r.servings;
  touched(r);
  rerender();
};
actions.serves = (el) => { ui.typingServes = cardOf(el).id; rerender(); };
actions['serves-ok'] = (el) => submitServes(el.closest('form'));
function submitServes(form) {
  const r = cardOf(form);
  const n = parseInt(new FormData(form).get('n'), 10);
  if (n >= 1 && n <= 9999 && r.servings) { session(r).factor = n / r.servings; touched(r); }
  ui.typingServes = null;
  rerender();
}
export { submitServes };
actions.units = (el) => { const r = cardOf(el); const s = session(r); s.units = { US: 'Metric', Metric: 'AsWritten', AsWritten: 'US' }[s.units]; rerender(); };
actions['clear-ticks'] = (el) => { resetSession(cardOf(el)); rerender(); };
actions.keep = (el) => { const r = cardOf(el); setKeep(r, !r.keepProgress); notice(r.keepProgress ? 'Put away.' : `Kept open: “${r.title}” is on the Open tab.`); };
actions.cook = (el) => { const r = cardOf(el); startCook(r); };
actions.edit = (el) => { const r = cardOf(el); startEdit(r); };
actions['to-list'] = (el) => addCardToList(cardOf(el));
actions.print = (el) => { const r = cardOf(el); const s = session(r); ui.print = { items: [{ recipe: r, factor: s.factor, units: s.units }], title: r.title, extra: null }; go('#/print'); };
actions.full = (el) => { const r = cardOf(el); if (!box.find(r.id)) ui.preview = r; go(`#/full/${encodeURIComponent(r.id)}`); };
actions['close-full'] = () => back();
actions['follow-link'] = (el) => {
  if (el.dataset.to) go(cardHash(el.dataset.to));
  else if (el.dataset.url) { ui.importing = { url: el.dataset.url, recipe: null }; go('#/import'); }
};
actions.variant = (el) => { const r = cardOf(el); ui.shownVariant.set(r.variantOf || r.id, el.dataset.to); rerender(); };
actions['move-open'] = (el) => { const r = cardOf(el); ui.moving = ui.moving === r.id ? null : r.id; rerender(); };
actions['move-to'] = (el) => { const r = cardOf(el); const to = el.dataset.to || null; box.saveRecipe({ ...r, folderId: to, alsoIn: (r.alsoIn || []).filter((x) => x !== to) }); };
actions['also-in'] = (el) => { const r = cardOf(el); const id = el.dataset.to; const has = (r.alsoIn || []).includes(id); box.saveRecipe({ ...r, alsoIn: has ? r.alsoIn.filter((x) => x !== id) : [...(r.alsoIn || []), id] }); };
actions['extract-ask'] = (el) => { const r = cardOf(el); ui.extract = el.dataset.name ? { card: r.id, name: el.dataset.name } : null; rerender(); };
actions['extract-do'] = (el) => {
  const r = cardOf(el);
  const part = cardParts(r).find((p) => p.name === ui.extract?.name);
  ui.extract = null;
  if (!part) return;
  const [orig, sub] = extractPart(r, part);
  box.saveRecipes([sub, orig]);
  notice(`Made “${sub.title}” its own card, linked from this one.`);
};
actions['open-card'] = (el) => go(cardHash(el.dataset.to));
actions.branch = (el) => { const d = branchDraft(cardOf(el)); startEdit(d, { isNew: true }); };
actions['share-card'] = (el) => { const r = cardOf(el); downloadText(box.cardText(r), `${fileName(r.title)}.recipebox.json`); };
actions['add-nutrition'] = (el) => { const r = cardOf(el); startEdit(r, { tab: 'notes' }); };
actions['step-timer'] = (el) => { timers.start(el.dataset.key, el.dataset.label, +el.dataset.min); };
actions['timer-off'] = (el) => timers.dismiss(+el.dataset.id);
actions['cancel-wipe'] = () => cancelWipe();
actions['open-swap'] = (el) => { ui.rolodexStart = null; swap(cardHash(el.dataset.to)); };
actions['cards-go'] = (el) => { ui.cardIndex = +el.dataset.i; ui.rolodexStart = null; rerender(); };
actions['rolo-turn'] = (el) => {
  const cards = shownCards();
  const cur = route().view === 'card' ? box.find(route().id) : cards[ui.cardIndex];
  ui.rolodexFor = cur?.id;
  ui.rolodexStart = (((+el.dataset.start + +el.dataset.dir) % cards.length) + cards.length) % cards.length;
  rerender();
};
actions.letter = (el) => {
  const cards = shownCards();
  const i = cards.findIndex((c) => letterOf(c) === el.dataset.l);
  if (i < 0) return;
  ui.rolodexStart = null;
  if (el.dataset.go === 'cards-go') { ui.cardIndex = i; rerender(); } else swap(cardHash(cards[i].id));
};
actions['step-book'] = (el) => {
  const all = scopes();
  const i = Math.max(0, all.indexOf(ui.folder));
  setFolder(all[(i + +el.dataset.dir + all.length) % all.length]);
  if (route().view === 'card') go('#/books'); else rerender();
};
actions.manage = () => go('#/manage');
actions['back-books'] = () => go('#/books');
actions['cards-search'] = () => { ui.cardsSearch = !(ui.cardsSearch || ui.query); if (!ui.cardsSearch) ui.query = ''; rerender(); };
actions['cards-all'] = () => { setFolder(ALL); rerender(); };
actions['clear-q'] = () => { ui.query = ''; ui.tilePage = 0; ui.cardIndex = 0; rerender(); };

holds['link-line'] = (el) => {
  const r = cardOf(el);
  if (!r || !box.find(r.id) || DEV_IDS.has(r.id) || settings.simpleMode) return;
  go(`#/link/${encodeURIComponent(r.id)}/${el.dataset.lineKind}/${el.dataset.i}`);
};

export const fileName = (title) => (title || 'recipe').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'recipe';
export function downloadText(text, name, type = 'application/json') {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- the editor

const t = (m) => (m == null ? '' : formatMinutes(m));

/** Opens a card in the editor: fields as text, kept as they're typed. */
export function startEdit(r, { isNew = !box.find(r.id), tab = 'ingredients' } = {}) {
  const known = r.folderId && box.folders.some((f) => f.id === r.folderId);
  const fallback = box.folders.some((f) => f.id === ui.folder) ? ui.folder : (ui.lastBook && box.folders.some((f) => f.id === ui.lastBook) ? ui.lastBook : (box.folders.length === 1 ? box.folders[0].id : null));
  const book = known ? r.folderId : (isNew || r.folderId ? fallback : null);
  const d = {
    title: r.title, prep: t(r.prepMin), cook: t(r.cookMin), total: t(r.totalMin), servings: r.servings ? String(r.servings) : '', yieldText: r.yieldText || '',
    ingredients: r.ingredients.join('\n'), steps: r.steps.join('\n'), description: r.description || '', notes: r.notes || '', nutrition: r.nutrition.join('\n'),
    sourceName: r.sourceName || '', sourceUrl: r.sourceUrl || '', author: r.author || '', cuisine: r.cuisine || '', category: r.category || '', keywords: r.keywords || '', book,
  };
  ui.draft = { recipe: r, isNew, d, start: JSON.stringify(d), tab, confirmClose: false, confirmDelete: false, bookChanged: book !== (r.folderId ?? null) };
  go(`#/edit/${encodeURIComponent(r.id)}`);
}

function applyDraft(r, d) {
  const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const n = parseInt(d.servings, 10);
  return {
    ...r, folderId: d.book ?? null, title: d.title.trim() || 'Untitled recipe',
    prepMin: parseMinutes(d.prep), cookMin: parseMinutes(d.cook), totalMin: parseMinutes(d.total), servings: n > 0 ? n : null, yieldText: d.yieldText.trim(),
    ingredients: lines(d.ingredients), steps: lines(d.steps), description: d.description.trim(), nutrition: lines(d.nutrition), notes: d.notes.trim(),
    sourceName: d.sourceName.trim(), sourceUrl: d.sourceUrl.trim(), author: d.author.trim(), cuisine: d.cuisine.trim(), category: d.category.trim(), keywords: d.keywords.trim(),
  };
}

const field = (name, label, value, ph, { area = false, rows = 3, cls = '' } = {}) => `<div class="a ${cls}"><label for="f-${name}">${esc(label)}</label>${area
  ? `<textarea class="field" id="f-${name}" data-draft="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(value)}</textarea>`
  : `<input class="field" id="f-${name}" data-draft="${name}" value="${esc(value)}" placeholder="${esc(ph)}" autocomplete="off">`}</div>`;

/**
 * The editor, in two boxes: name and details in one, ingredients / method / notes in the other.
 * Side by side when there's room, stacked otherwise.
 */
views.edit = (id) => {
  const dr = ui.draft;
  if (!dr || dr.recipe.id !== id) {
    const r = box.find(id);
    if (!r) return views.books();
    startEdit(r);
    return views.edit(id);
  }
  const { d, recipe: r, isNew } = dr;
  const from = r.branchOf && box.find(r.branchOf);
  const crumb = `${box.folderName(d.book ?? null)} › ${isNew && r.branchOf ? 'New branch' : isNew ? 'New card' : d.title || 'Editing'}`;
  const general = `<div class="ebox"><b>Name &amp; details</b><div class="pages" id="pg-ed1"><div class="content form">
    ${field('title', 'Name', d.title, 'e.g. Grandma’s Meatloaf')}
    <div class="a"><label>Book</label><div class="flow">${btn('ed-book', 'Loose cards', { cls: 'small', on: d.book == null, attrs: 'data-to=""', icon: false })}${box.folders.filter((f) => f.id !== DEV_BOOK).map((f) => btn('ed-book', f.name, { cls: 'small', on: d.book === f.id, attrs: `data-to="${esc(f.id)}"`, icon: false })).join('')}${btn('ed-newbook', '+ New book…', { cls: 'small', icon: false })}</div></div>
    <div class="pair">${field('prep', 'Prep', d.prep, '15m')}${field('cook', 'Cook', d.cook, '1h 10m')}</div>
    <div class="pair">${field('total', 'Total', d.total, 'blank = prep + cook')}${field('servings', 'Serves', d.servings, '4')}</div>
    ${field('yieldText', 'Yield', d.yieldText, 'e.g. 1 loaf, 24 cookies')}
    ${field('sourceName', 'Source', d.sourceName, 'e.g. Mom, a cookbook, a website')}
    ${field('sourceUrl', 'Link', d.sourceUrl, 'https://…')}
    ${field('author', 'Author', d.author, 'Who wrote it')}
    ${field('cuisine', 'Cuisine', d.cuisine, 'e.g. Italian, Thai')}
    ${field('category', 'Category', d.category, 'e.g. Dinner, Dessert')}
    ${field('keywords', 'Keywords', d.keywords, 'e.g. quick, freezer-friendly')}
    ${isNew ? '' : `<div class="a" style="margin-top:12px">${btn('ed-delete', dr.confirmDelete ? 'Tap again to delete' : 'Delete recipe', { cls: 'wide-btn', on: dr.confirmDelete, icon: false })}</div>`}
  </div></div><div class="count" data-for="pg-ed1"></div></div>`;
  const tabs = [['ingredients', 'Ingredients'], ['method', 'Method'], ['notes', 'Notes']];
  const rest = `<div class="ebox"><div class="cardtabs">${tabs.map(([k, l]) => `<button class="${dr.tab === k ? 'on' : ''}" data-act="ed-tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div class="pages" id="pg-ed2"><div class="content form">${{
      ingredients: () => field('ingredients', 'One per line · ## for headings', d.ingredients, '2 cups flour\n1 tsp salt\n## For the sauce\n14 oz can tomatoes', { area: true, rows: 16, cls: 'tall' }),
      method: () => field('steps', 'One step per line · ## for headings', d.steps, 'Heat the oven to 350°F.\nMix the flour and salt.\nBake for 25 minutes.\n\n(Times like "25 minutes" get a timer button.)', { area: true, rows: 16, cls: 'tall' }),
      notes: () => field('description', 'About', d.description, 'One line about the dish.', { area: true, rows: 2 })
        + field('notes', 'My notes', d.notes, 'What you changed, what to try next time.', { area: true, rows: 6 })
        + field('nutrition', 'Nutrition facts, per serving · one per line', d.nutrition, 'Calories: 350 kcal\nProtein: 20 g\nCarbohydrate: 30 g\nFat: 12 g', { area: true, rows: 5 }),
    }[dr.tab]()}</div></div><div class="count" data-for="pg-ed2"></div></div>`;
  return {
    bare: true,
    html: `<section class="editor card">
      <h1 class="title nm rx">${esc(crumb)}</h1>
      ${isNew ? `<p class="dim small" style="margin:0">${from ? `A new recipe made from “${esc(from.title)}”. Give it its own name, change what you like, then Save &amp; close. “${esc(from.title)}” stays as it is.` : 'Name it, add ingredients and method, then Save &amp; close. Everything else is optional.'}</p>` : ''}
      <div class="eboxes ${window.innerWidth > 760 ? 'side' : ''}">${general}${rest}</div>
      <div class="row-btns">${btn('ed-close', dr.confirmClose ? 'Discard changes?' : 'Close', { cls: 'grow', on: dr.confirmClose, icon: false })}${btn('ed-save', 'Save & close', { cls: 'grow primary', icon: false })}</div>
      ${settings.variants && !isNew ? `<div class="row-btns">${btn('ed-variant', 'Save as new variant & close', { cls: 'grow', icon: false })}</div>` : ''}
    </section>`,
    mount(el) {
      // Typing in a field doesn't turn pages, and every key is kept as it's typed.
      paged(el, `ed1:${id}`, { viewport: el.querySelector('#pg-ed1'), keys: false });
      paged(el, `ed2:${id}:${dr.tab}`, { viewport: el.querySelector('#pg-ed2'), keys: false });
      el.querySelectorAll('.pages').forEach((p) => { p.style.touchAction = 'pan-y'; });
      el.querySelectorAll('[data-draft]').forEach((f) => f.addEventListener('input', () => {
        dr.d[f.dataset.draft] = f.dataset.draft === 'servings' ? f.value.replace(/\D/g, '') : f.value;
        dr.confirmClose = false;
      }));
    },
  };
};

const draftChanged = (dr) => JSON.stringify(dr.d) !== dr.start || dr.bookChanged;
actions['ed-tab'] = (el) => { ui.draft.tab = el.dataset.tab; rerender(); };
actions['ed-book'] = (el) => { ui.draft.d.book = el.dataset.to || null; ui.draft.bookChanged = true; rerender(); };
actions['ed-newbook'] = () => {
  const name = prompt('Name of the new book');
  if (!name?.trim()) return;
  ui.draft.d.book = box.addBook(name.trim());
  ui.draft.bookChanged = true;
  rerender();
};
actions['ed-delete'] = () => {
  const dr = ui.draft;
  if (!dr.confirmDelete) { dr.confirmDelete = true; rerender(); return; }
  box.deleteRecipe(dr.recipe.id);
  ui.draft = null;
  go('#/books');
  notice('Card deleted.');
};
actions['ed-close'] = () => {
  const dr = ui.draft;
  if (draftChanged(dr) && !dr.confirmClose) { dr.confirmClose = true; rerender(); return; }
  ui.draft = null;
  back();
};
actions['ed-save'] = () => {
  const dr = ui.draft;
  // A new card nobody wrote anything on isn't kept as an empty "Untitled recipe".
  if (dr.isNew && !draftChanged(dr) && !dr.recipe.branchOf) { ui.draft = null; back(); return; }
  const next = applyDraft(dr.recipe, dr.d);
  if (dr.isNew) box.saveRecipe(next); else saveEdited(dr.recipe, next);
  ui.draft = null;
  swap(cardHash(next.id));
};
actions['ed-variant'] = () => {
  const dr = ui.draft;
  if (!draftChanged(dr)) return;
  saveVariant(dr.recipe, applyDraft(dr.recipe, dr.d));
  ui.draft = null;
  back();
};

/** A blank card, opened straight into the editor. */
export function newCard() { startEdit(box.newRecipe(null), { isNew: true }); }

// ---------------------------------------------------------------- linking a line to a card

/** Press and hold a line to get here: pick the card it uses. Cards named in the line come first. */
views.link = (id, rest) => {
  const r = box.find(id);
  const kind = rest[1];
  const index = +rest[2];
  const line = r && (kind === 'i' ? r.ingredients : r.steps)[index];
  if (!r || line == null) return views.books();
  const linked = (r.subRecipes || []).filter((s) => s.kind === kind && s.index === index);
  const linkedIds = new Set(linked.map((s) => box.resolve(s)?.id).filter(Boolean));
  const needle = fold((ui.linkFind || '').trim());
  const folded = fold(line);
  const cards = box.sorted().filter((c) => c.id !== r.id && !linkedIds.has(c.id) && !DEV_IDS.has(c.id) && c.folderId !== DEV_BOOK)
    .filter((c) => !needle || sortKey(c).includes(needle))
    .sort((a, b) => (sortKey(b).length >= 3 && folded.includes(sortKey(b)) ? 1 : 0) - (sortKey(a).length >= 3 && folded.includes(sortKey(a)) ? 1 : 0));
  const name = kind === 'i' ? ingredientName(line) : 'a recipe';
  return {
    html: `<div class="narrow-col"><div class="pages"><div class="content">
      <div class="label a">${kind === 'i' ? 'Ingredient on' : 'Step on'} <span class="rx">${esc(r.title)}</span></div>
      <p class="bold a rx" style="font-size:1.15em;margin:0 0 10px">${esc(line)}</p>
      ${linked.length ? `<div class="label a">Linked</div>${linked.map((s, k) => `<div class="bar a"><b class="grow rx">→ ${esc(box.resolve(s)?.title || s.name)}</b>${btn('unlink', 'Unlink', { cls: 'small', attrs: `data-k="${k}"`, icon: false })}</div>`).join('')}` : ''}
      ${canFind() ? `<div class="a" style="margin:10px 0">${btn('link-search', `Find “${name}” online`, { g: 'find', cls: 'wide-btn', icon: false })}</div>` : ''}
      <div class="label a keep">Link a card</div>
      ${cards.length ? cards.map((c) => `<button class="pickrow a" data-act="link-pick" data-to="${esc(c.id)}"><b class="rx grow clamp2">${esc(c.title)}</b><span class="dim small nm">${esc(box.folderName(c.folderId ?? null))}</span></button>`).join('') : `<p class="dim a">No cards called “${esc(ui.linkFind)}”.</p>`}
    </div></div><div class="count"></div>
    <div class="search"><input class="field" id="link-find" placeholder="Find a card" value="${esc(ui.linkFind || '')}" autocomplete="off">${ui.linkFind ? btn('link-clear', 'Clear', { icon: false }) : ''}</div>
    ${backBar('Link a card', 'link-back')}</div>`,
    mount(el) {
      paged(el, `link:${id}:${kind}:${index}:${needle}`);
      const f = el.querySelector('#link-find');
      f.addEventListener('input', () => { ui.linkFind = f.value; clearTimeout(ui.linkSoon); ui.linkSoon = setTimeout(() => { draw(); const g = document.getElementById('link-find'); g?.focus(); g?.setSelectionRange(g.value.length, g.value.length); }, 200); });
    },
  };
};
const linkTarget = () => { const { id, rest } = route(); return [box.find(id), rest[1], +rest[2]]; };
actions['link-pick'] = (el) => { const [r, kind, i] = linkTarget(); linkCard(r, kind, i, box.find(el.dataset.to)); ui.linkFind = ''; back(); };
actions.unlink = (el) => { const [r, kind, i] = linkTarget(); const s = r.subRecipes.filter((x) => x.kind === kind && x.index === i)[+el.dataset.k]; if (s) unlinkCard(r, s); };
actions['link-clear'] = () => { ui.linkFind = ''; rerender(); };
actions['link-back'] = () => { ui.linkFind = ''; back(); };
actions['link-search'] = () => {
  const [r, kind, i] = linkTarget();
  const line = (kind === 'i' ? r.ingredients : r.steps)[i];
  ui.pendingLink = { recipeId: r.id, kind, index: i, line };
  ui.importFolder = r.folderId ?? null;
  ui.find.query = kind === 'i' ? ingredientName(line) : line;
  go('#/find');
  actions['find-search']?.();
};

// ---------------------------------------------------------------- cook mode

/** Steps a child shouldn't do alone: heat, blades, boiling, hot pans. */
const grownUp = /\b(oven|stove|hob|heat|boil|boiling|simmer|fry|frying|grill|broil|knife|chop|slice|dice|grate|hot|microwave|blender|bake|toast)\w*/i;
const cookSteps = (r) => r.steps.map((text, index) => ({ text, index })).filter((x) => !x.text.startsWith('## '));

/** Cook mode. Starting fresh with ingredients still unticked begins on a "gather" page listing what's left to get out. */
export function startCook(r) {
  const s = session(r);
  const missing = r.ingredients.some((l, i) => !l.startsWith('## ') && !s.checked.has(i));
  if (!s.step && missing) s.step = -1;
  if (s.step == null) s.step = 0;
  s.toGather = r.ingredients.map((l, i) => i).filter((i) => !r.ingredients[i].startsWith('## ') && !s.checked.has(i));
  ui.spokenAt = null;
  ui.armed = false;
  if (!box.find(r.id)) ui.preview = r;
  go(`#/cook/${encodeURIComponent(r.id)}`);
}

function spoken(r, s) {
  const ing = ingText(s);
  if (s.step < 0) return `Get these out. ${(s.toGather || []).filter((i) => !s.checked.has(i)).map((i) => ing(r.ingredients[i])).join('. ')}`;
  const step = cookSteps(r)[s.step].text;
  const uses = ingredientsInStep(step, r.ingredients).map((i) => ing(r.ingredients[i]));
  return `Step ${s.step + 1}. ${convertTemps(step, s.units)}${uses.length ? `. You'll need: ${uses.join('. ')}` : ''}`;
}

/**
 * Cook mode: one step per page in big type, with the amounts that step needs. The big button is
 * Next, but it won't skip past a step's timer without asking: a step with a timer asks "tap again
 * to start" (or skip it), a running timer becomes the bar itself, and a finished one says so.
 */
views.cook = (id) => {
  const r = box.find(id) || (ui.preview?.id === id ? ui.preview : null);
  if (!r) return views.books();
  const s = session(r);
  const steps = cookSteps(r);
  if (!steps.length) return views.card(id);
  if (!s.toGather) s.toGather = r.ingredients.map((l, i) => i).filter((i) => !r.ingredients[i].startsWith('## ') && !s.checked.has(i));
  const first = s.toGather.length ? -1 : 0;
  s.step = Math.max(first, Math.min(s.step ?? first, steps.length - 1));
  const ing = ingText(s);
  let body;
  let label;
  let go1;
  if (s.step < 0) {
    const left = s.toGather.filter((i) => !s.checked.has(i)).length;
    label = left === 0 ? 'Got everything' : icons() ? 'Get these out' : `Gather first · ${left} to get out`;
    body = `<ul class="checks gather rx">${s.toGather.map((i) => `<li class="a ${s.checked.has(i) ? 'on' : ''}" role="checkbox" aria-checked="${s.checked.has(i)}" tabindex="0" data-act="tick" data-kind="ing" data-i="${i}"><span class="box"></span><span class="txt">${esc(ing(r.ingredients[i]))}</span></li>`).join('')}</ul>`;
    go1 = btn('cook-next', icons() ? '▶' : left === 0 ? 'Start cooking' : 'Start anyway', { cls: 'big primary grow', icon: false });
  } else {
    const { text, index } = steps[s.step];
    const head = r.steps.slice(0, index).reverse().find((x) => x.startsWith('## '));
    label = icons() ? '' : [`Step ${s.step + 1} of ${steps.length}`, head?.slice(3)].filter(Boolean).join(' · ');
    const done = s.done.has(index);
    const uses = ingredientsInStep(text, r.ingredients);
    const last = s.step === steps.length - 1;
    body = `<div class="step a rx ${done ? 'done' : ''}" data-act="tick" data-kind="step" data-i="${index}" role="checkbox" aria-checked="${done}" tabindex="0"><span class="box"></span><span>${done ? esc(convertTemps(text, s.units)) : rtext(convertTemps(text, s.units))}</span></div>
      ${kid() && grownUp.test(text) ? '<div class="warn a">⚠ Ask a grown-up to help with this one</div>' : ''}
      ${uses.length ? `<div class="uses a">${uses.map((i) => `<button class="use ${s.checked.has(i) ? 'got' : ''}" data-act="tick" data-kind="ing" data-i="${i}">· ${esc(ing(r.ingredients[i]))}</button>`).join('')}</div>` : ''}
      ${last && r.notes ? `<div class="box-panel a" style="margin-top:14px"><span class="label" style="margin:0">${icons() ? 'ℹ' : 'Notes'}</span><span class="rx">${esc(r.notes).replace(/\n/g, '<br>')}</span></div>` : ''}`;
    // The big button: Next, or start / stop this step's timer (asking first).
    const keys = stepTimers(text).map((m) => [`${r.id}#${index}#${m}`, m]);
    const finished = ui.finishedTimers?.[`${r.id}#${index}`] || [];
    const active = keys.map(([k]) => timers.running(k)).find(Boolean);
    const pending = keys.find(([k]) => !timers.running(k) && !finished.includes(k));
    if (active?.done) go1 = btn('cook-next', icons() ? '✓ ▶' : 'Time’s up · Next', { cls: 'big primary grow', icon: false });
    else if (active) go1 = `<div class="meter big grow" data-act="cook-next" role="button" tabindex="0"><div class="fill" style="width:${100 * timers.fraction(active)}%"></div><span>${ui.armed ? 'Tap again to stop & go on' : `${timers.left(active)} · tap to stop`}</span></div>`;
    else if (pending) go1 = (ui.armed ? btn('cook-skip', icons() ? '▶▶' : 'Skip timer', { cls: 'big', icon: false }) : '') + btn('cook-next', ui.armed ? `Tap again to start ${formatMinutes(pending[1])} timer` : icons() ? '▶' : 'Next', { cls: 'big primary grow', icon: false });
    else go1 = btn('cook-next', icons() ? (last ? '✓' : '▶') : last ? 'Done' : 'Next', { cls: 'big primary grow', icon: false });
  }
  const stepList = wide() ? `<aside class="steplist"><div class="label">${esc(r.title)}</div><div class="pages" id="pg-steps"><div class="content"><ol class="steps-nav">
      ${s.toGather.length ? `<li class="a"><button class="${s.step < 0 ? 'on' : ''}" data-act="cook-jump" data-to="-1">Gather</button></li>` : ''}
      ${steps.map((st, k) => `<li class="a"><button class="${k === s.step ? 'on' : ''} ${s.done.has(st.index) ? 'done' : ''}" data-act="cook-jump" data-to="${k}"><b>${k + 1}.</b> <span class="rx clamp2">${esc(st.text)}</span></button></li>`).join('')}
    </ol></div></div><div class="count" data-for="pg-steps"></div></aside>` : '';
  return {
    bare: true,
    html: `<div class="cookwrap">${stepList}<section class="cook" data-card="${esc(r.id)}">
      <div class="bar cook-head"><div class="grow title rx">${esc(r.title)}</div>
        ${'speechSynthesis' in window ? btn('read', 'Read', { g: 'read', cls: 'small' }) : ''}
        ${btn('close-cook', 'Close', { g: 'close', cls: 'small', icon: false })}</div>
      ${label ? `<div class="dim bold">${esc(label)}</div>` : ''}
      <div class="pages" id="pg-cook"><div class="content">${body}</div></div>
      <div class="count" data-for="pg-cook"></div>
      <div class="row-btns cook-go">${s.step > first ? '<button class="btn big" data-act="cook-back" aria-label="Back a step">◀</button>' : ''}${go1}</div>
    </section></div>`,
    mount(el) {
      const p = paged(el, `cook:${r.id}:${s.step}`, { viewport: el.querySelector('#pg-cook'), onEdge: (dir) => cookGo(r, s.step + dir) });
      if (wide()) { const q = paged(el, `steps:${r.id}`, { viewport: el.querySelector('#pg-steps'), keys: false }); q?.reveal(el.querySelector('.steps-nav button.on')?.closest('li')); }
      setPageKeys((dir) => p.turn(dir));
      ui.cookAction = () => cookPrimary(r);
      if (settings.readAloud && ui.spokenAt !== `${r.id}:${s.step}`) { ui.spokenAt = `${r.id}:${s.step}`; say(spoken(r, s)); }
    },
  };
};

/** Moving on, however it's done, ticks off the step being left; on from the last finishes and puts cook mode back at the start. */
function cookGo(r, p) {
  const s = session(r);
  const steps = cookSteps(r);
  const leaving = steps[s.step]?.index;
  if (p > s.step && leaving != null) s.done.add(leaving);
  ui.armed = false;
  if (p > steps.length - 1) {
    s.step = 0;
    s.toGather = null;
    touched(r);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    back();
    return;
  }
  s.step = Math.max(s.toGather?.length ? -1 : 0, Math.min(p, steps.length - 1));
  touched(r);
  draw();
}

function cookPrimary(r) {
  const s = session(r);
  if (s.step < 0) { cookGo(r, 0); return; }
  const { text, index } = cookSteps(r)[s.step];
  const keys = stepTimers(text).map((m) => [`${r.id}#${index}#${m}`, m]);
  ui.finishedTimers = ui.finishedTimers || {};
  const fin = (ui.finishedTimers[`${r.id}#${index}`] = ui.finishedTimers[`${r.id}#${index}`] || []);
  const activeKey = keys.find(([k]) => timers.running(k));
  const active = activeKey && timers.running(activeKey[0]);
  const pending = keys.find(([k]) => !timers.running(k) && !fin.includes(k));
  if (active && (active.done || ui.armed)) { timers.dismiss(active.id); fin.push(activeKey[0]); cookGo(r, s.step + 1); return; }
  if (active) { ui.armed = true; draw(); return; }
  if (pending) {
    if (ui.armed) { timers.start(pending[0], `${r.title} · step ${s.step + 1}`, pending[1]); ui.armed = false; draw(); } else { ui.armed = true; draw(); }
    return;
  }
  cookGo(r, s.step + 1);
}

actions['cook-next'] = (el) => cookPrimary(cardOf(el));
actions['cook-back'] = (el) => { const r = cardOf(el); cookGo(r, session(r).step - 1); };
actions['cook-skip'] = (el) => {
  const r = cardOf(el);
  const s = session(r);
  const { text, index } = cookSteps(r)[s.step];
  const fin = (ui.finishedTimers[`${r.id}#${index}`] = ui.finishedTimers[`${r.id}#${index}`] || []);
  const pending = stepTimers(text).map((m) => `${r.id}#${index}#${m}`).find((k) => !timers.running(k) && !fin.includes(k));
  if (pending) fin.push(pending);
  ui.armed = false;
  draw();
};
actions['cook-jump'] = (el) => { const r = cardOf(document.querySelector('.cook')); const s = session(r); s.step = +el.dataset.to; ui.armed = false; touched(r); draw(); };
actions['close-cook'] = () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); ui.cookAction = null; back(); };
actions.read = (el) => { const r = cardOf(el); say(spoken(r, session(r))); };

/** The running timers, one bar each: time left draining, or TIME'S UP. */
export function timerBarHtml() {
  return ui.timers.map((t) => (t.done
    ? `<div class="timer"><div class="meter up"><span>TIME’S UP · ${esc(t.label)}</span></div>${btn('timer-off', 'OK', { attrs: `data-id="${t.id}"`, icon: false })}</div>`
    : `<div class="timer"><div class="meter"><div class="fill" style="width:${100 * timers.fraction(t)}%"></div><span>${timers.left(t)} left · ${esc(t.label)}</span></div>${btn('timer-off', 'Stop', { attrs: `data-id="${t.id}"`, icon: false })}</div>`)).join('');
}

import { forms } from './core.js';
forms.serves = (form) => submitServes(form);
