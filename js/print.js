// A recipe as a printed page: the phone's Kitchen sheet and Large print styles, with the same
// "keep things whole across pages" rules, as one self-contained HTML document.

import { scale, convert, convertTemps, ingredientsInStep, formatMinutes } from './units.js';

export const printDefaults = {
  style: 'sheet', paper: 'letter', size: 1, notes: true, info: true, boxes: false, stepAmounts: false, keepTogether: true, serif: false,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function printHtml(recipes, o, { factor = 1, units = 'AsWritten' } = {}) {
  const base = (o.style === 'large' ? [15, 17, 20] : [10, 11.5, 13])[o.size];
  const font = o.serif ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif";
  const box = o.boxes ? '<span class=box></span>' : '';
  const section = (r, first) => {
    const f = factor;
    const ing = (line) => convert(scale(line, f), units);
    const times = [
      r.prepMin ? `Prep ${formatMinutes(r.prepMin)}` : '',
      r.cookMin ? `Cook ${formatMinutes(r.cookMin)}` : '',
      r.totalMin || r.prepMin || r.cookMin ? `Total ${formatMinutes(r.totalMin || (r.prepMin || 0) + (r.cookMin || 0))}` : '',
      r.servings ? `Serves ${+(r.servings * f).toFixed(2)}` : r.yieldText || '',
    ].filter(Boolean).join(' · ');
    let ingredients = '<ul class=ing>';
    for (const line of r.ingredients) {
      ingredients += line.startsWith('## ') ? `</ul><h3>${esc(line.slice(3))}</h3><ul class=ing>` : `<li>${box}${esc(ing(line))}</li>`;
    }
    ingredients += '</ul>';
    let method = '<ol class=steps>';
    for (const line of r.steps) {
      if (line.startsWith('## ')) { method += `</ol><h3>${esc(line.slice(3))}</h3><ol class=steps>`; continue; }
      method += `<li>${box}${esc(convertTemps(line, units))}`;
      if (o.stepAmounts) {
        const used = ingredientsInStep(line, r.ingredients);
        if (used.length) method += `<div class=amt>${used.map((i) => esc(ing(r.ingredients[i]))).join(' · ')}</div>`;
      }
      method += '</li>';
    }
    method += '</ol>';
    const source = [r.sourceName, r.sourceUrl, r.author ? `by ${r.author}` : ''].filter(Boolean).join(' · ');
    return `<section class=main${first ? '' : ' style="page-break-before:always"'}>
      <h1>${esc(r.title)}</h1>
      ${o.info && times ? `<div class=meta>${esc(times)}</div>` : ''}
      <div class=body><div class=col1><h2>Ingredients</h2>${ingredients}</div><div class=col2><h2>Method</h2>${method}</div></div>
      ${o.notes && r.notes ? `<h2>Notes</h2><p class=notes>${esc(r.notes).replace(/\n/g, '<br>')}</p>` : ''}
      ${o.info && source ? `<div class=src>${esc(source)}</div>` : ''}
    </section>`;
  };
  const twoCol = o.style === 'sheet'
    ? '.body { display: table; width: 100%; table-layout: fixed; } .col1, .col2 { display: table-cell; vertical-align: top; } .col1 { width: 36%; padding-right: 14pt; }'
    : '';
  const keep = o.keepTogether ? `
    ul.ing, .notes, .meta, .src, h1 + .meta { page-break-inside: avoid; break-inside: avoid; }
    section > h1, .col1 > h2, .col2 > h2 { page-break-after: avoid; break-after: avoid; }
    section .body { orphans: 4; widows: 3; }
    p, li { orphans: 2; widows: 2; }` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(recipes.map((r) => r.title).join(', '))}</title><style>
    @page { size: ${o.paper === 'a4' ? 'A4' : 'letter'}; margin: 16mm; }
    body { font-family: ${font}; color: #111; margin: 0; font-size: ${base}pt; line-height: 1.3; }
    h1 { font-size: 1.9em; margin: 0 0 2pt; } h2 { font-size: 1.05em; text-transform: uppercase; letter-spacing: 1pt; border-bottom: 1pt solid #111; margin: 10pt 0 4pt; }
    h3 { font-size: 1em; margin: 6pt 0 2pt; color: #555; }
    ul.ing { list-style: none; padding: 0; margin: 0; } ul.ing li { margin: 2pt 0; }
    ol.steps { padding-left: 1.4em; margin: 0; } ol.steps li { margin: 3pt 0; }
    li { page-break-inside: avoid; break-inside: avoid; } h1, h2, h3 { page-break-after: avoid; break-after: avoid; }
    .meta { color: #555; margin-bottom: 4pt; } .amt { font-size: 0.85em; color: #555; } .notes { margin: 0; }
    .src { margin-top: 8pt; font-size: 0.75em; color: #555; }
    .box { display: inline-block; width: 0.75em; height: 0.75em; border: 1pt solid #000; margin-right: 0.45em; vertical-align: -0.05em; }
    ${twoCol}${keep}
  </style></head><body>${recipes.map((r, i) => section(r, i === 0)).join('\n')}</body></html>`;
}

/** Copies the page as HTML, with plain text for apps that only take text. */
export async function copyHtml(html) {
  const text = new DOMParser().parseFromString(html.replace(/<style[\s\S]*?<\/style>/g, ''), 'text/html').body.innerText.trim();
  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' }),
    })]);
  } else {
    await navigator.clipboard.writeText(html);
  }
}
