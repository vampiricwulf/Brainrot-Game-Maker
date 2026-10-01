import { describe, expect, it } from 'vitest';
import { contrast, luminance, parseHex, PLAYER_PALETTE, textOn } from './colors';

describe('contrast', () => {
  it('follows WCAG: black on white is 21, a color on itself is 1', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrast('#4f7cff', '#4f7cff')).toBe(1);
    expect(luminance('#ffffff')).toBe(1);
    expect(luminance('#000000')).toBe(0);
  });

  it('reads #rgb and #rrggbb, nothing else', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('3cb44b')).toEqual([60, 180, 75]);
    expect(parseHex('red')).toBeNull();
  });
});

describe('textOn', () => {
  it('picks black where black reads far better (the audit’s greens, magenta and teal)', () => {
    expect(textOn('#3cb44b')).toBe('#000');
    expect(textOn('#f032e6')).toBe('#000');
    expect(textOn('#469990')).toBe('#000');
    expect(textOn('#ffd6e7')).toBe('#000');
  });

  it('keeps white on dark colors', () => {
    expect(textOn('#060ce9')).toBe('#fff');
    expect(textOn('#911eb4')).toBe('#fff');
    expect(textOn('#000000')).toBe('#fff');
  });

  it('falls back to white for colors it can’t read', () => {
    expect(textOn('var(--tile)')).toBe('#fff');
  });

  it('gives at least 4.5:1 on every player color', () => {
    for (const c of PLAYER_PALETTE) expect(contrast(c, textOn(c))).toBeGreaterThanOrEqual(4.5);
  });
});
