# Recipe Box (web)

**Your recipes as cards in books. No ads, no life stories, no scrolling. Just the card.**

**[Open Recipe Box →](https://spagoodlers.github.io/recipe-box-web/)**

The web version of [Recipe Box for Android](https://github.com/Spagoodlers/recipe-box-android). It reads and writes the same sync file as the app, so a box kept on your phone opens here too, and the other way round. It needs no install, no account and no server: everything stays in your browser and in your own sync file.

## What it does

Everything the Android app does, laid out for a computer as well as a phone. On a big screen the sections run down the side, your books sit beside the cards, and panes go side by side: a card's ingredients next to its method, its book's index next to the card, a week of meals in seven columns, the print preview next to its options. On a phone it's the app's own layout, tabs along the bottom. (**Setup → Reading → On a big screen** switches between them.)

- **Books**: your cards as tiles, a page at a time, with your books on a shelf, and search that ignores accents. Past a book's last page comes the next book. **Manage books** adds, renames, reorders, shares, prints and deletes books (a book's cards go where you say: loose, another book, deleted, or each its own way).
- **Cards**: Ingredients, Method, Notes, Nutrition and Info. Scale ½×–3× or to any number of servings; switch between US, metric and as written; tick lines off. **Full** shows a card alone. Link a line to another card (press and hold, or right-click), and cards a line names link themselves. A card's parts (its dressing, its glaze) can become cards of their own. Move a card to another book, or keep it in several.
- **Cards tab**: a book's cards one at a time, with the rolodex of names and letters.
- **Open**: **Keep** a card open while you look at others: its place, ticks and sub-recipes stay put, with a good-faith estimate of the cooking left. Done moves it to Complete.
- **Cook mode**: get everything out first, then one big step at a time with its amounts. The big button won't skip a step's timer without asking. **Read** says the step aloud. Timers run any number at once and call until you stop them.
- **Prep**: plan a day, week, month or year; meals in slots (Breakfast, Lunch service, Prep work…), each for so many people. From any stretch: one added-up shopping list, a prep plan (what to cook ahead, how long each meal takes), everything kept open at once, printouts, and saved preps that repeat to fill a longer stretch. Plan layouts for a household or a kitchen's services.
- **Shopping list**: by recipe or A–Z; add a card's ingredients with **List**, or type your own. The **cupboard** keeps staples off lists, puts running-low ones back on, and restocks.
- **Find**: searches the recipe sites that let a web page read them (BBC Good Food, RecipeTin Eats, Love and Lemons, Pinch of Yum, Minimalist Baker, TheMealDB), and opens the rest on their own site. Preview a recipe, then name it, file it and bring its sub-recipes too. A pasted link works for those sites and for any WordPress food blog. The **Send to Recipe Box** bookmark brings a recipe back from any recipe page.
- **Bring in a file**: Recipe Box backups and shared books, Paprika (`.paprikarecipes`), Mealie and schema.org files. Or drop one on the page.
- **Print**: Kitchen sheet, Note card, Pro kitchen, Large print or Scroll (receipt printers); Letter to Tabloid, A3 to A5, index cards; the scheme's colours; sub-recipes on their own page, following on, or merged; batch sizes. Print or save as PDF, and **Copy HTML**.
- **Edit**: every field of a card, in two boxes side by side. Branch a recipe into a new one.
- **Starter books**: the app's 16 books, 155 recipes, with updates when the books change.
- **Look and reading**: the app's 25 colour schemes, light and dark, colour strength, high contrast, syntax highlighting for recipe text; text from XS to XXL; the app's typefaces; roomier spacing; US or UK spelling; casing; focus mode; icon mode; controls at the top; bigger buttons; reading aloud.
- **Who it's for**: home cook, chef (kitchen plans, prep sheets, batch sizes), or simple mode for a kid or someone who wants it plain. Developer mode (seven taps on the version) and its book of secrets are here too.
- **Pages, not scrolling**: swipe, the arrow and page keys, or the mouse wheel. The keyboard does the rest: `C` cooks, `[` `]` change a card's tab, `K` keeps, `L` lists, `1`–`7` the sections, `/` searches, Esc goes back (**Setup → Buttons & keys**).

It uses the same scaling, unit conversion, line adding-up and cupboard rules as the Android app, tested against the app's own cases.

## Finding recipes, for an organisation

A web page can only read sites that allow it, which most big recipe sites don't. If you serve Recipe Box yourself, **Setup → Your recipes → Fetch through** takes the address of a fetch service of your own (`https://…?url={url}`) that returns a page's HTML; then a pasted link from any site works.

## Sync with the app

The same rule as the phone: whichever copy changed since the last sync replaces the other, and when both did, you choose which to keep. Nothing is combined.

- **Your sync file** (Chrome or Edge on a computer): **Setup → Use my sync file…** and pick it in your Dropbox or Google Drive folder. The page reads and writes it there, and the folder carries it to your phone. After the browser restarts, it asks once more: one tap.
- **A link** (any browser): paste a Dropbox share link, or any address that lets web pages read it. This is read only: changes made here stay in this browser.
- Or by hand: **Save a copy** downloads a Recipe Box file, and **Bring in a file** adds one.

## Privacy

Recipe Box collects nothing: no accounts, no analytics, no ads, no cookies of its own. See the [privacy policy](https://spagoodlers.github.io/recipe-box-web/privacy.html).

## Support

Recipe Box is free. If it's earned a place in your kitchen, you can [tip the cook on Ko-fi](https://ko-fi.com/spagoodlers). Bugs and ideas are welcome as [issues](https://github.com/Spagoodlers/recipe-box-web/issues).

## Run it yourself

It's plain HTML, CSS and JavaScript, with no build step. From this folder, start any static server:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from disk won't work, because browsers block modules there. Any static host works the same way, so an organisation can serve its own copy.

To publish on GitHub Pages: **Settings → Pages → Deploy from a branch**, branch `main`, folder `/ (root)`.

## Tests

`node --test test/` (Node 18+) runs the Android app's scaling, unit, temperature and step-amount tests against the web port, plus the planner, line adding-up, cupboard, card-parts and importer rules.

## Project layout

- `index.html`, `css/style.css`: the page and its look (both layouts, the bundled fonts).
- `js/app.js`: draws the screen the address asks for, the tabs or side rail, keys, holds and timers.
- `js/core.js`: settings, the box and sync, card sessions, routes, icons, buttons and pages.
- `js/ops.js`: what the app does (keeping cards open, linking, the cupboard, modes, developer mode, timers).
- `js/v-*.js`: the screens: books, card (with the editor and cook mode), open, list, prep (with meals, layouts and the cupboard), find (and importing), setup (and first run), print.
- `js/units.js`, `js/kitchen.js`, `js/look.js`: scaling and units, the planner and cupboard, colour schemes and casing, ported from the app.
- `js/importer.js`: web pages, recipe files, the recipe sites and the bookmark. `js/devbook.js`: Developer Recipes.
- `js/box.js`: the recipe box, in the app's file format, and the sync rule. `js/sync.js`: the sync file.
- `js/paging.js`: pages instead of scrolling. `js/print.js`: printouts.
- `books/`: the starter books. `fonts/`: the bundled typefaces.

## Licence

The code is under the MIT licence; see `LICENSE`. The bundled fonts are under the SIL Open Font License; see `fonts/OFL.txt`.
