import { describe, expect, it } from 'vitest';
import { placePopup } from './anchored';

const view = { width: 1280, height: 600 };
const btn = (left: number, top: number, w = 100, h = 30) => ({ left, top, right: left + w, bottom: top + h });

describe('placePopup', () => {
  it('drops under its button when there is room', () => {
    const p = placePopup({ anchor: btn(100, 100), width: 300, height: 200, view });
    expect(p).toMatchObject({ side: 'below', left: 100, top: 134 });
    expect(p.maxHeight).toBeGreaterThanOrEqual(200);
  });

  it('goes over its button near the window’s foot, and fully inside the window', () => {
    const p = placePopup({ anchor: btn(100, 540), width: 300, height: 300, view });
    expect(p.side).toBe('above');
    expect(p.top).toBe(540 - 4 - 300);
    expect(p.top).toBeGreaterThanOrEqual(8);
  });

  it('keeps its preferred side above when it fits', () => {
    expect(placePopup({ anchor: btn(100, 400), width: 260, height: 200, view, side: 'above' }).side).toBe('above');
    expect(placePopup({ anchor: btn(100, 100), width: 260, height: 200, view, side: 'above' }).side).toBe('below');
  });

  it('moves in from the window’s right edge, and lines up with the right edge when asked', () => {
    expect(placePopup({ anchor: btn(1200, 100, 60), width: 300, height: 100, view }).left).toBe(1280 - 8 - 300);
    expect(placePopup({ anchor: btn(500, 100), width: 300, height: 100, view, align: 'end' }).left).toBe(300);
    expect(placePopup({ anchor: btn(0, 100), width: 300, height: 100, view, align: 'end' }).left).toBe(8);
  });

  it('scrolls inside when taller than both sides, on the side with more room', () => {
    const p = placePopup({ anchor: btn(100, 200), width: 300, height: 2000, view });
    expect(p.side).toBe('below');
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(600 - 8);
    const q = placePopup({ anchor: btn(100, 450), width: 300, height: 2000, view });
    expect(q.side).toBe('above');
    expect(q.top).toBeGreaterThanOrEqual(8);
    expect(q.maxHeight).toBe(450 - 4 - 8);
  });

  it('stays in its box (the host panel) when it fits there, scrolling if it must', () => {
    // A panel under the stage, from y 230 to the window's foot; the button at its top right.
    const within = { left: 0, top: 230, right: 1280, bottom: 600 };
    const p = placePopup({ anchor: btn(1100, 240), width: 300, height: 500, view, within, align: 'end' });
    expect(p.side).toBe('below');
    expect(p.top).toBeGreaterThanOrEqual(230);
    expect(p.maxHeight).toBe(600 - 8 - 274);
    // A column beside the stage: moved in to it rather than over the stage.
    const col = { left: 860, top: 0, right: 1280, bottom: 600 };
    expect(placePopup({ anchor: btn(985, 70, 117), width: 300, height: 380, view, within: col, align: 'end' }).left).toBeGreaterThanOrEqual(860);
  });

  it('leaves its box when there is too little room in it', () => {
    const within = { left: 0, top: 500, right: 1280, bottom: 600 };
    const p = placePopup({ anchor: btn(100, 510), width: 300, height: 300, view, within });
    expect(p.side).toBe('above');
    expect(p.top).toBeLessThan(500);
  });

  it('never runs past a tiny window', () => {
    const p = placePopup({ anchor: btn(10, 10), width: 400, height: 900, view: { width: 320, height: 240 } });
    expect(p.maxWidth).toBe(304);
    expect(p.left).toBe(8);
    expect(p.top + Math.min(900, p.maxHeight)).toBeLessThanOrEqual(232);
  });

  it('stays on screen when its button has scrolled out of sight', () => {
    const p = placePopup({ anchor: btn(100, -200), width: 300, height: 200, view });
    expect(p.top).toBeGreaterThanOrEqual(8);
  });
});
