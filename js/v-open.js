// Open: what's cooking. Each card kept open as an index card, how far along it is, its sub-recipes
// hanging under it as tabs, and the timers. Done moves a recipe down to Complete.

import { box, ui, views, actions, holds, session, esc, btn, notice, go, paged, cardHash } from './core.js';
import { openRecipes, openChildren, minutesLeft, setKeep, setComplete } from './ops.js';
import { formatMinutes } from './units.js';
import { effectiveTotal } from './kitchen.js';
import { timerBarHtml } from './v-card.js';

views.open = () => {
  const open = openRecipes();
  const nested = new Set();
  const walk = (r, depth) => { if (depth > 6) return; for (const c of openChildren(r)) if (!nested.has(c.id)) { nested.add(c.id); walk(c, depth + 1); } };
  open.forEach((r) => walk(r, 0));
  const tops = open.filter((r) => !nested.has(r.id));
  const list = tops.length ? tops : open;
  const done = list.filter((r) => session(r).complete);
  const active = list.filter((r) => !session(r).complete);
  ui.focusCard = active[0] || null;
  const left = minutesLeft(active);
  return {
    tab: 'open',
    html: `<div class="pages"><div class="content">
      ${ui.timers.length ? `<div class="label a keep">Timers</div><div class="a">${timerBarHtml()}</div>` : ''}
      ${!open.length ? `<div class="a"><div class="title">Nothing open.</div><p class="dim">Tap Keep on a card to keep it open here while you cook: your place, ticks and timers stay put.</p></div>` : `
        <div class="bar a keep"><div class="label grow" style="margin:0">Cooking · ${active.length}</div>${left > 0 ? `<b>About ${formatMinutes(left)} to go</b>` : ''}</div>
        ${left > 0 ? '<p class="dim small a" style="margin:0 0 6px">A good-faith estimate from the recipes’ times and their sub-recipes, less the steps you’ve ticked and anything done.</p>' : ''}
        <div class="open-grid">${active.map(openCard).join('')}</div>
        ${done.length ? `<div class="label a keep" style="margin-top:12px">Complete · ${done.length}</div>${done.map(completeRow).join('')}` : ''}`}
    </div></div><div class="count"></div>
    ${open.length ? `<div class="row-btns">${btn('open-print', 'Print all', { g: 'print', cls: 'small' })}${done.length ? btn('open-putaway', 'Put complete away', { cls: 'small', icon: false }) : ''}</div>` : ''}`,
    mount(el) { paged(el, 'open'); },
  };
};

/** An open recipe as an index card, with its sub-recipes as tabs underneath. */
function openCard(r) {
  const s = session(r);
  const ingredients = r.ingredients.filter((l) => !l.startsWith('## ')).length;
  const steps = r.steps.filter((l) => !l.startsWith('## ')).length;
  const ticked = s.checked.size + s.done.size;
  const all = ingredients + steps;
  const allTicked = all > 0 && ticked >= all;
  const tabs = [];
  const walk = (x, depth, seen) => {
    if (depth > 5) return;
    for (const c of openChildren(x).filter((c) => !seen.has(c.id))) { tabs.push([c, depth]); walk(c, depth + 1, new Set([...seen, c.id])); }
  };
  walk(r, 0, new Set([r.id]));
  return `<div class="a opencard-wrap" data-card="${esc(r.id)}">
    <div class="opencard" data-act="open-full" data-to="${esc(r.id)}">
      <div class="bar"><b class="grow rx nm clamp2 big-name">${esc(r.title)}</b>
        <button class="donebox ${allTicked ? 'ready' : ''}" data-act="open-done" data-to="${esc(r.id)}"><span class="sq"></span>${allTicked ? 'All ticked · Done' : 'Done'}</button></div>
      <div class="dim small">${[ingredients && `${s.checked.size}/${ingredients} got`, steps && `${s.done.size}/${steps} done`, effectiveTotal(r) && formatMinutes(effectiveTotal(r))].filter(Boolean).join('  ·  ')}</div>
      <div class="progress"><div style="width:${all ? (100 * ticked) / all : 0}%"></div></div>
      <div class="row-btns">${steps && !r.id.startsWith('dev-') ? btn('cook', 'Cook', { g: 'cook', cls: 'small' }) : ''}${btn('open-full', 'Open', { g: 'full', cls: 'small', attrs: `data-to="${esc(r.id)}"` })}${btn('open-away', 'Put away', { g: 'keep', cls: 'small on', attrs: `data-to="${esc(r.id)}"` })}</div>
    </div>
    ${tabs.length ? `<div class="subtabs">${tabs.map(([c, depth]) => `<button class="subtab ${session(c).complete ? 'complete' : ''}" data-act="open-full" data-to="${esc(c.id)}" data-hold="open-away" title="Hold to put it away"><span class="rx">${'›'.repeat(depth + 1)} ${esc(c.title)}${effectiveTotal(c) ? ` · ${formatMinutes(effectiveTotal(c))}` : ''}</span></button>`).join('')}</div>
      <div class="dim small" style="margin-left:14px">Tap a tab to open it · hold to put it away</div>` : ''}
  </div>`;
}

/** A finished recipe, at the bottom: tick again to bring it back, or put it away. */
function completeRow(r) {
  return `<div class="completerow a"><button class="sq on" data-act="open-undone" data-to="${esc(r.id)}" aria-label="Not done yet"></button>
    <button class="grow linkish rx" style="text-align:left" data-act="open-full" data-to="${esc(r.id)}"><s>${esc(r.title)}</s></button>${btn('open-away', 'Put away', { g: 'keep', cls: 'small on', attrs: `data-to="${esc(r.id)}"`, icon: true })}</div>`;
}

actions['open-full'] = (el) => go(cardHash(el.dataset.to));
actions['open-done'] = (el) => setComplete(box.find(el.dataset.to), true);
actions['open-undone'] = (el) => setComplete(box.find(el.dataset.to), false);
actions['open-away'] = (el) => { const r = box.find(el.dataset.to); setKeep(r, false); notice(`Put “${r.title}” away.`); };
holds['open-away'] = (el) => actions['open-away'](el);
actions['open-print'] = () => {
  const open = openRecipes();
  ui.print = { items: open.map((r) => ({ recipe: r, factor: session(r).factor, units: session(r).units })), title: 'Open recipes', extra: null };
  go('#/print');
};
actions['open-putaway'] = () => { for (const r of openRecipes().filter((x) => session(x).complete)) setKeep(r, false); };

