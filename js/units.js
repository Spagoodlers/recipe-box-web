// Amounts, units and times: a port of the Android app's Scaler, Units and Durations, so a card
// scales and converts the same on the web as on the phone.

const glyphs = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const glyphClass = Object.keys(glyphs).join('');
/** One amount: "1 1/2", "1/2", ".5", "1½", "½", "2". */
export const NUM = `(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d*\\.\\d+|\\d+\\s*[${glyphClass}]|[${glyphClass}]|\\d+)`;
const lead = new RegExp(`^(\\s*)(${NUM})(?:(\\s*(?:-|–|to)\\s*)(${NUM}))?(?![\\d/])`);

export function parseNumber(s) {
  const t = s.trim();
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (m) return +m[3] === 0 ? null : +m[1] + +m[2] / +m[3];
  m = /^(\d+)\/(\d+)$/.exec(t);
  if (m) return +m[2] === 0 ? null : +m[1] / +m[2];
  m = new RegExp(`^(\\d*)\\s*([${glyphClass}])$`).exec(t);
  if (m) return (m[1] ? +m[1] : 0) + glyphs[m[2]];
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : null;
}

const outGlyphs = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

function trimDecimal(v) {
  return v === 0 ? '0' : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Kitchen-friendly: the nearest common fraction under 10, whole numbers above. */
export function formatAmount(v) {
  if (v >= 10) return String(Math.round(v));
  const whole = Math.floor(v);
  const frac = v - whole;
  if (frac < 1 / 16) return whole === 0 ? trimDecimal(v) : String(whole);
  if (frac > 15 / 16) return String(whole + 1);
  let best = outGlyphs[0];
  for (const g of outGlyphs) if (Math.abs(g[0] - frac) < Math.abs(best[0] - frac)) best = g;
  return whole === 0 ? best[1] : `${whole}${best[1]}`;
}

const spoonRx = /^(\s*)(tsps?|teaspoons?|tbsps?|tablespoons?)\b\.?/i;

/** Scaled up, spoons become bigger spoons and cups when it comes out exact (24 tbsp → 1½ cups). */
function tidySpoons(value, rest) {
  const exact = (x, step) => Math.abs(x / step - Math.round(x / step)) < 1e-6;
  let v = value;
  let r = rest;
  for (let i = 0; i < 2; i++) {
    const m = spoonRx.exec(r);
    if (!m) return [v, r];
    const unit = m[2].toLowerCase();
    const long = unit.startsWith('tea') || unit.startsWith('table');
    let next;
    let to;
    if (unit.startsWith('tsp') || unit.startsWith('tea')) {
      next = v >= 3 && exact(v / 3, 0.5) ? v / 3 : null;
      to = long ? 'tablespoon' : 'tbsp';
    } else {
      next = v >= 4 && exact(v / 16, 0.25) ? v / 16 : null;
      to = 'cup';
    }
    if (next == null) return [v, r];
    v = next;
    r = m[1] + to + r.substring(m.index + m[0].length);
  }
  return [v, r];
}

const plurals = [
  'cup', 'tablespoon', 'teaspoon', 'pound', 'ounce', 'clove', 'can', 'quart', 'pint', 'gallon',
  'stick', 'slice', 'sprig', 'package', 'packet', 'jar', 'head', 'piece', 'gram', 'kilogram',
  'liter', 'litre', 'fillet', 'egg', 'large egg', 'pinch', 'dash', 'bunch',
].map((one) => [one, one.endsWith('ch') || one.endsWith('sh') ? `${one}es` : `${one}s`]);

/** "2 tablespoon" → "2 tablespoons", "½ cups" → "½ cup". */
function fixUnit(rest, amount) {
  const leadSpace = rest.match(/^ */)[0];
  const body = rest.substring(leadSpace.length);
  for (const [one, many] of plurals) {
    const want = amount > 1 ? many : one;
    for (const from of [many, one]) {
      if (body.toLowerCase().startsWith(from) && !/[A-Za-z]/.test(body.charAt(from.length))) {
        return leadSpace + want + body.substring(from.length);
      }
    }
  }
  return rest;
}

/** Scales the leading amount of an ingredient line: "1 1/2 cups flour" × 2 → "3 cups flour". */
export function scale(line, factor) {
  if (line.startsWith('## ')) return line;
  const normalized = line.replace(/⁄/g, '/');
  const m = lead.exec(normalized);
  if (!m) return line;
  if (factor === 1 && !m[0].includes('.')) return line;
  const a = parseNumber(m[2]);
  if (a == null) return line;
  const b = m[4] ? parseNumber(m[4]) : null;
  let amount = a * factor;
  let rest = normalized.substring(m[0].length);
  if (b == null && factor !== 1) [amount, rest] = tidySpoons(a * factor, rest);
  let out = m[1] + formatAmount(amount);
  if (b != null) out += m[3] + formatAmount(b * factor);
  return out + fixUnit(rest, b != null ? b * factor : amount);
}

// ---------------------------------------------------------------- units

export const UnitSystem = { AsWritten: 'AsWritten', Metric: 'Metric', US: 'US' };
export const unitLabel = { AsWritten: 'As written', Metric: 'Metric', US: 'US' };

const V = 'Volume';
const M = 'Mass';
const units = [
  ['fluid ounces', V, 29.57], ['fluid ounce', V, 29.57], ['fl. oz', V, 29.57], ['fl oz', V, 29.57],
  ['tablespoons', V, 15], ['tablespoon', V, 15], ['tbsps', V, 15], ['tbsp', V, 15], ['tbs', V, 15],
  ['teaspoons', V, 5], ['teaspoon', V, 5], ['tsps', V, 5], ['tsp', V, 5],
  ['cups', V, 240], ['cup', V, 240], ['quarts', V, 946], ['quart', V, 946], ['pints', V, 473], ['pint', V, 473],
  ['millilitres', V, 1], ['milliliters', V, 1], ['ml', V, 1],
  ['litres', V, 1000], ['liters', V, 1000], ['litre', V, 1000], ['liter', V, 1000], ['l', V, 1000],
  ['ounces', M, 28.35], ['ounce', M, 28.35], ['oz', M, 28.35],
  ['pounds', M, 453.6], ['pound', M, 453.6], ['lbs', M, 453.6], ['lb', M, 453.6],
  ['kilograms', M, 1000], ['kilogram', M, 1000], ['kg', M, 1000], ['grams', M, 1], ['gram', M, 1], ['g', M, 1],
];
const unitMap = new Map(units.map(([n, kind, base]) => [n, { kind, base }]));
const metricNames = new Set(['millilitres', 'milliliters', 'ml', 'litres', 'liters', 'litre', 'liter', 'l', 'kilograms', 'kilogram', 'kg', 'grams', 'gram', 'g']);
const spoons = new Set(['tablespoons', 'tablespoon', 'tbsps', 'tbsp', 'tbs', 'teaspoons', 'teaspoon', 'tsps', 'tsp']);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unitLead = new RegExp(
  `^(\\s*)(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*(${units.map(([n]) => escape(n)).join('|')})(?![a-z])\\.?`,
  'i',
);

/** Grams per millilitre of what's usually weighed, most specific first (a cup of flour is 125 g). */
const densities = [
  ['whole wheat flour', 120], ['wholemeal flour', 120], ['almond flour', 96], ['ground almonds', 96],
  ['flour', 125],
  ['brown sugar', 220], ['icing sugar', 120], ['powdered sugar', 120], ['confectioners', 120],
  ['sugar', 200],
  ['butter', 227], ['cocoa', 85], ['chocolate chips', 170], ['oats', 90], ['rolled oats', 90],
  ['rice', 185], ['breadcrumbs', 110], ['raisins', 150], ['cornstarch', 120], ['cornflour', 120],
  ['grated parmesan', 100], ['grated cheese', 100], ['shredded', 113], ['cheddar', 113], ['mozzarella', 113],
].map(([name, perCup]) => [new RegExp(`\\b${escape(name)}\\b`, 'i'), perCup / 240]);

function density(rest) {
  // Buttermilk and peanut butter pour or spread: only plain butter is weighed.
  if (/\b(buttermilk|peanut butter|milk|water|juice|stock|broth|oil|cream)\b/i.test(rest)) return null;
  const d = densities.find(([rx]) => rx.test(rest));
  return d ? d[1] : null;
}

const metricUnit = (kind, base) => (kind === V ? (base >= 1000 ? ['l', 1000] : ['ml', 1]) : base >= 1000 ? ['kg', 1000] : ['g', 1]);
const usUnit = (kind, base) => {
  if (kind === V) return base < 15 ? ['tsp', 5] : base < 60 ? ['tbsp', 15] : ['cup', 240];
  return base >= 453.6 ? ['lb', 453.6] : ['oz', 28.35];
};
function roundMetric(v) {
  if (v >= 500) return String(Math.round(v / 10) * 10);
  if (v >= 100) return String(Math.round(v / 5) * 5);
  if (v >= 10) return String(Math.round(v));
  if (v >= 1) return v.toFixed(1).replace(/0+$/, '').replace(/\.$/, '');
  return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** The leading amount of an ingredient line in US or metric units (spoons stay spoons). */
export function convert(line, system) {
  if (system === UnitSystem.AsWritten || line.startsWith('## ')) return line;
  const normalized = line.replace(/⁄/g, '/');
  const m = unitLead.exec(normalized);
  if (!m) return line;
  const unitName = m[4].toLowerCase();
  const unit = unitMap.get(unitName);
  if (!unit) return line;
  const isMetric = metricNames.has(unitName);
  if ((system === UnitSystem.Metric) === isMetric) return line;
  if (system === UnitSystem.Metric && spoons.has(unitName)) return line;
  const a = parseNumber(m[2]);
  if (a == null) return line;
  const b = m[3] ? parseNumber(m[3]) : null;
  const rest = normalized.substring(m[0].length);
  const d = density(rest);
  let kind = unit.kind;
  let factor = unit.base;
  if (d != null && system === UnitSystem.Metric && unit.kind === V) [kind, factor] = [M, unit.base * d];
  else if (d != null && system === UnitSystem.US && unit.kind === M) [kind, factor] = [V, unit.base / d];
  const base = (b ?? a) * factor;
  const [outName, per] = system === UnitSystem.Metric ? metricUnit(kind, base) : usUnit(kind, base);
  const fmt = (v) => (system === UnitSystem.Metric ? roundMetric((v * factor) / per) : formatAmount((v * factor) / per));
  const amount = b != null ? `${fmt(a)}–${fmt(b)}` : fmt(a);
  return `${m[1]}${amount} ${outName}${rest}`;
}

const tempRx = /(\d{2,3})\s*(?:°|º|degrees?\s*)\s*([FC])\b|(\d{3})\s*([FC])\b/g;

/** Oven temperatures in a step: "350°F" ↔ "175°C" (Celsius to 5°, Fahrenheit to 25°). */
export function convertTemps(step, system) {
  if (system === UnitSystem.AsWritten) return step;
  return step.replace(tempRx, (all, n1, s1, n3, s3) => {
    const n = +(n1 || n3);
    const sc = (s1 || s3).toUpperCase();
    if (system === UnitSystem.Metric && sc === 'F') return `${Math.round(((n - 32) * 5) / 9 / 5) * 5}°C`;
    if (system === UnitSystem.US && sc === 'C') return `${Math.round(((n * 9) / 5 + 32) / 25) * 25}°F`;
    return all;
  });
}

// ---------------------------------------------------------------- amounts in steps

const descriptors = [
  'large', 'small', 'medium', 'fresh', 'dried', 'chopped', 'minced', 'diced', 'sliced', 'ground', 'whole',
  'skinless', 'boneless', 'cut', 'into', 'strips', 'halves', 'pieces', 'cubes', 'finely', 'roughly', 'thinly',
  'and', 'or', 'of', 'the', 'for', 'to', 'taste', 'optional', 'plus', 'more', 'extra', 'about', 'each',
  'can', 'cans', 'package', 'packages', 'jar', 'bunch', 'pinch', 'cloves', 'clove', 'head', 'stick', 'sticks',
  'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'grams', 'ounces', 'pound', 'pounds',
  'lb', 'lbs', 'oz', 'ml', 'kg', 'packed', 'softened', 'melted', 'room', 'temperature', 'divided', 'plain',
  'virgin', 'note', 'serve', 'serving', 'garnish', 'white', 'black', 'red', 'green', 'yellow',
];
const generic = ['powder', 'sauce', 'paste', 'juice', 'leaves', 'seeds', 'extract', 'stock', 'flakes'];
function singular(w) {
  if (w.endsWith('oes')) return w.slice(0, -2);
  if (w.endsWith('ves')) return `${w.slice(0, -3)}f`;
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
const stop = new Set(descriptors.map(singular));
const vague = new Set(generic.map(singular));
const words = (s) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3).map(singular);

const amountLead = /^[\d½¼¾⅓⅔⅛⅜⅝⅞/.\s–-]+(x\s*)?/i;
const measureLead = /^(cups?|tbsps?|tsps?|tablespoons?|teaspoons?|fl\.? oz|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|cans?|tins?|jars?|packages?|packets?|bags?|pinch(es)?|handfuls?|cloves?|sticks?|bunch(es)?|slices?|pieces?|heaped|level|large|small|medium|of)\b\.?\s*/i;

/** What an ingredient line is, for searching: "½ cup hot sauce (Frank's), warm" → "hot sauce". */
export function ingredientName(line) {
  // Asides go, wherever they are: "1 can (14 oz) diced tomatoes" is diced tomatoes.
  let s = line.replace(/^## /, '').replace(/\([^)]*\)/g, ' ').split('(')[0].split(',')[0].replace(/\s+/g, ' ').trim();
  s = s.replace(amountLead, '');
  for (let i = 0; i < 4; i++) s = s.replace(amountLead, '').replace(measureLead, '');
  return s.trim() || line.trim();
}

/** Indices of the ingredient lines a method step mentions ("Add the onions" → "2 large onions"). */
export function ingredientsInStep(step, ingredients) {
  const stepWords = new Set(words(step));
  const out = [];
  ingredients.forEach((line, i) => {
    if (line.startsWith('## ') || out.length >= 8) return;
    const name = words(line.split('(')[0]).filter((w) => !stop.has(w));
    if (name.some((w) => stepWords.has(w) && !vague.has(w))) out.push(i);
  });
  return out;
}

// ---------------------------------------------------------------- times

/** "1h 10m"; "–" for nothing. */
export function formatMinutes(min) {
  if (min == null || min <= 0) return '–';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
}

/** Lenient, for times typed by hand: "45", "45m", "1h 30m", "1:30". */
export function parseMinutes(s) {
  const t = String(s ?? '').trim().toLowerCase();
  if (!t || t === '–') return null;
  if (/^\d+$/.test(t)) return +t;
  const hm = /^(\d+):(\d{1,2})$/.exec(t);
  if (hm) return +hm[1] * 60 + +hm[2];
  let total = 0;
  let any = false;
  for (const m of t.matchAll(/(\d+)\s*(d|h|m)/g)) {
    any = true;
    total += +m[1] * { d: 1440, h: 60, m: 1 }[m[2]];
  }
  return any ? total : null;
}

const timerRx =/(\d+)(?:\s*(?:-|–|to)\s*\d+)?\s*(hours?|hrs?|minutes?|mins?)\b/gi;

/** Timers a step mentions, in minutes: "Bake for 25 minutes" → [25]. At most three. */
export function stepTimers(step) {
  const out = [];
  for (const m of step.matchAll(timerRx)) {
    const n = +m[1];
    const minutes = m[2].toLowerCase().startsWith('h') ? n * 60 : n;
    if (minutes >= 1 && minutes <= 1440 && !out.includes(minutes)) out.push(minutes);
  }
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- search

/** Lowercase, without accents: "Crème brûlée" sorts and searches as "creme brulee". */
export function fold(s) {
  return s.normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase()
    .replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o');
}

/** Every word of the query is somewhere on the card. */
export function matches(r, query) {
  if (!query.trim()) return true;
  const hay = fold([r.title, r.description, ...(r.ingredients || []), r.keywords, r.cuisine, r.category, r.sourceName, r.notes].join('\n'));
  return fold(query).split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}
