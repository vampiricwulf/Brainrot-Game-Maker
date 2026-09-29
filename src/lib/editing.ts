// Pure helpers behind the slide and image editors: undo history, placement and crop geometry.
// (Hit testing and restacking live in layers.ts.) No DOM or Svelte state here, so all of it is
// unit-tested (editing.test.ts).
import { SLIDE_H, SLIDE_W } from './model';

// ---------- Undo history ----------

/**
 * Snapshot undo/redo. `last` is the state the stacks already account for, and commit(now) records
 * the step from `last` to `now`. Undo and redo commit first, so a change made a moment ago (still
 * waiting for its debounce) is never skipped or lost.
 */
export class SnapshotHistory {
  undoStack: string[] = [];
  redoStack: string[] = [];

  constructor(
    public last: string,
    private limit = 100,
  ) {}

  /** Record `now` as one step if it differs from the last recorded state. Returns whether it did. */
  commit(now: string): boolean {
    if (now === this.last) return false;
    this.undoStack.push(this.last);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.last = now;
    return true;
  }

  /** Step back from `now`. Returns the state to restore, or null when there's nothing to undo. */
  undo(now: string): string | null {
    this.commit(now);
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(this.last);
    this.last = prev;
    return prev;
  }

  /** Step forward again. A change made since the last undo clears the redo stack first. */
  redo(now: string): string | null {
    this.commit(now);
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(this.last);
    this.last = next;
    return next;
  }
}

// ---------- Placement (slide coordinates, 1920×1080) ----------

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How many diagonal steps to shift new items (pasted copies, a new text box) so that none of them
 * lands exactly on top of an existing item, which would look like nothing happened.
 */
export function freeOffset(items: { x: number; y: number }[], existing: { x: number; y: number }[], step = 30): number {
  const taken = (k: number) => items.some((c) => existing.some((o) => o.x === c.x + k * step && o.y === c.y + k * step));
  let k = 0;
  while (k < 40 && taken(k)) k++;
  return k;
}

/**
 * Where to draw an element's rotate handle, `dist` slide pixels from its edge: above it, below it
 * when the top one would be off the slide, or just inside its top edge (e.g. a full-bleed image).
 */
export function knobPlacement(el: Box & { rotation: number }, dist: number): 'above' | 'below' | 'inside' {
  const th = (el.rotation * Math.PI) / 180;
  const cx = el.x + el.w / 2;
  const cy = el.y + el.h / 2;
  // A point on the element's own vertical axis, `d` from its center (negative = towards its top).
  const on = (d: number) => {
    const x = cx - d * Math.sin(th);
    const y = cy + d * Math.cos(th);
    return x >= 0 && x <= SLIDE_W && y >= 0 && y <= SLIDE_H;
  };
  if (on(-(el.h / 2 + dist))) return 'above';
  if (on(el.h / 2 + dist)) return 'below';
  return 'inside';
}

// ---------- Links ----------

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|mp3|wav|ogg|oga|m4a|aac|flac|opus|mp4|webm|mov|m4v|ogv|mkv)$/i;

/**
 * Whether pasted or dropped text is a link to online media we can show (YouTube, or a direct image,
 * video or audio file). Plain text and links to ordinary web pages return false.
 */
export function isMediaLink(text: string, isYouTube: (url: string) => boolean): boolean {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return false;
  if (isYouTube(t)) return true;
  try {
    return MEDIA_EXT.test(new URL(t).pathname);
  } catch {
    return false;
  }
}

// ---------- Image crop ----------

/**
 * Resize a crop box (fractions 0..1 of the image) by dragging one handle while keeping its shape.
 * `ratio` is the box's height per unit of width in those fractions (pixel aspect × image W/H).
 * Corners anchor the opposite corner and follow whichever way the pointer moved more (in or out);
 * edges anchor the opposite edge and keep the box centred on the other axis. The box always stays
 * inside the image, shrinking on both axes together so the ratio holds.
 */
export function aspectCrop(mode: string, o: Box, dx: number, dy: number, ratio: number, min = 0.02): Box {
  const sx = mode.includes('e') ? 1 : mode.includes('w') ? -1 : 0;
  const sy = mode.includes('s') ? 1 : mode.includes('n') ? -1 : 0;
  // The fixed point: the opposite corner or edge (the centre on an axis the handle doesn't move).
  const ax = sx > 0 ? o.x : sx < 0 ? o.x + o.w : o.x + o.w / 2;
  const ay = sy > 0 ? o.y : sy < 0 ? o.y + o.h : o.y + o.h / 2;
  const wantW = o.w + sx * dx;
  const wantH = o.h + sy * dy;
  // A corner goes by the bigger pointer move, measured in width (a height change of dy is dy / ratio).
  const byW = sx !== 0 && (sy === 0 || Math.abs(dx) >= Math.abs(dy) / ratio);
  let w = byW ? wantW : wantH / ratio;
  const maxW = sx > 0 ? 1 - ax : sx < 0 ? ax : 1;
  const maxH = sy > 0 ? 1 - ay : sy < 0 ? ay : 1;
  w = Math.min(w, maxW, maxH / ratio);
  w = Math.max(w, min, min / ratio);
  const h = w * ratio;
  const clamp = (v: number, size: number) => Math.min(1 - size, Math.max(0, v));
  const x = clamp(sx > 0 ? ax : sx < 0 ? ax - w : ax - w / 2, w);
  const y = clamp(sy > 0 ? ay : sy < 0 ? ay - h : ay - h / 2, h);
  return { x, y, w, h };
}
