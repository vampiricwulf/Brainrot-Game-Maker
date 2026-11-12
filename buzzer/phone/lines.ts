/**
 * Lines the phone page shows that come from numbers alone (no page here, so they're unit-tested: lines.test.ts).
 */

/** Points as the game shows them: a word like "pts" goes after the number, $ or 🧠 in front. */
export function money(n: number, sym: string): string {
  const pts = Math.abs(n).toLocaleString();
  return `${n < 0 ? '−' : ''}${/^\p{L}+\.?$/u.test(sym.trim()) ? `${pts} ${sym.trim()}` : sym + pts}`;
}

/** How long the host can be away before the note says how long (and that the seat is kept). */
export const HOST_AWAY_SAY_MS = 60_000;

/**
 * The note while the host's connection is gone, `ms` after it went: at first that it dropped, then (it may not come
 * back: a closed tab, a show that's over) how long, in whole minutes, and that nothing needs doing.
 */
export function hostAwayLine(ms: number): string {
  if (ms < HOST_AWAY_SAY_MS) return 'The host’s connection dropped: waiting for them…';
  const min = Math.floor(ms / 60_000);
  const away = min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;
  return `The host has been away ${away}. Your seat is kept: this page picks up by itself when they’re back.`;
}
