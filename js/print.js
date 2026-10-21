// Printouts, as the phone makes them: five styles (a kitchen sheet, a ruled note card, a pro
// kitchen prep sheet, large print, a receipt-printer scroll), paper sizes from index cards to
// tabloid, the scheme's colours, sub-recipes on their own page, following on, or merged in, and
// "keep things whole across pages". One self-contained HTML page; the browser prints it or saves
// it as a PDF.

import { scale, convert, convertTemps, ingredientsInStep, formatMinutes, formatAmount } from './units.js';
import { withSubRecipes } from './kitchen.js';
import { palette, colourOf, palettes } from './look.js';

export const STYLES = {
  Sheet: ['Kitchen sheet', 'A full page: ingredients beside the method. Pins up on the fridge.', 'Letter'],
  Card: ['Note card', 'A ruled index card, like the ones in a recipe tin.', 'Card4x6'],
  Pro: ['Pro kitchen', 'A prep sheet for a commercial kitchen: quantities in a column, boxes to tick, batch size and sign-off.', 'Letter'],
  Large: ['Large print', 'Big type, lots of space. Easy to read from across the counter.', 'Letter'],
  Scroll: ['Scroll', 'One long strip for a thermal receipt printer: everything in a single narrow column.', 'Scroll80'],
};
/** Paper sizes: [label, width, height (inches), a receipt roll]. */
export const PAPERS = {
  Letter: ['Letter', 8.5, 11], Legal: ['Legal', 8.5, 14], Tabloid: ['Tabloid', 11, 17], A4: ['A4', 8.27, 11.69], A3: ['A3', 11.69, 16.54], A5: ['A5', 5.83, 8.27],
  Card3x5: ['5×3 card', 3, 5], Card4x6: ['4×6 card', 4, 6], Card5x8: ['5×8 card', 5, 8],
  Scroll80: ['Scroll 80 mm', 3.15, 78.74, true], Scroll58: ['Scroll 58 mm', 2.283, 78.74, true],
};
export const SUB_MODES = {
  Separate: ['Own page', 'Each sub-recipe on a page (or card) of its own.'],
  Follow: ['Same sheet', 'Sub-recipes follow on after the recipe, no page break.'],
  Merge: ['Merged', 'One recipe: the sub-recipes’ ingredients and steps folded in, under their own headings.'],
};

export const printDefaults = {
  style: 'Sheet', palette: 'Ink', paper: 'Letter', landscape: false, subRecipes: true, subMode: 'Separate', notes: true, info: true,
  checkboxes: false, stepAmounts: false, nutrition: false, rating: false, writeLines: false, pagePerRecipe: true, textSize: 1, serif: false, keepTogether: true,
};

/** Options remembered from before the full set (kitchen sheet / large print, letter / A4). */
export function upgradeOptions(o) {
  const out = { ...printDefaults, ...o };
  if (o.style === 'sheet') out.style = 'Sheet';
  if (o.style === 'large') out.style = 'Large';
  if (o.paper === 'letter') out.paper = 'Letter';
  if (o.paper === 'a4') out.paper = 'A4';
  if (o.size != null && o.textSize == null) out.textSize = o.size;
  if (o.boxes != null && o.checkboxes == null) out.checkboxes = o.boxes;
  if (!STYLES[out.style]) out.style = 'Sheet';
  if (!PAPERS[out.paper]) out.paper = 'Letter';
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const totalOf = (r) => r.totalMin ?? (r.prepMin != null || r.cookMin != null ? (r.prepMin || 0) + (r.cookMin || 0) : null);

/** Ink and dim for print, from a scheme's light side (paper stays white). */
function printColours(name) {
  if (!palettes[name] || palettes[name][1] === 'Black & white') return ['#000000', '#555555'];
  const p = palette(name, false);
  return [colourOf(p, 'accent'), colourOf(p, 'dim')];
}

/** A recipe with its sub-recipes folded in: their ingredients and steps under their own headings. */
function merged(main, subs) {
  if (!subs.length) return main;
  const plain = (xs) => xs.filter((l) => !l.startsWith('## '));
  return {
    ...main,
    ingredients: [`## ${main.title}`, ...plain(main.ingredients), ...subs.flatMap((s) => [`## For the ${s.title.toLowerCase()}`, ...plain(s.ingredients)])],
    steps: [...subs.flatMap((s) => [`## Make the ${s.title.toLowerCase()}`, ...plain(s.steps)]), `## ${main.title}`, ...plain(main.steps)],
    notes: [main.notes, ...subs.map((s) => (s.notes ? `${s.title}: ${s.notes}` : ''))].filter(Boolean).join('\n'),
  };
}

/** The paper's size in CSS pixels (96 to the inch), turned for landscape. */
export function paperPx(o) {
  const [, w, h, roll] = PAPERS[o.paper];
  const [a, b] = o.landscape && !roll ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
  return { w: Math.round(a * 96), h: Math.round(b * 96), roll: !!roll, ratio: roll ? 0.6 : a / b };
}

/**
 * The printout as one HTML page: `extra` first (a meal plan), then each item at its own scale and
 * units; sub-recipes at their own, as `subMode` says. `lib` resolves sub-recipe links.
 */
export function printHtml(lib, items, o, extra = null) {
  o = upgradeOptions(o);
  const roll = !!PAPERS[o.paper][3];
  const [accent, dim] = printColours(o.palette);
  const base = ({ Card: 9.5, Large: 18, Scroll: o.paper === 'Scroll58' ? 8.5 : 10 }[o.style] ?? 12) * [0.85, 1, 1.2][Math.max(0, Math.min(2, o.textSize))];
  const font = o.style === 'Scroll' ? "'Courier New', monospace" : o.serif ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif";

  // Every recipe once, with what it's for.
  const seen = new Set();
  const sections = items.flatMap((item) => {
    if (!o.subRecipes) {
      if (seen.has(item.recipe.id)) return [];
      seen.add(item.recipe.id);
      return [{ recipe: item.recipe, parent: null, item }];
    }
    const tree = withSubRecipes(lib, item.recipe, seen);
    if (!tree.length) return [];
    if (o.subMode === 'Merge') return [{ recipe: merged(tree[0][0], tree.slice(1).map(([r]) => r)), parent: null, item }];
    return tree.map(([r, p]) => ({ recipe: r, parent: p, item }));
  });

  const section = ({ recipe: rec, parent, item }, first) => {
    const f = parent ? 1 : item.factor;
    const units = item.units;
    const times = [rec.prepMin && `Prep ${formatMinutes(rec.prepMin)}`, rec.cookMin && `Cook ${formatMinutes(rec.cookMin)}`, totalOf(rec) && `Total ${formatMinutes(totalOf(rec))}`,
      rec.servings ? `Serves ${formatAmount(rec.servings * f)}` : rec.yieldText].filter(Boolean).join(' · ');
    const ing = (line) => convert(scale(line, f), units);
    const box = o.checkboxes ? '<span class=box></span>' : '';
    let ingredients;
    if (o.style === 'Pro') {
      // A prep list: quantity in its own column, a box to tick.
      ingredients = '<table class=prep><tr><th class=q>Qty</th><th>Ingredient</th><th class=t>✓</th></tr>';
      for (const line of rec.ingredients) {
        if (line.startsWith('## ')) { ingredients += `<tr><td colspan=3 class=sub>${esc(line.slice(3))}</td></tr>`; continue; }
        const text = ing(line);
        // "2½ cups flour" → "2½ cups" | "flour"; lines without an amount keep it all.
        const m = /^([\d½¼¾⅓⅔⅛⅜⅝⅞/.,\s–-]+(?:[a-zA-Z]{1,6}\.?)?)\s+(.*)$/.exec(text);
        const amount = m?.[1]?.trim();
        let [q, rest] = amount && /[\d½¼¾⅓⅔⅛⅜⅝⅞]/.test(amount) ? [amount, m[2]] : ['', text];
        // "1 can | (28 oz) tomatoes": the size belongs with the quantity.
        const size = q && /^(\([^)]*\))\s+(.*)$/.exec(rest);
        if (size) { q = `${q} ${size[1]}`; rest = size[2]; }
        ingredients += `<tr><td class=q>${esc(q)}</td><td>${esc(rest)}</td><td class=t><span class=box></span></td></tr>`;
      }
      ingredients += '</table>';
    } else {
      ingredients = '<ul class=ing>';
      for (const line of rec.ingredients) ingredients += line.startsWith('## ') ? `</ul><h3>${esc(line.slice(3))}</h3><ul class=ing>` : `<li>${box}${esc(ing(line))}</li>`;
      ingredients += '</ul>';
    }
    let method = '<ol class=steps>';
    for (const line of rec.steps) {
      if (line.startsWith('## ')) { method += `</ol><h3>${esc(line.slice(3))}</h3><ol class=steps>`; continue; }
      method += `<li>${box}${esc(convertTemps(line, units))}`;
      if (o.stepAmounts) {
        const used = ingredientsInStep(line, rec.ingredients);
        if (used.length) method += `<div class=amt>${used.map((i) => esc(ing(rec.ingredients[i]))).join(' · ')}</div>`;
      }
      method += '</li>';
    }
    method += '</ol>';
    const head = [!parent && item.heading, parent && `Sub-recipe · for ${parent.title}`, f !== 1 && o.style === 'Pro' && `Batch ×${formatAmount(f)}`].filter(Boolean).join(' · ');
    const source = [rec.sourceName, rec.sourceUrl, rec.author && `by ${rec.author}`].filter(Boolean).join(' · ');
    const nutrition = o.nutrition && rec.nutrition.length
      ? `<h2>Nutrition facts</h2><table class=nut>${rec.nutrition.map((l) => { const [k, ...v] = l.split(':'); return `<tr><td>${esc(k.trim())}</td><td class=v>${esc(v.join(':').trim())}</td></tr>`; }).join('')}</table><div class=src>Per serving${rec.id.startsWith('starter-') ? ' · estimated' : ''}</div>` : '';
    // A new page for each recipe (and each separate sub-recipe), unless asked to run on.
    const breakBefore = !first && !roll && ((!parent && o.pagePerRecipe) || (parent && o.subMode === 'Separate') || o.style === 'Card');
    return `<section class="${parent ? 'subr' : 'main'}"${breakBefore ? ' style="page-break-before:always"' : ''}>
      ${head ? `<div class=for>${esc(head)}</div>` : ''}<h1>${esc(rec.title)}</h1>
      ${o.info && times ? `<div class=meta>${esc(times)}</div>` : ''}
      <div class=body><div class=col1><h2>Ingredients</h2>${ingredients}</div><div class=col2><h2>Method</h2>${method}</div></div>
      ${o.notes && rec.notes ? `<h2>Notes</h2><p class=notes>${esc(rec.notes).replace(/\n/g, '<br>')}</p>` : ''}
      ${nutrition}
      ${o.rating ? '<div class=rate>Rating &nbsp;☆ ☆ ☆ ☆ ☆ &nbsp;&nbsp; Made on ____________</div>' : ''}
      ${o.writeLines ? `<div class=lines>${'<div></div>'.repeat(5)}</div>` : ''}
      ${o.info && source ? `<div class=src>${esc(source)}</div>` : ''}
      ${o.style === 'Pro' && !parent ? `<div class=sign>Prepared by ________________ &nbsp; Date ${new Date().toLocaleDateString()} &nbsp; Checked ________________</div>` : ''}
    </section>`;
  };

  // Two columns as a table: it flows onto more pages cleanly, unlike flex.
  const twoCol = 'display:table; width:100%; table-layout:fixed; border-spacing:0;';
  const styleCss = {
    Sheet: `@page { margin: 16mm; } h1 { font-size: 1.7em; margin: 0 0 3pt; color: ${accent}; } h2 { font-size: 1.1em; border-bottom: 1.5pt solid ${accent}; margin: 12pt 0 5pt; }
      .body { ${twoCol} } .col1 { display:table-cell; width: 38%; padding-right: 16pt; vertical-align: top; } .col2 { display:table-cell; vertical-align: top; }`,
    Card: `@page { margin: 5mm; } section { border: 1.2pt solid ${dim}; padding: 6pt 9pt; } h1 { font-size: 1.5em; margin: 0 0 2pt; padding-bottom: 3pt; border-bottom: 2pt solid ${accent}; }
      h2 { font-size: 0.95em; text-transform: uppercase; letter-spacing: 1pt; color: ${accent}; margin: 6pt 0 2pt; } li { border-bottom: 0.6pt solid #9BB7D4; padding: 1pt 0; }
      .body { ${twoCol} } .col1 { display:table-cell; width: 40%; padding-right: 10pt; vertical-align: top; } .col2 { display:table-cell; vertical-align: top; }`,
    Pro: `@page { margin: 12mm; } h1 { font-size: 1.8em; margin: 0; padding: 4pt 8pt; background: ${accent}; color: #fff; text-transform: uppercase; letter-spacing: 1pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h2 { font-size: 1em; text-transform: uppercase; letter-spacing: 1pt; border-bottom: 2pt solid #000; margin: 10pt 0 4pt; } .meta { font-weight: bold; padding: 3pt 8pt; border: 1pt solid #000; border-top: none; }
      table.prep { width: 100%; border-collapse: collapse; } table.prep td, table.prep th { border: 0.8pt solid #000; padding: 3pt 5pt; text-align: left; vertical-align: top; }
      th { background: #eee; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .q { width: 22%; font-weight: bold; white-space: nowrap; } .t { width: 8%; text-align: center; }
      td.sub { font-weight: bold; background: #f3f3f3; } ol.steps li { padding: 3pt 0; border-bottom: 0.6pt dashed #999; } .sign { margin-top: 14pt; border-top: 1pt solid #000; padding-top: 5pt; font-size: 0.9em; }`,
    Large: `@page { margin: 14mm; } h1 { font-size: 1.6em; margin: 0 0 4pt; color: ${accent}; } h2 { font-size: 1.15em; border-bottom: 2pt solid ${accent}; margin: 16pt 0 6pt; } li { margin: 7pt 0; line-height: 1.35; }`,
    Scroll: `@page { margin: 2mm; } section { border-top: 1pt dashed #000; padding-top: 6pt; margin-top: 8pt; } h1 { font-size: 1.3em; text-align: center; text-transform: uppercase; margin: 2pt 0; }
      h2 { font-size: 1em; text-transform: uppercase; margin: 8pt 0 2pt; border-bottom: 1pt dashed #000; } .meta, .for { text-align: center; } ol.steps { padding-left: 1.6em; }`,
  }[o.style];
  const keep = o.keepTogether && !roll ? `
    ul.ing, table.prep, table.nut, .notes, .rate, .lines, .sign, .meta, .src, h1 + .meta, .plan table, section.subr { page-break-inside: avoid; break-inside: avoid; }
    section.main > h1, .col1 > h2, .col2 > h2 { page-break-after: avoid; break-after: avoid; }
    section.main .body { orphans: 4; widows: 3; } p, li, td { orphans: 2; widows: 2; }` : '';
  const { w, h } = paperPx(o);
  const title = items.map((i) => i.recipe.title).join(', ');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: ${w / 96}in ${h / 96}in; }
    body { font-family: ${font}; color: #111; margin: 0; font-size: ${base.toFixed(1)}pt; line-height: 1.3; background: #fff; }
    h3 { font-size: 1em; margin: 6pt 0 2pt; color: ${dim}; }
    ul.ing { list-style: none; padding: 0; margin: 0; } ul.ing li { margin: 2pt 0; }
    ol.steps { padding-left: 1.4em; margin: 0; } ol.steps li { margin: 3pt 0; }
    li, tr, .rate, .lines div { page-break-inside: avoid; break-inside: avoid; } h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
    .meta { margin-bottom: 4pt; color: ${dim}; } .for { font-size: 0.8em; text-transform: uppercase; letter-spacing: 1pt; color: ${dim}; }
    .amt { font-size: 0.85em; color: ${dim}; margin-top: 1pt; }
    .box { display: inline-block; width: 0.75em; height: 0.75em; border: 1pt solid #000; margin-right: 0.45em; vertical-align: -0.05em; }
    .notes { margin: 0; } .src { margin-top: 8pt; font-size: 0.75em; color: ${dim}; }
    table.nut { border-collapse: collapse; min-width: 50%; } table.nut td { border-bottom: 0.6pt solid #999; padding: 2pt 8pt 2pt 0; } table.nut td.v { font-weight: bold; text-align: right; }
    .rate { margin-top: 10pt; font-size: 1.05em; } .lines div { border-bottom: 0.6pt solid #999; height: 1.6em; }
    .plan { page-break-after: always; } @media screen { .plan { border-bottom: 1pt dashed #999; margin-bottom: 14pt; padding-bottom: 8pt; } } .plan h1 { color: ${accent}; } .plan h2 { border-bottom: 1.5pt solid ${accent}; }
    .plan table { width: 100%; border-collapse: collapse; } .plan td, .plan th { border: 0.6pt solid #999; padding: 3pt 5pt; text-align: left; vertical-align: top; }
    ${roll ? '.plan { page-break-after: auto; } .plan table, .plan tbody, .plan tr, .plan td { display: block; width: auto; border: 0; padding: 0; } .plan tr:first-child { display: none; } .plan tr { border-bottom: 0.6pt dashed #999; padding: 3pt 0; } .plan td:nth-child(3) { font-weight: bold; }' : ''}
    ${styleCss}${keep}
  </style></head><body>${extra || ''}${sections.map((s, i) => section(s, i === 0)).join('\n')}</body></html>`;
}

/** Copies the page as HTML, with plain text for apps that only take text. */
export async function copyHtml(html) {
  const text = new DOMParser().parseFromString(html.replace(/<style[\s\S]*?<\/style>/g, ''), 'text/html').body.innerText.trim();
  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
  } else {
    await navigator.clipboard.writeText(html);
  }
}
