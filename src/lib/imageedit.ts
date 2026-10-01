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

/** Step 1: rotate, flip and filter the source at `k` × its natural size. */
export function renderOriented(img: CanvasImageSource & { naturalWidth: number; naturalHeight: number }, e: ImageEdits, k = 1): HTMLCanvasElement {
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  const o = orientedSize(w, h, e.rotate);
  const c = document.createElement('canvas');
  c.width = Math.max(1, o.w);
  c.height = Math.max(1, o.h);
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((e.rotate * Math.PI) / 180);
  ctx.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
  // Blur is specified in output pixels; this canvas is k × natural size, and output = natural × scale.
  ctx.filter = filterCss(e, k / (e.scale || 1));
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
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

/** Full render. `k` < 1 renders a smaller preview; overlays scale with it. */
export function renderEdited(img: HTMLImageElement, e: ImageEdits, k = 1): HTMLCanvasElement {
  const oriented = renderOriented(img, e, k);
  const crop = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const sx = crop.x * oriented.width;
  const sy = crop.y * oriented.height;
  const sw = Math.max(1, crop.w * oriented.width);
  const sh = Math.max(1, crop.h * oriented.height);
  const full = outputSize(img.naturalWidth, img.naturalHeight, e);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(full.w * k));
  out.height = Math.max(1, Math.round(full.h * k));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(oriented, sx, sy, sw, sh, 0, 0, out.width, out.height);
  drawOverlays(ctx, e, out.width, out.height);
  return out;
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
