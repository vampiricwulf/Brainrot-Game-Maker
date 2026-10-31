import { describe, expect, it } from 'vitest';
import { cardToward, isArrow, type Box } from './gridkeys';

// The first screen: ✨ the sample across the top, then three cards, then two wider ones.
const box = (left: number, top: number, width: number, height = 100): Box => ({ left, top, width, height });
const page = [box(0, 0, 600, 80), box(0, 100, 190), box(205, 100, 190), box(410, 100, 190), box(0, 212, 295), box(305, 212, 295)];

describe('the arrow keys on a grid of cards', () => {
  it('← and → go to the card before and after, across rows', () => {
    expect(cardToward(page, 1, 'ArrowLeft')).toBe(0);
    expect(cardToward(page, 3, 'ArrowRight')).toBe(4);
    expect(cardToward(page, 0, 'ArrowLeft')).toBe(-1);
    expect(cardToward(page, 5, 'ArrowRight')).toBe(-1);
  });

  it('↑ and ↓ go to the row above or below, to the card most in line', () => {
    expect(cardToward(page, 0, 'ArrowDown')).toBe(2);
    expect(cardToward(page, 1, 'ArrowDown')).toBe(4);
    expect(cardToward(page, 3, 'ArrowDown')).toBe(5);
    expect(cardToward(page, 5, 'ArrowUp')).toBe(3);
    expect(cardToward(page, 4, 'ArrowUp')).toBe(1);
    expect(cardToward(page, 2, 'ArrowUp')).toBe(0);
  });

  it('a card in the middle of two below goes to the first of them', () => {
    expect(cardToward([box(100, 0, 100), box(0, 120, 150), box(150, 120, 150)], 0, 'ArrowDown')).toBe(1);
  });

  it('nothing above the top row, or below the last', () => {
    expect(cardToward(page, 0, 'ArrowUp')).toBe(-1);
    expect(cardToward(page, 4, 'ArrowDown')).toBe(-1);
    expect(cardToward([], 0, 'ArrowDown')).toBe(-1);
  });

  it('knows the arrows', () => {
    expect(['ArrowUp', 'ArrowLeft', 'Enter', 'Home'].map(isArrow)).toEqual([true, true, false, false]);
  });
});
