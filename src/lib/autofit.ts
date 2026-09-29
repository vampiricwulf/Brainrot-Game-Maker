// Svelte action: shrink an element's font until its content fits its box.
// Measured in unscaled layout pixels, so it works inside the scaled Stage. It re-fits after the DOM
// has really changed (new text, box size, a font finishing loading), so it never measures the
// previous content, and it shrinks the font before it ever breaks a word in the middle.

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

/** The largest whole number in [lo, hi] for which fits() holds, or lo if none does (fits must be monotonic). */
export function largestFitting(lo: number, hi: number, fits: (n: number) => boolean): number {
  if (hi <= lo || fits(hi)) return Math.max(lo, hi);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function autofit(node: HTMLElement, opts: AutofitOptions) {
  let reported = '';

  function overflows(): boolean {
    const inner = node.firstElementChild as HTMLElement | null;
    if (!inner) return node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth;
    const cs = getComputedStyle(node);
    const boxW = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const boxH = node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return Math.max(inner.scrollWidth, inner.offsetWidth) > boxW + 0.5 || Math.max(inner.scrollHeight, inner.offsetHeight) > boxH + 0.5;
  }

  function fit(): void {
    const { size, enabled } = opts;
    const min = Math.min(opts.min ?? 12, size);
    const set = (s: number) => (node.style.fontSize = `${s}px`);
    const fits = (s: number) => (set(s), !overflows());
    let s = size;
    set(s);
    if (!enabled) {
      node.style.overflowWrap = '';
    } else {
      // Words stay whole: the longest one must fit on a line. Only if that's impossible even at the
      // smallest size are words allowed to break (then at the largest size that fits that way).
      node.style.overflowWrap = 'normal';
      if (!fits(s)) {
        s = largestFitting(min, size, fits);
        if (!fits(s)) {
          node.style.overflowWrap = 'anywhere';
          s = largestFitting(min, size, fits);
        }
        set(s);
      }
    }
    const r = { size: s, overflow: overflows() };
    const key = `${r.size}|${r.overflow}`;
    if (opts.onfit && key !== reported) {
      reported = key;
      opts.onfit(r);
    }
  }

  // Svelte runs an action's update before it writes the new text to the DOM, so fits are deferred
  // to a microtask (still before the next paint) and coalesced.
  let queued = false;
  function schedule(): void {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (node.isConnected) fit();
    });
  }

  fit();
  const mo = new MutationObserver(schedule);
  mo.observe(node, { childList: true, characterData: true, subtree: true });
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  ro?.observe(node);
  // Fonts can load after first layout (or when a new font is picked); refit when they arrive.
  document.fonts?.ready.then(schedule);
  document.fonts?.addEventListener?.('loadingdone', schedule);

  return {
    update(o: AutofitOptions) {
      opts = o;
      schedule();
    },
    destroy() {
      mo.disconnect();
      ro?.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', schedule);
    },
  };
}
