import { describe, expect, it } from 'vitest';
import { fitWith, groupSize, largestFitting, softHyphens } from './autofit';

describe('shrink-to-fit search', () => {
  it('finds the largest size that fits', () => {
    for (const limit of [12, 13, 47, 64, 109, 110]) expect(largestFitting(12, 110, (n) => n <= limit)).toBe(limit);
  });

  it('keeps the full size when it fits, and the minimum when nothing does', () => {
    expect(largestFitting(12, 110, () => true)).toBe(110);
    expect(largestFitting(12, 110, () => false)).toBe(12);
    expect(largestFitting(20, 10, () => false)).toBe(20);
  });

  it('measures only a handful of sizes', () => {
    let probes = 0;
    largestFitting(12, 600, (n) => (probes++, n <= 77));
    expect(probes).toBeLessThanOrEqual(11);
  });
});

describe('fitting a box (score plates, board values, category names)', () => {
  // A box `w` wide holding `len` characters 0.5em wide: whole words overflow when the longest one is wider than the
  // box; hyphenated or broken anywhere, when the text needs more than 3 lines.
  const box = (len: number, w: number) => (size: number, wrap: string) =>
    wrap === 'anywhere' || wrap === 'hyphen' ? (len * size * 0.5) / w > 3 : len * size * 0.5 > w;

  it('keeps the full size when it fits', () => {
    expect(fitWith({ size: 64, enabled: true }, box(4, 300))).toMatchObject({ size: 64, overflow: false });
  });

  it('shrinks a long score to fit its plate, never below the smallest size', () => {
    // "$1,000,000" (10 characters) on a 140px plate: 28px fits.
    expect(fitWith({ size: 64, min: 22, noBreak: true, enabled: true }, box(10, 140))).toMatchObject({ size: 28, overflow: false });
    // Too long even at the smallest size: it stays at the smallest, cut ("…"), never broken.
    const r = fitWith({ size: 64, min: 22, noBreak: true, enabled: true }, box(30, 140));
    expect(r).toMatchObject({ size: 22, overflow: true });
    expect(r.wrap).toBe('normal');
  });

  it('gives ten columns of "$1,000" the size that fits a column', () => {
    // 1920 wide, 10 columns: about 157px inside each tile.
    const r = fitWith({ size: 84, min: 24, noBreak: true, enabled: true }, box(6, 157));
    expect(r.size).toBe(52);
    expect(r.overflow).toBe(false);
  });

  it('hyphenates a word too long for its column before breaking it anywhere, at the smallest size or more', () => {
    const r = fitWith({ size: 54, min: 30, hyphenate: true, enabled: true }, box(13, 157));
    expect(r.wrap).toBe('hyphen');
    expect(r.size).toBeGreaterThanOrEqual(30);
    expect(fitWith({ size: 54, min: 30, enabled: true }, box(13, 157)).wrap).toBe('anywhere');
  });

  it('gives a group the smallest size any of its boxes fits at', () => {
    expect(groupSize([84, 61, 72, undefined])).toBe(61);
    expect(groupSize([undefined])).toBeUndefined();
  });

  it('puts soft hyphens inside long words only, at least 3 letters from either end', () => {
    expect(softHyphens('Skibidi Lore')).toBe('Skibidi Lore');
    const s = softHyphens('Supercalifragilistic');
    expect(s.replace(/­/g, '')).toBe('Supercalifragilistic');
    expect(s.startsWith('Sup­')).toBe(true);
    expect(s.endsWith('­tic')).toBe(true);
  });
});
