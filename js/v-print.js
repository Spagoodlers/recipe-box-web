// Print or save as PDF: style, colours, paper and orientation, what to go in, with a preview the
// shape of the paper. Each recipe prints at its own scale and units; a chef can set one batch size
// for the whole job.

import { box, settings, ui, views, actions, esc, plural, btn, notice, back, paged, wide, draw, saveSettings, allows, backBar, toggle } from './core.js';
import { printHtml, copyHtml, STYLES, PAPERS, SUB_MODES, paperPx, upgradeOptions } from './print.js';
import { withSubRecipes } from './kitchen.js';
import { palettes, devGroup } from './look.js';

const opts = () => (settings.print = upgradeOptions(settings.print || {}));
function setOpt(patch) { Object.assign(opts(), patch); saveSettings(); draw(); }

/** The job's items, scaled to the batch size when one is set. */
function itemsNow() {
  const job = ui.print;
  const serves = parseInt(ui.printBatch, 10);
  if (!(serves >= 1 && serves <= 9999)) return job.items;
  return job.items.map((i) => (i.recipe.servings ? { ...i, factor: serves / i.recipe.servings } : i));
}

views.print = () => {
  const job = ui.print;
  if (!job) return views.books();
  const o = opts();
  const pro = allows('ProPrint');
  const html = printHtml(box, itemsNow(), o, job.extra);
  ui.printHtml = html;
  const subs = job.items.reduce((n, i) => n + withSubRecipes(box, i.recipe).length - 1, 0);
  const hasNutrition = job.items.some((i) => i.recipe.nutrition.length);
  const roll = !!PAPERS[o.paper][3];
  const chips = (key, entries, filter = () => true) => `<div class="flow a">${entries.filter(filter).map(([k, l]) => btn('print-opt', l, { cls: 'small', on: o[key] === k, attrs: `data-key="${key}" data-v="${esc(k)}"`, icon: false })).join('')}</div>`;
  const flag = (key, label, about = '') => toggle(key, label, about, o[key], 'print-flag');
  const serves = parseInt(ui.printBatch, 10);
  const options = `
    ${pro ? `<div class="a bar"><b>Batch: serves</b><input class="field" id="batch" style="width:7em" inputmode="numeric" maxlength="4" placeholder="as set" value="${esc(ui.printBatch || '')}">${serves > 0 ? btn('batch-clear', 'As set', { cls: 'small', icon: false }) : ''}</div>
      <p class="dim small a" style="margin:2px 0 0">${serves > 0 ? `Every recipe with servings is scaled to ${serves}.` : 'Type a number to scale every recipe here to feed that many.'}</p>` : ''}
    <div class="label a">Style</div>
    ${chips('style', Object.entries(STYLES).map(([k, [l]]) => [k, l]), ([k]) => pro || k === o.style || (k !== 'Pro' && k !== 'Scroll'))}
    <p class="dim small a" style="margin:2px 0">${esc(STYLES[o.style][1])}</p>
    <div class="label a">Paper</div>
    ${chips('paper', Object.entries(PAPERS).map(([k, [l]]) => [k, l]), ([k, l]) => pro || k === o.paper || (!PAPERS[k][3] && !['Legal', 'Tabloid', 'A3'].includes(k)))}
    ${roll ? '' : `<div class="row-btns a">${btn('print-orient', 'Portrait', { cls: 'small', on: !o.landscape, attrs: 'data-v="0"', icon: false })}${btn('print-orient', 'Landscape', { cls: 'small', on: o.landscape, attrs: 'data-v="1"', icon: false })}</div>`}
    <div class="label a">Colours</div>
    ${chips('palette', Object.entries(palettes).filter(([, d]) => d[1] !== devGroup).map(([k, d]) => [k, d[0]]))}
    <div class="label a">Text</div>
    <div class="row-btns a">${['S', 'M', 'L'].map((l, i) => btn('print-opt', l, { cls: 'small', on: o.textSize === i, attrs: `data-key="textSize" data-v="${i}"`, icon: false })).join('')}${btn('print-serif', 'Sans', { cls: 'small', on: !o.serif, attrs: 'data-v="0"', icon: false })}${btn('print-serif', 'Serif', { cls: 'small', on: o.serif, attrs: 'data-v="1"', icon: false })}</div>
    ${flag('subRecipes', subs ? `Sub-recipes (${subs})` : 'Sub-recipes (none linked)')}
    ${o.subRecipes && subs ? `${chips('subMode', Object.entries(SUB_MODES).map(([k, [l]]) => [k, l]))}<p class="dim small a" style="margin:0">${esc(SUB_MODES[o.subMode][1])}</p>` : ''}
    ${job.items.length > 1 && !roll ? flag('pagePerRecipe', 'Each recipe on a new page') : ''}
    ${roll ? '' : flag('keepTogether', 'Keep things whole across pages', 'Lists, notes, tables and short sub-recipes move to the next page rather than split.')}
    ${flag('notes', 'Notes')}${flag('info', 'Times, servings and source')}
    ${flag('nutrition', hasNutrition ? 'Nutrition facts' : 'Nutrition facts (none on these cards)')}
    ${flag('checkboxes', 'Boxes to tick')}${flag('stepAmounts', 'Amounts under each step')}
    ${flag('rating', 'A rating to fill in (☆☆☆☆☆, made on …)')}${flag('writeLines', 'Lines for handwritten notes')}
    <p class="dim small a">Printed at each card’s scale and units; sub-recipes at their own. To make a file to send, pick “Save as PDF” as the printer. Long recipes run onto more pages; lines never split across a page. Copy HTML copies the page as it looks here.</p>`;
  const paper = paperPx(o);
  const meta = `${plural(job.items.length, 'recipe')}${o.subRecipes && subs ? ` + ${plural(subs, 'sub-recipe')}` : ''} · ${PAPERS[o.paper][0]}${o.landscape && !roll ? ', landscape' : ''}`;
  const preview = `<div class="paperbox" id="paperbox"><iframe class="paper" id="paper" title="Print preview" sandbox="allow-same-origin" style="width:${paper.w}px;height:${paper.roll ? 2000 : paper.h}px"></iframe></div><div class="dim small">${esc(meta)}</div>`;
  const buttons = `<div class="row-btns">${btn('do-print', 'Print or save PDF', { g: 'print', cls: 'grow primary', icon: false })}${btn('copy-html', 'Copy HTML', { g: 'clip', icon: false })}</div>`;
  return {
    html: wide()
      ? `<div class="printview"><div class="pane preview-pane">${preview}</div><div class="pane"><div class="pages" id="pg-print"><div class="content">${options}</div></div><div class="count" data-for="pg-print"></div>${buttons}</div></div>${backBar(`Print · ${job.title}`)}`
      : `<div class="preview-top">${preview}</div><div class="pages" id="pg-print"><div class="content">${options}</div></div><div class="count" data-for="pg-print"></div>${buttons}${backBar(`Print · ${job.title}`)}`,
    mount(el) {
      paged(el, 'print', { viewport: el.querySelector('#pg-print') });
      const frame = el.querySelector('#paper');
      // On screen there are no page margins, so the preview gets some.
      frame.srcdoc = html.replace('<body>', '<body style="padding:24px">');
      const fit = () => {
        const boxEl = el.querySelector('#paperbox');
        if (!boxEl) return;
        const s = Math.min(boxEl.clientWidth / paper.w, paper.roll ? 1 : boxEl.clientHeight / paper.h);
        frame.style.transform = `scale(${s})`;
        frame.style.height = `${paper.roll ? boxEl.clientHeight / s : paper.h}px`;
        frame.style.marginLeft = `${Math.max(0, (boxEl.clientWidth - paper.w * s) / 2)}px`;
      };
      fit();
      new ResizeObserver(fit).observe(el.querySelector('#paperbox'));
      el.querySelector('#batch')?.addEventListener('input', (e) => {
        ui.printBatch = e.target.value.replace(/\D/g, '').slice(0, 4);
        clearTimeout(ui.batchSoon);
        ui.batchSoon = setTimeout(() => { draw(); const b = document.getElementById('batch'); b?.focus(); b?.setSelectionRange(b.value.length, b.value.length); }, 400);
      });
    },
  };
};

actions['print-opt'] = (el) => {
  const k = el.dataset.key;
  const v = /^\d+$/.test(el.dataset.v) ? +el.dataset.v : el.dataset.v;
  const o = opts();
  if (k === 'style') setOpt({ style: v, paper: STYLES[v][2], landscape: false });
  else if (k === 'paper') setOpt({ paper: v, style: PAPERS[v][3] ? 'Scroll' : o.style === 'Scroll' ? 'Sheet' : o.style });
  else setOpt({ [k]: v });
};
actions['print-flag'] = (el) => setOpt({ [el.dataset.key]: !opts()[el.dataset.key] });
actions['print-orient'] = (el) => setOpt({ landscape: el.dataset.v === '1' });
actions['print-serif'] = (el) => setOpt({ serif: el.dataset.v === '1' });
actions['batch-clear'] = () => { ui.printBatch = ''; draw(); };
actions['do-print'] = () => {
  // A page of its own, without the preview's margins, handed to the browser's print dialog.
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.srcdoc = ui.printHtml;
  f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
};
actions['copy-html'] = async () => {
  try { await copyHtml(ui.printHtml); notice(`Copied the HTML for ${ui.print.title}.`); } catch { notice('The browser didn’t allow copying.'); }
};

export { back };
