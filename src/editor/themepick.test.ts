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
  it('names a setting on the Theme page for each part', () => {
    expect(Object.values(PREVIEW_SETTING).every((s) => s.place.startsWith('theme:') && s.name)).toBe(true);
  });
});
