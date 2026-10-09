/**
 * Limits on making rooms, so nobody can use up the Workers Free plan's daily quotas for everyone. Per address: the
 * Workers Rate Limiting binding (NEW_ROOM_LIMIT in wrangler.jsonc, 6 a minute), and ADDRESS_ROOMS a UTC day (and
 * NETWORK_ROOMS for an IPv6 /48). For the whole server: a count of rooms made per UTC day, kept by one Durable Object
 * (RoomCounter in index.ts), using countRoom below. An address is counted by addressKey. No Cloudflare APIs here, so it
 * is unit-tested (limits.test.ts).
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
