import { describe, expect, it } from 'vitest';
import { hexToHsv, hsvToHex, nudge } from '../../src/lib/colormath';
import { anyVerdict, colorWords, hueName, hueText, squareText, typedHex } from './anycolor';

describe('anyVerdict', () => {
  it('sends a free color, any case', () => {
    expect(anyVerdict('#123456', '#f0e442', ['#56b4e9'])).toBe('send');
    expect(anyVerdict('#ABCDEF', '#f0e442', ['#56b4e9'])).toBe('send');
  });
  it('just closes on the color the player has', () => {
    expect(anyVerdict('#F0E442', '#f0e442', [])).toBe('same');
  });
  it("won't take another player's color", () => {
    expect(anyVerdict('#56B4E9', '#f0e442', ['#56b4e9'])).toBe('taken');
  });
});

describe('typedHex', () => {
  it('uses six digits at once, with or without #', () => {
    expect(typedHex('#123456')).toEqual({ use: '#123456', bad: false });
    expect(typedHex('ABCDEF')).toEqual({ use: '#abcdef', bad: false });
  });
  it('waits on three digits (the start of six), unless pasted', () => {
    expect(typedHex('#abc')).toEqual({ use: null, bad: false });
    expect(typedHex('#abc', true)).toEqual({ use: '#aabbcc', bad: false });
  });
  it('half typed is not a mistake; anything else is', () => {
    expect(typedHex('#12')).toEqual({ use: null, bad: false });
    expect(typedHex('')).toEqual({ use: null, bad: false });
    expect(typedHex('#12345g')).toEqual({ use: null, bad: true });
    expect(typedHex('red')).toEqual({ use: null, bad: true });
  });
});

describe('words', () => {
  it('names hues round the strip', () => {
    expect([0, 30, 60, 120, 180, 220, 270, 320, 350, 360].map(hueName)).toEqual(['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'red', 'red']);
  });
  it('says dark, pale, grey, black and white', () => {
    expect(colorWords(hexToHsv('#123456')!)).toBe('dark blue');
    expect(colorWords(hexToHsv('#f2b8d0')!)).toBe('pale pink');
    expect(colorWords(hexToHsv('#e6194b')!)).toBe('red');
    expect(colorWords(hexToHsv('#808080')!)).toBe('grey');
    expect(colorWords(hexToHsv('#000000')!)).toBe('black');
    expect(colorWords(hexToHsv('#ffffff')!)).toBe('white');
  });
  it('gives the sliders their values in words', () => {
    expect(squareText({ h: 10, s: 0.5, v: 0.256 })).toBe('Color 50%, brightness 26%');
    expect(hueText({ h: 210.4, s: 1, v: 1 })).toBe('blue, 210°');
  });
});

describe('the picker’s moves (colormath)', () => {
  it('a color comes back out as the same hex', () => {
    for (const c of ['#123456', '#f0e442', '#000000', '#ffffff', '#9a6324']) expect(hsvToHex(hexToHsv(c)!)).toBe(c);
  });
  it('arrow keys step the square and the strip', () => {
    const c = { h: 200, s: 0.5, v: 0.5 };
    expect(nudge(c, 'square', 'ArrowRight', false)).toEqual({ h: 200, s: 0.51, v: 0.5 });
    expect(nudge(c, 'square', 'ArrowUp', true)).toEqual({ h: 200, s: 0.5, v: 0.6 });
    expect(nudge(c, 'bar', 'ArrowLeft', false)).toEqual({ h: 199, s: 0.5, v: 0.5 });
    expect(nudge(c, 'bar', 'Enter', false)).toBeNull();
  });
});
