// Small rules of hosting a board game (Jeopardy-style), kept apart from Play.svelte so they can be tested: when the
// countdown stops, how score pops are worded and where they go.
import type { Pop } from '../lib/live';
import { formatPoints, type Player, type ScoreEvent } from '../lib/model';
import { nameList } from '../lib/session';

/**
 * The countdown has done its job: a right answer during a clue (or the tiebreaker), or the answer going up. A wrong
 * answer leaves it running (someone else may still answer).
 */
export function stopsTimer(phase: string, what: 'right' | 'wrong' | 'reveal'): boolean {
  if (what === 'wrong') return false;
  return phase === 'clue' || phase === 'tiebreaker' || (what === 'reveal' && phase === 'final');
}

/**
 * The score pops for one award: one pop per player when one player scored, else ONE pop for the group ("Everyone
 * +$200", "Ann, Bo & Cy +$200"). Players who got a different amount (a deduction stopped at 0) get their own pops.
 */
export function groupPops(events: ScoreEvent[], players: Player[], sym: string, groupColor: string): Omit<Pop, 'id'>[] {
  const byDelta = new Map<number, ScoreEvent[]>();
  for (const e of events) {
    if (!players.some((p) => p.id === e.playerId)) continue;
    byDelta.set(e.delta, [...(byDelta.get(e.delta) ?? []), e]);
  }
  const amount = (d: number) => `${d > 0 ? '+' : ''}${formatPoints(d, sym)}`;
  const out: Omit<Pop, 'id'>[] = [];
  for (const [delta, list] of byDelta) {
    if (list.length === 1) {
      const p = players.find((x) => x.id === list[0].playerId)!;
      out.push({ text: `${p.name} ${amount(delta)}`, color: p.color, playerId: p.id });
      continue;
    }
    const everyone = list.length === players.length && players.length > 2;
    const who = everyone ? 'Everyone' : nameList(list.map((e) => players.find((p) => p.id === e.playerId)!.name));
    out.push({ text: `${who} ${amount(delta)}`, color: groupColor });
  }
  return out;
}

/**
 * Where a player's plate sits on the score bar (its centre, in stage pixels from the left), matching ScoreBar's
 * layout: plates share the width (at most 420px each with up to 4 players, 320px with more), 18px apart, centred
 * between 24px margins (the right one grows by `reserve`).
 */
export function plateCenter(count: number, index: number, reserve = 0, width = 1920): number {
  const gap = 18;
  const inner = width - 48 - reserve;
  const plate = Math.min(count <= 4 ? 420 : 320, (inner - gap * (count - 1)) / count);
  const total = count * plate + gap * (count - 1);
  return 24 + (inner - total) / 2 + index * (plate + gap) + plate / 2;
}
