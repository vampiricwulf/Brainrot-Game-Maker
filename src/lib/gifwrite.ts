// Writing an animated GIF from whole frames (🎨 Edit image on a GIF keeps it moving): each frame gets its own colours,
// at most 255 of them (picked from its pixels) and one see-through, and its own delay. Plain code, tested in Node.
import { GifWriter } from 'omggif';

/** A frame's pixels as palette indexes, with its palette (RGB numbers) and its see-through index (null: none). */
export interface Indexed {
  palette: number[];
  indexed: Uint8Array;
  transparent: number | null;
}

/** Colours a frame may have, leaving one index for see-through. */
const MAX_COLORS = 255;
/** A pixel at least this opaque shows (a GIF's pixels are either seen or not). */
const OPAQUE = 128;

/** A GIF palette's length: a power of two from 2 to 256. */
const paletteSize = (n: number) => Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(1, n))));

/**
 * A frame's pixels (RGBA) as a GIF's: its own colours when it has 255 or fewer (nothing changes), else 255 picked by
 * median cut (each pixel takes its group's average).
 */
export function quantize(rgba: ArrayLike<number>): Indexed {
  const n = rgba.length >> 2;
  const indexed = new Uint8Array(n);
  let clear = false;
  // Its own colours, if they fit.
  const exact = new Map<number, number>();
  for (let i = 0; i < n && exact.size <= MAX_COLORS; i++) {
    if (rgba[i * 4 + 3] < OPAQUE) {
      clear = true;
      continue;
    }
    const c = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    if (!exact.has(c)) exact.set(c, exact.size);
  }
  if (exact.size <= MAX_COLORS) {
    const t = clear ? exact.size : null;
    for (let i = 0; i < n; i++)
      indexed[i] = rgba[i * 4 + 3] < OPAQUE ? t! : exact.get((rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2])!;
    const palette = [...exact.keys(), ...(clear ? [0] : [])];
    return { palette: pad(palette), indexed, transparent: t };
  }
  return medianCut(rgba, n, indexed);
}

const pad = (p: number[]) => [...p, ...Array<number>(paletteSize(p.length) - p.length).fill(0)];

/** 255 colours for a frame with more: its pixels grouped by 5 bits a channel, the groups cut in two until there are 255. */
function medianCut(rgba: ArrayLike<number>, n: number, indexed: Uint8Array): Indexed {
  const count = new Uint32Array(32768);
  const sum = new Float64Array(32768 * 3);
  let clear = false;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < OPAQUE) {
      clear = true;
      continue;
    }
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    count[k]++;
    sum[k * 3] += r;
    sum[k * 3 + 1] += g;
    sum[k * 3 + 2] += b;
  }
  const bins: number[] = [];
  for (let k = 0; k < 32768; k++) if (count[k]) bins.push(k);
  const channel = (k: number, c: number) => (k >> (10 - c * 5)) & 31;
  /** A group: its bins (bins[from..to)), and which channel spreads widest in it, how far. */
  type Box = { from: number; to: number; pixels: number; c: number; spread: number };
  const measure = (from: number, to: number): Box => {
    let pixels = 0;
    const lo = [31, 31, 31];
    const hi = [0, 0, 0];
    for (let i = from; i < to; i++) {
      pixels += count[bins[i]];
      for (let c = 0; c < 3; c++) {
        const v = channel(bins[i], c);
        if (v < lo[c]) lo[c] = v;
        if (v > hi[c]) hi[c] = v;
      }
    }
    const spreads = hi.map((h, c) => h - lo[c]);
    const c = spreads.indexOf(Math.max(...spreads));
    return { from, to, pixels, c, spread: spreads[c] };
  };
  const boxes = [measure(0, bins.length)];
  while (boxes.length < MAX_COLORS) {
    // The group worth cutting most: many pixels over a wide spread.
    let at = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].to - boxes[i].from > 1 && (at < 0 || boxes[i].pixels * boxes[i].spread > boxes[at].pixels * boxes[at].spread)) at = i;
    if (at < 0) break;
    const box = boxes[at];
    const part = bins.slice(box.from, box.to).sort((a, b) => channel(a, box.c) - channel(b, box.c));
    for (let i = 0; i < part.length; i++) bins[box.from + i] = part[i];
    // Cut where half its pixels are on each side (never leaving a side empty).
    let seen = 0;
    let cut = box.from + 1;
    for (let i = box.from; i < box.to - 1; i++) {
      seen += count[bins[i]];
      cut = i + 1;
      if (seen * 2 >= box.pixels) break;
    }
    boxes.splice(at, 1, measure(box.from, cut), measure(cut, box.to));
  }
  const lut = new Uint8Array(32768);
  const palette = boxes.map((box, i) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let j = box.from; j < box.to; j++) {
      const k = bins[j];
      lut[k] = i;
      r += sum[k * 3];
      g += sum[k * 3 + 1];
      b += sum[k * 3 + 2];
    }
    const avg = (v: number) => Math.min(255, Math.round(v / Math.max(1, box.pixels)));
    return (avg(r) << 16) | (avg(g) << 8) | avg(b);
  });
  const t = clear ? palette.length : null;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] < OPAQUE) indexed[i] = t!;
    else indexed[i] = lut[((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3)];
  }
  return { palette: pad(clear ? [...palette, 0] : palette), indexed, transparent: t };
}

/**
 * An animated GIF made a whole frame at a time (`width`×`height` RGBA each). `loop` is the original's loop count (0:
 * for ever; null: once through). Each frame clears to see-through after it shows, so the next one's see-through parts
 * show what's behind the GIF, as they did.
 */
export class GifFile {
  private readonly parts: BlobPart[] = [];
  private readonly buf: Uint8Array<ArrayBuffer>;
  private readonly writer: GifWriter;

  constructor(
    readonly width: number,
    readonly height: number,
    loop: number | null,
  ) {
    // Room for one frame at its worst (12 bits a pixel, its blocks' lengths, a palette): it's emptied after each.
    this.buf = new Uint8Array(new ArrayBuffer(Math.ceil(width * height * 1.6) + 4096));
    this.writer = new GifWriter(this.buf, width, height, loop === null ? {} : { loop });
    this.take();
  }

  /** What's written so far goes to the file's parts, and the buffer starts again. */
  private take(): void {
    const p = this.writer.getOutputBufferPosition();
    this.parts.push(this.buf.slice(0, p));
    this.writer.setOutputBufferPosition(0);
  }

  /** The next frame (all its pixels), shown for `seconds`. */
  add(rgba: ArrayLike<number>, seconds: number): void {
    const { palette, indexed, transparent } = quantize(rgba);
    this.writer.addFrame(0, 0, this.width, this.height, indexed, { palette, delay: Math.max(1, Math.round(seconds * 100)), disposal: 2, transparent });
    this.take();
  }

  /** The finished file. */
  end(): Blob {
    this.parts.push(this.buf.slice(0, this.writer.end()));
    return new Blob(this.parts, { type: 'image/gif' });
  }
}
