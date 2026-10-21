// The kitchen side: dates for the planner, plan layouts, meal plans worked out (times, cook-ahead,
// one shopping list), lines added up across recipes, the cupboard, and parts of a card that could
// be cards of their own. Ported from the Android app's Planner, Prep, Combine, Pantry and Sections,
// so a plan reads the same on both.

import { scale, convert, parseNumber, formatAmount, ingredientsInStep, ingredientName, formatMinutes } from './units.js';
import { uuid } from './box.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rxEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- dates

// Dates are "2026-10-18" strings: they sort, they sync, and they mean the same day everywhere.
// Weeks start on Monday. Worked out in UTC so a clock change never moves a day.
const pad = (n) => String(n).padStart(2, '0');
const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const str = (dt) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
const monthLength = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export const Dates = {
  DAY_NAMES: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  today() { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`; },
  valid: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || ''),
  addDays(s, n) { const d = at(s); d.setUTCDate(d.getUTCDate() + n); return str(d); },
  /** As a calendar does: 31 January plus a month is the end of February. */
  addMonths(s, n) {
    const d = at(s);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + n;
    const ty = y + Math.floor(m / 12);
    const tm = ((m % 12) + 12) % 12;
    return str(new Date(Date.UTC(ty, tm, Math.min(d.getUTCDate(), monthLength(ty, tm)))));
  },
  addYears(s, n) { return Dates.addMonths(s, 12 * n); },
  /** 0 = Monday … 6 = Sunday. */
  weekday: (s) => (at(s).getUTCDay() + 6) % 7,
  weekStart: (s) => Dates.addDays(s, -Dates.weekday(s)),
  monthStart: (s) => `${s.slice(0, 8)}01`,
  yearStart: (s) => `${s.slice(0, 5)}01-01`,
  daysInMonth: (s) => monthLength(+s.slice(0, 4), +s.slice(5, 7) - 1),
  daysInYear: (s) => (monthLength(+s.slice(0, 4), 1) === 29 ? 366 : 365),
  dayOfMonth: (s) => +s.slice(8, 10),
  month: (s) => +s.slice(5, 7) - 1,
  year: (s) => +s.slice(0, 4),
  /** Days from one date to another (negative if before). */
  between: (from, to) => Math.round((at(to) - at(from)) / 86400000),
  /** "Sunday 18 October". */
  long: (s) => `${Dates.DAY_NAMES[Dates.weekday(s)]} ${Dates.dayOfMonth(s)} ${Dates.MONTHS[Dates.month(s)]}`,
  /** "Sun 18". */
  short: (s) => `${Dates.DAY_NAMES[Dates.weekday(s)].slice(0, 3)} ${Dates.dayOfMonth(s)}`,
  /** Minutes since midnight for "18:30", or null. */
  minutes(time) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
    if (!m) return null;
    const h = +m[1];
    const mm = +m[2];
    return h <= 23 && mm <= 59 ? h * 60 + mm : null;
  },
  nowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); },
};

// ---------------------------------------------------------------- plan layouts

export const HOME = 'home';
export const SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Baking', 'Other'];

/** The household: slots in the old fixed order (0 Breakfast … 5 Other), so older plans keep their meals. */
export function household() {
  return {
    id: HOME, name: 'Household', updated: 0,
    slots: [
      { name: 'Breakfast', time: '07:30', prep: false }, { name: 'Lunch', time: '12:30', prep: false },
      { name: 'Dinner', time: '18:30', prep: false }, { name: 'Snack', time: '15:30', prep: false },
      { name: 'Baking', time: '', prep: false }, { name: 'Other', time: '', prep: false },
      { name: 'Prep work', time: '', prep: true },
    ],
  };
}

/** A commercial kitchen: services and prep, fifty covers, a dry store. */
export function kitchen(name = 'Kitchen') {
  return {
    id: uuid(), name, people: 50, updated: Date.now(),
    slots: [
      { name: 'Mise en place', time: '08:00', prep: true }, { name: 'Lunch service', time: '11:30', prep: false },
      { name: 'Staff meal', time: '15:30', prep: false }, { name: 'Dinner service', time: '17:30', prep: false },
      { name: 'Events', time: '', prep: false }, { name: 'Close-down prep', time: '22:00', prep: true },
    ],
    // A kitchen keeps a dry store: none of it goes on the order list unless it's running low.
    cupboard: { have: [...Pantry.presets[Pantry.presets.length - 1][1]], low: [], extra: [], hidden: [] },
  };
}

/** Every plan layout in a box, the household first even if it was never saved. */
export function profilesOf(data) {
  const saved = data.prepProfiles || [];
  return [saved.find((p) => p.id === HOME) || household(), ...saved.filter((p) => p.id !== HOME)];
}

/** The order a day reads in: by the clock; untimed prep work first (it's done ahead), other untimed slots last. */
export function slotOrder(p) {
  const key = (i) => Dates.minutes(p.slots[i].time) ?? (p.slots[i].prep ? -1 : Number.MAX_SAFE_INTEGER);
  return p.slots.map((s, i) => i).filter((i) => p.slots[i].name.trim()).sort((a, b) => key(a) - key(b) || a - b);
}

/** The meal it's about now (or next): the latest timed slot started no more than an hour ago. */
export function currentSlot(p, minutes = Dates.nowMinutes()) {
  const timed = p.slots.map((s, i) => [i, Dates.minutes(s.time)]).filter(([i, m]) => m != null && !p.slots[i].prep && p.slots[i].name.trim())
    .sort((a, b) => a[1] - b[1]);
  if (!timed.length) return null;
  return [...timed].reverse().find(([, m]) => m - 60 <= minutes)?.[0] ?? timed[0][0];
}

/** How much to scale a card for a meal: people over the card's servings (1× when unknown). */
export const mealFactor = (meal, r) => (meal.people != null && r.servings > 0 ? meal.people / r.servings : 1);

// ---------------------------------------------------------------- periods

export const SPANS = ['Day', 'Week', 'Month', 'Year'];

/** A day, a week (Monday on), a month or a year, around a date. */
export function periodOf(span, date) {
  switch (span) {
    case 'Day': return { span, from: date, to: date };
    case 'Week': { const f = Dates.weekStart(date); return { span, from: f, to: Dates.addDays(f, 6) }; }
    case 'Month': { const f = Dates.monthStart(date); return { span, from: f, to: Dates.addDays(f, Dates.daysInMonth(f) - 1) }; }
    default: { const f = Dates.yearStart(date); return { span: 'Year', from: f, to: Dates.addDays(f, Dates.daysInYear(f) - 1) }; }
  }
}
export const periodDays = (p) => Dates.between(p.from, p.to) + 1;
export const inPeriod = (p, date) => date >= p.from && date <= p.to;
export function periodTitle(p) {
  switch (p.span) {
    case 'Day': return Dates.long(p.from);
    case 'Week': return `Week of ${Dates.dayOfMonth(p.from)} ${Dates.MONTHS[Dates.month(p.from)]}`;
    case 'Month': return `${Dates.MONTHS[Dates.month(p.from)]} ${Dates.year(p.from)}`;
    default: return String(Dates.year(p.from));
  }
}
/** The one before (-1) or after (+1). */
export function stepPeriod(p, dir) {
  const date = { Day: () => Dates.addDays(p.from, dir), Week: () => Dates.addDays(p.from, 7 * dir), Month: () => Dates.addMonths(p.from, dir), Year: () => Dates.addYears(p.from, dir) }[p.span]();
  return periodOf(p.span, date);
}

/**
 * Where a saved prep's meals land on a period, by the calendar: a saved day goes on every day, a
 * week on the same weekdays, a month on the same days of the month (day 31 skips short months), a
 * year on the same days of the year. So a usual week fills a month, and a month fills a year.
 */
export function placeSaved(sp, period, profile) {
  const out = [];
  for (let d = 0; d < periodDays(period); d++) {
    const date = Dates.addDays(period.from, d);
    const off = { Day: 0, Week: Dates.weekday(date), Month: Dates.dayOfMonth(date) - 1, Year: Dates.between(Dates.yearStart(date), date) }[sp.span] ?? 0;
    for (const m of sp.meals.filter((x) => x.offset === off)) {
      out.push({ id: uuid(), date, slot: m.slot, cards: [...m.cards], people: m.people ?? null, note: m.note || '', profile, updated: Date.now() });
    }
  }
  return out;
}

// ---------------------------------------------------------------- meal plans

/** A recipe and the cards it uses, each once (`seen` across a whole printout): [recipe, parent]. */
export function withSubRecipes(lib, r, seen = new Set()) {
  const out = [];
  if (seen.has(r.id)) return out;
  seen.add(r.id);
  out.push([r, null]);
  const walk = (parent, depth) => {
    if (depth > 5) return;
    for (const s of parent.subRecipes || []) {
      const sub = lib.resolve(s);
      if (sub && !seen.has(sub.id)) {
        seen.add(sub.id);
        out.push([sub, parent]);
        walk(sub, depth + 1);
      }
    }
  };
  walk(r, 0);
  return out;
}

/** The meals of one plan between two dates, in the order the days read. */
export function planEntries(lib, profile, from, to) {
  const rank = new Map(slotOrder(profile).map((s, i) => [s, i]));
  return (lib.data.meals || []).filter((m) => (m.profile || HOME) === profile.id && m.date >= from && m.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (rank.get(a.slot) ?? 99) - (rank.get(b.slot) ?? 99)))
    .map((meal) => {
      const slot = profile.slots[meal.slot] || { name: 'Meal', time: '', prep: false };
      return { meal, recipes: meal.cards.map((id) => lib.find(id)).filter(Boolean), profile, slot, label: `${Dates.short(meal.date)} · ${slot.name}` };
    });
}

/** Every sub-recipe these meals need, once, and the meals it's for: [recipe, [labels]]. */
export function planSubRecipes(lib, entries) {
  const used = new Map();
  for (const e of entries) {
    for (const r of e.recipes) {
      for (const [sub] of withSubRecipes(lib, r).slice(1)) {
        if (!used.has(sub.id)) used.set(sub.id, [sub, new Set()]);
        used.get(sub.id)[1].add(e.label);
      }
    }
  }
  return [...used.values()].map(([r, at2]) => [r, [...at2]]);
}

const totalOf = (r) => r.totalMin ?? (r.prepMin != null || r.cookMin != null ? (r.prepMin || 0) + (r.cookMin || 0) : null);
export { totalOf as effectiveTotal };

/** A meal's time, a good-faith estimate: prep adds up (one cook), cooking overlaps (the longest sets the pace). [total, prep]. */
export function mealMinutes(recipes) {
  const prep = recipes.reduce((n, r) => n + (r.prepMin || 0), 0);
  const cook = Math.max(0, ...recipes.map((r) => Math.max(0, r.cookMin ?? ((totalOf(r) || 0) - (r.prepMin || 0)))));
  return [prep + cook, prep];
}

/** Everything to buy, added up where it can be, scaled to each meal, the cupboard left out. */
export function planShopping(lib, entries, units, cupboard = { have: [] }) {
  const lines = [];
  for (const e of entries) {
    for (const r of e.recipes) {
      withSubRecipes(lib, r).forEach(([rec], i) => {
        const f = i === 0 ? mealFactor(e.meal, rec) : 1;
        for (const line of rec.ingredients) lines.push([convert(scale(line, f), units), rec.title]);
      });
    }
  }
  return combine(lines.filter(([t]) => !t.startsWith('## ') && !Pantry.has(t, cupboard)));
}

/** The plan as the first pages of a printout: the meals, what to cook ahead, the shopping list. */
export function planHtml(lib, entries, title, units, cupboard) {
  let h = `<section class=plan><h1>${esc(title)}</h1><table><tr><th>Day</th><th>Meal</th><th>Recipes</th><th>Time</th></tr>`;
  for (const e of entries) {
    const [total, prep] = mealMinutes(e.recipes);
    h += `<tr><td>${esc(Dates.short(e.meal.date))}</td><td>${esc(e.slot.name)}${e.meal.people != null ? ` · for ${e.meal.people}` : ''}</td>`;
    h += `<td>${esc(e.recipes.map((r) => r.title).join(', '))}${e.meal.note ? `<br><i>${esc(e.meal.note)}</i>` : ''}</td>`;
    h += `<td>${total > 0 ? `about ${formatMinutes(total)} (prep ${formatMinutes(prep)})` : ''}</td></tr>`;
  }
  h += '</table>';
  const subs = planSubRecipes(lib, entries);
  if (subs.length) {
    h += '<h2>Cook ahead</h2><ul>';
    for (const [r, at2] of subs) h += `<li><b>${esc(r.title)}</b>${totalOf(r) ? ` · ${formatMinutes(totalOf(r))}` : ''} — for ${esc(at2.join(', '))}</li>`;
    h += '</ul>';
  }
  h += '<h2>Shopping list</h2><ul class=ing>';
  for (const l of planShopping(lib, entries, units, cupboard)) h += `<li><span class=box></span>${esc(l.text)}</li>`;
  return `${h}</ul><div class=src>Times are good-faith estimates: prep adds up, cooking overlaps.</div></section>`;
}

/** The plan's recipes for a printout, each at its meal's size, under its day and meal. */
export const planPrintItems = (entries, units) => entries.flatMap((e) => e.recipes.map((r) => ({ recipe: r, factor: mealFactor(e.meal, r), units, heading: e.label })));

// ---------------------------------------------------------------- adding lines up

const measures = [
  [['teaspoons', 'teaspoon', 'tsps', 'tsp'], 'Volume', 5, 'tsp', 'tsp'],
  [['tablespoons', 'tablespoon', 'tbsps', 'tbsp', 'tbs'], 'Volume', 15, 'tbsp', 'tbsp'],
  [['cups', 'cup'], 'Volume', 240, 'cup', 'cups'],
  [['fl oz', 'fluid ounces', 'fluid ounce'], 'Volume', 29.57, 'fl oz', 'fl oz'],
  [['pints', 'pint'], 'Volume', 473, 'pint', 'pints'],
  [['quarts', 'quart'], 'Volume', 946, 'quart', 'quarts'],
  [['millilitres', 'milliliters', 'ml'], 'Volume', 1, 'ml', 'ml'],
  [['litres', 'liters', 'litre', 'liter', 'l'], 'Volume', 1000, 'l', 'l'],
  [['ounces', 'ounce', 'oz'], 'Mass', 28.35, 'oz', 'oz'],
  [['pounds', 'pound', 'lbs', 'lb'], 'Mass', 453.6, 'lb', 'lb'],
  [['grams', 'gram', 'g'], 'Mass', 1, 'g', 'g'],
  [['kilograms', 'kilogram', 'kg'], 'Mass', 1000, 'kg', 'kg'],
  [['cloves', 'clove'], 'Count', 1, 'clove', 'cloves'],
  [['pinches', 'pinch'], 'Volume', 0.31, 'pinch', 'pinches'],
  [['dashes', 'dash'], 'Volume', 0.62, 'dash', 'dashes'],
  [['cans', 'can'], 'Count', 1, 'can', 'cans'],
  [['slices', 'slice'], 'Count', 1, 'slice', 'slices'],
].flatMap(([names, kind, base, singular, plural]) => names.map((n) => [n, { kind, base, singular, plural }])).sort((a, b) => b[0].length - a[0].length);

const combineLead = /^\s*(\d+\s+\d+\/\d+|\d+[½¼¾⅓⅔⅛⅜⅝⅞]|\d+\/\d+|\d*\.?\d+|[½¼¾⅓⅔⅛⅜⅝⅞])\s*(.*)$/;

function parseLine(line) {
  const m = combineLead.exec(line.trim());
  if (!m) return null;
  const amount = parseNumber(m[1].trim());
  if (amount == null) return null;
  let rest = m[2].trim();
  const lower = rest.toLowerCase();
  const unit = measures.find(([n]) => lower.startsWith(`${n} `) || lower.startsWith(`${n}. `));
  if (unit) rest = rest.slice(unit[0].length).replace(/^[. ]+/, '');
  rest = rest.replace(/^of /, '').trim();
  return rest ? { amount, measure: unit?.[1] ?? null, name: rest } : null;
}

/** What two lines must share to be added together: the thing itself, before any "chopped", "(…)". */
function lineKey(name) {
  return name.split(',')[0].split('(')[0].trim().toLowerCase().split(/\s+/).map((w) => {
    if (w.endsWith('oes')) return w.slice(0, -2);
    if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
    if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
    return w;
  }).join(' ');
}

function pluralise(name) {
  const head = name.split(',')[0];
  const tail = name.slice(head.length);
  const words = head.split(' ');
  const last = words[words.length - 1];
  const many = /[^aeiou]y$/.test(last) && last.length > 2 ? `${last.slice(0, -1)}ies`
    : /(o|ch|sh|x)$/.test(last) ? `${last}es` : `${last}s`;
  return [...words.slice(0, -1), many].join(' ') + tail;
}

/**
 * Adds up ingredient lines from several recipes: "1 cup flour" + "½ cup flour" = "1½ cups flour",
 * "2 eggs" + "1 egg" = "3 eggs". Lines that can't be read as an amount of something stay as they
 * are (once each). `lines` is [line, recipe it's for]; returns [{ text, from: [recipes] }].
 */
export function combine(lines) {
  const sums = new Map();
  const plain = new Map();
  for (const [line, recipe] of lines) {
    if (line.startsWith('## ') || !line.trim()) continue;
    const p = parseLine(line);
    if (!p) {
      const t = line.trim().toLowerCase();
      const k = t.charAt(0).toUpperCase() + t.slice(1);
      if (!plain.has(k)) plain.set(k, new Set());
      plain.get(k).add(recipe);
      continue;
    }
    const k = `${lineKey(p.name)}|${p.measure?.kind ?? 'Count'}`;
    if (!sums.has(k)) sums.set(k, { first: p, total: 0, from: new Set() });
    const a = sums.get(k);
    // Summed in the first line's unit: 1 cup + 2 tbsp = 1⅛ cups.
    a.total += p.measure == null || a.first.measure == null ? p.amount : (p.amount * p.measure.base) / a.first.measure.base;
    a.from.add(recipe);
  }
  return [
    ...[...sums.values()].map((a) => {
      const m = a.first.measure;
      const amount = formatAmount(a.total);
      // "2 lemon" (one line, scaled) reads as "2 lemons" too; long names are left alone.
      const head = a.first.name.split(',')[0].trim();
      const hw = head.split(' ');
      const name = m == null && a.total > 1 && !head.endsWith('s') && hw.length <= 2 && hw.every((w) => !w.endsWith('s')) ? pluralise(a.first.name) : a.first.name;
      return { text: m == null ? `${amount} ${name}` : `${amount} ${a.total > 1 ? m.plural : m.singular} ${name}`, from: [...a.from] };
    }),
    ...[...plain].map(([text, from]) => ({ text, from: [...from] })),
  ];
}

// ---------------------------------------------------------------- the cupboard

const irx = (s) => new RegExp(s, 'i');
const item = (key, label, group, words, lead = '') => ({ key, label, group, name: irx(`^(${lead})?(${words})\\b`) });
const SPICES = 'cumin|paprika|smoked paprika|chili powder|chilli powder|cinnamon|nutmeg|oregano|thyme|basil|rosemary|sage|turmeric|curry powder|garam masala|garlic powder|onion powder|ginger|cloves|red pepper flakes|chili flakes|chilli flakes|bay leaf|bay leaves|italian seasoning|cayenne|coriander|allspice|mixed spice';

/**
 * Things kitchens keep. The ones a cupboard has stay off shopping lists, so "2 tsp ground cumin"
 * doesn't send anyone to the shop; water and ice never go on a list.
 */
export const Pantry = {
  groups: ['Basics', 'Fridge & fresh', 'Baking', 'Spices & herbs', 'Sauces & condiments', 'Dry store & tins'],
  staples: [
    { key: 'salt', label: 'Salt', group: 'Basics', name: irx('^(sea |kosher |table |flaky )?salt\\b(?! pork| cod)') },
    { key: 'pepper', label: 'Black pepper', group: 'Basics', name: irx('^((freshly )?(ground )?(black |white )?pepper(corns)?|salt and (black )?pepper)$') },
    item('oil', 'Cooking oil', 'Basics', 'olive oil|vegetable oil|canola oil|sunflower oil|cooking oil|neutral oil|oil', 'extra virgin |light '),
    item('butter', 'Butter', 'Basics', 'butter', 'unsalted |salted '),
    item('sugar', 'Sugar', 'Basics', 'sugar', 'white |granulated |caster |brown |light brown |dark brown |powdered |icing '),
    item('flour', 'Flour', 'Basics', 'flour', 'all-purpose |plain |self-raising |bread '),
    item('eggs', 'Eggs', 'Fridge & fresh', 'eggs?', 'large |medium |small '),
    item('milk', 'Milk', 'Fridge & fresh', 'milk', 'whole |skim |semi-skimmed |low-fat '),
    item('onions', 'Onions', 'Fridge & fresh', 'onions?', 'yellow |white |brown '),
    item('garlic', 'Garlic', 'Fridge & fresh', 'garlic(?! powder)'),
    item('lemons', 'Lemons', 'Fridge & fresh', 'lemons?|lemon juice'),
    item('parmesan', 'Parmesan', 'Fridge & fresh', 'parmesan', 'grated |shaved '),
    item('raising', 'Baking powder & soda', 'Baking', 'baking powder|baking soda|bicarbonate of soda'),
    item('vanilla', 'Vanilla', 'Baking', 'vanilla extract|vanilla'),
    item('cocoa', 'Cocoa', 'Baking', 'cocoa powder|cocoa'),
    item('yeast', 'Yeast', 'Baking', 'yeast', 'instant |active dry |dried '),
    item('cornstarch', 'Cornstarch', 'Baking', 'cornstarch|cornflour'),
    { key: 'spices', label: 'All dried herbs & spices', group: 'Spices & herbs', name: irx(`^(ground |dried |smoked )?(${SPICES})( seeds)?\\b`) },
    item('cumin', 'Cumin', 'Spices & herbs', 'cumin', 'ground '),
    item('paprika', 'Paprika', 'Spices & herbs', 'paprika|smoked paprika', 'sweet |hot '),
    item('chili', 'Chili powder & flakes', 'Spices & herbs', 'chili powder|chilli powder|red pepper flakes|chili flakes|chilli flakes|cayenne'),
    item('cinnamon', 'Cinnamon', 'Spices & herbs', 'cinnamon', 'ground '),
    item('oregano', 'Oregano', 'Spices & herbs', 'oregano', 'dried '),
    item('thyme', 'Dried thyme', 'Spices & herbs', 'thyme', 'dried '),
    item('bay', 'Bay leaves', 'Spices & herbs', 'bay leaf|bay leaves'),
    item('curry', 'Curry powder', 'Spices & herbs', 'curry powder|garam masala'),
    item('garlicpowder', 'Garlic powder', 'Spices & herbs', 'garlic powder|onion powder'),
    item('vinegar', 'Vinegar', 'Sauces & condiments', 'vinegar', 'white |cider |apple cider |red wine |white wine |rice |malt |balsamic '),
    item('soy', 'Soy sauce', 'Sauces & condiments', 'soy sauce', 'light |dark |low-sodium '),
    item('mustard', 'Mustard', 'Sauces & condiments', 'dijon mustard|mustard|dijon', 'yellow |wholegrain '),
    item('ketchup', 'Ketchup', 'Sauces & condiments', 'ketchup'),
    item('mayo', 'Mayonnaise', 'Sauces & condiments', 'mayonnaise|mayo'),
    item('hotsauce', 'Hot sauce', 'Sauces & condiments', 'hot sauce|sriracha'),
    item('honey', 'Honey', 'Sauces & condiments', 'honey'),
    item('worcestershire', 'Worcestershire', 'Sauces & condiments', 'worcestershire sauce|worcestershire'),
    item('fishsauce', 'Fish sauce', 'Sauces & condiments', 'fish sauce'),
    item('rice', 'Rice', 'Dry store & tins', 'rice(?! vinegar| noodles| paper)', 'long-grain |white |brown |basmati |jasmine |long-grain white |arborio |short-grain '),
    item('pasta', 'Pasta', 'Dry store & tins', 'pasta|spaghetti|penne|fusilli|macaroni|ziti', 'dried '),
    item('oats', 'Oats', 'Dry store & tins', 'oats', 'rolled |steel-cut '),
    item('stock', 'Stock', 'Dry store & tins', 'stock|broth|bouillon', 'chicken |beef |vegetable |low-sodium '),
    item('tomatoes', 'Tinned tomatoes', 'Dry store & tins', '(crushed|diced|chopped|whole|tinned|canned) tomatoes|tomato paste|tomato sauce|passata'),
    // Not green beans: those are fresh.
    item('beans', 'Tinned beans', 'Dry store & tins', '(black|kidney|pinto|white|cannellini|butter|navy|borlotti|baked|refried) beans|chickpeas'),
    item('breadcrumbs', 'Breadcrumbs', 'Dry store & tins', 'breadcrumbs|panko'),
    item('lentils', 'Lentils', 'Dry store & tins', 'lentils', 'red |brown |green '),
  ],
  /** Ticked out of the box: what nearly everyone has. */
  defaults: ['salt', 'pepper'],
  /** Ready-made cupboards, from nothing to a commercial dry store. */
  presets: [
    ['Empty (new kitchen)', []],
    ['The basics', ['salt', 'pepper', 'oil', 'butter', 'sugar', 'flour']],
    ['Well stocked', ['salt', 'pepper', 'oil', 'butter', 'sugar', 'flour', 'raising', 'vanilla', 'spices', 'vinegar', 'soy', 'mustard', 'ketchup', 'honey', 'rice', 'pasta', 'stock', 'oats', 'garlic', 'onions']],
    ['Kitchen dry store', ['salt', 'pepper', 'oil', 'sugar', 'flour', 'raising', 'vanilla', 'cocoa', 'yeast', 'cornstarch', 'spices', 'vinegar', 'soy', 'mustard', 'ketchup', 'mayo', 'hotsauce', 'honey', 'worcestershire', 'fishsauce', 'rice', 'pasta', 'oats', 'stock', 'tomatoes', 'beans', 'breadcrumbs', 'lentils']],
  ],
  never: /^((warm|cold|hot|boiling|ice-cold|iced) )?(water|ice)( cubes)?$|^a bowl of/i,
  /** The key a staple someone added is ticked under, in the same set as the built-in ones. */
  extraKey: (w) => `x:${w.trim().toLowerCase()}`,

  /** True if a line is water or something the cupboard always has (and isn't low on): it stays off the list. */
  has(line, c) {
    const name = ingredientName(line).toLowerCase().trim();
    if (Pantry.never.test(name)) return true;
    const low = new Set(c.low || []);
    const hidden = new Set(c.hidden || []);
    const keep = new Set((c.have || []).filter((k) => !low.has(k)));
    if (Pantry.staples.some((s) => keep.has(s.key) && !hidden.has(s.key) && s.name.test(name))) return true;
    // An added staple ("rice") matches a line that is that thing ("1 cup long-grain rice"), not one that only starts with it.
    const sing = (w) => (w.endsWith('oes') ? w.slice(0, -2) : w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
    const n = sing(name);
    return (c.extra || []).some((w) => {
      const x = sing(w.trim().toLowerCase());
      return keep.has(Pantry.extraKey(w)) && x && (n === x || n.endsWith(` ${x}`));
    });
  },
};

/** A cupboard, filled in: what it has, what's low, its own staples, and the usual ones it doesn't list. */
export const cupboardOf = (c) => ({ have: [...(c?.have ?? Pantry.defaults)], low: [...(c?.low || [])], extra: [...(c?.extra || [])], hidden: [...(c?.hidden || [])] });

export const Cupboard = {
  state: (c, key) => ((c.low || []).includes(key) ? 'low' : (c.have || []).includes(key) ? 'have' : 'none'),
  /** Tap: not kept → have it → running low → not kept. */
  cycle(c, key) {
    const without = (xs) => xs.filter((k) => k !== key);
    switch (Cupboard.state(c, key)) {
      case 'none': return { ...c, have: [...without(c.have), key], low: without(c.low) };
      case 'have': return { ...c, low: [...without(c.low), key] };
      default: return { ...c, have: without(c.have), low: without(c.low) };
    }
  },
  addOwn(c, word) {
    const w = word.trim().toLowerCase();
    if (!w || c.extra.includes(w)) return c;
    return { ...c, extra: [...c.extra, w], have: [...c.have, Pantry.extraKey(w)] };
  },
  remove(c, key, label) {
    const without = (xs) => xs.filter((k) => k !== key);
    return key.startsWith('x:') ? { ...c, extra: c.extra.filter((w) => w !== label), have: without(c.have), low: without(c.low) }
      : { ...c, hidden: [...without(c.hidden), key], have: without(c.have), low: without(c.low) };
  },
  /** Everything it keeps, as names, with which are low: [name, low]. */
  kept: (c) => [
    ...Pantry.staples.filter((s) => c.have.includes(s.key) && !c.hidden.includes(s.key)).map((s) => [s.label, c.low.includes(s.key)]),
    ...c.extra.filter((w) => c.have.includes(Pantry.extraKey(w))).map((w) => [w, c.low.includes(Pantry.extraKey(w))]),
  ],
};

// ---------------------------------------------------------------- parts of a card

/** Names that are a thing you make and use, not just a stage ("Sauce" yes, "Assembly" no). */
const makeable = /\b(sauce|dressing|vinaigrette|glaze|topping|dip|marinade|crust|base|filling|frosting|icing|crumble|streusel|gravy|salsa|pesto|syrup|rub|batter|dough|pastry|slaw|relish|chutney|compote|custard|ganache|aioli|mayo|mayonnaise|butter|stock|broth|seasoning|spice mix|pickles?|croutons|meringue|caramel|curd|jam|purée|puree)\b/i;
const partLead = /^(for (the )?|make (the )?|to make (the )?|the )/i;

/** "## For the sauce:" → "sauce". */
export const partName = (heading) => heading.replace(/^## /, '').trim().replace(/:+$/, '').replace(partLead, '').trim();
const partKey = (s) => partName(s).toLowerCase();
const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i);

/**
 * Parts of a card that could be cards of their own: an ingredient section with a sensible name
 * ("## Dressing") and the steps that make it, under a method heading of the same name or, failing
 * that, the steps that work on that section's ingredients. [{ name, ingredients, steps }].
 */
export function cardParts(r) {
  const ing = r.ingredients;
  const heads = ing.map((l, i) => i).filter((i) => ing[i].startsWith('## '));
  if (!heads.length) return [];
  const sections = heads.map((h, n) => [h, range(h + 1, heads[n + 1] ?? ing.length)])
    .filter(([h, lines]) => lines.length && makeable.test(partName(ing[h])));
  if (!sections.length) return [];
  const stepHeads = r.steps.map((s, i) => i).filter((i) => r.steps[i].startsWith('## '));
  const words = new Map(sections.map(([h]) => [h, new RegExp(`\\b${rxEscape(partKey(ing[h]).split(' ').pop())}`, 'i')]));
  return sections.map(([h, lines]) => {
    const sh = stepHeads.find((i) => partKey(r.steps[i]) === partKey(ing[h]));
    const steps = sh != null ? range(sh, stepHeads.find((i) => i > sh) ?? r.steps.length) : r.steps.map((s, i) => i).filter((i) => {
      const step = r.steps[i];
      if (step.startsWith('## ')) return false;
      const used = ingredientsInStep(step, ing);
      const inside = used.filter((u) => lines.includes(u)).length;
      const outside = used.length - inside;
      // Named for this part first ("Whisk the filling… over the base" is the filling's).
      let firstNamed = null;
      let firstAt = Infinity;
      for (const [k, w] of words) {
        const m = w.exec(step);
        if (m && m.index < firstAt) { firstAt = m.index; firstNamed = k; }
      }
      return (firstNamed === h && outside === 0) || (inside >= 2 && inside > outside && (firstNamed == null || firstNamed === h));
    });
    return steps.some((i) => !r.steps[i].startsWith('## ')) ? { name: partName(ing[h]), ingredients: [h, ...lines], steps } : null;
  }).filter(Boolean);
}

/**
 * Makes a part its own card and puts one linked line in its place in the original: "1 batch
 * Caesar Salad dressing" in the ingredients, "Make the dressing (its own card: …)." in the method.
 * Returns [the original, changed; the new card].
 */
export function extractPart(r, part, newId = uuid(), now = Date.now()) {
  const title = `${r.title} ${part.name.toLowerCase()}`;
  const sub = {
    id: newId, title, description: `Part of ${r.title}.`,
    ingredients: part.ingredients.slice(1).map((i) => r.ingredients[i]),
    steps: part.steps.map((i) => r.steps[i]).filter((s) => !s.startsWith('## ')),
    notes: '', servings: r.servings ?? null, yieldText: '1 batch', prepMin: null, cookMin: null, totalMin: null,
    folderId: r.folderId ?? null, alsoIn: [...(r.alsoIn || [])], sourceName: r.sourceName || '', sourceUrl: r.sourceUrl || '',
    author: '', imageUrl: '', cuisine: '', category: '', keywords: '', nutrition: [], rating: '', published: '', subRecipes: [],
    keepProgress: false, checkedIngredients: [], checkedSteps: [], scale: 1, created: now, updated: now,
  };
  const ingAt = part.ingredients[0];
  const stepAt = part.steps[0];
  const newIng = [];
  const ingMap = new Map();
  r.ingredients.forEach((line, i) => {
    if (i === ingAt) newIng.push(`1 batch ${title}`);
    if (part.ingredients.includes(i)) return;
    ingMap.set(i, newIng.length);
    newIng.push(line);
  });
  const newSteps = [];
  const stepMap = new Map();
  r.steps.forEach((line, i) => {
    if (i === stepAt) newSteps.push(`Make the ${part.name.toLowerCase()} (its own card: ${title}).`);
    if (part.steps.includes(i)) return;
    stepMap.set(i, newSteps.length);
    newSteps.push(line);
  });
  const kept = (r.subRecipes || []).map((s) => {
    const to = (s.kind === 's' ? stepMap : ingMap).get(s.index);
    return to == null ? null : { ...s, index: to };
  }).filter(Boolean);
  const links = [
    { name: title, url: '', kind: 'i', index: ingAt, recipeId: newId },
    { name: title, url: '', kind: 's', index: stepAt, recipeId: newId },
  ];
  return [{
    ...r, ingredients: newIng, steps: newSteps, subRecipes: [...kept, ...links],
    checkedIngredients: (r.checkedIngredients || []).map((i) => ingMap.get(i)).filter((i) => i != null),
    checkedSteps: (r.checkedSteps || []).map((i) => stepMap.get(i)).filter((i) => i != null), updated: now,
  }, sub];
}
