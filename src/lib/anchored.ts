// Pop-ups that drop from a button (the 📱 phones list, 🎲 Dice, Background ▾, a slide editor's Image picker…): fixed
// to the window, so no scrolling panel or window edge cuts them off, and drawn over everything around them (the stage,
// the host panel, the editor's panes). Under the button, or over it when there's more room above; moved in from the
// window's sides; and scrolling inside when even that is too short. Kept in place while open: as the window resizes,
// a panel scrolls, or the button moves or the pop-up's contents grow.

export type Rect = { left: number; top: number; right: number; bottom: number };

export type Side = 'below' | 'above';

export interface PlaceInput {
  /** The button it drops from. */
  anchor: Rect;
  /** The pop-up's own size (its height without a limit). */
  width: number;
  height: number;
  /** The window's size. */
  view: { width: number; height: number };
  /**
   * A box to keep it inside when it fits there (in a single window: the host panel, so it doesn't cover the stage
   * viewers see): whole, or scrolling with at least `minHeight` of room. Else the whole window is used.
   */
  within?: Rect | null;
  /** Below the button (the default), or above it. The other side when only that one has room. */
  side?: Side;
  /** Lined up with the button's left edge ('start', the default) or its right edge ('end'). */
  align?: 'start' | 'end';
  /** Between the button and the pop-up. */
  gap?: number;
  /** Kept clear of the window's edges. */
  margin?: number;
  /** The least height worth scrolling in `within` rather than going outside it. */
  minHeight?: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Its height may not exceed this: it scrolls inside instead. */
  maxHeight: number;
  maxWidth: number;
  side: Side;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

/** Where a pop-up goes (see PlaceInput): window coordinates for `position: fixed`. */
export function placePopup(p: PlaceInput): Placement {
  const gap = p.gap ?? 4;
  const margin = p.margin ?? 8;
  const view: Rect = { left: margin, top: margin, right: p.view.width - margin, bottom: p.view.height - margin };
  const inner: Rect | null = p.within
    ? {
        // (A little in from its edges.)
        left: Math.max(view.left, p.within.left + 4),
        top: Math.max(view.top, p.within.top + 4),
        right: Math.min(view.right, p.within.right - 4),
        bottom: Math.min(view.bottom, p.within.bottom - 4),
      }
    : null;
  const sides: Side[] = p.side === 'above' ? ['above', 'below'] : ['below', 'above'];
  const room = (b: Rect, s: Side) => (s === 'below' ? b.bottom - (p.anchor.bottom + gap) : p.anchor.top - gap - b.top);
  const best = (b: Rect) => (room(b, sides[0]) >= room(b, sides[1]) ? sides[0] : sides[1]);
  const minHeight = Math.min(p.minHeight ?? 160, p.height);

  // In `within` whole, then scrolling there; in the window whole, then where it has the most room.
  let bounds = view;
  let side: Side | undefined;
  for (const b of inner ? [inner, view] : [view]) {
    side = sides.find((s) => room(b, s) >= p.height);
    if (side) {
      bounds = b;
      break;
    }
    if (b === inner && room(b, best(b)) >= minHeight) {
      bounds = b;
      side = best(b);
      break;
    }
  }
  if (!side) side = best(view);

  const maxHeight = Math.max(0, Math.floor(Math.min(room(bounds, side), view.bottom - view.top)));
  const h = Math.min(p.height, maxHeight);
  // (Kept on screen even when its button has scrolled out of sight.)
  const top = clamp(side === 'below' ? p.anchor.bottom + gap : p.anchor.top - gap - h, view.top, Math.max(view.top, view.bottom - h));

  const maxWidth = Math.max(0, view.right - view.left);
  const w = Math.min(p.width, maxWidth);
  const across = inner && inner.right - inner.left >= w ? inner : view;
  const left = clamp(clamp(p.align === 'end' ? p.anchor.right - w : p.anchor.left, across.left, across.right - w), view.left, Math.max(view.left, view.right - w));
  return { left: Math.round(left), top: Math.round(top), maxHeight, maxWidth, side };
}

export interface AnchoredOptions {
  /** The button it drops from (by default the element it's placed in, which holds that button). */
  anchor?: HTMLElement | null;
  /** A box to keep it inside when there's room: an element, or a selector for the nearest one around it. */
  within?: HTMLElement | string | null;
  side?: Side;
  align?: 'start' | 'end';
  gap?: number;
  margin?: number;
  minHeight?: number;
  /** Its stacking level (by default var(--z-menu): over the stage, the panels and windows). */
  z?: string;
}

/**
 * `use:anchored={{ … }}` on a pop-up (see placePopup): fixed to the window and kept there while it's open. Its own CSS
 * gives its look, width and an upper limit on its height (`max-height`, kept); this sets its place, `max-height` and
 * z-index. It should scroll inside (`overflow: auto`) for when it's taller than the room it has.
 */
export function anchored(node: HTMLElement, options: AnchoredOptions = {}): { update: (o: AnchoredOptions) => void; destroy: () => void } {
  let o = options;
  let key = '';
  let viewKey = '';
  let cssMax = Infinity;
  let frame = 0;
  const s = node.style;
  s.position = 'fixed';
  s.right = s.bottom = 'auto';
  s.margin = '0';

  function within(): HTMLElement | null {
    if (!o.within) return null;
    return typeof o.within === 'string' ? (node.parentElement?.closest<HTMLElement>(o.within) ?? null) : o.within;
  }

  function place(): void {
    const anchorEl = o.anchor ?? node.parentElement;
    if (!anchorEl?.isConnected) return;
    const a = anchorEl.getBoundingClientRect();
    // A button out of the page's layout (hidden): leave the pop-up where it was.
    if (!a.width && !a.height) return;
    const view = { width: document.documentElement.clientWidth || innerWidth, height: document.documentElement.clientHeight || innerHeight };
    const vk = `${view.width}x${view.height}`;
    if (vk !== viewKey) {
      // Its own CSS limit (60vh, 420px…), read again as the window changes size.
      viewKey = vk;
      s.maxHeight = '';
      cssMax = parseFloat(getComputedStyle(node).maxHeight) || Infinity;
      // Its width measured at the window's left (by the right edge it would wrap narrower).
      s.maxWidth = '';
      s.left = '0px';
    }
    const box = within()?.getBoundingClientRect();
    // Its height uncut: what it holds, plus its borders.
    const height = Math.min(cssMax, node.scrollHeight + node.offsetHeight - node.clientHeight);
    const width = node.offsetWidth;
    const k = [a.left, a.top, a.right, a.bottom, vk, height, width, box?.left, box?.top, box?.right, box?.bottom, o.side, o.align].join();
    if (k === key) return;
    key = k;
    const p = placePopup({ anchor: a, width, height, view, within: box, side: o.side, align: o.align, gap: o.gap, margin: o.margin, minHeight: o.minHeight });
    s.maxHeight = `${p.maxHeight}px`;
    s.maxWidth = `${p.maxWidth}px`;
    s.left = `${p.left}px`;
    s.top = `${p.top}px`;
    // Inside something that moves `position: fixed` (a transform, a filter): placed by where it really landed.
    const r = node.getBoundingClientRect();
    const dx = r.left - p.left;
    const dy = r.top - p.top;
    if (Math.abs(dx) > 0.5) s.left = `${p.left - dx}px`;
    if (Math.abs(dy) > 0.5) s.top = `${p.top - dy}px`;
  }

  function loop(): void {
    place();
    frame = requestAnimationFrame(loop);
  }
  s.zIndex = o.z ?? 'var(--z-menu)';
  place();
  frame = requestAnimationFrame(loop);

  return {
    update(next) {
      o = next;
      s.zIndex = o.z ?? 'var(--z-menu)';
      key = '';
      place();
    },
    destroy() {
      cancelAnimationFrame(frame);
    },
  };
}
