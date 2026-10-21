// Setup: a row per section on its first page, each saying how it's set now; a tap opens the
// section (beside the rows, on a wide screen). Also the first-run questions.

import {
  box, settings, ui, sync, views, actions, forms, esc, plural, btn, toggle, choice, pick, notice, go, back, route, paged, wide, draw, saveSettings,
  typefaces, sizes, modes, simpleForOpts, isDark, allows, boxConfig, VERSION, KO_FI, ALL, DEV_BOOK, backBar, hint, setFolder, defaultUnits, glyph,
} from './core.js';
import { palettes, paletteGroups, devGroup, palette, colourOf, highlight, casings, devCasings } from './look.js';
import { unitLabel, convert } from './units.js';
import { Sync } from './sync.js';
import { boxText } from './box.js';
import { profilesOf, household, kitchen, slotOrder, Cupboard, HOME } from './kitchen.js';
import { chooseMode, chooseSimpleFor, setSimpleMode, setDevMode, armWipe, cupboard, profiles, say, syncDevBook } from './ops.js';
import { openLayout } from './v-prep.js';
import { bookmarkHtml } from './v-find.js';
import { downloadText } from './v-card.js';
import { loadStarters } from './v-books.js';
import { sources } from './importer.js';

/** Setup's sections, in order. */
const PARTS = {
  reading: 'Reading', access: 'Accessibility', colours: 'Colours', cooking: 'Cooking', planning: 'Planning', keys: 'Buttons & keys',
  who: 'Who it’s for', recipes: 'Your recipes', about: 'About', debug: 'Debug',
};
const parts = () => Object.keys(PARTS).filter((k) => k !== 'debug' || settings.debugInfo);

function summary(k) {
  const s = settings;
  const real = box.recipes.filter((r) => r.folderId !== DEV_BOOK).length;
  const books = box.folders.filter((f) => f.id !== DEV_BOOK).length;
  switch (k) {
    case 'reading': return [`${sizes.reduce((a, b) => (Math.abs(b[0] - s.textScale) < Math.abs(a[0] - s.textScale) ? b : a))[1]} text`, s.typeface, s.roomy && 'Roomy', `${s.spelling} spelling`, { system: 'System', light: 'Light', dark: 'Dark' }[s.theme], s.layout === 'phone' && 'Phone layout'].filter(Boolean).join(' · ');
    case 'access': return [s.big && 'Big buttons', s.highContrast && 'High contrast', s.readAloud && 'Reads steps aloud', s.focus && 'Focus', s.iconMode && 'Icons', s.controlsTop && 'Controls on top'].filter(Boolean).join(' · ') || 'Bigger buttons, reading aloud, screen readers';
    case 'colours': return [palettes[s.palette]?.[0], { Full: 'Full', Soft: 'Soft', Ink: 'Ink only' }[s.accent], s.syntax && 'Highlighting'].filter(Boolean).join(' · ');
    case 'cooking': return [unitLabel[s.units], s.keepAwake ? 'Screen stays on' : 'Screen may sleep'].join(' · ');
    case 'planning': return `${s.mealPrep ? 'Prep tab on' : 'Prep tab off'} · Cupboard`;
    case 'keys': return 'Keyboard shortcuts, the wheel and swipes';
    case 'who': return modes[s.mode][0] + (s.devMode ? ' · Developer mode' : '');
    case 'recipes': return `${plural(real, 'card')} in ${plural(books, 'book')} · ${sync.on ? `Syncing with ${sync.name}` : 'Backup, sync, import'}`;
    case 'about': return `Version ${VERSION} · Tip jar`;
    default: return 'Counts, storage and this browser';
  }
}

const rows = (current) => parts().map((k) => `<button class="setup-row a ${current === k ? 'on' : ''}" data-act="setup-part" data-part="${k}"><span><b class="nm">${PARTS[k]}</b><span class="about">${esc(summary(k))}</span></span><span aria-hidden="true" data-raw>▶</span></button>`).join('');

/** Setup's first page: a row per section, each saying how it's set now, so most visits end here. */
views.setup = (part) => {
  if (settings.simpleMode) return views.books();
  const p = part && PARTS[part] && parts().includes(part) ? part : null;
  if (wide()) {
    const open = p || 'reading';
    if (open === 'recipes') loadStarters();
    return {
      tab: 'setup',
      html: `<div class="setup-two"><div class="setup-menu"><h1 class="title">Setup</h1><div class="pages" id="pg-setmenu"><div class="content">${rows(open)}</div></div><div class="count" data-for="pg-setmenu"></div></div>
        <div class="setup-part"><div class="pages" id="pg-setpart"><div class="content">${partHead(open)}${partBody(open)}</div></div><div class="count" data-for="pg-setpart"></div></div></div>`,
      mount(el) {
        paged(el, 'setup-menu', { viewport: el.querySelector('#pg-setmenu'), keys: false });
        paged(el, `setup:${open}`, { viewport: el.querySelector('#pg-setpart') });
        mountPart(el, open);
      },
    };
  }
  if (p) {
    if (p === 'recipes') loadStarters();
    return {
      tab: 'setup',
      html: `<div class="pages"><div class="content">${partHead(p)}${partBody(p)}</div></div><div class="count"></div>${backBar('Setup', 'setup-back')}`,
      mount(el) { paged(el, `setup:${p}`); mountPart(el, p); },
    };
  }
  return {
    tab: 'setup',
    html: `<h1 class="title">Setup</h1><div class="pages"><div class="content">${rows(null)}</div></div><div class="count"></div>`,
    // The heading out of the way at the top; the rows (what you press) by the thumb.
    mount(el) { paged(el, 'setup', { bottom: true }); },
  };
};
const partHead = (k) => `<h1 class="title a nm">${PARTS[k]}</h1><hr class="rule a" style="margin:2px 0 10px">`;
const section = (title) => `<div class="section a keep">${esc(title)}</div>`;

function partBody(part) {
  const s = settings;
  switch (part) {
    case 'reading': return `
      <div class="label keep">Text size</div>${pick('size', sizes.map(([v, l]) => [String(v), l]), String(sizes.find(([v]) => Math.abs(v - s.textScale) < 0.01)?.[0]))}
      <div class="a"><div class="label">Typeface</div>
        <div class="flow">${Object.entries(typefaces).filter(([k, t]) => !t.dev || s.codeFont).map(([k, t]) => `<button class="btn small ${s.typeface === k ? 'on' : ''}" style="font-family:${t.css}" data-act="typeface" data-v="${esc(k)}" data-raw>${esc(k)}</button>`).join('')}</div>
        ${typefaces[s.typeface]?.about ? `<p class="small dim" style="margin:4px 0">${esc(typefaces[s.typeface].about)}</p>` : ''}</div>
      ${toggle('roomy', 'Roomier spacing', 'More space between lines and letters. Helps many dyslexic readers.')}
      <div class="label keep">Spelling</div>
      <div class="row-btns a" data-raw>${[['US', 'US: color, gray, liter'], ['UK', 'UK: colour, grey, litre']].map(([v, l]) => `<button class="btn small grow ${s.spelling === v ? 'on' : ''}" data-act="spelling" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="small dim a">For the app’s own words. Recipes stay as their cooks wrote them.</p>
      <div class="label keep">Casing</div>
      <div class="flow a" data-raw>${Object.entries({ ...casings, ...(s.devCasings ? devCasings : {}) }).map(([v, l]) => `<button class="btn small ${s.casing === v ? 'on' : ''}" data-act="casing" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="small dim a">How names and labels are shown. lowercase changes everything.</p>
      <div class="label keep">Light / dark</div>${pick('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme)}
      <div class="label keep">On a big screen</div>${pick('layout', [['auto', 'Wide: side by side'], ['phone', 'Phone-shaped']], s.layout)}
      <p class="small dim a">Wide puts the sections down the side and panes side by side: a card’s ingredients beside its method, its book’s cards beside it. This browser only.</p>`;
    case 'access': return `
      ${toggle('big', 'Bigger buttons', 'Larger tap targets everywhere, for unsteady or messy hands. This browser only.')}
      ${toggle('highContrast', 'High contrast', 'Pure black (or white) text and darker greys.')}
      <div class="a">${toggle('readAloud', 'Read steps aloud', 'Cook mode says each step as it comes up, with your device’s own voice. Read in cook mode says it again. This browser only.')}
        ${'speechSynthesis' in window ? btn('test-voice', 'Test the voice', { cls: 'wide-btn', icon: false }) : ''}</div>
      ${toggle('focus', 'Focus mode', 'Cards show just ingredients and method.')}
      ${toggle('iconMode', 'Icon mode', 'Icons instead of words. Press and hold one to see its name.')}
      ${toggle('controlsTop', 'Controls at the top', 'Tabs and buttons up top instead of under your thumb. This browser only.')}
      ${section('Screen readers')}
      <p class="dim a">Ticks, switches and tabs say whether they’re on. Pages turn with the arrow and page keys as well as swipes, so nothing needs a gesture.</p>
      <p class="dim small a">Text size, typeface, spacing and spelling are in Reading.</p>`;
    case 'colours': {
      const dark = isDark();
      const groups = [...paletteGroups, ...(s.devMode || palettes[s.palette]?.[1] === devGroup ? [devGroup] : [])];
      return `<p class="dim a">${esc(palettes[s.palette]?.[0])}${palettes[s.palette]?.[2] ? `: ${esc(palettes[s.palette][2].charAt(0).toLowerCase() + palettes[s.palette][2].slice(1))}` : ''}. Ink is best on e-ink.</p>
        ${groups.map((g) => `<div class="a"><div class="label">${g}</div><div class="flow">${Object.entries(palettes).filter(([, d]) => d[1] === g).map(([k, d]) => {
          const p = palette(k, dark);
          return `<button class="swatch ${s.palette === k ? 'on' : ''}" data-act="palette" data-v="${k}" style="background:${colourOf(p, 'paper')};color:${colourOf(p, 'ink')}" aria-pressed="${s.palette === k}"><span class="chip" style="background:${colourOf(p, 'accent')};border-color:${colourOf(p, 'ink')}"></span><span class="bold">${s.palette === k ? '✓ ' : ''}${esc(d[0])}</span></button>`;
        }).join('')}</div></div>`).join('')}
        <div class="label keep">Colour strength</div>${pick('accent', [['Full', 'Full'], ['Soft', 'Soft'], ['Ink', 'Ink only']], s.accent)}
        <p class="small dim a">Soft tones the colour down. Ink only keeps a scheme’s paper and type but makes buttons black, for e-ink screens.</p>
        <div class="a">${toggle('syntax', 'Syntax highlighting', 'Amounts, units, temperatures, times and cooking words, in each scheme’s own colours.')}
          ${s.syntax ? `<div class="box-panel rx">${highlight('Heat the oven to 400°F. Roast 2 lb potatoes for 35 minutes (turn them once).')}<br>${highlight('1½ cups flour, sifted')}</div>` : ''}</div>`;
    }
    case 'cooking': return `
      <div class="label keep">Amounts start in</div>${pick('units-default', ['US', 'Metric', 'AsWritten'].map((u) => [u, unitLabel[u]]), s.units)}
      <p class="small dim a">Cards open in this. Each card’s units button goes round US → Metric → As written. First set from your region (${unitLabel[defaultUnits]}).</p>
      ${toggle('keepAwake', 'Keep screen on', 'While a card or cook mode is open, so it doesn’t go dark mid-recipe.')}
      ${toggle('amountsInMethod', 'Amounts under each step', 'Each step lists the amounts of what it uses.')}
      ${toggle('autoSubRecipes', 'Keep sub-recipes open', 'Keeping a recipe open keeps the cards it links to open too.')}
      ${allows('Branches') ? toggle('branches', 'Recipe branches', 'Make a new recipe from one (Ketchup → Spicy Ketchup).') : ''}
      ${allows('MultiBook') ? toggle('multiBook', 'Cards in more than one book', 'Info → Move… also picks other books.') : ''}`;
    case 'planning': {
      const kitchens = allows('Kitchens');
      const ps = profiles();
      return `${toggle('mealPrep', 'Meal prep', 'A Prep tab: plan days, weeks, months and years, then shop and cook ahead.')}
        ${s.mealPrep ? `<div class="indent">${toggle('prepNow', 'Prep opens on today, at about the meal it is now (uses the clock)', '')}
          <div class="label a">Plan layouts</div><p class="dim small a" style="margin:0">Each is its own plan with its own slots and times: a household, a kitchen’s services and prep.</p>
          ${ps.map((p) => `<div class="bar a"><span class="grow"><b>${esc(p.name)}${p.id === s.prepProfile ? ' · showing' : ''}</b><span class="dim small" style="display:block">${esc(slotOrder(p).map((i) => p.slots[i].name + (p.slots[i].time ? ` ${p.slots[i].time}` : '')).join(' · '))}</span></span>
            ${p.id !== s.prepProfile && kitchens ? btn('layout-show', 'Show', { cls: 'small', attrs: `data-id="${esc(p.id)}"`, icon: false }) : ''}${btn('layout-edit', 'Edit', { cls: 'small', attrs: `data-id="${esc(p.id)}"`, icon: false })}</div>`).join('')}
          ${kitchens ? `<div class="flow a">${btn('layout-add', '+ Kitchen (services and prep)', { cls: 'small', attrs: 'data-kind="kitchen"', icon: false })}${btn('layout-add', '+ Household', { cls: 'small', attrs: 'data-kind="home"', icon: false })}</div>` : ''}</div>` : ''}
        ${section('Always in the cupboard')}
        <p class="dim small a" style="margin:0">Kept staples stay off shopping lists; running-low ones go back on. Each kitchen has its own.</p>
        ${ps.map((p) => {
          const kept = Cupboard.kept(cupboard(p.id));
          const low = kept.filter((x) => x[1]).length;
          return `<div class="bar a"><span class="grow"><b>${esc(p.name)}</b><span class="dim small" style="display:block">${kept.length ? `${kept.length} kept${low ? ` · ${low} running low` : ''}: ${esc(kept.slice(0, 6).map((x) => x[0]).join(', '))}${kept.length > 6 ? '…' : ''}` : 'Nothing kept: everything goes on the list.'}</span></span>${btn('cupboard-open', 'Open', { cls: 'small', attrs: `data-id="${esc(p.id)}"`, icon: false })}</div>`;
        }).join('')}`;
    }
    case 'keys': return `<p class="dim a">On a computer, the keyboard does what the phone’s volume keys do, and more.</p>
      ${[['→ ↓ PgDn Space', 'Next page (and past a card’s last page, the next card)'], ['← ↑ PgUp', 'Back a page'], ['Mouse wheel', 'A page at a time'], ['Esc', 'Close, or go back'],
        ['[ ]', 'The tab before or after on a card'], ['C', 'Cook the card you’re on; in cook mode, the big button (next step, start timer)'], ['Enter', 'In cook mode, the big button too'],
        ['K', 'Keep the card open'], ['L', 'The card’s ingredients onto the list'], ['E', 'Edit the card'], ['F', 'The card full screen'], ['P', 'Print the card'],
        ['N', 'A new card'], ['/', 'Search'], ['1 – 7', 'The sections: Open, Books, Cards, Prep, List, Find, Setup']]
        .map(([k, v]) => `<div class="keyrow a"><b data-raw>${k}</b><span>${v}</span></div>`).join('')}
      <p class="dim small a">Swipes turn pages too: up or left for the next, down or right for the one before. Press and hold (or right-click) does what holding does on the phone.</p>`;
    case 'who': return `${section('Mode')}
      <div class="row-btns a">${Object.entries(modes).map(([k, [l]]) => btn('mode', l, { cls: 'grow big', on: s.mode === k && !s.simpleMode, attrs: `data-v="${k}"`, icon: false })).join('')}${btn('ask-kid', 'Kid', { cls: 'grow big', on: ui.askKid, icon: false })}</div>
      ${ui.askKid ? `<div class="box-panel thick bar a"><span class="grow small">Kid mode locks editing and Setup. A grown-up leaves it from Developer Recipes (Developer Soup).</span>${btn('kid-yes', 'Kid mode', { cls: 'primary', icon: false })}${btn('ask-kid', 'Not now', { icon: false })}</div>` : ''}
      <p class="dim small a" style="margin:4px 0 0">${esc(modes[s.mode][1])}</p>
      <p class="dim small a" style="margin:2px 0">${s.devMode ? 'Developer mode is on: every feature, whatever the mode.' : 'Kid: big cards and nothing to change by accident (a grown-up leaves it from Developer Recipes).'}</p>
      ${section('Simple mode')}
      <p class="a">Big, plain cards with nothing to change by accident: no editing, no Setup, and developer mode goes off. To leave, open Developer Recipes on the shelf and finish the “Developer Soup” card.</p>
      <div class="label a">Who’s it for?</div>
      ${Object.entries(simpleForOpts).map(([k, [l, a]]) => choice('simple-for', k, l, a, s.simpleFor === k)).join('')}
      ${toggle('simpleFind', 'Can find recipes online', '')}
      ${toggle('simpleList', 'Can use the shopping list', '')}
      <div class="a">${btn('simple-on', ui.confirm === 'simple' ? 'Tap again to confirm' : 'Turn on simple mode', { cls: 'wide-btn', on: ui.confirm === 'simple', icon: false })}</div>`;
    case 'recipes': return `
      <div class="a">${btn('starters', 'Browse starter books', { g: 'books', cls: 'wide-btn', icon: false })}<div class="dim small">16 ready-made cookbooks: Grandma’s Kitchen, Learning to Cook, Baking Basics, Grilling and more.</div></div>
      <div class="a">${btn('open-file', 'Import a file', { g: 'share', cls: 'wide-btn', icon: false })}<div class="dim small">Recipe Box, Paprika, Mealie or schema.org files. Add to your books or make a new one. Duplicates are skipped. You can also drop a file anywhere on this page.</div></div>
      ${section('Backup')}
      <p class="dim small a" style="margin:0">A backup holds every card, book, plan and box setting. Text size and colours stay in this browser. The phone app opens it too.</p>
      <div class="a">${btn('save-copy', 'Save a backup…', { cls: 'wide-btn', icon: false })}</div>
      ${section('Sync')}${syncHtml()}
      ${section('Finding recipes online')}
      <p class="dim small a" style="margin:0 0 6px">Drag this to your bookmarks bar. On any recipe page, click it and the recipe comes here to name and file.</p>
      <div class="a">${bookmarkHtml()}</div>
      <p class="dim small a">Searching here reaches ${sources.filter((x) => x.search).length} of the ${sources.length} sites; the rest open on their own site. Some sites don’t let other web pages read them at all.</p>
      <form class="a form" data-form="proxy"><label for="proxy">Fetch through (optional)</label><div class="search"><input class="field" id="proxy" name="proxy" value="${esc(s.proxy)}" placeholder="https://your-org.example/fetch?url={url}" autocomplete="off">${btn('proxy-save', 'Save', { icon: false })}</div>
        <span class="dim small">For an organisation serving Recipe Box itself: a fetch service of your own that returns a page’s HTML. {url} marks where the page’s address goes. Only pages you import go through it.</span></form>
      <div class="a">${section('Delete all recipes')}<p class="dim small" style="margin:0">Guarded by a card you have to finish first: Scorched Earth Stew.</p>${btn('arm-wipe', 'Delete all recipes…', { cls: 'wide-btn', icon: false })}</div>`;
    case 'about': return `
      <h2 class="title a" style="font-size:1.3em">Recipe Box</h2><p class="a bold" style="margin:0">The no-nonsense recipe box.</p>
      <p class="a">Tired of all the nonsense while you’re trying to cook? Us too. Introducing Recipe Box, for cooks who don’t need to read anyone’s personal connection to a recipe before they make some chocolate chip cookies.</p>
      <p class="a bold">No ads. No accounts. No life stories, pop-ups or autoplay videos. Just the card.</p>
      <p class="dim small a">Every card links to its source. Visit the cooks who wrote them.</p>
      <div class="a">Recipe Box is free. If it’s earned a place in your kitchen, you can tip the cook.<br><a class="btn wide-btn" style="margin-top:6px;text-decoration:none" href="${KO_FI}" target="_blank" rel="noopener">Support on Ko-fi</a></div>
      ${section('Start again')}<p class="dim small a" style="margin:0">The first-run questions: text size, turning pages, units, starter books, who it’s for.</p>
      <div class="a">${btn('rewelcome', 'Run first-time setup again', { cls: 'wide-btn', icon: false })}</div>
      <p class="small dim a"><button class="linkish" style="padding:8px 0" data-act="version-tap">Version ${VERSION}</button> · <a href="privacy.html" target="_blank">Privacy</a> · <a href="fonts/OFL.txt" target="_blank">Font licences</a> · <a href="https://github.com/Spagoodlers/recipe-box-web" target="_blank" rel="noopener">Source</a></p>`;
    default: {
      let bytes = 0;
      try { bytes = (localStorage.getItem('recipebox.box') || '').length; } catch { /* none */ }
      return [['Cards', box.recipes.length], ['Books', box.folders.length], ['Shopping list', box.shopping.length], ['Meals planned', box.meals.length],
        ['Box in this browser', `${Math.round(bytes / 1024)} KB`], ['Running timers', ui.timers.length], ['Browser', navigator.userAgent],
        ['Screen', `${window.innerWidth} × ${window.innerHeight} · ${window.devicePixelRatio}×`], ['Text scale', settings.textScale],
        ['Sync', sync.on ? `${sync.name} · ${sync.state.message || ''}` : 'off'], ['Deletions remembered', Object.keys(box.data.deleted).length], ['Locale', navigator.language]]
        .map(([k, v]) => `<div class="a"><div class="label">${k}</div><div class="raw" data-raw>${esc(v)}</div></div>`).join('');
    }
  }
}

function mountPart() { /* nothing live yet: every control redraws */ }

/** One master file in Dropbox, Drive or any folder on this computer, or a link to read. */
export function syncHtml() {
  if (!sync.on) {
    return `<p class="dim small a" style="margin:0">Use the same sync file as the phone app. Whichever copy changed wins; if both did, you choose which to keep. Settings stay in each browser.</p>
      ${Sync.canPickFiles
        ? `<div class="row-btns a">${btn('sync-pick', 'Use my sync file…', { cls: 'grow', icon: false })}${btn('sync-new', 'Make a new sync file…', { cls: 'grow', icon: false })}</div>
           <p class="small dim a">Pick it in your Dropbox or Google Drive folder on this computer; the page reads and writes it, and the folder carries it to your phone.</p>`
        : '<p class="small dim a">This browser can’t keep a file to read and write (Chrome or Edge on a computer can). A link works anywhere, to read.</p>'}
      <form class="search a" data-form="sync-link"><input class="field" name="url" placeholder="Or paste a link: Dropbox share link, …" aria-label="Sync file link">${btn('sync-link-go', 'Use link', { icon: false })}</form>
      <p class="small dim a">A link is read only: changes here stay in this browser.</p>`;
  }
  const when = sync.state.last ? new Date(sync.state.last).toLocaleString() : '';
  return `<div class="a"><span class="label">Syncing with${sync.readOnly ? ' (read only)' : ''}</span><div class="bold" style="word-break:break-all" data-raw>${esc(sync.name)}</div>
      <div class="small dim">${[when && `Last synced ${when}`, sync.state.message].filter(Boolean).map(esc).join(' · ')}</div></div>
    ${sync.needsPermission ? `<div class="a">${btn('sync-allow', `Allow access to ${sync.name}`, { cls: 'wide-btn primary', icon: false })}<p class="small dim">Browsers ask again after a restart: one tap.</p></div>` : ''}
    <div class="row-btns a">${btn('sync-now', sync.busy ? 'Syncing…' : 'Sync now', { cls: 'grow primary', disabled: sync.busy || sync.needsPermission, icon: false })}${btn('sync-stop', 'Stop syncing', { cls: 'grow', icon: false })}</div>`;
}

// ---------------------------------------------------------------- what Setup's controls do

const set = (k, v) => { settings[k] = v; saveSettings(); draw(); };
actions['setup-part'] = (el) => go(`#/setup/${el.dataset.part}`);
actions['setup-back'] = () => go('#/setup');
actions.toggle = (el) => set(el.dataset.key, !settings[el.dataset.key]);
actions.size = (el) => set('textScale', +el.dataset.v);
actions.typeface = (el) => set('typeface', el.dataset.v);
actions.theme = (el) => set('theme', el.dataset.v);
actions.layout = (el) => set('layout', el.dataset.v);
actions.palette = (el) => set('palette', el.dataset.v);
actions.accent = (el) => set('accent', el.dataset.v);
actions.casing = (el) => set('casing', el.dataset.v);
actions.spelling = (el) => set('spelling', el.dataset.v);
actions['units-default'] = (el) => {
  settings.units = el.dataset.v;
  saveSettings();
  // Cards open in it, from now on and the ones open now.
  import('./core.js').then(({ allSessions }) => { for (const s of allSessions().values()) s.units = settings.units; draw(); });
};
actions['test-voice'] = () => say('Step 1. Heat the oven to 400 degrees. You’ll need: 2 cups flour.');
actions.mode = (el) => { ui.askKid = false; if (settings.simpleMode) return; chooseMode(el.dataset.v); };
actions['ask-kid'] = () => { ui.askKid = !ui.askKid; draw(); };
actions['kid-yes'] = () => { ui.askKid = false; chooseSimpleFor('Kid'); setSimpleMode(true); };
actions['simple-for'] = (el) => { chooseSimpleFor(el.dataset.v); draw(); };
actions['simple-on'] = () => {
  if (ui.confirm !== 'simple') { ui.confirm = 'simple'; draw(); return; }
  ui.confirm = null;
  setSimpleMode(true);
};
actions['layout-show'] = (el) => set('prepProfile', el.dataset.id);
actions['layout-edit'] = (el) => {
  const p = profilesOf(box.data).find((x) => x.id === el.dataset.id);
  // The household may never have been saved: save it so it can be edited.
  if (!(box.data.prepProfiles || []).some((x) => x.id === p.id)) box.saveProfile(p);
  openLayout(p);
};
actions['layout-add'] = (el) => {
  const ps = profiles();
  const p = el.dataset.kind === 'kitchen' ? kitchen(ps.some((x) => x.name === 'Kitchen') ? `Kitchen ${ps.length}` : 'Kitchen')
    : { ...household(), id: crypto.randomUUID(), name: `Household ${ps.length + 1}`, updated: Date.now() };
  box.saveProfile(p);
  openLayout(p);
};
actions['cupboard-open'] = (el) => go(`#/cupboard/${encodeURIComponent(el.dataset.id)}`);
actions['save-copy'] = () => downloadText(boxText(box.syncData(), { config: boxConfig() }), `recipe-box-backup-${new Date().toISOString().slice(0, 10)}.json`);
actions['proxy-save'] = (el) => el.closest('form').requestSubmit();
forms.proxy = (form, data) => { settings.proxy = String(data.get('proxy') || '').trim(); saveSettings(); notice(settings.proxy ? 'Pages you import go through that address now.' : 'Fetching straight from the sites.'); };
actions['arm-wipe'] = () => armWipe();
actions.rewelcome = () => { settings.welcomed = false; ui.welcome = { page: 0, cook: null, picked: new Set(), who: null }; saveSettings(); go('#/welcome'); };
/** The old Android trick: tap the version number seven times to become a developer. */
actions['version-tap'] = () => {
  ui.taps = (ui.taps || 0) + 1;
  if (ui.taps >= 7) { ui.taps = 0; setDevMode(!settings.devMode); return; }
  if (ui.taps >= 3) {
    const n = 7 - ui.taps;
    hint(`${n === 1 ? '1 more tap' : `${n} more taps`} ${settings.devMode ? 'to stop being a developer' : 'to be a developer'}`);
  }
};

// sync
async function syncCall(f, sayUpToDate = false) {
  try {
    const said = await f();
    if (said) notice(said);
    else if (sync.conflict) draw();
    else if (sayUpToDate) notice('Up to date.');
    else draw();
  } catch (e) {
    if (e?.name !== 'AbortError') notice(`Couldn’t use that file: ${e.message}`);
  }
}
export { syncCall };
actions['sync-pick'] = () => syncCall(() => sync.pickFile());
actions['sync-new'] = () => syncCall(() => sync.createFile());
actions['sync-allow'] = () => syncCall(() => sync.reconnect());
actions['sync-now'] = () => syncCall(() => sync.run(), true);
actions['sync-stop'] = () => { sync.stop(); notice('Sync off. The file is left as it is.'); };
actions['sync-link-go'] = (el) => el.closest('form').requestSubmit();
actions['keep-side'] = (el) => syncCall(() => sync.run(el.dataset.keep), true);
forms['sync-link'] = (form, data) => { const url = String(data.get('url') || '').trim(); if (url) syncCall(() => sync.useLink(url), true); };

// ---------------------------------------------------------------- first run

const cookChoices = {
  New: ['I’m new to cooking', 'Start with the basics, explained step by step.', ['learning-to-cook', 'weeknight-dinners']],
  Often: ['I cook most days', 'Quick dinners, soups and the sauces that go with them.', ['weeknight-dinners', 'soups-and-stews', 'sauces-and-staples']],
  Baker: ['I mostly bake', 'Bread, cakes, cookies and puddings.', ['baking-basics', 'desserts', 'breakfast-and-brunch']],
  Own: ['I’ve got my own recipes', 'Start empty: write yours in, bring them from a file, or connect the phone app’s sync file.', []],
};
const ORDER = ['size', 'paging', 'units', 'cook', 'who', 'card'];

/** A few questions on the first visit, each one that matters on day one; the rest waits in Setup. */
views.welcome = () => {
  loadStarters();
  const w = ui.welcome;
  const page = ORDER[w.page];
  const s = settings;
  let body = '';
  if (page === 'size') {
    body = `<h1 class="title a" style="font-size:1.8em">Recipe Box</h1>
      <p class="a" style="font-size:1.12em;margin:4px 0 16px">Your recipes as cards in books. No ads, no life stories, no scrolling. Just the card.</p>
      <h2 class="q a">How big should the words be?</h2>
      <p class="dim a">Pick one you can read from the counter. You can change it any time in Setup.</p>
      <div class="row-btns a">${sizes.slice(1).map(([v, l]) => `<button class="btn grow big ${Math.abs(s.textScale - v) < 0.01 ? 'on' : ''}" data-act="size" data-v="${v}">${l}</button>`).join('')}</div>
      <p class="a rx" style="margin-top:14px;font-weight:500">2 cups flour<br>Bake for 25 minutes, until golden.</p>`;
  } else if (page === 'paging') {
    body = `<h2 class="q a">Turning pages</h2>
      ${[['↑ ←', 'Swipe up or left: the next page'], ['↓ →', 'Swipe down or right: back a page'], ['⌨', 'Arrow and page keys, or the mouse wheel: the same'], ['C', 'Press C on any card: start cooking it']]
        .map(([k, v]) => `<div class="keyrow a"><b data-raw>${k}</b><span>${v}</span></div>`).join('')}
      <p class="dim a">Nothing scrolls. Past a card’s last page comes the next card.</p>
      <p class="bold a" style="font-size:1.15em">Try it now: swipe up or left, or press →, to go on to the next question.</p>
      <p class="dim small a">The small number at the bottom of a page, like 1 / 3, says where you are.</p>`;
  } else if (page === 'units') {
    const sample = ['2 cups flour', '1 tbsp butter', '450 g chicken'];
    body = `<h2 class="q a">How do you measure?</h2>
      <p class="dim a">Cards show amounts this way; each card has a units button to switch. Picked for your region (${unitLabel[defaultUnits]}).</p>
      ${[['US', 'Cups, ounces and °F'], ['Metric', 'Grams, millilitres and °C'], ['AsWritten', 'Left as each recipe has it']].map(([u, about]) =>
        choice('units-default', u, unitLabel[u], `${about}: ${sample.map((x) => convert(x, u)).join(', ')}`, s.units === u)).join('')}`;
  } else if (page === 'cook') {
    const books = ui.starter || [];
    body = `<h2 class="q a">How much do you cook?</h2>
      <p class="dim a">We’ll start your box with the books that suit you.</p>
      ${Object.entries(cookChoices).map(([k, [t, a]]) => choice('w-cook', k, t, a, w.cook === k)).join('')}
      <div class="a" style="margin-top:12px"><h2 class="q">Your starter books</h2>
        <p class="dim">${w.picked.size ? 'These suit you. Tap to add or take away.' : 'Tap any you’d like. You can add more later in Setup.'}</p>
        <div class="flow">${books.map((b) => `<button class="btn small ${w.picked.has(b.file) ? 'on' : ''}" data-act="w-book" data-file="${b.file}">${w.picked.has(b.file) ? '✓ ' : ''}${esc(b.name)}</button>`).join('')}</div>
        ${w.picked.size ? `<p class="small dim">${books.filter((b) => w.picked.has(b.file)).reduce((n, b) => n + b.library.recipes.length, 0)} recipes to start with.</p>` : ''}</div>`;
  } else if (page === 'who') {
    body = `<h2 class="q a">Who’s it for?</h2>
      ${Object.entries(modes).map(([k, [t, a]]) => choice('w-who', k, t, a, !w.who?.startsWith('simple') && s.mode === k)).join('')}
      ${Object.entries(simpleForOpts).map(([k, [t, a]]) => choice('w-who', `simple:${k}`, t, a, w.who === `simple:${k}`)).join('')}
      ${w.who?.startsWith('simple') ? `${toggle('simpleFind', 'Can find recipes online', '')}${toggle('simpleList', 'Can use the shopping list', '')}
        <button class="linkish a small" style="text-align:left;padding:6px 0" data-act="w-howleave" data-hold="w-howleave">${ui.welcomeLeave ? 'To leave simple mode: open Developer Recipes on the shelf, and tick every line of Developer Soup.' : 'Editing and Setup stay locked. Grown-ups: press and hold here to see how to leave.'}</button>`
        : s.mode === 'Home' ? `<div class="a"><h2 class="q">Plan meals for the week?</h2><div class="row-btns">${btn('w-prep', 'No thanks', { cls: 'grow big', on: !s.mealPrep, attrs: 'data-v="0"', icon: false })}${btn('w-prep', 'Yes, add Prep', { cls: 'grow big', on: s.mealPrep, attrs: 'data-v="1"', icon: false })}</div>
          <p class="dim small">A Prep tab: put cards on days and meals (Monday dinner: chili and rice, for 4), then get one shopping list, what to cook ahead, and printouts.</p></div>` : ''}`;
  } else {
    body = `<h2 class="q a">How a card works</h2>
      ${[['check', 'Tick', 'Tap a line to tick it off, so you don’t lose your place.'], ['full', 'Full', 'The card on its own, filling the screen.'], ['cook', 'Cook', 'One big step at a time, with its timers. Or press C on any card.'], ['keep', 'Keep', 'Keeps a recipe open while you look at others.']]
        .map(([g, n, a]) => `<div class="keyrow a"><span class="btn small" style="pointer-events:none">${glyph[g]}<span>${n}</span></span><span>${a}</span></div>`).join('')}
      <p class="a bold" style="margin-top:12px">That’s it. All of this, and more (icons, sync with the phone app), is in Setup.</p>`;
  }
  const last = w.page === ORDER.length - 1;
  return {
    bare: true,
    html: `<div class="welcome-col"><div class="dim bold small">Setting up · ${w.page + 1} of ${ORDER.length}</div>
      <div class="welcome"><div class="pages"><div class="content">${body}</div></div><div class="count"></div></div>
      <div class="row-btns">${w.page ? '<button class="btn big" data-act="w-step" data-dir="-1">◀ Back</button>' : ''}
        <button class="btn big primary grow" data-act="w-step" data-dir="1">${last ? 'Start cooking' : 'Next ▶'}</button></div>
      ${w.page === 0 ? '<button class="linkish" data-act="w-finish">Skip setup</button>' : ''}</div>`,
    mount(el) { paged(el, `welcome:${w.page}`, { onEdge: (dir) => welcomeStep(dir) }); ui.holdAction = [last ? 'Start cooking' : 'Next question', () => welcomeStep(1)]; },
  };
};

function welcomeStep(dir) {
  const w = ui.welcome;
  if (dir > 0 && w.page === ORDER.length - 1) { finishWelcome(); return; }
  w.page = Math.max(0, Math.min(ORDER.length - 1, w.page + dir));
  draw();
}

async function finishWelcome() {
  const w = ui.welcome;
  const books = (await loadStarters()) || [];
  const chosen = books.filter((b) => w.picked.has(b.file) && !box.folders.some((f) => f.id === b.id));
  for (const b of chosen) box.importLibrary(b.library);
  settings.welcomed = true;
  saveSettings();
  setFolder(chosen[0]?.id ?? ALL);
  location.replace('#/books');
  if (w.who?.startsWith('simple:')) setSimpleMode(true);
  else if (chosen.length) notice(`Added ${chosen.map((b) => b.name).join(', ')}. Swipe to turn pages.`);
  else draw();
}

actions['w-step'] = (el) => welcomeStep(+el.dataset.dir);
actions['w-finish'] = () => finishWelcome();
actions['w-cook'] = (el) => { ui.welcome.cook = el.dataset.v; ui.welcome.picked = new Set(cookChoices[el.dataset.v][2]); draw(); };
actions['w-book'] = (el) => { const p = ui.welcome.picked; if (p.has(el.dataset.file)) p.delete(el.dataset.file); else p.add(el.dataset.file); draw(); };
actions['w-who'] = (el) => {
  const v = el.dataset.v;
  ui.welcome.who = v;
  if (v.startsWith('simple:')) {
    chooseSimpleFor(v.slice(7));
    // A kid's box starts with the kids' book, whatever was picked for the grown-up.
    if (v === 'simple:Kid') ui.welcome.picked.add('cooking-with-kids');
    draw();
  } else chooseMode(v);
};
actions['w-prep'] = (el) => set('mealPrep', el.dataset.v === '1');
actions['w-howleave'] = () => {};
import { holds } from './core.js';
holds['w-howleave'] = () => { ui.welcomeLeave = true; draw(); };

export { PARTS, syncDevBook, route, back, HOME };
