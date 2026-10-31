import { describe, expect, it } from 'vitest';
import { partAt, PREVIEW_SETTING } from './themepick';

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('🎨 Theme: a click on the preview finds its setting', () => {
  const boxes = [
    { part: 'tile' as const, box: box(0, 0, 100, 50) },
    { part: 'value' as const, box: box(30, 15, 70, 35) },
    { part: 'header' as const, box: box(0, -40, 100, -5) },
    { part: 'bar' as const, box: box(0, 200, 400, 240) },
    { part: 'plate' as const, box: box(10, 205, 90, 235) },
  ];
  it('takes the innermost part: a value on its tile, a plate on the score bar', () => {
    expect(partAt(50, 25, boxes)).toBe('value');
    expect(partAt(5, 5, boxes)).toBe('tile');
    expect(partAt(50, -20, boxes)).toBe('header');
    expect(partAt(50, 220, boxes)).toBe('plate');
    expect(partAt(300, 220, boxes)).toBe('bar');
  });
  it('is the board anywhere else', () => {
    expect(partAt(300, 100, boxes)).toBe('board');
    expect(partAt(300, 100, [])).toBe('board');
  });
  it('on a clue (or the Final, a slides round): its text is Clue text, the rest of the slide the tile color', () => {
    const clue = [
      { part: 'slide' as const, box: box(0, 0, 1920, 1080) },
      { part: 'clueText' as const, box: box(200, 400, 1720, 680) },
    ];
    expect(partAt(960, 540, clue)).toBe('clueText');
    expect(partAt(20, 540, clue)).toBe('slide');
    expect(PREVIEW_SETTING.clueText).toEqual({ place: 'theme:clueColor', name: 'Clue text' });
    expect(PREVIEW_SETTING.slide.place).toBe(PREVIEW_SETTING.tile.place);
    // (A score plate over the slide is still a plate: the Final's wagers.)
    expect(partAt(50, 220, [...clue, ...boxes])).toBe('plate');
  });
  it('names a setting on the Theme page for each part', () => {
    expect(Object.values(PREVIEW_SETTING).every((s) => s.place.startsWith('theme:') && s.name)).toBe(true);
  });
});
