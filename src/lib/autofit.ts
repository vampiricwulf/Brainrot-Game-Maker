// Svelte action: shrink an element's font until its content fits its box.
// Measured in unscaled layout pixels, so it works inside the scaled Stage. It re-fits after the DOM
// has really changed (new text, box size, a font finishing loading), so it never measures the
// previous content, and it shrinks the font before it ever breaks a word in the middle.
// Every box waiting for a fit is fitted together: all of them try a size, then all of them are
// measured, so a page full of text (a big RPG map's thumbnails) costs one layout per try, not one per box.

export interface FitResult {
  /** Font size in use (px). */
  size: number;
  /** The content still overflows, even at the smallest size. */
  overflow: boolean;
}

export interface AutofitOptions {
  size: number;
  enabled: boolean;
  /** Everything that affects layout besides the text itself (font, box size…); a change re-fits. */
  text?: string;
  /** Smallest size to shrink to (px). */
  min?: number;
  /**
   * Where a word longer than the line still doesn't fit at the smallest size, hyphenate it (at the largest size that
   * fits that way) before breaking it anywhere. The text must carry soft hyphens where it may break (softHyphens).
   */
  hyphenate?: boolean;
  /** With hyphenate: text that doesn't fit even hyphenated at `min` may go down to this size instead of being cut off. */
  floor?: number;
  /** Never break a word: at the smallest size, what's left over is cut (CSS shows "…" where it's set). */
  noBreak?: boolean;
  /**
   * Boxes with the same group all take the smallest size any of them fits at (a board's values, a bar's scores), so
   * they read as one set instead of one odd number shrunk on its own.
   */
  group?: string;
  /** Told the fitted size after every fit (the slide editor shows it). */
  onfit?: (r: FitResult) => void;
}

/** One size to try, and how words may break at it. The fitting is then told whether the content overflows. */
interface Try {
  size: number;
  wrap: '' | 'normal' | 'hyphen' | 'anywhere';
}

/** The largest whole number in [lo, hi] that fits (doesn't overflow), or lo if none does. */
function* largest(lo: number, hi: number, wrap: Try['wrap']): Generator<Try, number, boolean> {
  if (hi <= lo || !(yield { size: hi, wrap })) return Math.max(lo, hi);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (yield { size: mid, wrap }) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** The largest whole number in [lo, hi] for which fits() holds, or lo if none does (fits must be monotonic). */
export function largestFitting(lo: number, hi: number, fits: (n: number) => boolean): number {
  const search = largest(lo, hi, 'normal');
  let step = search.next();
  while (!step.done) step = search.next(!fits(step.value.size));
  return step.value;
}

/** The sizes one box tries, ending on the one it keeps (which is the last one tried). */
function* fitting({ size, enabled, min = 12, hyphenate, noBreak, floor }: AutofitOptions): Generator<Try, FitResult, boolean> {
  // Words stay whole: the longest one must fit on a line. Only if that's impossible even at the
  // smallest size are words hyphenated (if asked) or allowed to break (then at the largest size that fits that way).
  if (!enabled) return { size, overflow: yield { size, wrap: '' } };
  if (!(yield { size, wrap: 'normal' })) return { size, overflow: false };
  const lo = Math.min(min, size);
  let s = yield* largest(lo, size, 'normal');
  const left = yield { size: s, wrap: 'normal' };
  if (!left || noBreak) return { size: s, overflow: left };
  if (hyphenate) {
    s = yield* largest(lo, size, 'hyphen');
    if (!(yield { size: s, wrap: 'hyphen' })) return { size: s, overflow: false };
    // Still too much for the box: smaller than the smallest after all (down to `floor`), rather than cut off.
    if (floor !== undefined && floor < lo) {
      s = yield* largest(floor, lo, 'hyphen');
      if (!(yield { size: s, wrap: 'hyphen' })) return { size: s, overflow: false };
    }
  }
  s = yield* largest(lo, size, 'anywhere');
  return { size: s, overflow: yield { size: s, wrap: 'anywhere' } };
}

/**
 * The size a box keeps, given whether its content overflows at a size and wrap mode (`measure` stands in for the
 * page: the tests use it to check the fitting without a browser).
 */
export function fitWith(opts: AutofitOptions, measure: (size: number, wrap: Try['wrap']) => boolean): FitResult & { wrap: Try['wrap'] } {
  const steps = fitting(opts);
  let step = steps.next();
  let last: Try = { size: opts.size, wrap: '' };
  while (!step.done) {
    last = step.value;
    step = steps.next(measure(last.size, last.wrap));
  }
  return { ...step.value, wrap: last.wrap };
}

/** The one size a group of boxes shares: the smallest any of them fits at (none: undefined). */
export function groupSize(sizes: (number | undefined)[]): number | undefined {
  const known = sizes.filter((n): n is number => typeof n === 'number');
  return known.length ? Math.min(...known) : undefined;
}

/**
 * One try's size and line breaking. A box that may hyphenate has soft hyphens in its long words (see softHyphens):
 * they're break points only in the 'hyphen' tries, so no word is broken while shrinking would do.
 */
function applyTry(node: HTMLElement, t: Try, hyphenate?: boolean): void {
  node.style.fontSize = `${t.size}px`;
  node.style.overflowWrap = t.wrap === 'hyphen' ? 'normal' : t.wrap;
  node.style.hyphens = !hyphenate ? '' : t.wrap === 'hyphen' ? 'manual' : 'none';
}

/**
 * The content doesn't fit its box. A one-line box that cuts its text ("…", noBreak) is measured with a pixel to spare:
 * sizes are whole pixels, and a fraction of a pixel over is enough for the browser to cut the last character.
 */
function overflows(node: HTMLElement, strict = false): boolean {
  const inner = node.firstElementChild as HTMLElement | null;
  if (!inner) return node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
  const cs = getComputedStyle(node);
  const boxW = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const boxH = node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const wide = strict ? inner.scrollWidth > boxW - 1.5 : Math.max(inner.scrollWidth, inner.offsetWidth) > boxW + 0.5;
  return wide || Math.max(inner.scrollHeight, inner.offsetHeight) > boxH + 0.5;
}

interface Box {
  node: HTMLElement;
  opts: () => AutofitOptions;
  fitted: (r: FitResult) => void;
  /** The size this box fits at on its own (before its group's shared size). */
  natural?: number;
}

/** Boxes waiting for a fit, fitted together in a microtask (before the next paint). */
const waiting = new Set<Box>();

function request(box: Box): void {
  if (!waiting.size) queueMicrotask(fitAll);
  waiting.add(box);
}

function fitAll(): void {
  let live = [...waiting]
    .filter((box) => box.node.isConnected)
    .map((box) => {
      const steps = fitting(box.opts());
      return { box, steps, step: steps.next() };
    });
  waiting.clear();
  while (live.length) {
    // Every box sets its size first, then every box is measured: one layout for the lot.
    for (const { box, step } of live) applyTry(box.node, step.value as Try, box.opts().hyphenate);
    for (const x of live) x.step = x.steps.next(overflows(x.box.node, !!x.box.opts().noBreak));
    live = live.filter((x) => {
      if (!x.step.done) return true;
      const r = x.step.value;
      x.box.natural = r.size;
      const g = x.box.opts().group;
      if (g) groups.add(g);
      else x.box.fitted(r);
      return false;
    });
  }
  // A group's boxes all take its smallest size (smaller than its own never makes a box overflow).
  for (const g of groups) {
    const members = [...boxes.values()].filter((b) => b.opts().group === g && b.node.isConnected);
    const size = groupSize(members.map((b) => b.natural));
    if (size === undefined) continue;
    for (const b of members) {
      b.node.style.fontSize = `${size}px`;
      b.fitted({ size, overflow: false });
    }
  }
  groups.clear();
}

/** Groups with a box fitted in this pass. */
const groups = new Set<string>();

/** Every box on the page, by its element. */
const boxes = new Map<Element, Box>();
let resized: ResizeObserver | null = null;

/** One watcher for all boxes: a box re-fits when its size changes, and all of them when a font finishes loading. */
function watch(box: Box): void {
  if (!boxes.size) {
    resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((all) => all.forEach((e) => boxes.get(e.target) && request(boxes.get(e.target)!)));
    document.fonts?.addEventListener?.('loadingdone', fitEverything);
  }
  boxes.set(box.node, box);
  resized?.observe(box.node);
}

function unwatch(box: Box): void {
  boxes.delete(box.node);
  waiting.delete(box);
  resized?.unobserve(box.node);
  // The rest of its group may grow back now (a long score gone from the bar).
  const g = box.opts().group;
  if (g) for (const b of boxes.values()) if (b.opts().group === g) request(b);
  if (boxes.size) return;
  resized?.disconnect();
  resized = null;
  document.fonts?.removeEventListener?.('loadingdone', fitEverything);
}

function fitEverything(): void {
  boxes.forEach(request);
}

export function autofit(node: HTMLElement, opts: AutofitOptions) {
  let reported = '';
  const box: Box = {
    node,
    opts: () => opts,
    fitted(r) {
      const key = `${r.size}|${r.overflow}`;
      if (opts.onfit && key !== reported) {
        reported = key;
        opts.onfit(r);
      }
    },
  };
  // Svelte runs an action's update before it writes the new text to the DOM, so fits wait for a
  // microtask (still before the next paint), where they're coalesced.
  const schedule = () => request(box);

  schedule();
  const mo = new MutationObserver(schedule);
  mo.observe(node, { childList: true, characterData: true, subtree: true });
  // Fonts can load after first layout (or when a new font is picked): every box refits when they arrive.
  watch(box);
  if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(schedule);

  return {
    update(o: AutofitOptions) {
      opts = o;
      schedule();
    },
    destroy() {
      mo.disconnect();
      unwatch(box);
    },
  };
}

/**
 * Soft hyphens (U+00AD) inside long words, where a hyphenating box may break them, never leaving fewer than 3 letters
 * on either side. They're invisible unless a word is broken there (then a "-" shows). Browsers' own hyphenation needs
 * a dictionary a stream PC may not have; these always work.
 */
export function softHyphens(text: string, from = 8): string {
  return text.replace(new RegExp(`\\p{L}{${from},}`, 'gu'), (w) => {
    const ch = Array.from(w);
    return ch.map((c, i) => (i >= 3 && i <= ch.length - 3 ? '\u00ad' + c : c)).join('');
  });
}
