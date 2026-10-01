import { describe, expect, it } from 'vitest';
import { fitAspect, resizeAround } from './editing';
import { angleToOutput, angleToSource, defaultEdits, itemAt, migrateEdits, outputSize, placedOverlays, toOutput, toSource, turnCrop } from './imageedit';
import type { ImageEdits } from './model';

describe('✎ Edit image › Apply: the picture box', () => {
  it('a square crop of a wide picture keeps about the same size, centred where it was', () => {
    expect(fitAspect({ x: 480, y: 270, w: 960, h: 540 }, 1)).toEqual({ x: 600, y: 180, w: 720, h: 720 });
  });
  it('a quarter turn swaps its width and height around its middle', () => {
    expect(fitAspect({ x: 300, y: 300, w: 800, h: 400 }, 0.5)).toEqual({ x: 500, y: 100, w: 400, h: 800 });
  });
  it('applying again and again never shrinks it or moves it along', () => {
    let box = { x: 333, y: 211, w: 777, h: 431 };
    for (let i = 0; i < 20; i++) box = fitAspect(box, 777 / 431);
    expect(Math.abs(box.w - 777)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.x - 333)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - 211)).toBeLessThanOrEqual(1);
  });
  it('a picture turned upright stays on the slide (it used to grow off it)', () => {
    const box = fitAspect({ x: 100, y: 100, w: 1600, h: 900 }, 9 / 16);
    expect(box).toEqual({ x: 596, y: 0, w: 608, h: 1080 });
  });
  it('a box partly off the slide comes back onto it', () => {
    const box = fitAspect({ x: 1500, y: 800, w: 800, h: 400 }, 2);
    expect(box).toEqual({ x: 1120, y: 680, w: 800, h: 400 });
  });
  it('a shape that is not a number leaves the box alone', () => {
    expect(fitAspect({ x: 1, y: 2, w: 3, h: 4 }, NaN)).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });
  it('Use original goes back to the size it had, around where it is now', () => {
    expect(resizeAround({ x: 600, y: 180, w: 720, h: 720 }, 960, 540)).toEqual({ x: 480, y: 270, w: 960, h: 540 });
  });
});

describe('✎ Edit image: captions, stickers and strokes stay on the picture', () => {
  const e = (over: Partial<ImageEdits>): ImageEdits => ({ ...defaultEdits(), v: 2, ...over });
  const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  };
  it('a crop shows the same spot of the picture where it now is', () => {
    const crop = { x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
    close(toOutput({ x: 0.75, y: 0.75 }, 800, 600, e({ crop })), { x: 0.5, y: 0.5 });
  });
  it('a quarter turn clockwise takes the top-left corner to the top-right', () => {
    close(toOutput({ x: 0, y: 0 }, 800, 600, e({ rotate: 90 })), { x: 1, y: 0 });
    close(toOutput({ x: 0, y: 0 }, 800, 600, e({ rotate: -90 })), { x: 0, y: 1 });
  });
  it('a flip mirrors the place, and the angle', () => {
    close(toOutput({ x: 0.2, y: 0.3 }, 800, 600, e({ flipH: true })), { x: 0.8, y: 0.3 });
    expect(angleToOutput(20, e({ flipH: true }))).toBe(-20);
    expect(angleToOutput(20, e({ flipH: true, flipV: true }))).toBe(20);
    expect(angleToOutput(10, e({ rotate: 90 }))).toBe(100);
  });
  it('goes there and back for any turn, flip and crop', () => {
    const edits = e({ rotate: 37, flipV: true, crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 } });
    for (const p of [{ x: 0.3, y: 0.4 }, { x: 0, y: 1 }, { x: 0.9, y: 0.05 }]) close(toSource(toOutput(p, 640, 480, edits), 640, 480, edits), p);
    for (const a of [-170, -5, 0, 44, 179]) expect(angleToSource(angleToOutput(a, edits), edits)).toBeCloseTo(a, 6);
  });
  it('a crop makes them bigger with the picture', () => {
    const t = { id: 't', text: 'HI', x: 0.5, y: 0.5, size: 0.05, color: '#fff', stroke: '#000', strokeWidth: 0.1, font: 'Impact', rotation: 0 };
    const placed = placedOverlays(e({ texts: [t], crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } }), 800, 600);
    expect(placed.texts[0].size).toBeCloseTo(0.1, 6);
  });
  it('edits saved before (on the finished image) are moved onto the picture, looking just the same', () => {
    const old: ImageEdits = {
      ...defaultEdits(),
      rotate: 90,
      flipH: true,
      crop: { x: 0.1, y: 0.1, w: 0.7, h: 0.6 },
      texts: [{ id: 't', text: 'TOP', x: 0.5, y: 0.1, size: 0.09, color: '#fff', stroke: '#000', strokeWidth: 0.12, font: 'Impact', rotation: 12 }],
      stickers: [{ id: 's', emoji: '🔥', x: 0.8, y: 0.8, size: 0.15, rotation: -30 }],
      strokes: [{ color: '#f00', size: 0.015, erase: false, points: [0.1, 0.2, 0.3, 0.4] }],
    };
    const moved = migrateEdits(old, 1200, 800);
    expect(moved.v).toBe(2);
    expect(migrateEdits(moved, 1200, 800)).toBe(moved);
    const shown = placedOverlays(moved, 1200, 800);
    const t = shown.texts[0];
    close(t, { x: 0.5, y: 0.1 });
    expect(t.size).toBeCloseTo(0.09, 6);
    expect(t.rotation).toBeCloseTo(12, 6);
    expect(shown.stickers[0].rotation).toBeCloseTo(-30, 6);
    expect(shown.strokes[0].size).toBeCloseTo(0.015, 6);
    shown.strokes[0].points.forEach((v, i) => expect(v).toBeCloseTo(old.strokes[0].points[i], 6));
    // Edits from before are drawn as they were (as fractions of the finished image).
    expect(placedOverlays(old, 1200, 800).texts[0]).toBe(old.texts[0]);
  });
  it('⟲ / ⟳ 90° turn the crop with the picture: the same part stays cropped', () => {
    const crop = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    expect(turnCrop(crop, 1)).toEqual({ x: 1 - 0.2 - 0.4, y: 0.1, w: 0.4, h: 0.3 });
    const back = turnCrop(turnCrop(crop, 1), -1);
    for (const k of ['x', 'y', 'w', 'h'] as const) expect(back[k]).toBeCloseTo(crop[k], 9);
    // The crop's corner is the same spot of the picture before and after the turn.
    const before = e({ crop });
    const after = e({ rotate: 90, crop: turnCrop(crop, 1) });
    const p = toSource({ x: 0, y: 0 }, 800, 600, before);
    close(toOutput(p, 800, 600, after), { x: 1, y: 0 });
    expect(outputSize(800, 600, after)).toEqual({ w: outputSize(800, 600, before).h, h: outputSize(800, 600, before).w });
  });
});

describe('image editor: what a click picks', () => {
  const caption = { id: 'c', text: 'A LONG MEME CAPTION', x: 0.5, y: 0.2, size: 0.05, color: '#fff', stroke: '#000', strokeWidth: 0.1, font: 'Impact', rotation: 0 };
  const sticker = { id: 's', emoji: '🔥', x: 0.5, y: 0.8, size: 0.1, rotation: 0 };
  const edits = { texts: [caption], stickers: [sticker] };
  it("a caption is hit along its whole line, not in a circle around its middle", () => {
    // 1000 wide: 19 letters × 50 × 0.6 ≈ 570 px wide, 75 px tall.
    expect(itemAt({ x: 0.75, y: 0.2 }, 1000, 1000, edits)).toBe('c');
    expect(itemAt({ x: 0.5, y: 0.3 }, 1000, 1000, edits)).toBeNull();
  });
  it('a sticker is hit within its square; the top one wins', () => {
    expect(itemAt({ x: 0.54, y: 0.84 }, 1000, 1000, edits)).toBe('s');
    expect(itemAt({ x: 0.5, y: 0.2 }, 1000, 1000, { texts: [caption], stickers: [{ ...sticker, y: 0.2 }] })).toBe('s');
  });
  it('a turned caption is hit along its turn', () => {
    const turned = { texts: [{ ...caption, rotation: 90, y: 0.5 }], stickers: [] };
    expect(itemAt({ x: 0.5, y: 0.7 }, 1000, 1000, turned)).toBe('c');
    expect(itemAt({ x: 0.7, y: 0.5 }, 1000, 1000, turned)).toBeNull();
  });
});
