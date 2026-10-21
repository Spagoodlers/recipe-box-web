// Developer Recipes: the locked book where every developer feature lives, as cards (seven taps on
// the version number in Setup → About). Two kinds, as on the phone:
// - secret cards: tick every ingredient to flip a feature on (or off again); the ticks reset;
// - menu cards: each ingredient is an option, ticked while it's on. Tick one to choose it.
// Developer Soup (simple mode on or off) and Scorched Earth Stew (delete everything) live here too.

import { DEV_BOOK, fullRecipe } from './box.js';
import { palettes } from './look.js';

export const DEV_NAME = 'Developer Recipes';
export const SOUP = 'developer-soup';
export const STEW = 'scorched-earth-stew';

const card = (id, title, about, ingredients, steps) => fullRecipe({
  id, title, description: about, ingredients, steps, servings: 1, sourceName: 'Recipe Box', folderId: DEV_BOOK, created: 0, updated: 0,
});

/** The developer switches: [flag, the Fondue's line for it, the card that flips it]. */
export const FLAGS = [
  ['devCasings', 'Programmer casings', 'dev-case-sensitive-casserole'],
  ['codeFont', 'Code font', 'dev-monospace-mac-and-cheese'],
  ['rawJson', 'Raw card data', 'dev-hello-world-hash'],
  ['debugInfo', 'Debug info in Setup', 'dev-kernel-panic-pancakes'],
  ['steppers', '− / + serving buttons', 'dev-off-by-one-omelette'],
  ['aiCards', 'AI card helpers', 'dev-large-language-lasagna'],
  ['variants', 'Variants', 'dev-git-merge-gumbo'],
  ['keyLog', 'Key log', 'dev-key-log-kebab'],
  ['seedData', 'Test Kitchen book', 'dev-seed-data-souffle'],
];
export const PAELLA = 'dev-palette-paella';
export const FONDUE = 'dev-feature-flag-fondue';
export const MENUS = new Set([PAELLA, FONDUE]);
export const SECRETS = new Map(FLAGS.map(([flag, , id]) => [id, flag]));
export const DEV_IDS = new Set([SOUP, STEW, PAELLA, FONDUE, ...SECRETS.keys()]);

/** Palette Paella's lines, in order (line 0 is its heading): [scheme, line]. */
export const PALETTE_LINES = Object.entries(palettes).map(([k, d]) => [k, k === 'Ink' ? 'Squid ink (black & white)' : `${d[0]}${d[2] ? ` (${d[2].charAt(0).toLowerCase()}${d[2].slice(1)})` : ''}`]);

export const FLAG_NOTICES = {
  devCasings: ['Unlocked: programmer casings (Setup → Reading → Casing).', 'Programmer casings hidden.'],
  codeFont: ['Code font unlocked (Setup → Reading → Typeface).', 'Code font hidden.'],
  rawJson: ['Raw card data on the Info tab.', 'Raw card data hidden.'],
  debugInfo: ['Debug info added to Setup.', 'Debug info hidden.'],
  steppers: ['− / + serving buttons on every card.', 'Serving buttons hidden.'],
  aiCards: ['AI card buttons are on Find.', 'AI card buttons hidden.'],
  variants: ['Variants on: the editor can save a new version.', 'Variants hidden.'],
  keyLog: ['Key log on: shortcut keys say what they did.', 'Key log off.'],
  seedData: ['Added the Test Kitchen book: 60 generated cards.', 'Took away the Test Kitchen book.'],
};

export const soup = () => card(SOUP, 'Developer Soup', 'Finish this card to switch simple mode on or off.', [
  '## Check every item to switch simple mode on or off.',
  '1 cup patience',
  '2 tablespoons strong coffee',
  '1 pinch reading the manual',
  '3 cloves have-you-tried-turning-it-off-and-on-again',
  'This one too',
], ['Check every ingredient.', 'Simple mode hides Find and Setup and turns developer mode off. Finish this card again to bring them back.']);

export const stew = () => card(STEW, 'Scorched Earth Stew', 'Finishing this card deletes every recipe and book.', [
  '## Check every item to delete ALL recipes and books. No undo.',
  '1 backup, saved first (Setup → Your recipes → Save a copy)',
  '1 deep breath',
  'Every card in the box',
  'This one last',
], [
  'Check every ingredient.',
  'Everything is deleted, on synced devices too. Developer Recipes comes back on its own.',
  'Changed your mind? OH GOD, DELETE THIS clears the checks.',
]);

/** Every Developer Recipes card. */
export function devRecipes() {
  return [
    soup(), stew(),
    card('dev-case-sensitive-casserole', 'Case-Sensitive Casserole', 'Unlocks programmer casings in Setup → Reading → Casing.', [
      '## Check every item to unlock (or hide) programmer casings.', '1 cup snake_case', '2 tbsp camelCase', '1 pinch kebab-case', 'SCREAMING_SNAKE, to taste',
    ], ['Check every ingredient.', 'Setup → Reading → Casing gets snake_case, camelCase, PascalCase, kebab-case, SCREAMING_SNAKE and sPoNgEcAsE.']),
    card('dev-monospace-mac-and-cheese', 'Monospace Mac & Cheese', 'The whole app in a code font.', [
      '## Check every item to switch the code font on or off.', '1 lb fixed-width macaroni', '2 cups evenly spaced cheddar', '1 tab, not spaces',
    ], ['Check every ingredient.', 'Every letter now takes up the same width.']),
    card('dev-hello-world-hash', 'Hello World Hash', 'Shows each card’s raw JSON on its Info tab.', [
      '## Check every item to show (or hide) raw card data.', '1 curly brace {', '1 curly brace }', 'a sprinkle of "quotes"', 'null, to garnish',
    ], ['Check every ingredient.', 'Each card’s Info tab ends with its raw JSON.']),
    card('dev-kernel-panic-pancakes', 'Kernel Panic Pancakes', 'Adds a debug panel to Setup.', [
      '## Check every item to show (or hide) debug info in Setup.', '1 stack trace', '2 cups core dump', '1 log, tailed',
    ], ['Check every ingredient.', 'Setup gets a Debug section: counts, storage, browser, sync.']),
    card('dev-off-by-one-omelette', 'Off-By-One Omelette', 'One-serving − / + buttons on every card.', [
      '## Check every item to add (or remove) the − / + serving buttons.', 'n eggs', 'n + 1 eggs', '1 fencepost, between the eggs', '0-indexed chives',
    ], ['Check every ingredient.', 'Every card with servings gets − and + next to “Serves”.']),
    card('dev-large-language-lasagna', 'Large Language Lasagna', 'AI card helpers on Find: copy a prompt, paste the reply back as a card.', [
      '## Check every item to show (or hide) the AI card buttons on Find.', '1 prompt, copied', '12 layers of attention', 'a context window, greased', '1 hallucination, picked out',
    ], [
      'Check every ingredient.',
      'Find gets Copy AI prompt and Paste AI card. Paste the prompt into any AI chat, tell it your recipe in your own words, copy the whole reply, then Paste AI card.',
      'The app never talks to an AI itself.',
    ]),
    card('dev-git-merge-gumbo', 'Git Merge Gumbo', 'Variants: save an edit as a new version of a card.', [
      '## Check every item to switch variants on or off.', '1 main branch', '2 feature branches', '1 merge conflict, resolved', 'a dash of blame',
    ], [
      'Check every ingredient.',
      'The editor gets “Save as new variant”. Cards with variants get version buttons: 0.0.0, 0.1.0, …',
      'Deleting an original makes its first variant the new original.',
    ]),
    card('dev-key-log-kebab', 'Key Log Kebab', 'Says what every shortcut key did.', [
      '## Check every item to show (or hide) the key log.', '1 keycode, skewered', '2 presses, in quick succession', '1 long hold', 'a debounce of 260 ms',
    ], ['Check every ingredient.', 'Each shortcut key shows what it did, like “C → Cook Pancakes”.']),
    card('dev-seed-data-souffle', 'Seed Data Soufflé', 'Adds (or takes away) the Test Kitchen book: 60 generated cards for trying things at scale.', [
      '## Check every item to add (or remove) the Test Kitchen book.', '60 cards, generated', 'a few very long titles', 'sections, sub-recipes and nutrition, folded in', '1 Über-Crème Jalapeño Café, for odd letters',
    ], ['Check every ingredient.', 'The Test Kitchen book appears on the shelf. Check every ingredient again to take it away, with every card in it.']),
    card(PAELLA, 'Palette Paella', 'Every colour scheme, each with a light and a dark side. Syntax highlighting (Setup → Colours) works in all of them. Tick one.', [
      '## Tick one colour scheme.', ...PALETTE_LINES.map(([, l]) => l),
    ], ['Tick a colour on the Ingredients tab. Squid ink is pure black and white, best on e-ink.']),
    card(FONDUE, 'Feature Flag Fondue', 'Every developer switch on one card. Tick to turn on, tick again to turn off.', [
      '## Ticked means on.', ...FLAGS.map(([, l]) => l),
    ], ['Tick a flag on the Ingredients tab. Each one also has its own card in this book.']),
  ];
}

// ---------------------------------------------------------------- the Test Kitchen

export const SEED_BOOK = 'seed-test-kitchen';

/** Generated cards for trying the app at scale and at its edges: long titles, sections, sub-recipes, odd letters. */
export function seedLibrary(now = Date.now()) {
  const dishes = ['Soup', 'Stew', 'Pasta', 'Tacos', 'Curry', 'Salad', 'Bread', 'Cake', 'Pie', 'Risotto', 'Chili', 'Stir-Fry', 'Casserole', 'Muffins', 'Pancakes', 'Dumplings', 'Noodles', 'Tart', 'Gratin', 'Frittata'];
  const adjectives = ['Quick', 'Slow', 'Spicy', 'Smoky', 'Crispy', 'Creamy', 'Lemony', 'Herby', 'Garlicky', 'Sticky', 'Golden', 'Rustic', 'Midnight', 'Sunday', 'Über', 'Crème', 'Jalapeño', 'Café'];
  const things = ['flour', 'sugar', 'butter', 'milk', 'eggs', 'onion', 'garlic', 'carrots', 'celery', 'tomatoes', 'rice', 'chicken thighs', 'black beans', 'spinach', 'cheddar', 'olive oil', 'lemon juice', 'stock', 'potatoes', 'honey'];
  const amounts = ['1 cup', '2 tbsp', '1 tsp', '½ cup', '1 lb', '3', '2 cloves', '¼ cup', '8 oz', '1½ cups', '400 g', '250 ml'];
  const actions = ['Heat the oven to 375°F.', 'Chop everything into even pieces.', 'Stir in the {x} and cook for 5 minutes.', 'Simmer gently for 20 minutes, stirring now and then.', 'Whisk the {x} until smooth.', 'Bake for 25 minutes, until golden.', 'Season to taste and serve.', 'Rest for 10 minutes before slicing.', 'Fold in the {x} (gently, so it stays light).', 'Bring to a boil, then turn down to a simmer for 15 minutes.'];
  const ids = Array.from({ length: 60 }, (_, i) => `seed-${String(i + 1).padStart(2, '0')}`);
  const recipes = ids.map((id, n) => {
    const i = n + 1;
    const pick = (list, k) => list[(i * 7 + k * 13) % list.length];
    const long = i % 9 === 0;
    const sections = i % 5 === 0;
    const nIng = 3 + ((i * 5) % (long ? 28 : 12));
    const nSteps = 2 + ((i * 3) % (long ? 22 : 8));
    const ings = [];
    if (sections) ings.push('## For the base');
    for (let k = 0; k < nIng; k++) {
      if (sections && k === Math.floor(nIng / 2)) ings.push('## For the topping');
      ings.push(`${pick(amounts, k)} ${pick(things, k + 1)}${k % 4 === 3 ? ', finely chopped' : ''}`);
    }
    const steps = Array.from({ length: nSteps }, (_, k) => pick(actions, k).replace('{x}', pick(things, k + 2)));
    const title = `${pick(adjectives, 0)} ${pick(dishes, 1)}${long ? ' with Roasted Garlic, Charred Spring Onions and a Very Long Name That Has to Wrap' : ''} #${i}`;
    // Every sixth card uses the one before it as a sub-recipe: chains to test the Open tab.
    const first = ings.findIndex((l) => !l.startsWith('## '));
    const subs = i % 6 === 0 ? [{ name: ings[first], url: '', kind: 'i', index: first, recipeId: ids[i - 2] }] : [];
    return fullRecipe({
      id, title, description: i % 3 === 0 ? `Generated test card ${i} of 60.` : '', ingredients: ings, steps,
      notes: i % 4 === 0 ? 'Notes line one.\nNotes line two, with an aside (like this) and 180°C.' : '',
      servings: i % 7 === 0 ? null : 1 + (i % 8), prepMin: 5 + (i % 30), cookMin: i % 8 === 0 ? null : (i * 11) % 240,
      nutrition: i % 2 === 0 ? [`Calories: ${200 + i * 10}`, `Protein: ${i % 40} g`, `Fat: ${i % 25} g`, `Sodium: ${i * 20} mg`] : [],
      folderId: SEED_BOOK, sourceName: 'Seed Data Soufflé', subRecipes: subs, created: now, updated: now,
    });
  });
  return { folders: [{ id: SEED_BOOK, name: 'Test Kitchen' }], recipes };
}
