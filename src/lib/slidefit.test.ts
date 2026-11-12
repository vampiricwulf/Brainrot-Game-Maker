import { describe, expect, it } from 'vitest';
import { fitSlideWidth, MIN_SLIDE_WIDTH } from './slidefit';

describe('fitSlideWidth', () => {
  it('fits the slide and its frame above the window’s foot, 16 px clear', () => {
    // A 1280×720 laptop: the canvas starts at 371.
    const w = fitSlideWidth(371, 720);
    expect(w).toBe(Math.floor(((720 - 371 - 16 - 30) * 16) / 9));
    expect(371 + (w * 9) / 16 + 30 + 16).toBeLessThanOrEqual(720);
  });
  it('grows with the window', () => {
    expect(fitSlideWidth(371, 1080)).toBeGreaterThan(fitSlideWidth(371, 768));
  });
  it('never goes below its least width, however little room there is', () => {
    expect(fitSlideWidth(900, 640)).toBe(MIN_SLIDE_WIDTH);
    expect(fitSlideWidth(500, 640)).toBe(MIN_SLIDE_WIDTH);
  });
});
