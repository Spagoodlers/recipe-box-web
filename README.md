# Recipe Box (web)

**Your recipes as cards in books. No ads, no life stories, no scrolling. Just the card.**

**[Open Recipe Box →](https://spagoodlers.github.io/recipe-box-web/)**

The web version of [Recipe Box for Android](https://github.com/Spagoodlers/eink-recipes). It reads and writes the same sync file as the app, so a box kept on your phone opens here too, and the other way round. It needs no install, no account and no server: everything stays in your browser and in your own sync file.

## What it does

- **Books**: your cards as tiles, a page at a time, with your books on a shelf, and search that ignores accents. Past a book's last page comes the next book.
- **Cards**: Ingredients, Method, Notes, Nutrition and Info. Scale ½×–3× or to any number of servings; switch between US, metric and as written; tick lines off as you go. Past a card's last page comes the next card.
- **Cook mode**: get everything out first, then one big step at a time with its amounts and timers. **Read** says the step aloud.
- **Shopping list**: add a card's ingredients with **+ List**, or type your own. Tick, take off, and copy the list.
- **Print**: Kitchen sheet or Large print, Letter or A4, keep things whole across pages, print or save as PDF, and **Copy HTML**.
- **Edit**: change a card or write a new one, and add books.
- **Starter books**: the app's 16 books, 155 recipes in all, including Learning to Cook for people who've never cooked.
- **Reading and accessibility**: text from XS to XXL; the app's typefaces (OpenDyslexic, Atkinson Hyperlegible, Lexend, Literata, Andika, Comic Neue); roomier spacing; light or dark; bigger buttons; reading aloud.
- **Pages, not scrolling**: swipe, use the arrow and page keys, or the mouse wheel to turn a page. Esc goes back.

It uses the same scaling and unit conversion as the Android app, tested against the app's own cases. Meal plans and cupboards aren't on the web yet; they travel through the sync file untouched.

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

Then open <http://localhost:8000>. Opening `index.html` straight from disk won't work, because browsers block modules there.

To publish on GitHub Pages: **Settings → Pages → Deploy from a branch**, branch `main`, folder `/ (root)`.

## Tests

`node --test test/` (Node 18+) runs the Android app's scaling, unit, temperature and step-amount tests against the web port.

## Project layout

- `index.html`, `css/style.css`: the page and its look (light and dark, the bundled fonts).
- `js/units.js`: scaling, units, temperatures, timers and search, ported from the app.
- `js/box.js`: the recipe box, in the app's file format, and the sync rule.
- `js/sync.js`: the sync file (a remembered local file, or a link).
- `js/paging.js`: pages instead of scrolling.
- `js/print.js`: printable pages and Copy HTML.
- `js/app.js`: the screens.
- `books/`: the starter books. `fonts/`: the bundled typefaces.

## Licence

The code is under the MIT licence; see `LICENSE`. The bundled fonts are under the SIL Open Font License; see `fonts/OFL.txt`.
