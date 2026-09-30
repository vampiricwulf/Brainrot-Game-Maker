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

/** Boxes a drag-to-select rectangle (any two corners) touches. */
export function touchedBy<T extends Box>(els: T[], a: Pt, b: Pt): T[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return els.filter((e) => {
    const r = bounds(e);
    return r.x < x1 && r.x + r.w > x0 && r.y < y1 && r.y + r.h > y0;
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

/** Move each item to the stage's edge, or centre it across or down the stage (Align in the Inspector and the menu). */
export function align(els: { x: number; y: number; w: number; h: number }[], how: Align, W = 1920, H = 1080): void {
  for (const e of els) {
    if (how === 'left') e.x = 0;
    if (how === 'hcenter') e.x = Math.round((W - e.w) / 2);
    if (how === 'right') e.x = W - e.w;
    if (how === 'top') e.y = 0;
    if (how === 'vcenter') e.y = Math.round((H - e.h) / 2);
    if (how === 'bottom') e.y = H - e.h;
  }
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
