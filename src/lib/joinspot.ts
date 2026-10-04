// Where the phone buzzers' join code goes on a slide (1920×1080 stage coordinates): a corner with nothing of the slide
// under it, so it never covers a word or a picture. Full size first, then just the code; nowhere free, not at all.
import type { Slide, SlideElement } from './model';

export type Corner = 'br' | 'tr' | 'tl' | 'bl';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 1920;
const H = 1080;
const EDGE = 24;
/** The badge's size: with "📱 Buzz in", the code and the link; and just "📱 CODE". */
export const BADGE_FULL = { w: 440, h: 140 };
export const BADGE_SMALL = { w: 300, h: 76 };
/** The order corners are tried in: the usual one first. */
const CORNERS: Corner[] = ['br', 'tr', 'tl', 'bl'];

/** What viewers see of an item, as a box around it (turned items: the box around the turned one). */
function seen(e: SlideElement): Rect | null {
  if (e.secret || e.opacity <= 0) return null;
  if (e.kind === 'text' && !e.text.trim()) return null;
  if (e.kind === 'audio' && !e.visible) return null;
  const r = ((e.rotation % 360) * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const w = e.w * c + e.h * s;
  const h = e.w * s + e.h * c;
  return { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h / 2, w, h };
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function cornerRect(corner: Corner, size: { w: number; h: number }): Rect {
  return {
    x: corner.endsWith('r') ? W - EDGE - size.w : EDGE,
    y: corner.startsWith('b') ? H - EDGE - size.h : EDGE,
    ...size,
  };
}

/**
 * The first free corner for the badge on `slide`, full size or small. `scale`: the slide drawn smaller from the bottom
 * middle (under a countdown). `taken`: other things on screen there (the caption, the slide dots, the countdown). An
 * item filling (nearly) the whole stage is a backdrop, not something the badge would hide.
 */
export function joinSpot(slide: Slide | undefined, taken: Rect[] = [], scale = 1): { corner: Corner; small: boolean } | null {
  const boxes = (slide?.elements ?? []).flatMap((e) => {
    const b = seen(e);
    if (!b) return [];
    const x0 = Math.max(0, b.x);
    const y0 = Math.max(0, b.y);
    const x1 = Math.min(W, b.x + b.w);
    const y1 = Math.min(H, b.y + b.h);
    if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) >= 0.85 * W * H) return [];
    // Drawn smaller towards the bottom middle.
    return [{ x: W / 2 + (x0 - W / 2) * scale, y: H - (H - y0) * scale, w: (x1 - x0) * scale, h: (y1 - y0) * scale }];
  });
  const all = [...boxes, ...taken];
  for (const small of [false, true]) {
    for (const corner of CORNERS) {
      const r = cornerRect(corner, small ? BADGE_SMALL : BADGE_FULL);
      if (!all.some((b) => overlaps(r, b))) return { corner, small };
    }
  }
  return null;
}
