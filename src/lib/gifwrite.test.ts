import { GifReader } from 'omggif';
import { describe, expect, it } from 'vitest';
import { GifFile, quantize } from './gifwrite';
import { decodeGif } from './shrink/gif';

/** w×h RGBA pixels from `px(x, y)` ([r, g, b, a]). */
const pixels = (w: number, h: number, px: (x: number, y: number) => number[]) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(px(x, y), (y * w + x) * 4);
  return out;
};
const rgbOf = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

describe('quantize', () => {
  it("keeps a frame's own colours when it has 255 or fewer, and its see-through pixels", () => {
    const rgba = pixels(4, 2, (x, y) => (y ? [10 * x, 20, 30, 255] : x === 3 ? [0, 0, 0, 0] : [255, 0, 0, 255]));
    const q = quantize(rgba);
    expect(q.palette.length).toBe(8);
    expect(q.transparent).toBe(5);
    for (let i = 0; i < 8; i++) {
      if (rgba[i * 4 + 3] < 128) expect(q.indexed[i]).toBe(q.transparent);
      else expect(rgbOf(q.palette[q.indexed[i]])).toEqual([...rgba.slice(i * 4, i * 4 + 3)]);
    }
  });

  it('has no see-through index when every pixel shows', () => {
    expect(quantize(pixels(2, 2, () => [1, 2, 3, 255])).transparent).toBeNull();
  });

  it('picks 255 colours close to a frame with more', () => {
    const rgba = pixels(64, 64, (x, y) => [x * 4, y * 4, (x + y) * 2, x === 0 && y === 0 ? 0 : 255]);
    const q = quantize(rgba);
    expect(q.palette.length).toBe(256);
    expect(q.transparent).toBe(255);
    expect(q.indexed[0]).toBe(255);
    let off = 0;
    for (let i = 1; i < 64 * 64; i++) {
      expect(q.indexed[i]).toBeLessThan(255);
      const c = rgbOf(q.palette[q.indexed[i]]);
      for (let k = 0; k < 3; k++) off += Math.abs(c[k] - rgba[i * 4 + k]);
    }
    // (On average within a few steps of 255 a channel.)
    expect(off / (64 * 64 * 3)).toBeLessThan(6);
  });
});

describe('GifFile', () => {
  const w = 6;
  const h = 4;
  // A dot moving across, on a see-through ground, then a full red frame.
  const frames = [
    pixels(w, h, (x) => (x === 0 ? [0, 200, 0, 255] : [0, 0, 0, 0])),
    pixels(w, h, (x) => (x === 3 ? [0, 0, 200, 255] : [0, 0, 0, 0])),
    pixels(w, h, () => [255, 0, 0, 255]),
  ];

  it('writes every frame as it was, each for its own time, looping as asked', async () => {
    const g = new GifFile(w, h, 0);
    frames.forEach((f, i) => g.add(f, [0.1, 0.25, 1][i]));
    const blob = g.end();
    expect(blob.type).toBe('image/gif');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const r = new GifReader(bytes);
    expect([r.width, r.height, r.numFrames(), r.loopCount()]).toEqual([w, h, 3, 0]);
    expect([0, 1, 2].map((i) => r.frameInfo(i).delay)).toEqual([10, 25, 100]);
  });

  // (Each frame clears after it shows: the dot's old place is see-through again in the next one.)
  it('shows each frame as it was, its see-through parts too', async () => {
    const g = new GifFile(w, h, 0);
    for (const f of frames) g.add(f, 0.1);
    const bytes = new Uint8Array(await g.end().arrayBuffer());
    let i = 0;
    for (const f of decodeGif(bytes)) {
      for (let p = 0; p < w * h; p++) {
        const want = frames[i].slice(p * 4, p * 4 + 4);
        const got = f.rgba.slice(p * 4, p * 4 + 4);
        if (want[3] === 0) expect(got[3]).toBe(0);
        else expect([...got]).toEqual([...want]);
      }
      i++;
    }
    expect(i).toBe(3);
  });

  it('plays once through when the original had no loop count', async () => {
    const g = new GifFile(w, h, null);
    g.add(frames[2], 0.1);
    g.add(frames[0], 0.1);
    expect(new GifReader(new Uint8Array(await g.end().arrayBuffer())).loopCount()).toBeNull();
  });

  it('keeps a big frame of many colours in one piece', async () => {
    const big = pixels(300, 200, (x, y) => [x % 256, y, (x * y) % 256, 255]);
    const g = new GifFile(300, 200, 0);
    g.add(big, 0.1);
    g.add(big, 0.1);
    const r = new GifReader(new Uint8Array(await g.end().arrayBuffer()));
    expect(r.numFrames()).toBe(2);
    const px = new Uint8Array(300 * 200 * 4);
    r.decodeAndBlitFrameRGBA(1, px);
    expect(px[3]).toBe(255);
  });
});
