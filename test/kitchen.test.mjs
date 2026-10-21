// The planner, adding-up, cupboard and card-parts rules, as the Android app has them: `node --test test/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Dates, periodOf, stepPeriod, periodTitle, placeSaved, combine, Pantry, Cupboard, cupboardOf, cardParts, extractPart, household, slotOrder, currentSlot, mealMinutes, planEntries, planShopping } from '../js/kitchen.js';
import { Box, fullRecipe } from '../js/box.js';
import { ingredientName, parseMinutes } from '../js/units.js';

test('dates', () => {
  assert.equal(Dates.weekday('2026-10-19'), 0); // a Monday
  assert.equal(Dates.weekStart('2026-10-25'), '2026-10-19');
  assert.equal(Dates.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(Dates.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(Dates.addMonths('2026-03-15', -3), '2025-12-15');
  assert.equal(Dates.daysInYear('2028-05-01'), 366);
  assert.equal(Dates.between('2026-03-28', '2026-03-30'), 2);
  assert.equal(Dates.long('2026-10-18'), 'Sunday 18 October');
  assert.equal(Dates.minutes('18:30'), 1110);
  assert.equal(Dates.minutes('25:00'), null);
});

test('periods', () => {
  const w = periodOf('Week', '2026-10-21');
  assert.deepEqual([w.from, w.to], ['2026-10-19', '2026-10-25']);
  assert.equal(periodTitle(w), 'Week of 19 October');
  assert.equal(stepPeriod(w, 1).from, '2026-10-26');
  const m = periodOf('Month', '2026-02-10');
  assert.equal(m.to, '2026-02-28');
  assert.equal(periodTitle(stepPeriod(m, -2)), 'December 2025');
  // A saved week fills a month, weekday by weekday.
  const sp = { span: 'Week', meals: [{ offset: 0, slot: 2, cards: ['a'], people: 4, note: '' }] };
  const placed = placeSaved(sp, periodOf('Month', '2026-10-01'), 'home');
  assert.deepEqual(placed.map((x) => x.date), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
});

test('slots', () => {
  const h = household();
  // Prep work (untimed, prep) first; timed by the clock; untimed others last.
  assert.deepEqual(slotOrder(h).map((i) => h.slots[i].name), ['Prep work', 'Breakfast', 'Lunch', 'Snack', 'Dinner', 'Baking', 'Other']);
  assert.equal(h.slots[currentSlot(h, 17 * 60 + 45)].name, 'Dinner');
  assert.equal(h.slots[currentSlot(h, 3 * 60)].name, 'Breakfast');
});

test('adding up lines', () => {
  const out = combine([['1 cup flour', 'A'], ['½ cup flour', 'B'], ['2 eggs', 'A'], ['1 egg', 'B'], ['1 cup milk', 'A'], ['2 tbsp milk', 'B'], ['Salt to taste', 'A'], ['salt to taste', 'B'], ['2 lemon', 'A']]);
  const texts = out.map((l) => l.text);
  assert.ok(texts.includes('1½ cups flour'), texts.join(' | '));
  assert.ok(texts.includes('3 eggs'));
  assert.ok(texts.includes('1⅛ cups milk'));
  assert.ok(texts.includes('Salt to taste'));
  assert.ok(texts.includes('2 lemons'));
  assert.deepEqual(out.find((l) => l.text === '3 eggs').from, ['A', 'B']);
});

test('the cupboard', () => {
  const c = cupboardOf(null);
  assert.ok(Pantry.has('1 tsp salt', c));
  assert.ok(Pantry.has('freshly ground black pepper', c));
  assert.ok(!Pantry.has('salt pork', c));
  assert.ok(Pantry.has('2 cups warm water', c));
  assert.ok(!Pantry.has('2 tbsp olive oil', c));
  const k = Cupboard.addOwn({ ...c, have: [...c.have, 'oil', 'rice'] }, 'tahini');
  assert.ok(Pantry.has('2 tbsp olive oil', k));
  assert.ok(Pantry.has('1 cup long-grain white rice', k));
  assert.ok(!Pantry.has('2 tbsp rice vinegar', k));
  assert.ok(Pantry.has('3 tbsp tahini', k));
  const low = Cupboard.cycle(k, 'oil');
  assert.equal(Cupboard.state(low, 'oil'), 'low');
  assert.ok(!Pantry.has('2 tbsp olive oil', low));
  assert.equal(Cupboard.state(Cupboard.cycle(low, 'oil'), 'oil'), 'none');
  assert.equal(ingredientName('½ cup hot sauce (Frank’s), warm'), 'hot sauce');
  assert.equal(ingredientName('1 can (14 oz) diced tomatoes'), 'diced tomatoes');
});

test('parts of a card', () => {
  const r = fullRecipe({
    id: 'x', title: 'Caesar Salad', ingredients: ['## Dressing', '1 egg yolk', '2 tbsp lemon juice', '½ cup olive oil', '## Salad', '1 romaine lettuce', '1 cup croutons'],
    steps: ['Whisk the egg yolk and lemon juice, then slowly whisk in the olive oil to make the dressing.', 'Toss the lettuce and croutons with the dressing.'],
  });
  const parts = cardParts(r);
  assert.deepEqual(parts.map((p) => p.name), ['Dressing']);
  assert.deepEqual(parts[0].steps, [0]);
  const [orig, sub] = extractPart(r, parts[0], 'new');
  assert.equal(sub.title, 'Caesar Salad dressing');
  assert.deepEqual(sub.ingredients, ['1 egg yolk', '2 tbsp lemon juice', '½ cup olive oil']);
  assert.equal(orig.ingredients[0], '1 batch Caesar Salad dressing');
  assert.equal(orig.steps[0], 'Make the dressing (its own card: Caesar Salad dressing).');
  assert.equal(orig.subRecipes.length, 2);
});

test('a meal plan', () => {
  const box = new Box();
  const a = fullRecipe({ id: 'a', title: 'Tacos', servings: 2, prepMin: 15, cookMin: 10, ingredients: ['1 lb beef', '1 tsp salt', '1 onion'], subRecipes: [{ name: 'salsa', url: '', kind: 'i', index: 2, recipeId: 's' }] });
  const s = fullRecipe({ id: 's', title: 'Salsa', servings: 4, prepMin: 10, ingredients: ['1 onion', '2 tomatoes'] });
  box.set({ folders: [], recipes: [a, s], shopping: [], meals: [{ id: 'm', date: '2026-10-20', slot: 2, cards: ['a'], people: 4, note: '', profile: 'home' }] });
  const e = planEntries(box, household(), '2026-10-19', '2026-10-25');
  assert.equal(e.length, 1);
  assert.equal(e[0].label, 'Tue 20 · Dinner');
  assert.deepEqual(mealMinutes(e[0].recipes), [25, 15]);
  const list = planShopping(box, e, 'AsWritten', cupboardOf(null)).map((l) => l.text);
  // Tacos doubled for 4; the salsa at its own size; the onions added up; salt left off.
  assert.deepEqual(list, ['2 lb beef', '3 onions', '2 tomatoes']);
  assert.equal(parseMinutes('1h 30m'), 90);
  assert.equal(parseMinutes('1:15'), 75);
});
