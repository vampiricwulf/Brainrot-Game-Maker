// Canvas pipeline for the non-destructive image editor (spec §5.4):
// rotate/flip + filters → crop → resize → brush strokes → text → stickers.
import type { ImageEdits } from './model';

export function defaultEdits(): ImageEdits {
  return {
    rotate: 0,
    flipH: false,
    flipV: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hue: 0,
    blur: 0,
    grayscale: 0,
    sepia: 0,
    invert: 0,
    scale: 1,
    texts: [],
    stickers: [],
    strokes: [],
  };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the image"));
    img.src = src;
  });
}

export function filterCss(e: ImageEdits, blurScale = 1): string {
  const parts = [
    e.brightness !== 100 && `brightness(${e.brightness}%)`,
    e.contrast !== 100 && `contrast(${e.contrast}%)`,
    e.saturation !== 100 && `saturate(${e.saturation}%)`,
    e.hue && `hue-rotate(${e.hue}deg)`,
    e.blur && `blur(${e.blur * blurScale}px)`,
    e.grayscale && `grayscale(${e.grayscale}%)`,
    e.sepia && `sepia(${e.sepia}%)`,
    e.invert && `invert(${e.invert}%)`,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : 'none';
}

/** Size of the image after rotation (the canvas grows to fit a free rotation). */
export function orientedSize(w: number, h: number, deg: number): { w: number; h: number } {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { w: Math.round(w * c + h * s), h: Math.round(w * s + h * c) };
}

/** Output pixel size for the given edits and source size (before the preview cap). */
export function outputSize(natW: number, natH: number, e: ImageEdits): { w: number; h: number } {
  const o = orientedSize(natW, natH, e.rotate);
  const cw = (e.crop?.w ?? 1) * o.w;
  const ch = (e.crop?.h ?? 1) * o.h;
  const MAX = 4096;
  const s = Math.min(e.scale, MAX / cw, MAX / ch);
  return { w: Math.max(1, Math.round(cw * s)), h: Math.max(1, Math.round(ch * s)) };
}

// ---------- Overlays on the source picture ----------
// Captions, stickers and strokes (edits v2) are kept on the source picture, so a crop, a turn or a flip carries them
// along with it. These map them to the finished image (fractions of it) and back.

const FULL = { x: 0, y: 0, w: 1, h: 1 };
type Pt = { x: number; y: number };
const norm = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** One flip (not both, which is a half turn) mirrors the picture: an overlay's angle turns the other way. */
const mirrored = (e: Pick<ImageEdits, 'flipH' | 'flipV'>) => !!e.flipH !== !!e.flipV;

/** Where a point of the source picture (fractions of it) is in the finished image (fractions of it). */
export function toOutput(p: Pt, natW: number, natH: number, e: ImageEdits): Pt {
  const o = orientedSize(natW, natH, e.rotate);
  const c = e.crop ?? FULL;
  const r = (e.rotate * Math.PI) / 180;
  const dx = (p.x - 0.5) * natW * (e.flipH ? -1 : 1);
  const dy = (p.y - 0.5) * natH * (e.flipV ? -1 : 1);
  const ox = o.w / 2 + dx * Math.cos(r) - dy * Math.sin(r);
  const oy = o.h / 2 + dx * Math.sin(r) + dy * Math.cos(r);
  return { x: (ox / o.w - c.x) / c.w, y: (oy / o.h - c.y) / c.h };
}

/** The other way round: a point of the finished image on the source picture. */
export function toSource(p: Pt, natW: number, natH: number, e: ImageEdits): Pt {
  const o = orientedSize(natW, natH, e.rotate);
  const c = e.crop ?? FULL;
  const r = (-e.rotate * Math.PI) / 180;
  const ox = (c.x + p.x * c.w) * o.w - o.w / 2;
  const oy = (c.y + p.y * c.h) * o.h - o.h / 2;
  const dx = (ox * Math.cos(r) - oy * Math.sin(r)) * (e.flipH ? -1 : 1);
  const dy = (ox * Math.sin(r) + oy * Math.cos(r)) * (e.flipV ? -1 : 1);
  return { x: dx / natW + 0.5, y: dy / natH + 0.5 };
}

/** A size as a fraction of the source's width × this = the same size as a fraction of the finished image's width. */
export function sizeToOutput(natW: number, natH: number, e: ImageEdits): number {
  const o = orientedSize(natW, natH, e.rotate);
  return natW / Math.max(1e-9, (e.crop?.w ?? 1) * o.w);
}

/** An overlay's angle on the source picture → as it shows in the finished image (and back). Text is never mirrored. */
export const angleToOutput = (a: number, e: ImageEdits): number => norm(e.rotate + (mirrored(e) ? -a : a));
export const angleToSource = (a: number, e: ImageEdits): number => norm(mirrored(e) ? e.rotate - a : a - e.rotate);

type Overlays = Pick<ImageEdits, 'texts' | 'stickers' | 'strokes'>;

const mapPoints = (pts: number[], f: (x: number, y: number) => Pt): number[] =>
  pts.flatMap((v, i) => {
    if (i % 2) return [];
    const p = f(v, pts[i + 1]);
    return [p.x, p.y];
  });

/** The captions, stickers and strokes of v2 edits placed on the finished image (fractions of it, as drawOverlays takes). */
export function placedOverlays(e: ImageEdits, natW: number, natH: number): Overlays {
  if (e.v !== 2) return { texts: e.texts, stickers: e.stickers, strokes: e.strokes };
  const k = sizeToOutput(natW, natH, e);
  const at = (x: number, y: number) => toOutput({ x, y }, natW, natH, e);
  return {
    texts: e.texts.map((t) => ({ ...t, ...at(t.x, t.y), size: t.size * k, rotation: angleToOutput(t.rotation, e) })),
    stickers: e.stickers.map((s) => ({ ...s, ...at(s.x, s.y), size: s.size * k, rotation: angleToOutput(s.rotation, e) })),
    strokes: e.strokes.map((s) => ({ ...s, size: s.size * k, points: mapPoints(s.points, at) })),
  };
}

/**
 * Edits saved before v2 (overlays as fractions of the finished image) moved onto the source picture: they draw exactly
 * as before, and from then on follow a crop or a turn. v2 edits come back as they are.
 */
export function migrateEdits(e: ImageEdits, natW: number, natH: number): ImageEdits {
  if (e.v === 2) return e;
  const k = sizeToOutput(natW, natH, e);
  const at = (x: number, y: number) => toSource({ x, y }, natW, natH, e);
  return {
    ...e,
    v: 2,
    texts: e.texts.map((t) => ({ ...t, ...at(t.x, t.y), size: t.size / k, rotation: angleToSource(t.rotation, e) })),
    stickers: e.stickers.map((s) => ({ ...s, ...at(s.x, s.y), size: s.size / k, rotation: angleToSource(s.rotation, e) })),
    strokes: e.strokes.map((s) => ({ ...s, size: s.size / k, points: mapPoints(s.points, at) })),
  };
}

/**
 * A quarter turn (⟲ / ⟳ 90°) carries the crop along with the picture: the same part stays cropped. `dir` 1 is
 * clockwise. (Crop boxes are fractions of the turned picture, whose sides swap.)
 */
export function turnCrop(c: { x: number; y: number; w: number; h: number }, dir: 1 | -1): { x: number; y: number; w: number; h: number } {
  return dir > 0 ? { x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w } : { x: c.y, y: 1 - c.x - c.w, w: c.h, h: c.w };
}

/**
 * Full render. `k` < 1 renders a smaller preview; overlays scale with it. The source is turned, flipped and filtered
 * onto a canvas no bigger than the output needs (just the cropped part, at the output's scale when that's smaller),
 * so a huge picture turned at an angle never goes past the browser's canvas limits.
 */
export function renderEdited(img: HTMLImageElement, e: ImageEdits, k = 1): HTMLCanvasElement {
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  const o = orientedSize(natW, natH, e.rotate);
  const crop = e.crop ?? FULL;
  const full = outputSize(natW, natH, e);
  // Output pixels per source pixel, and the working canvas's (never more than the source's own, or the output's).
  const s = full.w / Math.max(1e-9, crop.w * o.w);
  const kk = k * Math.min(1, s);
  // Blur is specified in output pixels. The working canvas keeps a margin around the crop for it to blur from.
  const blurScale = kk / s;
  const pad = Math.ceil((e.blur || 0) * blurScale * 3) + 2;
  const x0 = Math.max(0, Math.floor(crop.x * o.w * kk - pad));
  const y0 = Math.max(0, Math.floor(crop.y * o.h * kk - pad));
  const x1 = Math.max(x0 + 1, Math.min(Math.ceil(o.w * kk), Math.ceil((crop.x + crop.w) * o.w * kk + pad)));
  const y1 = Math.max(y0 + 1, Math.min(Math.ceil(o.h * kk), Math.ceil((crop.y + crop.h) * o.h * kk + pad)));
  const work = canvas(x1 - x0, y1 - y0);
  const w = work.getContext('2d')!;
  w.translate((o.w * kk) / 2 - x0, (o.h * kk) / 2 - y0);
  w.rotate((e.rotate * Math.PI) / 180);
  w.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
  w.filter = filterCss(e, blurScale);
  w.drawImage(img, (-natW * kk) / 2, (-natH * kk) / 2, natW * kk, natH * kk);

  const out = canvas(full.w * k, full.h * k);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const sw = Math.max(1e-3, crop.w * o.w * kk);
  const sh = Math.max(1e-3, crop.h * o.h * kk);
  ctx.drawImage(work, crop.x * o.w * kk - x0, crop.y * o.h * kk - y0, sw, sh, 0, 0, out.width, out.height);
  drawOverlays(ctx, { ...e, ...placedOverlays(e, natW, natH) }, out.width, out.height);
  return out;
}

/** The biggest canvas side and area browsers draw on (Chromium's; past them a canvas silently stays blank). */
const MAX_SIDE = 16384;
const MAX_AREA = 16384 * 16384;

/** A blank canvas of that size, or an error when the browser couldn't draw on it. */
function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  if (c.width > MAX_SIDE || c.height > MAX_SIDE || c.width * c.height > MAX_AREA || !c.getContext('2d')) {
    throw new Error('the picture is too big to edit here');
  }
  return c;
}

/** Nothing at all was drawn (every pixel see-through), judged from a small copy. */
function blank(c: HTMLCanvasElement): boolean {
  const t = document.createElement('canvas');
  t.width = t.height = 24;
  const ctx = t.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(c, 0, 0, 24, 24);
  try {
    const d = ctx.getImageData(0, 0, 24, 24).data;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * The full render for saving, checked: blank where a small render of the same edits isn't (a browser that ran out of
 * room drew nothing) is an error, never an empty picture saved as if it worked.
 */
export function renderForSave(img: HTMLImageElement, e: ImageEdits): HTMLCanvasElement {
  const c = renderEdited(img, e, 1);
  if (blank(c)) {
    const small = renderEdited(img, e, Math.min(1, 64 / Math.max(c.width, c.height)));
    if (!blank(small)) throw new Error('the picture is too big to edit here');
  }
  return c;
}

export function drawOverlays(ctx: CanvasRenderingContext2D, e: ImageEdits, W: number, H: number): void {
  // Brush strokes go on their own layer so the eraser only removes paint, not the photo.
  if (e.strokes.length) {
    const layer = document.createElement('canvas');
    layer.width = W;
    layer.height = H;
    const l = layer.getContext('2d')!;
    l.lineCap = 'round';
    l.lineJoin = 'round';
    for (const s of e.strokes) {
      l.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      l.strokeStyle = s.color;
      l.fillStyle = s.color;
      l.lineWidth = Math.max(1, s.size * W);
      const p = s.points;
      if (p.length === 2) {
        l.beginPath();
        l.arc(p[0] * W, p[1] * H, l.lineWidth / 2, 0, Math.PI * 2);
        l.fill();
        continue;
      }
      l.beginPath();
      l.moveTo(p[0] * W, p[1] * H);
      for (let i = 2; i < p.length; i += 2) l.lineTo(p[i] * W, p[i + 1] * H);
      l.stroke();
    }
    ctx.drawImage(layer, 0, 0);
  }
  for (const t of e.texts) {
    const size = t.size * W;
    ctx.save();
    ctx.translate(t.x * W, t.y * H);
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.font = `900 ${size}px ${t.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const lines = t.text.split('\n');
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * size * 1.1;
      if (t.strokeWidth > 0) {
        ctx.lineWidth = t.strokeWidth * size;
        ctx.strokeStyle = t.stroke;
        ctx.strokeText(line, 0, y);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(line, 0, y);
    });
    ctx.restore();
  }
  for (const s of e.stickers) {
    const size = s.size * W;
    ctx.save();
    ctx.translate(s.x * W, s.y * H);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.emoji, 0, 0);
    ctx.restore();
  }
}

export function canvasToBlob(c: HTMLCanvasElement, type: string, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality));
}

/**
 * The caption or sticker under a point (fractions of the W×H output image), top-most first: the box each one draws,
 * turned with it (a caption: its widest line by its lines, with a little room around). `measure` gives a line's
 * width in pixels at a font size (the editor measures with the canvas).
 */
export function itemAt(
  p: { x: number; y: number },
  W: number,
  H: number,
  e: Pick<ImageEdits, 'texts' | 'stickers'>,
  measure: (line: string, size: number, font: string) => number = (line, size) => line.length * size * 0.6,
): string | null {
  const boxes = [
    ...e.texts.map((t) => {
      const size = t.size * W;
      const lines = t.text.split('\n');
      const w = Math.max(size * 0.5, ...lines.map((l) => measure(l, size, t.font)));
      return { id: t.id, x: t.x, y: t.y, w: w + size * 0.4, h: lines.length * size * 1.1 + size * 0.2, rotation: t.rotation };
    }),
    ...e.stickers.map((s) => ({ id: s.id, x: s.x, y: s.y, w: s.size * W * 1.1, h: s.size * W * 1.1, rotation: s.rotation })),
  ];
  // Stickers are drawn over captions, and later ones over earlier ones.
  for (const b of boxes.reverse()) {
    const a = (-b.rotation * Math.PI) / 180;
    const dx = (p.x - b.x) * W;
    const dy = (p.y - b.y) * H;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b.id;
  }
  return null;
}

/** Fit a crop rectangle of the given pixel aspect (w/h) inside an image of size W×H, centered. */
export function fitCrop(aspect: number, W: number, H: number): { x: number; y: number; w: number; h: number } {
  let w = W;
  let h = W / aspect;
  if (h > H) {
    h = H;
    w = H * aspect;
  }
  return { x: (W - w) / 2 / W, y: (H - h) / 2 / H, w: w / W, h: h / H };
}

export const STICKERS = ['😂', '💀', '🔥', '😭', '👀', '💯', '🤡', '🗿', '😎', '🤯', '🥶', '🐸', '👑', '⭐', '❤️', '✅', '❌', '⚠️', '🎉', '🧠', '👍', '👎', '🙏', '😱', '🤔', '🥴', '😈', '👻', '💩', '🚨', '➡️', '⬅️', '⬆️', '⬇️', '🔴', '🟢'];
