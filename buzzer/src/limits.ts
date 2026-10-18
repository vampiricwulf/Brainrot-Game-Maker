/**
 * Limits on making rooms, so nobody can use up the Workers Free plan's daily quotas for everyone. Per address: the
 * Workers Rate Limiting binding (NEW_ROOM_LIMIT in wrangler.jsonc, 6 a minute), and ADDRESS_ROOMS a UTC day (and
 * NETWORK_ROOMS for an IPv6 /48). For the whole server: a count of rooms made per UTC day, kept by one Durable Object
 * (RoomCounter in index.ts), using countRoom below. An address is counted by addressKey. No Cloudflare APIs here, so it
 * is unit-tested (limits.test.ts).
 *
 * Card files the same way: FILE_LIMIT in wrangler.jsonc per address, and a byte budget for the whole server over any 24
 * hours (FILES_MB_PER_DAY, see filesBudget) that RoomCounter counts by the hour with countBytes. How big a file and a
 * room's files may be comes from the settings too (FILE_MB, ROOM_FILES_MB: fileLimits). A room's one alarm both ends it
 * and cleans up its files: nextAlarm picks when.
 */
import { DEFAULT_FILE_LIMITS, mbText, ROOM_FILES_MAX, type FileLimits } from '../../src/lib/buzzproto';

/** Rooms made per UTC day, at most. A game night makes one; this leaves plenty for a busy day. */
export const DAILY_ROOMS = 1000;
/** Rooms one address (addressKey) may make per UTC day: one script can't use up the day's rooms for everyone. */
export const ADDRESS_ROOMS = 20;
/**
 * Rooms one IPv6 /48 (networkKey) may make per UTC day, its /56s together: a /48 is 256 of them, and anyone can get one
 * free from a tunnel broker. Looser than ADDRESS_ROOMS, as homes often get their /56 from an ISP's shared /48.
 */
export const NETWORK_ROOMS = 100;

export const TOO_MANY_ROOMS = 'Too many new rooms — wait a minute';
export const TOO_MANY_TODAY = 'Too many new rooms from here today — try again tomorrow';
export const BUSY_TODAY = 'The buzzer server is busy today — try again tomorrow';
export const TOO_MANY_LOOKUPS = 'Too many tries — wait a minute';

/** Today's count (day: YYYY-MM-DD, UTC); by: today's rooms per address key and per networkKey (at most 2 × `count`). */
export interface DayCount {
  day: string;
  count: number;
  by?: Record<string, number>;
}

export const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

/**
 * What an address is counted by: IPv4 as it is; IPv6 by its first 56 bits (a home gets a /56 or more, a phone a /64,
 * so one can't take a new address for every room).
 */
export function addressKey(ip: string): string {
  // (IPv4, also inside IPv6: ::ffff:192.0.2.1.)
  if (!ip.includes(':') || ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1);
  const [head, tail] = ip.toLowerCase().split('::');
  const a = head ? head.split(':') : [];
  const b = tail ? tail.split(':') : [];
  // "::" stands for as many groups of zeros as are missing.
  const groups = tail === undefined ? a : [...a, ...Array<string>(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return `${groups.slice(0, 4).map((g) => g.padStart(4, '0')).join('').slice(0, 14)}/56`;
}

/** The wider network an address key is counted in too: an IPv6 /56's /48 (its first 12 hex digits). None for IPv4. */
export function networkKey(who: string): string | undefined {
  return who.endsWith('/56') ? `${who.slice(0, 12)}/48` : undefined;
}

/**
 * One more room now, for address key `who`? The count to save, or 'busy' (the server's cap for today is reached) or
 * 'address' (this address's is, or its network's). A new UTC day starts from 0.
 */
export function countRoom(
  saved: DayCount | null | undefined,
  now: number,
  who: string,
  cap = DAILY_ROOMS,
  perAddress = ADDRESS_ROOMS,
  perNetwork = NETWORK_ROOMS,
): DayCount | 'busy' | 'address' {
  const day = utcDay(now);
  const today = saved?.day === day ? saved : undefined;
  const count = today?.count ?? 0;
  const mine = today?.by?.[who] ?? 0;
  const net = networkKey(who);
  const ours = net ? (today?.by?.[net] ?? 0) : 0;
  if (count >= cap) return 'busy';
  if (mine >= perAddress || (net && ours >= perNetwork)) return 'address';
  return { day, count: count + 1, by: { ...today?.by, [who]: mine + 1, ...(net ? { [net]: ours + 1 } : {}) } };
}

// ---- card files ----

/**
 * Card files the whole server takes in any 24 hours (MB) when FILES_MB_PER_DAY isn't set (or isn't a number): enough
 * for a few games a day, one host's quarter for several full rooms, and less than the Free plan's 5 GB of storage. A
 * file is kept FILE_MAX_AGE_MS at most, so the files kept are never more than this, and can't fill that (README.md,
 * "Card files", has what a file costs).
 */
export const FILES_MB_PER_DAY = 2000;
/** One address (addressKey) may upload this share of the budget, and one IPv6 /48 (networkKey) this one. */
export const ADDRESS_FILE_SHARE = 1 / 4;
export const NETWORK_FILE_SHARE = 1 / 2;
/** A card file no current card uses is deleted this long after (one got ready and never sent: after its upload). */
export const FILE_IDLE_MS = 10 * 60_000;
/**
 * A card file is deleted this long after its upload, even one a card uses (the app puts it up again if a card still
 * needs it), so the files kept are only ever ones the budget counts. Not 24 hours: the budget is counted by the hour,
 * so an upload late in its hour stops being counted 23 hours on, and the room's alarm can be a little late.
 */
export const FILE_MAX_AGE_MS = 20 * 60 * 60_000;
/**
 * A room out of space for a new card file deletes the files no current card has used for this long first (they'd go
 * at FILE_IDLE_MS anyway). Not one used or stored just now: the host's next state may be about to name it.
 */
export const FILE_MAKE_ROOM_MS = 60_000;

export const TOO_MANY_FILES = 'Too many files — wait a minute';
export const FILES_OFF = "This buzzer server doesn't take files";
const inHours = (hours: number): string => (hours <= 1 ? 'in about an hour' : `in about ${hours} hours`);
/**
 * An upload turned away for the budget (429): the whole server's ('busy') or this address's share ('address'), with
 * how many hours until enough of it frees (freesIn).
 */
export const filesBusy = (took: 'busy' | 'address', hours: number): string =>
  took === 'address'
    ? `Too many files from here for now — try again ${inHours(hours)}`
    : `The buzzer server has taken all the card files it can for now — try again ${inHours(hours)}`;
/** A file over the server's limit (413). */
export const tooBig = (lim: FileLimits): string => `Too big for the buzzer server (${mbText(lim.fileBytes)} at most)`;

const MiB = 1024 * 1024;

/**
 * A setting in MB (MiB; wrangler.jsonc vars are strings, a number works too) in whole bytes: `fallbackMb` when it's
 * missing, not a number or below 0.
 */
export function mbSetting(setting: unknown, fallbackMb: number): number {
  const mb = typeof setting === 'number' ? setting : typeof setting === 'string' && setting.trim() ? Number(setting) : NaN;
  return Math.floor((Number.isFinite(mb) && mb >= 0 ? mb : fallbackMb) * MiB);
}

/** The budget for any 24 hours in bytes, from FILES_MB_PER_DAY: its default when missing or not a number; 0 is off. */
export const filesBudget = (setting: unknown): number => mbSetting(setting, FILES_MB_PER_DAY);

/**
 * The server's card file limits from its settings (FILE_MB a file, ROOM_FILES_MB a room's files together, in MB): each
 * its default (DEFAULT_FILE_LIMITS) when missing, not a number, 0 or below, and at most 2^40 bytes (what the app takes);
 * a file never more than a room. Files a room: always ROOM_FILES_MAX.
 */
export function fileLimits(env: { FILE_MB?: unknown; ROOM_FILES_MB?: unknown }): FileLimits {
  const read = (setting: unknown, def: number) => {
    const n = mbSetting(setting, def / MiB);
    return n > 0 ? Math.min(n, 2 ** 40) : def;
  };
  const roomBytes = read(env.ROOM_FILES_MB, DEFAULT_FILE_LIMITS.roomBytes);
  return { fileBytes: Math.min(read(env.FILE_MB, DEFAULT_FILE_LIMITS.fileBytes), roomBytes), roomBytes, roomFiles: ROOM_FILES_MAX };
}

/** An hour's card file bytes (h: the hour, hourOf); by: per address key and per networkKey. */
export interface HourBytes {
  h: number;
  bytes: number;
  by: Record<string, number>;
}
/** The card file bytes counted over the last WINDOW_HOURS, by the hour (what RoomCounter keeps). */
export interface WindowBytes {
  v: 2;
  hours: HourBytes[];
}
/** What older code kept: a UTC day's count (day: YYYY-MM-DD). */
export interface DayBytes {
  day: string;
  bytes: number;
  by?: Record<string, number>;
}
export type SavedBytes = WindowBytes | DayBytes;

const HOUR_MS = 60 * 60_000;
/** The budget is for any this many hours. */
export const WINDOW_HOURS = 24;
/** The hour `t` is in (hours since 1970, UTC): what bytes taken then are counted under. */
export const hourOf = (t: number): number => Math.floor(t / HOUR_MS);

/**
 * The hours still counted at `now`: this one and the WINDOW_HOURS − 1 before it. Older code's count of a UTC day is
 * taken as counted in the last hour it can have been (now, for today's), so it stays counted until every file it paid
 * for is gone.
 */
function windowAt(saved: SavedBytes | null | undefined, now: number): HourBytes[] {
  const h = hourOf(now);
  let hours: HourBytes[] = [];
  if (saved && 'hours' in saved && Array.isArray(saved.hours)) hours = saved.hours;
  else if (saved && 'day' in saved && saved.bytes > 0) {
    const start = Date.parse(`${saved.day}T00:00:00Z`);
    if (Number.isFinite(start)) hours = [{ h: Math.min(h, hourOf(start) + 23), bytes: saved.bytes, by: { ...saved.by } }];
  }
  return hours.filter((b) => b.h > h - WINDOW_HOURS);
}

/**
 * Whether n more bytes from `who` would pass the budget (`cap`) in these hours: 'busy', 'address' (its share, or its
 * network's), or null.
 */
function over(hours: HourBytes[], who: string, n: number, cap: number): 'busy' | 'address' | null {
  const net = networkKey(who);
  let all = 0;
  let mine = 0;
  let ours = 0;
  for (const b of hours) {
    all += b.bytes;
    mine += b.by[who] ?? 0;
    if (net) ours += b.by[net] ?? 0;
  }
  if (all + n > cap) return 'busy';
  if (mine + n > cap * ADDRESS_FILE_SHARE || (net && ours + n > cap * NETWORK_FILE_SHARE)) return 'address';
  return null;
}

/**
 * n more bytes of card files now, from address key `who`, with a budget of `cap` bytes in any 24 hours? The count to
 * save (n added to this hour's), or 'off' (the budget is 0), 'busy' (the last 24 hours' uploads would go over it) or
 * 'address' (over this address's share, or its network's).
 */
export function countBytes(
  saved: SavedBytes | null | undefined,
  now: number,
  who: string,
  n: number,
  cap: number,
): WindowBytes | 'off' | 'busy' | 'address' {
  if (cap <= 0) return 'off';
  const hours = windowAt(saved, now);
  const no = over(hours, who, n, cap);
  if (no) return no;
  const h = hourOf(now);
  const net = networkKey(who);
  const was = hours.find((b) => b.h === h) ?? { h, bytes: 0, by: {} };
  const more = (k: string) => ({ [k]: (was.by[k] ?? 0) + n });
  return { v: 2, hours: [...hours.filter((b) => b !== was), { h, bytes: was.bytes + n, by: { ...was.by, ...more(who), ...(net ? more(net) : {}) } }] };
}

/**
 * n bytes countBytes counted for `who` in hour `hour` (hourOf; this hour when not given) that weren't stored after
 * all, taken off that hour again (never below 0): the count to save, or null when there's nothing to take off (that
 * hour isn't counted any more).
 */
export function uncountBytes(saved: SavedBytes | null | undefined, now: number, who: string, n: number, hour = hourOf(now)): WindowBytes | null {
  const hours = windowAt(saved, now);
  const was = hours.find((b) => b.h === hour);
  if (!was || !(n > 0)) return null;
  const by = { ...was.by };
  for (const k of [who, networkKey(who)]) if (k && by[k] !== undefined) by[k] = Math.max(0, by[k] - n);
  return { v: 2, hours: hours.map((b) => (b === was ? { h: b.h, bytes: Math.max(0, b.bytes - n), by } : b)) };
}

/** What is left of the budget now (bytes): `cap` less the last 24 hours' uploads. */
export function bytesLeft(saved: SavedBytes | null | undefined, now: number, cap: number): number {
  return Math.max(0, cap - windowAt(saved, now).reduce((n, b) => n + b.bytes, 0));
}

/**
 * In how many whole hours (1 at least) n more bytes from `who` would fit, as the oldest hours stop being counted: what
 * a host turned away is told. WINDOW_HOURS when they never would (n is more than its share).
 */
export function freesIn(saved: SavedBytes | null | undefined, now: number, who: string, n: number, cap: number): number {
  const hours = windowAt(saved, now);
  for (let k = 1; k < WINDOW_HOURS; k++) {
    const h = hourOf(now + k * HOUR_MS);
    if (!over(hours.filter((b) => b.h > h - WINDOW_HOURS), who, n, cap)) return k;
  }
  return WINDOW_HOURS;
}

/**
 * When a room's alarm should go off next: the room's end, a card file's clean-up (FILE_IDLE_MS after no card used it)
 * or a file getting too old (FILE_MAX_AGE_MS after its upload), whichever comes first. Never before now.
 */
export function nextAlarm(end: number, files: Record<string, { at?: number; unusedSince?: number }> | null | undefined, now: number): number {
  let at = end;
  for (const f of Object.values(files ?? {})) {
    if (f.unusedSince !== undefined) at = Math.min(at, f.unusedSince + FILE_IDLE_MS);
    if (f.at !== undefined) at = Math.min(at, f.at + FILE_MAX_AGE_MS);
  }
  return Math.max(now, at);
}
