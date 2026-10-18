// A GIF's frames as they show (card-files spec §4.6): each drawn over what the one before left, see-through pixels
// leaving what's under them, and disposal 2 and 3 clearing or putting back.
import { GifWriter } from 'omggif';
import { describe, expect, it } from 'vitest';
import { decodeGif, gifInfo } from './gif';

const W = 4;
const H = 2;
// 0 red, 1 green, 2 blue, 3 see-through (in frames that say so).
const PALETTE = [0xff0000, 0x00ff00, 0x0000ff, 0x000000];

/** A 4×2 GIF: frame 1 all red (kept); frame 2 green over the left half, cleared after (2); frame 3 blue at the
 *  right, its first pixel see-through, put back after (3); frame 4 one green pixel. */
function makeGif(): Uint8Array {
  const buf = new Uint8Array(4096);
  const w = new GifWriter(buf, W, H, { palette: PALETTE, loop: 0 });
  w.addFrame(0, 0, W, H, new Array(W * H).fill(0), { delay: 10, disposal: 1 });
  w.addFrame(0, 0, 2, H, [1, 1, 1, 1], { delay: 0, disposal: 2 });
  w.addFrame(2, 0, 2, H, [3, 2, 2, 2], { delay: 1, transparent: 3, disposal: 3 });
  w.addFrame(3, 1, 1, 1, [1], { delay: 25 });
  return buf.slice(0, w.end());
}

/** A frame's pixels as letters: r, g, b, or . for see-through. */
function letters(rgba: Uint8ClampedArray): string {
  let s = '';
  for (let i = 0; i < rgba.length; i += 4) {
    if (i && i % (W * 4) === 0) s += '/';
    s += rgba[i + 3] === 0 ? '.' : rgba[i] === 255 ? 'r' : rgba[i + 1] === 255 ? 'g' : rgba[i + 2] === 255 ? 'b' : '?';
  }
  return s;
}

describe('decodeGif', () => {
  it('draws each frame over what was left, as browsers show it', () => {
    // (Each read as it comes: the next one is drawn in the same buffer.)
    const frames = Array.from(decodeGif(makeGif()), (f) => ({ px: letters(f.rgba), s: f.seconds }));
    expect(frames).toEqual([
      { px: 'rrrr/rrrr', s: 0.1 },
      // Green over the left half.
      { px: 'ggrr/ggrr', s: 0.1 },
      // Its rectangle cleared (2), then blue on the right but where it's see-through.
      { px: '..rb/..bb', s: 0.1 },
      // What was there before the blue frame back (3), then one green pixel.
      { px: '..rr/..rg', s: 0.25 },
    ]);
  });

  it('gives each frame in the same buffer, made before the next is asked for', () => {
    const it = decodeGif(makeGif());
    const a = it.next().value!.rgba;
    const b = it.next().value!.rgba;
    expect(a).toBe(b);
  });

  it('says its size, frames and length (0 and 1 hundredths taken as 10)', () => {
    expect(gifInfo(makeGif())).toEqual({ width: W, height: H, frames: 4, seconds: 0.1 + 0.1 + 0.1 + 0.25 });
    expect(() => gifInfo(new Uint8Array([1, 2, 3, 4, 5, 6]))).toThrow();
  });
});
