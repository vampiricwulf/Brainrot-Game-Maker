import { describe, expect, it } from 'vitest';
import { countRoom, DAILY_ROOMS, utcDay } from './limits';

const day1 = Date.UTC(2026, 9, 1, 12);
const day2 = Date.UTC(2026, 9, 2, 0, 0, 1);

describe('rooms per day', () => {
  it('counts up from the first room of the day', () => {
    expect(countRoom(null, day1)).toEqual({ day: '2026-10-01', count: 1 });
    expect(countRoom({ day: '2026-10-01', count: 41 }, day1)).toEqual({ day: '2026-10-01', count: 42 });
  });

  it('says no once the cap is reached, until the next UTC day', () => {
    expect(countRoom({ day: '2026-10-01', count: DAILY_ROOMS - 1 }, day1)).toEqual({ day: '2026-10-01', count: DAILY_ROOMS });
    expect(countRoom({ day: '2026-10-01', count: DAILY_ROOMS }, day1)).toBeNull();
    expect(countRoom({ day: '2026-10-01', count: 3 }, day1, 3)).toBeNull();
    expect(countRoom({ day: '2026-10-01', count: DAILY_ROOMS }, day2)).toEqual({ day: '2026-10-02', count: 1 });
  });

  it('days are UTC', () => {
    expect(utcDay(Date.UTC(2026, 9, 1, 23, 59, 59))).toBe('2026-10-01');
    expect(utcDay(Date.UTC(2026, 9, 2))).toBe('2026-10-02');
  });
});
