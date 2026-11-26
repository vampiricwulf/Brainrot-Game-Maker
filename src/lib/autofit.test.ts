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

  it('shrinks toward the floor with whole words before breaking one, then hyphenates at the smallest size or more', () => {
    // "UNIVERSE" (8 letters) in a 140px column: whole at 35px or less. Above `min` it would have to break; between
    // `floor` and `min` it fits whole, so it does.
    const word = (size: number, wrap: string) => (wrap === 'hyphen' || wrap === 'anywhere' ? false : 8 * size * 0.5 > 140);
    expect(fitWith({ size: 54, min: 36, floor: 20, hyphenate: true, enabled: true }, word)).toMatchObject({ size: 35, overflow: false, wrap: 'normal' });
    // Too long to be whole even at the floor: hyphenated, at `min` or more.
    const r = fitWith({ size: 54, min: 30, floor: 20, hyphenate: true, enabled: true }, box(30, 157));
    expect(r.wrap).toBe('hyphen');
    expect(r.size).toBeGreaterThanOrEqual(30);
  });

  it('a one-word name (breakFirst): hyphenates at the smallest size or more before it shrinks whole toward the floor', () => {
    // "ANTIDISESTABLISHMENTARIANISM" (28 letters) in a 284px cell: whole at 20px in a narrow font, hyphenated at 30+.
    const word = box(28, 284);
    const opts = { size: 54, min: 30, floor: 20, hyphenate: true, enabled: true };
    expect(fitWith(opts, word)).toMatchObject({ size: 20, wrap: 'normal' });
    const r = fitWith({ ...opts, breakFirst: true }, word);
    expect(r.wrap).toBe('hyphen');
    expect(r.size).toBeGreaterThanOrEqual(30);
    // A word with nowhere to break (no soft hyphens: it overflows hyphenated as it does whole) still goes down whole.
    const unbreakable = (size: number, wrap: string) => (wrap === 'anywhere' ? false : 12 * size * 0.5 > 140);
    expect(fitWith({ ...opts, breakFirst: true }, unbreakable)).toMatchObject({ size: 23, overflow: false, wrap: 'normal' });
  });

  it('gives a group the smallest size any of its boxes fits at', () => {
    expect(groupSize([84, 61, 72, undefined])).toBe(61);
    expect(groupSize([undefined])).toBeUndefined();
  });

  /** A word as it may break ("ANTI|DIS|…"). */
  const parts = (w: string) => softHyphens(w).split('\u00ad');

  it('puts soft hyphens inside long words only, at syllables, never fewer than 4 letters from either end', () => {
    expect(softHyphens('Skibidi Lore')).toBe('Skibidi Lore');
    const s = softHyphens('Supercalifragilistic');
    expect(s.replace(/\u00ad/g, '')).toBe('Supercalifragilistic');
    expect(parts('Supercalifragilistic')).toEqual(['Super', 'ca', 'li', 'fra', 'gi', 'listic']);
    expect(parts('ANTIDISESTABLISHMENTARIANISM')).toEqual(['ANTI', 'DI', 'SES', 'TAB', 'LISH', 'MEN', 'TA', 'RIA', 'NISM']);
    // Never "UNIVE-RSE", "EXTE-NDED" nor "ESTABLI-SHMENT".
    expect(parts('UNIVERSE')).toEqual(['UNIVERSE']);
    expect(parts('EXTENDED')).toEqual(['EXTENDED']);
    expect(parts('ESTABLISHMENT')).toEqual(['ESTAB', 'LISH', 'MENT']);
    // Two consonants that go together stay together.
    expect(parts('TEACHERS')).toEqual(['TEACHERS']);
    expect(parts('CONSTRUCTION')).toEqual(['CONS', 'TRUC', 'TION']);
    // Another alphabet: any letter, still 4 from either end.
    expect(parts('ДОСТОПРИМЕЧАТЕЛЬНОСТЬ').length).toBe(15);
    for (const w of ['Supercalifragilistic', 'ANTIDISESTABLISHMENTARIANISM', 'ESTABLISHMENT', 'CONSTRUCTION', 'ДОСТОПРИМЕЧАТЕЛЬНОСТЬ']) {
      const p = parts(w);
      expect(p[0].length).toBeGreaterThanOrEqual(4);
      expect(p[p.length - 1].length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('fitting pages of text pasted into a slide', () => {
  it("doesn't search for a size when nothing fits even at the smallest (each try lays out all of it)", () => {
    const tries: string[] = [];
    const r = fitWith({ size: 90, min: 12, enabled: true }, (size, wrap) => (tries.push(`${size}${wrap}`), true));
    expect(r).toMatchObject({ size: 12, overflow: true, wrap: 'anywhere' });
    expect(tries).toEqual(['90normal', '12normal', '12anywhere']);
  });
});
