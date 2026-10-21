import test from 'node:test';
import assert from 'node:assert/strict';
import { palette, palettes, paletteVars, contrast, highlight, applyCase, titleCase, toUs, defaultSpelling } from '../js/look.js';

test('every scheme, light and dark, reads', () => {
  for (const name of Object.keys(palettes)) {
    for (const dark of [false, true]) {
      const p = palette(name, dark);
      assert.ok(contrast(p.ink, p.paper) >= 4.5, `${name} ${dark ? 'dark' : 'light'} ink on paper`);
      assert.ok(contrast(p.onAccent, p.accent) >= 2.5, `${name} ${dark ? 'dark' : 'light'} text on accent`);
      for (const [k, v] of Object.entries(paletteVars(p))) assert.ok(v !== undefined && v !== 'NaN', `${name} ${k}`);
    }
  }
});

test('ink is pure black and white; ink only drops the colour', () => {
  assert.equal(paletteVars(palette('Ink', false))['--paper'], '#ffffff');
  assert.equal(paletteVars(palette('Ink', true))['--paper'], '#000000');
  const p = palette('Tomato', false, { accent: 'Ink' });
  assert.equal(paletteVars(p)['--accent'], paletteVars(p)['--ink']);
  assert.equal(paletteVars(palette('Tomato', false, { highContrast: true }))['--ink'], '#000000');
});

test('highlighting marks amounts, units, temperatures, times and verbs', () => {
  const h = highlight('Bake at 400°F for 25 minutes (turn once).');
  assert.match(h, /<span class="syn-verb">Bake<\/span>/);
  assert.match(h, /<span class="syn-temp">400°F<\/span>/);
  assert.match(h, /<span class="syn-time">25 minutes<\/span>/);
  assert.match(h, /<span class="syn-aside">\(turn once\)<\/span>/);
  assert.match(highlight('2 cups flour'), /<span class="syn-number">2<\/span> <span class="syn-unit">cups<\/span> flour/);
  assert.equal(highlight('<b>'), '&lt;b&gt;');
});

test('casing', () => {
  assert.equal(titleCase('salads and sides'), 'Salads and Sides');
  assert.equal(titleCase('a slow-cooker stew'), 'A Slow-Cooker Stew');
  assert.equal(applyCase('Heat the oven', 'Title', false), 'Heat the oven');
  assert.equal(applyCase('Heat the Oven', 'Lower', false), 'heat the oven');
  assert.equal(applyCase('½×', 'Lower', true), '½×');
});

test('spelling', () => {
  assert.equal(toUs('Colours and greys'), 'Colors and grays');
  assert.equal(toUs('COLOUR'), 'COLOR');
  assert.equal(toUs('Greyhound'), 'Greyhound');
  assert.equal(defaultSpelling('US'), 'US');
  assert.equal(defaultSpelling('GB'), 'UK');
});
