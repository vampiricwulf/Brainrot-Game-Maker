/**
 * Limits on making rooms, so nobody can use up the Workers Free plan's daily quotas for everyone. Per address: the
 * Workers Rate Limiting binding (NEW_ROOM_LIMIT in wrangler.jsonc, 6 a minute). For the whole server: a count of rooms
 * made per UTC day, kept by one Durable Object (RoomCounter in index.ts), using countRoom below. No Cloudflare APIs
 * here, so it is unit-tested (limits.test.ts).
 */

/** Rooms made per UTC day, at most. A game night makes one; this leaves plenty for a busy day. */
export const DAILY_ROOMS = 1000;

export const TOO_MANY_ROOMS = 'Too many new rooms — wait a minute';
export const BUSY_TODAY = 'The buzzer server is busy today — try again tomorrow';

/** Today's count (day: YYYY-MM-DD, UTC). */
export interface DayCount {
  day: string;
  count: number;
}

export const utcDay = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** One more room now? The count to save, or null when today's cap is reached (a new UTC day starts from 0). */
export function countRoom(saved: DayCount | null | undefined, now: number, cap = DAILY_ROOMS): DayCount | null {
  const day = utcDay(now);
  const count = saved?.day === day ? saved.count : 0;
  return count >= cap ? null : { day, count: count + 1 };
}
