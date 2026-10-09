import { describe, expect, it } from 'vitest';
import { addressKey, ADDRESS_ROOMS, countRoom, DAILY_ROOMS, utcDay, type DayCount } from './limits';

const day1 = Date.UTC(2026, 9, 1, 12);
const day2 = Date.UTC(2026, 9, 2, 0, 0, 1);

describe('rooms per day', () => {
  it('counts up from the first room of the day', () => {
    expect(countRoom(null, day1, 'a')).toEqual({ day: '2026-10-01', count: 1, by: { a: 1 } });
    expect(countRoom({ day: '2026-10-01', count: 41, by: { b: 3 } }, day1, 'a')).toEqual({ day: '2026-10-01', count: 42, by: { a: 1, b: 3 } });
    // (A count saved before addresses were counted.)
    expect(countRoom({ day: '2026-10-01', count: 41 }, day1, 'a')).toEqual({ day: '2026-10-01', count: 42, by: { a: 1 } });
  });

  it('says no once the cap is reached, until the next UTC day', () => {
    expect(countRoom({ day: '2026-10-01', count: DAILY_ROOMS - 1 }, day1, 'a')).toEqual({ day: '2026-10-01', count: DAILY_ROOMS, by: { a: 1 } });
    expect(countRoom({ day: '2026-10-01', count: DAILY_ROOMS }, day1, 'a')).toBe('busy');
    expect(countRoom({ day: '2026-10-01', count: 3 }, day1, 'a', 3)).toBe('busy');
    expect(countRoom({ day: '2026-10-01', count: DAILY_ROOMS, by: { a: 5 } }, day2, 'a')).toEqual({ day: '2026-10-02', count: 1, by: { a: 1 } });
  });

  it("one address can't use up the day's rooms for everyone", () => {
    const full = { day: '2026-10-01', count: ADDRESS_ROOMS + 2, by: { a: ADDRESS_ROOMS, b: 2 } };
    expect(countRoom(full, day1, 'a')).toBe('address');
    expect(countRoom(full, day1, 'b')).toEqual({ day: '2026-10-01', count: ADDRESS_ROOMS + 3, by: { a: ADDRESS_ROOMS, b: 3 } });
    expect(countRoom(full, day1, 'c')).toMatchObject({ count: ADDRESS_ROOMS + 3, by: { c: 1 } });
    // The next UTC day it starts again from 1.
    expect(countRoom(full, day2, 'a')).toEqual({ day: '2026-10-02', count: 1, by: { a: 1 } });
    // Counted one by one, the address is turned away after ADDRESS_ROOMS.
    let saved: DayCount | null = null;
    let n = 0;
    for (let r = countRoom(saved, day1, 'x'); typeof r !== 'string'; r = countRoom(saved, day1, 'x')) {
      saved = r;
      n++;
    }
    expect(n).toBe(ADDRESS_ROOMS);
  });

  it('days are UTC', () => {
    expect(utcDay(Date.UTC(2026, 9, 1, 23, 59, 59))).toBe('2026-10-01');
    expect(utcDay(Date.UTC(2026, 9, 2))).toBe('2026-10-02');
  });
});

describe('what an address is counted by', () => {
  it('IPv4 as it is', () => {
    expect(addressKey('198.51.100.7')).toBe('198.51.100.7');
    expect(addressKey('198.51.100.8')).not.toBe(addressKey('198.51.100.7'));
    expect(addressKey('::ffff:198.51.100.7')).toBe('198.51.100.7');
    expect(addressKey('unknown')).toBe('unknown');
  });

  it('IPv6 by its first 56 bits, however it is written', () => {
    const k = addressKey('2001:db8:1:2a00::1');
    expect(addressKey('2001:0db8:0001:2aff:ffff:1:2:3')).toBe(k);
    expect(addressKey('2001:DB8:1:2A42::')).toBe(k);
    expect(addressKey('2001:db8:1:2b00::1')).not.toBe(k);
    expect(addressKey('2001:db8::1')).toBe(addressKey('2001:db8:0:0:ff::'));
    expect(addressKey('2001:db8::1')).not.toBe(k);
  });
});
