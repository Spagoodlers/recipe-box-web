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
  // Developer schemes (Palette Paella): each has a light and a dark side too.
  Terminal: ['Green screen', 'Developer', 'A 1983 terminal', () => scheme(0x0b5a1e, 0xe6f7e9, 0x0f8a2e), () => scheme(0x33ff66, 0x020a03, 0x33ff66)],
  Amber: ['Amber CRT', 'Developer', 'The other 1983 terminal', () => scheme(0x5a3a00, 0xfff4dc, 0xb86e00), () => scheme(0xffb000, 0x0d0800, 0xffb000)],
  Blueprint: ['Blueprint', 'Developer', 'White lines on drafting blue', () => scheme(0x1c4e9c, 0xf4f8ff, 0x1c4e9c), () => scheme(0xf2f7ff, 0x1c4e9c, 0xf2f7ff)],
  Parchment: ['Parchment', 'Developer', 'A very old cookbook', () => scheme(0x3b2412, 0xefe2c2, 0x7b2d12), () => scheme(0xefe2c2, 0x2a1d10, 0xd9824a)],
  Vaporwave: ['Vaporwave', 'Developer', 'Pink and cyan on purple', () => scheme(0x3b1260, 0xffe9fa, 0xd6249f), () => scheme(0xffe6ff, 0x2a0f45, 0xff4fd8)],
  HiVis: ['Hi-vis', 'Developer', 'Safety yellow', () => scheme(0x000000, 0xffe600, 0x000000), () => scheme(0xffe600, 0x000000, 0xffe600)],
  NightShift: ['Night shift', 'Developer', 'Red on black, keeps night vision', () => scheme(0x7a0a06, 0xffecea, 0xc4170f), () => scheme(0xff3b30, 0x000000, 0xff3b30)],
  GameBoy: ['Pocket console', 'Developer', 'Four greens', () => scheme(0x0f380f, 0x9bbc0f, 0x306230), () => scheme(0x9bbc0f, 0x0f380f, 0x8bac0f)],
  Commodore: ['8-bit blue', 'Developer', 'Light blue on dark blue', () => scheme(0x2a2aa8, 0xdcdcff, 0x4040e0), () => scheme(0xd4d4ff, 0x2b2b9e, 0xa5a5ff)],
  Cyberpunk: ['Neon', 'Developer', 'Yellow, cyan and pink on black', () => scheme(0x1a1a2e, 0xfffbd1, 0xd6008f), () => scheme(0xfcee0a, 0x0b0b12, 0x00f0ff)],
  Bubblegum: ['Bubblegum', 'Developer', 'Very pink', () => scheme(0x5a0f3a, 0xffd6ec, 0xff4fa3), () => scheme(0xffd6ec, 0x3a0b26, 0xff6fb5)],
  Diner: ['Ketchup & mustard', 'Developer', 'A roadside diner', () => scheme(0x1a1a1a, 0xfff4d6, 0xd62828), () => scheme(0xffe08a, 0x2a0e0e, 0xff5a4a)],
  PunchCard: ['Punch card', 'Developer', 'Manila card, red rules', () => scheme(0x1e1a14, 0xebddb8, 0xb3261e), () => scheme(0xebddb8, 0x241e16, 0xe0645a)],
  Desktop: ['Teal desktop', 'Developer', 'A 1995 desktop', () => scheme(0x000000, 0x2aa3a3, 0x000080), () => scheme(0x7fe0e0, 0x001e1e, 0x5fd7d7)],
  Syntax: ['Syntax', 'Developer', 'Recipes highlighted like code', () => vsLight(), () => vsDark()],
  SyntaxLight: ['Syntax light', 'Developer', 'Code highlighting on white', () => vsDark(), () => vsLight()],
  Monokai: ['Monokai', 'Developer', 'Code highlighting, warm and loud', () => code(0x272822, 0xfafaf5, 0x5e8c00, 0x7a3fd1, 0x0f8fad, 0xc45a00, 0x8a7a00, 0x8f8a75, 0xd0105a), () => code(0xf8f8f2, 0x272822, 0xa6e22e, 0xae81ff, 0x66d9ef, 0xfd971f, 0xe6db74, 0x75715e, 0xf92672)],
  Dracula: ['Night code', 'Developer', 'Code highlighting, purple', () => code(0x1f1f2e, 0xfffbeb, 0x644ac9, 0x644ac9, 0x036a96, 0xcb3a2a, 0x846e15, 0x635d97, 0xa3144d), () => code(0xf8f8f2, 0x282a36, 0xbd93f9, 0xbd93f9, 0x8be9fd, 0xff5555, 0xf1fa8c, 0x6272a4, 0xff79c6)],
  SolarizedDark: ['Solarized dark', 'Developer', 'Code highlighting, low contrast', () => solLight(), () => solDark()],
  SolarizedLight: ['Solarized light', 'Developer', 'Code highlighting, cream', () => solDark(), () => solLight()],
  Nord: ['Arctic', 'Developer', 'Code highlighting, icy blues', () => code(0x2e3440, 0xeceff4, 0x5e81ac, 0x8a5c82, 0x4c8c8a, 0xbf616a, 0x9a7a2c, 0x7b88a1, 0x5e81ac), () => code(0xeceff4, 0x2e3440, 0x88c0d0, 0xb48ead, 0x8fbcbb, 0xbf616a, 0xebcb8b, 0x616e88, 0x81a1c1)],
};
const vsDark = () => code(0xd4d4d4, 0x1e1e1e, 0x569cd6, 0xb5cea8, 0x4ec9b0, 0xf48771, 0xdcdcaa, 0x6a9955, 0xc586c0);
const vsLight = () => code(0x24292f, 0xffffff, 0x0969da, 0x0550ae, 0x116329, 0xcf222e, 0x953800, 0x6e7781, 0x8250df);
const solDark = () => code(0x93a1a1, 0x002b36, 0x268bd2, 0x2aa198, 0x859900, 0xdc322f, 0xb58900, 0x586e75, 0xd33682);
// On the cream side the cyan, green and yellow are taken a shade darker so they read.
const solLight = () => code(0x586e75, 0xfdf6e3, 0x268bd2, 0x1f7f78, 0x667600, 0xdc322f, 0x8f6b00, 0x93a1a1, 0xd33682);
export const paletteGroups = ['Black & white', 'Warm', 'Cool', 'Green'];
export const devGroup = 'Developer';

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
/** Programmer casings (Case-Sensitive Casserole, in Developer Recipes). */
export const devCasings = { Snake: 'snake_case', Camel: 'camelCase', Pascal: 'PascalCase', Kebab: 'kebab-case', Screaming: 'SCREAMING_SNAKE', Sponge: 'sPoNgEcAsE' };
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
  if (mode === 'Title') return titleCase(text);
  // A programmer casing keeps the spaces around a name, so "Books " doesn't run into the next word.
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  const words = text.replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
  const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  let out;
  switch (mode) {
    case 'Snake': out = words.map((w) => w.toLowerCase()).join('_'); break;
    case 'Kebab': out = words.map((w) => w.toLowerCase()).join('-'); break;
    case 'Screaming': out = words.map((w) => w.toUpperCase()).join('_'); break;
    case 'Camel': out = words.map((w, i) => (i ? cap(w.toLowerCase()) : w.toLowerCase())).join(''); break;
    case 'Pascal': out = words.map((w) => cap(w.toLowerCase())).join(''); break;
    case 'Sponge': { let up = false; out = text.trim().replace(/\p{L}/gu, (c) => { up = !up; return up ? c.toLowerCase() : c.toUpperCase(); }); break; }
    default: return text;
  }
  return out ? lead + out + tail : text;
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
