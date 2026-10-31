// The arrow keys on a page of cards in a grid (the editor's first screen): ← / → go to the card before or after it,
// ↑ / ↓ to the row above or below, to the card there most in line with this one.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type Arrow = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export const isArrow = (key: string): key is Arrow => key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';

/** The card an arrow goes to from card `from` (`boxes` in reading order), or -1 when there's none that way. */
export function cardToward(boxes: readonly Box[], from: number, key: Arrow): number {
  if (key === 'ArrowLeft') return from > 0 ? from - 1 : -1;
  if (key === 'ArrowRight') return from < boxes.length - 1 ? from + 1 : -1;
  const at = boxes[from];
  if (!at) return -1;
  const up = key === 'ArrowUp';
  // The cards wholly above (or below) it, then the row of them nearest it.
  const ahead = boxes.map((b, i) => ({ b, i })).filter(({ b }) => (up ? b.top + b.height <= at.top + 1 : b.top >= at.top + at.height - 1));
  if (!ahead.length) return -1;
  const rowTop = up ? Math.max(...ahead.map(({ b }) => b.top)) : Math.min(...ahead.map(({ b }) => b.top));
  const mid = (b: Box) => b.left + b.width / 2;
  let best = -1;
  let off = Infinity;
  for (const { b, i } of ahead) {
    if (Math.abs(b.top - rowTop) > 2) continue;
    const d = Math.abs(mid(b) - mid(at));
    if (d < off - 0.5) [best, off] = [i, d];
  }
  return best;
}
