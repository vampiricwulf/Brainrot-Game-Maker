import { describe, expect, it } from 'vitest';
import {
  addressKey,
  ADDRESS_FILE_SHARE,
  ADDRESS_ROOMS,
  bytesLeft,
  countBytes,
  countRoom,
  DAILY_ROOMS,
  FILE_IDLE_MS,
  filesBudget,
  FILES_MB_PER_DAY,
  NETWORK_ROOMS,
  networkKey,
  nextAlarm,
  uncountBytes,
  utcDay,
  type DayBytes,
  type DayCount,
} from './limits';

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

  it("an IPv6 /48's /56s share a looser cap too: one /48 can't use up the day's rooms either", () => {
    // More different /56s in one /48 than it takes to fill it, each making all it may: the /48 fills up first.
    const ips = Array.from({ length: Math.ceil(NETWORK_ROOMS / ADDRESS_ROOMS) + 1 }, (_, i) => `2001:db8:1:${(i + 1).toString(16)}00::1`);
    const keys = ips.map(addressKey);
    const last = keys.at(-1)!;
    expect(new Set(keys).size).toBe(ips.length);
    expect(new Set(keys.map(networkKey))).toEqual(new Set(['20010db80001/48']));
    let saved: DayCount | null = null;
    let n = 0;
    for (const who of keys) {
      for (let r = countRoom(saved, day1, who); typeof r !== 'string'; r = countRoom(saved, day1, who)) {
        saved = r;
        n++;
      }
      expect(countRoom(saved, day1, who)).toBe('address');
    }
    expect(n).toBe(NETWORK_ROOMS);
    expect(saved!.by!['20010db80001/48']).toBe(NETWORK_ROOMS);
    // The last /56 made none: its /48 was full, and it's told so as if it had made all of its own.
    expect(saved!.by![last]).toBeUndefined();
    // Another /48 isn't affected, nor is IPv4 (which has no /48).
    const other = addressKey('2001:db8:2:100::1');
    expect(countRoom(saved, day1, other)).toMatchObject({ count: NETWORK_ROOMS + 1, by: { [other]: 1, '20010db80002/48': 1 } });
    expect(countRoom(saved, day1, '198.51.100.7')).toMatchObject({ count: NETWORK_ROOMS + 1, by: { '198.51.100.7': 1 } });
    // The next UTC day it starts again from 1.
    expect(countRoom(saved, day2, last)).toEqual({ day: '2026-10-02', count: 1, by: { [last]: 1, '20010db80001/48': 1 } });
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

  it('IPv6 also by its first 48 bits (networkKey); IPv4 has none', () => {
    expect(networkKey(addressKey('2001:db8:1:2a00::1'))).toBe('20010db80001/48');
    expect(networkKey(addressKey('2001:db8:1:ff00::1'))).toBe('20010db80001/48');
    expect(networkKey(addressKey('2001:db8:2:2a00::1'))).toBe('20010db80002/48');
    expect(networkKey(addressKey('198.51.100.7'))).toBeUndefined();
    expect(networkKey('unknown')).toBeUndefined();
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

describe('card files a day', () => {
  const MB = 1024 * 1024;
  const cap = 100 * MB;

  it('the budget comes from FILES_MB_PER_DAY: its default when missing or not a number, 0 is off', () => {
    expect(filesBudget(undefined)).toBe(FILES_MB_PER_DAY * MB);
    expect(filesBudget('')).toBe(FILES_MB_PER_DAY * MB);
    expect(filesBudget('lots')).toBe(FILES_MB_PER_DAY * MB);
    expect(filesBudget('-5')).toBe(FILES_MB_PER_DAY * MB);
    expect(filesBudget('1000')).toBe(1000 * MB);
    expect(filesBudget(' 50 ')).toBe(50 * MB);
    expect(filesBudget(2.5)).toBe(2.5 * MB);
    expect(filesBudget('0')).toBe(0);
    expect(filesBudget(0)).toBe(0);
    // The default is on, and small.
    expect(FILES_MB_PER_DAY).toBeGreaterThan(0);
    expect(FILES_MB_PER_DAY).toBeLessThanOrEqual(1024);
  });

  it('counts the bytes up, and refuses an upload that would go over the day’s budget until the next UTC day', () => {
    expect(countBytes(null, day1, 'a', 4 * MB, cap)).toEqual({ day: '2026-10-01', bytes: 4 * MB, by: { a: 4 * MB } });
    const nearly: DayBytes = { day: '2026-10-01', bytes: cap - MB, by: { b: 10 * MB } };
    expect(countBytes(nearly, day1, 'a', MB, cap)).toMatchObject({ bytes: cap, by: { a: MB, b: 10 * MB } });
    expect(countBytes(nearly, day1, 'a', MB + 1, cap)).toBe('busy');
    expect(bytesLeft(nearly, day1, cap)).toBe(MB);
    expect(bytesLeft({ ...nearly, bytes: cap }, day1, cap)).toBe(0);
    // The next UTC day starts from 0.
    expect(countBytes({ ...nearly, bytes: cap }, day2, 'a', 4 * MB, cap)).toEqual({ day: '2026-10-02', bytes: 4 * MB, by: { a: 4 * MB } });
    expect(bytesLeft({ ...nearly, bytes: cap }, day2, cap)).toBe(cap);
  });

  it('gives back bytes counted for a file that wasn’t stored, never below 0, and only on the same UTC day', () => {
    const who = addressKey('2001:db8:1:100::1');
    const counted = countBytes(null, day1, who, 4 * MB, cap) as DayBytes;
    const back = uncountBytes(counted, day1, who, 4 * MB)!;
    expect(back).toEqual({ day: '2026-10-01', bytes: 0, by: { [who]: 0, '20010db80001/48': 0 } });
    // The address can upload its whole share again.
    expect(countBytes(back, day1, who, cap * ADDRESS_FILE_SHARE, cap)).not.toBeTypeOf('string');
    expect(uncountBytes({ day: '2026-10-01', bytes: MB, by: { a: MB } }, day1, 'a', 4 * MB)).toEqual({ day: '2026-10-01', bytes: 0, by: { a: 0 } });
    // Another day, or nothing counted: nothing to give back.
    expect(uncountBytes(counted, day2, who, 4 * MB)).toBeNull();
    expect(uncountBytes(null, day1, who, 4 * MB)).toBeNull();
  });

  it('0 turns files off', () => {
    expect(countBytes(null, day1, 'a', 1, 0)).toBe('off');
    expect(bytesLeft(null, day1, 0)).toBe(0);
  });

  it("one address (or IPv6 /48) can't use up the day's budget for everyone", () => {
    let saved: DayBytes | null = null;
    let n = 0;
    for (let r = countBytes(saved, day1, 'x', MB, cap); typeof r !== 'string'; r = countBytes(saved, day1, 'x', MB, cap)) {
      saved = r;
      n++;
    }
    expect(n).toBe(cap * ADDRESS_FILE_SHARE / MB);
    expect(countBytes(saved, day1, 'x', MB, cap)).toBe('address');
    // Someone else still can.
    expect(countBytes(saved, day1, 'y', MB, cap)).toMatchObject({ by: { y: MB } });
    // The /56s of one /48 share a looser cap.
    saved = null;
    let total = 0;
    for (let i = 1; i <= 4; i++) {
      const who = addressKey(`2001:db8:1:${i}00::1`);
      for (let r = countBytes(saved, day1, who, MB, cap); typeof r !== 'string'; r = countBytes(saved, day1, who, MB, cap)) {
        saved = r;
        total += MB;
      }
    }
    expect(total).toBe(cap / 2);
    expect(saved!.by!['20010db80001/48']).toBe(cap / 2);
  });
});

describe('the room’s alarm', () => {
  const end = day1 + 6 * 3600_000;

  it('is the room’s end when no file waits to be cleaned up', () => {
    expect(nextAlarm(end, undefined, day1)).toBe(end);
    expect(nextAlarm(end, {}, day1)).toBe(end);
    // Files the cards use now don't wait.
    expect(nextAlarm(end, { f: {} }, day1)).toBe(end);
  });

  it('is the earlier of the room’s end and the next clean-up, a file got ready and never used included', () => {
    const files = { used: {}, ready: { unusedSince: day1 - 60_000 }, dropped: { unusedSince: day1 } };
    expect(nextAlarm(end, files, day1)).toBe(day1 - 60_000 + FILE_IDLE_MS);
    // The room ends first.
    expect(nextAlarm(day1 + 1000, files, day1)).toBe(day1 + 1000);
    // Overdue: now, never earlier.
    expect(nextAlarm(end, { old: { unusedSince: day1 - 2 * FILE_IDLE_MS } }, day1)).toBe(day1);
  });
});
