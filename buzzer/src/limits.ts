/**
 * Limits on making rooms, so nobody can use up the Workers Free plan's daily quotas for everyone. Per address: the
 * Workers Rate Limiting binding (NEW_ROOM_LIMIT in wrangler.jsonc, 6 a minute), and ADDRESS_ROOMS a UTC day (and
 * NETWORK_ROOMS for an IPv6 /48). For the whole server: a count of rooms made per UTC day, kept by one Durable Object
 * (RoomCounter in index.ts), using countRoom below. An address is counted by addressKey. No Cloudflare APIs here, so it
 * is unit-tested (limits.test.ts).
 *
 * Card files the same way: FILE_LIMIT in wrangler.jsonc per address, and a daily byte budget for the whole server
 * (FILES_MB_PER_DAY, see filesBudget) that RoomCounter counts with countBytes. A room's one alarm both ends it and
 * cleans up its files: nextAlarm picks when.
 */

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
 * Card files the whole server takes a UTC day (MB) when FILES_MB_PER_DAY isn't set (or isn't a number). Small on
 * purpose: Free plan CPU time and rows written per upload aren't measured yet, and storage is shared by every room.
 */
export const FILES_MB_PER_DAY = 300;
/** One address (addressKey) may upload this share of the day's budget, and one IPv6 /48 (networkKey) this one. */
export const ADDRESS_FILE_SHARE = 1 / 4;
export const NETWORK_FILE_SHARE = 1 / 2;
/** A card file no current card uses is deleted this long after (one got ready and never sent: after its upload). */
export const FILE_IDLE_MS = 10 * 60_000;

export const TOO_MANY_FILES = 'Too many files — wait a minute';
export const FILES_OFF = "This buzzer server doesn't take files";
export const FILES_BUSY_TODAY = "The buzzer server isn't taking files right now — try again tomorrow";
export const TOO_MANY_FILES_TODAY = 'Too many files from here today — try again tomorrow';

/** The daily budget in bytes from the FILES_MB_PER_DAY setting: its default when missing or not a number; 0 is off. */
export function filesBudget(setting: unknown): number {
  const mb = typeof setting === 'number' ? setting : typeof setting === 'string' && setting.trim() ? Number(setting) : NaN;
  return Math.floor((Number.isFinite(mb) && mb >= 0 ? mb : FILES_MB_PER_DAY) * 1024 * 1024);
}

/** Today's card file bytes (day: YYYY-MM-DD, UTC); by: per address key and per networkKey. */
export interface DayBytes {
  day: string;
  bytes: number;
  by?: Record<string, number>;
}

/**
 * n more bytes of card files now, from address key `who`, with a budget of `cap` bytes a day? The count to save, or
 * 'off' (the budget is 0), 'busy' (it would go over today's budget) or 'address' (over this address's share, or its
 * network's). A new UTC day starts from 0.
 */
export function countBytes(
  saved: DayBytes | null | undefined,
  now: number,
  who: string,
  n: number,
  cap: number,
): DayBytes | 'off' | 'busy' | 'address' {
  if (cap <= 0) return 'off';
  const day = utcDay(now);
  const today = saved?.day === day ? saved : undefined;
  const used = today?.bytes ?? 0;
  const mine = today?.by?.[who] ?? 0;
  const net = networkKey(who);
  const ours = net ? (today?.by?.[net] ?? 0) : 0;
  if (used + n > cap) return 'busy';
  if (mine + n > cap * ADDRESS_FILE_SHARE || (net && ours + n > cap * NETWORK_FILE_SHARE)) return 'address';
  return { day, bytes: used + n, by: { ...today?.by, [who]: mine + n, ...(net ? { [net]: ours + n } : {}) } };
}

/**
 * n bytes countBytes counted for `who` today that weren't stored after all, taken off again (never below 0): the count
 * to save, or null when there's nothing to take off (another UTC day began since).
 */
export function uncountBytes(saved: DayBytes | null | undefined, now: number, who: string, n: number): DayBytes | null {
  if (!saved || saved.day !== utcDay(now) || !(n > 0)) return null;
  const by = { ...saved.by };
  for (const k of [who, networkKey(who)]) if (k && by[k] !== undefined) by[k] = Math.max(0, by[k] - n);
  return { day: saved.day, bytes: Math.max(0, saved.bytes - n), ...(saved.by ? { by } : {}) };
}

/** What is left of today's budget (bytes). */
export function bytesLeft(saved: DayBytes | null | undefined, now: number, cap: number): number {
  return Math.max(0, cap - (saved?.day === utcDay(now) ? saved.bytes : 0));
}

/**
 * When a room's alarm should go off next: the room's end, or a card file's clean-up (FILE_IDLE_MS after no card used
 * it), whichever comes first. Never before now.
 */
export function nextAlarm(end: number, files: Record<string, { unusedSince?: number }> | null | undefined, now: number): number {
  let at = end;
  for (const f of Object.values(files ?? {})) if (f.unusedSince !== undefined) at = Math.min(at, f.unusedSince + FILE_IDLE_MS);
  return Math.max(now, at);
}
