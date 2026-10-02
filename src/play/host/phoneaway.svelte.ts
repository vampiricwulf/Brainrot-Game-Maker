/**
 * Phone buzzers: whose phone dropped (it held their seat, and none is connected for it now), and since when. The host
 * panel's chips show 📵 on them, the phones list "phone offline 0:12". Only while the room itself is reachable (the
 * room's list of phones is stale otherwise, and would say they all dropped).
 */
import { untrack } from 'svelte';
import { remote } from '../../lib/remote.svelte';

/** Seat id → when its phone was first seen gone (ms). */
const since = $state<Record<string, number>>({});

/** The seats whose phone is away now (each had one, none of its phones is connected). */
function awayNow(): string[] {
  if (remote.status !== 'online') return [];
  const seats = new Set(remote.phones.map((p) => p.seatId).filter((id): id is string => !!id));
  return [...seats].filter((id) => !remote.phones.some((p) => p.seatId === id && p.connected));
}

/** Keeps the "since when" up to date while the host panel is up (call it from a component). */
export function watchPhonesAway(): void {
  $effect(() => {
    const away = awayNow();
    untrack(() => {
      const now = Date.now();
      for (const id of away) if (!since[id]) since[id] = now;
      for (const id of Object.keys(since)) if (!away.includes(id)) delete since[id];
    });
  });
}

/** When this seat's phone dropped (ms), or null while it's connected (or has none). */
export function phoneAwaySince(seatId: string): number | null {
  return since[seatId] ?? null;
}

/** "0:12": how long a phone has been away, at `now`. */
export function awayFor(at: number, now: number): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
