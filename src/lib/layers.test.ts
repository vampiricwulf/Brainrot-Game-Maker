import { describe, expect, it } from 'vitest';
import { align, bounds, centreOn, clampOnto, contains, elementsAt, keepOnStage, nearestSnap, nextBelow, offStage, restack, touchedBy } from './layers';

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

describe('align several items', () => {
  const three = () => [
    { x: 100, y: 100, w: 200, h: 100 },
    { x: 500, y: 300, w: 100, h: 300 },
    { x: 1000, y: 50, w: 300, h: 50 },
  ];
  it('lines them up with each other, within the box around them, not the slide', () => {
    const els = three();
    align(els, 'left');
    expect(els.map((e) => e.x)).toEqual([100, 100, 100]);
    align(els, 'bottom');
    expect(els.map((e) => e.y + e.h)).toEqual([600, 600, 600]);
    const c = three();
    align(c, 'hcenter');
    // The box around them: 100..1300, middle 700.
    expect(c.map((e) => e.x + e.w / 2)).toEqual([700, 700, 700]);
    const r = three();
    align(r, 'right');
    expect(r.map((e) => e.x + e.w)).toEqual([1300, 1300, 1300]);
  });
  it('uses a turned item as drawn', () => {
    const turned = { x: 0, y: 400, w: 200, h: 100, rotation: 90 };
    const other = { x: 500, y: 100, w: 100, h: 100, rotation: 0 };
    align([turned, other], 'top');
    // Turned a quarter, it reaches 50 above its box.
    expect(bounds(turned).y).toBe(100);
    expect(other.y).toBe(100);
  });
  it('spaces three or more evenly between the outermost two', () => {
    const els = three();
    align(els, 'hdistribute');
    // 100..1300 holds 600 of items: two gaps of 300.
    expect(els.map((e) => e.x)).toEqual([100, 600, 1000]);
    const down = three();
    align(down, 'vdistribute');
    // In order down the slide (by middle): 50..100, 100..200, 300..600 → 50..600 holds 450, gaps of 50.
    expect([down[2].y, down[0].y, down[1].y]).toEqual([50, 150, 300]);
  });
  it('a lone item still goes to the slide', () => {
    const e = { x: 100, y: 100, w: 200, h: 100 };
    align([e], 'right');
    expect(e.x).toBe(1720);
  });
});

describe('snapping and dropping', () => {
  it('snaps the nearest edge within reach, with every guide at that distance', () => {
    expect(nearestSnap([100, 150, 200], [0, 205, 960], 6)).toEqual({ off: 5, at: [205] });
    expect(nearestSnap([100], [0, 960], 6)).toEqual({ off: 0, at: [] });
    expect(nearestSnap([100, 200], [97, 203], 6)).toEqual({ off: -3, at: [97, 203] });
  });
  it('keeps an item dropped near an edge on the slide, and centres one bigger than it', () => {
    const e = { x: 1800, y: -50, w: 400, h: 300 };
    clampOnto(e);
    expect([e.x, e.y]).toEqual([1520, 0]);
    const big = { x: 10, y: 10, w: 2000, h: 200 };
    clampOnto(big);
    expect(big.x).toBe(-40);
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

describe('drag-to-select and items off the slide', () => {
  const box = (id: string, x: number, y: number, w: number, h: number) => ({ id, x, y, w, h, rotation: 0 });
  it("a box drawn on the full-slide question text picks what's on it, not the text", () => {
    const els = [box('text', 0, 0, 1920, 1080), box('rect', 1400, 700, 300, 200)];
    expect(touchedBy(els, { x: 200, y: 150 }, { x: 1500, y: 800 }).map((e) => e.id)).toEqual(['rect']);
    // A box that reaches past the text's edge still takes it.
    expect(touchedBy(els, { x: -20, y: 150 }, { x: 1500, y: 800 }).map((e) => e.id)).toEqual(['text', 'rect']);
  });
  it('knows an item that is wholly off the slide', () => {
    expect(offStage({ x: 1920, y: 0, w: 100, h: 100 })).toBe(true);
    expect(offStage({ x: -100, y: 500, w: 100, h: 100 })).toBe(true);
    expect(offStage({ x: 1900, y: 1000, w: 100, h: 100 })).toBe(false);
    // Turned, its corner reaches back onto the slide.
    expect(offStage({ x: -110, y: 500, w: 100, h: 100, rotation: 45 })).toBe(false);
  });
  it('a nudge or a copy keeps some of the item on the slide', () => {
    const e = { x: 1915, y: -500, w: 200, h: 100 };
    keepOnStage(e);
    expect(e).toEqual({ x: 1880, y: -60, w: 200, h: 100 });
    const small = { x: -50, y: 1100, w: 20, h: 20 };
    keepOnStage(small);
    expect(small).toEqual({ x: 0, y: 1060, w: 20, h: 20 });
    const fine = { x: 100, y: 100, w: 50, h: 50 };
    keepOnStage(fine);
    expect(fine).toEqual({ x: 100, y: 100, w: 50, h: 50 });
  });
});
