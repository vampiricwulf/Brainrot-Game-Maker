import { describe, expect, it } from 'vitest';
import { textBleed, typewriterChars, typewriterTimes } from './textfx';

describe('room for text effects', () => {
  it('nothing extra without effects', () => {
    expect(textBleed({})).toBe(0);
  });
  it('an outline reaches half its width past the letters', () => {
    expect(textBleed({ stroke: { color: '#000', width: 12 } })).toBe(6);
  });
  it('a drop shadow reaches its offset plus its blur', () => {
    expect(textBleed({ shadow: { color: '#000', x: 6, y: -10, blur: 4 } })).toBe(14);
  });
  it('a glow reaches twice its size, and the widest effect wins', () => {
    expect(textBleed({ glow: { color: '#0f0', blur: 20 }, stroke: { color: '#000', width: 6 }, shadow: { color: '#000', x: 6, y: 6, blur: 0 } })).toBe(40);
  });
  it('a broken number counts as none', () => {
    expect(textBleed({ stroke: { color: '#000', width: null as unknown as number } })).toBe(0);
  });
});

describe('typewriter', () => {
  it('splits into characters, an emoji as one', () => {
    expect(typewriterChars('Hi 👋🏽!')).toEqual(['H', 'i', ' ', '👋🏽', '!']);
  });
  it('spreads the characters over the duration after the delay', () => {
    expect(typewriterTimes(5, 0.5, 2)).toEqual([0.5, 1, 1.5, 2, 2.5]);
  });
  it('one character shows at the delay; none gives none', () => {
    expect(typewriterTimes(1, 1, 3)).toEqual([1]);
    expect(typewriterTimes(0, 1, 3)).toEqual([]);
  });
  it('a broken delay or duration shows everything at once', () => {
    expect(typewriterTimes(3, NaN, NaN)).toEqual([0, 0, 0]);
  });
});
