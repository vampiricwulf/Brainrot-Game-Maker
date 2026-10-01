// Pure helpers behind the slide and image editors: undo history, placement, crop geometry, pastes and playback.
// (Hit testing and restacking live in layers.ts.) No DOM or Svelte state here, so all of it is
// unit-tested (editing.test.ts).
import { SLIDE_H, SLIDE_W, type SlideElement } from './model';

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

/** A slide item as far as placing a new picture goes. */
export interface PlacedItem extends Box {
  id: string;
  kind: string;
}

/**
 * Where a new picture (w × h, already sized for the slide) goes, so it doesn't land on the question's text. A slide
 * with nothing on it but its main text box (a clue's question, as new): the picture takes the upper part and the text
 * box moves into a band below it (`text`, its new box). Otherwise the picture goes beside, above or below the text,
 * where it can be biggest (shrunk to fit, never grown), or in the middle when there's no text or no room.
 * Audio items don't count (they're hidden in play or a small icon).
 */
export function placePicture(items: PlacedItem[], w: number, h: number, W = SLIDE_W, H = SLIDE_H): { box: Box; text?: { id: string; box: Box } } {
  const centred = { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
  const shown = items.filter((e) => e.kind !== 'audio');
  const texts = shown.filter((e) => e.kind === 'text');
  if (!texts.length) return { box: centred };
  const M = 40;
  const GAP = 30;
  // Fit into a region, no bigger than it was.
  const fit = (r: Box): Box | null => {
    const k = Math.min(1, r.w / w, r.h / h);
    if (!(k > 0)) return null;
    const bw = Math.round(w * k);
    const bh = Math.round(h * k);
    return { x: Math.round(r.x + (r.w - bw) / 2), y: Math.round(r.y + (r.h - bh) / 2), w: bw, h: bh };
  };
  if (shown.length === 1) {
    // The question alone: the picture on top, the text in the band below (at least 310 of the 1080 high).
    const t = texts[0];
    const band = { x: 120, y: 50, w: W - 240, h: Math.round(H * 0.6) - 50 };
    const pic = fit(band)!;
    pic.y = band.y;
    const top = pic.y + pic.h + GAP;
    return { box: pic, text: { id: t.id, box: { x: 120, y: top, w: W - 240, h: H - 50 - top } } };
  }
  // Around the text: the free strips above, below, left and right of all of it.
  const x0 = Math.min(...texts.map((e) => e.x));
  const y0 = Math.min(...texts.map((e) => e.y));
  const x1 = Math.max(...texts.map((e) => e.x + e.w));
  const y1 = Math.max(...texts.map((e) => e.y + e.h));
  const strips: Box[] = [
    { x: M, y: M, w: W - 2 * M, h: y0 - GAP - M },
    { x: M, y: y1 + GAP, w: W - 2 * M, h: H - M - y1 - GAP },
    { x: M, y: M, w: x0 - GAP - M, h: H - 2 * M },
    { x: x1 + GAP, y: M, w: W - M - x1 - GAP, h: H - 2 * M },
  ];
  let best: Box | null = null;
  for (const s of strips) {
    if (s.w <= 0 || s.h <= 0) continue;
    const b = fit(s);
    if (b && (!best || b.w * b.h > best.w * best.h)) best = b;
  }
  // Too small to see (under a sixth of its size, or a sliver): the middle, as before.
  return { box: best && best.w * best.h >= (w * h) / 6 && Math.min(best.w, best.h) >= 120 ? best : centred };
}

/**
 * Move a new picture (not on the slide yet) to its place among `elements` (see placePicture), and the main text with
 * it when that moves too. A text box that doesn't shrink its words to fit gets a smaller size to match its new box.
 */
export function placeNewPicture(elements: SlideElement[], pic: Box): void {
  const { box, text } = placePicture(elements, pic.w, pic.h);
  Object.assign(pic, box);
  const t = text && elements.find((e) => e.id === text.id);
  if (t?.kind !== 'text') return;
  if (!t.autoFit) t.size = Math.max(12, Math.round(t.size * Math.min(1, text!.box.h / t.h, text!.box.w / t.w)));
  Object.assign(t, text!.box);
}

// ---------- Links ----------

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|mp3|wav|ogg|oga|m4a|aac|flac|opus|mp4|webm|mov|m4v|ogv|mkv)$/i;

/**
 * Whether pasted or dropped text is a link to online media (a direct image, video or audio file, or a
 * link from a media site `isMediaSite` knows: YouTube, Google Drive, catbox…). Plain text and links to
 * ordinary web pages return false.
 */
export function isMediaLink(text: string, isMediaSite: (url: string) => boolean): boolean {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return false;
  if (isMediaSite(t)) return true;
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

/**
 * The box for a picture whose shape changed (🎨 Edit image › Apply after a crop or a turn): the new shape (`aspect`,
 * width ÷ height) with the same area as the old box, centred where it was, and kept on the slide (W × H). So applying
 * again never shrinks it, and a quarter turn just swaps its width and height.
 */
export function fitAspect(o: Box, aspect: number, W = 1920, H = 1080): Box {
  if (!(aspect > 0) || !Number.isFinite(aspect) || !(o.w > 0) || !(o.h > 0)) return { ...o };
  const w = Math.sqrt(o.w * o.h * aspect);
  return resizeAround(o, w, w / aspect, W, H);
}

/** A box of size w × h centred where `o` is, no bigger than the slide (W × H, keeping its shape) and on it. */
export function resizeAround(o: Box, w: number, h: number, W = 1920, H = 1080): Box {
  const k = Math.min(1, W / w, H / h);
  w *= k;
  h *= k;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const x = Math.min(W - w, Math.max(0, cx - w / 2));
  const y = Math.min(H - h, Math.max(0, cy - h / 2));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

// ---------- Pasting ----------

/**
 * A paste from Word, PowerPoint, Excel or OneNote: besides the text (and its HTML) they put a picture of it on the
 * clipboard, which isn't what was meant. Pasted with text and one picture, Office-made HTML (Mso styles, Office's XML
 * namespaces, a table) goes in as the text.
 */
export function officeTextPaste(html: string, text: string, files: number): boolean {
  return files === 1 && !!text.trim() && /class=["']?Mso|urn:schemas-microsoft-com|<table[\s>]/i.test(html);
}

// ---------- Playback ----------

/**
 * Where a clip plays from and to (the Inspector's Start at / Stop at, in seconds): never before the start, and a stop
 * at or before the start is no stop at all (it plays to the end, rather than seeking back forever on a loop).
 */
export function playRange(startAt: number | undefined, endAt: number | undefined): { start: number; end?: number } {
  const start = Number.isFinite(startAt) && startAt! > 0 ? startAt! : 0;
  return { start, end: Number.isFinite(endAt) && endAt! > start ? endAt : undefined };
}
