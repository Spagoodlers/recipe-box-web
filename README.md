# Recipe Box (web)

Your recipes as cards in books. No ads, no life stories, no scrolling. Just the card.

The web version of the [Recipe Box](https://github.com/Spagoodlers/eink-recipes) Android app. It reads and writes the same sync file, so a box kept on the phone opens here too. Plain HTML, CSS and JavaScript: no build step, no server, no accounts. Everything stays in the browser and your own sync file.

## What it does

- **Books**: cards as tiles a page at a time, books on a shelf, search. Past a book's last page comes the next book.
- **Cards**: ingredients, method, notes, nutrition and info; ½×–3× or any number of servings; US, metric or as written (the app's own scaling and conversions); tick lines off; past a card's last page comes the next card.
- **Cook mode**: get everything out first, then one big step at a time with its amounts and timers, and **Read** to hear it.
- **Shopping list**: from a card (+ List) or by hand; tick, take off, copy.
- **Print**: Kitchen sheet or Large print, Letter or A4, keep things whole across pages, and **Copy HTML**.
- **Edit**: change a card or write a new one; add books.
- **Setup**: text size, the app's typefaces (OpenDyslexic, Atkinson Hyperlegible, Lexend, Literata, Andika, Comic Neue), roomier spacing, light / dark, bigger buttons, reading aloud, starter books, bring in or save a file.
- **Pages, not scrolling**: swipe, arrow and page keys, or the mouse wheel turn a page; Esc goes back.

## Sync

The same rule as the phone: whichever copy changed since the last sync replaces the other, and when both did you choose which to keep. Nothing is combined.

- **Your sync file** (Chrome and Edge on a computer): pick the file in your Dropbox or Google Drive folder once. The page reads and writes it there, and the folder carries it to your phone. After a restart the browser asks again: one tap.
- **A link** (any browser): paste a Dropbox share link (or any web address the host lets pages read). Read only; changes made here stay in this browser.
- Or **Save a copy** / **Bring in a file** by hand.

## Run it locally

Any static server, from this folder:

```
python -m http.server 8000
```

then open http://localhost:8000. (Opening `index.html` straight from disk won't work: browsers block modules there.)

## Publish on GitHub Pages

Settings → Pages → Build and deployment: **Deploy from a branch**, branch `main`, folder `/ (root)`. The site appears at `https://<user>.github.io/<repo>/`.

## Tests

`node --test test/` runs the Android app's scaling, units, temperature and step-amount tests against the web port.

## Licences

The code is under the licence in `LICENSE`. The bundled fonts are under the SIL Open Font License (`fonts/OFL.txt`).
