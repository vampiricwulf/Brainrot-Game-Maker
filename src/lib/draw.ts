// Freehand drawing: a stroke (slide coordinates) becomes a 'path' shape sized to fit it.
import { newShapeEl, type ShapeEl } from './model';

/** `closed`: a filled shape (an area); otherwise a line. */
export function pathShape(pts: [number, number][], closed: boolean, color = '#ffcc00'): ShapeEl {
  const pad = 6;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  const w = Math.max(20, Math.max(...xs) - x + pad);
  const h = Math.max(20, Math.max(...ys) - y + pad);
  const el = newShapeEl('path');
  Object.assign(el, {
    x,
    y,
    w,
    h,
    points: pts.map(([px, py]) => [+((px - x) / w).toFixed(4), +((py - y) / h).toFixed(4)] as [number, number]),
    closed,
    fill: closed ? color : 'transparent',
    stroke: closed ? '#ffffff' : color,
    strokeWidth: 8,
  });
  return el;
}
