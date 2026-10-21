// The shopping list: grouped by the card each line came from (anything added by hand under Other,
// at the end), or all together A–Z. Tap a line to tick it; hold it (or ×) to take it off. Ticked
// lines sink to the bottom. Buying something the cupboard was low on puts it back in the cupboard.

import { box, ui, views, actions, holds, forms, esc, btn, notice, go, paged, draw, wide } from './core.js';
import { restocked, activeProfile } from './ops.js';
import { fold } from './units.js';

const OTHER = 'Other';

function groups() {
  const items = box.shopping;
  if (ui.listAZ) return [[null, [...items].sort((a, b) => a.done - b.done || fold(a.text).localeCompare(fold(b.text)))]];
  const by = new Map();
  for (const s of items) {
    const k = s.from || OTHER;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(s);
  }
  return [...by].sort((a, b) => (a[0] === OTHER) - (b[0] === OTHER)).map(([k, v]) => [k, [...v].sort((a, b) => a.done - b.done)]);
}

/** The list as text, by recipe (Other last), as it's sent or copied. */
function listText() {
  const by = new Map();
  for (const s of box.shopping.filter((x) => !x.done)) {
    const k = s.from || OTHER;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(s.text);
  }
  return [...by].sort((a, b) => (a[0] === OTHER) - (b[0] === OTHER)).map(([k, v]) => `${k}\n${v.map((t) => `• ${t}`).join('\n')}`).join('\n\n');
}

views.list = () => {
  const items = box.shopping;
  const left = items.filter((s) => !s.done).length;
  const line = (s) => `<li class="a ${s.done ? 'on' : ''}" role="checkbox" aria-checked="${s.done}" tabindex="0" data-act="shop" data-id="${s.id}" data-hold="shop-remove">
    <span class="box"></span><span class="txt" style="flex:1">${esc(s.text)}${ui.listAZ && s.from ? `<span class="from-small dim small nm rx">${esc(s.from)}</span>` : ''}</span>
    <button class="x" data-act="shop-remove" data-id="${s.id}" aria-label="Take ${esc(s.text)} off the list" title="Take off the list">×</button></li>`;
  return {
    tab: 'list',
    html: `<div class="listbox"><div class="pages"><div class="content ${wide() ? 'list-cols' : ''}">
      ${items.length ? `<div class="dim bold a keep list-head">${left === 0 ? 'All got.' : `${left} to get${items.length > left ? ` · ${items.length - left} got` : ''}`}</div>`
        : '<div class="a"><div class="title">Nothing on the list.</div><p class="dim">Type something below (milk, eggs, bread), or tap List on a card to add what it needs.</p></div>'}
      ${groups().map(([from, list]) => `<div class="group a">${from != null ? `<div class="from keep ${from === OTHER || from === 'Meal prep' || from === 'Cupboard' ? '' : 'rx'}">${esc(from)}</div>` : ''}<ul class="checks list rx">${list.map(line).join('')}</ul></div>`).join('')}
      ${items.length ? '<p class="small dim a">Tap to tick. Hold, right-click or × to take off the list.</p>' : ''}
    </div></div><div class="count"></div></div>
    <form class="search" data-form="add-shop"><input class="field" name="item" placeholder="Add to the list: milk, eggs…" autocomplete="off" aria-label="Add to the list">${btn('add-shop', 'Add', { g: 'plus', cls: 'primary', icon: false })}</form>
    <div class="row-btns">
      ${items.length ? `${btn('list-az', ui.listAZ ? 'A–Z' : 'By recipe', { cls: 'small', on: ui.listAZ, icon: false })}
        ${btn('clear-ticked', 'Clear ticked', { cls: 'small', disabled: !items.some((s) => s.done), icon: false })}
        ${btn('clear-all', ui.confirm === 'clear-all' ? 'Sure? Clear all' : 'Clear all', { cls: 'small', on: ui.confirm === 'clear-all', icon: false })}` : ''}
      ${btn('cupboard', 'Cupboard…', { cls: 'small', icon: false })}
      ${left ? `${btn('copy-list', 'Copy list', { g: 'clip', cls: 'small', icon: false })}${navigator.share ? btn('send-list', 'Send list', { g: 'share', cls: 'small', icon: true }) : ''}` : ''}
    </div>`,
    mount(el) { paged(el, 'list'); },
  };
};

actions.shop = (el, e) => {
  if (e?.target.closest('.x')) return;
  const item = box.shopping.find((s) => s.id === el.dataset.id);
  if (!item) return;
  box.toggleShopItem(item.id);
  // Bought something the cupboard was low on: it's back in.
  if (!item.done && item.from === 'Cupboard') restocked(item.text);
};
actions['shop-remove'] = (el) => {
  const item = box.shopping.find((s) => s.id === el.dataset.id);
  if (!item) return;
  box.removeShopItem(item.id);
  notice(`Took “${item.text}” off the list.`);
};
holds['shop-remove'] = (el) => actions['shop-remove'](el);
actions['add-shop'] = (el) => el.closest('form').requestSubmit();
actions['list-az'] = () => { ui.listAZ = !ui.listAZ; draw(); };
actions['clear-ticked'] = () => box.clearShopping(true);
actions['clear-all'] = () => {
  if (ui.confirm !== 'clear-all') { ui.confirm = 'clear-all'; draw(); return; }
  ui.confirm = null;
  box.clearShopping(false);
};
actions.cupboard = () => go(`#/cupboard/${encodeURIComponent(activeProfile().id)}`);
actions['copy-list'] = async () => {
  try { await navigator.clipboard.writeText(listText()); notice('Copied the list.'); } catch { notice('The browser didn’t allow copying.'); }
};
actions['send-list'] = async () => { try { await navigator.share({ title: 'Shopping list', text: listText() }); } catch { /* cancelled */ } };

forms['add-shop'] = (form, data) => {
  // "milk, eggs, bread" is three things.
  const lines = String(data.get('item') || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return;
  const n = box.addToShopping(lines, '');
  notice(n === 0 ? 'Already on the list.' : lines.length === 1 ? `Added ${lines[0]}.` : `Added ${n} to the list.`);
  setTimeout(() => document.querySelector('[name=item]')?.focus(), 0);
};
