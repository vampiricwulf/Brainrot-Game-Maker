import { describe, expect, it } from 'vitest';
import { moreBelow } from './scrollmore';

describe('moreBelow', () => {
  it('is true while rows are below what shows', () => {
    expect(moreBelow(0, 200, 600)).toBe(true);
    expect(moreBelow(300, 200, 600)).toBe(true);
  });
  it('is false at the foot, and when it all fits', () => {
    expect(moreBelow(400, 200, 600)).toBe(false);
    expect(moreBelow(0, 200, 200)).toBe(false);
    expect(moreBelow(0, 200, 150)).toBe(false);
  });
  it('leaves out a pixel of rounding (a zoomed window scrolls by fractions)', () => {
    expect(moreBelow(399.4, 200, 600)).toBe(false);
    expect(moreBelow(399.6, 200, 600.5)).toBe(false);
    expect(moreBelow(397, 200, 600)).toBe(true);
  });
});
