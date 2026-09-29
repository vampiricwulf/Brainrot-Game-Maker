import { describe, expect, it } from 'vitest';
import { largestFitting } from './autofit';

describe('shrink-to-fit search', () => {
  it('finds the largest size that fits', () => {
    for (const limit of [12, 13, 47, 64, 109, 110]) expect(largestFitting(12, 110, (n) => n <= limit)).toBe(limit);
  });

  it('keeps the full size when it fits, and the minimum when nothing does', () => {
    expect(largestFitting(12, 110, () => true)).toBe(110);
    expect(largestFitting(12, 110, () => false)).toBe(12);
    expect(largestFitting(20, 10, () => false)).toBe(20);
  });

  it('measures only a handful of sizes', () => {
    let probes = 0;
    largestFitting(12, 600, (n) => (probes++, n <= 77));
    expect(probes).toBeLessThanOrEqual(11);
  });
});
