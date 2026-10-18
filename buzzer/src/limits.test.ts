import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILE_LIMITS, OLD_FILE_LIMITS, ROOM_FILES_MAX } from '../../src/lib/buzzproto';
import {
  addressKey,
  ADDRESS_FILE_SHARE,
  ADDRESS_ROOMS,
  bytesLeft,
  countBytes,
  countRoom,
  DAILY_ROOMS,
  FILE_IDLE_MS,
  FILE_MAX_AGE_MS,
  fileLimits,
  filesBudget,
  filesBusy,
  FILES_MB_PER_DAY,
  freesIn,
  hourOf,
  mbSetting,
  NETWORK_ROOMS,
  networkKey,
  nextAlarm,
  tooBig,
  uncountBytes,
  utcDay,
  WINDOW_HOURS,
  type DayBytes,
  type DayCount,
  type SavedBytes,
  type WindowBytes,
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

describe('card files in any 24 hours', () => {
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
    // The default is on, and less than the Free plan's 5 GB of storage, with room left for the rooms' own state.
    expect(FILES_MB_PER_DAY).toBe(4000);
    expect(filesBudget(undefined)).toBeLessThan(5e9 - 500_000_000);
    expect(FILES_MB_PER_DAY).toBeLessThan(5000);
  });

  it('a setting in MB: a string or a number, in whole bytes; its fallback when missing, not a number or below 0', () => {
    expect(mbSetting('16', 2)).toBe(16 * MB);
    expect(mbSetting(' 4 ', 2)).toBe(4 * MB);
    expect(mbSetting(0.5, 2)).toBe(MB / 2);
    // (Whole bytes: a fraction of one is dropped.)
    expect(mbSetting('0.0000001', 2)).toBe(0);
    expect(mbSetting(1.0000001, 2)).toBe(Math.floor(1.0000001 * MB));
    expect(mbSetting('0', 2)).toBe(0);
    for (const bad of [undefined, null, '', ' ', 'lots', '-1', -1, NaN, Infinity, {}, '1e400']) expect(mbSetting(bad, 2)).toBe(2 * MB);
  });

  it('the server’s card file limits come from FILE_MB and ROOM_FILES_MB, each its default when missing, 0, below 0 or not a number', () => {
    expect(fileLimits({})).toEqual(DEFAULT_FILE_LIMITS);
    expect(fileLimits({ FILE_MB: '4', ROOM_FILES_MB: '12' })).toEqual({ fileBytes: 4 * MB, roomBytes: 12 * MB, roomFiles: ROOM_FILES_MAX });
    expect(fileLimits({ FILE_MB: 2.5, ROOM_FILES_MB: '100.25' })).toEqual({ fileBytes: 2.5 * MB, roomBytes: 100.25 * MB, roomFiles: ROOM_FILES_MAX });
    for (const bad of ['0', 0, '-3', 'big', '', '0.0000001'])
      expect(fileLimits({ FILE_MB: bad, ROOM_FILES_MB: bad }), String(bad)).toEqual(DEFAULT_FILE_LIMITS);
    // A file is never bigger than a room's files together.
    expect(fileLimits({ FILE_MB: '50', ROOM_FILES_MB: '20' })).toEqual({ fileBytes: 20 * MB, roomBytes: 20 * MB, roomFiles: ROOM_FILES_MAX });
    expect(fileLimits({ ROOM_FILES_MB: '8' }).fileBytes).toBe(Math.min(DEFAULT_FILE_LIMITS.fileBytes, 8 * MB));
    // At most 2^40 bytes (what the app takes from a server).
    expect(fileLimits({ FILE_MB: '1e12', ROOM_FILES_MB: '1e12' })).toEqual({ fileBytes: 2 ** 40, roomBytes: 2 ** 40, roomFiles: ROOM_FILES_MAX });
    // The defaults: 90 MB a file and 900 MB a room, just under what Cloudflare's free plan allows (a request body of
    // 100,000,000 bytes, 1 GB a Durable Object), more than older servers took.
    expect(DEFAULT_FILE_LIMITS).toEqual({ fileBytes: 90 * MB, roomBytes: 900 * MB, roomFiles: ROOM_FILES_MAX });
    expect(DEFAULT_FILE_LIMITS.fileBytes).toBeLessThan(100_000_000);
    expect(DEFAULT_FILE_LIMITS.roomBytes).toBeLessThan(1e9 - 50_000_000);
    expect(DEFAULT_FILE_LIMITS.fileBytes).toBeGreaterThan(OLD_FILE_LIMITS.fileBytes);
  });

  it('wrangler.jsonc sets the same as the defaults', () => {
    const jsonc = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const set = (k: string) => jsonc.match(new RegExp(`"${k}":\\s*"([^"]*)"`))?.[1];
    expect(fileLimits({ FILE_MB: set('FILE_MB'), ROOM_FILES_MB: set('ROOM_FILES_MB') })).toEqual(DEFAULT_FILE_LIMITS);
    expect([set('FILE_MB'), set('ROOM_FILES_MB'), set('FILES_MB_PER_DAY')]).toEqual(['90', '900', String(FILES_MB_PER_DAY)]);
  });

  it('a file over the limit is turned away with the server’s own number', () => {
    expect(tooBig(OLD_FILE_LIMITS)).toBe('Too big for the buzzer server (16 MB at most)');
    expect(tooBig({ fileBytes: 4 * MB, roomBytes: 12 * MB, roomFiles: 32 })).toBe('Too big for the buzzer server (4 MB at most)');
    expect(tooBig({ fileBytes: 2.5 * MB, roomBytes: 12 * MB, roomFiles: 32 })).toBe('Too big for the buzzer server (2.5 MB at most)');
  });

  const H = 3600_000;
  /** 12:30 UTC on 1 October. */
  const t0 = Date.UTC(2026, 9, 1, 12, 30);
  /** The budget used up at `at` by four addresses, a quarter each. */
  const fill = (at: number, saved: SavedBytes | null = null) =>
    ['a', 'b', 'c', 'd'].reduce<SavedBytes | null>((w, who) => countBytes(w, at, who, cap * ADDRESS_FILE_SHARE, cap) as WindowBytes, saved) as WindowBytes;

  it('counts the bytes up by the hour', () => {
    let w = countBytes(null, t0, 'a', 4 * MB, cap) as WindowBytes;
    expect(w).toEqual({ v: 2, hours: [{ h: hourOf(t0), bytes: 4 * MB, by: { a: 4 * MB } }] });
    // The same hour: added to it.
    w = countBytes(w, t0 + 20 * 60_000, 'b', MB, cap) as WindowBytes;
    expect(w.hours).toEqual([{ h: hourOf(t0), bytes: 5 * MB, by: { a: 4 * MB, b: MB } }]);
    // The next: an hour of its own.
    w = countBytes(w, t0 + H, 'b', MB, cap) as WindowBytes;
    expect(w.hours).toEqual([
      { h: hourOf(t0), bytes: 5 * MB, by: { a: 4 * MB, b: MB } },
      { h: hourOf(t0) + 1, bytes: MB, by: { b: MB } },
    ]);
    expect(bytesLeft(w, t0 + H, cap)).toBe(cap - 6 * MB);
  });

  it('refuses an upload that would pass the budget in any 24 hours, until the hour it was used in is 24 hours gone', () => {
    const full = fill(t0);
    expect(bytesLeft(full, t0, cap)).toBe(0);
    expect(countBytes(full, t0, 'e', 1, cap)).toBe('busy');
    // Past midnight (a new UTC day) it still counts.
    expect(countBytes(full, Date.UTC(2026, 9, 2, 0, 30), 'e', 1, cap)).toBe('busy');
    // Until 12:00 the next day: 24 hours after its hour began.
    expect(countBytes(full, Date.UTC(2026, 9, 2, 11, 59, 59), 'e', 1, cap)).toBe('busy');
    const later = Date.UTC(2026, 9, 2, 12);
    expect(bytesLeft(full, later, cap)).toBe(cap);
    expect(countBytes(full, later, 'e', MB, cap)).toEqual({ v: 2, hours: [{ h: hourOf(later), bytes: MB, by: { e: MB } }] });
    // Two hours: each frees what it took as it goes.
    const two = countBytes(countBytes(null, t0, 'a', 20 * MB, cap) as WindowBytes, t0 + 5 * H, 'b', 25 * MB, cap) as WindowBytes;
    expect(bytesLeft(two, t0 + 5 * H, cap)).toBe(55 * MB);
    expect(bytesLeft(two, t0 + 24 * H, cap)).toBe(75 * MB);
    expect(bytesLeft(two, t0 + 29 * H, cap)).toBe(cap);
  });

  it('an address’s share (and its /48’s) is counted over the 24 hours too', () => {
    let w: SavedBytes | null = null;
    for (let i = 0; i < 4; i++) w = countBytes(w, t0 + i * H, 'x', 5 * MB, cap) as WindowBytes;
    expect(countBytes(w, t0 + 5 * H, 'x', 5 * MB + 1, cap)).toBe('address');
    expect(countBytes(w, t0 + 5 * H, 'x', 5 * MB, cap)).not.toBeTypeOf('string');
    expect(countBytes(w, t0 + 5 * H, 'y', 25 * MB, cap)).not.toBeTypeOf('string');
    // Once its first hour is gone, that much more.
    expect(countBytes(w, t0 + 24 * H, 'x', 10 * MB, cap)).not.toBeTypeOf('string');
    expect(countBytes(w, t0 + 24 * H, 'x', 10 * MB + 1, cap)).toBe('address');
    // A /48's /56s together, over hours.
    const [p, q] = ['2001:db8:1:100::1', '2001:db8:1:200::1'].map(addressKey);
    w = countBytes(countBytes(null, t0, p, 25 * MB, cap) as WindowBytes, t0 + 3 * H, q, 25 * MB, cap) as WindowBytes;
    expect(countBytes(w, t0 + 4 * H, addressKey('2001:db8:1:300::1'), 1, cap)).toBe('address');
    expect(countBytes(w, t0 + 24 * H, addressKey('2001:db8:1:300::1'), 25 * MB, cap)).not.toBeTypeOf('string');
  });

  it('gives back bytes counted for a file that wasn’t stored into the hour they were counted in, never below 0', () => {
    const who = addressKey('2001:db8:1:100::1');
    const first = countBytes(null, t0, who, 4 * MB, cap) as WindowBytes;
    const both = countBytes(first, t0 + H, who, 3 * MB, cap) as WindowBytes;
    // Two hours on, the first upload's bytes go back to its own hour.
    const back = uncountBytes(both, t0 + 2 * H, who, 4 * MB, hourOf(t0))!;
    expect(back.hours).toEqual([
      { h: hourOf(t0), bytes: 0, by: { [who]: 0, '20010db80001/48': 0 } },
      { h: hourOf(t0) + 1, bytes: 3 * MB, by: { [who]: 3 * MB, '20010db80001/48': 3 * MB } },
    ]);
    // The address can upload the rest of its share again.
    expect(countBytes(back, t0 + 2 * H, who, cap * ADDRESS_FILE_SHARE - 3 * MB, cap)).not.toBeTypeOf('string');
    expect(uncountBytes(both, t0 + H, who, 10 * MB, hourOf(t0) + 1)!.hours[1]).toEqual({ h: hourOf(t0) + 1, bytes: 0, by: { [who]: 0, '20010db80001/48': 0 } });
    // Without an hour: this one.
    expect(uncountBytes(both, t0 + H + 60_000, who, MB)!.hours[1].bytes).toBe(2 * MB);
    // An hour no longer counted, one never counted, or nothing counted: nothing to give back.
    expect(uncountBytes(both, t0 + 24 * H, who, 4 * MB, hourOf(t0))).toBeNull();
    expect(uncountBytes(both, t0 + H, who, 4 * MB, hourOf(t0) - 1)).toBeNull();
    expect(uncountBytes(null, t0, who, 4 * MB, hourOf(t0))).toBeNull();
    expect(uncountBytes(both, t0 + H, who, 0, hourOf(t0))).toBeNull();
  });

  it('a count older code kept for a UTC day counts until every file it paid for is gone', () => {
    const old: DayBytes = { day: '2026-10-01', bytes: 30 * MB, by: { a: 20 * MB, b: 10 * MB } };
    // Read that day: taken as counted now, and moved on as one hour.
    expect(bytesLeft(old, t0, cap)).toBe(70 * MB);
    expect(countBytes(old, t0, 'a', MB, cap)).toEqual({ v: 2, hours: [{ h: hourOf(t0), bytes: 31 * MB, by: { a: 21 * MB, b: 10 * MB } }] });
    expect(countBytes(old, t0, 'a', 5 * MB + 1, cap)).toBe('address');
    expect(uncountBytes(old, t0, 'b', 4 * MB)).toEqual({ v: 2, hours: [{ h: hourOf(t0), bytes: 26 * MB, by: { a: 20 * MB, b: 6 * MB } }] });
    // Read the next day: as counted at 23:00 that day, the last hour it can have been, so it counts until 23:00 now.
    expect(bytesLeft(old, Date.UTC(2026, 9, 2, 22, 59), cap)).toBe(70 * MB);
    expect(bytesLeft(old, Date.UTC(2026, 9, 2, 23), cap)).toBe(cap);
    // Older than that, or nothing in it: nothing counts.
    expect(bytesLeft({ ...old, day: '2026-09-29' }, t0, cap)).toBe(cap);
    expect(countBytes({ ...old, bytes: 0 }, t0, 'a', MB, cap)).toEqual({ v: 2, hours: [{ h: hourOf(t0), bytes: MB, by: { a: MB } }] });
  });

  it('says in how many hours enough of the budget frees', () => {
    const full = fill(t0);
    // Its hour goes at 12:00 the next day: from 14:30, in about 22 hours (21.5, rounded up).
    expect(freesIn(full, t0 + 2 * H, 'e', MB, cap)).toBe(22);
    expect(freesIn(full, Date.UTC(2026, 9, 2, 11, 30), 'e', MB, cap)).toBe(1);
    // Spread over hours: as soon as enough has gone.
    let w: SavedBytes | null = null;
    for (const [who, mb, at] of [['a', 10, 0], ['b', 15, 2], ['c', 25, 4], ['d', 25, 6], ['e', 25, 6]] as const) w = countBytes(w, t0 + at * H, who, mb * MB, cap) as WindowBytes;
    // From 19:30: a's 10 MB go at 12:00, b's 15 at 14:00.
    expect(freesIn(w, t0 + 7 * H, 'f', 10 * MB, cap)).toBe(17);
    expect(freesIn(w, t0 + 7 * H, 'f', 20 * MB, cap)).toBe(19);
    // An address over its share: when its own oldest hour goes (d's at 18:00).
    expect(freesIn(w, t0 + 7 * H, 'd', MB, cap)).toBe(23);
    // At least an hour; and never, for more than a share: the whole window.
    expect(freesIn(null, t0, 'a', MB, cap)).toBe(1);
    expect(freesIn(null, t0, 'a', cap * ADDRESS_FILE_SHARE + 1, cap)).toBe(WINDOW_HOURS);
  });

  it('a refusal says when to try again', () => {
    expect(filesBusy('busy', 1)).toBe('The buzzer server has taken all the card files it can for now — try again in about an hour');
    expect(filesBusy('busy', 22)).toBe('The buzzer server has taken all the card files it can for now — try again in about 22 hours');
    expect(filesBusy('address', 3)).toBe('Too many files from here for now — try again in about 3 hours');
  });

  it('a file is deleted before the bytes it took stop counting, however late in its hour it came', () => {
    // An upload at 12:59:59: its file goes at 08:59:59 the next day, its bytes stop counting at 12:00.
    const late = Date.UTC(2026, 9, 1, 12, 59, 59);
    const w = countBytes(null, late, 'a', 10 * MB, cap) as WindowBytes;
    expect(bytesLeft(w, late + FILE_MAX_AGE_MS, cap)).toBe(cap - 10 * MB);
    expect(bytesLeft(w, Date.UTC(2026, 9, 2, 12), cap)).toBe(cap);
    // With hours to spare for a late alarm.
    expect((WINDOW_HOURS - 1) * H - FILE_MAX_AGE_MS).toBeGreaterThanOrEqual(2 * H);
  });

  it('0 turns files off', () => {
    expect(countBytes(null, day1, 'a', 1, 0)).toBe('off');
    expect(bytesLeft(null, day1, 0)).toBe(0);
  });

  it("one address (or IPv6 /48) can't use up the budget for everyone", () => {
    let saved: WindowBytes | null = null;
    let n = 0;
    for (let r = countBytes(saved, day1, 'x', MB, cap); typeof r !== 'string'; r = countBytes(saved, day1, 'x', MB, cap)) {
      saved = r;
      n++;
    }
    expect(n).toBe(cap * ADDRESS_FILE_SHARE / MB);
    expect(countBytes(saved, day1, 'x', MB, cap)).toBe('address');
    // Someone else still can.
    expect(countBytes(saved, day1, 'y', MB, cap)).toMatchObject({ hours: [{ by: { y: MB } }] });
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
    expect(saved!.hours[0].by['20010db80001/48']).toBe(cap / 2);
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

  it('is when a file gets too old, even one a card uses', () => {
    const at = day1 - FILE_MAX_AGE_MS + 3600_000;
    expect(nextAlarm(end, { used: { at } }, day1)).toBe(at + FILE_MAX_AGE_MS);
    expect(nextAlarm(end, { used: { at }, idle: { at: day1, unusedSince: day1 } }, day1)).toBe(day1 + FILE_IDLE_MS);
    expect(nextAlarm(end, { used: { at: day1 - FILE_MAX_AGE_MS - 1 } }, day1)).toBe(day1);
    expect(nextAlarm(day1 + 1000, { used: { at } }, day1)).toBe(day1 + 1000);
  });
});
