// Pages instead of scrolling, as on the phone: a page shows whole rows only, the next page starts
// on the first row that didn't fit, and the last page starts on a row too (blank paper after it)
// rather than repeating the end of the one before. A label stays with what it labels.

/** Turns pages in `viewport` (fixed height) over `content` (its full height). */
export class Pager {
  constructor(viewport, content, { onEdge = null, countEl = null, bottom = false, start = 0, onTurn = null } = {}) {
    this.viewport = viewport;
    this.content = content;
    this.onEdge = onEdge;
    this.countEl = countEl;
    this.onTurn = onTurn;
    this.v = start;
    this.bottom = bottom;
    this.cover = document.createElement('div');
    this.cover.className = 'page-cover';
    viewport.appendChild(this.cover);
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(viewport);
    this.observer.observe(content);
    this.layout();
  }

  destroy() { this.observer.disconnect(); }

  get h() { return this.viewport.clientHeight; }
  get end() { return this.content.offsetHeight; }

  /** Every row a page may start on: marked ones (.a) and the content's own children. */
  spans() {
    const base = this.content.getBoundingClientRect().top;
    const els = new Set([...this.content.children, ...this.content.querySelectorAll('.a')]);
    return [...els].filter((el) => el.offsetParent !== null || el === this.content).map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - base, bottom: r.bottom - base, keep: el.classList.contains('keep') };
    }).filter((s) => s.bottom > s.top);
  }

  /** A break moved up above a label that ends just over it. */
  kept(t, v, spans) {
    let at = t;
    for (;;) {
      const k = spans.find((s) => s.keep && s.top > v + 1 && s.top < at && s.bottom <= at + 1 && s.bottom >= at - 16);
      if (!k) return at;
      at = k.top;
    }
  }

  next(v, spans) {
    const h = this.h;
    const over = spans.filter((s) => s.top > v + 1 && s.bottom > v + h + 1).map((s) => s.top);
    let t = over.length ? this.kept(Math.min(...over), v, spans) : v + h * 0.9;
    if (t <= v + 1) t = v + h * 0.9;
    return t;
  }

  starts(spans = this.spans()) {
    const h = this.h;
    if (h <= 0 || this.end <= h) return [0];
    const out = [0];
    let v = 0;
    while (v + h < this.end - 1 && out.length < 500) {
      v = this.next(v, spans);
      out.push(Math.round(v));
    }
    return out;
  }

  layout() {
    const spans = this.spans();
    const all = this.starts(spans);
    const fits = all.length === 1;
    // Content that fits sits at the foot, by the thumb, when asked to.
    this.content.style.top = fits && this.bottom ? `${Math.max(0, this.h - this.end)}px` : '0';
    if (!all.some((s) => Math.abs(s - this.v) <= 1)) this.v = [...all].reverse().find((s) => s <= this.v) ?? 0;
    this.content.style.transform = `translateY(${-this.v}px)`;
    // Paper over a row that runs off the bottom: it starts the next page.
    const v = this.v;
    const over = spans.filter((s) => s.top > v + 1 && s.bottom > v + this.h + 1 && s.top < v + this.h).map((s) => s.top);
    const cut = over.length ? this.kept(Math.min(...over), v, spans) - v : null;
    this.cover.style.display = cut != null && !fits ? 'block' : 'none';
    if (cut != null) this.cover.style.top = `${cut}px`;
    if (this.countEl) {
      if (fits) this.countEl.textContent = '';
      else {
        const i = all.findLastIndex((s) => s <= v + 1) + 1;
        this.countEl.textContent = i === 1 ? `${i} / ${all.length} · more ▶` : `${i} / ${all.length}`;
        this.countEl.classList.toggle('more', i === 1);
      }
    }
  }

  turn(dir) {
    const all = this.starts();
    const v = this.v;
    const atEdge = dir > 0 ? v >= all[all.length - 1] - 1 : v <= 0;
    if (atEdge) {
      if (this.onEdge) this.onEdge(dir);
      return;
    }
    this.v = dir > 0 ? all.find((s) => s > v + 1) : [...all].reverse().find((s) => s < v - 1) ?? 0;
    this.layout();
    if (this.onTurn) this.onTurn(this.v);
  }

  /** Turns to the page that shows `el`, a row inside the content. */
  reveal(el) {
    if (!el) return;
    const top = el.getBoundingClientRect().top - this.content.getBoundingClientRect().top;
    this.v = [...this.starts()].reverse().find((s) => s <= top + 1) ?? 0;
    this.layout();
  }

  toEnd() {
    const all = this.starts();
    this.v = all[all.length - 1];
    this.layout();
  }
}

/** Swipes on `el` turn pages: up or left for the next, down or right for the one before. */
export function swipe(el, onTurn) {
  let x = 0;
  let y = 0;
  let down = false;
  el.addEventListener('pointerdown', (e) => { down = true; x = e.clientX; y = e.clientY; });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;
    const dx = e.clientX - x;
    const dy = e.clientY - y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return;
    onTurn(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : -1) : (dy < 0 ? 1 : -1));
  });
  el.addEventListener('pointercancel', () => { down = false; });
  // A mouse wheel turns a page at a time.
  let last = 0;
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - last < 350 || Math.abs(e.deltaY) < 4) return;
    last = now;
    onTurn(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
}
