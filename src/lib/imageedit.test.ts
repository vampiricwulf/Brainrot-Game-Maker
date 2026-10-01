import { describe, expect, it } from 'vitest';
import { fitAspect } from './editing';
import { itemAt } from './imageedit';

describe('🎨 Edit image › Apply: the picture box', () => {
  it('a square crop of a wide picture fits inside the old box, centred where it was', () => {
    expect(fitAspect({ x: 480, y: 270, w: 960, h: 540 }, 1)).toEqual({ x: 690, y: 270, w: 540, h: 540 });
  });
  it('a picture turned upright stays inside its box (it used to grow off the slide)', () => {
    const box = fitAspect({ x: 100, y: 100, w: 1600, h: 900 }, 9 / 16);
    expect(box.h).toBe(900);
    expect(box.w).toBe(506);
    expect(box.y + box.h).toBeLessThanOrEqual(1080);
  });
  it('a box partly off the slide comes back onto it', () => {
    const box = fitAspect({ x: 1500, y: 800, w: 800, h: 400 }, 2);
    expect(box).toEqual({ x: 1120, y: 680, w: 800, h: 400 });
  });
  it('a shape that is not a number leaves the box alone', () => {
    expect(fitAspect({ x: 1, y: 2, w: 3, h: 4 }, NaN)).toEqual({ x: 1, y: 2, w: 3, h: 4 });
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
