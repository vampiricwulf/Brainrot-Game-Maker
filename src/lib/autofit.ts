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
  /** Told the fitted size after every fit (the slide editor shows it). */
  onfit?: (r: FitResult) => void;
}

/** One size to try, and how words may break at it. The fitting is then told whether the content overflows. */
interface Try {
  size: number;
  wrap: '' | 'normal' | 'anywhere';
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
function* fitting({ size, enabled, min = 12 }: AutofitOptions): Generator<Try, FitResult, boolean> {
  // Words stay whole: the longest one must fit on a line. Only if that's impossible even at the
  // smallest size are words allowed to break (then at the largest size that fits that way).
  if (!enabled) return { size, overflow: yield { size, wrap: '' } };
  if (!(yield { size, wrap: 'normal' })) return { size, overflow: false };
  const lo = Math.min(min, size);
  let s = yield* largest(lo, size, 'normal');
  if (!(yield { size: s, wrap: 'normal' })) return { size: s, overflow: false };
  s = yield* largest(lo, size, 'anywhere');
  return { size: s, overflow: yield { size: s, wrap: 'anywhere' } };
}

function overflows(node: HTMLElement): boolean {
  const inner = node.firstElementChild as HTMLElement | null;
  if (!inner) return node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
  const cs = getComputedStyle(node);
  const boxW = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const boxH = node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  return Math.max(inner.scrollWidth, inner.offsetWidth) > boxW + 0.5 || Math.max(inner.scrollHeight, inner.offsetHeight) > boxH + 0.5;
}

interface Box {
  node: HTMLElement;
  opts: () => AutofitOptions;
  fitted: (r: FitResult) => void;
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
    for (const { box, step } of live) {
      const t = step.value as Try;
      box.node.style.fontSize = `${t.size}px`;
      box.node.style.overflowWrap = t.wrap;
    }
    for (const x of live) x.step = x.steps.next(overflows(x.box.node));
    live = live.filter((x) => {
      if (x.step.done) x.box.fitted(x.step.value);
      return !x.step.done;
    });
  }
}

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
