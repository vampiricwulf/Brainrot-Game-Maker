// Layers in the slide editor: hit-testing rotated boxes (what's under the pointer, what a drag-to-select
// box touches), restacking, aligning, and placing pasted items. Stage coordinates (1920×1080).
import type { Align } from './layerlabel';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Is the point inside the box (rotated about its centre)? */
export function contains(b: Box, p: Pt): boolean {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const a = (-b.rotation * Math.PI) / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

/** Everything under a point, top-most first. */
export function elementsAt<T extends Box & { zIndex: number }>(els: T[], p: Pt): T[] {
  return els.filter((e) => contains(e, p)).sort((a, b) => b.zIndex - a.zIndex);
}

/** Axis-aligned bounds of a rotated box. */
export function bounds(b: Box): { x: number; y: number; w: number; h: number } {
  const a = (b.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = b.w * c + b.h * s;
  const h = b.w * s + b.h * c;
  return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
}

/**
 * Boxes a drag-to-select rectangle (any two corners) touches, leaving out any the whole rectangle is inside of: the box
 * was drawn on it (a full-slide question text, a background picture), to pick what's on top of it.
 */
export function touchedBy<T extends Box>(els: T[], a: Pt, b: Pt): T[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return els.filter((e) => {
    const r = bounds(e);
    const touches = r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0;
    const around = r.x <= x0 && r.x + r.w >= x1 && r.y <= y0 && r.y + r.h >= y1;
    return touches && !around;
  });
}

/**
 * The next element down the stack under a point, after `current` (wrapping to the top), so repeated
 * Alt+clicks walk through everything stacked there.
 */
export function nextBelow<T extends Box & { zIndex: number; id: string }>(els: T[], p: Pt, current: string | null): T | undefined {
  const stack = elementsAt(els, p);
  if (!stack.length) return undefined;
  const i = stack.findIndex((e) => e.id === current);
  return stack[(i + 1) % stack.length];
}

export type Restack = 'front' | 'forward' | 'backward' | 'back';

/**
 * Restack the chosen items (keeping their order among themselves): all the way to the front/back, or
 * one step forward/backward past their neighbour. Renumbers every zIndex 0..n-1.
 */
export function restack<T extends { id: string; zIndex: number }>(els: T[], ids: string[], dir: Restack): void {
  const pick = new Set(ids);
  const list = [...els].sort((a, b) => a.zIndex - b.zIndex); // bottom → top
  if (!list.some((e) => pick.has(e.id))) return;
  let out: T[];
  if (dir === 'front') out = [...list.filter((e) => !pick.has(e.id)), ...list.filter((e) => pick.has(e.id))];
  else if (dir === 'back') out = [...list.filter((e) => pick.has(e.id)), ...list.filter((e) => !pick.has(e.id))];
  else {
    out = [...list];
    if (dir === 'forward') {
      for (let i = out.length - 2; i >= 0; i--)
        if (pick.has(out[i].id) && !pick.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    } else {
      for (let i = 1; i < out.length; i++)
        if (pick.has(out[i].id) && !pick.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
    }
  }
  out.forEach((e, i) => (e.zIndex = i));
}

type Placed = { x: number; y: number; w: number; h: number; rotation?: number };
const drawn = (e: Placed) => bounds({ ...e, rotation: e.rotation ?? 0 });

/**
 * Align (the Inspector's buttons and the right-click menu). One item goes to the stage's edge, or the middle across
 * or down it; several line up with each other, within the box around them all (left edges together, middles in a
 * line…), and Distribute spaces three or more evenly between the outermost two. Items are placed as drawn: a turned
 * one by the box around it.
 */
export function align(els: Placed[], how: Align, W = 1920, H = 1080): void {
  if (!els.length) return;
  const all = els.map(drawn);
  const area =
    els.length === 1
      ? { x: 0, y: 0, w: W, h: H }
      : (() => {
          const x = Math.min(...all.map((b) => b.x));
          const y = Math.min(...all.map((b) => b.y));
          return { x, y, w: Math.max(...all.map((b) => b.x + b.w)) - x, h: Math.max(...all.map((b) => b.y + b.h)) - y };
        })();
  if (how === 'hdistribute' || how === 'vdistribute') return distribute(els, how === 'hdistribute' ? 'x' : 'y');
  els.forEach((e, i) => {
    const b = all[i];
    let dx = 0;
    let dy = 0;
    if (how === 'left') dx = area.x - b.x;
    if (how === 'hcenter') dx = area.x + (area.w - b.w) / 2 - b.x;
    if (how === 'right') dx = area.x + area.w - (b.x + b.w);
    if (how === 'top') dy = area.y - b.y;
    if (how === 'vcenter') dy = area.y + (area.h - b.h) / 2 - b.y;
    if (how === 'bottom') dy = area.y + area.h - (b.y + b.h);
    e.x = Math.round(e.x + dx);
    e.y = Math.round(e.y + dy);
  });
}

/** Space three or more items evenly across (x) or down (y): the outermost stay, the gaps between the rest are equal. */
function distribute(els: Placed[], axis: 'x' | 'y'): void {
  if (els.length < 3) return;
  const size = axis === 'x' ? 'w' : 'h';
  const items = els.map((e) => ({ e, b: drawn(e) })).sort((a, b) => a.b[axis] + a.b[size] / 2 - (b.b[axis] + b.b[size] / 2));
  const start = items[0].b[axis];
  const end = Math.max(...items.map((i) => i.b[axis] + i.b[size]));
  const gap = (end - start - items.reduce((n, i) => n + i.b[size], 0)) / (items.length - 1);
  let at = start;
  for (const { e, b } of items) {
    e[axis] = Math.round(e[axis] + at - b[axis]);
    at += b[size] + gap;
  }
}

/**
 * Snapping while dragging: of the edges `vals`, the one nearest a target within `reach`, the offset that puts it
 * there, and every target at that same distance (the guides to draw). Nothing in reach: no offset, no guides.
 */
export function nearestSnap(vals: number[], targets: number[], reach: number): { off: number; at: number[] } {
  let bd = Infinity;
  let off = 0;
  let at: number[] = [];
  for (const v of vals)
    for (const t of targets) {
      const d = Math.abs(t - v);
      if (d < bd - 0.01) {
        bd = d;
        off = t - v;
        at = [t];
      } else if (Math.abs(d - bd) < 0.01 && !at.includes(t)) at.push(t);
    }
  return bd <= reach ? { off, at } : { off: 0, at: [] };
}

/** Move a box (an item dropped or added at the pointer) onto the stage: wholly, or centred when it's bigger. */
export function clampOnto(e: { x: number; y: number; w: number; h: number }, W = 1920, H = 1080): void {
  const fit = (v: number, size: number, room: number) => Math.round(size > room ? (room - size) / 2 : Math.max(0, Math.min(v, room - size)));
  e.x = fit(e.x, e.w, W);
  e.y = fit(e.y, e.h, H);
}

/** Move a group of items together so the middle of the box around them is at `at` (a paste at the pointer). */
export function centreOn(els: { x: number; y: number; w: number; h: number }[], at: Pt): void {
  if (!els.length) return;
  const x0 = Math.min(...els.map((e) => e.x));
  const y0 = Math.min(...els.map((e) => e.y));
  const x1 = Math.max(...els.map((e) => e.x + e.w));
  const y1 = Math.max(...els.map((e) => e.y + e.h));
  const dx = Math.round(at.x - (x0 + x1) / 2);
  const dy = Math.round(at.y - (y0 + y1) / 2);
  for (const e of els) {
    e.x += dx;
    e.y += dy;
  }
}

/** None of the item (as drawn: a turned one by the box around it) is on the stage. */
export function offStage(e: Placed, W = 1920, H = 1080): boolean {
  const b = drawn(e);
  return b.x + b.w <= 0 || b.y + b.h <= 0 || b.x >= W || b.y >= H;
}

/**
 * Keep at least part of an item on the stage (a nudge or a duplicate that would push it off): `keep` px of it (all of it
 * when it's smaller) stays on each axis.
 */
export function keepOnStage(e: Placed, W = 1920, H = 1080, keep = 40): void {
  const b = drawn(e);
  const kx = Math.min(keep, b.w);
  const ky = Math.min(keep, b.h);
  const dx = Math.max(kx - (b.x + b.w), Math.min(0, W - kx - b.x));
  const dy = Math.max(ky - (b.y + b.h), Math.min(0, H - ky - b.y));
  e.x = Math.round(e.x + dx);
  e.y = Math.round(e.y + dy);
}
