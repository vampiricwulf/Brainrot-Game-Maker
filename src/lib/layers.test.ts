import { describe, expect, it } from 'vitest';
import { align, bounds, centreOn, contains, elementsAt, nextBelow, restack, touchedBy } from './layers';

const box = (id: string, x: number, y: number, w: number, h: number, zIndex: number, rotation = 0) => ({ id, x, y, w, h, zIndex, rotation });

describe('restack', () => {
  const stack = () => ['a', 'b', 'c', 'd'].map((id, i) => ({ id, zIndex: i * 10 }));
  const order = (els: { id: string; zIndex: number }[]) => [...els].sort((x, y) => x.zIndex - y.zIndex).map((e) => e.id).join('');
  it('moves items to the front or back, keeping their own order', () => {
    const s = stack();
    restack(s, ['a', 'c'], 'front');
    expect(order(s)).toBe('bdac');
    restack(s, ['c', 'd'], 'back');
    expect(order(s)).toBe('dcba');
  });
  it('steps items forward and backward one place', () => {
    const s = stack();
    restack(s, ['b'], 'forward');
    expect(order(s)).toBe('acbd');
    restack(s, ['b'], 'backward');
    expect(order(s)).toBe('abcd');
    restack(s, ['d'], 'forward');
    expect(order(s)).toBe('abcd');
    restack(s, ['a', 'b'], 'forward');
    expect(order(s)).toBe('cabd');
    expect(s.map((e) => e.zIndex).sort()).toEqual([0, 1, 2, 3]);
  });
});

describe('hit-testing', () => {
  it('handles rotated boxes', () => {
    const b = box('a', 0, 0, 200, 20, 0, 90); // centre (100, 10), now 20 wide × 200 tall
    expect(contains(b, { x: 100, y: 10 })).toBe(true);
    expect(contains(b, { x: 100, y: 100 })).toBe(true);
    expect(contains(b, { x: 180, y: 10 })).toBe(false);
    const r = bounds(b);
    expect(r.w).toBeCloseTo(20);
    expect(r.h).toBeCloseTo(200);
  });

  it('lists the stack under a point top-first and walks down it', () => {
    const els = [box('bg', 0, 0, 1920, 1080, 0), box('text', 100, 100, 400, 200, 2), box('img', 50, 50, 300, 300, 1)];
    expect(elementsAt(els, { x: 200, y: 150 }).map((e) => e.id)).toEqual(['text', 'img', 'bg']);
    expect(elementsAt(els, { x: 1500, y: 900 }).map((e) => e.id)).toEqual(['bg']);
    const p = { x: 200, y: 150 };
    expect(nextBelow(els, p, 'text')?.id).toBe('img');
    expect(nextBelow(els, p, 'img')?.id).toBe('bg');
    expect(nextBelow(els, p, 'bg')?.id).toBe('text');
    expect(nextBelow(els, p, null)?.id).toBe('text');
  });

  it('respects rotation for a full-height bar', () => {
    const bar = box('a', 900, 0, 120, 1080, 0);
    expect(contains(bar, { x: 960, y: 100 })).toBe(true);
    expect(contains({ ...bar, rotation: 90 }, { x: 960, y: 100 })).toBe(false);
    expect(contains({ ...bar, rotation: 90 }, { x: 500, y: 540 })).toBe(true);
  });

  it('Alt+click walks the whole stack under the pointer, locked items too, and wraps', () => {
    const items = [
      box('text', 120, 90, 1680, 900, 0),
      box('img', 0, 0, 1920, 1080, 2),
      { ...box('box', 800, 400, 300, 300, 1), locked: true },
      box('far', 0, 0, 50, 50, 5),
    ];
    const p = { x: 960, y: 540 };
    // Nothing there selected (or something elsewhere): start at the top.
    expect(nextBelow(items, p, null)?.id).toBe('img');
    expect(nextBelow(items, p, 'far')?.id).toBe('img');
    expect(nextBelow(items, p, 'img')?.id).toBe('box');
    expect(nextBelow(items, p, 'box')?.id).toBe('text');
    expect(nextBelow(items, p, 'text')?.id).toBe('img');
    expect(nextBelow([items[0]], p, null)?.id).toBe('text');
    expect(nextBelow([items[0]], p, 'text')?.id).toBe('text');
    expect(nextBelow(items, { x: 1919, y: 1079 }, null)?.id).toBe('img');
    expect(nextBelow(items, { x: -5, y: 540 }, null)).toBeUndefined();
  });

  it('finds what a drag-to-select box touches, from any corner', () => {
    const els = [box('a', 0, 0, 100, 100, 0), box('b', 300, 300, 100, 100, 1)];
    expect(touchedBy(els, { x: 50, y: 50 }, { x: 200, y: 200 }).map((e) => e.id)).toEqual(['a']);
    expect(touchedBy(els, { x: 350, y: 350 }, { x: 50, y: 50 }).map((e) => e.id)).toEqual(['a', 'b']);
    expect(touchedBy(els, { x: 150, y: 150 }, { x: 250, y: 250 })).toEqual([]);
  });
});

describe('align', () => {
  it('puts items at the edges or in the middle of the stage', () => {
    const e = { x: 100, y: 100, w: 400, h: 200 };
    align([e], 'right');
    align([e], 'vcenter');
    expect([e.x, e.y]).toEqual([1520, 440]);
    align([e], 'hcenter');
    align([e], 'bottom');
    expect([e.x, e.y]).toEqual([760, 880]);
    align([e], 'left');
    align([e], 'top');
    expect([e.x, e.y]).toEqual([0, 0]);
  });
});

describe('centreOn', () => {
  it('moves a group together so the middle of the box around it is at the point', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 200, y: 100, w: 100, h: 100 };
    centreOn([a, b], { x: 1000, y: 500 });
    expect([a.x, a.y, b.x, b.y]).toEqual([850, 400, 1050, 500]);
  });
});
