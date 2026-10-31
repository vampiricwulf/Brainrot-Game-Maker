// The game kept to resume, as the ▶ Play screen names it ("Sample game · Jeopardy! (round 2 of 5) · Ann $400, Bob $200
// · saved 2:41 AM"), and whether Start game would throw anything away by replacing it. Pure: keptgame.test.ts.
import { formatPoints, roundName, type Game, type Session } from '../lib/model';
import { score } from '../lib/session';

type Kept = Pick<Session, 'scoreLog' | 'used' | 'currentClue' | 'currentRound' | 'phase' | 'rollLog'> & Partial<Pick<Session, 'actionLog'>>;

/** What a step changes when it only changes the players (reordered, renamed or removed in 👥 Players, the picker). */
const ROSTER = new Set(['players', 'removedPlayers', 'currentPickerId']);

/** A step (not undone) that changed more than the players: an RPG's moves, stats or items, a board game's tokens. */
function playedStep(e: { before: string }): boolean {
  try {
    return Object.keys(JSON.parse(e.before) as object).some((k) => !ROSTER.has(k));
  } catch {
    return false;
  }
}

/**
 * Something Start game would lose by replacing the kept game: points given, a tile played (or open), a spin or a roll (a
 * board game's turns), a round past the first, or a step of play (an RPG's party moved, a player knocked out, stats or
 * items changed; a token moved by hand). A game only started (its intro, the board, the players changed) has none: it's
 * replaced without a question.
 */
export function keptProgress(session: Kept): boolean {
  return (
    session.scoreLog.some((e) => !e.undone) ||
    Object.keys(session.used ?? {}).length > 0 ||
    !!session.currentClue ||
    session.currentRound > 0 ||
    session.phase === 'final' ||
    session.phase === 'tiebreaker' ||
    !!session.rollLog?.length ||
    !!session.actionLog?.some(playedStep)
  );
}

/** Where the kept game is: its round's name, and "round 2 of 5" (left out with one round). */
export function keptRound(game: Pick<Game, 'rounds'>, session: Pick<Session, 'currentRound' | 'phase'>): { name: string; at: string } {
  if (session.phase === 'tiebreaker') return { name: 'the tiebreaker', at: '' };
  const r = game.rounds[session.currentRound];
  if (!r) return { name: '', at: '' };
  return { name: roundName(r, session.currentRound), at: game.rounds.length > 1 ? `round ${session.currentRound + 1} of ${game.rounds.length}` : '' };
}

/**
 * The kept game's scores, highest first ("Ann $400, Bob $200"), the first `most` then "+2 more"; nothing while every
 * score is 0. A blank name reads as it plays ("Player 2").
 */
export function keptScores(game: Pick<Game, 'settings'>, session: Pick<Session, 'players' | 'scoreLog' | 'removedPlayers'>, most = 4): string {
  const noun = game.settings.buzzTeams ? 'Team' : 'Player';
  const list = session.players.map((p, i) => ({ name: p.name.trim() || `${noun} ${i + 1}`, s: score(session as Session, p.id) }));
  if (!list.some((p) => p.s !== 0)) return '';
  const top = [...list].sort((a, b) => b.s - a.s);
  const shown = top
    .slice(0, most)
    .map((p) => `${p.name} ${formatPoints(p.s, game.settings.currencySymbol)}`)
    .join(', ');
  return top.length > most ? `${shown} +${top.length - most} more` : shown;
}

/** When it was saved: the time today ("2:41 AM"), else the day too ("Oct 30, 2:41 AM"). */
export function savedWhen(at: number, now = Date.now()): string {
  const d = new Date(at);
  if (d.toDateString() === new Date(now).toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
