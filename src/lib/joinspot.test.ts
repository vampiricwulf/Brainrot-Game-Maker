import { describe, expect, it } from 'vitest';
import { joinSpot } from './joinspot';
import { newImageEl, newTextEl, textSlide, type Slide } from './model';

/** A slide with text boxes at these places. */
function slide(...boxes: [number, number, number, number][]): Slide {
  const s = textSlide();
  s.elements = boxes.map(([x, y, w, h]) => Object.assign(newTextEl('Words'), { x, y, w, h }));
  return s;
}

describe('joinSpot (the join code on a slide)', () => {
  it('goes bottom right when nothing is there, else the next free corner', () => {
    expect(joinSpot(slide([200, 300, 1520, 400]))).toEqual({ corner: 'br', small: false });
    expect(joinSpot(slide([1200, 800, 700, 260]))).toEqual({ corner: 'tr', small: false });
    expect(joinSpot(slide([1200, 800, 700, 260], [1200, 0, 700, 300]))).toEqual({ corner: 'tl', small: false });
  });

  it('shrinks to just the code where only that fits, and stays off when every corner has something', () => {
    // Text over all but the bottom, leaving 140px free at the bottom: not enough for the full badge.
    expect(joinSpot(slide([100, 0, 1720, 940]))).toEqual({ corner: 'br', small: true });
    expect(joinSpot(slide([0, 0, 1000, 1050], [1000, 0, 920, 1050]))).toBeNull();
  });

  it('a backdrop filling the stage, hidden text, and empty text boxes don’t count', () => {
    const s = slide();
    s.elements.push(Object.assign(newImageEl('bg'), { x: 0, y: 0, w: 1920, h: 1080 }));
    s.elements.push(Object.assign(newTextEl('secret'), { x: 1400, y: 900, w: 500, h: 180, secret: true }));
    s.elements.push(Object.assign(newTextEl('  '), { x: 1400, y: 900, w: 500, h: 180 }));
    expect(joinSpot(s)).toEqual({ corner: 'br', small: false });
  });

  it('keeps clear of the caption and the countdown band', () => {
    expect(joinSpot(slide(), [{ x: 1400, y: 950, w: 500, h: 100 }])).toEqual({ corner: 'tr', small: false });
    expect(joinSpot(slide([1500, 900, 400, 160]), [{ x: 0, y: 0, w: 1920, h: 150 }])).toEqual({ corner: 'bl', small: false });
  });

  it('a text box takes the room of its words, when measured, not of its whole frame', () => {
    // A new text box's frame is nearly the whole slide: one short line in its middle leaves every corner free.
    const s = slide([120, 90, 1680, 900]);
    expect(joinSpot(s)).toBeNull();
    expect(joinSpot(s, [], 1, { [s.elements[0].id]: { y: 380, h: 140 } })).toEqual({ corner: 'br', small: false });
    // Words filling nearly all of it: only the small badge fits, under them.
    expect(joinSpot(s, [], 1, { [s.elements[0].id]: { y: 30, h: 830 } })).toEqual({ corner: 'br', small: true });
    // A box with a fill shows its whole frame.
    Object.assign(s.elements[0], { background: { color: '#000', padding: 20, radius: 0 } });
    expect(joinSpot(s, [], 1, { [s.elements[0].id]: { y: 380, h: 140 } })).toBeNull();
  });

  it('a turned item takes the room of its turned box', () => {
    // 1000×100 bar turned 90°: 100 wide, 1000 tall, centred on (1810, 540): reaches the right corners.
    const s = slide([1310, 490, 1000, 100]);
    s.elements[0].rotation = 90;
    expect(joinSpot(s)?.corner).toBe('tl');
  });
});
