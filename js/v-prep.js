// Prep: the plan, a day, a week, a month or a year at a time. Each meal is a few cards in a slot
// (Breakfast, Lunch service, Prep work…); from any period come one shopping list, a prep plan,
// everything kept open at once, printouts, and saved preps to use again. Also: changing a meal,
// the prep plan, plan layouts, and each kitchen's cupboard.

import { box, settings, ui, views, actions, holds, forms, esc, plural, btn, glyph, notice, go, back, swap, route, paged, wide, draw, allows, saveSettings, backBar, cardHash, DEV_BOOK } from './core.js';
import { activeProfile, profiles, cupboard, saveCupboard, setKeep } from './ops.js';
import {
  Dates, periodOf, periodTitle, periodDays, inPeriod, stepPeriod, placeSaved, SPANS, planEntries, planSubRecipes, mealMinutes, planShopping, planHtml,
  planPrintItems, slotOrder, currentSlot, HOME, Pantry, Cupboard, profilesOf, effectiveTotal,
} from './kitchen.js';
import { uuid } from './box.js';
import { formatMinutes, fold, matches } from './units.js';

const period = () => periodOf(ui.prepSpan, ui.prepAnchor || Dates.today());

/** Synced to the clock: Prep opens on today, at about this meal. */
export function prepOpened() {
  if (settings.prepNow) { ui.prepSpan = 'Day'; ui.prepAnchor = Dates.today(); }
}

views.prep = () => {
  const ps = profiles();
  const profile = activeProfile();
  const p = period();
  const entries = planEntries(box, profile, p.from, p.to);
  const today = Dates.today();
  const recipes = entries.reduce((n, e) => n + e.recipes.length, 0);
  const plan = { Day: () => dayPlan(profile, p.from, entries), Week: () => weekPlan(p, entries), Month: () => monthPlan(p, entries), Year: () => yearPlan(p, entries) }[p.span]();
  return {
    tab: 'prep',
    html: `
      ${ps.length > 1 ? `<div class="flow">${ps.map((x) => btn('prep-profile', x.name, { cls: 'small', on: x.id === profile.id, attrs: `data-id="${esc(x.id)}"`, icon: false })).join('')}</div>` : ''}
      <div class="row-btns spans">${SPANS.map((s) => btn('prep-span', s, { cls: 'small grow', on: ui.prepSpan === s, attrs: `data-v="${s}"`, icon: false })).join('')}${btn('prep-today', 'Today', { cls: 'small', on: ui.prepSpan === 'Day' && inPeriod(p, today), icon: false })}</div>
      <div class="bar period">${btn('prep-step', '◀', { cls: 'small', attrs: 'data-dir="-1"', icon: false })}
        <div class="grow center"><div class="title">${esc(periodTitle(p))}</div><div class="dim small">${entries.length ? `${plural(entries.length, 'meal')} · ${plural(recipes, 'recipe')}` : 'Nothing planned'}</div></div>
        ${btn('prep-step', '▶', { cls: 'small', attrs: 'data-dir="1"', icon: false })}</div>
      <div class="pages" id="pg-prep"><div class="content prep-${p.span.toLowerCase()}">${plan}</div></div><div class="count" data-for="pg-prep"></div>
      ${panelHtml(profile, p, entries)}
      <div class="row-btns">
        ${btn('meal-new', 'Meal', { g: 'plus', cls: `small ${entries.length ? '' : 'on'}`, attrs: `data-date="${inPeriod(p, today) ? today : p.from}"` })}
        ${entries.length ? `${btn('prep-plan', 'Prep plan', { g: 'method', cls: 'small' })}${btn('prep-list', 'List', { g: 'list', cls: 'small' })}${btn('prep-keep', 'Keep open', { g: 'keep', cls: 'small' })}${btn('prep-print', 'Print', { g: 'print', cls: 'small' })}${btn('prep-panel', 'Save as…', { cls: 'small', on: ui.panel === 'save', attrs: 'data-v="save"', icon: false })}` : ''}
        ${(box.data.prepSaved || []).some((s) => s.profile === profile.id) ? btn('prep-panel', 'Use saved…', { cls: 'small', on: ui.panel === 'use', attrs: 'data-v="use"', icon: false }) : ''}
        ${entries.length ? btn('prep-panel', 'Clear', { cls: 'small', on: ui.panel === 'clear', attrs: 'data-v="clear"', icon: false }) : ''}
      </div>`,
    mount(el) {
      const pager = paged(el, `prep:${p.span}:${p.from}:${profile.id}`, { viewport: el.querySelector('#pg-prep') });
      // Opened on today: turn to the page with the meal it is now, if it isn't on the first.
      if (p.span === 'Day' && p.from === today && !ui.pages.get(`prep:${p.span}:${p.from}:${profile.id}`)) pager?.reveal(el.querySelector('.slot.now'));
    },
  };
};

function panelHtml(profile, p, entries) {
  if (ui.panel === 'save') {
    return `<form class="box-panel thick" data-form="save-prep"><b>Save this ${p.span.toLowerCase()} to use again</b>
      <div class="search"><input class="field" name="name" placeholder="e.g. Usual week, Banquet Saturday" autocomplete="off" autofocus>${btn('save-prep', 'Save', { cls: 'primary', icon: false })}</div></form>`;
  }
  if (ui.panel === 'use') {
    const saved = (box.data.prepSaved || []).filter((s) => s.profile === profile.id).sort((a, b) => (a.span !== p.span) - (b.span !== p.span) || a.name.localeCompare(b.name));
    const removing = saved.find((s) => s.id === ui.removingSaved);
    return `<div class="box-panel thick"><b>Put a saved prep on ${esc(periodTitle(p))}</b><span class="dim small">A day or week repeats to fill a longer stretch. Hold one (or right-click) to delete it.</span>
      <div class="flow">${saved.map((s) => btn('use-saved', `${s.name} · ${s.span.toLowerCase()}, ${s.meals.length}`, { cls: 'small', attrs: `data-id="${s.id}" data-hold="saved-remove"`, icon: false })).join('')}</div>
      ${removing ? `<div class="bar"><span class="grow">Delete “${esc(removing.name)}”?</span>${btn('saved-delete', 'Delete', { cls: 'primary', icon: false })}${btn('saved-keep', 'Keep', { icon: false })}</div>` : ''}</div>`;
  }
  if (ui.panel === 'clear') {
    return `<div class="box-panel thick bar"><b class="grow">Clear ${plural(entries.length, 'meal')} from ${esc(periodTitle(p))}?</b>${btn('prep-clear', 'Clear', { cls: 'primary', icon: false })}${btn('prep-panel', 'Keep', { attrs: 'data-v="clear"', icon: false })}</div>`;
  }
  return '';
}

/** A meal as a box: its slot (when not shown already), who it's for, its time, and its dishes. */
function mealRow(e, showSlot = false) {
  const [total, prep] = mealMinutes(e.recipes);
  return `<div class="meal a" data-act="meal-open" data-id="${e.meal.id}" role="button" tabindex="0">
    <div class="bar">${showSlot ? `<b class="grow nm">${esc(e.slot.name)}</b>` : '<span class="grow"></span>'}<span class="dim small">${[e.meal.people != null && `for ${e.meal.people}`, total > 0 && `about ${formatMinutes(total)}`, prep > 0 && `prep ${formatMinutes(prep)}`].filter(Boolean).join(' · ')}</span></div>
    ${e.recipes.length ? '' : '<div class="dim small">No cards yet: tap to add some.</div>'}
    <div class="flow">${e.recipes.map((r) => `<button class="btn small" data-act="meal-card" data-to="${esc(r.id)}"><span class="rx">${esc(r.title)}</span></button>`).join('')}</div>
    ${e.meal.note ? `<div class="dim small rx">${esc(e.meal.note)}</div>` : ''}
  </div>`;
}

/** A day: its slots in order (prep work first), each with its meals and a + to add one. */
function dayPlan(profile, date, entries) {
  const now = date === Dates.today() ? currentSlot(profile) : null;
  const needed = planSubRecipes(box, entries.filter((e) => !e.slot.prep));
  const inPrep = new Set(entries.filter((e) => e.slot.prep).flatMap((e) => e.meal.cards));
  return slotOrder(profile).map((i) => {
    const slot = profile.slots[i];
    const here = entries.filter((e) => e.meal.slot === i);
    const todo = slot.prep ? needed.filter(([r]) => !inPrep.has(r.id)) : [];
    return `<div class="slot a ${i === now ? 'now' : ''}">
      <div class="bar"><b class="grow slot-name">${esc(slot.name)}${slot.time ? ` · ${esc(slot.time)}` : ''}${i === now ? ' · now' : ''}</b>${here.length ? '' : `<span class="dim small">${slot.prep ? 'Make-ahead, chopping, sub-recipes' : 'Nothing planned'}</span>`}${btn('meal-new', 'Add', { g: 'plus', cls: 'small', attrs: `data-date="${date}" data-slot="${i}"` })}</div>
      <hr class="rule thin">${here.map((e) => mealRow(e)).join('')}
      ${todo.length ? `<div class="dim small">Needed today</div><div class="flow">${todo.map(([r, at]) => btn('prep-needed', `+ ${r.title}`, { cls: 'small', attrs: `data-to="${esc(r.id)}" data-date="${date}" data-slot="${i}" data-for="${esc(at.join(', '))}"`, icon: false })).join('')}</div>` : ''}
    </div>`;
  }).join('');
}

/** A week, Monday on: each day's meals (seven columns on a wide screen); tap a day's name to open it. */
function weekPlan(p, entries) {
  const today = Dates.today();
  return Array.from({ length: 7 }, (_, d) => {
    const date = Dates.addDays(p.from, d);
    const meals = entries.filter((e) => e.meal.date === date);
    return `<div class="weekday a ${date === today ? 'today' : ''}">
      <div class="bar"><button class="grow linkish day-name" data-act="prep-day" data-date="${date}"><b>${esc(wide() ? Dates.short(date) : Dates.long(date))}${date === today ? ' · today' : ''}</b></button>${meals.length || wide() ? '' : '<span class="dim small">Nothing planned</span>'}${btn('meal-new', 'Meal', { g: 'plus', cls: 'small', attrs: `data-date="${date}"`, icon: wide() })}</div>
      <hr class="rule thin">${meals.map((e) => mealRow(e, true)).join('')}${wide() && !meals.length ? '<div class="dim small">Nothing planned</div>' : ''}
    </div>`;
  }).join('');
}

/** A month as a calendar: each day with its first dish and how many more; tap one to open it. */
function monthPlan(p, entries) {
  const today = Dates.today();
  const lead = Dates.weekday(p.from);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: periodDays(p) }, (_, i) => Dates.addDays(p.from, i))];
  while (cells.length % 7) cells.push(null);
  const head = `<div class="cal-head a">${Dates.DAY_NAMES.map((d) => `<span>${d.slice(0, 3)}</span>`).join('')}</div>`;
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(`<div class="cal-week a">${cells.slice(i, i + 7).map((date) => {
      if (!date) return '<span></span>';
      const day = entries.filter((e) => e.meal.date === date);
      const first = (day.find((e) => !e.slot.prep) || day[0])?.recipes[0]?.title;
      return `<button class="cal-day ${date === today ? 'today' : ''} ${day.length ? 'has' : ''}" data-act="prep-day" data-date="${date}"><b>${Dates.dayOfMonth(date)}</b>${first ? `<span class="rx clamp2">${esc(first)}${day.length > 1 ? ` +${day.length - 1}` : ''}</span>` : ''}</button>`;
    }).join('')}</div>`);
  }
  return `${head}${weeks.join('')}<p class="dim small a">Tap a day to plan it.</p>`;
}

/** A year as twelve months, each with how many meals and days are planned; tap one to open it. */
function yearPlan(p, entries) {
  return `<div class="year-grid">${Dates.MONTHS.map((m, i) => {
    const es = entries.filter((e) => Dates.month(e.meal.date) === i);
    const days = new Set(es.map((e) => e.meal.date)).size;
    return `<button class="month-box a ${es.length ? 'has' : ''}" data-act="prep-month" data-date="${Dates.addMonths(p.from, i)}"><b>${m}</b><span class="dim small">${es.length ? `${plural(es.length, 'meal')} · ${plural(days, 'day')}` : 'Nothing planned'}</span></button>`;
  }).join('')}</div>`;
}

const entriesNow = () => { const p = period(); return planEntries(box, activeProfile(), p.from, p.to); };
actions['prep-profile'] = (el) => { settings.prepProfile = el.dataset.id; saveSettings(); draw(); };
actions['prep-span'] = (el) => { ui.prepSpan = el.dataset.v; ui.panel = null; draw(); };
actions['prep-today'] = () => { ui.prepSpan = 'Day'; ui.prepAnchor = Dates.today(); draw(); };
actions['prep-step'] = (el) => { ui.prepAnchor = stepPeriod(period(), +el.dataset.dir).from; draw(); };
actions['prep-day'] = (el) => { ui.prepSpan = 'Day'; ui.prepAnchor = el.dataset.date; draw(); };
actions['prep-month'] = (el) => { ui.prepSpan = 'Month'; ui.prepAnchor = el.dataset.date; draw(); };
actions['prep-panel'] = (el) => { ui.panel = ui.panel === el.dataset.v ? null : el.dataset.v; ui.removingSaved = null; draw(); };
actions['prep-clear'] = () => { box.deleteMeals(new Set(entriesNow().map((e) => e.meal.id))); ui.panel = null; };
actions['meal-card'] = (el) => go(cardHash(el.dataset.to));
actions['prep-needed'] = (el) => {
  box.saveMeal({ id: uuid(), date: el.dataset.date, slot: +el.dataset.slot, cards: [el.dataset.to], people: null, note: `For ${el.dataset.for}`, profile: activeProfile().id });
};
actions['prep-plan'] = () => { const p = period(); ui.prepPlan = { from: p.from, to: p.to, title: periodTitle(p) }; go('#/prepplan'); };
actions['prep-list'] = () => addPlanToList(entriesNow());
actions['prep-keep'] = () => {
  const es = entriesNow();
  const seen = new Set();
  for (const r of es.flatMap((e) => e.recipes)) if (!seen.has(r.id)) { seen.add(r.id); setKeep(r, true); }
  notice(`${periodTitle(period())}: its recipes are on the Open tab.`);
};
actions['prep-print'] = () => printPlan(entriesNow(), periodTitle(period()));
actions['save-prep'] = (el) => el.closest('form').requestSubmit();
forms['save-prep'] = (form, data) => {
  const p = period();
  const es = entriesNow();
  const name = String(data.get('name') || '').trim() || periodTitle(p);
  box.savePrep({ id: uuid(), name, span: p.span, profile: activeProfile().id, meals: es.map((e) => ({ offset: Dates.between(p.from, e.meal.date), slot: e.meal.slot, cards: e.meal.cards, people: e.meal.people ?? null, note: e.meal.note || '' })) });
  ui.panel = null;
  notice(`Saved “${name}”: ${plural(es.length, 'meal')}, to use on any ${p.span.toLowerCase()}.`);
};
actions['use-saved'] = (el) => {
  const sp = (box.data.prepSaved || []).find((s) => s.id === el.dataset.id);
  const ms = placeSaved(sp, period(), activeProfile().id);
  box.addMeals(ms);
  ui.panel = null;
  notice(`Added ${plural(ms.length, 'meal')} from “${sp.name}”.`);
};
holds['saved-remove'] = (el) => { ui.removingSaved = el.dataset.id; draw(); };
actions['saved-delete'] = () => { box.deleteSaved(ui.removingSaved); ui.removingSaved = null; };
actions['saved-keep'] = () => { ui.removingSaved = null; draw(); };

function addPlanToList(entries) {
  const lines = planShopping(box, entries, settings.units, cupboard(entries[0]?.profile.id));
  const n = box.addToShopping(lines.map((l) => l.text), 'Meal prep');
  notice(n === 0 ? 'Already on the list.' : `Added ${n} to the list, under Meal prep.`);
}
function printPlan(entries, title) {
  ui.print = { items: planPrintItems(entries, settings.units), title, extra: planHtml(box, entries, title, settings.units, cupboard(entries[0]?.profile.id)) };
  go('#/print');
}

// ---------------------------------------------------------------- one meal

actions['meal-new'] = (el) => openMeal(null, el.dataset.date, el.dataset.slot != null ? +el.dataset.slot : null);
actions['meal-open'] = (el, e) => { if (e?.target.closest('[data-act=meal-card]')) return; const m = box.meals.find((x) => x.id === el.dataset.id); openMeal(m, m.date); };

function openMeal(existing, date, slot = null) {
  const profile = profilesOf(box.data).find((p) => p.id === existing?.profile) || activeProfile();
  const s = existing?.slot ?? slot ?? (date === Dates.today() ? currentSlot(profile) : null) ?? slotOrder(profile).find((i) => !profile.slots[i].prep) ?? 0;
  ui.meal = { id: existing?.id || null, profile: profile.id, date: existing?.date || date, slot: s, people: existing ? existing.people ?? null : profile.people ?? null, cards: [...(existing?.cards || [])], note: existing?.note || '', find: '', confirmDelete: false };
  go(`#/meal/${existing ? encodeURIComponent(existing.id) : 'new'}`);
}

/** Add or change one meal: which day, which slot, for how many, its cards. */
views.meal = () => {
  const m = ui.meal;
  if (!m) return views.prep();
  const all = profilesOf(box.data);
  const profile = all.find((p) => p.id === m.profile) || all[0];
  const pickable = box.sorted().filter((r) => !m.cards.includes(r.id) && !String(r.id).startsWith('dev-') && r.folderId !== DEV_BOOK).filter((r) => !m.find.trim() || matches(r, m.find)).slice(0, 40);
  const picker = `<div class="label a keep">${m.find.trim() ? `Add cards · matching “${esc(m.find.trim())}”` : 'Add cards'}</div>
    ${pickable.map((r) => `<button class="pickrow a" data-act="meal-add" data-to="${esc(r.id)}"><span class="grow rx one">+ ${esc(r.title)}</span><span class="dim small">${esc([effectiveTotal(r) && formatMinutes(effectiveTotal(r)), box.folderName(r.folderId ?? null)].filter(Boolean).join(' · '))}</span></button>`).join('') || '<p class="dim a">No cards match.</p>'}`;
  const details = `<h1 class="title a">${m.id ? 'Change meal' : 'New meal'}</h1>${all.length > 1 ? `<div class="dim small">${esc(profile.name)}</div>` : ''}
    <div class="label a">Day</div>
    <div class="bar a">${btn('meal-day', '◀', { cls: 'small', attrs: 'data-dir="-1"', icon: false })}<b class="center" style="min-width:14em">${esc(Dates.long(m.date))}</b>${btn('meal-day', '▶', { cls: 'small', attrs: 'data-dir="1"', icon: false })}${btn('meal-today', 'Today', { cls: 'small', on: m.date === Dates.today(), icon: false })}</div>
    <div class="label a">When</div>
    <div class="flow a">${slotOrder(profile).map((i) => btn('meal-slot', `${profile.slots[i].name}${profile.slots[i].time ? ` ${profile.slots[i].time}` : ''}`, { cls: 'small', on: m.slot === i, attrs: `data-v="${i}"`, icon: false })).join('')}</div>
    <div class="label a">For</div>
    <div class="bar a">${btn('meal-people', 'As written', { cls: 'small', on: m.people == null, attrs: 'data-v="null"', icon: false })}${btn('meal-people', '−', { cls: 'small', attrs: 'data-v="-1"', disabled: (m.people ?? 0) <= 1, icon: false })}
      <b class="center" style="min-width:7em">${m.people != null ? `${m.people} people` : 'as written'}</b>${btn('meal-people', '+', { cls: 'small', attrs: 'data-v="1"', icon: false })}${allows('ProPrint') ? btn('meal-people', '+10', { cls: 'small', attrs: 'data-v="10"', icon: false }) : ''}</div>
    <div class="dim small">Each card scales to feed this many.</div>
    <div class="label a">${profile.slots[m.slot]?.prep ? 'To prep' : 'In this meal'}</div>
    ${m.cards.length ? m.cards.map((id) => { const r = box.find(id); return r ? `<div class="bar a"><b class="grow rx">${esc(r.title)}</b>${btn('meal-remove', 'Remove', { cls: 'small', attrs: `data-to="${esc(id)}"`, icon: false })}</div>` : ''; }).join('') : '<p class="dim a">Nothing yet. Pick cards below.</p>'}
    <div class="a"><label for="meal-note">Note</label><input class="field" id="meal-note" value="${esc(m.note)}" placeholder="e.g. leftovers for lunch, 40 covers, station 2" autocomplete="off"></div>`;
  const two = wide();
  return {
    html: `<div class="${two ? 'twopane' : 'narrow-col'}">
      ${two ? `<div class="pane"><div class="pages" id="pg-meal"><div class="content">${details}</div></div><div class="count" data-for="pg-meal"></div></div>
        <div class="pane"><div class="pages" id="pg-pick"><div class="content">${picker}</div></div><div class="count" data-for="pg-pick"></div></div>`
        : `<div class="pages" id="pg-meal"><div class="content">${m.find.trim() ? `${m.cards.length ? `<p class="dim small a">In this meal: ${esc(m.cards.map((id) => box.find(id)?.title).filter(Boolean).join(', '))}</p>` : ''}${picker}` : details + picker}</div></div><div class="count" data-for="pg-meal"></div>`}
    </div>
    <div class="search"><input class="field" id="meal-find" placeholder="Find a card to add" value="${esc(m.find)}" autocomplete="off"></div>
    <div class="row-btns">${m.id ? btn('meal-delete', m.confirmDelete ? 'Sure?' : 'Delete', { cls: 'big', on: m.confirmDelete, icon: false }) : ''}<button class="btn big primary grow" data-act="meal-save" ${m.cards.length ? '' : 'disabled'}>Save</button></div>
    ${backBar('Meal')}`,
    mount(el) {
      paged(el, `meal:${m.find}`, { viewport: el.querySelector('#pg-meal') });
      if (two) paged(el, `pick:${m.find}`, { viewport: el.querySelector('#pg-pick'), keys: false });
      el.querySelector('#meal-note')?.addEventListener('input', (e) => { m.note = e.target.value; });
      const f = el.querySelector('#meal-find');
      f.addEventListener('input', () => { m.find = f.value; clearTimeout(ui.mealSoon); ui.mealSoon = setTimeout(() => { draw(); const g = document.getElementById('meal-find'); g?.focus(); g?.setSelectionRange(g.value.length, g.value.length); }, 200); });
    },
  };
};
actions['meal-day'] = (el) => { ui.meal.date = Dates.addDays(ui.meal.date, +el.dataset.dir); draw(); };
actions['meal-today'] = () => { ui.meal.date = Dates.today(); draw(); };
actions['meal-slot'] = (el) => { ui.meal.slot = +el.dataset.v; draw(); };
actions['meal-people'] = (el) => {
  const m = ui.meal;
  const v = el.dataset.v;
  m.people = v === 'null' ? null : v === '-1' ? Math.max(1, (m.people ?? 2) - 1) : v === '10' ? (m.people ?? 0) + 10 : (m.people ?? 3) + 1;
  draw();
};
actions['meal-add'] = (el) => { ui.meal.cards.push(el.dataset.to); ui.meal.find = ''; draw(); };
actions['meal-remove'] = (el) => { ui.meal.cards = ui.meal.cards.filter((x) => x !== el.dataset.to); draw(); };
actions['meal-delete'] = () => {
  const m = ui.meal;
  if (!m.confirmDelete) { m.confirmDelete = true; draw(); return; }
  box.deleteMeals(new Set([m.id]));
  ui.meal = null;
  back();
};
actions['meal-save'] = () => {
  const m = ui.meal;
  const existing = box.meals.find((x) => x.id === m.id);
  box.saveMeal({ ...(existing || {}), id: m.id || uuid(), date: m.date, slot: m.slot, people: m.people, cards: m.cards, note: m.note.trim(), profile: m.profile });
  const slot = profilesOf(box.data).find((p) => p.id === m.profile)?.slots[m.slot]?.name || 'Meal';
  ui.meal = null;
  back();
  // Saving moves the plan about; say where this meal went.
  notice(`Saved: ${Dates.short(m.date)} · ${slot}.`);
};

// ---------------------------------------------------------------- the prep plan

/** A period's prep worked out: what to make ahead, how long each meal takes, what to buy. */
views.prepplan = () => {
  const pp = ui.prepPlan;
  if (!pp) return views.prep();
  const profile = activeProfile();
  const entries = planEntries(box, profile, pp.from, pp.to);
  const subs = planSubRecipes(box, entries);
  const shopping = planShopping(box, entries, settings.units, cupboard(profile.id));
  const seen = new Set();
  const all = entries.flatMap((e) => e.recipes).filter((r) => !seen.has(r.id) && seen.add(r.id));
  const early = all.filter((r) => (effectiveTotal(r) || 0) >= 90);
  const prepAll = all.reduce((n, r) => n + (r.prepMin || 0), 0) + subs.reduce((n, [r]) => n + (r.prepMin || 0), 0);
  const line = (title, sub, act, to) => `<button class="planline a" data-act="${act}" data-to="${esc(to)}"><b class="nm rx">${esc(title)}</b>${sub ? `<span class="dim small rx">${esc(sub)}</span>` : ''}</button>`;
  const ahead = subs.length || early.length ? `<div class="label a keep">Cook ahead</div>
      ${subs.map(([r, at]) => line(r.title, [effectiveTotal(r) && formatMinutes(effectiveTotal(r)), `for ${at.join(', ')}`].filter(Boolean).join(' · '), 'meal-card', r.id)).join('')}
      ${early.map((r) => line(`Start early: ${r.title}`, `${formatMinutes(effectiveTotal(r))} start to finish`, 'meal-card', r.id)).join('')}` : '';
  const meals = `<div class="label a keep">Meal by meal</div>${entries.map((e) => {
    const [total, prep] = mealMinutes(e.recipes);
    return line(`${e.label}${e.meal.people != null ? ` · for ${e.meal.people}` : ''}`, `${e.recipes.map((r) => r.title).join(', ')}${total > 0 ? ` · about ${formatMinutes(total)}, prep ${formatMinutes(prep)}` : ''}`, 'plan-meal', e.meal.id);
  }).join('')}`;
  const list = `<div class="label a keep">Shopping list · ${plural(shopping.length, 'thing')}</div><ul class="checks plain-list">${shopping.map((l) => `<li class="a" style="cursor:default"><span class="txt">${esc(l.text)}${l.from.length > 1 ? `<span class="dim small rx" style="display:block">for ${esc(l.from.join(', '))}</span>` : ''}</span></li>`).join('')}</ul>`;
  const head = `<h1 class="title a">Prep plan · ${esc(pp.title)}</h1>
    <p class="dim small a" style="margin:0">${plural(entries.length, 'meal')} · ${plural(all.length, 'recipe')}${subs.length ? ` · ${plural(subs.length, 'sub-recipe')}` : ''} · prep about ${formatMinutes(prepAll)} in all</p>
    <p class="dim small a" style="margin:0 0 8px">Times are good-faith estimates: prep adds up, cooking overlaps.</p>`;
  const two = wide();
  return {
    html: `${two ? `${head}<div class="twopane"><div class="pane"><div class="pages" id="pg-pp1"><div class="content">${ahead}${meals}</div></div><div class="count" data-for="pg-pp1"></div></div><div class="pane"><div class="pages" id="pg-pp2"><div class="content">${list}</div></div><div class="count" data-for="pg-pp2"></div></div></div>`
      : `<div class="pages" id="pg-pp1"><div class="content">${head}${ahead}${meals}${list}</div></div><div class="count" data-for="pg-pp1"></div>`}
      <div class="row-btns">${btn('plan-list', 'Add to shopping list', { g: 'list', cls: 'small primary', icon: false })}${btn('plan-print', 'Print plan & recipes', { g: 'print', cls: 'small', icon: false })}</div>
      ${backBar('Prep plan')}`,
    mount(el) {
      paged(el, 'prepplan1', { viewport: el.querySelector('#pg-pp1') });
      if (two) paged(el, 'prepplan2', { viewport: el.querySelector('#pg-pp2'), keys: false });
    },
  };
};
const ppEntries = () => planEntries(box, activeProfile(), ui.prepPlan.from, ui.prepPlan.to);
actions['plan-meal'] = (el) => { const m = box.meals.find((x) => x.id === el.dataset.to); openMeal(m, m.date); };
actions['plan-list'] = () => addPlanToList(ppEntries());
actions['plan-print'] = () => printPlan(ppEntries(), ui.prepPlan.title);

// ---------------------------------------------------------------- plan layouts

export function openLayout(p) {
  ui.layout = { id: p.id, name: p.name, people: p.people ?? null, slots: p.slots.map((s) => ({ ...s })), removing: null, confirmDelete: false };
  go(`#/layout/${encodeURIComponent(p.id)}`);
}

/** One plan layout: its name, how many it usually feeds, and its slots (a name, a time for the clock, and whether it's prep work). */
views.layout = (id) => {
  const L = ui.layout?.id === id ? ui.layout : null;
  const start = profilesOf(box.data).find((p) => p.id === id);
  if (!L || !start) return views.prep();
  const used = new Set(box.meals.filter((m) => (m.profile || HOME) === id).map((m) => m.slot));
  const ok = L.name.trim() && L.slots.some((s) => s.name.trim());
  return {
    html: `<div class="narrow-col"><div class="pages"><div class="content form">
      <h1 class="title a">Plan layout</h1>
      <div class="a"><label for="lay-name">Name</label><input class="field" id="lay-name" data-lay="name" value="${esc(L.name)}" placeholder="Household, Main kitchen, Catering…"></div>
      <div class="label a">Usually feeds</div>
      <div class="bar a">${btn('lay-people', 'As written', { cls: 'small', on: L.people == null, attrs: 'data-v="null"', icon: false })}${btn('lay-people', '−', { cls: 'small', attrs: 'data-v="-1"', disabled: (L.people ?? 0) <= 1, icon: false })}<b class="center" style="min-width:4em">${L.people ?? '–'}</b>${btn('lay-people', '+', { cls: 'small', attrs: 'data-v="1"', icon: false })}${btn('lay-people', '+10', { cls: 'small', attrs: 'data-v="10"', icon: false })}</div>
      <div class="label a">Slots · hold Meal / Prep (or right-click) to remove one</div>
      <p class="dim small a" style="margin:0">Times (like 18:30) let Prep open at about the meal it is now.</p>
      ${L.slots.map((s, i) => `<div class="slotrow a"><input class="field" data-slot="${i}" data-k="name" value="${esc(s.name)}" placeholder="Slot name"><input class="field time" data-slot="${i}" data-k="time" value="${esc(s.time)}" placeholder="time" maxlength="5">${btn('lay-prep', s.prep ? 'Prep' : 'Meal', { cls: 'small', on: s.prep, attrs: `data-i="${i}" data-hold="lay-remove"`, icon: false })}</div>
        ${L.removing === i ? `<div class="box-panel thick bar a"><span class="grow">${used.has(i) ? `“${esc(s.name)}” has meals planned in it. Move them first.` : `Remove “${esc(s.name)}”?`}</span>${btn('lay-remove-yes', 'Remove', { cls: 'primary', disabled: used.has(i) || L.slots.length <= 1, icon: false })}${btn('lay-remove-no', 'Keep', { icon: false })}</div>` : ''}`).join('')}
      <div class="flow a">${btn('lay-add', '+ Meal slot', { cls: 'small', attrs: 'data-prep="0"', icon: false })}${btn('lay-add', '+ Prep slot', { cls: 'small', attrs: 'data-prep="1"', icon: false })}</div>
      <p class="dim small a">A Prep slot is for making ahead: sub-recipes, sauces, chopping. Each day shows them first.</p>
      ${id !== HOME ? `<div class="a">${btn('lay-delete', L.confirmDelete ? `Sure? Delete it and its ${box.meals.filter((m) => m.profile === id).length} meals` : 'Delete this layout', { on: L.confirmDelete, icon: false })}</div>` : ''}
    </div></div><div class="count"></div>
    <button class="btn big primary wide-btn" data-act="lay-save" ${ok ? '' : 'disabled'}>Save</button>
    ${backBar('Plan layout')}</div>`,
    mount(el) {
      paged(el, `layout:${id}`, {});
      el.querySelector('.pages').style.touchAction = 'pan-y';
      el.querySelector('#lay-name').addEventListener('input', (e) => { L.name = e.target.value; });
      el.querySelectorAll('[data-slot]').forEach((f) => f.addEventListener('input', () => {
        const s = L.slots[+f.dataset.slot];
        s[f.dataset.k] = f.dataset.k === 'time' ? f.value.replace(/[^\d:]/g, '').slice(0, 5) : f.value;
      }));
    },
  };
};
actions['lay-people'] = (el) => { const L = ui.layout; const v = el.dataset.v; L.people = v === 'null' ? null : v === '-1' ? Math.max(1, (L.people ?? 2) - 1) : v === '10' ? (L.people ?? 0) + 10 : (L.people ?? 3) + 1; draw(); };
actions['lay-prep'] = (el) => { const s = ui.layout.slots[+el.dataset.i]; s.prep = !s.prep; draw(); };
holds['lay-remove'] = (el) => { ui.layout.removing = +el.dataset.i; draw(); };
actions['lay-remove-no'] = () => { ui.layout.removing = null; draw(); };
actions['lay-remove-yes'] = () => {
  const L = ui.layout;
  const i = L.removing;
  // Meals point at slots by place: only the last goes; others are left blank to reuse.
  if (i === L.slots.length - 1) L.slots.pop(); else L.slots[i] = { name: '', time: '', prep: false };
  L.removing = null;
  draw();
};
actions['lay-add'] = (el) => { ui.layout.slots.push(el.dataset.prep === '1' ? { name: 'Prep', time: '', prep: true } : { name: 'New slot', time: '', prep: false }); draw(); };
actions['lay-delete'] = () => {
  const L = ui.layout;
  if (!L.confirmDelete) { L.confirmDelete = true; draw(); return; }
  box.deleteProfile(L.id);
  if (settings.prepProfile === L.id) { settings.prepProfile = HOME; saveSettings(); }
  ui.layout = null;
  back();
};
actions['lay-save'] = () => {
  const L = ui.layout;
  const p = profilesOf(box.data).find((x) => x.id === L.id);
  box.saveProfile({ ...p, name: L.name.trim(), people: L.people, slots: L.slots.map((s) => ({ ...s, name: s.name.trim(), time: s.time.trim() })) });
  ui.layout = null;
  back();
};

// ---------------------------------------------------------------- the cupboard

/**
 * A kitchen's cupboard. Tap a staple to go round: not kept → have it (left off shopping lists) →
 * running low (back on lists) → not kept. Hold one to remove it. Find adds anything else.
 */
views.cupboard = (id) => {
  const all = profilesOf(box.data);
  const profile = all.find((p) => p.id === id) || all[0];
  const c = cupboard(profile.id);
  const st = (ui.pantry = ui.pantry?.for === profile.id ? ui.pantry : { for: profile.id, find: '', removing: null, preset: null });
  const needle = fold(st.find.trim());
  const chip = (key, label) => {
    const s = Cupboard.state(c, key);
    return btn('pantry-tap', s === 'have' ? `✓ ${label}` : s === 'low' ? `${label} · low` : label, { cls: `small ${s === 'low' ? 'low' : ''}`, on: s === 'have', attrs: `data-key="${esc(key)}" data-label="${esc(label)}" data-hold="pantry-remove"`, icon: false });
  };
  const shown = Pantry.staples.filter((s) => !c.hidden.includes(s.key));
  let finding = '';
  if (needle) {
    const hits = Pantry.staples.filter((s) => fold(s.label).includes(needle) || s.name.test(st.find.trim()));
    const exact = hits.some((s) => fold(s.label) === needle) || c.extra.some((w) => fold(w) === needle);
    finding = `<div class="a"><div class="label">Matching “${esc(st.find.trim())}”</div><div class="flow">
      ${hits.map((s) => (c.hidden.includes(s.key) ? btn('pantry-unhide', `+ ${s.label}`, { cls: 'small', attrs: `data-key="${s.key}"`, icon: false }) : chip(s.key, s.label))).join('')}
      ${c.extra.filter((w) => fold(w).includes(needle)).map((w) => chip(Pantry.extraKey(w), w)).join('')}
      ${exact ? '' : btn('pantry-add', `+ Add “${st.find.trim()}”`, { cls: 'small on', icon: false })}</div></div>`;
  }
  const lowCount = c.low.length;
  const removing = st.removing;
  return {
    html: `<div class="${wide() ? '' : 'narrow-col'}"><div class="pages"><div class="content">
      <h1 class="title a">Cupboard · ${esc(profile.name)}</h1>
      <p class="dim small a" style="margin:0">Tap: ✓ always have it (left off shopping lists) → running low (back on lists) → not kept. Hold one (or right-click) to remove it.</p>
      ${all.length > 1 ? `<div class="flow a">${all.map((p) => btn('pantry-profile', p.name, { cls: 'small', on: p.id === profile.id, attrs: `data-id="${esc(p.id)}"`, icon: false })).join('')}</div>` : ''}
      <div class="a"><div class="label">Start from</div><div class="flow">${Pantry.presets.map(([name], i) => btn('pantry-preset', name, { cls: 'small', on: st.preset === i, attrs: `data-i="${i}"`, icon: false })).join('')}${all.filter((p) => p.id !== profile.id).map((p) => btn('pantry-copy', `Same as ${p.name}`, { cls: 'small', attrs: `data-id="${esc(p.id)}"`, icon: false })).join('')}</div>
        ${st.preset != null ? `<div class="box-panel thick bar" style="margin-top:6px"><span class="grow">Tick just ${Pantry.presets[st.preset][1].length} staples (“${esc(Pantry.presets[st.preset][0])}”)? Your own stay.</span>${btn('pantry-preset-yes', 'Use it', { cls: 'primary', icon: false })}${btn('pantry-preset-no', 'Keep mine', { icon: false })}</div>` : ''}</div>
      ${removing ? `<div class="box-panel thick a"><b>Remove “${esc(removing[1])}” from this cupboard?</b><span class="dim small">It goes on shopping lists again when a recipe needs it.</span><div class="row-btns">${btn('pantry-remove-yes', 'Remove', { cls: 'primary', icon: false })}${btn('pantry-remove-no', 'Keep it', { icon: false })}</div></div>` : ''}
      ${finding}
      <div class="${wide() ? 'pantry-cols' : ''}">${Pantry.groups.map((g) => {
        const items = shown.filter((s) => s.group === g);
        return items.length ? `<div class="a pantry-group"><div class="dim small bold">${g} · ${items.filter((s) => c.have.includes(s.key)).length} of ${items.length}</div><div class="flow">${items.map((s) => chip(s.key, s.label)).join('')}</div></div>` : '';
      }).join('')}
      ${c.extra.length ? `<div class="a pantry-group"><div class="dim small bold">Your own · ${c.extra.length}</div><div class="flow">${c.extra.map((w) => chip(Pantry.extraKey(w), w)).join('')}</div></div>` : ''}</div>
      ${c.hidden.length ? `<button class="linkish a" data-act="pantry-unhide-all">Bring back ${plural(c.hidden.length, 'removed staple')}</button>` : ''}
    </div></div><div class="count"></div></div>
    <div class="search"><input class="field" id="pantry-find" placeholder="Find or add a staple: rice, eggs, tahini…" value="${esc(st.find)}" autocomplete="off"></div>
    <div class="row-btns">${lowCount ? btn('pantry-restock', `Restock: ${lowCount} running low to the list`, { g: 'list', cls: 'small on', icon: false }) : ''}${btn('pantry-allback', 'Have it all again', { cls: 'small', disabled: !lowCount, icon: false })}</div>
    ${backBar('Cupboard')}`,
    mount(el) {
      paged(el, `pantry:${profile.id}:${needle}`);
      const f = el.querySelector('#pantry-find');
      f.addEventListener('input', () => { st.find = f.value; clearTimeout(ui.pantrySoon); ui.pantrySoon = setTimeout(() => { draw(); const g = document.getElementById('pantry-find'); g?.focus(); g?.setSelectionRange(g.value.length, g.value.length); }, 200); });
    },
  };
};
const pantryProfile = () => route().id;
const pc = () => cupboard(pantryProfile());
actions['pantry-tap'] = (el) => saveCupboard(pantryProfile(), Cupboard.cycle(pc(), el.dataset.key));
holds['pantry-remove'] = (el) => { ui.pantry.removing = [el.dataset.key, el.dataset.label]; draw(); };
actions['pantry-remove-yes'] = () => { const [k, l] = ui.pantry.removing; ui.pantry.removing = null; saveCupboard(pantryProfile(), Cupboard.remove(pc(), k, l)); };
actions['pantry-remove-no'] = () => { ui.pantry.removing = null; draw(); };
actions['pantry-profile'] = (el) => swap(`#/cupboard/${encodeURIComponent(el.dataset.id)}`);
actions['pantry-preset'] = (el) => { ui.pantry.preset = ui.pantry.preset === +el.dataset.i ? null : +el.dataset.i; draw(); };
actions['pantry-preset-no'] = () => { ui.pantry.preset = null; draw(); };
actions['pantry-preset-yes'] = () => {
  const c = pc();
  const keys = Pantry.presets[ui.pantry.preset][1];
  ui.pantry.preset = null;
  saveCupboard(pantryProfile(), { ...c, have: [...keys, ...c.extra.map(Pantry.extraKey).filter((k) => c.have.includes(k))], low: [] });
};
actions['pantry-copy'] = (el) => { const other = profilesOf(box.data).find((p) => p.id === el.dataset.id); saveCupboard(pantryProfile(), cupboard(other.id)); notice(`Copied ${other.name}’s cupboard.`); };
actions['pantry-unhide'] = (el) => { const c = pc(); ui.pantry.find = ''; saveCupboard(pantryProfile(), { ...c, hidden: c.hidden.filter((k) => k !== el.dataset.key), have: [...c.have, el.dataset.key] }); };
actions['pantry-unhide-all'] = () => saveCupboard(pantryProfile(), { ...pc(), hidden: [] });
actions['pantry-add'] = () => {
  const word = ui.pantry.find.trim();
  ui.pantry.find = '';
  saveCupboard(pantryProfile(), Cupboard.addOwn(pc(), word));
  notice(`“${word}” is in ${profilesOf(box.data).find((p) => p.id === pantryProfile())?.name}’s cupboard.`);
};
actions['pantry-restock'] = () => {
  const c = pc();
  const names = [...Pantry.staples.filter((s) => c.low.includes(s.key)).map((s) => s.label), ...c.extra.filter((w) => c.low.includes(Pantry.extraKey(w)))];
  const n = box.addToShopping(names, 'Cupboard');
  notice(n === 0 ? 'Already on the list.' : `Added ${n} to the list, under Cupboard. Tick them off when they’re bought and the cupboard has them again.`);
};
actions['pantry-allback'] = () => saveCupboard(pantryProfile(), { ...pc(), low: [] });

export { glyph, uuid, swap };
