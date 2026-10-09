// Small rules of hosting a board game (Jeopardy-style), kept apart from Play.svelte so they can be tested: when the
// countdown stops, how score pops are worded and where they go.
import type { Pop } from '../lib/live';
import { compactPoints, formatPoints, wordSymbol, type Player, type ScoreEvent } from '../lib/model';
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
      out.push({ text: `${p.name} ${amount(delta)}`, who: p.name, amount: amount(delta), color: p.color, playerId: p.id });
      continue;
    }
    const everyone = list.length === players.length && players.length > 2;
    const names = nameList(list.map((e) => players.find((p) => p.id === e.playerId)!.name));
    // Too many names to read in one pop: how many instead.
    const who = everyone ? 'Everyone' : names.length > 40 ? `${list.length} players` : names;
    out.push({ text: `${who} ${amount(delta)}`, who, amount: amount(delta), color: groupColor });
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
  const plate = plateWidth(count, reserve, width);
  const total = count * plate + gap * (count - 1);
  return 24 + (inner - total) / 2 + index * (plate + gap) + plate / 2;
}

/** How wide each plate on the score bar is (see plateCenter). */
export function plateWidth(count: number, reserve = 0, width = 1920): number {
  const inner = width - 48 - reserve;
  return Math.min(count <= 4 ? 420 : 320, (inner - 18 * (count - 1)) / Math.max(1, count));
}

/** About how wide a score is at the smallest size scores shrink to (22px): a wide digit ≈ 0.62em; ",", "." or a space ≈ 0.3em. */
const scoreWidth = (s: string) => [...s].reduce((w, c) => w + (c === ',' || c === '.' || c === ' ' ? 0.3 : 0.62), 0) * 22;

/**
 * A score as its plate shows it: the whole number when it fits at the smallest size scores shrink to, else shortened
 * ("$1.2B": cut down, never rounded up), so the number on stream is never one cut off in the middle ("$999,999,…").
 * `width` is the bar's (the scores-only window's is narrower while its countdown is up); `pad` the score's padding each
 * side (ScoreBar's .score: 24px on a pill plate, else 8px).
 */
export function plateScore(n: number, sym: string, count: number, reserve = 0, width = 1920, pad = 8): string {
  return plateForm(n, sym, count, reserve, width, pad).text;
}

/** plateScore's pick, and whether it had to leave the game's symbol off (`dropped`). */
function plateForm(n: number, sym: string, count: number, reserve: number, width: number, pad: number): { text: string; dropped: boolean } {
  // The score's room: the plate less its borders (4px a side), its padding and the 4px kept for the digits' shadow.
  const room = plateWidth(count, reserve, width) - 12 - 2 * pad;
  // Shorter and shorter until one fits (many players: narrow plates): "1,200 pts" → "1,200" → "1.2K" → "1K". A word
  // symbol goes before any digits do; "$" only at the very end.
  const word = wordSymbol(sym);
  const bare = word ? '' : sym;
  const forms = [formatPoints(n, sym), formatPoints(n, bare), compactPoints(n, sym, 1000), compactPoints(n, bare, 1000), compactPoints(n, bare, 1000, 0), compactPoints(n, '', 1000, 0)];
  let k = forms.findIndex((s) => scoreWidth(s) <= room);
  if (k < 0) k = forms.length - 1;
  // (Forms 0 and 2 have a word symbol; forms 0-4 a front one: "$", "R$", "🧠".)
  return { text: forms[k], dropped: !!sym.trim() && (word ? k !== 0 && k !== 2 : k === forms.length - 1) };
}

/**
 * Every plate's score on one bar (as plateScore), with the symbol on all of them or on none, so the bar reads as one
 * set ("1.2K | 800 | 2K", not "$1K | 800 | $2K"): once one plate has to drop it, they all do, each keeping the digits
 * that fit.
 */
export function plateScores(scores: number[], sym: string, reserve = 0, width = 1920, pad = 8): string[] {
  const own = scores.map((n) => plateForm(n, sym, scores.length, reserve, width, pad));
  // (By the form each plate picked, not by its text matching the no-symbol one: with a symbol of two or more characters
  // "R$1K" can be too wide where "1.2K" fits, so a plate showing "1K" differs from its plain "1.2K".)
  if (!own.some((f) => f.dropped)) return own.map((f) => f.text);
  return scores.map((n) => plateScore(n, '', scores.length, reserve, width, pad));
}
