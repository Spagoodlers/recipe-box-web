// Bringing recipes in, as the Android app's importer does: `node --test test/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, deflateRawSync } from 'node:zlib';
import { fromNode, fromJsonLd, fromWprm, readRecipeFile, readAiCard, fromMealDb, isoMinutes, clean, tidyNotes } from '../js/importer.js';

test('schema.org', () => {
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, {
    '@type': ['Recipe'], name: 'Pastina &amp; Peas', recipeYield: ['4', '4 servings'], prepTime: 'PT10M', cookTime: 'PT1H5M',
    recipeIngredient: ['1 cup pastina', 'salmon (, cut into cubes)'],
    recipeInstructions: [{ '@type': 'HowToSection', name: 'Soup', itemListElement: [{ '@type': 'HowToStep', text: 'Boil the stock for 10 minutes.' }] }],
    author: { '@type': 'Person', name: 'Jo' }, nutrition: { '@type': 'NutritionInformation', calories: '220 kcal', proteinContent: '5 g' },
    aggregateRating: { ratingValue: '4.86', ratingCount: '12' },
  }] });
  const r = fromJsonLd([ld], 'https://example.com/pastina/', 'Example');
  assert.equal(r.title, 'Pastina & Peas');
  assert.equal(r.servings, 4);
  assert.equal(r.yieldText, '4 servings');
  assert.deepEqual([r.prepMin, r.cookMin], [10, 65]);
  assert.deepEqual(r.ingredients, ['1 cup pastina', 'salmon (cut into cubes)']);
  assert.deepEqual(r.steps, ['## Soup', 'Boil the stock for 10 minutes.']);
  assert.equal(r.author, 'Jo');
  assert.deepEqual(r.nutrition, ['calories: 220 kcal', 'protein: 5 g']);
  assert.equal(r.rating, '4.9 (12 ratings)');
  assert.equal(r.sourceName, 'Example');
  assert.equal(isoMinutes('P0DT0H20M'), 20);
  assert.equal(clean(' a&nbsp; <b>b</b> '), 'a b');
  assert.equal(tidyNotes('x ((or y))'), 'x (or y)');
  assert.equal(fromNode({ name: 'x', url: 'https://a.b/c' }).sourceUrl, 'https://a.b/c');
});

test('WP Recipe Maker', () => {
  const r = fromWprm({
    name: 'Pastina Soup', summary: '<p>Soothing.</p>', servings: '6', prep_time: '20', cook_time: '45', total_time: '65', author_name: 'Love and Lemons',
    ingredients: [{ name: '', ingredients: [{ amount: '2', unit: 'tablespoons', name: 'olive oil', notes: '' }, { amount: '1', unit: '', name: 'onion', notes: 'chopped' }] },
      { name: 'To serve', ingredients: [{ amount: '', unit: '', name: 'Parmesan', notes: '(optional)' }] }],
    instructions: [{ name: '', instructions: [{ text: 'Heat the oil.' }] }],
    nutrition: { calories: 220, protein: 5, sodium: 1769, vitamin_a: 7521 }, tags: { course: [{ name: 'Main Course' }] },
  }, 'https://www.loveandlemons.com/pastina-soup/', 'loveandlemons.com');
  assert.deepEqual(r.ingredients, ['2 tablespoons olive oil', '1 onion, chopped', '## To serve', 'Parmesan (optional)']);
  assert.deepEqual(r.steps, ['Heat the oil.']);
  assert.deepEqual([r.servings, r.prepMin, r.cookMin, r.totalMin], [6, 20, 45, 65]);
  assert.deepEqual(r.nutrition, ['calories: 220 kcal', 'protein: 5 g', 'sodium: 1769 mg']);
  assert.equal(r.category, 'Main Course');
  assert.equal(r.description, 'Soothing.');
});

test('recipe files', async () => {
  const paprika = { name: 'Pancakes', ingredients: '1 cup flour\n1 egg', directions: 'Mix.\nFry.', servings: '4 servings', prep_time: '10 mins', cook_time: '1 hour 5 min', source_url: 'https://a.example/p', rating: 4 };
  const one = await readRecipeFile(gzipSync(Buffer.from(JSON.stringify(paprika))));
  assert.equal(one.format, 'Paprika');
  const p = one.library.recipes[0];
  assert.deepEqual([p.title, p.servings, p.prepMin, p.cookMin, p.rating], ['Pancakes', 4, 10, 65, '4/5 (Paprika)']);
  // A .paprikarecipes file: a zip of gzipped recipes.
  const entry = gzipSync(Buffer.from(JSON.stringify({ ...paprika, name: 'Waffles' })));
  // Browsers all read deflated zip entries; older Node can't, so it tries stored ones only.
  const rawOk = (() => { try { new DecompressionStream('deflate-raw'); return true; } catch { return false; } })();
  const zip = makeZip([['Waffles.paprikarecipe', entry, rawOk ? 8 : 0], ['Pancakes.paprikarecipe', gzipSync(Buffer.from(JSON.stringify(paprika))), 0]]);
  const both = await readRecipeFile(zip);
  assert.deepEqual(both.library.recipes.map((r) => r.title), ['Waffles', 'Pancakes']);
  const mealie = { name: 'Soup', recipeYield: '2 bowls', recipeIngredient: [{ title: 'Base', display: '1 onion' }, { quantity: 2, unit: { name: 'cups' }, food: { name: 'stock' } }], recipeInstructions: [{ text: 'Simmer.' }], orgURL: 'https://m.example/soup' };
  const m = (await readRecipeFile(Buffer.from(JSON.stringify([mealie])))).library.recipes[0];
  assert.deepEqual(m.ingredients, ['## Base', '1 onion', '2 cups stock']);
  const backup = { format: 'recipebox', version: 2, folders: [{ id: 'f', name: 'Mine' }], recipes: [{ id: 'r1', title: 'Toast', folderId: 'f' }], config: { units: 'Metric' } };
  const b = await readRecipeFile(Buffer.from(JSON.stringify(backup)));
  assert.equal(b.format, 'Recipe Box');
  assert.equal(b.config.units, 'Metric');
  await assert.rejects(readRecipeFile(Buffer.from('{"hello":1}')), /No recipes/);
});

test('an AI reply and TheMealDB', async () => {
  const reply = 'Sure! ```json\n{“format”:“recipebox”,“version”:2,“recipes”:[{“title”:“Grandma’s Stew”,“ingredients”:[“1 lb beef”],“steps”:[“Simmer for 2 hours.”]}]}\n```';
  const lib = await readAiCard(reply);
  assert.equal(lib.recipes[0].title, 'Grandma’s Stew');
  await assert.rejects(readAiCard('{"format":"recipebox","recipes":[{"title":""}]}'), /empty/);
  const meal = fromMealDb({ idMeal: '1', strMeal: 'Leblebi', strInstructions: 'Heat oil.\r\n\r\nSTEP 2\r\nAdd beans.', strIngredient1: 'Chickpeas', strMeasure1: '250g', strIngredient2: '', strArea: 'Tunisian' });
  assert.deepEqual(meal.ingredients, ['250g Chickpeas']);
  assert.deepEqual(meal.steps, ['Heat oil.', 'Add beans.']);
  assert.equal(meal.sourceUrl, 'https://www.themealdb.com/meal/1');
});

/** A small zip: [name, data, method] each (0 stored, 8 deflated). */
function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, raw, method] of files) {
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(method, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    parts.push(local, n, data);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
