import { describe, expect, it } from 'vitest';
import { barAt, fromBar, fromSquare, hexSoFar, hexToHsv, hsvToHex, hsvToRgb, nudge, readChannel, readHex, rgbToHex, rgbToHsv, squareAt, type Hsv, type Rgb } from './colormath';

/** Every channel value in steps of `n` (and 255). */
const levels = (n: number) => [...Array.from({ length: Math.ceil(256 / n) }, (_, i) => i * n).filter((v) => v < 255), 255];

describe('hex, RGB and HSV', () => {
  it('turns the usual colors into hue, saturation and brightness and back', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 });
    expect(hexToHsv('#ffff00')).toEqual({ h: 60, s: 1, v: 1 });
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 });
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
    expect(hsvToHex({ h: 300, s: 1, v: 1 })).toBe('#ff00ff');
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 30, s: 0.5, v: 0.5 })).toBe('#806040');
    expect(rgbToHex([255, 0, 230])).toBe('#ff00e6');
    expect(hsvToRgb({ h: 0, s: 0, v: 0.5 })).toEqual([128, 128, 128]);
  });

  it('gives back the same #rrggbb for every color, however many times it goes round', () => {
    const steps = levels(5);
    for (const r of steps)
      for (const g of steps)
        for (const b of steps) {
          const rgb: Rgb = [r, g, b];
          const hex = rgbToHex(rgb);
          let c = rgbToHsv(rgb);
          for (let i = 0; i < 3; i++) c = hexToHsv(hsvToHex(c), c)!;
          if (hsvToHex(c) !== hex) throw new Error(`${hex} came back as ${hsvToHex(c)}`);
        }
  });

  it('keeps the hue a grey has no say in, and the saturation of black', () => {
    const pink: Hsv = { h: 320, s: 0.6, v: 0.9 };
    expect(hexToHsv('#808080', pink)).toEqual({ h: 320, s: 0, v: 128 / 255 });
    expect(hexToHsv('#000000', pink)).toEqual({ h: 320, s: 0.6, v: 0 });
    // (A color with a hue of its own takes it.)
    expect(hexToHsv('#00ff00', pink)?.h).toBe(120);
  });
});

describe('the square and the hue bar', () => {
  it('puts saturation across and brightness down, and the hue along the bar', () => {
    const c = hexToHsv('#ff0000')!;
    expect(squareAt(c)).toEqual({ x: 1, y: 0 });
    expect(squareAt(hexToHsv('#000000')!)).toEqual({ x: 0, y: 1 });
    expect(squareAt(hexToHsv('#ffffff')!)).toEqual({ x: 0, y: 0 });
    expect(barAt(hexToHsv('#00ffff')!)).toBe(0.5);
    expect(hsvToHex(fromSquare(c, 0.5, 0.5))).toBe('#804040');
    expect(hsvToHex(fromBar(c, 1 / 3))).toBe('#00ff00');
  });

  it('keeps a press past the edge on it', () => {
    const c = hexToHsv('#3366cc')!;
    expect(fromSquare(c, -0.2, 1.4)).toEqual({ h: c.h, s: 0, v: 0 });
    expect(fromSquare(c, 2, -1)).toEqual({ h: c.h, s: 1, v: 1 });
    expect(fromBar(c, -1).h).toBe(0);
    expect(fromBar(c, 9).h).toBe(360);
  });

  it('goes from a place back to the same place and the same color', () => {
    for (const hex of ['#3366cc', '#ff00e6', '#0a0b0c', '#fefefe', '#7f7f00']) {
      const c = hexToHsv(hex)!;
      const { x, y } = squareAt(c);
      const back = fromBar(fromSquare(c, x, y), barAt(c));
      expect(hsvToHex(back)).toBe(hex);
      expect(squareAt(back)).toEqual({ x, y });
    }
  });

  it('moves one step per arrow key (ten with Shift), up being brighter', () => {
    const c: Hsv = { h: 200, s: 0.5, v: 0.5 };
    expect(nudge(c, 'square', 'ArrowRight', false)).toEqual({ h: 200, s: 0.51, v: 0.5 });
    expect(nudge(c, 'square', 'ArrowUp', true)).toEqual({ h: 200, s: 0.5, v: 0.6 });
    expect(nudge(c, 'square', 'ArrowDown', false)).toEqual({ h: 200, s: 0.5, v: 0.49 });
    expect(nudge(c, 'bar', 'ArrowLeft', true)).toEqual({ h: 190, s: 0.5, v: 0.5 });
    expect(nudge(c, 'bar', 'ArrowUp', false)).toEqual({ h: 201, s: 0.5, v: 0.5 });
    expect(nudge({ h: 355, s: 1, v: 0.02 }, 'bar', 'ArrowRight', true)?.h).toBe(360);
    expect(nudge({ h: 355, s: 1, v: 0.02 }, 'square', 'ArrowDown', true)?.v).toBe(0);
    expect(nudge(c, 'square', 'Enter', false)).toBeNull();
    // Back and forth comes back to the same color.
    const there = nudge(nudge(c, 'square', 'ArrowLeft', false)!, 'square', 'ArrowRight', false)!;
    expect(hsvToHex(there)).toBe(hsvToHex(c));
  });
});

describe('what the host types', () => {
  it('takes a hex color typed or pasted with or without #, 3 or 6 digits, any case', () => {
    expect(readHex('#ff00e6')).toBe('#ff00e6');
    expect(readHex('FF00E6')).toBe('#ff00e6');
    expect(readHex('  #Ab3 ')).toBe('#aabb33');
    expect(readHex('abc')).toBe('#aabbcc');
  });

  it('turns down what is not one', () => {
    for (const bad of ['', '#', '#ff00e', '#ff00e6a', 'red', '#ggg', 'ff 00 e6', '##fff', 'rgb(1,2,3)']) expect(readHex(bad)).toBeNull();
  });

  it('tells half typed from wrong', () => {
    for (const ok of ['', '#', '#1f', '1f2a', '#1f2a3']) expect(hexSoFar(ok)).toBe(true);
    for (const bad of ['#1f2a3b4', '#xyz', 'red', '##1']) expect(hexSoFar(bad)).toBe(false);
  });

  it('takes 0–255 in an R, G or B box', () => {
    expect(readChannel('0')).toBe(0);
    expect(readChannel(' 255 ')).toBe(255);
    expect(readChannel('007')).toBe(7);
    for (const bad of ['', '256', '-1', '1.5', '12a', '1000']) expect(readChannel(bad)).toBeNull();
  });
});
