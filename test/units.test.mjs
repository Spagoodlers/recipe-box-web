// The Android app's own scaler and units tests, run against the web port: `node --test test/`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scale, convert, convertTemps, ingredientsInStep, stepTimers, formatMinutes, fold, UnitSystem } from '../js/units.js';

const eq = (a, b) => assert.equal(a, b);
const metric = (s) => convert(s, UnitSystem.Metric);
const us = (s) => convert(s, UnitSystem.US);

test('scaling', () => {
  eq(scale('2 eggs', 2), '4 eggs');
  eq(scale('1 1/2 cups flour', 2), '3 cups flour');
  eq(scale('1½ tsp salt', 0.5), '¾ tsp salt');
  eq(scale('1⁄2 cup milk', 2), '1 cup milk');
  eq(scale('2-3 cloves garlic', 2), '4-6 cloves garlic');
  eq(scale('500 g beef', 1.5), '750 g beef');
  eq(scale('1/3 cup sugar', 2), '⅔ cup sugar');
  eq(scale('Salt to taste', 3), 'Salt to taste');
  eq(scale('## 2 sauces', 2), '## 2 sauces');
  eq(scale('1 (14 oz) cans tomatoes', 2), '2 (14 oz) cans tomatoes');
  eq(scale('1 1/2 cups', 1), '1 1/2 cups');
  eq(scale('0.5 cup cooking oil', 1), '½ cup cooking oil');
  eq(scale('1 tablespoon curry powder', 2), '2 tablespoons curry powder');
  eq(scale('2 teaspoons salt', 0.5), '1 teaspoon salt');
  eq(scale('1 pinch salt', 2), '2 pinches salt');
  eq(scale('1 cans beans', 2), '2 cans beans');
  eq(scale('8 tbsp butter', 3), '1½ cups butter');
});

test('units', () => {
  eq(metric('1 cup milk'), '240 ml milk');
  eq(metric('½ cup cream'), '120 ml cream');
  eq(metric('2 lb chicken thighs'), '910 g chicken thighs');
  eq(metric('3 lbs beef'), '1.4 kg beef');
  eq(metric('2 tbsp olive oil'), '2 tbsp olive oil');
  eq(metric('½ tsp salt'), '½ tsp salt');
  eq(metric('2 cups flour'), '250 g flour');
  eq(metric('½ cup sugar'), '100 g sugar');
  eq(metric('½ cup cold butter, cubed'), '115 g cold butter, cubed');
  eq(metric('1 cup packed brown sugar'), '220 g packed brown sugar');
  eq(metric('1 cup buttermilk'), '240 ml buttermilk');
  eq(us('250 g plain flour'), '2 cup plain flour');
  eq(metric('2-3 cups stock'), '480–720 ml stock');
  eq(metric('500 g flour'), '500 g flour');
  eq(metric('2 large eggs'), '2 large eggs');
  eq(us('100 g cheese'), '3½ oz cheese');
  eq(us('240 ml water'), '1 cup water');
  eq(us('30 ml oil'), '2 tbsp oil');
  eq(convert('1 cup milk', UnitSystem.AsWritten), '1 cup milk');
});

test('temperatures', () => {
  eq(convertTemps('Bake at 350°F for 20 minutes.', UnitSystem.Metric), 'Bake at 175°C for 20 minutes.');
  eq(convertTemps('Heat oven to 200C.', UnitSystem.US), 'Heat oven to 400°F.');
  eq(convertTemps('Add 2 C of water.', UnitSystem.US), 'Add 2 C of water.');
});

test('amounts in steps', () => {
  const ing = ['¼ cup olive oil', '2 large onions, diced', '⅓ cup curry powder', '6 skinless, boneless chicken breast halves', '## Sauce', '1 tsp salt'];
  assert.deepEqual(ingredientsInStep('Heat oil in a skillet. Add onion and sauté.', ing), [0, 1]);
  assert.deepEqual(ingredientsInStep('Stir in curry powder until blended.', ing), [2]);
  assert.deepEqual(ingredientsInStep('Add chicken; reduce heat.', ing), [3]);
  assert.deepEqual(ingredientsInStep('Gather the ingredients.', ing), []);
});

test('times and search', () => {
  assert.deepEqual(stepTimers('Bake for 25 minutes, then rest 1 hour.'), [25, 60]);
  eq(formatMinutes(70), '1h 10m');
  eq(formatMinutes(null), '–');
  eq(fold('Crème Brûlée'), 'creme brulee');
});
