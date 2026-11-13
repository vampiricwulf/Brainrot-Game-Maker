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

/**
 * The Final's verdict on this seat, once the stream shows it: "✔ Right! +$1,200", "✘ Wrong −$2,000" (no amount for 0).
 * (A word joiner keeps the sign on the amount's line.)
 */
export function verdictLine(v: { right: boolean; delta: number }, sym: string): string {
  const amount = v.delta ? ` ${v.delta > 0 ? '+' : '−'}\u2060${money(Math.abs(v.delta), sym)}` : '';
  return `${v.right ? '✔ Right!' : '✘ Wrong'}${amount}`;
}

/** What a phone knows of passing on the clue (PhoneView.pass), and whether its seat is a team. */
type PassNow = { passed?: boolean; by?: string; byYou?: boolean; can?: boolean; all?: boolean };

/** The Pass button's words: pass ("I won't buzz on this one"), or take the pass back. */
export function passButton(p: PassNow, team: boolean): string {
  if (p.passed) return team ? 'Take back the pass' : 'Take back my pass';
  return team ? 'Pass: our team won’t buzz on this one' : 'Pass: I won’t buzz on this one';
}

/**
 * The buzzer's two lines once this seat passed: who did (a teammate, for a team) over what's going on (someone
 * answering, or everyone passed) or how to buzz after all. Everyone passed never says what comes next: the host may
 * reset the buzzers and give a hint.
 */
export function passedLines(p: PassNow, team: boolean, answering: string | null): { big: string; small: string } {
  const big = !team ? 'You passed' : p.by && !p.byYou ? `${p.by} passed for your team` : 'Your team passed';
  if (p.all && !answering) return { big, small: p.can ? 'Everyone passed · take the pass back to buzz' : 'Everyone passed' };
  return { big, small: answering ?? 'Take the pass back to buzz' };
}

/** The small line for a seat out of the clue (it had its go), with "everyone else passed" once the rest did. */
export function hadGoLine(team: boolean, otherTeam: boolean, all: boolean): string {
  const line = otherTeam ? 'You were on another team for this one' : team ? 'Your team already answered this one' : 'You’ve had your go on this one';
  return all ? `${line} · everyone else passed` : line;
}
