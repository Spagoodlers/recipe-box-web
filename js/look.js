// How things look: the app's colour schemes (each with a light and a dark side), colour strength,
// high contrast, syntax highlighting for recipe text, casing and US/UK spelling. Ported from the
// Android app so a scheme is the same colour on both.

// ---------------------------------------------------------------- colours

const hex = (n) => ({ r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 });
const css = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });
const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const WHITE = hex(0xffffff);
const BLACK = hex(0x000000);
const NEAR_BLACK = hex(0x111111);

/** WCAG contrast between two colours (1 to 21). */
export function contrast(a, b) {
  const ch = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const l = (c) => 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  const x = l(a);
  const y = l(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A scheme from three colours: dims and faints mixed from ink and paper; text on the accent picks itself. */
function scheme(ink, paper, accent, syntax = null) {
  const i = hex(ink);
  const p = hex(paper);
  const a = hex(accent);
  const on = luminance(a) > 0.55 ? NEAR_BLACK : WHITE;
  return {
    ink: i, paper: p, dim: mix(i, p, 0.42), faint: mix(i, p, 0.74), accent: a,
    onAccent: Math.abs(luminance(p) - luminance(a)) > 0.45 ? p : on, dark: luminance(p) < 0.5, syntax,
  };
}
const light = (accent, paper = 0xffffff, ink = 0x111111) => scheme(ink, paper, accent);
const darkOf = (accent, paper = 0x121212, ink = 0xececec) => scheme(ink, paper, accent);
const code = (ink, paper, accent, number, unit, temp, time, aside, verb) => scheme(ink, paper, accent, {
  number: hex(number), unit: hex(unit), temp: hex(temp), time: hex(time), aside: hex(aside), verb: hex(verb), byWeight: false,
});
const plain = (dark) => (dark
  ? { ink: WHITE, paper: BLACK, dim: hex(0xaaaaaa), faint: hex(0x555555), accent: WHITE, onAccent: BLACK, dark: true, syntax: null }
  : { ink: BLACK, paper: WHITE, dim: hex(0x555555), faint: hex(0xaaaaaa), accent: BLACK, onAccent: WHITE, dark: false, syntax: null });

/** Every scheme: [label, group, about, light, dark]. */
export const palettes = {
  Ink: ['Ink', 'Black & white', 'Pure black and white, best on e-ink', () => plain(false), () => plain(true)],
  Paper: ['Paper', 'Black & white', 'Warm off-white, like a printed card', () => scheme(0x2b2622, 0xf4efe6, 0x2b2622), () => darkOf(0xe8dcc8, 0x1a1714, 0xe8dcc8)],
  Newsprint: ['Newsprint', 'Black & white', 'Soft grey paper, black type', () => scheme(0x161616, 0xe9e9e6, 0x161616), () => darkOf(0xd6d6d6, 0x222222, 0xdadada)],
  Charcoal: ['Charcoal', 'Black & white', 'Gentle greys, easy on the eyes', () => scheme(0x3a3d40, 0xf2f2f2, 0x55595d), () => darkOf(0xbfc3c7, 0x26282a, 0xc8cbce)],
  Tomato: ['Tomato', 'Warm', '', () => light(0xc8402a, 0xfff8f0, 0x2b1d16), () => darkOf(0xe8664e, 0x1e1512, 0xf5e9df)],
  Paprika: ['Paprika', 'Warm', '', () => light(0xb4501e, 0xfff6ee, 0x2a1a12), () => darkOf(0xe07a4a, 0x1c1410, 0xf4e6dc)],
  Saffron: ['Saffron', 'Warm', '', () => light(0xc98a00, 0xfffbef, 0x2a2210), () => darkOf(0xf0b429, 0x1a1608, 0xf6eed8)],
  Honey: ['Honey', 'Warm', '', () => light(0xa86f12, 0xfff9ec, 0x2b2114), () => darkOf(0xe3b65c, 0x1b1710, 0xf4ebd9)],
  Apricot: ['Apricot', 'Warm', '', () => light(0xd9733a, 0xfff7f1, 0x2c1e16), () => darkOf(0xf5a26b, 0x1d1612, 0xf7ebe1)],
  Cocoa: ['Cocoa', 'Warm', '', () => light(0x6b4226, 0xfaf4ee, 0x241812), () => darkOf(0xc89b7b, 0x1a1411, 0xefe4db)],
  Rose: ['Rose', 'Warm', '', () => light(0xc2456a, 0xfff6f8, 0x2b171d), () => darkOf(0xf08aa0, 0x1d1316, 0xf6e6ea)],
  Berry: ['Berry', 'Warm', '', () => light(0x9e1f5a, 0xfdf4f8, 0x28121f), () => darkOf(0xe05c8a, 0x1c1119, 0xf4e3ee)],
  Blueberry: ['Blueberry', 'Cool', '', () => light(0x4c5bd4, 0xf5f6fb, 0x1b1e33), () => darkOf(0x7f8cf0, 0x121424, 0xe8eaf6)],
  Ocean: ['Ocean', 'Cool', '', () => light(0x1f6fa8, 0xf3f8fc, 0x102230), () => darkOf(0x4fb3e8, 0x0e1820, 0xe2eef5)],
  Denim: ['Denim', 'Cool', '', () => light(0x35578c, 0xf4f6fa, 0x151d2b), () => darkOf(0x7da2d6, 0x121822, 0xe4eaf3)],
  Teal: ['Teal', 'Cool', '', () => light(0x0f7c73, 0xf2faf9, 0x0f2422), () => darkOf(0x3cc2b4, 0x0e1a19, 0xe0f2f0)],
  Slate: ['Slate', 'Cool', '', () => light(0x4a5d73, 0xf4f6f8, 0x1a222c), () => darkOf(0x94a7bd, 0x151a20, 0xe3e8ee)],
  Lavender: ['Lavender', 'Cool', '', () => light(0x7357c9, 0xf8f6fd, 0x221a33), () => darkOf(0xb49cf0, 0x17131f, 0xece6f7)],
  Plum: ['Plum', 'Cool', '', () => light(0x7b2d78, 0xfbf4fa, 0x261425), () => darkOf(0xc27ac2, 0x1a1119, 0xf1e4f0)],
  Sage: ['Sage', 'Green', '', () => light(0x3e7c59, 0xf4f7f2, 0x1f2a22), () => darkOf(0x6fb58a, 0x141a16, 0xe6efe8)],
  Basil: ['Basil', 'Green', '', () => light(0x2e8b3e, 0xf4faf4, 0x142417), () => darkOf(0x5cc46e, 0x101a12, 0xe2f2e5)],
  Mint: ['Mint', 'Green', '', () => light(0x1e9c72, 0xf2fbf7, 0x10261e), () => darkOf(0x7eddb8, 0x0f1b17, 0xe3f5ee)],
  Olive: ['Olive', 'Green', '', () => light(0x6e6e1e, 0xf8f8ee, 0x242412), () => darkOf(0xb8b860, 0x181810, 0xeeeedc)],
  Forest: ['Forest', 'Green', '', () => light(0x1f5233, 0xf1f6f2, 0x0e1e14), () => darkOf(0x4f9e6a, 0x0d1510, 0xddebe1)],
  Pistachio: ['Pistachio', 'Green', '', () => light(0x6a8f2e, 0xf7faf0, 0x1e2612), () => darkOf(0xa9cf6e, 0x151a0f, 0xeaf2dd)],
};
export const paletteGroups = ['Black & white', 'Warm', 'Cool', 'Green'];

// Highlighting for a scheme without its own: cooking words in its accent, amounts and units on hues
// round the wheel from it, temperatures warm, times golden. Black and white uses ink and weight.
function hsl(hue, sat, l) {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}
function hueOf(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  if (max - min < 0.04) return 210;
  const d = max - min;
  const h = max === c.r ? 60 * (((c.g - c.b) / d) % 6) : max === c.g ? 60 * ((c.b - c.r) / d + 2) : 60 * ((c.r - c.g) / d + 4);
  return (h + 360) % 360;
}
function hueOn(hue, paper, sat = 0.62) {
  const darkPaper = luminance(paper) < 0.5;
  let l = darkPaper ? 0.62 : 0.42;
  let c = hsl(hue, sat, l);
  while (contrast(c, paper) < 4 && l >= 0.05 && l <= 0.95) {
    l += darkPaper ? 0.04 : -0.04;
    c = hsl(hue, sat, l);
  }
  return c;
}
function derivedSyntax(p, mono) {
  if (mono) return { number: p.ink, unit: p.ink, temp: p.ink, time: p.ink, aside: p.dim, verb: p.ink, byWeight: true };
  const h = hueOf(p.accent);
  const verb = contrast(p.accent, p.paper) >= 4 && contrast(p.accent, p.ink) >= 1.6 ? p.accent : hueOn(h + 300, p.paper, 0.7);
  return {
    number: hueOn(h + 150, p.paper), unit: hueOn(h + 210, p.paper, 0.5), temp: hueOn(8, p.paper, 0.75),
    time: hueOn(42, p.paper, 0.7), aside: p.dim, verb, byWeight: false,
  };
}

/** A scheme in use: light or dark, with high contrast and colour strength applied. */
export function palette(name, dark, { highContrast = false, accent = 'Full' } = {}) {
  const def = palettes[name] || palettes.Ink;
  let p = (dark ? def[4] : def[3])();
  if (!p.syntax) p = { ...p, syntax: derivedSyntax(p, def[1] === 'Black & white') };
  if (highContrast) {
    const ink = p.dark ? WHITE : BLACK;
    p = { ...p, ink, dim: mix(ink, p.paper, 0.22), faint: mix(ink, p.paper, 0.55) };
  }
  if (accent === 'Soft') {
    const a = mix(p.accent, p.paper, 0.35);
    p = { ...p, accent: a, onAccent: luminance(a) > 0.55 ? NEAR_BLACK : WHITE };
  } else if (accent === 'Ink') {
    p = { ...p, accent: p.ink, onAccent: p.paper };
  }
  return p;
}

/** The scheme as CSS custom properties. */
export function paletteVars(p) {
  const s = p.syntax;
  return {
    '--paper': css(p.paper), '--ink': css(p.ink), '--dim': css(p.dim), '--faint': css(p.faint),
    '--accent': css(p.accent), '--on-accent': css(p.onAccent),
    '--syn-number': css(s.number), '--syn-unit': css(s.unit), '--syn-temp': css(s.temp), '--syn-time': css(s.time),
    '--syn-aside': css(s.aside), '--syn-verb': css(s.verb), '--syn-weight': s.byWeight ? '700' : '400',
  };
}
export const colourOf = (p, k) => css(p[k]);

// ---------------------------------------------------------------- syntax highlighting

const rules = [
  ['verb', /\b(?:heat|add|stir|bake|roast|simmer|boil|whisk|mix|beat|chop|slice|cook|serve|season|fry|pour|melt|fold|toss|grill|rest|drain|bring|cover|spread|knead|blend|brown|sear|sauté|saute|toast|chill|cool|scatter|layer|sprinkle|roll|cut|rub|steam|grate|peel|dice|mince|marinate|broil|poach|scramble|flip|mash|squeeze|garnish)\b/gi],
  ['number', /\d+(?:[./]\d+)?[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛⅜⅝⅞]/g],
  ['unit', /\b(?:cups?|tbsps?|tsps?|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|pints?|quarts?|cloves?|cans?|pinch(?:es)?|inch(?:es)?)\b/gi],
  ['time', /\b\d+(?:\s*(?:-|–|to)\s*\d+)?\s*(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi],
  ['temp', /\d{2,3}\s*°\s*[FC]\b|\b(?:LOW|MEDIUM|HIGH)(?:-(?:LOW|HIGH))?\b/g],
  ['aside', /\([^)]*\)/g],
];
const escHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A recipe line as HTML, its amounts, units, temperatures, times, asides and verbs marked. Later rules win. */
export function highlight(text) {
  const kind = new Array(text.length).fill(null);
  for (const [k, rx] of rules) {
    rx.lastIndex = 0;
    for (const m of text.matchAll(rx)) for (let i = m.index; i < m.index + m[0].length; i++) kind[i] = k;
  }
  let out = '';
  let i = 0;
  while (i < text.length) {
    const k = kind[i];
    let j = i;
    while (j < text.length && kind[j] === k) j++;
    const part = escHtml(text.slice(i, j));
    out += k ? `<span class="syn-${k}">${part}</span>` : part;
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------- casing

export const casings = { AsWritten: 'As written', Title: 'Title Case', Lower: 'lowercase' };
const small = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'the', 'to', 'with', 'vs', 'via', 'per', 'e', 'g']);

/** Title Case: each word capitalised, small words lower (except first and last). */
export function titleCase(text) {
  const parts = text.split(/(\s+)/);
  const words = parts.map((p, i) => (p.trim() ? i : -1)).filter((i) => i >= 0);
  return parts.map((p, i) => {
    if (!p.trim()) return p;
    const bare = p.toLowerCase().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    const edge = i === words[0] || i === words[words.length - 1];
    if (!edge && small.has(bare) && p === p.toLowerCase()) return p;
    return p.split('-').map((seg) => seg.replace(/\p{L}/u, (c) => c.toUpperCase())).join('-');
  }).join('');
}

/** Casing changes how text shows, never what's stored. Names (titles, buttons, labels) take Title Case; everything takes lowercase. */
export function applyCase(text, mode, name) {
  if (mode === 'AsWritten' || !/\p{L}/u.test(text)) return text;
  if (mode === 'Lower') return text.toLowerCase();
  if (!name) return text;
  return mode === 'Title' ? titleCase(text) : text;
}

// ---------------------------------------------------------------- spelling (the app's own words only)

const ukToUs = {
  colour: 'color', colours: 'colors', coloured: 'colored', colourful: 'colorful',
  grey: 'gray', greys: 'grays', greyish: 'grayish', litre: 'liter', litres: 'liters',
  millilitre: 'milliliter', millilitres: 'milliliters', centilitre: 'centiliter', centilitres: 'centiliters',
  centimetre: 'centimeter', centimetres: 'centimeters', millimetre: 'millimeter', millimetres: 'millimeters',
  favourite: 'favorite', favourites: 'favorites', flavour: 'flavor', flavours: 'flavors', flavoured: 'flavored',
  organise: 'organize', organised: 'organized', customise: 'customize', customised: 'customized',
  recognise: 'recognize', behaviour: 'behavior', catalogue: 'catalog', cancelled: 'canceled', licence: 'license', licences: 'licenses',
};
const spellRx = new RegExp(`\\b(${Object.keys(ukToUs).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi');

/** The app's words in US spelling (it's written in UK spelling), keeping each word's case. */
export function toUs(text) {
  return text.replace(spellRx, (w) => {
    const us = ukToUs[w.toLowerCase()];
    if (!us) return w;
    if (w.length > 1 && w === w.toUpperCase()) return us.toUpperCase();
    return /^\p{Lu}/u.test(w) ? us[0].toUpperCase() + us.slice(1) : us;
  });
}

/** US spelling where people cook in cups (and a few others), UK elsewhere. */
export function defaultSpelling(region) {
  return ['US', 'PR', 'GU', 'VI', 'AS', 'MP', 'PH', 'LR'].includes(region) ? 'US' : 'UK';
}
