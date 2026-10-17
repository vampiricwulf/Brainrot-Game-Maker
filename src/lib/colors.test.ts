import { describe, expect, it } from 'vitest';
import { colorDistance, contrast, CVD_SAFE_UPTO, luminance, obsKeyed, obsKeyedFade, parseHex, PLAYER_PALETTE, textOn, toHex, type Vision } from './colors';

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

describe('player colors for colour-blind viewers', () => {
  const smallest = (colors: string[], vision: Vision) => {
    let min = Infinity;
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) min = Math.min(min, colorDistance(colors[i], colors[j], vision));
    return min;
  };

  it('keeps the first 6 clearly apart (ΔE 15 or more) with normal sight, deuteranopia and protanopia', () => {
    for (const v of ['normal', 'deutan', 'protan'] as const) expect(smallest(PLAYER_PALETTE.slice(0, 6), v)).toBeGreaterThanOrEqual(15);
  });

  it('keeps the first 8 apart too', () => {
    expect(CVD_SAFE_UPTO).toBe(8);
    for (const v of ['normal', 'deutan', 'protan'] as const) expect(smallest(PLAYER_PALETTE.slice(0, CVD_SAFE_UPTO), v)).toBeGreaterThanOrEqual(15);
  });

  it('shows why: the old red and green looked alike to deuteranopes', () => {
    expect(colorDistance('#e6194b', '#3cb44b', 'deutan')).toBeLessThan(10);
    expect(colorDistance('#e6194b', '#3cb44b')).toBeGreaterThan(50);
  });

  it('the first 8 stand out on the Classic theme (its blue tiles and dark score bar), none a navy that vanishes there', () => {
    for (const c of PLAYER_PALETTE.slice(0, CVD_SAFE_UPTO)) {
      expect(contrast(c, '#060ce9')).toBeGreaterThanOrEqual(1.5);
      expect(contrast(c, '#050835')).toBeGreaterThanOrEqual(3);
    }
  });

  it('has 12 different colors', () => {
    expect(new Set(PLAYER_PALETTE).size).toBe(12);
  });
});

describe('player colors near the chroma key', () => {
  it('OBS takes out the palette’s yellow, green and lime with a green key, and its red, pink, purple and magenta with a magenta one', () => {
    const keyed = (key: string) => PLAYER_PALETTE.filter((c) => obsKeyed(c, key));
    expect(keyed('#00ff00')).toEqual(['#f0e442', '#009e73', '#bfef45']);
    expect(keyed('#ff00ff')).toEqual(['#e6194b', '#cc79a7', '#911eb4', '#f032e6']);
  });
});

describe('colors OBS’s Chroma Key makes see-through', () => {
  it('by its own maths, at its default Similarity and Smoothness', () => {
    // Brainrot Neon's green values: gone on a green key.
    expect(obsKeyed('#39ff14', '#00ff00')).toBe(true);
    // Classic's blue tiles on a magenta key: partly see-through (0.45 away).
    expect(obsKeyed('#060ce9', '#ff00ff')).toBe(true);
    for (const c of ['#060ce9', '#ffcc00', '#ffffff', '#000000', '#808080']) expect(obsKeyed(c, '#00ff00')).toBe(false);
    for (const c of ['#ffcc00', '#00ff00', '#ffffff', '#000000']) expect(obsKeyed(c, '#ff00ff')).toBe(false);
    expect(obsKeyed('not a color', '#00ff00')).toBe(false);
  });

  it('a fade, along the way too', () => {
    // Orange to blue: both ends clear of magenta, the middle (#984880) not.
    expect(obsKeyed('#ff4000', '#ff00ff') || obsKeyed('#3050ff', '#ff00ff')).toBe(false);
    expect(obsKeyedFade('#ff4000', '#3050ff', '#ff00ff')).toBe(true);
    expect(obsKeyedFade('#ff4000', '#3050ff', '#00ff00')).toBe(false);
    expect(obsKeyedFade('#ff4000', '#ffcc00', '#ff00ff')).toBe(false);
    // Its ends count.
    expect(obsKeyedFade('#202020', '#39ff14', '#00ff00')).toBe(true);
    expect(obsKeyedFade('#ff4000', 'not a color', '#ff00ff')).toBe(false);
  });
});

describe('toHex', () => {
  it('reads a theme color as #rrggbb for a color box', () => {
    expect(toHex('#ABC')).toBe('#aabbcc');
    expect(toHex('#11223344')).toBe('#112233');
    expect(toHex('#fff8')).toBe('#ffffff');
    expect(toHex('rgb(255, 0, 16)')).toBe('#ff0010');
    expect(toHex('rgba(0 128 255 / 0.5)')).toBe('#0080ff');
    expect(toHex('rgb(100%, 0%, 50%)')).toBe('#ff0080');
  });
  it('is null for what it can’t read (names need a browser)', () => {
    expect(toHex(undefined)).toBeNull();
    expect(toHex('none')).toBeNull();
    expect(toHex('url(x)')).toBeNull();
    expect(toHex('#12')).toBeNull();
  });
});
