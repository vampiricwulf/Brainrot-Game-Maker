import { describe, expect, it } from 'vitest';
import { aspectCrop, freeOffset, isMediaLink, knobPlacement, SnapshotHistory } from './editing';

describe('slide undo history', () => {
  it('undoes a change made a moment ago (before its debounce committed it)', () => {
    const h = new SnapshotHistory('A');
    h.commit('B');
    // 'C' was never committed: undo must go back to B, not skip to A.
    expect(h.undo('C')).toBe('B');
    expect(h.undo('B')).toBe('A');
    expect(h.undo('A')).toBeNull();
  });

  it('redoes in order, and a new change clears redo', () => {
    const h = new SnapshotHistory('A');
    h.commit('B');
    h.commit('C');
    expect(h.undo('C')).toBe('B');
    expect(h.undo('B')).toBe('A');
    expect(h.redo('A')).toBe('B');
    expect(h.redo('B')).toBe('C');
    expect(h.redo('C')).toBeNull();
    h.undo('C');
    expect(h.redo('X')).toBeNull();
    expect(h.undo('X')).toBe('B');
  });

  it('ignores commits that change nothing and caps its length', () => {
    const h = new SnapshotHistory('0', 3);
    expect(h.commit('0')).toBe(false);
    for (let i = 1; i <= 5; i++) h.commit(String(i));
    expect(h.undoStack).toEqual(['2', '3', '4']);
  });
});

describe('placement', () => {
  it('offsets new items until none sits exactly on an existing one', () => {
    const existing = [{ x: 100, y: 100 }, { x: 130, y: 130 }];
    expect(freeOffset([{ x: 100, y: 100 }], existing)).toBe(2);
    expect(freeOffset([{ x: 500, y: 100 }], existing)).toBe(0);
    expect(freeOffset([{ x: 460, y: 390 }], [{ x: 460, y: 390 }], 40)).toBe(1);
  });

  it('keeps the rotate handle on the slide', () => {
    expect(knobPlacement({ x: 500, y: 300, w: 400, h: 200, rotation: 0 }, 44)).toBe('above');
    expect(knobPlacement({ x: 500, y: 10, w: 400, h: 200, rotation: 0 }, 44)).toBe('below');
    expect(knobPlacement({ x: 0, y: 0, w: 1920, h: 1080, rotation: 0 }, 44)).toBe('inside');
    // Upside down near the bottom edge: "above" (its own top) points down, off the slide.
    expect(knobPlacement({ x: 500, y: 860, w: 400, h: 200, rotation: 180 }, 44)).toBe('below');
  });
});

describe('media links', () => {
  const yt = (u: string) => /youtube\.com|youtu\.be/.test(u);
  it('accepts YouTube and direct media files only', () => {
    expect(isMediaLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ', yt)).toBe(true);
    expect(isMediaLink('  https://example.com/cat.GIF ', yt)).toBe(true);
    expect(isMediaLink('https://example.com/clip.mp4?x=1', yt)).toBe(true);
    expect(isMediaLink('https://example.com/article', yt)).toBe(false);
    expect(isMediaLink('Who is https://example.com/a.png', yt)).toBe(false);
    expect(isMediaLink('This frog became a meme', yt)).toBe(false);
  });
});

describe('aspect-locked crop', () => {
  const sq = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  const ratio = (b: { w: number; h: number }) => b.h / b.w;
  const inside = (b: { x: number; y: number; w: number; h: number }) =>
    b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= 1 + 1e-9 && b.y + b.h <= 1 + 1e-9;

  it('edge handles resize (height drives width for n/s) and stay centred', () => {
    const b = aspectCrop('n', sq, 0, 0.1, 1);
    expect(b.h).toBeCloseTo(0.4);
    expect(b.w).toBeCloseTo(0.4);
    expect(b.y + b.h).toBeCloseTo(0.75);
    expect(b.x + b.w / 2).toBeCloseTo(0.5);
    const s = aspectCrop('s', sq, 0, -0.1, 1);
    expect(s.h).toBeCloseTo(0.4);
    expect(s.y).toBeCloseTo(0.25);
    const e = aspectCrop('e', sq, 0.1, 0, 1);
    expect(e.w).toBeCloseTo(0.6);
    expect(ratio(e)).toBeCloseTo(1);
  });

  it('corners anchor the opposite corner and never break the ratio at the image edge', () => {
    const b = aspectCrop('se', sq, 5, 5, 1);
    expect(ratio(b)).toBeCloseTo(1);
    expect(inside(b)).toBe(true);
    expect(b.x).toBeCloseTo(0.25);
    expect(b.y).toBeCloseTo(0.25);
    // A 16:9 crop on a 4:3 image: ratio in fractions = (9/16) × (4/3) = 0.75.
    const r = 0.75;
    const w = aspectCrop('nw', { x: 0.2, y: 0.2, w: 0.4, h: 0.3 }, -1, -0.01, r);
    expect(ratio(w)).toBeCloseTo(r);
    expect(inside(w)).toBe(true);
    expect(w.x + w.w).toBeCloseTo(0.6);
    expect(w.y + w.h).toBeCloseTo(0.5);
  });

  it('corners follow the bigger pointer move, so they shrink along one axis too', () => {
    // SE dragged straight left: the box shrinks, the NW corner stays put.
    const b = aspectCrop('se', sq, -0.2, 0, 1);
    expect(b.w).toBeCloseTo(0.3);
    expect(b.h).toBeCloseTo(0.3);
    expect(b.x).toBeCloseTo(0.25);
    expect(b.y).toBeCloseTo(0.25);
    // Mostly inward with a little outward on the other axis: still shrinks.
    expect(aspectCrop('se', sq, -0.2, 0.02, 1).w).toBeCloseTo(0.3);
    // NW dragged inward: the SE corner stays put.
    const n = aspectCrop('nw', sq, 0.2, 0, 1);
    expect(n.w).toBeCloseTo(0.3);
    expect(n.x + n.w).toBeCloseTo(0.75);
    expect(n.y + n.h).toBeCloseTo(0.75);
    // Mostly vertical: the height drives (0.75 height per width, so dy = 0.15 is 0.2 of width).
    const v = aspectCrop('se', { x: 0.1, y: 0.1, w: 0.4, h: 0.3 }, 0.05, 0.15, 0.75);
    expect(v.h).toBeCloseTo(0.45);
    expect(v.w).toBeCloseTo(0.6);
  });
});
