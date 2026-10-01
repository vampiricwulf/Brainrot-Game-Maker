// How big the board's words can be, so they stay readable once the stream is scaled down (720p, 480p in Discord).
import { boardLayout, type Theme } from './theme';

/** Category names never shrink below this (stage px): about 13px tall at 480p. Longer words are hyphenated instead. */
export const CAT_MIN = 30;
/** Only a name too long for its cell even then goes smaller, down to this (the editor's checklist says to shorten it). */
export const CAT_FLOOR = 20;

/** The board's padding and gaps, and a cell's padding (Board.svelte). */
const PAD = 10;
const GAP = 10;
const CELL_PAD = 12;
/** Roughly how wide the board fonts are per character, for their size (upper case, a narrow display font). */
const CHAR = 0.55;
const LINE = 1.05;

/** A category cell's room for its name (stage px) on a board of `cols` × `rows`. */
export function categoryBox(cols: number, rows: number, theme?: Theme, hasBanner = !!theme?.banner): { w: number; h: number } {
  const board = boardLayout(theme, hasBanner).board.height;
  const w = (1920 - 2 * PAD - GAP * (cols - 1)) / Math.max(1, cols) - 2 * CELL_PAD;
  const h = ((board - 2 * PAD - GAP * rows) * 1.35) / (1.35 + rows) - 2 * CELL_PAD - 6;
  return { w, h };
}

/** How many lines `text` takes at `size` px in a box `w` wide, words wrapped whole (a word too long for a line takes several). */
export function linesAt(text: string, size: number, w: number): number {
  const per = Math.max(1, Math.floor(w / (CHAR * size)));
  let lines = 0;
  let used = 0;
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const len = word.length;
    if (len > per) {
      // On lines of its own, hyphenated.
      const n = Math.ceil(len / per);
      lines += n;
      used = len - (n - 1) * per;
      continue;
    }
    if (!used) {
      lines++;
      used = len;
    } else if (used + 1 + len <= per) used += 1 + len;
    else {
      lines++;
      used = len;
    }
  }
  return lines;
}

/** A category name that won't fit its cell even at the smallest size (an estimate: the editor's checklist warns). */
export function categoryTooLong(title: string, cols: number, rows: number, theme?: Theme): boolean {
  if (!title.trim()) return false;
  const { w, h } = categoryBox(cols, rows, theme);
  return linesAt(title, CAT_MIN, w) * CAT_MIN * LINE > h;
}
